// rpg.stats — the modifier playground for r01-1. Pick a character and level, switch modifiers on and
// off, and see base → flat → percent → final for every stat, with the order of application and the
// percent-stacking rule as switches. Mirrors StatBlock._recalculate:
//   value = (_base[stat] + flat[stat]) * (1.0 + percent[stat] / 100.0); _final[stat] = maxi(0, roundi(value))
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Slider, SegControl, FigureLayout } from '../kit';
import { Sprite } from './common';
import { CHARS, CHAR_IDS, SHOWN_STATS, STAT_LABEL, primaryAt, derivedFromPrimary, flat, pct, modText, roundi, type CharId, type Mod, type Stat } from './model';

interface Chip {
  id: string;
  source: string;
  mods: Mod[];
}
const CHIPS: Chip[] = [
  { id: 'sword', source: 'Iron Sword', mods: [flat('ATTACK', 12)] },
  { id: 'ring', source: 'Power Ring', mods: [pct('ATTACK', 10)] },
  { id: 'power', source: 'Power Up shard lv 2', mods: [pct('ATTACK', 10)] },
  { id: 'vest', source: 'Leather Vest', mods: [flat('DEFENCE', 6), flat('MAX_HP', 40)] },
  { id: 'mail', source: 'Chain Mail', mods: [flat('DEFENCE', 14), flat('SPEED', -2)] },
  { id: 'amulet', source: 'Guard Amulet', mods: [pct('DEFENCE', 15), pct('MAX_HP', 10)] },
  { id: 'hpup', source: 'HP Up shard lv 3', mods: [pct('MAX_HP', 30)] },
  { id: 'haste', source: 'Haste (status)', mods: [pct('SPEED', 50)] },
  { id: 'slow', source: 'Slow (status)', mods: [pct('SPEED', -50)] },
];

type Order = 'flat' | 'percent';
type Stack = 'add' | 'multiply';

function compute(base: number, mods: Mod[], order: Order, stack: Stack) {
  const flats = mods.filter((m) => m.kind === 'FLAT').map((m) => m.value);
  const pcts = mods.filter((m) => m.kind === 'PERCENT').map((m) => m.value);
  const f = flats.reduce((a, b) => a + b, 0);
  const pSum = pcts.reduce((a, b) => a + b, 0);
  const factor = stack === 'add' ? 1 + pSum / 100 : pcts.reduce((a, p) => a * (1 + p / 100), 1);
  const value = order === 'flat' ? (base + f) * factor : base * factor + f;
  return { f, pSum, pcts, factor, value, final: Math.max(0, roundi(value)) };
}
const n = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));

export function StatsLab({ spec }: { spec: VizSpec }) {
  const [char, setChar] = useState<CharId>((spec.char as CharId) ?? 'kai');
  const [level, setLevel] = useState<number>((spec.level as number) ?? 5);
  const [on, setOn] = useState<Set<string>>(new Set((spec.on as string[]) ?? []));
  const [order, setOrder] = useState<Order>('flat');
  const [stack, setStack] = useState<Stack>('add');
  const [sel, setSel] = useState<Stat>('ATTACK');
  const c = CHARS[char];
  const prim = primaryAt(c, level);
  const base = derivedFromPrimary(prim);
  const active = CHIPS.filter((x) => on.has(x.id));
  const rows = useMemo(
    () =>
      SHOWN_STATS.map((s) => {
        const mods = active.flatMap((x) => x.mods.filter((m) => m.stat === s));
        return { s, mods, ...compute(base[s], mods, order, stack) };
      }),
    [active, base, order, stack],
  );
  const r = rows.find((x) => x.s === sel)!;
  const pctText = stack === 'add' ? `(1 + ${n(r.pSum)} / 100)` : r.pcts.length ? r.pcts.map((p) => `(1 + ${n(p)} / 100)`).join(' * ') : '(1 + 0 / 100)';
  const arithmetic = order === 'flat' ? `(${n(base[sel])} + ${n(r.f)}) * ${pctText}` : `${n(base[sel])} * ${pctText} + ${n(r.f)}`;
  const toggle = (id: string) => setOn((prev) => {
    const nx = new Set(prev);
    if (nx.has(id)) nx.delete(id);
    else nx.add(id);
    return nx;
  });
  return (
    <FigureLayout
      side={
        <>
          <SegControl label="character" value={char} options={CHAR_IDS.map((id) => ({ v: id, label: CHARS[id].name }))} onChange={setChar} />
          <Slider label="level" value={level} min={1} max={30} step={1} onChange={setLevel} fmt={(v) => v.toFixed(0)} />
          <SegControl label="order" value={order} options={[{ v: 'flat', label: 'flat → %' }, { v: 'percent', label: '% → flat' }]} onChange={setOrder} />
          <SegControl label="percents" value={stack} options={[{ v: 'add', label: 'add' }, { v: 'multiply', label: 'multiply' }]} onChange={setStack} />
          <div className="rpg-k">modifiers (by source)</div>
          <div className="rpg-chips">
            {CHIPS.map((x) => (
              <button key={x.id} className={'rpg-chip' + (on.has(x.id) ? ' on' : '')} onClick={() => toggle(x.id)} aria-pressed={on.has(x.id)}>
                {x.source}
                <small>{x.mods.map(modText).join(', ')}</small>
              </button>
            ))}
          </div>
        </>
      }
    >
      <div className="rpg-col">
        <div className="rpg-row">
          <Sprite sheet={c.sheet} anim="idle_down" scale={2} />
          <div className="rpg-mono" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            <div className="rpg-k">{c.name}, level {level}: primary stats</div>
            {(['strength', 'vitality', 'spirit', 'agility'] as const).map((k) => (
              <div key={k}>
                {k.padEnd(9)} ⌊{c[k]} + {c.growth[k].toFixed(1)}×{level - 1}⌋ = <b>{prim[k]}</b>
              </div>
            ))}
          </div>
        </div>
        <table className="rpg-table">
          <thead>
            <tr>
              <th>stat</th>
              <th>base</th>
              <th>flat</th>
              <th>percent</th>
              <th>final</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.s} className={'click' + (x.s === sel ? ' sel' : '')} onClick={() => setSel(x.s)}>
                <td>{STAT_LABEL[x.s]}</td>
                <td>{base[x.s]}</td>
                <td>{x.f ? (x.f > 0 ? '+' : '') + n(x.f) : ''}</td>
                <td>{x.pcts.length ? (stack === 'add' ? (x.pSum > 0 ? '+' : '') + n(x.pSum) + '%' : '×' + x.factor.toFixed(3)) : ''}</td>
                <td>
                  <b className={x.final > base[x.s] ? 'rpg-up' : x.final < base[x.s] ? 'rpg-down' : ''}>{x.final}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div>
          <div className="rpg-k">{STAT_LABEL[sel]}: StatBlock._recalculate()</div>
          <div className="rpg-formula">
            {`var value := ${arithmetic}   # ${n(Math.round(r.value * 1000) / 1000)}\n_final[stat] = maxi(0, roundi(value))   # ${r.final}`}
          </div>
          {r.mods.length > 0 && <div className="rpg-muted">from: {active.filter((x) => x.mods.some((m) => m.stat === sel)).map((x) => x.source).join(', ')}</div>}
        </div>
      </div>
    </FigureLayout>
  );
}
