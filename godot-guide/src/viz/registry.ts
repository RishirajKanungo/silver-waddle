// Every figure type lives in src/viz/<area>/ and is registered in that folder's index.ts as
//   export const VIZ: Record<string, VizDef> = { 'la.transform2d': { component, validate } }
// Ids are prefixed by area (la., calc., ml., dl., llm.) so folders never collide.
import type { ComponentType } from 'react';
import type { VizSpec } from '../content/types';

export interface VizDef {
  component: ComponentType<{ spec: VizSpec }>;
  /** return an error message for bad params (checked by the content validator) */
  validate?: (spec: VizSpec) => string | null;
  /** one line describing what it shows and its parameters (for authors) */
  doc?: string;
}

const mods = import.meta.glob<{ VIZ: Record<string, VizDef> }>('./*/index.ts', { eager: true });
export const VIZ: Record<string, VizDef> = {};
for (const [path, m] of Object.entries(mods)) {
  for (const [id, def] of Object.entries(m.VIZ ?? {})) {
    if (VIZ[id]) throw new Error(`duplicate viz id ${id} (${path})`);
    VIZ[id] = def;
  }
}
