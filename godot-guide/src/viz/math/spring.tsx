// math.spring: a damped spring parameterised by frequency f (Hz) and damping ratio ζ, integrated at 60 Hz with
// semi-implicit Euler exactly like spring_follow.gd:
//   accel = ω²(target - x) - 2ζω v;  v += accel * delta;  x += v * delta
// Drag the target; the slime follows (and squashes with its speed). The plot is the step response.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Handle, Seg, Slider, Toggle, Readout, FigureLayout, LinePlot, Btn } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { animFrame } from '../game';
import { f, gf, PlaneSprite } from './common';

function stepResponse(freq: number, zeta: number, T = 1.5) {
  const w = 2 * Math.PI * freq, dt = 1 / 60;
  let x = 0, v = 0;
  const pts: [number, number][] = [[0, 0]];
  for (let n = 1; n * dt <= T + 1e-9; n++) {
    v += (w * w * (1 - x) - 2 * zeta * w * v) * dt;
    x += v * dt;
    pts.push([n * dt, x]);
  }
  return pts;
}

export function SpringLab({ spec }: { spec: VizSpec }) {
  const [freq, setFreq] = useState((spec.frequency as number) ?? 3);
  const [zeta, setZeta] = useState((spec.damping as number) ?? 0.4);
  const [squash, setSquash] = useState(true);
  const [target, setTarget] = useState(150);
  const p = useRef({ freq, zeta, target });
  p.current = { freq, zeta, target };
  const s = useRef({ x: 50, v: 0, acc: 0, t: 0 }).current;
  const [, tick] = useState(0);
  useEffect(() => {
    let raf = 0, last = performance.now();
    const dt = 1 / 60;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      s.acc += Math.min(0.1, (now - last) / 1000);
      last = now;
      const { freq, zeta, target } = p.current;
      const w = 2 * Math.PI * freq;
      while (s.acc >= dt) {
        const accel = w * w * (target - s.x) - 2 * zeta * w * s.v;
        s.v += accel * dt; // velocity first…
        s.x += s.v * dt; // …then position: semi-implicit Euler
        if (!Number.isFinite(s.x) || Math.abs(s.x) > 1e4) {
          s.x = target;
          s.v = 0;
        }
        s.acc -= dt;
        s.t += dt;
      }
      tick((n) => (n + 1) % 1e6);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [s]);

  const w = 2 * Math.PI * freq;
  const under = zeta < 1;
  const overshoot = under ? Math.exp((-zeta * Math.PI) / Math.sqrt(1 - zeta * zeta)) : 0;
  const peakT = under ? Math.PI / (w * Math.sqrt(1 - zeta * zeta)) : NaN;
  const settle = zeta > 0 ? 4 / (Math.min(zeta, 1) * w) : Infinity;
  const resp = useMemo(() => stepResponse(freq, zeta), [freq, zeta]);
  const speed = Math.abs(s.v);
  const sx = squash ? 1 + Math.min(0.6, speed / 600) : 1;
  const code = `extends Node2D

@export var target: Node2D
@export var frequency := ${gf(freq, 2)}      ## Hz: oscillations per second without damping
@export var damping_ratio := ${gf(zeta, 2)}  ## 0 = bounces forever, 1 = no overshoot

var spring_velocity := Vector2.ZERO


func _physics_process(delta: float) -> void:
	var omega := TAU * frequency  # ${f(w, 2)} rad/s
	var accel := omega * omega * (target.global_position - global_position) \\
			- 2.0 * damping_ratio * omega * spring_velocity
	spring_velocity += accel * delta
	global_position += spring_velocity * delta
`;
  return (
    <FigureLayout
      side={
        <>
          <Slider label="frequency (Hz)" value={freq} min={0.5} max={8} step={0.25} onChange={setFreq} fmt={(v) => v.toFixed(2)} />
          <Slider label="damping ratio ζ" value={zeta} min={0} max={1.5} step={0.05} onChange={setZeta} fmt={(v) => v.toFixed(2)} />
          <Toggle label="squash and stretch from speed" value={squash} onChange={setSquash} />
          <div className="math-row">
            <Btn onClick={() => setTarget(target > 100 ? 40 : 160)}>Jump target</Btn>
            <Btn onClick={() => (s.v += 500)}>Kick</Btn>
          </div>
          <Readout
            rows={[
              ['\\omega = 2\\pi f', `${f(w, 2)} rad/s`],
              ['\\text{overshoot } e^{-\\pi\\zeta/\\sqrt{1-\\zeta^2}}', under ? `${f(overshoot * 100, 1)}%` : 'none'],
              ['\\text{first peak } \\pi/\\omega_d', under ? `${f(peakT, 3)} s` : '–'],
              ['\\text{settles (2\\%) } \\approx 4/(\\zeta\\omega)', Number.isFinite(settle) ? `${f(settle, 2)} s` : 'never'],
              ['\\omega\\,\\Delta t \\text{ at 60 Hz}', f(w / 60, 3)],
            ]}
          />
        </>
      }
      below={
        <div className="math-stack">
          <LinePlot
            series={[{ pts: resp, color: 'var(--c-u)', label: 'x(t), target = 1', width: 2 }]}
            x={[0, 1.5]}
            y={[-0.1, 2]}
            xlabel="time (s)"
            ylabel="position"
            hlines={[{ y: 1, color: 'var(--muted)' }, ...(under && zeta > 0 ? [{ y: 1 + overshoot, color: 'var(--c-err)' }] : [])]}
            legend="tr"
            height={200}
          />
          <CodeBlock code={code} file="scripts/math/spring_follow.gd" compact />
        </div>
      }
    >
      <Plane x={[0, 200]} y={[-30, 40]} width={480} grid={false} axes={false} ariaLabel="spring follower: drag the target">
        <Seg a={[0, 0]} b={[200, 0]} color="var(--line)" width={2} />
        <Seg a={[s.x, -8]} b={[target, -8]} color="var(--c-v)" width={1.5} dashed opacity={0.7} />
        <PlaneSprite at={[s.x, 0]} id="slime" frame={animFrame('slime', 'idle', s.t)} k={2.4} sx={sx} sy={1 / sx} />
        <Seg a={[target, -14]} b={[target, 30]} color="var(--c-err)" width={1.5} dashed />
        <Handle at={[target, -14]} onChange={(pt) => setTarget(pt[0])} bounds={{ x: [5, 195], y: [-14, -14] }} color="var(--c-err)" text="target" label="spring target" />
      </Plane>
    </FigureLayout>
  );
}
