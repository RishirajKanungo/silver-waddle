// Figures for the recommendation and search case studies: two-tower retrieval with an IVF index,
// position bias and feedback loops, and NDCG on a reorderable result list.
import { useMemo, useState, type KeyboardEvent } from 'react';
import type { VizSpec } from '../../content/types';
import { Plane, Handle, Point, Arrow, Heat, Label, Slider, Readout, FigureLayout, SegControl, Toggle, usePlayer, Btn, usePlane, type P2 } from '../kit';
import { Rng } from '../../math/rng';
import { fx, isNumArr } from './common';

// ------------------------------------------------------------------ sd.twotower

const NLIST = 6;
function makeItems() {
  const r = new Rng(21);
  const centers: P2[] = [[2, 0.6], [1.1, 2], [-1, 2.1], [-2.2, 0.2], [-0.9, -2], [1.4, -1.8]];
  const items: P2[] = [];
  centers.forEach((c) => {
    for (let k = 0; k < 8; k++) items.push([c[0] + 0.45 * r.normal(), c[1] + 0.45 * r.normal()]);
  });
  // IVF centroids: a few Lloyd iterations from the generating centres (deterministic)
  let C = centers.map((c) => [...c] as P2);
  const near = (p: P2) => C.reduce((b, c, k) => ((p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 < (p[0] - C[b][0]) ** 2 + (p[1] - C[b][1]) ** 2 ? k : b), 0);
  for (let it = 0; it < 5; it++) {
    const z = items.map(near);
    C = C.map((c, k) => {
      const m = items.filter((_, i) => z[i] === k);
      return m.length ? ([m.reduce((s, p) => s + p[0], 0) / m.length, m.reduce((s, p) => s + p[1], 0) / m.length] as P2) : c;
    });
  }
  const cell = items.map(near);
  return { items, C, cell, near };
}

/**
 * sd.twotower — a user embedding against item embeddings: exact top-k by dot product or cosine,
 * and an IVF approximate search that only scores items in the nprobe best clusters.
 */
function TwoTower({ spec }: { spec: VizSpec }) {
  const { items, C, cell, near } = useMemo(makeItems, []);
  const [u, setU] = useState<P2>((spec.u as P2) ?? [1.6, 1.2]);
  const [k, setK] = useState(5);
  const [metric, setMetric] = useState<'dot' | 'cos'>('dot');
  const [ann, setAnn] = useState(false);
  const [nprobe, setNprobe] = useState(1);
  const nu = Math.hypot(u[0], u[1]) || 1;
  const score = (v: P2) => {
    const d = u[0] * v[0] + u[1] * v[1];
    return metric === 'dot' ? d : d / (nu * (Math.hypot(v[0], v[1]) || 1));
  };
  const order = items.map((_, i) => i).sort((a, b) => score(items[b]) - score(items[a]) || a - b);
  const exact = order.slice(0, k);
  const cRank = C.map((_, c) => c).sort((a, b) => score(C[b]) - score(C[a]) || a - b);
  const probed = new Set(cRank.slice(0, nprobe));
  const cand = items.map((_, i) => i).filter((i) => probed.has(cell[i]));
  const annTop = [...cand].sort((a, b) => score(items[b]) - score(items[a]) || a - b).slice(0, k);
  const found = ann ? annTop : exact;
  const hits = annTop.filter((i) => exact.includes(i)).length;
  const heatF = useMemo(() => (x: number, y: number) => (probed.has(near([x, y])) ? 1 : 0), [nprobe, u[0], u[1], metric]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={metric} onChange={setMetric} options={[{ v: 'dot', label: 'dot product' }, { v: 'cos', label: 'cosine' }]} />
          <Slider tex="k" value={k} min={1} max={10} step={1} onChange={setK} fmt={(v) => String(v)} />
          <Toggle label="approximate search (IVF)" value={ann} onChange={setAnn} />
          {ann && <Slider label="nprobe" value={nprobe} min={1} max={NLIST} step={1} onChange={setNprobe} fmt={(v) => `${v} / ${NLIST}`} />}
          <Readout
            rows={[
              ['\\text{items}', String(items.length)],
              ['\\text{scores computed}', ann ? `${NLIST} + ${cand.length} = ${NLIST + cand.length}` : String(items.length)],
              ['\\text{recall@}k', ann ? `${hits}/${k} = ${fx(hits / k, 2)}` : '1 (exact)'],
              [`\\text{best score}`, fx(score(items[exact[0]]), 2)],
            ]}
          />
          <div className="sd-legend">
            <span><span className="sd-ring" />exact top-k</span>
            <span><span className="sd-sw" style={{ background: 'var(--c-v)' }} />returned</span>
            {ann && <span><span className="sd-sw" style={{ background: 'var(--accent)', opacity: 0.35 }} />probed cells</span>}
          </div>
          <div className="muted small">Drag the tip of the user vector.</div>
        </>
      }
    >
      <Plane x={[-3.5, 3.5]} y={[-3.5, 3.5]} width={400}>
        {ann && <Heat f={heatF} res={36} range={[0, 1]} scheme="seq" opacity={0.28} />}
        {ann && C.map((c, i) => <Label key={'c' + i} at={c} text="+" color="var(--fg)" />)}
        {items.map((v, i) => {
          const inCand = !ann || probed.has(cell[i]);
          return <Point key={'i' + i} at={v} r={found.includes(i) ? 5 : 3.5} color={found.includes(i) ? 'var(--c-v)' : inCand ? 'var(--c-u)' : 'var(--muted)'} />;
        })}
        <Rings pts={exact.map((i) => items[i])} />
        <Arrow to={u} color="var(--fg)" width={2.5} />
        <Handle at={u} onChange={setU} color="var(--fg)" snap={0.1} tex="\mathbf{u}" label="user vector" />
      </Plane>
    </FigureLayout>
  );
}

function Rings({ pts }: { pts: P2[] }) {
  const { sx, sy } = usePlane();
  return (
    <g>
      {pts.map((p, i) => (
        <circle key={i} cx={sx(p[0])} cy={sy(p[1])} r={9} style={{ fill: 'none', stroke: 'var(--c-w)', strokeWidth: 2.2 }} />
      ))}
    </g>
  );
}

// ------------------------------------------------------------------ sd.posbias

const PB_REL: Record<string, number> = { A: 0.3, B: 0.5, C: 0.2, D: 0.6, E: 0.4, F: 0.1 };
const PB_INIT = ['E', 'A', 'C', 'B', 'F', 'D'];

/**
 * sd.posbias — rounds of "show, observe clicks, re-rank" with naive click rates versus inverse propensity weighting.
 */
function PosBias({ spec }: { spec: VizSpec }) {
  const [beta, setBeta] = useState(typeof spec.beta === 'number' ? spec.beta : 1);
  const [est, setEst] = useState<'naive' | 'ips'>('naive');
  const R = 7;
  const exam = (pos: number) => (1 / (pos + 1)) ** beta;
  const rounds = useMemo(() => {
    let order = [...PB_INIT];
    const out: { order: string[]; ctr: number[]; e: number[] }[] = [];
    for (let t = 0; t < R; t++) {
      const ctr = order.map((it, p) => exam(p) * PB_REL[it]);
      const e = order.map((it, p) => (est === 'ips' ? ctr[p] / exam(p) : ctr[p]));
      out.push({ order, ctr, e });
      order = order.map((it, p) => ({ it, s: e[p], p })).sort((a, b) => b.s - a.s || a.p - b.p).map((x) => x.it);
    }
    return out;
  }, [beta, est]); // eslint-disable-line react-hooks/exhaustive-deps
  const { i, controls } = usePlayer(R, { interval: 1100 });
  const rd = rounds[i];
  const truth = Object.keys(PB_REL).sort((a, b) => PB_REL[b] - PB_REL[a]);
  let good = 0;
  for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) if (PB_REL[rd.order[a]] > PB_REL[rd.order[b]]) good++;
  const W = 520, rowH = 34, top = 30, H = top + 6 * rowH + 10;
  const bx = 150, bw = 220;
  return (
    <FigureLayout
      side={
        <>
          <SegControl value={est} onChange={setEst} options={[{ v: 'naive', label: 'naive CTR' }, { v: 'ips', label: 'IPS' }]} />
          <Slider tex="\beta" value={beta} min={0} max={1.5} step={0.25} onChange={setBeta} />
          <Readout
            rows={[
              ['P(\\text{examined}\\mid k) = k^{-\\beta}', ''],
              ['\\text{round}', `${i + 1} / ${R}`],
              ['\\text{pairs in true order}', `${good} / 15`],
              ['\\text{true order}', truth.join(' ')],
              ['\\text{shown order}', rd.order.join(' ')],
            ]}
          />
          <div className="sd-legend">
            <span><span className="sd-sw" style={{ background: 'var(--c-w)', opacity: 0.3, border: '1px solid var(--c-w)' }} />true relevance</span>
            <span><span className="sd-sw" style={{ background: 'var(--c-u)' }} />observed CTR</span>
            <span><span className="sd-sw" style={{ background: 'var(--c-v)' }} />estimate used to re-rank</span>
          </div>
        </>
      }
      below={controls}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="sd-svg" style={{ maxWidth: W }} role="img" aria-label="ranked list with click rates">
        <rect width={W} height={H} className="pl-bg" />
        <text x={8} y={18} className="sd-ts">position</text>
        <text x={62} y={18} className="sd-ts">item</text>
        <text x={100} y={18} className="sd-ts">P(exam)</text>
        <text x={bx} y={18} className="sd-ts">0</text>
        <text x={bx + bw} y={18} className="sd-ts" textAnchor="end">0.6</text>
        <text x={bx + bw + 12} y={18} className="sd-ts">CTR → estimate</text>
        {rd.order.map((it, p) => {
          const y = top + p * rowH;
          const s = (v: number) => (v / 0.6) * bw;
          return (
            <g key={it}>
              <text x={22} y={y + 19} textAnchor="middle" className="sd-t sd-num">{p + 1}</text>
              <text x={70} y={y + 19} textAnchor="middle" className="sd-tb">{it}</text>
              <text x={104} y={y + 19} className="sd-ts sd-num">{fx(exam(p), 2)}</text>
              <rect x={bx} y={y + 3} width={s(PB_REL[it])} height={24} rx={3} style={{ fill: 'var(--c-w)', fillOpacity: 0.18, stroke: 'var(--c-w)', strokeWidth: 1 }} />
              <rect x={bx} y={y + 7} width={s(rd.ctr[p])} height={7} rx={2} style={{ fill: 'var(--c-u)' }} />
              <rect x={bx} y={y + 16} width={s(Math.min(rd.e[p], 0.6))} height={7} rx={2} style={{ fill: 'var(--c-v)' }} />
              <text x={bx + bw + 12} y={y + 19} className="sd-ts sd-num">{fx(rd.ctr[p], 3)} → {fx(rd.e[p], 3)}</text>
            </g>
          );
        })}
      </svg>
    </FigureLayout>
  );
}

// ------------------------------------------------------------------ sd.ndcg

const ND_RELS = [2, 3, 0, 3, 1, 2];

/**
 * sd.ndcg — a ranked list with graded relevance; click two rows to swap them and watch DCG, NDCG, P@k, R@k.
 */
function Ndcg({ spec }: { spec: VizSpec }) {
  const init = isNumArr(spec.rels) ? (spec.rels as number[]) : ND_RELS;
  const docs = init.map((r, i) => ({ id: `d${i + 1}`, r }));
  const [list, setList] = useState(docs);
  const [pick, setPick] = useState<number | null>(null);
  const [k, setK] = useState(5);
  const [gain, setGain] = useState<'exp' | 'lin'>('exp');
  const g = (r: number) => (gain === 'exp' ? 2 ** r - 1 : r);
  const D = (i: number) => 1 / Math.log2(i + 2);
  const dcgOf = (rs: number[]) => rs.slice(0, k).reduce((s, r, i) => s + g(r) * D(i), 0);
  const dcg = dcgOf(list.map((d) => d.r));
  const idcg = dcgOf([...list.map((d) => d.r)].sort((a, b) => b - a));
  const relevant = (r: number) => r >= 2;
  const nRel = list.filter((d) => relevant(d.r)).length;
  const relTop = list.slice(0, k).filter((d) => relevant(d.r)).length;
  const first = list.findIndex((d) => relevant(d.r));
  const click = (p: number) => {
    if (pick === null) setPick(p);
    else {
      if (pick !== p) {
        const nl = [...list];
        [nl[pick], nl[p]] = [nl[p], nl[pick]];
        setList(nl);
      }
      setPick(null);
    }
  };
  const key = (p: number) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      click(p);
    }
  };
  const W = 520, rowH = 36, top = 26, H = top + list.length * rowH + 8;
  const maxG = gain === 'exp' ? 7 : 3;
  return (
    <FigureLayout
      side={
        <>
          <Slider tex="k" value={k} min={1} max={6} step={1} onChange={setK} fmt={(v) => String(v)} />
          <SegControl label="gain" value={gain} onChange={setGain} options={[{ v: 'exp', label: '2^r − 1' }, { v: 'lin', label: 'r' }]} />
          <Readout
            rows={[
              ['\\text{DCG@}k', fx(dcg, 3)],
              ['\\text{IDCG@}k', fx(idcg, 3)],
              ['\\text{NDCG@}k', fx(idcg ? dcg / idcg : 0, 3)],
              ['\\text{P@}k\\ (r \\ge 2)', `${relTop}/${k} = ${fx(relTop / k, 2)}`],
              ['\\text{R@}k\\ (r \\ge 2)', `${relTop}/${nRel} = ${fx(nRel ? relTop / nRel : 0, 2)}`],
              ['\\text{MRR}\\ (r \\ge 2)', first >= 0 ? `1/${first + 1} = ${fx(1 / (first + 1), 2)}` : '0'],
            ]}
          />
          <div className="sd-btns">
            <Btn onClick={() => { setList([...list].sort((a, b) => b.r - a.r || a.id.localeCompare(b.id))); setPick(null); }}>Ideal order</Btn>
            <Btn onClick={() => { setList(docs); setPick(null); }}>Reset</Btn>
          </div>
          <div className="muted small">{pick === null ? 'Click a row, then another row to swap them.' : `Swap position ${pick + 1} with which row?`}</div>
        </>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="sd-svg" style={{ maxWidth: W }} role="group" aria-label="ranked results">
        <rect width={W} height={H} className="pl-bg" />
        <text x={10} y={17} className="sd-ts">pos</text>
        <text x={50} y={17} className="sd-ts">doc</text>
        <text x={96} y={17} className="sd-ts">grade r</text>
        <text x={250} y={17} className="sd-ts">discount 1/log₂(i+1)</text>
        <text x={W - 12} y={17} className="sd-ts" textAnchor="end">gain × discount</text>
        {list.map((d, p) => {
          const y = top + p * rowH;
          const inK = p < k;
          return (
            <g key={d.id} className="sd-click" tabIndex={0} role="button" aria-label={`position ${p + 1}, ${d.id}, grade ${d.r}`} onClick={() => click(p)} onKeyDown={key(p)} style={{ opacity: inK ? 1 : 0.4 }}>
              <rect x={4} y={y} width={W - 8} height={rowH - 4} rx={6} className={'sd-box' + (pick === p ? ' on' : '')} />
              <text x={20} y={y + 21} textAnchor="middle" className="sd-t sd-num">{p + 1}</text>
              <text x={52} y={y + 21} className="sd-tb">{d.id}</text>
              {[0, 1, 2].map((t) => (
                <rect key={t} x={96 + t * 16} y={y + 9} width={13} height={14} rx={2} style={{ fill: t < d.r ? 'var(--c-w)' : 'var(--surface)', stroke: 'var(--c-w)', strokeWidth: 1 }} />
              ))}
              <text x={150} y={y + 21} className="sd-ts sd-num">{d.r}</text>
              <rect x={250} y={y + 10} width={90 * D(p)} height={12} rx={2} style={{ fill: 'var(--c-u)', opacity: 0.7 }} />
              <text x={346} y={y + 21} className="sd-ts sd-num">{fx(D(p), 3)}</text>
              <rect x={400} y={y + 10} width={inK ? (90 * g(d.r) * D(p)) / maxG : 0} height={12} rx={2} style={{ fill: 'var(--c-v)' }} />
              <text x={W - 12} y={y + 21} textAnchor="end" className="sd-ts sd-num">{inK ? fx(g(d.r) * D(p), 2) : '—'}</text>
            </g>
          );
        })}
      </svg>
    </FigureLayout>
  );
}

export const recsysViz = {
  'sd.twotower': { component: TwoTower, doc: 'User vs item embeddings: exact top-k by dot/cosine and IVF approximate search with nprobe; recall@k. params u', validate: (s: VizSpec) => (s.u !== undefined && !isNumArr(s.u, 2) ? 'u must be [x, y]' : null) },
  'sd.posbias': { component: PosBias, doc: 'Feedback loop from position bias: rounds of re-ranking by naive CTR vs IPS. params beta', validate: (s: VizSpec) => (s.beta !== undefined && typeof s.beta !== 'number' ? 'beta must be a number' : null) },
  'sd.ndcg': { component: Ndcg, doc: 'Reorderable ranked list with graded relevance: DCG, NDCG@k, P@k, R@k, MRR. params rels (6 grades 0-3)', validate: (s: VizSpec) => (s.rels !== undefined && !(isNumArr(s.rels, 6) && (s.rels as number[]).every((r) => r >= 0 && r <= 3)) ? 'rels must be 6 grades in 0..3' : null) },
};
