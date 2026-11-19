import { useEffect, useState } from 'react';
import { findLesson, moduleNumber, findModule } from './content';
import { progress } from './progress/store';
import { useProgress } from './ui/hooks';
import { Home, ModulePage, ProblemSetPage, ProblemsIndex, NotFound } from './pages/CoursePages';
import { LessonPage } from './pages/LessonPage';
import { DrillsIndex, DrillSession, ReviewPage, InterviewPage, ReferencePage, ProgressPage } from './pages/PracticePages';
import type { Module } from './content/types';

// Plain #name routes: #home, #m-la01, #l-la01-1, #ps-la01, #drill-la-det2, #interview-la01
function parse(hash: string): [string, string] {
  const t = hash.replace(/^#/, '');
  for (const p of ['m-', 'l-', 'ps-', 'drill-', 'interview-']) if (t.startsWith(p)) return [p.slice(0, -1), t.slice(p.length)];
  return [t || 'home', ''];
}

const NAV: [string, string][] = [
  ['home', 'Course'],
  ['review', 'Review'],
  ['problems', 'Problems'],
  ['drills', 'Drills'],
  ['interview', 'Interview'],
  ['ref', 'Reference'],
  ['progress', 'Progress'],
];

export default function App() {
  useProgress();
  const [hash, setHash] = useState(window.location.hash || '#home');
  useEffect(() => {
    const on = () => {
      setHash(window.location.hash || '#home');
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    const t = progress.s.theme;
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  });
  const [page, arg] = parse(hash);
  let body: React.ReactNode;
  let sideModule: Module | undefined;
  let activeLesson = '';
  if (page === 'l') {
    const f = findLesson(arg);
    if (f) {
      sideModule = f.module;
      activeLesson = f.lesson.id;
      body = <LessonPage key={arg} lesson={f.lesson} module={f.module} index={f.index} />;
    } else body = <NotFound />;
  } else if (page === 'm') body = <ModulePage id={arg} />;
  else if (page === 'ps') {
    sideModule = findModule(arg);
    activeLesson = 'ps';
    body = <ProblemSetPage key={arg} id={arg} />;
  } else if (page === 'problems') body = <ProblemsIndex />;
  else if (page === 'drills') body = <DrillsIndex />;
  else if (page === 'drill') body = <DrillSession key={arg} id={arg} />;
  else if (page === 'review') body = <ReviewPage />;
  else if (page === 'interview') body = <InterviewPage key={arg} module={arg || undefined} />;
  else if (page === 'ref') body = <ReferencePage />;
  else if (page === 'progress') body = <ProgressPage />;
  else body = <Home />;
  const due = progress.due().length;
  const navActive = page === 'l' || page === 'm' || page === 'ps' ? (page === 'ps' ? 'problems' : 'home') : page === 'drill' ? 'drills' : page;
  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="#home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="20" height="20">
              <path d="M3 17 L3 3 M3 17 L17 17" />
              <path d="M3 17 L14 6" className="bm-v" />
            </svg>
          </span>
          <span>Linear Algebra &amp; ML</span>
        </a>
        <nav aria-label="main">
          {NAV.map(([id, label]) => (
            <a key={id} href={'#' + id} className={navActive === id ? 'on' : ''}>
              {label}
              {id === 'review' && due > 0 && <span className="count">{due}</span>}
            </a>
          ))}
        </nav>
      </header>
      <div className={'shell' + (sideModule ? ' with-side' : '')}>
        {sideModule && <Sidebar m={sideModule} active={activeLesson} />}
        <main>{body}</main>
      </div>
    </div>
  );
}

function Sidebar({ m, active }: { m: Module; active: string }) {
  const n = moduleNumber(m.id);
  return (
    <aside className="side" aria-label="module outline">
      <a className="side-mod" href={'#m-' + m.id}>
        <span className="lesson-num">{n}</span> {m.title}
      </a>
      <ol>
        {m.lessons.map((l, i) => (
          <li key={l.id}>
            <a href={'#l-' + l.id} className={(active === l.id ? 'on ' : '') + (progress.lessonDone(l.id) ? 'done' : '')}>
              <span className="side-n">
                {n}.{i + 1}
              </span>
              {l.title}
            </a>
          </li>
        ))}
        <li>
          <a href={'#ps-' + m.id} className={active === 'ps' ? 'on' : ''}>
            <span className="side-n">PS</span>Problem set {n}
          </a>
        </li>
      </ol>
    </aside>
  );
}
