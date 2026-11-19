import type { VizDef } from '../registry';
import type { VizSpec } from '../../content/types';
import { VectorPlayground } from './vectors';
import { SeekLab } from './seek';
import { ConeLab } from './cone';
import { TransformLab } from './transform';
import { IntegratorLab } from './integrators';
import { JumpLab } from './jumplab';
import { ProjectileLab } from './projectile';
import { SmoothingLab } from './smoothing';

const oneOf = (key: string, values: string[], optional = true) => (s: VizSpec) =>
  (optional && s[key] === undefined) || values.includes(s[key] as string) ? null : `${key} must be one of ${values.join(', ')}`;
const num = (key: string, lo: number, hi: number) => (s: VizSpec) =>
  s[key] === undefined || (typeof s[key] === 'number' && (s[key] as number) >= lo && (s[key] as number) <= hi) ? null : `${key} must be a number in [${lo}, ${hi}]`;
const vec = (key: string) => (s: VizSpec) =>
  s[key] === undefined || (Array.isArray(s[key]) && (s[key] as unknown[]).length === 2 && (s[key] as unknown[]).every((x) => typeof x === 'number')) ? null : `${key} must be [x, y]`;
const all = (...checks: ((s: VizSpec) => string | null)[]) => (s: VizSpec) => {
  for (const c of checks) {
    const e = c(s);
    if (e) return e;
  }
  return null;
};

export const VIZ: Record<string, VizDef> = {
  'math.vectors': {
    component: VectorPlayground,
    validate: all(oneOf('mode', ['basic', 'dot']), vec('a'), vec('b')),
    doc: "Draggable vector playground in Godot's y-down coordinates. mode 'basic' (a+b, b−a, normalize, lerp) or 'dot' (dot, cross, angle_to, project, slide). Optional a, b: [x, y].",
  },
  'math.seek': {
    component: SeekLab,
    validate: num('speed', 10, 150),
    doc: 'Playable: a bat chases Kai with direction_to × speed; toggle normalization; draws position vectors, displacement, direction and velocity. Optional speed.',
  },
  'math.cone': {
    component: ConeLab,
    validate: all(num('angle', 20, 180), num('range', 40, 160)),
    doc: 'Playable: sneak Kai past a skeleton whose vision cone uses a dot-product test and turns with angle_to / cross. Optional angle (full cone, degrees), range.',
  },
  'math.transform': {
    component: TransformLab,
    validate: num('aim', -180, 180),
    doc: 'Kai → WeaponPivot → SwordHitbox transform hierarchy with Transform2D matrices, global position and a to_local hit test. Optional aim (degrees).',
  },
  'math.integrators': {
    component: IntegratorLab,
    validate: all(oneOf('mode', ['jump', 'spring']), num('hz', 5, 120)),
    doc: "Explicit vs semi-implicit Euler at a chosen physics rate. mode 'jump' (apex error vs the exact parabola) or 'spring' (energy drift). Optional hz.",
  },
  'math.jumplab': {
    component: JumpLab,
    validate: all(num('height', 16, 96), num('timeToApex', 0.2, 0.7), num('fallMultiplier', 1, 3), (s) => (s.variable === undefined || typeof s.variable === 'boolean' ? null : 'variable must be boolean')),
    doc: 'Playable side-view jump from jump height and time to apex, fall multiplier and variable-height cut; trace, inset height/time plot with the analytic curve, matching GDScript. Optional height, timeToApex, fallMultiplier, variable.',
  },
  'math.projectile': {
    component: ProjectileLab,
    validate: all(num('flightTime', 0.3, 1.6), num('gravity', 100, 1000)),
    doc: 'Playable: Lyra lobs a shot that lands on a draggable target in flight time T using v = d/T − gT/2. Optional flightTime, gravity.',
  },
  'math.smoothing': {
    component: SmoothingLab,
    validate: oneOf('method', ['naive', 'exp']),
    doc: "Playable: three follow cameras at 30/60/144 fps using per-frame lerp(weight) or 1 − exp(−k·delta), with a step-response plot. Optional method 'naive' | 'exp'.",
  },
};
