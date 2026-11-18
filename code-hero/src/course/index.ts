// Course registry — modules and gym problems are discovered automatically.
import type { Lesson, Module, Problem, Track } from './types';

const modFiles = import.meta.glob('./modules/*.ts', { eager: true }) as Record<string, { module: Module }>;
const probFiles = import.meta.glob('./problems/*.ts', { eager: true }) as Record<string, { problems: Problem[] }>;

export const MODULES: Module[] = Object.values(modFiles)
  .map((m) => m.module)
  .filter(Boolean)
  .sort((a, b) => (a.track === b.track ? a.order - b.order : a.track < b.track ? 1 : -1));

export const PROBLEMS: Problem[] = Object.keys(probFiles)
  .sort()
  .flatMap((k) => probFiles[k].problems ?? []);

export const LESSONS: Lesson[] = MODULES.flatMap((m) => m.lessons);

export const modulesOf = (t: Track) => MODULES.filter((m) => m.track === t);
export function findLesson(id: string) {
  for (const m of MODULES) {
    const i = m.lessons.findIndex((l) => l.id === id);
    if (i >= 0) return { lesson: m.lessons[i], module: m, index: i };
  }
  return null;
}
export const findProblem = (id: string) => PROBLEMS.find((p) => p.id === id) ?? null;
export const lessonXp = (l: Lesson) => 40 + l.cells.filter((c) => c.kind === 'challenge').reduce((a, c) => a + ((c as { xp?: number }).xp ?? 25), 0);
