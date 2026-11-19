import { md, type Drill } from '../content/types';

const r4 = (x: number) => Math.round(x * 10000) / 10000;
const IN: Record<string, { f: (t: number) => number; tex: string }> = {
  quad: { f: (t) => t * t, tex: 't^2' },
  cubic: { f: (t) => t * t * t, tex: 't^3' },
};

export const DRILLS: Drill[] = [
  {
    id: 'm03-ease-value',
    module: 'm03',
    title: 'Easing value at t',
    skill: 'out(t) = 1 − in(1 − t); in_out: in(2t)/2, then its mirror.',
    gen: (r) => {
      const fam = r.pick(['quad', 'cubic']);
      const mode = r.pick(['in', 'out', 'in_out']);
      const t = r.pick([0.2, 0.25, 0.4, 0.5, 0.6, 0.75, 0.8]);
      const fin = IN[fam].f;
      const v = mode === 'in' ? fin(t) : mode === 'out' ? 1 - fin(1 - t) : t < 0.5 ? fin(2 * t) / 2 : 1 - fin(2 * (1 - t)) / 2;
      const how = mode === 'in' ? `$${t}^${fam === 'quad' ? 2 : 3}$` : mode === 'out' ? `$1 - (1 - ${t})^${fam === 'quad' ? 2 : 3}$` : t < 0.5 ? `$\\text{in}(2\\cdot ${t})/2$` : `$1 - \\text{in}(2(1 - ${t}))/2$`;
      return {
        prompt: md`Evaluate \`TRANS_${fam.toUpperCase()}\` with \`EASE_${mode.toUpperCase()}\` at $t = ${t}$ (ease-in is $${IN[fam].tex}$).`,
        answer: { kind: 'number', value: v },
        solution: md`${how} $= ${r4(v)}$.`,
      };
    },
  },
  {
    id: 'm03-spring-overshoot',
    module: 'm03',
    title: 'Spring overshoot',
    skill: 'Overshoot = exp(−πζ/√(1−ζ²)) for ζ < 1.',
    gen: (r) => {
      const z = r.pick([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]);
      const o = 100 * Math.exp((-Math.PI * z) / Math.sqrt(1 - z * z));
      return {
        prompt: md`A spring has damping ratio $\zeta = ${z}$. By what percentage of the step does it overshoot?`,
        answer: { kind: 'number', value: o },
        inputHint: 'percent',
        solution: md`$e^{-\pi\cdot ${z}/\sqrt{1 - ${z}^2}} = e^{-${r4((Math.PI * z) / Math.sqrt(1 - z * z))}} \approx ${r4(o / 100)}$, so about $${Math.round(o * 10) / 10}\%$.`,
      };
    },
  },
  {
    id: 'm03-shake-after',
    module: 'm03',
    title: 'Shake after a hit',
    skill: 'trauma decays linearly; shake = trauma².',
    gen: (r) => {
      const t0 = r.pick([0.4, 0.5, 0.6, 0.8, 1]);
      const d = r.pick([1, 1.5, 2, 2.5]);
      const t = r.pick([0.1, 0.2, 0.25, 0.3]);
      const tr = Math.max(0, t0 - d * t);
      return {
        prompt: md`Trauma is ${t0} right after a hit and decays at ${d} per second. With shake $= \text{trauma}^2$, what is the shake ${t} s later (as a fraction of max_offset)?`,
        answer: { kind: 'number', value: tr * tr },
        solution: md`Trauma $= \max(${t0} - ${d}\cdot ${t}, 0) = ${r4(tr)}$, shake $= ${r4(tr)}^2 = ${r4(tr * tr)}$.`,
      };
    },
  },
  {
    id: 'm03-bob',
    module: 'm03',
    title: 'Bobbing offset',
    skill: 'y = A sin(2π f t); peak speed 2π f A.',
    gen: (r) => {
      const A = r.pick([1, 2, 3, 4]);
      const f = r.pick([0.5, 1, 1.5, 2]);
      const t = r.pick([0.125, 0.25, 0.5, 0.75, 1.125]);
      const y = A * Math.sin(2 * Math.PI * f * t);
      return {
        prompt: md`A pickup bobs with \`${A}.0 * sin(TAU * ${f} * time)\`. What is the offset at time ${t} s?`,
        answer: { kind: 'number', value: Math.abs(y) < 1e-9 ? 0 : y },
        solution: md`The angle is $2\pi\cdot ${f}\cdot ${t} = ${r4(2 * f * t)}\pi$, and $${A}\sin(${r4(2 * f * t)}\pi) = ${r4(Math.abs(y) < 1e-9 ? 0 : y)}$ px.`,
      };
    },
  },
];
