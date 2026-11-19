// math.probLoot: weighted random selection and streaks.
// 'loot': edit a drop table, roll it 1/100/10000 times, compare the histogram with the expected
//   shares, and see the chance of at least one rare drop in N kills.
// 'streak': crits with a nominal chance p, rolled independently, with a pity limit, or with a
//   pseudo-random distribution (PRD); compare gaps between crits and the longest drought.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { FigureLayout, Readout, Slider, SegControl } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { Rng } from '../../math/rng';

interface Row {
  name: string;
  weight: number;
  gold: number;
}
const DEFAULT_TABLE: Row[] = [
  { name: 'nothing', weight: 50, gold: 0 },
  { name: 'slime jelly', weight: 30, gold: 5 },
  { name: 'potion', weight: 15, gold: 20 },
  { name: 'ether', weight: 4, gold: 60 },
  { name: 'fire shard', weight: 1, gold: 400 },
];

/** Pick an index with probability weight / total, using cumulative weights. */
export function weightedPick(weights: number[], r01: number) {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = r01 * total;
  for (let i = 0; i < weights.length; i++) {
    if (roll < weights[i]) return i;
    roll -= weights[i];
  }
  return weights.length - 1;
}

/** The PRD constant C whose long-run rate is p (chance after n misses in a row is C·(n+1)). */
export function prdC(p: number) {
  const rate = (c: number) => {
    let e = 0, survive = 1;
    for (let n = 1; n <= 1000; n++) {
      const q = Math.min(1, c * n);
      e += n * survive * q;
      survive *= 1 - q;
      if (survive < 1e-12) break;
    }
    return 1 / e;
  };
  let lo = 0, hi = p;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (rate(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function LootLab({ spec }: { spec: VizSpec }) {
  const mode = (spec.mode as 'loot' | 'streak') ?? 'loot';
  return mode === 'streak' ? <Streaks /> : <Loot />;
}

function Loot() {
  const [rows, setRows] = useState<Row[]>(DEFAULT_TABLE);
  const [counts, setCounts] = useState<number[]>(() => DEFAULT_TABLE.map(() => 0));
  const [last, setLast] = useState<{ r: number; i: number } | null>(null);
  const [n, setN] = useState(50);
  const rng = useRef(new Rng(7));
  const weights = rows.map((r) => Math.max(0, r.weight));
  const total = weights.reduce((a, b) => a + b, 0);
  const rolls = counts.reduce((a, b) => a + b, 0);

  const roll = (k: number) => {
    const c = [...counts];
    let lastR = 0, lastI = 0;
    for (let j = 0; j < k; j++) {
      const r01 = rng.current.next();
      lastI = weightedPick(weights, r01);
      lastR = r01 * total;
      c[lastI]++;
    }
    setCounts(c);
    setLast({ r: lastR, i: lastI });
  };
  const edit = (i: number, w: number) => {
    setRows(rows.map((r, k) => (k === i ? { ...r, weight: w } : r)));
    setCounts(rows.map(() => 0));
    setLast(null);
  };
  const ev = rows.reduce((a, r, i) => a + (weights[i] / (total || 1)) * r.gold, 0);
  const rare = rows.length - 1;
  const pRare = weights[rare] / (total || 1);
  const atLeast = 1 - Math.pow(1 - pRare, n);
  const n90 = pRare > 0 && pRare < 1 ? Math.ceil(Math.log(0.1) / Math.log(1 - pRare)) : pRare >= 1 ? 1 : Infinity;

  // stacked cumulative bar
  const BW = 480;
  let acc = 0;
  const cols = ['var(--c-u)', 'var(--c-v)', 'var(--c-w)', 'var(--violet)', 'var(--c-err)'];
  const segs = weights.map((w, i) => {
    const s = { x: (acc / (total || 1)) * BW, w: (w / (total || 1)) * BW, from: acc, to: acc + w, i };
    acc += w;
    return s;
  });
  const maxShare = Math.max(0.05, ...weights.map((w) => w / (total || 1)), ...counts.map((c) => (rolls ? c / rolls : 0)));
  const HH = 150;

  const code = `## Weighted pick: roll in [0, total) and walk the cumulative weights.
func pick(table: Array[Dictionary], rng: RandomNumberGenerator) -> Dictionary:
	var total := 0.0
	for entry in table:
		total += entry.weight  # total = ${total}
	var roll := rng.randf() * total${last ? `  # last roll: ${last.r.toFixed(2)}` : ''}
	for entry in table:
		if roll < entry.weight:
			return entry
		roll -= entry.weight
	return table.back()

# table = [${rows.map((r) => `{"name": "${r.name}", "weight": ${r.weight}}`).join(', ')}]`;

  return (
    <FigureLayout
      side={
        <>
          <div className="geom-loot-edit">
            {rows.map((r, i) => (
              <label key={r.name}>
                <span style={{ color: cols[i % cols.length] }}>{r.name}</span>
                <input type="number" min={0} max={1000} value={r.weight} onChange={(e) => edit(i, Math.max(0, Math.min(1000, parseFloat(e.target.value) || 0)))} aria-label={`${r.name} weight`} />
                <span className="geom-share">{((weights[i] / (total || 1)) * 100).toFixed(1)}%</span>
              </label>
            ))}
          </div>
          <div className="geom-btns">
            <button onClick={() => roll(1)}>Roll 1</button>
            <button onClick={() => roll(100)}>Roll 100</button>
            <button onClick={() => roll(10000)}>Roll 10 000</button>
            <button onClick={() => { setCounts(rows.map(() => 0)); setLast(null); }}>Reset</button>
          </div>
          <Slider label="kills N" value={n} min={1} max={500} step={1} onChange={setN} fmt={(v) => v.toFixed(0)} />
          <Readout
            rows={[
              ['\\text{rolls}', `${rolls}`],
              ['\\E[\\text{gold}] = \\sum p_i g_i', `${ev.toFixed(2)}`],
              [`P(\\ge 1 \\text{ shard in } ${n})`, `${(atLeast * 100).toFixed(1)}%`],
              ['N \\text{ for } 90\\%', n90 === Infinity ? 'never' : `${n90}`],
            ]}
          />
        </>
      }
      below={<CodeBlock code={code} file="scripts/loot_table.gd" compact />}
    >
      <svg viewBox={`0 0 ${BW + 20} ${HH + 90}`} className="geom-svg" role="img" aria-label="drop table: cumulative weights and histogram">
        <rect width={BW + 20} height={HH + 90} className="pl-bg" />
        {/* cumulative weights as one bar from 0 to total */}
        {segs.map((s) => (
          <g key={s.i}>
            <rect x={10 + s.x} y={10} width={Math.max(0, s.w)} height={18} style={{ fill: cols[s.i % cols.length], opacity: last?.i === s.i ? 1 : 0.55 }} />
            <text x={10 + s.x + 2} y={42} className="pl-tick" style={{ fontSize: 9 }}>
              {s.w > 22 ? s.from : ''}
            </text>
          </g>
        ))}
        <text x={10 + BW} y={42} textAnchor="end" className="pl-tick" style={{ fontSize: 9 }}>
          {total}
        </text>
        {last && <line x1={10 + (last.r / (total || 1)) * BW} x2={10 + (last.r / (total || 1)) * BW} y1={4} y2={34} style={{ stroke: 'var(--fg)', strokeWidth: 2 }} />}
        {/* histogram: expected share (outline) against observed share (filled) */}
        {rows.map((r, i) => {
          const bw = BW / rows.length;
          const x = 10 + i * bw + bw * 0.18, w = bw * 0.64;
          const sy = (v: number) => 50 + HH - (v / maxShare) * (HH - 14);
          const exp = weights[i] / (total || 1), obs = rolls ? counts[i] / rolls : 0;
          return (
            <g key={r.name}>
              {rolls > 0 && <rect x={x} y={sy(obs)} width={w} height={50 + HH - sy(obs)} style={{ fill: cols[i % cols.length], opacity: 0.75 }} />}
              <rect x={x} y={sy(exp)} width={w} height={50 + HH - sy(exp)} style={{ fill: 'none', stroke: 'var(--fg)', strokeDasharray: '3 2' }} />
              <text x={x + w / 2} y={sy(Math.max(exp, obs)) - 4} textAnchor="middle" className="pl-tick" style={{ fontSize: 10 }}>
                {rolls ? `${(obs * 100).toFixed(1)}%` : `${(exp * 100).toFixed(1)}%`}
              </text>
              <text x={x + w / 2} y={50 + HH + 14} textAnchor="middle" className="pl-tick" style={{ fontSize: 10 }}>
                {r.name} ({counts[i]})
              </text>
            </g>
          );
        })}
        <line x1={10} x2={BW + 10} y1={50 + HH} y2={50 + HH} className="pl-axis" />
        <text x={BW + 10} y={62} textAnchor="end" className="pl-tick" style={{ fontSize: 10 }}>
          dashed: expected share; filled: observed
        </text>
      </svg>
    </FigureLayout>
  );
}

type Rule = 'independent' | 'pity' | 'prd';
function Streaks() {
  const [p, setP] = useState(0.2);
  const [rule, setRule] = useState<Rule>('independent');
  const [pityN, setPityN] = useState(8);
  const [seed, setSeed] = useState(3);
  const C = useMemo(() => prdC(p), [p]);
  const sim = useMemo(() => {
    const rng = new Rng(seed);
    const N = 10000;
    const crits: boolean[] = [];
    let misses = 0, chance = 0;
    for (let i = 0; i < N; i++) {
      let crit: boolean;
      if (rule === 'prd') {
        chance += C;
        crit = rng.next() < chance;
      } else if (rule === 'pity') crit = misses + 1 >= pityN || rng.next() < p;
      else crit = rng.next() < p;
      if (crit) {
        misses = 0;
        chance = 0;
      } else misses++;
      crits.push(crit);
    }
    // gaps: number of attacks from one crit to the next (1 = back to back)
    const gaps: number[] = [];
    let since = 0, longest = 0, run = 0;
    for (const c of crits) {
      since++;
      if (c) {
        gaps.push(since);
        since = 0;
        run = 0;
      } else longest = Math.max(longest, ++run);
    }
    const hist = new Array(30).fill(0);
    for (const g of gaps) hist[Math.min(30, g) - 1]++;
    const rate = gaps.length / N;
    const mean = gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length);
    const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, gaps.length));
    return { crits, hist, rate, longest, total: gaps.length, sd, mean };
  }, [p, rule, pityN, seed, C]);
  const HW = 480, HH = 120;
  const maxH = Math.max(...sim.hist, 1);
  const bw = HW / 30;

  const code =
    rule === 'prd'
      ? `## Pseudo-random distribution: each miss raises the chance by c.
## c = ${C.toFixed(4)} gives a long-run crit rate of ${(p * 100).toFixed(0)}%.
const PRD_C := ${C.toFixed(4)}

var _crit_chance := 0.0


func roll_crit(rng: RandomNumberGenerator) -> bool:
	_crit_chance += PRD_C
	if rng.randf() < _crit_chance:
		_crit_chance = 0.0
		return true
	return false`
      : rule === 'pity'
        ? `## Independent rolls, with a guarantee after ${pityN - 1} misses in a row.
@export var crit_chance := ${p.toFixed(2)}
@export var pity_limit := ${pityN}

var _misses := 0


func roll_crit(rng: RandomNumberGenerator) -> bool:
	if _misses + 1 >= pity_limit or rng.randf() < crit_chance:
		_misses = 0
		return true
	_misses += 1
	return false`
        : `## Independent rolls: every attack is a fresh coin flip.
@export var crit_chance := ${p.toFixed(2)}


func roll_crit(rng: RandomNumberGenerator) -> bool:
	return rng.randf() < crit_chance`;

  return (
    <FigureLayout
      side={
        <>
          <SegControl value={rule} onChange={setRule} options={[{ v: 'independent', label: 'independent' }, { v: 'pity', label: 'pity' }, { v: 'prd', label: 'PRD' }]} />
          <Slider label="crit chance" value={p} min={0.05} max={0.5} step={0.01} onChange={setP} fmt={(v) => (v * 100).toFixed(0) + '%'} />
          {rule === 'pity' && <Slider label="pity limit" value={pityN} min={2} max={20} step={1} onChange={setPityN} fmt={(v) => v.toFixed(0)} />}
          <button onClick={() => setSeed(seed + 1)}>Simulate again (10 000 attacks)</button>
          <Readout
            rows={[
              ['\\text{observed crit rate}', `${(sim.rate * 100).toFixed(1)}%`],
              ['\\text{mean gap}', `${sim.mean.toFixed(2)} attacks`],
              ['\\text{gap std. dev.}', `${sim.sd.toFixed(2)}`],
              ['\\text{longest drought}', `${sim.longest} misses`],
              ...(rule === 'prd' ? ([['c', C.toFixed(4)]] as [string, string][]) : []),
              ...(rule === 'independent' ? ([[`P(\\text{20 misses in a row})`, `${(Math.pow(1 - p, 20) * 100).toFixed(2)}%`]] as [string, string][]) : []),
            ]}
          />
        </>
      }
      below={<CodeBlock code={code} file="scripts/crit_roller.gd" compact />}
    >
      <svg viewBox={`0 0 ${HW + 20} ${HH + 110}`} className="geom-svg" role="img" aria-label="histogram of the gaps between crits and a strip of the first 100 attacks">
        <rect width={HW + 20} height={HH + 110} className="pl-bg" />
        <text x={10} y={14} className="pl-tick">
          first 100 attacks (filled = crit)
        </text>
        {sim.crits.slice(0, 100).map((c, i) => (
          <rect key={i} x={10 + (i % 50) * (HW / 50)} y={20 + Math.floor(i / 50) * 12} width={HW / 50 - 1.5} height={10} style={{ fill: c ? 'var(--c-v)' : 'var(--surface2)', stroke: 'var(--line)', strokeWidth: 0.5 }} />
        ))}
        <text x={10} y={62} className="pl-tick">
          gap between crits (attacks), share of all gaps
        </text>
        {sim.hist.map((h, i) => {
          const y = 70 + HH - (h / maxH) * (HH - 4);
          return (
            <g key={i}>
              <rect x={10 + i * bw + 1} y={y} width={bw - 2} height={70 + HH - y} style={{ fill: 'var(--c-u)' }} />
              {(i % 5 === 4 || i === 0) && (
                <text x={10 + i * bw + bw / 2} y={70 + HH + 13} textAnchor="middle" className="pl-tick" style={{ fontSize: 10 }}>
                  {i === 29 ? '30+' : i + 1}
                </text>
              )}
            </g>
          );
        })}
        <line x1={10} x2={HW + 10} y1={70 + HH} y2={70 + HH} className="pl-axis" />
      </svg>
    </FigureLayout>
  );
}
