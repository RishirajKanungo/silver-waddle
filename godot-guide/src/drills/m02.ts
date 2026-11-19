import { md, type Drill } from '../content/types';

const r3 = (x: number) => Math.round(x * 1000) / 1000;

export const DRILLS: Drill[] = [
  {
    id: 'm02-jump-params',
    module: 'm02',
    title: 'Jump gravity and speed',
    skill: 'g = 2h/t², v0 = 2h/t.',
    gen: (r) => {
      const h = r.int(2, 12) * 8;
      const t = r.pick([0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6]);
      const g = (2 * h) / (t * t), v = (2 * h) / t;
      return {
        prompt: md`A jump should reach ${h} px in ${t} s. Compute gravity (px/s²) and the takeoff speed (px/s). Enter $[g, v_0]$.`,
        answer: { kind: 'vector', value: [g, v] },
        inputHint: 'g, v0',
        solution: md`$g = 2\cdot ${h}/${t}^2 = ${2 * h}/${r3(t * t)} \approx ${r3(g)}$ px/s². $v_0 = 2\cdot ${h}/${t} \approx ${r3(v)}$ px/s (\`jump_velocity = -${r3(v)}\`).`,
      };
    },
  },
  {
    id: 'm02-airtime',
    module: 'm02',
    title: 'Airtime with fall gravity',
    skill: 'Rise t, fall t/√m.',
    gen: (r) => {
      const t = r.pick([0.3, 0.35, 0.4, 0.45, 0.5]);
      const m = r.pick([1, 1.5, 2, 2.5, 3, 4]);
      const air = t + t / Math.sqrt(m);
      return {
        prompt: md`Time to apex ${t} s, fall multiplier ${m}. What is the airtime of a full jump that lands at its starting height, in seconds?`,
        answer: { kind: 'number', value: air },
        solution: md`$t_{\text{fall}} = ${t}/\sqrt{${m}} \approx ${r3(t / Math.sqrt(m))}$ s, so the airtime is $\approx ${r3(air)}$ s.`,
      };
    },
  },
  {
    id: 'm02-smoothing-k',
    module: 'm02',
    title: 'Per-frame lerp to exp decay',
    skill: 'k = −F ln(1 − w): the sharpness that matches weight w at F frames per second.',
    gen: (r) => {
      const w = r.pick([0.05, 0.1, 0.15, 0.2, 0.25, 0.3]);
      const F = r.pick([30, 60, 120, 144]);
      const k = -F * Math.log(1 - w);
      return {
        prompt: md`A camera used \`lerp(..., ${w})\` every frame and felt right at ${F} fps. What sharpness $k$ (per second) gives the same feel with \`1.0 - exp(-k * delta)\`?`,
        answer: { kind: 'number', value: k },
        solution: md`Per frame the gap keeps $1 - ${w} = e^{-k/${F}}$, so $k = -${F}\ln(${r3(1 - w)}) \approx ${r3(k)}$ s$^{-1}$.`,
      };
    },
  },
  {
    id: 'm02-knockback',
    module: 'm02',
    title: 'Knockback distance and time',
    skill: 'Constant decay a: lasts s/a, travels s²/2a.',
    gen: (r) => {
      const s = r.int(4, 16) * 20;
      const a = r.pick([600, 800, 900, 1000, 1200, 1500, 2000]);
      return {
        prompt: md`Knockback strength ${s} px/s decays with \`move_toward(Vector2.ZERO, ${a}.0 * delta)\`. How far does it push (px) and for how long (s)? Enter [distance, time].`,
        answer: { kind: 'vector', value: [(s * s) / (2 * a), s / a] },
        inputHint: 'distance, time',
        solution: md`Time $${s}/${a} \approx ${r3(s / a)}$ s; distance $${s}^2/(2\cdot ${a}) = ${s * s}/${2 * a} \approx ${r3((s * s) / (2 * a))}$ px.`,
      };
    },
  },
];
