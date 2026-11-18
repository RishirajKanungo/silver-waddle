// The calculation engine. One `Calc` is created per workspace state (workbooks
// are immutable snapshots), it evaluates every formula once and caches results.
//
// Design notes (the "why"):
//  * Lazy + memoised: a cell is computed the first time something asks for it,
//    so dependency order sorts itself out without building a dependency graph.
//  * Cycle detection with a stack set -> circular refs show 0 + a status warning (like Excel).
//  * Dynamic arrays: a formula that returns an array "spills" into the cells
//    below/right. We do a discovery pass to learn spill areas, then a real pass
//    so cells that read spilled values always see them.

import { Node, ParseError, parseFormula, parseRefText } from './parser';
import { MAX_COLS, MAX_ROWS, RangeAddr, addrToA1, inRange } from './refs';
import { ERR, Scalar, Sheet, Value, Workbook, XLArray, XLError, cellKey, isArr, isErr, makeArray, parseKey } from './types';
import { S, compare, textToNumber, toNum, toStr } from './values';
import { FUNCS } from './functions';

export interface Scope {
  bi: number;
  si: number;
  r: number;
  c: number;
  vars?: Map<string, Value>;
}

export interface RefInfo {
  bi: number;
  si: number;
  range: RangeAddr;
}

const parseCache = new Map<string, Node | ParseError>();
export function cachedParse(formulaBody: string): Node | ParseError {
  let n = parseCache.get(formulaBody);
  if (!n) {
    try {
      n = parseFormula(formulaBody);
    } catch (e) {
      n = e instanceof ParseError ? e : new ParseError(String(e));
    }
    if (parseCache.size > 20000) parseCache.clear();
    parseCache.set(formulaBody, n);
  }
  return n;
}

/** Convert raw typed input into a literal value (no formulas). */
export function parseLiteral(input: string): Scalar {
  if (input === '') return null;
  if (input.startsWith("'")) return input.slice(1);
  const u = input.trim().toUpperCase();
  if (u === 'TRUE') return true;
  if (u === 'FALSE') return false;
  if (/^#(N\/A|VALUE!|REF!|DIV\/0!|NAME\?|NUM!|NULL!|SPILL!|CALC!)$/.test(u)) return new XLError(u as never);
  const n = textToNumber(input);
  if (n !== null) return n;
  return input;
}

export class Calc {
  cache = new Map<string, Scalar>();
  spillVals = new Map<string, Scalar>();
  spillAreas = new Map<string, RangeAddr>(); // anchor key -> area
  private knownAreas: { bi: number; si: number; area: RangeAddr; anchor: string }[] = [];
  private stack = new Set<string>();
  private bounds = new Map<string, { rows: number; cols: number }>();
  circular: string | null = null;

  constructor(public books: Workbook[]) {
    this.recalc();
  }

  private k(bi: number, si: number, r: number, c: number) {
    return `${bi}|${si}|${r},${c}`;
  }

  recalc() {
    this.passAll();
    if (this.spillAreas.size) {
      this.knownAreas = [...this.spillAreas.entries()].map(([key, area]) => {
        const [bi, si] = key.split('|').map(Number);
        return { bi, si, area, anchor: key };
      });
      this.cache.clear();
      this.spillVals.clear();
      this.spillAreas.clear();
      this.passAll();
    }
  }

  private passAll() {
    this.books.forEach((b, bi) =>
      b.sheets.forEach((sh, si) => {
        for (const key in sh.cells) {
          if (sh.cells[key].v.startsWith('=')) {
            const [r, c] = parseKey(key);
            this.value(bi, si, r, c);
          }
        }
      }),
    );
  }

  bookIndex(name: string | undefined, home: number): number {
    if (!name) return home;
    const n = name.toLowerCase();
    return this.books.findIndex((b) => b.name.toLowerCase() === n || b.name.toLowerCase().replace(/\.xlsx?$/, '') === n.replace(/\.xlsx?$/, ''));
  }

  sheetIndex(bi: number, name: string | undefined, home: number): number {
    if (!name) return home;
    const n = name.toLowerCase();
    return this.books[bi].sheets.findIndex((s) => s.name.toLowerCase() === n);
  }

  sheetAt(bi: number, si: number): Sheet {
    return this.books[bi].sheets[si];
  }

  /** Used extent of a sheet (for clamping whole-column refs like A:A). */
  usedBounds(bi: number, si: number) {
    const key = `${bi}|${si}`;
    let b = this.bounds.get(key);
    if (!b) {
      let rows = 0, cols = 0;
      for (const ck in this.sheetAt(bi, si).cells) {
        const [r, c] = parseKey(ck);
        if (r + 1 > rows) rows = r + 1;
        if (c + 1 > cols) cols = c + 1;
      }
      for (const a of this.knownAreas) {
        if (a.bi === bi && a.si === si) {
          rows = Math.max(rows, a.area.r2 + 1);
          cols = Math.max(cols, a.area.c2 + 1);
        }
      }
      b = { rows, cols };
      this.bounds.set(key, b);
    }
    return b;
  }

  /** Evaluated value of one cell. */
  value(bi: number, si: number, r: number, c: number): Scalar {
    const key = this.k(bi, si, r, c);
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const sheet = this.books[bi]?.sheets[si];
    if (!sheet) return ERR.REF;
    const cell = sheet.cells[cellKey(r, c)];
    if (!cell || cell.v === '') {
      if (this.spillVals.has(key)) return this.spillVals.get(key)!;
      for (const a of this.knownAreas) {
        if (a.bi === bi && a.si === si && inRange(a.area, r, c) && !this.cache.has(a.anchor)) {
          const [ar, ac] = a.anchor.split('|')[2].split(',').map(Number);
          this.value(bi, si, ar, ac);
          return this.spillVals.get(key) ?? null;
        }
      }
      return null;
    }
    if (!cell.v.startsWith('=') || cell.v.length === 1) {
      const lit = parseLiteral(cell.v);
      this.cache.set(key, lit);
      return lit;
    }
    if (this.stack.has(key)) {
      this.circular = this.circular ?? `${this.books[bi].sheets[si].name}!${addrToA1(r, c)}`;
      return 0;
    }
    this.stack.add(key);
    let out: Scalar;
    try {
      const res = this.evalFormula(cell.v, { bi, si, r, c });
      out = this.placeResult(res, bi, si, r, c, key);
    } catch (e) {
      out = e instanceof XLError ? e : ERR.VALUE;
    }
    this.stack.delete(key);
    this.cache.set(key, out);
    return out;
  }

  private placeResult(res: Value, bi: number, si: number, r: number, c: number, key: string): Scalar {
    if (!isArr(res)) return res === null ? 0 : res;
    if (res.rows === 1 && res.cols === 1) return res.data[0][0] ?? 0;
    if (res.rows === 0 || res.cols === 0) return ERR.CALC;
    // spill
    const area = { r1: r, c1: c, r2: r + res.rows - 1, c2: c + res.cols - 1 };
    if (area.r2 >= MAX_ROWS || area.c2 >= MAX_COLS) return ERR.SPILL;
    const sheet = this.sheetAt(bi, si);
    for (let i = 0; i < res.rows; i++)
      for (let j = 0; j < res.cols; j++) {
        if (i === 0 && j === 0) continue;
        const ck = cellKey(r + i, c + j);
        if (sheet.cells[ck] && sheet.cells[ck].v !== '') return ERR.SPILL;
        if (this.spillVals.has(this.k(bi, si, r + i, c + j))) return ERR.SPILL;
      }
    for (let i = 0; i < res.rows; i++)
      for (let j = 0; j < res.cols; j++) {
        if (i === 0 && j === 0) continue;
        const v = res.data[i][j];
        this.spillVals.set(this.k(bi, si, r + i, c + j), v === null ? 0 : v);
      }
    this.spillAreas.set(key, area);
    const v0 = res.data[0][0];
    return v0 === null ? 0 : v0;
  }

  /** Is (r,c) a ghost cell filled by someone else's spill? Returns anchor if so. */
  spillAnchorOf(bi: number, si: number, r: number, c: number): { r: number; c: number; area: RangeAddr } | null {
    for (const [key, area] of this.spillAreas) {
      const [b, s, rc] = key.split('|');
      if (+b === bi && +s === si && inRange(area, r, c)) {
        const [ar, ac] = rc.split(',').map(Number);
        return { r: ar, c: ac, area };
      }
    }
    return null;
  }

  /** Evaluate a formula string (with leading '=') in the context of a cell. */
  evalFormula(formula: string, scope: Scope): Value {
    const ast = cachedParse(formula.slice(1));
    if (ast instanceof ParseError) return ERR.NAME;
    const v = this.ev(ast, scope);
    return isArr(v) && v.rows === 1 && v.cols === 1 ? v.data[0][0] : v;
  }

  resolveRef(node: Extract<Node, { t: 'ref' }>, scope: Scope): RefInfo | XLError {
    const bi = this.bookIndex(node.book, scope.bi);
    if (bi < 0) return ERR.REF;
    // If a workbook is named without sheet, Excel needs a sheet; default to first.
    const si = node.sheet ? this.sheetIndex(bi, node.sheet, scope.si) : node.book ? 0 : scope.si;
    if (si < 0) return ERR.REF;
    let range = node.range;
    if (node.spill) {
      const anchorKey = this.k(bi, si, range.r1, range.c1);
      this.value(bi, si, range.r1, range.c1);
      const area = this.spillAreas.get(anchorKey);
      range = area ?? { r1: range.r1, c1: range.c1, r2: range.r1, c2: range.c1 };
    }
    return { bi, si, range };
  }

  /** Read a rectangular block as an array, clamping whole-column/row refs to the used area. */
  rangeArray(ref: RefInfo): XLArray {
    const { bi, si } = ref;
    let { r1, c1, r2, c2 } = ref.range;
    if (r2 === MAX_ROWS - 1 || c2 === MAX_COLS - 1) {
      const b = this.usedBounds(bi, si);
      if (r2 === MAX_ROWS - 1) r2 = Math.max(r1, b.rows - 1);
      if (c2 === MAX_COLS - 1) c2 = Math.max(c1, b.cols - 1);
    }
    const data: Scalar[][] = [];
    for (let r = r1; r <= r2; r++) {
      const row: Scalar[] = [];
      for (let c = c1; c <= c2; c++) row.push(this.value(bi, si, r, c));
      data.push(row);
    }
    return makeArray(data);
  }

  ev(n: Node, scope: Scope): Value {
    switch (n.t) {
      case 'num':
        return n.v;
      case 'str':
        return n.v;
      case 'bool':
        return n.v;
      case 'err':
        return new XLError(n.v as never);
      case 'empty':
        return null;
      case 'ref': {
        const ref = this.resolveRef(n, scope);
        if (isErr(ref)) return ref;
        return this.rangeArray(ref);
      }
      case 'name': {
        const v = scope.vars?.get(n.name.toUpperCase());
        if (v !== undefined) return v;
        // Allow bare sheet-less names that look like refs to fail as #NAME?
        return ERR.NAME;
      }
      case 'arr': {
        const data = n.rows.map((row) => row.map((x) => S(this.ev(x, scope))));
        const w = Math.max(...data.map((r) => r.length));
        if (data.some((r) => r.length !== w)) return ERR.VALUE;
        return makeArray(data);
      }
      case 'pct':
        return lift1(this.ev(n.a, scope), (x) => {
          const v = toNum(x);
          return isErr(v) ? v : v / 100;
        });
      case 'un': {
        const a = this.ev(n.a, scope);
        return lift1(a, (x) => {
          const v = toNum(x);
          return isErr(v) ? v : n.op === '-' ? -v : v;
        });
      }
      case 'bin': {
        const a = this.ev(n.a, scope);
        const b = this.ev(n.b, scope);
        return lift2(a, b, (x, y) => binop(n.op, x, y));
      }
      case 'fn': {
        const def = FUNCS[n.name] ?? FUNCS[n.name.replace(/^_XLFN\./, '')];
        if (!def) return ERR.NAME;
        if (n.args.length < def.min || n.args.length > def.max) return ERR.VALUE;
        const ctx: FnCtx = { calc: this, scope, ev: (x) => this.ev(x, scope), node: n };
        if (def.raw) return def.raw(n.args, ctx);
        const args = n.args.map((a) => this.ev(a, scope));
        if (def.lift) return liftCall(def.lift, args, (sc) => def.fn!(sc, ctx));
        return def.fn!(args, ctx);
      }
    }
  }

  /** Helpers used by raw functions. */
  refOf(node: Node, scope: Scope): RefInfo | null {
    if (node.t === 'ref') {
      const r = this.resolveRef(node, scope);
      return isErr(r) ? null : r;
    }
    if (node.t === 'fn' && (node.name === 'INDIRECT' || node.name === 'OFFSET')) {
      const def = FUNCS[node.name];
      const ctx: FnCtx = { calc: this, scope, ev: (x) => this.ev(x, scope), node };
      return def.refFn ? def.refFn(node.args, ctx) : null;
    }
    return null;
  }

  parseRefString(text: string, scope: Scope): RefInfo | null {
    const n = parseRefText(text.trim());
    if (!n || n.t !== 'ref') return null;
    const r = this.resolveRef(n, scope);
    return isErr(r) ? null : r;
  }
}

export interface FnCtx {
  calc: Calc;
  scope: Scope;
  ev: (n: Node) => Value;
  node: Extract<Node, { t: 'fn' }>;
}

export interface FnDef {
  min: number;
  max: number;
  fn?: (args: Value[], ctx: FnCtx) => Value;
  raw?: (args: Node[], ctx: FnCtx) => Value;
  refFn?: (args: Node[], ctx: FnCtx) => RefInfo | null;
  /** indices of scalar params that broadcast over arrays (dynamic-array lifting) */
  lift?: number[];
}

function lift1(a: Value, f: (x: Scalar) => Scalar): Value {
  if (!isArr(a)) return f(a);
  return makeArray(a.data.map((row) => row.map(f)));
}

export function lift2(a: Value, b: Value, f: (x: Scalar, y: Scalar) => Scalar): Value {
  if (!isArr(a) && !isArr(b)) return f(a, b);
  const A = isArr(a) ? a : makeArray([[a]]);
  const B = isArr(b) ? b : makeArray([[b]]);
  if (A.rows === 1 && A.cols === 1 && B.rows === 1 && B.cols === 1) return f(A.data[0][0], B.data[0][0]);
  const rows = Math.max(A.rows, B.rows), cols = Math.max(A.cols, B.cols);
  const pick = (X: XLArray, i: number, j: number): Scalar => {
    const ii = X.rows === 1 ? 0 : i, jj = X.cols === 1 ? 0 : j;
    if (ii >= X.rows || jj >= X.cols) return ERR.NA;
    return X.data[ii][jj];
  };
  const data: Scalar[][] = [];
  for (let i = 0; i < rows; i++) {
    const row: Scalar[] = [];
    for (let j = 0; j < cols; j++) row.push(f(pick(A, i, j), pick(B, i, j)));
    data.push(row);
  }
  return makeArray(data);
}

function liftCall(idx: number[], args: Value[], f: (a: Value[]) => Value): Value {
  let rows = 1, cols = 1, any = false;
  for (const i of idx) {
    const a = args[i];
    if (isArr(a) && (a.rows > 1 || a.cols > 1)) {
      any = true;
      rows = Math.max(rows, a.rows);
      cols = Math.max(cols, a.cols);
    }
  }
  const unwrap = args.map((a, i) => (idx.includes(i) && isArr(a) && a.rows === 1 && a.cols === 1 ? a.data[0][0] : a));
  if (!any) return f(unwrap);
  const data: Scalar[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: Scalar[] = [];
    for (let c = 0; c < cols; c++) {
      const sc = unwrap.map((a, i) => {
        if (!idx.includes(i) || !isArr(a)) return a;
        const rr = a.rows === 1 ? 0 : r, cc = a.cols === 1 ? 0 : c;
        return rr < a.rows && cc < a.cols ? a.data[rr][cc] : ERR.NA;
      });
      row.push(S(f(sc)));
    }
    data.push(row);
  }
  return makeArray(data);
}

function binop(op: string, x: Scalar, y: Scalar): Scalar {
  if (isErr(x)) return x;
  if (isErr(y)) return y;
  switch (op) {
    case '&': {
      const a = toStr(x), b = toStr(y);
      if (isErr(a)) return a;
      if (isErr(b)) return b;
      return a + b;
    }
    case '=': return compare(x, y) === 0;
    case '<>': return compare(x, y) !== 0;
    case '<': return compare(x, y) < 0;
    case '>': return compare(x, y) > 0;
    case '<=': return compare(x, y) <= 0;
    case '>=': return compare(x, y) >= 0;
  }
  const a = toNum(x), b = toNum(y);
  if (isErr(a)) return a;
  if (isErr(b)) return b;
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return b === 0 ? ERR.DIV0 : a / b;
    case '^': {
      const r = Math.pow(a, b);
      return isFinite(r) && !isNaN(r) ? r : ERR.NUM;
    }
  }
  return ERR.VALUE;
}
