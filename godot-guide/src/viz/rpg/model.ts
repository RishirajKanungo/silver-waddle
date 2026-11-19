// The RPG model shared by the rpg.* figures. It mirrors the GDScript from modules r01–r03 line by
// line where it can: StatBlock (flat then percent, rounded once), CharacterStats (base + growth),
// EquipmentData with linked sockets, ShardData levelling by AP, the damage pipeline (DamageCalc),
// status effects, loot tables and the XP curve. Numbers here are the numbers the lessons quote.

export const STATS = ['MAX_HP', 'MAX_MP', 'ATTACK', 'MAGIC', 'DEFENCE', 'MAGIC_DEFENCE', 'SPEED', 'CRIT', 'DAMAGE_TAKEN'] as const;
export type Stat = (typeof STATS)[number];
export const STAT_LABEL: Record<Stat, string> = {
  MAX_HP: 'max HP',
  MAX_MP: 'max MP',
  ATTACK: 'attack',
  MAGIC: 'magic',
  DEFENCE: 'defence',
  MAGIC_DEFENCE: 'magic def.',
  SPEED: 'speed',
  CRIT: 'crit %',
  DAMAGE_TAKEN: 'damage taken %',
};
/** the stats an equipment screen shows (DAMAGE_TAKEN is internal) */
export const SHOWN_STATS: Stat[] = ['MAX_HP', 'MAX_MP', 'ATTACK', 'MAGIC', 'DEFENCE', 'MAGIC_DEFENCE', 'SPEED', 'CRIT'];

export const ELEMENTS = ['NONE', 'FIRE', 'ICE', 'LIGHTNING'] as const;
export type Element = (typeof ELEMENTS)[number];
export const ELEMENT_LABEL: Record<Element, string> = { NONE: 'none', FIRE: 'fire', ICE: 'ice', LIGHTNING: 'lightning' };

export type Slot = 'WEAPON' | 'ARMOUR' | 'ACCESSORY';
export type ModKind = 'FLAT' | 'PERCENT';
export interface Mod {
  stat: Stat;
  kind: ModKind;
  value: number;
}
export const flat = (stat: Stat, value: number): Mod => ({ stat, kind: 'FLAT', value });
export const pct = (stat: Stat, value: number): Mod => ({ stat, kind: 'PERCENT', value });
export const modText = (m: Mod) => `${m.value >= 0 ? '+' : '−'}${Math.abs(m.value)}${m.kind === 'PERCENT' ? '%' : ''} ${STAT_LABEL[m.stat]}`;

/** GDScript roundi: half away from zero */
export const roundi = (x: number) => (x < 0 ? -Math.round(-x) : Math.round(x));

export type Order = 'flat-then-percent' | 'percent-then-flat';

// ------------------------------------------------------------------------------------ StatBlock
export interface Breakdown {
  base: number;
  flat: number;
  percent: number;
  final: number;
  sources: { source: string; mod: Mod }[];
}

/** Mirrors scripts/rpg/stat_block.gd. Sources are labelled strings here so the figures can list them. */
export class StatBlock {
  base: Record<Stat, number> = Object.fromEntries(STATS.map((s) => [s, 0])) as Record<Stat, number>;
  baseElement: Record<Element, number> = { NONE: 1, FIRE: 1, ICE: 1, LIGHTNING: 1 };
  sources = new Map<string, { mods: Mod[]; overrides: Partial<Record<Element, number>> }>();
  order: Order = 'flat-then-percent';

  setBase(stat: Stat, v: number) {
    this.base[stat] = v;
  }
  setSource(source: string, mods: Mod[], overrides: Partial<Record<Element, number>> = {}) {
    this.sources.set(source, { mods, overrides });
  }
  removeSource(source: string) {
    this.sources.delete(source);
  }
  breakdown(stat: Stat): Breakdown {
    let f = 0, p = 0;
    const list: { source: string; mod: Mod }[] = [];
    for (const [source, { mods }] of this.sources)
      for (const m of mods)
        if (m.stat === stat) {
          list.push({ source, mod: m });
          if (m.kind === 'FLAT') f += m.value;
          else p += m.value;
        }
    const b = this.base[stat];
    const value = this.order === 'flat-then-percent' ? (b + f) * (1 + p / 100) : b * (1 + p / 100) + f;
    return { base: b, flat: f, percent: p, final: Math.max(0, roundi(value)), sources: list };
  }
  get(stat: Stat) {
    return this.breakdown(stat).final;
  }
  elementMultiplier(e: Element) {
    // an override from gear (Elemental + Fire in armour) replaces the base; the most protective wins
    let best: number | undefined;
    for (const { overrides } of this.sources.values()) {
      const o = overrides[e];
      if (o !== undefined) best = best === undefined ? o : Math.min(best, o);
    }
    return best ?? this.baseElement[e];
  }
}

// ------------------------------------------------------------------------------ CharacterStats
export type CharId = 'kai' | 'lyra' | 'bram';
export interface CharDef {
  id: CharId;
  name: string;
  sheet: 'hero' | 'mage' | 'guard';
  strength: number;
  vitality: number;
  spirit: number;
  agility: number;
  growth: { strength: number; vitality: number; spirit: number; agility: number };
}
export const CHARS: Record<CharId, CharDef> = {
  kai: { id: 'kai', name: 'Kai', sheet: 'hero', strength: 12, vitality: 10, spirit: 6, agility: 14, growth: { strength: 2.0, vitality: 1.5, spirit: 1.0, agility: 1.5 } },
  lyra: { id: 'lyra', name: 'Lyra', sheet: 'mage', strength: 6, vitality: 8, spirit: 15, agility: 10, growth: { strength: 0.8, vitality: 1.0, spirit: 2.2, agility: 1.2 } },
  bram: { id: 'bram', name: 'Bram', sheet: 'guard', strength: 10, vitality: 15, spirit: 7, agility: 7, growth: { strength: 1.6, vitality: 2.2, spirit: 1.0, agility: 0.8 } },
};
export const CHAR_IDS: CharId[] = ['kai', 'lyra', 'bram'];

/** primary stats at a level: floori(base + growth * (level - 1)) */
export function primaryAt(c: CharDef, level: number) {
  const l = level - 1;
  return {
    strength: Math.floor(c.strength + c.growth.strength * l),
    vitality: Math.floor(c.vitality + c.growth.vitality * l),
    spirit: Math.floor(c.spirit + c.growth.spirit * l),
    agility: Math.floor(c.agility + c.growth.agility * l),
  };
}
/** the derived-stat formulas of CharacterStats.apply_to */
export function derivedFromPrimary(p: ReturnType<typeof primaryAt>): Record<Stat, number> {
  return {
    MAX_HP: 40 + p.vitality * 10,
    MAX_MP: 10 + p.spirit * 3,
    ATTACK: p.strength * 2,
    MAGIC: p.spirit * 2,
    DEFENCE: p.vitality,
    MAGIC_DEFENCE: p.spirit,
    SPEED: p.agility,
    CRIT: 5,
    DAMAGE_TAKEN: 100,
  };
}
export function applyCharacter(block: StatBlock, c: CharDef, level: number) {
  const d = derivedFromPrimary(primaryAt(c, level));
  for (const s of STATS) block.setBase(s, d[s]);
}

// --------------------------------------------------------------------------- EquipmentData
export interface Equip {
  id: string;
  name: string;
  slot: Slot;
  owner?: CharId;
  mods: Mod[];
  sockets: number;
  linkedPairs: number;
  /** r02: weapon ability learned through proficiency */
  teaches?: string;
  /** r03 */
  price: number;
  icon: string;
}
export const GEAR: Equip[] = [
  { id: 'iron_sword', name: 'Iron Sword', slot: 'WEAPON', owner: 'kai', mods: [flat('ATTACK', 12)], sockets: 2, linkedPairs: 1, teaches: 'Rising Slash', price: 300, icon: 'sword' },
  { id: 'rune_blade', name: 'Rune Blade', slot: 'WEAPON', owner: 'kai', mods: [flat('ATTACK', 8), flat('MAGIC', 8)], sockets: 3, linkedPairs: 1, teaches: 'Triple Slash', price: 1500, icon: 'sword' },
  { id: 'oak_staff', name: 'Oak Staff', slot: 'WEAPON', owner: 'lyra', mods: [flat('ATTACK', 2), flat('MAGIC', 12), pct('MAX_MP', 10)], sockets: 2, linkedPairs: 1, teaches: 'Focus', price: 300, icon: 'staff' },
  { id: 'star_rod', name: 'Star Rod', slot: 'WEAPON', owner: 'lyra', mods: [flat('MAGIC', 18)], sockets: 1, linkedPairs: 0, teaches: 'Starfall', price: 1400, icon: 'staff' },
  { id: 'iron_mace', name: 'Iron Mace', slot: 'WEAPON', owner: 'bram', mods: [flat('ATTACK', 14)], sockets: 1, linkedPairs: 0, teaches: 'Shield Bash', price: 300, icon: 'mace' },
  { id: 'warden_mace', name: 'Warden Mace', slot: 'WEAPON', owner: 'bram', mods: [flat('ATTACK', 10), flat('DEFENCE', 5)], sockets: 2, linkedPairs: 1, teaches: 'Bulwark', price: 1300, icon: 'mace' },
  { id: 'leather_vest', name: 'Leather Vest', slot: 'ARMOUR', mods: [flat('DEFENCE', 6), flat('MAX_HP', 40)], sockets: 1, linkedPairs: 0, price: 200, icon: 'armour' },
  { id: 'chain_mail', name: 'Chain Mail', slot: 'ARMOUR', mods: [flat('DEFENCE', 14), flat('SPEED', -2)], sockets: 2, linkedPairs: 1, price: 600, icon: 'armour' },
  { id: 'mage_robe', name: 'Mage Robe', slot: 'ARMOUR', mods: [flat('DEFENCE', 3), flat('MAGIC_DEFENCE', 10), flat('MAX_MP', 20)], sockets: 2, linkedPairs: 0, price: 500, icon: 'robe' },
  { id: 'power_ring', name: 'Power Ring', slot: 'ACCESSORY', mods: [pct('ATTACK', 10)], sockets: 0, linkedPairs: 0, price: 800, icon: 'ring' },
  { id: 'swift_band', name: 'Swift Band', slot: 'ACCESSORY', mods: [flat('SPEED', 4)], sockets: 0, linkedPairs: 0, price: 700, icon: 'ring' },
  { id: 'lucky_charm', name: 'Lucky Charm', slot: 'ACCESSORY', mods: [flat('CRIT', 10)], sockets: 0, linkedPairs: 0, price: 700, icon: 'amulet' },
  { id: 'guard_amulet', name: 'Guard Amulet', slot: 'ACCESSORY', mods: [pct('DEFENCE', 15), pct('MAX_HP', 10)], sockets: 0, linkedPairs: 0, price: 900, icon: 'amulet' },
];
export const gearById = (id: string | null | undefined) => GEAR.find((g) => g.id === id);
/** EquipmentData.linked_partner: sockets 0+1, 2+3 … are linked for linkedPairs pairs */
export function linkedPartner(item: Equip, socket: number) {
  if (socket >= item.linkedPairs * 2) return -1;
  return socket % 2 === 0 ? socket + 1 : socket - 1;
}

// ------------------------------------------------------------------------------- ShardData
export type ShardKind = 'SPELL' | 'ABILITY' | 'PASSIVE' | 'SUPPORT';
export interface ShardDef {
  id: string;
  name: string;
  kind: ShardKind;
  element: Element;
  /** granted per level (index 0 = level 1) */
  abilities: string[];
  /** applied once per level */
  mods: Mod[];
  apThresholds: number[];
  colour: string;
}
export const SHARDS: ShardDef[] = [
  { id: 'fire', name: 'Fire', kind: 'SPELL', element: 'FIRE', abilities: ['Fire', 'Fire II', 'Fire III'], mods: [], apThresholds: [200, 600], colour: '#d84f3c' },
  { id: 'ice', name: 'Ice', kind: 'SPELL', element: 'ICE', abilities: ['Ice', 'Ice II', 'Ice III'], mods: [], apThresholds: [200, 600], colour: '#4c86d6' },
  { id: 'thunder', name: 'Thunder', kind: 'SPELL', element: 'LIGHTNING', abilities: ['Thunder', 'Thunder II', 'Thunder III'], mods: [], apThresholds: [200, 600], colour: '#eebb3e' },
  { id: 'heal', name: 'Heal', kind: 'SPELL', element: 'NONE', abilities: ['Heal', 'Heal II', 'Heal All'], mods: [], apThresholds: [150, 500], colour: '#4f9e3e' },
  { id: 'hp_up', name: 'HP Up', kind: 'PASSIVE', element: 'NONE', abilities: [], mods: [pct('MAX_HP', 10)], apThresholds: [300, 900], colour: '#cf9058' },
  { id: 'power_up', name: 'Power Up', kind: 'PASSIVE', element: 'NONE', abilities: [], mods: [pct('ATTACK', 5)], apThresholds: [300, 900], colour: '#9a2a3a' },
  { id: 'magic_up', name: 'Magic Up', kind: 'PASSIVE', element: 'NONE', abilities: [], mods: [pct('MAGIC', 5)], apThresholds: [300, 900], colour: '#7044a8' },
  { id: 'swiftness', name: 'Swiftness', kind: 'PASSIVE', element: 'NONE', abilities: [], mods: [flat('SPEED', 2)], apThresholds: [300, 900], colour: '#36a0c8' },
  { id: 'elemental', name: 'Elemental', kind: 'SUPPORT', element: 'NONE', abilities: [], mods: [], apThresholds: [400, 1200], colour: '#b088e6' },
];
export const shardById = (id: string | null | undefined) => SHARDS.find((s) => s.id === id);
export function shardLevel(s: ShardDef, ap: number) {
  let level = 1;
  for (const t of s.apThresholds) if (ap >= t) level++;
  return level;
}
/** Elemental in armour: level 1 halves, level 2 nullifies, level 3 absorbs */
export const ELEMENTAL_ARMOUR = [0.5, 0, -1];

export interface Socketed {
  shard: string;
  level: number;
}
export interface LoadoutState {
  weapon: string | null;
  armour: string | null;
  accessory: string | null;
  weaponShards: (Socketed | null)[];
  armourShards: (Socketed | null)[];
}

function linkedElement(item: Equip | undefined, shards: (Socketed | null)[], i: number): Element {
  const s = shards[i];
  if (!item || !s || shardById(s.shard)?.kind !== 'SUPPORT') return 'NONE';
  const p = linkedPartner(item, i);
  if (p < 0 || p >= shards.length || !shards[p]) return 'NONE';
  return shardById(shards[p]!.shard)?.element ?? 'NONE';
}

/** Loadout.apply_to: every gear and shard modifier as one source per item/shard (labelled for the figure) */
export function applyLoadout(block: StatBlock, lo: LoadoutState) {
  for (const k of [...block.sources.keys()]) if (!k.startsWith('status:')) block.removeSource(k);
  for (const id of [lo.weapon, lo.armour, lo.accessory]) {
    const g = gearById(id);
    if (g) block.setSource(g.name, g.mods);
  }
  const overrides: Partial<Record<Element, number>> = {};
  const armour = gearById(lo.armour);
  lo.armourShards.forEach((s, i) => {
    const e = linkedElement(armour, lo.armourShards, i);
    if (e !== 'NONE' && s) overrides[e] = ELEMENTAL_ARMOUR[s.level - 1];
  });
  for (const arr of [lo.weaponShards, lo.armourShards])
    arr.forEach((s) => {
      const d = s && shardById(s.shard);
      if (d && d.kind === 'PASSIVE') block.setSource(`${d.name} shard (lv ${s!.level})`, d.mods.map((m) => ({ ...m, value: m.value * s!.level })));
    });
  if (Object.keys(overrides).length) block.setSource('Elemental (armour)', [], overrides);
}
export function weaponElement(lo: LoadoutState): Element {
  const w = gearById(lo.weapon);
  for (let i = 0; i < lo.weaponShards.length; i++) {
    const e = linkedElement(w, lo.weaponShards, i);
    if (e !== 'NONE') return e;
  }
  return 'NONE';
}
export function grantedAbilities(lo: LoadoutState): string[] {
  const out: string[] = [];
  for (const arr of [lo.weaponShards, lo.armourShards])
    for (const s of arr) {
      const d = s && shardById(s.shard);
      if (d) out.push(...d.abilities.slice(0, s!.level));
    }
  return out;
}

export const DEFAULT_LOADOUT: Record<CharId, LoadoutState> = {
  kai: { weapon: 'iron_sword', armour: 'leather_vest', accessory: 'power_ring', weaponShards: [null, null], armourShards: [null] },
  lyra: { weapon: 'oak_staff', armour: 'mage_robe', accessory: null, weaponShards: [{ shard: 'fire', level: 1 }, null], armourShards: [null, null] },
  bram: { weapon: 'iron_mace', armour: 'chain_mail', accessory: 'guard_amulet', weaponShards: [null], armourShards: [null, null] },
};

// --------------------------------------------------------------------------------- enemies
export type EnemyId = 'slime' | 'bat' | 'skeleton' | 'golem';
export interface EnemyDef {
  id: EnemyId;
  name: string;
  stats: Record<Stat, number>;
  weak: Element[];
  resist: Element[];
  immune: Element[];
  absorb: Element[];
  statusImmune: string[];
  xp: number;
  gold: number;
  ap: number;
  anim: string;
}
const est = (hp: number, atk: number, mag: number, def: number, mdef: number, spd: number): Record<Stat, number> => ({ MAX_HP: hp, MAX_MP: 0, ATTACK: atk, MAGIC: mag, DEFENCE: def, MAGIC_DEFENCE: mdef, SPEED: spd, CRIT: 5, DAMAGE_TAKEN: 100 });
export const ENEMIES: Record<EnemyId, EnemyDef> = {
  slime: { id: 'slime', name: 'Slime', stats: est(80, 14, 0, 4, 2, 6), weak: ['FIRE'], resist: [], immune: [], absorb: [], statusImmune: [], xp: 12, gold: 5, ap: 3, anim: 'idle' },
  bat: { id: 'bat', name: 'Bat', stats: est(50, 16, 0, 2, 8, 18), weak: ['LIGHTNING'], resist: ['ICE'], immune: [], absorb: [], statusImmune: [], xp: 10, gold: 4, ap: 3, anim: 'fly' },
  skeleton: { id: 'skeleton', name: 'Skeleton', stats: est(220, 28, 0, 20, 6, 10), weak: ['FIRE'], resist: ['ICE'], immune: [], absorb: [], statusImmune: ['poison'], xp: 30, gold: 14, ap: 8, anim: 'idle' },
  golem: { id: 'golem', name: 'Golem', stats: est(2400, 48, 20, 60, 30, 5), weak: ['ICE'], resist: ['FIRE'], immune: [], absorb: ['LIGHTNING'], statusImmune: ['poison', 'slow'], xp: 300, gold: 200, ap: 40, anim: 'idle' },
};
export const ENEMY_IDS: EnemyId[] = ['slime', 'bat', 'skeleton', 'golem'];
export function enemyElement(e: EnemyDef, el: Element) {
  if (el === 'NONE') return 1;
  if (e.absorb.includes(el)) return -1;
  if (e.immune.includes(el)) return 0;
  if (e.weak.includes(el)) return 2;
  if (e.resist.includes(el)) return 0.5;
  return 1;
}
export function applyEnemy(block: StatBlock, e: EnemyDef) {
  for (const s of STATS) block.setBase(s, e.stats[s]);
  for (const el of ELEMENTS) block.baseElement[el] = enemyElement(e, el);
}

// ------------------------------------------------------------------------------- abilities
export interface AttackDef {
  name: string;
  power: number;
  element: Element;
  isMagic: boolean;
  /** who normally uses it */
  user: CharId[];
  /** use the weapon's linked element (basic attacks) */
  weaponElement?: boolean;
}
export const ATTACKS: AttackDef[] = [
  { name: 'Strike', power: 1.0, element: 'NONE', isMagic: false, user: ['kai', 'lyra', 'bram'], weaponElement: true },
  { name: 'Rising Slash', power: 2.0, element: 'NONE', isMagic: false, user: ['kai'] },
  { name: 'Shield Bash', power: 1.2, element: 'NONE', isMagic: false, user: ['bram'] },
  { name: 'Fire', power: 2.0, element: 'FIRE', isMagic: true, user: ['lyra', 'kai', 'bram'] },
  { name: 'Ice', power: 2.0, element: 'ICE', isMagic: true, user: ['lyra', 'kai', 'bram'] },
  { name: 'Thunder', power: 2.0, element: 'LIGHTNING', isMagic: true, user: ['lyra', 'kai', 'bram'] },
];

// ---------------------------------------------------------------------------- DamageCalc
export const DEFENCE_SCALE = 100;
export const CRIT_MULTIPLIER = 1.5;
export interface DamageResult {
  amount: number;
  crit: boolean;
  elementMult: number;
  offence: number;
  defence: number;
  damageTaken: number;
  /** value after each stage: offence, defence, element, stagger, crit, final */
  steps: number[];
}
/** Mirrors DamageCalc.calculate in scripts/rpg/damage_calc.gd */
export function calculate(attacker: StatBlock, target: StatBlock, power: number, element: Element, isMagic: boolean, staggerMultiplier = 1, critRoll = 1): DamageResult {
  const steps: number[] = [];
  // 1. offence
  const offence = attacker.get(isMagic ? 'MAGIC' : 'ATTACK');
  let x = power * offence;
  steps.push(x);
  // 2. defence (ratio) and damage taken (Barrier)
  const defence = target.get(isMagic ? 'MAGIC_DEFENCE' : 'DEFENCE');
  x *= DEFENCE_SCALE / (DEFENCE_SCALE + defence);
  const damageTaken = target.get('DAMAGE_TAKEN');
  x *= damageTaken / 100;
  steps.push(x);
  // 3. element
  const elementMult = target.elementMultiplier(element);
  x *= elementMult;
  steps.push(x);
  // 4. stagger
  x *= staggerMultiplier;
  steps.push(x);
  // 5. crit
  const crit = critRoll < attacker.get('CRIT') / 100;
  if (crit) x *= CRIT_MULTIPLIER;
  steps.push(x);
  // 6. round once
  let amount: number;
  if (elementMult === 0) amount = 0;
  else if (x < 0) amount = Math.min(-1, roundi(x));
  else amount = Math.max(1, roundi(x));
  steps.push(amount);
  return { amount, crit, elementMult, offence, defence, damageTaken, steps };
}

// ----------------------------------------------------------------------------- statuses
export interface StatusDef {
  id: string;
  name: string;
  duration: number;
  tickInterval: number;
  tickFraction: number;
  mods: Mod[];
  removes: string[];
  colour: string;
}
export const STATUSES: StatusDef[] = [
  { id: 'poison', name: 'Poison', duration: 12, tickInterval: 2, tickFraction: 0.05, mods: [], removes: [], colour: '#4f9e3e' },
  { id: 'slow', name: 'Slow', duration: 10, tickInterval: 0, tickFraction: 0, mods: [pct('SPEED', -50)], removes: ['haste'], colour: '#7044a8' },
  { id: 'haste', name: 'Haste', duration: 15, tickInterval: 0, tickFraction: 0, mods: [pct('SPEED', 50)], removes: ['slow'], colour: '#eebb3e' },
  { id: 'barrier', name: 'Barrier', duration: 20, tickInterval: 0, tickFraction: 0, mods: [pct('DAMAGE_TAKEN', -50)], removes: [], colour: '#36a0c8' },
];

// ---------------------------------------------------------------------------------- XP
/** xp needed to go from level L to L+1 */
export const xpToNext = (level: number, base: number, exponent: number) => Math.round(base * Math.pow(level, exponent));
export function levelForXp(xp: number, base: number, exponent: number, cap = 50) {
  let level = 1;
  let need = xpToNext(1, base, exponent);
  while (xp >= need && level < cap) {
    xp -= need;
    level++;
    need = xpToNext(level, base, exponent);
  }
  return { level, into: xp, need };
}

// ------------------------------------------------------------------------------ helpers
export function blockFor(c: CharId, level: number, lo?: LoadoutState) {
  const b = new StatBlock();
  applyCharacter(b, CHARS[c], level);
  if (lo) applyLoadout(b, lo);
  return b;
}
export function blockForEnemy(e: EnemyId) {
  const b = new StatBlock();
  applyEnemy(b, ENEMIES[e]);
  return b;
}
export const fmt = (x: number, d = 2) => (Number.isInteger(x) ? String(x) : x.toFixed(d));
