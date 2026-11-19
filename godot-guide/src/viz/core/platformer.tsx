// core.platformer: a side-view platformer controller. Mirrors scripts/platformer_player.gd from c03-3:
//   rise/fall gravity from jump height and times, apex hang, fall-speed cap, coyote time and jump
//   buffering as "seconds since" timers, a jump cut on release, one-way platforms and a moving
//   platform whose velocity is added when the player leaves it. Velocity is updated before the move
//   (semi-implicit Euler, like move_and_slide), so the measured apex sits slightly under jump_height.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, theme, text, rect, playSound, SHEETS, drawFrame, type Input } from '../game';
import { Slider, Toggle, Readout, FigureLayout } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { type Box, moveToward, drawChar, FrameLog, drawTimeline, type TLRow } from './motionkit';

const W = 320, H = 180, PW = 10, PH = 20;
const RUN = 100, RUN_ACCEL = 1000, APEX_THRESHOLD = 30, APEX_SCALE = 0.5, JUMP_CUT = 0.5, FALL_CAP = 300;
const SOLIDS: Box[] = [
  [0, 148, 112, 32],
  [160, 148, 160, 32],
  [256, 100, 64, 48],
  [0, 0, 4, H],
  [W - 4, 0, 4, H],
];
const ONE_WAY: Box[] = [
  [32, 108, 56, 4],
  [196, 72, 44, 4],
];
const PLAT = { x0: 112, x1: 196, y: 112, w: 40, h: 8, period: 4 };

const B = { floor: 1, held: 2, press: 4, buffer: 8, coyote: 16, jump: 32, eaten: 64 };
const ROWS: TLRow[] = [
  { label: 'on floor', bit: B.floor, color: 'ok' },
  { label: 'jump held', bit: B.held, color: 'muted' },
  { label: 'press', bit: B.press, color: 'fg', style: 'tick' },
  { label: 'buffer', bit: B.buffer, color: 'warn' },
  { label: 'coyote', bit: B.coyote, color: 'u' },
  { label: 'JUMP', bit: B.jump, color: 'accent', style: 'tick' },
  { label: 'eaten', bit: B.eaten, color: 'bad', style: 'tick' },
];

export function PlatformerLab({ spec }: { spec: VizSpec }) {
  const [jumpHeight, setJumpHeight] = useState((spec.jumpHeight as number) ?? 40);
  const [timeToPeak, setTimeToPeak] = useState((spec.timeToPeak as number) ?? 0.35);
  const [timeToFall, setTimeToFall] = useState((spec.timeToFall as number) ?? 0.28);
  const [coyoteOn, setCoyoteOn] = useState(true);
  const [bufferOn, setBufferOn] = useState(true);
  const [cutOn, setCutOn] = useState(true);
  const [apexOn, setApexOn] = useState(true);
  const [capOn, setCapOn] = useState(true);
  const tl = useRef<HTMLCanvasElement>(null);
  const log = useRef(new FrameLog(130)).current;
  const s = useRef({
    x: 40, y: 148, vx: 0, vy: 0, onFloor: true, onPlat: false, flip: false, t: 0,
    sinceOnFloor: 0, sinceJumpPress: Infinity, pressFrame: 0, leftFloorFrame: 0, frame: 0,
    jumpY: 148, apex: 0, lastApex: 0, lastHow: '', byBuffer: 0, byCoyote: 0, eaten: 0,
  }).current;
  const plat = useRef({ x: PLAT.x0, vx: 0, t: 0 }).current;
  const trail = useRef<[number, number][]>([]).current;
  const [ro, setRo] = useState({ vy: 0, apex: 0, how: '', byBuffer: 0, byCoyote: 0, eaten: 0 });

  const coyoteTime = coyoteOn ? 0.1 : 0;
  const jumpBuffer = bufferOn ? 0.12 : 0;
  const jumpVelocity = (-2 * jumpHeight) / timeToPeak;
  const riseGravity = (2 * jumpHeight) / (timeToPeak * timeToPeak);
  const fallGravity = (2 * jumpHeight) / (timeToFall * timeToFall);

  const platBox = (): Box => [plat.x, PLAT.y, PLAT.w, PLAT.h];
  const overlaps = (b: Box, x: number, y: number) => x - PW / 2 < b[0] + b[2] && x + PW / 2 > b[0] && y - PH < b[1] + b[3] && y > b[1];

  const update = (dt: number, input: Input) => {
    let flags = 0;
    s.frame++;
    // the moving platform (an AnimatableBody2D moved by a tween in the lesson)
    const px0 = plat.x;
    plat.t += dt;
    const u = 0.5 - 0.5 * Math.cos((2 * Math.PI * plat.t) / PLAT.period);
    plat.x = PLAT.x0 + (PLAT.x1 - PLAT.x0) * u;
    plat.vx = (plat.x - px0) / dt;
    if (s.onPlat) s.x += plat.x - px0; // carried along: the platform velocity
    else if (overlaps(platBox(), s.x, s.y)) s.x = plat.vx > 0 ? plat.x + PLAT.w + PW / 2 : plat.x - PW / 2;

    if (s.onFloor) s.sinceOnFloor = 0;
    if (input.justPressed('jump')) {
      if (s.sinceJumpPress !== Infinity) {
        s.eaten++;
        flags |= B.eaten;
      }
      s.sinceJumpPress = 0;
      s.pressFrame = s.frame;
      flags |= B.press;
    }
    let gravity = s.vy < 0 ? riseGravity : fallGravity;
    if (apexOn && Math.abs(s.vy) < APEX_THRESHOLD && input.isDown('jump')) gravity *= APEX_SCALE;
    if (!s.onFloor) s.vy = Math.min(s.vy + gravity * dt, capOn ? FALL_CAP : 5000);

    if (s.sinceJumpPress <= jumpBuffer + 1e-9 && s.sinceOnFloor <= coyoteTime + 1e-9) {
      const viaBuffer = s.sinceJumpPress > 0, viaCoyote = s.sinceOnFloor > 0;
      if (viaBuffer) s.byBuffer++;
      if (viaCoyote) s.byCoyote++;
      s.lastHow = viaBuffer ? `buffer: pressed ${s.frame - s.pressFrame} frames before landing` : viaCoyote ? `coyote: ${s.frame - s.leftFloorFrame} frames after leaving the edge` : 'on the floor, same frame';
      s.vy = jumpVelocity;
      if (s.onPlat) s.vx += plat.vx; // platform_on_leave: add the platform's velocity
      s.sinceJumpPress = Infinity;
      s.sinceOnFloor = Infinity;
      s.jumpY = s.y;
      s.apex = 0;
      trail.length = 0;
      flags |= B.jump;
      playSound('sfx_jump', 0.3);
    }
    if (cutOn && input.justReleased('jump') && s.vy < 0) s.vy *= JUMP_CUT;

    const dir = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
    s.vx = moveToward(s.vx, dir * RUN, RUN_ACCEL * dt);
    if (dir) s.flip = dir < 0;

    // move_and_slide: x then y against solids; one-way platforms only from above
    const wasFloor = s.onFloor, wasPlat = s.onPlat;
    s.x += s.vx * dt;
    for (const b of SOLIDS)
      if (overlaps(b, s.x, s.y)) {
        s.x = s.vx > 0 ? b[0] - PW / 2 : b[0] + b[2] + PW / 2;
        s.vx = 0;
      }
    const prevY = s.y;
    s.y += s.vy * dt;
    s.onFloor = false;
    s.onPlat = false;
    for (const b of SOLIDS)
      if (overlaps(b, s.x, s.y)) {
        if (s.vy >= 0) {
          s.y = b[1];
          s.onFloor = true;
        } else s.y = b[1] + b[3] + PH;
        s.vy = 0;
      }
    for (const b of [...ONE_WAY, platBox()])
      if (s.vy >= 0 && prevY <= b[1] + 0.01 && overlaps(b, s.x, s.y)) {
        s.y = b[1];
        s.vy = 0;
        s.onFloor = true;
        if (b[0] === plat.x) s.onPlat = true;
      }
    // standing still on a floor: probe 1 px down so is_on_floor() stays true
    if (!s.onFloor && s.vy >= 0) {
      for (const b of [...SOLIDS, ...ONE_WAY, platBox()])
        if (Math.abs(s.y - b[1]) < 0.5 && s.x + PW / 2 > b[0] && s.x - PW / 2 < b[0] + b[2]) {
          s.onFloor = true;
          s.y = b[1];
          if (b[0] === plat.x && b[1] === PLAT.y) s.onPlat = true;
        }
    }
    if (wasFloor && !s.onFloor) {
      s.leftFloorFrame = s.frame;
      if (wasPlat && s.vy >= 0) s.vx += plat.vx;
    }
    if (!wasFloor && s.onFloor) {
      s.lastApex = s.apex;
      playSound('sfx_land', 0.25);
    }
    if (!s.onFloor) {
      s.apex = Math.max(s.apex, s.jumpY - s.y);
      if (s.frame % 2 === 0) trail.push([s.x, s.y]);
      if (trail.length > 80) trail.shift();
    }
    if (s.y > H + 40) {
      Object.assign(s, { x: 40, y: 148, vx: 0, vy: 0, onFloor: true, onPlat: false });
    }
    s.sinceOnFloor += dt;
    // a waiting press that is now too old never fires: it was eaten
    if (s.sinceJumpPress !== Infinity) {
      if (s.sinceJumpPress + dt > jumpBuffer + 1e-9) {
        s.sinceJumpPress = Infinity;
        s.eaten++;
        flags |= B.eaten;
      } else {
        s.sinceJumpPress += dt;
        flags |= B.buffer;
      }
    }
    if (s.onFloor) flags |= B.floor;
    else if (s.sinceOnFloor <= coyoteTime) flags |= B.coyote;
    if (input.isDown('jump')) flags |= B.held;
    log.push(flags);
    s.t += dt;
    if (s.frame % 6 === 0) setRo({ vy: s.vy, apex: s.lastApex, how: s.lastHow, byBuffer: s.byBuffer, byCoyote: s.byCoyote, eaten: s.eaten });
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const th = theme(ctx.canvas);
    ctx.fillStyle = '#92ccf6';
    ctx.fillRect(0, 0, W, H);
    rect(ctx, 0, 120, W, 60, '#7fb4dc');
    const tp = SHEETS['tiles_platform']?.tiles;
    const block = (b: Box) => {
      const [x, y, w, h] = b;
      if (tp && tp.ground_top !== undefined) {
        for (let ty = y; ty < y + h; ty += 16) for (let tx = x; tx < x + w; tx += 16) drawFrame(ctx, 'tiles_platform', ty === y ? tp.ground_top : tp.ground ?? tp.ground_top, tx, ty);
        return;
      }
      rect(ctx, x, y, w, h, '#9c5e3c');
      for (let yy = y + 8; yy < y + h; yy += 8) for (let xx = x + ((yy / 8) % 2) * 6; xx < x + w; xx += 12) rect(ctx, xx, yy, 1, 3, '#64392c');
      rect(ctx, x, y, w, 4, '#4f9e3e');
      rect(ctx, x, y, w, 1, '#a2d052');
    };
    for (const b of SOLIDS.slice(0, 3)) block(b);
    for (const [x, y, w] of ONE_WAY) {
      rect(ctx, x, y, w, 3, '#cf9058');
      rect(ctx, x, y + 3, w, 1, '#64392c');
      for (let xx = x + 3; xx < x + w; xx += 10) rect(ctx, xx, y + 4, 1, 4, '#64392c');
    }
    text(ctx, 'one-way', ONE_WAY[0][0] + 6, ONE_WAY[0][1] - 3, '#1a1424');
    rect(ctx, plat.x, PLAT.y, PLAT.w, PLAT.h, '#514c68');
    rect(ctx, plat.x, PLAT.y, PLAT.w, 2, '#c0bed4');
    text(ctx, 'moving', plat.x + 2, PLAT.y + 16, '#1a1424');
    for (const [x, y] of trail) rect(ctx, x, y - PH / 2, 1, 1, '#fbf6e6');
    const anim = !s.onFloor ? 'jump_side' : Math.abs(s.vx) > 5 ? 'walk_side' : 'idle_side';
    drawChar(ctx, 'hero', anim, s.t, s.x, s.y, { flip: s.flip });
    // jump height ruler at the start ledge
    const gy = 148;
    rect(ctx, 8, gy - jumpHeight, 6, 1, '#1a1424');
    rect(ctx, 10, gy - jumpHeight, 1, jumpHeight, '#1a1424');
    text(ctx, `h=${jumpHeight}`, 16, gy - jumpHeight + 3, '#1a1424');
    drawTimeline(tl.current, log, ROWS, th);
  };

  const code = useMemo(
    () => `@export var jump_height := ${jumpHeight.toFixed(1)}
@export var time_to_peak := ${timeToPeak.toFixed(2)}
@export var time_to_fall := ${timeToFall.toFixed(2)}
@export var coyote_time := ${coyoteTime.toFixed(2)}
@export var jump_buffer := ${jumpBuffer.toFixed(2)}
@export var jump_cut := ${(cutOn ? JUMP_CUT : 1).toFixed(2)}
@export var apex_gravity_scale := ${(apexOn ? APEX_SCALE : 1).toFixed(2)}
@export var max_fall_speed := ${(capOn ? FALL_CAP : 5000).toFixed(1)}

func _physics_process(delta: float) -> void:
	var jump_velocity := -2.0 * jump_height / time_to_peak  # ${jumpVelocity.toFixed(0)} px/s
	var rise_gravity := 2.0 * jump_height / (time_to_peak * time_to_peak)  # ${riseGravity.toFixed(0)}
	var fall_gravity := 2.0 * jump_height / (time_to_fall * time_to_fall)  # ${fallGravity.toFixed(0)}
	if is_on_floor():
		_since_on_floor = 0.0
	if Input.is_action_just_pressed("jump"):
		_since_jump_press = 0.0
	# ... gravity, the jump test and the jump cut as in the lesson
`,
    [jumpHeight, timeToPeak, timeToFall, coyoteTime, jumpBuffer, cutOn, apexOn, capOn, jumpVelocity, riseGravity, fallGravity],
  );

  return (
    <FigureLayout
      side={
        <>
          <Slider label="jump_height" value={jumpHeight} min={16} max={64} step={2} onChange={setJumpHeight} fmt={(v) => v.toFixed(0) + ' px'} />
          <Slider label="time_to_peak" value={timeToPeak} min={0.2} max={0.6} step={0.01} onChange={setTimeToPeak} fmt={(v) => v.toFixed(2) + ' s'} />
          <Slider label="time_to_fall" value={timeToFall} min={0.15} max={0.6} step={0.01} onChange={setTimeToFall} fmt={(v) => v.toFixed(2) + ' s'} />
          <Toggle label="coyote time (0.10 s)" value={coyoteOn} onChange={setCoyoteOn} />
          <Toggle label="jump buffer (0.12 s)" value={bufferOn} onChange={setBufferOn} />
          <Toggle label="variable height (cut ×0.5)" value={cutOn} onChange={setCutOn} />
          <Toggle label="apex hang (gravity ×0.5)" value={apexOn} onChange={setApexOn} />
          <Toggle label="fall-speed cap (300 px/s)" value={capOn} onChange={setCapOn} />
          <Readout
            rows={[
              ['v_0 = -2h/T_{\\uparrow}', `${jumpVelocity.toFixed(0)} px/s`],
              ['g_{\\uparrow},\\ g_{\\downarrow}', `${riseGravity.toFixed(0)}, ${fallGravity.toFixed(0)}`],
              ['v_y', `${ro.vy.toFixed(0)} px/s`],
              ['\\text{last apex}', `${ro.apex.toFixed(1)} px`],
              ['\\text{by buffer, coyote}', `${ro.byBuffer}, ${ro.byCoyote}`],
              ['\\text{presses eaten}', String(ro.eaten)],
            ]}
          />
          <div className="core-m-note">{ro.how ? 'Last jump: ' + ro.how : 'Jump with Space.'}</div>
        </>
      }
      below={<CodeBlock code={code} file="scripts/platformer_player.gd" compact />}
    >
      <div className="core-m-col">
        <GameCanvas
          width={W}
          height={H}
          update={update}
          draw={draw}
          touchButtons={['left', 'right', 'jump']}
          keysHint={<Keys items={[['A / D / arrows', 'run'], ['Space', 'jump (hold for height)']]} />}
          label="platformer lab: run with A and D, jump with Space"
        />
        <canvas ref={tl} width={320} height={11 + ROWS.length * 10 + 2} className="core-m-timeline" aria-label="frame timeline of floor contact, jump presses, buffer, coyote time and accepted jumps" />
      </div>
    </FigureLayout>
  );
}
