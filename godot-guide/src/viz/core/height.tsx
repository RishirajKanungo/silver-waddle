// core.height: top-down jumping with a fake Z axis. Mirrors the c03 Player additions:
//   gravity = 2h/T², jump velocity = 2h/T, z += v·dt − ½g·dt², z_velocity −= g·dt,
//   the sprite drawn at (x, y − z), the shadow at (x, y − floor_z), and (mode 'levels') elevation
//   zones that set floor_z plus cliff collision that blocks only while z < level × 16.
// Positions are ground footprints; everything (player, plateaus) is drawn shifted up by its height.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, text, rect, playSound, type Input } from '../game';
import { Slider, Toggle, Readout, FigureLayout } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { type Box, moveToward2, feetHit, inBox, drawChar, drawGrass, drawWall, drawShadow } from './motionkit';

const W = 320, H = 180, LEVEL_HEIGHT = 16, MAX = 90, ACCEL = 1200, FRICTION = 1600;
const BORDER: Box[] = [
  [0, 0, W, 8],
  [0, H - 8, W, 8],
  [0, 0, 8, H],
  [W - 8, 0, 8, H],
];
interface Plateau {
  box: Box;
  level: number;
}
// footprints on the ground plane; P2 sits on top of P1; P3 is across a 32 px gap from P1
const PLATEAUS: Plateau[] = [
  { box: [40, 72, 160, 80], level: 1 },
  { box: [112, 80, 72, 40], level: 2 },
  { box: [232, 104, 72, 48], level: 1 },
];

export function HeightLab({ spec }: { spec: VizSpec }) {
  const levels = spec.mode === 'levels';
  const [jumpHeight, setJumpHeight] = useState((spec.jumpHeight as number) ?? 20);
  const [timeToPeak, setTimeToPeak] = useState((spec.timeToPeak as number) ?? 0.25);
  const [scaleShadow, setScaleShadow] = useState(true);
  const [showFoot, setShowFoot] = useState(levels);
  const s = useRef({ x: levels ? 120 : 160, y: levels ? 168 : 120, vx: 0, vy: 0, z: 0, zv: 0, floorZ: 0, facing: 'down' as 'down' | 'up' | 'side', flip: false, t: 0, apex: 0, airT: 0, lastAir: 0, lastApex: 0 }).current;
  const hist = useRef<number[]>([]).current;
  const arc = useRef<[number, number][]>([]).current;
  const [ro, setRo] = useState({ z: 0, zv: 0, floorZ: 0, apex: 0, air: 0 });
  const n = useRef(0);

  const gravity = (2 * jumpHeight) / (timeToPeak * timeToPeak);
  const jumpVelocity = (2 * jumpHeight) / timeToPeak;

  const floorHeight = (x: number, y: number) => {
    let level = 0;
    if (levels) for (const p of PLATEAUS) if (inBox(p.box, x, y)) level = Math.max(level, p.level);
    return level * LEVEL_HEIGHT;
  };
  // cliff collision: a plateau's footprint blocks only while z < its top (the mask bit is on)
  const blocking = (p: Plateau) => s.z < p.level * LEVEL_HEIGHT;
  const solid: Box[] = [];
  const hit = (x: number, y: number) => {
    solid.length = 0;
    for (const b of BORDER) solid.push(b);
    if (levels) for (const p of PLATEAUS) if (blocking(p)) solid.push(p.box);
    return feetHit(solid, x, y);
  };

  const update = (dt: number, input: Input) => {
    const [ix, iy] = input.vector();
    moveToward2(s, ix * MAX, iy * MAX, (ix || iy ? ACCEL : FRICTION) * dt);
    s.x += s.vx * dt;
    if (hit(s.x, s.y)) {
      s.x -= s.vx * dt;
      s.vx = 0;
    }
    s.y += s.vy * dt;
    if (hit(s.x, s.y)) {
      s.y -= s.vy * dt;
      s.vy = 0;
    }
    if (ix || iy) {
      if (Math.abs(ix) > Math.abs(iy)) {
        s.facing = 'side';
        s.flip = ix < 0;
      } else s.facing = iy < 0 ? 'up' : 'down';
    }
    // _update_height
    const floorZ = floorHeight(s.x, s.y);
    s.floorZ = floorZ;
    let grounded = s.z <= floorZ && s.zv <= 0;
    if (grounded && input.justPressed('jump')) {
      s.zv = jumpVelocity;
      grounded = false;
      s.airT = 0;
      s.apex = s.z;
      arc.length = 0;
      playSound('sfx_jump', 0.3);
    }
    if (grounded) {
      s.z = floorZ;
      s.zv = 0;
    } else {
      s.z += s.zv * dt - 0.5 * gravity * dt * dt;
      s.zv -= gravity * dt;
      s.airT += dt;
      s.apex = Math.max(s.apex, s.z);
      if (s.z <= floorZ && s.zv < 0) {
        s.z = floorZ;
        s.zv = 0;
        s.lastAir = s.airT;
        s.lastApex = s.apex;
        playSound('sfx_land', 0.3);
      }
      if (n.current % 2 === 0) arc.push([s.x, s.y - s.z]);
      if (arc.length > 60) arc.shift();
    }
    s.t += dt;
    hist.push(s.z);
    if (hist.length > 180) hist.shift();
    if (++n.current % 6 === 0) setRo({ z: s.z, zv: s.zv, floorZ: s.floorZ, apex: s.lastApex, air: s.lastAir });
  };

  const drawPlateau = (ctx: CanvasRenderingContext2D, p: Plateau) => {
    const [x, y, w, h] = p.box;
    const top = y - p.level * LEVEL_HEIGHT;
    const base = p.level - 1; // nested plateaus stand on the level below
    const faceTop = y + h - p.level * LEVEL_HEIGHT, faceH = (p.level - base) * LEVEL_HEIGHT;
    // top surface: lighter grass, brighter for higher levels
    rect(ctx, x, top, w, h, p.level === 2 ? '#8cc25a' : '#74ae4c');
    for (let gy = top + 6; gy < top + h - 2; gy += 9) for (let gx = x + 5 + ((gy / 9) % 2) * 6; gx < x + w - 3; gx += 13) rect(ctx, gx, gy, 2, 1, p.level === 2 ? '#a2d052' : '#8cc25a');
    rect(ctx, x, top, w, 1, '#c8e890');
    // cliff face
    rect(ctx, x, faceTop, w, faceH, '#9c5e3c');
    for (let fy = faceTop + 4; fy < faceTop + faceH; fy += 5) rect(ctx, x, fy, w, 1, '#64392c');
    for (let fx = x + 7; fx < x + w; fx += 11) rect(ctx, fx, faceTop + 1, 1, faceH - 2, '#cf9058');
    rect(ctx, x, faceTop + faceH - 1, w, 1, '#33202a');
    text(ctx, `${p.level * LEVEL_HEIGHT} px`, x + w - 3, faceTop + faceH - 4, '#fbf6e6', 'right');
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    drawGrass(ctx, W, H);
    for (const [x, y, w, h] of BORDER) drawWall(ctx, x, y, w, h);
    const after: Plateau[] = [];
    if (levels)
      for (const p of PLATEAUS) {
        // the player is behind (north of) a plateau whose footprint starts below them
        if (s.y < p.box[1] + 1) after.push(p);
        else drawPlateau(ctx, p);
      }
    if (showFoot && levels)
      for (const p of PLATEAUS) {
        ctx.save();
        ctx.setLineDash([2, 2]);
        rect(ctx, p.box[0], p.box[1], p.box[2], p.box[3], blocking(p) ? '#d84f3c' : 'rgba(255,255,255,0.6)', true);
        ctx.restore();
      }
    for (const [ax, ay] of arc) rect(ctx, ax - 0.5, ay - 12, 1, 1, 'rgba(255,255,255,0.8)');
    const above = s.z - s.floorZ;
    const k = scaleShadow ? 1 - 0.4 * Math.min(1, Math.max(0, above / jumpHeight)) : 1;
    drawShadow(ctx, s.x, s.y - s.floorZ, 6 * k, 2.5 * k, 0.35 * (scaleShadow ? 0.6 + 0.4 * k : 1));
    const sp = Math.hypot(s.vx, s.vy);
    const anim = (s.z > s.floorZ + 0.5 ? 'jump_' + (s.facing === 'side' ? 'side' : 'down') : (sp > 5 ? 'walk_' : 'idle_') + s.facing);
    drawChar(ctx, 'hero', anim, s.t, s.x, s.y - s.z, { flip: s.flip });
    if (showFoot) rect(ctx, s.x - 5, s.y - 6, 10, 6, '#fff09a', true);
    for (const p of after) drawPlateau(ctx, p);
    // z over time, with ledge heights
    const gx = 14, gy = 46, gw = 90, gh = 34;
    rect(ctx, gx - 3, gy - gh - 10, gw + 6, gh + 13, 'rgba(0,0,0,0.5)');
    text(ctx, 'z (px)', gx, gy - gh - 2, '#ffffff');
    const top = Math.max(40, jumpHeight + (levels ? 32 : 0));
    for (const L of levels ? [16, 32] : []) rect(ctx, gx, gy - (L / top) * gh, gw, 1, 'rgba(255,255,255,0.35)');
    rect(ctx, gx, gy, gw, 1, 'rgba(255,255,255,0.5)');
    ctx.strokeStyle = '#ffd65a';
    ctx.beginPath();
    hist.forEach((z, i) => {
      const px = gx + (i / 180) * gw, py = gy - (z / top) * gh;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.stroke();
  };

  const code = useMemo(
    () => `@export var jump_height := ${jumpHeight.toFixed(1)}
@export var time_to_peak := ${timeToPeak.toFixed(2)}

func _update_height(delta: float) -> void:
	var floor_z := ${levels ? '_floor_height()' : '0.0'}
	var gravity := 2.0 * jump_height / (time_to_peak * time_to_peak)  # ${gravity.toFixed(0)} px/s²
	var grounded := z <= floor_z and z_velocity <= 0.0
	if grounded and Input.is_action_just_pressed("jump"):
		z_velocity = 2.0 * jump_height / time_to_peak  # ${jumpVelocity.toFixed(0)} px/s
		grounded = false
	if grounded:
		z = floor_z
		z_velocity = 0.0
	else:
		z += z_velocity * delta - 0.5 * gravity * delta * delta
		z_velocity -= gravity * delta
		if z <= floor_z and z_velocity < 0.0:
			z = floor_z
			z_velocity = 0.0${levels ? '\n\t_update_cliff_mask()' : ''}
	sprite.position.y = SPRITE_Y - z
	shadow.position.y = -floor_z
`,
    [jumpHeight, timeToPeak, levels, gravity, jumpVelocity],
  );

  const reach = MAX * 2 * timeToPeak;
  return (
    <FigureLayout
      side={
        <>
          <Slider label="jump_height" value={jumpHeight} min={8} max={40} step={1} onChange={setJumpHeight} fmt={(v) => v.toFixed(0) + ' px'} />
          <Slider label="time_to_peak" value={timeToPeak} min={0.12} max={0.5} step={0.01} onChange={setTimeToPeak} fmt={(v) => v.toFixed(2) + ' s'} />
          <Toggle label="shadow shrinks with height" value={scaleShadow} onChange={setScaleShadow} />
          {levels && <Toggle label="show footprints (red = blocking)" value={showFoot} onChange={setShowFoot} />}
          <Readout
            rows={[
              ['z', `${ro.z.toFixed(1)} px`],
              ['z_{\\text{velocity}}', `${ro.zv.toFixed(0)} px/s`],
              ...(levels
                ? ([
                    ['\\text{floor\\_z}', `${ro.floorZ.toFixed(0)} px (level ${ro.floorZ / LEVEL_HEIGHT})`],
                    ['\\text{cliff\\_1, cliff\\_2 mask}', `${ro.z < 16 ? 'on' : 'off'}, ${ro.z < 32 ? 'on' : 'off'}`],
                  ] as [string, string][])
                : []),
              ['g = 2h/T^2', `${gravity.toFixed(0)} px/s²`],
              ['v_0 = 2h/T', `${jumpVelocity.toFixed(0)} px/s`],
              ['\\text{air time } 2T', `${(2 * timeToPeak).toFixed(2)} s, ${reach.toFixed(0)} px`],
              ['\\text{last apex, air}', `${ro.apex.toFixed(1)} px, ${ro.air.toFixed(2)} s`],
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
        touchButtons={['up', 'down', 'left', 'right', 'jump']}
        keysHint={<Keys items={[['WASD / arrows', 'move'], ['Space', 'jump']]} />}
        label={levels ? 'height lab: jump between elevation levels with Space' : 'jump lab: jump with Space'}
      />
    </FigureLayout>
  );
}
