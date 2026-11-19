// A tiny fully connected network for 2-D binary classification, trained with minibatch SGD.
// Used by the playground and the loss-curve figures. Plain arrays, no dependencies.
import { Rng } from '../../math/rng';

export type HiddenAct = 'relu' | 'tanh' | 'sigmoid';
export type Dataset = 'circles' | 'xor' | 'spiral' | 'blobs';
export interface Pt {
  x: [number, number];
  y: 0 | 1;
}

/** The data live in about [-1, 1]²; inputs are multiplied by this before the first layer. */
export const IN_SCALE = 2;

export interface Net {
  sizes: number[]; // e.g. [2, 8, 8, 1]
  W: number[][][]; // W[l] has shape sizes[l+1] × sizes[l]
  b: number[][];
  act: HiddenAct;
}

const actF: Record<HiddenAct, (z: number) => number> = {
  relu: (z) => (z > 0 ? z : 0),
  tanh: Math.tanh,
  sigmoid: (z) => 1 / (1 + Math.exp(-z)),
};
/** derivative written in terms of the activation output a (and pre-activation z) */
const actD: Record<HiddenAct, (a: number, z: number) => number> = {
  relu: (_a, z) => (z > 0 ? 1 : 0),
  tanh: (a) => 1 - a * a,
  sigmoid: (a) => a * (1 - a),
};

/** He initialization for ReLU, Xavier (Glorot normal) otherwise; biases zero. */
export function makeNet(sizes: number[], act: HiddenAct, seed = 1): Net {
  const r = new Rng(seed);
  const W: number[][][] = [];
  const b: number[][] = [];
  for (let l = 0; l + 1 < sizes.length; l++) {
    const nin = sizes[l], nout = sizes[l + 1];
    const std = act === 'relu' && l + 2 < sizes.length ? Math.sqrt(2 / nin) : Math.sqrt(2 / (nin + nout));
    W.push(Array.from({ length: nout }, () => Array.from({ length: nin }, () => r.normal(0, std))));
    b.push(Array(nout).fill(act === 'relu' && l + 2 < sizes.length ? 0.01 : 0));
  }
  return { sizes, W, b, act };
}

export function cloneNet(n: Net): Net {
  return { sizes: [...n.sizes], act: n.act, W: n.W.map((m) => m.map((r) => [...r])), b: n.b.map((v) => [...v]) };
}

/** Forward pass for one point; returns every layer's activations (last = [p]) and pre-activations. */
function forwardAll(net: Net, x: [number, number]) {
  const as: number[][] = [[x[0] * IN_SCALE, x[1] * IN_SCALE]];
  const zs: number[][] = [];
  const L = net.W.length;
  for (let l = 0; l < L; l++) {
    const prev = as[l];
    const Wl = net.W[l], bl = net.b[l];
    const z = new Array(Wl.length);
    for (let i = 0; i < Wl.length; i++) {
      let s = bl[i];
      const row = Wl[i];
      for (let j = 0; j < prev.length; j++) s += row[j] * prev[j];
      z[i] = s;
    }
    zs.push(z);
    as.push(l === L - 1 ? z.map((v: number) => 1 / (1 + Math.exp(-v))) : z.map(actF[net.act]));
  }
  return { as, zs };
}

export function predict(net: Net, x: number, y: number): number {
  const { as } = forwardAll(net, [x, y]);
  return as[as.length - 1][0];
}

const EPS = 1e-12;
export function bce(p: number, y: number) {
  return -(y * Math.log(p + EPS) + (1 - y) * Math.log(1 - p + EPS));
}

export function meanLoss(net: Net, pts: Pt[]): number {
  let s = 0;
  for (const q of pts) s += bce(predict(net, q.x[0], q.x[1]), q.y);
  return s / Math.max(1, pts.length);
}

export function accuracy(net: Net, pts: Pt[]): number {
  let c = 0;
  for (const q of pts) c += (predict(net, q.x[0], q.x[1]) > 0.5 ? 1 : 0) === q.y ? 1 : 0;
  return c / Math.max(1, pts.length);
}

/** One SGD step on a minibatch (mean binary cross-entropy, optional L2 weight decay). Mutates net. */
export function sgdStep(net: Net, batch: Pt[], lr: number, wd = 0) {
  const L = net.W.length;
  const gW = net.W.map((m) => m.map((r) => r.map(() => 0)));
  const gb = net.b.map((v) => v.map(() => 0));
  for (const q of batch) {
    const { as, zs } = forwardAll(net, q.x);
    // dL/dz at the output for sigmoid + BCE is p - y
    let delta = [as[L][0] - q.y];
    for (let l = L - 1; l >= 0; l--) {
      const prev = as[l];
      for (let i = 0; i < delta.length; i++) {
        gb[l][i] += delta[i];
        for (let j = 0; j < prev.length; j++) gW[l][i][j] += delta[i] * prev[j];
      }
      if (l > 0) {
        const nd = new Array(prev.length).fill(0);
        for (let j = 0; j < prev.length; j++) {
          let s = 0;
          for (let i = 0; i < delta.length; i++) s += net.W[l][i][j] * delta[i];
          nd[j] = s * actD[net.act](prev[j], zs[l - 1][j]);
        }
        delta = nd;
      }
    }
  }
  const k = 1 / batch.length;
  for (let l = 0; l < L; l++) {
    for (let i = 0; i < net.W[l].length; i++) {
      for (let j = 0; j < net.W[l][i].length; j++) net.W[l][i][j] -= lr * (gW[l][i][j] * k + wd * net.W[l][i][j]);
      net.b[l][i] -= lr * gb[l][i] * k;
    }
  }
}

/** One epoch of minibatch SGD with a deterministic shuffle. */
export function epoch(net: Net, pts: Pt[], lr: number, batchSize: number, rng: Rng, wd = 0) {
  const order = rng.shuffle(pts.map((_, i) => i));
  for (let s = 0; s < order.length; s += batchSize) sgdStep(net, order.slice(s, s + batchSize).map((i) => pts[i]), lr, wd);
}

const SPIRAL_TURNS = 1.25;
/** 2-D toy datasets in roughly [-1, 1]². */
export function makeData(kind: Dataset, n: number, seed = 7, noise = 0.08): Pt[] {
  const r = new Rng(seed);
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const cls = (i % 2) as 0 | 1;
    let x = 0, y = 0;
    if (kind === 'circles') {
      const rad = cls === 1 ? 0.45 * Math.sqrt(r.next()) : 0.72 + 0.28 * r.next();
      const t = 2 * Math.PI * r.next();
      x = rad * Math.cos(t);
      y = rad * Math.sin(t);
    } else if (kind === 'xor') {
      const sx = r.next() < 0.5 ? -1 : 1;
      const sy = cls === 1 ? sx : -sx;
      x = sx * (0.12 + 0.85 * r.next());
      y = sy * (0.12 + 0.85 * r.next());
    } else if (kind === 'spiral') {
      const t = r.next();
      const rad = 0.08 + 0.9 * t;
      const ang = SPIRAL_TURNS * t * 2 * Math.PI + (cls === 1 ? Math.PI : 0);
      x = rad * Math.sin(ang);
      y = rad * Math.cos(ang);
    } else {
      x = (cls === 1 ? 0.45 : -0.45) + 0.3 * r.normal();
      y = (cls === 1 ? 0.35 : -0.35) + 0.3 * r.normal();
    }
    pts.push({ x: [x + noise * r.normal(), y + noise * r.normal()], y: cls });
  }
  return pts;
}

export function paramCount(sizes: number[]): number {
  let s = 0;
  for (let l = 0; l + 1 < sizes.length; l++) s += sizes[l] * sizes[l + 1] + sizes[l + 1];
  return s;
}
