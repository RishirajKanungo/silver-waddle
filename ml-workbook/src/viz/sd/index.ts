import type { VizDef } from '../registry';
import { codingViz } from './coding';
import { evalViz } from './evaluation';
import { designViz } from './design';
import { recsysViz } from './recsys';

export const VIZ: Record<string, VizDef> = {
  ...designViz,
  ...recsysViz,
  ...codingViz,
  ...evalViz,
};
