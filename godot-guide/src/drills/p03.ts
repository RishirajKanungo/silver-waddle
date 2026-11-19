import { md, type Drill } from '../content/types';

const SCREENS: [number, number][] = [
  [1280, 800],
  [1366, 768],
  [1600, 900],
  [1920, 1080],
  [1920, 1200],
  [2560, 1080],
  [2560, 1440],
  [2560, 1600],
  [3440, 1440],
  [3840, 2160],
];
const share = (a: number) => 0.3 * Math.min(a, 10e6) + 0.25 * Math.min(Math.max(a - 10e6, 0), 40e6) + 0.2 * Math.max(a - 50e6, 0);
const r2 = (x: number) => Math.round(x * 100) / 100;

export const DRILLS: Drill[] = [
  {
    id: 'p03-integer-scale',
    module: 'p03',
    title: 'Integer scaling',
    skill: 'Scale and black bars for a 320×180 viewport on a given screen',
    gen: (rng) => {
      const [w, h] = rng.pick(SCREENS);
      const s = Math.min(Math.floor(w / 320), Math.floor(h / 180));
      const bx = (w - 320 * s) / 2, by = (h - 180 * s) / 2;
      return {
        prompt: md`A ${w}×${h} screen shows the 320×180 viewport with integer scaling. Give the scale, the side bar width and the top bar height, in screen pixels.`,
        answer: { kind: 'vector', value: [s, bx, by] },
        inputHint: 'scale, side, top',
        solution: md`$\min(\lfloor ${w}/320 \rfloor, \lfloor ${h}/180 \rfloor) = ${s}$, so the game is ${320 * s}×${180 * s}. Bars: $(${w} - ${320 * s})/2 = ${bx}$ at the sides, $(${h} - ${180 * s})/2 = ${by}$ above and below.`,
      };
    },
  },
  {
    id: 'p03-valve-share',
    module: 'p03',
    title: 'Valve share tiers',
    skill: '30% up to 10M, 25% from 10M to 50M, 20% above, applied in bands',
    gen: (rng) => {
      const a = rng.pick([0.05, 0.4, 2, 8, 12, 18, 30, 45, 60, 80]) * 1e6;
      const s = share(a);
      return {
        prompt: md`A game has US\$${(a / 1e6).toLocaleString('en-US')}M of lifetime adjusted gross revenue. What is Valve's standard share, in US dollars?`,
        answer: { kind: 'number', value: s },
        solution: md`${a <= 10e6 ? md`All of it is in the first band: $0.3 \times ${a / 1e6}\text{M}$` : a <= 50e6 ? md`$0.3 \times 10\text{M} + 0.25 \times ${(a - 10e6) / 1e6}\text{M}$` : md`$0.3 \times 10\text{M} + 0.25 \times 40\text{M} + 0.2 \times ${(a - 50e6) / 1e6}\text{M}$`} $= ${(s / 1e6).toLocaleString('en-US', { maximumFractionDigits: 4 })}\text{M}$.`,
      };
    },
  },
  {
    id: 'p03-net',
    module: 'p03',
    title: 'Net per copy',
    skill: 'Price × (1 − regional) × (1 − refunds) × 0.7 for an indie-sized game',
    gen: (rng) => {
      const p = rng.pick([4.99, 9.99, 14.99, 19.99, 24.99]);
      const reg = rng.pick([0, 10, 20, 25, 30]);
      const ref = rng.pick([3, 5, 8, 10]);
      const v = p * (1 - reg / 100) * (1 - ref / 100) * 0.7;
      return {
        prompt: md`Price US\$${p}, regional pricing averaging −${reg}%, ${ref}% refunds, no discounts or tax, standard 30% share. How much does the developer get per copy sold, in US dollars?`,
        answer: { kind: 'number', value: r2(v), tol: 0.005 },
        solution: md`$${p} \times ${1 - reg / 100} \times ${1 - ref / 100} \times 0.7 = ${r2(v)}$.`,
      };
    },
  },
];
