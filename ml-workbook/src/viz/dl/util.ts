// Small helpers shared by the deep-learning figures.

/** Round to d decimals and drop trailing zeros; never prints "-0". */
export function fmt(x: number, d = 2): string {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : x < 0 ? '−∞' : 'NaN';
  const s = (Math.round(x * 10 ** d) / 10 ** d).toFixed(d).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
}

/** Fixed number of decimals (keeps trailing zeros, useful in tables). */
export function fix(x: number, d = 2): string {
  const s = x.toFixed(d);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
}

/** Significant-digit format that switches to scientific notation for very small or large magnitudes. */
export function sig(x: number, digits = 3): string {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : x < 0 ? '−∞' : 'NaN';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e-3 && a < 1e5) return String(Number(x.toPrecision(digits)));
  const [m, e] = x.toExponential(digits - 1).split('e');
  return `${Number(m)}e${Number(e)}`;
}

/** Same as sig but as TeX, e.g. 1.2\times10^{-5}. */
export function sigTeX(x: number, digits = 3): string {
  if (!Number.isFinite(x)) return x > 0 ? '\\infty' : x < 0 ? '-\\infty' : '\\text{NaN}';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e-3 && a < 1e5) return String(Number(x.toPrecision(digits)));
  const [m, e] = x.toExponential(digits - 1).split('e');
  return `${Number(m)}\\times10^{${Number(e)}}`;
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 erf, |error| < 1.5e-7). */
export function normCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
export const normPdf = (z: number) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);

/** Vector as a TeX column. */
export const colTeX = (v: number[], d = 2) => `\\begin{bmatrix}${v.map((x) => fmt(x, d)).join('\\\\')}\\end{bmatrix}`;
/** Vector as a TeX row (parenthesised list). */
export const rowTeX = (v: number[], d = 2) => `(${v.map((x) => fmt(x, d)).join(',\\ ')})`;

/** A Readout value rendered as TeX. Braces keep the kit from reading a leading digit as a dollar amount. */
export const tv = (tex: string) => '${' + tex + '}';
