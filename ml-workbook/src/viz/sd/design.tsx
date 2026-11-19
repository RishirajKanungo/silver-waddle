// Figures for the system-design framework: the stage diagram, a latency/compute funnel, and a RAG cost model.
import { useState, type KeyboardEvent } from 'react';
import type { VizSpec } from '../../content/types';
import { Slider, Readout, FigureLayout, Toggle } from '../kit';
import { fx, fint, fusd } from './common';

// ------------------------------------------------------------------ sd.pipeline

interface Stage { name: string; short: string; w: number; questions: string[]; pitfalls: string[] }
const STAGES: Stage[] = [
  {
    name: 'Clarify goal and constraints', short: 'Clarify', w: 5,
    questions: ['Who are the users, and what action do we want from them?', 'Scale: daily users, requests per second, catalogue size?', 'Latency budget (p99) and cost limits?', 'What must the system never do (unsafe content, blocking good users)?', 'Is there an existing system or baseline to beat?'],
    pitfalls: ['Jumping to a model before the goal is fixed', 'Not stating assumptions out loud when the interviewer leaves them open', 'Asking many questions that do not change the design'],
  },
  {
    name: 'ML task and metrics', short: 'Task & metrics', w: 5,
    questions: ['What exactly is predicted, for which unit, at what moment?', 'Business metric, online metric, offline metric: how does each proxy the one above?', 'Which errors are costly: false positives or false negatives?', 'Ranking, classification, regression, or several heads?'],
    pitfalls: ['Choosing accuracy for an imbalanced problem', 'An online metric that the model can game (clickbait for CTR)', 'No guardrail metrics'],
  },
  {
    name: 'Data, labels, features', short: 'Data & features', w: 8,
    questions: ['Where do labels come from: logs, human review, both?', 'How long until a label is known (label delay)?', 'Which examples are missing because the current system filtered them?', 'Do we downsample negatives, and do we correct for it?', 'Which features exist at request time, and how fresh are they?'],
    pitfalls: ['The label is computed from data only available after prediction time (leakage)', 'Ignoring position or selection bias in implicit feedback', 'Random train/test split when the deployment predicts the future'],
  },
  {
    name: 'Baseline, then models', short: 'Models', w: 8,
    questions: ['What is a baseline we could ship this week?', 'Which model family fits the data: trees for tabular, two-tower for retrieval, deep ranking for sparse features?', 'One model or a funnel of cheaper and costlier models?', 'What is the loss, and does it match the metric?'],
    pitfalls: ['Starting with the largest model without a baseline', 'Naming architectures without saying why they fit', 'Spending the whole interview here'],
  },
  {
    name: 'Training pipeline', short: 'Training', w: 3,
    questions: ['How are point-in-time correct training sets built?', 'Time-based validation split?', 'Retraining cadence: daily, continuous, weekly?', 'How are data and model versions tracked?'],
    pitfalls: ['Features joined with values from after the event', 'Evaluation on data the model was trained on'],
  },
  {
    name: 'Serving', short: 'Serving', w: 6,
    questions: ['Batch precompute, online inference, or both?', 'How is the p99 latency budget split across stages?', 'What can be cached, and for how long?', 'Fallback when the model times out?', 'How many machines for peak QPS?'],
    pitfalls: ['A heavy model scoring the whole catalogue per request', 'Budgeting with average latency instead of p99', 'Feature computation that differs between training and serving'],
  },
  {
    name: 'Evaluation: offline, then A/B', short: 'Evaluation', w: 5,
    questions: ['Offline metric on a time-based holdout?', 'A/B test: unit of randomization, primary metric, guardrails, duration, sample size?', 'Novelty effects or interference between users?'],
    pitfalls: ['Declaring success from offline metrics alone', 'Peeking at the A/B test and stopping early', 'Randomizing by request when users see both variants'],
  },
  {
    name: 'Monitoring and iteration', short: 'Monitoring', w: 5,
    questions: ['Which input, output and outcome distributions do we watch?', 'How is drift detected (PSI, score shifts) and what triggers retraining?', 'Is there a feedback loop, and how much exploration breaks it?', 'What would you build next?'],
    pitfalls: ['No plan for delayed labels in monitoring', 'Ignoring the model\'s effect on its own future training data', 'No rollback path'],
  },
];

/**
 * sd.pipeline — the eight-stage design framework. Click a stage to see what to ask and what goes wrong;
 * a slider sets the interview length and the time allotted to each stage.
 */
function Pipeline({ spec }: { spec: VizSpec }) {
  const [sel, setSel] = useState(typeof spec.stage === 'number' ? spec.stage : 0);
  const [len, setLen] = useState(45);
  const total = STAGES.reduce((s, x) => s + x.w, 0);
  const mins = STAGES.map((s) => (s.w / total) * len);
  const start = mins.slice(0, sel).reduce((a, b) => a + b, 0);
  const st = STAGES[sel];
  const W = 520, bw = 112, bh = 54, gx = (W - 4 * bw) / 5, row = [34, 148];
  const pos = (k: number) => {
    const r = k < 4 ? 0 : 1;
    const c = r === 0 ? k : 7 - k; // snake: second row runs right to left
    return { x: gx + c * (bw + gx), y: row[r] };
  };
  const key = (k: number) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSel(k);
    }
  };
  const H = 232;
  return (
    <FigureLayout
      side={
        <>
          <Slider label="interview (min)" value={len} min={30} max={60} step={5} onChange={setLen} fmt={(v) => String(v)} />
          <Readout
            title={`stage ${sel + 1}: ${st.short}`}
            rows={[
              ['\\text{minutes}', fx(mins[sel], 1)],
              ['\\text{clock}', `${fx(start, 1)} – ${fx(start + mins[sel], 1)}`],
              ['\\text{models (4)}', fx(mins[3], 1)],
              ['\\text{metrics + data (2, 3)}', fx(mins[1] + mins[2], 1)],
            ]}
          />
          <div className="muted small">Click a stage (or tab to it and press Enter).</div>
        </>
      }
      below={
        <div className="sd-panel" style={{ width: '100%' }}>
          <div className="sd-tb" style={{ fontWeight: 600 }}>{sel + 1}. {st.name}</div>
          <div className="sd-cols">
            <div>
              <h4>Questions to ask</h4>
              <ul>{st.questions.map((q, k) => <li key={k}>{q}</li>)}</ul>
            </div>
            <div>
              <h4>Common pitfalls</h4>
              <ul>{st.pitfalls.map((q, k) => <li key={k}>{q}</li>)}</ul>
            </div>
          </div>
        </div>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="sd-svg" style={{ maxWidth: W }} role="group" aria-label="design framework stages">
        <defs>
          <marker id="sd-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--muted)' }} />
          </marker>
        </defs>
        <rect width={W} height={H} className="pl-bg" />
        {STAGES.slice(0, -1).map((_, k) => {
          const a = pos(k), b = pos(k + 1);
          if (k === 3) return <path key={k} d={`M${a.x + bw / 2},${a.y + bh} L${b.x + bw / 2},${b.y - 4}`} style={{ stroke: 'var(--muted)', strokeWidth: 1.5, fill: 'none' }} markerEnd="url(#sd-arr)" />;
          const fwd = k < 3;
          const x1 = fwd ? a.x + bw : a.x, x2 = fwd ? b.x - 3 : b.x + bw + 3;
          return <path key={k} d={`M${x1},${a.y + bh / 2} L${x2},${b.y + bh / 2}`} style={{ stroke: 'var(--muted)', strokeWidth: 1.5, fill: 'none' }} markerEnd="url(#sd-arr)" />;
        })}
        {(() => {
          // iteration loop: monitoring (stage 8, bottom-left) back up to data (stage 3, top)
          const m = pos(7), d = pos(2);
          const x0 = m.x + 14, y0 = m.y + bh;
          return (
            <g>
              <path d={`M${x0},${y0} L${x0},${y0 + 18} L${8},${y0 + 18} L${8},${d.y - 14} L${d.x + bw / 2},${d.y - 14} L${d.x + bw / 2},${d.y - 3}`} style={{ stroke: 'var(--accent)', strokeWidth: 1.5, fill: 'none', strokeDasharray: '5 4' }} markerEnd="url(#sd-arr)" />
              <text x={16} y={13} className="sd-ts" style={{ fill: 'var(--accent)' }}>iterate: monitoring feeds back into data</text>
            </g>
          );
        })()}
        {STAGES.map((s, k) => {
          const p = pos(k);
          return (
            <g key={k} className="sd-click" tabIndex={0} role="button" aria-pressed={k === sel} aria-label={`stage ${k + 1}: ${s.name}`} onClick={() => setSel(k)} onKeyDown={key(k)}>
              <rect x={p.x} y={p.y} width={bw} height={bh} rx={8} className={'sd-box' + (k === sel ? ' on' : '')} />
              <text x={p.x + 8} y={p.y + 14} className="sd-ts">{k + 1}</text>
              <text x={p.x + bw / 2} y={p.y + 31} textAnchor="middle" className="sd-tb">{s.short}</text>
              <text x={p.x + bw / 2} y={p.y + 47} textAnchor="middle" className="sd-ts sd-num">{fx(mins[k], 1)} min</text>
            </g>
          );
        })}
      </svg>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ sd.funnel

const FIX = { retrieval: 20, features: 10, rerank: 5, overhead: 20, lightUs: 10 };

/**
 * sd.funnel — a retrieval → light ranker → heavy ranker → re-rank funnel with a p99 budget and the CPU it needs.
 */
function Funnel({ spec }: { spec: VizSpec }) {
  const [n1, setN1] = useState(typeof spec.n1 === 'number' ? spec.n1 : 2000);
  const [n2, setN2] = useState(typeof spec.n2 === 'number' ? spec.n2 : 800);
  const [cost, setCost] = useState(500);
  const [workers, setWorkers] = useState(2);
  const [budget, setBudget] = useState(200);
  const [qps, setQps] = useState(10000);
  const [hit, setHit] = useState(0);
  const N2 = Math.min(n2, n1);
  const light = (n1 * FIX.lightUs) / 1000;
  const heavy = (N2 * cost) / workers / 1000;
  const segs = [
    { name: 'retrieve (ANN)', ms: FIX.retrieval, col: 'var(--c-i)' },
    { name: 'feature fetch', ms: FIX.features, col: 'var(--muted)' },
    { name: 'light ranker', ms: light, col: 'var(--c-u)' },
    { name: 'heavy ranker', ms: heavy, col: 'var(--c-v)' },
    { name: 're-rank', ms: FIX.rerank, col: 'var(--c-w)' },
    { name: 'network + overhead', ms: FIX.overhead, col: 'var(--line)' },
  ];
  const total = segs.reduce((s, x) => s + x.ms, 0);
  const cpuS = (n1 * FIX.lightUs + N2 * cost) / 1e6;
  const cores = qps * (1 - hit) * cpuS;
  const over = total > budget;
  // drawing
  const W = 520, H = 312;
  const stages = [
    { label: 'catalogue', n: 5e7 },
    { label: 'retrieved', n: n1 },
    { label: 'heavy ranker', n: N2 },
    { label: 'page', n: 20 },
  ];
  const wOf = (n: number) => 40 + (Math.log10(n) / Math.log10(5e7)) * 280;
  const fy = (k: number) => 16 + k * 42;
  const cx = 180;
  const scaleMax = Math.max(400, total * 1.05, budget * 1.1);
  const bx = 20, bwid = W - 40, by = 214, bh = 26;
  const sx = (ms: number) => bx + (ms / scaleMax) * bwid;
  let acc = 0;
  return (
    <FigureLayout
      side={
        <>
          <Slider label="retrieved" value={n1} min={500} max={5000} step={100} onChange={setN1} fmt={(v) => String(v)} />
          <Slider label="to heavy" value={n2} min={100} max={2000} step={50} onChange={setN2} fmt={(v) => String(v)} />
          <Slider label="µs / item" value={cost} min={100} max={1000} step={50} onChange={setCost} fmt={(v) => String(v)} />
          <Slider label="workers" value={workers} min={1} max={8} step={1} onChange={setWorkers} fmt={(v) => String(v)} />
          <Slider label="p99 budget" value={budget} min={100} max={400} step={10} onChange={setBudget} fmt={(v) => v + ' ms'} />
          <Slider label="QPS" value={qps} min={1000} max={50000} step={1000} onChange={setQps} fmt={(v) => fx(v / 1000, 0) + 'k'} />
          <Slider label="cache hit" value={hit} min={0} max={0.9} step={0.05} onChange={setHit} fmt={(v) => Math.round(v * 100) + '%'} />
          <Readout
            rows={[
              ['\\text{heavy ranker}', `${fx(heavy, 1)} ms`],
              ['\\text{total p99}', `${fx(total, 1)} ms`],
              ['\\text{slack}', <span key="s" className={over ? 'sd-bad' : 'sd-ok'}>{fx(budget - total, 1)} ms</span>],
              ['\\text{CPU per request}', `${fx(cpuS * 1000, 0)} ms`],
              ['\\text{cores}', fint(cores)],
            ]}
          />
        </>
      }
      below={<div className="sd-note">Fixed in this model: retrieval {FIX.retrieval} ms, feature fetch {FIX.features} ms, light ranker {FIX.lightUs} µs per item on one worker, re-rank {FIX.rerank} ms, network and overhead {FIX.overhead} ms. Cores = QPS × (1 − cache hit rate) × CPU-seconds of ranking per request.</div>}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="sd-svg" style={{ maxWidth: W }} role="img" aria-label="ranking funnel and latency budget">
        <rect width={W} height={H} className="pl-bg" />
        {stages.map((s, k) => {
          const w = wOf(s.n);
          const nxt = k < stages.length - 1 ? wOf(stages[k + 1].n) : w;
          const y = fy(k);
          return (
            <g key={k}>
              {k < stages.length - 1 && <polygon points={`${cx - w / 2},${y + 26} ${cx + w / 2},${y + 26} ${cx + nxt / 2},${y + 42} ${cx - nxt / 2},${y + 42}`} style={{ fill: 'var(--accent)', opacity: 0.1 }} />}
              <rect x={cx - w / 2} y={y} width={w} height={26} rx={4} style={{ fill: 'var(--accent)', opacity: 0.22 + 0.12 * k }} />
              <text x={cx} y={y + 17} textAnchor="middle" className="sd-tb sd-num">{s.n >= 1e6 ? fx(s.n / 1e6, 0) + 'M' : fint(s.n)}</text>
              <text x={cx + 170} y={y + 17} className="sd-t">{s.label}</text>
            </g>
          );
        })}
        <text x={bx} y={by - 26} className="sd-ts">latency along the request path (ms)</text>
        {segs.map((s, k) => {
          const x0 = sx(acc);
          acc += s.ms;
          const x1 = sx(acc);
          return (
            <g key={k}>
              <rect x={x0} y={by} width={Math.max(0, x1 - x0)} height={bh} style={{ fill: s.col, opacity: 0.85, stroke: 'var(--surface)', strokeWidth: 1 }} />
              {x1 - x0 > 34 && <text x={(x0 + x1) / 2} y={by + 17} textAnchor="middle" className="sd-ts sd-num" style={{ fill: 'var(--surface)', fontWeight: 600 }}>{fx(s.ms, 0)}</text>}
            </g>
          );
        })}
        <line x1={sx(budget)} x2={sx(budget)} y1={by - 6} y2={by + bh + 8} style={{ stroke: over ? 'var(--bad)' : 'var(--ok)', strokeWidth: 2.5 }} />
        <text x={sx(budget)} y={by - 10} textAnchor="middle" className="sd-ts" style={{ fill: over ? 'var(--bad)' : 'var(--ok)', fontWeight: 600 }}>budget {budget} ms</text>
        {[0, 100, 200, 300, 400, 500, 600, 700].filter((v) => v <= scaleMax).map((v) => (
          <text key={v} x={sx(v)} y={by + bh + 16} textAnchor="middle" className="sd-ts sd-num">{v}</text>
        ))}
        <g transform={`translate(${bx}, ${H - 6})`}>
          {segs.map((s, k) => (
            <g key={k} transform={`translate(${k * 84}, 0)`}>
              <rect x={0} y={-9} width={9} height={9} rx={2} style={{ fill: s.col }} />
              <text x={12} y={-1} className="sd-ts">{s.name.split(' ')[0]}</text>
            </g>
          ))}
        </g>
      </svg>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ sd.ragcost

const RAG = { sys: 500, q: 50, guard: 30, embed: 10, retrieve: 20, rerank: 60, cacheDiscount: 0.1 };

/**
 * sd.ragcost — illustrative latency and cost per request of a RAG assistant.
 */
function RagCost({ spec }: { spec: VizSpec }) {
  const [k, setK] = useState(typeof spec.k === 'number' ? spec.k : 5);
  const [chunk, setChunk] = useState(400);
  const [outTok, setOutTok] = useState(300);
  const [prefill, setPrefill] = useState(10000);
  const [decode, setDecode] = useState(50);
  const [pin, setPin] = useState(0.5);
  const [pout, setPout] = useState(2);
  const [cache, setCache] = useState(false);
  const inTok = RAG.sys + RAG.q + k * chunk;
  const billedIn = cache ? inTok - RAG.sys * (1 - RAG.cacheDiscount) : inTok;
  const prefillMs = ((cache ? inTok - RAG.sys : inTok) / prefill) * 1000;
  const ttft = RAG.guard + RAG.embed + RAG.retrieve + RAG.rerank + prefillMs;
  const decodeMs = (outTok / decode) * 1000;
  const totalMs = ttft + decodeMs;
  const costIn = (billedIn * pin) / 1e6, costOut = (outTok * pout) / 1e6;
  const cost = costIn + costOut;
  const W = 520, H = 250;
  const segs = [
    { name: 'guardrail', ms: RAG.guard, col: 'var(--muted)' },
    { name: 'embed', ms: RAG.embed, col: 'var(--c-i)' },
    { name: 'retrieve', ms: RAG.retrieve, col: 'var(--c-u)' },
    { name: 'rerank', ms: RAG.rerank, col: 'var(--c-w)' },
    { name: 'prefill', ms: prefillMs, col: 'var(--c-v)' },
  ];
  const x0 = 96, x1 = W - 16;
  const sT = (ms: number) => x0 + (ms / Math.max(800, ttft * 1.05)) * (x1 - x0);
  const sF = (ms: number) => x0 + (ms / Math.max(4000, totalMs * 1.02)) * (x1 - x0);
  const cMax = Math.max(0.004, cost * 1.05);
  const sC = (c: number) => x0 + (c / cMax) * (x1 - x0);
  let acc = 0;
  return (
    <FigureLayout
      side={
        <>
          <Slider label="chunks k" value={k} min={1} max={10} step={1} onChange={setK} fmt={(v) => String(v)} />
          <Slider label="chunk tokens" value={chunk} min={100} max={1000} step={50} onChange={setChunk} fmt={(v) => String(v)} />
          <Slider label="answer tokens" value={outTok} min={50} max={1000} step={50} onChange={setOutTok} fmt={(v) => String(v)} />
          <Slider label="prefill tok/s" value={prefill} min={2000} max={20000} step={1000} onChange={setPrefill} fmt={(v) => fx(v / 1000, 0) + 'k'} />
          <Slider label="decode tok/s" value={decode} min={10} max={150} step={5} onChange={setDecode} fmt={(v) => String(v)} />
          <Slider label="$ / M in" value={pin} min={0.1} max={5} step={0.1} onChange={setPin} fmt={(v) => v.toFixed(1)} />
          <Slider label="$ / M out" value={pout} min={0.5} max={20} step={0.5} onChange={setPout} fmt={(v) => v.toFixed(1)} />
          <Toggle label="cache the system prompt" value={cache} onChange={setCache} />
          <Readout
            rows={[
              ['\\text{input tokens}', fint(inTok)],
              ['\\text{time to first token}', `${fint(ttft)} ms`],
              ['\\text{full answer}', `${fx(totalMs / 1000, 2)} s`],
              ['\\text{cost / request}', fusd(cost)],
              ['\\text{cost / 1M requests}', fusd(cost * 1e6)],
            ]}
          />
        </>
      }
      below={<div className="sd-warn">Illustrative numbers only, not any provider's prices or speeds. Fixed: system prompt {RAG.sys} tokens, question {RAG.q} tokens, guardrail {RAG.guard} ms, query embedding {RAG.embed} ms, retrieval {RAG.retrieve} ms, reranking {RAG.rerank} ms. Cached system-prompt tokens skip prefill and are billed at {RAG.cacheDiscount * 100}%.</div>}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="sd-svg" style={{ maxWidth: W }} role="img" aria-label="latency and cost breakdown">
        <rect width={W} height={H} className="pl-bg" />
        <text x={8} y={20} className="sd-tb">to first token</text>
        {segs.map((s, i) => {
          const a = sT(acc);
          acc += s.ms;
          const b = sT(acc);
          return (
            <g key={i}>
              <rect x={a} y={30} width={Math.max(0, b - a)} height={24} style={{ fill: s.col, opacity: 0.85, stroke: 'var(--surface)', strokeWidth: 1 }} />
              {b - a > 44 && <text x={(a + b) / 2} y={46} textAnchor="middle" className="sd-ts" style={{ fill: 'var(--surface)', fontWeight: 600 }}>{s.name}</text>}
            </g>
          );
        })}
        <text x={sT(ttft) + 4 > x1 - 60 ? sT(ttft) - 4 : sT(ttft) + 4} y={70} textAnchor={sT(ttft) + 4 > x1 - 60 ? 'end' : 'start'} className="sd-ts sd-num">{fint(ttft)} ms</text>
        <text x={8} y={100} className="sd-tb">full answer</text>
        <rect x={sF(0)} y={110} width={sF(ttft) - sF(0)} height={24} style={{ fill: 'var(--c-u)', opacity: 0.85 }} />
        <rect x={sF(ttft)} y={110} width={sF(totalMs) - sF(ttft)} height={24} style={{ fill: 'var(--violet)', opacity: 0.7 }} />
        {sF(totalMs) - sF(ttft) > 120 && <text x={(sF(ttft) + sF(totalMs)) / 2} y={126} textAnchor="middle" className="sd-ts" style={{ fill: 'var(--surface)', fontWeight: 600 }}>decode {fint(outTok)} tokens</text>}
        <text x={x0} y={150} className="sd-ts sd-num">first token at {fint(ttft)} ms, done at {fx(totalMs / 1000, 2)} s</text>
        <text x={8} y={186} className="sd-tb">cost</text>
        <rect x={sC(0)} y={196} width={sC(costIn) - sC(0)} height={24} style={{ fill: 'var(--c-u)', opacity: 0.8 }} />
        <rect x={sC(costIn)} y={196} width={sC(cost) - sC(costIn)} height={24} style={{ fill: 'var(--c-v)', opacity: 0.8 }} />
        <text x={x0} y={238} className="sd-ts sd-num">input {fusd(costIn)} ({fint(billedIn)} billed tokens) + output {fusd(costOut)}</text>
      </svg>
    </FigureLayout>
  );
}

export const designViz = {
  'sd.pipeline': { component: Pipeline, doc: 'The eight-stage design framework; click a stage for questions and pitfalls; time allocation slider. params stage (0-7)', validate: (s: VizSpec) => (s.stage !== undefined && !(typeof s.stage === 'number' && s.stage >= 0 && s.stage < 8) ? 'stage must be 0..7' : null) },
  'sd.funnel': { component: Funnel, doc: 'Retrieval/ranking funnel: per-stage latency vs a p99 budget, and CPU cores at a given QPS. params n1, n2', validate: (s: VizSpec) => ((s.n1 !== undefined && typeof s.n1 !== 'number') || (s.n2 !== undefined && typeof s.n2 !== 'number') ? 'n1, n2 must be numbers' : null) },
  'sd.ragcost': { component: RagCost, doc: 'Illustrative RAG latency (TTFT, full answer) and cost per request. params k', validate: (s: VizSpec) => (s.k !== undefined && typeof s.k !== 'number' ? 'k must be a number' : null) },
};
