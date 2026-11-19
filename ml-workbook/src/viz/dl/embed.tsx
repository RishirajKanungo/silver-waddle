import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Arrow, Handle, Label, ParamCurve, Point, Seg, LinePlot, Slider, Readout, FigureLayout, SegControl, MatGrid, TeX, type P2 } from '../kit';
import { fmt, sigTeX, tv } from './util';
import './dl.css';

// ------------------------------------------------------------------ dl.embedlookup

const VOCAB = ['the', 'cat', 'dog', 'sat', 'ran', 'mat'];
const E0 = [
  [0.1, -0.3, 0.2, 0.0],
  [0.9, 0.4, -0.5, 0.3],
  [0.8, 0.5, -0.4, -0.2],
  [-0.6, 0.7, 0.1, 0.5],
  [-0.5, 0.8, 0.3, 0.6],
  [0.3, -0.8, 0.6, -0.1],
];

/**
 * dl.embedlookup — embedding lookup as one-hot × matrix. 'forward': pick a token, see the one-hot row times E select a row;
 * a sentence gives a (T × d) matrix of rows. 'backward': upstream gradients scatter-add into the rows of E that were used.
 * params: mode ('forward'|'backward'), ids (token ids of the sentence)
 */
function EmbedLookup({ spec }: { spec: VizSpec }) {
  const [mode, setMode] = useState<'forward' | 'backward'>((spec.mode as 'forward' | 'backward') ?? 'forward');
  const [tok, setTok] = useState(1);
  const ids = (spec.ids as number[]) ?? [0, 1, 3, 0, 5];
  const G = ids.map((_, t) => [0.1 * (t + 1), -0.2, 0.1, 0.3 - 0.1 * t].map((v) => Math.round(v * 10) / 10));
  const gradE = VOCAB.map((_, w) => [0, 1, 2, 3].map((j) => ids.reduce((a, id, t) => a + (id === w ? G[t][j] : 0), 0)));
  const oneHot = VOCAB.map((_, i) => (i === tok ? 1 : 0));
  const f1 = (v: number) => (Number.isInteger(v) ? String(v) : fmt(v, 2));
  const used = [...new Set(ids)];
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={mode} onChange={setMode} options={[{ v: 'forward', label: 'lookup' }, { v: 'backward', label: 'gradient' }]} />
          {mode === 'forward' ? (
            <>
              <div className="dl-row">
                {VOCAB.map((w, i) => (
                  <button key={w} className={i === tok ? 'primary' : ''} onClick={() => setTok(i)}>
                    {w}
                  </button>
                ))}
              </div>
              <Readout
                rows={[
                  ['\\text{token id } i', String(tok)],
                  ['\\be_i\\T E', `(${E0[tok].map(f1).join(', ')})`],
                  ['\\text{multiplications}', '0'],
                ]}
              />
              <div className="small">
                The product <TeX>{'\\be_i\\T E'}</TeX> would cost <TeX>{'V d'}</TeX> multiply-adds, almost all by zero. Frameworks implement it as an index, <code>E[ids]</code>.
              </div>
            </>
          ) : (
            <>
              <div className="small">
                Sentence: <b>{ids.map((i) => VOCAB[i]).join(' ')}</b>. Each position <TeX>{'t'}</TeX> sends its upstream gradient <TeX>{'\\bg_t'}</TeX> to row <TeX>{'\\text{id}_t'}</TeX> of <TeX>{'E'}</TeX>. A word used twice receives the sum.
              </div>
              <Readout
                rows={[
                  ['\\text{nonzero rows}', `${used.length} of ${VOCAB.length}`],
                  ['\\text{row the} = \\bg_0 + \\bg_3', `(${gradE[0].map(f1).join(', ')})`],
                ]}
              />
            </>
          )}
        </>
      }
    >
      {mode === 'forward' ? (
        <div className="dl-stack">
          <div className="dl-row dl-top">
            <MatGrid m={[oneHot]} cols={[tok]} colLabels={VOCAB} caption={<TeX>{'\\be_i\\T\\ (1\\times V)'}</TeX>} />
            <span className="dl-op">×</span>
            <MatGrid m={E0} rows={[tok]} fmt={f1} rowLabels={VOCAB} caption={<TeX>{'E\\ (V\\times d)'}</TeX>} />
            <span className="dl-op">=</span>
            <MatGrid m={[E0[tok]]} fmt={f1} caption={<TeX>{'\\be_i\\T E\\ (1\\times d)'}</TeX>} />
          </div>
          <div className="muted small">
            A batch of token ids gives one row per token: ids {JSON.stringify(ids)} → a {ids.length} × 4 matrix, the rows of <TeX>{'E'}</TeX> listed in that order.
          </div>
          <MatGrid m={ids.map((i) => E0[i])} fmt={f1} rowLabels={ids.map((i) => VOCAB[i])} rows={ids.map((i, t) => (i === tok ? t : -1)).filter((t) => t >= 0)} caption={<TeX>{'E[\\text{ids}]\\ (T\\times d)'}</TeX>} />
        </div>
      ) : (
        <div className="dl-row dl-top">
          <MatGrid m={G} fmt={f1} rowLabels={ids.map((i, t) => `${t}: ${VOCAB[i]}`)} caption={<TeX>{'\\partial L/\\partial(\\text{rows})\\ (T\\times d)'}</TeX>} />
          <span className="dl-op">→</span>
          <MatGrid m={gradE} fmt={f1} rowLabels={VOCAB} rows={used} caption={<TeX>{'\\partial L/\\partial E\\ (V\\times d)'}</TeX>} />
        </div>
      )}
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ dl.analogy

const WORDS: Record<string, P2> = {
  man: [1.5, -1],
  woman: [1.5, 1],
  boy: [0.6, -1.2],
  girl: [0.6, 1.1],
  king: [3.5, -1.1],
  queen: [3.4, 1.0],
  apple: [-2, 0.3],
  pear: [-2.2, -0.4],
};
const cosv = (a: P2, b: P2) => (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(a[0], a[1]) * Math.hypot(b[0], b[1]) || 1);

/**
 * dl.analogy — a toy 2-D embedding. Computes a − b + c and ranks the remaining words by cosine similarity.
 * Words can be dragged. params: a, b, c (word names)
 */
function Analogy({ spec }: { spec: VizSpec }) {
  const [pts, setPts] = useState<Record<string, P2>>({ ...WORDS });
  const [a, setA] = useState((spec.a as string) ?? 'king');
  const [b, setB] = useState((spec.b as string) ?? 'man');
  const [c, setC] = useState((spec.c as string) ?? 'woman');
  const r: P2 = [pts[a][0] - pts[b][0] + pts[c][0], pts[a][1] - pts[b][1] + pts[c][1]];
  const ranked = Object.keys(pts)
    .filter((w) => w !== a && w !== b && w !== c)
    .map((w) => ({ w, cos: cosv(r, pts[w]) }))
    .sort((x, y) => y.cos - x.cos);
  const sel = (v: string, set: (s: string) => void) => (
    <select value={v} onChange={(e) => set(e.target.value)} className="dl-select">
      {Object.keys(WORDS).map((w) => (
        <option key={w} value={w}>
          {w}
        </option>
      ))}
    </select>
  );
  return (
    <FigureLayout
      side={
        <>
          <div className="dl-row">
            {sel(a, setA)} − {sel(b, setB)} + {sel(c, setC)}
          </div>
          <Readout
            rows={[
              ['\\bv_a - \\bv_b + \\bv_c', `(${fmt(r[0], 2)}, ${fmt(r[1], 2)})`],
              ...ranked.slice(0, 4).map((x, i) => [`${i + 1}.\\ \\text{${x.w}}`, 'cos ' + fmt(x.cos, 3)] as [string, string]),
            ]}
          />
          <div className="small">The three input words are excluded from the ranking, as in the standard analogy evaluation. Drag any word to change the embedding.</div>
        </>
      }
    >
      <Plane x={[-3, 5]} y={[-2.5, 2.5]} width={440} gridStep={1}>
        <Arrow from={pts[b]} to={pts[a]} color="var(--c-u)" dashed width={2} />
        <Arrow from={pts[c]} to={r} color="var(--c-u)" width={2.5} />
        <Arrow to={r} color="var(--c-w)" width={2} opacity={0.5} />
        <Point at={r} r={6} color="var(--c-w)" hollow />
        <Label at={r} text="a − b + c" color="var(--c-w)" dx={10} dy={-18} anchor="start" />
        {Object.entries(pts).map(([w, p]) => (
          <g key={w}>
            <Handle at={p} onChange={(q) => setPts({ ...pts, [w]: q })} color={w === a || w === b || w === c ? 'var(--c-v)' : 'var(--fg)'} r={5} snap={0.1} label={w} text={w} />
          </g>
        ))}
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ dl.contrastive

/**
 * dl.contrastive — N = 4 image/text pairs embedded on the unit circle. Similarity matrix s_ij = u_i·v_j / τ, row-wise softmax,
 * InfoNCE loss per row, and the CLIP-style symmetric loss. Drag the arrow tips (they stay on the circle).
 * params: tau, img (angles in degrees), txt (angles in degrees)
 */
function Contrastive({ spec }: { spec: VizSpec }) {
  const [tau, setTau] = useState((spec.tau as number) ?? 0.3);
  const deg = (d: number): P2 => [Math.cos((d * Math.PI) / 180), Math.sin((d * Math.PI) / 180)];
  const [U, setU] = useState<P2[]>(((spec.img as number[]) ?? [10, 100, 190, 280]).map(deg));
  const [V, setV] = useState<P2[]>(((spec.txt as number[]) ?? [35, 80, 215, 300]).map(deg));
  const N = U.length;
  const { S, P, rowLoss, colLoss } = useMemo(() => {
    const S = U.map((u) => V.map((v) => (u[0] * v[0] + u[1] * v[1]) / tau));
    const P = S.map((row) => {
      const m = Math.max(...row);
      const e = row.map((s) => Math.exp(s - m));
      const z = e.reduce((x, y) => x + y, 0);
      return e.map((x) => x / z);
    });
    const rowLoss = P.map((row, i) => -Math.log(row[i]));
    const colLoss = V.map((_, j) => {
      const col = S.map((row) => row[j]);
      const m = Math.max(...col);
      const z = col.reduce((x, s) => x + Math.exp(s - m), 0);
      return -(col[j] - m - Math.log(z));
    });
    return { S, P, rowLoss, colLoss };
  }, [U, V, tau]);
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const norm = (p: P2): P2 => {
    const n = Math.hypot(p[0], p[1]) || 1;
    return [p[0] / n, p[1] / n];
  };
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="\tau" value={tau} min={0.05} max={1} step={0.01} onChange={setTau} />
          <MatGrid m={P} fmt={(v) => fmt(v, 2)} heat="seq" heatRange={[0, 1]} cells={[...Array(N).keys()].map((i) => [i, i] as [number, number])} rowLabels={[...Array(N).keys()].map((i) => `I${i + 1}`)} colLabels={[...Array(N).keys()].map((j) => `T${j + 1}`)} caption={<TeX>{'\\softmax_j(s_{ij}),\\ s_{ij} = \\bu_i\\T\\bv_j/\\tau'}</TeX>} />
          <Readout
            rows={[
              ['\\text{image}\\to\\text{text loss}', fmt(mean(rowLoss), 3)],
              ['\\text{text}\\to\\text{image loss}', fmt(mean(colLoss), 3)],
              ['\\text{CLIP loss (mean)}', fmt((mean(rowLoss) + mean(colLoss)) / 2, 3)],
              ['\\ln N\\ (\\text{chance})', fmt(Math.log(N), 3)],
            ]}
          />
        </>
      }
      below={<div className="muted small">Row i of the matrix is a classification of image i over the {N} captions in the batch; the correct class is the diagonal. Raw scores range over [−1/τ, 1/τ] = [{fmt(-1 / tau, 1)}, {fmt(1 / tau, 1)}]. Example score: s₁₁ = {fmt(S[0][0], 2)}.</div>}
    >
      <Plane x={[-1.5, 1.5]} y={[-1.5, 1.5]} width={380} gridStep={0.5}>
        <ParamCurve f={(t) => [Math.cos(t), Math.sin(t)]} color="var(--muted)" width={1} />
        {U.map((u, i) => (
          <Seg key={'l' + i} a={u} b={V[i]} color="var(--c-w)" width={1.5} dashed opacity={0.6} />
        ))}
        {U.map((u, i) => (
          <g key={'u' + i}>
            <Arrow to={u} color="var(--c-u)" width={2.2} />
            <Handle at={u} onChange={(p) => setU(U.map((x, k) => (k === i ? norm(p) : x)))} color="var(--c-u)" r={5} label={`image ${i + 1}`} text={`I${i + 1}`} />
          </g>
        ))}
        {V.map((v, i) => (
          <g key={'v' + i}>
            <Arrow to={v} color="var(--c-v)" width={2.2} />
            <Handle at={v} onChange={(p) => setV(V.map((x, k) => (k === i ? norm(p) : x)))} color="var(--c-v)" r={5} label={`text ${i + 1}`} text={`T${i + 1}`} />
          </g>
        ))}
      </Plane>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ dl.rnn

/**
 * dl.rnn — how much of the gradient from the last step reaches step t. RNN: product of T − t factors w·φ′(a);
 * attention: one direct edge from every position, so no product over time.
 * params: T, w, act ('linear'|'tanh')
 */
function Rnn({ spec }: { spec: VizSpec }) {
  const [T, setT] = useState((spec.T as number) ?? 30);
  const [w, setW] = useState((spec.w as number) ?? 0.9);
  const [act, setAct] = useState<'linear' | 'tanh'>((spec.act as 'linear' | 'tanh') ?? 'linear');
  const series = useMemo(() => {
    // scalar RNN h_t = φ(w h_{t-1} + x_t) with a fixed input sequence
    const xs = Array.from({ length: T }, (_, t) => 0.5 * Math.sin(1.3 * t + 0.4));
    const hs: number[] = [0];
    const fac: number[] = [];
    for (let t = 1; t <= T; t++) {
      const a = w * hs[t - 1] + xs[t - 1];
      const h = act === 'tanh' ? Math.tanh(a) : a;
      hs.push(h);
      fac.push(act === 'tanh' ? w * (1 - h * h) : w);
    }
    const g = Array(T + 1).fill(1);
    for (let t = T - 1; t >= 0; t--) g[t] = g[t + 1] * fac[t];
    return g.map((v, t) => [t, Math.log10(Math.max(1e-30, Math.abs(v)))] as [number, number]);
  }, [T, w, act]);
  const lo = Math.min(-1, ...series.map((p) => p[1]));
  const hi = Math.max(1, ...series.map((p) => p[1]));
  const shown = Math.min(T, 10);
  const bx = (i: number) => 30 + i * (440 / shown);
  return (
    <FigureLayout
      side={
        <>
          <Slider label="length T" value={T} min={2} max={60} step={1} onChange={setT} fmt={(v) => String(v)} />
          <Slider tex="w" value={w} min={0.5} max={1.5} step={0.01} onChange={setW} />
          <SegControl value={act} onChange={setAct} options={[{ v: 'linear', label: 'linear RNN' }, { v: 'tanh', label: 'tanh RNN' }]} />
          <Readout
            rows={[
              ['|\\partial h_T/\\partial h_0|', tv(sigTeX(10 ** series[0][1], 3))],
              ['\\text{RNN: sequential steps}', String(T)],
              ['\\text{attention: sequential steps}', '1'],
              ['\\text{attention: path length } t\\to T', '1'],
            ]}
          />
          <div className="small">The RNN must run its {T} steps one after another, and the gradient from step {T} to step 0 is a product of {T} factors. Self-attention connects every pair of positions directly, at the price of <TeX>{'T^2'}</TeX> scores per layer.</div>
        </>
      }
      below={
        <div className="dl-full">
          <LinePlot series={[{ pts: series, color: 'var(--c-err)', label: 'RNN: log₁₀ |∂h_T / ∂h_t|' }, { pts: [[0, 0], [T, 0]], color: 'var(--c-w)', dashed: true, label: 'attention: direct path from every t' }]} x={[0, T]} y={[Math.floor(lo), Math.ceil(hi) + 1]} height={190} xlabel="time step t" />
        </div>
      }
    >
      <svg viewBox="0 0 500 150" className="dl-graph" style={{ maxWidth: 500 }}>
        {Array.from({ length: shown }, (_, i) => (
          <g key={i}>
            {i > 0 && <line x1={bx(i - 1) + 16} y1={50} x2={bx(i) - 16} y2={50} className="dl-rnnedge" />}
            <rect x={bx(i) - 16} y={34} width={32} height={32} rx={5} className="dl-rnncell" />
            <text x={bx(i)} y={55} textAnchor="middle" className="dl-tick">
              {shown < T && i === shown - 1 ? `h${T}` : `h${i + 1}`}
            </text>
            <line x1={bx(i)} y1={100} x2={bx(i)} y2={66} className="dl-rnnin" />
            <text x={bx(i)} y={114} textAnchor="middle" className="dl-tick">
              {shown < T && i === shown - 1 ? `x${T}` : `x${i + 1}`}
            </text>
          </g>
        ))}
        {shown < T && (
          <text x={(bx(shown - 2) + bx(shown - 1)) / 2} y={30} textAnchor="middle" className="dl-tick">
            … {T - shown} more steps …
          </text>
        )}
        <path d={`M${bx(0)},${100} C${bx(0)},${140} ${bx(shown - 1)},${140} ${bx(shown - 1)},${66}`} className="dl-attnedge" />
        <text x={250} y={145} textAnchor="middle" className="dl-tick">
          attention: x₁ reaches the last position in one step
        </text>
      </svg>
    </FigureLayout>
  );
}

export const embedViz = {
  'dl.embedlookup': {
    component: EmbedLookup,
    validate: (s: VizSpec) => (s.ids !== undefined && !(Array.isArray(s.ids) && (s.ids as number[]).every((i) => i >= 0 && i < VOCAB.length)) ? 'ids must be in 0..5' : null),
    doc: "Embedding lookup = one-hot × E, and the scatter-add gradient. params mode ('forward'|'backward'), ids",
  },
  'dl.analogy': {
    component: Analogy,
    validate: (s: VizSpec) => ([s.a, s.b, s.c].every((w) => w === undefined || (w as string) in WORDS) ? null : 'unknown word'),
    doc: 'Toy 2-D embedding: a − b + c with cosine nearest neighbours; words draggable. params a, b, c',
  },
  'dl.contrastive': {
    component: Contrastive,
    validate: (s: VizSpec) => (s.tau === undefined || (s.tau as number) > 0 ? null : 'tau must be positive'),
    doc: 'InfoNCE / CLIP loss for 4 image-text pairs on the unit circle. params tau, img, txt (angles in degrees)',
  },
  'dl.rnn': {
    component: Rnn,
    validate: (s: VizSpec) => (s.act === undefined || s.act === 'linear' || s.act === 'tanh' ? null : "act must be 'linear' or 'tanh'"),
    doc: "Gradient through time in a scalar RNN vs attention's direct path. params T, w, act ('linear'|'tanh')",
  },
};
