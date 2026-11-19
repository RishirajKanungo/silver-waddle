// Everything that can be scheduled for review, with the interview areas it counts toward.
import { MODULES, DRILLS, QUESTIONS } from '../content';
import type { Area } from '../content/types';
import { itemKey } from '../progress/store';

let cache: { key: string; areas: Area[] }[] | null = null;
export function allItems() {
  if (cache) return cache;
  const out: { key: string; areas: Area[] }[] = [];
  for (const m of MODULES) {
    for (const l of m.lessons) for (const c of l.cards) out.push({ key: itemKey('card', c.id), areas: m.areas });
    for (const p of m.problems) out.push({ key: itemKey('problem', p.id), areas: p.areas ?? m.areas });
  }
  for (const d of DRILLS) out.push({ key: itemKey('drill', d.id), areas: MODULES.find((m) => m.id === d.module)?.areas ?? [] });
  for (const q of QUESTIONS) out.push({ key: itemKey('question', q.id), areas: [q.area] });
  cache = out;
  return out;
}
