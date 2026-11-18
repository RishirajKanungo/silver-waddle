// SQL visualizations: joins, logical query pipeline, GROUP BY, window frames,
// schema diagram, NULL logic, index vs scan.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Database } from 'sql.js';
import { Cell, ResultSet, normCell, pipeline, runSql, schemaOf, PipelineStep } from '../../sql/engine';

export function fmtCell(v: Cell) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 10000) / 10000);
  if (v instanceof Uint8Array) return '[blob]';
  return String(v);
}

export function ResultTable({ rs, max = 200, highlight, rowClass, caption }: { rs: ResultSet; max?: number; highlight?: (r: Cell[], i: number) => string | undefined; rowClass?: (r: Cell[], i: number) => string | undefined; caption?: string }) {
  return (
    <div className="rt-wrap">
      <table className="rt">
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {rs.columns.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rs.rows.slice(0, max).map((r, i) => (
            <tr key={i} className={rowClass?.(r, i)} style={highlight ? { background: highlight(r, i) } : undefined}>
              {r.map((v, j) => (
                <td key={j} className={(v === null ? 'null ' : '') + (typeof v === 'number' ? 'num' : '')}>
                  {fmtCell(v)}
                </td>
              ))}
            </tr>
          ))}
          {rs.rows.length === 0 && (
            <tr>
              <td colSpan={Math.max(1, rs.columns.length)} className="empty-row">
                (0 rows)
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {rs.rows.length > max && <div className="rt-more">… {rs.rows.length - max} more rows</div>}
    </div>
  );
}

const HUES = [200, 30, 140, 280, 350, 90, 250, 0, 170, 320];
export const groupColor = (i: number, alpha = 0.18) => `hsla(${HUES[i % HUES.length]}, 70%, 55%, ${alpha})`;

// ======================== JOIN ========================

type JoinType = 'inner' | 'left' | 'right' | 'full' | 'cross';

export function JoinViz({ db, left, right, leftKey, rightKey, join = 'inner', show }: { db: Database; left: string; right: string; leftKey: string; rightKey: string; join?: JoinType; show?: string[] }) {
  const [type, setType] = useState<JoinType>(join);
  const L = useMemo(() => runSql(db, `SELECT * FROM ${left}`).last!, [db, left]);
  const R = useMemo(() => runSql(db, `SELECT * FROM ${right}`).last!, [db, right]);
  const lk = L.columns.indexOf(leftKey), rk = R.columns.indexOf(rightKey);
  const lCols = show ? L.columns.filter((c) => show.includes(c) || c === leftKey) : L.columns;
  const rCols = show ? R.columns.filter((c) => show.includes(c) || c === rightKey) : R.columns;
  const pick = (rs: ResultSet, cols: string[], row: Cell[]) => cols.map((c) => row[rs.columns.indexOf(c)]);

  // build the full animation script
  const script = useMemo(() => {
    type Frame = { li: number | null; matches: number[]; out: { l: Cell[] | null; r: Cell[] | null; kind: 'match' | 'lonly' | 'ronly' }[]; note: string };
    const frames: Frame[] = [];
    const out: Frame['out'] = [];
    const matchedR = new Set<number>();
    frames.push({ li: null, matches: [], out: [], note: 'Press ▶ to walk through the join, one left row at a time.' });
    L.rows.forEach((lr, i) => {
      const ms: number[] = [];
      R.rows.forEach((rr, j) => {
        if (type === 'cross') ms.push(j);
        else if (lr[lk] !== null && rr[rk] !== null && normCell(lr[lk]) === normCell(rr[rk])) ms.push(j);
      });
      ms.forEach((j) => {
        matchedR.add(j);
        out.push({ l: pick(L, lCols, lr), r: pick(R, rCols, R.rows[j]), kind: 'match' });
      });
      let note = `${left} row ${i + 1} (${leftKey} = ${fmtCell(lr[lk])})`;
      if (type === 'cross') note += ` pairs with all ${R.rows.length} ${right} rows.`;
      else if (ms.length) note += ` matches ${ms.length} ${right} row${ms.length > 1 ? 's' : ''}.`;
      else if (type === 'left' || type === 'full') {
        out.push({ l: pick(L, lCols, lr), r: null, kind: 'lonly' });
        note += lr[lk] === null ? ' — the key is NULL, which never matches. LEFT JOIN keeps it, padding with NULLs.' : ' has no match. LEFT JOIN keeps it anyway, padding the right side with NULLs.';
      } else note += lr[lk] === null ? ' — NULL never equals anything, so INNER JOIN drops it.' : ' has no match, so INNER JOIN drops it.';
      frames.push({ li: i, matches: ms, out: [...out], note });
    });
    if (type === 'right' || type === 'full') {
      const un = R.rows.map((_, j) => j).filter((j) => !matchedR.has(j));
      un.forEach((j) => out.push({ l: null, r: pick(R, rCols, R.rows[j]), kind: 'ronly' }));
      frames.push({ li: null, matches: un, out: [...out], note: un.length ? `${un.length} ${right} row${un.length > 1 ? 's were' : ' was'} never matched — ${type.toUpperCase()} JOIN adds ${un.length > 1 ? 'them' : 'it'} with NULLs on the left.` : `Every ${right} row was matched.` });
    }
    frames.push({ li: null, matches: [], out: [...out], note: `Done: ${out.length} result row${out.length === 1 ? '' : 's'}.` });
    return frames;
  }, [L, R, type, lk, rk, left, right, leftKey, lCols, rCols]);

  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [type]);
  useEffect(() => {
    if (!playing) return;
    if (step >= script.length - 1) return setPlaying(false);
    const t = setTimeout(() => setStep(step + 1), 900);
    return () => clearTimeout(t);
  }, [playing, step, script.length]);
  const f = script[Math.min(step, script.length - 1)];
  const sqlText = type === 'cross' ? `SELECT *\nFROM ${left}\nCROSS JOIN ${right};` : `SELECT *\nFROM ${left} a\n${{ inner: 'INNER JOIN', left: 'LEFT JOIN', right: 'RIGHT JOIN', full: 'FULL OUTER JOIN' }[type as 'inner']} ${right} b\n  ON a.${leftKey} = b.${rightKey};`;
  const realCount = useMemo(() => runSql(db, sqlText).last?.rows.length ?? 0, [db, sqlText]);

  return (
    <div className="joinviz">
      <div className="jv-top">
        <div className="seg">
          {(['inner', 'left', 'right', 'full', 'cross'] as JoinType[]).map((t) => (
            <button key={t} className={t === type ? 'on' : ''} onClick={() => setType(t)}>
              {t === 'full' ? 'FULL OUTER' : t.toUpperCase()}
            </button>
          ))}
        </div>
        <Venn type={type} />
      </div>
      <JoinStage
        left={left}
        right={right}
        lCols={lCols}
        rCols={rCols}
        lRows={L.rows.map((r) => pick(L, lCols, r))}
        rRows={R.rows.map((r) => pick(R, rCols, r))}
        lKey={lCols.indexOf(leftKey)}
        rKey={rCols.indexOf(rightKey)}
        li={f.li}
        matches={f.matches}
        showRightOnly={f.li === null && step > 0}
      />
      <div className="jv-note" aria-live="polite">{f.note}</div>
      <div className="jv-controls">
        <button onClick={() => setStep(0)} disabled={step === 0}>⏮</button>
        <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>◀</button>
        <button className="primary" onClick={() => (step >= script.length - 1 ? (setStep(0), setPlaying(true)) : setPlaying(!playing))}>
          {playing ? '❚❚ Pause' : step >= script.length - 1 ? '↺ Replay' : '▶ Play'}
        </button>
        <button onClick={() => setStep(Math.min(script.length - 1, step + 1))} disabled={step >= script.length - 1}>
          ▶ Step
        </button>
        <span className="muted small">
          step {step + 1}/{script.length}
        </span>
      </div>
      <div className="jv-result">
        <div className="jv-sql">
          <pre>{sqlText}</pre>
          <span className="small muted">SQLite returns {realCount} rows ✓</span>
        </div>
        <table className="rt jv-out">
          <thead>
            <tr>
              {lCols.map((c) => (
                <th key={'l' + c} className="lh">
                  {left}.{c}
                </th>
              ))}
              {rCols.map((c) => (
                <th key={'r' + c} className="rh">
                  {right}.{c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {f.out.map((o, i) => (
              <tr key={i} className={'jo-' + o.kind + (i >= (script[Math.max(0, step - 1)]?.out.length ?? 0) ? ' new' : '')}>
                {lCols.map((_, k) => (
                  <td key={'l' + k} className={o.l ? '' : 'null'}>
                    {o.l ? fmtCell(o.l[k]) : 'NULL'}
                  </td>
                ))}
                {rCols.map((_, k) => (
                  <td key={'r' + k} className={o.r ? '' : 'null'}>
                    {o.r ? fmtCell(o.r[k]) : 'NULL'}
                  </td>
                ))}
              </tr>
            ))}
            {!f.out.length && (
              <tr>
                <td colSpan={lCols.length + rCols.length} className="empty-row">
                  result rows appear here
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function JoinStage({ left, right, lCols, rCols, lRows, rRows, lKey, rKey, li, matches, showRightOnly }: { left: string; right: string; lCols: string[]; rCols: string[]; lRows: Cell[][]; rRows: Cell[][]; lKey: number; rKey: number; li: number | null; matches: number[]; showRightOnly: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{ d: string; key: string }[]>([]);
  const [miss, setMiss] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const b = el.getBoundingClientRect();
    const out: { d: string; key: string }[] = [];
    setMiss(null);
    if (li !== null) {
      const lr = el.querySelector<HTMLElement>(`[data-side="L"][data-i="${li}"]`);
      if (!lr) return setLines([]);
      const a = lr.getBoundingClientRect();
      const x1 = a.right - b.left, y1 = a.top + a.height / 2 - b.top;
      for (const j of matches) {
        const rr = el.querySelector<HTMLElement>(`[data-side="R"][data-i="${j}"]`);
        if (!rr) continue;
        const z = rr.getBoundingClientRect();
        const x2 = z.left - b.left, y2 = z.top + z.height / 2 - b.top;
        out.push({ key: `${li}-${j}`, d: `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}` });
      }
      if (!matches.length) setMiss({ x: x1 + 50, y: y1 });
    }
    setLines(out);
  }, [li, matches]);
  return (
    <div className="jv-stage" ref={box}>
      <svg className="jv-svg">
        {lines.map((l) => (
          <path key={l.key} d={l.d} className="jv-line" />
        ))}
        {miss && (
          <text x={miss.x} y={miss.y + 4} textAnchor="middle" className="jv-nomatch">
            ✗ no match
          </text>
        )}
      </svg>
      <JTable side="L" title={left} cols={lCols} rows={lRows} keyCol={lKey} active={li === null ? [] : [li]} miss={li !== null && !matches.length} />
      <div className="jv-gap" />
      <JTable side="R" title={right} cols={rCols} rows={rRows} keyCol={rKey} active={li !== null || showRightOnly ? matches : []} />
    </div>
  );
}

function JTable({ side, title, cols, rows, keyCol, active, miss }: { side: 'L' | 'R'; title: string; cols: string[]; rows: Cell[][]; keyCol: number; active: number[]; miss?: boolean }) {
  return (
    <div className="jt-wrap">
      <div className="jt-title">{title}</div>
      <table className="rt jt">
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th key={c} className={i === keyCol ? 'key' : ''}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} data-side={side} data-i={i} className={active.includes(i) ? (miss ? 'act miss' : 'act') : ''}>
              {r.map((v, j) => (
                <td key={j} className={(j === keyCol ? 'key ' : '') + (v === null ? 'null' : '')}>
                  {fmtCell(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Venn({ type }: { type: JoinType }) {
  if (type === 'cross')
    return (
      <svg className="venn" viewBox="0 0 120 60" aria-label="cross join grid">
        {[0, 1, 2].map((i) => [0, 1].map((j) => <rect key={i + '-' + j} x={30 + i * 22} y={8 + j * 22} width={18} height={18} className="vz on" />))}
        <text x={60} y={58} textAnchor="middle" className="venn-t">every pair</text>
      </svg>
    );
  const l = type === 'left' || type === 'full', r = type === 'right' || type === 'full';
  return (
    <svg className="venn" viewBox="0 0 120 60" aria-label={`${type} join venn diagram`}>
      <defs>
        <clipPath id="vl">
          <circle cx="45" cy="28" r="24" />
        </clipPath>
      </defs>
      <circle cx="45" cy="28" r="24" className={'vz' + (l ? ' on' : '')} />
      <circle cx="75" cy="28" r="24" className={'vz' + (r ? ' on' : '')} />
      <circle cx="75" cy="28" r="24" clipPath="url(#vl)" className="vz on mid" />
      <circle cx="45" cy="28" r="24" className="vz-o" />
      <circle cx="75" cy="28" r="24" className="vz-o" />
      <text x="30" y="58" className="venn-t">A</text>
      <text x="86" y="58" className="venn-t">B</text>
    </svg>
  );
}

// ======================== PIPELINE ========================

export function PipelineViz({ db, sql, compact }: { db: Database; sql: string; compact?: boolean }) {
  const steps = useMemo(() => pipeline(db, sql), [db, sql]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing || !steps) return;
    if (i >= steps.length - 1) return setPlaying(false);
    const t = setTimeout(() => setI(i + 1), 1600);
    return () => clearTimeout(t);
  }, [playing, i, steps]);
  if (!steps) return <div className="viz-empty">This visualizer works on a single SELECT … FROM … query (no UNION).</div>;
  const st = steps[Math.min(i, steps.length - 1)];
  return (
    <div className="pipeline">
      <div className="pl-steps">
        {steps.map((s, k) => (
          <button key={s.key} className={'pl-step' + (k === i ? ' on' : '') + (k < i ? ' done' : '')} onClick={() => { setPlaying(false); setI(k); }}>
            <span className="pl-n">{k + 1}</span>
            <span className="pl-t">{s.title}</span>
            <span className="pl-c">{s.error ? '⚠' : `${s.result?.rows.length ?? 0} ${s.key === 'group' ? 'rows' : s.key === 'having' ? 'groups' : 'rows'}`}</span>
          </button>
        ))}
        <button className="pl-play" onClick={() => (i >= steps.length - 1 ? (setI(0), setPlaying(true)) : setPlaying(!playing))}>
          {playing ? '❚❚' : i >= steps.length - 1 ? '↺' : '▶'}
        </button>
      </div>
      <div className="pl-explain">
        <b>{st.title}.</b> {st.explain}
      </div>
      {!compact && <pre className="pl-sql">{st.sql.replace(/\s+/g, ' ')}</pre>}
      {st.error ? <div className="err">{st.error}</div> : st.result && <PipelineTable st={st} />}
    </div>
  );
}

function PipelineTable({ st }: { st: PipelineStep }) {
  const rs = st.result!;
  if (st.key === 'group' && st.groupKeyCols) {
    const k = st.groupKeyCols;
    const keys: string[] = [];
    const idx = rs.rows.map((r) => {
      const key = r.slice(0, k).map(normCell).join('|');
      let g = keys.indexOf(key);
      if (g < 0) {
        keys.push(key);
        g = keys.length - 1;
      }
      return g;
    });
    const view = { columns: rs.columns.slice(k), rows: rs.rows.map((r) => r.slice(k)) };
    return (
      <>
        <div className="small muted">{keys.length} groups (one colour each) — each becomes one output row</div>
        <ResultTable rs={view} highlight={(_, i) => groupColor(idx[i], 0.28)} />
      </>
    );
  }
  return <ResultTable rs={rs} />;
}

// ======================== GROUP BY ========================

export function GroupByViz({ db, table, by: key, agg, col }: { db: Database; table: string; by: string; agg: 'count' | 'sum' | 'avg' | 'max' | 'min'; col?: string }) {
  const rs = useMemo(() => runSql(db, `SELECT * FROM ${table}`).last!, [db, table]);
  const [phase, setPhase] = useState(0);
  const ki = rs.columns.indexOf(key);
  const ci = col ? rs.columns.indexOf(col) : -1;
  const groups = useMemo(() => {
    const m = new Map<string, Cell[][]>();
    rs.rows.forEach((r) => {
      const k = fmtCell(r[ki]);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rs, ki]);
  const keyIdx = new Map(groups.map(([k], i) => [k, i]));
  const aggOf = (rows: Cell[][]) => {
    const vals = rows.map((r) => r[ci]).filter((v) => typeof v === 'number') as number[];
    switch (agg) {
      case 'count': return rows.length;
      case 'sum': return Math.round(vals.reduce((a, b) => a + b, 0) * 100) / 100;
      case 'avg': return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
      case 'max': return vals.length ? Math.max(...vals) : null;
      case 'min': return vals.length ? Math.min(...vals) : null;
    }
  };
  const aggLabel = agg === 'count' ? 'COUNT(*)' : `${agg.toUpperCase()}(${col})`;
  const showCols = [key, ...(col ? [col] : []), ...rs.columns.filter((c) => c !== key && c !== col).slice(0, 2)];
  const sc = showCols.map((c) => rs.columns.indexOf(c));
  return (
    <div className="groupviz">
      <div className="gv-phases">
        {['1 · Raw rows', '2 · Stack into buckets', '3 · Collapse each bucket'].map((t, i) => (
          <button key={t} className={phase === i ? 'on' : ''} onClick={() => setPhase(i)}>
            {t}
          </button>
        ))}
        <button className="primary" onClick={() => setPhase((phase + 1) % 3)}>
          {phase < 2 ? 'Next ▶' : '↺ Again'}
        </button>
      </div>
      <pre className="pl-sql">{`SELECT ${key}, ${aggLabel}\nFROM ${table}\nGROUP BY ${key};`}</pre>
      {phase === 0 && (
        <table className="rt">
          <thead>
            <tr>{showCols.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rs.rows.map((r, i) => (
              <tr key={i} style={{ background: groupColor(keyIdx.get(fmtCell(r[ki]))!, 0.12) }}>
                {sc.map((j) => <td key={j} className={j === ki ? 'key' : ''}>{fmtCell(r[j])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {phase === 1 && (
        <div className="gv-buckets">
          {groups.map(([k, rows], g) => (
            <div key={k} className="gv-bucket" style={{ background: groupColor(g, 0.16), borderColor: groupColor(g, 0.7) }}>
              <div className="gv-key">{key} = {k}</div>
              <div className="gv-row gv-head">
                {sc.slice(1).map((j) => <span key={j}>{rs.columns[j]}</span>)}
              </div>
              {rows.map((r, i) => (
                <div key={i} className="gv-row">
                  {sc.slice(1).map((j) => <span key={j}>{fmtCell(r[j])}</span>)}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {phase === 2 && (
        <table className="rt gv-final">
          <thead>
            <tr>
              <th>{key}</th>
              <th>{aggLabel}</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(([k, rows], g) => (
              <tr key={k} style={{ background: groupColor(g, 0.2) }} className="pop">
                <td className="key">{k}</td>
                <td className="num">{fmtCell(aggOf(rows) ?? null)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="small muted">
        {rs.rows.length} rows → {groups.length} buckets → {groups.length} output rows. Columns you didn't group by must be aggregated — a bucket has many values but the output row has one slot.
      </div>
    </div>
  );
}

// ======================== WINDOW ========================

const WFNS = {
  row_number: { label: 'ROW_NUMBER()', expr: () => 'ROW_NUMBER()', frame: 'upto' },
  rank: { label: 'RANK()', expr: () => 'RANK()', frame: 'upto' },
  dense_rank: { label: 'DENSE_RANK()', expr: () => 'DENSE_RANK()', frame: 'upto' },
  running: { label: 'SUM() running', expr: (v: string) => `SUM(${v})`, frame: 'upto' },
  total: { label: 'SUM() whole partition', expr: (v: string) => `SUM(${v})`, frame: 'all' },
  lag: { label: 'LAG()', expr: (v: string) => `LAG(${v})`, frame: 'prev' },
  lead: { label: 'LEAD()', expr: (v: string) => `LEAD(${v})`, frame: 'next' },
} as const;

export function WindowViz({ db, table, partition, order, value, show }: { db: Database; table: string; partition?: string; order: string; value: string; show?: string[] }) {
  const [fn, setFn] = useState<keyof typeof WFNS>('row_number');
  const [sel, setSel] = useState<number | null>(null);
  const f = WFNS[fn];
  const over = `OVER (${partition ? `PARTITION BY ${partition} ` : ''}ORDER BY ${order}${fn === 'total' ? '' : ''}${fn === 'total' ? ' ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING' : ''})`;
  const cols = show ?? [...new Set([partition, order, value].filter(Boolean) as string[])];
  const sql = `SELECT ${cols.join(', ')},\n       ${f.expr(value)} ${over.replace(' ROWS BETWEEN', '\n         ROWS BETWEEN')} AS result\nFROM ${table}\nORDER BY ${partition ? partition + ', ' : ''}${order};`;
  const rs = useMemo(() => runSql(db, sql), [db, sql]);
  const res = rs.last;
  const pIdx = partition && res ? res.columns.indexOf(partition) : -1;
  const parts = res ? res.rows.map((r) => (pIdx >= 0 ? fmtCell(r[pIdx]) : '')) : [];
  const partKeys = [...new Set(parts)];
  const inFrame = (i: number) => {
    if (sel === null || !res) return false;
    if (parts[i] !== parts[sel]) return false;
    const first = parts.indexOf(parts[sel]);
    if (f.frame === 'all') return true;
    if (f.frame === 'upto') return i >= first && i <= sel;
    if (f.frame === 'prev') return i === sel - 1;
    return i === sel + 1;
  };
  return (
    <div className="windowviz">
      <div className="seg wrap">
        {(Object.keys(WFNS) as (keyof typeof WFNS)[]).map((k) => (
          <button key={k} className={k === fn ? 'on' : ''} onClick={() => setFn(k)}>
            {WFNS[k].label}
          </button>
        ))}
      </div>
      <pre className="pl-sql">{sql}</pre>
      {rs.error && <div className="err">{rs.error}</div>}
      {res && (
        <table className="rt wv">
          <thead>
            <tr>
              {res.columns.map((c) => (
                <th key={c} className={c === 'result' ? 'res' : ''}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {res.rows.map((r, i) => (
              <tr
                key={i}
                onClick={() => setSel(i === sel ? null : i)}
                className={(i === sel ? 'sel ' : '') + (inFrame(i) ? 'frame ' : '') + (i > 0 && parts[i] !== parts[i - 1] ? 'pstart' : '')}
                style={{ background: inFrame(i) || i === sel ? undefined : groupColor(partKeys.indexOf(parts[i]), 0.12) }}
              >
                {r.map((v, j) => (
                  <td key={j} className={(res.columns[j] === 'result' ? 'res ' : '') + (v === null ? 'null' : '')}>
                    {fmtCell(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="small muted">
        {sel === null ? '👆 Click any row to light up the rows its window looks at.' : f.frame === 'upto' ? 'The frame: from the start of this partition up to the current row.' : f.frame === 'all' ? 'The frame: every row in this partition.' : f.frame === 'prev' ? 'LAG looks one row back within the partition (NULL at the first row).' : 'LEAD looks one row ahead within the partition (NULL at the last row).'}
        {partition && ` Colours = partitions (${partition}). Unlike GROUP BY, every row survives.`}
      </div>
    </div>
  );
}

// ======================== SCHEMA ========================

export function SchemaViz({ db }: { db: Database }) {
  const tables = useMemo(() => schemaOf(db), [db]);
  const box = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<{ d: string; from: string; to: string; end: [number, number] }[]>([]);
  const [peek, setPeek] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const draw = () => {
      const b = el.getBoundingClientRect();
      const out: { d: string; from: string; to: string; end: [number, number] }[] = [];
      for (const t of tables)
        for (const c of t.columns)
          if (c.fk) {
            const s = el.querySelector<HTMLElement>(`[data-col="${t.name}.${c.name}"]`);
            const d = el.querySelector<HTMLElement>(`[data-col="${c.fk.table}.${c.fk.column || 'id'}"]`) ?? el.querySelector<HTMLElement>(`[data-col="${c.fk.table}.id"]`);
            if (!s || !d) continue;
            const a = s.getBoundingClientRect(), z = d.getBoundingClientRect();
            const y1 = a.top + a.height / 2 - b.top, y2 = z.top + z.height / 2 - b.top;
            let path: string;
            let end: [number, number];
            if (z.left >= a.right - 4) {
              // target is to the right: right edge -> left edge
              const x1 = a.right - b.left, x2 = z.left - b.left, m = (x1 + x2) / 2;
              path = `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`;
              end = [x2, y2];
            } else if (z.right <= a.left + 4) {
              // target is to the left: left edge -> right edge
              const x1 = a.left - b.left, x2 = z.right - b.left, m = (x1 + x2) / 2;
              path = `M${x1},${y1} C${m},${y1} ${m},${y2} ${x2},${y2}`;
              end = [x2, y2];
            } else {
              // stacked (or self-reference): loop out to the left of both boxes
              const x1 = a.left - b.left, x2 = z.left - b.left, out2 = Math.min(x1, x2) - 22 - Math.min(30, Math.abs(y2 - y1) / 10);
              path = `M${x1},${y1} C${out2},${y1} ${out2},${y2} ${x2},${y2}`;
              end = [x2, y2];
            }
            out.push({ d: path, from: t.name, to: c.fk.table, end });
          }
      setPaths(out);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tables, peek]);
  const peekRs = peek ? runSql(db, `SELECT * FROM ${peek} LIMIT 8`).last : null;
  return (
    <div className="schema" ref={box}>
      <svg className="schema-svg">
        {paths.map((p, i) => (
          <g key={i} className={hover && (p.from === hover || p.to === hover) ? '' : hover ? 'fk-dim' : ''}>
            <path d={p.d} className={'fk-line' + (hover && (p.from === hover || p.to === hover) ? ' hot' : hover ? ' dim' : '')} />
            <circle cx={p.end[0]} cy={p.end[1]} r={3.5} className="fk-end" />
          </g>
        ))}
      </svg>
      <div className="schema-tables">
        {tables.map((t) => (
          <button key={t.name} className={'st' + (peek === t.name ? ' on' : '')} onMouseEnter={() => setHover(t.name)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(t.name)} onBlur={() => setHover(null)} onClick={() => setPeek(peek === t.name ? null : t.name)}>
            <div className="st-name">
              {t.name} <span className="muted small">{t.rowCount} rows</span>
            </div>
            {t.columns.map((c) => (
              <div key={c.name} className="st-col" data-col={`${t.name}.${c.name}`}>
                <span>{c.pk ? '🔑 ' : c.fk ? '🔗 ' : ''}{c.name}</span>
                <span className="muted small">{c.type.toLowerCase()}</span>
              </div>
            ))}
          </button>
        ))}
      </div>
      {peekRs && <ResultTable rs={peekRs} caption={`first rows of ${peek}`} />}
    </div>
  );
}

// ======================== NULL LOGIC ========================

export function NullsViz() {
  const vals = ['TRUE', 'FALSE', 'NULL'] as const;
  const and = (a: string, b: string) => (a === 'FALSE' || b === 'FALSE' ? 'FALSE' : a === 'NULL' || b === 'NULL' ? 'NULL' : 'TRUE');
  const or = (a: string, b: string) => (a === 'TRUE' || b === 'TRUE' ? 'TRUE' : a === 'NULL' || b === 'NULL' ? 'NULL' : 'FALSE');
  const [op, setOp] = useState<'AND' | 'OR' | '='>('=');
  const cmpVals = ['5', 'NULL'];
  return (
    <div className="nullsviz">
      <div className="seg">
        {(['=', 'AND', 'OR'] as const).map((o) => (
          <button key={o} className={o === op ? 'on' : ''} onClick={() => setOp(o)}>
            {o === '=' ? 'comparisons' : o}
          </button>
        ))}
      </div>
      {op === '=' ? (
        <table className="rt tt">
          <thead>
            <tr>
              <th>expression</th>
              <th>result</th>
              <th>kept by WHERE?</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['5 = 5', 'TRUE'],
              ['5 = 6', 'FALSE'],
              ['5 = NULL', 'NULL'],
              ['NULL = NULL', 'NULL'],
              ['NULL <> 1', 'NULL'],
              ['NULL IS NULL', 'TRUE'],
              ['5 IS NOT NULL', 'TRUE'],
            ].map(([e, r]) => (
              <tr key={e} className={'tv-' + r}>
                <td>
                  <code>{e}</code>
                </td>
                <td>{r === 'NULL' ? 'UNKNOWN' : r}</td>
                <td>{r === 'TRUE' ? '✅ yes' : '❌ no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="rt tt">
          <thead>
            <tr>
              <th>{op}</th>
              {vals.map((v) => (
                <th key={v}>{v === 'NULL' ? 'UNKNOWN' : v}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vals.map((a) => (
              <tr key={a}>
                <th>{a === 'NULL' ? 'UNKNOWN' : a}</th>
                {vals.map((b) => {
                  const r = op === 'AND' ? and(a, b) : or(a, b);
                  return (
                    <td key={b} className={'tv-' + r}>
                      {r === 'NULL' ? 'UNKNOWN' : r}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="small muted">Think of NULL as "I don't know". Is unknown equal to 5? You don't know — so the answer is unknown, not true. {void cmpVals}</div>
    </div>
  );
}

// ======================== INDEX vs SCAN ========================

export function IndexViz({ n = 1000 }: { n?: number }) {
  const [target, setTarget] = useState(Math.floor(n * 0.73));
  const [t, setT] = useState(0);
  const [running, setRunning] = useState(false);
  const scanSteps = target + 1;
  const bin: { lo: number; hi: number; mid: number }[] = useMemo(() => {
    const out = [];
    let lo = 0, hi = n - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      out.push({ lo, hi, mid });
      if (mid === target) break;
      if (mid < target) lo = mid + 1;
      else hi = mid - 1;
    }
    return out;
  }, [n, target]);
  useEffect(() => {
    if (!running) return;
    if (t >= scanSteps) return setRunning(false);
    const id = setTimeout(() => setT(t + Math.max(1, Math.ceil(scanSteps / 120))), 16);
    return () => clearTimeout(id);
  }, [running, t, scanSteps]);
  const bi = Math.min(bin.length - 1, Math.floor((t / scanSteps) * bin.length * 6));
  const b = bin[Math.max(0, bi)];
  return (
    <div className="indexviz">
      <div className="iv-top">
        <label>
          Find id ={' '}
          <input type="number" min={0} max={n - 1} value={target} onChange={(e) => { setTarget(Math.max(0, Math.min(n - 1, +e.target.value))); setT(0); }} style={{ width: 80 }} />
        </label>
        <button className="primary" onClick={() => { setT(0); setRunning(true); }}>▶ Race</button>
        <span className="muted small">table has {n.toLocaleString()} rows</span>
      </div>
      <div className="iv-lane">
        <div className="iv-label">
          Full table SCAN <b>{Math.min(t, scanSteps)}</b> rows checked
        </div>
        <div className="iv-bar">
          <i style={{ width: `${(Math.min(t, scanSteps) / n) * 100}%` }} />
          <span className="iv-target" style={{ left: `${(target / n) * 100}%` }} />
        </div>
      </div>
      <div className="iv-lane">
        <div className="iv-label">
          SEARCH USING INDEX (B-tree) <b>{t > 0 ? Math.min(bi + 1, bin.length) : 0}</b> steps
        </div>
        <div className="iv-bar idx">
          {t > 0 && <i className="range" style={{ left: `${(b.lo / n) * 100}%`, width: `${Math.max(0.6, ((b.hi - b.lo + 1) / n) * 100)}%` }} />}
          <span className="iv-target" style={{ left: `${(target / n) * 100}%` }} />
        </div>
      </div>
      <div className="small muted">
        A scan reads every row until it finds the match (up to {n.toLocaleString()} reads). An index is a sorted tree: each step halves the search space, so it needs only ~{Math.ceil(Math.log2(n))} reads — and at a billion rows, ~30. That's why `WHERE customer_id = ?` on an indexed column is instant and on an unindexed one costs real money.
      </div>
    </div>
  );
}
