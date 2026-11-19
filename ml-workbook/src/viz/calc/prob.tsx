// calc02 figures: the central limit theorem, Bayes' rule, distributions, the 2-D Gaussian,
// likelihood, and the two-proportion z-test.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Arrow, Path, Label, LinePlot, usePlane, Slider, Readout, FigureLayout, SegControl, Toggle, TeX, usePlayer, type P2 } from '../kit';
import { eigSym } from '../../math/linalg';
import { Rng } from '../../math/rng';
import { fx, ff, tmat, check, isNum, linspace, phi, Phi, PhiInv } from './util';
import './calc.css';

// ------------------------------------------------------------------ CLT

interface Source { label: string; mu: number; sd: number; skew: number; draw: (r: Rng) => number; discrete?: number; raw: [number, number]; pdf: (x: number) => number; pdfX: [number, number]; ticks: number[] }
const SOURCES: Record<string, Source> = {
  exp: { label: 'exponential', mu: 1, sd: 1, skew: 2, draw: (r) => -Math.log(1 - r.next()), raw: [0, 4], pdf: (x) => (x < 0 ? 0 : Math.exp(-x)), pdfX: [0, 5], ticks: [0, 1, 2, 3, 4, 5] },
  bern: { label: 'Bernoulli(0.1)', mu: 0.1, sd: 0.3, skew: (1 - 0.2) / 0.3, draw: (r) => (r.next() < 0.1 ? 1 : 0), discrete: 1, raw: [0, 1], pdf: () => 0, pdfX: [-0.5, 1.5], ticks: [0, 1] },
  unif: { label: 'uniform(0, 1)', mu: 0.5, sd: Math.sqrt(1 / 12), skew: 0, draw: (r) => r.next(), raw: [0, 1], pdf: (x) => (x >= 0 && x <= 1 ? 1 : 0), pdfX: [-0.25, 1.25], ticks: [0, 0.5, 1] },
};
const M = 2000;

/** a tiny axis-free plot of a source density or pmf */
function Spark({ pts, bars, x, ticks }: { pts: [number, number][] | null; bars: [number, number][] | null; x: [number, number]; ticks: number[] }) {
  const W = 240, H = 70, pad = 14;
  const ymax = Math.max(...(pts ?? []).map((p) => p[1]), ...(bars ?? []).map((b) => b[1]), 1e-9) * 1.1;
  const sx = (v: number) => pad + ((v - x[0]) / (x[1] - x[0])) * (W - 2 * pad);
  const sy = (v: number) => H - 16 - (v / ymax) * (H - 22);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="lineplot" style={{ maxWidth: W }}>
      <rect width={W} height={H} className="pl-bg" />
      <line x1={pad} x2={W - pad} y1={sy(0)} y2={sy(0)} className="pl-axis" />
      {pts && <path d={pts.map(([a, b], j) => `${j ? 'L' : 'M'}${sx(a).toFixed(1)},${sy(b).toFixed(1)}`).join('')} style={{ stroke: 'var(--muted)', strokeWidth: 2, fill: 'none' }} />}
      {bars && bars.map(([v, pr]) => <rect key={v} x={sx(v) - 12} y={sy(pr)} width={24} height={sy(0) - sy(pr)} style={{ fill: 'var(--muted)' }} />)}
      {ticks.map((t) => (
        <text key={t} x={sx(t)} y={H - 3} textAnchor="middle" className="pl-tick">{t}</text>
      ))}
    </svg>
  );
}

/**
 * calc.clt — histogram of M = 2000 sample means of n draws from a source distribution, with the
 * normal density predicted by the CLT. Play to watch the histogram fill. Toggle standardized scale.
 * params: source ('exp'|'bern'|'unif'), n, scale ('raw'|'std'), lockSource
 */
function CLT({ spec }: { spec: VizSpec }) {
  const [sk, setSk] = useState((spec.source as string) ?? 'exp');
  const [n, setN] = useState((spec.n as number) ?? 2);
  const [scale, setScale] = useState((spec.scale as string) ?? 'raw');
  const S = SOURCES[sk];
  const means = useMemo(() => {
    const r = new Rng(11);
    const out = new Float64Array(M);
    for (let k = 0; k < M; k++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += S.draw(r);
      out[k] = s / n;
    }
    return out;
  }, [S, n]);
  const frames = 40;
  const { i, setI, controls } = usePlayer(frames, { interval: 90 });
  useEffect(() => setI(frames - 1), [sk, n]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = Math.round((M * (i + 1)) / frames);
  const se = S.sd / Math.sqrt(n);
  const std = scale === 'std';
  const tf = (v: number) => (std ? (v - S.mu) / se : v);
  const range: [number, number] = std ? [-4, 4] : S.raw;
  // bins: one per attainable value for discrete sources, else 50
  const bins = useMemo(() => {
    let edges: number[];
    if (S.discrete) {
      const vals = Array.from({ length: n + 1 }, (_, k) => tf(k / n));
      const w = vals.length > 1 ? vals[1] - vals[0] : 1;
      edges = [...vals.map((v) => v - w / 2), vals[vals.length - 1] + w / 2];
    } else edges = linspace(range[0], range[1], 51);
    const counts = new Array(edges.length - 1).fill(0);
    for (let k = 0; k < shown; k++) {
      const v = tf(means[k]);
      let lo = 0, hi = edges.length - 1;
      if (v < edges[0] || v >= edges[hi]) continue;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (v >= edges[mid]) lo = mid; else hi = mid; }
      counts[lo]++;
    }
    return counts.map((c, k) => ({ a: edges[k], b: edges[k + 1], d: shown ? c / (shown * (edges[k + 1] - edges[k])) : 0 }));
  }, [means, shown, std, S, n]); // eslint-disable-line react-hooks/exhaustive-deps
  const normal = (x: number) => (std ? phi(x) : phi((x - S.mu) / se) / se);
  const curve = linspace(range[0], range[1], 200).map((x) => [x, normal(x)] as [number, number]);
  const visBins = bins.filter((b) => b.b > range[0] && b.a < range[1]);
  const peak = Math.max(...curve.map((c) => c[1]), ...visBins.map((b) => b.d));
  const yMax = std ? 0.6 : Math.min(peak * 1.1, Math.max(peak * 1.1, 1));
  // empirical moments of the means
  let m1 = 0, m2 = 0, m3 = 0;
  for (let k = 0; k < M; k++) m1 += means[k];
  m1 /= M;
  for (let k = 0; k < M; k++) { const d = means[k] - m1; m2 += d * d; m3 += d * d * d; }
  m2 /= M; m3 /= M;
  const sdHat = Math.sqrt(m2), skewHat = m3 / Math.pow(m2, 1.5);
  const srcPts = S.discrete ? null : linspace(S.pdfX[0], S.pdfX[1], 160).map((x) => [x, S.pdf(x)] as [number, number]);
  return (
    <FigureLayout
      side={
        <>
          {!spec.lockSource && <SegControl value={sk} onChange={setSk} options={Object.keys(SOURCES).map((k) => ({ v: k, label: k === 'exp' ? 'exponential' : k === 'bern' ? 'Bernoulli' : 'uniform' }))} />}
          <div className="calc-plotk">source: {S.label}</div>
          <Spark pts={srcPts} bars={S.discrete ? [[0, 0.9], [1, 0.1]] : null} x={S.pdfX} ticks={S.ticks} />
          <Slider tex="n" value={n} min={1} max={60} step={1} onChange={setN} />
          <SegControl value={scale} onChange={setScale} options={[{ v: 'raw', label: 'sample mean' }, { v: 'std', label: 'standardized' }]} />
          <Readout
            rows={[
              ['\\mu,\\ \\sigma\\ (\\text{source})', `${fx(S.mu, 3)}, ${fx(S.sd, 3)}`],
              ['\\sigma/\\sqrt{n}', ff(se, 3)],
              ['\\text{sd of the means}', ff(sdHat, 3)],
              ['\\text{skewness of the means}', ff(skewHat, 2)],
              ['\\text{skewness, theory } \\gamma/\\sqrt n', ff(S.skew / Math.sqrt(n), 2)],
            ]}
          />
        </>
      }
      below={<div style={{ width: '100%' }}>{controls}</div>}
    >
      <div className="calc-stack">
        <div className="calc-plotk">
          {std ? 'standardized means (x̄ − μ)/(σ/√n) and N(0, 1)' : `histogram of ${shown} sample means, each of n = ${n} draws, and N(μ, σ²/n)`}
        </div>
        <LinePlot series={[{ pts: curve, color: 'var(--c-v)', width: 2.5 }]} x={range} y={[0, yMax]} width={440} height={300} xlabel={std ? 'z' : 'sample mean'} vlines={[{ x: std ? 0 : S.mu }]}>
          {(sx, sy) => (
            <g>
              {visBins.map((b, k) => (b.d > 0 ? <rect key={k} x={sx(b.a) + 0.5} y={sy(Math.min(b.d, yMax))} width={Math.max(0.5, sx(b.b) - sx(b.a) - 1)} height={sy(0) - sy(Math.min(b.d, yMax))} style={{ fill: 'var(--c-u)', opacity: 0.55 }} /> : null))}
            </g>
          )}
        </LinePlot>
      </div>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ Bayes

const pct = (x: number, d = 1) => `${fx(100 * x, d)}%`;
const big = (x: number) => Math.round(x).toLocaleString('en-US');

/**
 * calc.bayes — a diagnostic test for 10 000 people as a frequency tree, and the bar of all positive
 * tests split into true and false positives. Sliders: prevalence (log scale), sensitivity, specificity.
 * params: prev, sens, spec
 */
function Bayes({ spec }: { spec: VizSpec }) {
  const [lp, setLp] = useState(Math.log10((spec.prev as number) ?? 0.01));
  const [sens, setSens] = useState((spec.sens as number) ?? 0.9);
  const [spc, setSpc] = useState((spec.spec as number) ?? 0.95);
  const prev = 10 ** lp;
  const N = 10000;
  const sick = N * prev, healthy = N - sick;
  const tp = sick * sens, fn = sick - tp, fp = healthy * (1 - spc), tn = healthy - fp;
  const post = tp / (tp + fp);
  const npv = tn / (tn + fn);
  const lr = sens / (1 - spc);
  const W = 520, H = 305;
  const node = (x: number, y: number, n: string, sub: string, col = 'var(--fg)', bold = false) => (
    <g>
      <text x={x} y={y - 2} textAnchor="middle" className="calc-tree-n" style={{ fill: col, fontWeight: bold ? 700 : 600 }}>{n}</text>
      <text x={x} y={y + 13} textAnchor="middle" className="calc-tree-p">{sub}</text>
    </g>
  );
  const edge = (x1: number, y1: number, x2: number, y2: number, lab: string) => (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} style={{ stroke: 'var(--axis)', strokeWidth: 1.5 }} />
      <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 5} textAnchor="middle" className="calc-tree-p" style={{ paintOrder: 'stroke', stroke: 'var(--surface)', strokeWidth: 3 }}>{lab}</text>
    </g>
  );
  const bx = 440, bw = 54, btop = 30, bh = 230;
  const tpH = bh * post;
  return (
    <FigureLayout
      side={
        <>
          <Slider label="prevalence" value={lp} min={-3} max={Math.log10(0.5)} step={0.01} onChange={setLp} fmt={() => pct(prev, prev < 0.01 ? 2 : 1)} />
          <Slider label="sensitivity" value={sens} min={0.5} max={1} step={0.005} onChange={setSens} fmt={(v) => pct(v)} />
          <Slider label="specificity" value={spc} min={0.5} max={1} step={0.005} onChange={setSpc} fmt={(v) => pct(v)} />
          <Readout
            rows={[
              ['P(D \\mid +) = \\frac{\\text{TP}}{\\text{TP} + \\text{FP}}', pct(post)],
              ['P(\\text{no } D \\mid -)', pct(npv, 2)],
              ['\\text{LR}_+ = \\frac{\\text{sens}}{1 - \\text{spec}}', fx(lr, 2)],
              ['\\text{prior odds}', fx(prev / (1 - prev), 4)],
              ['\\text{posterior odds}', fx(post / (1 - post), 3)],
            ]}
          />
          <div className="calc-note">Positive tests come from two groups: the few sick people who test positive, and a small fraction of the many healthy people. When the condition is rare, the second group can be larger.</div>
        </>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="plane calc-tree" style={{ maxWidth: W }} role="img" aria-label="frequency tree">
        <rect width={W} height={H} className="pl-bg" />
        {edge(62, 145, 180, 70, pct(prev, prev < 0.01 ? 2 : 1))}
        {edge(62, 145, 180, 220, pct(1 - prev, prev < 0.01 ? 2 : 1))}
        {edge(222, 70, 318, 32, `sens ${pct(sens)}`)}
        {edge(222, 70, 318, 108, pct(1 - sens))}
        {edge(222, 220, 318, 182, `${pct(1 - spc)}`)}
        {edge(222, 220, 318, 258, `spec ${pct(spc)}`)}
        {node(38, 145, '10,000', 'people')}
        {node(205, 70, big(sick), 'sick')}
        {node(205, 220, big(healthy), 'healthy')}
        {node(360, 32, big(tp), 'test + (TP)', 'var(--c-pos)', true)}
        {node(360, 108, big(fn), 'test − (FN)')}
        {node(360, 182, big(fp), 'test + (FP)', 'var(--c-neg)', true)}
        {node(360, 258, big(tn), 'test − (TN)')}
        <text x={bx + bw / 2} y={btop - 12} textAnchor="middle" className="calc-tree-p">all positives</text>
        <rect x={bx} y={btop} width={bw} height={bh - tpH} style={{ fill: 'var(--c-neg)', opacity: 0.75 }} />
        <rect x={bx} y={btop + bh - tpH} width={bw} height={tpH} style={{ fill: 'var(--c-pos)', opacity: 0.85 }} />
        <text x={bx + bw / 2} y={btop + bh + 16} textAnchor="middle" className="calc-tree-n" style={{ fill: 'var(--c-pos)' }}>{pct(post)} sick</text>
        <text x={bx + bw / 2} y={btop + bh + 30} textAnchor="middle" className="calc-tree-p">{big(tp + fp)} positives</text>
      </svg>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ distributions

const lgamma = (z: number): number => {
  // Lanczos, good to ~1e-13 for z > 0
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let k = 1; k < g + 2; k++) x += c[k] / (z + k);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
};
const SCORES = [2, 1, 0.5, 0, -1];

/**
 * calc.dists — common distributions with parameter sliders, the pmf or pdf, and mean and variance.
 * params: dist ('bern'|'binom'|'poisson'|'cat'|'unif'|'gauss'), lockDist
 */
function Dists({ spec }: { spec: VizSpec }) {
  const [d, setD] = useState((spec.dist as string) ?? 'binom');
  const [p, setP] = useState(0.3);
  const [n, setN] = useState(10);
  const [lam, setLam] = useState(3);
  const [temp, setTemp] = useState(1);
  const [a, setA] = useState(0);
  const [b, setB] = useState(2);
  const [mu, setMu] = useState(0);
  const [sd, setSd] = useState(1);
  const [approx, setApprox] = useState(false);
  let bars: [number, number][] = [], curve: [number, number][] = [], xr: [number, number] = [0, 1];
  let pmfTeX = '', meanTeX = '', varTeX = '', mean = NaN, vari = NaN, sliders: ReactNode = null, xlabels: string[] | null = null;
  if (d === 'bern') {
    bars = [[0, 1 - p], [1, p]]; xr = [-0.8, 1.8];
    pmfTeX = 'P(X{=}1) = p'; meanTeX = 'p'; varTeX = 'p(1-p)'; mean = p; vari = p * (1 - p);
    sliders = <Slider tex="p" value={p} min={0} max={1} step={0.01} onChange={setP} />;
  } else if (d === 'binom') {
    const lc = (k: number) => lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
    bars = Array.from({ length: n + 1 }, (_, k) => [k, Math.exp(lc(k) + k * Math.log(Math.max(p, 1e-300)) + (n - k) * Math.log(Math.max(1 - p, 1e-300)))] as [number, number]);
    if (p === 0) bars = bars.map(([k]) => [k, k === 0 ? 1 : 0]);
    if (p === 1) bars = bars.map(([k]) => [k, k === n ? 1 : 0]);
    xr = [-0.8, n + 0.8];
    pmfTeX = '\\binom{n}{k}p^k(1-p)^{n-k}'; meanTeX = 'np'; varTeX = 'np(1-p)'; mean = n * p; vari = n * p * (1 - p);
    if (approx && vari > 0) curve = linspace(xr[0], xr[1], 200).map((x) => [x, phi((x - mean) / Math.sqrt(vari)) / Math.sqrt(vari)]);
    sliders = (
      <>
        <Slider tex="n" value={n} min={1} max={40} step={1} onChange={setN} />
        <Slider tex="p" value={p} min={0} max={1} step={0.01} onChange={setP} />
        <Toggle label="normal approximation" value={approx} onChange={setApprox} />
      </>
    );
  } else if (d === 'poisson') {
    const K = Math.max(10, Math.ceil(lam + 5 * Math.sqrt(lam)));
    bars = Array.from({ length: K + 1 }, (_, k) => [k, Math.exp(k * Math.log(lam) - lam - lgamma(k + 1))] as [number, number]);
    xr = [-0.8, K + 0.8];
    pmfTeX = 'e^{-\\lambda}\\lambda^k/k!'; meanTeX = '\\lambda'; varTeX = '\\lambda'; mean = lam; vari = lam;
    sliders = <Slider tex="\lambda" value={lam} min={0.2} max={20} step={0.1} onChange={setLam} />;
  } else if (d === 'cat') {
    const e = SCORES.map((s) => Math.exp(s / temp));
    const Z = e.reduce((s, x) => s + x, 0);
    bars = e.map((x, k) => [k, x / Z]);
    xr = [-0.8, SCORES.length - 0.2];
    xlabels = ['a', 'b', 'c', 'd', 'e'];
    pmfTeX = 'p_k = \\frac{e^{s_k/T}}{\\sum_j e^{s_j/T}}';
    sliders = <Slider tex="T" value={temp} min={0.1} max={5} step={0.05} onChange={setTemp} />;
  } else if (d === 'unif') {
    const lo = Math.min(a, b - 0.1), hi = Math.max(b, lo + 0.1);
    xr = [-4, 4];
    curve = [[-4, 0], [lo, 0], [lo, 1 / (hi - lo)], [hi, 1 / (hi - lo)], [hi, 0], [4, 0]];
    pmfTeX = 'f(x) = \\frac{1}{b-a}\\ \\text{on } [a, b]'; meanTeX = '\\tfrac{a+b}{2}'; varTeX = '\\tfrac{(b-a)^2}{12}'; mean = (lo + hi) / 2; vari = (hi - lo) ** 2 / 12;
    sliders = (
      <>
        <Slider tex="a" value={a} min={-3.5} max={3} step={0.1} onChange={setA} />
        <Slider tex="b" value={b} min={-3} max={3.5} step={0.1} onChange={setB} />
      </>
    );
  } else {
    xr = [-6, 6];
    curve = linspace(-6, 6, 300).map((x) => [x, phi((x - mu) / sd) / sd]);
    pmfTeX = '\\frac{1}{\\sqrt{2\\pi}\\sigma}e^{-(x-\\mu)^2/2\\sigma^2}'; meanTeX = '\\mu'; varTeX = '\\sigma^2'; mean = mu; vari = sd * sd;
    sliders = (
      <>
        <Slider tex="\mu" value={mu} min={-3} max={3} step={0.1} onChange={setMu} />
        <Slider tex="\sigma" value={sd} min={0.3} max={3} step={0.05} onChange={setSd} />
      </>
    );
  }
  const ymax = Math.max(0.05, ...bars.map((q) => q[1]), ...curve.map((q) => q[1])) * 1.12;
  const discrete = bars.length > 0;
  const bw = d === 'cat' || d === 'bern' ? 0.6 : 0.8;
  const entropy = d === 'cat' ? -bars.reduce((s, [, q]) => s + (q > 0 ? q * Math.log2(q) : 0), 0) : NaN;
  return (
    <FigureLayout
      side={
        <>
          {!spec.lockDist && (
            <SegControl
              value={d}
              onChange={setD}
              options={[
                { v: 'bern', label: 'Bernoulli' },
                { v: 'binom', label: 'binomial' },
                { v: 'poisson', label: 'Poisson' },
                { v: 'cat', label: 'categorical' },
                { v: 'unif', label: 'uniform' },
                { v: 'gauss', label: 'Gaussian' },
              ]}
            />
          )}
          {sliders}
          <Readout
            rows={
              d === 'cat'
                ? [
                    ['\\text{scores } s', `[${SCORES.join(', ')}]`],
                    ['p', '$' + pmfTeX],
                    ['\\max_k p_k', ff(Math.max(...bars.map((q) => q[1])), 3)],
                    ['H(p)\\ \\text{(bits)}', ff(entropy, 3)],
                  ]
                : [
                    [discrete ? '\\text{pmf}' : '\\text{pdf}', '$' + pmfTeX],
                    [`\\E[X] = ${meanTeX}`, ff(mean, 3)],
                    [`\\Var(X) = ${varTeX}`, ff(vari, 3)],
                  ]
            }
          />
          {d === 'cat' && <div className="calc-note">The outcomes are labels, so a mean is meaningless. This is softmax sampling with temperature T, as used when sampling from a language model: low T concentrates the mass on the top score, high T flattens it.</div>}
          {d === 'poisson' && <div className="calc-note">Counts of independent rare events in a fixed window: clicks per minute, typos per page. Mean and variance are both λ.</div>}
        </>
      }
    >
      <LinePlot series={curve.length ? [{ pts: curve, color: d === 'binom' ? 'var(--c-v)' : 'var(--c-u)', width: 2.5 }] : []} x={xr} y={[0, ymax]} width={440} height={280} xlabel={discrete ? (d === 'cat' ? 'outcome' : 'k') : 'x'} ylabel={discrete ? 'P(X = k)' : 'density'} vlines={Number.isFinite(mean) ? [{ x: mean, color: 'var(--c-w)', label: 'mean' }] : []}>
        {(sx, sy) => (
          <g>
            {bars.map(([k, q]) => (
              <rect key={k} x={sx(k - bw / 2)} y={sy(q)} width={sx(k + bw / 2) - sx(k - bw / 2)} height={sy(0) - sy(q)} style={{ fill: 'var(--c-u)', opacity: 0.75 }} />
            ))}
            {xlabels && xlabels.map((t, k) => <text key={t} x={sx(k)} y={sy(bars[k][1]) - 5} textAnchor="middle" className="pl-tick">{ff(bars[k][1], 2)}</text>)}
          </g>
        )}
      </LinePlot>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ 2-D Gaussian

/**
 * calc.gauss2d — samples from N(0, Σ) with Σ built from σ₁, σ₂, ρ; the 1σ and 2σ ellipses; the
 * eigenvectors of Σ scaled by √λ (the ellipse axes).
 * params: s1, s2, rho
 */
function Gauss2D({ spec }: { spec: VizSpec }) {
  const [s1, setS1] = useState((spec.s1 as number) ?? 1.5);
  const [s2, setS2] = useState((spec.s2 as number) ?? 1);
  const [rho, setRho] = useState((spec.rho as number) ?? 0.6);
  const [showS, setShowS] = useState(true);
  const z = useMemo(() => {
    const r = new Rng(5);
    return Array.from({ length: 300 }, () => [r.normal(), r.normal()] as P2);
  }, []);
  const S = [[s1 * s1, rho * s1 * s2], [rho * s1 * s2, s2 * s2]];
  const L = [[s1, 0], [rho * s2, s2 * Math.sqrt(1 - rho * rho)]];
  const pts = z.map(([a, b]) => [L[0][0] * a, L[1][0] * a + L[1][1] * b] as P2);
  const ell = (r: number) => Array.from({ length: 121 }, (_, k) => { const t = (2 * Math.PI * k) / 120; const a = r * Math.cos(t), b = r * Math.sin(t); return [L[0][0] * a, L[1][0] * a + L[1][1] * b] as P2; });
  const { values, V } = eigSym(S);
  const lmax = values[1], lmin = values[0];
  const q1: P2 = [V[0][1], V[1][1]], q2: P2 = [V[0][0], V[1][0]];
  const sx = Math.sqrt(lmax), sn = Math.sqrt(lmin);
  // sample covariance
  const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let cxx = 0, cxy = 0, cyy = 0;
  for (const [a, b] of pts) { cxx += (a - mx) ** 2; cxy += (a - mx) * (b - my); cyy += (b - my) ** 2; }
  const nn = pts.length - 1;
  const inside1 = z.filter(([a, b]) => a * a + b * b <= 1).length / z.length;
  const ang = (Math.atan2(q1[1], q1[0]) * 180) / Math.PI;
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="\sigma_1" value={s1} min={0.3} max={2} step={0.05} onChange={setS1} />
          <Slider tex="\sigma_2" value={s2} min={0.3} max={2} step={0.05} onChange={setS2} />
          <Slider tex="\rho" value={rho} min={-0.95} max={0.95} step={0.05} onChange={setRho} />
          <Readout
            rows={[
              ['\\Sigma', '$' + tmat(S)],
              ['\\lambda_1, \\lambda_2', `${ff(lmax)}, ${ff(lmin)}`],
              ['\\mathbf{q}_1\\ \\text{angle}', `${fx(((ang % 180) + 180) % 180, 0)}°`],
              ['\\det\\Sigma', ff(S[0][0] * S[1][1] - S[0][1] * S[1][0], 3)],
              ['\\hat\\Sigma\\ (300\\text{ samples})', '$' + tmat([[cxx / nn, cxy / nn], [cxy / nn, cyy / nn]])],
              ['\\text{inside the } 1\\sigma \\text{ ellipse}', `${fx(100 * inside1, 1)}%`],
            ]}
          />
          <Toggle label="samples" value={showS} onChange={setShowS} />
          <div className="calc-note">The arrows are the eigenvectors of Σ scaled by √λ: the ellipse's semi-axes. For a 2-D Gaussian, 39.3% of the mass lies inside the 1σ ellipse and 86.5% inside the 2σ ellipse.</div>
        </>
      }
    >
      <Plane x={[-4, 4]} y={[-4, 4]} width={420}>
        {showS && <Dots pts={pts} />}
        <Path pts={ell(2)} closed color="var(--c-u)" width={1.5} dashed />
        <Path pts={ell(1)} closed color="var(--c-u)" width={2.2} />
        <Arrow to={[sx * q1[0], sx * q1[1]]} color="var(--c-v)" />
        <Arrow to={[sn * q2[0], sn * q2[1]]} color="var(--c-w)" />
        <Label at={[(sx + 0.75) * q1[0], (sx + 0.75) * q1[1]]} tex="\sqrt{\lambda_1}\,\mathbf{q}_1" color="var(--c-v)" />
        <Label at={[(sn + 0.75) * q2[0], (sn + 0.75) * q2[1]]} tex="\sqrt{\lambda_2}\,\mathbf{q}_2" color="var(--c-w)" />
      </Plane>
    </FigureLayout>
  );
}

/** many small points drawn as one path (cheaper than one <Point> each) */
export function Dots({ pts, r = 2.2, color = 'var(--muted)', opacity = 0.55 }: { pts: P2[]; r?: number; color?: string; opacity?: number }) {
  const { sx, sy } = usePlane();
  const d = pts.map(([a, b]) => `M${sx(a).toFixed(1)},${sy(b).toFixed(1)}h0`).join('');
  return <path d={d} style={{ stroke: color, strokeWidth: 2 * r, strokeLinecap: 'round', opacity }} />;
}

// ------------------------------------------------------------------ likelihood

const DATA = [1.2, 2.5, 3.1, 1.8, 2.9, 0.7, 2.2, 3.6];

/**
 * calc.likelihood — data on a line, a Gaussian N(μ, σ²) with sliders, each point's density (its
 * likelihood factor), and the log-likelihood as a function of μ, maximized at the sample mean.
 * params: data (number[]), mu, sigma
 */
function Likelihood({ spec }: { spec: VizSpec }) {
  const data = (spec.data as number[]) ?? DATA;
  const [mu, setMu] = useState((spec.mu as number) ?? 1);
  const [sg, setSg] = useState((spec.sigma as number) ?? 1);
  const n = data.length;
  const xbar = data.reduce((s, x) => s + x, 0) / n;
  const sse = (m: number) => data.reduce((s, x) => s + (x - m) ** 2, 0);
  const ll = (m: number, s: number) => -0.5 * n * Math.log(2 * Math.PI * s * s) - sse(m) / (2 * s * s);
  const sMLE = Math.sqrt(sse(xbar) / n);
  const pdf = (x: number) => phi((x - mu) / sg) / sg;
  const X: [number, number] = [-1, 5];
  const curve = linspace(X[0], X[1], 240).map((x) => [x, pdf(x)] as [number, number]);
  const llc = linspace(X[0], X[1], 240).map((m) => [m, ll(m, sg)] as [number, number]);
  const llMax = ll(xbar, sg);
  const ymaxTop = Math.max(0.45, 1 / (Math.sqrt(2 * Math.PI) * sg) * 1.1);
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="\mu" value={mu} min={-1} max={5} step={0.05} onChange={setMu} />
          <Slider tex="\sigma" value={sg} min={0.4} max={3} step={0.05} onChange={setSg} />
          <Readout
            rows={[
              ['n,\\ \\bar x', `${n}, ${ff(xbar, 3)}`],
              ['\\textstyle\\sum_i (x_i - \\mu)^2', ff(sse(mu), 3)],
              ['\\ell(\\mu, \\sigma) = \\textstyle\\sum_i \\log p(x_i)', ff(ll(mu, sg), 3)],
              ['\\max_\\mu \\ell\\ \\text{(at } \\mu = \\bar x)', ff(llMax, 3)],
              ['\\hat\\sigma_{\\text{MLE}}', ff(sMLE, 3)],
            ]}
          />
          <div className="calc-note">The likelihood is the product of the green heights. Its log, the sum of the log-heights, is the curve below. For any fixed σ it peaks at μ = x̄, because the only μ-dependent term is −Σ(xᵢ − μ)²/2σ².</div>
        </>
      }
    >
      <div className="calc-stack">
        <div className="calc-plotk">density N(μ, σ²) and the height at each data point</div>
        <LinePlot series={[{ pts: curve, color: 'var(--c-u)', width: 2.5 }]} x={X} y={[0, ymaxTop]} width={440} height={190} xlabel="x">
          {(sx, sy) => (
            <g>
              {data.map((x, k) => (
                <g key={k}>
                  <line x1={sx(x)} x2={sx(x)} y1={sy(0)} y2={sy(pdf(x))} style={{ stroke: 'var(--c-w)', strokeWidth: 2.5 }} />
                  <circle cx={sx(x)} cy={sy(0)} r={4} style={{ fill: 'var(--fg)' }} />
                </g>
              ))}
            </g>
          )}
        </LinePlot>
        <div className="calc-plotk">log-likelihood ℓ(μ) for the current σ</div>
        <LinePlot series={[{ pts: llc, color: 'var(--c-v)', width: 2.5 }]} x={X} width={440} height={170} xlabel="μ" vlines={[{ x: xbar, color: 'var(--c-w)' }]}>
          {(sx, sy) => <circle cx={sx(mu)} cy={sy(ll(mu, sg))} r={5} style={{ fill: 'var(--c-v)' }} />}
        </LinePlot>
      </div>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ A/B test

/**
 * calc.abtest — two-proportion z-test. Mode 'pvalue': observed rates and n give z, a p-value
 * (shaded tails) and a confidence interval. Mode 'power': sampling distributions of the difference
 * under H0 and H1 with the rejection region (α) and the power shaded, and the n needed for 80% power.
 * params: mode ('pvalue'|'power'), n, pa, pb, base, lift, lockMode
 */
function ABTest({ spec }: { spec: VizSpec }) {
  const [mode, setMode] = useState((spec.mode as string) ?? 'pvalue');
  const [ln, setLn] = useState(Math.log10((spec.n as number) ?? 2000));
  const [pa, setPa] = useState((spec.pa as number) ?? 0.1);
  const [pb, setPb] = useState((spec.pb as number) ?? 0.115);
  const [base, setBase] = useState((spec.base as number) ?? 0.1);
  const [lift, setLift] = useState((spec.lift as number) ?? 0.1);
  const [alpha, setAlpha] = useState(0.05);
  const n = Math.round(10 ** ln);
  const zc = PhiInv(1 - alpha / 2);
  const nfmt = (v: number) => Math.round(v).toLocaleString('en-US');
  if (mode === 'pvalue') {
    const pp = (pa + pb) / 2;
    const se0 = Math.sqrt(pp * (1 - pp) * (2 / n));
    const se1 = Math.sqrt(pa * (1 - pa) / n + pb * (1 - pb) / n);
    const z = (pb - pa) / se0;
    const pval = 2 * (1 - Phi(Math.abs(z)));
    const X: [number, number] = [-5, 5];
    const curve = linspace(X[0], X[1], 300).map((x) => [x, phi(x)] as [number, number]);
    const az = Math.min(Math.abs(z), 5);
    const tail = (a: number, b: number) => [[a, 0], ...linspace(a, b, 60).map((x) => [x, phi(x)]), [b, 0]] as [number, number][];
    return (
      <FigureLayout
        side={
          <>
            {!spec.lockMode && <SegControl value={mode} onChange={setMode} options={[{ v: 'pvalue', label: 'p-value' }, { v: 'power', label: 'power' }]} />}
            <Slider label="n per arm" value={ln} min={2} max={5.5} step={0.01} onChange={setLn} fmt={() => nfmt(n)} />
            <Slider label="rate A" value={pa} min={0.01} max={0.5} step={0.001} onChange={setPa} fmt={(v) => pct(v)} />
            <Slider label="rate B" value={pb} min={0.01} max={0.5} step={0.001} onChange={setPb} fmt={(v) => pct(v)} />
            <Readout
              rows={[
                ['\\hat p_B - \\hat p_A', `${fx(100 * (pb - pa), 2)} pp`],
                ['\\text{SE (pooled)}', `${fx(100 * se0, 3)} pp`],
                ['z = (\\hat p_B - \\hat p_A)/\\text{SE}', ff(z, 2)],
                ['p\\text{-value (two-sided)}', pval < 1e-4 ? '< 0.0001' : ff(pval, 4)],
                ['95\\%\\ \\text{CI (pp)}', `[${fx(100 * (pb - pa - 1.96 * se1), 2)}, ${fx(100 * (pb - pa + 1.96 * se1), 2)}]`],
              ]}
            />
            <div className="calc-msg">{pval < 0.05 ? <>Significant at the 5% level: a difference at least this large would occur in under 5% of experiments if A and B were truly identical.</> : <>Not significant at the 5% level. This does not show that A and B are equal; the interval still contains meaningful effects.</>}</div>
          </>
        }
      >
        <div className="calc-stack">
          <div className="calc-plotk">distribution of z if A and B have the same rate (H₀); shaded: the p-value</div>
          <LinePlot series={[{ pts: curve, color: 'var(--fg)' }]} x={X} y={[0, 0.45]} width={440} height={250} xlabel="z" vlines={[{ x: -zc, color: 'var(--muted)' }, { x: zc, color: 'var(--muted)' }]}>
            {(sx, sy) => (
              <g>
                {[tail(az, 5), tail(-5, -az)].map((t, k) => <path key={k} d={t.map(([a, b], j) => `${j ? 'L' : 'M'}${sx(a).toFixed(1)},${sy(b).toFixed(1)}`).join('') + 'Z'} style={{ fill: 'var(--c-err)', opacity: 0.35 }} />)}
                <line x1={sx(Math.max(-5, Math.min(5, z)))} x2={sx(Math.max(-5, Math.min(5, z)))} y1={sy(0)} y2={sy(0.42)} style={{ stroke: 'var(--c-v)', strokeWidth: 2.5 }} />
                <text x={sx(Math.max(-4.6, Math.min(4.6, z)))} y={sy(0.42) - 4} textAnchor="middle" className="pl-legend">observed z</text>
              </g>
            )}
          </LinePlot>
        </div>
      </FigureLayout>
    );
  }
  // power mode
  const p1 = base * (1 + lift);
  const delta = p1 - base;
  const pbar = (base + p1) / 2;
  const se0 = Math.sqrt((2 * pbar * (1 - pbar)) / n);
  const se1 = Math.sqrt((base * (1 - base) + p1 * (1 - p1)) / n);
  const c = zc * se0;
  const power = 1 - Phi((c - delta) / se1) + Phi((-c - delta) / se1);
  const zb = PhiInv(0.8);
  const nNeed = ((zc * Math.sqrt(2 * pbar * (1 - pbar)) + zb * Math.sqrt(base * (1 - base) + p1 * (1 - p1))) / delta) ** 2;
  const span = Math.max(4 * se0, delta + 4 * se1);
  const X: [number, number] = [-span, span];
  // densities per percentage point
  const d0 = (x: number) => phi(x / se0) / se0 / 100;
  const d1 = (x: number) => phi((x - delta) / se1) / se1 / 100;
  const xs = linspace(X[0], X[1], 300);
  const ymax = Math.max(d0(0), d1(delta)) * 1.1;
  const area = (f: (x: number) => number, a: number, b: number) => (b <= a ? '' : [[a, 0], ...linspace(a, b, 60).map((x) => [x, f(x)]), [b, 0]] as [number, number][]);
  const scale = (v: number) => 100 * v;
  return (
    <FigureLayout
      side={
        <>
          {!spec.lockMode && <SegControl value={mode} onChange={setMode} options={[{ v: 'pvalue', label: 'p-value' }, { v: 'power', label: 'power' }]} />}
          <Slider label="baseline rate" value={base} min={0.01} max={0.5} step={0.005} onChange={setBase} fmt={(v) => pct(v)} />
          <Slider label="true relative lift" value={lift} min={0.01} max={0.5} step={0.01} onChange={setLift} fmt={(v) => `${fx(100 * v, 0)}%`} />
          <Slider label="n per arm" value={ln} min={2} max={6} step={0.01} onChange={setLn} fmt={() => nfmt(n)} />
          <SegControl value={alpha} onChange={setAlpha} options={[{ v: 0.05, label: 'α = 0.05' }, { v: 0.01, label: 'α = 0.01' }]} />
          <Readout
            rows={[
              ['\\Delta = p_B - p_A', `${fx(100 * delta, 2)} pp`],
              ['\\text{SE under } H_0', `${fx(100 * se0, 3)} pp`],
              ['\\text{power}', pct(power)],
              ['n\\ \\text{for 80\\% power}', nfmt(Math.ceil(nNeed))],
            ]}
          />
          <div className="calc-note">Halving the effect you want to detect needs about four times the sample size, since n grows like 1/Δ².</div>
        </>
      }
    >
      <div className="calc-stack">
        <div className="calc-legend">
          <span><i style={{ background: 'var(--fg)' }} />difference if H₀ is true</span>
          <span><i style={{ background: 'var(--c-w)' }} />if the lift is real (H₁)</span>
        </div>
        <LinePlot
          series={[
            { pts: xs.map((x) => [scale(x), d0(x)] as [number, number]), color: 'var(--fg)' },
            { pts: xs.map((x) => [scale(x), d1(x)] as [number, number]), color: 'var(--c-w)' },
          ]}
          x={[scale(X[0]), scale(X[1])]}
          y={[0, ymax]}
          width={440}
          height={260}
          xlabel="observed difference p̂B − p̂A (percentage points)"
          ylabel="density"
          vlines={[{ x: scale(c), color: 'var(--muted)' }, { x: scale(-c), color: 'var(--muted)' }]}
        >
          {(sx, sy) => {
            const P = (pts: [number, number][] | '') => (pts === '' ? '' : pts.map(([a, b], j) => `${j ? 'L' : 'M'}${sx(scale(a)).toFixed(1)},${sy(b).toFixed(1)}`).join('') + 'Z');
            return (
              <g>
                <path d={P(area(d1, c, X[1]))} style={{ fill: 'var(--c-w)', opacity: 0.3 }} />
                <path d={P(area(d0, c, X[1]))} style={{ fill: 'var(--c-err)', opacity: 0.4 }} />
                <path d={P(area(d0, X[0], -c))} style={{ fill: 'var(--c-err)', opacity: 0.4 }} />
              </g>
            );
          }}
        </LinePlot>
        <div className="calc-note">Red: α, the chance of a false positive under H₀. Green: the power, the chance of a significant result when the lift is real.</div>
      </div>
    </FigureLayout>
  );
}

export const probViz = {
  'calc.clt': { component: CLT, validate: (s: VizSpec) => check(s, { n: isNum }, { source: Object.keys(SOURCES), scale: ['raw', 'std'] }), doc: 'Histogram of 2000 sample means vs the CLT normal. params source (exp|bern|unif), n, scale (raw|std), lockSource' },
  'calc.bayes': { component: Bayes, validate: (s: VizSpec) => check(s, { prev: (v) => isNum(v) && (v as number) > 0 && (v as number) < 1, sens: isNum, spec: isNum }), doc: 'Diagnostic test as a frequency tree with the posterior bar. params prev, sens, spec' },
  'calc.dists': { component: Dists, validate: (s: VizSpec) => check(s, {}, { dist: ['bern', 'binom', 'poisson', 'cat', 'unif', 'gauss'] }), doc: 'pmf/pdf, mean, variance of common distributions. params dist, lockDist' },
  'calc.gauss2d': { component: Gauss2D, validate: (s: VizSpec) => check(s, { s1: isNum, s2: isNum, rho: (v) => isNum(v) && Math.abs(v as number) < 1 }), doc: '2-D Gaussian samples, 1σ/2σ ellipses, eigenvectors of Σ. params s1, s2, rho' },
  'calc.likelihood': { component: Likelihood, validate: (s: VizSpec) => (s.data !== undefined && !(Array.isArray(s.data) && s.data.every(isNum)) ? 'data must be numbers' : check(s, { mu: isNum, sigma: isNum })), doc: 'Gaussian likelihood of data as μ, σ move; log-likelihood curve in μ. params data, mu, sigma' },
  'calc.abtest': { component: ABTest, validate: (s: VizSpec) => check(s, { n: isNum, pa: isNum, pb: isNum, base: isNum, lift: isNum }, { mode: ['pvalue', 'power'] }), doc: 'Two-proportion z-test: p-value mode and power mode. params mode, n, pa, pb, base, lift, lockMode' },
};
