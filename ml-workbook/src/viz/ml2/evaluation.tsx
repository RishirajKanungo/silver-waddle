// ml03 figures: bias–variance, learning curves, double descent, CV splits, leakage,
// hyperparameter search, A/B test power, distribution shift.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Curve, Path, Heat, Slider, Readout, FigureLayout, SegControl, Toggle, LinePlot, TeX, Btn, Label } from '../kit';
import { solve } from '../../math/linalg';
import { fx, rng, range, mean, median, legendre, ridge, CLASS, Dots, Panel, Legend, phi, Phi, PhiInv, sigmoid, pct } from './common';
import './ml2.css';

// ======================================================================= bias–variance

const truth = (x: number) => Math.sin(2 * Math.PI * x);
const GRID = range(101).map((i) => i / 100);

interface Dataset {
  x: number[];
  y: number[];
}
function makeData(seed: number, n: number, sigma: number): Dataset {
  const r = rng(seed);
  // a jittered, roughly even design on [0, 1]: datasets differ mainly in their noise
  const x = range(n).map((i) => (i + 0.5 + 0.6 * (r.next() - 0.5)) / n);
  const y = x.map((v) => truth(v) + sigma * r.normal());
  return { x, y };
}
function polyFitEval(d: Dataset, deg: number, at: number[]) {
  const Phi = d.x.map((v) => legendre(2 * v - 1, deg));
  const c = ridge(Phi, d.y, 1e-8);
  const ev = (v: number) => legendre(2 * v - 1, deg).reduce((s, b, k) => s + b * c[k], 0);
  return { grid: at.map(ev), train: mean(d.x.map((v, i) => (ev(v) - d.y[i]) ** 2)) };
}

interface BVStats {
  fits: number[][]; // R x GRID
  meanFit: number[];
  bias2: number;
  variance: number;
  train: number;
  test: number;
}
function bvStats(datasets: Dataset[], deg: number, sigma: number): BVStats {
  const res = datasets.map((d) => polyFitEval(d, deg, GRID));
  const fits = res.map((r) => r.grid);
  const meanFit = GRID.map((_, g) => mean(fits.map((f) => f[g])));
  const bias2 = mean(GRID.map((x, g) => (meanFit[g] - truth(x)) ** 2));
  const variance = mean(GRID.map((_, g) => mean(fits.map((f) => (f[g] - meanFit[g]) ** 2))));
  return { fits, meanFit, bias2, variance, train: mean(res.map((r) => r.train)), test: sigma * sigma + bias2 + variance };
}

/**
 * ml.biasvar-poly — noisy samples of sin(2πx), polynomial fits of a chosen degree on one dataset and on
 * resampled datasets; train/test error, bias² and variance versus degree.
 * params: degree (default 3), n (default 20), sigma (default 0.3), maxDegree (default 12)
 */
function BiasVariance({ spec }: { spec: VizSpec }) {
  const maxDeg = (spec.maxDegree as number) ?? 12;
  const sigma = (spec.sigma as number) ?? 0.3;
  const [deg, setDeg] = useState((spec.degree as number) ?? 3);
  const [n, setN] = useState((spec.n as number) ?? 20);
  const [showFits, setShowFits] = useState(true);
  const [showMean, setShowMean] = useState(false);
  const R = 40;
  const datasets = useMemo(() => range(R).map((r) => makeData(1000 + r * 17, n, sigma)), [n, sigma]);
  const all = useMemo(() => range(maxDeg + 1).map((d) => bvStats(datasets, d, sigma)), [datasets, maxDeg, sigma]);
  const s = all[deg];
  const d0 = datasets[0];
  const trainHere = useMemo(() => polyFitEval(d0, deg, GRID).train, [d0, deg]);
  const pts = (f: number[]) => GRID.map((x, g) => [x, f[g]] as [number, number]);
  const best = all.reduce((b, st, d) => (st.test < all[b].test ? d : b), 0);
  const regime = deg < best ? 'under' : deg > best ? 'over' : 'best';
  return (
    <FigureLayout
      side={
        <>
          <Slider label="degree" value={deg} min={0} max={maxDeg} step={1} onChange={setDeg} />
          <Slider label="n points" value={n} min={10} max={80} step={5} onChange={setN} />
          <Toggle label="show 12 resampled fits" value={showFits} onChange={setShowFits} />
          <Toggle label="show average fit" value={showMean} onChange={setShowMean} />
          <Readout
            rows={[
              ['\\text{train MSE (this set)}', fx(trainHere, 3)],
              ['\\text{bias}^2', fx(s.bias2, 3)],
              ['\\text{variance}', fx(s.variance, 3)],
              ['\\sigma^2\\ (\\text{noise})', fx(sigma * sigma, 3)],
              ['\\text{test MSE} = \\text{sum}', fx(s.test, 3)],
            ]}
          />
          <div className="ml2-note">
            {regime === 'under' && (
              <>
                <b>Underfitting.</b> The average fit misses the sine: bias² dominates. Train and test error are both high.
              </>
            )}
            {regime === 'best' && (
              <>
                <b>Lowest test error</b> for this n. Bias² and variance are balanced.
              </>
            )}
            {regime === 'over' && (
              <>
                <b>Overfitting.</b> Each fit chases its own noise: variance dominates while train error keeps falling.
              </>
            )}
          </div>
          <div className="muted small">Averages over {R} datasets of size n. Test MSE = bias² + variance + σ².</div>
        </>
      }
      below={
        <Panel title="error versus degree (log scale)">
          <LinePlot
            height={210}
            logY
            xlabel="polynomial degree"
            y={[0.001, 10]}
            x={[0, maxDeg]}
            series={[
              { pts: all.map((st, d) => [d, Math.max(st.train, 1e-3)]), color: 'var(--c-u)', label: 'train' },
              { pts: all.map((st, d) => [d, st.test]), color: 'var(--c-err)', label: 'test' },
              { pts: all.map((st, d) => [d, Math.max(st.bias2, 1e-3)]), color: 'var(--c-v)', dashed: true, label: 'bias²' },
              { pts: all.map((st, d) => [d, Math.max(st.variance, 1e-3)]), color: 'var(--c-k)', dashed: true, label: 'variance' },
            ]}
            hlines={[{ y: sigma * sigma, color: 'var(--muted)' }]}
            vlines={[{ x: deg, color: 'var(--accent)' }]}
          />
        </Panel>
      }
    >
      <div className="ml2-stack">
        <Plane x={[0, 1]} y={[-2, 2]} width={460} height={300} gridStep={0.5}>
          <Curve f={truth} color="var(--fg)" dashed width={1.6} />
          {showFits && s.fits.slice(1, 13).map((f, i) => <Path key={i} pts={pts(f)} color="var(--muted)" width={1.2} opacity={0.45} />)}
          {showMean && <Path pts={pts(s.meanFit)} color="var(--c-v)" width={3} />}
          <Path pts={pts(s.fits[0])} color="var(--c-u)" width={2.6} />
          <Dots pts={d0.x.map((x, i) => [x, d0.y[i]])} color="var(--fg)" r={3.4} />
        </Plane>
        <Legend
          items={[
            { color: 'var(--fg)', label: 'true f(x)', dashed: true },
            { color: 'var(--c-u)', label: 'fit to the dots' },
            { color: 'var(--muted)', label: 'fits to other datasets' },
            { color: 'var(--c-v)', label: 'average fit' },
          ]}
        />
      </div>
    </FigureLayout>
  );
}

// ======================================================================= learning curves

const LC_NS = [12, 15, 20, 25, 30, 40, 50, 70, 100, 150, 200, 300];
/**
 * ml.learning-curve — train and test MSE versus training-set size for a simple and a flexible model.
 * params: degree (1 | 3 | 9, default 1), sigma (default 0.3)
 */
function LearningCurve({ spec }: { spec: VizSpec }) {
  const sigma = (spec.sigma as number) ?? 0.3;
  const [deg, setDeg] = useState<number>((spec.degree as number) ?? 1);
  const [ni, setNi] = useState(4);
  const curves = useMemo(() => {
    const out: Record<number, { train: number[]; test: number[] }> = {};
    for (const d of [1, 3, 9]) {
      const tr: number[] = [], te: number[] = [];
      for (const n of LC_NS) {
        const R = 40;
        const a: number[] = [], b: number[] = [];
        for (let r = 0; r < R; r++) {
          const ds = makeData(5000 + 31 * r + n, n, sigma);
          const fit = polyFitEval(ds, d, GRID);
          a.push(fit.train);
          b.push(mean(GRID.map((x, g) => (fit.grid[g] - truth(x)) ** 2)) + sigma * sigma);
        }
        tr.push(mean(a));
        te.push(mean(b));
      }
      out[d] = { train: tr, test: te };
    }
    return out;
  }, [sigma]);
  const c = curves[deg];
  const n = LC_NS[ni];
  return (
    <FigureLayout
      side={
        <>
          <SegControl
            label="model"
            value={deg}
            onChange={setDeg}
            options={[
              { v: 1, label: 'degree 1' },
              { v: 3, label: 'degree 3' },
              { v: 9, label: 'degree 9' },
            ]}
          />
          <Slider label="n (train)" value={ni} min={0} max={LC_NS.length - 1} step={1} onChange={setNi} fmt={(i) => String(LC_NS[i])} />
          <Readout
            rows={[
              ['\\text{train MSE}', fx(c.train[ni], 3)],
              ['\\text{test MSE}', fx(c.test[ni], 3)],
              ['\\text{gap}', fx(c.test[ni] - c.train[ni], 3)],
              ['\\sigma^2', fx(sigma * sigma, 3)],
            ]}
          />
          <div className="ml2-note">
            {deg === 1 && (
              <>
                Both curves flatten far above <TeX>{'\\sigma^2'}</TeX>: a straight line cannot follow a sine. <b>High bias:</b> more data will not help; a more flexible model will.
              </>
            )}
            {deg === 3 && <>The curves meet close to the noise floor. This model has enough flexibility, and the gap closes as n grows.</>}
            {deg === 9 && (
              <>
                For small n the gap is large: <b>high variance</b>. Each extra batch of data shrinks it. Here more data (or regularization) helps.
              </>
            )}
          </div>
          <div className="muted small">Each point averages 40 datasets of size n = {n}.</div>
        </>
      }
    >
      <LinePlot
        width={480}
        height={300}
        logX
        logY
        x={[LC_NS[0], LC_NS[LC_NS.length - 1]]}
        y={[0.03, 3]}
        xlabel="training-set size n (log)"
        ylabel="MSE (log)"
        series={[
          { pts: LC_NS.map((m, i) => [m, Math.max(c.train[i], 0.0301)]), color: 'var(--c-u)', label: 'train error' },
          { pts: LC_NS.map((m, i) => [m, Math.min(c.test[i], 2.99)]), color: 'var(--c-err)', label: 'test error' },
        ]}
        hlines={[{ y: sigma * sigma, color: 'var(--muted)' }]}
        vlines={[{ x: n, color: 'var(--accent)' }]}
      />
    </FigureLayout>
  );
}

// ======================================================================= double descent

const DD_PS = [1, 2, 3, 4, 6, 8, 10, 13, 16, 20, 23, 26, 28, 29, 30, 31, 32, 34, 37, 40, 45, 50, 60, 70, 85, 100, 130, 160, 200, 250, 300];
/**
 * ml.double-descent — min-norm / ridge least squares on the first p of D = 300 Gaussian features with n = 30
 * training points. Test risk versus p shows the classical U, a peak at p = n and a second descent.
 * params: lambda (default 0)
 */
function DoubleDescent({ spec }: { spec: VizSpec }) {
  const n = 30, D = 300, sigma = 0.3, R = 20;
  const [lam, setLam] = useState<number>((spec.lambda as number) ?? 0);
  const [pi, setPi] = useState(DD_PS.indexOf(30));
  const beta = useMemo(() => {
    const b = range(D).map((j) => (j + 1) ** -0.3);
    const s = Math.sqrt(b.reduce((t, v) => t + v * v, 0));
    return b.map((v) => (v / s) * 1.5);
  }, []);
  const res = useMemo(() => {
    const risk: number[][] = DD_PS.map(() => []);
    const train: number[][] = DD_PS.map(() => []);
    const cn: number[][] = DD_PS.map(() => []);
    for (let r = 0; r < R; r++) {
      const g = rng(777 + r);
      const X = range(n).map(() => range(D).map(() => g.normal()));
      const y = X.map((row) => row.reduce((s, v, j) => s + v * beta[j], 0) + sigma * g.normal());
      const K = range(n).map(() => new Array(n).fill(0));
      let pDone = 0;
      DD_PS.forEach((p, k) => {
        for (let a = pDone; a < p; a++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) K[i][j] += X[i][a] * X[j][a];
        pDone = p;
        let c: number[];
        if (p < n) {
          const A = range(p).map((a) => range(p).map((b) => X.reduce((s, row) => s + row[a] * row[b], 0) + (a === b ? lam : 0)));
          const rhs = range(p).map((a) => X.reduce((s, row, i) => s + row[a] * y[i], 0));
          c = solve(A, rhs) ?? new Array(p).fill(0);
        } else {
          const Kl = K.map((row, i) => row.map((v, j) => v + (i === j ? lam : 0)));
          const al = solve(Kl, y) ?? new Array(n).fill(0);
          c = range(p).map((a) => X.reduce((s, row, i) => s + row[a] * al[i], 0));
        }
        let rk = sigma * sigma;
        for (let a = 0; a < D; a++) rk += (beta[a] - (a < p ? c[a] : 0)) ** 2;
        risk[k].push(rk);
        train[k].push(mean(X.map((row, i) => (row.slice(0, p).reduce((s, v, a) => s + v * c[a], 0) - y[i]) ** 2)));
        cn[k].push(Math.sqrt(c.reduce((s, v) => s + v * v, 0)));
      });
    }
    return { risk: risk.map(median), train: train.map(median), cn: cn.map(median) };
  }, [lam, beta]);
  const p = DD_PS[pi];
  const nullRisk = 1.5 * 1.5 + sigma * sigma;
  return (
    <FigureLayout
      side={
        <>
          <SegControl
            label="ridge λ"
            value={lam}
            onChange={setLam}
            options={[
              { v: 0, label: '0' },
              { v: 0.1, label: '0.1' },
              { v: 1, label: '1' },
              { v: 10, label: '10' },
            ]}
          />
          <Slider label="features p" value={pi} min={0} max={DD_PS.length - 1} step={1} onChange={setPi} fmt={(i) => String(DD_PS[i])} />
          <Readout
            rows={[
              ['n', String(n)],
              ['\\text{train MSE}', fx(res.train[pi], 3)],
              ['\\text{test MSE}', fx(res.risk[pi], 2)],
              ['\\lVert\\hat{\\boldsymbol\\beta}\\rVert', fx(res.cn[pi], 2)],
            ]}
          />
          <div className="ml2-note">
            {p < n && <>Fewer features than points: ordinary least squares. Adding features first helps, then variance grows as p approaches n.</>}
            {p === n && (
              <>
                <b>Interpolation threshold.</b> Exactly one solution fits all 30 noisy points, and it needs a huge coefficient norm.
              </>
            )}
            {p > n && <>Many solutions interpolate. The minimum-norm one is chosen, and its norm shrinks as p grows, so test error falls again.</>}
          </div>
          <div className="muted small">Medians over {R} random training sets. With λ = 0 and p ≥ n this is the minimum-norm interpolant.</div>
        </>
      }
    >
      <LinePlot
        width={480}
        height={300}
        logX
        logY
        x={[1, 300]}
        y={[0.05, 100]}
        xlabel="number of features p (log)"
        ylabel="MSE (log)"
        series={[
          { pts: DD_PS.map((q, i) => [q, Math.min(res.risk[i], 99)]), color: 'var(--c-err)', label: 'test error' },
          { pts: DD_PS.filter((q) => q < n).map((q, i) => [q, Math.max(res.train[i], 0.051)]), color: 'var(--c-u)', label: 'train error (0 once p ≥ n)' },
        ]}
        hlines={[{ y: nullRisk, color: 'var(--muted)' }]}
        vlines={[
          { x: n, color: 'var(--muted)' },
          { x: p, color: 'var(--accent)' },
        ]}
      />
    </FigureLayout>
  );
}

// ======================================================================= CV splits

type SplitMode = 'kfold' | 'group' | 'time';
const GROUPS = 'AAAAABBBBCCCDDDEEEFF'.split('');

function kfoldAssign(n: number, k: number, order: number[]) {
  const fold = new Array(n).fill(0);
  const base = Math.floor(n / k), extra = n % k;
  let pos = 0;
  for (let f = 0; f < k; f++) {
    const sz = base + (f < extra ? 1 : 0);
    for (let j = 0; j < sz; j++) fold[order[pos++]] = f;
  }
  return fold;
}

/**
 * ml.cv-splits — rows are folds, columns are samples. mode 'kfold' (with stratify toggle), 'group'
 * (KFold vs GroupKFold) or 'time' (shuffled KFold vs forward-chaining TimeSeriesSplit).
 * params: mode, k (default 5)
 */
function CVSplits({ spec }: { spec: VizSpec }) {
  const mode = ((spec.mode as SplitMode) ?? 'kfold') as SplitMode;
  const n = 20;
  const [k, setK] = useState((spec.k as number) ?? (mode === 'time' ? 4 : 5));
  const [shuffle, setShuffle] = useState(false);
  const [smart, setSmart] = useState(false); // stratified / grouped / forward-chaining
  const [gap, setGap] = useState(0);
  const labels = useMemo(() => range(n).map((i) => ([1, 6, 7, 8, 16].includes(i) ? 1 : 0)), []);
  const groupOf = useMemo(() => rng(42).shuffle(GROUPS), []);
  const perm = useMemo(() => rng(9).shuffle(range(n)), []);

  // role[f][i]: 0 unused, 1 train, 2 validation, 3 gap
  const roles = useMemo(() => {
    const out: number[][] = [];
    if (mode === 'time' && smart) {
      const ts = Math.floor(n / (k + 1));
      for (let f = 0; f < k; f++) {
        const start = n - k * ts + f * ts;
        out.push(range(n).map((i) => (i >= start && i < start + ts ? 2 : i < start - gap ? 1 : i < start ? 3 : 0)));
      }
      return out;
    }
    let fold: number[];
    if (mode === 'kfold' && smart) {
      const order = range(n).sort((a, b) => labels[a] - labels[b] || (shuffle ? perm.indexOf(a) - perm.indexOf(b) : a - b));
      fold = new Array(n).fill(0);
      order.forEach((i, j) => (fold[i] = j % k));
    } else if (mode === 'group' && smart) {
      const sizes: Record<string, number> = {};
      groupOf.forEach((g) => (sizes[g] = (sizes[g] ?? 0) + 1));
      const gs = Object.keys(sizes).sort((a, b) => sizes[b] - sizes[a] || a.localeCompare(b));
      const load = new Array(k).fill(0);
      const gf: Record<string, number> = {};
      for (const g of gs) {
        const f = load.indexOf(Math.min(...load));
        gf[g] = f;
        load[f] += sizes[g];
      }
      fold = groupOf.map((g) => gf[g]);
    } else fold = kfoldAssign(n, k, shuffle || mode !== 'kfold' ? perm : range(n));
    for (let f = 0; f < k; f++) out.push(range(n).map((i) => (fold[i] === f ? 2 : 1)));
    return out;
  }, [mode, smart, k, shuffle, gap, labels, groupOf, perm]);

  // per-fold diagnostics
  const diag = roles.map((row) => {
    const val = range(n).filter((i) => row[i] === 2);
    const tr = range(n).filter((i) => row[i] === 1);
    if (mode === 'kfold') return `${val.length} val, ${val.filter((i) => labels[i]).length} positive`;
    if (mode === 'group') {
      const shared = new Set(val.map((i) => groupOf[i]).filter((g) => tr.some((j) => groupOf[j] === g)));
      return shared.size ? `${shared.size} group${shared.size > 1 ? 's' : ''} in both` : 'no shared group';
    }
    const first = Math.min(...val);
    const fut = tr.filter((j) => j > first).length;
    return fut ? `${fut} train pts from the future` : 'train strictly earlier';
  });
  const bad = mode === 'kfold' ? roles.filter((row) => !range(n).some((i) => row[i] === 2 && labels[i])).length : mode === 'group' ? diag.filter((d) => d.includes('both')).length : diag.filter((d) => d.includes('future')).length;

  const cw = 21, left = 62, top = 34, rh = 22;
  const W = left + n * cw + 8, H = top + k * rh + 26;
  const fill = (r: number) => (r === 2 ? 'var(--c-v)' : r === 1 ? 'var(--c-u)' : r === 3 ? 'var(--line)' : 'var(--surface2)');
  const smartLabel = mode === 'kfold' ? 'stratify by label' : mode === 'group' ? 'GroupKFold (keep groups together)' : 'forward chaining (TimeSeriesSplit)';
  return (
    <FigureLayout
      side={
        <>
          <Slider label="k folds" value={k} min={2} max={mode === 'time' ? 6 : 10} step={1} onChange={setK} />
          <Toggle label={smartLabel} value={smart} onChange={setSmart} />
          {mode === 'kfold' && <Toggle label="shuffle before splitting" value={shuffle} onChange={setShuffle} />}
          {mode === 'time' && smart && <Slider label="gap" value={gap} min={0} max={3} step={1} onChange={setGap} />}
          <Readout
            rows={[
              ['n', String(n)],
              [mode === 'time' && smart ? '\\text{val size}' : '\\text{val size per fold}', mode === 'time' && smart ? String(Math.floor(n / (k + 1))) : `${Math.floor(n / k)}${n % k ? '–' + Math.ceil(n / k) : ''}`],
              [mode === 'kfold' ? '\\text{folds with no positive}' : mode === 'group' ? '\\text{folds sharing a group}' : '\\text{folds that peek ahead}', String(bad)],
            ]}
          />
          <div className="ml2-note">
            {mode === 'kfold' && (smart ? <>Each class is dealt round-robin over the folds, so every validation fold has the same class mix as the data.</> : <>5 of 20 samples are positive. Unstratified folds can end up with no positive at all, and then recall on that fold is undefined.</>)}
            {mode === 'group' && (smart ? <>Every group (say, a patient) sits entirely in train or entirely in validation, as it will in production.</> : <>Rows from the same group land on both sides of a split. The model can recognize the group instead of learning the task.</>)}
            {mode === 'time' && (smart ? <>Train on the past, validate on the next block. The gap drops samples whose features overlap the validation window.</> : <>Shuffled folds put later samples in training: the model is graded on the past after seeing the future.</>)}
          </div>
        </>
      }
    >
      <div className="ml2-stack">
      <svg viewBox={`0 0 ${W} ${H}`} className="ml2-svg" style={{ maxWidth: W }} role="img" aria-label="cross-validation folds">
        <text x={4} y={20} className="ml2-axis-lbl">
          {mode === 'kfold' ? 'label' : mode === 'group' ? 'group' : 'time →'}
        </text>
        {range(n).map((i) => (
          <g key={'h' + i}>
            {mode === 'kfold' && <rect x={left + i * cw + 2} y={8} width={cw - 4} height={16} rx={3} style={{ fill: labels[i] ? 'var(--c-pos)' : 'var(--surface2)', stroke: 'var(--line)' }} />}
            {mode === 'kfold' && (
              <text x={left + i * cw + cw / 2} y={20} textAnchor="middle" className="ml2-cell-lbl" style={{ fill: labels[i] ? 'var(--surface)' : 'var(--muted)' }}>
                {labels[i]}
              </text>
            )}
            {mode === 'group' && (
              <text x={left + i * cw + cw / 2} y={20} textAnchor="middle" className="ml2-cell-lbl" style={{ fontWeight: 600 }}>
                {groupOf[i]}
              </text>
            )}
            {mode === 'time' && (
              <text x={left + i * cw + cw / 2} y={20} textAnchor="middle" className="ml2-cell-lbl" style={{ fill: 'var(--muted)' }}>
                {i + 1}
              </text>
            )}
          </g>
        ))}
        {roles.map((row, f) => (
          <g key={f}>
            <text x={4} y={top + f * rh + 15} className="ml2-axis-lbl">
              {mode === 'time' && smart ? 'split' : 'fold'} {f + 1}
            </text>
            {row.map((r, i) => (
              <g key={i}>
                <rect x={left + i * cw + 1} y={top + f * rh + 2} width={cw - 2} height={rh - 4} rx={2} style={{ fill: fill(r), opacity: r === 1 ? 0.75 : 1 }} />
                {mode === 'group' && r !== 0 && (
                  <text x={left + i * cw + cw / 2} y={top + f * rh + 15} textAnchor="middle" className="ml2-cell-lbl" style={{ fill: 'var(--surface)' }}>
                    {groupOf[i]}
                  </text>
                )}
                {mode === 'kfold' && labels[i] === 1 && <circle cx={left + i * cw + cw / 2} cy={top + f * rh + rh / 2} r={3} style={{ fill: 'var(--surface)' }} />}
              </g>
            ))}
          </g>
        ))}
        <g transform={`translate(${left}, ${top + k * rh + 10})`}>
          {[
            ['train', 'var(--c-u)'],
            ['validation', 'var(--c-v)'],
            ...(mode === 'time' && smart ? [['gap', 'var(--line)'], ['unused', 'var(--surface2)']] : []),
          ].map(([l, c], j) => (
            <g key={l} transform={`translate(${j * 100}, 0)`}>
              <rect width={12} height={12} y={-2} rx={2} style={{ fill: c, stroke: 'var(--line)' }} />
              <text x={17} y={8} className="ml2-axis-lbl">
                {l}
              </text>
            </g>
          ))}
        </g>
      </svg>
      <div className="small muted" style={{ marginTop: 4 }}>
        {diag.map((d, f) => (
          <div key={f}>
            fold {f + 1}: {d}
          </div>
        ))}
      </div>
      </div>
    </FigureLayout>
  );
}

// ======================================================================= leakage by feature selection

const LK_PS = [10, 30, 100, 300, 1000, 3000];
/**
 * ml.leakage-selection — pure-noise features and random labels. Selecting the m features most correlated with
 * the label on ALL rows before 5-fold CV gives an optimistic accuracy; selecting inside each fold does not.
 * params: m (default 10)
 */
function LeakageSelection({ spec }: { spec: VizSpec }) {
  const n = 40, k = 5, R = 8;
  const [m, setM] = useState((spec.m as number) ?? 10);
  const [pi, setPi] = useState(4);
  const res = useMemo(() => {
    const leaky: number[] = [], honest: number[] = [];
    for (const p of LK_PS) {
      const L: number[] = [], H: number[] = [];
      for (let r = 0; r < R; r++) {
        const g = rng(300 + r);
        const cols = range(p).map(() => range(n).map(() => g.normal()));
        const y = range(n).map((i) => i % 2);
        const fold = range(n).map((i) => Math.floor(i / 2) % k);
        const select = (rows: number[]) => {
          const ym = mean(rows.map((i) => y[i]));
          const sc = cols.map((c) => {
            const xm = mean(rows.map((i) => c[i]));
            let sxy = 0, sxx = 0;
            for (const i of rows) {
              sxy += (c[i] - xm) * (y[i] - ym);
              sxx += (c[i] - xm) ** 2;
            }
            return Math.abs(sxy) / Math.sqrt(sxx || 1);
          });
          return range(p).sort((a, b) => sc[b] - sc[a]).slice(0, Math.min(m, p));
        };
        const acc = (tr: number[], va: number[], feats: number[]) => {
          const cen = [0, 1].map((cl) => feats.map((f) => mean(tr.filter((i) => y[i] === cl).map((i) => cols[f][i]))));
          return mean(va.map((i) => {
            const d = cen.map((c) => feats.reduce((s, f, j) => s + (cols[f][i] - c[j]) ** 2, 0));
            return (d[1] < d[0] ? 1 : 0) === y[i] ? 1 : 0;
          }));
        };
        const all = select(range(n));
        const la: number[] = [], ha: number[] = [];
        for (let f = 0; f < k; f++) {
          const tr = range(n).filter((i) => fold[i] !== f), va = range(n).filter((i) => fold[i] === f);
          la.push(acc(tr, va, all));
          ha.push(acc(tr, va, select(tr)));
        }
        L.push(mean(la));
        H.push(mean(ha));
      }
      leaky.push(mean(L));
      honest.push(mean(H));
    }
    return { leaky, honest };
  }, [m]);
  return (
    <FigureLayout
      side={
        <>
          <Slider label="candidate features" value={pi} min={0} max={LK_PS.length - 1} step={1} onChange={setPi} fmt={(i) => String(LK_PS[i])} />
          <Slider label="keep top m" value={m} min={1} max={20} step={1} onChange={setM} />
          <Readout
            rows={[
              ['\\text{select, then CV}', pct(res.leaky[pi])],
              ['\\text{CV, select inside}', pct(res.honest[pi])],
              ['\\text{true accuracy}', '50%'],
            ]}
          />
          <div className="ml2-note">
            Labels are coin flips and features are noise, so no model can beat 50%. Choosing features with the validation rows in view lets the noise that happens to correlate with their labels leak into the estimate.
          </div>
          <div className="muted small">n = 40, nearest-centroid classifier, 5-fold CV, averaged over {R} datasets.</div>
        </>
      }
    >
      <LinePlot
        width={470}
        height={280}
        logX
        x={[10, 3000]}
        y={[0.3, 1]}
        xlabel="number of candidate features (log)"
        ylabel="CV accuracy"
        series={[
          { pts: LK_PS.map((p, i) => [p, res.leaky[i]]), color: 'var(--c-err)', label: 'select on all rows, then CV (leaky)' },
          { pts: LK_PS.map((p, i) => [p, res.honest[i]]), color: 'var(--c-w)', label: 'select inside each training fold' },
        ]}
        hlines={[{ y: 0.5, color: 'var(--muted)' }]}
        vlines={[{ x: LK_PS[pi], color: 'var(--accent)' }]}
      >
        {(sx, sy) => (
          <g>
            {[res.leaky, res.honest].map((s, j) => (
              <circle key={j} cx={sx(LK_PS[pi])} cy={sy(s[pi])} r={5} style={{ fill: j ? 'var(--c-w)' : 'var(--c-err)', stroke: 'var(--surface)', strokeWidth: 1.5 }} />
            ))}
          </g>
        )}
      </LinePlot>
    </FigureLayout>
  );
}

// ======================================================================= hyperparameter search

const hpScore = (a: number, b: number) => 0.7 + 0.25 * Math.exp(-((a - 0.73) ** 2) / (2 * 0.06 ** 2)) + 0.015 * Math.cos(2 * Math.PI * b);
/**
 * ml.hparam-search — grid search versus random search with the same budget when only one of two
 * hyperparameters matters.
 * params: budget (4 | 9 | 16 | 25, default 9)
 */
function HparamSearch({ spec }: { spec: VizSpec }) {
  const [budget, setBudget] = useState<number>((spec.budget as number) ?? 9);
  const [seed, setSeed] = useState(1);
  const [show, setShow] = useState<'grid' | 'random' | 'both'>('both');
  const g = Math.round(Math.sqrt(budget));
  const gridPts = useMemo(() => range(g * g).map((i) => [((i % g) + 0.5) / g, (Math.floor(i / g) + 0.5) / g] as [number, number]), [g]);
  const randPts = useMemo(() => {
    const r = rng(100 + seed);
    return range(budget).map(() => [r.next(), r.next()] as [number, number]);
  }, [budget, seed]);
  const best = (ps: [number, number][]) => Math.max(...ps.map(([a, b]) => hpScore(a, b)));
  const distinct = (ps: [number, number][]) => new Set(ps.map((p) => p[0].toFixed(3))).size;
  const f = useMemo(() => (a: number, b: number) => hpScore(a, b), []);
  return (
    <FigureLayout
      side={
        <>
          <SegControl
            label="budget"
            value={budget}
            onChange={setBudget}
            options={[4, 9, 16, 25].map((v) => ({ v, label: String(v) }))}
          />
          <SegControl
            value={show}
            onChange={setShow}
            options={[
              { v: 'grid', label: 'grid' },
              { v: 'random', label: 'random' },
              { v: 'both', label: 'both' },
            ]}
          />
          <Btn onClick={() => setSeed(seed + 1)}>new random draw</Btn>
          <Readout
            rows={[
              ['\\text{grid: best score}', fx(best(gridPts), 3)],
              ['\\text{grid: distinct } a', String(distinct(gridPts))],
              ['\\text{random: best score}', fx(best(randPts), 3)],
              ['\\text{random: distinct } a', String(distinct(randPts))],
              ['\\text{optimum}', fx(hpScore(0.73, 0), 3)],
            ]}
          />
          <div className="ml2-note">
            The score depends almost only on <TeX>a</TeX> (say, the learning rate). A <TeX>{'g\\times g'}</TeX> grid spends its budget on just <TeX>g</TeX> values of <TeX>a</TeX>; random search tries a new value of <TeX>a</TeX> with every trial.
          </div>
        </>
      }
      below={
        <Panel title="score as a function of a alone, with the values of a each method tried">
          <LinePlot
            height={150}
            x={[0, 1]}
            y={[0.68, 0.97]}
            xlabel="a"
            series={[{ pts: range(201).map((i) => [i / 200, hpScore(i / 200, 0.25)] as [number, number]), color: 'var(--fg)' }]}
            legend={false}
          >
            {(sx, sy) => (
              <g>
                {show !== 'random' && gridPts.map((p, i) => <line key={'g' + i} x1={sx(p[0])} x2={sx(p[0])} y1={sy(0.68)} y2={sy(0.72)} style={{ stroke: 'var(--c-u)', strokeWidth: 3 }} />)}
                {show !== 'grid' && randPts.map((p, i) => <line key={'r' + i} x1={sx(p[0])} x2={sx(p[0])} y1={sy(0.72)} y2={sy(0.76)} style={{ stroke: 'var(--c-v)', strokeWidth: 2 }} />)}
              </g>
            )}
          </LinePlot>
        </Panel>
      }
    >
      <div className="ml2-stack">
        <Plane x={[0, 1]} y={[0, 1]} width={360} gridStep={0.25}>
          <Heat f={f} res={40} range={[0.68, 0.96]} opacity={0.6} />
          {show !== 'random' && <Dots pts={gridPts} color="var(--c-u)" r={5.5} />}
          {show !== 'grid' && <Dots pts={randPts} color="var(--c-v)" r={4.5} />}
          <Label at={[0.73, 0.96]} text="best a" color="var(--fg)" />
        </Plane>
        <Legend
          items={[
            { color: 'var(--c-u)', label: 'grid', dot: true },
            { color: 'var(--c-v)', label: 'random', dot: true },
            { color: 'var(--c-seq)', label: 'score (darker is higher); horizontal: a, vertical: b', dot: true },
          ]}
        />
      </div>
    </FigureLayout>
  );
}

// ======================================================================= A/B test power

/**
 * ml.ab-power — sampling distributions of the z statistic under H0 (no effect) and H1 (true lift),
 * with the rejection region (α) and the power shaded. Sliders: baseline rate, relative lift, users per arm.
 * params: p (default 0.05), lift (relative, default 0.1), n (per arm, default 20000)
 */
function ABPower({ spec }: { spec: VizSpec }) {
  const [p, setP] = useState((spec.p as number) ?? 0.05);
  const [lift, setLift] = useState((spec.lift as number) ?? 0.1);
  const [logn, setLogn] = useState(Math.log10((spec.n as number) ?? 20000));
  const [alpha, setAlpha] = useState(0.05);
  const n = Math.round(10 ** logn);
  const p2 = p * (1 + lift), delta = p2 - p;
  const v = p * (1 - p) + p2 * (1 - p2);
  const se = Math.sqrt(v / n);
  const lam = delta / se;
  const zc = PhiInv(1 - alpha / 2);
  const power = Phi(lam - zc) + Phi(-lam - zc);
  const nReq = ((zc + PhiInv(0.8)) ** 2 * v) / (delta * delta);
  const lehr = (16 * p * (1 - p)) / (delta * delta);
  const X0 = -4, X1 = Math.max(6, Math.min(14, lam + 4));
  const zs = range(241).map((i) => X0 + ((X1 - X0) * i) / 240);
  const fmtN = (x: number) => (x >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : x >= 1e4 ? Math.round(x / 100) / 10 + 'k' : String(Math.round(x)));
  return (
    <FigureLayout
      side={
        <>
          <Slider label="baseline rate" value={p} min={0.01} max={0.5} step={0.01} onChange={setP} fmt={(x) => pct(x, 0)} />
          <Slider label="relative lift" value={lift} min={0.01} max={0.3} step={0.01} onChange={setLift} fmt={(x) => pct(x, 0)} />
          <Slider label="users per arm" value={logn} min={2.5} max={6.5} step={0.05} onChange={setLogn} fmt={() => fmtN(n)} />
          <SegControl label="α" value={alpha} onChange={setAlpha} options={[0.01, 0.05, 0.1].map((a) => ({ v: a, label: String(a) }))} />
          <Readout
            rows={[
              ['\\delta = p_2 - p_1', fx(delta, 4)],
              ['\\text{SE}(\\hat\\delta)', fx(se, 5)],
              ['\\delta / \\text{SE}', fx(lam, 2)],
              ['\\text{power}', pct(power)],
              ['n \\text{ for 80\\% power}', fmtN(nReq)],
              ['16\\,p(1-p)/\\delta^2', fmtN(lehr)],
            ]}
          />
          <div className="muted small">Two-sided z-test on the difference of two proportions. The last row is the rule of thumb for α = 0.05 and 80% power.</div>
        </>
      }
    >
      <div className="ml2-stack">
        <LinePlot
          width={480}
          height={280}
          x={[X0, X1]}
          y={[0, 0.45]}
          xlabel="z = (observed difference) / SE"
          series={[
            { pts: zs.map((z) => [z, phi(z)] as [number, number]), color: 'var(--muted)', label: 'H0: no effect' },
            { pts: zs.map((z) => [z, phi(z - lam)] as [number, number]), color: 'var(--c-w)', label: 'H1: true lift' },
          ]}
          vlines={[
            { x: zc, color: 'var(--c-err)' },
            { x: -zc, color: 'var(--c-err)' },
          ]}
        >
          {(sx, sy) => {
            const area = (f: (z: number) => number, a: number, b: number) => {
              if (b <= a) return '';
              const ps = range(61).map((i) => a + ((b - a) * i) / 60);
              return `M${sx(a)},${sy(0)} ` + ps.map((z) => `L${sx(z).toFixed(1)},${sy(f(z)).toFixed(1)}`).join(' ') + ` L${sx(b)},${sy(0)} Z`;
            };
            const h1 = (z: number) => phi(z - lam);
            return (
              <g>
                <path d={area(h1, zc, X1)} style={{ fill: 'var(--c-w)', fillOpacity: 0.28 }} />
                <path d={area(phi, zc, X1)} style={{ fill: 'var(--c-err)', fillOpacity: 0.45 }} />
                <path d={area(phi, X0, -zc)} style={{ fill: 'var(--c-err)', fillOpacity: 0.45 }} />
              </g>
            );
          }}
        </LinePlot>
        <Legend
          items={[
            { color: 'var(--c-err)', label: <>rejection region (area α under H0)</>, dot: true },
            { color: 'var(--c-w)', label: <>power: area under H1 beyond the cut-off</>, dot: true },
          ]}
        />
      </div>
    </FigureLayout>
  );
}

// ======================================================================= distribution shift

type ShiftKind = 'covariate' | 'label' | 'concept';
const XS = range(601).map((i) => -6 + i * 0.02);
const npdf = (x: number, m: number, s = 1) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
/**
 * ml.dist-shift — 1-D two-class problem trained on a source distribution, evaluated under covariate shift,
 * label shift or concept drift. Shows class densities, P(y=1|x), the old and the new optimal threshold,
 * accuracies and the population stability index of x.
 * params: kind ('covariate' | 'label' | 'concept'), s (default 1)
 */
function DistShift({ spec }: { spec: VizSpec }) {
  const [kind, setKind] = useState<ShiftKind>((spec.kind as ShiftKind) ?? 'covariate');
  const [s, setS] = useState((spec.s as number) ?? 1);
  const srcMarg = (x: number) => 0.5 * npdf(x, -1) + 0.5 * npdf(x, 1);
  const etaSrc = (x: number) => sigmoid(2 * x);
  const model = useMemo(() => {
    // target joint: q0(x) = density of (x, y=0), q1(x) = density of (x, y=1)
    let q0: (x: number) => number, q1: (x: number) => number;
    if (kind === 'covariate') {
      q0 = (x) => srcMarg(x - s) * (1 - etaSrc(x));
      q1 = (x) => srcMarg(x - s) * etaSrc(x);
    } else if (kind === 'label') {
      const pi = 0.5 + 0.45 * Math.min(1, s / 2);
      q0 = (x) => (1 - pi) * npdf(x, -1);
      q1 = (x) => pi * npdf(x, 1);
    } else {
      q0 = (x) => srcMarg(x) * (1 - sigmoid(2 * (x - s)));
      q1 = (x) => srcMarg(x) * sigmoid(2 * (x - s));
    }
    const dx = 0.02;
    const acc = (t: number, a0: (x: number) => number, a1: (x: number) => number) => XS.reduce((tot, x) => tot + (x > t ? a1(x) : a0(x)) * dx, 0);
    // best threshold on the target
    // best threshold on the target (middle of the plateau of maximal accuracy)
    const ts = range(801).map((i) => -4 + i * 0.01);
    const accs = ts.map((t) => acc(t, q0, q1));
    const bestA = Math.max(...accs);
    const bestT = mean(ts.filter((_, i) => accs[i] > bestA - 1e-9));
    // PSI of x over 10 equal-width bins on [-3, 3] (tails merged)
    const edges = range(11).map((i) => -3 + 0.6 * i);
    const bin = (x: number) => Math.max(0, Math.min(9, Math.floor((x + 3) / 0.6)));
    const e = new Array(10).fill(0), a = new Array(10).fill(0);
    XS.forEach((x) => {
      e[bin(x)] += srcMarg(x) * dx;
      a[bin(x)] += (q0(x) + q1(x)) * dx;
    });
    const psi = e.reduce((t, ei, i) => t + (a[i] - ei) * Math.log((a[i] + 1e-12) / (ei + 1e-12)), 0);
    return { q0, q1, srcAcc: acc(0, (x) => 0.5 * npdf(x, -1), (x) => 0.5 * npdf(x, 1)), oldAcc: acc(0, q0, q1), bestT, bestA, psi, edges };
  }, [kind, s]);
  const P = (f: (x: number) => number) => XS.filter((_, i) => i % 3 === 0).map((x) => [x, f(x)] as [number, number]);
  return (
    <FigureLayout
      side={
        <>
          <SegControl
            value={kind}
            onChange={setKind}
            options={[
              { v: 'covariate', label: 'covariate' },
              { v: 'label', label: 'label' },
              { v: 'concept', label: 'concept' },
            ]}
          />
          <Slider label="shift size" value={s} min={0} max={2} step={0.05} onChange={setS} />
          <Readout
            rows={[
              ['\\text{source acc., } t=0', pct(model.srcAcc)],
              ['\\text{target acc., } t=0', pct(model.oldAcc)],
              ['\\text{best } t \\text{ on target}', fx(model.bestT, 2)],
              ['\\text{target acc., best } t', pct(model.bestA)],
              ['\\text{PSI of } x', fx(model.psi, 3)],
            ]}
          />
          <div className="ml2-note">
            {kind === 'covariate' && (
              <>
                <TeX>{'p(x)'}</TeX> moves, <TeX>{'p(y\\mid x)'}</TeX> stays. The best threshold is still 0, yet accuracy changes because inputs now fall in different regions. Input monitoring (PSI) sees it.
              </>
            )}
            {kind === 'label' && (
              <>
                <TeX>{'p(y)'}</TeX> changes, <TeX>{'p(x\\mid y)'}</TeX> stays. Positives become more common, so the best threshold moves left. PSI on <TeX>x</TeX> sees it too.
              </>
            )}
            {kind === 'concept' && (
              <>
                <TeX>{'p(y\\mid x)'}</TeX> changes, <TeX>{'p(x)'}</TeX> stays. PSI stays at 0: <b>input monitoring cannot detect concept drift</b>. Only fresh labels reveal it.
              </>
            )}
          </div>
        </>
      }
    >
      <div className="ml2-stack">
        <Panel title="class densities: source (dashed) and target (solid)">
          <LinePlot
            width={480}
            height={210}
            x={[-4.5, 4.5]}
            y={[0, 0.45]}
            legend={false}
            series={[
              { pts: P((x) => 0.5 * npdf(x, -1)), color: CLASS[0], dashed: true, width: 1.5 },
              { pts: P((x) => 0.5 * npdf(x, 1)), color: CLASS[1], dashed: true, width: 1.5 },
              { pts: P(model.q0), color: CLASS[0], width: 2.5 },
              { pts: P(model.q1), color: CLASS[1], width: 2.5 },
            ]}
            vlines={[
              { x: 0, color: 'var(--muted)' },
              { x: model.bestT, color: 'var(--accent)' },
            ]}
          />
        </Panel>
        <Panel title="P(y = 1 | x): source (dashed) and target (solid)">
          <LinePlot
            width={480}
            height={150}
            x={[-4.5, 4.5]}
            y={[0, 1]}
            xlabel="x"
            legend={false}
            series={[
              { pts: P(etaSrc), color: 'var(--fg)', dashed: true, width: 1.5 },
              { pts: P((x) => model.q1(x) / (model.q0(x) + model.q1(x) || 1)), color: 'var(--c-w)', width: 2.5 },
            ]}
            vlines={[
              { x: 0, color: 'var(--muted)' },
              { x: model.bestT, color: 'var(--accent)' },
            ]}
          />
        </Panel>
        <Legend
          items={[
            { color: CLASS[0], label: 'class 0' },
            { color: CLASS[1], label: 'class 1' },
            { color: 'var(--muted)', label: 'threshold learned on source', dashed: true },
            { color: 'var(--accent)', label: 'best threshold on target', dashed: true },
          ]}
        />
      </div>
    </FigureLayout>
  );
}

export const evaluationViz = {
  'ml.biasvar-poly': {
    component: BiasVariance,
    validate: (s: VizSpec) => (s.degree !== undefined && (typeof s.degree !== 'number' || s.degree < 0 || s.degree > 12) ? 'degree must be 0..12' : null),
    doc: 'Polynomial fits to noisy sin(2πx): one fit, 12 resampled fits, average fit; train/test/bias²/variance vs degree. params degree, n, sigma',
  },
  'ml.learning-curve': {
    component: LearningCurve,
    validate: (s: VizSpec) => (s.degree !== undefined && ![1, 3, 9].includes(s.degree as number) ? 'degree must be 1, 3 or 9' : null),
    doc: 'Train/test MSE vs training-set size for polynomial degree 1, 3 or 9. params degree, sigma',
  },
  'ml.double-descent': {
    component: DoubleDescent,
    validate: (s: VizSpec) => (s.lambda !== undefined && ![0, 0.1, 1, 10].includes(s.lambda as number) ? 'lambda must be 0, 0.1, 1 or 10' : null),
    doc: 'Min-norm/ridge least squares on p of 300 Gaussian features, n = 30: test error vs p with a peak at p = n. params lambda',
  },
  'ml.cv-splits': {
    component: CVSplits,
    validate: (s: VizSpec) => (s.mode !== undefined && !['kfold', 'group', 'time'].includes(s.mode as string) ? 'mode must be kfold | group | time' : null),
    doc: "Fold-by-sample grid. mode 'kfold' (stratify toggle), 'group' (GroupKFold toggle), 'time' (forward chaining toggle, gap). params mode, k",
  },
  'ml.leakage-selection': { component: LeakageSelection, doc: 'Feature selection on all rows before CV vs inside folds, on pure noise. params m' },
  'ml.hparam-search': {
    component: HparamSearch,
    validate: (s: VizSpec) => (s.budget !== undefined && ![4, 9, 16, 25].includes(s.budget as number) ? 'budget must be 4, 9, 16 or 25' : null),
    doc: 'Grid vs random search on a score that depends mostly on one hyperparameter. params budget',
  },
  'ml.ab-power': { component: ABPower, doc: 'z-test power picture for an A/B test on a conversion rate. params p, lift, n' },
  'ml.dist-shift': {
    component: DistShift,
    validate: (s: VizSpec) => (s.kind !== undefined && !['covariate', 'label', 'concept'].includes(s.kind as string) ? 'kind must be covariate | label | concept' : null),
    doc: 'Covariate shift, label shift and concept drift on a 1-D classifier: densities, P(y|x), thresholds, accuracy, PSI. params kind, s',
  },
};
