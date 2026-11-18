// Notebook cells. Interactive cells report completion to the lesson (which gates progress).

import { useMemo, useRef, useState } from 'react';
import type { Database } from 'sql.js';
import type { Cell, Challenge, VizSpec } from '../../course/types';
import { Md } from '../Markup';
import { Editor } from '../Editor';
import { progress } from '../../progress/store';
import { PyOutput, PyVisualizer, SqlOutput, runPython } from './runners';
import { RunResult } from '../../py/interp';
import { RunOutput, runSql, pipeline } from '../../sql/engine';
import { gradePy, gradeSql, GradeResult, expectedPy } from '../../course/grade';
import { GroupByViz, IndexViz, JoinViz, NullsViz, PipelineViz, ResultTable, SchemaViz, WindowViz, fmtCell } from '../viz/SqlViz';
import { BigOViz, HashMapViz } from '../viz/ConceptViz';
import { sound, confetti } from '../fx';

export interface CellCtx {
  lessonId: string;
  dataset?: string;
  db: Database | null;
  done: (key: string) => void;
  isDone: (key: string) => boolean;
}

export function CellView({ cell, k, ctx }: { cell: Cell; k: string; ctx: CellCtx }) {
  switch (cell.kind) {
    case 'md':
      return <Md text={cell.text} className="cell-md" />;
    case 'callout':
      return <Callout tone={cell.tone} title={cell.title} text={cell.text} />;
    case 'viz':
      return <VizCell viz={cell.viz} caption={cell.caption} k={k} ctx={ctx} />;
    case 'code':
      return cell.lang === 'python' ? <PyCodeCell cell={cell} k={k} ctx={ctx} /> : <SqlCodeCell cell={cell} k={k} ctx={ctx} />;
    case 'challenge':
      return <ChallengeCell ch={cell} k={k} ctx={ctx} dataset={ctx.dataset} />;
    case 'quiz':
      return <QuizCell cell={cell} k={k} ctx={ctx} />;
    case 'recall':
      return <RecallCell cell={cell} k={k} ctx={ctx} />;
    case 'explain':
      return <ExplainCell cell={cell} k={k} ctx={ctx} />;
  }
}

export const isGate = (c: Cell) => (c.kind === 'code' && !!c.predict) || c.kind === 'challenge' || c.kind === 'quiz' || c.kind === 'recall';

const TONE: Record<string, { icon: string; label: string }> = {
  tip: { icon: '💡', label: 'Tip' },
  trap: { icon: '⚠️', label: 'Trap' },
  interview: { icon: '🎯', label: 'In the interview' },
  memory: { icon: '🧠', label: 'Memory hook' },
  why: { icon: '❓', label: 'Why it works' },
};

export function Callout({ tone, title, text }: { tone: string; title?: string; text: string }) {
  const t = TONE[tone] ?? TONE.tip;
  return (
    <div className={'callout tone-' + tone}>
      <div className="callout-h">
        <span>{t.icon}</span> {title ?? t.label}
      </div>
      <Md text={text} />
    </div>
  );
}

// ---------------- viz ----------------

export function VizCell({ viz, caption, k, ctx }: { viz: VizSpec; caption?: string; k: string; ctx: CellCtx }) {
  const watched = () => progress.vizWatched(ctx.lessonId, k);
  return (
    <figure className="viz-cell" onClick={viz.type !== 'trace' ? watched : undefined}>
      <div className="viz-box">
        <VizBody viz={viz} db={ctx.db} onEnd={watched} />
      </div>
      {caption && (
        <figcaption>
          <Md text={caption} />
        </figcaption>
      )}
    </figure>
  );
}

export function VizBody({ viz, db, onEnd }: { viz: VizSpec; db: Database | null; onEnd?: () => void }) {
  const [line, setLine] = useState<number | null>(null);
  const [kind, setKind] = useState<'cur' | 'err'>('cur');
  const needDb = ['join', 'pipeline', 'groupby', 'window', 'schema'].includes(viz.type);
  if (needDb && !db) return <div className="viz-empty">Loading the database…</div>;
  switch (viz.type) {
    case 'join':
      return <JoinViz db={db!} left={viz.left} right={viz.right} leftKey={viz.leftKey} rightKey={viz.rightKey} join={viz.join} show={viz.show} />;
    case 'pipeline':
      return <PipelineViz db={db!} sql={viz.sql} />;
    case 'groupby':
      return <GroupByViz db={db!} table={viz.table} by={viz.key} agg={viz.agg} col={viz.col} />;
    case 'window':
      return <WindowViz db={db!} table={viz.table} partition={viz.partition} order={viz.order} value={viz.value} show={viz.show} />;
    case 'schema':
      return <SchemaViz db={db!} />;
    case 'nulls':
      return <NullsViz />;
    case 'index':
      return <IndexViz n={viz.n} />;
    case 'bigo':
      return <BigOViz />;
    case 'hashmap':
      return <HashMapViz keys={viz.keys} />;
    case 'trace':
      return (
        <div className="trace-split">
          <Editor value={viz.code} lang="python" readOnly line={line} lineKind={kind} />
          <PyVisualizer code={viz.code} hint={viz.trace} onLine={(n, kd) => { setLine(n); setKind(kd); }} onEnd={onEnd} />
        </div>
      );
  }
}

// ---------------- predict gate ----------------

function PredictBox({ p, onPick, picked }: { p: NonNullable<Extract<Cell, { kind: 'code' }>['predict']>; onPick: (i: number) => void; picked: number | null }) {
  return (
    <div className={'predict' + (picked !== null ? ' answered' : '')}>
      <div className="predict-q">
        <span className="badge">🔮 Predict first</span> <Md text={p.question} />
      </div>
      <div className="predict-opts">
        {p.options.map((o, i) => (
          <button
            key={i}
            className={'opt' + (picked === null ? '' : i === p.answer ? ' right' : i === picked ? ' wrong' : ' dim')}
            disabled={picked !== null}
            onClick={() => onPick(i)}
          >
            <code>{o}</code>
          </button>
        ))}
      </div>
      {picked !== null && (
        <div className={'predict-res ' + (picked === p.answer ? 'ok' : 'bad')}>
          {picked === p.answer ? '✅ You called it.' : '❌ Not quite — and that surprise is exactly what makes it stick.'} {p.explain && <Md text={p.explain} />}
        </div>
      )}
    </div>
  );
}

// ---------------- python code cell ----------------

function PyCodeCell({ cell, k, ctx }: { cell: Extract<Cell, { kind: 'code' }>; k: string; ctx: CellCtx }) {
  const [code, setCode] = useState(cell.code);
  const [res, setRes] = useState<RunResult | null>(null);
  const [viz, setViz] = useState(false);
  const [line, setLine] = useState<number | null>(null);
  const [lk, setLk] = useState<'cur' | 'err'>('cur');
  const done = ctx.isDone(k);
  const [picked, setPicked] = useState<number | null>(done && cell.predict ? cell.predict.answer : null);
  const mustPredict = !!cell.predict && picked === null;
  const run = () => {
    if (mustPredict) return;
    const r = runPython(code);
    setRes(r);
    setLine(r.errorLine ?? null);
    setLk('err');
    progress.ran();
    if (!cell.predict) ctx.done(k);
  };
  const pick = (i: number) => {
    setPicked(i);
    const ok = i === cell.predict!.answer;
    sound(ok ? 'ok' : 'bad');
    progress.predicted(ctx.lessonId, k, ok);
    const r = runPython(code);
    setRes(r);
    ctx.done(k);
    if (cell.trace) setViz(true);
  };
  return (
    <div className="code-cell">
      {cell.predict && <PredictBox p={cell.predict} onPick={pick} picked={picked} />}
      <div className={'code-wrap' + (viz ? ' with-viz' : '')}>
        <div className="code-main">
          <Editor value={code} lang="python" onChange={setCode} onRun={run} line={line} lineKind={lk} />
          <div className="code-bar">
            <button className="run" onClick={run} disabled={mustPredict} title="Run (Ctrl+Enter)">
              ▶ Run
            </button>
            <button onClick={() => { if (!mustPredict) setViz(!viz); }} disabled={mustPredict} className={viz ? 'on' : ''}>
              👁 {viz ? 'Hide' : 'Visualize'} steps
            </button>
            {code !== cell.code && <button className="link" onClick={() => setCode(cell.code)}>↺ reset</button>}
            {mustPredict && <span className="muted small">Make a prediction to unlock Run</span>}
          </div>
          {cell.note && <Md text={cell.note} className="note" />}
          {res && <PyOutput r={res} />}
        </div>
        {viz && (
          <PyVisualizer key={code} code={code} hint={cell.trace} onLine={(n, kd) => { setLine(n); setLk(kd); }} onEnd={() => progress.vizWatched(ctx.lessonId, k + ':viz')} />
        )}
      </div>
    </div>
  );
}

// ---------------- sql code cell ----------------

function SqlCodeCell({ cell, k, ctx }: { cell: Extract<Cell, { kind: 'code' }>; k: string; ctx: CellCtx }) {
  const [code, setCode] = useState(cell.code);
  const [res, setRes] = useState<RunOutput | null>(null);
  const [pipe, setPipe] = useState(false);
  const done = ctx.isDone(k);
  const [picked, setPicked] = useState<number | null>(done && cell.predict ? cell.predict.answer : null);
  const mustPredict = !!cell.predict && picked === null;
  const canPipe = useMemo(() => !!ctx.db && /^\s*(with|select)\b/i.test(code) && !!pipeline(ctx.db, code)?.length, [ctx.db, code]);
  const run = () => {
    if (mustPredict || !ctx.db) return;
    setRes(runSql(ctx.db, code));
    progress.ran();
    if (!cell.predict) ctx.done(k);
  };
  const pick = (i: number) => {
    setPicked(i);
    const ok = i === cell.predict!.answer;
    sound(ok ? 'ok' : 'bad');
    progress.predicted(ctx.lessonId, k, ok);
    if (ctx.db) setRes(runSql(ctx.db, code));
    ctx.done(k);
  };
  return (
    <div className="code-cell">
      {cell.predict && <PredictBox p={cell.predict} onPick={pick} picked={picked} />}
      <Editor value={code} lang="sql" onChange={setCode} onRun={run} />
      <div className="code-bar">
        <button className="run" onClick={run} disabled={mustPredict || !ctx.db} title="Run (Ctrl+Enter)">
          ▶ Run
        </button>
        {canPipe && (
          <button onClick={() => !mustPredict && setPipe(!pipe)} disabled={mustPredict} className={pipe ? 'on' : ''}>
            👁 Watch it execute
          </button>
        )}
        {code !== cell.code && <button className="link" onClick={() => setCode(cell.code)}>↺ reset</button>}
        {mustPredict && <span className="muted small">Make a prediction to unlock Run</span>}
      </div>
      {cell.note && <Md text={cell.note} className="note" />}
      {res && <SqlOutput r={res} />}
      {pipe && ctx.db && <PipelineViz db={ctx.db} sql={code} />}
    </div>
  );
}

// ---------------- challenge ----------------

export function ChallengeCell({ ch, k, ctx, dataset, onPass, compact }: { ch: Challenge; k: string; ctx: CellCtx; dataset?: string; onPass?: (info: { hints: number; attempts: number }) => void; compact?: boolean }) {
  const saveKey = `${ctx.lessonId}:${k}`;
  const [code, setCode] = useState(progress.s.code[saveKey] ?? ch.starter);
  const [grade, setGrade] = useState<GradeResult | null>(null);
  const [out, setOut] = useState<RunResult | RunOutput | null>(null);
  const [hints, setHints] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [showSol, setShowSol] = useState(false);
  const [viz, setViz] = useState(false);
  const [line, setLine] = useState<number | null>(null);
  const [lk, setLk] = useState<'cur' | 'err'>('cur');
  const [pipe, setPipe] = useState(false);
  const passed = ctx.isDone(k);
  const expCache = useRef<ReturnType<typeof expectedPy> | null>(null);
  const change = (v: string) => {
    setCode(v);
    progress.s.code[saveKey] = v;
  };
  const run = () => {
    progress.ran();
    if (ch.lang === 'python') {
      const r = runPython(code);
      setOut(r);
      setLine(r.errorLine ?? null);
      setLk('err');
    } else if (ctx.db) setOut(runSql(ctx.db, code));
  };
  const submit = () => {
    setAttempts(attempts + 1);
    progress.ran();
    let g: GradeResult;
    try {
      if (ch.lang === 'python') {
        expCache.current ??= expectedPy(ch);
        g = gradePy(ch, code, expCache.current);
      } else g = gradeSql(ch, dataset!, code);
    } catch (e) {
      g = { pass: false, message: String((e as Error).message) };
    }
    setGrade(g);
    setOut(null);
    if (g.run?.errorLine) {
      setLine(g.run.errorLine);
      setLk('err');
    }
    if (g.pass) {
      sound('done');
      confetti(0.5);
      const usedSolution = showSol;
      if (!passed) {
        if (!usedSolution) progress.challengePassed(ctx.lessonId, k, { hints, attempts: attempts + 1, xp: ch.xp });
        ctx.done(k);
      }
      onPass?.({ hints, attempts: attempts + 1 });
    } else sound('bad');
  };
  const canShowSol = attempts >= 2 || hints >= ch.hints.length;
  return (
    <div className={'challenge' + (passed ? ' passed' : '') + (compact ? ' compact' : '')}>
      {!compact && (
        <div className="ch-head">
          <span className="badge ch">{passed ? '✅ Solved' : '🏋️ Challenge'}</span>
          <b>{ch.title}</b>
          <span className="muted small">+{ch.xp ?? 25} XP · first try +10 · no hints +5</span>
        </div>
      )}
      <Md text={ch.prompt} />
      <div className={'code-wrap' + (viz ? ' with-viz' : '')}>
        <div className="code-main">
          <Editor value={code} lang={ch.lang} onChange={change} onRun={submit} line={line} lineKind={lk} minLines={5} />
          <div className="code-bar">
            <button className="run" onClick={submit} title="Submit (Ctrl+Enter)">
              ✓ Submit
            </button>
            <button onClick={run}>▶ Run only</button>
            {ch.lang === 'python' && (
              <button className={viz ? 'on' : ''} onClick={() => setViz(!viz)}>
                👁 Visualize
              </button>
            )}
            {ch.lang === 'sql' && ctx.db && (
              <button className={pipe ? 'on' : ''} onClick={() => setPipe(!pipe)}>
                👁 Watch it execute
              </button>
            )}
            <span className="grow" />
            <button onClick={() => setHints(Math.min(ch.hints.length, hints + 1))} disabled={hints >= ch.hints.length}>
              💡 Hint {hints}/{ch.hints.length}
            </button>
            {canShowSol && !showSol && (
              <button className="link" onClick={() => setShowSol(true)}>
                Show solution
              </button>
            )}
            <button className="link" onClick={() => change(ch.starter)} title="Reset to starter code">
              ↺
            </button>
          </div>
        </div>
        {viz && ch.lang === 'python' && <PyVisualizer key={code} code={code} hint={ch.trace} onLine={(n, kd) => { setLine(n); setLk(kd); }} />}
      </div>
      {ch.hints.slice(0, hints).map((h, i) => (
        <div key={i} className="hint">
          💡 <Md text={h} />
        </div>
      ))}
      {out && ('globals' in out ? <PyOutput r={out} /> : <SqlOutput r={out} />)}
      {pipe && ctx.db && <PipelineViz db={ctx.db} sql={code} compact />}
      {grade && <GradeView g={grade} lang={ch.lang} />}
      {(showSol || passed) && (
        <details className="solution" open={showSol}>
          <summary>{passed ? 'Reference solution & explanation' : 'Solution (no XP for this one — try to retype it from memory tomorrow)'}</summary>
          <pre className="md-code">
            <code>{ch.solution}</code>
          </pre>
          <Md text={ch.explain} />
        </details>
      )}
    </div>
  );
}

function GradeView({ g, lang }: { g: GradeResult; lang: string }) {
  return (
    <div className={'grade ' + (g.pass ? 'ok' : 'bad')}>
      <div className="grade-msg">{g.pass ? '🎉 ' : '🔧 '}{g.message}</div>
      {g.sqlError && (
        <>
          <pre className="stderr">{g.sqlError}</pre>
          {g.sqlHint && <div className="err-tip"><Md text={g.sqlHint} /></div>}
        </>
      )}
      {lang === 'sql' && !g.pass && g.diff && (g.diff.missing.length > 0 || g.diff.extra.length > 0) && g.expected && (
        <div className="diff-grid">
          {g.diff.missing.length > 0 && <ResultTable rs={{ columns: g.expected.columns, rows: g.diff.missing }} caption={`Missing from your result (${g.diff.missing.length})`} rowClass={() => 'miss'} max={12} />}
          {g.diff.extra.length > 0 && g.got && <ResultTable rs={{ columns: g.got.columns, rows: g.diff.extra }} caption={`Shouldn't be in your result (${g.diff.extra.length})`} rowClass={() => 'extra'} max={12} />}
        </div>
      )}
      {lang === 'sql' && !g.pass && g.got && g.expected && (
        <details className="side-by-side">
          <summary>Compare full results</summary>
          <div className="sbs">
            <ResultTable rs={g.got} caption="Yours" max={30} />
            <ResultTable rs={g.expected} caption="Expected" max={30} />
          </div>
        </details>
      )}
      {g.tests && (
        <table className="rt tests">
          <thead>
            <tr>
              <th />
              <th>test</th>
              <th>expected</th>
              <th>yours</th>
            </tr>
          </thead>
          <tbody>
            {g.tests.map((t, i) => (
              <tr key={i} className={t.pass ? 'pass' : 'fail'}>
                <td>{t.pass ? '✅' : '❌'}</td>
                <td>
                  <code>{t.expr}</code>
                </td>
                <td>
                  <code>{t.expected}</code>
                </td>
                <td>
                  <code>{t.got}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {g.run && g.run.error && !g.tests?.length && <PyOutput r={g.run} />}
    </div>
  );
}

// ---------------- quiz / recall / explain ----------------

function QuizCell({ cell, k, ctx }: { cell: Extract<Cell, { kind: 'quiz' }>; k: string; ctx: CellCtx }) {
  const done = ctx.isDone(k);
  const [picked, setPicked] = useState<number | null>(done ? cell.answer : null);
  return (
    <div className="quiz">
      <div className="quiz-q">
        <span className="badge">❓ Check yourself</span> <Md text={cell.q} />
      </div>
      <div className="quiz-opts">
        {cell.options.map((o, i) => (
          <button
            key={i}
            className={'opt' + (picked === null ? '' : i === cell.answer ? ' right' : i === picked ? ' wrong' : ' dim')}
            disabled={picked !== null}
            onClick={() => {
              setPicked(i);
              const ok = i === cell.answer;
              sound(ok ? 'ok' : 'bad');
              progress.quizAnswered(ctx.lessonId, k, ok);
              ctx.done(k);
            }}
          >
            <span className="opt-n">{String.fromCharCode(65 + i)}</span> <Md text={o} />
          </button>
        ))}
      </div>
      {picked !== null && (
        <div className={'predict-res ' + (picked === cell.answer ? 'ok' : 'bad')}>
          <Md text={cell.explain} />
        </div>
      )}
    </div>
  );
}

function RecallCell({ cell, k, ctx }: { cell: Extract<Cell, { kind: 'recall' }>; k: string; ctx: CellCtx }) {
  const [shown, setShown] = useState(ctx.isDone(k));
  const [rated, setRated] = useState<string | null>(null);
  return (
    <div className="recall">
      <div className="recall-q">
        <span className="badge">🧠 Recall — no peeking</span> <Md text={cell.prompt} />
      </div>
      {!shown ? (
        <button className="primary" onClick={() => setShown(true)}>
          I've thought about it — reveal
        </button>
      ) : (
        <>
          <div className="recall-a">
            <Md text={cell.answer} />
          </div>
          {!rated && !ctx.isDone(k) && (
            <div className="row gap">
              <span className="small muted">How did you do?</span>
              {['Nailed it', 'Partly', 'Blanked'].map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    setRated(r);
                    progress.simpleCell(ctx.lessonId, k, r === 'Nailed it' ? 6 : 4, 'Recall practiced');
                    ctx.done(k);
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
          {rated === 'Blanked' && <div className="small muted">That's normal on the first pass — this idea will come back in your review queue.</div>}
        </>
      )}
    </div>
  );
}

function ExplainCell({ cell, k, ctx }: { cell: Extract<Cell, { kind: 'explain' }>; k: string; ctx: CellCtx }) {
  const prev = progress.s.notes[cell.id]?.text ?? '';
  const [text, setText] = useState(prev);
  const [saved, setSaved] = useState(!!prev);
  return (
    <div className="explain">
      <div className="explain-q">
        <span className="badge">✍️ Explain it back</span> <Md text={cell.prompt} />
      </div>
      <textarea
        id={'note-' + cell.id}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        placeholder="Write it like you're teaching a teammate. Putting it in your own words is one of the strongest memory boosters there is."
        rows={3}
      />
      <div className="row gap">
        <button
          className="primary"
          disabled={text.trim().length < 20}
          onClick={() => {
            progress.saveNote(cell.id, cell.prompt, text);
            setSaved(true);
            ctx.done(k);
          }}
        >
          {saved ? '✓ Saved to My Notes' : 'Save note'}
        </button>
        <span className="small muted">{text.trim().length < 20 ? 'a sentence or two (20+ characters)' : 'Your notes are collected on the Notes page for later review.'}</span>
      </div>
    </div>
  );
}

export { fmtCell };
