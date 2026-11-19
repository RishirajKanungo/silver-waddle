import { md, type Drill } from '../content/types';

const r2 = (x: number) => Math.round(x * 100) / 100;

export const DRILLS: Drill[] = [
  {
    id: 'p04-critical-path',
    module: 'p04',
    title: 'Critical path and total',
    skill: 'finish(m) = weeks(m) + max finish(prerequisites); solo duration = total',
    gen: (rng) => {
      // A → B, A → C, (B, C) → D
      const a = rng.int(1, 4), b = rng.int(1, 6), c = rng.int(1, 6), d = rng.int(1, 4);
      const crit = a + Math.max(b, c) + d;
      return {
        prompt: md`A takes ${a} weeks. B (${b} weeks) and C (${c} weeks) both need A. D (${d} weeks) needs B and C. Give the critical path length and the total work, in weeks.`,
        answer: { kind: 'vector', value: [crit, a + b + c + d] },
        inputHint: 'critical, total',
        solution: md`Critical path: $${a} + \max(${b}, ${c}) + ${d} = ${crit}$. Total: $${a} + ${b} + ${c} + ${d} = ${a + b + c + d}$, which is the duration when one person does everything.`,
      };
    },
  },
  {
    id: 'p04-forecast',
    module: 'p04',
    title: 'Re-forecast from actuals',
    skill: 'Remaining × (total actual / total estimated)',
    gen: (rng) => {
      const est = [rng.int(2, 4), rng.int(2, 5), rng.int(2, 5)];
      const act = est.map((e) => e + rng.int(0, 3));
      const rem = rng.int(12, 40);
      const se = est.reduce((x, y) => x + y, 0), sa = act.reduce((x, y) => x + y, 0);
      return {
        prompt: md`Three milestones were estimated at ${est.join(', ')} weeks and took ${act.join(', ')}. The remaining estimate is ${rem} weeks. What is the forecast, in weeks?`,
        answer: { kind: 'number', value: (rem * sa) / se, tol: 0.002 },
        solution: md`Ratio $${sa}/${se} = ${r2(sa / se)}$; forecast $${rem} \times ${sa}/${se} = ${r2((rem * sa) / se)}$ weeks.`,
      };
    },
  },
  {
    id: 'p04-at-least-once',
    module: 'p04',
    title: 'A rare bug, many tries',
    skill: 'P(at least once in n tries) = 1 − (1 − p)^n',
    gen: (rng) => {
      const inv = rng.pick([10, 20, 50, 100, 200]);
      const n = rng.pick([3, 5, 10, 20, 25, 40]);
      const p = 1 / inv;
      const v = 1 - Math.pow(1 - p, n);
      return {
        prompt: md`A bug happens once in ${inv} tries. A player makes ${n} tries. What is the probability they meet it at least once? (decimal)`,
        answer: { kind: 'number', value: v, tol: 0.003 },
        solution: md`$1 - (1 - 1/${inv})^{${n}} = ${v.toFixed(4)}$.`,
      };
    },
  },
];
