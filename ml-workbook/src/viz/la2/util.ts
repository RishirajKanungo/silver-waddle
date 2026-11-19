// Helpers shared by the la2 figures (orthogonality, eigenvalues, SVD/PCA).
import type { Mat, Vec } from '../../math/linalg';
import { Rng } from '../../math/rng';

export type P2 = [number, number];

/** 2-decimal string without "-0" */
export const f2 = (x: number, d = 2) => {
  const r = Math.round(x * 10 ** d) / 10 ** d;
  return Object.is(r, -0) || r === 0 ? '0' : String(r);
};
export const vt = (v: number[], d = 2) => `\\begin{bmatrix}${v.map((x) => f2(x, d)).join('\\\\')}\\end{bmatrix}`;
export const mt = (A: number[][], d = 2) => `\\begin{bmatrix}${A.map((r) => r.map((x) => f2(x, d)).join('&')).join('\\\\')}\\end{bmatrix}`;

export const deg = (r: number) => (r * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;
export const rot2 = (t: number): Mat => [
  [Math.cos(t), -Math.sin(t)],
  [Math.sin(t), Math.cos(t)],
];
export const mv2 = (A: Mat, x: number[]): P2 => [A[0][0] * x[0] + A[0][1] * x[1], A[1][0] * x[0] + A[1][1] * x[1]];
export const mm2 = (A: Mat, B: Mat): Mat => [
  [A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
  [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]],
];
export const det2 = (A: Mat) => A[0][0] * A[1][1] - A[0][1] * A[1][0];
export const circle = (r = 1, n = 120, c: P2 = [0, 0]): P2[] => Array.from({ length: n + 1 }, (_, i) => [c[0] + r * Math.cos((2 * Math.PI * i) / n), c[1] + r * Math.sin((2 * Math.PI * i) / n)]);

/** Eigenvalues of a real 2×2, real or complex: re ± i·im. */
export function eigvals2(A: Mat): { re: [number, number]; im: number; real: boolean; tr: number; det: number; disc: number } {
  const tr = A[0][0] + A[1][1];
  const dt = det2(A);
  const disc = tr * tr - 4 * dt;
  if (disc >= -1e-12) {
    const s = Math.sqrt(Math.max(0, disc));
    return { re: [(tr + s) / 2, (tr - s) / 2], im: 0, real: true, tr, det: dt, disc };
  }
  return { re: [tr / 2, tr / 2], im: Math.sqrt(-disc) / 2, real: false, tr, det: dt, disc };
}

/** A unit eigenvector of a 2×2 for a real eigenvalue l. */
export function eigvec2(A: Mat, l: number): P2 {
  const [[a, b], [c, d]] = A;
  const r1: P2 = [b, l - a], r2: P2 = [l - d, c];
  const n1 = Math.hypot(...r1), n2 = Math.hypot(...r2);
  let v: P2;
  if (n1 > 1e-9 && n1 >= n2) v = r1;
  else if (n2 > 1e-9) v = r2;
  else return [1, 0];
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n];
}

/** Format eigenvalue pair for TeX */
export function eigTeX(e: ReturnType<typeof eigvals2>) {
  if (e.real) return `${f2(e.re[0])},\\ ${f2(e.re[1])}`;
  return `${f2(e.re[0])} \\pm ${f2(e.im)}i`;
}

/**
 * SVD of a 2×2 with V a proper rotation (det V = +1). U may be a rotation or a reflection.
 * Returns angles for animation: V = R(alpha); U = R(beta) · diag(1, uflip).
 */
export function svd2(A: Mat) {
  // eigen-decomposition of AᵀA (symmetric 2×2) in closed form
  const a = A[0][0] * A[0][0] + A[1][0] * A[1][0];
  const b = A[0][0] * A[0][1] + A[1][0] * A[1][1];
  const c = A[0][1] * A[0][1] + A[1][1] * A[1][1];
  const mid = (a + c) / 2, rad_ = Math.hypot((a - c) / 2, b);
  const l1 = mid + rad_, l2 = Math.max(0, mid - rad_);
  const alpha = 0.5 * Math.atan2(2 * b, a - c); // direction of the top eigenvector of AᵀA
  const s1 = Math.sqrt(Math.max(0, l1)), s2 = Math.sqrt(l2);
  const v1: P2 = [Math.cos(alpha), Math.sin(alpha)], v2: P2 = [-Math.sin(alpha), Math.cos(alpha)];
  const Av1 = mv2(A, v1), Av2 = mv2(A, v2);
  let u1: P2 = s1 > 1e-12 ? [Av1[0] / s1, Av1[1] / s1] : [1, 0];
  let u2: P2;
  if (s2 > 1e-9 * Math.max(1, s1)) u2 = [Av2[0] / s2, Av2[1] / s2];
  else u2 = [-u1[1], u1[0]];
  if (s1 <= 1e-12) {
    u1 = [1, 0];
    u2 = [0, 1];
  }
  const U: Mat = [
    [u1[0], u2[0]],
    [u1[1], u2[1]],
  ];
  const V: Mat = [
    [v1[0], v2[0]],
    [v1[1], v2[1]],
  ];
  const uflip = det2(U) < 0 ? -1 : 1;
  const beta = Math.atan2(u1[1], u1[0]);
  return { U, S: [s1, s2] as P2, V, u1, u2, v1, v2, alpha, beta, uflip };
}

/**
 * Thin SVD of an m×n matrix by one-sided Jacobi (accurate for small singular values).
 * Singular values descending. U is m×k, V is n×k, k = min(m, n) (assumes m ≥ n for best accuracy;
 * for m < n it works on Aᵀ and swaps).
 */
export function svdJacobi(A: Mat): { U: Mat; S: Vec; V: Mat } {
  const m = A.length, n = A[0].length;
  if (m < n) {
    const r = svdJacobi(A[0].map((_, j) => A.map((row) => row[j])));
    return { U: r.V, S: r.S, V: r.U };
  }
  // work on columns
  const U = A[0].map((_, j) => A.map((row) => row[j])); // n columns of length m
  const V: number[][] = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))); // V as columns
  for (let sweep = 0; sweep < 60; sweep++) {
    let rotated = false;
    for (let p = 0; p < n - 1; p++)
      for (let q = p + 1; q < n; q++) {
        const up = U[p], uq = U[q];
        let alpha = 0, beta = 0, gamma = 0;
        for (let i = 0; i < m; i++) {
          alpha += up[i] * up[i];
          beta += uq[i] * uq[i];
          gamma += up[i] * uq[i];
        }
        if (Math.abs(gamma) <= 1e-15 * Math.sqrt(alpha * beta) || gamma === 0) continue;
        rotated = true;
        const zeta = (beta - alpha) / (2 * gamma);
        const t = Math.sign(zeta || 1) / (Math.abs(zeta) + Math.sqrt(1 + zeta * zeta));
        const c = 1 / Math.sqrt(1 + t * t), s = c * t;
        for (let i = 0; i < m; i++) {
          const x = up[i], y = uq[i];
          up[i] = c * x - s * y;
          uq[i] = s * x + c * y;
        }
        const vp = V[p], vq = V[q];
        for (let i = 0; i < n; i++) {
          const x = vp[i], y = vq[i];
          vp[i] = c * x - s * y;
          vq[i] = s * x + c * y;
        }
      }
    if (!rotated) break;
  }
  const S = U.map((col) => Math.sqrt(col.reduce((s, x) => s + x * x, 0)));
  const order = S.map((_, i) => i).sort((i, j) => S[j] - S[i]);
  const Ss = order.map((i) => S[i]);
  const Ucols = order.map((i) => (S[i] > 1e-300 ? U[i].map((x) => x / S[i]) : U[i].map(() => 0)));
  const Vcols = order.map((i) => V[i]);
  const toRows = (cols: number[][]) => cols[0].map((_, r) => cols.map((c) => c[r]));
  return { U: toRows(Ucols), S: Ss, V: toRows(Vcols) };
}

/** Seeded standard normal sample, n×2 */
export function normals2(n: number, seed: number): P2[] {
  const r = new Rng(seed);
  return Array.from({ length: n }, () => [r.normal(), r.normal()] as P2);
}

/** Mean and 2×2 covariance (divide by n − 1) of points */
export function cov2(pts: P2[]) {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  let a = 0, b = 0, c = 0;
  for (const [x, y] of pts) {
    a += (x - mx) ** 2;
    b += (x - mx) * (y - my);
    c += (y - my) ** 2;
  }
  const d = Math.max(1, n - 1);
  return { mean: [mx, my] as P2, C: [[a / d, b / d], [b / d, c / d]] as Mat };
}

/** Eigen-decomposition of a symmetric 2×2: values descending, unit vectors (sign: first nonzero... largest |entry| positive) */
export function eigSym2(S: Mat) {
  const a = S[0][0], b = S[0][1], c = S[1][1];
  const mid = (a + c) / 2, r = Math.hypot((a - c) / 2, b);
  const l1 = mid + r, l2 = mid - r;
  const t = 0.5 * Math.atan2(2 * b, a - c);
  let q1: P2 = [Math.cos(t), Math.sin(t)];
  if (Math.abs(q1[0]) >= Math.abs(q1[1]) ? q1[0] < 0 : q1[1] < 0) q1 = [-q1[0], -q1[1]];
  const q2: P2 = [-q1[1], q1[0]];
  return { values: [l1, l2] as P2, q1, q2 };
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
