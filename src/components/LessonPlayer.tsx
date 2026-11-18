// Lesson player: the Excel window + a "Coach" task pane on the right.

import { useEffect, useMemo, useRef, useState } from 'react';
import { AppStore } from '../app/store';
import { ExcelWindow } from './excel/ExcelWindow';
import { CommandLog, applyStep, loadLesson, runTaskCheck } from '../course/runner';
import type { Lesson, Module } from '../course/types';
import { Markup, Keys } from './Markup';
import { progress } from '../progress/progress';
import { confetti, sound } from './fx';
import { useProgress } from './hooks';
import { ALL_LESSONS, lessonXp, MODULES, PROJECTS } from '../course';

export function LessonPlayer({ lesson, module, go }: { lesson: Lesson; module?: Module; go: (h: string) => void }) {
  useProgress();
  const store = useMemo(() => {
    const s = new AppStore();
    loadLesson(s, lesson);
    return s;
    // the player is keyed by route, so the lesson never changes under it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const log = useMemo(() => new CommandLog(), []);
  const [phase, setPhase] = useState<'intro' | 'tasks' | 'done'>('intro');
  const [ti, setTi] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [passed, setPassed] = useState(false);
  const [hintsShown, setHintsShown] = useState(0);
  const [showWhy, setShowWhy] = useState(false);
  const [showConcept, setShowConcept] = useState(false);
  const totalHints = useRef(0);
  const mouseUsed = useRef(false);
  const touched = useRef(false);
  const usedShowMe = useRef(false);
  const [result, setResult] = useState<{ stars: number; xp: number; kb: boolean } | null>(null);
  const task = lesson.tasks[ti];

  // load workbooks on lesson change
  useEffect(() => {
    log.reset();
    setTi(0);
    setPhase(lesson.tasks.every((t) => progress.taskDone(lesson.id, t.id)) ? 'intro' : 'intro');
    setPassed(false);
    setMsg(null);
    setHintsShown(0);
    totalHints.current = 0;
    mouseUsed.current = false;
    usedShowMe.current = false;
    setResult(null);
  }, [lesson, store, log]);

  useEffect(() => store.onCommand((e) => log.record(e.id, e.source)), [store, log]);

  // live checking
  useEffect(() => {
    if (phase !== 'tasks' || !task) return;
    let raf = 0;
    const startVersion = store.version;
    const run = () => {
      if (passed) return;
      const res = runTaskCheck(task, store, log);
      if (res === true) {
        setPassed(true);
        setMsg(null);
        const xp = usedShowMe.current ? Math.round((task.xp ?? 10) / 2) : task.xp ?? 10;
        const ev = progress.completeTask(lesson.id, task.id, xp);
        sound('ok');
        if (!ev) progress.save();
      } else if (store.version !== startVersion) {
        touched.current = true;
        setMsg(res);
      }
    };
    const unsub = store.subscribe(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(run);
    });
    return () => {
      unsub();
      cancelAnimationFrame(raf);
    };
  }, [phase, task, passed, store, log, lesson.id]);

  // advance after a pass
  useEffect(() => {
    if (!passed) return;
    const t = setTimeout(() => {
      if (ti + 1 < lesson.tasks.length) {
        setTi(ti + 1);
        setPassed(false);
        setMsg(null);
        setHintsShown(0);
        setShowWhy(false);
        usedShowMe.current = false;
        log.reset();
      } else finish();
    }, 1400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passed]);

  const finish = () => {
    const kb = !mouseUsed.current;
    const ev = progress.completeLesson(lesson.id, { keyboardOnly: kb, hintsUsed: totalHints.current }, lesson.kind === 'project' ? 100 : 20);
    const stars = progress.state.lessons[lesson.id]?.stars ?? 1;
    setResult({ stars: 1 + (totalHints.current === 0 ? 1 : 0) + (kb ? 1 : 0), xp: ev.xp, kb });
    void stars;
    setPhase('done');
    sound('done');
    confetti(lesson.kind === 'project' ? 1.6 : 1);
  };

  const showHint = () => {
    if (hintsShown < task.hints.length) {
      setHintsShown(hintsShown + 1);
      totalHints.current++;
    }
  };
  const showMe = () => {
    usedShowMe.current = true;
    totalHints.current += 2;
    mouseUsed.current = true;
    try {
      for (const step of task.solution) applyStep(store, step);
    } catch (e) {
      store.toast(String(e), 'warn');
    }
  };

  const all = ALL_LESSONS;
  const idx = all.findIndex((l) => l.id === lesson.id);
  const nextLesson = all[idx + 1];
  const isProject = lesson.kind === 'project';

  const side = (
    <aside className="coach" onMouseDown={(e) => e.stopPropagation()}>
      <div className="coach-head">
        <button className="link" onClick={() => go(isProject ? '#/projects' : '#/learn')}>
          ← {isProject ? 'Projects' : module?.title ?? 'Course'}
        </button>
        <h2>{lesson.title}</h2>
        <div className="steps">
          {lesson.tasks.map((t, i) => (
            <span key={t.id} className={'step' + (i < ti || (i === ti && passed) ? ' done' : i === ti && phase === 'tasks' ? ' cur' : '')} title={t.title} />
          ))}
        </div>
      </div>

      {phase === 'intro' && (
        <div className="coach-body">
          <div className="concept">
            <Markup text={lesson.intro} />
          </div>
          {!!lesson.featured?.length && (
            <div className="featured">
              <div className="label">In this {isProject ? 'project' : 'lesson'}</div>
              {lesson.featured.map((k) => (
                <span key={k} className="feat">
                  {/^[A-Z]+(\.[A-Z]+)?$/.test(k) && !/^F\d+$/.test(k) && k.length > 2 ? <code>{k}</code> : <Keys k={k} />}
                </span>
              ))}
            </div>
          )}
          <button className="primary big" onClick={() => setPhase('tasks')} autoFocus>
            Start {lesson.tasks.length} tasks →
          </button>
          <p className="muted small">The workbook on the left is live — you can explore it now. Tasks are checked automatically as you work.</p>
        </div>
      )}

      {phase === 'tasks' && task && (
        <div className="coach-body">
          <div className="task-card">
            <div className="task-num">
              Task {ti + 1} of {lesson.tasks.length} · +{task.xp ?? 10} XP
            </div>
            <h3>{task.title}</h3>
            <Markup text={task.instruction} />
            {task.why && (
              <div className="why">
                <button className="link" onClick={() => setShowWhy(!showWhy)}>
                  {showWhy ? '▾' : '▸'} Why this matters
                </button>
                {showWhy && <Markup text={task.why} />}
              </div>
            )}
          </div>
          <div className={'feedback' + (passed ? ' ok' : msg ? ' pending' : '')} aria-live="polite">
            {passed ? <>✅ Nice! {ti + 1 < lesson.tasks.length ? 'Next task coming up…' : 'Lesson complete!'}</> : msg ? <>🟡 {msg}</> : <>⌛ Waiting for you… (checked automatically)</>}
          </div>
          {task.hints.slice(0, hintsShown).map((h, i) => (
            <div key={i} className="hint">
              💡 <Markup text={h} />
            </div>
          ))}
          <div className="coach-actions">
            <button onClick={showHint} disabled={hintsShown >= task.hints.length}>
              💡 Hint {task.hints.length ? `(${hintsShown}/${task.hints.length})` : ''}
            </button>
            <button onClick={showMe} title="Performs the solution for you (half XP)">
              🎬 Show me
            </button>
          </div>
          {usedShowMe.current && task.explain && (
            <div className="hint">
              <Markup text={task.explain} />
            </div>
          )}
          <div className="coach-foot">
            <button className="link" onClick={() => setShowConcept(!showConcept)}>
              {showConcept ? 'Hide' : 'Show'} concept notes
            </button>
            <button
              className="link"
              onClick={() => {
                loadLesson(store, lesson);
                setTi(0);
                setPassed(false);
                setMsg(null);
                log.reset();
              }}
            >
              ↺ Restart lesson
            </button>
          </div>
          {showConcept && (
            <div className="concept small">
              <Markup text={lesson.intro} />
            </div>
          )}
        </div>
      )}

      {phase === 'done' && result && (
        <div className="coach-body center">
          <div className="done-burst">🎉</div>
          <h3>{isProject ? 'Project delivered!' : 'Lesson complete!'}</h3>
          <div className="stars">
            {[0, 1, 2].map((i) => (
              <span key={i} className={i < result.stars ? 'on' : ''}>
                ★
              </span>
            ))}
          </div>
          <ul className="star-why">
            <li>★ Completed</li>
            <li className={totalHints.current === 0 ? '' : 'miss'}>★ No hints used</li>
            <li className={result.kb ? '' : 'miss'}>★ Keyboard only (no mouse on the sheet)</li>
          </ul>
          <div className="xp-gain">+{result.xp} bonus XP</div>
          <div className="coach-actions col">
            {nextLesson && (
              <button className="primary big" onClick={() => go(`#/lesson/${nextLesson.id}`)} autoFocus>
                Next: {nextLesson.title} →
              </button>
            )}
            {module && (
              <button onClick={() => go(`#/quiz/${module.id}`)}>
                Take the {module.title} quiz
              </button>
            )}
            <button onClick={() => go(`#/lesson/${lesson.id}?r=${Date.now()}`)}>↺ Replay for 3 stars</button>
          </div>
        </div>
      )}
    </aside>
  );

  return (
    <div className="lesson-page">
      <ExcelWindow store={store} side={side} onMouseUse={() => (mouseUsed.current = true)} />
    </div>
  );
}

export function lessonStats() {
  const total = ALL_LESSONS.length;
  const done = ALL_LESSONS.filter((l) => progress.lessonDone(l.id)).length;
  return { total, done, modules: MODULES.length, projects: PROJECTS.length, xp: ALL_LESSONS.reduce((a, l) => a + lessonXp(l), 0) };
}
