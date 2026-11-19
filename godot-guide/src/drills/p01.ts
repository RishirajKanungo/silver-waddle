import { md, type Drill } from '../content/types';

const r2 = (x: number) => Math.round(x * 100) / 100;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export const DRILLS: Drill[] = [
  {
    id: 'p01-db',
    module: 'p01',
    title: 'Linear volume and decibels',
    skill: 'Convert between a 0..1 volume and dB with linear_to_db / db_to_linear',
    gen: (rng) => {
      if (rng.next() < 0.5) {
        const v = rng.pick([0.05, 0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]);
        const db = r2(20 * Math.log10(v));
        return {
          prompt: md`A volume slider is at ${v}. What is \`linear_to_db(${v})\` in dB? (2 decimals)`,
          answer: { kind: 'number', value: db, tol: 0.002 },
          solution: md`$20 \log_{10} ${v} = ${db}$ dB.`,
        };
      }
      const db = -rng.pick([3, 6, 10, 12, 18, 20, 24, 30, 40]);
      const v = r3(Math.pow(10, db / 20));
      return {
        prompt: md`A bus is at ${db} dB. What linear amplitude is that? (\`db_to_linear\`, 3 decimals)`,
        answer: { kind: 'number', value: v, tol: 0.01 },
        solution: md`$10^{${db}/20} = ${v}$.`,
      };
    },
  },
  {
    id: 'p01-semitones',
    module: 'p01',
    title: 'Pitch scale and semitones',
    skill: 'Relate pitch_scale to semitones: semitones = 12 log2(pitch_scale)',
    gen: (rng) => {
      if (rng.next() < 0.5) {
        const p = rng.pick([1.03, 1.05, 1.08, 1.1, 1.12, 0.95, 0.92, 0.9, 1.2, 0.85]);
        const st = r2(12 * Math.log2(p));
        return {
          prompt: md`\`pitch_scale = ${p}\`. How many semitones is that from normal pitch? (negative if lower, 2 decimals)`,
          answer: { kind: 'number', value: st, tol: 0.01 },
          solution: md`$12 \log_2 ${p} = ${st}$ semitones.`,
        };
      }
      const st = rng.pick([1, 2, 3, -1, -2, 0.5, -0.5, 12, -12]);
      const p = r3(Math.pow(2, st / 12));
      return {
        prompt: md`What \`pitch_scale\` shifts a sound by ${st} semitones? (3 decimals)`,
        answer: { kind: 'number', value: p, tol: 0.001 },
        solution: md`$2^{${st}/12} = ${p}$. Twelve semitones is an octave: double or half speed.`,
      };
    },
  },
  {
    id: 'p01-emission',
    module: 'p01',
    title: 'Particle emission',
    skill: 'rate = amount / lifetime; amount = rate × lifetime',
    gen: (rng) => {
      const life = rng.pick([0.2, 0.25, 0.4, 0.5, 0.8, 1, 2]);
      const amount = rng.int(2, 40);
      if (rng.next() < 0.5)
        return {
          prompt: md`A GPUParticles2D has \`amount = ${amount}\` and \`lifetime = ${life}\` s. How many particles does it emit per second?`,
          answer: { kind: 'number', value: amount / life },
          solution: md`$${amount} / ${life} = ${r2(amount / life)}$ per second, with at most ${amount} alive at once.`,
        };
      const rate = amount / life;
      return {
        prompt: md`You want ${r2(rate)} particles per second, each living ${life} s. What \`amount\` should the emitter have?`,
        answer: { kind: 'number', value: amount },
        solution: md`amount = rate × lifetime = $${r2(rate)} \times ${life} = ${amount}$.`,
      };
    },
  },
  {
    id: 'p01-spark-height',
    module: 'p01',
    title: 'Particle arc height',
    skill: 'Height of a particle launched straight up: v² / 2(g + damping)',
    gen: (rng) => {
      const v = rng.pick([60, 80, 100, 120, 150]);
      const g = rng.pick([0, 100, 200, 300, 400]);
      const d = rng.pick([40, 80, 120, 200]);
      const a = g + d;
      const h = (v * v) / (2 * a);
      return {
        prompt: md`A particle starts straight up at ${v} px/s, with gravity ${g} px/s² and damping ${d} px/s². How high does it rise, in px?`,
        answer: { kind: 'number', value: h, tol: 0.002 },
        solution: md`Gravity and damping both slow it while it rises: deceleration $${g} + ${d} = ${a}$ px/s². Height $= ${v}^2 / (2 \times ${a}) = ${r2(h)}$ px.`,
      };
    },
  },
];
