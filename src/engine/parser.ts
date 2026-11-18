// Formula tokenizer + Pratt parser.
//
// The tokenizer keeps source positions so the UI can reuse it to:
//   * colour references while you type (like Excel),
//   * cycle $ anchors with F4 on the reference under the caret,
//   * shift relative references when you copy/paste or fill.

import { RangeAddr, parseRange, parseA1, splitQualified } from './refs';

export type TokType = 'num' | 'str' | 'bool' | 'err' | 'ref' | 'fn' | 'name' | 'op' | 'lp' | 'rp' | 'comma' | 'lb' | 'rb' | 'semi' | 'ws';

export interface Token {
  type: TokType;
  text: string;
  start: number;
  end: number;
}

const PREFIX = String.raw`(?:'(?:[^']|'')+'|\[[^\]]+\][A-Za-z0-9_.]+|[A-Za-z_][A-Za-z0-9_.]*)!`;
const CELL = String.raw`\$?[A-Za-z]{1,3}\$?\d{1,7}`;
const COLR = String.raw`\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}`;
const ROWR = String.raw`\$?\d{1,7}:\$?\d{1,7}`;
const REF_RE = new RegExp(`^(?:${PREFIX})?(?:${CELL}(?::${CELL})?|${COLR}|${ROWR})#?`);
const IDENT_RE = /^[A-Za-z_\\][A-Za-z0-9_.]*/;
const NUM_RE = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;
const ERR_RE = /^#(?:N\/A|VALUE!|REF!|DIV\/0!|NAME\?|NUM!|NULL!|SPILL!|CALC!)/i;

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const s = src;
  while (i < s.length) {
    const ch = s[i];
    const rest = s.slice(i);
    if (/\s/.test(ch)) {
      let j = i;
      while (j < s.length && /\s/.test(s[j])) j++;
      out.push({ type: 'ws', text: s.slice(i, j), start: i, end: j });
      i = j;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let v = '';
      while (j < s.length) {
        if (s[j] === '"') {
          if (s[j + 1] === '"') {
            v += '"';
            j += 2;
            continue;
          }
          break;
        }
        v += s[j++];
      }
      out.push({ type: 'str', text: v, start: i, end: Math.min(j + 1, s.length) });
      i = j + 1;
      continue;
    }
    if (ch === '#') {
      const m = ERR_RE.exec(rest);
      if (m) {
        out.push({ type: 'err', text: m[0].toUpperCase(), start: i, end: i + m[0].length });
        i += m[0].length;
        continue;
      }
    }
    // References first (they can start with letters, $, ', [ or digits for row ranges like 1:3)
    if (/[A-Za-z$'\[\d_]/.test(ch)) {
      const m = REF_RE.exec(rest);
      if (m) {
        const after = s[i + m[0].length];
        // Don't treat LOG10( or ABC123_x as a ref
        if (!(after && /[A-Za-z0-9_(.]/.test(after))) {
          // a pure-digit row range like 1:3 only if it contains ':'
          if (!/^\d/.test(m[0]) || m[0].includes(':')) {
            out.push({ type: 'ref', text: m[0], start: i, end: i + m[0].length });
            i += m[0].length;
            continue;
          }
        }
      }
    }
    if (/[\d.]/.test(ch)) {
      const m = NUM_RE.exec(rest);
      if (m) {
        out.push({ type: 'num', text: m[0], start: i, end: i + m[0].length });
        i += m[0].length;
        continue;
      }
    }
    if (/[A-Za-z_\\]/.test(ch)) {
      const m = IDENT_RE.exec(rest)!;
      const word = m[0];
      let j = i + word.length;
      let k = j;
      while (k < s.length && s[k] === ' ') k++;
      if (s[k] === '(') {
        out.push({ type: 'fn', text: word.toUpperCase(), start: i, end: j });
      } else if (/^(TRUE|FALSE)$/i.test(word)) {
        out.push({ type: 'bool', text: word.toUpperCase(), start: i, end: j });
      } else {
        out.push({ type: 'name', text: word, start: i, end: j });
      }
      i = j;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '<>') {
      out.push({ type: 'op', text: two, start: i, end: i + 2 });
      i += 2;
      continue;
    }
    const map: Record<string, TokType> = { '(': 'lp', ')': 'rp', ',': 'comma', '{': 'lb', '}': 'rb', ';': 'semi' };
    if (map[ch]) {
      out.push({ type: map[ch], text: ch, start: i, end: i + 1 });
      i++;
      continue;
    }
    if ('+-*/^&=<>%:'.includes(ch)) {
      out.push({ type: 'op', text: ch, start: i, end: i + 1 });
      i++;
      continue;
    }
    // unknown char -> treat as op so parser errors out gracefully
    out.push({ type: 'op', text: ch, start: i, end: i + 1 });
    i++;
  }
  return out;
}

// ---------------- AST ----------------

export type Node =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'err'; v: string }
  | { t: 'ref'; book?: string; sheet?: string; range: RangeAddr; text: string; spill?: boolean }
  | { t: 'name'; name: string }
  | { t: 'fn'; name: string; args: Node[] }
  | { t: 'un'; op: string; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node }
  | { t: 'pct'; a: Node }
  | { t: 'arr'; rows: Node[][] }
  | { t: 'empty' };

export class ParseError extends Error {}

export function parseRefText(text: string): Node | null {
  let spill = false;
  let t = text;
  if (t.endsWith('#')) {
    spill = true;
    t = t.slice(0, -1);
  }
  const q = splitQualified(t);
  const range = parseRange(q.ref);
  if (!range) return null;
  return { t: 'ref', book: q.book, sheet: q.sheet || undefined, range, text, spill };
}

const BIN_PREC: Record<string, number> = {
  '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1,
  '&': 2,
  '+': 3, '-': 3,
  '*': 4, '/': 4,
  '^': 5,
};

export function parseFormula(src: string): Node {
  // src excludes the leading '='
  const toks = tokenize(src).filter((t) => t.type !== 'ws');
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const expect = (type: TokType) => {
    const t = next();
    if (!t || t.type !== type) throw new ParseError(`Expected ${type}`);
    return t;
  };

  function primary(): Node {
    const t = next();
    if (!t) throw new ParseError('Unexpected end of formula');
    switch (t.type) {
      case 'num':
        return { t: 'num', v: Number(t.text) };
      case 'str':
        return { t: 'str', v: t.text };
      case 'bool':
        return { t: 'bool', v: t.text === 'TRUE' };
      case 'err':
        return { t: 'err', v: t.text };
      case 'ref': {
        const n = parseRefText(t.text);
        if (!n) throw new ParseError('Bad reference ' + t.text);
        return n;
      }
      case 'name':
        return { t: 'name', name: t.text };
      case 'fn': {
        expect('lp');
        const args: Node[] = [];
        if (peek()?.type === 'rp') {
          next();
          return { t: 'fn', name: t.text, args };
        }
        for (;;) {
          const nt = peek();
          if (nt && (nt.type === 'comma' || nt.type === 'rp')) args.push({ t: 'empty' });
          else args.push(expr(0));
          const sep = next();
          if (!sep) throw new ParseError('Missing )');
          if (sep.type === 'rp') break;
          if (sep.type !== 'comma') throw new ParseError('Expected , or )');
        }
        return { t: 'fn', name: t.text, args };
      }
      case 'lp': {
        const e = expr(0);
        expect('rp');
        return e;
      }
      case 'lb': {
        const rows: Node[][] = [[]];
        for (;;) {
          rows[rows.length - 1].push(unary());
          const sep = next();
          if (!sep) throw new ParseError('Missing }');
          if (sep.type === 'rb') break;
          if (sep.type === 'semi') rows.push([]);
          else if (sep.type !== 'comma') throw new ParseError('Bad array constant');
        }
        return { t: 'arr', rows };
      }
      case 'op':
        if (t.text === '-' || t.text === '+') return { t: 'un', op: t.text, a: unary() };
        throw new ParseError(`Unexpected "${t.text}"`);
      default:
        throw new ParseError(`Unexpected "${t.text}"`);
    }
  }

  function unary(): Node {
    const t = peek();
    if (t && t.type === 'op' && (t.text === '-' || t.text === '+')) {
      next();
      return { t: 'un', op: t.text, a: unary() };
    }
    let n = primary();
    // postfix %
    while (peek()?.type === 'op' && peek()!.text === '%') {
      next();
      n = { t: 'pct', a: n };
    }
    // range operator between two refs, e.g. A1:INDEX(...) is not supported; A1:B2 handled by tokenizer
    return n;
  }

  function expr(minPrec: number): Node {
    let left = unary();
    for (;;) {
      const t = peek();
      if (!t || t.type !== 'op') break;
      const prec = BIN_PREC[t.text];
      if (prec === undefined || prec < minPrec) break;
      next();
      // ^ is left-assoc in Excel too
      const right = expr(prec + 1);
      left = { t: 'bin', op: t.text, a: left, b: right };
    }
    return left;
  }

  const n = expr(0);
  if (p < toks.length) throw new ParseError(`Unexpected "${toks[p].text}"`);
  return n;
}

// ---------------- reference rewriting ----------------

/**
 * Rewrite every reference token in a formula. Used for:
 *  - copy/paste & fill (shift relative parts)
 *  - insert/delete rows & columns
 * `fn` receives the parsed pieces and returns replacement text (or null to keep).
 */
export function mapRefs(formula: string, fn: (tok: Token) => string | null): string {
  if (!formula.startsWith('=')) return formula;
  const body = formula.slice(1);
  const toks = tokenize(body);
  let out = '';
  for (const t of toks) {
    if (t.type === 'ref') {
      const r = fn(t);
      out += r ?? body.slice(t.start, t.end);
    } else {
      out += body.slice(t.start, t.end);
    }
  }
  return '=' + out;
}

interface RefPart {
  col: number;
  row: number;
  absCol: boolean;
  absRow: boolean;
  kind: 'cell' | 'col' | 'row';
}

function parsePart(p: string, kind: 'cell' | 'col' | 'row'): RefPart {
  if (kind === 'cell') {
    const a = parseA1(p)!;
    return { col: a.col, row: a.row, absCol: !!a.absCol, absRow: !!a.absRow, kind };
  }
  if (kind === 'col') {
    const abs = p.startsWith('$');
    const letters = p.replace('$', '');
    let n = 0;
    for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return { col: n - 1, row: 0, absCol: abs, absRow: false, kind };
  }
  const abs = p.startsWith('$');
  return { col: 0, row: Number(p.replace('$', '')) - 1, absCol: false, absRow: abs, kind };
}

function colL(c: number) {
  let s = '';
  c += 1;
  while (c > 0) {
    const m = (c - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
}

function writePart(p: RefPart): string | null {
  if (p.row < 0 || p.col < 0) return null;
  if (p.kind === 'cell') return `${p.absCol ? '$' : ''}${colL(p.col)}${p.absRow ? '$' : ''}${p.row + 1}`;
  if (p.kind === 'col') return `${p.absCol ? '$' : ''}${colL(p.col)}`;
  return `${p.absRow ? '$' : ''}${p.row + 1}`;
}

/** Split a ref token text into prefix (sheet!) + parts. */
export function decomposeRef(text: string): { prefix: string; parts: RefPart[]; spill: boolean } {
  let t = text;
  let spill = false;
  if (t.endsWith('#')) {
    spill = true;
    t = t.slice(0, -1);
  }
  const bang = t.lastIndexOf('!');
  const prefix = bang >= 0 ? t.slice(0, bang + 1) : '';
  const body = bang >= 0 ? t.slice(bang + 1) : t;
  const pieces = body.split(':');
  const kind: 'cell' | 'col' | 'row' = /\d/.test(pieces[0]) ? (/[A-Za-z]/.test(pieces[0]) ? 'cell' : 'row') : 'col';
  return { prefix, parts: pieces.map((x) => parsePart(x, kind)), spill };
}

export function composeRef(prefix: string, parts: RefPart[], spill: boolean): string | null {
  const w = parts.map(writePart);
  if (w.some((x) => x === null)) return null;
  return prefix + w.join(':') + (spill ? '#' : '');
}

/** Shift relative refs by (dr, dc) — what Excel does when you copy a formula. */
export function shiftFormula(formula: string, dr: number, dc: number): string {
  return mapRefs(formula, (tok) => {
    const d = decomposeRef(tok.text);
    const parts = d.parts.map((p) => ({
      ...p,
      row: p.absRow || p.kind === 'col' ? p.row : p.row + dr,
      col: p.absCol || p.kind === 'row' ? p.col : p.col + dc,
    }));
    return composeRef(d.prefix, parts, d.spill) ?? '#REF!';
  });
}

/**
 * Adjust refs for inserting (count>0) or deleting (count<0) rows/cols at index `at`
 * on sheet `sheetName` (refs with no prefix belong to `homeSheet`).
 */
export function adjustForInsert(
  formula: string,
  axis: 'row' | 'col',
  at: number,
  count: number,
  targetSheet: string,
  homeSheet: string,
  targetBook?: string,
  homeBook?: string,
): string {
  return mapRefs(formula, (tok) => {
    const d = decomposeRef(tok.text);
    const q = splitQualified(tok.text.replace(/#$/, ''));
    const sheet = q.sheet || homeSheet;
    const book = q.book || homeBook;
    if (sheet.toLowerCase() !== targetSheet.toLowerCase()) return null;
    if ((book || '').toLowerCase() !== (targetBook || homeBook || '').toLowerCase()) return null;
    let dead = false;
    const parts = d.parts.map((p, idx) => {
      if (axis === 'row' && p.kind === 'col') return p;
      if (axis === 'col' && p.kind === 'row') return p;
      const v = axis === 'row' ? p.row : p.col;
      let nv = v;
      if (count > 0) {
        if (v >= at) nv = v + count;
      } else {
        const delEnd = at - count - 1; // inclusive
        if (v > delEnd) nv = v + count;
        else if (v >= at) {
          // inside deleted block
          if (d.parts.length === 2) nv = idx === 0 ? at : at - 1;
          else dead = true;
        }
      }
      return axis === 'row' ? { ...p, row: nv } : { ...p, col: nv };
    });
    if (dead) return '#REF!';
    if (parts.length === 2) {
      const a = axis === 'row' ? parts[0].row : parts[0].col;
      const b = axis === 'row' ? parts[1].row : parts[1].col;
      if (b < a) return '#REF!';
    }
    return composeRef(d.prefix, parts, d.spill) ?? '#REF!';
  });
}

/** F4: cycle A1 -> $A$1 -> A$1 -> $A1 -> A1 for the ref token touching `caret`. */
export function toggleAbsoluteAt(formula: string, caret: number): { text: string; caret: number } {
  if (!formula.startsWith('=')) return { text: formula, caret };
  const body = formula.slice(1);
  const toks = tokenize(body);
  const pos = caret - 1;
  const tok = toks.find((t) => t.type === 'ref' && pos >= t.start && pos <= t.end);
  if (!tok) return { text: formula, caret };
  const d = decomposeRef(tok.text);
  const p0 = d.parts[0];
  // state: 0 = rel, 1 = $A$1, 2 = A$1, 3 = $A1
  const state = p0.absCol && p0.absRow ? 1 : !p0.absCol && p0.absRow ? 2 : p0.absCol && !p0.absRow ? 3 : 0;
  const nextState = (state + 1) % 4;
  const flags = [
    [false, false],
    [true, true],
    [false, true],
    [true, false],
  ][nextState];
  const parts = d.parts.map((p) => ({
    ...p,
    absCol: p.kind === 'row' ? false : flags[0],
    absRow: p.kind === 'col' ? false : flags[1],
  }));
  // Whole column/row refs only toggle their single dimension
  if (p0.kind === 'col') parts.forEach((p) => (p.absCol = nextState % 2 === 1));
  if (p0.kind === 'row') parts.forEach((p) => (p.absRow = nextState % 2 === 1));
  const rep = composeRef(d.prefix, parts, d.spill)!;
  const text = '=' + body.slice(0, tok.start) + rep + body.slice(tok.end);
  return { text, caret: 1 + tok.start + rep.length };
}
