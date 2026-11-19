import { md, type Drill } from '../content/types';

const num = (x: number, d = 4) => String(Math.round(x * 10 ** d) / 10 ** d);
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
const frac = (a: number, b: number) => {
  const g = gcd(a, b) || 1;
  return b / g === 1 ? String(a / g) : `\\tfrac{${a / g}}{${b / g}}`;
};
/** Gini of counts as an exact fraction: 1 − Σc²/n² = (n² − Σc²)/n² */
const giniFrac = (c: number[]) => {
  const n = c.reduce((s, x) => s + x, 0);
  return { num: n * n - c.reduce((s, x) => s + x * x, 0), den: n * n };
};

export const DRILLS: Drill[] = [
  {
    id: 'ml-gini',
    module: 'ml04',
    title: 'Gini impurity of a node',
    skill: 'Compute 1 − Σ p² from class counts, as a fraction.',
    gen: (r) => {
      const k = r.pick([2, 2, 3]);
      const c = Array.from({ length: k }, () => r.int(0, 8));
      if (c.reduce((s, x) => s + x, 0) < 2) c[0] += 2;
      const n = c.reduce((s, x) => s + x, 0);
      const g = giniFrac(c);
      return {
        prompt: md`A node has class counts $(${c.join(', ')})$. Compute its Gini impurity. Fractions are fine.`,
        answer: { kind: 'number', value: g.num / g.den },
        solution: md`$n = ${n}$. $G = 1 - ${c.map((x) => `(${x}/${n})^2`).join(' - ')} = \frac{${n * n} - ${c.map((x) => x * x).join(' - ')}}{${n * n}} = ${frac(g.num, g.den)} \approx ${num(g.num / g.den)}$.`,
      };
    },
  },
  {
    id: 'ml-entropy',
    module: 'ml04',
    title: 'Entropy of a node',
    skill: 'Compute −Σ p log₂ p; recognize the clean cases with powers of two.',
    gen: (r) => {
      const c = r.pick([[4, 4], [2, 1, 1], [4, 2, 1, 1], [2, 2, 2, 2], [1, 1], [3, 1], [1, 7], [6, 2], [2, 6], [4, 0], [8, 4, 4], [5, 5]]);
      const n = c.reduce((s, x) => s + x, 0);
      const terms = c.filter((x) => x > 0).map((x) => -(x / n) * Math.log2(x / n));
      const H = terms.reduce((s, x) => s + x, 0);
      return {
        prompt: md`A node has class counts $(${c.join(', ')})$. Compute its entropy in bits (3 decimals are enough).`,
        answer: { kind: 'number', value: H, tol: 2e-3 },
        solution: md`Proportions $${c.map((x) => frac(x, n)).join(', ')}$. $H = -\sum_k p_k\log_2 p_k = ${terms.map((t) => num(t)).join(' + ')} = ${num(H)}$ bits.${c.includes(0) ? ' A pure node has entropy 0.' : ''}`,
      };
    },
  },
  {
    id: 'ml-gini-gain',
    module: 'ml04',
    title: 'Gini decrease of a split',
    skill: 'Weight each child by its share of the examples and subtract from the parent.',
    gen: (r) => {
      let L = [r.int(0, 6), r.int(0, 6)], R = [r.int(0, 6), r.int(0, 6)];
      while (L[0] + L[1] === 0) L = [r.int(0, 6), r.int(1, 6)];
      while (R[0] + R[1] === 0) R = [r.int(1, 6), r.int(0, 6)];
      const nl = L[0] + L[1], nr = R[0] + R[1], n = nl + nr;
      const P = [L[0] + R[0], L[1] + R[1]];
      const g = (c: number[]) => 1 - c.reduce((s, x) => s + (x / (c[0] + c[1])) ** 2, 0);
      const gain = g(P) - (nl / n) * g(L) - (nr / n) * g(R);
      return {
        prompt: md`A node with counts $(${P.join(', ')})$ is split into a left child $(${L.join(', ')})$ and a right child $(${R.join(', ')})$. Compute the Gini impurity decrease $\Delta I$.`,
        answer: { kind: 'number', value: gain, tol: 1e-3 },
        solution: md`$G(\text{parent}) = ${num(g(P))}$, $G(L) = ${num(g(L))}$, $G(R) = ${num(g(R))}$. Weighted children: $\frac{${nl}}{${n}}(${num(g(L))}) + \frac{${nr}}{${n}}(${num(g(R))}) = ${num((nl / n) * g(L) + (nr / n) * g(R))}$. $\Delta I = ${num(gain)}$.`,
      };
    },
  },
  {
    id: 'ml-boost-step',
    module: 'ml04',
    title: 'One gradient boosting step',
    skill: 'Residuals from the current model, best stump on them, update with the learning rate.',
    gen: (r) => {
      let y: number[] = [];
      for (;;) {
        y = [r.int(0, 6), r.int(0, 9), r.int(2, 12)];
        const s = y[0] + y[1] + y[2];
        if (s % 3 !== 0) continue;
        const m = s / 3;
        const res = y.map((v) => v - m);
        const sse = (a: number[]) => {
          const mu = a.reduce((t, v) => t + v, 0) / a.length;
          return a.reduce((t, v) => t + (v - mu) ** 2, 0);
        };
        const s1 = sse(res.slice(0, 1)) + sse(res.slice(1)), s2 = sse(res.slice(0, 2)) + sse(res.slice(2));
        if (Math.abs(s1 - s2) > 0.5 && res.some((v) => v !== 0)) break;
      }
      const lr = r.pick([0.5, 0.1, 1]);
      const m = (y[0] + y[1] + y[2]) / 3;
      const res = y.map((v) => v - m);
      const mean = (a: number[]) => a.reduce((t, v) => t + v, 0) / a.length;
      const sse = (a: number[]) => a.reduce((t, v) => t + (v - mean(a)) ** 2, 0);
      const s1 = sse(res.slice(0, 1)) + sse(res.slice(1)), s2 = sse(res.slice(0, 2)) + sse(res.slice(2));
      const leaves = s1 < s2 ? [res[0], mean(res.slice(1)), mean(res.slice(1))] : [mean(res.slice(0, 2)), mean(res.slice(0, 2)), res[2]];
      const F1 = leaves.map((h) => m + lr * h);
      return {
        prompt: md`Three points $x = 1, 2, 3$ with labels $y = ${y.join(', ')}$. Squared loss, $F_0 = \bar y$. Fit a stump to the residuals (pick the split with the smaller SSE) and update with $\nu = ${lr}$. Enter $F_1$ at the three points.`,
        answer: { kind: 'vector', value: F1, tol: 1e-3 },
        inputHint: 'three numbers',
        solution: md`$F_0 = ${num(m)}$, residuals $${res.map((v) => num(v)).join(', ')}$. SSE of $\{1\}\{2,3\}$: $${num(s1)}$; of $\{1,2\}\{3\}$: $${num(s2)}$. Best: ${s1 < s2 ? '$\\{1\\}\\{2,3\\}$' : '$\\{1,2\\}\\{3\\}$'}, leaf values $${leaves.map((v) => num(v)).join(', ')}$. $F_1 = ${num(m)} + ${lr}\times(\text{leaf}) = (${F1.map((v) => num(v)).join(', ')})$.`,
      };
    },
  },
];
