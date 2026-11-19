import { md, type Drill } from '../content/types';
import { Frac, toFMat, rrefSteps, rowOpTeX, fmatTeX } from '../math/frac';

const bm = (A: (number | string)[][]) => `\\begin{bmatrix} ${A.map((r) => r.join(' & ')).join(' \\\\ ')} \\end{bmatrix}`;
const paren = (x: number) => (x < 0 ? `(${x})` : String(x));
const term = (c: number, v: string, first: boolean) => {
  if (c === 0) return '';
  const mag = Math.abs(c) === 1 ? '' : String(Math.abs(c));
  return first ? `${c < 0 ? '-' : ''}${mag}${v}` : ` ${c < 0 ? '-' : '+'} ${mag}${v}`;
};
const eq = (a: number[], b: number, names = ['x', 'y', 'z']) => {
  let s = '';
  a.forEach((c, i) => (s += term(c, names[i], s === '')));
  return `${s || '0'} = ${b}`;
};

export const DRILLS: Drill[] = [
  {
    id: 'la-solve2',
    module: 'la03',
    title: 'Solve a 2×2 system',
    skill: 'Eliminate one unknown, back-substitute, and check.',
    gen: (r) => {
      let A: number[][];
      do A = [[r.nz(-4, 4), r.int(-4, 4)], [r.int(-4, 4), r.nz(-4, 4)]];
      while (A[0][0] * A[1][1] - A[0][1] * A[1][0] === 0);
      const x = [r.int(-4, 5), r.int(-4, 5)];
      const b = A.map((row) => row[0] * x[0] + row[1] * x[1]);
      const D = A[0][0] * A[1][1] - A[0][1] * A[1][0];
      const Dx = b[0] * A[1][1] - A[0][1] * b[1];
      const Dy = A[0][0] * b[1] - b[0] * A[1][0];
      return {
        prompt: md`Solve $\begin{aligned} ${eq(A[0], b[0])} \\ ${eq(A[1], b[1])} \end{aligned}$. Enter $[x, y]$.`,
        answer: { kind: 'vector', value: x },
        solution: md`Elimination or Cramer's rule: $\det A = ${paren(A[0][0])}\cdot${paren(A[1][1])} - ${paren(A[0][1])}\cdot${paren(A[1][0])} = ${D}$, $x = ${Dx}/${paren(D)} = ${x[0]}$, $y = ${Dy}/${paren(D)} = ${x[1]}$. Check in the first equation: $${paren(A[0][0])}\cdot${paren(x[0])} + ${paren(A[0][1])}\cdot${paren(x[1])} = ${b[0]}$.`,
      };
    },
  },
  {
    id: 'la-inv2',
    module: 'la03',
    title: '2×2 inverses',
    skill: 'Swap the diagonal, negate the off-diagonal, divide by ad − bc.',
    gen: (r) => {
      let A: number[][], D: number;
      do {
        A = [[r.int(-4, 5), r.int(-4, 5)], [r.int(-4, 5), r.int(-4, 5)]];
        D = A[0][0] * A[1][1] - A[0][1] * A[1][0];
      } while (![1, -1, 2, -2, 4, -4].includes(D));
      const adj = [[A[1][1], -A[0][1]], [-A[1][0], A[0][0]]];
      const inv = adj.map((row) => row.map((v) => v / D));
      const fr = adj.map((row) => row.map((v) => new Frac(v, D).toTeX()));
      return {
        prompt: md`Find the inverse of $${bm(A)}$. Fractions such as \`1/2\` are fine.`,
        answer: { kind: 'matrix', value: inv },
        solution: md`$ad - bc = ${paren(A[0][0])}\cdot${paren(A[1][1])} - ${paren(A[0][1])}\cdot${paren(A[1][0])} = ${D}$. Then $A^{-1} = \frac{1}{${D}}${bm(adj)} = ${bm(fr)}$.`,
      };
    },
  },
  {
    id: 'la-elim3',
    module: 'la03',
    title: 'Elimination on a 3×3 system',
    skill: 'Reduce [A | b] to echelon form with row additions, then back-substitute.',
    gen: (r) => {
      // A = LU with unit lower L and integer U, so elimination needs no swaps and only integer multipliers
      const L = [[1, 0, 0], [r.int(-2, 2), 1, 0], [r.int(-2, 2), r.int(-2, 2), 1]];
      const U = [[r.pick([1, 1, 2, -1]), r.int(-2, 2), r.int(-2, 2)], [0, r.pick([1, 1, -1, 2]), r.int(-2, 2)], [0, 0, r.pick([1, -1, 2, 3])]];
      const A = L.map((row) => [0, 1, 2].map((j) => row.reduce((s, l, k) => s + l * U[k][j], 0)));
      const x = [r.int(-3, 3), r.int(-3, 3), r.int(-3, 3)];
      const b = A.map((row) => row.reduce((s, a, j) => s + a * x[j], 0));
      const aug = toFMat(A.map((row, i) => [...row, b[i]]));
      const { steps, result } = rrefSteps(aug, 3, false);
      const ops = steps.length ? steps.map((s) => `$${rowOpTeX(s.op)}$`).join(', ') : 'none needed';
      return {
        prompt: md`Solve by elimination: $\begin{aligned} ${eq(A[0], b[0])} \\ ${eq(A[1], b[1])} \\ ${eq(A[2], b[2])} \end{aligned}$. Enter $[x, y, z]$.`,
        answer: { kind: 'vector', value: x },
        solution: md`Row operations: ${ops}. Echelon form: $${fmatTeX(result, { augment: 3 })}$. Back-substitute from the bottom row: $z = ${x[2]}$, then $y = ${x[1]}$, then $x = ${x[0]}$.`,
      };
    },
  },
];
