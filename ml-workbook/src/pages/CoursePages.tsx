import { MODULES, LESSONS, DRILLS, QUESTIONS, moduleNumber, findModule } from '../content';
import { PARTS, AREAS } from '../content/types';
import { progress } from '../progress/store';
import { useProgress } from '../ui/hooks';
import { Md } from '../ui/Markup';
import { allItems } from './items';
import { ProblemCard } from '../ui/Problem';

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);

function Meter({ value, label }: { value: number; label?: string }) {
  return (
    <span className="meter" role="meter" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <i style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </span>
  );
}

export function Home() {
  useProgress();
  const due = progress.due();
  const dueProblems = due.filter((c) => c.id.startsWith('p:')).length;
  const nextL = LESSONS.find((l) => !progress.lessonDone(l.lesson.id));
  const streak = progress.streak();
  const items = allItems();
  return (
    <div className="page home">
      <section className="today">
        <div className="today-main">
          <h1>Linear Algebra & Machine Learning</h1>
          <p className="lede">
            {MODULES.length} modules from vectors to transformers. Each lesson pairs interactive figures with pen-and-paper work. Everything you finish is
            scheduled for spaced review.
          </p>
        </div>
        <div className="today-cards">
          <a className={'today-card' + (due.length ? ' hot' : '')} href="#review">
            <span className="tc-n">{due.length}</span>
            <span className="tc-l">due for review{dueProblems ? ` · ${dueProblems} problems to re-solve` : ''}</span>
          </a>
          {nextL && (
            <a className="today-card" href={'#l-' + nextL.lesson.id}>
              <span className="tc-k">Continue</span>
              <span className="tc-t">
                {moduleNumber(nextL.module.id)}.{nextL.index + 1} {nextL.lesson.title}
              </span>
            </a>
          )}
          <div className="today-card plain">
            <span className="tc-n">{streak}</span>
            <span className="tc-l">day{streak === 1 ? '' : 's'} in a row</span>
          </div>
        </div>
      </section>

      <section className="readiness-mini" aria-label="interview readiness">
        {AREAS.map((a) => {
          const r = progress.areaReadiness(a.id, items);
          return (
            <a key={a.id} href="#progress" className="rm">
              <span className="rm-l">{a.title}</span>
              <Meter value={r.score} label={a.title} />
              <span className="rm-v">{Math.round(r.score * 100)}%</span>
            </a>
          );
        })}
      </section>

      {PARTS.map((part, pi) => {
        const mods = MODULES.filter((m) => m.part === part.id);
        if (!mods.length) return null;
        return (
          <section key={part.id} className="part">
            <header className="part-head">
              <span className="part-num">Part {['I', 'II', 'III', 'IV', 'V', 'VI'][pi]}</span>
              <h2>{part.title}</h2>
              <p>{part.blurb}</p>
            </header>
            <ol className="mod-list">
              {mods.map((m) => {
                const done = m.lessons.filter((l) => progress.lessonDone(l.id)).length;
                const solved = m.problems.filter((p) => progress.s.problems[p.id]?.status === 'solved').length;
                const ret = progress.moduleRetention(m.id);
                return (
                  <li key={m.id}>
                    <a className="mod-row" href={'#m-' + m.id}>
                      <span className="mod-n">{moduleNumber(m.id)}</span>
                      <span className="mod-t">
                        <b>{m.title}</b>
                        <span className="mod-s">{m.summary}</span>
                      </span>
                      <span className="mod-stats">
                        <span title="lessons completed">
                          {done}/{m.lessons.length} lessons
                        </span>
                        <span title="problems solved">
                          {solved}/{m.problems.length} problems
                        </span>
                        <span title="predicted recall of this module's review items">recall {pct(ret)}</span>
                      </span>
                      <Meter value={done / Math.max(1, m.lessons.length)} label={`${m.title} progress`} />
                    </a>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

export function ModulePage({ id }: { id: string }) {
  useProgress();
  const m = findModule(id);
  if (!m) return <NotFound />;
  const n = moduleNumber(m.id);
  const drills = DRILLS.filter((d) => d.module === m.id);
  const qs = QUESTIONS.filter((q) => q.module === m.id);
  const mins = m.problems.reduce((a, p) => a + p.minutes, 0);
  return (
    <div className="page narrow module">
      <a className="crumb" href="#home">
        {PARTS.find((p) => p.id === m.part)?.title}
      </a>
      <h1>
        <span className="lesson-num">{n}</span> {m.title}
      </h1>
      <p className="lede">{m.summary}</p>
      <div className="relevance">
        <div className="cell-k">Where this is used</div>
        <Md text={m.relevance} />
      </div>
      {m.prereqs && m.prereqs.length > 0 && (
        <p className="muted small">
          Builds on:{' '}
          {m.prereqs.map((p, i) => (
            <span key={p}>
              {i > 0 && ', '}
              <a href={'#m-' + p}>{findModule(p)?.title ?? p}</a>
            </span>
          ))}
        </p>
      )}
      <h2>Lessons</h2>
      <ol className="lesson-list">
        {m.lessons.map((l, i) => (
          <li key={l.id}>
            <a href={'#l-' + l.id} className="ll-row">
              <span className="ll-n">
                {n}.{i + 1}
              </span>
              <span className="ll-t">
                <b>{l.title}</b>
                <span className="muted small">
                  ~{l.minutes} min · {l.objectives[0]}
                </span>
              </span>
              {progress.lessonDone(l.id) ? <span className="status-pill s-solved">done</span> : <span className="status-pill">open</span>}
            </a>
          </li>
        ))}
      </ol>
      <h2>Practice</h2>
      <div className="practice-grid">
        <a className="practice-card" href={'#ps-' + m.id}>
          <b>Problem set {n}</b>
          <span>
            {m.problems.length} pen-and-paper problems · ~{mins} min
          </span>
          <span className="muted small">{m.problems.filter((p) => progress.s.problems[p.id]?.status === 'solved').length} solved</span>
        </a>
        {drills.map((d) => (
          <a key={d.id} className="practice-card" href={'#drill-' + d.id}>
            <b>Drill: {d.title}</b>
            <span>{d.skill}</span>
            <span className="muted small">{progress.drillAccuracy(d.id) === null ? 'not started' : `recent accuracy ${pct(progress.drillAccuracy(d.id))}`}</span>
          </a>
        ))}
        {qs.length > 0 && (
          <a className="practice-card" href={'#interview-' + m.id}>
            <b>Interview questions</b>
            <span>{qs.length} questions with model answers</span>
          </a>
        )}
      </div>
    </div>
  );
}

export function ProblemSetPage({ id }: { id: string }) {
  useProgress();
  const m = findModule(id);
  if (!m) return <NotFound />;
  const n = moduleNumber(m.id);
  return (
    <div className="page narrow pset">
      <a className="crumb" href={'#m-' + m.id}>
        Module {n} · {m.title}
      </a>
      <h1>Problem set {n}</h1>
      <div className="pset-how">
        <p>
          Work each problem on paper first, with no notes. Where there is an answer box, enter your final result to check it. Then open the worked solution one step at a time and compare it with
          your own work. Grade yourself honestly: problems you miss come back sooner for another attempt.
        </p>
      </div>
      {m.problems.map((p, i) => (
        <ProblemCard key={p.id} problem={p} number={`${n}.${i + 1}`} prior={progress.s.problems[p.id]?.status} onGraded={(s, a) => progress.gradeProblem(p.id, m.id, s, a)} />
      ))}
    </div>
  );
}

export function ProblemsIndex() {
  useProgress();
  return (
    <div className="page narrow">
      <h1>Problem sets</h1>
      <p className="lede">University-style exercises for each module: computations, proofs and derivations to do on paper.</p>
      <ol className="mod-list">
        {MODULES.map((m) => {
          const solved = m.problems.filter((p) => progress.s.problems[p.id]?.status === 'solved').length;
          const tried = m.problems.filter((p) => progress.s.problems[p.id]).length;
          return (
            <li key={m.id}>
              <a className="mod-row" href={'#ps-' + m.id}>
                <span className="mod-n">{moduleNumber(m.id)}</span>
                <span className="mod-t">
                  <b>{m.title}</b>
                  <span className="mod-s">
                    {m.problems.length} problems · ~{m.problems.reduce((a, p) => a + p.minutes, 0)} min
                  </span>
                </span>
                <span className="mod-stats">
                  <span>{solved} solved</span>
                  <span>{tried - solved} to revisit</span>
                </span>
                <Meter value={solved / Math.max(1, m.problems.length)} />
              </a>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="page narrow">
      <h1>Not found</h1>
      <a href="#home">Back to the course</a>
    </div>
  );
}
