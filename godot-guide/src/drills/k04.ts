import { md, type Drill } from '../content/types';

export const DRILLS: Drill[] = [
  {
    id: 'k04-stagger-gain',
    module: 'k04',
    title: 'Stagger gain of one hit',
    skill: 'b × 1.5 (weak) × g (pressured)',
    gen: (rng) => {
      const b = rng.pick([3, 7, 10, 14, 22, 30]);
      const weak = rng.next() < 0.5;
      const alreadyPressured = rng.next() < 0.4;
      const pressures = rng.next() < 0.3;
      const g = rng.pick([1.5, 2, 2.5]);
      const isPressured = weak || pressures || alreadyPressured;
      const value = b * (weak ? 1.5 : 1) * (isPressured ? g : 1);
      const desc = [weak ? 'hits a weakness' : 'is not a weakness', pressures ? 'has pressures = true' : 'does not pressure by itself', alreadyPressured ? 'the enemy is already pressured' : 'the enemy is NORMAL'].join('; ');
      return {
        prompt: md`A hit with stagger ${b}: it ${desc}. pressured_gain is ${g}. How much stagger does it add?`,
        answer: { kind: 'number', value },
        solution: md`${weak ? `Weakness: $${b} \\times 1.5 = ${b * 1.5}$, and a weakness pressures. ` : ''}${isPressured ? `Pressured, so $\\times ${g}$` : 'Not pressured, gain $\\times 1$'}: $${value}$.`,
      };
    },
  },
  {
    id: 'k04-staggered-damage',
    module: 'k04',
    title: 'Damage during a stagger',
    skill: 'round(stat × power × multiplier)',
    gen: (rng) => {
      const stat = rng.int(5, 12);
      const power = rng.pick([1, 1.5, 2, 3, 4]);
      const bonuses = rng.int(0, 3);
      const bonus = rng.pick([0.1, 0.25]);
      const mult = Math.min(3, 1.6 + bonuses * bonus);
      const value = Math.round(stat * power * mult);
      return {
        prompt: md`Attack ${stat}, ability power ${power}. The target is staggered (×1.6) and ${bonuses} ability hit(s) with multiplier_bonus ${bonus} have landed since. Damage, rounded?`,
        answer: { kind: 'number', value },
        solution: md`Multiplier $1.6 + ${bonuses} \times ${bonus} = ${mult.toFixed(2)}$ (cap 3). Damage $\operatorname{round}(${stat} \times ${power} \times ${mult.toFixed(2)}) = ${value}$.`,
      };
    },
  },
  {
    id: 'k04-segment-fill',
    module: 'k04',
    title: 'HUD segment fill',
    skill: 'clamp(v − i·S, 0, S)/S',
    gen: (rng) => {
      const v = rng.int(0, 40) * 5;
      const seg = rng.pick([1, 2]);
      const value = Math.min(100, Math.max(0, v - (seg - 1) * 100)) / 100;
      return {
        prompt: md`The ATB gauge holds ${v} (segments of 100). What fraction of segment ${seg} does the HUD show filled?`,
        answer: { kind: 'number', value },
        solution: md`$\operatorname{clamp}(${v} - ${(seg - 1) * 100}, 0, 100)/100 = ${value}$.`,
      };
    },
  },
];
