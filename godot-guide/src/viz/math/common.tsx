// Shared helpers for the math.* figures: vector maths in Godot's y-down screen convention,
// a Plane wrapper that shows Godot coordinates (y grows downward), sprite images for SVG figures,
// and small canvas drawing helpers.
import type { ReactNode } from 'react';
import { Plane, usePlane, type P2 } from '../kit';
import { sheetCanvas, SHEETS } from '../../art';
import './math.css';

export type V = [number, number];

export const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: V, s: number): V => [a[0] * s, a[1] * s];
export const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1];
/** Godot's Vector2.cross: a.x * b.y - a.y * b.x. With y down, positive means b is clockwise from a on screen. */
export const cross = (a: V, b: V) => a[0] * b[1] - a[1] * b[0];
export const len = (a: V) => Math.hypot(a[0], a[1]);
export const norm = (a: V): V => {
  const l = len(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l] : [0, 0];
};
export const rot = (a: V, ang: number): V => [a[0] * Math.cos(ang) - a[1] * Math.sin(ang), a[0] * Math.sin(ang) + a[1] * Math.cos(ang)];
export const lerpV = (a: V, b: V, t: number): V => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
export const deg = (r: number) => (r * 180) / Math.PI;
export const rad = (d: number) => (d * Math.PI) / 180;

/** Format a number the way Godot prints floats in an example: trims to d decimals. */
export function f(x: number, d = 2) {
  if (!Number.isFinite(x)) return String(x);
  const s = x.toFixed(d);
  return s === '-' + (0).toFixed(d) ? (0).toFixed(d) : s;
}
/** GDScript float literal: always has a decimal point. */
export function gf(x: number, d = 1) {
  const s = f(x, d);
  return s.includes('.') ? s : s + '.0';
}
export const vs = (v: V, d = 2) => `(${f(v[0], d)}, ${f(v[1], d)})`;
export const gv = (v: V, d = 1) => `Vector2(${gf(v[0], d)}, ${gf(v[1], d)})`;

// ------------------------------------------------------------------ Plane in Godot coordinates

/** Godot point (y down) to Plane point (y up). */
export const P = (v: V): P2 => [v[0], -v[1]];
/** Plane point back to Godot point. */
export const G = (p: P2): V => [p[0], -p[1]];

/** Tick labels for a Plane that displays Godot coordinates: y labels are negated so they grow downward. */
function GTicks({ step }: { step: number }) {
  const { x, y, sx, sy, W, H } = usePlane();
  const els: ReactNode[] = [];
  const ax = clamp(0, x[0], x[1]), ay = clamp(0, y[0], y[1]);
  for (let v = Math.ceil(x[0] / step) * step; v <= x[1] + 1e-9; v += step) {
    if (Math.abs(v) < 1e-9 || sx(v) < 10 || sx(v) > W - 10) continue;
    els.push(
      <text key={'x' + v} x={sx(v)} y={Math.min(H - 3, sy(ay) + 14)} className="pl-tick" textAnchor="middle">
        {Math.round(v * 100) / 100}
      </text>,
    );
  }
  for (let v = Math.ceil(y[0] / step) * step; v <= y[1] + 1e-9; v += step) {
    if (Math.abs(v) < 1e-9 || sy(v) < 10 || sy(v) > H - 10) continue;
    els.push(
      <text key={'y' + v} x={sx(ax) - 5} y={sy(v) + 4} className="pl-tick" textAnchor="end">
        {Math.round(-v * 100) / 100}
      </text>,
    );
  }
  return (
    <g>
      {els}
      <text x={W - 6} y={Math.min(H - 6, sy(ay) - 6)} textAnchor="end" className="pl-axlabel">
        x →
      </text>
      <text x={sx(ax) + 6} y={H - 8} className="pl-axlabel">
        y ↓ (Godot)
      </text>
    </g>
  );
}

/** A Plane whose ranges are given in Godot coordinates (y down). Children use P() to place points. */
export function GPlane({ x, y, width = 520, height, step = 1, gridStep, children, ariaLabel }: { x: [number, number]; y: [number, number]; width?: number; height?: number; step?: number; gridStep?: number; children?: ReactNode; ariaLabel?: string }) {
  return (
    <Plane x={x} y={[-y[1], -y[0]]} width={width} height={height} ticks={false} gridStep={gridStep ?? step} ariaLabel={ariaLabel}>
      {children}
      <GTicks step={step} />
    </Plane>
  );
}

// ------------------------------------------------------------------ sprites in SVG

const urlCache = new Map<string, string>();
/** A data URL of one frame of a sheet (placeholder box until the art exists). */
export function spriteURL(id: string, frame: number): string {
  const key = id + ':' + frame;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const def = SHEETS[id];
  const fw = def?.frameW ?? 16, fh = def?.frameH ?? 16, cols = def?.cols ?? 1;
  const c = document.createElement('canvas');
  c.width = fw;
  c.height = fh;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(sheetCanvas(id), (frame % cols) * fw, Math.floor(frame / cols) * fh, fw, fh, 0, 0, fw, fh);
  const url = c.toDataURL();
  urlCache.set(key, url);
  return url;
}
/** Frame size and origin (feet) of a sheet, with defaults for missing art. */
export function sheetInfo(id: string) {
  const def = SHEETS[id];
  const fw = def?.frameW ?? 32, fh = def?.frameH ?? 32;
  return { fw, fh, origin: (def?.origin ?? [fw / 2, fh - 2]) as V };
}

// ------------------------------------------------------------------ canvas helpers

export function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width = 1, head = 4) {
  const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy);
  if (l < 0.5) return;
  const ux = dx / l, uy = dy / l;
  const h = Math.min(head, l * 0.5);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2 - ux * h * 0.8, y2 - uy * h * 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - ux * h - uy * h * 0.55, y2 - uy * h + ux * h * 0.55);
  ctx.lineTo(x2 - ux * h + uy * h * 0.55, y2 - uy * h - ux * h * 0.55);
  ctx.closePath();
  ctx.fill();
}

export function dashed(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, dash = 3) {
  ctx.save();
  ctx.setLineDash([dash, dash]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

/** Fill a 320×180 game screen with grass tiles (or a flat colour while the tileset is missing). */
export function grass(ctx: CanvasRenderingContext2D, drawFrame: (ctx: CanvasRenderingContext2D, id: string, frame: number, x: number, y: number) => void, w = 320, h = 180, ox = 0, oy = 0) {
  ctx.fillStyle = '#5a8f4e';
  ctx.fillRect(0, 0, w, h);
  const tiles = SHEETS['tiles_overworld'];
  if (!tiles) return;
  const g = [tiles.tiles?.grass ?? 0, tiles.tiles?.grass2 ?? tiles.tiles?.grass ?? 0, tiles.tiles?.grass3 ?? tiles.tiles?.grass ?? 0];
  const sx = Math.floor(ox / 16), sy = Math.floor(oy / 16);
  for (let ty = sy - 1; ty * 16 - oy < h; ty++)
    for (let tx = sx - 1; tx * 16 - ox < w; tx++) {
      const i = (((tx * 7 + ty * 13) % 3) + 3) % 3;
      drawFrame(ctx, 'tiles_overworld', g[i], Math.round(tx * 16 - ox), Math.round(ty * 16 - oy));
    }
}

/** Width in game pixels of a string drawn with text() (bitmap font when present). */
export const textW = (s: string) => (SHEETS['font_pixel']?.frameW ?? 5) * s.length;

/** Panel in the corner of a game screen for live numbers. */
export function hudBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x, y, w, h);
}

/** A HUD panel sized to its lines. align 'right' puts it against the right edge at x. Returns nothing. */
export function hud(ctx: CanvasRenderingContext2D, lines: [string, string][], x: number, y: number, align: 'left' | 'right', drawText: (ctx: CanvasRenderingContext2D, s: string, x: number, y: number, c: string) => void) {
  const w = Math.max(...lines.map(([s]) => textW(s))) + 6;
  const h = lines.length * 10 + 4;
  const left = align === 'right' ? x - w : x;
  hudBox(ctx, left, y, w, h);
  lines.forEach(([s, c], i) => drawText(ctx, s, left + 3, y + 10 + i * 10, c));
}

/** A sprite frame drawn inside a Plane at a Plane-space point (feet on the point), scaled by k screen px per sprite px. */
export function PlaneSprite({ at, id, frame, k = 2, sx = 1, sy = 1, flip = false, opacity = 1 }: { at: [number, number]; id: string; frame: number; k?: number; sx?: number; sy?: number; flip?: boolean; opacity?: number }) {
  const pl = usePlane();
  const { fw, fh, origin } = sheetInfo(id);
  const X = pl.sx(at[0]), Y = pl.sy(at[1]);
  const m = `matrix(${k * sx * (flip ? -1 : 1)},0,0,${k * sy},${X},${Y})`;
  return <image href={spriteURL(id, frame)} x={-origin[0]} y={-origin[1]} width={fw} height={fh} transform={m} className="math-sprite" style={{ imageRendering: 'pixelated', opacity }} />;
}
