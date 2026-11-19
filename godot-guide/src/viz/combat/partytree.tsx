// combat.party: what PartyManager.switch_to() does to the scene tree. Each Character has exactly one
// controller child: the PlayerController on the member you control, an AIController on the others.
// Switching moves those nodes, retargets the camera and emits leader_changed. KO'd members are skipped.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { FigureLayout, Btn, Toggle } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { useEffect, useRef } from 'react';
import { drawFrame, animFrame, SHEETS } from '../game';
import { PartyManager, BattleSim } from './battleSim';
import './combat.css';

const NAMES = ['Kai', 'Lyra', 'Bram'];
const SHEET = ['hero', 'mage', 'guard'];

function Portrait({ sheet, ko, lead }: { sheet: string; ko: boolean; lead: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const c = ref.current;
      if (!c) return;
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = false;
      const t = (performance.now() - t0) / 1000;
      if (SHEETS[sheet]) drawFrame(ctx, sheet, animFrame(sheet, ko ? 'ko' : lead ? 'walk_down' : 'idle_down', t), 0, 0, { scale: 1 });
      else {
        ctx.fillStyle = ko ? '#777' : '#88a';
        ctx.fillRect(10, 8, 12, 20);
      }
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [sheet, ko, lead]);
  return <canvas ref={ref} width={32} height={32} style={{ width: 48, height: 48, imageRendering: 'pixelated' }} aria-hidden="true" />;
}

export function PartyTree({ spec }: { spec: VizSpec }) {
  // reuse the battle's PartyManager class so the figure behaves exactly like the game
  const pm = useMemo(() => new PartyManager(new BattleSim('party').party.members), []);
  const [, setTick] = useState(0);
  const [events, setEvents] = useState<string[]>([]);
  const [ko, setKo] = useState<boolean[]>([false, false, false]);
  const [last, setLast] = useState<{ from: number; to: number } | null>(null);
  void spec;

  const log = (s: string) => setEvents((e) => [...e.slice(-4), s]);
  const doSwitch = (i: number) => {
    const from = pm.current_index;
    const ok = pm.switch_to(i);
    if (ok) {
      setLast({ from, to: i });
      log(`switch_to(${i}) → leader_changed(${NAMES[i]})`);
    } else log(`switch_to(${i}) refused: ${i === from ? 'already the leader' : NAMES[i] + ' is KO'}`);
    setTick((n) => n + 1);
  };
  const next = () => {
    const i = pm.next_alive_index();
    if (i < 0) log('no living member');
    else doSwitch(i);
  };
  const setKO = (i: number, v: boolean) => {
    const m = pm.members[i];
    const nk = [...ko];
    nk[i] = v;
    setKo(nk);
    if (v) {
      m.state = 'ko';
      log(`${NAMES[i]}.health.died`);
      if (pm.current_index === i) {
        const n = pm.next_alive_index();
        if (n >= 0) {
          pm.switch_to(n);
          setLast({ from: i, to: n });
          log(`leader down: switch_to(${n})`);
        } else log('party_defeated');
      }
    } else {
      m.state = 'idle';
      log(`${NAMES[i]} revived`);
    }
    setTick((n) => n + 1);
  };

  const leader = pm.current_index;
  const code = `func switch_to(index: int) -> void:
	var next := members[index]
	if index == current_index or next in _down:
		return
	# swap the controllers: the old leader becomes AI, the new one reads Input
	leader().set_controller(AIController.new())
	next.set_controller(PlayerController.new())
	current_index = index  # now ${leader} (${NAMES[leader]})
	camera.target = next
	leader_changed.emit(next)`;

  return (
    <FigureLayout
      side={
        <>
          <div className="combat-btns">
            {NAMES.map((n, i) => (
              <Btn key={n} primary={i === leader} onClick={() => doSwitch(i)}>
                switch_to({i})
              </Btn>
            ))}
            <Btn onClick={next}>Q (next alive)</Btn>
          </div>
          {NAMES.map((n, i) => (
            <Toggle key={n} label={`${n} is KO`} value={ko[i]} onChange={(v) => setKO(i, v)} />
          ))}
          <div className="combat-log">{events.length ? events.map((e, i) => <div key={i}>{e}</div>) : <div>Press a button to switch.</div>}</div>
        </>
      }
      below={<CodeBlock compact file="scripts/battle/party_manager.gd (excerpt)" code={code} />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <svg viewBox="0 0 520 250" className="combat-svg" role="img" aria-label="scene tree of the party with controller nodes">
        <text x={12} y={20} fontSize={12.5} fontWeight={700}>
          Field (Node2D)
        </text>
        <line x1={20} y1={26} x2={20} y2={226} stroke="var(--line)" />
        <g transform="translate(20, 36)">
          <line x1={0} y1={8} x2={14} y2={8} stroke="var(--line)" />
          <text x={18} y={12} fontSize={12}>
            PartyManager <tspan style={{ fill: 'var(--muted)' }}>current_index = {leader}</tspan>
          </text>
        </g>
        {NAMES.map((n, i) => {
          const y = 66 + i * 50;
          const lead = i === leader;
          const isKo = ko[i];
          const moved = last && (last.to === i || last.from === i);
          return (
            <g key={n} transform={`translate(20, ${y})`}>
              <line x1={0} y1={10} x2={14} y2={10} stroke="var(--line)" />
              <text x={18} y={14} fontSize={12} fontWeight={600} style={{ fill: isKo ? 'var(--bad)' : 'var(--fg)' }}>
                {n} <tspan style={{ fill: 'var(--muted)', fontWeight: 400 }}>(Character){isKo ? ' KO' : ''}</tspan>
              </text>
              <line x1={26} y1={18} x2={26} y2={34} stroke="var(--line)" />
              <line x1={26} y1={34} x2={40} y2={34} stroke="var(--line)" />
              <rect x={42} y={24} width={lead ? 120 : 104} height={18} rx={4} fill={lead ? 'color-mix(in oklab, var(--accent) 22%, var(--surface))' : 'var(--surface2)'} stroke={lead ? 'var(--accent)' : 'var(--line)'} strokeWidth={moved ? 2.2 : 1}>
                {moved && <animate attributeName="stroke-opacity" values="0.2;1" dur="0.4s" />}
              </rect>
              <text x={50} y={37} fontSize={11.5} fontWeight={lead ? 700 : 400}>
                {lead ? 'PlayerController' : 'AIController'}
              </text>
              <text x={lead ? 172 : 156} y={37} fontSize={10.5} style={{ fill: 'var(--muted)' }}>
                {isKo ? 'no intent (KO)' : lead ? 'intent ← Input' : 'intent ← follow, attack, guard'}
              </text>
            </g>
          );
        })}
        <g transform="translate(20, 216)">
          <line x1={0} y1={8} x2={14} y2={8} stroke="var(--line)" />
          <text x={18} y={12} fontSize={12}>
            Camera2D <tspan style={{ fill: 'var(--muted)' }}>target → {NAMES[leader]}</tspan>
          </text>
        </g>
      </svg>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        {SHEET.map((s, i) => (
          <div key={s} style={{ textAlign: 'center', fontSize: 12, opacity: ko[i] ? 0.5 : 1, outline: i === leader ? '2px solid var(--accent)' : 'none', borderRadius: 6, padding: 2 }}>
            <Portrait sheet={s} ko={ko[i]} lead={i === leader} />
            <div>{NAMES[i]}</div>
          </div>
        ))}
      </div>
      </div>
    </FigureLayout>
  );
}
