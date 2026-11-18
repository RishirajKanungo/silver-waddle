// Concept visualizations: Big-O growth race and a hash map you can poke at.

import { useEffect, useMemo, useState } from 'react';

const CURVES = [
  { id: 'O(1)', f: () => 1, color: 'var(--c1)' },
  { id: 'O(log n)', f: (n: number) => Math.max(1, Math.log2(n)), color: 'var(--c2)' },
  { id: 'O(n)', f: (n: number) => n, color: 'var(--c3)' },
  { id: 'O(n log n)', f: (n: number) => n * Math.max(1, Math.log2(n)), color: 'var(--c4)' },
  { id: 'O(n²)', f: (n: number) => n * n, color: 'var(--c5)' },
  { id: 'O(2ⁿ)', f: (n: number) => Math.pow(2, n), color: 'var(--c6)' },
];

const fmtOps = (x: number) => (x >= 1e15 ? x.toExponential(1) : x >= 1e9 ? (x / 1e9).toFixed(1) + 'B' : x >= 1e6 ? (x / 1e6).toFixed(1) + 'M' : x >= 1e3 ? (x / 1e3).toFixed(1) + 'K' : x.toFixed(x < 10 ? 1 : 0));
const fmtTime = (ops: number) => {
  const s = ops / 1e8; // ~100M simple operations per second
  if (s < 1e-3) return `${(s * 1e6).toFixed(0)} µs`;
  if (s < 1) return `${(s * 1e3).toFixed(0)} ms`;
  if (s < 60) return `${s.toFixed(1)} s`;
  if (s < 3600) return `${(s / 60).toFixed(0)} min`;
  if (s < 86400 * 365) return `${(s / 3600).toFixed(0)} h`;
  return `${(s / 86400 / 365).toExponential(1)} years`;
};

export function BigOViz() {
  const [n, setN] = useState(16);
  const [log, setLog] = useState(false);
  const [bigN, setBigN] = useState(1_000_000);
  const W = 420, H = 220, P = 30;
  const maxX = 64;
  const ys = CURVES.map((c) => c.f(n));
  const yMax = log ? Math.log10(Math.max(...CURVES.map((c) => c.f(maxX)))) : Math.max(4, ...CURVES.slice(0, 5).map((c) => c.f(maxX)));
  const yOf = (v: number) => {
    const t = log ? Math.log10(Math.max(1, v)) / yMax : Math.min(1, v / yMax);
    return H - P - t * (H - 2 * P);
  };
  const xOf = (x: number) => P + ((x - 1) / (maxX - 1)) * (W - 2 * P);
  return (
    <div className="bigo">
      <div className="bigo-ctl">
        <label>
          n = <b>{n}</b>
          <input type="range" min={1} max={maxX} value={n} onChange={(e) => setN(+e.target.value)} />
        </label>
        <label className="chk">
          <input type="checkbox" checked={log} onChange={(e) => setLog(e.target.checked)} /> log scale
        </label>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="bigo-svg">
        <line x1={P} y1={H - P} x2={W - P} y2={H - P} className="axis" />
        <line x1={P} y1={P} x2={P} y2={H - P} className="axis" />
        <text x={W - P} y={H - 8} textAnchor="end" className="ax-label">input size n →</text>
        <text x={8} y={P - 10} className="ax-label">operations</text>
        {CURVES.map((c) => {
          let d = '';
          for (let x = 1; x <= maxX; x++) d += `${x === 1 ? 'M' : 'L'}${xOf(x)},${yOf(c.f(x))}`;
          return <path key={c.id} d={d} fill="none" stroke={c.color} strokeWidth={2.2} />;
        })}
        <line x1={xOf(n)} y1={P} x2={xOf(n)} y2={H - P} className="cursor" />
        {CURVES.map((c, i) => (
          <circle key={c.id} cx={xOf(n)} cy={yOf(ys[i])} r={3.5} fill={c.color} />
        ))}
      </svg>
      <div className="bigo-legend">
        {CURVES.map((c, i) => (
          <span key={c.id} className="bl">
            <i style={{ background: c.color }} />
            {c.id} <b>{fmtOps(ys[i])}</b> ops
          </span>
        ))}
      </div>
      <div className="bigo-real">
        <label>
          At real scale: n ={' '}
          <select value={bigN} onChange={(e) => setBigN(+e.target.value)}>
            {[1_000, 100_000, 1_000_000, 100_000_000].map((v) => (
              <option key={v} value={v}>
                {v.toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        <table className="rt">
          <tbody>
            {CURVES.map((c) => (
              <tr key={c.id}>
                <td>{c.id}</td>
                <td className="num">{c.id === 'O(2ⁿ)' ? 'heat death of the universe' : fmtTime(c.f(bigN))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="small muted">Assuming ~100 million simple operations per second. This is why interviewers ask "can you do better than O(n²)?" — at a million items, it's 0.01 s vs. ~3 hours.</div>
      </div>
    </div>
  );
}

function hashStr(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function HashMapViz({ keys }: { keys?: string[] }) {
  const [buckets, setBuckets] = useState(8);
  const [items, setItems] = useState<{ k: string; v: number }[]>(() => (keys ?? ['alice', 'bob', 'carol']).map((k, i) => ({ k, v: (i + 1) * 10 })));
  const [input, setInput] = useState('');
  const [last, setLast] = useState<string | null>(null);
  const [look, setLook] = useState<string | null>(null);
  const [msg, setMsg] = useState('Type a key and press Insert — watch where it lands.');
  const table = useMemo(() => {
    const t: { k: string; v: number }[][] = Array.from({ length: buckets }, () => []);
    items.forEach((it) => t[hashStr(it.k) % buckets].push(it));
    return t;
  }, [items, buckets]);
  const load = items.length / buckets;
  useEffect(() => {
    if (load > 0.75) {
      const t = setTimeout(() => {
        setBuckets(buckets * 2);
        setMsg(`Load factor passed 0.75 → the table doubled to ${buckets * 2} buckets and every key was re-hashed. That rare O(n) resize is why inserts are "amortised" O(1).`);
      }, 900);
      return () => clearTimeout(t);
    }
  }, [load, buckets]);
  const insert = () => {
    const k = input.trim();
    if (!k) return;
    const h = hashStr(k);
    const b = h % buckets;
    const exists = items.some((x) => x.k === k);
    setItems(exists ? items.map((x) => (x.k === k ? { ...x, v: x.v + 1 } : x)) : [...items, { k, v: items.length * 10 + 10 }]);
    setLast(k);
    setLook(null);
    setMsg(exists ? `"${k}" already exists → hash finds bucket ${b} and updates the value in place.` : `hash("${k}") = ${h} → ${h} % ${buckets} = bucket ${b}.${table[b].length ? ` Collision! Bucket ${b} already holds ${table[b].map((x) => `"${x.k}"`).join(', ')}, so it's chained.` : ''}`);
    setInput('');
  };
  const find = () => {
    const k = input.trim();
    if (!k) return;
    const b = hashStr(k) % buckets;
    setLook(k);
    setLast(null);
    const found = table[b].find((x) => x.k === k);
    setMsg(`Lookup "${k}": jump straight to bucket ${b} (no scanning the other ${buckets - 1})… ${found ? `found → ${found.v}` : 'not there → KeyError'}.`);
  };
  return (
    <div className="hashviz">
      <div className="hv-ctl">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && insert()} placeholder="key, e.g. dave" aria-label="key" />
        <button className="primary" onClick={insert}>Insert</button>
        <button onClick={find}>Look up</button>
        <button onClick={() => { setItems([]); setBuckets(8); setMsg('Empty table with 8 buckets.'); }}>Clear</button>
        <span className="muted small">
          {items.length} keys / {buckets} buckets · load {load.toFixed(2)}
        </span>
      </div>
      <div className="hv-msg">{msg}</div>
      <div className="hv-table">
        {table.map((chain, i) => {
          const hot = (last !== null && hashStr(last) % buckets === i) || (look !== null && hashStr(look) % buckets === i);
          return (
            <div key={i} className={'hv-bucket' + (hot ? ' hot' : '')}>
              <span className="hv-i">{i}</span>
              {chain.length === 0 && <span className="hv-empty">—</span>}
              {chain.map((it) => (
                <span key={it.k} className={'hv-item' + (it.k === last || it.k === look ? ' new' : '')}>
                  {it.k}: {it.v}
                </span>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
