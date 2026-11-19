// godot.await: a timeline of a coroutine suspended on `await get_tree().create_timer(d).timeout`.
// The game keeps running frames while attack() waits; the caller either carries on immediately or,
// with `await attack()`, waits too. Scrub or play the timeline and watch the highlighted line, the
// skeleton's animation and the printed output.
import { useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Slider, Toggle, Readout, FigureLayout, Btn } from '../kit';
import { drawFrame, animFrame, SHEETS } from '../game';
import { highlightGd } from '../../ui/highlight';
import { useFrameLoop } from './common';
import './godot.css';

const FPS = 60;

function listing(awaitCaller: boolean, d: number) {
  return [
    'func run_turn() -> void:',
    '\tprint("turn: start")',
    awaitCaller ? '\tawait attack()' : '\tattack()',
    '\tprint("turn: end")',
    '',
    'func attack() -> void:',
    '\tsprite.play("windup")',
    `\tawait get_tree().create_timer(${d.toFixed(2)}).timeout`,
    '\tsprite.play("attack")',
    '\tprint("attack: hit")',
  ];
}

export function AwaitTimeline({ spec }: { spec: VizSpec }) {
  const [d, setD] = useState<number>((spec.seconds as number) ?? 0.5);
  const [awaitCaller, setAwaitCaller] = useState(false);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(true);
  const spriteRef = useRef<HTMLCanvasElement>(null);
  const fireFrame = Math.ceil(d * FPS - 1e-9);
  const tFire = fireFrame / FPS;
  const tEnd = Math.max(0.6, tFire + 0.3);
  const frame = Math.floor(t * FPS + 1e-9);
  const fired = frame >= fireFrame;

  useFrameLoop(spriteRef, (dt) => {
    if (playing) {
      setT((v) => {
        const nv = v + dt * (slow ? 0.25 : 1);
        if (nv >= tEnd) {
          setPlaying(false);
          return tEnd;
        }
        return nv;
      });
    }
    const ctx = spriteRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#3a3346';
    ctx.fillRect(0, 0, 96, 56);
    ctx.fillStyle = '#4b4a5c';
    ctx.fillRect(0, 44, 96, 12);
    const anim = fired ? 'attack' : 'windup';
    const at = fired ? t - tFire : t;
    if (SHEETS['skeleton']) drawFrame(ctx, 'skeleton', animFrame('skeleton', anim, at), 48, 48, { anchored: true });
    else {
      ctx.fillStyle = fired ? '#e0e0e0' : '#c95050';
      ctx.fillRect(40, 20, 16, 28);
    }
  });

  // which line is "current" at time t
  const lines = listing(awaitCaller, d);
  let active: number[] = [];
  let state = { turn: 'running', attack: 'not started' };
  if (frame === 0 && t < 0.5 / FPS) {
    active = [1, 2, 6, 7, ...(awaitCaller ? [] : [3])];
    state = { turn: awaitCaller ? 'suspended' : 'finished', attack: 'suspended' };
  } else if (!fired) {
    active = [7, ...(awaitCaller ? [2] : [])];
    state = { turn: awaitCaller ? 'suspended at line 3' : 'finished', attack: 'suspended at line 8' };
  } else if (frame === fireFrame) {
    active = [8, 9, ...(awaitCaller ? [3] : [])];
    state = { turn: 'finished', attack: 'finished' };
  } else {
    active = [];
    state = { turn: 'finished', attack: 'finished' };
  }
  const out: [number, string][] = [
    [0, 'turn: start'],
    ...(awaitCaller ? [] : ([[0, 'turn: end']] as [number, string][])),
    [fireFrame, 'attack: hit'],
    ...(awaitCaller ? ([[fireFrame, 'turn: end']] as [number, string][]) : []),
  ];

  // timeline geometry
  const Wd = 520, L = 92, R = 12;
  const sx = (v: number) => L + (v / tEnd) * (Wd - L - R);
  const rows = [
    { y: 30, label: 'frames' },
    { y: 62, label: '_process()' },
    { y: 98, label: 'attack()' },
    { y: 134, label: 'run_turn()' },
  ];
  const ticks: number[] = [];
  for (let f = 0; f / FPS <= tEnd; f++) ticks.push(f);
  return (
    <FigureLayout
      side={
        <>
          <Slider label="timer (s)" value={d} min={0.1} max={1} step={0.05} onChange={(v) => { setD(v); setT(0); setPlaying(false); }} fmt={(v) => v.toFixed(2)} />
          <Toggle label="caller uses await attack()" value={awaitCaller} onChange={(v) => { setAwaitCaller(v); setT(0); setPlaying(false); }} />
          <Toggle label="slow motion (0.25×)" value={slow} onChange={setSlow} />
          <div className="godot-row">
            <Btn primary onClick={() => { if (t >= tEnd) setT(0); setPlaying(!playing); }}>{playing ? 'Pause' : t >= tEnd ? 'Replay' : 'Play'}</Btn>
            <canvas ref={spriteRef} width={96} height={56} className="godot-sprite" aria-label="the skeleton winding up, then attacking" />
          </div>
          <Readout
            rows={[
              ['t', `${t.toFixed(3)} s`],
              ['\\text{frame}', String(frame)],
              ['\\text{timer left}', `${Math.max(0, tFire - t).toFixed(3)} s`],
              ['\\texttt{attack()}', state.attack],
              ['\\texttt{run\\_turn()}', state.turn],
            ]}
          />
        </>
      }
    >
      <div className="godot-col">
        <svg viewBox={`0 0 ${Wd} 160`} className="godot-svg" role="img" aria-label="timeline of frames and the two functions">
          {rows.map((r) => (
            <text key={r.label} x={6} y={r.y + 4} className="godot-svg-mono">
              {r.label}
            </text>
          ))}
          {ticks.map((f) => (
            <g key={f}>
              <line x1={sx(f / FPS)} x2={sx(f / FPS)} y1={24} y2={f % 10 === 0 ? 38 : 34} className={f <= frame ? 'godot-tick on' : 'godot-tick'} />
              {f % 10 === 0 && (
                <text x={sx(f / FPS)} y={16} textAnchor="middle" className="godot-svg-small">
                  {f}
                </text>
              )}
              {f % 2 === 0 && <circle cx={sx(f / FPS)} cy={62} r={1.6} className={f <= frame ? 'godot-dot on' : 'godot-dot'} />}
            </g>
          ))}
          {/* attack(): runs at 0, suspended until the timeout, runs again */}
          <rect x={sx(0) - 2} y={90} width={5} height={16} className="godot-run" />
          <line x1={sx(0) + 3} x2={sx(tFire) - 3} y1={98} y2={98} className="godot-wait" />
          <text x={(sx(0) + sx(tFire)) / 2} y={88} textAnchor="middle" className="godot-svg-small">
            suspended: waiting for timeout
          </text>
          <rect x={sx(tFire) - 2} y={90} width={5} height={16} className="godot-run" />
          {/* run_turn() */}
          <rect x={sx(0) - 2} y={126} width={5} height={16} className="godot-run" />
          {awaitCaller ? (
            <>
              <line x1={sx(0) + 3} x2={sx(tFire) - 3} y1={134} y2={134} className="godot-wait" />
              <text x={(sx(0) + sx(tFire)) / 2} y={124} textAnchor="middle" className="godot-svg-small">
                suspended: waiting for attack() to finish
              </text>
              <rect x={sx(tFire) - 2} y={126} width={5} height={16} className="godot-run" />
            </>
          ) : (
            <text x={sx(0) + 10} y={138} className="godot-svg-small">
              finished at frame 0
            </text>
          )}
          <line x1={sx(t)} x2={sx(t)} y1={20} y2={150} className="godot-playhead" />
        </svg>
        <input type="range" min={0} max={tEnd} step={0.001} value={t} onChange={(e) => { setPlaying(false); setT(parseFloat(e.target.value)); }} aria-label="time" className="godot-scrub" />
        <div className="godot-split">
          <pre className="godot-listing">
            {lines.map((ln, k) => (
              <div key={k} className={active.includes(k) ? 'on' : ''}>
                <span className="godot-ln">{k + 1}</span>
                <span dangerouslySetInnerHTML={{ __html: highlightGd(ln.replace(/\t/g, '    ')) || ' ' }} />
              </div>
            ))}
          </pre>
          <pre className="godot-output" aria-label="Output panel">
            {out
              .filter(([f]) => f <= frame)
              .map(([f, s], k) => (
                <div key={k}>
                  <span className="godot-ln">f{f}</span>
                  {s}
                </div>
              ))}
          </pre>
        </div>
      </div>
    </FigureLayout>
  );
}
