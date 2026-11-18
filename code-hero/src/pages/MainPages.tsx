// Home dashboard, track maps, playground, notes and profile/shop.

import { useMemo, useState } from 'react';
import type { Track, VizSpec } from '../course/types';
import { LESSONS, MODULES, PROBLEMS, findLesson, modulesOf } from '../course';
import { ACHIEVEMENTS, LEVELS, PIPELINE, THEMES, dayKey, progress } from '../progress/store';
import { retrievability } from '../progress/srs';
import { useDb, useProgress } from '../components/hooks';
import { Editor } from '../components/Editor';
import { PyOutput, PyVisualizer, SqlOutput, runPython } from '../components/notebook/runners';
import { runSql } from '../sql/engine';
import { DATASETS } from '../sql/datasets';
import { PipelineViz, SchemaViz } from '../components/viz/SqlViz';
import { VizBody } from '../components/notebook/Cells';
import type { RunResult } from '../py/interp';
import type { RunOutput } from '../sql/engine';

type Go = (h: string) => void;

export function Ring({ pct, size = 56, stroke = 6, children, color }: { pct: number; size?: number; stroke?: number; children?: React.ReactNode; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color ?? 'var(--accent)'} strokeWidth={stroke} fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, pct))} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="ring-in">{children}</div>
    </div>
  );
}

function nextLesson(track: Track) {
  return LESSONS.find((l) => l.track === track && !progress.s.lessons[l.id]?.done) ?? null;
}

export function Home({ go }: { go: Go }) {
  useProgress();
  const p = progress;
  const { cur, next, pct } = p.level;
  const due = p.dueCards().length;
  const streak = p.streak();
  const quests = p.quests();
  const t = p.today();
  const fading = useMemo(() => {
    const byLesson = new Map<string, number[]>();
    for (const c of Object.values(p.s.cards)) {
      if (!byLesson.has(c.lessonId)) byLesson.set(c.lessonId, []);
      byLesson.get(c.lessonId)!.push(retrievability(c));
    }
    return [...byLesson.entries()].map(([id, rs]) => ({ id, r: rs.reduce((a, b) => a + b, 0) / rs.length })).sort((a, b) => a.r - b.r).slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.version]);
  const [name, setName] = useState(p.s.name);
  const ns = nextLesson('sql'), np = nextLesson('python');
  return (
    <div className="page home">
      <section className="hello">
        <div>
          <h1>{p.s.name ? `Hey ${p.s.name} — ready for today's reps?` : 'Learn SQL & Python the way you actually remember.'}</h1>
          <p className="muted">
            See it move → predict → run → fix → recall it tomorrow. Short daily sessions beat weekend marathons — your review queue is built from the forgetting curve.
          </p>
          {!p.s.name && (
            <div className="row gap">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your first name (optional)" onKeyDown={(e) => e.key === 'Enter' && (p.s.name = name, p.save())} aria-label="name" />
              <button onClick={() => { p.s.name = name; p.save(); }}>Save</button>
            </div>
          )}
        </div>
        <div className="lvl-card">
          <Ring pct={pct} size={86} stroke={8}>
            <b>L{cur.n}</b>
          </Ring>
          <div>
            <div className="lvl-title">{cur.title}</div>
            <div className="muted small">
              {p.s.xp.toLocaleString()} XP{next ? ` · ${(next.min - p.s.xp).toLocaleString()} to ${next.title}` : ''}
            </div>
            <div className="small">
              🔥 ×{p.multiplier().toFixed(2)} streak bonus · 💎 {p.s.gems} gems · 🧊 {p.s.freezes} freeze{p.s.freezes === 1 ? '' : 's'}
            </div>
          </div>
        </div>
      </section>

      <section className="today-grid">
        <button className={'tile review' + (due ? ' hot' : '')} onClick={() => go('#review')}>
          <div className="tile-big">{due}</div>
          <div className="tile-label">cards due for review</div>
          <div className="small">{due ? `~${Math.max(1, Math.round(due * 0.4))} min · do this first` : 'All caught up ✓'}</div>
        </button>
        <div className="tile">
          <Ring pct={t.xp / p.s.goal} size={64}>
            <span className="small">{Math.min(999, Math.round((t.xp / p.s.goal) * 100))}%</span>
          </Ring>
          <div>
            <div className="tile-label">daily goal</div>
            <div>
              <b>{t.xp}</b> / {p.s.goal} XP
            </div>
          </div>
        </div>
        <div className="tile">
          <div className="tile-big">{streak > 0 ? '🔥' : '🪵'} {streak}</div>
          <div className="tile-label">day streak</div>
          <Week />
        </div>
        <div className="tile quests">
          <div className="tile-label">Today's quests {t.chest ? '· 🎁 chest opened' : '· finish all 3 for a mystery chest'}</div>
          {quests.map((q, i) => {
            const v = p.questProgress(q);
            return (
              <div key={i} className={'quest' + (v >= q.target ? ' done' : '')}>
                <span>{v >= q.target ? '✅' : '◻️'} {q.label}</span>
                <span className="q-bar">
                  <i style={{ width: `${(v / q.target) * 100}%` }} />
                </span>
                <span className="small muted">+{q.gems}💎</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="tracks2">
        {(['sql', 'python'] as Track[]).map((tr) => {
          const ls = LESSONS.filter((l) => l.track === tr);
          const done = ls.filter((l) => p.s.lessons[l.id]?.done).length;
          const nl = tr === 'sql' ? ns : np;
          const stage = p.pipelineStage(tr);
          return (
            <div key={tr} className={'track-card t-' + tr}>
              <div className="tc-head">
                <span className="tc-icon">{tr === 'sql' ? '🗄️' : '🐍'}</span>
                <div>
                  <h2>{tr === 'sql' ? 'SQL' : 'Python'}</h2>
                  <div className="small muted">
                    {done}/{ls.length} lessons · {modulesOf(tr).length} modules
                  </div>
                </div>
              </div>
              <div className="bar">
                <i style={{ width: `${ls.length ? (done / ls.length) * 100 : 0}%` }} />
              </div>
              <Pipeline track={tr} stage={stage} />
              <div className="row gap">
                {nl ? (
                  <button className="primary" onClick={() => go('#lesson-' + nl.id)}>
                    {done ? 'Continue' : 'Start'}: {nl.title} →
                  </button>
                ) : (
                  <button className="primary" onClick={() => go('#' + tr)}>
                    Track complete — view
                  </button>
                )}
                <button onClick={() => go('#' + tr)}>All lessons</button>
              </div>
            </div>
          );
        })}
      </section>

      {fading.length > 0 && (
        <section className="memmap">
          <h2>🧠 Memory map — refresh before it fades</h2>
          <div className="mm-grid">
            {fading.map(({ id, r }) => {
              const l = findLesson(id)?.lesson;
              if (!l) return null;
              return (
                <button key={id} className="mm" onClick={() => go('#lesson-' + id)} title="Open the lesson">
                  <span className="mm-name">
                    {l.track === 'sql' ? '🗄️' : '🐍'} {l.title}
                  </span>
                  <span className="mm-bar">
                    <i style={{ width: `${r * 100}%`, background: r > 0.85 ? 'var(--ok)' : r > 0.7 ? 'var(--warn)' : 'var(--bad)' }} />
                  </span>
                  <span className="small">{Math.round(r * 100)}%</span>
                </button>
              );
            })}
          </div>
          <div className="small muted">Estimated chance you'd recall each lesson's key facts right now. Reviews push these back up — and each time they fade more slowly.</div>
        </section>
      )}

      <section className="how">
        <h2>How this course makes things stick</h2>
        <div className="how-grid">
          <div><b>👁 See it move</b><p className="small">Step through code and queries — watch pointers, rows and frames change.</p></div>
          <div><b>🔮 Predict first</b><p className="small">Guess before you run. Being surprised is what tells your brain "remember this".</p></div>
          <div><b>🏋️ Trial & error</b><p className="small">Every challenge shows exactly what's wrong: missing rows, failing tests, plain-English errors.</p></div>
          <div><b>🗓️ Spaced review</b><p className="small">Flashcards return right before you'd forget them, then less and less often.</p></div>
          <div><b>✍️ Explain it back</b><p className="small">Writing it in your own words is one of the strongest memory boosters there is.</p></div>
          <div><b>🎯 Interview loops</b><p className="small">Boss rounds simulate FAANG-style loops and move you toward an "offer".</p></div>
        </div>
      </section>
    </div>
  );
}

function Week() {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const k = dayKey(d);
    return { k, on: (progress.s.days[k]?.xp ?? 0) > 0, frozen: progress.s.frozenDays.includes(k), label: 'SMTWTFS'[d.getDay()] };
  });
  return (
    <div className="week">
      {days.map((d) => (
        <span key={d.k} className={'wd' + (d.on ? ' on' : d.frozen ? ' frozen' : '')} title={d.k}>
          {d.frozen ? '🧊' : d.label}
        </span>
      ))}
    </div>
  );
}

export function Pipeline({ track, stage }: { track: Track; stage: number }) {
  const st = PIPELINE[track];
  const total = MODULES.filter((m) => m.track === track && m.boss.length).length;
  const shown = st.slice(0, Math.max(total + 1, 2));
  return (
    <div className="pipeline-mini" title="Pass each module's interview round (boss) to advance">
      {shown.map((s, i) => (
        <span key={s} className={'pm' + (i < stage ? ' done' : i === stage ? ' cur' : '')}>
          <i />
          <span className="pm-label">{i === shown.length - 1 && i >= total ? 'Offer 🎉' : s}</span>
        </span>
      ))}
    </div>
  );
}

export function TrackPage({ track, go }: { track: Track; go: Go }) {
  useProgress();
  const mods = modulesOf(track);
  const stage = progress.pipelineStage(track);
  return (
    <div className={'page track-page t-' + track}>
      <h1>{track === 'sql' ? '🗄️ SQL track' : '🐍 Python track'}</h1>
      <p className="muted">{track === 'sql' ? 'From your first SELECT to window functions, interview patterns and query performance — on real SQLite, with every intermediate step visualised.' : 'From names-and-objects to linked lists, trees, graphs, DP and interview patterns — every line of code steppable and visualised.'}</p>
      <Pipeline track={track} stage={stage} />
      <div className="modules">
        {mods.map((m) => {
          const done = m.lessons.filter((l) => progress.s.lessons[l.id]?.done).length;
          const boss = progress.s.boss[m.id];
          return (
            <div key={m.id} className={'module' + (done === m.lessons.length ? ' complete' : '')}>
              <div className="mod-head">
                <span className="mod-icon">{m.icon}</span>
                <div>
                  <div className="small muted">
                    Module {m.order} · {m.level}
                  </div>
                  <h2>{m.title}</h2>
                  <div className="small muted">{m.blurb}</div>
                </div>
              </div>
              <ol className="lessons">
                {m.lessons.map((l) => {
                  const rec = progress.s.lessons[l.id];
                  const mem = progress.lessonMemory(l.id);
                  const started = Object.keys(progress.s.cellsDone[l.id] ?? {}).length > 0;
                  return (
                    <li key={l.id}>
                      <button className="lrow" onClick={() => go('#lesson-' + l.id)}>
                        <span className={'dot' + (rec?.done ? ' on' : started ? ' half' : '')}>{rec?.done ? '✓' : ''}</span>
                        <span className="l-title">{l.title}</span>
                        {mem !== null && (
                          <span className="l-mem" title={`memory ${Math.round(mem * 100)}%`}>
                            <i style={{ width: `${mem * 100}%`, background: mem > 0.85 ? 'var(--ok)' : mem > 0.7 ? 'var(--warn)' : 'var(--bad)' }} />
                          </span>
                        )}
                        <span className="small muted">{rec?.done ? '★'.repeat(rec.stars) : `${l.minutes} min`}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              {m.boss.length > 0 && (
                <button className={'boss-btn' + (boss?.passed ? ' passed' : '')} onClick={() => go('#boss-' + m.id)}>
                  {boss?.passed ? '✅ Interview round passed' : `🎯 Interview round · ${m.boss.length} problems`}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <h2>Gym problems for this track</h2>
      <p className="muted small">
        {PROBLEMS.filter((p) => p.track === track && progress.s.gym[p.id]?.solved).length}/{PROBLEMS.filter((p) => p.track === track).length} solved ·{' '}
        <button className="link" onClick={() => go('#gym')}>
          open the Interview Gym →
        </button>
      </p>
    </div>
  );
}

export function Playground() {
  const [lang, setLang] = useState<Track>('python');
  const [ds, setDs] = useState('shop');
  const [nonce, setNonce] = useState(0);
  const db = useDb(lang === 'sql' ? ds : undefined, nonce);
  const [py, setPy] = useState(() => progress.s.code['play:py'] ?? `# Try anything — then press "Visualize steps"\nclass Node:\n    def __init__(self, val, next=None):\n        self.val = val\n        self.next = next\n\nhead = None\nfor v in [3, 2, 1]:\n    head = Node(v, head)\n\ncur = head\nwhile cur:\n    print(cur.val)\n    cur = cur.next\n`);
  const [q, setQ] = useState(() => progress.s.code['play:sql'] ?? 'SELECT c.city, COUNT(*) AS orders\nFROM orders o\nJOIN customers c ON c.id = o.customer_id\nGROUP BY c.city\nORDER BY orders DESC;');
  const [pyRes, setPyRes] = useState<RunResult | null>(null);
  const [sqlRes, setSqlRes] = useState<RunOutput | null>(null);
  const [viz, setViz] = useState(false);
  const [view, setView] = useState<'heap' | 'array' | 'calltree' | 'graph' | 'grid' | 'bars'>('heap');
  const [vvar, setVvar] = useState('');
  const [line, setLine] = useState<number | null>(null);
  const [pipe, setPipe] = useState(false);
  const [extra, setExtra] = useState<VizSpec | null>(null);
  return (
    <div className="page playground">
      <h1>🧪 Playground</h1>
      <div className="row gap">
        <div className="seg">
          <button className={lang === 'python' ? 'on' : ''} onClick={() => setLang('python')}>🐍 Python</button>
          <button className={lang === 'sql' ? 'on' : ''} onClick={() => setLang('sql')}>🗄️ SQL</button>
        </div>
        {lang === 'sql' && (
          <>
            <select value={ds} onChange={(e) => setDs(e.target.value)} aria-label="dataset">
              {Object.entries(DATASETS).map(([k, d]) => (
                <option key={k} value={k}>
                  {d.title} ({k})
                </option>
              ))}
            </select>
            <button onClick={() => setNonce(nonce + 1)}>↺ reset data</button>
          </>
        )}
        {lang === 'python' && (
          <>
            <select value={extra?.type ?? ''} onChange={(e) => setExtra(e.target.value ? ({ type: e.target.value } as VizSpec) : null)} aria-label="concept visualizer">
              <option value="">Concept visualizers…</option>
              <option value="bigo">Big-O race</option>
              <option value="hashmap">Hash map</option>
            </select>
          </>
        )}
      </div>
      {lang === 'python' ? (
        <div className={'code-wrap' + (viz ? ' with-viz' : '')}>
          <div className="code-main">
            <Editor value={py} lang="python" onChange={(v) => { setPy(v); progress.s.code['play:py'] = v; }} onRun={() => setPyRes(runPython(py))} line={line} minLines={12} />
            <div className="code-bar">
              <button className="run" onClick={() => { setPyRes(runPython(py)); progress.ran(); }}>▶ Run</button>
              <button className={viz ? 'on' : ''} onClick={() => setViz(!viz)}>👁 Visualize steps</button>
              {viz && (
                <>
                  <select value={view} onChange={(e) => setView(e.target.value as typeof view)} aria-label="view">
                    <option value="heap">Memory</option>
                    <option value="array">Array + pointers</option>
                    <option value="bars">Bars</option>
                    <option value="grid">Grid</option>
                    <option value="graph">Graph</option>
                    <option value="calltree">Call tree</option>
                  </select>
                  {view !== 'heap' && <input value={vvar} onChange={(e) => setVvar(e.target.value)} placeholder={view === 'calltree' ? 'function name' : 'variable name'} size={12} aria-label="variable" />}
                </>
              )}
            </div>
            {pyRes && <PyOutput r={pyRes} />}
          </div>
          {viz && <PyVisualizer key={py + view + vvar} code={py} hint={{ view, var: vvar || undefined, fn: view === 'calltree' ? vvar || undefined : undefined, pointers: ['i', 'j', 'lo', 'hi', 'mid', 'left', 'right', 'l', 'r', 'k', 'visited', 'node'] }} onLine={(n) => setLine(n)} />}
        </div>
      ) : (
        <>
          <Editor value={q} lang="sql" onChange={(v) => { setQ(v); progress.s.code['play:sql'] = v; }} onRun={() => db && setSqlRes(runSql(db, q))} minLines={8} />
          <div className="code-bar">
            <button className="run" onClick={() => { if (db) { setSqlRes(runSql(db, q)); progress.ran(); } }}>▶ Run</button>
            <button className={pipe ? 'on' : ''} onClick={() => setPipe(!pipe)}>👁 Watch it execute</button>
          </div>
          {sqlRes && <SqlOutput r={sqlRes} />}
          {pipe && db && <PipelineViz db={db} sql={q} />}
          <details className="schema-details" open>
            <summary>Schema: {DATASETS[ds].title}</summary>
            {db && <SchemaViz key={ds + nonce} db={db} />}
          </details>
        </>
      )}
      {extra && lang === 'python' && (
        <div className="viz-box">
          <VizBody viz={extra} db={null} />
        </div>
      )}
    </div>
  );
}

export function NotesPage({ go }: { go: Go }) {
  useProgress();
  const notes = Object.entries(progress.s.notes).sort((a, b) => b[1].at - a[1].at);
  return (
    <div className="page narrow">
      <h1>✍️ My Notes</h1>
      <p className="muted">Everything you've explained in your own words. Re-reading your own explanations (then trying to say them without looking) is great review.</p>
      {!notes.length && <p>No notes yet — they're written in the "Explain it back" cells at the end of lessons.</p>}
      {notes.map(([id, n]) => {
        const lid = id.replace(/-e\d+$/, '');
        const l = findLesson(lid)?.lesson;
        return (
          <div key={id} className="note-card">
            <div className="small muted">
              {l ? (
                <button className="link" onClick={() => go('#lesson-' + l.id)}>
                  {l.track === 'sql' ? '🗄️' : '🐍'} {l.title}
                </button>
              ) : id}{' '}
              · {new Date(n.at).toLocaleDateString()}
            </div>
            <div className="note-prompt">{n.prompt}</div>
            <div className="note-text">{n.text}</div>
          </div>
        );
      })}
    </div>
  );
}

export function ProfilePage() {
  useProgress();
  const s = progress.s;
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const heat = Array.from({ length: 7 * 16 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (7 * 16 - 1 - i));
    const k = dayKey(d);
    return { k, xp: s.days[k]?.xp ?? 0 };
  });
  const lv = progress.level.cur;
  return (
    <div className="page">
      <h1>🏆 Profile & Trophies</h1>
      <div className="stats-row">
        <div className="stat"><b>{s.xp.toLocaleString()}</b><span>XP</span></div>
        <div className="stat"><b>L{lv.n}</b><span>{lv.title}</span></div>
        <div className="stat"><b>{Object.values(s.lessons).filter((l) => l.done).length}/{LESSONS.length}</b><span>lessons</span></div>
        <div className="stat"><b>{Object.values(s.gym).filter((g) => g.solved).length}/{PROBLEMS.length}</b><span>gym solved</span></div>
        <div className="stat"><b>{s.counters.reviews}</b><span>reviews</span></div>
        <div className="stat"><b>{s.counters.predictFirst}</b><span>correct predictions</span></div>
        <div className="stat"><b>{progress.streak()}🔥</b><span>day streak</span></div>
        <div className="stat"><b>{s.gems}💎</b><span>gems</span></div>
      </div>
      <h2>Career ladder</h2>
      <div className="ladder">
        {LEVELS.map((l) => (
          <div key={l.n} className={'rung' + (s.xp >= l.min ? ' on' : '')}>
            <b>L{l.n}</b> {l.title}
            <span className="small muted">{l.min.toLocaleString()} XP</span>
          </div>
        ))}
      </div>
      <h2>Activity</h2>
      <div className="heat">
        {heat.map((h) => (
          <i key={h.k} title={`${h.k}: ${h.xp} XP`} className={'h' + (h.xp === 0 ? 0 : h.xp < 40 ? 1 : h.xp < 100 ? 2 : h.xp < 200 ? 3 : 4)} />
        ))}
      </div>
      <h2>Achievements ({Object.keys(s.achievements).length}/{ACHIEVEMENTS.length})</h2>
      <div className="ach-grid">
        {ACHIEVEMENTS.map((a) => (
          <div key={a.id} className={'ach' + (s.achievements[a.id] ? ' on' : '')}>
            <span className="ach-icon">{s.achievements[a.id] ? a.icon : '🔒'}</span>
            <b>{a.name}</b>
            <span className="small muted">{a.desc}</span>
          </div>
        ))}
      </div>
      <h2>Shop 💎 {s.gems}</h2>
      <div className="shop">
        <div className="shop-item">
          <b>🧊 Streak freeze</b>
          <span className="small muted">Protects your streak for one missed day (auto-used). You have {s.freezes}/2.</span>
          <button disabled={s.gems < 50 || s.freezes >= 2} onClick={() => setMsg(progress.buyFreeze() ? 'Freeze bought.' : 'Not enough gems.')}>
            50 💎
          </button>
        </div>
        {THEMES.map((t) => (
          <div key={t.id} className={'shop-item theme-' + t.id}>
            <b>🎨 {t.name} theme</b>
            <span className="swatch" />
            <button disabled={!s.ownedThemes.includes(t.id) && s.gems < t.cost} onClick={() => setMsg(progress.buyTheme(t.id) ? `${t.name} theme on.` : 'Not enough gems.')}>
              {s.theme === t.id ? '✓ In use' : s.ownedThemes.includes(t.id) ? 'Use' : `${t.cost} 💎`}
            </button>
          </div>
        ))}
      </div>
      <h2>Settings & data</h2>
      <div className="row gap wrap">
        <label className="row gap small">
          Daily XP goal
          <select value={s.goal} onChange={(e) => { s.goal = +e.target.value; progress.save(); }}>
            {[40, 80, 120, 200].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="row gap small">
          <input type="checkbox" checked={s.sound} onChange={() => { s.sound = !s.sound; progress.save(); }} /> Sound effects
        </label>
        <button
          onClick={async () => {
            const c = progress.exportCode();
            try {
              await navigator.clipboard.writeText(c);
              setMsg('Progress code copied — paste it on your other device.');
            } catch {
              setCode(c);
              setMsg('Copy the code from the box below.');
            }
          }}
        >
          ⧉ Copy progress code
        </button>
        {confirm ? (
          <span className="row gap">
            <b className="small">Erase everything?</b>
            <button className="danger" onClick={() => { progress.reset(); setConfirm(false); setMsg('Progress reset.'); }}>Yes, reset</button>
            <button onClick={() => setConfirm(false)}>Cancel</button>
          </span>
        ) : (
          <button className="danger" onClick={() => setConfirm(true)}>Reset progress</button>
        )}
      </div>
      <div className="row gap" style={{ marginTop: 10 }}>
        <textarea id="progress-code" className="code-box" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste a progress code to import" />
        <button
          disabled={!code.trim()}
          onClick={() => {
            try {
              progress.importCode(code);
              setMsg('Imported!');
              setCode('');
            } catch {
              setMsg("That isn't a valid progress code.");
            }
          }}
        >
          Import
        </button>
      </div>
      {msg && <p className="ok-text">{msg}</p>}
    </div>
  );
}
