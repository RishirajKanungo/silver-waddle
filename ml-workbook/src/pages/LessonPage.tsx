// A lesson: prose, figures and checkpoints. Content after a checkpoint opens once you attempt it
// (right or wrong). Attempting before reading the answer is what makes it stick.
import { useEffect, useRef, useState } from 'react';
import type { Lesson, Module } from '../content/types';
import { CellView, isGate, type CellCtx } from '../ui/Cells';
import { progress } from '../progress/store';
import { useProgress } from '../ui/hooks';
import { QUESTIONS, moduleNumber, nextLesson } from '../content';
import { Md } from '../ui/Markup';

export function LessonPage({ lesson, module, index }: { lesson: Lesson; module: Module; index: number }) {
  useProgress();
  const [, force] = useState(0);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const ctx: CellCtx = {
    lessonId: lesson.id,
    moduleId: module.id,
    isDone: (i) => progress.isCellDone(lesson.id, i),
    done: (i) => {
      progress.markCell(lesson.id, i);
      force((x) => x + 1);
    },
  };
  const completed = progress.lessonDone(lesson.id);
  let visible = lesson.cells.length;
  if (!completed)
    for (let i = 0; i < lesson.cells.length; i++) {
      if (isGate(lesson.cells[i]) && !ctx.isDone(i) && !skipped.has(i)) {
        visible = i + 1;
        break;
      }
    }
  const gates = lesson.cells.map((c, i) => (isGate(c) ? i : -1)).filter((i) => i >= 0);
  const gatesDone = gates.filter((i) => ctx.isDone(i)).length;
  const allDone = gates.every((i) => ctx.isDone(i) || skipped.has(i)) && visible >= lesson.cells.length;
  const once = useRef(false);
  useEffect(() => {
    if (allDone && !completed && !once.current) {
      once.current = true;
      progress.completeLesson(
        lesson,
        module,
        QUESTIONS.filter((q) => q.module === module.id).map((q) => q.id),
      );
    }
  }, [allDone, completed, lesson, module]);
  const next = nextLesson(lesson.id);
  const isLastOfModule = index === module.lessons.length - 1;
  return (
    <article className="lesson">
      <header className="lesson-head">
        <a className="crumb" href={'#m-' + module.id}>
          Module {moduleNumber(module.id)} · {module.title}
        </a>
        <h1>
          <span className="lesson-num">
            {moduleNumber(module.id)}.{index + 1}
          </span>{' '}
          {lesson.title}
        </h1>
        <div className="lesson-meta">
          <span>~{lesson.minutes} min</span>
          <span>
            {gatesDone}/{gates.length} checkpoints
          </span>
          {completed && <span className="status-pill s-solved">completed</span>}
        </div>
        <div className="objectives">
          <div className="objectives-k">After this lesson you can</div>
          <ul>
            {lesson.objectives.map((o, i) => (
              <li key={i}>
                <Md text={o} inlineOnly />
              </li>
            ))}
          </ul>
        </div>
      </header>
      <div className="cells">
        {lesson.cells.slice(0, visible).map((c, i) => (
          <section key={i} className={'cell k-' + c.kind + (isGate(c) ? ' gate' : '') + (isGate(c) && ctx.isDone(i) ? ' done' : '')} data-cell={i}>
            <CellView cell={c} i={i} ctx={ctx} />
          </section>
        ))}
      </div>
      {visible < lesson.cells.length && (
        <div className="locked">
          <span>The rest of the lesson opens after this checkpoint.</span>
          <button className="link" onClick={() => setSkipped(new Set([...skipped, visible - 1]))}>
            Skip it
          </button>
        </div>
      )}
      {(allDone || completed) && (
        <footer className="lesson-end">
          <div>
            <b>Lesson complete.</b> {lesson.cards.length} review cards were added to your queue{isLastOfModule ? ', along with this module’s interview questions' : ''}. They come back on a schedule that adapts to how well you recall them.
          </div>
          <div className="row gap">
            {isLastOfModule && (
              <a className="btn" href={'#ps-' + module.id}>
                Problem set {moduleNumber(module.id)} ({module.problems.length} problems)
              </a>
            )}
            {next && (
              <a className="btn primary" href={'#l-' + next.lesson.id}>
                Next: {moduleNumber(next.module.id)}.{next.index + 1} {next.lesson.title}
              </a>
            )}
          </div>
        </footer>
      )}
    </article>
  );
}
