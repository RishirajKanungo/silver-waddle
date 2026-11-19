import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Handle, Poly, Point, Seg, Label, Curve, Slider, Readout, FigureLayout, Btn, Toggle, LinePlot, MatGrid, type P2 } from '../kit';
import { Rng } from '../../math/rng';
import { fx, sigmoid, softplus, Phi, phi } from './common';
import './ml.css';

// ------------------------------------------------------------------ ml.clf-threshold

const N_POP = 10000;
const SX: [number, number] = [-3.5, 6.5];

/**
 * ml.clf-threshold — score distributions of negatives N(0, 1) and positives N(d′, 1) with a draggable threshold.
 * Live confusion matrix (expected counts out of 10 000), precision, recall, F1, specificity, accuracy, and ROC and
 * PR curves with the current point. Prevalence slider (ROC does not move, PR does). costs: true adds a cost ratio
 * and the minimum-expected-cost threshold.
 * params: dprime, prev, t, costs, scaled
 */
function ClfThreshold({ spec }: { spec: VizSpec }) {
  const [dp, setDp] = useState((spec.dprime as number) ?? 1.5);
  const [prev, setPrev] = useState((spec.prev as number) ?? 0.3);
  const [t, setT] = useState((spec.t as number) ?? 1);
  const [scaled, setScaled] = useState(spec.scaled === undefined ? true : !!spec.scaled);
  const [showPost, setShowPost] = useState(!!spec.costs);
  const costs = !!spec.costs;
  const [ratio, setRatio] = useState((spec.ratio as number) ?? 5);
  const tpr = (s: number) => 1 - Phi(s - dp);
  const fpr = (s: number) => 1 - Phi(s);
  const prec = (s: number) => {
    const a = prev * tpr(s), c = (1 - prev) * fpr(s);
    return a + c > 1e-15 ? a / (a + c) : 1;
  };
  const post = (s: number) => {
    const a = prev * phi(s - dp), c = (1 - prev) * phi(s);
    return a / (a + c);
  };
  const TPR = tpr(t), FPR = fpr(t), P = prec(t), R = TPR;
  const F1 = P + R > 0 ? (2 * P * R) / (P + R) : 0;
  const acc = prev * TPR + (1 - prev) * (1 - FPR);
  const pos = N_POP * prev, neg = N_POP - pos;
  const cm = [
    [Math.round(pos * TPR), Math.round(pos * (1 - TPR))],
    [Math.round(neg * FPR), Math.round(neg * (1 - FPR))],
  ];
  const auc = Phi(dp / Math.SQRT2);
  const curves = useMemo(() => {
    const roc: [number, number][] = [], pr: [number, number][] = [];
    let ap = 0, lastR = 0;
    for (let k = 0; k <= 400; k++) {
      const s = 9 - (16 * k) / 400; // from strict to lenient
      const r = tpr(s), f = fpr(s);
      roc.push([f, r]);
      const p = prec(s);
      pr.push([r, p]);
      ap += (r - lastR) * p;
      lastR = r;
    }
    roc.push([1, 1]);
    return { roc, pr, ap };
  }, [dp, prev]); // eslint-disable-line react-hooks/exhaustive-deps
  const cost = (s: number) => ratio * prev * (1 - tpr(s)) + (1 - prev) * fpr(s);
  const tStar = dp > 1e-6 ? (dp * dp / 2 + Math.log((1 - prev) / prev) - Math.log(ratio)) / dp : NaN;
  const yTop = scaled ? Math.max(prev, 1 - prev) * 0.4 * 1.12 : 0.45;
  const sc = (v: number) => v * (yTop / 1.04); // posterior drawn on a 0–1 scale
  const dens = (k: 'p' | 'n') => (s: number) => (k === 'p' ? (scaled ? prev : 1) * phi(s - dp) : (scaled ? 1 - prev : 1) * phi(s));
  const region = (f: (s: number) => number, a: number, b: number): P2[] => {
    if (b <= a) return [];
    const pts: P2[] = [[a, 0]];
    for (let k = 0; k <= 60; k++) {
      const s = a + ((b - a) * k) / 60;
      pts.push([s, f(s)]);
    }
    pts.push([b, 0]);
    return pts;
  };
  const tc = Math.max(SX[0], Math.min(SX[1], t));
  return (
    <FigureLayout
      side={
        <>
          <Slider label="threshold t" value={t} min={-3} max={6} step={0.05} onChange={setT} />
          <Slider label="separation d′" value={dp} min={0} max={4} step={0.05} onChange={setDp} />
          <Slider label="prevalence π" value={prev} min={0.01} max={0.5} step={0.01} onChange={setPrev} />
          {costs && <Slider label="cost FN / FP" value={ratio} min={1} max={50} step={1} onChange={setRatio} fmt={(v) => String(v)} />}
          <div className="ml-cm">
            <MatGrid m={cm} rowLabels={['actual +', 'actual −']} colLabels={['pred +', 'pred −']} fmt={(v) => String(v)} cells={[[0, 0], [1, 1]]} />
          </div>
          <Readout
            rows={[
              ['\\text{recall (TPR)}', fx(TPR, 3)],
              ['\\text{precision}', fx(P, 3)],
              ['F_1', fx(F1, 3)],
              ['\\text{FPR}', fx(FPR, 3)],
              ['\\text{specificity}', fx(1 - FPR, 3)],
              ['\\text{accuracy}', fx(acc, 3)],
              ['\\text{ROC AUC}', fx(auc, 3)],
              ['\\text{PR AUC (AP)}', fx(curves.ap, 3)],
              ...(costs
                ? ([
                    ['P(y{=}1 \\mid s{=}t)', fx(post(t), 3)],
                    ['\\text{cost per example}', fx(cost(t), 4)],
                    ['\\text{min-cost } t^\\star', Number.isFinite(tStar) ? fx(tStar, 2) : '—'],
                  ] as [string, string][])
                : []),
            ]}
          />
          {costs && Number.isFinite(tStar) && (
            <div className="ml-btns">
              <Btn onClick={() => setT(Math.max(-3, Math.min(6, tStar)))}>Go to min-cost t*</Btn>
            </div>
          )}
          <Toggle label="scale densities by prevalence" value={scaled} onChange={setScaled} />
          <Toggle label="show P(y = 1 | score)" value={showPost} onChange={setShowPost} />
        </>
      }
      below={
        <div className="ml-plots">
          <div className="ml-plot">
            <div className="ml-plot-title">ROC: TPR vs FPR</div>
            <LinePlot series={[{ pts: curves.roc, color: 'var(--accent)' }, { pts: [[0, 0], [1, 1]], color: 'var(--muted)', dashed: true, width: 1 }]} x={[0, 1]} y={[0, 1]} width={260} height={240} xlabel="FPR" ylabel="TPR">
              {(sx, sy) => <circle cx={sx(FPR)} cy={sy(TPR)} r={5.5} style={{ fill: 'var(--c-v)', stroke: 'var(--surface)', strokeWidth: 1.5 }} />}
            </LinePlot>
          </div>
          <div className="ml-plot">
            <div className="ml-plot-title">PR: precision vs recall</div>
            <LinePlot series={[{ pts: curves.pr, color: 'var(--accent)' }]} x={[0, 1]} y={[0, 1]} width={260} height={240} xlabel="recall" ylabel="precision" hlines={[{ y: prev, color: 'var(--muted)' }]}>
              {(sx, sy) => <circle cx={sx(R)} cy={sy(P)} r={5.5} style={{ fill: 'var(--c-v)', stroke: 'var(--surface)', strokeWidth: 1.5 }} />}
            </LinePlot>
          </div>
        </div>
      }
    >
      <Plane x={SX} y={[0, yTop]} width={460} height={230} grid={false} ticks={false} xLabel="score s">
        <Poly pts={region(dens('n'), SX[0], tc)} fill="var(--c-neg)" fillOpacity={0.12} />
        <Poly pts={region(dens('n'), tc, SX[1])} fill="var(--c-neg)" fillOpacity={0.45} />
        <Poly pts={region(dens('p'), SX[0], tc)} fill="var(--c-pos)" fillOpacity={0.12} />
        <Poly pts={region(dens('p'), tc, SX[1])} fill="var(--c-pos)" fillOpacity={0.45} />
        <Curve f={dens('n')} color="var(--c-neg)" width={2} />
        <Curve f={dens('p')} color="var(--c-pos)" width={2} />
        {showPost && <Curve f={(s) => sc(post(s))} color="var(--fg)" width={1.4} dashed />}
        {showPost && <Label at={[SX[1] - 0.1, sc(1) - yTop * 0.06]} text="P(y=1|s)" anchor="end" color="var(--fg)" />}
        {costs && Number.isFinite(tStar) && <Seg a={[tStar, 0]} b={[tStar, yTop]} color="var(--c-w)" width={2} dashed />}
        <Seg a={[tc, 0]} b={[tc, yTop]} color="var(--fg)" width={2} />
        <Label at={[SX[0] + 0.1, yTop * 0.93]} text="negatives" anchor="start" color="var(--c-neg)" />
        <Label at={[SX[0] + 0.1, yTop * 0.8]} text="positives" anchor="start" color="var(--c-pos)" />
        <Handle at={[tc, yTop * 0.88]} onChange={([s]) => setT(Math.max(-3, Math.min(6, s)))} color="var(--fg)" r={6} snap={0.05} label="threshold" bounds={{ x: [-3, 6], y: [yTop * 0.88, yTop * 0.88] }} />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ ml.clf-calibration

const CAL = (() => {
  const r = new Rng(7);
  const n = 2000;
  const ell: number[] = [], y: number[] = [];
  for (let i = 0; i < n; i++) {
    const l = r.normal(0, 1.6);
    ell.push(l);
    y.push(r.next() < sigmoid(l) ? 1 : 0);
  }
  // AUC from ranks (scores are a monotone function of ell, so it is the same for every k)
  const idx = ell.map((_, i) => i).sort((a, b) => ell[a] - ell[b]);
  let rankSum = 0, npos = 0;
  idx.forEach((i, rank) => {
    if (y[i]) {
      rankSum += rank + 1;
      npos++;
    }
  });
  const nneg = n - npos;
  const auc = (rankSum - (npos * (npos + 1)) / 2) / (npos * nneg);
  return { ell, y, n, auc };
})();
const nllAt = (k: number) => CAL.ell.reduce((s, l, i) => s + softplus(-(2 * CAL.y[i] - 1) * k * l), 0) / CAL.n;

/**
 * ml.clf-calibration — reliability diagram for 2000 synthetic predictions p̂ = σ(k·ℓ), where ℓ is the true logit.
 * k > 1 is overconfident, k < 1 underconfident, k = 1 calibrated. Histogram of p̂, ECE, log loss, Brier score, AUC
 * (unchanged by k), and a temperature-scaling button that fits T on the data.
 * params: k
 */
function ClfCalibration({ spec }: { spec: VizSpec }) {
  const [lk, setLk] = useState(Math.log2((spec.k as number) ?? 2.5));
  const [T, setT] = useState<number | null>(null);
  const k = 2 ** lk;
  const p = useMemo(() => CAL.ell.map((l) => sigmoid(k * l)), [k]);
  const bins = useMemo(() => {
    const B = 10;
    const out = Array.from({ length: B }, (_, b) => ({ lo: b / B, hi: (b + 1) / B, n: 0, conf: 0, acc: 0 }));
    p.forEach((v, i) => {
      const b = Math.min(B - 1, Math.floor(v * B));
      out[b].n++;
      out[b].conf += v;
      out[b].acc += CAL.y[i];
    });
    out.forEach((o) => {
      if (o.n) {
        o.conf /= o.n;
        o.acc /= o.n;
      }
    });
    return out;
  }, [p]);
  const ece = bins.reduce((s, o) => s + (o.n / CAL.n) * Math.abs(o.acc - o.conf), 0);
  const brier = p.reduce((s, v, i) => s + (v - CAL.y[i]) ** 2, 0) / CAL.n;
  const nll = nllAt(k);
  const acc = p.filter((v, i) => (v > 0.5 ? 1 : 0) === CAL.y[i]).length / CAL.n;
  const fitT = () => {
    // minimize NLL of σ(k·ℓ / T) over log T by golden-section search
    let a = -4, b = 4;
    const g = (Math.sqrt(5) - 1) / 2;
    const f = (lt: number) => nllAt(k / Math.exp(lt));
    for (let it = 0; it < 80; it++) {
      const c = b - g * (b - a), d = a + g * (b - a);
      if (f(c) < f(d)) b = d;
      else a = c;
    }
    const Tf = Math.exp((a + b) / 2);
    setT(Tf);
    setLk(Math.log2(k / Tf));
  };
  const maxN = Math.max(...bins.map((o) => o.n));
  const H0 = -0.34, H1 = -0.06; // histogram band
  return (
    <FigureLayout
      side={
        <>
          <Slider label="sharpness k" value={lk} min={-2} max={2} step={0.05} onChange={(v) => { setLk(v); setT(null); }} fmt={(v) => (2 ** v).toFixed(2)} />
          <Readout
            rows={[
              ['\\text{ECE (10 bins)}', fx(ece, 3)],
              ['\\text{log loss}', fx(nll, 4)],
              ['\\text{Brier score}', fx(brier, 4)],
              ['\\text{ROC AUC}', fx(CAL.auc, 3)],
              ['\\text{accuracy at } 0.5', fx(acc, 3)],
              ...(T !== null ? ([['\\text{fitted } T', fx(T, 2)]] as [string, string][]) : []),
            ]}
          />
          <div className="ml-btns">
            <Btn primary onClick={fitT}>Temperature-scale</Btn>
          </div>
          <div className="ml-note">
            {k > 1.15 ? 'Overconfident: predictions near 0 and 1 are right less often than they claim.' : k < 0.87 ? 'Underconfident: predictions are squeezed towards 0.5.' : 'Close to calibrated: each bar reaches the diagonal.'}
          </div>
          <div className="muted small">Bars: fraction of positives in each bin. Dots: mean predicted probability in the bin. Bottom: how many predictions fall in each bin.</div>
        </>
      }
    >
      <Plane x={[-0.1, 1.04]} y={[-0.4, 1.04]} width={420} height={420} grid={false} axes={false}>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <Seg a={[0, v]} b={[1, v]} color="var(--line)" width={1} />
            <Label at={[-0.05, v]} text={String(v)} color="var(--muted)" />
            <Label at={[v, H0 - 0.035]} text={String(v)} color="var(--muted)" />
          </g>
        ))}
        {bins.map((o, i) =>
          o.n ? (
            <g key={i}>
              <Poly pts={[[o.lo + 0.006, 0], [o.hi - 0.006, 0], [o.hi - 0.006, o.acc], [o.lo + 0.006, o.acc]]} fill="var(--c-u)" fillOpacity={0.4} stroke="var(--c-u)" width={1} />
              <Poly pts={[[o.lo + 0.006, H0], [o.hi - 0.006, H0], [o.hi - 0.006, H0 + ((H1 - H0) * o.n) / maxN], [o.lo + 0.006, H0 + ((H1 - H0) * o.n) / maxN]]} fill="var(--muted)" fillOpacity={0.45} />
            </g>
          ) : null,
        )}
        <Seg a={[0, 0]} b={[1, 1]} color="var(--fg)" width={1.5} dashed />
        {bins.map((o, i) => (o.n ? <Seg key={'g' + i} a={[(o.lo + o.hi) / 2, o.acc]} b={[(o.lo + o.hi) / 2, o.conf]} color="var(--c-err)" width={2} /> : null))}
        {bins.filter((o) => o.n).map((o, i) => <Point key={'d' + i} at={[(o.lo + o.hi) / 2, o.conf]} r={3.5} color="var(--c-v)" />)}
        <Seg a={[0, 0]} b={[1, 0]} color="var(--axis)" width={1} />
        <Seg a={[0, 0]} b={[0, 1]} color="var(--axis)" width={1} />
        <Label at={[0.02, 0.97]} text="observed frequency" anchor="start" color="var(--muted)" />
        <Label at={[0.98, H1 + 0.03]} text="predicted probability p̂ (bins)" anchor="end" color="var(--muted)" />
      </Plane>
    </FigureLayout>
  );
}

export const evaluateViz = {
  'ml.clf-threshold': {
    component: ClfThreshold,
    validate: (s: VizSpec) => (s.prev !== undefined && !(typeof s.prev === 'number' && s.prev > 0 && s.prev < 1) ? 'prev must be in (0, 1)' : null),
    doc: 'Two Gaussian score distributions, draggable threshold, live confusion matrix, metrics, ROC and PR curves; prevalence and separation sliders; costs: true adds the min-cost threshold. params dprime, prev, t, costs, ratio, scaled',
  },
  'ml.clf-calibration': {
    component: ClfCalibration,
    validate: (s: VizSpec) => (s.k !== undefined && !(typeof s.k === 'number' && s.k > 0) ? 'k must be positive' : null),
    doc: 'Reliability diagram with a sharpness slider (over/under-confidence), ECE, log loss, Brier, AUC, and temperature scaling. params k',
  },
};
