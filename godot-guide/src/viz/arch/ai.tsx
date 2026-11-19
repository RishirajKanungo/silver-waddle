// combat.ai: the AI sandbox. Kai in a tile room with enemies driven by a TypeScript copy of k02's
// AIController.
//   mode 'perception': one patrolling skeleton with its vision cone, hearing radius, line-of-sight
//                      ray, memory marker and brain label (idle/patrol/chase/attack/recover)
//   mode 'nav'       : alerted skeletons and slimes chasing Kai, with or without grid pathfinding
//                      (the NavigationAgent2D stand-in) and separation
// combat.ai_steer: seek / flee / arrive / separation on a group of slimes, with the vectors drawn.
import { useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, rect, line, circle, type Input } from '../game';
import { FigureLayout, Slider, Toggle, SegControl, Readout } from '../kit';
import { type Box, type Facing, slide, moveToward2, faceFrom, drawChar, drawFloor, drawWall, drawShadow, dirAnim, frameAt, hpBar, overlap, tag, sfx, astar, lineClear } from './common';

const W = 320, H = 180, COLS = 20, ROWS = 11;
const MAP = [
  '####################',
  '#..................#',
  '#..##.......#####..#',
  '#..##..............#',
  '#........##........#',
  '#........##....##..#',
  '#..####........##..#',
  '#..................#',
  '#.......#####......#',
  '#..................#',
  '####################',
];
const GRID = new Uint8Array(COLS * ROWS);
const WALLS: Box[] = [];
MAP.forEach((row, y) =>
  [...row].forEach((c, x) => {
    if (c === '#') {
      GRID[y * COLS + x] = 1;
      WALLS.push([x * 16, y * 16, 16, 16]);
    }
  }),
);
WALLS.push([0, 176, W, 4]);

type Brain = 'IDLE' | 'PATROL' | 'CHASE' | 'ATTACK' | 'RECOVER';
type Body = 'Idle' | 'Move' | 'Attack' | 'Hurt';
interface Enemy {
  sheet: 'skeleton' | 'slime';
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
  flip: boolean;
  t: number;
  body: Body;
  bodyT: number;
  frame: number;
  brain: Brain;
  brainT: number;
  sinceSensed: number;
  senses: boolean;
  lastX: number;
  lastY: number;
  patrol: number;
  path: [number, number][];
  repath: number;
  hitDone: boolean;
  mx: number;
  my: number;
  hp: number;
  flash: number;
  rayClear: boolean;
  inCone: boolean;
}
const mkEnemy = (sheet: Enemy['sheet'], x: number, y: number): Enemy => ({ sheet, x, y, vx: 0, vy: 0, fx: 1, fy: 0, flip: false, t: Math.random(), body: 'Idle', bodyT: 0, frame: 0, brain: 'IDLE', brainT: 0, sinceSensed: Infinity, senses: false, lastX: x, lastY: y, patrol: 0, path: [], repath: 0, hitDone: false, mx: 0, my: 0, hp: 6, flash: 0, rayClear: false, inCone: false });

const PATROL: [number, number][] = [
  [40, 122],
  [282, 122],
];
const WINDUP = 24, ACTIVE = 4, RECOV = 20;

export function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, color: string) {
  const len = Math.hypot(dx, dy);
  if (len < 1) return;
  line(ctx, x, y, x + dx, y + dy, color, 1.5);
  const ux = dx / len, uy = dy / len;
  line(ctx, x + dx, y + dy, x + dx - ux * 4 - uy * 3, y + dy - uy * 4 + ux * 3, color, 1.5);
  line(ctx, x + dx, y + dy, x + dx - ux * 4 + uy * 3, y + dy - uy * 4 - ux * 3, color, 1.5);
}

export interface KaiT {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
  facing: Facing;
  flip: boolean;
  t: number;
  state: string;
  time: number;
  hp: number;
  flash: number;
  hitSet: Set<Enemy>;
}
export function kaiTick(kai: KaiT, input: Input, dt: number, speed: number, walls: readonly Box[] = WALLS) {
  const [ix, iy] = input.vector();
  kai.t += dt;
  kai.time += dt;
  kai.flash = Math.max(0, kai.flash - dt * 6);
  const face = () => {
    const f = faceFrom(ix, iy);
    if (!f) return;
    const n = Math.hypot(ix, iy);
    kai.fx = ix / n;
    kai.fy = iy / n;
    kai.facing = f.facing;
    if (f.facing === 'side') kai.flip = f.flip;
  };
  if (kai.state === 'Idle' || kai.state === 'Move') {
    if (input.justPressed('attack')) {
      face();
      kai.state = 'Attack';
      kai.time = 0;
      kai.t = 0;
      kai.hitSet.clear();
      sfx(true, 'sfx_swing', 0.3);
    } else if (input.justPressed('dash')) {
      face();
      kai.state = 'Dash';
      kai.time = 0;
      kai.vx = kai.fx * 260;
      kai.vy = kai.fy * 260;
    } else {
      face();
      moveToward2(kai, ix * speed, iy * speed, (ix || iy ? 900 : 1200) * dt);
      kai.state = Math.hypot(kai.vx, kai.vy) > 5 ? 'Move' : 'Idle';
    }
  } else if (kai.state === 'Dash') {
    if (kai.time >= 0.15) (kai.state = 'Idle'), (kai.time = 0);
  } else if (kai.state === 'Attack') {
    moveToward2(kai, 0, 0, 1200 * dt);
    if (kai.time >= 0.3) (kai.state = 'Idle'), (kai.time = 0);
  } else if (kai.state === 'Hurt') {
    moveToward2(kai, 0, 0, 900 * dt);
    if (kai.time >= 0.25) (kai.state = 'Idle'), (kai.time = 0);
  }
  slide(kai, walls, dt);
}
export function drawKai(ctx: CanvasRenderingContext2D, kai: KaiT) {
  drawShadow(ctx, kai.x, kai.y);
  const base = kai.state === 'Attack' ? 'attack' : kai.state === 'Dash' ? 'dash' : kai.state === 'Hurt' ? 'hurt' : kai.state === 'Move' ? 'walk' : 'idle';
  const anim = dirAnim('hero', base, kai.facing);
  const fr = base === 'attack' ? frameAt('hero', anim, kai.time / 0.3) : base === 'dash' ? frameAt('hero', anim, kai.time / 0.15) : undefined;
  drawChar(ctx, 'hero', anim, kai.t, kai.x, kai.y, { flip: kai.flip, frame: fr, flash: kai.flash });
}
export const kaiHitbox = (k: KaiT): Box => [k.x + k.fx * 13 - 8, k.y - 9 + k.fy * 9 - 7, 16, 14];
export const newKai = (x: number, y: number): KaiT => ({ x, y, vx: 0, vy: 0, fx: 1, fy: 0, facing: 'side', flip: false, t: 0, state: 'Idle', time: 0, hp: 10, flash: 0, hitSet: new Set() });

// =============================================================================== combat.ai
export function AiSandbox({ spec }: { spec: VizSpec }) {
  const mode = (spec.mode as 'perception' | 'nav') ?? 'perception';
  const [angle, setAngle] = useState(90);
  const [range, setRange] = useState(96);
  const [hearing, setHearing] = useState(40);
  const [memory, setMemory] = useState(3);
  const [sneak, setSneak] = useState(false);
  const [useNav, setUseNav] = useState(true);
  const [sep, setSep] = useState(true);
  const P = useRef({ angle, range, hearing, memory, sneak, useNav, sep });
  P.current = { angle, range, hearing, memory, sneak, useNav, sep };
  const kai = useRef(newKai(mode === 'nav' ? 160 : 40, mode === 'nav' ? 72 : 40)).current;
  const enemies = useRef<Enemy[]>(mode === 'nav' ? [mkEnemy('skeleton', 40, 152), mkEnemy('skeleton', 280, 152), mkEnemy('slime', 40, 40), mkEnemy('slime', 290, 40)] : [mkEnemy('skeleton', 160, 122)]).current;
  const [ro, setRo] = useState({ brain: 'IDLE' as Brain, senses: false, since: Infinity, dot: 0, thr: 0, dist: 0, clear: false, hp: 10, stuck: 0 });
  const tick = useRef(0);

  const update = (dt: number, input: Input) => {
    const p = P.current;
    kaiTick(kai, input, dt, p.sneak ? 15 : 90);
    const thr = Math.cos(((p.angle / 2) * Math.PI) / 180);
    let dotShown = 0;
    for (const e of enemies) {
      e.t += dt;
      e.flash = Math.max(0, e.flash - dt * 6);
      e.brainT += dt;
      e.bodyT += dt;
      // ---- Kai's sword against the enemy
      if (kai.state === 'Attack' && kai.time >= 0.08 && kai.time < 0.16 && !kai.hitSet.has(e) && overlap(kaiHitbox(kai), [e.x - 6, e.y - 18, 12, 18])) {
        kai.hitSet.add(e);
        e.vx = kai.fx * 120;
        e.vy = kai.fy * 120;
        e.body = 'Hurt';
        e.bodyT = 0;
        e.flash = 1;
        e.hp--;
        sfx(true, 'sfx_hit', 0.35);
        // being hit is perception too
        e.sinceSensed = 0;
        e.lastX = kai.x;
        e.lastY = kai.y;
      }
      // ---- perception (can_see, can_hear)
      const dx = kai.x - e.x, dy = kai.y - e.y, dist = Math.hypot(dx, dy);
      e.sinceSensed += dt;
      let sees = false;
      if (mode === 'nav') {
        sees = true; // alerted: the figure is about movement, not perception
      } else {
        const dot = dist > 0 ? (e.fx * dx + e.fy * dy) / dist : 1;
        dotShown = dot;
        e.inCone = dist <= p.range && dot >= thr;
        e.rayClear = lineClear(WALLS, e.x, e.y - 1, kai.x, kai.y - 1);
        const see = e.inCone && e.rayClear;
        const hear = dist <= p.hearing && Math.hypot(kai.vx, kai.vy) > 20;
        sees = see || hear;
      }
      e.senses = sees;
      if (sees) {
        e.sinceSensed = 0;
        e.lastX = kai.x;
        e.lastY = kai.y;
      }
      const aware = e.sinceSensed <= p.memory;
      // ---- brain: writes intent (mx, my, wantAttack)
      e.mx = 0;
      e.my = 0;
      let wantAttack = false;
      const set = (b: Brain) => ((e.brain = b), (e.brainT = 0));
      const moveTo = (tx: number, ty: number, s: number) => {
        let gx = tx, gy = ty;
        if (mode === 'nav' && p.useNav) {
          e.repath -= dt;
          if (e.repath <= 0) {
            e.repath = 0.25;
            e.path = astar(GRID, COLS, ROWS, Math.floor(e.x / 16), Math.floor((e.y - 3) / 16), Math.floor(tx / 16), Math.floor((ty - 3) / 16));
          }
          while (e.path.length && Math.hypot(e.path[0][0] - e.x, e.path[0][1] - e.y + 3) < 6) e.path.shift();
          if (e.path.length > 1) [gx, gy] = [e.path[0][0], e.path[0][1] + 3];
        }
        const d = Math.hypot(gx - e.x, gy - e.y) || 1;
        e.mx = ((gx - e.x) / d) * s;
        e.my = ((gy - e.y) / d) * s;
      };
      switch (e.brain) {
        case 'IDLE':
          if (aware) set('CHASE');
          else if (mode === 'perception' && e.brainT >= 1.5) set('PATROL');
          break;
        case 'PATROL': {
          if (aware) {
            set('CHASE');
            break;
          }
          const [px, py] = PATROL[e.patrol];
          if (Math.hypot(px - e.x, py - e.y) < 4) {
            e.patrol = (e.patrol + 1) % PATROL.length;
            set('IDLE');
          } else moveTo(px, py, 0.5);
          break;
        }
        case 'CHASE':
          if (!aware) {
            set('IDLE');
            break;
          }
          if (e.senses && dist <= (mode === 'nav' ? 16 : 22)) {
            if (mode === 'nav') break; // arrive and wait: no attacks in this mode
            e.mx = dx / dist;
            e.my = dy / dist;
            wantAttack = true;
            set('ATTACK');
          } else if (Math.hypot(e.lastX - e.x, e.lastY - e.y) > 4) moveTo(e.lastX, e.lastY, 1);
          break;
        case 'ATTACK':
          if (e.body !== 'Attack' && e.brainT > 0.05) set('RECOVER');
          break;
        case 'RECOVER':
          if (e.brainT >= 0.6) set('CHASE');
          break;
      }
      // separation (nav mode)
      if (mode === 'nav' && p.sep && (e.mx || e.my)) {
        let sx = 0, sy = 0;
        for (const o of enemies) {
          if (o === e) continue;
          const ax = e.x - o.x, ay = e.y - o.y, d = Math.hypot(ax, ay);
          if (d > 0 && d < 18) (sx += (ax / d) * (1 - d / 18)), (sy += (ay / d) * (1 - d / 18));
        }
        e.mx += sx * 0.7;
        e.my += sy * 0.7;
        const l = Math.hypot(e.mx, e.my);
        if (l > 1) (e.mx /= l), (e.my /= l);
      }
      // ---- body: the same states as Kai's, reading the intent
      const maxSpeed = e.sheet === 'slime' ? 50 : 60;
      if (e.body === 'Idle' || e.body === 'Move') {
        if (wantAttack) {
          e.body = 'Attack';
          e.bodyT = 0;
          e.frame = 0;
          e.hitDone = false;
          const f = faceFrom(e.mx, e.my);
          if (f) (e.fx = e.mx), (e.fy = e.my), (e.flip = f.flip);
          e.vx = 0;
          e.vy = 0;
        } else {
          const f = faceFrom(e.mx, e.my);
          if (f) {
            const n = Math.hypot(e.mx, e.my);
            e.fx = e.mx / n;
            e.fy = e.my / n;
            if (f.facing === 'side') e.flip = f.flip;
          }
          moveToward2(e, e.mx * maxSpeed, e.my * maxSpeed, (e.mx || e.my ? 900 : 1200) * dt);
          e.body = Math.hypot(e.vx, e.vy) > 4 ? 'Move' : 'Idle';
        }
      } else if (e.body === 'Attack') {
        e.frame++;
        if (e.frame >= WINDUP && e.frame < WINDUP + ACTIVE && !e.hitDone) {
          const hb: Box = [e.x + e.fx * 13 - 8, e.y - 9 + e.fy * 9 - 7, 16, 14];
          if (overlap(hb, [kai.x - 6, kai.y - 18, 12, 18])) {
            e.hitDone = true;
            if (kai.state !== 'Dash' && kai.state !== 'Hurt') {
              kai.hp = Math.max(0, kai.hp - 1);
              if (kai.hp === 0) kai.hp = 10;
              kai.flash = 1;
              kai.vx = e.fx * 140;
              kai.vy = e.fy * 140;
              kai.state = 'Hurt';
              kai.time = 0;
              sfx(true, 'sfx_hurt', 0.35);
            }
          }
        }
        if (e.frame >= WINDUP + ACTIVE + RECOV) e.body = 'Idle';
      } else if (e.body === 'Hurt') {
        moveToward2(e, 0, 0, 900 * dt);
        if (e.bodyT >= 0.25) e.body = 'Idle';
      }
      slide(e, WALLS, dt, e.sheet === 'slime' ? 12 : 10, 6);
      if (e.hp <= 0) Object.assign(e, mkEnemy(e.sheet, mode === 'nav' ? e.x : 160, mode === 'nav' ? e.y : 122), { hp: 6 });
    }
    if (++tick.current % 5 === 0) {
      const e = enemies[0];
      setRo({ brain: e.brain, senses: e.senses, since: e.sinceSensed, dot: dotShown, thr, dist: Math.hypot(kai.x - e.x, kai.y - e.y), clear: e.rayClear, hp: kai.hp, stuck: enemies.filter((x) => x.brain === 'CHASE' && (x.mx !== 0 || x.my !== 0) && Math.hypot(kai.x - x.x, kai.y - x.y) > 28 && Math.hypot(x.vx, x.vy) < 8).length });
    }
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const p = P.current;
    drawFloor(ctx, W, H, 'dungeon');
    for (const [x, y, w, h] of WALLS) drawWall(ctx, x, y, w, h);
    if (mode === 'perception') {
      for (const [px, py] of PATROL) {
        rect(ctx, px - 2, py - 2, 4, 4, 'rgba(255,255,255,0.35)');
      }
      for (const e of enemies) {
        // vision cone
        const a0 = Math.atan2(e.fy, e.fx), half = ((p.angle / 2) * Math.PI) / 180;
        ctx.save();
        ctx.globalAlpha = e.senses ? 0.28 : 0.16;
        ctx.fillStyle = '#eebb3e';
        ctx.beginPath();
        ctx.moveTo(e.x, e.y - 1);
        ctx.arc(e.x, e.y - 1, p.range, a0 - half, a0 + half);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        // hearing radius (dashed)
        ctx.save();
        ctx.setLineDash([3, 3]);
        circle(ctx, e.x, e.y - 1, p.hearing, 'rgba(154,234,238,0.7)', false);
        ctx.restore();
        // the ray (only when range and cone pass, as in can_see)
        const dist = Math.hypot(kai.x - e.x, kai.y - e.y);
        if (dist <= p.range && e.inCone) line(ctx, e.x, e.y - 1, kai.x, kai.y - 1, e.rayClear ? '#a2d052' : '#ff5a4a', 1);
        // memory
        if (e.sinceSensed <= p.memory && !e.senses) {
          line(ctx, e.lastX - 3, e.lastY - 3, e.lastX + 3, e.lastY + 3, '#f8925e', 1.5);
          line(ctx, e.lastX - 3, e.lastY + 3, e.lastX + 3, e.lastY - 3, '#f8925e', 1.5);
          const left = 1 - e.sinceSensed / p.memory;
          rect(ctx, e.lastX - 8, e.lastY + 5, 16, 2, 'rgba(0,0,0,0.6)');
          rect(ctx, e.lastX - 8, e.lastY + 5, 16 * left, 2, '#f8925e');
        }
      }
    } else {
      for (const e of enemies) {
        if (!p.useNav || e.path.length < 2) continue;
        ctx.save();
        ctx.globalAlpha = 0.8;
        let px = e.x, py = e.y - 3;
        for (const [wx, wy] of e.path) {
          line(ctx, px, py, wx, wy, e.sheet === 'slime' ? '#9aeaee' : '#eebb3e', 1);
          px = wx;
          py = wy;
        }
        for (let k = 0; k < e.path.length; k++) rect(ctx, e.path[k][0] - 1, e.path[k][1] - 1, k === 0 ? 4 : 2, k === 0 ? 4 : 2, k === 0 ? '#ffffff' : '#c0bed4');
        ctx.restore();
      }
    }
    const all = [...enemies.map((e) => ({ y: e.y, e })), { y: kai.y, e: null as Enemy | null }].sort((a, b) => a.y - b.y);
    for (const { e } of all) {
      if (!e) {
        drawKai(ctx, kai);
        continue;
      }
      drawShadow(ctx, e.x, e.y, e.sheet === 'slime' ? 6 : 6);
      let anim = e.body === 'Hurt' ? 'hurt' : e.body === 'Move' ? (e.sheet === 'slime' ? 'hop' : 'walk') : 'idle';
      let fr: number | undefined;
      let flash = e.flash, flashColor = '#ffffff';
      if (e.body === 'Attack') {
        if (e.frame < WINDUP) {
          anim = 'windup';
          fr = frameAt('skeleton', 'windup', e.frame / WINDUP);
          // telegraph: two orange pulses in the last 9 frames of the wind-up
          if ((e.frame >= 15 && e.frame < 20) || e.frame >= 22) (flash = 0.6), (flashColor = '#f8925e');
        } else {
          anim = 'attack';
          fr = frameAt('skeleton', 'attack', (e.frame - WINDUP) / (ACTIVE + RECOV / 2));
        }
      }
      drawChar(ctx, e.sheet, anim, e.t, e.x, e.y, { flip: e.flip, frame: fr, flash, flashColor });
      if (mode === 'perception') tag(ctx, e.brain, e.x, e.y - 30, e.senses ? '#f8925e' : '#ffffff');
    }
    tag(ctx, `Kai HP ${kai.hp}/10`, 46, 30);
  };

  return (
    <FigureLayout
      side={
        mode === 'perception' ? (
          <>
            <Slider label="sight_angle (°)" value={angle} min={20} max={360} step={5} onChange={setAngle} />
            <Slider label="sight_range (px)" value={range} min={40} max={180} step={2} onChange={setRange} />
            <Slider label="hearing_radius (px)" value={hearing} min={0} max={80} step={2} onChange={setHearing} />
            <Slider label="memory_time (s)" value={memory} min={0.5} max={6} step={0.5} onChange={setMemory} />
            <Toggle label="Kai sneaks (15 px/s)" value={sneak} onChange={setSneak} />
            <Readout
              rows={[
                ['\\text{brain}', ro.brain],
                ['\\hat f\\cdot\\hat p', ro.dot.toFixed(3)],
                ['\\cos(\\theta/2)', ro.thr.toFixed(3)],
                ['|\\mathbf p|', `${ro.dist.toFixed(0)} px`],
                ['\\text{ray}', ro.clear ? 'clear' : 'blocked'],
                ['\\text{since sensed}', Number.isFinite(ro.since) ? `${ro.since.toFixed(1)} s` : 'never'],
              ]}
            />
          </>
        ) : (
          <>
            <Toggle label="use navigation (paths)" value={useNav} onChange={setUseNav} />
            <Toggle label="separation (radius 18)" value={sep} onChange={setSep} />
            <Readout
              rows={[
                ['\\text{repath}', 'every 0.25 s'],
                ['\\text{stuck on a wall}', `${ro.stuck} of ${enemies.length}`],
              ]}
            />
            <div className="arch-note">The enemies are already alerted: they always know where Kai is. Hide behind the long walls.</div>
          </>
        )
      }
    >
      <GameCanvas
        width={W}
        height={H}
        update={update}
        draw={draw}
        touchButtons={['up', 'down', 'left', 'right', 'attack', 'dash']}
        keysHint={<Keys items={[['WASD / arrows', 'move'], ['J', 'attack'], ['K', 'dodge']]} />}
        label="AI sandbox: move Kai with WASD"
      />
    </FigureLayout>
  );
}

// =============================================================================== combat.ai_steer
type Beh = 'seek' | 'flee' | 'arrive';
const SW: Box[] = [
  [0, 0, W, 12],
  [0, H - 8, W, 8],
  [0, 0, 8, H],
  [W - 8, 0, 8, H],
];
export function SteerLab({ spec }: { spec: VizSpec }) {
  void spec;
  const [beh, setBeh] = useState<Beh>('arrive');
  const [maxSpeed, setMaxSpeed] = useState(60);
  const [accel, setAccel] = useState(900);
  const [slow, setSlow] = useState(24);
  const [sep, setSep] = useState(true);
  const P = useRef({ beh, maxSpeed, accel, slow, sep });
  P.current = { beh, maxSpeed, accel, slow, sep };
  const kai = useRef(newKai(160, 96)).current;
  const slimes = useRef(Array.from({ length: 6 }, (_, i) => ({ x: 40 + (i % 3) * 120, y: 40 + Math.floor(i / 3) * 100, vx: 0, vy: 0, t: i * 0.3, dx: 0, dy: 0 }))).current;
  const [ro, setRo] = useState({ d: 0, desired: 0, steer: 0, speed: 0 });
  const tick = useRef(0);

  const update = (dt: number, input: Input) => {
    const p = P.current;
    kaiTick(kai, input, dt, 90, SW);
    for (const s of slimes) {
      s.t += dt;
      const ox = kai.x - s.x, oy = kai.y - s.y, d = Math.hypot(ox, oy) || 0.0001;
      let mx = 0, my = 0;
      if (p.beh === 'seek') (mx = ox / d), (my = oy / d);
      else if (p.beh === 'flee') (mx = -ox / d), (my = -oy / d);
      else if (d >= 1) {
        const k = Math.min(d / p.slow, 1);
        mx = (ox / d) * k;
        my = (oy / d) * k;
      }
      if (p.sep) {
        let sx = 0, sy = 0;
        for (const o of slimes) {
          if (o === s) continue;
          const ax = s.x - o.x, ay = s.y - o.y, dd = Math.hypot(ax, ay);
          if (dd > 0 && dd < 18) (sx += (ax / dd) * (1 - dd / 18)), (sy += (ay / dd) * (1 - dd / 18));
        }
        const sl = Math.hypot(sx, sy);
        if (sl > 1) (sx /= sl), (sy /= sl);
        mx += sx * 0.7;
        my += sy * 0.7;
      }
      const l = Math.hypot(mx, my);
      if (l > 1) (mx /= l), (my /= l);
      // desired velocity, and move_with_intent as the capped steering force
      s.dx = mx * p.maxSpeed;
      s.dy = my * p.maxSpeed;
      moveToward2(s, s.dx, s.dy, p.accel * dt);
      slide(s, SW, dt, 12, 6);
    }
    if (++tick.current % 5 === 0) {
      const s = slimes[0];
      setRo({ d: Math.hypot(kai.x - s.x, kai.y - s.y), desired: Math.hypot(s.dx, s.dy), steer: Math.hypot(s.dx - s.vx, s.dy - s.vy), speed: Math.hypot(s.vx, s.vy) });
    }
  };
  const draw = (ctx: CanvasRenderingContext2D) => {
    const p = P.current;
    drawFloor(ctx, W, H, 'grass');
    for (const [x, y, w, h] of SW) drawWall(ctx, x, y, w, h);
    if (p.beh === 'arrive') {
      ctx.save();
      ctx.setLineDash([3, 3]);
      circle(ctx, kai.x, kai.y - 3, p.slow, 'rgba(255,255,255,0.7)', false);
      ctx.restore();
    }
    const ents = [...slimes.map((s, i) => ({ y: s.y, i })), { y: kai.y, i: -1 }].sort((a, b) => a.y - b.y);
    for (const { i } of ents) {
      if (i < 0) {
        drawKai(ctx, kai);
        continue;
      }
      const s = slimes[i];
      drawShadow(ctx, s.x, s.y, 6, 2);
      const moving = Math.hypot(s.vx, s.vy) > 5;
      drawChar(ctx, 'slime', moving ? 'hop' : 'idle', s.t, s.x, s.y);
      if (i === 0) {
        rect(ctx, s.x - 1, s.y - 22, 2, 2, '#fff09a');
        arrow(ctx, s.x, s.y - 4, s.dx * 0.5, s.dy * 0.5, '#5aa0ff');
        arrow(ctx, s.x, s.y - 4, (s.dx - s.vx) * 0.5, (s.dy - s.vy) * 0.5, '#f8925e');
      }
    }
  };
  return (
    <FigureLayout
      side={
        <>
          <SegControl
            label="behaviour"
            value={beh}
            options={[
              { v: 'seek', label: 'seek' },
              { v: 'flee', label: 'flee' },
              { v: 'arrive', label: 'arrive' },
            ]}
            onChange={setBeh}
          />
          <Toggle label="separation (radius 18, weight 0.7)" value={sep} onChange={setSep} />
          <Slider label="max_speed" value={maxSpeed} min={20} max={120} step={5} onChange={setMaxSpeed} />
          <Slider label="acceleration (steering cap)" value={accel} min={100} max={3000} step={50} onChange={setAccel} />
          {beh === 'arrive' && <Slider label="slow radius (px)" value={slow} min={2} max={80} step={1} onChange={setSlow} />}
          <Readout
            rows={[
              ['v^2/2a', `${((maxSpeed * maxSpeed) / (2 * accel)).toFixed(1)} px`],
              ['|\\mathbf p|', `${ro.d.toFixed(0)} px`],
              ['|\\mathbf v_{\\text{desired}}|', `${ro.desired.toFixed(0)} px/s`],
              ['|\\mathbf v|', `${ro.speed.toFixed(0)} px/s`],
              ['|\\text{steering}|', `${ro.steer.toFixed(0)} px/s`],
            ]}
          />
        </>
      }
    >
      <GameCanvas width={W} height={H} update={update} draw={draw} touchButtons={['up', 'down', 'left', 'right']} keysHint={<Keys items={[['WASD / arrows', 'move Kai']]} />} label="steering lab: move Kai, the slimes steer" />
    </FigureLayout>
  );
}
