import { md, type Module } from '../types';
const v = (viz: Record<string, unknown>) => ({ kind: 'viz' as const, viz: viz as { type: string }, task: md`task` });
export const MODULE: Module = {
  id: 'ml05', part: 'ml', order: 5, title: 'tmp', summary: 'tmp', relevance: md`tmp`, areas: ['ml-breadth'],
  lessons: [{ id: 'ml05-1', title: 't', minutes: 30, objectives: ['a', 'b'], cards: [], cells: [
    v({ type: 'ml.knn' }), v({ type: 'ml.dist-concentration' }), v({ type: 'ml.kmeans' }), v({ type: 'ml.choose-k' }), v({ type: 'ml.gmm-em' }), v({ type: 'ml.tsne' }), v({ type: 'ml.anomaly' }),
  ] }],
  problems: [],
};
