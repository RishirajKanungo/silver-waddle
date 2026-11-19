// A pen-and-paper problem: statement → (hints) → (final answer check) → worked solution revealed
// step by step → honest self-grade. Used inside lessons, on problem-set pages and in review.
import { useState } from 'react';
import type { Problem } from '../content/types';
import { Md, TeX } from './Markup';
import { checkAnswer, answerTeX } from '../math/answer';
import type { ProblemStatus } from '../progress/store';

const TYPE_LABEL: Record<Problem['type'], string> = {
  compute: 'Computation',
  derive: 'Derivation',
  design: 'Design',
  debug: 'Debugging',
  concept: 'Concept',
  'code-on-paper': 'Code on paper',
};
const DIFF = ['', 'Routine', 'Exam', 'Hard'];

export function ProblemCard({ problem, number, prior, onGraded, compact }: { problem: Problem; number?: string; prior?: ProblemStatus; onGraded?: (s: ProblemStatus, answered: boolean) => void; compact?: boolean }) {
  const [hints, setHints] = useState(0);
  const [input, setInput] = useState('');
  const [check, setCheck] = useState<ReturnType<typeof checkAnswer> | null>(null);
  const [shown, setShown] = useState(0); // solution steps revealed
  const [graded, setGraded] = useState<ProblemStatus | null>(null);
  const p = problem;
  const all = p.solution.length;
  const grade = (s: ProblemStatus) => {
    setGraded(s);
    onGraded?.(s, !!check?.ok);
  };
  return (
    <article className={'problem' + (compact ? ' compact' : '')} id={'prob-' + p.id}>
      <header className="prob-head">
        {number && <span className="prob-num">{number}</span>}
        <h3 className="prob-title">{p.title}</h3>
        <span className="prob-meta">
          {TYPE_LABEL[p.type]} · {DIFF[p.difficulty]} · ~{p.minutes} min
        </span>
        {prior && <span className={'status-pill s-' + prior}>{prior === 'solved' ? 'solved' : prior === 'partial' ? 'partly solved' : 'not yet'}</span>}
      </header>
      <Md text={p.statement} className="prob-statement" />
      <div className="prob-actions">
        {p.hints && hints < p.hints.length && shown === 0 && (
          <button onClick={() => setHints(hints + 1)}>
            Hint {hints + 1} of {p.hints.length}
          </button>
        )}
        {shown === 0 && (
          <button onClick={() => setShown(1)} className={p.answer && !check ? '' : 'primary'}>
            Show solution
          </button>
        )}
      </div>
      {p.hints?.slice(0, hints).map((h, i) => (
        <div key={i} className="hint">
          <span className="hint-k">Hint {i + 1}</span>
          <Md text={h} />
        </div>
      ))}
      {p.answer && shown === 0 && (
        <div className="answer-row">
          <label className="answer-label" htmlFor={'ans-' + p.id}>
            Final answer
          </label>
          <input
            id={'ans-' + p.id}
            className={'answer-input' + (check ? (check.ok ? ' ok' : ' bad') : '')}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setCheck(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && input.trim() && setCheck(checkAnswer(p.answer!, input))}
            placeholder={answerPlaceholder(p.answer.kind)}
            spellCheck={false}
            autoComplete="off"
          />
          <button onClick={() => setCheck(checkAnswer(p.answer!, input))} disabled={!input.trim()}>
            Check
          </button>
          {check && <span className={'answer-msg ' + (check.ok ? 'ok' : 'bad')}>{check.ok ? 'Correct.' : check.error ? check.error : 'Not this. Recheck your work, or open the solution.'}</span>}
        </div>
      )}
      {shown > 0 && (
        <section className="solution" aria-label="worked solution">
          <div className="solution-head">
            Solution
            {shown < all && (
              <span className="solution-ctl">
                <button onClick={() => setShown(shown + 1)} className="primary">
                  Next step ({shown}/{all})
                </button>
                <button onClick={() => setShown(all)}>Show all</button>
              </span>
            )}
          </div>
          <ol className="solution-steps">
            {p.solution.slice(0, shown).map((s, i) => (
              <li key={i}>
                <Md text={s} />
              </li>
            ))}
          </ol>
          {shown >= all && p.answer && (
            <div className="final-answer">
              Answer: <TeX>{answerTeX(p.answer)}</TeX>
            </div>
          )}
          {shown >= all && p.rubric && (
            <div className="rubric">
              <div className="rubric-h">A complete answer includes</div>
              <ul>
                {p.rubric.map((r, i) => (
                  <li key={i}>
                    <Md text={r} inlineOnly />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {shown >= all && (
            <div className="self-grade">
              <span>Compared with your paper:</span>
              {(['solved', 'partial', 'missed'] as ProblemStatus[]).map((s) => (
                <button key={s} className={graded === s ? 'on' : ''} onClick={() => grade(s)}>
                  {s === 'solved' ? 'I solved it' : s === 'partial' ? 'Partly' : 'Could not'}
                </button>
              ))}
              {graded && <span className="muted small">{graded === 'solved' ? 'Scheduled to re-solve in a few days.' : graded === 'partial' ? 'Scheduled to re-solve tomorrow.' : 'Scheduled to re-solve soon. Rework it from a blank page then.'}</span>}
            </div>
          )}
        </section>
      )}
    </article>
  );
}

export function answerPlaceholder(kind: string) {
  return kind === 'number' ? 'e.g. -3/4, sqrt(2), 0.25' : kind === 'vector' ? 'e.g. [1, -2, 3]' : kind === 'matrix' ? 'e.g. [[1, 2], [3, 4]]  or  1 2; 3 4' : kind === 'set' ? 'e.g. 2, 5  (any order)' : 'your answer';
}
