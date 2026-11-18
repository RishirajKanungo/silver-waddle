// Deterministic sample data for a bank's "data lake" extracts.
// Seeded PRNG => every learner (and every automated test) sees the same data,
// so lesson checks can compute the right answers ahead of time.

import type { Workbook, Sheet, CellStyle } from '../engine/types';
import { cellKey } from '../engine/types';
import { dateToSerial } from '../engine/format';

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
export const between = (r: () => number, a: number, b: number) => Math.floor(a + r() * (b - a + 1));
export const round2 = (x: number) => Math.round(x * 100) / 100;

export type Cellish = string | number | boolean | null;

export interface SheetSpec {
  name: string;
  rows: Cellish[][]; // row 0 = header (styled bold w/ fill) unless header:false
  header?: boolean;
  widths?: number[];
  formats?: Record<number, string>; // col index -> number format for data rows
  freeze?: boolean; // freeze the header row
  styles?: Record<string, CellStyle>; // 'B2' -> style
}

/** Build a Sheet from a 2D array. Numbers stay numbers; strings that start with '=' are formulas. */
export function makeSheet(spec: SheetSpec): Sheet {
  const cells: Sheet['cells'] = {};
  const header = spec.header !== false;
  spec.rows.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v === null || v === '') return;
      let raw: string;
      if (typeof v === 'number') raw = String(v);
      else if (typeof v === 'boolean') raw = v ? 'TRUE' : 'FALSE';
      else raw = v;
      const s: CellStyle = {};
      if (header && r === 0) {
        s.b = true;
        s.fill = '#DDEBF7';
        s.border = { b: true };
      } else if (spec.formats?.[c]) s.fmt = spec.formats[c];
      cells[cellKey(r, c)] = Object.keys(s).length ? { v: raw, s } : { v: raw };
    }),
  );
  if (spec.styles) {
    for (const [a1, st] of Object.entries(spec.styles)) {
      const m = /^([A-Z]+)(\d+)$/.exec(a1)!;
      let col = 0;
      for (const ch of m[1]) col = col * 26 + ch.charCodeAt(0) - 64;
      const k = cellKey(Number(m[2]) - 1, col - 1);
      cells[k] = { v: cells[k]?.v ?? '', s: { ...(cells[k]?.s ?? {}), ...st } };
    }
  }
  const colWidths: Record<number, number> = {};
  spec.widths?.forEach((w, i) => {
    if (w) colWidths[i] = w;
  });
  return { name: spec.name, cells, colWidths, freeze: spec.freeze ? { rows: 1, cols: 0 } : undefined };
}

export function makeBook(name: string, sheets: SheetSpec[]): Workbook {
  return { id: name + ':' + Math.random().toString(36).slice(2, 8), name, sheets: sheets.map(makeSheet) };
}

export const d = (y: number, m: number, day: number) => dateToSerial(y, m, day);

// ---------------- reference data ----------------

export const REGIONS = ['Northeast', 'Southeast', 'Midwest', 'West', 'Southwest'] as const;
export const SEGMENTS = ['Retail', 'Small Business', 'Commercial', 'Wealth'] as const;
export const PRODUCTS = ['Mortgage', 'Auto Loan', 'Credit Card', 'Personal Loan', 'HELOC', 'Business Loan'] as const;
export const BRANCHES = ['NYC-01', 'NYC-02', 'BOS-01', 'ATL-01', 'MIA-01', 'CHI-01', 'DAL-01', 'PHX-01', 'SFO-01', 'SEA-01'] as const;
export const RATINGS = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC'] as const;
const FIRST = ['James', 'Maria', 'Wei', 'Aisha', 'Carlos', 'Priya', 'John', 'Elena', 'Kwame', 'Sofia', 'Liam', 'Yuki', 'Omar', 'Grace', 'Diego', 'Hannah', 'Raj', 'Chloe', 'Ivan', 'Fatima'];
const LAST = ['Smith', 'Garcia', 'Chen', 'Khan', 'Lopez', 'Patel', 'Johnson', 'Rossi', 'Mensah', 'Silva', 'Brown', 'Tanaka', 'Haddad', 'Kim', 'Martinez', 'Muller', 'Singh', 'Dubois', 'Petrov', 'Ali'];
const CORP = ['Acme Holdings', 'Blue Harbor LLC', 'Cedar Logistics', 'Delta Foods Inc', 'Evergreen Partners', 'Falcon Aerospace', 'Granite Builders', 'Harbor Health', 'Ironwood Capital', 'Juniper Retail', 'Keystone Energy', 'Lakeside Dental', 'Maple Tech', 'Northwind Traders', 'Orion Media'];

export interface Customer {
  id: string;
  name: string;
  segment: string;
  region: string;
  rating: string;
  since: number;
  branch: string;
}

export function customers(n = 60, seed = 7): Customer[] {
  const r = rng(seed);
  const out: Customer[] = [];
  for (let i = 0; i < n; i++) {
    const seg = pick(r, SEGMENTS);
    const corp = seg === 'Commercial' || seg === 'Small Business';
    out.push({
      id: `C${String(10001 + i * 7).padStart(5, '0')}`,
      name: corp ? `${pick(r, CORP)}${i > 14 ? ' ' + (i % 9) : ''}` : `${pick(r, FIRST)} ${pick(r, LAST)}`,
      segment: seg,
      region: pick(r, REGIONS),
      rating: pick(r, RATINGS.slice(0, 6)),
      since: d(between(r, 2008, 2023), between(r, 1, 12), between(r, 1, 28)),
      branch: pick(r, BRANCHES),
    });
  }
  return out;
}

export interface Loan {
  id: string;
  cust: string;
  product: string;
  orig: number; // date serial
  amount: number;
  balance: number;
  rate: number; // decimal
  term: number; // months
  dpd: number; // days past due
  status: string;
  branch: string;
}

export function loans(cs: Customer[], n = 120, seed = 11): Loan[] {
  const r = rng(seed);
  const out: Loan[] = [];
  for (let i = 0; i < n; i++) {
    const c = cs[Math.floor(r() * cs.length)];
    const product = pick(r, PRODUCTS);
    const base = { Mortgage: 350000, 'Auto Loan': 32000, 'Credit Card': 8000, 'Personal Loan': 15000, HELOC: 90000, 'Business Loan': 250000 }[product]!;
    const amount = Math.round((base * (0.4 + r() * 1.2)) / 100) * 100;
    const balance = round2(amount * (0.15 + r() * 0.85));
    const dpdRoll = r();
    const dpd = dpdRoll < 0.75 ? 0 : dpdRoll < 0.87 ? between(r, 1, 29) : dpdRoll < 0.94 ? between(r, 30, 89) : between(r, 90, 200);
    out.push({
      id: `LN-${String(500100 + i * 13)}`,
      cust: c.id,
      product,
      orig: d(between(r, 2016, 2024), between(r, 1, 12), between(r, 1, 28)),
      amount,
      balance,
      rate: round2((product === 'Credit Card' ? 0.18 : product === 'Mortgage' ? 0.045 : 0.07) + r() * 0.04) ,
      term: product === 'Mortgage' ? pick(r, [180, 360]) : product === 'Credit Card' ? 0 : pick(r, [36, 48, 60, 72, 120]),
      dpd,
      status: dpd >= 90 ? 'Non-Accrual' : dpd > 0 ? 'Delinquent' : 'Current',
      branch: c.branch,
    });
  }
  return out;
}

export interface Txn {
  id: string;
  date: number;
  acct: string;
  branch: string;
  type: string;
  channel: string;
  amount: number;
}

export function transactions(n = 200, seed = 21): Txn[] {
  const r = rng(seed);
  const types = ['Deposit', 'Withdrawal', 'Transfer', 'Payment', 'Fee'];
  const channels = ['Branch', 'ATM', 'Online', 'Mobile', 'Wire'];
  const out: Txn[] = [];
  for (let i = 0; i < n; i++) {
    const type = pick(r, types);
    const amt = type === 'Fee' ? pick(r, [15, 25, 35]) : Math.round(r() * r() * 25000 * 100) / 100 + 20;
    out.push({
      id: `TX${String(900000 + i)}`,
      date: d(2024, between(r, 1, 6), between(r, 1, 28)),
      acct: `ACC-${between(r, 1000, 1040)}`,
      branch: pick(r, BRANCHES),
      type,
      channel: type === 'Fee' ? 'System' : pick(r, channels),
      amount: type === 'Withdrawal' || type === 'Payment' || type === 'Fee' ? -amt : amt,
    });
  }
  return out;
}

export interface Trade {
  id: string;
  date: number;
  cpty: string;
  instrument: string;
  side: string;
  qty: number;
  price: number;
}

export function trades(n = 80, seed = 31): Trade[] {
  const r = rng(seed);
  const instr = ['UST 10Y', 'UST 2Y', 'AAPL', 'MSFT', 'JPM', 'EUR/USD', 'GBP/USD', 'Corp Bond XYZ 2030', 'IRS 5Y', 'Gold Fut'];
  const cps = ['Goldline Securities', 'Northbridge Capital', 'Atlas Prime', 'Summit Clearing', 'Pioneer Markets', 'Meridian Bank'];
  const out: Trade[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `T${String(70001 + i)}`,
      date: d(2024, 3, between(r, 1, 28)),
      cpty: pick(r, cps),
      instrument: pick(r, instr),
      side: r() < 0.5 ? 'Buy' : 'Sell',
      qty: between(r, 1, 50) * 100,
      price: round2(10 + r() * 190),
    });
  }
  return out;
}

export const FX_RATES: [string, number][] = [
  ['USD', 1],
  ['EUR', 1.0842],
  ['GBP', 1.2655],
  ['JPY', 0.0067],
  ['CAD', 0.7381],
  ['CHF', 1.1123],
  ['INR', 0.012],
];
