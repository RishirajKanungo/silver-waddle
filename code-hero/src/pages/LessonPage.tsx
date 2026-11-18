// A lesson notebook. Cells unlock progressively: you can't just scroll and read —
// each predict / challenge / quiz / recall must be attempted before the next part opens.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Lesson, Module } from '../course/types';
import { CellView, isGate, CellCtx } from '../components/notebook/Cells';
import { Md } from '../components/Markup';
import { progress } from '../progress/store';
import { useDb, useProgress } from '../components/hooks';
import { MODULES, lessonXp } from '../course';
import { confetti, sound } from '../components/fx';

export function LessonPage({ lesson, module, go }: { lesson: Lesson; module: Module; go: (h: string) => void }) {
  useProgress();
  const [nonce, setNonce] = useState(0);
  const db = useDb(lesson.dataset, nonce);
  const [, force] = useState(0);
  const [skipped, setSkipped] = useState<Set<number>>(new Set());
  const keys = useMemo(() => lesson.cells.map((c, i) => `${i}:${c.kind}`), [lesson]);
  const ctx: CellCtx = {
    lessonId: lesson.id,
    dataset: lesson.dataset,
    db,
    isDone: (k) => progress.cellDone(lesson.id, k),
    done: (k) => {
      progress.markCell(lesson.id, k);
      progress.save();
      force((x) => x + 1);
    },
  };
  // first gate that is not done
  let visible = lesson.cells.length;
  for (let i = 0; i < lesson.cells.length; i++) {
    if (isGate(lesson.cells[i]) && !ctx.isDone(keys[i]) && !skipped.has(i)) {
      visible = i + 1;
      break;
    }
  }
  const gates = lesson.cells.map((c, i) => (isGate(c) ? i : -1)).filter((i) => i >= 0);
  const gatesDone = gates.filter((i) => ctx.isDone(keys[i])).length;
  const allDone = gates.every((i) => ctx.isDone(keys[i]));
  const completed = progress.s.lessons[lesson.id]?.done;
  const finishedRef = useRef(false);
  useEffect(() => {
    if (allDone && !completed && !finishedRef.current) {
      finishedRef.current = true;
      const stars = 1 + (gatesDone === gates.length && skipped.size === 0 ? 1 : 0) + (progress.combo >= 3 ? 1 : 0);
      progress.lessonCompleted(lesson.id, lesson.cards.map((c) => c.id), stars, 40);
      sound('done');
      confetti(1.2);
    }
  }, [allDone, completed, gatesDone, gates.length, lesson, skipped.size]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevVisible = useRef(visible);
  useEffect(() => {
    if (visible > prevVisible.current) {
      setTimeout(() => {
        const el = document.querySelector(`[data-cell="${prevVisible.current}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        prevVisible.current = visible;
      }, 600);
    }
  }, [visible]);

  const idx = module.lessons.findIndex((l) => l.id === lesson.id);
  const next = module.lessons[idx + 1] ?? MODULES.filter((m) => m.track === module.track).find((m) => m.order > module.order)?.lessons[0];
  const mem = progress.lessonMemory(lesson.id);
  const pct = gates.length ? gatesDone / gates.length : 1;

  return (
    <div className={'lesson track-' + lesson.track}>
      <header className="lesson-head">
        <button className="link" onClick={() => go('#' + lesson.track)}>
          ← {module.icon} {module.title}
        </button>
        <h1>{lesson.title}</h1>
        <p className="muted">{lesson.summary}</p>
        <div className="lesson-meta">
          <span className="chip">⏱ ~{lesson.minutes} min</span>
          <span className="chip">⭐ up to {lessonXp(lesson)} XP</span>
          {lesson.tags.map((t) => (
            <span key={t} className="chip tag">
              {t}
            </span>
          ))}
          {mem !== null && <span className="chip mem">🧠 memory {Math.round(mem * 100)}%</span>}
          {lesson.dataset && (
            <button className="chip btn" onClick={() => setNonce(nonce + 1)} title="Throw away your changes and reload the original data">
              ↺ reset database
            </button>
          )}
        </div>
        <div className="faang">
          <span className="faang-tag">🏢 Why big tech cares</span>
          <Md text={lesson.faang} />
        </div>
        <div className="lesson-progress">
          <i style={{ width: `${pct * 100}%` }} />
        </div>
      </header>
      <div className="cells">
        {lesson.cells.slice(0, visible).map((c, i) => (
          <section key={i} className={'cell k-' + c.kind + (isGate(c) ? ' gate' : '') + (isGate(c) && ctx.isDone(keys[i]) ? ' done' : '')} data-cell={i}>
            <CellView cell={c} k={keys[i]} ctx={ctx} />
          </section>
        ))}
        {visible < lesson.cells.length && (
          <div className="locked" ref={bottomRef}>
            <div className="lock-icon">🔒</div>
            <div>
              <b>{lesson.cells.length - visible} more cells</b> unlock when you finish the one above.
              <div className="small muted">Attempting it — even getting it wrong — is what makes this stick.</div>
            </div>
            <button className="link small" onClick={() => setSkipped(new Set([...skipped, visible - 1]))}>
              skip for now
            </button>
          </div>
        )}
        {allDone && (
          <div className="lesson-done">
            <div className="ld-burst">🎉</div>
            <h2>Lesson complete</h2>
            <p>
              <b>{lesson.cards.length} flashcards</b> were added to your review deck. The first review comes back in about 12 hours — that first spaced review is the single biggest boost to remembering this.
            </p>
            <div className="row gap center">
              {next && (
                <button className="primary big" onClick={() => go('#lesson-' + next.id)}>
                  Next: {next.title} →
                </button>
              )}
              <button onClick={() => go('#review')}>Review now</button>
              <button onClick={() => go('#' + lesson.track)}>Back to track</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
