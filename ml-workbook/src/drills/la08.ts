import { md, type Drill } from '../content/types';

const v = (xs: (number | string)[]) => `\\begin{bmatrix}${xs.join('\\\\')}\\end{bmatrix}`;
const m2 = (a: number[][]) => `\\begin{bmatrix}${a.map((r) => r.join('&')).join('\\\\')}\\end{bmatrix}`;
const p = (x: number) => (x < 0 ? `(${x})` : String(x));
const sq = (n: number) => {
  const s = Math.round(Math.sqrt(n));
  return s * s === n ? String(s) : `\\sqrt{${n}}`;
};

export const DRILLS: Drill[] = [
  {
    id: 'la-sv2',
    module: 'la08',
    title: 'Singular values of a 2×2 matrix',
    skill: 'σᵢ = √λᵢ(AᵀA); spot the shortcuts (diagonal, orthogonal columns, rank 1).',
    gen: (r) => {
      const type = r.pick(['diag', 'orth', 'rank1'] as const);
      if (type === 'diag') {
        const a = r.nz(-6, 6), b = r.nz(-6, 6);
        const anti = r.pick([false, true]);
        const A = anti ? [[0, a], [b, 0]] : [[a, 0], [0, b]];
        return {
          prompt: md`Find the singular values of $${m2(A)}$.`,
          answer: { kind: 'set', value: [Math.abs(a), Math.abs(b)] },
          solution: md`$A\T A = ${m2(anti ? [[b * b, 0], [0, a * a]] : [[a * a, 0], [0, b * b]])}$ is diagonal, so $\sigma = ${Math.abs(a)}, ${Math.abs(b)}$ (absolute values, largest first). Signs ${anti ? 'and the swap of coordinates ' : ''}go into $U$ and $V$.`,
        };
      }
      if (type === 'orth') {
        const [a, b, n] = r.pick([[3, 4, 5], [4, 3, 5], [6, 8, 10], [5, 12, 13], [1, 0, 1], [0, 1, 1], [8, 6, 10]] as const);
        const s = r.pick([1, 2, -1]), t = r.pick([1, -1, 2, 3]);
        const A = [[s * a, -t * b], [s * b, t * a]];
        return {
          prompt: md`Find the singular values of $${m2(A)}$.`,
          answer: { kind: 'set', value: [Math.abs(s) * n, Math.abs(t) * n] },
          solution: md`The columns are orthogonal: $${p(s * a)}\cdot${p(-t * b)} + ${p(s * b)}\cdot${p(t * a)} = 0$. So $A\T A$ is diagonal with the squared column lengths, and the singular values are the column lengths: $${Math.abs(s) * n}$ and $${Math.abs(t) * n}$.`,
        };
      }
      let u = [r.int(-3, 3), r.int(-3, 3)], w = [r.int(-3, 3), r.int(-3, 3)];
      if (u[0] === 0 && u[1] === 0) u = [1, 2];
      if (w[0] === 0 && w[1] === 0) w = [2, -1];
      const A = [[u[0] * w[0], u[0] * w[1]], [u[1] * w[0], u[1] * w[1]]];
      const nu = u[0] ** 2 + u[1] ** 2, nw = w[0] ** 2 + w[1] ** 2;
      return {
        prompt: md`Find the singular values of $${m2(A)}$. You can type \`sqrt(...)\`.`,
        answer: { kind: 'set', value: [Math.sqrt(nu * nw), 0] },
        solution: md`The rows are multiples of each other: $A = ${v(u)}${m2([w])}$, rank 1. Then $\sigma_1 = \lVert\bu\rVert\,\lVert\bw\rVert = \sqrt{${nu}}\sqrt{${nw}} = ${sq(nu * nw)}$ and $\sigma_2 = 0$. Check: $\sigma_1^2 = ${nu * nw}$ is the sum of the squared entries, $\lVert A\rVert_F^2$.`,
      };
    },
  },
  {
    id: 'la-lowrank-err',
    module: 'la08',
    title: 'Error of the best rank-k approximation',
    skill: 'Eckart–Young: spectral error σ_{k+1}, Frobenius error √(Σ_{i>k} σᵢ²).',
    gen: (r) => {
      const s = [r.int(8, 15), r.int(4, 7), r.int(2, 3), r.int(0, 1)];
      const k = r.pick([1, 2]);
      const which = r.pick(['spectral', 'Frobenius'] as const);
      const tail = s.slice(k).reduce((t, x) => t + x * x, 0);
      const val = which === 'spectral' ? s[k] : Math.sqrt(tail);
      return {
        prompt: md`A matrix has singular values $${s.join(', ')}$. What is the ${which}-norm error $\lVert A - A_${k}\rVert_${which === 'spectral' ? '2' : 'F'}$ of its best rank-${k} approximation? You can type \`sqrt(...)\`.`,
        answer: { kind: 'number', value: val },
        solution:
          which === 'spectral'
            ? md`The spectral error is the first discarded singular value: $\sigma_${k + 1} = ${s[k]}$.`
            : md`The Frobenius error is the root of the sum of the discarded squares: $\sqrt{${s.slice(k).map((x) => x + '^2').join(' + ')}} = ${sq(tail)}$${Number.isInteger(Math.sqrt(tail)) ? '' : ` \\approx ${Math.sqrt(tail).toFixed(3)}`}.`,
      };
    },
  },
  {
    id: 'la-evr',
    module: 'la08',
    title: 'Explained variance from a covariance matrix',
    skill: 'Eigenvalues of a 2×2 covariance, then λ₁ / (λ₁ + λ₂).',
    gen: (r) => {
      const a = r.int(2, 9);
      const b = r.int(-(a - 1), a - 1);
      const diag = r.pick([false, false, true]);
      const C = diag ? [[a, 0], [0, r.int(1, 9)]] : [[a, b], [b, a]];
      const l = diag ? [C[0][0], C[1][1]].sort((x, y) => y - x) : [a + Math.abs(b), a - Math.abs(b)];
      return {
        prompt: md`Data have covariance matrix $C = ${m2(C)}$. What fraction of the variance does the first principal component explain? Fractions are fine.`,
        answer: { kind: 'number', value: l[0] / (l[0] + l[1]) },
        solution: diag
          ? md`$C$ is diagonal, so the principal directions are the axes and the variances are the diagonal entries $${l[0]}$ and $${l[1]}$. $\text{EVR}_1 = \dfrac{${l[0]}}{${l[0] + l[1]}}$.`
          : md`For $\begin{bmatrix} a & b \\ b & a \end{bmatrix}$ the eigenvalues are $a \pm b$, with eigenvectors $(1, \pm1)$: here $${l[0]}$ and $${l[1]}$. $\text{EVR}_1 = \dfrac{${l[0]}}{${l[0]} + ${l[1]}} = \dfrac{${l[0]}}{${2 * a}}$ (the total variance is $\tr C = ${2 * a}$).`,
      };
    },
  },
  {
    id: 'la-lora-params',
    module: 'la08',
    title: 'LoRA parameter counts',
    skill: 'A rank-r update of a d×k matrix trains r(d + k) parameters.',
    gen: (r) => {
      const d = r.pick([512, 768, 1024, 2048, 4096]);
      const k = r.pick([d, d, 4 * d, 2048, 4096]);
      const rr = r.pick([4, 8, 16, 32, 64]);
      return {
        prompt: md`A LoRA adapter of rank $r = ${rr}$ is added to a $${d}\times${k}$ weight matrix. How many trainable parameters does it have?`,
        answer: { kind: 'number', value: rr * (d + k) },
        solution: md`$B$ is $${d}\times${rr}$ and $A$ is $${rr}\times${k}$, so $r(d + k) = ${rr}\cdot${d + k} = ${rr * (d + k)}$, about $${((100 * rr * (d + k)) / (d * k)).toFixed(2)}\%$ of the $${d * k}$ entries of the full matrix.`,
      };
    },
  },
];
