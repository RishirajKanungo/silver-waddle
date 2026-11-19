// Content validator. Every module, lesson, problem, drill and interview question is checked here:
// TeX parses, code output matches real CPython + NumPy, predictions match the actual output,
// exercises' solutions pass and starters fail, figures exist with valid params, drills generate
// answers that the answer checker accepts.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { MODULES, DRILLS, QUESTIONS } from './index';
import type { Cell, Choice, Md, Module, Problem, Exercise } from './types';
import { AREAS } from './types';
import { assertTeX, mathSpans } from '../ui/tex';
import { VIZ } from '../viz/registry';
import { runPython, expected, grade, gradeHarness } from '../py/python';
import { checkAnswer, type AnswerSpec } from '../math/answer';
import { Rng } from '../math/rng';

function cpython(src: string): { out: string; err: string } {
  try {
    const out = execFileSync('python3', ['-c', src], { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
    return { out, err: '' };
  } catch (e) {
    const x = e as { stdout?: string; stderr?: string };
    return { out: x.stdout ?? '', err: x.stderr ?? String(e) };
  }
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
function checkMd(where: string, s: Md | undefined) {
  if (s === undefined) return;
  expect(typeof s, where).toBe('string');
  expect(CONTROL.test(s), `${where}: contains a control character (did a \\f, \\t, \\b or \\v escape get interpreted? use md\`…\`)`).toBe(false);
  // unescaped dollars outside code must pair up
  const stripped = s.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '').replace(/\\\$/g, '');
  const dollars = (stripped.match(/\$/g) ?? []).length;
  expect(dollars % 2, `${where}: unbalanced $ (escape a literal dollar as \\$)`).toBe(0);
  for (const m of mathSpans(s)) {
    try {
      assertTeX(m.tex, m.display);
    } catch (e) {
      throw new Error(`${where}: bad TeX "${m.tex}": ${(e as Error).message}`);
    }
  }
}

function checkAnswerSpec(where: string, a: AnswerSpec) {
  const finite = (x: number) => expect(Number.isFinite(x), `${where}: non-finite answer`).toBe(true);
  if (a.kind === 'number') finite(a.value);
  else if (a.kind === 'vector' || a.kind === 'set') a.value.forEach(finite);
  else if (a.kind === 'matrix') {
    a.value.forEach((r) => r.forEach(finite));
    expect(new Set(a.value.map((r) => r.length)).size, `${where}: ragged matrix`).toBe(1);
  } else expect(a.value.length, `${where}: text answer needs spellings`).toBeGreaterThan(0);
  // the checker must accept the answer written plainly
  const typed = a.kind === 'number' ? String(a.value) : a.kind === 'text' ? a.value[0] : a.kind === 'matrix' ? JSON.stringify(a.value) : `[${a.value.join(', ')}]`;
  expect(checkAnswer(a, typed).ok, `${where}: checker rejects its own answer "${typed}"`).toBe(true);
}

function checkChoice(where: string, c: Choice) {
  checkMd(where + ' q', c.q);
  c.options.forEach((o, i) => checkMd(`${where} option ${i}`, o));
  checkMd(where + ' explain', c.explain);
  expect(c.options.length, where + ': needs ≥ 2 options').toBeGreaterThanOrEqual(2);
  expect(c.answer >= 0 && c.answer < c.options.length, where + ': answer index out of range').toBe(true);
  expect(new Set(c.options).size, where + ': duplicate options').toBe(c.options.length);
}

function checkProblem(where: string, p: Problem) {
  checkMd(where + ' statement', p.statement);
  p.hints?.forEach((h, i) => checkMd(`${where} hint ${i}`, h));
  p.solution.forEach((s, i) => checkMd(`${where} solution ${i}`, s));
  p.rubric?.forEach((s, i) => checkMd(`${where} rubric ${i}`, s));
  expect(p.solution.length, where + ': solution needs steps').toBeGreaterThanOrEqual(2);
  expect(p.minutes > 0 && [1, 2, 3].includes(p.difficulty), where + ': minutes/difficulty').toBe(true);
  if (p.answer) checkAnswerSpec(where, p.answer);
  p.areas?.forEach((a) => expect(AREAS.some((x) => x.id === a), `${where}: unknown area ${a}`).toBe(true));
}

const unticked = (s: string) => s.trim().replace(/^`+|`+$/g, '').trim();

function checkCode(where: string, cell: Extract<Cell, { kind: 'code' }>) {
  const r = runPython(cell.code);
  if (cell.error) expect(r.error, `${where}: expected an error`).toBeTruthy();
  else expect(r.error, `${where}: ${r.error}`).toBeNull();
  const ref = cpython(cell.code);
  if (!cell.error) expect(ref.err, `${where}: CPython failed`).toBe('');
  expect(r.stdout, `${where}: output differs from CPython`).toBe(ref.out);
  if (cell.predict) {
    checkChoice(where + ' predict', cell.predict);
    const ans = unticked(cell.predict.options[cell.predict.answer]);
    expect(ans, `${where}: predict answer must equal the full printed output`).toBe(r.stdout.trim());
    cell.predict.options.forEach((o, i) => i !== cell.predict!.answer && expect(unticked(o), `${where}: a distractor equals the real output`).not.toBe(r.stdout.trim()));
  }
}

function checkExercise(where: string, ex: Exercise) {
  checkMd(where + ' prompt', ex.prompt);
  ex.hints.forEach((h, i) => checkMd(`${where} hint ${i}`, h));
  expect(ex.hints.length, where + ': needs hints').toBeGreaterThanOrEqual(1);
  expect((ex.tests?.length ?? 0) > 0 || !!ex.stdout, where + ': needs tests or stdout').toBe(true);
  const exp = expected(ex);
  expect(grade(ex, ex.solution, exp).pass, `${where}: reference solution does not pass`).toBe(true);
  expect(grade(ex, ex.starter, exp).pass, `${where}: starter already passes`).toBe(false);
  // the reference values must be what real Python + NumPy compute
  const tests = (ex.tests ?? []).map((t) => t.expr);
  const ref = cpython(gradeHarness(ex.solution, tests) + '\nfor __k in sorted(__R): print(__k, __R[__k])');
  expect(ref.err, `${where}: CPython failed on the solution`).toBe('');
  const ours = [...exp.values.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k} ${v}`).join('\n');
  const theirs = ref.out.split('\n').filter((l) => /^\d+ /.test(l)).join('\n');
  if (tests.length) expect(ours, `${where}: test values differ from CPython`).toBe(theirs);
}

function checkCell(where: string, c: Cell, m: Module) {
  switch (c.kind) {
    case 'text':
      checkMd(where, c.md);
      break;
    case 'callout':
      checkMd(where, c.md);
      break;
    case 'viz': {
      checkMd(where + ' caption', c.caption);
      checkMd(where + ' task', c.task);
      const def = VIZ[c.viz.type];
      expect(def, `${where}: unknown viz type ${c.viz.type}`).toBeTruthy();
      const err = def?.validate?.(c.viz);
      expect(err ?? null, `${where}: ${err}`).toBeNull();
      break;
    }
    case 'check':
      checkChoice(where, c);
      break;
    case 'numeric':
      checkMd(where + ' q', c.q);
      checkMd(where + ' explain', c.explain);
      c.hints?.forEach((h, i) => checkMd(`${where} hint ${i}`, h));
      checkAnswerSpec(where, c.answer);
      break;
    case 'derive':
      checkMd(where + ' goal', c.goal);
      checkMd(where + ' takeaway', c.takeaway);
      expect(c.steps.length, where + ': derivation needs steps').toBeGreaterThanOrEqual(2);
      c.steps.forEach((s, i) => {
        checkMd(`${where} step ${i}`, s.md);
        if (s.choose) checkChoice(`${where} step ${i} choose`, { q: s.choose.prompt, options: s.choose.options, answer: s.choose.answer, explain: s.choose.explain ?? '' });
      });
      break;
    case 'paper':
      checkProblem(where, c.problem);
      break;
    case 'code':
      checkMd(where + ' note', c.note);
      checkCode(where, c);
      break;
    case 'exercise':
      checkExercise(where, c.ex);
      break;
    case 'recall':
      checkMd(where + ' prompt', c.prompt);
      checkMd(where + ' answer', c.answer);
      break;
    case 'explain':
      checkMd(where + ' prompt', c.prompt);
      checkMd(where + ' model', c.model);
      break;
    default:
      throw new Error(`${where}: unknown cell kind ${(c as Cell).kind} in ${m.id}`);
  }
}

const isGate = (c: Cell) => ['check', 'numeric', 'derive', 'paper', 'exercise', 'recall', 'explain'].includes(c.kind) || (c.kind === 'code' && !!c.predict);

describe('course structure', () => {
  it('has modules', () => expect(MODULES.length).toBeGreaterThan(0));
  it('ids are unique and well-formed', () => {
    const ids = new Set<string>();
    const add = (id: string, re = /^[a-z0-9-]+$/) => {
      expect(re.test(id), `bad id ${id}`).toBe(true);
      expect(ids.has(id), `duplicate id ${id}`).toBe(false);
      ids.add(id);
    };
    for (const m of MODULES) {
      add(m.id);
      for (const l of m.lessons) {
        add(l.id);
        expect(l.id.startsWith(m.id + '-'), `${l.id} should start with ${m.id}-`).toBe(true);
        for (const c of l.cards) add(c.id);
        for (const c of l.cells) if (c.kind === 'paper') add(c.problem.id);
        for (const c of l.cells) if (c.kind === 'exercise') add(c.ex.id);
      }
      for (const p of m.problems) {
        add(p.id);
        expect(p.id.startsWith(m.id + '-'), `${p.id} should start with ${m.id}-`).toBe(true);
      }
    }
    for (const d of DRILLS) add(d.id);
    for (const q of QUESTIONS) add(q.id);
  });
  it('drills and questions point at real modules', () => {
    for (const d of DRILLS) expect(MODULES.some((m) => m.id === d.module), `drill ${d.id}: module ${d.module}`).toBe(true);
    for (const q of QUESTIONS) expect(MODULES.some((m) => m.id === q.module), `question ${q.id}: module ${q.module}`).toBe(true);
  });
});

for (const m of MODULES) {
  describe(`module ${m.id} ${m.title}`, () => {
    it('metadata', () => {
      checkMd(m.id + ' relevance', m.relevance);
      expect(m.lessons.length, 'lessons').toBeGreaterThanOrEqual(1);
      expect(m.problems.length, 'problem set size').toBeGreaterThanOrEqual(6);
      m.areas.forEach((a) => expect(AREAS.some((x) => x.id === a), `unknown area ${a}`).toBe(true));
      m.prereqs?.forEach((p) => expect(MODULES.some((x) => x.id === p), `unknown prereq ${p}`).toBe(true));
    });
    for (const l of m.lessons) {
      it(`lesson ${l.id} ${l.title}`, () => {
        expect(l.objectives.length, 'objectives').toBeGreaterThanOrEqual(2);
        expect(l.cells.some(isGate), 'at least one checkpoint').toBe(true);
        expect(l.cards.length, 'cards').toBeGreaterThanOrEqual(3);
        l.cells.forEach((c, i) => checkCell(`${l.id} cell ${i} (${c.kind})`, c, m));
        for (const c of l.cards) {
          const w = `${l.id} card ${c.id}`;
          if (c.kind === 'concept') {
            checkMd(w, c.front);
            checkMd(w, c.back);
          } else if (c.kind === 'cloze') {
            checkMd(w, c.text);
            expect(c.text.split('{{}}').length - 1, `${w}: blanks vs answers`).toBe(c.answers.length);
          } else {
            checkMd(w, c.front);
            checkMd(w, c.back);
            checkAnswerSpec(w, c.answer);
          }
        }
      });
    }
    it('problem set', () => m.problems.forEach((p) => checkProblem(p.id, p)));
  });
}

describe('drills', () => {
  for (const d of DRILLS)
    it(`${d.id} generates valid, checkable items`, () => {
      for (let seed = 1; seed <= 150; seed++) {
        const item = d.gen(new Rng(seed));
        const w = `${d.id} seed ${seed}`;
        checkMd(w + ' prompt', item.prompt);
        checkMd(w + ' solution', item.solution);
        checkAnswerSpec(w, item.answer);
      }
    });
});

describe('interview questions', () => {
  for (const q of QUESTIONS)
    it(q.id, () => {
      checkMd(q.id + ' q', q.q);
      checkMd(q.id + ' answer', q.answer);
      q.followups?.forEach((f, i) => checkMd(`${q.id} followup ${i}`, f));
      q.pitfalls?.forEach((f, i) => checkMd(`${q.id} pitfall ${i}`, f));
      expect(AREAS.some((a) => a.id === q.area), `${q.id}: area`).toBe(true);
      expect(q.answer.length, `${q.id}: answer too short`).toBeGreaterThan(120);
    });
});
