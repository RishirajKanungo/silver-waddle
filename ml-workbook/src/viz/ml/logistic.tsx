import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Handle, Arrow, InfLine, Heat, Label, Slider, Readout, FigureLayout, SegControl, Btn, Toggle, LinePlot, Bars, usePlane, type P2 } from '../kit';
import { Rng } from '../../math/rng';
import { fx, fc, sigmoid, softplus, softmax, logSumExp, CLASS3 } from './common';
import './ml.css';

// ------------------------------------------------------------------ data

type Pt = { x: P2; y: number };
const clampv = (v: number) => Math.max(-3.8, Math.min(3.8, v));

function twoClass(kind: 'overlap' | 'separable'): Pt[] {
  const r = new Rng(kind === 'overlap' ? 11 : 23);
  const out: Pt[] = [];
  const want = 20;
  let n1 = 0, n0 = 0;
  while (n1 < want || n0 < want) {
    const cls = n1 < want && (n0 >= want || r.next() < 0.5) ? 1 : 0;
    const sd = kind === 'overlap' ? 1.05 : 0.7;
    const m: P2 = kind === 'overlap' ? (cls ? [0.9, 0.7] : [-0.9, -0.6]) : cls ? [1.3, 1.0] : [-1.3, -1.0];
    const p: P2 = [clampv(r.normal(m[0], sd)), clampv(r.normal(m[1], sd))];
    if (kind === 'separable' && (cls ? p[0] + p[1] < 0.6 : p[0] + p[1] > -0.6)) continue;
    out.push({ x: p, y: cls });
    if (cls) n1++;
    else n0++;
  }
  return out;
}

// ------------------------------------------------------------------ ml.logreg-2d

interface LrState {
  w: P2;
  b: number;
  t: number;
  hist: { loss: number; nw: number }[];
}

const bce = (data: Pt[], w: P2, b: number) => data.reduce((s, { x, y }) => s + softplus(-(2 * y - 1) * (w[0] * x[0] + w[1] * x[1] + b)), 0) / data.length;

/**
 * ml.logreg-2d — binary logistic regression on 2-D data. Probability heat map σ(wᵀx + b), the boundary
 * wᵀx + b = 0 and the p = 0.25 / 0.75 lines; drag w (arrow tip) and b (slider) or train by gradient descent
 * step by step. Optional L2 penalty. data 'overlap' | 'separable' (weights grow without bound when separable).
 * params: data, w, b, eta
 */
function LogReg2D({ spec }: { spec: VizSpec }) {
  const kind = (spec.data as 'overlap' | 'separable') ?? 'overlap';
  const data = useMemo(() => twoClass(kind), [kind]);
  const w0 = (spec.w as P2) ?? [1, -0.5];
  const b0 = (spec.b as number) ?? 0;
  const eta = (spec.eta as number) ?? 0.5;
  const [S, setS] = useState<LrState>({ w: w0, b: b0, t: 0, hist: [] });
  const [running, setRunning] = useState(false);
  const [l2, setL2] = useState(false);
  const [plot, setPlot] = useState<'loss' | 'nw'>(kind === 'separable' ? 'nw' : 'loss');
  const lam = 0.01;
  const step = (s: LrState): LrState => {
    let gw0 = 0, gw1 = 0, gb = 0;
    for (const { x, y } of data) {
      const e = sigmoid(s.w[0] * x[0] + s.w[1] * x[1] + s.b) - y;
      gw0 += e * x[0];
      gw1 += e * x[1];
      gb += e;
    }
    const n = data.length;
    gw0 = gw0 / n + (l2 ? 2 * lam * s.w[0] : 0);
    gw1 = gw1 / n + (l2 ? 2 * lam * s.w[1] : 0);
    gb /= n;
    const w: P2 = [s.w[0] - eta * gw0, s.w[1] - eta * gw1];
    const b = s.b - eta * gb;
    const hist = s.hist.length >= 4000 ? s.hist.filter((_, k) => k % 2 === 0) : s.hist;
    return { w, b, t: s.t + 1, hist: [...hist, { loss: bce(data, w, b), nw: Math.hypot(w[0], w[1]) }] };
  };
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setS((s) => {
      let r = s;
      for (let k = 0; k < 5; k++) r = stepRef.current(r);
      return r;
    }), 40);
    return () => window.clearInterval(id);
  }, [running]);
  const { w, b } = S;
  const nw = Math.hypot(w[0], w[1]);
  const loss = bce(data, w, b);
  const acc = data.filter(({ x, y }) => (w[0] * x[0] + w[1] * x[1] + b > 0 ? 1 : 0) === y).length / data.length;
  let gw0 = 0, gw1 = 0, gb = 0;
  for (const { x, y } of data) {
    const e = sigmoid(w[0] * x[0] + w[1] * x[1] + b) - y;
    gw0 += e * x[0];
    gw1 += e * x[1];
    gb += e;
  }
  const gn = Math.hypot(gw0, gw1, gb) / data.length;
  const prob = useMemo(() => (x: number, y: number) => sigmoid(w[0] * x + w[1] * y + b), [w, b]);
  const lineAt = (z: number): P2 => (nw > 1e-9 ? [((z - b) * w[0]) / (nw * nw), ((z - b) * w[1]) / (nw * nw)] : [0, 0]);
  const dir: P2 = [-w[1], w[0]];
  const tipScale = nw > 3.5 ? 3.5 / nw : 1; // keep the arrow on screen when training makes w long
  const tip: P2 = [w[0] * tipScale, w[1] * tipScale];
  const hpts = S.hist.map((h, k) => [k + 1, plot === 'loss' ? h.loss : h.nw] as [number, number]);
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="b" value={Math.max(-6, Math.min(6, b))} min={-6} max={6} step={0.05} onChange={(v) => setS({ ...S, b: v })} />
          <Readout
            rows={[
              ['\\mathbf{w}', `(${fx(w[0])}, ${fx(w[1])})`],
              ['b', fx(b)],
              ['\\lVert\\mathbf{w}\\rVert', fx(nw)],
              ['\\text{mean BCE}', fx(loss, 4)],
              ['\\text{accuracy}', `${Math.round(acc * 100)}%`],
              ['\\lVert\\nabla\\rVert', fc(gn, 4)],
              ['\\text{GD steps}', String(S.t)],
            ]}
          />
          <div className="ml-btns">
            <Btn onClick={() => setS(step(S))}>Step</Btn>
            <Btn primary onClick={() => setRunning(!running)}>{running ? 'Pause' : 'Train'}</Btn>
            <Btn onClick={() => { setRunning(false); setS({ w: w0, b: b0, t: 0, hist: [] }); }}>Reset</Btn>
          </div>
          <Toggle label={`L2 penalty (λ = ${lam})`} value={l2} onChange={setL2} />
          <div className="muted small">Drag the tip of w. Orange: y = 1, blue: y = 0; a dark ring marks a misclassified point. η = {eta}.</div>
        </>
      }
      below={
        S.hist.length > 1 ? (
          <div className="ml-plots">
            <div className="ml-plot ml-plot-wide">
              <SegControl value={plot} onChange={setPlot} options={[{ v: 'loss', label: 'mean BCE' }, { v: 'nw', label: '‖w‖' }]} />
              <LinePlot series={[{ pts: hpts, color: plot === 'loss' ? 'var(--accent)' : 'var(--c-v)' }]} height={150} xlabel="gradient-descent step" y={plot === 'loss' ? [0, Math.max(0.8, ...hpts.slice(0, 5).map((p) => p[1]))] : undefined} />
            </div>
          </div>
        ) : undefined
      }
    >
      <Plane x={[-4, 4]} y={[-4, 4]} width={400} gridStep={1}>
        <Heat f={prob} res={34} range={[0, 1]} scheme="div" opacity={0.6} />
        {nw > 1e-6 && (
          <>
            <InfLine p={lineAt(Math.log(3))} d={dir} color="var(--muted)" dashed width={1.2} />
            <InfLine p={lineAt(-Math.log(3))} d={dir} color="var(--muted)" dashed width={1.2} />
            <InfLine p={lineAt(0)} d={dir} color="var(--fg)" width={2.2} />
          </>
        )}
        {data.map(({ x, y }, k) => {
          const wrong = (w[0] * x[0] + w[1] * x[1] + b > 0 ? 1 : 0) !== y;
          return <PtMark key={k} at={x} color={y ? 'var(--c-pos)' : 'var(--c-neg)'} ring={wrong} square={!y} />;
        })}
        <Arrow to={tip} color="var(--fg)" width={2.5} tex={tipScale < 1 ? '\\mathbf{w}\\ (\\text{scaled})' : '\\mathbf{w}'} labelAt={0.55} />
        <Handle at={tip} onChange={(p) => setS({ ...S, w: p })} color="var(--fg)" r={5} snap={0.1} label="weight vector w" />
        <Label at={[-3.85, 3.65]} text="p = 0.25 / 0.75 dashed" anchor="start" color="var(--muted)" />
      </Plane>
    </FigureLayout>
  );
}

/** a data point: circle (class 1) or square (class 0), with an optional ring */
function PtMark({ at, color, ring, square }: { at: P2; color: string; ring?: boolean; square?: boolean }) {
  const { sx, sy } = usePlane();
  const x = sx(at[0]), y = sy(at[1]);
  return (
    <g>
      {ring && <circle cx={x} cy={y} r={9} style={{ fill: 'none', stroke: 'var(--fg)', strokeWidth: 2 }} />}
      {square ? <rect x={x - 4.5} y={y - 4.5} width={9} height={9} style={{ fill: color, stroke: 'var(--surface)', strokeWidth: 1.2 }} /> : <circle cx={x} cy={y} r={5} style={{ fill: color, stroke: 'var(--surface)', strokeWidth: 1.2 }} />}
    </g>
  );
}

// ------------------------------------------------------------------ ml.logreg-loss

const LW_X = [-3, -1.5, -0.5, 0.5, 1, 2.5];
const LW_Y = [0, 0, 1, 0, 1, 1];

/**
 * ml.logreg-loss — why cross-entropy and not squared error on a sigmoid output. For a positive example (y = 1)
 * with logit z: BCE = log(1 + e^{−z}) and MSE = (1 − σ(z))², or their derivatives in z; or both losses as a
 * function of one weight w on a tiny 1-D dataset (MSE is not convex there).
 * params: mode 'loss' | 'grad' | 'w', z
 */
function LossVsZ({ spec }: { spec: VizSpec }) {
  const [mode, setMode] = useState<'loss' | 'grad' | 'w'>((spec.mode as 'loss' | 'grad' | 'w') ?? 'loss');
  const [z, setZ] = useState((spec.z as number) ?? -4);
  const [wv, setWv] = useState(-2);
  const s = sigmoid(z);
  const fB = (u: number) => (mode === 'loss' ? softplus(-u) : sigmoid(u) - 1);
  const fM = (u: number) => (mode === 'loss' ? (1 - sigmoid(u)) ** 2 : -2 * sigmoid(u) * (1 - sigmoid(u)) ** 2);
  const bceW = (w: number) => LW_X.reduce((a, x, i) => a + softplus(-(2 * LW_Y[i] - 1) * w * x), 0) / LW_X.length;
  const mseW = (w: number) => LW_X.reduce((a, x, i) => a + (sigmoid(w * x) - LW_Y[i]) ** 2, 0) / LW_X.length;
  const grid = (lo: number, hi: number, f: (u: number) => number) => Array.from({ length: 241 }, (_, k) => {
    const u = lo + ((hi - lo) * k) / 240;
    return [u, f(u)] as [number, number];
  });
  const isW = mode === 'w';
  const cur = isW ? wv : z;
  const series = isW
    ? [
        { pts: grid(-6, 8, bceW), color: 'var(--c-u)', label: 'BCE' },
        { pts: grid(-6, 8, mseW), color: 'var(--c-v)', label: 'MSE', dashed: true },
      ]
    : [
        { pts: grid(-8, 8, fB), color: 'var(--c-u)', label: mode === 'loss' ? 'BCE  log(1+e^−z)' : 'd BCE / dz = σ(z) − 1' },
        { pts: grid(-8, 8, fM), color: 'var(--c-v)', label: mode === 'loss' ? 'MSE  (1 − σ(z))²' : 'd MSE / dz', dashed: true },
      ];
  const yr: [number, number] = mode === 'loss' ? [0, 4] : mode === 'grad' ? [-1.05, 0.1] : [0, 2.5];
  const fb = isW ? bceW : fB, fm = isW ? mseW : fM;
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={mode} onChange={setMode} options={[{ v: 'loss', label: 'loss' }, { v: 'grad', label: 'gradient' }, { v: 'w', label: 'loss vs w' }]} />
          {isW ? <Slider tex="w" value={wv} min={-6} max={8} step={0.1} onChange={setWv} /> : <Slider tex="z" value={z} min={-8} max={8} step={0.1} onChange={setZ} />}
          {isW ? (
            <Readout
              rows={[
                ['\\text{BCE}(w)', fx(bceW(wv), 4)],
                ['\\text{MSE}(w)', fx(mseW(wv), 4)],
              ]}
            />
          ) : (
            <Readout
              rows={[
                ['p = \\sigma(z)', fx(s, 4)],
                ['\\text{BCE} = -\\log p', fx(softplus(-z), 4)],
                ['\\text{MSE} = (1-p)^2', fx((1 - s) ** 2, 4)],
                ['\\partial\\,\\text{BCE}/\\partial z = p - 1', fx(s - 1, 4)],
                ['\\partial\\,\\text{MSE}/\\partial z', fx(-2 * s * (1 - s) ** 2, 4)],
              ]}
            />
          )}
          <div className="ml-note">
            {isW
              ? 'Six points, model p = σ(w·x). BCE is convex in w. MSE has flat shoulders on both sides: from there gradient descent barely moves.'
              : 'A positive example (y = 1). At very negative z the model is confidently wrong: BCE keeps a slope near −1, while the MSE gradient shrinks towards 0.'}
          </div>
        </>
      }
    >
      <LinePlot series={series} x={isW ? [-6, 8] : [-8, 8]} y={yr} width={460} height={300} xlabel={isW ? 'w' : 'logit z'} vlines={[{ x: cur, color: 'var(--muted)' }]} hlines={mode === 'grad' ? [{ y: 0 }] : []}>
        {(sx, sy) => (
          <>
            <circle cx={sx(cur)} cy={sy(fb(cur))} r={5} style={{ fill: 'var(--c-u)' }} />
            <circle cx={sx(cur)} cy={sy(fm(cur))} r={5} style={{ fill: 'var(--c-v)' }} />
          </>
        )}
      </LinePlot>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ ml.softmax-bars

/**
 * ml.softmax-bars — softmax of three logits with temperature T: bars for z and p = softmax(z/T), the
 * cross-entropy −log p_y and its gradient (p − e_y)/T. Button adds 1 to every logit (nothing changes).
 * params: z [z0, z1, z2], T, y
 */
function SoftmaxBars({ spec }: { spec: VizSpec }) {
  const z0 = (spec.z as number[]) ?? [2, 1, -1];
  const [z, setZ] = useState<number[]>([...z0]);
  const [T, setT] = useState((spec.T as number) ?? 1);
  const [y, setY] = useState((spec.y as number) ?? 0);
  const u = z.map((v) => v / T);
  const p = softmax(u);
  const lse = logSumExp(u);
  const g = p.map((v, k) => (v - (k === y ? 1 : 0)) / T);
  const vec = (a: number[], d = 3) => `\\begin{bmatrix}${a.map((v) => fx(v, d)).join('\\\\')}\\end{bmatrix}`;
  return (
    <FigureLayout
      side={
        <>
          {z.map((v, k) => (
            <Slider key={k} tex={`z_${k}`} value={v} min={-6} max={6} step={0.1} onChange={(nv) => setZ(z.map((o, j) => (j === k ? nv : o)))} />
          ))}
          <Slider tex="T" value={T} min={0.1} max={5} step={0.05} onChange={setT} />
          <SegControl label="true class y" value={y} onChange={setY} options={[0, 1, 2].map((k) => ({ v: k, label: String(k) }))} />
          <Readout
            rows={[
              ['\\operatorname{LSE}(\\mathbf{z}/T)', fx(lse, 3)],
              ['\\mathbf{p}', '$' + vec(p)],
              ['-\\log p_y', fx(-Math.log(p[y]), 4)],
              ['\\nabla_{\\mathbf{z}} = (\\mathbf{p}-\\mathbf{e}_y)/T', '$' + vec(g)],
            ]}
          />
          <div className="ml-btns">
            <Btn onClick={() => setZ(z.map((v) => Math.min(6, v + 1)))}>Add 1 to every z</Btn>
            <Btn onClick={() => { setZ([...z0]); setT((spec.T as number) ?? 1); }}>Reset</Btn>
          </div>
        </>
      }
    >
      <div className="ml-stack">
        <div className="ml-plot-title">logits z</div>
        <Bars data={z.map((v, k) => ({ label: `class ${k}`, value: v, color: CLASS3[k] }))} min={-6} max={6} height={150} width={420} fmt={(v) => fx(v, 1)} />
        <div className="ml-plot-title">probabilities p = softmax(z / T)</div>
        <Bars data={p.map((v, k) => ({ label: `class ${k}${k === y ? ' (true)' : ''}`, value: v, color: CLASS3[k] }))} max={1} min={0} height={170} width={420} fmt={(v) => fx(v, 3)} />
      </div>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ ml.softmax-2d

const threeClass = (() => {
  const r = new Rng(5);
  const out: Pt[] = [];
  const centers: P2[] = [[0, 1.9], [-1.7, -1], [1.7, -1]];
  for (let c = 0; c < 3; c++) for (let k = 0; k < 15; k++) out.push({ x: [clampv(r.normal(centers[c][0], 0.8)), clampv(r.normal(centers[c][1], 0.8))], y: c });
  return out;
})();

function ClassRaster({ f, res = 40 }: { f: (x: number, y: number) => number[]; res?: number }) {
  const { x, y, sx, sy } = usePlane();
  const cells = useMemo(() => {
    const out: ReactNode[] = [];
    const dx = (x[1] - x[0]) / res, dy = (y[1] - y[0]) / res;
    for (let i = 0; i < res; i++)
      for (let j = 0; j < res; j++) {
        const cx = x[0] + (j + 0.5) * dx, cy = y[0] + (i + 0.5) * dy;
        const p = f(cx, cy);
        let k = 0;
        for (let m = 1; m < p.length; m++) if (p[m] > p[k]) k = m;
        const a = 0.06 + 0.5 * ((p[k] - 1 / 3) / (2 / 3));
        out.push(<rect key={i * res + j} x={sx(cx - dx / 2)} y={sy(cy + dy / 2)} width={sx(cx + dx / 2) - sx(cx - dx / 2) + 0.5} height={sy(cy - dy / 2) - sy(cy + dy / 2) + 0.5} style={{ fill: CLASS3[k], opacity: a }} />);
      }
    return out;
  }, [f, res, x, y, sx, sy]);
  return <g>{cells}</g>;
}

/**
 * ml.softmax-2d — three-class softmax regression in the plane (no biases): drag the weight vectors w₀, w₁, w₂;
 * regions coloured by the predicted class, shaded by its probability; temperature; a few training steps.
 * params: W [[w0], [w1], [w2]], T
 */
function Softmax2D({ spec }: { spec: VizSpec }) {
  const W0 = (spec.W as P2[]) ?? [[0, 1], [-1, 0], [1, 0]];
  const [W, setW] = useState<P2[]>(W0.map((v) => [...v] as P2));
  const [T, setT] = useState((spec.T as number) ?? 1);
  const data = threeClass;
  const probs = (x: P2, WW = W) => softmax(WW.map((w) => (w[0] * x[0] + w[1] * x[1]) / T));
  const f = useMemo(() => (x: number, y: number) => softmax(W.map((w) => (w[0] * x + w[1] * y) / T)), [W, T]);
  const ce = data.reduce((s, { x, y }) => s - Math.log(probs(x)[y]), 0) / data.length;
  const acc = data.filter(({ x, y }) => {
    const p = probs(x);
    return p.indexOf(Math.max(...p)) === y;
  }).length / data.length;
  const train = (steps: number) => {
    let WW = W.map((w) => [...w] as P2);
    for (let s = 0; s < steps; s++) {
      const G = WW.map(() => [0, 0] as P2);
      for (const { x, y } of data) {
        const p = probs(x, WW);
        p.forEach((pk, k) => {
          const e = (pk - (k === y ? 1 : 0)) / T;
          G[k][0] += e * x[0];
          G[k][1] += e * x[1];
        });
      }
      WW = WW.map((w, k) => [w[0] - (0.5 * G[k][0]) / data.length, w[1] - (0.5 * G[k][1]) / data.length] as P2);
    }
    setW(WW);
  };
  const shown = (w: P2): P2 => {
    const n = Math.hypot(w[0], w[1]);
    return n > 3.6 ? [(w[0] * 3.6) / n, (w[1] * 3.6) / n] : w;
  };
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="T" value={T} min={0.2} max={4} step={0.05} onChange={setT} />
          <Readout
            rows={[
              ...W.map((w, k) => [`\\mathbf{w}_${k}`, `(${fx(w[0])}, ${fx(w[1])})`] as [string, string]),
              ['\\text{mean cross-entropy}', fx(ce, 4)],
              ['\\text{accuracy}', `${Math.round(acc * 100)}%`],
            ]}
          />
          <div className="ml-btns">
            <Btn primary onClick={() => train(10)}>Train 10 steps</Btn>
            <Btn onClick={() => { setW(W0.map((v) => [...v] as P2)); setT((spec.T as number) ?? 1); }}>Reset</Btn>
          </div>
          <div className="muted small">Each region is where one score wₖᵀx is largest. Darker shading means a higher top probability.</div>
        </>
      }
    >
      <Plane x={[-4, 4]} y={[-4, 4]} width={400} gridStep={1}>
        <ClassRaster f={f} res={40} />
        {data.map(({ x, y }, k) => (
          <ClassMark key={k} at={x} cls={y} />
        ))}
        {W.map((w, k) => (
          <Arrow key={'a' + k} to={shown(w)} color={CLASS3[k]} width={3} tex={`\\mathbf{w}_${k}`} labelAt={0.7} />
        ))}
        {W.map((w, k) => (
          <Handle key={'h' + k} at={shown(w)} onChange={(p) => setW(W.map((o, j) => (j === k ? p : o)))} color={CLASS3[k]} r={6} snap={0.1} label={`weight vector w${k}`} />
        ))}
      </Plane>
    </FigureLayout>
  );
}

function ClassMark({ at, cls }: { at: P2; cls: number }) {
  const { sx, sy } = usePlane();
  const x = sx(at[0]), y = sy(at[1]);
  const st = { fill: CLASS3[cls], stroke: 'var(--surface)', strokeWidth: 1.2 };
  if (cls === 0) return <circle cx={x} cy={y} r={4.5} style={st} />;
  if (cls === 1) return <rect x={x - 4} y={y - 4} width={8} height={8} style={st} />;
  return <polygon points={`${x},${y - 5.5} ${x + 5},${y + 4} ${x - 5},${y + 4}`} style={st} />;
}

export const logisticViz = {
  'ml.logreg-2d': {
    component: LogReg2D,
    validate: (s: VizSpec) => (s.data !== undefined && s.data !== 'overlap' && s.data !== 'separable' ? "data must be 'overlap' or 'separable'" : null),
    doc: "2-D logistic regression: probability heat map, boundary, drag w and b or train by GD; L2 toggle; data 'overlap' | 'separable'. params data, w, b, eta",
  },
  'ml.logreg-loss': {
    component: LossVsZ,
    validate: (s: VizSpec) => (s.mode !== undefined && !['loss', 'grad', 'w'].includes(s.mode as string) ? "mode must be 'loss', 'grad' or 'w'" : null),
    doc: "BCE vs MSE on a sigmoid output for y = 1, as functions of the logit (loss or gradient) or of one weight on a 1-D dataset. params mode 'loss'|'grad'|'w', z",
  },
  'ml.softmax-bars': {
    component: SoftmaxBars,
    validate: (s: VizSpec) => (s.z !== undefined && !(Array.isArray(s.z) && s.z.length === 3) ? 'z must have 3 entries' : null),
    doc: 'Softmax of 3 logits with temperature; bars of z and p, cross-entropy and gradient. params z, T, y',
  },
  'ml.softmax-2d': {
    component: Softmax2D,
    validate: (s: VizSpec) => (s.W !== undefined && !(Array.isArray(s.W) && s.W.length === 3) ? 'W must hold 3 weight vectors' : null),
    doc: 'Three-class softmax regression in 2-D: draggable class weight vectors, regions shaded by probability, temperature, training steps. params W, T',
  },
};
