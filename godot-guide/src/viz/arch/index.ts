import type { VizDef } from '../registry';
import type { VizSpec } from '../../content/types';
import { FsmLab } from './fsm';
import { ComponentChain, ComponentLab } from './component';

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
  'combat.frame': { component: Stub },
  'combat.hit': { component: Stub },
  'combat.hit_curves': { component: Stub },
  'combat.ai': { component: Stub },
  'combat.ai_steer': { component: Stub },
  'combat.ai_tokens': { component: Stub },
  'combat.ai_phases': { component: Stub },
};
