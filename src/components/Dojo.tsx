// Shortcut Dojo: timed, spaced-repetition drills in a live workbook.

import { useEffect, useMemo, useRef, useState } from 'react';
import { AppStore } from '../app/store';
import { ExcelWindow } from './excel/ExcelWindow';
import { DRILLS, DrillDef } from '../course/drills';
import { makeBook, transactions, customers } from '../course/data';
import { progress } from '../progress/progress';
import { Keys } from './Markup';
import { confetti, sound } from './fx';
import { useProgress } from './hooks';

const TIME_LIMIT = 10000;

function dojoBooks() {
  const tx = transactions(200, 21);
  const rows = [
    ['Txn ID', 'Date', 'Account', 'Branch', 'Type', 'Channel', 'Amount', 'Notes', 'Abs Amount'],
    ...tx.map((t, i) => [t.id, t.date, t.acct, t.branch, t.type, t.channel, t.amount, '', `=ABS(G${i + 2})`]),
  ];
  const cs = customers(30, 3);
  return [
    makeBook('Dojo_Transactions.xlsx', [
      { name: 'Data', rows, widths: [90, 85, 85, 70, 85, 70, 95, 60, 90], formats: { 1: 'm/d/yyyy', 6: '#,##0.00', 8: '#,##0.00' } },
      { name: 'Summary', rows: [['Branch', 'Total'], ['NYC-01', '=SUMIF(Data!D:D,A2,Data!G:G)']] },
    ]),
    makeBook('Customer_Master.xlsx', [{ name: 'Accounts', rows: [['ID', 'Name', 'Segment', 'Region'], ...cs.map((c) => [c.id, c.name, c.segment, c.region])] }]),
  ];
}

type Mode = 'tier1' | 'tier2' | 'tier3' | 'weak' | 'all';

function pickSession(mode: Mode, n = 15): DrillDef[] {
  let pool = DRILLS.filter((d) => (mode === 'tier1' ? d.tier === 1 : mode === 'tier2' ? d.tier === 2 : mode === 'tier3' ? d.tier === 3 : true));
  const st = progress.state.drills;
  // Leitner: lower box = more likely; due items first
  const weight = (d: DrillDef) => {
    const s = st[d.cmd];
    const box = s?.box ?? 0;
    const age = s ? (Date.now() - s.lastAt) / 3.6e6 : 999;
    return (6 - box) * 2 + Math.min(age / 24, 5) + Math.random() * 3;
  };
  if (mode === 'weak') pool = [...pool].sort((a, b) => (st[a.cmd]?.box ?? 0) - (st[b.cmd]?.box ?? 0)).slice(0, 25);
  const sorted = [...pool].sort((a, b) => weight(b) - weight(a));
  const out: DrillDef[] = [];
  while (out.length < n && sorted.length) out.push(...sorted.slice(0, n - out.length));
  return out.sort(() => Math.random() - 0.5);
}

export function Dojo() {
  useProgress();
  const store = useMemo(() => new AppStore(dojoBooks()), []);
  const [mode, setMode] = useState<Mode>('tier1');
  const [session, setSession] = useState<DrillDef[] | null>(null);
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'go' | 'ok' | 'miss' | 'summary'>('ready');
  const [results, setResults] = useState<{ ok: boolean; ms: number }[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [combo, setCombo] = useState(0);
  const [wrongCmd, setWrongCmd] = useState<string | null>(null);
  const start = useRef(0);
  const fumbles = useRef(0);
  const drill = session?.[i];

  const setupDrill = (d: DrillDef) => {
    store.load(dojoBooks());
    if (d.setup === 'copy') {
      store.goTo('A1:C5');
      store.copy();
    }
    if (d.at) store.goTo(d.at);
    if (d.setup === 'formula') {
      store.startEdit('=VLOOKUP(A2,A1', 'enter');
    }
    store.status = null;
    store.notify();
    start.current = performance.now();
    fumbles.current = 0;
    setElapsed(0);
    setWrongCmd(null);
    setPhase('go');
  };

  const begin = () => {
    const s = pickSession(mode);
    setSession(s);
    setI(0);
    setResults([]);
    setCombo(0);
    setupDrill(s[0]);
  };

  // listen for commands
  useEffect(() => {
    if (phase !== 'go' || !drill) return;
    const off = store.onCommand((e) => {
      if (e.id.startsWith('keytip.') || e.id === 'edit.commit' || e.id === 'edit.commitFormula') return;
      const ok = e.id === drill.cmd || !!drill.accept?.includes(e.id);
      const ms = performance.now() - start.current;
      if (ok && e.source === 'key') {
        progress.drill(drill.cmd, true, ms);
        setResults((r) => [...r, { ok: true, ms }]);
        setCombo((c) => c + 1);
        setPhase('ok');
        sound('ok');
      } else if (!ok && fumbles.current === 0) {
        // one free fumble: show what happened, keep the clock running
        fumbles.current = 1;
        setWrongCmd(e.id);
        sound('tick');
        if (drill.at) setTimeout(() => store.goTo(drill.at!), 0);
      } else if (!ok) {
        setWrongCmd(e.id);
        progress.drill(drill.cmd, false, ms);
        setResults((r) => [...r, { ok: false, ms }]);
        setCombo(0);
        setPhase('miss');
        sound('bad');
      }
      if (store.dialog) setTimeout(() => store.openDialog(null), 300);
    });
    const t = setInterval(() => {
      const ms = performance.now() - start.current;
      setElapsed(ms);
      if (ms > TIME_LIMIT) {
        progress.drill(drill.cmd, false, ms);
        setResults((r) => [...r, { ok: false, ms }]);
        setCombo(0);
        setPhase('miss');
        sound('bad');
      }
    }, 100);
    return () => {
      off();
      clearInterval(t);
    };
  }, [phase, drill, store]);

  // auto-advance
  useEffect(() => {
    if (phase !== 'ok' && phase !== 'miss') return;
    const t = setTimeout(
      () => {
        if (!session) return;
        if (i + 1 < session.length) {
          setI(i + 1);
          setupDrill(session[i + 1]);
        } else {
          const correct = results.filter((r) => r.ok).length;
          const avg = results.filter((r) => r.ok).reduce((a, r) => a + r.ms, 0) / Math.max(1, correct);
          progress.drillSession(correct, results.length, avg);
          setPhase('summary');
          if (correct / results.length >= 0.8) confetti(0.8);
        }
      },
      phase === 'ok' ? 650 : 2200,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const correct = results.filter((r) => r.ok).length;
  const avgMs = results.filter((r) => r.ok).reduce((a, r) => a + r.ms, 0) / Math.max(1, correct);
  const st = progress.state.drills;

  const side = (
    <aside className="coach dojo" onMouseDown={(e) => e.stopPropagation()}>
      <div className="coach-head">
        <h2>⌨️ Shortcut Dojo</h2>
        <p className="muted small">Muscle memory = fast, correct repetitions. Hands on the keyboard; the mouse doesn't count.</p>
      </div>
      {(phase === 'ready' || phase === 'summary') && (
        <div className="coach-body">
          {phase === 'summary' && (
            <div className="card center tight">
              <h3>
                {correct}/{results.length} correct
              </h3>
              <p>
                Avg speed: <b>{(avgMs / 1000).toFixed(2)}s</b> · Best combo: {Math.max(0, ...results.reduce<number[]>((acc, r) => [...acc, r.ok ? (acc[acc.length - 1] ?? 0) + 1 : 0], []))}
              </p>
            </div>
          )}
          <div className="label">Choose a belt</div>
          <div className="belts">
            {(
              [
                ['tier1', '⚪ White belt', 'Navigation, selection, editing'],
                ['tier2', '🟡 Yellow belt', 'Formatting, structure, filters'],
                ['tier3', '⚫ Black belt', 'Alt key-tips & power moves'],
                ['weak', '🎯 Weak spots', 'Your least-mastered shortcuts'],
                ['all', '🌀 Mixed', 'Everything'],
              ] as const
            ).map(([m, name, desc]) => (
              <button key={m} className={'belt' + (mode === m ? ' on' : '')} onClick={() => setMode(m)}>
                <b>{name}</b>
                <span>{desc}</span>
              </button>
            ))}
          </div>
          <button className="primary big" onClick={begin} autoFocus>
            {phase === 'summary' ? 'Go again' : 'Start 15 drills'} →
          </button>
          <div className="label">Mastery</div>
          <div className="mastery">
            {DRILLS.map((d) => {
              const b = st[d.cmd]?.box ?? 0;
              return (
                <div key={d.id} className="m-row" title={`${d.prompt} — box ${b}/5`}>
                  <span className="m-keys">
                    <Keys k={d.keys.split(' or ')[0].split(' (')[0]} />
                  </span>
                  <span className="m-bar">
                    {[1, 2, 3, 4, 5].map((k) => (
                      <i key={k} className={k <= b ? 'on' : ''} />
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {drill && (phase === 'go' || phase === 'ok' || phase === 'miss') && (
        <div className="coach-body">
          <div className="drill-top">
            <span>
              {i + 1} / {session!.length}
            </span>
            <span className={'combo' + (combo >= 3 ? ' hot' : '')}>{combo >= 2 ? `🔥 ${combo} combo` : ''}</span>
          </div>
          <div className={'drill-card ' + phase}>
            <div className="drill-prompt">{drill.prompt}</div>
            {phase === 'go' && wrongCmd && <div className="small warn-text">Not that one ({wrongCmd}) — try again!</div>}
            {phase === 'go' && <div className="timer"><i style={{ width: `${Math.min(100, (elapsed / TIME_LIMIT) * 100)}%` }} /></div>}
            {phase === 'ok' && (
              <div className="drill-res ok">
                ✓ {(results[results.length - 1]?.ms / 1000).toFixed(2)}s <Keys k={drill.keys.split(' or ')[0]} />
              </div>
            )}
            {phase === 'miss' && (
              <div className="drill-res miss">
                The shortcut is <Keys k={drill.keys.split(' or ')[0].split(' (')[0]} />
                {wrongCmd && <div className="small muted">You triggered: {wrongCmd}</div>}
              </div>
            )}
          </div>
          {drill.why && <p className="muted small">Why: {drill.why}</p>}
          {phase === 'go' && (
            <button className="link" onClick={() => { start.current = -TIME_LIMIT; }}>
              Skip (reveal)
            </button>
          )}
          <div className="scoreline">
            ✓ {correct} · ✗ {results.length - correct}
          </div>
        </div>
      )}
    </aside>
  );

  return (
    <div className="lesson-page">
      <ExcelWindow store={store} side={side} />
    </div>
  );
}
