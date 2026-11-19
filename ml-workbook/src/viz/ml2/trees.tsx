// ml04 figures: greedy tree splits, depth vs overfitting, regression trees, bagging,
// averaging correlated predictors, gradient boosting stage by stage, AdaBoost reweighting.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Curve, Path, Seg, Heat, Slider, Readout, FigureLayout, SegControl, Toggle, LinePlot, TeX, usePlayer, Label, usePlane } from '../kit';
import { fx, rng, range, mean, sum, CLASS, Dots, Rect, Panel, Legend, growTree, candidates, impurity, regTree1D, leafAt, leafPath, type Crit, type TNode, type Leaf } from './common';
import './ml2.css';

// ======================================================================= greedy splits (key figure)

/** 20 labelled points on a 10×10 grid (integer coordinates), used in lesson ml04-1 */
export const TREE_PTS: [number, number, number][] = [
  [1, 2, 0], [2, 6, 0], [2, 8, 0], [3, 3, 0], [1, 9, 1], [3, 7, 0], [4, 1, 0], [4, 5, 0],
  [5, 8, 1], [6, 2, 0], [6, 6, 1], [7, 9, 1], [7, 4, 1], [8, 1, 0], [8, 7, 1], [9, 3, 1], [9, 5, 1], [5, 4, 0], [3, 9, 1], [8, 9, 1],
];

function TreeDiagram({ nodes, split, next, width = 500 }: { nodes: TNode[]; split: Set<number>; next?: number; width?: number }) {
  // in-order positions of the visible tree
  const pos = new Map<number, { x: number; y: number }>();
  let col = 0;
  let maxD = 0;
  const walk = (id: number) => {
    const n = nodes[id];
    maxD = Math.max(maxD, n.depth);
    if (split.has(id)) {
      walk(n.left!);
      pos.set(id, { x: col - 0.5, y: n.depth });
      walk(n.right!);
    } else pos.set(id, { x: col++, y: n.depth });
  };
  walk(0);
  const leaves = col;
  const nw = 62, nh = 34, vy = 54;
  const W = Math.max(width, leaves * (nw + 6));
  const H = (maxD + 1) * vy + 6;
  const X = (c: number) => ((c + 0.5) / leaves) * (W - 10) + 5;
  const Y = (d: number) => d * vy + 4;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="ml2-svg" style={{ maxWidth: W }} role="img" aria-label="tree diagram">
      {[...pos.entries()].map(([id, p]) => {
        const n = nodes[id];
        if (!split.has(id)) return null;
        return [n.left!, n.right!].map((c) => {
          const q = pos.get(c)!;
          return <path key={id + '-' + c} d={`M${X(p.x)},${Y(p.y) + nh} L${X(q.x)},${Y(q.y)}`} className="ml2-edge" />;
        });
      })}
      {[...pos.entries()].map(([id, p]) => {
        const n = nodes[id];
        const tot = sum(n.counts);
        const maj = n.counts[1] > n.counts[0] ? 1 : 0;
        const internal = split.has(id);
        return (
          <g key={id} className={'ml2-node' + (id === next ? ' next' : '')} transform={`translate(${X(p.x) - nw / 2}, ${Y(p.y)})`}>
            <rect width={nw} height={nh} rx={5} style={{ fill: internal ? 'var(--surface2)' : `color-mix(in oklab, ${CLASS[maj]} ${Math.round(18 + 30 * (n.counts[maj] / tot))}%, var(--surface))`, stroke: internal ? 'var(--line)' : CLASS[maj] }} />
            <text x={nw / 2} y={14} textAnchor="middle">
              {internal ? `x${n.feat! + 1} ≤ ${n.thr}` : `${n.counts[0]} | ${n.counts[1]}`}
            </text>
            <text x={nw / 2} y={28} textAnchor="middle" style={{ fill: 'var(--muted)', fontSize: 10 }}>
              {internal ? `${n.counts[0]} | ${n.counts[1]}` : `I=${fx(n.imp, 3)}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * ml.tree-split — step through greedy axis-aligned splits on 20 labelled points. Shows the partition,
 * the weighted child impurity of every candidate threshold for the node being split, and the growing tree.
 * The learner can also try any threshold. params: crit ('gini' | 'entropy'), maxDepth (default 4)
 */
function TreeSplit({ spec }: { spec: VizSpec }) {
  const [crit, setCrit] = useState<Crit>((spec.crit as Crit) ?? 'gini');
  const [tf, setTf] = useState(0);
  const [tt, setTt] = useState(4.5);
  const [tryIt, setTryIt] = useState(false);
  const X = useMemo(() => TREE_PTS.map((p) => [p[0], p[1]]), []);
  const y = useMemo(() => TREE_PTS.map((p) => p[2]), []);
  const tree = useMemo(() => growTree(X, y, crit, (spec.maxDepth as number) ?? 4), [X, y, crit, spec.maxDepth]);
  const player = usePlayer(tree.order.length + 1, { interval: 1200 });
  const s = Math.min(player.i, tree.order.length);
  const split = new Set(tree.order.slice(0, s));
  const nextId = s < tree.order.length ? tree.order[s] : undefined;
  const nx = nextId !== undefined ? tree.nodes[nextId] : undefined;
  const leaves: TNode[] = [];
  const collect = (id: number): void => {
    if (split.has(id)) {
      collect(tree.nodes[id].left!);
      collect(tree.nodes[id].right!);
    } else leaves.push(tree.nodes[id]);
  };
  collect(0);
  const cands = nx ? [0, 1].map((f) => candidates(X, y, nx.idx, f, crit)) : [[], []];
  // the learner's trial split of the next node (or the root when done)
  const target = nx ?? tree.nodes[0];
  const trial = (() => {
    const L = target.idx.filter((i) => X[i][tf] <= tt), R = target.idx.filter((i) => X[i][tf] > tt);
    const cnt = (ids: number[]) => [ids.filter((i) => y[i] === 0).length, ids.filter((i) => y[i] === 1).length];
    const w = (L.length * impurity(cnt(L), crit) + R.length * impurity(cnt(R), crit)) / target.idx.length;
    return { L: cnt(L), R: cnt(R), w, gain: target.imp - w };
  })();
  const train = mean(range(y.length).map((i) => {
    const leaf = leaves.find((l) => l.idx.includes(i))!;
    return (leaf.counts[1] > leaf.counts[0] ? 1 : 0) === y[i] ? 1 : 0;
  }));
  const yMax = crit === 'gini' ? 0.55 : 1.05;
  return (
    <FigureLayout
      side={
        <>
          <SegControl
            label="impurity"
            value={crit}
            onChange={(c) => {
              setCrit(c);
              player.setI(0);
            }}
            options={[
              { v: 'gini', label: 'Gini' },
              { v: 'entropy', label: 'entropy' },
            ]}
          />
          {player.controls}
          <Readout
            title={nx ? 'next split (highlighted node)' : 'tree finished'}
            rows={
              nx
                ? [
                    ['\\text{node counts } (0 \\mid 1)', `${nx.counts[0]} | ${nx.counts[1]}`],
                    ['I(\\text{node})', fx(nx.imp, 4)],
                    ['\\text{best split}', `x${nx.feat! + 1} ≤ ${nx.thr}`],
                    ['\\text{weighted } I(\\text{children})', fx(nx.imp - nx.gain!, 4)],
                    ['\\text{decrease } \\Delta I', fx(nx.gain!, 4)],
                  ]
                : [
                    ['\\text{leaves}', String(leaves.length)],
                    ['\\text{training accuracy}', fx(train, 2)],
                  ]
            }
          />
          <Toggle label="try your own split of this node" value={tryIt} onChange={setTryIt} />
          {tryIt && (
            <>
              <SegControl value={tf} onChange={setTf} options={[{ v: 0, label: 'x1' }, { v: 1, label: 'x2' }]} />
              <Slider label="threshold" value={tt} min={0.5} max={9.5} step={0.5} onChange={setTt} />
              <Readout
                rows={[
                  ['\\text{left, right}', `${trial.L[0]}|${trial.L[1]},  ${trial.R[0]}|${trial.R[1]}`],
                  ['\\text{weighted } I', fx(trial.w, 4)],
                  ['\\Delta I', fx(trial.gain, 4)],
                ]}
              />
            </>
          )}
        </>
      }
      below={
        <>
          <Panel title={nx ? `weighted child impurity of every candidate split of the highlighted node (${crit})` : 'all nodes are pure or at maximum depth'}>
            {nx && (
              <LinePlot
                height={170}
                x={[0, 10]}
                y={[Math.max(0, Math.min(...cands.flat().map((c) => c.w)) - 0.08), Math.min(yMax, nx.imp + 0.05)]}
                xlabel="threshold"
                legend={false}
                series={[
                  { pts: cands[0].map((c) => [c.thr, c.w] as [number, number]), color: 'var(--c-u)', label: 'split on x1' },
                  { pts: cands[1].map((c) => [c.thr, c.w] as [number, number]), color: 'var(--c-k)', label: 'split on x2' },
                ]}
                hlines={[{ y: nx.imp, color: 'var(--muted)' }]}
              >
                {(sx, sy) => (
                  <g>
                    {cands.map((cs, f) => cs.map((c, j) => <circle key={f + '-' + j} cx={sx(c.thr)} cy={sy(c.w)} r={3} style={{ fill: f ? 'var(--c-k)' : 'var(--c-u)' }} />))}
                    <circle cx={sx(nx.thr!)} cy={sy(nx.imp - nx.gain!)} r={7} style={{ fill: 'none', stroke: 'var(--accent)', strokeWidth: 2.5 }} />
                  </g>
                )}
              </LinePlot>
            )}
          </Panel>
          {nx && <Legend items={[{ color: 'var(--c-u)', label: 'thresholds on x1' }, { color: 'var(--c-k)', label: 'thresholds on x2' }, { color: 'var(--muted)', label: 'impurity of the node itself', dashed: true }]} />}
          <Panel title="the tree so far (leaf boxes show class counts 0 | 1)">
            <TreeDiagram nodes={tree.nodes} split={split} next={nextId} />
          </Panel>
        </>
      }
    >
      <div className="ml2-stack">
        <Plane x={[0, 10]} y={[0, 10]} width={380} gridStep={1}>
          {leaves.map((l) => {
            const t = sum(l.counts);
            const maj = l.counts[1] > l.counts[0] ? 1 : 0;
            return <Rect key={l.id} x={l.box[0]} y={l.box[1]} fill={l.counts[0] === l.counts[1] ? 'var(--muted)' : CLASS[maj]} opacity={0.06 + 0.16 * (t ? l.counts[maj] / t : 0)} />;
          })}
          {tree.order.slice(0, s).map((id) => {
            const n = tree.nodes[id];
            const a: [number, number] = n.feat === 0 ? [n.thr!, n.box[1][0]] : [n.box[0][0], n.thr!];
            const b: [number, number] = n.feat === 0 ? [n.thr!, n.box[1][1]] : [n.box[0][1], n.thr!];
            return <Seg key={id} a={a} b={b} color="var(--fg)" width={2} />;
          })}
          {nx && <Rect x={nx.box[0]} y={nx.box[1]} fill="none" opacity={0} stroke="var(--accent)" width={2.5} dashed />}
          {nx && <Seg a={nx.feat === 0 ? [nx.thr!, nx.box[1][0]] : [nx.box[0][0], nx.thr!]} b={nx.feat === 0 ? [nx.thr!, nx.box[1][1]] : [nx.box[0][1], nx.thr!]} color="var(--accent)" width={2} dashed />}
          {tryIt && <Seg a={tf === 0 ? [tt, target.box[1][0]] : [target.box[0][0], tt]} b={tf === 0 ? [tt, target.box[1][1]] : [target.box[0][1], tt]} color="var(--c-err)" width={2.5} />}
          <Dots pts={X as [number, number][]} color={(i) => CLASS[y[i]]} r={5.5} />
          <Label at={[9.6, 0.4]} text="x1" color="var(--muted)" />
          <Label at={[0.4, 9.6]} text="x2" color="var(--muted)" />
        </Plane>
        <Legend
          items={[
            { color: CLASS[0], label: 'class 0', dot: true },
            { color: CLASS[1], label: 'class 1', dot: true },
            { color: 'var(--accent)', label: 'next split', dashed: true },
            ...(tryIt ? [{ color: 'var(--c-err)', label: 'your split' }] : []),
          ]}
        />
      </div>
    </FigureLayout>
  );
}

// ======================================================================= depth and overfitting

function circleData(seed: number, n: number, flip: number) {
  const g = rng(seed);
  const X = range(n).map(() => [10 * g.next(), 10 * g.next()]);
  const y = X.map(([a, b]) => {
    const inside = (a - 5) ** 2 + (b - 5) ** 2 < 9 ? 1 : 0;
    return g.next() < flip ? 1 - inside : inside;
  });
  return { X, y };
}
function treePredictor(nodes: TNode[], split: Set<number>) {
  return (x: number[]) => {
    let n = nodes[0];
    while (split.has(n.id)) n = nodes[x[n.feat!] <= n.thr! ? n.left! : n.right!];
    const t = sum(n.counts);
    return t ? n.counts[1] / t : 0.5;
  };
}
/**
 * ml.tree-depth — a classification tree on noisy circular data: decision regions, train/test accuracy vs depth.
 * params: depth (default 3), minLeaf (default 1)
 */
function TreeDepth({ spec }: { spec: VizSpec }) {
  const [depth, setDepth] = useState((spec.depth as number) ?? 3);
  const [minLeaf, setMinLeaf] = useState((spec.minLeaf as number) ?? 1);
  const train = useMemo(() => circleData(11, 150, 0.12), []);
  const test = useMemo(() => circleData(12, 1500, 0.12), []);
  const tree = useMemo(() => growTree(train.X, train.y, 'gini', 14, minLeaf), [train, minLeaf]);
  const curves = useMemo(
    () =>
      range(14).map((d) => {
        const sp = new Set(tree.order.filter((id) => tree.nodes[id].depth < d + 1));
        const f = treePredictor(tree.nodes, sp);
        const acc = (D: { X: number[][]; y: number[] }) => mean(D.X.map((x, i) => ((f(x) > 0.5 ? 1 : 0) === D.y[i] ? 1 : 0)));
        return { d: d + 1, train: acc(train), test: acc(test), leaves: sp.size + 1 };
      }),
    [tree, train, test],
  );
  const sp = useMemo(() => new Set(tree.order.filter((id) => tree.nodes[id].depth < depth)), [tree, depth]);
  const f = useMemo(() => {
    const p = treePredictor(tree.nodes, sp);
    return (a: number, b: number) => p([a, b]);
  }, [tree, sp]);
  const c = curves[depth - 1];
  return (
    <FigureLayout
      side={
        <>
          <Slider label="max depth" value={depth} min={1} max={14} step={1} onChange={setDepth} />
          <Slider label="min samples per leaf" value={minLeaf} min={1} max={20} step={1} onChange={setMinLeaf} />
          <Readout
            rows={[
              ['\\text{leaves}', String(c.leaves)],
              ['\\text{train accuracy}', fx(c.train, 3)],
              ['\\text{test accuracy}', fx(c.test, 3)],
              ['\\text{best possible}', '0.880'],
            ]}
          />
          <div className="ml2-note">
            The true boundary is a circle and 12% of labels are flipped, so no classifier can beat 88% on test data. A deep tree carves out a box around every flipped label.
          </div>
        </>
      }
      below={
        <Panel title="accuracy versus max depth">
          <LinePlot
            height={170}
            x={[1, 14]}
            y={[0.5, 1]}
            xlabel="max depth"
            series={[
              { pts: curves.map((q) => [q.d, q.train] as [number, number]), color: 'var(--c-u)', label: 'train' },
              { pts: curves.map((q) => [q.d, q.test] as [number, number]), color: 'var(--c-err)', label: 'test' },
            ]}
            hlines={[{ y: 0.88, color: 'var(--muted)' }]}
            vlines={[{ x: depth, color: 'var(--accent)' }]}
          />
        </Panel>
      }
    >
      <div className="ml2-stack">
        <Plane x={[0, 10]} y={[0, 10]} width={380} gridStep={2}>
          <Heat f={f} res={60} range={[0, 1]} scheme="class" opacity={0.7} />
          <Path pts={range(121).map((i) => [5 + 3 * Math.cos((i / 120) * 2 * Math.PI), 5 + 3 * Math.sin((i / 120) * 2 * Math.PI)] as [number, number])} color="var(--fg)" width={1.5} dashed />
          <Dots pts={train.X as [number, number][]} color={(i) => CLASS[train.y[i]]} r={3.2} />
        </Plane>
        <Legend
          items={[
            { color: CLASS[0], label: 'class 0', dot: true },
            { color: CLASS[1], label: 'class 1', dot: true },
            { color: 'var(--fg)', label: 'true boundary', dashed: true },
          ]}
        />
      </div>
    </FigureLayout>
  );
}

// ======================================================================= 1-D regression data shared by several figures

const fTrue = (x: number) => Math.sin(x) + 0.2 * x;
const SIG = 0.35;
function reg1D(seed: number, n: number) {
  const g = rng(seed);
  const x = range(n).map(() => 10 * g.next()).sort((a, b) => a - b);
  const y = x.map((v) => fTrue(v) + SIG * g.normal());
  return { x, y };
}
const GX = range(201).map((i) => i / 20);
const testMSE = (pred: (x: number) => number) => mean(GX.map((x) => (pred(x) - fTrue(x)) ** 2)) + SIG * SIG;

/**
 * ml.regtree-1d — a regression tree on 1-D data: piecewise-constant fit, leaf means, SSE vs depth.
 * params: depth (default 2)
 */
function RegTree1D({ spec }: { spec: VizSpec }) {
  const [depth, setDepth] = useState((spec.depth as number) ?? 2);
  const [showRes, setShowRes] = useState(false);
  const D = useMemo(() => reg1D(5, 40), []);
  const fits = useMemo(
    () =>
      range(9).map((d) => {
        const leaves = regTree1D(D.x, D.y, d, 1, 0, 10);
        const sse = sum(D.x.map((x, i) => (leafAt(leaves, x) - D.y[i]) ** 2));
        return { leaves, sse, test: testMSE((x) => leafAt(leaves, x)) };
      }),
    [D],
  );
  const cur = fits[depth];
  return (
    <FigureLayout
      side={
        <>
          <Slider label="max depth" value={depth} min={0} max={8} step={1} onChange={setDepth} />
          <Toggle label="show residuals" value={showRes} onChange={setShowRes} />
          <Readout
            rows={[
              ['\\text{leaves}', String(cur.leaves.length)],
              ['\\text{SSE (train)}', fx(cur.sse, 2)],
              ['\\text{train MSE}', fx(cur.sse / D.x.length, 3)],
              ['\\text{test MSE}', fx(cur.test, 3)],
              ['\\sigma^2', fx(SIG * SIG, 3)],
            ]}
          />
          <div className="ml2-note">Each split is placed where it lowers the total squared error the most; each leaf predicts the mean of its points.</div>
        </>
      }
      below={
        <Panel title="train and test MSE versus depth">
          <LinePlot
            height={150}
            x={[0, 8]}
            y={[0, Math.max(...fits.map((q) => q.test)) * 1.05]}
            xlabel="max depth"
            series={[
              { pts: fits.map((q, d) => [d, q.sse / D.x.length] as [number, number]), color: 'var(--c-u)', label: 'train' },
              { pts: fits.map((q, d) => [d, q.test] as [number, number]), color: 'var(--c-err)', label: 'test' },
            ]}
            hlines={[{ y: SIG * SIG, color: 'var(--muted)' }]}
            vlines={[{ x: depth, color: 'var(--accent)' }]}
          />
        </Panel>
      }
    >
      <Plane x={[0, 10]} y={[-1.5, 3.5]} width={460} height={250} gridStep={1}>
        <Curve f={fTrue} color="var(--fg)" dashed width={1.5} />
        {showRes && D.x.map((x, i) => <Seg key={i} a={[x, D.y[i]]} b={[x, leafAt(cur.leaves, x)]} color="var(--c-err)" width={1.5} />)}
        {cur.leaves.slice(1).map((l, i) => <Seg key={'b' + i} a={[l.lo, -1.5]} b={[l.lo, 3.5]} color="var(--muted)" dashed opacity={0.6} />)}
        <Path pts={leafPath(cur.leaves, 0, 10)} color="var(--c-u)" width={3} />
        <Dots pts={D.x.map((x, i) => [x, D.y[i]])} color="var(--fg)" r={3.2} />
      </Plane>
    </FigureLayout>
  );
}

// ======================================================================= bagging

/**
 * ml.bagging — fully grown regression trees on bootstrap samples of 1-D data, and their average.
 * params: B (default 1)
 */
function Bagging({ spec }: { spec: VizSpec }) {
  const [B, setB] = useState((spec.B as number) ?? 1);
  const [showTrees, setShowTrees] = useState(true);
  const D = useMemo(() => reg1D(5, 40), []);
  const bag = useMemo(() => {
    const g = rng(2024);
    const n = D.x.length;
    const trees: { leaves: Leaf[]; inBag: Set<number> }[] = [];
    for (let b = 0; b < 100; b++) {
      const idx = range(n).map(() => Math.floor(g.next() * n));
      trees.push({ leaves: regTree1D(idx.map((i) => D.x[i]), idx.map((i) => D.y[i]), 30, 1, 0, 10), inBag: new Set(idx) });
    }
    const gridPred = trees.map((t) => GX.map((x) => leafAt(t.leaves, x)));
    const ptPred = trees.map((t) => D.x.map((x) => leafAt(t.leaves, x)));
    const curve = range(100).map((b) => {
      const B1 = b + 1;
      const avg = GX.map((_, j) => mean(gridPred.slice(0, B1).map((p) => p[j])));
      const test = mean(GX.map((x, j) => (avg[j] - fTrue(x)) ** 2)) + SIG * SIG;
      const oobE: number[] = [];
      D.x.forEach((_, i) => {
        const ps = range(B1).filter((k) => !trees[k].inBag.has(i)).map((k) => ptPred[k][i]);
        if (ps.length) oobE.push((mean(ps) - D.y[i]) ** 2);
      });
      return { avg, test, oob: oobE.length ? mean(oobE) : NaN, covered: oobE.length };
    });
    const single = mean(gridPred.map((p) => mean(GX.map((x, j) => (p[j] - fTrue(x)) ** 2)) + SIG * SIG));
    return { trees, gridPred, curve, single, oobFrac: mean(trees.map((t) => 1 - t.inBag.size / n)) };
  }, [D]);
  const cur = bag.curve[B - 1];
  return (
    <FigureLayout
      side={
        <>
          <Slider label="trees B" value={B} min={1} max={100} step={1} onChange={setB} />
          <Toggle label="show individual trees (first 20)" value={showTrees} onChange={setShowTrees} />
          <Readout
            rows={[
              ['\\text{test MSE, one tree (avg)}', fx(bag.single, 3)],
              ['\\text{test MSE, bagged}', fx(cur.test, 3)],
              ['\\text{OOB MSE}', Number.isFinite(cur.oob) ? fx(cur.oob, 3) : '–'],
              ['\\text{points with an OOB tree}', `${cur.covered}/40`],
              ['\\text{avg. out-of-bag fraction}', fx(bag.oobFrac, 3)],
            ]}
          />
          <div className="ml2-note">Each tree interpolates its own bootstrap sample, so single trees are very noisy. Their average is much smoother. The OOB error estimates test error using, for each point, only trees that never saw it.</div>
        </>
      }
      below={
        <Panel title="error versus number of trees">
          <LinePlot
            height={160}
            x={[1, 100]}
            y={[0, Math.max(bag.single * 1.6, 0.4)]}
            xlabel="B"
            series={[
              { pts: bag.curve.map((c, b) => [b + 1, c.test] as [number, number]), color: 'var(--c-err)', label: 'test MSE (bagged)' },
              { pts: bag.curve.map((c, b) => [b + 1, c.oob] as [number, number]).filter((p) => Number.isFinite(p[1])), color: 'var(--c-w)', label: 'OOB MSE' },
              { pts: [[1, bag.single], [100, bag.single]], color: 'var(--c-v)', dashed: true, label: 'one tree' },
            ]}
            hlines={[{ y: SIG * SIG, color: 'var(--muted)' }]}
            vlines={[{ x: B, color: 'var(--accent)' }]}
          />
        </Panel>
      }
    >
      <div className="ml2-stack">
        <Plane x={[0, 10]} y={[-1.5, 3.5]} width={460} height={250} gridStep={1}>
          {showTrees && bag.gridPred.slice(0, Math.min(B, 20)).map((p, b) => <Path key={b} pts={GX.map((x, j) => [x, p[j]] as [number, number])} color="var(--c-k)" width={1} opacity={B === 1 ? 0.9 : 0.35} />)}
          <Curve f={fTrue} color="var(--fg)" dashed width={1.5} />
          {B > 1 && <Path pts={GX.map((x, j) => [x, cur.avg[j]] as [number, number])} color="var(--c-u)" width={3} />}
          <Dots pts={D.x.map((x, i) => [x, D.y[i]])} color="var(--fg)" r={3} />
        </Plane>
        <Legend
          items={[
            { color: 'var(--c-k)', label: 'individual trees' },
            { color: 'var(--c-u)', label: 'average of B trees' },
            { color: 'var(--fg)', label: 'true function', dashed: true },
          ]}
        />
      </div>
    </FigureLayout>
  );
}

// ======================================================================= averaging correlated predictors

const CA_BS = [1, 2, 3, 5, 10, 20, 50, 100, 200];
/**
 * ml.corr-average — variance of the average of B predictors with variance σ² = 1 and pairwise correlation ρ:
 * ρ + (1 − ρ)/B, with a Monte Carlo check. params: rho (default 0.5), B (default 10)
 */
function CorrAverage({ spec }: { spec: VizSpec }) {
  const [rho, setRho] = useState((spec.rho as number) ?? 0.5);
  const [B, setB] = useState((spec.B as number) ?? 10);
  const sim = useMemo(() => {
    const g = rng(91);
    return CA_BS.map((b) => {
      const reps = 600;
      const ms = range(reps).map(() => {
        const z = g.normal();
        let s = 0;
        for (let k = 0; k < b; k++) s += Math.sqrt(rho) * z + Math.sqrt(1 - rho) * g.normal();
        return s / b;
      });
      const m = mean(ms);
      return mean(ms.map((v) => (v - m) ** 2));
    });
  }, [rho]);
  const v = rho + (1 - rho) / B;
  const Bs = range(200).map((i) => i + 1);
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="\rho" value={rho} min={0} max={1} step={0.05} onChange={setRho} />
          <Slider label="B" value={B} min={1} max={200} step={1} onChange={setB} />
          <Readout
            rows={[
              ['\\rho\\sigma^2 \\ (\\text{floor})', fx(rho, 3)],
              ['(1-\\rho)\\sigma^2/B', fx((1 - rho) / B, 3)],
              ['\\Var(\\bar T)', fx(v, 3)],
            ]}
          />
          <div className="ml2-note">Adding trees removes only the second term. The floor <TeX>{'\\rho\\sigma^2'}</TeX> stays, so a random forest lowers <TeX>{'\\rho'}</TeX> by giving each split a random subset of features.</div>
        </>
      }
    >
      <div className="ml2-stack">
        <LinePlot
          width={470}
          height={280}
          logX
          x={[1, 200]}
          y={[0, 1.05]}
          xlabel="number of predictors B (log)"
          ylabel="variance of the average"
          series={[
            { pts: Bs.map((b) => [b, rho + (1 - rho) / b] as [number, number]), color: 'var(--c-u)', label: 'ρσ² + (1 − ρ)σ²/B' },
            { pts: Bs.map((b) => [b, 1 / b] as [number, number]), color: 'var(--muted)', dashed: true, label: 'independent (ρ = 0)' },
            { pts: CA_BS.map((b, i) => [b, sim[i]] as [number, number]), color: 'var(--c-v)', scatter: true, label: 'simulation' },
          ]}
          hlines={[{ y: rho, color: 'var(--c-u)' }]}
          vlines={[{ x: B, color: 'var(--accent)' }]}
        />
      </div>
    </FigureLayout>
  );
}

// ======================================================================= gradient boosting stage by stage

/**
 * ml.boost-1d — gradient boosting with squared loss on 1-D data: each stage fits a small tree to the current
 * residuals and adds ν times it. params: lr (default 0.3), depth (1 | 2 | 3, default 1), stages (default 60)
 */
function Boost1D({ spec }: { spec: VizSpec }) {
  const M = (spec.stages as number) ?? 60;
  const [lr, setLr] = useState((spec.lr as number) ?? 0.3);
  const [depth, setDepth] = useState<number>((spec.depth as number) ?? 1);
  const D = useMemo(() => reg1D(8, 50), []);
  const run = useMemo(() => {
    const F0 = mean(D.y);
    const Fpts: number[][] = [D.x.map(() => F0)];
    const Fgrid: number[][] = [GX.map(() => F0)];
    const trees: Leaf[][] = [];
    for (let m = 0; m < M; m++) {
      const r = D.y.map((v, i) => v - Fpts[m][i]);
      const h = regTree1D(D.x, r, depth, 1, 0, 10);
      trees.push(h);
      Fpts.push(Fpts[m].map((v, i) => v + lr * leafAt(h, D.x[i])));
      Fgrid.push(Fgrid[m].map((v, j) => v + lr * leafAt(h, GX[j])));
    }
    const train = Fpts.map((F) => mean(F.map((v, i) => (v - D.y[i]) ** 2)));
    const test = Fgrid.map((F) => mean(F.map((v, j) => (v - fTrue(GX[j])) ** 2)) + SIG * SIG);
    return { Fpts, Fgrid, trees, train, test };
  }, [D, lr, depth, M]);
  const player = usePlayer(M + 1, { interval: 350 });
  const m = player.i;
  const res = D.y.map((v, i) => v - run.Fpts[m][i]);
  const h = m < M ? run.trees[m] : null;
  const best = run.test.indexOf(Math.min(...run.test));
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="\nu" value={lr} min={0.05} max={1} step={0.05} onChange={setLr} />
          <SegControl label="tree depth" value={depth} onChange={setDepth} options={[1, 2, 3].map((d) => ({ v: d, label: String(d) }))} />
          {player.controls}
          <Readout
            rows={[
              ['m \\ (\\text{trees so far})', String(m)],
              ['\\text{train MSE}', fx(run.train[m], 3)],
              ['\\text{test MSE}', fx(run.test[m], 3)],
              ['\\text{best test at } m', String(best)],
            ]}
          />
          <div className="ml2-note">
            Bottom panel: residuals <TeX>{'r_i = y_i - F_m(x_i)'}</TeX> and the next tree <TeX>{'h_{m+1}'}</TeX> fitted to them. Stepping adds <TeX>{'\\nu\\, h_{m+1}'}</TeX> to the model.
          </div>
        </>
      }
      below={
        <Panel title="error versus number of trees">
          <LinePlot
            height={150}
            x={[0, M]}
            y={[0, Math.max(run.test[0], run.train[0]) * 1.05]}
            xlabel="stage m"
            series={[
              { pts: run.train.map((v, i) => [i, v] as [number, number]), color: 'var(--c-u)', label: 'train' },
              { pts: run.test.map((v, i) => [i, v] as [number, number]), color: 'var(--c-err)', label: 'test' },
            ]}
            hlines={[{ y: SIG * SIG, color: 'var(--muted)' }]}
            vlines={[{ x: m, color: 'var(--accent)' }]}
          />
        </Panel>
      }
    >
      <div className="ml2-stack">
        <Panel title={`model after m = ${m} trees`}>
          <Plane x={[0, 10]} y={[-1.5, 3.5]} width={460} height={200} gridStep={1}>
            <Curve f={fTrue} color="var(--fg)" dashed width={1.5} />
            {m > 0 && <Path pts={GX.map((x, j) => [x, run.Fgrid[m - 1][j]] as [number, number])} color="var(--c-u)" width={1.5} opacity={0.35} />}
            <Path pts={GX.map((x, j) => [x, run.Fgrid[m][j]] as [number, number])} color="var(--c-u)" width={3} />
            <Dots pts={D.x.map((x, i) => [x, D.y[i]])} color="var(--fg)" r={3} />
          </Plane>
        </Panel>
        <Panel title={h ? `residuals and the next tree fitted to them` : 'residuals'}>
          <Plane x={[0, 10]} y={[-2, 2]} width={460} height={150} gridStep={1}>
            {D.x.map((x, i) => (
              <Seg key={i} a={[x, 0]} b={[x, res[i]]} color="var(--c-err)" width={1.5} />
            ))}
            <Dots pts={D.x.map((x, i) => [x, res[i]])} color="var(--c-err)" r={2.6} />
            {h && <Path pts={leafPath(h, 0, 10)} color="var(--c-v)" width={3} />}
          </Plane>
        </Panel>
      </div>
    </FigureLayout>
  );
}

// ======================================================================= AdaBoost

function Rings({ pts, r }: { pts: [number, number][]; r: (i: number) => number }) {
  const { sx, sy } = usePlane();
  return (
    <g>
      {pts.map((p, i) => (
        <circle key={i} cx={sx(p[0])} cy={sy(p[1])} r={r(i)} style={{ fill: 'none', stroke: 'var(--c-err)', strokeWidth: 2.5 }} />
      ))}
    </g>
  );
}

interface Stump {
  f: number;
  t: number;
  s: number; // predicts s for x_f > t, −s otherwise
}
const stumpPred = (st: Stump, x: number[]) => (x[st.f] > st.t ? st.s : -st.s);
function adaData() {
  const g = rng(17);
  const X = range(30).map(() => [0.5 + 9 * g.next(), 0.5 + 9 * g.next()]);
  const y = X.map(([a, b], i) => ((a > 3 && b > 3) !== (i % 11 === 3) ? 1 : -1));
  return { X, y };
}
/**
 * ml.adaboost — AdaBoost with decision stumps on 30 points: point size shows the weight, rings mark points the
 * current stump misclassifies, the background shows the sign of the weighted vote. params: rounds (default 10)
 */
function AdaBoost({ spec }: { spec: VizSpec }) {
  const T = (spec.rounds as number) ?? 10;
  const D = useMemo(adaData, []);
  const run = useMemo(() => {
    const n = D.y.length;
    let w = D.y.map(() => 1 / n);
    const out: { w: number[]; st: Stump; eps: number; alpha: number; wNext: number[] }[] = [];
    for (let m = 0; m < T; m++) {
      let best: { st: Stump; e: number } | null = null;
      for (let f = 0; f < 2; f++) {
        const vals = [...new Set(D.X.map((x) => x[f]))].sort((a, b) => a - b);
        const ts = [vals[0] - 0.5, ...vals.slice(0, -1).map((v, i) => (v + vals[i + 1]) / 2)];
        for (const t of ts)
          for (const s of [1, -1]) {
            const st = { f, t, s };
            const e = sum(D.X.map((x, i) => (stumpPred(st, x) !== D.y[i] ? w[i] : 0)));
            if (!best || e < best.e - 1e-12) best = { st, e };
          }
      }
      const eps = Math.max(best!.e, 1e-9);
      const alpha = 0.5 * Math.log((1 - eps) / eps);
      const wn = w.map((wi, i) => wi * Math.exp(-alpha * D.y[i] * stumpPred(best!.st, D.X[i])));
      const Z = sum(wn);
      out.push({ w, st: best!.st, eps, alpha, wNext: wn.map((v) => v / Z) });
      w = wn.map((v) => v / Z);
    }
    return out;
  }, [D, T]);
  const player = usePlayer(T, { interval: 1200 });
  const m = player.i;
  const r = run[m];
  const score = (x: number[]) => sum(run.slice(0, m + 1).map((q) => q.alpha * stumpPred(q.st, x)));
  const ensErr = (k: number) => mean(D.X.map((x, i) => (Math.sign(sum(run.slice(0, k + 1).map((q) => q.alpha * stumpPred(q.st, x)))) !== D.y[i] ? 1 : 0)));
  const f = useMemo(() => (a: number, b: number) => (Math.tanh(score([a, b])) + 1) / 2, [m]); // eslint-disable-line react-hooks/exhaustive-deps
  const wrong = D.X.map((x, i) => stumpPred(r.st, x) !== D.y[i]);
  const wrongIdx = range(D.y.length).filter((i) => wrong[i]);
  const errCurve = range(T).map((k) => [k + 1, ensErr(k)] as [number, number]);
  const lineA: [number, number] = r.st.f === 0 ? [r.st.t, 0] : [0, r.st.t];
  const lineB: [number, number] = r.st.f === 0 ? [r.st.t, 10] : [10, r.st.t];
  return (
    <FigureLayout
      side={
        <>
          {player.controls}
          <Readout
            rows={[
              ['\\text{round } m', String(m + 1)],
              ['\\text{stump}', `x${r.st.f + 1} ${r.st.s > 0 ? '>' : '≤'} ${fx(r.st.t, 2)} → +1`],
              ['\\varepsilon_m \\ (\\text{weighted error})', fx(r.eps, 3)],
              ['\\alpha_m = \\tfrac12\\ln\\frac{1-\\varepsilon_m}{\\varepsilon_m}', fx(r.alpha, 3)],
              ['\\textstyle\\sum_{\\text{mistakes}} w_i \\text{ after}', fx(sum(r.wNext.filter((_, i) => wrong[i])), 3)],
              ['\\text{ensemble train error}', fx(ensErr(m), 3)],
            ]}
          />
          <div className="ml2-note">Dot area is the weight a point carries into this round. Ringed points are the ones this round's stump gets wrong; their weights grow for the next round.</div>
        </>
      }
      below={
        <Panel title="ensemble training error versus rounds">
          <LinePlot height={140} x={[1, T]} y={[0, 0.5]} xlabel="round" series={[{ pts: errCurve, color: 'var(--c-err)' }]} legend={false} vlines={[{ x: m + 1, color: 'var(--accent)' }]} />
        </Panel>
      }
    >
      <div className="ml2-stack">
        <Plane x={[0, 10]} y={[0, 10]} width={380} gridStep={1}>
          <Heat f={f} res={50} range={[0, 1]} scheme="class" opacity={0.55} />
          <Seg a={lineA} b={lineB} color="var(--accent)" width={2.5} dashed />
          <Dots pts={D.X as [number, number][]} color={(i) => CLASS[D.y[i] > 0 ? 1 : 0]} r={(i) => 2 + 14 * Math.sqrt(r.w[i])} />
          <Rings pts={wrongIdx.map((i) => D.X[i] as [number, number])} r={(j) => 5 + 14 * Math.sqrt(r.w[wrongIdx[j]])} />
        </Plane>
        <Legend
          items={[
            { color: CLASS[1], label: 'y = +1', dot: true },
            { color: CLASS[0], label: 'y = −1', dot: true },
            { color: 'var(--accent)', label: "this round's stump", dashed: true },
          ]}
        />
      </div>
    </FigureLayout>
  );
}

export const treesViz = {
  'ml.tree-split': {
    component: TreeSplit,
    validate: (s: VizSpec) => (s.crit !== undefined && !['gini', 'entropy'].includes(s.crit as string) ? 'crit must be gini | entropy' : null),
    doc: 'Greedy axis-aligned splits on 20 points: partition, candidate impurity curves, tree diagram, try-your-own split. params crit, maxDepth',
  },
  'ml.tree-depth': { component: TreeDepth, doc: 'Classification tree on noisy circle data: regions and train/test accuracy vs depth. params depth, minLeaf' },
  'ml.regtree-1d': { component: RegTree1D, doc: 'Regression tree on 1-D data: piecewise-constant fit, SSE and test MSE vs depth. params depth' },
  'ml.bagging': { component: Bagging, doc: 'Bootstrap regression trees and their average; test and OOB MSE vs B. params B' },
  'ml.corr-average': { component: CorrAverage, doc: 'Var of the mean of B correlated predictors: ρ + (1 − ρ)/B, with simulation. params rho, B' },
  'ml.boost-1d': {
    component: Boost1D,
    validate: (s: VizSpec) => (s.depth !== undefined && ![1, 2, 3].includes(s.depth as number) ? 'depth must be 1, 2 or 3' : null),
    doc: 'Gradient boosting (squared loss) stage by stage: model, residuals, next tree, train/test MSE. params lr, depth, stages',
  },
  'ml.adaboost': { component: AdaBoost, doc: 'AdaBoost with stumps: weights as dot sizes, current stump, weighted-vote regions. params rounds' },
};
