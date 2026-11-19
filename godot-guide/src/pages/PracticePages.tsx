import { useMemo, useRef, useState } from 'react';
import { DRILLS, MODULES, QUESTIONS, findDrill, findModule, findProblem, findQuestion, LESSONS, moduleNumber } from '../content';
import { AREAS, type Card, type DrillItem, type InterviewQ, type Area } from '../content/types';
import { progress, parseKey, itemKey, dayKey, type Rating } from '../progress/store';
import { previews } from '../progress/srs';
import { useProgress } from '../ui/hooks';
import { Md, TeX } from '../ui/Markup';
import { ProblemCard, answerPlaceholder } from '../ui/Problem';
import { checkAnswer, answerTeX } from '../math/answer';
import { Rng } from '../math/rng';
import { allItems } from './items';
import { NotFound } from './CoursePages';

const CARD_INDEX = new Map<string, { card: Card; lessonTitle: string; moduleId: string }>();
for (const { lesson, module } of LESSONS) for (const c of lesson.cards) CARD_INDEX.set(c.id, { card: c, lessonTitle: lesson.title, moduleId: module.id });

// ------------------------------------------------------------------ drills

export function DrillsIndex() {
  useProgress();
  return (
    <div className="page narrow">
      <h1>Drills</h1>
      <p className="lede">Short generated exercises for the computations you need to do fast and without errors. Every session uses new numbers. Keep scratch paper next to you.</p>
      {MODULES.filter((m) => DRILLS.some((d) => d.module === m.id)).map((m) => (
        <section key={m.id} className="drill-group">
          <h2>
            <span className="lesson-num">{moduleNumber(m.id)}</span> {m.title}
          </h2>
          <div className="practice-grid">
            {DRILLS.filter((d) => d.module === m.id).map((d) => {
              const acc = progress.drillAccuracy(d.id);
              return (
                <a key={d.id} className="practice-card" href={'#drill-' + d.id}>
                  <b>{d.title}</b>
                  <span>{d.skill}</span>
                  <span className="muted small">{acc === null ? 'not started' : `recent accuracy ${Math.round(acc * 100)}%`}</span>
                </a>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function DrillSession({ id }: { id: string }) {
  const d = findDrill(id);
  const N = 8;
  const seed = useRef(Date.now() % 2147483647);
  const items = useMemo(() => {
    if (!d) return [];
    const rng = new Rng(seed.current);
    return Array.from({ length: N }, () => d.gen(rng));
  }, [d]);
  const [i, setI] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  if (!d) return <NotFound />;
  const m = findModule(d.module);
  if (i >= N) {
    const right = results.filter(Boolean).length;
    return (
      <div className="page narrow">
        <a className="crumb" href="#drills">
          Drills
        </a>
        <h1>{d.title}</h1>
        <p className="lede">
          {right} of {N} correct.
        </p>
        <p>{right === N ? 'Clean run. This drill is scheduled again in a few days.' : 'The ones you missed are the ones to slow down on. The worked solutions show the step that most often goes wrong.'}</p>
        <div className="row gap">
          <button className="primary" onClick={() => { seed.current++; setI(0); setResults([]); }}>
            Another set
          </button>
          {m && <a className="btn" href={'#m-' + m.id}>Back to {m.title}</a>}
        </div>
      </div>
    );
  }
  return (
    <div className="page narrow">
      <a className="crumb" href="#drills">
        Drills
      </a>
      <h1>{d.title}</h1>
      <div className="session-top">
        <span>
          {i + 1} / {N}
        </span>
        <span className="meter">
          <i style={{ width: `${(i / N) * 100}%` }} />
        </span>
        <span>{results.filter(Boolean).length} correct</span>
      </div>
      <DrillCard
        key={seed.current + ':' + i}
        item={items[i]}
        onResult={(ok) => {
          progress.drillResult(d.id, d.module, ok);
          setResults([...results, ok]);
        }}
        onNext={() => setI(i + 1)}
      />
    </div>
  );
}

function DrillCard({ item, onResult, onNext }: { item: DrillItem; onResult: (ok: boolean) => void; onNext: () => void }) {
  const [input, setInput] = useState('');
  const [res, setRes] = useState<ReturnType<typeof checkAnswer> | null>(null);
  const final = res && !res.error;
  const check = () => {
    const r = checkAnswer(item.answer, input);
    setRes(r);
    if (!r.error) onResult(r.ok);
  };
  return (
    <div className="drill-card">
      <Md text={item.prompt} className="cp-q" />
      <div className="answer-row">
        <input
          autoFocus
          className={'answer-input' + (final ? (res!.ok ? ' ok' : ' bad') : '')}
          value={input}
          disabled={!!final}
          onChange={(e) => { setInput(e.target.value); setRes(null); }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            if (final) onNext();
            else if (input.trim()) check();
          }}
          placeholder={item.inputHint ?? answerPlaceholder(item.answer.kind)}
          spellCheck={false}
          autoComplete="off"
          aria-label="your answer"
        />
        {!final ? (
          <button className="primary" onClick={check} disabled={!input.trim()}>
            Check
          </button>
        ) : (
          <button className="primary" onClick={onNext} autoFocus>
            Next
          </button>
        )}
      </div>
      {res?.error && <div className="answer-msg bad">{res.error}</div>}
      {final && (
        <div className={'cp-explain ' + (res!.ok ? 'ok' : 'bad')}>
          <div>
            <b>{res!.ok ? 'Correct.' : 'Not correct.'}</b> Answer: <TeX>{answerTeX(item.answer)}</TeX>
          </div>
          <Md text={item.solution} />
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ review

export function ReviewPage() {
  useProgress();
  const [started, setStarted] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const [i, setI] = useState(0);
  const [tally, setTally] = useState({ ok: 0, miss: 0 });
  const due = progress.due();
  const start = (ahead = false) => {
    const all = ahead ? Object.values(progress.s.srs).sort((a, b) => a.due - b.due).slice(0, 15) : due;
    // interleave kinds and modules
    const keys = new Rng(Date.now() % 1e9).shuffle(all.map((c) => c.id)).slice(0, 40);
    setQueue(keys);
    setI(0);
    setTally({ ok: 0, miss: 0 });
    setStarted(true);
  };
  if (!started) {
    const kinds = { c: 0, p: 0, d: 0, q: 0 } as Record<string, number>;
    for (const c of due) kinds[c.id[0]]++;
    const fc = progress.forecast(14);
    const max = Math.max(1, ...fc);
    const total = Object.keys(progress.s.srs).length;
    return (
      <div className="page narrow">
        <h1>Review</h1>
        <p className="lede">Items come back just before you are likely to forget them. Rate honestly: a wrong "Good" pushes an item out further than you can actually remember it.</p>
        <div className="review-start">
          <div className="rs-n">{due.length}</div>
          <div>
            due now: {kinds.c} cards · {kinds.p} problems to re-solve · {kinds.d} drills · {kinds.q} design questions
          </div>
          {due.length > 0 ? (
            <button className="primary big" onClick={() => start(false)}>
              Start review
            </button>
          ) : total > 0 ? (
            <button onClick={() => start(true)}>Nothing due. Review the next 15 early</button>
          ) : (
            <p className="muted">Complete a lesson to start your deck.</p>
          )}
        </div>
        <div className="forecast">
          <div className="small muted">Due per day, next two weeks</div>
          <div className="fc-bars">
            {fc.map((n, d) => (
              <div key={d} className="fc-col" title={`${n} items`}>
                <span className="fc-v">{n || ''}</span>
                <i style={{ height: `${(n / max) * 100}%` }} />
                <span>{d === 0 ? 'today' : d % 2 === 0 ? `+${d}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (i >= queue.length)
    return (
      <div className="page narrow">
        <h1>Session done</h1>
        <p className="lede">
          {tally.ok} recalled · {tally.miss} to see again soon.
        </p>
        <button onClick={() => setStarted(false)}>Back to review</button>
      </div>
    );
  const key = queue[i];
  const done = (r: Rating) => {
    setTally((t) => (r >= 3 ? { ...t, ok: t.ok + 1 } : { ...t, miss: t.miss + 1 }));
    setI(i + 1);
  };
  return (
    <div className="page narrow">
      <div className="session-top">
        <span>
          {i + 1} / {queue.length}
        </span>
        <span className="meter">
          <i style={{ width: `${(i / queue.length) * 100}%` }} />
        </span>
      </div>
      <ReviewItem key={key} k={key} onDone={done} />
    </div>
  );
}

function RateRow({ k, onRate, suggest }: { k: string; onRate: (r: Rating) => void; suggest?: Rating }) {
  const st = progress.s.srs[k];
  const pv = st ? previews(st) : ['', '', '', ''];
  return (
    <div className="rate">
      {(['Again', 'Hard', 'Good', 'Easy'] as const).map((l, j) => (
        <button key={l} className={'rate-' + (j + 1) + (suggest === j + 1 ? ' suggest' : '')} onClick={() => onRate((j + 1) as Rating)}>
          <b>{l}</b>
          <span>{pv[j]}</span>
        </button>
      ))}
    </div>
  );
}

function ReviewItem({ k, onDone }: { k: string; onDone: (r: Rating) => void }) {
  const { kind, id } = parseKey(k);
  const rate = (r: Rating) => {
    progress.reviewed(k, r);
    onDone(r);
  };
  const [shown, setShown] = useState(false);
  const [input, setInput] = useState('');
  const [res, setRes] = useState<ReturnType<typeof checkAnswer> | null>(null);
  const [blanks, setBlanks] = useState<string[]>([]);
  const drillItem = useMemo(() => (kind === 'drill' ? findDrill(id)?.gen(new Rng(Date.now() % 1e9)) : undefined), [kind, id]);

  if (kind === 'problem') {
    const f = findProblem(id);
    if (!f) return <Missing onSkip={() => rate(3)} />;
    return (
      <div className="review-card">
        <div className="rc-src">
          Re-solve on paper · Problem set {moduleNumber(f.module.id)}, {moduleNumber(f.module.id)}.{f.index + 1}
        </div>
        <ProblemCard
          problem={f.problem}
          compact
          onGraded={(s, a) => {
            progress.gradeProblem(id, f.module.id, s, a);
            onDone(s === 'solved' ? 3 : s === 'partial' ? 2 : 1);
          }}
        />
      </div>
    );
  }
  if (kind === 'drill') {
    const d = findDrill(id);
    if (!d || !drillItem) return <Missing onSkip={() => rate(3)} />;
    const final = res && !res.error;
    return (
      <div className="review-card">
        <div className="rc-src">Drill · {d.title} (new numbers)</div>
        <Md text={drillItem.prompt} className="cp-q" />
        <div className="answer-row">
          <input className={'answer-input' + (final ? (res!.ok ? ' ok' : ' bad') : '')} value={input} disabled={!!final} onChange={(e) => { setInput(e.target.value); setRes(null); }} onKeyDown={(e) => e.key === 'Enter' && input.trim() && !final && setRes(checkAnswer(drillItem.answer, input))} placeholder={drillItem.inputHint ?? answerPlaceholder(drillItem.answer.kind)} aria-label="your answer" autoComplete="off" />
          {!final && (
            <button className="primary" onClick={() => setRes(checkAnswer(drillItem.answer, input))} disabled={!input.trim()}>
              Check
            </button>
          )}
        </div>
        {final && (
          <>
            <div className={'cp-explain ' + (res!.ok ? 'ok' : 'bad')}>
              <div>
                <b>{res!.ok ? 'Correct.' : 'Not correct.'}</b> Answer: <TeX>{answerTeX(drillItem.answer)}</TeX>
              </div>
              <Md text={drillItem.solution} />
            </div>
            <RateRow k={k} onRate={(r) => { progress.drillResult(d.id, d.module, res!.ok); rate(r); }} suggest={res!.ok ? 3 : 1} />
          </>
        )}
      </div>
    );
  }
  if (kind === 'question') {
    const q = findQuestion(id);
    if (!q) return <Missing onSkip={() => rate(3)} />;
    return (
      <div className="review-card">
        <div className="rc-src">Design question · {AREAS.find((a) => a.id === q.area)?.title}</div>
        <Md text={q.q} className="rc-front" />
        {!shown ? (
          <button className="primary" onClick={() => setShown(true)}>
            Answer out loud, then show the model answer
          </button>
        ) : (
          <>
            <QAnswer q={q} />
            <RateRow k={k} onRate={rate} />
          </>
        )}
      </div>
    );
  }
  const entry = CARD_INDEX.get(id);
  if (!entry) return <Missing onSkip={() => rate(3)} />;
  const card = entry.card;
  const src = <div className="rc-src">Module {moduleNumber(entry.moduleId)} · {entry.lessonTitle}</div>;
  if (card.kind === 'concept')
    return (
      <div className="review-card">
        {src}
        <Md text={card.front} className="rc-front" />
        {!shown ? (
          <button className="primary" onClick={() => setShown(true)}>
            Show answer
          </button>
        ) : (
          <>
            <Md text={card.back} className="rc-back" />
            <RateRow k={k} onRate={rate} />
          </>
        )}
      </div>
    );
  if (card.kind === 'compute') {
    const final = res && !res.error;
    return (
      <div className="review-card">
        {src}
        <Md text={card.front} className="rc-front" />
        <div className="answer-row">
          <input className={'answer-input' + (final ? (res!.ok ? ' ok' : ' bad') : '')} value={input} disabled={!!final} onChange={(e) => { setInput(e.target.value); setRes(null); }} onKeyDown={(e) => e.key === 'Enter' && input.trim() && !final && setRes(checkAnswer(card.answer, input))} placeholder={answerPlaceholder(card.answer.kind)} aria-label="your answer" autoComplete="off" />
          {!final && (
            <button className="primary" onClick={() => setRes(checkAnswer(card.answer, input))} disabled={!input.trim()}>
              Check
            </button>
          )}
        </div>
        {res?.error && <div className="answer-msg bad">{res.error}</div>}
        {final && (
          <>
            <div className={'cp-explain ' + (res!.ok ? 'ok' : 'bad')}>
              <div>
                Answer: <TeX>{answerTeX(card.answer)}</TeX>
              </div>
              <Md text={card.back} />
            </div>
            <RateRow k={k} onRate={rate} suggest={res!.ok ? 3 : 1} />
          </>
        )}
      </div>
    );
  }
  // cloze
  const parts = card.text.split('{{}}');
  const bl = blanks.length ? blanks : card.answers.map(() => '');
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  // a blank may list accepted spellings separated by '|', e.g. 'relu|ReLU|rectified linear unit'
  const okAt = (j: number) => card.answers[j].split('|').some((a) => norm(bl[j]) === norm(a));
  return (
    <div className="review-card">
      {src}
      <div className="rc-front cloze">
        {parts.map((p, j) => (
          <span key={j}>
            <Md text={p} inlineOnly />
            {j < parts.length - 1 && (
              <input className={'blank' + (shown ? (okAt(j) ? ' ok' : ' bad') : '')} value={bl[j]} size={Math.max(5, card.answers[j].split('|')[0].length + 1)} disabled={shown} onChange={(e) => setBlanks(bl.map((b, x) => (x === j ? e.target.value : b)))} onKeyDown={(e) => e.key === 'Enter' && setShown(true)} aria-label={`blank ${j + 1}`} autoFocus={j === 0} />
            )}
          </span>
        ))}
      </div>
      {!shown ? (
        <button className="primary" onClick={() => setShown(true)}>
          Check
        </button>
      ) : (
        <>
          {!card.answers.every((_, j) => okAt(j)) && (
            <div className="small">
              Expected:{' '}
              {card.answers.map((a, j) => (
                <code key={j}>{a.split('|')[0]}</code>
              ))}
            </div>
          )}
          <RateRow k={k} onRate={rate} suggest={card.answers.every((_, j) => okAt(j)) ? 3 : 1} />
        </>
      )}
    </div>
  );
}

function Missing({ onSkip }: { onSkip: () => void }) {
  return (
    <div className="review-card">
      <p className="muted">This item no longer exists in the course.</p>
      <button onClick={onSkip}>Skip</button>
    </div>
  );
}

function QAnswer({ q }: { q: InterviewQ }) {
  return (
    <div className="qa">
      <Md text={q.answer} className="rc-back" />
      {q.pitfalls && q.pitfalls.length > 0 && (
        <div className="qa-sub">
          <div className="cell-k">Weak answers</div>
          <ul>
            {q.pitfalls.map((p, i) => (
              <li key={i}>
                <Md text={p} inlineOnly />
              </li>
            ))}
          </ul>
        </div>
      )}
      {q.followups && q.followups.length > 0 && (
        <div className="qa-sub">
          <div className="cell-k">Likely follow-ups</div>
          <ul>
            {q.followups.map((p, i) => (
              <li key={i}>
                <Md text={p} inlineOnly />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ interview

export function InterviewPage({ module }: { module?: string }) {
  useProgress();
  const [area, setArea] = useState<Area | 'all'>('all');
  const [mod, setMod] = useState<string>(module ?? 'all');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [practice, setPractice] = useState<string[] | null>(null);
  const [pi, setPi] = useState(0);
  const list = QUESTIONS.filter((q) => (area === 'all' || q.area === area) && (mod === 'all' || q.module === mod));
  if (practice) {
    if (pi >= practice.length)
      return (
        <div className="page narrow">
          <h1>Practice done</h1>
          <p className="lede">{practice.length} questions. They are now on your review schedule.</p>
          <button onClick={() => setPractice(null)}>Back to questions</button>
        </div>
      );
    const q = findQuestion(practice[pi])!;
    return (
      <div className="page narrow">
        <div className="session-top">
          <span>
            {pi + 1} / {practice.length}
          </span>
          <span className="meter">
            <i style={{ width: `${(pi / practice.length) * 100}%` }} />
          </span>
          <button className="link" onClick={() => setPractice(null)}>
            End
          </button>
        </div>
        <PracticeQ key={q.id} q={q} onRate={(r) => { progress.practisedQuestion(q.id, q.module, r); setPi(pi + 1); }} />
      </div>
    );
  }
  const startPractice = () => {
    const keyOf = (q: InterviewQ) => progress.s.srs[itemKey('question', q.id)];
    const sorted = [...list].sort((a, b) => (keyOf(a)?.due ?? 0) - (keyOf(b)?.due ?? 0));
    setPractice(new Rng(Date.now() % 1e9).shuffle(sorted.slice(0, 10)).map((q) => q.id));
    setPi(0);
  };
  return (
    <div className="page narrow">
      <h1>Design and concept questions</h1>
      <p className="lede">Questions a game developer should be able to answer: why a system is built the way it is, how to make something feel good, what to try when it does not. Each has a model answer, common weak answers and likely follow-ups.</p>
      <div className="filters">
        <select value={area} onChange={(e) => setArea(e.target.value as Area | 'all')} aria-label="area">
          <option value="all">All areas</option>
          {AREAS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
        <select value={mod} onChange={(e) => setMod(e.target.value)} aria-label="module">
          <option value="all">All modules</option>
          {MODULES.filter((m) => QUESTIONS.some((q) => q.module === m.id)).map((m) => (
            <option key={m.id} value={m.id}>
              {moduleNumber(m.id)}. {m.title}
            </option>
          ))}
        </select>
        <span className="muted small">{list.length} questions</span>
        <button className="primary" onClick={startPractice} disabled={!list.length}>
          Practise 10
        </button>
      </div>
      <ol className="q-list">
        {list.map((q) => {
          const isOpen = open.has(q.id);
          return (
            <li key={q.id} className={'q-item' + (isOpen ? ' open' : '')}>
              <button className="q-head" onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(q.id)) n.delete(q.id); else n.add(q.id); return n; })} aria-expanded={isOpen}>
                <span className={'lvl l' + q.level}>{['', 'Screen', 'Onsite', 'Depth'][q.level]}</span>
                <Md text={q.q} inlineOnly className="q-text" />
              </button>
              {isOpen && <QAnswer q={q} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function PracticeQ({ q, onRate }: { q: InterviewQ; onRate: (r: Rating) => void }) {
  const [shown, setShown] = useState(false);
  const k = itemKey('question', q.id);
  return (
    <div className="review-card">
      <div className="rc-src">{AREAS.find((a) => a.id === q.area)?.title}</div>
      <Md text={q.q} className="rc-front" />
      {!shown ? (
        <button className="primary" onClick={() => setShown(true)}>
          Answer out loud, then show the model answer
        </button>
      ) : (
        <>
          <QAnswer q={q} />
          {progress.s.srs[k] ? <RateRow k={k} onRate={onRate} /> : (
            <div className="rate">
              {(['Again', 'Hard', 'Good', 'Easy'] as const).map((l, j) => (
                <button key={l} className={'rate-' + (j + 1)} onClick={() => onRate((j + 1) as Rating)}>
                  <b>{l}</b>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ reference

export function ReferencePage() {
  const [q, setQ] = useState('');
  const groups = MODULES.map((m) => ({
    m,
    items: m.lessons.flatMap((l, li) =>
      l.cells
        .filter((c): c is Extract<typeof c, { kind: 'callout' }> => c.kind === 'callout' && ['definition', 'theorem', 'notation', 'remember'].includes(c.tone))
        .map((c) => ({ c, l, li })),
    ),
  })).filter((g) => g.items.length);
  const match = (s: string) => !q.trim() || s.toLowerCase().includes(q.trim().toLowerCase());
  return (
    <div className="page narrow reference">
      <h1>Reference</h1>
      <p className="lede">Every definition, theorem and result from the lessons, in course order.</p>
      <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter, e.g. rank, eigen, softmax" aria-label="filter" />
      {groups.map(({ m, items }) => {
        const shown = items.filter(({ c, l }) => match(c.md + ' ' + (c.title ?? '') + ' ' + l.title + ' ' + m.title));
        if (!shown.length) return null;
        return (
          <section key={m.id}>
            <h2>
              <span className="lesson-num">{moduleNumber(m.id)}</span> {m.title}
            </h2>
            {shown.map(({ c, l, li }, i) => (
              <aside key={i} className={'callout c-' + c.tone}>
                <div className="callout-k">
                  {c.tone === 'theorem' ? 'Theorem' : c.tone === 'definition' ? 'Definition' : c.tone === 'notation' ? 'Notation' : 'Remember'}
                  {c.title ? <span className="callout-title"> · {c.title}</span> : null}
                  <a className="callout-src" href={'#l-' + l.id}>
                    {moduleNumber(m.id)}.{li + 1}
                  </a>
                </div>
                <Md text={c.md} />
              </aside>
            ))}
          </section>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ progress

export function ProgressPage() {
  useProgress();
  const items = allItems();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(false);
  const weeks = 20;
  const cells: { k: string; n: number }[] = [];
  for (let d = weeks * 7 - 1; d >= 0; d--) {
    const k = dayKey(Date.now() - d * 86400000);
    const l = progress.s.days[k];
    cells.push({ k, n: l ? l.reviews + l.cells + l.problems * 3 + l.drills : 0 });
  }
  const notes = Object.entries(progress.s.notes).sort((a, b) => b[1].at - a[1].at);
  return (
    <div className="page narrow">
      <h1>Progress</h1>
      <h2>Skill readiness</h2>
      <p className="muted small">For each area: the share of its material you have studied, multiplied by how much of it you are predicted to still remember today. Reviews raise the second number.</p>
      <div className="readiness">
        {AREAS.map((a) => {
          const r = progress.areaReadiness(a.id, items);
          return (
            <div key={a.id} className="rd-row">
              <span className="rd-l">{a.title}</span>
              <span className="meter big">
                <i style={{ width: `${r.score * 100}%` }} />
              </span>
              <span className="rd-v">{Math.round(r.score * 100)}%</span>
              <span className="rd-d muted small">
                studied {r.learned}/{r.total} · recall {Math.round(r.retention * 100)}%
              </span>
            </div>
          );
        })}
      </div>
      <h2>Modules</h2>
      <div className="md-table">
        <table className="mod-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Module</th>
              <th>Lessons</th>
              <th>Problems solved</th>
              <th>Recall</th>
            </tr>
          </thead>
          <tbody>
            {MODULES.map((m) => {
              const r = progress.moduleRetention(m.id);
              return (
                <tr key={m.id}>
                  <td>{moduleNumber(m.id)}</td>
                  <td>
                    <a href={'#m-' + m.id}>{m.title}</a>
                  </td>
                  <td>
                    {m.lessons.filter((l) => progress.lessonDone(l.id)).length}/{m.lessons.length}
                  </td>
                  <td>
                    {m.problems.filter((p) => progress.s.problems[p.id]?.status === 'solved').length}/{m.problems.length}
                  </td>
                  <td>{r === null ? '—' : `${Math.round(r * 100)}%`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h2>Activity</h2>
      <div className="heat" aria-label="activity over the last 20 weeks">
        {cells.map((c) => (
          <i key={c.k} title={`${c.k}: ${c.n}`} className={'h' + (c.n === 0 ? 0 : c.n < 10 ? 1 : c.n < 30 ? 2 : c.n < 60 ? 3 : 4)} />
        ))}
      </div>
      <h2>Your explanations</h2>
      {notes.length === 0 ? (
        <p className="muted">Explanations you write in lessons are collected here.</p>
      ) : (
        notes.map(([k, n]) => (
          <div key={k} className="note">
            <Md text={n.prompt} className="note-p" />
            <p className="note-t">{n.text}</p>
          </div>
        ))
      )}
      <h2>Settings</h2>
      <div className="settings">
        <label>
          Theme{' '}
          <select value={progress.s.theme} onChange={(e) => progress.setTheme(e.target.value as 'system')}>
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <button
          onClick={async () => {
            const c = progress.exportCode();
            try {
              await navigator.clipboard.writeText(c);
              setMsg('Progress code copied. Paste it into this page on another device.');
            } catch {
              setCode(c);
              setMsg('Copy the code from the box below.');
            }
          }}
        >
          Copy progress code
        </button>
        {confirm ? (
          <span className="row gap">
            <b>Erase all progress?</b>
            <button className="danger" onClick={() => { progress.reset(); setConfirm(false); setMsg('Progress erased.'); }}>
              Erase
            </button>
            <button onClick={() => setConfirm(false)}>Cancel</button>
          </span>
        ) : (
          <button className="danger" onClick={() => setConfirm(true)}>
            Reset progress
          </button>
        )}
      </div>
      <div className="row gap import">
        <textarea id="progress-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste a progress code to import" rows={2} />
        <button
          disabled={!code.trim()}
          onClick={() => {
            try {
              progress.importCode(code);
              setMsg('Imported.');
              setCode('');
            } catch {
              setMsg('That is not a valid progress code.');
            }
          }}
        >
          Import
        </button>
      </div>
      {msg && <p className="small">{msg}</p>}
    </div>
  );
}
