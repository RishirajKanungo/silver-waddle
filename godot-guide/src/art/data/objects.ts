// World objects (chests, pots, levers, the save crystal, coins…) and inventory/menu icons.
import type { ArtModule } from '../types';
import { C, Img, RAMPS, ballShade, blit, ellipse, hline, line, outline, poly, rect, ring, toRGBA, vline, grid, type Ramp, packSheet } from './lib';
import { drawBlade, drawMace, drawStaff } from './rig';
import { sparkle } from './poses';

const PI = Math.PI;
const W16 = () => new Img(16, 16);

// ======================================================================================== objects
function chest(open: boolean) {
  const img = W16();
  // body
  rect(img, 2, 8, 12, 7, C.brn2);
  for (let y = 10; y < 15; y += 2) hline(img, 3, 12, y, C.brn1);
  vline(img, 2, 8, 14, C.brn3);
  hline(img, 2, 13, 14, C.brn0);
  if (!open) {
    // lid: rounded top
    rect(img, 2, 4, 12, 4, C.brn2);
    hline(img, 3, 12, 3, C.brn3);
    hline(img, 2, 13, 4, C.brn3);
    hline(img, 2, 13, 7, C.brn0);
  } else {
    // lid flipped back, dark inside, a glint of treasure
    rect(img, 2, 2, 12, 3, C.brn1);
    hline(img, 3, 12, 1, C.brn2);
    rect(img, 3, 5, 10, 3, C.ink);
    hline(img, 3, 12, 7, C.pur1);
    for (const [x, y] of [[5, 6], [8, 6], [10, 7]]) img.set(x, y, C.gold3);
    img.set(6, 7, C.gold2);
    sparkle(img, 9, 4, 1, C.white, C.gold3);
  }
  // gold bands and lock
  for (const x of [4, 11]) {
    vline(img, x, open ? 8 : 3, 14, C.gold2);
    img.set(x, open ? 8 : 3, C.gold3);
  }
  if (open) for (const x of [4, 11]) vline(img, x, 2, 4, C.gold1);
  rect(img, 7, 8, 2, 3, C.gold2);
  img.set(7, 8, C.gold3);
  img.set(8, 10, C.brn0);
  return outline(img);
}
const TERRA: Ramp = [C.brn1, C.brn2, C.snd1, C.snd2];
function pot() {
  const img = W16();
  ballShade(img, 8, 10, 5.5, 4.8, TERRA);
  rect(img, 5, 3, 6, 3, C.snd1);
  hline(img, 4, 11, 3, C.snd2);
  hline(img, 5, 10, 5, C.brn1);
  img.set(6, 4, C.snd2);
  hline(img, 4, 12, 10, C.brn1);
  for (let x = 5; x < 12; x += 3) img.set(x, 11, C.snd2);
  return outline(img);
}
function potShards() {
  const img = W16();
  poly(img, [[2, 14], [5, 10], [7, 14]], C.snd1);
  poly(img, [[8, 14], [10, 9], [13, 12], [12, 14]], C.brn2);
  poly(img, [[6, 9], [8, 7], [9, 10]], C.snd2);
  return outline(img);
}
function crate() {
  const img = W16();
  rect(img, 1, 2, 14, 13, C.brn2);
  for (let y = 5; y < 15; y += 4) hline(img, 1, 14, y, C.brn1);
  rect(img, 1, 2, 14, 2, C.brn3);
  line(img, 2, 14, 13, 4, C.brn3);
  line(img, 3, 14, 13, 5, C.brn1);
  for (const [x, y] of [[1, 2], [14, 2], [1, 14], [14, 14]]) img.set(x, y, C.stn2);
  return outline(img);
}
function sign() {
  const img = W16();
  rect(img, 7, 9, 2, 6, C.brn1);
  vline(img, 7, 9, 14, C.brn2);
  rect(img, 1, 2, 14, 8, C.brn2);
  hline(img, 1, 14, 2, C.brn3);
  hline(img, 1, 14, 9, C.brn0);
  for (const [y, x0, x1] of [[4, 3, 11], [6, 3, 9]]) hline(img, x0, x1, y, C.brn0);
  img.set(1, 2, C.brn3);
  return outline(img);
}
function lever(on: boolean) {
  const img = W16();
  rect(img, 3, 11, 10, 4, C.stn2);
  hline(img, 3, 12, 11, C.stn3);
  hline(img, 3, 12, 14, C.stn0);
  rect(img, 6, 10, 4, 2, C.stn1);
  const tx = on ? 12 : 4;
  line(img, 8, 11, tx, 4, C.brn2);
  line(img, 7, 11, tx - 1, 4, C.brn3);
  ballShade(img, tx, 3, 2, 2, [C.red0, C.red1, C.red2, C.red3], { dither: false });
  img.set(on ? 11 : 3, 2, C.white);
  return outline(img);
}
function crystalSwitch(on: boolean) {
  const img = W16();
  rect(img, 3, 11, 10, 4, C.stn2);
  hline(img, 3, 12, 11, C.stn3);
  hline(img, 3, 12, 14, C.stn1);
  const r: Ramp = on ? [C.tea1, C.tea2, C.tea3, C.white] : [C.blu0, C.blu1, C.blu1, C.blu2];
  poly(img, [[8, 2], [12, 7], [8, 12], [4, 7]], (x, y) => (x + y < 13 ? r[3] : x < 8 ? r[2] : y < 8 ? r[1] : r[0]));
  img.set(7, 4, C.white);
  const L = outline(img);
  if (on) {
    sparkle(L, 2, 3, 1, C.white, C.tea3);
    sparkle(L, 13, 2, 1, C.white, C.tea3);
  }
  return L;
}
function heart(kind: 'full' | 'half' | 'empty') {
  const H = grid(
    `
    ................
    ................
    ...aaa...aaa....
    ..aWWba.abbba...
    ..aWbbbabbbbba..
    ..abbbbbbbbbba..
    ..abbbbbbbbbca..
    ...abbbbbbbca...
    ....abbbbbca....
    .....abbbca.....
    ......abca......
    .......aa.......
  `,
    { a: C.red0, b: C.red2, c: C.red1, W: C.white },
  );
  const img = W16();
  blit(img, H, 0, 2);
  if (kind !== 'full')
    img.map((c, x) => {
      if (c === C.red0) return c;
      if (kind === 'half' && x < 8) return c;
      return c === C.white ? C.stn2 : C.stn0;
    });
  return img;
}
function keyImg() {
  const img = W16();
  ring(img, 5, 6, 1.5, 3.6, (x, y) => (x + y < 11 ? C.gold3 : C.gold2));
  rect(img, 8, 5, 6, 2, C.gold2);
  hline(img, 8, 13, 5, C.gold3);
  rect(img, 11, 7, 1, 3, C.gold2);
  rect(img, 13, 7, 1, 2, C.gold2);
  return outline(img);
}
function saveCrystal(k: number) {
  const img = W16();
  const bob = [0, -1, -1, 0][k];
  // pedestal glow
  hline(img, 5, 10, 15, C.tea1);
  hline(img, 6, 9, 14, C.tea2);
  const r: Ramp = [C.tea1, C.tea2, C.tea3, C.white];
  const cy = 7 + bob;
  poly(img, [[8, cy - 6], [12, cy], [8, cy + 6], [4, cy]], (x, y) => (x < 8 ? (y < cy ? r[3] : r[2]) : y < cy ? r[1] : r[0]));
  line(img, 8, cy - 6, 8, cy + 6, (t) => (t < 0.5 ? C.white : C.tea2));
  img.set(6, cy - 2, C.white);
  const L = outline(img, { ignore: [C.tea1, C.tea2] });
  // orbiting twinkles
  const a = (k / 4) * PI * 2;
  sparkle(L, Math.round(8 + Math.cos(a) * 6), Math.round(cy + Math.sin(a) * 3), 1, C.white, C.tea3);
  L.set(Math.round(8 + Math.cos(a + PI) * 6), Math.round(cy + Math.sin(a + PI) * 3), C.tea3);
  return L;
}
function coin(k: number) {
  const img = W16();
  const w = [3.5, 2.5, 0.8, 2.5][k];
  ellipse(img, 8, 8, w, 3.8, (x, y) => (x < 8 - w * 0.3 ? C.gold3 : x > 8 + w * 0.4 ? C.gold1 : C.gold2));
  if (k === 0) {
    vline(img, 8, 6, 10, C.gold1);
    img.set(7, 5, C.white);
  }
  if (k === 2) vline(img, 8, 5, 11, C.gold2);
  return outline(img);
}

function objectsSheet() {
  const cells: (Img | null)[] = new Array(24).fill(null);
  const put = (i: number, img: Img) => (cells[i] = img);
  put(0, chest(false));
  put(1, chest(true));
  put(2, pot());
  put(3, crate());
  put(4, sign());
  put(5, lever(false));
  put(6, lever(true));
  put(7, crystalSwitch(false));
  put(8, crystalSwitch(true));
  put(9, heart('full'));
  put(10, heart('half'));
  put(11, heart('empty'));
  put(12, keyImg());
  put(13, potShards());
  for (let k = 0; k < 4; k++) put(16 + k, saveCrystal(k));
  for (let k = 0; k < 4; k++) put(20 + k, coin(k));
  return packSheet(cells, 8, 16, 16, 3);
}
const OBJECT_TILES = {
  chest_closed: 0, chest_open: 1, pot: 2, crate: 3, sign: 4, lever_off: 5, lever_on: 6, switch_off: 7, switch_on: 8,
  heart: 9, heart_half: 10, heart_empty: 11, key: 12, pot_shards: 13, save_crystal: 16, coin: 20,
};

// ======================================================================================== icons
const ELEMENT: Record<string, Ramp> = {
  fire: [C.red1, C.red2, C.red3, C.gold3],
  ice: [C.blu1, C.tea2, C.tea3, C.white],
  bolt: [C.gold1, C.gold2, C.gold3, C.white],
  heal: [C.grn1, C.grn2, C.grn3, C.white],
  wind: [C.tea1, C.grn2, C.grn3, C.tea3],
  earth: [C.brn1, C.brn2, C.brn3, C.snd2],
};
function shard(r: Ramp, mark: (img: Img) => void) {
  const img = W16();
  poly(img, [[8, 1], [12, 6], [10, 14], [6, 14], [4, 6]], (x, y) => (x < 7 ? (y < 7 ? r[3] : r[2]) : x < 9 ? (y < 6 ? r[3] : r[2]) : y < 9 ? r[1] : r[0]));
  line(img, 8, 1, 7, 14, (t) => (t < 0.4 ? C.white : 0));
  mark(img);
  return outline(img);
}
function flask(r: Ramp) {
  const img = W16();
  ballShade(img, 8, 10, 4.6, 4.2, r);
  rect(img, 6, 2, 4, 4, C.tea3);
  vline(img, 6, 2, 5, C.white);
  rect(img, 6, 1, 4, 2, C.brn2);
  hline(img, 6, 9, 1, C.brn3);
  img.set(6, 8, C.white);
  img.set(6, 9, C.white);
  hline(img, 4, 12, 7, r[3]);
  return outline(img);
}
function icons(): { img: Img; names: string[] } {
  const L: [string, Img][] = [];
  const add = (n: string, img: Img) => L.push([n, img]);
  const icon = (f: (img: Img) => void) => {
    const img = W16();
    f(img);
    return outline(img);
  };
  add('sword', icon((i) => drawBlade(i, { x: 4, y: 12, a: -PI / 4 }, { len: 11 })));
  add('staff', icon((i) => drawStaff(i, { x: 5, y: 11, a: -PI / 4 }, { len: 8, under: 4 })));
  add('mace', icon((i) => drawMace(i, { x: 4, y: 12, a: -PI / 4 }, { len: 6 })));
  add('shield', (() => {
    const img = W16();
    poly(img, [[2, 2], [14, 2], [14, 8], [8, 15], [2, 8]], (x, y) => (x < 8 ? (y < 5 ? C.blu3 : C.blu2) : C.blu1));
    hline(img, 2, 13, 2, C.stn3);
    vline(img, 7, 4, 12, C.gold2);
    hline(img, 4, 11, 6, C.gold2);
    img.set(7, 6, C.gold3);
    return outline(img);
  })());
  add('helmet', icon((i) => {
    ballShade(i, 8, 9, 6, 6, RAMPS.steel);
    for (let x = 0; x < 16; x++) for (let y = 10; y < 16; y++) i.set(x, y, 0);
    hline(i, 1, 14, 10, C.stn1);
    hline(i, 2, 13, 11, C.stn2);
    rect(i, 7, 3, 2, 8, C.red2);
    vline(i, 7, 3, 9, C.red3);
  }));
  add('armor', icon((i) => {
    poly(i, [[2, 3], [6, 2], [8, 4], [10, 2], [14, 3], [13, 8], [12, 14], [4, 14], [3, 8]], (x, y) => (x < 8 ? (y < 7 ? C.stn3 : C.stn2) : C.stn1));
    vline(i, 8, 4, 13, C.stn0);
    hline(i, 4, 11, 10, C.brn1);
    i.set(8, 10, C.gold2);
    i.set(5, 5, C.white);
  }));
  add('boots', icon((i) => {
    for (const ox of [1, 8]) {
      rect(i, ox + 1, 3, 4, 8, C.brn2);
      rect(i, ox + 1, 10, 6, 3, C.brn2);
      vline(i, ox + 1, 3, 12, C.brn3);
      hline(i, ox + 1, ox + 6, 13, C.brn0);
      hline(i, ox + 1, ox + 4, 4, C.gold2);
    }
  }));
  add('ring', icon((i) => {
    ring(i, 8, 10, 2.4, 4.3, (x, y) => (x + y < 17 ? C.gold3 : C.gold1));
    poly(i, [[8, 2], [11, 5], [8, 8], [5, 5]], (x, y) => (x < 8 ? C.red3 : y < 5 ? C.red2 : C.red1));
    i.set(7, 4, C.white);
  }));
  add('amulet', icon((i) => {
    ring(i, 8, 5, 4.5, 5.3, C.gold2, PI, PI * 2);
    ring(i, 8, 5, 4.5, 5.3, C.gold2, -PI, 0);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 16; x++) if (y > 4) i.set(x, y, 0);
    ballShade(i, 8, 11, 3.2, 3.2, [C.blu0, C.tea1, C.tea2, C.tea3]);
    ring(i, 8, 11, 3, 4, C.gold2);
    i.set(7, 10, C.white);
  }));
  add('potion', flask([C.red0, C.red1, C.red2, C.red3]));
  add('ether', flask([C.blu0, C.blu1, C.blu2, C.blu3]));
  add('revive_feather', icon((i) => {
    for (let t = 0; t <= 1; t += 0.04) {
      const x = 3 + t * 9, y = 14 - t * 11 - Math.sin(t * PI) * 1.5;
      const w = Math.sin(t * PI) * 3.2;
      line(i, x, y, x - w * 0.6, y - w, t > 0.5 ? C.white : C.stn3);
      line(i, x, y, x + w, y + w * 0.4, C.gold3);
    }
    line(i, 2, 15, 12, 3, (t) => (t < 0.3 ? C.gold1 : C.gold2));
  }));
  add('key', keyImg());
  add('coin', coin(0));
  add('bag', icon((i) => {
    ballShade(i, 8, 10, 6, 5, [C.brn0, C.brn1, C.brn2, C.brn3]);
    rect(i, 6, 3, 4, 3, C.brn2);
    hline(i, 5, 10, 5, C.gold2);
    i.set(4, 2, C.brn2);
    i.set(11, 2, C.brn2);
    hline(i, 6, 9, 9, C.brn1);
  }));
  add('shard_fire', shard(ELEMENT.fire, (i) => {
    i.set(8, 8, C.gold3);
    i.set(8, 9, C.white);
  }));
  add('shard_ice', shard(ELEMENT.ice, (i) => sparkle(i, 8, 9, 1, C.white, C.tea3)));
  add('shard_bolt', shard(ELEMENT.bolt, (i) => line(i, 9, 5, 7, 9, C.white)));
  add('shard_heal', shard(ELEMENT.heal, (i) => {
    hline(i, 7, 9, 9, C.white);
    vline(i, 8, 8, 10, C.white);
  }));
  add('shard_wind', shard(ELEMENT.wind, (i) => {
    hline(i, 6, 9, 7, C.white);
    hline(i, 7, 10, 10, C.white);
  }));
  add('shard_earth', shard(ELEMENT.earth, (i) => {
    i.set(7, 9, C.grn3);
    i.set(9, 9, C.grn3);
    i.set(8, 8, C.grn2);
  }));
  add('gear_slot', (() => {
    const i = W16();
    rect(i, 1, 1, 14, 14, C.stn0);
    rect(i, 2, 2, 12, 12, C.blu0);
    for (let k = 2; k < 14; k += 3) {
      i.set(k, 2, C.stn2);
      i.set(2, k, C.stn2);
      i.set(k, 13, C.stn1);
      i.set(13, k, C.stn1);
    }
    for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]]) i.set(x, y, 0);
    return i;
  })());
  add('skill_scroll', icon((i) => {
    rect(i, 3, 4, 10, 8, C.snd2);
    hline(i, 3, 12, 4, C.skin3);
    for (const y of [6, 8, 10]) hline(i, 5, y === 10 ? 8 : 11, y, C.brn1);
    for (const x of [2, 13]) {
      rect(i, x, 3, 1, 10, C.brn2);
      i.set(x, 3, C.brn3);
    }
    i.set(10, 10, C.red2);
    i.set(11, 10, C.red2);
    i.set(10, 11, C.red1);
  }));
  add('map', icon((i) => {
    poly(i, [[1, 3], [5, 2], [10, 4], [15, 3], [15, 13], [10, 14], [5, 12], [1, 13]], (x) => (x < 5 ? C.snd2 : x < 10 ? C.snd1 : C.snd2));
    line(i, 3, 10, 7, 7, C.red2);
    line(i, 7, 7, 11, 9, C.red2);
    i.set(12, 7, C.red1);
    i.set(11, 6, C.red1);
    i.set(13, 8, C.red1);
    i.set(11, 8, C.red1);
    i.set(13, 6, C.red1);
    vline(i, 5, 3, 12, C.brn2);
    vline(i, 10, 4, 13, C.brn2);
  }));
  return { img: packSheet(L.map(([, img]) => img), 8, 16, 16, 3), names: L.map(([n]) => n) };
}
const ICON_NAMES = icons().names;

export const ART: ArtModule = {
  sheets: [
    {
      def: {
        id: 'objects', kind: 'object', title: 'Objects', file: 'assets/objects/objects.png', frameW: 16, frameH: 16, cols: 8, rows: 3,
        tiles: OBJECT_TILES,
        anims: {
          save_crystal: { frames: [16, 17, 18, 19], fps: 6, loop: true },
          coin: { frames: [20, 21, 22, 23], fps: 10, loop: true },
          chest_open: { frames: [0, 1], fps: 8, loop: false },
          lever: { frames: [5, 6], fps: 8, loop: false },
        },
        notes: 'Interactables. Two-state objects sit side by side (chest closed/open, lever off/on, switch off/on); the save crystal and coin loop. Hearts come full, half and empty for a HUD.',
      },
      render: () => toRGBA(objectsSheet()),
    },
    {
      def: {
        id: 'icons', kind: 'icon', title: 'Item and menu icons', file: 'assets/ui/icons.png', frameW: 16, frameH: 16, cols: 8, rows: 3,
        tiles: Object.fromEntries(ICON_NAMES.map((n, i) => [n, i])),
        notes: 'Use an AtlasTexture per icon (region = column*16, row*16, 16, 16) or a TextureRect with a region. The six elemental shards match the battle system\'s elements.',
      },
      render: () => toRGBA(icons().img),
    },
  ],
};
