import type { VizDef } from '../registry';
import { StatsLab } from './stats';
import { GearScreen } from './gear';
import { DamagePipeline } from './damage';
import { StatusTimeline } from './status';
import { AbilityComposer } from './skill';
import { ShardLearning } from './shard';
import { ProgressionSim } from './progression';

const oneOf = (v: unknown, xs: string[], name: string) => (v === undefined || xs.includes(v as string) ? null : `${name} must be one of ${xs.join(', ')}`);

export const VIZ: Record<string, VizDef> = {
  'rpg.stats': {
    component: StatsLab,
    validate: (s) => oneOf(s.char, ['kai', 'lyra', 'bram'], 'char') ?? (s.level === undefined || (typeof s.level === 'number' && s.level >= 1 && s.level <= 30) ? null : 'level must be 1..30'),
    doc: 'Modifier playground: character + level, toggle modifiers by source, flat→percent order and percent stacking switches, base/flat/percent/final table and the _recalculate arithmetic. Params: char, level, on (chip ids).',
  },
  'rpg.gear': {
    component: GearScreen,
    validate: (s) => oneOf(s.char, ['kai', 'lyra', 'bram'], 'char'),
    doc: 'Equipment screen: equip weapon/armour/accessory on Kai/Lyra/Bram, socket shards in linked sockets, set shard levels; live StatBlock with modifiers by source, element multipliers, granted abilities. Param: char.',
  },
  'rpg.damage': {
    component: DamagePipeline,
    validate: (s) => oneOf(s.attacker, ['kai', 'lyra', 'bram'], 'attacker') ?? oneOf(s.target, ['slime', 'bat', 'skeleton', 'golem'], 'target'),
    doc: 'Damage pipeline stepper: attacker, ability, target, stagger, barrier, crit roll; steps through DamageCalc.calculate highlighting the GDScript lines. Params: attacker, ability, target.',
  },
  'rpg.damage.status': {
    component: StatusTimeline,
    validate: (s) => oneOf(s.target, ['bram', 'skeleton'], 'target'),
    doc: 'Status effects timeline: apply poison/slow/haste/barrier at the current time; 30 s re-simulated at 60 Hz like StatusComponent; HP and speed plots and signal log. Param: target.',
  },
  'rpg.skill': {
    component: AbilityComposer,
    validate: (s) => oneOf(s.preset, ['Fire Wave', 'Venom Fang', 'Healing Light', 'Shield Bash'], 'preset'),
    doc: 'Ability composer: edit target type, area (circle/line/cone), cast time, costs and an ordered effect list; live .tres text; cast at dummies (J), aim with arrows, K interrupts. Param: preset.',
  },
  'rpg.shard': {
    component: ShardLearning,
    validate: (s) => oneOf(s.area, ['field', 'ruins', 'dungeon'], 'area'),
    doc: 'Learning simulator: AP per battle by area to every socketed shard (growth x2 toggle), weapon proficiency per use, battles scrubber, unlock event list. Param: area.',
  },
  'rpg.stats.progression': {
    component: ProgressionSim,
    validate: (s) => (s.base === undefined || typeof s.base === 'number' ? null : 'base must be a number'),
    doc: 'Progression simulator: XP curve round(a L^k), level after each fight across field/ruins/dungeon/boss vs target levels, stats per level per character. Params: base, exponent.',
  },
};
