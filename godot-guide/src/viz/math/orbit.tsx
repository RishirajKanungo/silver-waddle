// math.orbit: sin and cos for orbits and bobbing. Mirrors orbiting_shards.gd:
//   angle = TAU * (turns_per_second * time + i / count)
//   position = Vector2(cos(angle) * radius, sin(angle) * radius * squash - bob)
// Shards on the near half of the circle (sin > 0) draw in front of Kai, the far half behind.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, drawFrame, animFrame, type Input } from '../game';
import { Slider, Readout, FigureLayout } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { grass, f, gf, clamp, type V } from './common';

const W = 320, H = 180;
const GEMS = ['#ff6b5a', '#6fb8ff', '#7dff9a', '#ffd65a', '#c79bff', '#ffffff'];

function gem(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  const X = Math.round(x), Y = Math.round(y);
  ctx.fillStyle = '#1a1424';
  ctx.fillRect(X - 1, Y - 4, 3, 9);
  ctx.fillRect(X - 3, Y - 2, 7, 5);
  ctx.fillStyle = color;
  ctx.fillRect(X, Y - 3, 1, 7);
  ctx.fillRect(X - 2, Y - 1, 5, 3);
  ctx.fillRect(X - 1, Y - 2, 3, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(X - 1, Y - 2, 1, 1);
}

export function OrbitLab({ spec }: { spec: VizSpec }) {
  const [count, setCount] = useState((spec.count as number) ?? 3);
  const [radius, setRadius] = useState(18);
  const [turns, setTurns] = useState(0.5);
  const [squash, setSquash] = useState(0.5);
  const [bobH, setBobH] = useState(2);
  const [bobF, setBobF] = useState(1.5);
  const p = useRef({ count, radius, turns, squash, bobH, bobF });
  p.current = { count, radius, turns, squash, bobH, bobF };
  const s = useRef({ kai: [130, 110] as V, face: 'down', flip: false, moving: false, time: 0, n: 0 }).current;
  const [ang, setAng] = useState(0);

  const update = (dt: number, input: Input) => {
    const [ix, iy] = input.vector();
    s.moving = ix !== 0 || iy !== 0;
    s.kai = [clamp(s.kai[0] + ix * 70 * dt, 30, W - 30), clamp(s.kai[1] + iy * 70 * dt, 40, H - 20)];
    if (s.moving) {
      if (Math.abs(ix) > Math.abs(iy)) {
        s.face = 'side';
        s.flip = ix < 0;
      } else s.face = iy < 0 ? 'up' : 'down';
    }
    s.time += dt;
    if (++s.n % 6 === 0) setAng(((p.current.turns * s.time) % 1) * 360);
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const { count, radius, turns, squash, bobH, bobF } = p.current;
    grass(ctx, drawFrame);
    // a pickup bobbing on the spot, with a shadow that shrinks as it rises
    const bob = (Math.sin(2 * Math.PI * bobF * s.time) * 0.5 + 0.5) * bobH * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    const sw = 6 - bob * 0.4;
    ctx.fillRect(Math.round(250 - sw / 2), 120, Math.round(sw), 2);
    gem(ctx, 250, 112 - bob, GEMS[3]);
    // the orbit, centred on Kai's chest
    const cx = s.kai[0], cy = s.kai[1] - 12;
    const shards: { x: number; y: number; front: boolean; c: string }[] = [];
    for (let i = 0; i < count; i++) {
      const a = 2 * Math.PI * (turns * s.time + i / count);
      const b = Math.sin(2 * Math.PI * bobF * s.time + i) * bobH;
      shards.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius * squash - b, front: Math.sin(a) > 0, c: GEMS[i % GEMS.length] });
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius, Math.max(0.5, radius * squash), 0, 0, Math.PI * 2);
    ctx.stroke();
    for (const sh of shards) if (!sh.front) gem(ctx, sh.x, sh.y, sh.c);
    drawFrame(ctx, 'hero', animFrame('hero', (s.moving ? 'walk_' : 'idle_') + s.face, s.time), s.kai[0], s.kai[1], { anchored: true, flipH: s.flip });
    for (const sh of shards) if (sh.front) gem(ctx, sh.x, sh.y, sh.c);
  };

  const code = useMemo(
    () => `extends Node2D
## Orbits every child Node2D around this node, like shards circling Kai.

@export var radius := ${gf(radius)}
@export var squash := ${gf(squash, 2)}            ## y radius / x radius: a ground circle seen from above
@export var turns_per_second := ${gf(turns, 2)}
@export var bob_height := ${gf(bobH)}
@export var bob_frequency := ${gf(bobF, 2)}       ## Hz

var _time := 0.0


func _process(delta: float) -> void:
	_time += delta
	var count := get_child_count()
	for i in count:
		var shard := get_child(i) as Node2D
		var angle := TAU * (turns_per_second * _time + float(i) / count)
		var bob := sin(TAU * bob_frequency * _time + i) * bob_height
		shard.position = Vector2(cos(angle) * radius, sin(angle) * radius * squash - bob)
		shard.z_index = 1 if sin(angle) > 0.0 else -1  # near side in front of Kai
`,
    [radius, squash, turns, bobH, bobF],
  );
  return (
    <FigureLayout
      side={
        <>
          <Slider label="count" value={count} min={1} max={6} step={1} onChange={setCount} fmt={(v) => v.toFixed(0)} />
          <Slider label="radius" value={radius} min={6} max={40} step={1} onChange={setRadius} fmt={(v) => v.toFixed(0)} />
          <Slider label="turns/s" value={turns} min={0} max={2} step={0.05} onChange={setTurns} fmt={(v) => v.toFixed(2)} />
          <Slider label="squash" value={squash} min={0.2} max={1} step={0.05} onChange={setSquash} fmt={(v) => v.toFixed(2)} />
          <Slider label="bob_height" value={bobH} min={0} max={6} step={0.5} onChange={setBobH} fmt={(v) => v.toFixed(1)} />
          <Slider label="bob Hz" value={bobF} min={0.25} max={4} step={0.25} onChange={setBobF} fmt={(v) => v.toFixed(2)} />
          <Readout
            rows={[
              ['\\theta_0 \\text{ (shard 0)}', `${f(ang, 0)}°`],
              ['\\text{gap } 360°/n', `${f(360 / count, 0)}°`],
              ['\\text{speed } 2\\pi r f', `${f(2 * Math.PI * radius * turns, 1)} px/s`],
              ['\\text{bob peak speed } 2\\pi f A', `${f(2 * Math.PI * bobF * bobH, 1)} px/s`],
            ]}
          />
        </>
      }
      below={<CodeBlock code={code} file="scripts/math/orbiting_shards.gd" compact />}
    >
      <GameCanvas width={W} height={H} update={update} draw={draw} touchButtons={['up', 'down', 'left', 'right']} keysHint={<Keys items={[['WASD / arrows', 'move Kai']]} />} label="shards orbiting Kai; move with WASD or arrow keys" />
    </FigureLayout>
  );
}
