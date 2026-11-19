// Item catalogue for the r03 figures, matching the .tres files the lessons describe.
import { GEAR, ENEMIES } from './model';

export type Kind = 'CONSUMABLE' | 'KEY_ITEM' | 'MATERIAL' | 'EQUIPMENT';
export const KINDS: Kind[] = ['CONSUMABLE', 'KEY_ITEM', 'MATERIAL', 'EQUIPMENT'];
export const KIND_LABEL: Record<Kind, string> = { CONSUMABLE: 'consumable', KEY_ITEM: 'key item', MATERIAL: 'material', EQUIPMENT: 'equipment' };
export interface Item {
  id: string;
  name: string;
  kind: Kind;
  rarity: 0 | 1 | 2;
  maxStack: number;
  price: number;
  icon: string;
}
export const ITEMS: Item[] = [
  { id: 'potion', name: 'Potion', kind: 'CONSUMABLE', rarity: 0, maxStack: 99, price: 50, icon: 'potion' },
  { id: 'ether', name: 'Ether', kind: 'CONSUMABLE', rarity: 1, maxStack: 99, price: 150, icon: 'ether' },
  { id: 'phoenix_feather', name: 'Phoenix Feather', kind: 'CONSUMABLE', rarity: 2, maxStack: 99, price: 300, icon: 'phoenix' },
  { id: 'old_key', name: 'Old Key', kind: 'KEY_ITEM', rarity: 0, maxStack: 1, price: 0, icon: 'key' },
  { id: 'ruins_map', name: 'Ruins Map', kind: 'KEY_ITEM', rarity: 0, maxStack: 1, price: 0, icon: 'map' },
  { id: 'earth_crystal', name: 'Earth Crystal', kind: 'MATERIAL', rarity: 0, maxStack: 99, price: 20, icon: 'earth' },
  { id: 'storm_crystal', name: 'Storm Crystal', kind: 'MATERIAL', rarity: 1, maxStack: 99, price: 40, icon: 'storm' },
  { id: 'ember_crystal', name: 'Ember Crystal', kind: 'MATERIAL', rarity: 1, maxStack: 99, price: 30, icon: 'ember' },
  ...GEAR.map((g) => ({ id: g.id, name: g.name, kind: 'EQUIPMENT' as Kind, rarity: (g.price >= 1000 ? 2 : g.price >= 600 ? 1 : 0) as 0 | 1 | 2, maxStack: 99, price: g.price, icon: g.icon })),
];
export const item = (id: string) => ITEMS.find((i) => i.id === id)!;
export const SELL_RATE = 0.5;
export const sellPrice = (i: Item) => Math.floor(i.price * SELL_RATE);

/** Inventory.sort_items / listing */
export function sortItems(ids: string[], by: string, count: (id: string) => number) {
  const a = ids.map(item);
  if (by === 'name') a.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
  else if (by === 'price') a.sort((x, y) => x.price - y.price);
  else if (by === 'count') a.sort((x, y) => count(y.id) - count(x.id));
  else a.sort((x, y) => KINDS.indexOf(x.kind) - KINDS.indexOf(y.kind) || (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
  return a;
}

/** Expected gold per fight from drops, and from selling materials, per area (r03-3). */
export const AREA_ECON = {
  field: { label: 'field', enemies: ['slime', 'bat'] as const, materials: 0.3 * 10 + 0.4 * 20 },
  ruins: { label: 'ruins', enemies: ['skeleton', 'slime'] as const, materials: 0.25 * 15 + 0.3 * 10 },
  dungeon: { label: 'dungeon', enemies: ['skeleton', 'skeleton', 'bat'] as const, materials: 2 * 0.25 * 15 + 0.4 * 20 },
};
export type AreaId = keyof typeof AREA_ECON;
export const fightGold = (a: AreaId) => AREA_ECON[a].enemies.reduce((s, e) => s + ENEMIES[e].gold, 0);
