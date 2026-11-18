// AppStore: the controller for the Excel simulator.
//
// Why one class with a subscribe() instead of React state?
//  * Keyboard handling needs synchronous access to the latest state.
//  * Lessons/drills observe *commands* (did the learner press Ctrl+D?) and
//    *state* (does D2 hold a VLOOKUP?) without being React components.
//  * Workbooks are immutable snapshots -> undo = keep old snapshots.

import { Calc, parseLiteral } from '../engine/calc';
import { cachedParse } from '../engine/calc';
import { mapRefs, shiftFormula, tokenize, toggleAbsoluteAt } from '../engine/parser';
import { RangeAddr, addrToA1, colToLetters, norm, parseRange, qualify } from '../engine/refs';
import { CellStyle, Scalar, Sheet, Workbook, cellKey, isErr, parseKey, CFRule } from '../engine/types';
import { FORMATS, bumpDecimals, formatValue } from '../engine/format';
import {
  GRID_COLS, GRID_ROWS, PivotSpec, SortKey, applyFilter, buildPivot, clearContents, currentRegion, displayText, edgeJump,
  fillRange, fillSeries, getCell, insertDelete, pasteBlock, removeDuplicates, resolveTarget, sortRange, styleRange,
  textToColumns, usedRange, withCells, DEFAULT_COL_W,
} from './sheetOps';
import { FUNCS } from '../engine/functions';

export interface Sel {
  ar: number; // active cell (anchor)
  ac: number;
  fr: number; // moving corner
  fc: number;
}

export interface PointState {
  bi: number;
  si: number;
  ar: number;
  ac: number;
  fr: number;
  fc: number;
  start: number; // span of the ref text inside edit.text
  end: number;
}

export interface EditState {
  bi: number;
  si: number;
  r: number;
  c: number;
  text: string;
  caret: number;
  mode: 'enter' | 'edit';
  point: PointState | null;
  acIndex: number; // autocomplete highlight
}

export type DialogState =
  | { type: 'goto' }
  | { type: 'gotoSpecial' }
  | { type: 'find'; replace?: boolean }
  | { type: 'formatCells' }
  | { type: 'pasteSpecial' }
  | { type: 'insert' }
  | { type: 'delete' }
  | { type: 'sort' }
  | { type: 'pivot' }
  | { type: 'removeDup' }
  | { type: 'textToCols' }
  | { type: 'cf' }
  | { type: 'rename' }
  | { type: 'colWidth' }
  | { type: 'filterMenu'; col: number }
  | { type: 'shortcuts' };

export interface CommandEvent {
  id: string;
  source: 'key' | 'mouse';
  at: number;
}

interface Snapshot {
  books: Workbook[];
  bi: number;
  sheetIdx: number[];
}

export interface Toast {
  id: number;
  text: string;
  kind?: 'info' | 'warn';
}

const selKey = (bi: number, si: number) => `${bi}:${si}`;

export class AppStore {
  books: Workbook[] = [];
  bi = 0;
  sheetIdx: number[] = [];
  sels: Record<string, Sel> = {};
  edit: EditState | null = null;
  clip: { bi: number; si: number; range: RangeAddr; cut: boolean } | null = null;
  showFormulas = false;
  dialog: DialogState | null = null;
  keytip: string | null = null;
  calc: Calc = new Calc([]);
  status: string | null = null;
  toasts: Toast[] = [];
  lastFill = '#FFFF00';
  lastFontColor = '#0000FF';
  version = 0;
  /** set by a lesson to stop learners from doing structural things it doesn't support */
  readOnlyBooks = new Set<number>();

  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private listeners = new Set<() => void>();
  private cmdListeners = new Set<(e: CommandEvent) => void>();
  private toastId = 1;

  constructor(books?: Workbook[]) {
    if (books) this.load(books);
  }

  // ---------------- subscription ----------------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  onCommand(fn: (e: CommandEvent) => void) {
    this.cmdListeners.add(fn);
    return () => {
      this.cmdListeners.delete(fn);
    };
  }
  emitCommand(id: string, source: 'key' | 'mouse') {
    const e = { id, source, at: performance.now() };
    this.cmdListeners.forEach((f) => f(e));
  }
  notify() {
    this.version++;
    this.listeners.forEach((f) => f());
  }
  getVersion = () => this.version;

  load(books: Workbook[], opts?: { bi?: number; si?: number; cell?: string }) {
    this.books = books;
    this.bi = opts?.bi ?? 0;
    this.sheetIdx = books.map(() => 0);
    if (opts?.si !== undefined) this.sheetIdx[this.bi] = opts.si;
    this.sels = {};
    this.edit = null;
    this.clip = null;
    this.dialog = null;
    this.keytip = null;
    this.status = null;
    this.undoStack = [];
    this.redoStack = [];
    this.recalc();
    if (opts?.cell) {
      const g = parseRange(opts.cell);
      if (g) this.setSel({ ar: g.r1, ac: g.c1, fr: g.r2, fc: g.c2 });
    }
    this.notify();
  }

  // ---------------- getters ----------------
  get book() {
    return this.books[this.bi];
  }
  get si() {
    return this.sheetIdx[this.bi] ?? 0;
  }
  get sheet(): Sheet {
    return this.book.sheets[this.si];
  }
  get sel(): Sel {
    return this.sels[selKey(this.bi, this.si)] ?? { ar: 0, ac: 0, fr: 0, fc: 0 };
  }
  get range(): RangeAddr {
    const s = this.sel;
    const g = this.withinRange;
    if (g && s.ar >= g.r1 && s.ar <= g.r2 && s.ac >= g.c1 && s.ac <= g.c2) return g;
    return norm({ r1: s.ar, c1: s.ac, r2: s.fr, c2: s.fc });
  }
  setSel(s: Sel, bi = this.bi, si = this.si) {
    this.sels[selKey(bi, si)] = s;
  }
  value(r: number, c: number, bi = this.bi, si = this.si): Scalar {
    return this.calc.value(bi, si, r, c);
  }
  /** Viewed position: during point mode you may be looking at another sheet/book. */
  get viewing() {
    return { bi: this.bi, si: this.si };
  }

  recalc() {
    this.calc = new Calc(this.books);
  }

  toast(text: string, kind: 'info' | 'warn' = 'info') {
    const t = { id: this.toastId++, text, kind };
    this.toasts = [...this.toasts, t];
    this.notify();
    setTimeout(() => {
      this.toasts = this.toasts.filter((x) => x.id !== t.id);
      this.notify();
    }, 2600);
  }

  // ---------------- undo ----------------
  private snapshot(): Snapshot {
    return { books: this.books, bi: this.bi, sheetIdx: [...this.sheetIdx] };
  }
  /** Replace workbooks with a new version, pushing undo. */
  commit(books: Workbook[]) {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
    this.books = books;
    this.recalc();
    this.refilter();
    this.notify();
  }
  updateSheet(fn: (sh: Sheet) => Sheet, bi = this.bi, si = this.si) {
    if (this.readOnlyBooks.has(bi)) {
      this.toast(`${this.books[bi].name} is read-only in this exercise.`, 'warn');
      return;
    }
    const books = this.books.map((b, i) =>
      i === bi ? { ...b, sheets: b.sheets.map((s, j) => (j === si ? fn(s) : s)) } : b,
    );
    this.commit(books);
  }
  undo() {
    const s = this.undoStack.pop();
    if (!s) return;
    this.redoStack.push(this.snapshot());
    this.books = s.books;
    this.bi = s.bi;
    this.sheetIdx = s.sheetIdx;
    this.recalc();
    this.notify();
  }
  redo() {
    const s = this.redoStack.pop();
    if (!s) return;
    this.undoStack.push(this.snapshot());
    this.books = s.books;
    this.bi = s.bi;
    this.sheetIdx = s.sheetIdx;
    this.recalc();
    this.notify();
  }
  private refilter() {
    // keep filter-hidden rows in sync when data changes
    let changed = false;
    const books = this.books.map((b, bi) => ({
      ...b,
      sheets: b.sheets.map((sh, si) => {
        if (!sh.filter) return sh;
        const ns = applyFilter(this.calc, bi, si, sh);
        if (JSON.stringify(ns.hiddenRows) !== JSON.stringify(sh.hiddenRows)) {
          changed = true;
          return ns;
        }
        return sh;
      }),
    }));
    if (changed) {
      this.books = books;
      this.recalc();
    }
  }

  // ---------------- navigation ----------------
  isHiddenRow(r: number, sh = this.sheet) {
    return !!sh.hiddenRows?.[r];
  }
  isHiddenCol(c: number, sh = this.sheet) {
    return sh.colWidths[c] === 0;
  }
  private stepVisible(r: number, c: number, dr: number, dc: number): [number, number] {
    let nr = r + dr, nc = c + dc;
    while (nr > 0 && nr < GRID_ROWS - 1 && dr !== 0 && this.isHiddenRow(nr)) nr += dr;
    while (nc > 0 && nc < GRID_COLS - 1 && dc !== 0 && this.isHiddenCol(nc)) nc += dc;
    return [clamp(nr, 0, GRID_ROWS - 1), clamp(nc, 0, GRID_COLS - 1)];
  }
  move(dr: number, dc: number) {
    const s = this.sel;
    const [r, c] = this.stepVisible(s.ar, s.ac, dr, dc);
    this.setSel({ ar: r, ac: c, fr: r, fc: c });
    this.withinRange = null;
    this.multi = null;
    this.notify();
  }
  /** Enter/Tab inside a multi-cell selection cycles within it (like Excel). */
  moveWithin(dr: number, dc: number) {
    const g = this.range;
    const s = this.sel;
    if (g.r1 === g.r2 && g.c1 === g.c2) return this.move(dr, dc);
    let r = s.ar, c = s.ac;
    if (dr) {
      r += dr;
      if (r > g.r2) { r = g.r1; c = c + 1 > g.c2 ? g.c1 : c + 1; }
      if (r < g.r1) { r = g.r2; c = c - 1 < g.c1 ? g.c2 : c - 1; }
    } else {
      c += dc;
      if (c > g.c2) { c = g.c1; r = r + 1 > g.r2 ? g.r1 : r + 1; }
      if (c < g.c1) { c = g.c2; r = r - 1 < g.r1 ? g.r2 : r - 1; }
    }
    this.sels[selKey(this.bi, this.si)] = { ar: r, ac: c, fr: r, fc: c };
    this.withinRange = g;
    this.notify();
  }
  /** When set, the highlighted range is this (active cell can move inside it). */
  withinRange: RangeAddr | null = null;
  get displayRange(): RangeAddr {
    return this.range;
  }
  edge(dr: number, dc: number) {
    const s = this.sel;
    const [r, c] = edgeJump(this.calc, this.bi, this.si, this.sheet, s.ar, s.ac, dr, dc);
    this.setSel({ ar: r, ac: c, fr: r, fc: c });
    this.withinRange = null;
    this.notify();
  }
  extend(dr: number, dc: number) {
    const s = this.sel;
    const [r, c] = this.stepVisible(s.fr, s.fc, dr, dc);
    this.setSel({ ...s, fr: r, fc: c });
    this.withinRange = null;
    this.notify();
  }
  extendEdge(dr: number, dc: number) {
    const s = this.sel;
    const [r, c] = edgeJump(this.calc, this.bi, this.si, this.sheet, s.fr, s.fc, dr, dc);
    this.setSel({ ...s, fr: r, fc: c });
    this.withinRange = null;
    this.notify();
  }
  select(r: number, c: number, extend = false) {
    const s = this.sel;
    this.withinRange = null;
    this.multi = null;
    if (extend) this.setSel({ ...s, fr: r, fc: c });
    else this.setSel({ ar: r, ac: c, fr: r, fc: c });
    this.notify();
  }
  selectRange(g: RangeAddr, active?: { r: number; c: number }) {
    this.withinRange = null;
    const a = active ?? { r: g.r1, c: g.c1 };
    this.setSel({ ar: a.r, ac: a.c, fr: a.r === g.r1 ? g.r2 : g.r1, fc: a.c === g.c1 ? g.c2 : g.c1 });
    if (a.r !== g.r1 && a.r !== g.r2) this.withinRange = g;
    if (a.c !== g.c1 && a.c !== g.c2) this.withinRange = g;
    this.notify();
  }
  /** Go To / Name Box: "B4", "Sheet2!A1:C9", "[Book.xlsx]Data!A1". */
  goTo(text: string): boolean {
    const t = resolveTarget(this.books, text.trim(), this.bi, this.si);
    if (!t) return false;
    this.bi = t.bi;
    this.sheetIdx[t.bi] = t.si;
    this.selectRange({ ...t.range, r2: Math.min(t.range.r2, GRID_ROWS - 1), c2: Math.min(t.range.c2, GRID_COLS - 1) });
    return true;
  }
  activateSheet(si: number) {
    if (si < 0 || si >= this.book.sheets.length) return;
    this.sheetIdx[this.bi] = si;
    this.withinRange = null;
    this.notify();
  }
  activateBook(bi: number) {
    if (bi < 0 || bi >= this.books.length) return;
    this.bi = bi;
    this.withinRange = null;
    this.notify();
  }

  // ---------------- editing ----------------
  startEdit(text?: string, mode: 'enter' | 'edit' = 'edit') {
    if (this.edit) return;
    if (this.readOnlyBooks.has(this.bi)) {
      this.toast(`${this.book.name} is read-only in this exercise.`, 'warn');
      return;
    }
    const s = this.sel;
    const cur = getCell(this.sheet, s.ar, s.ac)?.v ?? '';
    const t = text ?? cur;
    this.edit = { bi: this.bi, si: this.si, r: s.ar, c: s.ac, text: t, caret: t.length, mode, point: null, acIndex: 0 };
    this.notify();
  }
  setEditText(text: string, caret: number) {
    if (!this.edit) return;
    const e = this.edit;
    // typing anywhere ends point mode (the ref is "locked in")
    this.edit = { ...e, text, caret, point: null, acIndex: 0 };
    this.notify();
  }
  setEditCaret(caret: number) {
    if (!this.edit) return;
    this.edit = { ...this.edit, caret };
  }
  toggleEditMode() {
    if (!this.edit) return this.startEdit(undefined, 'edit');
    this.edit = { ...this.edit, mode: this.edit.mode === 'edit' ? 'enter' : 'edit', point: null };
    this.notify();
  }
  cancelEdit() {
    if (!this.edit) return;
    const e = this.edit;
    this.edit = null;
    this.bi = e.bi;
    this.sheetIdx[e.bi] = e.si;
    this.notify();
  }

  /** Is the caret at a spot where a cell reference may be inserted? */
  canPoint(): boolean {
    const e = this.edit;
    if (!e || !e.text.startsWith('=')) return false;
    if (e.point) return true;
    if (e.mode === 'edit') return false;
    const before = e.text.slice(0, e.caret).replace(/\s+$/, '');
    const last = before[before.length - 1];
    return !!last && '=(,+-*/^&<>:;{'.includes(last);
  }

  /** Insert or update the pointed reference in the formula text. */
  private writePoint(p: Omit<PointState, 'start' | 'end'>) {
    const e = this.edit!;
    const g = norm({ r1: p.ar, c1: p.ac, r2: p.fr, c2: p.fc });
    let refText: string;
    const fullCol = g.r1 === 0 && g.r2 === GRID_ROWS - 1;
    const fullRow = g.c1 === 0 && g.c2 === GRID_COLS - 1;
    const external = p.bi !== e.bi;
    const abs = external; // Excel makes external refs absolute
    const cellA = (r: number, c: number) => (abs ? `$${colToLetters(c)}$${r + 1}` : addrToA1(r, c));
    if (fullCol) refText = abs ? `$${colToLetters(g.c1)}:$${colToLetters(g.c2)}` : `${colToLetters(g.c1)}:${colToLetters(g.c2)}`;
    else if (fullRow) refText = `${g.r1 + 1}:${g.r2 + 1}`;
    else if (g.r1 === g.r2 && g.c1 === g.c2) refText = cellA(g.r1, g.c1);
    else refText = `${cellA(g.r1, g.c1)}:${cellA(g.r2, g.c2)}`;
    let prefix = '';
    if (external) prefix = qualify(this.books[p.bi].sheets[p.si].name, this.books[p.bi].name) + '!';
    else if (p.si !== e.si) prefix = qualify(this.books[p.bi].sheets[p.si].name) + '!';
    // unquoted external refs read better: [Book.xlsx]Sheet!A1
    if (external && /^[A-Za-z0-9_.\-]+$/.test(this.books[p.bi].name) && /^[A-Za-z_][A-Za-z0-9_.]*$/.test(this.books[p.bi].sheets[p.si].name))
      prefix = `[${this.books[p.bi].name}]${this.books[p.bi].sheets[p.si].name}!`;
    const full = prefix + refText;
    const start = e.point ? e.point.start : e.caret;
    const end = e.point ? e.point.end : e.caret;
    const text = e.text.slice(0, start) + full + e.text.slice(end);
    this.edit = { ...e, text, caret: start + full.length, point: { ...p, start, end: start + full.length } };
    this.notify();
  }

  /** Arrow keys while typing a formula: move/extend the pointed reference. */
  pointMove(dr: number, dc: number, extend: boolean, toEdge: boolean) {
    const e = this.edit!;
    const p = e.point ?? { bi: this.bi, si: this.si, ar: e.bi === this.bi && e.si === this.si ? e.r : this.sel.ar, ac: e.bi === this.bi && e.si === this.si ? e.c : this.sel.ac, fr: 0, fc: 0, start: e.caret, end: e.caret };
    if (!e.point) {
      p.fr = p.ar;
      p.fc = p.ac;
    }
    const sh = this.books[p.bi].sheets[p.si];
    const step = (r: number, c: number): [number, number] =>
      toEdge ? edgeJump(this.calc, p.bi, p.si, sh, r, c, dr, dc) : [clamp(r + dr, 0, GRID_ROWS - 1), clamp(c + dc, 0, GRID_COLS - 1)];
    if (extend) {
      const [r, c] = step(p.fr, p.fc);
      this.writePoint({ ...p, fr: r, fc: c });
    } else {
      const [r, c] = e.point ? step(p.ar, p.ac) : step(p.ar, p.ac);
      this.writePoint({ ...p, ar: r, ac: c, fr: r, fc: c });
    }
  }
  /** Click/drag on the grid while typing a formula. */
  pointAt(r: number, c: number, extend: boolean) {
    const e = this.edit!;
    const p = e.point;
    if (extend && p && p.bi === this.bi && p.si === this.si) this.writePoint({ ...p, fr: r, fc: c });
    else this.writePoint({ bi: this.bi, si: this.si, ar: r, ac: c, fr: r, fc: c });
  }
  pointSelectWhole(kind: 'col' | 'row') {
    const e = this.edit!;
    const p = e.point;
    if (!p) return;
    if (kind === 'col') this.writePoint({ ...p, ar: 0, fr: GRID_ROWS - 1 });
    else this.writePoint({ ...p, ac: 0, fc: GRID_COLS - 1 });
  }

  f4() {
    const e = this.edit;
    if (!e) return;
    const res = toggleAbsoluteAt(e.text, e.point ? e.point.end : e.caret);
    this.edit = { ...e, text: res.text, caret: res.caret, point: e.point ? { ...e.point, end: e.point.end + (res.text.length - e.text.length) } : null };
    this.notify();
  }

  /** Accept the edit. dir: where the active cell goes next. */
  commitEdit(dir: 'down' | 'up' | 'right' | 'left' | 'none' = 'down', fillSelection = false) {
    const e = this.edit;
    if (!e) return;
    let text = e.text;
    if (text.startsWith('=') && text.length > 1) text = normalizeFormula(text);
    this.edit = null;
    // return to origin
    this.bi = e.bi;
    this.sheetIdx[e.bi] = e.si;
    const sh = this.books[e.bi].sheets[e.si];
    const prevStyle = getCell(sh, e.r, e.c)?.s;
    const style = autoFormat(text, prevStyle);
    if (fillSelection) {
      const g = this.range;
      const edits: { r: number; c: number; v: string; s?: CellStyle }[] = [];
      for (let r = g.r1; r <= g.r2; r++)
        for (let c = g.c1; c <= g.c2; c++) {
          if (this.isHiddenRow(r, sh)) continue;
          edits.push({ r, c, v: text.startsWith('=') ? shiftFormula(text, r - e.r, c - e.c) : text, s: style ?? getCell(sh, r, c)?.s });
        }
      this.updateSheet((s) => withCells(s, edits), e.bi, e.si);
      this.emitCommand('edit.fillSelection', 'key');
    } else {
      const cur = getCell(sh, e.r, e.c);
      if ((cur?.v ?? '') !== text || style !== prevStyle) {
        this.updateSheet((s) => withCells(s, [{ r: e.r, c: e.c, v: text, s: style }]), e.bi, e.si);
      } else this.notify();
      this.emitCommand('edit.commit', 'key');
      if (text.startsWith('=')) this.emitCommand('edit.commitFormula', 'key');
    }
    const g = this.withinRange ?? this.range;
    const multi = g.r1 !== g.r2 || g.c1 !== g.c2;
    if (fillSelection) return;
    if (dir === 'down') multi ? this.moveWithin(1, 0) : this.move(1, 0);
    else if (dir === 'up') multi ? this.moveWithin(-1, 0) : this.move(-1, 0);
    else if (dir === 'right') multi ? this.moveWithin(0, 1) : this.move(0, 1);
    else if (dir === 'left') multi ? this.moveWithin(0, -1) : this.move(0, -1);
  }

  /** Programmatic input (used by lesson solutions and tests). */
  setInput(ref: string, text: string) {
    const t = resolveTarget(this.books, ref, this.bi, this.si);
    if (!t) throw new Error('bad ref ' + ref);
    const v = text.startsWith('=') && text.length > 1 ? normalizeFormula(text) : text;
    const edits: { r: number; c: number; v: string; s?: CellStyle }[] = [];
    const sh = this.books[t.bi].sheets[t.si];
    for (let r = t.range.r1; r <= t.range.r2; r++)
      for (let c = t.range.c1; c <= t.range.c2; c++) {
        const vv = v.startsWith('=') ? shiftFormula(v, r - t.range.r1, c - t.range.c1) : v;
        edits.push({ r, c, v: vv, s: autoFormat(vv, getCell(sh, r, c)?.s) });
      }
    const ro = this.readOnlyBooks.has(t.bi);
    if (ro) this.readOnlyBooks.delete(t.bi);
    this.updateSheet((s) => withCells(s, edits), t.bi, t.si);
    if (ro) this.readOnlyBooks.add(t.bi);
  }

  // ---------------- clipboard ----------------
  copy(cut = false) {
    this.clip = { bi: this.bi, si: this.si, range: this.clampToUsed(this.range), cut };
    this.status = 'Select destination and press ENTER or choose Paste';
    // also put TSV on the system clipboard so you can paste into real Excel
    try {
      const g = this.clip.range;
      const lines: string[] = [];
      for (let r = g.r1; r <= Math.min(g.r2, g.r1 + 2000); r++) {
        const row: string[] = [];
        for (let c = g.c1; c <= g.c2; c++) row.push(displayText(this.calc, this.bi, this.si, this.sheet, r, c));
        lines.push(row.join('\t'));
      }
      navigator.clipboard?.writeText(lines.join('\n')).catch(() => {});
    } catch {
      /* ignore */
    }
    this.notify();
  }
  clampToUsed(g: RangeAddr): RangeAddr {
    const u = usedRange(this.sheet);
    if (!u) return g;
    return { r1: g.r1, c1: g.c1, r2: Math.min(g.r2, Math.max(u.r2, g.r1)), c2: Math.min(g.c2, Math.max(u.c2, g.c1)) };
  }
  paste(mode: 'all' | 'values' | 'formulas' | 'formats' = 'all', transpose = false) {
    const cl = this.clip;
    if (!cl) {
      this.toast('Nothing copied yet — select cells and press Ctrl+C first.', 'warn');
      return;
    }
    const src = this.books[cl.bi].sheets[cl.si];
    const dst = this.range;
    const h = cl.range.r2 - cl.range.r1 + 1, w = cl.range.c2 - cl.range.c1 + 1;
    const calc = this.calc;
    const valueOf = (r: number, c: number) => calc.value(cl.bi, cl.si, r, c);
    // Pasting one copied cell into a bigger selection fills the whole selection.
    const targets: [number, number][] = [];
    const dh = dst.r2 - dst.r1 + 1, dw = dst.c2 - dst.c1 + 1;
    if ((dh > h || dw > w) && dh % h === 0 && dw % w === 0 && !transpose) {
      for (let r = dst.r1; r <= dst.r2; r += h) for (let c = dst.c1; c <= dst.c2; c += w) if (!this.isHiddenRow(r)) targets.push([r, c]);
    } else targets.push([dst.r1, dst.c1]);
    let books = this.books;
    for (const [r0, c0] of targets) {
      books = books.map((b, i) =>
        i === this.bi
          ? { ...b, sheets: b.sheets.map((s, j) => (j === this.si ? pasteBlock(src, cl.range, s, r0, c0, mode, { value: valueOf }, transpose, cl.cut) : s)) }
          : b,
      );
    }
    if (cl.cut) {
      // clear source cells that were not overwritten
      const moved = books[cl.bi].sheets[cl.si];
      const cleared = clearContentsExcept(moved, cl.range, cl.bi === this.bi && cl.si === this.si ? { r1: dst.r1, c1: dst.c1, r2: dst.r1 + h - 1, c2: dst.c1 + w - 1 } : null);
      books = books.map((b, i) => (i === cl.bi ? { ...b, sheets: b.sheets.map((s, j) => (j === cl.si ? cleared : s)) } : b));
      this.clip = null;
      this.status = null;
    }
    this.commit(books);
    const sz = transpose ? { h: w, w: h } : { h, w };
    if (targets.length === 1) this.selectRange({ r1: dst.r1, c1: dst.c1, r2: dst.r1 + sz.h - 1, c2: dst.c1 + sz.w - 1 });
  }

  // ---------------- cell commands ----------------
  clearSelection() {
    const g = this.clampToUsed(this.range);
    this.updateSheet((s) => clearContents(s, g));
  }
  style(patch: (s: CellStyle) => CellStyle) {
    const g = this.range;
    this.updateSheet((s) => styleRange(s, g, patch));
  }
  toggleStyle(key: 'b' | 'i' | 'u') {
    const s = this.sel;
    const cur = !!getCell(this.sheet, s.ar, s.ac)?.s?.[key];
    this.style((st) => ({ ...st, [key]: !cur }));
  }
  setFormat(fmt: string) {
    this.style((s) => ({ ...s, fmt: fmt === 'General' ? undefined : fmt }));
  }
  bumpDecimals(delta: number) {
    const s = this.sel;
    const cell = getCell(this.sheet, s.ar, s.ac);
    const v = this.value(s.ar, s.ac);
    const nf = bumpDecimals(cell?.s?.fmt, delta, typeof v === 'number' ? v : null);
    this.setFormat(nf);
  }
  /** Only shrink whole-row/column selections; an explicit range is honoured as selected. */
  clampWhole(g: RangeAddr): RangeAddr {
    return g.r2 === GRID_ROWS - 1 || g.c2 === GRID_COLS - 1 ? this.clampToUsed(g) : g;
  }
  border(kind: 'all' | 'outside' | 'none' | 'bottom' | 'top' | 'thick') {
    const g = this.clampWhole(this.range);
    const sh = this.sheet;
    const edits: { r: number; c: number; s: CellStyle }[] = [];
    for (let r = g.r1; r <= g.r2; r++)
      for (let c = g.c1; c <= g.c2; c++) {
        const st = { ...(getCell(sh, r, c)?.s ?? {}) };
        let b = { ...(st.border ?? {}) };
        if (kind === 'none') b = {};
        if (kind === 'all') b = { t: true, b: true, l: true, r: true };
        if (kind === 'outside' || kind === 'thick') {
          let sides = '';
          if (r === g.r1) { b.t = true; sides += 't'; }
          if (r === g.r2) { b.b = true; sides += 'b'; }
          if (c === g.c1) { b.l = true; sides += 'l'; }
          if (c === g.c2) { b.r = true; sides += 'r'; }
          if (kind === 'thick' && sides) {
            const merged = [...new Set((b.thickSides ?? '') + sides)].join('');
            b.thickSides = merged;
            b.thick = ['t', 'b', 'l', 'r'].every((x) => !b[x as 't'] || merged.includes(x)) || undefined;
          }
        }
        if (kind === 'bottom' && r === g.r2) b.b = true;
        if (kind === 'top' && r === g.r1) b.t = true;
        st.border = Object.keys(b).length ? b : undefined;
        edits.push({ r, c, s: st });
      }
    this.updateSheet((s) => withCells(s, edits));
  }
  fillDown() {
    const g = this.range;
    if (g.r1 === g.r2) {
      // Ctrl+D on one cell copies the cell above
      if (g.r1 === 0) return;
      this.updateSheet((s) => fillRange(s, { ...g, r1: g.r1 - 1 }, 'down'));
    } else this.updateSheet((s) => fillRange(s, this.clampToUsedRows(g), 'down'));
  }
  private clampToUsedRows(g: RangeAddr): RangeAddr {
    if (g.r2 === GRID_ROWS - 1) {
      const u = usedRange(this.sheet);
      return { ...g, r2: u ? Math.max(u.r2, g.r1) : g.r1 };
    }
    return g;
  }
  fillRight() {
    const g = this.range;
    if (g.c1 === g.c2) {
      if (g.c1 === 0) return;
      this.updateSheet((s) => fillRange(s, { ...g, c1: g.c1 - 1 }, 'right'));
    } else this.updateSheet((s) => fillRange(s, g, 'right'));
  }
  /** Double-click the fill handle: fill down as far as the neighbouring column has data. */
  autoFillDown() {
    const g = this.range;
    const sh = this.sheet;
    const nb = [g.c1 - 1, g.c2 + 1].filter((c) => c >= 0);
    let last = g.r2;
    for (const c of nb) {
      let r = g.r2 + 1;
      while (r < GRID_ROWS && (getCell(sh, r, c)?.v ?? '') !== '') r++;
      last = Math.max(last, r - 1);
    }
    if (last <= g.r2) return;
    this.updateSheet((s) => fillSeries(s, g, { ...g, r2: last }));
    this.selectRange({ ...g, r2: last });
    this.emitCommand('fill.handleDouble', 'mouse');
  }
  dragFill(src: RangeAddr, dst: RangeAddr) {
    this.updateSheet((s) => fillSeries(s, src, dst));
    this.selectRange(norm({ r1: Math.min(src.r1, dst.r1), c1: Math.min(src.c1, dst.c1), r2: Math.max(src.r2, dst.r2), c2: Math.max(src.c2, dst.c2) }));
  }
  autoSum() {
    const g = this.range;
    if (g.r1 !== g.r2 || g.c1 !== g.c2) return this.autoSumBlock(g.r2 === GRID_ROWS - 1 || g.c2 === GRID_COLS - 1 ? this.clampToUsed(g) : g);
    const s = this.sel;
    const sh = this.sheet;
    // look up for numbers, else left
    let r = s.ar - 1;
    while (r >= 0 && typeof this.value(r, s.ac) === 'number') r--;
    let ref = '';
    if (r < s.ar - 1) ref = `${addrToA1(r + 1, s.ac)}:${addrToA1(s.ar - 1, s.ac)}`;
    else {
      let c = s.ac - 1;
      while (c >= 0 && typeof this.value(s.ar, c) === 'number') c--;
      if (c < s.ac - 1) ref = `${addrToA1(s.ar, c + 1)}:${addrToA1(s.ar, s.ac - 1)}`;
    }
    void sh;
    this.startEdit(`=SUM(${ref})`, 'enter');
    if (this.edit) this.edit = { ...this.edit, caret: 5 + ref.length };
    this.notify();
  }
  /** Alt+= on a block: fills totals in the empty last row/column (or adds a total row below). */
  private autoSumBlock(g: RangeAddr) {
    const sh = this.sheet;
    const empty = (r: number, c: number) => (getCell(sh, r, c)?.v ?? '') === '';
    let emptyRow = true, emptyCol = true;
    for (let c = g.c1; c <= g.c2; c++) if (!empty(g.r2, c)) emptyRow = false;
    for (let r = g.r1; r <= g.r2; r++) if (!empty(r, g.c2)) emptyCol = false;
    if (g.r1 === g.r2) emptyRow = false;
    if (g.c1 === g.c2) emptyCol = false;
    const edits: { r: number; c: number; v: string }[] = [];
    const colSum = (c: number, r2: number) => `=SUM(${addrToA1(g.r1, c)}:${addrToA1(r2, c)})`;
    if (!emptyRow && !emptyCol) {
      for (let c = g.c1; c <= g.c2; c++) edits.push({ r: g.r2 + 1, c, v: colSum(c, g.r2) });
    } else {
      if (emptyRow) for (let c = g.c1; c <= g.c2; c++) edits.push({ r: g.r2, c, v: colSum(c, g.r2 - 1) });
      if (emptyCol)
        for (let r = g.r1; r <= (emptyRow ? g.r2 - 1 : g.r2); r++) edits.push({ r, c: g.c2, v: `=SUM(${addrToA1(r, g.c1)}:${addrToA1(r, g.c2 - 1)})` });
    }
    this.updateSheet((x) => withCells(x, edits));
  }
  insertNow(time: boolean) {
    const d = new Date();
    const text = time
      ? `${((d.getHours() + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`
      : `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
    if (this.edit) {
      const e = this.edit;
      this.setEditText(e.text.slice(0, e.caret) + text + e.text.slice(e.caret), e.caret + text.length);
    } else {
      this.startEdit(text, 'enter');
    }
  }

  insertCells(kind: 'row' | 'col') {
    const g = this.range;
    const count = kind === 'row' ? g.r2 - g.r1 + 1 : g.c2 - g.c1 + 1;
    const at = kind === 'row' ? g.r1 : g.c1;
    const n = Math.min(count, 1000);
    if (this.readOnlyBooks.has(this.bi)) return this.toast('Read-only in this exercise.', 'warn');
    this.commit(insertDelete(this.books, this.bi, this.si, kind, at, n));
  }
  deleteCells(kind: 'row' | 'col') {
    const g = this.range;
    const count = kind === 'row' ? g.r2 - g.r1 + 1 : g.c2 - g.c1 + 1;
    const at = kind === 'row' ? g.r1 : g.c1;
    if (this.readOnlyBooks.has(this.bi)) return this.toast('Read-only in this exercise.', 'warn');
    this.commit(insertDelete(this.books, this.bi, this.si, kind, at, -Math.min(count, GRID_ROWS)));
  }
  isWholeRows() {
    const g = this.range;
    return g.c1 === 0 && g.c2 === GRID_COLS - 1;
  }
  isWholeCols() {
    const g = this.range;
    return g.r1 === 0 && g.r2 === GRID_ROWS - 1;
  }
  hideRows(hide: boolean) {
    const g = this.range;
    this.updateSheet((sh) => {
      const hr = { ...(sh.hiddenRows ?? {}) };
      for (let r = g.r1; r <= Math.min(g.r2, g.r1 + 5000); r++) {
        if (hide) hr[r] = true;
        else delete hr[r];
      }
      return { ...sh, hiddenRows: hr };
    });
  }
  hideCols(hide: boolean) {
    const g = this.range;
    this.updateSheet((sh) => {
      const cw = { ...sh.colWidths };
      for (let c = g.c1; c <= Math.min(g.c2, g.c1 + 500); c++) {
        if (hide) cw[c] = 0;
        else if (cw[c] === 0) delete cw[c];
      }
      return { ...sh, colWidths: cw };
    });
  }
  setColWidth(c: number, w: number) {
    this.updateSheet((sh) => ({ ...sh, colWidths: { ...sh.colWidths, [c]: Math.max(0, Math.round(w)) } }));
  }
  autofitCols() {
    const g = this.range;
    const sh = this.sheet;
    const u = usedRange(sh);
    const cw = { ...sh.colWidths };
    const c2 = Math.min(g.c2, u ? u.c2 : g.c1);
    for (let c = g.c1; c <= c2; c++) {
      let max = 0;
      const r2 = u ? u.r2 : 0;
      for (let r = 0; r <= r2; r++) {
        const cell = getCell(sh, r, c);
        if (!cell) continue;
        const t = this.showFormulas && cell.v.startsWith('=') ? cell.v : displayText(this.calc, this.bi, this.si, sh, r, c);
        max = Math.max(max, measure(t, !!cell.s?.b));
      }
      cw[c] = Math.max(24, Math.min(600, max + 14));
    }
    this.updateSheet((s) => ({ ...s, colWidths: cw }));
  }

  // ---------------- sheets ----------------
  addSheet(name?: string) {
    const n = name ?? nextSheetName(this.book);
    const books = this.books.map((b, i) =>
      i === this.bi ? { ...b, sheets: [...b.sheets.slice(0, this.si), { name: n, cells: {}, colWidths: {} }, ...b.sheets.slice(this.si)] } : b,
    );
    this.commit(books);
    this.sels = Object.fromEntries(Object.entries(this.sels).filter(([k]) => !k.startsWith(`${this.bi}:`)));
    this.activateSheet(this.si);
    return n;
  }
  addSheetAt(name: string, rows: string[][], bi = this.bi) {
    const cells: Sheet['cells'] = {};
    rows.forEach((row, r) => row.forEach((v, c) => { if (v !== '') cells[cellKey(r, c)] = { v }; }));
    const sheet: Sheet = { name, cells, colWidths: {} };
    const books = this.books.map((b, i) => (i === bi ? { ...b, sheets: [...b.sheets, sheet] } : b));
    this.commit(books);
    this.bi = bi;
    this.sheetIdx[bi] = books[bi].sheets.length - 1;
    this.notify();
  }
  renameSheet(si: number, name: string) {
    const old = this.book.sheets[si].name;
    const clean = name.trim().slice(0, 31);
    if (!clean || /[\\/?*[\]:]/.test(clean)) return this.toast('Sheet names cannot contain \\ / ? * [ ] :', 'warn');
    if (this.book.sheets.some((s, i) => i !== si && s.name.toLowerCase() === clean.toLowerCase())) return this.toast('That name is already taken.', 'warn');
    const bookName = this.book.name;
    const books = this.books.map((b, i) => ({
      ...b,
      sheets: b.sheets.map((sh, j) => {
        const cells: Sheet['cells'] = {};
        for (const k in sh.cells) {
          const cell = sh.cells[k];
          cells[k] = cell.v.startsWith('=') ? { ...cell, v: renameRefs(cell.v, old, clean, bookName, b.name) } : cell;
        }
        return { ...sh, cells, name: i === this.bi && j === si ? clean : sh.name };
      }),
    }));
    this.commit(books);
  }
  deleteSheet(si: number) {
    if (this.book.sheets.length <= 1) return this.toast('A workbook must contain at least one visible worksheet.', 'warn');
    const books = this.books.map((b, i) => (i === this.bi ? { ...b, sheets: b.sheets.filter((_, j) => j !== si) } : b));
    this.commit(books);
    this.sheetIdx[this.bi] = Math.max(0, Math.min(si, this.book.sheets.length - 1));
    this.sels = {};
    this.notify();
  }

  // ---------------- data tools ----------------
  /** The block a data command should act on: the selection, or the current region if one cell is selected. */
  dataRange(): RangeAddr {
    const g = this.range;
    if (g.r1 === g.r2 && g.c1 === g.c2) return currentRegion(this.calc, this.bi, this.si, this.sheet, g.r1, g.c1);
    return this.clampToUsed(g);
  }
  guessHeader(g: RangeAddr) {
    const a = this.value(g.r1, g.c1), b = this.value(g.r1 + 1, g.c1);
    const rowText = [];
    for (let c = g.c1; c <= g.c2; c++) rowText.push(typeof this.value(g.r1, c) === 'string');
    return rowText.every(Boolean) && (typeof b !== 'string' || typeof a === 'string');
  }
  sort(keys: SortKey[], g = this.dataRange(), hasHeader = this.guessHeader(g)) {
    this.updateSheet((sh) => sortRange(this.calc, this.bi, this.si, sh, g, keys, hasHeader));
  }
  sortQuick(desc: boolean) {
    const g = this.dataRange();
    const col = this.sel.ac;
    this.sort([{ col, desc }], g);
  }
  toggleFilter() {
    const sh = this.sheet;
    if (sh.filter) {
      this.updateSheet((s) => ({ ...s, filter: undefined, hiddenRows: {} }));
      return;
    }
    const g = this.dataRange();
    this.updateSheet((s) => ({ ...s, filter: { range: `${addrToA1(g.r1, g.c1)}:${addrToA1(g.r2, g.c2)}`, allowed: {} } }));
  }
  setFilter(col: number, allowed: string[] | undefined) {
    this.updateSheet((s) => {
      if (!s.filter) return s;
      const ns = { ...s, filter: { ...s.filter, allowed: { ...s.filter.allowed, [col]: allowed } } };
      return applyFilter(this.calc, this.bi, this.si, ns);
    });
  }
  clearFilters() {
    this.updateSheet((s) => (s.filter ? applyFilter(this.calc, this.bi, this.si, { ...s, filter: { ...s.filter, allowed: {} } }) : s));
  }
  removeDuplicates(cols: number[], g = this.dataRange(), hasHeader = true) {
    let msg = '';
    this.updateSheet((sh) => {
      const res = removeDuplicates(this.calc, this.bi, this.si, sh, g, cols, hasHeader);
      msg = `${res.removed} duplicate values found and removed; ${res.kept} unique values remain.`;
      return res.sheet;
    });
    this.toast(msg);
  }
  textToColumns(delim: string) {
    const g = this.range;
    this.updateSheet((sh) => textToColumns(this.calc, this.bi, this.si, sh, { ...this.clampToUsed(g), c2: g.c1 }, delim));
  }
  freeze(kind: 'panes' | 'row' | 'col' | 'none') {
    const s = this.sel;
    this.updateSheet((sh) => {
      if (kind === 'none' || (kind === 'panes' && sh.freeze && (sh.freeze.rows || sh.freeze.cols))) return { ...sh, freeze: undefined };
      if (kind === 'row') return { ...sh, freeze: { rows: 1, cols: 0 } };
      if (kind === 'col') return { ...sh, freeze: { rows: 0, cols: 1 } };
      return { ...sh, freeze: { rows: s.ar, cols: s.ac } };
    });
  }
  toggleGridlines() {
    this.updateSheet((sh) => ({ ...sh, showGridlines: sh.showGridlines === false ? true : false }));
  }
  addCF(rule: Omit<CFRule, 'id' | 'range'>) {
    const g = this.clampWhole(this.range);
    this.updateSheet((sh) => ({ ...sh, cf: [...(sh.cf ?? []), { ...rule, id: String(Date.now()), range: `${addrToA1(g.r1, g.c1)}:${addrToA1(g.r2, g.c2)}` }] }));
  }
  clearCF() {
    this.updateSheet((sh) => ({ ...sh, cf: [] }));
  }
  pivot(spec: Omit<PivotSpec, 'source'> & { source?: PivotSpec['source'] }) {
    const source = spec.source ?? { bi: this.bi, si: this.si, range: this.dataRange() };
    const out = buildPivot(this.calc, { ...spec, source });
    let name = spec.sheetName ?? 'PivotTable';
    let i = 1;
    while (this.books[source.bi].sheets.some((s) => s.name.toLowerCase() === name.toLowerCase())) name = `${spec.sheetName ?? 'PivotTable'}${++i}`;
    const book = this.books[source.bi];
    const cells: Sheet['cells'] = {};
    const isCross = spec.cols !== undefined;
    out.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v === '') return;
        const header = isCross ? r <= 1 : r === 0;
        const total = r === out.length - 1 || (isCross && c === row.length - 1 && r > 0);
        const num = typeof parseLiteral(v) === 'number' && !header && c > 0;
        cells[cellKey(r, c)] = {
          v: header || c === 0 ? (typeof parseLiteral(v) === 'number' ? "'" + v : v) : v,
          s: { ...(header ? { b: true, fill: '#DDEBF7' } : {}), ...(total ? { b: true } : {}), ...(num ? { fmt: '#,##0.##' } : {}), ...(r === out.length - 1 ? { border: { t: true }, fill: '#DDEBF7' } : {}) },
        };
      }),
    );
    const sheet: Sheet = { name, cells, colWidths: { 0: 160, 1: 120 } };
    for (let c = 1; c < (out[1]?.length ?? 2); c++) sheet.colWidths[c] = 120;
    const books = this.books.map((b, bi) => (bi === source.bi ? { ...b, sheets: [...b.sheets, sheet] } : b));
    this.commit(books);
    this.bi = source.bi;
    this.sheetIdx[source.bi] = book.sheets.length;
    this.select(0, 0);
    return name;
  }
  /** F5 > Special > Blanks (or constants/formulas) inside the selection. */
  gotoSpecial(kind: 'blanks' | 'constants' | 'formulas' | 'errors') {
    const g = this.dataRange();
    const hits: [number, number][] = [];
    for (let r = g.r1; r <= g.r2; r++)
      for (let c = g.c1; c <= g.c2; c++) {
        const cell = getCell(this.sheet, r, c);
        const v = cell?.v ?? '';
        const ok =
          kind === 'blanks' ? v === '' :
          kind === 'formulas' ? v.startsWith('=') :
          kind === 'errors' ? isErr(this.value(r, c)) :
          v !== '' && !v.startsWith('=');
        if (ok) hits.push([r, c]);
      }
    if (!hits.length) {
      this.toast('No cells were found.', 'warn');
      return 0;
    }
    this.multi = hits;
    this.select(hits[0][0], hits[0][1]);
    this.multi = hits;
    this.withinRange = null;
    this.notify();
    return hits.length;
  }
  /** Multi-area selection created by Go To Special (Ctrl+Enter fills all of them). */
  multi: [number, number][] | null = null;
  fillMulti(text: string) {
    const hits = this.multi;
    if (!hits) return;
    const [r0, c0] = hits[0];
    const edits = hits.map(([r, c]) => ({ r, c, v: text.startsWith('=') ? shiftFormula(normalizeFormula(text), r - r0, c - c0) : text }));
    this.updateSheet((s) => withCells(s, edits));
    this.multi = null;
  }

  find(query: string, opts: { matchCase?: boolean; whole?: boolean; inFormulas?: boolean; from?: { r: number; c: number } }): { r: number; c: number } | null {
    const sh = this.sheet;
    const keys = Object.keys(sh.cells).map(parseKey).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const q = opts.matchCase ? query : query.toLowerCase();
    const s = opts.from ?? { r: this.sel.ar, c: this.sel.ac };
    const match = (r: number, c: number) => {
      const cell = getCell(sh, r, c);
      if (!cell) return false;
      let t = opts.inFormulas !== false && cell.v.startsWith('=') ? cell.v : displayText(this.calc, this.bi, this.si, sh, r, c);
      if (!opts.matchCase) t = t.toLowerCase();
      return opts.whole ? t === q : t.includes(q);
    };
    const after = keys.filter(([r, c]) => r > s.r || (r === s.r && c > s.c));
    const before = keys.filter(([r, c]) => r < s.r || (r === s.r && c <= s.c));
    for (const [r, c] of [...after, ...before]) if (match(r, c)) return { r, c };
    return null;
  }
  replaceAll(query: string, repl: string, matchCase = false): number {
    const sh = this.sheet;
    let n = 0;
    const edits: { r: number; c: number; v: string }[] = [];
    const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), matchCase ? 'g' : 'gi');
    for (const k in sh.cells) {
      const cell = sh.cells[k];
      if (re.test(cell.v)) {
        re.lastIndex = 0;
        const [r, c] = parseKey(k);
        const nv = cell.v.replace(re, () => {
          n++;
          return repl;
        });
        edits.push({ r, c, v: nv });
      }
      re.lastIndex = 0;
    }
    if (edits.length) this.updateSheet((s) => withCells(s, edits));
    return n;
  }

  /** Ctrl+[ : jump to the first cell/range the active formula refers to (follows links into other files). */
  tracePrecedent() {
    const s = this.sel;
    const v = getCell(this.sheet, s.ar, s.ac)?.v ?? '';
    if (!v.startsWith('=')) return;
    const refs = tokenize(v.slice(1)).filter((t) => t.type === 'ref');
    // prefer a reference into another sheet/file — that's the one you're usually auditing
    const tok = refs.find((t) => t.text.includes('!')) ?? refs[0];
    if (!tok) return;
    if (!this.goTo(tok.text.replace(/#$/, ''))) this.toast('Cannot follow that reference (the file is not open).', 'warn');
  }

  openDialog(d: DialogState | null) {
    this.dialog = d;
    this.notify();
  }
}

// ---------------- helpers ----------------

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}

function clearContentsExcept(sh: Sheet, g: RangeAddr, keep: RangeAddr | null): Sheet {
  const cells = { ...sh.cells };
  for (const k in cells) {
    const [r, c] = parseKey(k);
    if (r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2) {
      if (keep && r >= keep.r1 && r <= keep.r2 && c >= keep.c1 && c <= keep.c2) continue;
      delete cells[k];
    }
  }
  return { ...sh, cells };
}

function nextSheetName(b: Workbook) {
  let i = b.sheets.length + 1;
  while (b.sheets.some((s) => s.name.toLowerCase() === `sheet${i}`)) i++;
  return `Sheet${i}`;
}

let ctx2d: CanvasRenderingContext2D | null = null;
export function measure(t: string, bold = false): number {
  if (typeof document === 'undefined') return t.length * 7;
  ctx2d ??= document.createElement('canvas').getContext('2d');
  if (!ctx2d) return t.length * 7;
  ctx2d.font = `${bold ? 'bold ' : ''}13px Calibri, Carlito, 'Segoe UI', sans-serif`;
  return ctx2d.measureText(t).width;
}

/** Uppercase function names & refs, auto-close parentheses, like Excel does on Enter. */
export function normalizeFormula(text: string): string {
  const body = text.slice(1);
  const toks = tokenize(body);
  let out = '';
  let depth = 0;
  let inQuote = false;
  for (const t of toks) {
    let s = body.slice(t.start, t.end);
    if (t.type === 'fn') s = s.toUpperCase();
    if (t.type === 'ref') {
      // uppercase the A1 part but keep sheet/book names as typed
      const bang = s.lastIndexOf('!');
      s = bang >= 0 ? s.slice(0, bang + 1) + s.slice(bang + 1).toUpperCase() : s.toUpperCase();
    }
    if (t.type === 'bool') s = s.toUpperCase();
    if (t.type === 'lp') depth++;
    if (t.type === 'rp') depth--;
    if (t.type === 'str' && !body.slice(t.start, t.end).endsWith('"')) inQuote = true;
    out += s;
  }
  if (inQuote) out += '"';
  while (depth-- > 0) out += ')';
  return '=' + out;
}

const DATE_FNS = new Set(['DATE', 'EOMONTH', 'EDATE', 'TODAY', 'WORKDAY', 'DATEVALUE']);

/** Pick a number format automatically from what was typed (like Excel does). */
export function autoFormat(text: string, prev?: CellStyle): CellStyle | undefined {
  if (prev?.fmt) return prev;
  const t = text.trim();
  let fmt: string | undefined;
  if (t.startsWith('=')) {
    const ast = cachedParse(t.slice(1));
    if (!(ast instanceof Error) && ast.t === 'fn' && DATE_FNS.has(ast.name)) fmt = FORMATS.shortDate;
  } else if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(t)) fmt = FORMATS.isoDate;
  else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(t)) fmt = FORMATS.shortDate;
  else if (/^\d{1,2}[- ][A-Za-z]{3,9}[- ]\d{2,4}$/.test(t)) fmt = FORMATS.dmy;
  else if (/^-?\d[\d,]*\.?\d*%$/.test(t)) fmt = t.includes('.') ? FORMATS.percent2 : FORMATS.percent;
  else if (/^-?\$[\d,]+(\.\d+)?$/.test(t)) fmt = t.includes('.') ? FORMATS.currency : '$#,##0';
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) fmt = t.includes('.') ? FORMATS.number : '#,##0';
  else if (/^\d{1,2}:\d{2}(:\d{2})?\s*(AM|PM)?$/i.test(t)) fmt = FORMATS.time;
  if (!fmt) return prev;
  return { ...(prev ?? {}), fmt };
}

function renameRefs(formula: string, oldName: string, newName: string, bookName: string, homeBook: string): string {
  return mapRefs(formula, (tok) => {
    const t = tok.text;
    const bang = t.lastIndexOf('!');
    if (bang < 0) return null;
    let pre = t.slice(0, bang);
    if (pre.startsWith("'")) pre = pre.slice(1, -1).replace(/''/g, "'");
    const m = /^\[([^\]]+)\](.*)$/.exec(pre);
    const book = m ? m[1] : homeBook;
    const sheet = m ? m[2] : pre;
    if (book.toLowerCase() !== bookName.toLowerCase() || sheet.toLowerCase() !== oldName.toLowerCase()) return null;
    const q = m ? qualify(newName, book) : qualify(newName);
    return q + t.slice(bang);
  });
}

/** For the formula bar's function tooltip: which function + argument is the caret in? */
export function fnContext(text: string, caret: number): { name: string; arg: number } | null {
  if (!text.startsWith('=')) return null;
  const body = text.slice(1, caret);
  const toks = tokenize(body);
  const stack: { name: string; arg: number }[] = [];
  let lastFn: string | null = null;
  for (const t of toks) {
    if (t.type === 'fn') lastFn = t.text;
    else if (t.type === 'lp') {
      stack.push({ name: lastFn ?? '', arg: 0 });
      lastFn = null;
    } else if (t.type === 'rp') stack.pop();
    else if (t.type === 'comma' && stack.length) stack[stack.length - 1].arg++;
    else if (t.type !== 'ws') lastFn = null;
  }
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i].name) return stack[i];
  return null;
}

/** Autocomplete: the partial function name being typed at the caret. */
export function partialFn(text: string, caret: number): { start: number; prefix: string } | null {
  if (!text.startsWith('=')) return null;
  const before = text.slice(0, caret);
  const m = /([A-Za-z][A-Za-z0-9.]*)$/.exec(before);
  if (!m) return null;
  const start = caret - m[1].length;
  const prev = before.slice(0, start).replace(/\s+$/, '');
  const last = prev[prev.length - 1];
  if (!last || !'=(,+-*/^&<>:;'.includes(last)) return null;
  if (/^[A-Za-z]{1,3}\d+$/.test(m[1])) return null; // looks like a cell ref
  return { start, prefix: m[1].toUpperCase() };
}

export function fnSuggestions(prefix: string): string[] {
  if (!prefix) return [];
  return Object.keys(FUNCS)
    .filter((k) => k.startsWith(prefix) && k !== 'TRUE' && k !== 'FALSE')
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
    .slice(0, 10);
}

export { formatValue, DEFAULT_COL_W };
