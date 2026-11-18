// Interview Gym: timed interview-style problems; Boss rounds: a module's "interview loop".

import { useEffect, useMemo, useState } from 'react';
import type { Module, Problem, Track } from '../course/types';
import { PROBLEMS, findProblem, MODULES } from '../course';
import { progress, PIPELINE } from '../progress/store';
import { useDb, useProgress } from '../components/hooks';
import { ChallengeCell, CellCtx } from '../components/notebook/Cells';
import { Md } from '../components/Markup';
import { confetti, sound } from '../components/fx';

function useTimer(running: boolean) {
  const [t0] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [running]);
  return Math.floor((now - t0) / 1000);
}
const mmss = (s: number) => `${Math.floor(Math.abs(s) / 60)}:${String(Math.abs(s) % 60).padStart(2, '0')}`;

export function GymPage({ go }: { go: (h: string) => void }) {
  useProgress();
  const [track, setTrack] = useState<Track | 'all'>('all');
  const [diff, setDiff] = useState<string>('all');
  const [pattern, setPattern] = useState('all');
  const [company, setCompany] = useState('all');
  const list = PROBLEMS.filter((p) => (track === 'all' || p.track === track) && (diff === 'all' || p.difficulty === diff) && (pattern === 'all' || p.pattern === pattern) && (company === 'all' || p.companies.includes(company)));
  const patterns = [...new Set(PROBLEMS.filter((p) => track === 'all' || p.track === track).map((p) => p.pattern))].sort();
  const companies = [...new Set(PROBLEMS.flatMap((p) => p.companies))].sort();
  const solved = PROBLEMS.filter((p) => progress.s.gym[p.id]?.solved).length;
  const next = list.find((p) => !progress.s.gym[p.id]?.solved);
  return (
    <div className="page">
      <h1>🏋️ Interview Gym</h1>
      <p className="muted">
        Problems in the style of big-tech data & coding screens, each with a time budget. Solved {solved}/{PROBLEMS.length}. Re-solving an old problem days later is great spaced practice.
      </p>
      <div className="filters">
        <div className="seg">
          {(['all', 'sql', 'python'] as const).map((t) => (
            <button key={t} className={track === t ? 'on' : ''} onClick={() => { setTrack(t); setPattern('all'); }}>
              {t === 'all' ? 'All' : t === 'sql' ? '🗄️ SQL' : '🐍 Python'}
            </button>
          ))}
        </div>
        <div className="seg">
          {['all', 'Easy', 'Medium', 'Hard'].map((d) => (
            <button key={d} className={diff === d ? 'on' : ''} onClick={() => setDiff(d)}>
              {d === 'all' ? 'Any level' : d}
            </button>
          ))}
        </div>
        <select value={pattern} onChange={(e) => setPattern(e.target.value)} aria-label="pattern">
          <option value="all">All patterns</option>
          {patterns.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select value={company} onChange={(e) => setCompany(e.target.value)} aria-label="company style">
          <option value="all">Any company style</option>
          {companies.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        {next && (
          <button className="primary" onClick={() => go('#problem-' + next.id)}>
            ▶ Next unsolved
          </button>
        )}
      </div>
      <div className="plist">
        {list.map((p) => {
          const g = progress.s.gym[p.id];
          return (
            <button key={p.id} className={'prow' + (g?.solved ? ' solved' : '')} onClick={() => go('#problem-' + p.id)}>
              <span className="p-status">{g?.solved ? '✅' : g?.attempts ? '🟡' : '⬜'}</span>
              <span className="p-track">{p.track === 'sql' ? '🗄️' : '🐍'}</span>
              <span className="p-title">{p.title}</span>
              <span className={'diff d-' + p.difficulty}>{p.difficulty}</span>
              <span className="chip tag">{p.pattern}</span>
              <span className="p-co small muted">{p.companies.join(' · ')}</span>
              <span className="p-time small muted">⏱ {p.minutes}m{g?.best ? ` · best ${mmss(g.best)}` : ''}</span>
            </button>
          );
        })}
        {!list.length && <p className="muted">No problems match those filters.</p>}
      </div>
    </div>
  );
}

function ProblemSolver({ p, onSolved, hideMeta }: { p: Problem; onSolved: (secs: number, hints: number) => void; hideMeta?: boolean }) {
  const db = useDb(p.dataset);
  const [solved, setSolved] = useState(false);
  const elapsed = useTimer(!solved);
  const budget = p.minutes * 60;
  const ctx: CellCtx = { lessonId: 'gym', dataset: p.dataset, db, isDone: () => false, done: () => {} };
  return (
    <div className="problem">
      {!hideMeta && (
        <div className="prob-meta">
          <span className={'diff d-' + p.difficulty}>{p.difficulty}</span>
          <span className="chip tag">{p.pattern}</span>
          <span className="small muted">Common in {p.companies.join(', ')}-style interviews</span>
          {p.dataset && <span className="chip">dataset: {p.dataset}</span>}
        </div>
      )}
      <div className={'timer' + (elapsed > budget ? ' over' : '')}>
        ⏱ {mmss(elapsed)} / {mmss(budget)} {elapsed > budget && '— over time (that’s fine, finish it!)'}
      </div>
      <ChallengeCell
        ch={p.challenge}
        k={'p:' + p.id}
        ctx={ctx}
        dataset={p.dataset}
        compact
        onPass={({ hints }) => {
          if (!solved) {
            setSolved(true);
            onSolved(elapsed, hints);
          }
        }}
      />
      {solved && p.followups?.length ? (
        <div className="followups">
          <b>🎯 Interviewer follow-ups</b> — answer these out loud:
          <ul>
            {p.followups.map((f, i) => (
              <li key={i}>
                <Md text={f} className="inline" />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function ProblemPage({ id, go }: { id: string; go: (h: string) => void }) {
  useProgress();
  const p = findProblem(id);
  if (!p) return <div className="page">Problem not found.</div>;
  const idx = PROBLEMS.indexOf(p);
  const next = PROBLEMS.slice(idx + 1).find((x) => x.track === p.track && !progress.s.gym[x.id]?.solved);
  return (
    <div className="page narrow">
      <button className="link" onClick={() => go('#gym')}>
        ← Interview Gym
      </button>
      <h1>
        {p.track === 'sql' ? '🗄️' : '🐍'} {p.title}
      </h1>
      <ProblemSolver
        key={p.id}
        p={p}
        onSolved={(secs, hints) => {
          progress.gymAttempt(p.id);
          progress.gymSolved(p.id, p.difficulty, secs, p.minutes, hints);
          sound('done');
        }}
      />
      {next && (
        <button className="primary" onClick={() => go('#problem-' + next.id)}>
          Next problem: {next.title} →
        </button>
      )}
    </div>
  );
}

export function BossPage({ moduleId, go }: { moduleId: string; go: (h: string) => void }) {
  useProgress();
  const m = MODULES.find((x) => x.id === moduleId) as Module | undefined;
  const probs = useMemo(() => (m?.boss ?? []).map(findProblem).filter(Boolean) as Problem[], [m]);
  const [started, setStarted] = useState(false);
  const [i, setI] = useState(0);
  const [t0, setT0] = useState(0);
  const [done, setDone] = useState(false);
  if (!m) return <div className="page">Module not found.</div>;
  const budget = probs.reduce((a, p) => a + p.minutes, 0);
  const stages = PIPELINE[m.track];
  const stageIdx = progress.pipelineStage(m.track);
  if (!started)
    return (
      <div className="page narrow">
        <button className="link" onClick={() => go('#' + m.track)}>
          ← {m.title}
        </button>
        <h1>🎯 Interview round: {m.title}</h1>
        <p>
          Solve {probs.length} problems back-to-back, like a real {m.track === 'sql' ? 'data/analytics' : 'coding'} loop. Time budget: <b>{budget} minutes</b>. Pass to advance your offer pipeline from <b>{stages[stageIdx]}</b> to <b>{stages[Math.min(stages.length - 1, stageIdx + 1)]}</b>.
        </p>
        <ul>
          {probs.map((p) => (
            <li key={p.id}>
              {p.title} <span className={'diff d-' + p.difficulty}>{p.difficulty}</span> <span className="small muted">({p.pattern})</span>
            </li>
          ))}
        </ul>
        {progress.s.boss[m.id]?.passed && <p className="chip">✅ Already passed — replay for practice.</p>}
        <button className="primary big" onClick={() => { setStarted(true); setT0(Date.now()); }}>
          Start the round
        </button>
      </div>
    );
  if (done) {
    const secs = Math.floor((Date.now() - t0) / 1000);
    return (
      <div className="page narrow center">
        <div className="ld-burst">🏆</div>
        <h1>Round passed!</h1>
        <p>
          Finished in {mmss(secs)} (budget {budget}:00). Your pipeline: <b>{stages[Math.min(stages.length - 1, progress.pipelineStage(m.track))]}</b>
        </p>
        <button className="primary" onClick={() => go('#' + m.track)}>
          Back to track
        </button>
      </div>
    );
  }
  const p = probs[i];
  return (
    <div className="page narrow">
      <div className="boss-top">
        <b>
          Interview round · problem {i + 1}/{probs.length}
        </b>
        <span className="review-bar">
          <i style={{ width: `${(i / probs.length) * 100}%` }} />
        </span>
      </div>
      <h2>{p.title}</h2>
      <ProblemSolver
        key={p.id}
        p={p}
        onSolved={(secs, hints) => {
          progress.gymSolved(p.id, p.difficulty, secs, p.minutes, hints);
          setTimeout(() => {
            if (i + 1 < probs.length) setI(i + 1);
            else {
              progress.bossPassed(m.id, Math.floor((Date.now() - t0) / 1000));
              confetti(2);
              sound('level');
              setDone(true);
            }
          }, 1200);
        }}
      />
    </div>
  );
}
