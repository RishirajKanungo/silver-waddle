import { md, type Drill } from '../content/types';

const num = (x: number) => String(Math.round(x * 1e6) / 1e6);
const paren = (x: number) => (x < 0 ? `(${num(x)})` : num(x));

export const DRILLS: Drill[] = [
  {
    id: 'ml-bias-variance',
    module: 'ml03',
    title: 'Bias², variance and expected error at a point',
    skill: 'Average the predictions, then read off bias², variance and the expected squared error.',
    gen: (r) => {
      const f = r.int(-3, 3);
      const b = r.pick([-2, -1, -0.5, 0, 0.5, 1, 2]);
      const dev = r.shuffle(r.pick([[-2, 0, 0, 2], [-1, -1, 1, 1], [-3, 1, 1, 1], [-2, -1, 1, 2], [0, 0, -1, 1], [-1, 0, 0, 1]]));
      const s2 = r.pick([0.25, 0.5, 1, 2]);
      const preds = dev.map((d) => f + b + d);
      const mean = f + b;
      const bias2 = b * b;
      const variance = dev.reduce((s, d) => s + d * d, 0) / 4;
      const total = s2 + bias2 + variance;
      return {
        prompt: md`Models trained on four datasets predict $${preds.map(num).join(',\\ ')}$ at $x_0$. The true value is $f(x_0) = ${f}$ and the noise variance is $\sigma^2 = ${s2}$. Enter bias², variance and the expected squared error.`,
        answer: { kind: 'vector', value: [bias2, variance, total] },
        inputHint: 'three numbers',
        solution: md`Average prediction $\bar f = ${num(mean)}$, so bias² $= (${num(mean)} - ${paren(f)})^2 = ${num(bias2)}$. Deviations from the average: $${dev.join(', ')}$; variance $= (${dev.map((d) => `${paren(d)}^2`).join(' + ')})/4 = ${num(variance)}$. Expected error $= \sigma^2 + \text{bias}^2 + \text{variance} = ${s2} + ${num(bias2)} + ${num(variance)} = ${num(total)}$.`,
      };
    },
  },
  {
    id: 'ml-cv-arithmetic',
    module: 'ml03',
    title: 'Split sizes and number of fits',
    skill: 'Turn a validation plan into rows per fold and a count of model fits.',
    gen: (r) => {
      const k = r.pick([4, 5, 8, 10]);
      const m = r.pick([40, 100, 120, 200, 250]);
      const trval = k * m;
      const n = (trval * 5) / 4; // 20% test
      const g1 = r.int(2, 5), g2 = r.int(2, 4);
      const fits = k * g1 * g2 + 1;
      return {
        prompt: md`You have ${n} labelled rows. You hold out 20% as a test set, run ${k}-fold cross-validation on the rest over a grid of ${g1} × ${g2} hyperparameter settings, and refit the best setting on all non-test rows. Enter (a) the number of rows each CV model trains on and (b) the total number of models trained.`,
        answer: { kind: 'vector', value: [(k - 1) * m, fits] },
        inputHint: 'two numbers',
        solution: md`Non-test rows: $0.8 \times ${n} = ${trval}$, so each fold has $${trval}/${k} = ${m}$ rows and each CV model trains on $${k - 1} \times ${m} = ${(k - 1) * m}$. Fits: $${g1} \times ${g2} = ${g1 * g2}$ settings × ${k} folds $= ${k * g1 * g2}$, plus 1 refit: $${fits}$.`,
      };
    },
  },
  {
    id: 'ml-ab-sample-size',
    module: 'ml03',
    title: 'A/B test sample size (rule of thumb)',
    skill: 'Apply n ≈ 16 p(1 − p)/δ² per arm, with δ as an absolute difference.',
    gen: (r) => {
      const p = r.pick([0.02, 0.04, 0.05, 0.1, 0.2, 0.25, 0.5]);
      const rel = r.pick([0.05, 0.1, 0.2]);
      const delta = Math.round(p * rel * 1e6) / 1e6;
      const n = (16 * p * (1 - p)) / (delta * delta);
      return {
        prompt: md`Baseline conversion rate $${num(p * 100)}\%$. You want to detect a relative lift of $${num(rel * 100)}\%$ with $\alpha = 0.05$ (two-sided) and 80% power. Using $n \approx 16\,p(1-p)/\delta^2$, how many users do you need per arm?`,
        answer: { kind: 'number', value: n, tol: 1e-3 },
        solution: md`The absolute effect is $\delta = ${rel} \times ${p} = ${num(delta)}$. $\sigma^2 = p(1-p) = ${num(p * (1 - p))}$. $n = 16 \times ${num(p * (1 - p))} / ${num(delta)}^2 = ${Math.round(n).toLocaleString('en-US')}$ users per arm.`,
      };
    },
  },
];
