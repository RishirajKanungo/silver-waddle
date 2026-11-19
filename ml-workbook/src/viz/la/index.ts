import type { VizDef } from '../registry';
import { vectorsViz } from './vectors';
import { matricesViz } from './matrices';
import { systemsViz } from './systems';
import { subspacesViz } from './subspaces';
import { determinantsViz } from './determinants';

export const VIZ: Record<string, VizDef> = {
  ...vectorsViz,
  ...matricesViz,
  ...systemsViz,
  ...subspacesViz,
  ...determinantsViz,
};
