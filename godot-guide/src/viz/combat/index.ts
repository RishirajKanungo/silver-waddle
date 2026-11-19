import type { VizDef } from '../registry';
import type { VizSpec } from '../../content/types';
import { BattleFigure, isBattleMode } from './battle';
import { DesignSpace } from './designspace';
import { DesignLoop } from './designloop';
import { Pace } from './pace';
import { Tactical } from './tactical';
import { StaggerLab } from './staggerlab';
import { BattleFlow } from './flow';
import { PartyTree } from './partytree';
import { PartyFollow } from './follow';

const oneOf = (key: string, values: string[]) => (s: VizSpec) => (s[key] === undefined || values.includes(s[key] as string) ? null : `${key} must be one of ${values.join(', ')}`);

export const VIZ: Record<string, VizDef> = {
  'combat.battle': {
    component: BattleFigure,
    validate: (s) => (s.mode === undefined || isBattleMode(s.mode) ? null : "mode must be 'atb', 'stagger', 'party' or 'full'"),
    doc: "Playable mini battle (Kai, Lyra, Bram vs slimes, skeleton, golem). mode 'atb' (Kai + dummy, ATB sliders), 'stagger' (Kai vs skeleton, stagger sliders), 'party' (switching, commands), 'full' (two waves with the golem, limit breaks).",
  },
  'combat.designspace': {
    component: DesignSpace,
    validate: () => null,
    doc: 'Timelines of turn-based, ATB (active/wait), action and hybrid combat over 16 s: deciding/acting/waiting, world speed, enemy hits. Params: think (s), timeScale.',
  },
  'combat.designloop': {
    component: DesignLoop,
    validate: () => null,
    doc: 'Step-through resource-flow diagram of the hybrid loop: hits -> ATB -> abilities -> pressure -> stagger -> damage multiplier, with live meter values.',
  },
  'combat.atbpace': {
    component: Pace,
    validate: oneOf('preset', ['kai', 'lyra', 'bram']),
    doc: "Pacing calculator: seconds per ATB segment, hits and time to stagger, simulated fight length vs the 30-90 s target. preset 'kai' | 'lyra' | 'bram'.",
  },
  'combat.atbtactical': {
    component: Tactical,
    validate: oneOf('approach', ['scale', 'pause', 'mixed']),
    doc: "Tactical mode three ways: Engine.time_scale, get_tree().paused with a PROCESS_MODE_ALWAYS menu, or time scale with set_ignore_time_scale tweens. approach 'scale' | 'pause' | 'mixed'.",
  },
  'combat.stagger': {
    component: StaggerLab,
    validate: () => null,
    doc: 'StaggerComponent lab: hit buttons drive apply_hit/raise_multiplier; state diagram, meter, timers, decay, multiplier and a log.',
  },
  'combat.battleflow': {
    component: BattleFlow,
    validate: oneOf('outcome', ['victory', 'defeat']),
    doc: "Encounter flow in the field: trigger, arena walls, enemies waking, signals, victory or defeat. outcome 'victory' | 'defeat'.",
  },
  'combat.party': {
    component: PartyTree,
    validate: () => null,
    doc: 'PartyManager.switch_to on a scene tree: controller nodes move, camera retargets, KO members are skipped.',
  },
  'combat.partyfollow': {
    component: PartyFollow,
    validate: oneOf('strategy', ['chase', 'trail', 'slots']),
    doc: "Playable follow lab: walk Kai; Lyra and Bram follow by chasing, a breadcrumb trail, or formation slots. strategy 'chase' | 'trail' | 'slots'.",
  },
};
