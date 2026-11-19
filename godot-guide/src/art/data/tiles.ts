// Tilesets: overworld (top-down terrain for Godot terrains), dungeon, and a side-view platform set.
// Every texture is a function of the pixel position modulo 16, so neighbouring tiles always meet
// seamlessly. Terrain transitions (path, water) come from a field interpolated between the four tile
// corners plus tile-periodic noise: two tiles that share a corner value also share the boundary.
import type { ArtModule, SheetDef } from '../types';
import { C, Img, RAMPS, ballShade, bayer, blit, ellipse, hash2, line, outline, poly, rect, rng, tnoise, toRGBA, hline, vline } from './lib';
import { sparkle } from './poses';

const T = 16;
const PI = Math.PI;
type Px = (x: number, y: number) => number;
const tile = (f: Px) => {
  const img = new Img(T, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) img.set(x, y, f(x, y));
  return img;
};
const m16 = (v: number) => ((v % 16) + 16) % 16;

class Sheet {
  cols = 16;
  rows: number;
  img: Img;
  tiles: Record<string, number> = {};
  constructor(rows: number) {
    this.rows = rows;
    this.img = new Img(16 * T, rows * T);
  }
  put(name: string, col: number, row: number, t: Img) {
    if (col >= this.cols || row >= this.rows) throw new Error(`tile ${name} out of range`);
    blit(this.img, t, col * T, row * T);
    if (name) this.tiles[name] = row * this.cols + col;
  }
  /** a w×h block of tiles cut from a larger image, named name_<k> or by the names given */
  block(col: number, row: number, big: Img, names: string[][]) {
    names.forEach((r, j) =>
      r.forEach((n, i) => {
        const t = new Img(T, T);
        for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) t.set(x, y, big.get(i * T + x, j * T + y));
        this.put(n, col + i, row + j, t);
      }),
    );
  }
}

// ======================================================================================== textures
const G = RAMPS.green;
function tuft(img: Img, x: number, y: number, hi = G[3], lo = G[1]) {
  img.set(x - 1, y + 1, hi);
  img.set(x, y, hi);
  img.set(x + 1, y + 1, hi);
  img.set(x, y + 1, G[2]);
  img.set(x - 1, y + 2, lo);
  img.set(x, y + 2, lo);
  img.set(x + 1, y + 2, lo);
}
const TUFTS: [number, number][][] = [
  [[3, 3], [11, 6], [6, 11]],
  [[2, 2], [9, 3], [13, 9], [5, 8], [10, 12]],
  [[12, 11]],
];
/** Grass ground: base green, a soft low-frequency mottle, and a few tufts (variant 0..2). */
function grassImg(v = 0): Img {
  const img = tile((x, y) => {
    const n = tnoise(x / 8, y / 8, 2, 11 + v);
    if (n < 0.3 && bayer(x, y) < 0.13) return G[1];
    if (n > 0.72 && bayer(x + 1, y + 2) < 0.1) return G[3];
    return G[2];
  });
  for (const [x, y] of TUFTS[v]) tuft(img, x, y);
  if (v === 2)
    for (const [x, y] of [[4, 4], [8, 9], [13, 3]]) {
      img.set(x, y, G[3]);
      img.set(x + 1, y, G[3]);
    }
  return img;
}
const GRASS = [grassImg(0), grassImg(1), grassImg(2)];
const grassPx: Px = (x, y) => GRASS[0].get(m16(x), m16(y));

const pathPx: Px = (x, y) => {
  x = m16(x);
  y = m16(y);
  const n = tnoise(x / 4, y / 4, 4, 5);
  if (hash2(x, y, 9) < 0.025) return C.brn2;
  if (hash2(x, y - 1, 9) < 0.025) return C.snd2;
  if (n > 0.66) return C.snd2;
  if (n > 0.6 && bayer(x, y) < 0.3) return C.snd2;
  if (n < 0.25 && bayer(x, y) < 0.2) return C.brn2;
  return C.snd1;
};
function waterPx(x: number, y: number, frame: number) {
  x = m16(x);
  y = m16(y);
  const ph = (frame * 16) / 3;
  const v = Math.sin(((x + ph) * 2 * PI) / 16 + Math.sin((y * 2 * PI) / 8) * 1.6);
  const row = y % 4;
  if (row === 1 && v > 0.82) return v > 0.96 ? C.tea3 : C.tea2;
  if (row === 3 && Math.sin(((x - ph + 5) * 2 * PI) / 16) > 0.9) return C.tea2;
  const n = tnoise(x / 8, y / 8, 2, 3);
  if (n < 0.35 && bayer(x, y) < 0.3) return C.blu1;
  return C.tea1;
}

/** corner field: corners [nw, ne, sw, se] in {0,1}, plus periodic wobble */
function field(cn: number[], x: number, y: number, seed: number) {
  const u = (x + 0.5) / T, v = (y + 0.5) / T;
  const b = cn[0] * (1 - u) * (1 - v) + cn[1] * u * (1 - v) + cn[2] * (1 - u) * v + cn[3] * u * v;
  const w = (tnoise(m16(x) / 4, m16(y) / 4, 4, seed) - 0.5) * 0.28;
  return b + w;
}
function pathTile(cn: number[]) {
  return tile((x, y) => {
    const f = field(cn, x, y, 21);
    if (f > 0.56) return pathPx(x, y);
    if (f > 0.5) return f > 0.53 ? C.brn2 : C.brn1; // shaded rim under the grass
    if (f > 0.45) return G[3]; // sunlit grass lip
    return grassPx(x, y);
  });
}
function waterTile(cn: number[]) {
  return tile((x, y) => {
    const f = field(cn, x, y, 33);
    if (f > 0.6) return waterPx(x, y, 0);
    if (f > 0.53) return (x + y) & 1 && f > 0.57 ? C.tea2 : C.tea3; // foam
    if (f > 0.5) return C.white;
    if (f > 0.45) return C.brn1; // wet bank
    if (f > 0.41) return G[1];
    return grassPx(x, y);
  });
}
// The 15 transition tiles of a corner (dual-grid style) terrain, keyed by their position in a 3×3
// island, a 2×2 hole and the two diagonals. Corners are [nw, ne, sw, se].
const TERRAIN: [string, number[]][] = [
  ['tl', [0, 0, 0, 1]], ['t', [0, 0, 1, 1]], ['tr', [0, 0, 1, 0]],
  ['l', [0, 1, 0, 1]], ['c', [1, 1, 1, 1]], ['r', [1, 0, 1, 0]],
  ['bl', [0, 1, 0, 0]], ['b', [1, 1, 0, 0]], ['br', [1, 0, 0, 0]],
  ['inner_tl', [1, 1, 1, 0]], ['inner_tr', [1, 1, 0, 1]],
  ['inner_bl', [1, 0, 1, 1]], ['inner_br', [0, 1, 1, 1]],
  ['diag_a', [1, 0, 0, 1]], ['diag_b', [0, 1, 1, 0]],
];

// ---------------------------------------------------------------------------------------- props
function bushImg(berries = false) {
  const img = new Img(T, T);
  for (const [cx, cy, r] of [[5, 9, 4.2], [11, 9, 4.2], [8, 6, 4.5], [8, 11, 4]] as const) ballShade(img, cx, cy, r, r * 0.9, G, { bias: 0.05 });
  if (berries) for (const [x, y] of [[5, 8], [10, 6], [12, 11], [7, 12]]) {
    img.set(x, y, C.red2);
    img.set(x, y - 1, C.red3);
  }
  for (let x = 2; x < 14; x++) if (img.get(x, 14)) img.set(x, 14, G[0]);
  return outline(img);
}
function rockImg(big = false, moss = false) {
  const img = new Img(T, T);
  const r = big ? 6.5 : 5;
  ballShade(img, 8, 15 - r * 0.75, r, r * 0.75, RAMPS.stone, { flat: 0.7 });
  if (moss) img.each((x, y, c) => {
    if (y < 8 && c !== C.stn0) img.set(x, y, y < 6 ? G[3] : G[2]);
  });
  img.set(6, 11, C.stn0);
  img.set(7, 12, C.stn1);
  return outline(img);
}
function pebbles() {
  const img = new Img(T, T);
  for (const [x, y] of [[3, 10], [9, 5], [12, 12], [6, 13]]) {
    img.set(x, y, C.stn3);
    img.set(x + 1, y, C.stn2);
    img.set(x, y + 1, C.stn1);
    img.set(x + 1, y + 1, C.stn1);
  }
  return outline(img);
}
function stump() {
  const img = new Img(T, T);
  rect(img, 4, 7, 8, 7, C.brn1);
  rect(img, 4, 7, 2, 7, C.brn2);
  rect(img, 10, 7, 2, 7, C.brn0);
  ellipse(img, 8, 7, 4, 2.2, (x, y) => (((x - 8) ** 2) / 4 + (y - 7) ** 2 < 1.5 ? C.brn2 : C.brn3));
  img.set(8, 7, C.brn1);
  hline(img, 3, 12, 14, C.brn0);
  img.set(3, 13, C.brn1);
  img.set(12, 13, C.brn1);
  return outline(img);
}
function mushrooms() {
  const img = new Img(T, T);
  for (const [x, y] of [[5, 10], [10, 7], [11, 12]]) {
    vline(img, x, y, y + 2, C.skin3);
    hline(img, x - 2, x + 2, y, C.red2);
    hline(img, x - 1, x + 1, y - 1, C.red2);
    img.set(x - 1, y - 1, C.white);
    img.set(x + 1, y, C.red1);
  }
  return outline(img);
}
function flowersImg(v: number) {
  const img = grassImg(v === 0 ? 0 : 2).clone();
  const cols = v === 0 ? [C.white, C.red3, C.white, C.gold3] : [C.pur3, C.gold3, C.red3, C.white];
  const pos = v === 0 ? [[4, 4], [11, 3], [8, 9], [3, 12], [13, 12]] : [[5, 3], [12, 7], [3, 9], [9, 13]];
  pos.forEach(([x, y], k) => {
    const c = cols[k % cols.length];
    img.set(x, y - 1, c);
    img.set(x - 1, y, c);
    img.set(x + 1, y, c);
    img.set(x, y + 1, c);
    img.set(x, y, C.gold2);
    img.set(x + 1, y + 1, G[1]);
  });
  return img;
}
function tallGrass() {
  const img = new Img(T, T);
  const r = rng(4);
  for (let k = 0; k < 9; k++) {
    const x = 1 + Math.floor(r() * 14), h = 5 + Math.floor(r() * 6);
    const lean = r() < 0.5 ? -1 : 1;
    line(img, x, 15, x + lean, 15 - h, (t) => (t > 0.7 ? G[3] : t > 0.3 ? G[2] : G[1]));
  }
  for (let x = 0; x < 16; x++) img.set(x, 15, G[1]);
  return outline(img);
}
function fence(kind: 'l' | 'm' | 'r' | 'post' | 'v') {
  const img = new Img(T, T);
  const post = (x: number) => {
    rect(img, x, 4, 3, 10, C.brn2);
    vline(img, x, 4, 13, C.brn3);
    vline(img, x + 2, 4, 13, C.brn1);
    hline(img, x, x + 2, 3, C.brn3);
  };
  const rail = (x0: number, x1: number) => {
    for (const y of [6, 10]) {
      hline(img, x0, x1, y, C.brn3);
      hline(img, x0, x1, y + 1, C.brn1);
    }
  };
  if (kind === 'v') {
    rect(img, 7, 0, 3, 16, C.brn2);
    vline(img, 7, 0, 15, C.brn3);
    vline(img, 9, 0, 15, C.brn1);
    post(6);
    return outline(img);
  }
  if (kind === 'l') rail(7, 15);
  if (kind === 'm') rail(0, 15);
  if (kind === 'r') rail(0, 8);
  post(kind === 'l' ? 5 : kind === 'r' ? 8 : 7);
  return outline(img);
}
function treeImg(kind: 'round' | 'pine') {
  const img = new Img(32, 32);
  // trunk and roots
  const trunk = new Img(32, 32);
  rect(trunk, 13, 20, 6, 10, C.brn1);
  vline(trunk, 13, 20, 29, C.brn2);
  vline(trunk, 14, 20, 29, C.brn2);
  vline(trunk, 18, 20, 29, C.brn0);
  hline(trunk, 11, 20, 30, C.brn1);
  trunk.set(11, 29, C.brn1);
  trunk.set(20, 29, C.brn0);
  blit(img, outline(trunk), 0, 0);
  const leaves = new Img(32, 32);
  if (kind === 'round') {
    for (const [cx, cy, r] of [[16, 10, 8], [9, 14, 6], [23, 14, 6], [12, 19, 6], [20, 19, 6], [16, 16, 7]] as const) ballShade(leaves, cx, cy, r, r * 0.9, G, { bias: -0.02 });
    // leaf clusters: small light arcs
    for (const [x, y] of [[11, 7], [17, 5], [7, 12], [14, 12], [21, 10], [10, 17], [18, 15]]) {
      leaves.set(x, y, G[3]);
      leaves.set(x + 1, y, G[3]);
      leaves.set(x + 2, y + 1, G[2]);
      leaves.set(x - 1, y + 1, G[2]);
    }
    for (const [x, y] of [[20, 22], [13, 23], [25, 17]]) {
      leaves.set(x, y, G[0]);
      leaves.set(x + 1, y, G[0]);
    }
  } else {
    for (let k = 0; k < 4; k++) {
      const top = 1 + k * 5, bot = top + 9, half = 4 + k * 2.5;
      poly(leaves, [[16, top], [16 + half, bot], [16 - half, bot]], (x, y) => {
        const t = (y - top) / (bot - top);
        if (y >= bot - 1) return G[0];
        if (x < 16 - half * t * 0.3) return t > 0.6 ? G[2] : G[3];
        if (x > 16 + half * t * 0.5) return G[1];
        return G[2];
      });
    }
  }
  blit(img, outline(leaves), 0, 0);
  return img;
}
function bridgeH(part: 'l' | 'm' | 'r') {
  const img = new Img(T, T);
  for (let x = 0; x < 16; x++) {
    const plank = Math.floor(x / 4);
    for (let y = 3; y < 13; y++) img.set(x, y, x % 4 === 3 ? C.brn0 : x % 4 === 0 ? C.brn3 : plank % 2 ? C.brn2 : C.brn2);
    img.set(x, 12, C.brn1);
  }
  // rails
  for (const y of [1, 13]) {
    hline(img, 0, 15, y, C.brn3);
    hline(img, 0, 15, y + 1, C.brn1);
  }
  const post = (x: number) => {
    rect(img, x, 0, 2, 15, C.brn2);
    vline(img, x + 1, 0, 14, C.brn1);
    img.set(x, 0, C.brn3);
  };
  if (part === 'l') post(0);
  if (part === 'r') post(14);
  if (part === 'm') post(7);
  return img;
}
function bridgeV(part: 'top' | 'mid' | 'bottom') {
  const img = new Img(T, T);
  for (let y = 0; y < 16; y++) for (let x = 3; x < 13; x++) img.set(x, y, y % 4 === 3 ? C.brn0 : y % 4 === 0 ? C.brn3 : C.brn2);
  for (const x of [1, 13]) {
    vline(img, x, 0, 15, C.brn3);
    vline(img, x + 1, 0, 15, C.brn1);
  }
  if (part === 'top') for (const x of [1, 13]) rect(img, x, 0, 2, 3, C.brn2);
  if (part === 'bottom') for (const x of [1, 13]) rect(img, x, 13, 2, 3, C.brn2);
  return img;
}

// ---------------------------------------------------------------------------------------- cliffs
/** stone block face, periodic every 16 px */
function rockPx(x: number, y: number) {
  x = m16(x);
  const row = Math.floor(y / 8), ry = y % 8;
  const off = [0, 5, 11, 3][row % 4];
  const w = row % 2 ? 16 : 8; // alternate rows of long and short stones
  const bx = (x + off) % 16;
  const lx = bx % w;
  const id = Math.floor(bx / w);
  const n = hash2(id, row, 7);
  if (ry === 7 || lx === w - 1) return C.stn0;
  // rounded stone corners
  if ((lx === 0 || lx === w - 2) && (ry === 0 || ry === 6)) return C.stn1;
  if (ry === 0 || lx === 0) return n < 0.3 ? C.stn2 : C.stn3;
  if (ry >= 5 || lx >= w - 3) return C.stn1;
  if (hash2(x, y, 3) < 0.05) return C.stn1;
  if (n > 0.8 && ry === 1 && lx > 2 && lx < 6) return G[2]; // a little moss
  return C.stn2;
}
/** The whole 3×5 cliff block (48×80): plateau top (3 rows of tiles) and a 2-tile face. */
function cliffBlock(): Img {
  const img = new Img(48, 80);
  for (let y = 0; y < 80; y++)
    for (let x = 0; x < 48; x++) {
      let c: number;
      if (y < 48) {
        // plateau top, with lips on the back/left/right edges and an overhang at the front
        const lipY = 45 + Math.round(Math.sin((x * 2 * PI) / 8) * 0.8);
        c = grassPx(x, y);
        if (y === 0 || x === 0) c = G[0];
        else if (y === 1 || x === 1) c = G[3];
        else if (x === 47) c = G[0];
        else if (x === 46) c = G[1];
        if (y >= lipY) c = y === lipY ? G[3] : y === 47 ? G[0] : G[1];
        if (y === 47 && (x === 0 || x === 47)) c = C.stn0;
      } else {
        const fy = y - 48;
        c = rockPx(x, fy);
        if (fy < 2) c = fy === 0 ? C.stn0 : C.stn1; // shadow under the overhang
        if (x === 0) c = C.stn0;
        else if (x === 1) c = C.stn3;
        else if (x === 47) c = C.stn0;
        else if (x === 46) c = C.stn1;
        // the foot of the cliff meets the ground: dark contact shadow, then grass tufts
        if (fy >= 29) c = fy === 29 ? C.stn0 : grassPx(x, y);
        if (fy === 28 && hash2(m16(x), 0, 4) < 0.4) c = G[1];
      }
      img.set(x, y, c);
    }
  return img;
}
function stairsImg(part: 'top' | 'mid' | 'bottom') {
  const img = new Img(T, T);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      let c: number;
      const s = y % 4;
      c = s === 0 ? C.stn3 : s === 3 ? C.stn0 : C.stn2;
      if (x < 2 || x > 13) c = x === 0 || x === 15 ? C.stn0 : C.stn1;
      img.set(x, y, c);
    }
  if (part === 'top') {
    // plateau grass with the stair mouth in the front lip
    for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) img.set(x, y, x < 2 || x > 13 || y < 9 ? grassPx(x, y + 32) : img.get(x, y));
    for (let x = 0; x < 16; x++) if (x < 2 || x > 13) for (let y = 12; y < 16; y++) img.set(x, y, y === 12 ? G[3] : y === 15 ? G[0] : G[1]);
  }
  if (part === 'bottom') for (let x = 0; x < 16; x++) img.set(x, 15, x < 2 || x > 13 ? grassPx(x, 15) : C.stn0);
  return img;
}

function waterWith(f: (img: Img) => void) {
  const img = tile((x, y) => waterPx(x, y, 0));
  f(img);
  return img;
}

// ======================================================================================== overworld
function overworld() {
  const S = new Sheet(9);
  GRASS.forEach((g, k) => S.put(k ? `grass${k + 1}` : 'grass', k, 0, g));
  S.put('flowers', 3, 0, flowersImg(0));
  S.put('flowers2', 4, 0, flowersImg(1));
  S.put('tall_grass', 5, 0, tallGrass());
  S.put('bush', 6, 0, bushImg());
  S.put('rock', 7, 0, rockImg());
  S.put('pebbles', 8, 0, pebbles());
  S.put('stump', 9, 0, stump());
  S.put('fence_l', 10, 0, fence('l'));
  S.put('fence_m', 11, 0, fence('m'));
  S.put('fence_r', 12, 0, fence('r'));
  S.put('fence_post', 13, 0, fence('post'));
  S.put('fence_v', 14, 0, fence('v'));
  S.put('mushrooms', 15, 0, mushrooms());
  // path terrain: 3×3 island at (0,1), 2×2 hole at (3,1), diagonals at (5,1)
  const place = (prefix: string, ox: number, make: (cn: number[]) => Img) => {
    const at: Record<string, [number, number]> = {
      tl: [0, 0], t: [1, 0], tr: [2, 0], l: [0, 1], c: [1, 1], r: [2, 1], bl: [0, 2], b: [1, 2], br: [2, 2],
      inner_tl: [3, 0], inner_tr: [4, 0], inner_bl: [3, 1], inner_br: [4, 1], diag_a: [5, 0], diag_b: [5, 1],
    };
    for (const [n, cn] of TERRAIN) S.put(`${prefix}_${n}`, ox + at[n][0], 1 + at[n][1], make(cn));
  };
  place('path', 0, pathTile);
  place('water', 6, waterTile);
  // plain water, three animation frames in a row
  for (let k = 0; k < 3; k++) S.put(k ? `water_f${k + 1}` : 'water', 12 + k, 1, tile((x, y) => waterPx(x, y, k)));
  S.put('water_rock', 12, 2, waterWith((img) => {
    const r = new Img(T, T);
    ballShade(r, 8, 8, 5, 4, RAMPS.stone, { flat: 0.7 });
    blit(img, outline(r), 0, 0);
    hline(img, 2, 13, 13, C.tea3);
    img.set(1, 12, C.white);
  }));
  S.put('lily', 13, 2, waterWith((img) => {
    const l = new Img(T, T);
    ellipse(l, 7, 8, 5, 3.5, (x, y) => (x === 7 && y >= 8 ? 0 : y < 7 ? G[3] : G[2]));
    l.set(9, 6, C.white);
    l.set(10, 6, C.red3);
    blit(img, outline(l), 0, 0);
  }));
  S.put('bridge_l', 3, 3, bridgeH('l'));
  S.put('bridge_m', 4, 3, bridgeH('m'));
  S.put('bridge_r', 5, 3, bridgeH('r'));
  S.put('bridge_v_top', 15, 1, bridgeV('top'));
  S.put('bridge_v_mid', 15, 2, bridgeV('mid'));
  S.put('bridge_v_bottom', 15, 3, bridgeV('bottom'));
  // cliffs: 3 columns × 5 rows at (0,4); stairs at column 3
  S.block(0, 4, cliffBlock(), [
    ['cliff_tl', 'cliff_t', 'cliff_tr'],
    ['cliff_l', 'cliff_c', 'cliff_r'],
    ['cliff_bl', 'cliff_b', 'cliff_br'],
    ['cliff_face_l', 'cliff_face', 'cliff_face_r'],
    ['cliff_base_l', 'cliff_base', 'cliff_base_r'],
  ]);
  S.put('stairs_top', 3, 6, stairsImg('top'));
  S.put('stairs', 3, 7, stairsImg('mid'));
  S.put('stairs_bottom', 3, 8, stairsImg('bottom'));
  // trees (2×2) and big props
  S.block(5, 4, treeImg('round'), [['tree_tl', 'tree_tr'], ['tree_bl', 'tree_br']]);
  S.block(7, 4, treeImg('pine'), [['pine_tl', 'pine_tr'], ['pine_bl', 'pine_br']]);
  S.put('bush_berries', 9, 4, bushImg(true));
  S.put('rock_big', 10, 4, rockImg(true));
  S.put('rock_mossy', 11, 4, rockImg(true, true));
  return S;
}

// ======================================================================================== dungeon
const flagstone = (x: number, y: number, seed = 0) => {
  x = m16(x);
  y = m16(y);
  const half = y < 8 ? 0 : 1;
  const bx = (x + half * 4) % 8, by = y % 8;
  if (bx === 7 || by === 7) return C.stn0;
  if (bx === 0 || by === 0) return C.stn2;
  const n = hash2(Math.floor((x + half * 4) / 8), half, seed);
  if (hash2(x, y, 17 + seed) < 0.05) return C.stn0;
  return n < 0.3 ? C.stn2 : C.stn1;
};
function wallFacePx(x: number, y: number) {
  // bricks 8×4 with mortar; lit from the top
  x = m16(x);
  const row = Math.floor(y / 4), ry = y % 4, bx = (x + (row % 2) * 4) % 8;
  if (ry === 3 || bx === 7) return C.ink;
  if (ry === 0) return C.stn3;
  if (bx === 0) return C.stn2;
  return y > 11 ? C.stn1 : C.stn2;
}
function wallTopBlock(): Img {
  // 3×3 wall-top block: dark top surface with a lit rim on the outer edges
  const img = new Img(48, 48);
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) {
      let c: number = (m16(x) + m16(y)) % 8 === 0 ? C.stn0 : C.pur1;
      const e = Math.min(x, y, 47 - x, 47 - y);
      if (e === 0) c = C.ink;
      else if (e === 1) c = x === 1 || y === 1 ? C.stn3 : C.stn2;
      else if (e === 2) c = C.stn1;
      img.set(x, y, c);
    }
  return img;
}
function wallInner(corner: 'tl' | 'tr' | 'bl' | 'br') {
  // a wall top tile whose single corner turns inward (the wall continues on two sides)
  const img = tile((x, y) => ((m16(x) + m16(y)) % 8 === 0 ? C.stn0 : C.pur1));
  const cx = corner.endsWith('l') ? 0 : 15, cy = corner.startsWith('t') ? 0 : 15;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const e = Math.max(Math.abs(x - cx), Math.abs(y - cy));
      if (e === 0) img.set(x, y, C.ink);
      else if (e === 1 && (Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1)) img.set(x, y, C.stn3);
      else if (e === 2 && Math.abs(x - cx) <= 2 && Math.abs(y - cy) <= 2) img.set(x, y, C.stn1);
    }
  return img;
}
function wallFace(part: 'l' | 'm' | 'r') {
  return tile((x, y) => {
    if (part === 'l' && x === 0) return C.ink;
    if (part === 'r' && x === 15) return C.ink;
    if (y === 15) return C.ink;
    return wallFacePx(x, y);
  });
}
function pitBlock(): Img {
  // 3×3 pit: the floor edge breaks into a dark shaft; the far (top) side shows the inner wall
  const img = new Img(48, 48);
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) {
      const inside = x >= 4 && x < 44 && y >= 3 && y < 46;
      let c: number = flagstone(x, y);
      if (inside) {
        const depth = y - 3;
        c = depth < 6 ? (depth === 0 ? C.stn2 : depth < 3 ? C.stn1 : C.stn0) : depth < 9 ? C.pur1 : C.ink;
        if (depth >= 6 && depth < 9 && bayer(x, y) < 0.5) c = C.ink;
        if (x === 4 || x === 43) c = C.ink;
      } else if (x === 3 || x === 44 || y === 46 || y === 2) {
        c = y === 2 && x > 3 && x < 44 ? C.stn3 : x === 3 ? C.stn3 : C.stn2;
      }
      img.set(x, y, c);
    }
  return img;
}
function doorImg(open: boolean) {
  const img = wallFace('m');
  // arch
  for (let y = 2; y < 16; y++)
    for (let x = 3; x < 13; x++) {
      const inArch = y >= 5 || (x - 7.5) ** 2 + ((y - 5) * 1.4) ** 2 < 25;
      if (!inArch) continue;
      const edge = x === 3 || x === 12 || (y < 5 && (x - 7.5) ** 2 + ((y - 5) * 1.4) ** 2 > 16);
      if (edge) img.set(x, y, C.stn3);
      else if (open) img.set(x, y, y > 12 ? C.pur1 : C.ink);
      else img.set(x, y, x % 3 === 0 ? C.brn0 : x % 3 === 1 ? C.brn2 : C.brn1);
    }
  if (!open) {
    hline(img, 4, 11, 7, C.stn1);
    hline(img, 4, 11, 12, C.stn1);
    img.set(10, 10, C.gold2);
    img.set(10, 9, C.gold3);
  }
  return img;
}
function torchImg(frame: number) {
  const img = wallFace('m');
  rect(img, 7, 8, 2, 5, C.brn1);
  img.set(7, 8, C.brn2);
  hline(img, 6, 9, 8, C.stn2);
  // flame
  const f = frame === 0 ? [[7, 7, C.gold2], [8, 7, C.gold3], [7, 6, C.gold3], [8, 6, C.white], [7, 5, C.gold2], [8, 4, C.red3], [6, 6, C.red2], [9, 7, C.red2]] : [[7, 7, C.gold3], [8, 7, C.gold2], [8, 6, C.gold3], [7, 6, C.white], [8, 5, C.gold2], [7, 4, C.red3], [9, 6, C.red2], [6, 7, C.red2]];
  for (const [x, y, c] of f) img.set(x, y, c);
  // glow on the bricks
  for (const [x, y] of [[5, 5], [10, 5], [5, 9], [10, 9], [7, 3]]) if (img.get(x, y) !== C.ink) img.set(x, y, frame ? C.gold1 : C.brn2);
  return img;
}
function spikesImg(up: boolean) {
  const img = tile((x, y) => flagstone(x, y, 2));
  for (const [cx, cy] of [[4, 4], [11, 4], [4, 11], [11, 11]]) {
    rect(img, cx - 2, cy - 1, 4, 3, C.ink);
    if (up) {
      for (const dx of [-2, 0]) {
        vline(img, cx + dx, cy - 4, cy, C.stn3);
        vline(img, cx + dx + 1, cy - 4, cy, C.stn2);
        img.set(cx + dx, cy - 5, C.white);
      }
    } else {
      img.set(cx - 1, cy, C.stn1);
      img.set(cx + 1, cy, C.stn1);
    }
  }
  return img;
}
function plateImg(down: boolean) {
  const img = tile((x, y) => flagstone(x, y, 1));
  rect(img, 2, 2, 12, 12, C.stn0);
  rect(img, 3, 3 + (down ? 1 : 0), 10, 10 - (down ? 1 : 0), down ? C.brn1 : C.brn2);
  if (!down) {
    hline(img, 3, 12, 3, C.brn3);
    vline(img, 3, 3, 12, C.brn3);
    hline(img, 3, 12, 13, C.brn0);
  }
  img.set(8, 8, down ? C.gold1 : C.gold2);
  img.set(7, 8, down ? C.gold1 : C.gold3);
  return img;
}
function stairsDown() {
  return tile((x, y) => {
    if (x < 2 || x > 13) return x === 0 || x === 15 ? C.ink : C.stn1;
    const s = Math.floor(y / 4), ry = y % 4;
    const shade = [C.stn2, C.stn1, C.stn0, C.pur1][s];
    return ry === 0 ? (s < 2 ? C.stn3 : C.stn1) : ry === 3 ? C.ink : shade;
  });
}
function stairsUp() {
  return tile((x, y) => {
    if (x < 2 || x > 13) return x === 0 || x === 15 ? C.ink : C.stn1;
    const ry = y % 4;
    return ry === 0 ? C.stn3 : ry === 3 ? C.stn0 : y < 8 ? C.stn2 : C.stn2;
  });
}
function dungeon() {
  const S = new Sheet(5);
  S.put('floor', 0, 0, tile((x, y) => flagstone(x, y, 0)));
  S.put('floor2', 1, 0, tile((x, y) => flagstone(x, y, 5)));
  S.put('floor3', 2, 0, tile((x, y) => {
    const c = flagstone(x, y, 9);
    return c === C.stn1 && hash2(x, y, 2) < 0.18 ? C.grn1 : c;
  }));
  S.put('floor_cracked', 3, 0, (() => {
    const img = tile((x, y) => flagstone(x, y, 0));
    const pts: [number, number][] = [[2, 3], [5, 6], [8, 6], [10, 9], [13, 12], [8, 6], [7, 10], [5, 13]];
    for (let k = 0; k + 1 < pts.length; k++) line(img, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], C.ink);
    img.set(9, 7, C.stn3);
    return img;
  })());
  S.put('plate_up', 4, 0, plateImg(false));
  S.put('plate_down', 5, 0, plateImg(true));
  S.put('spikes_down', 6, 0, spikesImg(false));
  S.put('spikes_up', 7, 0, spikesImg(true));
  S.put('stairs_down', 8, 0, stairsDown());
  S.put('stairs_up', 9, 0, stairsUp());
  S.put('door_closed', 10, 0, doorImg(false));
  S.put('door_open', 11, 0, doorImg(true));
  S.put('torch', 12, 0, torchImg(0));
  S.put('torch_f2', 13, 0, torchImg(1));
  S.put('floor_dark', 14, 0, tile((x, y) => (flagstone(x, y, 3) === C.stn0 ? C.ink : flagstone(x, y, 3) === C.stn2 ? C.stn1 : C.stn0)));
  S.block(0, 1, wallTopBlock(), [
    ['wall_top_tl', 'wall_top_t', 'wall_top_tr'],
    ['wall_top_l', 'wall_top_c', 'wall_top_r'],
    ['wall_top_bl', 'wall_top_b', 'wall_top_br'],
  ]);
  S.put('wall_face_l', 0, 4, wallFace('l'));
  S.put('wall_face', 1, 4, wallFace('m'));
  S.put('wall_face_r', 2, 4, wallFace('r'));
  S.put('wall_inner_tl', 3, 1, wallInner('tl'));
  S.put('wall_inner_tr', 4, 1, wallInner('tr'));
  S.put('wall_inner_bl', 3, 2, wallInner('bl'));
  S.put('wall_inner_br', 4, 2, wallInner('br'));
  S.block(6, 1, pitBlock(), [
    ['pit_tl', 'pit_t', 'pit_tr'],
    ['pit_l', 'pit_c', 'pit_r'],
    ['pit_bl', 'pit_b', 'pit_br'],
  ]);
  return S;
}

// ======================================================================================== platform
function groundPx(x: number, y: number) {
  x = m16(x);
  y = m16(y);
  // embedded stones
  for (const [sx, sy] of [[3, 8], [11, 12], [8, 3], [13, 6]]) {
    const dx = x - sx, dy = y - sy;
    if (dx >= 0 && dx < 3 && dy >= 0 && dy < 2) return dy === 0 ? (dx === 2 ? C.stn2 : C.stn3) : C.stn1;
    if (dx >= 0 && dx < 3 && dy === 2) return C.brn0;
  }
  const n = tnoise(x / 8, y / 8, 2, 8);
  if (n > 0.66) return C.brn2;
  if (n < 0.3 && (x + y) % 4 === 0) return C.brn0;
  return C.brn1;
}
function groundTile(top: boolean, l: boolean, r: boolean) {
  const img = new Img(T, T);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      let c: number = groundPx(x, y);
      if (top) {
        const gy = 4 + (x % 5 === 2 ? 1 : 0);
        if (y === 0) c = G[3];
        else if (y < gy - 1) c = G[2];
        else if (y < gy) c = G[1];
        else if (y === gy) c = C.brn0;
        if (y < 2 && ((l && x === 0) || (r && x === 15))) c = 0;
      }
      if (l && x === 0) c = top && y < 4 ? (y < 2 ? 0 : G[0]) : C.brn0;
      if (r && x === 15) c = top && y < 4 ? (y < 2 ? 0 : G[0]) : C.ink;
      if (l && x === 1 && !(top && y < 5)) c = C.brn2;
      if (c) img.set(x, y, c);
    }
  return img;
}
function onewayImg(part: 'l' | 'm' | 'r') {
  const img = new Img(T, T);
  hline(img, 0, 15, 0, C.brn3);
  hline(img, 0, 15, 1, C.brn2);
  hline(img, 0, 15, 2, C.brn2);
  hline(img, 0, 15, 3, C.brn0);
  for (let x = 3; x < 16; x += 6) img.set(x, 1, C.brn1);
  if (part === 'l') {
    img.set(0, 0, 0);
    vline(img, 0, 1, 3, C.brn0);
    line(img, 2, 4, 6, 8, C.brn1);
  }
  if (part === 'r') {
    img.set(15, 0, 0);
    vline(img, 15, 1, 3, C.brn0);
    line(img, 13, 4, 9, 8, C.brn1);
  }
  return img;
}
function ladderImg(topPiece: boolean) {
  const img = new Img(T, T);
  for (const x of [3, 12]) {
    vline(img, x, 0, 15, C.brn2);
    vline(img, x + 1, 0, 15, C.brn0);
  }
  for (let y = 2; y < 16; y += 4) {
    hline(img, 4, 11, y, C.brn3);
    hline(img, 4, 11, y + 1, C.brn1);
  }
  if (topPiece) for (const x of [3, 12]) {
    img.set(x, 0, 0);
    img.set(x + 1, 0, 0);
    img.set(x, 1, C.brn3);
  }
  return img;
}
function platSpikes() {
  const img = new Img(T, T);
  for (let k = 0; k < 4; k++) {
    const x0 = k * 4;
    poly(img, [[x0, 16], [x0 + 2, 6], [x0 + 4, 16]], (x) => (x < x0 + 2 ? C.stn3 : C.stn1));
    img.set(x0 + 1, 8, C.white);
  }
  hline(img, 0, 15, 15, C.stn0);
  return outline(img);
}
function crateImg() {
  const img = new Img(T, T);
  rect(img, 1, 1, 14, 14, C.brn2);
  for (let y = 1; y < 15; y += 4) hline(img, 1, 14, y, C.brn1);
  rect(img, 1, 1, 14, 2, C.brn3);
  line(img, 2, 13, 13, 2, C.brn3);
  line(img, 3, 13, 13, 3, C.brn1);
  for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]]) img.set(x, y, C.stn2);
  return outline(img);
}
function bricksBg(v: number) {
  return tile((x, y) => {
    const row = Math.floor(y / 4), ry = y % 4, bx = (x + (row % 2) * 4) % 8;
    if (ry === 3 || bx === 7) return C.ink;
    if (v === 1 && hash2(Math.floor((x + (row % 2) * 4) / 8), row, 4) < 0.3) return ry === 0 ? C.stn1 : C.pur1;
    return ry === 0 ? C.pur2 : C.pur1;
  });
}
function platform() {
  const S = new Sheet(2);
  S.put('ground_top_l', 0, 0, groundTile(true, true, false));
  S.put('ground_top', 1, 0, groundTile(true, false, false));
  S.put('ground_top_r', 2, 0, groundTile(true, false, true));
  S.put('ground_l', 0, 1, groundTile(false, true, false));
  S.put('ground', 1, 1, groundTile(false, false, false));
  S.put('ground_r', 2, 1, groundTile(false, false, true));
  S.put('ground_top_single', 3, 0, groundTile(true, true, true));
  S.put('ground_single', 3, 1, groundTile(false, true, true));
  S.put('oneway_l', 4, 0, onewayImg('l'));
  S.put('oneway_m', 5, 0, onewayImg('m'));
  S.put('oneway_r', 6, 0, onewayImg('r'));
  S.put('ladder_top', 7, 0, ladderImg(true));
  S.put('ladder', 7, 1, ladderImg(false));
  S.put('spikes', 8, 0, platSpikes());
  S.put('crate', 9, 0, crateImg());
  S.put('bricks_bg', 10, 0, bricksBg(0));
  S.put('bricks_bg2', 11, 0, bricksBg(1));
  S.put('bricks_bg_dark', 10, 1, tile((x, y) => (bricksBg(0).get(x, y) === C.pur2 ? C.pur1 : bricksBg(0).get(x, y) === C.pur1 ? C.ink : C.ink)));
  S.put('bricks_bg_window', 11, 1, (() => {
    const img = bricksBg(0);
    rect(img, 4, 3, 8, 10, C.ink);
    rect(img, 5, 4, 6, 8, C.blu0);
    vline(img, 8, 4, 11, C.stn1);
    hline(img, 5, 10, 7, C.stn1);
    sparkle(img, 6, 5, 0, C.white);
    return img;
  })());
  return S;
}

// ======================================================================================== module
function sheetEntry(id: string, title: string, file: string, make: () => Sheet, notes: string): ArtModule['sheets'][number] {
  const s = make();
  return {
    def: { id, kind: 'tileset', title, file, frameW: T, frameH: T, cols: s.cols, rows: s.rows, tiles: s.tiles, notes } satisfies SheetDef,
    render: () => toRGBA(make().img),
  };
}

export const ART: ArtModule = {
  sheets: [
    sheetEntry(
      'tiles_overworld',
      'Overworld tiles',
      'assets/tiles/overworld.png',
      overworld,
      'Top-down terrain. Path and water are corner terrains: in a TileSet terrain set use mode "Match Corners", grass = terrain 0, and paint each tile\'s corner peering bits from its name (the 3×3 island, 2×2 hole and two diagonals). Plain water animates over 3 frames in a row (water, water_f2, water_f3; about 3 fps). Cliffs are a 3×5 block: top surface, front lip, 2-tile face. Trees are 2×2 with transparent backgrounds for a decor layer.',
    ),
    sheetEntry('tiles_dungeon', 'Dungeon tiles', 'assets/tiles/dungeon.png', dungeon, 'Stone dungeon: floors, a 3×3 wall-top block with inner corners and a brick face row, a 3×3 pit, doors, spikes and pressure plates (two states each) and a 2-frame torch (torch, torch_f2: about 6 fps). Spikes toggle between spikes_down and spikes_up.'),
    sheetEntry('tiles_platform', 'Platformer tiles (side view)', 'assets/tiles/platform.png', platform, 'Side view: grassy ground tops and fill with edges, one-way platforms (enable one-way collision on those tiles), a ladder, spikes, a crate and background bricks for a parallax or background layer.'),
  ],
};
