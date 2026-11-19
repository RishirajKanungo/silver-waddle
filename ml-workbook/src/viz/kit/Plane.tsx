// 2-D coordinate plane in SVG. Children draw in world coordinates via usePlane().
import { createContext, useContext, useMemo, useRef, useState, type ReactNode, type PointerEvent as RPE } from 'react';
import { contourSegments, niceLevels } from '../../math/contour';
import { renderTeX } from '../../ui/tex';
import type { Mat } from '../../math/linalg';

export type P2 = [number, number];

interface PlaneCtx {
  sx: (x: number) => number;
  sy: (y: number) => number;
  toWorld: (clientX: number, clientY: number) => P2;
  x: [number, number];
  y: [number, number];
  W: number;
  H: number;
  /** pixels per world unit (x) */
  k: number;
  id: string;
}
const Ctx = createContext<PlaneCtx | null>(null);
export const usePlane = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePlane outside <Plane>');
  return c;
};

let uid = 0;

function niceStep(range: number, target = 8) {
  const raw = range / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

export function Plane({
  x,
  y,
  width = 520,
  height,
  grid = true,
  axes = true,
  ticks = true,
  gridStep,
  children,
  className,
  ariaLabel,
  xLabel,
  yLabel,
}: {
  x: [number, number];
  y: [number, number];
  width?: number;
  /** defaults to equal aspect ratio */
  height?: number;
  grid?: boolean;
  axes?: boolean;
  ticks?: boolean;
  gridStep?: number;
  children?: ReactNode;
  className?: string;
  ariaLabel?: string;
  xLabel?: string;
  yLabel?: string;
}) {
  const W = width;
  const H = height ?? Math.round((W * (y[1] - y[0])) / (x[1] - x[0]));
  const svgRef = useRef<SVGSVGElement>(null);
  const [id] = useState(() => 'pl' + uid++);
  const ctx = useMemo<PlaneCtx>(() => {
    const sx = (v: number) => ((v - x[0]) / (x[1] - x[0])) * W;
    const sy = (v: number) => H - ((v - y[0]) / (y[1] - y[0])) * H;
    const toWorld = (cx: number, cy: number): P2 => {
      const svg = svgRef.current;
      if (!svg) return [0, 0];
      const pt = svg.createSVGPoint();
      pt.x = cx;
      pt.y = cy;
      const m = svg.getScreenCTM();
      if (!m) return [0, 0];
      const p = pt.matrixTransform(m.inverse());
      return [x[0] + (p.x / W) * (x[1] - x[0]), y[0] + ((H - p.y) / H) * (y[1] - y[0])];
    };
    return { sx, sy, toWorld, x, y, W, H, k: W / (x[1] - x[0]), id };
  }, [x[0], x[1], y[0], y[1], W, H, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = gridStep ?? niceStep(Math.max(x[1] - x[0], y[1] - y[0]), 10);
  const lines: ReactNode[] = [];
  if (grid) {
    for (let v = Math.ceil(x[0] / step) * step; v <= x[1] + 1e-9; v += step) lines.push(<line key={'gx' + v} x1={ctx.sx(v)} x2={ctx.sx(v)} y1={0} y2={H} className="pl-grid" />);
    for (let v = Math.ceil(y[0] / step) * step; v <= y[1] + 1e-9; v += step) lines.push(<line key={'gy' + v} y1={ctx.sy(v)} y2={ctx.sy(v)} x1={0} x2={W} className="pl-grid" />);
  }
  const tickEls: ReactNode[] = [];
  if (axes && ticks) {
    const tstep = niceStep(x[1] - x[0], 6);
    const fmtT = (v: number) => String(Math.round(v * 1000) / 1000);
    const ay = Math.min(Math.max(0, y[0]), y[1]);
    const ax = Math.min(Math.max(0, x[0]), x[1]);
    for (let v = Math.ceil(x[0] / tstep) * tstep; v <= x[1] + 1e-9; v += tstep) {
      if (Math.abs(v) < 1e-9 && ax === 0) continue;
      if (ctx.sx(v) < 10 || ctx.sx(v) > W - 10) continue;
      tickEls.push(
        <text key={'tx' + v} x={ctx.sx(v)} y={Math.min(H - 3, ctx.sy(ay) + 14)} className="pl-tick" textAnchor="middle">
          {fmtT(v)}
        </text>,
      );
    }
    const ystep = niceStep(y[1] - y[0], 6);
    for (let v = Math.ceil(y[0] / ystep) * ystep; v <= y[1] + 1e-9; v += ystep) {
      if (Math.abs(v) < 1e-9 && ay === 0) continue;
      if (ctx.sy(v) < 10 || ctx.sy(v) > H - 10) continue;
      tickEls.push(
        <text key={'ty' + v} x={Math.max(3, ctx.sx(ax) - 5)} y={ctx.sy(v) + 4} className="pl-tick" textAnchor={ctx.sx(ax) - 5 < 20 ? 'start' : 'end'}>
          {fmtT(v)}
        </text>,
      );
    }
  }
  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className={'plane ' + (className ?? '')} role="img" aria-label={ariaLabel} style={{ maxWidth: W }}>
      <defs>
        <clipPath id={id + '-clip'}>
          <rect x={0} y={0} width={W} height={H} />
        </clipPath>
      </defs>
      <rect x={0} y={0} width={W} height={H} className="pl-bg" />
      <g>{lines}</g>
      {axes && (
        <g>
          {y[0] <= 0 && y[1] >= 0 && <line x1={0} x2={W} y1={ctx.sy(0)} y2={ctx.sy(0)} className="pl-axis" />}
          {x[0] <= 0 && x[1] >= 0 && <line y1={0} y2={H} x1={ctx.sx(0)} x2={ctx.sx(0)} className="pl-axis" />}
          {tickEls}
          {xLabel && (
            <text x={W - 6} y={Math.min(H - 6, ctx.sy(Math.max(0, y[0])) - 6)} textAnchor="end" className="pl-axlabel">
              {xLabel}
            </text>
          )}
          {yLabel && (
            <text x={Math.max(6, ctx.sx(Math.max(0, x[0])) + 6)} y={14} className="pl-axlabel">
              {yLabel}
            </text>
          )}
        </g>
      )}
      <Ctx.Provider value={ctx}>
        <g clipPath={`url(#${id}-clip)`}>{children}</g>
      </Ctx.Provider>
    </svg>
  );
}

// ------------------------------------------------------------------ elements

type Col = string; // CSS color, usually var(--c-u)

export function Arrow({ from = [0, 0], to, color = 'var(--c-u)', width = 2.5, label, tex, labelAt = 0.6, dashed, opacity = 1, head = true }: { from?: P2; to: P2; color?: Col; width?: number; label?: string; tex?: string; labelAt?: number; dashed?: boolean; opacity?: number; head?: boolean }) {
  const { sx, sy } = usePlane();
  const x1 = sx(from[0]), y1 = sy(from[1]), x2 = sx(to[0]), y2 = sy(to[1]);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const hl = Math.min(12, len * 0.45);
  const ux = len ? (x2 - x1) / len : 0, uy = len ? (y2 - y1) / len : 0;
  const bx = x2 - ux * hl, by = y2 - uy * hl;
  const nx = -uy * hl * 0.45, ny = ux * hl * 0.45;
  const lx = x1 + (x2 - x1) * labelAt - uy * 14, ly = y1 + (y2 - y1) * labelAt + ux * 14;
  return (
    <g style={{ opacity }}>
      <line x1={x1} y1={y1} x2={head ? bx : x2} y2={head ? by : y2} style={{ stroke: color, strokeWidth: width, strokeDasharray: dashed ? '6 5' : undefined }} strokeLinecap="round" />
      {head && len > 2 && <polygon points={`${x2},${y2} ${bx + nx},${by + ny} ${bx - nx},${by - ny}`} style={{ fill: color }} />}
      {(label || tex) && <SvgLabel x={lx} y={ly} text={label} tex={tex} color={color} />}
    </g>
  );
}

export function SvgLabel({ x, y, text, tex, color = 'var(--fg)', anchor = 'middle', size }: { x: number; y: number; text?: string; tex?: string; color?: Col; anchor?: 'start' | 'middle' | 'end'; size?: number }) {
  if (tex) {
    const w = 160, h = 34;
    const left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    return (
      <foreignObject x={left} y={y - h / 2} width={w} height={h} style={{ overflow: 'visible', pointerEvents: 'none' }}>
        <div className={'pl-tex anchor-' + anchor} style={{ color }} dangerouslySetInnerHTML={{ __html: renderTeX(tex) }} />
      </foreignObject>
    );
  }
  return (
    <text x={x} y={y + 4} textAnchor={anchor} className="pl-label" style={{ fill: color, fontSize: size }}>
      {text}
    </text>
  );
}

export function Label({ at, text, tex, color, anchor = 'middle', dx = 0, dy = 0 }: { at: P2; text?: string; tex?: string; color?: Col; anchor?: 'start' | 'middle' | 'end'; dx?: number; dy?: number }) {
  const { sx, sy } = usePlane();
  return <SvgLabel x={sx(at[0]) + dx} y={sy(at[1]) - dy} text={text} tex={tex} color={color} anchor={anchor} />;
}

export function Point({ at, r = 4.5, color = 'var(--fg)', label, tex, hollow }: { at: P2; r?: number; color?: Col; label?: string; tex?: string; hollow?: boolean }) {
  const { sx, sy } = usePlane();
  return (
    <g>
      <circle cx={sx(at[0])} cy={sy(at[1])} r={r} style={{ fill: hollow ? 'var(--surface)' : color, stroke: color, strokeWidth: 2 }} />
      {(label || tex) && <SvgLabel x={sx(at[0]) + 10} y={sy(at[1]) - 12} text={label} tex={tex} color={color} anchor="start" />}
    </g>
  );
}

export function Seg({ a, b, color = 'var(--muted)', width = 1.5, dashed, opacity = 1 }: { a: P2; b: P2; color?: Col; width?: number; dashed?: boolean; opacity?: number }) {
  const { sx, sy } = usePlane();
  return <line x1={sx(a[0])} y1={sy(a[1])} x2={sx(b[0])} y2={sy(b[1])} style={{ stroke: color, strokeWidth: width, strokeDasharray: dashed ? '5 4' : undefined, opacity }} strokeLinecap="round" />;
}

/** Infinite line through p with direction d, clipped to the plane */
export function InfLine({ p = [0, 0], d, color = 'var(--muted)', width = 1.5, dashed, opacity = 1 }: { p?: P2; d: P2; color?: Col; width?: number; dashed?: boolean; opacity?: number }) {
  const { x, y } = usePlane();
  const L = 4 * Math.max(x[1] - x[0], y[1] - y[0]);
  const n = Math.hypot(d[0], d[1]) || 1;
  const u: P2 = [d[0] / n, d[1] / n];
  return <Seg a={[p[0] - u[0] * L, p[1] - u[1] * L]} b={[p[0] + u[0] * L, p[1] + u[1] * L]} color={color} width={width} dashed={dashed} opacity={opacity} />;
}

export function Poly({ pts, fill = 'var(--c-u)', fillOpacity = 0.18, stroke, width = 1.5, dashed }: { pts: P2[]; fill?: Col; fillOpacity?: number; stroke?: Col; width?: number; dashed?: boolean }) {
  const { sx, sy } = usePlane();
  return <polygon points={pts.map((p) => `${sx(p[0])},${sy(p[1])}`).join(' ')} style={{ fill, fillOpacity, stroke: stroke ?? 'none', strokeWidth: width, strokeDasharray: dashed ? '5 4' : undefined }} />;
}

export function Path({ pts, color = 'var(--c-u)', width = 2, dashed, closed, opacity = 1, fill }: { pts: P2[]; color?: Col; width?: number; dashed?: boolean; closed?: boolean; opacity?: number; fill?: Col }) {
  const { sx, sy } = usePlane();
  if (pts.length < 2) return null;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(2)},${sy(p[1]).toFixed(2)}`).join('') + (closed ? 'Z' : '');
  return <path d={d} style={{ stroke: color, strokeWidth: width, fill: fill ?? 'none', strokeDasharray: dashed ? '6 5' : undefined, opacity }} strokeLinejoin="round" strokeLinecap="round" />;
}

/** y = f(x) */
export function Curve({ f, x0, x1, color = 'var(--c-u)', width = 2.2, samples = 240, dashed, opacity }: { f: (x: number) => number; x0?: number; x1?: number; color?: Col; width?: number; samples?: number; dashed?: boolean; opacity?: number }) {
  const { x, y } = usePlane();
  const a = x0 ?? x[0], b = x1 ?? x[1];
  const span = y[1] - y[0];
  const runs: P2[][] = [[]];
  for (let i = 0; i <= samples; i++) {
    const t = a + ((b - a) * i) / samples;
    const v = f(t);
    if (!Number.isFinite(v) || v > y[1] + 3 * span || v < y[0] - 3 * span) {
      if (runs[runs.length - 1].length) runs.push([]);
      continue;
    }
    runs[runs.length - 1].push([t, v]);
  }
  return (
    <g>
      {runs.map((r, i) => (
        <Path key={i} pts={r} color={color} width={width} dashed={dashed} opacity={opacity} />
      ))}
    </g>
  );
}

/** (x(t), y(t)) */
export function ParamCurve({ f, t0 = 0, t1 = 2 * Math.PI, samples = 200, color = 'var(--c-u)', width = 2, closed, fill, fillOpacity = 0.15, dashed }: { f: (t: number) => P2; t0?: number; t1?: number; samples?: number; color?: Col; width?: number; closed?: boolean; fill?: Col; fillOpacity?: number; dashed?: boolean }) {
  const pts = Array.from({ length: samples + 1 }, (_, i) => f(t0 + ((t1 - t0) * i) / samples));
  return (
    <g>
      {fill && <Poly pts={pts} fill={fill} fillOpacity={fillOpacity} />}
      <Path pts={pts} color={color} width={width} closed={closed} dashed={dashed} />
    </g>
  );
}

/** Image of the integer grid under a 2×2 matrix M (columns are where î and ĵ land). */
export function TGrid({ M, extent = 6, step = 1, color = 'var(--c-grid-t)', width = 1, opacity = 1 }: { M: Mat; extent?: number; step?: number; color?: Col; width?: number; opacity?: number }) {
  const ap = (p: P2): P2 => [M[0][0] * p[0] + M[0][1] * p[1], M[1][0] * p[0] + M[1][1] * p[1]];
  const els: ReactNode[] = [];
  for (let k = -extent; k <= extent; k += step) {
    els.push(<Seg key={'a' + k} a={ap([k, -extent])} b={ap([k, extent])} color={color} width={k === 0 ? width * 1.8 : width} opacity={opacity} />);
    els.push(<Seg key={'b' + k} a={ap([-extent, k])} b={ap([extent, k])} color={color} width={k === 0 ? width * 1.8 : width} opacity={opacity} />);
  }
  return <g>{els}</g>;
}

export function Contours({ f, levels, color = 'var(--c-contour)', width = 1.2, n = 70 }: { f: (x: number, y: number) => number; levels?: number[]; color?: Col; width?: number; n?: number }) {
  const { x, y, sx, sy } = usePlane();
  const lv = useMemo(() => levels ?? niceLevels(f, x[0], x[1], y[0], y[1], 10), [f, levels, x, y]);
  const paths = useMemo(
    () =>
      lv.map((L) =>
        contourSegments(f, x[0], x[1], y[0], y[1], L, n)
          .map(([a, b]) => `M${sx(a[0]).toFixed(1)},${sy(a[1]).toFixed(1)}L${sx(b[0]).toFixed(1)},${sy(b[1]).toFixed(1)}`)
          .join(''),
      ),
    [f, lv, x, y, n, sx, sy],
  );
  return (
    <g>
      {paths.map((d, i) => (
        <path key={i} d={d} style={{ stroke: color, strokeWidth: width, fill: 'none', opacity: 0.35 + (0.65 * (lv.length - i)) / lv.length }} />
      ))}
    </g>
  );
}

/** Coarse raster of f, colored by a diverging or sequential map. */
export function Heat({ f, res = 48, range, scheme = 'seq', opacity = 0.55 }: { f: (x: number, y: number) => number; res?: number; range?: [number, number]; scheme?: 'seq' | 'div' | 'class'; opacity?: number }) {
  const { x, y, sx, sy } = usePlane();
  const cells = useMemo(() => {
    const out: { x: number; y: number; w: number; h: number; v: number }[] = [];
    const dx = (x[1] - x[0]) / res, dy = (y[1] - y[0]) / res;
    for (let i = 0; i < res; i++)
      for (let j = 0; j < res; j++) {
        const cx = x[0] + (j + 0.5) * dx, cy = y[0] + (i + 0.5) * dy;
        out.push({ x: sx(cx - dx / 2), y: sy(cy + dy / 2), w: sx(cx + dx / 2) - sx(cx - dx / 2) + 0.5, h: sy(cy - dy / 2) - sy(cy + dy / 2) + 0.5, v: f(cx, cy) });
      }
    return out;
  }, [f, res, x, y, sx, sy]);
  const vals = cells.map((c) => c.v).filter(Number.isFinite);
  const lo = range?.[0] ?? Math.min(...vals), hi = range?.[1] ?? Math.max(...vals);
  return (
    <g style={{ opacity }}>
      {cells.map((c, i) => (
        <rect key={i} x={c.x} y={c.y} width={c.w} height={c.h} style={{ fill: colorMap((c.v - lo) / (hi - lo || 1), scheme) }} />
      ))}
    </g>
  );
}

export function colorMap(t: number, scheme: 'seq' | 'div' | 'class' = 'seq'): string {
  t = Math.max(0, Math.min(1, t));
  if (scheme === 'div' || scheme === 'class') {
    // blue (0) — neutral (0.5) — orange (1), using theme tokens mixed in OKLab
    const a = t < 0.5 ? 'var(--c-neg)' : 'var(--c-pos)';
    const pct = Math.round(Math.abs(t - 0.5) * 200);
    return `color-mix(in oklab, ${a} ${pct}%, var(--surface))`;
  }
  return `color-mix(in oklab, var(--c-seq) ${Math.round(t * 100)}%, var(--surface))`;
}

export function Field({ f, step = 1, scaleBy = 0.35, color = 'var(--muted)' }: { f: (x: number, y: number) => P2; step?: number; scaleBy?: number; color?: Col }) {
  const { x, y } = usePlane();
  const els: ReactNode[] = [];
  for (let a = Math.ceil(x[0] / step) * step; a <= x[1]; a += step)
    for (let b = Math.ceil(y[0] / step) * step; b <= y[1]; b += step) {
      const [u, v] = f(a, b);
      const n = Math.hypot(u, v);
      if (!Number.isFinite(n) || n < 1e-9) continue;
      const len = Math.min(step * 0.8, n * scaleBy);
      els.push(<Arrow key={a + ',' + b} from={[a, b]} to={[a + (u / n) * len, b + (v / n) * len]} color={color} width={1.2} />);
    }
  return <g>{els}</g>;
}

// ------------------------------------------------------------------ dragging

/** A draggable point. Snaps to `snap` (world units) unless Alt is held. */
/** `label` is the accessible name only; pass `text` or `tex` to also draw a visible label. */
export function Handle({ at, onChange, color = 'var(--c-u)', r = 6, snap = 0, label, text, tex, bounds }: { at: P2; onChange: (p: P2) => void; color?: Col; r?: number; snap?: number; label?: string; text?: string; tex?: string; bounds?: { x: [number, number]; y: [number, number] } }) {
  const { sx, sy, toWorld, x, y } = usePlane();
  const [drag, setDrag] = useState(false);
  const clamp = (v: number, [lo, hi]: [number, number]) => Math.max(lo, Math.min(hi, v));
  const move = (e: RPE<SVGCircleElement>) => {
    if (!drag) return;
    let [wx, wy] = toWorld(e.clientX, e.clientY);
    if (snap && !e.altKey) {
      wx = Math.round(wx / snap) * snap;
      wy = Math.round(wy / snap) * snap;
    }
    const bx = bounds?.x ?? x, by = bounds?.y ?? y;
    onChange([clamp(wx, bx), clamp(wy, by)]);
  };
  const key = (e: React.KeyboardEvent) => {
    const s = snap || (x[1] - x[0]) / 40;
    const d: Record<string, P2> = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] };
    if (d[e.key]) {
      e.preventDefault();
      onChange([at[0] + d[e.key][0], at[1] + d[e.key][1]]);
    }
  };
  return (
    <g className={'handle' + (drag ? ' dragging' : '')}>
      <circle cx={sx(at[0])} cy={sy(at[1])} r={r + 9} className="handle-hit" onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); setDrag(true); }} onPointerMove={move} onPointerUp={() => setDrag(false)} onPointerCancel={() => setDrag(false)} tabIndex={0} onKeyDown={key} role="slider" aria-label={label ?? tex ?? 'draggable point'} aria-valuetext={`(${at[0].toFixed(2)}, ${at[1].toFixed(2)})`} />
      <circle cx={sx(at[0])} cy={sy(at[1])} r={r} className="handle-dot" style={{ fill: color }} pointerEvents="none" />
      {(text || tex) && <SvgLabel x={sx(at[0]) + 12} y={sy(at[1]) - 14} text={text} tex={tex} color={color} anchor="start" />}
    </g>
  );
}
