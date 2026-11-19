import type { VizDef } from '../registry';
import { evaluationViz } from './evaluation';
import { treesViz } from './trees';
import { unsupViz } from './unsup';

export const VIZ: Record<string, VizDef> = {
  ...evaluationViz,
  ...treesViz,
  ...unsupViz,
};
