// math.seek: a bat chases Kai. Mirrors the lesson's chaser script:
//   var to_target := target - global_position
//   if to_target.length() < stop_distance: return
//   velocity = to_target.normalized() * speed      (or the buggy to_target * speed)
//   global_position += velocity * delta
// Draws the position vectors from the origin, the displacement, the unit direction and the velocity.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, text, drawFrame, animFrame, rect, type Input } from '../game';
import { Slider, Toggle, Readout, FigureLayout } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { arrow, dashed, grass, hud, f, gf, type V } from './common';

const W = 320, H = 180;
type Facing = 'down' | 'up' | 'side';

export function SeekLab({ spec }: { spec: VizSpec }) {
  const [speed, setSpeed] = useState((spec.speed as number) ?? 50);
  const [stop, setStop] = useState(6);
  const [normalize, setNormalize] = useState(true);
  const [showPos, setShowPos] = useState(true);
  const s = useRef({ kai: [210, 110] as V, kv: [0, 0] as V, face: 'down' as Facing, flip: false, bat: [60, 50] as V, bv: [0, 0] as V, t: 0, n: 0 }).current;
  const [ro, setRo] = useState({ kai: [210, 110] as V, bat: [60, 50] as V, speed: 0 });

  const update = (dt: number, input: Input) => {
    const [ix, iy] = input.vector();
    s.kv = [ix * 80, iy * 80];
    s.kai = [Math.max(12, Math.min(W - 12, s.kai[0] + s.kv[0] * dt)), Math.max(28, Math.min(H - 4, s.kai[1] + s.kv[1] * dt))];
    if (ix || iy) {
      if (Math.abs(ix) > Math.abs(iy)) {
        s.face = 'side';
        s.flip = ix < 0;
      } else s.face = iy < 0 ? 'up' : 'down';
    }
    // the chaser: aim at Kai's middle, not his feet
    const target: V = [s.kai[0], s.kai[1] - 10];
    const to: V = [target[0] - s.bat[0], target[1] - s.bat[1]];
    const dist = Math.hypot(to[0], to[1]);
    if (dist < stop) s.bv = [0, 0];
    else s.bv = normalize ? [(to[0] / dist) * speed, (to[1] / dist) * speed] : [to[0] * speed, to[1] * speed];
    s.bat = [s.bat[0] + s.bv[0] * dt, s.bat[1] + s.bv[1] * dt];
    s.t += dt;
    if (++s.n % 6 === 0) setRo({ kai: [...s.kai] as V, bat: [...s.bat] as V, speed: Math.hypot(s.bv[0], s.bv[1]) });
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    grass(ctx, drawFrame);
    const target: V = [s.kai[0], s.kai[1] - 10];
    if (showPos) {
      // the origin and position vectors
      rect(ctx, 0, 0, 3, 3, '#ffffff');
      text(ctx, '(0,0)', 4, 9, '#ffffff');
      dashed(ctx, 0, 0, s.bat[0], s.bat[1], 'rgba(255,255,255,0.55)');
      dashed(ctx, 0, 0, target[0], target[1], 'rgba(255,255,255,0.55)');
    }
    const sp = Math.hypot(s.kv[0], s.kv[1]);
    drawFrame(ctx, 'hero', animFrame('hero', (sp > 1 ? 'walk_' : 'idle_') + s.face, s.t), s.kai[0], s.kai[1], { anchored: true, flipH: s.flip });
    drawFrame(ctx, 'bat', animFrame('bat', 'fly', s.t), s.bat[0], s.bat[1] + 6, { anchored: true, flipH: s.bv[0] < 0 });
    const to: V = [target[0] - s.bat[0], target[1] - s.bat[1]];
    const dist = Math.hypot(to[0], to[1]);
    // displacement (orange), unit direction ×16 (green), velocity × 0.25 s (blue)
    arrow(ctx, s.bat[0], s.bat[1], target[0], target[1], '#ffb347', 1, 5);
    if (dist > 0.5) arrow(ctx, s.bat[0], s.bat[1], s.bat[0] + (to[0] / dist) * 16, s.bat[1] + (to[1] / dist) * 16, '#7dff9a', 2, 4);
    const vl = Math.min(300, Math.hypot(s.bv[0], s.bv[1]) * 0.25);
    const vn = Math.hypot(s.bv[0], s.bv[1]);
    if (vn > 0.5) arrow(ctx, s.bat[0], s.bat[1] - 1, s.bat[0] + (s.bv[0] / vn) * vl, s.bat[1] - 1 + (s.bv[1] / vn) * vl, '#8fc7ff', 1, 4);
    hud(
      ctx,
      [
        [`to_target length ${dist.toFixed(0)}`, '#ffb347'],
        ['direction (x16)', '#7dff9a'],
        [`velocity ${vn.toFixed(0)} px/s`, '#8fc7ff'],
      ],
      W - 2,
      2,
      'right',
      text,
    );
  };

  const code = useMemo(
    () => `extends Node2D

@export var speed := ${gf(speed)}
@export var stop_distance := ${gf(stop)}


func _physics_process(delta: float) -> void:
	var to_target := get_global_mouse_position() - global_position
	if to_target.length() < stop_distance:
		return
	var velocity := ${normalize ? 'to_target.normalized() * speed' : 'to_target * speed  # bug: speed now depends on distance'}
	global_position += velocity * delta
`,
    [speed, stop, normalize],
  );
  const to: V = [ro.kai[0] - ro.bat[0], ro.kai[1] - 10 - ro.bat[1]];
  const dist = Math.hypot(to[0], to[1]);
  return (
    <FigureLayout
      side={
        <>
          <Slider label="speed" value={speed} min={10} max={150} step={5} onChange={setSpeed} fmt={(v) => v.toFixed(0)} />
          <Slider label="stop_distance" value={stop} min={0} max={20} step={1} onChange={setStop} fmt={(v) => v.toFixed(0)} />
          <Toggle label="normalize to_target" value={normalize} onChange={setNormalize} />
          <Toggle label="show position vectors" value={showPos} onChange={setShowPos} />
          <Readout
            rows={[
              ['\\text{Kai (target)}', `(${f(ro.kai[0], 0)}, ${f(ro.kai[1] - 10, 0)})`],
              ['\\text{bat position}', `(${f(ro.bat[0], 0)}, ${f(ro.bat[1], 0)})`],
              ['\\text{to\\_target}', `(${f(to[0], 0)}, ${f(to[1], 0)})`],
              ['|\\text{to\\_target}|', f(dist, 1)],
              ['|\\mathbf{v}| \\text{ (px/s)}', f(ro.speed, 1)],
            ]}
          />
        </>
      }
      below={<CodeBlock code={code} file="scripts/math/chaser.gd" compact />}
    >
      <GameCanvas width={W} height={H} update={update} draw={draw} touchButtons={['up', 'down', 'left', 'right']} keysHint={<Keys items={[['WASD / arrows', 'move Kai']]} />} label="a bat chasing Kai: move with WASD or arrow keys" />
    </FigureLayout>
  );
}
