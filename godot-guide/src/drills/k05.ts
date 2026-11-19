import { md, type Drill } from '../content/types';

export const DRILLS: Drill[] = [
  {
    id: 'k05-limit-gain',
    module: 'k05',
    title: 'Limit from damage taken',
    skill: 'k × lost / max HP',
    gen: (rng) => {
      const H = rng.pick([100, 120, 140, 160, 190, 200]);
      const lost = rng.int(2, 18) * 5;
      const k = rng.pick([80, 90, 100]);
      const value = (k * lost) / H;
      return {
        prompt: md`Max HP ${H}, per_max_hp_taken ${k}. The member loses ${lost} HP. Limit points gained?`,
        answer: { kind: 'number', value },
        solution: md`$${k} \times ${lost}/${H} \approx ${value.toFixed(2)}$.`,
      };
    },
  },
  {
    id: 'k05-flank-chord',
    module: 'k05',
    title: 'Distance between flanking spots',
    skill: '2r sin(Δ/2)',
    gen: (rng) => {
      const r = rng.pick([12, 16, 18, 20, 24, 30]);
      const d = rng.pick([0.6, 0.8, 1, 1.2, 1.5, 2]);
      const value = 2 * r * Math.sin(d / 2);
      return {
        prompt: md`Two party members stand at radius ${r} px around an enemy, ${d} rad apart. Distance between them, in px?`,
        answer: { kind: 'number', value, tol: 1e-3 },
        solution: md`$2 \cdot ${r} \sin(${d}/2) = ${2 * r} \sin ${(d / 2).toFixed(2)} \approx ${value.toFixed(2)}$ px.`,
      };
    },
  },
  {
    id: 'k05-ally-atb',
    module: 'k05',
    title: 'An uncontrolled member\'s ATB',
    skill: 'S / (a·scale·h + p)',
    gen: (rng) => {
      const a = rng.int(8, 14);
      const scale = rng.pick([0.25, 0.5, 0.75]);
      const h = rng.pick([0.5, 0.8, 1, 1.25]);
      const p = rng.pick([1, 2, 3]);
      const r = a * scale * h + p;
      const value = 100 / r;
      return {
        prompt: md`An AI-controlled member lands ${h} hits per second for ${a} ATB each at ai_atb_scale ${scale}, plus ${p} ATB/s passive. Seconds to fill a 100-point segment?`,
        answer: { kind: 'number', value },
        solution: md`$r = ${a} \cdot ${scale} \cdot ${h} + ${p} = ${r.toFixed(3)}$ ATB/s; $100/r \approx ${value.toFixed(2)}$ s.`,
      };
    },
  },
];
