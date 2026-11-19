import type { VizDef } from '../registry';
import { TopDownLab } from './topdown';
import { MOTION_VIZ } from './motion_index';

export const VIZ: Record<string, VizDef> = {
  ...MOTION_VIZ,
  'core.topdown': {
    component: TopDownLab,
    validate: (s) => (s.mode === undefined || s.mode === 'basic' || s.mode === 'accel' ? null : "mode must be 'basic' or 'accel'"),
    doc: "Playable top-down movement lab. mode 'basic' (constant speed, diagonal-normalize toggle) or 'accel' (acceleration/friction sliders). Shows speed graph, trail, and the matching GDScript.",
  },
};
