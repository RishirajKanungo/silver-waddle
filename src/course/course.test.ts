// Proves every lesson is solvable and every check is meaningful:
//   1. before the solution runs, the check must NOT pass (no free points)
//   2. after the solution runs, the check MUST pass
// Also validates quiz questions (formula answers really evaluate to `expect`).

import { describe, it, expect } from 'vitest';
import { AppStore } from '../app/store';
import { MODULES, PROJECTS } from './index';
import { CommandLog, applyStep, loadLesson, runTaskCheck } from './runner';
import type { Lesson } from './types';
import { Calc } from '../engine/calc';
import { cellKey } from '../engine/types';
import { parseA1 } from '../engine/refs';
import { CMD } from '../app/commands';

function runLesson(lesson: Lesson) {
  const s = new AppStore();
  const log = new CommandLog();
  s.onCommand((e) => log.record(e.id, e.source));
  loadLesson(s, lesson);
  for (const task of lesson.tasks) {
    log.reset();
    const before = runTaskCheck(task, s, log);
    expect(before, `[${lesson.id}/${task.id}] check passes before the learner did anything`).not.toBe(true);
    for (const step of task.solution) applyStep(s, step);
    const after = runTaskCheck(task, s, log);
    expect(after, `[${lesson.id}/${task.id}] solution does not satisfy the check`).toBe(true);
  }
}

describe('course content', () => {
  it('has modules', () => {
    expect(MODULES.length).toBeGreaterThan(0);
  });
  const ids = new Set<string>();
  for (const m of MODULES) {
    describe(`${m.id} ${m.title}`, () => {
      for (const l of m.lessons) {
        it(`lesson ${l.id}: ${l.title}`, () => {
          expect(ids.has(l.id), 'duplicate lesson id ' + l.id).toBe(false);
          ids.add(l.id);
          runLesson(l);
        });
      }
      it('quiz is valid', () => {
        expect(m.quiz.length).toBeGreaterThanOrEqual(5);
        m.quiz.forEach((q, i) => {
          if (q.kind === 'mc') {
            expect(q.answer, `${m.id} q${i}`).toBeGreaterThanOrEqual(0);
            expect(q.answer, `${m.id} q${i}`).toBeLessThan(q.options.length);
          } else if (q.kind === 'keys') {
            expect(CMD[q.cmd], `${m.id} q${i} unknown command ${q.cmd}`).toBeTruthy();
          } else {
            const cells: Record<string, { v: string }> = {};
            q.grid.forEach((row, r) => row.forEach((v, c) => (cells[cellKey(r, c)] = { v: String(v) })));
            const at = parseA1(q.at)!;
            const calc = new Calc([{ id: 'q', name: 'Quiz.xlsx', sheets: [{ name: 'Sheet1', cells, colWidths: {} }] }]);
            const got = calc.evalFormula(q.model, { bi: 0, si: 0, r: at.row, c: at.col });
            const g = got && typeof got === 'object' && 'kind' in got ? got.data[0][0] : got;
            if (typeof q.expect === 'number') expect(g as number, `${m.id} q${i}`).toBeCloseTo(q.expect, 4);
            else expect(g, `${m.id} q${i}`).toEqual(q.expect);
          }
        });
      });
    });
  }
  for (const p of PROJECTS) {
    it(`project ${p.id}: ${p.title}`, () => runLesson(p));
  }
});
