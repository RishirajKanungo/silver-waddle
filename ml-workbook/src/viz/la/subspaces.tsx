// Figures for la04: independence, bases, column and null spaces, the four subspaces, low rank.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Arrow, Handle, InfLine, Seg, Point, TGrid, Readout, FigureLayout, SegControl, Slider, MatGrid, TeX, Space3D, Arrow3, Seg3, PlanePatch, Line3, Point3, type P2, type P3 } from '../kit';
import { cross, dot, norm, scale, add, sub, det, inv, matvec, matmul, type Mat } from '../../math/linalg';
import { toFMat, rrefSteps } from '../../math/frac';
import { Rng } from '../../math/rng';
import { nf, bm, bv, isMat, isVec, rankNum } from './shared25';
import './la25.css';

// ------------------------------------------------------------------ la.span3d

/**
 * la.span3d — u, v fixed; w = a·u + b·v + t·n̂ (n̂ normal to the plane of u, v). t = 0 makes the three dependent.
 * params: u, v (3-vectors), a, b, t
 */
function Span3D({ spec }: { spec: VizSpec }) {
  const u = (spec.u as P3) ?? [2, 0, 1];
  const v = (spec.v as P3) ?? [0, 2, 1];
  const [a, setA] = useState((spec.a as number) ?? 0.5);
  const [b, setB] = useState((spec.b as number) ?? 0.75);
  const [t, setT] = useState((spec.t as number) ?? 1.5);
  const n = cross(u, v);
  const nh = scale(n, 1 / norm(n));
  const inPlane = add(scale(u, a), scale(v, b)) as P3;
  const w = add(inPlane, scale(nh, t)) as P3;
  const D = det([u, v, w].map((_, i) => [u[i], v[i], w[i]]));
  const r = rankNum([u, v, w]);
  const dep = Math.abs(t) < 1e-9;
  const box: P3[] = ([[0, 0, 0], u, add(u, v), v] as P3[]).flatMap((p) => [p, add(p, w) as P3]);
  const edges: [number, number][] = [
    [0, 2],
    [2, 4],
    [4, 6],
    [6, 0],
    [1, 3],
    [3, 5],
    [5, 7],
    [7, 1],
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
  ];
  return (
    <FigureLayout
      side={
        <>
          <div className="small muted">
            <TeX>{'\\mathbf{w} = a\\mathbf{u} + b\\mathbf{v} + t\\,\\hat{\\mathbf{n}}'}</TeX>, where <TeX>{'\\hat{\\mathbf{n}}'}</TeX> is perpendicular to the plane of{' '}
            <TeX>{'\\mathbf{u}, \\mathbf{v}'}</TeX>.
          </div>
          <Slider tex="a" value={a} min={-1} max={1.5} step={0.25} onChange={setA} />
          <Slider tex="b" value={b} min={-1} max={1.5} step={0.25} onChange={setB} />
          <Slider tex="t" value={t} min={-2} max={2} step={0.25} onChange={setT} />
          <Readout
            rows={[
              ['\\mathbf{u}', '$' + bv(u)],
              ['\\mathbf{v}', '$' + bv(v)],
              ['\\mathbf{w}', '$' + bv(w)],
              ['\\rank\\,[\\mathbf{u}\\ \\mathbf{v}\\ \\mathbf{w}]', String(r)],
              ['\\text{box volume} = |\\det|', nf(Math.abs(D))],
            ]}
          />
          {dep ? (
            <div className="la-note">
              <span className="la-bad">Dependent.</span> <TeX>{'\\mathbf{w}'}</TeX> lies in the plane of <TeX>{'\\mathbf{u}, \\mathbf{v}'}</TeX>:
              <div className="la-tex">
                <TeX>{`${nf(a)}\\mathbf{u} + ${nf(b)}\\mathbf{v} - \\mathbf{w} = \\mathbf{0}`}</TeX>
              </div>
              The span is only that plane.
            </div>
          ) : (
            <div className="la-note">
              <span className="la-ok">Independent.</span> <TeX>{'\\mathbf{w}'}</TeX> sticks out of the plane, so the box has volume and the three vectors span all of <TeX>{'\\R^3'}</TeX>.
            </div>
          )}
        </>
      }
    >
      <Space3D range={3} label="three vectors in space">
        <PlanePatch u={scale(u, 0.75) as P3} v={scale(v, 0.75) as P3} s={2} fill="var(--c-w)" opacity={0.12} />
        {!dep && edges.map(([i, j], k) => <Seg3 key={k} a={box[i]} b={box[j]} color="var(--c-k)" width={1} opacity={0.5} />)}
        <Seg3 a={[0, 0, 0]} b={scale(u, a) as P3} color="var(--c-u)" width={2} dashed />
        <Seg3 a={scale(u, a) as P3} b={inPlane} color="var(--c-v)" width={2} dashed />
        {!dep && <Seg3 a={inPlane} b={w} color="var(--c-k)" width={2} dashed />}
        <Arrow3 to={u} color="var(--c-u)" tex="\mathbf{u}" />
        <Arrow3 to={v} color="var(--c-v)" tex="\mathbf{v}" />
        <Arrow3 to={w} color="var(--c-k)" tex="\mathbf{w}" />
      </Space3D>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.coords

/**
 * la.coords — coordinates of x in the basis {b1, b2}: drag the basis and x; the skewed grid is the basis grid.
 * params: b1, b2, x
 */
function Coords({ spec }: { spec: VizSpec }) {
  const [b1, setB1] = useState<P2>((spec.b1 as P2) ?? [2, 1]);
  const [b2, setB2] = useState<P2>((spec.b2 as P2) ?? [-1, 1]);
  const [x, setX] = useState<P2>((spec.x as P2) ?? [1, 2]);
  const B: Mat = [
    [b1[0], b2[0]],
    [b1[1], b2[1]],
  ];
  const d = det(B);
  const ok = Math.abs(d) > 1e-9;
  const c = ok ? (matvec(inv(B)!, x) as P2) : null;
  const R = 5;
  return (
    <FigureLayout
      side={
        <>
          <Readout
            rows={[
              ['B = [\\,\\mathbf{b}_1\\ \\mathbf{b}_2\\,]', '$' + bm(B)],
              ['\\mathbf{x}', '$' + bv(x)],
              ['[\\mathbf{x}]_B = B^{-1}\\mathbf{x}', c ? '$' + bv(c) : 'undefined'],
            ]}
          />
          {c ? (
            <div className="la-tex">
              <TeX>{`\\mathbf{x} = ${nf(c[0])}\\,\\mathbf{b}_1 + ${nf(c[1])}\\,\\mathbf{b}_2`}</TeX>
            </div>
          ) : (
            <div className="la-note la-bad">b₁ and b₂ are parallel: they are not a basis of the plane, and most points have no coordinates at all.</div>
          )}
          <div className="muted small">Drag b₁ (green), b₂ (red) and x. The skewed grid has one line for every integer coordinate in the basis.</div>
        </>
      }
    >
      <Plane x={[-R, R]} y={[-R, R]} width={440}>
        {ok && <TGrid M={B} extent={10} opacity={0.7} />}
        {c && (
          <>
            <Arrow to={scale(b1, c[0]) as P2} color="var(--c-i)" width={2} dashed />
            <Arrow from={scale(b1, c[0]) as P2} to={x} color="var(--c-j)" width={2} dashed />
          </>
        )}
        <Arrow to={b1} color="var(--c-i)" width={3} tex="\mathbf{b}_1" labelAt={0.55} />
        <Arrow to={b2} color="var(--c-j)" width={3} tex="\mathbf{b}_2" labelAt={0.55} />
        <Arrow to={x} color="var(--c-w)" width={3} />
        <Handle at={b1} onChange={setB1} color="var(--c-i)" snap={0.5} label="b1" />
        <Handle at={b2} onChange={setB2} color="var(--c-j)" snap={0.5} label="b2" />
        <Handle at={x} onChange={setX} color="var(--c-w)" snap={0.5} label="x" tex="\mathbf{x}" />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.nullcol3d

function spaces3(A: Mat) {
  const { result: R, pivots } = rrefSteps(toFMat(A));
  const pc = pivots.map((p) => p[1]);
  const free = [0, 1, 2].filter((j) => !pc.includes(j));
  const nullv = free.map((f) => {
    const v = [0, 0, 0];
    v[f] = 1;
    pivots.forEach(([r, c]) => (v[c] = -R[r][f].toNumber()));
    return v;
  });
  return { pc, free, nullv };
}

/**
 * la.nullcol3d — a rank-2 3×3 matrix: the null space in the input space, the column space in the output space.
 * params: matrix (3×3, rank 2), mode ('any' | 'solve')
 */
function NullCol3D({ spec }: { spec: VizSpec }) {
  const A = spec.matrix as Mat;
  const { pc, nullv } = useMemo(() => spaces3(A), [A]);
  const c1 = A.map((r) => r[pc[0]]) as P3,
    c2 = A.map((r) => r[pc[1]]) as P3;
  const nv = nullv[0] as P3;
  const [mode, setMode] = useState<'any' | 'solve'>((spec.mode as 'any' | 'solve') ?? 'any');
  const [x1, setX1] = useState(1);
  const [x2, setX2] = useState(0.5);
  const [x3, setX3] = useState(0.5);
  const [s1, setS1] = useState(1);
  const [s2, setS2] = useState(0.5);
  const [t, setT] = useState(0);
  const xp = [0, 0, 0];
  xp[pc[0]] = s1;
  xp[pc[1]] = s2;
  const x = (mode === 'any' ? [x1, x2, x3] : add(xp, scale(nv, t))) as P3;
  const Ax = matvec(A, x) as P3;
  const R = 3.5;
  return (
    <div className="la-wide">
      <FigureLayout
        below={
          <div className="la-rr">
            <div className="la-btns" style={{ justifyContent: 'center' }}>
              <SegControl
                value={mode}
                onChange={setMode}
                options={[
                  { v: 'any', label: 'any input x' },
                  { v: 'solve', label: 'solve Ax = b' },
                ]}
              />
            </div>
            <div className="la-mm">
              <div style={{ minWidth: 220, flex: '1 1 220px', maxWidth: 300 }}>
                {mode === 'any' ? (
                  <>
                    <Slider tex="x_1" value={x1} min={-1.5} max={1.5} step={0.25} onChange={setX1} />
                    <Slider tex="x_2" value={x2} min={-1.5} max={1.5} step={0.25} onChange={setX2} />
                    <Slider tex="x_3" value={x3} min={-1.5} max={1.5} step={0.25} onChange={setX3} />
                  </>
                ) : (
                  <>
                    <div className="small muted">
                      <TeX>{`\\mathbf{b} = s_1\\mathbf{a}_{${pc[0] + 1}} + s_2\\mathbf{a}_{${pc[1] + 1}}`}</TeX>, and <TeX>{'t'}</TeX> moves along the solutions
                    </div>
                    <Slider tex="s_1" value={s1} min={-1.5} max={1.5} step={0.25} onChange={setS1} />
                    <Slider tex="s_2" value={s2} min={-1.5} max={1.5} step={0.25} onChange={setS2} />
                    <Slider tex="t" value={t} min={-1.5} max={1.5} step={0.25} onChange={setT} />
                  </>
                )}
              </div>
              <Readout
                rows={[
                  ['A', '$' + bm(A)],
                  ['\\mathbf{x}', '$' + bv(x)],
                  ['A\\mathbf{x}', '$' + bv(Ax)],
                ]}
              />
            </div>
            <div className="la-note" style={{ textAlign: 'center' }}>
              {mode === 'any' ? (
                <>Every output Ax is a combination of the columns, so it stays on the green plane: the column space. Inputs on the red line are sent to 0: the null space.</>
              ) : (
                <>
                  Solutions of Ax = b form the green line <TeX>{`\\mathbf{x}_p + t\\,${bv(nv, 0)}`}</TeX>, parallel to the null space. Moving t changes x but not Ax.
                </>
              )}
            </div>
          </div>
        }
      >
        <div className="la-two">
          <div className="la-panel">
            <span className="la-panel-title">input space: x</span>
            <Space3D range={R} width={360} height={320} floor={false} label="input space">
              <Line3 d={nv} color="var(--c-err)" width={2.5} R={R} dashed={mode === 'solve'} />
              {mode === 'solve' && <Line3 p={xp as P3} d={nv} color="var(--c-w)" width={3.5} R={R} />}
              {mode === 'solve' && <Point3 at={xp as P3} color="var(--c-w)" r={3.5} label="x_p" />}
              <Arrow3 to={x} color="var(--c-u)" tex="\mathbf{x}" />
            </Space3D>
          </div>
          <div className="la-panel">
            <span className="la-panel-title">output space: Ax</span>
            <Space3D range={R} width={360} height={320} floor={false} label="output space">
              <PlanePatch u={c1} v={c2} s={1.6} fill="var(--c-w)" opacity={0.16} />
              <Arrow3 to={Ax} color="var(--c-v)" tex={mode === 'solve' ? 'A\\mathbf{x} = \\mathbf{b}' : 'A\\mathbf{x}'} />
            </Space3D>
          </div>
        </div>
      </FigureLayout>
    </div>
  );
}

// ------------------------------------------------------------------ la.fourspaces

/**
 * la.fourspaces — a rank-1 2×2 matrix. Input: row space ⟂ null space; output: column space ⟂ left null space.
 * Drag x; only its row-space part affects Ax.
 * params: matrix (2×2, rank 1), x
 */
function FourSpaces({ spec }: { spec: VizSpec }) {
  const A = (spec.matrix as Mat) ?? [
    [1, 1],
    [2, 2],
  ];
  const [x, setX] = useState<P2>((spec.x as P2) ?? [2, 0]);
  const r = (Math.hypot(...A[0]) > 1e-9 ? A[0] : A[1]) as P2;
  const c = (Math.hypot(A[0][0], A[1][0]) > 1e-9 ? [A[0][0], A[1][0]] : [A[0][1], A[1][1]]) as P2;
  const nDir: P2 = [-r[1], r[0]];
  const lnDir: P2 = [-c[1], c[0]];
  const xr = scale(r, dot(x, r) / dot(r, r)) as P2;
  const xn = sub(x, xr) as P2;
  const Ax = matvec(A, x) as P2;
  const Axr = matvec(A, xr) as P2;
  const Rin = 3;
  const big = Math.max(3, ...Ax.map(Math.abs));
  const Rout = [3, 6, 9, 12, 18].find((v) => v >= big * 1.1) ?? 24;
  return (
    <div className="la-wide">
      <FigureLayout
        below={
          <div className="la-rr">
            <div className="la-mm">
              <Readout
                rows={[
                  ['A', '$' + bm(A)],
                  ['\\mathbf{x} = \\mathbf{x}_r + \\mathbf{x}_n', `$${bv(x)} = ${bv(xr)} + ${bv(xn)}`],
                ]}
              />
              <Readout
                rows={[
                  ['A\\mathbf{x}', '$' + bv(Ax)],
                  ['A\\mathbf{x}_r', '$' + bv(Axr)],
                  ['A\\mathbf{x}_n', '$' + bv(matvec(A, xn))],
                ]}
              />
            </div>
            <div className="la-legend" style={{ justifyContent: 'center' }}>
              <span>
                <i className="la-sw" style={{ background: 'var(--c-u)' }} />
                row space
              </span>
              <span>
                <i className="la-sw" style={{ background: 'var(--c-err)' }} />
                null space
              </span>
              <span>
                <i className="la-sw" style={{ background: 'var(--c-v)' }} />
                column space
              </span>
              <span>
                <i className="la-sw" style={{ background: 'var(--c-k)' }} />
                left null space
              </span>
            </div>
            <div className="muted small" style={{ textAlign: 'center' }}>
              Drag x. Its row-space part x_r decides Ax; its null-space part x_n is sent to 0.
            </div>
          </div>
        }
      >
        <div className="la-two">
          <div className="la-panel">
            <span className="la-panel-title">input space (rows of A live here)</span>
            <Plane x={[-Rin, Rin]} y={[-Rin, Rin]} width={340}>
              <InfLine d={r} color="var(--c-u)" width={2.5} />
              <InfLine d={nDir} color="var(--c-err)" width={2.5} dashed />
              <Seg a={xr} b={x} color="var(--c-err)" width={1.5} dashed />
              <Seg a={xn} b={x} color="var(--c-u)" width={1.5} dashed />
              <Arrow to={xr} color="var(--c-u)" width={2.5} tex="\mathbf{x}_r" labelAt={0.7} />
              <Arrow to={xn} color="var(--c-err)" width={2.5} tex="\mathbf{x}_n" labelAt={0.7} />
              <Arrow to={x} color="var(--fg)" width={2.5} />
              <Handle at={x} onChange={setX} color="var(--fg)" snap={0.25} label="x" tex="\mathbf{x}" />
            </Plane>
          </div>
          <div className="la-panel">
            <span className="la-panel-title">output space (columns of A live here)</span>
            <Plane x={[-Rout, Rout]} y={[-Rout, Rout]} width={340}>
              <InfLine d={c} color="var(--c-v)" width={2.5} />
              <InfLine d={lnDir} color="var(--c-k)" width={2.5} dashed />
              <Arrow to={Ax} color="var(--c-v)" width={3} tex="A\mathbf{x}" labelAt={0.75} />
              <Point at={Ax} r={4} color="var(--c-v)" />
            </Plane>
          </div>
        </div>
      </FigureLayout>
    </div>
  );
}

// ------------------------------------------------------------------ la.lowrank

/**
 * la.lowrank — ΔW = B A built from r outer products (B is m×r, A is r×n), and LoRA parameter counts.
 * params: m (rows, default 6), n (cols, default 6), r (initial rank, default 1), seed
 */
function LowRank({ spec }: { spec: VizSpec }) {
  const m = (spec.m as number) ?? 6,
    n = (spec.n as number) ?? 6;
  const [r, setR] = useState((spec.r as number) ?? 1);
  const [d, setD] = useState(4096);
  const [lr, setLr] = useState(8);
  const seed = (spec.seed as number) ?? 3;
  const { Bf, Af } = useMemo(() => {
    const g = new Rng(seed);
    return {
      Bf: Array.from({ length: m }, () => Array.from({ length: 3 }, () => g.int(-2, 2))),
      Af: Array.from({ length: 3 }, () => Array.from({ length: n }, () => g.int(-2, 2))),
    };
  }, [seed, m, n]);
  const B = Bf.map((row) => row.slice(0, r));
  const Am = Af.slice(0, r);
  const W = matmul(B, Am);
  const rk = rankNum(W);
  const full = d * d,
    lora = 2 * d * lr;
  return (
    <div className="la-wide">
      <FigureLayout
        below={
          <div className="la-rr">
            <div className="la-mm">
              <Slider label="number of outer products r" value={r} min={1} max={3} step={1} onChange={setR} fmt={(v) => String(v)} width={300} />
              <span className="small">
                rank(ΔW) = <b>{rk}</b>; numbers stored: {m}·{n} = {m * n} for ΔW, or {r}·({m}+{n}) = {r * (m + n)} for B and A
              </span>
            </div>
            <div className="la-box">
              <div className="la-mm">
                <b className="small">LoRA on a square d×d weight</b>
                <SegControl value={d} onChange={setD} label="d" options={[768, 4096].map((v) => ({ v, label: String(v) }))} />
                <SegControl value={lr} onChange={setLr} label="r" options={[4, 8, 16, 64].map((v) => ({ v, label: String(v) }))} />
              </div>
              <div className="la-tex" style={{ textAlign: 'center' }}>
                <TeX>{`\\underbrace{d^2}_{\\text{full update}} = ${full.toLocaleString('en-US').replace(/,/g, '{,}')} \\qquad \\underbrace{2dr}_{\\text{LoRA}} = ${lora.toLocaleString('en-US').replace(/,/g, '{,}')} \\qquad \\text{ratio} = ${nf((100 * lora) / full, 2)}\\%`}</TeX>
              </div>
            </div>
          </div>
        }
      >
        <div className="la-mm">
          <div className="la-mm-col">
            <MatGrid m={B} />
            <span className="la-mm-name">
              <TeX>{`B\\ (${m}\\times ${r})`}</TeX>
            </span>
          </div>
          <span className="la-mm-op">·</span>
          <div className="la-mm-col">
            <MatGrid m={Am} />
            <span className="la-mm-name">
              <TeX>{`A\\ (${r}\\times ${n})`}</TeX>
            </span>
          </div>
          <span className="la-mm-op">=</span>
          <div className="la-mm-col">
            <MatGrid m={W} heat="div" heatRange={[-12, 12]} />
            <span className="la-mm-name">
              <TeX>{`\\Delta W = BA\\ (${m}\\times ${n}),\\ \\text{rank } ${rk}`}</TeX>
            </span>
          </div>
        </div>
      </FigureLayout>
    </div>
  );
}

// ------------------------------------------------------------------ registry

export const subspacesViz = {
  'la.span3d': {
    component: Span3D,
    validate: (s: VizSpec) => ((s.u === undefined || isVec(s.u, 3)) && (s.v === undefined || isVec(s.v, 3)) ? null : 'u, v must be 3-vectors'),
    doc: 'u, v and w = a u + b v + t n̂ in 3-D: span, box volume, dependence relation at t = 0. params u, v, a, b, t',
  },
  'la.coords': {
    component: Coords,
    validate: (s: VizSpec) => (['b1', 'b2', 'x'].every((k) => s[k] === undefined || isVec(s[k], 2)) ? null : 'b1, b2, x must be 2-vectors'),
    doc: 'Coordinates of x in a draggable basis b1, b2, with the basis grid. params b1, b2, x',
  },
  'la.nullcol3d': {
    component: NullCol3D,
    validate: (s: VizSpec) => (isMat(s.matrix, 3, 3) && rankNum(s.matrix as Mat) === 2 ? null : 'matrix must be 3×3 with rank 2'),
    doc: "Null space (input) and column space (output) of a rank-2 3×3 matrix. params matrix, mode ('any' | 'solve')",
  },
  'la.fourspaces': {
    component: FourSpaces,
    validate: (s: VizSpec) => (s.matrix === undefined || (isMat(s.matrix, 2, 2) && rankNum(s.matrix as Mat) === 1) ? null : 'matrix must be 2×2 with rank 1'),
    doc: 'Row/null space in the input plane, column/left-null space in the output plane, for a rank-1 2×2 matrix. params matrix, x',
  },
  'la.lowrank': {
    component: LowRank,
    validate: (s: VizSpec) => (s.r === undefined || [1, 2, 3].includes(s.r as number) ? null : 'r must be 1, 2 or 3'),
    doc: 'ΔW = BA as a sum of r outer products; LoRA parameter counts. params m, n, r, seed',
  },
};
