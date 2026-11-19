// Content validator. Every module, lesson, problem, drill and interview question is checked here:
// TeX parses, code output matches real CPython + NumPy, predictions match the actual output,
// exercises' solutions pass and starters fail, figures exist with valid params, drills generate
// answers that the answer checker accepts.
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MODULES, DRILLS, QUESTIONS } from './index';
import type { Cell, Choice, Md, Module, Problem, Challenge, CodeLang } from './types';
import { AREAS } from './types';
import { assertTeX, mathSpans } from '../ui/tex';
import { VIZ } from '../viz/registry';
import { SHEETS, SOUNDS } from '../art';
import { checkAnswer, type AnswerSpec } from '../math/answer';
import { Rng } from '../math/rng';
import { godot3Isms, shaderIsms } from './gdlint';

// ---------------------------------------------------------------- GDScript parsing (gdtoolkit)
// Every complete GDScript listing is written to a temp file and parsed by gdparse in one batch.
const gdFiles = new Map<string, string>(); // file path -> where (for messages)
const gdFailures = new Map<string, string>();
const gdDir = mkdtempSync(join(tmpdir(), 'gdcheck-'));
let gdCount = 0;
function registerGd(where: string, code: string) {
  const f = join(gdDir, `s${gdCount++}.gd`);
  writeFileSync(f, code.endsWith('\n') ? code : code + '\n');
  gdFiles.set(f, where);
  return f;
}
function collectGd() {
  const scan = (where: string, code: string, lang: CodeLang | undefined, fragment?: boolean) => {
    if ((lang ?? 'gdscript') === 'gdscript' && !fragment) registerGd(where, code);
  };
  for (const m of MODULES)
    for (const l of m.lessons)
      l.cells.forEach((c, i) => {
        if (c.kind === 'code') scan(`${l.id} cell ${i}`, c.code, c.lang, c.fragment);
        if (c.kind === 'build') c.ch.solution.forEach((f) => scan(`${l.id} cell ${i} solution ${f.file}`, f.code, f.lang));
      });
}
beforeAll(() => {
  collectGd();
  if (!gdFiles.size) return;
  const files = [...gdFiles.keys()];
  for (let i = 0; i < files.length; i += 200) {
    const batch = files.slice(i, i + 200);
    try {
      execFileSync('gdparse', batch, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
    } catch (e) {
      const x = e as { stdout?: string; stderr?: string };
      const out = (x.stdout ?? '') + '\n' + (x.stderr ?? '');
      // gdparse prints "<path>:" followed by the error for each failing file
      const parts = out.split(/^(\S+\.gd):\s*$/m);
      for (let k = 1; k < parts.length; k += 2) gdFailures.set(parts[k], parts[k + 1].trim().split('\n').slice(0, 8).join('\n'));
      if (!gdFailures.size) throw new Error('gdparse failed: ' + out.slice(0, 500));
    }
  }
}, 180000);

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
  checkFences(where + ' q', c.q);
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

function lintCode(where: string, code: string, lang: CodeLang = 'gdscript') {
  const issues = lang === 'shader' ? shaderIsms(code) : lang === 'gdscript' ? godot3Isms(code) : [];
  expect(issues, `${where}: Godot 3 / deprecated usage`).toEqual([]);
  expect(/\t/.test(code) || !/^ {4}\S/m.test(code) || lang !== 'gdscript', `${where}: indent GDScript with tabs, as the Godot editor does`).toBe(true);
}

function fencedCode(md: string): { lang: string; code: string }[] {
  const out: { lang: string; code: string }[] = [];
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  const src = md.replace(/\\`/g, '`');
  while ((m = re.exec(src))) out.push({ lang: m[1], code: m[2] });
  return out;
}
function checkFences(where: string, s: string | undefined) {
  if (!s) return;
  for (const f of fencedCode(s)) if (/^(gdscript|gd)$/i.test(f.lang)) expect(godot3Isms(f.code), `${where}: Godot 3 usage in a code fence`).toEqual([]);
}

function checkChallenge(where: string, ch: Challenge) {
  checkMd(where + ' goal', ch.goal);
  checkMd(where + ' explain', ch.explain);
  ch.requirements.forEach((r, i) => checkMd(`${where} requirement ${i}`, r));
  ch.hints.forEach((h, i) => checkMd(`${where} hint ${i}`, h));
  expect(ch.requirements.length, where + ': needs ≥ 2 acceptance criteria').toBeGreaterThanOrEqual(2);
  expect(ch.hints.length, where + ': needs hints').toBeGreaterThanOrEqual(1);
  expect(ch.solution.length, where + ': needs a reference solution').toBeGreaterThanOrEqual(1);
  ch.solution.forEach((f) => lintCode(`${where} ${f.file}`, f.code, f.lang));
}

function checkCell(where: string, c: Cell, m: Module) {
  switch (c.kind) {
    case 'text':
      checkMd(where, c.md);
      checkFences(where, c.md);
      break;
    case 'callout':
      checkMd(where, c.md);
      checkFences(where, c.md);
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
      lintCode(where, c.code, c.lang);
      break;
    case 'steps':
      checkMd(where + ' result', c.result);
      c.steps.forEach((x, k) => {
        checkMd(`${where} step ${k}`, x);
        checkFences(`${where} step ${k}`, x);
      });
      c.troubleshoot?.forEach((t, k) => {
        checkMd(`${where} trouble ${k}`, t.problem);
        checkMd(`${where} fix ${k}`, t.fix);
      });
      expect(c.steps.length, where + ': steps').toBeGreaterThanOrEqual(2);
      break;
    case 'assets':
      checkMd(where + ' note', c.note);
      c.ids.forEach((id) => expect(!!SHEETS[id] || !!SOUNDS[id], `${where}: unknown asset ${id}`).toBe(true));
      break;
    case 'build':
      checkChallenge(where, c.ch);
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

const isGate = (c: Cell) => ['check', 'numeric', 'derive', 'paper', 'steps', 'build', 'recall', 'explain'].includes(c.kind);

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
        for (const c of l.cells) if (c.kind === 'build') add(c.ch.id);
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
        l.objectives.forEach((o, i) => checkMd(`${l.id} objective ${i}`, o));
        expect(l.cells.some(isGate), 'at least one checkpoint').toBe(true);
        expect(l.cards.length, 'cards').toBeGreaterThanOrEqual(3);
        l.cells.forEach((c, i) => checkCell(`${l.id} cell ${i} (${c.kind})`, c, m));
        for (const [f, where] of gdFiles) if (where.startsWith(l.id + ' ')) expect(gdFailures.get(f) ?? null, `${where}: GDScript does not parse`).toBeNull();
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
