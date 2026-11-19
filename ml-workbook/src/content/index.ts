import { PARTS, type Drill, type InterviewQ, type Lesson, type Module, type Problem } from './types';

const modFiles = import.meta.glob<{ MODULE: Module }>('./modules/*.ts', { eager: true });
const drillFiles = import.meta.glob<{ DRILLS: Drill[] }>('../drills/*.ts', { eager: true });
const iqFiles = import.meta.glob<{ QUESTIONS: InterviewQ[] }>('../interview/*.ts', { eager: true });

const partIndex = (p: string) => PARTS.findIndex((x) => x.id === p);

export const MODULES: Module[] = Object.values(modFiles)
  .map((m) => m.MODULE)
  .filter(Boolean)
  .sort((a, b) => partIndex(a.part) - partIndex(b.part) || a.order - b.order);

export const LESSONS: { lesson: Lesson; module: Module; index: number }[] = MODULES.flatMap((m) => m.lessons.map((lesson, index) => ({ lesson, module: m, index })));
export const PROBLEMS: { problem: Problem; module: Module; index: number }[] = MODULES.flatMap((m) => m.problems.map((problem, index) => ({ problem, module: m, index })));
export const DRILLS: Drill[] = Object.values(drillFiles)
  .flatMap((f) => f.DRILLS ?? [])
  .sort((a, b) => MODULES.findIndex((m) => m.id === a.module) - MODULES.findIndex((m) => m.id === b.module));
export const QUESTIONS: InterviewQ[] = Object.values(iqFiles)
  .flatMap((f) => f.QUESTIONS ?? [])
  .sort((a, b) => MODULES.findIndex((m) => m.id === a.module) - MODULES.findIndex((m) => m.id === b.module));

export const findModule = (id: string) => MODULES.find((m) => m.id === id);
export const findLesson = (id: string) => LESSONS.find((l) => l.lesson.id === id);
export const findProblem = (id: string) => PROBLEMS.find((p) => p.problem.id === id);
export const findDrill = (id: string) => DRILLS.find((d) => d.id === id);
export const findQuestion = (id: string) => QUESTIONS.find((q) => q.id === id);

/** The lesson after this one in course order */
export function nextLesson(id: string) {
  const i = LESSONS.findIndex((l) => l.lesson.id === id);
  return i >= 0 ? LESSONS[i + 1] : undefined;
}

/** Module number as shown in the UI, e.g. "4" for the 4th module overall */
export const moduleNumber = (id: string) => MODULES.findIndex((m) => m.id === id) + 1;
