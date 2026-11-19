import { md, type Drill } from '../content/types';
import { Frac } from '../math/frac';

const bm = (A: number[][]) => `\\begin{bmatrix} ${A.map((r) => r.join(' & ')).join(' \\\\ ')} \\end{bmatrix}`;
const paren = (x: number) => (x < 0 ? `(${x})` : String(x));

export const DRILLS: Drill[] = [
  {
    id: 'la-det2',
    module: 'la05',
    title: '2×2 determinants',
    skill: 'ad − bc, with signs, in one breath.',
    gen: (r) => {
      const A = [[r.int(-6, 7), r.int(-6, 7)], [r.int(-6, 7), r.int(-6, 7)]];
      const d = A[0][0] * A[1][1] - A[0][1] * A[1][0];
      return {
        prompt: md`Compute $\det${bm(A)}$.`,
        answer: { kind: 'number', value: d },
        solution: md`$ad - bc = ${paren(A[0][0])}\cdot${paren(A[1][1])} - ${paren(A[0][1])}\cdot${paren(A[1][0])} = ${A[0][0] * A[1][1]} - ${paren(A[0][1] * A[1][0])} = ${d}$.`,
      };
    },
  },
  {
    id: 'la-det3',
    module: 'la05',
    title: '3×3 determinants',
    skill: 'Cofactor expansion along the first row, keeping the + − + signs.',
    gen: (r) => {
      const A = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => r.int(-3, 3)));
      const m = (i: number, j: number) => {
        const M = A.filter((_, a) => a !== i).map((row) => row.filter((_, b) => b !== j));
        return M[0][0] * M[1][1] - M[0][1] * M[1][0];
      };
      const minors = [m(0, 0), m(0, 1), m(0, 2)];
      const d = A[0][0] * minors[0] - A[0][1] * minors[1] + A[0][2] * minors[2];
      return {
        prompt: md`Compute $\det${bm(A)}$.`,
        answer: { kind: 'number', value: d },
        solution: md`Along row 1: $${paren(A[0][0])}\cdot(${minors[0]}) - ${paren(A[0][1])}\cdot(${minors[1]}) + ${paren(A[0][2])}\cdot(${minors[2]}) = ${d}$, where the numbers in parentheses are the $2\times 2$ minors (delete row 1 and the entry's column).`,
      };
    },
  },
  {
    id: 'la-detrules',
    module: 'la05',
    title: 'Rules for determinants',
    skill: 'Use det(AB) = det A det B, det(cA) = cⁿ det A, det A⁻¹ = 1/det A, det Aᵀ = det A.',
    gen: (r) => {
      const n = r.pick([2, 3, 4]);
      const d = r.pick([-3, -2, 2, 3, 4, 5]);
      const t = r.int(0, 3);
      const nf = (x: Frac) => x.toTeX();
      if (t === 0) {
        const c = r.pick([2, -1, 3, -2]);
        const v = c ** n * d;
        return { prompt: md`$A$ is $${n}\times ${n}$ with $\det A = ${d}$. Compute $\det(${c}A)$.`, answer: { kind: 'number', value: v }, solution: md`Each of the $${n}$ rows is multiplied by $${c}$: $\det(${c}A) = (${c})^{${n}}\cdot ${paren(d)} = ${v}$.` };
      }
      if (t === 1) {
        const v = new Frac(1, d);
        return { prompt: md`$A$ is $${n}\times ${n}$ with $\det A = ${d}$. Compute $\det(A^{-1})$.`, answer: { kind: 'number', value: 1 / d }, solution: md`$\det(A)\det(A^{-1}) = \det I = 1$, so $\det(A^{-1}) = ${nf(v)}$.` };
      }
      if (t === 2) return { prompt: md`$A$ is $${n}\times ${n}$ with $\det A = ${d}$. Compute $\det(A\T A)$.`, answer: { kind: 'number', value: d * d }, solution: md`$\det(A\T A) = \det A\T\det A = (\det A)^2 = ${d * d}$.` };
      const e = r.pick([-2, 2, 3]);
      const v = new Frac(d * d, e);
      return { prompt: md`$A$ and $B$ are $${n}\times ${n}$ with $\det A = ${d}$ and $\det B = ${e}$. Compute $\det(A^2B^{-1})$.`, answer: { kind: 'number', value: (d * d) / e }, solution: md`$\det(A^2B^{-1}) = (\det A)^2/\det B = ${d * d}/${paren(e)} = ${nf(v)}$.` };
    },
  },
];
