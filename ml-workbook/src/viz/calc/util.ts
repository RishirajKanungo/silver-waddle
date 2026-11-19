// Small shared helpers for the calc.* figures.
import type { VizSpec } from '../../content/types';

/** round to d decimals and print without trailing zeros; never prints "-0" */
export const fx = (x: number, d = 2): string => {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : x < 0 ? '−∞' : '—';
  const r = Math.round(x * 10 ** d) / 10 ** d;
  return (Object.is(r, -0) ? 0 : r).toString();
};
/** fixed decimals (keeps trailing zeros, good for readouts that change) */
export const ff = (x: number, d = 2): string => {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : x < 0 ? '−∞' : '—';
  const s = x.toFixed(d);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
};
/** TeX column vector */
export const tvec = (v: number[], d = 2) => `\\begin{bmatrix}${v.map((x) => fx(x, d)).join('\\\\')}\\end{bmatrix}`;
/** TeX matrix */
export const tmat = (m: number[][], d = 2) => `\\begin{bmatrix}${m.map((r) => r.map((x) => fx(x, d)).join('&')).join('\\\\')}\\end{bmatrix}`;

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const linspace = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));

/** validators for VizDef.validate */
export const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
export const isPair = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every(isNum);
export function check(spec: VizSpec, rules: Record<string, (v: unknown) => boolean>, oneOf: Record<string, readonly string[]> = {}): string | null {
  for (const [k, ok] of Object.entries(rules)) if (spec[k] !== undefined && !ok(spec[k])) return `bad value for ${k}`;
  for (const [k, vals] of Object.entries(oneOf)) if (spec[k] !== undefined && !vals.includes(spec[k] as string)) return `${k} must be one of ${vals.join(', ')}`;
  return null;
}

/** standard normal density and CDF */
export const phi = (z: number) => Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
export function Phi(z: number): number {
  // Abramowitz–Stegun 7.1.26 via erf; absolute error < 1.5e-7
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
/** inverse standard normal CDF (Acklam), relative error ~1e-9 */
export function PhiInv(p: number): number {
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -PhiInv(1 - p);
  const q = p - 0.5, r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
