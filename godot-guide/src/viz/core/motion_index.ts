// Registrations for the movement, height, world and camera figures (modules c02-c04).
// Spread into VIZ in ./index.ts so this folder's other author can edit index.ts without conflicts.
import type { VizDef } from '../registry';
import { DashLab } from './dash';
import { FeelLab } from './feel';
import { HeightLab } from './height';
import { PlatformerLab } from './platformer';
import { AutotileLab } from './autotile';
import { YSortLab } from './ysort';
import { CameraLab } from './camera';

const oneOf = (key: string, vals: string[]) => (s: Record<string, unknown>) => (s[key] === undefined || vals.includes(s[key] as string) ? null : `${key} must be one of ${vals.join(', ')}`);

export const MOTION_VIZ: Record<string, VizDef> = {
  'core.dash': {
    component: DashLab,
    doc: 'Playable dash lab: dash speed/frames, i-frames, cooldown, input buffer window, afterimages, spikes to dash through, and a frame timeline of presses, buffer, dash, i-frames and cooldown.',
  },
  'core.feel': {
    component: FeelLab,
    validate: (s) => (s.a !== undefined && typeof s.a !== 'object') || (s.b !== undefined && typeof s.b !== 'object') ? 'a and b must be objects of toggles' : null,
    doc: 'Side-by-side feel comparison: one input drives two characters (A raw, B tuned by default) with per-side acceleration curve and juice toggles (turn accel, corner correction, dust, anim sync, footsteps, camera). Measures frames to first pixel and to turn around.',
  },
  'core.height': {
    component: HeightLab,
    validate: oneOf('mode', ['jump', 'levels']),
    doc: "Top-down fake-Z jumping. mode 'jump' (flat ground: z graph, shadow, arc) or 'levels' (three plateaus at 16 and 32 px, floor zones, cliff collision that blocks while z < level height, footprint overlay). Sliders jump_height, time_to_peak.",
  },
  'core.platformer': {
    component: PlatformerLab,
    doc: 'Side-view platformer controller: gravity from height and times, coyote time, jump buffer, variable height, apex hang, fall cap, one-way and moving platforms, with a frame timeline of when jumps were accepted.',
  },
  'core.autotile': {
    component: AutotileLab,
    validate: oneOf('mode', ['corners', 'sides', 'blob']),
    doc: "Terrain autotiling: paint water on grass and see each cell's peering bits and chosen tile. mode 'corners' (Match Corners, real 15+1 water tiles), 'sides' (Match Sides, 16) or 'blob' (Match Corners and Sides, 47).",
  },
  'core.ysort': {
    component: YSortLab,
    doc: 'Playable Y-sort lab: walk Kai around a tree, rock and villager with y_sort_enabled on/off and the tree origin at the trunk base or the sprite centre; shows sort lines and the live draw order.',
  },
  'core.camera': {
    component: CameraLab,
    validate: oneOf('mode', ['follow', 'screens']),
    doc: "Camera2D lab in a 640x360 room: position smoothing, drag margins, look-ahead, limits, pixel-snapped drawing, debug overlay and minimap. mode 'follow' or 'screens' (screen by screen).",
  },
};
