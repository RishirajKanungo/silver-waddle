// Small helpers shared by the geom figures: SVG dragging in viewBox coordinates, and geometry used
// by more than one figure (ray against an axis-aligned box, oriented boxes).
import { useRef } from 'react';
import { SHEETS, drawFrame } from '../../art';

export type V2 = [number, number];

export const add = (a: V2, b: V2): V2 => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: V2, k: number): V2 => [a[0] * k, a[1] * k];
export const dot = (a: V2, b: V2) => a[0] * b[0] + a[1] * b[1];
export const len = (a: V2) => Math.hypot(a[0], a[1]);
export const norm = (a: V2): V2 => {
  const l = len(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l] : [0, 0];
};
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const f1 = (v: number) => (Math.abs(v) < 0.05 ? '0' : v.toFixed(1));
export const f2 = (v: number) => (Math.abs(v) < 0.005 ? '0' : v.toFixed(2));
export const vec = (v: V2, f = f1) => `(${f(v[0])}, ${f(v[1])})`;

/** Godot's Vector2.bounce(n): reflect a velocity off a surface with unit normal n. */
export const bounce = (v: V2, n: V2): V2 => sub(v, mul(n, 2 * dot(v, n)));
/** Godot's Vector2.slide(n): remove the part of v that points into the surface. */
export const slide = (v: V2, n: V2): V2 => sub(v, mul(n, dot(v, n)));

/** An axis-aligned box as Godot's Rect2: top-left position and size, y grows downward. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Segment from p along d (t in [0, tMax]) against a box, slab method. Returns the entry t and the
 * surface normal there, or null. A segment that starts inside the box reports no hit, as Godot's
 * intersect_ray does by default (hit_from_inside = false).
 */
export function rayBox(p: V2, d: V2, b: Box, tMax: number): { t: number; n: V2 } | null {
  let tEnter = -Infinity, tExit = Infinity;
  let n: V2 = [0, 0];
  const lo = [b.x, b.y], hi = [b.x + b.w, b.y + b.h];
  for (let k = 0; k < 2; k++) {
    if (Math.abs(d[k]) < 1e-12) {
      if (p[k] < lo[k] || p[k] > hi[k]) return null;
      continue;
    }
    let t1 = (lo[k] - p[k]) / d[k], t2 = (hi[k] - p[k]) / d[k];
    let nk = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      nk = 1;
    }
    if (t1 > tEnter) {
      tEnter = t1;
      n = k === 0 ? [nk, 0] : [0, nk];
    }
    tExit = Math.min(tExit, t2);
  }
  if (tEnter > tExit || tEnter < 0 || tEnter > tMax) return null;
  return { t: tEnter, n };
}

/** Corners of a box centred at c with half extents (hw, hh), rotated by a radians (clockwise on screen). */
export function obbCorners(c: V2, hw: number, hh: number, a: number): V2[] {
  const ux: V2 = [Math.cos(a), Math.sin(a)], uy: V2 = [-Math.sin(a), Math.cos(a)];
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([x, y]) => [c[0] + ux[0] * x + uy[0] * y, c[1] + ux[1] * x + uy[1] * y]);
}

/** Project points onto a unit axis: [min, max] of the dot products. */
export function project(pts: V2[], axis: V2): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) {
    const s = dot(p, axis);
    if (s < lo) lo = s;
    if (s > hi) hi = s;
  }
  return [lo, hi];
}

/** Convert a pointer position to SVG viewBox coordinates. */
export function svgPoint(svg: SVGSVGElement | null, clientX: number, clientY: number): V2 {
  if (!svg) return [0, 0];
  const m = svg.getScreenCTM();
  if (!m) return [0, 0];
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const p = pt.matrixTransform(m.inverse());
  return [p.x, p.y];
}

/**
 * Drag things in an SVG. `begin(id, pointerEvent, grabOffset)` starts a drag; move events on the svg
 * call onMove(id, point - grabOffset) in viewBox coordinates.
 */
export function useSvgDrag(onMove: (id: string, p: V2) => void) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; off: V2; pid: number } | null>(null);
  const cb = useRef(onMove);
  cb.current = onMove;
  const begin = (id: string, e: React.PointerEvent, anchor: V2) => {
    e.preventDefault();
    const p = svgPoint(svgRef.current, e.clientX, e.clientY);
    drag.current = { id, off: sub(p, anchor), pid: e.pointerId };
    svgRef.current?.setPointerCapture?.(e.pointerId);
  };
  const svgProps = {
    ref: svgRef,
    onPointerMove: (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const p = svgPoint(svgRef.current, e.clientX, e.clientY);
      cb.current(d.id, sub(p, d.off));
    },
    onPointerUp: () => (drag.current = null),
    onPointerCancel: () => (drag.current = null),
    style: { touchAction: 'none' } as React.CSSProperties,
  };
  return { svgProps, begin, svgRef };
}

// ------------------------------------------------------------------ sprite frames as images for SVG
const frameUrls = new Map<string, string>();
/** A data URL of one frame of a sheet (cached), for <image> in SVG figures. Empty if art is missing. */
export function frameURL(id: string, frame: number): string {
  const key = id + '#' + frame;
  const hit = frameUrls.get(key);
  if (hit !== undefined) return hit;
  const def = SHEETS[id];
  if (!def || typeof document === 'undefined') return '';
  const c = document.createElement('canvas');
  c.width = def.frameW;
  c.height = def.frameH;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  drawFrame(ctx, id, frame, 0, 0);
  const url = c.toDataURL();
  frameUrls.set(key, url);
  return url;
}
/** First frame of an animation, or 0. */
export const firstFrame = (id: string, anim: string) => SHEETS[id]?.anims?.[anim]?.frames[0] ?? 0;
