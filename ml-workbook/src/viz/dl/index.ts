import type { VizDef } from '../registry';
import { netsViz } from './nets';
import { backpropViz } from './backprop';
import { depthViz } from './depth';
import { trainingViz } from './training';
import { normViz } from './norm';

export const VIZ: Record<string, VizDef> = {
  ...netsViz,
  ...backpropViz,
  ...depthViz,
  ...trainingViz,
  ...normViz,
};
