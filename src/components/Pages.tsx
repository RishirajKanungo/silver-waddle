// Home dashboard, course map, projects, trophies, reference and sandbox pages.

import { useMemo, useRef, useState } from 'react';
import { MODULES, PROJECTS, ALL_LESSONS, lessonXp } from '../course';
import { ACHIEVEMENTS, LEVELS, progress, today } from '../progress/progress';
import { useProgress } from './hooks';
import { Keys, Markup } from './Markup';
import { COMMANDS } from '../app/commands';
import { FN_INFO } from '../engine/functions';
import { AppStore } from '../app/store';
import { ExcelWindow } from './excel/ExcelWindow';
import { makeBook, customers, loans, transactions, trades, FX_RATES } from '../course/data';
import { cellKey, Workbook } from '../engine/types';
import { usedRange, displayText } from '../app/sheetOps';
import { DRILLS } from '../course/drills';

type Go = (h: string) => void;

function nextLessonId(): string | null {
  const l = ALL_LESSONS.find((x) => !progress.lessonDone(x.id));
  return l ? l.id : null;
}

export function Ring({ pct, size = 54, stroke = 6, children }: { pct: number; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--ring-bg)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--accent)" strokeWidth={stroke} fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, pct))} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="ring-in">{children}</div>
    </div>
  );
}

export function Home({ go }: { go: Go }) {
  useProgress();
  const p = progress;
  const { cur, next, pct } = p.level;
  const nid = nextLessonId();
  const nl = nid ? ALL_LESSONS.find((l) => l.id === nid) : null;
  const done = ALL_LESSONS.filter((l) => p.lessonDone(l.id)).length;
  const streak = p.streak();
  const [name, setName] = useState(p.state.name);
  return (
    <div className="page">
      <section className="hero">
        <div className="hero-text">
          <h1>{p.state.name ? `Welcome back, ${p.state.name}.` : 'Zero to Excel Hero.'}</h1>
          <p>
            A full Excel course built for bank analysts — real shortcuts, real data-lake style extracts, cross-file VLOOKUPs, PivotTables and month-end reporting, all in a workbook that behaves like Excel. Every task checks itself as you work.
          </p>
          {!p.state.name && (
            <div className="row gap">
              <input placeholder="Your first name (optional)" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && p.setName(name)} />
              <button onClick={() => p.setName(name)}>Save</button>
            </div>
          )}
          <div className="row gap">
            {nl ? (
              <button className="primary big" onClick={() => go(`#lesson-${nl.id}`)}>
                {done ? 'Continue' : 'Start'}: {nl.title} →
              </button>
            ) : (
              <button className="primary big" onClick={() => go('#trophies')}>
                🦸 You did it — see your certificate
              </button>
            )}
            <button className="big" onClick={() => go('#dojo')}>
              ⌨️ 5-minute shortcut drill
            </button>
          </div>
        </div>
        <div className="hero-stats">
          <div className="stat-card">
            <Ring pct={pct} size={84} stroke={8}>
              <b>{cur.n}</b>
            </Ring>
            <div>
              <div className="stat-big">{cur.title}</div>
              <div className="muted small">
                {p.state.xp} XP{next ? ` · ${next.min - p.state.xp} to ${next.title}` : ' · max level'}
              </div>
            </div>
          </div>
          <div className="stat-row">
            <div className="stat-card small">
              <span className="flame">{streak > 0 ? '🔥' : '🪵'}</span>
              <div>
                <div className="stat-big">{streak} day{streak === 1 ? '' : 's'}</div>
                <div className="muted small">streak</div>
              </div>
            </div>
            <div className="stat-card small">
              <Ring pct={p.todayXp / p.state.dailyGoal} size={46} stroke={5}>
                <span className="small">{Math.min(100, Math.round((p.todayXp / p.state.dailyGoal) * 100))}%</span>
              </Ring>
              <div>
                <div className="stat-big">
                  {p.todayXp}/{p.state.dailyGoal}
                </div>
                <div className="muted small">today's XP goal</div>
              </div>
            </div>
            <div className="stat-card small">
              <span className="flame">📘</span>
              <div>
                <div className="stat-big">
                  {done}/{ALL_LESSONS.length}
                </div>
                <div className="muted small">lessons</div>
              </div>
            </div>
          </div>
          <Heatmap />
        </div>
      </section>
      <CourseMap go={go} />
    </div>
  );
}

export function Heatmap() {
  const days = progress.state.days;
  const cells: { k: string; v: number }[] = [];
  const d = new Date();
  d.setDate(d.getDate() - 7 * 12 + 1);
  for (let i = 0; i < 7 * 12; i++) {
    const k = today(d);
    cells.push({ k, v: days[k] ?? 0 });
    d.setDate(d.getDate() + 1);
  }
  const lvl = (v: number) => (v === 0 ? 0 : v < 30 ? 1 : v < 80 ? 2 : v < 160 ? 3 : 4);
  return (
    <div className="heatmap" title="Practice in the last 12 weeks">
      {cells.map((c) => (
        <i key={c.k} className={'h' + lvl(c.v)} title={`${c.k}: ${c.v} XP`} />
      ))}
    </div>
  );
}

export function CourseMap({ go }: { go: Go }) {
  useProgress();
  const levels = ['Zero', 'Foundation', 'Analyst', 'Advanced', 'Hero'] as const;
  return (
    <section className="course-map">
      <h2>The Course</h2>
      {levels.map((lv) => {
        const mods = MODULES.filter((m) => m.level === lv);
        if (!mods.length) return null;
        return (
          <div key={lv} className="level-band">
            <div className="level-name">{lv}</div>
            <div className="mod-grid">
              {mods.map((m) => {
                const done = m.lessons.filter((l) => progress.lessonDone(l.id)).length;
                const qb = progress.state.quizBest[m.id];
                return (
                  <div key={m.id} className={'mod-card' + (done === m.lessons.length ? ' complete' : '')}>
                    <div className="mod-top">
                      <span className="mod-icon">{m.icon}</span>
                      <div>
                        <h3>{m.title}</h3>
                        <div className="muted small">{m.blurb}</div>
                      </div>
                    </div>
                    <div className="bar">
                      <i style={{ width: `${(done / m.lessons.length) * 100}%` }} />
                    </div>
                    <ol className="lesson-list">
                      {m.lessons.map((l) => {
                        const rec = progress.state.lessons[l.id];
                        return (
                          <li key={l.id}>
                            <button className="lesson-link" onClick={() => go(`#lesson-${l.id}`)}>
                              <span className={'dot' + (rec ? ' on' : '')}>{rec ? '✓' : ''}</span>
                              <span className="lt">{l.title}</span>
                              <span className="lm">{rec ? '★'.repeat(rec.stars) + '☆'.repeat(3 - rec.stars) : `${l.minutes} min`}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                    <button className="quiz-btn" onClick={() => go(`#quiz-${m.id}`)}>
                      📝 Quiz {qb !== undefined ? `· best ${qb}%` : `· ${m.quiz.length} Qs`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="level-band">
        <div className="level-name">Capstones</div>
        <ProjectsGrid go={go} />
      </div>
    </section>
  );
}

function ProjectsGrid({ go }: { go: Go }) {
  return (
    <div className="mod-grid">
      {PROJECTS.map((p, i) => {
        const rec = progress.state.lessons[p.id];
        return (
          <div key={p.id} className={'mod-card project' + (rec ? ' complete' : '')}>
            <div className="mod-top">
              <span className="mod-icon">💼</span>
              <div>
                <div className="muted small">Project {i + 1} · {p.tasks.length} tasks · ~{p.minutes} min · {lessonXp(p)} XP</div>
                <h3>{p.title}</h3>
                <div className="muted small">{p.summary}</div>
              </div>
            </div>
            <button className="primary" onClick={() => go(`#lesson-${p.id}`)}>
              {rec ? `Replay (${'★'.repeat(rec.stars)})` : 'Start project →'}
            </button>
          </div>
        );
      })}
      {!PROJECTS.length && <p className="muted">Projects coming soon.</p>}
    </div>
  );
}

export function ProjectsPage({ go }: { go: Go }) {
  useProgress();
  return (
    <div className="page">
      <h1>Capstone Projects</h1>
      <p className="muted">Realistic, multi-file requests like the ones that land in an analyst's inbox. Less hand-holding, bigger rewards.</p>
      <ProjectsGrid go={go} />
    </div>
  );
}

export function QuizzesPage({ go }: { go: Go }) {
  useProgress();
  return (
    <div className="page">
      <h1>Quizzes</h1>
      <p className="muted">Each module has a quiz mixing concepts, live shortcut presses and write-the-formula questions. 80% passes.</p>
      <div className="mod-grid">
        {MODULES.map((m) => {
          const qb = progress.state.quizBest[m.id];
          return (
            <button key={m.id} className={'quiz-card' + (qb !== undefined && qb >= 80 ? ' passed' : '')} onClick={() => go(`#quiz-${m.id}`)}>
              <span className="mod-icon">{m.icon}</span>
              <b>{m.title}</b>
              <span className="muted small">{qb !== undefined ? `Best: ${qb}%` : `${m.quiz.length} questions`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Trophies() {
  useProgress();
  const s = progress.state;
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [transfer, setTransfer] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const done = ALL_LESSONS.filter((l) => progress.lessonDone(l.id)).length;
  const quizAvg = Object.values(s.quizBest).length ? Math.round(Object.values(s.quizBest).reduce((a, b) => a + b, 0) / Object.values(s.quizBest).length) : 0;
  const hero = !!s.achievements.hero;
  const lv = progress.level.cur;
  return (
    <div className="page">
      <h1>Trophy Room</h1>
      <div className="stat-row wide">
        <div className="stat-card small"><div><div className="stat-big">{s.xp}</div><div className="muted small">total XP</div></div></div>
        <div className="stat-card small"><div><div className="stat-big">{lv.title}</div><div className="muted small">level {lv.n}</div></div></div>
        <div className="stat-card small"><div><div className="stat-big">{done}/{ALL_LESSONS.length}</div><div className="muted small">lessons & projects</div></div></div>
        <div className="stat-card small"><div><div className="stat-big">{quizAvg}%</div><div className="muted small">avg best quiz</div></div></div>
        <div className="stat-card small"><div><div className="stat-big">{s.drillCorrect}</div><div className="muted small">drills nailed</div></div></div>
        <div className="stat-card small"><div><div className="stat-big">{progress.streak()}🔥</div><div className="muted small">day streak</div></div></div>
      </div>
      <h2>Career ladder</h2>
      <div className="ladder">
        {LEVELS.map((l) => (
          <div key={l.n} className={'rung' + (s.xp >= l.min ? ' on' : '')}>
            <b>{l.n}</b> {l.title}
            <span className="muted small">{l.min} XP</span>
          </div>
        ))}
      </div>
      <h2>
        Achievements ({Object.keys(s.achievements).length}/{ACHIEVEMENTS.length})
      </h2>
      <div className="ach-grid">
        {ACHIEVEMENTS.map((a) => {
          const at = s.achievements[a.id];
          return (
            <div key={a.id} className={'ach' + (at ? ' on' : '')}>
              <span className="ach-icon">{at ? a.icon : '🔒'}</span>
              <b>{a.name}</b>
              <span className="muted small">{a.desc}</span>
              {at && <span className="ach-date">{new Date(at).toLocaleDateString()}</span>}
            </div>
          );
        })}
      </div>
      <h2>Certificate</h2>
      <div className={'certificate' + (hero ? '' : ' locked')}>
        <div className="cert-inner">
          <div className="cert-small">Excel Hero Academy</div>
          <div className="cert-title">Certificate of Completion</div>
          <div className="cert-name">{s.name || 'Your Name'}</div>
          <div className="cert-small">has completed the Zero-to-Hero Excel program for bank analysts — {ALL_LESSONS.length} lessons & projects, {MODULES.length} module quizzes and the Shortcut Dojo.</div>
          <div className="cert-small">{hero ? new Date(s.achievements.hero).toLocaleDateString() : `Unlocks when every lesson and project is complete (${done}/${ALL_LESSONS.length}).`}</div>
        </div>
      </div>
      {hero && window.self === window.top && (
        <button className="primary" onClick={() => window.print()}>
          🖨 Print certificate
        </button>
      )}
      <h2>Your data</h2>
      <p className="muted small">Progress is saved in this browser. To move it to another computer, copy your progress code (or download a backup) and import it there.</p>
      <div className="row gap">
        <button
          onClick={async () => {
            const code = progress.exportJson();
            try {
              await navigator.clipboard.writeText(code);
              setMsg('Progress code copied. Paste it into the box below on the other computer.');
            } catch {
              setTransfer(code);
              setMsg('Select and copy the code in the box below.');
            }
          }}
        >
          ⧉ Copy progress code
        </button>
        <button
          onClick={() => {
            const blob = new Blob([progress.exportJson()], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `excel-hero-progress-${today()}.json`;
            a.click();
          }}
        >
          ⬇ Download backup
        </button>
        <button onClick={() => fileRef.current?.click()}>⬆ Import file</button>
        <input
          ref={fileRef}
          id="progress-file"
          type="file"
          accept="application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              progress.importJson(await f.text());
              setMsg('Progress imported.');
            } catch {
              setMsg('That file is not an Excel Hero progress export.');
            }
          }}
        />
        <label className="row gap small">
          Daily goal:
          <select id="daily-goal" value={s.dailyGoal} onChange={(e) => progress.setGoal(+e.target.value)}>
            {[30, 60, 100, 150, 250].map((g) => (
              <option key={g} value={g}>
                {g} XP
              </option>
            ))}
          </select>
        </label>
        {confirmReset ? (
          <span className="row gap">
            <b className="small">Erase all XP, stars and streaks?</b>
            <button className="danger" onClick={() => { progress.reset(); setConfirmReset(false); setMsg('Progress reset.'); }}>Yes, reset</button>
            <button onClick={() => setConfirmReset(false)}>Cancel</button>
          </span>
        ) : (
          <button className="danger" onClick={() => setConfirmReset(true)}>
            Reset progress
          </button>
        )}
      </div>
      <div className="row gap" style={{ marginTop: 10 }}>
        <textarea id="progress-code" className="code-box" placeholder="Paste a progress code here to import it" value={transfer} onChange={(e) => setTransfer(e.target.value)} />
        <button
          disabled={!transfer.trim()}
          onClick={() => {
            try {
              progress.importJson(transfer);
              setMsg('Progress imported.');
              setTransfer('');
            } catch {
              setMsg('That code is not a valid progress export.');
            }
          }}
        >
          Import code
        </button>
      </div>
      {msg && <p className="notice-inline">{msg}</p>}
    </div>
  );
}

export function Reference() {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'keys' | 'fns' | 'alt'>('keys');
  const groups = [...new Set(COMMANDS.map((c) => c.group))];
  const fns = Object.entries(FN_INFO).filter(([k, v]) => v.desc && (k + v.desc + v.cat).toLowerCase().includes(q.toLowerCase()));
  const cats = [...new Set(fns.map(([, v]) => v.cat))];
  return (
    <div className="page">
      <h1>Reference</h1>
      <div className="tabs-row">
        <button className={tab === 'keys' ? 'on' : ''} onClick={() => setTab('keys')}>Keyboard shortcuts</button>
        <button className={tab === 'alt' ? 'on' : ''} onClick={() => setTab('alt')}>Alt key-tips</button>
        <button className={tab === 'fns' ? 'on' : ''} onClick={() => setTab('fns')}>Functions ({Object.values(FN_INFO).filter((v) => v.desc).length})</button>
        <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {tab === 'keys' && (
        <>
          <div className="callout">
            <b>Browser note:</b> Chrome/Edge reserve a few keys (Ctrl+Tab, Ctrl+PgUp/PgDn, Ctrl+N/T/W). Click <b>⌨ Excel Keys</b> in the top bar to go full-screen with keyboard lock, which lets this app receive them like real Excel. Otherwise use the alternates shown (Ctrl+F6, Ctrl+Alt+PgDn). On a Mac, ⌘ works as Ctrl.
          </div>
          <div className="sc-sheet">
            {groups.map((g) => (
              <div key={g} className="sc-group">
                <h4>{g}</h4>
                {COMMANDS.filter((c) => c.group === g && c.keys?.length && !c.keys[0].includes('?') && (c.label + c.keys.join(' ')).toLowerCase().includes(q.toLowerCase())).map((c) => (
                  <div key={c.id} className="sc-row">
                    <span>{c.label}</span>
                    <span className="sc-keys">
                      {c.keys!.slice(0, 2).map((k, i) => (
                        <span key={i}>
                          {i > 0 && <span className="muted"> or </span>}
                          <Keys k={k} />
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
      {tab === 'alt' && (
        <>
          <div className="callout">
            Tap and release <kbd>Alt</kbd>, then type the letters one at a time — no need to hold anything. Each letter walks one level of the ribbon: <b>H</b> = Home, <b>A</b> = Data, <b>W</b> = View, <b>N</b> = Insert, <b>M</b> = Formulas, and the legacy Excel 2003 menus (<b>E</b> S V) still work.
          </div>
          <div className="sc-sheet">
            <div className="sc-group">
              {COMMANDS.filter((c) => c.keytip && (c.label + c.keytip).toLowerCase().includes(q.toLowerCase()))
                .sort((a, b) => a.keytip!.localeCompare(b.keytip!))
                .map((c) => (
                  <div key={c.id} className="sc-row">
                    <span>{c.label}</span>
                    <Keys k={'Alt ' + c.keytip!.split('').join(' ')} />
                  </div>
                ))}
            </div>
          </div>
        </>
      )}
      {tab === 'fns' &&
        cats.map((cat) => (
          <div key={cat} className="fn-cat">
            <h3>{cat}</h3>
            {fns
              .filter(([, v]) => v.cat === cat)
              .map(([k, v]) => (
                <div key={k} className="fn-row">
                  <code>{v.syntax}</code>
                  <span>{v.desc}</span>
                </div>
              ))}
          </div>
        ))}
    </div>
  );
}

// ---------------- Sandbox ----------------

function sampleBooks(): Workbook[] {
  const cs = customers(60, 7);
  const ls = loans(cs, 120, 11);
  const tx = transactions(200, 21);
  const tr = trades(80, 31);
  return [
    makeBook('Loan_Tape.xlsx', [
      {
        name: 'Tape',
        rows: [['Loan ID', 'Customer ID', 'Product', 'Orig Date', 'Amount', 'Balance', 'Rate', 'Term', 'DPD', 'Status', 'Branch'], ...ls.map((l) => [l.id, l.cust, l.product, l.orig, l.amount, l.balance, l.rate, l.term, l.dpd, l.status, l.branch])],
        formats: { 3: 'm/d/yyyy', 4: '#,##0', 5: '#,##0.00', 6: '0.00%' },
        widths: [90, 90, 100, 85, 85, 95, 60, 50, 45, 90, 70],
        freeze: true,
      },
    ]),
    makeBook('Customer_Master.xlsx', [
      {
        name: 'Accounts',
        rows: [['Customer ID', 'Name', 'Segment', 'Region', 'Rating', 'Since', 'Branch'], ...cs.map((c) => [c.id, c.name, c.segment, c.region, c.rating, c.since, c.branch])],
        formats: { 5: 'm/d/yyyy' },
        widths: [90, 150, 110, 90, 55, 85, 70],
        freeze: true,
      },
    ]),
    makeBook('Transactions_Q2.xlsx', [
      { name: 'Data', rows: [['Txn ID', 'Date', 'Account', 'Branch', 'Type', 'Channel', 'Amount'], ...tx.map((t) => [t.id, t.date, t.acct, t.branch, t.type, t.channel, t.amount])], formats: { 1: 'm/d/yyyy', 6: '#,##0.00' }, widths: [90, 85, 85, 70, 85, 70, 95] },
    ]),
    makeBook('Trades_Mar.xlsx', [
      { name: 'Trades', rows: [['Trade ID', 'Trade Date', 'Counterparty', 'Instrument', 'Side', 'Qty', 'Price'], ...tr.map((t) => [t.id, t.date, t.cpty, t.instrument, t.side, t.qty, t.price])], formats: { 1: 'm/d/yyyy', 5: '#,##0', 6: '#,##0.00' }, widths: [80, 85, 140, 130, 50, 70, 70] },
      { name: 'FX', rows: [['Currency', 'USD Rate'], ...FX_RATES] },
    ]),
  ];
}

export function Sandbox() {
  const store = useMemo(() => new AppStore(sampleBooks()), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const side = (
    <aside className="coach narrow-side" onMouseDown={(e) => e.stopPropagation()}>
      <div className="coach-head">
        <h2>🧪 Sandbox</h2>
        <p className="muted small">Free practice with four linked bank files. Try a cross-file VLOOKUP from Loan_Tape into Customer_Master!</p>
      </div>
      <div className="coach-body">
        <button onClick={() => store.load(sampleBooks())}>↺ Reset sample files</button>
        <button
          onClick={() => {
            const n = store.books.filter((b) => b.name.startsWith('Book')).length + 1;
            store.load([...store.books, { id: 'book' + Date.now(), name: `Book${n}.xlsx`, sheets: [{ name: 'Sheet1', cells: {}, colWidths: {} }] }], { bi: store.books.length });
          }}
        >
          ＋ New blank workbook
        </button>
        <button onClick={() => fileRef.current?.click()}>⬆ Open a CSV file…</button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const text = await f.text();
            const rows = parseCSV(text, f.name.endsWith('.tsv') ? '\t' : ',');
            const cells: Record<string, { v: string }> = {};
            rows.forEach((r, ri) => r.forEach((v, ci) => v !== '' && (cells[cellKey(ri, ci)] = { v })));
            const name = f.name.replace(/\.(csv|tsv|txt)$/i, '') + '.xlsx';
            store.load([...store.books, { id: 'csv' + Date.now(), name, sheets: [{ name: 'Sheet1', cells, colWidths: {} }] }], { bi: store.books.length });
          }}
        />
        <button
          onClick={() => {
            const sh = store.sheet;
            const u = usedRange(sh);
            if (!u) return;
            const lines: string[] = [];
            for (let r = 0; r <= u.r2; r++) {
              const row: string[] = [];
              for (let c = 0; c <= u.c2; c++) {
                const t = displayText(store.calc, store.bi, store.si, sh, r, c);
                row.push(/[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
              }
              lines.push(row.join(','));
            }
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
            a.download = `${store.book.name.replace(/\.xlsx$/, '')}-${sh.name}.csv`;
            a.click();
          }}
        >
          ⬇ Export this sheet as CSV
        </button>
        <div className="label">Ideas to try</div>
        <Markup
          text={`- In Loan_Tape, add a **Region** column: \`=VLOOKUP(B2,[Customer_Master.xlsx]Accounts!$A:$D,4,FALSE)\`
- Press [[Ctrl+[]] on that formula to jump into the other file.
- Build a pivot of Balance by Product with [[Alt]] [[N]] [[V]].
- Total Q2 deposits by branch with SUMIFS.
- Convert trade notional to USD using the FX sheet.`}
        />
      </div>
    </aside>
  );
  return (
    <div className="lesson-page">
      <ExcelWindow store={store} side={side} />
    </div>
  );
}

function parseCSV(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) {
      row.push(cur);
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += ch;
  }
  if (cur !== '' || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows.slice(0, 20000);
}

export { DRILLS };
