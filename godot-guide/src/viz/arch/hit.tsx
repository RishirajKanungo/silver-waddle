// combat.hit: the hit lab. Kai's three-hit string (k01-1's Attack state and AttackData, frame for
// frame) against a skeleton training dummy, with every piece of k01's feedback on a toggle and a
// scrolling frame meter under the game.
//   mode 'frames': frame data and the combo window; no juice
//   mode 'feel'  : hitstop (per-node or Engine.time_scale), trauma shake, knockback
//   mode 'full'  : everything, including flash, sparks, damage numbers and layered sound
import { useEffect, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, theme, rect, text, type Input } from '../game';
import { FigureLayout, Slider, Toggle, SegControl } from '../kit';
import { type Box, type Facing, slide, moveToward2, faceFrom, drawChar, drawFloor, drawWall, drawShadow, dirAnim, frameAt, hpBar, overlap, boxOutline, Shake, type Fx, stepFx, drawFx, sfx, tag } from './common';

export interface AttackStep {
  name: string;
  startup: number;
  active: number;
  recovery: number;
  cancel: number;
  dodge: number;
  dmg: number;
  kb: number;
  lunge: number;
}
/** Kai's string: the three AttackData resources of k01-1. */
export const COMBO: AttackStep[] = [
  { name: 'attack_1', startup: 5, active: 3, recovery: 14, cancel: 10, dodge: 8, dmg: 4, kb: 80, lunge: 60 },
  { name: 'attack_2', startup: 6, active: 3, recovery: 15, cancel: 11, dodge: 9, dmg: 5, kb: 100, lunge: 60 },
  { name: 'attack_3', startup: 9, active: 4, recovery: 24, cancel: 99, dodge: 13, dmg: 9, kb: 180, lunge: 120 },
];
export const total = (a: AttackStep) => a.startup + a.active + a.recovery;
export const phaseOf = (a: AttackStep, f: number) => (f < a.startup ? 1 : f < a.startup + a.active ? 2 : 3);
export const PHASE_COL = ['', '#e8a33d', '#e0483e', '#4c86d6'];

const W = 320, H = 180;
const WALLS: Box[] = [
  [0, 0, W, 16],
  [0, H - 12, W, 12],
  [0, 0, 12, H],
  [W - 12, 0, 12, H],
];
const BUFFER = 9; // frames (buffer_time 0.15 s)
const HEAVY = 8;
const HOME: [number, number] = [196, 112];
const N_PAST = 110, N_FUT = 40;

type Mode = 'frames' | 'feel' | 'full';
type KState = 'Idle' | 'Move' | 'Attack' | 'Dash';
// frame meter codes
const C_IDLE = 0, C_FROZEN = 4, C_DASH = 5, C_MOVE = 6;

interface Settings {
  hitstop: number;
  method: 'node' | 'time_scale';
  shake: boolean;
  knockback: boolean;
  flash: boolean;
  sparks: boolean;
  numbers: boolean;
  sound: boolean;
  boxes: boolean;
}
const DEFAULTS: Record<Mode, Settings> = {
  frames: { hitstop: 0, method: 'node', shake: false, knockback: true, flash: false, sparks: false, numbers: false, sound: false, boxes: true },
  feel: { hitstop: 4, method: 'node', shake: true, knockback: true, flash: false, sparks: false, numbers: false, sound: false, boxes: false },
  full: { hitstop: 4, method: 'node', shake: true, knockback: true, flash: true, sparks: true, numbers: true, sound: true, boxes: false },
};

export function HitLab({ spec }: { spec: VizSpec }) {
  const mode = (spec.mode as Mode) ?? 'full';
  const [set, setSet] = useState<Settings>(DEFAULTS[mode]);
  const S = useRef(set);
  S.current = set;
  const upd = (p: Partial<Settings>) => setSet((s) => ({ ...s, ...p }));

  const kai = useRef({ x: 170, y: 112, vx: 0, vy: 0, fx: 1, fy: 0, facing: 'side' as Facing, flip: false, t: 0, state: 'Idle' as KState, time: 0, step: 0, frame: 0, hitThisStep: false, freeze: 0, ageA: 99, ageD: 99, wantA: false, wantD: false, ix: 0, iy: 0 }).current;
  const dummy = useRef({ x: HOME[0], y: HOME[1], vx: 0, vy: 0, hp: 60, state: 'Idle', time: 0, t: 0, flash: 0, freeze: 0, sinceHit: 9 }).current;
  const bat = useRef({ t: 0 }).current;
  const world = useRef({ globalFreeze: 0, shake: new Shake(), fx: [] as Fx[], hits: 0, frozenTicks: 0, last: '' }).current;
  // frame meter: ring of the last N_PAST ticks
  const meter = useRef({ code: new Uint8Array(N_PAST), press: new Uint8Array(N_PAST), hit: new Uint8Array(N_PAST), start: new Uint8Array(N_PAST), head: 0 }).current;
  const meterCv = useRef<HTMLCanvasElement>(null);
  const [ro, setRo] = useState({ state: 'Idle', step: 0, frame: 0, hp: 60, hits: 0, frozen: 0, last: '' });
  const tick = useRef(0);

  useEffect(() => {
    // reset settings if the figure is reused with another mode
    setSet(DEFAULTS[mode]);
  }, [mode]);

  const record = (code: number, press: boolean, hit: boolean, start: boolean) => {
    const i = meter.head;
    meter.code[i] = code;
    meter.press[i] = press ? 1 : 0;
    meter.hit[i] = hit ? 1 : 0;
    meter.start[i] = start ? 1 : 0;
    meter.head = (i + 1) % N_PAST;
  };

  const face = (dx: number, dy: number) => {
    const f = faceFrom(dx, dy);
    if (!f) return;
    const n = Math.hypot(dx, dy);
    kai.fx = dx / n;
    kai.fy = dy / n;
    kai.facing = f.facing;
    if (f.facing === 'side') kai.flip = f.flip;
  };
  const hitboxOf = (): Box => {
    const cx = kai.x + kai.fx * 13, cy = kai.y - 9 + kai.fy * 9;
    return [cx - 8, cy - 7, 16, 14];
  };
  const hurtOf = (): Box => [dummy.x - 6, dummy.y - 22, 12, 22];

  const startStep = (step: number) => {
    // Attack._start_step
    kai.step = step;
    kai.frame = 0;
    kai.hitThisStep = false;
    kai.wantA = false;
    face(kai.ix, kai.iy);
    const d = COMBO[step];
    kai.vx = kai.fx * d.lunge;
    kai.vy = kai.fy * d.lunge;
    kai.t = 0;
  };

  const onHit = () => {
    // Character._on_hurt on the dummy, then HitFeedback._on_hit_landed
    const s = S.current;
    const d = COMBO[kai.step];
    const heavy = d.dmg >= HEAVY;
    kai.hitThisStep = true;
    dummy.hp = Math.max(0, dummy.hp - d.dmg);
    dummy.sinceHit = 0;
    world.hits++;
    world.last = `${d.dmg}${heavy ? ' (heavy)' : ''}`;
    if (s.flash) dummy.flash = 1;
    if (s.knockback) {
      dummy.vx = kai.fx * d.kb;
      dummy.vy = kai.fy * d.kb;
    }
    dummy.state = 'Hurt';
    dummy.time = 0;
    const frames = s.hitstop === 0 ? 0 : heavy ? s.hitstop + 3 : s.hitstop;
    if (frames > 0) {
      if (s.method === 'node') {
        kai.freeze = frames;
        dummy.freeze = frames;
      } else world.globalFreeze = frames;
    }
    if (s.shake) world.shake.add(heavy ? 0.45 : 0.2);
    const ax = dummy.x + (kai.x - dummy.x) * 0.3, ay = dummy.y - 12 + (kai.y - dummy.y) * 0.3;
    if (s.sparks) world.fx.push({ kind: 'spark', x: ax, y: ay, t: 0, life: 0.27 });
    if (s.numbers) world.fx.push({ kind: 'num', x: dummy.x + (Math.random() * 6 - 3), y: dummy.y - 34, t: 0, life: 0.5, val: d.dmg, big: heavy });
    sfx(s.sound, 'sfx_hit', 0.45);
    if (heavy) sfx(s.sound, 'sfx_crit', 0.45);
  };

  const update = (dt: number, input: Input) => {
    const s = S.current;
    const [ix, iy] = input.vector();
    kai.ix = ix;
    kai.iy = iy;
    // PlayerController runs even during a freeze (it is not a child that is frozen in our model of
    // input buffering: presses are remembered), so record presses first
    const pressed = input.justPressed('attack');
    if (pressed) (kai.wantA = true), (kai.ageA = 0);
    else (kai.ageA += 1), (kai.wantA = kai.wantA && kai.ageA <= BUFFER);
    if (input.justPressed('dash')) (kai.wantD = true), (kai.ageD = 0);
    else (kai.ageD += 1), (kai.wantD = kai.wantD && kai.ageD <= BUFFER);

    if (world.globalFreeze > 0) {
      // Engine.time_scale = 0: nothing advances, not even the camera or the bat
      world.globalFreeze--;
      world.frozenTicks++;
      record(C_FROZEN, pressed, false, false);
      return;
    }
    world.shake.step(dt, 1.5, 6, 4, 2);
    stepFx(world.fx, dt);
    bat.t += dt;

    let landed = false, started = false;
    if (kai.freeze > 0) {
      kai.freeze--;
      world.frozenTicks++;
      record(C_FROZEN, pressed, false, false);
    } else {
      kai.t += dt;
      kai.time += dt;
      if (kai.state === 'Idle' || kai.state === 'Move') {
        if (kai.wantA) {
          kai.state = 'Attack';
          startStep(0);
          started = true;
        } else if (kai.wantD) {
          kai.wantD = false;
          face(ix, iy);
          kai.state = 'Dash';
          kai.time = 0;
          kai.vx = kai.fx * 260;
          kai.vy = kai.fy * 260;
        } else {
          face(ix, iy);
          moveToward2(kai, ix * 90, iy * 90, (ix || iy ? 900 : 1200) * dt);
          kai.state = ix || iy ? 'Move' : 'Idle';
        }
        slide(kai, WALLS, dt);
      } else if (kai.state === 'Dash') {
        slide(kai, WALLS, dt);
        if (kai.time >= 0.15) (kai.state = 'Idle'), (kai.time = 0);
      } else {
        // Attack.physics_update
        kai.frame++;
        const d = COMBO[kai.step];
        moveToward2(kai, 0, 0, 1200 * dt);
        slide(kai, WALLS, dt);
        if (kai.frame === d.startup - 1) sfx(s.sound, 'sfx_swing', 0.35);
        if (kai.frame >= d.cancel && kai.wantA && kai.step + 1 < COMBO.length) {
          startStep(kai.step + 1);
          started = true;
        } else if (kai.frame >= d.dodge && kai.wantD) {
          kai.wantD = false;
          face(ix, iy);
          kai.state = 'Dash';
          kai.time = 0;
          kai.vx = kai.fx * 260;
          kai.vy = kai.fy * 260;
        } else if (kai.frame >= total(d)) {
          kai.state = 'Idle';
          kai.time = 0;
        }
      }
      // the hitbox is on during active frames (keyed in the AnimationPlayer); area_entered fires once
      if (kai.state === 'Attack') {
        const d = COMBO[kai.step];
        if (phaseOf(d, kai.frame) === 2 && !kai.hitThisStep && overlap(hitboxOf(), hurtOf())) {
          onHit();
          landed = true;
        }
      }
      const code = kai.state === 'Attack' ? phaseOf(COMBO[kai.step], kai.frame) : kai.state === 'Dash' ? C_DASH : kai.state === 'Move' ? C_MOVE : C_IDLE;
      record(landed && kai.freeze > 0 ? 2 : code, pressed, landed, started);
    }

    // the dummy: Hurt slides out the knockback, then it walks back to its post
    if (dummy.freeze > 0) dummy.freeze--;
    else {
      dummy.t += dt;
      dummy.time += dt;
      dummy.sinceHit += dt;
      if (s.flash) dummy.flash = Math.max(0, dummy.flash - dt / 0.12);
      if (dummy.state === 'Hurt') {
        moveToward2(dummy, 0, 0, 900 * dt);
        if (dummy.time >= 0.25 && dummy.vx === 0 && dummy.vy === 0) (dummy.state = 'Idle'), (dummy.time = 0);
      } else {
        const dx = HOME[0] - dummy.x, dy = HOME[1] - dummy.y, dd = Math.hypot(dx, dy);
        if (dd > 2 && dummy.sinceHit > 0.8) moveToward2(dummy, (dx / dd) * 30, (dy / dd) * 30, 600 * dt);
        else moveToward2(dummy, 0, 0, 600 * dt);
        dummy.state = Math.hypot(dummy.vx, dummy.vy) > 1 ? 'Walk' : 'Idle';
      }
      slide(dummy, WALLS, dt);
      if (dummy.sinceHit > 1.5) dummy.hp = 60;
    }
    if (++tick.current % 5 === 0) setRo({ state: kai.state, step: kai.step, frame: kai.frame, hp: dummy.hp, hits: world.hits, frozen: world.frozenTicks, last: world.last });
  };

  const drawMeter = () => {
    const c = meterCv.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const th = theme(c);
    const cw = 4, top = 18, bh = 18;
    ctx.fillStyle = th.bg2;
    ctx.fillRect(0, 0, c.width, c.height);
    const col = (code: number) => (code >= 1 && code <= 3 ? PHASE_COL[code] : code === C_FROZEN ? '#8a5cc8' : code === C_DASH ? '#36a0c8' : code === C_MOVE ? 'rgba(140,150,170,0.55)' : th.line);
    for (let k = 0; k < N_PAST; k++) {
      const i = (meter.head + k) % N_PAST;
      const x = k * cw;
      ctx.fillStyle = col(meter.code[i]);
      ctx.fillRect(x, top, cw - 1, bh);
      if (meter.start[i]) {
        ctx.fillStyle = th.fg;
        ctx.fillRect(x, top - 4, 1, bh + 8);
      }
      if (meter.press[i]) {
        ctx.fillStyle = th.fg;
        ctx.fillRect(x + 1, top - 8, 2, 5);
      }
      if (meter.hit[i]) {
        ctx.fillStyle = '#eebb3e';
        ctx.beginPath();
        ctx.moveTo(x + 1.5, top + bh + 2);
        ctx.lineTo(x + 5, top + bh + 6);
        ctx.lineTo(x + 1.5, top + bh + 10);
        ctx.lineTo(x - 2, top + bh + 6);
        ctx.fill();
      }
    }
    const nowX = N_PAST * cw;
    // the rest of the current attack, projected (no hitstop), faint
    if (kai.state === 'Attack') {
      const d = COMBO[kai.step];
      ctx.globalAlpha = 0.35;
      for (let f = kai.frame + 1, k = 0; f < total(d) && k < N_FUT; f++, k++) {
        ctx.fillStyle = PHASE_COL[phaseOf(d, f)];
        ctx.fillRect(nowX + k * cw, top, cw - 1, bh);
      }
      ctx.globalAlpha = 1;
      // combo input window: presses from cancel - BUFFER to total - 1 continue the string
      if (kai.step + 1 < COMBO.length) {
        const a = d.cancel - BUFFER, b = total(d) - 1;
        const xa = nowX + (a - kai.frame) * cw, xb = nowX + (b - kai.frame + 1) * cw;
        ctx.strokeStyle = th.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(Math.max(0, xa), top + bh + 14);
        ctx.lineTo(xb, top + bh + 14);
        ctx.stroke();
        ctx.fillStyle = th.accent;
        ctx.font = '11px ' + getComputedStyle(c).getPropertyValue('--mono');
        ctx.textAlign = 'left';
        ctx.fillText(`combo window for hit ${kai.step + 2} (frames ${a}..${b})`, Math.max(2, Math.min(xa, c.width - 262)), top + bh + 28);
      }
    }
    ctx.fillStyle = th.fg;
    ctx.fillRect(nowX, 4, 1, c.height - 8);
    ctx.font = '11px ' + getComputedStyle(c).getPropertyValue('--mono');
    ctx.fillStyle = th.muted;
    ctx.textAlign = 'right';
    ctx.fillText('now', nowX - 3, 12);
    ctx.textAlign = 'left';
    ctx.fillText('1 column = 1 tick (16.7 ms)', 2, 12);
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const s = S.current;
    ctx.save();
    ctx.translate(world.shake.ox, world.shake.oy);
    drawFloor(ctx, W, H, 'dungeon');
    for (const [x, y, w, h] of WALLS) drawWall(ctx, x, y, w, h);
    // the post the dummy returns to
    rect(ctx, HOME[0] - 5, HOME[1] - 1, 10, 2, 'rgba(255,255,255,0.12)');
    if (mode !== 'frames') {
      const bx = 268 + Math.sin(bat.t * 1.7) * 22, by = 44 + Math.sin(bat.t * 3.4) * 10;
      drawShadow(ctx, bx, by + 22, 4, 1.5, 0.2);
      drawChar(ctx, 'bat', 'fly', bat.t, bx, by);
    }
    const ents = [
      { y: dummy.y, f: () => {
        drawShadow(ctx, dummy.x, dummy.y);
        const anim = dummy.state === 'Hurt' ? 'hurt' : dummy.state === 'Walk' ? 'walk' : 'idle';
        drawChar(ctx, 'skeleton', anim, dummy.t, dummy.x, dummy.y, { flip: kai.x < dummy.x, flash: s.flash ? dummy.flash : 0 });
        hpBar(ctx, dummy.x, dummy.y - 30, dummy.hp / 60, 20);
      } },
      { y: kai.y, f: () => {
        drawShadow(ctx, kai.x, kai.y);
        const base = kai.state === 'Attack' ? 'attack' : kai.state === 'Dash' ? 'dash' : kai.state === 'Move' ? 'walk' : 'idle';
        const anim = dirAnim('hero', base, kai.facing);
        let fr: number | undefined;
        if (kai.state === 'Attack') {
          // the AnimationPlayer keys art frame 0 (startup), 1 (active), 2 then 3 (recovery)
          const d = COMBO[kai.step], ph = phaseOf(d, kai.frame);
          const k = ph === 1 ? 0 : ph === 2 ? 0.3 : kai.frame < d.startup + d.active + d.recovery / 2 ? 0.55 : 0.8;
          fr = frameAt('hero', anim, k);
        } else if (kai.state === 'Dash') fr = frameAt('hero', anim, kai.time / 0.15);
        drawChar(ctx, 'hero', anim, kai.t, kai.x, kai.y, { flip: kai.flip, frame: fr });
      } },
    ].sort((a, b) => a.y - b.y);
    for (const e of ents) e.f();
    if (s.boxes) {
      boxOutline(ctx, hurtOf(), '#5aa0ff');
      if (kai.state === 'Attack') {
        const live = phaseOf(COMBO[kai.step], kai.frame) === 2;
        boxOutline(ctx, hitboxOf(), live ? '#ff5a4a' : 'rgba(255,90,74,0.35)', live ? 'rgba(255,90,74,0.3)' : undefined);
      }
    }
    drawFx(ctx, world.fx);
    ctx.restore();
    // HUD (not shaken)
    if (kai.state === 'Attack') {
      const d = COMBO[kai.step], ph = phaseOf(d, kai.frame);
      const frozen = kai.freeze > 0 || world.globalFreeze > 0;
      tag(ctx, `hit ${kai.step + 1}  frame ${kai.frame}/${total(d)}  ${frozen ? 'HITSTOP' : ph === 1 ? 'startup' : ph === 2 ? 'ACTIVE' : 'recovery'}`, W / 2, 30, frozen ? '#9aeaee' : ph === 2 ? '#f8925e' : '#ffffff');
    }
    text(ctx, mode === 'frames' ? '' : s.method === 'node' ? 'hitstop: per node' : 'hitstop: Engine.time_scale', 16, H - 16, '#c0bed4');
    drawMeter();
  };

  const d = COMBO[ro.step];
  const ms = (f: number) => `${f} f (${Math.round((f * 1000) / 60)} ms)`;
  return (
    <FigureLayout
      side={
        <>
          {mode !== 'frames' && (
            <>
              <Slider label="hitstop, light hits (frames)" value={set.hitstop} min={0} max={12} step={1} onChange={(v) => upd({ hitstop: v })} />
              <SegControl
                label="method"
                value={set.method}
                options={[
                  { v: 'node', label: 'per node' },
                  { v: 'time_scale', label: 'time_scale' },
                ]}
                onChange={(v) => upd({ method: v })}
              />
              <Toggle label="screen shake (trauma²)" value={set.shake} onChange={(v) => upd({ shake: v })} />
              <Toggle label="knockback" value={set.knockback} onChange={(v) => upd({ knockback: v })} />
            </>
          )}
          {mode === 'full' && (
            <>
              <Toggle label="hit flash" value={set.flash} onChange={(v) => upd({ flash: v })} />
              <Toggle label="hit sparks (fx_hit)" value={set.sparks} onChange={(v) => upd({ sparks: v })} />
              <Toggle label="damage numbers" value={set.numbers} onChange={(v) => upd({ numbers: v })} />
              <Toggle label="sound: swing, hit, crit" value={set.sound} onChange={(v) => upd({ sound: v })} />
            </>
          )}
          {mode === 'frames' && <Toggle label="knockback" value={set.knockback} onChange={(v) => upd({ knockback: v })} />}
          <Toggle label="show hitbox and hurtbox" value={set.boxes} onChange={(v) => upd({ boxes: v })} />
          <div className="arch-panel">
            <div className="arch-panel-title">{ro.state === 'Attack' ? `hit ${ro.step + 1}: ${d.name}` : 'Kai'}</div>
            <div className="arch-row"><span className="k">state</span><span className="v">{ro.state}</span></div>
            {mode === 'frames' ? (
              <>
                <div className="arch-row"><span className="k">startup</span><span className="v">{ms(d.startup)}</span></div>
                <div className="arch-row"><span className="k">active</span><span className="v">{ms(d.active)}</span></div>
                <div className="arch-row"><span className="k">recovery</span><span className="v">{ms(d.recovery)}</span></div>
                <div className="arch-row"><span className="k">cancel_frame</span><span className="v">{d.cancel > 90 ? 'none' : d.cancel}</span></div>
              </>
            ) : (
              <>
                <div className="arch-row"><span className="k">light freeze</span><span className="v">{ms(set.hitstop)}</span></div>
                <div className="arch-row"><span className="k">heavy freeze</span><span className="v">{ms(set.hitstop ? set.hitstop + 3 : 0)}</span></div>
                <div className="arch-row"><span className="k">frozen so far</span><span className="v">{ro.frozen} ticks</span></div>
              </>
            )}
            <div className="arch-row"><span className="k">hits landed</span><span className="v">{ro.hits}</span></div>
            <div className="arch-row"><span className="k">last hit</span><span className="v">{ro.last || '-'}</span></div>
          </div>
        </>
      }
      below={
        <div className="arch-below-full">
          <canvas ref={meterCv} width={600} height={76} className="arch-timeline" aria-label="frame meter: one column per physics tick" />
          <div className="arch-legend">
            <span><i style={{ background: PHASE_COL[1] }} />startup</span>
            <span><i style={{ background: PHASE_COL[2] }} />active</span>
            <span><i style={{ background: PHASE_COL[3] }} />recovery</span>
            <span><i style={{ background: '#8a5cc8' }} />hitstop</span>
            <span><i style={{ background: '#36a0c8' }} />dash</span>
            <span><i style={{ background: 'var(--line)' }} />idle</span>
            <span><i style={{ background: 'rgba(140,150,170,0.55)' }} />walk</span>
            <span>tick above: press · diamond below: hit · tall line: a hit starts</span>
          </div>
        </div>
      }
    >
      <GameCanvas
        width={W}
        height={H}
        update={update}
        draw={draw}
        touchButtons={['up', 'down', 'left', 'right', 'attack', 'dash']}
        keysHint={<Keys items={[['WASD / arrows', 'move'], ['J', 'attack'], ['K', 'dodge']]} />}
        label="hit lab: attack the skeleton with J"
      />
    </FigureLayout>
  );
}
