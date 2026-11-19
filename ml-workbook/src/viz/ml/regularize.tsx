import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Handle, Poly, Point, Contours, Path, Label, Slider, Readout, FigureLayout, SegControl, Btn, LinePlot, type P2 } from '../kit';
import { fx, fc, logspace, mean, SERIES } from './common';
import { REG_X, REG_Y } from './data';
import './ml.css';

// ------------------------------------------------------------------ ml.reg-constraint

type Pen = 'l2' | 'l1' | 'en';

/** squared-error loss around the unregularized solution: L(w) = (w − ŵ)ᵀ A (w − ŵ), A = [[1, ρ], [ρ, 1]] */
const quad = (A: number[][], wh: P2) => (w: P2) => {
  const d0 = w[0] - wh[0], d1 = w[1] - wh[1];
  return A[0][0] * d0 * d0 + 2 * A[0][1] * d0 * d1 + A[1][1] * d1 * d1;
};

/** penalty value R(w) whose ball {R ≤ t} is drawn */
const ballR = (pen: Pen, w: P2, t: number) => {
  const l1 = Math.abs(w[0]) + Math.abs(w[1]), l2 = Math.hypot(w[0], w[1]);
  if (pen === 'l1') return l1;
  if (pen === 'l2') return l2;
  return 0.5 * l1 + (0.5 * l2 * l2) / Math.max(t, 1e-9); // elastic-net ball scaled to pass through (±t, 0)
};

/** boundary radius of the elastic-net ball at angle θ: ½ r a + ½ r²/t = t with a = |cos θ| + |sin θ| */
const enRadius = (theta: number, t: number) => {
  const a = Math.abs(Math.cos(theta)) + Math.abs(Math.sin(theta));
  return (t * (-a + Math.sqrt(a * a + 8))) / 2;
};

function constrainedMin(pen: Pen, A: number[][], wh: P2, t: number): { w: P2; lam: number | null } {
  const L = quad(A, wh);
  if (t <= 1e-9) return { w: [0, 0], lam: null };
  if (ballR(pen, wh, t) <= t) return { w: wh, lam: 0 };
  const Awh: P2 = [A[0][0] * wh[0] + A[0][1] * wh[1], A[1][0] * wh[0] + A[1][1] * wh[1]];
  if (pen === 'l2') {
    // (A + λI) w = A ŵ, choose λ so that ‖w‖ = t (‖w(λ)‖ decreases in λ)
    const wOf = (lam: number): P2 => {
      const a = A[0][0] + lam, b = A[0][1], d = A[1][1] + lam, det = a * d - b * b;
      return [(d * Awh[0] - b * Awh[1]) / det, (-b * Awh[0] + a * Awh[1]) / det];
    };
    let lo = 0, hi = 1;
    while (Math.hypot(...wOf(hi)) > t && hi < 1e9) hi *= 2;
    for (let k = 0; k < 80; k++) {
      const mid = (lo + hi) / 2;
      if (Math.hypot(...wOf(mid)) > t) lo = mid;
      else hi = mid;
    }
    const lam = (lo + hi) / 2;
    return { w: wOf(lam), lam };
  }
  if (pen === 'l1') {
    const corners: P2[] = [[t, 0], [0, t], [-t, 0], [0, -t]];
    let best: P2 = [t, 0], bv = Infinity;
    for (let k = 0; k < 4; k++) {
      const P = corners[k], Q = corners[(k + 1) % 4];
      const d: P2 = [Q[0] - P[0], Q[1] - P[1]], e: P2 = [P[0] - wh[0], P[1] - wh[1]];
      const dAd = A[0][0] * d[0] * d[0] + 2 * A[0][1] * d[0] * d[1] + A[1][1] * d[1] * d[1];
      const dAe = A[0][0] * d[0] * e[0] + A[0][1] * (d[0] * e[1] + d[1] * e[0]) + A[1][1] * d[1] * e[1];
      const s = Math.max(0, Math.min(1, -dAe / dAd));
      const w: P2 = [P[0] + s * d[0], P[1] + s * d[1]];
      if (Math.abs(w[0]) < 1e-12) w[0] = 0;
      if (Math.abs(w[1]) < 1e-12) w[1] = 0;
      const v = L(w);
      if (v < bv) {
        bv = v;
        best = w;
      }
    }
    // objective L(w) + λ‖w‖₁: stationarity 2A(w − ŵ) + λ·sign(w) = 0 on the nonzero coordinates
    const g: P2 = [2 * (A[0][0] * (wh[0] - best[0]) + A[0][1] * (wh[1] - best[1])), 2 * (A[1][0] * (wh[0] - best[0]) + A[1][1] * (wh[1] - best[1]))];
    const j = Math.abs(best[0]) > 1e-9 ? 0 : 1;
    return { w: best, lam: Math.abs(g[j]) };
  }
  // elastic net: search the boundary (angles include the axes exactly)
  const N = 1440;
  let best: P2 = [t, 0], bv = Infinity;
  for (let k = 0; k < N; k++) {
    const th = (2 * Math.PI * k) / N;
    const r = enRadius(th, t);
    // k = 0, 720 are θ = 0, π (w₂ = 0); k = 360, 1080 are θ = π/2, 3π/2 (w₁ = 0)
    const w: P2 = [k % 720 === 360 ? 0 : r * Math.cos(th), k % 720 === 0 ? 0 : r * Math.sin(th)];
    const v = L(w);
    if (v < bv) {
      bv = v;
      best = w;
    }
  }
  return { w: best, lam: null };
}

/**
 * ml.reg-constraint — constrained form of ridge / lasso / elastic net in 2-D. Loss contours (ellipses around the
 * unregularized solution ŵ, shape set by the feature correlation ρ), the ball ‖w‖ ≤ t, the touching point,
 * and the path of solutions as t shrinks.
 * params: penalty 'l2' | 'l1' | 'en', what (ŵ, default [2, 1]), rho, t
 */
function RegConstraint({ spec }: { spec: VizSpec }) {
  const [pen, setPen] = useState<Pen>((spec.penalty as Pen) ?? 'l2');
  const [wh, setWh] = useState<P2>((spec.what as P2) ?? [2, 1]);
  const [rho, setRho] = useState((spec.rho as number) ?? 0.5);
  const [t, setT] = useState((spec.t as number) ?? 1.2);
  const A = useMemo(() => [[1, rho], [rho, 1]], [rho]);
  const L = useMemo(() => quad(A, wh), [A, wh]);
  const f = useMemo(() => (x: number, y: number) => L([x, y]), [L]);
  const sol = constrainedMin(pen, A, wh, t);
  const tMax = ballR(pen, wh, 1);
  const tFull = pen === 'en' ? (() => {
    // smallest t whose elastic-net ball contains ŵ: ½‖ŵ‖₁ + ½‖ŵ‖²/t = t
    const a = Math.abs(wh[0]) + Math.abs(wh[1]), q = wh[0] ** 2 + wh[1] ** 2;
    return (a / 2 + Math.sqrt(a * a / 4 + 2 * q)) / 2;
  })() : tMax;
  const pathPts = useMemo(() => Array.from({ length: 61 }, (_, k) => constrainedMin(pen, A, wh, (tFull * k) / 60).w), [pen, A, wh, tFull]);
  const Lstar = L(sol.w);
  const ball: P2[] =
    pen === 'l2'
      ? Array.from({ length: 121 }, (_, k) => [t * Math.cos((2 * Math.PI * k) / 120), t * Math.sin((2 * Math.PI * k) / 120)] as P2)
      : pen === 'l1'
        ? [[t, 0], [0, t], [-t, 0], [0, -t]]
        : Array.from({ length: 241 }, (_, k) => {
            const th = (2 * Math.PI * k) / 240;
            const r = enRadius(th, t);
            return [r * Math.cos(th), r * Math.sin(th)] as P2;
          });
  const levels = useMemo(() => [0.1, 0.3, 0.6, 1, 1.6, 2.4, 3.4, 4.8].filter((v) => Math.abs(v - Lstar) > 0.04), [Lstar]);
  const zeros = sol.w.filter((x) => Math.abs(x) < 1e-9).length;
  const penName = pen === 'l2' ? '\\lVert\\mathbf{w}\\rVert_2' : pen === 'l1' ? '\\lVert\\mathbf{w}\\rVert_1' : 'R_{\\text{EN}}(\\mathbf{w})';
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={pen} onChange={setPen} options={[{ v: 'l2', label: 'ridge (L2)' }, { v: 'l1', label: 'lasso (L1)' }, { v: 'en', label: 'elastic net' }]} />
          <Slider tex="t" value={t} min={0} max={3} step={0.02} onChange={setT} />
          <Slider tex="\rho" value={rho} min={-0.9} max={0.9} step={0.05} onChange={setRho} />
          <Readout
            rows={[
              ['\\hat{\\mathbf{w}}\\ (\\lambda = 0)', `(${fx(wh[0])}, ${fx(wh[1])})`],
              ['\\mathbf{w}^\\star', `(${fx(sol.w[0])}, ${fx(sol.w[1])})`],
              [penName + '\\le t', `${fx(ballR(pen, sol.w, t))} ≤ ${fx(t)}`],
              ['\\text{loss increase}', fx(Lstar, 3)],
              ['\\text{equivalent } \\lambda', sol.lam === null ? '—' : fc(sol.lam, 3)],
              ['\\text{zero weights}', String(zeros)],
            ]}
          />
          <div className="ml-note">
            {zeros > 0 && t > 0 && pen !== 'l2'
              ? 'The lowest contour touches the ball at a corner on an axis: one weight is exactly zero.'
              : Lstar < 1e-9
                ? 'ŵ is inside the ball, so the constraint does nothing (λ = 0).'
                : 'The solution is where the lowest loss contour first touches the ball.'}
          </div>
          <div className="muted small">Drag ŵ. The dashed curve is the path of w* as t goes from 0 to the size of ŵ.</div>
        </>
      }
    >
      <Plane x={[-1.6, 3]} y={[-1.6, 3]} width={420} xLabel="w₁" yLabel="w₂" gridStep={0.5}>
        <Contours f={f} levels={levels} n={60} />
        <Poly pts={ball} fill="var(--c-u)" fillOpacity={0.15} stroke="var(--c-u)" width={2} />
        {Lstar > 1e-9 && <Contours f={f} levels={[Lstar]} n={90} color="var(--c-v)" width={2.2} />}
        <Path pts={pathPts} color="var(--c-w)" width={2} dashed />
        <Point at={sol.w} r={5.5} color="var(--c-w)" />
        <Label at={sol.w} tex="\mathbf{w}^\star" color="var(--c-w)" dx={-22} dy={14} />
        <Handle at={wh} onChange={setWh} color="var(--fg)" r={5} snap={0.05} tex="\hat{\mathbf{w}}" label="unregularized solution" />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ ml.reg-path

const NTR = 20;
const D = 6;
const regSetup = () => {
  const Xtr = REG_X.slice(0, NTR), Xva = REG_X.slice(NTR);
  const ytr = REG_Y.slice(0, NTR), yva = REG_Y.slice(NTR);
  const mu = Array.from({ length: D }, (_, j) => mean(Xtr.map((r) => r[j])));
  const sd = Array.from({ length: D }, (_, j) => Math.sqrt(mean(Xtr.map((r) => (r[j] - mu[j]) ** 2))));
  const A = Xtr.map((r) => r.map((v, j) => (v - mu[j]) / sd[j]));
  const B = Xva.map((r) => r.map((v, j) => (v - mu[j]) / sd[j]));
  const ym = mean(ytr);
  const yc = ytr.map((v) => v - ym);
  const G = Array.from({ length: D }, (_, i) => Array.from({ length: D }, (_, j) => A.reduce((s, r) => s + r[i] * r[j], 0)));
  const c = Array.from({ length: D }, (_, j) => A.reduce((s, r, k) => s + r[j] * yc[k], 0));
  const mse = (w: number[], M: number[][], y: number[]) => mean(M.map((r, k) => (r.reduce((s, v, j) => s + v * w[j], 0) + ym - y[k]) ** 2));
  return { A, B, ytr, yva, yc, G, c, mse };
};
const REG = regSetup();

function solveSym(M: number[][], b: number[]): number[] {
  const n = b.length;
  const a = M.map((r, i) => [...r, b[i]]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let r = k + 1; r < n; r++) if (Math.abs(a[r][k]) > Math.abs(a[p][k])) p = r;
    [a[k], a[p]] = [a[p], a[k]];
    for (let r = k + 1; r < n; r++) {
      const f = a[r][k] / a[k][k];
      for (let j = k; j <= n; j++) a[r][j] -= f * a[k][j];
    }
  }
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = a[i][n];
    for (let j = i + 1; j < n; j++) s -= a[i][j] * x[j];
    x[i] = s / a[i][i];
  }
  return x;
}

const LAMS = logspace(-2, 3, 101);
const ridgeAt = (lam: number) => solveSym(REG.G.map((r, i) => r.map((v, j) => v + (i === j ? lam : 0))), REG.c);
/** lasso for ‖y − Xw‖² + λ‖w‖₁ by cyclic coordinate descent (warm start) */
function lassoAt(lam: number, w0?: number[]): number[] {
  const w = w0 ? [...w0] : Array(D).fill(0);
  for (let sweep = 0; sweep < 500; sweep++) {
    let change = 0;
    for (let j = 0; j < D; j++) {
      // ρ_j = x_jᵀ(y − X w + x_j w_j) = c_j − Σ_k G_jk w_k + G_jj w_j
      let rho = REG.c[j];
      for (let k = 0; k < D; k++) if (k !== j) rho -= REG.G[j][k] * w[k];
      const nw = Math.sign(rho) * Math.max(Math.abs(rho) - lam / 2, 0) / REG.G[j][j];
      change = Math.max(change, Math.abs(nw - w[j]));
      w[j] = nw;
    }
    if (change < 1e-10) break;
  }
  return w;
}
const PATHS = (() => {
  const ridge = LAMS.map(ridgeAt);
  const lasso: number[][] = Array(LAMS.length);
  let w: number[] | undefined;
  for (let k = LAMS.length - 1; k >= 0; k--) {
    w = lassoAt(LAMS[k], w);
    lasso[k] = w;
  }
  return { ridge, lasso };
})();

/**
 * ml.reg-path — ridge and lasso coefficient paths versus λ (log scale) on a fixed 6-feature dataset with a
 * correlated pair (x₁, x₂); training and validation MSE versus λ; the λ with the lowest validation MSE.
 * params: kind 'ridge' | 'lasso', lambda
 */
function RegPath({ spec }: { spec: VizSpec }) {
  const [kind, setKind] = useState<'ridge' | 'lasso'>((spec.kind as 'ridge' | 'lasso') ?? 'ridge');
  const [ll, setLl] = useState(Math.log10((spec.lambda as number) ?? 0.01));
  const lam = 10 ** ll;
  const w = kind === 'ridge' ? ridgeAt(lam) : lassoAt(lam, PATHS.lasso[Math.max(0, Math.min(LAMS.length - 1, Math.round((ll + 2) * 20)))]);
  const paths = PATHS[kind];
  const errs = useMemo(
    () => ({
      tr: paths.map((ww, k) => [LAMS[k], REG.mse(ww, REG.A, REG.ytr)] as [number, number]),
      va: paths.map((ww, k) => [LAMS[k], REG.mse(ww, REG.B, REG.yva)] as [number, number]),
    }),
    [paths],
  );
  const bestK = errs.va.reduce((bi, p, k) => (p[1] < errs.va[bi][1] ? k : bi), 0);
  const nz = w.filter((v) => Math.abs(v) > 1e-9).length;
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={kind} onChange={setKind} options={[{ v: 'ridge', label: 'ridge' }, { v: 'lasso', label: 'lasso' }]} />
          <Slider tex="\log_{10}\lambda" value={ll} min={-2} max={3} step={0.05} onChange={setLl} />
          <div className="ml-legend">
            {w.map((v, j) => (
              <div key={j} className="ml-legend-row">
                <span className="ml-key">
                  <span className="ml-swatch" style={{ background: SERIES[j] }} />
                  w{j + 1}
                </span>
                <span className="ml-val" style={{ opacity: Math.abs(v) < 1e-9 ? 0.45 : 1 }}>{fx(v, 3)}</span>
              </div>
            ))}
          </div>
          <Readout
            rows={[
              ['\\lambda', fc(lam, 3)],
              ['\\text{nonzero weights}', `${nz} of ${D}`],
              ['\\text{train MSE}', fx(REG.mse(w, REG.A, REG.ytr), 3)],
              ['\\text{validation MSE}', fx(REG.mse(w, REG.B, REG.yva), 3)],
              ['\\text{best } \\lambda \\text{ (validation)}', fc(LAMS[bestK], 3)],
            ]}
          />
          <div className="ml-btns">
            <Btn onClick={() => setLl(Math.log10(LAMS[bestK]))}>Go to best λ</Btn>
          </div>
        </>
      }
      below={
        <div className="ml-plots">
          <div className="ml-plot ml-plot-wide">
            <div className="ml-plot-title">train (solid) and validation (dashed) MSE</div>
            <LinePlot
              series={[
                { pts: errs.tr, color: 'var(--c-u)' },
                { pts: errs.va, color: 'var(--c-v)', dashed: true },
              ]}
              logX
              x={[0.01, 1000]}
              y={[0, 15]}
              height={160}
              xlabel="λ"
              vlines={[{ x: lam, color: 'var(--fg)' }, { x: LAMS[bestK], color: 'var(--c-v)' }]}
            />
          </div>
        </div>
      }
    >
      <div className="ml-stack">
        <div className="ml-plot-title">standardized coefficients versus λ</div>
        <LinePlot
          series={Array.from({ length: D }, (_, j) => ({ pts: paths.map((ww, k) => [LAMS[k], ww[j]] as [number, number]), color: SERIES[j], width: 2.2 }))}
          logX
          x={[0.01, 1000]}
          y={[-4, 6]}
          width={460}
          height={300}
          xlabel="λ (log scale)"
          ylabel="coefficient"
          legend={false}
          hlines={[{ y: 0 }]}
          vlines={[{ x: lam, color: 'var(--fg)' }]}
        >
          {(sx, sy) => w.map((v, j) => <circle key={j} cx={sx(lam)} cy={sy(v)} r={4} style={{ fill: SERIES[j], stroke: 'var(--surface)', strokeWidth: 1.5 }} />)}
        </LinePlot>
      </div>
    </FigureLayout>
  );
}

export const regularizeViz = {
  'ml.reg-constraint': {
    component: RegConstraint,
    validate: (s: VizSpec) => (s.penalty !== undefined && !['l1', 'l2', 'en'].includes(s.penalty as string) ? "penalty must be 'l1', 'l2' or 'en'" : null),
    doc: "Constraint picture of ridge/lasso/elastic net: loss ellipses around ŵ (draggable), the ball of radius t, touching point and solution path. params penalty 'l2'|'l1'|'en', what, rho, t",
  },
  'ml.reg-path': {
    component: RegPath,
    validate: (s: VizSpec) => (s.kind !== undefined && s.kind !== 'ridge' && s.kind !== 'lasso' ? "kind must be 'ridge' or 'lasso'" : null),
    doc: "Ridge and lasso coefficient paths vs λ on a fixed 6-feature dataset, with train/validation MSE. params kind 'ridge'|'lasso', lambda",
  },
};
