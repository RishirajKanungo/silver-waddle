// Drawing helpers for figure games, in game pixels. Colours come from CSS variables via theme().
import { drawFrame, SHEETS } from '../../art';

/** Read theme colours once per frame (canvas cannot use var(--x) directly). */
export function theme(el?: Element | null) {
  const cs = getComputedStyle(el ?? document.documentElement);
  const v = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb;
  return {
    bg: v('--surface', '#fff'),
    bg2: v('--surface2', '#eee'),
    fg: v('--fg', '#111'),
    muted: v('--muted', '#666'),
    line: v('--line', '#ccc'),
    accent: v('--accent', '#0e7490'),
    u: v('--c-u', '#1d5bbf'),
    v: v('--c-v', '#cf5a0c'),
    w: v('--c-w', '#17784b'),
    err: v('--c-err', '#c0303c'),
    ok: v('--ok', '#17784b'),
    bad: v('--bad', '#b3261e'),
    warn: v('--warn', '#935f00'),
  };
}
export type Theme = ReturnType<typeof theme>;

export function clear(ctx: CanvasRenderingContext2D, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

/** Crisp 1-px text. Uses the guide's bitmap font when present, else a small canvas font. */
export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left') {
  const font = SHEETS['font_pixel'];
  if (font && font.tiles) {
    const w = font.frameW;
    const total = s.length * w;
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    for (const ch of s) {
      const idx = font.tiles[ch];
      if (idx !== undefined) {
        ctx.save();
        // tint by drawing the glyph as a mask
        drawFrame(ctx, 'font_pixel', idx, cx, y - font.frameH + 2, { flash: 1, flashColor: color });
        ctx.restore();
      }
      cx += w;
    }
    return;
  }
  ctx.fillStyle = color;
  ctx.font = '8px monospace';
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, Math.round(x), Math.round(y));
}

export function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, stroke = false) {
  if (stroke) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
}

export function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, fill = true) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.stroke();
  }
}

/** A horizontal bar (HP/ATB) */
export function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, fill: string, back: string) {
  rect(ctx, x, y, w, h, back);
  rect(ctx, x, y, Math.max(0, Math.min(1, frac)) * w, h, fill);
}

/** Simple tiled ground so figures without a tileset still read as a game screen */
export function checker(ctx: CanvasRenderingContext2D, size: number, a: string, b: string) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  for (let y = 0; y < H; y += size)
    for (let x = 0; x < W; x += size) {
      ctx.fillStyle = ((x + y) / size) % 2 === 0 ? a : b;
      ctx.fillRect(x, y, size, size);
    }
}
