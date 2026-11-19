// la08 figures: SVD as rotate–stretch–rotate, rank-1 layers, low-rank image compression,
// conditioning and gradient descent, PCA on a point cloud, PCA pitfalls (scaling, curved data).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Arrow, Handle, InfLine, Seg, Path, Point, Contours, Slider, Readout, FigureLayout, SegControl, Toggle, usePlayer, MatrixEdit, LinePlot, Bars, MatGrid, TeX, TGrid } from '../kit';
import { dot, type Mat } from '../../math/linalg';
import { f2, vt, mt, rad, deg, rot2, mv2, mm2, det2, circle, svd2, svdJacobi, normals2, cov2, eigSym2, eigvals2, type P2 } from './util';
import './la2.css';

const isMat2 = (m: unknown) => Array.isArray(m) && m.length === 2 && m.every((r) => Array.isArray(r) && r.length === 2 && r.every((x) => typeof x === 'number'));

// ------------------------------------------------------------------ la.svd-steps
const SVD_PRESETS: Record<string, Mat> = {
  general: [[1.5, 1], [-0.5, 1.5]],
  symmetric: [[2, 1], [1, 2]],
  'det < 0': [[1, 2], [2, -1]],
  'rank 1': [[1, 2], [0.5, 1]],
};
/**
 * The unit circle goes through Vᵀ (rotate), Σ (stretch along the axes), then U (rotate or reflect) and lands
 * on the ellipse A(circle). v₁, v₂ are tracked: they end as σ₁u₁ and σ₂u₂, the ellipse's axes.
 * params: matrix
 */
function SvdSteps({ spec }: { spec: VizSpec }) {
  const [A, setA] = useState<Mat>((spec.matrix as Mat) ?? SVD_PRESETS.general);
  const s = svd2(A);
  const N = 31;
  const { i, controls } = usePlayer(N, { interval: 90 });
  const stage = i === 0 ? 0 : i <= 10 ? 1 : i <= 20 ? 2 : 3;
  const t = i === 0 ? 0 : ((i - 1) % 10 + 1) / 10;
  const Vt = rot2(-s.alpha);
  const Sg: Mat = [[s.S[0], 0], [0, s.S[1]]];
  let M: Mat;
  if (stage <= 1) M = rot2(-s.alpha * t);
  else if (stage === 2) M = mm2([[1 + (s.S[0] - 1) * t, 0], [0, 1 + (s.S[1] - 1) * t]], Vt);
  else {
    let Ut: Mat;
    if (s.uflip > 0) Ut = rot2(s.beta * t);
    else Ut = t <= 0.5 ? [[1, 0], [0, 1 - 4 * t]] : mm2(rot2(s.beta * (2 * t - 1)), [[1, 0], [0, -1]]);
    M = mm2(mm2(Ut, Sg), Vt);
  }
  const img = circle(1, 120).map((p) => mv2(M, p));
  const target = circle(1, 120).map((p) => mv2(A, p));
  const mv1 = mv2(M, s.v1), mv2_ = mv2(M, s.v2);
  const R = Math.max(2.4, s.S[0] + 0.5);
  const label = ['the unit circle', 'apply Vᵀ: rotate v₁, v₂ onto the axes', 'apply Σ: stretch the axes by σ₁ and σ₂', s.uflip > 0 ? 'apply U: rotate onto u₁, u₂' : 'apply U: reflect, then rotate onto u₁, u₂'][stage];
  const Ut_: Mat = [[s.U[0][0], s.U[0][1]], [s.U[1][0], s.U[1][1]]];
  const AtA = mm2([[A[0][0], A[1][0]], [A[0][1], A[1][1]]], A);
  const eAtA = eigvals2(AtA);
  return (
    <FigureLayout
      side={
        <>
          <MatrixEdit value={A} onChange={setA} step={0.5} label="A" />
          <SegControl value={Object.keys(SVD_PRESETS).find((k) => SVD_PRESETS[k].every((r, a) => r.every((x, b) => x === A[a][b]))) ?? ''} onChange={(k) => k && setA(SVD_PRESETS[k].map((r) => [...r]))} options={Object.keys(SVD_PRESETS).map((k) => ({ v: k, label: k }))} />
          <div className="la2-step small">
            <b>Step {stage}:</b> {label}
          </div>
          <Readout
            rows={[
              ['U', '$' + mt(Ut_)],
              ['\\Sigma', '$' + mt(Sg)],
              ['V^{\\top}', '$' + mt(Vt)],
              ['\\sigma_1,\\ \\sigma_2', `${f2(s.S[0], 3)}, ${f2(s.S[1], 3)}`],
              ['\\text{eig}(A^{\\top}A)', `${f2(eAtA.re[0], 3)}, ${f2(eAtA.re[1], 3)}`],
              ['|\\det A| = \\sigma_1\\sigma_2', f2(Math.abs(det2(A)), 3)],
            ]}
          />
        </>
      }
      below={controls}
    >
      <Plane x={[-R, R]} y={[-R, R]} width={440}>
        <TGrid M={M} extent={6} step={1} opacity={0.6} />
        <Path pts={target} color="var(--muted)" width={1.2} dashed closed />
        <Path pts={img} color="var(--c-w)" width={2.5} closed fill="color-mix(in oklab, var(--c-w) 10%, transparent)" />
        <Arrow to={mv1} color="var(--c-u)" width={3} tex={stage === 3 && t === 1 ? '\\sigma_1\\mathbf{u}_1' : stage === 0 ? '\\mathbf{v}_1' : undefined} labelAt={0.7} />
        <Arrow to={mv2_} color="var(--c-v)" width={3} tex={stage === 3 && t === 1 ? '\\sigma_2\\mathbf{u}_2' : stage === 0 ? '\\mathbf{v}_2' : undefined} labelAt={0.7} />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.rank1-sum
const RATINGS: Mat = [
  [5, 5, 4, 1, 1, 0],
  [4, 5, 5, 1, 0, 1],
  [5, 4, 5, 0, 1, 1],
  [1, 0, 1, 5, 4, 5],
  [0, 1, 1, 4, 5, 4],
  [3, 3, 2, 3, 3, 3],
];
/**
 * A = Σ σᵢ uᵢ vᵢᵀ. A 6×6 ratings-like matrix, its rank-k truncation and the k-th rank-1 layer.
 * params: matrix (any small matrix), k
 */
function Rank1Sum({ spec }: { spec: VizSpec }) {
  const A = (spec.matrix as Mat) ?? RATINGS;
  const m = A.length, n = A[0].length;
  const r = Math.min(m, n);
  const [k, setK] = useState((spec.k as number) ?? 1);
  const { U, S, V } = useMemo(() => svdJacobi(A), [A]);
  const layer = (j: number) => A.map((_, a) => A[0].map((__, b) => S[j] * U[a][j] * V[b][j]));
  const Ak = A.map((_, a) => A[0].map((__, b) => {
    let s = 0;
    for (let j = 0; j < k; j++) s += S[j] * U[a][j] * V[b][j];
    return s;
  }));
  const tot = S.reduce((s, x) => s + x * x, 0);
  const cap = S.slice(0, k).reduce((s, x) => s + x * x, 0);
  const lay = layer(k - 1);
  const f1 = (v: number) => (Math.abs(v) < 0.05 ? '0' : v.toFixed(1));
  const rng: [number, number] = [-1, 8.5];
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="k" value={k} min={1} max={r} step={1} onChange={setK} fmt={(v) => String(v)} />
          <Readout
            rows={[
              ...S.map((x, j) => [`\\sigma_${j + 1}`, f2(x, 3)] as [string, string]),
              ['\\text{energy } \\frac{\\sum_{i\\le k}\\sigma_i^2}{\\sum\\sigma_i^2}', (100 * cap / tot).toFixed(1) + '%'],
              ['\\lVert A - A_k\\rVert_F', f2(Math.sqrt(Math.max(0, tot - cap)), 3)],
            ]}
          />
        </>
      }
      below={<Bars data={S.map((x, j) => ({ label: 'σ' + (j + 1), value: x, highlight: j < k }))} height={150} fmt={(v) => v.toFixed(2)} />}
    >
      <div className="la2-grids">
        <MatGrid m={A} heat="seq" heatRange={rng} caption={<TeX>{'A'}</TeX>} />
        <MatGrid m={Ak} fmt={f1} heat="seq" heatRange={rng} caption={<TeX>{`A_{${k}} = \\sum_{i\\le ${k}} \\sigma_i\\mathbf{u}_i\\mathbf{v}_i^{\\top}`}</TeX>} />
        <MatGrid m={lay} fmt={f1} heat="div" heatRange={[-6, 6]} caption={<TeX>{`\\sigma_{${k}}\\mathbf{u}_{${k}}\\mathbf{v}_{${k}}^{\\top}`}</TeX>} />
      </div>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.lowrank-image
const IMG_N = 64;
function makeImage(): Mat {
  const N = IMG_N;
  const A: Mat = [];
  for (let i = 0; i < N; i++) {
    const row: number[] = [];
    for (let j = 0; j < N; j++) {
      let v = 0.15 + 0.35 * (i / (N - 1)); // vertical gradient: rank 1
      if (i >= 6 && i < 26 && j >= 6 && j < 30) v = 0.92; // axis-aligned rectangle
      const dx = i - 40, dy = j - 44;
      if (dx * dx + dy * dy <= 13 * 13) v = 0.72; // disk
      if (i >= 36 && i < 60 && j >= 4 && j < 28) v = Math.sin((i + j) * 0.55) > 0 ? 0.85 : 0.1; // diagonal stripes
      if (Math.abs(i - 16) + Math.abs(j - 49) < 9) v = 0.05; // diamond
      row.push(v);
    }
    A.push(row);
  }
  return A;
}
function GrayCanvas({ m, signed }: { m: Mat; signed?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const N = m.length, M = m[0].length;
    const img = ctx.createImageData(M, N);
    for (let i = 0; i < N; i++)
      for (let j = 0; j < M; j++) {
        const v = signed ? 0.5 + 2 * m[i][j] : m[i][j];
        const g = Math.round(255 * Math.max(0, Math.min(1, v)));
        const o = 4 * (i * M + j);
        img.data[o] = img.data[o + 1] = img.data[o + 2] = g;
        img.data[o + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
  }, [m, signed]);
  return <canvas ref={ref} width={m[0].length} height={m.length} className="la2-img" />;
}
/**
 * Low-rank approximation of a procedurally generated 64×64 grayscale image. k slider, reconstruction (or error),
 * singular-value spectrum (log scale) and energy captured.
 * params: k
 */
function LowRankImage({ spec }: { spec: VizSpec }) {
  const A = useMemo(makeImage, []);
  const { U, S, V } = useMemo(() => svdJacobi(A), [A]);
  const [k, setK] = useState((spec.k as number) ?? 5);
  const [show, setShow] = useState<'rec' | 'err'>('rec');
  const Ak = useMemo(() => {
    const out: Mat = A.map((r) => r.map(() => 0));
    for (let j = 0; j < k; j++) {
      const s = S[j];
      for (let a = 0; a < IMG_N; a++) {
        const us = U[a][j] * s;
        if (us === 0) continue;
        const row = out[a];
        for (let b = 0; b < IMG_N; b++) row[b] += us * V[b][j];
      }
    }
    return out;
  }, [A, U, S, V, k]);
  const E = useMemo(() => A.map((r, a) => r.map((x, b) => x - Ak[a][b])), [A, Ak]);
  const tot = S.reduce((s, x) => s + x * x, 0);
  const cap = S.slice(0, k).reduce((s, x) => s + x * x, 0);
  const rank = S.filter((x) => x > 1e-10 * S[0]).length;
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="k" value={k} min={1} max={IMG_N} step={1} onChange={setK} fmt={(v) => String(v)} />
          <SegControl value={show} onChange={setShow} options={[{ v: 'rec', label: 'rank-k image' }, { v: 'err', label: 'error' }]} />
          <Readout
            rows={[
              ['\\sigma_1,\\ \\sigma_k', `${f2(S[0], 2)}, ${f2(S[k - 1], 3)}`],
              ['\\text{energy captured}', (100 * cap / tot).toFixed(2) + '%'],
              ['\\lVert A-A_k\\rVert_F / \\lVert A\\rVert_F', f2(Math.sqrt(Math.max(0, tot - cap) / tot), 4)],
              ['\\text{numbers stored}', `${k * (2 * IMG_N + 1)} of ${IMG_N * IMG_N}`],
              ['\\rank A', String(rank)],
            ]}
          />
          <div className="small">The rectangle and the gradient need one term each. The disk and the diagonal stripes need many: their edges are not aligned with rows and columns.</div>
        </>
      }
      below={
        <LinePlot
          series={[{ pts: S.map((x, j) => [j + 1, Math.max(x, 1e-6)] as [number, number]), color: 'var(--c-u)' }, { pts: S.slice(0, k).map((x, j) => [j + 1, Math.max(x, 1e-6)] as [number, number]), color: 'var(--c-u)', scatter: true }]}
          x={[1, IMG_N]}
          y={[1e-3, 100]}
          logY
          height={190}
          xlabel="index i"
          ylabel="σᵢ"
          vlines={[{ x: k, color: 'var(--c-v)' }]}
        />
      }
    >
      <div className="la2-imgs">
        <figure>
          <GrayCanvas m={A} />
          <figcaption className="muted small">original (64×64)</figcaption>
        </figure>
        <figure>
          <GrayCanvas m={show === 'rec' ? Ak : E} signed={show === 'err'} />
          <figcaption className="muted small">{show === 'rec' ? `rank ${k}` : 'A − A_k (gray = 0)'}</figcaption>
        </figure>
      </div>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.cond-gd
/**
 * Gradient descent on f(x) = ½(μ x₁² + L x₂²) with L = 1 and μ = 1/κ. The condition number κ stretches the bowl;
 * step size η = (ηL)/L. Path, contours, and f(x_k) on a log scale.
 * params: kappa, etaL
 */
function CondGD({ spec }: { spec: VizSpec }) {
  const [kappa, setKappa] = useState((spec.kappa as number) ?? 10);
  const [etaL, setEtaL] = useState((spec.etaL as number) ?? 1);
  const L = 1, mu = 1 / kappa, eta = etaL / L;
  const x0: P2 = [-3.6, 1.8];
  const f = useMemo(() => (x: number, y: number) => 0.5 * (mu * x * x + L * y * y), [mu]);
  const K = 60;
  const path = useMemo(() => {
    const out: P2[] = [x0];
    for (let k = 0; k < K; k++) {
      const [x, y] = out[k];
      out.push([x - eta * mu * x, y - eta * L * y]);
    }
    return out;
  }, [mu, eta]); // eslint-disable-line react-hooks/exhaustive-deps
  const f0 = f(...x0);
  const rho = Math.max(Math.abs(1 - eta * mu), Math.abs(1 - eta * L));
  const need = rho >= 1 ? Infinity : rho === 0 ? 1 : Math.ceil(Math.log(1e-6) / (2 * Math.log(rho)));
  const levels = Array.from({ length: 9 }, (_, j) => f0 * 0.5 ** j * 1.2);
  const vals = path.map((p, k) => [k, Math.min(1e3, Math.max(1e-9, f(...p) / f0))] as [number, number]);
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="\kappa = L/\mu" value={kappa} min={1} max={100} step={1} onChange={setKappa} fmt={(v) => String(v)} />
          <Slider tex="\eta L" value={etaL} min={0.1} max={2.1} step={0.05} onChange={setEtaL} />
          <Readout
            rows={[
              ['\\text{Hessian } H', '$' + mt([[mu, 0], [0, L]], 3)],
              ['\\kappa(H) = \\lambda_{\\max}/\\lambda_{\\min}', f2(kappa, 1)],
              ['\\text{per-step factor } \\rho', f2(rho, 4)],
              ['\\text{steps to } f_k < 10^{-6} f_0', Number.isFinite(need) ? String(need) : 'never (diverges)'],
            ]}
          />
          <div className="small">
            Each coordinate shrinks by <TeX>{'|1-\\eta\\lambda_i|'}</TeX> per step. The steep direction caps the step at <TeX>{'\\eta < 2/L'}</TeX>, and with that step the flat direction moves by only about <TeX>{'1/\\kappa'}</TeX> of the way.
          </div>
        </>
      }
      below={<LinePlot series={[{ pts: vals, color: 'var(--c-u)' }]} x={[0, K]} y={[1e-8, 10]} logY height={210} xlabel="iteration k" ylabel="f(x_k) / f(x_0)" />}
    >
      <Plane x={[-4, 4]} y={[-2.5, 2.5]} width={440} gridStep={1}>
        <Contours f={f} levels={levels} color="var(--c-contour)" width={1.2} n={90} />
        <Path pts={path.filter((p) => Math.abs(p[0]) < 50 && Math.abs(p[1]) < 50)} color="var(--c-v)" width={1.8} />
        {path.slice(0, 25).map((p, k) => (Math.abs(p[1]) < 10 ? <Point key={k} at={p} r={2.6} color="var(--c-v)" /> : null))}
        <Point at={[0, 0]} r={4} color="var(--c-w)" />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.pca-cloud
/**
 * PCA on a 2-D cloud. θ rotates the cloud, ratio sets the short-axis spread. Drag the direction w and watch
 * the variance of the projections; it is largest at PC1. Bars show explained-variance ratios.
 * params: theta (deg), ratio, n, seed
 */
function PcaCloud({ spec }: { spec: VizSpec }) {
  const [th, setTh] = useState((spec.theta as number) ?? 30);
  const [ratio, setRatio] = useState((spec.ratio as number) ?? 0.35);
  const [wa, setWa] = useState(rad(100));
  const [lock, setLock] = useState(false);
  const n = (spec.n as number) ?? 60;
  const Z = useMemo(() => normals2(n, (spec.seed as number) ?? 7), [n, spec.seed]);
  const mean0: P2 = [1, 0.5];
  const pts = useMemo(() => {
    const M = mm2(rot2(rad(th)), [[1.8, 0], [0, 1.8 * ratio]]);
    return Z.map((z) => {
      const p = mv2(M, z);
      return [p[0] + mean0[0], p[1] + mean0[1]] as P2;
    });
  }, [Z, th, ratio]); // eslint-disable-line react-hooks/exhaustive-deps
  const { mean, C } = cov2(pts);
  const { values: lv, q1, q2 } = eigSym2(C);
  const w: P2 = lock ? q1 : [Math.cos(wa), Math.sin(wa)];
  const varw = dot(w, mv2(C, w));
  const tot = lv[0] + lv[1];
  const proj = pts.map((p) => {
    const c = (p[0] - mean[0]) * w[0] + (p[1] - mean[1]) * w[1];
    return [mean[0] + c * w[0], mean[1] + c * w[1]] as P2;
  });
  const handleAt: P2 = [mean[0] + 3 * w[0], mean[1] + 3 * w[1]];
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="\theta" value={th} min={-90} max={90} step={1} onChange={setTh} fmt={(v) => v + '°'} />
          <Slider label="spread ratio" value={ratio} min={0.05} max={1} step={0.05} onChange={setRatio} />
          <Toggle label="snap w to PC1" value={lock} onChange={setLock} />
          <Readout
            rows={[
              ['\\bar{\\mathbf{x}}', '$' + vt(mean)],
              ['C', '$' + mt(C)],
              ['\\lambda_1,\\ \\lambda_2', `${f2(lv[0], 3)}, ${f2(lv[1], 3)}`],
              ['\\text{PC1}', '$' + vt(q1)],
              ['\\mathbf{w}^{\\top}C\\mathbf{w}', f2(varw, 3)],
            ]}
          />
        </>
      }
      below={<Bars data={[{ label: 'PC1', value: lv[0] / tot, color: 'var(--c-w)' }, { label: 'PC2', value: lv[1] / tot, color: 'var(--c-k)' }, { label: 'along w', value: varw / tot, color: 'var(--c-v)' }]} height={150} max={1} fmt={(v) => (100 * v).toFixed(1) + '%'} ylabel="share of variance" />}
    >
      <Plane x={[-4, 6]} y={[-4.5, 5.5]} width={440}>
        <InfLine p={mean} d={w} color="var(--c-v)" width={1.5} opacity={0.6} />
        {pts.map((p, k) => (
          <Seg key={'s' + k} a={p} b={proj[k]} color="var(--c-v)" width={0.8} opacity={0.35} />
        ))}
        {pts.map((p, k) => (
          <Point key={'p' + k} at={p} r={2.6} color="var(--c-u)" />
        ))}
        {proj.map((p, k) => (
          <Point key={'q' + k} at={p} r={2} color="var(--c-v)" />
        ))}
        <Arrow from={mean} to={[mean[0] + 2 * Math.sqrt(lv[0]) * q1[0], mean[1] + 2 * Math.sqrt(lv[0]) * q1[1]]} color="var(--c-w)" width={3.5} tex="\text{PC1}" labelAt={0.6} />
        <Arrow from={mean} to={[mean[0] + 2 * Math.sqrt(Math.max(0, lv[1])) * q2[0], mean[1] + 2 * Math.sqrt(Math.max(0, lv[1])) * q2[1]]} color="var(--c-k)" width={3.5} tex="\text{PC2}" labelAt={0.6} />
        <Point at={mean} r={4.5} color="var(--fg)" />
        {!lock && <Handle at={handleAt} onChange={(p) => setWa(Math.atan2(p[1] - mean[1], p[0] - mean[0]))} color="var(--c-v)" tex="\mathbf{w}" label="direction w" />}
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.pca-pitfalls
/**
 * Two ways PCA misleads. 'scale': the unit of feature 2 changes PC1 unless features are standardized.
 * 'curve': points on an arc are one-dimensional, but no straight line (PC1) fits them.
 * params: mode ('scale' | 'curve')
 */
function PcaPitfalls({ spec }: { spec: VizSpec }) {
  const [mode, setMode] = useState<'scale' | 'curve'>((spec.mode as 'scale') ?? 'scale');
  const [lu, setLu] = useState(0); // log10 of the unit factor
  const [stdz, setStdz] = useState(false);
  const Z = useMemo(() => normals2(60, 11), []);
  const sfac = 10 ** lu;
  const pts: P2[] = useMemo(() => {
    if (mode === 'scale') {
      let p = Z.map(([a, b]) => [a, sfac * (0.6 * a + 0.8 * b)] as P2);
      if (stdz) {
        const { mean, C } = cov2(p);
        const s1 = Math.sqrt(C[0][0]), s2 = Math.sqrt(C[1][1]);
        p = p.map(([x, y]) => [(x - mean[0]) / s1, (y - mean[1]) / s2] as P2);
      }
      return p;
    }
    return Z.map(([a, b], k) => {
      const t = -Math.PI / 4 + (1.5 * Math.PI * (k + 0.5)) / Z.length; // a 270° arc
      return [2.5 * Math.cos(t) + 0.08 * a, 2.5 * Math.sin(t) - 0.5 + 0.08 * b] as P2;
    });
  }, [Z, mode, sfac, stdz]);
  const { mean, C } = cov2(pts);
  const { values: lv, q1 } = eigSym2(C);
  const evr = lv[0] / (lv[0] + lv[1]);
  const rec = pts.map((p) => {
    const c = (p[0] - mean[0]) * q1[0] + (p[1] - mean[1]) * q1[1];
    return [mean[0] + c * q1[0], mean[1] + c * q1[1]] as P2;
  });
  const R = Math.max(3, 1.1 * Math.max(...pts.map((p) => Math.max(Math.abs(p[0]), Math.abs(p[1])))));
  const L = 0.8 * R;
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={mode} onChange={setMode} options={[{ v: 'scale', label: 'feature units' }, { v: 'curve', label: 'curved data' }]} />
          {mode === 'scale' && (
            <>
              <Slider label="unit of x₂ (×)" value={lu} min={-1} max={1} step={0.05} onChange={setLu} fmt={(v) => (10 ** v).toFixed(v < 0 ? 2 : 1)} />
              <Toggle label="standardize both features" value={stdz} onChange={setStdz} />
            </>
          )}
          <Readout
            rows={[
              ['C', '$' + mt(C, 2)],
              ['\\text{PC1}', '$' + vt(q1, 3)],
              ['\\text{angle of PC1}', f2(deg(Math.atan2(q1[1], q1[0])), 1) + '°'],
              ['\\text{EVR}_1 = \\lambda_1/(\\lambda_1+\\lambda_2)', (100 * evr).toFixed(1) + '%'],
            ]}
          />
          <div className="small">
            {mode === 'scale'
              ? stdz
                ? 'After standardizing, the unit no longer matters: PC1 is the same for every setting of the slider.'
                : 'Measuring x₂ in smaller units multiplies its numbers, and so its variance; PC1 swings toward the x₂ axis.'
              : 'One number (the position along the arc) describes every point, yet PC1 explains only two thirds of the variance, and points a quarter-turn apart on the arc are reconstructed at the same place on the line.'}
          </div>
        </>
      }
    >
      <Plane x={[-R, R]} y={[-R, R]} width={420}>
        <InfLine p={mean} d={q1} color="var(--c-w)" width={1.5} opacity={0.5} />
        {mode === 'curve' && pts.map((p, k) => <Seg key={'e' + k} a={p} b={rec[k]} color="var(--c-err)" width={1} opacity={0.6} />)}
        {pts.map((p, k) => (
          <Point key={k} at={p} r={2.8} color="var(--c-u)" />
        ))}
        {mode === 'curve' && rec.map((p, k) => <Point key={'r' + k} at={p} r={2} color="var(--c-err)" />)}
        <Arrow from={mean} to={[mean[0] + L * q1[0], mean[1] + L * q1[1]]} color="var(--c-w)" width={3.5} tex="\text{PC1}" labelAt={1.1} />
      </Plane>
    </FigureLayout>
  );
}

export const svdViz = {
  'la.svd-steps': { component: SvdSteps, validate: (s: VizSpec) => (s.matrix !== undefined && !isMat2(s.matrix) ? 'matrix must be 2×2' : null), doc: 'Animated SVD: unit circle → Vᵀ → Σ → U → ellipse. params matrix' },
  'la.rank1-sum': {
    component: Rank1Sum,
    validate: (s: VizSpec) => (s.matrix !== undefined && !(Array.isArray(s.matrix) && (s.matrix as unknown[]).length <= 8) ? 'matrix: up to 8 rows' : null),
    doc: 'Outer-product expansion: A, A_k and the k-th rank-1 layer as heat grids, singular values. params matrix, k',
  },
  'la.lowrank-image': { component: LowRankImage, validate: (s: VizSpec) => (s.k !== undefined && !((s.k as number) >= 1 && (s.k as number) <= IMG_N) ? 'k in 1..64' : null), doc: 'Rank-k approximation of a procedural 64×64 image with spectrum and energy. params k' },
  'la.cond-gd': { component: CondGD, doc: 'Gradient descent on an ill-conditioned quadratic; κ and step size sliders. params kappa, etaL' },
  'la.pca-cloud': { component: PcaCloud, doc: 'PCA on a 2-D cloud: PC axes, projections onto a draggable w, explained variance. params theta, ratio, n, seed' },
  'la.pca-pitfalls': { component: PcaPitfalls, validate: (s: VizSpec) => (s.mode && !['scale', 'curve'].includes(s.mode as string) ? "mode: 'scale' | 'curve'" : null), doc: "PCA pitfalls: feature units/standardization and curved data. params mode ('scale' | 'curve')" },
};
