import type { VizDef } from '../registry';
import { ShaderLab, EFFECTS } from './shaders';
import { ParticleLab } from './particles';
import { LightingLab } from './lighting';
import { MixerLab } from './mixer';
import { ScopeCalc } from './scope';
import { ProfilerLab } from './profiler';
import { TestsLab } from './tests';
import { ScreenFit } from './screenfit';
import { SteamPipe } from './steampipe';
import { LaunchPlanner } from './launch';
import { RevenueCalc } from './revenue';
import { MilestoneGraph } from './milestones';
import { TriageLab } from './triage';

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
  'ship.screenfit': {
    component: ScreenFit,
    validate: (s) => oneOf('screen', s.screen, ['deck', 'laptop', 'fhd', 'qhd', 'mac', 'uhd']),
    doc: 'How a 320×180 viewport fills real screens with integer or fractional scaling: scale, bars, uneven pixels, physical HUD text size (mm) on e.g. a 7" Steam Deck; shows the project.godot display settings.',
  },
  'ship.steampipe': {
    component: SteamPipe,
    doc: 'SteamPipe diagram: export to local folders, steamcmd upload to depots creates a build, set builds live on beta/default; shows the app_build VDF and what default/beta/Deck players get.',
  },
  'ship.launch': {
    component: LaunchPlanner,
    validate: (s) => (s.months === undefined || (typeof s.months === 'number' && s.months > 0) ? null : 'months must be a positive number'),
    doc: 'Launch timeline planner: launch date, Next Fest date, Coming Soon lead, demo lead → dates for fee, page review, page live, demo, build review; checks configurable Steamworks rules. months = default months to launch.',
  },
  'ship.revenue': {
    component: RevenueCalc,
    validate: (s) => (s.price === undefined || typeof s.price === 'number') && (s.units === undefined || typeof s.units === 'number') ? null : 'price and units must be numbers',
    doc: 'Steam revenue calculator: price, copies, regional pricing, discounts, VAT, refunds → adjusted gross, Valve share tiers (30/25/20%), Steam Direct fee recoup, net. price, units set the start.',
  },
  'ship.milestones': {
    component: MilestoneGraph,
    validate: (s) => oneOf('plan', s.plan, ['slice', 'roadmap']),
    doc: "Milestone dependency graph: select a milestone to read its acceptance criteria, mark it done when its prerequisites are done; shows what is unblocked, weeks left and the critical path. plan: 'slice' (M1–M12) or 'roadmap' (after the slice).",
  },
  'ship.triage': {
    component: TriageLab,
    doc: 'Bug-bash triage: ten slice bug reports; choose severity and frequency, priority comes from a matrix; P1/P2 must be fixed before the release candidate; compare with a model triage.',
  },
};
