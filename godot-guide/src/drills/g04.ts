import { md, type Drill } from '../content/types';

export const DRILLS: Drill[] = [
  {
    id: 'g04-hits-to-defeat',
    module: 'g04',
    title: 'Hits to defeat',
    skill: 'Damage per hit max(1, attack − defence); hits = ceil(hp / damage).',
    gen: (r) => {
      const hp = r.int(12, 160), a = r.int(6, 24), d = r.int(0, 20);
      const D = Math.max(1, a - d), n = Math.ceil(hp / D);
      return {
        prompt: md`An enemy has ${hp} HP and defence ${d}. The attacker has attack ${a}, and damage is $\max(1, a - d)$. How many hits defeat it?`,
        answer: { kind: 'number', value: n },
        solution: md`$D = \max(1, ${a} - ${d}) = ${D}$. $\lceil ${hp}/${D} \rceil = \lceil ${(hp / D).toFixed(2)} \rceil = ${n}$.`,
      };
    },
  },
  {
    id: 'g04-drop-chance',
    module: 'g04',
    title: 'At least one drop',
    skill: 'P(at least one in n) = 1 − (1 − p)^n.',
    gen: (r) => {
      const p = r.pick([0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.5]);
      const n = r.int(2, 20);
      const v = 1 - (1 - p) ** n;
      return {
        prompt: md`An enemy drops an item with probability ${p} per defeat, independently. What is the probability of at least one drop in ${n} defeats?`,
        answer: { kind: 'number', value: v, tol: 1e-3 },
        solution: md`$1 - (1 - ${p})^{${n}} = 1 - ${((1 - p) ** n).toFixed(4)} = ${v.toFixed(4)}$.`,
      };
    },
  },
  {
    id: 'g04-linear-growth',
    module: 'g04',
    title: 'Stat at a level',
    skill: 'Linear growth: stat(L) = base + growth × (L − 1).',
    gen: (r) => {
      const b = r.int(5, 150), g = r.int(1, 16), L = r.int(2, 40);
      return {
        prompt: md`A stat has base ${b} at level 1 and grows by ${g} per level. What is it at level ${L}?`,
        answer: { kind: 'number', value: b + g * (L - 1) },
        solution: md`$${b} + ${g} \times (${L} - 1) = ${b} + ${g * (L - 1)} = ${b + g * (L - 1)}$.`,
      };
    },
  },
];
