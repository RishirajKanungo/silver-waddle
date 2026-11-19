import { md, type Drill } from '../content/types';

export const DRILLS: Drill[] = [
  {
    id: 'k03-seconds-per-segment',
    module: 'k03',
    title: 'Seconds per ATB segment',
    skill: 't = S / (a·h·u + p)',
    gen: (rng) => {
      const a = rng.int(6, 16);
      const h = rng.pick([1.5, 2, 2.5, 3]);
      const u = rng.pick([0.4, 0.5, 0.6, 0.8]);
      const p = rng.pick([0, 1, 2, 3]);
      const S = 100;
      const r = a * h * u + p;
      const value = S / r;
      return {
        prompt: md`ATB per hit ${a}, ${h} hits/s in a string, uptime ${u}, passive ${p} ATB/s, segments of ${S}. Seconds per segment?`,
        answer: { kind: 'number', value },
        solution: md`$r = ${a} \cdot ${h} \cdot ${u} + ${p} = ${r.toFixed(2)}$ ATB/s, so $t = ${S}/${r.toFixed(2)} \approx ${value.toFixed(2)}$ s.`,
      };
    },
  },
  {
    id: 'k03-decision-cost',
    module: 'k03',
    title: 'Game time during a decision',
    skill: 't_game = s · t_real',
    gen: (rng) => {
      const s = rng.pick([0.05, 0.08, 0.1, 0.12, 0.2, 0.25]);
      const t = rng.int(2, 12) / 2;
      const value = s * t;
      return {
        prompt: md`Tactical time scale ${s}. The player spends ${t} real seconds in the menu. How many seconds of game time pass?`,
        answer: { kind: 'number', value },
        solution: md`$t_{\text{game}} = ${s} \times ${t} = ${value.toFixed(3)}$ s.`,
      };
    },
  },
  {
    id: 'k03-hits-to-stagger',
    module: 'k03',
    title: 'Hits to stagger',
    skill: '⌈M / (s·g)⌉',
    gen: (rng) => {
      const M = rng.pick([60, 80, 100, 120, 150]);
      const s = rng.int(2, 9);
      const pressured = rng.next() < 0.5;
      const g = pressured ? 2 : 1;
      const value = Math.ceil(M / (s * g));
      return {
        prompt: md`Stagger meter ${M}, ${s} stagger per hit${pressured ? ', and every hit lands while the enemy is pressured (gain ×2)' : ', no pressure'}. Hits to stagger?`,
        answer: { kind: 'number', value },
        solution: md`Each hit adds $${s}${pressured ? ' \\times 2' : ''} = ${s * g}$, so $\lceil ${M}/${s * g} \rceil = ${value}$ hits.`,
      };
    },
  },
];
