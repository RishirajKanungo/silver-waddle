import { md, type Drill } from '../content/types';

export const DRILLS: Drill[] = [
  {
    id: 'k01-frame-data',
    module: 'k01',
    title: 'Frame data to times',
    skill: 'frame data at 60 fps',
    gen: (rng) => {
      const s = rng.int(3, 20), a = rng.int(2, 6), r = rng.int(8, 30);
      const total = s + a + r;
      const ms = (total * 1000) / 60, on = s / 60, off = (s + a) / 60;
      return {
        prompt: md`An attack has startup ${s}, active ${a}, recovery ${r} frames at 60 fps. Enter its length in ms, then the times in seconds at which you key the hitbox on and off.`,
        answer: { kind: 'vector', value: [ms, on, off], tol: 2e-3 },
        inputHint: 'ms, on s, off s',
        solution: md`Total $${total}$ frames $\times 16.67 \approx ${ms.toFixed(1)}$ ms. On at frame ${s}: $${s}/60 \approx ${on.toFixed(4)}$ s. Off at frame ${s + a}: $${s + a}/60 \approx ${off.toFixed(4)}$ s.`,
      };
    },
  },
  {
    id: 'k01-knockback',
    module: 'k01',
    title: 'Knockback slide',
    skill: 'knockback distance v²/2f',
    gen: (rng) => {
      const v = rng.pick([60, 80, 100, 120, 150, 180, 200, 240]);
      const f = rng.pick([600, 800, 900, 1000, 1200, 1500]);
      const d = (v * v) / (2 * f), t = v / f;
      return {
        prompt: md`A hit sets the target's velocity to ${v} px/s and the Hurt state removes it at ${f} px/s². How far does it slide (px) and for how long (s)?`,
        answer: { kind: 'vector', value: [d, t], tol: 1e-3 },
        inputHint: 'px, s',
        solution: md`$d = v^2/(2f) = ${v * v}/${2 * f} \approx ${d.toFixed(2)}$ px; $t = v/f \approx ${t.toFixed(3)}$ s.`,
      };
    },
  },
  {
    id: 'k01-trauma',
    module: 'k01',
    title: 'Trauma shake',
    skill: 'trauma-based screen shake',
    gen: (rng) => {
      const maxOff = rng.int(3, 10), trauma = rng.pick([0.2, 0.3, 0.4, 0.45, 0.5, 0.6, 0.8]), decay = rng.pick([1, 1.5, 2, 2.5]);
      const off = maxOff * trauma * trauma, dur = trauma / decay;
      return {
        prompt: md`\`max_offset\` ${maxOff} px, trauma ${trauma}, exponent 2, decay ${decay}/s. Largest possible offset right now (px), and how long until the shake stops (s)?`,
        answer: { kind: 'vector', value: [off, dur], tol: 1e-3 },
        inputHint: 'px, s',
        solution: md`Offset $${maxOff} \times ${trauma}^2 = ${off.toFixed(3)}$ px (it rounds to ${Math.round(off)} px on screen at the noise peak). Duration $${trauma}/${decay} = ${dur.toFixed(3)}$ s.`,
      };
    },
  },
];
