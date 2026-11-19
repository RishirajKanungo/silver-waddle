// Browser-side access to the guide's assets: sheet definitions, cached canvases, frame drawing,
// animation timing and sound playback. Data modules in ./data/*.ts register sheets and sounds.
import type { ArtModule, RGBAImage, SheetDef, SoundDef } from './types';
export type { SheetDef, SoundDef, AnimDef, AssetKind } from './types';

const modules = import.meta.glob<{ ART: ArtModule }>('./data/*.ts', { eager: true });

const sheetRender = new Map<string, () => RGBAImage>();
const soundRender = new Map<string, (sr: number) => Float32Array>();
export const SHEETS: Record<string, SheetDef> = {};
export const SOUNDS: Record<string, SoundDef> = {};
for (const m of Object.values(modules)) {
  for (const s of m.ART?.sheets ?? []) {
    if (SHEETS[s.def.id]) throw new Error('duplicate sheet id ' + s.def.id);
    SHEETS[s.def.id] = s.def;
    sheetRender.set(s.def.id, s.render);
  }
  for (const s of m.ART?.sounds ?? []) {
    if (SOUNDS[s.def.id]) throw new Error('duplicate sound id ' + s.def.id);
    SOUNDS[s.def.id] = s.def;
    soundRender.set(s.def.id, s.render);
  }
}

const canvases = new Map<string, HTMLCanvasElement>();

/** The whole sheet rendered at 1× into a canvas (cached). Placeholder art when the id is unknown. */
export function sheetCanvas(id: string): HTMLCanvasElement {
  const hit = canvases.get(id);
  if (hit) return hit;
  const def = SHEETS[id];
  const c = document.createElement('canvas');
  if (def && sheetRender.has(id)) {
    const img = sheetRender.get(id)!();
    c.width = img.w;
    c.height = img.h;
    const ctx = c.getContext('2d')!;
    const id2 = ctx.createImageData(img.w, img.h);
    id2.data.set(img.data);
    ctx.putImageData(id2, 0, 0);
  } else {
    // placeholder: a labelled box per frame so figures still work before art exists
    const fw = def?.frameW ?? 16, fh = def?.frameH ?? 16, cols = def?.cols ?? 1, rows = def?.rows ?? 1;
    c.width = fw * cols;
    c.height = fh * rows;
    const ctx = c.getContext('2d')!;
    for (let r = 0; r < rows; r++)
      for (let q = 0; q < cols; q++) {
        ctx.fillStyle = `hsl(${(hash(id) + (r * cols + q) * 23) % 360} 45% 55%)`;
        ctx.fillRect(q * fw + 2, r * fh + 2, fw - 4, fh - 4);
      }
  }
  canvases.set(id, c);
  return c;
}

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export interface DrawOpts {
  flipH?: boolean;
  scale?: number;
  alpha?: number;
  /** draw relative to the sheet's origin (feet) instead of the top-left corner */
  anchored?: boolean;
  /** flash the sprite with a solid colour (hit flash), 0..1 */
  flash?: number;
  flashColor?: string;
}

const flashCache = new Map<string, HTMLCanvasElement>();
function flashSheet(id: string, color: string) {
  const key = id + '|' + color;
  const hit = flashCache.get(key);
  if (hit) return hit;
  const src = sheetCanvas(id);
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  flashCache.set(key, c);
  return c;
}

/** Draw frame `frame` of sheet `id` at (x, y). Coordinates are in canvas pixels. */
export function drawFrame(ctx: CanvasRenderingContext2D, id: string, frame: number, x: number, y: number, opts: DrawOpts = {}) {
  const def = SHEETS[id];
  const fw = def?.frameW ?? 16, fh = def?.frameH ?? 16, cols = def?.cols ?? 1;
  const s = opts.scale ?? 1;
  const sx = (frame % cols) * fw, sy = Math.floor(frame / cols) * fh;
  let dx = x, dy = y;
  if (opts.anchored && def?.origin) {
    dx -= def.origin[0] * s;
    dy -= def.origin[1] * s;
  }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  if (opts.flipH) {
    ctx.translate(Math.round(dx + fw * s), Math.round(dy));
    ctx.scale(-1, 1);
    dx = 0;
    dy = 0;
  } else {
    dx = Math.round(dx);
    dy = Math.round(dy);
  }
  ctx.drawImage(sheetCanvas(id), sx, sy, fw, fh, dx, dy, fw * s, fh * s);
  if (opts.flash && opts.flash > 0) {
    ctx.globalAlpha = (opts.alpha ?? 1) * Math.min(1, opts.flash);
    ctx.drawImage(flashSheet(id, opts.flashColor ?? '#ffffff'), sx, sy, fw, fh, dx, dy, fw * s, fh * s);
  }
  ctx.restore();
}

/** The frame index of animation `anim` at time t (seconds). */
export function animFrame(id: string, anim: string, t: number): number {
  const a = SHEETS[id]?.anims?.[anim];
  if (!a || !a.frames.length) return 0;
  const k = Math.floor(t * a.fps);
  return a.loop ? a.frames[((k % a.frames.length) + a.frames.length) % a.frames.length] : a.frames[Math.min(k, a.frames.length - 1)];
}

/** Total length of a non-looping animation, in seconds. */
export const animLength = (id: string, anim: string) => {
  const a = SHEETS[id]?.anims?.[anim];
  return a ? a.frames.length / a.fps : 0;
};

let audio: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();
/** Play a sound (only after a user gesture, as browsers require). */
export function playSound(id: string, volume = 0.6) {
  const render = soundRender.get(id);
  if (!render) return;
  try {
    audio ??= new AudioContext();
    let buf = buffers.get(id);
    if (!buf) {
      const data = render(audio.sampleRate);
      buf = audio.createBuffer(1, data.length, audio.sampleRate);
      buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      buffers.set(id, buf);
    }
    const src = audio.createBufferSource();
    const g = audio.createGain();
    g.gain.value = volume;
    src.buffer = buf;
    src.connect(g).connect(audio.destination);
    src.start();
    return () => src.stop();
  } catch {
    return undefined;
  }
}

/** Render a sheet to RGBA (used by previews and by the exporter). */
export const renderSheet = (id: string) => sheetRender.get(id)?.();
export const renderSound = (id: string, sr: number) => soundRender.get(id)?.(sr);
