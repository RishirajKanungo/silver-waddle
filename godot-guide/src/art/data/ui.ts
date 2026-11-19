// Interface art: the bitmap font, the nine-slice window, the menu cursor and gauge bars.
import type { ArtModule, SheetDef } from '../types';
import { C, Img, blit, grid, toRGBA, hline, vline } from './lib';

// ---------------------------------------------------------------------------------------- font
// 6×8 cells. Glyphs are 5 px wide with a 1 px gap; capitals are 7 px tall (rows 0-6), the x-height is
// 5 px (rows 2-6) and descenders use row 7. '#' is ink, everything else transparent.
const G: Record<string, string> = {
  ' ': '',
  '!': '..#..|..#..|..#..|..#..|..#..|.....|..#..',
  '"': '.#.#.|.#.#.|.#.#.',
  '#': '.#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.',
  $: '..#..|.####|#.#..|.###.|..#.#|####.|..#..',
  '%': '##...|##..#|...#.|..#..|.#...|#..##|...##',
  '&': '.##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#',
  "'": '..#..|..#..|.#...',
  '(': '...#.|..#..|.#...|.#...|.#...|..#..|...#.',
  ')': '.#...|..#..|...#.|...#.|...#.|..#..|.#...',
  '*': '.....|..#..|#.#.#|.###.|#.#.#|..#..',
  '+': '.....|..#..|..#..|#####|..#..|..#..',
  ',': '.....|.....|.....|.....|.....|.##..|..#..|.#...',
  '-': '.....|.....|.....|#####',
  '.': '.....|.....|.....|.....|.....|.##..|.##..',
  '/': '....#|....#|...#.|..#..|.#...|#....|#....',
  '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
  '1': '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  '2': '.###.|#...#|....#|...#.|..#..|.#...|#####',
  '3': '#####|...#.|..#..|...#.|....#|#...#|.###.',
  '4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
  '5': '#####|#....|####.|....#|....#|#...#|.###.',
  '6': '..##.|.#...|#....|####.|#...#|#...#|.###.',
  '7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
  '8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  '9': '.###.|#...#|#...#|.####|....#|...#.|.##..',
  ':': '.....|.##..|.##..|.....|.##..|.##..',
  ';': '.....|.##..|.##..|.....|.##..|..#..|.#...',
  '<': '...#.|..#..|.#...|#....|.#...|..#..|...#.',
  '=': '.....|.....|#####|.....|#####',
  '>': '.#...|..#..|...#.|....#|...#.|..#..|.#...',
  '?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
  '@': '.###.|#...#|#.###|#.#.#|#.###|#....|.####',
  A: '.###.|#...#|#...#|#####|#...#|#...#|#...#',
  B: '####.|#...#|#...#|####.|#...#|#...#|####.',
  C: '.###.|#...#|#....|#....|#....|#...#|.###.',
  D: '####.|#...#|#...#|#...#|#...#|#...#|####.',
  E: '#####|#....|#....|####.|#....|#....|#####',
  F: '#####|#....|#....|####.|#....|#....|#....',
  G: '.###.|#...#|#....|#.###|#...#|#...#|.####',
  H: '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  I: '.###.|..#..|..#..|..#..|..#..|..#..|.###.',
  J: '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
  K: '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
  L: '#....|#....|#....|#....|#....|#....|#####',
  M: '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#',
  N: '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#',
  O: '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  P: '####.|#...#|#...#|####.|#....|#....|#....',
  Q: '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
  R: '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  S: '.####|#....|#....|.###.|....#|....#|####.',
  T: '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  U: '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  V: '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  W: '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.',
  X: '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  Y: '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
  Z: '#####|....#|...#.|..#..|.#...|#....|#####',
  '[': '.###.|.#...|.#...|.#...|.#...|.#...|.###.',
  '\\': '#....|#....|.#...|..#..|...#.|....#|....#',
  ']': '.###.|...#.|...#.|...#.|...#.|...#.|.###.',
  '^': '..#..|.#.#.|#...#',
  _: '.....|.....|.....|.....|.....|.....|.....|#####',
  '`': '.#...|..#..',
  a: '.....|.....|.###.|....#|.####|#...#|.####',
  b: '#....|#....|####.|#...#|#...#|#...#|####.',
  c: '.....|.....|.###.|#....|#....|#...#|.###.',
  d: '....#|....#|.####|#...#|#...#|#...#|.####',
  e: '.....|.....|.###.|#...#|#####|#....|.###.',
  f: '..##.|.#..#|.#...|###..|.#...|.#...|.#...',
  g: '.....|.....|.####|#...#|#...#|.####|....#|.###.',
  h: '#....|#....|#.##.|##..#|#...#|#...#|#...#',
  i: '..#..|.....|.##..|..#..|..#..|..#..|.###.',
  j: '...#.|.....|..##.|...#.|...#.|...#.|#..#.|.##..',
  k: '#....|#....|#..#.|#.#..|##...|#.#..|#..#.',
  l: '.##..|..#..|..#..|..#..|..#..|..#..|.###.',
  m: '.....|.....|##.#.|#.#.#|#.#.#|#.#.#|#...#',
  n: '.....|.....|#.##.|##..#|#...#|#...#|#...#',
  o: '.....|.....|.###.|#...#|#...#|#...#|.###.',
  p: '.....|.....|####.|#...#|#...#|####.|#....|#....',
  q: '.....|.....|.####|#...#|#...#|.####|....#|....#',
  r: '.....|.....|#.##.|##..#|#....|#....|#....',
  s: '.....|.....|.####|#....|.###.|....#|####.',
  t: '.#...|.#...|###..|.#...|.#...|.#..#|..##.',
  u: '.....|.....|#...#|#...#|#...#|#..##|.##.#',
  v: '.....|.....|#...#|#...#|#...#|.#.#.|..#..',
  w: '.....|.....|#...#|#...#|#.#.#|#.#.#|.#.#.',
  x: '.....|.....|#...#|.#.#.|..#..|.#.#.|#...#',
  y: '.....|.....|#...#|#...#|#...#|.####|....#|.###.',
  z: '.....|.....|#####|...#.|..#..|.#...|#####',
  '{': '...##|..#..|..#..|.#...|..#..|..#..|...##',
  '|': '..#..|..#..|..#..|..#..|..#..|..#..|..#..|..#..',
  '}': '##...|..#..|..#..|...#.|..#..|..#..|##...',
  '~': '.....|.....|.#...|#.#.#|...#.',
};

function fontSheet() {
  const img = new Img(16 * 6, 6 * 8);
  for (let code = 32; code <= 126; code++) {
    const ch = String.fromCharCode(code);
    const rows = G[ch].split('|');
    const i = code - 32;
    const ox = (i % 16) * 6, oy = Math.floor(i / 16) * 8;
    rows.forEach((r, y) => {
      for (let x = 0; x < r.length; x++) if (r[x] === '#') img.set(ox + x, oy + y, C.white);
    });
  }
  // the font is pure white so it can be tinted (modulate) to any colour
  const data = new Uint8ClampedArray(img.w * img.h * 4);
  img.px.forEach((c, k) => {
    if (c) data.set([255, 255, 255, 255], k * 4);
  });
  return { w: img.w, h: img.h, data };
}

const fontTiles: Record<string, number> = {};
for (let code = 32; code <= 126; code++) fontTiles[String.fromCharCode(code)] = code - 32;

// ---------------------------------------------------------------------------------------- panel
// A Golden Sun-style window: steel double rim with gold rivets, deep blue body with a soft top sheen.
function panel() {
  const img = new Img(24, 24);
  // body
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 24; x++) {
      const c = y < 4 ? C.blu1 : C.blu0;
      img.set(x, y, c);
    }
  // inner sheen band under the top rim (stays in the top border slice, so it does not stretch oddly)
  hline(img, 3, 20, 3, C.blu1);
  // rims
  const ringAt = (k: number, c: number) => {
    hline(img, k + 1, 22 - k, k, c);
    hline(img, k + 1, 22 - k, 23 - k, c);
    vline(img, k, k + 1, 22 - k, c);
    vline(img, 23 - k, k + 1, 22 - k, c);
  };
  ringAt(0, C.stn0);
  ringAt(1, C.stn3);
  ringAt(2, C.stn1);
  // light from top-left: the outer bright rim is darker on the bottom/right
  hline(img, 2, 21, 22, C.stn2);
  vline(img, 22, 2, 21, C.stn2);
  // rounded outer corners
  for (const [x, y] of [[0, 0], [23, 0], [0, 23], [23, 23]]) img.set(x, y, 0);
  for (const [x, y] of [[1, 1], [22, 1], [1, 22], [22, 22]]) img.set(x, y, C.stn0);
  // gold rivets in each corner
  for (const [x, y] of [[3, 3], [19, 3], [3, 19], [19, 19]]) {
    img.set(x, y, C.gold3);
    img.set(x + 1, y, C.gold2);
    img.set(x, y + 1, C.gold2);
    img.set(x + 1, y + 1, C.gold1);
  }
  return img;
}

// ---------------------------------------------------------------------------------------- cursor
function cursorFrames() {
  const lg = { o: C.brn0, W: C.white, s: C.stn3 };
  // a pointing glove (points right)
  const hand = grid(
    `
    ........
    ..oo....
    .oWWooo.
    oWWWWWWo
    oWWWsss.
    oWWWo...
    .oso....
    ........
  `,
    lg,
  );
  const f0 = new Img(8, 8), f1 = new Img(8, 8);
  blit(f0, hand, 0, 0);
  blit(f1, hand, 1, 0);
  return [f0, f1];
}

// ---------------------------------------------------------------------------------------- bars
function bar(kind: 'hp' | 'mp' | 'atb' | 'atb_full' | 'stagger' | 'empty' | 'frame') {
  const img = new Img(48, 6);
  if (kind === 'frame') {
    hline(img, 1, 46, 0, C.stn3);
    hline(img, 1, 46, 5, C.stn1);
    vline(img, 0, 1, 4, C.stn3);
    vline(img, 47, 1, 4, C.stn1);
    // little end caps
    img.set(1, 1, C.stn2);
    img.set(46, 4, C.stn0);
    return img;
  }
  const ramp: Record<string, number[]> = {
    hp: [C.grn1, C.grn2, C.grn3, C.white],
    mp: [C.blu1, C.blu2, C.blu3, C.white],
    atb: [C.gold1, C.gold2, C.gold2, C.gold3],
    atb_full: [C.gold2, C.gold3, C.gold3, C.white],
    stagger: [C.red1, C.red2, C.red3, C.gold3],
    empty: [C.ink, C.stn0, C.stn0, C.stn1],
  };
  const r = ramp[kind];
  // interior 46×4 at (1,1): highlight row, two body rows, shade row
  hline(img, 1, 46, 1, r[3]);
  hline(img, 1, 46, 2, r[2]);
  hline(img, 1, 46, 3, r[1]);
  hline(img, 1, 46, 4, r[0]);
  if (kind === 'atb_full') for (let x = 2; x < 46; x += 6) img.set(x, 2, C.white);
  if (kind === 'stagger') for (let x = 1; x < 47; x += 4) img.set(x, 3, C.red2);
  if (kind === 'empty') for (let x = 4; x < 46; x += 8) img.set(x, 2, C.stn1);
  return img;
}

// ---------------------------------------------------------------------------------------- module
const FONT: SheetDef = {
  id: 'font_pixel',
  kind: 'font',
  title: 'Pixel font (6×8)',
  file: 'assets/ui/font_pixel.png',
  frameW: 6,
  frameH: 8,
  cols: 16,
  rows: 6,
  tiles: fontTiles,
  notes:
    'Printable ASCII 32–126, white so it can be tinted. In Godot import it as Font Data (Image Font): columns 16, rows 6, character ranges "32-126"; capitals are 7 px tall with a 1 px descender row.',
};

const BAR_KINDS = ['hp', 'mp', 'atb', 'atb_full', 'stagger', 'empty', 'frame'] as const;

export const ART: ArtModule = {
  sheets: [
    { def: FONT, render: fontSheet },
    {
      def: {
        id: 'ui_panel',
        kind: 'ui',
        title: 'Window panel (nine-slice)',
        file: 'assets/ui/panel.png',
        frameW: 24,
        frameH: 24,
        cols: 1,
        rows: 1,
        notes:
          'A 24×24 nine-slice with 8 px corners. NinePatchRect: texture = panel.png and patch_margin_left/top/right/bottom = 8. As a StyleBoxTexture: texture_margin_* = 8, axis_stretch = Tile or Stretch, and content_margin_* about 6 so text clears the rim.',
      },
      render: () => toRGBA(panel()),
    },
    {
      def: {
        id: 'ui_cursor',
        kind: 'ui',
        title: 'Menu cursor',
        file: 'assets/ui/cursor.png',
        frameW: 8,
        frameH: 8,
        cols: 2,
        rows: 1,
        anims: { bob: { frames: [0, 1], fps: 4, loop: true } },
        notes: 'A pointing glove that nudges right and back. Place it left of the selected menu item.',
      },
      render: () => {
        const [a, b] = cursorFrames();
        const o = new Img(16, 8);
        blit(o, a, 0, 0);
        blit(o, b, 8, 0);
        return toRGBA(o);
      },
    },
    {
      def: {
        id: 'ui_bars',
        kind: 'ui',
        title: 'Gauge bars',
        file: 'assets/ui/bars.png',
        frameW: 48,
        frameH: 6,
        cols: 1,
        rows: 7,
        tiles: { hp_fill: 0, mp_fill: 1, atb_fill: 2, atb_full: 3, stagger_fill: 4, empty: 5, frame: 6 },
        notes:
          'For a TextureProgressBar use an AtlasTexture per row: texture_under = empty, texture_progress = a fill, texture_over = frame. Fills sit inside the 1 px frame (46×4 interior).',
      },
      render: () => {
        const o = new Img(48, 42);
        BAR_KINDS.forEach((k, i) => blit(o, bar(k), 0, i * 6));
        return toRGBA(o);
      },
    },
  ],
};
