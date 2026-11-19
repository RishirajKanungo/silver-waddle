// The party: Kai (hero, sword), Lyra (mage, staff and robe) and Bram (guard, shield and mace).
// Each is built from string-grid parts per facing and composed into 32×32 frames by ./rig.
import type { ArtModule, SheetDef } from '../types';
import { C, Img, RAMPS, blit, crop, mirrorX, outline, poly, rotate90, rowSheet, toRGBA, type Ramp } from './lib';
import { FH, FW, ORIGIN, charLegend, drawBlade, drawMace, drawStaff, renderPose, sideLegs, type CharDef, g } from './rig';
import { buildAnims, sparkle } from './poses';

// ======================================================================================== Kai
const KAI = charLegend({ hair: RAMPS.brown, skin: RAMPS.skin, a: RAMPS.blue, b: RAMPS.red, lea: RAMPS.brown, met: RAMPS.steel, gold: RAMPS.gold, pants: RAMPS.sand });

const kaiHeadDown = g(KAI, `
  .....H..H.....
  ...H.HH.HHH...
  ...HYYHHHHHh..
  ..HYYYHHHHHHh.
  .HYYHHHHHHHHhh
  .HYHHHHHHHHHhh
  hHHHHHhHHHhHhh
  hHHHhSShHhSShh
  hhHSSSSSSSSShh
  hhSSSSSSSSSShh
  .hSSSSSSSSSSh.
  .hsSSSSssSSsh.
  ..ssSSSSSSss..
`);
const kaiHeadUp = g(KAI, `
  .....H..H.....
  ...H.HH.HHH...
  ...HYYHHHHHh..
  ..HYYYHHHHHHh.
  .HYYHHHHHHHHhh
  .HYHHHHHHHHHhh
  hHHHHHHHHHHHhh
  hHHHHHHHHHHhhh
  hhHHHHHHHHHhhh
  hhhHHHHHHHhhhh
  .hhhHHHHHhhhh.
  .shhhhhhhhhhs.
  ..ssqhhhhqss..
`);
const kaiHeadSide = g(KAI, `
  ....H..H.....
  ..HHHHHHHH...
  .HYYHHHHHHH..
  hHYYHHHHHHHH.
  hHYHHHHHHHHHh
  hHHHHHHHHHHHh
  hHHHHHHHHhHHh
  hhHHHHHhSShSh
  hhHHHhSSSSSSS
  hhhHzsSSSSSSS
  .hhhssSSSSSSs
  ..hhsSSSSSss.
  ....sssSSSs..
`);
const kaiTorsoDown = g(KAI, `
  ...bPPPPb...
  .acpPRRPpca.
  .cCCpPPpCCc.
  .cCDCPpCCCc.
  .cCDCCCCCCc.
  .lnNNGGNNnl.
  ..cCCCCCCc..
`);
const kaiTorsoUp = g(KAI, `
  ...bPPPPb...
  .acpPPPPpca.
  .cCCCpPCCCc.
  .cCDCpPCCCc.
  .cCDCCpPCCc.
  .lnNNNNNNnl.
  ..cCCCCCCc..
`);
const kaiTorsoSide = g(KAI, `
  ...bPPb...
  ..pPRRPc..
  .bcCCCCDc.
  ..cCCCCDc.
  ..cCCCCCc.
  ..lnNNGNl.
  ..cCCCCCc.
`);
// one leg (front view), 4 wide, 6 tall; the top row hides under the tunic
const kaiLeg = g(KAI, `
  tUU.
  tUU.
  tUU.
  lNN.
  lnNl
  llll
`);
export function legsFront(leg: Img, dyL: number, dyR: number, gap = 2, w = 12) {
  const o = new Img(w, 6);
  const lx = Math.floor((w - (leg.w * 2 + gap)) / 2);
  blit(o, crop(leg, 0, -dyL, leg.w, leg.h), lx, 0);
  blit(o, crop(mirrorX(leg), 0, -dyR, leg.w, leg.h), lx + leg.w + gap, 0);
  return o;
}
/** front legs: stand, left lifted, right lifted, both tucked */
export const frontLegSet = (leg: Img, gap = 2, w = 12) => [legsFront(leg, 0, 0, gap, w), legsFront(leg, -1, 0, gap, w), legsFront(leg, 0, -1, gap, w), legsFront(leg, -2, -2, gap, w)];

/** side legs: stand, contact A, pass A, contact B, pass B, crouch, tuck, lunge */
export function sideLegSet(pants: Ramp, boots: Ramp, hipX = 15, hipY = 24, opts: { w?: number; bootLen?: number } = {}) {
  const H: [number, number] = [hipX, hipY];
  const S = (near: [number, number], far: [number, number], hip = H) => sideLegs(pants, boots, hip, near, far, opts);
  return [
    S([hipX, 29], [hipX - 1, 29]),
    S([hipX + 3, 29], [hipX - 3, 29]),
    S([hipX, 29], [hipX + 1, 28]),
    S([hipX - 3, 29], [hipX + 3, 29]),
    S([hipX + 1, 28], [hipX, 29]),
    S([hipX + 2, 29], [hipX - 2, 29], [hipX, hipY + 2]),
    S([hipX + 2, 27], [hipX - 2, 28]),
    S([hipX + 4, 29], [hipX - 4, 29], [hipX, hipY + 1]),
  ];
}

const kai: CharDef = {
  sleeve: RAMPS.blue,
  skin: RAMPS.skin,
  eye: [C.blu0, C.blu1, C.blu2, C.blu3],
  parts: {
    down: {
      head: kaiHeadDown, torso: kaiTorsoDown, legs: frontLegSet(kaiLeg),
      headAt: [9, 6], torsoAt: [10, 18], legsAt: [10, 24],
      backShoulder: [9, 19], frontShoulder: [21, 19],
      eyes: [[3, 8], [9, 8]],
    },
    up: {
      head: kaiHeadUp, torso: kaiTorsoUp, legs: frontLegSet(kaiLeg),
      headAt: [9, 6], torsoAt: [10, 18], legsAt: [10, 24],
      backShoulder: [9, 19], frontShoulder: [21, 19],
      eyes: [],
    },
    side: {
      head: kaiHeadSide, torso: kaiTorsoSide, legs: sideLegSet(RAMPS.sand, RAMPS.brown),
      headAt: [10, 6], torsoAt: [11, 18], legsAt: [0, 0],
      frontShoulder: [14, 19], backShoulder: [17, 19],
      eyes: [[10, 8]],
    },
  },
  weapon: (img, w) => drawBlade(img, w, { len: 9 }),
};

// ======================================================================================== Lyra
const LYRA = charLegend({ hair: RAMPS.hairBlonde, skin: RAMPS.skin, a: RAMPS.plum, b: RAMPS.gold, lea: RAMPS.brown, met: RAMPS.steel, gold: RAMPS.gold, pants: RAMPS.teal });

const lyraHeadDown = g(LYRA, `
  ....HHHHHH....
  ..HHYYHHHHHH..
  .HYYYHHHHHHHh.
  .HYYHHHHHHHHhh
  hHYHHHHHHHHHhh
  hHHHHHHHHHHHhh
  hHHHHHHHHHHHhh
  hHHSSSHHSSSShh
  hHSSSSSSSSSSHh
  hHSSSSSSSSSSHh
  hHSSSSSSSSSSHh
  hHhSSSSssSShHh
  hHh.ssSSSSs.hh
  hHh.........hh
  .hh.........h.
`);
const lyraHeadUp = g(LYRA, `
  ....HHHHHH....
  ..HHYYHHHHHH..
  .HYYYHHHHHHHh.
  .HYYHHHHHHHHhh
  hHYHHHHHHHHHhh
  hHHHHHHHHHHHhh
  hHHHHHHHHHHHhh
  hHHHHHHHHHHhhh
  hhHHHHHHHHHhhh
  hhHHHHHHHHhhhh
  .hhHHHHHHHhhh.
  .hhHYHHHHHhhh.
  ..hhHHHHHhhh..
  ..hhhHHHhhhh..
  ...hhhhhhhh...
  ....hhhhhh....
`);
const lyraHeadSide = g(LYRA, `
  ....HHHHH....
  ..HHYYHHHHH..
  .HYYYHHHHHHH.
  hHYYHHHHHHHHh
  hHYHHHHHHHHHh
  hHHHHHHHHHHHh
  hHHHHHHHHHSHh
  hHHHHHHHSSSSh
  hHHHHhSSSSSSS
  hHHHhsSSSSSSS
  hHHhhsSSSSSSs
  hHHh.sSSSSSs.
  hHhh..sssSs..
  hhh..........
  .hh..........
`);
const lyraTorsoDown = g(LYRA, `
  ....bGGb....
  ..cCCyyCCc..
  .cCDCGGCCCc.
  .cCDCGGCCCc.
  .cCDCyGCCCc.
  .cCDCGGCCCc.
`);
const lyraTorsoUp = g(LYRA, `
  ....bGGb....
  ..cCCCCCCc..
  .cCDCCCCCCc.
  .cCDCCCCCCc.
  .cCDCCCCCCc.
  .cCDCCCCCCc.
`);
const lyraTorsoSide = g(LYRA, `
  ...bGGb...
  ..cCDCCc..
  .cCDCCCCc.
  .cCDCCCyc.
  .cCDCCCGc.
  .cCDCCCGc.
`);
// robe skirt + feet (front view): stand, left step, right step, tucked
const lyraSkirtDown = [
  `
  ..cCDCGGCc..
  ..cCDCGGCc..
  .cCDCCGGCCc.
  .cCDCCGGCCc.
  .gGGGGGGGGg.
  ..nN....Nn..
  `,
  `
  ..cCDCGGCc..
  ..cCDCGGCc..
  .cCDCCGGCCc.
  cCDCCCGGCCc.
  gGGGGGGGGg..
  .nNn........
  `,
  `
  ..cCDCGGCc..
  ..cCDCGGCc..
  .cCDCCGGCCc.
  .cCDCCGGCCCc
  ..gGGGGGGGGg
  ........nNn.
  `,
  `
  ..cCDCGGCc..
  ..cCDCGGCc..
  .cCDCCGGCCc.
  .gGGGGGGGGg.
  ............
  ............
  `,
].map((s) => g(LYRA, s));
const lyraSkirtUp = [
  `
  ..cCDCCCCc..
  ..cCDCCCCc..
  .cCDCCCCCCc.
  .cCDCCCCCCc.
  .gGGGGGGGGg.
  ..ln....nl..
  `,
  `
  ..cCDCCCCc..
  ..cCDCCCCc..
  .cCDCCCCCCc.
  cCDCCCCCCCc.
  gGGGGGGGGg..
  .lnl........
  `,
  `
  ..cCDCCCCc..
  ..cCDCCCCc..
  .cCDCCCCCCc.
  .cCDCCCCCCCc
  ..gGGGGGGGGg
  ........lnl.
  `,
  `
  ..cCDCCCCc..
  ..cCDCCCCc..
  .cCDCCCCCCc.
  .gGGGGGGGGg.
  ............
  ............
  `,
].map((s) => g(LYRA, s));

/** Side robe: feet first, then a flared skirt that sways opposite to the stride. */
function robeSide(sway: number, near: [number, number] | null, far: [number, number] | null, hipY = 24, hemY = 28): Img {
  const L = new Img(FW, FH);
  const foot = (p: [number, number] | null, dark: boolean) => {
    if (!p) return;
    const [x, y] = p;
    for (let i = 0; i < 3; i++) L.set(x + i, y, dark ? C.brn0 : C.brn1);
    for (let i = 0; i < 3; i++) L.set(x + i, y - 1, dark ? C.brn1 : C.brn2);
  };
  foot(far, true);
  foot(near, false);
  // skirt trapezoid from the hips (x 12..19) to the hem (x 10+sway .. 21+sway)
  const P = RAMPS.plum;
  for (let y = hipY; y <= hemY; y++) {
    const t = (y - hipY) / (hemY - hipY);
    const x0 = Math.round(12 - 2 * t + sway * t), x1 = Math.round(19 + 2 * t + sway * t);
    for (let x = x0; x <= x1; x++) {
      const c = y === hemY ? (x === x0 || x === x1 ? C.gold1 : C.gold2) : x <= x0 + 1 ? P[3] : x >= x1 - 1 ? P[1] : x === x1 - 3 ? C.gold2 : P[2];
      L.set(x, y, c);
    }
  }
  return outline(L);
}
const lyraLegsSide = [
  robeSide(0, [16, 29], [14, 29]),
  robeSide(-1, [19, 29], [11, 29]),
  robeSide(0, [15, 29], null),
  robeSide(1, [11, 29], [18, 29]),
  robeSide(0, null, [15, 29]),
  robeSide(-1, [17, 29], [13, 29], 26, 29),
  robeSide(-2, null, null, 24, 28),
  robeSide(-2, [20, 29], [11, 29], 25, 29),
];

const lyra: CharDef = {
  sleeve: RAMPS.plum,
  skin: RAMPS.skin,
  eye: [C.grn0, C.grn1, C.grn2, C.grn3],
  parts: {
    down: {
      head: lyraHeadDown, torso: lyraTorsoDown, legs: lyraSkirtDown,
      headAt: [9, 6], torsoAt: [10, 18], legsAt: [10, 24],
      backShoulder: [9, 19], frontShoulder: [21, 19],
      eyes: [[3, 8], [9, 8]],
    },
    up: {
      head: lyraHeadUp, torso: lyraTorsoUp, legs: lyraSkirtUp,
      headAt: [9, 6], torsoAt: [10, 18], legsAt: [10, 24],
      backShoulder: [9, 19], frontShoulder: [21, 19],
      eyes: [],
    },
    side: {
      head: lyraHeadSide, torso: lyraTorsoSide, legs: lyraLegsSide,
      headAt: [10, 6], torsoAt: [11, 18], legsAt: [0, 0],
      frontShoulder: [14, 19], backShoulder: [17, 19],
      eyes: [[10, 8]],
    },
  },
  weapon: (img, w) => drawStaff(img, w, { len: 12, under: 5 }),
};

// ======================================================================================== Bram
const BRAM = charLegend({ hair: RAMPS.hairRed, skin: RAMPS.skin, a: RAMPS.stone, b: RAMPS.red, lea: RAMPS.brown, met: RAMPS.steel, gold: RAMPS.gold, pants: RAMPS.hairDark });

const bramHeadDown = g(BRAM, `
  .....3333.....
  ...33444332...
  ..3344433322..
  .334433333222.
  .334333333222.
  .233333333322.
  11222222222211
  .hSSSSSSSSSSh.
  hSSSSSSSSSSSSh
  hSSSSSSSSSSSSh
  hSSSSSSSSSSSSh
  .hHsSSSSSSsHh.
  ..hHHHsSHHHh..
  ...hHHHHHHh...
`);
const bramHeadUp = g(BRAM, `
  .....3333.....
  ...33444332...
  ..3344433322..
  .334433333222.
  .334333333222.
  .233333333322.
  11222222222211
  .h2222222222h.
  hHH22222222HHh
  hHHHHHHHHHHHHh
  hhHHHHHHHHHHhh
  .hhHHHHHHHHhh.
  ..ssHHHHHHss..
  ...ssssssss...
`);
const bramHeadSide = g(BRAM, `
  ....3333.....
  ..33444332...
  .3344433322..
  .33443333222.
  334333333222.
  2333333332222
  1222222222222
  .hhHHHhSSSSS.
  .hhHHsSSSSSSS
  .hhHzsSSSSSSS
  .hhHssSSSSSSs
  ..hHHsSSSsHHh
  ...hHHHHHHHh.
  ....hHHHHHh..
`);
const bramTorsoDown = g(BRAM, `
  ....bPPPPb....
  .2331PPPP1332.
  23431PRRP13432
  2332bPRPPb2332
  .22.bPPPPb.22.
  ..lnNNGGNNnl..
  ..1bPPPPPPb1..
`);
const bramTorsoUp = g(BRAM, `
  ....bPPPPb....
  .2331PPPP1332.
  23431PPPP13432
  2332bPPPPb2332
  .22.bPPPPb.22.
  ..lnNNNNNNnl..
  ..1bPPPPPPb1..
`);
const bramTorsoSide = g(BRAM, `
  ...bPPPb...
  ..23PRPP3..
  .2343PPP43.
  .2332PPP32.
  ..22bPPPb..
  ..lnNNGNl..
  ..1bPPPb1..
`);
const bramLeg = g(BRAM, `
  tUU.
  tUU.
  tUU.
  2331
  2332
  1221
`);

/** Bram's heater shield: blue field, gold emblem, steel rim. Faces: front, back (straps), side (edge). */
const SHIELD = charLegend({ a: RAMPS.blue, b: RAMPS.gold, lea: RAMPS.brown, met: RAMPS.steel, gold: RAMPS.gold });
const shieldFront = g(SHIELD, `
  3333333333
  34CCCCCDD2
  3DCCbbCCC2
  3DCbyybCC2
  3CCCbbCCc2
  3CCCbbCCc2
  .3CCbbCc2.
  .3CCCCcc2.
  ..3CCcc2..
  ...3cc2...
  ....22....
`);
const shieldBack = g(SHIELD, `
  2222222222
  2OONNNNNn1
  2NNlllllN1
  2NNNNNNNn1
  2NNlllllN1
  2NNNNNNnn1
  .2NNNNnn1.
  .2NNlllN1.
  ..2NNnn1..
  ...2nn1...
  ....11....
`);
const shieldSide = g(SHIELD, `
  34.
  3D2
  3D2
  3C2
  3C2
  3C2
  3C2
  3c2
  3c2
  .2.
`);
function drawShield(img: Img, o: { x: number; y: number; kind?: string }) {
  const s = o.kind === 'back' ? shieldBack : o.kind === 'side' ? shieldSide : shieldFront;
  blit(img, s, o.x - Math.floor(s.w / 2), o.y - Math.floor(s.h / 2));
}

const bram: CharDef = {
  sleeve: RAMPS.stone,
  skin: RAMPS.skin,
  eye: [C.brn0, C.brn1, C.brn2, C.brn3],
  parts: {
    down: {
      head: bramHeadDown, torso: bramTorsoDown, legs: frontLegSet(bramLeg, 2, 14),
      headAt: [9, 6], torsoAt: [9, 18], legsAt: [9, 24],
      backShoulder: [8, 19], frontShoulder: [22, 19],
      eyes: [[3, 8], [9, 8]],
    },
    up: {
      head: bramHeadUp, torso: bramTorsoUp, legs: frontLegSet(bramLeg, 2, 14),
      headAt: [9, 6], torsoAt: [9, 18], legsAt: [9, 24],
      backShoulder: [8, 19], frontShoulder: [22, 19],
      eyes: [],
    },
    side: {
      head: bramHeadSide, torso: bramTorsoSide, legs: sideLegSet(RAMPS.hairDark, RAMPS.steel, 15, 24, { w: 4, bootLen: 5 }),
      headAt: [10, 6], torsoAt: [10, 18], legsAt: [0, 0],
      frontShoulder: [14, 19], backShoulder: [18, 19],
      eyes: [[10, 8]],
    },
  },
  weapon: (img, w) => drawMace(img, w, { len: 5 }),
  offhand: (img, o) => drawShield(img, o),
};

// ======================================================================================== KO pose
/** Lying flat: the side idle frame turned on its back, resting on the ground line. */
export function koFrame(ch: CharDef): Img {
  const stand = renderPose(ch, { f: 'side', eyes: 'ko', front: { hx: 1, hy: 4 }, back: { hx: -1, hy: 4 } });
  const r = rotate90(mirrorX(stand)); // head to the right, face up
  const out = new Img(FW, FH);
  // find the lowest opaque row and sit it on row 29
  let maxY = 0;
  r.each((_, y) => (maxY = Math.max(maxY, y)));
  blit(out, r, 0, 29 - maxY);
  return out;
}

// ======================================================================================== sheets
type SheetEntry = ArtModule['sheets'][number];
export function charSheet(id: string, title: string, file: string, ch: CharDef, style: 'sword' | 'staff' | 'shield', notes: string): SheetEntry {
  const make = () => buildAnims(ch, style, koFrame);
  const sheet = rowSheet(make(), 4, FW, FH);
  const def: SheetDef = { id, kind: 'character', title, file, frameW: FW, frameH: FH, cols: sheet.cols, rows: sheet.rows, anims: sheet.anims, origin: ORIGIN, notes };
  return { def, render: () => toRGBA(rowSheet(make(), 4, FW, FH).img) };
}

const NOTE = 'One animation per row (4 columns, 32×32). Side animations face right: set flip_h for left. Pivot at the feet: origin (16, 30).';

export const ART: ArtModule = {
  sheets: [
    charSheet('hero', 'Kai, the hero (sword)', 'assets/characters/kai.png', kai, 'sword', `${NOTE} Attacks are a 4-frame sword slash: wind-up, strike with a smear, follow-through, recover.`),
    charSheet('mage', 'Lyra, the mage (staff)', 'assets/characters/lyra.png', lyra, 'staff', `${NOTE} Attacks are a two-handed staff jab that sparks at the crystal; the staff is always in hand.`),
    charSheet('guard', 'Bram, the guard (shield and mace)', 'assets/characters/bram.png', bram, 'shield', `${NOTE} Attacks are a shield bash with an impact star; the shield stays on his left arm.`),
  ],
};

/** The 64×64 project icon (res://icon.png): Kai in front of a glowing shard. Used by the exporter. */
export function PROJECT_ICON() {
  const img = new Img(64, 64);
  // rounded night-blue tile with horizontal bands (light from the top)
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const cx = Math.max(0, Math.abs(x - 31.5) - 24), cy = Math.max(0, Math.abs(y - 31.5) - 24);
      if (Math.hypot(cx, cy) > 7.5) continue;
      const edge = Math.hypot(cx, cy) > 6.5;
      img.set(x, y, edge ? C.ink : y < 20 ? C.blu1 : y < 42 ? (y % 2 && y < 24 ? C.blu1 : C.blu0) : C.pur1);
    }
  // the shard
  const shard = new Img(64, 64);
  const sh: [number, number][] = [[49, 4], [60, 20], [55, 44], [43, 44], [38, 20]];
  poly(shard, sh, (x, y) => (x < 48 ? (y < 22 ? C.tea3 : C.tea2) : x < 50 ? C.white : y < 26 ? C.tea2 : C.tea1));
  blit(img, outline(shard), 0, 0);
  sparkle(img, 10, 10, 2);
  sparkle(img, 58, 50, 1);
  // Kai, doubled
  const kaiFrame = renderPose(kai, { f: 'down', eyes: 'open' });
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      const c = kaiFrame.get(x, y);
      if (!c) continue;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) img.set(x * 2 + i - 7, y * 2 + j - 4, c);
    }
  // clip to the tile
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const cx = Math.max(0, Math.abs(x - 31.5) - 24), cy = Math.max(0, Math.abs(y - 31.5) - 24);
      if (Math.hypot(cx, cy) > 7.5) img.set(x, y, 0);
      else if (Math.hypot(cx, cy) > 6.5) img.set(x, y, C.ink);
    }
  return toRGBA(img);
}
