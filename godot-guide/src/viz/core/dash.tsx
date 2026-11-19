// core.dash: a playable dash lab. Mirrors the Player script of lesson c02-2:
//   timers tick, a "dodge" press stamps _since_dodge_press = 0, a dash starts when the press is at most
//   buffer_time old and the cooldown is over, the dash moves at dash_speed for dash_frames physics
//   frames with i-frames counted from its start, afterimages fade with a tween.
// The frame timeline under the game shows presses, the buffer, the dash, i-frames and the cooldown.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, theme, text, rect, playSound, type Input } from '../game';
import { Slider, Toggle, Readout, FigureLayout } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { type Box, moveToward2, feetHit, inBox, drawChar, drawGrass, drawWall, drawShadow, FrameLog, drawTimeline, type TLRow } from './motionkit';

const W = 320, H = 180, DT = 1 / 60;
const WALLS: Box[] = [
  [0, 0, W, 16],
  [0, H - 16, W, 16],
  [0, 0, 16, H],
  [W - 16, 0, 16, H],
  [200, 16, 16, 64],
  [200, 116, 16, 48],
];
const SPIKES: Box = [112, 72, 48, 32];
const MAX_SPEED = 90, ACCEL = 900, FRICTION = 1200;

type Facing = 'down' | 'up' | 'side';
const B = { press: 1, buffer: 2, dash: 4, iframe: 8, cool: 16, start: 32, lost: 64, hurt: 128 };
const ROWS: TLRow[] = [
  { label: 'dodge', bit: B.press, color: 'fg', style: 'tick' },
  { label: 'buffer', bit: B.buffer, color: 'warn' },
  { label: 'dash', bit: B.dash, color: 'accent' },
  { label: 'start', bit: B.start, color: 'ok', style: 'tick' },
  { label: 'i-frames', bit: B.iframe, color: 'u' },
  { label: 'cooldown', bit: B.cool, color: 'muted' },
  { label: 'lost', bit: B.lost, color: 'bad', style: 'tick' },
  { label: 'hurt', bit: B.hurt, color: 'err', style: 'tick' },
];

interface Ghost {
  x: number;
  y: number;
  anim: string;
  t: number;
  flip: boolean;
  age: number;
}

export function DashLab({ spec }: { spec: VizSpec }) {
  const [dashSpeed, setDashSpeed] = useState((spec.dashSpeed as number) ?? 240);
  const [dashFrames, setDashFrames] = useState((spec.dashFrames as number) ?? 10);
  const [iframeFrames, setIframeFrames] = useState((spec.iframeFrames as number) ?? 8);
  const [cooldown, setCooldown] = useState((spec.cooldown as number) ?? 0.3);
  const [bufferTime, setBufferTime] = useState((spec.bufferTime as number) ?? 0.12);
  const [ghostsOn, setGhostsOn] = useState(true);
  const tl = useRef<HTMLCanvasElement>(null);
  const log = useRef(new FrameLog(130)).current;
  const s = useRef({
    x: 60, y: 96, vx: 0, vy: 0, facing: 'side' as Facing, flip: false, t: 0,
    dashFramesLeft: 0, dashDx: 0, dashDy: 0, iframesLeft: 0, cooldownLeft: 0, sinceDodgePress: Infinity,
    pressBusy: false, hurtFlash: 0, rescued: 0, lost: 0, hits: 0, dashes: 0,
  }).current;
  const ghosts = useRef<Ghost[]>([]).current;
  const [ro, setRo] = useState({ rescued: 0, lost: 0, hits: 0, dashes: 0 });
  const frameNo = useRef(0);

  const facingVector = (): [number, number] => (s.facing === 'up' ? [0, -1] : s.facing === 'down' ? [0, 1] : [s.flip ? -1 : 1, 0]);
  const updateFacing = (ix: number, iy: number) => {
    if (ix === 0 && iy === 0) return;
    if (Math.abs(ix) > Math.abs(iy)) {
      s.facing = 'side';
      s.flip = ix < 0;
    } else s.facing = iy < 0 ? 'up' : 'down';
  };
  const move = (dx: number, dy: number) => {
    s.x += dx;
    if (feetHit(WALLS, s.x, s.y)) {
      s.x -= dx;
      s.vx = 0;
    }
    s.y += dy;
    if (feetHit(WALLS, s.x, s.y)) {
      s.y -= dy;
      s.vy = 0;
    }
  };

  const update = (dt: number, input: Input) => {
    let flags = 0;
    // _tick_timers
    s.cooldownLeft = Math.max(s.cooldownLeft - dt, 0);
    s.iframesLeft = Math.max(s.iframesLeft - 1, 0);
    s.hurtFlash = Math.max(0, s.hurtFlash - dt);
    if (input.justPressed('dash')) {
      // a press while one is still waiting replaces it; the old one counts as lost
      if (s.sinceDodgePress !== Infinity && s.pressBusy) s.lost++;
      s.sinceDodgePress = 0;
      s.pressBusy = s.dashFramesLeft > 0 || s.cooldownLeft > 0;
      flags |= B.press;
    }
    const [ix, iy] = input.vector();
    if (s.dashFramesLeft > 0) dashStep();
    else if (s.sinceDodgePress <= bufferTime && s.cooldownLeft <= 0) {
      // _start_dash
      if (s.sinceDodgePress > 0) s.rescued++;
      s.sinceDodgePress = Infinity; // consume the press: one press, one dash
      const n = Math.hypot(ix, iy);
      const [fx, fy] = facingVector();
      s.dashDx = n > 0 ? ix / n : fx;
      s.dashDy = n > 0 ? iy / n : fy;
      s.dashFramesLeft = dashFrames;
      s.iframesLeft = iframeFrames;
      updateFacing(s.dashDx, s.dashDy);
      s.dashes++;
      flags |= B.start;
      playSound('sfx_dash', 0.35);
      dashStep();
    } else {
      const rate = ix !== 0 || iy !== 0 ? ACCEL : FRICTION;
      moveToward2(s, ix * MAX_SPEED, iy * MAX_SPEED, rate * dt);
      move(s.vx * dt, s.vy * dt);
      updateFacing(ix, iy);
    }
    // a waiting press that is now too old will never trigger: count it as lost
    if (s.sinceDodgePress !== Infinity && s.sinceDodgePress + dt > bufferTime) {
      flags |= B.lost;
      s.lost++;
      s.sinceDodgePress = Infinity;
    } else if (s.sinceDodgePress !== Infinity) {
      flags |= B.buffer;
      s.sinceDodgePress += dt;
    }
    // spikes: checked every frame, like get_overlapping_bodies() in spikes.gd
    if (inBox(SPIKES, s.x, s.y - 2) && s.iframesLeft === 0) {
      const cx = SPIKES[0] + SPIKES[2] / 2, cy = SPIKES[1] + SPIKES[3] / 2;
      const dx = s.x - cx, dy = s.y - cy, d = Math.hypot(dx, dy) || 1;
      s.vx = (dx / d) * 160;
      s.vy = (dy / d) * 160;
      s.dashFramesLeft = 0;
      s.iframesLeft = 36;
      s.hurtFlash = 0.3;
      s.hits++;
      flags |= B.hurt;
      playSound('sfx_hurt', 0.35);
    }
    if (s.dashFramesLeft > 0) flags |= B.dash;
    if (s.iframesLeft > 0) flags |= B.iframe;
    if (s.cooldownLeft > 0) flags |= B.cool;
    log.push(flags);
    s.t += dt;
    for (let i = ghosts.length - 1; i >= 0; i--) {
      ghosts[i].age += dt;
      if (ghosts[i].age > 0.25) ghosts.splice(i, 1);
    }
    if (++frameNo.current % 6 === 0 && (ro.rescued !== s.rescued || ro.lost !== s.lost || ro.hits !== s.hits || ro.dashes !== s.dashes)) setRo({ rescued: s.rescued, lost: s.lost, hits: s.hits, dashes: s.dashes });
  };

  function dashStep() {
    s.vx = s.dashDx * dashSpeed;
    s.vy = s.dashDy * dashSpeed;
    move(s.vx * DT, s.vy * DT);
    s.dashFramesLeft -= 1;
    if (ghostsOn && s.dashFramesLeft % 2 === 0) ghosts.push({ x: s.x, y: s.y, anim: 'dash_' + s.facing, t: s.t, flip: s.flip, age: 0 });
    if (s.dashFramesLeft === 0) {
      s.cooldownLeft = cooldown;
      // leave the dash at walking speed, so friction does not turn the end into a long slide
      s.vx = s.dashDx * MAX_SPEED;
      s.vy = s.dashDy * MAX_SPEED;
    }
  }

  const draw = (ctx: CanvasRenderingContext2D) => {
    const th = theme(ctx.canvas);
    drawGrass(ctx, W, H);
    // spikes: a neutral metal plate with points
    const [sx, sy, sw, sh] = SPIKES;
    rect(ctx, sx, sy, sw, sh, '#514c68');
    for (let y = sy + 4; y < sy + sh; y += 8)
      for (let x = sx + 4; x < sx + sw; x += 8) {
        rect(ctx, x - 2, y + 1, 5, 2, '#2c2840');
        rect(ctx, x - 1, y - 2, 3, 3, '#c0bed4');
        rect(ctx, x, y - 3, 1, 1, '#fbf6e6');
      }
    text(ctx, 'spikes', sx + sw / 2, sy - 3, '#ffffff', 'center');
    for (const [x, y, w, h] of WALLS) drawWall(ctx, x, y, w, h);
    for (const g of ghosts) drawChar(ctx, 'hero', g.anim, g.t, g.x, g.y, { flip: g.flip, alpha: 0.7 * (1 - g.age / 0.25), flash: 0.6, flashColor: '#92ccf6' });
    drawShadow(ctx, s.x, s.y);
    const sp = Math.hypot(s.vx, s.vy);
    const anim = (s.dashFramesLeft > 0 ? 'dash_' : sp > 5 ? 'walk_' : 'idle_') + s.facing;
    const blink = s.iframesLeft > 0 && Math.floor(s.t * 30) % 2 === 0;
    drawChar(ctx, 'hero', anim, s.t, s.x, s.y, { flip: s.flip, flash: s.hurtFlash > 0 ? 0.8 : blink ? 0.45 : 0, flashColor: s.hurtFlash > 0 ? '#d84f3c' : '#92ccf6' });
    // status line
    rect(ctx, 16, 16, 128, 11, 'rgba(0,0,0,0.5)');
    const status = s.dashFramesLeft > 0 ? `dash ${dashFrames - s.dashFramesLeft}/${dashFrames}` : s.cooldownLeft > 0 ? `cooldown ${(s.cooldownLeft * 1000).toFixed(0)} ms` : 'ready';
    text(ctx, status, 19, 25, s.dashFramesLeft > 0 ? '#9aeaee' : s.cooldownLeft > 0 ? '#c0bed4' : '#a2d052');
    drawTimeline(tl.current, log, ROWS, th);
  };

  const dist = (dashSpeed * dashFrames) / 60;
  const bufferFrames = Math.floor(bufferTime * 60 + 1e-6);
  const code = useMemo(
    () => `@export_group("Dash")
@export var dash_speed := ${dashSpeed.toFixed(1)}
@export var dash_frames := ${dashFrames}
@export var iframe_frames := ${iframeFrames}
@export var dash_cooldown := ${cooldown.toFixed(2)}
@export var buffer_time := ${bufferTime.toFixed(3)}

func _physics_process(delta: float) -> void:
	_cooldown_left = maxf(_cooldown_left - delta, 0.0)
	_iframes_left = maxi(_iframes_left - 1, 0)
	if Input.is_action_just_pressed("dodge"):
		_since_dodge_press = 0.0
	var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	if _dash_frames_left > 0:
		_dash_step()
	elif _since_dodge_press <= buffer_time and _cooldown_left <= 0.0:
		_start_dash(input)
		_dash_step()
	else:
		_walk(input, delta)
	_since_dodge_press += delta
	_update_animation()
`,
    [dashSpeed, dashFrames, iframeFrames, cooldown, bufferTime],
  );

  return (
    <FigureLayout
      side={
        <>
          <Slider label="dash_speed" value={dashSpeed} min={120} max={400} step={10} onChange={setDashSpeed} fmt={(v) => v.toFixed(0)} />
          <Slider label="dash_frames" value={dashFrames} min={4} max={20} step={1} onChange={(v) => { setDashFrames(v); if (iframeFrames > v) setIframeFrames(v); }} fmt={(v) => v.toFixed(0)} />
          <Slider label="iframe_frames" value={iframeFrames} min={0} max={dashFrames} step={1} onChange={setIframeFrames} fmt={(v) => v.toFixed(0)} />
          <Slider label="dash_cooldown" value={cooldown} min={0} max={0.8} step={0.05} onChange={setCooldown} fmt={(v) => v.toFixed(2) + ' s'} />
          <Slider label="buffer_time" value={bufferTime} min={0} max={0.25} step={1 / 60} onChange={setBufferTime} fmt={(v) => (v * 1000).toFixed(0) + ' ms'} />
          <Toggle label="afterimages" value={ghostsOn} onChange={setGhostsOn} />
          <Readout
            rows={[
              ['d = v_{\\text{dash}} \\cdot n / 60', `${dist.toFixed(1)} px`],
              ['\\text{dash time}', `${((dashFrames / 60) * 1000).toFixed(0)} ms`],
              ['\\text{i-frames}', `${((iframeFrames / 60) * 1000).toFixed(0)} ms`],
              ['\\text{buffer}', `${bufferFrames} frames`],
              ['\\text{dashes}', String(ro.dashes)],
              ['\\text{rescued by buffer}', String(ro.rescued)],
              ['\\text{presses lost}', String(ro.lost)],
              ['\\text{hits taken}', String(ro.hits)],
            ]}
          />
        </>
      }
      below={<CodeBlock code={code} file="scripts/player.gd" compact />}
    >
      <div className="core-m-col">
        <GameCanvas
          width={W}
          height={H}
          update={update}
          draw={draw}
          touchButtons={['up', 'down', 'left', 'right', 'dash']}
          keysHint={<Keys items={[['WASD / arrows', 'move'], ['K / X / Shift', 'dodge (dash)']]} />}
          label="dash lab: move with WASD, dash with K"
        />
        <canvas ref={tl} width={320} height={11 + ROWS.length * 10 + 2} className="core-m-timeline" aria-label="frame timeline of presses, buffer, dash, i-frames and cooldown" />
      </div>
    </FigureLayout>
  );
}
