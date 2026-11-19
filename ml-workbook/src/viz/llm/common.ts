// Shared helpers for the Transformers & LLMs figures.
export const f2 = (x: number, d = 2) => {
  if (!Number.isFinite(x)) return x > 0 ? '∞' : x < 0 ? '−∞' : '·';
  const k = 10 ** d;
  const r = Math.round(x * k) / k;
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
};

/** numerically stable softmax; -Infinity entries get weight 0 */
export function softmax(xs: number[]): number[] {
  const m = Math.max(...xs.filter(Number.isFinite));
  const e = xs.map((x) => (Number.isFinite(x) ? Math.exp(x - m) : 0));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

export const entropy = (p: number[]) => -p.reduce((s, x) => s + (x > 0 ? x * Math.log(x) : 0), 0);

/** 6.74e9 → "6.74 B", 1.2e6 → "1.2 M" */
export function big(x: number, d = 3): string {
  const a = Math.abs(x);
  const units: [number, string][] = [[1e15, 'P'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'k']];
  for (const [v, u] of units) if (a >= v) return `${sig(x / v, d)} ${u}`;
  return sig(x, d);
}
/** scientific with TeX: 1.23 × 10^{9} */
export function sci(x: number, d = 3): string {
  if (x === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(x)));
  const m = x / 10 ** e;
  return `${sig(m, d)}\\times 10^{${e}}`;
}
export function sig(x: number, d = 3): string {
  if (x === 0) return '0';
  const p = d - 1 - Math.floor(Math.log10(Math.abs(x)));
  const k = 10 ** Math.max(0, p);
  return String(Math.round(x * k) / k);
}
/** bytes in binary units */
export function bytes(b: number): string {
  const units: [number, string][] = [[2 ** 40, 'TiB'], [2 ** 30, 'GiB'], [2 ** 20, 'MiB'], [2 ** 10, 'KiB']];
  for (const [v, u] of units) if (b >= v) return `${sig(b / v, 3)} ${u}`;
  return `${Math.round(b)} B`;
}

/** colours for up to 8 series/heads, all theme tokens */
export const PAL = [
  'var(--c-u)',
  'var(--c-v)',
  'var(--c-w)',
  'var(--c-k)',
  'var(--c-j)',
  'var(--warn)',
  'color-mix(in oklab, var(--c-u) 50%, var(--c-w))',
  'var(--muted)',
];

export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const isNumArr = (x: unknown, n?: number) => Array.isArray(x) && x.every((v) => typeof v === 'number') && (n === undefined || x.length === n);
export const isMat = (x: unknown) => Array.isArray(x) && x.length > 0 && x.every((r) => isNumArr(r, (x as unknown[][])[0].length));
