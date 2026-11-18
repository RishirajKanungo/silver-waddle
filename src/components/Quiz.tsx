// Module quiz: multiple choice, "press the shortcut", and "write the formula" questions.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Module, QuizQuestion } from '../course/types';
import { AppStore } from '../app/store';
import { handleGridKey, handleGridKeyUp } from '../app/keyboard';
import { Calc } from '../engine/calc';
import { cellKey, isArr, isErr, Scalar } from '../engine/types';
import { parseA1, colToLetters } from '../engine/refs';
import { formatValue } from '../engine/format';
import { Markup, Keys } from './Markup';
import { progress } from '../progress/progress';
import { confetti, sound } from './fx';
import { makeBook } from '../course/data';
import { normalizeFormula } from '../app/store';

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function QuizView({ module, go }: { module: Module; go: (h: string) => void }) {
  const qs = useMemo(() => shuffle(module.quiz), [module]);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [state, setState] = useState<'ask' | 'right' | 'wrong'>('ask');
  const [done, setDone] = useState<null | { pct: number; xp: number }>(null);
  const q = qs[i];

  const answer = (ok: boolean) => {
    setState(ok ? 'right' : 'wrong');
    setAnswers([...answers, ok]);
    sound(ok ? 'ok' : 'bad');
  };
  const next = () => {
    if (i + 1 < qs.length) {
      setI(i + 1);
      setState('ask');
    } else {
      const correct = answers.filter(Boolean).length;
      const pct = Math.round((correct / qs.length) * 100);
      const ev = progress.quizResult(module.id, pct, correct);
      setDone({ pct, xp: ev.xp });
      if (pct >= 80) confetti(pct === 100 ? 1.5 : 0.8);
      sound(pct >= 80 ? 'done' : 'bad');
    }
  };

  if (done) {
    const best = progress.state.quizBest[module.id] ?? done.pct;
    return (
      <div className="page narrow">
        <div className="card center">
          <div className="done-burst">{done.pct === 100 ? '💯' : done.pct >= 80 ? '🎓' : '📚'}</div>
          <h2>
            {module.title} quiz: {done.pct}%
          </h2>
          <p>{done.pct >= 80 ? 'Passed! ' : 'Not quite — 80% passes. '}Best score: {best}% · +{done.xp} XP</p>
          <div className="quiz-review">
            {qs.map((qq, k) => (
              <div key={k} className={'qr ' + (answers[k] ? 'ok' : 'bad')}>
                {answers[k] ? '✓' : '✗'} {qq.q}
              </div>
            ))}
          </div>
          <div className="row gap">
            <button className="primary" onClick={() => go(`#/quiz/${module.id}?r=${Date.now()}`)}>
              Retake
            </button>
            <button onClick={() => go('#/learn')}>Back to course</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page narrow">
      <div className="quiz-head">
        <button className="link" onClick={() => go('#/learn')}>
          ← Course
        </button>
        <h2>
          {module.icon} {module.title} — Quiz
        </h2>
        <div className="quiz-progress">
          {qs.map((_, k) => (
            <span key={k} className={'qp' + (k < answers.length ? (answers[k] ? ' ok' : ' bad') : k === i ? ' cur' : '')} />
          ))}
        </div>
      </div>
      <div className="card">
        <div className="q-kind">{q.kind === 'mc' ? 'Multiple choice' : q.kind === 'keys' ? 'Press the shortcut' : 'Write the formula'}</div>
        <h3 className="q-text">{q.q}</h3>
        {q.kind === 'mc' && <MC q={q} state={state} onAnswer={answer} />}
        {q.kind === 'keys' && <KeysQ key={i} q={q} state={state} onAnswer={answer} />}
        {q.kind === 'formula' && <FormulaQ key={i} q={q} state={state} onAnswer={answer} />}
        {state !== 'ask' && (
          <div className={'q-explain ' + state}>
            <b>{state === 'right' ? 'Correct!' : 'Not quite.'}</b> <Markup text={q.explain} />
            <button className="primary" onClick={next} autoFocus>
              {i + 1 < qs.length ? 'Next question →' : 'See results'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MC({ q, state, onAnswer }: { q: Extract<QuizQuestion, { kind: 'mc' }>; state: string; onAnswer: (ok: boolean) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (state !== 'ask') return;
      const n = Number(e.key);
      if (n >= 1 && n <= q.options.length) {
        setPicked(n - 1);
        onAnswer(n - 1 === q.answer);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <div className="mc">
      {q.options.map((o, k) => (
        <button
          key={k}
          className={'mc-opt' + (state !== 'ask' && k === q.answer ? ' right' : '') + (state !== 'ask' && picked === k && k !== q.answer ? ' wrong' : '')}
          disabled={state !== 'ask'}
          onClick={() => {
            setPicked(k);
            onAnswer(k === q.answer);
          }}
        >
          <span className="mc-n">{k + 1}</span> <Markup text={o} />
        </button>
      ))}
      <p className="muted small">Tip: press 1–{q.options.length} on your keyboard.</p>
    </div>
  );
}

function KeysQ({ q, state, onAnswer }: { q: Extract<QuizQuestion, { kind: 'keys' }>; state: string; onAnswer: (ok: boolean) => void }) {
  const store = useMemo(() => {
    const s = new AppStore([
      makeBook('Quiz.xlsx', [
        { name: 'Sheet1', rows: Array.from({ length: 30 }, (_, r) => Array.from({ length: 6 }, (_, c) => (r === 0 ? `Col${c + 1}` : r * 10 + c))) },
        { name: 'Sheet2', rows: [['x']] },
      ]),
      makeBook('Other.xlsx', [{ name: 'Data', rows: [['y']] }]),
    ]);
    s.select(3, 2);
    return s;
  }, []);
  const [last, setLast] = useState<string | null>(null);
  const answered = useRef(false);
  useEffect(() => {
    const off = store.onCommand((e) => {
      if (answered.current || e.id.startsWith('keytip.')) return;
      answered.current = true;
      setLast(e.id);
      onAnswer(e.id === q.cmd || (q.cmd === 'clip.pasteValues' && e.id === 'clip.pasteValuesLegacy'));
    });
    const down = (e: KeyboardEvent) => {
      if (state !== 'ask' || answered.current) return;
      if (['Shift', 'Control', 'Meta'].includes(e.key)) return;
      handleGridKey(store, e);
      if (store.dialog) store.openDialog(null);
    };
    const up = (e: KeyboardEvent) => handleGridKeyUp(store, e);
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      off();
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  });
  return (
    <div className="keys-q">
      <div className={'keys-target' + (state === 'ask' ? ' listening' : '')}>
        {state === 'ask' ? (store.keytip !== null ? `Alt ${store.keytip.split('').join(' ')}…` : 'Listening… press the keys now') : <Keys k={q.keys} />}
      </div>
      {state === 'wrong' && last && <p className="muted small">You triggered: {last}</p>}
      {state === 'ask' && (
        <button className="link" onClick={() => onAnswer(false)}>
          I don't know — show me
        </button>
      )}
    </div>
  );
}

function FormulaQ({ q, state, onAnswer }: { q: Extract<QuizQuestion, { kind: 'formula' }>; state: string; onAnswer: (ok: boolean) => void }) {
  const [f, setF] = useState('=');
  const [got, setGot] = useState<string | null>(null);
  const at = parseA1(q.at)!;
  const cells: Record<string, { v: string }> = {};
  q.grid.forEach((row, r) => row.forEach((v, c) => (cells[cellKey(r, c)] = { v: String(v) })));
  const calc = new Calc([{ id: 'q', name: 'Quiz.xlsx', sheets: [{ name: 'Sheet1', cells, colWidths: {} }] }]);
  const submit = () => {
    let text = f.trim();
    if (!text.startsWith('=')) text = '=' + text;
    text = normalizeFormula(text);
    const res = calc.evalFormula(text, { bi: 0, si: 0, r: at.row, c: at.col });
    const v: Scalar = isArr(res) ? res.data[0][0] : res;
    setGot(formatValue(v));
    let ok = false;
    if (typeof q.expect === 'number') ok = typeof v === 'number' && Math.abs(v - q.expect) < 1e-6 * Math.max(1, Math.abs(q.expect));
    else if (typeof q.expect === 'string') ok = typeof v === 'string' && v.toLowerCase() === q.expect.toLowerCase();
    else ok = v === q.expect;
    if (ok && q.mustUse?.length) ok = q.mustUse.some((fn) => text.toUpperCase().includes(fn.toUpperCase() + '('));
    if (isErr(v)) ok = false;
    onAnswer(ok);
  };
  const cols = Math.max(...q.grid.map((r) => r.length), at.col + 1);
  const rows = Math.max(q.grid.length, at.row + 1);
  return (
    <div className="formula-q">
      <table className="mini-grid">
        <thead>
          <tr>
            <th />
            {Array.from({ length: cols }, (_, c) => (
              <th key={c}>{colToLetters(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              <th>{r + 1}</th>
              {Array.from({ length: cols }, (_, c) => {
                const isAt = r === at.row && c === at.col;
                const v = q.grid[r]?.[c];
                return (
                  <td key={c} className={(isAt ? 'at' : '') + (r === 0 ? ' hdr' : '') + (typeof v === 'number' ? ' num' : '')}>
                    {isAt ? (state === 'ask' ? '?' : got) : v ?? ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="formula-entry">
        <span className="fx-label">
          {q.at} <i>f</i>x
        </span>
        <input
          value={f}
          onChange={(e) => setF(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && state === 'ask' && submit()}
          disabled={state !== 'ask'}
          autoFocus
          spellCheck={false}
          placeholder="=FORMULA(...)"
        />
        {state === 'ask' && (
          <button className="primary" onClick={submit}>
            Check
          </button>
        )}
      </div>
      {state !== 'ask' && (
        <p>
          Your result: <b>{got}</b> · Expected: <b>{String(q.expect)}</b> · Model answer: <code>{q.model}</code>
        </p>
      )}
    </div>
  );
}
