// Small helpers shared by the Part VI figures.
import type { ReactNode } from 'react';
import './sd.css';

/** round for display: up to `d` decimals, no trailing zeros, no "-0" */
export const fx = (x: number, d = 2) => {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? 'NaN' : x > 0 ? '∞' : '−∞';
  const r = Math.round(x * 10 ** d) / 10 ** d;
  return (Object.is(r, -0) ? 0 : r).toString();
};
/** thousands separators */
export const fint = (x: number) => Math.round(x).toLocaleString('en-US');
/** money with enough precision for small per-request costs */
export const fusd = (x: number) => (x >= 100 ? '$' + fint(x) : x >= 1 ? '$' + x.toFixed(2) : '$' + Number(x.toPrecision(4)).toString());

/** cluster / series colours, all theme tokens */
export const PALETTE = ['var(--c-u)', 'var(--c-v)', 'var(--c-w)', 'var(--violet)', 'var(--c-err)', 'var(--warn)'];

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A labelled matrix block for the "A + B - C = D" rows. */
export function MatBlock({ children, shape }: { children: ReactNode; shape: string }) {
  return (
    <div className="sd-mat">
      {children}
      <span className="sd-shape">{shape}</span>
    </div>
  );
}

export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const isNumArr = (v: unknown, n?: number) => Array.isArray(v) && v.every(isNum) && (n === undefined || v.length === n);
