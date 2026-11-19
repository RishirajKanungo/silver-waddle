// Enemies: slime, bat, skeleton (side-facing) and the stone golem boss.
import type { ArtModule, SheetDef } from '../types';
import { C, Img, RAMPS, ballShade, blit, ellipse, line, outline, poly, rect, rng, rowSheet, toRGBA, type Ramp } from './lib';
import { charLegend, drawBlade, g, renderPose, sideLegs, type CharDef, type Pose } from './rig';
import { sparkle } from './poses';

const PI = Math.PI;
type Entry = ArtModule['sheets'][number];
function sheetOf(id: string, title: string, file: string, fw: number, fh: number, cols: number, make: () => { name: string; frames: Img[]; fps: number; loop: boolean }[], extra: Partial<SheetDef>): Entry {
  const s = rowSheet(make(), cols, fw, fh);
  const def: SheetDef = { id, kind: 'enemy', title, file, frameW: fw, frameH: fh, cols: s.cols, rows: s.rows, anims: s.anims, ...extra };
  return { def, render: () => toRGBA(rowSheet(make(), cols, fw, fh).img) };
}

// ===================================================================================== slime
const SLIME: Ramp = [C.blu0, C.tea1, C.tea2, C.tea3];
function slime(rx: number, ry: number, lift = 0, eyes: 'open' | 'hurt' | 'closed' | 'none' = 'open', ramp: Ramp = SLIME, dx = 0): Img {
  const img = new Img(16, 16);
  const ground = 14 - lift;
  const cx = 8 + dx, cy = ground - ry + 1;
  ballShade(img, cx, cy, rx, ry, ramp, { bias: 0.08 });
  // flat base
  for (let x = 0; x < 16; x++) for (let y = ground + 1; y < 16; y++) img.set(x, y, 0);
  for (let x = 0; x < 16; x++) if (img.get(x, ground)) img.set(x, ground, ramp[1]);
  // glossy highlight
  const hx = Math.round(cx - rx * 0.5), hy = Math.round(cy - ry * 0.55);
  img.set(hx, hy, C.white);
  img.set(hx + 1, hy, C.white);
  img.set(hx, hy + 1, ramp[3]);
  const ey = Math.round(cy + ry * 0.05);
  const ex0 = Math.round(cx - 2.5), ex1 = Math.round(cx + 1.5);
  if (eyes === 'open')
    for (const ex of [ex0, ex1]) {
      img.set(ex, ey, C.ink);
      img.set(ex, ey + 1, C.ink);
      img.set(ex + 1, ey, C.white);
      img.set(ex + 1, ey + 1, C.blu0);
    }
  else if (eyes === 'hurt') {
    // > <
    img.set(ex0, ey - 1, C.ink);
    img.set(ex0 + 1, ey, C.ink);
    img.set(ex0, ey + 1, C.ink);
    img.set(ex1 + 1, ey - 1, C.ink);
    img.set(ex1, ey, C.ink);
    img.set(ex1 + 1, ey + 1, C.ink);
  } else if (eyes === 'closed') {
    img.set(ex0, ey + 1, C.ink);
    img.set(ex0 + 1, ey + 1, C.ink);
    img.set(ex1, ey + 1, C.ink);
    img.set(ex1 + 1, ey + 1, C.ink);
  }
  return outline(img);
}
function slimeAnims() {
  const lighter: Ramp = [C.tea1, C.tea2, C.tea3, C.white];
  const puddle = (w: number, drops: [number, number][], ramp: Ramp = SLIME) => {
    const img = new Img(16, 16);
    ellipse(img, 8, 14, w, 1.6, (x, y) => (y < 14 ? ramp[2] : ramp[1]));
    if (w > 3) img.set(8 - Math.floor(w / 2), 13, ramp[3]);
    for (const [x, y] of drops) {
      img.set(x, y, ramp[3]);
      img.set(x, y + 1, ramp[2]);
    }
    return outline(img);
  };
  const die4 = new Img(16, 16);
  sparkle(die4, 5, 9, 1, C.white, C.tea3);
  sparkle(die4, 11, 6, 1, C.white, C.tea3);
  die4.set(8, 13, C.tea3);
  return [
    { name: 'idle', fps: 5, loop: true, frames: [slime(6, 5), slime(6.5, 4.5), slime(5.5, 5.5)] },
    { name: 'hop', fps: 10, loop: false, frames: [slime(7, 4, 0, 'closed'), slime(5, 6.5, 3), slime(5.5, 5.5, 5), slime(7.2, 4, 0)] },
    { name: 'hurt', fps: 8, loop: false, frames: [slime(6.8, 4.5, 0, 'hurt', [C.tea1, C.tea2, C.tea3, C.tea3])] },
    { name: 'die', fps: 10, loop: false, frames: [slime(7.5, 3.5, 0, 'hurt', lighter), puddle(6, [[3, 7], [13, 8]]), puddle(4, [[2, 4], [14, 5], [8, 6]]), die4] },
  ];
}

// ===================================================================================== bat
const BAT: Ramp = RAMPS.plum;
function bat(phase: number, hurt = false): Img {
  const img = new Img(16, 16);
  const cy = 8 + [0, 1, 1, 0][phase];
  const ramp = hurt ? [C.pur2, C.pur3, C.white, C.white] : BAT;
  // wings: tip height per phase (up, mid, down, mid)
  const tip = [-6, -1, 4, -1][phase];
  const wing = (s: 1 | -1) => {
    const pts: [number, number][] = [
      [8 + s * 2, cy - 1],
      [8 + s * 5, cy - 3 + Math.round(tip * 0.5)],
      [8 + s * 8, cy + tip],
      [8 + s * 7, cy + tip + 3],
      [8 + s * 5.5, cy + Math.round(tip * 0.4) + 1],
      [8 + s * 4, cy + Math.round(tip * 0.3) + 2],
      [8 + s * 2, cy + 2],
    ];
    if (s < 0) pts.reverse();
    poly(img, pts, (x, y) => (y <= cy - 1 + Math.round(tip * 0.3) ? ramp[2] : ramp[1]));
    // wing bone
    line(img, 8 + s * 2, cy - 1, 8 + s * 8, cy + tip, ramp[3]);
  };
  wing(1);
  wing(-1);
  // body and ears
  ballShade(img, 8, cy + 0.5, 3, 3, ramp, { dither: false });
  img.set(6, cy - 3, ramp[2]);
  img.set(6, cy - 2, ramp[2]);
  img.set(10, cy - 3, ramp[1]);
  img.set(10, cy - 2, ramp[1]);
  // eyes and fangs
  if (hurt) {
    img.set(7, cy, C.ink);
    img.set(9, cy, C.ink);
  } else {
    img.set(7, cy, C.gold3);
    img.set(9, cy, C.gold3);
  }
  img.set(7, cy + 2, C.white);
  img.set(9, cy + 2, C.white);
  return outline(img);
}

// ===================================================================================== skeleton
const BONE: Ramp = [C.stn1, C.stn2, C.stn3, C.white];
const SK = charLegend({ met: BONE, b: RAMPS.plum, lea: RAMPS.brown }, { e: C.ink, r: C.red2 });
const skull = g(SK, `
  ...33333....
  .334444333..
  33444333333.
  3443333333..
  3433333ee33.
  3333332ee33.
  2333333333e.
  .23333333332
  ..2.3e3e3e3.
  ...2e2e2e2..
  ....2222....
`);
const ribs = g(SK, `
  ...33...
  ..2442..
  .3.33.3.
  .233332.
  .3.33.3.
  ..2332..
  .bPPPPb.
  .pP.PPp.
`);
const skeletonDef: CharDef = {
  sleeve: BONE,
  skin: BONE,
  eye: [C.ink, C.red2, C.red3, C.white],
  parts: {
    side: {
      head: skull, torso: ribs,
      legs: [
        sideLegs(BONE, BONE, [15, 23], [15, 29], [14, 29], { w: 2, bootLen: 3 }),
        sideLegs(BONE, BONE, [15, 23], [18, 29], [12, 29], { w: 2, bootLen: 3 }),
        sideLegs(BONE, BONE, [15, 23], [15, 29], [16, 28], { w: 2, bootLen: 3 }),
        sideLegs(BONE, BONE, [15, 23], [12, 29], [18, 29], { w: 2, bootLen: 3 }),
        sideLegs(BONE, BONE, [15, 23], [16, 28], [15, 29], { w: 2, bootLen: 3 }),
        sideLegs(BONE, BONE, [15, 24], [17, 29], [11, 29], { w: 2, bootLen: 3 }),
        sideLegs(BONE, BONE, [15, 23], [20, 29], [11, 29], { w: 2, bootLen: 3 }),
      ],
      headAt: [11, 5], torsoAt: [11, 15], legsAt: [0, 0],
      frontShoulder: [14, 16], backShoulder: [16, 16], eyes: [],
    },
  } as unknown as CharDef["parts"],
  weapon: (img, w) => drawBlade(img, w, { len: 9, blade: [C.brn1, C.brn2, C.stn3, C.stn3], guard: [C.brn0, C.brn1, C.brn2, C.brn3], grip: C.brn0 }),
};
// arms: thin bones
function skel(p: Omit<Pose, 'f'>, glow = false): Img {
  const img = renderPose(skeletonDef, { f: 'side', ...p } as Pose);
  if (glow) {
    // the eye socket flares red: the telegraph
    const hx = 11 + (p.headDx ?? 0), hy = 5 + (p.bob ?? 0) + (p.headDy ?? 0) + (p.dy ?? 0);
    img.set(hx + 6, hy + 5, C.red3);
    img.set(hx + 5, hy + 5, C.red2);
    img.set(hx + 6, hy + 4, C.red2);
    sparkle(img, hx + 8, hy + 2, 1, C.white, C.red3);
  } else {
    const hx = 11 + (p.headDx ?? 0), hy = 5 + (p.bob ?? 0) + (p.headDy ?? 0) + (p.dy ?? 0);
    if (img.get(hx + 6, hy + 5) === C.ink) img.set(hx + 6, hy + 5, C.red2);
  }
  return img;
}
function bonePile(skullX: number, skullY: number, spread: number, seed: number): Img {
  const img = new Img(32, 32);
  const r = rng(seed);
  for (let k = 0; k < 6; k++) {
    const x = 16 + (r() - 0.5) * spread * 2, y = 28 + r() * 2 - 1;
    const a = (r() - 0.5) * 1.2;
    const len = 3 + Math.floor(r() * 3);
    const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len;
    line(img, x, y, x1, y1, C.stn3);
    img.set(Math.round(x), Math.round(y) - 1, C.white);
    img.set(Math.round(x1), Math.round(y1) - 1, C.stn3);
  }
  blit(img, skull, skullX, skullY);
  return outline(img);
}
function skeletonAnims() {
  const W = (x: number, y: number, a: number) => ({ x, y, a, hold: 'front' as const });
  return [
    { name: 'idle', fps: 3, loop: true, frames: [skel({ wpn: W(15, 21, PI / 2 + 0.4), front: { hx: 1, hy: 5 } }), skel({ bob: 1, wpn: W(15, 21, PI / 2 + 0.4), front: { hx: 1, hy: 4 } })] },
    {
      name: 'walk', fps: 7, loop: true,
      frames: [1, 2, 3, 4].map((legs, k) => {
        const bob = k % 2 ? -1 : 0;
        const sw = [2, 0, -2, 0][k];
        return skel({ legs, bob, front: { hx: 1 + sw, hy: 5 }, back: { hx: -sw, hy: 5 }, wpn: W(15 + sw, 21, PI / 2 + 0.4 - sw * 0.15) });
      }),
    },
    {
      // telegraph: rear back, sword high, eyes flare
      name: 'windup', fps: 5, loop: false,
      frames: [
        skel({ legs: 0, torsoDx: -1, headDx: -1, front: { hx: -2, hy: -2 }, back: { hx: -2, hy: 3 }, wpn: W(11, 14, -2.0) }, true),
        skel({ legs: 0, torsoDx: -2, headDx: -2, bob: 1, front: { hx: -3, hy: -4 }, back: { hx: -2, hy: 3 }, wpn: W(9, 12, -2.4) }, true),
      ],
    },
    {
      name: 'attack', fps: 12, loop: false,
      frames: [
        skel({ legs: 6, torsoDx: 1, headDx: 1, front: { hx: 4, hy: -2 }, back: { hx: -2, hy: 3 }, wpn: W(19, 14, -0.6), smear: { cx: 17, cy: 20, r: 12, a0: -PI * 0.75, a1: -PI * 0.2, front: true, colors: [C.red1, C.red3, C.gold3] } }),
        skel({ legs: 6, torsoDx: 1, headDx: 1, front: { hx: 5, hy: 3 }, back: { hx: -2, hy: 3 }, wpn: W(20, 19, 0.5), smear: { cx: 17, cy: 20, r: 12, a0: -PI * 0.5, a1: PI * 0.2, front: true, colors: [C.red1, C.red3, C.gold3] } }),
        skel({ legs: 6, torsoDx: 1, headDx: 1, front: { hx: 4, hy: 5 }, back: { hx: -2, hy: 4 }, wpn: W(19, 21, 1.2) }),
      ],
    },
    { name: 'hurt', fps: 8, loop: false, frames: [skel({ legs: 5, torsoDx: -2, headDx: -3, headDy: -1, front: { hx: -3, hy: 1 }, back: { hx: -3, hy: 1 }, wpn: W(11, 18, -2.8) })] },
    {
      name: 'die', fps: 8, loop: false,
      frames: [
        skel({ legs: 5, torsoDx: -1, headDx: -2, headDy: 2, dy: 1, front: { hx: -2, hy: 5 }, back: { hx: -2, hy: 5 } }),
        (() => {
          const img = new Img(32, 32);
          blit(img, renderPose(skeletonDef, { f: 'side', legs: 5, dy: 4, headDy: 3, torsoDx: -1, front: { hx: 2, hy: 5 }, back: { hx: -2, hy: 5 } }), 0, 0);
          return img;
        })(),
        bonePile(12, 18, 6, 7),
        bonePile(13, 20, 8, 7),
      ],
    },
  ];
}

// ===================================================================================== golem
// A moss-covered stone golem with a glowing shard in its chest. 48×48, faces the camera.
interface GolemPose {
  bob?: number;
  /** fists: offset from the rest position */
  lf?: [number, number];
  rf?: [number, number];
  /** arms raised overhead (windup) */
  up?: number;
  legL?: number;
  legR?: number;
  eye?: 'glow' | 'red' | 'dim' | 'shut';
  core?: 0 | 1 | 2;
  tilt?: number;
  flash?: boolean;
  post?: (img: Img) => void;
}
const STONE: Ramp = [C.stn0, C.stn1, C.stn2, C.stn3];
function boulder(img: Img, cx: number, cy: number, rx: number, ry: number, moss = 0, seed = 1) {
  const L = new Img(img.w, img.h);
  ballShade(L, cx, cy, rx, ry, STONE, { bias: 0.02, flat: 0.8 });
  // cracks and chips
  const r = rng(seed);
  for (let k = 0; k < Math.round((rx * ry) / 18); k++) {
    const x = cx + (r() - 0.5) * rx * 1.3, y = cy + (r() - 0.3) * ry * 1.2;
    const c = L.get(x, y);
    if (c && c !== STONE[0]) {
      L.set(x, y, STONE[0]);
      L.set(x + 1, y + (r() < 0.5 ? 1 : 0), STONE[1]);
    }
  }
  // moss on the top
  if (moss)
    L.each((x, y) => {
      if (y < cy - ry * (1 - moss) && ((x * 7 + y * 3) % 5 !== 0 || y < cy - ry * 0.85)) L.set(x, y, y < cy - ry * 0.9 ? C.grn3 : (x + y) % 3 ? C.grn2 : C.grn1);
    });
  blit(img, outline(L), 0, 0);
}
function golem(p: GolemPose): Img {
  const img = new Img(48, 48);
  const bob = p.bob ?? 0;
  const up = p.up ?? 0;
  // legs: two stubby pillars
  const leg = (x: number, dy: number) => {
    const L = new Img(48, 48);
    rect(L, x, 37 + dy, 8, 9 - dy, STONE[1]);
    rect(L, x, 37 + dy, 3, 9 - dy, STONE[2]);
    rect(L, x + 6, 37 + dy, 2, 9 - dy, STONE[0]);
    rect(L, x - 1, 44, 10, 2, STONE[0]);
    rect(L, x - 1, 44, 10, 1, STONE[1]);
    blit(img, outline(L), 0, 0);
  };
  leg(13, p.legL ?? 0);
  leg(27, p.legR ?? 0);
  // arms (behind the torso when raised)
  const arm = (side: 1 | -1, f: [number, number]) => {
    const sx = 24 + side * 14, sy = 22 + bob;
    const fx = sx + side * 2 + f[0] * side, fy = 34 + bob + f[1] - up * 22;
    const L = new Img(48, 48);
    // upper arm chunk
    boulder(L, sx, sy - up * 4, 6, 6, 0.35, 3 + side);
    // forearm stones from shoulder to fist
    const n = 3;
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      boulder(L, sx + (fx - sx) * t, sy - up * 4 + (fy - sy + up * 4) * t, 4, 4, 0, 9 + k);
    }
    boulder(L, fx, fy, 6, 5.5, 0, 20 + side);
    // knuckles
    for (let k = -2; k <= 2; k += 2) L.set(Math.round(fx + k), Math.round(fy + 3), STONE[0]);
    return L;
  };
  const la = arm(-1, p.lf ?? [0, 0]);
  const ra = arm(1, p.rf ?? [0, 0]);
  if (up > 0.5) {
    blit(img, la, 0, 0);
    blit(img, ra, 0, 0);
  }
  // torso
  boulder(img, 24, 27 + bob, 13, 11, 0.3, 5);
  // shard core
  const cy = 28 + bob;
  const core = p.core ?? 1;
  const cr: Ramp = core === 0 ? [C.blu0, C.tea1, C.tea1, C.tea2] : core === 1 ? [C.tea1, C.tea2, C.tea3, C.white] : [C.tea2, C.tea3, C.white, C.white];
  poly(img, [[24, cy - 4], [27, cy], [24, cy + 4], [21, cy]], (x, y) => (x + y < 24 + cy - 1 ? cr[2] : x > 24 ? cr[0] : cr[1]));
  img.set(23, cy - 1, cr[3]);
  if (core === 2) {
    sparkle(img, 19, cy - 5, 1, C.white, C.tea3);
    sparkle(img, 30, cy + 3, 1, C.white, C.tea3);
  }
  // head: a smaller boulder sunk between the shoulders
  const hx = 24 + (p.tilt ?? 0), hy = 14 + bob + Math.abs(p.tilt ?? 0) * 0.5;
  boulder(img, hx, hy, 7, 6, 0.45, 11);
  // brow and eyes
  for (let k = -4; k <= 4; k++) img.set(hx + k, hy + 1, STONE[0]);
  const eye = p.eye ?? 'glow';
  const ec = eye === 'red' ? [C.red2, C.gold3] : eye === 'dim' ? [C.tea1, C.tea1] : eye === 'shut' ? [C.stn0, C.stn0] : [C.tea2, C.white];
  for (const ex of [hx - 3, hx + 2]) {
    img.set(ex, hy + 2, ec[0]);
    img.set(ex + 1, hy + 2, eye === 'shut' ? ec[0] : ec[1]);
    if (eye !== 'shut' && eye !== 'dim') img.set(ex, hy + 3, ec[0]);
  }
  if (up <= 0.5) {
    blit(img, la, 0, 0);
    blit(img, ra, 0, 0);
  }
  if (p.flash) img.map((c) => (c === STONE[1] ? STONE[2] : c === STONE[2] ? STONE[3] : c === STONE[3] ? C.white : c));
  p.post?.(img);
  return img;
}
function shockwave(img: Img, r: number) {
  // dust ring and cracks on the ground in front of the fists
  for (let a = 0; a < PI * 2; a += 0.12) {
    const x = Math.round(24 + Math.cos(a) * r * 1.6), y = Math.round(44 + Math.sin(a) * r * 0.45);
    if (y < 38) continue;
    img.set(x, y, (Math.round(a * 10) & 1) === 0 ? C.snd2 : C.stn3);
  }
}
function golemAnims() {
  return [
    { name: 'idle', fps: 2.5, loop: true, frames: [golem({}), golem({ bob: 1, lf: [0, 1], rf: [0, 1], core: 2 })] },
    {
      name: 'walk', fps: 5, loop: true,
      frames: [
        golem({ legL: -3, lf: [0, -2], rf: [0, 2] }),
        golem({ bob: 1, lf: [0, 0], rf: [0, 0], post: (i) => shockwave(i, 6) }),
        golem({ legR: -3, lf: [0, 2], rf: [0, -2] }),
        golem({ bob: 1, post: (i) => shockwave(i, 6) }),
      ],
    },
    {
      // the big telegraph: both fists climb overhead, eyes turn red, the core blazes
      name: 'windup', fps: 4, loop: false,
      frames: [
        golem({ bob: 1, up: 0.35, eye: 'red', core: 1, lf: [2, 0], rf: [2, 0] }),
        golem({ bob: -1, up: 0.75, eye: 'red', core: 2, lf: [-2, 0], rf: [-2, 0] }),
        golem({ bob: -2, up: 1, eye: 'red', core: 2, lf: [-4, -1], rf: [-4, -1], post: (i) => { sparkle(i, 6, 4, 2, C.white, C.red3); sparkle(i, 41, 4, 2, C.white, C.red3); } }),
      ],
    },
    {
      name: 'slam', fps: 10, loop: false,
      frames: [
        golem({ bob: 0, up: 0.55, eye: 'red', core: 2, lf: [-3, 0], rf: [-3, 0], post: (i) => { for (const x of [5, 8, 39, 42]) line(i, x, 2, x, 9, C.stn3); } }),
        golem({ bob: 3, lf: [-9, 7], rf: [-9, 7], eye: 'red', post: (i) => { shockwave(i, 9); sparkle(i, 24, 42, 2, C.white, C.gold3); sparkle(i, 8, 40, 1, C.white, C.snd2); sparkle(i, 40, 40, 1, C.white, C.snd2); } }),
        golem({ bob: 2, lf: [-9, 7], rf: [-9, 7], post: (i) => shockwave(i, 13) }),
      ],
    },
    { name: 'hurt', fps: 8, loop: false, frames: [golem({ bob: -1, tilt: -2, eye: 'shut', lf: [3, -2], rf: [3, -2], flash: true })] },
    {
      name: 'stagger', fps: 3, loop: true,
      frames: [
        golem({ bob: 3, tilt: -2, eye: 'dim', core: 0, lf: [-1, 5], rf: [1, 5], legL: 0 }),
        golem({ bob: 3, tilt: 2, eye: 'dim', core: 0, lf: [1, 5], rf: [-1, 5] }),
      ],
    },
  ];
}

export const ART: ArtModule = {
  sheets: [
    sheetOf('slime', 'Slime', 'assets/enemies/slime.png', 16, 16, 4, slimeAnims, { origin: [8, 15], notes: 'Rows: idle (3), hop (4), hurt (1), die (4). Pivot at the base (8, 15). Squash on landing, stretch in the air.' }),
    sheetOf('bat', 'Bat', 'assets/enemies/bat.png', 16, 16, 4, () => [
      { name: 'fly', fps: 12, loop: true, frames: [0, 1, 2, 3].map((k) => bat(k)) },
      { name: 'hurt', fps: 8, loop: false, frames: [bat(1, true)] },
    ], { origin: [8, 8], notes: 'Flaps in 4 frames; pivot at the body centre (8, 8). Bob it with a sine wave for a fluttering flight path.' }),
    sheetOf('skeleton', 'Skeleton', 'assets/enemies/skeleton.png', 32, 32, 4, skeletonAnims, {
      origin: [16, 30],
      notes: 'Faces right (flip_h for left). The windup is the telegraph: it rears back and its eye flares red. Attack frame 2 is the hit frame. Pivot (16, 30).',
    }),
    sheetOf('golem', 'Stone golem (boss)', 'assets/enemies/golem.png', 48, 48, 4, golemAnims, {
      origin: [24, 46],
      notes: 'Boss, 48×48, faces the camera. Windup (3 frames) raises both fists with red eyes and a blazing core: the player\'s cue to dodge. Slam frame 2 is the impact. Stagger is the dazed, punishable state. Pivot (24, 46).',
    }),
  ],
};
