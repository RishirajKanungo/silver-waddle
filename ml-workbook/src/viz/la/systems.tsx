// Figures for la03: linear systems, elimination, inverses and LU.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Arrow, Handle, InfLine, Point, Label, Readout, FigureLayout, SegControl, Slider, MatGrid, TeX, usePlayer, LinePlot, Space3D, Poly3, Point3, Line3, type P2, type P3 } from '../kit';
import { cross, norm, scale, add, solve, type Mat, type Vec } from '../../math/linalg';
import { Frac, toFMat, rrefSteps, applyRowOp, rowOpTeX, fdet, type FMat, type RowOp } from '../../math/frac';
import { nf, bv, isMat, isVec, eqTeX, gcdN, parseFrac, rankNum } from './shared25';
import './la25.css';

// ------------------------------------------------------------------ la.lines2d

/** integer coefficients [a, b, c] of the line a x + b y = c through P and Q (points on a 0.5 grid) */
function lineThrough(P: P2, Q: P2): [number, number, number] | null {
  let a = Q[1] - P[1],
    b = -(Q[0] - P[0]);
  if (Math.abs(a) < 1e-12 && Math.abs(b) < 1e-12) return null;
  let c = a * P[0] + b * P[1];
  [a, b, c] = [a, b, c].map((v) => Math.round(v * 4));
  const g = gcdN(gcdN(a, b), c) || 1;
  [a, b, c] = [a / g, b / g, c / g];
  if (a < 0 || (a === 0 && b < 0)) [a, b, c] = [-a, -b, -c];
  return [a, b, c];
}

/**
 * la.lines2d — a 2×2 system: drag two points on each line (row picture); the column picture updates alongside.
 * params: lines: [[P1, Q1], [P2, Q2]] (points on a 0.5 grid), range (default 5)
 */
function Lines2D({ spec }: { spec: VizSpec }) {
  const init = (spec.lines as [P2, P2][]) ?? [
    [
      [0, 3],
      [3, 0],
    ],
    [
      [1, 0],
      [3, 2],
    ],
  ];
  const [pts, setPts] = useState<P2[]>([init[0][0], init[0][1], init[1][0], init[1][1]]);
  const R = (spec.range as number) ?? 5;
  const e1 = lineThrough(pts[0], pts[1])!;
  const e2 = lineThrough(pts[2], pts[3])!;
  const set = (k: number) => (p: P2) => {
    const next = pts.map((q, i) => (i === k ? p : q));
    const partner = k ^ 1;
    if (Math.abs(next[k][0] - next[partner][0]) < 1e-9 && Math.abs(next[k][1] - next[partner][1]) < 1e-9) return;
    setPts(next);
  };
  const [a1, b1, c1] = e1,
    [a2, b2, c2] = e2;
  const D = a1 * b2 - a2 * b1;
  let status: 'unique' | 'none' | 'inf';
  let sol: P2 | null = null;
  if (Math.abs(D) > 1e-9) {
    status = 'unique';
    sol = [(c1 * b2 - c2 * b1) / D, (a1 * c2 - a2 * c1) / D];
  } else if (Math.abs(a1 * c2 - a2 * c1) < 1e-9 && Math.abs(b1 * c2 - b2 * c1) < 1e-9) status = 'inf';
  else status = 'none';
  const colA: P2 = [a1, a2],
    colB: P2 = [b1, b2],
    rhs: P2 = [c1, c2];
  const ext = Math.max(4, ...[colA, colB, rhs, ...(sol ? [scale(colA, sol[0]) as P2] : [])].flatMap((v) => v.map(Math.abs)));
  const Rc = [4, 6, 8, 12, 16, 24, 32, 48].find((r) => r >= ext * 1.15) ?? 64;
  const sysTeX = `\\begin{aligned} ${eqTeX([a1, b1], c1).replace('=', '&=')} \\\\ ${eqTeX([a2, b2], c2).replace('=', '&=')} \\end{aligned}`;
  const colTeX = `x${bv(colA)} + y${bv(colB)} = ${bv(rhs)}`;
  return (
    <div className="la-wide">
      <FigureLayout
        below={
          <div className="la-rr">
            <div className="la-mm">
              <div className="la-tex">
                <TeX>{sysTeX}</TeX>
              </div>
              <div className="la-tex">
                <TeX>{colTeX}</TeX>
              </div>
              <Readout
                rows={[
                  ['\\det = a_1b_2 - a_2b_1', nf(D)],
                  ['\\text{solution}', status === 'unique' ? `(${nf(sol![0])}, ${nf(sol![1])})` : status === 'inf' ? 'infinitely many' : 'none'],
                ]}
              />
            </div>
            <div className="la-note" style={{ textAlign: 'center' }}>
              {status === 'unique' && (
                <>
                  The lines cross at one point, and the columns point in different directions, so exactly one combination reaches <b>b</b>.
                </>
              )}
              {status === 'none' && <span className="la-bad">Parallel lines never meet. In the column picture both columns lie on one line, and b is off it: no combination reaches b.</span>}
              {status === 'inf' && (
                <span className="la-warn">The two equations describe the same line: every point on it solves the system. In the column picture b lies on the line of the columns.</span>
              )}
            </div>
            <div className="muted small" style={{ textAlign: 'center' }}>
              Drag the four dots to move the lines. Both pictures always describe the same system.
            </div>
          </div>
        }
      >
        <div className="la-two">
          <div className="la-panel">
            <span className="la-panel-title">row picture: one line per equation</span>
            <Plane x={[-R, R]} y={[-R, R]} width={340}>
              <InfLine p={pts[0]} d={[pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]]} color="var(--c-u)" width={2.5} />
              <InfLine p={pts[2]} d={[pts[3][0] - pts[2][0], pts[3][1] - pts[2][1]]} color="var(--c-v)" width={2.5} dashed={status === 'inf'} />
              {sol && Math.abs(sol[0]) < R && Math.abs(sol[1]) < R && <Point at={sol} r={5.5} color="var(--c-w)" />}
              {sol && <Label at={sol} tex={`(${nf(sol[0])}, ${nf(sol[1])})`} color="var(--c-w)" anchor="start" dx={10} dy={14} />}
              {pts.map((p, k) => (
                <Handle key={k} at={p} onChange={set(k)} color={k < 2 ? 'var(--c-u)' : 'var(--c-v)'} snap={0.5} label={`line ${k < 2 ? 1 : 2} point ${(k % 2) + 1}`} r={5} />
              ))}
            </Plane>
          </div>
          <div className="la-panel">
            <span className="la-panel-title">column picture: combine the columns to reach b</span>
            <Plane x={[-Rc, Rc]} y={[-Rc, Rc]} width={340}>
              {status !== 'unique' && <InfLine d={Math.hypot(...colA) > 1e-9 ? colA : colB} color="var(--muted)" width={6} opacity={0.25} />}
              {sol && (
                <>
                  <Arrow to={scale(colA, sol[0]) as P2} color="var(--c-i)" width={2} dashed />
                  <Arrow from={scale(colA, sol[0]) as P2} to={rhs} color="var(--c-j)" width={2} dashed />
                </>
              )}
              <Arrow to={colA} color="var(--c-i)" width={3} tex="\mathbf{a}_1" />
              <Arrow to={colB} color="var(--c-j)" width={3} tex="\mathbf{a}_2" />
              <Arrow to={rhs} color="var(--c-w)" width={3} tex="\mathbf{b}" labelAt={0.8} />
            </Plane>
          </div>
        </div>
      </FigureLayout>
    </div>
  );
}

// ------------------------------------------------------------------ la.planes3d

const PLANE_PRESETS: Record<string, { label: string; M: number[][] }> = {
  unique: {
    label: 'one point',
    M: [
      [1, 1, 1, 3],
      [1, -1, 0, 0],
      [0, 1, -1, 0],
    ],
  },
  line: {
    label: 'a line',
    M: [
      [1, 0, 1, 1],
      [0, 1, 1, 1],
      [1, 1, 2, 2],
    ],
  },
  parallel: {
    label: 'parallel planes',
    M: [
      [1, 1, 1, 1],
      [1, 1, 1, -1],
      [1, -1, 0, 0],
    ],
  },
};
const PCOL = ['var(--c-u)', 'var(--c-v)', 'var(--c-k)'];

function planePatch(n: Vec, d: number, s: number): P3[] {
  const nn = norm(n);
  const p0 = scale(n, d / (nn * nn));
  const nh = scale(n, 1 / nn);
  const e = Math.abs(nh[0]) < 0.6 ? [1, 0, 0] : Math.abs(nh[1]) < 0.6 ? [0, 1, 0] : [0, 0, 1];
  const u = scale(cross(nh, e), 1 / norm(cross(nh, e)));
  const v = cross(nh, u);
  const at = (a: number, b: number) => add(add(p0, scale(u, a)), scale(v, b)) as P3;
  return [at(-s, -s), at(s, -s), at(s, s), at(-s, s)];
}

/** point and direction of the intersection line of two non-parallel planes */
function meet(n1: Vec, d1: number, n2: Vec, d2: number): { p: Vec; d: Vec } | null {
  const dir = cross(n1, n2);
  if (norm(dir) < 1e-9) return null;
  const p = solve([n1, n2, dir], [d1, d2, 0]);
  return p ? { p, d: dir } : null;
}

/**
 * la.planes3d — three equations in three unknowns as three planes. Presets and a slider that shifts plane 3.
 * params: preset ('unique' | 'line' | 'parallel'), shift (initial shift of plane 3)
 */
function Planes3D({ spec }: { spec: VizSpec }) {
  const [preset, setPreset] = useState((spec.preset as string) ?? 'unique');
  const [shift, setShift] = useState((spec.shift as number) ?? 0);
  const M = PLANE_PRESETS[preset].M.map((r, i) => (i === 2 ? [...r.slice(0, 3), r[3] + shift] : r));
  const A = M.map((r) => r.slice(0, 3));
  const b = M.map((r) => r[3]);
  const rA = rankNum(A),
    rAb = rankNum(M);
  let sol: { point?: Vec; line?: { p: Vec; d: Vec } } = {};
  if (rA === 3) sol = { point: solve(A, b) ?? undefined };
  else if (rA === 2 && rAb === 2) {
    const pairs: [number, number][] = [
      [0, 1],
      [0, 2],
      [1, 2],
    ];
    for (const [i, j] of pairs) {
      const m = meet(A[i], b[i], A[j], b[j]);
      if (m) {
        sol = { line: m };
        break;
      }
    }
  }
  const pairLines =
    rAb > rA
      ? (
          [
            [0, 1],
            [0, 2],
            [1, 2],
          ] as [number, number][]
        )
          .map(([i, j]) => meet(A[i], b[i], A[j], b[j]))
          .filter(Boolean)
      : [];
  const S = 2.6;
  const verdict = rA === 3 ? 'exactly one solution' : rAb > rA ? 'no solution' : rA === 2 ? 'infinitely many (a line)' : 'infinitely many (a plane)';
  return (
    <FigureLayout
      side={
        <>
          <div className="la-presets">
            {Object.entries(PLANE_PRESETS).map(([k, o]) => (
              <button
                key={k}
                className={k === preset ? 'on' : ''}
                onClick={() => {
                  setPreset(k);
                  setShift(0);
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
          <Slider label="shift plane 3" value={shift} min={-2} max={2} step={0.5} onChange={setShift} />
          <div className="la-tex">
            <TeX>{`\\begin{aligned} ${M.map((r) => eqTeX(r.slice(0, 3), r[3]).replace('=', '&=')).join(' \\\\ ')} \\end{aligned}`}</TeX>
          </div>
          <Readout
            rows={[
              ['\\rank A', String(rA)],
              ['\\rank\\,[A \\mid \\mathbf{b}]', String(rAb)],
              ['\\text{solutions}', verdict],
              ...(sol.point ? ([['\\mathbf{x}', '$' + bv(sol.point)]] as [string, string][]) : []),
            ]}
          />
          <div className="la-legend">
            <span>
              <i className="la-sw" style={{ background: 'var(--c-u)' }} />
              eq 1
            </span>
            <span>
              <i className="la-sw" style={{ background: 'var(--c-v)' }} />
              eq 2
            </span>
            <span>
              <i className="la-sw" style={{ background: 'var(--c-k)' }} />
              eq 3
            </span>
            <span>
              <i className="la-sw" style={{ background: 'var(--c-w)' }} />
              solutions
            </span>
          </div>
          {pairLines.length > 0 && <div className="la-note">Dashed: where pairs of planes meet. They never all three meet at once.</div>}
        </>
      }
    >
      <Space3D range={3.2} floor={false} label="three planes">
        {M.map((r, i) => (
          <Poly3 key={i} pts={planePatch(r.slice(0, 3), r[3], S)} fill={PCOL[i]} opacity={0.16} stroke={PCOL[i]} />
        ))}
        {pairLines.map((m, i) => (
          <Line3 key={i} p={m!.p as P3} d={m!.d as P3} color="var(--muted)" width={1.5} dashed R={3} />
        ))}
        {sol.line && <Line3 p={sol.line.p as P3} d={sol.line.d as P3} color="var(--c-w)" width={4} R={3.2} />}
        {sol.point && <Point3 at={sol.point as P3} color="var(--c-w)" r={6} label={`(${sol.point.map((v) => nf(v)).join(', ')})`} />}
      </Space3D>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.rowreduce

interface Hist {
  op: RowOp;
  by: 'algorithm' | 'you';
  after: FMat;
}

const fracTeXMat = (m: Frac[][]) => `\\begin{bmatrix} ${m.map((r) => r.map((x) => x.toTeX()).join(' & ')).join(' \\\\ ')} \\end{bmatrix}`;
const fracTeXVec = (v: Frac[]) => `\\begin{bmatrix} ${v.map((x) => x.toTeX()).join(' \\\\ ')} \\end{bmatrix}`;

function matTeXBoxed(m: FMat, augment: number, boxes: [number, number][]): string {
  const cols = m[0].length;
  const spec = augment < cols ? 'r'.repeat(augment) + '|' + 'r'.repeat(cols - augment) : 'r'.repeat(cols);
  const body = m.map((row, i) => row.map((x, j) => (boxes.some(([a, b]) => a === i && b === j) ? `\\boxed{${x.toTeX()}}` : x.toTeX())).join(' & ')).join(' \\\\ ');
  return `\\left[\\begin{array}{${spec}} ${body} \\end{array}\\right]`;
}

/** read the solution set off a matrix in reduced row echelon form */
function readSolution(R: FMat, n: number, augmented: boolean, inverse: boolean): { tone: 'ok' | 'bad' | 'warn'; text: string; tex?: string } {
  const rows = R.length,
    cols = R[0].length;
  const pivots: [number, number][] = [];
  R.forEach((row, i) => {
    const c = row.slice(0, n).findIndex((x) => !x.isZero());
    if (c >= 0) pivots.push([i, c]);
  });
  const pc = pivots.map((p) => p[1]);
  const free = Array.from({ length: n }, (_, j) => j).filter((j) => !pc.includes(j));
  const names = (j: number) => `x_{${j + 1}}`;
  if (inverse) {
    const isI = R.every((row, i) => row.slice(0, n).every((x, j) => x.eq(i === j ? 1 : 0)));
    if (isI)
      return {
        tone: 'ok',
        text: 'The left block is I, so the right block is the inverse:',
        tex: `A^{-1} = ${fracTeXMat(R.map((r) => r.slice(n)))}`,
      };
    return {
      tone: 'bad',
      text: `The left block cannot become I: it has only ${pivots.length} pivots. A is singular and has no inverse.`,
    };
  }
  if (augmented && cols === n + 1) {
    const bad = R.findIndex((row) => row.slice(0, n).every((x) => x.isZero()) && !row[n].isZero());
    if (bad >= 0)
      return {
        tone: 'bad',
        text: `Row ${bad + 1} says 0 = ${R[bad][n].toString()}. The system is inconsistent: no solution.`,
      };
    const p = Array.from({ length: n }, () => new Frac(0));
    pivots.forEach(([r, c]) => (p[c] = R[r][n]));
    if (!free.length)
      return {
        tone: 'ok',
        text: `Every column has a pivot: exactly one solution.`,
        tex: `\\mathbf{x} = ${fracTeXVec(p)}`,
      };
    const vs = free.map((f) => {
      const v = Array.from({ length: n }, (_, j) => new Frac(j === f ? 1 : 0));
      pivots.forEach(([r, c]) => (v[c] = R[r][f].neg()));
      return `${names(f)}${fracTeXVec(v)}`;
    });
    return {
      tone: 'warn',
      text: `Free variable${free.length > 1 ? 's' : ''} ${free.map((f) => 'x' + (f + 1)).join(', ')}: infinitely many solutions.`,
      tex: `\\mathbf{x} = ${fracTeXVec(p)} + ${vs.join(' + ')}`,
    };
  }
  // coefficient matrix only: rank and null space
  if (!free.length)
    return {
      tone: 'ok',
      text: `Rank ${pivots.length}: a pivot in every column, so the null space is {0}.`,
    };
  const vs = free.map((f) => {
    const v = Array.from({ length: n }, (_, j) => new Frac(j === f ? 1 : 0));
    pivots.forEach(([r, c]) => (v[c] = R[r][f].neg()));
    return fracTeXVec(v);
  });
  return {
    tone: 'warn',
    text: `Rank ${pivots.length}, with free column${free.length > 1 ? 's' : ''} ${free.map((f) => f + 1).join(', ')}. Null space basis (one vector per free variable):`,
    tex: vs.join(',\\;'),
  };
}

/**
 * la.rowreduce — interactive row reduction in exact fractions. "Next step" shows the algorithm's move;
 * or build your own swap / scale / add operation.
 * params: matrix (integers), augment (number of coefficient columns; omit for a plain matrix),
 *         mode ('rref' | 'echelon'), inverse (bool: matrix is [A | I]), trackDet (bool), manual (default true)
 */
function RowReduce({ spec }: { spec: VizSpec }) {
  const M0 = useMemo(() => toFMat(spec.matrix as number[][]), [spec.matrix]);
  const rows = M0.length,
    cols = M0[0].length;
  const nCoef = (spec.augment as number) ?? cols;
  const augmented = nCoef < cols;
  const reduced = spec.mode !== 'echelon';
  const inverse = !!spec.inverse;
  const trackDet = !!spec.trackDet && !augmented && rows === cols;
  const manual = spec.manual !== false;
  const [hist, setHist] = useState<Hist[]>([]);
  const [kind, setKind] = useState<'swap' | 'scale' | 'add'>('add');
  const [ri, setRi] = useState(1);
  const [rj, setRj] = useState(0);
  const [kTxt, setKTxt] = useState('-1');
  const [msg, setMsg] = useState('');
  const cur = hist.length ? hist[hist.length - 1].after : M0;
  const plan = useMemo(() => rrefSteps(cur, nCoef, reduced), [cur, nCoef, reduced]);
  const next = plan.steps[0];
  const done = !next;
  const push = (op: RowOp, by: Hist['by']) => {
    setMsg('');
    setHist([...hist, { op, by, after: applyRowOp(cur, op) }]);
  };
  const apply = () => {
    if (kind === 'swap') {
      if (ri === rj) return setMsg('Pick two different rows to swap.');
      return push({ kind: 'swap', i: ri, j: rj }, 'you');
    }
    const k = parseFrac(kTxt);
    if (!k) return setMsg('Type a number such as 2, -3 or 1/2.');
    if (kind === 'scale') {
      if (k.isZero()) return setMsg('Scaling a row by 0 destroys information: it is not an allowed row operation.');
      return push({ kind: 'scale', i: ri, k }, 'you');
    }
    if (ri === rj) return setMsg('Add a multiple of a different row.');
    if (k.isZero()) return setMsg('Adding 0 times a row changes nothing.');
    push({ kind: 'add', i: ri, j: rj, k }, 'you');
  };
  // determinant bookkeeping: det(A0) = mult · det(current)
  let mult = new Frac(1);
  for (const h of hist) {
    if (h.op.kind === 'swap') mult = mult.neg();
    else if (h.op.kind === 'scale') mult = mult.div(h.op.k);
  }
  const effect = (op: RowOp) => (op.kind === 'swap' ? 'det × (−1)' : op.kind === 'scale' ? `det × ${op.k.toString()}` : 'det unchanged');
  const boxes: [number, number][] = done ? plan.pivots : next ? [next.pivot] : [];
  const R = done ? (reduced ? cur : rrefSteps(cur, nCoef, true).result) : null;
  const summary = R ? readSolution(R, nCoef, augmented, inverse) : null;
  const upper = trackDet && cur.every((row, i) => row.every((x, j) => j >= i || x.isZero()));
  const diag = upper ? cur.map((r, i) => r[i]) : [];
  const detU = diag.reduce((s, x) => s.mul(x), new Frac(1));
  const rowOpts = Array.from({ length: rows }, (_, i) => (
    <option key={i} value={i}>
      {'R' + (i + 1)}
    </option>
  ));
  const stage = done ? (reduced ? 'Reduced row echelon form reached.' : 'Echelon form reached.') : `Next pivot: row ${next.pivot[0] + 1}, column ${next.pivot[1] + 1} (boxed).`;
  return (
    <FigureLayout
      side={
        <>
          <div className="la-btns">
            <button className="primary" onClick={() => next && push(next.op, 'algorithm')} disabled={done}>
              Next step
            </button>
            <button onClick={() => setHist(hist.slice(0, -1))} disabled={!hist.length}>
              Undo
            </button>
            <button
              onClick={() => {
                setHist([]);
                setMsg('');
              }}
              disabled={!hist.length}
            >
              Reset
            </button>
          </div>
          {!done && (
            <div className="la-note">
              Algorithm's next move: <TeX>{rowOpTeX(next.op)}</TeX>
            </div>
          )}
          {manual && (
            <div className="la-box">
              <div className="la-rr-ops" style={{ marginBottom: 6 }}>
                <b>Your move</b>
                <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="operation">
                  <option value="add">add a multiple</option>
                  <option value="scale">scale</option>
                  <option value="swap">swap</option>
                </select>
              </div>
              <div className="la-rr-ops">
                <select value={ri} onChange={(e) => setRi(+e.target.value)} aria-label="target row">
                  {rowOpts}
                </select>
                {kind === 'swap' && <span>↔</span>}
                {kind === 'scale' && <span>←</span>}
                {kind === 'add' && <span>{`← R${ri + 1} +`}</span>}
                {kind !== 'swap' && <input value={kTxt} onChange={(e) => setKTxt(e.target.value)} aria-label="multiplier k" />}
                {kind === 'add' && <span>×</span>}
                {kind !== 'scale' ? (
                  <select value={rj} onChange={(e) => setRj(+e.target.value)} aria-label="other row">
                    {rowOpts}
                  </select>
                ) : (
                  <span>{`× R${ri + 1}`}</span>
                )}
              </div>
              <div className="la-btns" style={{ marginTop: 6 }}>
                <button onClick={apply}>Apply</button>
                <span className="muted small">k may be a fraction, e.g. -3/2</span>
              </div>
              <div className="la-rr-msg">{msg}</div>
            </div>
          )}
          {hist.length > 0 && (
            <div className="la-rr-hist" aria-label="operations so far">
              {hist.map((h, i) => (
                <div key={i}>
                  {i + 1}. <TeX>{rowOpTeX(h.op)}</TeX>
                  <span className="who">{h.by}</span>
                  {trackDet && <span className="eff">{effect(h.op)}</span>}
                </div>
              ))}
            </div>
          )}
        </>
      }
    >
      <div className="la-rr">
        <div className="la-rr-mat">
          <TeX display>{matTeXBoxed(cur, nCoef, boxes)}</TeX>
        </div>
        <div className="la-note" style={{ textAlign: 'center' }}>
          {hist.length > 0 && (
            <>
              Last: <TeX>{rowOpTeX(hist[hist.length - 1].op)}</TeX> ({hist[hist.length - 1].by}).{' '}
            </>
          )}
          {stage}
        </div>
        {trackDet && (
          <div className="la-box la-tex" style={{ textAlign: 'center' }}>
            <TeX>
              {`\\det A = ${mult.toTeX()}\\cdot\\det(\\text{current})` + (upper ? ` = ${mult.toTeX()}\\cdot ${diag.map((x) => '(' + x.toTeX() + ')').join('')} = ${mult.mul(detU).toTeX()}` : '')}
            </TeX>
            {upper ? (
              <div className="small muted">The current matrix is triangular, so its determinant is the product of its diagonal.</div>
            ) : (
              <div className="small muted">Keep going until the matrix is triangular.</div>
            )}
          </div>
        )}
        {summary && (
          <div className="la-box">
            <div className={'la-note ' + (summary.tone === 'ok' ? 'la-ok' : summary.tone === 'bad' ? 'la-bad' : 'la-warn')}>{summary.text}</div>
            {summary.tex && (
              <div className="la-tex" style={{ textAlign: 'center' }}>
                <TeX display>{summary.tex}</TeX>
              </div>
            )}
          </div>
        )}
      </div>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ la.lu

/**
 * la.lu — Gaussian elimination recorded as A = LU, then (optionally) the two triangular solves for one b.
 * params: matrix (square, integer, no row swaps needed), b (optional right-hand side)
 */
function LU({ spec }: { spec: VizSpec }) {
  const A = useMemo(() => toFMat(spec.matrix as number[][]), [spec.matrix]);
  const n = A.length;
  const b = spec.b ? (spec.b as number[]).map((x) => Frac.of(x)) : null;
  const { steps } = useMemo(() => rrefSteps(A, n, false), [A, n]);
  const U = steps.length ? steps[steps.length - 1].after : A;
  const Lfull: Frac[][] = A.map((_, i) => A.map((__, j) => new Frac(i === j ? 1 : 0)));
  steps.forEach((s) => {
    if (s.op.kind === 'add') Lfull[s.op.i][s.pivot[1]] = s.op.k.neg();
  });
  const nF = 1 + steps.length + 1 + (b ? 2 : 0);
  const { i: f, controls } = usePlayer(nF, { interval: 1600 });
  const known = (i: number, j: number) => i <= j || steps.some((s, t) => t < f && s.op.kind === 'add' && s.op.i === i && s.pivot[1] === j) || f > steps.length;
  const Lnum = Lfull.map((r, i) => r.map((x, j) => (known(i, j) ? x.toNumber() : NaN)));
  const Ucur = f === 0 ? A : steps[Math.min(f, steps.length) - 1].after;
  const step = f >= 1 && f <= steps.length ? steps[f - 1] : null;
  const fmtF = (m: Frac[][]) => (_v: number, i: number, j: number) => m[i][j].toString();
  // triangular solves
  const c: Frac[] = [];
  const cLines: string[] = [];
  const x: Frac[] = Array.from({ length: n }, () => new Frac(0));
  const xLines: string[] = [];
  if (b) {
    for (let i = 0; i < n; i++) {
      let s = b[i];
      const terms: string[] = [];
      for (let j = 0; j < i; j++) {
        if (Lfull[i][j].isZero()) continue;
        s = s.sub(Lfull[i][j].mul(c[j]));
        terms.push(`(${Lfull[i][j].toTeX()})(${c[j].toTeX()})`);
      }
      c.push(s);
      cLines.push(`c_{${i + 1}} &= ${b[i].toTeX()}` + (terms.length ? `${terms.map((t) => ' - ' + t).join('')} = ${s.toTeX()}` : ''));
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = c[i];
      const terms: string[] = [];
      for (let j = i + 1; j < n; j++) {
        if (U[i][j].isZero()) continue;
        s = s.sub(U[i][j].mul(x[j]));
        terms.push(`(${U[i][j].toTeX()})(${x[j].toTeX()})`);
      }
      x[i] = s.div(U[i][i]);
      const num = `${c[i].toTeX()}${terms.map((t) => ' - ' + t).join('')}`;
      const lhs = U[i][i].isOne() ? num : terms.length ? `\\big(${num}\\big) / ${U[i][i].toTeX()}` : `${num} / ${U[i][i].toTeX()}`;
      xLines.unshift(`x_{${i + 1}} &= ${lhs}` + (lhs === x[i].toTeX() ? '' : ` = ${x[i].toTeX()}`));
    }
  }
  let tex: string;
  let note: string;
  if (f === 0) {
    tex = `A = ${fracTeXMat(A)}`;
    note = 'Start: L is the identity with unknown entries below the diagonal; U starts as A.';
  } else if (step) {
    const op = step.op as Extract<RowOp, { kind: 'add' }>;
    tex = `${rowOpTeX(op)} \\quad\\Longrightarrow\\quad \\ell_{${op.i + 1}${step.pivot[1] + 1}} = ${op.k.neg().toTeX()}`;
    note = `To clear the entry below the pivot, subtract ${op.k.neg().toString()} times row ${op.j + 1}. That multiplier is stored in L.`;
  } else if (f === steps.length + 1) {
    tex = `LU = ${fracTeXMat(Lfull)}${fracTeXMat(U)} = ${fracTeXMat(A)} = A`;
    note = 'Elimination is finished. L records every multiplier, U is the echelon form, and their product gives back A.';
  } else if (f === steps.length + 2) {
    tex = `L\\mathbf{c} = \\mathbf{b}: \\quad \\begin{aligned} ${cLines.join(' \\\\ ')} \\end{aligned}`;
    note = 'Forward substitution: solve Lc = b from the top down. About n² operations.';
  } else {
    tex = `U\\mathbf{x} = \\mathbf{c}: \\quad \\begin{aligned} ${xLines.join(' \\\\ ')} \\end{aligned}`;
    note = 'Back substitution: solve Ux = c from the bottom up. About n² operations. Then Ax = LUx = Lc = b.';
  }
  return (
    <div className="la-wide">
      <FigureLayout below={controls}>
        <div className="la-rr">
          <div className="la-mm">
            <div className="la-mm-col">
              <MatGrid m={Lnum} fmt={fmtF(Lfull)} cells={step ? [[step.op.i, step.pivot[1]]] : []} />
              <span className="la-mm-name">
                <TeX>{'L'}</TeX> (multipliers)
              </span>
            </div>
            <div className="la-mm-col">
              <MatGrid m={Ucur.map((r) => r.map((v) => v.toNumber()))} fmt={fmtF(Ucur)} rows={step ? [step.op.i] : []} />
              <span className="la-mm-name">
                <TeX>{'U'}</TeX> (being eliminated)
              </span>
            </div>
            {b && (
              <div className="la-mm-col">
                <MatGrid m={b.map((v) => [v.toNumber()])} fmt={(_v, i) => b[i].toString()} />
                <span className="la-mm-name">
                  <TeX>{'\\mathbf{b}'}</TeX>
                </span>
              </div>
            )}
          </div>
          <div className="la-box la-tex" style={{ textAlign: 'center' }}>
            <TeX display>{tex}</TeX>
          </div>
          <div className="la-note" style={{ textAlign: 'center' }}>
            {note}
          </div>
        </div>
      </FigureLayout>
    </div>
  );
}

// ------------------------------------------------------------------ la.solvecost

const sci = (v: number) => {
  if (v < 1e4) return String(Math.round(v));
  const e = Math.floor(Math.log10(v));
  return `${(v / 10 ** e).toFixed(2)}e${e}`;
};

/**
 * la.solvecost — flop counts for k right-hand sides: factor once (LU), invert once, or eliminate every time.
 * params: n (default 1000)
 */
function SolveCost({ spec }: { spec: VizSpec }) {
  const [n, setN] = useState((spec.n as number) ?? 1000);
  const [lk, setLk] = useState(1);
  const k = Math.round(10 ** lk);
  const lu = (kk: number) => (2 / 3) * n ** 3 + 2 * kk * n * n;
  const invc = (kk: number) => 2 * n ** 3 + 2 * kk * n * n;
  const fresh = (kk: number) => kk * ((2 / 3) * n ** 3 + 2 * n * n);
  const ks = Array.from({ length: 61 }, (_, i) => 10 ** (i / 20));
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={n} onChange={setN} label="n" options={[100, 1000, 10000].map((v) => ({ v, label: String(v) }))} />
          <Slider label="right-hand sides k" value={lk} min={0} max={3} step={0.05} onChange={setLk} fmt={() => String(k)} />
          <Readout
            title={`flops for k = ${k}`}
            rows={[
              ['\\text{LU once} + k \\text{ solves}', sci(lu(k))],
              ['\\text{inverse once} + k\\ A^{-1}\\mathbf{b}', sci(invc(k))],
              ['\\text{eliminate } k \\text{ times}', sci(fresh(k))],
            ]}
          />
          <div className="la-legend">
            <span>
              <i className="la-sw" style={{ background: 'var(--c-w)' }} />
              LU once, then k solves
            </span>
            <span>
              <i className="la-sw" style={{ background: 'var(--c-v)' }} />
              inverse once, then k products
            </span>
            <span>
              <i className="la-sw" style={{ background: 'var(--c-err)' }} />
              eliminate k times
            </span>
          </div>
          <div className="la-note">
            Vertical axis: operations, log scale. Counts: LU ≈ <TeX>{'\\tfrac23 n^3'}</TeX>, inverse ≈ <TeX>{'2n^3'}</TeX>, each triangular pair or matrix–vector product ≈ <TeX>{'2n^2'}</TeX>. The
            inverse never wins, and it is also less accurate.
          </div>
        </>
      }
    >
      <LinePlot
        logX
        logY
        width={480}
        height={300}
        xlabel="number of right-hand sides k (log scale)"
        legend={false}
        vlines={[{ x: k, color: 'var(--accent)' }]}
        series={[
          {
            pts: ks.map((v) => [v, lu(v)]),
            color: 'var(--c-w)',
            label: 'LU once, then k solves',
          },
          {
            pts: ks.map((v) => [v, invc(v)]),
            color: 'var(--c-v)',
            label: 'inverse once, then k products',
            dashed: true,
          },
          {
            pts: ks.map((v) => [v, fresh(v)]),
            color: 'var(--c-err)',
            label: 'eliminate from scratch k times',
          },
        ]}
      />
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ registry

const isIntMat = (m: unknown) => isMat(m) && (m as Mat).every((r) => r.every((x) => Number.isInteger(x)));

export const systemsViz = {
  'la.lines2d': {
    component: Lines2D,
    validate: (s: VizSpec) => {
      if (s.lines === undefined) return null;
      const L = s.lines as unknown[];
      if (!Array.isArray(L) || L.length !== 2 || !L.every((l) => Array.isArray(l) && l.length === 2 && l.every((p) => isVec(p, 2)))) return 'lines: [[P1, Q1], [P2, Q2]]';
      const ok = (L as [P2, P2][]).every(([p, q]) => lineThrough(p, q) && [...p, ...q].every((v) => Number.isInteger(v * 2)));
      return ok ? null : 'points must be distinct and on a 0.5 grid';
    },
    doc: 'Row picture (drag two points per line) beside the column picture of the same 2×2 system. params lines, range',
  },
  'la.planes3d': {
    component: Planes3D,
    validate: (s: VizSpec) => (s.preset === undefined || (typeof s.preset === 'string' && s.preset in PLANE_PRESETS) ? null : 'unknown preset'),
    doc: "Three planes in 3-D with rank readouts. params preset ('unique' | 'line' | 'parallel'), shift",
  },
  'la.rowreduce': {
    component: RowReduce,
    validate: (s: VizSpec) => {
      if (!isIntMat(s.matrix)) return 'matrix of integers required';
      const m = s.matrix as Mat;
      if (m.length > 4 || m[0].length > 7) return 'at most 4 rows and 7 columns';
      if (s.augment !== undefined && !(Number.isInteger(s.augment) && (s.augment as number) >= 1 && (s.augment as number) < m[0].length)) return 'augment must be the number of coefficient columns';
      if (s.inverse && s.augment !== m.length) return 'inverse needs [A | I] with augment = n';
      if (s.trackDet && m.length !== m[0].length) return 'trackDet needs a square matrix';
      return null;
    },
    doc: "Row reduction in exact fractions: algorithm's next step or your own swap/scale/add. params matrix, augment, mode ('rref'|'echelon'), inverse, trackDet, manual",
  },
  'la.lu': {
    component: LU,
    validate: (s: VizSpec) => {
      if (!isIntMat(s.matrix) || (s.matrix as Mat).length !== (s.matrix as Mat)[0].length) return 'square integer matrix required';
      const F = toFMat(s.matrix as Mat);
      if (fdet(F).isZero()) return 'matrix must be invertible';
      if (rrefSteps(F, F.length, false).steps.some((st) => st.op.kind === 'swap')) return 'matrix must not need row swaps';
      if (s.b !== undefined && !isVec(s.b, F.length)) return 'b must match the size';
      return null;
    },
    doc: 'Elimination recorded as A = LU, then forward and back substitution for b. params matrix, b',
  },
  'la.solvecost': {
    component: SolveCost,
    doc: 'Flop counts: LU once + k solves vs inverse vs re-eliminating. params n',
  },
};
