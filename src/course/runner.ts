// Glue between lessons and the AppStore: builds the CheckCtx, records which
// commands were used, and can replay a task's solution ("Show me" + tests).

import type { AppStore } from '../app/store';
import type { CheckCtx, Lesson, SolutionStep, Task } from './types';
import { resolveTarget, getCell } from '../app/sheetOps';
import { addrToA1, lettersToCol, parseRange } from '../engine/refs';
import type { Scalar } from '../engine/types';
import { runCommand } from '../app/commands';

export class CommandLog {
  used = new Set<string>();
  usedKey = new Set<string>();
  mouseClicks = 0;
  reset() {
    this.used.clear();
    this.usedKey.clear();
    this.mouseClicks = 0;
  }
  record(id: string, source: 'key' | 'mouse') {
    this.used.add(id);
    if (source === 'key') this.usedKey.add(id);
  }
}

export function makeCtx(s: AppStore, log: CommandLog): CheckCtx {
  const resolve = (ref: string) => {
    const t = resolveTarget(s.books, ref, s.bi, s.si);
    if (!t) throw new Error(`Lesson check references unknown cell "${ref}"`);
    return t;
  };
  // checks always resolve unqualified refs against the lesson's *home* sheet:
  // the first sheet of the first workbook, unless qualified.
  const home = (ref: string) => {
    if (ref.includes('[')) return ref;
    const b0 = s.books[0].name;
    if (!ref.includes('!')) return `[${b0}]${s.books[0].sheets[0].name}!${ref}`;
    if (ref.startsWith("'")) return `'[${b0}]${ref.slice(1)}`;
    return `[${b0}]${ref}`;
  };
  const rangeVals = (ref: string): Scalar[][] => {
    const t = resolve(home(ref));
    const out: Scalar[][] = [];
    for (let r = t.range.r1; r <= t.range.r2; r++) {
      const row: Scalar[] = [];
      for (let c = t.range.c1; c <= t.range.c2; c++) row.push(s.calc.value(t.bi, t.si, r, c));
      out.push(row);
    }
    return out;
  };
  const g = s.range;
  return {
    v: (ref) => {
      const t = resolve(home(ref));
      return s.calc.value(t.bi, t.si, t.range.r1, t.range.c1);
    },
    f: (ref) => {
      const t = resolve(home(ref));
      return getCell(s.books[t.bi].sheets[t.si], t.range.r1, t.range.c1)?.v ?? '';
    },
    style: (ref) => {
      const t = resolve(home(ref));
      return getCell(s.books[t.bi].sheets[t.si], t.range.r1, t.range.c1)?.s ?? {};
    },
    range: rangeVals,
    list: (ref) => rangeVals(ref).flat(),
    inputs: (ref) => {
      const t = resolve(home(ref));
      const out: string[] = [];
      for (let r = t.range.r1; r <= t.range.r2; r++)
        for (let c = t.range.c1; c <= t.range.c2; c++) out.push(getCell(s.books[t.bi].sheets[t.si], r, c)?.v ?? '');
      return out;
    },
    used: (id) => log.used.has(id),
    usedKey: (id) => log.usedKey.has(id),
    sel: {
      book: s.book.name,
      sheet: s.sheet.name,
      active: addrToA1(s.sel.ar, s.sel.ac),
      range: `${addrToA1(g.r1, g.c1)}:${addrToA1(g.r2, g.c2)}`,
      ...g,
    },
    sheet: (name, book) => {
      const b = book ? s.books.find((x) => x.name.toLowerCase() === book.toLowerCase()) : s.books[0];
      if (!b) return undefined;
      return name ? b.sheets.find((x) => x.name.toLowerCase() === name.toLowerCase()) : b.sheets[0];
    },
    sheetNames: (book) => (book ? s.books.find((x) => x.name === book) : s.books[0])?.sheets.map((x) => x.name) ?? [],
    store: s,
  };
}

export function runTaskCheck(task: Task, s: AppStore, log: CommandLog): true | string {
  try {
    const res = task.check(makeCtx(s, log));
    if (res === true && task.mustUseKeys?.length) {
      const missing = task.mustUseKeys.filter((k) => !log.usedKey.has(k));
      if (missing.length) return `Right result! Now do it with the keyboard shortcut to lock in the muscle memory.`;
    }
    return res;
  } catch (e) {
    return String((e as Error).message ?? e);
  }
}

const colIdx = (letters: string) => lettersToCol(letters.replace(/[^A-Za-z]/g, ''));

/** Apply a solution step to the store (used by "Show me" and by tests). */
export function applyStep(s: AppStore, step: SolutionStep) {
  if ('set' in step) {
    for (const [ref, val] of Object.entries(step.set)) s.setInput(ref, val);
  } else if ('select' in step) {
    if (!s.goTo(step.select)) throw new Error('bad select ' + step.select);
  } else if ('cmd' in step) {
    runCommand(s, step.cmd, 'key');
  } else if ('sort' in step) {
    if (step.range) s.goTo(step.range);
    const g = step.range ? s.range : s.dataRange();
    s.sort(step.sort, g, step.header ?? true);
  } else if ('pivot' in step) {
    const g = s.dataRange();
    const headers: string[] = [];
    for (let c = g.c1; c <= g.c2; c++) headers.push(String(s.value(g.r1, c)));
    const col = (name: string) => {
      const i = headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());
      if (i < 0) throw new Error('pivot field not found: ' + name);
      return g.c1 + i;
    };
    s.pivot({
      source: { bi: s.bi, si: s.si, range: g },
      rows: step.pivot.rows.map(col),
      cols: step.pivot.cols ? col(step.pivot.cols) : undefined,
      values: step.pivot.values.map((v) => ({ col: col(v.field), agg: v.agg })),
      sheetName: step.pivot.sheetName,
    });
  } else if ('filter' in step) {
    if (!s.sheet.filter) s.toggleFilter();
    s.setFilter(colIdx(step.filter.col), step.filter.allowed);
  } else if ('cf' in step) {
    s.addCF({ type: step.cf.type, a: step.cf.a, b: step.cf.b, fill: step.cf.fill });
  } else if ('removeDup' in step) {
    const g = s.dataRange();
    s.removeDuplicates(step.removeDup.cols.map(colIdx), g, true);
  } else if ('textToCols' in step) {
    s.textToColumns(step.textToCols);
  } else if ('gotoSpecial' in step) {
    s.gotoSpecial(step.gotoSpecial);
  } else if ('fillMulti' in step) {
    s.fillMulti(step.fillMulti);
  } else if ('freeze' in step) {
    s.freeze(step.freeze);
  } else if ('addSheet' in step) {
    s.addSheet(step.addSheet);
  } else if ('rename' in step) {
    s.renameSheet(s.si, step.rename);
  } else if ('book' in step) {
    const i = s.books.findIndex((b) => b.name === step.book);
    if (i < 0) throw new Error('no book ' + step.book);
    s.activateBook(i);
  } else if ('sheetTab' in step) {
    const i = s.book.sheets.findIndex((x) => x.name === step.sheetTab);
    if (i < 0) throw new Error('no sheet ' + step.sheetTab);
    s.activateSheet(i);
  } else if ('custom' in step) {
    step.custom(s);
  }
}

export function loadLesson(s: AppStore, lesson: Lesson) {
  const books = lesson.workbooks();
  const bi = lesson.start?.book ? Math.max(0, books.findIndex((b) => b.name === lesson.start!.book)) : 0;
  const si = lesson.start?.sheet ? Math.max(0, books[bi].sheets.findIndex((x) => x.name === lesson.start!.sheet)) : 0;
  s.load(books, { bi, si, cell: lesson.start?.cell ?? 'A1' });
  s.readOnlyBooks = new Set((lesson.readOnly ?? []).map((n) => books.findIndex((b) => b.name === n)).filter((i) => i >= 0));
}

// ---------- reusable check helpers for lesson authors ----------

const num = (v: Scalar) => (typeof v === 'number' ? v : NaN);

export const approx = (a: Scalar, b: number, tol = 0.005) => typeof a === 'number' && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

/** Every cell in `ref` must be a formula matching `re`. */
export function formulasMatch(c: CheckCtx, ref: string, re: RegExp, what: string): true | string {
  const ins = c.inputs(ref);
  const bad = ins.findIndex((x) => !x.startsWith('=') || !re.test(x));
  if (bad >= 0) return `Every cell in ${ref} should contain a ${what} formula (cell #${bad + 1} doesn't yet).`;
  return true;
}

/** Values in a single-column/row range must equal `expected` (numbers within tolerance, text case-insensitive). */
export function valuesEqual(c: CheckCtx, ref: string, expected: Scalar[], label = ref): true | string {
  const got = c.list(ref);
  for (let i = 0; i < expected.length; i++) {
    const e = expected[i], g = got[i];
    const ok =
      typeof e === 'number' ? approx(g, e) :
      typeof e === 'string' ? typeof g === 'string' && g.trim().toLowerCase() === e.toLowerCase() :
      e === null ? g === null || g === '' || g === 0 :
      g === e;
    if (!ok) {
      const r = parseRange(ref.replace(/^.*!/, ''))!;
      const vertical = r.r1 !== r.r2;
      const cell = addrToA1(vertical ? r.r1 + i : r.r1, vertical ? r.c1 : r.c1 + i);
      return `${label}: ${cell} shows ${fmtScalar(g)} but should be ${fmtScalar(e)}.`;
    }
  }
  return true;
}

export function fmtScalar(v: Scalar): string {
  if (v === null) return '(blank)';
  if (typeof v === 'string') return `"${v}"`;
  if (typeof v === 'number') return String(Math.round(v * 10000) / 10000);
  return String(v);
}

export const all = (...checks: (true | string)[]): true | string => checks.find((x) => x !== true) ?? true;

void num;
