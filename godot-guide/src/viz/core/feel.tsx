// core.feel: the same level and the same input drive two characters side by side (A on the left,
// B on the right). Each side has a base acceleration curve and its own juice toggles, mirroring the
// lesson c02-3 additions to the Player script: turn acceleration (dot < 0), corner correction with
// test_move, dust on turns, animation speed synced to velocity, footsteps on contact frames, and a
// camera with smoothing and look-ahead. Live numbers: frames to the first visible pixel, frames to
// turn around, the stopping slide and the corner nudges.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, text, rect, playSound, drawFrame, animFrame, SHEETS, type Input } from '../game';
import { Readout, FigureLayout } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { type Box, moveToward2, feetHit, drawChar, drawGrass, drawWall, drawShadow } from './motionkit';

const W = 320, H = 180, VW = 160;
const WW = 480, WH = 288;
const WALLS: Box[] = [
  [0, 0, WW, 16],
  [0, WH - 16, WW, 16],
  [0, 0, 16, WH],
  [WW - 16, 0, 16, WH],
  // two blocks with a one-tile corridor between them (16 px wide; the feet are 10 px)
  [96, 64, 64, 64],
  [176, 64, 64, 64],
  // pillars to run around
  [304, 176, 32, 32],
  [96, 192, 32, 32],
  [384, 64, 16, 96],
];
const MAX = 90;
type Curve = 'floaty' | 'stiff' | 'tuned';
const CURVES: Record<Curve, { accel: number; friction: number }> = {
  floaty: { accel: 400, friction: 300 },
  stiff: { accel: 100000, friction: 100000 },
  tuned: { accel: 1200, friction: 1600 },
};
const TURN = 3000;
type Juice = 'turn' | 'corner' | 'dust' | 'anim' | 'steps' | 'camera';
const JUICE: [Juice, string][] = [
  ['turn', 'turn accel'],
  ['corner', 'corner nudge'],
  ['dust', 'dust on turns'],
  ['anim', 'anim sync'],
  ['steps', 'footsteps'],
  ['camera', 'smooth camera'],
];
type Cfg = { curve: Curve } & Record<Juice, boolean>;
const RAW: Cfg = { curve: 'floaty', turn: false, corner: false, dust: false, anim: false, steps: false, camera: false };
const TUNED: Cfg = { curve: 'tuned', turn: true, corner: true, dust: true, anim: true, steps: true, camera: true };

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}
function makeSide() {
  return {
    x: 128, y: 160, vx: 0, vy: 0, facing: 'down' as 'down' | 'up' | 'side', flip: false, animT: 0, lastStep: -1,
    camX: 128 - VW / 2, camY: 160 - H / 2, lookX: 0, lookY: 0, turning: false,
    puffs: [] as Puff[],
    // measurements
    startCount: -1, startDist: 0, firstPixel: 0, turnCount: -1, turnFrames: 0, nudges: 0,
  };
}
type Side = ReturnType<typeof makeSide>;

function stepSide(s: Side, c: Cfg, ix: number, iy: number, dt: number, sound: boolean) {
  const { accel, friction } = CURVES[c.curve];
  const moving = ix !== 0 || iy !== 0;
  const dot = s.vx * ix + s.vy * iy;
  const turning = moving && dot < 0;
  let rate = friction;
  if (turning && c.turn) rate = TURN;
  else if (moving) rate = accel;
  // measurements: frames from a press at rest to the first visible pixel, frames to turn around
  if (moving && s.vx === 0 && s.vy === 0 && s.startCount < 0) {
    s.startCount = 0;
    s.startDist = 0;
  }
  if (turning && !s.turning) {
    s.turnCount = 0;
    if (c.dust) spawnDust(s, ix, iy);
  }
  s.turning = turning;
  moveToward2(s, ix * MAX, iy * MAX, rate * dt);
  let dx = s.vx * dt, dy = s.vy * dt;
  // corner correction: blocked while moving straight? look for a gap up to 4 px to the side
  if (c.corner && moving && feetHit(WALLS, s.x + dx, s.y + dy)) {
    const ax = Math.abs(ix) < 0.2 ? 1 : 0, ay = Math.abs(iy) < 0.2 ? 1 : 0;
    if (ax !== ay)
      outer: for (let i = 1; i <= 4; i++)
        for (const sg of [1, -1]) {
          if (!feetHit(WALLS, s.x + ax * i * sg + dx, s.y + ay * i * sg + dy)) {
            s.x += ax * sg;
            s.y += ay * sg;
            s.nudges++;
            break outer;
          }
        }
  }
  const x0 = s.x, y0 = s.y;
  s.x += dx;
  if (feetHit(WALLS, s.x, s.y)) {
    s.x -= dx;
    s.vx = 0;
  }
  s.y += dy;
  if (feetHit(WALLS, s.x, s.y)) {
    s.y -= dy;
    s.vy = 0;
  }
  dx = s.x - x0;
  dy = s.y - y0;
  if (s.startCount >= 0) {
    s.startCount++;
    s.startDist += Math.hypot(dx, dy);
    if (s.startDist >= 1) {
      s.firstPixel = s.startCount;
      s.startCount = -1;
    } else if (!moving || s.startCount > 60) s.startCount = -1;
  }
  if (s.turnCount >= 0) {
    s.turnCount++;
    const n = Math.hypot(ix, iy) || 1;
    if ((s.vx * ix + s.vy * iy) / n >= 0.9 * MAX) {
      s.turnFrames = s.turnCount;
      s.turnCount = -1;
    } else if (!moving || s.turnCount > 120) s.turnCount = -1;
  }
  if (moving) {
    if (Math.abs(ix) > Math.abs(iy)) {
      s.facing = 'side';
      s.flip = ix < 0;
    } else s.facing = iy < 0 ? 'up' : 'down';
  }
  const sp = Math.hypot(s.vx, s.vy);
  // animation clock: with sync the walk cycle runs at speed / max_speed (clamped), else at full rate
  const scale = sp > 5 ? (c.anim ? Math.min(1, Math.max(0.4, sp / MAX)) : 1) : 1;
  s.animT += dt * scale;
  // footsteps on the contact frames (every second frame of the walk cycle)
  const fps = SHEETS['hero']?.anims?.['walk_' + s.facing]?.fps ?? 8;
  const k = Math.floor(s.animT * fps);
  if (sp > 5 && k !== s.lastStep) {
    if (k % 2 === 0 && c.steps && sound) playSound('sfx_footstep', 0.2);
    s.lastStep = k;
  }
  for (let i = s.puffs.length - 1; i >= 0; i--) {
    const p = s.puffs[i];
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.age > 0.35) s.puffs.splice(i, 1);
  }
  // camera: rigid (centred, whole pixels) or smoothed with a look-ahead in the direction of motion
  let tx = s.x - VW / 2, ty = s.y - 12 - H / 2;
  if (c.camera) {
    const k2 = 1 - Math.exp(-3 * dt);
    s.lookX += ((s.vx / MAX) * 24 - s.lookX) * k2;
    s.lookY += ((s.vy / MAX) * 16 - s.lookY) * k2;
    tx += s.lookX;
    ty += s.lookY;
    const k3 = 1 - Math.exp(-6 * dt);
    s.camX += (tx - s.camX) * k3;
    s.camY += (ty - s.camY) * k3;
  } else {
    s.camX = tx;
    s.camY = ty;
  }
  s.camX = Math.max(0, Math.min(WW - VW, s.camX));
  s.camY = Math.max(0, Math.min(WH - H, s.camY));
}

function spawnDust(s: Side, ix: number, iy: number) {
  for (let i = 0; i < 4; i++) {
    const a = Math.atan2(-iy, -ix) + (i - 1.5) * 0.5;
    s.puffs.push({ x: s.x, y: s.y - 1, vx: Math.cos(a) * 30, vy: Math.sin(a) * 18 - 6, age: 0 });
  }
}

function drawSide(ctx: CanvasRenderingContext2D, s: Side, x0: number, label: string) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, 0, VW, H);
  ctx.clip();
  ctx.translate(x0, 0);
  const cx = Math.round(s.camX), cy = Math.round(s.camY);
  drawGrass(ctx, WW, WH, cx, cy, VW, H);
  for (const [x, y, w, h] of WALLS) if (x - cx < VW && x + w - cx > 0 && y - cy < H && y + h - cy > 0) drawWall(ctx, x - cx, y - cy, w, h);
  for (const p of s.puffs) {
    if (SHEETS['fx_dust']) drawFrame(ctx, 'fx_dust', animFrame('fx_dust', 'play', p.age), p.x - cx, p.y - cy, { anchored: true, alpha: 1 - p.age / 0.35 });
    else {
      ctx.fillStyle = `rgba(236,224,200,${0.85 * (1 - p.age / 0.35)})`;
      ctx.beginPath();
      ctx.arc(p.x - cx, p.y - cy, 1.5 + p.age * 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  drawShadow(ctx, s.x - cx, s.y - cy);
  const sp = Math.hypot(s.vx, s.vy);
  drawChar(ctx, 'hero', (sp > 5 ? 'walk_' : 'idle_') + s.facing, s.animT, s.x - cx, s.y - cy, { flip: s.flip });
  rect(ctx, 2, 2, 12, 11, 'rgba(0,0,0,0.55)');
  text(ctx, label, 5, 11, '#ffffff');
  ctx.restore();
}

export function FeelLab({ spec }: { spec: VizSpec }) {
  const [a, setA] = useState<Cfg>({ ...RAW, ...((spec.a as Partial<Cfg>) ?? {}) });
  const [b, setB] = useState<Cfg>({ ...TUNED, ...((spec.b as Partial<Cfg>) ?? {}) });
  const sa = useRef(makeSide()).current;
  const sb = useRef(makeSide()).current;
  const [ro, setRo] = useState({ a: [0, 0, 0], b: [0, 0, 0] });
  const n = useRef(0);

  const update = (dt: number, input: Input) => {
    const [ix, iy] = input.vector();
    stepSide(sa, a, ix, iy, dt, !b.steps || !a.steps);
    stepSide(sb, b, ix, iy, dt, true);
    if (++n.current % 10 === 0) setRo({ a: [sa.firstPixel, sa.turnFrames, sa.nudges], b: [sb.firstPixel, sb.turnFrames, sb.nudges] });
  };
  const draw = (ctx: CanvasRenderingContext2D) => {
    drawSide(ctx, sa, 0, 'A');
    drawSide(ctx, sb, VW, 'B');
    rect(ctx, VW - 1, 0, 2, H, '#1a1424');
  };
  const reset = () => {
    Object.assign(sa, makeSide());
    Object.assign(sb, makeSide());
  };
  const f = (v: number) => (v > 0 ? String(v) : '–');
  const slide = (c: Cfg) => (MAX * MAX) / (2 * CURVES[c.curve].friction);
  const code = useMemo(() => {
    const c = b;
    const cv = CURVES[c.curve];
    return `# side B
@export var acceleration := ${cv.accel.toFixed(1)}
@export var friction := ${cv.friction.toFixed(1)}
@export var turn_acceleration := ${(c.turn ? TURN : cv.accel).toFixed(1)}${c.turn ? '' : '  # same as acceleration: no turn boost'}
@export var corner_nudge := ${c.corner ? 4 : 0}

func _walk(input: Vector2, delta: float) -> void:
	var turning := input != Vector2.ZERO and velocity.dot(input) < 0.0
	var rate := friction
	if turning:
		rate = turn_acceleration
	elif input != Vector2.ZERO:
		rate = acceleration${c.dust ? `
	if turning and not _turning:
		dust.restart()` : ''}
	_turning = turning
	velocity = velocity.move_toward(input * max_speed, rate * delta)
	_corner_correction(input, delta)
	move_and_slide()
	_update_facing(input)
`;
  }, [b]);

  const row = (j: Juice, label: string) => (
    <tr key={j}>
      <td>{label}</td>
      <td>
        <input type="checkbox" aria-label={`${label}, side A`} checked={a[j]} onChange={(e) => setA({ ...a, [j]: e.target.checked })} />
      </td>
      <td>
        <input type="checkbox" aria-label={`${label}, side B`} checked={b[j]} onChange={(e) => setB({ ...b, [j]: e.target.checked })} />
      </td>
    </tr>
  );
  const curveSel = (c: Cfg, set: (c: Cfg) => void, side: string) => (
    <select aria-label={`acceleration curve, side ${side}`} value={c.curve} onChange={(e) => set({ ...c, curve: e.target.value as Curve })}>
      <option value="floaty">floaty</option>
      <option value="stiff">instant</option>
      <option value="tuned">tuned</option>
    </select>
  );

  return (
    <FigureLayout
      side={
        <>
          <table className="core-m-table">
            <thead>
              <tr>
                <th>element</th>
                <th>A</th>
                <th>B</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>accel curve</td>
                <td>{curveSel(a, setA, 'A')}</td>
                <td>{curveSel(b, setB, 'B')}</td>
              </tr>
              {JUICE.map(([j, l]) => row(j, l))}
            </tbody>
          </table>
          <div className="core-m-row">
            <button onClick={() => { setA(RAW); setB(TUNED); }}>raw vs tuned</button>
            <button onClick={reset}>reset positions</button>
          </div>
          <Readout
            title="measured (A / B)"
            rows={[
              ['\\text{frames to first pixel}', `${f(ro.a[0])} / ${f(ro.b[0])}`],
              ['\\text{frames to turn around}', `${f(ro.a[1])} / ${f(ro.b[1])}`],
              ['\\text{stop slide } v^2/2f', `${slide(a).toFixed(1)} / ${slide(b).toFixed(1)} px`],
              ['\\text{corner nudges}', `${ro.a[2]} / ${ro.b[2]}`],
            ]}
          />
        </>
      }
      below={<CodeBlock code={code} file="scripts/player.gd" compact />}
    >
      <GameCanvas
        width={W}
        height={H}
        update={update}
        draw={draw}
        touchButtons={['up', 'down', 'left', 'right']}
        keysHint={<Keys items={[['WASD / arrows', 'move both characters']]} />}
        label="feel comparison: the same input moves character A (left) and B (right)"
      />
    </FigureLayout>
  );
}
