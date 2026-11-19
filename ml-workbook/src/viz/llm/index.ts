import type { VizDef } from '../registry';
import { attentionViz } from './attention';
import { trainingViz } from './training';
import { inferenceViz } from './inference';

export const VIZ: Record<string, VizDef> = {
  ...attentionViz,
  ...trainingViz,
  ...inferenceViz,
};
