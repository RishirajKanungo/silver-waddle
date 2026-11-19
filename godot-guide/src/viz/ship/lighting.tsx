// ship.lighting — 2D lighting and scene transitions in one room.
//  mode 'lighting': a CanvasModulate tints everything (day/night gradient or a dark dungeon), and
//    PointLight2Ds add light on top: final = albedo × (modulate + Σ light.color × energy × falloff),
//    which is what Godot's default "Add" light blend does.
//  mode 'transition': walk into the door. The Transitions autoload covers the screen (fade or the
//    circle-wipe shader, centred on Kai), swaps the room, then uncovers it.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, clear, rect, text, drawFrame, animFrame, SHEETS, playSound, type Input } from '../game';
import { Slider, SegControl, Toggle, Readout, FigureLayout } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { valueNoise, rgbToHex, hexToRgb, mix, clamp01 } from './common';

const W = 320, H = 180;
type Room = 'dungeon' | 'overworld';

// Gradient stops for the day: offset (0..1 of 24 h) and colour
const DAY: [number, string][] = [
  [0.0, '#2e3866'],
  [0.22, '#3a3f78'],
  [0.27, '#e39a7c'],
  [0.33, '#ffffff'],
  [0.7, '#ffffff'],
  [0.78, '#ff9e6b'],
  [0.86, '#3c3f7a'],
  [1.0, '#2e3866'],
];
function sampleGradient(stops: [number, string][], t: number): [number, number, number] {
  for (let i = 1; i < stops.length; i++)
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      const k = (t - t0) / (t1 - t0 || 1);
      const a = hexToRgb(c0), b = hexToRgb(c1);
      return [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)];
    }
  return hexToRgb(stops[stops.length - 1][1]);
}

const TORCHES: [number, number][] = [
  [72, 30],
  [248, 30],
];
const DOOR = { x: 152, y: 16, w: 16, h: 18 };

function drawRoom(ctx: CanvasRenderingContext2D, room: Room, t: number) {
  const sheet = room === 'dungeon' ? 'tiles_dungeon' : 'tiles_overworld';
  const def = SHEETS[sheet];
  clear(ctx, room === 'dungeon' ? '#3d3a4a' : '#5a8f4e');
  if (def) {
    const floor = room === 'dungeon' ? (def.tiles?.floor ?? 0) : (def.tiles?.grass ?? 0);
    const wall = room === 'dungeon' ? (def.tiles?.wall ?? def.tiles?.wall_top ?? 1) : (def.tiles?.cliff ?? def.tiles?.tree ?? def.tiles?.grass ?? 0);
    for (let y = 0; y < H; y += 16)
      for (let x = 0; x < W; x += 16) drawFrame(ctx, sheet, y < 32 ? wall : floor, x, y);
  } else {
    if (room === 'dungeon') rect(ctx, 0, 0, W, 32, '#26232f');
    else rect(ctx, 0, 0, W, 32, '#3f6b38');
  }
  // door
  rect(ctx, DOOR.x, DOOR.y, DOOR.w, DOOR.h, '#14121a');
  rect(ctx, DOOR.x - 2, DOOR.y - 2, DOOR.w + 4, 2, '#8a7a5a');
  if (room === 'dungeon')
    for (const [x, y] of TORCHES) {
      rect(ctx, x - 1, y, 3, 8, '#6b4a2a');
      const f = 2 + Math.round(valueNoise(t * 9, x) * 2);
      rect(ctx, x - 1, y - f, 3, f, '#ffcf5a');
    }
}

export function LightingLab({ spec }: { spec: VizSpec }) {
  const mode = (spec.mode as 'lighting' | 'transition') ?? 'lighting';
  const [room, setRoom] = useState<Room>((spec.room as Room) ?? (mode === 'lighting' ? 'dungeon' : 'overworld'));
  const [hour, setHour] = useState(20);
  const [dayRun, setDayRun] = useState(false);
  const [dark, setDark] = useState(0.22); // dungeon CanvasModulate brightness
  const [energy, setEnergy] = useState(1.0);
  const [texScale, setTexScale] = useState(1.0);
  const [flicker, setFlicker] = useState(0.25);
  const [playerLight, setPlayerLight] = useState(true);
  const [kind, setKind] = useState<'fade' | 'circle'>('circle');
  const [duration, setDuration] = useState(0.4);
  const [ease, setEase] = useState<'linear' | 'sine'>('sine');
  const [scrub, setScrub] = useState(0);

  const hero = useRef({ x: 160, y: 130, vx: 0, vy: 0, facing: 'up' as 'down' | 'up' | 'side', flip: false, t: 0 }).current;
  const clock = useRef(0);
  const tr = useRef({ phase: 'idle' as 'idle' | 'cover' | 'uncover', t: 0, progress: 0, cx: 0.5, cy: 0.5 }).current;
  const roomRef = useRef(room);
  roomRef.current = room;
  const hourRef = useRef(hour);
  hourRef.current = hour;
  const sceneC = useRef<HTMLCanvasElement | null>(null);
  const lightC = useRef<HTMLCanvasElement | null>(null);
  const [live, setLive] = useState({ mod: '#ffffff', torch: 1, progress: 0, radius: 0 });
  const n = useRef(0);

  const easeFn = (k: number) => (ease === 'sine' ? -(Math.cos(Math.PI * k) - 1) / 2 : k);

  const update = (dt: number, input: Input) => {
    clock.current += dt;
    if (mode === 'lighting' && dayRun && room === 'overworld') setHour((h) => (h + dt * 2) % 24); // 12 s per day
    const busy = tr.phase !== 'idle';
    const [ix, iy] = busy ? [0, 0] : input.vector();
    const tx = ix * 90, ty = iy * 90;
    const rate = (ix || iy ? 900 : 1200) * dt;
    const dx = tx - hero.vx, dy = ty - hero.vy, d = Math.hypot(dx, dy);
    if (d <= rate) {
      hero.vx = tx;
      hero.vy = ty;
    } else {
      hero.vx += (dx / d) * rate;
      hero.vy += (dy / d) * rate;
    }
    hero.x = Math.max(20, Math.min(W - 20, hero.x + hero.vx * dt));
    hero.y = Math.max(DOOR.y + DOOR.h + 6, Math.min(H - 8, hero.y + hero.vy * dt));
    if (ix || iy) {
      if (Math.abs(ix) > Math.abs(iy)) {
        hero.facing = 'side';
        hero.flip = ix < 0;
      } else hero.facing = iy < 0 ? 'up' : 'down';
    }
    hero.t += dt;
    // walk into the door (or press F) to change rooms
    const atDoor = Math.abs(hero.x - (DOOR.x + DOOR.w / 2)) < 12 && hero.y <= DOOR.y + DOOR.h + 8;
    if (mode === 'transition' && !busy && (atDoor && iy < 0 || input.justPressed('interact'))) {
      tr.phase = 'cover';
      tr.t = 0;
      tr.cx = hero.x / W;
      tr.cy = (hero.y - 10) / H;
      playSound('sfx_menu_select', 0.3);
    }
    if (tr.phase !== 'idle') {
      tr.t += dt;
      const k = Math.min(1, tr.t / duration);
      tr.progress = tr.phase === 'cover' ? easeFn(k) : 1 - easeFn(k);
      if (k >= 1) {
        if (tr.phase === 'cover') {
          // change_scene_to_file(): swap the room while the screen is covered
          setRoom((r) => (r === 'dungeon' ? 'overworld' : 'dungeon'));
          hero.y = H - 20;
          hero.vx = hero.vy = 0;
          tr.phase = 'uncover';
          tr.t = 0;
          tr.cx = hero.x / W;
          tr.cy = (hero.y - 10) / H;
        } else {
          tr.phase = 'idle';
          tr.progress = 0;
        }
      }
    }
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const t = clock.current;
    const rm = roomRef.current;
    sceneC.current ??= Object.assign(document.createElement('canvas'), { width: W, height: H });
    lightC.current ??= Object.assign(document.createElement('canvas'), { width: W, height: H });
    const sc = sceneC.current.getContext('2d')!;
    sc.imageSmoothingEnabled = false;
    drawRoom(sc, rm, t);
    const sp = Math.hypot(hero.vx, hero.vy);
    const anim = (sp > 5 ? 'walk_' : 'idle_') + hero.facing;
    if (SHEETS['hero']) drawFrame(sc, 'hero', animFrame('hero', anim, hero.t), hero.x, hero.y, { anchored: true, flipH: hero.flip });
    else rect(sc, hero.x - 6, hero.y - 18, 12, 18, '#3b6fd1');

    // modulate colour: dungeon = constant dark blue-grey, overworld = gradient by hour
    const mod: [number, number, number] = rm === 'dungeon' ? [dark * 0.8, dark * 0.85, dark * 1.15] : sampleGradient(DAY, (mode === 'transition' ? 12 : hourRef.current) / 24);
    const lc = lightC.current.getContext('2d')!;
    lc.globalCompositeOperation = 'source-over';
    lc.fillStyle = rgbToHex(...mod);
    lc.fillRect(0, 0, W, H);
    lc.globalCompositeOperation = 'lighter';
    const light = (x: number, y: number, radius: number, col: [number, number, number], e: number) => {
      const g = lc.createRadialGradient(x, y, 0, x, y, radius);
      const c = (k: number) => `rgba(${Math.round(clamp01(col[0] * e * k) * 255)},${Math.round(clamp01(col[1] * e * k) * 255)},${Math.round(clamp01(col[2] * e * k) * 255)},1)`;
      g.addColorStop(0, c(1));
      g.addColorStop(0.5, c(0.45));
      g.addColorStop(1, c(0));
      lc.fillStyle = g;
      lc.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };
    let torchE = energy;
    if (mode === 'lighting') {
      const R = 64 * texScale; // a 128×128 GradientTexture2D has radius 64 px at texture_scale 1
      if (rm === 'dungeon')
        TORCHES.forEach(([x, y], i) => {
          // energy = base_energy + flicker × noise.get_noise_1d(time × 8)
          const e = energy + flicker * (valueNoise(t * 8, i * 31) * 2 - 1);
          if (i === 0) torchE = e;
          light(x, y + 2, R, [1, 0.72, 0.4], e);
        });
      if (playerLight) light(hero.x, hero.y - 10, R * 0.8, [0.85, 0.9, 1], energy * 0.8);
    } else if (rm === 'dungeon') TORCHES.forEach(([x, y]) => light(x, y + 2, 64, [1, 0.72, 0.4], 1));
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(sceneC.current, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(lightC.current, 0, 0);
    ctx.globalCompositeOperation = 'source-over';

    // transition overlay (the ColorRect on the Transitions CanvasLayer)
    const prog = tr.phase !== 'idle' ? tr.progress : mode === 'transition' ? scrub : 0;
    const aspect = W / H;
    const maxR = Math.hypot(aspect, 1);
    const radius = (1 - prog) * maxR;
    if (prog > 0) {
      if (kind === 'fade') {
        ctx.fillStyle = `rgba(0,0,0,${prog})`;
        ctx.fillRect(0, 0, W, H);
      } else {
        // per-pixel version of the circle_wipe shader: alpha = step(radius, length(d))
        const cx = tr.phase !== 'idle' ? tr.cx : hero.x / W, cy = tr.phase !== 'idle' ? tr.cy : (hero.y - 10) / H;
        ctx.fillStyle = '#000';
        for (let y = 0; y < H; y++) {
          const v = (y + 0.5) / H;
          const dy = v - cy;
          const inner = radius * radius - dy * dy;
          if (inner <= 0) {
            ctx.fillRect(0, y, W, 1);
            continue;
          }
          const half = Math.sqrt(inner) / aspect; // in UV.x
          const x0 = Math.max(0, Math.round((cx - half) * W)), x1 = Math.min(W, Math.round((cx + half) * W));
          if (x0 > 0) ctx.fillRect(0, y, x0, 1);
          if (x1 < W) ctx.fillRect(x1, y, W - x1, 1);
        }
      }
    }
    if (mode === 'transition') text(ctx, rm === 'dungeon' ? 'dungeon' : 'field', 6, H - 6, '#ffffff');
    if (++n.current % 6 === 0) setLive({ mod: rgbToHex(...mod), torch: torchE, progress: prog, radius: radius * H });
  };

  const codeLight = useMemo(
    () => `extends PointLight2D
## Torch flicker: energy wanders around base_energy, driven by smooth noise.

@export var base_energy := ${energy.toFixed(2)}
@export var flicker := ${flicker.toFixed(2)}
@export var speed := 8.0

var _noise := FastNoiseLite.new()
var _time := 0.0


func _ready() -> void:
	texture_scale = ${texScale.toFixed(2)}
	_noise.seed = randi()
	_noise.frequency = 1.0  # one noise "feature" per unit of input


func _process(delta: float) -> void:
	_time += delta
	# get_noise_1d returns roughly -1..1, so energy stays within base ± flicker
	energy = base_energy + flicker * _noise.get_noise_1d(_time * speed)
`,
    [energy, flicker, texScale],
  );
  const codeWipe = `shader_type canvas_item;

uniform float progress : hint_range(0.0, 1.0) = ${(tr.phase !== 'idle' ? live.progress : scrub).toFixed(2)}; // 0 = clear, 1 = covered
uniform vec2 center = vec2(0.5, 0.5); // in UV: 0..1 across the screen
uniform float aspect = ${(W / H).toFixed(4)}; // width / height, so the circle is round

void fragment() {
	// distance from the centre, measured in screen heights
	vec2 d = (UV - center) * vec2(aspect, 1.0);
	// the farthest corner is never further than this from any centre on screen
	float max_radius = length(vec2(aspect, 1.0));
	float radius = (1.0 - progress) * max_radius;
	COLOR = vec4(0.0, 0.0, 0.0, step(radius, length(d)));
}
`;

  return (
    <FigureLayout
      side={
        mode === 'lighting' ? (
          <>
            <SegControl label="room" value={room} options={[{ v: 'dungeon', label: 'dungeon' }, { v: 'overworld', label: 'field' }]} onChange={setRoom} />
            {room === 'overworld' ? (
              <>
                <Slider label="time of day" value={hour} min={0} max={23.9} step={0.1} onChange={setHour} fmt={(v) => `${Math.floor(v)}:${String(Math.floor((v % 1) * 60)).padStart(2, '0')}`} />
                <Toggle label="run the clock (12 s per day)" value={dayRun} onChange={setDayRun} />
              </>
            ) : (
              <Slider label="modulate" value={dark} min={0.05} max={1} step={0.01} onChange={setDark} />
            )}
            <Slider label="energy" value={energy} min={0} max={2} step={0.05} onChange={setEnergy} />
            <Slider label="texture_scale" value={texScale} min={0.25} max={2.5} step={0.05} onChange={setTexScale} />
            {room === 'dungeon' && <Slider label="flicker" value={flicker} min={0} max={0.8} step={0.01} onChange={setFlicker} />}
            <Toggle label="light on Kai" value={playerLight} onChange={setPlayerLight} />
            <Readout
              rows={[
                ['\\text{CanvasModulate.color}', live.mod],
                ...(room === 'dungeon' ? ([['\\text{torch energy}', live.torch.toFixed(2)]] as [string, string][]) : []),
                ['\\text{light radius}', `${(64 * texScale).toFixed(0)} px`],
              ]}
            />
          </>
        ) : (
          <>
            <SegControl label="effect" value={kind} options={[{ v: 'circle', label: 'circle wipe' }, { v: 'fade', label: 'fade' }]} onChange={setKind} />
            <Slider label="duration" value={duration} min={0.1} max={1.5} step={0.05} onChange={setDuration} fmt={(v) => v.toFixed(2) + ' s'} />
            <SegControl label="trans" value={ease} options={[{ v: 'linear', label: 'LINEAR' }, { v: 'sine', label: 'SINE in-out' }]} onChange={setEase} />
            <Slider label="progress (scrub)" value={scrub} min={0} max={1} step={0.01} onChange={setScrub} />
            <Readout
              rows={[
                ['\\text{progress}', live.progress.toFixed(2)],
                ['\\text{radius}', kind === 'circle' ? `${live.radius.toFixed(0)} px` : 'n/a'],
                ['\\text{cover + uncover}', `${(2 * duration).toFixed(2)} s = ${Math.round(2 * duration * 60)} frames`],
              ]}
            />
          </>
        )
      }
      below={mode === 'lighting' ? <CodeBlock code={codeLight} file="scripts/torch_light.gd" compact /> : <CodeBlock code={codeWipe} file="assets/shaders/circle_wipe.gdshader" lang="shader" compact />}
    >
      <GameCanvas
        width={W}
        height={H}
        update={update}
        draw={draw}
        touchButtons={['up', 'down', 'left', 'right', 'interact']}
        keysHint={<Keys items={mode === 'lighting' ? [['WASD / arrows', 'move']] : [['WASD / arrows', 'move'], ['walk into the door / F', 'change room']]} />}
        label={mode === 'lighting' ? 'lighting lab: a room lit by CanvasModulate and PointLight2D' : 'transition lab: walk into the door to change rooms'}
      />
    </FigureLayout>
  );
}
