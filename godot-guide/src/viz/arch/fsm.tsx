// core.fsm: a playable character next to its live state machine.
//   mode 'flags': the boolean-flag script from c05-1 (with its slide-attack and endless-swing bugs)
//   mode 'enum' : the enum + match machine from c05-1
//   mode 'nodes': the node-based StateMachine with Character + PlayerController + Intent (c05-2),
//                 plus a slime that can hurt Kai (Hurt is reachable from Idle, Move, Attack, not Dash)
// The TypeScript below mirrors the GDScript listings line by line where it can.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, type Input } from '../game';
import { FigureLayout } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { C05_CODE } from '../../content/modules/c05_architecture';
import { type Box, type Facing, slide, moveToward2, faceFrom, drawChar, drawFloor, drawWall, drawShadow, dirAnim, frameAt, tag } from './common';

const W = 320, H = 180;
const WALLS: Box[] = [
  [0, 0, W, 16],
  [0, H - 12, W, 12],
  [0, 0, 12, H],
  [W - 12, 0, 12, H],
  [140, 64, 40, 24],
];

type Mode = 'flags' | 'enum' | 'nodes';
type St = 'Idle' | 'Move' | 'Dash' | 'Attack' | 'Hurt';

const MAX_SPEED = 90, ACCEL = 900, FRICTION = 1200, DASH_SPEED = 260, DASH_TIME = 0.15, ATTACK_TIME = 0.3;
const HURT_TIME = 0.25, KNOCK_FRICTION = 900, KNOCKBACK = 160, BUFFER = 0.15;

interface Kai {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
  facing: Facing;
  flip: boolean;
  t: number;
  anim: string;
  // flags script
  isDashing: boolean;
  isAttacking: boolean;
  dashLeft: number;
  attackLeft: number;
  // machines
  state: St;
  time: number;
}
interface Intent {
  mx: number;
  my: number;
  attack: boolean;
  dodge: boolean;
  ageA: number;
  ageD: number;
}

const newKai = (): Kai => ({ x: 70, y: 120, vx: 0, vy: 0, fx: 0, fy: 1, facing: 'down', flip: false, t: 0, anim: 'idle_down', isDashing: false, isAttacking: false, dashLeft: 0, attackLeft: 0, state: 'Idle', time: 0 });

interface Edge {
  from: St | 'G';
  to: St;
  label: string;
  d: string;
  lx: number;
  ly: number;
  anchor?: 'start' | 'middle' | 'end';
}
const NODE: Record<St, [number, number]> = { Idle: [76, 104], Move: [196, 104], Dash: [410, 36], Attack: [410, 122], Hurt: [410, 196] };
const NW = 70, NH = 28;
const EDGES: Edge[] = [
  { from: 'Idle', to: 'Move', label: 'move ≠ 0', d: 'M108,96 C130,80 142,80 162,96', lx: 136, ly: 76 },
  { from: 'Move', to: 'Idle', label: 'move = 0', d: 'M162,112 C142,128 130,128 108,112', lx: 136, ly: 140 },
  { from: 'G', to: 'Dash', label: 'wants_dodge', d: 'M250,80 C300,60 330,40 372,38', lx: 300, ly: 46, anchor: 'middle' },
  { from: 'Dash', to: 'Idle', label: '0.15 s', d: 'M410,22 C410,4 120,0 84,88', lx: 250, ly: 12 },
  { from: 'G', to: 'Attack', label: 'wants_attack', d: 'M250,116 C300,120 330,122 372,122', lx: 310, ly: 114 },
  { from: 'Attack', to: 'Idle', label: '0.3 s', d: 'M380,136 C330,168 140,170 80,120', lx: 250, ly: 172 },
  { from: 'G', to: 'Hurt', label: 'hurt', d: 'M240,140 C290,180 330,196 372,196', lx: 298, ly: 194 },
  { from: 'Attack', to: 'Hurt', label: 'hurt', d: 'M410,138 L410,180', lx: 416, ly: 162, anchor: 'start' },
  { from: 'Hurt', to: 'Idle', label: '0.25 s', d: 'M374,206 C300,226 90,226 70,120', lx: 200, ly: 222 },
];

function edgeId(from: St, to: St): number {
  return EDGES.findIndex((e) => e.to === to && (e.from === from || (e.from === 'G' && (from === 'Idle' || from === 'Move'))));
}

function Diagram({ mode, cur, flash, flashKey }: { mode: Mode; cur: St; flash: number; flashKey: number }) {
  const states: St[] = mode === 'nodes' ? ['Idle', 'Move', 'Dash', 'Attack', 'Hurt'] : ['Idle', 'Move', 'Dash', 'Attack'];
  const edges = EDGES.filter((e) => states.includes(e.to) && (e.from === 'G' || states.includes(e.from as St)));
  const name = (s: St) => (mode === 'enum' ? s.toUpperCase() : s);
  const label = (e: Edge) => {
    if (mode === 'enum') return e.label.replace('wants_dodge', 'dodge pressed').replace('wants_attack', 'attack pressed');
    return e.label;
  };
  return (
    <svg className="arch-diagram" viewBox="0 0 520 236" role="img" aria-label={`state diagram, current state ${cur}`}>
      <defs>
        <marker id="arch-ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" className="arch-arrow" />
        </marker>
        <marker id="arch-ah-on" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" className="arch-arrow-on" />
        </marker>
      </defs>
      <rect className="arch-group" x={30} y={62} width={222} height={84} rx={10} />
      <text className="arch-small" x={34} y={56}>
        {mode === 'enum' ? 'match branch IDLE, MOVE' : 'Idle or Move'}
      </text>
      {edges.map((e) => {
        const i = EDGES.indexOf(e);
        const on = i === flash;
        return (
          <g key={i + (on ? '-' + flashKey : '')}>
            <path d={e.d} className={'arch-edge' + (on ? ' flash' : '')} markerEnd={on ? 'url(#arch-ah-on)' : 'url(#arch-ah)'} />
            <text x={e.lx} y={e.ly} textAnchor={e.anchor ?? 'middle'} className={'arch-edge-label' + (on ? ' flash' : '')}>
              {label(e)}
            </text>
          </g>
        );
      })}
      {states.map((s) => {
        const [x, y] = NODE[s];
        return (
          <g key={s} className={'arch-node' + (s === cur ? ' on' : '')}>
            <rect x={x - NW / 2} y={y - NH / 2} width={NW} height={NH} rx={6} />
            <text x={x} y={y + 4} textAnchor="middle">
              {name(s)}
            </text>
          </g>
        );
      })}
      {mode === 'nodes' && (
        <text className="arch-small" x={474} y={40} textAnchor="middle">
          no hurt
        </text>
      )}
    </svg>
  );
}

/** The flags script has no states, only a 2×2 table of (is_dashing, is_attacking). */
function FlagGrid({ dashing, attacking }: { dashing: boolean; attacking: boolean }) {
  const cells: [boolean, boolean, string, boolean][] = [
    [false, false, 'idle / walk', false],
    [false, true, 'attack', false],
    [true, false, 'dash', false],
    [true, true, 'slide attack: undesigned', true],
  ];
  return (
    <svg className="arch-diagram" viewBox="0 0 520 160" role="img" aria-label="flag combinations">
      <text x={300} y={16} textAnchor="middle" className="arch-small">
        is_attacking
      </text>
      <text x={200} y={34} textAnchor="middle" className="arch-small">
        false
      </text>
      <text x={400} y={34} textAnchor="middle" className="arch-small">
        true
      </text>
      <text x={16} y={96} className="arch-small">
        is_dashing
      </text>
      <text x={84} y={68} textAnchor="end" className="arch-small">
        false
      </text>
      <text x={84} y={124} textAnchor="end" className="arch-small">
        true
      </text>
      {cells.map(([d, a, l, bad], i) => {
        const x = 100 + (a ? 200 : 0), y = 42 + (d ? 56 : 0);
        const on = d === dashing && a === attacking;
        return (
          <g key={i} className={'arch-node' + (on ? ' on' : '') + (bad ? ' bad' : '')}>
            <rect x={x} y={y} width={190} height={46} rx={6} />
            <text x={x + 95} y={y + 28} textAnchor="middle">
              {l}
            </text>
          </g>
        );
      })}
      <text x={20} y={154} className="arch-small">
        2 flags → 2² = 4 combinations; the design has 3 of them
      </text>
    </svg>
  );
}

export function FsmLab({ spec }: { spec: VizSpec }) {
  const mode = (spec.mode as Mode) ?? 'nodes';
  const kai = useRef<Kai>(newKai()).current;
  const intent = useRef<Intent>({ mx: 0, my: 0, attack: false, dodge: false, ageA: Infinity, ageD: Infinity }).current;
  const slime = useRef({ x: 230, y: 130, vx: 0, vy: 0, tx: 230, ty: 130, t: 0, rest: 0.5, hop: 0 }).current;
  const stats = useRef({ bad: 0, restarts: 0, hurts: 0, dodged: 0 }).current;
  const [view, setView] = useState({ cur: 'Idle' as St, flash: -1, flashKey: 0 });
  const [panel, setPanel] = useState({ ...stats, isDashing: false, isAttacking: false, dashLeft: 0, attackLeft: 0, time: 0, mx: 0, my: 0, attack: false, dodge: false, ageA: Infinity, ageD: Infinity, vx: 0, vy: 0 });
  const frame = useRef(0);
  const flashKey = useRef(0);

  const face = (dx: number, dy: number) => {
    const f = faceFrom(dx, dy);
    if (!f) return;
    const n = Math.hypot(dx, dy);
    kai.fx = dx / n;
    kai.fy = dy / n;
    kai.facing = f.facing;
    kai.flip = f.facing === 'side' ? f.flip : kai.flip;
  };

  const transition = (to: St) => {
    const from = kai.state;
    // exit() and enter() of the node machine / _change_state() of the enum machine
    kai.state = to;
    kai.time = 0;
    kai.t = 0;
    if (to === 'Dash') {
      if (mode === 'nodes') {
        intent.dodge = false;
        face(intent.mx, intent.my);
      }
      kai.vx = kai.fx * DASH_SPEED;
      kai.vy = kai.fy * DASH_SPEED;
    }
    if (to === 'Attack' && mode === 'nodes') {
      intent.attack = false;
      face(intent.mx, intent.my);
    }
    flashKey.current++;
    setView({ cur: to, flash: edgeId(from, to), flashKey: flashKey.current });
  };

  const walkTick = (ix: number, iy: number, dt: number) => {
    // move_with_intent / _walk: c02's acceleration and friction
    const moving = ix !== 0 || iy !== 0;
    moveToward2(kai, ix * MAX_SPEED, iy * MAX_SPEED, (moving ? ACCEL : FRICTION) * dt);
  };

  const update = (dt: number, input: Input) => {
    const [ix, iy] = input.vector();
    kai.t += dt;
    if (mode === 'flags') {
      // ---- PLAYER_FLAGS, in order
      if (ix || iy) face(ix, iy);
      if (input.justPressed('dash') && !kai.isAttacking) {
        kai.isDashing = true;
        kai.dashLeft = DASH_TIME;
        kai.vx = kai.fx * DASH_SPEED;
        kai.vy = kai.fy * DASH_SPEED;
      }
      if (input.justPressed('attack')) {
        if (kai.isAttacking) stats.restarts++;
        if (!kai.isAttacking) kai.t = 0;
        kai.isAttacking = true;
        kai.attackLeft = ATTACK_TIME;
      }
      if (kai.isDashing) {
        kai.dashLeft -= dt;
        if (kai.dashLeft <= 0) kai.isDashing = false;
      } else if (kai.isAttacking) {
        kai.vx = 0;
        kai.vy = 0;
        kai.attackLeft -= dt;
        if (kai.attackLeft <= 0) kai.isAttacking = false;
      } else {
        kai.vx = ix * MAX_SPEED;
        kai.vy = iy * MAX_SPEED;
      }
      slide(kai, WALLS, dt);
      if (kai.isDashing && kai.isAttacking) stats.bad += dt;
      kai.anim = kai.isAttacking ? 'attack' : kai.isDashing ? 'dash' : kai.vx || kai.vy ? 'walk' : 'idle';
      const cur: St = kai.isAttacking ? 'Attack' : kai.isDashing ? 'Dash' : kai.vx || kai.vy ? 'Move' : 'Idle';
      if (cur !== kai.state) {
        kai.state = cur;
        setView({ cur, flash: -1, flashKey: 0 });
      }
    } else {
      // ---- controller: enum mode reads Input directly; nodes mode goes through the buffered intent
      let wantA: boolean, wantD: boolean;
      if (mode === 'nodes') {
        intent.mx = ix;
        intent.my = iy;
        if (input.justPressed('attack')) (intent.attack = true), (intent.ageA = 0);
        else (intent.ageA += dt), (intent.attack = intent.attack && intent.ageA <= BUFFER);
        if (input.justPressed('dash')) (intent.dodge = true), (intent.ageD = 0);
        else (intent.ageD += dt), (intent.dodge = intent.dodge && intent.ageD <= BUFFER);
        wantA = intent.attack;
        wantD = intent.dodge;
      } else {
        wantA = input.justPressed('attack');
        wantD = input.justPressed('dash');
      }
      kai.time += dt;
      // ---- the machine's physics_update for the current state
      switch (kai.state) {
        case 'Idle':
        case 'Move':
          if (wantA) {
            transition('Attack');
            break;
          }
          if (wantD) {
            transition('Dash');
            break;
          }
          if (ix || iy) face(ix, iy);
          walkTick(ix, iy, dt);
          slide(kai, WALLS, dt);
          if ((ix || iy) && kai.state === 'Idle') transition('Move');
          else if (!ix && !iy && kai.state === 'Move') transition('Idle');
          break;
        case 'Dash':
          slide(kai, WALLS, dt);
          if (kai.time >= DASH_TIME) transition('Idle');
          break;
        case 'Attack':
          moveToward2(kai, 0, 0, FRICTION * dt);
          slide(kai, WALLS, dt);
          if (kai.time >= ATTACK_TIME) transition('Idle');
          break;
        case 'Hurt':
          moveToward2(kai, 0, 0, KNOCK_FRICTION * dt);
          slide(kai, WALLS, dt);
          if (kai.time >= HURT_TIME) transition('Idle');
          break;
      }
      kai.anim = kai.state === 'Idle' ? 'idle' : kai.state === 'Move' ? 'walk' : kai.state === 'Dash' ? 'dash' : kai.state === 'Attack' ? 'attack' : 'hurt';
    }
    // ---- the slime (nodes mode): hops about, hurts on contact
    if (mode === 'nodes') {
      slime.t += dt;
      if (slime.hop > 0) {
        slime.hop -= dt;
        slide(slime, WALLS, dt, 12, 6);
        if (slime.hop <= 0) (slime.vx = 0), (slime.vy = 0), (slime.rest = 0.6 + Math.random() * 0.6);
      } else {
        slime.rest -= dt;
        if (slime.rest <= 0) {
          // hop toward Kai half the time, otherwise somewhere random
          const toKai = Math.random() < 0.5;
          const tx = toKai ? kai.x : 40 + Math.random() * 240, ty = toKai ? kai.y : 40 + Math.random() * 110;
          const d = Math.hypot(tx - slime.x, ty - slime.y) || 1;
          slime.vx = ((tx - slime.x) / d) * 80;
          slime.vy = ((ty - slime.y) / d) * 80;
          slime.hop = 0.3;
          slime.t = 0;
        }
      }
      const touching = Math.abs(slime.x - kai.x) < 11 && Math.abs(slime.y - kai.y) < 8;
      if (touching) {
        if (kai.state === 'Dash') {
          if (kai.time < dt * 1.5) stats.dodged++;
        } else if (kai.state !== 'Hurt') {
          // Character._on_hurt: velocity = knockback, transition_to("Hurt")
          const d = Math.hypot(kai.x - slime.x, kai.y - slime.y) || 1;
          kai.vx = ((kai.x - slime.x) / d) * KNOCKBACK;
          kai.vy = ((kai.y - slime.y) / d) * KNOCKBACK;
          stats.hurts++;
          transition('Hurt');
        }
      }
    }
    if (++frame.current % 4 === 0)
      setPanel({ ...stats, isDashing: kai.isDashing, isAttacking: kai.isAttacking, dashLeft: kai.dashLeft, attackLeft: kai.attackLeft, time: kai.time, mx: intent.mx, my: intent.my, attack: intent.attack, dodge: intent.dodge, ageA: intent.ageA, ageD: intent.ageD, vx: kai.vx, vy: kai.vy });
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    drawFloor(ctx, W, H, 'dungeon');
    for (const [x, y, w, h] of WALLS) drawWall(ctx, x, y, w, h);
    if (mode === 'nodes') {
      drawShadow(ctx, slime.x, slime.y, 7, 2.5);
      drawChar(ctx, 'slime', slime.hop > 0 ? 'hop' : 'idle', slime.t, slime.x, slime.y - (slime.hop > 0 ? Math.sin((1 - slime.hop / 0.3) * Math.PI) * 6 : 0));
    }
    drawShadow(ctx, kai.x, kai.y);
    const anim = dirAnim('hero', kai.anim, kai.facing);
    const oneShot = kai.anim === 'attack' || kai.anim === 'dash';
    const len = kai.anim === 'attack' ? ATTACK_TIME : DASH_TIME;
    const fr = oneShot ? frameAt('hero', anim, kai.t / len) : undefined;
    const blink = kai.state === 'Hurt' && Math.floor(kai.time * 20) % 2 === 0;
    drawChar(ctx, 'hero', anim, kai.t, kai.x, kai.y, { flip: kai.flip, frame: fr, flash: blink ? 0.8 : 0, flashColor: '#ffffff' });
    const label = mode === 'flags' ? (kai.isDashing && kai.isAttacking ? 'DASH+ATTACK' : kai.isAttacking ? 'attacking' : kai.isDashing ? 'dashing' : '') : mode === 'enum' ? kai.state.toUpperCase() : kai.state;
    if (label) tag(ctx, label, kai.x, kai.y - 30, mode === 'flags' && kai.isDashing && kai.isAttacking ? '#f8925e' : '#ffffff');
  };

  const stateCode = useMemo(() => {
    const m: Record<St, [string, string]> = {
      Idle: [C05_CODE.IDLE, 'scripts/states/idle.gd'],
      Move: [C05_CODE.MOVE, 'scripts/states/move.gd'],
      Dash: [C05_CODE.DASH, 'scripts/states/dash.gd'],
      Attack: [C05_CODE.ATTACK, 'scripts/states/attack.gd'],
      Hurt: [C05_CODE.HURT, 'scripts/states/hurt.gd'],
    };
    return m[view.cur];
  }, [view.cur]);

  const row = (k: string, v: string, on = false, bad = false) => (
    <div className={'arch-row' + (on ? ' true' : '') + (bad ? ' bad' : '')} key={k}>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
  const age = (a: number) => (Number.isFinite(a) ? `${Math.min(99, Math.round(a * 60))} ticks` : 'never');

  const side =
    mode === 'flags' ? (
      <div className="arch-panel">
        <div className="arch-panel-title">script variables</div>
        {row('is_dashing', String(panel.isDashing), panel.isDashing)}
        {row('is_attacking', String(panel.isAttacking), panel.isAttacking)}
        {row('_dash_left', Math.max(0, panel.dashLeft).toFixed(2))}
        {row('_attack_left', Math.max(0, panel.attackLeft).toFixed(2))}
        {row('undesigned combo', `${panel.bad.toFixed(2)} s`, false, panel.bad > 0)}
        {row('attack restarted', `${panel.restarts}×`, false, panel.restarts > 0)}
      </div>
    ) : mode === 'enum' ? (
      <div className="arch-panel">
        <div className="arch-panel-title">script variables</div>
        {row('state', 'State.' + view.cur.toUpperCase(), true)}
        {row('_time_in_state', panel.time.toFixed(2) + ' s')}
        {row('ticks in state', String(Math.round(panel.time * 60)))}
        {row('velocity', `(${panel.vx.toFixed(0)}, ${panel.vy.toFixed(0)})`)}
        <div className="arch-note">Dash ends at 0.15 s (9 ticks), Attack at 0.30 s (18 ticks).</div>
      </div>
    ) : (
      <>
        <div className="arch-panel">
          <div className="arch-panel-title">intent (written by PlayerController)</div>
          {row('move', `(${panel.mx.toFixed(2)}, ${panel.my.toFixed(2)})`, panel.mx !== 0 || panel.my !== 0)}
          {row('wants_attack', String(panel.attack), panel.attack)}
          {row('  press age', age(panel.ageA))}
          {row('wants_dodge', String(panel.dodge), panel.dodge)}
          {row(' press age', age(panel.ageD))}
          <div className="arch-note">A request stays true for up to 9 ticks (0.15 s) or until a state consumes it.</div>
        </div>
        <div className="arch-panel">
          <div className="arch-panel-title">state machine</div>
          {row('current', view.cur, true)}
          {row('time', panel.time.toFixed(2) + ' s')}
          {row('hurt by slime', `${panel.hurts}×`)}
          {row('dashed through', `${panel.dodged}×`)}
        </div>
      </>
    );

  return (
    <FigureLayout
      side={side}
      below={
        <div className="arch-below-full">
          {mode === 'flags' ? <FlagGrid dashing={panel.isDashing} attacking={panel.isAttacking} /> : <Diagram mode={mode} cur={view.cur} flash={view.flash} flashKey={view.flashKey} />}
          {mode === 'nodes' && <CodeBlock code={stateCode[0]} file={stateCode[1] + '  (running now)'} compact />}
        </div>
      }
    >
      <GameCanvas
        width={W}
        height={H}
        update={update}
        draw={draw}
        touchButtons={['up', 'down', 'left', 'right', 'attack', 'dash']}
        keysHint={<Keys items={[['WASD / arrows', 'move'], ['J', 'attack'], ['K', 'dodge']]} />}
        label="state machine lab: move with WASD, attack with J, dodge with K"
      />
    </FigureLayout>
  );
}
