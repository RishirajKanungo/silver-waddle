// math.easing: an easing explorer. Pick a transition (Godot's Tween.TRANS_*) and an ease (EASE_IN, EASE_OUT,
// EASE_IN_OUT); see the curve, a sprite crossing the screen with it next to a linear ghost, a UI panel popping
// with it, and the matching create_tween() code.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Curve, Point, Seg, Slider, Toggle, Readout, FigureLayout, SegControl } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { animFrame } from '../game';
import { f, gf, spriteURL, sheetInfo } from './common';

export type Trans = 'linear' | 'sine' | 'quad' | 'cubic' | 'expo' | 'back' | 'elastic' | 'bounce';
export type Ease = 'in' | 'out' | 'in_out';
export const TRANS: Trans[] = ['linear', 'sine', 'quad', 'cubic', 'expo', 'back', 'elastic', 'bounce'];

const C1 = 1.70158, C3 = C1 + 1, C4 = (2 * Math.PI) / 3;
function bounceOut(t: number) {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}
/** The "in" version of each transition (Robert Penner's equations, which Godot's Tween also uses). */
const IN: Record<Trans, (t: number) => number> = {
  linear: (t) => t,
  sine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  quad: (t) => t * t,
  cubic: (t) => t * t * t,
  expo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  back: (t) => C3 * t * t * t - C1 * t * t,
  elastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * C4)),
  bounce: (t) => 1 - bounceOut(1 - t),
};
export function ease(trans: Trans, mode: Ease, t: number): number {
  const fin = IN[trans];
  if (mode === 'in') return fin(t);
  if (mode === 'out') return 1 - fin(1 - t);
  return t < 0.5 ? fin(2 * t) / 2 : 1 - fin(2 * (1 - t)) / 2;
}

const FEEL: Record<Trans, string> = {
  linear: 'constant speed: mechanical, good for loops and progress bars',
  sine: 'gentle: the softest start or stop',
  quad: 'a natural, quick acceleration or braking',
  cubic: 'stronger: most of the motion happens at one end',
  expo: 'very sharp: almost instant, then a long settle',
  back: 'overshoots past the target and comes back (out) or winds up first (in)',
  elastic: 'springs past the target several times',
  bounce: 'lands like a dropped ball',
};

export function EasingLab({ spec }: { spec: VizSpec }) {
  const [trans, setTrans] = useState<Trans>((spec.trans as Trans) ?? 'back');
  const [mode, setMode] = useState<Ease>((spec.ease as Ease) ?? 'out');
  const [dur, setDur] = useState(0.6);
  const [playing, setPlaying] = useState(true);
  const [t, setT] = useState(0.62);
  const clock = useRef(0);
  useEffect(() => {
    if (!playing) return;
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      clock.current += Math.min(0.1, (now - last) / 1000);
      last = now;
      const cycle = dur + 0.7; // play, then hold at the end for 0.7 s
      setT(Math.min(1, (clock.current % cycle) / dur));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, dur]);

  const y = ease(trans, mode, t);
  const samples = useMemo(() => Array.from({ length: 201 }, (_, i) => ease(trans, mode, i / 200)), [trans, mode]);
  const maxV = Math.max(...samples), minV = Math.min(...samples);
  const slope0 = (ease(trans, mode, 0.001) - ease(trans, mode, 0)) / 0.001;
  const godot = `TRANS_${trans.toUpperCase()}`, gEase = `EASE_${mode.toUpperCase()}`;
  const code = `var tween := create_tween()
tween.tween_property($Kai, "position:x", 280.0, ${gf(dur, 2)}) \\
		.set_trans(Tween.${godot}).set_ease(Tween.${gEase})
# the panel pops in from nothing at the same time:
tween.parallel().tween_property($Panel, "scale", Vector2.ONE, ${gf(dur, 2)}) \\
		.from(Vector2.ZERO).set_trans(Tween.${godot}).set_ease(Tween.${gEase})`;

  // track: 0..1 maps to x 24..264 in a 320×64 strip
  const X = (v: number) => 24 + v * 240;
  const hero = sheetInfo('hero');
  const frame = animFrame('hero', t < 1 ? 'walk_side' : 'idle_side', clock.current);
  return (
    <FigureLayout
      side={
        <>
          <div className="math-list" role="radiogroup" aria-label="transition">
            {TRANS.map((tr) => (
              <button key={tr} role="radio" aria-checked={tr === trans} className={tr === trans ? 'on' : ''} onClick={() => setTrans(tr)}>
                {tr}
              </button>
            ))}
          </div>
          <SegControl
            label="ease"
            value={mode}
            onChange={setMode}
            options={[
              { v: 'in', label: 'in' },
              { v: 'out', label: 'out' },
              { v: 'in_out', label: 'in_out' },
            ]}
          />
          <Slider label="duration (s)" value={dur} min={0.2} max={2} step={0.05} onChange={setDur} fmt={(v) => v.toFixed(2)} />
          <Toggle label="play" value={playing} onChange={setPlaying} />
          {!playing && <Slider label="t" value={t} min={0} max={1} step={0.01} onChange={setT} fmt={(v) => v.toFixed(2)} />}
          <Readout
            rows={[
              ['t', f(t)],
              ['f(t)', f(y, 3)],
              ['f(0.5)', f(ease(trans, mode, 0.5), 3)],
              ['\\max f', f(maxV, 3)],
              ['\\min f', f(minV, 3)],
              ["f'(0) \\text{ (start speed)}", f(slope0, 2)],
            ]}
          />
          <div className="math-note">{FEEL[trans]}</div>
        </>
      }
      below={
        <div className="math-stack">
          <svg viewBox="0 0 320 64" className="math-track" role="img" aria-label="Kai moving with the easing, a linear ghost and a popping panel">
            <rect x={0} y={0} width={320} height={64} className="pl-bg" />
            <line x1={X(0)} x2={X(1)} y1={52} y2={52} className="pl-axis" />
            <line x1={X(1)} x2={X(1)} y1={14} y2={56} className="pl-grid" />
            <text x={X(0)} y={62} className="pl-tick" textAnchor="middle">
              0
            </text>
            <text x={X(1)} y={62} className="pl-tick" textAnchor="middle">
              1
            </text>
            <circle cx={X(t)} cy={52} r={3} style={{ fill: 'var(--muted)', opacity: 0.6 }} />
            <image href={spriteURL('hero', frame)} x={X(y) - hero.origin[0]} y={52 - hero.origin[1]} width={hero.fw} height={hero.fh} className="math-sprite" style={{ imageRendering: 'pixelated' }} />
            <g transform={`translate(296 30) scale(${Math.max(0, y)})`}>
              <rect x={-14} y={-10} width={28} height={20} rx={3} style={{ fill: 'var(--accent-soft)', stroke: 'var(--accent)', strokeWidth: 1.5 }} />
              <text x={0} y={4} textAnchor="middle" className="pl-tick">
                UI
              </text>
            </g>
          </svg>
          <CodeBlock code={code} compact />
        </div>
      }
    >
      <Plane x={[-0.05, 1.05]} y={[-0.4, 1.4]} width={420} height={360} gridStep={0.25} ariaLabel="easing curve">
        <Seg a={[0, 0]} b={[1, 1]} color="var(--muted)" dashed opacity={0.6} />
        <Seg a={[0, 1]} b={[1.05, 1]} color="var(--muted)" width={1} opacity={0.5} />
        <Curve f={(x) => ease(trans, mode, Math.max(0, Math.min(1, x)))} x0={0} x1={1} color="var(--c-u)" width={2.6} samples={300} />
        <Seg a={[t, 0]} b={[t, y]} color="var(--c-v)" dashed />
        <Point at={[t, y]} color="var(--c-v)" />
      </Plane>
    </FigureLayout>
  );
}
