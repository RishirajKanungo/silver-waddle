// la07 figures: eigenvector hunting, characteristic polynomial, iterating A (dynamics / complex
// eigenvalues), power iteration, PageRank on a tiny graph, quadratic forms, the spectral theorem.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Arrow, Handle, InfLine, Seg, Label, Path, Point, Curve, Contours, Slider, Readout, FigureLayout, SegControl, Toggle, usePlayer, MatrixEdit, LinePlot, Bars, TeX, Space3D, Seg3 } from '../kit';
import type { P3 } from '../kit';
import { dot, norm, type Mat } from '../../math/linalg';
import { f2, vt, mt, rad, deg, rot2, mv2, mm2, det2, circle, eigvals2, eigvec2, eigTeX, eigSym2, type P2 } from './util';
import './la2.css';

const isMat2 = (m: unknown) => Array.isArray(m) && m.length === 2 && m.every((r) => Array.isArray(r) && r.length === 2 && r.every((x) => typeof x === 'number'));
const validateMatrix = (s: VizSpec) => (s.matrix !== undefined && !isMat2(s.matrix) ? 'matrix must be 2×2 numbers' : null);

function Presets({ presets, A, setA }: { presets: Record<string, Mat>; A: Mat; setA: (m: Mat) => void }) {
  const cur = Object.keys(presets).find((k) => presets[k].every((r, i) => r.every((x, j) => Math.abs(x - A[i][j]) < 1e-9))) ?? '';
  return <SegControl value={cur} onChange={(k) => k && setA(presets[k].map((r) => [...r]))} options={Object.keys(presets).map((k) => ({ v: k, label: k }))} />;
}

// ------------------------------------------------------------------ la.eigen-drag
const EIG_PRESETS: Record<string, Mat> = {
  symmetric: [[2, 1], [1, 2]],
  triangular: [[3, 1], [0, 2]],
  flip: [[1, 2], [2, -2]],
  shear: [[1, 1], [0, 1]],
  rotation: [[0, -1], [1, 0]],
};
/**
 * Drag a unit vector v around the circle and watch Av. When Av lies on the line of v, v is an eigenvector:
 * the line lights up and λ is shown. Editable A, presets, optional eigen-lines and image of the circle.
 * params: matrix, showEig (bool), showImage (bool), angle (deg, initial v)
 */
function EigenDrag({ spec }: { spec: VizSpec }) {
  const [A, setA] = useState<Mat>((spec.matrix as Mat) ?? EIG_PRESETS.triangular);
  const [th, setTh] = useState(rad((spec.angle as number) ?? 60));
  const [showEig, setShowEig] = useState(!!spec.showEig);
  const [showImg, setShowImg] = useState(spec.showImage !== false);
  const e = eigvals2(A);
  const dirs: { l: number; v: P2 }[] = e.real ? (Math.abs(e.re[0] - e.re[1]) < 1e-9 ? [{ l: e.re[0], v: eigvec2(A, e.re[0]) }] : e.re.map((l) => ({ l, v: eigvec2(A, l) }))) : [];
  // a scalar multiple of I: every direction is an eigen-direction
  const scalarI = Math.abs(A[0][1]) < 1e-12 && Math.abs(A[1][0]) < 1e-12 && Math.abs(A[0][0] - A[1][1]) < 1e-12;
  const v: P2 = [Math.cos(th), Math.sin(th)];
  const Av = mv2(A, v);
  const nAv = norm(Av);
  const crossVA = v[0] * Av[1] - v[1] * Av[0];
  const aligned = nAv < 1e-6 || Math.abs(crossVA) < 0.012 * Math.max(1, nAv);
  const lam = dot(v, Av);
  const onDrag = (p: P2) => {
    let t = Math.atan2(p[1], p[0]);
    // magnetic snap to an eigen-direction within 3°
    for (const d of dirs)
      for (const s of [1, -1]) {
        const td = Math.atan2(s * d.v[1], s * d.v[0]);
        let diff = t - td;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        if (Math.abs(diff) < rad(3)) t = td;
      }
    setTh(t);
  };
  const ang = nAv < 1e-9 ? 0 : deg(Math.acos(Math.max(-1, Math.min(1, lam / nAv))));
  const R = 4;
  const img = useMemo(() => circle(1, 120).map((p) => mv2(A, p)), [A]);
  return (
    <FigureLayout
      side={
        <>
          <MatrixEdit value={A} onChange={setA} step={0.5} label="A" />
          <Presets presets={EIG_PRESETS} A={A} setA={setA} />
          <Readout
            rows={[
              ['\\mathbf{v}', '$' + vt(v)],
              ['A\\mathbf{v}', '$' + vt(Av)],
              ['\\angle(\\mathbf{v}, A\\mathbf{v})', nAv < 1e-9 ? '–' : f2(ang, 1) + '°'],
              ...(aligned ? ([['\\lambda = \\mathbf{v}\\cdot A\\mathbf{v}', f2(lam)]] as [string, string][]) : []),
              ...(showEig ? ([['\\text{eigenvalues}', '$' + eigTeX(e)]] as [string, string][]) : []),
            ]}
          />
          <div className={'small ' + (aligned ? 'la2-ok' : '')}>
            {aligned
              ? nAv < 1e-6
                ? 'Av = 0: v is an eigenvector with eigenvalue 0.'
                : lam > 0
                  ? 'Av lies on the line of v, pointing the same way: v is an eigenvector with λ > 0.'
                  : 'Av lies on the line of v but points the other way: an eigenvector with λ < 0.'
              : 'Av leaves the line of v. Keep dragging.'}
          </div>
          <Toggle label="show eigen-directions" value={showEig} onChange={setShowEig} />
          <Toggle label="show the image of the circle" value={showImg} onChange={setShowImg} />
          {showEig && !e.real && <div className="small">Complex eigenvalues: no real direction stays on its own line.</div>}
          {showEig && scalarI && <div className="small">A is a multiple of I: every direction is an eigen-direction.</div>}
        </>
      }
    >
      <Plane x={[-R, R]} y={[-R, R]} width={440}>
        {showImg && <Path pts={img} color="var(--c-w)" width={1.5} opacity={0.5} closed dashed />}
        <Path pts={circle(1)} color="var(--muted)" width={1.5} closed />
        {showEig && dirs.map((d, k) => <InfLine key={k} d={d.v} color="var(--c-k)" width={2} dashed opacity={0.7} />)}
        <InfLine d={v} color={aligned ? 'var(--ok)' : 'var(--c-u)'} width={aligned ? 4 : 1.2} opacity={aligned ? 0.45 : 0.3} />
        <Arrow to={Av} color="var(--c-v)" width={3} tex="A\mathbf{v}" labelAt={0.95} />
        <Arrow to={v} color="var(--c-u)" width={3} />
        <Handle at={v} onChange={onDrag} color="var(--c-u)" tex="\mathbf{v}" label="v" />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.charpoly
const CP_PRESETS: Record<string, Mat> = {
  'two real': [[4, 1], [2, 3]],
  repeated: [[2, 1], [0, 2]],
  complex: [[1, -2], [1, 3]],
  rotation: [[0, -1], [1, 0]],
};
/**
 * The characteristic polynomial p(λ) = λ² − (tr A)λ + det A of an editable 2×2. Real roots are marked;
 * when the parabola misses the axis, the eigenvalues are a complex-conjugate pair (shown in the complex plane).
 * params: matrix
 */
function CharPoly({ spec }: { spec: VizSpec }) {
  const [A, setA] = useState<Mat>((spec.matrix as Mat) ?? CP_PRESETS['two real']);
  const e = eigvals2(A);
  const p = (l: number) => l * l - e.tr * l + e.det;
  const roots = e.real ? e.re : [];
  return (
    <FigureLayout
      side={
        <>
          <MatrixEdit value={A} onChange={setA} step={0.5} label="A" />
          <Presets presets={CP_PRESETS} A={A} setA={setA} />
          <Readout
            rows={[
              ['\\tr A = a + d', f2(e.tr)],
              ['\\det A = ad - bc', f2(e.det)],
              ['\\Delta = (\\tr A)^2 - 4\\det A', f2(e.disc)],
              ['\\lambda_{1,2}', '$' + eigTeX(e)],
              ['\\lambda_1 + \\lambda_2', f2(e.real ? e.re[0] + e.re[1] : 2 * e.re[0])],
              ['\\lambda_1 \\lambda_2', f2(e.real ? e.re[0] * e.re[1] : e.re[0] ** 2 + e.im ** 2)],
            ]}
          />
          <div className="small">{e.disc > 1e-9 ? 'Δ > 0: two distinct real eigenvalues.' : e.disc >= -1e-9 ? 'Δ = 0: one repeated eigenvalue (the parabola touches the axis).' : 'Δ < 0: the parabola misses the axis; the eigenvalues are complex conjugates.'}</div>
        </>
      }
      below={
        <div className="la2-row">
          <div className="la2-col">
            <div className="muted small">eigenvalues in the complex plane</div>
            <Plane x={[-4, 6]} y={[-3, 3]} width={300} xLabel="Re" yLabel="Im" gridStep={1}>
              {(e.real ? [[e.re[0], 0], [e.re[1], 0]] : [[e.re[0], e.im], [e.re[0], -e.im]]).map((q, k) => (
                <Point key={k} at={q as P2} color="var(--c-k)" r={5} />
              ))}
              {!e.real && <Path pts={circle(Math.hypot(e.re[0], e.im), 90)} color="var(--muted)" width={1} dashed />}
            </Plane>
          </div>
        </div>
      }
    >
      <Plane x={[-4, 6]} y={[-6, 8]} width={420} height={360} xLabel="λ" yLabel="p(λ)">
        <Curve f={p} color="var(--c-u)" />
        <Seg a={[e.tr / 2, 0]} b={[e.tr / 2, p(e.tr / 2)]} color="var(--muted)" dashed />
        <Point at={[e.tr / 2, p(e.tr / 2)]} r={3} color="var(--muted)" />
        <Label at={[e.tr / 2, p(e.tr / 2)]} tex="\tfrac{1}{2}\tr A" color="var(--muted)" dy={-16} />
        {roots.map((r, k) => (
          <Point key={k} at={[r, 0]} r={5.5} color="var(--c-k)" />
        ))}
        {roots.map((r, k) => (
          <Label key={'l' + k} at={[r, 0]} tex={`\\lambda_${k + 1}`} color="var(--c-k)" dx={k === 0 ? 12 : -12} dy={20} />
        ))}
        <Point at={[0, e.det]} r={3.5} color="var(--c-v)" />
        <Label at={[0, e.det]} tex="\det A" color="var(--c-v)" anchor="start" dx={8} dy={-2} />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.eigen-orbit
const ORBIT_PRESETS: Record<string, Mat> = {
  'spiral in': [[0.9, -0.4], [0.4, 0.9]],
  'spiral out': [[1, -0.5], [0.5, 1]],
  'quarter turn': [[0, -1], [1, 0]],
  'saddle': [[1.25, 0], [0, 0.6]],
  'Markov': [[0.9, 0.2], [0.1, 0.8]],
};
/**
 * Iterate x_{k+1} = A x_k from a draggable x₀. Real eigenvalues: the orbit is pulled toward the dominant eigen-line.
 * Complex eigenvalues re ± i·im: each step turns by arg λ and scales by |λ|, so the orbit spirals.
 * params: matrix, x0, steps
 */
function EigenOrbit({ spec }: { spec: VizSpec }) {
  const [A, setA] = useState<Mat>((spec.matrix as Mat) ?? ORBIT_PRESETS['spiral in']);
  const [x0, setX0] = useState<P2>((spec.x0 as P2) ?? [3, 0.5]);
  const [n, setN] = useState((spec.steps as number) ?? 16);
  const e = eigvals2(A);
  const orbit = useMemo(() => {
    const out: P2[] = [x0];
    for (let k = 0; k < n; k++) out.push(mv2(A, out[k]));
    return out;
  }, [A, x0, n]);
  const mod = e.real ? Math.max(Math.abs(e.re[0]), Math.abs(e.re[1])) : Math.hypot(e.re[0], e.im);
  const R = 5;
  return (
    <FigureLayout
      side={
        <>
          <MatrixEdit value={A} onChange={setA} step={0.05} label="A" />
          <Presets presets={ORBIT_PRESETS} A={A} setA={setA} />
          <Slider label="steps" value={n} min={1} max={40} step={1} onChange={setN} fmt={(v) => String(v)} />
          <Readout
            rows={[
              ['\\lambda_{1,2}', '$' + eigTeX(e)],
              ['\\max|\\lambda|', f2(mod, 3)],
              ...(!e.real ? ([['\\arg\\lambda', f2(deg(Math.atan2(e.im, e.re[0])), 1) + '°']] as [string, string][]) : []),
              [`\\mathbf{x}_{${n}}`, '$' + vt(orbit[n])],
            ]}
          />
          <div className="small">
            {!e.real
              ? mod > 1.0005
                ? '|λ| > 1: the orbit spirals outward.'
                : mod < 0.9995
                  ? '|λ| < 1: the orbit spirals into the origin.'
                  : '|λ| = 1: the orbit circles (or cycles) forever.'
              : 'Real eigenvalues: components along each eigenvector scale by λ each step; the larger |λ| wins.'}
          </div>
        </>
      }
    >
      <Plane x={[-R, R]} y={[-R, R]} width={440}>
        {e.real && Math.abs(e.re[0] - e.re[1]) > 1e-9 && e.re.map((l, k) => <InfLine key={k} d={eigvec2(A, l)} color="var(--c-k)" width={2} dashed opacity={0.6} />)}
        <Path pts={orbit} color="var(--c-u)" width={1.4} opacity={0.6} />
        {orbit.slice(1).map((p, k) => (
          <Point key={k} at={p} r={3} color="var(--c-u)" />
        ))}
        <Handle at={x0} onChange={setX0} color="var(--c-v)" snap={0.25} tex="\mathbf{x}_0" label="x0" />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.power-iter
/**
 * Power iteration on a symmetric A with eigenvalues λ₁ = 2 and λ₂ = 2r and fixed eigenvectors.
 * Play through k = 0..24; the angle error shrinks like |λ₂/λ₁|^k (dashed reference on a log scale).
 * params: ratio (λ₂/λ₁, default 0.6), angle (deg, x₀ direction)
 */
function PowerIter({ spec }: { spec: VizSpec }) {
  const [r, setR] = useState((spec.ratio as number) ?? 0.6);
  const [a0, setA0] = useState(rad((spec.angle as number) ?? 150));
  const N = 25;
  const { i, controls } = usePlayer(N, { interval: 500 });
  const tq = rad(30);
  const q1: P2 = [Math.cos(tq), Math.sin(tq)], q2: P2 = [-Math.sin(tq), Math.cos(tq)];
  const l1 = 2, l2 = 2 * r;
  const Q: Mat = [[q1[0], q2[0]], [q1[1], q2[1]]];
  const A = mm2(mm2(Q, [[l1, 0], [0, l2]]), [[Q[0][0], Q[1][0]], [Q[0][1], Q[1][1]]]);
  const x0: P2 = [Math.cos(a0), Math.sin(a0)];
  const c1 = dot(q1, x0), c2 = dot(q2, x0);
  const iter = useMemo(() => {
    const xs: P2[] = [x0];
    for (let k = 1; k < N; k++) {
      const y = mv2(A, xs[k - 1]);
      const n = norm(y) || 1;
      xs.push([y[0] / n, y[1] / n]);
    }
    return xs;
  }, [A, x0]); // eslint-disable-line react-hooks/exhaustive-deps
  const err = (x: P2) => Math.abs(dot(q2, x)) / Math.max(1e-300, Math.abs(dot(q1, x))); // tan of the angle to the q1-line
  const errs = iter.map((x, k) => [k, Math.max(1e-9, err(x))] as [number, number]);
  const ref = Array.from({ length: N }, (_, k) => [k, Math.max(1e-9, (Math.abs(c2) / Math.max(1e-300, Math.abs(c1))) * Math.abs(r) ** k)] as [number, number]);
  const xk = iter[i];
  const rq = dot(xk, mv2(A, xk));
  const stuck = Math.abs(c1) < 1e-6;
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="\lambda_2/\lambda_1" value={r} min={-0.95} max={0.95} step={0.05} onChange={setR} />
          <Readout
            rows={[
              ['A', '$' + mt(A)],
              ['\\lambda_1,\\ \\lambda_2', `${f2(l1)}, ${f2(l2)}`],
              ['k', String(i)],
              ['\\mathbf{x}_k', '$' + vt(xk, 3)],
              ['\\text{angle to } \\mathbf{q}_1', f2(deg(Math.atan(err(xk))), 2) + '°'],
              ['\\mathbf{x}_k^{\\top}A\\mathbf{x}_k', f2(rq, 4)],
            ]}
          />
          <div className="small">{stuck ? 'x₀ has no component along q₁, so the iteration can never find it. Drag x₀ off the line.' : <>Each step multiplies the <TeX>{'\\mathbf{q}_2'}</TeX> share by <TeX>{'|\\lambda_2/\\lambda_1|'}</TeX>. Drag <TeX>{'\\mathbf{x}_0'}</TeX> on the circle.</>}</div>
        </>
      }
      below={
        <>
          {controls}
          <LinePlot
            series={[
              { pts: errs.slice(0, i + 1), color: 'var(--c-u)' },
              { pts: ref, color: 'var(--muted)', dashed: true },
              { pts: errs.slice(0, i + 1), color: 'var(--c-u)', scatter: true },
            ]}
            x={[0, N - 1]}
            y={[1e-8, 10]}
            logY
            height={240}
            xlabel="iteration k"
            ylabel="error"
          />
          <div className="muted small">Solid: tan of the angle between x_k and the q₁ line. Dashed: the prediction |c₂/c₁|·|λ₂/λ₁|ᵏ.</div>
        </>
      }
    >
      <Plane x={[-1.6, 1.6]} y={[-1.6, 1.6]} width={380} gridStep={0.5}>
        <Path pts={circle(1)} color="var(--muted)" width={1.2} closed />
        <InfLine d={q1} color="var(--c-k)" width={2} dashed opacity={0.7} />
        <InfLine d={q2} color="var(--c-k)" width={1} dashed opacity={0.35} />
        <Label at={[1.35 * q1[0], 1.35 * q1[1]]} tex="\mathbf{q}_1" color="var(--c-k)" />
        {iter.slice(0, i).map((x, k) => (
          <Arrow key={k} to={x} color="var(--c-u)" width={1.2} opacity={0.15 + (0.5 * k) / N} head={false} />
        ))}
        <Arrow to={xk} color="var(--c-u)" width={3} tex={i > 0 ? '\\mathbf{x}_k' : undefined} labelAt={0.75} />
        <Handle at={x0} onChange={(p) => setA0(Math.atan2(p[1], p[0]))} color="var(--c-v)" tex="\mathbf{x}_0" label="x0" />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.pagerank
const PR_NODES: P2[] = [[0.6, 2.6], [3.4, 2.8], [2.0, 0.6], [4.4, 0.4]];
const PR_NAMES = ['A', 'B', 'C', 'D'];
const PR_EDGES: [number, number][] = [[0, 1], [0, 2], [1, 2], [2, 0], [3, 2]];
/** |λ₂| of the link matrix M of this graph (eigenvalues 1, −1/2 ± i/2, 0), computed once with NumPy */
const PR_L2M = Math.SQRT1_2;
/**
 * PageRank on four pages. x_{k+1} = G x_k with G = dM + (1 − d)/n · 11ᵀ. Play through the iterations;
 * node size shows probability, bars compare x_k with the stationary π.
 * params: damping (default 0.85)
 */
function PageRank({ spec }: { spec: VizSpec }) {
  const [d, setD] = useState((spec.damping as number) ?? 0.85);
  const n = 4;
  const N = 31;
  const { i, controls } = usePlayer(N, { interval: 600 });
  const M: Mat = Array.from({ length: n }, () => Array(n).fill(0));
  const out = Array(n).fill(0);
  for (const [a] of PR_EDGES) out[a]++;
  for (const [a, b] of PR_EDGES) M[b][a] = 1 / out[a];
  const G = M.map((r) => r.map((x) => d * x + (1 - d) / n));
  const xs = useMemo(() => {
    const res: number[][] = [Array(n).fill(1 / n)];
    for (let k = 1; k < N; k++) res.push(G.map((r) => dot(r, res[k - 1])));
    return res;
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const pi = useMemo(() => {
    let x = Array(n).fill(1 / n);
    for (let k = 0; k < 3000; k++) x = G.map((r) => dot(r, x));
    return x;
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const x = xs[i];
  const l1 = x.reduce((s, v, j) => s + Math.abs(v - pi[j]), 0);
  const rad_ = (p: number) => 0.18 + 0.9 * Math.sqrt(p);
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="d" value={d} min={0.5} max={1} step={0.01} onChange={setD} />
          <Readout
            rows={[
              ['k', String(i)],
              ['\\mathbf{x}_k', '$' + vt(x, 3)],
              ['\\boldsymbol{\\pi}', '$' + vt(pi, 3)],
              ['\\lVert\\mathbf{x}_k - \\boldsymbol{\\pi}\\rVert_1', f2(l1, 4)],
              ['|\\lambda_2(G)| = d/\\sqrt{2}', f2(d * PR_L2M, 3)],
            ]}
          />
          <div className="small">Arrows are links. Each step, a surfer follows a random outgoing link with probability <TeX>d</TeX> and jumps to a random page otherwise.</div>
        </>
      }
      below={
        <>
          {controls}
          <Bars data={PR_NAMES.flatMap((nm, j) => [{ label: nm + ' x_k', value: x[j], color: 'var(--c-u)' }, { label: nm + ' π', value: pi[j], color: 'var(--muted)' }])} height={170} max={0.6} fmt={(v) => v.toFixed(3)} />
        </>
      }
    >
      <Plane x={[-0.4, 5.4]} y={[-0.6, 3.8]} width={420} grid={false} axes={false}>
        {PR_EDGES.map(([a, b], k) => {
          const pa = PR_NODES[a], pb = PR_NODES[b];
          const dx = pb[0] - pa[0], dy = pb[1] - pa[1], L = Math.hypot(dx, dy);
          const ux = dx / L, uy = dy / L;
          // offset the two directions of A↔C so they do not overlap
          const both = PR_EDGES.some(([c, e]) => c === b && e === a);
          const off = both ? 0.12 : 0;
          const s: P2 = [pa[0] + ux * rad_(x[a]) - uy * off, pa[1] + uy * rad_(x[a]) + ux * off];
          const t: P2 = [pb[0] - ux * (rad_(x[b]) + 0.05) - uy * off, pb[1] - uy * (rad_(x[b]) + 0.05) + ux * off];
          return <Arrow key={k} from={s} to={t} color="var(--muted)" width={1.8} />;
        })}
        {PR_NODES.map((p, j) => (
          <g key={j}>
            <PrNode at={p} r={rad_(x[j])} />
            <Label at={p} text={PR_NAMES[j]} color="var(--fg)" />
            <Label at={[p[0], p[1] - rad_(x[j]) - 0.18]} text={x[j].toFixed(3)} color="var(--muted)" />
          </g>
        ))}
      </Plane>
    </FigureLayout>
  );
}
function PrNode({ at, r }: { at: P2; r: number }) {
  return <Path pts={circle(r, 48, at)} color="var(--c-u)" width={2} fill="color-mix(in oklab, var(--c-u) 22%, var(--surface))" closed />;
}

// ------------------------------------------------------------------ la.quadform
/**
 * Quadratic form f(x) = xᵀAx for symmetric A = [[a, b], [b, c]]. Level sets with the eigenvectors as axes,
 * classification (PD / PSD / indefinite / ...), and a 3-D surface view (bowl versus saddle).
 * params: a, b, c, view ('levels' | 'surface')
 */
function QuadForm({ spec }: { spec: VizSpec }) {
  const [a, setAa] = useState((spec.a as number) ?? 2);
  const [b, setBb] = useState((spec.b as number) ?? 1);
  const [c, setCc] = useState((spec.c as number) ?? 2);
  const [view, setView] = useState<'levels' | 'surface'>((spec.view as 'levels') ?? 'levels');
  const [x, setX] = useState<P2>([1.2, -0.6]);
  const A: Mat = [[a, b], [b, c]];
  const { values: lv, q1, q2 } = eigSym2(A);
  const f = useMemo(() => (u: number, v: number) => a * u * u + 2 * b * u * v + c * v * v, [a, b, c]);
  const tol = 1e-9;
  const cls =
    lv[1] > tol ? 'positive definite' : lv[1] >= -tol && lv[0] > tol ? 'positive semidefinite' : lv[0] < -tol && lv[1] < -tol ? 'negative definite' : lv[0] <= tol && lv[0] >= -tol && lv[1] < -tol ? 'negative semidefinite' : lv[0] > tol && lv[1] < -tol ? 'indefinite' : 'zero';
  const levels = [0.25, 0.75, 1.5, 2.5, 4, 6];
  const R = 2.2;
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={view} onChange={setView} options={[{ v: 'levels', label: 'level sets' }, { v: 'surface', label: 'surface' }]} />
          <Slider tex="a" value={a} min={-3} max={3} step={0.25} onChange={setAa} />
          <Slider tex="b" value={b} min={-3} max={3} step={0.25} onChange={setBb} />
          <Slider tex="c" value={c} min={-3} max={3} step={0.25} onChange={setCc} />
          <Readout
            rows={[
              ['A', '$' + mt(A)],
              ['\\lambda_1,\\ \\lambda_2', `${f2(lv[0])}, ${f2(lv[1])}`],
              ['\\det A = ac - b^2', f2(a * c - b * b)],
              ...(view === 'levels' ? ([['\\mathbf{x}^{\\top}A\\mathbf{x}', f2(f(x[0], x[1]))]] as [string, string][]) : []),
            ]}
          />
          <div className={'small la2-cls'}>
            <b>{cls}</b>
          </div>
          <div className="small">
            {cls === 'positive definite'
              ? 'Both eigenvalues positive: a bowl. Level sets are ellipses with axes along the eigenvectors, longer along the smaller eigenvalue.'
              : cls === 'indefinite'
                ? 'Eigenvalues of both signs: a saddle. The form is positive along one eigenvector and negative along the other; the dashed lines are where it is zero.'
                : cls === 'positive semidefinite'
                  ? 'One eigenvalue is 0: a valley. The form is zero along that eigenvector, so the level sets are pairs of parallel lines.'
                  : cls === 'zero'
                    ? 'A = 0.'
                    : 'Negative eigenvalues: an upside-down bowl or valley.'}
          </div>
        </>
      }
    >
      {view === 'levels' ? (
        <Plane x={[-R, R]} y={[-R, R]} width={420} gridStep={0.5}>
          <Contours f={f} levels={levels} color="var(--c-pos)" width={1.6} n={80} />
          <Contours f={f} levels={levels.map((l) => -l)} color="var(--c-neg)" width={1.6} n={80} />
          {cls === 'indefinite' && (() => {
            // zero set: λ1 y1² + λ2 y2² = 0 → y2/y1 = ±sqrt(−λ1/λ2)
            const k = Math.sqrt(-lv[0] / lv[1]);
            return [1, -1].map((s) => <InfLine key={s} d={[q1[0] + s * k * q2[0], q1[1] + s * k * q2[1]]} color="var(--muted)" dashed width={1.5} />);
          })()}
          <Arrow to={q1} color="var(--c-k)" width={3} tex={`\\mathbf{q}_1\\ (${f2(lv[0])})`} labelAt={1.1} />
          <Arrow to={q2} color="var(--c-k)" width={3} tex={`\\mathbf{q}_2\\ (${f2(lv[1])})`} labelAt={1.1} />
          <Handle at={x} onChange={setX} color="var(--c-u)" snap={0.1} tex="\mathbf{x}" label="x" />
        </Plane>
      ) : (
        <Surface f={f} R={1.6} />
      )}
    </FigureLayout>
  );
}
function Surface({ f, R }: { f: (x: number, y: number) => number; R: number }) {
  const n = 14, m = 20;
  const segs = useMemo(() => {
    let mx = 1e-9;
    for (let i = 0; i <= m; i++) for (let j = 0; j <= m; j++) mx = Math.max(mx, Math.abs(f(-R + (2 * R * i) / m, -R + (2 * R * j) / m)));
    const k = 1.8 / mx; // rescale height to fit
    const pt = (u: number, v: number): P3 => [u * 1.4, v * 1.4, f(u, v) * k];
    const out: { a: P3; b: P3; z: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const t = -R + (2 * R * i) / n;
      for (let j = 0; j < m; j++) {
        const s0 = -R + (2 * R * j) / m, s1 = -R + (2 * R * (j + 1)) / m;
        out.push({ a: pt(t, s0), b: pt(t, s1), z: f(t, (s0 + s1) / 2) });
        out.push({ a: pt(s0, t), b: pt(s1, t), z: f((s0 + s1) / 2, t) });
      }
    }
    return out;
  }, [f, R]);
  return (
    <Space3D range={3} width={440} height={380} pitch0={0.35} floor={false}>
      {segs.map((s, i) => (
        <Seg3 key={i} a={s.a} b={s.b} color={s.z >= 0 ? 'var(--c-pos)' : 'var(--c-neg)'} width={1.1} opacity={0.85} />
      ))}
    </Space3D>
  );
}

// ------------------------------------------------------------------ la.spectral-ellipse
/**
 * Spectral theorem picture: A = Q diag(λ₁, λ₂) Qᵀ with Q a rotation by θ. The unit circle maps to an ellipse
 * whose axes are λ₁q₁ and λ₂q₂, perpendicular. Drag x on the circle.
 * params: theta (deg), l1, l2
 */
function SpectralEllipse({ spec }: { spec: VizSpec }) {
  const [th, setTh] = useState((spec.theta as number) ?? 30);
  const [l1, setL1] = useState((spec.l1 as number) ?? 2.5);
  const [l2, setL2] = useState((spec.l2 as number) ?? 1);
  const [t, setT] = useState(rad(80));
  const Q = rot2(rad(th));
  const A = mm2(mm2(Q, [[l1, 0], [0, l2]]), [[Q[0][0], Q[1][0]], [Q[0][1], Q[1][1]]]);
  const q1: P2 = [Q[0][0], Q[1][0]], q2: P2 = [Q[0][1], Q[1][1]];
  const x: P2 = [Math.cos(t), Math.sin(t)];
  const Ax = mv2(A, x);
  const img = circle(1, 120).map((p) => mv2(A, p));
  const R = 3.2;
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="\theta" value={th} min={-90} max={90} step={1} onChange={setTh} fmt={(v) => v + '°'} />
          <Slider tex="\lambda_1" value={l1} min={-3} max={3} step={0.25} onChange={setL1} />
          <Slider tex="\lambda_2" value={l2} min={-3} max={3} step={0.25} onChange={setL2} />
          <Readout
            rows={[
              ['A = Q\\Lambda Q^{\\top}', '$' + mt(A)],
              ['A - A^{\\top}', '$' + mt([[0, A[0][1] - A[1][0]], [A[1][0] - A[0][1], 0]])],
              ['\\mathbf{q}_1\\cdot\\mathbf{q}_2', f2(dot(q1, q2))],
              ['\\mathbf{x}', '$' + vt(x)],
              ['A\\mathbf{x}', '$' + vt(Ax)],
            ]}
          />
          <div className="small">Whatever θ, λ₁, λ₂ you choose, A comes out symmetric. A negative λ flips the ellipse across the other axis.</div>
        </>
      }
    >
      <Plane x={[-R, R]} y={[-R, R]} width={420}>
        <Path pts={circle(1)} color="var(--muted)" width={1.5} closed />
        <Path pts={img} color="var(--c-w)" width={2.2} closed fill="color-mix(in oklab, var(--c-w) 10%, transparent)" />
        <InfLine d={q1} color="var(--c-k)" dashed opacity={0.5} />
        <InfLine d={q2} color="var(--c-k)" dashed opacity={0.5} />
        <Arrow to={[l1 * q1[0], l1 * q1[1]]} color="var(--c-k)" width={3} tex="\lambda_1\mathbf{q}_1" labelAt={0.8} />
        <Arrow to={[l2 * q2[0], l2 * q2[1]]} color="var(--c-k)" width={3} tex="\lambda_2\mathbf{q}_2" labelAt={0.8} />
        <Seg a={x} b={Ax} color="var(--muted)" dashed />
        <Arrow to={Ax} color="var(--c-v)" width={2.5} tex="A\mathbf{x}" labelAt={1.1} />
        <Arrow to={x} color="var(--c-u)" width={2.5} />
        <Handle at={x} onChange={(p) => setT(Math.atan2(p[1], p[0]))} color="var(--c-u)" tex="\mathbf{x}" label="x" />
      </Plane>
    </FigureLayout>
  );
}

export const eigenViz = {
  'la.eigen-drag': { component: EigenDrag, validate: validateMatrix, doc: 'Drag unit v around the circle, see Av; eigen-directions light up when aligned. params matrix, showEig, showImage, angle' },
  'la.charpoly': { component: CharPoly, validate: validateMatrix, doc: 'Characteristic polynomial of an editable 2×2, real or complex roots, trace/det. params matrix' },
  'la.eigen-orbit': { component: EigenOrbit, validate: validateMatrix, doc: 'Orbit x_{k+1} = A x_k from a draggable x0; spirals for complex eigenvalues. params matrix, x0, steps' },
  'la.power-iter': { component: PowerIter, validate: (s: VizSpec) => (s.ratio !== undefined && Math.abs(s.ratio as number) >= 1 ? '|ratio| < 1' : null), doc: 'Power iteration with log-scale error vs |λ2/λ1|^k. params ratio, angle' },
  'la.pagerank': { component: PageRank, validate: (s: VizSpec) => (s.damping !== undefined && ((s.damping as number) < 0.5 || (s.damping as number) > 1) ? 'damping in [0.5, 1]' : null), doc: 'PageRank on a 4-page graph, iterations vs stationary distribution. params damping' },
  'la.quadform': { component: QuadForm, doc: "Quadratic form xᵀAx: level sets with eigen-axes, PD/PSD/indefinite, bowl vs saddle surface. params a, b, c, view ('levels' | 'surface')" },
  'la.spectral-ellipse': { component: SpectralEllipse, doc: 'A = QΛQᵀ maps the unit circle to an ellipse with perpendicular axes λ_i q_i. params theta, l1, l2' },
};
