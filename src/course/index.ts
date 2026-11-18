// Course registry. Modules and projects are discovered automatically from
// ./modules/*.ts and ./projects/*.ts (each exports `module` or `project`).

import type { Lesson, Module } from './types';

const modFiles = import.meta.glob('./modules/*.ts', { eager: true }) as Record<string, { module: Module }>;
const projFiles = import.meta.glob('./projects/*.ts', { eager: true }) as Record<string, { project: Lesson }>;

export const MODULES: Module[] = Object.keys(modFiles)
  .sort()
  .map((k) => modFiles[k].module)
  .filter(Boolean);

export const PROJECTS: Lesson[] = Object.keys(projFiles)
  .sort()
  .map((k) => ({ ...projFiles[k].project, kind: 'project' as const }))
  .filter(Boolean);

export const ALL_LESSONS: Lesson[] = [...MODULES.flatMap((m) => m.lessons), ...PROJECTS];

export function findLesson(id: string): { lesson: Lesson; module?: Module } | null {
  for (const m of MODULES) {
    const l = m.lessons.find((x) => x.id === id);
    if (l) return { lesson: l, module: m };
  }
  const p = PROJECTS.find((x) => x.id === id);
  return p ? { lesson: p } : null;
}

export function lessonXp(l: Lesson) {
  return l.tasks.reduce((a, t) => a + (t.xp ?? 10), 0) + (l.kind === 'project' ? 100 : 20);
}
