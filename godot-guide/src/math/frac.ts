// Exact rational arithmetic (bigint numerator/denominator), used for row reduction,
// drills and anything a learner computes by hand: answers stay as 1/3, never 0.333….

const gcd = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};

export class Frac {
  readonly n: bigint;
  readonly d: bigint;
  constructor(n: bigint | number, d: bigint | number = 1n) {
    let N = BigInt(n), D = BigInt(d);
    if (D === 0n) throw new Error('division by zero');
    if (D < 0n) {
      N = -N;
      D = -D;
    }
    const g = gcd(N, D) || 1n;
    this.n = N / g;
    this.d = D / g;
  }
  static of(x: Frac | number | string): Frac {
    if (x instanceof Frac) return x;
    if (typeof x === 'string') {
      const [a, b] = x.split('/');
      return new Frac(BigInt(a.trim()), b ? BigInt(b.trim()) : 1n);
    }
    if (Number.isInteger(x)) return new Frac(BigInt(x));
    // decimals: exact for terminating decimals written by authors (0.5, 1.25)
    const s = String(x);
    const m = /^(-?)(\d+)\.(\d+)$/.exec(s);
    if (m) return new Frac(BigInt(m[1] + m[2] + m[3]), 10n ** BigInt(m[3].length));
    throw new Error('cannot convert ' + s + ' to a fraction');
  }
  add(o: Frac | number) {
    const b = Frac.of(o);
    return new Frac(this.n * b.d + b.n * this.d, this.d * b.d);
  }
  sub(o: Frac | number) {
    const b = Frac.of(o);
    return new Frac(this.n * b.d - b.n * this.d, this.d * b.d);
  }
  mul(o: Frac | number) {
    const b = Frac.of(o);
    return new Frac(this.n * b.n, this.d * b.d);
  }
  div(o: Frac | number) {
    const b = Frac.of(o);
    return new Frac(this.n * b.d, this.d * b.n);
  }
  neg() {
    return new Frac(-this.n, this.d);
  }
  inv() {
    return new Frac(this.d, this.n);
  }
  isZero() {
    return this.n === 0n;
  }
  isOne() {
    return this.n === 1n && this.d === 1n;
  }
  isInt() {
    return this.d === 1n;
  }
  sign() {
    return this.n > 0n ? 1 : this.n < 0n ? -1 : 0;
  }
  eq(o: Frac | number) {
    const b = Frac.of(o);
    return this.n === b.n && this.d === b.d;
  }
  toNumber() {
    return Number(this.n) / Number(this.d);
  }
  toString() {
    return this.d === 1n ? String(this.n) : `${this.n}/${this.d}`;
  }
  toTeX() {
    if (this.d === 1n) return String(this.n);
    const neg = this.n < 0n;
    return `${neg ? '-' : ''}\\tfrac{${neg ? -this.n : this.n}}{${this.d}}`;
  }
}

export const F = (n: number | string | Frac, d?: number) => (d === undefined ? Frac.of(n) : new Frac(BigInt(n as number), BigInt(d)));
export type FMat = Frac[][];
export const toFMat = (m: (number | string | Frac)[][]): FMat => m.map((r) => r.map((x) => Frac.of(x)));
export const fmatToNumbers = (m: FMat) => m.map((r) => r.map((x) => x.toNumber()));

export function fmatMul(a: FMat, b: FMat): FMat {
  return a.map((row) => b[0].map((_, j) => row.reduce((s, x, k) => s.add(x.mul(b[k][j])), new Frac(0))));
}

export function fdet(m: FMat): Frac {
  const a = m.map((r) => [...r]);
  const n = a.length;
  let det = new Frac(1);
  for (let c = 0; c < n; c++) {
    let p = c;
    while (p < n && a[p][c].isZero()) p++;
    if (p === n) return new Frac(0);
    if (p !== c) {
      [a[p], a[c]] = [a[c], a[p]];
      det = det.neg();
    }
    det = det.mul(a[c][c]);
    for (let r = c + 1; r < n; r++) {
      const f = a[r][c].div(a[c][c]);
      if (!f.isZero()) a[r] = a[r].map((x, j) => x.sub(f.mul(a[c][j])));
    }
  }
  return det;
}

export function finv(m: FMat): FMat | null {
  const n = m.length;
  const a = m.map((r, i) => [...r, ...r.map((_, j) => new Frac(i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    while (p < n && a[p][c].isZero()) p++;
    if (p === n) return null;
    [a[p], a[c]] = [a[c], a[p]];
    const piv = a[c][c];
    a[c] = a[c].map((x) => x.div(piv));
    for (let r = 0; r < n; r++)
      if (r !== c && !a[r][c].isZero()) {
        const f = a[r][c];
        a[r] = a[r].map((x, j) => x.sub(f.mul(a[c][j])));
      }
  }
  return a.map((r) => r.slice(n));
}

// ---------- row reduction with a recorded list of elementary operations ----------

export type RowOp =
  | { kind: 'swap'; i: number; j: number }
  | { kind: 'scale'; i: number; k: Frac }
  | { kind: 'add'; i: number; j: number; k: Frac }; // R_i <- R_i + k R_j

export interface RrefStep {
  op: RowOp;
  after: FMat;
  pivot: [number, number];
}

export function applyRowOp(m: FMat, op: RowOp): FMat {
  const a = m.map((r) => [...r]);
  if (op.kind === 'swap') [a[op.i], a[op.j]] = [a[op.j], a[op.i]];
  else if (op.kind === 'scale') a[op.i] = a[op.i].map((x) => x.mul(op.k));
  else a[op.i] = a[op.i].map((x, c) => x.add(op.k.mul(a[op.j][c])));
  return a;
}

/** Gauss–Jordan to reduced row echelon form. `cols` limits pivot search (augmented matrices). */
export function rrefSteps(m0: FMat, cols = m0[0].length, reduced = true): { steps: RrefStep[]; result: FMat; pivots: [number, number][] } {
  let m = m0.map((r) => [...r]);
  const steps: RrefStep[] = [];
  const pivots: [number, number][] = [];
  let r = 0;
  const rows = m.length;
  for (let c = 0; c < cols && r < rows; c++) {
    let p = r;
    while (p < rows && m[p][c].isZero()) p++;
    if (p === rows) continue;
    const push = (op: RowOp) => {
      m = applyRowOp(m, op);
      steps.push({ op, after: m, pivot: [r, c] });
    };
    if (p !== r) push({ kind: 'swap', i: r, j: p });
    if (reduced && !m[r][c].isOne()) push({ kind: 'scale', i: r, k: m[r][c].inv() });
    for (let i = reduced ? 0 : r + 1; i < rows; i++) {
      if (i === r || m[i][c].isZero()) continue;
      push({ kind: 'add', i, j: r, k: m[i][c].div(m[r][c]).neg() });
    }
    pivots.push([r, c]);
    r++;
  }
  return { steps, result: m, pivots };
}

export const fRank = (m: FMat) => rrefSteps(m).pivots.length;

export function rowOpTeX(op: RowOp): string {
  const R = (i: number) => `R_{${i + 1}}`;
  if (op.kind === 'swap') return `${R(op.i)} \\leftrightarrow ${R(op.j)}`;
  if (op.kind === 'scale') return `${R(op.i)} \\leftarrow ${op.k.toTeX()}\\,${R(op.i)}`;
  const k = op.k;
  const mag = k.sign() < 0 ? k.neg() : k;
  return `${R(op.i)} \\leftarrow ${R(op.i)} ${k.sign() < 0 ? '-' : '+'} ${mag.isOne() ? '' : mag.toTeX() + '\\,'}${R(op.j)}`;
}

export function fmatTeX(m: FMat, opts: { augment?: number; highlight?: [number, number] | null } = {}): string {
  const cols = m[0].length;
  const spec = opts.augment ? 'c'.repeat(opts.augment) + '|' + 'c'.repeat(cols - opts.augment) : 'c'.repeat(cols);
  const body = m
    .map((row, i) => row.map((x, j) => (opts.highlight && opts.highlight[0] === i && opts.highlight[1] === j ? `\\boxed{${x.toTeX()}}` : x.toTeX())).join(' & '))
    .join(' \\\\ ');
  return `\\left[\\begin{array}{${spec}} ${body} \\end{array}\\right]`;
}
