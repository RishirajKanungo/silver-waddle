// A small side-view scene shared by the side-view math figures: solid boxes drawn with the platform
// tileset, axis-separated AABB collision (the same "move, then push out" idea as move_and_slide).
import { drawFrame, SHEETS } from '../../art';

export type Box = [number, number, number, number]; // x, y, w, h in game pixels

export function drawSolids(ctx: CanvasRenderingContext2D, solids: Box[]) {
  const t = SHEETS['tiles_platform']?.tiles;
  for (const [x, y, w, h] of solids) {
    if (!t) {
      ctx.fillStyle = '#5b4a3a';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#6fae4a';
      ctx.fillRect(x, y, w, 3);
      continue;
    }
    const cols = Math.ceil(w / 16), rows = Math.ceil(h / 16);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const edge = cols === 1 ? 'single' : c === 0 ? 'l' : c === cols - 1 ? 'r' : '';
        const name = r === 0 ? (edge === 'single' ? 'ground_top_single' : edge ? 'ground_top_' + edge : 'ground_top') : edge === 'single' ? 'ground_single' : edge ? 'ground_' + edge : 'ground';
        drawFrame(ctx, 'tiles_platform', t[name] ?? t.ground ?? 0, x + c * 16, y + r * 16);
      }
    ctx.restore();
  }
}

export function sky(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#6fa8dc');
  g.addColorStop(1, '#bfe0f5');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

export interface Body {
  x: number; // feet centre
  y: number; // feet
  vx: number;
  vy: number;
  hw: number; // half width
  hh: number; // height
  onFloor: boolean;
}

const overlaps = (b: Body, s: Box) => b.x - b.hw < s[0] + s[2] && b.x + b.hw > s[0] && b.y - b.hh < s[1] + s[3] && b.y > s[1];

/** Move one axis at a time and push out of solids; sets onFloor and zeroes blocked velocity. */
export function moveAndCollide(b: Body, solids: Box[], dt: number) {
  b.x += b.vx * dt;
  for (const s of solids)
    if (overlaps(b, s)) {
      b.x = b.vx > 0 ? s[0] - b.hw : s[0] + s[2] + b.hw;
      b.vx = 0;
    }
  b.y += b.vy * dt;
  b.onFloor = false;
  for (const s of solids)
    if (overlaps(b, s)) {
      if (b.vy > 0) {
        b.y = s[1];
        b.onFloor = true;
      } else b.y = s[1] + s[3] + b.hh;
      b.vy = 0;
    }
}
