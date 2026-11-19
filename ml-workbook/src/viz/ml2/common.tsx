// Shared helpers for the ml03–ml05 figures: formatting, seeded data, least squares,
// trees (classification and 1-D regression), small SVG pieces.
import type { ReactNode } from 'react';
import { Rng } from '../../math/rng';
import { solve } from '../../math/linalg';
import { usePlane } from '../kit';

export const fx = (x: number, d = 2) => {
  if (!Number.isFinite(x)) return '∞';
  const s = x.toFixed(d);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
};
export const pct = (x: number, d = 1) => (100 * x).toFixed(d) + '%';

/** cluster / class palette (CSS variables only) */
export const CL = ['var(--c-u)', 'var(--c-v)', 'var(--c-w)', 'var(--c-k)', 'var(--c-j)', 'var(--warn)'];
export const CLASS = ['var(--c-neg)', 'var(--c-pos)'];

export const rng = (seed: number) => new Rng(seed);
export const range = (n: number) => Array.from({ length: n }, (_, i) => i);
export const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
export const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
export const median = (a: number[]) => {
  const s = [...a].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** standard normal pdf / cdf / quantile */
export const phi = (z: number) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
export function Phi(z: number) {
  // Abramowitz–Stegun 7.1.26 via erf, accurate to ~1e-7
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
export function PhiInv(p: number) {
  // bisection on Phi: plenty for a figure
  let lo = -10, hi = 10;
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2;
    if (Phi(m) < p) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}
export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Legendre polynomials P_0..P_deg at t in [-1, 1] (a well-conditioned polynomial basis). */
export function legendre(t: number, deg: number): number[] {
  const out = [1];
  if (deg >= 1) out.push(t);
  for (let k = 2; k <= deg; k++) out.push(((2 * k - 1) * t * out[k - 1] - (k - 1) * out[k - 2]) / k);
  return out;
}

/** ridge least squares on the rows of Phi: (Phi^T Phi + lam I) c = Phi^T y */
export function ridge(Phi: number[][], y: number[], lam: number): number[] {
  const p = Phi[0].length;
  const A = Array.from({ length: p }, () => new Array(p).fill(0));
  const b = new Array(p).fill(0);
  for (let i = 0; i < Phi.length; i++) {
    const r = Phi[i];
    for (let a = 0; a < p; a++) {
      b[a] += r[a] * y[i];
      for (let c = a; c < p; c++) A[a][c] += r[a] * r[c];
    }
  }
  for (let a = 0; a < p; a++) {
    A[a][a] += lam;
    for (let c = 0; c < a; c++) A[a][c] = A[c][a];
  }
  return solve(A, b) ?? new Array(p).fill(0);
}

/** min-norm (lam -> 0) or ridge solution in dual form when there are more columns than rows */
export function ridgeDual(Phi: number[][], y: number[], lam: number): number[] {
  const n = Phi.length, p = Phi[0].length;
  const K = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => {
    let s = 0;
    for (let a = 0; a < p; a++) s += Phi[i][a] * Phi[j][a];
    return s + (i === j ? lam : 0);
  }));
  const al = solve(K, y) ?? new Array(n).fill(0);
  const c = new Array(p).fill(0);
  for (let i = 0; i < n; i++) for (let a = 0; a < p; a++) c[a] += Phi[i][a] * al[i];
  return c;
}

// ------------------------------------------------------------------ classification trees

export type Crit = 'gini' | 'entropy';
export function impurity(counts: number[], crit: Crit) {
  const n = sum(counts);
  if (!n) return 0;
  let s = 0;
  for (const c of counts) {
    if (!c) continue;
    const p = c / n;
    s += crit === 'gini' ? p * p : -p * Math.log2(p);
  }
  return crit === 'gini' ? 1 - s : s;
}

export interface Cand {
  thr: number;
  w: number; // weighted child impurity
  nl: number;
  nr: number;
}
/** all midpoint thresholds of feature f within idx, with weighted child impurity */
export function candidates(X: number[][], y: number[], idx: number[], f: number, crit: Crit, K = 2): Cand[] {
  const s = [...idx].sort((a, b) => X[a][f] - X[b][f]);
  const tot = new Array(K).fill(0);
  s.forEach((i) => tot[y[i]]++);
  const left = new Array(K).fill(0);
  const out: Cand[] = [];
  for (let j = 0; j < s.length - 1; j++) {
    left[y[s[j]]]++;
    const a = X[s[j]][f], b = X[s[j + 1]][f];
    if (a === b) continue;
    const right = tot.map((t, k) => t - left[k]);
    const nl = j + 1, nr = s.length - nl;
    out.push({ thr: (a + b) / 2, w: (nl * impurity(left, crit) + nr * impurity(right, crit)) / s.length, nl, nr });
  }
  return out;
}

export interface TNode {
  id: number;
  idx: number[];
  depth: number;
  counts: number[];
  imp: number;
  box: [[number, number], [number, number]];
  feat?: number;
  thr?: number;
  gain?: number;
  left?: number;
  right?: number;
  parent?: number;
}

/** Grow a tree breadth-first; returns nodes and the order in which nodes were split. */
export function growTree(X: number[][], y: number[], crit: Crit, maxDepth: number, minLeaf = 1, box: [[number, number], [number, number]] = [[0, 10], [0, 10]], K = 2) {
  const nodes: TNode[] = [];
  const mk = (idx: number[], depth: number, b: TNode['box'], parent?: number): TNode => {
    const counts = new Array(K).fill(0);
    idx.forEach((i) => counts[y[i]]++);
    const n: TNode = { id: nodes.length, idx, depth, counts, imp: impurity(counts, crit), box: b, parent };
    nodes.push(n);
    return n;
  };
  mk(range(y.length), 0, box);
  const order: number[] = [];
  for (let q = 0; q < nodes.length; q++) {
    const nd = nodes[q];
    if (nd.imp < 1e-12 || nd.depth >= maxDepth || nd.idx.length < 2 * minLeaf) continue;
    let best: { f: number; c: Cand } | null = null;
    for (let f = 0; f < X[0].length; f++)
      for (const c of candidates(X, y, nd.idx, f, crit, K)) {
        if (c.nl < minLeaf || c.nr < minLeaf) continue;
        if (!best || c.w < best.c.w - 1e-12) best = { f, c };
      }
    if (!best || nd.imp - best.c.w < 1e-12) continue;
    nd.feat = best.f;
    nd.thr = best.c.thr;
    nd.gain = nd.imp - best.c.w;
    const L = nd.idx.filter((i) => X[i][best!.f] <= best!.c.thr);
    const R = nd.idx.filter((i) => X[i][best!.f] > best!.c.thr);
    const bl: TNode['box'] = [[...nd.box[0]], [...nd.box[1]]] as TNode['box'];
    const br: TNode['box'] = [[...nd.box[0]], [...nd.box[1]]] as TNode['box'];
    bl[best.f][1] = best.c.thr;
    br[best.f][0] = best.c.thr;
    nd.left = mk(L, nd.depth + 1, bl, nd.id).id;
    nd.right = mk(R, nd.depth + 1, br, nd.id).id;
    order.push(nd.id);
  }
  return { nodes, order };
}

/** predict class-1 probability with a grown tree, using only the first `steps` splits */
export function treeProba(nodes: TNode[], splitSet: Set<number>, x: number[]) {
  let n = nodes[0];
  while (splitSet.has(n.id) && n.left !== undefined) n = nodes[x[n.feat!] <= n.thr! ? n.left : n.right!];
  const t = sum(n.counts);
  return t ? n.counts[1] / t : 0.5;
}

// ------------------------------------------------------------------ 1-D regression trees

export interface Leaf {
  lo: number;
  hi: number;
  v: number;
}
/** CART regression tree on 1-D data (squared error), optional sample weights via multiplicity. */
export function regTree1D(xs: number[], ys: number[], maxDepth: number, minLeaf = 1, lo = -Infinity, hi = Infinity): Leaf[] {
  const idx = range(xs.length).sort((a, b) => xs[a] - xs[b]);
  const leaves: Leaf[] = [];
  const rec = (ids: number[], depth: number, a: number, b: number) => {
    const m = mean(ids.map((i) => ys[i]));
    if (depth >= maxDepth || ids.length < 2 * minLeaf) {
      leaves.push({ lo: a, hi: b, v: m });
      return;
    }
    // prefix sums for SSE = sum y^2 - (sum y)^2 / n
    let best = -1, bestS = Infinity;
    const n = ids.length;
    let sl = 0, ql = 0;
    let st = 0, qt = 0;
    for (const i of ids) {
      st += ys[i];
      qt += ys[i] * ys[i];
    }
    const parent = qt - (st * st) / n;
    for (let j = 0; j < n - 1; j++) {
      const y = ys[ids[j]];
      sl += y;
      ql += y * y;
      const nl = j + 1, nr = n - nl;
      if (nl < minLeaf || nr < minLeaf) continue;
      if (xs[ids[j]] === xs[ids[j + 1]]) continue;
      const s = ql - (sl * sl) / nl + (qt - ql) - ((st - sl) * (st - sl)) / nr;
      if (s < bestS - 1e-12) {
        bestS = s;
        best = j;
      }
    }
    if (best < 0 || parent - bestS < 1e-12) {
      leaves.push({ lo: a, hi: b, v: m });
      return;
    }
    const t = (xs[ids[best]] + xs[ids[best + 1]]) / 2;
    rec(ids.slice(0, best + 1), depth + 1, a, t);
    rec(ids.slice(best + 1), depth + 1, t, b);
  };
  rec(idx, 0, lo, hi);
  return leaves;
}
export const leafAt = (leaves: Leaf[], x: number) => {
  for (const l of leaves) if (x <= l.hi) return l.v;
  return leaves[leaves.length - 1].v;
};
/** step-function path of a list of leaves within [x0, x1] */
export const leafPath = (leaves: Leaf[], x0: number, x1: number): [number, number][] =>
  leaves.flatMap((l) => [
    [Math.max(x0, l.lo), l.v],
    [Math.min(x1, l.hi), l.v],
  ] as [number, number][]);

// ------------------------------------------------------------------ SVG helpers

/** circles in plane coordinates; cheaper than many <Point>s */
export function Dots({ pts, color, r = 4, opacity = 1, stroke, hollow, ring }: { pts: [number, number][]; color: string | ((i: number) => string); r?: number | ((i: number) => number); opacity?: number | ((i: number) => number); stroke?: string; hollow?: boolean; ring?: boolean }) {
  const { sx, sy } = usePlane();
  return (
    <g>
      {pts.map((p, i) => {
        const c = typeof color === 'function' ? color(i) : color;
        const rr = typeof r === 'function' ? r(i) : r;
        const o = typeof opacity === 'function' ? opacity(i) : opacity;
        if (ring) return <circle key={i} cx={sx(p[0])} cy={sy(p[1])} r={rr} style={{ fill: 'none', stroke: c, strokeWidth: 2, opacity: o }} />;
        return <circle key={i} cx={sx(p[0])} cy={sy(p[1])} r={rr} style={{ fill: hollow ? 'var(--surface)' : c, stroke: stroke ?? (hollow ? c : 'var(--surface)'), strokeWidth: hollow ? 2 : 1, opacity: o }} />;
      })}
    </g>
  );
}

/** axis-aligned rectangle in plane coordinates */
export function Rect({ x, y, fill, opacity = 0.15, stroke, width = 1, dashed }: { x: [number, number]; y: [number, number]; fill: string; opacity?: number; stroke?: string; width?: number; dashed?: boolean }) {
  const { sx, sy } = usePlane();
  return <rect x={sx(x[0])} y={sy(y[1])} width={Math.max(0, sx(x[1]) - sx(x[0]))} height={Math.max(0, sy(y[0]) - sy(y[1]))} style={{ fill, fillOpacity: opacity, stroke: stroke ?? 'none', strokeWidth: width, strokeDasharray: dashed ? '5 4' : undefined }} />;
}

/** a titled stack inside a figure */
export function Panel({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <div className="ml2-panel">
      {title && <div className="ml2-panel-title">{title}</div>}
      {children}
    </div>
  );
}

/** color legend chips */
export function Legend({ items }: { items: { color: string; label: ReactNode; dashed?: boolean; dot?: boolean }[] }) {
  return (
    <div className="ml2-legend">
      {items.map((it, i) => (
        <span key={i} className="ml2-legend-item">
          {it.dot ? <span className="ml2-chip-dot" style={{ background: it.color }} /> : <span className={'ml2-chip' + (it.dashed ? ' dashed' : '')} style={{ borderColor: it.color }} />}
          {it.label}
        </span>
      ))}
    </div>
  );
}
