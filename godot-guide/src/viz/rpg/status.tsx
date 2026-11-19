// rpg.damage.status — status effects as timed objects (r01-3). Apply poison, slow, haste or barrier at
// the current time and the 30-second timeline is re-simulated at 60 Hz exactly as StatusComponent does
// it: removes list first, re-applying refreshes, modifiers through the StatBlock with the active effect
// as the source, ticks counted down in _physics_process.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { SegControl, FigureLayout, LinePlot, Btn, Slider } from '../kit';
import { STATUSES, StatBlock, applyCharacter, applyEnemy, CHARS, ENEMIES, roundi, type StatusDef } from './model';

const DURATION = 30;
const EXAMPLE: { t: number; id: string }[] = [{ t: 1, id: 'poison' }, { t: 7, id: 'poison' }, { t: 14, id: 'haste' }, { t: 18, id: 'slow' }];
const DT = 1 / 60;
type TargetId = 'bram' | 'skeleton';
interface Ev {
  t: number;
  id: string;
}
interface Active {
  data: StatusDef;
  timeLeft: number;
  untilTick: number;
  start: number;
}

function simulate(events: Ev[], target: TargetId) {
  const block = new StatBlock();
  let immune: string[] = [];
  if (target === 'bram') applyCharacter(block, CHARS.bram, 10);
  else {
    applyEnemy(block, ENEMIES.skeleton);
    immune = ENEMIES.skeleton.statusImmune;
  }
  const maxHp = block.get('MAX_HP');
  let hp = maxHp;
  const active = new Map<string, Active>();
  const intervals: Record<string, [number, number][]> = Object.fromEntries(STATUSES.map((s) => [s.id, []]));
  const log: { t: number; msg: string }[] = [];
  const hpPts: [number, number][] = [[0, hp]];
  const spPts: [number, number][] = [[0, block.get('SPEED')]];
  const pending = [...events].sort((a, b) => a.t - b.t);
  const remove = (id: string, t: number) => {
    const a = active.get(id);
    if (!a) return;
    active.delete(id);
    block.removeSource('status:' + id);
    intervals[id].push([a.start, t]);
    log.push({ t, msg: `removed(${a.data.name})` });
  };
  const steps = Math.round(DURATION / DT);
  for (let k = 0; k < steps; k++) {
    const t = k * DT;
    while (pending.length && pending[0].t <= t + 1e-9) {
      const ev = pending.shift()!;
      const data = STATUSES.find((s) => s.id === ev.id)!;
      if (immune.includes(data.id)) {
        log.push({ t, msg: `apply(${data.name}) -> false: immune` });
        continue;
      }
      for (const r of data.removes) remove(r, t);
      const cur = active.get(data.id);
      if (cur) {
        cur.timeLeft = data.duration;
        log.push({ t, msg: `apply(${data.name}): timer refreshed to ${data.duration} s` });
        continue;
      }
      active.set(data.id, { data, timeLeft: data.duration, untilTick: data.tickInterval, start: t });
      block.setSource('status:' + data.id, data.mods);
      log.push({ t, msg: `added(${data.name})` + (data.mods.length ? `  speed -> ${block.get('SPEED')}` : '') });
    }
    // _physics_process(delta): anything within half a frame is due (float countdowns drift)
    for (const [id, a] of [...active]) {
      if (a.data.tickInterval > 0) {
        a.untilTick -= DT;
        if (a.untilTick <= DT * 0.5) {
          a.untilTick += a.data.tickInterval;
          const amount = Math.max(1, roundi(maxHp * a.data.tickFraction));
          hp = Math.max(0, hp - amount);
          log.push({ t: t + DT, msg: `ticked(${a.data.name}, ${amount})  hp ${hp}` });
        }
      }
      a.timeLeft -= DT;
      if (a.timeLeft <= DT * 0.5) remove(id, t + DT);
    }
    if (k % 3 === 2) {
      hpPts.push([t + DT, hp]);
      spPts.push([t + DT, block.get('SPEED')]);
    }
  }
  for (const [id, a] of active) intervals[id].push([a.start, DURATION]);
  return { hpPts, spPts, intervals, log, maxHp, baseSpeed: block.base.SPEED };
}

export function StatusTimeline({ spec }: { spec: VizSpec }) {
  const [target, setTarget] = useState<TargetId>((spec.target as TargetId) ?? 'bram');
  // an example run so the figure reads at rest: poison twice, then haste and slow
  const [events, setEvents] = useState<Ev[]>(() => (target === 'bram' ? EXAMPLE : []));
  const [cursor, setCursor] = useState(DURATION);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(2);
  const sim = useMemo(() => simulate(events, target), [events, target]);
  const raf = useRef(0);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const loop = (now: number) => {
      raf.current = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setCursor((c) => {
        const nx = c + dt * rate;
        if (nx >= DURATION) {
          setPlaying(false);
          return DURATION;
        }
        return nx;
      });
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, rate]);

  const apply = (id: string) => setEvents((e) => [...e, { t: Math.round(cursor * 60) / 60, id }]);
  const hpNow = [...sim.hpPts].reverse().find(([t]) => t <= cursor + 1e-6)?.[1] ?? sim.maxHp;
  const spNow = [...sim.spPts].reverse().find(([t]) => t <= cursor + 1e-6)?.[1] ?? sim.baseSpeed;
  const shownLog = sim.log.filter((l) => l.t <= cursor + 1e-6).reverse();
  const cut = (pts: [number, number][]) => pts.filter(([t]) => t <= cursor + 1e-6);

  return (
    <FigureLayout
      side={
        <>
          <SegControl label="target" value={target} options={[{ v: 'bram', label: 'Bram lv 10' }, { v: 'skeleton', label: 'Skeleton' }]} onChange={(v) => { setTarget(v); setEvents([]); setCursor(0); }} />
          <div className="rpg-row">
            <Btn primary onClick={() => (cursor >= DURATION ? (setCursor(0), setPlaying(true)) : setPlaying(!playing))}>{playing ? 'Pause' : cursor >= DURATION ? 'Replay' : 'Play'}</Btn>
            <Btn onClick={() => { setEvents([]); setCursor(0); setPlaying(false); }}>Reset</Btn>
          </div>
          <SegControl label="speed" value={rate} options={[{ v: 1, label: '1×' }, { v: 2, label: '2×' }, { v: 4, label: '4×' }]} onChange={setRate} />
          <div className="rpg-k">apply at t = {cursor.toFixed(1)} s</div>
          <div className="rpg-chips">
            {STATUSES.map((s) => (
              <button key={s.id} className="rpg-chip" onClick={() => apply(s.id)}>
                <span style={{ color: s.colour }}>●</span> {s.name}
                <small>
                  {s.duration} s{s.tickInterval ? `, ${s.tickFraction * 100}% / ${s.tickInterval} s` : ''}
                  {s.mods.length ? ', ' + s.mods.map((m) => `${m.value > 0 ? '+' : ''}${m.value}% ${m.stat === 'SPEED' ? 'speed' : 'dmg taken'}`).join('') : ''}
                </small>
              </button>
            ))}
          </div>
          <div className="readout">
            <div className="readout-row">
              <span>HP</span>
              <span className="rpg-mono">
                {hpNow} / {sim.maxHp}
              </span>
            </div>
            <div className="readout-row">
              <span>speed</span>
              <span className="rpg-mono">{spNow}</span>
            </div>
          </div>
        </>
      }
    >
      <div className="rpg-col">
        <Slider label="time (s)" value={cursor} min={0} max={DURATION} step={0.05} onChange={(v) => { setPlaying(false); setCursor(v); }} fmt={(v) => v.toFixed(1)} />
        <div className="rpg-bars">
          {STATUSES.map((s) => (
            <div key={s.id} className="rpg-barrow">
              <span>{s.name}</span>
              <div className="rpg-bartrack">
                {sim.intervals[s.id].map(([a, b], k) =>
                  a <= cursor ? <div key={k} className="rpg-barseg" style={{ left: `${(a / DURATION) * 100}%`, width: `${((Math.min(b, cursor) - a) / DURATION) * 100}%`, background: s.colour }} /> : null,
                )}
                <div className="rpg-cursor" style={{ left: `${(cursor / DURATION) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        <LinePlot series={[{ pts: cut(sim.hpPts), color: 'var(--c-w)', label: 'HP' }]} x={[0, DURATION]} y={[0, sim.maxHp * 1.05]} height={130} xlabel="" ylabel="HP" vlines={[{ x: cursor }]} legend={false} />
        <LinePlot series={[{ pts: cut(sim.spPts), color: 'var(--c-v)', label: 'speed' }]} x={[0, DURATION]} y={[0, sim.baseSpeed * 1.7]} height={120} xlabel="time (s)" ylabel="speed" vlines={[{ x: cursor }]} legend={false} />
        <div className="rpg-log" aria-live="polite">
          {shownLog.length ? shownLog.map((l, k) => <div key={k} className={k ? 'old' : ''}>{`${l.t.toFixed(2).padStart(5)} s  ${l.msg}`}</div>) : <div className="old">press Play, then apply an effect: the signals appear here</div>}
        </div>
      </div>
    </FigureLayout>
  );
}
