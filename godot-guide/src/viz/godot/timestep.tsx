// godot.timestep: frame-rate independence. Three sprites run the same "move right" code three ways:
//   lane 1: position.x += speed / 60.0 in _process   (per frame, assumes 60 fps)
//   lane 2: position.x += speed * delta in _process   (variable timestep)
//   lane 3: position.x += speed * delta in _physics_process (fixed 60 Hz ticks, accumulator)
// The learner sets the simulated frame rate, adds jitter, slows time down, and reads the measured
// speeds and the tick timeline.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { drawFrame, animFrame, SHEETS, rect, text } from '../game';
import { Slider, Toggle, Readout, FigureLayout, Btn } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { useFrameLoop } from './common';
import './godot.css';

const W = 320, H = 168;
const LANES = [
  { y: 0, sheet: 'slime', anim: 'idle', dy: 0, label: 'x += speed / 60  (_process)' },
  { y: 44, sheet: 'hero', anim: 'walk_side', dy: 0, label: 'x += speed * delta  (_process)' },
  { y: 88, sheet: 'bat', anim: 'fly', dy: -10, label: 'x += speed * delta  (_physics)' },
];
const TICK = 1 / 60;
const WINDOW = 0.25; // seconds of history in the timeline strip

interface Sim {
  vt: number; // virtual time
  next: number; // virtual time of the next rendered frame
  acc: number; // physics accumulator
  x: number[]; // unwrapped positions
  trail: number[][];
  frames: number[]; // times of rendered frames (for the strip)
  ticks: number[]; // times of physics ticks
  lastDelta: number;
  lastSteps: number;
  secStart: number;
  secX: number[];
  secFrames: number;
  secTicks: number;
  speed: number[];
  fpsMeasured: number;
  tps: number;
  seed: number;
}
const fresh = (): Sim => ({ vt: 0, next: 0, acc: 0, x: [0, 0, 0], trail: [[], [], []], frames: [], ticks: [], lastDelta: 1 / 60, lastSteps: 1, secStart: 0, secX: [0, 0, 0], secFrames: 0, secTicks: 0, speed: [0, 0, 0], fpsMeasured: 0, tps: 0, seed: 7 });

export function Timestep({ spec }: { spec: VizSpec }) {
  const [fps, setFps] = useState<number>((spec.fps as number) ?? 60);
  const [speed, setSpeed] = useState(120);
  const [jitter, setJitter] = useState(false);
  const [slow, setSlow] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sim = useRef<Sim>(fresh());
  const [, force] = useState(0);
  const tick = useRef(0);

  const rand = () => {
    const s = sim.current;
    s.seed = (s.seed * 16807) % 2147483647;
    return s.seed / 2147483647;
  };

  const step = (dt: number) => {
    const s = sim.current;
    s.vt += dt * (slow ? 0.1 : 1);
    let guard = 0;
    while (s.next <= s.vt && guard++ < 64) {
      const base = 1 / fps;
      const delta = jitter ? base * (0.45 + rand() * 1.1) : base;
      // Godot runs the physics ticks that are due, then _process, once per rendered frame
      s.acc += delta;
      let steps = 0;
      while (s.acc >= TICK && steps < 8) {
        s.x[2] += speed * TICK;
        s.ticks.push(s.next);
        s.acc -= TICK;
        steps++;
        s.secTicks++;
      }
      s.x[0] += speed / 60;
      s.x[1] += speed * delta;
      s.frames.push(s.next);
      s.secFrames++;
      for (let i = 0; i < 3; i++) {
        s.trail[i].push(s.x[i]);
        if (s.trail[i].length > 10) s.trail[i].shift();
      }
      s.lastDelta = delta;
      s.lastSteps = steps;
      s.next += delta;
    }
    while (s.frames.length && s.frames[0] < s.vt - WINDOW) s.frames.shift();
    while (s.ticks.length && s.ticks[0] < s.vt - WINDOW) s.ticks.shift();
    if (s.vt - s.secStart >= 1) {
      const span = s.vt - s.secStart;
      s.speed = s.x.map((x, i) => (x - s.secX[i]) / span);
      s.fpsMeasured = s.secFrames / span;
      s.tps = s.secTicks / span;
      s.secStart = s.vt;
      s.secX = [...s.x];
      s.secFrames = 0;
      s.secTicks = 0;
    }
  };

  const draw = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const s = sim.current;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#2d3a2e';
    ctx.fillRect(0, 0, W, H);
    const tiles = SHEETS['tiles_overworld'];
    LANES.forEach((L, i) => {
      const y0 = L.y, feet = y0 + 40;
      rect(ctx, 0, y0, W, 44, i % 2 ? '#2a352b' : '#323f33');
      if (tiles) for (let gy = y0 + 12; gy < y0 + 44; gy += 16) for (let x = 0; x < W; x += 16) drawFrame(ctx, 'tiles_overworld', tiles.tiles?.grass ?? 0, x, gy);
      else rect(ctx, 0, y0 + 12, W, 32, '#5a8f4e');
      const wrap = (x: number) => (((x % (W + 32)) + W + 32) % (W + 32)) - 16;
      for (const tx of s.trail[i]) rect(ctx, wrap(tx), feet + 1, 1, 3, 'rgba(255,255,255,0.9)');
      const px = wrap(s.x[i]);
      if (SHEETS[L.sheet]) drawFrame(ctx, L.sheet, animFrame(L.sheet, L.anim, s.vt), px, feet + L.dy, { anchored: true });
      else rect(ctx, px - 6, feet - 14, 12, 14, '#d8c35a');
      rect(ctx, 0, y0, W, 12, 'rgba(0,0,0,0.55)');
      text(ctx, L.label, 3, y0 + 9, '#ffffff');
      text(ctx, `${s.speed[i].toFixed(0)} px/s`, W - 3, y0 + 9, '#ffd65a', 'right');
    });
    // timeline strip: rendered frames above, physics ticks below
    const ty = H - 30;
    rect(ctx, 0, ty - 6, W, 36, '#15181f');
    const sx = (t: number) => W - 6 - ((s.vt - t) / WINDOW) * (W - 52);
    for (const f of s.frames) rect(ctx, sx(f), ty, 1, 8, '#ffd65a');
    for (const f of s.ticks) rect(ctx, sx(f), ty + 13, 1, 8, '#7fd8ff');
    text(ctx, 'frames', 3, ty + 7, '#ffd65a');
    text(ctx, 'physics', 3, ty + 20, '#7fd8ff');
  };

  useFrameLoop(canvasRef, (dt) => {
    step(dt);
    draw();
    if (++tick.current % 8 === 0) force((n) => n + 1);
  });

  const s = sim.current;
  const code = useMemo(
    () => `extends Node2D

@export var speed := ${speed.toFixed(1)}  ## pixels per second


# Lane 1: a fixed step per frame. Correct only at exactly 60 fps.
func _process(_delta: float) -> void:
	position.x += speed / 60.0

# Lane 2: scale by delta, the seconds since the last frame.
# func _process(delta: float) -> void:
# 	position.x += speed * delta

# Lane 3: the same line in _physics_process, which Godot calls
# ${60} times per second whatever the frame rate.
# func _physics_process(delta: float) -> void:
# 	position.x += speed * delta`,
    [speed],
  );

  return (
    <FigureLayout
      side={
        <>
          <Slider label="frame rate" value={fps} min={10} max={240} step={1} onChange={setFps} fmt={(v) => `${v.toFixed(0)} fps`} />
          <Slider label="speed" value={speed} min={30} max={240} step={1} onChange={setSpeed} fmt={(v) => v.toFixed(0)} />
          <Toggle label="uneven frame times (jitter)" value={jitter} onChange={setJitter} />
          <Toggle label="slow motion (0.1×)" value={slow} onChange={setSlow} />
          <Btn onClick={() => (sim.current = fresh())}>Reset</Btn>
          <Readout
            rows={[
              ['\\texttt{delta}', `${(s.lastDelta * 1000).toFixed(1)} ms`],
              ['\\text{frames / s}', s.fpsMeasured.toFixed(0)],
              ['\\text{physics ticks / s}', s.tps.toFixed(0)],
              ['\\text{ticks this frame}', String(s.lastSteps)],
              ['v_1, v_2, v_3', s.speed.map((v) => v.toFixed(0)).join(', ')],
            ]}
          />
        </>
      }
      below={<CodeBlock code={code} file="scripts/mover.gd" compact />}
    >
      <div className="godot-col">
        <div className="game-screen">
          <canvas ref={canvasRef} width={W} height={H} style={{ aspectRatio: `${W} / ${H}` }} aria-label="three sprites moving with the same speed setting: per frame, with delta in _process, and in _physics_process" />
        </div>
        <div className="godot-note">White ticks under each sprite: its position on the last 10 rendered frames. The strip at the bottom shows the last 0.25 s of frames (yellow) and physics ticks (blue).</div>
      </div>
    </FigureLayout>
  );
}
