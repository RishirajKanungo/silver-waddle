import { md, type Drill } from '../content/types';

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const choose = (n: number, k: number) => {
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
  return Math.round(c);
};

export const DRILLS: Drill[] = [
  {
    id: 'calc-bayes',
    module: 'calc02',
    title: 'Posterior from a test result',
    skill: 'Turn prevalence, sensitivity and specificity into P(condition | positive) with natural frequencies.',
    gen: (r) => {
      const prev = r.pick([0.01, 0.02, 0.05, 0.1, 0.2]);
      const sens = r.pick([0.8, 0.9, 0.95, 0.99]);
      const spec = r.pick([0.9, 0.95, 0.98, 0.99]);
      const N = 10000;
      const sick = Math.round(N * prev), healthy = N - sick;
      const tp = Math.round(sick * sens), fp = Math.round(healthy * (1 - spec));
      const post = (sens * prev) / (sens * prev + (1 - spec) * (1 - prev));
      return {
        prompt: md`A condition has prevalence ${100 * prev}%. A test has sensitivity ${Math.round(100 * sens)}% and specificity ${Math.round(100 * spec)}%. Compute $\P(\text{condition} \mid +)$. A fraction is fine.`,
        answer: { kind: 'number', value: post, tol: 1e-3 },
        solution: md`Per ${N.toLocaleString('en-US')} people: ${sick.toLocaleString('en-US')} have the condition and ${tp.toLocaleString('en-US')} of them test positive; ${healthy.toLocaleString('en-US')} do not, and ${Math.round(100 - 100 * spec)}% of them, ${fp.toLocaleString('en-US')}, test positive. $\P(\text{condition}\mid +) = \dfrac{${tp}}{${tp} + ${fp}} \approx ${post.toFixed(4)}$.`,
      };
    },
  },
  {
    id: 'calc-meanvar',
    module: 'calc02',
    title: 'Mean and variance of a discrete variable',
    skill: 'Compute E[X] and Var(X) = E[X²] − E[X]² from a small table.',
    gen: (r) => {
      const ps = r.pick([[0.2, 0.3, 0.5], [0.1, 0.6, 0.3], [0.25, 0.25, 0.5], [0.5, 0.25, 0.25], [0.4, 0.4, 0.2], [0.1, 0.2, 0.7]]);
      const xs = r.shuffle([-2, -1, 0, 1, 2, 3, 4]).slice(0, 3).sort((a, b) => a - b);
      const E = r4(xs.reduce((s, x, i) => s + x * ps[i], 0));
      const E2 = r4(xs.reduce((s, x, i) => s + x * x * ps[i], 0));
      const V = r4(E2 - E * E);
      return {
        prompt: md`$X$ takes the values $${xs.join(', ')}$ with probabilities $${ps.join(', ')}$. Compute $[\E[X], \Var(X)]$.`,
        answer: { kind: 'vector', value: [E, V] },
        inputHint: '[mean, variance]',
        solution: md`$\E[X] = ${xs.map((x, i) => `(${x})(${ps[i]})`).join(' + ')} = ${E}$. $\E[X^2] = ${xs.map((x, i) => `${x * x}(${ps[i]})`).join(' + ')} = ${E2}$. $\Var(X) = ${E2} - ${E}^2 = ${V}$.`,
      };
    },
  },
  {
    id: 'calc-binom',
    module: 'calc02',
    title: 'Binomial probabilities',
    skill: 'Apply C(n, k) pᵏ(1 − p)ⁿ⁻ᵏ to a small number of independent trials.',
    gen: (r) => {
      const n = r.int(3, 6), k = r.int(0, n);
      const p = r.pick([0.5, 0.2, 0.1, 0.8, 0.9]);
      const c = choose(n, k);
      const val = c * p ** k * (1 - p) ** (n - k);
      return {
        prompt: md`Each of ${n} independent predictions is correct with probability ${p}. What is the probability that exactly ${k} are correct?`,
        answer: { kind: 'number', value: val, tol: 1e-3 },
        solution: md`$\binom{${n}}{${k}}(${p})^{${k}}(${r4(1 - p)})^{${n - k}} = ${c}\cdot ${r4(p ** k)}\cdot ${r4((1 - p) ** (n - k))} \approx ${val.toFixed(5)}$.`,
      };
    },
  },
  {
    id: 'calc-se',
    module: 'calc02',
    title: 'Standard error of a measured accuracy',
    skill: 'SE of a proportion: √(p(1 − p)/n), and the ±1.96 SE interval.',
    gen: (r) => {
      const [p, v] = r.pick([[0.5, 0.25], [0.9, 0.09], [0.8, 0.16], [0.1, 0.09], [0.2, 0.16]] as const);
      const n = r.pick([100, 400, 900, 2500, 10000]);
      const se = Math.sqrt(v / n);
      return {
        prompt: md`A model has accuracy ${p} on ${n.toLocaleString('en-US')} independent test examples. Compute the standard error of this accuracy.`,
        answer: { kind: 'number', value: se },
        solution: md`$\text{SE} = \sqrt{p(1-p)/n} = \sqrt{${v}/${n}} = ${r4(Math.sqrt(v))}/${Math.sqrt(n)} = ${r4(se)}$. An approximate 95% interval is $${p} \pm ${r4(1.96 * se)}$.`,
      };
    },
  },
];
