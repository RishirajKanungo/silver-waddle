// Small helpers shared by the movement, height, world and camera figures (core.dash, core.feel,
// core.height, core.platformer, core.ysort, core.camera). Local to this folder on purpose: the
// shared game kit stays untouched.
import { SHEETS, drawFrame, animFrame, rect, text, type Theme } from '../game';
import './motion.css';

/** An axis-aligned rectangle in game pixels: x, y, w, h. */
export type Box = readonly [number, number, number, number];

/** Godot's move_toward for floats: step from v toward target by at most maxDelta. */
export const moveToward = (v: number, target: number, maxDelta: number) => (Math.abs(target - v) <= maxDelta ? target : v + Math.sign(target - v) * maxDelta);

/** Vector2.move_toward, writing into `out` (no allocation). */
export function moveToward2(out: { vx: number; vy: number }, tx: number, ty: number, maxDelta: number) {
  const dx = tx - out.vx, dy = ty - out.vy;
  const d = Math.hypot(dx, dy);
  if (d <= maxDelta || d === 0) {
    out.vx = tx;
    out.vy = ty;
  } else {
    out.vx += (dx / d) * maxDelta;
    out.vy += (dy / d) * maxDelta;
  }
}

/** Does a feet box centred at (x, y) (bottom edge at y) overlap any box? */
export function feetHit(boxes: readonly Box[], x: number, y: number, fw = 10, fh = 6) {
  for (const [bx, by, bw, bh] of boxes) if (x - fw / 2 < bx + bw && x + fw / 2 > bx && y - fh < by + bh && y > by) return true;
  return false;
}

export const inBox = ([bx, by, bw, bh]: Box, x: number, y: number) => x >= bx && x < bx + bw && y >= by && y < by + bh;

const FALLBACK_BODY: Record<string, string> = { hero: '#3a6fc4', mage: '#7044a8', guard: '#9a2a3a', villager: '#4f9e3e', villager2: '#b0702a' };

/** A character sprite with its feet at (x, y). Falls back to a simple two-box figure before the art exists. */
export function drawChar(ctx: CanvasRenderingContext2D, sheet: string, anim: string, t: number, x: number, y: number, o: { flip?: boolean; alpha?: number; flash?: number; flashColor?: string } = {}) {
  if (SHEETS[sheet]) {
    drawFrame(ctx, sheet, animFrame(sheet, anim, t), x, y, { anchored: true, flipH: o.flip, alpha: o.alpha, flash: o.flash, flashColor: o.flashColor });
    return;
  }
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  const f = o.flash && o.flash > 0.5 ? o.flashColor ?? '#fff' : null;
  const bob = anim.startsWith('walk') ? Math.floor(t * 8) % 2 : 0;
  rect(ctx, x - 5, y - 13 - bob, 10, 11, f ?? FALLBACK_BODY[sheet] ?? '#3a6fc4');
  rect(ctx, x - 4, y - 20 - bob, 8, 7, f ?? '#f4b88e');
  rect(ctx, x - 4, y - 3, 3, 3, f ?? '#33202a');
  rect(ctx, x + 1, y - 3, 3, 3, f ?? '#33202a');
  const eyeX = o.flip ? x - 3 : anim.endsWith('side') ? x + 1 : x - 2;
  if (!anim.endsWith('up') && !f) rect(ctx, eyeX, y - 17 - bob, anim.endsWith('side') ? 1 : 4, 1, '#1a1424');
  ctx.restore();
}

/** Grass ground covering the world rect [0, 0, ww, wh] seen from camera (cx, cy). */
export function drawGrass(ctx: CanvasRenderingContext2D, ww: number, wh: number, cx = 0, cy = 0, vw = ctx.canvas.width, vh = ctx.canvas.height) {
  const tiles = SHEETS['tiles_overworld'];
  ctx.fillStyle = '#5a8f4e';
  ctx.fillRect(0, 0, vw, vh);
  if (!tiles) {
    ctx.fillStyle = '#548848';
    for (let ty = Math.max(0, Math.floor(cy / 16)); ty * 16 < Math.min(wh, cy + vh); ty++)
      for (let tx = Math.max(0, Math.floor(cx / 16)); tx * 16 < Math.min(ww, cx + vw); tx++) if ((tx + ty) % 2) ctx.fillRect(Math.round(tx * 16 - cx), Math.round(ty * 16 - cy), 16, 16);
    return;
  }
  const g = tiles.tiles ?? {};
  const grass = [g.grass ?? 0, g.grass2 ?? g.grass ?? 0, g.grass3 ?? g.grass ?? 0];
  for (let ty = Math.max(0, Math.floor(cy / 16)); ty * 16 < Math.min(wh, cy + vh); ty++)
    for (let tx = Math.max(0, Math.floor(cx / 16)); tx * 16 < Math.min(ww, cx + vw); tx++) drawFrame(ctx, 'tiles_overworld', grass[(tx * 7 + ty * 13) % 3], Math.round(tx * 16 - cx), Math.round(ty * 16 - cy));
}

/** A neutral stone wall block (same look as core.topdown). */
export function drawWall(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  rect(ctx, x, y, w, h, '#4b4a5c');
  rect(ctx, x, y, w, 3, '#6f6d84');
}

/** A soft elliptical shadow centred at (x, y). */
export function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx = 6, ry = 2.5, alpha = 0.35) {
  ctx.save();
  ctx.fillStyle = `rgba(20,16,36,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(Math.round(x), Math.round(y) - 0.5, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ------------------------------------------------------------------------------- frame timeline
/** One byte of flags per physics frame, the last N frames. */
export class FrameLog {
  readonly n: number;
  flags: Uint8Array;
  head = 0; // index of the next write
  count = 0;
  frame = 0; // total frames logged
  constructor(n = 130) {
    this.n = n;
    this.flags = new Uint8Array(n);
  }
  push(f: number) {
    this.flags[this.head] = f;
    this.head = (this.head + 1) % this.n;
    this.count = Math.min(this.n, this.count + 1);
    this.frame++;
  }
  /** flags k frames ago (0 = latest) */
  ago(k: number) {
    return this.flags[(this.head - 1 - k + this.n * 2) % this.n];
  }
  /** set a bit on a frame k frames ago */
  mark(k: number, bit: number) {
    if (k < this.count) this.flags[(this.head - 1 - k + this.n * 2) % this.n] |= bit;
  }
  clear() {
    this.flags.fill(0);
    this.head = 0;
    this.count = 0;
  }
}

export interface TLRow {
  label: string;
  bit: number;
  color: keyof Theme;
  /** 'bar': a continuous strip; 'tick': a full-height mark for single-frame events */
  style?: 'bar' | 'tick';
}

/** Draw a frame timeline into a canvas: newest frame at the right, 2 px per frame, a grid line every 10 frames. */
export function drawTimeline(cv: HTMLCanvasElement | null, log: FrameLog, rows: TLRow[], th: Theme, title = 'frames (60 per second), newest on the right') {
  const ctx = cv?.getContext('2d');
  if (!cv || !ctx) return;
  const LW = 60, RH = 10, top = 11;
  const w = cv.width, h = cv.height;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = th.bg2;
  ctx.fillRect(0, 0, w, h);
  text(ctx, title, 2, 8, th.muted);
  const px = (w - LW) / log.n;
  // grid every 10 frames, aligned to absolute frame numbers so it scrolls with the data
  ctx.fillStyle = th.line;
  for (let k = 0; k < log.n; k++) if ((log.frame - 1 - k) % 10 === 0) ctx.fillRect(Math.round(w - (k + 1) * px), top, 1, rows.length * RH);
  rows.forEach((r, i) => {
    const y = top + i * RH;
    text(ctx, r.label, 2, y + 8, th.fg);
    ctx.fillStyle = th[r.color];
    for (let k = 0; k < log.count; k++) {
      if (!(log.ago(k) & r.bit)) continue;
      const x = Math.round(w - (k + 1) * px);
      if (r.style === 'tick') ctx.fillRect(x, y + 1, Math.max(2, Math.round(px)), RH - 2);
      else ctx.fillRect(x, y + 3, Math.ceil(px), RH - 6);
    }
  });
}
