import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { LinePlot, Slider, Readout, FigureLayout, SegControl, Toggle, Btn, MatGrid, TeX } from '../kit';
import { Rng } from '../../math/rng';
import { fmt, tv } from './util';
import './dl.css';

// ------------------------------------------------------------------ dl.normaxes

type NormK = 'batch' | 'layer' | 'rms';
const NORM_LABEL: Record<NormK, string> = { batch: 'BatchNorm', layer: 'LayerNorm', rms: 'RMSNorm' };

/**
 * dl.normaxes — a (B × D) or (B × T × D) activation tensor. Click a cell to highlight the group of entries that
 * BatchNorm, LayerNorm or RMSNorm uses to normalize it, with the group statistics and the normalized tensor (γ = 1, β = 0, ε = 0).
 * params: shape ('2d'|'3d'), norm ('batch'|'layer'|'rms')
 */
function NormAxes({ spec }: { spec: VizSpec }) {
  const [shape, setShape] = useState<'2d' | '3d'>((spec.shape as '2d' | '3d') ?? '2d');
  const [norm, setNorm] = useState<NormK>((spec.norm as NormK) ?? 'batch');
  const [sel, setSel] = useState<[number, number, number]>([1, 0, 2]); // b, t, d
  const B = shape === '2d' ? 4 : 2, T = shape === '2d' ? 1 : 3, D = shape === '2d' ? 5 : 4;
  const X = useMemo(() => {
    const r = new Rng(shape === '2d' ? 4 : 9);
    const off = Array.from({ length: D }, (_, d) => [3, -1, 0.5, 6, -2][d % 5]);
    const sc = Array.from({ length: D }, (_, d) => [1, 2, 0.5, 3, 1][d % 5]);
    return Array.from({ length: B }, () => Array.from({ length: T }, () => Array.from({ length: D }, (_, d) => Math.round((off[d] + sc[d] * r.normal()) * 10) / 10)));
  }, [shape, B, T, D]);
  const [sb, st, sd] = [Math.min(sel[0], B - 1), Math.min(sel[1], T - 1), Math.min(sel[2], D - 1)];
  const inGroup = (b: number, t: number, d: number) => (norm === 'batch' ? d === sd : b === sb && t === st);
  const stats = (b: number, t: number, d: number) => {
    const g: number[] = [];
    for (let i = 0; i < B; i++) for (let j = 0; j < T; j++) for (let k = 0; k < D; k++) if (norm === 'batch' ? k === d : i === b && j === t) g.push(X[i][j][k]);
    const mean = g.reduce((a, v) => a + v, 0) / g.length;
    const v = g.reduce((a, x) => a + (x - mean) ** 2, 0) / g.length;
    const ms = g.reduce((a, x) => a + x * x, 0) / g.length;
    return { n: g.length, mean, v, rms: Math.sqrt(ms) };
  };
  const Y = X.map((Bm, b) => Bm.map((row, t) => row.map((x, d) => {
    const s = stats(b, t, d);
    return norm === 'rms' ? x / (s.rms || 1) : (x - s.mean) / (Math.sqrt(s.v) || 1);
  })));
  const s = stats(sb, st, sd);
  const xs = X[sb][st][sd], ys = Y[sb][st][sd];
  const cellsOf = (b: number) => {
    const out: [number, number][] = [];
    for (let t = 0; t < T; t++) for (let d = 0; d < D; d++) if (inGroup(b, t, d)) out.push([t, d]);
    return out;
  };
  const f1 = (v: number) => fmt(v, 1);
  const f2 = (v: number) => (Math.abs(v) < 0.005 ? '0' : v.toFixed(2));
  const grids = (M: number[][][], fm: (v: number) => string, click: boolean) =>
    shape === '2d' ? (
      <MatGrid m={M.map((r) => r[0])} fmt={fm} cells={[...Array(B).keys()].flatMap((b) => cellsOf(b).map(([, d]) => [b, d] as [number, number]))} rowLabels={[...Array(B).keys()].map((b) => `ex ${b}`)} colLabels={[...Array(D).keys()].map((d) => `f${d}`)} onCell={click ? (b, d) => setSel([b, 0, d]) : undefined} />
    ) : (
      <div className="dl-row dl-top">
        {M.map((Bm, b) => (
          <MatGrid key={b} m={Bm} fmt={fm} cells={cellsOf(b)} rowLabels={[...Array(T).keys()].map((t) => `t${t}`)} colLabels={[...Array(D).keys()].map((d) => `d${d}`)} caption={`example ${b}`} onCell={click ? (t, d) => setSel([b, t, d]) : undefined} />
        ))}
      </div>
    );
  const axesTex = shape === '2d' ? { batch: '\\text{over } B', layer: '\\text{over } D', rms: '\\text{over } D' } : { batch: '\\text{over } B \\text{ and } T', layer: '\\text{over } D', rms: '\\text{over } D' };
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={shape} onChange={setShape} options={[{ v: '2d', label: '(B, D)' }, { v: '3d', label: '(B, T, D)' }]} />
          <SegControl value={norm} onChange={setNorm} options={(['batch', 'layer', 'rms'] as NormK[]).map((k) => ({ v: k, label: NORM_LABEL[k] }))} />
          <Readout
            rows={[
              ['\\text{statistics}', tv(axesTex[norm])],
              ['\\text{group size}', String(s.n)],
              ...(norm === 'rms'
                ? ([['\\text{RMS} = \\sqrt{\\tfrac1n\\sum x^2}', fmt(s.rms, 3)]] as [string, string][])
                : ([['\\mu', fmt(s.mean, 3)], ['\\sigma^2', fmt(s.v, 3)]] as [string, string][])),
              [norm === 'rms' ? '\\hat x = x/\\text{RMS}' : '\\hat x = (x-\\mu)/\\sigma', `${f1(xs)} → ${f2(ys)}`],
            ]}
          />
          <div className="small">
            {norm === 'batch' && <>Each feature is normalized with statistics taken <b>across the batch</b>{shape === '3d' ? ' and across positions' : ''}. The output for one example depends on the other examples in the batch.</>}
            {norm === 'layer' && <>Each {shape === '3d' ? 'token' : 'example'} is normalized with its own mean and variance <b>across features</b>. Nothing depends on the rest of the batch.</>}
            {norm === 'rms' && <>Like LayerNorm but without subtracting the mean: divide by the root mean square across features. Cheaper, and the default in many current LLMs.</>}
          </div>
        </>
      }
      below={
        <div className="dl-full">
          <div className="muted small">Normalized output (γ = 1, β = 0, ε = 0):</div>
          {grids(Y, f2, false)}
        </div>
      }
    >
      <div className="dl-stack">
        <div className="muted small">Input activations. Click any cell to see the entries used to normalize it.</div>
        {grids(X, f1, true)}
      </div>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ dl.dropout

/**
 * dl.dropout — ten hidden activations feeding one output y = Σ w_i h̃_i. Each sample draws a dropout mask.
 * With inverted dropout (scale 1/(1−p)) the running mean of y converges to the eval-mode output; without it, to (1−p) times that.
 * params: p, inverted (bool)
 */
function Dropout({ spec }: { spec: VizSpec }) {
  const [p, setP] = useState((spec.p as number) ?? 0.5);
  const [inv, setInv] = useState((spec.inverted as boolean) ?? true);
  const h = [1.2, 0.4, 2.0, 0.8, 1.5, 0.3, 1.0, 1.8, 0.6, 1.1];
  const w = [0.5, -0.3, 0.8, 0.4, -0.6, 1.0, 0.7, 0.2, -0.4, 0.9];
  const yEval = h.reduce((a, v, i) => a + v * w[i], 0);
  type St = { masks: boolean[][]; ys: number[]; seed: number };
  const sample = (st: St, k: number, pp: number, scaled: boolean): St => {
    const r = new Rng(st.seed * 7919 + st.ys.length);
    const masks = [...st.masks];
    const ys = [...st.ys];
    for (let s = 0; s < k; s++) {
      const m = h.map(() => r.next() >= pp);
      masks.push(m);
      ys.push(m.reduce((a, keep, i) => a + (keep ? (h[i] * w[i]) / (scaled ? 1 - pp : 1) : 0), 0));
    }
    return { masks: masks.slice(-1), ys, seed: st.seed };
  };
  const [state, setState] = useState<St>(() => sample({ masks: [], ys: [], seed: 1 }, 10, (spec.p as number) ?? 0.5, (spec.inverted as boolean) ?? true));
  const draw = (k: number) => setState(sample(state, k, p, inv));
  const reset = (pp = p, scaled = inv) => setState(sample({ masks: [], ys: [], seed: state.seed + 1 }, 10, pp, scaled));
  const mask = state.masks[state.masks.length - 1];
  const mean = state.ys.length ? state.ys.reduce((a, v) => a + v, 0) / state.ys.length : NaN;
  const series = useMemo(() => {
    let s = 0;
    return state.ys.map((y, i) => {
      s += y;
      return [i + 1, s / (i + 1)] as [number, number];
    });
  }, [state.ys]);
  const expect = inv ? yEval : (1 - p) * yEval;
  const scale = inv ? 1 / (1 - p) : 1;
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="p\ (\text{drop prob.})" value={p} min={0} max={0.9} step={0.05} onChange={(v) => { setP(v); reset(v, inv); }} />
          <Toggle label={<>inverted dropout: scale kept units by <TeX>{'1/(1-p)'}</TeX></>} value={inv} onChange={(v) => { setInv(v); reset(p, v); }} />
          <div className="dl-row">
            <Btn primary onClick={() => draw(1)}>Sample a mask</Btn>
            <Btn onClick={() => draw(100)}>+100</Btn>
            <Btn onClick={() => reset()}>Reset</Btn>
          </div>
          <Readout
            rows={[
              ['y_{\\text{eval}} = \\sum_i w_ih_i', fmt(yEval, 3)],
              ['\\text{this sample } y', state.ys.length ? fmt(state.ys[state.ys.length - 1], 3) : '–'],
              ['\\text{mean of } ' + state.ys.length + '\\text{ samples}', Number.isFinite(mean) ? fmt(mean, 3) : '–'],
              ['\\E[y_{\\text{train}}]', fmt(expect, 3)],
            ]}
          />
        </>
      }
      below={
        <div className="dl-full">
          <LinePlot
            series={series.length ? [{ pts: series, color: 'var(--c-u)', label: 'running mean of y over masks' }] : [{ pts: [[1, yEval]], color: 'transparent' }]}
            x={[1, Math.max(20, state.ys.length)]}
            y={[Math.min(0, (1 - p) * yEval) - 0.5, yEval * 1.6 + 0.5]}
            height={180}
            xlabel="number of sampled masks"
            hlines={[{ y: yEval, color: 'var(--c-w)' }, { y: (1 - p) * yEval, color: 'var(--c-err)' }]}
          />
          <div className="muted small">
            Green dashed: eval-mode output <TeX>{'y_{\\text{eval}}'}</TeX>. Red dashed: <TeX>{'(1-p)\\,y_{\\text{eval}}'}</TeX>, what an unscaled network produces on average.
          </div>
        </div>
      }
    >
      <svg viewBox="0 0 480 200" className="dl-graph" style={{ maxWidth: 480 }}>
        {h.map((hv, i) => {
          const x = 30 + i * 44;
          const kept = mask ? mask[i] : true;
          return (
            <g key={i} opacity={kept ? 1 : 0.3}>
              <line x1={x} y1={60} x2={240} y2={160} className={'dl-dline' + (kept ? '' : ' off')} style={{ strokeWidth: 1 + 2 * Math.abs(w[i]) }} />
              <circle cx={x} cy={50} r={17} className="dl-unit" />
              <text x={x} y={55} textAnchor="middle" className="dl-gval">
                {kept ? fmt(hv * (mask ? scale : 1), 2) : '0'}
              </text>
              {!kept && <path d={`M${x - 10},${40} L${x + 10},${60} M${x + 10},${40} L${x - 10},${60}`} className="dl-x" />}
              <text x={x} y={22} textAnchor="middle" className="dl-tick">
                w={fmt(w[i], 1)}
              </text>
            </g>
          );
        })}
        <circle cx={240} cy={170} r={22} className="dl-unit out" />
        <text x={240} y={175} textAnchor="middle" className="dl-gval">
          {state.ys.length ? fmt(state.ys[state.ys.length - 1], 2) : fmt(yEval, 2)}
        </text>
        <text x={272} y={175} className="dl-tick">
          {state.ys.length ? 'y (training, this mask)' : 'y (eval: no dropout)'}
        </text>
      </svg>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ dl.labelsmooth

/**
 * dl.labelsmooth — targets (1−ε)·onehot + ε/C versus a softmax with logits (Δ, 0, …, 0).
 * The cross-entropy as a function of the logit gap Δ has a finite minimum at Δ* = ln((1−ε+ε/C)/(ε/C)) when ε > 0.
 * params: C, eps, gap
 */
function LabelSmooth({ spec }: { spec: VizSpec }) {
  const [C, setC] = useState((spec.C as number) ?? 5);
  const [eps, setEps] = useState((spec.eps as number) ?? 0.1);
  const [gap, setGap] = useState((spec.gap as number) ?? 2);
  const tT = 1 - eps + eps / C, tO = eps / C;
  const ce = (g: number) => Math.log(Math.exp(g) + C - 1) - tT * g;
  const pT = Math.exp(gap) / (Math.exp(gap) + C - 1), pO = 1 / (Math.exp(gap) + C - 1);
  const dStar = eps > 0 ? Math.log(tT / tO) : Infinity;
  const pts = useMemo(() => Array.from({ length: 201 }, (_, i) => [(12 * i) / 200, ce((12 * i) / 200)] as [number, number]), [C, eps]); // eslint-disable-line react-hooks/exhaustive-deps
  const H = -(tT * Math.log(tT) + (C - 1) * (tO > 0 ? tO * Math.log(tO) : 0));
  const W = 440, Hh = 190, bw = Math.min(26, (W - 40) / (C * 2.6));
  const sy = (v: number) => Hh - 24 - v * (Hh - 44);
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="C\ (\text{classes})" value={C} min={2} max={10} step={1} onChange={setC} fmt={(v) => String(v)} />
          <Slider tex="\varepsilon" value={eps} min={0} max={0.5} step={0.01} onChange={setEps} />
          <Slider tex="\Delta\ (\text{logit gap})" value={gap} min={0} max={12} step={0.1} onChange={setGap} />
          <Readout
            rows={[
              ['t_{\\text{true}} = 1-\\varepsilon+\\varepsilon/C', fmt(tT, 4)],
              ['t_{\\text{other}} = \\varepsilon/C', fmt(tO, 4)],
              ['\\text{CE at this }\\Delta', fmt(ce(gap), 4)],
              ['\\Delta^* = \\ln(t_{\\text{true}}/t_{\\text{other}})', Number.isFinite(dStar) ? fmt(dStar, 3) : '∞'],
              ['\\min \\text{CE} = H(\\mathbf t)', fmt(H, 4)],
            ]}
          />
        </>
      }
      below={
        <div className="dl-full">
          <LinePlot series={[{ pts, color: 'var(--c-u)', label: 'cross-entropy vs logit gap' }]} x={[0, 12]} y={[0, Math.max(1, ce(0)) * 1.05]} height={190} xlabel="logit gap Δ" vlines={[{ x: gap, color: 'var(--accent)' }, ...(Number.isFinite(dStar) && dStar <= 12 ? [{ x: dStar, color: 'var(--c-w)' }] : [])]}>
            {(sx, sy2) => <circle cx={sx(gap)} cy={sy2(ce(gap))} r={5} style={{ fill: 'var(--c-v)' }} />}
          </LinePlot>
        </div>
      }
    >
      <svg viewBox={`0 0 ${W} ${Hh}`} className="dl-graph" style={{ maxWidth: W }}>
        <line x1={20} x2={W - 6} y1={sy(0)} y2={sy(0)} className="dl-axis" />
        {[0.5, 1].map((v) => (
          <g key={v}>
            <line x1={20} x2={W - 6} y1={sy(v)} y2={sy(v)} className="dl-grid" />
            <text x={16} y={sy(v) + 4} textAnchor="end" className="dl-tick">
              {v}
            </text>
          </g>
        ))}
        {Array.from({ length: C }, (_, k) => {
          const x0 = 26 + (k * (W - 32)) / C;
          const t = k === 0 ? tT : tO, pr = k === 0 ? pT : pO;
          return (
            <g key={k}>
              <rect x={x0} y={sy(t)} width={bw} height={sy(0) - sy(t)} className="dl-bar-t" />
              <rect x={x0 + bw + 2} y={sy(pr)} width={bw} height={sy(0) - sy(pr)} className="dl-bar-p" />
              <text x={x0 + bw} y={Hh - 8} textAnchor="middle" className="dl-tick">
                {k === 0 ? 'true' : `c${k}`}
              </text>
            </g>
          );
        })}
        <rect x={W - 150} y={4} width={10} height={10} className="dl-bar-t" />
        <text x={W - 136} y={13} className="dl-tick">
          target t
        </text>
        <rect x={W - 75} y={4} width={10} height={10} className="dl-bar-p" />
        <text x={W - 61} y={13} className="dl-tick">
          softmax p
        </text>
      </svg>
    </FigureLayout>
  );
}

export const normViz = {
  'dl.normaxes': {
    component: NormAxes,
    validate: (s: VizSpec) => (s.norm === undefined || ['batch', 'layer', 'rms'].includes(s.norm as string) ? null : 'norm must be batch|layer|rms'),
    doc: "Which entries BatchNorm / LayerNorm / RMSNorm normalize over. params shape ('2d'|'3d'), norm ('batch'|'layer'|'rms')",
  },
  'dl.dropout': {
    component: Dropout,
    validate: (s: VizSpec) => (s.p === undefined || ((s.p as number) >= 0 && (s.p as number) < 1) ? null : 'p must be in [0, 1)'),
    doc: 'Dropout masks and the expected output, with and without inverted scaling. params p, inverted',
  },
  'dl.labelsmooth': {
    component: LabelSmooth,
    validate: (s: VizSpec) => (s.C === undefined || ((s.C as number) >= 2 && (s.C as number) <= 10) ? null : 'C must be 2..10'),
    doc: 'Label-smoothed targets vs softmax, and CE as a function of the logit gap. params C, eps, gap',
  },
};
