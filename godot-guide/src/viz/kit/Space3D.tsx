// Minimal 3-D scene: orthographic projection, drag to rotate. Good enough for spans, planes,
// null spaces, projections onto planes and least-squares pictures.
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { SvgLabel } from './Plane';

export type P3 = [number, number, number];
interface Ctx3 {
  proj: (p: P3) => [number, number];
  depth: (p: P3) => number;
  W: number;
  H: number;
  R: number;
}
const C3 = createContext<Ctx3 | null>(null);
export const useSpace = () => {
  const c = useContext(C3);
  if (!c) throw new Error('useSpace outside <Space3D>');
  return c;
};

export function Space3D({ range = 4, width = 480, height = 400, yaw0 = -0.7, pitch0 = 0.45, axes = true, floor = true, children, label = '3-D view' }: { range?: number; width?: number; height?: number; yaw0?: number; pitch0?: number; axes?: boolean; floor?: boolean; children?: ReactNode; label?: string }) {
  const [yaw, setYaw] = useState(yaw0);
  const [pitch, setPitch] = useState(pitch0);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const W = width, H = height;
  const ctx = useMemo<Ctx3>(() => {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const s = (Math.min(W, H) * 0.42) / range;
    // math convention: z up. Rotate about z by yaw, then tilt by pitch.
    const rot = ([x, y, z]: P3): P3 => {
      const x1 = cy * x - sy * y, y1 = sy * x + cy * y;
      return [x1, cp * y1 - sp * z, sp * y1 + cp * z];
    };
    return {
      proj: (p) => {
        const [a, , c] = rot(p);
        return [W / 2 + a * s, H / 2 - c * s];
      },
      depth: (p) => rot(p)[1],
      W,
      H,
      R: range,
    };
  }, [yaw, pitch, W, H, range]);
  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, yaw, pitch };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setYaw(d.yaw + (e.clientX - d.x) * 0.01);
    setPitch(Math.max(-1.45, Math.min(1.45, d.pitch + (e.clientY - d.y) * 0.01)));
  };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setYaw((v) => v - 0.1);
    else if (e.key === 'ArrowRight') setYaw((v) => v + 0.1);
    else if (e.key === 'ArrowUp') setPitch((v) => Math.min(1.45, v + 0.1));
    else if (e.key === 'ArrowDown') setPitch((v) => Math.max(-1.45, v - 0.1));
    else return;
    e.preventDefault();
  };
  const R = range;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="space3d" style={{ maxWidth: W }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)} tabIndex={0} onKeyDown={key} role="img" aria-label={label + ' (drag or use arrow keys to rotate)'}>
      <rect width={W} height={H} className="pl-bg" />
      <C3.Provider value={ctx}>
        {floor && <Floor R={R} />}
        {axes && (
          <g>
            <Seg3 a={[-R, 0, 0]} b={[R, 0, 0]} color="var(--axis)" width={1.2} />
            <Seg3 a={[0, -R, 0]} b={[0, R, 0]} color="var(--axis)" width={1.2} />
            <Seg3 a={[0, 0, -R]} b={[0, 0, R]} color="var(--axis)" width={1.2} />
            <Label3 at={[R * 1.06, 0, 0]} text="x" color="var(--muted)" />
            <Label3 at={[0, R * 1.06, 0]} text="y" color="var(--muted)" />
            <Label3 at={[0, 0, R * 1.06]} text="z" color="var(--muted)" />
          </g>
        )}
        {children}
      </C3.Provider>
      <text x={W - 8} y={H - 8} textAnchor="end" className="pl-tick">
        drag to rotate
      </text>
    </svg>
  );
}

function Floor({ R }: { R: number }) {
  const els: ReactNode[] = [];
  for (let k = -R; k <= R; k++) {
    els.push(<Seg3 key={'a' + k} a={[k, -R, 0]} b={[k, R, 0]} color="var(--grid)" width={0.8} />);
    els.push(<Seg3 key={'b' + k} a={[-R, k, 0]} b={[R, k, 0]} color="var(--grid)" width={0.8} />);
  }
  return <g>{els}</g>;
}

export function Seg3({ a, b, color = 'var(--muted)', width = 1.5, dashed, opacity = 1 }: { a: P3; b: P3; color?: string; width?: number; dashed?: boolean; opacity?: number }) {
  const { proj } = useSpace();
  const [x1, y1] = proj(a), [x2, y2] = proj(b);
  return <line x1={x1} y1={y1} x2={x2} y2={y2} style={{ stroke: color, strokeWidth: width, strokeDasharray: dashed ? '5 4' : undefined, opacity }} strokeLinecap="round" />;
}

export function Arrow3({ from = [0, 0, 0], to, color = 'var(--c-u)', width = 2.5, label, tex }: { from?: P3; to: P3; color?: string; width?: number; label?: string; tex?: string }) {
  const { proj } = useSpace();
  const [x1, y1] = proj(from), [x2, y2] = proj(to);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const hl = Math.min(11, len * 0.45);
  const ux = len ? (x2 - x1) / len : 0, uy = len ? (y2 - y1) / len : 0;
  const bx = x2 - ux * hl, by = y2 - uy * hl;
  const nx = -uy * hl * 0.45, ny = ux * hl * 0.45;
  return (
    <g>
      <line x1={x1} y1={y1} x2={bx} y2={by} style={{ stroke: color, strokeWidth: width }} strokeLinecap="round" />
      {len > 2 && <polygon points={`${x2},${y2} ${bx + nx},${by + ny} ${bx - nx},${by - ny}`} style={{ fill: color }} />}
      {(label || tex) && <SvgLabel x={x2 + 12} y={y2 - 10} text={label} tex={tex} color={color} anchor="start" />}
    </g>
  );
}

export function Point3({ at, color = 'var(--fg)', r = 4, label }: { at: P3; color?: string; r?: number; label?: string }) {
  const { proj } = useSpace();
  const [x, y] = proj(at);
  return (
    <g>
      <circle cx={x} cy={y} r={r} style={{ fill: color }} />
      {label && <SvgLabel x={x + 9} y={y - 10} text={label} color={color} anchor="start" />}
    </g>
  );
}

/** Filled polygon (e.g. a patch of a plane) */
export function Poly3({ pts, fill = 'var(--c-u)', opacity = 0.18, stroke }: { pts: P3[]; fill?: string; opacity?: number; stroke?: string }) {
  const { proj } = useSpace();
  return <polygon points={pts.map((p) => proj(p).join(',')).join(' ')} style={{ fill, fillOpacity: opacity, stroke: stroke ?? 'none', strokeWidth: 1 }} />;
}

/** Patch of the plane spanned by u, v (through the origin), parameters in [-s, s] */
export function PlanePatch({ u, v, s = 3, fill = 'var(--c-u)', opacity = 0.16, grid = true }: { u: P3; v: P3; s?: number; fill?: string; opacity?: number; grid?: boolean }) {
  const at = (a: number, b: number): P3 => [a * u[0] + b * v[0], a * u[1] + b * v[1], a * u[2] + b * v[2]];
  const lines: ReactNode[] = [];
  if (grid)
    for (let k = -s; k <= s; k++) {
      lines.push(<Seg3 key={'u' + k} a={at(k, -s)} b={at(k, s)} color={fill} width={0.7} opacity={0.45} />);
      lines.push(<Seg3 key={'v' + k} a={at(-s, k)} b={at(s, k)} color={fill} width={0.7} opacity={0.45} />);
    }
  return (
    <g>
      <Poly3 pts={[at(-s, -s), at(s, -s), at(s, s), at(-s, s)]} fill={fill} opacity={opacity} />
      {lines}
    </g>
  );
}

export function Line3({ d, p = [0, 0, 0], color = 'var(--c-u)', width = 2, R = 6, dashed }: { d: P3; p?: P3; color?: string; width?: number; R?: number; dashed?: boolean }) {
  const n = Math.hypot(...d) || 1;
  const u: P3 = [d[0] / n, d[1] / n, d[2] / n];
  return <Seg3 a={[p[0] - u[0] * R, p[1] - u[1] * R, p[2] - u[2] * R]} b={[p[0] + u[0] * R, p[1] + u[1] * R, p[2] + u[2] * R]} color={color} width={width} dashed={dashed} />;
}

export function Label3({ at, text, tex, color = 'var(--fg)' }: { at: P3; text?: string; tex?: string; color?: string }) {
  const { proj } = useSpace();
  const [x, y] = proj(at);
  return <SvgLabel x={x} y={y} text={text} tex={tex} color={color} />;
}
