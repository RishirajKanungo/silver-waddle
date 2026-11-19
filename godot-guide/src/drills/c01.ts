import { md, type Drill } from '../content/types';

export const DRILLS: Drill[] = [
  {
    id: 'c01-ticks-to-ms',
    module: 'c01',
    title: 'Frame holds to milliseconds',
    skill: 'frame data at 60 fps',
    gen: (rng) => {
      const n = rng.int(2, 5);
      const holds = Array.from({ length: n }, () => rng.int(2, 10));
      const ticks = holds.reduce((a, b) => a + b, 0);
      const value = (ticks * 1000) / 60;
      return {
        prompt: md`An animation's frames are held ${holds.join(', ')} ticks at 60 Hz. Length in milliseconds?`,
        answer: { kind: 'number', value },
        solution: md`${ticks} ticks $\times\ 1000/60 \approx ${value.toFixed(1)}$ ms.`,
      };
    },
  },
  {
    id: 'c01-fps-to-ticks',
    module: 'c01',
    title: 'FPS to ticks per frame',
    skill: 'frame data at 60 fps',
    gen: (rng) => {
      const fps = rng.pick([4, 5, 6, 8, 10, 12, 15, 20, 24, 30]);
      const value = 60 / fps;
      return {
        prompt: md`An animation plays at ${fps} FPS. How many 60 Hz ticks is each frame held, on average?`,
        answer: { kind: 'number', value },
        solution: md`$60/${fps} = ${Number.isInteger(value) ? value : value.toFixed(2)}$ ticks${Number.isInteger(value) ? '' : ', so frames alternate between ' + Math.floor(value) + ' and ' + Math.ceil(value)} (${(1000 / fps).toFixed(1)} ms).`,
      };
    },
  },
  {
    id: 'c01-frame-index',
    module: 'c01',
    title: 'Sheet frame index',
    skill: 'hframes / vframes',
    gen: (rng) => {
      const cols = rng.pick([4, 4, 6, 8]);
      const row = rng.int(0, 17);
      const col = rng.int(0, cols - 1);
      const value = row * cols + col;
      return {
        prompt: md`A Sprite2D has Hframes ${cols}. What \`frame\` index shows column ${col}, row ${row} (both counted from 0)?`,
        answer: { kind: 'number', value },
        solution: md`$\text{row} \cdot \text{hframes} + \text{col} = ${row} \cdot ${cols} + ${col} = ${value}$.`,
      };
    },
  },
  {
    id: 'c01-integer-scale',
    module: 'c01',
    title: 'Integer scale for a screen',
    skill: 'viewport scaling',
    gen: (rng) => {
      const [w, h] = rng.pick([
        [1280, 720], [1280, 800], [1366, 768], [1600, 900], [1680, 1050], [1920, 1080], [1920, 1200],
        [2560, 1080], [2560, 1440], [2560, 1600], [3440, 1440], [3840, 2160],
      ] as [number, number][]);
      const s = Math.min(Math.floor(w / 320), Math.floor(h / 180));
      return {
        prompt: md`Largest integer scale of a 320×180 viewport on a ${w}×${h} screen?`,
        answer: { kind: 'number', value: s },
        solution: md`$\min(\lfloor ${w}/320 \rfloor, \lfloor ${h}/180 \rfloor) = \min(${Math.floor(w / 320)}, ${Math.floor(h / 180)}) = ${s}$: the image is ${320 * s}×${180 * s}.`,
      };
    },
  },
];
