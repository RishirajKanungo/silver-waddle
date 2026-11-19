// rpg.hud_bars — the party HUD with a ghost HP bar and damage numbers (r05-3). Mirrors ui/member_row.gd:
//   set_hp(): hp_bar.value = current at once; kill the ghost tween; if dropped:
//             tween_interval(ghost_delay) then tween_property(hp_ghost, "value", current, ghost_duration) with an ease
//   and ui/damage_number.gd: rise 14 px over 0.6 s (quad out), fade in the last 40%.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { GameCanvas, Keys, theme, rect, text, playSound, drawFrame, SHEETS, type Input } from '../game';
import { Slider, Toggle, Readout, FigureLayout, SegControl, Btn } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { Rng } from '../../math/rng';
import { W, H, drawNine, drawBar, drawBarFrame, drawActor, drawGround } from './common';

type Ease = 'linear' | 'cubic' | 'expo';
const EASE: Record<Ease, (u: number) => number> = {
  linear: (u) => u,
  cubic: (u) => 1 - (1 - u) ** 3, // TRANS_CUBIC, EASE_OUT
  expo: (u) => (u >= 1 ? 1 : 1 - 2 ** (-10 * u)), // TRANS_EXPO, EASE_OUT
};
const EASE_GD: Record<Ease, string> = {
  linear: '.set_trans(Tween.TRANS_LINEAR)',
  cubic: '.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)',
  expo: '.set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_OUT)',
};
/** fraction of the duration until 90% of the drain is done */
const U90: Record<Ease, number> = { linear: 0.9, cubic: 1 - Math.cbrt(0.1), expo: Math.log2(10) / 10 };

interface Member {
  name: string;
  hp: number;
  max: number;
  mp: number;
  maxMp: number;
  atb: number;
  ghost: number;
  tween: { from: number; to: number; t: number } | null; // t: seconds since the tween started
}
interface Num {
  x: number;
  y: number;
  t: number;
  s: string;
  color: string;
}
const RISE = 14, LIFE = 0.6;

export function HudFigure(_: { spec: VizSpec }) {
  const [delay, setDelay] = useState(0.35);
  const [dur, setDur] = useState(0.45);
  const [ease, setEase] = useState<Ease>('cubic');
  const [ghostOn, setGhostOn] = useState(true);
  const [maxHp, setMaxHp] = useState(120);
  const P = useRef({ delay, dur, ease, ghostOn });
  P.current = { delay, dur, ease, ghostOn };
  const party = useRef<Member[]>([
    { name: 'Kai', hp: 120, max: 120, mp: 12, maxMp: 12, atb: 0.4, ghost: 120, tween: null },
    { name: 'Lyra', hp: 74, max: 80, mp: 30, maxMp: 34, atb: 1.2, ghost: 74, tween: null },
    { name: 'Bram', hp: 150, max: 160, mp: 6, maxMp: 8, atb: 0.8, ghost: 150, tween: null },
  ]).current;
  const kai = party[0];
  const nums = useRef<Num[]>([]).current;
  const hist = useRef<[number, number][]>([]).current; // [hp, ghost] per frame, last 3 s
  const rng = useRef(new Rng(7)).current;
  const clock = useRef(0);
  const hurt = useRef(0);
  const slimeT = useRef(-1); // time since the slime started its attack hop
  const req = useRef<'hit' | 'heal' | null>(null);
  const [, setTick] = useState(0);
  const frame = useRef(0);

  // keep Kai's max HP in sync with the slider (scale his current HP with it)
  if (kai.max !== maxHp) {
    const f = kai.hp / kai.max;
    kai.max = maxHp;
    kai.hp = kai.ghost = Math.round(f * maxHp);
    kai.tween = null;
  }

  /** member_row.gd set_hp() */
  const setHp = (m: Member, current: number) => {
    const dropped = current < m.hp;
    m.hp = current;
    m.tween = null; // _ghost_tween.kill()
    if (!dropped || !P.current.ghostOn) {
      m.ghost = current;
      return;
    }
    m.tween = { from: m.ghost, to: current, t: 0 };
  };

  const spawn = (amount: string, color: string) => nums.push({ x: 150, y: 120 - 30, t: 0, s: amount, color });

  const update = (dt: number, input: Input) => {
    clock.current += dt;
    if (input.justPressed('attack')) req.current = 'hit';
    if (input.justPressed('dash')) req.current = 'heal';
    if (req.current === 'hit' && slimeT.current < 0) slimeT.current = 0;
    if (req.current === 'heal') {
      const amt = Math.min(30, kai.max - kai.hp);
      setHp(kai, kai.hp + amt);
      spawn('+' + amt, '#a2d052');
      playSound('sfx_heal', 0.4);
    }
    req.current = null;
    // the slime hops at Kai; the hit lands 0.18 s into the hop
    if (slimeT.current >= 0) {
      const before = slimeT.current;
      slimeT.current += dt;
      if (before < 0.18 && slimeT.current >= 0.18) {
        const crit = rng.next() < 0.15;
        let dmg = rng.int(6, 18);
        if (crit) dmg = Math.round(dmg * 1.5);
        dmg = Math.min(dmg, kai.hp);
        setHp(kai, kai.hp - dmg);
        spawn(crit ? dmg + '!' : String(dmg), crit ? '#eebb3e' : '#fbf6e6');
        hurt.current = 0.2;
        playSound(crit ? 'sfx_crit' : 'sfx_hurt', 0.45);
      }
      if (slimeT.current > 0.4) slimeT.current = -1;
    }
    hurt.current = Math.max(0, hurt.current - dt);
    // ghost tweens: interval, then property tween
    for (const m of party) {
      if (!m.tween) continue;
      m.tween.t += dt;
      const { delay, dur, ease } = P.current;
      const u = Math.min(1, Math.max(0, (m.tween.t - delay) / Math.max(0.001, dur)));
      m.ghost = m.tween.from + (m.tween.to - m.tween.from) * EASE[ease](u);
      if (m.tween.t >= delay + dur) {
        m.ghost = m.tween.to;
        m.tween = null;
      }
    }
    // ATB fills slowly (k04 fills it from hits; here time alone keeps the bars alive)
    for (const m of party) {
      const before = m.atb;
      m.atb = Math.min(2, m.atb + dt * 0.12);
      if (Math.floor(m.atb) > Math.floor(before)) playSound('sfx_atb_ready', 0.25);
      if (m.atb >= 2) m.atb = 0.2;
    }
    for (const n of nums) n.t += dt;
    while (nums.length && nums[0].t > LIFE) nums.shift();
    hist.push([kai.hp / kai.max, kai.ghost / kai.max]);
    if (hist.length > 180) hist.shift();
    if (++frame.current % 5 === 0) setTick((x) => x + 1);
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const th = theme(ctx.canvas);
    const t = clock.current;
    drawGround(ctx);
    // world: Kai and a slime
    const st = slimeT.current;
    const sx = st >= 0 ? 196 - Math.sin(Math.min(1, st / 0.4) * Math.PI) * 26 : 196;
    drawActor(ctx, 'slime', st >= 0 ? 'hop' : 'idle', t, sx, 122, true, '#4f9e3e');
    drawActor(ctx, 'hero', hurt.current > 0 ? 'hurt' : 'idle_side', t, 150, 120, false, '#4c86d6');
    // damage numbers (world space, above Kai)
    for (const n of nums) {
      const u = n.t / LIFE;
      const rise = RISE * (1 - (1 - u) * (1 - u)); // quad out
      const alpha = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      text(ctx, n.s, Math.round(n.x), Math.round(n.y - rise), n.color, 'center');
      ctx.restore();
    }
    // HUD on its CanvasLayer: top-left panel with three rows
    drawNine(ctx, 2, 2, 212, 48);
    party.forEach((m, i) => {
      const y = 16 + i * 10;
      text(ctx, m.name, 9, y + 6, m === kai ? '#eebb3e' : '#fbf6e6');
      text(ctx, String(m.hp).padStart(3, ' '), 54, y + 6, m.hp * 4 < m.max ? '#f8925e' : '#fbf6e6', 'right');
      drawBarFrame(ctx, 58, y);
      if (P.current.ghostOn) drawBar(ctx, 'hp_fill', 58, y, 0, { widthPx: Math.floor((46 * m.ghost) / m.max), flashColor: '#f8925e' });
      drawBar(ctx, 'hp_fill', 58, y, 0, { widthPx: Math.floor((46 * m.hp) / m.max) });
      drawFrameOver(ctx, 58, y);
      drawBarFrame(ctx, 110, y);
      drawBar(ctx, 'mp_fill', 110, y, m.mp / m.maxMp);
      drawFrameOver(ctx, 110, y);
      drawBarFrame(ctx, 162, y);
      drawBar(ctx, m.atb >= 1 ? 'atb_full' : 'atb_fill', 162, y, m.atb / 2);
      drawFrameOver(ctx, 162, y);
      rect(ctx, 162 + 24, y, 1, 6, '#1a1424'); // segment divider
    });
    text(ctx, 'HP', 82, 12, '#c0bed4', 'center');
    text(ctx, 'MP', 134, 12, '#c0bed4', 'center');
    text(ctx, 'ATB', 186, 12, '#c0bed4', 'center');
    // plot: Kai's HP and ghost over the last 3 s
    const gx = 200, gy = 132, gw = 112, gh = 40;
    rect(ctx, gx - 2, gy - 10, gw + 4, gh + 12, 'rgba(0,0,0,0.55)');
    text(ctx, 'Kai HP, last 3 s', gx, gy - 2, '#c0bed4');
    // zoom the y axis to the range in view (rounded down to a tenth) so small hits are visible
    let lo = 1;
    for (const p of hist) lo = Math.min(lo, p[0]);
    lo = Math.max(0, Math.floor((lo - 0.05) * 10) / 10);
    const span = Math.max(0.1, 1 - lo);
    text(ctx, Math.round(lo * 100) + '%', gx + gw, gy + gh - 2, '#86829e', 'right');
    const line = (k: 0 | 1, color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      hist.forEach((p, i) => {
        const x = gx + (i / 179) * gw, y = gy + 2 + ((1 - p[k]) / span) * (gh - 4);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
    };
    if (P.current.ghostOn) line(1, '#f8925e');
    line(0, '#a2d052');
    void th;
  };

  const u90 = U90[ease];
  const code = useMemo(
    () => `@export var ghost_delay := ${delay.toFixed(2)}
@export var ghost_duration := ${dur.toFixed(2)}

func set_hp(current: int, maximum: int, instant: bool = false) -> void:
	hp_bar.max_value = maximum
	hp_ghost.max_value = maximum
	var dropped := current < hp_bar.value
	hp_bar.value = current
	if _ghost_tween:
		_ghost_tween.kill()
	if instant or not dropped:
		hp_ghost.value = current
		return
	_ghost_tween = create_tween()
	_ghost_tween.tween_interval(ghost_delay)
	_ghost_tween.tween_property(hp_ghost, "value", float(current), ghost_duration)\\
		${EASE_GD[ease]}
`,
    [delay, dur, ease],
  );

  return (
    <FigureLayout
      side={
        <>
          <Slider label="ghost_delay" value={delay} min={0} max={1} step={0.01} onChange={setDelay} fmt={(v) => v.toFixed(2) + ' s'} />
          <Slider label="ghost_duration" value={dur} min={0.05} max={1.5} step={0.01} onChange={setDur} fmt={(v) => v.toFixed(2) + ' s'} />
          <SegControl label="ease" value={ease} options={[{ v: 'linear', label: 'linear' }, { v: 'cubic', label: 'cubic out' }, { v: 'expo', label: 'expo out' }]} onChange={setEase} />
          <Slider label="Kai max HP" value={maxHp} min={60} max={300} step={4} onChange={setMaxHp} fmt={(v) => v.toFixed(0)} />
          <Toggle label="ghost bar" value={ghostOn} onChange={setGhostOn} />
          <div className="world-btnrow">
            <Btn onClick={() => (req.current = 'hit')}>Slime hit</Btn>
            <Btn onClick={() => (req.current = 'heal')}>Heal 30</Btn>
          </div>
          <Readout
            rows={[
              ['hp,\\ ghost', `${kai.hp}, ${kai.ghost.toFixed(1)}`],
              ['\\lfloor 46\\,hp/hp_{\\max} \\rfloor', `${Math.floor((46 * kai.hp) / kai.max)} px`],
              ['hp\\text{ per px}', (kai.max / 46).toFixed(2)],
              ['t_{90} = d + u_{90} D', `${(delay + u90 * dur).toFixed(2)} s`],
              ['\\text{tween ends}', `${(delay + dur).toFixed(2)} s`],
            ]}
          />
        </>
      }
      below={<CodeBlock code={code} file="ui/member_row.gd" compact />}
    >
      <GameCanvas
        width={W}
        height={H}
        update={update}
        draw={draw}
        touchButtons={['attack', 'dash']}
        keysHint={<Keys items={[['J', 'slime hits Kai'], ['K', 'heal 30']]} />}
        label="battle HUD: J makes the slime hit Kai, K heals; watch the ghost bar drain"
      />
    </FigureLayout>
  );
}

/** texture_over: the frame drawn on top of the fill */
function drawFrameOver(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawFrame(ctx, 'ui_bars', SHEETS['ui_bars']?.tiles?.frame ?? 6, x, y);
}
