import { useEffect, useState } from 'react';
import { MODULES, LESSONS, findLesson } from './course';
import { progress, Reward, Level } from './progress/store';
import { useProgress } from './components/hooks';
import { Home, TrackPage, Playground, NotesPage, ProfilePage, Ring } from './pages/MainPages';
import { LessonPage } from './pages/LessonPage';
import { ReviewPage } from './pages/ReviewPage';
import { GymPage, ProblemPage, BossPage } from './pages/GymPages';
import { confetti, sound } from './components/fx';
import { loadSql } from './sql/engine';

progress.catalog = {
  lessonIds: LESSONS.map((l) => l.id),
  sqlBoss: MODULES.filter((m) => m.track === 'sql' && m.boss.length).map((m) => m.id),
  pyBoss: MODULES.filter((m) => m.track === 'python' && m.boss.length).map((m) => m.id),
};
loadSql(); // warm up SQLite in the background

// Plain hash routes (#home, #lesson-sql01-l1, #problem-py-gym-fizzbuzz, #boss-sql03)
const PAGES = ['home', 'sql', 'python', 'lesson', 'review', 'gym', 'problem', 'boss', 'play', 'notes', 'profile'];
function parse(hash: string): [string, string | undefined] {
  const t = hash.replace(/^#\/?/, '');
  const i = t.indexOf('-');
  const page = i < 0 ? t : t.slice(0, i);
  if (!PAGES.includes(page)) return ['home', undefined];
  return [page, i < 0 ? undefined : t.slice(i + 1)];
}
const go = (h: string) => {
  if (window.location.hash === h) window.dispatchEvent(new Event('ch-reload'));
  else window.location.hash = h;
  window.scrollTo({ top: 0 });
};

export default function App() {
  useProgress();
  const [hash, setHash] = useState(window.location.hash || '#home');
  const [nonce, setNonce] = useState(0);
  const [toasts, setToasts] = useState<(Reward & { id: number })[]>([]);
  const [levelUp, setLevelUp] = useState<Level | null>(null);
  const [chest, setChest] = useState<{ gems: number; xp: number } | null>(null);
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#home');
    const again = () => setNonce((n) => n + 1);
    window.addEventListener('hashchange', on);
    window.addEventListener('ch-reload', again);
    return () => {
      window.removeEventListener('hashchange', on);
      window.removeEventListener('ch-reload', again);
    };
  }, []);
  useEffect(
    () =>
      progress.onReward((r) => {
        const id = Math.random();
        setToasts((t) => [...t.slice(-3), { ...r, id }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
        if (r.levelUp) {
          setLevelUp(r.levelUp);
          sound('level');
          confetti(1.8);
        } else if (r.achievements.length) sound('done');
        if (r.chest) {
          setChest(r.chest);
          sound('chest');
        }
      }),
    [],
  );
  useEffect(() => {
    document.documentElement.dataset.skin = progress.s.theme;
  });

  const [page, arg] = parse(hash);
  const key = hash + '#' + nonce;
  let body: React.ReactNode;
  if (page === 'lesson' && arg) {
    const f = findLesson(arg);
    body = f ? <LessonPage key={key} lesson={f.lesson} module={f.module} go={go} /> : <NotFound />;
  } else if (page === 'sql' || page === 'python') body = <TrackPage track={page} go={go} />;
  else if (page === 'review') body = <ReviewPage key={key} go={go} />;
  else if (page === 'gym') body = <GymPage go={go} />;
  else if (page === 'problem' && arg) body = <ProblemPage key={key} id={arg} go={go} />;
  else if (page === 'boss' && arg) body = <BossPage key={key} moduleId={arg} go={go} />;
  else if (page === 'play') body = <Playground />;
  else if (page === 'notes') body = <NotesPage go={go} />;
  else if (page === 'profile') body = <ProfilePage />;
  else body = <Home go={go} />;

  const lv = progress.level;
  const due = progress.dueCards().length;
  const streak = progress.streak();
  const nav: [string, string, string][] = [
    ['home', 'Home', '🏠'],
    ['sql', 'SQL', '🗄️'],
    ['python', 'Python', '🐍'],
    ['review', 'Review', '🗓️'],
    ['gym', 'Gym', '🏋️'],
    ['play', 'Playground', '🧪'],
    ['notes', 'Notes', '✍️'],
  ];
  const active = page === 'lesson' ? findLesson(arg ?? '')?.lesson.track : page === 'problem' || page === 'boss' ? 'gym' : page;
  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="#home">
          <span className="logo">⌘</span>
          <span>
            Code<b>Hero</b>
          </span>
        </a>
        <nav>
          {nav.map(([id, label, icon]) => (
            <a key={id} href={'#' + id} className={active === id ? 'on' : ''}>
              <span className="nav-i">{icon}</span>
              <span className="nav-l">{label}</span>
              {id === 'review' && due > 0 && <span className="pill">{due}</span>}
            </a>
          ))}
        </nav>
        <span className="grow" />
        <span className="hud" title={`${streak}-day streak · ×${progress.multiplier().toFixed(2)} XP`}>
          {streak > 0 ? '🔥' : '🪵'} {streak}
        </span>
        <span className="hud" title="gems">
          💎 {progress.s.gems}
        </span>
        <span className="hud" title={`Today ${progress.today().xp}/${progress.s.goal} XP`}>
          <Ring pct={progress.today().xp / progress.s.goal} size={26} stroke={4} />
        </span>
        <a className="lvl" href="#profile" title={`${progress.s.xp} XP`}>
          <span className="lvl-badge">L{lv.cur.n}</span>
          <span className="lvl-txt">
            <span>{lv.cur.title}</span>
            <span className="lvl-bar">
              <i style={{ width: `${lv.pct * 100}%` }} />
            </span>
          </span>
        </a>
      </header>
      <main>{body}</main>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            {t.xp > 0 && (
              <div className="xp">
                +{t.xp} XP{t.gems > 0 ? ` · +${t.gems} 💎` : ''} {t.combo ? <span className="combo">🔥 {t.combo} combo</span> : null}
                <div className="small">{t.label}</div>
              </div>
            )}
            {t.achievements.map((a) => (
              <div key={a.id} className="ach-toast">
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
        <div className="modal" onClick={() => setLevelUp(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="lu-badge">L{levelUp.n}</div>
            <div className="muted">Promotion</div>
            <h2>You're now {levelUp.title}</h2>
            <p className="muted">+25 💎 signing bonus. The next level is waiting — keep your streak alive.</p>
            <button className="primary" autoFocus onClick={() => setLevelUp(null)}>
              Let's go
            </button>
          </div>
        </div>
      )}
      {chest && !levelUp && (
        <div className="modal" onClick={() => setChest(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="chest">🎁</div>
            <h2>Daily quests complete!</h2>
            <p>
              Mystery chest: <b>+{chest.gems} 💎</b> and <b>+{chest.xp} XP</b>
            </p>
            <button className="primary" autoFocus onClick={() => setChest(null)}>
              Nice
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
      <a href="#home">Go home</a>
    </div>
  );
}
