// Number formatting (cell formats + the TEXT() function) and Excel date serials.
//
// Excel stores dates as numbers: 1 = 1900-01-01, 45292 = 2024-01-01.
// That's why you can subtract two dates to get days, or add 30 to a date.

import { Scalar, isErr } from './types';

const MS_DAY = 86400000;
const EPOCH = Date.UTC(1899, 11, 30); // serial 0 (accounts for Excel's 1900 leap-year quirk for dates after Feb-1900)

export function serialToDate(serial: number): Date {
  return new Date(EPOCH + Math.round(serial * MS_DAY));
}

export function dateToSerial(y: number, m: number, d: number): number {
  // m is 1-based; JS Date handles overflow (month 13 -> next year) just like Excel's DATE()
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / MS_DAY);
}

export function ymd(serial: number): { y: number; m: number; d: number; wd: number } {
  const dt = serialToDate(Math.floor(serial));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), wd: dt.getUTCDay() };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Try to read typed text as a date. Returns a serial or null. */
export function parseDateText(s: string): number | null {
  const t = s.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(t); // US m/d/yyyy
  if (m) return valid(fixYear(+m[3]), +m[1], +m[2]);
  m = /^(\d{1,2})[- ]([A-Za-z]{3,9})[- ](\d{2,4})$/.exec(t); // 15-Jan-2024
  if (m) {
    const mi = monthIdx(m[2]);
    if (mi) return valid(fixYear(+m[3]), mi, +m[1]);
  }
  m = /^([A-Za-z]{3,9}) (\d{1,2}),? (\d{4})$/.exec(t); // Jan 15, 2024
  if (m) {
    const mi = monthIdx(m[1]);
    if (mi) return valid(+m[3], mi, +m[2]);
  }
  return null;
}

function fixYear(y: number) {
  return y < 100 ? (y < 30 ? 2000 + y : 1900 + y) : y;
}
function monthIdx(name: string) {
  const i = MONTHS.findIndex((x) => x.toLowerCase().startsWith(name.toLowerCase().slice(0, 3)));
  return i >= 0 ? i + 1 : 0;
}
function valid(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const s = dateToSerial(y, m, d);
  const back = ymd(s);
  if (back.m !== m) return null;
  return s;
}

export function parseTimeText(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(s.trim());
  if (!m) return null;
  let h = +m[1];
  if (m[4]) {
    if (m[4].toUpperCase() === 'PM' && h < 12) h += 12;
    if (m[4].toUpperCase() === 'AM' && h === 12) h = 0;
  }
  if (h > 23 || +m[2] > 59) return null;
  return (h * 3600 + +m[2] * 60 + (m[3] ? +m[3] : 0)) / 86400;
}

/** Excel "General" format: up to ~11 significant digits for display. */
export function fmtGeneral(n: number, maxDigits = 11): string {
  if (!isFinite(n)) return '#NUM!';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e11 || abs < 1e-9) {
    return n.toExponential(5).replace(/\.?0+e/, 'E').replace('E+', 'E+').replace(/e/, 'E');
  }
  let s = Number(n.toPrecision(maxDigits)).toString();
  if (s.includes('e')) s = n.toFixed(10).replace(/\.?0+$/, '');
  return s;
}

/** Full precision text conversion (used by & and TEXT-free coercions). */
export function numToText(n: number): string {
  return fmtGeneral(n, 15);
}

export function scalarToText(v: Scalar): string {
  if (v === null) return '';
  if (typeof v === 'number') return numToText(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (isErr(v)) return v.code;
  return v;
}

function groupThousands(intStr: string) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function isDateFormat(f: string) {
  const stripped = f.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '');
  return /[dy]/i.test(stripped) || /m{3,}/i.test(stripped) || /h|s/i.test(stripped);
}

function formatDate(serial: number, fmt: string): string {
  const { y, m, d, wd } = ymd(serial);
  const frac = serial - Math.floor(serial);
  const totalSec = Math.round(frac * 86400);
  const hh = Math.floor(totalSec / 3600), mi = Math.floor((totalSec % 3600) / 60), ss = totalSec % 60;
  const ampm = /AM\/PM/i.test(fmt);
  let out = '';
  let i = 0;
  const f = fmt;
  let lastWasHour = false;
  while (i < f.length) {
    const rest = f.slice(i);
    const tk = /^(yyyy|yy|mmmmm|mmmm|mmm|mm|m|dddd|ddd|dd|d|hh|h|ss|s|AM\/PM|"[^"]*"|\\.|.)/i.exec(rest)![0];
    const low = tk.toLowerCase();
    let piece = tk;
    if (low === 'yyyy') piece = String(y);
    else if (low === 'yy') piece = String(y).slice(-2);
    else if (low === 'mmmmm') piece = MONTHS[m - 1][0];
    else if (low === 'mmmm') piece = MONTHS[m - 1];
    else if (low === 'mmm') piece = MONTHS[m - 1].slice(0, 3);
    else if (low === 'mm' || low === 'm') {
      // 'm' means minutes when it follows an hour token or precedes seconds
      const isMin = lastWasHour || /^mm?:ss?/i.test(rest);
      const val = isMin ? mi : m;
      piece = low === 'mm' ? String(val).padStart(2, '0') : String(val);
    } else if (low === 'dddd') piece = DAYS[wd];
    else if (low === 'ddd') piece = DAYS[wd].slice(0, 3);
    else if (low === 'dd') piece = String(d).padStart(2, '0');
    else if (low === 'd') piece = String(d);
    else if (low === 'hh' || low === 'h') {
      const h = ampm ? ((hh + 11) % 12) + 1 : hh;
      piece = low === 'hh' ? String(h).padStart(2, '0') : String(h);
    } else if (low === 'ss') piece = String(ss).padStart(2, '0');
    else if (low === 's') piece = String(ss);
    else if (low === 'am/pm') piece = hh < 12 ? 'AM' : 'PM';
    else if (tk.startsWith('"')) piece = tk.slice(1, -1);
    else if (tk.startsWith('\\')) piece = tk.slice(1);
    if (/^[a-z]/i.test(low) && !tk.startsWith('"')) lastWasHour = low === 'h' || low === 'hh';
    out += piece;
    i += tk.length;
  }
  return out;
}

function formatNumberSection(n: number, fmt: string): string {
  // literal text
  let prefix = '';
  let suffix = '';
  let core = fmt;
  // pull quoted strings & currency symbols at edges
  const lit = /^((?:"[^"]*"|[$€£¥\\ (+\-]|\\.)*)(.*?)((?:"[^"]*"|[ )%]|\\.|_.)*)$/.exec(fmt);
  if (lit) {
    prefix = lit[1];
    core = lit[2];
    suffix = lit[3];
  }
  const clean = (x: string) => x.replace(/"([^"]*)"/g, '$1').replace(/\\(.)/g, '$1').replace(/_./g, ' ');
  prefix = clean(prefix);
  suffix = clean(suffix);
  let val = n;
  if (fmt.includes('%')) val *= 100;
  // trailing commas scale by 1000 (e.g. #,##0, = thousands)
  const scaleCommas = /,+$/.exec(core.replace(/[0#?.]+$/, (x) => x))?.[0]?.length ?? 0;
  if (/[0#],+$/.test(core)) {
    const k = /,+$/.exec(core)![0].length;
    val /= Math.pow(1000, k);
    core = core.replace(/,+$/, '');
  }
  void scaleCommas;
  const dot = core.indexOf('.');
  const decPart = dot >= 0 ? core.slice(dot + 1).replace(/[^0#?]/g, '') : '';
  const intPart = dot >= 0 ? core.slice(0, dot) : core;
  const minDec = (decPart.match(/0/g) || []).length;
  const maxDec = decPart.length;
  const useComma = intPart.includes(',');
  const minInt = (intPart.match(/0/g) || []).length;
  let s = Math.abs(val).toFixed(maxDec);
  if (maxDec > minDec) {
    // drop optional trailing zeros
    s = s.replace(new RegExp(`0{1,${maxDec - minDec}}$`), '');
    if (s.endsWith('.')) s = s.slice(0, -1);
  }
  let [ip, dp] = s.split('.');
  if (ip === '0' && minInt === 0) ip = '';
  ip = ip.padStart(minInt, '0');
  if (useComma) ip = groupThousands(ip);
  const body = dp !== undefined ? `${ip}.${dp}` : ip;
  return prefix + body + suffix;
}

/** Format a value for display using an Excel-style number format string. */
export function formatValue(v: Scalar, fmt?: string): string {
  if (v === null) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (isErr(v)) return v.code;
  if (typeof v === 'string') {
    if (fmt && fmt.includes('@') && fmt !== '@') return fmt.replace('@', v).replace(/"/g, '');
    return v;
  }
  if (!fmt || fmt === 'General') return fmtGeneral(v);
  if (fmt === '@') return fmtGeneral(v);
  const sections = splitSections(fmt);
  let sec = sections[0];
  let n = v;
  if (v < 0 && sections.length > 1) {
    sec = sections[1];
    n = -v;
  } else if (v === 0 && sections.length > 2) {
    sec = sections[2];
  }
  sec = sec.replace(/\[(Red|Blue|Green|Black|Color\d+)\]/gi, '');
  if (isDateFormat(sec)) return formatDate(v, sec);
  if (sec.trim() === '-' || /^"?-"?$/.test(sec.replace(/_./g, '').trim())) return sec.replace(/_./g, ' ').replace(/"/g, '');
  const txt = formatNumberSection(n, sec);
  if (n < 0 && sections.length === 1) return '-' + txt;
  return txt;
}

export function negativeIsRed(fmt?: string, v?: Scalar) {
  return !!fmt && typeof v === 'number' && v < 0 && /;\[Red\]/i.test(fmt);
}

function splitSections(fmt: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (const ch of fmt) {
    if (ch === '"') q = !q;
    if (ch === ';' && !q) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export const FORMATS = {
  general: 'General',
  number: '#,##0.00',
  comma: '#,##0.00_);(#,##0.00)',
  currency: '$#,##0.00',
  accounting: '$#,##0.00_);($#,##0.00)',
  percent: '0%',
  percent2: '0.00%',
  shortDate: 'm/d/yyyy',
  isoDate: 'yyyy-mm-dd',
  dmy: 'd-mmm-yy',
  time: 'h:mm AM/PM',
  text: '@',
  thousands: '#,##0,"K"',
};

export function isDateFmt(fmt?: string) {
  return !!fmt && fmt !== 'General' && isDateFormat(splitSections(fmt)[0]);
}

/** Change the number of decimals shown in a format (Alt H 0 / Alt H 9). */
export function bumpDecimals(fmt: string | undefined, delta: number, sample: number | null): string {
  let f = fmt && fmt !== 'General' ? fmt : '';
  if (!f) {
    // infer current decimals from the sample value
    const dec = sample === null ? 0 : (fmtGeneral(sample).split('.')[1] || '').length;
    const nd = Math.max(0, dec + delta);
    return nd ? '0.' + '0'.repeat(nd) : '0';
  }
  return splitSections(f)
    .map((sec) => {
      const m = /(0)(\.0*)?(?![^"]*")/.exec(sec);
      if (!m) return sec;
      const idx = sec.lastIndexOf(m[0]);
      const cur = m[2] ? m[2].length - 1 : 0;
      const nd = Math.max(0, cur + delta);
      const rep = '0' + (nd ? '.' + '0'.repeat(nd) : '');
      return sec.slice(0, idx) + rep + sec.slice(idx + m[0].length);
    })
    .join(';');
}
