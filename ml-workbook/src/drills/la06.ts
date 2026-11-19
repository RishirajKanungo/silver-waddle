import { md, type Drill } from '../content/types';

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
/** exact fraction n/d as TeX */
const fr = (n: number, d: number) => {
  if (d < 0) [n, d] = [-n, -d];
  const g = gcd(n, d) || 1;
  n /= g;
  d /= g;
  if (d === 1) return String(n);
  return `${n < 0 ? '-' : ''}\\tfrac{${Math.abs(n)}}{${d}}`;
};
const v = (xs: (number | string)[]) => `\\begin{bmatrix}${xs.join('\\\\')}\\end{bmatrix}`;
const m2 = (a: number[][]) => `\\begin{bmatrix}${a.map((r) => r.join('&')).join('\\\\')}\\end{bmatrix}`;
const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
const p = (x: number) => (x < 0 ? `(${x})` : String(x));

export const DRILLS: Drill[] = [
  {
    id: 'la-orth-coef',
    module: 'la06',
    title: 'Coefficients in an orthogonal basis',
    skill: 'Each coefficient is one dot product divided by a squared length; no system to solve.',
    gen: (r) => {
      const [a, b] = r.pick([[1, 1], [1, 2], [2, 1], [1, -1], [3, 1], [1, 3], [2, -1]] as const);
      const k = r.pick([1, 1, 2, -1]);
      const u1 = [a, b], u2 = [-b * k, a * k];
      let x = [r.int(-5, 6), r.int(-5, 6)];
      if (x[0] === 0 && x[1] === 0) x = [3, -2];
      const n1 = dot(x, u1), d1 = dot(u1, u1), n2 = dot(x, u2), d2 = dot(u2, u2);
      return {
        prompt: md`$\bu_1 = ${v(u1)}$ and $\bu_2 = ${v(u2)}$ are orthogonal. Find $c_1, c_2$ with $${v(x)} = c_1\bu_1 + c_2\bu_2$. Enter $[c_1, c_2]$; fractions are fine.`,
        answer: { kind: 'vector', value: [n1 / d1, n2 / d2] },
        solution: md`Check $\bu_1\cdot\bu_2 = ${p(a)}${p(-b * k)} + ${p(b)}${p(a * k)} = 0$. Then $c_i = \dfrac{\bx\cdot\bu_i}{\bu_i\cdot\bu_i}$: $c_1 = \dfrac{${n1}}{${d1}} = ${fr(n1, d1)}$ and $c_2 = \dfrac{${n2}}{${d2}} = ${fr(n2, d2)}$.`,
      };
    },
  },
  {
    id: 'la-lsq-line3',
    module: 'la06',
    title: 'Least-squares line through three points',
    skill: 'Form the 2×2 normal equations from sums and solve them exactly.',
    gen: (r) => {
      const xs = r.shuffle([-2, -1, 0, 1, 2, 3, 4]).slice(0, 3).sort((a, b) => a - b);
      const ys = xs.map(() => r.int(-3, 6));
      const n = 3;
      const Sx = xs.reduce((s, x) => s + x, 0), Sy = ys.reduce((s, y) => s + y, 0);
      const Sxx = xs.reduce((s, x) => s + x * x, 0), Sxy = xs.reduce((s, x, i) => s + x * ys[i], 0);
      const D = n * Sxx - Sx * Sx;
      const cN = Sxx * Sy - Sx * Sxy, mN = n * Sxy - Sx * Sy;
      const pts = xs.map((x, i) => `(${x}, ${ys[i]})`).join(', ');
      return {
        prompt: md`Fit $y = c + mx$ by least squares to the points ${pts}. Enter $[c, m]$; fractions are fine.`,
        answer: { kind: 'vector', value: [cN / D, mN / D] },
        solution: md`Sums: $n = 3$, $\sum x = ${Sx}$, $\sum x^2 = ${Sxx}$, $\sum y = ${Sy}$, $\sum xy = ${Sxy}$. Normal equations: $${m2([[3, Sx], [Sx, Sxx]])}${v(['c', 'm'])} = ${v([Sy, Sxy])}$. Determinant $3\cdot${Sxx} - ${p(Sx)}^2 = ${D}$. So $c = \dfrac{${Sxx}\cdot${p(Sy)} - ${p(Sx)}\cdot${p(Sxy)}}{${D}} = ${fr(cN, D)}$ and $m = \dfrac{3\cdot${p(Sxy)} - ${p(Sx)}\cdot${p(Sy)}}{${D}} = ${fr(mN, D)}$.`,
      };
    },
  },
  {
    id: 'la-normal-eq',
    module: 'la06',
    title: 'Normal equations for a 3×2 system',
    skill: 'Compute AᵀA and Aᵀb, then solve the 2×2 system for x̂.',
    gen: (r) => {
      let A: number[][] = [];
      let G: number[][] = [];
      let D = 0;
      do {
        A = [0, 1, 2].map(() => [r.int(-2, 2), r.int(-2, 2)]);
        const c1 = A.map((row) => row[0]), c2 = A.map((row) => row[1]);
        G = [[dot(c1, c1), dot(c1, c2)], [dot(c2, c1), dot(c2, c2)]];
        D = G[0][0] * G[1][1] - G[0][1] * G[1][0];
      } while (D === 0);
      const b = [r.int(-3, 4), r.int(-3, 4), r.int(-3, 4)];
      const c1 = A.map((row) => row[0]), c2 = A.map((row) => row[1]);
      const h = [dot(c1, b), dot(c2, b)];
      const x1N = G[1][1] * h[0] - G[0][1] * h[1], x2N = -G[1][0] * h[0] + G[0][0] * h[1];
      return {
        prompt: md`Let $A = ${m2(A)}$ and $\bb = ${v(b)}$. Solve the normal equations $A\T A\hat\bx = A\T\bb$. Enter $\hat\bx$; fractions are fine.`,
        answer: { kind: 'vector', value: [x1N / D, x2N / D] },
        solution: md`$A\T A = ${m2(G)}$ (dot products of the columns) and $A\T\bb = ${v(h)}$. $\det A\T A = ${D}$, so $\hat\bx = \dfrac{1}{${D}}${m2([[G[1][1], -G[0][1]], [-G[1][0], G[0][0]]])}${v(h)} = ${v([fr(x1N, D), fr(x2N, D)])}$.`,
      };
    },
  },
  {
    id: 'la-gs-step',
    module: 'la06',
    title: 'One Gram–Schmidt step',
    skill: 'Subtract the projection: e₂ = a₂ − (a₁·a₂ / a₁·a₁) a₁.',
    gen: (r) => {
      let a1 = [r.int(-2, 2), r.int(-2, 2), r.int(-2, 2)];
      if (a1.every((x) => x === 0)) a1 = [1, 1, 0];
      let a2 = [r.int(-3, 3), r.int(-3, 3), r.int(-3, 3)];
      // keep a2 independent of a1
      const cr = [a1[1] * a2[2] - a1[2] * a2[1], a1[2] * a2[0] - a1[0] * a2[2], a1[0] * a2[1] - a1[1] * a2[0]];
      if (cr.every((x) => x === 0)) a2 = [a1[1] || 1, -a1[0], a1[2] + 1];
      const n = dot(a1, a2), d = dot(a1, a1);
      const e2 = a2.map((x, i) => x - (n / d) * a1[i]);
      return {
        prompt: md`Gram–Schmidt on $\ba_1 = ${v(a1)}$, $\ba_2 = ${v(a2)}$: compute $\be_2 = \ba_2 - \dfrac{\ba_1\cdot\ba_2}{\ba_1\cdot\ba_1}\ba_1$ (before normalizing). Fractions are fine.`,
        answer: { kind: 'vector', value: e2 },
        solution: md`$\ba_1\cdot\ba_2 = ${n}$ and $\ba_1\cdot\ba_1 = ${d}$, so $\be_2 = ${v(a2)} - ${fr(n, d)}${v(a1)} = ${v(a2.map((x, i) => fr(x * d - n * a1[i], d)))}$. Check: $\be_2\cdot\ba_1 = 0$.`,
      };
    },
  },
];
