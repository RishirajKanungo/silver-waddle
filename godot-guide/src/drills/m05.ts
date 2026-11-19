import { md, type Drill } from '../content/types';

export const DRILLS: Drill[] = [
  {
    id: 'm05-divisive-damage',
    module: 'm05',
    title: 'Divisive damage',
    skill: 'damage formula a·k/(k + d)',
    gen: (rng) => {
      const k = rng.pick([50, 100, 100, 200]);
      const d = rng.pick([0, 10, 20, 25, 50, 100, 150]);
      const a = rng.int(2, 20) * 5;
      const value = (a * k) / (k + d);
      return {
        prompt: md`Attack ${a}, defence ${d}, $k = ${k}$. Damage $a\,k/(k + d)$ before rounding?`,
        answer: { kind: 'number', value },
        solution: md`$${a} \cdot ${k}/(${k} + ${d}) = ${a * k}/${k + d} \approx ${value.toFixed(2)}$. Defence removes $${d}/${k + d} \approx ${((d / (k + d)) * 100).toFixed(0)}\%$.`,
      };
    },
  },
  {
    id: 'm05-xp-total',
    module: 'm05',
    title: 'Total XP on a linear curve',
    skill: 'XP to reach a level',
    gen: (rng) => {
      const b = rng.pick([25, 50, 100, 150, 200]);
      const L = rng.int(3, 25);
      const value = (b * L * (L - 1)) / 2;
      return {
        prompt: md`$\text{next}(L) = ${b}L$. Total XP needed to reach level ${L} from 0 XP at level 1?`,
        answer: { kind: 'number', value },
        solution: md`$\text{total}(L) = b\,L(L - 1)/2 = ${b} \cdot ${L} \cdot ${L - 1}/2 = ${value}$.`,
      };
    },
  },
  {
    id: 'm05-at-least-one',
    module: 'm05',
    title: 'Drop chance over N tries',
    skill: '1 - (1 - p)^N',
    gen: (rng) => {
      const p = rng.pick([0.01, 0.02, 0.05, 0.1, 0.2, 0.25]);
      const n = rng.pick([5, 10, 20, 30, 50, 100]);
      const value = 1 - Math.pow(1 - p, n);
      return {
        prompt: md`A drop has chance ${p} per kill. Probability of at least one drop in ${n} kills?`,
        answer: { kind: 'number', value, tol: 1e-3 },
        solution: md`$1 - (1 - ${p})^{${n}} = 1 - ${Math.pow(1 - p, n).toFixed(4)} \approx ${value.toFixed(4)}$.`,
      };
    },
  },
  {
    id: 'm05-crit-ev',
    module: 'm05',
    title: 'Expected damage with crits',
    skill: 'b(1 + p(m - 1))',
    gen: (rng) => {
      const b = rng.int(4, 30) * 5;
      const p = rng.pick([0.05, 0.1, 0.15, 0.2, 0.25, 0.3]);
      const m = rng.pick([1.5, 2, 2.5, 3]);
      const value = b * (1 + p * (m - 1));
      return {
        prompt: md`Base damage ${b}, crit chance ${Math.round(p * 100)}%, crit multiplier ×${m}. Expected damage per hit?`,
        answer: { kind: 'number', value },
        solution: md`$${b}\,(1 + ${p} \cdot (${m} - 1)) = ${b} \cdot ${(1 + p * (m - 1)).toFixed(3)} = ${value.toFixed(2)}$.`,
      };
    },
  },
];
