// Figures for llm03: decoding, efficient inference, retrieval.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Handle, Point, Seg, Poly, Slider, SegControl, Toggle, Readout, FigureLayout, LinePlot, TeX, usePlayer, Btn, usePlane, type P2 } from '../kit';
import { Rng } from '../../math/rng';
import { f2, softmax, bytes, PAL } from './common';
import './llm.css';

const R = String.raw;

// ---------------------------------------------------------------- llm.sampling
/** temperature → softmax → top-k → top-p, returning the kept mask and renormalized probabilities */
export function filterProbs(logits: number[], T: number, k: number, topP: number) {
  const p = softmax(logits.map((z) => z / T));
  const order = p.map((x, i) => [x, i] as [number, number]).sort((a, b) => b[0] - a[0]);
  const keep = Array(p.length).fill(false);
  const topk = order.slice(0, Math.min(k, order.length));
  const massK = topk.reduce((a, [x]) => a + x, 0);
  let cum = 0;
  for (const [x, i] of topk) {
    keep[i] = true;
    cum += x / massK; // top-p acts on the distribution renormalized after top-k
    if (cum >= topP - 1e-12) break;
  }
  const s = p.reduce((a, x, i) => a + (keep[i] ? x : 0), 0);
  const q = p.map((x, i) => (keep[i] ? x / s : 0));
  return { p, keep, q, mass: s };
}
function sampleFrom(q: number[], u: number) {
  let c = 0;
  for (let i = 0; i < q.length; i++) {
    c += q[i];
    if (u < c) return i;
  }
  return q.length - 1;
}
/**
 * llm.sampling — logits → probabilities with temperature, top-k and top-p; kept set, renormalized probabilities,
 * and seeded samples. params: tokens, logits, T, k, p, prompt
 */
function Sampling({ spec }: { spec: VizSpec }) {
  const tokens = (spec.tokens as string[]) ?? ['mat', 'floor', 'sofa', 'bed', 'roof', 'table', 'moon', 'piano'];
  const logits = (spec.logits as number[]) ?? [3.2, 2.5, 2.1, 1.8, 1.0, 0.6, -0.5, -1.0];
  const prompt = (spec.prompt as string) ?? 'The cat sat on the';
  const n = tokens.length;
  const [T, setT] = useState((spec.T as number) ?? 1);
  const [k, setK] = useState((spec.k as number) ?? n);
  const [tp, setTp] = useState((spec.p as number) ?? 1);
  const [seed, setSeed] = useState(1);
  const { p, keep, q, mass } = filterProbs(logits, T, k, tp);
  const samples = useMemo(() => {
    const r = new Rng(seed);
    return Array.from({ length: 24 }, () => sampleFrom(q, r.next()));
  }, [q.join(','), seed]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = Array(n).fill(0);
  samples.forEach((s) => counts[s]++);
  const W = 460, H = 230, L = 34, B = 40, top = 16;
  const bw = (W - L - 8) / n;
  const sy = (v: number) => H - B - v * (H - B - top);
  return (
    <FigureLayout
      side={
        <>
          <Slider label="temperature T" value={T} min={0.05} max={2} step={0.05} onChange={setT} />
          <Slider label="top-k" value={k} min={1} max={n} step={1} onChange={setK} fmt={(v) => (v >= n ? 'off' : String(v))} />
          <Slider label="top-p" value={tp} min={0.05} max={1} step={0.05} onChange={setTp} fmt={(v) => (v >= 1 ? 'off' : v.toFixed(2))} />
          <Readout
            rows={[
              [R`\text{kept tokens}`, String(keep.filter(Boolean).length)],
              [R`\text{mass kept before renormalizing}`, f2(mass, 3)],
              [R`\max_i q_i`, f2(Math.max(...q), 3)],
            ]}
          />
          <div className="muted small">Order: divide logits by T, softmax, keep the k most likely and renormalize, then keep the smallest set of those with total probability ≥ p and renormalize again.</div>
        </>
      }
      below={
        <div className="llm-samples" style={{ width: '100%' }}>
          <div className="llm-row">
            <span className="muted">24 samples of “{prompt} …” (seed {seed}):</span>
            <Btn onClick={() => setSeed(seed + 1)}>resample</Btn>
          </div>
          <div>{samples.map((s) => tokens[s]).join(' · ')}</div>
        </div>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="llm-svg" style={{ maxWidth: W }}>
        <line x1={L} x2={W - 8} y1={sy(0)} y2={sy(0)} style={{ stroke: 'var(--axis)' }} />
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - 8} y1={sy(v)} y2={sy(v)} style={{ stroke: 'var(--grid)' }} />
            <text x={L - 4} y={sy(v) + 4} textAnchor="end" className="m">
              {v}
            </text>
          </g>
        ))}
        {tokens.map((t, i) => {
          const x = L + i * bw;
          return (
            <g key={t}>
              <rect x={x + bw * 0.12} y={sy(p[i])} width={bw * 0.36} height={sy(0) - sy(p[i])} style={{ fill: 'var(--c-u)', opacity: keep[i] ? 0.45 : 0.15 }} />
              {keep[i] && <rect x={x + bw * 0.5} y={sy(q[i])} width={bw * 0.36} height={sy(0) - sy(q[i])} style={{ fill: 'var(--c-v)' }} />}
              <text x={x + bw / 2} y={H - B + 15} textAnchor="middle" className="mono" style={{ opacity: keep[i] ? 1 : 0.4, textDecoration: keep[i] ? undefined : 'line-through' }}>
                {t}
              </text>
              <text x={x + bw / 2} y={H - B + 30} textAnchor="middle" className="m">
                {counts[i] ? `×${counts[i]}` : ''}
              </text>
            </g>
          );
        })}
        <rect x={W - 210} y={4} width={10} height={10} style={{ fill: 'var(--c-u)', opacity: 0.45 }} />
        <text x={W - 196} y={13} className="m">
          softmax(z/T)
        </text>
        <rect x={W - 110} y={4} width={10} height={10} style={{ fill: 'var(--c-v)' }} />
        <text x={W - 96} y={13} className="m">
          renormalized
        </text>
      </svg>
    </FigureLayout>
  );
}

// ---------------------------------------------------------------- llm.beam
type TNode = { tok: string; p: number; kids?: TNode[] };
const BEAM_TREE: TNode = {
  tok: 'The',
  p: 1,
  kids: [
    { tok: 'cat', p: 0.5, kids: [{ tok: 'sat', p: 0.4 }, { tok: 'ran', p: 0.35 }, { tok: 'is', p: 0.25 }] },
    { tok: 'dog', p: 0.4, kids: [{ tok: 'barked', p: 0.9 }, { tok: 'ran', p: 0.05 }, { tok: 'is', p: 0.05 }] },
    { tok: 'old', p: 0.1, kids: [{ tok: 'man', p: 0.6 }, { tok: 'cat', p: 0.3 }, { tok: 'dog', p: 0.1 }] },
  ],
};
/**
 * llm.beam — greedy vs beam search on a two-step tree. Beam width slider, step through expansions.
 */
function Beam({ spec }: { spec: VizSpec }) {
  const [B, setB] = useState((spec.width as number) ?? 1);
  const { i, controls } = usePlayer(3, { interval: 1300 });
  const l1 = BEAM_TREE.kids!;
  const keep1 = l1.map((n, a) => [n.p, a] as [number, number]).sort((x, y) => y[0] - x[0]).slice(0, B).map(([, a]) => a);
  const cand2 = keep1.flatMap((a) => l1[a].kids!.map((c, b) => ({ a, b, p: l1[a].p * c.p })));
  const keep2 = [...cand2].sort((x, y) => y.p - x.p).slice(0, B);
  const W = 480, H = 300;
  const x0 = 40, x1 = 190, x2 = 350;
  const y1 = (a: number) => 50 + a * 100;
  const y2 = (a: number, b: number) => 18 + a * 100 + b * 30;
  const best = keep2[0];
  const allBest = l1.flatMap((n, a) => n.kids!.map((c, b) => ({ a, b, p: n.p * c.p }))).sort((x, y) => y.p - x.p)[0];
  const node = (x: number, y: number, label: string, prob: string, state: 'keep' | 'drop' | 'idle' | 'best') => (
    <g>
      <rect x={x - 4} y={y - 12} width={78} height={24} rx={4} style={{ fill: state === 'best' ? 'var(--ok-soft)' : state === 'keep' ? 'var(--accent-soft)' : 'var(--surface2)', stroke: state === 'best' ? 'var(--ok)' : state === 'keep' ? 'var(--accent)' : 'var(--line)', strokeWidth: state === 'idle' || state === 'drop' ? 1 : 2, opacity: state === 'drop' ? 0.45 : 1 }} />
      <text x={x + 4} y={y + 4} style={{ opacity: state === 'drop' ? 0.5 : 1 }}>
        {label}
      </text>
      <text x={x + 70} y={y + 4} textAnchor="end" className="m">
        {prob}
      </text>
    </g>
  );
  return (
    <FigureLayout
      side={
        <>
          <Slider label="beam width" value={B} min={1} max={3} step={1} onChange={setB} fmt={String} />
          <div className="muted small">Width 1 is greedy decoding.</div>
          <Readout
            title={i < 2 ? `step ${i}` : 'result'}
            rows={
              i === 0
                ? [[R`\text{beams}`, 'The']]
                : i === 1
                  ? keep1.map((a) => [`\\text{The ${l1[a].tok}}`, f2(l1[a].p, 2)] as [string, string])
                  : keep2.map((c) => [`\\text{The ${l1[c.a].tok} ${l1[c.a].kids![c.b].tok}}`, `${f2(c.p, 3)} (log ${f2(Math.log(c.p), 2)})`] as [string, string])
            }
          />
          {i === 2 && (
            <div className="small">
              Best found: <b>The {l1[best.a].tok} {l1[best.a].kids![best.b].tok}</b> with probability {f2(best.p, 3)}. The most likely two-token continuation overall is <b>The {l1[allBest.a].tok} {l1[allBest.a].kids![allBest.b].tok}</b> ({f2(allBest.p, 3)}).
            </div>
          )}
          <div className="muted small">Numbers on the nodes are conditional probabilities. A sequence's probability is their product.</div>
        </>
      }
      below={controls}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="llm-svg" style={{ maxWidth: W }}>
        {l1.map((n, a) => (
          <g key={a}>
            <line x1={x0 + 70} y1={150} x2={x1 - 4} y2={y1(a)} style={{ stroke: i >= 1 && keep1.includes(a) ? 'var(--accent)' : 'var(--line)', strokeWidth: 2 }} />
            {n.kids!.map((c, b) => {
              const kept = i >= 2 && keep2.some((x) => x.a === a && x.b === b);
              const shown = i >= 2 && keep1.includes(a);
              return (
                <g key={b}>
                  <line x1={x1 + 74} y1={y1(a)} x2={x2 - 4} y2={y2(a, b)} style={{ stroke: kept ? 'var(--accent)' : 'var(--line)', strokeWidth: kept ? 2 : 1 }} />
                  {node(x2, y2(a, b), c.tok, f2(c.p, 2), i < 2 || !shown ? 'idle' : kept ? (best.a === a && best.b === b ? 'best' : 'keep') : 'drop')}
                  {shown && (
                    <text x={x2 + 80} y={y2(a, b) + 4} className="m">
                      = {f2(n.p * c.p, 3)}
                    </text>
                  )}
                </g>
              );
            })}
            {node(x1, y1(a), n.tok, f2(n.p, 2), i < 1 ? 'idle' : keep1.includes(a) ? 'keep' : 'drop')}
          </g>
        ))}
        {node(x0, 150, 'The', '', 'keep')}
      </svg>
    </FigureLayout>
  );
}

// ---------------------------------------------------------------- llm.kvcache
/**
 * llm.kvcache — KV-cache size vs context length for MHA, GQA and MQA, against the weights.
 * params: L, h, dh, kv, B, N (billions, for the weights line)
 */
function KvCache({ spec }: { spec: VizSpec }) {
  const [L, setL] = useState((spec.L as number) ?? 32);
  const [h, setH] = useState((spec.h as number) ?? 32);
  const [dh, setDh] = useState((spec.dh as number) ?? 128);
  const [kvI, setKvI] = useState(-1);
  const [B, setB] = useState((spec.B as number) ?? 1);
  const [bpe, setBpe] = useState(2);
  const N = (spec.N as number) ?? 8;
  const divs = Array.from({ length: h }, (_, i) => i + 1).filter((x) => h % x === 0);
  const kv0 = (spec.kv as number) ?? 8;
  const kv = kvI < 0 ? (divs.includes(kv0) ? kv0 : h) : divs[Math.min(kvI, divs.length - 1)];
  const per = (nkv: number) => 2 * L * nkv * dh * bpe;
  const Ts = Array.from({ length: 41 }, (_, i) => 1024 * 2 ** (i / 5.7));
  const G = 2 ** 30;
  const series = [
    { pts: Ts.map((T) => [T, (per(h) * T * B) / G] as [number, number]), color: 'var(--c-err)', label: `MHA (${h} KV heads)` },
    { pts: Ts.map((T) => [T, (per(kv) * T * B) / G] as [number, number]), color: 'var(--c-u)', label: `selected (${kv} KV head${kv > 1 ? 's' : ''})`, width: 3 },
    { pts: Ts.map((T) => [T, (per(1) * T * B) / G] as [number, number]), color: 'var(--c-w)', label: 'MQA (1 KV head)' },
  ];
  const T0 = 32768;
  return (
    <FigureLayout
      side={
        <>
          <Slider label="layers L" value={L} min={4} max={96} step={4} onChange={setL} fmt={String} />
          <Slider label="query heads h" value={h} min={8} max={64} step={8} onChange={(v) => { setH(v); setKvI(-1); }} fmt={String} />
          <Slider label="KV heads" value={divs.indexOf(kv)} min={0} max={divs.length - 1} step={1} onChange={setKvI} fmt={() => String(kv)} />
          <SegControl label="d_head" value={dh} onChange={setDh} options={[64, 128].map((x) => ({ v: x, label: String(x) }))} />
          <SegControl label="bytes" value={bpe} onChange={setBpe} options={[{ v: 2, label: '16-bit' }, { v: 1, label: '8-bit' }]} />
          <Slider label="batch B" value={B} min={1} max={64} step={1} onChange={setB} fmt={String} />
          <Readout
            rows={[
              [R`\text{per token}`, bytes(per(kv))],
              [`\\text{at } T = ${T0 / 1024}\\text{k},\\ B = ${B}`, bytes(per(kv) * T0 * B)],
              [`\\text{weights, } ${N}\\text{B params}`, bytes(N * 1e9 * 2)],
            ]}
          />
          <div className="muted small">
            Per token: <TeX>{R`2\cdot L\cdot n_{kv}\cdot d_h\cdot\text{bytes}`}</TeX>. The dashed line is the 16-bit weights.
          </div>
        </>
      }
    >
      <LinePlot series={series} logX x={[1024, 131072]} width={460} height={290} xlabel="context length T (tokens, log scale)" ylabel="KV cache (GiB)" hlines={[{ y: (N * 1e9 * 2) / G, color: 'var(--muted)' }]} vlines={[{ x: T0, color: 'var(--line)' }]} />
    </FigureLayout>
  );
}

// ---------------------------------------------------------------- llm.quant
type QRes = { q: number[]; deq: number[]; scales: number[]; zps: number[] };
export function quantize(w: number[], bits: number, sym: boolean, group: number): QRes {
  const qmax = sym ? 2 ** (bits - 1) - 1 : 2 ** bits - 1;
  const q: number[] = [], deq: number[] = [], scales: number[] = [], zps: number[] = [];
  for (let g0 = 0; g0 < w.length; g0 += group) {
    const g = w.slice(g0, g0 + group);
    let s: number, z: number;
    if (sym) {
      s = Math.max(...g.map(Math.abs)) / qmax || 1;
      z = 0;
    } else {
      const lo = Math.min(0, ...g), hi = Math.max(0, ...g);
      s = (hi - lo) / qmax || 1;
      z = Math.round(-lo / s);
    }
    scales.push(s);
    zps.push(z);
    for (const x of g) {
      const qi = sym ? Math.max(-qmax, Math.min(qmax, Math.round(x / s))) : Math.max(0, Math.min(qmax, Math.round(x / s) + z));
      q.push(qi);
      deq.push(s * (qi - z));
    }
  }
  return { q, deq, scales, zps };
}
/**
 * llm.quant — float weights → int8/int4 with a scale (and zero-point), the mapping on a number line and the error histogram.
 * params: bits, sym, outlier, group
 */
function Quant({ spec }: { spec: VizSpec }) {
  const [bits, setBits] = useState((spec.bits as number) ?? 8);
  const [sym, setSym] = useState(spec.sym === undefined ? true : !!spec.sym);
  const [outlier, setOutlier] = useState(!!spec.outlier);
  const [group, setGroup] = useState((spec.group as number) ?? 256);
  const base = useMemo(() => {
    const r = new Rng(5);
    return Array.from({ length: 256 }, () => r.normal() * 0.5);
  }, []);
  const w = outlier ? base.map((x, i) => (i === 7 ? 6 : x)) : base;
  const { q, deq, scales, zps } = quantize(w, bits, sym, group);
  const err = w.map((x, i) => x - deq[i]);
  const rmse = Math.sqrt(err.reduce((a, e) => a + e * e, 0) / err.length);
  const maxe = Math.max(...err.map(Math.abs));
  const lo = Math.min(...w, 0), hi = Math.max(...w, 0);
  const W = 470, X0 = 20, X1 = W - 20;
  const sx = (v: number) => X0 + ((v - lo) / (hi - lo)) * (X1 - X0);
  const s0 = scales[0], z0 = zps[0];
  const qmin = sym ? -(2 ** (bits - 1) - 1) : 0, qmax = sym ? 2 ** (bits - 1) - 1 : 2 ** bits - 1;
  const levelStep = bits === 8 ? 16 : 1;
  const levels: number[] = [];
  for (let k = Math.ceil(qmin / levelStep) * levelStep; k <= qmax; k += levelStep) levels.push(k);
  const show = Array.from({ length: 14 }, (_, i) => i * 18 + 3).concat(outlier ? [7] : []);
  // error histogram
  const E = Math.max(maxe, 1e-6);
  const nb = 31;
  const hist = Array(nb).fill(0);
  err.forEach((e) => hist[Math.min(nb - 1, Math.floor(((e + E) / (2 * E)) * nb))]++);
  const hmax = Math.max(...hist);
  return (
    <FigureLayout
      side={
        <>
          <SegControl label="bits" value={bits} onChange={setBits} options={[{ v: 8, label: 'int8' }, { v: 4, label: 'int4' }]} />
          <SegControl value={sym ? 1 : 0} onChange={(v) => setSym(v === 1)} options={[{ v: 1, label: 'symmetric' }, { v: 0, label: 'asymmetric' }]} />
          <SegControl label="scale per" value={group} onChange={setGroup} options={[{ v: 256, label: 'tensor' }, { v: 32, label: 'group of 32' }]} />
          <Toggle label="one outlier weight (6.0)" value={outlier} onChange={setOutlier} />
          <Readout
            rows={[
              [sym ? R`s = \max|w|/${2 ** (bits - 1) - 1}` : R`s = (\max w - \min w)/${2 ** bits - 1}`, f2(s0, 5)],
              ...(sym ? [] : ([[R`z = \operatorname{round}(-\min w/s)`, String(z0)]] as [string, string][])),
              [R`\text{max }|w - \hat w|`, f2(maxe, 5)],
              [R`\text{RMSE}`, f2(rmse, 5)],
              [R`\text{bits per weight}`, f2(bits + (group < 256 ? 16 / group : 16 / 256), 2)],
            ]}
          />
          <div className="muted small">
            <TeX>{sym ? R`q = \operatorname{round}(w/s),\ \hat w = s\,q` : R`q = \operatorname{round}(w/s) + z,\ \hat w = s(q - z)`}</TeX>. With groups, every 32 weights get their own scale (16 bits each).
          </div>
        </>
      }
    >
      <svg viewBox={`0 0 ${W} 330`} className="llm-svg" style={{ maxWidth: W }}>
        <text x={X0} y={14} className="m">
          float weights w (256 values, dots) and the quantization grid of the first group
        </text>
        <line x1={X0} x2={X1} y1={50} y2={50} style={{ stroke: 'var(--axis)' }} />
        {w.map((x, i) => (
          <circle key={i} cx={sx(x)} cy={50 - 6 - (i % 5) * 4} r={1.8} style={{ fill: i === 7 && outlier ? 'var(--c-err)' : 'var(--c-u)', opacity: 0.6 }} />
        ))}
        <line x1={X0} x2={X1} y1={130} y2={130} style={{ stroke: 'var(--axis)' }} />
        {levels.map((k) => {
          const v = s0 * (k - z0);
          if (v < lo - 1e-9 || v > hi + 1e-9) return null;
          return (
            <g key={k}>
              <line x1={sx(v)} x2={sx(v)} y1={124} y2={136} style={{ stroke: 'var(--fg)' }} />
              {(bits === 4 ? k % 2 === 0 : true) && (
                <text x={sx(v)} y={150} textAnchor="middle" className="m">
                  {k}
                </text>
              )}
            </g>
          );
        })}
        {show.map((i) => (
          <line key={i} x1={sx(w[i])} y1={52} x2={sx(deq[i])} y2={124} style={{ stroke: i === 7 && outlier ? 'var(--c-err)' : 'var(--c-v)', opacity: 0.7 }} />
        ))}
        <text x={X0} y={170} className="m">
          integer codes q{bits === 8 ? ' (every 16th level labelled)' : ''}; lines connect some weights to their code
        </text>
        <text x={X0} y={204} className="m">
          error w − ŵ: histogram over all 256 weights
        </text>
        {hist.map((c, b) => (
          <rect key={b} x={X0 + (b * (X1 - X0)) / nb} y={310 - (90 * c) / hmax} width={(X1 - X0) / nb - 1} height={(90 * c) / hmax} style={{ fill: 'var(--c-err)', opacity: 0.75 }} />
        ))}
        <line x1={X0} x2={X1} y1={310} y2={310} style={{ stroke: 'var(--axis)' }} />
        <text x={X0} y={325} className="m">
          −{f2(E, 4)}
        </text>
        <text x={X1} y={325} textAnchor="end" className="m">
          +{f2(E, 4)}
        </text>
        <text x={(X0 + X1) / 2} y={325} textAnchor="middle" className="m">
          0
        </text>
      </svg>
    </FigureLayout>
  );
}

// ---------------------------------------------------------------- llm.specdec
/**
 * llm.specdec — speculative sampling for one position: accept a draft token x ~ q with probability min(1, p(x)/q(x)),
 * otherwise resample from norm(max(0, p − q)). Monte Carlo shows the output follows p exactly.
 * params: lambda, gamma
 */
function SpecDec({ spec }: { spec: VizSpec }) {
  const toks = ['the', 'a', 'my', 'this', 'one', 'that'];
  const p = [0.4, 0.25, 0.15, 0.1, 0.06, 0.04];
  const wrong = [0.05, 0.1, 0.05, 0.4, 0.1, 0.3];
  const [lam, setLam] = useState((spec.lambda as number) ?? 0.4);
  const [gamma, setGamma] = useState((spec.gamma as number) ?? 4);
  const qd = p.map((x, i) => (1 - lam) * x + lam * wrong[i]);
  const acc = qd.map((x, i) => Math.min(1, p[i] / x));
  const alpha = p.reduce((a, x, i) => a + Math.min(x, qd[i]), 0);
  const resid = p.map((x, i) => Math.max(0, x - qd[i]));
  const rs = resid.reduce((a, b) => a + b, 0);
  const rn = resid.map((x) => (rs > 0 ? x / rs : 0));
  const sim = useMemo(() => {
    const r = new Rng(17);
    const cnt = Array(p.length).fill(0);
    let accepted = 0;
    const Ns = 4000;
    for (let t = 0; t < Ns; t++) {
      const x = sampleFrom(qd, r.next());
      if (r.next() < acc[x]) {
        cnt[x]++;
        accepted++;
      } else cnt[sampleFrom(rn, r.next())]++;
    }
    return { emp: cnt.map((c) => c / Ns), rate: accepted / Ns };
  }, [lam]); // eslint-disable-line react-hooks/exhaustive-deps
  const tv = 0.5 * p.reduce((a, x, i) => a + Math.abs(x - sim.emp[i]), 0);
  const expTok = alpha < 1 ? (1 - alpha ** (gamma + 1)) / (1 - alpha) : gamma + 1;
  const W = 460, H = 230, L = 30, B = 34, top = 14;
  const bw = (W - L - 8) / p.length;
  const ymax = 0.5;
  const sy = (v: number) => H - B - (v / ymax) * (H - B - top);
  return (
    <FigureLayout
      side={
        <>
          <Slider label="draft error λ" value={lam} min={0} max={1} step={0.05} onChange={setLam} />
          <Slider tex={R`\gamma`} value={gamma} min={1} max={8} step={1} onChange={setGamma} />
          <Readout
            rows={[
              [R`\alpha = \sum_x \min(p(x), q(x))`, f2(alpha, 3)],
              [R`\text{simulated acceptance}`, f2(sim.rate, 3)],
              [R`\text{TV(output, } p)\ \text{(4000 runs)}`, f2(tv, 3)],
              [R`\text{tokens per target pass } \tfrac{1-\alpha^{\gamma+1}}{1-\alpha}`, f2(expTok, 2)],
            ]}
          />
          <div className="muted small">
            The draft <TeX>q</TeX> mixes the target <TeX>p</TeX> with a wrong distribution in proportion <TeX>{R`\lambda`}</TeX>. The token-per-pass formula assumes each draft token is accepted independently with probability <TeX>{R`\alpha`}</TeX>.
          </div>
        </>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="llm-svg" style={{ maxWidth: W }}>
        <line x1={L} x2={W - 8} y1={sy(0)} y2={sy(0)} style={{ stroke: 'var(--axis)' }} />
        {[0, 0.25, 0.5].map((v) => (
          <text key={v} x={L - 4} y={sy(v) + 4} textAnchor="end" className="m">
            {v}
          </text>
        ))}
        {toks.map((t, i) => {
          const x = L + i * bw;
          return (
            <g key={t}>
              <rect x={x + bw * 0.1} y={sy(p[i])} width={bw * 0.27} height={sy(0) - sy(p[i])} style={{ fill: 'var(--c-u)' }} />
              <rect x={x + bw * 0.4} y={sy(qd[i])} width={bw * 0.27} height={sy(0) - sy(qd[i])} style={{ fill: 'var(--c-v)', opacity: 0.8 }} />
              <line x1={x + bw * 0.06} x2={x + bw * 0.72} y1={sy(sim.emp[i])} y2={sy(sim.emp[i])} style={{ stroke: 'var(--fg)', strokeWidth: 2, strokeDasharray: '3 2' }} />
              <text x={x + bw * 0.86} y={sy(0) - 4} textAnchor="middle" className="m" transform={`rotate(-90 ${x + bw * 0.86} ${sy(0) - 4})`}>
                accept {f2(acc[i], 2)}
              </text>
              <text x={x + bw * 0.4} y={H - B + 15} textAnchor="middle" className="mono">
                {t}
              </text>
            </g>
          );
        })}
        <rect x={L + 6} y={4} width={10} height={10} style={{ fill: 'var(--c-u)' }} />
        <text x={L + 20} y={13} className="m">
          target p
        </text>
        <rect x={L + 80} y={4} width={10} height={10} style={{ fill: 'var(--c-v)' }} />
        <text x={L + 94} y={13} className="m">
          draft q
        </text>
        <line x1={L + 150} x2={L + 166} y1={9} y2={9} style={{ stroke: 'var(--fg)', strokeWidth: 2, strokeDasharray: '3 2' }} />
        <text x={L + 170} y={13} className="m">
          output frequency (simulated)
        </text>
      </svg>
    </FigureLayout>
  );
}

// ---------------------------------------------------------------- llm.batching
function schedule(lens: number[], slots: number, mode: 'static' | 'continuous') {
  // returns, per slot, a list of [start, end, req]
  const rows: [number, number, number][][] = Array.from({ length: slots }, () => []);
  const done: number[] = Array(lens.length).fill(0);
  if (mode === 'static') {
    let t = 0;
    for (let g = 0; g < lens.length; g += slots) {
      const grp = lens.slice(g, g + slots);
      grp.forEach((len, s) => {
        rows[s].push([t, t + len, g + s]);
        done[g + s] = t + len;
      });
      t += Math.max(...grp);
    }
    return { rows, done, makespan: t };
  }
  const free = Array(slots).fill(0);
  lens.forEach((len, r) => {
    const s = free.indexOf(Math.min(...free));
    rows[s].push([free[s], free[s] + len, r]);
    free[s] += len;
    done[r] = free[s];
  });
  return { rows, done, makespan: Math.max(...free) };
}
/**
 * llm.batching — static vs continuous (iteration-level) batching of requests with different output lengths.
 * params: lens, slots, mode
 */
function Batching({ spec }: { spec: VizSpec }) {
  const lens = (spec.lens as number[]) ?? [3, 9, 4, 6, 2, 8, 5, 3, 7, 4];
  const slots = (spec.slots as number) ?? 4;
  const [mode, setMode] = useState<'static' | 'continuous'>((spec.mode as 'static' | 'continuous') ?? 'static');
  const st = schedule(lens, slots, 'static');
  const sc = schedule(lens, slots, mode);
  const Tmax = st.makespan;
  const { i, controls } = usePlayer(Tmax + 1, { interval: 350 });
  const t = i;
  const busy = lens.reduce((a, b) => a + b, 0);
  const util = busy / (slots * sc.makespan);
  const meanDone = sc.done.reduce((a, b) => a + b, 0) / lens.length;
  const cw = Math.min(26, 420 / Tmax), rh = 34, X0 = 56, Y0 = 26;
  const W = X0 + Tmax * cw + 10, H = Y0 + slots * rh + 30;
  const finished = sc.done.filter((d) => d <= t).length;
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={mode} onChange={setMode} options={[{ v: 'static', label: 'static' }, { v: 'continuous', label: 'continuous' }]} />
          <Readout
            rows={[
              [R`\text{steps to finish all}`, String(sc.makespan)],
              [R`\text{slot utilization}`, f2(100 * util, 1) + '%'],
              [R`\text{mean completion step}`, f2(meanDone, 2)],
              [R`\text{tokens per step}`, f2(busy / sc.makespan, 2)],
              [`\\text{finished by step } ${t}`, `${finished} / ${lens.length}`],
            ]}
          />
          <div className="muted small">Output lengths: {lens.join(', ')} tokens. Each step the batch produces one token per busy slot. Prefill is ignored.</div>
        </>
      }
      below={controls}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="llm-svg" style={{ maxWidth: W }}>
        <text x={X0} y={14} className="m">
          decode steps →
        </text>
        {Array.from({ length: slots }, (_, s) => (
          <g key={s}>
            <text x={X0 - 8} y={Y0 + s * rh + rh / 2 + 4} textAnchor="end" className="m">
              slot {s + 1}
            </text>
            <rect x={X0} y={Y0 + s * rh + 2} width={Tmax * cw} height={rh - 4} style={{ fill: 'var(--surface2)' }} />
            {sc.rows[s].map(([a, b, r]) => {
              const vis = Math.max(0, Math.min(b, t) - a);
              return (
                <g key={r}>
                  <rect x={X0 + a * cw + 1} y={Y0 + s * rh + 3} width={Math.max(0, (b - a) * cw - 2)} height={rh - 6} rx={3} style={{ fill: PAL[r % 7], opacity: 0.18 }} />
                  <rect x={X0 + a * cw + 1} y={Y0 + s * rh + 3} width={Math.max(0, vis * cw - 2)} height={rh - 6} rx={3} style={{ fill: PAL[r % 7], opacity: 0.85 }} />
                  {(
                    <text x={X0 + a * cw + 6} y={Y0 + s * rh + rh / 2 + 4} style={{ fill: vis > 0 ? 'var(--surface)' : 'var(--fg)', fontWeight: 600 }}>
                      R{r + 1}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        ))}
        <line x1={X0 + t * cw} x2={X0 + t * cw} y1={Y0 - 4} y2={Y0 + slots * rh} style={{ stroke: 'var(--fg)', strokeWidth: 1.5 }} />
        {mode === 'static' &&
          st.rows[0].slice(1).map(([a0], g) => <line key={g} x1={X0 + a0 * cw} x2={X0 + a0 * cw} y1={Y0} y2={Y0 + slots * rh} style={{ stroke: 'var(--c-err)', strokeDasharray: '4 3', strokeWidth: 2 }} />)}
        <text x={X0} y={H - 6} className="m">
          {mode === 'static' ? 'dashed: a new batch starts only when its longest request is done' : 'a freed slot takes the next waiting request at the next step'}
        </text>
      </svg>
    </FigureLayout>
  );
}

// ---------------------------------------------------------------- llm.ann
type AnnData = { pts: P2[]; cents: P2[]; cell: number[]; nbrs: number[][] };
function buildAnn(seed: number, nlist: number): AnnData {
  const r = new Rng(seed);
  const centers: P2[] = Array.from({ length: 6 }, () => [r.next() * 1.6 - 0.8, r.next() * 1.6 - 0.8]);
  const pts: P2[] = Array.from({ length: 150 }, (_, i) => {
    const c = centers[i % 6];
    return [Math.max(-1.05, Math.min(1.05, c[0] + r.normal() * 0.22)), Math.max(-1.05, Math.min(1.05, c[1] + r.normal() * 0.22))];
  });
  const d2 = (a: P2, b: P2) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  // k-means for IVF
  let cents: P2[] = r.shuffle(pts).slice(0, nlist).map((p) => [...p] as P2);
  let cell = pts.map(() => 0);
  for (let it = 0; it < 12; it++) {
    cell = pts.map((p) => cents.reduce((bi, c, j) => (d2(p, c) < d2(p, cents[bi]) ? j : bi), 0));
    cents = cents.map((c, j) => {
      const m = pts.filter((_, i) => cell[i] === j);
      return m.length ? ([m.reduce((a, p) => a + p[0], 0) / m.length, m.reduce((a, p) => a + p[1], 0) / m.length] as P2) : c;
    });
  }
  // kNN graph (M = 4 nearest, made symmetric)
  const M = 4;
  const nbrs: Set<number>[] = pts.map(() => new Set());
  pts.forEach((p, i) => {
    const near = pts.map((q, j) => [d2(p, q), j] as [number, number]).filter(([, j]) => j !== i).sort((a, b) => a[0] - b[0]).slice(0, M);
    near.forEach(([, j]) => {
      nbrs[i].add(j);
      nbrs[j].add(i);
    });
  });
  return { pts, cents, cell, nbrs: nbrs.map((s) => [...s]) };
}
function IvfCells({ cents, probed }: { cents: P2[]; probed: Set<number> }) {
  const { sx, sy } = usePlane();
  const n = 36, lo = -1.15, hi = 1.15, st = (hi - lo) / n;
  const out = [];
  for (let a = 0; a < n; a++)
    for (let b = 0; b < n; b++) {
      const x = lo + (a + 0.5) * st, y = lo + (b + 0.5) * st;
      const c = cents.reduce((bi, cc, j) => ((x - cc[0]) ** 2 + (y - cc[1]) ** 2 < (x - cents[bi][0]) ** 2 + (y - cents[bi][1]) ** 2 ? j : bi), 0);
      out.push(<rect key={a + '-' + b} x={sx(x - st / 2)} y={sy(y + st / 2)} width={sx(st) - sx(0) + 0.6} height={sy(0) - sy(st) + 0.6} style={{ fill: PAL[c % PAL.length], opacity: probed.has(c) ? 0.2 : 0.06 }} shapeRendering="crispEdges" />);
    }
  return <g>{out}</g>;
}
/**
 * llm.ann — vector search in 2-D: exact top-k, IVF (probe the nprobe nearest cells) or graph search (greedy best-first on a kNN graph).
 * params: mode, k, nprobe, ef, q
 */
function Ann({ spec }: { spec: VizSpec }) {
  const nlist = 8;
  const data = useMemo(() => buildAnn(4, nlist), []);
  const [mode, setMode] = useState<'exact' | 'ivf' | 'graph'>((spec.mode as 'exact' | 'ivf' | 'graph') ?? 'ivf');
  const [q, setQ] = useState<P2>((spec.q as P2) ?? [0.2, 0.1]);
  const [k, setK] = useState((spec.k as number) ?? 5);
  const [nprobe, setNprobe] = useState((spec.nprobe as number) ?? 1);
  const [ef, setEf] = useState((spec.ef as number) ?? 8);
  const d2 = (a: P2, b: P2) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  const exact = data.pts.map((p, i) => [d2(p, q), i] as [number, number]).sort((a, b) => a[0] - b[0]).slice(0, k).map(([, i]) => i);
  let found: number[] = exact, evals = data.pts.length;
  let probed = new Set<number>();
  const visited = new Set<number>();
  const expanded: number[] = [];
  if (mode === 'ivf') {
    const order = data.cents.map((c, j) => [d2(c, q), j] as [number, number]).sort((a, b) => a[0] - b[0]).slice(0, nprobe).map(([, j]) => j);
    probed = new Set(order);
    const cand = data.pts.map((p, i) => i).filter((i) => probed.has(data.cell[i]));
    evals = nlist + cand.length;
    found = cand.map((i) => [d2(data.pts[i], q), i] as [number, number]).sort((a, b) => a[0] - b[0]).slice(0, k).map(([, i]) => i);
  } else if (mode === 'graph') {
    const E = Math.max(ef, k);
    const entry = 0;
    const dist = (i: number) => d2(data.pts[i], q);
    visited.add(entry);
    let C: number[] = [entry];
    let Wl: number[] = [entry];
    evals = 1;
    while (C.length) {
      C.sort((a, b) => dist(a) - dist(b));
      const c = C.shift()!;
      Wl.sort((a, b) => dist(a) - dist(b));
      if (dist(c) > dist(Wl[Wl.length - 1]) && Wl.length >= E) break;
      expanded.push(c);
      for (const e of data.nbrs[c]) {
        if (visited.has(e)) continue;
        visited.add(e);
        evals++;
        Wl.sort((a, b) => dist(a) - dist(b));
        if (Wl.length < E || dist(e) < dist(Wl[Wl.length - 1])) {
          C.push(e);
          Wl.push(e);
          Wl.sort((a, b) => dist(a) - dist(b));
          if (Wl.length > E) Wl = Wl.slice(0, E);
        }
      }
    }
    found = Wl.slice(0, k);
  }
  const recall = found.filter((i) => exact.includes(i)).length / k;
  const foundSet = new Set(found);
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={mode} onChange={setMode} options={[{ v: 'exact', label: 'exact' }, { v: 'ivf', label: 'IVF' }, { v: 'graph', label: 'graph' }]} />
          <Slider tex="k" value={k} min={1} max={10} step={1} onChange={setK} />
          {mode === 'ivf' && <Slider label="nprobe" value={nprobe} min={1} max={nlist} step={1} onChange={setNprobe} fmt={String} />}
          {mode === 'graph' && <Slider label="ef (search list)" value={ef} min={1} max={30} step={1} onChange={setEf} fmt={String} />}
          <Readout
            rows={[
              [R`\text{distance computations}`, `${evals} of ${data.pts.length}`],
              [R`\text{recall@}k`, f2(recall, 2)],
            ]}
          />
          <div className="muted small">
            {mode === 'exact' && 'Brute force: compare the query with every vector.'}
            {mode === 'ivf' && `IVF: vectors are bucketed by their nearest of ${nlist} k-means centroids (squares). Search compares the query with the centroids, then only with vectors in the nprobe closest cells.`}
            {mode === 'graph' && 'Graph: each vector links to near neighbours. Search starts at a fixed entry point and repeatedly expands the closest unexpanded candidate, keeping the best ef found. Filled: expanded; rings: distance computed.'}
          </div>
          <div className="muted small">Drag the query. Green ring: true top-k. Orange dot: returned.</div>
        </>
      }
    >
      <Plane x={[-1.15, 1.15]} y={[-1.15, 1.15]} width={420} grid={false} axes={false}>
        {mode === 'ivf' && <IvfCells cents={data.cents} probed={probed} />}
        {mode === 'graph' &&
          expanded.map((c) =>
            data.nbrs[c].map((e) => <Seg key={c + '-' + e} a={data.pts[c]} b={data.pts[e]} color="var(--c-u)" width={1} opacity={0.45} />),
          )}
        {data.pts.map((p, i) => (
          <Point key={i} at={p} r={foundSet.has(i) ? 4.5 : 2.6} color={foundSet.has(i) ? 'var(--c-v)' : mode === 'graph' && visited.has(i) ? 'var(--c-u)' : 'var(--muted)'} hollow={mode === 'graph' && visited.has(i) && !expanded.includes(i) && !foundSet.has(i)} />
        ))}
        <ExactRings pts={exact.map((i) => data.pts[i])} />
        {mode === 'ivf' && data.cents.map((c, j) => <Poly key={j} pts={[[c[0] - 0.035, c[1] - 0.035], [c[0] + 0.035, c[1] - 0.035], [c[0] + 0.035, c[1] + 0.035], [c[0] - 0.035, c[1] + 0.035]]} fill={PAL[j % PAL.length]} fillOpacity={probed.has(j) ? 1 : 0.4} stroke="var(--fg)" width={1} />)}
        <Handle at={q} onChange={setQ} color="var(--fg)" snap={0.02} label="query" tex={R`\mathbf{q}`} />
      </Plane>
    </FigureLayout>
  );
}
function ExactRings({ pts }: { pts: P2[] }) {
  const { sx, sy } = usePlane();
  return (
    <g>
      {pts.map((p, i) => (
        <circle key={i} cx={sx(p[0])} cy={sy(p[1])} r={8} style={{ fill: 'none', stroke: 'var(--c-w)', strokeWidth: 2 }} />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------- llm.chunk
const DOC = `Subscriptions renew automatically at the end of each billing period. Monthly plans can be cancelled at any time and stop at the end of the current month. Annual plans can be cancelled within the first 30 days for a full refund. After the first 30 days, refunds for annual plans are prorated to the number of unused full months, minus a processing fee of 5 percent. Refunds are paid to the original payment method within ten business days. Plans bought through a reseller follow the reseller's terms instead. To cancel, open Settings, choose Billing, and select Cancel plan. Cancelling does not delete your data; exports remain available for 60 days.`;
const ANS = 'After the first 30 days, refunds for annual plans are prorated to the number of unused full months, minus a processing fee of 5 percent.';
/**
 * llm.chunk — fixed-size word chunking with overlap; shows chunk boundaries and whether the answer sentence lies inside one chunk.
 * params: size, overlap
 */
function Chunk({ spec }: { spec: VizSpec }) {
  const words = DOC.split(' ');
  const ansWords = ANS.split(' ');
  const a0 = words.findIndex((_, i) => ansWords.every((w, j) => words[i + j] === w));
  const a1 = a0 + ansWords.length; // exclusive
  const [size, setSize] = useState((spec.size as number) ?? 30);
  const [ov, setOv] = useState((spec.overlap as number) ?? 0);
  const step = Math.max(1, size - ov);
  const chunks: [number, number][] = [];
  for (let s = 0; s < words.length; s += step) {
    chunks.push([s, Math.min(words.length, s + size)]);
    if (s + size >= words.length) break;
  }
  const holder = chunks.findIndex(([s, e]) => s <= a0 && e >= a1);
  const stored = chunks.reduce((a, [s, e]) => a + e - s, 0);
  const col = (c: number) => (c % 2 === 0 ? 'var(--c-u)' : 'var(--c-v)');
  return (
    <FigureLayout
      side={
        <>
          <Slider label="chunk size (words)" value={size} min={8} max={60} step={1} onChange={(v) => { setSize(v); setOv(Math.min(ov, v - 1)); }} fmt={String} />
          <Slider label="overlap (words)" value={ov} min={0} max={Math.min(25, size - 1)} step={1} onChange={setOv} fmt={String} />
          <Readout
            rows={[
              [R`\text{chunks}`, String(chunks.length)],
              [R`\text{words stored}`, `${stored} (${f2((100 * (stored - words.length)) / words.length, 0)}% extra)`],
              [R`\text{answer in one chunk?}`, holder >= 0 ? `yes, chunk ${holder + 1}` : 'no, split'],
            ]}
          />
          <div className="muted small">Query: “How are annual plan refunds handled after 30 days?” The underlined sentence answers it.</div>
        </>
      }
    >
      <div className="llm-chunks">
        {words.map((w, i) => {
          const inC = chunks.map((c, j) => (i >= c[0] && i < c[1] ? j : -1)).filter((j) => j >= 0);
          const bg =
            inC.length >= 2
              ? `linear-gradient(color-mix(in oklab, ${col(inC[0])} 22%, transparent) 50%, color-mix(in oklab, ${col(inC[1])} 22%, transparent) 50%)`
              : `color-mix(in oklab, ${col(inC[0] ?? 0)} ${inC[0] === holder ? 26 : 13}%, transparent)`;
          const start = chunks.findIndex((c) => c[0] === i);
          return (
            <span key={i}>
              {start >= 0 && <sup className="muted">[{start + 1}]</sup>}
              <span className={'w' + (i >= a0 && i < a1 ? ' ans' : '')} style={{ background: bg }}>
                {w}
              </span>{' '}
            </span>
          );
        })}
      </div>
    </FigureLayout>
  );
}

export const inferenceViz = {
  'llm.sampling': { component: Sampling, validate: (s: VizSpec) => (s.logits && s.tokens && (s.logits as number[]).length !== (s.tokens as string[]).length ? 'tokens and logits must match' : null), doc: 'Logits → probabilities with temperature, top-k, top-p; kept set, renormalized probabilities, seeded samples. params tokens, logits, T, k, p, prompt' },
  'llm.beam': { component: Beam, validate: (s: VizSpec) => (s.width !== undefined && ![1, 2, 3].includes(s.width as number) ? 'width 1..3' : null), doc: 'Greedy vs beam search on a small tree. params width' },
  'llm.kvcache': { component: KvCache, doc: 'KV-cache size vs context for MHA/GQA/MQA vs the weights. params L, h, dh, kv, B, N' },
  'llm.quant': { component: Quant, validate: (s: VizSpec) => (s.bits !== undefined && ![4, 8].includes(s.bits as number) ? 'bits 4 or 8' : null), doc: 'Float → int8/int4 with scale and zero-point, number-line mapping and error histogram. params bits, sym, outlier, group' },
  'llm.specdec': { component: SpecDec, doc: 'Speculative sampling at one position: accept min(1, p/q), resample from the residual; simulated output matches p. params lambda, gamma' },
  'llm.batching': { component: Batching, validate: (s: VizSpec) => (s.lens && !(s.lens as number[]).every((x) => Number.isInteger(x) && x > 0) ? 'lens must be positive integers' : null), doc: 'Static vs continuous batching timeline. params lens, slots, mode' },
  'llm.ann': { component: Ann, doc: "2-D vector search: exact, IVF (nprobe) or graph (ef). params mode ('exact'|'ivf'|'graph'), k, nprobe, ef, q" },
  'llm.chunk': { component: Chunk, doc: 'Fixed-size chunking with overlap over a short policy document; whether the answer stays in one chunk. params size, overlap' },
};
