// combat.ai_tokens: five skeletons and an AttackTokens pool. Token holders approach, wind up (the
// telegraph), swing and recover; the rest hold a ring around Kai and drift sideways.
// combat.ai_phases: the golem's BossPhases component as a diagram: HP thresholds, one-way phase
// transitions, and one attack cycle of the current phase played on the golem sprite.
import { useEffect, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, rect, circle, type Input } from '../game';
import { FigureLayout, Slider, Toggle, Readout, Btn } from '../kit';
import { type Box, moveToward2, faceFrom, drawChar, drawFloor, drawWall, drawShadow, frameAt, overlap, tag, sfx, slide } from './common';
import { kaiTick, drawKai, newKai, kaiHitbox } from './ai';
import { PHASE_COL } from './hit';

const W = 320, H = 180;
const AW: Box[] = [
  [0, 0, W, 16],
  [0, H - 10, W, 10],
  [0, 0, 10, H],
  [W - 10, 0, 10, H],
];
type SB = 'CHASE' | 'ATTACK' | 'RECOVER' | 'WAIT' | 'HURT';
interface Sk {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
  flip: boolean;
  t: number;
  brain: SB;
  bt: number;
  frame: number;
  token: boolean;
  hitDone: boolean;
  flash: number;
  side: number;
}
const RING = 44, RANGE = 20, ACTIVE = 4, RECOV = 20;

export function TokenCrowd({ spec }: { spec: VizSpec }) {
  void spec;
  const [maxTokens, setMaxTokens] = useState(2);
  const [telegraph, setTelegraph] = useState(true);
  const P = useRef({ maxTokens, telegraph });
  P.current = { maxTokens, telegraph };
  const kai = useRef(newKai(160, 100)).current;
  const sks = useRef<Sk[]>(
    Array.from({ length: 5 }, (_, i) => {
      const a = (i / 5) * Math.PI * 2;
      return { x: 160 + Math.cos(a) * 90, y: 100 + Math.sin(a) * 50, vx: 0, vy: 0, fx: 1, fy: 0, flip: false, t: i * 0.37, brain: 'CHASE' as SB, bt: Math.random(), frame: 0, token: false, hitDone: false, flash: 0, side: i % 2 ? 1 : -1 };
    }),
  ).current;
  const stats = useRef({ hits: 0, maxWind: 0, time: 0, recent: [] as number[] }).current;
  const [ro, setRo] = useState({ hits: 0, holders: 0, maxWind: 0, winding: 0, last10: 0 });
  const tick = useRef(0);

  const update = (dt: number, input: Input) => {
    const p = P.current;
    const windup = p.telegraph ? 24 : 6;
    stats.time += dt;
    kaiTick(kai, input, dt, 90, AW);
    let holders = sks.filter((s) => s.token).length;
    // a lowered slider takes tokens back from the most recent holders that have not swung yet
    for (const s of sks) if (holders > p.maxTokens && s.token && s.brain !== 'ATTACK') (s.token = false), holders--;
    for (const s of sks) {
      s.t += dt;
      s.bt += dt;
      s.flash = Math.max(0, s.flash - dt * 6);
      const dx = kai.x - s.x, dy = kai.y - s.y, d = Math.hypot(dx, dy) || 1;
      // Kai's sword: a hit flinches the skeleton and cancels its swing (and releases its token)
      if (kai.state === 'Attack' && kai.time >= 0.08 && kai.time < 0.16 && !kai.hitSet.has(s as never) && overlap(kaiHitbox(kai), [s.x - 6, s.y - 18, 12, 18])) {
        kai.hitSet.add(s as never);
        s.vx = kai.fx * 140;
        s.vy = kai.fy * 140;
        s.flash = 1;
        if (s.token) (s.token = false), holders--;
        s.brain = 'HURT';
        s.bt = 0;
        sfx(true, 'sfx_hit', 0.3);
      }
      let mx = 0, my = 0, speed = 60;
      switch (s.brain) {
        case 'CHASE': {
          if (!s.token && d <= RING + 8 && holders < p.maxTokens) (s.token = true), holders++;
          if (s.token) {
            if (d <= RANGE) {
              s.brain = 'ATTACK';
              s.bt = 0;
              s.frame = 0;
              s.hitDone = false;
              s.fx = dx / d;
              s.fy = dy / d;
              s.flip = dx < 0;
              s.vx = 0;
              s.vy = 0;
            } else (mx = dx / d), (my = dy / d);
          } else {
            // orbit: radial pull to the ring plus a sideways drift
            const radial = Math.max(-1, Math.min(1, (d - RING) / 16));
            mx = (dx / d) * radial + (-dy / d) * 0.4 * s.side;
            my = (dy / d) * radial + (dx / d) * 0.4 * s.side;
            speed = 36;
          }
          break;
        }
        case 'ATTACK':
          s.frame++;
          if (s.frame >= windup && s.frame < windup + ACTIVE && !s.hitDone) {
            const hb: Box = [s.x + s.fx * 13 - 8, s.y - 9 + s.fy * 9 - 7, 16, 14];
            if (overlap(hb, [kai.x - 6, kai.y - 18, 12, 18])) {
              s.hitDone = true;
              if (kai.state !== 'Dash' && kai.state !== 'Hurt') {
                stats.hits++;
                stats.recent.push(stats.time);
                kai.flash = 1;
                kai.vx = s.fx * 140;
                kai.vy = s.fy * 140;
                kai.state = 'Hurt';
                kai.time = 0;
                sfx(true, 'sfx_hurt', 0.35);
              }
            }
          }
          if (s.frame >= windup + ACTIVE + RECOV) (s.brain = 'RECOVER'), (s.bt = 0);
          break;
        case 'RECOVER':
          if (s.bt >= 0.6) {
            if (s.token) (s.token = false), holders--;
            s.brain = 'WAIT';
            s.bt = 0;
          }
          break;
        case 'WAIT': {
          // after releasing: orbit for 0.6 s before asking again
          const radial = Math.max(-1, Math.min(1, (d - RING) / 16));
          mx = (dx / d) * radial + (-dy / d) * 0.4 * s.side;
          my = (dy / d) * radial + (dx / d) * 0.4 * s.side;
          speed = 36;
          if (s.bt >= 0.6) (s.brain = 'CHASE'), (s.bt = 0);
          break;
        }
        case 'HURT':
          if (s.bt >= 0.3) (s.brain = 'CHASE'), (s.bt = 0);
          break;
      }
      // separation from the others
      let sx = 0, sy = 0;
      for (const o of sks) {
        if (o === s) continue;
        const ax = s.x - o.x, ay = s.y - o.y, dd = Math.hypot(ax, ay);
        if (dd > 0 && dd < 18) (sx += (ax / dd) * (1 - dd / 18)), (sy += (ay / dd) * (1 - dd / 18));
      }
      if (s.brain !== 'ATTACK' && s.brain !== 'HURT') {
        mx += sx * 0.7;
        my += sy * 0.7;
        const l = Math.hypot(mx, my);
        if (l > 1) (mx /= l), (my /= l);
        const f = faceFrom(dx, dy);
        if (f) s.flip = f.flip && f.facing === 'side' ? true : dx < 0;
        moveToward2(s, mx * speed, my * speed, 900 * dt);
      } else if (s.brain === 'HURT') moveToward2(s, 0, 0, 900 * dt);
      slide(s, AW, dt);
    }
    const winding = sks.filter((s) => s.brain === 'ATTACK' && s.frame < windup).length;
    stats.maxWind = Math.max(stats.maxWind, winding);
    while (stats.recent.length && stats.recent[0] < stats.time - 10) stats.recent.shift();
    if (++tick.current % 5 === 0) setRo({ hits: stats.hits, holders, maxWind: stats.maxWind, winding, last10: stats.recent.length });
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const p = P.current;
    const windup = p.telegraph ? 24 : 6;
    drawFloor(ctx, W, H, 'dungeon');
    for (const [x, y, w, h] of AW) drawWall(ctx, x, y, w, h);
    ctx.save();
    ctx.setLineDash([2, 4]);
    circle(ctx, kai.x, kai.y - 3, RING, 'rgba(255,255,255,0.25)', false);
    ctx.restore();
    const all = [...sks.map((s) => ({ y: s.y, s })), { y: kai.y, s: null as Sk | null }].sort((a, b) => a.y - b.y);
    for (const { s } of all) {
      if (!s) {
        drawKai(ctx, kai);
        continue;
      }
      if (s.token) {
        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = '#f8925e';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, 9, 4, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      } else drawShadow(ctx, s.x, s.y);
      let anim = s.brain === 'HURT' ? 'hurt' : Math.hypot(s.vx, s.vy) > 5 ? 'walk' : 'idle';
      let fr: number | undefined;
      let flash = s.flash, flashColor = '#ffffff';
      if (s.brain === 'ATTACK') {
        if (s.frame < windup) {
          anim = 'windup';
          fr = frameAt('skeleton', 'windup', s.frame / windup);
          if (p.telegraph && ((s.frame >= 15 && s.frame < 20) || s.frame >= 22)) (flash = 0.6), (flashColor = '#f8925e');
          rect(ctx, s.x - 8, s.y + 3, 16, 2, 'rgba(0,0,0,0.6)');
          rect(ctx, s.x - 8, s.y + 3, (16 * s.frame) / windup, 2, '#eebb3e');
        } else {
          anim = 'attack';
          fr = frameAt('skeleton', 'attack', (s.frame - windup) / (ACTIVE + RECOV / 2));
        }
      }
      drawChar(ctx, 'skeleton', anim, s.t, s.x, s.y, { flip: s.flip, frame: fr, flash, flashColor });
    }
    tag(ctx, `hits taken ${ro.hits}`, 52, 30);
  };

  return (
    <FigureLayout
      side={
        <>
          <Slider label="max_tokens" value={maxTokens} min={1} max={5} step={1} onChange={setMaxTokens} />
          <Toggle label="telegraph (24-frame wind-up, orange pulses)" value={telegraph} onChange={setTelegraph} />
          <Readout
            rows={[
              ['\\text{holding a token}', `${ro.holders}`],
              ['\\text{winding up now}', `${ro.winding}`],
              ['\\text{most at once}', `${ro.maxWind}`],
              ['\\text{hits, last 10 s}', `${ro.last10}`],
              ['\\text{hits, total}', `${ro.hits}`],
            ]}
          />
          <Btn onClick={() => ((stats.hits = 0), (stats.maxWind = 0), (stats.recent.length = 0))}>reset counts</Btn>
        </>
      }
    >
      <GameCanvas
        width={W}
        height={H}
        update={update}
        draw={draw}
        touchButtons={['up', 'down', 'left', 'right', 'attack', 'dash']}
        keysHint={<Keys items={[['WASD / arrows', 'move'], ['J', 'attack'], ['K', 'dodge']]} />}
        label="attack tokens: survive the skeletons"
      />
    </FigureLayout>
  );
}

// =============================================================================== combat.ai_phases
interface Phase {
  at: number;
  slams: number;
  windup: number;
  recover: number;
  chase: number;
}
const PHASES: Phase[] = [
  { at: 1, slams: 1, windup: 40, recover: 72, chase: 0.6 },
  { at: 0.6, slams: 2, windup: 32, recover: 54, chase: 0.7 },
  { at: 0.3, slams: 3, windup: 24, recover: 42, chase: 0.85 },
];
const SLAM = 6, SLAM_REC = 18, MAXHP = 120;
const cycleOf = (p: Phase) => {
  const segs: [number, number][] = []; // [phase code, frames]: 1 windup, 2 slam, 3 recover
  for (let k = 0; k < p.slams; k++) segs.push([1, p.windup], [2, SLAM + SLAM_REC]);
  segs.push([3, p.recover]);
  return segs;
};

export function BossPhasesFig({ spec }: { spec: VizSpec }) {
  void spec;
  const [hp, setHpRaw] = useState(MAXHP);
  const [phase, setPhase] = useState(0);
  const [log, setLog] = useState<string[]>(['phase 0 applied in _ready()']);
  const [f, setF] = useState(0);
  const cv = useRef<HTMLCanvasElement>(null);
  const segs = cycleOf(PHASES[phase]);
  const total = segs.reduce((a, s) => a + s[1], 0);

  // BossPhases._on_health_changed: a while loop, forward only
  const setHp = (v: number) => {
    const next = Math.max(0, Math.min(MAXHP, Math.round(v)));
    setHpRaw(next);
    let ph = phase;
    const out: string[] = [];
    while (ph + 1 < PHASES.length && next / MAXHP <= PHASES[ph + 1].at) {
      ph++;
      out.push(`health_changed(${next}, ${MAXHP}) → phase_changed(${ph})`);
    }
    if (next > hp && ph === phase && next / MAXHP > PHASES[phase].at && phase > 0) out.push(`health_changed(${next}, ${MAXHP}): healed, phase stays ${phase}`);
    if (ph !== phase) {
      setPhase(ph);
      setF(0);
      sfx(true, 'sfx_stagger', 0.4);
    }
    if (out.length) setLog((l) => [...l, ...out].slice(-5));
  };

  useEffect(() => {
    let raf = 0, last = performance.now(), acc = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      acc += Math.min(0.1, (now - last) / 1000);
      last = now;
      while (acc >= 1 / 60) {
        acc -= 1 / 60;
        setF((v) => (v + 1) % total);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [total]);

  // which segment is the cursor in?
  let acc = 0, seg = 0, inSeg = 0;
  for (let k = 0; k < segs.length; k++) {
    if (f < acc + segs[k][1]) {
      seg = k;
      inSeg = f - acc;
      break;
    }
    acc += segs[k][1];
  }
  const code = segs[seg]?.[0] ?? 3;

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    drawFloor(ctx, 120, 64, 'dungeon');
    drawShadow(ctx, 60, 58, 14, 4);
    let anim = 'idle', fr: number | undefined, flash = 0;
    const len = segs[seg]?.[1] ?? 1;
    if (code === 1) {
      anim = 'windup';
      fr = frameAt('golem', 'windup', inSeg / len);
      flash = inSeg > len - 10 && Math.floor(inSeg / 3) % 2 === 0 ? 0.6 : 0;
    } else if (code === 2) {
      anim = 'slam';
      fr = frameAt('golem', 'slam', inSeg / (len * 0.6));
    }
    drawChar(ctx, 'golem', anim, f / 60, 60, 58, { frame: fr, flash, flashColor: '#f8925e' });
    if (code === 2 && inSeg < SLAM) {
      ctx.save();
      ctx.globalAlpha = 1 - inSeg / SLAM;
      circle(ctx, 60, 56, 10 + inSeg * 3, '#fbf6e6', false);
      ctx.restore();
    }
  }, [f, code, inSeg, seg, segs]);

  const X0 = 10, SWD = 500;
  let x = X0;
  const pc = PHASES[phase];
  const cycleS = total / 60;
  return (
    <FigureLayout
      side={
        <>
          <Slider label="golem health" value={hp} min={0} max={MAXHP} step={1} onChange={setHp} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Btn onClick={() => setHp(hp - 6)}>hit -5%</Btn>
            <Btn onClick={() => setHp(hp - 90)}>big hit -75%</Btn>
            <Btn onClick={() => setHp(hp + 24)}>heal +20%</Btn>
            <Btn
              onClick={() => {
                setHpRaw(MAXHP);
                setPhase(0);
                setLog(['reset: phase 0 applied in _ready()']);
              }}
            >
              reset
            </Btn>
          </div>
          <Readout
            rows={[
              ['\\text{health}', `${hp}/${MAXHP} (${Math.round((hp / MAXHP) * 100)}%)`],
              ['\\text{phase}', `${phase}`],
              ['\\text{wind-up}', `${pc.windup} f (${Math.round((pc.windup * 1000) / 60)} ms)`],
              ['\\text{cycle}', `${cycleS.toFixed(2)} s`],
              ['\\text{opening}', `${Math.round(((pc.recover / total) * 100))}% of the cycle`],
            ]}
          />
        </>
      }
      below={
        <div className="arch-log">
          {log.map((l, k) => (
            <div key={k} className={l.includes('phase_changed') ? 'sig' : 'muted'}>
              {l}
            </div>
          ))}
        </div>
      }
    >
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
        <canvas ref={cv} width={120} height={64} style={{ width: '100%', maxWidth: 360, imageRendering: 'pixelated', borderRadius: 4 }} aria-label="the golem playing its current attack cycle" />
        <svg className="arch-diagram" viewBox="0 0 520 132" role="img" aria-label="health thresholds and attack cycle">
          {/* health bar with thresholds */}
          <text x={X0} y={12} className="arch-small">health</text>
          <rect x={X0} y={18} width={SWD} height={12} rx={3} fill="var(--surface2)" stroke="var(--line)" />
          <rect x={X0} y={18} width={(SWD * hp) / MAXHP} height={12} rx={3} fill="var(--c-w)" opacity={0.8} />
          {PHASES.slice(1).map((p, k) => (
            <g key={k}>
              <line x1={X0 + SWD * p.at} x2={X0 + SWD * p.at} y1={14} y2={34} stroke="var(--fg)" strokeWidth={2} />
              <text x={X0 + SWD * p.at} y={46} textAnchor="middle" className="arch-small">
                phase {k + 1} at {Math.round(p.at * 100)}%
              </text>
            </g>
          ))}
          {/* one attack cycle of the current phase */}
          <text x={X0} y={70} className="arch-small">phase {phase}: one attack cycle ({total} frames)</text>
          {segs.map(([c, n], k) => {
            const w = (SWD * n) / total;
            const el = <rect key={k} x={x} y={76} width={Math.max(1, w - 1)} height={22} fill={PHASE_COL[c]} opacity={k === seg ? 1 : 0.7} />;
            x += w;
            return el;
          })}
          <line x1={X0 + (SWD * f) / total} x2={X0 + (SWD * f) / total} y1={72} y2={102} stroke="var(--fg)" strokeWidth={2} />
          <text x={X0} y={118} className="arch-small">amber: wind-up (telegraph) · red: slam · blue: recover (the player's opening)</text>
        </svg>
      </div>
    </FigureLayout>
  );
}
