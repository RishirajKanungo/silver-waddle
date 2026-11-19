// Shared drawing helpers for the rpg "world" figures (dialogue, quests, cutscenes, UI, saves).
// Everything is in game pixels on a 320×180 canvas and uses the shared UI sheets:
// ui_panel (24×24 nine-slice, 8 px corners), ui_cursor (8×8, 'bob'), ui_bars (48×6 rows), font_pixel (6×8).
import { SHEETS, sheetCanvas, drawFrame, animFrame, text, rect } from '../game';

export const W = 320;
export const H = 180;
/** pixel font metrics: 6 px advance, baseline-relative drawing (text() draws glyph tops at y - 6) */
export const CHAR_W = 6;
export const LINE_H = 10;

/**
 * Nine-slice a texture region into (x, y, w, h). Mirrors NinePatchRect / StyleBoxTexture:
 * corners are copied 1:1, edges stretch (or tile) along one axis, the centre along both.
 */
export function drawNine(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { margin?: number; tile?: boolean; sheet?: string } = {},
) {
  const id = opts.sheet ?? 'ui_panel';
  const def = SHEETS[id];
  const src = sheetCanvas(id);
  const tw = def?.frameW ?? 24, th = def?.frameH ?? 24;
  const m = Math.max(0, Math.min(opts.margin ?? 8, Math.floor(tw / 2)));
  x = Math.round(x);
  y = Math.round(y);
  w = Math.max(0, Math.round(w));
  h = Math.max(0, Math.round(h));
  // If the target is smaller than the two margins, Godot squeezes the corners; we clamp the same way.
  const mx = Math.min(m, Math.floor(w / 2)), my = Math.min(m, Math.floor(h / 2));
  const cw = tw - 2 * m, ch = th - 2 * m; // source centre size
  const dw = w - 2 * mx, dh = h - 2 * my; // target centre size
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  const blit = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, ddw: number, ddh: number) => {
    if (sw <= 0 || sh <= 0 || ddw <= 0 || ddh <= 0) return;
    if (!opts.tile || (ddw === sw && ddh === sh)) {
      ctx.drawImage(src, sx, sy, sw, sh, dx, dy, ddw, ddh);
      return;
    }
    // tile: repeat the source piece, cropping the last copy
    for (let oy = 0; oy < ddh; oy += sh)
      for (let ox = 0; ox < ddw; ox += sw) {
        const pw = Math.min(sw, ddw - ox), ph = Math.min(sh, ddh - oy);
        ctx.drawImage(src, sx, sy, pw, ph, dx + ox, dy + oy, pw, ph);
      }
  };
  // corners
  blit(0, 0, mx, my, x, y, mx, my);
  blit(tw - mx, 0, mx, my, x + w - mx, y, mx, my);
  blit(0, th - my, mx, my, x, y + h - my, mx, my);
  blit(tw - mx, th - my, mx, my, x + w - mx, y + h - my, mx, my);
  // edges
  blit(m, 0, cw, my, x + mx, y, dw, my);
  blit(m, th - my, cw, my, x + mx, y + h - my, dw, my);
  blit(0, m, mx, ch, x, y + my, mx, dh);
  blit(tw - mx, m, mx, ch, x + w - mx, y + my, mx, dh);
  // centre
  blit(m, m, cw, ch, x + mx, y + my, dw, dh);
  ctx.restore();
}

/** Word-wrap s into lines of at most maxChars characters (like Label's Word autowrap). */
export function wrap(s: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const para of s.split('\n')) {
    let cur = '';
    for (const word of para.split(' ')) {
      if (!cur.length) cur = word;
      else if (cur.length + 1 + word.length <= maxChars) cur += ' ' + word;
      else {
        out.push(cur);
        cur = word;
      }
    }
    out.push(cur);
  }
  return out;
}

/**
 * Draw the first `visible` characters of `full`, wrapped as the full text would be (visible_characters),
 * or wrapped as the visible substring alone (the naive approach that makes words jump between lines).
 * Spaces at line breaks count as characters, as in the JS string.
 */
export function drawTyped(ctx: CanvasRenderingContext2D, full: string, visible: number, x: number, y: number, maxChars: number, color: string, naive = false) {
  const lines = naive ? wrap(full.slice(0, visible), maxChars) : wrap(full, maxChars);
  let left = naive ? Infinity : visible;
  lines.forEach((ln, i) => {
    const part = left >= ln.length ? ln : ln.slice(0, Math.max(0, left));
    if (part) text(ctx, part, x, y + i * LINE_H, color);
    left -= ln.length + 1; // +1 for the space the wrap removed
  });
  return lines.length;
}

/** Clip-draw one row of ui_bars (a TextureProgressBar fill) at fraction frac of its 46 px interior. */
export function drawBar(ctx: CanvasRenderingContext2D, tile: string, x: number, y: number, frac: number, opts: { flashColor?: string; widthPx?: number } = {}) {
  const def = SHEETS['ui_bars'];
  const row = def?.tiles?.[tile] ?? 0;
  const px = opts.widthPx ?? Math.round(Math.max(0, Math.min(1, frac)) * 46);
  if (px <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 1, y, px, 6);
  ctx.clip();
  drawFrame(ctx, 'ui_bars', row, x, y, opts.flashColor ? { flash: 1, flashColor: opts.flashColor } : {});
  ctx.restore();
}

export function drawBarFrame(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const def = SHEETS['ui_bars'];
  drawFrame(ctx, 'ui_bars', def?.tiles?.empty ?? 5, x, y);
  drawFrame(ctx, 'ui_bars', def?.tiles?.frame ?? 6, x, y);
}

/** The menu cursor (pointing glove) with its bob animation, tip at (x, y). */
export function drawCursor(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  if (SHEETS['ui_cursor']) drawFrame(ctx, 'ui_cursor', animFrame('ui_cursor', 'bob', t), x - 8, y - 4);
  else rect(ctx, x - 6, y - 2, 5, 4, '#fbf6e6');
}

/** A character sprite with a fallback box when the sheet does not exist yet. */
export function drawActor(ctx: CanvasRenderingContext2D, sheet: string, anim: string, t: number, x: number, y: number, flipH = false, fallback = '#c0bed4') {
  if (SHEETS[sheet]) drawFrame(ctx, sheet, animFrame(sheet, anim, t), x, y, { anchored: true, flipH });
  else {
    rect(ctx, x - 6, y - 20, 12, 20, fallback);
    rect(ctx, x - 4, y - 18, 8, 6, 'rgba(255,255,255,0.4)');
  }
}

/** A portrait: the top of a character's first idle frame, scaled ×1 into a 32×32 box. */
export function drawPortrait(ctx: CanvasRenderingContext2D, sheet: string, x: number, y: number) {
  rect(ctx, x, y, 32, 32, '#2c2840');
  const def = SHEETS[sheet];
  if (def) {
    const f = animFrame(sheet, 'idle_down', 0);
    const src = sheetCanvas(sheet);
    const cols = def.cols;
    const sx = (f % cols) * def.frameW, sy = Math.floor(f / cols) * def.frameH;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // the head sits in the upper part of a 32×32 frame: show the top 16 px at ×2
    ctx.drawImage(src, sx + 8, sy + 2, 16, 16, x, y, 32, 32);
    ctx.restore();
  } else {
    rect(ctx, x + 10, y + 6, 12, 12, '#f4b88e');
    rect(ctx, x + 8, y + 18, 16, 14, '#9c5e3c');
  }
  rect(ctx, x, y, 32, 32, '#86829e', true);
}

/** Grass ground from the overworld tiles, or a flat fill before the art exists. */
export function drawGround(ctx: CanvasRenderingContext2D, ox = 0, oy = 0, w = W, h = H) {
  const tiles = SHEETS['tiles_overworld'];
  if (!tiles) {
    ctx.fillStyle = '#4f9e3e';
    ctx.fillRect(0, 0, w, h);
    return;
  }
  const g = [tiles.tiles?.grass ?? 0, tiles.tiles?.grass2 ?? tiles.tiles?.grass ?? 0, tiles.tiles?.grass3 ?? tiles.tiles?.grass ?? 0];
  const sx = Math.floor(ox / 16) * 16, sy = Math.floor(oy / 16) * 16;
  for (let y = sy; y < oy + h + 16; y += 16)
    for (let x = sx; x < ox + w + 16; x += 16) {
      const k = ((((x / 16) * 7 + (y / 16) * 13) % 3) + 3) % 3;
      drawFrame(ctx, 'tiles_overworld', g[k], x - ox, y - oy);
    }
}

/** A tile from the overworld sheet by name, or nothing when it does not exist. */
export function overTile(name: string): number | undefined {
  return SHEETS['tiles_overworld']?.tiles?.[name];
}

/** An object frame by name (chest, coin, sign …) from the 'objects' sheet, if present. */
export function objectFrame(...names: string[]): number | undefined {
  const t = SHEETS['objects']?.tiles;
  if (!t) return undefined;
  for (const n of names) if (t[n] !== undefined) return t[n];
  return undefined;
}

export { text, rect };
