// Small numeric helpers shared by the ml01–ml02 figures.

/** round to d decimals for display, without "-0" */
export const fx = (x: number, d = 2) => {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : x < 0 ? '−∞' : '—';
  const r = Math.round(x * 10 ** d) / 10 ** d;
  return (Object.is(r, -0) ? 0 : r).toFixed(d);
};
/** compact number: fixed decimals for moderate values, exponent for huge or tiny ones */
export const fc = (x: number, d = 3) => {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '—';
  const a = Math.abs(x);
  if (a !== 0 && (a >= 1e5 || a < 10 ** -d)) return x.toExponential(1);
  return fx(x, d);
};

export const sigmoid = (z: number) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));
/** log(1 + e^z) without overflow */
export const softplus = (z: number) => (z > 0 ? z + Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z)));
export const logSumExp = (z: number[]) => {
  const m = Math.max(...z);
  return m + Math.log(z.reduce((s, v) => s + Math.exp(v - m), 0));
};
export const softmax = (z: number[]) => {
  const L = logSumExp(z);
  return z.map((v) => Math.exp(v - L));
};

const erf = (x: number) => {
  // Abramowitz–Stegun 7.1.26, |error| < 1.5e-7
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
};
/** standard normal CDF */
export const Phi = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));
/** standard normal density */
export const phi = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

export const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
export const logspace = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => 10 ** (a + ((b - a) * i) / (n - 1)));

/**
 * Least squares min ‖A x − b‖ by Householder QR (stable for the ill-conditioned polynomial bases).
 * A is m×n with m ≥ n. Columns that are numerically dependent get coefficient 0.
 */
export function lstsqQR(A: number[][], b: number[]): number[] {
  const m = A.length, n = A[0].length;
  const R = A.map((r) => [...r]);
  const y = [...b];
  for (let k = 0; k < n; k++) {
    let nrm = 0;
    for (let i = k; i < m; i++) nrm += R[i][k] * R[i][k];
    nrm = Math.sqrt(nrm);
    if (nrm < 1e-14) continue;
    const alpha = R[k][k] > 0 ? -nrm : nrm;
    const v = Array(m).fill(0);
    v[k] = R[k][k] - alpha;
    for (let i = k + 1; i < m; i++) v[i] = R[i][k];
    const vv = v.reduce((s, t) => s + t * t, 0);
    if (vv < 1e-300) continue;
    for (let j = k; j < n; j++) {
      let s = 0;
      for (let i = k; i < m; i++) s += v[i] * R[i][j];
      const f = (2 * s) / vv;
      for (let i = k; i < m; i++) R[i][j] -= f * v[i];
    }
    let s = 0;
    for (let i = k; i < m; i++) s += v[i] * y[i];
    const f = (2 * s) / vv;
    for (let i = k; i < m; i++) y[i] -= f * v[i];
  }
  const x = Array(n).fill(0);
  const scale = Math.max(...Array.from({ length: n }, (_, i) => Math.abs(R[i][i])));
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(R[i][i]) < 1e-12 * scale) continue;
    let s = y[i];
    for (let j = i + 1; j < n; j++) s -= R[i][j] * x[j];
    x[i] = s / R[i][i];
  }
  return x;
}

/** eigenvalues of a symmetric 2×2 matrix [[a, b], [b, c]], ascending */
export const eigSym2 = (a: number, b: number, c: number): [number, number] => {
  const m = (a + c) / 2, d = Math.sqrt(((a - c) / 2) ** 2 + b * b);
  return [m - d, m + d];
};

/** Six categorical series colours (theme tokens). */
export const SERIES = ['var(--c-u)', 'var(--c-v)', 'var(--c-w)', 'var(--c-k)', 'var(--c-j)', 'var(--muted)'];
/** Three class colours for multiclass figures. */
export const CLASS3 = ['var(--c-u)', 'var(--c-v)', 'var(--c-w)'];
