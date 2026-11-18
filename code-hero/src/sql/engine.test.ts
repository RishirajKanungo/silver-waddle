import { describe, it, expect, beforeAll } from 'vitest';
import { loadSql, makeDb, runSql, compareResults, splitClauses, pipeline, schemaOf } from './engine';
import { DATASETS } from './datasets';

beforeAll(async () => {
  await loadSql();
});

describe('sql engine', () => {
  it('loads every dataset', () => {
    for (const name of Object.keys(DATASETS)) {
      const db = makeDb(name);
      const s = schemaOf(db);
      expect(s.length).toBeGreaterThan(0);
      expect(s.every((t) => t.rowCount > 0)).toBe(true);
    }
  });
  it('runs queries and gives hints', () => {
    const db = makeDb('shop');
    const ok = runSql(db, 'SELECT COUNT(*) FROM customers');
    expect(ok.last!.rows[0][0]).toBe(10);
    const bad = runSql(db, 'SELECT nme FROM customers');
    expect(bad.error).toMatch(/no such column/);
    expect(bad.hint).toMatch(/isn't a column/);
    const agg = runSql(db, 'SELECT city FROM customers WHERE COUNT(*) > 1');
    expect(agg.hint).toMatch(/HAVING/);
  });
  it('compares results as multisets, optionally ordered', () => {
    const exp = { columns: ['a'], rows: [[1], [2], [2]] };
    expect(compareResults(exp, { columns: ['x'], rows: [[2], [1], [2]] }).ok).toBe(true);
    expect(compareResults(exp, { columns: ['x'], rows: [[2], [1], [2]] }, { ordered: true }).orderWrong).toBe(true);
    const d = compareResults(exp, { columns: ['x'], rows: [[1], [3]] });
    expect(d.ok).toBe(false);
    expect(d.missing).toEqual([[2], [2]]);
    expect(d.extra).toEqual([[3]]);
    expect(compareResults(exp, { columns: ['x', 'y'], rows: [] }).colCountWrong).toBe(true);
    expect(compareResults({ columns: ['v'], rows: [[0.1 + 0.2]] }, { columns: ['v'], rows: [[0.3]] }).ok).toBe(true);
  });
  it('splits clauses and builds a pipeline', () => {
    const sql = "SELECT city, COUNT(*) AS n FROM customers WHERE city <> 'Chicago' GROUP BY city HAVING COUNT(*) >= 2 ORDER BY n DESC LIMIT 2";
    const c = splitClauses(sql)!;
    expect(c.from).toBe('customers');
    expect(c.groupBy).toBe('city');
    expect(c.limit).toBe('2');
    const steps = pipeline(makeDb('shop'), sql)!;
    expect(steps.map((s) => s.key)).toEqual(['from', 'where', 'group', 'having', 'select', 'order', 'limit']);
    expect(steps.every((s) => !s.error)).toBe(true);
    expect(steps[0].result!.rows.length).toBe(10);
    expect(steps[steps.length - 1].result!.rows.length).toBe(2);
    expect(splitClauses("SELECT '(from)' AS x FROM t WHERE y IN (SELECT y FROM u)")!.where).toBe('y IN (SELECT y FROM u)');
    expect(splitClauses('SELECT 1 UNION SELECT 2')).toBeNull();
  });
  it('supports window functions and full outer join', () => {
    const db = makeDb('toy');
    const r = runSql(db, 'SELECT s.name, c.club FROM students s FULL OUTER JOIN clubs c ON s.club_id = c.id');
    expect(r.error).toBeNull();
    expect(r.last!.rows.length).toBe(6);
    const w = runSql(makeDb('hr'), 'SELECT name, DENSE_RANK() OVER (ORDER BY salary DESC) FROM employees');
    expect(w.error).toBeNull();
  });
});

it('pipeline resolves GROUP BY aliases and positions', async () => {
  const { loadSql, makeDb, pipeline } = await import('./engine');
  await loadSql();
  const db = makeDb('bank');
  for (const q of [
    "SELECT strftime('%Y-%m', txn_date) AS month, COUNT(*) AS n FROM transactions GROUP BY month HAVING COUNT(*) > 1",
    "SELECT strftime('%Y-%m', txn_date) AS month, COUNT(*) FROM transactions GROUP BY 1",
    "SELECT account_id, COUNT(*) FROM transactions GROUP BY account_id",
  ]) {
    const steps = pipeline(db, q)!;
    for (const s of steps) expect(s.error, q + ' @ ' + s.title).toBeUndefined();
  }
  db.close();
});
