// Shared run panels for Python and SQL code (used by notebook cells, the gym, the playground).

import { useMemo, useState } from 'react';
import type { Database } from 'sql.js';
import { Interp, RunResult } from '../../py/interp';
import { RunOutput, runSql } from '../../sql/engine';
import { Md } from '../Markup';
import { PipelineViz, ResultTable } from '../viz/SqlViz';
import { TraceData, TraceView } from '../viz/TraceView';
import type { TraceHint } from '../../course/types';

/** Plain-English explanations of Python errors (learning by trial and error needs good feedback). */
export function friendlyPyError(type?: string, msg?: string): string | null {
  switch (type) {
    case 'NameError': return `Python doesn't know the name **${/'([^']+)'/.exec(msg ?? '')?.[1] ?? 'that'}** yet. Check the spelling (names are case-sensitive) and make sure it's assigned *before* this line runs.`;
    case 'UnboundLocalError': return 'You assign to this name somewhere in the function, so Python treats it as **local** everywhere in that function — but you read it before assigning. Pass it in as a parameter, or use `nonlocal`/`global` deliberately.';
    case 'TypeError':
      if (/concatenate/.test(msg ?? '')) return 'You glued a string to a number with `+`. Convert first: `str(n)` — or use an f-string: `f"{name} is {age}"`.';
      if (/not callable/.test(msg ?? '')) return 'You put `( )` after something that is not a function — maybe a variable shadowed a function name (e.g. `list = [...]`).';
      if (/missing \d+ required/.test(msg ?? '')) return 'The function needs more arguments than you passed. Compare the call with the `def` line.';
      if (/not subscriptable/.test(msg ?? '')) return 'You used `[ ]` on something that is not a list/dict/str — often a `None` returned by a function that forgot `return`.';
      if (/unhashable/.test(msg ?? '')) return 'Dict keys and set items must be immutable (hashable). Use a tuple instead of a list as the key.';
      return 'An operation got a value of the wrong type. Print the values (or step through the visualizer) to see what you actually have.';
    case 'IndexError': return 'You asked for a position that does not exist. Valid indices are `0` to `len(x) - 1` — off-by-one errors live here. Step through to watch your index.';
    case 'KeyError': return 'That key is not in the dict. Use `d.get(key, default)`, check `if key in d`, or use `collections.defaultdict`.';
    case 'AttributeError': return 'That object has no such attribute/method. Check the type (`type(x)`) — a common cause is a variable being `None`.';
    case 'ZeroDivisionError': return 'Division by zero. Guard it: `x / y if y else 0`.';
    case 'ValueError': return 'Right type, wrong value — e.g. `int("3.5")` or unpacking the wrong number of items.';
    case 'RecursionError': return 'The function kept calling itself without reaching a **base case**. Every recursive function needs an exit (e.g. `if n <= 1: return 1`) and each call must move toward it. Open the call tree to see it explode.';
    case 'IndentationError':
    case 'SyntaxError': return 'Python could not read this line. Look for a missing `:` after `if/for/def`, unbalanced brackets or quotes, or wrong indentation.';
    case 'TimeoutError': return 'This ran too long — almost always an infinite loop. Check that your `while` condition eventually becomes False (does the loop variable change?).';
    case 'StopIteration': return 'You called `next()` on an iterator with nothing left. Give `next(it, default)` a default.';
  }
  return null;
}

export function runPython(code: string, trace = false): RunResult {
  return new Interp().run(code, { trace, maxTrace: 1500, echoLast: true, maxSteps: trace ? 400000 : 3_000_000 });
}

export function PyOutput({ r }: { r: RunResult }) {
  const tip = friendlyPyError(r.errorType, r.errorMessage);
  return (
    <div className="out">
      {r.stdout && <pre className="stdout">{r.stdout}</pre>}
      {r.lastValue !== undefined && (
        <pre className="outval">
          <span className="out-label">Out:</span> {r.lastValue}
        </pre>
      )}
      {!r.stdout && r.lastValue === undefined && !r.error && <div className="muted small">(ran with no output — use print() to see values)</div>}
      {r.error && (
        <>
          <pre className="stderr">{r.error}</pre>
          {tip && (
            <div className="err-tip">
              <b>What this means:</b> <Md text={tip} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function SqlOutput({ r }: { r: RunOutput }) {
  if (r.error)
    return (
      <div className="out">
        <pre className="stderr">{r.error}</pre>
        {r.hint && (
          <div className="err-tip">
            <b>What this means:</b> <Md text={r.hint} />
          </div>
        )}
      </div>
    );
  return (
    <div className="out">
      {r.results.length === 0 && <div className="muted small">Done. {r.changes ? `${r.changes} row(s) changed.` : '(no rows returned)'}</div>}
      {r.results.map((rs, i) => (
        <div key={i}>
          <ResultTable rs={rs} />
          <div className="muted small">
            {rs.rows.length} row{rs.rows.length === 1 ? '' : 's'} · {r.ms.toFixed(1)} ms
          </div>
        </div>
      ))}
    </div>
  );
}

/** Python visualizer bound to an editor's current-line highlight. */
export function PyVisualizer({ code, hint, onLine, onEnd }: { code: string; hint?: TraceHint; onLine: (n: number | null, kind: 'cur' | 'err') => void; onEnd?: () => void }) {
  const r = useMemo(() => runPython(code, true), [code]);
  const data: TraceData = { trace: r.trace, calls: r.calls, truncated: r.truncated };
  const [step, setStepState] = useState(0);
  const setStep = (n: number) => {
    setStepState(n);
    const s = r.trace[n];
    onLine(s ? s.line : null, s?.event === 'exception' ? 'err' : 'cur');
  };
  if (r.errorType === 'SyntaxError') return <PyOutput r={r} />;
  return (
    <div className="pyviz">
      <TraceView data={data} hint={hint} step={step} setStep={setStep} onEnd={onEnd} />
      <div className="viz-stdout">
        <span className="out-label">Printed so far</span>
        <pre>{r.trace[step]?.stdout || ' '}</pre>
      </div>
    </div>
  );
}

export function SqlRunPanel({ db, sql, showPipeline }: { db: Database; sql: string; showPipeline?: boolean }) {
  const r = useMemo(() => runSql(db, sql), [db, sql]);
  return (
    <>
      <SqlOutput r={r} />
      {showPipeline && !r.error && <PipelineViz db={db} sql={sql} />}
    </>
  );
}
