import { useEffect, useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Curve, Handle, Seg, Point, Heat, Label, LinePlot, Slider, Readout, FigureLayout, SegControl, Toggle, Btn, TeX } from '../kit';
import { Rng } from '../../math/rng';
import { fmt, sig, normCdf, normPdf, sigmoid } from './util';
import { makeNet, makeData, epoch, meanLoss, accuracy, predict, paramCount, type Dataset, type HiddenAct, type Net } from './mlp';
import { Dots } from './parts';
import './dl.css';

// ------------------------------------------------------------------ dl.activations

type ActName = 'relu' | 'gelu' | 'sigmoid' | 'tanh';
const ACTS: Record<ActName, { f: (z: number) => number; d: (z: number) => number; tex: string; dtex: string }> = {
  relu: { f: (z) => Math.max(0, z), d: (z) => (z > 0 ? 1 : 0), tex: '\\max(0, z)', dtex: '\\mathbb{1}[z > 0]' },
  gelu: { f: (z) => z * normCdf(z), d: (z) => normCdf(z) + z * normPdf(z), tex: 'z\\,\\Phi(z)', dtex: '\\Phi(z) + z\\,\\varphi(z)' },
  sigmoid: { f: sigmoid, d: (z) => sigmoid(z) * (1 - sigmoid(z)), tex: '\\frac{1}{1+e^{-z}}', dtex: '\\sigma(z)(1-\\sigma(z))' },
  tanh: { f: Math.tanh, d: (z) => 1 - Math.tanh(z) ** 2, tex: '\\tanh z', dtex: '1-\\tanh^2 z' },
};
const ACT_COL: Record<ActName, string> = { relu: 'var(--c-u)', gelu: 'var(--c-k)', sigmoid: 'var(--c-v)', tanh: 'var(--c-w)' };

/**
 * dl.activations — an activation function and its derivative; drag the point along the curve.
 * View 'one' shows φ and φ′ with the tangent line; view 'derivs' overlays all four derivatives.
 * params: act ('relu'|'gelu'|'sigmoid'|'tanh'), z (initial point), view ('one'|'derivs')
 */
function Activations({ spec }: { spec: VizSpec }) {
  const [act, setAct] = useState<ActName>((spec.act as ActName) ?? 'sigmoid');
  const [view, setView] = useState<'one' | 'derivs'>((spec.view as 'one' | 'derivs') ?? 'one');
  const [z, setZ] = useState((spec.z as number) ?? 1);
  const A = ACTS[act];
  const fz = A.f(z), dz = A.d(z);
  const t0 = z - 0.9, t1 = z + 0.9;
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={view} onChange={setView} options={[{ v: 'one', label: 'φ and φ′' }, { v: 'derivs', label: 'all φ′' }]} />
          <SegControl
            value={act}
            onChange={setAct}
            options={(['relu', 'gelu', 'sigmoid', 'tanh'] as ActName[]).map((a) => ({ v: a, label: a === 'relu' ? 'ReLU' : a === 'gelu' ? 'GELU' : a }))}
          />
          <Slider tex="z" value={z} min={-4} max={4} step={0.05} onChange={setZ} />
          <Readout
            rows={[
              ['\\varphi(z) = ' + A.tex, fmt(fz, 4)],
              ["\\varphi'(z) = " + A.dtex, fmt(dz, 4)],
              ...(view === 'derivs' ? (['relu', 'gelu', 'sigmoid', 'tanh'] as ActName[]).filter((a) => a !== act).map((a) => [`\\text{${a}}'(z)`, fmt(ACTS[a].d(z), 4)] as [string, string]) : []),
            ]}
          />
          <div className="small">
            {act === 'sigmoid' && <>The slope peaks at <TeX>{'z = 0'}</TeX> with value <TeX>{'1/4'}</TeX> and decays to 0 in both tails: a saturated sigmoid passes almost no gradient.</>}
            {act === 'tanh' && <>Zero-centred, slope 1 at the origin, but it saturates like the sigmoid: <TeX>{"\\tanh'(z)\\to 0"}</TeX> as <TeX>{'|z|'}</TeX> grows.</>}
            {act === 'relu' && <>Slope exactly 1 for <TeX>{'z>0'}</TeX> and exactly 0 for <TeX>{'z<0'}</TeX>. The derivative at 0 is undefined; frameworks use 0.</>}
            {act === 'gelu' && <>A smooth ReLU: close to <TeX>{'z'}</TeX> for large <TeX>{'z'}</TeX>, close to 0 for very negative <TeX>{'z'}</TeX>, with a small dip below zero near <TeX>{'z\\approx-0.75'}</TeX>.</>}
          </div>
        </>
      }
    >
      <Plane x={[-4, 4]} y={[-1.3, 2.7]} width={440} height={300} gridStep={0.5}>
        {view === 'one' ? (
          <>
            <Curve f={A.f} color={ACT_COL[act]} width={2.6} />
            <Curve f={A.d} color="var(--muted)" width={2} dashed />
            <Seg a={[t0, fz + dz * (t0 - z)]} b={[t1, fz + dz * (t1 - z)]} color="var(--c-err)" width={2} />
            <Seg a={[z, 0]} b={[z, fz]} color="var(--muted)" dashed width={1} />
            <Point at={[z, A.d(z)]} r={3.5} color="var(--muted)" />
            <Label at={[2.2, A.f(2.2)]} text="φ(z)" color={ACT_COL[act]} dy={14} anchor="end" />
            <Label at={[-3.9, act === 'relu' || act === 'gelu' ? 0.18 : A.d(-3.9) + 0.18]} text="φ′(z)" color="var(--muted)" anchor="start" />
            <Handle at={[z, fz]} onChange={([x]) => setZ(Math.round(Math.max(-4, Math.min(4, x)) * 20) / 20)} color={ACT_COL[act]} label="point on the curve" />
          </>
        ) : (
          <>
            {(['relu', 'gelu', 'sigmoid', 'tanh'] as ActName[]).map((a) => (
              <Curve key={a} f={ACTS[a].d} color={ACT_COL[a]} width={a === act ? 3 : 1.8} opacity={a === act ? 1 : 0.7} />
            ))}
            <Seg a={[z, -1.3]} b={[z, 2.7]} color="var(--muted)" dashed width={1} />
            {(['relu', 'gelu', 'sigmoid', 'tanh'] as ActName[]).map((a) => (
              <Point key={a} at={[z, ACTS[a].d(z)]} r={3.5} color={ACT_COL[a]} />
            ))}
            <Label at={[2.6, 1.12]} text="ReLU′, GELU′" color="var(--c-u)" anchor="middle" />
            <Label at={[-2.4, 0.9]} text="tanh′" color="var(--c-w)" />
            <Label at={[0, 0.4]} text="σ′" color="var(--c-v)" />
          </>
        )}
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ dl.playground

const DATASETS: { v: Dataset; label: string }[] = [
  { v: 'circles', label: 'circles' },
  { v: 'xor', label: 'XOR' },
  { v: 'spiral', label: 'spiral' },
  { v: 'blobs', label: 'blobs' },
];

/**
 * dl.playground — a small MLP trained live with minibatch SGD (batch 16, sigmoid output, binary cross-entropy).
 * Heat map = predicted probability of the orange class. Play/pause/step, reset, and a loss curve.
 * params: dataset, layers (0–3 hidden layers), units (1–8), lr, act ('tanh'|'relu')
 */
function Playground({ spec }: { spec: VizSpec }) {
  const [dataset, setDataset] = useState<Dataset>((spec.dataset as Dataset) ?? 'circles');
  const [layers, setLayers] = useState((spec.layers as number) ?? 1);
  const [units, setUnits] = useState((spec.units as number) ?? 4);
  const [lg, setLg] = useState(Math.log10((spec.lr as number) ?? 0.3));
  const [act, setAct] = useState<HiddenAct>((spec.act as HiddenAct) ?? 'tanh');
  const [seed, setSeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [, setTick] = useState(0);
  const lr = 10 ** lg;
  const pts = useMemo(() => makeData(dataset, 200, 7), [dataset]);
  const sizes = useMemo(() => [2, ...Array(layers).fill(units), 1], [layers, units]);
  const st = useRef<{ net: Net; rng: Rng; ep: number; hist: [number, number][] } | null>(null);
  const key = `${dataset}|${sizes.join('-')}|${act}|${seed}`;
  const keyRef = useRef('');
  if (keyRef.current !== key || !st.current) {
    keyRef.current = key;
    const net = makeNet(sizes, act, seed);
    st.current = { net, rng: new Rng(100 + seed), ep: 0, hist: [[0, meanLoss(net, pts)]] };
  }
  const s = st.current;
  const lrRef = useRef(lr);
  lrRef.current = lr;

  const step = (n: number) => {
    for (let k = 0; k < n; k++) {
      epoch(s.net, pts, lrRef.current, 16, s.rng);
      s.ep++;
      const L = meanLoss(s.net, pts);
      s.hist.push([s.ep, Number.isFinite(L) ? L : 10]);
    }
    if (s.hist.length > 1500) s.hist = s.hist.filter((_, i) => i % 2 === 0 || i === s.hist.length - 1);
    setTick((t) => t + 1);
  };
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      if (t - last > 30) {
        last = t;
        step(1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const loss = s.hist[s.hist.length - 1][1];
  const acc = accuracy(s.net, pts);
  const f = (x: number, y: number) => predict(s.net, x, y);
  const ymax = Math.min(2, Math.max(0.8, ...s.hist.map((h) => h[1])) * 1.05);
  const reset = () => {
    setPlaying(false);
    setSeed((v) => v + 1);
  };
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={dataset} onChange={(v) => { setDataset(v); setPlaying(false); }} options={DATASETS} />
          <Slider label="hidden layers" value={layers} min={0} max={3} step={1} onChange={(v) => { setLayers(v); setPlaying(false); }} fmt={(v) => String(v)} />
          <Slider label="units / layer" value={units} min={1} max={8} step={1} onChange={(v) => { setUnits(v); setPlaying(false); }} fmt={(v) => String(v)} />
          <Slider label="learning rate" value={lg} min={-3} max={0.6} step={0.05} onChange={setLg} fmt={(v) => sig(10 ** v, 2)} />
          <SegControl value={act} onChange={(v) => { setAct(v); setPlaying(false); }} options={[{ v: 'tanh', label: 'tanh' }, { v: 'relu', label: 'ReLU' }]} />
          <div className="dl-row">
            <Btn primary onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</Btn>
            <Btn onClick={() => { setPlaying(false); step(1); }}>Step</Btn>
            <Btn onClick={() => { setPlaying(false); step(50); }}>+50</Btn>
            <Btn onClick={reset} title="new random initialization">Reset</Btn>
          </div>
          <Readout
            rows={[
              ['\\text{network}', sizes.join(' → ')],
              ['\\text{parameters}', String(paramCount(sizes))],
              ['\\text{epoch}', String(s.ep)],
              ['\\text{train loss}', fmt(loss, 3)],
              ['\\text{accuracy}', fmt(100 * acc, 1) + '%'],
            ]}
          />
        </>
      }
      below={
        <div className="dl-full">
          <LinePlot series={[{ pts: s.hist, color: 'var(--c-u)', label: 'train loss (mean cross-entropy)' }]} x={[0, Math.max(50, s.ep)]} y={[0, ymax]} height={170} xlabel="epoch" hlines={[{ y: Math.LN2, color: 'var(--muted)' }]} />
          <div className="muted small">Dashed line: <TeX>{'\\ln 2 \\approx 0.693'}</TeX>, the loss of predicting 0.5 everywhere.</div>
        </div>
      }
    >
      <Plane x={[-1.3, 1.3]} y={[-1.3, 1.3]} width={400} grid={false} ticks={false} axes={false}>
        <Heat f={f} res={36} range={[0, 1]} scheme="div" opacity={0.85} />
        <Dots pts={pts.map((p) => ({ at: p.x, color: p.y ? 'var(--c-pos)' : 'var(--c-neg)' }))} />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ dl.relufit

type Target = 'sin' | 'bump' | 'step' | 'square';
const TARGETS: Record<Target, { f: (x: number) => number; label: string }> = {
  sin: { f: (x) => Math.sin(3 * x), label: 'sin 3x' },
  bump: { f: (x) => Math.exp(-8 * x * x), label: 'bump' },
  step: { f: (x) => Math.tanh(12 * x), label: 'near-step' },
  square: { f: (x) => x * x, label: 'x²' },
};

/**
 * dl.relufit — one hidden layer of n ReLU units, h_k = ReLU(x − c_k), with output weights chosen so that the
 * network interpolates the target at n + 1 evenly spaced knots. Shows the piecewise-linear fit, the units, the max error.
 * params: target ('sin'|'bump'|'step'|'square'), n (units)
 */
function ReluFit({ spec }: { spec: VizSpec }) {
  const [target, setTarget] = useState<Target>((spec.target as Target) ?? 'sin');
  const [n, setN] = useState((spec.n as number) ?? 3);
  const [showUnits, setShowUnits] = useState(true);
  const T = TARGETS[target].f;
  const { knots, w, b, g, maxErr } = useMemo(() => {
    const knots = Array.from({ length: n + 1 }, (_, i) => -1 + (2 * i) / n);
    const slopes = knots.slice(0, n).map((x, i) => (T(knots[i + 1]) - T(x)) / (knots[i + 1] - x));
    const w = slopes.map((s, i) => s - (i ? slopes[i - 1] : 0));
    const b = T(-1);
    const g = (x: number) => b + w.reduce((acc, wk, k) => acc + wk * Math.max(0, x - knots[k]), 0);
    let maxErr = 0;
    for (let i = 0; i <= 400; i++) {
      const x = -1 + i / 200;
      maxErr = Math.max(maxErr, Math.abs(g(x) - T(x)));
    }
    return { knots, w, b, g, maxErr };
  }, [n, T]);
  const lo = target === 'step' || target === 'sin' ? -1.6 : -0.6;
  const hi = target === 'step' || target === 'sin' ? 1.6 : 1.6;
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={target} onChange={setTarget} options={(Object.keys(TARGETS) as Target[]).map((k) => ({ v: k, label: TARGETS[k].label }))} />
          <Slider label="hidden units n" value={n} min={1} max={24} step={1} onChange={setN} fmt={(v) => String(v)} />
          <Toggle label="show the weighted units" value={showUnits} onChange={setShowUnits} />
          <Readout
            rows={[
              ['\\text{network}', `1 → ${n} → 1`],
              ['b = f(-1)', fmt(b, 3)],
              ['\\max_x |\\hat f(x) - f(x)|', fmt(maxErr, 4)],
            ]}
          />
          <div className="small">
            <TeX>{'\\hat f(x) = b + \\sum_k w_k\\,\\relu(x - c_k)'}</TeX>. Each unit is a hinge that starts at <TeX>{'c_k'}</TeX>. Its output weight <TeX>{'w_k'}</TeX> is the <b>change of slope</b> there. With <TeX>{'n'}</TeX> units the network is a polyline with <TeX>{'n'}</TeX> pieces.
          </div>
        </>
      }
    >
      <Plane x={[-1.1, 1.1]} y={[lo, hi]} width={440} height={300} gridStep={0.5}>
        {showUnits &&
          w.map((wk, k) => (
            <Curve key={k} f={(x) => wk * Math.max(0, x - knots[k])} x0={-1} x1={1} color="var(--muted)" width={1} opacity={0.45} />
          ))}
        <Curve f={T} x0={-1} x1={1} color="var(--c-v)" width={2} dashed />
        <Curve f={g} x0={-1} x1={1} color="var(--c-u)" width={2.6} samples={400} />
        {knots.map((c, k) => (
          <Point key={k} at={[c, g(c)]} r={3} color="var(--c-u)" />
        ))}
        <Label at={[-1.05, hi - 0.15]} text="target f (dashed)" color="var(--c-v)" anchor="start" />
        <Label at={[-1.05, hi - 0.4]} text="network f̂" color="var(--c-u)" anchor="start" />
      </Plane>
    </FigureLayout>
  );
}

export const netsViz = {
  'dl.activations': {
    component: Activations,
    validate: (s: VizSpec) => (s.act === undefined || ['relu', 'gelu', 'sigmoid', 'tanh'].includes(s.act as string) ? null : 'act must be relu|gelu|sigmoid|tanh'),
    doc: "Activation and derivative with a draggable point and tangent. params act ('relu'|'gelu'|'sigmoid'|'tanh'), z, view ('one'|'derivs')",
  },
  'dl.playground': {
    component: Playground,
    validate: (s: VizSpec) => (s.dataset === undefined || ['circles', 'xor', 'spiral', 'blobs'].includes(s.dataset as string) ? null : 'unknown dataset'),
    doc: "Live MLP training on 2-D data. params dataset ('circles'|'xor'|'spiral'|'blobs'), layers (0–3), units (1–8), lr, act ('tanh'|'relu')",
  },
  'dl.relufit': {
    component: ReluFit,
    validate: (s: VizSpec) => (s.target === undefined || ['sin', 'bump', 'step', 'square'].includes(s.target as string) ? null : 'unknown target'),
    doc: "Sum of n ReLU hinges interpolating a 1-D target. params target ('sin'|'bump'|'step'|'square'), n",
  },
};
