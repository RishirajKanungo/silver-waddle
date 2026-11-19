// Figures for evaluation utilities: ROC curve and AUC as ranking, stratified k-fold.
import { useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Handle, Point, Seg, Path, Poly, Label, Slider, Readout, FigureLayout, SegControl, MatGrid, type P2 } from '../kit';
import { fx, isNumArr } from './common';

// ------------------------------------------------------------------ sd.roc

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ROC_POS = [0.92, 0.8, 0.62, 0.45, 0.33];
const ROC_NEG = [0.71, 0.52, 0.38, 0.2, 0.08];

function rocPoints(pos: number[], neg: number[]): P2[] {
  // sweep thresholds over all distinct scores, from high to low; ties move diagonally
  const all = [...new Set([...pos, ...neg])].sort((a, b) => b - a);
  const pts: P2[] = [[0, 0]];
  for (const t of all) {
    const tpr = pos.filter((s) => s >= t).length / pos.length;
    const fpr = neg.filter((s) => s >= t).length / neg.length;
    pts.push([fpr, tpr]);
  }
  return pts;
}

/**
 * sd.roc — drag the scores and the threshold; ROC curve, confusion matrix and AUC as the share of correctly ordered pairs.
 */
function Roc({ spec }: { spec: VizSpec }) {
  const [pos, setPos] = useState<number[]>(isNumArr(spec.pos) ? (spec.pos as number[]) : ROC_POS);
  const [neg, setNeg] = useState<number[]>(isNumArr(spec.neg) ? (spec.neg as number[]) : ROC_NEG);
  const [thr, setThr] = useState(0.5);
  const tp = pos.filter((s) => s >= thr).length, fn = pos.length - tp;
  const fp = neg.filter((s) => s >= thr).length, tn = neg.length - fp;
  const tpr = tp / pos.length, fpr = fp / neg.length;
  const prec = tp + fp ? tp / (tp + fp) : 0;
  const f1 = prec + tpr ? (2 * prec * tpr) / (prec + tpr) : 0;
  let U = 0;
  for (const p of pos) for (const n of neg) U += p > n ? 1 : p === n ? 0.5 : 0;
  const pairs = pos.length * neg.length;
  const curve = rocPoints(pos, neg);
  const area: P2[] = [...curve, [1, 0]];
  const yPos = 0.68, yNeg = 0.4;
  return (
    <FigureLayout
      side={
        <>
          <MatGrid m={[[tp, fn], [fp, tn]]} rowLabels={['actual +', 'actual −']} colLabels={['pred +', 'pred −']} cells={[[0, 0], [1, 1]]} cellSize={52} />
          <Readout
            rows={[
              ['\\text{threshold}', fx(thr, 2)],
              ['\\text{TPR (recall)}', fx(tpr, 3)],
              ['\\text{FPR}', fx(fpr, 3)],
              ['\\text{precision}', fx(prec, 3)],
              ['F_1', fx(f1, 3)],
              ['\\text{pairs ordered correctly}', `${fx(U, 1)} of ${pairs}`],
              ['\\text{AUC}', fx(U / pairs, 3)],
            ]}
          />
        </>
      }
      below={
        <div style={{ width: '100%' }}>
          <Plane x={[-0.13, 1.03]} y={[0, 1]} width={520} height={150} grid={false} ticks={false} axes={false}>
            <Seg a={[0, yPos]} b={[1, yPos]} color="var(--line)" />
            <Seg a={[0, yNeg]} b={[1, yNeg]} color="var(--line)" />
            {[0, 0.25, 0.5, 0.75, 1].map((v) => (
              <Label key={v} at={[v, 0.93]} text={String(v)} color="var(--muted)" />
            ))}
            <Poly pts={[[thr, 0.1], [1.03, 0.1], [1.03, 0.84], [thr, 0.84]]} fill="var(--accent)" fillOpacity={0.07} />
            <Seg a={[thr, 0.12]} b={[thr, 0.84]} color="var(--accent)" width={2} dashed />
            <Label at={[-0.125, yPos]} text="pos" color="var(--c-pos)" anchor="start" />
            <Label at={[-0.125, yNeg]} text="neg" color="var(--c-neg)" anchor="start" />
            <Label at={[-0.125, 0.12]} text="threshold" color="var(--accent)" anchor="start" />
            {pos.map((s, k) => (
              <Handle key={'p' + k} at={[s, yPos]} onChange={(p) => setPos(pos.map((v, t) => (t === k ? Math.round(clamp01(p[0]) * 100) / 100 : v)))} color="var(--c-pos)" bounds={{ x: [0, 1], y: [yPos, yPos] }} label={`positive score ${k + 1}`} />
            ))}
            {neg.map((s, k) => (
              <Handle key={'n' + k} at={[s, yNeg]} onChange={(p) => setNeg(neg.map((v, t) => (t === k ? Math.round(clamp01(p[0]) * 100) / 100 : v)))} color="var(--c-neg)" bounds={{ x: [0, 1], y: [yNeg, yNeg] }} label={`negative score ${k + 1}`} />
            ))}
            <Handle at={[thr, 0.12]} onChange={(p) => setThr(Math.round(clamp01(p[0]) * 100) / 100)} color="var(--accent)" r={7} bounds={{ x: [0, 1], y: [0.12, 0.12] }} label="threshold" />
          </Plane>
          <div className="muted small">Drag the scores along their lines, and the threshold handle at the bottom. A score at or above the threshold is predicted positive.</div>
        </div>
      }
    >
      <Plane x={[0, 1]} y={[0, 1]} width={300} gridStep={0.2} xLabel="FPR" yLabel="TPR">
        <Poly pts={area} fill="var(--c-w)" fillOpacity={0.12} />
        <Seg a={[0, 0]} b={[1, 1]} color="var(--muted)" dashed />
        <Path pts={curve} color="var(--c-w)" width={2.5} />
        <Point at={[fpr, tpr]} r={6} color="var(--accent)" />
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ sd.kfold

const KF_Y = [0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1];

function foldIds(y: number[], k: number, strat: boolean): number[] {
  const n = y.length;
  if (!strat) {
    // contiguous folds like an unshuffled KFold: the first n % k folds get one extra sample
    const out: number[] = [];
    let f = 0, start = 0;
    while (f < k) {
      const size = Math.floor(n / k) + (f < n % k ? 1 : 0);
      for (let i = start; i < start + size; i++) out[i] = f;
      start += size;
      f++;
    }
    return out;
  }
  const out = new Array(n).fill(0);
  for (const c of [...new Set(y)].sort()) {
    let r = 0;
    y.forEach((v, i) => {
      if (v === c) out[i] = r++ % k;
    });
  }
  return out;
}

/**
 * sd.kfold — plain contiguous folds versus stratified (round-robin per class) folds on an imbalanced dataset.
 */
function KFold({ spec }: { spec: VizSpec }) {
  const y = isNumArr(spec.y) ? (spec.y as number[]) : KF_Y;
  const [k, setK] = useState(3);
  const [mode, setMode] = useState<'plain' | 'strat'>('plain');
  const fold = foldIds(y, k, mode === 'strat');
  const n = y.length;
  const nPos = y.filter((v) => v === 1).length;
  const cell = 20, gap = 3, left = 54, right = 6, top = 22;
  const W = left + n * (cell + gap) + right, H = top + k * (cell + 12) + 6;
  const stats = Array.from({ length: k }, (_, f) => {
    const idx = fold.map((v, i) => (v === f ? i : -1)).filter((i) => i >= 0);
    const p = idx.filter((i) => y[i] === 1).length;
    return { size: idx.length, pos: p };
  });
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={mode} onChange={setMode} options={[{ v: 'plain', label: 'plain' }, { v: 'strat', label: 'stratified' }]} />
          <Slider tex="k" value={k} min={2} max={5} step={1} onChange={setK} fmt={(v) => String(v)} />
          <Readout
            rows={[
              ['\\text{overall positive share}', `${nPos}/${n} = ${fx(nPos / n, 2)}`],
              ...stats.map((s, f) => [`\\text{fold } ${f + 1}`, `${s.pos}/${s.size} = ${fx(s.pos / s.size, 2)}`] as [string, string]),
            ]}
          />
          {stats.some((s) => s.pos === 0) && <div className="sd-warn">A test fold with no positives: recall and AUC are undefined on it.</div>}
        </>
      }
      below={
        <div className="sd-legend">
          <span><span className="sd-sw" style={{ background: 'var(--c-pos)' }} />positive, in the test fold</span>
          <span><span className="sd-sw" style={{ background: 'var(--c-neg)' }} />negative, in the test fold</span>
          <span><span className="sd-sw" style={{ background: 'var(--surface2)', border: '1px solid var(--line)' }} />training sample</span>
        </div>
      }
    >
      <div style={{ width: '100%' }}>
      <div className="sd-scroll">
        <svg viewBox={`0 0 ${W} ${H}`} className="sd-svg" style={{ maxWidth: W }} role="img" aria-label="fold assignment grid">
          <rect width={W} height={H} className="pl-bg" />
          {y.map((v, i) => (
            <text key={'i' + i} x={left + i * (cell + gap) + cell / 2} y={14} textAnchor="middle" className="sd-ts sd-num">
              {i % 5 === 0 ? i : ''}
            </text>
          ))}
          {Array.from({ length: k }, (_, f) => {
            const yy = top + f * (cell + 12);
            return (
              <g key={f}>
                <text x={6} y={yy + cell / 2 + 4} className="sd-t">
                  fold {f + 1}
                </text>
                {y.map((v, i) => {
                  const test = fold[i] === f;
                  const col = v === 1 ? 'var(--c-pos)' : 'var(--c-neg)';
                  return <rect key={i} x={left + i * (cell + gap)} y={yy} width={cell} height={cell} rx={3} style={{ fill: test ? col : 'var(--surface2)', stroke: test ? col : v === 1 ? 'var(--c-pos)' : 'var(--line)', strokeWidth: test ? 0 : v === 1 ? 1.5 : 1 }} />;
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="muted small" style={{ marginTop: 6 }}>
        Samples in index order. In row f, the filled squares are test fold f and the pale squares are its training set; positives keep an orange outline.
      </div>
      </div>
    </FigureLayout>
  );
}

export const evalViz = {
  'sd.roc': { component: Roc, doc: 'ROC curve, confusion matrix at a draggable threshold, and AUC as correctly ordered pairs. params pos, neg (scores in [0,1])', validate: (s: VizSpec) => ((s.pos !== undefined && !isNumArr(s.pos)) || (s.neg !== undefined && !isNumArr(s.neg)) ? 'pos/neg must be number arrays' : null) },
  'sd.kfold': { component: KFold, doc: 'Plain contiguous vs stratified k-fold on an imbalanced label vector. params y (0/1 array)', validate: (s: VizSpec) => (s.y !== undefined && !isNumArr(s.y) ? 'y must be a 0/1 array' : null) },
};
