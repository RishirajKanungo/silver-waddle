// Drawing helpers shared by the combat figures: sprites with a fallback while art is missing,
// the nine-slice panel, gauge bars from ui_bars, outlined pixel text and the arena floor.
import { drawFrame, animFrame, animLength, SHEETS, sheetCanvas, rect, text } from '../game';

export const PAL = {
  white: '#ffffff',
  weak: '#ffd65a',
  stagger: '#ff8a3d',
  heal: '#7dff8a',
  grey: '#c8c8d0',
  hurt: '#ff6b6b',
  mp: '#7fc4ff',
  atb: '#5fd2ff',
  ink: '#14121c',
  dim: '#8a879c',
};

/** A character or enemy sprite at its feet position. Falls back to a simple figure. */
export function sprite(ctx: CanvasRenderingContext2D, sheet: string, anim: string, t: number, x: number, y: number, opts: { flip?: boolean; flash?: number; alpha?: number; color?: string; fallbackAnim?: string; size?: [number, number] } = {}) {
  const def = SHEETS[sheet];
  if (def) {
    const a = def.anims?.[anim] ? anim : opts.fallbackAnim && def.anims?.[opts.fallbackAnim] ? opts.fallbackAnim : anim;
    drawFrame(ctx, sheet, animFrame(sheet, a, t), x, y, { anchored: true, flipH: opts.flip, flash: opts.flash, alpha: opts.alpha });
    return;
  }
  const [w, h] = opts.size ?? [10, 18];
  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  const c = opts.flash && opts.flash > 0.5 ? '#ffffff' : (opts.color ?? '#8a8aa0');
  rect(ctx, x - w / 2, y - h, w, h, c);
  rect(ctx, x - w / 2 + 2, y - h + 3, 2, 2, PAL.ink);
  rect(ctx, x + w / 2 - 4, y - h + 3, 2, 2, PAL.ink);
  ctx.restore();
}

/** time inside a one-shot animation, stretched so the whole animation spans `duration` seconds */
export function oneShotT(sheet: string, anim: string, t: number, duration: number) {
  const L = animLength(sheet, anim);
  if (L <= 0 || duration <= 0) return t;
  return Math.min(0.999, t / duration) * L;
}

/** Nine-slice window from ui_panel (8 px corners). */
export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha = 0.92) {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  h = Math.round(h);
  if (!SHEETS['ui_panel']) {
    rect(ctx, x, y, w, h, 'rgba(20,18,32,0.88)');
    rect(ctx, x, y, w, h, '#c8c8d0', true);
    return;
  }
  const img = sheetCanvas('ui_panel');
  const c = 8, s = 24, m = s - 2 * c;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  const iw = w - 2 * c, ih = h - 2 * c;
  // corners
  ctx.drawImage(img, 0, 0, c, c, x, y, c, c);
  ctx.drawImage(img, s - c, 0, c, c, x + w - c, y, c, c);
  ctx.drawImage(img, 0, s - c, c, c, x, y + h - c, c, c);
  ctx.drawImage(img, s - c, s - c, c, c, x + w - c, y + h - c, c, c);
  // edges and centre (stretched)
  if (iw > 0) {
    ctx.drawImage(img, c, 0, m, c, x + c, y, iw, c);
    ctx.drawImage(img, c, s - c, m, c, x + c, y + h - c, iw, c);
  }
  if (ih > 0) {
    ctx.drawImage(img, 0, c, c, m, x, y + c, c, ih);
    ctx.drawImage(img, s - c, c, c, m, x + w - c, y + c, c, ih);
  }
  if (iw > 0 && ih > 0) ctx.drawImage(img, c, c, m, m, x + c, y + c, iw, ih);
  ctx.restore();
}

const BAR_ROW = { hp: 0, mp: 1, atb: 2, atb_full: 3, stagger: 4, empty: 5, frame: 6 } as const;
const BAR_FALLBACK: Record<keyof typeof BAR_ROW, string> = { hp: '#5ccf5c', mp: '#5aa0ff', atb: '#5fd2ff', atb_full: '#bff4ff', stagger: '#ff8a3d', empty: '#2a2838', frame: '#14121c' };

/** A 6 px tall gauge of any width, three-sliced from the ui_bars sheet (frame 1 px, interior 4 px). */
export function gauge(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, frac: number, kind: 'hp' | 'mp' | 'atb' | 'atb_full' | 'stagger', tint?: string) {
  x = Math.round(x);
  y = Math.round(y);
  w = Math.round(w);
  frac = Math.max(0, Math.min(1, frac));
  if (!SHEETS['ui_bars']) {
    rect(ctx, x, y, w, 6, BAR_FALLBACK.frame);
    rect(ctx, x + 1, y + 1, w - 2, 4, BAR_FALLBACK.empty);
    rect(ctx, x + 1, y + 1, (w - 2) * frac, 4, tint ?? BAR_FALLBACK[kind]);
    return;
  }
  const img = sheetCanvas('ui_bars');
  const slice = (row: number, dw: number) => {
    const sy = row * 6;
    if (dw <= 0) return;
    ctx.drawImage(img, 0, sy, 2, 6, x, y, Math.min(2, dw), 6);
    if (dw > 4) ctx.drawImage(img, 2, sy, 44, 6, x + 2, y, dw - 4, 6);
    if (dw > 2) ctx.drawImage(img, 46, sy, 2, 6, x + Math.max(2, dw - 2), y, 2, 6);
  };
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  slice(BAR_ROW.empty, w);
  const fw = Math.round(1 + (w - 2) * frac);
  if (frac > 0) {
    // the fill rows are drawn clipped to the filled width
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, fw, 6);
    ctx.clip();
    slice(BAR_ROW[kind], w);
    if (tint) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = tint;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(x + 1, y + 1, w - 2, 4);
    }
    ctx.restore();
  }
  slice(BAR_ROW.frame, w);
  ctx.restore();
}

/** Pixel text with a 1 px dark shadow so it reads over the game. */
export function stext(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left') {
  text(ctx, s, x + 1, y + 1, PAL.ink, align);
  text(ctx, s, x, y, color, align);
}

/** The arena floor: dungeon tiles when the tileset exists, else a two-tone stone pattern. */
export function floor(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  const ts = SHEETS['tiles_dungeon'];
  const tiles = ts?.tiles;
  const f1 = tiles?.floor ?? tiles?.floor1 ?? tiles?.ground;
  if (ts && f1 !== undefined) {
    const f2 = tiles?.floor2 ?? f1, f3 = tiles?.floor3 ?? f1;
    const pick = [f1, f1, f2, f1, f3];
    for (let y = y0; y < y1; y += 16)
      for (let x = x0; x < x1; x += 16) drawFrame(ctx, 'tiles_dungeon', pick[((x * 7 + y * 13) / 16) % 5 | 0], x, y);
    return;
  }
  for (let y = y0; y < y1; y += 16)
    for (let x = x0; x < x1; x += 16) {
      const v = ((x * 7 + y * 13) / 16) % 3 | 0;
      rect(ctx, x, y, 16, 16, v === 0 ? '#3d3a4c' : v === 1 ? '#423f52' : '#3a3748');
      rect(ctx, x, y, 16, 1, '#4a4760');
      rect(ctx, x, y, 1, 16, '#4a4760');
    }
}

export function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(Math.round(x), Math.round(y), w / 2, w / 5, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** An effect sheet's 'play' animation centred at (x, y); a ring when the sheet is missing. */
export function effect(ctx: CanvasRenderingContext2D, sheet: string, t: number, life: number, x: number, y: number) {
  const def = SHEETS[sheet];
  if (def) {
    const L = animLength(sheet, 'play');
    const tt = L > 0 ? Math.min(0.999, t / life) * L : t;
    const f = animFrame(sheet, 'play', tt);
    if (def.origin) drawFrame(ctx, sheet, f, x, y, { anchored: true });
    else drawFrame(ctx, sheet, f, x - def.frameW / 2, y - def.frameH / 2);
    return;
  }
  const k = t / life;
  const col = sheet.includes('heal') ? '125,255,138' : sheet.includes('ice') ? '127,196,255' : sheet.includes('stagger') ? '255,214,90' : sheet.includes('fire') || sheet.includes('explosion') ? '255,138,61' : '255,255,255';
  ctx.strokeStyle = `rgba(${col},${(1 - k).toFixed(2)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 3 + k * 12, 0, Math.PI * 2);
  ctx.stroke();
}
