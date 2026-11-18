// A1-reference helpers. Everything internally is 0-based (row 0 = Excel row 1).

export const MAX_ROWS = 1048576;
export const MAX_COLS = 16384;

export function colToLetters(c: number): string {
  let s = '';
  c += 1;
  while (c > 0) {
    const m = (c - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
}

export function lettersToCol(s: string): number {
  let n = 0;
  for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export interface CellAddr {
  row: number;
  col: number;
  absRow?: boolean;
  absCol?: boolean;
}

export interface RangeAddr {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export const addrToA1 = (r: number, c: number) => `${colToLetters(c)}${r + 1}`;

export function rangeToA1(g: RangeAddr): string {
  const a = addrToA1(g.r1, g.c1);
  const b = addrToA1(g.r2, g.c2);
  return a === b ? a : `${a}:${b}`;
}

const CELL_RE = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/;

export function parseA1(s: string): CellAddr | null {
  const m = CELL_RE.exec(s.trim());
  if (!m) return null;
  const t = s.trim();
  const col = lettersToCol(m[1]);
  const row = Number(m[2]) - 1;
  if (row < 0 || col < 0 || col >= MAX_COLS || row >= MAX_ROWS) return null;
  return { row, col, absCol: t.startsWith('$'), absRow: /\$\d/.test(t) };
}

/** Parse 'A1', 'A1:B5', 'A:C', '3:7' (no sheet prefix). */
export function parseRange(s: string): RangeAddr | null {
  const t = s.replace(/\$/g, '').trim().toUpperCase();
  const parts = t.split(':');
  if (parts.length === 1) {
    const a = parseA1(parts[0]);
    return a ? { r1: a.row, c1: a.col, r2: a.row, c2: a.col } : null;
  }
  if (parts.length !== 2) return null;
  const [p, q] = parts;
  if (/^[A-Z]{1,3}$/.test(p) && /^[A-Z]{1,3}$/.test(q)) {
    const c1 = lettersToCol(p), c2 = lettersToCol(q);
    return { r1: 0, c1: Math.min(c1, c2), r2: MAX_ROWS - 1, c2: Math.max(c1, c2) };
  }
  if (/^\d+$/.test(p) && /^\d+$/.test(q)) {
    const r1 = Number(p) - 1, r2 = Number(q) - 1;
    return { r1: Math.min(r1, r2), c1: 0, r2: Math.max(r1, r2), c2: MAX_COLS - 1 };
  }
  const a = parseA1(p), b = parseA1(q);
  if (!a || !b) return null;
  return norm({ r1: a.row, c1: a.col, r2: b.row, c2: b.col });
}

export function norm(g: RangeAddr): RangeAddr {
  return {
    r1: Math.min(g.r1, g.r2),
    c1: Math.min(g.c1, g.c2),
    r2: Math.max(g.r1, g.r2),
    c2: Math.max(g.c1, g.c2),
  };
}

export const inRange = (g: RangeAddr, r: number, c: number) => r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2;

/**
 * Split an optional sheet/workbook prefix off a reference string.
 *   "'[Loans.xlsx]Tape'!A1:C5" -> { book: 'Loans.xlsx', sheet: 'Tape', ref: 'A1:C5' }
 *   "Sheet2!A1" -> { sheet: 'Sheet2', ref: 'A1' }
 */
export function splitQualified(s: string): { book?: string; sheet?: string; ref: string } {
  const bang = s.lastIndexOf('!');
  if (bang < 0) return { ref: s };
  let pre = s.slice(0, bang);
  const ref = s.slice(bang + 1);
  if (pre.startsWith("'") && pre.endsWith("'")) pre = pre.slice(1, -1).replace(/''/g, "'");
  let book: string | undefined;
  const m = /^\[([^\]]+)\](.*)$/.exec(pre);
  if (m) {
    book = m[1];
    pre = m[2];
  }
  return { book, sheet: pre, ref };
}

/** Quote a sheet name for use in a formula if needed. */
export function qualify(sheet: string, book?: string): string {
  const raw = (book ? `[${book}]` : '') + sheet;
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(raw) && !book ? raw : `'${raw.replace(/'/g, "''")}'`;
}
