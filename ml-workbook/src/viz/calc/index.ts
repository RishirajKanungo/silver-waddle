import type { VizDef } from '../registry';
import { multivarViz } from './multivar';
import { probViz } from './prob';
import { optimViz } from './optim';

export const VIZ: Record<string, VizDef> = {
  ...multivarViz,
  ...probViz,
  ...optimViz,
};
