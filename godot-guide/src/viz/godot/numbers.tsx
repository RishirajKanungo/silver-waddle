// godot.numbers: two GDScript number traps a game hits early.
//  1. Integer division truncates toward zero, so pixel → tile conversion breaks left of / above the
//     origin. Compare a / b, a % b, floori(a / float(b)) and posmod(a, b) on a number line.
//  2. Floats are binary: adding 0.1 ten times is not 1.0. Compare ==, is_equal_approx and the error.
import { useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Slider, SegControl, Readout, FigureLayout } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import './godot.css';

/** GDScript int / int: truncates toward zero (C semantics) */
export const gdDiv = (a: number, b: number) => Math.trunc(a / b);
/** GDScript int % int: sign follows the dividend */
export const gdMod = (a: number, b: number) => a - b * Math.trunc(a / b);
export const posmod = (a: number, b: number) => ((a % b) + b) % b;
/** Godot's is_equal_approx for floats (CMP_EPSILON = 0.00001, relative above 1) */
export function isEqualApprox(a: number, b: number) {
  if (a === b) return true;
  let tol = 0.00001 * Math.abs(a);
  if (tol < 0.00001) tol = 0.00001;
  return Math.abs(a - b) < tol;
}

function IntPanel() {
  const [a, setA] = useState(-5);
  const [b, setB] = useState(16);
  const lo = -48, hi = 48, Wd = 500, pad = 14;
  const sx = (v: number) => pad + ((v - lo) / (hi - lo)) * (Wd - 2 * pad);
  const trunc = gdDiv(a, b), floor = Math.floor(a / b);
  const tiles: number[] = [];
  for (let t = Math.floor(lo / b); t * b <= hi; t++) tiles.push(t);
  const code = `var x: int = ${a}       # pixel position
var tile_size: int = ${b}
print(x / tile_size)                  # ${trunc}   (truncates toward zero)
print(x % tile_size)                  # ${gdMod(a, b)}   (sign follows x)
print(floori(x / float(tile_size)))   # ${floor}   (rounds down: the tile you are in)
print(posmod(x, tile_size))           # ${posmod(a, b)}   (offset inside that tile)`;
  return (
    <FigureLayout
      side={
        <>
          <Slider label="x (pixels)" value={a} min={-48} max={48} step={1} onChange={setA} fmt={(v) => v.toFixed(0)} />
          <Slider label="tile_size" value={b} min={2} max={16} step={1} onChange={setB} fmt={(v) => v.toFixed(0)} />
          <Readout
            rows={[
              ['\\texttt{x / tile\\_size}', String(trunc)],
              ['\\texttt{floori(x / float(...))}', String(floor)],
              ['\\texttt{x \\% tile\\_size}', String(gdMod(a, b))],
              ['\\texttt{posmod(x, tile\\_size)}', String(posmod(a, b))],
            ]}
          />
          <div className={'godot-note ' + (trunc === floor ? 'godot-yes' : 'godot-no')}>{trunc === floor ? 'Both agree here.' : `They disagree: x = ${a} is inside tile ${floor}, but x / ${b} says tile ${trunc}.`}</div>
        </>
      }
      below={<CodeBlock code={code} compact />}
    >
      <svg viewBox={`0 0 ${Wd} 150`} className="godot-svg" role="img" aria-label="number line of pixel positions split into tiles">
        {tiles.map((t) => {
          const x0 = Math.max(lo, t * b), x1 = Math.min(hi, (t + 1) * b);
          if (x1 <= x0) return null;
          return (
            <g key={t}>
              <rect x={sx(x0)} y={30} width={sx(x1) - sx(x0)} height={34} className={t === floor ? 'godot-tile on' : 'godot-tile'} />
              {sx(x1) - sx(x0) > 16 && (
                <text x={(sx(x0) + sx(x1)) / 2} y={52} textAnchor="middle" className="godot-svg-small">
                  {t}
                </text>
              )}
            </g>
          );
        })}
        {/* the span that truncation lumps into tile 0 */}
        <rect x={sx(Math.max(lo, -b + 1))} y={74} width={sx(Math.min(hi, b)) - sx(Math.max(lo, -b + 1))} height={8} className="godot-bad-span" />
        <text x={sx(0)} y={96} textAnchor="middle" className="godot-svg-small">
          x / {b} gives 0 for every x from {-b + 1} to {b - 1}: {2 * b - 1} px
        </text>
        <line x1={sx(0)} x2={sx(0)} y1={22} y2={70} className="godot-axis0" />
        <line x1={sx(a)} x2={sx(a)} y1={18} y2={70} className="godot-marker" />
        <circle cx={sx(a)} cy={18} r={4} className="godot-marker-dot" />
        <text x={sx(a)} y={12} textAnchor="middle" className="godot-svg-small">
          x = {a}
        </text>
        <text x={pad} y={128} className="godot-svg-small">
          tile index (floor)
        </text>
        <text x={Wd - pad} y={128} textAnchor="end" className="godot-svg-small">
          pixels {lo} … {hi}
        </text>
      </svg>
    </FigureLayout>
  );
}

const STEPS: { v: number; label: string; src: string }[] = [
  { v: 0.1, label: '0.1', src: '0.1' },
  { v: 0.2, label: '0.2', src: '0.2' },
  { v: 1 / 60, label: '1/60 (a frame)', src: '1.0 / 60.0' },
  { v: 0.25, label: '0.25', src: '0.25' },
];
function FloatPanel() {
  const [k, setK] = useState(0);
  const [n, setN] = useState(10);
  const st = STEPS[k];
  let sum = 0;
  for (let i = 0; i < n; i++) sum += st.v;
  const target = n * st.v;
  const tv = Math.round(target * 1e6) / 1e6;
  const targetSrc = k === 2 ? `${n} / 60.0` : Number.isInteger(tv) ? tv.toFixed(1) : String(tv);
  const targetVal = k === 2 ? n / 60 : Math.round(target * 1e6) / 1e6;
  const eq = sum === targetVal;
  const approx = isEqualApprox(sum, targetVal);
  const code = `var total := 0.0
for _i in ${n}:
	total += ${st.src}
print(total == ${targetSrc})                   # ${eq}
print(is_equal_approx(total, ${targetSrc}))    # ${approx}`;
  return (
    <FigureLayout
      side={
        <>
          <SegControl label="step" value={k} onChange={setK} options={STEPS.map((s, i) => ({ v: i, label: s.label }))} />
          <Slider label="times added" value={n} min={1} max={120} step={1} onChange={setN} fmt={(v) => v.toFixed(0)} />
          <Readout
            rows={[
              ['\\text{stored}', sum.toPrecision(17)],
              ['\\text{expected}', targetVal.toPrecision(17)],
              ['\\text{error}', (sum - targetVal).toExponential(2)],
              ['\\texttt{==}', <span className={eq ? 'godot-yes' : 'godot-no'}>{String(eq)}</span>],
              ['\\texttt{is\\_equal\\_approx}', <span className={approx ? 'godot-yes' : 'godot-no'}>{String(approx)}</span>],
            ]}
          />
        </>
      }
      below={<CodeBlock code={code} compact />}
    >
      <div className="godot-col">
        <div className="godot-floatbar">
          {Array.from({ length: Math.min(n, 60) }, (_, i) => {
            let p = 0;
            for (let j = 0; j <= i; j++) p += st.v;
            const want = k === 2 ? (i + 1) / 60 : Math.round((i + 1) * st.v * 1e6) / 1e6;
            return <span key={i} className={p === want ? 'ok' : 'off'} title={`after ${i + 1}: ${p.toPrecision(17)}`} />;
          })}
        </div>
        <div className="godot-note">Each square is one addition: dark when the running total is exactly the decimal you would expect, orange when it has drifted. GDScript's float is a 64-bit double; 0.1, 0.2 and 1/60 have no exact binary form, 0.25 does.</div>
      </div>
    </FigureLayout>
  );
}

export function Numbers({ spec }: { spec: VizSpec }) {
  const [tab, setTab] = useState<'int' | 'float'>((spec.tab as 'int' | 'float') ?? 'int');
  return (
    <div className="godot-col">
      <SegControl value={tab} onChange={setTab} options={[{ v: 'int', label: 'integer division' }, { v: 'float', label: 'float comparison' }]} />
      {tab === 'int' ? <IntPanel /> : <FloatPanel />}
    </div>
  );
}
