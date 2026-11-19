// ml05 figures: k-NN regions, distance concentration, k-means step by step, choosing k,
// Gaussian mixtures by EM, t-SNE versus PCA, anomaly detectors.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Seg, Heat, Contours, Handle, ParamCurve, Slider, Readout, FigureLayout, SegControl, Toggle, LinePlot, TeX, usePlayer, Btn, type P2 } from '../kit';
import { eigSym } from '../../math/linalg';
import { fx, rng, range, mean, sum, CL, CLASS, Dots, Panel, Legend, pct } from './common';
import './ml2.css';

const d2 = (a: number[], b: number[]) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return s;
};

// ======================================================================= k-NN

function knnData(seed: number, n: number) {
  const g = rng(seed);
  const C = [
    [[3, 6.5], [5, 3]],
    [[6.5, 7], [7, 3.8]],
  ];
  const X: number[][] = [], y: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = i % 2;
    const m = C[c][g.int(0, 1)];
    X.push([m[0] + 1.25 * g.normal(), m[1] + 1.25 * g.normal()]);
    y.push(c);
  }
  return { X, y };
}

/**
 * ml.knn — k-nearest-neighbour classification in 2-D: decision regions, a draggable query with its k
 * neighbours, L1/L2 distance, a scale factor on feature 2, and train/test error versus k.
 * params: k (default 15), scale (default 1), metric ('l2' | 'l1')
 */
function KNN({ spec }: { spec: VizSpec }) {
  const [k, setK] = useState((spec.k as number) ?? 15);
  const [ls, setLs] = useState(Math.log10((spec.scale as number) ?? 1));
  const [metric, setMetric] = useState<'l2' | 'l1'>((spec.metric as 'l2' | 'l1') ?? 'l2');
  const [q, setQ] = useState<P2>([5, 5.2]);
  const s2 = 10 ** ls;
  const train = useMemo(() => knnData(3, 80), []);
  const test = useMemo(() => knnData(4, 600), []);
  const dist = useMemo(() => (a: number[], b: number[]) => (metric === 'l2' ? Math.sqrt((a[0] - b[0]) ** 2 + (s2 * (a[1] - b[1])) ** 2) : Math.abs(a[0] - b[0]) + s2 * Math.abs(a[1] - b[1])), [metric, s2]);
  const neigh = useMemo(() => (x: number[], kk: number) => range(train.y.length).map((i) => [dist(x, train.X[i]), i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).slice(0, kk).map((p) => p[1]), [dist, train]);
  const curve = useMemo(() => {
    const ks = range(21).map((i) => 2 * i + 1);
    // sort neighbours once per point, then read off every k
    const order = (D: { X: number[][] }) => D.X.map((x) => neigh(x, 41));
    const otr = order(train), ote = order(test);
    const err = (O: number[][], ys: number[], kk: number) => mean(O.map((o, i) => ((sum(o.slice(0, kk).map((j) => train.y[j])) / kk > 0.5 ? 1 : 0) !== ys[i] ? 1 : 0)));
    return ks.map((kk) => ({ k: kk, train: err(otr, train.y, kk), test: err(ote, test.y, kk) }));
  }, [neigh, train, test]);
  const f = useMemo(() => (a: number, b: number) => sum(neigh([a, b], k).map((j) => train.y[j])) / k, [neigh, k, train]);
  const nq = neigh(q, k);
  const votes = sum(nq.map((j) => train.y[j]));
  const cur = curve.find((c) => c.k === k) ?? curve[0];
  return (
    <FigureLayout
      side={
        <>
          <Slider label="k" value={k} min={1} max={41} step={2} onChange={setK} />
          <SegControl label="distance" value={metric} onChange={setMetric} options={[{ v: 'l2', label: 'L2' }, { v: 'l1', label: 'L1' }]} />
          <Slider label="scale of x2" value={ls} min={-1} max={1} step={0.05} onChange={setLs} fmt={() => '×' + fx(s2, 2)} />
          <Readout
            rows={[
              ['\\text{query votes (class 1)}', `${votes} of ${k}`],
              ['\\text{prediction}', votes / k > 0.5 ? 'class 1' : 'class 0'],
              ['\\text{train error}', pct(cur.train)],
              ['\\text{test error}', pct(cur.test)],
            ]}
          />
          <div className="ml2-note">Drag the query. Small k follows individual points (low bias, high variance); large k averages over a wide area (high bias, low variance). The scale slider multiplies x2 before distances are computed, as a change of units would.</div>
        </>
      }
      below={
        <Panel title="error versus k">
          <LinePlot
            height={150}
            x={[1, 41]}
            y={[0, 0.4]}
            xlabel="k"
            series={[
              { pts: curve.map((c) => [c.k, c.train] as [number, number]), color: 'var(--c-u)', label: 'train' },
              { pts: curve.map((c) => [c.k, c.test] as [number, number]), color: 'var(--c-err)', label: 'test' },
            ]}
            vlines={[{ x: k, color: 'var(--accent)' }]}
          />
        </Panel>
      }
    >
      <div className="ml2-stack">
        <Plane x={[0, 10]} y={[0, 10]} width={380} gridStep={2}>
          <Heat f={f} res={45} range={[0, 1]} scheme="class" opacity={0.65} />
          {nq.map((j) => (
            <Seg key={j} a={q} b={train.X[j] as P2} color="var(--fg)" width={1} opacity={0.5} />
          ))}
          <Dots pts={train.X as P2[]} color={(i) => CLASS[train.y[i]]} r={(i) => (nq.includes(i) ? 5 : 3.5)} />
          <Handle at={q} onChange={setQ} color="var(--fg)" snap={0.1} label="query" text="query" />
        </Plane>
        <Legend items={[{ color: CLASS[0], label: 'class 0', dot: true }, { color: CLASS[1], label: 'class 1', dot: true }]} />
      </div>
    </FigureLayout>
  );
}

// ======================================================================= distance concentration

const DIMS = [1, 2, 3, 5, 10, 20, 50, 100, 200, 500, 1000];
/**
 * ml.dist-concentration — histogram of pairwise distances (divided by their mean) for 60 random points
 * in d dimensions; the relative spread shrinks like 1/√d. params: dist ('uniform' | 'gauss'), d (default 2)
 */
function DistConcentration({ spec }: { spec: VizSpec }) {
  const [kind, setKind] = useState<'uniform' | 'gauss'>((spec.dist as 'uniform' | 'gauss') ?? 'uniform');
  const [di, setDi] = useState(Math.max(0, DIMS.indexOf((spec.d as number) ?? 2)));
  const n = 60;
  const all = useMemo(
    () =>
      DIMS.map((d) => {
        const g = rng(55 + d);
        const P = range(n).map(() => range(d).map(() => (kind === 'uniform' ? g.next() : g.normal())));
        const ds: number[] = [];
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) ds.push(Math.sqrt(d2(P[i], P[j])));
        const m = mean(ds);
        const sd = Math.sqrt(mean(ds.map((v) => (v - m) ** 2)));
        const from0 = range(n - 1).map((j) => Math.sqrt(d2(P[0], P[j + 1])));
        return { d, ds, m, sd, near: Math.min(...from0), far: Math.max(...from0) };
      }),
    [kind],
  );
  const cur = all[di];
  const bins = 40;
  const hist = new Array(bins).fill(0);
  cur.ds.forEach((v) => {
    const b = Math.floor((v / cur.m / 2) * bins);
    if (b >= 0 && b < bins) hist[b]++;
  });
  const maxH = Math.max(...hist);
  // theory for the relative spread of the distance (delta method on the squared distance)
  const theory = (d: number) => (kind === 'uniform' ? 0.5 * Math.sqrt(7 / 5) : Math.sqrt(0.5)) / Math.sqrt(d);
  return (
    <FigureLayout
      side={
        <>
          <Slider label="dimension d" value={di} min={0} max={DIMS.length - 1} step={1} onChange={setDi} fmt={(i) => String(DIMS[i])} />
          <SegControl value={kind} onChange={setKind} options={[{ v: 'uniform', label: 'uniform cube' }, { v: 'gauss', label: 'Gaussian' }]} />
          <Readout
            rows={[
              ['\\text{mean distance}', fx(cur.m, 3)],
              ['\\text{std of distance}', fx(cur.sd, 3)],
              ['\\text{std / mean}', fx(cur.sd / cur.m, 3)],
              ['\\text{nearest, farthest from pt 0}', `${fx(cur.near, 2)}, ${fx(cur.far, 2)}`],
              ['\\text{farthest / nearest}', fx(cur.far / cur.near, 2)],
            ]}
          />
          <div className="ml2-note">As d grows, every pair of points is at almost the same distance. When the nearest and the farthest neighbour are nearly equally far, "nearest" carries little information.</div>
        </>
      }
      below={
        <Panel title="relative spread (std / mean) versus dimension, log–log">
          <LinePlot
            height={160}
            logX
            logY
            x={[1, 1000]}
            y={[0.01, 1]}
            xlabel="d"
            series={[
              { pts: all.map((a) => [a.d, a.sd / a.m] as [number, number]), color: 'var(--c-u)', label: 'measured' },
              { pts: DIMS.map((d) => [d, theory(d)] as [number, number]), color: 'var(--muted)', dashed: true, label: 'c / √d' },
            ]}
            vlines={[{ x: cur.d, color: 'var(--accent)' }]}
          />
        </Panel>
      }
    >
      <Panel title={`pairwise distances / mean distance, d = ${cur.d} (${cur.ds.length} pairs)`}>
        <LinePlot width={470} height={260} x={[0, 2]} y={[0, maxH * 1.08]} xlabel="distance / mean distance" series={[{ pts: [[1, 0], [1, 0]], color: 'var(--muted)' }]} legend={false} vlines={[{ x: 1, color: 'var(--muted)' }]}>
          {(sx, sy) => (
            <g>
              {hist.map((h, b) => (
                <rect key={b} x={sx((2 * b) / bins) + 0.5} y={sy(h)} width={Math.max(0, sx((2 * (b + 1)) / bins) - sx((2 * b) / bins) - 1)} height={Math.max(0, sy(0) - sy(h))} style={{ fill: 'var(--c-u)', opacity: 0.75 }} />
              ))}
            </g>
          )}
        </LinePlot>
      </Panel>
    </FigureLayout>
  );
}

// ======================================================================= k-means

type KMData = 'blobs' | 'unequal' | 'aniso' | 'rings';
function kmData(kind: KMData) {
  const g = rng(kind.length * 7 + 3);
  const X: number[][] = [];
  if (kind === 'blobs') {
    const C = [[2.5, 7], [7, 7.5], [5, 2.5]];
    for (let i = 0; i < 90; i++) {
      const c = C[i % 3];
      X.push([c[0] + 0.9 * g.normal(), c[1] + 0.9 * g.normal()]);
    }
  } else if (kind === 'unequal') {
    for (let i = 0; i < 70; i++) X.push([3.8 + 1.6 * g.normal(), 5 + 1.6 * g.normal()]);
    for (let i = 0; i < 12; i++) X.push([8.3 + 0.35 * g.normal(), 8.3 + 0.35 * g.normal()]);
    for (let i = 0; i < 12; i++) X.push([8.3 + 0.35 * g.normal(), 1.8 + 0.35 * g.normal()]);
  } else if (kind === 'aniso') {
    const C = [[5, 2.5], [5, 5], [5, 7.5]];
    for (let i = 0; i < 90; i++) {
      const c = C[i % 3];
      const u = 2.2 * g.normal(), v = 0.35 * g.normal();
      X.push([c[0] + u * 0.97 + v * 0.26, c[1] + u * 0.26 - v * 0.97 + 0]);
    }
  } else {
    for (let i = 0; i < 100; i++) {
      const r = i % 2 ? 1.1 : 3.6;
      const t = 2 * Math.PI * g.next();
      X.push([5 + (r + 0.25 * g.normal()) * Math.cos(t), 5 + (r + 0.25 * g.normal()) * Math.sin(t)]);
    }
  }
  return X.map((p) => [Math.max(0.1, Math.min(9.9, p[0])), Math.max(0.1, Math.min(9.9, p[1]))]);
}
function initCentres(X: number[][], k: number, how: 'random' | 'pp', seed: number) {
  const g = rng(seed);
  if (how === 'random') return g.shuffle(range(X.length)).slice(0, k).map((i) => [...X[i]]);
  const C = [[...X[Math.floor(g.next() * X.length)]]];
  while (C.length < k) {
    const D = X.map((x) => Math.min(...C.map((c) => d2(x, c))));
    let u = g.next() * sum(D);
    let j = 0;
    while (j < X.length - 1 && u > D[j]) u -= D[j++];
    C.push([...X[j]]);
  }
  return C;
}
interface KMFrame {
  C: number[][];
  lab: number[] | null;
  J: number;
  kind: 'init' | 'assign' | 'update';
  prev?: number[][];
}
function lloyd(X: number[][], C0: number[][], maxIt = 25): KMFrame[] {
  const frames: KMFrame[] = [{ C: C0, lab: null, J: NaN, kind: 'init' }];
  let C = C0;
  let lab: number[] | null = null;
  for (let it = 0; it < maxIt; it++) {
    const nl = X.map((x) => {
      let b = 0;
      for (let j = 1; j < C.length; j++) if (d2(x, C[j]) < d2(x, C[b])) b = j;
      return b;
    });
    const same = lab && nl.every((v, i) => v === lab![i]);
    lab = nl;
    frames.push({ C, lab, J: sum(X.map((x, i) => d2(x, C[nl[i]]))), kind: 'assign' });
    if (same) break;
    const Cn = C.map((c, j) => {
      const m = X.filter((_, i) => nl[i] === j);
      return m.length ? [mean(m.map((p) => p[0])), mean(m.map((p) => p[1]))] : c;
    });
    frames.push({ C: Cn, lab, J: sum(X.map((x, i) => d2(x, Cn[nl[i]]))), kind: 'update', prev: C });
    C = Cn;
  }
  return frames;
}
function Centres({ C, prev }: { C: number[][]; prev?: number[][] }) {
  return (
    <g>
      {prev && C.map((c, j) => <Seg key={'t' + j} a={prev[j] as P2} b={c as P2} color="var(--fg)" width={2} dashed />)}
      <Dots pts={C as P2[]} color={(j) => CL[j % CL.length]} r={9} stroke="var(--fg)" />
      <Dots pts={C as P2[]} color="var(--fg)" r={2.5} />
    </g>
  );
}

/**
 * ml.kmeans — Lloyd's algorithm step by step (assign, then update), with the objective after each half-step.
 * params: data ('blobs' | 'unequal' | 'aniso' | 'rings'), k (default 3), init ('random' | 'pp'), seed
 */
function KMeans({ spec }: { spec: VizSpec }) {
  const [data, setData] = useState<KMData>((spec.data as KMData) ?? 'blobs');
  const [k, setK] = useState((spec.k as number) ?? 3);
  const [init, setInit] = useState<'random' | 'pp'>((spec.init as 'random' | 'pp') ?? 'random');
  const [seed, setSeed] = useState((spec.seed as number) ?? 4);
  const X = useMemo(() => kmData(data), [data]);
  const frames = useMemo(() => lloyd(X, initCentres(X, k, init, seed)), [X, k, init, seed]);
  const player = usePlayer(frames.length, { interval: 700 });
  const fr = frames[Math.min(player.i, frames.length - 1)];
  const done = player.i >= frames.length - 1;
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={data} onChange={setData} options={[{ v: 'blobs', label: 'blobs' }, { v: 'unequal', label: 'unequal' }, { v: 'aniso', label: 'stretched' }, { v: 'rings', label: 'rings' }]} />
          <Slider label="k" value={k} min={2} max={6} step={1} onChange={setK} />
          <SegControl label="init" value={init} onChange={setInit} options={[{ v: 'random', label: 'random points' }, { v: 'pp', label: 'k-means++' }]} />
          <Btn onClick={() => { setSeed(seed + 1); player.setI(0); }}>new initialization</Btn>
          {player.controls}
          <Readout
            rows={[
              ['\\text{step}', fr.kind === 'init' ? 'initial centres' : fr.kind === 'assign' ? 'assign to nearest centre' : 'move centres to means'],
              ['J = \\sum_i \\lVert\\mathbf{x}_i - \\boldsymbol\\mu_{c(i)}\\rVert^2', Number.isFinite(fr.J) ? fx(fr.J, 2) : '–'],
              ['\\text{status}', done ? 'converged' : 'running'],
            ]}
          />
          <div className="ml2-note">Neither step can increase J. Try several initializations: the final J differs, because Lloyd's algorithm only finds a local minimum.</div>
        </>
      }
      below={
        <Panel title="objective J after each half-step">
          <LinePlot
            height={140}
            x={[1, Math.max(2, frames.length - 1)]}
            xlabel="half-step"
            series={[
              { pts: frames.slice(1).map((f, i) => [i + 1, f.J] as [number, number]), color: 'var(--c-u)' },
              { pts: frames.slice(1).map((f, i) => [i + 1, f.J] as [number, number]), color: 'var(--c-u)', scatter: true },
            ]}
            legend={false}
            vlines={player.i > 0 ? [{ x: player.i, color: 'var(--accent)' }] : []}
          />
        </Panel>
      }
    >
      <Plane x={[0, 10]} y={[0, 10]} width={380} gridStep={2}>
        <Dots pts={X as P2[]} color={(i) => (fr.lab ? CL[fr.lab[i] % CL.length] : 'var(--muted)')} r={3.6} />
        <Centres C={fr.C} prev={fr.kind === 'update' ? fr.prev : undefined} />
      </Plane>
    </FigureLayout>
  );
}

// ======================================================================= choosing k

function bestKMeans(X: number[][], k: number, seed: number) {
  let best: { J: number; lab: number[]; C: number[][] } | null = null;
  for (let r = 0; r < 6; r++) {
    const fr = lloyd(X, initCentres(X, k, 'pp', seed + 31 * r), 60);
    const last = fr[fr.length - 1];
    if (!best || last.J < best.J) best = { J: last.J, lab: last.lab!, C: last.C };
  }
  return best!;
}
function silhouette(D: number[][], lab: number[], k: number) {
  const n = lab.length;
  return range(n).map((i) => {
    const sums = new Array(k).fill(0), cnt = new Array(k).fill(0);
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      sums[lab[j]] += D[i][j];
      cnt[lab[j]]++;
    }
    if (!cnt[lab[i]]) return 0;
    const a = sums[lab[i]] / cnt[lab[i]];
    let b = Infinity;
    for (let c = 0; c < k; c++) if (c !== lab[i] && cnt[c]) b = Math.min(b, sums[c] / cnt[c]);
    return (b - a) / Math.max(a, b);
  });
}
/**
 * ml.choose-k — J (inertia) and the mean silhouette for k = 1..8 on the same data, with the clustering for
 * the chosen k. params: data ('clear' | 'vague'), k (default 2)
 */
function ChooseK({ spec }: { spec: VizSpec }) {
  const [data, setData] = useState<'clear' | 'vague'>((spec.data as 'clear' | 'vague') ?? 'clear');
  const [k, setK] = useState((spec.k as number) ?? 2);
  const X = useMemo(() => {
    const g = rng(data === 'clear' ? 21 : 22);
    const C = data === 'clear' ? [[2.5, 2.5], [2.5, 7.5], [7.5, 2.5], [7.5, 7.5]] : [[3, 3], [4.6, 6.6], [7, 3.6], [7.6, 7.4]];
    const S = data === 'clear' ? [0.7, 0.7, 0.7, 0.7] : [1.2, 1.0, 0.8, 0.6];
    return range(120).map((i) => [C[i % 4][0] + S[i % 4] * g.normal(), C[i % 4][1] + S[i % 4] * g.normal()]);
  }, [data]);
  const res = useMemo(() => {
    const D = X.map((a) => X.map((b) => Math.sqrt(d2(a, b))));
    return range(8).map((i) => {
      const kk = i + 1;
      const r = bestKMeans(X, kk, 7);
      return { k: kk, J: r.J, lab: r.lab, C: r.C, sil: kk > 1 ? mean(silhouette(D, r.lab, kk)) : NaN };
    });
  }, [X]);
  const cur = res[k - 1];
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={data} onChange={setData} options={[{ v: 'clear', label: 'separated' }, { v: 'vague', label: 'overlapping' }]} />
          <Slider label="k" value={k} min={1} max={8} step={1} onChange={setK} />
          <Readout
            rows={[
              ['J(k)', fx(cur.J, 1)],
              ['J(k-1) - J(k)', k > 1 ? fx(res[k - 2].J - cur.J, 1) : '–'],
              ['\\text{mean silhouette}', k > 1 ? fx(cur.sil, 3) : '–'],
            ]}
          />
          <div className="ml2-note">J always drops when k grows, so its minimum is useless. Look for the elbow, where extra clusters stop paying for themselves, and for the k with the highest mean silhouette.</div>
        </>
      }
      below={
        <div className="ml2-row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <Panel title="elbow: J versus k">
              <LinePlot width={260} height={160} x={[1, 8]} xlabel="k" series={[{ pts: res.map((r) => [r.k, r.J] as [number, number]), color: 'var(--c-u)' }, { pts: res.map((r) => [r.k, r.J] as [number, number]), color: 'var(--c-u)', scatter: true }]} legend={false} vlines={[{ x: k, color: 'var(--accent)' }]} />
            </Panel>
          </div>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <Panel title="mean silhouette versus k">
              <LinePlot width={260} height={160} x={[1, 8]} y={[0, 1]} xlabel="k" series={[{ pts: res.slice(1).map((r) => [r.k, r.sil] as [number, number]), color: 'var(--c-w)' }, { pts: res.slice(1).map((r) => [r.k, r.sil] as [number, number]), color: 'var(--c-w)', scatter: true }]} legend={false} vlines={[{ x: k, color: 'var(--accent)' }]} />
            </Panel>
          </div>
        </div>
      }
    >
      <Plane x={[0, 10]} y={[0, 10]} width={360} gridStep={2}>
        <Dots pts={X as P2[]} color={(i) => CL[cur.lab[i] % CL.length]} r={3.6} />
        <Centres C={cur.C} />
      </Plane>
    </FigureLayout>
  );
}

// ======================================================================= GMM / EM

interface Gauss {
  pi: number;
  mu: number[];
  S: number[][];
}
const gpdf = (x: number[], g: Gauss) => {
  const [[a, b], [, d]] = g.S;
  const det = a * d - b * b;
  const dx = x[0] - g.mu[0], dy = x[1] - g.mu[1];
  const q = (d * dx * dx - 2 * b * dx * dy + a * dy * dy) / det;
  return Math.exp(-0.5 * q) / (2 * Math.PI * Math.sqrt(det));
};
function emRun(X: number[][], K: number, iters: number, seed: number) {
  const g = rng(seed);
  let G: Gauss[] = g.shuffle(range(X.length)).slice(0, K).map((i) => ({ pi: 1 / K, mu: [...X[i]], S: [[1.5, 0], [0, 1.5]] }));
  const out: { G: Gauss[]; R: number[][]; ll: number }[] = [];
  for (let it = 0; it <= iters; it++) {
    const P = X.map((x) => G.map((c) => c.pi * gpdf(x, c)));
    const R = P.map((p) => {
      const s = sum(p) || 1e-300;
      return p.map((v) => v / s);
    });
    const ll = sum(P.map((p) => Math.log(sum(p) || 1e-300)));
    out.push({ G, R, ll });
    G = range(K).map((k) => {
      const Nk = sum(R.map((r) => r[k])) || 1e-9;
      const mu = [sum(X.map((x, i) => R[i][k] * x[0])) / Nk, sum(X.map((x, i) => R[i][k] * x[1])) / Nk];
      const S = [[0, 0], [0, 0]];
      X.forEach((x, i) => {
        const dx = [x[0] - mu[0], x[1] - mu[1]];
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) S[a][b] += (R[i][k] * dx[a] * dx[b]) / Nk;
      });
      S[0][0] += 1e-3;
      S[1][1] += 1e-3;
      return { pi: Nk / X.length, mu, S };
    });
  }
  return out;
}
const mix3 = (r: number[]) => {
  const t = r[1] + r[2] || 1e-9;
  const inner = `color-mix(in oklab, ${CL[1]} ${Math.round((100 * r[1]) / t)}%, ${CL[2]})`;
  return `color-mix(in oklab, ${CL[0]} ${Math.round(100 * r[0])}%, ${inner})`;
};
/**
 * ml.gmm-em — EM for a 3-component Gaussian mixture in 2-D: responsibilities as colour mixes, 2σ ellipses,
 * log-likelihood per iteration, and a draggable probe. params: iters (default 30), seed
 */
function GmmEM({ spec }: { spec: VizSpec }) {
  const iters = (spec.iters as number) ?? 30;
  const [seed, setSeed] = useState((spec.seed as number) ?? 3);
  const [probe, setProbe] = useState<P2>([5, 5]);
  const X = useMemo(() => {
    const g = rng(81);
    const out: number[][] = [];
    for (let i = 0; i < 60; i++) {
      const u = 1.6 * g.normal(), v = 0.4 * g.normal();
      out.push([3.2 + 0.8 * u - 0.6 * v, 6.2 + 0.6 * u + 0.8 * v]);
    }
    for (let i = 0; i < 45; i++) out.push([7 + 0.6 * g.normal(), 6.8 + 0.6 * g.normal()]);
    for (let i = 0; i < 45; i++) out.push([6.2 + 1.0 * g.normal(), 2.4 + 0.5 * g.normal()]);
    return out;
  }, []);
  const run = useMemo(() => emRun(X, 3, iters, seed), [X, iters, seed]);
  const player = usePlayer(run.length, { interval: 450 });
  const st = run[player.i];
  const pr = st.G.map((c) => c.pi * gpdf(probe, c));
  const prs = sum(pr) || 1e-300;
  const ell = (c: Gauss) => {
    const { values, V } = eigSym(c.S);
    return (t: number): P2 => {
      const a = 2 * Math.sqrt(Math.max(values[0], 1e-9)) * Math.cos(t), b = 2 * Math.sqrt(Math.max(values[1], 1e-9)) * Math.sin(t);
      return [c.mu[0] + V[0][0] * a + V[0][1] * b, c.mu[1] + V[1][0] * a + V[1][1] * b];
    };
  };
  return (
    <FigureLayout
      side={
        <>
          {player.controls}
          <Btn onClick={() => { setSeed(seed + 1); player.setI(0); }}>new initialization</Btn>
          <Readout
            rows={[
              ['\\text{iteration}', String(player.i)],
              ['\\log p(\\text{data})', fx(st.ll, 1)],
              ...st.G.map((c, k) => [`\\pi_${k + 1}`, fx(c.pi, 2)] as [string, string]),
            ]}
          />
          <Readout title="probe point (drag it)" rows={pr.map((p, k) => [`r_{${k + 1}}`, fx(p / prs, 3)] as [string, string])} />
          <div className="ml2-note">Each point is coloured by its responsibilities: a pure colour means one component claims it; mixed colours mark points the model is unsure about. k-means would force each of them into exactly one cluster.</div>
        </>
      }
      below={
        <Panel title="log-likelihood per iteration (never decreases)">
          <LinePlot height={130} x={[0, iters]} xlabel="iteration" series={[{ pts: run.map((r, i) => [i, r.ll] as [number, number]), color: 'var(--c-u)' }]} legend={false} vlines={[{ x: player.i, color: 'var(--accent)' }]} />
        </Panel>
      }
    >
      <Plane x={[0, 10]} y={[0, 10]} width={380} gridStep={2}>
        <Dots pts={X as P2[]} color={(i) => mix3(st.R[i])} r={3.8} />
        {st.G.map((c, k) => (
          <g key={k}>
            <ParamCurve f={ell(c)} color={CL[k]} width={2.2} />
          </g>
        ))}
        <Dots pts={st.G.map((c) => c.mu as P2)} color={(k) => CL[k]} r={6} stroke="var(--fg)" />
        <Handle at={probe} onChange={setProbe} color="var(--fg)" snap={0.1} label="probe" text="probe" />
      </Plane>
    </FigureLayout>
  );
}

// ======================================================================= t-SNE vs PCA

function tsne(X: number[][], perp: number, seed: number, iters = 600) {
  const n = X.length;
  const D = X.map((a) => X.map((b) => d2(a, b)));
  // conditional probabilities with a per-point bandwidth matching the perplexity
  const P = range(n).map(() => new Array(n).fill(0));
  const H = Math.log(perp);
  for (let i = 0; i < n; i++) {
    let lo = -Infinity, hi = Infinity, beta = 1;
    for (let t = 0; t < 60; t++) {
      let s = 0;
      for (let j = 0; j < n; j++) if (j !== i) s += (P[i][j] = Math.exp(-D[i][j] * beta));
      let h = 0;
      for (let j = 0; j < n; j++) if (j !== i) {
        P[i][j] /= s || 1e-300;
        if (P[i][j] > 1e-12) h -= P[i][j] * Math.log(P[i][j]);
      }
      if (Math.abs(h - H) < 1e-5) break;
      if (h > H) {
        lo = beta;
        beta = hi === Infinity ? beta * 2 : (beta + hi) / 2;
      } else {
        hi = beta;
        beta = lo === -Infinity ? beta / 2 : (beta + lo) / 2;
      }
    }
  }
  const Pj = range(n).map((i) => range(n).map((j) => Math.max((P[i][j] + P[j][i]) / (2 * n), 1e-12)));
  const g = rng(seed);
  const Y = range(n).map(() => [1e-2 * g.normal(), 1e-2 * g.normal()]);
  const V = range(n).map(() => [0, 0]);
  const gains = range(n).map(() => [1, 1]);
  const Q = range(n).map(() => new Array(n).fill(0));
  for (let it = 0; it < iters; it++) {
    const ex = it < 100 ? 12 : 1;
    let Z = 0;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const q = 1 / (1 + (Y[i][0] - Y[j][0]) ** 2 + (Y[i][1] - Y[j][1]) ** 2);
        Q[i][j] = Q[j][i] = q;
        Z += 2 * q;
      }
    const mom = it < 100 ? 0.5 : 0.8;
    for (let i = 0; i < n; i++) {
      let gx = 0, gy = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const m = 4 * (ex * Pj[i][j] - Q[i][j] / Z) * Q[i][j];
        gx += m * (Y[i][0] - Y[j][0]);
        gy += m * (Y[i][1] - Y[j][1]);
      }
      const gr = [gx, gy];
      for (let d = 0; d < 2; d++) {
        gains[i][d] = Math.sign(gr[d]) !== Math.sign(V[i][d]) ? gains[i][d] + 0.2 : Math.max(0.01, gains[i][d] * 0.8);
        V[i][d] = mom * V[i][d] - 50 * gains[i][d] * gr[d];
      }
    }
    for (let i = 0; i < n; i++) {
      Y[i][0] += V[i][0];
      Y[i][1] += V[i][1];
    }
    const mx = mean(Y.map((p) => p[0])), my = mean(Y.map((p) => p[1]));
    Y.forEach((p) => {
      p[0] -= mx;
      p[1] -= my;
    });
  }
  return Y;
}
function clusterStats(Y: number[][], lab: number[]) {
  const cen = [0, 1, 2].map((c) => {
    const m = Y.filter((_, i) => lab[i] === c);
    return Y[0].map((_, d) => mean(m.map((p) => p[d])));
  });
  const rad = [0, 1, 2].map((c) => Math.sqrt(mean(Y.filter((_, i) => lab[i] === c).map((p) => d2(p, cen[c])))));
  return { cen, rad, ab: Math.sqrt(d2(cen[0], cen[1])), ac: Math.sqrt(d2(cen[0], cen[2])) };
}
/**
 * ml.tsne — three clusters in 10-D (A tight, B five times wider, C three times farther from A than B is),
 * embedded with t-SNE at a chosen perplexity or projected with PCA; compares sizes and distances.
 * params: perplexity (5 | 15 | 30 | 50, default 30), view ('tsne' | 'pca')
 */
function TSNE({ spec }: { spec: VizSpec }) {
  const [perp, setPerp] = useState<number>((spec.perplexity as number) ?? 30);
  const [view, setView] = useState<'tsne' | 'pca'>((spec.view as 'tsne' | 'pca') ?? 'tsne');
  const [seed, setSeed] = useState(1);
  const data = useMemo(() => {
    const g = rng(64);
    const X: number[][] = [], lab: number[] = [];
    const add = (cnt: number, c: number, centre: number[], s: number) => {
      for (let i = 0; i < cnt; i++) {
        X.push(range(10).map((d) => centre[d] + s * g.normal()));
        lab.push(c);
      }
    };
    const z = new Array(10).fill(0);
    add(45, 0, z, 0.5);
    add(45, 1, z.map((_, d) => (d === 0 ? 12 : 0)), 2.5);
    add(30, 2, z.map((_, d) => (d === 1 ? 36 : 0)), 0.5);
    return { X, lab };
  }, []);
  const orig = useMemo(() => clusterStats(data.X, data.lab), [data]);
  const emb = useMemo(() => {
    if (view === 'pca') {
      const m = data.X[0].map((_, d) => mean(data.X.map((x) => x[d])));
      const C = m.map((_, a) => m.map((_, b) => mean(data.X.map((x) => (x[a] - m[a]) * (x[b] - m[b])))));
      const { V } = eigSym(C);
      const p = V.length;
      return data.X.map((x) => [0, 1].map((c) => x.reduce((s, v, d) => s + (v - m[d]) * V[d][p - 1 - c], 0)));
    }
    return tsne(data.X, perp, seed);
  }, [data, perp, seed, view]);
  const es = clusterStats(emb, data.lab);
  const bx = [Math.min(...emb.map((p) => p[0])), Math.max(...emb.map((p) => p[0]))];
  const by = [Math.min(...emb.map((p) => p[1])), Math.max(...emb.map((p) => p[1]))];
  const span = Math.max(bx[1] - bx[0], by[1] - by[0]) * 1.12 || 1;
  const toPlot = (p: number[]): P2 => [5 + (10 * (p[0] - (bx[0] + bx[1]) / 2)) / span, 5 + (10 * (p[1] - (by[0] + by[1]) / 2)) / span];
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={view} onChange={setView} options={[{ v: 'tsne', label: 't-SNE' }, { v: 'pca', label: 'PCA (linear)' }]} />
          {view === 'tsne' && <SegControl label="perplexity" value={perp} onChange={setPerp} options={[5, 15, 30, 50].map((v) => ({ v, label: String(v) }))} />}
          {view === 'tsne' && <Btn onClick={() => setSeed(seed + 1)}>re-run with a new seed</Btn>}
          <table className="ml2-table">
            <thead>
              <tr>
                <th />
                <th>10-D data</th>
                <th>2-D plot</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>size B / size A</td>
                <td>{fx(orig.rad[1] / orig.rad[0], 1)}</td>
                <td>{fx(es.rad[1] / es.rad[0], 1)}</td>
              </tr>
              <tr>
                <td>size C / size A</td>
                <td>{fx(orig.rad[2] / orig.rad[0], 1)}</td>
                <td>{fx(es.rad[2] / es.rad[0], 1)}</td>
              </tr>
              <tr>
                <td>dist A–C / dist A–B</td>
                <td>{fx(orig.ac / orig.ab, 1)}</td>
                <td>{fx(es.ac / es.ab, 1)}</td>
              </tr>
            </tbody>
          </table>
          <div className="ml2-note">
            {view === 'tsne' ? (
              <>t-SNE keeps the three groups apart, which is what it is for. It does not keep their sizes or the distances between them: compare the two columns.</>
            ) : (
              <>PCA is a linear projection, so sizes and distances along the kept directions are faithful. The price is overlap when structure lies in the dropped directions.</>
            )}
          </div>
        </>
      }
    >
      <div className="ml2-stack">
        <Plane x={[0, 10]} y={[0, 10]} width={360} grid={false} axes={false}>
          <Dots pts={emb.map(toPlot)} color={(i) => CL[data.lab[i]]} r={3.6} />
        </Plane>
        <Legend items={[{ color: CL[0], label: 'A: tight', dot: true }, { color: CL[1], label: 'B: spread 5× that of A', dot: true }, { color: CL[2], label: 'C: 3× farther from A than B is', dot: true }]} />
      </div>
    </FigureLayout>
  );
}

// ======================================================================= anomaly detection

/**
 * ml.anomaly — correlated 2-D Gaussian data with six planted anomalies. Flags the top q% by per-feature
 * z-score, Mahalanobis distance or k-NN distance, and draws each detector's boundary.
 * params: method ('z' | 'maha' | 'knn'), q (percent flagged, default 4)
 */
function Anomaly({ spec }: { spec: VizSpec }) {
  const [method, setMethod] = useState<'z' | 'maha' | 'knn'>((spec.method as 'z' | 'maha' | 'knn') ?? 'z');
  const [q, setQ] = useState((spec.q as number) ?? 4);
  const data = useMemo(() => {
    const g = rng(12);
    const rho = 0.85;
    const X: number[][] = range(200).map(() => {
      const a = g.normal(), b = g.normal();
      return [a, rho * a + Math.sqrt(1 - rho * rho) * b];
    });
    const planted = [[3.9, 3.7], [3.6, 0.3], [-1.6, 1.5], [1.5, -1.4], [-3.6, -3.3], [0.9, -2.0]];
    return { X: [...X, ...planted], planted: new Set(range(6).map((i) => 200 + i)) };
  }, []);
  const stats = useMemo(() => {
    const X = data.X;
    const m = [mean(X.map((p) => p[0])), mean(X.map((p) => p[1]))];
    const s = [0, 1].map((d) => Math.sqrt(mean(X.map((p) => (p[d] - m[d]) ** 2))));
    const c = mean(X.map((p) => (p[0] - m[0]) * (p[1] - m[1])));
    const S = [[s[0] ** 2, c], [c, s[1] ** 2]];
    const det = S[0][0] * S[1][1] - c * c;
    const Si = [[S[1][1] / det, -c / det], [-c / det, S[0][0] / det]];
    const maha = (p: number[]) => {
      const dx = p[0] - m[0], dy = p[1] - m[1];
      return Math.sqrt(Si[0][0] * dx * dx + 2 * Si[0][1] * dx * dy + Si[1][1] * dy * dy);
    };
    const zs = (p: number[]) => Math.max(Math.abs(p[0] - m[0]) / s[0], Math.abs(p[1] - m[1]) / s[1]);
    const knn = (p: number[], self = -1) => {
      const ds = X.map((x, i) => (i === self ? Infinity : Math.sqrt(d2(x, p)))).sort((a, b) => a - b);
      return mean(ds.slice(0, 5));
    };
    const L = [[Math.sqrt(S[0][0]), 0], [0, 0]];
    L[1][0] = S[1][0] / L[0][0];
    L[1][1] = Math.sqrt(S[1][1] - L[1][0] ** 2);
    return { m, s, S, maha, zs, knn, L };
  }, [data]);
  const score = (i: number) => (method === 'z' ? stats.zs(data.X[i]) : method === 'maha' ? stats.maha(data.X[i]) : stats.knn(data.X[i], i));
  const scores = useMemo(() => data.X.map((_, i) => score(i)), [method, data, stats]); // eslint-disable-line react-hooks/exhaustive-deps
  const nFlag = Math.max(1, Math.round((q / 100) * data.X.length));
  const thr = [...scores].sort((a, b) => b - a)[nFlag - 1];
  const flagged = scores.map((v) => v >= thr);
  const caught = [...data.planted].filter((i) => flagged[i]).length;
  const fp = flagged.filter((f, i) => f && !data.planted.has(i)).length;
  const knnF = useMemo(() => (a: number, b: number) => stats.knn([a, b]), [stats]);
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={method} onChange={setMethod} options={[{ v: 'z', label: 'z-score' }, { v: 'maha', label: 'Mahalanobis' }, { v: 'knn', label: 'k-NN dist.' }]} />
          <Slider label="flag top %" value={q} min={1} max={10} step={0.5} onChange={setQ} />
          <Readout
            rows={[
              ['\\text{flagged}', String(flagged.filter(Boolean).length)],
              ['\\text{planted anomalies caught}', `${caught} / 6`],
              ['\\text{normal points flagged}', String(fp)],
              ['\\text{threshold on the score}', fx(thr, 2)],
            ]}
          />
          <div className="ml2-note">
            {method === 'z' && <>Per-feature z-scores flag points far out on some axis. The two points that break the correlation sit inside the box and are missed.</>}
            {method === 'maha' && <>Mahalanobis distance <TeX>{'\\sqrt{(\\mathbf{x}-\\boldsymbol\\mu)^\\top\\Sigma^{-1}(\\mathbf{x}-\\boldsymbol\\mu)}'}</TeX> measures distance in units of the data's own spread and correlation, so its boundary is an ellipse.</>}
            {method === 'knn' && <>The mean distance to the 5 nearest neighbours makes no assumption about the shape of the data: any point in a sparse region scores high.</>}
          </div>
        </>
      }
    >
      <div className="ml2-stack">
        <Plane x={[-5, 5]} y={[-5, 5]} width={380} gridStep={1}>
          {method === 'z' && <ZBox m={stats.m} s={stats.s} t={thr} />}
          {method === 'maha' && <ParamCurve f={(t) => [stats.m[0] + thr * stats.L[0][0] * Math.cos(t), stats.m[1] + thr * (stats.L[1][0] * Math.cos(t) + stats.L[1][1] * Math.sin(t))]} color="var(--accent)" width={2} dashed />}
          {method === 'knn' && <Contours f={knnF} levels={[thr]} color="var(--accent)" width={2} n={50} />}
          <Dots pts={data.X as P2[]} color={(i) => (flagged[i] ? 'var(--c-err)' : 'var(--muted)')} r={(i) => (data.planted.has(i) ? 5 : 3)} opacity={(i) => (flagged[i] || data.planted.has(i) ? 1 : 0.6)} />
          <Dots pts={[...data.planted].map((i) => data.X[i] as P2)} color="var(--fg)" ring r={8} />
        </Plane>
        <Legend items={[{ color: 'var(--c-err)', label: 'flagged', dot: true }, { color: 'var(--muted)', label: 'not flagged', dot: true }, { color: 'var(--fg)', label: 'circled: planted anomaly', dot: true }, { color: 'var(--accent)', label: 'detector boundary', dashed: true }]} />
      </div>
    </FigureLayout>
  );
}
function ZBox({ m, s, t }: { m: number[]; s: number[]; t: number }) {
  const pts: P2[] = [
    [m[0] - t * s[0], m[1] - t * s[1]],
    [m[0] + t * s[0], m[1] - t * s[1]],
    [m[0] + t * s[0], m[1] + t * s[1]],
    [m[0] - t * s[0], m[1] + t * s[1]],
  ];
  return (
    <g>
      {pts.map((p, i) => (
        <Seg key={i} a={p} b={pts[(i + 1) % 4]} color="var(--accent)" width={2} dashed />
      ))}
    </g>
  );
}

export const unsupViz = {
  'ml.knn': { component: KNN, doc: 'k-NN regions with draggable query, L1/L2, scale on x2, error vs k. params k, scale, metric' },
  'ml.dist-concentration': { component: DistConcentration, doc: 'Histogram of pairwise distances / mean as dimension grows; std/mean vs d. params dist, d' },
  'ml.kmeans': {
    component: KMeans,
    validate: (s: VizSpec) => (s.data !== undefined && !['blobs', 'unequal', 'aniso', 'rings'].includes(s.data as string) ? 'data must be blobs | unequal | aniso | rings' : null),
    doc: "Lloyd's algorithm step by step with J per half-step. params data, k, init ('random' | 'pp'), seed",
  },
  'ml.choose-k': { component: ChooseK, doc: 'Elbow (J vs k) and mean silhouette vs k with the clustering for the chosen k. params data, k' },
  'ml.gmm-em': { component: GmmEM, doc: 'EM for a 3-component 2-D Gaussian mixture: responsibilities, ellipses, log-likelihood, probe. params iters, seed' },
  'ml.tsne': {
    component: TSNE,
    validate: (s: VizSpec) => (s.perplexity !== undefined && ![5, 15, 30, 50].includes(s.perplexity as number) ? 'perplexity must be 5, 15, 30 or 50' : null),
    doc: 't-SNE (or PCA) of three 10-D clusters with different sizes and distances; table of size/distance ratios. params perplexity, view',
  },
  'ml.anomaly': { component: Anomaly, doc: 'z-score vs Mahalanobis vs k-NN distance anomaly detectors on correlated data. params method, q' },
};
