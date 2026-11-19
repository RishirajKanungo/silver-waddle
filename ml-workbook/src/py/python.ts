// Running and grading learner Python (NumPy available) with the shared interpreter.
import { Interp, type RunResult } from '@py/interp';
import { PyDict } from '@py/values';
import type { Exercise } from '../content/types';

export function runPython(code: string, opts: { trace?: boolean } = {}): RunResult {
  return new Interp().run(code, { trace: !!opts.trace, maxTrace: 2000, echoLast: true, maxSteps: 5_000_000 });
}

export interface TestResult {
  expr: string;
  label?: string;
  expected: string;
  got: string;
  pass: boolean;
}
export interface GradeResult {
  pass: boolean;
  message: string;
  tests: TestResult[];
  run: RunResult;
  stdoutExpected?: string;
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
/** the harness, exposed so the content validator can run it in CPython too */
export const gradeHarness = harness;

function results(r: RunResult): Map<number, string> {
  const out = new Map<number, string>();
  const d = r.globals.get('__R');
  if (d instanceof PyDict) for (const [k, v] of d.entries()) out.set(Number(k), String(v));
  return out;
}

export function expected(ex: Exercise) {
  const tests = (ex.tests ?? []).map((t) => t.expr);
  const r = new Interp().run(harness(ex.solution, tests), { maxSteps: 5_000_000 });
  if (r.error) throw new Error(`Reference solution for ${ex.id} fails:\n${r.error}`);
  return { values: results(r), stdout: r.stdout };
}

export function grade(ex: Exercise, code: string, cached?: ReturnType<typeof expected>): GradeResult {
  const exp = cached ?? expected(ex);
  const tests = ex.tests ?? [];
  const run = new Interp().run(harness(code, tests.map((t) => t.expr)), { maxSteps: 5_000_000 });
  const got = results(run);
  if (run.error && !got.size) {
    return { pass: false, message: run.errorType === 'TimeoutError' ? 'The code ran too long (an infinite loop?).' : `The code raised ${run.errorType} before the tests ran.`, tests: [], run };
  }
  const tr: TestResult[] = tests.map((t, i) => {
    const e = exp.values.get(i) ?? '?';
    const g = got.get(i) ?? '(not reached)';
    return { expr: t.expr, label: t.label, expected: e, got: g, pass: e === g };
  });
  let pass = tr.every((t) => t.pass);
  let message = `${tr.filter((t) => t.pass).length}/${tr.length} tests pass.`;
  if (ex.stdout) {
    const ok = run.stdout.trimEnd() === exp.stdout.trimEnd();
    if (!ok) {
      pass = false;
      message = tr.length ? message + ' The printed output also differs.' : 'The printed output differs from the reference.';
    } else if (!tr.length) message = 'Output matches the reference.';
  }
  if (pass) {
    const miss = (ex.mustInclude ?? []).filter((m) => !code.includes(m));
    const bad = (ex.mustExclude ?? []).filter((m) => code.includes(m));
    if (miss.length || bad.length) {
      pass = false;
      message = `Correct values. Now meet the constraint: ${[...miss.map((m) => `use \`${m}\``), ...bad.map((m) => `no \`${m.trim()}\``)].join(', ')}.`;
    }
  }
  return { pass, message, tests: tr, run, stdoutExpected: ex.stdout ? exp.stdout : undefined };
}

/** Plain explanations for the errors people hit when writing NumPy. */
export function explainError(type?: string, msg?: string): string | null {
  const m = msg ?? '';
  if (/could not be broadcast/.test(m)) return 'Shapes are compared from the **right**; each pair of dimensions must be equal or one of them must be 1. Print `.shape` of both operands. Often one side needs `keepdims=True` or a `[:, None]`.';
  if (/matmul|core dimension/.test(m)) return 'For `A @ B` the inner dimensions must match: `(m, k) @ (k, n) -> (m, n)`. Print both shapes. You may need a transpose `.T`.';
  if (/cannot reshape/.test(m)) return 'A reshape cannot change the number of elements. The product of the new shape must equal `a.size`. Use `-1` for the dimension you want inferred.';
  if (/truth value of an array/.test(m)) return 'An array with several elements is neither True nor False. Use `.any()`, `.all()`, or compare element-wise with `np.where`.';
  if (/out of bounds/.test(m)) return 'Index past the end of that axis. Valid indices are `0 … n-1` (or `-n … -1`).';
  if (/Singular matrix/.test(m)) return 'The matrix is not invertible (determinant 0, dependent columns). Use `np.linalg.lstsq` or `pinv`, or add regularization.';
  switch (type) {
    case 'NameError':
      return `The name **${/'([^']+)'/.exec(m)?.[1] ?? 'that'}** is not defined at this point. Check spelling, and that it is assigned before use.`;
    case 'TypeError':
      return 'An operation got a value of the wrong type. Print the values and their types.';
    case 'IndexError':
      return 'A position that does not exist. Check the length or shape.';
    case 'KeyError':
      return 'That key is not in the dict.';
    case 'AttributeError':
      return 'That object has no such attribute. Check `type(x)`; NumPy functions are usually `np.f(x)`, and some are also methods `x.f()`.';
    case 'ZeroDivisionError':
      return 'Division by zero. NumPy arrays give `inf`/`nan` instead; Python numbers raise.';
    case 'SyntaxError':
    case 'IndentationError':
      return 'Python could not parse this line: look for a missing `:`, unbalanced brackets, or inconsistent indentation.';
    case 'TimeoutError':
      return 'The code ran too long, usually an infinite loop or far too many iterations.';
    case 'RecursionError':
      return 'Recursion without a reachable base case.';
  }
  return null;
}
