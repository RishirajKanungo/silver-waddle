// math.collisionTunnel: a projectile moving in discrete physics steps against a thin wall.
// Discrete mode mirrors "move, then test for overlap" (what an Area2D bullet does); swept mode mirrors
// "cast a ray from the old position to the new one" (intersect_ray each physics frame).
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, clear, rect, text, line, drawFrame, animFrame, SHEETS, playSound, type Input } from '../game';
import { Slider, Toggle, Readout, FigureLayout, SegControl } from '../kit';
import { CodeBlock } from '../../ui/GameCells';

const W = 320, H = 180;
const WALL_X = 200;
const SIZE = 4; // bullet collision box, px
const LANE = 96;

interface Shot {
  x: number;
  alive: boolean;
  samples: number[]; // x at every physics step
  result: '' | 'hit' | 'through';
  hitX: number;
}

export function TunnelLab({ spec }: { spec: VizSpec }) {
  const [speed, setSpeed] = useState((spec.speed as number) ?? 900);
  const [wall, setWall] = useState((spec.wall as number) ?? 6);
  const [mode, setMode] = useState<'discrete' | 'swept'>((spec.mode as 'discrete' | 'swept') ?? 'discrete');
  const [auto, setAuto] = useState(true);
  const [slow, setSlow] = useState(false);
  const shots = useRef<Shot[]>([]).current;
  const last = useRef<Shot | null>(null);
  const stats = useRef({ fired: 0, hit: 0 });
  const timer = useRef(0);
  const flash = useRef(0);
  const t = useRef(0);
  const frames = useRef(0);
  const [readout, setReadout] = useState({ fired: 0, hit: 0 });
  const seed = useRef(12345);
  const rand = () => {
    // small LCG so the phase of each shot differs but the figure is reproducible
    seed.current = (seed.current * 1103515245 + 12345) & 0x7fffffff;
    return seed.current / 0x7fffffff;
  };
  const step = speed / 60;

  const fire = () => {
    // the bullet starts at a random point within one step, as real shots do relative to a wall
    const s: Shot = { x: 30 + rand() * step, alive: true, samples: [], result: '', hitX: 0 };
    s.samples.push(s.x);
    shots.push(s);
    last.current = s;
    stats.current.fired++;
    if (shots.length > 8) shots.shift();
  };

  const update = (dt: number, input: Input) => {
    t.current += dt;
    if (input.justPressed('attack')) {
      fire();
      playSound('sfx_fire', 0.3);
    }
    if (auto) {
      timer.current += dt;
      if (timer.current > 0.6) {
        timer.current = 0;
        fire();
      }
    }
    if (flash.current > 0) flash.current -= dt;
    for (const s of shots) {
      if (!s.alive) continue;
      const from = s.x;
      const to = from + speed * dt;
      if (mode === 'swept') {
        // ray from the old position to the new one, against the wall's near face (bullet's leading edge)
        const lead0 = from + SIZE / 2, lead1 = to + SIZE / 2;
        if (lead0 <= WALL_X + wall && lead1 >= WALL_X) {
          s.x = Math.max(from, WALL_X - SIZE / 2);
          s.alive = false;
          s.result = 'hit';
          s.hitX = s.x;
        } else s.x = to;
      } else {
        s.x = to;
        // overlap test at the new position only
        const overlaps = s.x + SIZE / 2 > WALL_X && s.x - SIZE / 2 < WALL_X + wall;
        if (overlaps) {
          s.alive = false;
          s.result = 'hit';
          s.hitX = s.x;
        }
      }
      s.samples.push(s.x);
      if (s.result === 'hit') {
        stats.current.hit++;
        flash.current = 0.12;
      }
      if (s.alive && s.x > W + 10) {
        s.alive = false;
        s.result = 'through';
      }
    }
    if (++frames.current % 6 === 0) setReadout({ ...stats.current });
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    clear(ctx, '#20202c');
    // floor tiles
    for (let x = 0; x < W; x += 16) rect(ctx, x, LANE + 22, 15, 1, '#2f2f40');
    // wall
    rect(ctx, WALL_X, 30, wall, 110, flash.current > 0 ? '#f0e2b6' : '#8a86a6');
    rect(ctx, WALL_X, 30, wall, 3, '#c0bed4');
    text(ctx, `wall ${wall}px`, WALL_X + wall / 2, 24, '#c0bed4', 'center');
    // shooter
    if (SHEETS['mage']) drawFrame(ctx, 'mage', animFrame('mage', 'cast', t.current), 18, LANE + 14, { anchored: true });
    else rect(ctx, 10, LANE - 10, 12, 20, '#7044a8');
    // samples of the most recent shot: one box per physics step
    const s = last.current;
    if (s) {
      for (let i = 0; i < s.samples.length; i++) {
        const x = s.samples[i];
        if (x > W + 8) break;
        rect(ctx, x - SIZE / 2, LANE - SIZE / 2, SIZE, SIZE, 'rgba(255,214,90,0.9)', true);
        if (mode === 'swept' && i > 0) line(ctx, s.samples[i - 1], LANE + 0.5, x, LANE + 0.5, 'rgba(120,200,255,0.8)');
        text(ctx, String(i), x, LANE + 12, '#9a96b0', 'center');
      }
    }
    // live bullets
    for (const b of shots) {
      if (!b.alive) continue;
      if (SHEETS['fx_fireball']) drawFrame(ctx, 'fx_fireball', animFrame('fx_fireball', 'play', t.current), b.x - SHEETS['fx_fireball'].frameW / 2, LANE - SHEETS['fx_fireball'].frameH / 2);
      rect(ctx, b.x - SIZE / 2, LANE - SIZE / 2, SIZE, SIZE, '#ffd65a');
    }
    if (s && s.result) text(ctx, s.result === 'hit' ? 'HIT' : 'PASSED THROUGH', 8, 14, s.result === 'hit' ? '#a2d052' : '#f8925e');
    text(ctx, `step ${step.toFixed(1)}px/frame`, W - 8, 14, '#ffffff', 'right');
  };

  const gap = wall + SIZE;
  const expected = mode === 'swept' ? 1 : Math.min(1, gap / step);
  const code = useMemo(
    () =>
      mode === 'discrete'
        ? `extends Area2D
## Moves, then lets the physics engine test for overlap at the new position.

@export var speed := ${speed.toFixed(1)}  # ${step.toFixed(1)} px per physics frame


func _ready() -> void:
	body_entered.connect(_on_body_entered)


func _physics_process(delta: float) -> void:
	position.x += speed * delta


func _on_body_entered(_body: Node2D) -> void:
	queue_free()  # only fires if a sample lands inside the wall`
        : `extends Node2D
## Sweeps: casts a ray along this frame's motion before moving.

@export var speed := ${speed.toFixed(1)}  # ${step.toFixed(1)} px per physics frame
@export_flags_2d_physics var hit_mask := 1  # world


func _physics_process(delta: float) -> void:
	var from := global_position
	var to := from + Vector2.RIGHT * speed * delta
	var query := PhysicsRayQueryParameters2D.create(from, to, hit_mask)
	var hit := get_world_2d().direct_space_state.intersect_ray(query)
	if hit.is_empty():
		global_position = to
	else:
		global_position = hit.position
		queue_free()`,
    [mode, speed, step],
  );

  return (
    <FigureLayout
      side={
        <>
          <SegControl value={mode} onChange={setMode} options={[{ v: 'discrete', label: 'overlap test' }, { v: 'swept', label: 'swept ray' }]} />
          <Slider label="speed px/s" value={speed} min={60} max={1800} step={10} onChange={setSpeed} fmt={(v) => v.toFixed(0)} />
          <Slider label="wall px" value={wall} min={2} max={24} step={1} onChange={setWall} fmt={(v) => v.toFixed(0)} />
          <Toggle label="auto-fire" value={auto} onChange={setAuto} />
          <Toggle label="slow motion (×0.2)" value={slow} onChange={setSlow} />
          <Readout
            rows={[
              ['\\text{step} = v / 60', `${step.toFixed(1)} px`],
              ['\\text{wall} + \\text{bullet}', `${gap} px`],
              ['P(\\text{hit}) \\text{ expected}', `${(expected * 100).toFixed(0)}%`],
              ['\\text{hits / shots}', `${readout.hit} / ${readout.fired}${readout.fired ? ` (${((readout.hit / readout.fired) * 100).toFixed(0)}%)` : ''}`],
            ]}
          />
          <button onClick={() => { stats.current = { fired: 0, hit: 0 }; setReadout({ fired: 0, hit: 0 }); }}>Reset count</button>
        </>
      }
      below={<CodeBlock code={code} file="scripts/projectile.gd" compact />}
    >
      <GameCanvas
        width={W}
        height={H}
        update={update}
        draw={draw}
        timeScale={slow ? 0.2 : 1}
        touchButtons={['attack']}
        keysHint={<Keys items={[['J / Z', 'fire one shot']]} />}
        label="tunnelling lab: a fast projectile and a thin wall"
      />
    </FigureLayout>
  );
}
