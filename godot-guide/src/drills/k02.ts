import { md, type Drill } from '../content/types';

export const DRILLS: Drill[] = [
  {
    id: 'k02-cone',
    module: 'k02',
    title: 'Inside the vision cone?',
    skill: 'dot-product facing test',
    gen: (rng) => {
      const facings: [number, number, string][] = [
        [1, 0, '(1, 0)'],
        [-1, 0, '(-1, 0)'],
        [0, 1, '(0, 1)'],
        [0, -1, '(0, -1)'],
      ];
      const [fx, fy, fs] = rng.pick(facings);
      const triples: [number, number][] = [[3, 4], [4, 3], [5, 12], [12, 5], [8, 15], [15, 8], [6, 8], [8, 6]];
      const [a, b] = rng.pick(triples);
      const px = a * rng.pick([-1, 1]), py = b * rng.pick([-1, 1]);
      const len = Math.hypot(px, py);
      const dot = (fx * px + fy * py) / len;
      const angle = rng.pick([60, 90, 100, 120, 140]);
      const thr = Math.cos((angle / 2) * (Math.PI / 180));
      return {
        prompt: md`An enemy faces ${fs} with a ${angle}° cone. The player is at offset $(${px}, ${py})$. Enter $\hat{\mathbf f}\cdot\hat{\mathbf p}$, the threshold $\cos(${angle / 2}°)$, and 1 if the player is inside the cone, else 0.`,
        answer: { kind: 'vector', value: [dot, thr, dot >= thr ? 1 : 0], tol: 1e-3 },
        inputHint: 'dot, threshold, 1 or 0',
        solution: md`$|\mathbf p| = ${len}$, so $\hat{\mathbf p} = (${(px / len).toFixed(3)}, ${(py / len).toFixed(3)})$ and the dot product is $${dot.toFixed(3)}$. $\cos ${angle / 2}° \approx ${thr.toFixed(3)}$: ${dot >= thr ? 'inside' : 'outside'}.`,
      };
    },
  },
  {
    id: 'k02-arrive',
    module: 'k02',
    title: 'Arrive speed',
    skill: 'arrive steering',
    gen: (rng) => {
      const vmax = rng.pick([40, 50, 60, 80, 90]), r = rng.pick([16, 20, 24, 32, 40]), d = rng.int(2, 50), a = rng.pick([600, 900, 1200]);
      const speed = vmax * Math.min(d / r, 1), minR = (vmax * vmax) / (2 * a);
      return {
        prompt: md`An agent with \`max_speed\` ${vmax} px/s and acceleration ${a} px/s² arrives with slow radius ${r} px. It is ${d} px from the target. Desired speed (px/s), and the smallest slow radius that avoids overshooting (px)?`,
        answer: { kind: 'vector', value: [speed, minR], tol: 1e-3 },
        inputHint: 'px/s, px',
        solution: md`Desired speed $${vmax} \times \min(${d}/${r}, 1) = ${speed.toFixed(2)}$ px/s. Braking distance $v^2/2a = ${vmax * vmax}/${2 * a} \approx ${minR.toFixed(2)}$ px.`,
      };
    },
  },
  {
    id: 'k02-telegraph',
    module: 'k02',
    title: 'Is the attack reactable?',
    skill: 'telegraph frames',
    gen: (rng) => {
      const startup = rng.int(8, 40), reaction = rng.pick([12, 15, 18]), delay = rng.int(0, 10);
      const margin = startup - reaction - delay;
      return {
        prompt: md`An enemy attack has ${startup} startup frames. Budget ${reaction} frames to react; the player's defence can start up to ${delay} frames after the press. What is the margin in frames (negative means not reactable), and the startup in ms?`,
        answer: { kind: 'vector', value: [margin, (startup * 1000) / 60], tol: 1e-3 },
        inputHint: 'frames, ms',
        solution: md`Margin $${startup} - ${reaction} - ${delay} = ${margin}$ frames. Startup $${startup} \times 16.67 \approx ${((startup * 1000) / 60).toFixed(1)}$ ms.`,
      };
    },
  },
];
