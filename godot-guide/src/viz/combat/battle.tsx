// combat.battle: a playable mini battle (the k03-k05 showpiece). The rules live in battleSim.ts,
// whose classes mirror the lessons' GDScript (AtbGauge, StaggerComponent, AbilityRunner,
// PartyManager, AIController). This file only reads input, draws, and plays sounds.
//   mode 'atb'     Kai and a training dummy: ATB from hits, tactical mode, Braver
//   mode 'stagger' Kai against a skeleton: pressure, stagger and the damage multiplier
//   mode 'party'   Kai, Lyra and Bram: switching, commanding allies, synergy
//   mode 'full'    the whole loop with a golem wave and limit breaks
import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, rect, playSound, SHEETS, sheetCanvas, type Input, type GameApi } from '../game';
import { Slider, Readout, FigureLayout, Btn } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { BattleSim, ARENA, type BattleMode, type Character, type Enemy, type Unit, type Tuning, CHARACTERS } from './battleSim';
import { PAL, sprite, oneShotT, panel, gauge, stext, floor, shadow, effect } from './combatDraw';
import './combat.css';

const W = 320, H = 180;
const MODES: BattleMode[] = ['atb', 'stagger', 'party', 'full'];
export const isBattleMode = (m: unknown): m is BattleMode => typeof m === 'string' && (MODES as string[]).includes(m);

const FLOAT_COLORS: Record<string, string> = { white: PAL.white, weak: PAL.weak, stagger: PAL.stagger, heal: PAL.heal, grey: PAL.grey, hurt: PAL.hurt, mp: PAL.mp };

// ------------------------------------------------------------------------------------ drawing
function charAnim(c: Character): { anim: string; t: number; fallback: string } {
  const f = c.facing;
  switch (c.state) {
    case 'ko':
      return { anim: 'ko', t: c.stateT, fallback: 'idle_' + f };
    case 'hurt':
      return { anim: 'hurt', t: c.stateT, fallback: 'idle_' + f };
    case 'guard':
      return { anim: 'guard', t: c.stateT, fallback: 'idle_' + f };
    case 'dodge':
      return { anim: 'dash_' + f, t: c.stateT, fallback: 'walk_' + f };
    case 'attack': {
      const d = c.def;
      const len = d.startup + d.active + d.recovery * (c.combo_step === d.combo - 1 ? 1.6 : 1);
      const anim = d.ranged ? 'cast' : 'attack_' + f;
      return { anim, t: oneShotT(d.sheet, anim, c.stateT, len), fallback: 'idle_' + f };
    }
    case 'ability': {
      const r = c.running;
      if (!r || r.phase === 'approach') return { anim: 'walk_' + f, t: c.anim_t, fallback: 'idle_' + f };
      const a = r.cmd.ability;
      const anim = a.animation === 'attack' ? 'attack_' + f : a.animation === 'guard' ? 'guard' : 'cast';
      return { anim, t: r.phase === 'windup' ? oneShotT(c.def.sheet, anim, r.t, a.cast_time + 0.3) : oneShotT(c.def.sheet, anim, a.cast_time + r.t, a.cast_time + 0.3), fallback: 'idle_' + f };
    }
    default:
      return { anim: (Math.hypot(c.vx, c.vy) > 5 ? 'walk_' : 'idle_') + f, t: c.anim_t, fallback: 'idle_down' };
  }
}

function enemyAnim(e: Enemy): { anim: string; t: number } {
  const staggered = e.stagger?.state === 'staggered';
  if (e.type === 'slime') {
    if (e.state === 'dead') return { anim: 'die', t: e.dead_t };
    if (e.state === 'hurt' || staggered) return { anim: 'hurt', t: e.stateT };
    if (e.state === 'idle' || e.state === 'recover') return { anim: 'idle', t: e.anim_t };
    return { anim: 'hop', t: e.anim_t };
  }
  if (e.type === 'skeleton') {
    if (e.state === 'dead') return { anim: 'die', t: e.dead_t };
    if (e.state === 'hurt' || staggered) return { anim: 'hurt', t: staggered ? 0.05 : e.stateT };
    if (e.state === 'windup') return { anim: 'windup', t: oneShotT('skeleton', 'windup', e.stateT, e.windup) };
    if (e.state === 'attack') return { anim: 'attack', t: oneShotT('skeleton', 'attack', e.stateT, e.active + 0.15) };
    if (e.state === 'move') return { anim: 'walk', t: e.anim_t };
    return { anim: 'idle', t: e.anim_t };
  }
  // golem
  if (staggered) return { anim: 'stagger', t: e.anim_t };
  if (e.state === 'dead' || e.state === 'hurt') return { anim: 'hurt', t: e.stateT };
  if (e.state === 'windup') return { anim: 'windup', t: oneShotT('golem', 'windup', e.stateT, e.windup) };
  if (e.state === 'attack' || e.state === 'recover') return { anim: 'slam', t: oneShotT('golem', 'slam', e.state === 'attack' ? e.stateT : e.active + e.stateT, e.active + e.recover) };
  if (e.state === 'move') return { anim: 'walk', t: e.anim_t };
  return { anim: 'idle', t: e.anim_t };
}

function drawDummy(ctx: CanvasRenderingContext2D, e: Enemy) {
  const wob = e.state === 'hurt' ? Math.sin(e.stateT * 40) * 2 * (1 - e.stateT / 0.2) : 0;
  rect(ctx, e.x - 1, e.y - 10, 3, 10, '#6b4a2e');
  rect(ctx, e.x - 6, e.y - 4, 13, 2, '#6b4a2e');
  rect(ctx, e.x - 5 + wob, e.y - 22, 11, 13, e.flash > 0.5 ? '#ffffff' : '#c9a66b');
  rect(ctx, e.x - 5 + wob, e.y - 17, 11, 1, '#8c6b3c');
  rect(ctx, e.x - 3 + wob, e.y - 27, 7, 6, e.flash > 0.5 ? '#ffffff' : '#c9a66b');
}

const ENEMY_SIZE: Record<string, [number, number]> = { slime: [12, 9], skeleton: [10, 20], golem: [24, 28] };
const ENEMY_COLOR: Record<string, string> = { slime: '#58b86a', skeleton: '#d8d4c4', golem: '#8c8478' };

function drawWorld(ctx: CanvasRenderingContext2D, sim: BattleSim, time: number) {
  floor(ctx, 0, 16, W, ARENA.y1 + 8);
  // arena bounds: the battle happens in the field, inside walls that close when it starts
  rect(ctx, 0, 0, W, 18, '#1b1925');
  rect(ctx, 0, 18, W, 4, '#2c2a3a');
  rect(ctx, 0, 0, 6, H, '#1b1925');
  rect(ctx, W - 6, 0, 6, H, '#1b1925');
  ctx.strokeStyle = 'rgba(255,214,90,0.35)';
  ctx.setLineDash([2, 3]);
  ctx.strokeRect(ARENA.x0 - 4.5, ARENA.y0 - 8.5, ARENA.x1 - ARENA.x0 + 8, ARENA.y1 - ARENA.y0 + 12);
  ctx.setLineDash([]);

  // telegraphs under the units
  for (const e of sim.enemies) {
    if (e.state !== 'windup') continue;
    const k = Math.min(1, e.stateT / e.windup);
    if (e.type === 'golem') {
      ctx.fillStyle = `rgba(255,70,60,${(0.12 + 0.2 * k).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(e.aim_x, e.aim_y, e.reach, e.reach * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,90,70,0.9)';
      ctx.beginPath();
      ctx.ellipse(e.aim_x, e.aim_y, e.reach * k, e.reach * 0.6 * k, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (e.type === 'skeleton') {
      ctx.fillStyle = `rgba(255,70,60,${(0.15 + 0.25 * k).toFixed(2)})`;
      ctx.beginPath();
      ctx.ellipse(e.x + e.facing_x * 12, e.y, 12, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // y-sorted units
  const units: Unit[] = [...sim.party.members, ...sim.enemies].sort((a, b) => a.y - b.y);
  const leader = sim.leader;
  const lock = leader.target;
  for (const u of units) {
    if (u.kind === 'party') {
      const c = u;
      shadow(ctx, c.x, c.y, 12);
      const { anim, t, fallback } = charAnim(c);
      const blink = c.iframes > 0 && c.state === 'dodge' ? 0.55 : 1;
      sprite(ctx, c.def.sheet, anim, t, c.x, c.y, { flip: c.flip, flash: c.flash, alpha: c.state === 'ko' ? 0.6 : blink, color: c.def.color, fallbackAnim: fallback });
      if (c.state === 'guard') {
        ctx.strokeStyle = 'rgba(127,196,255,0.8)';
        ctx.beginPath();
        ctx.arc(c.x, c.y - 10, 11, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (c === leader && c.state !== 'ko') {
        // the controlled character
        const by = c.y - 30 + Math.round(Math.sin(time * 6));
        rect(ctx, c.x - 2, by, 5, 1, PAL.weak);
        rect(ctx, c.x - 1, by + 1, 3, 1, PAL.weak);
        rect(ctx, c.x, by + 2, 1, 1, PAL.weak);
      }
      const cmd = c.running?.cmd ?? c.queue[0];
      if (cmd && c.state !== 'ko') stext(ctx, cmd.ability.name, c.x, c.y - 34, c.running?.phase === 'windup' ? PAL.white : PAL.atb, 'center');
    } else {
      const e = u;
      const alpha = e.state === 'dead' ? Math.max(0, 1 - e.dead_t / 0.7) : 1;
      const [sw] = ENEMY_SIZE[e.type] ?? [12, 12];
      if (e.state !== 'dead') shadow(ctx, e.x, e.y, sw + 2);
      if (e.type === 'dummy') drawDummy(ctx, e);
      else {
        const { anim, t } = enemyAnim(e);
        const shakeX = e.state === 'windup' ? Math.round(Math.sin(e.stateT * 50)) : 0;
        sprite(ctx, e.sheet, anim, t, e.x + shakeX, e.y, { flip: e.flip, flash: e.flash, alpha, color: ENEMY_COLOR[e.type], size: ENEMY_SIZE[e.type], fallbackAnim: 'idle' });
      }
      if (e.state === 'windup') stext(ctx, '!', e.x, e.y - (ENEMY_SIZE[e.type]?.[1] ?? 16) - 10, PAL.hurt, 'center');
      if (e.stagger?.state === 'staggered') {
        const top = e.y - (ENEMY_SIZE[e.type]?.[1] ?? 16) - 6;
        if (SHEETS['fx_stagger']) effect(ctx, 'fx_stagger', time % 0.6, 0.6, e.x, top);
        else
          for (let k = 0; k < 3; k++) {
            const a = time * 5 + (k * Math.PI * 2) / 3;
            rect(ctx, e.x + Math.cos(a) * 8 - 1, top + Math.sin(a) * 2 - 1, 2, 2, PAL.weak);
          }
      }
      if (e === lock && e.state !== 'dead') {
        // lock-on brackets
        const hw = sw / 2 + 4, y0 = e.y - (ENEMY_SIZE[e.type]?.[1] ?? 16) - 3, y1 = e.y + 3;
        const col = 'rgba(255,214,90,0.9)';
        for (const [x, y, dx, dy] of [
          [e.x - hw, y0, 1, 1],
          [e.x + hw, y0, -1, 1],
          [e.x - hw, y1, 1, -1],
          [e.x + hw, y1, -1, -1],
        ] as const) {
          rect(ctx, Math.min(x, x + dx * 3), y, 3, 1, col);
          rect(ctx, x, Math.min(y, y + dy * 3), 1, 3, col);
        }
      }
    }
  }
  // projectiles
  for (const p of sim.projectiles) {
    rect(ctx, p.x - 2, p.y - 2, 4, 4, 'rgba(201,166,255,0.5)');
    rect(ctx, p.x - 1, p.y - 1, 2, 2, '#f2e6ff');
  }
  for (const f of sim.fx) effect(ctx, f.sheet, f.t, f.life, f.x, f.y);
  // small HP and stagger bars over enemies
  for (const e of sim.enemies) {
    if (e.state === 'dead' || e.type === 'dummy') continue;
    const top = e.y - (ENEMY_SIZE[e.type]?.[1] ?? 16) - 6;
    const bw = e.type === 'golem' ? 28 : 18;
    rect(ctx, e.x - bw / 2 - 1, top - 1, bw + 2, 5, PAL.ink);
    rect(ctx, e.x - bw / 2, top, bw * (e.health.health / e.health.max_health), 2, '#5ccf5c');
    if (e.stagger) {
      const s = e.stagger;
      const col = s.state === 'staggered' ? '#ff5a3d' : s.state === 'pressured' ? (Math.floor(time * 8) % 2 ? PAL.weak : PAL.stagger) : PAL.stagger;
      rect(ctx, e.x - bw / 2, top + 2, bw * (s.value / s.stagger_max), 1, col);
    }
  }
  // damage numbers
  for (const f of sim.floaters) {
    const y = f.y - Math.min(1, f.t / 0.5) * 10;
    if (f.t > 0.85 && Math.floor(f.t * 20) % 2) continue;
    stext(ctx, f.text, f.x, y, FLOAT_COLORS[f.color], 'center');
  }
}

function drawAtbSegments(ctx: CanvasRenderingContext2D, c: Character, x: number, y: number, segW: number, time: number) {
  const g = c.atb;
  for (let s = 0; s < g.max_segments; s++) {
    const frac = (g.value - s * g.segment_size) / g.segment_size;
    const full = frac >= 1;
    gauge(ctx, x + s * (segW + 2), y, segW, frac, full ? 'atb_full' : 'atb', full && Math.floor(time * 4) % 2 ? '#ffffff' : undefined);
  }
}

function drawHud(ctx: CanvasRenderingContext2D, sim: BattleSim, time: number) {
  const members = sim.party.members;
  const single = members.length === 1;
  // party panels
  const y = 144;
  const colW = single ? W - 4 : Math.floor((W - 4) / members.length);
  members.forEach((c, i) => {
    const x = 2 + i * colW;
    panel(ctx, x, y, colW - 2, 34);
    const lead = c === sim.leader;
    const ko = c.state === 'ko';
    stext(ctx, (lead ? '>' : ' ') + c.name, x + 4, y + 10, ko ? PAL.hurt : lead ? PAL.weak : PAL.white);
    stext(ctx, `${c.health.health}`, single ? 150 : x + colW - 8, y + 10, c.health.health < c.def.max_hp * 0.3 ? PAL.hurt : PAL.white, 'right');
    if (single) {
      gauge(ctx, 40, y + 5, 88, c.health.health / c.def.max_hp, 'hp');
      stext(ctx, 'ATB', 156, y + 10, PAL.atb);
      drawAtbSegments(ctx, c, 178, y + 5, 46, time);
      stext(ctx, `${Math.floor(c.atb.value)}/${c.atb.maximum}`, W - 7, y + 10, PAL.atb, 'right');
      gauge(ctx, 40, y + 14, 56, c.mp / c.def.max_mp, 'mp');
      stext(ctx, `MP ${c.mp}`, 100, y + 19, PAL.mp);
      const cmd = c.running?.cmd ?? c.queue[0];
      stext(ctx, cmd ? `> ${cmd.ability.name}` : c.last_seg_time ? `last segment ${c.last_seg_time.toFixed(1)} s` : 'segment: attack to fill', 156, y + 19, cmd ? PAL.white : PAL.dim);
      stext(ctx, sim.mode === 'atb' ? 'Hits fill ATB. L: tactical mode' : 'Build stagger, then spend ATB', 6, y + 29, PAL.dim);
    } else {
      gauge(ctx, x + 4, y + 13, colW - 10, c.health.health / c.def.max_hp, 'hp');
      drawAtbSegments(ctx, c, x + 4, y + 20, Math.floor((colW - 36) / 2), time);
      stext(ctx, `${c.mp}`, x + colW - 8, y + 25, PAL.mp, 'right');
      if (sim.limit_enabled) {
        const full = c.limit >= 100;
        rect(ctx, x + 4, y + 28, colW - 10, 2, PAL.ink);
        rect(ctx, x + 4, y + 28, (colW - 10) * (c.limit / 100), 2, full ? (Math.floor(time * 6) % 2 ? '#ffffff' : PAL.weak) : '#d9a640');
      }
    }
  });

  // target panel (top left): the leader's lock-on target
  const t = sim.leader.target ?? sim.aliveEnemies()[0];
  if (t) {
    if (t.type === 'dummy') {
      stext(ctx, 'Training dummy', 6, 11, PAL.white);
    } else {
      stext(ctx, t.name, 6, 11, PAL.white);
      gauge(ctx, 60, 4, 70, t.health.health / t.health.max_health, 'hp');
      stext(ctx, `${t.health.health}`, 160, 11, PAL.white, 'right');
      if (t.stagger) {
        const s = t.stagger;
        gauge(ctx, 166, 4, 60, s.value / s.stagger_max, 'stagger', s.state === 'staggered' ? '#ff4030' : undefined);
        const label = s.state === 'staggered' ? `STAGGER x${s.damage_multiplier.toFixed(2)} ${s.timer.toFixed(1)}` : s.state === 'pressured' ? `PRESSURED ${s.timer.toFixed(1)}` : `${Math.round((100 * s.value) / s.stagger_max)}%`;
        stext(ctx, label, 230, 11, s.state === 'staggered' ? PAL.stagger : s.state === 'pressured' ? PAL.weak : PAL.grey);
      }
    }
  }
  // clock and wave
  if (sim.menu) return;
  const secs = Math.floor(sim.clock);
  stext(ctx, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, W - 6, 26 + 4, PAL.dim, 'right');
  if (sim.waves.length > 1) stext(ctx, `wave ${sim.wave}/${sim.waves.length}`, 8, 30, PAL.dim);
}

function drawMenu(ctx: CanvasRenderingContext2D, sim: BattleSim, time: number) {
  const m = sim.menu;
  if (!m) return;
  // slowed time: tint the battlefield
  ctx.fillStyle = 'rgba(24,36,92,0.38)';
  ctx.fillRect(0, 0, W, 142);
  const who = sim.party.members[m.who];
  const x = 6, y = 34, w = 134;
  const h = 18 + m.entries.length * 9 + 4;
  panel(ctx, x, y, w, h);
  const multi = sim.party.members.length > 1;
  stext(ctx, multi ? `<${who.name}>` : who.name, x + 6, y + 11, PAL.weak);
  drawAtbSegments(ctx, who, x + 62, y + 5, 30, time);
  m.entries.forEach((e, i) => {
    const ey = y + 22 + i * 9;
    const sel = i === m.cursor;
    if (sel) {
      rect(ctx, x + 4, ey - 7, w - 8, 9, m.level === 'command' ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)');
      if (m.level === 'command') stext(ctx, '>', x + 6 + (Math.floor(time * 4) % 2), ey, PAL.white);
    }
    const col = !e.enabled ? PAL.dim : e.ability.limit ? PAL.weak : PAL.white;
    stext(ctx, e.ability.name, x + 14, ey, col);
    // cost: ATB pips, MP, item count
    const a = e.ability;
    let rx = x + w - 6;
    if (e.count !== undefined) {
      stext(ctx, `x${e.count}`, rx, ey, col, 'right');
      rx -= 20;
    }
    for (let k = 0; k < a.atb_cost; k++) {
      rx -= 6;
      rect(ctx, rx, ey - 5, 5, 4, who.atb.segments() > k ? PAL.atb : '#3a3850');
    }
    if (a.mp_cost) stext(ctx, `${a.mp_cost}`, rx - 2, ey, who.mp >= a.mp_cost ? PAL.mp : PAL.dim, 'right');
  });
  // info line
  const e = m.entries[m.cursor];
  let info = e ? `${e.ability.name}: ${e.ability.info}` : '';
  if (m.level === 'target') {
    const t = m.targets[m.target_cursor];
    info = `Target: ${t ? t.name : '-'}   J: confirm  K: back`;
    if (t) {
      const top = t.kind === 'enemy' ? t.y - (ENEMY_SIZE[t.type]?.[1] ?? 24) - 14 : t.y - 40;
      const bob = Math.floor(time * 4) % 2;
      if (SHEETS['ui_cursor']) {
        ctx.save();
        ctx.translate(Math.round(t.x + 4), Math.round(top + bob));
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(sheetCanvasSafe(), 0, 0, 8, 8, 0, 0, 8, 8);
        ctx.restore();
      } else {
        rect(ctx, t.x - 3, top + bob, 7, 2, PAL.weak);
        rect(ctx, t.x - 2, top + bob + 2, 5, 1, PAL.weak);
        rect(ctx, t.x - 1, top + bob + 3, 3, 1, PAL.weak);
      }
    }
  }
  if (m.message_t > 0) info = m.message;
  panel(ctx, 2, 0, W - 4, 22, 0.95);
  stext(ctx, info, 8, 12, m.message_t > 0 ? PAL.hurt : PAL.white);
  stext(ctx, 'TACTICAL  time x0.1', W - 8, 20 + 10, PAL.atb, 'right');
}

const sheetCanvasSafe = () => sheetCanvas('ui_cursor');

function drawBanner(ctx: CanvasRenderingContext2D, sim: BattleSim) {
  if (sim.banner_t <= 0 || !sim.banner) return;
  const final = sim.outcome !== 'fighting';
  ctx.fillStyle = 'rgba(10,8,20,0.7)';
  ctx.fillRect(0, 64, W, final ? 30 : 16);
  stext(ctx, sim.banner, W / 2, 76, sim.outcome === 'defeat' ? PAL.hurt : PAL.weak, 'center');
  if (final) stext(ctx, sim.outcome_t > 1 ? `time ${sim.clock.toFixed(1)} s   J: fight again` : '', W / 2, 88, PAL.white, 'center');
}

// ------------------------------------------------------------------------------------ the figure
export function BattleFigure({ spec }: { spec: VizSpec }) {
  const mode: BattleMode = isBattleMode(spec.mode) ? spec.mode : 'full';
  const [tuning, setTuning] = useState<Tuning>({});
  const sim = useMemo(() => new BattleSim(mode, 7), [mode]);
  const wrap = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const focused = useRef(false);
  const frame = useRef(0);
  const [, setTick] = useState(0);

  const applyTuning = (t: Tuning) => {
    setTuning(t);
    sim.tuning = t;
    for (const c of sim.party.members) c.atb.passive_rate = t.passive_rate ?? c.def.passive_rate;
    for (const e of sim.enemies)
      if (e.stagger) {
        if (t.stagger_max !== undefined) e.stagger.stagger_max = t.stagger_max;
        if (t.pressured_gain !== undefined) e.stagger.pressured_gain = t.pressured_gain;
        if (t.base_multiplier !== undefined) e.stagger.base_multiplier = t.base_multiplier;
      }
  };

  const update = (dt: number, input: Input) => {
    focused.current = !!wrap.current && wrap.current.contains(document.activeElement);
    if (!focused.current) return; // the battle waits while the figure is not focused
    if (!started.current) {
      const any = (['attack', 'dash', 'tactical', 'switch', 'ability', 'up', 'down', 'left', 'right'] as const).some((a) => input.justPressed(a));
      if (!any) return;
      started.current = true;
    }
    sim.update(dt, input);
    if (sim.sounds.length) {
      // at most two sounds per frame, so a flurry of hits does not stack up
      const uniq = [...new Set(sim.sounds)].slice(0, 2);
      for (const s of uniq) playSound(s, s.startsWith('sfx_menu') ? 0.35 : 0.5);
      sim.sounds.length = 0;
    }
    if (++frame.current % 10 === 0) setTick((n) => n + 1);
  };

  const draw = (ctx: CanvasRenderingContext2D, api: GameApi) => {
    const time = api.time;
    ctx.save();
    if (sim.shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * sim.shake * 2), Math.round((Math.random() - 0.5) * sim.shake * 2));
    drawWorld(ctx, sim, time);
    ctx.restore();
    drawHud(ctx, sim, time);
    drawMenu(ctx, sim, time);
    drawBanner(ctx, sim);
    if (!started.current) {
      ctx.fillStyle = 'rgba(10,8,20,0.55)';
      ctx.fillRect(0, 70, W, 26);
      stext(ctx, focused.current ? 'Press J to begin' : 'Click, then press J to begin', W / 2, 82, PAL.white, 'center');
      stext(ctx, 'J attack  K dodge  L tactical' + (sim.party.members.length > 1 ? '  Q switch' : ''), W / 2, 92, PAL.grey, 'center');
    } else if (!focused.current && sim.outcome === 'fighting') {
      ctx.fillStyle = 'rgba(10,8,20,0.55)';
      ctx.fillRect(0, 70, W, 18);
      stext(ctx, 'Paused: click to resume', W / 2, 82, PAL.white, 'center');
    }
  };

  const keys: [string, string][] = [
    ['WASD / arrows', 'move'],
    ['J / Z', 'attack'],
    ['K / X', 'dodge'],
    ['E / C hold', 'guard'],
    ['L / Tab', 'tactical'],
    ...(mode === 'party' || mode === 'full' ? ([['Q', 'switch']] as [string, string][]) : []),
  ];
  const menuKeys: [string, string][] = [
    ['↑↓', 'choose'],
    ...(mode === 'party' || mode === 'full' ? ([['←→ / Q', 'character']] as [string, string][]) : []),
    ['J', 'confirm'],
    ['K', 'back'],
  ];

  const kai = sim.party.members[0];
  const leader = sim.leader;
  const target = leader.target ?? sim.aliveEnemies()[0];
  const st = target?.stagger;

  const canvas = (
    <div ref={wrap} className="combat-battle">
      <GameCanvas
        width={W}
        height={H}
        update={update}
        draw={draw}
        touchButtons={['up', 'down', 'left', 'right', 'attack', 'dash', 'ability', 'tactical', ...(mode === 'party' || mode === 'full' ? (['switch'] as const) : [])]}
        keysHint={
          <span className="combat-keys">
            <Keys items={keys} />
            <span className="combat-keys-menu">
              in tactical mode: <Keys items={menuKeys} />
            </span>
          </span>
        }
        prompt="Click to play"
        label={`mini battle (${mode}): move with WASD or arrows, J attack, K dodge, E guard, L tactical mode${mode === 'party' || mode === 'full' ? ', Q switch character' : ''}`}
      />
      <div className="combat-row">
        <Btn onClick={() => sim.reset()}>Restart</Btn>
        <span className="combat-muted">{sim.outcome === 'fighting' ? `battle time ${sim.clock.toFixed(1)} s` : sim.outcome === 'victory' ? `won in ${sim.clock.toFixed(1)} s` : 'defeated'}</span>
      </div>
    </div>
  );

  if (mode === 'full') return canvas;

  let side: ReactNode = null;
  let below: ReactNode = null;
  if (mode === 'atb') {
    const perHit = tuning.atb_per_hit ?? CHARACTERS.kai.atb_per_hit;
    const passive = tuning.passive_rate ?? CHARACTERS.kai.passive_rate;
    side = (
      <>
        <Slider label="atb_per_hit" value={perHit} min={2} max={40} step={1} onChange={(v) => applyTuning({ ...tuning, atb_per_hit: v })} fmt={(v) => v.toFixed(0)} />
        <Slider label="passive_rate (per s)" value={passive} min={0} max={20} step={0.5} onChange={(v) => applyTuning({ ...tuning, passive_rate: v })} fmt={(v) => v.toFixed(1)} />
        <Readout
          rows={[
            ['\\text{value}', `${kai.atb.value.toFixed(0)} / ${kai.atb.maximum}`],
            ['\\text{segments()}', String(kai.atb.segments())],
            ['\\text{from hits}', kai.atb_from_hits.toFixed(0)],
            ['\\text{from passive}', kai.atb_from_passive.toFixed(0)],
            ['\\text{last segment took}', kai.last_seg_time ? `${kai.last_seg_time.toFixed(1)} s` : '–'],
            ['\\text{passive only}', passive > 0 ? `${(100 / passive).toFixed(0)} s per segment` : 'never'],
          ]}
        />
      </>
    );
    below = (
      <CodeBlock
        compact
        file="scripts/components/atb_gauge.gd (tuning)"
        code={`@export var segment_size := 100.0
@export var max_segments := 2
@export var passive_rate := ${passive.toFixed(1)}
# Kai's hit handler: atb.add(atb_per_hit) with atb_per_hit = ${perHit.toFixed(1)}`}
      />
    );
  } else if (mode === 'stagger') {
    const sm = tuning.stagger_max ?? 100;
    const pg = tuning.pressured_gain ?? 2;
    const bm = tuning.base_multiplier ?? 1.6;
    side = (
      <>
        <Slider label="stagger_max" value={sm} min={40} max={200} step={5} onChange={(v) => applyTuning({ ...tuning, stagger_max: v })} fmt={(v) => v.toFixed(0)} />
        <Slider label="pressured_gain" value={pg} min={1} max={4} step={0.25} onChange={(v) => applyTuning({ ...tuning, pressured_gain: v })} fmt={(v) => '×' + v.toFixed(2)} />
        <Slider label="base_multiplier" value={bm} min={1} max={3} step={0.1} onChange={(v) => applyTuning({ ...tuning, base_multiplier: v })} fmt={(v) => '×' + v.toFixed(1)} />
        <Readout
          rows={[
            ['\\text{state}', st ? st.state : '–'],
            ['\\text{value}', st ? `${st.value.toFixed(0)} / ${st.stagger_max}` : '–'],
            ['\\text{timer}', st && st.state !== 'normal' ? `${st.timer.toFixed(1)} s` : '–'],
            ['\\text{damage\\_multiplier}', st ? '×' + st.damage_multiplier.toFixed(2) : '–'],
            ['\\text{enemy HP}', target ? `${target.health.health}` : '–'],
          ]}
        />
      </>
    );
    below = (
      <CodeBlock
        compact
        file="scripts/components/stagger_component.gd (tuning)"
        code={`@export var stagger_max := ${sm.toFixed(1)}
@export var pressured_gain := ${pg.toFixed(2)}
@export var base_multiplier := ${bm.toFixed(2)}
@export var stagger_duration := 6.0`}
      />
    );
  } else {
    side = (
      <>
        <Readout
          title="PartyManager"
          rows={[
            ['\\text{current\\_index}', `${sim.party.current_index} (${leader.name})`],
            ...sim.party.members.map(
              (m) =>
                [
                  `\\text{${m.name}}`,
                  `${m.controller === 'player' ? 'Player' : 'AI'} · ATB ${m.atb.segments()}/2${m.queue.length || m.running ? ' · ' + (m.running?.cmd ?? m.queue[0]).ability.name : ''}${m.state === 'ko' ? ' · KO' : ''}`,
                ] as [string, string],
            ),
            ['\\text{target stagger}', st ? (st.state === 'staggered' ? `×${st.damage_multiplier.toFixed(2)}` : `${Math.round((100 * st.value) / st.stagger_max)}% ${st.state}`) : '–'],
          ]}
        />
        <div className="combat-log">{sim.log.slice(-4).map((l, i) => <div key={i}>{l}</div>)}</div>
      </>
    );
  }

  return (
    <FigureLayout side={side} below={below}>
      {canvas}
    </FigureLayout>
  );
}

