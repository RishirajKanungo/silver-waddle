import { describe, it, expect } from 'vitest';
import { F, toFMat, fdet, finv, rrefSteps, fmatToNumbers, fmatMul } from './frac';
import { det, inv, eigSym, svd, matmul, T, qr, eig2, solve, rank } from './linalg';
import { checkAnswer, evalExpr } from './answer';
import { Rng } from './rng';

describe('fractions', () => {
  it('arithmetic', () => {
    expect(F(1, 3).add(F(1, 6)).toString()).toBe('1/2');
    expect(F(-2, 4).toString()).toBe('-1/2');
    expect(F('3/9').mul(3).toString()).toBe('1');
    expect(F(0.25).toString()).toBe('1/4');
  });
  it('det, inverse, rref', () => {
    const A = toFMat([[2, 1, 1], [1, 3, 2], [1, 0, 0]]);
    expect(fdet(A).toString()).toBe('-1');
    const Ai = finv(A)!;
    expect(fmatToNumbers(fmatMul(A, Ai))).toEqual([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    const { result, pivots } = rrefSteps(toFMat([[1, 2, 3], [2, 4, 6], [1, 1, 1]]));
    expect(pivots.length).toBe(2);
    expect(fmatToNumbers(result)).toEqual([[1, 0, -1], [0, 1, 2], [0, 0, 0]]);
  });
});

describe('float linear algebra', () => {
  const A = [[4, 1, 2], [1, 3, 0], [2, 0, 5]];
  it('det/inv/solve', () => {
    expect(det(A)).toBeCloseTo(4 * 15 - 1 * 5 + 2 * -6, 9);
    const I = matmul(A, inv(A)!);
    I.forEach((r, i) => r.forEach((x, j) => expect(x).toBeCloseTo(i === j ? 1 : 0, 9)));
    const x = solve(A, [1, 2, 3])!;
    matmul(A, x.map((v) => [v])).forEach((r, i) => expect(r[0]).toBeCloseTo([1, 2, 3][i], 9));
  });
  it('symmetric eigen', () => {
    const { values, V } = eigSym(A);
    // A V = V diag(values)
    const AV = matmul(A, V);
    AV.forEach((r, i) => r.forEach((x, j) => expect(x).toBeCloseTo(V[i][j] * values[j], 8)));
    expect(values[0]).toBeLessThanOrEqual(values[1]);
  });
  it('svd reconstructs', () => {
    const B = [[3, 2, 2], [2, 3, -2]];
    const { U, S, V } = svd(B);
    expect(S[0]).toBeCloseTo(5, 9);
    expect(S[1]).toBeCloseTo(3, 9);
    const R = matmul(matmul(U, S.map((s, i) => S.map((_, j) => (i === j ? s : 0)))), T(V));
    R.forEach((r, i) => r.forEach((x, j) => expect(x).toBeCloseTo(B[i][j], 8)));
    expect(rank([[1, 2], [2, 4]])).toBe(1);
    expect(rank([[-1, 1, 0, 2, 0, -2], [2, -2, 0, -4, 0, 4], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [-1, 1, 0, 2, 0, -2], [-2, 2, 0, 4, 0, -4]])).toBe(1);
    expect(rank([[1, 2, 3], [4, 5, 6], [7, 8, 9]])).toBe(2);
    expect(rank([[2, 0, 0], [0, 3, 0], [0, 0, 1e-3]])).toBe(3);
  });
  it('qr and eig2', () => {
    const { Q, R } = qr([[1, 1], [1, 0], [0, 1]]);
    const QtQ = matmul(T(Q), Q);
    QtQ.forEach((r, i) => r.forEach((x, j) => expect(x).toBeCloseTo(i === j ? 1 : 0, 9)));
    const QR = matmul(Q, R);
    expect(QR[2][1]).toBeCloseTo(1, 9);
    const e = eig2([[2, 1], [1, 2]])!;
    expect(e.values).toEqual([3, 1]);
    expect(eig2([[0, -1], [1, 0]])).toBeNull();
  });
});

describe('answer checking', () => {
  it('expressions', () => {
    expect(evalExpr('3/4')).toBe(0.75);
    expect(evalExpr('sqrt(2)/2')).toBeCloseTo(Math.SQRT1_2, 12);
    expect(evalExpr('2^10')).toBe(1024);
    expect(evalExpr('-2^2')).toBe(-4);
    expect(evalExpr('2pi')).toBeCloseTo(2 * Math.PI, 12);
    expect(evalExpr('e^-1')).toBeCloseTo(1 / Math.E, 12);
    expect(evalExpr('1e-3')).toBe(0.001);
    expect(evalExpr('ln(e)')).toBe(1);
  });
  it('vectors, matrices, sets', () => {
    expect(checkAnswer({ kind: 'vector', value: [1, -2] }, '[1, -2]').ok).toBe(true);
    expect(checkAnswer({ kind: 'vector', value: [1, -2] }, '(1, -2)').ok).toBe(true);
    expect(checkAnswer({ kind: 'vector', value: [1, -2] }, '1 -2').ok).toBe(true);
    expect(checkAnswer({ kind: 'vector', value: [0.5, 1] }, '1/2, 1').ok).toBe(true);
    expect(checkAnswer({ kind: 'vector', value: [1, 2], upToScale: true }, '[-2, -4]').ok).toBe(true);
    expect(checkAnswer({ kind: 'matrix', value: [[1, 2], [3, 4]] }, '[[1,2],[3,4]]').ok).toBe(true);
    expect(checkAnswer({ kind: 'matrix', value: [[1, 2], [3, 4]] }, '1 2; 3 4').ok).toBe(true);
    expect(checkAnswer({ kind: 'set', value: [2, 5] }, '5, 2').ok).toBe(true);
    expect(checkAnswer({ kind: 'number', value: 0.1 }, '0.11').ok).toBe(false);
    expect(checkAnswer({ kind: 'text', value: ['C'] }, ' c ').ok).toBe(true);
  });
  it('rng is deterministic', () => {
    const a = new Rng(42), b = new Rng(42);
    expect([a.next(), a.int(1, 6)]).toEqual([b.next(), b.int(1, 6)]);
  });
});
