// math.raycast: rays against boxes in a room. 'sight' mode: a skeleton with a view cone checks range,
// angle (dot product) and a ray for line of sight to Kai. 'bounce' mode: a projectile path traced by
// rays, reflected with v - 2 (v·n) n at each hit; the slide vector is shown for the first hit.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { FigureLayout, Readout, Slider, SegControl, Toggle } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { useSvgDrag, type V2, type Box, sub, add, mul, dot, len, norm, clamp, rayBox, bounce, slide, f1, f2, vec, frameURL, firstFrame } from './util';
import { SHEETS } from '../../art';

const W = 320, H = 180;
const BORDER: Box[] = [
  { x: 0, y: 0, w: W, h: 6 },
  { x: 0, y: H - 6, w: W, h: 6 },
  { x: 0, y: 0, w: 6, h: H },
  { x: W - 6, y: 0, w: 6, h: H },
];

function castRay(p: V2, d: V2, tMax: number, boxes: Box[]) {
  let best: { t: number; n: V2; i: number } | null = null;
  boxes.forEach((b, i) => {
    const h = rayBox(p, d, b, tMax);
    if (h && (!best || h.t < best.t)) best = { ...h, i };
  });
  return best as { t: number; n: V2; i: number } | null;
}

function Sprite({ id, anim, at, flip }: { id: string; anim: string; at: V2; flip?: boolean }) {
  const def = SHEETS[id];
  const url = frameURL(id, firstFrame(id, anim));
  if (!def || !url) return <rect x={at[0] - 6} y={at[1] - 18} width={12} height={18} rx={3} style={{ fill: 'var(--muted)' }} />;
  const [ox, oy] = def.origin ?? [def.frameW / 2, def.frameH];
  return (
    <image
      href={url}
      x={flip ? -(at[0] - ox) - def.frameW : at[0] - ox}
      y={at[1] - oy}
      width={def.frameW}
      height={def.frameH}
      style={{ imageRendering: 'pixelated' }}
      transform={flip ? 'scale(-1 1)' : undefined}
      pointerEvents="none"
    />
  );
}

export function RaycastLab({ spec }: { spec: VizSpec }) {
  const [mode, setMode] = useState<'sight' | 'bounce'>((spec.mode as 'sight' | 'bounce') ?? 'sight');
  const [walls, setWalls] = useState<Box[]>([
    { x: 132, y: 52, w: 20, h: 60 },
    { x: 214, y: 120, w: 56, h: 14 },
    { x: 60, y: 128, w: 40, h: 16 },
  ]);
  const [enemy, setEnemy] = useState<V2>([60, 70]);
  const [aim, setAim] = useState<V2>([96, 77]);
  const [player, setPlayer] = useState<V2>([250, 80]);
  const [fov, setFov] = useState(90);
  const [range, setRange] = useState(220);
  const [bounces, setBounces] = useState(2);
  const [showSlide, setShowSlide] = useState(true);
  const { svgProps, begin } = useSvgDrag((id, p) => {
    const q: V2 = [clamp(Math.round(p[0]), 10, W - 10), clamp(Math.round(p[1]), 10, H - 10)];
    if (id === 'enemy') {
      const d = sub(q, enemy);
      setEnemy(q);
      setAim((a) => add(a, d));
    } else if (id === 'aim') setAim(q);
    else if (id === 'player') setPlayer(q);
    else if (id.startsWith('w')) {
      const k = +id.slice(1);
      setWalls((ws) => ws.map((w, i) => (i === k ? { ...w, x: clamp(q[0], 6, W - 6 - w.w), y: clamp(q[1], 6, H - 6 - w.h) } : w)));
    }
  });
  const boxes = useMemo(() => [...walls, ...BORDER], [walls]);
  const facing = norm(sub(aim, enemy));

  // ------------------------------------------------ sight: range, cone, then a ray
  const sight = useMemo(() => {
    const to = sub(player, enemy);
    const dist = len(to);
    const dir = norm(to);
    const cosHalf = Math.cos(((fov / 2) * Math.PI) / 180);
    const d = facing[0] * dir[0] + facing[1] * dir[1];
    const inRange = dist <= range;
    const inCone = d >= cosHalf;
    // the ray goes from the enemy to the player; walls closer than the player block it
    const hit = castRay(enemy, to, 1, boxes);
    const blocked = !!hit;
    const hitPos: V2 = hit ? add(enemy, mul(to, hit.t)) : player;
    return { to, dist, dir, cosHalf, d, inRange, inCone, hit, blocked, hitPos, sees: inRange && inCone && !blocked };
  }, [player, enemy, facing, fov, range, boxes]);

  // ------------------------------------------------ bounce: trace the path
  const path = useMemo(() => {
    const segs: { a: V2; b: V2; n?: V2; vin?: V2; vout?: V2 }[] = [];
    let p = enemy, d = facing, left = 700;
    for (let i = 0; i <= bounces; i++) {
      const h = castRay(p, d, left, boxes);
      if (!h) {
        segs.push({ a: p, b: add(p, mul(d, left)) });
        break;
      }
      const q = add(p, mul(d, h.t));
      const out = bounce(d, h.n);
      segs.push({ a: p, b: q, n: h.n, vin: d, vout: i < bounces ? out : undefined });
      left -= h.t;
      p = add(q, mul(h.n, 0.01));
      d = out;
      if (left <= 0) break;
    }
    return segs;
  }, [enemy, facing, bounces, boxes]);

  const SPEED = 200;
  const first = path.find((s) => s.n);
  const code = useMemo(() => {
    if (mode === 'sight')
      return `extends Node2D
## Line of sight for an enemy: range first, then the view cone, then a ray that walls block.

@export var sight_range := ${range.toFixed(1)}
@export var fov_degrees := ${fov.toFixed(1)}
@export_flags_2d_physics var sight_mask := 3  # world + player

var facing := Vector2${vec(facing, f2)}


func can_see(target: Node2D) -> bool:
	var to_target := target.global_position - global_position  # ${vec(sight.to, (v) => v.toFixed(0))}
	if to_target.length() > sight_range:  # ${sight.dist.toFixed(1)} > ${range}: ${!sight.inRange}
		return false
	# cos(${(fov / 2).toFixed(0)} deg) = ${sight.cosHalf.toFixed(2)}
	if facing.dot(to_target.normalized()) < cos(deg_to_rad(fov_degrees / 2.0)):  # ${sight.d.toFixed(2)}: ${!sight.inCone}
		return false
	var query := PhysicsRayQueryParameters2D.create(global_position, target.global_position, sight_mask)
	var hit := get_world_2d().direct_space_state.intersect_ray(query)
	# first thing on the line: ${sight.blocked ? 'a wall at ' + vec(sight.hitPos, (v) => v.toFixed(0)) : 'Kai'}
	return not hit.is_empty() and hit.collider == target  # ${sight.sees}`;
    const vin = first?.vin ? mul(first.vin, SPEED) : mul(facing, SPEED);
    const n = first?.n ?? [0, 0];
    return `extends CharacterBody2D
## A projectile that bounces off walls.

@export var speed := ${SPEED.toFixed(1)}
@export var max_bounces := ${bounces}

var bounces_left := max_bounces


func _ready() -> void:
	velocity = Vector2${vec(facing, f2)} * speed


func _physics_process(delta: float) -> void:
	var collision := move_and_collide(velocity * delta)
	if collision == null:
		return
	if bounces_left == 0:
		queue_free()
		return
	bounces_left -= 1
	var n := collision.get_normal()  # first hit: ${vec(n, (v) => v.toFixed(0))}
	# v - 2 (v·n) n: ${vec(vin)} - 2 * ${f1(dot(vin, n))} * ${vec(n, (v) => v.toFixed(0))}
	velocity = velocity.bounce(n)  # ${vec(bounce(vin, n))}`;
  }, [mode, range, fov, facing, sight, bounces, first]);

  const grab = (id: string, at: V2) => ({ onPointerDown: (e: React.PointerEvent) => begin(id, e, at), style: { cursor: 'grab' } as React.CSSProperties });
  const coneR = Math.min(range, 400);
  const a0 = Math.atan2(facing[1], facing[0]);
  const half = (fov / 2) * (Math.PI / 180);
  const conePts = [enemy, ...Array.from({ length: 25 }, (_, i) => add(enemy, mul([Math.cos(a0 - half + (2 * half * i) / 24), Math.sin(a0 - half + (2 * half * i) / 24)], coneR)))];
  const ok = 'var(--c-w)', bad = 'var(--c-err)';

  const rows: [string, React.ReactNode][] =
    mode === 'sight'
      ? [
          ['|\\text{to\\_target}|', <span key="r" className={sight.inRange ? 'geom-yes' : 'geom-no'}>{sight.dist.toFixed(1)} px</span>],
          ['\\text{facing}\\cdot\\hat{d}', <span key="c" className={sight.inCone ? 'geom-yes' : 'geom-no'}>{sight.d.toFixed(2)} vs {sight.cosHalf.toFixed(2)}</span>],
          ['\\text{ray}', <span key="b" className={sight.blocked ? 'geom-no' : 'geom-yes'}>{sight.blocked ? 'wall first' : 'reaches Kai'}</span>],
          ...(sight.hit ? ([['\\text{hit, normal}', `${vec(sight.hitPos, (v) => v.toFixed(0))}, ${vec(sight.hit.n, (v) => v.toFixed(0))}`]] as [string, string][]) : []),
          ['\\text{can\\_see}', <b key="s" className={sight.sees ? 'geom-yes' : 'geom-no'}>{String(sight.sees)}</b>],
        ]
      : first?.n && first.vin
        ? [
            ['\\bv', vec(mul(first.vin, SPEED))],
            ['\\mathbf{n}', vec(first.n, (v) => v.toFixed(0))],
            ['\\bv\\cdot\\mathbf{n}', f1(dot(mul(first.vin, SPEED), first.n))],
            ['\\bv - 2(\\bv\\cdot\\mathbf{n})\\mathbf{n}', vec(bounce(mul(first.vin, SPEED), first.n))],
            ['\\bv - (\\bv\\cdot\\mathbf{n})\\mathbf{n}', vec(slide(mul(first.vin, SPEED), first.n))],
            ['|\\bv| \\text{ after}', `${len(bounce(mul(first.vin, SPEED), first.n)).toFixed(1)} px/s`],
          ]
        : [['\\text{hit}', 'none']];

  return (
    <FigureLayout
      side={
        <>
          <SegControl value={mode} onChange={setMode} options={[{ v: 'sight', label: 'line of sight' }, { v: 'bounce', label: 'bounce' }]} />
          {mode === 'sight' ? (
            <>
              <Slider label="fov" value={fov} min={20} max={360} step={5} onChange={setFov} fmt={(v) => v.toFixed(0) + '°'} />
              <Slider label="range" value={range} min={40} max={340} step={5} onChange={setRange} fmt={(v) => v.toFixed(0)} />
            </>
          ) : (
            <>
              <Slider label="bounces" value={bounces} min={0} max={5} step={1} onChange={setBounces} fmt={(v) => v.toFixed(0)} />
              <Toggle label="show slide at first hit" value={showSlide} onChange={setShowSlide} />
            </>
          )}
          <Readout rows={rows} />
          <div className="geom-note">Drag {mode === 'sight' ? 'the skeleton, its facing knob, Kai,' : 'the caster, the aim knob'} and the grey walls.</div>
        </>
      }
      below={<CodeBlock code={code} file={mode === 'sight' ? 'scripts/enemy_sight.gd' : 'scripts/bouncing_shot.gd'} compact />}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="geom-svg" {...svgProps} role="img" aria-label="raycast figure: drag the characters and walls">
        <defs>
          <marker id="geom-h-n" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--violet)' }} />
          </marker>
          <marker id="geom-h-s" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--c-w)' }} />
          </marker>
        </defs>
        <rect width={W} height={H} className="pl-bg" />
        {BORDER.map((b, i) => (
          <rect key={'b' + i} x={b.x} y={b.y} width={b.w} height={b.h} className="geom-wall" />
        ))}
        {walls.map((b, i) => (
          <rect key={'w' + i} x={b.x} y={b.y} width={b.w} height={b.h} className="geom-wall drag" {...grab('w' + i, [b.x, b.y])} />
        ))}
        {mode === 'sight' ? (
          <>
            <polygon points={conePts.map((p) => p.join(',')).join(' ')} style={{ fill: sight.sees ? ok : 'var(--c-u)', opacity: 0.12 }} pointerEvents="none" />
            <line x1={enemy[0]} y1={enemy[1]} x2={sight.hitPos[0]} y2={sight.hitPos[1]} style={{ stroke: sight.sees ? ok : sight.blocked ? bad : 'var(--muted)', strokeWidth: 1.5 }} pointerEvents="none" />
            {sight.blocked && <line x1={sight.hitPos[0]} y1={sight.hitPos[1]} x2={player[0]} y2={player[1]} style={{ stroke: 'var(--muted)', strokeWidth: 1, strokeDasharray: '3 3' }} pointerEvents="none" />}
            {sight.hit && (
              <>
                <circle cx={sight.hitPos[0]} cy={sight.hitPos[1]} r={2.5} style={{ fill: bad }} />
                <line x1={sight.hitPos[0]} y1={sight.hitPos[1]} x2={sight.hitPos[0] + sight.hit.n[0] * 14} y2={sight.hitPos[1] + sight.hit.n[1] * 14} className="geom-arrow" style={{ stroke: 'var(--violet)' }} markerEnd="url(#geom-h-n)" />
              </>
            )}
            <g {...grab('player', player)}>
              <circle cx={player[0]} cy={player[1] - 8} r={12} style={{ fill: 'transparent' }} />
              <Sprite id="hero" anim="idle_down" at={player} />
            </g>
            <text x={player[0]} y={player[1] + 9} textAnchor="middle" className="geom-tag">Kai</text>
          </>
        ) : (
          <>
            {path.map((s, i) => (
              <g key={i} pointerEvents="none">
                <line x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} style={{ stroke: 'var(--c-v)', strokeWidth: 1.6, opacity: 1 - i * 0.12 }} />
                {s.n && (
                  <>
                    <circle cx={s.b[0]} cy={s.b[1]} r={2.2} style={{ fill: 'var(--c-v)' }} />
                    <line x1={s.b[0]} y1={s.b[1]} x2={s.b[0] + s.n[0] * 14} y2={s.b[1] + s.n[1] * 14} className="geom-arrow" style={{ stroke: 'var(--violet)' }} markerEnd="url(#geom-h-n)" />
                  </>
                )}
              </g>
            ))}
            {showSlide && first?.n && first.vin && (
              <line x1={first.b[0]} y1={first.b[1]} x2={first.b[0] + slide(first.vin, first.n)[0] * 30} y2={first.b[1] + slide(first.vin, first.n)[1] * 30} className="geom-arrow" style={{ stroke: 'var(--c-w)', strokeDasharray: '3 2' }} markerEnd="url(#geom-h-s)" pointerEvents="none" />
            )}
          </>
        )}
        {/* the enemy / caster and its facing knob */}
        <line x1={enemy[0]} y1={enemy[1]} x2={aim[0]} y2={aim[1]} style={{ stroke: 'var(--c-u)', strokeWidth: 1, strokeDasharray: '2 2' }} pointerEvents="none" />
        <g {...grab('enemy', enemy)}>
          <circle cx={enemy[0]} cy={enemy[1] - 8} r={12} style={{ fill: 'transparent' }} />
          {mode === 'sight' ? <Sprite id="skeleton" anim="idle" at={[enemy[0], enemy[1] + 8]} flip={facing[0] < 0} /> : <Sprite id="mage" anim="cast" at={[enemy[0], enemy[1] + 8]} flip={facing[0] < 0} />}
        </g>
        <circle cx={enemy[0]} cy={enemy[1]} r={2} style={{ fill: 'var(--c-u)' }} pointerEvents="none" />
        <circle cx={aim[0]} cy={aim[1]} r={5} className="geom-knob" {...grab('aim', aim)} />
      </svg>
    </FigureLayout>
  );
}
