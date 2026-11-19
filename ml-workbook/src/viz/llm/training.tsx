// Figures for llm02: tokenization, pretraining at scale, post-training.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Slider, SegControl, Readout, FigureLayout, LinePlot, Bars, TeX, usePlayer, colorMap } from '../kit';
import { Rng } from '../../math/rng';
import { svd } from '../../math/linalg';
import { f2, softmax, big, sci, PAL } from './common';
import './llm.css';

const R = String.raw;

// ---------------------------------------------------------------- llm.bpe
type Word = { syms: string[]; count: number };
type BpeStep = { words: Word[]; pairs: { pair: [string, string]; count: number }[]; merge?: [string, string] };

/** BPE training: repeatedly merge the most frequent adjacent pair; ties go to the pair seen first. */
export function bpeSteps(corpus: [string, number][], eow: boolean, steps: number): BpeStep[] {
  let words: Word[] = corpus.map(([w, c]) => ({ syms: [...w.split(''), ...(eow ? ['_'] : [])], count: c }));
  const out: BpeStep[] = [];
  for (let s = 0; s <= steps; s++) {
    const cnt = new Map<string, number>();
    const order: [string, string][] = [];
    for (const w of words)
      for (let i = 0; i + 1 < w.syms.length; i++) {
        const key = w.syms[i] + '\u0000' + w.syms[i + 1];
        if (!cnt.has(key)) {
          cnt.set(key, 0);
          order.push([w.syms[i], w.syms[i + 1]]);
        }
        cnt.set(key, cnt.get(key)! + w.count);
      }
    const pairs = order.map((p, idx) => ({ pair: p, count: cnt.get(p[0] + '\u0000' + p[1])!, idx })).sort((a, b) => b.count - a.count || a.idx - b.idx);
    const merge = pairs[0]?.pair;
    out.push({ words, pairs: pairs.map(({ pair, count }) => ({ pair, count })), merge: s < steps ? merge : undefined });
    if (!merge || s === steps) break;
    words = words.map((w) => {
      const o: string[] = [];
      for (let i = 0; i < w.syms.length; i++) {
        if (i + 1 < w.syms.length && w.syms[i] === merge[0] && w.syms[i + 1] === merge[1]) {
          o.push(merge[0] + merge[1]);
          i++;
        } else o.push(w.syms[i]);
      }
      return { syms: o, count: w.count };
    });
  }
  return out;
}

const BPE_CORPUS: [string, number][] = [['low', 5], ['lower', 2], ['newest', 6], ['widest', 3]];
/**
 * llm.bpe — merge-by-merge BPE training on a tiny corpus with pair counts.
 * params: corpus ([word, count][]), eow (end-of-word marker "_"), steps
 */
function Bpe({ spec }: { spec: VizSpec }) {
  const corpus = (spec.corpus as [string, number][]) ?? BPE_CORPUS;
  const eow = spec.eow === undefined ? true : !!spec.eow;
  const steps = (spec.steps as number) ?? 10;
  const all = useMemo(() => bpeSteps(corpus, eow, steps), [corpus, eow, steps]);
  const { i, controls } = usePlayer(all.length, { interval: 1400 });
  const st = all[i];
  const merges = all.slice(0, i).map((x) => x.merge!);
  const last = i > 0 ? merges[i - 1] : undefined;
  const vocab = new Set<string>();
  for (const w of all[0].words) w.syms.forEach((x) => vocab.add(x));
  const base = vocab.size;
  const tokens = st.words.reduce((a, w) => a + w.syms.length * w.count, 0);
  return (
    <FigureLayout
      side={
        <>
          <Readout
            title={i === 0 ? 'characters only' : `after ${i} merge${i > 1 ? 's' : ''}`}
            rows={[
              [R`\text{vocabulary size}`, String(base + i)],
              [R`\text{tokens in corpus}`, String(tokens)],
              [R`\text{next merge}`, st.merge ? `${st.merge[0]} + ${st.merge[1]}` : '·'],
            ]}
          />
          <div className="llm-merge small">
            <div className="muted">merge rules learned, in order:</div>
            {merges.length === 0 ? <span className="muted">none yet</span> : merges.map((m, k) => <div key={k}>{`${k + 1}. ${m[0]} + ${m[1]} → ${m[0] + m[1]}`}</div>)}
          </div>
        </>
      }
      below={controls}
    >
      <div className="llm-grid2" style={{ alignItems: 'start' }}>
        <div className="llm-merge">
          <div className="muted small" style={{ marginBottom: 4, fontFamily: 'var(--sans)' }}>
            corpus (word × count){eow ? ', “_” marks the end of a word' : ''}
          </div>
          {st.words.map((w, k) => (
            <div key={k}>
              {w.syms.map((x, j) => (
                <span key={j} className={'sym' + (last && x === last[0] + last[1] ? ' new' : '')}>
                  {x}
                </span>
              ))}
              <span className="muted"> × {w.count}</span>
            </div>
          ))}
        </div>
        <div className="llm-wrap">
          <table className="llm-tbl">
            <thead>
              <tr>
                <th>adjacent pair</th>
                <th>count</th>
              </tr>
            </thead>
            <tbody>
              {st.pairs.slice(0, 7).map((p, k) => (
                <tr key={k} className={k === 0 && st.merge ? 'on' : ''}>
                  <td className="mono">
                    {p.pair[0]} + {p.pair[1]}
                  </td>
                  <td>{p.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted small">Counts are weighted by word frequency. Ties go to the pair seen first.</div>
        </div>
      </div>
    </FigureLayout>
  );
}

// ---------------------------------------------------------------- llm.nexttoken
/**
 * llm.nexttoken — per-token probabilities of the correct next token, the per-token loss −ln p, the mean (cross-entropy) and the perplexity.
 * params: context (string[]), targets (string[]), p (number[])
 */
function NextToken({ spec }: { spec: VizSpec }) {
  const targets = (spec.targets as string[]) ?? ['cat', 'sat', 'on', 'the', 'mat'];
  const ctx = (spec.context as string) ?? 'The';
  const [p, setP] = useState<number[]>((spec.p as number[]) ?? [0.05, 0.2, 0.5, 0.7, 0.4]);
  const V = (spec.V as number) ?? 50000;
  const loss = p.map((x) => -Math.log(x));
  const mean = loss.reduce((a, b) => a + b, 0) / loss.length;
  const prefix = (j: number) => [ctx, ...targets.slice(0, j)].join(' ');
  return (
    <FigureLayout
      side={
        <>
          {targets.map((t, j) => (
            <Slider key={j} label={`p(${t})`} value={p[j]} min={0.01} max={1} step={0.01} onChange={(v) => setP(p.map((x, k) => (k === j ? v : x)))} />
          ))}
          <Readout
            rows={[
              [R`\mathcal L = \tfrac1T\sum_t -\ln p_t`, f2(mean, 3) + ' nats'],
              [R`\text{perplexity } e^{\mathcal L}`, f2(Math.exp(mean), 2)],
              [`\\text{uniform, } V = ${V}:\\ \\ln V`, f2(Math.log(V), 2)],
            ]}
          />
        </>
      }
    >
      <div style={{ width: '100%' }}>
        <div className="llm-wrap">
          <table className="llm-tbl">
            <thead>
              <tr>
                <th>input (teacher forcing)</th>
                <th>target</th>
                <th>p(target)</th>
                <th>−ln p</th>
              </tr>
            </thead>
            <tbody>
              {targets.map((t, j) => (
                <tr key={j}>
                  <td>{prefix(j)}</td>
                  <td className="mono">{t}</td>
                  <td className="mono">{f2(p[j], 2)}</td>
                  <td className="mono">{f2(loss[j], 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Bars width={420} height={170} data={targets.map((t, j) => ({ label: t, value: loss[j], color: loss[j] > mean ? 'var(--c-err)' : 'var(--c-u)' }))} max={Math.max(5, ...loss)} fmt={(v) => f2(v, 2)} ylabel="−ln p" />
      </div>
    </FigureLayout>
  );
}

// ---------------------------------------------------------------- llm.scaling
// Illustrative parametric loss L(N, D) = E + A/N^a + B/D^a with A/B = 20^-a, so the compute-optimal ratio is exactly D/N = 20.
const SC = { E: 1.7, a: 0.3, B: 410 };
const SC_A = SC.B * 20 ** -SC.a;
const scLoss = (N: number, D: number) => SC.E + SC_A / N ** SC.a + SC.B / D ** SC.a;
/**
 * llm.scaling — illustrative scaling law. 'frontier': reducible loss vs compute (log–log) for fixed model sizes and the
 * compute-optimal envelope. 'isoflop': loss vs N at a fixed compute budget.
 * params: mode, logC
 */
function Scaling({ spec }: { spec: VizSpec }) {
  const [mode, setMode] = useState<'frontier' | 'isoflop'>((spec.mode as 'frontier' | 'isoflop') ?? 'frontier');
  const [logC, setLogC] = useState((spec.logC as number) ?? 21);
  const C = 10 ** logC;
  const Nopt = Math.sqrt(C / 120);
  const Dopt = 20 * Nopt;
  const sizes = [1e8, 1e9, 1e10, 1e11];
  const frontier = useMemo(() => {
    const curves = sizes.map((N, k) => ({
      pts: Array.from({ length: 80 }, (_, i) => {
        const c = 10 ** (18 + (i / 79) * 7.48);
        return [c, scLoss(N, c / (6 * N)) - SC.E] as [number, number];
      }).filter(([c]) => c / (6 * N) >= N),
      color: PAL[k],
      label: `N = ${big(N, 2)}`,
    }));
    const env = Array.from({ length: 60 }, (_, i) => {
      const c = 10 ** (18 + (i / 59) * 7.48);
      const n = Math.sqrt(c / 120);
      return [c, scLoss(n, 20 * n) - SC.E] as [number, number];
    });
    return [...curves, { pts: env, color: 'var(--fg)', dashed: true, label: 'compute-optimal', width: 2.5 }];
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const iso = useMemo(
    () => [
      {
        pts: Array.from({ length: 80 }, (_, i) => {
          const n = Nopt * 10 ** (-1.5 + (3 * i) / 79);
          return [n, scLoss(n, C / (6 * n))] as [number, number];
        }),
        color: 'var(--c-u)',
        label: `C = 1e${logC} FLOPs`,
      },
    ],
    [Nopt, C, logC],
  );
  const half = scLoss(Nopt * 4, Dopt / 4);
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={mode} onChange={setMode} options={[{ v: 'frontier', label: 'loss vs compute' }, { v: 'isoflop', label: 'fixed compute' }]} />
          <Slider label="log₁₀ C" value={logC} min={18} max={25} step={0.25} onChange={setLogC} />
          <Readout
            title="compute-optimal at this C"
            rows={[
              [R`C`, '$' + sci(C, 2)],
              [R`N^* = \sqrt{C/120}`, big(Nopt)],
              [R`D^* = 20N^*`, big(Dopt)],
              [R`6N^*D^*`, '$' + sci(6 * Nopt * Dopt, 2)],
              [R`L(N^*, D^*)`, f2(scLoss(Nopt, Dopt), 3)],
              [R`L(4N^*, D^*/4)`, f2(half, 3)],
            ]}
          />
          <div className="muted small">
            Curves from <TeX>{R`L = E + A/N^{0.3} + B/D^{0.3}`}</TeX> with constants chosen for illustration so that the optimum is exactly 20 tokens per parameter.
          </div>
        </>
      }
    >
      {mode === 'frontier' ? (
        <LinePlot series={frontier} legend={false} logX logY x={[1e18, 3e25]} y={[0.05, 3]} width={460} height={300} xlabel="training compute C (FLOPs)" ylabel="loss − E">
          {(sx, sy) => (
            <g>
              <circle cx={sx(C)} cy={sy(scLoss(Nopt, Dopt) - SC.E)} r={5} style={{ fill: 'var(--c-v)' }} />
              {frontier.map((f, k) => (
                <g key={k} transform={`translate(${sx(1.6e18)}, ${sy(0.32) + k * 16})`}>
                  <line x1={0} x2={16} y1={0} y2={0} style={{ stroke: f.color, strokeWidth: 2.5, strokeDasharray: 'dashed' in f && f.dashed ? '4 3' : undefined }} />
                  <text x={22} y={4} className="pl-legend">
                    {f.label}
                  </text>
                </g>
              ))}
            </g>
          )}
        </LinePlot>
      ) : (
        <LinePlot series={iso} logX x={[Nopt / 31.6, Nopt * 31.6]} width={460} height={300} xlabel="parameters N (log scale)" ylabel="loss" vlines={[{ x: Nopt, color: 'var(--c-v)' }]}>
          {(sx, sy) => <circle cx={sx(Nopt)} cy={sy(scLoss(Nopt, Dopt))} r={5} style={{ fill: 'var(--c-v)' }} />}
        </LinePlot>
      )}
    </FigureLayout>
  );
}

// ---------------------------------------------------------------- llm.moe
/**
 * llm.moe — a router sends each token to its top-k of E experts. Shows routing, expert load, total vs active parameters.
 * params: E, k, seed
 */
function Moe({ spec }: { spec: VizSpec }) {
  const [E, setE] = useState((spec.E as number) ?? 8);
  const [k, setK] = useState((spec.k as number) ?? 2);
  const [sel, setSel] = useState(0);
  const nTok = 8;
  const toks = ['The', 'proof', 'uses', 'a', 'matrix', 'whose', 'rank', 'is'];
  const logits = useMemo(() => {
    const r = new Rng((spec.seed as number) ?? 3);
    return Array.from({ length: nTok }, () => Array.from({ length: 16 }, () => r.normal() * 1.3));
  }, [spec.seed]);
  const route = logits.map((l) => {
    const p = softmax(l.slice(0, E));
    const top = p.map((x, e) => [x, e] as [number, number]).sort((a, b) => b[0] - a[0]).slice(0, Math.min(k, E));
    const s = top.reduce((a, [x]) => a + x, 0);
    return { p, top: top.map(([x, e]) => ({ e, g: x / s })) };
  });
  const load = Array(E).fill(0);
  route.forEach((r) => r.top.forEach(({ e }) => load[e]++));
  // illustrative sizes: d = 4096, SwiGLU expert d_ff = 14336, L = 32 layers, V = 32k
  const d = 4096, L = 32;
  const expert = 3 * d * 14336;
  const attn = 2 * d * d + 2 * d * 1024;
  const emb = 2 * 32000 * d;
  const total = L * (attn + E * expert) + emb;
  const active = L * (attn + Math.min(k, E) * expert) + emb;
  const W = 440, H = 300;
  const ty = (i: number) => 24 + (i * (H - 40)) / (nTok - 1);
  const ey = (e: number) => 24 + (e * (H - 40)) / Math.max(1, E - 1);
  return (
    <FigureLayout
      side={
        <>
          <Slider label="experts E" value={E} min={2} max={16} step={1} onChange={(v) => { setE(v); setK(Math.min(k, v)); }} fmt={String} />
          <Slider label="top-k" value={k} min={1} max={Math.min(4, E)} step={1} onChange={setK} fmt={String} />
          <Readout
            title="per token (illustrative sizes)"
            rows={[
              [R`\text{total params}`, big(total)],
              [R`\text{active params}`, big(active)],
              [R`\text{active share}`, f2((100 * active) / total, 1) + '%'],
              [R`\text{MLP FLOPs} \propto k`, `${Math.min(k, E)} expert${k > 1 ? 's' : ''}`],
            ]}
          />
          <div className="small">
            Token “{toks[sel]}”: top-{Math.min(k, E)} gates{' '}
            {route[sel].top.map(({ e, g }) => `E${e + 1}: ${f2(g, 2)}`).join(', ')}
          </div>
          <div className="muted small">Click a token to see its router probabilities. Each layer has its own router; one layer is shown.</div>
        </>
      }
      below={<Bars width={460} height={150} data={route[sel].p.map((x, e) => ({ label: `E${e + 1}`, value: x, highlight: route[sel].top.some((t) => t.e === e) }))} max={1} fmt={(v) => f2(v, 2)} ylabel="router p" />}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="llm-svg" style={{ maxWidth: W }}>
        {route.map((r, i) =>
          r.top.map(({ e, g }) => <line key={i + '-' + e} x1={110} y1={ty(i)} x2={300} y2={ey(e)} style={{ stroke: i === sel ? 'var(--c-v)' : 'var(--muted)', strokeWidth: 1 + 5 * g, opacity: i === sel ? 0.95 : 0.3 }} />),
        )}
        {toks.map((t, i) => (
          <g key={t + i} className="click" onClick={() => setSel(i)}>
            <rect x={20} y={ty(i) - 11} width={90} height={22} rx={4} style={{ fill: i === sel ? 'var(--accent-soft)' : 'var(--surface2)', stroke: i === sel ? 'var(--accent)' : 'var(--line)' }} />
            <text x={65} y={ty(i) + 4} textAnchor="middle" className="mono">
              {t}
            </text>
          </g>
        ))}
        {Array.from({ length: E }, (_, e) => (
          <g key={e}>
            <rect x={300} y={ey(e) - 9} width={56} height={18} rx={4} style={{ fill: 'var(--surface)', stroke: 'var(--fg)' }} />
            <text x={328} y={ey(e) + 4} textAnchor="middle">
              E{e + 1}
            </text>
            <rect x={362} y={ey(e) - 6} width={load[e] * 9} height={12} style={{ fill: 'var(--c-w)', opacity: 0.8 }} />
            <text x={366 + load[e] * 9} y={ey(e) + 4} className="m">
              {load[e]}
            </text>
          </g>
        ))}
        <text x={20} y={12} className="m">
          tokens
        </text>
        <text x={300} y={12} className="m">
          experts (load)
        </text>
      </svg>
    </FigureLayout>
  );
}

// ---------------------------------------------------------------- llm.trainmem
/**
 * llm.trainmem — memory per GPU for mixed-precision Adam (16 bytes/param) under data parallelism and ZeRO stages 0–3.
 * params: N (billions), logG, stage
 */
function TrainMem({ spec }: { spec: VizSpec }) {
  const [N, setN] = useState((spec.N as number) ?? 7);
  const [logG, setLogG] = useState((spec.logG as number) ?? 3);
  const [stage, setStage] = useState((spec.stage as number) ?? 0);
  const G = 2 ** logG;
  const cap = (spec.gpuGB as number) ?? 80;
  const w = 2 * N, g = (2 * N) / (stage >= 2 ? G : 1), o = (12 * N) / (stage >= 1 ? G : 1);
  const wS = stage >= 3 ? w / G : w;
  const tot = wS + g + o;
  const stages = [
    { v: 0, label: 'DDP' },
    { v: 1, label: 'ZeRO-1' },
    { v: 2, label: 'ZeRO-2' },
    { v: 3, label: 'ZeRO-3' },
  ];
  return (
    <FigureLayout
      side={
        <>
          <Slider label="params N" value={N} min={1} max={180} step={1} onChange={setN} fmt={(v) => `${v}B`} />
          <Slider label="GPUs" value={logG} min={0} max={10} step={1} onChange={setLogG} fmt={(v) => String(2 ** v)} />
          <SegControl value={stage} onChange={setStage} options={stages} />
          <Readout
            title="per GPU, GB"
            rows={[
              [stage >= 3 ? R`\text{weights } 2N/G` : R`\text{weights } 2N`, f2(wS, 1)],
              [stage >= 2 ? R`\text{grads } 2N/G` : R`\text{grads } 2N`, f2(g, 1)],
              [stage >= 1 ? R`\text{Adam } 12N/G` : R`\text{Adam } 12N`, f2(o, 1)],
              [R`\text{total}`, f2(tot, 1)],
              [R`\text{fits in ${cap} GB?}`, tot <= cap ? 'yes (before activations)' : 'no'],
            ]}
          />
          <div className="muted small">16-bit weights and gradients, plus fp32 master weights, momentum and variance (4 + 4 + 4 bytes). Activations come on top.</div>
        </>
      }
    >
      <Bars
        width={440}
        height={260}
        max={Math.max(cap * 1.15, tot * 1.1)}
        data={[
          { label: 'weights', value: wS, color: 'var(--c-u)' },
          { label: 'grads', value: g, color: 'var(--c-v)' },
          { label: 'Adam states', value: o, color: 'var(--c-k)' },
          { label: 'total', value: tot, color: tot <= cap ? 'var(--ok)' : 'var(--bad)' },
          { label: `GPU (${cap})`, value: cap, color: 'var(--muted)' },
        ]}
        fmt={(v) => f2(v, 1)}
        ylabel="GB per GPU"
      />
    </FigureLayout>
  );
}

// ---------------------------------------------------------------- llm.lora
function HeatGrid({ m, x, y, cs, range, label }: { m: number[][]; x: number; y: number; cs: number; range: number; label: string }) {
  return (
    <g>
      {m.map((row, i) => row.map((v, j) => <rect key={i + '-' + j} x={x + j * cs} y={y + i * cs} width={cs - 0.6} height={cs - 0.6} style={{ fill: colorMap(0.5 + v / (2 * range), 'div') }} />))}
      <text x={x + (m[0].length * cs) / 2} y={y + m.length * cs + 14} textAnchor="middle" className="m">
        {label}
      </text>
    </g>
  );
}
/**
 * llm.lora — a target weight update ΔW* (12×12) and its rank-r LoRA approximation BA (best possible, from the SVD),
 * with the parameter count at a real layer size.
 * params: r, decay, dReal
 */
function Lora({ spec }: { spec: VizSpec }) {
  const [r, setR] = useState((spec.r as number) ?? 2);
  const [decay, setDecay] = useState((spec.decay as number) ?? 0.5);
  const n = 12;
  const dReal = (spec.dReal as number) ?? 4096;
  const { target, U, S, V } = useMemo(() => {
    const rng = new Rng(11);
    const T: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    for (let c = 0; c < n; c++) {
      const u = Array.from({ length: n }, () => rng.normal());
      const v = Array.from({ length: n }, () => rng.normal());
      const s = decay ** c;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) T[i][j] += (s * u[i] * v[j]) / n;
    }
    const d = svd(T);
    return { target: T, ...d };
  }, [decay]);
  const Bm = U.map((row) => row.slice(0, r).map((x, c) => x * Math.sqrt(S[c])));
  const Am = Array.from({ length: r }, (_, c) => V.map((row) => row[c] * Math.sqrt(S[c])));
  const approx = target.map((_, i) => target[i].map((__, j) => Bm[i].reduce((a, b, c) => a + b * Am[c][j], 0)));
  const fro = (m: number[][]) => Math.sqrt(m.flat().reduce((a, b) => a + b * b, 0));
  const resid = target.map((row, i) => row.map((v, j) => v - approx[i][j]));
  const err = fro(resid) / fro(target);
  const range = Math.max(...target.flat().map(Math.abs));
  const cs = 12;
  const W = 520;
  const full = dReal * dReal, lora = r * 2 * dReal;
  const rs = Math.max(r, 1);
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="r" value={r} min={1} max={12} step={1} onChange={setR} />
          <Slider label="spectrum decay" value={decay} min={0.2} max={1} step={0.05} onChange={setDecay} />
          <Readout
            rows={[
              [R`\text{params here: } r(d + k)`, `${r * 2 * n} of ${n * n}`],
              [R`\tfrac{\lVert \Delta W^* - BA\rVert_F}{\lVert\Delta W^*\rVert_F}`, f2(err, 3)],
              [`d = k = ${dReal}:\\ dk`, big(full)],
              [`r(d + k)`, big(lora)],
              [R`\text{ratio}`, f2((100 * lora) / full, 3) + '%'],
            ]}
          />
          <div className="muted small">
            <TeX>B, A</TeX> here are the best rank-<TeX>r</TeX> factors (truncated SVD). Training finds its own <TeX>B, A</TeX> by gradient descent; the SVD shows the most any rank-<TeX>r</TeX> update can capture.
          </div>
        </>
      }
    >
      <svg viewBox={`0 0 ${W} 394`} className="llm-svg" style={{ maxWidth: W }}>
        <HeatGrid m={target} x={4} y={20} cs={cs} range={range} label="target update ΔW* (d×k)" />
        <text x={4 + n * cs + 14} y={20 + (n * cs) / 2 + 6} style={{ fontSize: 18 }}>
          ≈
        </text>
        <HeatGrid m={approx} x={4 + n * cs + 40} y={20} cs={cs} range={range} label={`BA (rank ${r})`} />
        <HeatGrid m={resid} x={4 + 2 * n * cs + 80} y={20} cs={cs} range={range} label="difference ΔW* − BA" />
        <text x={4} y={214} className="m">
          the factors:
        </text>
        <HeatGrid m={Bm} x={4} y={224} cs={cs} range={range} label={`B (d×${r})`} />
        <text x={4 + rs * cs + 8} y={224 + 6 + Math.min(rs, 4) * cs / 2} style={{ fontSize: 16 }}>
          ×
        </text>
        <HeatGrid m={Am} x={4 + rs * cs + 26} y={224} cs={cs} range={range} label={`A (${r}×k)`} />
        <text x={340} y={214} className="m">
          singular values of ΔW*
        </text>
        {S.map((sv, c) => (
          <rect key={c} x={340 + c * 14} y={360 - (120 * sv) / S[0]} width={11} height={(120 * sv) / S[0]} style={{ fill: c < r ? 'var(--c-u)' : 'var(--line)' }} />
        ))}
        <text x={340} y={374} className="m">
          kept (blue) and dropped (grey)
        </text>
      </svg>
    </FigureLayout>
  );
}

// ---------------------------------------------------------------- llm.dpo
const logsig = (x: number) => (x >= 0 ? -Math.log1p(Math.exp(-x)) : x - Math.log1p(Math.exp(x)));
const sigm = (x: number) => 1 / (1 + Math.exp(-x));
/**
 * llm.dpo — the DPO loss −log σ(β[(log π/π_ref)(y_w) − (log π/π_ref)(y_l)]) as a function of the margin, with sliders for both log-ratios and β.
 * params: dw, dl, beta
 */
function Dpo({ spec }: { spec: VizSpec }) {
  const [dw, setDw] = useState((spec.dw as number) ?? 0);
  const [dl, setDl] = useState((spec.dl as number) ?? 0);
  const [beta, setBeta] = useState((spec.beta as number) ?? 0.1);
  const m = dw - dl;
  const loss = -logsig(beta * m);
  const series = [
    { pts: Array.from({ length: 121 }, (_, i) => { const x = -30 + i * 0.5; return [x, -logsig(beta * x)] as [number, number]; }), color: 'var(--c-u)', label: `β = ${beta}` },
  ];
  return (
    <FigureLayout
      side={
        <>
          <Slider tex={R`\Delta_w`} value={dw} min={-15} max={15} step={0.5} onChange={setDw} />
          <Slider tex={R`\Delta_l`} value={dl} min={-15} max={15} step={0.5} onChange={setDl} />
          <Slider tex={R`\beta`} value={beta} min={0.02} max={1} step={0.02} onChange={setBeta} />
          <Readout
            rows={[
              [R`\text{margin m} = \Delta_w - \Delta_l`, f2(m, 2)],
              [R`\hat r_w = \beta\Delta_w,\ \hat r_l = \beta\Delta_l`, `${f2(beta * dw, 2)}, ${f2(beta * dl, 2)}`],
              [R`\text{loss } -\ln\sigma(\beta\cdot\text{m})`, f2(loss, 3)],
              [R`\text{grad weight } \sigma(-\beta\cdot\text{m})`, f2(sigm(-beta * m), 3)],
            ]}
          />
          <div className="muted small">
            <TeX>{R`\Delta = \log\pi_\theta(y\mid x) - \log\pi_{\text{ref}}(y\mid x)`}</TeX>: how much more likely the trained policy makes a response than the reference model does.
          </div>
        </>
      }
    >
      <LinePlot series={series} x={[-30, 30]} y={[0, 4]} width={440} height={260} xlabel="margin Δw − Δl" ylabel="DPO loss" vlines={[{ x: 0 }]}>
        {(sx, sy) => <circle cx={sx(Math.max(-30, Math.min(30, m)))} cy={sy(Math.min(4, loss))} r={6} style={{ fill: 'var(--c-v)' }} />}
      </LinePlot>
    </FigureLayout>
  );
}

const corpusOk = (s: VizSpec) => (s.corpus && !(Array.isArray(s.corpus) && (s.corpus as unknown[]).every((x) => Array.isArray(x) && typeof (x as unknown[])[0] === 'string' && typeof (x as unknown[])[1] === 'number')) ? 'corpus must be [word, count][]' : null);

export const trainingViz = {
  'llm.bpe': { component: Bpe, validate: corpusOk, doc: 'BPE merge stepper with pair counts. params corpus, eow, steps' },
  'llm.nexttoken': { component: NextToken, validate: (s: VizSpec) => (s.p && s.targets && (s.p as number[]).length !== (s.targets as string[]).length ? 'p and targets must match' : null), doc: 'Per-token −ln p, mean cross-entropy and perplexity under teacher forcing. params context, targets, p, V' },
  'llm.scaling': { component: Scaling, doc: "Illustrative scaling law: reducible loss vs compute (log–log) and isoFLOP curve. params mode ('frontier'|'isoflop'), logC" },
  'llm.moe': { component: Moe, validate: (s: VizSpec) => (s.E !== undefined && !((s.E as number) >= 2 && (s.E as number) <= 16) ? 'E in 2..16' : null), doc: 'Top-k routing to E experts, expert load, total vs active parameters. params E, k, seed' },
  'llm.trainmem': { component: TrainMem, doc: 'Per-GPU memory for mixed-precision Adam under DDP and ZeRO-1/2/3. params N, logG, stage, gpuGB' },
  'llm.lora': { component: Lora, doc: 'Rank-r approximation BA of a weight update, error and parameter counts. params r, decay, dReal' },
  'llm.dpo': { component: Dpo, doc: 'DPO loss vs margin with sliders for the chosen/rejected log-ratios and β. params dw, dl, beta' },
};
