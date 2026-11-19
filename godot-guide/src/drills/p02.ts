import { md, type Drill } from '../content/types';

const r2 = (x: number) => Math.round(x * 100) / 100;

// mirrors scripts/damage_formula.gd from p02-3
const damage = (attack: number, power: number, defence: number, element: number, crit: boolean) => {
  let d = (attack * power * 100) / (100 + defence);
  d *= element;
  if (crit) d *= 1.5;
  return Math.max(1, Math.floor(d));
};

export const DRILLS: Drill[] = [
  {
    id: 'p02-frame-budget',
    module: 'p02',
    title: 'Frame budgets',
    skill: 'Budget = 1000 / fps ms; refreshes a slow frame occupies',
    gen: (rng) => {
      if (rng.next() < 0.5) {
        const fps = rng.pick([30, 60, 120, 144]);
        return {
          prompt: md`What is the frame budget at ${fps} fps, in ms?`,
          answer: { kind: 'number', value: 1000 / fps, tol: 0.002 },
          solution: md`$1000 / ${fps} = ${r2(1000 / fps)}$ ms per frame for scripts, physics and rendering together.`,
        };
      }
      const ms = rng.pick([20, 25, 34, 40, 46, 55, 70, 90]);
      const n = Math.ceil(ms / (1000 / 60));
      return {
        prompt: md`On a 60 Hz display a frame takes ${ms} ms. For how many refreshes is the previous image shown?`,
        answer: { kind: 'number', value: n },
        solution: md`$${ms} / 16.67 = ${r2(ms / (1000 / 60))}$, so the new image is ready at refresh ${n}: the old image is shown ${n} times.`,
      };
    },
  },
  {
    id: 'p02-weeks',
    module: 'p02',
    title: 'Hours to weeks',
    skill: 'Turn a scope into calendar time: (1 + overhead) × hours / weekly hours',
    gen: (rng) => {
      const rooms = rng.int(6, 40);
      const per = rng.pick([3, 4, 5, 6, 8]);
      const enemies = rng.int(2, 15);
      const enemyCost = rng.pick([12, 15, 18, 24]);
      const sys = rng.pick([200, 250, 300, 400]);
      const ov = rng.pick([20, 25, 30, 40]);
      const weekly = rng.pick([6, 8, 10, 12, 15, 20]);
      const total = (rooms * per + enemies * enemyCost + sys) * (1 + ov / 100);
      return {
        prompt: md`${rooms} rooms at ${per} h, ${enemies} enemy types at ${enemyCost} h, ${sys} h of systems, +${ov}% polish. At ${weekly} h/week, how many weeks?`,
        answer: { kind: 'number', value: total / weekly, tol: 0.002 },
        solution: md`$(${rooms} \times ${per} + ${enemies} \times ${enemyCost} + ${sys}) \times ${1 + ov / 100} = ${r2(total)}$ h; $\div ${weekly} = ${r2(total / weekly)}$ weeks.`,
      };
    },
  },
  {
    id: 'p02-expected-damage',
    module: 'p02',
    title: 'Expected values for a test',
    skill: 'Compute DamageFormula.compute(attack, power, defence, element, crit) by hand, as a test author must',
    gen: (rng) => {
      const a = rng.int(1, 50);
      const p = rng.pick([0.5, 1, 1.5, 2]);
      const d = rng.pick([0, 0, 25, 50, 100, 150, 300]);
      const e = rng.pick([0.5, 1, 1, 1.5, 2]);
      const c = rng.next() < 0.35;
      const v = damage(a, p, d, e, c);
      return {
        prompt: md`What does \`DamageFormula.compute(${a}, ${p}, ${d}, ${e}, ${c})\` return? (attack × power × 100/(100 + defence) × element × 1.5 if crit, floored, at least 1)`,
        answer: { kind: 'number', value: v },
        solution: md`$${a} \times ${p} \times 100/${100 + d} = ${r2((a * p * 100) / (100 + d))}$; $\times ${e}${c ? md` \times 1.5` : ''} = ${r2(((a * p * 100) / (100 + d)) * e * (c ? 1.5 : 1))}$; floor and minimum 1 give ${v}.`,
      };
    },
  },
];
