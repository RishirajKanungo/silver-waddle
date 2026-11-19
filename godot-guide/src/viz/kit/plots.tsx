// Data plots with real axes: line/scatter series and bar charts.
import { useId, type ReactNode } from 'react';

export interface Series {
  pts: [number, number][];
  color?: string;
  label?: string;
  dashed?: boolean;
  /** draw points instead of a line */
  scatter?: boolean;
  width?: number;
}

function ticks(lo: number, hi: number, target = 5): number[] {
  const raw = (hi - lo) / target;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const m = raw / p;
  const step = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(Math.round(v / step) * step);
  return out;
}
/** Tick labels: plain numbers normally; exponent form for very large/small values, with just
 *  enough digits that neighbouring ticks never print the same label. */
function tickLabels(vals: number[]): string[] {
  const maxAbs = Math.max(...vals.map(Math.abs));
  const expo = maxAbs !== 0 && (maxAbs >= 1e5 || maxAbs < 1e-3);
  for (let k = 0; k <= 6; k++) {
    const labels = vals.map((v) => (v === 0 ? '0' : expo ? v.toExponential(k) : String(Number(v.toFixed(Math.max(k, 0) + 4)))));
    if (new Set(labels).size === labels.length || k === 6) return labels;
  }
  return vals.map(String);
}

export function LinePlot({ series, x, y, width = 520, height = 260, xlabel, ylabel, logX, logY, vlines = [], hlines = [], legend = true, children }: { series: Series[]; /** true/'tl' top-left, 'tr', 'bl', 'br', or false */ x?: [number, number]; y?: [number, number]; width?: number; height?: number; xlabel?: string; ylabel?: string; logX?: boolean; logY?: boolean; vlines?: { x: number; color?: string; label?: string }[]; hlines?: { y: number; color?: string; label?: string }[]; legend?: boolean | 'tl' | 'tr' | 'bl' | 'br'; children?: (sx: (v: number) => number, sy: (v: number) => number) => ReactNode }) {
  const clipId = 'lp' + useId().replace(/:/g, '');
  const tx = (v: number) => (logX ? Math.log10(v) : v);
  const ty = (v: number) => (logY ? Math.log10(v) : v);
  const all = series.flatMap((s) => s.pts).filter(([a, b]) => Number.isFinite(tx(a)) && Number.isFinite(ty(b)));
  const xr = x ?? [Math.min(...all.map((p) => p[0])), Math.max(...all.map((p) => p[0]))];
  let yr = y ?? [Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[1]))];
  if (!y && yr[0] === yr[1]) yr = [yr[0] - 1, yr[1] + 1];
  if (!y && !logY) {
    const pad = (yr[1] - yr[0]) * 0.06;
    yr = [yr[0] - pad, yr[1] + pad];
  }
  const L = 48, R = 12, Tm = 12, B = 34;
  const X0 = tx(xr[0]), X1 = tx(xr[1]), Y0 = ty(yr[0]), Y1 = ty(yr[1]);
  const sx = (v: number) => L + ((tx(v) - X0) / (X1 - X0 || 1)) * (width - L - R);
  const sy = (v: number) => height - B - ((ty(v) - Y0) / (Y1 - Y0 || 1)) * (height - Tm - B);
  const xt = logX ? decades(xr) : ticks(xr[0], xr[1]);
  const yt = logY ? decades(yr) : ticks(yr[0], yr[1]);
  const xl = tickLabels(xt), yl = tickLabels(yt);
  const nLeg = series.filter((s) => s.label).length;
  const legW = 22 + 7 * Math.max(0, ...series.map((s) => s.label?.length ?? 0));
  const legendX = legend === 'tr' || legend === 'br' ? width - R - legW - 6 : L + 10;
  const legendY = legend === 'bl' || legend === 'br' ? height - B - 10 - (nLeg - 1) * 16 : Tm + 12;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="lineplot" style={{ maxWidth: width }}>
      <rect x={0} y={0} width={width} height={height} className="pl-bg" />
      {yt.map((v, i) => (
        <g key={'y' + v}>
          <line x1={L} x2={width - R} y1={sy(v)} y2={sy(v)} className="pl-grid" />
          <text x={L - 6} y={sy(v) + 4} textAnchor="end" className="pl-tick">
            {yl[i]}
          </text>
        </g>
      ))}
      {xt.map((v, i) => (
        <g key={'x' + v}>
          <line y1={Tm} y2={height - B} x1={sx(v)} x2={sx(v)} className="pl-grid" />
          <text x={sx(v)} y={height - B + 15} textAnchor={sx(v) > width - R - 18 ? 'end' : sx(v) < L + 10 ? 'start' : 'middle'} className="pl-tick">
            {xl[i]}
          </text>
        </g>
      ))}
      <line x1={L} x2={width - R} y1={height - B} y2={height - B} className="pl-axis" />
      <line x1={L} x2={L} y1={Tm} y2={height - B} className="pl-axis" />
      {xlabel && (
        <text x={(L + width - R) / 2} y={height - 4} textAnchor="middle" className="pl-axlabel">
          {xlabel}
        </text>
      )}
      {ylabel && (
        <text x={12} y={(Tm + height - B) / 2} textAnchor="middle" className="pl-axlabel" transform={`rotate(-90 12 ${(Tm + height - B) / 2})`}>
          {ylabel}
        </text>
      )}
      <clipPath id={clipId}>
        <rect x={L} y={Tm} width={width - L - R} height={height - Tm - B} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {hlines.map((h, i) => (
          <line key={'h' + i} x1={L} x2={width - R} y1={sy(h.y)} y2={sy(h.y)} style={{ stroke: h.color ?? 'var(--muted)', strokeDasharray: '4 4' }} />
        ))}
        {vlines.map((h, i) => (
          <line key={'v' + i} y1={Tm} y2={height - B} x1={sx(h.x)} x2={sx(h.x)} style={{ stroke: h.color ?? 'var(--muted)', strokeDasharray: '4 4' }} />
        ))}
        {series.map((s, i) =>
          s.scatter ? (
            <g key={i}>
              {s.pts.map(([a, b], j) => (
                <circle key={j} cx={sx(a)} cy={sy(b)} r={3.2} style={{ fill: s.color ?? 'var(--c-u)' }} />
              ))}
            </g>
          ) : (
            <path key={i} d={s.pts.filter(([a, b]) => Number.isFinite(tx(a)) && Number.isFinite(ty(b))).map(([a, b], j) => `${j ? 'L' : 'M'}${sx(a).toFixed(1)},${sy(b).toFixed(1)}`).join('')} style={{ stroke: s.color ?? 'var(--c-u)', strokeWidth: s.width ?? 2, fill: 'none', strokeDasharray: s.dashed ? '6 4' : undefined }} strokeLinejoin="round" />
          ),
        )}
        {children?.(sx, sy)}
      </g>
      {legend && series.some((s) => s.label) && (
        <g>
          {series
            .filter((s) => s.label)
            .map((s, i) => (
              <g key={i} transform={`translate(${legendX}, ${legendY + i * 16})`}>
                <line x1={0} x2={16} y1={0} y2={0} style={{ stroke: s.color ?? 'var(--c-u)', strokeWidth: 2.5, strokeDasharray: s.dashed ? '4 3' : undefined }} />
                <text x={22} y={4} className="pl-legend">
                  {s.label}
                </text>
              </g>
            ))}
        </g>
      )}
    </svg>
  );
}

function decades([lo, hi]: [number, number]): number[] {
  const out: number[] = [];
  for (let e = Math.ceil(Math.log10(lo) - 1e-9); e <= Math.floor(Math.log10(hi) + 1e-9); e++) out.push(10 ** e);
  const step = Math.ceil(out.length / 7);
  return out.filter((_, i) => i % step === 0);
}

export function Bars({ data, width = 520, height = 200, max, min = 0, fmt = (v: number) => String(Math.round(v * 1000) / 1000), ylabel }: { data: { label: string; value: number; color?: string; highlight?: boolean }[]; width?: number; height?: number; max?: number; min?: number; fmt?: (v: number) => string; ylabel?: string }) {
  const L = ylabel ? 26 : 8, B = 30, Tm = 18;
  const hi = max ?? Math.max(...data.map((d) => d.value), 1e-9);
  const lo = Math.min(min, ...data.map((d) => d.value));
  const bw = (width - L - 8) / data.length;
  const sy = (v: number) => height - B - ((v - lo) / (hi - lo || 1)) * (height - B - Tm);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="bars" style={{ maxWidth: width }}>
      <rect width={width} height={height} className="pl-bg" />
      <line x1={L} x2={width - 8} y1={sy(0)} y2={sy(0)} className="pl-axis" />
      {ylabel && (
        <text x={10} y={(Tm + height - B) / 2} textAnchor="middle" className="pl-axlabel" transform={`rotate(-90 10 ${(Tm + height - B) / 2})`}>
          {ylabel}
        </text>
      )}
      {data.map((d, i) => {
        const x = L + i * bw + bw * 0.14, w = bw * 0.72;
        const y0 = sy(0), y1 = sy(d.value);
        return (
          <g key={i}>
            <rect x={x} y={Math.min(y0, y1)} width={w} height={Math.abs(y1 - y0)} rx={2} style={{ fill: d.color ?? (d.highlight ? 'var(--accent)' : 'var(--c-u)'), opacity: d.highlight === false ? 0.45 : 1 }} />
            <text x={x + w / 2} y={(d.value >= 0 ? y1 - 5 : y1 + 13)} textAnchor="middle" className="pl-tick">
              {fmt(d.value)}
            </text>
            <text x={x + w / 2} y={height - 10} textAnchor="middle" className="pl-tick">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
