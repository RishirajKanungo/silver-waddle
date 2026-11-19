// ship.scope — a scope calculator. Content multiplies: hours of play need screens, areas need
// tilesets and music, enemy types need frames, AI and tuning. Every cost is an editable assumption
// (calibrate them by timing your own first enemy, room and ability), and the result is weeks at
// your own weekly hours.
import { useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Slider, SegControl, Readout, FigureLayout, Bars } from '../kit';
import { fmt } from './common';

interface Scope {
  hours: number; // hours of play
  areas: number; // distinct environments (town, field, dungeon...)
  enemies: number; // enemy types
  bosses: number;
  npcs: number;
  abilities: number;
}
const PRESETS: Record<string, Scope> = {
  slice: { hours: 0.5, areas: 3, enemies: 4, bosses: 1, npcs: 8, abilities: 7 },
  small: { hours: 5, areas: 6, enemies: 14, bosses: 4, npcs: 30, abilities: 18 },
  dream: { hours: 30, areas: 14, enemies: 45, bosses: 12, npcs: 120, abilities: 48 },
};
// default costs in hours per unit: assumptions to replace with your own measurements
const COSTS = {
  base: { label: 'core systems (fixed)', unit: 'once', h: 300 },
  screen: { label: 'room: layout, encounters, scripting', unit: 'per room', h: 5 },
  tileset: { label: 'tileset + props', unit: 'per area', h: 30 },
  music: { label: 'music track', unit: 'per track', h: 12 },
  enemy: { label: 'enemy: sprite, AI, tuning', unit: 'per type', h: 18 },
  boss: { label: 'boss: sprite, patterns, arena', unit: 'per boss', h: 45 },
  npc: { label: 'NPC: sprite variant, dialogue', unit: 'per NPC', h: 3 },
  ability: { label: 'ability: data, anim, fx, sfx, balance', unit: 'per ability', h: 7 },
};
type CostKey = keyof typeof COSTS;

export function ScopeCalc({ spec }: { spec: VizSpec }) {
  const [s, setS] = useState<Scope>(PRESETS[(spec.preset as string) ?? 'small'] ?? PRESETS.small);
  const [preset, setPreset] = useState<string>((spec.preset as string) ?? 'small');
  const [weekly, setWeekly] = useState(10);
  const [minPerRoom, setMinPerRoom] = useState(4);
  const [overhead, setOverhead] = useState(30);
  const [cost, setCost] = useState<Record<CostKey, number>>(Object.fromEntries(Object.entries(COSTS).map(([k, v]) => [k, v.h])) as Record<CostKey, number>);
  const set = (k: keyof Scope) => (v: number) => {
    setS((o) => ({ ...o, [k]: v }));
    setPreset('custom');
  };

  // the multiplications
  const rooms = Math.ceil((s.hours * 60) / minPerRoom);
  const tracks = s.areas + 2; // one per area, plus battle and boss themes
  const enemyFrames = s.enemies * 6 * 4; // ~6 animations × 4 frames
  const bossFrames = s.bosses * 10 * 6;
  const dialogue = s.npcs * 6;
  const sfx = 20 + 2 * s.enemies + s.abilities;
  const rows: { k: CostKey; n: number }[] = [
    { k: 'base', n: 1 },
    { k: 'screen', n: rooms },
    { k: 'tileset', n: s.areas },
    { k: 'music', n: tracks },
    { k: 'enemy', n: s.enemies },
    { k: 'boss', n: s.bosses },
    { k: 'npc', n: s.npcs },
    { k: 'ability', n: s.abilities },
  ];
  const sub = rows.reduce((a, r) => a + r.n * cost[r.k], 0);
  const total = sub * (1 + overhead / 100);
  const weeks = total / weekly;
  const done = new Date(Date.now() + weeks * 7 * 864e5);
  const short = ['room', 'tiles', 'music', 'enemy', 'boss', 'NPC', 'ability'];

  return (
    <FigureLayout
      side={
        <>
          <SegControl
            label="preset"
            value={preset}
            options={[
              { v: 'slice', label: 'slice' },
              { v: 'small', label: 'small game' },
              { v: 'dream', label: 'dream RPG' },
            ]}
            onChange={(v) => {
              setPreset(v);
              setS(PRESETS[v]);
            }}
          />
          <Slider label="hours of play" value={s.hours} min={0.25} max={40} step={0.25} onChange={set('hours')} fmt={(v) => v.toFixed(2)} />
          <Slider label="areas" value={s.areas} min={1} max={20} step={1} onChange={set('areas')} />
          <Slider label="enemy types" value={s.enemies} min={1} max={60} step={1} onChange={set('enemies')} />
          <Slider label="bosses" value={s.bosses} min={0} max={15} step={1} onChange={set('bosses')} />
          <Slider label="NPCs" value={s.npcs} min={0} max={150} step={1} onChange={set('npcs')} />
          <Slider label="abilities" value={s.abilities} min={2} max={60} step={1} onChange={set('abilities')} />
          <Slider label="min per room" value={minPerRoom} min={1} max={10} step={0.5} onChange={setMinPerRoom} />
          <Slider label="your hours/week" value={weekly} min={2} max={50} step={1} onChange={setWeekly} />
          <Slider label="polish + bugs" value={overhead} min={0} max={100} step={5} onChange={setOverhead} fmt={(v) => '+' + v + '%'} />
          <Readout
            rows={[
              ['\\text{total}', `${fmt(total)} h`],
              ['\\text{at your pace}', `${fmt(weeks, 0)} weeks (${(weeks / 52).toFixed(1)} years)`],
              ['\\text{done around}', done.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })],
            ]}
          />
        </>
      }
      below={
        <div className="ship-scroll">
          <table className="ship-table">
            <thead>
              <tr>
                <th>work item (cost is your assumption)</th>
                <th className="num">count</th>
                <th className="num">hours each</th>
                <th className="num">hours</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.k}>
                  <td>{COSTS[r.k].label}</td>
                  <td className="num">{fmt(r.n)}</td>
                  <td className="num">
                    <input type="number" min={0} step={1} value={cost[r.k]} aria-label={`hours per ${COSTS[r.k].label}`} onChange={(e) => setCost((c) => ({ ...c, [r.k]: Math.max(0, parseFloat(e.target.value) || 0) }))} />
                  </td>
                  <td className="num">{fmt(r.n * cost[r.k])}</td>
                </tr>
              ))}
              <tr>
                <td>polish, playtesting and bug fixing</td>
                <td className="num" />
                <td className="num">+{overhead}%</td>
                <td className="num">{fmt(total - sub)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      }
    >
      <div className="ship-wide">
        <Bars
          data={rows.slice(1).map((r, i) => ({ label: short[i], value: r.n * cost[r.k] }))}
          width={520}
          height={210}
          fmt={(v) => fmt(v)}
          ylabel="hours"
        />
        <div className="ship-note" style={{ marginTop: 6 }}>
          Content to make: <b>{fmt(rooms)}</b> rooms ({s.hours} h ÷ {minPerRoom} min), <b>{fmt(enemyFrames + bossFrames)}</b> enemy and boss frames, <b>{fmt(dialogue)}</b> dialogue lines, <b>{tracks}</b> music tracks, about <b>{fmt(sfx)}</b> sound effects. Core systems: {cost.base} h, fixed.
        </div>
      </div>
    </FigureLayout>
  );
}
