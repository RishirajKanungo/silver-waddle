// math.shake: trauma-based screen shake. Mirrors shake_camera.gd:
//   trauma = max(trauma - decay * delta, 0);  shake = pow(trauma, exponent)
//   offset = max_offset * shake * noise(time * noise_speed)      (or a fresh random number every frame)
// J adds a small hit (0.3), K a big one (0.6). The strip chart shows trauma and the x offset.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, text, drawFrame, animFrame, playSound, SHEETS, type Input } from '../game';
import { Slider, SegControl, Readout, FigureLayout, LinePlot, Btn } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { grass, f, gf } from './common';

const W = 320, H = 180;
type Kind = 'noise' | 'random';

/** 1D gradient (Perlin) noise in about [-1, 1]: random slopes at integers, smoothly blended. */
function grad(i: number, seed: number) {
  let h = (i * 374761393 + seed * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h & 0xffff) / 0xffff) * 2 - 1;
}
export function perlin1(x: number, seed = 0) {
  const i = Math.floor(x), fr = x - i;
  const a = grad(i, seed) * fr, b = grad(i + 1, seed) * (fr - 1);
  const u = fr * fr * fr * (fr * (fr * 6 - 15) + 10);
  return 2 * (a + (b - a) * u);
}

export function ShakeLab({ spec }: { spec: VizSpec }) {
  const [kind, setKind] = useState<Kind>((spec.kind as Kind) ?? 'noise');
  const [maxOff, setMaxOff] = useState(8);
  const [decay, setDecay] = useState(1.5);
  const [expo, setExpo] = useState(2);
  const [speed, setSpeed] = useState(20);
  const p = useRef({ kind, maxOff, decay, expo, speed });
  p.current = { kind, maxOff, decay, expo, speed };
  const s = useRef({ trauma: 0, time: 0, off: [0, 0], hist: [] as [number, number, number][], n: 0, pending: 0, slam: -1 }).current;
  const [hist, setHist] = useState<[number, number, number][]>([]);

  const add = (amount: number) => {
    s.trauma = Math.min(1, s.trauma + amount);
    playSound(amount > 0.4 ? 'sfx_explosion' : 'sfx_hit', 0.3);
    if (amount > 0.4) s.slam = 0;
  };

  const update = (dt: number, input: Input) => {
    if (input.justPressed('attack')) add(0.3);
    if (input.justPressed('dash')) add(0.6);
    if (s.pending) {
      add(s.pending);
      s.pending = 0;
    }
    const { kind, maxOff, decay, expo, speed } = p.current;
    s.time += dt;
    s.trauma = Math.max(0, s.trauma - decay * dt);
    const shake = Math.pow(s.trauma, expo);
    const t = s.time * speed;
    s.off = kind === 'noise' ? [maxOff * shake * perlin1(t, 1), maxOff * shake * perlin1(t, 7)] : [maxOff * shake * (Math.random() * 2 - 1), maxOff * shake * (Math.random() * 2 - 1)];
    if (s.slam >= 0) s.slam += dt;
    if (s.slam > 0.6) s.slam = -1;
    s.hist.push([s.time, s.trauma, s.off[0]]);
    if (s.hist.length > 180) s.hist.shift();
    if (++s.n % 6 === 0) setHist([...s.hist]);
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const ox = Math.round(s.off[0]), oy = Math.round(s.off[1]);
    ctx.save();
    // the camera moves by +offset, so the world is drawn shifted the other way
    ctx.translate(-ox, -oy);
    grass(ctx, drawFrame, W + 32, H + 32, 16, 16);
    const t = SHEETS['tiles_overworld']?.tiles;
    if (t) {
      for (const [x, y] of [[48, 32], [256, 40], [224, 128]] as [number, number][]) {
        drawFrame(ctx, 'tiles_overworld', t.tree_tl ?? 0, x, y);
        drawFrame(ctx, 'tiles_overworld', t.tree_tr ?? 0, x + 16, y);
        drawFrame(ctx, 'tiles_overworld', t.tree_bl ?? 0, x, y + 16);
        drawFrame(ctx, 'tiles_overworld', t.tree_br ?? 0, x + 16, y + 16);
      }
      drawFrame(ctx, 'tiles_overworld', t.rock ?? 0, 96, 140);
      drawFrame(ctx, 'tiles_overworld', t.bush ?? 0, 160, 30);
    }
    drawFrame(ctx, 'golem', animFrame('golem', s.slam >= 0 ? 'slam' : 'idle', s.slam >= 0 ? s.slam : s.time), 200, 104, { anchored: true, flipH: true });
    drawFrame(ctx, 'hero', animFrame('hero', 'idle_side', s.time), 120, 112, { anchored: true });
    ctx.restore();
    // HUD stays fixed to the screen (a CanvasLayer in Godot)
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(2, 2, 104, 24);
    ctx.fillStyle = '#ffd65a';
    ctx.fillRect(4, 14, 100 * s.trauma, 4);
    text(ctx, `trauma ${s.trauma.toFixed(2)}`, 4, 11, '#ffffff');
    ctx.fillStyle = '#ff6b5a';
    ctx.fillRect(4, 20, 100 * Math.pow(s.trauma, p.current.expo), 4);
  };

  const code = useMemo(
    () => `extends Camera2D

@export var max_offset := Vector2(${gf(maxOff, 1)}, ${gf(maxOff * 0.75, 1)})  ## pixels at full trauma
@export var decay := ${gf(decay, 2)}        ## trauma lost per second
@export var noise_speed := ${gf(speed, 1)}  ## how fast we travel through the noise

var trauma := 0.0
var _time := 0.0
var _noise := FastNoiseLite.new()


func _ready() -> void:
	_noise.noise_type = FastNoiseLite.TYPE_PERLIN
	_noise.frequency = 1.0


func add_trauma(amount: float) -> void:
	trauma = minf(trauma + amount, 1.0)


func _process(delta: float) -> void:
	_time += delta
	trauma = maxf(trauma - decay * delta, 0.0)
	var shake := ${expo === 1 ? 'trauma' : expo === 2 ? 'trauma * trauma' : 'trauma * trauma * trauma'}
	var t := _time * noise_speed
	offset = Vector2(
		max_offset.x * shake * ${kind === 'noise' ? '_noise.get_noise_2d(t, 0.0)' : 'randf_range(-1.0, 1.0)'},
		max_offset.y * shake * ${kind === 'noise' ? '_noise.get_noise_2d(t, 100.0)' : 'randf_range(-1.0, 1.0)'}
	)
`,
    [maxOff, decay, speed, expo, kind],
  );
  const t0 = hist.length ? hist[0][0] : 0;
  return (
    <FigureLayout
      side={
        <>
          <SegControl
            label="source"
            value={kind}
            onChange={setKind}
            options={[
              { v: 'noise', label: 'noise' },
              { v: 'random', label: 'random' },
            ]}
          />
          <Slider label="max_offset" value={maxOff} min={1} max={16} step={1} onChange={setMaxOff} fmt={(v) => v.toFixed(0)} />
          <Slider label="decay /s" value={decay} min={0.5} max={4} step={0.1} onChange={setDecay} fmt={(v) => v.toFixed(1)} />
          <SegControl
            label="shake ="
            value={expo}
            onChange={setExpo}
            options={[
              { v: 1, label: 'trauma' },
              { v: 2, label: 'trauma²' },
              { v: 3, label: 'trauma³' },
            ]}
          />
          {kind === 'noise' && <Slider label="noise_speed" value={speed} min={2} max={60} step={1} onChange={setSpeed} fmt={(v) => v.toFixed(0)} />}
          <div className="math-row">
            <Btn onClick={() => (s.pending = 0.3)}>Small hit +0.3</Btn>
            <Btn onClick={() => (s.pending = 0.6)}>Golem slam +0.6</Btn>
          </div>
          <Readout
            rows={[
              ['\\text{trauma}', f(hist.at(-1)?.[1] ?? 0)],
              ['\\text{shake} = \\text{trauma}^{' + expo + '}', f(Math.pow(hist.at(-1)?.[1] ?? 0, expo), 3)],
              ['\\text{full trauma lasts}', `${f(1 / decay, 2)} s`],
            ]}
          />
        </>
      }
      below={
        <div className="math-stack">
          <LinePlot
            series={[
              { pts: hist.map(([t, tr]) => [t - t0, tr * maxOff] as [number, number]), color: 'var(--warn)', label: 'trauma × max_offset', width: 1.5 },
              { pts: hist.map(([t, , o]) => [t - t0, o] as [number, number]), color: 'var(--c-u)', label: 'offset.x (px)', width: 1.5 },
            ]}
            x={[0, 3]}
            y={[-16, 16]}
            xlabel="last 3 seconds"
            ylabel="px"
            legend="tr"
            height={180}
          />
          <CodeBlock code={code} file="scripts/math/shake_camera.gd" compact />
        </div>
      }
    >
      <GameCanvas width={W} height={H} update={update} draw={draw} touchButtons={['attack', 'dash']} keysHint={<Keys items={[['J', 'small hit'], ['K', 'golem slam']]} />} label="screen shake: press J for a small hit and K for a big one" />
    </FigureLayout>
  );
}
