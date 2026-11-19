import { md, type Drill } from '../content/types';

const sci = (x: number) => {
  const e = Math.floor(Math.log10(x));
  const m = Math.round((x / 10 ** e) * 1000) / 1000;
  return `${m}\\times 10^{${e}}`;
};

export const DRILLS: Drill[] = [
  {
    id: 'llm-attnw',
    module: 'llm01',
    title: 'Attention weights for one query',
    skill: 'Scale the scores by 1/√d_k and take a softmax by hand.',
    gen: (r) => {
      const n = r.pick([2, 2, 3]);
      let dots: number[] = [];
      do dots = Array.from({ length: n }, () => 2 * r.int(-2, 2));
      while (new Set(dots).size < 2);
      const s = dots.map((x) => x / 2);
      const m = Math.max(...s);
      const e = s.map((x) => Math.exp(x - m));
      const Z = e.reduce((a, b) => a + b, 0);
      const w = e.map((x) => x / Z);
      return {
        prompt: md`A query has dot products $\bq\cdot\bk_j = (${dots.join(', ')})$ with ${n} keys, and $d_k = 4$. Compute the attention weights. Expressions such as \`e^2/(e^2+1)\` are accepted.`,
        answer: { kind: 'vector', value: w, tol: 5e-3 },
        inputHint: n === 2 ? 'two weights, e.g. 0.73, 0.27' : 'three weights',
        solution: md`Scale by $1/\sqrt{d_k} = 1/2$: scores $(${s.join(', ')})$. Subtract the maximum ${m}: $(${s.map((x) => x - m).join(', ')})$. Exponentiate: $(${e.map((x) => x.toFixed(3)).join(', ')})$, sum ${Z.toFixed(3)}. Weights: $(${w.map((x) => x.toFixed(3)).join(', ')})$.`,
      };
    },
  },
  {
    id: 'llm-params',
    module: 'llm01',
    title: 'Parameter count of a transformer',
    skill: 'Apply N ≈ 12Ld² + Vd quickly and keep track of the powers of ten.',
    gen: (r) => {
      const d = r.pick([512, 768, 1024, 2048, 4096]);
      const L = r.pick([6, 12, 24, 32]);
      const V = r.pick([32000, 50000, 100000]);
      const layers = 12 * L * d * d;
      const emb = V * d;
      const N = layers + emb;
      return {
        prompt: md`A decoder has $d = ${d}$, $L = ${L}$, a $4\times$ MLP, multi-head attention and a tied embedding with $V = ${V}$. Estimate the parameter count with $12Ld^2 + Vd$. Enter it in millions.`,
        answer: { kind: 'number', value: N / 1e6, tol: 5e-3 },
        inputHint: 'millions, e.g. 123.5',
        solution: md`$12\cdot ${L}\cdot ${d}^2 = ${layers.toLocaleString('en-US').replace(/,/g, '{,}')}$ and $Vd = ${V}\cdot ${d} = ${emb.toLocaleString('en-US').replace(/,/g, '{,}')}$. Total $\approx ${(N / 1e6).toFixed(1)}$ M; the embedding is ${((100 * emb) / N).toFixed(0)}% of it.`,
      };
    },
  },
  {
    id: 'llm-flops',
    module: 'llm01',
    title: 'Training compute',
    skill: 'Estimate training FLOPs with C ≈ 6ND.',
    gen: (r) => {
      const N = r.pick([1, 2, 3, 7, 8, 13, 34, 70]) * 1e9;
      const D = r.pick([0.02, 0.1, 0.3, 1, 2, 15]) * 1e12;
      const C = 6 * N * D;
      return {
        prompt: md`Estimate the training compute of a model with $N = ${sci(N)}$ parameters trained on $D = ${sci(D)}$ tokens.`,
        answer: { kind: 'number', value: C, tol: 2e-3 },
        inputHint: 'e.g. 8.4e22',
        solution: md`$C \approx 6ND = 6\cdot ${sci(N)}\cdot ${sci(D)} = ${sci(C)}$ FLOPs: 2 per parameter per token forward, 4 backward. That is ${+(D / N).toPrecision(3)} tokens per parameter.`,
      };
    },
  },
];
