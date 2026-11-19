import { md, type Drill } from '../content/types';

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
/** a/b as reduced TeX fraction */
const fr = (a: number, b: number) => {
  if (b < 0) {
    a = -a;
    b = -b;
  }
  const g = gcd(a, b) || 1;
  const [p, q] = [a / g, b / g];
  if (q === 1) return String(p);
  return `${p < 0 ? '-' : ''}\\tfrac{${Math.abs(p)}}{${q}}`;
};
const vec = (xs: string[]) => `\\begin{bmatrix}${xs.join('\\\\')}\\end{bmatrix}`;

export const DRILLS: Drill[] = [
  {
    id: 'ml02-sigmoid',
    module: 'ml02',
    title: 'Sigmoid and logit',
    skill: 'σ(ln k) = k/(k + 1), σ(−z) = 1 − σ(z), logit(p) = ln(p/(1 − p)), without a calculator.',
    gen: (r) => {
      const kind = r.pick(['sig', 'signeg', 'logit'] as const);
      const k = r.pick([2, 3, 4, 5, 7, 9, 19]);
      if (kind === 'sig')
        return {
          prompt: md`Compute $\sigma(\ln ${k})$.`,
          answer: { kind: 'number', value: k / (k + 1) },
          solution: md`$\sigma(\ln ${k}) = \dfrac{1}{1 + e^{-\ln ${k}}} = \dfrac{1}{1 + 1/${k}} = \dfrac{${k}}{${k + 1}}$.`,
          inputHint: 'a fraction is fine',
        };
      if (kind === 'signeg')
        return {
          prompt: md`Compute $\sigma(-\ln ${k})$.`,
          answer: { kind: 'number', value: 1 / (k + 1) },
          solution: md`$\sigma(-z) = 1 - \sigma(z)$, and $\sigma(\ln ${k}) = \tfrac{${k}}{${k + 1}}$, so $\sigma(-\ln ${k}) = \tfrac{1}{${k + 1}}$. Directly: $\dfrac{1}{1 + e^{\ln ${k}}} = \dfrac{1}{1 + ${k}}$.`,
          inputHint: 'a fraction is fine',
        };
      const a = r.int(1, 9), b = r.int(1, 9);
      const p = a / (a + b);
      return {
        prompt: md`A model outputs $p = ${fr(a, a + b)}$. Compute the logit (log-odds) $\ln\frac{p}{1 - p}$. You can type \`ln(${a}/${b})\`.`,
        answer: { kind: 'number', value: Math.log(p / (1 - p)) },
        solution: md`Odds $\frac{p}{1 - p} = \frac{${a}/${a + b}}{${b}/${a + b}} = ${fr(a, b)}$, so the logit is $\ln ${a === b ? '1 = 0' : `${fr(a, b)} \\approx ${Math.log(a / b).toFixed(3)}`}$.`,
        inputHint: 'e.g. ln(3/4)',
      };
    },
  },
  {
    id: 'ml02-softmax',
    module: 'ml02',
    title: 'Softmax of three logits',
    skill: 'Exponentiate, normalize, and read off the cross-entropy; adding a constant to every logit changes nothing.',
    gen: (r) => {
      const a = [r.int(1, 6), r.int(1, 6), r.int(1, 6)];
      const shift = r.pick([0, 0, 1, 2, -1]);
      const S = a[0] + a[1] + a[2];
      const zs = a.map((v) => (v === 1 ? '0' : `\\ln ${v}`) + (shift === 0 ? '' : shift > 0 ? ` + ${shift}` : ` - ${-shift}`));
      const askLoss = r.next() < 0.35;
      const y = r.int(0, 2);
      if (askLoss)
        return {
          prompt: md`Logits $\bz = (${zs.join(',\\ ')})$ and true class $y = ${y}$ (classes $0, 1, 2$). Compute the cross-entropy $-\log p_y$.`,
          answer: { kind: 'number', value: Math.log(S / a[y]) },
          solution: md`${shift !== 0 ? `The common shift ${shift > 0 ? '+' : '−'}${Math.abs(shift)} cancels in the softmax. ` : ''}The exponentials are proportional to $${a.join(', ')}$ with sum $${S}$, so $p_${y} = ${fr(a[y], S)}$ and $-\log p_${y} = \ln ${fr(S, a[y])} \approx ${Math.log(S / a[y]).toFixed(3)}$.`,
          inputHint: `e.g. ln(${S}/${a[y]})`,
        };
      return {
        prompt: md`Compute $\softmax(\bz)$ for $\bz = (${zs.join(',\\ ')})$.`,
        answer: { kind: 'vector', value: a.map((v) => v / S) },
        solution: md`${shift !== 0 ? `Adding the same constant to every logit does not change the softmax, so drop the ${shift > 0 ? '+' : '−'}${Math.abs(shift)}. ` : ''}$e^{\ln a} = a$, so the exponentials are $${a.join(', ')}$ with sum $${S}$: $\mathbf{p} = ${vec(a.map((v) => fr(v, S)))}$.`,
        inputHint: 'three numbers, fractions allowed',
      };
    },
  },
  {
    id: 'ml02-prf1',
    module: 'ml02',
    title: 'Precision, recall and F1',
    skill: 'Read a confusion matrix; F1 = 2TP / (2TP + FP + FN).',
    gen: (r) => {
      const tp = r.pick([6, 8, 9, 10, 12, 15, 18, 20, 24, 30, 40]);
      const fp = r.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20]);
      const fn = r.pick([2, 3, 4, 5, 6, 8, 10, 12, 15, 20]);
      const tn = r.pick([50, 80, 100, 150, 200, 400, 900]);
      const P = tp / (tp + fp), R = tp / (tp + fn), F = (2 * tp) / (2 * tp + fp + fn);
      return {
        prompt: md`A confusion matrix has $TP = ${tp}$, $FP = ${fp}$, $FN = ${fn}$, $TN = ${tn}$. Compute precision, recall and $F_1$.`,
        answer: { kind: 'vector', value: [P, R, F] },
        solution: md`Precision $= \frac{${tp}}{${tp} + ${fp}} = ${fr(tp, tp + fp)}$. Recall $= \frac{${tp}}{${tp} + ${fn}} = ${fr(tp, tp + fn)}$. $F_1 = \frac{2\cdot ${tp}}{2\cdot ${tp} + ${fp} + ${fn}} = ${fr(2 * tp, 2 * tp + fp + fn)} \approx ${F.toFixed(3)}$. ($TN = ${tn}$ enters none of them; it only affects accuracy and specificity.)`,
        inputHint: '[precision, recall, F1], fractions allowed',
      };
    },
  },
  {
    id: 'ml02-lrgrad',
    module: 'ml02',
    title: 'Logistic-regression gradient for one example',
    skill: 'Apply ∇w = (p − y) x and ∂b = p − y.',
    gen: (r) => {
      const k = r.pick([2, 3, 4, 9]);
      const neg = r.next() < 0.5;
      const p = neg ? 1 / (k + 1) : k / (k + 1);
      const y = r.int(0, 1);
      const x = [r.nz(-3, 3), r.nz(-3, 3)];
      const e = p - y;
      const num = neg ? 1 : k; // p = num / (k + 1)
      const eNum = num - y * (k + 1); // p − y = eNum / (k + 1)
      return {
        prompt: md`A logistic-regression model gives the example $\bx = (${x[0]}, ${x[1]})$ the logit $z = ${neg ? '-' : ''}\ln ${k}$. Its label is $y = ${y}$. Compute $[\partial\ell/\partial w_1,\ \partial\ell/\partial w_2,\ \partial\ell/\partial b]$ for the cross-entropy $\ell$.`,
        answer: { kind: 'vector', value: [e * x[0], e * x[1], e] },
        solution: md`$p = \sigma(${neg ? '-' : ''}\ln ${k}) = ${fr(num, k + 1)}$, so $p - y = ${fr(eNum, k + 1)}$. Gradient: $(p - y)\bx = ${fr(eNum, k + 1)}\cdot(${x[0]}, ${x[1]}) = (${fr(eNum * x[0], k + 1)},\ ${fr(eNum * x[1], k + 1)})$ and $\partial\ell/\partial b = ${fr(eNum, k + 1)}$.`,
        inputHint: 'three numbers, fractions allowed',
      };
    },
  },
];
