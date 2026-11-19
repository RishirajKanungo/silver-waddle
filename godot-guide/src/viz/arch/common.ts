// Helpers shared by the architecture, combat-feel and AI figures (core.fsm, core.component*,
// combat.hit*, combat.frame, combat.ai*). Local to this folder so the shared kits stay untouched.
import { SHEETS, drawFrame, animFrame, rect, text, circle, playSound } from '../game';
import './arch.css';

export type Box = readonly [number, number, number, number];
export type Facing = 'down' | 'up' | 'side';

/** Godot's move_toward for floats. */
export const moveToward = (v: number, target: number, maxDelta: number) => (Math.abs(target - v) <= maxDelta ? target : v + Math.sign(target - v) * maxDelta);

/** Vector2.move_toward on {vx, vy}, in place. */
export function moveToward2(o: { vx: number; vy: number }, tx: number, ty: number, maxDelta: number) {
  const dx = tx - o.vx, dy = ty - o.vy;
  const d = Math.hypot(dx, dy);
  if (d <= maxDelta || d === 0) {
    o.vx = tx;
    o.vy = ty;
  } else {
    o.vx += (dx / d) * maxDelta;
    o.vy += (dy / d) * maxDelta;
  }
}

/** Does a feet box centred at (x, y) (bottom edge at y) overlap any wall? */
export function feetHit(walls: readonly Box[], x: number, y: number, fw = 10, fh = 6) {
  for (const [bx, by, bw, bh] of walls) if (x - fw / 2 < bx + bw && x + fw / 2 > bx && y - fh < by + bh && y > by) return true;
  return false;
}

/** move_and_slide for a feet box: one axis at a time, zeroing the blocked component. Returns true on a wall hit. */
export function slide(b: { x: number; y: number; vx: number; vy: number }, walls: readonly Box[], dt: number, fw = 10, fh = 6) {
  let hit = false;
  const dx = b.vx * dt, dy = b.vy * dt;
  b.x += dx;
  if (feetHit(walls, b.x, b.y, fw, fh)) {
    b.x -= dx;
    b.vx = 0;
    hit = true;
  }
  b.y += dy;
  if (feetHit(walls, b.x, b.y, fw, fh)) {
    b.y -= dy;
    b.vy = 0;
    hit = true;
  }
  return hit;
}

export const overlap = (a: Box, b: Box) => a[0] < b[0] + b[2] && a[0] + a[2] > b[0] && a[1] < b[1] + b[3] && a[1] + a[3] > b[1];

/** Facing from a direction, like Character.face(): returns null for a zero vector. */
export function faceFrom(dx: number, dy: number): { facing: Facing; flip: boolean } | null {
  if (dx === 0 && dy === 0) return null;
  if (Math.abs(dx) > Math.abs(dy)) return { facing: 'side', flip: dx < 0 };
  return { facing: dy < 0 ? 'up' : 'down', flip: false };
}

const FALLBACK: Record<string, string> = { hero: '#3a6fc4', mage: '#7044a8', guard: '#9a2a3a', skeleton: '#c0bed4', golem: '#86829e', slime: '#4f9e3e', bat: '#7044a8' };

/** Does the sheet exist and have this animation? */
export const hasAnim = (sheet: string, anim: string) => !!SHEETS[sheet]?.anims?.[anim];

/** Like Character.play_anim: "walk" → "walk_side" if it exists, else "walk". */
export function dirAnim(sheet: string, base: string, facing: Facing) {
  const a = base + '_' + facing;
  if (hasAnim(sheet, a)) return a;
  if (base === 'jump' && facing === 'up' && hasAnim(sheet, 'jump_down')) return 'jump_down';
  return base;
}

/** Frame of a non-looping animation chosen by progress 0..1 (so 4 art frames can span any number of ticks). */
export function frameAt(sheet: string, anim: string, frac: number) {
  const a = SHEETS[sheet]?.anims?.[anim];
  if (!a || !a.frames.length) return 0;
  return a.frames[Math.min(a.frames.length - 1, Math.max(0, Math.floor(frac * a.frames.length)))];
}

export interface CharOpts {
  flip?: boolean;
  alpha?: number;
  flash?: number;
  flashColor?: string;
  /** use this frame instead of animating by t */
  frame?: number;
  scale?: number;
}

/** A sprite with its feet at (x, y). Falls back to a simple figure before the art exists. */
export function drawChar(ctx: CanvasRenderingContext2D, sheet: string, anim: string, t: number, x: number, y: number, o: CharOpts = {}) {
  const def = SHEETS[sheet];
  if (def) {
    const fr = o.frame ?? animFrame(sheet, anim, t);
    drawFrame(ctx, sheet, fr, x, y, { anchored: true, flipH: o.flip, alpha: o.alpha, flash: o.flash, flashColor: o.flashColor, scale: o.scale });
    return;
  }
  ctx.save();
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  const s = o.scale ?? 1;
  const f = o.flash && o.flash > 0.4 ? o.flashColor ?? '#fff' : null;
  const col = f ?? FALLBACK[sheet] ?? '#3a6fc4';
  const bob = anim.startsWith('walk') || anim === 'hop' || anim === 'fly' ? Math.floor(t * 8) % 2 : 0;
  if (sheet === 'slime') {
    const squash = anim === 'hop' ? 1 + 0.2 * Math.sin(t * 12) : 1;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(x, y - 4 * s * squash, 7 * s, 5 * s * squash, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!f) rect(ctx, x - 3 * s, y - 6 * s * squash, s, 2 * s, '#1a1424'), rect(ctx, x + 2 * s, y - 6 * s * squash, s, 2 * s, '#1a1424');
  } else if (sheet === 'bat') {
    const wing = Math.floor(t * 10) % 2 ? 4 : 1;
    rect(ctx, x - 3, y - 14, 6, 5, col);
    rect(ctx, x - 9, y - 14 - wing, 6, 3, col);
    rect(ctx, x + 3, y - 14 - wing, 6, 3, col);
  } else if (sheet === 'golem') {
    rect(ctx, x - 14 * s, y - 34 * s, 28 * s, 30 * s, col);
    rect(ctx, x - 18 * s, y - 28 * s, 6 * s, 16 * s, f ?? '#514c68');
    rect(ctx, x + 12 * s, y - 28 * s, 6 * s, 16 * s, f ?? '#514c68');
    rect(ctx, x - 10 * s, y - 4 * s, 7 * s, 4 * s, f ?? '#514c68');
    rect(ctx, x + 3 * s, y - 4 * s, 7 * s, 4 * s, f ?? '#514c68');
    if (!f) rect(ctx, x - 6 * s, y - 28 * s, 12 * s, 2 * s, anim === 'windup' ? '#f8925e' : '#9aeaee');
  } else {
    rect(ctx, x - 5 * s, y - (13 + bob) * s, 10 * s, 11 * s, col);
    rect(ctx, x - 4 * s, y - (20 + bob) * s, 8 * s, 7 * s, f ?? (sheet === 'skeleton' ? '#fbf6e6' : '#f4b88e'));
    rect(ctx, x - 4 * s, y - 3 * s, 3 * s, 3 * s, f ?? '#33202a');
    rect(ctx, x + s, y - 3 * s, 3 * s, 3 * s, f ?? '#33202a');
    const side = anim.endsWith('side') || sheet === 'skeleton';
    const eyeX = o.flip ? x - 3 * s : side ? x + s : x - 2 * s;
    if (!anim.endsWith('up') && !f) rect(ctx, eyeX, y - (17 + bob) * s, (side ? 1 : 4) * s, s, '#1a1424');
    if (anim.startsWith('attack') || anim === 'attack') {
      const dir = o.flip ? -1 : 1;
      rect(ctx, x + dir * 6 * s - (dir < 0 ? 8 * s : 0), y - 12 * s, 8 * s, 2 * s, '#c0bed4');
    }
  }
  ctx.restore();
}

/** A soft elliptical shadow under a character. */
export function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx = 6, ry = 2.5, alpha = 0.3) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(Math.round(x), Math.round(y), rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Floor for a room: dungeon flagstones (or grass), from the tile sheets when they exist. */
export function drawFloor(ctx: CanvasRenderingContext2D, w: number, h: number, kind: 'dungeon' | 'grass' = 'dungeon') {
  const sheet = kind === 'dungeon' ? 'tiles_dungeon' : 'tiles_overworld';
  const def = SHEETS[sheet];
  const base = kind === 'dungeon' ? '#3b3a4a' : '#5a8f4e';
  const alt = kind === 'dungeon' ? '#37364a' : '#548848';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  if (!def) {
    ctx.fillStyle = alt;
    for (let ty = 0; ty * 16 < h; ty++) for (let tx = 0; tx * 16 < w; tx++) if ((tx + ty) % 2) ctx.fillRect(tx * 16, ty * 16, 16, 16);
    return;
  }
  const t = def.tiles ?? {};
  if (kind === 'dungeon') {
    const ids = [t.floor ?? 0, t.floor2 ?? t.floor ?? 0, t.floor3 ?? t.floor ?? 0, t.floor_cracked ?? t.floor ?? 0];
    for (let ty = 0; ty * 16 < h; ty++)
      for (let tx = 0; tx * 16 < w; tx++) {
        const r = (tx * 73 + ty * 151 + tx * ty * 7) % 23;
        drawFrame(ctx, sheet, ids[r < 17 ? 0 : r < 20 ? 1 : r < 22 ? 2 : 3], tx * 16, ty * 16);
      }
    // push the busy floor back so characters and effects read clearly
    ctx.fillStyle = 'rgba(26,20,36,0.35)';
    ctx.fillRect(0, 0, w, h);
    return;
  }
  const ids = [t.grass ?? 0, t.grass2 ?? t.grass ?? 0, t.grass3 ?? t.grass ?? 0];
  for (let ty = 0; ty * 16 < h; ty++) for (let tx = 0; tx * 16 < w; tx++) drawFrame(ctx, sheet, ids[(tx * 7 + ty * 13) % 3], tx * 16, ty * 16);
}

/** A stone wall block: the dungeon's wall-top tiles clipped to the box, or flat colours before the art exists. */
export function drawWall(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const def = SHEETS['tiles_dungeon'];
  const top = def?.tiles?.wall_top_c;
  if (def && top !== undefined) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    for (let ty = Math.floor(y / 16) * 16; ty < y + h; ty += 16) for (let tx = Math.floor(x / 16) * 16; tx < x + w; tx += 16) drawFrame(ctx, 'tiles_dungeon', top, tx, ty);
    ctx.restore();
    rect(ctx, x, y, w, h, '#1a1424', true);
    return;
  }
  rect(ctx, x, y, w, h, '#2a2838');
  rect(ctx, x, y, w, Math.min(4, h), '#514c68');
  rect(ctx, x, y + h - 1, w, 1, '#1a1424');
}

/** A small HP bar above a character. */
export function hpBar(ctx: CanvasRenderingContext2D, x: number, y: number, frac: number, w = 16) {
  rect(ctx, x - w / 2 - 1, y - 1, w + 2, 4, '#1a1424');
  rect(ctx, x - w / 2, y, w, 2, '#4a1530');
  rect(ctx, x - w / 2, y, Math.max(0, Math.min(1, frac)) * w, 2, frac > 0.3 ? '#a2d052' : '#f8925e');
}

/** A label with a dark plate behind it, centred at (x, y baseline). */
export function tag(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color = '#ffffff', plate = 'rgba(0,0,0,0.6)') {
  const w = s.length * 6 + 4;
  rect(ctx, x - w / 2, y - 8, w, 10, plate);
  text(ctx, s, x, y, color, 'center');
}

// ------------------------------------------------------------------------- trauma camera shake
/** ShakeCamera from k01-2: trauma decays linearly, offset = max_offset * trauma^power * noise. */
export class Shake {
  trauma = 0;
  t = 0;
  ox = 0;
  oy = 0;
  add(a: number) {
    this.trauma = Math.min(1, this.trauma + a);
  }
  step(dt: number, decay: number, maxX: number, maxY: number, power = 2) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - decay * dt);
    const s = Math.pow(this.trauma, power);
    this.ox = Math.round(maxX * s * noise1(this.t * 30));
    this.oy = Math.round(maxY * s * noise1(this.t * 30 + 100));
  }
}

/** Smooth 1D value noise in [-1, 1] (stands in for FastNoiseLite). */
export function noise1(x: number) {
  const i = Math.floor(x), f = x - i;
  const h = (n: number) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

// ------------------------------------------------------------------------- sparks and numbers
export interface Fx {
  kind: 'spark' | 'num' | 'ring';
  x: number;
  y: number;
  t: number;
  life: number;
  val?: number;
  big?: boolean;
}

/** Update and draw short-lived effects in place. */
export function stepFx(list: Fx[], dt: number) {
  for (let i = list.length - 1; i >= 0; i--) {
    list[i].t += dt;
    if (list[i].t >= list[i].life) list.splice(i, 1);
  }
}

export function drawFx(ctx: CanvasRenderingContext2D, list: Fx[]) {
  for (const f of list) {
    const k = f.t / f.life;
    if (f.kind === 'spark') {
      if (SHEETS['fx_hit']) drawFrame(ctx, 'fx_hit', frameAt('fx_hit', 'play', k), f.x, f.y, { anchored: true });
      else {
        const r = 2 + k * 8;
        ctx.save();
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#fff09a';
        ctx.lineWidth = 2;
        for (let a = 0; a < 6; a++) {
          const ang = (a / 6) * Math.PI * 2 + 0.3;
          ctx.beginPath();
          ctx.moveTo(f.x + Math.cos(ang) * r * 0.4, f.y + Math.sin(ang) * r * 0.4);
          ctx.lineTo(f.x + Math.cos(ang) * r, f.y + Math.sin(ang) * r);
          ctx.stroke();
        }
        if (k < 0.3) circle(ctx, f.x, f.y, 3, '#ffffff');
        ctx.restore();
      }
    } else if (f.kind === 'num') {
      // rise with ease-out for 0.45 s, fade over the last 0.15 s (the DamageNumber tween)
      const rise = 14 * (1 - (1 - Math.min(1, f.t / 0.45)) ** 2);
      ctx.save();
      ctx.globalAlpha = f.t > f.life - 0.15 ? (f.life - f.t) / 0.15 : 1;
      const s = String(f.val ?? 0);
      text(ctx, s, f.x + 1, f.y - rise + 1, '#1a1424', 'center');
      text(ctx, s, f.x, f.y - rise, f.big ? '#fff09a' : '#ffffff', 'center');
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = 1 - k;
      circle(ctx, f.x, f.y, 4 + k * 18, '#fbf6e6', false);
      ctx.restore();
    }
  }
}

/** playSound that can be muted from a figure. */
export function sfx(on: boolean, id: string, vol = 0.5) {
  if (on) playSound(id, vol);
}

/** Pixel-art dashed outline for a hitbox/hurtbox. */
export function boxOutline(ctx: CanvasRenderingContext2D, b: Box, color: string, fill?: string) {
  if (fill) rect(ctx, b[0], b[1], b[2], b[3], fill);
  rect(ctx, b[0], b[1], b[2], b[3], color, true);
}

/** Tile grid A* (4-neighbour with diagonal shortcuts when both sides are free). Returns tile centres. */
export function astar(grid: Uint8Array, cols: number, rows: number, sx: number, sy: number, gx: number, gy: number): [number, number][] {
  const idx = (x: number, y: number) => y * cols + x;
  if (sx < 0 || sy < 0 || gx < 0 || gy < 0 || sx >= cols || gx >= cols || sy >= rows || gy >= rows) return [];
  if (grid[idx(gx, gy)]) return [];
  const N = cols * rows;
  const g = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const open: number[] = [idx(sx, sy)];
  g[idx(sx, sy)] = 0;
  const hf = (i: number) => {
    const x = i % cols, y = (i / cols) | 0;
    const dx = Math.abs(x - gx), dy = Math.abs(y - gy);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  };
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (g[open[k]] + hf(open[k]) < g[open[bi]] + hf(open[bi])) bi = k;
    const cur = open.splice(bi, 1)[0];
    if (cur === idx(gx, gy)) break;
    closed[cur] = 1;
    const cx = cur % cols, cy = (cur / cols) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = idx(nx, ny);
        if (grid[ni] || closed[ni]) continue;
        if (dx && dy && (grid[idx(cx + dx, cy)] || grid[idx(cx, cy + dy)])) continue;
        const ng = g[cur] + (dx && dy ? 1.414 : 1);
        if (ng < g[ni]) {
          g[ni] = ng;
          came[ni] = cur;
          if (!open.includes(ni)) open.push(ni);
        }
      }
  }
  const goal = idx(gx, gy);
  if (came[goal] < 0 && goal !== idx(sx, sy)) return [];
  const path: [number, number][] = [];
  for (let c = goal; c !== -1 && c !== idx(sx, sy); c = came[c]) path.push([(c % cols) * 16 + 8, ((c / cols) | 0) * 16 + 8]);
  return path.reverse();
}

/** Is the segment a→b clear of walls? (sampled every 2 px, like a ray query against the world layer) */
export function lineClear(walls: readonly Box[], ax: number, ay: number, bx: number, by: number) {
  const d = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.ceil(d / 2));
  for (let i = 1; i < n; i++) {
    const x = ax + ((bx - ax) * i) / n, y = ay + ((by - ay) * i) / n;
    for (const [wx, wy, ww, wh] of walls) if (x >= wx && x < wx + ww && y >= wy && y < wy + wh) return false;
  }
  return true;
}
