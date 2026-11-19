import { md, type Drill } from '../content/types';
import type { Rng } from '../math/rng';

const bm = (A: number[][]) => `\\begin{bmatrix} ${A.map((r) => r.join(' & ')).join(' \\\\ ')} \\end{bmatrix}`;
const bv = (v: number[]) => `\\begin{bmatrix} ${v.join(' \\\\ ')} \\end{bmatrix}`;
const paren = (x: number) => (x < 0 ? `(${x})` : String(x));
const mat = (r: Rng, m: number, n: number, lo = -3, hi = 4) => Array.from({ length: m }, () => Array.from({ length: n }, () => r.int(lo, hi)));

export const DRILLS: Drill[] = [
  {
    id: 'la-matvec',
    module: 'la02',
    title: 'Matrix–vector products',
    skill: 'Compute Ax row by row, and check it against the column view.',
    gen: (r) => {
      const [m, n] = r.pick([[2, 2], [2, 3], [3, 2], [3, 3]] as const);
      const A = mat(r, m, n);
      const x = Array.from({ length: n }, () => r.int(-3, 3));
      const y = A.map((row) => row.reduce((s, a, j) => s + a * x[j], 0));
      return {
        prompt: md`Compute $${bm(A)}${bv(x)}$.`,
        answer: { kind: 'vector', value: y },
        solution: md`Row view: ${A.map((row, i) => `entry ${i + 1} is $${row.map((a, j) => `${paren(a)}\\cdot${paren(x[j])}`).join(' + ')} = ${y[i]}$`).join('; ')}. Column view: $${x.map((xj, j) => `${paren(xj)}${bv(A.map((row) => row[j]))}`).join(' + ')} = ${bv(y)}$.`,
      };
    },
  },
  {
    id: 'la-matmul2',
    module: 'la02',
    title: '2×2 matrix products',
    skill: 'Multiply 2×2 matrices without slips: row of the left times column of the right.',
    gen: (r) => {
      const A = mat(r, 2, 2, -3, 4);
      const B = mat(r, 2, 2, -3, 4);
      const C = A.map((row) => [0, 1].map((j) => row[0] * B[0][j] + row[1] * B[1][j]));
      const e = (i: number, j: number) => `$c_{${i + 1}${j + 1}} = ${paren(A[i][0])}\\cdot${paren(B[0][j])} + ${paren(A[i][1])}\\cdot${paren(B[1][j])} = ${C[i][j]}$`;
      return {
        prompt: md`Compute $${bm(A)}${bm(B)}$.`,
        answer: { kind: 'matrix', value: C },
        solution: md`${e(0, 0)}, ${e(0, 1)}, ${e(1, 0)}, ${e(1, 1)}. So the product is $${bm(C)}$.`,
      };
    },
  },
  {
    id: 'la-shapes',
    module: 'la02',
    title: 'Shapes of products',
    skill: 'Say the shape of a product before computing it: (m×n)(n×p) = m×p.',
    gen: (r) => {
      const d = () => r.pick([2, 3, 4, 5, 8, 16, 32, 64, 128]);
      const t = r.int(0, 4);
      const m = d(), n = d();
      let p = d();
      while (p === n) p = d();
      const sh = (a: number | string, b: number | string) => `${a}\\times ${b}`;
      if (t === 0)
        return { prompt: md`$A$ is $${sh(m, n)}$ and $B$ is $${sh(n, p)}$. What is the shape of $AB$? Enter rows, columns.`, answer: { kind: 'vector', value: [m, p] }, solution: md`$(${sh(m, n)})(${sh(n, p)})$: the inner sizes match and disappear, leaving $${sh(m, p)}$.`, inputHint: 'rows, cols' };
      if (t === 1)
        return { prompt: md`$A$ is $${sh(m, n)}$ and $B$ is $${sh(p, n)}$. What is the shape of $AB\T$? Enter rows, columns.`, answer: { kind: 'vector', value: [m, p] }, solution: md`$B\T$ is $${sh(n, p)}$, so $AB\T$ is $(${sh(m, n)})(${sh(n, p)}) = ${sh(m, p)}$. ($AB$ itself is undefined, since $${n} \neq ${p}$.)`, inputHint: 'rows, cols' };
      if (t === 2)
        return { prompt: md`A batch $X$ has shape $${sh(m, n)}$ (batch size $${m}$, $d_{in} = ${n}$) and a linear layer has weight $W$ of shape $${sh(p, n)}$. What is the shape of $XW\T$? Enter rows, columns.`, answer: { kind: 'vector', value: [m, p] }, solution: md`$(${sh(m, n)})(${sh(n, p)}) = ${sh(m, p)}$: one $${p}$-dimensional output per example.`, inputHint: 'rows, cols' };
      if (t === 3)
        return { prompt: md`$A$ is $${sh(m, n)}$. What is the shape of $A\T A$? Enter rows, columns.`, answer: { kind: 'vector', value: [n, n] }, solution: md`$(${sh(n, m)})(${sh(m, n)}) = ${sh(n, n)}$. ($AA\T$ would be $${sh(m, m)}$.)`, inputHint: 'rows, cols' };
      return { prompt: md`A linear layer maps $${n}$ inputs to $${p}$ outputs, with bias. How many parameters does it have?`, answer: { kind: 'number', value: n * p + p }, solution: md`$W$ is $${sh(p, n)}$: $${n * p}$ weights, plus $${p}$ biases, total $${n * p + p}$.` };
    },
  },
];
