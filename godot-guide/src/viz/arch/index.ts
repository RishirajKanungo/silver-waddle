import type { VizDef } from '../registry';
import type { VizSpec } from '../../content/types';
import { FsmLab } from './fsm';
import { ComponentChain, ComponentLab } from './component';
import { HitLab } from './hit';
import { FrameData } from './frame';
import { HitCurves } from './curves';

const Stub = () => null;
const oneOf = (key: string, vals: string[], optional = true) => (s: VizSpec) =>
  (optional && s[key] === undefined) || vals.includes(s[key] as string) ? null : `${key} must be one of ${vals.join(', ')}`;

export const VIZ: Record<string, VizDef> = {
  'core.fsm': {
    component: FsmLab,
    validate: oneOf('mode', ['flags', 'enum', 'nodes'], false),
    doc: "Playable character beside its live state machine. mode 'flags' (boolean-flag script with its bugs and a flag-combination grid), 'enum' (enum + match), 'nodes' (StateMachine + intent panel + a slime that hurts; shows the running state's script).",
  },
  'core.component': {
    component: ComponentChain,
    doc: 'Step through one sword hit: Attack → Hitbox → Hurtbox → Character._on_hurt → HealthComponent → HealthBar / StateMachine. Sliders for damage and health, toggles for invincibility and a wrong mask.',
  },
  'core.component_lab': {
    component: ComponentLab,
    doc: 'Playable room with a crate, a slime and a training post; add or remove HealthComponent, Hurtbox and Hitbox on each and watch the signal log.',
  },
  'combat.frame': {
    component: FrameData,
    validate: (s) => (s.hit === undefined || [0, 1, 2].includes(s.hit as number) ? null : 'hit must be 0, 1 or 2'),
    doc: 'Frame data of one attack: startup/active/recovery/cancel sliders, a scrubbable frame strip, Kai and the hitbox at the frame, and the AnimationPlayer keys in seconds. Optional hit: 0..2 picks the preset.',
  },
  'combat.hit': {
    component: HitLab,
    validate: oneOf('mode', ['frames', 'feel', 'full'], false),
    doc: "The hit lab: Kai's three-hit string against a skeleton dummy with a scrolling frame meter. mode 'frames' (frame data, combo window), 'feel' (hitstop per node or time_scale, shake, knockback), 'full' (plus flash, sparks, numbers, sound).",
  },
  'combat.hit_curves': {
    component: HitCurves,
    validate: oneOf('mode', ['shake', 'knockback'], false),
    doc: "mode 'shake': trauma and trauma^p curves with a shaking camera preview; mode 'knockback': slide distance under linear friction versus exponential decay.",
  },
  'combat.ai': { component: Stub },
  'combat.ai_steer': { component: Stub },
  'combat.ai_tokens': { component: Stub },
  'combat.ai_phases': { component: Stub },
};
