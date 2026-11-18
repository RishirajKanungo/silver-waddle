// Pure helpers that read or transform workbooks. They never mutate: every edit
// returns new objects so undo can just keep the old snapshot around.

import { Calc, parseLiteral } from '../engine/calc';
import { adjustForInsert, shiftFormula } from '../engine/parser';
import { RangeAddr, addrToA1, norm, parseRange, splitQualified } from '../engine/refs';
import { Cell, CellStyle, Scalar, Sheet, Workbook, cellKey, isErr, parseKey } from '../engine/types';
import { compare } from '../engine/values';
import { formatValue, isDateFmt } from '../engine/format';

export const GRID_ROWS = 100000;
export const GRID_COLS = 16384;
export const DEFAULT_COL_W = 64;
export const ROW_H = 20;

export const getCell = (sh: Sheet, r: number, c: number): Cell | undefined => sh.cells[cellKey(r, c)];
export const hasInput = (sh: Sheet, r: number, c: number) => {
  const x = sh.cells[cellKey(r, c)];
  return !!x && x.v !== '';
};

export function usedRange(sh: Sheet): RangeAddr | null {
  let r2 = -1, c2 = -1, r1 = Infinity, c1 = Infinity;
  for (const k in sh.cells) {
    if (sh.cells[k].v === '') continue;
    const [r, c] = parseKey(k);
    if (r > r2) r2 = r;
    if (c > c2) c2 = c;
    if (r < r1) r1 = r;
    if (c < c1) c1 = c;
  }
  return r2 < 0 ? null : { r1, c1, r2, c2 };
}

/** Is the cell non-empty, counting spilled values too (what Ctrl+Arrow sees). */
export function occupied(calc: Calc, bi: number, si: number, sh: Sheet, r: number, c: number) {
  if (hasInput(sh, r, c)) return true;
  const v = calc.value(bi, si, r, c);
  return v !== null;
}

/** Excel's Ctrl+Arrow: jump to the edge of the current data block. */
export function edgeJump(
  calc: Calc, bi: number, si: number, sh: Sheet, r: number, c: number, dr: number, dc: number,
): [number, number] {
  const maxR = GRID_ROWS - 1, maxC = GRID_COLS - 1;
  const inb = (rr: number, cc: number) => rr >= 0 && cc >= 0 && rr <= maxR && cc <= maxC;
  const occ = (rr: number, cc: number) => occupied(calc, bi, si, sh, rr, cc);
  let nr = r + dr, nc = c + dc;
  if (!inb(nr, nc)) return [r, c];
  const used = usedRange(sh);
  const limitR = used ? used.r2 + 1 : 0, limitC = used ? used.c2 + 1 : 0;
  if (occ(r, c) && occ(nr, nc)) {
    // run to the last occupied cell
    while (inb(nr + dr, nc + dc) && occ(nr + dr, nc + dc)) {
      nr += dr;
      nc += dc;
    }
    return [nr, nc];
  }
  // otherwise skip blanks to the next occupied cell (or the sheet edge)
  while (inb(nr, nc) && !occ(nr, nc)) {
    if ((dr > 0 && nr > limitR) || (dc > 0 && nc > limitC)) return [dr > 0 ? maxR : nr, dc > 0 ? maxC : nc];
    nr += dr;
    nc += dc;
  }
  if (!inb(nr, nc)) return [Math.max(0, Math.min(maxR, nr - dr)), Math.max(0, Math.min(maxC, nc - dc))];
  return [nr, nc];
}

/** Ctrl+A / Ctrl+* : the contiguous block around a cell. */
export function currentRegion(calc: Calc, bi: number, si: number, sh: Sheet, r: number, c: number): RangeAddr {
  const occ = (rr: number, cc: number) => rr >= 0 && cc >= 0 && occupied(calc, bi, si, sh, rr, cc);
  let g = { r1: r, c1: c, r2: r, c2: c };
  let grew = true;
  let guard = 0;
  while (grew && guard++ < 500) {
    grew = false;
    // expand any side that has an occupied neighbour (including diagonals)
    for (let cc = g.c1 - 1; cc <= g.c2 + 1; cc++) {
      if (occ(g.r1 - 1, cc)) { g = { ...g, r1: g.r1 - 1 }; grew = true; break; }
    }
    for (let cc = g.c1 - 1; cc <= g.c2 + 1; cc++) {
      if (occ(g.r2 + 1, cc)) { g = { ...g, r2: g.r2 + 1 }; grew = true; break; }
    }
    for (let rr = g.r1 - 1; rr <= g.r2 + 1; rr++) {
      if (occ(rr, g.c1 - 1)) { g = { ...g, c1: g.c1 - 1 }; grew = true; break; }
    }
    for (let rr = g.r1 - 1; rr <= g.r2 + 1; rr++) {
      if (occ(rr, g.c2 + 1)) { g = { ...g, c2: g.c2 + 1 }; grew = true; break; }
    }
  }
  return g;
}

// ---------- mutations (return new sheet) ----------

export function withCells(sh: Sheet, edits: { r: number; c: number; v?: string; s?: CellStyle | null }[]): Sheet {
  const cells = { ...sh.cells };
  for (const e of edits) {
    const k = cellKey(e.r, e.c);
    const prev = cells[k];
    const v = e.v !== undefined ? e.v : prev?.v ?? '';
    const s = e.s === null ? undefined : e.s !== undefined ? e.s : prev?.s;
    if (v === '' && (!s || Object.keys(s).length === 0)) delete cells[k];
    else cells[k] = s ? { v, s } : { v };
  }
  return { ...sh, cells };
}

export function styleRange(sh: Sheet, g: RangeAddr, patch: (s: CellStyle) => CellStyle): Sheet {
  const edits: { r: number; c: number; s: CellStyle }[] = [];
  const u = usedRange(sh);
  // clamp whole-column/whole-row selections to the used area (+ a margin) for speed
  const r2 = Math.min(g.r2, Math.max(u ? u.r2 + 50 : 50, g.r1 + 0));
  const c2 = Math.min(g.c2, Math.max(u ? u.c2 + 10 : 10, g.c1));
  for (let r = g.r1; r <= r2; r++)
    for (let c = g.c1; c <= c2; c++) {
      const prev = getCell(sh, r, c)?.s ?? {};
      edits.push({ r, c, s: clean(patch({ ...prev })) });
    }
  return withCells(sh, edits);
}

function clean(s: CellStyle): CellStyle {
  const o: CellStyle = {};
  for (const [k, v] of Object.entries(s)) if (v !== undefined && v !== false && v !== '') (o as Record<string, unknown>)[k] = v;
  if (o.border && !o.border.t && !o.border.b && !o.border.l && !o.border.r) delete o.border;
  return o;
}

export function clearContents(sh: Sheet, g: RangeAddr): Sheet {
  const cells = { ...sh.cells };
  for (const k in cells) {
    const [r, c] = parseKey(k);
    if (r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2) {
      if (cells[k].s) cells[k] = { v: '', s: cells[k].s };
      else delete cells[k];
    }
  }
  return { ...sh, cells };
}

/** Insert (count>0) or delete (count<0) rows/cols, fixing formulas everywhere. */
export function insertDelete(books: Workbook[], bi: number, si: number, axis: 'row' | 'col', at: number, count: number): Workbook[] {
  const target = books[bi].sheets[si];
  return books.map((b, bj) => ({
    ...b,
    sheets: b.sheets.map((sh, sj) => {
      const fix = (v: string) =>
        v.startsWith('=') ? adjustForInsert(v, axis, at, count, target.name, sh.name, books[bi].name, b.name) : v;
      const cells: Sheet['cells'] = {};
      const isTarget = bj === bi && sj === si;
      for (const k in sh.cells) {
        let [r, c] = parseKey(k);
        const cell = sh.cells[k];
        if (isTarget) {
          const pos = axis === 'row' ? r : c;
          if (count < 0 && pos >= at && pos < at - count) continue; // deleted
          if (pos >= at) {
            if (axis === 'row') r += count;
            else c += count;
          }
        }
        cells[cellKey(r, c)] = { ...cell, v: fix(cell.v) };
      }
      let { colWidths, hiddenRows } = sh;
      if (isTarget && axis === 'col') {
        colWidths = {};
        for (const [k, w] of Object.entries(sh.colWidths)) {
          const c = +k;
          if (count < 0 && c >= at && c < at - count) continue;
          colWidths[c >= at ? c + count : c] = w;
        }
      }
      if (isTarget && axis === 'row' && hiddenRows) {
        const hr: Record<number, boolean> = {};
        for (const k of Object.keys(hiddenRows)) {
          const r = +k;
          if (count < 0 && r >= at && r < at - count) continue;
          hr[r >= at ? r + count : r] = true;
        }
        hiddenRows = hr;
      }
      return { ...sh, cells, colWidths, hiddenRows };
    }),
  }));
}

/** Copy a block of cells to a destination, shifting relative refs like Excel. */
export function pasteBlock(
  src: Sheet, g: RangeAddr, dst: Sheet, r0: number, c0: number,
  mode: 'all' | 'values' | 'formulas' | 'formats' = 'all',
  calc?: { value: (r: number, c: number) => Scalar }, transpose = false, isCut = false,
): Sheet {
  const edits: { r: number; c: number; v?: string; s?: CellStyle | null }[] = [];
  for (let r = g.r1; r <= g.r2; r++)
    for (let c = g.c1; c <= g.c2; c++) {
      const dr = transpose ? c - g.c1 : r - g.r1;
      const dc = transpose ? r - g.r1 : c - g.c1;
      const tr = r0 + dr, tc = c0 + dc;
      const cell = getCell(src, r, c);
      let v = cell?.v ?? '';
      if (mode === 'values') {
        const val = calc ? calc.value(r, c) : parseLiteral(v);
        v = scalarToInput(val);
      } else if (v.startsWith('=') && !isCut) v = shiftFormula(v, tr - r, tc - c); // a cut formula moves unchanged
      if (mode === 'formats') edits.push({ r: tr, c: tc, s: cell?.s ?? null });
      else if (mode === 'values') edits.push({ r: tr, c: tc, v, s: cell?.s?.fmt ? { ...(getCell(dst, tr, tc)?.s ?? {}), fmt: cell.s.fmt } : undefined });
      else edits.push({ r: tr, c: tc, v, s: mode === 'all' ? cell?.s ?? null : undefined });
    }
  return withCells(dst, edits);
}

export function scalarToInput(v: Scalar): string {
  if (v === null) return '';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (isErr(v)) return v.code;
  // keep text that would otherwise be read as a number as text
  if (parseLiteral(v) !== v || v.startsWith('=')) return "'" + v;
  return v;
}

/** Fill a range from its first row (down) / column (right), shifting formulas. */
export function fillRange(sh: Sheet, g: RangeAddr, dir: 'down' | 'right'): Sheet {
  const edits: { r: number; c: number; v: string; s?: CellStyle | null }[] = [];
  if (dir === 'down') {
    for (let c = g.c1; c <= g.c2; c++) {
      const src = getCell(sh, g.r1, c);
      for (let r = g.r1 + 1; r <= g.r2; r++) {
        const v = src?.v ?? '';
        edits.push({ r, c, v: v.startsWith('=') ? shiftFormula(v, r - g.r1, 0) : v, s: src?.s ?? null });
      }
    }
  } else {
    for (let r = g.r1; r <= g.r2; r++) {
      const src = getCell(sh, r, g.c1);
      for (let c = g.c1 + 1; c <= g.c2; c++) {
        const v = src?.v ?? '';
        edits.push({ r, c, v: v.startsWith('=') ? shiftFormula(v, 0, c - g.c1) : v, s: src?.s ?? null });
      }
    }
  }
  return withCells(sh, edits);
}

/** Fill-handle drag: extend a series (1,2 -> 3,4 ; dates ; Item1 -> Item2) or copy. */
export function fillSeries(sh: Sheet, src: RangeAddr, dst: RangeAddr): Sheet {
  const down = dst.r2 > src.r2 || dst.r1 < src.r1;
  const edits: { r: number; c: number; v: string; s?: CellStyle | null }[] = [];
  if (down) {
    for (let c = src.c1; c <= src.c2; c++) {
      const seeds: Cell[] = [];
      for (let r = src.r1; r <= src.r2; r++) seeds.push(getCell(sh, r, c) ?? { v: '' });
      const forward = dst.r2 > src.r2;
      const len = forward ? dst.r2 - src.r2 : src.r1 - dst.r1;
      const vals = extendSeries(seeds, len, forward);
      vals.forEach((v, i) => {
        const r = forward ? src.r2 + 1 + i : src.r1 - 1 - i;
        const seed = seeds[i % seeds.length];
        const fv = v.startsWith('=') ? shiftFormula(v, r - (forward ? src.r1 + (i % seeds.length) : src.r2 - (i % seeds.length)), 0) : v;
        edits.push({ r, c, v: fv, s: seed.s ?? null });
      });
    }
  } else {
    for (let r = src.r1; r <= src.r2; r++) {
      const seeds: Cell[] = [];
      for (let c = src.c1; c <= src.c2; c++) seeds.push(getCell(sh, r, c) ?? { v: '' });
      const forward = dst.c2 > src.c2;
      const len = forward ? dst.c2 - src.c2 : src.c1 - dst.c1;
      const vals = extendSeries(seeds, len, forward);
      vals.forEach((v, i) => {
        const c = forward ? src.c2 + 1 + i : src.c1 - 1 - i;
        const seed = seeds[i % seeds.length];
        const fv = v.startsWith('=') ? shiftFormula(v, 0, c - (forward ? src.c1 + (i % seeds.length) : src.c2 - (i % seeds.length))) : v;
        edits.push({ r, c, v: fv, s: seed.s ?? null });
      });
    }
  }
  return withCells(sh, edits);
}

function extendSeries(seeds: Cell[], len: number, forward: boolean): string[] {
  const raw = seeds.map((s) => s.v);
  const nums = raw.map((v) => (v.startsWith('=') ? null : parseLiteral(v)));
  const allNum = nums.every((n) => typeof n === 'number');
  const out: string[] = [];
  if (allNum && raw.length >= 1) {
    const ns = nums as number[];
    const isDate = isDateFmt(seeds[0].s?.fmt) || /\d{1,4}[-/]\d/.test(raw[0]);
    const step = ns.length > 1 ? ns[ns.length - 1] - ns[ns.length - 2] : isDate ? 1 : 0;
    // single plain number => copy (Excel default); dates => +1 day
    for (let i = 1; i <= len; i++) {
      const base = forward ? ns[ns.length - 1] : ns[0];
      const v = base + (forward ? step * i : -step * i);
      out.push(ns.length === 1 && !isDate ? raw[0] : String(Math.round(v * 1e10) / 1e10));
    }
    return out;
  }
  // text ending in a number: Item1 -> Item2
  const m = raw.length === 1 ? /^(.*?)(\d+)$/.exec(raw[0]) : null;
  if (m && !raw[0].startsWith('=')) {
    for (let i = 1; i <= len; i++) out.push(m[1] + String(Number(m[2]) + (forward ? i : -i)).padStart(m[2].length, '0'));
    return out;
  }
  // month / weekday names
  const lists = [
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    ['Q1', 'Q2', 'Q3', 'Q4'],
  ];
  for (const L of lists) {
    const idx = L.findIndex((x) => x.toLowerCase() === raw[raw.length - 1].toLowerCase());
    if (idx >= 0 && raw.length === 1) {
      for (let i = 1; i <= len; i++) out.push(L[(((idx + (forward ? i : -i)) % L.length) + L.length) % L.length]);
      return out;
    }
  }
  for (let i = 0; i < len; i++) out.push(forward ? raw[i % raw.length] : raw[(raw.length - 1 - (i % raw.length) + raw.length) % raw.length]);
  return out;
}

// ---------- data tools ----------

export interface SortKey {
  col: number; // absolute column index
  desc?: boolean;
}

export function sortRange(calc: Calc, bi: number, si: number, sh: Sheet, g: RangeAddr, keys: SortKey[], hasHeader: boolean): Sheet {
  const start = hasHeader ? g.r1 + 1 : g.r1;
  const rows: { cells: (Cell | undefined)[]; keyVals: Scalar[]; orig: number }[] = [];
  for (let r = start; r <= g.r2; r++) {
    const cells: (Cell | undefined)[] = [];
    for (let c = g.c1; c <= g.c2; c++) cells.push(getCell(sh, r, c));
    rows.push({ cells, keyVals: keys.map((k) => calc.value(bi, si, r, k.col)), orig: r });
  }
  rows.sort((a, b) => {
    for (let i = 0; i < keys.length; i++) {
      const x = a.keyVals[i], y = b.keyVals[i];
      // blanks always last
      if (x === null && y !== null) return 1;
      if (y === null && x !== null) return -1;
      const c = compare(x, y);
      if (c) return keys[i].desc ? -c : c;
    }
    return a.orig - b.orig;
  });
  const edits: { r: number; c: number; v: string; s: CellStyle | null }[] = [];
  rows.forEach((row, i) => {
    const r = start + i;
    row.cells.forEach((cell, j) => {
      const v = cell?.v ?? '';
      edits.push({ r, c: g.c1 + j, v: v.startsWith('=') ? shiftFormula(v, r - row.orig, 0) : v, s: cell?.s ?? null });
    });
  });
  return withCells(sh, edits);
}

export function removeDuplicates(calc: Calc, bi: number, si: number, sh: Sheet, g: RangeAddr, cols: number[], hasHeader: boolean): { sheet: Sheet; removed: number; kept: number } {
  const start = hasHeader ? g.r1 + 1 : g.r1;
  const seen = new Set<string>();
  const keep: (Cell | undefined)[][] = [];
  let removed = 0;
  for (let r = start; r <= g.r2; r++) {
    const key = cols.map((c) => {
      const v = calc.value(bi, si, r, c);
      return typeof v === 'string' ? v.toLowerCase() : String(v);
    }).join('\u0001');
    if (seen.has(key)) {
      removed++;
      continue;
    }
    seen.add(key);
    const row: (Cell | undefined)[] = [];
    for (let c = g.c1; c <= g.c2; c++) row.push(getCell(sh, r, c));
    keep.push(row);
  }
  const edits: { r: number; c: number; v: string; s: CellStyle | null }[] = [];
  for (let i = 0; i <= g.r2 - start; i++) {
    for (let j = 0; j <= g.c2 - g.c1; j++) {
      const cell = keep[i]?.[j];
      edits.push({ r: start + i, c: g.c1 + j, v: cell?.v ?? '', s: i < keep.length ? cell?.s ?? null : null });
    }
  }
  return { sheet: withCells(sh, edits), removed, kept: keep.length };
}

export function textToColumns(calc: Calc, bi: number, si: number, sh: Sheet, g: RangeAddr, delim: string): Sheet {
  const edits: { r: number; c: number; v: string }[] = [];
  for (let r = g.r1; r <= g.r2; r++) {
    const v = calc.value(bi, si, r, g.c1);
    if (v === null) continue;
    const parts = String(v).split(delim);
    parts.forEach((p, j) => edits.push({ r, c: g.c1 + j, v: p.trim() }));
  }
  return withCells(sh, edits);
}

export interface PivotSpec {
  source: { bi: number; si: number; range: RangeAddr };
  rows: number[]; // absolute col indices
  cols?: number; // optional column field
  values: { col: number; agg: 'sum' | 'count' | 'average' | 'min' | 'max' }[];
  sheetName?: string;
}

/** Build a static pivot table (values only, like "Paste values" of a PivotTable). */
export function buildPivot(calc: Calc, spec: PivotSpec): string[][] {
  const { bi, si, range: g } = spec.source;
  const header = (c: number) => String(calc.value(bi, si, g.r1, c) ?? `Column${c + 1}`);
  type Acc = { sum: number; count: number; min: number; max: number; n: number };
  const groups = new Map<string, Map<string, Acc[]>>();
  const rowKeys: string[] = [];
  const colKeys: string[] = [];
  const disp = (v: Scalar) => (v === null ? '(blank)' : typeof v === 'number' ? String(v) : String(v));
  for (let r = g.r1 + 1; r <= g.r2; r++) {
    const rk = spec.rows.map((c) => disp(calc.value(bi, si, r, c))).join(' | ');
    const ck = spec.cols !== undefined ? disp(calc.value(bi, si, r, spec.cols)) : '';
    if (!groups.has(rk)) {
      groups.set(rk, new Map());
      rowKeys.push(rk);
    }
    if (!colKeys.includes(ck)) colKeys.push(ck);
    const gm = groups.get(rk)!;
    if (!gm.has(ck)) gm.set(ck, spec.values.map(() => ({ sum: 0, count: 0, min: Infinity, max: -Infinity, n: 0 })));
    const accs = gm.get(ck)!;
    spec.values.forEach((vs, i) => {
      const v = calc.value(bi, si, r, vs.col);
      const a = accs[i];
      if (v !== null) a.count++;
      if (typeof v === 'number') {
        a.sum += v;
        a.n++;
        a.min = Math.min(a.min, v);
        a.max = Math.max(a.max, v);
      }
    });
  }
  const sortKeys = (ks: string[]) =>
    [...ks].sort((a, b) => {
      const na = Number(a), nb = Number(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
  const rks = sortKeys(rowKeys);
  const cks = spec.cols !== undefined ? sortKeys(colKeys) : [''];
  const fin = (a: Acc | undefined, agg: string): string => {
    if (!a) return '';
    switch (agg) {
      case 'sum': return String(round(a.sum));
      case 'count': return String(a.count);
      case 'average': return a.n ? String(round(a.sum / a.n)) : '#DIV/0!';
      case 'min': return a.n ? String(a.min) : '0';
      case 'max': return a.n ? String(a.max) : '0';
    }
    return '';
  };
  const merge = (list: (Acc | undefined)[]): Acc => {
    const o = { sum: 0, count: 0, min: Infinity, max: -Infinity, n: 0 };
    for (const a of list) if (a) { o.sum += a.sum; o.count += a.count; o.n += a.n; o.min = Math.min(o.min, a.min); o.max = Math.max(o.max, a.max); }
    return o;
  };
  const aggLabel = (v: { col: number; agg: string }) => `${{ sum: 'Sum', count: 'Count', average: 'Average', min: 'Min', max: 'Max' }[v.agg]} of ${header(v.col)}`;
  const out: string[][] = [];
  const rowHeader = spec.rows.map(header).join(' | ') || 'Row Labels';
  if (spec.cols === undefined) {
    out.push([rowHeader, ...spec.values.map(aggLabel)]);
    for (const rk of rks) out.push([rk, ...spec.values.map((v, i) => fin(groups.get(rk)!.get('')?.[i], v.agg))]);
    out.push(['Grand Total', ...spec.values.map((v, i) => fin(merge(rks.map((rk) => groups.get(rk)!.get('')?.[i])), v.agg))]);
  } else {
    const v0 = spec.values[0];
    out.push([`${aggLabel(v0)}`, header(spec.cols)]);
    out.push([rowHeader, ...cks, 'Grand Total']);
    for (const rk of rks) {
      const gm = groups.get(rk)!;
      out.push([rk, ...cks.map((ck) => fin(gm.get(ck)?.[0], v0.agg)), fin(merge(cks.map((ck) => gm.get(ck)?.[0])), v0.agg)]);
    }
    out.push([
      'Grand Total',
      ...cks.map((ck) => fin(merge(rks.map((rk) => groups.get(rk)!.get(ck)?.[0])), v0.agg)),
      fin(merge(rks.flatMap((rk) => cks.map((ck) => groups.get(rk)!.get(ck)?.[0]))), v0.agg),
    ]);
  }
  return out;
}

function round(x: number) {
  return Math.round(x * 1e8) / 1e8;
}

/** Display text of a value with its cell format (used by filters, find, etc.). */
export function displayText(calc: Calc, bi: number, si: number, sh: Sheet, r: number, c: number): string {
  const v = calc.value(bi, si, r, c);
  return formatValue(v, getCell(sh, r, c)?.s?.fmt);
}

/** Recompute hidden rows from the sheet's filter state. */
export function applyFilter(calc: Calc, bi: number, si: number, sh: Sheet): Sheet {
  if (!sh.filter) return { ...sh, hiddenRows: {} };
  const g = parseRange(sh.filter.range)!;
  const hidden: Record<number, boolean> = {};
  for (let r = g.r1 + 1; r <= g.r2; r++) {
    for (const [cs, allowed] of Object.entries(sh.filter.allowed)) {
      if (!allowed) continue;
      const t = displayText(calc, bi, si, sh, r, +cs);
      if (!allowed.includes(t)) {
        hidden[r] = true;
        break;
      }
    }
  }
  return { ...sh, hiddenRows: hidden };
}

export function rangeLabel(g: RangeAddr) {
  const a = addrToA1(g.r1, g.c1), b = addrToA1(g.r2, g.c2);
  return a === b ? a : `${a}:${b}`;
}

/** Resolve "Sheet2!B4" / "[Book.xlsx]Sheet!A1:C3" / "B4" against a workspace. */
export function resolveTarget(books: Workbook[], text: string, homeBook: number, homeSheet: number): { bi: number; si: number; range: RangeAddr } | null {
  const q = splitQualified(text);
  const range = parseRange(q.ref);
  if (!range) return null;
  const bi = q.book ? books.findIndex((b) => b.name.toLowerCase() === q.book!.toLowerCase()) : homeBook;
  if (bi < 0) return null;
  const si = q.sheet ? books[bi].sheets.findIndex((s) => s.name.toLowerCase() === q.sheet!.toLowerCase()) : q.book ? 0 : homeSheet;
  if (si < 0) return null;
  return { bi, si, range: norm(range) };
}
