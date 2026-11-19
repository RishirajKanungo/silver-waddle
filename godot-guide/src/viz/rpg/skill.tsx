// rpg.skill — the ability composer for r02-1. Edit an AbilityData (target type, area shape, cast time,
// costs) and its list of effects, see the .tres Godot would save, and cast it at dummies. Targets are
// collected when the cast starts (AbilityData.collect_targets), the cast counts down like AbilityCaster
// (a hit interrupts an interruptible cast), and effects run in list order on each target, with damage
// going through the r01 pipeline.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, rect, text, line, circle, bar, drawFrame, animFrame, playSound, type Input } from '../game';
import { Slider, SegControl, Toggle, FigureLayout, Btn } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { CHARS, CHAR_IDS, DEFAULT_LOADOUT, ENEMIES, ELEMENTS, ELEMENT_LABEL, STATUSES, StatBlock, applyEnemy, blockFor, calculate, type CharId, type Element, type EnemyId } from './model';

type TargetType = 'SINGLE_ENEMY' | 'ALL_ENEMIES' | 'SINGLE_ALLY' | 'PARTY' | 'SELF';
type AreaType = 'NONE' | 'CIRCLE' | 'LINE' | 'CONE';
type Effect =
  | { type: 'damage'; power: number; element: Element; isMagic: boolean }
  | { type: 'heal'; flat: number; power: number }
  | { type: 'status'; status: string; chance: number }
  | { type: 'pressure'; amount: number };
interface Ability {
  name: string;
  target: TargetType;
  area: AreaType;
  areaSize: number;
  coneDeg: number;
  castTime: number;
  interruptible: boolean;
  atb: number;
  mp: number;
  effects: Effect[];
}
const TARGETS: TargetType[] = ['SINGLE_ENEMY', 'ALL_ENEMIES', 'SINGLE_ALLY', 'PARTY', 'SELF'];
const AREAS: AreaType[] = ['NONE', 'CIRCLE', 'LINE', 'CONE'];
const PRESETS: Record<string, { caster: CharId; a: Ability }> = {
  'Fire Wave': { caster: 'lyra', a: { name: 'Fire Wave', target: 'SINGLE_ENEMY', area: 'CIRCLE', areaSize: 32, coneDeg: 30, castTime: 0.6, interruptible: true, atb: 1, mp: 8, effects: [{ type: 'damage', power: 1.5, element: 'FIRE', isMagic: true }, { type: 'pressure', amount: 6 }] } },
  'Venom Fang': { caster: 'kai', a: { name: 'Venom Fang', target: 'SINGLE_ENEMY', area: 'NONE', areaSize: 32, coneDeg: 30, castTime: 0, interruptible: true, atb: 1, mp: 0, effects: [{ type: 'damage', power: 1.2, element: 'NONE', isMagic: false }, { type: 'status', status: 'poison', chance: 0.6 }, { type: 'pressure', amount: 8 }] } },
  'Healing Light': { caster: 'lyra', a: { name: 'Healing Light', target: 'PARTY', area: 'NONE', areaSize: 32, coneDeg: 30, castTime: 1, interruptible: true, atb: 2, mp: 18, effects: [{ type: 'heal', flat: 0, power: 1.2 }] } },
  'Shield Bash': { caster: 'bram', a: { name: 'Shield Bash', target: 'SINGLE_ENEMY', area: 'CONE', areaSize: 56, coneDeg: 35, castTime: 0.2, interruptible: false, atb: 1, mp: 0, effects: [{ type: 'damage', power: 1.2, element: 'NONE', isMagic: false }, { type: 'pressure', amount: 30 }] } },
};
const LINE_HALF_WIDTH = 10;
const W = 320, H = 180;

// ------------------------------------------------------------------------------- the dummies
interface Unit {
  name: string;
  sheet: string;
  anim: string;
  x: number;
  y: number;
  flip: boolean;
  block: StatBlock;
  hp: number;
  maxHp: number;
  pressure: number;
  stagger: number; // seconds left staggered
  status: Map<string, { left: number; tick: number }>;
  flash: number;
}
function makeEnemy(id: EnemyId, x: number, y: number, name: string = ENEMIES[id].name): Unit {
  const b = new StatBlock();
  applyEnemy(b, ENEMIES[id]);
  return { name, sheet: id, anim: ENEMIES[id].anim, x, y, flip: true, block: b, hp: b.get('MAX_HP'), maxHp: b.get('MAX_HP'), pressure: 0, stagger: 0, status: new Map(), flash: 0 };
}
function makeAlly(c: CharId, x: number, y: number): Unit {
  const b = blockFor(c, 5, DEFAULT_LOADOUT[c]);
  const max = b.get('MAX_HP');
  return { name: CHARS[c].name, sheet: CHARS[c].sheet, anim: 'idle_side', x, y, flip: false, block: b, hp: Math.round(max * 0.55), maxHp: max, pressure: 0, stagger: 0, status: new Map(), flash: 0 };
}
function freshWorld(caster: CharId) {
  const others = CHAR_IDS.filter((c) => c !== caster);
  return {
    party: [makeAlly(others[0], 46, 66), makeAlly(caster, 78, 98), makeAlly(others[1], 46, 132)],
    enemies: [makeEnemy('slime', 204, 70), makeEnemy('slime', 228, 98), makeEnemy('slime', 204, 128), makeEnemy('skeleton', 276, 100)].map((u, i) => ({ ...u, name: i < 3 ? `Slime ${i + 1}` : 'Skeleton' })),
  };
}

// ------------------------------------------------------------------------- the GDScript mirror
function areaContains(a: Ability, ox: number, oy: number, ax: number, ay: number, px: number, py: number) {
  const dl = Math.hypot(ax - ox, ay - oy) || 1;
  const dx = (ax - ox) / dl, dy = (ay - oy) / dl;
  const vx = px - ox, vy = py - oy;
  switch (a.area) {
    case 'CIRCLE':
      return Math.hypot(px - ax, py - ay) <= a.areaSize;
    case 'LINE': {
      const along = vx * dx + vy * dy;
      const across = Math.abs(vx * dy - vy * dx);
      return along >= 0 && along <= a.areaSize && across <= LINE_HALF_WIDTH;
    }
    case 'CONE': {
      const len = Math.hypot(vx, vy);
      if (len > a.areaSize) return false;
      return (len ? (vx * dx + vy * dy) / len : 0) >= Math.cos((a.coneDeg * Math.PI) / 180);
    }
  }
  return px === ax && py === ay;
}
function collectTargets(a: Ability, caster: Unit, chosen: Unit, candidates: Unit[]) {
  if (a.target === 'SELF') return [caster];
  if (a.target === 'ALL_ENEMIES' || a.target === 'PARTY') return candidates.filter((u) => u.hp > 0 || a.target === 'PARTY');
  if (a.area === 'NONE') return [chosen];
  return candidates.filter((u) => areaContains(a, caster.x, caster.y - 8, chosen.x, chosen.y - 8, u.x, u.y - 8));
}
const targetsAllies = (t: TargetType) => t === 'SINGLE_ALLY' || t === 'PARTY' || t === 'SELF';

// -------------------------------------------------------------------------------------- .tres
const fmtF = (x: number) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
function toTres(a: Ability) {
  const scripts: [string, string][] = [['ability_data', '1_abil'], ['effects/ability_effect', '2_eff']];
  const idOf = (name: string) => {
    let e = scripts.find(([n]) => n === name);
    if (!e) {
      e = [name, `${scripts.length + 1}_${name.split('/').pop()!.slice(0, 4)}`];
      scripts.push(e);
    }
    return e[1];
  };
  const statusRes: [string, string][] = [];
  const subs: string[] = [];
  a.effects.forEach((e, i) => {
    const lines: string[] = [];
    let script = '';
    if (e.type === 'damage') {
      script = idOf('effects/damage_effect');
      if (e.power !== 1) lines.push(`power = ${fmtF(e.power)}`);
      if (e.element !== 'NONE') lines.push(`element = ${ELEMENTS.indexOf(e.element)}`);
      if (e.isMagic) lines.push('is_magic = true');
    } else if (e.type === 'heal') {
      script = idOf('effects/heal_effect');
      if (e.flat) lines.push(`flat = ${e.flat}`);
      if (e.power !== 1) lines.push(`power = ${fmtF(e.power)}`);
    } else if (e.type === 'status') {
      script = idOf('effects/apply_status_effect');
      let s = statusRes.find(([n]) => n === e.status);
      if (!s) {
        s = [e.status, ''];
        statusRes.push(s);
      }
      lines.push(`status = ExtResource("@${e.status}")`);
      if (e.chance !== 1) lines.push(`chance = ${fmtF(e.chance)}`);
    } else {
      script = idOf('effects/pressure_effect');
      if (e.amount !== 10) lines.push(`amount = ${fmtF(e.amount)}`);
    }
    subs.push(`[sub_resource type="Resource" id="Resource_${i + 1}"]\nscript = ExtResource("${script}")${lines.length ? '\n' + lines.join('\n') : ''}`);
  });
  statusRes.forEach((s, k) => (s[1] = `${scripts.length + k + 1}_${s[0]}`));
  let body = subs.join('\n\n');
  for (const [n, id] of statusRes) body = body.split(`@${n}`).join(id);
  const ext = [
    ...scripts.map(([n, id]) => `[ext_resource type="Script" path="res://scripts/resources/${n}.gd" id="${id}"]`),
    ...statusRes.map(([n, id]) => `[ext_resource type="Resource" path="res://resources/statuses/${n}.tres" id="${id}"]`),
  ];
  const res: string[] = ['script = ExtResource("1_abil")', `id = &"${a.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}"`, `display_name = "${a.name}"`];
  if (a.atb !== 1) res.push(`atb_cost = ${a.atb}`);
  if (a.mp) res.push(`mp_cost = ${a.mp}`);
  if (a.target !== 'SINGLE_ENEMY') res.push(`target = ${TARGETS.indexOf(a.target)}`);
  if (a.area !== 'NONE') res.push(`area = ${AREAS.indexOf(a.area)}`);
  if (a.areaSize !== 32) res.push(`area_size = ${fmtF(a.areaSize)}`);
  if (a.area === 'CONE' && a.coneDeg !== 30) res.push(`cone_degrees = ${fmtF(a.coneDeg)}`);
  if (a.castTime) res.push(`cast_time = ${fmtF(a.castTime)}`);
  if (!a.interruptible) res.push('interruptible = false');
  res.push(`effects = Array[ExtResource("2_eff")]([${a.effects.map((_, i) => `SubResource("Resource_${i + 1}")`).join(', ')}])`);
  const steps = ext.length + subs.length + 1;
  return `[gd_resource type="Resource" script_class="AbilityData" load_steps=${steps} format=3]\n\n${ext.join('\n')}\n\n${body}${body ? '\n\n' : ''}[resource]\n${res.join('\n')}\n`;
}
function describe(e: Effect) {
  if (e.type === 'damage') return `${e.isMagic ? 'magic' : 'physical'} damage ×${e.power}, ${ELEMENT_LABEL[e.element]}`;
  if (e.type === 'heal') return e.power ? `heal ${e.flat ? e.flat + ' + ' : ''}×${e.power} magic` : `heal ${e.flat}`;
  if (e.type === 'status') return `${Math.round(e.chance * 100)}% ${STATUSES.find((s) => s.id === e.status)!.name}`;
  return `+${e.amount} pressure`;
}

// -------------------------------------------------------------------------------------- figure
interface Popup {
  x: number;
  y: number;
  s: string;
  c: string;
  t: number;
}
export function AbilityComposer({ spec }: { spec: VizSpec }) {
  const start = PRESETS[(spec.preset as string) ?? 'Fire Wave'] ?? PRESETS['Fire Wave'];
  const [ability, setAbility] = useState<Ability>(start.a);
  const [caster, setCaster] = useState<CharId>(start.caster);
  const [preset, setPreset] = useState<string>((spec.preset as string) ?? 'Fire Wave');
  const world = useRef(freshWorld(start.caster));
  const aim = useRef(1);
  const cast = useRef<{ left: number; total: number; targets: Unit[] } | null>(null);
  const popups = useRef<Popup[]>([]).current;
  const time = useRef(0);
  const [log, setLog] = useState<string[]>([]);
  const tres = useMemo(() => toTres(ability), [ability]);

  const set = (patch: Partial<Ability>) => setAbility((a) => ({ ...a, ...patch }));
  const setEffect = (i: number, e: Effect) => setAbility((a) => ({ ...a, effects: a.effects.map((x, k) => (k === i ? e : x)) }));
  const move = (i: number, d: number) => setAbility((a) => {
    const ef = [...a.effects];
    const j = i + d;
    if (j < 0 || j >= ef.length) return a;
    [ef[i], ef[j]] = [ef[j], ef[i]];
    return { ...a, effects: ef };
  });
  const remove = (i: number) => setAbility((a) => ({ ...a, effects: a.effects.filter((_, k) => k !== i) }));
  const add = (e: Effect) => setAbility((a) => ({ ...a, effects: [...a.effects, e] }));
  const reset = (c = caster) => {
    world.current = freshWorld(c);
    cast.current = null;
    popups.length = 0;
  };
  const casterUnit = () => world.current.party[1];
  const side = () => (targetsAllies(ability.target) ? world.current.party : world.current.enemies);
  const chosen = () => {
    const s = side();
    return s[((aim.current % s.length) + s.length) % s.length];
  };

  const begin = () => {
    if (cast.current) return;
    const targets = collectTargets(ability, casterUnit(), chosen(), side());
    cast.current = { left: ability.castTime, total: ability.castTime, targets };
    playSound('sfx_cast', 0.4);
    if (ability.castTime <= 0) finish();
  };
  const finish = () => {
    const c = cast.current;
    if (!c) return;
    cast.current = null;
    const me = casterUnit();
    const lines: string[] = [];
    for (const t of c.targets) {
      const parts: string[] = [];
      for (const e of ability.effects) {
        if (e.type === 'damage') {
          if (t.hp <= 0) continue;
          const r = calculate(me.block, t.block, e.power, e.element, e.isMagic, t.stagger > 0 ? 1.6 : 1, Math.random());
          t.hp = Math.max(0, Math.min(t.maxHp, t.hp - r.amount));
          t.flash = 1;
          const label = r.elementMult === 0 ? 'Immune' : r.amount < 0 ? `+${-r.amount}` : r.crit ? `${r.amount}!` : String(r.amount);
          popups.push({ x: t.x, y: t.y - 30, s: label, c: r.amount < 0 ? '#7be07b' : r.crit ? '#ffd65a' : r.elementMult === 2 ? '#f8925e' : '#ffffff', t: 0 });
          parts.push(`${r.amount}${r.elementMult === 2 ? ' (weak)' : r.elementMult === 0.5 ? ' (resist)' : ''}${r.crit ? ' crit' : ''}`);
          playSound(r.crit ? 'sfx_crit' : 'sfx_hit', 0.35);
        } else if (e.type === 'heal') {
          const amount = e.flat + Math.round(e.power * me.block.get('MAGIC'));
          t.hp = Math.min(t.maxHp, t.hp + amount);
          popups.push({ x: t.x, y: t.y - 30, s: `+${amount}`, c: '#7be07b', t: 0 });
          parts.push(`healed ${amount}`);
          playSound('sfx_heal', 0.35);
        } else if (e.type === 'status') {
          const st = STATUSES.find((s) => s.id === e.status)!;
          const immune = t.sheet === 'skeleton' && ENEMIES.skeleton.statusImmune.includes(st.id);
          if (immune) parts.push(`${st.name}: immune`);
          else if (Math.random() < e.chance) {
            for (const r of st.removes) t.status.delete(r);
            t.status.set(st.id, { left: st.duration, tick: st.tickInterval });
            t.block.setSource('status:' + st.id, st.mods);
            parts.push(st.name.toLowerCase());
          } else parts.push(`${st.name}: missed the ${Math.round(e.chance * 100)}% roll`);
        } else {
          if (t.stagger <= 0) {
            t.pressure = Math.min(100, t.pressure + e.amount);
            if (t.pressure >= 100) {
              t.stagger = 3;
              t.pressure = 0;
              playSound('sfx_stagger', 0.4);
            }
          }
          parts.push(`+${e.amount} pressure`);
        }
      }
      lines.push(`${t.name}: ${parts.join(', ') || 'nothing'}`);
    }
    setLog([`${ability.name} landed on ${c.targets.length} target${c.targets.length === 1 ? '' : 's'}`, ...lines]);
  };

  const update = (dt: number, input: Input) => {
    time.current += dt;
    if (input.justPressed('left') || input.justPressed('up')) aim.current--;
    if (input.justPressed('right') || input.justPressed('down')) aim.current++;
    if (input.justPressed('attack')) begin();
    if (input.justPressed('dash')) {
      const me = casterUnit();
      me.flash = 1;
      popups.push({ x: me.x, y: me.y - 30, s: 'hit', c: '#ffffff', t: 0 });
      if (cast.current && ability.interruptible) {
        cast.current = null;
        setLog([`${ability.name} interrupted: the caster was hit during the cast`]);
      }
    }
    if (cast.current) {
      cast.current.left -= dt;
      if (cast.current.left <= dt * 0.5) finish();
    }
    for (const u of [...world.current.party, ...world.current.enemies]) {
      u.flash = Math.max(0, u.flash - dt * 4);
      if (u.stagger > 0) u.stagger = Math.max(0, u.stagger - dt);
      for (const [id, s] of [...u.status]) {
        const st = STATUSES.find((x) => x.id === id)!;
        if (st.tickInterval > 0) {
          s.tick -= dt;
          if (s.tick <= dt * 0.5) {
            s.tick += st.tickInterval;
            const amount = Math.max(1, Math.round(u.maxHp * st.tickFraction));
            if (u.hp > 0) {
              u.hp = Math.max(0, u.hp - amount);
              popups.push({ x: u.x + 6, y: u.y - 26, s: String(amount), c: '#b088e6', t: 0 });
            }
          }
        }
        s.left -= dt;
        if (s.left <= dt * 0.5) {
          u.status.delete(id);
          u.block.removeSource('status:' + id);
        }
      }
    }
    for (const p of popups) p.t += dt;
    while (popups.length && popups[0].t > 0.9) popups.shift();
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#3f6b3a';
    ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 16) for (let x = 0; x < W; x += 16) if (((x + y) / 16) % 2 === 0) rect(ctx, x, y, 16, 16, 'rgba(255,255,255,0.03)');
    const me = casterUnit();
    const ch = chosen();
    const tgts = cast.current ? cast.current.targets : collectTargets(ability, me, ch, side());
    // area preview
    const ox = me.x, oy = me.y - 8, ax = ch.x, ay = ch.y - 8;
    ctx.save();
    ctx.globalAlpha = cast.current ? 0.5 : 0.25;
    ctx.fillStyle = targetsAllies(ability.target) ? '#7be07b' : '#f8925e';
    if (ability.target === 'SINGLE_ENEMY' || ability.target === 'SINGLE_ALLY') {
      ctx.beginPath();
      if (ability.area === 'CIRCLE') ctx.arc(ax, ay, ability.areaSize, 0, Math.PI * 2);
      else if (ability.area === 'LINE') {
        const ang = Math.atan2(ay - oy, ax - ox);
        ctx.translate(ox, oy);
        ctx.rotate(ang);
        ctx.rect(0, -LINE_HALF_WIDTH, ability.areaSize, LINE_HALF_WIDTH * 2);
      } else if (ability.area === 'CONE') {
        const ang = Math.atan2(ay - oy, ax - ox), half = (ability.coneDeg * Math.PI) / 180;
        ctx.moveTo(ox, oy);
        ctx.arc(ox, oy, ability.areaSize, ang - half, ang + half);
        ctx.closePath();
      }
      ctx.fill();
    }
    ctx.restore();
    const all = [...world.current.party, ...world.current.enemies];
    all.sort((a, b) => a.y - b.y);
    for (const u of all) {
      const isMe = u === me;
      const anim = u.hp <= 0 && u.sheet === 'slime' ? 'die' : isMe && cast.current ? 'cast' : u.stagger > 0 && u.sheet === 'skeleton' ? 'hurt' : u.anim;
      if (tgts.includes(u)) circle(ctx, u.x, u.y - 1, 9, 'rgba(255,214,90,0.55)');
      drawFrame(ctx, u.sheet, animFrame(u.sheet, anim, u.hp <= 0 ? 1 : time.current), u.x, u.y, { anchored: true, flipH: u.flip, flash: u.flash, alpha: u.hp <= 0 ? 0.4 : 1 });
      bar(ctx, u.x - 10, u.y + 3, 20, 2, u.hp / u.maxHp, u.hp / u.maxHp > 0.3 ? '#56c98d' : '#d84f3c', 'rgba(0,0,0,0.5)');
      if (u.flip) bar(ctx, u.x - 10, u.y + 6, 20, 2, u.stagger > 0 ? 1 : u.pressure / 100, u.stagger > 0 ? '#f8925e' : '#eebb3e', 'rgba(0,0,0,0.5)');
      let sx = u.x - 10;
      for (const id of u.status.keys()) {
        const st = STATUSES.find((s) => s.id === id)!;
        rect(ctx, sx, u.y + 9, 4, 4, st.colour);
        sx += 5;
      }
      if (u.stagger > 0) text(ctx, 'STAGGER', u.x, u.y - 34, '#f8925e', 'center');
    }
    // aim cursor
    line(ctx, ch.x - 4, ch.y - 40, ch.x, ch.y - 35, '#ffffff');
    line(ctx, ch.x + 4, ch.y - 40, ch.x, ch.y - 35, '#ffffff');
    // cast bar
    if (cast.current && cast.current.total > 0) {
      bar(ctx, me.x - 14, me.y - 36, 28, 3, 1 - cast.current.left / cast.current.total, '#9aeaee', 'rgba(0,0,0,0.6)');
      text(ctx, ability.name, me.x, me.y - 39, '#ffffff', 'center');
    }
    for (const p of popups) text(ctx, p.s, p.x, p.y - p.t * 14, p.c, 'center');
    text(ctx, `${ability.name}  ATB ${ability.atb}  MP ${ability.mp}  cast ${ability.castTime.toFixed(1)} s`, 6, 10, '#ffffff');
  };

  const statusIds = STATUSES.map((s) => s.id);
  return (
    <FigureLayout
      side={
        <>
          <label className="rpg-row rpg-small">
            <span className="ctl-label">preset</span>
            <select className="rpg-select" value={preset} onChange={(e) => { const p = PRESETS[e.target.value]; setPreset(e.target.value); setAbility(p.a); setCaster(p.caster); reset(p.caster); }}>
              {Object.keys(PRESETS).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label className="rpg-row rpg-small">
            <span className="ctl-label">display_name</span>
            <input className="rpg-select" value={ability.name} onChange={(e) => set({ name: e.target.value.slice(0, 24) })} style={{ width: 120 }} />
          </label>
          <SegControl label="caster" value={caster} options={CHAR_IDS.map((c) => ({ v: c, label: CHARS[c].name }))} onChange={(c) => { setCaster(c); reset(c); }} />
          <label className="rpg-row rpg-small">
            <span className="ctl-label">target</span>
            <select className="rpg-select" value={ability.target} onChange={(e) => set({ target: e.target.value as TargetType })}>
              {TARGETS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <SegControl label="area" value={ability.area} options={AREAS.map((a) => ({ v: a, label: a.toLowerCase() }))} onChange={(v) => set({ area: v })} />
          {ability.area !== 'NONE' && <Slider label="area_size" value={ability.areaSize} min={8} max={120} step={2} onChange={(v) => set({ areaSize: v })} fmt={(v) => v + ' px'} />}
          {ability.area === 'CONE' && <Slider label="cone_degrees" value={ability.coneDeg} min={5} max={90} step={1} onChange={(v) => set({ coneDeg: v })} fmt={(v) => v + '°'} />}
          <Slider label="cast_time" value={ability.castTime} min={0} max={2} step={0.1} onChange={(v) => set({ castTime: v })} fmt={(v) => v.toFixed(1) + ' s'} />
          <Toggle label="interruptible" value={ability.interruptible} onChange={(v) => set({ interruptible: v })} />
          <SegControl label="atb_cost" value={ability.atb} options={[0, 1, 2].map((v) => ({ v, label: String(v) }))} onChange={(v) => set({ atb: v })} />
          <Slider label="mp_cost" value={ability.mp} min={0} max={40} step={1} onChange={(v) => set({ mp: v })} fmt={(v) => v.toFixed(0)} />
        </>
      }
      below={
        <div className="rpg-row" style={{ alignItems: 'flex-start', width: '100%' }}>
          <div className="rpg-col" style={{ flex: '1 1 260px', maxWidth: 360 }}>
            <div className="rpg-k">effects (applied in order to each target)</div>
            <div className="rpg-effects">
              {ability.effects.map((e, i) => (
                <div key={i} className="rpg-effect rpg-small">
                  <div className="rpg-effect-head">
                    <span>
                      {i + 1}. {e.type === 'damage' ? 'DamageEffect' : e.type === 'heal' ? 'HealEffect' : e.type === 'status' ? 'ApplyStatusEffect' : 'PressureEffect'}
                    </span>
                    <span>
                      <button onClick={() => move(i, -1)} aria-label="move up">↑</button> <button onClick={() => move(i, 1)} aria-label="move down">↓</button> <button onClick={() => remove(i)} aria-label="remove">×</button>
                    </span>
                  </div>
                  {e.type === 'damage' && (
                    <>
                      <Slider label="power" value={e.power} min={0.1} max={4} step={0.1} onChange={(v) => setEffect(i, { ...e, power: v })} fmt={(v) => v.toFixed(1)} />
                      <div className="rpg-row">
                        <select className="rpg-select" value={e.element} onChange={(ev) => setEffect(i, { ...e, element: ev.target.value as Element })} aria-label="element">
                          {ELEMENTS.map((el) => (
                            <option key={el}>{el}</option>
                          ))}
                        </select>
                        <Toggle label="is_magic" value={e.isMagic} onChange={(v) => setEffect(i, { ...e, isMagic: v })} />
                      </div>
                    </>
                  )}
                  {e.type === 'heal' && (
                    <>
                      <Slider label="flat" value={e.flat} min={0} max={300} step={10} onChange={(v) => setEffect(i, { ...e, flat: v })} fmt={(v) => v.toFixed(0)} />
                      <Slider label="power" value={e.power} min={0} max={3} step={0.1} onChange={(v) => setEffect(i, { ...e, power: v })} fmt={(v) => v.toFixed(1)} />
                    </>
                  )}
                  {e.type === 'status' && (
                    <>
                      <select className="rpg-select" value={e.status} onChange={(ev) => setEffect(i, { ...e, status: ev.target.value })} aria-label="status">
                        {statusIds.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                      <Slider label="chance" value={e.chance} min={0.05} max={1} step={0.05} onChange={(v) => setEffect(i, { ...e, chance: v })} fmt={(v) => Math.round(v * 100) + '%'} />
                    </>
                  )}
                  {e.type === 'pressure' && <Slider label="amount" value={e.amount} min={1} max={60} step={1} onChange={(v) => setEffect(i, { ...e, amount: v })} fmt={(v) => v.toFixed(0)} />}
                  <span className="rpg-muted">{describe(e)}</span>
                </div>
              ))}
            </div>
            <div className="rpg-chips">
              <button className="rpg-chip" onClick={() => add({ type: 'damage', power: 1, element: 'NONE', isMagic: false })}>+ damage</button>
              <button className="rpg-chip" onClick={() => add({ type: 'heal', flat: 0, power: 1 })}>+ heal</button>
              <button className="rpg-chip" onClick={() => add({ type: 'status', status: 'poison', chance: 1 })}>+ apply status</button>
              <button className="rpg-chip" onClick={() => add({ type: 'pressure', amount: 10 })}>+ pressure</button>
            </div>
          </div>
          <div style={{ flex: '1 1 300px', minWidth: 0 }}>
            <CodeBlock code={tres} file={`resources/abilities/${ability.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.tres`} lang="tscn" compact />
          </div>
        </div>
      }
    >
      <div className="rpg-col">
        <GameCanvas
          width={W}
          height={H}
          update={update}
          draw={draw}
          touchButtons={['left', 'right', 'attack', 'dash']}
          keysHint={<Keys items={[['← →', 'aim'], ['J', 'cast'], ['K', 'hit the caster']]} />}
          label="ability composer preview: aim with arrow keys, J casts, K hits the caster"
        />
        <div className="rpg-row">
          <Btn primary onClick={begin}>Cast</Btn>
          <Btn onClick={() => { reset(); setLog([]); }}>Reset dummies</Btn>
          <span className="rpg-muted">targets are collected when the cast starts</span>
        </div>
        <div className="rpg-log" aria-live="polite">
          {log.length ? log.map((l, i) => <div key={i} className={i ? '' : 'old'}>{l}</div>) : <div className="old">cast to see what each effect did to each target</div>}
        </div>
      </div>
    </FigureLayout>
  );
}

