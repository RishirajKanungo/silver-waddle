import { md, type Drill } from '../content/types';

const v = (xs: number[]) => `\\begin{bmatrix}${xs.join('\\\\')}\\end{bmatrix}`;
const paren = (x: number) => (x < 0 ? `(${x})` : String(x));

export const DRILLS: Drill[] = [
  {
    id: 'la-dot',
    module: 'la01',
    title: 'Dot products',
    skill: 'Multiply-and-add without slips, including signs.',
    gen: (r) => {
      const n = r.pick([3, 3, 4]);
      const a = Array.from({ length: n }, () => r.int(-5, 6));
      const b = Array.from({ length: n }, () => r.int(-5, 6));
      const terms = a.map((x, i) => x * b[i]);
      const val = terms.reduce((s, x) => s + x, 0);
      return {
        prompt: md`Compute $${v(a)} \cdot ${v(b)}$.`,
        answer: { kind: 'number', value: val },
        solution: md`$${a.map((x, i) => `${paren(x)}${paren(b[i])}`).join(' + ')} = ${terms.map(paren).join(' + ')} = ${val}$`,
      };
    },
  },
  {
    id: 'la-norm',
    module: 'la01',
    title: 'Euclidean length',
    skill: 'Square, add, take the root. Leave answers like sqrt(29) exact.',
    gen: (r) => {
      const n = r.pick([2, 3, 3]);
      const a = Array.from({ length: n }, () => r.int(-6, 6));
      if (!a.some((x) => x !== 0)) a[0] = 3;
      const s = a.reduce((t, x) => t + x * x, 0);
      const root = Math.sqrt(s);
      const exact = Number.isInteger(root) ? String(root) : `\\sqrt{${s}}`;
      return {
        prompt: md`Compute $\left\lVert ${v(a)} \right\rVert_2$. You can type \`sqrt(${s})\`.`,
        answer: { kind: 'number', value: root },
        solution: md`$\sqrt{${a.map((x) => `${paren(x)}^2`).join(' + ')}} = \sqrt{${s}}$, so the answer is $${exact}${Number.isInteger(root) ? '' : ` \\approx ${root.toFixed(3)}`}$.`,
      };
    },
  },
  {
    id: 'la-proj',
    module: 'la01',
    title: 'Projection onto a vector',
    skill: 'Apply proj_u v = (u·v / u·u) u, keeping fractions exact.',
    gen: (r) => {
      let u = [r.int(-3, 4), r.int(-3, 4)];
      while (u[0] === 0 && u[1] === 0) u = [r.int(-3, 4), r.int(-3, 4)];
      const w = [r.int(-4, 5), r.int(-4, 5)];
      const uv = u[0] * w[0] + u[1] * w[1];
      const uu = u[0] * u[0] + u[1] * u[1];
      const c = uv / uu;
      const res = [c * u[0], c * u[1]].map((x) => Math.round(x * 1e4) / 1e4);
      return {
        prompt: md`Project $\bv = ${v(w)}$ onto $\bu = ${v(u)}$. Enter the vector; fractions such as 3/5 are fine.`,
        answer: { kind: 'vector', value: [c * u[0], c * u[1]] },
        solution: md`$\bu\cdot\bv = ${uv}$ and $\bu\cdot\bu = ${uu}$, so $\operatorname{proj}_{\bu}\bv = \tfrac{${uv}}{${uu}}${v(u)} \approx ${v(res)}$.`,
      };
    },
  },
];
