// math.cone: a skeleton guard with a vision cone. Mirrors the lesson's vision_cone.gd:
//   can_see(p): (p - pos).length() <= view_range and facing.dot((p - pos).normalized()) >= cos(half_angle)
//   when it sees Kai: facing = facing.rotated(clampf(facing.angle_to(to_target), -turn * delta, turn * delta))
// The cross product's sign says which way it turns (positive: clockwise on screen, the guard's right).
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, text, drawFrame, animFrame, type Input } from '../game';
import { Slider, Toggle, Readout, FigureLayout } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { arrow, grass, hud, f, gf, rad, deg, clamp, type V } from './common';

const W = 320, H = 180;
type Facing = 'down' | 'up' | 'side';

export function ConeLab({ spec }: { spec: VizSpec }) {
  const [angle, setAngle] = useState((spec.angle as number) ?? 90);
  const [range, setRange] = useState((spec.range as number) ?? 96);
  const [turn, setTurn] = useState(120);
  const [patrol, setPatrol] = useState(true);
  const s = useRef({ kai: [80, 120] as V, face: 'side' as Facing, flip: false, moving: false, pos: [220, 84] as V, facing: [-1, 0] as V, t: 0, n: 0, seen: false }).current;
  const [ro, setRo] = useState({ dot: 0, dist: 0, cross: 0, seen: false, ang: 0 });

  const look = (p: V) => {
    const to: V = [p[0] - s.pos[0], p[1] - s.pos[1]];
    const d = Math.hypot(to[0], to[1]);
    const n: V = d > 0 ? [to[0] / d, to[1] / d] : [0, 0];
    const dt = s.facing[0] * n[0] + s.facing[1] * n[1];
    const cr = s.facing[0] * to[1] - s.facing[1] * to[0];
    return { to, d, dot: dt, cross: cr, seen: d <= range && dt >= Math.cos(rad(angle / 2)) };
  };
  const rotateToward = (want: V, maxStep: number) => {
    const fa = Math.atan2(s.facing[1], s.facing[0]);
    const delta = Math.atan2(s.facing[0] * want[1] - s.facing[1] * want[0], s.facing[0] * want[0] + s.facing[1] * want[1]); // angle_to
    const a = fa + clamp(delta, -maxStep, maxStep);
    s.facing = [Math.cos(a), Math.sin(a)];
  };

  const update = (dt: number, input: Input) => {
    const [ix, iy] = input.vector();
    s.moving = ix !== 0 || iy !== 0;
    s.kai = [clamp(s.kai[0] + ix * 70 * dt, 10, W - 10), clamp(s.kai[1] + iy * 70 * dt, 26, H - 4)];
    if (s.moving) {
      if (Math.abs(ix) > Math.abs(iy)) {
        s.face = 'side';
        s.flip = ix < 0;
      } else s.face = iy < 0 ? 'up' : 'down';
    }
    s.t += dt;
    const target: V = [s.kai[0], s.kai[1] - 10];
    const l = look(target);
    const step = rad(turn) * dt;
    if (l.seen) rotateToward(l.to, step);
    else if (patrol) {
      const pa = Math.PI + 0.7 * Math.sin(0.6 * s.t);
      rotateToward([Math.cos(pa), Math.sin(pa)], step * 0.5);
    }
    s.seen = l.seen;
    if (++s.n % 5 === 0) setRo({ dot: l.dot, dist: l.d, cross: l.cross, seen: l.seen, ang: Math.atan2(s.facing[1], s.facing[0]) });
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    grass(ctx, drawFrame);
    const half = rad(angle / 2);
    const fa = Math.atan2(s.facing[1], s.facing[0]);
    ctx.beginPath();
    ctx.moveTo(s.pos[0], s.pos[1]);
    for (let i = 0; i <= 24; i++) {
      const a = fa - half + (2 * half * i) / 24;
      ctx.lineTo(s.pos[0] + Math.cos(a) * range, s.pos[1] + Math.sin(a) * range);
    }
    ctx.closePath();
    ctx.fillStyle = s.seen ? 'rgba(255,70,50,0.35)' : 'rgba(255,255,160,0.22)';
    ctx.fill();
    ctx.strokeStyle = s.seen ? 'rgba(255,90,70,0.9)' : 'rgba(255,255,200,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    const target: V = [s.kai[0], s.kai[1] - 10];
    // skeleton (side sprites face right; flip when facing left)
    drawFrame(ctx, 'skeleton', animFrame('skeleton', 'idle', s.t), s.pos[0], s.pos[1] + 10, { anchored: true, flipH: s.facing[0] < 0 });
    drawFrame(ctx, 'hero', animFrame('hero', (s.moving ? 'walk_' : 'idle_') + s.face, s.t), s.kai[0], s.kai[1], { anchored: true, flipH: s.flip });
    arrow(ctx, s.pos[0], s.pos[1], s.pos[0] + s.facing[0] * 22, s.pos[1] + s.facing[1] * 22, '#8fc7ff', 2, 5);
    arrow(ctx, s.pos[0], s.pos[1], target[0], target[1], 'rgba(255,179,71,0.8)', 1, 4);
    if (s.seen) text(ctx, '!', s.pos[0] - 1, s.pos[1] - 22, '#ff5a46');
    const l = look(target);
    hud(
      ctx,
      [
        [`dot ${l.dot.toFixed(2)} vs ${Math.cos(half).toFixed(2)}`, '#ffffff'],
        [`distance ${l.d.toFixed(0)} / ${range}`, '#ffffff'],
        [Math.abs(l.cross) < 0.5 ? 'cross 0: straight ahead' : `cross ${l.cross > 0 ? '+' : '-'}: on its ${l.cross > 0 ? 'right' : 'left'}`, '#ffb347'],
      ],
      2,
      2,
      'left',
      text,
    );
  };

  const code = useMemo(
    () => `extends Node2D

@export var view_range := ${gf(range)}
@export var view_angle_degrees := ${gf(angle)}  ## full width of the cone
@export var turn_speed_degrees := ${gf(turn)}

var facing := Vector2.LEFT


func can_see(point: Vector2) -> bool:
	var to_point := point - global_position
	if to_point.length() > view_range:
		return false
	var cos_half := cos(deg_to_rad(view_angle_degrees * 0.5))  # ${f(Math.cos(rad(angle / 2)))}
	return facing.dot(to_point.normalized()) >= cos_half
`,
    [range, angle, turn],
  );
  return (
    <FigureLayout
      side={
        <>
          <Slider label="view angle°" value={angle} min={20} max={180} step={5} onChange={setAngle} fmt={(v) => v.toFixed(0)} />
          <Slider label="view_range" value={range} min={40} max={160} step={4} onChange={setRange} fmt={(v) => v.toFixed(0)} />
          <Slider label="turn °/s" value={turn} min={0} max={360} step={15} onChange={setTurn} fmt={(v) => v.toFixed(0)} />
          <Toggle label="guard looks around" value={patrol} onChange={setPatrol} />
          <Readout
            rows={[
              ['\\hat{\\mathbf{f}}\\cdot\\hat{\\mathbf{d}}', f(ro.dot)],
              ['\\cos(\\text{half angle})', f(Math.cos(rad(angle / 2)))],
              ['|\\mathbf{d}|', f(ro.dist, 1)],
              ['\\mathbf{f}\\times\\mathbf{d}', f(ro.cross, 0)],
              ['\\text{facing.angle()}', `${f(deg(ro.ang), 0)}°`],
            ]}
          />
          <div className="math-note">
            <span className={'math-badge ' + (ro.seen ? 'bad' : 'ok')}>{ro.seen ? 'seen' : 'hidden'}</span> f is the guard's facing, d points from the guard to Kai.
          </div>
        </>
      }
      below={<CodeBlock code={code} file="scripts/math/vision_cone.gd" compact />}
    >
      <GameCanvas width={W} height={H} update={update} draw={draw} touchButtons={['up', 'down', 'left', 'right']} keysHint={<Keys items={[['WASD / arrows', 'move Kai']]} />} label="vision cone test: sneak Kai past the skeleton with WASD or arrow keys" />
    </FigureLayout>
  );
}
