// SQLite in the browser (sql.js, pure-JS build so it runs in any sandbox, no WASM needed).
// Also: result comparison for auto-grading, and query "pipeline" splitting so
// the visualizer can show FROM -> WHERE -> GROUP BY -> HAVING -> SELECT -> ORDER BY -> LIMIT.

import initSqlJs from 'sql.js/dist/sql-asm-memory-growth.js';
import type { Database, SqlJsStatic } from 'sql.js';
import { DATASETS } from './datasets';

let SQL: SqlJsStatic | null = null;
let loading: Promise<SqlJsStatic> | null = null;

export function loadSql(): Promise<SqlJsStatic> {
  if (SQL) return Promise.resolve(SQL);
  if (!loading) {
    const quiet = console.warn;
    loading = (initSqlJs as unknown as () => Promise<SqlJsStatic>)().then((s) => {
      SQL = s;
      console.warn = quiet;
      return s;
    });
  }
  return loading;
}
export const sqlReady = () => SQL !== null;

export type Cell = number | string | null | Uint8Array;
export interface ResultSet {
  columns: string[];
  rows: Cell[][];
}
export interface RunOutput {
  results: ResultSet[]; // one per statement that returned rows
  last: ResultSet | null;
  changes: number;
  error: string | null;
  hint: string | null;
  ms: number;
}

export function makeDb(dataset: string): Database {
  if (!SQL) throw new Error('SQL engine not loaded yet');
  const db = new SQL.Database();
  const ds = DATASETS[dataset];
  if (!ds) throw new Error('unknown dataset ' + dataset);
  db.run('PRAGMA foreign_keys = ON;');
  db.exec(ds.sql);
  return db;
}

/** Run on a throwaway copy of a dataset and free it afterwards (keeps memory flat). */
export function runFresh(dataset: string, sql: string, maxRows = 2000): RunOutput {
  const db = makeDb(dataset);
  try {
    return runSql(db, sql, maxRows);
  } finally {
    db.close();
  }
}

export function runSql(db: Database, sql: string, maxRows = 2000): RunOutput {
  const t0 = performance.now();
  const results: ResultSet[] = [];
  let changes = 0;
  try {
    for (const stmt of db.iterateStatements(sql)) {
      const columns = stmt.getColumnNames();
      const rows: Cell[][] = [];
      while (stmt.step()) {
        if (rows.length < maxRows) rows.push(stmt.get() as Cell[]);
      }
      if (columns.length) results.push({ columns, rows });
      else changes += db.getRowsModified();
      stmt.free();
    }
    return { results, last: results[results.length - 1] ?? null, changes, error: null, hint: null, ms: performance.now() - t0 };
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    return { results, last: null, changes, error: msg, hint: sqlHint(msg, sql), ms: performance.now() - t0 };
  }
}

/** Plain-English guidance for the most common SQLite errors. */
export function sqlHint(msg: string, sql: string): string | null {
  const m = msg.toLowerCase();
  if (m.includes('no such column')) {
    const col = /no such column: (\S+)/i.exec(msg)?.[1];
    return `"${col}" isn't a column here. Check the spelling against the schema panel, and if you aliased a table (FROM orders o), use the alias: o.${col?.split('.').pop()}.`;
  }
  if (m.includes('no such table')) return 'That table name does not exist in this database — open the schema panel to see the real table names.';
  if (m.includes('ambiguous column')) return 'Two joined tables both have that column. Prefix it with the table or alias, e.g. o.customer_id.';
  if (m.includes('misuse of aggregate')) return 'Aggregates (SUM, COUNT…) can\'t be used in WHERE — that filter runs before grouping. Move it to HAVING.';
  if (m.includes('misuse of window function')) return 'Window functions run after WHERE/GROUP BY/HAVING. Compute them in a subquery or CTE, then filter on the result in the outer query.';
  if (m.includes('syntax error')) {
    if (/,\s*from\b/i.test(sql)) return 'There is a trailing comma right before FROM.';
    if (/\bwhere\b[\s\S]*\bgroup by\b/i.test(sql) === false && /\bhaving\b/i.test(sql) && !/\bgroup by\b/i.test(sql)) return 'HAVING normally needs a GROUP BY.';
    return 'Check the clause order: SELECT … FROM … JOIN … ON … WHERE … GROUP BY … HAVING … ORDER BY … LIMIT. Also look for missing commas or unbalanced parentheses/quotes.';
  }
  if (m.includes('must appear in the group by') || m.includes('not an aggregate')) return 'Every selected column must be grouped or aggregated.';
  if (m.includes('incomplete input')) return 'The statement ends too early — a missing closing parenthesis or quote?';
  if (m.includes('foreign key')) return 'That change would break a foreign key relationship (a child row would point to nothing).';
  if (m.includes('unique constraint')) return 'That value already exists in a column marked UNIQUE or PRIMARY KEY.';
  return null;
}

// ---------------- grading ----------------

export function normCell(v: Cell): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
  if (typeof v === 'string') {
    const n = Number(v);
    if (v.trim() !== '' && !isNaN(n) && /^-?\d+(\.\d+)?$/.test(v.trim())) return normCell(n);
    return v;
  }
  return '[blob]';
}

export interface Diff {
  ok: boolean;
  reason: string | null;
  missing: Cell[][]; // expected rows you don't have
  extra: Cell[][]; // rows you returned that shouldn't be there
  orderWrong: boolean;
  colCountWrong: boolean;
}

/** Compare a learner's result with the expected result (multiset of rows; optional order check). */
export function compareResults(expected: ResultSet | null, got: ResultSet | null, opts: { ordered?: boolean; checkColumnNames?: string[] } = {}): Diff {
  const empty: Diff = { ok: false, reason: null, missing: [], extra: [], orderWrong: false, colCountWrong: false };
  if (!got) return { ...empty, reason: 'Your query returned no result set (did it run a SELECT?).', missing: expected?.rows ?? [] };
  if (!expected) return { ...empty, ok: true };
  if (expected.columns.length !== got.columns.length) {
    return { ...empty, colCountWrong: true, reason: `Expected ${expected.columns.length} column${expected.columns.length > 1 ? 's' : ''} (${expected.columns.join(', ')}), but your result has ${got.columns.length}.` };
  }
  if (opts.checkColumnNames) {
    const want = opts.checkColumnNames.map((c) => c.toLowerCase());
    const have = got.columns.map((c) => c.toLowerCase());
    const bad = want.filter((c, i) => have[i] !== c);
    if (bad.length) return { ...empty, reason: `Name your columns exactly: ${opts.checkColumnNames.join(', ')} (use AS aliases).` };
  }
  const key = (r: Cell[]) => r.map(normCell).join('\u0001');
  const counts = new Map<string, number>();
  for (const r of expected.rows) counts.set(key(r), (counts.get(key(r)) ?? 0) + 1);
  const extra: Cell[][] = [];
  for (const r of got.rows) {
    const k = key(r);
    const n = counts.get(k) ?? 0;
    if (n > 0) counts.set(k, n - 1);
    else extra.push(r);
  }
  const missing: Cell[][] = [];
  for (const r of expected.rows) {
    const k = key(r);
    const n = counts.get(k) ?? 0;
    if (n > 0) {
      missing.push(r);
      counts.set(k, n - 1);
    }
  }
  if (missing.length || extra.length) {
    let reason = `${missing.length ? `${missing.length} expected row${missing.length > 1 ? 's are' : ' is'} missing` : ''}${missing.length && extra.length ? ' and ' : ''}${extra.length ? `${extra.length} row${extra.length > 1 ? 's' : ''} shouldn't be there` : ''}.`;
    if (got.rows.length > expected.rows.length * 2 && expected.rows.length > 0) reason += ' Way too many rows — a JOIN fan-out, or a missing filter?';
    if (got.rows.length === 0) reason = 'Your query returned 0 rows — is a filter too strict, or is an INNER JOIN dropping rows?';
    return { ...empty, missing, extra, reason };
  }
  if (opts.ordered) {
    const wrong = expected.rows.some((r, i) => key(r) !== key(got.rows[i]));
    if (wrong) return { ...empty, orderWrong: true, reason: 'Right rows, wrong order — check your ORDER BY (and ASC/DESC, and tie-breakers).' };
  }
  return { ...empty, ok: true };
}

// ---------------- pipeline splitting ----------------

export interface Clauses {
  with?: string;
  select: string;
  distinct: boolean;
  from?: string;
  where?: string;
  groupBy?: string;
  having?: string;
  orderBy?: string;
  limit?: string;
  window?: string;
}

/** Split a single SELECT statement into its top-level clauses (strings/parentheses aware). */
export function splitClauses(sql: string): Clauses | null {
  const s = sql.trim().replace(/;\s*$/, '');
  if (!/^(with|select)\b/i.test(s)) return null;
  const KW = ['with', 'select', 'from', 'where', 'group by', 'having', 'window', 'order by', 'limit', 'union', 'intersect', 'except'];
  const marks: { kw: string; at: number }[] = [];
  let depth = 0;
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === q) q = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      q = c;
      continue;
    }
    if (c === '-' && s[i + 1] === '-') {
      while (i < s.length && s[i] !== '\n') i++;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0 && /[A-Za-z]/.test(c) && (i === 0 || !/[\w.]/.test(s[i - 1]))) {
      for (const kw of KW) {
        const re = new RegExp('^' + kw.replace(' ', '\\s+') + '\\b', 'i');
        const m = re.exec(s.slice(i));
        if (m) {
          marks.push({ kw, at: i });
          i += m[0].length - 1;
          break;
        }
      }
    }
  }
  if (marks.some((m) => ['union', 'intersect', 'except'].includes(m.kw))) return null;
  const out: Partial<Clauses> & { distinct: boolean } = { distinct: false, select: '' };
  // a WITH prefix ends at the first top-level SELECT after it
  for (let k = 0; k < marks.length; k++) {
    const { kw, at } = marks[k];
    const end = k + 1 < marks.length ? marks[k + 1].at : s.length;
    const kwLen = new RegExp('^' + kw.replace(' ', '\\s+'), 'i').exec(s.slice(at))![0].length;
    const body = s.slice(at + kwLen, end).trim();
    if (kw === 'with') out.with = s.slice(at, end).trim();
    else if (kw === 'select') {
      if (out.select) return null; // second select at top level: not supported
      const dm = /^distinct\b/i.exec(body);
      out.distinct = !!dm;
      out.select = dm ? body.slice(dm[0].length).trim() : body;
    } else if (kw === 'from') out.from = body;
    else if (kw === 'where') out.where = body;
    else if (kw === 'group by') out.groupBy = body;
    else if (kw === 'having') out.having = body;
    else if (kw === 'window') out.window = body;
    else if (kw === 'order by') out.orderBy = body;
    else if (kw === 'limit') out.limit = body;
  }
  if (!out.select) return null;
  return out as Clauses;
}

export interface PipelineStep {
  key: 'from' | 'where' | 'group' | 'having' | 'select' | 'order' | 'limit';
  title: string;
  explain: string;
  sql: string;
  result?: ResultSet;
  groupKeyCols?: number; // for the GROUP BY step: how many leading columns form the group key
  error?: string;
}

/** Map each GROUP BY item to a real expression: SELECT aliases and 1-based positions are expanded. */
export function resolveGroupKeys(select: string, groupBy: string): { expr: string; label?: string }[] {
  const items = splitTopLevel(select).map((it) => {
    const m = it.match(/^([\s\S]*?)\s+as\s+("[^"]+"|`[^`]+`|\[[^\]]+\]|\w+)\s*$/i);
    return m ? { expr: m[1].trim(), alias: m[2] } : { expr: it.trim(), alias: undefined as string | undefined };
  });
  const bare = (a: string) => a.replace(/^["`[]|["`\]]$/g, '').toLowerCase();
  return splitTopLevel(groupBy).map((g0) => {
    const g = g0.trim();
    if (/^\d+$/.test(g)) {
      const it = items[Number(g) - 1];
      if (it) return { expr: it.expr, label: it.alias };
    }
    const hit = items.find((it) => it.alias && bare(it.alias) === bare(g) && bare(it.expr) !== bare(g));
    return hit ? { expr: hit.expr, label: hit.alias } : { expr: g };
  });
}

/** Build the logical-order steps for a SELECT query, executing each intermediate query. */
export function pipeline(db: Database, sql: string): PipelineStep[] | null {
  const c = splitClauses(sql);
  if (!c || !c.from) return null;
  const w = c.with ? c.with + ' ' : '';
  const steps: PipelineStep[] = [];
  const base = `FROM ${c.from}`;
  const where = c.where ? ` WHERE ${c.where}` : '';
  steps.push({ key: 'from', title: c.from.match(/\bjoin\b/i) ? 'FROM + JOIN' : 'FROM', explain: 'Start with every row of the table(s). JOINs glue matching rows side by side.', sql: `${w}SELECT * ${base}` });
  if (c.where) steps.push({ key: 'where', title: 'WHERE', explain: 'Keep only rows that pass the filter. Aggregates do not exist yet, which is why you cannot use SUM() here.', sql: `${w}SELECT * ${base}${where}` });
  if (c.groupBy) {
    // The intermediate steps run before SELECT exists, so `GROUP BY month` (a SELECT alias) or `GROUP BY 1`
    // must be swapped for the real expression. Keep the alias as the column label so it still reads naturally.
    const keys = resolveGroupKeys(c.select, c.groupBy);
    const keyList = keys.map((k) => k.expr).join(', ');
    const keySel = keys.map((k) => (k.label ? `${k.expr} AS ${k.label}` : k.expr)).join(', ');
    steps.push({ key: 'group', title: 'GROUP BY', explain: 'Rows with the same key are stacked into buckets (colours). Each bucket will become ONE output row.', sql: `${w}SELECT ${keySel}, * ${base}${where} ORDER BY ${keyList}`, groupKeyCols: keys.length });
    if (c.having)
      steps.push({ key: 'having', title: 'HAVING', explain: 'Filter whole buckets using aggregates (e.g. COUNT(*) > 2). Buckets that fail disappear.', sql: `${w}SELECT ${keySel}, COUNT(*) AS rows_in_group ${base}${where} GROUP BY ${keyList} HAVING ${c.having}` });
  }
  const sel = `SELECT ${c.distinct ? 'DISTINCT ' : ''}${c.select} ${base}${where}${c.groupBy ? ` GROUP BY ${c.groupBy}` : ''}${c.having ? ` HAVING ${c.having}` : ''}${c.window ? ` WINDOW ${c.window}` : ''}`;
  steps.push({ key: 'select', title: c.distinct ? 'SELECT DISTINCT' : 'SELECT', explain: 'Now compute the output columns (aliases are born here — that is why WHERE cannot see them). Window functions run in this step too.', sql: w + sel });
  if (c.orderBy) steps.push({ key: 'order', title: 'ORDER BY', explain: 'Sort the final rows. Aliases from SELECT can be used here because SELECT already ran.', sql: `${w}${sel} ORDER BY ${c.orderBy}` });
  if (c.limit) steps.push({ key: 'limit', title: 'LIMIT', explain: 'Keep only the first N rows of the sorted result.', sql: `${w}${sel}${c.orderBy ? ` ORDER BY ${c.orderBy}` : ''} LIMIT ${c.limit}` });
  for (const st of steps) {
    const r = runSql(db, st.sql, 500);
    if (r.error) st.error = r.error;
    else st.result = r.last ?? { columns: [], rows: [] };
  }
  return steps;
}

export function splitTopLevel(list: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '', q: string | null = null;
  for (const ch of list) {
    if (q) {
      cur += ch;
      if (ch === q) q = null;
      continue;
    }
    if (ch === "'" || ch === '"') q = ch;
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export interface TableInfo {
  name: string;
  columns: { name: string; type: string; pk: boolean; fk?: { table: string; column: string } }[];
  rowCount: number;
}

export function schemaOf(db: Database): TableInfo[] {
  const tables = runSql(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").last?.rows.map((r) => String(r[0])) ?? [];
  return tables.map((t) => {
    const cols = runSql(db, `PRAGMA table_info("${t}")`).last?.rows ?? [];
    const fks = runSql(db, `PRAGMA foreign_key_list("${t}")`).last?.rows ?? [];
    const count = Number(runSql(db, `SELECT COUNT(*) FROM "${t}"`).last?.rows[0][0] ?? 0);
    return {
      name: t,
      rowCount: count,
      columns: cols.map((c) => {
        const fk = fks.find((f) => f[3] === c[1]);
        return { name: String(c[1]), type: String(c[2] || ''), pk: Number(c[5]) > 0, fk: fk ? { table: String(fk[2]), column: String(fk[4]) } : undefined };
      }),
    };
  });
}
