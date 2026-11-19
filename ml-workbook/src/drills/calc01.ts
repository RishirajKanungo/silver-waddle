import { md, type Drill } from '../content/types';

const paren = (x: number) => (x < 0 ? `(${x})` : String(x));
const bm = (rows: number[][]) => `\\begin{bmatrix}${rows.map((r) => r.join('&')).join('\\\\')}\\end{bmatrix}`;
const col = (xs: number[]) => `\\begin{bmatrix}${xs.join('\\\\')}\\end{bmatrix}`;

/** a polynomial from [coefficient, monomial TeX] pairs, skipping zero terms */
function poly(terms: [number, string][]): string {
  let s = '';
  for (const [c, m] of terms) {
    if (c === 0) continue;
    const a = Math.abs(c);
    const body = m === '' ? String(a) : a === 1 ? m : `${a}${m}`;
    s += s === '' ? (c < 0 ? '-' : '') + body : c < 0 ? ` - ${body}` : ` + ${body}`;
  }
  return s || '0';
}

export const DRILLS: Drill[] = [
  {
    id: 'calc-grad2',
    module: 'calc01',
    title: 'Gradient at a point',
    skill: 'Differentiate with respect to one variable while holding the other fixed, then evaluate.',
    gen: (r) => {
      const a = r.pick([1, 1, 2, -1]), b = r.int(-3, 3), c = r.int(-2, 2), d = r.int(-4, 4);
      const x = r.nz(-2, 2), y = r.int(-2, 2);
      const gx = 2 * a * x * y + b * y + d;
      const gy = a * x * x + b * x + 2 * c * y;
      const f = poly([[a, 'x^2y'], [b, 'xy'], [c, 'y^2'], [d, 'x']]);
      return {
        prompt: md`Compute $\nabla f(${x}, ${y})$ for $f(x, y) = ${f}$.`,
        answer: { kind: 'vector', value: [gx, gy] },
        inputHint: '[df/dx, df/dy]',
        solution: md`$\pd{f}{x} = ${poly([[2 * a, 'xy'], [b, 'y'], [d, '']])}$ and $\pd{f}{y} = ${poly([[a, 'x^2'], [b, 'x'], [2 * c, 'y']])}$. At $(${x}, ${y})$: $\pd{f}{x} = ${gx}$, $\pd{f}{y} = ${gy}$, so $\nabla f = (${gx}, ${gy})$.`,
      };
    },
  },
  {
    id: 'calc-dirderiv',
    module: 'calc01',
    title: 'Directional derivative',
    skill: 'Normalize the direction, then dot it with the gradient.',
    gen: (r) => {
      const a = r.nz(-2, 3), b = r.nz(-2, 3);
      const x = r.int(-2, 2), y = r.int(-2, 2);
      const [p, q, n] = r.pick([[3, 4, 5], [4, 3, 5], [5, 12, 13], [12, 5, 13], [6, 8, 10], [8, 6, 10]] as const);
      const v = [p * r.pick([1, -1]), q * r.pick([1, -1])];
      const g = [2 * a * x, 2 * b * y];
      const num = g[0] * v[0] + g[1] * v[1];
      return {
        prompt: md`Let $f(x, y) = ${poly([[a, 'x^2'], [b, 'y^2']])}$. Compute the directional derivative of $f$ at $(${x}, ${y})$ in the direction of $\bv = (${v[0]}, ${v[1]})$. Fractions are fine.`,
        answer: { kind: 'number', value: num / n },
        solution: md`$\nabla f = (${2 * a}x, ${2 * b}y) = (${g[0]}, ${g[1]})$. $\lVert\bv\rVert = ${n}$, so $\bu = (${v[0]}, ${v[1]})/${n}$. $D_\bu f = \dfrac{${paren(g[0])}${paren(v[0])} + ${paren(g[1])}${paren(v[1])}}{${n}} = \dfrac{${num}}{${n}}${Number.isInteger(num / n) ? '' : ` \\approx ${(num / n).toFixed(3)}`}$.`,
      };
    },
  },
  {
    id: 'calc-chain',
    module: 'calc01',
    title: 'Chain rule through a squared error',
    skill: 'Backpropagate (upstream adjoint) × (local derivative) through L = (wx + b − y)².',
    gen: (r) => {
      const w = r.int(-3, 3), b = r.int(-3, 3), x = r.nz(-3, 3), y = r.int(-4, 4);
      const z = w * x + b, e = z - y;
      return {
        prompt: md`Let $z = wx + b$ and $L = (z - y)^2$. At $w = ${w}$, $b = ${b}$, $x = ${x}$, $y = ${y}$, compute $\left(\pd{L}{w}, \pd{L}{b}\right)$.`,
        answer: { kind: 'vector', value: [2 * e * x, 2 * e] },
        inputHint: '[dL/dw, dL/db]',
        solution: md`Forward: $z = ${paren(w)}\cdot${paren(x)} + ${paren(b)} = ${z}$, error $z - y = ${e}$. Backward: $\pd{L}{z} = 2(z - y) = ${2 * e}$. Then $\pd{L}{w} = \pd{L}{z}\,x = ${2 * e}\cdot${paren(x)} = ${2 * e * x}$ and $\pd{L}{b} = \pd{L}{z}\cdot 1 = ${2 * e}$.`,
      };
    },
  },
  {
    id: 'calc-quadgrad',
    module: 'calc01',
    title: 'Gradient of a quadratic form',
    skill: 'Use ∇(xᵀAx) = (A + Aᵀ)x, and do not use 2Ax when A is not symmetric.',
    gen: (r) => {
      const A = [[r.int(-3, 3), r.int(-3, 3)], [r.int(-3, 3), r.int(-3, 3)]];
      const x = [r.int(-2, 2), r.nz(-2, 2)];
      const S = [[2 * A[0][0], A[0][1] + A[1][0]], [A[0][1] + A[1][0], 2 * A[1][1]]];
      const g = [S[0][0] * x[0] + S[0][1] * x[1], S[1][0] * x[0] + S[1][1] * x[1]];
      return {
        prompt: md`Let $A = ${bm(A)}$ and $\bx = ${col(x)}$. Compute $\nabla_\bx(\bx\T A\bx)$.`,
        answer: { kind: 'vector', value: g },
        solution: md`$A + A\T = ${bm(S)}$, so $\nabla(\bx\T A\bx) = (A + A\T)\bx = ${col(g)}$.${A[0][1] !== A[1][0] ? ' $A$ is not symmetric, so $2A\\bx$ would be wrong.' : ''}`,
      };
    },
  },
];
