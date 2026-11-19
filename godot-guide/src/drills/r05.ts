import { md, type Drill } from '../content/types';

export const DRILLS: Drill[] = [
  {
    id: 'r05-integer-scale',
    module: 'r05',
    title: 'Integer scale and bars',
    skill: 'k = floor(min(W/320, H/180)); bars = (W − 320k)/2 and (H − 180k)/2',
    gen: (rng) => {
      const [Wd, Hd] = rng.pick([
        [1280, 720],
        [1280, 800],
        [1366, 768],
        [1600, 900],
        [1920, 1080],
        [1920, 1200],
        [2560, 1080],
        [2560, 1440],
        [3440, 1440],
        [3840, 2160],
      ] as [number, number][]);
      const k = Math.floor(Math.min(Wd / 320, Hd / 180));
      const side = (Wd - 320 * k) / 2, top = (Hd - 180 * k) / 2;
      return {
        prompt: md`The game renders at 320×180 with integer scaling on a ${Wd}×${Hd} screen. Enter the scale $k$, the width of each side bar and the height of each top/bottom bar, in screen pixels.`,
        answer: { kind: 'vector', value: [k, side, top] },
        inputHint: 'k, side, top',
        solution: md`$k = \lfloor \min(${Wd}/320, ${Hd}/180) \rfloor = \lfloor \min(${(Wd / 320).toFixed(2)}, ${(Hd / 180).toFixed(2)}) \rfloor = ${k}$. The image is ${320 * k}×${180 * k}: side bars $(${Wd} - ${320 * k})/2 = ${side}$, top/bottom bars $(${Hd} - ${180 * k})/2 = ${top}$.`,
      };
    },
  },
  {
    id: 'r05-nine-slice',
    module: 'r05',
    title: 'Nine-slice regions',
    skill: 'edges w − 2m and h − 2m, centre (w − 2m)×(h − 2m)',
    gen: (rng) => {
      const m = rng.pick([4, 6, 8]);
      const w = rng.int(4, 20) * 8, h = rng.int(3, 10) * 8;
      return {
        prompt: md`A nine-slice with ${m} px patch margins is drawn at ${w}×${h}. Enter the width of the stretched top edge, then the centre's width and height.`,
        answer: { kind: 'vector', value: [w - 2 * m, w - 2 * m, h - 2 * m] },
        inputHint: 'edge, centre w, centre h',
        solution: md`The corners take ${m} px on each side. Top edge: $${w} - 2 \cdot ${m} = ${w - 2 * m}$. Centre: $${w - 2 * m} \times ${h - 2 * m}$.`,
      };
    },
  },
  {
    id: 'r05-bar-pixels',
    module: 'r05',
    title: 'HP bar pixels',
    skill: 'px = floor(46 · hp / max)',
    gen: (rng) => {
      const max = rng.pick([60, 80, 96, 120, 150, 184, 240, 300]);
      const hp = rng.int(1, max);
      const px = Math.floor((46 * hp) / max + 1e-9);
      return {
        prompt: md`An HP bar has a 46 px fill. The character has ${hp} of ${max} HP. How many pixels of fill are drawn (rounded down)?`,
        answer: { kind: 'number', value: px },
        solution: md`$\lfloor 46 \times ${hp} / ${max} \rfloor = \lfloor ${((46 * hp) / max).toFixed(3)} \rfloor = ${px}$ px.`,
      };
    },
  },
  {
    id: 'r05-grid-neighbour',
    module: 'r05',
    title: 'Grid focus neighbour with wrap',
    skill: 'r = floor(i/c), col = i mod c, wrap with posmod',
    gen: (rng) => {
      const cols = rng.pick([3, 4, 5, 6]);
      const rows = rng.int(2, 4);
      const n = cols * rows;
      const i = rng.int(0, n - 1);
      const dir = rng.pick(['left', 'right', 'up', 'down'] as const);
      const r = Math.floor(i / cols), c = i % cols;
      const pm = (a: number, b: number) => ((a % b) + b) % b;
      const [nr, nc] = dir === 'left' ? [r, pm(c - 1, cols)] : dir === 'right' ? [r, pm(c + 1, cols)] : dir === 'up' ? [pm(r - 1, rows), c] : [pm(r + 1, rows), c];
      const j = nr * cols + nc;
      return {
        prompt: md`A full grid has ${cols} columns and ${rows} rows (slots 0 to ${n - 1}, row by row). Focus wraps at the edges. What is the *${dir}* neighbour of slot ${i}?`,
        answer: { kind: 'number', value: j },
        solution: md`Slot ${i} is row $\lfloor ${i}/${cols} \rfloor = ${r}$, column $${i} \bmod ${cols} = ${c}$. Moving ${dir} gives row ${nr}, column ${nc} (wrapped with posmod), so the index is $${nr} \times ${cols} + ${nc} = ${j}$.`,
      };
    },
  },
];
