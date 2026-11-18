// The function library (160+ functions). Each entry declares arg counts and
// either `fn` (receives evaluated values) or `raw` (receives AST nodes, for
// functions that need the *reference* rather than the value: ROW, OFFSET...).

import type { FnCtx, FnDef } from './calc';
import { ERR, Scalar, Value, XLArray, XLError, isArr, isErr, makeArray } from './types';
import { S, compare, criteria, flatten, lookupEq, toArray, toBool, toNum, toStr, wildcardToRegex, hasWildcard } from './values';
import { dateToSerial, formatValue, parseDateText, ymd, fmtGeneral } from './format';
import { MAX_COLS, MAX_ROWS } from './refs';
import type { Node } from './parser';

type Args = Value[];

// ---------- helpers ----------

/** Numbers for aggregate functions: arrays skip text/bools/blanks; direct scalars are coerced. */
function nums(args: Args): number[] | XLError {
  const out: number[] = [];
  for (const a of args) {
    if (a === undefined) continue;
    if (isArr(a)) {
      for (const row of a.data)
        for (const v of row) {
          if (isErr(v)) return v;
          if (typeof v === 'number') out.push(v);
        }
    } else {
      if (a === null) continue;
      const n = toNum(a);
      if (isErr(n)) return n;
      out.push(n);
    }
  }
  return out;
}

const N = (v: Value | undefined, dflt?: number): number | XLError => {
  if (v === undefined || (v === null && dflt !== undefined)) return dflt ?? 0;
  return toNum(S(v));
};
const T = (v: Value | undefined): string | XLError => toStr(S(v));
const B = (v: Value | undefined, dflt = false): boolean | XLError => (v === undefined ? dflt : toBool(S(v)));

function chk(...vals: unknown[]): XLError | null {
  for (const v of vals) if (isErr(v)) return v;
  return null;
}

const num1 = (f: (x: number) => number | XLError): FnDef => ({
  min: 1,
  max: 1,
  lift: [0],
  fn: ([a]) => {
    const x = N(a);
    if (isErr(x)) return x;
    const r = f(x);
    return typeof r === 'number' && !isFinite(r) ? ERR.NUM : r;
  },
});

const str1 = (f: (s: string) => Scalar): FnDef => ({
  min: 1,
  max: 1,
  lift: [0],
  fn: ([a]) => {
    const s = T(a);
    return isErr(s) ? s : f(s);
  },
});

function agg(f: (xs: number[]) => number | XLError, min = 1): FnDef {
  return {
    min,
    max: 255,
    fn: (args) => {
      const xs = nums(args);
      return isErr(xs) ? xs : f(xs);
    },
  };
}

function roundTo(x: number, d: number, mode: 'round' | 'up' | 'down') {
  const p = Math.pow(10, d);
  const v = x * p;
  const r = mode === 'round' ? Math.sign(v) * Math.round(Math.abs(v) + 1e-9) : mode === 'up' ? Math.sign(v) * Math.ceil(Math.abs(v) - 1e-9) : Math.sign(v) * Math.floor(Math.abs(v) + 1e-9);
  return r / p;
}

/** Pairs of (range, criteria) -> boolean mask over the cells. */
function ifsMask(pairs: Args, rows: number, cols: number): boolean[] | XLError {
  const mask = new Array(rows * cols).fill(true);
  for (let i = 0; i < pairs.length; i += 2) {
    const rng = toArray(pairs[i]);
    if (rng.rows !== rows || rng.cols !== cols) return ERR.VALUE;
    const pred = criteria(S(pairs[i + 1]));
    const flat = flatten(rng);
    for (let k = 0; k < flat.length; k++) if (mask[k] && !pred(flat[k])) mask[k] = false;
  }
  return mask;
}

function stdev(xs: number[], sample: boolean) {
  const n = xs.length;
  if (n < (sample ? 2 : 1)) return ERR.DIV0;
  const m = xs.reduce((a, b) => a + b, 0) / n;
  const ss = xs.reduce((a, b) => a + (b - m) ** 2, 0);
  return ss / (sample ? n - 1 : n);
}

function col(arr: XLArray, j: number): Scalar[] {
  return arr.data.map((r) => r[j]);
}

/** Excel-style binary search for approximate matches (data sorted ascending). */
function approxIndex(vec: Scalar[], needle: Scalar, desc = false): number {
  let lo = 0, hi = vec.length - 1, best = -1;
  // skip trailing blanks (common with whole-column refs)
  while (hi >= 0 && vec[hi] === null) hi--;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = vec[mid];
    const c = v === null || isErr(v) ? 1 : compare(v, needle);
    const sameType = typeof v === typeof needle;
    if (desc ? c >= 0 : c <= 0) {
      if (sameType) best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best;
}

function exactIndex(vec: Scalar[], needle: Scalar, reverse = false): number {
  if (reverse) {
    for (let i = vec.length - 1; i >= 0; i--) if (lookupEq(needle, vec[i])) return i;
    return -1;
  }
  for (let i = 0; i < vec.length; i++) if (lookupEq(needle, vec[i])) return i;
  return -1;
}

function sliceRow(a: XLArray, i: number): XLArray {
  return makeArray([a.data[i].slice()]);
}
function sliceCol(a: XLArray, j: number): XLArray {
  return makeArray(a.data.map((r) => [r[j]]));
}

function isBlankish(v: Scalar) {
  return v === null || v === '';
}

// ---------- financial helpers ----------
function pv(rate: number, nper: number, pmt: number, fv: number, type: number) {
  if (rate === 0) return -(fv + pmt * nper);
  const f = Math.pow(1 + rate, nper);
  return -(fv + pmt * (1 + rate * type) * ((f - 1) / rate)) / f;
}
function fv(rate: number, nper: number, pmt: number, pvv: number, type: number) {
  if (rate === 0) return -(pvv + pmt * nper);
  const f = Math.pow(1 + rate, nper);
  return -(pvv * f + pmt * (1 + rate * type) * ((f - 1) / rate));
}
function pmt(rate: number, nper: number, pvv: number, fvv: number, type: number) {
  if (rate === 0) return -(pvv + fvv) / nper;
  const f = Math.pow(1 + rate, nper);
  return -(rate * (fvv + pvv * f)) / ((1 + rate * type) * (f - 1));
}
function ipmt(rate: number, per: number, nper: number, pvv: number, fvv: number, type: number) {
  const p = pmt(rate, nper, pvv, fvv, type);
  if (per === 1 && type === 1) return 0;
  const bal = fv(rate, per - 1, p, pvv, type);
  const interest = bal * rate;
  return type === 1 ? interest / (1 + rate) : interest;
}
function irr(cfs: number[], guess = 0.1): number | XLError {
  let r = guess;
  for (let it = 0; it < 100; it++) {
    let f = 0, df = 0;
    for (let i = 0; i < cfs.length; i++) {
      f += cfs[i] / Math.pow(1 + r, i);
      df -= (i * cfs[i]) / Math.pow(1 + r, i + 1);
    }
    if (Math.abs(f) < 1e-10) return r;
    if (df === 0) return ERR.NUM;
    const nr = r - f / df;
    if (!isFinite(nr)) return ERR.NUM;
    if (Math.abs(nr - r) < 1e-12) return nr;
    r = nr;
  }
  return ERR.NUM;
}

// ---------- date helpers ----------
function isWeekend(serial: number) {
  const wd = ymd(serial).wd;
  return wd === 0 || wd === 6;
}
function holidaySet(v: Value | undefined): Set<number> {
  const s = new Set<number>();
  for (const x of flatten(v)) if (typeof x === 'number') s.add(Math.floor(x));
  return s;
}
function eomonth(serial: number, months: number) {
  const { y, m } = ymd(serial);
  return dateToSerial(y, m + months + 1, 0);
}

// ---------- the table ----------

export const FUNCS: Record<string, FnDef> = {
  // ===== Math & aggregation =====
  SUM: agg((xs) => xs.reduce((a, b) => a + b, 0)),
  AVERAGE: agg((xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : ERR.DIV0)),
  MIN: agg((xs) => (xs.length ? Math.min(...xs) : 0)),
  MAX: agg((xs) => (xs.length ? Math.max(...xs) : 0)),
  COUNT: { min: 1, max: 255, fn: (args) => args.reduce<number>((n, a) => n + flatten(a).filter((v) => typeof v === 'number').length + (!isArr(a) && typeof a === 'string' && !isErr(toNum(a)) ? 1 : 0), 0) },
  COUNTA: { min: 1, max: 255, fn: (args) => args.reduce<number>((n, a) => n + flatten(a).filter((v) => v !== null).length, 0) },
  COUNTBLANK: { min: 1, max: 1, fn: ([a]) => flatten(a).filter(isBlankish).length },
  PRODUCT: agg((xs) => xs.reduce((a, b) => a * b, 1)),
  MEDIAN: agg((xs) => {
    if (!xs.length) return ERR.NUM;
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }),
  MODE: agg((xs) => {
    const cnt = new Map<number, number>();
    let best = NaN, bc = 1;
    for (const x of xs) {
      const c = (cnt.get(x) ?? 0) + 1;
      cnt.set(x, c);
      if (c > bc) { bc = c; best = x; }
    }
    return isNaN(best) ? ERR.NA : best;
  }),
  'STDEV.S': agg((xs) => { const v = stdev(xs, true); return isErr(v) ? v : Math.sqrt(v); }),
  'STDEV.P': agg((xs) => { const v = stdev(xs, false); return isErr(v) ? v : Math.sqrt(v); }),
  STDEV: agg((xs) => { const v = stdev(xs, true); return isErr(v) ? v : Math.sqrt(v); }),
  'VAR.S': agg((xs) => stdev(xs, true)),
  'VAR.P': agg((xs) => stdev(xs, false)),
  LARGE: {
    min: 2, max: 2,
    fn: ([a, k]) => {
      const xs = nums([a]); const kk = N(k);
      const e = chk(xs, kk); if (e) return e;
      const s = (xs as number[]).sort((x, y) => y - x);
      const i = Math.floor(kk as number) - 1;
      return i >= 0 && i < s.length ? s[i] : ERR.NUM;
    },
  },
  SMALL: {
    min: 2, max: 2,
    fn: ([a, k]) => {
      const xs = nums([a]); const kk = N(k);
      const e = chk(xs, kk); if (e) return e;
      const s = (xs as number[]).sort((x, y) => x - y);
      const i = Math.floor(kk as number) - 1;
      return i >= 0 && i < s.length ? s[i] : ERR.NUM;
    },
  },
  RANK: { min: 2, max: 3, lift: [0], fn: (a, c) => FUNCS['RANK.EQ'].fn!(a, c) },
  'RANK.EQ': {
    min: 2, max: 3, lift: [0],
    fn: ([x, ref, ord]) => {
      const v = N(x); const o = N(ord, 0);
      const xs = nums([ref]);
      const e = chk(v, o, xs); if (e) return e;
      const list = xs as number[];
      if (!list.includes(v as number)) return ERR.NA;
      return 1 + list.filter((y) => ((o as number) ? y < (v as number) : y > (v as number))).length;
    },
  },
  ROUND: { min: 2, max: 2, lift: [0, 1], fn: ([a, d]) => { const x = N(a), n = N(d); const e = chk(x, n); return e ?? roundTo(x as number, Math.trunc(n as number), 'round'); } },
  ROUNDUP: { min: 2, max: 2, lift: [0, 1], fn: ([a, d]) => { const x = N(a), n = N(d); const e = chk(x, n); return e ?? roundTo(x as number, Math.trunc(n as number), 'up'); } },
  ROUNDDOWN: { min: 2, max: 2, lift: [0, 1], fn: ([a, d]) => { const x = N(a), n = N(d); const e = chk(x, n); return e ?? roundTo(x as number, Math.trunc(n as number), 'down'); } },
  MROUND: { min: 2, max: 2, lift: [0, 1], fn: ([a, m]) => { const x = N(a), y = N(m); const e = chk(x, y); if (e) return e; if (y === 0) return 0; return Math.round((x as number) / (y as number)) * (y as number); } },
  CEILING: { min: 1, max: 2, lift: [0, 1], fn: ([a, m]) => { const x = N(a), y = N(m, 1); const e = chk(x, y); if (e) return e; return y === 0 ? 0 : Math.ceil((x as number) / (y as number) - 1e-12) * (y as number); } },
  FLOOR: { min: 1, max: 2, lift: [0, 1], fn: ([a, m]) => { const x = N(a), y = N(m, 1); const e = chk(x, y); if (e) return e; return y === 0 ? ERR.DIV0 : Math.floor((x as number) / (y as number) + 1e-12) * (y as number); } },
  'CEILING.MATH': { min: 1, max: 2, lift: [0, 1], fn: (a, c) => FUNCS.CEILING.fn!(a, c) },
  'FLOOR.MATH': { min: 1, max: 2, lift: [0, 1], fn: (a, c) => FUNCS.FLOOR.fn!(a, c) },
  INT: num1(Math.floor),
  TRUNC: { min: 1, max: 2, lift: [0, 1], fn: ([a, d]) => { const x = N(a), n = N(d, 0); const e = chk(x, n); return e ?? roundTo(x as number, n as number, 'down'); } },
  ABS: num1(Math.abs),
  SIGN: num1(Math.sign),
  SQRT: num1((x) => (x < 0 ? ERR.NUM : Math.sqrt(x))),
  EXP: num1(Math.exp),
  LN: num1((x) => (x <= 0 ? ERR.NUM : Math.log(x))),
  LOG10: num1((x) => (x <= 0 ? ERR.NUM : Math.log10(x))),
  LOG: { min: 1, max: 2, lift: [0, 1], fn: ([a, b]) => { const x = N(a), y = N(b, 10); const e = chk(x, y); if (e) return e; return (x as number) <= 0 ? ERR.NUM : Math.log(x as number) / Math.log(y as number); } },
  POWER: { min: 2, max: 2, lift: [0, 1], fn: ([a, b]) => { const x = N(a), y = N(b); const e = chk(x, y); if (e) return e; const r = Math.pow(x as number, y as number); return isFinite(r) ? r : ERR.NUM; } },
  MOD: { min: 2, max: 2, lift: [0, 1], fn: ([a, b]) => { const x = N(a), y = N(b); const e = chk(x, y); if (e) return e; if (y === 0) return ERR.DIV0; const r = (x as number) - (y as number) * Math.floor((x as number) / (y as number)); return r; } },
  PI: { min: 0, max: 0, fn: () => Math.PI },
  RAND: { min: 0, max: 0, fn: () => Math.random() },
  RANDBETWEEN: { min: 2, max: 2, fn: ([a, b]) => { const x = N(a), y = N(b); const e = chk(x, y); if (e) return e; return Math.floor(Math.random() * ((y as number) - (x as number) + 1)) + (x as number); } },
  SUMPRODUCT: {
    min: 1, max: 255,
    fn: (args) => {
      const arrs = args.map(toArray);
      const { rows, cols } = arrs[0];
      if (arrs.some((a) => a.rows !== rows || a.cols !== cols)) return ERR.VALUE;
      let s = 0;
      for (let i = 0; i < rows; i++)
        for (let j = 0; j < cols; j++) {
          let p = 1;
          for (const a of arrs) {
            const v = a.data[i][j];
            if (isErr(v)) return v;
            p *= typeof v === 'number' ? v : typeof v === 'boolean' && arrs.length === 1 ? 0 : typeof v === 'boolean' ? Number(v) : 0;
          }
          s += p;
        }
      return s;
    },
  },
  SUMSQ: agg((xs) => xs.reduce((a, b) => a + b * b, 0)),

  // ===== Conditional aggregation =====
  COUNTIF: {
    min: 2, max: 2, lift: [1],
    fn: ([rng, crit]) => {
      const pred = criteria(S(crit));
      return flatten(rng).filter(pred).length;
    },
  },
  COUNTIFS: {
    min: 2, max: 254, lift: [1, 3, 5, 7, 9, 11],
    fn: (args) => {
      if (args.length % 2) return ERR.VALUE;
      const a0 = toArray(args[0]);
      const mask = ifsMask(args, a0.rows, a0.cols);
      return isErr(mask) ? mask : mask.filter(Boolean).length;
    },
  },
  SUMIF: {
    min: 2, max: 3, lift: [1],
    fn: ([rng, crit, sumRng]) => {
      const pred = criteria(S(crit));
      const r = toArray(rng);
      const s = sumRng === undefined ? r : toArray(sumRng);
      let tot = 0;
      for (let i = 0; i < r.rows; i++)
        for (let j = 0; j < r.cols; j++) {
          if (pred(r.data[i][j])) {
            const v = s.data[i]?.[j];
            if (isErr(v)) return v;
            if (typeof v === 'number') tot += v;
          }
        }
      return tot;
    },
  },
  SUMIFS: {
    min: 3, max: 255, lift: [2, 4, 6, 8, 10, 12],
    fn: ([sumRng, ...pairs]) => {
      if (pairs.length % 2) return ERR.VALUE;
      const s = toArray(sumRng);
      const mask = ifsMask(pairs, s.rows, s.cols);
      if (isErr(mask)) return mask;
      const flat = flatten(s);
      let tot = 0;
      for (let k = 0; k < flat.length; k++) if (mask[k]) {
        const v = flat[k];
        if (isErr(v)) return v;
        if (typeof v === 'number') tot += v;
      }
      return tot;
    },
  },
  AVERAGEIF: {
    min: 2, max: 3, lift: [1],
    fn: ([rng, crit, avgRng]) => {
      const pred = criteria(S(crit));
      const r = flatten(rng);
      const s = avgRng === undefined ? r : flatten(avgRng);
      let tot = 0, n = 0;
      r.forEach((v, k) => { if (pred(v) && typeof s[k] === 'number') { tot += s[k] as number; n++; } });
      return n ? tot / n : ERR.DIV0;
    },
  },
  AVERAGEIFS: {
    min: 3, max: 255, lift: [2, 4, 6, 8, 10, 12],
    fn: ([avgRng, ...pairs]) => {
      const s = toArray(avgRng);
      const mask = ifsMask(pairs, s.rows, s.cols);
      if (isErr(mask)) return mask;
      const flat = flatten(s);
      let tot = 0, n = 0;
      flat.forEach((v, k) => { if (mask[k] && typeof v === 'number') { tot += v; n++; } });
      return n ? tot / n : ERR.DIV0;
    },
  },
  MAXIFS: {
    min: 3, max: 255, lift: [2, 4, 6, 8, 10, 12],
    fn: ([rng, ...pairs]) => {
      const s = toArray(rng);
      const mask = ifsMask(pairs, s.rows, s.cols);
      if (isErr(mask)) return mask;
      const xs = flatten(s).filter((v, k) => mask[k] && typeof v === 'number') as number[];
      return xs.length ? Math.max(...xs) : 0;
    },
  },
  MINIFS: {
    min: 3, max: 255, lift: [2, 4, 6, 8, 10, 12],
    fn: ([rng, ...pairs]) => {
      const s = toArray(rng);
      const mask = ifsMask(pairs, s.rows, s.cols);
      if (isErr(mask)) return mask;
      const xs = flatten(s).filter((v, k) => mask[k] && typeof v === 'number') as number[];
      return xs.length ? Math.min(...xs) : 0;
    },
  },

  // ===== Logical =====
  IF: {
    min: 1, max: 3,
    raw: (args, ctx) => {
      const c = ctx.ev(args[0]);
      if (isArr(c) && (c.rows > 1 || c.cols > 1)) {
        const t = args[1] ? ctx.ev(args[1]) : true;
        const f = args[2] ? ctx.ev(args[2]) : false;
        const T2 = toArray(t), F2 = toArray(f);
        return makeArray(c.data.map((row, i) => row.map((v, j) => {
          if (isErr(v)) return v;
          const b = toBool(v);
          if (isErr(b)) return b;
          const src = b ? T2 : F2;
          return src.data[src.rows === 1 ? 0 : i]?.[src.cols === 1 ? 0 : j] ?? ERR.NA;
        })));
      }
      const cv = S(c);
      if (isErr(cv)) return cv;
      const b = toBool(cv);
      if (isErr(b)) return b;
      if (b) return args[1] === undefined ? true : args[1].t === 'empty' ? 0 : ctx.ev(args[1]);
      return args[2] === undefined ? false : args[2].t === 'empty' ? 0 : ctx.ev(args[2]);
    },
  },
  IFS: {
    min: 2, max: 254,
    raw: (args, ctx) => {
      for (let i = 0; i + 1 < args.length; i += 2) {
        const c = S(ctx.ev(args[i]));
        if (isErr(c)) return c;
        const b = toBool(c);
        if (isErr(b)) return b;
        if (b) return ctx.ev(args[i + 1]);
      }
      return ERR.NA;
    },
  },
  IFERROR: {
    min: 2, max: 2,
    raw: (args, ctx) => {
      const v = ctx.ev(args[0]);
      if (isArr(v)) {
        let alt: Value | undefined;
        return makeArray(v.data.map((r) => r.map((x) => (isErr(x) ? S((alt ??= ctx.ev(args[1]))) : x))));
      }
      return isErr(v) ? ctx.ev(args[1]) : v;
    },
  },
  IFNA: {
    min: 2, max: 2,
    raw: (args, ctx) => {
      const v = ctx.ev(args[0]);
      if (isArr(v)) {
        let alt: Value | undefined;
        return makeArray(v.data.map((r) => r.map((x) => (isErr(x) && x.code === '#N/A' ? S((alt ??= ctx.ev(args[1]))) : x))));
      }
      return isErr(v) && v.code === '#N/A' ? ctx.ev(args[1]) : v;
    },
  },
  AND: {
    min: 1, max: 255,
    fn: (args) => {
      let seen = false;
      for (const v of args.flatMap((a) => (isArr(a) ? flatten(a).filter((x) => typeof x === 'boolean' || typeof x === 'number' || isErr(x)) : [a]))) {
        const b = toBool(v);
        if (isErr(b)) return b;
        seen = true;
        if (!b) return false;
      }
      return seen ? true : ERR.VALUE;
    },
  },
  OR: {
    min: 1, max: 255,
    fn: (args) => {
      let seen = false, any = false;
      for (const v of args.flatMap((a) => (isArr(a) ? flatten(a).filter((x) => typeof x === 'boolean' || typeof x === 'number' || isErr(x)) : [a]))) {
        const b = toBool(v);
        if (isErr(b)) return b;
        seen = true;
        if (b) any = true;
      }
      return seen ? any : ERR.VALUE;
    },
  },
  XOR: {
    min: 1, max: 255,
    fn: (args) => {
      let n = 0;
      for (const v of args.flatMap(flatten)) {
        const b = toBool(v);
        if (isErr(b)) return b;
        if (b) n++;
      }
      return n % 2 === 1;
    },
  },
  NOT: { min: 1, max: 1, lift: [0], fn: ([a]) => { const b = B(a); return isErr(b) ? b : !b; } },
  TRUE: { min: 0, max: 0, fn: () => true },
  FALSE: { min: 0, max: 0, fn: () => false },
  SWITCH: {
    min: 3, max: 254,
    raw: (args, ctx) => {
      const v = S(ctx.ev(args[0]));
      if (isErr(v)) return v;
      let i = 1;
      for (; i + 1 < args.length; i += 2) {
        const m = S(ctx.ev(args[i]));
        if (compare(v, m) === 0 && typeof v === typeof m) return ctx.ev(args[i + 1]);
      }
      return i < args.length ? ctx.ev(args[i]) : ERR.NA;
    },
  },
  LET: {
    min: 3, max: 253,
    raw: (args, ctx) => {
      if (args.length % 2 === 0) return ERR.VALUE;
      const vars = new Map(ctx.scope.vars ?? []);
      const scope = { ...ctx.scope, vars };
      for (let i = 0; i + 1 < args.length; i += 2) {
        const nm = args[i];
        if (nm.t !== 'name') return ERR.NAME;
        vars.set(nm.name.toUpperCase(), ctx.calc.ev(args[i + 1], scope));
      }
      return ctx.calc.ev(args[args.length - 1], scope);
    },
  },

  // ===== Info =====
  ISBLANK: { min: 1, max: 1, lift: [0], fn: ([a]) => S(a) === null },
  ISNUMBER: { min: 1, max: 1, lift: [0], fn: ([a]) => typeof S(a) === 'number' },
  ISTEXT: { min: 1, max: 1, lift: [0], fn: ([a]) => typeof S(a) === 'string' },
  ISNONTEXT: { min: 1, max: 1, lift: [0], fn: ([a]) => typeof S(a) !== 'string' },
  ISLOGICAL: { min: 1, max: 1, lift: [0], fn: ([a]) => typeof S(a) === 'boolean' },
  ISERROR: { min: 1, max: 1, lift: [0], fn: ([a]) => isErr(S(a)) },
  ISERR: { min: 1, max: 1, lift: [0], fn: ([a]) => { const v = S(a); return isErr(v) && v.code !== '#N/A'; } },
  ISNA: { min: 1, max: 1, lift: [0], fn: ([a]) => { const v = S(a); return isErr(v) && v.code === '#N/A'; } },
  ISEVEN: num1((x) => (Math.floor(Math.abs(x)) % 2 === 0 ? 1 : 0)),
  ISODD: num1((x) => (Math.floor(Math.abs(x)) % 2 === 1 ? 1 : 0)),
  NA: { min: 0, max: 0, fn: () => ERR.NA },
  N: { min: 1, max: 1, fn: ([a]) => { const v = S(a); return typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : isErr(v) ? v : 0; } },
  TYPE: { min: 1, max: 1, fn: ([a]) => { if (isArr(a) && (a.rows > 1 || a.cols > 1)) return 64; const v = S(a); return typeof v === 'number' || v === null ? 1 : typeof v === 'string' ? 2 : typeof v === 'boolean' ? 4 : 16; } },
  ISFORMULA: {
    min: 1, max: 1,
    raw: ([a], ctx) => {
      const r = ctx.calc.refOf(a, ctx.scope);
      if (!r) return ERR.VALUE;
      const cell = ctx.calc.sheetAt(r.bi, r.si).cells[`${r.range.r1},${r.range.c1}`];
      return !!cell && cell.v.startsWith('=');
    },
  },
  FORMULATEXT: {
    min: 1, max: 1,
    raw: ([a], ctx) => {
      const r = ctx.calc.refOf(a, ctx.scope);
      if (!r) return ERR.VALUE;
      const cell = ctx.calc.sheetAt(r.bi, r.si).cells[`${r.range.r1},${r.range.c1}`];
      return cell && cell.v.startsWith('=') ? cell.v : ERR.NA;
    },
  },

  // ===== Text =====
  LEN: str1((s) => s.length),
  UPPER: str1((s) => s.toUpperCase()),
  LOWER: str1((s) => s.toLowerCase()),
  PROPER: str1((s) => s.toLowerCase().replace(/(^|[^a-z])([a-z])/g, (_, a, b) => a + b.toUpperCase())),
  TRIM: str1((s) => s.replace(/ +/g, ' ').trim()),
  CLEAN: str1((s) => s.replace(/[\x00-\x1f]/g, '')),
  LEFT: { min: 1, max: 2, lift: [0, 1], fn: ([a, n]) => { const s = T(a), k = N(n, 1); const e = chk(s, k); if (e) return e; return (k as number) < 0 ? ERR.VALUE : (s as string).slice(0, k as number); } },
  RIGHT: { min: 1, max: 2, lift: [0, 1], fn: ([a, n]) => { const s = T(a), k = N(n, 1); const e = chk(s, k); if (e) return e; return (k as number) < 0 ? ERR.VALUE : (k as number) === 0 ? '' : (s as string).slice(-(k as number)); } },
  MID: { min: 3, max: 3, lift: [0, 1, 2], fn: ([a, st, n]) => { const s = T(a), i = N(st), k = N(n); const e = chk(s, i, k); if (e) return e; if ((i as number) < 1 || (k as number) < 0) return ERR.VALUE; return (s as string).substr((i as number) - 1, k as number); } },
  FIND: { min: 2, max: 3, lift: [0, 1, 2], fn: ([f, w, st]) => { const a = T(f), b = T(w), i = N(st, 1); const e = chk(a, b, i); if (e) return e; const p = (b as string).indexOf(a as string, (i as number) - 1); return p < 0 ? ERR.VALUE : p + 1; } },
  SEARCH: {
    min: 2, max: 3, lift: [0, 1, 2],
    fn: ([f, w, st]) => {
      const a = T(f), b = T(w), i = N(st, 1); const e = chk(a, b, i); if (e) return e;
      const hay = (b as string).slice((i as number) - 1);
      if (hasWildcard(a as string)) {
        const re = new RegExp(wildcardToRegex(a as string).source.slice(1, -1), 'i');
        const m = re.exec(hay);
        return m ? m.index + (i as number) : ERR.VALUE;
      }
      const p = hay.toLowerCase().indexOf((a as string).toLowerCase());
      return p < 0 ? ERR.VALUE : p + (i as number);
    },
  },
  SUBSTITUTE: {
    min: 3, max: 4, lift: [0, 1, 2, 3],
    fn: ([t, o, n, inst]) => {
      const s = T(t), a = T(o), b = T(n); const e = chk(s, a, b); if (e) return e;
      if (a === '') return s;
      if (inst === undefined) return (s as string).split(a as string).join(b as string);
      const k = N(inst); if (isErr(k)) return k;
      let idx = -1;
      for (let c = 0; c < (k as number); c++) { idx = (s as string).indexOf(a as string, idx + 1); if (idx < 0) return s; }
      return (s as string).slice(0, idx) + b + (s as string).slice(idx + (a as string).length);
    },
  },
  REPLACE: { min: 4, max: 4, lift: [0, 1, 2, 3], fn: ([t, st, n, nw]) => { const s = T(t), i = N(st), k = N(n), r = T(nw); const e = chk(s, i, k, r); if (e) return e; return (s as string).slice(0, (i as number) - 1) + r + (s as string).slice((i as number) - 1 + (k as number)); } },
  REPT: { min: 2, max: 2, lift: [0, 1], fn: ([t, n]) => { const s = T(t), k = N(n); const e = chk(s, k); if (e) return e; return (s as string).repeat(Math.max(0, Math.floor(k as number))); } },
  EXACT: { min: 2, max: 2, lift: [0, 1], fn: ([a, b]) => { const x = T(a), y = T(b); const e = chk(x, y); return e ?? x === y; } },
  CONCATENATE: { min: 1, max: 255, fn: (args) => { let o = ''; for (const a of args) { const s = T(a); if (isErr(s)) return s; o += s; } return o; } },
  CONCAT: { min: 1, max: 255, fn: (args) => { let o = ''; for (const v of args.flatMap(flatten)) { const s = toStr(v); if (isErr(s)) return s; o += s; } return o; } },
  TEXTJOIN: {
    min: 3, max: 255,
    fn: ([d, ign, ...rest]) => {
      const delim = T(d), ig = B(ign); const e = chk(delim, ig); if (e) return e;
      const parts: string[] = [];
      for (const v of rest.flatMap(flatten)) {
        const s = toStr(v); if (isErr(s)) return s;
        if (ig && s === '') continue;
        parts.push(s);
      }
      return parts.join(delim as string);
    },
  },
  TEXT: { min: 2, max: 2, lift: [0], fn: ([v, f]) => { const x = S(v); const fmt = T(f); if (isErr(fmt)) return fmt; if (isErr(x)) return x; let val: Scalar = x; if (typeof x === 'string') { const n = toNum(x); if (!isErr(n)) val = n; } return formatValue(val, fmt as string); } },
  VALUE: { min: 1, max: 1, lift: [0], fn: ([a]) => { const v = S(a); if (typeof v === 'number') return v; if (v === null) return 0; const n = toNum(typeof v === 'string' ? v.trim() : v); return n; } },
  NUMBERVALUE: { min: 1, max: 3, lift: [0], fn: ([a, ds, gs]) => { const s = T(a); if (isErr(s)) return s; const dsep = ds === undefined ? '.' : String(S(ds)); const gsep = gs === undefined ? ',' : String(S(gs)); const clean = (s as string).split(gsep).join('').replace(dsep, '.').replace(/\s/g, ''); const n = toNum(clean); return n; } },
  CHAR: num1((x) => String.fromCharCode(x) as unknown as number),
  CODE: str1((s) => (s.length ? s.charCodeAt(0) : ERR.VALUE)),
  TEXTBEFORE: {
    min: 2, max: 3, lift: [0],
    fn: ([t, d, n]) => {
      const s = T(t), dl = T(d), k = N(n, 1); const e = chk(s, dl, k); if (e) return e;
      const str = s as string, del = dl as string;
      let idx = -1;
      if ((k as number) > 0) { for (let i = 0; i < (k as number); i++) { idx = str.indexOf(del, idx + 1); if (idx < 0) return ERR.NA; } }
      else { idx = str.length; for (let i = 0; i < -(k as number); i++) { idx = str.lastIndexOf(del, idx - 1); if (idx < 0) return ERR.NA; } }
      return str.slice(0, idx);
    },
  },
  TEXTAFTER: {
    min: 2, max: 3, lift: [0],
    fn: ([t, d, n]) => {
      const s = T(t), dl = T(d), k = N(n, 1); const e = chk(s, dl, k); if (e) return e;
      const str = s as string, del = dl as string;
      let idx = -1;
      if ((k as number) > 0) { for (let i = 0; i < (k as number); i++) { idx = str.indexOf(del, idx + 1); if (idx < 0) return ERR.NA; } }
      else { idx = str.length; for (let i = 0; i < -(k as number); i++) { idx = str.lastIndexOf(del, idx - 1); if (idx < 0) return ERR.NA; } }
      return str.slice(idx + del.length);
    },
  },
  TEXTSPLIT: {
    min: 2, max: 3,
    fn: ([t, cd, rd]) => {
      const s = T(t), c = T(cd); const e = chk(s, c); if (e) return e;
      const rdel = rd === undefined || S(rd) === null ? null : T(rd);
      if (isErr(rdel)) return rdel;
      const rows = rdel ? (s as string).split(rdel as string) : [s as string];
      const data = rows.map((r) => (c === '' ? [r] : r.split(c as string)));
      const w = Math.max(...data.map((r) => r.length));
      return makeArray(data.map((r) => [...r, ...Array(w - r.length).fill(ERR.NA)]));
    },
  },
  DOLLAR: { min: 1, max: 2, lift: [0], fn: ([v, d]) => { const x = N(v), k = N(d, 2); const e = chk(x, k); if (e) return e; return formatValue(x as number, '$#,##0' + ((k as number) > 0 ? '.' + '0'.repeat(k as number) : '') + ';($#,##0' + ((k as number) > 0 ? '.' + '0'.repeat(k as number) : '') + ')'); } },
  FIXED: { min: 1, max: 3, lift: [0], fn: ([v, d, nc]) => { const x = N(v), k = N(d, 2), no = B(nc); const e = chk(x, k, no); if (e) return e; return formatValue(x as number, (no ? '0' : '#,##0') + ((k as number) > 0 ? '.' + '0'.repeat(k as number) : '')); } },

  // ===== Date & time =====
  TODAY: { min: 0, max: 0, fn: () => { const d = new Date(); return dateToSerial(d.getFullYear(), d.getMonth() + 1, d.getDate()); } },
  NOW: { min: 0, max: 0, fn: () => { const d = new Date(); return dateToSerial(d.getFullYear(), d.getMonth() + 1, d.getDate()) + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400; } },
  DATE: { min: 3, max: 3, lift: [0, 1, 2], fn: ([y, m, d]) => { const a = N(y), b = N(m), c = N(d); const e = chk(a, b, c); if (e) return e; let yy = Math.floor(a as number); if (yy < 1900) yy += 1900; return dateToSerial(yy, Math.floor(b as number), Math.floor(c as number)); } },
  YEAR: num1((x) => ymd(x).y),
  MONTH: num1((x) => ymd(x).m),
  DAY: num1((x) => ymd(x).d),
  HOUR: num1((x) => Math.floor(((x % 1) * 24) + 1e-9)),
  MINUTE: num1((x) => Math.floor((((x % 1) * 1440) + 1e-9) % 60)),
  SECOND: num1((x) => Math.round(((x % 1) * 86400)) % 60),
  TIME: { min: 3, max: 3, fn: ([h, m, s]) => { const a = N(h), b = N(m), c = N(s); const e = chk(a, b, c); if (e) return e; return (((a as number) * 3600 + (b as number) * 60 + (c as number)) / 86400) % 1; } },
  WEEKDAY: {
    min: 1, max: 2, lift: [0],
    fn: ([d, t]) => {
      const x = N(d), ty = N(t, 1); const e = chk(x, ty); if (e) return e;
      const wd = ymd(x as number).wd; // 0=Sun
      if (ty === 2) return wd === 0 ? 7 : wd;
      if (ty === 3) return wd === 0 ? 6 : wd - 1;
      return wd + 1;
    },
  },
  WEEKNUM: num1((x) => { const { y } = ymd(x); const jan1 = dateToSerial(y, 1, 1); const wd = ymd(jan1).wd; return Math.floor((x - jan1 + wd) / 7) + 1; }),
  EOMONTH: { min: 2, max: 2, lift: [0, 1], fn: ([d, m]) => { const x = N(d), k = N(m); const e = chk(x, k); return e ?? eomonth(x as number, Math.trunc(k as number)); } },
  EDATE: {
    min: 2, max: 2, lift: [0, 1],
    fn: ([d, m]) => {
      const x = N(d), k = N(m); const e = chk(x, k); if (e) return e;
      const { y, m: mm, d: dd } = ymd(x as number);
      const last = ymd(dateToSerial(y, mm + Math.trunc(k as number) + 1, 0)).d;
      return dateToSerial(y, mm + Math.trunc(k as number), Math.min(dd, last));
    },
  },
  DAYS: { min: 2, max: 2, lift: [0, 1], fn: ([a, b]) => { const x = N(a), y = N(b); const e = chk(x, y); return e ?? Math.floor(x as number) - Math.floor(y as number); } },
  DATEVALUE: str1((s) => parseDateText(s) ?? ERR.VALUE),
  DATEDIF: {
    min: 3, max: 3, lift: [0, 1],
    fn: ([a, b, u]) => {
      const s = N(a), e2 = N(b), unit = T(u); const e = chk(s, e2, unit); if (e) return e;
      if ((s as number) > (e2 as number)) return ERR.NUM;
      const A = ymd(s as number), Bd = ymd(e2 as number);
      const months = (Bd.y - A.y) * 12 + (Bd.m - A.m) - (Bd.d < A.d ? 1 : 0);
      switch ((unit as string).toUpperCase()) {
        case 'D': return Math.floor(e2 as number) - Math.floor(s as number);
        case 'M': return months;
        case 'Y': return Math.floor(months / 12);
        case 'YM': return months % 12;
        case 'MD': { let d = Bd.d - A.d; if (d < 0) d += ymd(dateToSerial(Bd.y, Bd.m, 0)).d; return d; }
        case 'YD': { let ss = dateToSerial(Bd.y, A.m, A.d); if (ss > (e2 as number)) ss = dateToSerial(Bd.y - 1, A.m, A.d); return Math.floor(e2 as number) - ss; }
      }
      return ERR.NUM;
    },
  },
  YEARFRAC: {
    min: 2, max: 3, lift: [0, 1],
    fn: ([a, b, basis]) => {
      const s = N(a), e2 = N(b), bs = N(basis, 0); const e = chk(s, e2, bs); if (e) return e;
      let x = Math.min(s as number, e2 as number), y = Math.max(s as number, e2 as number);
      if (bs === 0) { // 30/360 US
        const A = ymd(x), Bd = ymd(y);
        let d1 = A.d, d2 = Bd.d;
        if (d1 === 31) d1 = 30;
        if (d2 === 31 && d1 >= 30) d2 = 30;
        return ((Bd.y - A.y) * 360 + (Bd.m - A.m) * 30 + (d2 - d1)) / 360;
      }
      if (bs === 2) return (y - x) / 360;
      if (bs === 3) return (y - x) / 365;
      return (y - x) / 365.25;
    },
  },
  NETWORKDAYS: {
    min: 2, max: 3,
    fn: ([a, b, h]) => {
      const s = N(a), e2 = N(b); const e = chk(s, e2); if (e) return e;
      const hol = holidaySet(h);
      let x = Math.floor(s as number), y = Math.floor(e2 as number), sign = 1;
      if (x > y) { [x, y] = [y, x]; sign = -1; }
      let n = 0;
      for (let d = x; d <= y; d++) if (!isWeekend(d) && !hol.has(d)) n++;
      return n * sign;
    },
  },
  WORKDAY: {
    min: 2, max: 3,
    fn: ([a, b, h]) => {
      const s = N(a), k = N(b); const e = chk(s, k); if (e) return e;
      const hol = holidaySet(h);
      let d = Math.floor(s as number), left = Math.trunc(k as number);
      const step = left >= 0 ? 1 : -1;
      while (left !== 0) {
        d += step;
        if (!isWeekend(d) && !hol.has(d)) left -= step;
      }
      return d;
    },
  },

  // ===== Lookup & reference =====
  VLOOKUP: {
    min: 3, max: 4, lift: [0],
    fn: ([x, tbl, ci, rl]) => {
      const needle = S(x);
      if (isErr(needle)) return needle;
      if (isErr(tbl)) return tbl;
      const t = toArray(tbl);
      const c = N(ci); if (isErr(c)) return c;
      const approx = rl === undefined ? true : B(rl);
      if (isErr(approx)) return approx;
      const cidx = Math.floor(c as number);
      if (cidx < 1) return ERR.VALUE;
      if (cidx > t.cols) return ERR.REF;
      const keys = col(t, 0);
      const i = approx ? approxIndex(keys, needle) : exactIndex(keys, needle);
      if (i < 0) return ERR.NA;
      const v = t.data[i][cidx - 1];
      return v === null ? 0 : v;
    },
  },
  HLOOKUP: {
    min: 3, max: 4, lift: [0],
    fn: ([x, tbl, ri, rl]) => {
      const needle = S(x);
      if (isErr(needle)) return needle;
      const t = toArray(tbl);
      const r = N(ri); if (isErr(r)) return r;
      const approx = rl === undefined ? true : B(rl);
      if (isErr(approx)) return approx;
      const ridx = Math.floor(r as number);
      if (ridx < 1) return ERR.VALUE;
      if (ridx > t.rows) return ERR.REF;
      const keys = t.data[0];
      const i = approx ? approxIndex(keys, needle) : exactIndex(keys, needle);
      if (i < 0) return ERR.NA;
      const v = t.data[ridx - 1][i];
      return v === null ? 0 : v;
    },
  },
  MATCH: {
    min: 2, max: 3, lift: [0],
    fn: ([x, arr, mt]) => {
      const needle = S(x);
      if (isErr(needle)) return needle;
      const a = toArray(arr);
      if (a.rows > 1 && a.cols > 1) return ERR.NA;
      const vec = flatten(a);
      const t = N(mt, 1); if (isErr(t)) return t;
      let i: number;
      if (t === 0) i = exactIndex(vec, needle);
      else i = approxIndex(vec, needle, (t as number) < 0);
      return i < 0 ? ERR.NA : i + 1;
    },
  },
  XMATCH: {
    min: 2, max: 4, lift: [0],
    fn: ([x, arr, mm, sm]) => {
      const needle = S(x);
      const vec = flatten(arr);
      const mode = N(mm, 0), search = N(sm, 1); const e = chk(mode, search); if (e) return e;
      const i = xIndex(vec, needle, mode as number, search as number);
      return i < 0 ? ERR.NA : i + 1;
    },
  },
  XLOOKUP: {
    min: 3, max: 6, lift: [0],
    fn: ([x, la, ra, nf, mm, sm]) => {
      const needle = S(x);
      if (isErr(needle)) return needle;
      const L = toArray(la), R = toArray(ra);
      const vertical = L.cols === 1;
      if (L.rows > 1 && L.cols > 1) return ERR.VALUE;
      const vec = flatten(L);
      if (vertical ? R.rows !== L.rows : R.cols !== L.cols) return ERR.VALUE;
      const mode = N(mm, 0), search = N(sm, 1); const e = chk(mode, search); if (e) return e;
      const i = xIndex(vec, needle, mode as number, search as number);
      if (i < 0) return nf === undefined ? ERR.NA : nf === null ? '' : nf;
      const out = vertical ? sliceRow(R, i) : sliceCol(R, i);
      return out.rows === 1 && out.cols === 1 ? (out.data[0][0] ?? 0) : makeArray(out.data.map((r) => r.map((v) => v ?? 0)));
    },
  },
  INDEX: {
    min: 2, max: 3,
    fn: ([arr, r, c]) => {
      if (isErr(arr)) return arr;
      const a = toArray(arr);
      const ri = N(r, 0), ci = N(c, 0); const e = chk(ri, ci); if (e) return e;
      let row = Math.floor(ri as number), cl = Math.floor(ci as number);
      if (c === undefined && a.rows === 1) { cl = row; row = 1; }
      if (c === undefined && a.cols === 1) cl = 1;
      if (row < 0 || cl < 0 || row > a.rows || cl > a.cols) return ERR.REF;
      if (row === 0 && cl === 0) return a;
      if (row === 0) return sliceCol(a, cl - 1);
      if (cl === 0) return sliceRow(a, row - 1);
      const v = a.data[row - 1][cl - 1];
      return v === null ? 0 : v;
    },
  },
  CHOOSE: {
    min: 2, max: 255,
    raw: (args, ctx) => {
      const i = N(ctx.ev(args[0])); if (isErr(i)) return i;
      const k = Math.floor(i as number);
      if (k < 1 || k >= args.length) return ERR.VALUE;
      return ctx.ev(args[k]);
    },
  },
  ROW: {
    min: 0, max: 1,
    raw: (args, ctx) => {
      if (!args.length || args[0].t === 'empty') return ctx.scope.r + 1;
      const r = ctx.calc.refOf(args[0], ctx.scope);
      if (!r) return ERR.VALUE;
      const { r1, r2 } = r.range;
      if (r1 === r2 || r2 === MAX_ROWS - 1) return r1 + 1;
      return makeArray(Array.from({ length: r2 - r1 + 1 }, (_, i) => [r1 + i + 1]));
    },
  },
  COLUMN: {
    min: 0, max: 1,
    raw: (args, ctx) => {
      if (!args.length || args[0].t === 'empty') return ctx.scope.c + 1;
      const r = ctx.calc.refOf(args[0], ctx.scope);
      if (!r) return ERR.VALUE;
      const { c1, c2 } = r.range;
      if (c1 === c2 || c2 === MAX_COLS - 1) return c1 + 1;
      return makeArray([Array.from({ length: c2 - c1 + 1 }, (_, i) => c1 + i + 1)]);
    },
  },
  ROWS: {
    min: 1, max: 1,
    raw: ([a], ctx) => {
      const r = ctx.calc.refOf(a, ctx.scope);
      if (r) return r.range.r2 - r.range.r1 + 1;
      const v = ctx.ev(a);
      return isArr(v) ? v.rows : 1;
    },
  },
  COLUMNS: {
    min: 1, max: 1,
    raw: ([a], ctx) => {
      const r = ctx.calc.refOf(a, ctx.scope);
      if (r) return r.range.c2 - r.range.c1 + 1;
      const v = ctx.ev(a);
      return isArr(v) ? v.cols : 1;
    },
  },
  INDIRECT: {
    min: 1, max: 2,
    raw: (args, ctx) => {
      const ref = FUNCS.INDIRECT.refFn!(args, ctx);
      return ref ? ctx.calc.rangeArray(ref) : ERR.REF;
    },
    refFn: (args, ctx) => {
      const t = T(ctx.ev(args[0]));
      if (isErr(t)) return null;
      return ctx.calc.parseRefString(t as string, ctx.scope);
    },
  },
  OFFSET: {
    min: 3, max: 5,
    raw: (args, ctx) => {
      const ref = FUNCS.OFFSET.refFn!(args, ctx);
      return ref ? ctx.calc.rangeArray(ref) : ERR.REF;
    },
    refFn: (args, ctx) => {
      const base = ctx.calc.refOf(args[0], ctx.scope);
      if (!base) return null;
      const dr = N(ctx.ev(args[1])), dc = N(ctx.ev(args[2]));
      const h = args[3] && args[3].t !== 'empty' ? N(ctx.ev(args[3])) : base.range.r2 - base.range.r1 + 1;
      const w = args[4] && args[4].t !== 'empty' ? N(ctx.ev(args[4])) : base.range.c2 - base.range.c1 + 1;
      if ([dr, dc, h, w].some(isErr)) return null;
      const r1 = base.range.r1 + (dr as number), c1 = base.range.c1 + (dc as number);
      if (r1 < 0 || c1 < 0 || (h as number) < 1 || (w as number) < 1) return null;
      return { bi: base.bi, si: base.si, range: { r1, c1, r2: r1 + (h as number) - 1, c2: c1 + (w as number) - 1 } };
    },
  },
  TRANSPOSE: { min: 1, max: 1, fn: ([a]) => { const x = toArray(a); return makeArray(Array.from({ length: x.cols }, (_, j) => x.data.map((r) => r[j]))); } },
  SUBTOTAL: {
    min: 2, max: 255,
    raw: (args, ctx) => {
      const f = N(ctx.ev(args[0])); if (isErr(f)) return f;
      const code = (f as number) % 100;
      const vals: Value[] = [];
      for (const a of args.slice(1)) {
        const ref = ctx.calc.refOf(a, ctx.scope);
        if (ref) {
          const arr = ctx.calc.rangeArray(ref);
          const hidden = ctx.calc.sheetAt(ref.bi, ref.si).hiddenRows ?? {};
          const keep = arr.data.filter((_, i) => !hidden[ref.range.r1 + i]);
          // skip nested SUBTOTALs like Excel does
          vals.push(makeArray(keep.length ? keep : [[null]]));
        } else vals.push(ctx.ev(a));
      }
      const name = ({ 1: 'AVERAGE', 2: 'COUNT', 3: 'COUNTA', 4: 'MAX', 5: 'MIN', 6: 'PRODUCT', 7: 'STDEV.S', 8: 'STDEV.P', 9: 'SUM', 10: 'VAR.S', 11: 'VAR.P' } as Record<number, string>)[code];
      if (!name) return ERR.VALUE;
      return FUNCS[name].fn!(vals, ctx);
    },
  },
  AGGREGATE: {
    min: 3, max: 255,
    fn: ([f, , ...rest], ctx) => {
      const code = N(f); if (isErr(code)) return code;
      const clean = rest.map((a) => (isArr(a) ? makeArray(a.data.map((r) => r.map((v) => (isErr(v) ? null : v)))) : a));
      const name = ({ 1: 'AVERAGE', 2: 'COUNT', 3: 'COUNTA', 4: 'MAX', 5: 'MIN', 6: 'PRODUCT', 7: 'STDEV.S', 8: 'STDEV.P', 9: 'SUM', 12: 'MEDIAN', 14: 'LARGE', 15: 'SMALL' } as Record<number, string>)[code as number];
      if (!name) return ERR.VALUE;
      return FUNCS[name].fn!(clean, ctx);
    },
  },

  // ===== Dynamic arrays =====
  UNIQUE: {
    min: 1, max: 3,
    fn: ([a, byCol, once]) => {
      const x = toArray(a);
      const bc = B(byCol), eo = B(once); const e = chk(bc, eo); if (e) return e;
      const rows = bc ? Array.from({ length: x.cols }, (_, j) => x.data.map((r) => r[j])) : x.data;
      const keyOf = (r: Scalar[]) => r.map((v) => (typeof v === 'string' ? 's:' + v.toLowerCase() : typeof v + ':' + String(v))).join('\u0001');
      const counts = new Map<string, number>();
      rows.forEach((r) => counts.set(keyOf(r), (counts.get(keyOf(r)) ?? 0) + 1));
      const seen = new Set<string>();
      const out: Scalar[][] = [];
      for (const r of rows) {
        const k = keyOf(r);
        if (seen.has(k)) continue;
        seen.add(k);
        if (eo && counts.get(k)! > 1) continue;
        out.push(r.map((v) => v ?? 0));
      }
      if (!out.length) return ERR.CALC;
      return bc ? makeArray(Array.from({ length: out[0].length }, (_, i) => out.map((r) => r[i]))) : makeArray(out);
    },
  },
  FILTER: {
    min: 2, max: 3,
    fn: ([a, inc, empty]) => {
      const x = toArray(a), m = toArray(inc);
      let out: Scalar[][];
      if (m.cols === 1 && m.rows === x.rows) out = x.data.filter((_, i) => truthy(m.data[i][0]));
      else if (m.rows === 1 && m.cols === x.cols) out = [];
      else return ERR.VALUE;
      if (m.rows === 1 && m.cols === x.cols && !(m.cols === 1 && m.rows === x.rows)) {
        const keep = m.data[0].map(truthy);
        out = x.data.map((r) => r.filter((_, j) => keep[j]));
        if (!out[0]?.length) return empty === undefined ? ERR.CALC : empty;
        return makeArray(out.map((r) => r.map((v) => v ?? 0)));
      }
      if (!out.length) return empty === undefined ? ERR.CALC : empty;
      return makeArray(out.map((r) => r.map((v) => v ?? 0)));
    },
  },
  SORT: {
    min: 1, max: 4,
    fn: ([a, idx, ord, byCol]) => {
      const x = toArray(a);
      const i = N(idx, 1), o = N(ord, 1), bc = B(byCol); const e = chk(i, o, bc); if (e) return e;
      if (bc) {
        const cols = Array.from({ length: x.cols }, (_, j) => x.data.map((r) => r[j]));
        cols.sort((p, q) => compare(p[(i as number) - 1], q[(i as number) - 1]) * (o as number));
        return makeArray(Array.from({ length: x.rows }, (_, r) => cols.map((c) => c[r])));
      }
      const rows = x.data.map((r) => r.slice());
      rows.sort((p, q) => compare(p[(i as number) - 1], q[(i as number) - 1]) * (o as number));
      return makeArray(rows);
    },
  },
  SORTBY: {
    min: 2, max: 255,
    fn: ([a, ...pairs]) => {
      const x = toArray(a);
      const keys: { k: Scalar[]; o: number }[] = [];
      for (let p = 0; p < pairs.length; p += 2) {
        const o = pairs[p + 1] === undefined ? 1 : N(pairs[p + 1]);
        if (isErr(o)) return o;
        keys.push({ k: flatten(pairs[p]), o: o as number });
      }
      const idx = x.data.map((_, i) => i);
      idx.sort((p, q) => { for (const { k, o } of keys) { const c = compare(k[p], k[q]); if (c) return c * o; } return p - q; });
      return makeArray(idx.map((i) => x.data[i]));
    },
  },
  SEQUENCE: {
    min: 1, max: 4,
    fn: ([r, c, st, step]) => {
      const rr = N(r), cc = N(c, 1), s = N(st, 1), sp = N(step, 1); const e = chk(rr, cc, s, sp); if (e) return e;
      const data: Scalar[][] = [];
      let v = s as number;
      for (let i = 0; i < (rr as number); i++) { const row: Scalar[] = []; for (let j = 0; j < (cc as number); j++) { row.push(v); v += sp as number; } data.push(row); }
      return data.length ? makeArray(data) : ERR.CALC;
    },
  },
  TAKE: {
    min: 2, max: 3,
    fn: ([a, r, c]) => {
      const x = toArray(a); const rr = r === undefined || r === null ? x.rows : N(r); const cc = c === undefined ? x.cols : N(c); const e = chk(rr, cc); if (e) return e;
      const rows = (rr as number) >= 0 ? x.data.slice(0, rr as number) : x.data.slice(rr as number);
      return makeArray(rows.map((row) => ((cc as number) >= 0 ? row.slice(0, cc as number) : row.slice(cc as number))));
    },
  },
  VSTACK: { min: 1, max: 255, fn: (args) => { const arrs = args.map(toArray); const w = Math.max(...arrs.map((a) => a.cols)); return makeArray(arrs.flatMap((a) => a.data.map((r) => [...r, ...Array(w - r.length).fill(ERR.NA)]))); } },
  HSTACK: { min: 1, max: 255, fn: (args) => { const arrs = args.map(toArray); const h = Math.max(...arrs.map((a) => a.rows)); return makeArray(Array.from({ length: h }, (_, i) => arrs.flatMap((a) => a.data[i] ?? Array(a.cols).fill(ERR.NA)))); } },
  CHOOSECOLS: { min: 2, max: 255, fn: ([a, ...ix]) => { const x = toArray(a); const cols = ix.map((v) => N(v)); if (cols.some(isErr)) return ERR.VALUE; return makeArray(x.data.map((r) => (cols as number[]).map((k) => r[k > 0 ? k - 1 : x.cols + k] ?? ERR.VALUE))); } },

  // ===== Financial (bank essentials) =====
  PMT: { min: 3, max: 5, fn: ([r, n, p, f, t]) => { const a = N(r), b = N(n), c = N(p), d = N(f, 0), e2 = N(t, 0); const e = chk(a, b, c, d, e2); return e ?? pmt(a as number, b as number, c as number, d as number, e2 as number); } },
  IPMT: { min: 4, max: 6, fn: ([r, per, n, p, f, t]) => { const a = N(r), b = N(per), c = N(n), d = N(p), e1 = N(f, 0), e2 = N(t, 0); const e = chk(a, b, c, d, e1, e2); return e ?? ipmt(a as number, b as number, c as number, d as number, e1 as number, e2 as number); } },
  PPMT: { min: 4, max: 6, fn: ([r, per, n, p, f, t]) => { const a = N(r), b = N(per), c = N(n), d = N(p), e1 = N(f, 0), e2 = N(t, 0); const e = chk(a, b, c, d, e1, e2); if (e) return e; return pmt(a as number, c as number, d as number, e1 as number, e2 as number) - ipmt(a as number, b as number, c as number, d as number, e1 as number, e2 as number); } },
  PV: { min: 3, max: 5, fn: ([r, n, p, f, t]) => { const a = N(r), b = N(n), c = N(p), d = N(f, 0), e2 = N(t, 0); const e = chk(a, b, c, d, e2); return e ?? pv(a as number, b as number, c as number, d as number, e2 as number); } },
  FV: { min: 3, max: 5, fn: ([r, n, p, f, t]) => { const a = N(r), b = N(n), c = N(p, 0), d = N(f, 0), e2 = N(t, 0); const e = chk(a, b, c, d, e2); return e ?? fv(a as number, b as number, c as number, d as number, e2 as number); } },
  NPER: {
    min: 3, max: 5,
    fn: ([r, p, v, f, t]) => {
      const a = N(r), b = N(p), c = N(v), d = N(f, 0), e2 = N(t, 0); const e = chk(a, b, c, d, e2); if (e) return e;
      const rate = a as number, pm = b as number, pvv = c as number, fvv = d as number, ty = e2 as number;
      if (rate === 0) return -(pvv + fvv) / pm;
      const z = pm * (1 + rate * ty) / rate;
      const r2 = Math.log((z - fvv) / (z + pvv)) / Math.log(1 + rate);
      return isFinite(r2) ? r2 : ERR.NUM;
    },
  },
  RATE: {
    min: 3, max: 6,
    fn: ([n, p, v, f, t, g]) => {
      const a = N(n), b = N(p), c = N(v), d = N(f, 0), e2 = N(t, 0), gg = N(g, 0.1); const e = chk(a, b, c, d, e2, gg); if (e) return e;
      let r = gg as number;
      for (let i = 0; i < 100; i++) {
        const f0 = fv(r, a as number, b as number, c as number, e2 as number) + (d as number);
        const h = 1e-7;
        const f1 = fv(r + h, a as number, b as number, c as number, e2 as number) + (d as number);
        const dr = (f0 * h) / (f1 - f0);
        r -= dr;
        if (Math.abs(dr) < 1e-12) return r;
      }
      return ERR.NUM;
    },
  },
  NPV: { min: 2, max: 255, fn: ([r, ...cf]) => { const rate = N(r); if (isErr(rate)) return rate; const xs = nums(cf); if (isErr(xs)) return xs; return xs.reduce((s, x, i) => s + x / Math.pow(1 + (rate as number), i + 1), 0); } },
  IRR: { min: 1, max: 2, fn: ([cf, g]) => { const xs = nums([cf]); const gg = N(g, 0.1); const e = chk(xs, gg); return e ?? irr(xs as number[], gg as number); } },
  XNPV: {
    min: 3, max: 3,
    fn: ([r, v, d]) => {
      const rate = N(r); if (isErr(rate)) return rate;
      const vals = flatten(v), dates = flatten(d);
      if (vals.length !== dates.length) return ERR.NUM;
      const d0 = dates[0] as number;
      return vals.reduce<number>((s, x, i) => s + (x as number) / Math.pow(1 + (rate as number), ((dates[i] as number) - d0) / 365), 0);
    },
  },
  XIRR: {
    min: 2, max: 3,
    fn: ([v, d, g]) => {
      const vals = flatten(v) as number[], dates = flatten(d) as number[];
      let r = (S(g) as number) ?? 0.1;
      if (typeof r !== 'number') r = 0.1;
      for (let it = 0; it < 100; it++) {
        let f = 0, df = 0;
        for (let i = 0; i < vals.length; i++) {
          const t = (dates[i] - dates[0]) / 365;
          f += vals[i] / Math.pow(1 + r, t);
          df -= (t * vals[i]) / Math.pow(1 + r, t + 1);
        }
        const nr = r - f / df;
        if (!isFinite(nr)) return ERR.NUM;
        if (Math.abs(nr - r) < 1e-10) return nr;
        r = nr;
      }
      return ERR.NUM;
    },
  },
  EFFECT: { min: 2, max: 2, fn: ([r, n]) => { const a = N(r), b = N(n); const e = chk(a, b); return e ?? Math.pow(1 + (a as number) / Math.floor(b as number), Math.floor(b as number)) - 1; } },
  SLN: { min: 3, max: 3, fn: ([c, s, l]) => { const a = N(c), b = N(s), d = N(l); const e = chk(a, b, d); return e ?? ((a as number) - (b as number)) / (d as number); } },
};

function truthy(v: Scalar) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  return false;
}

function xIndex(vec: Scalar[], needle: Scalar, mode: number, search: number): number {
  const order = search < 0 ? [...vec.keys()].reverse() : [...vec.keys()];
  if (mode === 2) {
    const re = typeof needle === 'string' ? wildcardToRegex(needle) : null;
    for (const i of order) if (re ? typeof vec[i] === 'string' && re.test(vec[i] as string) : lookupEq(needle, vec[i], false)) return i;
    return -1;
  }
  for (const i of order) if (lookupEq(needle, vec[i], false)) return i;
  if (mode === 0) return -1;
  // next smaller (-1) / next larger (1)
  let best = -1;
  for (const i of order) {
    const v = vec[i];
    if (v === null || typeof v !== typeof needle) continue;
    const c = compare(v, needle);
    if (mode === -1 && c < 0 && (best < 0 || compare(v, vec[best]) > 0)) best = i;
    if (mode === 1 && c > 0 && (best < 0 || compare(v, vec[best]) < 0)) best = i;
  }
  return best;
}

// ---------- metadata for autocomplete + the function reference ----------

export const FN_INFO: Record<string, { syntax: string; desc: string; cat: string }> = {
  SUM: { syntax: 'SUM(number1, [number2], ...)', desc: 'Adds all the numbers in a range of cells.', cat: 'Math' },
  AVERAGE: { syntax: 'AVERAGE(number1, [number2], ...)', desc: 'Returns the arithmetic mean of its arguments.', cat: 'Math' },
  MIN: { syntax: 'MIN(number1, [number2], ...)', desc: 'Returns the smallest number in a set of values.', cat: 'Math' },
  MAX: { syntax: 'MAX(number1, [number2], ...)', desc: 'Returns the largest number in a set of values.', cat: 'Math' },
  COUNT: { syntax: 'COUNT(value1, [value2], ...)', desc: 'Counts the cells that contain numbers.', cat: 'Math' },
  COUNTA: { syntax: 'COUNTA(value1, [value2], ...)', desc: 'Counts the cells that are not empty.', cat: 'Math' },
  COUNTBLANK: { syntax: 'COUNTBLANK(range)', desc: 'Counts empty cells in a range.', cat: 'Math' },
  PRODUCT: { syntax: 'PRODUCT(number1, [number2], ...)', desc: 'Multiplies all the numbers.', cat: 'Math' },
  MEDIAN: { syntax: 'MEDIAN(number1, [number2], ...)', desc: 'Returns the middle value.', cat: 'Statistical' },
  MODE: { syntax: 'MODE(number1, [number2], ...)', desc: 'Returns the most frequent value.', cat: 'Statistical' },
  'STDEV.S': { syntax: 'STDEV.S(number1, [number2], ...)', desc: 'Sample standard deviation.', cat: 'Statistical' },
  'STDEV.P': { syntax: 'STDEV.P(number1, [number2], ...)', desc: 'Population standard deviation.', cat: 'Statistical' },
  LARGE: { syntax: 'LARGE(array, k)', desc: 'Returns the k-th largest value.', cat: 'Statistical' },
  SMALL: { syntax: 'SMALL(array, k)', desc: 'Returns the k-th smallest value.', cat: 'Statistical' },
  'RANK.EQ': { syntax: 'RANK.EQ(number, ref, [order])', desc: 'Rank of a number within a list.', cat: 'Statistical' },
  ROUND: { syntax: 'ROUND(number, num_digits)', desc: 'Rounds a number to a specified number of digits.', cat: 'Math' },
  ROUNDUP: { syntax: 'ROUNDUP(number, num_digits)', desc: 'Rounds a number up, away from zero.', cat: 'Math' },
  ROUNDDOWN: { syntax: 'ROUNDDOWN(number, num_digits)', desc: 'Rounds a number down, toward zero.', cat: 'Math' },
  INT: { syntax: 'INT(number)', desc: 'Rounds down to the nearest integer.', cat: 'Math' },
  ABS: { syntax: 'ABS(number)', desc: 'Absolute value.', cat: 'Math' },
  MOD: { syntax: 'MOD(number, divisor)', desc: 'Remainder after division.', cat: 'Math' },
  SUMPRODUCT: { syntax: 'SUMPRODUCT(array1, [array2], ...)', desc: 'Multiplies arrays element by element and sums the results.', cat: 'Math' },
  COUNTIF: { syntax: 'COUNTIF(range, criteria)', desc: 'Counts cells in a range that meet one condition.', cat: 'Math' },
  COUNTIFS: { syntax: 'COUNTIFS(criteria_range1, criteria1, [criteria_range2, criteria2], ...)', desc: 'Counts cells that meet multiple conditions.', cat: 'Math' },
  SUMIF: { syntax: 'SUMIF(range, criteria, [sum_range])', desc: 'Adds the cells that meet one condition.', cat: 'Math' },
  SUMIFS: { syntax: 'SUMIFS(sum_range, criteria_range1, criteria1, [criteria_range2, criteria2], ...)', desc: 'Adds the cells that meet multiple conditions.', cat: 'Math' },
  AVERAGEIF: { syntax: 'AVERAGEIF(range, criteria, [average_range])', desc: 'Averages cells that meet one condition.', cat: 'Statistical' },
  AVERAGEIFS: { syntax: 'AVERAGEIFS(average_range, criteria_range1, criteria1, ...)', desc: 'Averages cells that meet multiple conditions.', cat: 'Statistical' },
  MAXIFS: { syntax: 'MAXIFS(max_range, criteria_range1, criteria1, ...)', desc: 'Largest value among cells meeting conditions.', cat: 'Statistical' },
  MINIFS: { syntax: 'MINIFS(min_range, criteria_range1, criteria1, ...)', desc: 'Smallest value among cells meeting conditions.', cat: 'Statistical' },
  IF: { syntax: 'IF(logical_test, [value_if_true], [value_if_false])', desc: 'Returns one value if a condition is TRUE and another if FALSE.', cat: 'Logical' },
  IFS: { syntax: 'IFS(logical_test1, value_if_true1, ...)', desc: 'Checks conditions in order and returns the first TRUE match.', cat: 'Logical' },
  IFERROR: { syntax: 'IFERROR(value, value_if_error)', desc: 'Returns value_if_error if the expression is an error.', cat: 'Logical' },
  IFNA: { syntax: 'IFNA(value, value_if_na)', desc: 'Returns value_if_na if the expression is #N/A.', cat: 'Logical' },
  AND: { syntax: 'AND(logical1, [logical2], ...)', desc: 'TRUE if all arguments are TRUE.', cat: 'Logical' },
  OR: { syntax: 'OR(logical1, [logical2], ...)', desc: 'TRUE if any argument is TRUE.', cat: 'Logical' },
  NOT: { syntax: 'NOT(logical)', desc: 'Reverses TRUE/FALSE.', cat: 'Logical' },
  SWITCH: { syntax: 'SWITCH(expression, value1, result1, ..., [default])', desc: 'Matches an expression against a list of values.', cat: 'Logical' },
  LET: { syntax: 'LET(name1, value1, calculation)', desc: 'Assigns names to calculation results.', cat: 'Logical' },
  ISBLANK: { syntax: 'ISBLANK(value)', desc: 'TRUE if the cell is empty.', cat: 'Information' },
  ISNUMBER: { syntax: 'ISNUMBER(value)', desc: 'TRUE if the value is a number.', cat: 'Information' },
  ISTEXT: { syntax: 'ISTEXT(value)', desc: 'TRUE if the value is text.', cat: 'Information' },
  ISERROR: { syntax: 'ISERROR(value)', desc: 'TRUE if the value is any error.', cat: 'Information' },
  ISNA: { syntax: 'ISNA(value)', desc: 'TRUE if the value is #N/A.', cat: 'Information' },
  FORMULATEXT: { syntax: 'FORMULATEXT(reference)', desc: 'Returns a formula as text.', cat: 'Information' },
  LEN: { syntax: 'LEN(text)', desc: 'Number of characters in a text string.', cat: 'Text' },
  UPPER: { syntax: 'UPPER(text)', desc: 'Converts text to uppercase.', cat: 'Text' },
  LOWER: { syntax: 'LOWER(text)', desc: 'Converts text to lowercase.', cat: 'Text' },
  PROPER: { syntax: 'PROPER(text)', desc: 'Capitalizes the first letter of each word.', cat: 'Text' },
  TRIM: { syntax: 'TRIM(text)', desc: 'Removes extra spaces (leading, trailing, and doubles).', cat: 'Text' },
  CLEAN: { syntax: 'CLEAN(text)', desc: 'Removes non-printable characters.', cat: 'Text' },
  LEFT: { syntax: 'LEFT(text, [num_chars])', desc: 'Characters from the start of a string.', cat: 'Text' },
  RIGHT: { syntax: 'RIGHT(text, [num_chars])', desc: 'Characters from the end of a string.', cat: 'Text' },
  MID: { syntax: 'MID(text, start_num, num_chars)', desc: 'Characters from the middle of a string.', cat: 'Text' },
  FIND: { syntax: 'FIND(find_text, within_text, [start_num])', desc: 'Position of text (case-sensitive).', cat: 'Text' },
  SEARCH: { syntax: 'SEARCH(find_text, within_text, [start_num])', desc: 'Position of text (not case-sensitive, wildcards OK).', cat: 'Text' },
  SUBSTITUTE: { syntax: 'SUBSTITUTE(text, old_text, new_text, [instance_num])', desc: 'Replaces existing text with new text.', cat: 'Text' },
  REPLACE: { syntax: 'REPLACE(old_text, start_num, num_chars, new_text)', desc: 'Replaces part of a string by position.', cat: 'Text' },
  CONCAT: { syntax: 'CONCAT(text1, [text2], ...)', desc: 'Joins text from ranges/strings.', cat: 'Text' },
  CONCATENATE: { syntax: 'CONCATENATE(text1, [text2], ...)', desc: 'Joins text strings (legacy).', cat: 'Text' },
  TEXTJOIN: { syntax: 'TEXTJOIN(delimiter, ignore_empty, text1, ...)', desc: 'Joins text with a delimiter.', cat: 'Text' },
  TEXT: { syntax: 'TEXT(value, format_text)', desc: 'Formats a number as text with a format code.', cat: 'Text' },
  VALUE: { syntax: 'VALUE(text)', desc: 'Converts text that looks like a number into a number.', cat: 'Text' },
  EXACT: { syntax: 'EXACT(text1, text2)', desc: 'Case-sensitive comparison.', cat: 'Text' },
  REPT: { syntax: 'REPT(text, number_times)', desc: 'Repeats text.', cat: 'Text' },
  TEXTBEFORE: { syntax: 'TEXTBEFORE(text, delimiter, [instance_num])', desc: 'Text before a delimiter.', cat: 'Text' },
  TEXTAFTER: { syntax: 'TEXTAFTER(text, delimiter, [instance_num])', desc: 'Text after a delimiter.', cat: 'Text' },
  TEXTSPLIT: { syntax: 'TEXTSPLIT(text, col_delimiter, [row_delimiter])', desc: 'Splits text into columns/rows.', cat: 'Text' },
  TODAY: { syntax: 'TODAY()', desc: "Today's date.", cat: 'Date' },
  NOW: { syntax: 'NOW()', desc: 'Current date and time.', cat: 'Date' },
  DATE: { syntax: 'DATE(year, month, day)', desc: 'Builds a date serial number.', cat: 'Date' },
  YEAR: { syntax: 'YEAR(serial_number)', desc: 'Year of a date.', cat: 'Date' },
  MONTH: { syntax: 'MONTH(serial_number)', desc: 'Month (1-12) of a date.', cat: 'Date' },
  DAY: { syntax: 'DAY(serial_number)', desc: 'Day of month of a date.', cat: 'Date' },
  WEEKDAY: { syntax: 'WEEKDAY(serial_number, [return_type])', desc: 'Day of week (1=Sunday by default).', cat: 'Date' },
  EOMONTH: { syntax: 'EOMONTH(start_date, months)', desc: 'Last day of the month, n months away. Month-end reporting essential.', cat: 'Date' },
  EDATE: { syntax: 'EDATE(start_date, months)', desc: 'Same day n months away (maturity dates).', cat: 'Date' },
  DAYS: { syntax: 'DAYS(end_date, start_date)', desc: 'Days between two dates.', cat: 'Date' },
  DATEDIF: { syntax: 'DATEDIF(start_date, end_date, unit)', desc: 'Difference in "Y", "M", "D", "YM", "MD", "YD".', cat: 'Date' },
  DATEVALUE: { syntax: 'DATEVALUE(date_text)', desc: 'Converts date text to a serial number.', cat: 'Date' },
  NETWORKDAYS: { syntax: 'NETWORKDAYS(start_date, end_date, [holidays])', desc: 'Working days between two dates.', cat: 'Date' },
  WORKDAY: { syntax: 'WORKDAY(start_date, days, [holidays])', desc: 'Date n working days away (e.g. T+2 settlement).', cat: 'Date' },
  YEARFRAC: { syntax: 'YEARFRAC(start_date, end_date, [basis])', desc: 'Fraction of a year between dates (day-count conventions).', cat: 'Date' },
  VLOOKUP: { syntax: 'VLOOKUP(lookup_value, table_array, col_index_num, [range_lookup])', desc: 'Looks for a value in the first column of a table and returns a value in the same row from another column. Use FALSE for exact match.', cat: 'Lookup' },
  HLOOKUP: { syntax: 'HLOOKUP(lookup_value, table_array, row_index_num, [range_lookup])', desc: 'Like VLOOKUP but searches the top row.', cat: 'Lookup' },
  XLOOKUP: { syntax: 'XLOOKUP(lookup_value, lookup_array, return_array, [if_not_found], [match_mode], [search_mode])', desc: 'Modern lookup: any direction, exact match by default.', cat: 'Lookup' },
  MATCH: { syntax: 'MATCH(lookup_value, lookup_array, [match_type])', desc: 'Position of a value in a list. Use 0 for exact.', cat: 'Lookup' },
  XMATCH: { syntax: 'XMATCH(lookup_value, lookup_array, [match_mode], [search_mode])', desc: 'Modern MATCH, exact by default.', cat: 'Lookup' },
  INDEX: { syntax: 'INDEX(array, row_num, [column_num])', desc: 'Value at a given row/column of a range.', cat: 'Lookup' },
  CHOOSE: { syntax: 'CHOOSE(index_num, value1, [value2], ...)', desc: 'Picks a value from a list by position.', cat: 'Lookup' },
  ROW: { syntax: 'ROW([reference])', desc: 'Row number of a reference.', cat: 'Lookup' },
  COLUMN: { syntax: 'COLUMN([reference])', desc: 'Column number of a reference.', cat: 'Lookup' },
  ROWS: { syntax: 'ROWS(array)', desc: 'Number of rows in a reference.', cat: 'Lookup' },
  COLUMNS: { syntax: 'COLUMNS(array)', desc: 'Number of columns in a reference.', cat: 'Lookup' },
  INDIRECT: { syntax: 'INDIRECT(ref_text)', desc: 'Reference specified by a text string.', cat: 'Lookup' },
  OFFSET: { syntax: 'OFFSET(reference, rows, cols, [height], [width])', desc: 'Reference offset from a starting point.', cat: 'Lookup' },
  TRANSPOSE: { syntax: 'TRANSPOSE(array)', desc: 'Flips rows and columns.', cat: 'Lookup' },
  SUBTOTAL: { syntax: 'SUBTOTAL(function_num, ref1, ...)', desc: 'Aggregate that ignores filtered-out rows (9=SUM, 1=AVERAGE, 3=COUNTA).', cat: 'Math' },
  UNIQUE: { syntax: 'UNIQUE(array, [by_col], [exactly_once])', desc: 'Distinct values (spills).', cat: 'Dynamic Array' },
  FILTER: { syntax: 'FILTER(array, include, [if_empty])', desc: 'Rows that meet a condition (spills).', cat: 'Dynamic Array' },
  SORT: { syntax: 'SORT(array, [sort_index], [sort_order], [by_col])', desc: 'Sorts a range (spills).', cat: 'Dynamic Array' },
  SORTBY: { syntax: 'SORTBY(array, by_array1, [sort_order1], ...)', desc: 'Sorts by another range (spills).', cat: 'Dynamic Array' },
  SEQUENCE: { syntax: 'SEQUENCE(rows, [columns], [start], [step])', desc: 'Generates a list of numbers.', cat: 'Dynamic Array' },
  PMT: { syntax: 'PMT(rate, nper, pv, [fv], [type])', desc: 'Loan payment for constant payments and rate.', cat: 'Financial' },
  IPMT: { syntax: 'IPMT(rate, per, nper, pv, [fv], [type])', desc: 'Interest portion of a payment.', cat: 'Financial' },
  PPMT: { syntax: 'PPMT(rate, per, nper, pv, [fv], [type])', desc: 'Principal portion of a payment.', cat: 'Financial' },
  PV: { syntax: 'PV(rate, nper, pmt, [fv], [type])', desc: 'Present value of an investment.', cat: 'Financial' },
  FV: { syntax: 'FV(rate, nper, pmt, [pv], [type])', desc: 'Future value of an investment.', cat: 'Financial' },
  NPV: { syntax: 'NPV(rate, value1, [value2], ...)', desc: 'Net present value of periodic cash flows.', cat: 'Financial' },
  IRR: { syntax: 'IRR(values, [guess])', desc: 'Internal rate of return.', cat: 'Financial' },
  XNPV: { syntax: 'XNPV(rate, values, dates)', desc: 'NPV for irregularly timed cash flows.', cat: 'Financial' },
  XIRR: { syntax: 'XIRR(values, dates, [guess])', desc: 'IRR for irregularly timed cash flows.', cat: 'Financial' },
  RATE: { syntax: 'RATE(nper, pmt, pv, [fv], [type], [guess])', desc: 'Interest rate per period.', cat: 'Financial' },
  NPER: { syntax: 'NPER(rate, pmt, pv, [fv], [type])', desc: 'Number of periods.', cat: 'Financial' },
};

// make sure every implemented function has at least a basic syntax entry
for (const k of Object.keys(FUNCS)) if (!FN_INFO[k]) FN_INFO[k] = { syntax: `${k}(...)`, desc: '', cat: 'Other' };

void fmtGeneral;
export type { Node };
