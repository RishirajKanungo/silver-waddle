import type { VizDef } from '../registry';
import type { VizSpec } from '../../content/types';
import { PixelScale } from './pixelscale';
import { Layers } from './layers';
import { Timestep } from './timestep';
import { Numbers } from './numbers';
import { Lifecycle } from './lifecycle';
import { AwaitTimeline } from './await';
import { SceneTreeFig } from './scenetree';
import { SignalFlow } from './signalflow';
import { SharedRes } from './sharedres';
import { TresEdit } from './tresedit';

const oneOf = (key: string, vals: readonly string[], optional = true) => (s: VizSpec) => {
  const v = s[key];
  if (v === undefined && optional) return null;
  return vals.includes(v as string) ? null : `${key} must be one of ${vals.join(', ')}`;
};

export const VIZ: Record<string, VizDef> = {
  'godot.pixelscale': {
    component: PixelScale,
    validate: (s) => oneOf('mode', ['integer', 'fractional'])(s) ?? oneOf('filter', ['nearest', 'linear'])(s),
    doc: "320×180 game shown in a simulated window: scale mode integer|fractional, filter nearest|linear, window size; loupe of real screen pixels with per-column widths. Params: mode?, filter?, winW?, winH?",
  },
  'godot.layers': {
    component: Layers,
    validate: (s) => (s.a !== undefined && typeof s.a !== 'number') || (s.b !== undefined && typeof s.b !== 'number') ? 'a and b are preset indices' : null,
    doc: 'Collision layer/mask bit grids for two objects from the Shardbound layer setup, with who-detects-whom and the stored integers. Params: a?, b? (preset indices 0-7).',
  },
  'godot.timestep': {
    component: Timestep,
    validate: (s) => (s.fps !== undefined && (typeof s.fps !== 'number' || s.fps < 10 || s.fps > 240) ? 'fps 10..240' : null),
    doc: 'Three sprites moving per-frame, with delta in _process, and in _physics_process; frame-rate slider, jitter, slow motion, tick timeline. Params: fps?',
  },
  'godot.numbers': {
    component: Numbers,
    validate: oneOf('tab', ['int', 'float']),
    doc: "GDScript integer division / modulo on a tile number line, and float accumulation vs is_equal_approx. Params: tab? 'int'|'float'",
  },
  'godot.lifecycle': {
    component: Lifecycle,
    validate: oneOf('scenario', ['startup', 'spawn', 'free']),
    doc: "Stepper through _init/_enter_tree/_ready/_physics_process/_process/_exit_tree for a small tree. Params: scenario? 'startup'|'spawn'|'free'",
  },
  'godot.await': {
    component: AwaitTimeline,
    validate: (s) => (s.seconds !== undefined && (typeof s.seconds !== 'number' || s.seconds < 0.1 || s.seconds > 1) ? 'seconds 0.1..1' : null),
    doc: 'Timeline of a coroutine suspended on create_timer(d).timeout, caller with or without await. Params: seconds?',
  },
  'godot.scenetree': {
    component: SceneTreeFig,
    validate: oneOf('mode', ['paths', 'pause'], false),
    doc: "Manipulable scene tree. mode 'paths': instance/free scenes, node paths, groups, ready order. mode 'pause': process_mode per node and get_tree().paused.",
  },
  'godot.signalflow': {
    component: SignalFlow,
    validate: oneOf('scenario', ['bus', 'direct', 'updown']),
    doc: "Signal/call flow stepper: coin pickup via Events bus or direct calls, and call down / signal up. Params: scenario? 'bus'|'direct'|'updown'",
  },
  'godot.sharedres': {
    component: SharedRes,
    validate: oneOf('mode', ['shared', 'duplicate', 'local', 'split']),
    doc: "Two slimes and one stats resource: shared, duplicate(), Local to Scene, or hp on the node. Params: mode?",
  },
  'godot.tresedit': {
    component: TresEdit,
    validate: oneOf('schema', ['enemy', 'ability']),
    doc: "Inspector-style editor for EnemyData or AbilityData records with the live .tres text. Params: schema? 'enemy'|'ability'",
  },
};
