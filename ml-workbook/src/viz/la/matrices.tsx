// Figures for la02: matrices as linear transformations.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Arrow, Handle, Poly, TGrid, InfLine, Readout, FigureLayout, SegControl, Slider, Toggle, MatGrid, TeX, usePlayer, type P2 } from '../kit';
import { eye, lerpMat, matmul, matvec, add, scale, det, inv, T, type Mat } from '../../math/linalg';
import { Rng } from '../../math/rng';
import { nf, pn, bm, bv, brow, col, isMat, isVec, smooth, useTween, F_SHAPE, ap2 } from './shared25';
import './la25.css';

// ------------------------------------------------------------------ la.transform2d

export const T2_PRESETS: Record<string, { label: string; m: Mat }> = {
  identity: {
    label: 'identity',
    m: [
      [1, 0],
      [0, 1],
    ],
  },
  rotation: {
    label: 'rotation 90°',
    m: [
      [0, -1],
      [1, 0],
    ],
  },
  shear: {
    label: 'shear',
    m: [
      [1, 1],
      [0, 1],
    ],
  },
  scaling: {
    label: 'scaling',
    m: [
      [2, 0],
      [0, 0.5],
    ],
  },
  reflection: {
    label: 'reflection',
    m: [
      [1, 0],
      [0, -1],
    ],
  },
  projection: {
    label: 'projection',
    m: [
      [1, 0],
      [0, 0],
    ],
  },
  singular: {
    label: 'singular',
    m: [
      [1, 2],
      [0.5, 1],
    ],
  },
};

/**
 * la.transform2d — drag where î and ĵ land; the grid, the unit square and a test vector follow.
 * params: matrix (2×2), x (test vector, default [1, 2]), showX (default true), presets (true | false | names[]),
 *         showDet (default false), range (default 4)
 */
function Transform2D({ spec }: { spec: VizSpec }) {
  const [A, setA] = useState<Mat>(
    (spec.matrix as Mat) ?? [
      [1, 1],
      [0, 1],
    ],
  );
  const [x, setX] = useState<P2>((spec.x as P2) ?? [1, 2]);
  const tw = useTween();
  const R = (spec.range as number) ?? 4;
  const showX = spec.showX !== false;
  const names = spec.presets === false ? [] : Array.isArray(spec.presets) ? (spec.presets as string[]) : Object.keys(T2_PRESETS);
  const M = lerpMat(eye(2), A, smooth(tw.t));
  const a1: P2 = [M[0][0], M[1][0]];
  const a2: P2 = [M[0][1], M[1][1]];
  const Ax = matvec(M, x) as P2;
  const p1 = scale(a1, x[0]) as P2;
  const setColumn = (j: number) => (p: P2) => {
    tw.set(1);
    setA(A.map((row, i) => row.map((v, k) => (k === j ? p[i] : v))));
  };
  const d = det(M);
  const current = names.find((k) => T2_PRESETS[k].m.every((r, i) => r.every((v, j) => Math.abs(v - A[i][j]) < 1e-9)));
  return (
    <FigureLayout
      side={
        <>
          {names.length > 0 && (
            <div className="la-presets" role="group" aria-label="presets">
              {names.map((k) => (
                <button
                  key={k}
                  className={current === k ? 'on' : ''}
                  onClick={() => {
                    setA(T2_PRESETS[k].m);
                    tw.play();
                  }}
                >
                  {T2_PRESETS[k].label}
                </button>
              ))}
            </div>
          )}
          <div className="la-btns">
            <button onClick={() => tw.play()}>Animate from I</button>
          </div>
          <Readout
            rows={[
              ['A = [\\,A\\hat\\imath \\;\\; A\\hat\\jmath\\,]', '$' + bm(M)],
              ...(showX
                ? ([
                    ['\\mathbf{x}', '$' + bv(x)],
                    ['A\\mathbf{x}', '$' + bv(Ax)],
                  ] as [string, string][])
                : []),
              ...(spec.showDet ? ([['\\det A', nf(d)]] as [string, string][]) : []),
            ]}
          />
          {showX && (
            <div className="la-tex">
              <TeX>{`A\\mathbf{x} = ${pn(x[0])}${bv(a1)} + ${pn(x[1])}${bv(a2)} = ${bv(Ax)}`}</TeX>
            </div>
          )}
          {Math.abs(d) < 1e-9 && <div className="la-note la-warn">The columns are parallel: the whole plane is squashed onto a line (or a point).</div>}
          <div className="muted small">
            Drag the tips of Aî (green) and Aĵ (red)
            {showX ? ', and the point x' : ''}. The faint grid is the input; the blue grid is its image.
          </div>
        </>
      }
    >
      <Plane x={[-R, R]} y={[-R, R]} width={440}>
        <TGrid M={M} extent={Math.ceil(2.5 * R)} />
        <Poly pts={[[0, 0], a1, add(a1, a2) as P2, a2]} fill="var(--accent)" fillOpacity={0.16} stroke="var(--accent)" width={1.5} />
        {showX && (
          <>
            <Arrow to={x} color="var(--c-u)" width={2} dashed opacity={0.45} />
            <Arrow to={p1} color="var(--c-i)" width={2} dashed opacity={0.8} />
            <Arrow from={p1} to={Ax} color="var(--c-j)" width={2} dashed opacity={0.8} />
            <Arrow to={Ax} color="var(--c-w)" width={3} tex="A\mathbf{x}" labelAt={0.8} />
          </>
        )}
        <Arrow to={a1} color="var(--c-i)" width={3} tex="A\hat\imath" labelAt={0.62} />
        <Arrow to={a2} color="var(--c-j)" width={3} tex="A\hat\jmath" labelAt={0.62} />
        {showX && <Handle at={x} onChange={setX} color="var(--c-u)" snap={0.5} label="x" tex="\mathbf{x}" />}
        <Handle at={a1} onChange={setColumn(0)} color="var(--c-i)" snap={0.5} label="A i-hat" />
        <Handle at={a2} onChange={setColumn(1)} color="var(--c-j)" snap={0.5} label="A j-hat" />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.matmul

type MMView = 'entry' | 'column' | 'row' | 'outer';
const MM_LABEL: Record<MMView, string> = {
  entry: 'entries',
  column: 'columns',
  row: 'rows',
  outer: 'outer products',
};

/**
 * la.matmul — step through C = AB one entry / column / row / outer product at a time.
 * params: A (m×n), B (n×p), view ('entry' | 'column' | 'row' | 'outer'), views (subset to offer),
 *         names ([nameA, nameB, nameC], default A, B, C)
 */
function MatMul({ spec }: { spec: VizSpec }) {
  const views = (spec.views as MMView[]) ?? ['entry', 'column', 'row', 'outer'];
  const [view, setView] = useState<MMView>((spec.view as MMView) ?? views[0]);
  return <MatMulInner key={view} spec={spec} view={view} views={views} setView={setView} />;
}

function MatMulInner({ spec, view, views, setView }: { spec: VizSpec; view: MMView; views: MMView[]; setView: (v: MMView) => void }) {
  const A = spec.A as Mat,
    B = spec.B as Mat;
  const [nA, nB, nC] = (spec.names as string[]) ?? ['A', 'B', 'C'];
  const m = A.length,
    n = A[0].length,
    p = B[0].length;
  const C = matmul(A, B);
  const frames = view === 'entry' ? m * p : view === 'column' ? p : view === 'row' ? m : n;
  const { i: k, controls } = usePlayer(frames, { interval: 1300 });
  const NaNs = (): Mat => C.map((r) => r.map(() => NaN));
  let shown = NaNs();
  let hl: {
    a: { rows?: number[]; cols?: number[] };
    b: { rows?: number[]; cols?: number[] };
    c: { rows?: number[]; cols?: number[]; cells?: [number, number][] };
  } = { a: {}, b: {}, c: {} };
  let tex = '';
  let extra: Mat | null = null;
  const vecIsCol = p === 1;
  if (view === 'entry') {
    const i = Math.floor(k / p),
      j = k % p;
    shown = C.map((r, a) => r.map((v, b) => (a * p + b <= k ? v : NaN)));
    hl = { a: { rows: [i] }, b: { cols: [j] }, c: { cells: [[i, j]] } };
    const terms = A[i].map((x, t) => `${pn(x)}\\cdot ${pn(B[t][j])}`).join(' + ');
    const lhs = /^[A-Z]$/.test(nC) ? `${nC.toLowerCase()}_{${i + 1}${j + 1}}` : p === 1 ? `(${nC})_{${i + 1}}` : `(${nC})_{${i + 1}${j + 1}}`;
    const rhsName = p === 1 ? nB : `(\\text{column } ${j + 1} \\text{ of } ${nB})`;
    tex = `${lhs} = (\\text{row } ${i + 1} \\text{ of } ${nA}) \\cdot ${rhsName} = ${terms} = ${nf(C[i][j])}`;
  } else if (view === 'column') {
    const j = k;
    shown = C.map((r) => r.map((v, b) => (b <= j ? v : NaN)));
    hl = { a: {}, b: { cols: [j] }, c: { cols: [j] } };
    const terms = B.map((row, t) => `${pn(row[j])}${bv(col(A, t))}`).join(' + ');
    tex = `${nA}${p === 1 ? nB : `\\,(\\text{column } ${j + 1} \\text{ of } ${nB})`} = ${terms} = ${bv(col(C, j))}`;
  } else if (view === 'row') {
    const i = k;
    shown = C.map((r, a) => r.map((v) => (a <= i ? v : NaN)));
    hl = { a: { rows: [i] }, b: {}, c: { rows: [i] } };
    const terms = A[i].map((x, t) => `${pn(x)}${brow(B[t])}`).join(' + ');
    tex = `(\\text{row } ${i + 1} \\text{ of } ${nA})\\,${nB} = ${terms} = ${brow(C[i])}`;
  } else {
    const t = k;
    extra = col(A, t).map((x) => B[t].map((y) => x * y));
    shown = C.map((r, a) => r.map((_, b) => A[a].slice(0, t + 1).reduce((s, x, q) => s + x * B[q][b], 0)));
    hl = { a: { cols: [t] }, b: { rows: [t] }, c: {} };
    tex = `\\mathbf{a}_{${t + 1}}\\mathbf{b}_{${t + 1}}^{\\top} = ${bv(col(A, t))}${brow(B[t])} = ${bm(extra)}`;
  }
  const label = (nm: string, M: Mat) => `${nm} \\; (${M.length}\\times${M[0].length})`;
  return (
    <div className="la-wide">
      <FigureLayout
        below={
          <>
            {views.length > 1 && <SegControl value={view} onChange={setView} options={views.map((v) => ({ v, label: MM_LABEL[v] }))} label="view" />}
            {controls}
          </>
        }
      >
        <div className="la-rr">
          <div className="la-mm">
            <div className="la-mm-col">
              <MatGrid m={A} rows={hl.a.rows} cols={hl.a.cols} />
              <span className="la-mm-name">
                <TeX>{label(nA, A)}</TeX>
              </span>
            </div>
            <span className="la-mm-op">·</span>
            <div className="la-mm-col">
              <MatGrid m={B} rows={hl.b.rows} cols={hl.b.cols} />
              <span className="la-mm-name">
                <TeX>{label(nB, B)}</TeX>
              </span>
            </div>
            <span className="la-mm-op">=</span>
            <div className="la-mm-col">
              <MatGrid m={shown} rows={hl.c.rows} cols={hl.c.cols} cells={hl.c.cells} />
              <span className="la-mm-name">
                <TeX>{label(nC, C) + (view === 'outer' ? `\\text{, sum of ${k + 1} of ${n} terms}` : '')}</TeX>
              </span>
            </div>
          </div>
          <div className="la-box la-tex" style={{ textAlign: 'center' }}>
            <TeX display>{tex}</TeX>
          </div>
          <div className="muted small" style={{ textAlign: 'center' }}>
            {view === 'entry' &&
              (vecIsCol ? 'Row view: each output entry is the dot product of one row with x.' : 'Each entry is a dot product: a row of the left factor with a column of the right factor.')}
            {view === 'column' &&
              (vecIsCol
                ? 'Column view: the output is a combination of the columns, weighted by the entries of x.'
                : 'Each column of the product is the left matrix times one column of the right matrix.')}
            {view === 'row' && 'Each row of the product is a combination of the rows of the right factor.'}
            {view === 'outer' && 'The product is the sum of (column t of the left factor) times (row t of the right factor), each a rank-one matrix.'}
          </div>
        </div>
      </FigureLayout>
    </div>
  );
}

// ------------------------------------------------------------------ la.compose

const LIB: Record<string, { label: string; m: Mat }> = {
  rot90: {
    label: 'rotate 90°',
    m: [
      [0, -1],
      [1, 0],
    ],
  },
  shear: {
    label: 'shear',
    m: [
      [1, 1],
      [0, 1],
    ],
  },
  stretch: {
    label: 'stretch x by 2',
    m: [
      [2, 0],
      [0, 1],
    ],
  },
  reflect: {
    label: 'reflect in x-axis',
    m: [
      [1, 0],
      [0, -1],
    ],
  },
  project: {
    label: 'project onto x-axis',
    m: [
      [1, 0],
      [0, 0],
    ],
  },
};

/**
 * la.compose — apply B, then A, to the grid. Compare the product AB with BA.
 * params: a, b (names from rot90 | shear | stretch | reflect | project)
 */
function Compose({ spec }: { spec: VizSpec }) {
  const [an, setAn] = useState((spec.a as string) ?? 'rot90');
  const [bn, setBn] = useState((spec.b as string) ?? 'shear');
  const [order, setOrder] = useState<'AB' | 'BA'>('AB');
  const [s, setS] = useState(2);
  const A = LIB[an].m,
    B = LIB[bn].m;
  const first = order === 'AB' ? B : A;
  const second = order === 'AB' ? A : B;
  const fName = order === 'AB' ? 'B' : 'A';
  const sName = order === 'AB' ? 'A' : 'B';
  const M = s <= 1 ? lerpMat(eye(2), first, smooth(s)) : matmul(lerpMat(eye(2), second, smooth(s - 1)), first);
  const AB = matmul(A, B),
    BA = matmul(B, A);
  const same = AB.every((r, i) => r.every((v, j) => Math.abs(v - BA[i][j]) < 1e-9));
  const a1: P2 = [M[0][0], M[1][0]],
    a2: P2 = [M[0][1], M[1][1]];
  const pick = (v: string, set: (x: string) => void, nm: string) => (
    <label className="la-rr-ops">
      <TeX>{nm + ' ='}</TeX>
      <select value={v} onChange={(e) => set(e.target.value)} aria-label={'matrix ' + nm}>
        {Object.entries(LIB).map(([k, o]) => (
          <option key={k} value={k}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <FigureLayout
      side={
        <>
          {pick(an, setAn, 'A')}
          {pick(bn, setBn, 'B')}
          <SegControl
            value={order}
            onChange={(v) => {
              setOrder(v);
              setS(0);
            }}
            options={[
              { v: 'AB', label: 'AB: B first' },
              { v: 'BA', label: 'BA: A first' },
            ]}
          />
          <Slider label="stage" value={s} min={0} max={2} step={0.05} onChange={setS} fmt={(v) => (v <= 1 ? `${fName} ${Math.round(v * 100)}%` : `${sName} ${Math.round((v - 1) * 100)}%`)} />
          <div className="la-btns">
            <button
              onClick={() => {
                setS(0);
                let k = 0;
                const id = window.setInterval(() => {
                  k++;
                  setS(Math.min(2, k / 25));
                  if (k >= 50) window.clearInterval(id);
                }, 30);
              }}
            >
              Play both stages
            </button>
          </div>
          <Readout
            rows={[
              ['A', '$' + bm(A)],
              ['B', '$' + bm(B)],
              ['AB', '$' + bm(AB)],
              ['BA', '$' + bm(BA)],
            ]}
          />
          <div className="la-note">{same ? <span className="la-ok">These two commute: AB = BA.</span> : <span className="la-bad">AB ≠ BA: the order of the steps matters.</span>}</div>
        </>
      }
    >
      <Plane x={[-3.5, 3.5]} y={[-3.5, 3.5]} width={420}>
        <TGrid M={M} extent={8} />
        <Poly pts={[[0, 0], a1, add(a1, a2) as P2, a2]} fill="var(--accent)" fillOpacity={0.16} stroke="var(--accent)" width={1.5} />
        <Poly pts={F_SHAPE.map((q) => ap2(M, q))} fill="var(--c-v)" fillOpacity={0.35} stroke="var(--c-v)" width={1.5} />
        <Arrow to={a1} color="var(--c-i)" width={3} />
        <Arrow to={a2} color="var(--c-j)" width={3} />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.special

type Family = 'rotation' | 'reflection' | 'shear' | 'scaling' | 'projection' | 'permutation';
const FAM_LABEL: Record<Family, string> = {
  rotation: 'rotation',
  reflection: 'reflection',
  shear: 'shear',
  scaling: 'scaling',
  projection: 'projection',
  permutation: 'permutation',
};

/**
 * la.special — families of special 2×2 matrices acting on the letter F, with the inverse as "undo".
 * params: family (default 'rotation'), families (subset to offer)
 */
function Special({ spec }: { spec: VizSpec }) {
  const fams = (spec.families as Family[]) ?? (Object.keys(FAM_LABEL) as Family[]);
  const [fam, setFam] = useState<Family>((spec.family as Family) ?? fams[0]);
  const [deg, setDeg] = useState(30);
  const [k, setK] = useState(1);
  const [s1, setS1] = useState(2);
  const [s2, setS2] = useState(0.5);
  const [undo, setUndo] = useState(false);
  const th = (deg * Math.PI) / 180;
  const c = Math.cos(th),
    s = Math.sin(th);
  let A: Mat;
  let formula: string;
  let lineDir: P2 | null = null;
  if (fam === 'rotation') {
    A = [
      [c, -s],
      [s, c],
    ];
    formula = 'R_\\theta = \\begin{bmatrix} \\cos\\theta & -\\sin\\theta \\\\ \\sin\\theta & \\cos\\theta \\end{bmatrix}';
  } else if (fam === 'reflection') {
    A = [
      [Math.cos(2 * th), Math.sin(2 * th)],
      [Math.sin(2 * th), -Math.cos(2 * th)],
    ];
    formula = 'H_\\varphi = \\begin{bmatrix} \\cos 2\\varphi & \\sin 2\\varphi \\\\ \\sin 2\\varphi & -\\cos 2\\varphi \\end{bmatrix}';
    lineDir = [c, s];
  } else if (fam === 'shear') {
    A = [
      [1, k],
      [0, 1],
    ];
    formula = 'S_k = \\begin{bmatrix} 1 & k \\\\ 0 & 1 \\end{bmatrix}';
  } else if (fam === 'scaling') {
    A = [
      [s1, 0],
      [0, s2],
    ];
    formula = 'D = \\begin{bmatrix} s_1 & 0 \\\\ 0 & s_2 \\end{bmatrix}';
  } else if (fam === 'projection') {
    A = [
      [c * c, c * s],
      [c * s, s * s],
    ];
    formula = 'P = \\mathbf{u}\\mathbf{u}^{\\top} = \\begin{bmatrix} \\cos^2\\varphi & \\cos\\varphi\\sin\\varphi \\\\ \\cos\\varphi\\sin\\varphi & \\sin^2\\varphi \\end{bmatrix}';
    lineDir = [c, s];
  } else {
    A = [
      [0, 1],
      [1, 0],
    ];
    formula = 'P = \\begin{bmatrix} 0 & 1 \\\\ 1 & 0 \\end{bmatrix}';
  }
  const d = det(A);
  const Ai = Math.abs(d) > 1e-9 ? inv(A) : null;
  const sym = Math.abs(A[0][1] - A[1][0]) < 1e-9;
  const AtA = matmul(T(A), A);
  const orth = AtA.every((r, i) => r.every((v, j) => Math.abs(v - (i === j ? 1 : 0)) < 1e-9));
  const shown = undo && Ai ? matmul(Ai, A) : A;
  const a1: P2 = [A[0][0], A[1][0]],
    a2: P2 = [A[0][1], A[1][1]];
  const yes = (b: boolean) => (b ? 'yes' : 'no');
  return (
    <FigureLayout
      side={
        <>
          {fams.length > 1 && (
            <select
              value={fam}
              onChange={(e) => {
                setFam(e.target.value as Family);
                setUndo(false);
              }}
              aria-label="family"
            >
              {fams.map((f) => (
                <option key={f} value={f}>
                  {FAM_LABEL[f]}
                </option>
              ))}
            </select>
          )}
          {fam === 'rotation' && <Slider tex="\theta" value={deg} min={-180} max={180} step={15} onChange={setDeg} fmt={(v) => v + '°'} />}
          {(fam === 'reflection' || fam === 'projection') && <Slider tex="\varphi" value={deg} min={0} max={180} step={15} onChange={setDeg} fmt={(v) => v + '°'} />}
          {fam === 'shear' && <Slider tex="k" value={k} min={-2} max={2} step={0.25} onChange={setK} />}
          {fam === 'scaling' && (
            <>
              <Slider tex="s_1" value={s1} min={-2} max={2} step={0.25} onChange={setS1} />
              <Slider tex="s_2" value={s2} min={-2} max={2} step={0.25} onChange={setS2} />
            </>
          )}
          <div className="la-tex">
            <TeX>{formula}</TeX>
          </div>
          <Readout
            rows={[
              ['A', '$' + bm(A)],
              ['A^{-1}', Ai ? '$' + bm(Ai) : 'does not exist'],
              ['\\det A', nf(d)],
              ['A^{\\top}A = I \\text{ (orthogonal)}', yes(orth)],
              ['A = A^{\\top} \\text{ (symmetric)}', yes(sym)],
            ]}
          />
          <Toggle
            label={
              <>
                then apply <TeX>{'A^{-1}'}</TeX> (undo)
              </>
            }
            value={undo}
            onChange={setUndo}
          />
          {undo && !Ai && <div className="la-note la-bad">No inverse: many points land on the same image point, so the map cannot be undone.</div>}
          {undo && Ai && <div className="la-note la-ok">A⁻¹A = I: the F is back where it started.</div>}
        </>
      }
    >
      <Plane x={[-3, 3]} y={[-3, 3]} width={420}>
        {lineDir && <InfLine d={lineDir} color="var(--muted)" dashed width={1.5} />}
        <TGrid M={shown} extent={8} opacity={0.6} />
        <Poly pts={F_SHAPE} fill="none" fillOpacity={0} stroke="var(--muted)" width={1.5} dashed />
        <Poly pts={F_SHAPE.map((q) => ap2(shown, q))} fill={undo && Ai ? 'var(--c-w)' : 'var(--c-v)'} fillOpacity={0.4} stroke={undo && Ai ? 'var(--c-w)' : 'var(--c-v)'} width={1.5} />
        {!undo && (
          <>
            <Arrow to={a1} color="var(--c-i)" width={3} tex="A\hat\imath" labelAt={0.7} />
            <Arrow to={a2} color="var(--c-j)" width={3} tex="A\hat\jmath" labelAt={0.7} />
          </>
        )}
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.linearlayer

/**
 * la.linearlayer — Y = X Wᵀ + b for a batch: shapes, one output entry, bias broadcasting.
 * params: batch (default 3), din (default 3), dout (default 2), seed
 */
function LinearLayer({ spec }: { spec: VizSpec }) {
  const [nb, setNb] = useState((spec.batch as number) ?? 3);
  const [din, setDin] = useState((spec.din as number) ?? 3);
  const [dout, setDout] = useState((spec.dout as number) ?? 2);
  const [sel, setSel] = useState<[number, number]>([0, 0]);
  const seed = (spec.seed as number) ?? 7;
  const { X, W, b } = useMemo(() => {
    const r = new Rng(seed);
    const big = (rows: number, cols: number, lo: number, hi: number) => Array.from({ length: rows }, () => Array.from({ length: cols }, () => r.int(lo, hi)));
    return { X: big(4, 4, -2, 3), W: big(3, 4, -2, 2), b: big(1, 3, -1, 2)[0] };
  }, [seed]);
  const Xs = X.slice(0, nb).map((r) => r.slice(0, din));
  const Ws = W.slice(0, dout).map((r) => r.slice(0, din));
  const Wt = T(Ws);
  const bs = b.slice(0, dout);
  const Y = matmul(Xs, Wt).map((r) => r.map((v, j) => v + bs[j]));
  const i = Math.min(sel[0], nb - 1),
    j = Math.min(sel[1], dout - 1);
  const terms = Xs[i].map((x, t) => `${pn(x)}\\cdot${pn(Wt[t][j])}`).join(' + ');
  const sh = (r: number | string, c: number | string) => `(${r}\\times ${c})`;
  return (
    <div className="la-wide">
      <FigureLayout
        below={
          <>
            <Slider tex="B" value={nb} min={1} max={4} step={1} onChange={setNb} fmt={(v) => String(v)} width={210} />
            <Slider tex="d_{in}" value={din} min={1} max={4} step={1} onChange={setDin} fmt={(v) => String(v)} width={210} />
            <Slider tex="d_{out}" value={dout} min={1} max={3} step={1} onChange={setDout} fmt={(v) => String(v)} width={210} />
          </>
        }
      >
        <div className="la-rr">
          <div className="la-mm">
            <div className="la-mm-col">
              <MatGrid m={Xs} rows={[i]} />
              <span className="la-mm-name">
                <TeX>{`X\\;${sh(nb, din)}`}</TeX>
              </span>
            </div>
            <span className="la-mm-op">·</span>
            <div className="la-mm-col">
              <MatGrid m={Wt} cols={[j]} />
              <span className="la-mm-name">
                <TeX>{`W^{\\top}\\;${sh(din, dout)}`}</TeX>
              </span>
            </div>
            <span className="la-mm-op">+</span>
            <div className="la-mm-col">
              <MatGrid m={[bs]} cols={[j]} />
              <span className="la-mm-name">
                <TeX>{`\\mathbf{b}\\;(${dout})`}</TeX>
              </span>
            </div>
            <span className="la-mm-op">=</span>
            <div className="la-mm-col">
              <MatGrid m={Y} cells={[[i, j]]} onCell={(a, c) => setSel([a, c])} />
              <span className="la-mm-name">
                <TeX>{`Y\\;${sh(nb, dout)}`}</TeX>
              </span>
            </div>
          </div>
          <div className="la-tex" style={{ textAlign: 'center' }}>
            <TeX>{`\\underbrace{X}_{${sh('B', 'd_{in}')}}\\;\\underbrace{W^{\\top}}_{${sh('d_{in}', 'd_{out}')}} + \\underbrace{\\mathbf{b}}_{(d_{out})} = \\underbrace{Y}_{${sh('B', 'd_{out}')}}`}</TeX>
          </div>
          <div className="la-box la-tex" style={{ textAlign: 'center' }}>
            <TeX
              display
            >{`y_{${i + 1}${j + 1}} = \\underbrace{${terms}}_{\\text{row ${i + 1} of } X \\,\\cdot\\, \\text{column ${j + 1} of } W^{\\top}} + \\underbrace{${pn(bs[j])}}_{b_{${j + 1}}} = ${nf(Y[i][j])}`}</TeX>
          </div>
          <div className="muted small" style={{ textAlign: 'center' }}>
            Click any entry of Y. The same bias row is added to every one of the {nb} rows (broadcasting). Parameters: {dout}·{din} weights + {dout} biases = {dout * din + dout}.
          </div>
        </div>
      </FigureLayout>
    </div>
  );
}

// ------------------------------------------------------------------ registry

const okNames = (xs: unknown, lib: Record<string, unknown>) => xs === undefined || (Array.isArray(xs) && xs.every((x) => typeof x === 'string' && x in lib));

export const matricesViz = {
  'la.transform2d': {
    component: Transform2D,
    validate: (s: VizSpec) =>
      !isMat(s.matrix, 2, 2)
        ? 'matrix (2×2) required'
        : s.x !== undefined && !isVec(s.x, 2)
          ? 'x must be a 2-vector'
          : s.presets !== undefined && typeof s.presets !== 'boolean' && !okNames(s.presets, T2_PRESETS)
            ? 'unknown preset'
            : null,
    doc: 'Drag Aî, Aĵ; grid, unit square and Ax = x1 a1 + x2 a2 follow; animate from I; presets. params matrix, x, showX, presets, showDet, range',
  },
  'la.matmul': {
    component: MatMul,
    validate: (s: VizSpec) => {
      if (!isMat(s.A) || !isMat(s.B)) return 'A and B required';
      if ((s.A as Mat)[0].length !== (s.B as Mat).length) return 'inner dimensions must match';
      if (s.views !== undefined && !(Array.isArray(s.views) && s.views.every((v) => v in MM_LABEL))) return 'bad views';
      return null;
    },
    doc: 'Step through C = AB by entries, columns, rows or outer products. params A, B, view, views, names',
  },
  'la.compose': {
    component: Compose,
    validate: (s: VizSpec) => (okNames(s.a === undefined ? undefined : [s.a], LIB) && okNames(s.b === undefined ? undefined : [s.b], LIB) ? null : 'unknown matrix name'),
    doc: 'Apply B then A to the grid and an F; compare AB with BA. params a, b (rot90 | shear | stretch | reflect | project)',
  },
  'la.special': {
    component: Special,
    validate: (s: VizSpec) => (okNames(s.family === undefined ? undefined : [s.family], FAM_LABEL) && okNames(s.families, FAM_LABEL) ? null : 'unknown family'),
    doc: 'Rotation, reflection, shear, scaling, projection, permutation acting on an F, with inverse as undo. params family, families',
  },
  'la.linearlayer': {
    component: LinearLayer,
    doc: 'Y = X Wᵀ + b with adjustable batch/d_in/d_out; click an output entry. params batch, din, dout, seed',
  },
};
