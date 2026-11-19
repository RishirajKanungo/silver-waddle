import type { VizDef } from '../registry';
import { orthoViz } from './orthogonality';
import { eigenViz } from './eigen';
import { svdViz } from './svd';

export const VIZ: Record<string, VizDef> = {
  ...orthoViz,
  ...eigenViz,
  ...svdViz,
};
