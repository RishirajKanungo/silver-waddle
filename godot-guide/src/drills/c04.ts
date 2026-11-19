import { md, type Drill } from '../content/types';

const CORNER_VALUE: Record<string, number> = { TL: 1, TR: 2, BL: 4, BR: 8 };

export const DRILLS: Drill[] = [
  {
    id: 'c04-cell-of-point',
    module: 'c04',
    title: 'Cell under a point',
    skill: 'tile coordinates',
    gen: (rng) => {
      const x = rng.int(0, 639), y = rng.int(0, 359);
      const c = [Math.floor(x / 16), Math.floor(y / 16)];
      return {
        prompt: md`16×16 tiles, layer at the origin. Which cell contains the point (${x}, ${y})?`,
        answer: { kind: 'vector', value: c },
        solution: md`$(\lfloor ${x}/16 \rfloor, \lfloor ${y}/16 \rfloor) = (${c[0]}, ${c[1]})$.`,
      };
    },
  },
  {
    id: 'c04-corner-mask',
    module: 'c04',
    title: 'Corner bits to a mask',
    skill: 'terrain peering bits',
    gen: (rng) => {
      const m = rng.int(1, 14);
      const wet = Object.keys(CORNER_VALUE).filter((k) => m & CORNER_VALUE[k]);
      return {
        prompt: md`Match Corners with TL = 1, TR = 2, BL = 4, BR = 8. The water corners of a cell are ${wet.join(', ')}. What is its mask?`,
        answer: { kind: 'number', value: m },
        solution: md`Add the values of the water corners: ${wet.map((k) => CORNER_VALUE[k]).join(' + ')} = ${m}.`,
      };
    },
  },
  {
    id: 'c04-limits',
    module: 'c04',
    title: 'Camera limits from a used rect',
    skill: 'cameras',
    gen: (rng) => {
      const px = rng.int(-4, 2), py = rng.int(-3, 2), w = rng.int(20, 60), h = rng.int(12, 40);
      const v = [px * 16, py * 16, (px + w) * 16, (py + h) * 16];
      return {
        prompt: md`A TileMapLayer at the origin with 16×16 tiles has a used rect at position (${px}, ${py}) with size (${w}, ${h}). Give limit_left, limit_top, limit_right and limit_bottom.`,
        answer: { kind: 'vector', value: v },
        solution: md`Left and top: position × 16 = (${v[0]}, ${v[1]}). Right and bottom: (position + size) × 16 = (${v[2]}, ${v[3]}).`,
      };
    },
  },
  {
    id: 'c04-drag-box',
    module: 'c04',
    title: 'Drag box half-widths',
    skill: 'cameras',
    gen: (rng) => {
      const mx = rng.pick([0.1, 0.15, 0.2, 0.25, 0.3, 0.4]);
      const my = rng.pick([0.1, 0.2, 0.3, 0.4, 0.5]);
      const v = [mx * 160, my * 90];
      return {
        prompt: md`A 320×180 view uses horizontal drag margins of ${mx} and vertical margins of ${my}. How far (px) can the camera's position move right, and down, from the view centre before the view moves?`,
        answer: { kind: 'vector', value: v },
        solution: md`Margins are fractions of half the view: $${mx} \cdot 160 = ${+v[0].toFixed(2)}$ and $${my} \cdot 90 = ${+v[1].toFixed(2)}$ px.`,
      };
    },
  },
];
