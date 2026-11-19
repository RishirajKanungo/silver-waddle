import { md, type Drill } from '../content/types';

export const DRILLS: Drill[] = [
  {
    id: 'c02-dash-distance',
    module: 'c02',
    title: 'Dash distance',
    skill: 'frame data at 60 fps',
    gen: (rng) => {
      const v = rng.pick([180, 200, 240, 270, 300, 320, 360]);
      const n = rng.int(6, 14);
      const d = (v * n) / 60;
      return {
        prompt: md`A dash moves at ${v} px/s for ${n} physics frames at 60 Hz. How far does it go, in px?`,
        answer: { kind: 'number', value: d },
        solution: md`$d = v \cdot n / 60 = ${v} \cdot ${n} / 60 = ${+d.toFixed(2)}$ px.`,
      };
    },
  },
  {
    id: 'c02-ms-to-frames',
    module: 'c02',
    title: 'Buffer window in frames',
    skill: 'frame data at 60 fps',
    gen: (rng) => {
      const ms = rng.pick([50, 83, 100, 117, 120, 133, 150, 167, 200, 250]);
      const frames = Math.floor((ms * 60) / 1000 + 1e-9);
      return {
        prompt: md`An input buffer remembers a press for ${ms} ms. At 60 Hz, how many whole frames early can a press be and still count?`,
        answer: { kind: 'number', value: frames },
        solution: md`$${ms}/1000 \cdot 60 = ${((ms * 60) / 1000).toFixed(2)}$ frames, so ${frames} whole frames.`,
      };
    },
  },
  {
    id: 'c02-first-pixel',
    module: 'c02',
    title: 'Frames to the first visible pixel',
    skill: 'responsiveness from acceleration',
    gen: (rng) => {
      const a = rng.pick([300, 400, 500, 700, 800, 1000, 1500, 2000, 3000, 4000]);
      let k = 1;
      while ((a * k * (k + 1)) / 7200 < 1 - 1e-9) k++;
      return {
        prompt: md`From rest, acceleration ${a} px/s² at 60 Hz, velocity updated before the move. On which frame does the character first reach 1 px? Use $x_k = a\,k(k+1)/7200$.`,
        answer: { kind: 'number', value: k },
        solution: md`Need $k(k+1) \ge 7200/${a} = ${(7200 / a).toFixed(2)}$. The smallest such $k$ is ${k}, since $${k} \cdot ${k + 1} = ${k * (k + 1)}$.`,
      };
    },
  },
  {
    id: 'c02-turn-time',
    module: 'c02',
    title: 'Turnaround time',
    skill: 'acceleration and friction',
    gen: (rng) => {
      const v = rng.pick([60, 75, 80, 90, 100, 120]);
      const a = rng.pick([600, 900, 1200, 1800, 2400, 3000]);
      const t = (2 * v) / a;
      return {
        prompt: md`A character runs at ${v} px/s and the stick is reversed. With a turn acceleration of ${a} px/s², how long (s) until it runs at ${v} px/s the other way?`,
        answer: { kind: 'number', value: t },
        solution: md`The velocity changes by $2 \cdot ${v} = ${2 * v}$ px/s, so $t = ${2 * v}/${a} \approx ${+t.toFixed(4)}$ s.`,
      };
    },
  },
];
