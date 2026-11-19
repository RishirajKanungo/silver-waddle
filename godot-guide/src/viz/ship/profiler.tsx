// ship.profiler — reading a frame-time graph like Godot's Profiler. Six seconds of a fight at
// 60 fps: a steady baseline, enemy spawns that load and instantiate a scene, an autosave written
// on the main thread, and a burst of particles. Click a frame to see its breakdown and say what
// caused it; toggle fixes and watch the spikes (not the average) change.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Toggle, Readout, FigureLayout } from '../kit';
import { Rng } from '../../math/rng';

const N = 360;
const BUDGET = 1000 / 60;
type Cause = 'spawn' | 'save' | 'ai' | 'draw' | 'none';
interface Frame {
  script: [string, number][];
  physics: number;
  render: number;
  drawCalls: number;
  cause: Cause;
  total: number;
}
interface Fixes {
  preload: boolean;
  pool: boolean;
  saveLater: boolean;
  staggerAi: boolean;
  fewerEmitters: boolean;
}

function simulate(f: Fixes): Frame[] {
  const rng = new Rng(11);
  const out: Frame[] = [];
  let enemies = 3;
  for (let i = 0; i < N; i++) {
    const script: [string, number][] = [];
    let cause: Cause = 'none';
    script.push(['Player._physics_process', 0.35 + rng.next() * 0.1]);
    // enemy AI: every enemy raycasts to the player and searches a group each frame
    const aiEach = f.staggerAi ? 0.2 : 0.8;
    script.push([`Enemy._physics_process ×${enemies}`, enemies * aiEach * (0.9 + rng.next() * 0.2)]);
    script.push(['HUD._process', 0.25 + rng.next() * 0.05]);
    // a wave every 1.5 s: 3 enemies spawn on one frame
    if (i % 90 === 40) {
      cause = 'spawn';
      if (!f.preload) script.push(['load("res://scenes/enemies/skeleton.tscn")', 17 + rng.next() * 3]);
      script.push([f.pool ? 'EnemyPool.take() ×3' : 'skeleton.instantiate() ×3', f.pool ? 0.3 : 7.5 + rng.next()]);
      script.push(['add_child() ×3 (_ready)', f.pool ? 0.2 : 1.6]);
      enemies = Math.min(12, enemies + 3);
    }
    if (i % 90 === 85) enemies = Math.max(3, enemies - 1); // the party defeats one
    // autosave written on the main thread when the player opens a chest
    if (i === 214) {
      cause = 'save';
      script.push([f.saveLater ? 'GameState.request_save() (deferred to the next room change)' : 'GameState.save_game(): FileAccess + JSON', f.saveLater ? 0.1 : 46]);
    }
    const physics = 1.2 + enemies * 0.12 + rng.next() * 0.2;
    // sparks and dust: each emitter is its own draw call and its own particle system to update
    const emitters = i >= 250 && i < 320 ? (f.fewerEmitters ? 6 : 70) : 6;
    const drawCalls = 38 + enemies * 2 + emitters;
    const render = 1.6 + drawCalls * 0.055 + (emitters > 20 ? 6.5 : 0) + rng.next() * 0.3;
    const scriptTotal = script.reduce((a, [, ms]) => a + ms, 0);
    const total = scriptTotal + physics + render;
    if (cause === 'none' && total > BUDGET) cause = emitters > 20 ? 'draw' : 'ai';
    out.push({ script, physics, render, drawCalls, cause, total });
  }
  return out;
}

const CAUSES: { v: Cause; label: string }[] = [
  { v: 'spawn', label: 'loading and instancing a scene mid-fight' },
  { v: 'save', label: 'writing a file on the main thread' },
  { v: 'ai', label: 'every enemy running expensive AI every frame' },
  { v: 'draw', label: 'too many draw calls / particle systems' },
];

export function ProfilerLab({ spec }: { spec: VizSpec }) {
  const [fix, setFix] = useState<Fixes>({ preload: false, pool: false, saveLater: false, staggerAi: false, fewerEmitters: false });
  const frames = useMemo(() => simulate(fix), [fix]);
  const [sel, setSel] = useState<number>((spec.select as number) ?? 40);
  const [guess, setGuess] = useState<Cause | null>(null);
  const tog = (k: keyof Fixes) => (v: boolean) => setFix((o) => ({ ...o, [k]: v }));

  const W = 520, H = 220, L = 34, B = 22, T = 8;
  const maxMs = 70;
  const sy = (ms: number) => H - B - (Math.min(ms, maxMs) / maxMs) * (H - B - T);
  const bw = (W - L - 6) / N;
  const totals = frames.map((f) => f.total);
  const avg = totals.reduce((a, b) => a + b, 0) / N;
  const worst = Math.max(...totals);
  const over = totals.filter((t) => t > BUDGET).length;
  const sorted = [...totals].sort((a, b) => a - b);
  const p99 = sorted[Math.floor(N * 0.99)];
  const fr = frames[sel];
  const scriptMs = fr.script.reduce((a, [, ms]) => a + ms, 0);
  const choose = (i: number) => {
    setSel(i);
    setGuess(null);
  };

  return (
    <FigureLayout
      side={
        <>
          <div className="ship-note">Fixes</div>
          <Toggle label="preload() the enemy scene" value={fix.preload} onChange={tog('preload')} />
          <Toggle label="pool enemies (no instantiate)" value={fix.pool} onChange={tog('pool')} />
          <Toggle label="save at the next room change" value={fix.saveLater} onChange={tog('saveLater')} />
          <Toggle label="stagger AI (every 4th frame)" value={fix.staggerAi} onChange={tog('staggerAi')} />
          <Toggle label="one emitter per effect type" value={fix.fewerEmitters} onChange={tog('fewerEmitters')} />
          <Readout
            rows={[
              ['\\text{average}', `${avg.toFixed(1)} ms`],
              ['\\text{99th percentile}', `${p99.toFixed(1)} ms`],
              ['\\text{worst}', `${worst.toFixed(1)} ms`],
              ['\\text{frames} > 16.7\\text{ ms}', `${over} of ${N}`],
            ]}
          />
        </>
      }
      below={
        <div className="ship-wide">
          <div className="ship-note">
            Frame {sel} ({(sel / 60).toFixed(2)} s): <b>{fr.total.toFixed(1)} ms</b>, {fr.drawCalls} draw calls. Script {scriptMs.toFixed(1)} ms, physics {fr.physics.toFixed(1)} ms, render {fr.render.toFixed(1)} ms.
          </div>
          <table className="ship-table" style={{ marginTop: 6 }}>
            <thead>
              <tr>
                <th>script function</th>
                <th className="num">ms</th>
              </tr>
            </thead>
            <tbody>
              {[...fr.script]
                .sort((a, b) => b[1] - a[1])
                .map(([name, ms]) => (
                  <tr key={name}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}>{name}</td>
                    <td className="num">{ms.toFixed(2)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          {fr.total > BUDGET ? (
            <div style={{ marginTop: 8 }}>
              <div className="ship-note">What made this frame miss the budget?</div>
              <div className="ship-btnrow" style={{ marginTop: 4 }}>
                {CAUSES.map((c) => (
                  <button key={c.v} className={guess === c.v ? 'primary' : ''} onClick={() => setGuess(c.v)}>
                    {c.label}
                  </button>
                ))}
              </div>
              {guess && (
                <div className={guess === fr.cause ? 'ship-ok' : 'ship-bad'} style={{ fontSize: 13, marginTop: 4 }}>
                  {guess === fr.cause ? 'Right. Now find the fix on the right and watch this frame.' : 'Not this one: look at which row of the breakdown is largest, and at the draw-call count.'}
                </div>
              )}
            </div>
          ) : (
            <div className="ship-note" style={{ marginTop: 6 }}>
              This frame is within budget. Click a tall bar.
            </div>
          )}
        </div>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="ship-svg" role="img" aria-label="frame time graph; click a bar to inspect a frame">
        {[0, 16.7, 33.3, 50].map((ms) => (
          <g key={ms}>
            <line x1={L} x2={W - 4} y1={sy(ms)} y2={sy(ms)} className="ax" strokeDasharray={ms ? '3 3' : undefined} />
            <text x={L - 4} y={sy(ms) + 4} textAnchor="end" className="muted">
              {ms.toFixed(0)}
            </text>
          </g>
        ))}
        <text x={W - 6} y={sy(BUDGET) - 3} textAnchor="end" className="muted">
          60 fps budget
        </text>
        {frames.map((f, i) => {
          const x = L + i * bw;
          const sc = f.script.reduce((a, [, ms]) => a + ms, 0);
          return (
            <g key={i} onClick={() => choose(i)} style={{ cursor: 'pointer' }}>
              <rect x={x} y={T} width={bw} height={H - B - T} fill="transparent" />
              <rect x={x} y={sy(sc)} width={bw * 0.9} height={H - B - sy(sc)} style={{ fill: 'var(--c-u)' }} />
              <rect x={x} y={sy(sc + f.physics)} width={bw * 0.9} height={sy(sc) - sy(sc + f.physics)} style={{ fill: 'var(--c-w)' }} />
              <rect x={x} y={sy(f.total)} width={bw * 0.9} height={sy(sc + f.physics) - sy(f.total)} style={{ fill: 'var(--c-v)' }} />
            </g>
          );
        })}
        <rect x={L + sel * bw - 1} y={T} width={bw + 2} height={H - B - T} fill="none" style={{ stroke: 'var(--fg)' }} />
        <text x={L} y={H - 6} className="muted">
          0 s
        </text>
        <text x={W - 4} y={H - 6} textAnchor="end" className="muted">
          6 s
        </text>
        <g transform={`translate(${L + 60}, ${H - 6})`}>
          <rect x={0} y={-8} width={8} height={8} style={{ fill: 'var(--c-u)' }} />
          <text x={11} y={0}>script</text>
          <rect x={56} y={-8} width={8} height={8} style={{ fill: 'var(--c-w)' }} />
          <text x={67} y={0}>physics</text>
          <rect x={120} y={-8} width={8} height={8} style={{ fill: 'var(--c-v)' }} />
          <text x={131} y={0}>render</text>
        </g>
      </svg>
    </FigureLayout>
  );
}
