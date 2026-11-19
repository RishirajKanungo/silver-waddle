// core.component: step through one sword hit, from the Attack state to the HP bar, node by node.
// core.component_lab: a playable room where components are added to and removed from objects.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, theme, rect, text, type Input } from '../game';
import { FigureLayout, Slider, Toggle, usePlayer, SegControl } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { type Box, type Facing, slide, moveToward2, faceFrom, drawChar, drawFloor, drawWall, drawShadow, dirAnim, frameAt, hpBar, overlap, boxOutline, tag, sfx } from './common';
import { SHEETS, drawFrame } from '../game';

// =============================================================================== core.component
interface Step {
  node: string[]; // highlighted nodes
  edge?: string; // highlighted edge id
  md: string;
  code: string;
  stop?: boolean;
}

const NODES: Record<string, { x: number; y: number; w: number; label: string; sub: string }> = {
  attack: { x: 60, y: 40, w: 104, label: 'Attack', sub: 'State (Kai)' },
  hitbox: { x: 60, y: 128, w: 104, label: 'Hitbox', sub: 'Area2D, layer 5' },
  hurtbox: { x: 262, y: 128, w: 104, label: 'Hurtbox', sub: 'Area2D, mask 16' },
  character: { x: 262, y: 216, w: 104, label: 'Character', sub: '_on_hurt(hit)' },
  health: { x: 262, y: 300, w: 104, label: 'HealthComponent', sub: 'damage(amount)' },
  bar: { x: 464, y: 300, w: 104, label: 'HealthBar', sub: 'ProgressBar (UI)' },
  machine: { x: 464, y: 216, w: 104, label: 'StateMachine', sub: 'transition_to()' },
};
const EDGES: Record<string, { d: string; label: string; lx: number; ly: number; anchor?: 'start' | 'middle' | 'end' }> = {
  prep: { d: 'M60,56 L60,110', label: 'prepare(), set_active(true)', lx: 68, ly: 86, anchor: 'start' },
  enter: { d: 'M112,128 L208,128', label: 'area_entered', lx: 160, ly: 120 },
  hurt: { d: 'M262,144 L262,198', label: 'hurt(hit)', lx: 270, ly: 176, anchor: 'start' },
  damage: { d: 'M262,232 L262,282', label: 'damage(amount)', lx: 270, ly: 262, anchor: 'start' },
  changed: { d: 'M314,300 L410,300', label: 'health_changed', lx: 362, ly: 292 },
  trans: { d: 'M314,216 L410,216', label: 'transition_to', lx: 362, ly: 208 },
  died: { d: 'M300,284 C330,262 330,240 320,232', label: 'died', lx: 336, ly: 262, anchor: 'start' },
};

function buildSteps(dmg: number, hp: number, maxHp: number, invincible: boolean, maskMissing: boolean): Step[] {
  const after = Math.max(hp - dmg, 0);
  const s: Step[] = [
    {
      node: ['attack', 'hitbox'],
      edge: 'prep',
      md: `Kai's <b>Attack</b> state enters. <code>hitbox.prepare(character, facing_vector)</code> makes a fresh HitData: amount ${dmg}, knockback (120, 0), source Kai. The hitbox shape is still disabled.`,
      code: `func prepare(source: Node, dir: Vector2) -> void:\n\thit = HitData.new()\n\thit.amount = damage\n\thit.knockback = dir.normalized() * knockback_speed\n\thit.source = source`,
    },
    {
      node: ['hitbox'],
      md: `0.08 s (5 ticks) into the swing, the state calls <code>hitbox.set_active(true)</code>. At the end of the frame the shape is enabled and the physics server sees it overlap the skeleton's Hurtbox.`,
      code: `func set_active(on: bool) -> void:\n\t_shape.set_deferred("disabled", not on)`,
    },
  ];
  if (maskMissing) {
    s.push({
      node: ['hitbox', 'hurtbox'],
      edge: 'enter',
      stop: true,
      md: `<b>Nothing happens.</b> The Hurtbox's mask does not contain layer 5 (value 16), so the physics server never reports the overlap. No signal, no damage: the sword passes through.`,
      code: `# Hurtbox Inspector: Collision → Mask\n# needs layer 5 (player_hitbox) ticked: collision_mask & 16 != 0`,
    });
    return s;
  }
  s.push({
    node: ['hurtbox'],
    edge: 'enter',
    md: `The Hurtbox is <code>monitoring</code> with mask 16; the Hitbox is <code>monitorable</code> on layer 5 (16). The overlap begins, so the physics step emits <code>area_entered(hitbox)</code> on the Hurtbox, once.`,
    code: `func _ready() -> void:\n\tarea_entered.connect(_on_area_entered)`,
  });
  if (invincible) {
    s.push({
      node: ['hurtbox'],
      stop: true,
      md: `<b>The chain stops here.</b> <code>invincible</code> is true (a dash, a cutscene), so the Hurtbox returns without emitting. The overlap has already begun, so <code>area_entered</code> will not fire again during this swing.`,
      code: `func _on_area_entered(area: Area2D) -> void:\n\tif invincible or not (area is Hitbox):\n\t\treturn  # <- here`,
    });
    return s;
  }
  s.push({
    node: ['hurtbox', 'character'],
    edge: 'hurt',
    md: `The area is a Hitbox and the Hurtbox is not invincible, so it emits <code>hurt(hit)</code> with the Hitbox's HitData. It does not know what it belongs to; the Character connected to the signal in its <code>_ready()</code>.`,
    code: `func _on_area_entered(area: Area2D) -> void:\n\tif invincible or not (area is Hitbox):\n\t\treturn\n\thurt.emit((area as Hitbox).hit)`,
  });
  s.push({
    node: ['character', 'health'],
    edge: 'damage',
    md: `<code>Character._on_hurt(hit)</code> runs and calls <code>health.damage(${dmg})</code>.`,
    code: `func _on_hurt(hit: HitData) -> void:\n\thealth.damage(hit.amount)`,
  });
  s.push({
    node: ['health', 'bar'],
    edge: 'changed',
    md: `HealthComponent: <code>health = maxi(${hp} - ${dmg}, 0) = ${after}</code>, then <code>health_changed.emit(${after}, ${maxHp})</code>. The HealthBar's handler sets <code>value = ${after}</code>.`,
    code: `health = maxi(health - amount, 0)\nhealth_changed.emit(health, max_health)\nif health == 0:\n\tdied.emit()`,
  });
  if (after > 0)
    s.push({
      node: ['character', 'machine'],
      edge: 'trans',
      md: `Back in <code>_on_hurt</code>: health is above 0, so <code>velocity = hit.knockback</code> and <code>state_machine.transition_to("Hurt")</code>. The Hurt state slides the knockback out under friction for 0.25 s.`,
      code: `\tif health.health <= 0:\n\t\treturn\n\tvelocity = hit.knockback\n\tstate_machine.transition_to("Hurt")`,
    });
  else {
    s.push({
      node: ['health', 'character', 'machine'],
      edge: 'died',
      md: `Health reached 0, so <code>died</code> fired inside <code>damage()</code>, before it returned. <code>_on_died</code> calls <code>transition_to("Dead")</code>; the Dead state switches the Hurtbox's monitoring off (deferred) and plays <code>die</code>.`,
      code: `func _on_died() -> void:\n\tstate_machine.transition_to("Dead")`,
    });
    s.push({
      node: ['character'],
      md: `Execution returns to <code>_on_hurt</code>, which sees <code>health.health <= 0</code> and returns early, so it does not overwrite Dead with Hurt. Order matters: the check is after <code>damage()</code> for exactly this reason.`,
      code: `\thealth.damage(hit.amount)\n\tif health.health <= 0:\n\t\treturn  # _on_died already switched to Dead`,
    });
  }
  return s;
}

export function ComponentChain({ spec }: { spec: VizSpec }) {
  void spec;
  const [dmg, setDmg] = useState(3);
  const [hp, setHp] = useState(12);
  const [inv, setInv] = useState(false);
  const [mask, setMask] = useState(false);
  const steps = useMemo(() => buildSteps(dmg, hp, 12, inv, mask), [dmg, hp, inv, mask]);
  const { i, controls } = usePlayer(steps.length, { interval: 1600 });
  const st = steps[Math.min(i, steps.length - 1)];
  const cv = useRef<HTMLCanvasElement>(null);
  const after = Math.max(hp - dmg, 0);
  const landed = !inv && !mask;
  const healthStep = steps.findIndex((s) => s.edge === 'changed');
  const shownHp = landed && healthStep >= 0 && i >= healthStep ? after : hp;
  const dead = shownHp === 0;

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    drawFloor(ctx, 160, 64, 'dungeon');
    const swinging = i >= 0;
    const active = i >= 1 && !(steps[i]?.stop && false);
    const kx = 52, sx = 84;
    const knock = landed && !dead && steps[i]?.edge === 'trans' ? 6 : 0;
    drawShadow(ctx, kx, 54);
    drawChar(ctx, 'hero', 'attack_side', 0, kx, 54, { frame: frameAt('hero', 'attack_side', active ? 0.4 : 0.1) });
    drawShadow(ctx, sx + knock, 54);
    const hurtNow = landed && i >= healthStep && healthStep >= 0;
    drawChar(ctx, 'skeleton', dead ? 'die' : hurtNow ? 'hurt' : 'idle', 0, sx + knock, 54, { flip: true, frame: dead ? frameAt('skeleton', 'die', 0.99) : undefined, flash: hurtNow && steps[i]?.edge === 'changed' ? 0.9 : 0 });
    hpBar(ctx, sx + knock, 22, shownHp / 12, 20);
    // boxes: Kai's hitbox (red when enabled) and the skeleton's hurtbox (blue)
    if (swinging) boxOutline(ctx, [kx + 5, 38, 14, 12], active ? '#ff5a4a' : 'rgba(255,90,74,0.4)', active ? 'rgba(255,90,74,0.25)' : undefined);
    boxOutline(ctx, [sx + knock - 6, 34, 12, 18], dead ? 'rgba(90,160,255,0.3)' : '#5aa0ff');
  }, [i, steps, landed, dead, shownHp, healthStep]);

  const on = (n: string) => st.node.includes(n);
  return (
    <FigureLayout
      side={
        <>
          <Slider label="hit.amount" value={dmg} min={1} max={12} step={1} onChange={setDmg} />
          <Slider label="health before" value={hp} min={1} max={12} step={1} onChange={setHp} />
          <Toggle label="Hurtbox invincible" value={inv} onChange={setInv} />
          <Toggle label="Mask missing layer 5" value={mask} onChange={setMask} />
          <div className="arch-panel arch-hitcard">
            <div className="arch-panel-title">HitData</div>
            <div className="arch-row"><span className="k">amount</span><span className="v">{dmg}</span></div>
            <div className="arch-row"><span className="k">knockback</span><span className="v">(120, 0)</span></div>
            <div className="arch-row"><span className="k">stagger</span><span className="v">1.0</span></div>
            <div className="arch-row"><span className="k">source</span><span className="v">Kai</span></div>
            <div className="arch-row"><span className="k">health</span><span className="v">{shownHp} / 12</span></div>
          </div>
        </>
      }
      below={
        <div className="arch-below-full">
          {controls}
          <div className={'arch-step' + (st.stop ? ' stop' : '')} dangerouslySetInnerHTML={{ __html: `${i + 1}. ${st.md}` }} />
          <CodeBlock code={st.code} compact />
        </div>
      }
    >
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <canvas ref={cv} width={160} height={64} style={{ width: '100%', maxWidth: 400, imageRendering: 'pixelated', borderRadius: 4 }} aria-label="Kai swings at a skeleton" />
        <svg className="arch-diagram" viewBox="0 0 520 330" role="img" aria-label="signal chain from hitbox to health bar">
          <defs>
            <marker id="arch-c-ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" className="arch-arrow" />
            </marker>
            <marker id="arch-c-ah2" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" className="arch-arrow-on" />
            </marker>
          </defs>
          <text x={6} y={16} className="arch-small">Kai</text>
          <text x={318} y={104} textAnchor="end" className="arch-small">Skeleton</text>
          <text x={514} y={192} textAnchor="end" className="arch-small">listeners</text>
          {Object.entries(EDGES).map(([id, e]) => {
            const hot = st.edge === id;
            const visible = id !== 'died' || dead;
            if (!visible) return null;
            return (
              <g key={id + (hot ? i : '')}>
                <path d={e.d} className={'arch-edge' + (hot ? ' flash' : '')} markerEnd={hot ? 'url(#arch-c-ah2)' : 'url(#arch-c-ah)'} style={hot && st.stop ? { stroke: 'var(--bad)' } : undefined} />
                <text x={e.lx} y={e.ly} textAnchor={e.anchor ?? 'middle'} className={'arch-edge-label' + (hot ? ' flash' : '')}>
                  {e.label}
                </text>
              </g>
            );
          })}
          {Object.entries(NODES).map(([id, n]) => (
            <g key={id} className={'arch-node' + (on(id) ? (st.stop ? ' bad on' : ' on') : '')}>
              <rect x={n.x - n.w / 2} y={n.y - 16} width={n.w} height={32} rx={6} />
              <text x={n.x} y={n.y - 2} textAnchor="middle" style={{ fontSize: 11 }}>
                {n.label}
              </text>
              <text x={n.x} y={n.y + 11} textAnchor="middle" className="arch-small" style={on(id) ? { fill: 'currentColor', opacity: 0.85 } : undefined}>
                {n.sub}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </FigureLayout>
  );
}

// =============================================================================== core.component_lab
type Comp = 'health' | 'hurtbox' | 'hitbox';
interface Ent {
  id: 'crate' | 'slime' | 'post';
  name: string;
  root: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  comps: Record<Comp, boolean>;
  flash: number;
  dead: number; // seconds since broken (0 = alive)
  t: number;
  hop: number;
  rest: number;
  touching: boolean;
}
const LW = 320, LH = 180;
const LWALLS: Box[] = [
  [0, 0, LW, 16],
  [0, LH - 12, LW, 12],
  [0, 0, 12, LH],
  [LW - 12, 0, 12, LH],
];
const START: Record<Ent['id'], [number, number]> = { crate: [110, 70], slime: [220, 110], post: [120, 140] };
const mkEnt = (id: Ent['id']): Ent => ({
  id,
  name: id === 'crate' ? 'Crate' : id === 'slime' ? 'Slime' : 'TrainingPost',
  root: id === 'slime' ? 'Character' : 'StaticBody2D',
  x: START[id][0],
  y: START[id][1],
  vx: 0,
  vy: 0,
  hp: id === 'slime' ? 6 : 4,
  maxHp: id === 'slime' ? 6 : 4,
  comps: id === 'post' ? { health: false, hurtbox: false, hitbox: false } : id === 'crate' ? { health: true, hurtbox: true, hitbox: false } : { health: true, hurtbox: true, hitbox: true },
  flash: 0,
  dead: 0,
  t: 0,
  hop: 0,
  rest: 1,
  touching: false,
});

export function ComponentLab({ spec }: { spec: VizSpec }) {
  void spec;
  const ents = useRef<Ent[]>([mkEnt('crate'), mkEnt('slime'), mkEnt('post')]).current;
  const kai = useRef({ x: 60, y: 110, vx: 0, vy: 0, fx: 1, fy: 0, facing: 'side' as Facing, flip: false, t: 0, state: 'Idle', time: 0, hp: 10, hitThisSwing: new Set<string>(), flash: 0 }).current;
  const [sel, setSel] = useState<Ent['id']>('crate');
  const [, force] = useState(0);
  const [log, setLog] = useState<{ s: string; c: string }[]>([{ s: 'Swing at the crate, the slime and the post.', c: 'muted' }]);
  const [boxes, setBoxes] = useState(true);
  const logRef = useRef(log);
  const push = (s: string, c = '') => {
    logRef.current = [...logRef.current.slice(-7), { s, c }];
    setLog(logRef.current);
  };

  const hitboxOf = (): Box => {
    // HitboxPivot rotated to facing; a 14×12 box 12 px ahead of the body centre
    const cx = kai.x + kai.fx * 12, cy = kai.y - 8 + kai.fy * 10;
    return [cx - 7, cy - 6, 14, 12];
  };
  const hurtOf = (e: Ent): Box => (e.id === 'crate' ? [e.x - 8, e.y - 14, 16, 14] : e.id === 'slime' ? [e.x - 7, e.y - 10, 14, 10] : [e.x - 6, e.y - 22, 12, 22]);
  const contactOf = (e: Ent): Box => (e.id === 'crate' ? [e.x - 9, e.y - 15, 18, 16] : e.id === 'slime' ? [e.x - 6, e.y - 9, 12, 9] : [e.x - 7, e.y - 23, 14, 24]);
  const kaiHurt = (): Box => [kai.x - 6, kai.y - 18, 12, 18];

  const update = (dt: number, input: Input) => {
    const [ix, iy] = input.vector();
    kai.t += dt;
    kai.time += dt;
    kai.flash = Math.max(0, kai.flash - dt * 6);
    const face = (dx: number, dy: number) => {
      const f = faceFrom(dx, dy);
      if (!f) return;
      const n = Math.hypot(dx, dy);
      kai.fx = dx / n;
      kai.fy = dy / n;
      kai.facing = f.facing;
      if (f.facing === 'side') kai.flip = f.flip;
    };
    const go = (s: string) => {
      kai.state = s;
      kai.time = 0;
      kai.t = 0;
    };
    if (kai.state === 'Idle' || kai.state === 'Move') {
      if (input.justPressed('attack')) {
        face(ix, iy);
        go('Attack');
        kai.hitThisSwing.clear();
      } else if (input.justPressed('dash')) {
        face(ix, iy);
        go('Dash');
        kai.vx = kai.fx * 260;
        kai.vy = kai.fy * 260;
      } else {
        face(ix, iy);
        moveToward2(kai, ix * 90, iy * 90, (ix || iy ? 900 : 1200) * dt);
        kai.state = ix || iy ? 'Move' : 'Idle';
      }
    } else if (kai.state === 'Dash') {
      if (kai.time >= 0.15) go('Idle');
    } else if (kai.state === 'Attack') {
      moveToward2(kai, 0, 0, 1200 * dt);
      if (kai.time >= 0.3) go('Idle');
    } else if (kai.state === 'Hurt') {
      moveToward2(kai, 0, 0, 900 * dt);
      if (kai.time >= 0.25) go('Idle');
    }
    slide(kai, [...LWALLS, ...ents.filter((e) => e.id !== 'slime' && !e.dead).map((e) => [e.x - 8, e.y - 6, 16, 6] as Box)], dt);

    // Kai's hitbox, live 0.08–0.16 s into the swing
    const active = kai.state === 'Attack' && kai.time >= 0.08 && kai.time < 0.16;
    for (const e of ents) {
      e.t += dt;
      e.flash = Math.max(0, e.flash - dt * 6);
      if (e.dead) {
        e.dead += dt;
        if (e.dead > 2) {
          const fresh = mkEnt(e.id);
          Object.assign(e, { ...fresh, comps: e.comps });
          push(`${e.name} respawned`, 'muted');
        }
        continue;
      }
      if (active && overlap(hitboxOf(), hurtOf(e)) && !kai.hitThisSwing.has(e.id)) {
        kai.hitThisSwing.add(e.id);
        if (!e.comps.hurtbox) push(`sword overlaps ${e.name}: no Hurtbox, no signal`, 'muted');
        else {
          push(`${e.name}/Hurtbox.hurt(hit) amount 2`, 'sig');
          sfx(true, 'sfx_hit', 0.35);
          e.flash = 1;
          if (!e.comps.health) push(`  nothing connected to hurt: no HealthComponent`, 'bad');
          else {
            e.hp = Math.max(0, e.hp - 2);
            push(`  health_changed(${e.hp}, ${e.maxHp})`, 'sig');
            if (e.id === 'slime') {
              e.vx = kai.fx * 120;
              e.vy = kai.fy * 120;
            }
            if (e.hp === 0) {
              push(`  died → ${e.id === 'crate' ? 'break, drop loot' : 'Dead state'}`, 'sig');
              e.dead = 0.0001;
            }
          }
        }
      }
      // the slime hops about; knockback slides out under friction
      if (e.id === 'slime') {
        if (e.hop > 0) {
          e.hop -= dt;
          if (e.hop <= 0) (e.vx = 0), (e.vy = 0), (e.rest = 0.7 + Math.random() * 0.7);
        } else if (Math.hypot(e.vx, e.vy) > 1) moveToward2(e, 0, 0, 900 * dt);
        else {
          e.rest -= dt;
          if (e.rest <= 0) {
            const a = Math.random() * Math.PI * 2;
            const tx = Math.min(280, Math.max(40, START.slime[0] + Math.cos(a) * 40)), ty = Math.min(150, Math.max(40, START.slime[1] + Math.sin(a) * 30));
            const d = Math.hypot(tx - e.x, ty - e.y) || 1;
            e.vx = ((tx - e.x) / d) * 80;
            e.vy = ((ty - e.y) / d) * 80;
            e.hop = 0.3;
            e.t = 0;
          }
        }
        slide(e, LWALLS, dt, 12, 6);
      }
      // the object's own Hitbox (contact damage) against Kai's Hurtbox
      const touching = e.comps.hitbox && overlap(contactOf(e), kaiHurt());
      if (touching && !e.touching) {
        if (kai.state === 'Dash') push(`Kai/Hurtbox: ${e.name} hitbox ignored (dash i-frames)`, 'muted');
        else if (kai.state !== 'Hurt') {
          push(`Kai/Hurtbox.hurt(hit) from ${e.name}`, 'sig');
          kai.hp = Math.max(0, kai.hp - 1);
          kai.flash = 1;
          const d = Math.hypot(kai.x - e.x, kai.y - e.y) || 1;
          kai.vx = ((kai.x - e.x) / d) * 160;
          kai.vy = ((kai.y - e.y) / d) * 160;
          kai.state = 'Hurt';
          kai.time = 0;
          sfx(true, 'sfx_hurt', 0.35);
          if (kai.hp === 0) {
            push('Kai died → reset to 10 HP', 'bad');
            kai.hp = 10;
          }
        }
      }
      e.touching = touching;
    }
    if (Math.round(kai.t * 60) % 6 === 0) force((n) => n + 1);
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    drawFloor(ctx, LW, LH, 'dungeon');
    for (const [x, y, w, h] of LWALLS) drawWall(ctx, x, y, w, h);
    const sorted = [...ents].sort((a, b) => a.y - b.y);
    for (const e of sorted) {
      if (e.dead > 0 && (e.id !== 'slime' || e.dead > 0.6)) {
        if (e.id === 'crate' && e.dead < 1.5 && SHEETS['objects']) drawFrame(ctx, 'objects', SHEETS['objects'].tiles?.pot_shards ?? 0, e.x - 8, e.y - 16);
        continue;
      }
      drawShadow(ctx, e.x, e.y, 7, 2.5);
      if (e.id === 'crate') {
        if (SHEETS['objects']) drawFrame(ctx, 'objects', SHEETS['objects'].tiles?.crate ?? 0, e.x - 8, e.y - 16, { flash: e.flash, flashColor: '#ffffff' });
        else rect(ctx, e.x - 8, e.y - 16, 16, 16, e.flash > 0.4 ? '#fff' : '#9c5e3c');
        if (e.comps.hitbox) for (let k = 0; k < 4; k++) rect(ctx, e.x - 7 + k * 4, e.y - 18, 2, 2, '#c0bed4');
      } else if (e.id === 'slime') {
        const anim = e.dead ? 'die' : e.flash > 0.3 ? 'hurt' : e.hop > 0 ? 'hop' : 'idle';
        const lift = e.hop > 0 ? Math.sin((1 - e.hop / 0.3) * Math.PI) * 5 : 0;
        drawChar(ctx, 'slime', anim, e.dead ? e.dead : e.t, e.x, e.y - lift, { flash: e.flash, frame: e.dead ? frameAt('slime', 'die', e.dead / 0.6) : undefined });
      } else {
        // a training post: a wooden pole with a straw head
        rect(ctx, e.x - 2, e.y - 22, 4, 22, '#64392c');
        rect(ctx, e.x - 6, e.y - 26, 12, 8, '#cf9058');
        rect(ctx, e.x - 8, e.y - 16, 16, 3, '#9c5e3c');
      }
      if (e.comps.health) hpBar(ctx, e.x, e.y - (e.id === 'post' ? 32 : 24), e.hp / e.maxHp, 16);
      if (e.id === sel) {
        const ay = e.y - (e.id === 'post' ? 40 : 32);
        for (let k = 0; k < 3; k++) rect(ctx, e.x - 2 + k, ay + k, 5 - 2 * k, 1, '#fff09a');
      }
      if (boxes) {
        if (e.comps.hurtbox) boxOutline(ctx, hurtOf(e), '#5aa0ff');
        if (e.comps.hitbox) boxOutline(ctx, contactOf(e), '#ff5a4a');
      }
    }
    drawShadow(ctx, kai.x, kai.y);
    const base = kai.state === 'Attack' ? 'attack' : kai.state === 'Dash' ? 'dash' : kai.state === 'Hurt' ? 'hurt' : kai.state === 'Move' ? 'walk' : 'idle';
    const anim = dirAnim('hero', base, kai.facing);
    const fr = base === 'attack' ? frameAt('hero', anim, kai.time / 0.3) : base === 'dash' ? frameAt('hero', anim, kai.time / 0.15) : undefined;
    drawChar(ctx, 'hero', anim, kai.t, kai.x, kai.y, { flip: kai.flip, frame: fr, flash: kai.flash });
    if (boxes) {
      boxOutline(ctx, kaiHurt(), '#5aa0ff');
      if (kai.state === 'Attack') {
        const live = kai.time >= 0.08 && kai.time < 0.16;
        boxOutline(ctx, hitboxOf(), live ? '#ff5a4a' : 'rgba(255,90,74,0.35)', live ? 'rgba(255,90,74,0.3)' : undefined);
      }
    }
    // Kai's HP, top-left
    const th = theme(ctx.canvas);
    void th;
    tag(ctx, `Kai HP ${kai.hp}/10`, 46, 30);
  };

  const e = ents.find((x) => x.id === sel)!;
  const toggle = (c: Comp) => {
    e.comps = { ...e.comps, [c]: !e.comps[c] };
    push(`${e.comps[c] ? 'added' : 'removed'} ${e.name}/${c === 'health' ? 'HealthComponent' : c === 'hurtbox' ? 'Hurtbox' : 'Hitbox'}`, 'muted');
    if (c === 'health' && e.comps.health) e.hp = e.maxHp;
    force((n) => n + 1);
  };
  const compName: Record<Comp, string> = { health: 'HealthComponent', hurtbox: 'Hurtbox', hitbox: 'Hitbox (contact)' };

  return (
    <FigureLayout
      side={
        <>
          <SegControl
            label="select"
            value={sel}
            options={[
              { v: 'crate', label: 'crate' },
              { v: 'slime', label: 'slime' },
              { v: 'post', label: 'post' },
            ]}
            onChange={(v) => setSel(v)}
          />
          <div className="arch-panel arch-tree">
            <div className="arch-panel-title">scene tree</div>
            <div>
              {e.name} ({e.root})
            </div>
            <div className="fixed">{e.id === 'slime' ? 'AnimatedSprite2D' : 'Sprite2D'}</div>
            <div className="fixed">CollisionShape2D</div>
            {e.id === 'slime' && <div className="fixed">StateMachine</div>}
            {(['health', 'hurtbox', 'hitbox'] as Comp[]).map((c) => (
              <label key={c}>
                <input type="checkbox" checked={e.comps[c]} onChange={() => toggle(c)} />
                {compName[c]}
              </label>
            ))}
          </div>
          <Toggle label="show hitboxes and hurtboxes" value={boxes} onChange={setBoxes} />
        </>
      }
      below={
        <div className="arch-log" aria-live="polite">
          {log.map((l, k) => (
            <div key={k} className={l.c}>
              {l.s}
            </div>
          ))}
        </div>
      }
    >
      <GameCanvas
        width={LW}
        height={LH}
        update={update}
        draw={draw}
        touchButtons={['up', 'down', 'left', 'right', 'attack', 'dash']}
        keysHint={<Keys items={[['WASD / arrows', 'move'], ['J', 'attack'], ['K', 'dodge']]} />}
        label="component lab: swing at objects and change their components"
      />
    </FigureLayout>
  );
}
