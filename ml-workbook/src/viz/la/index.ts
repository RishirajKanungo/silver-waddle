import type { VizDef } from '../registry';
import { vectorsViz } from './vectors';

export const VIZ: Record<string, VizDef> = {
  ...vectorsViz,
};
