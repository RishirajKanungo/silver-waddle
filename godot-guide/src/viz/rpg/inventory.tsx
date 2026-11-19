// rpg.inventory — the bag for r03-1. Add, use, discard, sort and filter, with the signal log, under two
// storage models: GameState's dictionary of counts (add_item returns what did not fit) or an 8-slot
// array of stacks (the slot_inventory.gd fragment). The data structure is printed as it sits in memory.
import { useState } from 'react';
import type { VizSpec } from '../../content/types';
import { SegControl, FigureLayout, Btn } from '../kit';
import { Icon } from './common';
import { ITEMS, KINDS, KIND_LABEL, item, sortItems, type Kind } from './items';

type Model = 'dict' | 'slots';
type Stack = { id: string; count: number } | null;
const SLOTS = 8;
const KAI_MAX = 240;

export function InventoryLab({ spec }: { spec: VizSpec }) {
  const [model, setModel] = useState<Model>((spec.model as Model) ?? 'dict');
  const [counts, setCounts] = useState<Record<string, number>>({ potion: 3, earth_crystal: 5, old_key: 1 });
  const [slots, setSlots] = useState<Stack[]>(() => [{ id: 'potion', count: 3 }, { id: 'earth_crystal', count: 5 }, { id: 'old_key', count: 1 }, ...Array(SLOTS - 3).fill(null)]);
  const [sort, setSort] = useState('kind');
  const [filter, setFilter] = useState<'all' | Kind>('all');
  const [log, setLog] = useState<string[]>([]);
  const [kaiHp, setKaiHp] = useState(110);

  const total = (id: string) => (model === 'dict' ? counts[id] ?? 0 : slots.reduce((s, x) => s + (x && x.id === id ? x.count : 0), 0));
  const push = (...lines: string[]) => setLog((l) => [...lines.reverse(), ...l].slice(0, 12));

  const add = (id: string, n: number) => {
    const it = item(id);
    if (model === 'dict') {
      // GameState.add_item(id, count) -> int
      const have = counts[id] ?? 0;
      const added = Math.min(n, it.maxStack - have);
      if (added <= 0) return push(`add_item("${id}", ${n}) -> ${n}   (no room: ${have}/${it.maxStack})`);
      setCounts({ ...counts, [id]: have + added });
      push(`add_item("${id}", ${n}) -> ${n - added}${n - added ? '   (did not fit)' : ''}`, `item_added("${id}", ${added})`, 'Events.inventory_changed');
    } else {
      // slot bag: top up existing stacks, then start new stacks in empty slots
      const next = slots.map((s) => (s ? { ...s } : null));
      let left = n;
      for (const s of next)
        if (s && s.id === id && left > 0) {
          const put = Math.min(left, it.maxStack - s.count);
          s.count += put;
          left -= put;
        }
      for (let i = 0; i < next.length && left > 0; i++)
        if (!next[i]) {
          const put = Math.min(left, it.maxStack);
          next[i] = { id, count: put };
          left -= put;
        }
      setSlots(next);
      push(`add(${id}, ${n}) -> ${left}${left ? '   (the bag is full)' : ''}`, 'Events.inventory_changed');
    }
  };
  const remove = (id: string, n: number) => {
    if (total(id) < n) return false;
    if (model === 'dict') {
      const left = (counts[id] ?? 0) - n;
      const nx = { ...counts };
      if (left === 0) delete nx[id];
      else nx[id] = left;
      setCounts(nx);
    } else {
      const next = slots.map((s) => (s ? { ...s } : null));
      let left = n;
      for (let i = next.length - 1; i >= 0 && left > 0; i--) {
        const s = next[i];
        if (s && s.id === id) {
          const take = Math.min(left, s.count);
          s.count -= take;
          left -= take;
          if (s.count === 0) next[i] = null;
        }
      }
      setSlots(next);
    }
    return true;
  };
  const use = (id: string) => {
    if (!remove(id, 1)) return push(`ItemUse.use(${item(id).name}) -> false   (none left)`);
    if (id === 'potion') {
      const before = kaiHp;
      const after = Math.min(KAI_MAX, before + 100);
      setKaiHp(after);
      push(`remove_item("${id}") -> true`, 'Events.inventory_changed', `HealEffect: Kai ${before} -> ${after} HP`);
    } else push(`remove_item("${id}") -> true`, 'Events.inventory_changed', `${item(id).name} used`);
  };
  const discard = (id: string) => {
    if (item(id).kind === 'KEY_ITEM') return push(`${item(id).name} is a key item: it cannot be thrown away`);
    remove(id, total(id));
    push(`remove_item("${id}", ${total(id)}) -> true`, 'Events.inventory_changed');
  };

  const held = model === 'dict' ? Object.keys(counts) : [...new Set(slots.filter(Boolean).map((s) => s!.id))];
  const shown = sortItems(held, sort, total).filter((i) => filter === 'all' || i.kind === filter);
  const dump =
    model === 'dict'
      ? `GameState.inventory = {\n${Object.entries(counts).map(([k, v]) => `\t"${k}": ${v},`).join('\n')}\n}`
      : `slots = [\n${slots.map((s, i) => `\t${s ? `ItemStack(${s.id}, ${s.count})` : 'null'},  # ${i}`).join('\n')}\n]`;
  const switchModel = (m: Model) => {
    setModel(m);
    // carry the contents across so the two views can be compared
    if (m === 'slots') {
      const next: Stack[] = Array(SLOTS).fill(null);
      let k = 0;
      for (const [id, c] of Object.entries(counts)) if (k < SLOTS) next[k++] = { id, count: c };
      setSlots(next);
    } else {
      const nx: Record<string, number> = {};
      for (const s of slots) if (s) nx[s.id] = Math.min(item(s.id).maxStack, (nx[s.id] ?? 0) + s.count);
      setCounts(nx);
    }
    push(`model: ${m === 'dict' ? 'dictionary of counts' : `${SLOTS} slots of stacks`}`);
  };

  return (
    <FigureLayout
      side={
        <>
          <SegControl label="model" value={model} options={[{ v: 'dict', label: 'counts' }, { v: 'slots', label: `slots (${SLOTS})` }]} onChange={switchModel} />
          <div className="rpg-k">add</div>
          <div className="rpg-chips">
            <button className="rpg-chip" onClick={() => add('potion', 1)}>+ Potion</button>
            <button className="rpg-chip" onClick={() => add('ether', 1)}>+ Ether</button>
            <button className="rpg-chip" onClick={() => add('earth_crystal', 3)}>+3 Earth Crystal</button>
            <button className="rpg-chip" onClick={() => add('storm_crystal', 1)}>+ Storm Crystal</button>
            <button className="rpg-chip" onClick={() => add('old_key', 1)}>+ Old Key</button>
            <button className="rpg-chip" onClick={() => add('iron_sword', 1)}>+ Iron Sword</button>
            <button className="rpg-chip" onClick={() => add('potion', 60)}>+60 Potions</button>
          </div>
          <div className="rpg-row">
            <Btn onClick={() => use('potion')}>Use Potion on Kai</Btn>
          </div>
          <div className="readout">
            <div className="readout-row">
              <span>Kai HP</span>
              <span className="rpg-mono">
                {kaiHp} / {KAI_MAX}
              </span>
            </div>
          </div>
          <div className="rpg-log" aria-live="polite">
            {log.length ? log.map((l, i) => <div key={i} className={i > 2 ? 'old' : ''}>{l}</div>) : <div className="old">signals appear here</div>}
          </div>
        </>
      }
    >
      <div className="rpg-col">
        <div className="rpg-row">
          <SegControl label="sort" value={sort} options={['kind', 'name', 'count', 'price'].map((v) => ({ v, label: v }))} onChange={setSort} />
        </div>
        <SegControl label="filter" value={filter} options={[{ v: 'all' as const, label: 'all' }, ...KINDS.map((k) => ({ v: k, label: KIND_LABEL[k] }))]} onChange={setFilter} />
        <div className="rpg-inv" role="list" aria-label="inventory">
          {shown.length === 0 && <div className="rpg-muted">nothing of this kind</div>}
          {shown.map((it) => (
            <div key={it.id} className="rpg-invrow" role="listitem">
              <Icon name={it.icon} scale={2} />
              <span className={'rpg-rarity-' + it.rarity}>
                {it.name} <span className="rpg-muted">{KIND_LABEL[it.kind]}</span>
              </span>
              <span className="n">×{total(it.id)}</span>
              <span>
                {it.kind === 'CONSUMABLE' ? <button onClick={() => use(it.id)}>use</button> : <button onClick={() => discard(it.id)} disabled={it.kind === 'KEY_ITEM'}>drop</button>}
              </span>
            </div>
          ))}
        </div>
        {model === 'slots' && (
          <div className="rpg-slots" aria-label="slots">
            {slots.map((s, i) => (
              <div key={i} className="rpg-slotcell">
                {s ? (
                  <>
                    <Icon name={item(s.id).icon} scale={1} />
                    <span>{item(s.id).name}</span>
                    <span className="n">{s.count}</span>
                  </>
                ) : (
                  <span className="rpg-muted">empty</span>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="rpg-code">{dump}</div>
        <div className="rpg-muted">{ITEMS.filter((i) => i.kind !== 'EQUIPMENT').length} item kinds in the catalogue; max_stack 99, key items 1.</div>
      </div>
    </FigureLayout>
  );
}
