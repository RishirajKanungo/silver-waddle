// Spaced-repetition review session. Mixed (interleaved) cards from everything you've learned.

import { useMemo, useRef, useState } from 'react';
import type { Card } from '../course/types';
import { LESSONS, findLesson } from '../course';
import { progress } from '../progress/store';
import { previews, Rating, isLeech } from '../progress/srs';
import { useProgress, useSqlReady } from '../components/hooks';
import { Md } from '../components/Markup';
import { Editor } from '../components/Editor';
import { runPython } from '../components/notebook/runners';
import { compareResults, runFresh, RunOutput } from '../sql/engine';
import { ResultTable } from '../components/viz/SqlViz';
import { confetti, sound } from '../components/fx';

const CARD_INDEX = new Map<string, { card: Card; lessonId: string }>();
for (const l of LESSONS) for (const c of l.cards) CARD_INDEX.set(c.id, { card: c, lessonId: l.id });

function shuffle<T>(xs: T[]) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function ReviewPage({ go }: { go: (h: string) => void }) {
  useProgress();
  const ready = useSqlReady();
  const [mode, setMode] = useState<'due' | 'ahead' | null>(null);
  const queue = useMemo(() => {
    if (!mode) return [];
    const all = Object.values(progress.s.cards).filter((c) => CARD_INDEX.has(c.id));
    const list = mode === 'due' ? all.filter((c) => c.due <= Date.now()) : [...all].sort((a, b) => a.due - b.due).slice(0, 15);
    return shuffle(list.map((c) => c.id)).slice(0, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  const [i, setI] = useState(0);
  const [stats, setStats] = useState({ right: 0, wrong: 0, best: 0, combo: 0 });
  const due = progress.dueCards().filter((c) => CARD_INDEX.has(c.id)).length;
  const total = Object.keys(progress.s.cards).length;

  if (!mode)
    return (
      <div className="page narrow">
        <h1>🗓️ Daily Review</h1>
        <p className="muted">Spaced repetition: each card comes back right before you'd forget it. A few minutes a day here does more for retention than an hour of re-reading.</p>
        <div className="review-start">
          <div className="big-num">{due}</div>
          <div>cards due now · {total} in your deck</div>
          {due > 0 ? (
            <button className="primary big" onClick={() => setMode('due')}>
              Start review ({Math.max(1, Math.round(due * 0.4))} min)
            </button>
          ) : total > 0 ? (
            <>
              <p>🎉 You're all caught up. Come back tomorrow — or practise ahead (smaller XP, still useful).</p>
              <button onClick={() => setMode('ahead')}>Practise ahead</button>
            </>
          ) : (
            <>
              <p>Your deck is empty — finish a lesson to unlock its flashcards.</p>
              <button className="primary" onClick={() => go('#sql')}>Start the SQL track</button> <button className="primary" onClick={() => go('#python')}>Start the Python track</button>
            </>
          )}
        </div>
        <Forecast />
      </div>
    );

  if (i >= queue.length) {
    if (queue.length) setTimeout(() => confetti(0.7), 50);
    return (
      <div className="page narrow center">
        <div className="ld-burst">🏁</div>
        <h1>Session complete</h1>
        <p>
          {stats.right} remembered · {stats.wrong} to revisit · best combo {stats.best}
        </p>
        <p className="muted">Cards you missed will come back soon; the ones you knew are now scheduled further out.</p>
        <div className="row gap center">
          <button className="primary" onClick={() => go('#home')}>Back home</button>
          <button onClick={() => { setMode(null); setI(0); }}>Review more</button>
        </div>
      </div>
    );
  }

  const id = queue[i];
  const entry = CARD_INDEX.get(id)!;
  const state = progress.s.cards[id];
  const lesson = findLesson(entry.lessonId)?.lesson;
  const rate = (r: Rating) => {
    progress.reviewed(id, r);
    const ok = r >= 3;
    setStats((s) => {
      const combo = ok ? s.combo + 1 : 0;
      return { right: s.right + (ok ? 1 : 0), wrong: s.wrong + (ok ? 0 : 1), combo, best: Math.max(s.best, combo) };
    });
    setI(i + 1);
  };
  return (
    <div className="page narrow">
      <div className="review-top">
        <span>
          Card {i + 1} / {queue.length}
        </span>
        <span className="review-bar">
          <i style={{ width: `${(i / queue.length) * 100}%` }} />
        </span>
        {stats.combo >= 2 && <span className="combo">🔥 {stats.combo} combo</span>}
      </div>
      <div className="review-card" key={id}>
        <div className="rc-src">
          {lesson?.track === 'sql' ? '🗄️' : '🐍'} {lesson?.title} {state && isLeech(state) && <span className="chip warn">tricky — take your time</span>}
        </div>
        {!ready && entry.card.kind === 'sql' ? <div className="muted">Loading SQL…</div> : <CardBody card={entry.card} state={state} onRate={rate} />}
      </div>
    </div>
  );
}

function RateButtons({ onRate, state, suggest }: { onRate: (r: Rating) => void; state: Parameters<typeof previews>[0]; suggest?: Rating }) {
  const pv = previews(state);
  const labels = ['Again', 'Hard', 'Good', 'Easy'];
  return (
    <div className="rate">
      {labels.map((l, i) => (
        <button key={l} className={'rate-' + (i + 1) + (suggest === i + 1 ? ' suggest' : '')} onClick={() => onRate((i + 1) as Rating)}>
          <b>{l}</b>
          <span>{pv[i]}</span>
        </button>
      ))}
    </div>
  );
}

function CardBody({ card, state, onRate }: { card: Card; state: NonNullable<(typeof progress.s.cards)[string]>; onRate: (r: Rating) => void }) {
  const [shown, setShown] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const t0 = useRef(performance.now());
  const [val, setVal] = useState('');
  const [blanks, setBlanks] = useState<string[]>(card.kind === 'cloze' ? card.answers.map(() => '') : []);
  const [res, setRes] = useState<null | { ok: boolean; got?: RunOutput; exp?: RunOutput }>(null);
  const autoRating = (ok: boolean): Rating => (!ok ? 1 : performance.now() - t0.current < 6000 ? 4 : 3);

  if (card.kind === 'concept')
    return (
      <>
        <Md text={card.front} className="rc-front" />
        {!shown ? (
          <button className="primary" onClick={() => setShown(true)}>
            Show answer (try to say it first)
          </button>
        ) : (
          <>
            <Md text={card.back} className="rc-back" />
            <RateButtons onRate={onRate} state={state} />
          </>
        )}
      </>
    );
  if (card.kind === 'predict') {
    const ok = picked === card.answer;
    return (
      <>
        <div className="rc-front">What does this print?</div>
        <pre className="md-code">
          <code>{card.code}</code>
        </pre>
        <div className="predict-opts">
          {card.options.map((o, i) => (
            <button
              key={i}
              className={'opt' + (picked === null ? '' : i === card.answer ? ' right' : i === picked ? ' wrong' : ' dim')}
              disabled={picked !== null}
              onClick={() => {
                setPicked(i);
                sound(i === card.answer ? 'ok' : 'bad');
              }}
            >
              <code>{o}</code>
            </button>
          ))}
        </div>
        {picked !== null && (
          <>
            <details className="small">
              <summary>Run it to confirm</summary>
              <pre className="stdout">{runPython(card.code).stdout}</pre>
            </details>
            <RateButtons onRate={onRate} state={state} suggest={autoRating(ok)} />
          </>
        )}
      </>
    );
  }
  if (card.kind === 'cloze') {
    const parts = card.text.split('{{}}');
    const check = () => {
      const ok = card.answers.every((a, i) => blanks[i].trim().toLowerCase() === a.toLowerCase());
      setRes({ ok });
      sound(ok ? 'ok' : 'bad');
    };
    return (
      <>
        <div className="rc-front cloze">
          {parts.map((p, i) => (
            <span key={i}>
              <Md text={p} className="inline" />
              {i < parts.length - 1 && (
                <input
                  className={'blank' + (res ? (blanks[i].trim().toLowerCase() === card.answers[i].toLowerCase() ? ' ok' : ' bad') : '')}
                  value={blanks[i]}
                  onChange={(e) => setBlanks(blanks.map((b, j) => (j === i ? e.target.value : b)))}
                  onKeyDown={(e) => e.key === 'Enter' && !res && check()}
                  autoFocus={i === 0}
                  aria-label={`blank ${i + 1}`}
                  size={Math.max(4, card.answers[i].length + 1)}
                />
              )}
            </span>
          ))}
        </div>
        {!res ? (
          <button className="primary" onClick={check}>
            Check
          </button>
        ) : (
          <>
            {!res.ok && <div className="small">Answer: {card.answers.map((a) => <code key={a}>{a}</code>)}</div>}
            <RateButtons onRate={onRate} state={state} suggest={autoRating(res.ok)} />
          </>
        )}
      </>
    );
  }
  // sql card
  const check = () => {
    const exp = runFresh(card.dataset, card.solution);
    const got = runFresh(card.dataset, val);
    const ok = !got.error && compareResults(exp.last, got.last, { ordered: card.ordered }).ok;
    setRes({ ok, got, exp });
    sound(ok ? 'ok' : 'bad');
  };
  return (
    <>
      <Md text={card.prompt} className="rc-front" />
      <div className="small muted">dataset: {card.dataset}</div>
      <Editor value={val} lang="sql" onChange={setVal} onRun={check} minLines={3} />
      {!res ? (
        <button className="primary" onClick={check}>
          Check (Ctrl+Enter)
        </button>
      ) : (
        <>
          <div className={'grade ' + (res.ok ? 'ok' : 'bad')}>{res.ok ? '✅ Matches.' : res.got?.error ? `❌ ${res.got.error}` : '❌ Not the same rows.'}</div>
          {!res.ok && (
            <>
              <pre className="md-code">
                <code>{card.solution}</code>
              </pre>
              {res.exp?.last && <ResultTable rs={res.exp.last} max={8} caption="expected" />}
            </>
          )}
          <RateButtons onRate={onRate} state={state} suggest={autoRating(res.ok)} />
        </>
      )}
    </>
  );
}

function Forecast() {
  const days = Array.from({ length: 14 }, (_, d) => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    end.setDate(end.getDate() + d);
    const start = new Date(end);
    start.setDate(start.getDate() - 1);
    return Object.values(progress.s.cards).filter((c) => (d === 0 ? c.due <= end.getTime() : c.due > start.getTime() && c.due <= end.getTime())).length;
  });
  const max = Math.max(1, ...days);
  return (
    <div className="forecast">
      <div className="small muted">Upcoming reviews (next 14 days)</div>
      <div className="fc-bars">
        {days.map((n, i) => (
          <div key={i} className="fc-col" title={`${n} cards`}>
            <i style={{ height: `${(n / max) * 100}%` }} />
            <span>{i === 0 ? 'today' : i % 2 === 0 ? `+${i}d` : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
