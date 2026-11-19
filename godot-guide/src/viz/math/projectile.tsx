// math.projectile: Lyra lobs a shot that lands on a target in a chosen flight time T.
//   v = (to - from) / T - 0.5 * gravity * T      (gravity = (0, g), y down)
// Drag the slime (or move it with the arrow keys), press J or Space to throw.
import { useMemo, useRef, useState, type PointerEvent as RPE } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, text, drawFrame, animFrame, playSound, SHEETS, type Input } from '../game';
import { Slider, Readout, FigureLayout } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { hud, f, gf, clamp, type V } from './common';
import { drawSolids, sky, type Box } from './sidescene';

const W = 320, H = 180;
const GROUND = 164;
const SOLIDS: Box[] = [[0, GROUND, W, 16], [208, GROUND - 48, 64, 48]];

interface Shot {
  p: V;
  v: V;
  t: number;
  trail: V[];
  done: boolean;
}

export function ProjectileLab({ spec }: { spec: VizSpec }) {
  const [T, setT] = useState((spec.flightTime as number) ?? 0.8);
  const [g, setG] = useState((spec.gravity as number) ?? 400);
  const [target, setTarget] = useState<V>([240, GROUND - 48]);
  const p = useRef({ T, g, target });
  p.current = { T, g, target };
  const s = useRef({ shots: [] as Shot[], t: 0, cast: -1 }).current;
  const wrap = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const from: V = [44, GROUND - 14];

  const launch = (to: V, T: number, g: number): V => [(to[0] - from[0]) / T, (to[1] - from[1]) / T - 0.5 * g * T];

  const update = (dt: number, input: Input) => {
    const { T, g, target } = p.current;
    // arrow keys nudge the target
    const [ix, iy] = input.vector();
    if (ix || iy) setTarget([clamp(target[0] + ix * 80 * dt, 70, W - 8), clamp(target[1] + iy * 80 * dt, 20, GROUND)]);
    if (input.justPressed('attack') || input.justPressed('jump')) {
      s.shots.push({ p: [...from] as V, v: launch(target, T, g), t: 0, trail: [], done: false });
      if (s.shots.length > 4) s.shots.shift();
      s.cast = 0;
      playSound('sfx_fire', 0.3);
    }
    for (const sh of s.shots) {
      if (sh.done) continue;
      // semi-implicit Euler, like a projectile script in _physics_process
      sh.v = [sh.v[0], sh.v[1] + g * dt];
      sh.p = [sh.p[0] + sh.v[0] * dt, sh.p[1] + sh.v[1] * dt];
      sh.t += dt;
      if (sh.trail.length < 300) sh.trail.push([...sh.p] as V);
      if (sh.t >= T - 1e-9) {
        sh.done = true;
        playSound('sfx_hit', 0.25);
      }
    }
    if (s.cast >= 0) s.cast += dt;
    if (s.cast > 0.4) s.cast = -1;
    s.t += dt;
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const { T, g, target } = p.current;
    sky(ctx, W, H);
    drawSolids(ctx, SOLIDS);
    // predicted arc
    const v = launch(target, T, g);
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const t = (T * i) / 40;
      const x = from[0] + v[0] * t, y = from[1] + v[1] * t + 0.5 * g * t * t;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    // launch velocity arrow (scaled to 0.15 s)
    ctx.strokeStyle = '#8fc7ff';
    ctx.beginPath();
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(from[0] + v[0] * 0.15, from[1] + v[1] * 0.15);
    ctx.stroke();
    drawFrame(ctx, 'mage', animFrame('mage', s.cast >= 0 ? 'cast' : 'idle_side', s.cast >= 0 ? s.cast : s.t), 36, GROUND, { anchored: true });
    drawFrame(ctx, 'slime', animFrame('slime', 'idle', s.t), target[0], target[1] + 4, { anchored: true });
    for (const sh of s.shots) {
      for (let i = 0; i < sh.trail.length; i += 3) {
        ctx.fillStyle = 'rgba(255,170,60,0.7)';
        ctx.fillRect(Math.round(sh.trail[i][0]), Math.round(sh.trail[i][1]), 1, 1);
      }
      if (!sh.done) {
        if (SHEETS['fx_fireball']) drawFrame(ctx, 'fx_fireball', animFrame('fx_fireball', 'play', sh.t), sh.p[0] - 8, sh.p[1] - 8);
        else {
          ctx.fillStyle = '#ff9a3c';
          ctx.beginPath();
          ctx.arc(sh.p[0], sh.p[1], 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff2a8';
          ctx.fillRect(Math.round(sh.p[0]) - 1, Math.round(sh.p[1]) - 1, 2, 2);
        }
      }
    }
    hud(
      ctx,
      [
        [`v = (${v[0].toFixed(0)}, ${v[1].toFixed(0)})`, '#8fc7ff'],
        [`speed ${Math.hypot(v[0], v[1]).toFixed(0)} px/s`, '#ffffff'],
      ],
      W - 2,
      2,
      'right',
      text,
    );
  };

  const onPointer = (e: RPE<HTMLDivElement>) => {
    if (e.type === 'pointerdown') dragging.current = true;
    if (e.type === 'pointerup' || e.type === 'pointercancel') dragging.current = false;
    if (!dragging.current) return;
    const c = wrap.current?.querySelector('canvas');
    if (!c) return;
    const r = c.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    if (x < 0 || y < 0 || x > W || y > H) return;
    setTarget([clamp(x, 70, W - 8), clamp(y, 20, GROUND)]);
  };

  const d: V = [target[0] - from[0], target[1] - from[1]];
  const v = launch(target, T, g);
  const apex = v[1] < 0 ? (v[1] * v[1]) / (2 * g) : 0;
  const code = useMemo(
    () => `## Launch velocity that lands on \`to\` after exactly \`flight_time\` seconds.
static func launch_velocity(from: Vector2, to: Vector2, flight_time: float, gravity: float) -> Vector2:
	var g := Vector2(0.0, gravity)  # y down: gravity pulls toward +y
	return (to - from) / flight_time - 0.5 * g * flight_time

# launch_velocity(Vector2(${f(from[0], 0)}, ${f(from[1], 0)}), Vector2(${f(target[0], 0)}, ${f(target[1], 0)}), ${gf(T, 2)}, ${gf(g, 0)})
# = (${f(v[0], 1)}, ${f(v[1], 1)})`,
    [target, T, g, v],
  );
  return (
    <FigureLayout
      side={
        <>
          <Slider label="flight time T" value={T} min={0.3} max={1.6} step={0.05} onChange={setT} fmt={(x) => x.toFixed(2)} />
          <Slider label="gravity" value={g} min={100} max={1000} step={20} onChange={setG} fmt={(x) => x.toFixed(0)} />
          <Readout
            rows={[
              ['\\mathbf{d} = \\text{to} - \\text{from}', `(${f(d[0], 0)}, ${f(d[1], 0)})`],
              ['\\mathbf{d}/T', `(${f(d[0] / T, 1)}, ${f(d[1] / T, 1)})`],
              ['-\\tfrac12 g T', `(0, ${f(-0.5 * g * T, 1)})`],
              ['\\mathbf{v}', `(${f(v[0], 1)}, ${f(v[1], 1)})`],
              ['\\text{rise above Lyra}', `${f(apex, 1)} px`],
            ]}
          />
          <div className="math-note">Drag the slime or move it with the arrow keys after clicking the game. Press J or Space to throw.</div>
        </>
      }
      below={<CodeBlock code={code} file="scripts/math/lob_math.gd" compact />}
    >
      <div ref={wrap} onPointerDown={onPointer} onPointerMove={onPointer} onPointerUp={onPointer} onPointerCancel={onPointer} style={{ width: '100%', touchAction: 'none' }}>
        <GameCanvas width={W} height={H} update={update} draw={draw} touchButtons={['up', 'down', 'left', 'right', 'attack']} keysHint={<Keys items={[['arrows', 'move target'], ['J / Space', 'throw']]} />} label="projectile lab: drag the target, press J or space to throw" />
      </div>
    </FigureLayout>
  );
}
