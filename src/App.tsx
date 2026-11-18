import { useEffect, useState } from 'react';
import { MODULES, PROJECTS, ALL_LESSONS, findLesson } from './course';
import { progress, RewardEvent } from './progress/progress';
import { useProgress } from './components/hooks';
import { Home, CourseMap, ProjectsPage, QuizzesPage, Trophies, Reference, Sandbox, Ring } from './components/Pages';
import { LessonPlayer } from './components/LessonPlayer';
import { QuizView } from './components/Quiz';
import { Dojo } from './components/Dojo';
import { confetti, sound } from './components/fx';

// let the progress engine know what the course contains (for module/hero achievements)
progress.catalog = {
  moduleLessons: Object.fromEntries(MODULES.map((m) => [m.id, m.lessons.map((l) => l.id)])),
  moduleIds: MODULES.map((m) => m.id),
  projectIds: PROJECTS.map((p) => p.id),
  allLessonIds: ALL_LESSONS.map((l) => l.id),
};

function useHash() {
  const [h, setH] = useState(() => window.location.hash || '#/home');
  useEffect(() => {
    const on = () => setH(window.location.hash || '#/home');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return h;
}

const go = (h: string) => {
  window.location.hash = h;
};

export default function App() {
  useProgress();
  const hash = useHash();
  const [route, query] = hash.slice(2).split('?');
  const [page, arg] = route.split('/');
  const [rewards, setRewards] = useState<(RewardEvent & { id: number })[]>([]);
  const [levelUp, setLevelUp] = useState<RewardEvent['levelUp'] | null>(null);
  const [kbLock, setKbLock] = useState(false);

  useEffect(
    () =>
      progress.onReward((e) => {
        if (e.xp <= 0 && !e.achievements.length && !e.levelUp) return;
        const id = Math.random();
        setRewards((r) => [...r, { ...e, id }]);
        setTimeout(() => setRewards((r) => r.filter((x) => x.id !== id)), 3200);
        if (e.levelUp) {
          setLevelUp(e.levelUp);
          sound('level');
          confetti(1.8);
        }
        if (e.achievements.length) sound('done');
      }),
    [],
  );

  useEffect(() => {
    const on = () => setKbLock(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const toggleExcelKeys = async () => {
    try {
      if (document.fullscreenElement) {
        (navigator as unknown as { keyboard?: { unlock(): void } }).keyboard?.unlock();
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
        await (navigator as unknown as { keyboard?: { lock(keys?: string[]): Promise<void> } }).keyboard?.lock();
      }
    } catch {
      alert('Your browser blocked full-screen keyboard lock. Chrome or Edge on desktop support it.');
    }
  };

  let body: React.ReactNode;
  if (page === 'lesson' && arg) {
    const f = findLesson(arg);
    body = f ? <LessonPlayer key={hash} lesson={f.lesson} module={f.module} go={go} /> : <NotFound />;
  } else if (page === 'quiz' && arg) {
    const m = MODULES.find((x) => x.id === arg);
    body = m ? <QuizView key={hash} module={m} go={go} /> : <NotFound />;
  } else if (page === 'learn') body = <div className="page"><CourseMap go={go} /></div>;
  else if (page === 'dojo') body = <Dojo />;
  else if (page === 'projects') body = <ProjectsPage go={go} />;
  else if (page === 'quizzes') body = <QuizzesPage go={go} />;
  else if (page === 'trophies') body = <Trophies />;
  else if (page === 'reference') body = <Reference />;
  else if (page === 'sandbox') body = <Sandbox />;
  else body = <Home go={go} />;
  void query;

  const lv = progress.level;
  const streak = progress.streak();
  const nav = [
    ['home', 'Home'],
    ['learn', 'Learn'],
    ['dojo', 'Shortcut Dojo'],
    ['quizzes', 'Quizzes'],
    ['projects', 'Projects'],
    ['sandbox', 'Sandbox'],
    ['reference', 'Reference'],
    ['trophies', 'Trophies'],
  ];
  const full = page === 'lesson' || page === 'dojo' || page === 'sandbox';

  return (
    <div className={'app' + (full ? ' full' : '')}>
      <header className="topbar">
        <a className="brand" href="#/home">
          <span className="brand-x">X</span>
          <span>
            Excel Hero <span className="brand-sub">Academy</span>
          </span>
        </a>
        <nav>
          {nav.map(([id, label]) => (
            <a key={id} href={`#/${id}`} className={page === id || (page === '' && id === 'home') || (id === 'learn' && (page === 'lesson' || page === 'quiz')) ? 'on' : ''}>
              {label}
            </a>
          ))}
        </nav>
        <span className="grow" />
        <button className={'xkeys' + (kbLock ? ' on' : '')} onClick={toggleExcelKeys} title="Full-screen + keyboard lock so Ctrl+Tab, Ctrl+PgUp/PgDn, Ctrl+W etc. reach the app">
          ⌨ Excel Keys{kbLock ? ': ON' : ''}
        </button>
        <span className="tb-stat" title={`${streak}-day streak`}>
          {streak > 0 ? '🔥' : '🪵'} {streak}
        </span>
        <span className="tb-stat" title={`Today: ${progress.todayXp}/${progress.state.dailyGoal} XP`}>
          <Ring pct={progress.todayXp / progress.state.dailyGoal} size={26} stroke={4} />
        </span>
        <a className="tb-level" href="#/trophies" title={`${progress.state.xp} XP`}>
          <span className="lv-badge">{lv.cur.n}</span>
          <span className="lv-text">
            <span className="lv-title">{lv.cur.title}</span>
            <span className="lv-bar">
              <i style={{ width: `${lv.pct * 100}%` }} />
            </span>
          </span>
        </a>
        <button className="icon" title="Sound on/off" onClick={() => progress.toggleSound()}>
          {progress.state.sound ? '🔊' : '🔇'}
        </button>
      </header>
      <main className="content">{body}</main>
      <div className="rewards">
        {rewards.map((r) => (
          <div key={r.id} className="reward">
            {r.xp > 0 && (
              <div className="xp-pop">
                +{r.xp} XP <span className="muted small">{r.label}</span>
              </div>
            )}
            {r.achievements.map((a) => (
              <div key={a.id} className="ach-pop">
                <span className="ach-icon">{a.icon}</span>
                <div>
                  <div className="small muted">Achievement unlocked</div>
                  <b>{a.name}</b>
                  <div className="small">{a.desc}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      {levelUp && (
        <div className="dlg-backdrop" onClick={() => setLevelUp(null)}>
          <div className="levelup" onClick={(e) => e.stopPropagation()}>
            <div className="lu-badge">{levelUp.n}</div>
            <div className="muted">Promotion!</div>
            <h2>You're now {/^[AEIOU]/.test(levelUp.title) ? 'an' : 'a'} {levelUp.title}</h2>
            <p className="muted">Keep stacking reps — the next title is waiting.</p>
            <button className="primary" autoFocus onClick={() => setLevelUp(null)}>
              Let's go
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NotFound() {
  return (
    <div className="page">
      <h2>Not found</h2>
      <a href="#/home">Go home</a>
    </div>
  );
}
