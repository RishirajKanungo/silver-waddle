import { md, type Module } from '../types';
const v = (viz: Record<string, unknown>) => ({ kind: 'viz' as const, viz: viz as { type: string }, task: md`task` });
export const MODULE: Module = {
  id: 'ml04', part: 'ml', order: 4, title: 'tmp', summary: 'tmp', relevance: md`tmp`, areas: ['ml-breadth'],
  lessons: [{ id: 'ml04-1', title: 't', minutes: 30, objectives: ['a', 'b'], cards: [], cells: [
    v({ type: 'ml.tree-split' }), v({ type: 'ml.tree-depth' }), v({ type: 'ml.regtree-1d' }), v({ type: 'ml.bagging' }), v({ type: 'ml.corr-average' }), v({ type: 'ml.boost-1d' }), v({ type: 'ml.adaboost' }),
  ] }],
  problems: [],
};
