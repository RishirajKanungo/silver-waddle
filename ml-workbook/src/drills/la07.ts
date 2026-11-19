import { md, type Drill } from '../content/types';

const v = (xs: (number | string)[]) => `\\begin{bmatrix}${xs.join('\\\\')}\\end{bmatrix}`;
const m2 = (a: number[][]) => `\\begin{bmatrix}${a.map((r) => r.join('&')).join('\\\\')}\\end{bmatrix}`;
const p = (x: number) => (x < 0 ? `(${x})` : String(x));
const sgn = (x: number) => (x < 0 ? `- ${-x}` : `+ ${x}`);
/** λ² − tλ + d with zero terms dropped and unit coefficients hidden */
const charPoly = (t: number, d: number) => {
  let s = '\\lambda^2';
  if (t !== 0) s += ` ${-t < 0 ? '-' : '+'} ${Math.abs(t) === 1 ? '' : Math.abs(t)}\\lambda`;
  if (d !== 0) s += ` ${sgn(d)}`;
  return s;
};
/** (λ − l) as TeX, or just λ when l = 0 */
const factor = (l: number) => (l === 0 ? '\\lambda' : `(\\lambda ${sgn(-l)})`);

/** Integer matrices with determinant ±1, so P D P⁻¹ has integer entries. */
const UNIMOD: number[][][] = [
  [[1, 1], [0, 1]],
  [[1, 0], [1, 1]],
  [[1, 1], [1, 2]],
  [[2, 1], [1, 1]],
  [[1, 2], [1, 3]],
  [[1, -1], [1, 0]],
  [[1, 1], [-1, 0]],
  [[1, 2], [0, 1]],
  [[2, 1], [3, 2]],
  [[1, -1], [-1, 2]],
];

/** A = P diag(l1, l2) P⁻¹ with small integer entries and distinct integer eigenvalues. */
function eigMatrix(r: import('../math/rng').Rng) {
  for (;;) {
    const P = r.pick(UNIMOD);
    const l1 = r.int(-3, 6);
    let l2 = r.int(-3, 6);
    if (l2 === l1) l2 = l1 - r.pick([1, 2, 3]);
    const d = P[0][0] * P[1][1] - P[0][1] * P[1][0]; // ±1
    const Pi = [[P[1][1] * d, -P[0][1] * d], [-P[1][0] * d, P[0][0] * d]];
    const PD = [[P[0][0] * l1, P[0][1] * l2], [P[1][0] * l1, P[1][1] * l2]];
    const A = [0, 1].map((i) => [0, 1].map((j) => PD[i][0] * Pi[0][j] + PD[i][1] * Pi[1][j]));
    if (A.flat().every((x) => Math.abs(x) <= 12)) return { A, P, l1, l2 };
  }
}

export const DRILLS: Drill[] = [
  {
    id: 'la-eig2',
    module: 'la07',
    title: 'Eigenvalues of a 2×2 matrix',
    skill: 'Trace and determinant, then factor λ² − (tr A)λ + det A.',
    gen: (r) => {
      const { A, l1, l2 } = eigMatrix(r);
      const tr = A[0][0] + A[1][1], dt = A[0][0] * A[1][1] - A[0][1] * A[1][0];
      return {
        prompt: md`Find the eigenvalues of $${m2(A)}$.`,
        answer: { kind: 'set', value: [l1, l2] },
        inputHint: 'two numbers, e.g. 3, -1',
        solution: md`$\tr A = ${tr}$ and $\det A = ${p(A[0][0])}${p(A[1][1])} - ${p(A[0][1])}${p(A[1][0])} = ${dt}$. So $${charPoly(tr, dt)} = 0$, which factors as $${factor(l1)}${factor(l2)} = 0$:$\lambda = ${l1}, ${l2}$. Check: sum $${l1 + l2}$, product $${l1 * l2}$.`,
      };
    },
  },
  {
    id: 'la-eigvec2',
    module: 'la07',
    title: 'An eigenvector for a given eigenvalue',
    skill: 'Solve (A − λI)v = 0 from one nonzero row: (p, q) gives v = (q, −p).',
    gen: (r) => {
      const { A, P, l1 } = eigMatrix(r);
      const M = [[A[0][0] - l1, A[0][1]], [A[1][0], A[1][1] - l1]];
      const row = M[0][0] !== 0 || M[0][1] !== 0 ? M[0] : M[1];
      return {
        prompt: md`$\lambda = ${l1}$ is an eigenvalue of $A = ${m2(A)}$. Give an eigenvector (any nonzero multiple counts).`,
        answer: { kind: 'vector', value: [P[0][0], P[1][0]], upToScale: true },
        solution: md`$A - ${p(l1)}I = ${m2(M)}$. Its rows are multiples of each other. The row $(${row[0]}, ${row[1]})$ says $${row[0]}v_1 ${sgn(row[1])}v_2 = 0$, so $\bv = ${v([row[1], -row[0]])}$, a multiple of $${v([P[0][0], P[1][0]])}$. Check: $A\bv = ${p(l1)}\bv$.`,
      };
    },
  },
  {
    id: 'la-definite',
    module: 'la07',
    title: 'Definiteness of a symmetric 2×2 matrix',
    skill: 'Use the sign of a (or c) and of det = ac − b² to classify.',
    gen: (r) => {
      const kind = r.pick(['PD', 'PD', 'PSD', 'indefinite', 'indefinite', 'ND', 'NSD'] as const);
      let a = 0, b = 0, c = 0;
      if (kind === 'PSD' || kind === 'NSD') {
        const s = r.nz(-3, 3), t = r.nz(-2, 2), k = r.pick([1, 1, 2]);
        [a, b, c] = [k * s * s, k * s * t, k * t * t];
        if (kind === 'NSD') [a, b, c] = [-a, -b, -c];
      } else {
        for (;;) {
          a = r.nz(-5, 5);
          b = r.int(-4, 4);
          c = r.nz(-5, 5);
          const d = a * c - b * b;
          if (kind === 'PD' && a > 0 && d > 0) break;
          if (kind === 'ND' && a < 0 && d > 0) break;
          if (kind === 'indefinite' && d < 0) break;
        }
      }
      const d = a * c - b * b;
      const names: Record<string, string[]> = {
        PD: ['PD', 'positive definite'],
        PSD: ['PSD', 'positive semidefinite'],
        ND: ['ND', 'negative definite'],
        NSD: ['NSD', 'negative semidefinite'],
        indefinite: ['indefinite'],
      };
      const why =
        kind === 'PD'
          ? `$a = ${a} > 0$ and $\\det = ${d} > 0$: both eigenvalues positive.`
          : kind === 'ND'
            ? `$a = ${a} < 0$ and $\\det = ${d} > 0$: both eigenvalues negative.`
            : kind === 'indefinite'
              ? `$\\det = ${d} < 0$: the eigenvalues have opposite signs.`
              : `$\\det = 0$, so one eigenvalue is $0$; the other is $\\tr A = ${a + c}$, which is ${a + c > 0 ? 'positive' : 'negative'}.`;
      return {
        prompt: md`Classify $A = ${m2([[a, b], [b, c]])}$. Type one of PD, PSD, ND, NSD, indefinite (the strongest that applies).`,
        answer: { kind: 'text', value: names[kind] },
        inputHint: 'PD, PSD, ND, NSD or indefinite',
        solution: md`$\det A = ${p(a)}${p(c)} - ${p(b)}^2 = ${d}$. ${why} Answer: **${kind}**.`,
      };
    },
  },
  {
    id: 'la-stationary2',
    module: 'la07',
    title: 'Stationary distribution of a two-state chain',
    skill: 'Solve (M − I)π = 0 and normalize so the entries sum to 1.',
    gen: (r) => {
      const pp = r.int(1, 9) / 10, q = r.int(1, 9) / 10;
      const M = [[Math.round((1 - pp) * 10) / 10, q], [pp, Math.round((1 - q) * 10) / 10]];
      return {
        prompt: md`Find the stationary distribution of the Markov matrix $M = ${m2(M)}$ (columns sum to 1). Fractions are fine.`,
        answer: { kind: 'vector', value: [q / (pp + q), pp / (pp + q)] },
        solution: md`Row 1 of $(M - I)\boldsymbol\pi = \bzero$: $-${pp}\,\pi_1 + ${q}\,\pi_2 = 0$, so $\pi_1 : \pi_2 = ${q} : ${pp}$. Normalizing, $\boldsymbol\pi = \left(\dfrac{${q}}{${Math.round((pp + q) * 10) / 10}}, \dfrac{${pp}}{${Math.round((pp + q) * 10) / 10}}\right) \approx (${(q / (pp + q)).toFixed(4)}, ${(pp / (pp + q)).toFixed(4)})$.`,
      };
    },
  },
];
