// Core value + data model types for the spreadsheet engine.
//
// Why a tiny custom engine instead of a library? We need full control over
// cross-workbook references ([File.xlsx]Sheet!A1), point-mode editing, and
// lesson validation hooks, and we want the app to run 100% offline.

export type ErrorCode =
  | '#N/A'
  | '#VALUE!'
  | '#REF!'
  | '#DIV/0!'
  | '#NAME?'
  | '#NUM!'
  | '#NULL!'
  | '#SPILL!'
  | '#CALC!';

export class XLError {
  constructor(public code: ErrorCode) {}
  toString() {
    return this.code;
  }
}

/** A scalar cell value. `null` = truly empty cell. */
export type Scalar = number | string | boolean | XLError | null;

/** A 2D block of values (rows x cols). Ranges and array results use this. */
export interface XLArray {
  kind: 'array';
  rows: number;
  cols: number;
  data: Scalar[][];
}

export type Value = Scalar | XLArray;

export const isArr = (v: unknown): v is XLArray => !!v && typeof v === 'object' && (v as XLArray).kind === 'array';
export const isErr = (v: unknown): v is XLError => v instanceof XLError;

export const ERR = {
  NA: new XLError('#N/A'),
  VALUE: new XLError('#VALUE!'),
  REF: new XLError('#REF!'),
  DIV0: new XLError('#DIV/0!'),
  NAME: new XLError('#NAME?'),
  NUM: new XLError('#NUM!'),
  SPILL: new XLError('#SPILL!'),
  CALC: new XLError('#CALC!'),
};

export function makeArray(data: Scalar[][]): XLArray {
  return { kind: 'array', rows: data.length, cols: data[0]?.length ?? 0, data };
}

// ---------- workbook model ----------

export interface Border {
  t?: boolean;
  b?: boolean;
  l?: boolean;
  r?: boolean;
  /** true when every drawn side of this cell is thick (single-cell thick box) */
  thick?: boolean;
  /** which sides are thick, e.g. 'tl' for the top-left corner of a thick box */
  thickSides?: string;
}

export interface CellStyle {
  b?: boolean;
  i?: boolean;
  u?: boolean;
  fmt?: string; // number format, e.g. '#,##0.00'
  align?: 'left' | 'center' | 'right';
  fill?: string;
  color?: string;
  border?: Border;
  wrap?: boolean;
}

export interface Cell {
  /** Raw input exactly as typed: '42', 'hello', '=SUM(A1:A3)'. */
  v: string;
  s?: CellStyle;
}

export interface CFRule {
  id: string;
  range: string; // A1-style range on this sheet
  type: 'gt' | 'lt' | 'eq' | 'between' | 'contains' | 'duplicate' | 'blank' | 'formula';
  a?: string;
  b?: string;
  fill: string;
  color?: string;
}

export interface FilterState {
  range: string; // header row + data, e.g. A1:F200
  /** column index (absolute) -> allowed display values (undefined = no filter) */
  allowed: Record<number, string[] | undefined>;
}

export interface Sheet {
  name: string;
  cells: Record<string, Cell>; // key 'r,c' (0-based)
  colWidths: Record<number, number>;
  hiddenRows?: Record<number, boolean>;
  freeze?: { rows: number; cols: number };
  filter?: FilterState;
  cf?: CFRule[];
  showGridlines?: boolean; // default true
  tabColor?: string;
}

export interface Workbook {
  id: string;
  name: string; // file name, e.g. 'Customer_Master.xlsx'
  sheets: Sheet[];
}

export const cellKey = (r: number, c: number) => `${r},${c}`;
export const parseKey = (k: string): [number, number] => {
  const i = k.indexOf(',');
  return [Number(k.slice(0, i)), Number(k.slice(i + 1))];
};
