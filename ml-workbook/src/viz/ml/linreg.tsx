import { useEffect, useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Handle, InfLine, Poly, Point, Contours, Path, Seg, Curve, Slider, Readout, FigureLayout, SegControl, Btn, Toggle, LinePlot, usePlayer, type P2 } from '../kit';
import { fx, fc, lstsqQR, eigSym2, mean } from './common';
import { GD_X, GD_Y, POLY_TRAIN_X, POLY_TRAIN_Y, POLY_VAL_X, POLY_VAL_Y } from './data';
import './ml.css';

// ------------------------------------------------------------------ ml.lr-fit

const DEFAULT_PTS: P2[] = [
  [0.5, 1],
  [1.5, 2.5],
  [2.5, 2],
  [3.5, 4],
  [4.5, 3.5],
  [5.5, 5],
];

/** closed-form simple regression: w = Sxy / Sxx, b = ȳ − w x̄ */
function olsLine(pts: P2[]): [number, number] {
  const mx = mean(pts.map((p) => p[0])), my = mean(pts.map((p) => p[1]));
  let sxx = 0, sxy = 0;
  for (const [x, y] of pts) {
    sxx += (x - mx) ** 2;
    sxy += (x - mx) * (y - my);
  }
  if (sxx < 1e-12) return [0, my];
  const w = sxy / sxx;
  return [w, my - w * mx];
}

const isPts = (v: unknown) => Array.isArray(v) && v.length >= 2 && v.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));

/**
 * ml.lr-fit — drag data points and the line; residuals drawn as squares whose total area is n·MSE,
 * beside a contour plot of the MSE over (w, b) with the current parameters (draggable) and the optimum.
 * mode 'squares' | 'gauss' (Gaussian noise model drawn at each x, with σ slider and the negative log-likelihood).
 * params: mode, points [[x,y],…] in [0,7]×[0,6], w, b
 */
function LrFit({ spec }: { spec: VizSpec }) {
  const mode = (spec.mode as 'squares' | 'gauss') ?? 'squares';
  const init = (isPts(spec.points) ? (spec.points as P2[]) : DEFAULT_PTS).map((p) => [...p] as P2);
  const [pts, setPts] = useState<P2[]>(init);
  const [w, setW] = useState((spec.w as number) ?? 0.3);
  const [b, setB] = useState((spec.b as number) ?? 2.5);
  const [sigma, setSigma] = useState(0.6);
  const n = pts.length;
  const [wo, bo] = useMemo(() => olsLine(pts), [pts]);
  const mse = (ww: number, bb: number) => pts.reduce((s, [x, y]) => s + (ww * x + bb - y) ** 2, 0) / n;
  const sse = mse(w, b) * n;
  const best = mse(wo, bo);
  const lossF = useMemo(() => (ww: number, bb: number) => pts.reduce((s, [x, y]) => s + (ww * x + bb - y) ** 2, 0) / pts.length, [pts]);
  const WR: [number, number] = [-0.6, 2.2], BR: [number, number] = [-2, 4];
  const levels = useMemo(() => {
    const lo = lossF(...olsLine(pts));
    return [0.05, 0.15, 0.35, 0.7, 1.2, 2, 3.2, 5, 8].map((t) => lo + t);
  }, [lossF, pts]);
  const xa = 1, xb = 6;
  const ya = w * xa + b, yb = w * xb + b;
  const setLineFrom = (pa: P2 | null, pb: P2 | null) => {
    const A: P2 = pa ?? [xa, ya], B: P2 = pb ?? [xb, yb];
    const nw = (B[1] - A[1]) / (xb - xa);
    setW(nw);
    setB(A[1] - nw * xa);
  };
  const c = 0.8; // width of a drawn density per unit of probability density
  const pdf = (r: number) => Math.exp((-0.5 * r * r) / (sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI));
  const nll = (n / 2) * Math.log(2 * Math.PI * sigma * sigma) + sse / (2 * sigma * sigma);
  const clampP = (v: number, [lo, hi]: [number, number]) => Math.max(lo, Math.min(hi, v));
  return (
    <FigureLayout
      side={
        <>
          <div className="ml-panel-plot">
            <Plane x={WR} y={BR} width={240} height={210} xLabel="w" yLabel="b" gridStep={0.5}>
              <Contours f={lossF} levels={levels} n={50} />
              <Point at={[wo, bo]} r={4} color="var(--c-w)" hollow />
              <Handle at={[clampP(w, WR), clampP(b, BR)]} onChange={([a, bb]) => { setW(a); setB(bb); }} color="var(--accent)" snap={0.02} label="parameters (w, b)" />
            </Plane>
            <div className="muted small">MSE over <i>(w, b)</i>. Drag the blue dot; the hollow green dot is the minimum.</div>
          </div>
          {mode === 'gauss' && <Slider tex="\sigma" value={sigma} min={0.3} max={1.5} step={0.05} onChange={setSigma} />}
          <Readout
            rows={[
              ['\\hat y', `${fx(w)}x ${b < 0 ? '−' : '+'} ${fx(Math.abs(b))}`],
              [mode === 'squares' ? '\\text{total area} = \\textstyle\\sum r_i^2' : '\\textstyle\\sum r_i^2', fx(sse, 3)],
              ['\\text{MSE} = \\tfrac1n\\sum r_i^2', fx(sse / n, 3)],
              ...(mode === 'gauss'
                ? ([
                    ['-\\log p(\\mathbf{y}\\mid w, b, \\sigma)', fx(nll, 3)],
                    ['\\hat\\sigma = \\sqrt{\\text{MSE}}', fx(Math.sqrt(sse / n), 3)],
                  ] as [string, string][])
                : []),
              ['\\text{best MSE}', fx(best, 3)],
            ]}
          />
          <div className="ml-btns">
            <Btn primary onClick={() => { setW(wo); setB(bo); }}>Fit (closed form)</Btn>
            <Btn onClick={() => { setPts(init); setW((spec.w as number) ?? 0.3); setB((spec.b as number) ?? 2.5); }}>Reset</Btn>
          </div>
          <div className="muted small">Drag the data points, or the two green handles on the line.</div>
        </>
      }
    >
      <Plane x={[0, 7]} y={[0, 6]} width={440}>
        {mode === 'squares' &&
          pts.map(([x, y], i) => {
            const yh = w * x + b, r = Math.abs(y - yh);
            return <Poly key={'sq' + i} pts={[[x, y], [x + r, y], [x + r, yh], [x, yh]]} fill="var(--c-err)" fillOpacity={0.16} stroke="var(--c-err)" width={1.2} />;
          })}
        {mode === 'gauss' &&
          pts.map(([x, y], i) => {
            const yh = w * x + b;
            const curve: P2[] = Array.from({ length: 61 }, (_, k) => {
              const t = -3 * sigma + (6 * sigma * k) / 60;
              return [x + c * pdf(t), yh + t];
            });
            return (
              <g key={'g' + i}>
                <Seg a={[x, yh - 3 * sigma]} b={[x, yh + 3 * sigma]} color="var(--muted)" width={1} />
                <Poly pts={[[x, yh - 3 * sigma], ...curve, [x, yh + 3 * sigma]]} fill="var(--c-v)" fillOpacity={0.14} />
                <Path pts={curve} color="var(--c-v)" width={1.6} />
                <Seg a={[x, y]} b={[x + c * pdf(y - yh), y]} color="var(--c-err)" width={3.5} />
              </g>
            );
          })}
        {mode === 'squares' && pts.map(([x, y], i) => <Seg key={'r' + i} a={[x, y]} b={[x, w * x + b]} color="var(--c-err)" width={2} />)}
        <InfLine p={[0, b]} d={[1, w]} color="var(--c-w)" width={2.5} />
        {pts.map((p, i) => (
          <Handle key={'p' + i} at={p} onChange={(q) => setPts(pts.map((o, j) => (j === i ? q : o)))} color="var(--c-u)" r={5} snap={0.1} label={`data point ${i + 1}`} />
        ))}
        <Handle at={[xa, ya]} onChange={([, y]) => setLineFrom([xa, y], null)} color="var(--c-w)" r={5} snap={0.05} label="line handle left" bounds={{ x: [xa, xa], y: [-1, 7] }} />
        <Handle at={[xb, yb]} onChange={([, y]) => setLineFrom(null, [xb, y])} color="var(--c-w)" r={5} snap={0.05} label="line handle right" bounds={{ x: [xb, xb], y: [-1, 7] }} />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ ml.lr-gd

type GdMode = 'raw' | 'std';
const gdSetup = (mode: GdMode) => {
  const mx = mean(GD_X), sx = Math.sqrt(mean(GD_X.map((x) => (x - mx) ** 2)));
  const xs = mode === 'raw' ? GD_X : GD_X.map((x) => (x - mx) / sx);
  const n = xs.length;
  // L(w, b) = (1/n) Σ (w x + b − y)²; Hessian H = (2/n) XᵀX with X = [x, 1]
  const Sxx = xs.reduce((s, x) => s + x * x, 0), Sx = xs.reduce((s, x) => s + x, 0);
  const Sxy = xs.reduce((s, x, i) => s + x * GD_Y[i], 0), Sy = GD_Y.reduce((s, y) => s + y, 0);
  const H: [number, number, number] = [(2 * Sxx) / n, (2 * Sx) / n, 2];
  const det = Sxx * n - Sx * Sx;
  const wo = (n * Sxy - Sx * Sy) / det, bo = (Sy - wo * Sx) / n;
  const loss = (w: number, b: number) => xs.reduce((s, x, i) => s + (w * x + b - GD_Y[i]) ** 2, 0) / n;
  const grad = (w: number, b: number): P2 => {
    let gw = 0, gb = 0;
    xs.forEach((x, i) => {
      const r = w * x + b - GD_Y[i];
      gw += r * x;
      gb += r;
    });
    return [(2 * gw) / n, (2 * gb) / n];
  };
  const [lmin, lmax] = eigSym2(H[0], H[1], H[2]);
  return { xs, loss, grad, wo, bo, lmin, lmax, Lopt: loss(wo, bo) };
};
const GD_VIEW: Record<GdMode, { x: [number, number]; y: [number, number]; eta: [number, number, number]; eta0: number }> = {
  raw: { x: [-1.4, 2.4], y: [-1.2, 2.6], eta: [0.001, 0.03, 0.0005], eta0: 0.02 },
  std: { x: [-1, 3.6], y: [-0.4, 4.2], eta: [0.05, 1.2, 0.05], eta0: 0.3 },
};
const GD_STEPS = 200;
/** a log-axis range aligned to whole decades (the kit labels every decade between the bounds) */
const decadeRange = (v: number[]): [number, number] => {
  const f = v.filter((x) => x > 0 && Number.isFinite(x));
  const lo = Math.max(1e-6, Math.min(...f)), hi = Math.min(1e12, Math.max(...f));
  return [10 ** Math.floor(Math.log10(lo)), 10 ** Math.max(Math.ceil(Math.log10(hi)), Math.floor(Math.log10(lo)) + 1)];
};

/**
 * ml.lr-gd — gradient descent on the linear-regression MSE over (w, b), with the raw feature x = 1..10
 * or the standardized feature. Contours, the path of iterates (step/play), the loss curve, the
 * eigenvalues of the Hessian, the stability limit 2/λ_max and the number of steps to converge.
 * params: scaled (bool, initial mode), eta
 */
function LrGd({ spec }: { spec: VizSpec }) {
  const [mode, setMode] = useState<GdMode>(spec.scaled ? 'std' : 'raw');
  const [etas, setEtas] = useState<Record<GdMode, number>>({ raw: GD_VIEW.raw.eta0, std: GD_VIEW.std.eta0, ...(typeof spec.eta === 'number' ? { [spec.scaled ? 'std' : 'raw']: spec.eta } : {}) });
  const eta = etas[mode];
  const S = useMemo(() => gdSetup(mode), [mode]);
  const [start, setStart] = useState<Record<GdMode, P2>>({ raw: [0, 0], std: [0, 0] });
  const w0 = start[mode];
  const path = useMemo(() => {
    const out: P2[] = [w0];
    let p = w0;
    for (let t = 0; t < GD_STEPS; t++) {
      const g = S.grad(p[0], p[1]);
      p = [p[0] - eta * g[0], p[1] - eta * g[1]];
      if (!Number.isFinite(p[0]) || Math.abs(p[0]) > 1e8 || Math.abs(p[1]) > 1e8) break;
      out.push(p);
    }
    return out;
  }, [S, eta, w0]);
  const stepsTo = useMemo(() => {
    let p = w0;
    const e0 = S.loss(p[0], p[1]) - S.Lopt;
    for (let t = 0; t <= 5000; t++) {
      const e = S.loss(p[0], p[1]) - S.Lopt;
      if (e <= 1e-3 * e0) return t;
      if (!Number.isFinite(e) || e > 1e12) return Infinity;
      const g = S.grad(p[0], p[1]);
      p = [p[0] - eta * g[0], p[1] - eta * g[1]];
    }
    return Infinity;
  }, [S, eta, w0]);
  const { i, controls, setI, setPlaying } = usePlayer(path.length, { interval: 45 });
  useEffect(() => {
    setI(0);
    setPlaying(false);
  }, [mode, eta, w0[0], w0[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = path[Math.min(i, path.length - 1)];
  const V = GD_VIEW[mode];
  const levels = useMemo(() => [0.02, 0.06, 0.15, 0.35, 0.8, 1.6, 3, 6, 12, 25].map((t) => S.Lopt + t), [S]);
  const etaMax = 2 / S.lmax;
  const diverging = eta >= etaMax;
  const excess = path.map((p, t) => [t, Math.max(1e-6, S.loss(p[0], p[1]) - S.Lopt)] as [number, number]);
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={mode} onChange={setMode} options={[{ v: 'raw', label: 'raw x' }, { v: 'std', label: 'standardized x' }]} />
          <Slider tex="\eta" value={eta} min={V.eta[0]} max={V.eta[1]} step={V.eta[2]} onChange={(v) => setEtas({ ...etas, [mode]: v })} fmt={(v) => (mode === 'raw' ? v.toFixed(4) : v.toFixed(2))} />
          <Readout
            rows={[
              ['\\lambda_{\\max}(H),\\ \\lambda_{\\min}(H)', `${fx(S.lmax, 2)}, ${fx(S.lmin, 2)}`],
              ['\\kappa = \\lambda_{\\max}/\\lambda_{\\min}', fx(S.lmax / S.lmin, 1)],
              ['\\text{stable if } \\eta < 2/\\lambda_{\\max}', fx(etaMax, 4)],
              ['\\text{step } t', `${i}`],
              ['(w_t, b_t)', `(${fx(cur[0])}, ${fx(cur[1])})`],
              ['L(w_t, b_t) - L^\\star', fc(S.loss(cur[0], cur[1]) - S.Lopt, 4)],
              ['\\text{steps to } 10^{-3}\\text{ of start}', Number.isFinite(stepsTo) ? String(stepsTo) : diverging ? 'diverges' : '> 5000'],
            ]}
          />
          <div className={'ml-note' + (diverging ? ' ml-warn' : '')}>
            {diverging
              ? 'η is above 2/λ_max: the error along the steep direction grows every step.'
              : mode === 'raw'
                ? 'The bowl is a long thin valley. A step size small enough for the steep direction crawls along the flat one.'
                : 'Standardized x makes the Hessian 2I: round contours, and every direction converges at the same rate.'}
          </div>
        </>
      }
      below={
        <div className="ml-plots">
          <div className="ml-plot ml-plot-wide">
            {controls}
            <LinePlot series={[{ pts: excess, color: 'var(--accent)' }]} x={[0, GD_STEPS]} y={decadeRange(excess.map((p) => p[1]))} logY height={170} xlabel="step t" ylabel="L − L*" vlines={[{ x: i, color: 'var(--c-v)' }]} />
          </div>
        </div>
      }
    >
      <Plane x={V.x} y={V.y} width={420} xLabel={mode === 'raw' ? 'w' : 'w′'} yLabel={mode === 'raw' ? 'b' : 'b′'} gridStep={0.5}>
        <Contours f={S.loss} levels={levels} n={120} />
        <Path pts={path.slice(0, i + 1)} color="var(--c-v)" width={1.6} />
        {path.slice(0, i + 1).map((p, k) => <Point key={'p' + k} at={p} r={2.2} color="var(--c-v)" />)}
        <Point at={[S.wo, S.bo]} r={4.5} color="var(--c-w)" hollow />
        <Point at={cur} r={4.5} color="var(--c-v)" />
        <Handle at={w0} onChange={(p) => setStart({ ...start, [mode]: p })} color="var(--fg)" r={5} snap={0.1} label="starting point" />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ ml.lr-poly

const vander = (xs: number[], deg: number) => xs.map((x) => Array.from({ length: deg + 1 }, (_, k) => x ** k));
const polyEval = (w: number[], x: number) => w.reduce((s, c, k) => s + c * x ** k, 0);
function fitPoly(deg: number, lam: number): number[] {
  const V = vander(POLY_TRAIN_X, deg);
  const A = [...V], y = [...POLY_TRAIN_Y];
  if (lam > 0)
    for (let k = 1; k <= deg; k++) {
      const row = Array(deg + 1).fill(0);
      row[k] = Math.sqrt(lam);
      A.push(row);
      y.push(0);
    }
  return lstsqQR(A, y);
}
const polyMse = (w: number[], xs: number[], ys: number[]) => mean(xs.map((x, i) => (polyEval(w, x) - ys[i]) ** 2));

/**
 * ml.lr-poly — polynomial features φ(x) = (1, x, …, x^d) fitted by least squares to 12 noisy points from sin(πx);
 * hollow points are held out. Degree slider; optional ridge penalty (λ slider, intercept not penalized).
 * Below: training and held-out MSE versus degree (or versus λ in ridge mode).
 * params: degree (0–11), ridge (bool), lambda
 */
function LrPoly({ spec }: { spec: VizSpec }) {
  const ridge = !!spec.ridge;
  const [deg, setDeg] = useState((spec.degree as number) ?? 1);
  const [llam, setLlam] = useState(Math.log10((spec.lambda as number) ?? 1e-3));
  const [showVal, setShowVal] = useState(true);
  const [showTrue, setShowTrue] = useState(false);
  const lam = ridge ? 10 ** llam : 0;
  const w = useMemo(() => fitPoly(deg, lam), [deg, lam]);
  const tr = polyMse(w, POLY_TRAIN_X, POLY_TRAIN_Y), va = polyMse(w, POLY_VAL_X, POLY_VAL_Y);
  const curveDeg = useMemo(() => {
    const t: [number, number][] = [], v: [number, number][] = [];
    for (let d = 0; d <= 11; d++) {
      const ww = fitPoly(d, lam);
      t.push([d, polyMse(ww, POLY_TRAIN_X, POLY_TRAIN_Y)]);
      v.push([d, polyMse(ww, POLY_VAL_X, POLY_VAL_Y)]);
    }
    return { t, v };
  }, [lam]);
  const curveLam = useMemo(() => {
    if (!ridge) return null;
    const t: [number, number][] = [], v: [number, number][] = [];
    for (let k = 0; k <= 50; k++) {
      const L = -6 + (8 * k) / 50;
      const ww = fitPoly(deg, 10 ** L);
      t.push([10 ** L, polyMse(ww, POLY_TRAIN_X, POLY_TRAIN_Y)]);
      v.push([10 ** L, polyMse(ww, POLY_VAL_X, POLY_VAL_Y)]);
    }
    return { t, v };
  }, [ridge, deg]);
  const maxAbs = Math.max(...w.map(Math.abs));
  const cv = ridge ? curveLam! : curveDeg;
  return (
    <FigureLayout
      side={
        <>
          <Slider label="degree d" value={deg} min={0} max={11} step={1} onChange={setDeg} fmt={(v) => String(v)} />
          {ridge && <Slider tex="\log_{10}\lambda" value={llam} min={-6} max={2} step={0.1} onChange={setLlam} />}
          <Readout
            rows={[
              ['\\text{features}', `${deg + 1}  (n = 12)`],
              ['\\text{train MSE}', fc(tr, 4)],
              ['\\text{held-out MSE}', fc(va, 3)],
              ['\\max_k |w_k|', fc(maxAbs, 2)],
            ]}
          />
          <div className="ml-mono">w = [{w.map((c) => fc(c, 2)).join(', ')}]</div>
          <Toggle label="held-out points" value={showVal} onChange={setShowVal} />
          <Toggle label="true curve sin(πx)" value={showTrue} onChange={setShowTrue} />
        </>
      }
      below={
        <div className="ml-plots">
          <div className="ml-plot ml-plot-wide">
            <LinePlot
              series={[
                { pts: cv.t, color: 'var(--c-u)', label: 'train MSE' },
                { pts: cv.v, color: 'var(--c-v)', label: 'held-out MSE', dashed: true },
              ]}
              logY
              logX={ridge}
              y={[1e-3, 1e3]}
              height={180}
              xlabel={ridge ? `λ (degree ${deg})` : 'degree d'}
              vlines={[{ x: ridge ? lam : deg, color: 'var(--muted)' }]}
            />
          </div>
        </div>
      }
    >
      <Plane x={[-1.05, 1.05]} y={[-2.2, 2.2]} width={440} height={300} gridStep={0.5}>
        {showTrue && <Curve f={(x) => Math.sin(Math.PI * x)} color="var(--muted)" dashed width={1.5} />}
        <Curve f={(x) => polyEval(w, x)} color="var(--c-w)" width={2.5} samples={300} />
        {showVal && POLY_VAL_X.map((x, k) => <Point key={'v' + k} at={[x, POLY_VAL_Y[k]]} r={3.5} color="var(--c-v)" hollow />)}
        {POLY_TRAIN_X.map((x, k) => (
          <Point key={'t' + k} at={[x, POLY_TRAIN_Y[k]]} r={4} color="var(--c-u)" />
        ))}
      </Plane>
    </FigureLayout>
  );
}

export const linregViz = {
  'ml.lr-fit': {
    component: LrFit,
    validate: (s: VizSpec) => (s.mode !== undefined && s.mode !== 'squares' && s.mode !== 'gauss' ? "mode must be 'squares' or 'gauss'" : s.points !== undefined && !isPts(s.points) ? 'points must be [[x, y], …]' : null),
    doc: "Linear fit with draggable points and line; residual squares (mode 'squares') or Gaussian noise densities (mode 'gauss'); MSE contours over (w, b) with a Fit button. params mode, points, w, b",
  },
  'ml.lr-gd': {
    component: LrGd,
    validate: (s: VizSpec) => (s.eta !== undefined && !(typeof s.eta === 'number' && s.eta > 0) ? 'eta must be a positive number' : null),
    doc: 'Gradient descent on linear-regression MSE, raw versus standardized feature; path on contours, loss curve, κ and 2/λmax. params scaled, eta',
  },
  'ml.lr-poly': {
    component: LrPoly,
    validate: (s: VizSpec) => (s.degree !== undefined && !(Number.isInteger(s.degree) && (s.degree as number) >= 0 && (s.degree as number) <= 11) ? 'degree must be an integer 0–11' : null),
    doc: 'Polynomial features on 12 noisy points, degree slider, held-out points, train/held-out MSE curve; ridge mode adds λ. params degree, ridge, lambda',
  },
};
