// rpg.gear — the equipment screen for r01-2. Equip weapon/armour/accessory on Kai, Lyra or Bram,
// click a socket and then a shard from the bag to socket it, change shard levels, and watch the
// StatBlock recompute. Mirrors Loadout.equip (shards move across socket by socket, the rest go back
// to the bag), Loadout.apply_to (one source per item and passive shard, Elemental overrides in
// armour) and weapon_element / granted_abilities.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { SegControl, FigureLayout } from '../kit';
import { Sprite, Icon, signed } from './common';
import {
  CHARS, CHAR_IDS, GEAR, SHARDS, SHOWN_STATS, STAT_LABEL, ELEMENT_LABEL, DEFAULT_LOADOUT, StatBlock, applyCharacter, applyLoadout, weaponElement, grantedAbilities, gearById, shardById, linkedPartner, modText,
  type CharId, type LoadoutState, type Slot, type Stat,
} from './model';

const LEVEL = 5;
type Sel = { slot: 'WEAPON' | 'ARMOUR'; index: number } | null;
// every shard exists once; its level lives with it (a ShardInstance)
type Owned = Record<string, number>;

function clone(lo: LoadoutState): LoadoutState {
  return { ...lo, weaponShards: lo.weaponShards.map((s) => (s ? { ...s } : null)), armourShards: lo.armourShards.map((s) => (s ? { ...s } : null)) };
}
function blockOf(c: CharId, lo: LoadoutState) {
  const b = new StatBlock();
  applyCharacter(b, CHARS[c], LEVEL);
  applyLoadout(b, lo);
  return b;
}

export function GearScreen({ spec }: { spec: VizSpec }) {
  const [char, setChar] = useState<CharId>((spec.char as CharId) ?? 'kai');
  const [loadouts, setLoadouts] = useState<Record<CharId, LoadoutState>>(() => ({ kai: clone(DEFAULT_LOADOUT.kai), lyra: clone(DEFAULT_LOADOUT.lyra), bram: clone(DEFAULT_LOADOUT.bram) }));
  const [levels, setLevels] = useState<Owned>(() => Object.fromEntries(SHARDS.map((s) => [s.id, 1])));
  const [sel, setSel] = useState<Sel>({ slot: 'WEAPON', index: 0 });
  const [log, setLog] = useState<string[]>([]);
  const prevStats = useRef<Record<Stat, number> | null>(null);
  const lo = loadouts[char];

  // where each shard currently is (a shard is never in two places)
  const where = useMemo(() => {
    const m: Record<string, string> = {};
    for (const id of CHAR_IDS)
      for (const [slot, arr] of [['weapon', loadouts[id].weaponShards], ['armour', loadouts[id].armourShards]] as const)
        arr.forEach((s, i) => s && (m[s.shard] = `${CHARS[id].name} ${slot} ${i}`));
    return m;
  }, [loadouts]);

  const block = useMemo(() => blockOf(char, lo), [char, lo]);
  const stats = Object.fromEntries(SHOWN_STATS.map((s) => [s, block.get(s)])) as Record<Stat, number>;

  const change = (mut: (all: Record<CharId, LoadoutState>) => string) => {
    prevStats.current = stats;
    const all = { kai: clone(loadouts.kai), lyra: clone(loadouts.lyra), bram: clone(loadouts.bram) };
    const msg = mut(all);
    setLoadouts(all);
    setLog((l) => [msg, ...l].slice(0, 6));
  };

  const equip = (slot: Slot, id: string | null) =>
    change((all) => {
      const L = all[char];
      const item = gearById(id);
      if (slot === 'ACCESSORY') {
        L.accessory = id;
        return `equip(${item?.name ?? 'nothing'})`;
      }
      const key = slot === 'WEAPON' ? 'weaponShards' : 'armourShards';
      if (slot === 'WEAPON') L.weapon = id;
      else L.armour = id;
      const count = item?.sockets ?? 0;
      const spare = L[key].slice(count).filter(Boolean).map((s) => shardById(s!.shard)!.name);
      L[key] = Array.from({ length: count }, (_, i) => L[key][i] ?? null);
      if (sel && sel.slot === slot && sel.index >= count) setSel(count ? { slot, index: 0 } : null);
      return `equip(${item?.name ?? 'nothing'})` + (spare.length ? ` returned ${spare.join(', ')} to the bag` : '');
    });

  const place = (shardId: string | null) => {
    if (!sel) return;
    change((all) => {
      // take the shard out of wherever it is now
      if (shardId)
        for (const id of CHAR_IDS)
          for (const arr of [all[id].weaponShards, all[id].armourShards]) arr.forEach((s, i) => s && s.shard === shardId && (arr[i] = null));
      const arr = sel.slot === 'WEAPON' ? all[char].weaponShards : all[char].armourShards;
      const prev = arr[sel.index];
      arr[sel.index] = shardId ? { shard: shardId, level: levels[shardId] } : null;
      return `socket(${sel.slot}, ${sel.index}, ${shardId ? shardById(shardId)!.name : 'null'})` + (prev ? ` returned ${shardById(prev.shard)!.name}` : '');
    });
  };

  const setLevel = (shardId: string, lv: number) => {
    setLevels((p) => ({ ...p, [shardId]: lv }));
    change((all) => {
      for (const id of CHAR_IDS) for (const arr of [all[id].weaponShards, all[id].armourShards]) arr.forEach((s) => s && s.shard === shardId && (s.level = lv));
      return `${shardById(shardId)!.name} reaches level ${lv}`;
    });
  };

  const sockets = (slot: 'WEAPON' | 'ARMOUR') => {
    const item = gearById(slot === 'WEAPON' ? lo.weapon : lo.armour);
    const arr = slot === 'WEAPON' ? lo.weaponShards : lo.armourShards;
    if (!item || item.sockets === 0) return <span className="rpg-muted">no sockets</span>;
    const out: React.ReactNode[] = [];
    arr.forEach((s, i) => {
      const d = s && shardById(s.shard);
      const isSel = sel?.slot === slot && sel.index === i;
      out.push(
        <button key={'s' + i} className={'rpg-socket' + (isSel ? ' sel' : '')} style={d ? { background: d.colour, borderColor: d.colour } : undefined} onClick={() => setSel({ slot, index: i })} aria-label={`${slot.toLowerCase()} socket ${i}: ${d?.name ?? 'empty'}`} title={d ? `${d.name} lv ${s!.level}` : 'empty socket'}>
          {d ? d.name.slice(0, 2) : ''}
          {d && <span className="lv">{s!.level}</span>}
        </button>,
      );
      if (i < arr.length - 1) out.push(<span key={'l' + i} className={linkedPartner(item, i) === i + 1 ? 'rpg-link' : 'rpg-gap'} />);
    });
    return <div className="rpg-sockets">{out}</div>;
  };

  const slotRow = (slot: Slot, label: string, value: string | null) => {
    const options = GEAR.filter((g) => g.slot === slot && (!g.owner || g.owner === char));
    const item = gearById(value);
    return (
      <div className="rpg-slot">
        <div className="rpg-row" style={{ justifyContent: 'space-between' }}>
          <span className="rpg-slot-k">{label}</span>
          {item && <Icon name={item.icon} scale={1} />}
        </div>
        <select value={value ?? ''} onChange={(e) => equip(slot, e.target.value || null)} aria-label={label}>
          <option value="">(none)</option>
          {options.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <span className="rpg-muted">{item ? item.mods.map(modText).join(', ') + (item.sockets ? ` · ${item.sockets} socket${item.sockets > 1 ? 's' : ''}${item.linkedPairs ? `, ${item.linkedPairs} linked pair${item.linkedPairs > 1 ? 's' : ''}` : ''}` : '') : ' '}</span>
        {slot !== 'ACCESSORY' && sockets(slot)}
      </div>
    );
  };

  const prev = prevStats.current;
  const wEl = weaponElement(lo);
  const abilities = grantedAbilities(lo);
  const selShard = sel ? (sel.slot === 'WEAPON' ? lo.weaponShards : lo.armourShards)[sel.index] : null;

  return (
    <FigureLayout
      side={
        <>
          <SegControl label="character" value={char} options={CHAR_IDS.map((id) => ({ v: id, label: CHARS[id].name }))} onChange={(v) => { setChar(v); setSel({ slot: 'WEAPON', index: 0 }); prevStats.current = null; }} />
          <div className="rpg-k">shard bag {sel ? `→ ${sel.slot.toLowerCase()} socket ${sel.index}` : '(pick a socket)'}</div>
          <div className="rpg-chips">
            {SHARDS.map((s) => (
              <button key={s.id} className={'rpg-chip' + (selShard?.shard === s.id ? ' on' : '')} onClick={() => place(s.id)} disabled={!sel} title={where[s.id] ? `now in ${where[s.id]}` : 'in the bag'}>
                <span style={{ color: s.colour }}>●</span> {s.name}
                <small>
                  {s.kind.toLowerCase()} · {where[s.id] ? where[s.id] : 'bag'}
                </small>
              </button>
            ))}
            <button className="rpg-chip" onClick={() => place(null)} disabled={!sel || !selShard}>
              empty socket
            </button>
          </div>
          {selShard && (
            <div className="rpg-row">
              <span className="rpg-muted">{shardById(selShard.shard)!.name} level</span>
              <SegControl value={selShard.level} options={[1, 2, 3].map((v) => ({ v, label: String(v) }))} onChange={(v) => setLevel(selShard.shard, v)} />
            </div>
          )}
          <div className="rpg-log" aria-live="polite">
            {log.length ? log.map((l, i) => <div key={i} className={i ? 'old' : ''}>{l}</div>) : <div className="old">changes appear here</div>}
          </div>
        </>
      }
    >
      <div className="rpg-col">
        <div className="rpg-equip">
          <div style={{ gridRow: 'span 3' }}>
            <Sprite sheet={CHARS[char].sheet} anim="idle_down" scale={3} />
            <div className="rpg-muted" style={{ textAlign: 'center' }}>
              {CHARS[char].name}, lv {LEVEL}
            </div>
          </div>
          {slotRow('WEAPON', 'weapon', lo.weapon)}
          {slotRow('ARMOUR', 'armour', lo.armour)}
          {slotRow('ACCESSORY', 'accessory', lo.accessory)}
        </div>
        <table className="rpg-table">
          <thead>
            <tr>
              <th>stat</th>
              <th>base</th>
              <th>final</th>
              <th>last change</th>
            </tr>
          </thead>
          <tbody>
            {SHOWN_STATS.map((s) => {
              const d = prev ? stats[s] - prev[s] : 0;
              return (
                <tr key={s}>
                  <td>{STAT_LABEL[s]}</td>
                  <td>{block.base[s]}</td>
                  <td>
                    <b>{stats[s]}</b>
                  </td>
                  <td className={d > 0 ? 'rpg-up' : d < 0 ? 'rpg-down' : 'rpg-muted'}>{d ? signed(d) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="rpg-elements">
          <span className="rpg-k">element multipliers</span>
          {(['FIRE', 'ICE', 'LIGHTNING'] as const).map((e) => (
            <span key={e} className="rpg-el">
              {ELEMENT_LABEL[e]} ×{block.elementMultiplier(e)}
            </span>
          ))}
          <span className="rpg-el">attacks: {ELEMENT_LABEL[wEl]}</span>
        </div>
        <div>
          <div className="rpg-k">modifiers by source (StatBlock.set_source)</div>
          <div className="rpg-modlist">
            {[...block.sources.entries()].map(([src, { mods, overrides }]) => (
              <div key={src}>
                <span>{src}</span>
                <span className="rpg-mono">
                  {[...mods.map(modText), ...Object.entries(overrides).map(([e, v]) => `${ELEMENT_LABEL[e as 'FIRE']} ×${v}`)].join(', ')}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="rpg-muted">granted by shards: {abilities.length ? abilities.join(', ') : 'nothing'}</div>
      </div>
    </FigureLayout>
  );
}
