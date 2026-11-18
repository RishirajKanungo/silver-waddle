// Coercion + comparison rules. These mirror how Excel treats mixed types.

import { ERR, Scalar, Value, XLArray, XLError, isArr, isErr, makeArray } from './types';
import { numToText, parseDateText, parseTimeText } from './format';

/** Unwrap a value to a single scalar (top-left cell of an array). */
export function S(v: Value | undefined): Scalar {
  if (v === undefined) return null;
  if (isArr(v)) return v.rows && v.cols ? v.data[0][0] : null;
  return v;
}

/** Parse text the way Excel does when you type it into a cell or coerce it in math. */
export function textToNumber(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  let m = /^([+-]?)\$?\s*([\d,]*\.?\d+(?:[eE][+-]?\d+)?)\s*(%?)$/.exec(t);
  if (m && (!m[2].includes(',') || /^\d{1,3}(,\d{3})*(\.\d+)?$/.test(m[2]))) {
    let n = Number(m[2].replace(/,/g, ''));
    if (m[1] === '-') n = -n;
    if (m[3]) n /= 100;
    return isFinite(n) ? n : null;
  }
  m = /^\(\$?([\d,]*\.?\d+)\)$/.exec(t); // accounting negative (1,234.00)
  if (m) return -Number(m[1].replace(/,/g, ''));
  const d = parseDateText(t);
  if (d !== null) return d;
  const tm = parseTimeText(t);
  if (tm !== null) return tm;
  return null;
}

export function toNum(v: Scalar): number | XLError {
  if (v === null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isErr(v)) return v;
  const n = textToNumber(v);
  return n === null ? ERR.VALUE : n;
}

export function toStr(v: Scalar): string | XLError {
  if (isErr(v)) return v;
  if (v === null) return '';
  if (typeof v === 'number') return numToText(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return v;
}

export function toBool(v: Scalar): boolean | XLError {
  if (v === null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (isErr(v)) return v;
  const u = v.toUpperCase();
  if (u === 'TRUE') return true;
  if (u === 'FALSE') return false;
  return ERR.VALUE;
}

const typeRank = (v: Scalar) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : 3);

/** Excel ordering: numbers < text < logicals; text is case-insensitive. */
export function compare(a: Scalar, b: Scalar): number {
  if (a === null) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
  if (b === null) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
  const ra = typeRank(a), rb = typeRank(b);
  if (ra !== rb) return ra - rb;
  if (typeof a === 'number') return a - (b as number);
  if (typeof a === 'string') {
    const x = a.toLowerCase(), y = (b as string).toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  }
  if (typeof a === 'boolean') return Number(a) - Number(b as boolean);
  return 0;
}

export function flatten(v: Value | undefined): Scalar[] {
  if (v === undefined) return [];
  if (!isArr(v)) return [v];
  const out: Scalar[] = [];
  for (const row of v.data) for (const x of row) out.push(x);
  return out;
}

export function toArray(v: Value): XLArray {
  return isArr(v) ? v : makeArray([[v]]);
}

/** Wildcard text match: * any run, ? one char, ~ escapes. */
export function wildcardToRegex(p: string): RegExp {
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === '~' && i + 1 < p.length) {
      re += p[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (ch === '*') re += '.*';
    else if (ch === '?') re += '.';
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'is');
}

export const hasWildcard = (s: string) => /[*?]/.test(s.replace(/~./g, ''));

/** Build a predicate for COUNTIF/SUMIF-style criteria such as ">100", "<>Closed", "A*". */
export function criteria(crit: Scalar): (v: Scalar) => boolean {
  if (typeof crit === 'number') return (v) => (typeof v === 'number' ? v === crit : typeof v === 'string' && textToNumber(v) === crit);
  if (typeof crit === 'boolean') return (v) => v === crit;
  if (crit === null) return (v) => v === null || v === '';
  if (isErr(crit)) return (v) => isErr(v) && v.code === crit.code;
  const m = /^(<=|>=|<>|=|<|>)?(.*)$/s.exec(crit)!;
  const op = m[1] || '=';
  const rhs = m[2];
  const num = rhs.trim() === '' ? null : textToNumber(rhs);
  if (rhs === '') {
    if (op === '=') return (v) => v === null || v === '';
    if (op === '<>') return (v) => !(v === null || v === '');
  }
  if (num !== null && !/^[A-Za-z]/.test(rhs.trim())) {
    return (v) => {
      let x: number | null = null;
      if (typeof v === 'number') x = v;
      else if (op === '=' || op === '<>') x = typeof v === 'string' ? textToNumber(v) : null;
      if (x === null) return op === '<>';
      switch (op) {
        case '=': return x === num;
        case '<>': return x !== num;
        case '<': return x < num;
        case '>': return x > num;
        case '<=': return x <= num;
        case '>=': return x >= num;
      }
      return false;
    };
  }
  if (op === '=' || op === '<>') {
    const re = wildcardToRegex(rhs);
    const eq = (v: Scalar) => {
      if (v === null) return rhs === '';
      if (typeof v === 'string') return re.test(v);
      if (typeof v === 'boolean') return (v ? 'TRUE' : 'FALSE') === rhs.toUpperCase();
      return false;
    };
    return op === '=' ? eq : (v) => !eq(v);
  }
  return (v) => {
    if (typeof v !== 'string') return false;
    const c = compare(v, rhs);
    return op === '<' ? c < 0 : op === '>' ? c > 0 : op === '<=' ? c <= 0 : c >= 0;
  };
}

/** Equality used by lookups (exact match). Case-insensitive, supports wildcards for text. */
export function lookupEq(needle: Scalar, v: Scalar, wildcards = true): boolean {
  if (typeof needle === 'string') {
    if (typeof v !== 'string') return false;
    if (wildcards && hasWildcard(needle)) return wildcardToRegex(needle).test(v);
    return needle.toLowerCase() === v.toLowerCase();
  }
  if (typeof needle === 'number') return typeof v === 'number' && Math.abs(v - needle) < 1e-12 * Math.max(1, Math.abs(needle));
  if (typeof needle === 'boolean') return v === needle;
  return false;
}

export function firstError(...vals: (Value | undefined)[]): XLError | null {
  for (const v of vals) {
    if (isErr(v)) return v;
  }
  return null;
}
