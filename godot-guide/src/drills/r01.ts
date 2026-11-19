import { md, type Drill } from '../content/types';

const roundi = (x: number) => (x < 0 ? -Math.round(-x) : Math.round(x));
const n = (x: number) => (Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100));

export const DRILLS: Drill[] = [
  {
    id: 'r01-final-stat',
    module: 'r01',
    title: 'Final stat from modifiers',
    skill: 'flat then percent, one rounding',
    gen: (rng) => {
      const b = rng.int(10, 120);
      const f1 = rng.int(0, 6) * 2;
      const f2 = rng.pick([0, 0, 4, 6, 10]);
      const p1 = rng.pick([5, 10, 10, 15, 20]);
      const p2 = rng.pick([0, 5, 10, 25, -50]);
      const value = (b + f1 + f2) * (1 + (p1 + p2) / 100);
      const final = Math.max(0, roundi(value));
      return {
        prompt: md`Base ${b}; flat modifiers +${f1} and +${f2}; percent modifiers ${p1 >= 0 ? '+' : ''}${p1}% and ${p2 >= 0 ? '+' : ''}${p2}%. Final stat (flat first, percents added, one rounding)?`,
        answer: { kind: 'number', value: final },
        solution: md`$(${b} + ${f1 + f2}) \times (1 + ${p1 + p2}/100) = ${n(b + f1 + f2)} \times ${n(1 + (p1 + p2) / 100)} = ${n(value)} \to ${final}$.`,
      };
    },
  },
  {
    id: 'r01-defence-ratio',
    module: 'r01',
    title: 'Ratio defence',
    skill: 'x · 100 / (100 + d)',
    gen: (rng) => {
      const x = rng.int(4, 30) * 10;
      const d = rng.pick([0, 10, 20, 25, 50, 60, 100, 150, 200, 300]);
      const out = (x * 100) / (100 + d);
      return {
        prompt: md`Raw damage ${x} against defence ${d}, ratio form. Damage after defence, rounded to a whole number?`,
        answer: { kind: 'number', value: roundi(out) },
        solution: md`$${x} \times \frac{100}{100 + ${d}} = ${n(out)} \to ${roundi(out)}$.`,
      };
    },
  },
  {
    id: 'r01-damage-pipeline',
    module: 'r01',
    title: 'The full damage pipeline',
    skill: 'offence, defence, element, stagger, crit, round once',
    gen: (rng) => {
      const power = rng.pick([1, 1.2, 1.5, 2, 2.5]);
      const atk = rng.int(20, 80);
      const def = rng.pick([0, 4, 10, 20, 25, 50, 60]);
      const el = rng.pick([2, 1, 1, 0.5]);
      const st = rng.pick([1, 1, 1.6, 2]);
      const crit = rng.next() < 0.3;
      let x = power * atk;
      x *= 100 / (100 + def);
      x *= el;
      x *= st;
      if (crit) x *= 1.5;
      const final = Math.max(1, roundi(x));
      const elName = el === 2 ? 'weak (×2)' : el === 0.5 ? 'resists (×0.5)' : 'neutral';
      return {
        prompt: md`Power ${power}, attacker's attack ${atk}, target defence ${def}, element ${elName}, stagger ×${st}, ${crit ? 'a crit (×1.5)' : 'no crit'}. Final damage?`,
        answer: { kind: 'number', value: final },
        solution: md`$${power} \times ${atk} = ${n(power * atk)}$; $\times\,100/${100 + def}$; $\times\,${el}$; $\times\,${st}$${crit ? '; $\\times\\,1.5$' : ''}; total $${n(x)} \to ${final}$.`,
      };
    },
  },
  {
    id: 'r01-shard-level',
    module: 'r01',
    title: 'Shard level from AP',
    skill: 'cumulative AP thresholds',
    gen: (rng) => {
      const th = rng.pick([
        [200, 600],
        [150, 500],
        [300, 900],
        [400, 1200],
      ]);
      const ap = rng.int(0, Math.round(th[1] * 1.2 / 10)) * 10;
      let level = 1;
      for (const t of th) if (ap >= t) level++;
      const next = level <= th.length ? th[level - 1] - ap : 0;
      return {
        prompt: md`A shard has \`ap_thresholds = [${th[0]}, ${th[1]}]\` and ${ap} AP. Its level, and the AP still needed for the next level (0 at max level)?`,
        answer: { kind: 'vector', value: [level, next] },
        inputHint: 'level, AP to next',
        solution: md`Count the thresholds with AP ≥ threshold: level ${level}. ${level <= th.length ? `Next threshold ${th[level - 1]}, so ${th[level - 1]} − ${ap} = ${next} AP.` : 'It is at the maximum level.'}`,
      };
    },
  },
];
