import { useEffect, useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { LinePlot, Slider, Readout, FigureLayout, SegControl, Toggle, Btn } from '../kit';
import { fmt, sig, sigTeX } from './util';
import { CURVE_DATA } from './curvedata';
import { SCENARIOS, startRun, type Scenario, type RunOut } from './curves';
import './dl.css';

// ------------------------------------------------------------------ dl.lrschedule

type Sched = 'cosine' | 'linear' | 'wsd' | 'constant';
export function lrAt(t: number, o: { sched: Sched; peak: number; minLr: number; warm: number; total: number; decayFrac: number }): number {
  const { sched, peak, minLr, warm, total, decayFrac } = o;
  if (t < warm) return (peak * t) / warm;
  if (sched === 'constant') return peak;
  if (sched === 'wsd') {
    const ds = total - decayFrac * total;
    if (t < ds) return peak;
    return peak - ((peak - minLr) * (t - ds)) / Math.max(1, total - ds);
  }
  const p = Math.min(1, (t - warm) / Math.max(1, total - warm));
  if (sched === 'linear') return peak - (peak - minLr) * p;
  return minLr + 0.5 * (peak - minLr) * (1 + Math.cos(Math.PI * p));
}

/**
 * dl.lrschedule — learning-rate schedules with linear warmup: cosine, linear, warmup-stable-decay, constant.
 * params: sched, peak, minLr, warm, total, t
 */
function LrSchedule({ spec }: { spec: VizSpec }) {
  const [sched, setSched] = useState<Sched>((spec.sched as Sched) ?? 'cosine');
  const [peakE4, setPeak] = useState(((spec.peak as number) ?? 3e-4) * 1e4);
  const [minFrac, setMinFrac] = useState(((spec.minLr as number) ?? 3e-5) / ((spec.peak as number) ?? 3e-4));
  const [warm, setWarm] = useState((spec.warm as number) ?? 1000);
  const [total, setTotal] = useState((spec.total as number) ?? 11000);
  const [t, setT] = useState((spec.t as number) ?? 6000);
  const peak = peakE4 * 1e-4;
  const o = { sched, peak, minLr: minFrac * peak, warm: Math.min(warm, total - 100), total, decayFrac: 0.2 };
  const pts = useMemo(() => Array.from({ length: 301 }, (_, i) => {
    const s = (total * i) / 300;
    return [s, lrAt(s, o) * 1e4] as [number, number];
  }), [sched, peak, minFrac, warm, total]); // eslint-disable-line react-hooks/exhaustive-deps
  const tt = Math.min(t, total);
  const eta = lrAt(tt, o);
  const p = Math.max(0, Math.min(1, (tt - o.warm) / (total - o.warm)));
  const formula: Record<Sched, string> = {
    cosine: '\\eta_{\\min} + \\tfrac12(\\eta_{\\max}-\\eta_{\\min})(1+\\cos\\pi p)',
    linear: '\\eta_{\\max} - (\\eta_{\\max}-\\eta_{\\min})\\,p',
    wsd: '\\eta_{\\max}\\text{, then linear to }\\eta_{\\min}\\text{ in the last 20\\%}',
    constant: '\\eta_{\\max}',
  };
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={sched} onChange={setSched} options={[{ v: 'cosine', label: 'cosine' }, { v: 'linear', label: 'linear' }, { v: 'wsd', label: 'WSD' }, { v: 'constant', label: 'constant' }]} />
          <Slider tex="\eta_{\max}\ (\times10^{-4})" value={peakE4} min={1} max={10} step={0.5} onChange={setPeak} />
          <Slider tex="\eta_{\min}/\eta_{\max}" value={minFrac} min={0} max={0.5} step={0.05} onChange={setMinFrac} />
          <Slider tex="T_w" value={warm} min={0} max={3000} step={100} onChange={setWarm} fmt={(v) => String(v)} />
          <Slider tex="T" value={total} min={4000} max={20000} step={1000} onChange={setTotal} fmt={(v) => String(v)} />
          <Slider tex="t" value={tt} min={0} max={total} step={100} onChange={setT} fmt={(v) => String(v)} />
          <Readout
            rows={[
              [tt < o.warm ? '\\eta_t = \\eta_{\\max}\\,t/T_w' : '\\eta_t = ' + formula[sched], ''],
              ...(tt >= o.warm && sched !== 'constant' && sched !== 'wsd' ? ([['p = (t-T_w)/(T-T_w)', fmt(p, 3)]] as [string, string][]) : []),
              ['\\eta_t', '$' + sigTeX(eta, 3)],
            ]}
          />
        </>
      }
    >
      <LinePlot series={[{ pts, color: 'var(--c-u)' }]} x={[0, total]} y={[0, 10.5]} height={290} xlabel="step t" ylabel="η (×10⁻⁴)" vlines={[{ x: tt, color: 'var(--accent)' }, ...(o.warm > 0 ? [{ x: o.warm, color: 'var(--muted)' }] : [])]}>
        {(sx, sy) => <circle cx={sx(tt)} cy={sy(eta * 1e4)} r={5} style={{ fill: 'var(--c-v)' }} />}
      </LinePlot>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ dl.floats

interface Fmt {
  name: string;
  eb: number;
  mb: number;
}
const FMTS: Fmt[] = [
  { name: 'fp32', eb: 8, mb: 23 },
  { name: 'bf16', eb: 8, mb: 7 },
  { name: 'fp16', eb: 5, mb: 10 },
];

/** Round a double to the nearest value of a binary format with eb exponent bits and mb mantissa bits (round half to even, with subnormals). */
export function roundFmt(x: number, eb: number, mb: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  const bias = 2 ** (eb - 1) - 1;
  const emin = 1 - bias;
  const maxV = (2 - 2 ** -mb) * 2 ** bias;
  const s = Math.sign(x);
  const a = Math.abs(x);
  let e = Math.floor(Math.log2(a));
  if (2 ** e > a) e--;
  if (2 ** (e + 1) <= a) e++;
  if (e < emin) e = emin;
  const ulp = 2 ** (e - mb);
  const q = a / ulp;
  const fl = Math.floor(q);
  const d = q - fl;
  const r = d > 0.5 ? fl + 1 : d < 0.5 ? fl : fl % 2 === 0 ? fl : fl + 1;
  const v = r * ulp;
  return s * (v > maxV ? Infinity : v);
}
function range(f: Fmt) {
  const bias = 2 ** (f.eb - 1) - 1;
  return { minSub: 2 ** (1 - bias - f.mb), minNorm: 2 ** (1 - bias), max: (2 - 2 ** -f.mb) * 2 ** bias, eps: 2 ** -f.mb };
}
function status(x: number, v: number, f: Fmt): string {
  const R = range(f);
  if (!Number.isFinite(v)) return 'overflow → inf';
  if (v === 0 && x !== 0) return 'underflow → 0';
  if (Math.abs(v) < R.minNorm) return 'subnormal';
  return 'normal';
}

const PRESETS: { v: number; label: string }[] = [
  { v: 1e-8, label: '1e-8' },
  { v: 3e-5, label: '3e-5' },
  { v: 0.1, label: '0.1' },
  { v: 1.001, label: '1.001' },
  { v: 300.7, label: '300.7' },
  { v: 1e5, label: '1e5' },
];

/**
 * dl.floats — how fp32, bf16 and fp16 store a number: rounded value, relative error, underflow/overflow,
 * dynamic-range bars on a log scale, and fp16 with a loss scale 2^k.
 * params: x (initial value), k (initial loss-scale exponent)
 */
function Floats({ spec }: { spec: VizSpec }) {
  const [lx, setLx] = useState(Math.log10((spec.x as number) ?? 1e-8));
  const [exact, setExact] = useState<number | null>((spec.x as number) ?? 1e-8);
  const [k, setK] = useState((spec.k as number) ?? 0);
  const x = exact ?? 10 ** lx;
  const S = 2 ** k;
  const rows = FMTS.map((f) => {
    const v = f.name === 'fp32' ? Math.fround(x) : roundFmt(x, f.eb, f.mb);
    return { f, v, rel: Math.abs(v - x) / Math.abs(x), st: status(x, v, f) };
  });
  const scaled = roundFmt(x * S, 5, 10);
  const back = scaled / S;
  // number line
  const W = 500, L0 = -46, L1 = 40;
  const X = (l: number) => 60 + ((l - L0) / (L1 - L0)) * (W - 70);
  const lg = Math.log10(Math.abs(x));
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="\log_{10} x" value={lx} min={-10} max={6} step={0.01} onChange={(v) => { setLx(v); setExact(null); }} />
          <div className="dl-row">
            {PRESETS.map((p) => (
              <Btn key={p.label} onClick={() => { setExact(p.v); setLx(Math.log10(p.v)); }}>{p.label}</Btn>
            ))}
          </div>
          <Slider tex="\text{loss scale } 2^k" value={k} min={0} max={24} step={1} onChange={setK} fmt={(v) => '2^' + v} />
          <Readout
            title="machine epsilon (gap above 1)"
            rows={FMTS.map((f) => [`\\text{${f.name}}`, '$' + `2^{-${f.mb}} \\approx ${sigTeX(range(f).eps, 3)}`] as [string, string])}
          />
        </>
      }
      below={
        <div className="dl-full">
          <table className="dl-table">
            <thead>
              <tr>
                <th>format</th>
                <th>stored value of x = {sig(x, 6)}</th>
                <th>relative error</th>
                <th>status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.f.name}>
                  <td>{r.f.name} ({r.f.eb} exp, {r.f.mb} mantissa bits)</td>
                  <td className="dl-kv">{Number.isFinite(r.v) ? sig(r.v, 8) : 'inf'}</td>
                  <td className="dl-kv">{Number.isFinite(r.v) ? sig(r.rel, 2) : '∞'}</td>
                  <td className={r.st === 'normal' ? '' : r.st === 'subnormal' ? 'dl-warn' : 'dl-bad'}>{r.st}</td>
                </tr>
              ))}
              <tr>
                <td>fp16 with loss scale 2^{k}: fp16(x·S)/S</td>
                <td className="dl-kv">{Number.isFinite(back) ? sig(back, 8) : 'inf'}</td>
                <td className="dl-kv">{Number.isFinite(back) ? sig(Math.abs(back - x) / Math.abs(x), 2) : '∞'}</td>
                <td className={status(x * S, scaled, FMTS[2]) === 'normal' ? '' : 'dl-bad'}>{status(x * S, scaled, FMTS[2])}</td>
              </tr>
            </tbody>
          </table>
        </div>
      }
    >
      <svg viewBox={`0 0 ${W} 210`} className="dl-graph" style={{ maxWidth: W }}>
        {[-40, -30, -20, -10, 0, 10, 20, 30, 40].map((t) => (
          <g key={t}>
            <line x1={X(t)} x2={X(t)} y1={20} y2={170} className="dl-grid" />
            <text x={X(t)} y={186} textAnchor="middle" className="dl-tick">
              {t === 0 ? '1' : `1e${t}`}
            </text>
          </g>
        ))}
        <text x={W / 2} y={204} textAnchor="middle" className="dl-tick">|x| on a log scale</text>
        {FMTS.map((f, i) => {
          const R = range(f);
          const y = 40 + i * 48;
          return (
            <g key={f.name}>
              <text x={6} y={y + 5} className="dl-flabel">
                {f.name}
              </text>
              <rect x={X(Math.log10(R.minSub))} y={y - 9} width={X(Math.log10(R.minNorm)) - X(Math.log10(R.minSub))} height={18} className="dl-sub" />
              <rect x={X(Math.log10(R.minNorm))} y={y - 9} width={X(Math.log10(R.max)) - X(Math.log10(R.minNorm))} height={18} className="dl-norm" />
            </g>
          );
        })}
        {lg >= L0 && lg <= L1 && <line x1={X(lg)} x2={X(lg)} y1={18} y2={172} className="dl-marker" />}
        {k > 0 && Math.log10(Math.abs(x * S)) <= L1 && <line x1={X(Math.log10(Math.abs(x * S)))} x2={X(Math.log10(Math.abs(x * S)))} y1={118} y2={156} className="dl-marker2" />}
        <text x={W - 6} y={14} textAnchor="end" className="dl-tick">
          dark: normal range · light: subnormal · orange: x{k > 0 ? ' · violet: x·S' : ''}
        </text>
      </svg>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ dl.losscurves

const ORDER: Scenario[] = ['overfit', 'high', 'bug', 'low', 'healthy'];

function Curves({ data, best, epochs, live }: { data: RunOut | { train: [number, number][]; val: [number, number][] }; best?: number; epochs: number; live?: boolean }) {
  const ymax = Math.min(2.5, Math.max(0.8, ...data.train.map((p) => p[1]), ...data.val.map((p) => p[1])) * 1.05);
  return (
    <LinePlot
      series={[
        { pts: data.train, color: 'var(--c-u)', label: 'training loss' },
        { pts: data.val, color: 'var(--c-v)', label: 'validation loss' },
      ]}
      x={[0, epochs]}
      y={[0, ymax]}
      height={260}
      xlabel="epoch"
      ylabel="cross-entropy"
      hlines={[{ y: Math.LN2, color: 'var(--muted)' }]}
      vlines={best !== undefined && best > 0 && !live ? [{ x: best, color: 'var(--c-w)' }] : []}
    />
  );
}

/**
 * dl.losscurves — 'diagnose': real recorded runs; pick the cause for each curve.
 * 'simulate': train the small MLP live with chosen settings and watch both curves.
 * params: mode ('diagnose'|'simulate'), lockMode (bool), lr, trainN, noise, wd
 */
function LossCurves({ spec }: { spec: VizSpec }) {
  const [mode, setMode] = useState<'diagnose' | 'simulate'>((spec.mode as 'diagnose' | 'simulate') ?? 'diagnose');
  // diagnose
  const [idx, setIdx] = useState(0);
  const [pick, setPick] = useState<Scenario | null>(null);
  const [score, setScore] = useState<[number, number]>([0, 0]);
  const sc = ORDER[idx % ORDER.length];
  const choose = (s: Scenario) => {
    if (pick) return;
    setPick(s);
    setScore(([a, b]) => [a + (s === sc ? 1 : 0), b + 1]);
  };
  // simulate
  const [lg, setLg] = useState(Math.log10((spec.lr as number) ?? 0.3));
  const [trainN, setTrainN] = useState((spec.trainN as number) ?? 80);
  const [noise, setNoise] = useState((spec.noise as number) ?? 0.1);
  const [wdE3, setWd] = useState(((spec.wd as number) ?? 0) * 1e3);
  const [shuffle, setShuffle] = useState(false);
  const [width, setWidth] = useState(32);
  const [, setTick] = useState(0);
  const run = useRef<ReturnType<typeof startRun> | null>(null);
  const [running, setRunning] = useState(false);
  const epochs = 300;
  const go = () => {
    run.current = startRun({ lr: 10 ** lg, epochs, hidden: [width, width], trainN, labelNoise: noise, shuffleLabels: shuffle, wd: wdE3 * 1e-3 });
    setRunning(true);
  };
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const loop = () => {
      const r = run.current;
      if (!r) return;
      r.advance(6);
      setTick((t) => t + 1);
      if (r.done) setRunning(false);
      else raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);
  useEffect(() => {
    if (mode === 'simulate' && !run.current) go();
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const modeCtl = spec.lockMode ? null : (
    <SegControl value={mode} onChange={setMode} options={[{ v: 'diagnose', label: 'diagnose' }, { v: 'simulate', label: 'simulate' }]} />
  );
  if (mode === 'diagnose') {
    const d = CURVE_DATA[sc];
    return (
      <FigureLayout
        side={
          <>
            {modeCtl}
            <div className="small">
              Curve {(idx % ORDER.length) + 1} of {ORDER.length}. What is the most likely cause?
            </div>
            <div className="dl-choices">
              {ORDER.map((s) => (
                <button key={s} className={pick ? (s === sc ? 'ok' : s === pick ? 'bad' : '') : ''} onClick={() => choose(s)} disabled={!!pick && s !== pick && s !== sc}>
                  {SCENARIOS[s].label}
                </button>
              ))}
            </div>
            {pick && (
              <div className="dl-note">
                <span className={pick === sc ? 'dl-ok' : 'dl-bad'}>{pick === sc ? 'Right. ' : `It is ${SCENARIOS[sc].label}. `}</span>
                {SCENARIOS[sc].explain}
              </div>
            )}
            <div className="dl-row">
              <Btn primary disabled={!pick} onClick={() => { setIdx(idx + 1); setPick(null); }}>Next curve</Btn>
              <span className="muted small">score {score[0]}/{score[1]}</span>
            </div>
          </>
        }
      >
        <Curves data={d} epochs={300} />
      </FigureLayout>
    );
  }
  const r = run.current;
  return (
    <FigureLayout
      side={
        <>
          {modeCtl}
          <Slider label="learning rate" value={lg} min={-3} max={0.7} step={0.05} onChange={setLg} fmt={(v) => sig(10 ** v, 2)} />
          <Slider label="training examples" value={trainN} min={20} max={300} step={10} onChange={setTrainN} fmt={(v) => String(v)} />
          <Slider label="label noise" value={noise} min={0} max={0.3} step={0.05} onChange={setNoise} />
          <Slider tex="\lambda\ (\times10^{-3})" value={wdE3} min={0} max={10} step={0.5} onChange={setWd} />
          <SegControl label="width" value={width} onChange={setWidth} options={[8, 16, 32].map((v) => ({ v, label: String(v) }))} />
          <Toggle label="bug: shuffle the training labels" value={shuffle} onChange={setShuffle} />
          <div className="dl-row">
            <Btn primary onClick={go}>{running ? 'Restart' : 'Train'}</Btn>
          </div>
          {r && (
            <Readout
              rows={[
                ['\\text{epoch}', String(r.epoch)],
                ['\\text{train loss}', fmt(r.out.train[r.out.train.length - 1][1], 3)],
                ['\\text{val loss}', fmt(r.out.val[r.out.val.length - 1][1], 3)],
                ['\\text{best val epoch}', r.out.bestEpoch ? String(r.out.bestEpoch) : '–'],
              ]}
            />
          )}
          <div className="muted small">
            Network 2 → {width} → {width} → 1 (tanh), minibatch SGD, batch 16, on the circles data with {trainN} training points. Validation: 300 fresh points with the same label noise.
          </div>
        </>
      }
    >
      {r ? <Curves data={r.out} best={r.out.bestEpoch} epochs={epochs} live={running} /> : <div />}
    </FigureLayout>
  );
}

export const trainingViz = {
  'dl.lrschedule': {
    component: LrSchedule,
    validate: (s: VizSpec) => (s.sched === undefined || ['cosine', 'linear', 'wsd', 'constant'].includes(s.sched as string) ? null : 'unknown sched'),
    doc: "Warmup + decay schedules. params sched ('cosine'|'linear'|'wsd'|'constant'), peak, minLr, warm, total, t",
  },
  'dl.floats': {
    component: Floats,
    validate: (s: VizSpec) => (s.x === undefined || (typeof s.x === 'number' && s.x > 0) ? null : 'x must be positive'),
    doc: 'fp32 / bf16 / fp16 rounding, range and loss scaling. params x, k',
  },
  'dl.losscurves': {
    component: LossCurves,
    validate: (s: VizSpec) => (s.mode === undefined || s.mode === 'diagnose' || s.mode === 'simulate' ? null : "mode must be 'diagnose' or 'simulate'"),
    doc: "Loss-curve diagnosis quiz ('diagnose') and live simulation ('simulate'). params mode, lockMode, lr, trainN, noise, wd",
  },
};

