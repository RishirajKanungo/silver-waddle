import { md, type Drill } from '../content/types';

export const DRILLS: Drill[] = [
  {
    id: 'c03-jump-from-height',
    module: 'c03',
    title: 'Gravity and jump speed from height and time',
    skill: 'jump physics',
    gen: (rng) => {
      const h = rng.pick([16, 18, 20, 24, 28, 32, 40, 48]);
      const T = rng.pick([0.2, 0.25, 0.3, 0.35, 0.4]);
      const g = (2 * h) / (T * T), v = (2 * h) / T;
      return {
        prompt: md`A jump peaks at ${h} px after ${T} s. Find the gravity (px/s²) and the takeoff speed (px/s).`,
        answer: { kind: 'vector', value: [g, v] },
        inputHint: 'g, v0',
        solution: md`$g = 2h/T^2 = ${2 * h}/${+(T * T).toFixed(4)} \approx ${+g.toFixed(2)}$ and $v_0 = 2h/T \approx ${+v.toFixed(2)}$.`,
      };
    },
  },
  {
    id: 'c03-reach',
    module: 'c03',
    title: 'Jump reach',
    skill: 'jump physics',
    gen: (rng) => {
      const T = rng.pick([0.2, 0.25, 0.3, 0.35]);
      const v = rng.pick([70, 80, 90, 100, 110]);
      const d = v * 2 * T;
      return {
        prompt: md`A symmetric jump takes ${T} s to reach its apex. Walking at ${v} px/s, how far (px) does the character travel before landing at the takeoff height?`,
        answer: { kind: 'number', value: d },
        solution: md`Air time $2T = ${+(2 * T).toFixed(2)}$ s; distance $${v} \cdot ${+(2 * T).toFixed(2)} = ${+d.toFixed(2)}$ px.`,
      };
    },
  },
  {
    id: 'c03-jump-cut',
    module: 'c03',
    title: 'Shortest hop with a jump cut',
    skill: 'jump physics',
    gen: (rng) => {
      const h = rng.pick([32, 40, 48, 56, 64]);
      const c = rng.pick([0.4, 0.5, 0.6, 0.7]);
      const m = c * c * h;
      return {
        prompt: md`A full jump is ${h} px. Releasing jump on the first frame multiplies the upward speed by ${c}. How high is the shortest hop, in px?`,
        answer: { kind: 'number', value: m },
        solution: md`Height scales with the square of the speed: $c^2 h = ${+(c * c).toFixed(2)} \cdot ${h} = ${+m.toFixed(2)}$ px.`,
      };
    },
  },
  {
    id: 'c03-step-window',
    module: 'c03',
    title: 'Step-up window',
    skill: 'jump physics',
    gen: (rng) => {
      const h = rng.pick([18, 20, 22, 24, 28]);
      const T = rng.pick([0.2, 0.25, 0.3]);
      const g = (2 * h) / (T * T);
      const w = 2 * Math.sqrt((2 * (h - 16)) / g);
      return {
        prompt: md`Jump height ${h} px, time to apex ${T} s. For how long (s) is the character at least 16 px above the takeoff ground? Use $2\sqrt{2(h-16)/g}$.`,
        answer: { kind: 'number', value: w },
        solution: md`$g = 2h/T^2 \approx ${+g.toFixed(2)}$, so the window is $2\sqrt{${2 * (h - 16)}/${+g.toFixed(2)}} \approx ${+w.toFixed(4)}$ s.`,
      };
    },
  },
];
