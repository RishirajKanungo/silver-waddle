import type { VizDef } from '../registry';
import { ShaderLab, EFFECTS } from './shaders';
import { ParticleLab } from './particles';
import { LightingLab } from './lighting';
import { MixerLab } from './mixer';
import { ScopeCalc } from './scope';
import { ProfilerLab } from './profiler';
import { TestsLab } from './tests';

const oneOf = (name: string, v: unknown, ok: readonly unknown[]) => (v === undefined || ok.includes(v) ? null : `${name} must be one of ${ok.join(', ')}`);

export const VIZ: Record<string, VizDef> = {
  'ship.mixer': {
    component: MixerLab,
    validate: (s) => (s.music === undefined || typeof s.music === 'boolean' ? null : 'music must be a boolean'),
    doc: 'Audio autoload lab: Master/Music/SFX bus faders with dB, a pooled SFX voice grid with pitch jitter and stealing, music crossfade (amplitude vs volume_db tween) with a volume plot. music:false hides the music part.',
  },
  'ship.shaders': {
    component: ShaderLab,
    validate: (s) => oneOf('effect', s.effect, EFFECTS) ?? oneOf('start', s.start, EFFECTS),
    doc: "canvas_item shader playground on Kai's sprite: flash, outline, palette, dissolve, ripple, with uniform sliders, pixel probe and the matching .gdshader. effect fixes one effect (else a selector, starting at start).",
  },
  'ship.particles': {
    component: ParticleLab,
    validate: (s) => oneOf('emitter', s.emitter, ['dust', 'sparks']),
    doc: 'GPUParticles2D lab: dust while moving and a one-shot spark burst on attack; amount, lifetime, explosiveness, spread, velocity, gravity, damping, local_coords. emitter picks which one is edited first.',
  },
  'ship.lighting': {
    component: LightingLab,
    validate: (s) => oneOf('mode', s.mode, ['lighting', 'transition']) ?? oneOf('room', s.room, ['dungeon', 'overworld']),
    doc: "mode 'lighting': CanvasModulate (day/night gradient or dark dungeon) + PointLight2D torches with flicker. mode 'transition': walk into a door; fade or circle-wipe shader centred on Kai, with duration and easing.",
  },
  'ship.scope': {
    component: ScopeCalc,
    validate: (s) => oneOf('preset', s.preset, ['slice', 'small', 'dream']),
    doc: 'Scope calculator: hours of play, areas, enemy types, bosses, NPCs, abilities and your weekly hours give rooms, frames, tracks and an hours/weeks estimate from editable per-item costs. preset: slice | small | dream.',
  },
  'ship.profiler': {
    component: ProfilerLab,
    validate: (s) => (s.select === undefined || (typeof s.select === 'number' && s.select >= 0 && s.select < 360) ? null : 'select must be a frame index 0..359'),
    doc: 'Frame-time graph (6 s at 60 fps) with spikes from scene loading, instancing, a main-thread save, AI and particles; click a frame for its breakdown, guess the cause, toggle fixes. select = initial frame.',
  },
  'ship.tests': {
    component: TestsLab,
    validate: (s) => (s.seed === undefined || typeof s.seed === 'boolean' ? null : 'seed must be a boolean'),
    doc: 'Mutation-testing lab for the damage formula: add GUT test cases and see which of five one-line bugs they catch; generates the GUT test file. seed:false starts with no tests.',
  },
};
