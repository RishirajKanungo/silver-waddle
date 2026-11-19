import { md, type Drill } from '../content/types';

const frac = (x: number) => {
  for (const d of [1, 2, 4, 8, 16]) if (Number.isInteger(x * d)) return d === 1 ? String(x) : `\\tfrac{${x * d}}{${d}}`;
  return String(x);
};
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const paren = (x: number) => (x < 0 ? `(${x})` : String(x));

const DYADIC: number[][] = [
  [1 / 2, 1 / 2],
  [1 / 2, 1 / 4, 1 / 4],
  [1 / 4, 1 / 4, 1 / 4, 1 / 4],
  [1 / 2, 1 / 4, 1 / 8, 1 / 8],
  [1 / 4, 1 / 4, 1 / 2],
  [1 / 8, 1 / 8, 1 / 4, 1 / 2],
  [1 / 2, 1 / 8, 1 / 8, 1 / 8, 1 / 8],
];

export const DRILLS: Drill[] = [
  {
    id: 'calc-entropy',
    module: 'calc03',
    title: 'Entropy in bits',
    skill: 'Sum p · log₂(1/p) quickly for probabilities that are powers of 1/2.',
    gen: (r) => {
      const p = r.shuffle(r.pick(DYADIC));
      const terms = p.map((x) => x * -Math.log2(x));
      const H = terms.reduce((s, x) => s + x, 0);
      return {
        prompt: md`Compute the entropy, in bits, of the distribution $(${p.map(frac).join(', ')})$.`,
        answer: { kind: 'number', value: H },
        solution: md`$H = \sum_i p_i\log_2(1/p_i) = ${p.map((x) => `${frac(x)}\\cdot ${-Math.log2(x)}`).join(' + ')} = ${r4(H)}$ bits.`,
      };
    },
  },
  {
    id: 'calc-kl',
    module: 'calc03',
    title: 'KL divergence in bits',
    skill: 'Compute Σ p log₂(p/q) term by term, keeping track of signs.',
    gen: (r) => {
      const base = r.pick(DYADIC.filter((d) => d.length >= 3));
      const p = r.shuffle(base);
      let q = r.shuffle(base);
      if (q.every((x, i) => x === p[i])) q = [...q.slice(1), q[0]];
      const terms = p.map((x, i) => x * Math.log2(x / q[i]));
      const kl = terms.reduce((s, x) => s + x, 0);
      return {
        prompt: md`Let $p = (${p.map(frac).join(', ')})$ and $q = (${q.map(frac).join(', ')})$. Compute $\KL(p\,\|\,q)$ in bits.`,
        answer: { kind: 'number', value: kl },
        solution: md`$\sum_i p_i\log_2\frac{p_i}{q_i} = ${p.map((x, i) => `${frac(x)}\\cdot(${Math.log2(x / q[i])})`).join(' + ')} = ${r4(kl)}$ bits.${kl === 0 ? ' The distributions are equal.' : ''}`,
      };
    },
  },
  {
    id: 'calc-gdstep',
    module: 'calc03',
    title: 'One gradient-descent step',
    skill: 'Compute the gradient, scale by η, subtract; check the step against 2/λmax.',
    gen: (r) => {
      const a = r.int(1, 4), b = r.int(1, 4);
      const x = r.nz(-3, 3), y = r.nz(-3, 3);
      const eta = r.pick([0.05, 0.1, 0.25]);
      const g = [2 * a * x, 2 * b * y];
      const nx = r4(x - eta * g[0]), ny = r4(y - eta * g[1]);
      const lmax = 2 * Math.max(a, b);
      return {
        prompt: md`Take one gradient-descent step with $\eta = ${eta}$ on $f(x, y) = ${a === 1 ? '' : a}x^2 + ${b === 1 ? '' : b}y^2$ from $(${x}, ${y})$. Enter the new point.`,
        answer: { kind: 'vector', value: [nx, ny] },
        solution: md`$\nabla f = (${2 * a}x, ${2 * b}y) = (${g[0]}, ${g[1]})$. New point: $(${x} - ${eta}\cdot ${paren(g[0])},\ ${y} - ${eta}\cdot ${paren(g[1])}) = (${nx}, ${ny})$. The Hessian is $\diag(${2 * a}, ${2 * b})$, so $\eta$ is stable when below $2/${lmax} = ${r4(2 / lmax)}$${eta >= 2 / lmax ? ', and this step overshoots' : ''}.`,
      };
    },
  },
  {
    id: 'calc-momentum',
    module: 'calc03',
    title: 'Two momentum steps',
    skill: 'Apply v ← βv + g, θ ← θ − ηv without mixing up the order.',
    gen: (r) => {
      const th0 = r.int(-3, 3), g1 = r.nz(-4, 4), g2 = r.nz(-4, 4);
      const eta = 0.1, beta = 0.9;
      const v1 = g1, th1 = r4(th0 - eta * v1);
      const v2 = r4(beta * v1 + g2), th2 = r4(th1 - eta * v2);
      return {
        prompt: md`Momentum with $\eta = 0.1$, $\beta = 0.9$, $v_0 = 0$ and $\theta_0 = ${th0}$. The gradients at steps 1 and 2 are $g_1 = ${g1}$ and $g_2 = ${g2}$. Compute $\theta_2$.`,
        answer: { kind: 'number', value: th2 },
        solution: md`$v_1 = ${g1}$, $\theta_1 = ${th0} - 0.1\cdot ${paren(g1)} = ${th1}$. $v_2 = 0.9\cdot ${paren(v1)} + ${paren(g2)} = ${v2}$, $\theta_2 = ${th1} - 0.1\cdot ${paren(v2)} = ${th2}$.`,
      };
    },
  },
];
