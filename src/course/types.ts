// Course content schema. Lessons are plain data + small check functions so the
// same definition drives the UI, the hints, the "Show me" button and the
// automated test that proves every lesson is solvable.

import type { Workbook, Scalar, CellStyle, Sheet } from '../engine/types';
import type { AppStore } from '../app/store';
import type { SortKey } from '../app/sheetOps';

export interface CheckCtx {
  /** Evaluated value. Ref may be 'B2', 'Summary!B2' or '[Other.xlsx]Data!B2'. */
  v(ref: string): Scalar;
  /** Raw input as typed ('' if empty). */
  f(ref: string): string;
  /** Style of a cell (or {}). */
  style(ref: string): CellStyle;
  /** 2D values of a range. */
  range(ref: string): Scalar[][];
  /** Evaluated values of a single column/row range, flattened. */
  list(ref: string): Scalar[];
  /** Raw inputs of a range, flattened. */
  inputs(ref: string): string[];
  /** Was this command used (any way) since the task started? e.g. 'fill.down' */
  used(cmdId: string): boolean;
  /** Was this command used *via keyboard* since the task started? */
  usedKey(cmdId: string): boolean;
  /** Current selection info. */
  sel: { book: string; sheet: string; active: string; range: string; r1: number; c1: number; r2: number; c2: number };
  /** Sheet object by name in a book (default: active book). */
  sheet(name?: string, book?: string): Sheet | undefined;
  /** Names of sheets in a book. */
  sheetNames(book?: string): string[];
  /** Full access when needed. */
  store: AppStore;
}

/** A check returns true when done, or a short message explaining what's still off. */
export type Check = (c: CheckCtx) => true | string;

export type SolutionStep =
  | { set: Record<string, string> } // e.g. { 'D2': '=VLOOKUP(...)' } — a range key fills with relative shifting
  | { select: string } // 'A1', 'A1:D20', 'Sheet2!B3', '[Book.xlsx]Data!A1'
  | { cmd: string } // run a command by id (as if via keyboard)
  | { sort: SortKey[]; range?: string; header?: boolean }
  | { pivot: { rows: string[]; cols?: string; values: { field: string; agg: 'sum' | 'count' | 'average' | 'min' | 'max' }[]; sheetName?: string } }
  | { filter: { col: string; allowed: string[] } }
  | { cf: { type: 'gt' | 'lt' | 'eq' | 'between' | 'contains' | 'duplicate' | 'blank'; a?: string; b?: string; fill: string } }
  | { removeDup: { cols: string[] } } // column letters
  | { textToCols: string } // delimiter
  | { gotoSpecial: 'blanks' | 'constants' | 'formulas' | 'errors' }
  | { fillMulti: string }
  | { freeze: 'panes' | 'row' | 'col' | 'none' }
  | { addSheet: string }
  | { rename: string }
  | { book: string } // activate a workbook by name
  | { sheetTab: string } // activate a sheet by name
  | { custom: (s: AppStore) => void };

export interface Task {
  id: string;
  /** Short imperative title shown in the step list. */
  title: string;
  /** What to do. Supports **bold**, `code`, [[Ctrl+D]] key caps, and new lines. */
  instruction: string;
  /** The reasoning — why we do it this way / when you'd use it on the job. */
  why?: string;
  hints: string[];
  check: Check;
  solution: SolutionStep[];
  /** Plain-language explanation of the solution (shown with "Show me"). */
  explain?: string;
  xp?: number;
  /** Optional: commands that must be triggered from the keyboard to pass. */
  mustUseKeys?: string[];
}

export interface Lesson {
  id: string;
  title: string;
  /** One-line summary for the course map. */
  summary: string;
  minutes: number;
  /** Concept explainer shown before the tasks (same mini-markup as instructions). */
  intro: string;
  /** Shortcut / function names featured, used for the cheat sheet + reference. */
  featured?: string[];
  workbooks: () => Workbook[];
  start?: { book?: string; sheet?: string; cell?: string };
  readOnly?: string[]; // workbook names learners shouldn't edit (e.g. source files)
  tasks: Task[];
  kind?: 'lesson' | 'project';
}

export interface Module {
  id: string;
  title: string;
  level: 'Zero' | 'Foundation' | 'Analyst' | 'Advanced' | 'Hero';
  icon: string; // emoji
  blurb: string;
  lessons: Lesson[];
  quiz: QuizQuestion[];
}

export type QuizQuestion =
  | { kind: 'mc'; q: string; options: string[]; answer: number; explain: string }
  | {
      kind: 'formula';
      q: string;
      /** small table shown with the question; first row = headers. Rows start at A1. */
      grid: (string | number)[][];
      /** cell the learner's formula is "entered" into (for relative refs), e.g. 'E2' */
      at: string;
      /** expected evaluated result */
      expect: string | number | boolean;
      /** a model answer to show afterwards */
      model: string;
      explain: string;
      /** optional: the learner's formula must use one of these functions */
      mustUse?: string[];
    }
  | { kind: 'keys'; q: string; cmd: string; keys: string; explain: string };

export interface Drill {
  id: string;
  cmd: string; // command id expected
  prompt: string; // "Select from here to the bottom of the data"
  keys: string; // display, e.g. 'Ctrl+Shift+↓'
  tier: 1 | 2 | 3;
  /** where to put the cursor before the drill ('B3' etc.) */
  at?: string;
  /** For Alt sequences we expect the keytip path command id. */
}
