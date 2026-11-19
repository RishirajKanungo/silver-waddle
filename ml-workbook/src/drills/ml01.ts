import { md, type Drill } from '../content/types';
import type { Rng } from '../math/rng';

const paren = (x: number) => (x < 0 ? `(${x})` : String(x));
const lineTeX = (w: number, b: number) => `${w === 1 ? '' : w === -1 ? '-' : w}x ${b < 0 ? '-' : '+'} ${Math.abs(b)}`;
/** k/3 as TeX, reduced */
const third = (k: number) => {
  if (k % 3 === 0) return String(k / 3);
  return `${k < 0 ? '-' : ''}\\tfrac{${Math.abs(k)}}{3}`;
};
const pts = (xs: number[], ys: number[]) => xs.map((x, i) => `(${x}, ${ys[i]})`).join(', ');

/** three distinct x values in 0..5, sorted */
const threeX = (r: Rng) => r.shuffle([0, 1, 2, 3, 4, 5]).slice(0, 3).sort((a, b) => a - b);

/** a line and three points whose residuals are small integers */
function setup(r: Rng) {
  const w = r.pick([-2, -1, 1, 2, 3]);
  const b = r.int(-3, 3);
  const xs = threeX(r);
  const e = xs.map(() => r.int(-3, 3)); // prediction minus target
  if (!e.some((v) => v !== 0)) e[r.int(0, 2)] = r.nz(-2, 2);
  const ys = xs.map((x, i) => w * x + b - e[i]);
  return { w, b, xs, ys, e };
}

export const DRILLS: Drill[] = [
  {
    id: 'ml01-mse',
    module: 'ml01',
    title: 'MSE of a line',
    skill: 'Predict, subtract, square, average: the loss of a given line on three points.',
    gen: (r) => {
      const { w, b, xs, ys, e } = setup(r);
      const sse = e.reduce((s, v) => s + v * v, 0);
      return {
        prompt: md`Points $${pts(xs, ys)}$. Compute the MSE of the line $\hat y = ${lineTeX(w, b)}$.`,
        answer: { kind: 'number', value: sse / 3 },
        solution: md`Predictions: $${xs.map((x) => w * x + b).join(', ')}$. Residuals $y_i - \hat y_i$: $${e.map((v) => -v).join(', ')}$. Squares: $${e.map((v) => v * v).join(' + ')} = ${sse}$. MSE $= ${sse}/3${sse % 3 === 0 ? ` = ${sse / 3}` : ` \\approx ${(sse / 3).toFixed(3)}`}$.`,
        inputHint: 'a number or fraction, e.g. 14/3',
      };
    },
  },
  {
    id: 'ml01-grad',
    module: 'ml01',
    title: 'Gradient of the MSE',
    skill: 'Apply ∂L/∂w = (2/n) Σ (ŷᵢ − yᵢ) xᵢ and ∂L/∂b = (2/n) Σ (ŷᵢ − yᵢ) on three points.',
    gen: (r) => {
      const { w, b, xs, ys, e } = setup(r);
      const sx = e.reduce((s, v, i) => s + v * xs[i], 0), s1 = e.reduce((s, v) => s + v, 0);
      return {
        prompt: md`Points $${pts(xs, ys)}$, model $\hat y = wx + b$, loss $L = \frac13\sum_i (\hat y_i - y_i)^2$. Compute $[\partial L/\partial w,\ \partial L/\partial b]$ at $w = ${w}$, $b = ${b}$.`,
        answer: { kind: 'vector', value: [(2 * sx) / 3, (2 * s1) / 3] },
        solution: md`Errors $\hat y_i - y_i$: $${e.join(', ')}$. $\partial L/\partial w = \tfrac23\left(${e.map((v, i) => `${paren(v)}\\cdot${xs[i]}`).join(' + ')}\right) = \tfrac23\cdot ${paren(sx)} = ${third(2 * sx)}$. $\partial L/\partial b = \tfrac23\cdot ${paren(s1)} = ${third(2 * s1)}$.`,
        inputHint: '[dL/dw, dL/db], fractions allowed',
      };
    },
  },
  {
    id: 'ml01-gdstep',
    module: 'ml01',
    title: 'One gradient-descent step',
    skill: 'Compute the gradient on three points and take one step w ← w − η∇L.',
    gen: (r) => {
      const { w, b, xs, ys, e } = setup(r);
      const sx = e.reduce((s, v, i) => s + v * xs[i], 0), s1 = e.reduce((s, v) => s + v, 0);
      // η = 0.15 makes η · 2/3 = 0.1
      const w1 = w - 0.1 * sx, b1 = b - 0.1 * s1;
      const r2 = (v: number) => Math.round(v * 10) / 10;
      return {
        prompt: md`Points $${pts(xs, ys)}$, model $\hat y = wx + b$, MSE loss. From $w = ${w}$, $b = ${b}$, take one gradient-descent step with $\eta = 0.15$. Enter $[w_1, b_1]$.`,
        answer: { kind: 'vector', value: [w1, b1] },
        solution: md`Errors $\hat y_i - y_i$: $${e.join(', ')}$. Gradient: $\partial L/\partial w = \tfrac23\cdot${paren(sx)}$, $\partial L/\partial b = \tfrac23\cdot${paren(s1)}$. Since $0.15\cdot\tfrac23 = 0.1$: $w_1 = ${w} - 0.1\cdot${paren(sx)} = ${r2(w1)}$ and $b_1 = ${b} - 0.1\cdot${paren(s1)} = ${r2(b1)}$.`,
        inputHint: '[w1, b1]',
      };
    },
  },
  {
    id: 'ml01-ols',
    module: 'ml01',
    title: 'Least-squares line through three points',
    skill: 'Use w = Σ(x − x̄)(y − ȳ) / Σ(x − x̄)² and b = ȳ − w x̄.',
    gen: (r) => {
      const x0 = r.int(0, 3);
      const xs = [x0, x0 + 1, x0 + 2];
      const ys = xs.map(() => r.int(-2, 8));
      const yb = (ys[0] + ys[1] + ys[2]) / 3;
      const sxy = ys[2] - ys[0]; // Σ(x − x̄)(y − ȳ) with x − x̄ = −1, 0, 1
      const w = sxy / 2;
      const b = yb - w * (x0 + 1);
      return {
        prompt: md`Fit $\hat y = wx + b$ by least squares to $${pts(xs, ys)}$. Enter $[b, w]$.`,
        answer: { kind: 'vector', value: [b, w] },
        solution: md`$\bar x = ${x0 + 1}$, $\bar y = \tfrac{${ys[0] + ys[1] + ys[2]}}{3}$. Deviations $x_i - \bar x = -1, 0, 1$, so $\sum(x_i - \bar x)^2 = 2$ and $\sum(x_i - \bar x)(y_i - \bar y) = y_3 - y_1 = ${sxy}$ (the $\bar y$ terms cancel). $w = ${sxy}/2 = ${w}$, and $b = \bar y - w\bar x = \tfrac{${ys[0] + ys[1] + ys[2]}}{3} - ${paren(w)}\cdot ${x0 + 1} \approx ${(Math.round(b * 1000) / 1000).toString()}$.`,
        inputHint: '[b, w], fractions allowed',
      };
    },
  },
];
