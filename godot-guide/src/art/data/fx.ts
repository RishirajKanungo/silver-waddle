// Effects: one `play` animation each, drawn procedurally frame by frame.
import type { ArtModule } from '../types';
import { C, Img, bayer, ellipse, line, outline, poly, ring, rng, toRGBA, packSheet, type Ramp } from './lib';
import { drawSmear } from './rig';
import { sparkle } from './poses';

const PI = Math.PI;
const FIRE: Ramp = [C.red1, C.red2, C.red3, C.gold3, C.white];

/** A dithered disc fading out: coverage 0..1 thins the pixels with an ordered pattern. */
function puff(img: Img, cx: number, cy: number, r: number, cover: number, cols: Ramp) {
  ellipse(img, cx, cy, r, r * 0.85, (x, y) => {
    if (bayer(x, y) > cover) return 0;
    const d = Math.hypot(x + 0.5 - cx + r * 0.3, y + 0.5 - cy + r * 0.3) / (r * 1.3);
    return cols[Math.max(0, Math.min(cols.length - 1, Math.floor((1 - d) * cols.length)))];
  });
}
function star4(img: Img, x: number, y: number, len: number, c: number, rim: number) {
  for (let k = -len; k <= len; k++) {
    const cc = Math.abs(k) === len ? rim : c;
    img.set(x + k, y, cc);
    img.set(x, y + k, cc);
  }
  if (len >= 2) for (const [dx, dy] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) img.set(x + dx, y + dy, rim);
}

function slash(k: number) {
  const img = new Img(32, 32);
  const spans = [
    { a0: -PI * 0.85, a1: -PI * 0.55, w: 3 },
    { a0: -PI * 0.85, a1: PI * 0.05, w: 6 },
    { a0: -PI * 0.5, a1: PI * 0.25, w: 4, fade: true },
    { a0: -PI * 0.05, a1: PI * 0.3, w: 2, fade: true },
  ][k];
  drawSmear(img, { cx: 14, cy: 17, r: 13, ...spans });
  if (k === 1) sparkle(img, 27, 18, 2, C.white, C.tea3);
  return img;
}
function hit(k: number) {
  const img = new Img(16, 16);
  if (k === 0) star4(img, 8, 8, 2, C.white, C.gold3);
  if (k === 1) {
    star4(img, 8, 8, 6, C.white, C.gold2);
    ellipse(img, 8, 8, 2.5, 2.5, C.white);
    for (const [dx, dy] of [[4, 4], [-4, -4], [4, -4], [-4, 4]]) img.set(8 + dx, 8 + dy, C.gold3);
  }
  if (k === 2) {
    ring(img, 8, 8, 4.5, 6, (x, y) => ((x + y) % 3 === 0 ? 0 : C.gold3));
    star4(img, 8, 8, 1, C.white, C.gold3);
  }
  if (k === 3) for (const [x, y] of [[2, 3], [13, 2], [14, 12], [3, 13], [8, 1]]) img.set(x, y, C.gold3);
  return img;
}
function dust(k: number) {
  const img = new Img(16, 16);
  const cols: Ramp = [C.stn2, C.snd1, C.snd2, C.skin3];
  const r = [2.5, 3.5, 4.5, 5][k], cover = [1, 0.9, 0.6, 0.3][k];
  puff(img, 5 - k * 0.6, 11 - k * 0.6, r * 0.8, cover, cols);
  puff(img, 11 + k * 0.6, 11 - k * 0.4, r * 0.7, cover, cols);
  puff(img, 8, 9 - k, r * 0.6, cover * 0.9, cols);
  return k < 2 ? outline(img, { color: C.stn1 }) : img;
}
function fireball(k: number) {
  const img = new Img(16, 16);
  const r = rng(30 + k);
  // flame tongues trailing left
  for (let i = 0; i < 7; i++) {
    const y = 8 + (r() - 0.5) * 7, len = 4 + r() * 5;
    line(img, 9, Math.round(8 + (y - 8) * 0.4), Math.round(9 - len), Math.round(y + (k % 2 ? 1 : -1) * (r() - 0.5) * 2), (t) => (t < 0.35 ? FIRE[2] : t < 0.7 ? FIRE[1] : FIRE[0]));
  }
  ellipse(img, 10, 8, 4, 3.6, (x, y) => (Math.hypot(x - 10.5, y - 7.6) < 2 ? C.white : Math.hypot(x - 10, y - 8) < 3 ? C.gold3 : C.red3));
  const o = outline(img, { color: C.red0 });
  o.set(14 - (k % 2), 4 + k, C.gold3);
  return o;
}
function ice(k: number) {
  const img = new Img(16, 16);
  const R: Ramp = [C.tea1, C.tea2, C.tea3, C.white];
  const shard = (cx: number, cy: number, h: number, w: number) =>
    poly(img, [[cx, cy - h], [cx + w, cy], [cx, cy + 2], [cx - w, cy]], (x, y) => (x < cx ? (y < cy - h / 2 ? R[3] : R[2]) : y < cy - h / 2 ? R[1] : R[1]));
  if (k < 3) {
    const s = [0.4, 0.8, 1][k];
    shard(8, 13, 11 * s, 2.5);
    shard(4, 14, 6 * s, 2);
    shard(12, 14, 7 * s, 2);
    const o = outline(img, { color: C.blu0 });
    if (k === 2) {
      sparkle(o, 3, 4, 1, C.white, C.tea3);
      sparkle(o, 13, 6, 1, C.white, C.tea3);
    }
    return o;
  }
  // shatter
  for (const [x, y] of [[3, 5], [12, 4], [7, 2], [2, 11], [14, 10], [9, 8], [5, 13], [11, 13]]) {
    img.set(x, y, C.tea3);
    img.set(x + 1, y, C.white);
  }
  return img;
}
function explosion(k: number) {
  const img = new Img(32, 32);
  const r = [4, 8, 11, 13, 14, 14][k];
  const smoke: Ramp = [C.stn0, C.stn1, C.stn2, C.stn3];
  if (k <= 2) {
    ellipse(img, 16, 16, r, r, (x, y) => {
      const d = Math.hypot(x + 0.5 - 16, y + 0.5 - 16) / r;
      const n = (x * 13 + y * 7) % 5 === 0 ? 0.15 : 0;
      const v = d + n;
      return v < 0.35 ? C.white : v < 0.6 ? C.gold3 : v < 0.82 ? C.red3 : C.red2;
    });
    if (k === 2) for (let a = 0; a < 8; a++) sparkle(img, Math.round(16 + Math.cos(a * 0.8) * 13), Math.round(16 + Math.sin(a * 0.8) * 13), 1, C.gold3, C.red3);
    return outline(img, { color: C.red0 });
  }
  // smoke clouds that rise and thin out, with embers
  const cover = [0.95, 0.7, 0.4][k - 3];
  const rr = rng(9);
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + 0.3, d = 6 + (k - 3) * 2;
    puff(img, 16 + Math.cos(a) * d, 16 + Math.sin(a) * d - (k - 3) * 2, 5 - (k - 3) * 0.5 + rr(), cover, smoke);
  }
  if (k === 3) ellipse(img, 16, 16, 4, 4, (x, y) => ((x + y) & 1 ? C.red3 : C.gold3));
  for (let i = 0; i < 5; i++) img.set(Math.round(4 + rr() * 24), Math.round(4 + rr() * 20) - k, C.gold3);
  return img;
}
function heal(k: number) {
  const img = new Img(16, 16);
  const R = [C.grn2, C.grn3, C.white];
  // a ring gathers at the feet, then sparkles and crosses rise
  if (k < 3)
    for (let a = 0; a < PI * 2; a += 0.08) {
      const rx = 2.5 + k * 2, x = Math.round(8 + Math.cos(a) * rx), y = Math.round(13 + Math.sin(a) * rx * 0.4);
      img.set(x, y, Math.sin(a) > 0 ? R[1] : R[0]);
    }
  const rise = [[3, 12], [12, 10], [7, 8], [10, 5], [5, 3], [8, 1]];
  for (let i = 0; i < rise.length; i++) {
    const age = k - i * 0.6;
    if (age < 0 || age > 3) continue;
    const [x, y0] = rise[i];
    const y = Math.round(y0 + 3 - age * 2);
    if (i % 2) sparkle(img, x, y, age < 2.2 ? 1 : 0, C.white, C.grn3);
    else {
      img.set(x, y, R[1]);
      img.set(x - 1, y, R[0]);
      img.set(x + 1, y, R[0]);
      img.set(x, y - 1, R[0]);
      img.set(x, y + 1, R[0]);
      if (age < 1.5) img.set(x, y, C.white);
    }
  }
  return img;
}
function staggerStars(k: number) {
  const img = new Img(16, 16);
  for (let s = 0; s < 3; s++) {
    const a = (k / 4) * PI * 2 + (s * 2 * PI) / 3;
    const x = Math.round(8 + Math.cos(a) * 6), y = Math.round(8 + Math.sin(a) * 2.5);
    const front = Math.sin(a) > 0;
    star4(img, x, y, front ? 2 : 1, C.gold3, front ? C.gold2 : C.gold1);
    img.set(x, y, C.white);
  }
  return img;
}
function levelup(k: number) {
  const img = new Img(32, 32);
  // a pillar of light rising, with a gold ring at the base and sparkles drifting up
  const h = [8, 18, 28, 30, 30, 24][k];
  const w = [3, 5, 6, 5, 4, 2][k];
  for (let y = 31 - h; y < 31; y++)
    for (let x = 16 - w; x <= 16 + w; x++) {
      const d = Math.abs(x - 16) / (w + 0.5);
      const fade = (y - (31 - h)) / h;
      if (bayer(x, y) > 0.35 + fade * 0.8 && d > 0.4) continue;
      img.set(x, y, d < 0.3 ? C.white : d < 0.7 ? C.gold3 : C.gold2);
    }
  if (k < 4)
    for (let a = 0; a < PI * 2; a += 0.05) {
      const rx = 5 + k * 3, x = Math.round(16 + Math.cos(a) * rx), y = Math.round(28 + Math.sin(a) * rx * 0.3);
      img.set(x, y, Math.sin(a) > 0 ? C.gold3 : C.gold2);
    }
  const sp = [[6, 20], [26, 16], [9, 8], [23, 5], [13, 14], [20, 24]];
  sp.forEach(([x, y], i) => {
    if (k >= 1 && (i + k) % 2 === 0) sparkle(img, x, y - k * 2, k > 3 ? 1 : 2, C.white, C.gold3);
  });
  return img;
}

function fxSheet(id: string, title: string, fw: number, n: number, draw: (k: number) => Img, fps: number, loop: boolean, notes: string): ArtModule['sheets'][number] {
  const make = () => packSheet(Array.from({ length: n }, (_, k) => draw(k)), n, fw, fw, 1);
  return {
    def: { id, kind: 'fx', title, file: `assets/fx/${id.replace(/^fx_/, '')}.png`, frameW: fw, frameH: fw, cols: n, rows: 1, origin: [fw / 2, fw / 2], anims: { play: { frames: Array.from({ length: n }, (_, k) => k), fps, loop } }, notes },
    render: () => toRGBA(make()),
  };
}

export const ART: ArtModule = {
  sheets: [
    fxSheet('fx_slash', 'Slash arc', 32, 4, slash, 15, false, 'A sword arc sweeping clockwise from the upper left. Rotate or flip it to match the swing direction.'),
    fxSheet('fx_hit', 'Hit spark', 16, 4, hit, 15, false, 'Spawn at the point of contact on a hit; free it when the animation finishes.'),
    fxSheet('fx_dust', 'Dust puff', 16, 4, dust, 12, false, 'Footstep, landing and dash dust. Spawn at the feet.'),
    fxSheet('fx_fireball', 'Fireball', 16, 4, fireball, 12, true, 'A looping projectile flying right; rotate the node to aim it.'),
    fxSheet('fx_ice', 'Ice burst', 16, 4, ice, 10, false, 'Ice shards grow from the ground and shatter.'),
    fxSheet('fx_explosion', 'Explosion', 32, 6, explosion, 14, false, 'Flash, fireball, then smoke and embers.'),
    fxSheet('fx_heal', 'Heal sparkles', 16, 6, heal, 10, false, 'A green ring gathers at the feet, then sparkles and crosses rise.'),
    fxSheet('fx_stagger', 'Dazed stars', 16, 4, staggerStars, 8, true, 'Three stars circling the head while staggered; place above the head.'),
    fxSheet('fx_levelup', 'Level up', 32, 6, levelup, 10, false, 'A pillar of golden light with a ring and rising sparkles; origin at the centre, place with the bottom at the feet.'),
  ],
};
