// Signal propagation through a deep fully connected network at initialization:
// RMS of the activations going forward and of the gradients going backward, layer by layer.
import { Rng } from '../../math/rng';

export type DAct = 'linear' | 'relu' | 'tanh' | 'sigmoid';
export const DACT: Record<DAct, { f: (z: number) => number; d: (z: number) => number }> = {
  linear: { f: (z) => z, d: () => 1 },
  relu: { f: (z) => (z > 0 ? z : 0), d: (z) => (z > 0 ? 1 : 0) },
  tanh: { f: Math.tanh, d: (z) => 1 - Math.tanh(z) ** 2 },
  sigmoid: { f: (z) => 1 / (1 + Math.exp(-z)), d: (z) => { const s = 1 / (1 + Math.exp(-z)); return s * (1 - s); } },
};

export interface SimOut {
  /** RMS of h_l for l = 0..L (h_0 = input) */
  act: number[];
  /** RMS of dL/dh_l for l = 0..L, divided by the RMS at the top layer L */
  grad: number[];
}

/**
 * Plain:    h_l = φ(W_l h_{l-1}),  W_l entries ~ N(0, std²)
 * Residual: h_l = h_{l-1} + φ(W_l h_{l-1})
 * The upstream gradient dL/dh_L is a fixed standard-normal matrix.
 */
export function simulate(o: { depth: number; width: number; batch: number; act: DAct; std: number; residual?: boolean; seed?: number }): SimOut {
  const { depth, width: n, batch: B, act, std, residual } = o;
  const r = new Rng(o.seed ?? 11);
  const F = DACT[act];
  const Ws: Float64Array[] = [];
  for (let l = 0; l < depth; l++) {
    const W = new Float64Array(n * n);
    for (let k = 0; k < n * n; k++) W[k] = r.normal(0, std);
    Ws.push(W);
  }
  let H = new Float64Array(B * n);
  for (let k = 0; k < B * n; k++) H[k] = r.normal();
  const rms = (a: Float64Array) => {
    let s = 0;
    for (let k = 0; k < a.length; k++) s += a[k] * a[k];
    return Math.sqrt(s / a.length);
  };
  const acts = [rms(H)];
  const Zs: Float64Array[] = [];
  for (let l = 0; l < depth; l++) {
    const W = Ws[l];
    const Z = new Float64Array(B * n);
    const Hn = new Float64Array(B * n);
    for (let b = 0; b < B; b++) {
      for (let i = 0; i < n; i++) {
        let s = 0;
        const wo = i * n, ho = b * n;
        for (let j = 0; j < n; j++) s += W[wo + j] * H[ho + j];
        Z[ho + i] = s;
        const a = F.f(s);
        Hn[ho + i] = residual ? H[ho + i] + a : a;
      }
    }
    Zs.push(Z);
    H = Hn;
    acts.push(Number.isFinite(rms(H)) ? rms(H) : Infinity);
  }
  let G = new Float64Array(B * n);
  for (let k = 0; k < B * n; k++) G[k] = r.normal();
  const grads = [rms(G)];
  for (let l = depth - 1; l >= 0; l--) {
    const W = Ws[l], Z = Zs[l];
    const D = new Float64Array(B * n);
    for (let k = 0; k < B * n; k++) D[k] = G[k] * F.d(Z[k]);
    const Gn = new Float64Array(B * n);
    for (let b = 0; b < B; b++) {
      const ho = b * n;
      for (let j = 0; j < n; j++) {
        let s = residual ? G[ho + j] : 0;
        for (let i = 0; i < n; i++) s += D[ho + i] * W[i * n + j];
        Gn[ho + j] = s;
      }
    }
    G = Gn;
    grads.push(rms(G));
  }
  grads.reverse();
  const top = grads[depth] || 1;
  return { act: acts, grad: grads.map((g) => g / top) };
}
