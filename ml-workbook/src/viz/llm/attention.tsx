// Figures for llm01: attention and the transformer.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Arrow, Handle, Poly, Point, Path, Slider, SegControl, Toggle, Readout, FigureLayout, MatGrid, LinePlot, Bars, TeX, usePlayer, Btn, type P2 } from '../kit';
import { Rng } from '../../math/rng';
import { f2, softmax, entropy, big, bytes, sci, PAL, isMat, isNumArr } from './common';
import './llm.css';

const R = String.raw;

// ---------------------------------------------------------------- llm.attention
const ATT_TOKENS = ['The', 'cat', 'sat', 'on', 'the', 'mat'];
// toy 4-d queries and keys; coordinates loosely mean (determiner, noun, verb, preposition)
const ATT_Q = [[0, 1, 0, 0], [1, 0, 1, 0], [0, 2, 0, 0], [0, 0, 2, 0], [0, 0, 0, 2], [1, 0, 0, 2]];
const ATT_K = [[2, 0, 0, 0], [0, 2, 0, 1], [0, 0, 2, 0], [0, 0, 0, 2], [2, 0, 0, 1], [0, 2, 0, 0]];

/**
 * llm.attention — attention weights of a short sentence as a heat map.
 * Click a row (query) to see its scores and weights; causal-mask toggle; scale slider c multiplies the scores.
 * params: tokens, Q, K (n×d_k), query (row index), causal, scale
 */
function Attention({ spec }: { spec: VizSpec }) {
  const tokens = (spec.tokens as string[]) ?? ATT_TOKENS;
  const Q = (spec.Q as number[][]) ?? ATT_Q;
  const K = (spec.K as number[][]) ?? ATT_K;
  const n = tokens.length, dk = Q[0].length;
  const [qi, setQi] = useState((spec.query as number) ?? 2);
  const [causal, setCausal] = useState(!!spec.causal);
  const [c, setC] = useState((spec.scale as number) ?? 1);
  const [view, setView] = useState<'weights' | 'scores'>('weights');
  const raw = useMemo(() => Q.map((q) => K.map((k) => q.reduce((s, x, i) => s + x * k[i], 0))), [Q, K]);
  const S = raw.map((r, i) => r.map((x, j) => (causal && j > i ? -Infinity : (c * x) / Math.sqrt(dk))));
  const A = S.map((r) => softmax(r));
  const dim: [number, number][] = [];
  if (causal) for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) dim.push([i, j]);
  const row = A[qi];
  const H = entropy(row);
  const lab = (t: string, i: number, on: boolean) => (
    <button className={'llm-tok' + (on ? ' on' : '')} onClick={() => setQi(i)} title={`query ${i}: ${t}`}>
      {t}
    </button>
  );
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={view} onChange={setView} options={[{ v: 'weights', label: 'weights A' }, { v: 'scores', label: 'scores S' }]} />
          <Toggle label="causal mask" value={causal} onChange={setCausal} />
          <Slider tex="c" value={c} min={0} max={4} step={0.05} onChange={setC} />
          <div className="muted small">
            Scores are <TeX>{R`S = c\,QK^{\top}/\sqrt{d_k}`}</TeX>, here <TeX>{`d_k = ${dk}`}</TeX>. Raising <TeX>c</TeX> is the same as lowering a temperature <TeX>{R`\tau = 1/c`}</TeX>.
          </div>
          <Readout
            title={`query “${tokens[qi]}”`}
            rows={[
              [R`\max_j A_{ij}`, f2(Math.max(...row), 3)],
              [R`H = -\sum_j A_{ij}\ln A_{ij}`, f2(H, 3) + ' nats'],
              [R`e^{H}\ \text{(effective keys)}`, f2(Math.exp(H), 2)],
            ]}
          />
          <div className="muted small">Click a token or a row to choose the query.</div>
        </>
      }
      below={
        <div className="llm-wrap">
          <table className="llm-tbl">
            <thead>
              <tr>
                <th>key</th>
                {tokens.map((t, j) => (
                  <th key={j}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <TeX>{R`\mathbf{q}_i\cdot\mathbf{k}_j`}</TeX>
                </td>
                {raw[qi].map((x, j) => (
                  <td key={j} className="mono">
                    {f2(x)}
                  </td>
                ))}
              </tr>
              <tr>
                <td>
                  <TeX>{R`S_{ij}`}</TeX>
                </td>
                {S[qi].map((x, j) => (
                  <td key={j} className="mono">
                    {f2(x)}
                  </td>
                ))}
              </tr>
              <tr className="on">
                <td>
                  <TeX>{R`A_{ij}`}</TeX>
                </td>
                {row.map((x, j) => (
                  <td key={j} className="mono">
                    {f2(x, 3)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      }
    >
      <div className="llm-attn">
        <MatGrid
          m={view === 'weights' ? A : S}
          fmt={(v) => f2(v, 2)}
          heat="seq"
          heatRange={view === 'weights' ? [0, 1.5] : undefined}
          rows={[qi]}
          dim={dim}
          rowLabels={tokens.map((t, i) => lab(t, i, i === qi))}
          colLabels={tokens}
          onCell={(i) => setQi(i)}
          cellSize={50}
          caption={view === 'weights' ? 'rows: queries, columns: keys; each row sums to 1' : 'scores before the softmax; masked entries are −∞'}
        />
      </div>
    </FigureLayout>
  );
}

// ---------------------------------------------------------------- llm.qk2d
/**
 * llm.qk2d — one query against three keys in the plane. Weights = softmax(q·k_j/√2);
 * output o = Σ w_j v_j lies inside the triangle of the values.
 * params: q, keys (3×2), values (3×2)
 */
function QK2D({ spec }: { spec: VizSpec }) {
  const [q, setQ] = useState<P2>((spec.q as P2) ?? [1, 0.5]);
  const [keys, setKeys] = useState<P2[]>((spec.keys as P2[]) ?? [[2, 0.5], [0.5, 2], [-1.5, -1]]);
  const values = (spec.values as P2[]) ?? [[2.5, -2], [-2.5, -2], [0, 2.6]];
  const [scaled, setScaled] = useState(true);
  const d = 2;
  const s = keys.map((k) => (q[0] * k[0] + q[1] * k[1]) / (scaled ? Math.sqrt(d) : 1));
  const w = softmax(s);
  const o: P2 = [w.reduce((a, x, j) => a + x * values[j][0], 0), w.reduce((a, x, j) => a + x * values[j][1], 0)];
  const cols = ['var(--c-u)', 'var(--c-k)', 'var(--c-j)'];
  return (
    <FigureLayout
      side={
        <>
          <Toggle label={<>divide by <TeX>{R`\sqrt{d_k}=\sqrt2`}</TeX></>} value={scaled} onChange={setScaled} />
          <Readout
            rows={[
              ...keys.map((_, j) => [`s_${j + 1} = \\mathbf{q}\\cdot\\mathbf{k}_${j + 1}${scaled ? '/\\sqrt2' : ''}`, f2(s[j])] as [string, string]),
              ...w.map((x, j) => [`w_${j + 1}`, f2(x, 3)] as [string, string]),
              [R`\mathbf{o} = \textstyle\sum_j w_j\mathbf{v}_j`, `(${f2(o[0])}, ${f2(o[1])})`],
              [R`\lVert\mathbf{q}\rVert`, f2(Math.hypot(q[0], q[1]))],
            ]}
          />
          <div className="muted small">Drag the query (orange) and the keys (arrows). The values are the fixed points at the triangle corners.</div>
        </>
      }
    >
      <Plane x={[-3.2, 3.2]} y={[-3.2, 3.2]} width={420}>
        <Poly pts={values} fill="var(--c-w)" fillOpacity={0.07} stroke="var(--c-w)" width={1} dashed />
        {values.map((v, j) => (
          <Point key={'v' + j} at={v} r={4} color="var(--c-w)" hollow tex={`\\mathbf{v}_${j + 1}`} />
        ))}
        {keys.map((k, j) => (
          <Arrow key={'k' + j} to={k} color={cols[j]} width={1.5 + 6 * w[j]} opacity={0.35 + 0.65 * w[j]} tex={`\\mathbf{k}_${j + 1}`} labelAt={0.75} />
        ))}
        <Arrow to={q} color="var(--c-v)" width={3} tex={R`\mathbf{q}`} />
        <Point at={o} r={6} color="var(--c-w)" tex={R`\mathbf{o}`} />
        {keys.map((k, j) => (
          <Handle key={'h' + j} at={k} color={cols[j]} snap={0.25} label={`key ${j + 1}`} onChange={(p) => setKeys(keys.map((x, i) => (i === j ? p : x)))} />
        ))}
        <Handle at={q} onChange={setQ} color="var(--c-v)" snap={0.25} label="query" />
      </Plane>
    </FigureLayout>
  );
}

// ---------------------------------------------------------------- llm.sqrtd
/**
 * llm.sqrtd — distribution of q·k for random q, k ~ N(0, I_d), with and without dividing by √d,
 * and how peaked a softmax over 16 such scores becomes.
 * params: logd (1..10), scaled
 */
function SqrtD({ spec }: { spec: VizSpec }) {
  const [logd, setLogd] = useState((spec.logd as number) ?? 6);
  const [scaled, setScaled] = useState(!!spec.scaled);
  const d = 2 ** logd;
  const data = useMemo(() => {
    const r = new Rng(7 + logd);
    const nq = 100, nk = 16;
    const dots: number[] = [];
    const maxw: number[] = [];
    const maxwS: number[] = [];
    for (let a = 0; a < nq; a++) {
      const q = Array.from({ length: d }, () => r.normal());
      const row: number[] = [];
      for (let b = 0; b < nk; b++) {
        let s = 0;
        for (let i = 0; i < d; i++) s += q[i] * r.normal();
        row.push(s);
        dots.push(s);
      }
      maxw.push(Math.max(...softmax(row)));
      maxwS.push(Math.max(...softmax(row.map((x) => x / Math.sqrt(d)))));
    }
    const mean = dots.reduce((x, y) => x + y, 0) / dots.length;
    const sd = Math.sqrt(dots.reduce((x, y) => x + (y - mean) ** 2, 0) / dots.length);
    const avg = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length;
    return { dots, sd, maxw: avg(maxw), maxwS: avg(maxwS) };
  }, [logd, d]);
  const vals = scaled ? data.dots.map((x) => x / Math.sqrt(d)) : data.dots;
  const W = 40, bw = 1;
  const nb = (2 * W) / bw;
  const hist = Array(nb).fill(0);
  for (const v of vals) {
    const b = Math.floor((v + W) / bw);
    if (b >= 0 && b < nb) hist[b]++;
  }
  const frac = hist.map((h) => h / vals.length);
  const sdShown = scaled ? data.sd / Math.sqrt(d) : data.sd;
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="d" value={logd} min={1} max={10} step={1} onChange={setLogd} fmt={(v) => String(2 ** v)} />
          <Toggle label={<>divide scores by <TeX>{R`\sqrt d`}</TeX></>} value={scaled} onChange={setScaled} />
          <Readout
            rows={[
              [R`\text{std of } \mathbf{q}\cdot\mathbf{k}`, f2(data.sd, 2)],
              [R`\sqrt d`, f2(Math.sqrt(d), 2)],
              [scaled ? R`\text{std of } \mathbf{q}\cdot\mathbf{k}/\sqrt d` : R`\text{std shown}`, f2(sdShown, 2)],
              [R`\text{mean max weight (16 keys)}`, f2(scaled ? data.maxwS : data.maxw, 3)],
            ]}
          />
          <div className="muted small">1600 scores: 100 random queries, each against 16 random keys, all entries drawn from N(0, 1). A max weight near 1 means the softmax is almost one-hot.</div>
        </>
      }
    >
      <LinePlot series={[{ pts: [[-W, 0], [W, 0]], color: 'transparent' }]} x={[-W, W]} y={[0, 0.45]} width={440} height={240} xlabel={scaled ? 'q·k / √d' : 'q·k'} ylabel="fraction">
        {(sx, sy) => (
          <g>
            {frac.map((f, b) =>
              f > 0 ? <rect key={b} x={sx(-W + b * bw) + 0.5} y={sy(Math.min(f, 0.45))} width={Math.max(1, sx(bw) - sx(0) - 1)} height={sy(0) - sy(Math.min(f, 0.45))} style={{ fill: scaled ? 'var(--c-w)' : 'var(--c-v)', opacity: 0.8 }} /> : null,
            )}
            {[-1, 1].map((k) => (
              <line key={k} x1={sx(k * sdShown)} x2={sx(k * sdShown)} y1={sy(0)} y2={sy(0.45)} style={{ stroke: 'var(--muted)', strokeDasharray: '4 4' }} />
            ))}
          </g>
        )}
      </LinePlot>
    </FigureLayout>
  );
}

// ---------------------------------------------------------------- llm.rope
const rot2 = (v: P2, t: number): P2 => [Math.cos(t) * v[0] - Math.sin(t) * v[1], Math.sin(t) * v[0] + Math.cos(t) * v[1]];
/**
 * llm.rope — one coordinate pair of a query at position m and a key at position n, each rotated by its position times θ.
 * Shifting both positions by the same amount leaves their dot product unchanged.
 * params: q, k, m, n, theta
 */
function Rope({ spec }: { spec: VizSpec }) {
  const [q, setQ] = useState<P2>((spec.q as P2) ?? [1.6, 0.4]);
  const [k, setK] = useState<P2>((spec.k as P2) ?? [1.4, -0.6]);
  const [m, setM] = useState((spec.m as number) ?? 3);
  const [n, setN] = useState((spec.n as number) ?? 1);
  const [th, setTh] = useState((spec.theta as number) ?? 0.3);
  const qm = rot2(q, m * th), kn = rot2(k, n * th);
  const dotR = qm[0] * kn[0] + qm[1] * kn[1];
  const rel = rot2(k, (n - m) * th);
  const dotRel = q[0] * rel[0] + q[1] * rel[1];
  const dot0 = q[0] * k[0] + q[1] * k[1];
  const arc = (v: P2, t: number, r: number): P2[] => {
    const a0 = Math.atan2(v[1], v[0]);
    return Array.from({ length: 25 }, (_, i) => [r * Math.cos(a0 + (t * i) / 24), r * Math.sin(a0 + (t * i) / 24)] as P2);
  };
  const shift = (s: number) => {
    if (m + s < 0 || n + s < 0 || m + s > 20 || n + s > 20) return;
    setM(m + s);
    setN(n + s);
  };
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="m" value={m} min={0} max={20} step={1} onChange={setM} />
          <Slider tex="n" value={n} min={0} max={20} step={1} onChange={setN} />
          <Slider tex={R`\theta`} value={th} min={0.05} max={1} step={0.05} onChange={setTh} />
          <div className="llm-row">
            <Btn onClick={() => shift(-1)}>both −1</Btn>
            <Btn onClick={() => shift(1)}>both +1</Btn>
          </div>
          <Readout
            rows={[
              ['m - n', String(m - n)],
              [R`\mathbf{q}\cdot\mathbf{k}\ \text{(no rotation)}`, f2(dot0, 3)],
              [R`(R_{m\theta}\mathbf{q})\cdot(R_{n\theta}\mathbf{k})`, f2(dotR, 3)],
              [R`\mathbf{q}^{\top}R_{(n-m)\theta}\,\mathbf{k}`, f2(dotRel, 3)],
            ]}
          />
          <div className="muted small">Faint arrows: the unrotated pair. Press “both +1” a few times: the rotated arrows turn, their dot product does not.</div>
        </>
      }
    >
      <Plane x={[-2.4, 2.4]} y={[-2.4, 2.4]} width={400}>
        <Arrow to={q} color="var(--c-v)" width={1.5} opacity={0.35} dashed />
        <Arrow to={k} color="var(--c-u)" width={1.5} opacity={0.35} dashed />
        <Path pts={arc(q, m * th, 0.55)} color="var(--c-v)" width={1.5} opacity={0.7} />
        <Path pts={arc(k, n * th, 0.8)} color="var(--c-u)" width={1.5} opacity={0.7} />
        <Arrow to={qm} color="var(--c-v)" tex={R`R_{m\theta}\mathbf{q}`} labelAt={0.95} />
        <Arrow to={kn} color="var(--c-u)" tex={R`R_{n\theta}\mathbf{k}`} labelAt={0.7} />
        <Handle at={q} onChange={setQ} color="var(--c-v)" snap={0.1} label="q (unrotated)" r={5} />
        <Handle at={k} onChange={setK} color="var(--c-u)" snap={0.1} label="k (unrotated)" r={5} />
      </Plane>
    </FigureLayout>
  );
}

// ---------------------------------------------------------------- llm.heads
/**
 * llm.heads — splitting Q (n × d) into h heads: the reshape (n, d) → (n, h, d_h) → (h, n, d_h).
 * params: d (8|12|16), h, n
 */
function Heads({ spec }: { spec: VizSpec }) {
  const [d, setD] = useState((spec.d as number) ?? 16);
  const [h, setH] = useState((spec.h as number) ?? 4);
  const [sel, setSel] = useState(0);
  const n = (spec.n as number) ?? 4;
  const divs = [1, 2, 4, 8, 3, 6, 12].filter((x) => d % x === 0 && x <= 8).sort((a, b) => a - b);
  const hh = divs.includes(h) ? h : divs[divs.length - 1];
  const dh = d / hh;
  const cs = 11; // cell size
  const W = 520;
  const qx = 20, qy = 34;
  const panelW = dh * cs;
  const gap = 10;
  const totalW = hh * panelW + (hh - 1) * gap;
  const px0 = Math.max(10, (W - totalW) / 2);
  const py = qy + n * cs + 56;
  const sh = Math.min(cs, 60 / n);
  const sy0 = py + n * cs + 40;
  const Ht = sy0 + n * sh + 30;
  const s = (i: number) => (i === sel % hh ? 1 : 0.35);
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={d} onChange={(v) => { setD(v); setSel(0); }} options={[8, 12, 16].map((x) => ({ v: x, label: `d=${x}` }))} />
          <SegControl value={hh} onChange={(v) => { setH(v); setSel(0); }} options={divs.map((x) => ({ v: x, label: `h=${x}` }))} />
          <Readout
            title="shapes (batch B)"
            rows={[
              [R`XW_Q`, `(B, ${n}, ${d})`],
              [R`\text{view}`, `(B, ${n}, ${hh}, ${dh})`],
              [R`\text{transpose}(1,2)`, `(B, ${hh}, ${n}, ${dh})`],
              [R`Q_hK_h^{\top}`, `(B, ${hh}, ${n}, ${n})`],
              [R`A_hV_h`, `(B, ${hh}, ${n}, ${dh})`],
              [R`\text{merge heads}`, `(B, ${n}, ${d})`],
              [R`\text{params } 4d^2`, String(4 * d * d)],
            ]}
          />
          <div className="muted small">Click a head to highlight its columns. The parameter count does not depend on h.</div>
        </>
      }
    >
      <svg viewBox={`0 0 ${W} ${Ht}`} className="llm-svg" style={{ maxWidth: W }}>
        <text x={qx} y={qy - 10}>
          Q = X W_Q, shape ({n}, {d}): columns grouped into {hh} head{hh > 1 ? 's' : ''} of d_h = {dh}
        </text>
        {Array.from({ length: n }, (_, i) =>
          Array.from({ length: d }, (_, j) => {
            const hd = Math.floor(j / dh);
            return <rect key={i + '-' + j} className="click" onClick={() => setSel(hd)} x={qx + j * cs} y={qy + i * cs} width={cs - 1} height={cs - 1} style={{ fill: PAL[hd], opacity: s(hd) }} />;
          }),
        )}
        <text x={qx} y={py - 12}>
          after view + transpose: {hh} separate ({n}, {dh}) matrices, one per head
        </text>
        {Array.from({ length: hh }, (_, hd) => (
          <g key={hd} className="click" onClick={() => setSel(hd)}>
            {Array.from({ length: n }, (_, i) =>
              Array.from({ length: dh }, (_, j) => <rect key={i + '-' + j} x={px0 + hd * (panelW + gap) + j * cs} y={py + i * cs} width={cs - 1} height={cs - 1} style={{ fill: PAL[hd], opacity: s(hd) }} />),
            )}
            <text x={px0 + hd * (panelW + gap) + panelW / 2} y={py + n * cs + 13} textAnchor="middle" className="m">
              head {hd + 1}
            </text>
          </g>
        ))}
        <text x={qx} y={sy0 - 10}>
          each head computes its own ({n}, {n}) attention pattern
        </text>
        {Array.from({ length: hh }, (_, hd) => {
          const x0 = px0 + hd * (panelW + gap) + (panelW - n * sh) / 2;
          return (
            <g key={'s' + hd} className="click" onClick={() => setSel(hd)}>
              {Array.from({ length: n }, (_, i) =>
                Array.from({ length: n }, (_, j) => <rect key={i + '-' + j} x={x0 + j * sh} y={sy0 + i * sh} width={sh - 1} height={sh - 1} style={{ fill: j <= i ? PAL[hd] : 'var(--surface2)', opacity: j <= i ? s(hd) * (0.4 + 0.6 * ((hd + i + j) % 3) / 2) : 1 }} />),
              )}
            </g>
          );
        })}
      </svg>
    </FigureLayout>
  );
}

// ---------------------------------------------------------------- llm.block
const BLOCK_STEPS: { title: string; eq: string; note: string; box: number }[] = [
  { title: 'residual stream in', eq: R`\mathbf{x} \in \R^{d}`, note: 'One vector per position. Every sublayer reads from it and adds back to it.', box: 0 },
  { title: 'normalize', eq: R`\mathbf{u} = \operatorname{RMSNorm}(\mathbf{x})`, note: 'Pre-norm: the sublayer sees a normalized copy; the stream itself is not normalized.', box: 1 },
  { title: 'attention', eq: R`\mathbf{a} = \operatorname{MHA}(\mathbf{u};\ \text{all earlier positions})`, note: 'The only step that mixes information across positions.', box: 2 },
  { title: 'add', eq: R`\mathbf{x} \leftarrow \mathbf{x} + \mathbf{a}`, note: 'Residual connection: the gradient reaches x through the identity path unchanged.', box: 3 },
  { title: 'normalize', eq: R`\mathbf{u} = \operatorname{RMSNorm}(\mathbf{x})`, note: 'A second, separate RMSNorm with its own gain vector.', box: 4 },
  { title: 'MLP (SwiGLU)', eq: R`\mathbf{m} = W_2\big(\operatorname{SiLU}(W_1\mathbf{u}) \odot W_3\mathbf{u}\big)`, note: 'Acts on each position independently. Holds about two thirds of the block’s parameters.', box: 5 },
  { title: 'add', eq: R`\mathbf{x} \leftarrow \mathbf{x} + \mathbf{m}`, note: 'The updated stream goes to the next block. After the last block: a final RMSNorm, then the unembedding to logits.', box: 6 },
];
/** llm.block — step through a pre-norm decoder block (RMSNorm → attention → add → RMSNorm → SwiGLU → add). */
function Block() {
  const { i, controls } = usePlayer(BLOCK_STEPS.length, { interval: 1300 });
  const st = BLOCK_STEPS[i];
  const W = 420, H = 380;
  const cx = 120;
  const boxes: { y: number; label: string; side?: boolean }[] = [
    { y: 350, label: 'x (in)' },
    { y: 285, label: 'RMSNorm', side: true },
    { y: 235, label: 'Multi-head attention', side: true },
    { y: 190, label: '+' },
    { y: 130, label: 'RMSNorm', side: true },
    { y: 80, label: 'SwiGLU MLP', side: true },
    { y: 30, label: '+' },
  ];
  const sideX = 270;
  return (
    <FigureLayout
      side={
        <>
          <div>
            <b>
              {i + 1}. {st.title}
            </b>
          </div>
          <TeX display>{st.eq}</TeX>
          <div className="small">{st.note}</div>
        </>
      }
      below={controls}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="llm-svg" style={{ maxWidth: W }}>
        <line x1={cx} x2={cx} y1={H - 10} y2={10} style={{ stroke: 'var(--c-u)', strokeWidth: 5, opacity: 0.5 }} />
        <text x={cx - 12} y={H - 60} textAnchor="end" className="m">
          residual stream
        </text>
        <text x={cx - 12} y={14} textAnchor="end" className="m">
          to next block ↑
        </text>
        {[[285, 190], [130, 30]].map(([y0, y1], k) => (
          <g key={k}>
            <path d={`M${cx},${y0 + 40} H${sideX} V${y0 + 14}`} style={{ stroke: 'var(--muted)', fill: 'none', strokeWidth: 1.5 }} />
            <path d={`M${sideX},${y0 - 64} V${y1} H${cx + 14}`} style={{ stroke: 'var(--muted)', fill: 'none', strokeWidth: 1.5 }} />
          </g>
        ))}
        {boxes.map((b, k) => {
          const on = k === st.box;
          const done = k < st.box;
          if (b.label === '+')
            return (
              <g key={k}>
                <circle cx={cx} cy={b.y} r={13} style={{ fill: on ? 'var(--accent-soft)' : 'var(--surface)', stroke: on ? 'var(--accent)' : 'var(--fg)', strokeWidth: on ? 3 : 1.5 }} />
                <text x={cx} y={b.y + 5} textAnchor="middle" style={{ fontSize: 16 }}>
                  +
                </text>
              </g>
            );
          const x = b.side ? sideX : cx;
          const w = b.side ? 170 : 90;
          return (
            <g key={k}>
              <rect x={x - w / 2} y={b.y - 14} width={w} height={28} rx={5} style={{ fill: on ? 'var(--accent-soft)' : 'var(--surface)', stroke: on ? 'var(--accent)' : done ? 'var(--fg)' : 'var(--line)', strokeWidth: on ? 3 : 1.5 }} />
              <text x={x} y={b.y + 4} textAnchor="middle" style={{ fontWeight: on ? 600 : 400 }}>
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </FigureLayout>
  );
}

// ---------------------------------------------------------------- llm.calc
/**
 * llm.calc — parameters, FLOPs and memory of a decoder-only transformer from its config.
 * params: L, h, dh, kv, V, logT, mlp ('gelu4'|'swiglu'), tied
 */
function Calc({ spec }: { spec: VizSpec }) {
  const [L, setL] = useState((spec.L as number) ?? 32);
  const [h, setH] = useState((spec.h as number) ?? 32);
  const [dh, setDh] = useState((spec.dh as number) ?? 128);
  const [kvIdx, setKvIdx] = useState<number>(-1);
  const [V, setV] = useState((spec.V as number) ?? 32000);
  const [logT, setLogT] = useState((spec.logT as number) ?? 12);
  const [mlp, setMlp] = useState<'gelu4' | 'swiglu'>((spec.mlp as 'gelu4' | 'swiglu') ?? 'swiglu');
  const [tied, setTied] = useState(!!spec.tied);
  const [B, setB] = useState(1);
  const divs = Array.from({ length: h }, (_, i) => i + 1).filter((x) => h % x === 0);
  const kvDefault = (spec.kv as number) ?? 8;
  const kv = kvIdx < 0 ? (divs.includes(kvDefault) ? kvDefault : h) : divs[Math.min(kvIdx, divs.length - 1)];
  const d = h * dh;
  const T = 2 ** logT;
  const dff = mlp === 'gelu4' ? 4 * d : Math.ceil((8 * d) / 3 / 256) * 256;
  const attn = 2 * d * d + 2 * d * kv * dh;
  const mlpP = mlp === 'gelu4' ? 2 * d * dff : 3 * d * dff;
  const layer = attn + mlpP + 2 * d;
  const emb = V * d * (tied ? 1 : 2);
  const N = L * layer + emb + d;
  const Nmat = L * (attn + mlpP) + V * d; // weights used in matmuls (input lookup excluded)
  const fwd = 2 * Nmat + 2 * L * T * d;
  const kvTok = 2 * L * kv * dh * 2;
  return (
    <FigureLayout
      side={
        <>
          <Slider label="layers L" value={L} min={1} max={128} step={1} onChange={setL} fmt={String} />
          <Slider label="heads h" value={h} min={1} max={128} step={1} onChange={(v) => { setH(v); setKvIdx(-1); }} fmt={String} />
          <SegControl label="d_head" value={dh} onChange={setDh} options={[64, 128].map((x) => ({ v: x, label: String(x) }))} />
          <Slider label="KV heads" value={divs.indexOf(kv)} min={0} max={divs.length - 1} step={1} onChange={setKvIdx} fmt={() => String(kv)} />
          <Slider label="vocab V" value={V} min={8000} max={256000} step={1000} onChange={setV} fmt={(v) => `${v / 1000}k`} />
          <Slider label="context T" value={logT} min={10} max={17} step={1} onChange={setLogT} fmt={(v) => `${2 ** (v - 10)}k`} />
          <Slider label="batch B" value={B} min={1} max={64} step={1} onChange={setB} fmt={String} />
          <SegControl value={mlp} onChange={setMlp} options={[{ v: 'gelu4', label: '4× MLP' }, { v: 'swiglu', label: 'SwiGLU' }]} />
          <Toggle label="tie input and output embeddings" value={tied} onChange={setTied} />
        </>
      }
      below={
        <div className="llm-grid2 llm-wide">
          <Readout
            title="parameters"
            rows={[
              [R`d = h\,d_h,\ \ d_{ff}`, `${d}, ${dff}`],
              [R`\text{attn: } 2d^2 + 2d\,n_{kv}d_h`, big(attn)],
              [mlp === 'gelu4' ? R`\text{MLP: } 2d\cdot 4d = 8d^2` : R`\text{MLP: } 3d\,d_{ff}`, big(mlpP)],
              [R`\text{per layer}`, big(layer)],
              [tied ? R`\text{embeddings: } Vd` : R`\text{embed + unembed: } 2Vd`, big(emb)],
              [R`N\ \text{total}`, big(N)],
              [R`12Ld^2\ \text{(rule of thumb)}`, big(12 * L * d * d)],
            ]}
          />
          <Readout
            title="compute"
            rows={[
              [R`\text{fwd / token} \approx 2N + 2LTd`, '$' + sci(fwd)],
              [R`\text{attention share } \tfrac{2LTd}{\text{fwd}}`, f2((100 * 2 * L * T * d) / fwd, 1) + '%'],
              [R`\text{train / token} \approx 6N`, '$' + sci(6 * Nmat)],
            ]}
          />
          <Readout
            title="memory (16-bit)"
            rows={[
              [R`\text{weights } 2N\ \text{bytes}`, bytes(2 * N)],
              [R`\text{KV / token } 2\cdot L\cdot n_{kv}\cdot d_h\cdot 2`, bytes(kvTok)],
              [R`\text{KV cache } \times\, T \times B`, bytes(kvTok * T * B)],
              [R`\text{naive scores / layer } B h T^2\cdot 2`, bytes(B * h * T * T * 2)],
            ]}
          />
        </div>
      }
    >
      <div className="llm-note">
        <p>
          <b>
            {big(N)} parameters, d = {d}, {h} query heads, {kv} KV head{kv > 1 ? 's' : ''} ({kv === h ? 'MHA' : kv === 1 ? 'MQA' : 'GQA'}).
          </b>
        </p>
        <Bars
          width={300}
          height={170}
          data={[
            { label: 'attn', value: (L * attn) / 1e9, color: 'var(--c-u)' },
            { label: 'MLP', value: (L * mlpP) / 1e9, color: 'var(--c-v)' },
            { label: 'embed', value: emb / 1e9, color: 'var(--c-w)' },
          ]}
          fmt={(v) => f2(v, 2) + 'B'}
          ylabel="params (B)"
        />
        <p className="muted small">
          All counts ignore biases. FLOPs count a multiply and an add as 2. <TeX>N</TeX> in the FLOP rows counts only weights used in matrix products (the input embedding is a lookup).
        </p>
      </div>
    </FigureLayout>
  );
}

// ---------------------------------------------------------------- llm.flash
/**
 * llm.flash — FlashAttention's online softmax for one query: process keys in tiles, keep a running max m,
 * a running normalizer l and an unnormalized output o; the result equals the exact softmax-weighted sum.
 * params: s (scores), v (scalar values), tile (2|4)
 */
function Flash({ spec }: { spec: VizSpec }) {
  const s = (spec.s as number[]) ?? [1, 3, 0, 2, 5, 1, 4, 2];
  const v = (spec.v as number[]) ?? [2, -1, 0, 3, 1, 4, -2, 1];
  const [tile, setTile] = useState((spec.tile as number) ?? 2);
  const nt = Math.ceil(s.length / tile);
  const { i, controls } = usePlayer(nt + 1, { interval: 1100 });
  const states = useMemo(() => {
    const out: { m: number; l: number; o: number; bm?: number; fac?: number }[] = [{ m: -Infinity, l: 0, o: 0 }];
    let m = -Infinity, l = 0, o = 0;
    for (let t = 0; t < nt; t++) {
      const js = Array.from({ length: tile }, (_, a) => t * tile + a).filter((j) => j < s.length);
      const bm = Math.max(...js.map((j) => s[j]));
      const mn = Math.max(m, bm);
      const fac = Number.isFinite(m) ? Math.exp(m - mn) : 0;
      l = l * fac + js.reduce((a, j) => a + Math.exp(s[j] - mn), 0);
      o = o * fac + js.reduce((a, j) => a + Math.exp(s[j] - mn) * v[j], 0);
      m = mn;
      out.push({ m, l, o, bm, fac });
    }
    return out;
  }, [s, v, tile, nt]);
  const st = states[i];
  const p = softmax(s);
  const exact = p.reduce((a, x, j) => a + x * v[j], 0);
  const seen = i * tile;
  const cw = 60;
  return (
    <FigureLayout
      side={
        <>
          <SegControl label="tile size" value={tile} onChange={setTile} options={[2, 4].map((x) => ({ v: x, label: String(x) }))} />
          <Readout
            title={i === 0 ? 'start' : `after tile ${i} of ${nt}`}
            rows={[
              ...(i > 0
                ? ([
                    [R`\text{tile max}`, f2(st.bm!, 3)],
                    [R`m_{\text{new}} = \max(m_{\text{old}}, \text{tile max})`, f2(st.m, 3)],
                    [R`\text{rescale } e^{m_{\text{old}} - m_{\text{new}}}`, f2(st.fac!, 4)],
                  ] as [string, string][])
                : []),
              [R`\ell = \sum_{\text{seen}} e^{s_j - m}`, f2(st.l, 4)],
              [R`o = \sum_{\text{seen}} e^{s_j - m}v_j`, f2(st.o, 4)],
              [R`o/\ell`, i > 0 ? f2(st.o / st.l, 4) : '·'],
              [R`\text{exact } \sum_j \operatorname{softmax}(\mathbf{s})_j v_j`, f2(exact, 4)],
            ]}
          />
        </>
      }
      below={controls}
    >
      <div className="llm-wrap">
        <svg viewBox={`0 0 ${s.length * cw + 80} 130`} className="llm-svg llm-big" style={{ maxWidth: s.length * cw + 80 }}>
          <text x={0} y={42}>scores s</text>
          <text x={0} y={82}>values v</text>
          {s.map((x, j) => {
            const t = Math.floor(j / tile);
            const cur = t === i - 1, done = j < seen;
            return (
              <g key={j}>
                <rect x={76 + j * cw} y={24} width={cw - 4} height={28} rx={3} style={{ fill: cur ? 'var(--accent-soft)' : 'var(--surface2)', stroke: cur ? 'var(--accent)' : done ? 'var(--fg)' : 'var(--line)', strokeWidth: cur ? 2.5 : 1 }} />
                <text x={76 + j * cw + (cw - 4) / 2} y={43} textAnchor="middle" className="mono">
                  {x}
                </text>
                <rect x={76 + j * cw} y={64} width={cw - 4} height={28} rx={3} style={{ fill: cur ? 'var(--accent-soft)' : 'var(--surface2)', stroke: cur ? 'var(--accent)' : done ? 'var(--fg)' : 'var(--line)', strokeWidth: cur ? 2.5 : 1 }} />
                <text x={76 + j * cw + (cw - 4) / 2} y={83} textAnchor="middle" className="mono">
                  {v[j]}
                </text>
                {j % tile === 0 && (
                  <text x={76 + j * cw} y={14} className="m">
                    tile {t + 1}
                  </text>
                )}
              </g>
            );
          })}
          <text x={0} y={120} className="m">
            {i === 0 ? 'Nothing read yet. Press Play or ›.' : i < nt ? `Only tile ${i} is in fast on-chip memory; earlier tiles survive as just (m, ℓ, o).` : 'All tiles processed: o/ℓ equals the exact result.'}
          </text>
        </svg>
      </div>
    </FigureLayout>
  );
}

const okTokensQK = (s: VizSpec) => {
  if (s.tokens && !Array.isArray(s.tokens)) return 'tokens must be an array';
  const n = (s.tokens as string[] | undefined)?.length ?? 6;
  if (s.Q && (!isMat(s.Q) || (s.Q as number[][]).length !== n)) return 'Q must be n×d';
  if (s.K && (!isMat(s.K) || (s.K as number[][]).length !== n)) return 'K must be n×d';
  if (s.query !== undefined && !((s.query as number) >= 0 && (s.query as number) < n)) return 'query out of range';
  return null;
};

export const attentionViz = {
  'llm.attention': { component: Attention, validate: okTokensQK, doc: 'Attention heat map of a short sentence; click a query row; causal toggle; scale slider. params tokens, Q, K, query, causal, scale' },
  'llm.qk2d': { component: QK2D, validate: (s: VizSpec) => (s.q && !isNumArr(s.q, 2) ? 'q must be [x, y]' : null), doc: 'One query vs three keys in 2-D; softmax weights and output in the hull of the values. params q, keys, values' },
  'llm.sqrtd': { component: SqrtD, validate: (s: VizSpec) => (s.logd !== undefined && !((s.logd as number) >= 1 && (s.logd as number) <= 10) ? 'logd in 1..10' : null), doc: 'Spread of random dot products vs dimension, with/without 1/√d. params logd, scaled' },
  'llm.rope': { component: Rope, doc: 'RoPE on one coordinate pair: rotate q by mθ and k by nθ; dot product depends on m−n only. params q, k, m, n, theta' },
  'llm.heads': { component: Heads, validate: (s: VizSpec) => (s.d !== undefined && ![8, 12, 16].includes(s.d as number) ? 'd must be 8, 12 or 16' : null), doc: 'Head split by reshape/transpose with the shapes table. params d, h, n' },
  'llm.block': { component: Block, doc: 'Step through a pre-norm decoder block with RMSNorm and SwiGLU.' },
  'llm.calc': { component: Calc, doc: 'Transformer calculator: params, FLOPs, KV cache from L, h, d_head, KV heads, vocab, context. params L, h, dh, kv, V, logT, mlp, tied' },
  'llm.flash': { component: Flash, validate: (s: VizSpec) => (s.s && s.v && (s.s as number[]).length !== (s.v as number[]).length ? 's and v must match' : null), doc: 'Online softmax over key tiles (the FlashAttention recurrence) vs the exact result. params s, v, tile' },
};

