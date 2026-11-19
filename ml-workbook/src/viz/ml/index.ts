import type { VizDef } from '../registry';
import { linregViz } from './linreg';
import { regularizeViz } from './regularize';
import { logisticViz } from './logistic';
import { evaluateViz } from './evaluate';

// Figures for ml01 (linear regression) and ml02 (classification and logistic regression).
export const VIZ: Record<string, VizDef> = {
  ...linregViz,
  ...regularizeViz,
  ...logisticViz,
  ...evaluateViz,
};
