// Small dense float linear algebra for the visualizers (not for grading).
export type Vec = number[];
export type Mat = number[][];

export const zeros = (r: number, c: number): Mat => Array.from({ length: r }, () => Array(c).fill(0));
export const eye = (n: number): Mat => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
export const shape = (a: Mat): [number, number] => [a.length, a[0]?.length ?? 0];
export const T = (a: Mat): Mat => a[0].map((_, j) => a.map((r) => r[j]));
export const add = (a: Vec, b: Vec): Vec => a.map((x, i) => x + b[i]);
export const sub = (a: Vec, b: Vec): Vec => a.map((x, i) => x - b[i]);
export const scale = (a: Vec, k: number): Vec => a.map((x) => x * k);
export const dot = (a: Vec, b: Vec) => a.reduce((s, x, i) => s + x * b[i], 0);
export const norm = (a: Vec) => Math.sqrt(dot(a, a));
export const unit = (a: Vec) => {
  const n = norm(a);
  return n === 0 ? a.map(() => 0) : scale(a, 1 / n);
};
export const matvec = (A: Mat, x: Vec): Vec => A.map((r) => dot(r, x));
export const matmul = (A: Mat, B: Mat): Mat => A.map((r) => B[0].map((_, j) => r.reduce((s, x, k) => s + x * B[k][j], 0)));
export const madd = (A: Mat, B: Mat): Mat => A.map((r, i) => r.map((x, j) => x + B[i][j]));
export const mscale = (A: Mat, k: number): Mat => A.map((r) => r.map((x) => x * k));
export const outer = (a: Vec, b: Vec): Mat => a.map((x) => b.map((y) => x * y));
export const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const angle = (a: Vec, b: Vec) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (norm(a) * norm(b) || 1))));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpMat = (A: Mat, B: Mat, t: number): Mat => A.map((r, i) => r.map((x, j) => lerp(x, B[i][j], t)));
/** projection of b onto the line spanned by a */
export const projOnto = (b: Vec, a: Vec): Vec => scale(a, dot(a, b) / (dot(a, a) || 1));

/** LU-style determinant with partial pivoting */
export function det(A: Mat): number {
  const n = A.length;
  const a = A.map((r) => [...r]);
  let d = 1;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-12) return 0;
    if (p !== c) {
      [a[p], a[c]] = [a[c], a[p]];
      d = -d;
    }
    d *= a[c][c];
    for (let r = c + 1; r < n; r++) {
      const f = a[r][c] / a[c][c];
      for (let j = c; j < n; j++) a[r][j] -= f * a[c][j];
    }
  }
  return d;
}

/** Solve A x = b (square, nonsingular) with partial pivoting; returns null if singular. */
export function solve(A: Mat, b: Vec): Vec | null {
  const n = A.length;
  const a = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-12) return null;
    [a[p], a[c]] = [a[c], a[p]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let j = c; j <= n; j++) a[r][j] -= f * a[c][j];
    }
  }
  return a.map((r, i) => r[n] / r[i]);
}

export function inv(A: Mat): Mat | null {
  const n = A.length;
  const cols = eye(n).map((e) => solve(A, e));
  if (cols.some((c) => !c)) return null;
  return T(cols as Mat);
}

/** Numerical rank via SVD */
export const rank = (A: Mat, tol = 1e-9) => {
  const { S } = svd(A);
  return S.filter((s) => s > tol * Math.max(1, S[0] ?? 0)).length;
};

/** Real eigenvalues of a 2×2 (null when complex) */
export function eig2(A: Mat): { values: [number, number]; vectors: [Vec, Vec] } | null {
  const [[a, b], [c, d]] = A;
  const tr = a + d, dt = a * d - b * c;
  const disc = tr * tr - 4 * dt;
  if (disc < -1e-12) return null;
  const s = Math.sqrt(Math.max(0, disc));
  const l1 = (tr + s) / 2, l2 = (tr - s) / 2;
  const vecFor = (l: number): Vec => {
    // (A - lI) v = 0
    if (Math.abs(b) > 1e-12) return unit([b, l - a]);
    if (Math.abs(c) > 1e-12) return unit([l - d, c]);
    return Math.abs(a - l) < 1e-12 ? [1, 0] : [0, 1];
  };
  return { values: [l1, l2], vectors: [vecFor(l1), vecFor(l2)] };
}

/** Symmetric eigendecomposition (cyclic Jacobi). Values ascending, vectors as columns of V. */
export function eigSym(A: Mat): { values: Vec; V: Mat } {
  const n = A.length;
  const a = A.map((r) => [...r]);
  const V = eye(n);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-300) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p], akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k], aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
  }
  const order = a.map((_, i) => i).sort((i, j) => a[i][i] - a[j][j]);
  return { values: order.map((i) => a[i][i]), V: V.map((r) => order.map((i) => r[i])) };
}

/** Thin SVD via the eigendecomposition of AᵀA (fine for the small, well-scaled matrices we draw).
 * Returns singular values descending; U is m×k, V is n×k with k = min(m, n). Signs normalized so
 * the largest-magnitude entry of each v is positive. */
export function svd(A: Mat): { U: Mat; S: Vec; V: Mat } {
  const [m, n] = shape(A);
  const k = Math.min(m, n);
  const { values, V: W } = eigSym(matmul(T(A), A));
  const order = values.map((_, i) => i).sort((i, j) => values[j] - values[i]).slice(0, k);
  const S = order.map((i) => Math.sqrt(Math.max(0, values[i])));
  let Vc = order.map((i) => W.map((r) => r[i]));
  Vc = Vc.map((v) => {
    const big = v.reduce((b, x) => (Math.abs(x) > Math.abs(b) ? x : b), 0);
    return big < 0 ? scale(v, -1) : v;
  });
  const Uc: Vec[] = [];
  Vc.forEach((v, i) => {
    if (S[i] > 1e-12) Uc.push(scale(matvec(A, v), 1 / S[i]));
    else {
      // complete with a unit vector orthogonal to the previous columns
      let u: Vec = Array.from({ length: m }, (_, j) => (j === i % m ? 1 : 0));
      for (const w of Uc) u = sub(u, projOnto(u, w));
      Uc.push(unit(u));
    }
  });
  return { U: T(Uc), S, V: T(Vc) };
}

/** Modified Gram–Schmidt QR of the columns of A (reduced). */
export function qr(A: Mat): { Q: Mat; R: Mat } {
  const [m, n] = shape(A);
  const cols = T(A);
  const Q: Vec[] = [];
  const R = zeros(n, n);
  for (let j = 0; j < n; j++) {
    let v = [...cols[j]];
    for (let i = 0; i < Q.length; i++) {
      R[i][j] = dot(Q[i], v);
      v = sub(v, scale(Q[i], R[i][j]));
    }
    R[j][j] = norm(v);
    Q.push(R[j][j] > 1e-12 ? scale(v, 1 / R[j][j]) : Array(m).fill(0));
  }
  return { Q: T(Q), R };
}

/** Least squares: minimize ‖Ax − b‖ via normal equations (small, full column rank). */
export function lstsq(A: Mat, b: Vec): Vec | null {
  return solve(matmul(T(A), A), matvec(T(A), b));
}

/** Rotation by angle (radians) */
export const rot = (t: number): Mat => [
  [Math.cos(t), -Math.sin(t)],
  [Math.sin(t), Math.cos(t)],
];

export const fmt = (x: number, d = 2) => {
  const r = Math.round(x * 10 ** d) / 10 ** d;
  return Object.is(r, -0) || r === 0 ? '0' : String(r);
};
export const matTeX = (A: Mat, d = 2) => `\\begin{bmatrix} ${A.map((r) => r.map((x) => fmt(x, d)).join(' & ')).join(' \\\\ ')} \\end{bmatrix}`;
export const vecTeX = (v: Vec, d = 2) => `\\begin{bmatrix} ${v.map((x) => fmt(x, d)).join(' \\\\ ')} \\end{bmatrix}`;
