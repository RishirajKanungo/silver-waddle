// math.jumplab: a playable side-view jump tuned from designer parameters. Mirrors jump_lab_player.gd:
//   gravity = 2h / t²;  jump_velocity = -2h / t
//   g = gravity * fall_multiplier when falling; velocity.y += g * delta
//   jump on floor; release while rising: velocity.y *= jump_cut
// Traces the real arc and plots height over time against the analytic curve.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, text, drawFrame, animFrame, playSound, type Input } from '../game';
import { Slider, Toggle, Readout, FigureLayout } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { dashed, hud, f, gf } from './common';
import { drawSolids, sky, moveAndCollide, type Body, type Box } from './sidescene';

const W = 320, H = 180;
const GROUND = 164;
const SOLIDS: Box[] = [
  [0, GROUND, W, 16],
  [176, GROUND - 32, 32, 32],
  [256, GROUND - 64, 32, 64],
];

export function JumpLab({ spec }: { spec: VizSpec }) {
  const [h, setH] = useState((spec.height as number) ?? 48);
  const [tApex, setTApex] = useState((spec.timeToApex as number) ?? 0.4);
  const [fallMul, setFallMul] = useState((spec.fallMultiplier as number) ?? 1);
  const [variable, setVariable] = useState(spec.variable === true);
  const [cut, setCut] = useState(0.5);
  const [showCurve, setShowCurve] = useState(true);
  const run = 90;
  const p = useRef({ h, tApex, fallMul, variable, cut });
  p.current = { h, tApex, fallMul, variable, cut };
  const s = useRef({
    b: { x: 60, y: GROUND, vx: 0, vy: 0, hw: 5, hh: 22, onFloor: true } as Body,
    flip: false,
    t: 0,
    air: -1, // time since takeoff, -1 on the ground
    takeoffY: GROUND,
    trace: [] as [number, number][],
    hist: [] as [number, number][], // [time since takeoff, height above takeoff]
    apex: 0,
    lastApex: 0,
    lastAir: 0,
    n: 0,
  }).current;
  const [ro, setRo] = useState({ apex: 0, air: 0 });

  const update = (dt: number, input: Input) => {
    const { h, tApex, fallMul, variable, cut } = p.current;
    const gravity = (2 * h) / (tApex * tApex);
    const jumpVelocity = (-2 * h) / tApex;
    const b = s.b;
    // gravity, stronger on the way down
    let g = gravity;
    if (b.vy > 0) g *= fallMul;
    b.vy += g * dt;
    if (b.onFloor && (input.justPressed('jump') || input.justPressed('up'))) {
      b.vy = jumpVelocity;
      s.air = 0;
      s.takeoffY = b.y;
      s.trace = [];
      s.hist = [];
      s.apex = 0;
      playSound('sfx_jump', 0.3);
    }
    if ((input.justReleased('jump') || input.justReleased('up')) && b.vy < 0 && variable) b.vy *= cut;
    const [ix] = input.vector();
    b.vx = ix * run;
    if (ix) s.flip = ix < 0;
    const wasAir = s.air >= 0;
    moveAndCollide(b, SOLIDS, dt);
    b.x = Math.max(6, Math.min(W - 6, b.x));
    s.t += dt;
    if (s.air >= 0) {
      s.air += dt;
      const height = s.takeoffY - b.y;
      s.apex = Math.max(s.apex, height);
      if (s.trace.length < 400) s.trace.push([b.x, b.y]);
      if (s.hist.length < 400) s.hist.push([s.air, height]);
      if (b.onFloor && wasAir && s.air > dt) {
        s.lastApex = s.apex;
        s.lastAir = s.air;
        s.air = -1;
        playSound('sfx_land', 0.25);
      }
    }
    if (++s.n % 6 === 0) setRo({ apex: s.air >= 0 ? s.apex : s.lastApex, air: s.air >= 0 ? s.air : s.lastAir });
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const { h, tApex, fallMul } = p.current;
    sky(ctx, W, H);
    drawSolids(ctx, SOLIDS);
    // target apex line, measured from the last takeoff
    dashed(ctx, 0, s.takeoffY - h, W, s.takeoffY - h, 'rgba(255,255,255,0.8)', 4);
    text(ctx, `h = ${h} px`, 4, s.takeoffY - h - 3, '#ffffff');
    for (let i = 0; i < s.trace.length; i += 2) {
      ctx.fillStyle = 'rgba(255,214,90,0.95)';
      ctx.fillRect(Math.round(s.trace[i][0]) - 1, Math.round(s.trace[i][1]) - 12, 2, 2);
    }
    const b = s.b;
    const anim = !b.onFloor ? 'jump_side' : Math.abs(b.vx) > 1 ? 'walk_side' : 'idle_side';
    drawFrame(ctx, 'hero', animFrame('hero', anim, s.t), b.x, b.y, { anchored: true, flipH: s.flip });
    // inset plot: height over time, measured dots vs analytic curve
    const px = 6, py = 22, pw = 112, ph = 52;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(px - 2, py - 2, pw + 4, ph + 4);
    const tFall = tApex / Math.sqrt(fallMul);
    const T = (tApex + tFall) * 1.1;
    const top = Math.max(h, 16) * 1.15;
    const X = (t: number) => px + (t / T) * pw, Y = (v: number) => py + ph - (v / top) * ph;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(px, Y(0) + 0.5);
    ctx.lineTo(px + pw, Y(0) + 0.5);
    ctx.stroke();
    if (showCurve) {
      const gravity = (2 * h) / (tApex * tApex), v0 = (2 * h) / tApex;
      ctx.strokeStyle = '#8fc7ff';
      ctx.beginPath();
      for (let i = 0; i <= 60; i++) {
        const t = ((tApex + tFall) * i) / 60;
        const v = t <= tApex ? v0 * t - 0.5 * gravity * t * t : h - 0.5 * gravity * fallMul * (t - tApex) ** 2;
        if (i) ctx.lineTo(X(t), Y(v));
        else ctx.moveTo(X(t), Y(v));
      }
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd65a';
    for (const [t, v] of s.hist) if (t <= T) ctx.fillRect(Math.round(X(t)), Math.round(Y(v)), 1, 1);
    text(ctx, 'height / time', px, py - 4, '#ffffff');
    hud(
      ctx,
      [
        [`apex ${(s.air >= 0 ? s.apex : s.lastApex).toFixed(1)} px`, '#ffd65a'],
        [`air ${(s.air >= 0 ? s.air : s.lastAir).toFixed(2)} s`, '#ffffff'],
      ],
      W - 2,
      2,
      'right',
      text,
    );
  };

  const gravity = (2 * h) / (tApex * tApex), v0 = (2 * h) / tApex;
  const tFall = tApex / Math.sqrt(fallMul);
  const code = useMemo(
    () => `extends CharacterBody2D

@export var run_speed := 90.0
@export var jump_height := ${gf(h)}       ## pixels
@export var time_to_apex := ${gf(tApex, 2)}     ## seconds
@export var fall_multiplier := ${gf(fallMul, 2)}  ## gravity scale while falling
@export var jump_cut := ${variable ? gf(cut, 2) : '1.0'}        ## upward speed kept on early release


func _physics_process(delta: float) -> void:
	var gravity := 2.0 * jump_height / (time_to_apex * time_to_apex)  # ${f(gravity, 1)}
	var jump_velocity := -2.0 * jump_height / time_to_apex            # ${f(-v0, 1)}

	var g := gravity
	if velocity.y > 0.0:
		g *= fall_multiplier
	velocity.y += g * delta

	if is_on_floor() and Input.is_action_just_pressed("jump"):
		velocity.y = jump_velocity
	if Input.is_action_just_released("jump") and velocity.y < 0.0:
		velocity.y *= jump_cut

	velocity.x = Input.get_axis("move_left", "move_right") * run_speed
	move_and_slide()
`,
    [h, tApex, fallMul, variable, cut, gravity, v0],
  );
  return (
    <FigureLayout
      side={
        <>
          <Slider label="jump_height" value={h} min={16} max={96} step={4} onChange={setH} fmt={(v) => v.toFixed(0)} />
          <Slider label="time_to_apex" value={tApex} min={0.2} max={0.7} step={0.05} onChange={setTApex} fmt={(v) => v.toFixed(2)} />
          <Slider label="fall_multiplier" value={fallMul} min={1} max={3} step={0.1} onChange={setFallMul} fmt={(v) => v.toFixed(1)} />
          <Toggle label="variable height (cut on release)" value={variable} onChange={setVariable} />
          {variable && <Slider label="jump_cut" value={cut} min={0.1} max={1} step={0.05} onChange={setCut} fmt={(v) => v.toFixed(2)} />}
          <Toggle label="analytic curve in the inset" value={showCurve} onChange={setShowCurve} />
          <Readout
            rows={[
              ['g = 2h/t^2', `${f(gravity, 0)} px/s²`],
              ['v_0 = 2h/t', `${f(v0, 0)} px/s`],
              ['t_{\\text{fall}} = t/\\sqrt{m}', `${f(tFall, 3)} s`],
              ['\\text{airtime}', `${f(tApex + tFall, 3)} s`],
              ['\\text{measured apex}', `${f(ro.apex, 1)} px`],
              ['\\text{measured air}', `${f(ro.air, 2)} s`],
              ...(variable ? ([['\\text{min hop } c^2 h', `${f(cut * cut * h, 1)} px`]] as [string, string][]) : []),
            ]}
          />
        </>
      }
      below={<CodeBlock code={code} file="scripts/math/jump_lab_player.gd" compact />}
    >
      <GameCanvas width={W} height={H} update={update} draw={draw} touchButtons={['left', 'right', 'jump']} keysHint={<Keys items={[['A D / ← →', 'run'], ['Space / W / ↑', 'jump (hold)']]} />} label="jump lab: run with A and D or arrow keys, jump with space" />
    </FigureLayout>
  );
}
