// Figures for m04 (collision), m05 (RPG numbers) and c01 (pixel art and animation).
import type { VizDef } from '../registry';
import './geom.css';
import { CollisionShapes } from './shapes';
import { TunnelLab } from './tunnel';
import { CollisionLayers } from './layers';
import { RaycastLab } from './raycast';
import { DamageExplorer } from './damage';
import { XpCurve } from './xp';
import { LootLab } from './loot';
import { TtkLab } from './ttk';
import { AnimTiming, ANIM_SHEETS } from './anim';
import { SnapLab } from './snap';
import { PaletteRamp } from './ramp';

const oneOf = (key: string, vals: unknown[]) => (s: Record<string, unknown>) => (s[key] === undefined || vals.includes(s[key]) ? null : `${key} must be one of ${vals.join(', ')}`);
const num = (key: string, lo: number, hi: number) => (s: Record<string, unknown>) => (s[key] === undefined || (typeof s[key] === 'number' && (s[key] as number) >= lo && (s[key] as number) <= hi) ? null : `${key} must be a number in [${lo}, ${hi}]`);
const all = (...fs: ((s: Record<string, unknown>) => string | null)[]) => (s: Record<string, unknown>) => fs.map((f) => f(s)).find((e) => e) ?? null;

export const VIZ: Record<string, VizDef> = {
  'math.collisionShapes': {
    component: CollisionShapes,
    validate: oneOf('mode', ['rect', 'circle', 'rectcircle', 'sat']),
    doc: "Drag two shapes and see the overlap test: mode 'rect' (Rect2.intersects), 'circle', 'rectcircle' (clamp to closest point) or 'sat' (rotated boxes, projections on 4 axes).",
  },
  'math.collisionTunnel': {
    component: TunnelLab,
    validate: all(oneOf('mode', ['discrete', 'swept']), num('speed', 60, 1800), num('wall', 2, 24)),
    doc: "Playable: a projectile fired at a thin wall in 60 Hz steps. mode 'discrete' (overlap test) or 'swept' (ray along the motion); speed px/s, wall px.",
  },
  'math.collisionLayers': {
    component: CollisionLayers,
    validate: oneOf('preset', ['course', 'defaults', 'bug']),
    doc: "Layer/mask editor for the course's 8 named layers and 11 objects, with the detection matrix and diffs against the course setup. preset 'course' | 'defaults' | 'bug'.",
  },
  'math.raycast': {
    component: RaycastLab,
    validate: oneOf('mode', ['sight', 'bounce']),
    doc: "Drag an enemy, Kai and walls. mode 'sight' (range + view cone + line-of-sight ray) or 'bounce' (projectile path with normals, bounce and slide).",
  },
  'math.rpgDamage': {
    component: DamageExplorer,
    validate: all(num('atk', 1, 200), num('def', 0, 200), num('k', 10, 200), num('hp', 10, 1000)),
    doc: 'Damage formulas (subtractive, floored, divisive, ratio) as curves against defence or attack, with hits to kill. Params atk, def, k, hp.',
  },
  'math.rpgXp': {
    component: XpCurve,
    validate: all(oneOf('shape', ['linear', 'power', 'exp']), oneOf('show', ['next', 'total', 'minutes', 'hours']), num('base', 10, 500), num('maxLevel', 10, 60), num('rate', 10, 400)),
    doc: "XP curve designer: shape 'linear' | 'power' | 'exp', base, p, r, maxLevel, rate (XP/min); plots XP per level, total XP, minutes per level or hours.",
  },
  'math.rpgTtk': {
    component: TtkLab,
    validate: all(num('base', 1, 100), num('hp', 10, 600), num('variance', 0, 0.5), num('crit', 0, 0.5)),
    doc: 'Hits-to-kill distribution from 20 000 simulated fights with ± variance and crits; DPS and TTK readouts. Params base, hp, variance, crit.',
  },
  'math.probLoot': {
    component: LootLab,
    validate: oneOf('mode', ['loot', 'streak']),
    doc: "mode 'loot': editable weighted drop table, roll 1/100/10000, histogram vs expected, P(at least one in N). mode 'streak': crit gaps with independent rolls, a pity limit or PRD.",
  },
  'core.pixelAnim': {
    component: AnimTiming,
    validate: all(oneOf('sheet', ANIM_SHEETS), oneOf('timing', ['fps', 'holds'])),
    doc: "Animation timing on a 60 Hz clock: sheet, anim, timing 'fps' | 'holds' (ticks per frame), onion skin, frame stepping, sheet grid with frame coordinates.",
  },
  'core.pixelSnap': {
    component: SnapLab,
    validate: all(oneOf('draw', ['screen', 'world', 'hires']), oneOf('camera', ['fixed', 'follow', 'smooth']), num('speed', 0.05, 2)),
    doc: "Sub-pixel movement in an 80×45 view ×4: draw 'screen' (round after camera), 'world' (snap positions) or 'hires' (canvas_items); camera fixed/follow/smooth; error strip.",
  },
  'core.pixelRamp': {
    component: PaletteRamp,
    validate: all(num('steps', 3, 7), num('hue', 0, 359), num('shift', 0, 60)),
    doc: 'Colour ramp designer: flat vs hue-shifted ramps on a shaded blob, GBA 15-bit toggle, palette swap of one of Kai’s ramps, and the matching canvas_item shader.',
  },
};
