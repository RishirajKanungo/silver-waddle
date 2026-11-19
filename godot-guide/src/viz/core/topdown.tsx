// core.topdown — a playable top-down movement lab. Mirrors the player script from the lesson:
//   velocity = velocity.move_toward(input * max_speed, rate * delta); move_and_slide()
// The learner tunes max speed, acceleration and friction by feel, sees speed over time and the
// footstep trail, and copies the exact GDScript for their values.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, theme, clear, rect, text, drawFrame, animFrame, SHEETS, type Input } from '../game';
import { Slider, Toggle, Readout, FigureLayout } from '../kit';
import { CodeBlock } from '../../ui/GameCells';

const W = 320, H = 180;
type Facing = 'down' | 'up' | 'side';
interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: Facing;
  flip: boolean;
  t: number; // animation clock
}
// room walls (axis-aligned rectangles, in game pixels)
const WALLS: [number, number, number, number][] = [
  [0, 0, W, 16],
  [0, H - 16, W, 16],
  [0, 0, 16, H],
  [W - 16, 0, 16, H],
  [120, 60, 48, 32],
  [220, 104, 32, 48],
];
const FEET_W = 10, FEET_H = 6; // collision box at the feet, like the lesson's CollisionShape2D

function collide(b: Body, dx: number, dy: number) {
  // move one axis at a time and push out of walls: this is the "slide" in move_and_slide
  const hit = (x: number, y: number) => WALLS.some(([wx, wy, ww, wh]) => x - FEET_W / 2 < wx + ww && x + FEET_W / 2 > wx && y - FEET_H < wy + wh && y > wy);
  b.x += dx;
  if (hit(b.x, b.y)) {
    b.x -= dx;
    b.vx = 0;
  }
  b.y += dy;
  if (hit(b.x, b.y)) {
    b.y -= dy;
    b.vy = 0;
  }
}

function moveToward(v: number, target: number, maxDelta: number) {
  return Math.abs(target - v) <= maxDelta ? target : v + Math.sign(target - v) * maxDelta;
}

export function TopDownLab({ spec }: { spec: VizSpec }) {
  const mode = (spec.mode as 'basic' | 'accel') ?? 'accel';
  const [maxSpeed, setMaxSpeed] = useState((spec.maxSpeed as number) ?? 90);
  const [accel, setAccel] = useState((spec.accel as number) ?? (mode === 'basic' ? 100000 : 900));
  const [friction, setFriction] = useState((spec.friction as number) ?? (mode === 'basic' ? 100000 : 1200));
  const [normalize, setNormalize] = useState(true);
  const [trail, setTrail] = useState(true);
  const body = useRef<Body>({ x: 60, y: 120, vx: 0, vy: 0, facing: 'down', flip: false, t: 0 }).current;
  const speedHist = useRef<number[]>([]).current;
  const dots = useRef<[number, number][]>([]).current;
  const sinceDot = useRef(0);
  const [readout, setReadout] = useState({ speed: 0, vx: 0, vy: 0 });
  const frameCount = useRef(0);

  const update = (dt: number, input: Input) => {
    const [ix, iy] = normalize ? input.vector() : input.rawVector();
    const moving = ix !== 0 || iy !== 0;
    const tx = ix * maxSpeed, ty = iy * maxSpeed;
    if (mode === 'basic') {
      body.vx = tx;
      body.vy = ty;
    } else {
      // Vector2.move_toward on the whole vector: same rate along the line to the target
      const dx = tx - body.vx, dy = ty - body.vy;
      const d = Math.hypot(dx, dy);
      const rate = (moving ? accel : friction) * dt;
      if (d <= rate) {
        body.vx = tx;
        body.vy = ty;
      } else {
        body.vx += (dx / d) * rate;
        body.vy += (dy / d) * rate;
      }
    }
    collide(body, body.vx * dt, body.vy * dt);
    // facing from input (so you can turn while standing still)
    if (moving) {
      if (Math.abs(ix) > Math.abs(iy)) {
        body.facing = 'side';
        body.flip = ix < 0;
      } else body.facing = iy < 0 ? 'up' : 'down';
    }
    body.t += dt;
    const sp = Math.hypot(body.vx, body.vy);
    speedHist.push(sp);
    if (speedHist.length > 180) speedHist.shift();
    sinceDot.current += dt;
    if (sinceDot.current >= 0.1) {
      sinceDot.current = 0;
      if (sp > 1) dots.push([body.x, body.y]);
      if (dots.length > 30) dots.shift();
    }
    if (++frameCount.current % 6 === 0) setReadout({ speed: sp, vx: body.vx, vy: body.vy });
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const th = theme(ctx.canvas);
    clear(ctx, '#5a8f4e');
    const tiles = SHEETS['tiles_overworld'];
    if (tiles) {
      const grass = [tiles.tiles?.grass ?? 0, tiles.tiles?.grass2 ?? tiles.tiles?.grass ?? 0, tiles.tiles?.grass3 ?? tiles.tiles?.grass ?? 0];
      for (let y = 0; y < H; y += 16)
        for (let x = 0; x < W; x += 16) drawFrame(ctx, 'tiles_overworld', grass[((x * 7 + y * 13) / 16) % 3 | 0], x, y);
    }
    for (const [x, y, w, h] of WALLS) {
      rect(ctx, x, y, w, h, '#4b4a5c');
      rect(ctx, x, y, w, 3, '#6f6d84');
    }
    if (trail) for (const [x, y] of dots) rect(ctx, x - 1, y - 1, 2, 2, 'rgba(255,255,255,0.75)');
    const sp = Math.hypot(body.vx, body.vy);
    const anim = (sp > 5 ? 'walk_' : 'idle_') + body.facing;
    const def = SHEETS['hero'];
    if (def) drawFrame(ctx, 'hero', animFrame('hero', anim, body.t), body.x, body.y, { anchored: true, flipH: body.flip });
    else rect(ctx, body.x - 6, body.y - 18, 12, 18, th.u);
    // speed graph, bottom-left
    const gx = 20, gy = H - 20, gw = 90, gh = 26;
    rect(ctx, gx - 2, gy - gh - 2, gw + 4, gh + 4, 'rgba(0,0,0,0.45)');
    const top = Math.max(maxSpeed * Math.SQRT2, 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(gx, gy - (maxSpeed / top) * gh + 0.5);
    ctx.lineTo(gx + gw, gy - (maxSpeed / top) * gh + 0.5);
    ctx.stroke();
    ctx.strokeStyle = '#ffd65a';
    ctx.beginPath();
    speedHist.forEach((s, i) => {
      const px = gx + (i / 180) * gw, py = gy - (s / top) * gh;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.stroke();
    text(ctx, 'speed', gx, gy - gh - 4, '#ffffff');
  };

  const code = useMemo(
    () =>
      mode === 'basic'
        ? `extends CharacterBody2D

@export var max_speed := ${maxSpeed.toFixed(1)}

func _physics_process(delta: float) -> void:
	var input := ${normalize ? 'Input.get_vector("move_left", "move_right", "move_up", "move_down")' : 'Vector2(Input.get_axis("move_left", "move_right"), Input.get_axis("move_up", "move_down"))  # not normalized!'}
	velocity = input * max_speed
	move_and_slide()
`
        : `extends CharacterBody2D

@export var max_speed := ${maxSpeed.toFixed(1)}
@export var acceleration := ${accel.toFixed(1)}
@export var friction := ${friction.toFixed(1)}

func _physics_process(delta: float) -> void:
	var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	var rate := acceleration if input != Vector2.ZERO else friction
	velocity = velocity.move_toward(input * max_speed, rate * delta)
	move_and_slide()
`,
    [mode, maxSpeed, accel, friction, normalize],
  );

  const tReach = maxSpeed / accel, dReach = (maxSpeed * maxSpeed) / (2 * accel);
  const tStop = maxSpeed / friction, dStop = (maxSpeed * maxSpeed) / (2 * friction);
  return (
    <FigureLayout
      side={
        <>
          <Slider label="max_speed" value={maxSpeed} min={30} max={200} step={1} onChange={setMaxSpeed} fmt={(v) => v.toFixed(0)} />
          {mode === 'accel' && (
            <>
              <Slider label="acceleration" value={accel} min={100} max={4000} step={10} onChange={setAccel} fmt={(v) => v.toFixed(0)} />
              <Slider label="friction" value={friction} min={100} max={4000} step={10} onChange={setFriction} fmt={(v) => v.toFixed(0)} />
            </>
          )}
          {mode === 'basic' && <Toggle label="normalize diagonal input" value={normalize} onChange={setNormalize} />}
          <Toggle label="footstep trail (every 0.1 s)" value={trail} onChange={setTrail} />
          <Readout
            rows={[
              ['|\\mathbf{v}|', `${readout.speed.toFixed(1)} px/s`],
              ['\\mathbf{v}', `(${readout.vx.toFixed(0)}, ${readout.vy.toFixed(0)})`],
              ...(mode === 'accel'
                ? ([
                    ['t_{\\text{top}} = v_{\\max}/a', `${(tReach * 1000).toFixed(0)} ms, ${dReach.toFixed(1)} px`],
                    ['t_{\\text{stop}} = v_{\\max}/f', `${(tStop * 1000).toFixed(0)} ms, ${dStop.toFixed(1)} px`],
                  ] as [string, string][])
                : []),
            ]}
          />
        </>
      }
      below={<CodeBlock code={code} file="scripts/player.gd" compact />}
    >
      <GameCanvas
        width={W}
        height={H}
        update={update}
        draw={draw}
        touchButtons={['up', 'down', 'left', 'right']}
        keysHint={<Keys items={[['WASD / arrows', 'move']]} />}
        label="top-down movement lab: move the hero with WASD or arrow keys"
      />
    </FigureLayout>
  );
}
