// The battle simulation behind combat.battle and the k03-k05 lessons. Pure TypeScript (no DOM), so
// it runs in vitest and in the figure. Class and method names mirror the GDScript in the lessons:
//   AtbGauge (k04-1)            add(), can_spend(), spend(), tick(), signal segment_filled
//   StaggerComponent (k04-2)    apply_hit(), raise_multiplier(), tick(), signals pressured/staggered/recovered
//   AbilityData + AbilityRunner (k04-2)
//   PartyManager (k05-1)        switch_to(index), signal leader_changed
//   AIController (k05-2)        follow with spacing, basic attacks, guard; never spends ATB on its own
// Units are game pixels and seconds. The sim runs at a fixed step (60 Hz) like _physics_process.
import type { Action } from '../game/input';

export type BattleMode = 'atb' | 'stagger' | 'party' | 'full';
export type Element = 'none' | 'fire' | 'ice';
export type Facing = 'down' | 'up' | 'side';

/** What the sim reads from input. The figure passes the game kit's Input; tests pass a fake. */
export interface BattleInput {
  vector(): [number, number];
  isDown(a: Action): boolean;
  justPressed(a: Action): boolean;
}

// ------------------------------------------------------------------------------------ signals
/** A tiny stand-in for Godot signals: connect(callable), emit(args). */
export class Signal<A extends unknown[]> {
  private fns: ((...a: A) => void)[] = [];
  connect(fn: (...a: A) => void) {
    this.fns.push(fn);
  }
  emit(...a: A) {
    for (const f of this.fns) f(...a);
  }
}

// ------------------------------------------------------------------------------------ RNG
export class Rng {
  private s: number;
  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }
  next() {
    // mulberry32
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
}

// ------------------------------------------------------------------------------------ AtbGauge
/** k04-1: two segments of segment_size; landing hits and a slow passive charge fill it. */
export class AtbGauge {
  segment_size = 100;
  max_segments = 2;
  /** ATB per second while nothing else happens */
  passive_rate = 2;
  value = 0;
  readonly segment_filled = new Signal<[number]>();
  readonly changed = new Signal<[number, number]>();

  get maximum() {
    return this.segment_size * this.max_segments;
  }
  /** whole segments available to spend */
  segments() {
    return Math.floor(this.value / this.segment_size + 1e-9);
  }
  add(amount: number) {
    if (amount <= 0 || this.value >= this.maximum) return;
    const before = this.segments();
    this.value = Math.min(this.maximum, this.value + amount);
    const after = this.segments();
    this.changed.emit(this.value, this.maximum);
    if (after > before) this.segment_filled.emit(after);
  }
  can_spend(segments: number) {
    return this.segments() >= segments;
  }
  spend(segments: number) {
    if (!this.can_spend(segments)) return false;
    this.value -= segments * this.segment_size;
    this.changed.emit(this.value, this.maximum);
    return true;
  }
  /** called every physics frame (gameplay time, so tactical mode slows it too) */
  tick(delta: number) {
    this.add(this.passive_rate * delta);
  }
}

// ------------------------------------------------------------------------------------ StaggerComponent
export type StaggerState = 'normal' | 'pressured' | 'staggered';

/** k04-2: pressure, the stagger meter and the staggered state with its damage multiplier. */
export class StaggerComponent {
  stagger_max = 100;
  /** seconds a pressured state lasts after the hit that caused it */
  pressure_duration = 4;
  /** stagger gain multiplier while pressured */
  pressured_gain = 2;
  /** seconds the enemy stays staggered */
  stagger_duration = 6;
  /** damage multiplier when the stagger starts (1.6 = 160%) */
  base_multiplier = 1.6;
  max_multiplier = 3;
  /** the meter starts draining this long after the last hit... */
  decay_delay = 2.5;
  /** ...at this many points per second */
  decay_rate = 8;

  value = 0;
  state: StaggerState = 'normal';
  damage_multiplier = 1;
  /** time left in the pressured or staggered state */
  timer = 0;
  since_hit = 99;
  readonly pressured = new Signal<[]>();
  readonly staggered = new Signal<[]>();
  readonly recovered = new Signal<[]>();

  /** Returns the stagger actually added. */
  apply_hit(amount: number, pressures: boolean): number {
    if (this.state === 'staggered') return 0;
    this.since_hit = 0;
    if (pressures) {
      if (this.state === 'normal') {
        this.state = 'pressured';
        this.pressured.emit();
      }
      this.timer = this.pressure_duration;
    }
    const gain = amount * (this.state === 'pressured' ? this.pressured_gain : 1);
    this.value = Math.min(this.stagger_max, this.value + gain);
    if (this.value >= this.stagger_max) this.enter_stagger();
    return gain;
  }
  enter_stagger() {
    this.state = 'staggered';
    this.value = this.stagger_max;
    this.timer = this.stagger_duration;
    this.damage_multiplier = this.base_multiplier;
    this.staggered.emit();
  }
  /** Some abilities raise the multiplier while the target is staggered. */
  raise_multiplier(amount: number) {
    if (this.state !== 'staggered') return;
    this.damage_multiplier = Math.min(this.max_multiplier, this.damage_multiplier + amount);
  }
  tick(delta: number) {
    this.since_hit += delta;
    if (this.state === 'staggered') {
      this.timer -= delta;
      this.value = this.stagger_max * Math.max(0, this.timer / this.stagger_duration);
      if (this.timer <= 0) {
        this.state = 'normal';
        this.value = 0;
        this.damage_multiplier = 1;
        this.recovered.emit();
      }
      return;
    }
    if (this.state === 'pressured') {
      this.timer -= delta;
      if (this.timer <= 0) this.state = 'normal';
    }
    if (this.since_hit > this.decay_delay) this.value = Math.max(0, this.value - this.decay_rate * delta);
  }
}

// ------------------------------------------------------------------------------------ HealthComponent
export class HealthComponent {
  health: number;
  readonly health_changed = new Signal<[number, number]>();
  readonly died = new Signal<[]>();
  constructor(public max_health: number) {
    this.health = max_health;
  }
  damage(amount: number) {
    if (this.health <= 0) return;
    this.health = Math.max(0, this.health - amount);
    this.health_changed.emit(this.health, this.max_health);
    if (this.health === 0) this.died.emit();
  }
  heal(amount: number) {
    if (this.health <= 0) return;
    this.health = Math.min(this.max_health, this.health + amount);
    this.health_changed.emit(this.health, this.max_health);
  }
}

// ------------------------------------------------------------------------------------ AbilityData
export type TargetType = 'enemy' | 'ally' | 'ko_ally' | 'self' | 'all_enemies' | 'all_allies';
export type Effect = 'damage' | 'heal' | 'mp' | 'revive' | 'taunt';

/** k04-2: an ability is data (a Resource in Godot), executed by the AbilityRunner. */
export interface AbilityData {
  id: string;
  name: string;
  /** one line for the tactical menu */
  info: string;
  atb_cost: number;
  mp_cost: number;
  /** multiplies attack (physical) or magic (spells) */
  power: number;
  element: Element;
  target: TargetType;
  effect: Effect;
  physical: boolean;
  /** stagger added on hit */
  stagger: number;
  /** puts the target into the pressured state */
  pressures: boolean;
  /** added to the damage multiplier when the target is already staggered */
  multiplier_bonus: number;
  /** area radius around the target, 0 = single target */
  radius: number;
  /** heal amount (or MP for effect 'mp') */
  amount: number;
  /** px: how close the user must be */
  range: number;
  /** seconds of windup before the effect */
  cast_time: number;
  /** animation the user plays during the windup */
  animation: 'attack' | 'cast' | 'guard';
  fx: string;
  sound: string;
  /** limit breaks cost the full limit gauge instead of ATB */
  limit?: boolean;
  /** consumable item */
  item?: boolean;
}

const A = (p: Partial<AbilityData> & Pick<AbilityData, 'id' | 'name' | 'info'>): AbilityData => ({
  atb_cost: 1,
  mp_cost: 0,
  power: 0,
  element: 'none',
  target: 'enemy',
  effect: 'damage',
  physical: true,
  stagger: 0,
  pressures: false,
  multiplier_bonus: 0,
  radius: 0,
  amount: 0,
  range: 20,
  cast_time: 0.25,
  animation: 'attack',
  fx: 'fx_hit',
  sound: 'sfx_hit',
  ...p,
});

export const ABILITIES: Record<string, AbilityData> = {
  braver: A({ id: 'braver', name: 'Braver', info: 'Heavy blow. Big damage.', power: 4, stagger: 14, range: 20, cast_time: 0.3, fx: 'fx_slash', sound: 'sfx_crit' }),
  focus: A({ id: 'focus', name: 'Focus Strike', info: 'Builds stagger. +25% on staggered.', power: 1.5, stagger: 30, multiplier_bonus: 0.25, range: 20, cast_time: 0.2, fx: 'fx_slash', sound: 'sfx_hit' }),
  fire: A({ id: 'fire', name: 'Fire', info: 'Fire damage in a small area.', mp_cost: 6, power: 3.2, element: 'fire', physical: false, stagger: 12, radius: 18, range: 120, cast_time: 0.45, animation: 'cast', fx: 'fx_fireball', sound: 'sfx_fire' }),
  blizzard: A({ id: 'blizzard', name: 'Blizzard', info: 'Ice damage to one enemy.', mp_cost: 6, power: 3.6, element: 'ice', physical: false, stagger: 14, range: 120, cast_time: 0.45, animation: 'cast', fx: 'fx_ice', sound: 'sfx_ice' }),
  cure: A({ id: 'cure', name: 'Cure', info: 'Restore HP to one ally.', mp_cost: 8, target: 'ally', effect: 'heal', physical: false, amount: 60, range: 999, cast_time: 0.4, animation: 'cast', fx: 'fx_heal', sound: 'sfx_heal' }),
  bash: A({ id: 'bash', name: 'Shield Bash', info: 'Pressures the target.', power: 1.8, stagger: 22, pressures: true, multiplier_bonus: 0.1, range: 20, cast_time: 0.25, fx: 'fx_hit', sound: 'sfx_crit' }),
  taunt: A({ id: 'taunt', name: 'Provoke', info: 'Enemies target Bram for 8 s.', target: 'self', effect: 'taunt', range: 999, cast_time: 0.3, animation: 'guard', fx: 'fx_stagger', sound: 'sfx_menu_select' }),
  potion: A({ id: 'potion', name: 'Potion', info: 'Restore 70 HP.', target: 'ally', effect: 'heal', physical: false, amount: 70, range: 999, cast_time: 0.3, animation: 'cast', fx: 'fx_heal', sound: 'sfx_heal', item: true }),
  ether: A({ id: 'ether', name: 'Ether', info: 'Restore 20 MP.', target: 'ally', effect: 'mp', physical: false, amount: 20, range: 999, cast_time: 0.3, animation: 'cast', fx: 'fx_heal', sound: 'sfx_heal', item: true }),
  feather: A({ id: 'feather', name: 'Revive Feather', info: 'Revive a fallen ally.', target: 'ko_ally', effect: 'revive', physical: false, amount: 0.35, range: 999, cast_time: 0.35, animation: 'cast', fx: 'fx_heal', sound: 'sfx_levelup', item: true }),
  // limit breaks
  cross: A({ id: 'cross', name: 'Cross Slash', info: 'Limit: huge damage and stagger.', atb_cost: 0, power: 9, stagger: 45, multiplier_bonus: 0.3, range: 22, cast_time: 0.45, fx: 'fx_slash', sound: 'sfx_explosion', limit: true }),
  wind: A({ id: 'wind', name: 'Healing Wind', info: 'Limit: heal the whole party.', atb_cost: 0, target: 'all_allies', effect: 'heal', physical: false, amount: 0.6, range: 999, cast_time: 0.5, animation: 'cast', fx: 'fx_heal', sound: 'sfx_levelup', limit: true }),
  quake: A({ id: 'quake', name: 'Earthbreaker', info: 'Limit: hits every enemy.', atb_cost: 0, power: 3.5, stagger: 30, pressures: true, target: 'all_enemies', range: 999, cast_time: 0.5, fx: 'fx_explosion', sound: 'sfx_explosion', limit: true }),
};

// ------------------------------------------------------------------------------------ characters
export type CharId = 'kai' | 'lyra' | 'bram';

export interface CharacterDef {
  id: CharId;
  name: string;
  sheet: string;
  max_hp: number;
  max_mp: number;
  attack: number;
  magic: number;
  speed: number;
  /** ATB from one landed basic hit */
  atb_per_hit: number;
  passive_rate: number;
  /** ATB gained when a hit is blocked by guarding */
  guard_atb: number;
  /** damage taken while guarding, as a fraction */
  guard_factor: number;
  /** basic attack string */
  combo: number;
  startup: number;
  active: number;
  recovery: number;
  /** distance from the feet to the centre of the swing hitbox, and its radius */
  reach: number;
  hit_radius: number;
  basic_stagger: number;
  /** heavy hits make light enemies flinch */
  heavy: boolean;
  ranged: boolean;
  abilities: string[];
  limit: string;
  color: string;
}

export const CHARACTERS: Record<CharId, CharacterDef> = {
  kai: { id: 'kai', name: 'Kai', sheet: 'hero', max_hp: 140, max_mp: 12, attack: 7, magic: 4, speed: 84, atb_per_hit: 11, passive_rate: 2, guard_atb: 8, guard_factor: 0.35, combo: 3, startup: 0.07, active: 0.08, recovery: 0.15, reach: 12, hit_radius: 11, basic_stagger: 3, heavy: false, ranged: false, abilities: ['braver', 'focus'], limit: 'cross', color: '#3b82c4' },
  lyra: { id: 'lyra', name: 'Lyra', sheet: 'mage', max_hp: 100, max_mp: 48, attack: 4, magic: 10, speed: 76, atb_per_hit: 10, passive_rate: 3, guard_atb: 8, guard_factor: 0.4, combo: 2, startup: 0.14, active: 0.05, recovery: 0.32, reach: 0, hit_radius: 5, basic_stagger: 2, heavy: false, ranged: true, abilities: ['fire', 'blizzard', 'cure'], limit: 'wind', color: '#a35ad1' },
  bram: { id: 'bram', name: 'Bram', sheet: 'guard', max_hp: 190, max_mp: 10, attack: 11, magic: 3, speed: 70, atb_per_hit: 9, passive_rate: 2, guard_atb: 25, guard_factor: 0.2, combo: 2, startup: 0.17, active: 0.1, recovery: 0.3, reach: 13, hit_radius: 12, basic_stagger: 7, heavy: true, ranged: false, abilities: ['bash', 'taunt'], limit: 'quake', color: '#c7843b' },
};

export interface Intent {
  move: [number, number];
  wants_attack: boolean;
  wants_dodge: boolean;
  wants_guard: boolean;
}

export interface Command {
  ability: AbilityData;
  target: Unit | null;
}

export type CharState = 'idle' | 'move' | 'attack' | 'dodge' | 'guard' | 'ability' | 'hurt' | 'ko';
export type EnemyKind = 'dummy' | 'slime' | 'skeleton' | 'golem';
export type EnemyState = 'idle' | 'move' | 'windup' | 'attack' | 'recover' | 'hurt' | 'dead';

interface UnitBase {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  health: HealthComponent;
  flash: number;
}

export interface Character extends UnitBase {
  kind: 'party';
  index: number;
  def: CharacterDef;
  name: string;
  mp: number;
  atb: AtbGauge;
  limit: number;
  controller: 'player' | 'ai';
  intent: Intent;
  state: CharState;
  stateT: number;
  facing: Facing;
  flip: boolean;
  combo_step: number;
  attack_buffer: number;
  hit_set: Set<Enemy>;
  shot_fired: boolean;
  iframes: number;
  dodge_cd: number;
  dodge_dir: [number, number];
  queue: Command[];
  running: { cmd: Command; phase: 'approach' | 'windup' | 'recover'; t: number } | null;
  target: Enemy | null;
  /** AIController memory */
  ai: { cooldown: number; slot: number };
  /** measurement for the readouts: seconds the last segment took to fill */
  seg_clock: number;
  last_seg_time: number;
  atb_from_hits: number;
  atb_from_passive: number;
  atb_from_guard: number;
  anim_t: number;
}

export interface Enemy extends UnitBase {
  kind: 'enemy';
  type: EnemyKind;
  name: string;
  sheet: string;
  stagger: StaggerComponent | null;
  state: EnemyState;
  stateT: number;
  facing_x: number;
  flip: boolean;
  target: Character | null;
  last_attacker: Character | null;
  aggro_t: number;
  taunted_by: Character | null;
  taunt_t: number;
  cooldown: number;
  hit_set: Set<Character>;
  /** where an area attack lands (golem) */
  aim_x: number;
  aim_y: number;
  weak: Element;
  resist: Element;
  speed: number;
  damage: number;
  windup: number;
  active: number;
  recover: number;
  reach: number;
  flinches: 'always' | 'heavy' | 'never';
  pressure_on_windup: boolean;
  anim_t: number;
  dead_t: number;
  hop_phase: number;
}

export type Unit = Character | Enemy;

// ------------------------------------------------------------------------------------ PartyManager
/** k05-1: which Character the PlayerController drives. The others get AIControllers. */
export class PartyManager {
  current_index = 0;
  readonly leader_changed = new Signal<[Character]>();
  constructor(public members: Character[]) {
    members.forEach((m, i) => (m.controller = i === 0 ? 'player' : 'ai'));
  }
  get leader() {
    return this.members[this.current_index];
  }
  switch_to(index: number): boolean {
    const next = this.members[index];
    if (!next || index === this.current_index || next.state === 'ko') return false;
    this.leader.controller = 'ai';
    next.controller = 'player';
    this.current_index = index;
    this.leader_changed.emit(next);
    return true;
  }
  /** the next living member after the current one, or -1 */
  next_alive_index(from = this.current_index) {
    for (let k = 1; k <= this.members.length; k++) {
      const i = (from + k) % this.members.length;
      if (this.members[i].state !== 'ko') return i;
    }
    return -1;
  }
  all_ko() {
    return this.members.every((m) => m.state === 'ko');
  }
}

// ------------------------------------------------------------------------------------ the battle
export const ARENA = { x0: 14, y0: 30, x1: 306, y1: 138 };
export const TACTICAL_TIME_SCALE = 0.1;
/** basic hits from characters you are not controlling give this share of their ATB */
export const AI_ATB_SCALE = 0.5;

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: 'white' | 'weak' | 'stagger' | 'heal' | 'grey' | 'hurt' | 'mp';
  t: number;
  big: boolean;
}
export interface Fx {
  sheet: string;
  x: number;
  y: number;
  t: number;
  life: number;
  color: string;
}
export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  owner: Character;
}
export interface MenuEntry {
  ability: AbilityData;
  enabled: boolean;
  reason: string;
  count?: number;
}
export interface Menu {
  level: 'command' | 'target';
  who: number;
  cursor: number;
  entries: MenuEntry[];
  targets: Unit[];
  target_cursor: number;
  message: string;
  message_t: number;
  /** seconds tactical has been held since the menu opened (-1 once released) */
  hold: number;
}

export interface Tuning {
  atb_per_hit?: number;
  passive_rate?: number;
  stagger_max?: number;
  base_multiplier?: number;
  pressured_gain?: number;
}

export class BattleSim {
  mode: BattleMode;
  rng: Rng;
  party!: PartyManager;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  floaters: Floater[] = [];
  fx: Fx[] = [];
  sounds: string[] = [];
  menu: Menu | null = null;
  /** gameplay time scale: 1, or TACTICAL_TIME_SCALE while the menu is open */
  time_scale = 1;
  hitstop = 0;
  shake = 0;
  outcome: 'fighting' | 'victory' | 'defeat' = 'fighting';
  outcome_t = 0;
  wave = 1;
  waves: EnemyKind[][] = [];
  wave_banner = 0;
  banner = '';
  banner_t = 0;
  /** seconds of gameplay time since the battle began */
  clock = 0;
  real_clock = 0;
  items: Record<string, number> = {};
  limit_enabled: boolean;
  tuning: Tuning;
  log: string[] = [];

  constructor(mode: BattleMode, seed = 7, tuning: Tuning = {}) {
    this.mode = mode;
    this.rng = new Rng(seed);
    this.tuning = tuning;
    this.limit_enabled = mode === 'party' || mode === 'full';
    this.reset();
  }

  reset() {
    const m = this.mode;
    const ids: CharId[] = m === 'atb' || m === 'stagger' ? ['kai'] : ['kai', 'lyra', 'bram'];
    const members = ids.map((id, i) => this.makeCharacter(id, i));
    this.party = new PartyManager(members);
    this.enemies = [];
    this.projectiles = [];
    this.floaters = [];
    this.fx = [];
    this.sounds = [];
    this.menu = null;
    this.time_scale = 1;
    this.hitstop = 0;
    this.shake = 0;
    this.outcome = 'fighting';
    this.outcome_t = 0;
    this.clock = 0;
    this.real_clock = 0;
    this.wave = 1;
    this.wave_banner = 0;
    this.banner = '';
    this.banner_t = 0;
    this.log = [];
    this.items = m === 'atb' ? { potion: 3 } : m === 'stagger' ? { potion: 3 } : { potion: 4, ether: 2, feather: 1 };
    this.waves =
      m === 'atb' ? [['dummy']] : m === 'stagger' ? [['skeleton']] : m === 'party' ? [['slime', 'slime', 'skeleton'], ['skeleton', 'slime', 'skeleton']] : [['slime', 'slime', 'skeleton'], ['golem', 'slime']];
    this.spawnWave(0);
    if (m !== 'atb') for (const c of members) c.atb.value = 50;
  }

  makeCharacter(id: CharId, index: number): Character {
    const def = CHARACTERS[id];
    const atb = new AtbGauge();
    atb.passive_rate = this.tuning.passive_rate ?? def.passive_rate;
    const pos: [number, number][] = [
      [70, 92],
      [46, 74],
      [50, 112],
    ];
    const c: Character = {
      kind: 'party',
      index,
      def,
      name: def.name,
      x: pos[index][0],
      y: pos[index][1],
      vx: 0,
      vy: 0,
      radius: 5,
      health: new HealthComponent(def.max_hp),
      flash: 0,
      mp: def.max_mp,
      atb,
      limit: 0,
      controller: 'ai',
      intent: { move: [0, 0], wants_attack: false, wants_dodge: false, wants_guard: false },
      state: 'idle',
      stateT: 0,
      facing: 'side',
      flip: false,
      combo_step: 0,
      attack_buffer: 0,
      hit_set: new Set(),
      shot_fired: false,
      iframes: 0,
      dodge_cd: 0,
      dodge_dir: [1, 0],
      queue: [],
      running: null,
      target: null,
      ai: { cooldown: 0.3 + index * 0.25, slot: index },
      seg_clock: 0,
      last_seg_time: 0,
      atb_from_hits: 0,
      atb_from_passive: 0,
      atb_from_guard: 0,
      anim_t: 0,
    };
    atb.segment_filled.connect(() => {
      c.last_seg_time = c.seg_clock;
      c.seg_clock = 0;
      if (c.controller === 'player') this.sounds.push('sfx_atb_ready');
    });
    c.health.died.connect(() => this.onCharacterKo(c));
    return c;
  }

  makeEnemy(type: EnemyKind, x: number, y: number): Enemy {
    const base = {
      kind: 'enemy' as const,
      type,
      x,
      y,
      vx: 0,
      vy: 0,
      flash: 0,
      state: 'idle' as EnemyState,
      stateT: 0,
      facing_x: -1,
      flip: true,
      target: null,
      last_attacker: null,
      aggro_t: 0,
      taunted_by: null,
      taunt_t: 0,
      cooldown: 0.8 + this.rng.next() * 0.8,
      hit_set: new Set<Character>(),
      aim_x: x,
      aim_y: y,
      anim_t: this.rng.next(),
      dead_t: 0,
      hop_phase: this.rng.next(),
    };
    const stag = (max: number) => {
      const s = new StaggerComponent();
      s.stagger_max = this.tuning.stagger_max ?? max;
      if (this.tuning.base_multiplier !== undefined) s.base_multiplier = this.tuning.base_multiplier;
      if (this.tuning.pressured_gain !== undefined) s.pressured_gain = this.tuning.pressured_gain;
      return s;
    };
    let e: Enemy;
    if (type === 'dummy')
      e = { ...base, name: 'Dummy', sheet: '', radius: 6, health: new HealthComponent(99999), stagger: null, weak: 'none', resist: 'none', speed: 0, damage: 0, windup: 0, active: 0, recover: 0, reach: 0, flinches: 'always', pressure_on_windup: false };
    else if (type === 'slime')
      e = { ...base, name: 'Slime', sheet: 'slime', radius: 6, health: new HealthComponent(110), stagger: stag(45), weak: 'fire', resist: 'none', speed: 34, damage: 10, windup: 0.5, active: 0.28, recover: 0.5, reach: 30, flinches: 'always', pressure_on_windup: false };
    else if (type === 'skeleton')
      e = { ...base, name: 'Skeleton', sheet: 'skeleton', radius: 6, health: new HealthComponent(this.mode === 'stagger' ? 650 : 300), stagger: stag(100), weak: 'ice', resist: 'none', speed: 34, damage: 15, windup: 0.6, active: 0.14, recover: 0.6, reach: 17, flinches: 'heavy', pressure_on_windup: true };
    else
      e = { ...base, name: 'Golem', sheet: 'golem', radius: 11, health: new HealthComponent(1500), stagger: stag(200), weak: 'none', resist: 'fire', speed: 24, damage: 28, windup: 1.0, active: 0.12, recover: 0.9, reach: 30, flinches: 'never', pressure_on_windup: true };
    if (e.stagger) {
      e.stagger.staggered.connect(() => this.onStaggered(e));
      e.stagger.pressured.connect(() => this.addFloater(e.x, e.y - 30, 'PRESSURED', 'weak', false));
    }
    e.health.died.connect(() => this.onEnemyDied(e));
    return e;
  }

  spawnWave(i: number) {
    const kinds = this.waves[i] ?? [];
    const spots: Record<number, [number, number][]> = {
      1: [[230, 88]],
      2: [
        [250, 82],
        [215, 110],
      ],
      3: [
        [236, 66],
        [256, 112],
        [214, 90],
      ],
    };
    const pts = spots[kinds.length] ?? spots[3];
    kinds.forEach((k, j) => {
      const [x, y] = k === 'golem' ? [246, 86] : pts[j];
      this.enemies.push(this.makeEnemy(k, x, y));
    });
  }

  // ---------------------------------------------------------------------------- helpers
  get leader() {
    return this.party.leader;
  }
  aliveEnemies() {
    return this.enemies.filter((e) => e.state !== 'dead');
  }
  aliveMembers() {
    return this.party.members.filter((m) => m.state !== 'ko');
  }
  nearestEnemy(x: number, y: number, maxDist = Infinity): Enemy | null {
    let best: Enemy | null = null,
      bd = maxDist;
    for (const e of this.enemies) {
      if (e.state === 'dead') continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }
  addFloater(x: number, y: number, text: string, color: Floater['color'], big: boolean) {
    this.floaters.push({ x: x + this.rng.range(-3, 3), y, text, color, t: 0, big });
    if (this.floaters.length > 40) this.floaters.shift();
  }
  addFx(sheet: string, x: number, y: number, life = 0.4, color = '#fff') {
    this.fx.push({ sheet, x, y, t: 0, life, color });
    if (this.fx.length > 30) this.fx.shift();
  }
  say(msg: string) {
    this.log.push(msg);
    if (this.log.length > 6) this.log.shift();
  }

  // ---------------------------------------------------------------------------- main update
  /** One fixed step. `dt` is real time; gameplay uses dt * time_scale (Engine.time_scale in Godot). */
  update(dt: number, input: BattleInput) {
    this.real_clock += dt;
    this.updateFloaters(dt);
    if (this.banner_t > 0) this.banner_t -= dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 8);

    if (this.outcome !== 'fighting') {
      // let the last animations finish at normal speed; attack restarts after a short pause
      this.menu = null;
      this.time_scale = 1;
      this.outcome_t += dt;
      if (this.outcome_t > 1 && input.justPressed('attack')) {
        this.reset();
        return;
      }
      this.stepWorld(dt);
      return;
    }

    if (this.menu) this.updateMenu(dt, input);
    else {
      if (input.justPressed('tactical')) this.openMenu();
      else if (input.justPressed('switch') && this.party.members.length > 1) {
        const i = this.party.next_alive_index();
        if (i >= 0 && this.party.switch_to(i)) this.sounds.push('sfx_menu_move');
      }
    }
    this.time_scale = this.menu ? TACTICAL_TIME_SCALE : 1;
    this.readPlayerController(input);

    if (this.hitstop > 0) {
      // hitstop freezes gameplay for a few frames; real time still passes
      this.hitstop -= dt;
      return;
    }
    this.stepWorld(dt * this.time_scale);
  }

  private stepWorld(gdt: number) {
    this.clock += gdt;
    for (const c of this.party.members) {
      if (c.controller === 'ai') this.aiController(c, gdt);
      this.updateCharacter(c, gdt);
    }
    for (const e of this.enemies) this.updateEnemy(e, gdt);
    this.separate();
    this.updateProjectiles(gdt);
    for (const f of this.fx) f.t += gdt;
    this.fx = this.fx.filter((f) => f.t < f.life);
    this.enemies = this.enemies.filter((e) => !(e.state === 'dead' && e.dead_t > 0.7));
    this.checkOutcome(gdt);
  }

  private updateFloaters(dt: number) {
    for (const f of this.floaters) f.t += dt;
    if (this.floaters.length && this.floaters[0].t > 1) this.floaters = this.floaters.filter((f) => f.t < 1);
  }

  private checkOutcome(gdt: number) {
    if (this.outcome !== 'fighting') return;
    if (this.party.all_ko()) {
      this.outcome = 'defeat';
      this.banner = 'DEFEATED';
      this.banner_t = 999;
      this.sounds.push('sfx_hurt');
      return;
    }
    if (this.wave_banner > 0) {
      this.wave_banner -= gdt;
      if (this.wave_banner <= 0) this.spawnWave(this.wave - 1);
      return;
    }
    if (this.aliveEnemies().length === 0 && this.mode !== 'atb') {
      if (this.wave < this.waves.length) {
        this.wave++;
        this.wave_banner = 1.6;
        this.banner = this.waves[this.wave - 1].includes('golem') ? 'The golem wakes' : 'More enemies';
        this.banner_t = 1.6;
      } else {
        this.outcome = 'victory';
        this.banner = 'VICTORY';
        this.banner_t = 999;
        this.sounds.push('sfx_levelup');
      }
    }
  }

  // ---------------------------------------------------------------------------- PlayerController
  private readPlayerController(input: BattleInput) {
    const c = this.leader;
    const it = c.intent;
    if (this.menu || c.state === 'ko') {
      it.move = [0, 0];
      it.wants_attack = it.wants_dodge = it.wants_guard = false;
      return;
    }
    it.move = input.vector();
    // a short input buffer: a press 0.15 s before the character can act still counts
    if (input.justPressed('attack')) c.attack_buffer = 0.15;
    it.wants_attack = c.attack_buffer > 0;
    it.wants_dodge = input.justPressed('dash');
    it.wants_guard = input.isDown('ability');
  }

  // ---------------------------------------------------------------------------- AIController
  /** k05-2: follow with spacing, basic attacks, guard against telegraphs. Never spends ATB. */
  private aiController(c: Character, dt: number) {
    const it = c.intent;
    it.move = [0, 0];
    it.wants_attack = it.wants_dodge = it.wants_guard = false;
    if (c.state === 'ko' || c.running || c.queue.length) return;
    const leader = this.leader;
    const leaderTarget = leader.state !== 'ko' && leader.target && leader.target.state !== 'dead' ? leader.target : null;
    const target = leaderTarget ?? this.nearestEnemy(c.x, c.y);
    if (!target) {
      // no enemies: follow the leader, each ally to its own slot behind and to the side
      if (leader === c) return;
      const side = c.ai.slot % 2 === 1 ? -1 : 1;
      const back = leader.flip ? 1 : -1;
      const gx = leader.x + back * 16, gy = leader.y + side * 14;
      this.steer(it, c, gx, gy, 10);
      return;
    }
    c.target = target;
    // react to a telegraph aimed at this character (windup, and the attack frames that follow it)
    const threat = this.enemies.find(
      (e) => (e.state === 'windup' || e.state === 'attack') && (e.type === 'golem' ? Math.hypot(e.aim_x - c.x, e.aim_y - c.y) < e.reach + 8 : e.target === c && Math.hypot(e.x - c.x, e.y - c.y) < e.reach + 26),
    );
    if (threat) {
      if (c.def.id === 'bram' || (c.def.id === 'kai' && threat.type !== 'golem')) {
        it.wants_guard = true; // Bram's guard also builds his ATB
        return;
      }
      // Lyra (and Kai against the golem's slam) step out of the way
      const dx = c.x - (threat.type === 'golem' ? threat.aim_x : threat.x), dy = c.y - (threat.type === 'golem' ? threat.aim_y : threat.y), d = Math.hypot(dx, dy) || 1;
      it.move = [dx / d, dy / d];
      return;
    }
    // choose a spot around the target: melee allies take different sides, Lyra keeps her distance
    const want = c.def.ranged ? 62 : target.radius + c.radius + 6;
    const ang = Math.atan2(c.y - target.y, c.x - target.x);
    const slotAng = c.def.ranged ? ang : ang + (c.ai.slot - 1) * 0.35;
    const gx = target.x + Math.cos(slotAng) * want, gy = target.y + Math.sin(slotAng) * want * 0.8;
    const d = Math.hypot(target.x - c.x, target.y - c.y);
    const inRange = c.def.ranged ? d < 95 : d < want + 6;
    const free = c.state === 'idle' || c.state === 'move';
    if (free) c.ai.cooldown -= dt;
    if (inRange && c.ai.cooldown <= 0) {
      // basic attacks only: the string chains while wants_attack stays true
      it.wants_attack = true;
      if (c.state === 'attack' && c.combo_step >= c.def.combo - 1) c.ai.cooldown = (c.def.id === 'bram' ? 1.3 : c.def.ranged ? 1.1 : 1.0) * this.rng.range(0.8, 1.2);
    } else if (!inRange || (c.def.ranged && d < 40)) this.steer(it, c, gx, gy, 4);
  }

  private steer(it: Intent, c: Character, gx: number, gy: number, stopDist: number) {
    const dx = gx - c.x, dy = gy - c.y, d = Math.hypot(dx, dy);
    if (d < stopDist) return;
    const s = Math.min(1, d / 24);
    it.move = [(dx / d) * s, (dy / d) * s];
  }

  // ---------------------------------------------------------------------------- Character
  private updateCharacter(c: Character, dt: number) {
    c.anim_t += dt;
    c.stateT += dt;
    c.flash = Math.max(0, c.flash - dt * 6);
    if (c.state === 'ko') {
      c.vx = c.vy = 0;
      return;
    }
    c.iframes -= dt;
    c.dodge_cd -= dt;
    c.attack_buffer -= dt;
    c.seg_clock += dt;
    const before = c.atb.value;
    c.atb.tick(dt);
    c.atb_from_passive += c.atb.value - before;
    if (c.target && c.target.state === 'dead') c.target = null;
    if (c.controller === 'player') c.target = this.pickLockTarget(c);

    const it = c.intent;
    switch (c.state) {
      case 'hurt':
        this.friction(c, dt, 300);
        if (c.stateT >= 0.28) this.setState(c, 'idle');
        break;
      case 'dodge': {
        const sp = 200 * (1 - c.stateT / 0.22) + 40;
        c.vx = c.dodge_dir[0] * sp;
        c.vy = c.dodge_dir[1] * sp;
        if (c.stateT >= 0.22) {
          this.setState(c, 'idle');
          c.dodge_cd = 0.12;
        }
        break;
      }
      case 'attack':
        this.updateSwing(c, dt);
        break;
      case 'ability':
        this.updateRunner(c, dt);
        break;
      case 'guard':
        this.friction(c, dt, 600);
        if (!it.wants_guard) this.setState(c, 'idle');
        else if (this.tryStartQueued(c)) break;
        break;
      default: {
        if (this.tryStartQueued(c)) break;
        if (it.wants_dodge && c.dodge_cd <= 0) {
          const [mx, my] = it.move;
          const m = Math.hypot(mx, my);
          c.dodge_dir = m > 0.1 ? [mx / m, my / m] : this.facingVec(c);
          c.iframes = 0.2;
          this.setState(c, 'dodge');
          this.faceToward(c, c.x + c.dodge_dir[0], c.y + c.dodge_dir[1]);
          if (c.controller === 'player') this.sounds.push('sfx_dash');
          break;
        }
        if (it.wants_attack) {
          this.startSwing(c, 0);
          break;
        }
        if (it.wants_guard) {
          this.setState(c, 'guard');
          break;
        }
        const tx = it.move[0] * c.def.speed, ty = it.move[1] * c.def.speed;
        this.moveToward(c, tx, ty, 900 * dt);
        if (Math.hypot(it.move[0], it.move[1]) > 0.1) {
          this.faceToward(c, c.x + it.move[0], c.y + it.move[1]);
          c.state = 'move';
        } else if (c.state === 'move' && Math.hypot(c.vx, c.vy) < 5) c.state = 'idle';
      }
    }
    this.integrate(c, dt);
  }

  private pickLockTarget(c: Character): Enemy | null {
    // soft lock-on: keep the current target while it is reasonably close, else the nearest enemy
    if (c.target && c.target.state !== 'dead' && Math.hypot(c.target.x - c.x, c.target.y - c.y) < 70) return c.target;
    return this.nearestEnemy(c.x, c.y);
  }

  private setState(c: Character, s: CharState) {
    c.state = s;
    c.stateT = 0;
  }
  private friction(u: UnitBase, dt: number, f: number) {
    this.moveToward(u, 0, 0, f * dt);
  }
  private moveToward(u: UnitBase, tx: number, ty: number, step: number) {
    const dx = tx - u.vx, dy = ty - u.vy, d = Math.hypot(dx, dy);
    if (d <= step) {
      u.vx = tx;
      u.vy = ty;
    } else {
      u.vx += (dx / d) * step;
      u.vy += (dy / d) * step;
    }
  }
  private integrate(u: UnitBase, dt: number) {
    u.x = Math.max(ARENA.x0 + u.radius, Math.min(ARENA.x1 - u.radius, u.x + u.vx * dt));
    u.y = Math.max(ARENA.y0 + 4, Math.min(ARENA.y1, u.y + u.vy * dt));
  }
  private facingVec(c: Character): [number, number] {
    if (c.facing === 'side') return [c.flip ? -1 : 1, 0];
    return [0, c.facing === 'up' ? -1 : 1];
  }
  private faceToward(c: Character, x: number, y: number) {
    const dx = x - c.x, dy = y - c.y;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return;
    if (Math.abs(dx) >= Math.abs(dy)) {
      c.facing = 'side';
      c.flip = dx < 0;
    } else c.facing = dy < 0 ? 'up' : 'down';
  }

  // basic attack string: startup -> active (hitbox on) -> recovery; a buffered press chains
  private startSwing(c: Character, step: number) {
    this.setState(c, 'attack');
    c.combo_step = step;
    c.attack_buffer = 0;
    c.hit_set.clear();
    c.shot_fired = false;
    const t = c.target ?? this.nearestEnemy(c.x, c.y, c.def.ranged ? 160 : 48);
    if (t) this.faceToward(c, t.x, t.y);
    if (!c.def.ranged) {
      // a small lunge, so strings travel toward the target
      const [fx, fy] = t ? this.unit(t.x - c.x, t.y - c.y) : this.facingVec(c);
      const lunge = t && Math.hypot(t.x - c.x, t.y - c.y) > 16 ? 70 : 25;
      c.vx = fx * lunge;
      c.vy = fy * lunge;
    } else {
      c.vx *= 0.3;
      c.vy *= 0.3;
    }
    if (c.controller === 'player') this.sounds.push(c.def.ranged ? 'sfx_cast' : 'sfx_swing');
  }
  private unit(x: number, y: number): [number, number] {
    const d = Math.hypot(x, y) || 1;
    return [x / d, y / d];
  }
  private swingLength(c: Character) {
    const last = c.combo_step === c.def.combo - 1;
    return c.def.startup + c.def.active + c.def.recovery * (last ? 1.6 : 1);
  }

  private updateSwing(c: Character, dt: number) {
    const d = c.def;
    this.friction(c, dt, 500);
    const t = c.stateT;
    if (t >= d.startup && t < d.startup + d.active) {
      if (d.ranged) {
        if (!c.shot_fired) {
          c.shot_fired = true;
          const tgt = c.target ?? this.nearestEnemy(c.x, c.y, 200);
          const [ux, uy] = tgt ? this.unit(tgt.x - c.x, tgt.y - 6 - (c.y - 10)) : this.facingVec(c);
          this.projectiles.push({ x: c.x + ux * 8, y: c.y - 10, vx: ux * 170, vy: uy * 170, life: 1.0, owner: c });
        }
      } else {
        const [fx, fy] = this.facingVec(c);
        const hx = c.x + fx * d.reach, hy = c.y - 6 + fy * d.reach * 0.8;
        for (const e of this.enemies) {
          if (e.state === 'dead' || c.hit_set.has(e)) continue;
          if (Math.hypot(e.x - hx, e.y - 6 - hy) < d.hit_radius + e.radius) {
            c.hit_set.add(e);
            this.basicHit(c, e);
          }
        }
      }
    }
    const chainOpen = t >= d.startup + d.active;
    if (chainOpen && c.intent.wants_attack && c.combo_step < d.combo - 1) {
      this.startSwing(c, c.combo_step + 1);
      return;
    }
    if (chainOpen && c.intent.wants_dodge && c.dodge_cd <= 0) {
      // dodge cancels recovery
      this.setState(c, 'idle');
      return;
    }
    if (t >= this.swingLength(c)) this.setState(c, 'idle');
  }

  private updateProjectiles(dt: number) {
    for (const p of this.projectiles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      for (const e of this.enemies) {
        if (e.state === 'dead') continue;
        if (Math.hypot(e.x - p.x, e.y - 8 - p.y) < e.radius + 4) {
          p.life = 0;
          this.basicHit(p.owner, e);
          break;
        }
      }
      if (p.x < ARENA.x0 || p.x > ARENA.x1 || p.y < ARENA.y0 - 20 || p.y > ARENA.y1) p.life = 0;
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0);
  }

  // ---------------------------------------------------------------------------- hits on enemies
  /** A landed basic attack: damage, a little stagger, and ATB for the attacker. */
  private basicHit(c: Character, e: Enemy) {
    const power = c.combo_step === c.def.combo - 1 ? 1.3 : 1;
    this.hitEnemy(c, e, { power, element: 'none', physical: !c.def.ranged, stagger: c.def.basic_stagger, pressures: false, multiplier_bonus: 0, heavy: c.def.heavy });
    const gain = (this.tuning.atb_per_hit ?? c.def.atb_per_hit) * (c.controller === 'player' ? 1 : AI_ATB_SCALE);
    const before = c.atb.value;
    c.atb.add(gain);
    c.atb_from_hits += c.atb.value - before;
    if (this.limit_enabled) c.limit = Math.min(100, c.limit + 0.5);
    if (c.controller === 'player') {
      this.hitstop = Math.max(this.hitstop, c.def.heavy ? 0.07 : 0.04);
      this.sounds.push('sfx_hit');
    }
  }

  /** The damage pipeline from r01, reduced: power x stat x element x stagger multiplier. */
  hitEnemy(c: Character, e: Enemy, h: { power: number; element: Element; physical: boolean; stagger: number; pressures: boolean; multiplier_bonus: number; heavy: boolean }) {
    const stat = h.physical ? c.def.attack : c.def.magic;
    const weak = h.element !== 'none' && e.weak === h.element;
    const resist = h.element !== 'none' && e.resist === h.element;
    const elem = weak ? 1.5 : resist ? 0.5 : 1;
    const mult = e.stagger?.damage_multiplier ?? 1;
    const wasStaggered = e.stagger?.state === 'staggered';
    const amount = Math.max(1, Math.round(stat * h.power * elem * mult * this.rng.range(0.92, 1.08)));
    e.health.damage(amount);
    e.flash = 1;
    e.last_attacker = c;
    e.aggro_t = 3;
    // pressure: weakness hits, abilities that pressure, and punishing a windup
    const punish = e.state === 'windup' && e.pressure_on_windup;
    if (e.stagger && e.state !== 'dead') {
      e.stagger.apply_hit(h.stagger * (weak ? 1.5 : 1), h.pressures || weak || punish);
      if (wasStaggered && h.multiplier_bonus > 0) {
        e.stagger.raise_multiplier(h.multiplier_bonus);
        this.addFloater(e.x, e.y - 34, `x${e.stagger.damage_multiplier.toFixed(2)}`, 'stagger', false);
      }
    }
    const color: Floater['color'] = weak ? 'weak' : mult > 1 ? 'stagger' : 'white';
    if (e.type === 'dummy') e.health.health = e.health.max_health;
    this.addFloater(e.x, e.y - 22, String(amount), color, h.power >= 3 || mult > 1.5);
    if (weak) this.addFloater(e.x, e.y - 30, 'WEAK', 'weak', false);
    // flinch: light enemies on any hit, sturdier ones only on heavy hits
    if (e.state !== 'dead' && e.stagger?.state !== 'staggered') {
      const flinch = e.flinches === 'always' || (e.flinches === 'heavy' && (h.heavy || h.power >= 1.5));
      if (flinch) {
        e.state = 'hurt';
        e.stateT = 0;
        const [ux, uy] = this.unit(e.x - c.x, e.y - c.y);
        e.vx = ux * (e.type === 'slime' ? 90 : 45);
        e.vy = uy * (e.type === 'slime' ? 90 : 45);
      }
    }
  }

  private onStaggered(e: Enemy) {
    e.state = e.state === 'dead' ? 'dead' : 'hurt';
    e.stateT = 0;
    e.vx = e.vy = 0;
    this.addFloater(e.x, e.y - 36, 'STAGGERED', 'stagger', true);
    this.addFx('fx_stagger', e.x, e.y - 24, 0.6);
    this.sounds.push('sfx_stagger');
    this.shake = Math.max(this.shake, 2);
    this.say(`${e.name} is staggered: damage x${e.stagger!.base_multiplier.toFixed(2)}`);
    if (this.limit_enabled) for (const m of this.aliveMembers()) m.limit = Math.min(100, m.limit + 10);
  }

  private onEnemyDied(e: Enemy) {
    e.state = 'dead';
    e.stateT = 0;
    e.dead_t = 0;
    e.vx = e.vy = 0;
    this.addFx('fx_explosion', e.x, e.y - 8, 0.5);
    this.sounds.push('sfx_explosion');
    for (const m of this.party.members) if (m.target === e) m.target = null;
  }

  private onCharacterKo(c: Character) {
    c.state = 'ko';
    c.stateT = 0;
    c.queue = [];
    c.running = null;
    this.say(`${c.name} is down`);
    if (this.menu && this.menu.who === c.index) this.closeMenu();
    if (c.controller === 'player') {
      const i = this.party.next_alive_index();
      if (i >= 0) this.party.switch_to(i);
    }
  }

  // ---------------------------------------------------------------------------- hits on the party
  private hurtCharacter(c: Character, amount: number, from: Enemy) {
    if (c.state === 'ko') return;
    if (c.iframes > 0) {
      this.addFloater(c.x, c.y - 24, 'DODGE', 'grey', false);
      return;
    }
    const guarding = c.state === 'guard';
    const dealt = Math.max(1, Math.round(amount * (guarding ? c.def.guard_factor : 1) * this.rng.range(0.92, 1.08)));
    if (guarding) {
      const before = c.atb.value;
      c.atb.add(c.def.guard_atb);
      c.atb_from_guard += c.atb.value - before;
      this.addFloater(c.x, c.y - 30, 'GUARD', 'grey', false);
      this.sounds.push('sfx_land');
    } else this.sounds.push('sfx_hurt');
    if (this.limit_enabled) c.limit = Math.min(100, c.limit + (dealt / c.def.max_hp) * 90);
    c.health.damage(dealt);
    c.flash = 1;
    this.addFloater(c.x, c.y - 22, String(dealt), 'hurt', false);
    if ((c.state as CharState) === 'ko') return; // the died signal may have changed it
    if (!guarding && c.state !== 'ability') {
      // abilities have super armour; everything else is interrupted
      c.state = 'hurt';
      c.stateT = 0;
      const [ux, uy] = this.unit(c.x - from.x, c.y - from.y);
      c.vx = ux * 110;
      c.vy = uy * 110;
    }
    if (c.controller === 'player') this.shake = Math.max(this.shake, 1.5);
  }

  // ---------------------------------------------------------------------------- Enemy AI
  private updateEnemy(e: Enemy, dt: number) {
    e.anim_t += dt;
    e.stateT += dt;
    e.flash = Math.max(0, e.flash - dt * 6);
    if (e.state === 'dead') {
      e.dead_t += dt;
      return;
    }
    e.stagger?.tick(dt);
    e.aggro_t -= dt;
    e.taunt_t -= dt;
    if (e.type === 'dummy') {
      this.friction(e, dt, 400);
      if (e.state === 'hurt' && e.stateT > 0.2) e.state = 'idle';
      this.integrateEnemy(e, dt);
      return;
    }
    if (this.wave_banner > 0 || this.outcome !== 'fighting') {
      this.friction(e, dt, 400);
      if (e.state !== 'hurt') e.state = 'idle';
      this.integrateEnemy(e, dt);
      return;
    }
    if (e.stagger?.state === 'staggered') {
      // helpless: no actions until the stagger ends
      this.friction(e, dt, 400);
      if (e.state !== 'hurt') {
        e.state = 'hurt';
        e.stateT = 0;
      }
      this.integrateEnemy(e, dt);
      return;
    }
    // target: a taunt wins, then whoever hit it recently, then the nearest party member
    const alive = this.aliveMembers();
    if (e.taunt_t > 0 && e.taunted_by && e.taunted_by.state !== 'ko') e.target = e.taunted_by;
    else if (e.aggro_t > 0 && e.last_attacker && e.last_attacker.state !== 'ko' && e.state !== 'windup' && e.state !== 'attack') e.target = e.last_attacker;
    else if (!e.target || e.target.state === 'ko') {
      let best: Character | null = null,
        bd = Infinity;
      for (const m of alive) {
        const d = Math.hypot(m.x - e.x, m.y - e.y);
        if (d < bd) {
          bd = d;
          best = m;
        }
      }
      e.target = best;
    }
    const t = e.target;
    switch (e.state) {
      case 'hurt':
        this.friction(e, dt, 350);
        if (e.stateT >= (e.type === 'slime' ? 0.35 : 0.3)) e.state = 'idle';
        break;
      case 'windup':
        this.friction(e, dt, 600);
        if (e.stateT >= e.windup) {
          e.state = 'attack';
          e.stateT = 0;
          e.hit_set.clear();
          if (e.type === 'slime' && t) {
            const [ux, uy] = this.unit(e.aim_x - e.x, e.aim_y - e.y);
            e.vx = ux * 150;
            e.vy = uy * 150;
          }
          if (e.type === 'golem') {
            this.shake = Math.max(this.shake, 3);
            this.addFx('fx_explosion', e.aim_x, e.aim_y, 0.45);
            this.sounds.push('sfx_explosion');
          }
        }
        break;
      case 'attack':
        this.enemyAttackFrame(e);
        if (e.type === 'slime') this.friction(e, dt, 200);
        else this.friction(e, dt, 800);
        if (e.stateT >= e.active) {
          e.state = 'recover';
          e.stateT = 0;
        }
        break;
      case 'recover':
        this.friction(e, dt, 500);
        if (e.stateT >= e.recover) {
          e.state = 'idle';
          e.cooldown = (e.type === 'golem' ? 0.4 : 0.5) + this.rng.next() * 0.7;
        }
        break;
      default: {
        e.cooldown -= dt;
        if (!t) {
          this.friction(e, dt, 300);
          break;
        }
        const dx = t.x - e.x, dy = t.y - e.y, d = Math.hypot(dx, dy);
        e.facing_x = dx < 0 ? -1 : 1;
        e.flip = dx < 0;
        if (d < e.reach + t.radius && e.cooldown <= 0) {
          e.state = 'windup';
          e.stateT = 0;
          // lock the aim at the start of the telegraph so a dodge or step away works
          if (e.type === 'golem') {
            const [ux, uy] = this.unit(dx, dy);
            e.aim_x = e.x + ux * 20;
            e.aim_y = e.y + uy * 14;
          } else {
            e.aim_x = t.x;
            e.aim_y = t.y;
          }
        } else if (d > e.reach * 0.7) {
          const sp = e.type === 'slime' ? e.speed * (0.5 + 0.5 * Math.abs(Math.sin((e.anim_t + e.hop_phase) * 5))) : e.speed;
          this.moveToward(e, (dx / d) * sp, (dy / d) * sp, 400 * dt);
          e.state = 'move';
        } else {
          this.friction(e, dt, 400);
          e.state = 'idle';
        }
      }
    }
    this.integrateEnemy(e, dt);
  }

  private integrateEnemy(e: Enemy, dt: number) {
    this.integrate(e, dt);
  }

  private enemyAttackFrame(e: Enemy) {
    for (const m of this.party.members) {
      if (m.state === 'ko' || e.hit_set.has(m)) continue;
      let hit = false;
      if (e.type === 'golem') hit = Math.hypot(m.x - e.aim_x, m.y - e.aim_y) < e.reach;
      else if (e.type === 'slime') hit = Math.hypot(m.x - e.x, m.y - e.y) < e.radius + m.radius + 3;
      else {
        const hx = e.x + e.facing_x * 12, hy = e.y;
        hit = Math.hypot(m.x - hx, m.y - hy) < 12 + m.radius;
      }
      if (hit) {
        e.hit_set.add(m);
        this.hurtCharacter(m, e.damage, e);
      }
    }
  }

  /** keep bodies from overlapping (a cheap stand-in for collision shapes) */
  private separate() {
    const all: UnitBase[] = [...this.party.members.filter((m) => m.state !== 'ko' && m.state !== 'dodge'), ...this.enemies.filter((e) => e.state !== 'dead')];
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i], b = all[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.radius + b.radius;
        if (d > 0.001 && d < min) {
          // heavier bodies (mass ~ radius squared) move less: the party cannot shove the golem around
          const wa = a.radius * a.radius, wb = b.radius * b.radius;
          const overlap = min - d;
          const pa = (overlap * wb) / (wa + wb), pb = (overlap * wa) / (wa + wb);
          a.x -= (dx / d) * pa;
          a.y -= (dy / d) * pa;
          b.x += (dx / d) * pb;
          b.y += (dy / d) * pb;
        }
      }
  }

  // ---------------------------------------------------------------------------- AbilityRunner
  /** Start the next queued command when the character is free. */
  private tryStartQueued(c: Character) {
    if (!c.queue.length || c.running) return false;
    const cmd = c.queue.shift()!;
    c.running = { cmd, phase: 'approach', t: 0 };
    this.setState(c, 'ability');
    return true;
  }

  private retarget(c: Character, cmd: Command): boolean {
    const a = cmd.ability;
    const t = cmd.target;
    if (a.target === 'enemy' && (!t || (t.kind === 'enemy' && t.state === 'dead'))) {
      cmd.target = this.nearestEnemy(c.x, c.y);
      return !!cmd.target;
    }
    if (a.target === 'ally' && t && t.kind === 'party' && t.state === 'ko') return false;
    if (a.target === 'ko_ally' && t && t.kind === 'party' && t.state !== 'ko') return false;
    return true;
  }

  private refund(c: Character, a: AbilityData) {
    if (a.limit) c.limit = 100;
    else c.atb.value = Math.min(c.atb.maximum, c.atb.value + a.atb_cost * c.atb.segment_size);
    c.mp = Math.min(c.def.max_mp, c.mp + a.mp_cost);
    if (a.item) this.items[a.id] = (this.items[a.id] ?? 0) + 1;
  }

  private updateRunner(c: Character, dt: number) {
    const r = c.running;
    if (!r) {
      this.setState(c, 'idle');
      return;
    }
    const a = r.cmd.ability;
    r.t += dt;
    if (r.phase === 'approach') {
      if (!this.retarget(c, r.cmd)) {
        this.refund(c, a);
        c.running = null;
        this.setState(c, 'idle');
        return;
      }
      const t = r.cmd.target;
      const d = t ? Math.hypot(t.x - c.x, t.y - c.y) : 0;
      if (t && t !== c && a.target === 'enemy' && d > a.range + (t.radius ?? 0)) {
        if (r.t > 2.5) {
          this.refund(c, a);
          c.running = null;
          this.setState(c, 'idle');
          return;
        }
        const [ux, uy] = this.unit(t.x - c.x, t.y - c.y);
        this.moveToward(c, ux * c.def.speed * 1.3, uy * c.def.speed * 1.3, 1200 * dt);
        this.faceToward(c, t.x, t.y);
        return;
      }
      if (t && t !== c) this.faceToward(c, t.x, t.y);
      r.phase = 'windup';
      r.t = 0;
      c.vx = c.vy = 0;
      this.sounds.push(a.physical ? 'sfx_swing' : 'sfx_cast');
      return;
    }
    this.friction(c, dt, 800);
    if (r.phase === 'windup' && r.t >= a.cast_time) {
      this.resolve(c, r.cmd);
      r.phase = 'recover';
      r.t = 0;
      return;
    }
    if (r.phase === 'recover' && r.t >= 0.3) {
      c.running = null;
      this.setState(c, 'idle');
    }
  }

  /** AbilityRunner.execute: apply the ability's effect to its target(s). */
  private resolve(c: Character, cmd: Command) {
    const a = cmd.ability;
    this.sounds.push(a.sound);
    this.say(`${c.name}: ${a.name}`);
    if (a.limit) this.banner = a.name;
    if (a.limit) this.banner_t = 1.0;
    const t = cmd.target;
    const hit = (e: Enemy) => this.hitEnemy(c, e, { power: a.power, element: a.element, physical: a.physical, stagger: a.stagger, pressures: a.pressures, multiplier_bonus: a.multiplier_bonus, heavy: true });
    switch (a.effect) {
      case 'damage': {
        if (a.target === 'all_enemies') {
          for (const e of this.aliveEnemies()) {
            hit(e);
            this.addFx(a.fx, e.x, e.y - 8, 0.5);
          }
          this.shake = Math.max(this.shake, 3);
          break;
        }
        if (!t || t.kind !== 'enemy' || t.state === 'dead') break;
        this.addFx(a.fx, t.x, t.y - 8, 0.5);
        if (a.radius > 0) {
          for (const e of this.aliveEnemies()) if (Math.hypot(e.x - t.x, e.y - t.y) <= a.radius + e.radius) hit(e);
        } else hit(t);
        this.hitstop = Math.max(this.hitstop, 0.08);
        this.shake = Math.max(this.shake, 1.5);
        break;
      }
      case 'heal': {
        const targets = a.target === 'all_allies' ? this.aliveMembers() : t && t.kind === 'party' ? [t] : [];
        for (const m of targets) {
          const amt = a.amount <= 1 ? Math.round(m.def.max_hp * a.amount) : a.amount;
          const before = m.health.health;
          m.health.heal(amt);
          this.addFloater(m.x, m.y - 24, String(m.health.health - before), 'heal', false);
          this.addFx('fx_heal', m.x, m.y - 10, 0.6);
        }
        break;
      }
      case 'mp':
        if (t && t.kind === 'party') {
          const before = t.mp;
          t.mp = Math.min(t.def.max_mp, t.mp + a.amount);
          this.addFloater(t.x, t.y - 24, `${t.mp - before} MP`, 'mp', false);
          this.addFx('fx_heal', t.x, t.y - 10, 0.6);
        }
        break;
      case 'revive':
        if (t && t.kind === 'party' && t.state === 'ko') {
          t.health.health = Math.round(t.def.max_hp * a.amount);
          t.state = 'idle';
          t.stateT = 0;
          this.addFloater(t.x, t.y - 24, 'REVIVED', 'heal', false);
          this.addFx('fx_heal', t.x, t.y - 10, 0.8);
        }
        break;
      case 'taunt':
        for (const e of this.aliveEnemies()) {
          e.taunted_by = c;
          e.taunt_t = 8;
          e.target = c;
        }
        this.addFloater(c.x, c.y - 30, 'PROVOKE', 'weak', false);
        break;
    }
  }

  // ---------------------------------------------------------------------------- tactical menu
  /** Commands available to party member `who`, with whether each can be afforded now. */
  entriesFor(who: number): MenuEntry[] {
    const c = this.party.members[who];
    const list: MenuEntry[] = [];
    if (this.limit_enabled) {
      const a = ABILITIES[c.def.limit];
      list.push({ ability: a, enabled: c.limit >= 100, reason: c.limit >= 100 ? '' : 'Limit gauge not full' });
    }
    for (const id of c.def.abilities) {
      const a = ABILITIES[id];
      const reserved = c.queue.reduce((s, q) => s + q.ability.atb_cost, 0);
      const okAtb = c.atb.segments() >= a.atb_cost;
      const okMp = c.mp >= a.mp_cost;
      list.push({ ability: a, enabled: okAtb && okMp && reserved + a.atb_cost <= 2, reason: !okAtb ? 'Not enough ATB' : !okMp ? 'Not enough MP' : '' });
    }
    for (const id of Object.keys(this.items)) {
      const a = ABILITIES[id];
      const n = this.items[id];
      const okAtb = c.atb.segments() >= a.atb_cost;
      list.push({ ability: a, enabled: n > 0 && okAtb, reason: n <= 0 ? 'None left' : !okAtb ? 'Not enough ATB' : '', count: n });
    }
    return list;
  }

  openMenu() {
    const who = this.party.current_index;
    const entries = this.entriesFor(who);
    const first = entries.findIndex((e) => e.enabled && !e.ability.limit);
    this.menu = { level: 'command', who, cursor: Math.max(0, first >= 0 ? first : entries.findIndex((e) => !e.ability.limit)), entries, targets: [], target_cursor: 0, message: '', message_t: 0, hold: 0 };
    this.sounds.push('sfx_menu_select');
  }
  closeMenu() {
    this.menu = null;
    this.time_scale = 1;
  }

  targetsFor(a: AbilityData, user: Character): Unit[] {
    switch (a.target) {
      case 'enemy':
        return this.aliveEnemies().sort((p, q) => p.x - q.x || p.y - q.y);
      case 'ally':
        return this.aliveMembers();
      case 'ko_ally':
        return this.party.members.filter((m) => m.state === 'ko');
      case 'self':
        return [user];
      default:
        return [user];
    }
  }

  private updateMenu(dt: number, input: BattleInput) {
    const m = this.menu!;
    if (m.message_t > 0) m.message_t -= dt;
    // keep the entries current: ATB still trickles in at the slowed rate
    m.entries = this.entriesFor(m.who);
    if (input.justPressed('tactical')) {
      this.closeMenu();
      this.sounds.push('sfx_menu_back');
      return;
    }
    // tactical works as a toggle (tap) or held (release after holding closes the menu)
    if (m.hold >= 0) {
      if (input.isDown('tactical')) m.hold += dt;
      else if (m.hold > 0.4) {
        this.closeMenu();
        this.sounds.push('sfx_menu_back');
        return;
      } else m.hold = -1;
    }
    if (m.level === 'command') {
      const n = m.entries.length;
      if (input.justPressed('down')) {
        m.cursor = (m.cursor + 1) % n;
        this.sounds.push('sfx_menu_move');
      }
      if (input.justPressed('up')) {
        m.cursor = (m.cursor + n - 1) % n;
        this.sounds.push('sfx_menu_move');
      }
      const k = this.party.members.length;
      const step = input.justPressed('right') || input.justPressed('switch') ? 1 : input.justPressed('left') ? -1 : 0;
      if (step && k > 1) {
        // choose which character to command; KO'd members are skipped
        for (let s = 1; s <= k; s++) {
          const i = (m.who + step * s + k * 4) % k;
          if (this.party.members[i].state !== 'ko') {
            m.who = i;
            break;
          }
        }
        m.entries = this.entriesFor(m.who);
        m.cursor = Math.min(m.cursor, m.entries.length - 1);
        this.sounds.push('sfx_menu_move');
      }
      if (input.justPressed('dash')) {
        this.closeMenu();
        this.sounds.push('sfx_menu_back');
        return;
      }
      if (input.justPressed('attack')) {
        const e = m.entries[m.cursor];
        if (!e.enabled) {
          m.message = e.reason;
          m.message_t = 1.2;
          this.sounds.push('sfx_menu_back');
          return;
        }
        const user = this.party.members[m.who];
        m.targets = this.targetsFor(e.ability, user);
        if (!m.targets.length) {
          m.message = 'No target';
          m.message_t = 1.2;
          this.sounds.push('sfx_menu_back');
          return;
        }
        if (e.ability.target === 'self' || e.ability.target === 'all_allies' || e.ability.target === 'all_enemies') {
          this.confirm(user, e.ability, user);
          return;
        }
        m.level = 'target';
        // default target: the leader's lock-on for attacks, the most hurt ally for heals
        if (e.ability.target === 'enemy') {
          const lock = this.leader.target ?? user.target;
          m.target_cursor = Math.max(0, lock ? m.targets.indexOf(lock) : 0);
        } else if (e.ability.target === 'ally') {
          let best = 0;
          m.targets.forEach((u, i) => {
            const a = u as Character, b = m.targets[best] as Character;
            if (a.health.health / a.health.max_health < b.health.health / b.health.max_health) best = i;
          });
          m.target_cursor = best;
        } else m.target_cursor = 0;
        this.sounds.push('sfx_menu_select');
      }
    } else {
      // keep the list current (an enemy may die while you choose)
      const user = this.party.members[m.who];
      const ab = m.entries[m.cursor]?.ability;
      const cur = m.targets[m.target_cursor];
      if (ab) {
        m.targets = this.targetsFor(ab, user);
        const idx = cur ? m.targets.indexOf(cur) : -1;
        m.target_cursor = idx >= 0 ? idx : Math.min(m.target_cursor, Math.max(0, m.targets.length - 1));
      }
      const n = m.targets.length;
      if (!n || !ab) {
        m.level = 'command';
        return;
      }
      if (input.justPressed('right') || input.justPressed('down')) {
        m.target_cursor = (m.target_cursor + 1) % n;
        this.sounds.push('sfx_menu_move');
      }
      if (input.justPressed('left') || input.justPressed('up')) {
        m.target_cursor = (m.target_cursor + n - 1) % n;
        this.sounds.push('sfx_menu_move');
      }
      if (input.justPressed('dash')) {
        m.level = 'command';
        this.sounds.push('sfx_menu_back');
        return;
      }
      if (input.justPressed('attack')) this.confirm(user, ab, m.targets[m.target_cursor]);
    }
  }

  /** Commit a command: pay its cost now and queue it on the character. */
  confirm(user: Character, a: AbilityData, target: Unit | null) {
    if (a.limit) {
      if (user.limit < 100) return false;
      user.limit = 0;
    } else {
      if (!user.atb.spend(a.atb_cost)) return false;
      if (user.mp < a.mp_cost) {
        user.atb.value += a.atb_cost * user.atb.segment_size;
        return false;
      }
      user.mp -= a.mp_cost;
    }
    if (a.item) this.items[a.id]--;
    user.queue.push({ ability: a, target });
    this.sounds.push('sfx_menu_select');
    this.closeMenu();
    return true;
  }

  /** Queue a command directly (used by tests and the lesson figures). */
  command(who: number, abilityId: string, target: Unit | null) {
    const user = this.party.members[who];
    const a = ABILITIES[abilityId];
    if (!user || !a || user.state === 'ko') return false;
    return this.confirm(user, a, target ?? (a.target === 'enemy' ? this.nearestEnemy(user.x, user.y) : user));
  }
}
