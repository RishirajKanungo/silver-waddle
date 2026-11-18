// Auto-grading for challenges (used by the UI and by the content test-suite).

import type { Challenge } from './types';
import { Interp, RunResult } from '../py/interp';
import { PyDict } from '../py/values';
import { compareResults, runFresh, Diff, ResultSet } from '../sql/engine';

export interface PyTestResult {
  expr: string;
  expected: string;
  got: string;
  pass: boolean;
}

export interface GradeResult {
  pass: boolean;
  message: string;
  /** SQL */
  diff?: Diff;
  expected?: ResultSet | null;
  got?: ResultSet | null;
  sqlError?: string | null;
  sqlHint?: string | null;
  /** Python */
  tests?: PyTestResult[];
  run?: RunResult;
}

function missingKeywords(code: string, must: string[] | undefined, ci: boolean) {
  if (!must) return [];
  const c = ci ? code.toUpperCase() : code;
  return must.filter((m) => !c.includes(ci ? m.toUpperCase() : m));
}

export function gradeSql(ch: Challenge, dataset: string, sql: string): GradeResult {
  const exp = runFresh(dataset, ch.solution);
  if (exp.error) throw new Error(`Reference solution for ${ch.id} fails: ${exp.error}`);
  const got = runFresh(dataset, sql);
  if (got.error) return { pass: false, message: 'Your query has an error.', sqlError: got.error, sqlHint: got.hint, expected: exp.last, got: null };
  const diff = compareResults(exp.last, got.last, { ordered: ch.sql?.ordered, checkColumnNames: ch.sql?.columns });
  const miss = missingKeywords(sql, ch.sql?.mustInclude, true);
  if (diff.ok && miss.length) return { pass: false, message: `Right answer — now solve it using ${miss.join(' and ')} (that's the skill being trained).`, diff, expected: exp.last, got: got.last };
  return { pass: diff.ok, message: diff.ok ? 'All rows match. ✅' : diff.reason ?? 'Not quite.', diff, expected: exp.last, got: got.last };
}

function harness(code: string, tests: string[]) {
  const lines = [code, '', '__R = {}'];
  tests.forEach((t, i) => {
    lines.push('try:');
    lines.push(`    __R[${i}] = repr(${t})`);
    lines.push('except Exception as __e:');
    lines.push(`    __R[${i}] = '!' + type(__e).__name__ + ': ' + str(__e)`);
  });
  return lines.join('\n');
}

function results(r: RunResult): Map<number, string> {
  const out = new Map<number, string>();
  const d = r.globals.get('__R');
  if (d instanceof PyDict) for (const [k, v] of d.entries()) out.set(Number(k), String(v));
  return out;
}

export function expectedPy(ch: Challenge) {
  const tests = ch.py?.tests ?? [];
  const r = new Interp().run(harness(ch.solution, tests), { maxSteps: 2_000_000 });
  if (r.error) throw new Error(`Reference solution for ${ch.id} fails:\n${r.error}`);
  return { values: results(r), stdout: r.stdout };
}

export function gradePy(ch: Challenge, code: string, cached?: { values: Map<number, string>; stdout: string }): GradeResult {
  const exp = cached ?? expectedPy(ch);
  const tests = ch.py?.tests ?? [];
  const run = new Interp().run(harness(code, tests), { maxSteps: 2_000_000 });
  if (run.error && run.errorType !== undefined && !results(run).size) {
    return { pass: false, message: run.errorType === 'TimeoutError' ? 'Your code ran too long — an infinite loop?' : `Your code raised ${run.errorType} before the tests could run.`, run };
  }
  const got = results(run);
  const tr: PyTestResult[] = tests.map((t, i) => {
    const e = exp.values.get(i) ?? '?';
    const g = got.get(i) ?? '(not reached)';
    return { expr: t, expected: e, got: g, pass: e === g };
  });
  let pass = tr.every((t) => t.pass);
  let message = pass ? `All ${tr.length} tests pass. ✅` : `${tr.filter((t) => t.pass).length}/${tr.length} tests pass.`;
  if (ch.py?.stdout) {
    const outOk = run.stdout.trimEnd() === exp.stdout.trimEnd();
    if (!outOk) {
      pass = false;
      message = 'The printed output does not match yet.';
    } else if (!tests.length) message = 'Output matches. ✅';
  }
  const miss = missingKeywords(code, ch.py?.mustInclude, false);
  if (pass && miss.length) {
    pass = false;
    message = `Correct — now do it using ${miss.join(' and ')} (that's the technique being trained).`;
  }
  return { pass, message, tests: tr, run };
}
