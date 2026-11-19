import { md, type Drill } from '../content/types';

const trunc = (a: number, b: number) => Math.trunc(a / b);
const rem = (a: number, b: number) => a - b * Math.trunc(a / b);
const pos = (a: number, b: number) => ((a % b) + b) % b;

export const DRILLS: Drill[] = [
  {
    id: 'g02-int-division',
    module: 'g02',
    title: 'GDScript integer division',
    skill: 'int / int truncates toward zero; % takes the sign of the left operand; posmod is never negative.',
    gen: (r) => {
      const b = r.pick([2, 3, 4, 5, 8, 16, 32]);
      const a = r.nz(-70, 70);
      return {
        prompt: md`In GDScript, with \`a = ${a}\` and \`b = ${b}\` (both \`int\`), evaluate \`a / b\`, \`a % b\` and \`posmod(a, b)\`.`,
        answer: { kind: 'vector', value: [trunc(a, b), rem(a, b), pos(a, b)] },
        inputHint: 'a / b, a % b, posmod',
        solution: md`$${a}/${b} = ${(a / b).toFixed(3)}$, truncated toward zero: ${trunc(a, b)}. Remainder: $${a} - ${b}\cdot(${trunc(a, b)}) = ${rem(a, b)}$. \`posmod\` uses the floor $${Math.floor(a / b)}$: $${a} - ${b}\cdot(${Math.floor(a / b)}) = ${pos(a, b)}$.`,
      };
    },
  },
  {
    id: 'g02-tile-coords',
    module: 'g02',
    title: 'Pixel to tile',
    skill: 'tile = floor(position / tile size), separately for x and y, also for negative positions.',
    gen: (r) => {
      const s = r.pick([16, 16, 16, 8, 32]);
      const x = r.int(-90, 90), y = r.int(-90, 90);
      const tx = Math.floor(x / s), ty = Math.floor(y / s);
      return {
        prompt: md`With ${s}-px tiles, which tile contains the point (${x}, ${y})?`,
        answer: { kind: 'vector', value: [tx, ty] },
        inputHint: 'tile x, tile y',
        solution: md`$\lfloor ${x}/${s} \rfloor = \lfloor ${(x / s).toFixed(3)} \rfloor = ${tx}$ and $\lfloor ${y}/${s} \rfloor = \lfloor ${(y / s).toFixed(3)} \rfloor = ${ty}$: tile (${tx}, ${ty}). In code, \`floori(pos.x / ${s}.0)\`; \`int(pos.x) / ${s}\` would give ${trunc(x, s)} for x.`,
      };
    },
  },
  {
    id: 'g02-timer-frames',
    module: 'g02',
    title: 'Timer length in frames',
    skill: 'A timer of t seconds lasts about t × fps frames; it fires on the first frame at or after t.',
    gen: (r) => {
      const t = r.pick([0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 1, 1.5]);
      const fps = r.pick([60, 60, 30, 120, 144]);
      const f = Math.ceil(t * fps - 1e-9);
      return {
        prompt: md`\`await get_tree().create_timer(${t}).timeout\`: about how many frames does it wait at ${fps} fps? (Round up.)`,
        answer: { kind: 'number', value: f },
        solution: md`$${t} \times ${fps} = ${+(t * fps).toFixed(2)}$, rounded up: ${f} frames.`,
      };
    },
  },
];
