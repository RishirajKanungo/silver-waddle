// Small helpers shared by the ship.* figures: sprite pixel access for the shader playground,
// colour conversion, an animation-frame hook and formatting.
import { useEffect, useRef } from 'react';
import { sheetCanvas, SHEETS } from '../../art';

export type RGBA = [number, number, number, number]; // 0..1 like a shader

const pixelCache = new Map<string, { w: number; h: number; data: Uint8ClampedArray }>();

/** RGBA pixels of a whole sheet (cached). Works with the placeholder art too. */
export function sheetPixels(id: string) {
  const hit = pixelCache.get(id);
  // re-read if the sheet was a placeholder when first cached and the art has landed since
  if (hit && (hit.w > 0 || !SHEETS[id])) return hit;
  const c = sheetCanvas(id);
  const ctx = c.getContext('2d');
  const img = ctx && c.width > 0 ? ctx.getImageData(0, 0, c.width, c.height) : null;
  const out = { w: img?.width ?? 0, h: img?.height ?? 0, data: img?.data ?? new Uint8ClampedArray(0) };
  pixelCache.set(id, out);
  return out;
}

/** A sampler for one frame of a sheet, in frame pixels, transparent outside the frame. */
export function frameSampler(id: string, frame: number) {
  const def = SHEETS[id];
  const fw = def?.frameW ?? 16, fh = def?.frameH ?? 16, cols = def?.cols ?? 1;
  const px = sheetPixels(id);
  const ox = (frame % cols) * fw, oy = Math.floor(frame / cols) * fh;
  const out: RGBA = [0, 0, 0, 0];
  return {
    fw,
    fh,
    /** writes into a shared tuple: copy it if you need to keep it */
    at(x: number, y: number): RGBA {
      x = Math.floor(x);
      y = Math.floor(y);
      if (x < 0 || y < 0 || x >= fw || y >= fh || !px.w) {
        out[0] = out[1] = out[2] = out[3] = 0;
        return out;
      }
      const i = ((oy + y) * px.w + ox + x) * 4;
      out[0] = px.data[i] / 255;
      out[1] = px.data[i + 1] / 255;
      out[2] = px.data[i + 2] / 255;
      out[3] = px.data[i + 3] / 255;
      return out;
    },
  };
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
export function rgbToHex(r: number, g: number, b: number) {
  const f = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
}
/** GLSL-style vec4 literal for shader listings */
export const vec4 = (r: number, g: number, b: number, a = 1) => `vec4(${[r, g, b, a].map((v) => v.toFixed(2)).join(', ')})`;

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h /= 6;
  return [h, s, l];
}
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

/** Deterministic 2D value noise in 0..1 (stands in for a NoiseTexture2D). */
export function valueNoise(x: number, y: number, seed = 7) {
  const h = (i: number, j: number) => {
    let n = (i * 374761393 + j * 668265263 + seed * 2147483647) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return mix(mix(a, b, sx), mix(c, d, sx), sy);
}

/** Calls fn(dt seconds, t seconds) every animation frame while mounted and visible. */
export function useFrame(fn: (dt: number, t: number) => void, deps: unknown[] = []) {
  const cb = useRef(fn);
  cb.current = fn;
  useEffect(() => {
    let raf = 0, last = performance.now();
    const t0 = last;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) {
        last = now;
        return;
      }
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      cb.current(dt, (now - t0) / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export const money = (v: number) => (v < 0 ? '-' : '') + 'US$' + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
export const fmt = (v: number, d = 0) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Godot's linear_to_db: 20·log10(x) */
export const linearToDb = (x: number) => (x <= 0 ? -Infinity : 20 * Math.log10(x));
export const dbToLinear = (db: number) => Math.pow(10, db / 20);
