import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Slider, Readout, FigureLayout, SegControl, usePlayer, TeX, colorMap } from '../kit';
import { fmt } from './util';
import './dl.css';

// ------------------------------------------------------------------ dl.conv2d

const KERNELS: Record<string, { k: number[][]; label: string }> = {
  vedge: { k: [[1, 0, -1], [1, 0, -1], [1, 0, -1]], label: 'vertical edge' },
  hedge: { k: [[1, 1, 1], [0, 0, 0], [-1, -1, -1]], label: 'horizontal edge' },
  sobel: { k: [[1, 0, -1], [2, 0, -2], [1, 0, -1]], label: 'Sobel x' },
  blur: { k: [[1, 1, 1], [1, 1, 1], [1, 1, 1]].map((r) => r.map((v) => v / 9)), label: 'box blur' },
  sharpen: { k: [[0, -1, 0], [-1, 5, -1], [0, -1, 0]], label: 'sharpen' },
  laplace: { k: [[0, 1, 0], [1, -4, 1], [0, 1, 0]], label: 'Laplacian' },
};
const IMAGES: Record<string, number[][]> = {
  square: Array.from({ length: 7 }, (_, i) => Array.from({ length: 7 }, (_, j) => (i >= 2 && i <= 4 && j >= 2 && j <= 4 ? 1 : 0))),
  step: Array.from({ length: 7 }, () => Array.from({ length: 7 }, (_, j) => (j >= 4 ? 1 : 0))),
  cross: Array.from({ length: 7 }, (_, i) => Array.from({ length: 7 }, (_, j) => (i === 3 || j === 3 ? 1 : 0))),
  diag: Array.from({ length: 7 }, (_, i) => Array.from({ length: 7 }, (_, j) => (j >= i ? 1 : 0))),
};

function Grid({ M, x0, y0, cell, hl, fmtv, heat, range, dimPad, label }: { M: number[][]; x0: number; y0: number; cell: number; hl?: [number, number, number, number]; fmtv: (v: number) => string; heat?: boolean; range?: number; dimPad?: number; label?: string }) {
  const n = M.length, m = M[0]?.length ?? 0;
  return (
    <g>
      {label && (
        <text x={x0} y={y0 - 8} className="dl-gname">
          {label}
        </text>
      )}
      {M.map((row, i) =>
        row.map((v, j) => {
          const pad = dimPad !== undefined && (i < dimPad || j < dimPad || i >= n - dimPad || j >= m - dimPad);
          const fill = Number.isNaN(v) ? 'var(--surface)' : heat ? colorMap(0.5 + v / (2 * (range || 1)), 'div') : v > 0 ? `color-mix(in oklab, var(--fg) ${Math.round(Math.min(1, v) * 70)}%, var(--surface))` : 'var(--surface)';
          return (
            <g key={i + '-' + j}>
              <rect x={x0 + j * cell} y={y0 + i * cell} width={cell} height={cell} className={'dl-cell' + (pad ? ' pad' : '')} style={{ fill }} />
              {!Number.isNaN(v) && (
                <text x={x0 + j * cell + cell / 2} y={y0 + i * cell + cell / 2 + 4} textAnchor="middle" className={'dl-cellt' + (!heat && v > 0.5 ? ' inv' : '')}>
                  {fmtv(v)}
                </text>
              )}
            </g>
          );
        }),
      )}
      {hl && <rect x={x0 + hl[1] * cell} y={y0 + hl[0] * cell} width={hl[3] * cell} height={hl[2] * cell} className="dl-win" />}
    </g>
  );
}

/**
 * dl.conv2d — a 3×3 kernel slides over a 7×7 image; step through the positions and watch the feature map fill in.
 * params: image ('square'|'step'|'cross'|'diag'), kernel ('vedge'|'hedge'|'sobel'|'blur'|'sharpen'|'laplace'), pad (0|1), stride (1|2)
 */
function Conv2D({ spec }: { spec: VizSpec }) {
  const [img, setImg] = useState((spec.image as string) ?? 'step');
  const [ker, setKer] = useState((spec.kernel as string) ?? 'vedge');
  const [pad, setPad] = useState<number>((spec.pad as number) ?? 0);
  const [stride, setStride] = useState<number>((spec.stride as number) ?? 1);
  const X = IMAGES[img] ?? IMAGES.step;
  const K = KERNELS[ker]?.k ?? KERNELS.vedge.k;
  const n = X.length, k = 3;
  const P = useMemo(() => Array.from({ length: n + 2 * pad }, (_, i) => Array.from({ length: n + 2 * pad }, (_, j) => (i < pad || j < pad || i >= n + pad || j >= n + pad ? 0 : X[i - pad][j - pad]))), [X, pad, n]);
  const m = Math.floor((n + 2 * pad - k) / stride) + 1;
  const Y = useMemo(() => Array.from({ length: m }, (_, r) => Array.from({ length: m }, (_, c) => {
    let s = 0;
    for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) s += K[a][b] * P[r * stride + a][c * stride + b];
    return s;
  })), [P, K, m, stride]);
  const { i, controls } = usePlayer(m * m + 1, { interval: 450 });
  const done = i >= m * m;
  const r = done ? m - 1 : Math.floor(i / m), c = done ? m - 1 : i % m;
  const shown = Y.map((row, a) => row.map((v, b) => (done || a * m + b <= i ? v : NaN)));
  const range = Math.max(1e-9, ...Y.flat().map(Math.abs));
  const fk = (v: number) => (Number.isInteger(v) ? String(v) : fmt(v, 2));
  const terms: string[] = [];
  for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) {
    const kv = K[a][b], xv = P[r * stride + a][c * stride + b];
    if (kv !== 0 && xv !== 0) terms.push(`${fk(kv)}\\cdot${fk(xv)}`);
  }
  const cell = 26;
  const inX = 10, inY = 26, kerX = inX + (n + 2 * pad) * cell + 26, outX = kerX + 3 * 30 + 30;
  const W = outX + m * cell + 10;
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={img} onChange={setImg} options={Object.keys(IMAGES).map((v) => ({ v, label: v }))} />
          <SegControl value={ker} onChange={setKer} options={Object.entries(KERNELS).map(([v, o]) => ({ v, label: o.label }))} />
          <SegControl label="padding" value={pad} onChange={setPad} options={[0, 1].map((v) => ({ v, label: String(v) }))} />
          <SegControl label="stride" value={stride} onChange={setStride} options={[1, 2].map((v) => ({ v, label: String(v) }))} />
          <Readout
            rows={[
              ['n,\\ k,\\ p,\\ s', `${n}, 3, ${pad}, ${stride}`],
              ['n_{\\text{out}} = \\lfloor (n+2p-k)/s\\rfloor + 1', String(m)],
              [`Y_{${r},${c}}`, fk(Y[r][c])],
            ]}
          />
        </>
      }
      below={
        <div className="dl-full">
          {controls}
          <div className="dl-steptex">
            <TeX>{`Y_{${r},${c}} = \\sum_{a,b} K_{ab}\\,X_{${r * stride - pad}+a,\\,${c * stride - pad}+b} = ${terms.length ? terms.join(' + ').replace(/\+ -/g, '- ') : '0'} = ${fk(Y[r][c])}`}</TeX>
          </div>
        </div>
      }
    >
      <svg viewBox={`0 0 ${W} ${inY + (n + 2 * pad) * cell + 8}`} className="dl-graph" style={{ maxWidth: W }}>
        <Grid M={P} x0={inX} y0={inY} cell={cell} fmtv={(v) => String(v)} hl={[r * stride, c * stride, 3, 3]} dimPad={pad || undefined} label={pad ? 'input (zero-padded)' : 'input X'} />
        <Grid M={K} x0={kerX} y0={inY} cell={30} fmtv={fk} heat range={Math.max(...K.flat().map(Math.abs))} label="kernel K" />
        <text x={kerX + 45} y={inY + 3 * 30 + 24} textAnchor="middle" className="dl-tick">
          multiply and add
        </text>
        <Grid M={shown} x0={outX} y0={inY} cell={cell} fmtv={fk} heat range={range} hl={[r, c, 1, 1]} label="feature map Y" />
      </svg>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ dl.convshape

/**
 * dl.convshape — a 1-D slice through a convolution: input cells (with padding), the kernel taps of each output,
 * the output-size formula, and parameter counts of a 2-D conv layer versus a dense layer on the same tensors.
 * params: n, k, p, s, d, cin, cout
 */
function ConvShape({ spec }: { spec: VizSpec }) {
  const [n, setN] = useState((spec.n as number) ?? 9);
  const [k, setK] = useState((spec.k as number) ?? 3);
  const [p, setP] = useState((spec.p as number) ?? 0);
  const [s, setS] = useState((spec.s as number) ?? 1);
  const [d, setD] = useState((spec.d as number) ?? 1);
  const [cin, setCin] = useState((spec.cin as number) ?? 3);
  const [cout, setCout] = useState((spec.cout as number) ?? 16);
  const [sel, setSel] = useState(0);
  const keff = d * (k - 1) + 1;
  const m = Math.floor((n + 2 * p - keff) / s) + 1;
  const total = n + 2 * p;
  const cw = Math.min(34, 470 / Math.max(total, 1));
  const x0 = (500 - total * cw) / 2;
  const outW = Math.min(34, 470 / Math.max(m, 1));
  const ox0 = (500 - Math.max(m, 0) * outW) / 2;
  const j = Math.min(sel, Math.max(0, m - 1));
  const taps = (o: number) => Array.from({ length: k }, (_, t) => o * s + t * d);
  const convParams = k * k * cin * cout + cout;
  const denseParams = n * n * cin * (Math.max(m, 0) * Math.max(m, 0) * cout) + Math.max(m, 0) * Math.max(m, 0) * cout;
  const big = (v: number) => v.toLocaleString('en-US');
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="n\ (\text{input})" value={n} min={4} max={16} step={1} onChange={setN} fmt={(v) => String(v)} />
          <Slider tex="k\ (\text{kernel})" value={k} min={1} max={7} step={1} onChange={setK} fmt={(v) => String(v)} />
          <Slider tex="p\ (\text{padding})" value={p} min={0} max={3} step={1} onChange={setP} fmt={(v) => String(v)} />
          <Slider tex="s\ (\text{stride})" value={s} min={1} max={3} step={1} onChange={setS} fmt={(v) => String(v)} />
          <Slider tex="d\ (\text{dilation})" value={d} min={1} max={3} step={1} onChange={setD} fmt={(v) => String(v)} />
          <Readout
            rows={[
              ['n_{\\text{out}} = \\left\\lfloor\\frac{n + 2p - d(k-1) - 1}{s}\\right\\rfloor + 1', m > 0 ? String(m) : 'none'],
            ]}
          />
          <Slider tex="C_{\text{in}}" value={cin} min={1} max={64} step={1} onChange={setCin} fmt={(v) => String(v)} />
          <Slider tex="C_{\text{out}}" value={cout} min={1} max={128} step={1} onChange={setCout} fmt={(v) => String(v)} />
          <Readout
            rows={[
              ['\\text{conv: } k^2C_{\\text{in}}C_{\\text{out}} + C_{\\text{out}}', big(convParams)],
              ['\\text{dense, same shapes}', m > 0 ? big(denseParams) : '–'],
            ]}
          />
        </>
      }
    >
      <svg viewBox="0 0 500 230" className="dl-graph" style={{ maxWidth: 500 }}>
        <text x={6} y={22} className="dl-gname">
          input: {n} cells{p ? ` + ${p} zero padding on each side` : ''}
        </text>
        {Array.from({ length: total }, (_, i) => {
          const isPad = i < p || i >= n + p;
          const used = m > 0 && taps(j).includes(i);
          return (
            <g key={i}>
              <rect x={x0 + i * cw} y={36} width={cw - 2} height={cw - 2} className={'dl-cell1' + (isPad ? ' pad' : '') + (used ? ' on' : '')} />
              {cw > 16 && (
                <text x={x0 + i * cw + cw / 2 - 1} y={36 + cw / 2 + 3} textAnchor="middle" className="dl-tick">
                  {isPad ? '0' : String(i - p)}
                </text>
              )}
            </g>
          );
        })}
        {m > 0 &&
          Array.from({ length: m }, (_, o) =>
            taps(o).map((t) => (
              <line key={o + '-' + t} x1={x0 + t * cw + cw / 2 - 1} y1={36 + cw} x2={ox0 + o * outW + outW / 2 - 1} y2={170} className={'dl-tap' + (o === j ? ' on' : '')} />
            )),
          )}
        {m > 0 &&
          Array.from({ length: m }, (_, o) => (
            <g key={o} onClick={() => setSel(o)} style={{ cursor: 'pointer' }}>
              <rect x={ox0 + o * outW} y={170} width={outW - 2} height={Math.min(outW - 2, 30)} className={'dl-cell1 out' + (o === j ? ' on' : '')} />
              {outW > 16 && (
                <text x={ox0 + o * outW + outW / 2 - 1} y={170 + Math.min(outW - 2, 30) / 2 + 4} textAnchor="middle" className="dl-tick">
                  {o}
                </text>
              )}
            </g>
          ))}
        <text x={6} y={222} className="dl-gname">
          {m > 0 ? `output: ${m} cells (click one to see its ${k} taps)` : 'kernel larger than the padded input: no output'}
        </text>
      </svg>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ dl.receptive

/**
 * dl.receptive — a 1-D stack of L convolution layers (kernel k, stride s, no padding). Click a unit in the top layer to
 * highlight everything it depends on, down to the input. r_L = 1 + (k − 1)(1 + s + … + s^{L−1}).
 * params: L, k, s
 */
function Receptive({ spec }: { spec: VizSpec }) {
  const [L, setL] = useState((spec.L as number) ?? 3);
  const [k, setK] = useState((spec.k as number) ?? 3);
  const [s, setS] = useState((spec.s as number) ?? 1);
  const [sel, setSel] = useState(1);
  const top = 3;
  const sizes = useMemo(() => {
    let jump = 1, rf = 1;
    for (let l = 0; l < L; l++) {
      rf += (k - 1) * jump;
      jump *= s;
    }
    const n0 = rf + (top - 1) * jump;
    const out = [n0];
    for (let l = 0; l < L; l++) out.push(Math.floor((out[l] - k) / s) + 1);
    return { out, rf, jump };
  }, [L, k, s]);
  const j = Math.min(sel, sizes.out[L] - 1);
  // receptive set per layer (indices), going down
  const sets: Set<number>[] = Array.from({ length: L + 1 }, () => new Set<number>());
  sets[L].add(j);
  for (let l = L; l > 0; l--) for (const u of sets[l]) for (let t = 0; t < k; t++) sets[l - 1].add(u * s + t);
  const W = 500, rowH = 200 / Math.max(L, 1);
  const cw = Math.min(30, (W - 30) / sizes.out[0]);
  const left = (W - (sizes.out[0] - 1) * cw) / 2;
  const rfAt = (l: number) => {
    let r = 1;
    for (let i = 0; i < l; i++) r += (k - 1) * Math.pow(s, i);
    return r;
  };
  /** unit i of layer l sits above the centre of the input positions it sees */
  const pos = (l: number, i: number) => [left + (i * Math.pow(s, l) + (rfAt(l) - 1) / 2) * cw, 225 - l * rowH] as [number, number];
  const r0 = Math.max(1.6, Math.min(7, cw * 0.32));
  return (
    <FigureLayout
      side={
        <>
          <Slider label="layers L" value={L} min={1} max={4} step={1} onChange={setL} fmt={(v) => String(v)} />
          <Slider label="kernel k" value={k} min={2} max={5} step={1} onChange={setK} fmt={(v) => String(v)} />
          <Slider label="stride s" value={s} min={1} max={2} step={1} onChange={setS} fmt={(v) => String(v)} />
          <Readout
            rows={[
              ['r_L = 1 + (k-1)\\textstyle\\sum_{l=0}^{L-1} s^l', String(sizes.rf)],
              ['\\text{input positions drawn}', String(sizes.out[0])],
            ]}
          />
          <div className="small">
            Click a unit in the top layer. With stride 1 each layer adds <TeX>{'k-1'}</TeX> positions; with stride 2 each layer's additions are multiplied by the product of the strides below it.
          </div>
        </>
      }
    >
      <svg viewBox={`0 0 ${W} 245`} className="dl-graph" style={{ maxWidth: W }}>
        {sizes.out.map((N, l) =>
          l === 0
            ? null
            : Array.from({ length: N }, (_, i) =>
                Array.from({ length: k }, (_, t) => {
                  const a = pos(l, i), b = pos(l - 1, i * s + t);
                  const on = sets[l].has(i);
                  return <line key={`${l}-${i}-${t}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className={'dl-tap' + (on ? ' on' : '')} />;
                }),
              ),
        )}
        {sizes.out.map((N, l) =>
          Array.from({ length: N }, (_, i) => {
            const [x, y] = pos(l, i);
            const on = sets[l].has(i);
            return <circle key={`${l}-${i}`} cx={x} cy={y} r={l === L ? 8 : r0} className={'dl-rf' + (on ? ' on' : '') + (l === L ? ' top' : '')} onClick={l === L ? () => setSel(i) : undefined} style={l === L ? { cursor: 'pointer' } : undefined} />;
          }),
        )}
        {sizes.out.map((_, l) => (
          <text key={l} x={4} y={pos(l, 0)[1] - 10} className="dl-tick">
            {l === 0 ? 'input' : `layer ${l}`}
          </text>
        ))}
        <text x={W - 6} y={14} textAnchor="end" className="dl-tick">
          highlighted input positions: {sets[0].size}
        </text>
      </svg>
    </FigureLayout>
  );
}

export const convViz = {
  'dl.conv2d': {
    component: Conv2D,
    validate: (s: VizSpec) => (s.kernel !== undefined && !KERNELS[s.kernel as string] ? 'unknown kernel' : s.image !== undefined && !IMAGES[s.image as string] ? 'unknown image' : null),
    doc: "3×3 kernel sliding over a 7×7 image. params image ('square'|'step'|'cross'|'diag'), kernel ('vedge'|'hedge'|'sobel'|'blur'|'sharpen'|'laplace'), pad (0|1), stride (1|2)",
  },
  'dl.convshape': {
    component: ConvShape,
    validate: () => null,
    doc: 'Output-size formula on a 1-D slice, with padding, stride, dilation; conv vs dense parameter counts. params n, k, p, s, d, cin, cout',
  },
  'dl.receptive': {
    component: Receptive,
    validate: (s: VizSpec) => ((s.L as number) > 4 ? 'L ≤ 4' : null),
    doc: 'Receptive field of a 1-D conv stack; click a top unit. params L, k, s',
  },
};
