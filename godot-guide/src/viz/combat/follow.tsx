// combat.partyfollow: how AI allies follow the leader. Walk Kai around; Lyra and Bram use one of
// three follow strategies. Chasing the leader stacks them and snags on walls; a breadcrumb trail
// threads corridors; formation slots look tidy in the open but can land inside walls.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, rect, type Input } from '../game';
import { Slider, SegControl, Toggle, Readout, FigureLayout } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { PAL, sprite, floor, shadow, stext } from './combatDraw';
import './combat.css';

type Strategy = 'chase' | 'trail' | 'slots';
const W = 320, H = 180;
const WALLS: [number, number, number, number][] = [
  [0, 0, W, 14],
  [0, H - 10, W, 10],
  [0, 0, 10, H],
  [W - 10, 0, 10, H],
  [120, 14, 16, 92],
  [200, 74, 16, 96],
];
interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 'down' | 'up' | 'side';
  flip: boolean;
  t: number;
  tx: number;
  ty: number;
  blocked: number;
}
const R = 5;
const hitWall = (x: number, y: number) => WALLS.some(([wx, wy, ww, wh]) => x - R < wx + ww && x + R > wx && y - 4 < wy + wh && y > wy);
function moveBody(b: Body, dt: number) {
  const ox = b.x, oy = b.y;
  b.x += b.vx * dt;
  if (hitWall(b.x, b.y)) {
    b.x -= b.vx * dt;
    b.vx = 0;
  }
  b.y += b.vy * dt;
  if (hitWall(b.x, b.y)) {
    b.y -= b.vy * dt;
    b.vy = 0;
  }
  const moved = Math.hypot(b.x - ox, b.y - oy);
  return moved;
}
function face(b: Body, dx: number, dy: number) {
  if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return;
  if (Math.abs(dx) >= Math.abs(dy)) {
    b.facing = 'side';
    b.flip = dx < 0;
  } else b.facing = dy < 0 ? 'up' : 'down';
}

export function PartyFollow({ spec }: { spec: VizSpec }) {
  const [strategy, setStrategy] = useState<Strategy>((spec.strategy as Strategy) ?? 'chase');
  const [spacing, setSpacing] = useState(18);
  const [separation, setSeparation] = useState(strategy !== 'chase');
  const mk = (x: number, y: number): Body => ({ x, y, vx: 0, vy: 0, facing: 'down', flip: false, t: 0, tx: x, ty: y, blocked: 0 });
  const st = useMemo(() => ({ kai: mk(60, 120), allies: [mk(40, 110), mk(40, 135)], crumbs: [[60, 120]] as [number, number][], heading: [1, 0] as [number, number] }), []);
  const [read, setRead] = useState({ d1: 0, d2: 0, sep: 0, stuck: 0 });
  const frame = useRef(0);

  const update = (dt: number, input: Input) => {
    const k = st.kai;
    const [ix, iy] = input.vector();
    k.vx = ix * 80;
    k.vy = iy * 80;
    moveBody(k, dt);
    k.t += dt;
    if (ix || iy) {
      face(k, ix, iy);
      st.heading = [ix, iy];
    }
    // breadcrumbs: a point every 3 px of leader movement
    const last = st.crumbs[st.crumbs.length - 1];
    if (Math.hypot(k.x - last[0], k.y - last[1]) >= 3) {
      st.crumbs.push([k.x, k.y]);
      if (st.crumbs.length > 200) st.crumbs.shift();
    }
    st.allies.forEach((a, i) => {
      // the target point for this ally
      if (strategy === 'chase') {
        a.tx = k.x;
        a.ty = k.y;
      } else if (strategy === 'trail') {
        // walk back along the crumbs until the path distance reaches (i + 1) * spacing
        let need = (i + 1) * spacing, px = k.x, py = k.y;
        let tx = st.crumbs[0][0], ty = st.crumbs[0][1];
        for (let c = st.crumbs.length - 1; c >= 0; c--) {
          const [cx, cy] = st.crumbs[c];
          const seg = Math.hypot(cx - px, cy - py);
          if (seg >= need) {
            const f = need / seg;
            tx = px + (cx - px) * f;
            ty = py + (cy - py) * f;
            need = 0;
            break;
          }
          need -= seg;
          px = cx;
          py = cy;
        }
        a.tx = tx;
        a.ty = ty;
      } else {
        // formation slots behind the leader, rotated with its heading
        const [hx, hy] = st.heading;
        const n = Math.hypot(hx, hy) || 1;
        const fx = hx / n, fy = hy / n;
        const side = i === 0 ? -1 : 1;
        a.tx = k.x - fx * spacing - fy * side * spacing * 0.7;
        a.ty = k.y - fy * spacing + fx * side * spacing * 0.7;
      }
      const dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
      const stop = strategy === 'chase' ? spacing : 2;
      let vx = 0, vy = 0;
      if (d > stop) {
        const sp = Math.min(90, (d - stop) * 6 + 20);
        vx = (dx / d) * sp;
        vy = (dy / d) * sp;
      }
      if (separation) {
        // push away from the leader and the other ally when closer than 12 px
        for (const o of [k, ...st.allies]) {
          if (o === a) continue;
          const ox = a.x - o.x, oy = a.y - o.y, od = Math.hypot(ox, oy);
          if (od > 0.01 && od < 12) {
            vx += (ox / od) * (12 - od) * 8;
            vy += (oy / od) * (12 - od) * 8;
          }
        }
      }
      a.vx = vx;
      a.vy = vy;
      const moved = moveBody(a, dt);
      a.t += dt;
      face(a, vx, vy);
      // "stuck": wants to move but makes no progress (pressed against a wall)
      a.blocked = Math.hypot(vx, vy) > 25 && moved < 0.2 ? a.blocked + dt : 0;
    });
    if (++frame.current % 6 === 0) {
      const [a, b] = st.allies;
      setRead({ d1: Math.hypot(a.x - k.x, a.y - k.y), d2: Math.hypot(b.x - k.x, b.y - k.y), sep: Math.hypot(a.x - b.x, a.y - b.y), stuck: st.allies.filter((x) => x.blocked > 0.4).length });
    }
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    floor(ctx, 0, 0, W, H);
    for (const [x, y, w, h] of WALLS) {
      rect(ctx, x, y, w, h, '#2b2838');
      rect(ctx, x, y, w, 2, '#4a4760');
    }
    if (strategy === 'trail') for (let i = 0; i < st.crumbs.length; i += 3) rect(ctx, st.crumbs[i][0], st.crumbs[i][1], 1, 1, 'rgba(255,255,255,0.35)');
    const bodies = [
      { b: st.kai, sheet: 'hero', color: '#3b82c4' },
      { b: st.allies[0], sheet: 'mage', color: '#a35ad1' },
      { b: st.allies[1], sheet: 'guard', color: '#c7843b' },
    ].sort((p, q) => p.b.y - q.b.y);
    for (const { b, sheet, color } of bodies) {
      shadow(ctx, b.x, b.y, 12);
      const anim = (Math.hypot(b.vx, b.vy) > 5 ? 'walk_' : 'idle_') + b.facing;
      sprite(ctx, sheet, anim, b.t, b.x, b.y, { flip: b.flip, color });
    }
    st.allies.forEach((a, i) => {
      // the target point
      const c = i === 0 ? '#c9a6ff' : '#ffcf8a';
      rect(ctx, a.tx - 2, a.ty, 5, 1, c);
      rect(ctx, a.tx, a.ty - 2, 1, 5, c);
      if (a.blocked > 0.4) stext(ctx, 'stuck', a.x, a.y - 26, PAL.hurt, 'center');
    });
    stext(ctx, strategy === 'chase' ? 'chase the leader' : strategy === 'trail' ? 'follow the trail' : 'formation slots', 16, 26, PAL.white);
  };

  const code =
    strategy === 'chase'
      ? `# ai_controller.gd: follow by chasing
func _follow(leader: Character) -> void:
	var to_leader := leader.global_position - body.global_position
	if to_leader.length() > follow_distance:  # ${spacing.toFixed(0)} px
		body.intent.move = to_leader.normalized()
	else:
		body.intent.move = Vector2.ZERO`
      : strategy === 'trail'
        ? `# ai_controller.gd: follow the leader's trail
func _follow(leader: Character) -> void:
	# party_manager.trail is a PackedVector2Array of the leader's past positions
	var target := party.point_behind_leader((slot + 1) * follow_distance)  # ${spacing.toFixed(0)} px per slot
	_steer_to(target)`
        : `# ai_controller.gd: formation slots
func _follow(leader: Character) -> void:
	var back := -leader.heading
	var side := back.orthogonal() * (1.0 if slot == 0 else -1.0)
	var target := leader.global_position + back * follow_distance + side * follow_distance * 0.7
	_steer_to(target)  # follow_distance = ${spacing.toFixed(0)}`;

  return (
    <FigureLayout
      side={
        <>
          <SegControl label="strategy" value={strategy} onChange={(s) => { setStrategy(s); if (s !== 'chase') setSeparation(true); }} options={[{ v: 'chase', label: 'chase' }, { v: 'trail', label: 'trail' }, { v: 'slots', label: 'slots' }]} />
          <Slider label="follow_distance (px)" value={spacing} min={8} max={40} step={1} onChange={setSpacing} fmt={(v) => v.toFixed(0)} />
          <Toggle label="separation between party members" value={separation} onChange={setSeparation} />
          <Readout
            rows={[
              ['\\text{Lyra} \\to \\text{Kai}', `${read.d1.toFixed(0)} px`],
              ['\\text{Bram} \\to \\text{Kai}', `${read.d2.toFixed(0)} px`],
              ['\\text{Lyra} \\leftrightarrow \\text{Bram}', `${read.sep.toFixed(0)} px ${read.sep < 8 ? '(stacked)' : ''}`],
              ['\\text{stuck on a wall}', String(read.stuck)],
            ]}
          />
        </>
      }
      below={<CodeBlock compact file="scripts/controllers/ai_controller.gd (excerpt)" code={code} />}
    >
      <GameCanvas width={W} height={H} update={update} draw={draw} touchButtons={['up', 'down', 'left', 'right']} keysHint={<Keys items={[['WASD / arrows', 'move Kai']]} />} label="party follow lab: move Kai with WASD or arrows; Lyra and Bram follow" />
    </FigureLayout>
  );
}
