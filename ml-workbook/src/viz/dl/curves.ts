// Real training runs of the tiny MLP, recorded as train/validation loss curves.
// Used by the loss-curve diagnosis figure.
import { Rng } from '../../math/rng';
import { makeNet, makeData, epoch, meanLoss, type Pt } from './mlp';

export interface RunCfg {
  lr: number;
  epochs: number;
  hidden: number[];
  trainN: number;
  labelNoise: number;
  shuffleLabels?: boolean;
  wd?: number;
  seed?: number;
  batch?: number;
}
export interface RunOut {
  train: [number, number][];
  val: [number, number][];
  bestEpoch: number;
}

const cap = (v: number) => (Number.isFinite(v) ? Math.min(v, 5) : 5);

function noisy(pts: Pt[], p: number, r: Rng): Pt[] {
  return pts.map((q) => (r.next() < p ? { x: q.x, y: (1 - q.y) as 0 | 1 } : q));
}

/** An incremental training run: call advance(k) to train k more epochs. */
export function startRun(c: RunCfg) {
  const seed = c.seed ?? 1;
  const r = new Rng(500 + seed);
  let train = noisy(makeData('circles', c.trainN, 31 + seed, 0.12), c.labelNoise, r);
  const val = noisy(makeData('circles', 300, 977, 0.12), c.labelNoise, r);
  if (c.shuffleLabels) {
    const ys = r.shuffle(train.map((q) => q.y));
    train = train.map((q, i) => ({ x: q.x, y: ys[i] }));
  }
  const net = makeNet([2, ...c.hidden, 1], 'tanh', seed);
  const rng = new Rng(900 + seed);
  const out: RunOut = { train: [[0, cap(meanLoss(net, train))]], val: [[0, cap(meanLoss(net, val))]], bestEpoch: 0 };
  let bestV = out.val[0][1];
  let e = 0;
  const every = Math.max(1, Math.round(c.epochs / 150));
  return {
    out,
    get epoch() {
      return e;
    },
    get done() {
      return e >= c.epochs;
    },
    advance(k: number) {
      for (let i = 0; i < k && e < c.epochs; i++) {
        epoch(net, train, c.lr, c.batch ?? 16, rng, c.wd ?? 0);
        e++;
        if (e % every === 0 || e === c.epochs) {
          const t = cap(meanLoss(net, train)), v = cap(meanLoss(net, val));
          out.train.push([e, t]);
          out.val.push([e, v]);
          if (v < bestV) {
            bestV = v;
            out.bestEpoch = e;
          }
        }
      }
    },
  };
}

export function runCurve(c: RunCfg): RunOut {
  const run = startRun(c);
  run.advance(c.epochs);
  return run.out;
}

export type Scenario = 'healthy' | 'high' | 'low' | 'overfit' | 'bug';
export const SCENARIOS: Record<Scenario, { cfg: RunCfg; label: string; explain: string }> = {
  healthy: {
    label: 'healthy run',
    cfg: { lr: 0.3, epochs: 300, hidden: [16, 16], trainN: 200, labelNoise: 0, wd: 0.001 },
    explain: 'Both curves fall quickly and flatten together. The gap is small because the training set is large relative to the model. Nothing to fix.',
  },
  high: {
    label: 'learning rate too high',
    cfg: { lr: 3, epochs: 300, hidden: [16, 16], trainN: 200, labelNoise: 0 },
    explain: 'The loss falls at first, then jumps around and spikes upward instead of settling: steps overshoot the valley. Lower the learning rate (and consider warmup and gradient clipping).',
  },
  low: {
    label: 'learning rate too low',
    cfg: { lr: 0.004, epochs: 300, hidden: [16, 16], trainN: 200, labelNoise: 0 },
    explain: 'Smooth, slow, almost linear progress, still far from converged at the end, with train and validation together. Raise the learning rate.',
  },
  overfit: {
    label: 'overfitting',
    cfg: { lr: 0.3, epochs: 300, hidden: [32, 32], trainN: 80, labelNoise: 0.1 },
    explain: 'Training loss keeps falling while validation loss reaches a minimum early and then rises. The model memorizes 80 examples, 10% of them mislabeled. Get more data, regularize (weight decay, dropout, augmentation), use a smaller model, or stop early at the validation minimum.',
  },
  bug: {
    label: 'data or label bug',
    cfg: { lr: 0.3, epochs: 300, hidden: [32, 32], trainN: 120, labelNoise: 0, shuffleLabels: true },
    explain: 'Training loss creeps down slowly (the network is memorizing), while validation loss stays around ln 2 or above: nothing learned transfers. Here the training labels were shuffled relative to the inputs. Inspect a few training examples with their labels.',
  },
};
