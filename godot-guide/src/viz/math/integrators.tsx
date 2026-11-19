// math.integrators: explicit versus semi-implicit Euler at a chosen physics rate.
//   mode 'jump':   a jump with v0 = 2h/t and g = 2h/t², height over time, against the exact parabola.
//   mode 'spring': an undamped spring x'' = -ω²x, where explicit Euler gains energy every step.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { LinePlot, Slider, SegControl, Readout, FigureLayout, type Series } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { f, gf } from './common';

type Mode = 'jump' | 'spring';

function simulate(mode: Mode, hz: number, h: number, tApex: number, freq: number) {
  const dt = 1 / hz;
  const exp: [number, number][] = [], semi: [number, number][] = [], exact: [number, number][] = [];
  if (mode === 'jump') {
    const g = (2 * h) / (tApex * tApex), v0 = (2 * h) / tApex;
    const T = 2 * tApex;
    for (let i = 0; i <= 200; i++) {
      const t = (T * i) / 200;
      exact.push([t, v0 * t - 0.5 * g * t * t]);
    }
    // height y (up positive), velocity v (up positive), gravity pulls down
    let ye = 0, ve = v0, ys = 0, vs = v0;
    exp.push([0, 0]);
    semi.push([0, 0]);
    for (let n = 1; n * dt <= T + 1e-9; n++) {
      ye += ve * dt; // explicit: move with the old velocity…
      ve -= g * dt; // …then update it
      vs -= g * dt; // semi-implicit: update the velocity first…
      ys += vs * dt; // …then move with the new one
      exp.push([n * dt, ye]);
      semi.push([n * dt, ys]);
    }
    return { exp, semi, exact, g, v0, dt };
  }
  const w = 2 * Math.PI * freq;
  const T = 4;
  for (let i = 0; i <= 400; i++) exact.push([(T * i) / 400, Math.cos((w * T * i) / 400)]);
  let xe = 1, ve = 0, xs = 1, vs = 0;
  exp.push([0, 1]);
  semi.push([0, 1]);
  for (let n = 1; n * dt <= T + 1e-9; n++) {
    const ae = -w * w * xe;
    xe += ve * dt;
    ve += ae * dt;
    vs += -w * w * xs * dt;
    xs += vs * dt;
    exp.push([n * dt, xe]);
    semi.push([n * dt, xs]);
  }
  return { exp, semi, exact, g: w, v0: 0, dt, energy: { e: 0.5 * ve * ve + 0.5 * w * w * xe * xe, s: 0.5 * vs * vs + 0.5 * w * w * xs * xs, e0: 0.5 * w * w } };
}

export function IntegratorLab({ spec }: { spec: VizSpec }) {
  const [mode, setMode] = useState<Mode>((spec.mode as Mode) ?? 'jump');
  const [hz, setHz] = useState((spec.hz as number) ?? 20);
  const [h, setH] = useState(48);
  const [tApex, setTApex] = useState(0.4);
  const [freq, setFreq] = useState(1);
  const sim = useMemo(() => simulate(mode, hz, h, tApex, freq), [mode, hz, h, tApex, freq]);
  const maxOf = (pts: [number, number][]) => Math.max(...pts.map((p) => p[1]));
  const series: Series[] = [
    { pts: sim.exact, color: 'var(--muted)', label: mode === 'jump' ? 'exact parabola' : 'exact cos(ωt)', dashed: true, width: 1.5 },
    { pts: sim.exp, color: 'var(--c-err)', label: 'explicit Euler', width: 1.5 },
    { pts: sim.semi, color: 'var(--c-u)', label: 'semi-implicit Euler', width: 2 },
  ];
  const dots: Series[] = [
    { pts: sim.exp, color: 'var(--c-err)', scatter: true },
    { pts: sim.semi, color: 'var(--c-u)', scatter: true },
  ];
  const showDots = hz <= 40;
  const code =
    mode === 'jump'
      ? `# ${hz} physics frames per second: delta = ${f(sim.dt, 4)}
# explicit Euler: move with the old velocity, then change it
position.y += velocity.y * delta
velocity.y += gravity * delta

# semi-implicit Euler (what "velocity += …; move_and_slide()" does)
velocity.y += gravity * delta     # gravity = ${gf(sim.g)}
position.y += velocity.y * delta  # jump velocity = -${gf(sim.v0)}`
      : `# spring toward 0 with omega = ${f(sim.g)} (${freq} Hz), delta = ${f(sim.dt, 4)}
# explicit Euler: energy grows every step
var accel := -omega * omega * x
x += v * delta
v += accel * delta

# semi-implicit Euler: energy stays bounded
v += -omega * omega * x * delta
x += v * delta`;
  const rows: [string, string][] =
    mode === 'jump'
      ? [
          ['g = 2h/t^2', `${f(sim.g, 0)} px/s²`],
          ['v_0 = 2h/t', `${f(sim.v0, 0)} px/s`],
          ['\\text{apex, exact}', `${f(h, 2)} px`],
          ['\\text{apex, explicit}', `${f(maxOf(sim.exp), 2)} px`],
          ['\\text{apex, semi-implicit}', `${f(maxOf(sim.semi), 2)} px`],
          ['\\pm v_0\\,\\Delta t/2', `${f((sim.v0 * sim.dt) / 2, 2)} px`],
        ]
      : [
          ['\\omega = 2\\pi f', f(sim.g)],
          ['\\omega\\,\\Delta t', f(sim.g * sim.dt, 3)],
          ['E/E_0 \\text{ explicit, 4 s}', f((sim.energy?.e ?? 0) / (sim.energy?.e0 ?? 1), 2)],
          ['E/E_0 \\text{ semi-implicit, 4 s}', f((sim.energy?.s ?? 0) / (sim.energy?.e0 ?? 1), 2)],
        ];
  return (
    <FigureLayout
      side={
        <>
          <SegControl
            label="system"
            value={mode}
            onChange={setMode}
            options={[
              { v: 'jump', label: 'jump' },
              { v: 'spring', label: 'spring' },
            ]}
          />
          <Slider label="physics Hz" value={hz} min={5} max={120} step={5} onChange={setHz} fmt={(v) => v.toFixed(0)} />
          {mode === 'jump' ? (
            <>
              <Slider label="jump height h" value={h} min={16} max={96} step={4} onChange={setH} fmt={(v) => v.toFixed(0)} />
              <Slider label="time to apex t" value={tApex} min={0.2} max={0.6} step={0.05} onChange={setTApex} fmt={(v) => v.toFixed(2)} />
            </>
          ) : (
            <Slider label="frequency (Hz)" value={freq} min={0.5} max={4} step={0.5} onChange={setFreq} fmt={(v) => v.toFixed(1)} />
          )}
          <Readout rows={rows} />
        </>
      }
      below={<CodeBlock code={code} compact />}
    >
      <LinePlot
        series={showDots ? [...series, ...dots] : series}
        x={mode === 'jump' ? [0, 2 * tApex] : [0, 4]}
        y={mode === 'jump' ? [-4, 110] : [-3, 3]}
        xlabel="time (s)"
        ylabel={mode === 'jump' ? 'height (px)' : 'x'}
        legend="tr"
        height={280}
      />
    </FigureLayout>
  );
}
