import { Component, useState, type ReactNode } from 'react';
import type { Cell, Choice, CalloutTone, VizSpec } from '../content/types';
import { Md, TeX } from './Markup';
import { ProblemCard, answerPlaceholder } from './Problem';
import { checkAnswer, answerTeX } from '../math/answer';
import { VIZ } from '../viz/registry';
import { progress } from '../progress/store';
import { CodeBlock, StepsBox, BuildBox } from './GameCells';
import { AssetsPanel } from './Assets';

export interface CellCtx {
  lessonId: string;
  moduleId: string;
  done: (i: number) => void;
  isDone: (i: number) => boolean;
}

/** Cells that must be attempted before the rest of the lesson is shown */
export const isGate = (c: Cell) => ['check', 'numeric', 'derive', 'paper', 'steps', 'build', 'recall', 'explain'].includes(c.kind);

const TONE: Record<CalloutTone, string> = {
  definition: 'Definition',
  theorem: 'Theorem',
  intuition: 'Intuition',
  example: 'Example',
  warning: 'Common mistake',
  design: 'Design note',
  godot: 'In Godot',
  remember: 'Remember',
  notation: 'Notation',
};

export function CellView({ cell, i, ctx }: { cell: Cell; i: number; ctx: CellCtx }) {
  const done = () => ctx.done(i);
  switch (cell.kind) {
    case 'text':
      return <Md text={cell.md} className="prose" />;
    case 'callout':
      return (
        <aside className={'callout c-' + cell.tone}>
          <div className="callout-k">
            {TONE[cell.tone]}
            {cell.title ? <span className="callout-title"> · {cell.title}</span> : null}
          </div>
          <Md text={cell.md} />
        </aside>
      );
    case 'viz':
      return <VizCell viz={cell.viz} caption={cell.caption} task={cell.task} />;
    case 'check':
      return <ChoiceBox c={cell} label="Check" onAnswer={done} prior={ctx.isDone(i)} />;
    case 'numeric':
      return <NumericBox cell={cell} onDone={done} prior={ctx.isDone(i)} />;
    case 'derive':
      return <DeriveBox cell={cell} onDone={done} prior={ctx.isDone(i)} />;
    case 'paper':
      return (
        <div className="paper-cell">
          <div className="cell-k">On paper</div>
          <ProblemCard
            problem={cell.problem}
            prior={progress.s.problems[cell.problem.id]?.status}
            onGraded={(s, answered) => {
              progress.gradeProblem(cell.problem.id, ctx.moduleId, s, answered);
              done();
            }}
            compact
          />
        </div>
      );
    case 'code':
      return <CodeBlock code={cell.code} file={cell.file} lang={cell.lang} note={cell.note} />;
    case 'steps':
      return <StepsBox cell={cell} onDone={done} prior={ctx.isDone(i)} />;
    case 'assets':
      return <AssetsPanel ids={cell.ids} note={cell.note} />;
    case 'build':
      return <BuildBox ch={cell.ch} onDone={done} prior={ctx.isDone(i)} />;
    case 'recall':
      return <RecallBox prompt={cell.prompt} answer={cell.answer} onDone={done} prior={ctx.isDone(i)} />;
    case 'explain':
      return <ExplainBox prompt={cell.prompt} model={cell.model} noteKey={`${ctx.lessonId}:${i}`} lessonId={ctx.lessonId} onDone={done} prior={ctx.isDone(i)} />;
  }
}

// ------------------------------------------------------------------ figures

class Boundary extends Component<{ children: ReactNode; name: string }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: Error) {
    return { err: e.message };
  }
  render() {
    if (this.state.err)
      return (
        <div className="viz-error">
          Figure "{this.props.name}" failed to render: {this.state.err}
        </div>
      );
    return this.props.children;
  }
}

export function VizCell({ viz, caption, task }: { viz: VizSpec; caption?: string; task?: string }) {
  const def = VIZ[viz.type];
  return (
    <figure className="figure">
      {task && (
        <div className="fig-task">
          <span className="fig-task-k">Try</span>
          <Md text={task} inlineOnly />
        </div>
      )}
      <Boundary name={viz.type}>{def ? <def.component spec={viz} /> : <div className="viz-error">Unknown figure type {viz.type}</div>}</Boundary>
      {caption && <Md text={caption} className="fig-caption" />}
    </figure>
  );
}

// ------------------------------------------------------------------ checkpoints

export function ChoiceBox({ c, label, onAnswer, prior }: { c: Choice; label: string; onAnswer?: (ok: boolean) => void; prior?: boolean }) {
  const [picked, setPicked] = useState<number | null>(prior ? c.answer : null);
  return (
    <div className="checkpoint">
      <div className="cell-k">{label}</div>
      <Md text={c.q} className="cp-q" />
      <div className="cp-opts" role="radiogroup">
        {c.options.map((o, i) => (
          <button
            key={i}
            role="radio"
            aria-checked={picked === i}
            className={'cp-opt' + (picked === null ? '' : i === c.answer ? ' right' : i === picked ? ' wrong' : ' dim')}
            disabled={picked !== null}
            onClick={() => {
              setPicked(i);
              onAnswer?.(i === c.answer);
            }}
          >
            <span className="cp-letter">{String.fromCharCode(65 + i)}</span>
            <Md text={o} inlineOnly />
          </button>
        ))}
      </div>
      {picked !== null && (
        <div className={'cp-explain ' + (picked === c.answer ? 'ok' : 'bad')}>
          <b>{picked === c.answer ? 'Correct.' : `Not ${String.fromCharCode(65 + picked)}. The answer is ${String.fromCharCode(65 + c.answer)}.`}</b> <Md text={c.explain} inlineOnly />
        </div>
      )}
    </div>
  );
}

function NumericBox({ cell, onDone, prior }: { cell: Extract<Cell, { kind: 'numeric' }>; onDone: () => void; prior?: boolean }) {
  const [input, setInput] = useState('');
  const [res, setRes] = useState<ReturnType<typeof checkAnswer> | null>(null);
  const [tries, setTries] = useState(0);
  const [hints, setHints] = useState(0);
  const [revealed, setRevealed] = useState(!!prior);
  const check = () => {
    const r = checkAnswer(cell.answer, input);
    setRes(r);
    if (!r.error) setTries(tries + 1);
    if (r.ok) {
      setRevealed(true);
      onDone();
    }
  };
  return (
    <div className="checkpoint numeric">
      <div className="cell-k">Compute on paper, then enter</div>
      <Md text={cell.q} className="cp-q" />
      {!revealed && (
        <div className="answer-row">
          <input className={'answer-input' + (res ? (res.ok ? ' ok' : ' bad') : '')} value={input} onChange={(e) => { setInput(e.target.value); setRes(null); }} onKeyDown={(e) => e.key === 'Enter' && input.trim() && check()} placeholder={cell.inputHint ?? answerPlaceholder(cell.answer.kind)} spellCheck={false} autoComplete="off" aria-label="your answer" />
          <button className="primary" onClick={check} disabled={!input.trim()}>
            Check
          </button>
          {cell.hints && hints < cell.hints.length && <button onClick={() => setHints(hints + 1)}>Hint</button>}
          {tries >= 2 && (
            <button
              onClick={() => {
                setRevealed(true);
                onDone();
              }}
            >
              Show answer
            </button>
          )}
        </div>
      )}
      {res && !res.ok && !revealed && <div className="answer-msg bad">{res.error ?? (res.parsed ? `You entered ${res.parsed}. Not correct yet.` : 'Not correct yet.')}</div>}
      {cell.hints?.slice(0, hints).map((h, i) => (
        <div key={i} className="hint">
          <span className="hint-k">Hint</span>
          <Md text={h} />
        </div>
      ))}
      {revealed && (
        <div className={'cp-explain ' + (res?.ok ? 'ok' : 'neutral')}>
          <div>
            <b>{res?.ok ? 'Correct.' : 'Answer:'}</b> <TeX>{answerTeX(cell.answer)}</TeX>
          </div>
          <Md text={cell.explain} />
        </div>
      )}
    </div>
  );
}

function DeriveBox({ cell, onDone, prior }: { cell: Extract<Cell, { kind: 'derive' }>; onDone: () => void; prior?: boolean }) {
  const [shown, setShown] = useState(prior ? cell.steps.length : 0);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const next = cell.steps[shown];
  const advance = () => {
    const n = shown + 1;
    setShown(n);
    if (n >= cell.steps.length) onDone();
  };
  return (
    <div className="derive">
      <div className="cell-k">Derivation · {cell.title}</div>
      <Md text={cell.goal} className="derive-goal" />
      <ol className="derive-steps">
        {cell.steps.slice(0, shown).map((s, i) => (
          <li key={i}>
            <Md text={s.md} />
          </li>
        ))}
      </ol>
      {next && (
        <div className="derive-next">
          {next.choose ? (
            <div className="derive-choose">
              <Md text={next.choose.prompt} className="cp-q" />
              <div className="cp-opts">
                {next.choose.options.map((o, i) => {
                  const p = picks[shown];
                  return (
                    <button key={i} className={'cp-opt' + (p === undefined ? '' : i === next.choose!.answer ? ' right' : i === p ? ' wrong' : ' dim')} disabled={p !== undefined} onClick={() => setPicks({ ...picks, [shown]: i })}>
                      <span className="cp-letter">{String.fromCharCode(65 + i)}</span>
                      <Md text={o} inlineOnly />
                    </button>
                  );
                })}
              </div>
              {picks[shown] !== undefined && (
                <>
                  {next.choose.explain && (
                    <div className={'cp-explain ' + (picks[shown] === next.choose.answer ? 'ok' : 'bad')}>
                      <Md text={next.choose.explain} inlineOnly />
                    </div>
                  )}
                  <button className="primary" onClick={advance}>
                    Show step {shown + 1}
                  </button>
                </>
              )}
            </div>
          ) : (
            <button className="primary" onClick={advance}>
              {shown === 0 ? 'Start' : `Next step (${shown + 1}/${cell.steps.length})`}
            </button>
          )}
          <span className="muted small"> Try writing the step yourself before revealing it.</span>
        </div>
      )}
      {!next && cell.takeaway && (
        <div className="derive-takeaway">
          <Md text={cell.takeaway} />
        </div>
      )}
    </div>
  );
}

function RecallBox({ prompt, answer, onDone, prior }: { prompt: string; answer: string; onDone: () => void; prior?: boolean }) {
  const [shown, setShown] = useState(!!prior);
  const [rated, setRated] = useState<string | null>(null);
  return (
    <div className="checkpoint recall">
      <div className="cell-k">Recall without looking back</div>
      <Md text={prompt} className="cp-q" />
      {!shown ? (
        <button className="primary" onClick={() => setShown(true)}>
          Show answer
        </button>
      ) : (
        <>
          <Md text={answer} className="recall-a" />
          {!prior && (
            <div className="self-grade">
              <span>How much did you have?</span>
              {['All of it', 'Some', 'None'].map((r) => (
                <button key={r} className={rated === r ? 'on' : ''} disabled={!!rated} onClick={() => { setRated(r); onDone(); }}>
                  {r}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ExplainBox({ prompt, model, noteKey, lessonId, onDone, prior }: { prompt: string; model: string; noteKey: string; lessonId: string; onDone: () => void; prior?: boolean }) {
  const [text, setText] = useState(progress.s.notes[noteKey]?.text ?? '');
  const [shown, setShown] = useState(!!prior);
  return (
    <div className="checkpoint explain">
      <div className="cell-k">Explain it in your own words</div>
      <Md text={prompt} className="cp-q" />
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Write 2–4 sentences as if explaining to an interviewer." aria-label="your explanation" />
      <div className="row">
        <button
          className="primary"
          disabled={text.trim().length < 25}
          onClick={() => {
            progress.saveNote(noteKey, lessonId, prompt, text);
            setShown(true);
            onDone();
          }}
        >
          Save and compare
        </button>
        <span className="muted small">{text.trim().length < 25 ? 'At least a couple of sentences.' : 'Saved to Notes.'}</span>
      </div>
      {shown && (
        <div className="model-answer">
          <div className="cell-k">A strong answer</div>
          <Md text={model} />
        </div>
      )}
    </div>
  );
}

