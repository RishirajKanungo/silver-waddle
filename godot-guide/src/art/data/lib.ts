// Pixel-art authoring toolkit shared by every art module. Pure TypeScript (no DOM), deterministic.
//
// Images are palette-indexed while they are being authored (0 = transparent, 1..N = PAL entries), so
// palette swaps, outlines and shading work on ramps instead of raw RGB. `toRGBA` converts at the end.
//
// The master palette is arranged as ramps (dark -> light). Light comes from the top-left and is warm;
// shadows shift towards purple/blue, highlights towards yellow (hue-shifted ramps, GBA style).
import type { RGBAImage } from '../types';

// ------------------------------------------------------------------------------------------- palette
const HEX = [
  '#000000', // 0 transparent (never drawn)
  '#1a1424', // 1  ink (deepest shade; only used as the outline of the darkest colours)
  '#fbf6e6', // 2  warm white
  // skin
  '#8a4a3e', '#d07e60', '#f4b88e', '#ffe2c2', // 3-6
  // brown: wood, leather, hair
  '#33202a', '#64392c', '#9c5e3c', '#cf9058', // 7-10
  // gold
  '#b0702a', '#eebb3e', '#fff09a', // 11-13
  // red
  '#4a1530', '#9a2a3a', '#d84f3c', '#f8925e', // 14-17
  // blue
  '#1e1e50', '#2e4a9c', '#4c86d6', '#92ccf6', // 18-21
  // green (grass and cloth)
  '#153430', '#276838', '#4f9e3e', '#a2d052', // 22-25
  // stone (cool grey-violet) also used for steel
  '#2c2840', '#514c68', '#86829e', '#c0bed4', // 26-29
  // teal (water, magic)
  '#1a5a80', '#36a0c8', '#9aeaee', // 30-32
  // purple (robes, magic, shadows of night)
  '#3a1e5c', '#7044a8', '#b088e6', // 33-35
  // sand (dirt paths)
  '#b08050', '#dcb47a', // 36-37
];

export const PAL: [number, number, number][] = HEX.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
export const PAL_HEX = HEX;

/** Named palette indices. */
export const C = {
  ink: 1, white: 2,
  skin0: 3, skin1: 4, skin2: 5, skin3: 6,
  brn0: 7, brn1: 8, brn2: 9, brn3: 10,
  gold1: 11, gold2: 12, gold3: 13,
  red0: 14, red1: 15, red2: 16, red3: 17,
  blu0: 18, blu1: 19, blu2: 20, blu3: 21,
  grn0: 22, grn1: 23, grn2: 24, grn3: 25,
  stn0: 26, stn1: 27, stn2: 28, stn3: 29,
  tea1: 30, tea2: 31, tea3: 32,
  pur1: 33, pur2: 34, pur3: 35,
  snd1: 36, snd2: 37,
} as const;

/** Four-step ramps (dark -> light). Some borrow ends from neighbouring ramps so the palette stays small. */
export const RAMPS = {
  skin: [C.skin0, C.skin1, C.skin2, C.skin3],
  brown: [C.brn0, C.brn1, C.brn2, C.brn3],
  gold: [C.brn1, C.gold1, C.gold2, C.gold3],
  red: [C.red0, C.red1, C.red2, C.red3],
  blue: [C.blu0, C.blu1, C.blu2, C.blu3],
  green: [C.grn0, C.grn1, C.grn2, C.grn3],
  stone: [C.stn0, C.stn1, C.stn2, C.stn3],
  steel: [C.stn1, C.stn2, C.stn3, C.white],
  teal: [C.blu0, C.tea1, C.tea2, C.tea3],
  purple: [C.pur1, C.pur2, C.pur3, C.white],
  sand: [C.brn2, C.snd1, C.snd2, C.skin3],
  hairBlonde: [C.brn1, C.gold1, C.gold2, C.gold3],
  hairDark: [C.ink, C.brn0, C.brn1, C.brn2],
  hairRed: [C.red0, C.red1, C.red2, C.red3],
  hairBrown: [C.brn0, C.brn1, C.brn2, C.brn3],
  hairGrey: [C.stn0, C.stn1, C.stn2, C.stn3],
  plum: [C.ink, C.pur1, C.pur2, C.pur3],
  night: [C.ink, C.blu0, C.pur1, C.pur2],
} as const;
export type RampName = keyof typeof RAMPS;
export type Ramp = readonly number[];

// For each palette colour: one shade darker / lighter along its "home" ramp.
const HOME: Ramp[] = [
  [C.ink, C.white],
  RAMPS.skin, RAMPS.brown, [C.brn1, C.gold1, C.gold2, C.gold3], RAMPS.red, RAMPS.blue, RAMPS.green, [C.stn0, C.stn1, C.stn2, C.stn3, C.white],
  [C.blu0, C.tea1, C.tea2, C.tea3], [C.ink, C.pur1, C.pur2, C.pur3], [C.brn2, C.snd1, C.snd2],
];
const DARKER = new Uint8Array(PAL.length);
const LIGHTER = new Uint8Array(PAL.length);
const OUTLINE = new Uint8Array(PAL.length);
for (let i = 1; i < PAL.length; i++) {
  DARKER[i] = C.ink;
  LIGHTER[i] = i;
}
for (const r of HOME)
  r.forEach((c, k) => {
    if (DARKER[c] === C.ink && k > 0) DARKER[c] = r[k - 1];
    if (LIGHTER[c] === c && k < r.length - 1) LIGHTER[c] = r[k + 1];
  });
DARKER[C.white] = C.stn3;
LIGHTER[C.ink] = C.blu0;
// outline colour: the ramp's darkest shade, and ink for colours that are already the darkest
for (let i = 1; i < PAL.length; i++) {
  let c = i, steps = 0;
  while (DARKER[c] !== C.ink && steps < 3) {
    c = DARKER[c];
    steps++;
  }
  OUTLINE[i] = steps === 0 ? C.ink : c;
}
// hand-tuned: these darkest shades are not dark enough to outline their own ramp
OUTLINE[C.tea1] = C.blu0;
OUTLINE[C.tea2] = C.blu0;
OUTLINE[C.tea3] = C.tea1;
OUTLINE[C.white] = C.stn1;
OUTLINE[C.stn3] = C.stn0;
OUTLINE[C.snd1] = C.brn1;
OUTLINE[C.snd2] = C.brn1;
OUTLINE[C.skin1] = C.skin0;
OUTLINE[C.skin2] = C.skin0;
OUTLINE[C.skin3] = C.skin0;
OUTLINE[C.skin0] = C.brn0;
OUTLINE[C.gold1] = C.brn1;
OUTLINE[C.gold2] = C.brn1;
OUTLINE[C.gold3] = C.gold1;
OUTLINE[C.pur3] = C.pur1;

export const darker = (c: number, n = 1) => {
  for (let k = 0; k < n && c; k++) c = DARKER[c];
  return c;
};
export const lighter = (c: number, n = 1) => {
  for (let k = 0; k < n && c; k++) c = LIGHTER[c];
  return c;
};
export const outlineOf = (c: number) => OUTLINE[c] || C.ink;
export const luma = (c: number) => (c ? 0.299 * PAL[c][0] + 0.587 * PAL[c][1] + 0.114 * PAL[c][2] : 0);

// --------------------------------------------------------------------------------------------- image
export class Img {
  w: number;
  h: number;
  px: Uint8Array;
  constructor(w: number, h: number, px?: Uint8Array) {
    this.w = w;
    this.h = h;
    this.px = px ?? new Uint8Array(w * h);
  }
  in(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  get(x: number, y: number) {
    x = Math.floor(x);
    y = Math.floor(y);
    return this.in(x, y) ? this.px[y * this.w + x] : 0;
  }
  set(x: number, y: number, c: number) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (this.in(x, y)) this.px[y * this.w + x] = c;
  }
  /** set only where the pixel is already opaque */
  paint(x: number, y: number, c: number) {
    if (this.get(x, y)) this.set(x, y, c);
  }
  clone() {
    return new Img(this.w, this.h, this.px.slice());
  }
  /** visit every opaque pixel */
  each(f: (x: number, y: number, c: number) => void) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.px[y * this.w + x]) f(x, y, this.px[y * this.w + x]);
  }
  map(f: (c: number, x: number, y: number) => number) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        if (this.px[i]) this.px[i] = f(this.px[i], x, y);
      }
    return this;
  }
  isEmpty() {
    return this.px.every((c) => c === 0);
  }
}

export const blank = (w: number, h: number) => new Img(w, h);

// -------------------------------------------------------------------------------- string-grid parts
/** char -> palette index. '.' and ' ' are always transparent. */
export type Legend = Record<string, number>;

/** Parse a palette-indexed string grid (one character per pixel). Unknown characters throw. */
export function grid(rows: string | string[], legend: Legend): Img {
  const lines = (typeof rows === 'string' ? rows.split('\n') : rows).map((r) => r.replace(/\s+$/, '')).filter((r, i, a) => r.length || (i > 0 && i < a.length - 1));
  const trimmed = typeof rows === 'string' ? trimBlankEnds(lines) : lines;
  const w = Math.max(...trimmed.map((r) => r.length));
  const img = new Img(w, trimmed.length);
  trimmed.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) {
      const ch = r[x];
      if (ch === '.' || ch === ' ') continue;
      const c = legend[ch];
      if (c === undefined) throw new Error(`grid: no legend entry for '${ch}' in row "${r}"`);
      img.px[y * w + x] = c;
    }
  });
  return img;
}
function trimBlankEnds(lines: string[]) {
  let a = 0, b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  // remove common indentation
  const body = lines.slice(a, b);
  const ind = Math.min(...body.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length));
  return body.map((l) => l.slice(ind));
}

/**
 * A material legend: each material gets four characters for its four shades (dark -> light).
 * `materials({ H: 'qhHY' }, { H: RAMPS.brown })` maps q,h,H,Y to the brown ramp. Swapping the ramp
 * assignment recolours every part drawn with the legend (palette swap at authoring level).
 */
export function materialLegend(chars: Record<string, string>, ramps: Record<string, Ramp>, extra: Legend = {}): Legend {
  const lg: Legend = { ...extra };
  for (const [m, cs] of Object.entries(chars)) {
    const r = ramps[m];
    if (!r) continue;
    for (let k = 0; k < cs.length; k++) lg[cs[k]] = r[Math.min(k, r.length - 1)];
  }
  return lg;
}

// ------------------------------------------------------------------------------- transforms
export function mirrorX(img: Img): Img {
  const o = new Img(img.w, img.h);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) o.px[y * img.w + (img.w - 1 - x)] = img.px[y * img.w + x];
  return o;
}
export function mirrorY(img: Img): Img {
  const o = new Img(img.w, img.h);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) o.px[(img.h - 1 - y) * img.w + x] = img.px[y * img.w + x];
  return o;
}
/** Make a left-right symmetric image from its left half (odd widths keep the centre column). */
export function symmetric(left: Img, w: number): Img {
  const o = new Img(w, left.h);
  for (let y = 0; y < left.h; y++)
    for (let x = 0; x < Math.ceil(w / 2); x++) {
      const c = left.get(x, y);
      o.set(x, y, c);
      o.set(w - 1 - x, y, c);
    }
  return o;
}
export function rotate90(img: Img): Img {
  const o = new Img(img.h, img.w);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) o.set(img.h - 1 - y, x, img.px[y * img.w + x]);
  return o;
}
/** Nearest-neighbour rotation about (cx, cy) – for small props only (weapons, icons). */
export function rotate(img: Img, angle: number, cx = img.w / 2, cy = img.h / 2, outW = img.w, outH = img.h, ox = cx, oy = cy): Img {
  const o = new Img(outW, outH);
  const ca = Math.cos(-angle), sa = Math.sin(-angle);
  for (let y = 0; y < outH; y++)
    for (let x = 0; x < outW; x++) {
      const dx = x + 0.5 - ox, dy = y + 0.5 - oy;
      const sx = ca * dx - sa * dy + cx, sy = sa * dx + ca * dy + cy;
      o.set(x, y, img.get(Math.floor(sx), Math.floor(sy)));
    }
  return o;
}

/** Recolour: palette index -> palette index. */
export function swap(img: Img, map: Record<number, number> | Map<number, number>): Img {
  const m = map instanceof Map ? map : new Map(Object.entries(map).map(([k, v]) => [Number(k), v]));
  return img.clone().map((c) => m.get(c) ?? c);
}
/** Recolour every shade of one ramp with the matching shade of another (a palette swap). */
export function rampSwap(img: Img, pairs: [Ramp, Ramp][]): Img {
  const m = new Map<number, number>();
  for (const [a, b] of pairs) a.forEach((c, k) => m.set(c, b[Math.min(k, b.length - 1)]));
  return swap(img, m);
}

// ------------------------------------------------------------------------------- composition
export interface BlitOpts {
  flipX?: boolean;
  /** only draw where the destination is transparent (draw "behind") */
  behind?: boolean;
  /** only draw where the destination is opaque (clip to existing pixels) */
  clip?: boolean;
}
/** Draw `src` into `dst` with its top-left at (x, y). */
export function blit(dst: Img, src: Img, x: number, y: number, o: BlitOpts = {}) {
  x = Math.round(x);
  y = Math.round(y);
  for (let sy = 0; sy < src.h; sy++)
    for (let sx = 0; sx < src.w; sx++) {
      const c = src.px[sy * src.w + (o.flipX ? src.w - 1 - sx : sx)];
      if (!c) continue;
      const dx = x + sx, dy = y + sy;
      if (!dst.in(dx, dy)) continue;
      const cur = dst.px[dy * dst.w + dx];
      if (o.behind && cur) continue;
      if (o.clip && !cur) continue;
      dst.px[dy * dst.w + dx] = c;
    }
  return dst;
}
/** Compose parts with offsets into a w×h image. Later parts draw over earlier ones. */
export function compose(w: number, h: number, parts: { img: Img; x: number; y: number; flipX?: boolean; behind?: boolean }[]) {
  const o = new Img(w, h);
  for (const p of parts) blit(o, p.img, p.x, p.y, { flipX: p.flipX, behind: p.behind });
  return o;
}
export function shift(img: Img, dx: number, dy: number) {
  const o = new Img(img.w, img.h);
  return blit(o, img, dx, dy);
}
/** Copy a rectangle out of an image. */
export function crop(img: Img, x: number, y: number, w: number, h: number) {
  const o = new Img(w, h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) o.set(i, j, img.get(x + i, y + j));
  return o;
}

// ------------------------------------------------------------------------------- outline & shading
/**
 * Automatic 1-px outline. Every transparent pixel touching an opaque one (4-neighbourhood) becomes
 * the darkest shade of that neighbour's ramp (selective outline), never pure black. Pass
 * `ignore` to skip colours (e.g. glows) and `only` to outline just part of the sprite.
 */
export function outline(img: Img, opts: { ignore?: number[]; diagonal?: boolean; color?: number } = {}): Img {
  const o = img.clone();
  const ign = new Set(opts.ignore ?? []);
  const nb = opts.diagonal
    ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
    : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) {
      if (img.px[y * img.w + x]) continue;
      let best = 0, bl = 1e9;
      for (const [dx, dy] of nb) {
        const c = img.get(x + dx, y + dy);
        if (!c || ign.has(c)) continue;
        const oc = opts.color ?? outlineOf(c);
        const l = luma(oc);
        if (l < bl) {
          bl = l;
          best = oc;
        }
      }
      if (best) o.px[y * img.w + x] = best;
    }
  return o;
}

/** Darken the inner pixels along the bottom/right edges and light the top/left (light from top-left). */
export function rimShade(img: Img, opts: { light?: boolean; shadow?: boolean; skip?: number[] } = {}) {
  const o = img.clone();
  const skip = new Set(opts.skip ?? []);
  img.each((x, y, c) => {
    if (skip.has(c)) return;
    const tl = !img.get(x - 1, y) || !img.get(x, y - 1);
    const br = !img.get(x + 1, y) || !img.get(x, y + 1);
    if (br && opts.shadow !== false) o.set(x, y, darker(c));
    else if (tl && opts.light !== false) o.set(x, y, lighter(c));
  });
  return o;
}

/** 4×4 ordered-dither threshold in [0, 1). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

/** Pick a ramp shade for a light value v in [0,1] with ordered dithering between steps. */
export function rampAt(ramp: Ramp, v: number, x: number, y: number, dither = true) {
  const n = ramp.length;
  const f = Math.max(0, Math.min(0.9999, v)) * (n - 1);
  const k = Math.floor(f);
  const t = f - k;
  if (k >= n - 1) return ramp[n - 1];
  if (!dither) return ramp[t < 0.5 ? k : k + 1];
  // only dither the middle of the transition band so it stays crisp
  const tt = t < 0.35 ? 0 : t > 0.65 ? 1 : (t - 0.35) / 0.3;
  return ramp[tt > bayer(x, y) ? k + 1 : k];
}

/** Fill an ellipse shaded like a lit sphere (light from the top-left). */
export function ballShade(img: Img, cx: number, cy: number, rx: number, ry: number, ramp: Ramp, opts: { dither?: boolean; light?: [number, number, number]; bias?: number; flat?: number } = {}) {
  const [lx, ly, lz] = opts.light ?? [-0.55, -0.65, 0.52];
  const ln = Math.hypot(lx, ly, lz);
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      const d = nx * nx + ny * ny;
      if (d > 1) continue;
      const nz = Math.sqrt(1 - d) * (opts.flat ?? 1);
      const nl = Math.hypot(nx, ny, nz) || 1;
      let v = (nx * lx + ny * ly + nz * lz) / (nl * ln);
      v = v * 0.5 + 0.5 + (opts.bias ?? 0);
      img.set(x, y, rampAt(ramp, v, x, y, opts.dither ?? true));
    }
  return img;
}

// ------------------------------------------------------------------------------- primitives
export function rect(img: Img, x: number, y: number, w: number, h: number, c: number) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) img.set(x + i, y + j, c);
  return img;
}
export function hline(img: Img, x0: number, x1: number, y: number, c: number) {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) img.set(x, y, c);
}
export function vline(img: Img, x: number, y0: number, y1: number, c: number) {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) img.set(x, y, c);
}
/** Bresenham line; `f` may override the colour per step (t in 0..1). */
export function line(img: Img, x0: number, y0: number, x1: number, y1: number, c: number | ((t: number, x: number, y: number) => number)) {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const n = Math.max(dx, -dy) || 1;
  let k = 0;
  for (;;) {
    const col = typeof c === 'function' ? c(k / n, x0, y0) : c;
    if (col) img.set(x0, y0, col);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
    k++;
  }
  return img;
}
/** Points of a Bresenham line. */
export function linePts(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = [];
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pts.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return pts;
}
export function ellipse(img: Img, cx: number, cy: number, rx: number, ry: number, c: number | ((x: number, y: number, d: number) => number)) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      const d = nx * nx + ny * ny;
      if (d <= 1) {
        const col = typeof c === 'function' ? c(x, y, d) : c;
        if (col) img.set(x, y, col);
      }
    }
  return img;
}
/** Ring between radii r0 and r1 (pixel centres). */
export function ring(img: Img, cx: number, cy: number, r0: number, r1: number, c: number | ((x: number, y: number, a: number) => number), a0 = -Math.PI, a1 = Math.PI) {
  for (let y = Math.floor(cy - r1 - 1); y <= Math.ceil(cy + r1 + 1); y++)
    for (let x = Math.floor(cx - r1 - 1); x <= Math.ceil(cx + r1 + 1); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      if (d < r0 || d > r1) continue;
      const a = Math.atan2(dy, dx);
      if (!angleIn(a, a0, a1)) continue;
      const col = typeof c === 'function' ? c(x, y, a) : c;
      if (col) img.set(x, y, col);
    }
  return img;
}
export function angleIn(a: number, a0: number, a1: number) {
  const TAU = Math.PI * 2;
  const n = (v: number) => ((v % TAU) + TAU) % TAU;
  const span = a1 - a0;
  if (span >= TAU - 1e-9) return true;
  return n(a - a0) <= n(span) || (span < 0 && n(a - a1) <= n(-span));
}
/** Polygon fill (even-odd, pixel centres). */
export function poly(img: Img, pts: [number, number][], c: number | ((x: number, y: number) => number)) {
  const ys = pts.map((p) => p[1]);
  for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) img.set(x, y, typeof c === 'function' ? c(x, y) : c);
  }
  return img;
}

// ------------------------------------------------------------------------------- noise & random
/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash2(x: number, y: number, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth value noise that tiles with period `p` (in noise cells). */
export function tnoise(x: number, y: number, p: number, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const w = (i: number) => ((i % p) + p) % p;
  const v = (i: number, j: number) => hash2(w(i), w(j), seed);
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
  return a + (b - a) * s(fx) + (c - a) * s(fy) + (a - b - c + d) * s(fx) * s(fy);
}
/** Fractal noise that tiles every `period` pixels. */
export function tfbm(x: number, y: number, period: number, cell: number, seed = 0, oct = 2) {
  let v = 0, amp = 1, tot = 0, c = cell;
  for (let o = 0; o < oct; o++) {
    const p = Math.max(1, Math.round(period / c));
    v += amp * tnoise(x / c, y / c, p, seed + o * 31);
    tot += amp;
    amp *= 0.5;
    c /= 2;
  }
  return v / tot;
}

// ------------------------------------------------------------------------------- sheets
/** Lay frames out row-major into one image. Each frame is centred if smaller than the cell. */
export function packSheet(frames: (Img | null)[], cols: number, fw: number, fh: number, rows = Math.ceil(frames.length / cols)): Img {
  const o = new Img(cols * fw, rows * fh);
  frames.forEach((f, i) => {
    if (!f) return;
    blit(o, f, (i % cols) * fw + Math.floor((fw - f.w) / 2), Math.floor(i / cols) * fh + Math.floor((fh - f.h) / 2));
  });
  return o;
}

/** Rows of frames: one animation per row. Returns the sheet and the anim frame indices. */
export function rowSheet(rows: { name: string; frames: Img[]; fps: number; loop: boolean }[], cols: number, fw: number, fh: number) {
  const cells: (Img | null)[] = [];
  const anims: Record<string, { frames: number[]; fps: number; loop: boolean }> = {};
  rows.forEach((r, ri) => {
    if (r.frames.length > cols) throw new Error(`rowSheet: ${r.name} has ${r.frames.length} frames > ${cols} cols`);
    anims[r.name] = { frames: r.frames.map((_, k) => ri * cols + k), fps: r.fps, loop: r.loop };
    for (let k = 0; k < cols; k++) cells.push(r.frames[k] ?? null);
  });
  return { img: packSheet(cells, cols, fw, fh, rows.length), anims, cols, rows: rows.length };
}

/** Palette-indexed image -> RGBA. */
export function toRGBA(img: Img, alpha?: (x: number, y: number, c: number) => number): RGBAImage {
  const data = new Uint8ClampedArray(img.w * img.h * 4);
  for (let i = 0; i < img.px.length; i++) {
    const c = img.px[i];
    if (!c) continue;
    const [r, g, b] = PAL[c];
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = alpha ? alpha(i % img.w, Math.floor(i / img.w), c) : 255;
  }
  return { w: img.w, h: img.h, data };
}

/** Memoise a render function (sheets are rendered once and reused). */
export function once<T>(f: () => T): () => T {
  let v: T | undefined;
  let done = false;
  return () => {
    if (!done) {
      v = f();
      done = true;
    }
    return v as T;
  };
}
