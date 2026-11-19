import { md, type Drill } from '../content/types';
import { toFMat, rrefSteps, fmatTeX } from '../math/frac';

const bm = (A: number[][]) => `\\begin{bmatrix} ${A.map((r) => r.join(' & ')).join(' \\\\ ')} \\end{bmatrix}`;
const bv = (v: number[]) => `\\begin{bmatrix} ${v.join(' \\\\ ')} \\end{bmatrix}`;
const paren = (x: number) => (x < 0 ? `(${x})` : String(x));
const comb = (a: number, u: number[], b: number, v: number[]) => u.map((x, i) => a * x + b * v[i]);

export const DRILLS: Drill[] = [
  {
    id: 'la-rank',
    module: 'la04',
    title: 'Rank of a small matrix',
    skill: 'Reduce to echelon form and count the pivots.',
    gen: (r) => {
      const n = r.pick([3, 4]);
      const row = () => Array.from({ length: n }, () => r.int(-3, 3));
      let r1 = row();
      while (r1.every((x) => x === 0)) r1 = row();
      const target = r.pick([1, 2, 2, 3]);
      const r2 = target === 1 ? r1.map((x) => r.nz(-2, 2) * x) : row();
      const r3 = target === 3 ? row() : comb(r.int(-2, 2), r1, r.int(-2, 2), r2);
      const A = r.shuffle([r1, r2, r3]);
      const { result, pivots } = rrefSteps(toFMat(A));
      return {
        prompt: md`What is the rank of $${bm(A)}$?`,
        answer: { kind: 'number', value: pivots.length },
        solution: md`The reduced row echelon form is $${fmatTeX(result)}$, with ${pivots.length} pivot${pivots.length === 1 ? '' : 's'} (columns ${pivots.map((p) => p[1] + 1).join(', ')}). So the rank is ${pivots.length}.`,
      };
    },
  },
  {
    id: 'la-nullvec',
    module: 'la04',
    title: 'A null-space vector',
    skill: 'Spot a dependence among the columns and turn it into a vector with Ax = 0.',
    gen: (r) => {
      let c1: number[], c2: number[];
      do {
        c1 = [r.int(-3, 3), r.int(-3, 3), r.int(-3, 3)];
        c2 = [r.int(-3, 3), r.int(-3, 3), r.int(-3, 3)];
      } while (c1[1] * c2[2] - c1[2] * c2[1] === 0 && c1[2] * c2[0] - c1[0] * c2[2] === 0 && c1[0] * c2[1] - c1[1] * c2[0] === 0);
      const a = r.nz(-2, 2), b = r.nz(-2, 2);
      const c3 = comb(a, c1, b, c2);
      const A = [0, 1, 2].map((i) => [c1[i], c2[i], c3[i]]);
      return {
        prompt: md`The matrix $A = ${bm(A)}$ has rank 2. Find a nonzero $\bx$ with $A\bx = \bzero$.`,
        answer: { kind: 'vector', value: [a, b, -1], upToScale: true },
        solution: md`Column 3 equals $${paren(a)}\cdot$(column 1) $+ ${paren(b)}\cdot$(column 2): $${paren(a)}${bv(c1)} + ${paren(b)}${bv(c2)} = ${bv(c3)}$. So $${paren(a)}\ba_1 + ${paren(b)}\ba_2 - \ba_3 = \bzero$, i.e. $\bx = (${a}, ${b}, -1)$, or any nonzero multiple.`,
      };
    },
  },
  {
    id: 'la-coords',
    module: 'la04',
    title: 'Coordinates in a basis',
    skill: 'Solve Bc = x to write x in the basis given by the columns of B.',
    gen: (r) => {
      let B: number[][], D: number;
      do {
        B = [[r.int(-3, 3), r.int(-3, 3)], [r.int(-3, 3), r.int(-3, 3)]];
        D = B[0][0] * B[1][1] - B[0][1] * B[1][0];
      } while (D !== 1 && D !== -1);
      const c = [r.int(-3, 3), r.int(-3, 3)];
      const x = [B[0][0] * c[0] + B[0][1] * c[1], B[1][0] * c[0] + B[1][1] * c[1]];
      const b1 = [B[0][0], B[1][0]], b2 = [B[0][1], B[1][1]];
      return {
        prompt: md`Find the coordinates of $\bx = ${bv(x)}$ in the basis $\bb_1 = ${bv(b1)}$, $\bb_2 = ${bv(b2)}$.`,
        answer: { kind: 'vector', value: c },
        solution: md`Solve $c_1\bb_1 + c_2\bb_2 = \bx$. With $\det B = ${D}$, $B^{-1} = ${D === 1 ? '' : '-'}${bm([[B[1][1], -B[0][1]], [-B[1][0], B[0][0]]])}$, so $\bc = B^{-1}\bx = ${bv(c)}$. Check: $${paren(c[0])}${bv(b1)} + ${paren(c[1])}${bv(b2)} = ${bv(x)}$.`,
      };
    },
  },
];
