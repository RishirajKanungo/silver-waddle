// combat.stagger: the StaggerComponent from battleSim.ts (the same class the battle uses), driven by
// buttons. Each button is a kind of hit; the state diagram, meter, timers, multiplier and a log show
// what apply_hit(), raise_multiplier() and tick() do. Time runs, so the meter decays and states expire.
import { useEffect, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Slider, Readout, FigureLayout, Btn } from '../kit';
import { StaggerComponent } from './battleSim';
import './combat.css';

interface HitKind {
  id: string;
  label: string;
  stagger: number;
  pressures: boolean;
  bonus: number;
  dmg: number;
  note: string;
}
const HITS: HitKind[] = [
  { id: 'basic', label: 'Kai hit', stagger: 3, pressures: false, bonus: 0, dmg: 7, note: 'basic hit' },
  { id: 'bram', label: 'Bram hit', stagger: 7, pressures: false, bonus: 0, dmg: 11, note: 'heavy basic hit' },
  { id: 'punish', label: 'Hit its windup', stagger: 3, pressures: true, bonus: 0, dmg: 7, note: 'punish: pressures' },
  { id: 'blizzard', label: 'Blizzard (weak)', stagger: 21, pressures: true, bonus: 0, dmg: 54, note: 'weakness: ×1.5, pressures' },
  { id: 'bash', label: 'Shield Bash', stagger: 22, pressures: true, bonus: 0.1, dmg: 20, note: 'pressures, +0.10 if staggered' },
  { id: 'focus', label: 'Focus Strike', stagger: 30, pressures: false, bonus: 0.25, dmg: 10, note: '+0.25 if staggered' },
  { id: 'braver', label: 'Braver', stagger: 14, pressures: false, bonus: 0, dmg: 28, note: 'big damage' },
];

export function StaggerLab({ spec }: { spec: VizSpec }) {
  const s = useRef(new StaggerComponent()).current;
  const [pressuredGain, setPG] = useState((spec.pressuredGain as number) ?? 2);
  const [duration, setDuration] = useState(6);
  const [decay, setDecay] = useState(8);
  const [log, setLog] = useState<string[]>([]);
  const hist = useRef<[number, number, string][]>([]).current; // [t, value, state]
  const clock = useRef(0);
  const [, setTick] = useState(0);
  s.pressured_gain = pressuredGain;
  s.stagger_duration = duration;
  s.decay_rate = decay;

  useEffect(() => {
    let raf = 0, last = performance.now(), n = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      s.tick(dt);
      clock.current += dt;
      hist.push([clock.current, s.value, s.state]);
      while (hist.length && hist[0][0] < clock.current - 15) hist.shift();
      if (++n % 3 === 0) setTick((k) => k + 1);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [s, hist]);

  const hit = (h: HitKind) => {
    const was = s.state;
    const mult = s.damage_multiplier;
    const gain = s.apply_hit(h.stagger, h.pressures);
    let line = `${h.label}: `;
    if (was === 'staggered') {
      if (h.bonus > 0) s.raise_multiplier(h.bonus);
      line += `no stagger gain (already staggered), ${Math.round(h.dmg * mult)} damage at ×${mult.toFixed(2)}`;
      if (h.bonus > 0) line += `, multiplier now ×${s.damage_multiplier.toFixed(2)}`;
    } else {
      line += `+${h.stagger}${Math.abs(gain - h.stagger) > 0.01 ? ` × ${(gain / h.stagger).toFixed(2)} (pressured)` : ''} = +${gain.toFixed(0)} stagger, ${h.dmg} damage`;
      if (s.state === 'staggered') line += `. STAGGERED: ×${s.damage_multiplier.toFixed(2)} for ${duration} s`;
      else if (was === 'normal' && s.state === 'pressured') line += '. Pressured';
    }
    setLog((l) => [...l.slice(-5), line]);
  };

  // state diagram geometry
  const Wd = 520, Hh = 250;
  const nodes = {
    normal: { x: 90, y: 60, label: 'NORMAL' },
    pressured: { x: 300, y: 60, label: 'PRESSURED' },
    staggered: { x: 195, y: 160, label: 'STAGGERED' },
  } as const;
  const col = (k: string) => (s.state === k ? (k === 'staggered' ? 'var(--bad)' : k === 'pressured' ? 'var(--warn)' : 'var(--accent)') : 'var(--line)');
  const meterW = 160;
  const plotX = 390, plotW = 120, plotY = 120, plotH = 90;

  return (
    <FigureLayout
      side={
        <>
          <div className="combat-btns">
            {HITS.map((h) => (
              <Btn key={h.id} onClick={() => hit(h)} title={h.note}>
                {h.label}
              </Btn>
            ))}
            <Btn onClick={() => { s.value = 0; s.state = 'normal'; s.damage_multiplier = 1; s.timer = 0; setLog([]); }}>Reset</Btn>
          </div>
          <Slider label="pressured_gain" value={pressuredGain} min={1} max={4} step={0.25} onChange={setPG} fmt={(v) => '×' + v.toFixed(2)} />
          <Slider label="stagger_duration (s)" value={duration} min={2} max={12} step={0.5} onChange={setDuration} fmt={(v) => v.toFixed(1)} />
          <Slider label="decay_rate (per s)" value={decay} min={0} max={30} step={1} onChange={setDecay} fmt={(v) => v.toFixed(0)} />
          <Readout
            rows={[
              ['\\text{state}', s.state],
              ['\\text{value}', `${s.value.toFixed(1)} / ${s.stagger_max}`],
              ['\\text{timer}', s.state === 'normal' ? '–' : `${s.timer.toFixed(1)} s`],
              ['\\text{since\\_hit}', s.since_hit > 60 ? '–' : `${s.since_hit.toFixed(1)} s ${s.since_hit > s.decay_delay && s.state !== 'staggered' && s.value > 0 ? '(decaying)' : ''}`],
              ['\\text{damage\\_multiplier}', '×' + s.damage_multiplier.toFixed(2)],
            ]}
          />
        </>
      }
      below={<div className="combat-log">{log.length ? log.map((l, i) => <div key={i}>{l}</div>) : <div>Press a hit button. Try three Kai hits, then Blizzard, then Bram hits.</div>}</div>}
    >
      <svg viewBox={`0 0 ${Wd} ${Hh}`} className="combat-svg" role="img" aria-label="stagger state machine and meter">
        <defs>
          <marker id="sl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--muted)" />
          </marker>
        </defs>
        {/* transitions */}
        <g stroke="var(--muted)" strokeWidth={1.4} fill="none" markerEnd="url(#sl-arrow)">
          <path d="M150,52 L236,52" />
          <path d="M236,70 L150,70" />
          <path d="M110,82 L170,136" />
          <path d="M290,82 L225,136" />
          <path d="M160,170 C80,180 60,120 78,86" />
        </g>
        <g fontSize={10.5} style={{ fill: 'var(--muted)' }}>
          <text x={193} y={44} textAnchor="middle">pressuring hit</text>
          <text x={193} y={86} textAnchor="middle">timer runs out</text>
          <text x={96} y={118} textAnchor="end">meter full</text>
          <text x={300} y={118}>meter full</text>
          <text x={40} y={190}>stagger_duration over:</text>
          <text x={40} y={203}>meter 0, ×1.00</text>
        </g>
        {(Object.keys(nodes) as (keyof typeof nodes)[]).map((k) => {
          const n = nodes[k];
          return (
            <g key={k}>
              <rect x={n.x - 58} y={n.y - 18} width={116} height={36} rx={8} fill="var(--surface)" stroke={col(k)} strokeWidth={s.state === k ? 3 : 1.2} />
              <text x={n.x} y={n.y + 1} fontSize={12.5} fontWeight={700} textAnchor="middle">
                {n.label}
              </text>
              <text x={n.x} y={n.y + 13} fontSize={10} textAnchor="middle" style={{ fill: 'var(--muted)' }}>
                {k === 'normal' ? 'gain ×1' : k === 'pressured' ? `gain ×${pressuredGain}` : `damage ×${s.damage_multiplier.toFixed(2)}`}
              </text>
            </g>
          );
        })}
        {/* meter */}
        <text x={115} y={226} fontSize={11} textAnchor="end">
          stagger meter
        </text>
        <rect x={120} y={216} width={meterW} height={12} rx={3} fill="var(--surface2)" stroke="var(--line)" />
        <rect x={120} y={216} width={(meterW * s.value) / s.stagger_max} height={12} rx={3} fill={s.state === 'staggered' ? 'var(--bad)' : s.state === 'pressured' ? 'var(--warn)' : 'var(--c-v)'} />
        <text x={120 + meterW + 6} y={226} fontSize={11}>
          {s.value.toFixed(0)}/{s.stagger_max}
        </text>
        {/* history plot: the last 15 s */}
        <text x={plotX} y={plotY - 8} fontSize={10.5} style={{ fill: 'var(--muted)' }}>
          meter, last 15 s
        </text>
        <rect x={plotX} y={plotY} width={plotW} height={plotH} fill="none" stroke="var(--line)" />
        <polyline
          fill="none"
          stroke="var(--c-v)"
          strokeWidth={1.6}
          points={hist.map(([t, v]) => `${(plotX + plotW - ((clock.current - t) / 15) * plotW).toFixed(1)},${(plotY + plotH - (v / s.stagger_max) * plotH).toFixed(1)}`).join(' ')}
        />
      </svg>
    </FigureLayout>
  );
}
