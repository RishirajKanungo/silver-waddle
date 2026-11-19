// Helpers shared by the figures of modules la02–la05 (matrices, systems, subspaces, determinants).
import { useEffect, useRef, useState } from 'react';
import type { Mat, Vec } from '../../math/linalg';
import { Frac } from '../../math/frac';
import type { P2 } from '../kit';

/** round to d decimals, print -0 as 0 */
export const nf = (x: number, d = 2) => {
  const r = Math.round(x * 10 ** d) / 10 ** d;
  return Object.is(r, -0) || r === 0 ? '0' : String(r);
};
/** number for inline TeX products: negative values in parentheses */
export const pn = (x: number, d = 2) => (x < 0 ? `(${nf(x, d)})` : nf(x, d));
export const bm = (A: Mat, d = 2) => `\\begin{bmatrix} ${A.map((r) => r.map((x) => nf(x, d)).join(' & ')).join(' \\\\ ')} \\end{bmatrix}`;
export const bv = (v: Vec, d = 2) => `\\begin{bmatrix} ${v.map((x) => nf(x, d)).join(' \\\\ ')} \\end{bmatrix}`;
export const brow = (v: Vec, d = 2) => `\\begin{bmatrix} ${v.map((x) => nf(x, d)).join(' & ')} \\end{bmatrix}`;
export const col = (A: Mat, j: number): Vec => A.map((r) => r[j]);

export const isMat = (m: unknown, r?: number, c?: number): m is Mat =>
  Array.isArray(m) &&
  m.length > 0 &&
  m.every((row) => Array.isArray(row) && row.length === (m as unknown[][])[0].length && row.every((x) => typeof x === 'number' && Number.isFinite(x))) &&
  (r === undefined || m.length === r) &&
  (c === undefined || (m as unknown[][])[0].length === c);
export const isVec = (v: unknown, n?: number): v is number[] => Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x)) && (n === undefined || v.length === n);

export const smooth = (t: number) => t * t * (3 - 2 * t);

/** A 0 → 1 tween for "animate from the identity" buttons. ≤ 45 frames. */
export function useTween(frames = 45, ms = 22) {
  const [t, setT] = useState(1);
  const timer = useRef<number | null>(null);
  const stop = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  };
  const play = (to = 1) => {
    stop();
    let k = 0;
    setT(0);
    timer.current = window.setInterval(() => {
      k++;
      setT(Math.min(to, (to * k) / frames));
      if (k >= frames) stop();
    }, ms);
  };
  useEffect(() => stop, []);
  const set = (v: number) => {
    stop();
    setT(v);
  };
  return { t, set, play, playing: timer.current !== null };
}

/** The letter F: shows orientation, so reflections and rotations look different. */
export const F_SHAPE: P2[] = [
  [0, 0],
  [0.3, 0],
  [0.3, 0.6],
  [0.75, 0.6],
  [0.75, 0.9],
  [0.3, 0.9],
  [0.3, 1.2],
  [1, 1.2],
  [1, 1.5],
  [0, 1.5],
].map(([x, y]) => [x + 0.35, y + 0.25] as P2);

export const ap2 = (M: Mat, p: P2): P2 => [M[0][0] * p[0] + M[0][1] * p[1], M[1][0] * p[0] + M[1][1] * p[1]];

/** Parse "3", "-2", "3/4", "-0.5" into an exact fraction; null when invalid. */
export function parseFrac(s: string): Frac | null {
  const t = s.trim().replace('−', '-');
  try {
    if (/^-?\d+(\s*\/\s*-?\d+)?$/.test(t)) {
      const [a, b] = t.split('/');
      if (b !== undefined && BigInt(b.trim()) === 0n) return null;
      return new Frac(BigInt(a.trim()), b !== undefined ? BigInt(b.trim()) : 1n);
    }
    if (/^-?\d*\.\d+$/.test(t)) return Frac.of(parseFloat(t));
  } catch {
    return null;
  }
  return null;
}

/** Linear equation a x + b y = c as TeX, with clean signs and unit coefficients. */
export function eqTeX(coef: number[], rhs: number, names = ['x', 'y', 'z']): string {
  let s = '';
  coef.forEach((a, i) => {
    if (Math.abs(a) < 1e-12) return;
    const mag = Math.abs(a);
    const m = Math.abs(mag - 1) < 1e-12 ? '' : nf(mag);
    if (!s) s = (a < 0 ? '-' : '') + m + names[i];
    else s += (a < 0 ? ' - ' : ' + ') + m + names[i];
  });
  return (s || '0') + ' = ' + nf(rhs);
}

export const gcdN = (a: number, b: number): number => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};

/**
 * Numerical rank by Gaussian elimination with partial pivoting and a relative tolerance.
 * (linalg.rank goes through the eigenvalues of AᵀA and reports rank-deficient integer matrices as full rank.)
 */
export function rankNum(A: Mat, tol = 1e-7): number {
  const a = A.map((r) => [...r]);
  const m = a.length,
    n = a[0]?.length ?? 0;
  const big = Math.max(1, ...a.flat().map(Math.abs));
  let r = 0;
  for (let c = 0; c < n && r < m; c++) {
    let p = r;
    for (let i = r + 1; i < m; i++) if (Math.abs(a[i][c]) > Math.abs(a[p][c])) p = i;
    if (Math.abs(a[p][c]) <= tol * big) continue;
    [a[p], a[r]] = [a[r], a[p]];
    for (let i = r + 1; i < m; i++) {
      const f = a[i][c] / a[r][c];
      for (let j = c; j < n; j++) a[i][j] -= f * a[r][j];
    }
    r++;
  }
  return r;
}
