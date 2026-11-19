// Figures for the ML coding round: pairwise distances, k-means, stable softmax,
// gradient checking, and attention with a causal mask.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Handle, Point, Seg, Label, Path, Slider, Readout, FigureLayout, SegControl, Toggle, MatGrid, LinePlot, Bars, usePlayer, Btn, TeX, type P2 } from '../kit';
import { Rng } from '../../math/rng';
import { fx, PALETTE, MatBlock, isNumArr } from './common';

// ------------------------------------------------------------------ sd.pairdist

const PD_A: P2[] = [[-2, 1], [1, 2], [2, -1]];
const PD_B: P2[] = [[-1, -2], [0, 1], [3, 1], [-3, -1]];

/**
 * sd.pairdist — all pairwise squared distances as ‖a‖² (column) + ‖b‖² (row) − 2ABᵀ.
 * Drag the points; click a cell of D to see its three pieces.
 */
function PairDist({ spec }: { spec: VizSpec }) {
  const [A, setA] = useState<P2[]>((spec.A as P2[]) ?? PD_A);
  const [B, setB] = useState<P2[]>((spec.B as P2[]) ?? PD_B);
  const [sel, setSel] = useState<[number, number]>([1, 2]);
  const [i, j] = sel;
  const sqA = A.map((a) => a[0] ** 2 + a[1] ** 2);
  const sqB = B.map((b) => b[0] ** 2 + b[1] ** 2);
  const AB = A.map((a) => B.map((b) => a[0] * b[0] + a[1] * b[1]));
  const D = A.map((_, r) => B.map((_, c) => sqA[r] + sqB[c] - 2 * AB[r][c]));
  const direct = (A[i][0] - B[j][0]) ** 2 + (A[i][1] - B[j][1]) ** 2;
  const f = (v: number) => fx(v, 2);
  const cs = 38;
  return (
    <FigureLayout
      side={
        <>
          <Readout
            title={`entry (${i + 1}, ${j + 1})`}
            rows={[
              [`\\lVert\\mathbf{a}_${i + 1}\\rVert^2`, f(sqA[i])],
              [`\\lVert\\mathbf{b}_${j + 1}\\rVert^2`, f(sqB[j])],
              [`-2\\,\\mathbf{a}_${i + 1}\\cdot\\mathbf{b}_${j + 1}`, f(-2 * AB[i][j])],
              ['\\text{sum } D_{' + (i + 1) + (j + 1) + '}', f(D[i][j])],
              ['\\lVert\\mathbf{a}_' + (i + 1) + '-\\mathbf{b}_' + (j + 1) + '\\rVert^2\\ \\text{direct}', f(direct)],
            ]}
          />
          <div className="small">
            Click any cell of <TeX>D</TeX> below to pick a pair. The highlighted row of the column vector, column of the row vector and cell of <TeX>{'-2AB^\\top'}</TeX> add up to it.
          </div>
          <div className="muted small">Drag the points (blue: rows of A, orange: rows of B).</div>
        </>
      }
      below={
        <div className="sd-scroll">
          <div className="sd-mats">
            <MatBlock shape="(3, 1)">
              <MatGrid m={sqA.map((v) => [v])} rows={[i]} cells={[[i, 0]]} cellSize={cs} fmt={f} />
            </MatBlock>
            <span className="sd-op">+</span>
            <MatBlock shape="(1, 4)">
              <MatGrid m={[sqB]} cols={[j]} cells={[[0, j]]} cellSize={cs} fmt={f} />
            </MatBlock>
            <span className="sd-op">−</span>
            <MatBlock shape="2 · (3, 4)">
              <MatGrid m={AB.map((r) => r.map((v) => 2 * v))} cells={[[i, j]]} cellSize={cs} fmt={f} />
            </MatBlock>
            <span className="sd-op">=</span>
            <MatBlock shape="D: (3, 4)">
              <MatGrid m={D} cells={[[i, j]]} rows={[i]} cols={[j]} cellSize={cs} fmt={f} heat="seq" onCell={(r, c) => setSel([r, c])} />
            </MatBlock>
          </div>
        </div>
      }
    >
      <Plane x={[-4, 4]} y={[-4, 4]} width={340}>
        <Seg a={A[i]} b={B[j]} color="var(--c-w)" width={3} />
        {A.map((a, k) => (
          <Handle key={'a' + k} at={a} onChange={(p) => setA(A.map((q, t) => (t === k ? p : q)))} color="var(--c-u)" snap={0.5} label={`a${k + 1}`} tex={`\\mathbf{a}_${k + 1}`} />
        ))}
        {B.map((b, k) => (
          <Handle key={'b' + k} at={b} onChange={(p) => setB(B.map((q, t) => (t === k ? p : q)))} color="var(--c-v)" snap={0.5} label={`b${k + 1}`} tex={`\\mathbf{b}_${k + 1}`} />
        ))}
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ sd.kmeans

function blobs(): P2[] {
  const r = new Rng(7);
  const centers: P2[] = [[-2.6, 1.6], [2.4, 2.0], [0.4, -2.4]];
  const pts: P2[] = [];
  centers.forEach((c) => {
    for (let k = 0; k < 9; k++) pts.push([c[0] + 0.75 * r.normal(), c[1] + 0.75 * r.normal()]);
  });
  return pts;
}
const KM_INIT: P2[] = [[0, 4], [4, 0], [-4, -3]];
const d2 = (a: P2, b: P2) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
const nearest = (p: P2, C: P2[]) => C.reduce((best, c, k) => (d2(p, c) < d2(p, C[best]) ? k : best), 0);

interface KFrame { C: P2[]; z: number[]; phase: 'start' | 'assign' | 'update'; inertia: number }
function lloyd(X: P2[], init: P2[], maxFrames = 21): KFrame[] {
  let C = init.map((c) => [...c] as P2);
  let z = X.map((p) => nearest(p, C));
  const inertia = () => X.reduce((s, p, i) => s + d2(p, C[z[i]]), 0);
  const frames: KFrame[] = [{ C, z, phase: 'start', inertia: inertia() }];
  for (let f = 1; f < maxFrames; f++) {
    if (f % 2 === 1) {
      // update
      C = C.map((c, k) => {
        const mine = X.filter((_, i) => z[i] === k);
        return mine.length ? ([mine.reduce((s, p) => s + p[0], 0) / mine.length, mine.reduce((s, p) => s + p[1], 0) / mine.length] as P2) : c;
      });
      frames.push({ C, z, phase: 'update', inertia: inertia() });
    } else {
      const nz = X.map((p) => nearest(p, C));
      const same = nz.every((v, i) => v === z[i]);
      z = nz;
      frames.push({ C, z, phase: 'assign', inertia: inertia() });
      if (same) break;
    }
  }
  return frames;
}

/**
 * sd.kmeans — Lloyd's algorithm step by step on three blobs. Drag the initial centroids.
 */
function KMeans({ spec }: { spec: VizSpec }) {
  const X = useMemo(blobs, []);
  const [init, setInit] = useState<P2[]>((spec.init as P2[]) ?? KM_INIT);
  const frames = useMemo(() => lloyd(X, init), [X, init]);
  const { i, setI, controls } = usePlayer(frames.length, { interval: 800 });
  const fr = frames[Math.min(i, frames.length - 1)];
  const moveInit = (k: number, p: P2) => {
    setInit(init.map((c, t) => (t === k ? p : c)));
    setI(0);
  };
  const last = frames[frames.length - 1];
  return (
    <FigureLayout
      side={
        <>
          <Readout
            rows={[
              ['\\text{step}', `${i} / ${frames.length - 1}`],
              ['\\text{phase}', fr.phase === 'start' ? 'initial assignment' : fr.phase],
              ['\\text{inertia } \\textstyle\\sum_i \\lVert \\mathbf{x}_i - \\mathbf{c}_{z_i}\\rVert^2', fx(fr.inertia, 2)],
              ['\\text{final inertia}', fx(last.inertia, 2)],
            ]}
          />
          <LinePlot series={[{ pts: frames.slice(0, i + 1).map((f, t) => [t, f.inertia] as [number, number]), color: 'var(--accent)' }, { pts: frames.slice(0, i + 1).map((f, t) => [t, f.inertia] as [number, number]), color: 'var(--accent)', scatter: true }]} x={[0, Math.max(4, frames.length - 1)]} y={[0, Math.max(...frames.map((f) => f.inertia)) * 1.05]} width={240} height={150} xlabel="step" ylabel="inertia" legend={false} />
          <div className="sd-btns">
            <Btn onClick={() => { setInit(KM_INIT); setI(0); }}>Default start</Btn>
          </div>
          <div className="muted small">Drag the hollow rings (initial centroids) to change the start. Each step either reassigns points or moves centroids to their cluster means.</div>
        </>
      }
      below={controls}
    >
      <Plane x={[-5, 5]} y={[-5, 5]} width={400}>
        {X.map((p, k) => (
          <Seg key={'l' + k} a={p} b={fr.C[fr.z[k]]} color={PALETTE[fr.z[k]]} width={1} opacity={0.25} />
        ))}
        {X.map((p, k) => (
          <Point key={'p' + k} at={p} r={4} color={PALETTE[fr.z[k]]} />
        ))}
        {[0, 1, 2].map((k) => (
          <Path key={'t' + k} pts={frames.slice(0, i + 1).map((f) => f.C[k])} color={PALETTE[k]} width={1.5} dashed />
        ))}
        {fr.C.map((c, k) => (
          <g key={'c' + k}>
            <Point at={c} r={8} color={PALETTE[k]} />
            <Label at={c} text="×" color="var(--surface)" dy={-1} />
          </g>
        ))}
        {init.map((c, k) => (
          <g key={'h' + k}>
            <Point at={c} r={7} color={PALETTE[k]} hollow />
            <Handle at={c} onChange={(p) => moveInit(k, p)} color={PALETTE[k]} r={3} snap={0.25} label={`initial centroid ${k + 1}`} />
          </g>
        ))}
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ sd.softmax

/**
 * sd.softmax — naive versus max-subtracted softmax in float64 as a constant c is added to every logit.
 */
function Softmax({ spec }: { spec: VizSpec }) {
  const z0 = isNumArr(spec.z) ? (spec.z as number[]) : [2, 1, 0.5, -1];
  const [c, setC] = useState(0);
  const [y, setY] = useState(0);
  const z = z0.map((v) => v + c);
  const naiveE = z.map(Math.exp);
  const naiveSum = naiveE.reduce((s, v) => s + v, 0);
  const naiveP = naiveE.map((v) => v / naiveSum);
  const m = Math.max(...z);
  const stE = z.map((v) => Math.exp(v - m));
  const stSum = stE.reduce((s, v) => s + v, 0);
  const p = stE.map((v) => v / stSum);
  const lse = m + Math.log(stSum);
  const ceStable = lse - z[y];
  const ceNaive = -Math.log(naiveP[y]);
  const broken = !naiveP.every(Number.isFinite);
  const show = (v: number) => (Number.isFinite(v) ? (Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(2) : fx(v, 3)) : Number.isNaN(v) ? 'NaN' : 'inf');
  const cls = (v: number) => (Number.isFinite(v) ? undefined : 'nan');
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="c" value={c} min={0} max={800} step={1} onChange={setC} fmt={(v) => String(v)} />
          <SegControl label="target y" value={y} onChange={setY} options={z0.map((_, k) => ({ v: k, label: String(k + 1) }))} />
          <Readout
            rows={[
              ['\\max_k (z_k + c)', fx(m, 2)],
              ['\\textstyle\\sum_k e^{z_k + c}\\ \\text{naive}', show(naiveSum)],
              ['\\text{CE naive } -\\log p_y', show(ceNaive)],
              ['\\text{CE via LSE}', fx(ceStable, 4)],
            ]}
          />
          <div className={broken ? 'sd-warn' : 'small'}>
            {broken ? 'exp overflowed to inf: the naive probabilities are 0 or NaN. The stable column is unchanged.' : 'Float64 exp overflows once its argument passes about 709.78.'}
          </div>
        </>
      }
      below={
        <div className="sd-scroll" style={{ width: '100%' }}>
          <table className="sd-table">
            <thead>
              <tr>
                <th>class</th>
                <th>z + c</th>
                <th>naive exp(z + c)</th>
                <th>naive p</th>
                <th>exp(z + c − max)</th>
                <th>stable p</th>
              </tr>
            </thead>
            <tbody>
              {z.map((v, k) => (
                <tr key={k} className={k === y ? 'hl' : undefined}>
                  <td>{k + 1}</td>
                  <td>{fx(v, 2)}</td>
                  <td className={cls(naiveE[k])}>{show(naiveE[k])}</td>
                  <td className={cls(naiveP[k])}>{show(naiveP[k])}</td>
                  <td>{show(stE[k])}</td>
                  <td>{fx(p[k], 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    >
      <Bars data={p.map((v, k) => ({ label: `class ${k + 1}`, value: v, highlight: k === y }))} max={1} width={400} height={220} fmt={(v) => fx(v, 3)} ylabel="stable softmax" />
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ sd.gradcheck

const gcF = (x: number) => Math.exp(x) * Math.sin(x);
const gcDF = (x: number) => Math.exp(x) * (Math.sin(x) + Math.cos(x));

/**
 * sd.gradcheck — relative error of forward and central differences against h, in float64.
 */
function GradCheck({ spec }: { spec: VizSpec }) {
  const x0 = typeof spec.x === 'number' ? spec.x : 1;
  const [lh, setLh] = useState(-2);
  const exact = gcDF(x0);
  const fwd = (h: number) => (gcF(x0 + h) - gcF(x0)) / h;
  const cen = (h: number) => (gcF(x0 + h) - gcF(x0 - h)) / (2 * h);
  const rel = (v: number) => Math.max(Math.abs(v - exact) / Math.abs(exact), 1e-17);
  const curves = useMemo(() => {
    const hs = Array.from({ length: 105 }, (_, k) => 10 ** (-14 + (k * 13) / 104));
    return {
      f: hs.map((h) => [Math.log10(h), Math.log10(rel(fwd(h)))] as [number, number]),
      c: hs.map((h) => [Math.log10(h), Math.log10(rel(cen(h)))] as [number, number]),
    };
  }, [x0]); // eslint-disable-line react-hooks/exhaustive-deps
  const h = 10 ** lh;
  const ef = rel(fwd(h)), ec = rel(cen(h));
  const e = (v: number) => v.toExponential(1);
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="\log_{10} h" value={lh} min={-14} max={-1} step={0.25} onChange={setLh} fmt={(v) => v.toFixed(2)} />
          <Readout
            rows={[
              ['f(x) = e^x \\sin x,\\ x = ' + x0, ''],
              ["f'(x)\\ \\text{exact}", fx(exact, 10)],
              ['\\text{forward}', fx(fwd(h), 10)],
              ['\\text{central}', fx(cen(h), 10)],
              ['\\text{rel. error fwd}', e(ef)],
              ['\\text{rel. error central}', e(ec)],
            ]}
          />
          <div className="sd-legend">
            <span><span className="sd-sw" style={{ background: 'var(--c-v)' }} />forward (f(x+h) − f(x)) / h</span>
            <span><span className="sd-sw" style={{ background: 'var(--c-u)' }} />central (f(x+h) − f(x−h)) / 2h</span>
          </div>
        </>
      }
    >
      <LinePlot
        series={[
          { pts: curves.f, color: 'var(--c-v)' },
          { pts: curves.c, color: 'var(--c-u)' },
        ]}
        x={[-14, -1]}
        y={[-13, 0]}
        width={440}
        height={300}
        xlabel="log10 of the step size h"
        ylabel="log10 of the relative error"
        vlines={[{ x: lh, color: 'var(--accent)' }]}
        legend={false}
      >
        {(sx, sy) => (
          <g>
            <circle cx={sx(lh)} cy={sy(Math.max(Math.log10(ef), -13))} r={5} style={{ fill: 'var(--c-v)', stroke: 'var(--surface)', strokeWidth: 1.5 }} />
            <circle cx={sx(lh)} cy={sy(Math.max(Math.log10(ec), -13))} r={5} style={{ fill: 'var(--c-u)', stroke: 'var(--surface)', strokeWidth: 1.5 }} />
          </g>
        )}
      </LinePlot>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ sd.attention

function attInputs() {
  const r = new Rng(11);
  const T = 5;
  const mk = (s: number) => Array.from({ length: T }, () => [s * r.normal(), s * r.normal()]);
  const Q = mk(1), K = mk(1);
  const V: number[][] = [[-2, 1.5], [2, 2], [2.5, -1.5], [-1, -2.5], [0.5, 0.5]];
  return { Q, K, V, T };
}

/**
 * sd.attention — scaled dot-product attention for 5 positions in 2-D, with an optional causal mask.
 * Click a row of the weight matrix to see that query's output as a weighted average of the values.
 */
function Attention({ spec }: { spec: VizSpec }) {
  const { Q, K, V, T } = useMemo(attInputs, []);
  const [causal, setCausal] = useState(spec.causal === undefined ? false : !!spec.causal);
  const [scale, setScale] = useState(1);
  const [t, setT] = useState(2);
  const d = 2;
  const S = Q.map((q) => K.map((k) => (scale * (q[0] * k[0] + q[1] * k[1])) / Math.sqrt(d)));
  const Sm = S.map((row, a) => row.map((v, b) => (causal && b > a ? -Infinity : v)));
  const W = Sm.map((row) => {
    const m = Math.max(...row);
    const e = row.map((v) => Math.exp(v - m));
    const s = e.reduce((x, y) => x + y, 0);
    return e.map((v) => v / s);
  });
  const out = (row: number[]): P2 => [row.reduce((s, w, k) => s + w * V[k][0], 0), row.reduce((s, w, k) => s + w * V[k][1], 0)];
  const o = out(W[t]);
  const masked: [number, number][] = [];
  if (causal) for (let a = 0; a < T; a++) for (let b = a + 1; b < T; b++) masked.push([a, b]);
  const lbl = Array.from({ length: T }, (_, k) => String(k + 1));
  const maxW = Math.max(...W[t]);
  return (
    <FigureLayout
      side={
        <>
          <Toggle label="causal mask" value={causal} onChange={setCausal} />
          <Slider label="score scale" value={scale} min={0.25} max={6} step={0.25} onChange={setScale} />
          <Readout
            title={`query ${t + 1}`}
            rows={[
              ['\\text{keys visible}', String(causal ? t + 1 : T)],
              ['\\max_s a_{ts}', fx(maxW, 3)],
              ['\\textstyle\\sum_s a_{ts}', fx(W[t].reduce((x, y) => x + y, 0), 6)],
              ['\\mathbf{o}_t = \\textstyle\\sum_s a_{ts}\\mathbf{v}_s', `(${fx(o[0], 2)}, ${fx(o[1], 2)})`],
            ]}
          />
          <div className="muted small">Click a row of the weights to choose the query. Dot size shows the weight on each value vector.</div>
        </>
      }
      below={
        <div className="sd-mats">
          <MatBlock shape="scores QKᵀ/√d (5 × 5)">
            <MatGrid m={Sm} rows={[t]} dim={masked} cellSize={44} fmt={(v) => fx(v, 2)} rowLabels={lbl} colLabels={lbl} />
          </MatBlock>
          <MatBlock shape="weights: softmax over each row">
            <MatGrid m={W} rows={[t]} dim={masked} cellSize={44} heat="seq" heatRange={[0, 1]} fmt={(v) => fx(v, 2)} rowLabels={lbl} colLabels={lbl} onCell={(a) => setT(a)} />
          </MatBlock>
        </div>
      }
    >
      <Plane x={[-3.5, 3.5]} y={[-3.5, 3.5]} width={340} ticks={false}>
        {V.map((v, k) => (
          <Seg key={'s' + k} a={o} b={v as P2} color="var(--c-w)" width={1 + 5 * W[t][k]} opacity={W[t][k] > 0 ? 0.35 : 0} />
        ))}
        {V.map((v, k) => (
          <Point key={'v' + k} at={v as P2} r={3 + 12 * W[t][k]} color={W[t][k] > 0 ? 'var(--c-u)' : 'var(--muted)'} tex={`\\mathbf{v}_${k + 1}`} />
        ))}
        <Point at={o} r={6} color="var(--c-v)" tex={`\\mathbf{o}_${t + 1}`} />
      </Plane>
    </FigureLayout>
  );
}

export const codingViz = {
  'sd.pairdist': { component: PairDist, doc: 'Pairwise squared distances via norms and a matrix product; drag points, click cells. params A (3 pts), B (4 pts)', validate: (s: VizSpec) => (s.A !== undefined && !(Array.isArray(s.A) && s.A.length === 3) ? 'A must have 3 points' : s.B !== undefined && !(Array.isArray(s.B) && s.B.length === 4) ? 'B must have 4 points' : null) },
  'sd.kmeans': { component: KMeans, doc: "Lloyd's k-means on three blobs, step by step; drag the initial centroids. params init (3 points)", validate: (s: VizSpec) => (s.init !== undefined && !(Array.isArray(s.init) && s.init.length === 3) ? 'init must have 3 points' : null) },
  'sd.softmax': { component: Softmax, doc: 'Naive vs max-subtracted softmax as a shift c grows; cross-entropy via log-sum-exp. params z (logits)', validate: (s: VizSpec) => (s.z !== undefined && !isNumArr(s.z) ? 'z must be numbers' : null) },
  'sd.gradcheck': { component: GradCheck, doc: 'Relative error of forward/central differences vs h on log axes (float64). params x', validate: (s: VizSpec) => (s.x !== undefined && typeof s.x !== 'number' ? 'x must be a number' : null) },
  'sd.attention': { component: Attention, doc: 'Scaled dot-product attention for 5 tokens with optional causal mask; click a row. params causal', validate: () => null },
};
