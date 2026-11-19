import { md, type Drill } from '../content/types';

const big = (n: number) => n.toLocaleString('en-US').replace(/,/g, '{,}');

export const DRILLS: Drill[] = [
  {
    id: 'dl-mlp-params',
    module: 'dl01',
    title: 'MLP parameter counts',
    skill: 'Count weights and biases layer by layer: n_in · n_out + n_out.',
    gen: (r) => {
      const L = r.pick([2, 3, 3]);
      const sizes = [r.pick([4, 8, 16, 32, 64, 784])];
      for (let l = 0; l < L - 1; l++) sizes.push(r.pick([8, 16, 32, 64, 128, 256]));
      sizes.push(r.pick([1, 2, 3, 5, 10]));
      const per = sizes.slice(1).map((n, l) => sizes[l] * n + n);
      const total = per.reduce((a, b) => a + b, 0);
      return {
        prompt: md`An MLP has layer sizes $${sizes.join(' \\to ')}$, with a bias in every layer. How many parameters does it have?`,
        answer: { kind: 'number', value: total },
        solution: md`${per.map((p, l) => `$${sizes[l]}\\cdot${sizes[l + 1]} + ${sizes[l + 1]} = ${big(p)}$`).join(', ')}. Total $${big(total)}$.`,
      };
    },
  },
  {
    id: 'dl-act-deriv',
    module: 'dl01',
    title: 'Activation derivatives',
    skill: "Evaluate σ′ = σ(1 − σ), tanh′ = 1 − tanh² and ReLU′ at a point.",
    gen: (r) => {
      const kind = r.pick(['sigmoid', 'sigmoid', 'tanh', 'relu']);
      if (kind === 'sigmoid') {
        const k = r.pick([1, 2, 3, 4, 9]);
        const neg = r.next() < 0.5;
        const s = neg ? 1 / (k + 1) : k / (k + 1);
        const z = k === 1 ? '0' : `${neg ? '-' : ''}\\ln ${k}`;
        return {
          prompt: md`Compute $\sigma'(z)$ at $z = ${z}$. Fractions are fine.`,
          answer: { kind: 'number', value: s * (1 - s) },
          solution: md`$e^{-z} = ${neg ? k : k === 1 ? 1 : `1/${k}`}$, so $\sigma(z) = ${neg ? `\\frac{1}{${k + 1}}` : `\\frac{${k}}{${k + 1}}`}$ and $\sigma'(z) = \sigma(1-\sigma) = \frac{${k}}{${(k + 1) ** 2}}$.`,
        };
      }
      if (kind === 'tanh') {
        const t = r.pick([0, 0.5, 0.6, 0.8, -0.6, -0.8]);
        return {
          prompt: md`At some $z$, $\tanh z = ${t}$. Compute $\tanh'(z)$.`,
          answer: { kind: 'number', value: 1 - t * t },
          solution: md`$\tanh'(z) = 1 - \tanh^2 z = 1 - ${t < 0 ? `(${t})` : t}^2 = ${Math.round((1 - t * t) * 100) / 100}$.`,
        };
      }
      const z = r.nz(-5, 5);
      return {
        prompt: md`Compute the derivative of $\relu$ at $z = ${z}$.`,
        answer: { kind: 'number', value: z > 0 ? 1 : 0 },
        solution: md`$\relu'(z) = 1$ for $z > 0$ and $0$ for $z < 0$, so the answer is $${z > 0 ? 1 : 0}$.`,
      };
    },
  },
  {
    id: 'dl-backprop-graph',
    module: 'dl01',
    title: 'Backprop through a two-node graph',
    skill: 'Multiply the upstream gradient by the local gradient, node by node.',
    gen: (r) => {
      const a = r.nz(-3, 3), x = r.nz(-3, 3), b = r.int(-4, 4);
      const u = a * x + b;
      const form = r.pick(['sq', 'relu']);
      const wrt = r.pick(['x', 'a', 'b']);
      const local = wrt === 'x' ? a : wrt === 'a' ? x : 1;
      const p = (v: number) => (v < 0 ? `(${v})` : String(v));
      if (form === 'sq') {
        const g = 2 * u * local;
        return {
          prompt: md`$u = a x + b$ and $f = u^2$, with $a = ${a}$, $x = ${x}$, $b = ${b}$. Compute $\partial f/\partial ${wrt}$.`,
          answer: { kind: 'number', value: g },
          solution: md`Forward: $u = ${p(a)}\cdot${p(x)} + ${p(b)} = ${u}$. Backward: $\partial f/\partial u = 2u = ${2 * u}$, local $\partial u/\partial ${wrt} = ${local}$, so $\partial f/\partial ${wrt} = ${2 * u}\cdot${p(local)} = ${g}$.`,
        };
      }
      const c = r.nz(-3, 3);
      const g = c * (u > 0 ? 1 : 0) * local;
      return {
        prompt: md`$u = a x + b$ and $f = c\,\relu(u)$, with $a = ${a}$, $x = ${x}$, $b = ${b}$, $c = ${c}$. Compute $\partial f/\partial ${wrt}$.`,
        answer: { kind: 'number', value: g },
        solution: md`Forward: $u = ${u}$, so $\relu'(u) = ${u > 0 ? 1 : 0}$${u > 0 ? '' : ' and the gradient stops here'}. Backward: $\partial f/\partial u = c\,\relu'(u) = ${c * (u > 0 ? 1 : 0)}$, times $\partial u/\partial ${wrt} = ${local}$: $${g}$.`,
      };
    },
  },
  {
    id: 'dl-init-std',
    module: 'dl01',
    title: 'He and Xavier standard deviations',
    skill: 'He: σ = √(2/n_in). Xavier: σ = √(2/(n_in + n_out)).',
    gen: (r) => {
      if (r.next() < 0.5) {
        const n = r.pick([8, 32, 128, 512, 2048]);
        const s = Math.sqrt(2 / n);
        return {
          prompt: md`A ReLU layer has $n_{\text{in}} = ${n}$. What weight standard deviation does He initialization use?`,
          answer: { kind: 'number', value: s },
          solution: md`$\sqrt{2/${n}} = \sqrt{1/${n / 2}} = ${s}$.`,
        };
      }
      const [nin, nout] = r.pick([[20, 30], [100, 100], [300, 500], [1200, 2000], [64, 136]] as [number, number][]);
      const s = Math.sqrt(2 / (nin + nout));
      return {
        prompt: md`A tanh layer maps $${nin}$ inputs to $${nout}$ outputs. What standard deviation does Xavier (Glorot normal) initialization use?`,
        answer: { kind: 'number', value: s, tol: 1e-6 },
        solution: md`$\sqrt{2/(${nin} + ${nout})} = \sqrt{2/${nin + nout}} = \sqrt{1/${(nin + nout) / 2}} = ${s}$.`,
      };
    },
  },
];
