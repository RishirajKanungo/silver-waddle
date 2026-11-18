import type { CheckCtx, Module } from '../types';
import { makeBook, d, rng, between, customers, loans, trades } from '../data';
import { all, valuesEqual } from '../runner';
import { dateToSerial, ymd } from '../../engine/format';

// ---------- Excel-equivalent date helpers (to compute expected answers) ----------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const eomonth = (s: number, k: number) => {
  const { y, m } = ymd(s);
  return dateToSerial(y, m + k + 1, 0);
};
const edate = (s: number, k: number) => {
  const { y, m, d: dd } = ymd(s);
  const last = ymd(dateToSerial(y, m + k + 1, 0)).d;
  return dateToSerial(y, m + k, Math.min(dd, last));
};
const isWeekend = (s: number) => {
  const wd = ymd(s).wd;
  return wd === 0 || wd === 6;
};
const workday = (s: number, n: number, hol: Set<number>) => {
  let x = s, left = n;
  while (left > 0) {
    x++;
    if (!isWeekend(x) && !hol.has(x)) left--;
  }
  return x;
};
const networkdays = (a: number, b: number, hol: Set<number>) => {
  let n = 0;
  for (let x = a; x <= b; x++) if (!isWeekend(x) && !hol.has(x)) n++;
  return n;
};
const datedifM = (a: number, b: number) => {
  const A = ymd(a), B = ymd(b);
  return (B.y - A.y) * 12 + (B.m - A.m) - (B.d < A.d ? 1 : 0);
};
const mmmyy = (s: number) => {
  const { y, m } = ymd(s);
  return `${MON[m - 1]}-${String(y).slice(2)}`;
};

const DATE_FMT = 'm/d/yyyy';
const fmtCol = (col: string, r1: number, r2: number, fmt = DATE_FMT) =>
  Object.fromEntries(Array.from({ length: r2 - r1 + 1 }, (_, i) => [`${col}${r1 + i}`, { fmt }]));

function formulas(c: CheckCtx, col: string, r1: number, r2: number, re: RegExp, msg: string, sheet = ''): true | string {
  for (let r = r1; r <= r2; r++) {
    const f = c.f(`${sheet}${col}${r}`);
    if (!f.startsWith('=')) return `${col}${r} needs a formula (it is ${f ? 'a typed value' : 'empty'}). Fill it down the whole column.`;
    if (!re.test(f)) return `${col}${r}: ${msg}`;
  }
  return true;
}

// =====================================================================
// Lesson 1 data: payments (due vs paid) + booking date parts from the lake
const r1 = rng(1701);
const pays = Array.from({ length: 20 }, (_, k) => {
  const due = d(2024, between(r1, 1, 6), between(r1, 1, 28));
  const late = r1() < 0.3 ? -between(r1, 1, 3) : r1() < 0.6 ? 0 : between(r1, 1, 45);
  return {
    id: `LN-${500100 + k * 13}`,
    due,
    paid: due + late,
    late,
    by: between(r1, 2017, 2023),
    bm: between(r1, 1, 12),
    bd: between(r1, 1, 28),
  };
});
const PN = pays.length;
const PLAST = PN + 1;

// =====================================================================
// Lesson 2 data: amortising loans (no credit cards) for EOMONTH / EDATE
const book = loans(customers(), 120, 11).filter((l) => l.term > 0).slice(0, 25).map((l) => ({ ...l }));
book[3] = { ...book[3], orig: d(2020, 2, 29), term: 36 }; // the leap-day loan
const BN = book.length;
const BLAST = BN + 1;
const RUN_DATE = d(2024, 7, 9);
const REPORT_ME = eomonth(RUN_DATE, -1);
const LY_ME = eomonth(REPORT_ME, -12);

// =====================================================================
// Lesson 3 data: trades, holiday calendar, collections
const HOLS: [number, string][] = [
  [d(2024, 1, 1), "New Year's Day"],
  [d(2024, 1, 15), 'Martin Luther King Jr. Day'],
  [d(2024, 2, 19), "Presidents' Day"],
  [d(2024, 3, 29), 'Good Friday'],
  [d(2024, 5, 27), 'Memorial Day'],
  [d(2024, 6, 19), 'Juneteenth'],
];
const HOLSET = new Set(HOLS.map((h) => h[0]));
const bizTrades = trades(80, 31).filter((t) => !isWeekend(t.date) && !HOLSET.has(t.date));
const lateMarch = bizTrades.filter((t) => t.date >= d(2024, 3, 26));
const tr = [...bizTrades.filter((t) => t.date < d(2024, 3, 26)).slice(0, 16), ...lateMarch.slice(0, 4)].sort((a, b) => a.date - b.date || a.id.localeCompare(b.id));
const TN = tr.length;
const TLAST = TN + 1;
const settle = tr.map((t) => workday(t.date, 2, HOLSET));

const CAL = [1, 2, 3, 4, 5, 6].map((m) => ({ start: d(2024, m, 1), end: eomonth(d(2024, m, 1), 0) }));
const CALLAST = CAL.length + 1;

const REPORT = d(2024, 6, 30);
const r3 = rng(1703);
const lnAll = loans(customers(), 120, 11);
const coll = [...lnAll.filter((l) => l.dpd > 0).slice(0, 10), ...lnAll.filter((l) => l.dpd === 0).slice(0, 5)]
  .sort((a, b) => a.id.localeCompare(b.id))
  .map((l) => {
    const dpd = l.dpd;
    const due = dpd > 0 ? REPORT - dpd : REPORT + between(r3, 1, 20);
    return { id: l.id, orig: l.orig, due, product: l.product };
  });
const CN = coll.length;
const CLAST = CN + 1;

export const module: Module = {
  id: 'm07',
  title: 'Dates & Month-End',
  level: 'Analyst',
  icon: '📅',
  blurb: 'Dates are numbers: subtract them, build them, roll them to month-end, add business days for settlement and measure loan age and days past due.',
  lessons: [
    // =====================================================================
    {
      id: 'm07-l1',
      title: 'Dates are serial numbers',
      summary: 'See the number behind a date, subtract dates, build them with DATE, take them apart with YEAR/MONTH/DAY and label them with TEXT.',
      minutes: 10,
      featured: ['Ctrl+Shift+~', 'DATE', 'YEAR', 'MONTH', 'DAY', 'TEXT'],
      intro: `Excel stores every date as a **serial number**: the count of days since 1 Jan 1900. 15 Mar 2024 is **45366**. The "date" you see is just a number format painted on top.

**Why this matters:**
- **Subtracting works.** Paid date − due date = days late. Report date − due date = days past due. No special function needed.
- **Adding works.** Due date + 30 = 30 days later.
- **Comparisons work.** \`B2<=$K$1\` asks "is this on or before the report date?".

**Building and taking apart dates:**
- \`DATE(year, month, day)\` builds a real date from parts — data lakes often store \`booking_yr\`, \`booking_mo\`, \`booking_dd\` separately.
- \`YEAR(d)\`, \`MONTH(d)\`, \`DAY(d)\` pull the parts back out (for grouping or checks).
- \`TEXT(d, "mmm-yy")\` turns a date into a **label** like "Mar-24".

**Common mistakes:**
- A subtraction shows as a weird date like 1/14/1900 → it is just formatted as a date. Switch the format to General ([[Ctrl+Shift+~]]): the answer is 14 days.
- TEXT returns **text**: great for titles and labels, useless for maths and it sorts alphabetically (Apr before Jan). Keep a real date column for calculations.
- Dates that arrive as text ("2024-03-15" left-aligned) will not subtract — convert them first (DATE or DATEVALUE).`,
      workbooks: () => [
        makeBook('Payments.xlsx', [
          {
            name: 'Payments',
            rows: [
              ['Loan ID', 'Due Date', 'Paid Date', 'Days Late', 'booking_yr', 'booking_mo', 'booking_dd', 'Booking Date', 'Due Year', 'Due Month', 'Period'],
              ...pays.map((p) => [p.id, p.due, p.paid, '', p.by, p.bm, p.bd]),
            ],
            widths: [100, 95, 95, 80, 85, 85, 85, 100, 75, 85, 75],
            formats: { 1: DATE_FMT, 2: DATE_FMT },
            freeze: true,
          },
        ]),
      ],
      start: { cell: 'B2' },
      tasks: [
        {
          id: 't1',
          title: 'Look under the hood',
          instruction: `Select **B2** (a due date) and press [[Ctrl+Shift+~]] (General format). You will see a 5-digit number — the date's serial. Then press [[Ctrl+Z]] to put the date format back.`,
          why: 'Once you have seen that a date is "just a number", everything else in this module is arithmetic. This is also how you diagnose a date column that will not calculate: if General shows text instead of a number, it is not a real date.',
          hints: ['Ctrl+Shift+~ applies the General number format.', 'Ctrl+Z undoes the format change.'],
          check: (c) =>
            !c.used('fmt.general') ? 'Press Ctrl+Shift+~ on B2 to see the serial number.' : /y/i.test(c.style('B2').fmt ?? '') ? true : 'Now press Ctrl+Z so B2 shows as a date again.',
          solution: [{ select: 'B2' }, { cmd: 'fmt.general' }, { cmd: 'edit.undo' }],
        },
        {
          id: 't2',
          title: 'Days late = paid − due',
          instruction: `In **D2** type \`=C2-B2\` and fill down to **D${PLAST}**. Negative numbers were paid early.`,
          why: 'Because both cells are serial numbers, subtraction gives a count of days. This exact pattern — later date minus earlier date — is behind days past due, days to maturity and settlement lags.',
          hints: ['Later date minus earlier date.', `=C2-B2, then select D2:D${PLAST} and Ctrl+D.`],
          check: (c) =>
            all(
              formulas(c, 'D', 2, PLAST, /C\d+\s*-\s*B\d+|DAYS\(/i, 'subtract the due date (B) from the paid date (C).'),
              valuesEqual(c, `D2:D${PLAST}`, pays.map((p) => p.late), 'Days Late'),
            ),
          solution: [{ set: { [`D2:D${PLAST}`]: '=C2-B2' } }],
        },
        {
          id: 't3',
          title: 'Build a date with DATE',
          instruction: `The lake stores the booking date in three columns. In **H2**: \`=DATE(E2,F2,G2)\`, fill down to H${PLAST}.`,
          why: 'Gluing the parts as text ("2021"&"/"&"7"&"/"&"4") gives text that may or may not be read as a date depending on regional settings — a US/UK day-month mix-up waiting to happen. DATE(year, month, day) is unambiguous and returns a real serial.',
          hints: ['DATE takes year, month, day — in that order.', `=DATE(E2,F2,G2)`],
          check: (c) => all(formulas(c, 'H', 2, PLAST, /DATE\(/i, 'use DATE(year, month, day).'), valuesEqual(c, `H2:H${PLAST}`, pays.map((p) => d(p.by, p.bm, p.bd)), 'Booking Date')),
          solution: [{ set: { [`H2:H${PLAST}`]: '=DATE(E2,F2,G2)' } }],
        },
        {
          id: 't4',
          title: 'Take a date apart: YEAR and MONTH',
          instruction: `In **I2** \`=YEAR(B2)\` and in **J2** \`=MONTH(B2)\`. Fill both down to row ${PLAST}.`,
          why: 'Year and month columns let you group, filter and SUMIFS by period. DAY(B2) works the same way when you need the day of the month (e.g. to check every payment is due on the 1st).',
          hints: ['YEAR and MONTH each take one date.', `Type both formulas, select I2:J${PLAST}, Ctrl+D.`],
          check: (c) =>
            all(
              formulas(c, 'I', 2, PLAST, /YEAR\(/i, 'use YEAR( ).'),
              formulas(c, 'J', 2, PLAST, /MONTH\(/i, 'use MONTH( ).'),
              valuesEqual(c, `I2:I${PLAST}`, pays.map((p) => ymd(p.due).y), 'Due Year'),
              valuesEqual(c, `J2:J${PLAST}`, pays.map((p) => ymd(p.due).m), 'Due Month'),
            ),
          solution: [{ set: { [`I2:I${PLAST}`]: '=YEAR(B2)', [`J2:J${PLAST}`]: '=MONTH(B2)' } }],
        },
        {
          id: 't5',
          title: 'A period label with TEXT',
          instruction: `In **K2**: \`=TEXT(B2,"mmm-yy")\`, fill down to K${PLAST}. You get labels like "Mar-24".`,
          why: 'Report headers and chart labels want "Mar-24", not 3/15/2024. But the result is text: it will not subtract, and sorting puts Apr-24 before Jan-24. Use TEXT for display; keep real dates (or a month-end date) for calculations and sorting.',
          hints: ['TEXT(value, format code) — the code goes in quotes.', 'mmm = short month name, yy = 2-digit year.', '=TEXT(B2,"mmm-yy")'],
          check: (c) => all(formulas(c, 'K', 2, PLAST, /TEXT\(/i, 'use TEXT( ).'), valuesEqual(c, `K2:K${PLAST}`, pays.map((p) => mmmyy(p.due)), 'Period')),
          solution: [{ set: { [`K2:K${PLAST}`]: '=TEXT(B2,"mmm-yy")' } }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm07-l2',
      title: 'Month-end & maturities: EOMONTH, EDATE',
      summary: 'Vintage month-ends, month starts, the reporting month-end from a run date, and maturity dates.',
      minutes: 11,
      featured: ['EOMONTH', 'EDATE'],
      intro: `Banks live by the **month-end**. Balances are reported "as of" the last day of the month, loans are grouped into origination **vintages** by month, and the reporting job usually runs a few days *into* the next month.

\`EOMONTH(date, months)\` returns the **last day of the month**, *months* away:
- \`EOMONTH(d, 0)\` → end of this month
- \`EOMONTH(d, -1)\` → end of last month (the month you are reporting on when you run on 9 July)
- \`EOMONTH(d, -1)+1\` → **first** day of this month
- \`EOMONTH(d, -12)\` → same month-end, one year earlier (for year-on-year)

\`EDATE(date, months)\` returns the **same day**, *months* later — maturities, reset dates, next payment dates: \`=EDATE(orig, term)\`. If the day does not exist (31 Jan + 1 month, or a 29 Feb origination + 3 years), EDATE uses the last day of that month instead.

**Why not just add 30 days?** Months are 28–31 days long, so "+30" drifts: after a year of +30s you are 5 days off. EDATE and EOMONTH follow the calendar.

**Common mistake:** hard-coding the report date in formulas. Put the run date in one input cell and derive everything else from it, so next month you change a single cell.`,
      workbooks: () => [
        makeBook('Loan_Maturities.xlsx', [
          {
            name: 'Loans',
            rows: [
              ['Loan ID', 'Product', 'Orig Date', 'Term (m)', 'Vintage (month-end)', 'Maturity Date', 'Month Start', 'Status', '', 'Run date', RUN_DATE],
              ...book.map((l, k) => [l.id, l.product, l.orig, l.term, '', '', '', '', '', k === 0 ? 'Reporting month-end' : k === 1 ? 'Same month-end last year' : '']),
            ],
            widths: [100, 110, 95, 70, 140, 110, 100, 80, 20, 170, 100],
            formats: { 2: DATE_FMT },
            freeze: true,
            styles: {
              ...fmtCol('E', 2, BLAST),
              ...fmtCol('F', 2, BLAST),
              ...fmtCol('G', 2, BLAST),
              K1: { fmt: DATE_FMT, fill: '#FFF2CC', b: true },
              K2: { fmt: DATE_FMT },
              K3: { fmt: DATE_FMT },
            },
          },
        ]),
      ],
      start: { cell: 'E2' },
      tasks: [
        {
          id: 't1',
          title: 'Vintage month-end with EOMONTH',
          instruction: `Group loans into origination vintages: in **E2** \`=EOMONTH(C2,0)\`, fill down to E${BLAST}.`,
          why: 'Every loan booked in, say, March 2019 gets the same vintage date 3/31/2019, so SUMIFS and pivots can group by it. Using a real month-end date (not a "Mar-19" text label) keeps it sortable and lets you compare it with other dates.',
          hints: ['0 months away = this month.', '=EOMONTH(C2,0)'],
          check: (c) => all(formulas(c, 'E', 2, BLAST, /EOMONTH\(/i, 'use EOMONTH( ).'), valuesEqual(c, `E2:E${BLAST}`, book.map((l) => eomonth(l.orig, 0)), 'Vintage')),
          solution: [{ set: { [`E2:E${BLAST}`]: '=EOMONTH(C2,0)' } }],
        },
        {
          id: 't2',
          title: 'Maturity date with EDATE',
          instruction: `Maturity = origination date + term in months. In **F2**: \`=EDATE(C2,D2)\`, fill down to F${BLAST}.

Find the loan originated on **2/29/2020** with a 36-month term — what maturity did EDATE give it?`,
          why: 'EDATE moves by calendar months, so a 60-month loan matures on the same day-of-month five years later. For the leap-day loan, 2/29/2023 does not exist, so EDATE returns the last day of February (2/28/2023) — exactly how most loan systems handle it. "+ term*30" would be days out.',
          hints: ['EDATE(start date, number of months).', 'The term is in column D.', '=EDATE(C2,D2)'],
          check: (c) => all(formulas(c, 'F', 2, BLAST, /EDATE\(/i, 'use EDATE( ).'), valuesEqual(c, `F2:F${BLAST}`, book.map((l) => edate(l.orig, l.term)), 'Maturity Date')),
          solution: [{ set: { [`F2:F${BLAST}`]: '=EDATE(C2,D2)' } }],
        },
        {
          id: 't3',
          title: 'First day of the month',
          instruction: `In **G2**: \`=EOMONTH(C2,-1)+1\` — the end of the *previous* month, plus one day. Fill down to G${BLAST}.`,
          why: 'There is no "BOMONTH" function, and this is the standard trick. You need month starts for period filters like ">="&start and "<="&end, which you will use with SUMIFS in the next module.',
          hints: ['-1 months = end of last month.', 'Add 1 day to land on the 1st.', '=EOMONTH(C2,-1)+1'],
          check: (c) => all(formulas(c, 'G', 2, BLAST, /EOMONTH\(/i, 'use EOMONTH( ) and add 1.'), valuesEqual(c, `G2:G${BLAST}`, book.map((l) => eomonth(l.orig, -1) + 1), 'Month Start')),
          solution: [{ set: { [`G2:G${BLAST}`]: '=EOMONTH(C2,-1)+1' } }],
        },
        {
          id: 't4',
          title: 'Reporting dates from the run date',
          instruction: `**K1** is the date the job runs (${'9 July 2024'}). Derive the reporting dates from it:
- **K2** (reporting month-end): \`=EOMONTH(K1,-1)\`
- **K3** (same month-end last year): \`=EOMONTH(K2,-12)\``,
          why: 'Month-end packs run in the first working days of the next month, so "the report date" is the end of the previous month. Deriving it from one input means the whole workbook rolls forward when you change K1 — no hunting for hard-coded dates.',
          hints: ['-1 = end of the previous month.', '-12 from the month-end = a year earlier.'],
          check: (c) =>
            all(
              c.f('K2').startsWith('=') && /EOMONTH\(/i.test(c.f('K2')) ? true : 'K2 should use EOMONTH on the run date.',
              c.f('K3').startsWith('=') && /EOMONTH\(|EDATE\(/i.test(c.f('K3')) ? true : 'K3 should be a formula (EOMONTH … -12).',
              c.v('K2') === REPORT_ME ? true : 'K2 should be 6/30/2024.',
              c.v('K3') === LY_ME ? true : 'K3 should be 6/30/2023.',
            ),
          solution: [{ set: { K2: '=EOMONTH(K1,-1)', K3: '=EOMONTH(K2,-12)' } }],
        },
        {
          id: 't5',
          title: 'Matured or active?',
          instruction: `In **H2**: \`=IF(F2<=$K$2,"Matured","Active")\`, fill down to H${BLAST}. Any "Matured" loan still carrying a balance on the tape is an exception to chase.`,
          why: 'Comparing two dates is comparing two numbers. Locking $K$2 means every row tests against the same reporting date. A matured loan that still shows a balance usually means a missed payoff, an extension that was not booked, or a data error — a classic month-end exception report.',
          hints: ['<= works on dates because they are numbers.', 'Lock the report date with $K$2.', '=IF(F2<=$K$2,"Matured","Active")'],
          check: (c) =>
            all(
              formulas(c, 'H', 2, BLAST, /\$K\$2/i, 'compare against the locked report date $K$2.'),
              valuesEqual(c, `H2:H${BLAST}`, book.map((l) => (edate(l.orig, l.term) <= REPORT_ME ? 'Matured' : 'Active')), 'Status'),
            ),
          solution: [{ set: { [`H2:H${BLAST}`]: '=IF(F2<=$K$2,"Matured","Active")' } }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm07-l3',
      title: 'Business days, loan age & days past due',
      summary: 'T+2 settlement with WORKDAY and a holiday list, working days per month, DATEDIF for tenure, and DPD from a report date.',
      minutes: 12,
      featured: ['WORKDAY', 'NETWORKDAYS', 'DATEDIF', 'MAX'],
      intro: `Markets and payment systems only move on **business days**.

- \`WORKDAY(start, n, holidays)\` → the date *n* business days after *start*, skipping weekends and any dates in *holidays*. Settlement: \`=WORKDAY(trade_date, 2, Holidays)\` for T+2. (US equities moved to T+1 in 2024; FX spot and many other markets are T+2 — same formula, different number.)
- \`NETWORKDAYS(start, end, holidays)\` → how many business days between two dates, **counting both ends**. Used for business days per month (daily averages, accrual checks, SLA tracking).

Keep holidays in **one list on its own sheet** and point every formula at it with absolute references. Forgetting the holiday argument is the classic mistake: Good Friday settlements land on a closed market.

**Age and arrears:**
- \`DATEDIF(start, end, "Y")\` → complete years; \`"M"\` → complete months. Loan age, customer tenure, time to maturity. (DATEDIF is an old "hidden" function — Excel will not autocomplete it, but it works.)
- **Days past due** = report date − oldest unpaid due date. If the due date is still in the future the loan is not late, so floor it at zero: \`=MAX(0, report − due)\`.`,
      workbooks: () => [
        makeBook('Ops_Calendar.xlsx', [
          {
            name: 'Trades',
            rows: [['Trade ID', 'Trade Date', 'Instrument', 'Side', 'Settle (T+2)'], ...tr.map((t) => [t.id, t.date, t.instrument, t.side])],
            widths: [80, 100, 150, 60, 110],
            formats: { 1: 'ddd m/d/yyyy' },
            freeze: true,
            styles: fmtCol('E', 2, TLAST, 'ddd m/d/yyyy'),
          },
          {
            name: 'Holidays',
            rows: [['Holiday', 'Name'], ...HOLS.map(([s, n]) => [s, n])],
            widths: [100, 200],
            formats: { 0: DATE_FMT },
          },
          {
            name: 'Calendar',
            rows: [['Month Start', 'Month End', 'Business Days'], ...CAL.map((m) => [m.start, m.end])],
            widths: [100, 100, 110],
            formats: { 0: DATE_FMT, 1: DATE_FMT },
          },
          {
            name: 'Collections',
            rows: [
              ['Loan ID', 'Orig Date', 'Oldest Unpaid Due', 'Age (years)', 'Age (months)', 'DPD', '', 'Report date', REPORT],
              ...coll.map((x) => [x.id, x.orig, x.due]),
            ],
            widths: [100, 95, 130, 85, 95, 60, 20, 100, 95],
            formats: { 1: DATE_FMT, 2: DATE_FMT },
            styles: { I1: { fmt: DATE_FMT, fill: '#FFF2CC', b: true } },
          },
        ]),
      ],
      start: { sheet: 'Trades', cell: 'E2' },
      tasks: [
        {
          id: 't1',
          title: 'T+2 settlement with WORKDAY',
          instruction: `On **Trades**, in **E2**: \`=WORKDAY(B2,2,Holidays!$A$2:$A$7)\`, fill down to E${TLAST}.

Check the trades from late March: Good Friday (3/29) and the weekend are skipped.`,
          why: 'Settlement dates drive cash forecasting and fails management. Plain B2+2 would settle Thursday trades on Saturday. The $ signs keep the holiday range fixed as you fill down — without them the range slides down and stops covering the holidays.',
          hints: ['WORKDAY(start, days, holidays).', 'The holiday dates are on the Holidays sheet in A2:A7.', '=WORKDAY(B2,2,Holidays!$A$2:$A$7)'],
          check: (c) =>
            all(
              formulas(c, 'E', 2, TLAST, /WORKDAY\(/i, 'use WORKDAY( ).', 'Trades!'),
              formulas(c, 'E', 2, TLAST, /Holidays!\$A\$2:\$A\$7/i, 'include the holiday list as Holidays!$A$2:$A$7 (locked).', 'Trades!'),
              valuesEqual(c, `Trades!E2:E${TLAST}`, settle, 'Settle (T+2)'),
            ),
          solution: [{ set: { [`Trades!E2:E${TLAST}`]: '=WORKDAY(B2,2,Holidays!$A$2:$A$7)' } }],
        },
        {
          id: 't2',
          title: 'Business days per month with NETWORKDAYS',
          instruction: `Go to the **Calendar** sheet. In **C2**: \`=NETWORKDAYS(A2,B2,Holidays!$A$2:$A$7)\`, fill down to C${CALLAST}.`,
          why: 'Average daily balances and volumes are divided by business days, not calendar days — and a month with a holiday has one fewer. NETWORKDAYS counts both the start and the end date, so a Monday-to-Friday week gives 5, not 4.',
          hints: ['NETWORKDAYS(start, end, holidays).', '=NETWORKDAYS(A2,B2,Holidays!$A$2:$A$7)'],
          check: (c) =>
            all(
              formulas(c, 'C', 2, CALLAST, /NETWORKDAYS\(/i, 'use NETWORKDAYS( ).', 'Calendar!'),
              formulas(c, 'C', 2, CALLAST, /Holidays!/i, 'include the holiday list.', 'Calendar!'),
              valuesEqual(c, `Calendar!C2:C${CALLAST}`, CAL.map((m) => networkdays(m.start, m.end, HOLSET)), 'Business Days'),
            ),
          solution: [{ sheetTab: 'Calendar' }, { set: { [`Calendar!C2:C${CALLAST}`]: '=NETWORKDAYS(A2,B2,Holidays!$A$2:$A$7)' } }],
        },
        {
          id: 't3',
          title: 'Loan age with DATEDIF',
          instruction: `Go to **Collections**. The report date is in **I1**.
- **D2**: \`=DATEDIF(B2,$I$1,"Y")\` — complete years
- **E2**: \`=DATEDIF(B2,$I$1,"M")\` — complete months

Fill both down to row ${CLAST}.`,
          why: 'Seasoning (loan age) is a key credit driver: most defaults happen in the first few years. DATEDIF counts *complete* units, so a loan 2 years and 11 months old is 2 years, not 3. Measuring "as of" the locked report date (not TODAY()) keeps the numbers reproducible when someone re-opens the file next week.',
          hints: ['DATEDIF(start, end, unit) — unit in quotes.', 'Start = Orig Date, end = $I$1.', 'Type both, select D2:E' + CLAST + ', Ctrl+D.'],
          check: (c) =>
            all(
              formulas(c, 'D', 2, CLAST, /DATEDIF\(/i, 'use DATEDIF( ).', 'Collections!'),
              formulas(c, 'E', 2, CLAST, /DATEDIF\(/i, 'use DATEDIF( ).', 'Collections!'),
              valuesEqual(c, `Collections!D2:D${CLAST}`, coll.map((x) => Math.floor(datedifM(x.orig, REPORT) / 12)), 'Age (years)'),
              valuesEqual(c, `Collections!E2:E${CLAST}`, coll.map((x) => datedifM(x.orig, REPORT)), 'Age (months)'),
            ),
          solution: [{ sheetTab: 'Collections' }, { set: { [`Collections!D2:D${CLAST}`]: '=DATEDIF(B2,$I$1,"Y")', [`Collections!E2:E${CLAST}`]: '=DATEDIF(B2,$I$1,"M")' } }],
        },
        {
          id: 't4',
          title: 'Days past due',
          instruction: `DPD = report date − oldest unpaid due date, but never below zero. In **F2**: \`=MAX(0,$I$1-C2)\`, fill down to F${CLAST}.`,
          why: 'Loans whose next due date is after the report date are current — plain subtraction would give them negative DPD, which then lands in the wrong bucket or drags down averages. MAX(0, …) floors it. DPD feeds the delinquency buckets you built with IFS in the logic module.',
          hints: ['Report date minus due date.', 'Wrap it in MAX(0, …).', '=MAX(0,$I$1-C2)'],
          check: (c) =>
            all(
              formulas(c, 'F', 2, CLAST, /\$I\$1/i, 'subtract from the locked report date $I$1.', 'Collections!'),
              valuesEqual(c, `Collections!F2:F${CLAST}`, coll.map((x) => Math.max(0, REPORT - x.due)), 'DPD'),
            ),
          solution: [{ set: { [`Collections!F2:F${CLAST}`]: '=MAX(0,$I$1-C2)' } }],
        },
      ],
    },
  ],
  quiz: [
    {
      kind: 'mc',
      q: 'Why does =C2-B2 give the number of days between two dates?',
      options: ['Excel has a special date-subtraction mode', 'Dates are stored as serial numbers (days since 1900), so it is ordinary subtraction', 'It only works if both cells are formatted the same', 'It does not — you must use DATEDIF'],
      answer: 1,
      explain: 'A date is a number with a date format on top. Subtracting two serials gives a count of days.',
    },
    {
      kind: 'formula',
      q: 'A2 holds 3/15/2024. Return the last day of that month.',
      grid: [['Date'], [d(2024, 3, 15)]],
      at: 'B2',
      expect: d(2024, 3, 31),
      model: '=EOMONTH(A2,0)',
      explain: 'EOMONTH(date, 0) = end of the same month. (The answer is shown as a serial number until you format it as a date.)',
      mustUse: ['EOMONTH'],
    },
    {
      kind: 'formula',
      q: 'A loan originated on 2/29/2020 (A2) with a 36-month term (B2). Return its maturity date.',
      grid: [
        ['Orig', 'Term'],
        [d(2020, 2, 29), 36],
      ],
      at: 'C2',
      expect: d(2023, 2, 28),
      model: '=EDATE(A2,B2)',
      explain: '2/29/2023 does not exist, so EDATE returns the last day of February 2023.',
      mustUse: ['EDATE'],
    },
    {
      kind: 'formula',
      q: 'Return a label like "Mar-24" for the date in A2.',
      grid: [['Date'], [d(2024, 3, 15)]],
      at: 'B2',
      expect: 'Mar-24',
      model: '=TEXT(A2,"mmm-yy")',
      explain: 'TEXT(value, format) returns text — fine for labels, not for maths.',
      mustUse: ['TEXT'],
    },
    {
      kind: 'formula',
      q: 'Trade date Thursday 3/28/2024 is in A2; B2 holds the Good Friday holiday. Return the T+2 settlement date.',
      grid: [
        ['Trade Date', 'Holiday'],
        [d(2024, 3, 28), d(2024, 3, 29)],
      ],
      at: 'C2',
      expect: d(2024, 4, 2),
      model: '=WORKDAY(A2,2,B2)',
      explain: 'Skip Friday (holiday), Saturday and Sunday: Monday is T+1, Tuesday 4/2 is T+2.',
      mustUse: ['WORKDAY'],
    },
    {
      kind: 'formula',
      q: 'Loan originated 8/15/2019 (A2); report date 6/30/2024 (B2). How many complete years old is it?',
      grid: [
        ['Orig', 'Report'],
        [d(2019, 8, 15), d(2024, 6, 30)],
      ],
      at: 'C2',
      expect: 4,
      model: '=DATEDIF(A2,B2,"Y")',
      explain: 'DATEDIF counts complete years: 4 years and about 10 months → 4.',
      mustUse: ['DATEDIF'],
    },
    {
      kind: 'mc',
      q: 'What does =EOMONTH(A2,-1)+1 return?',
      options: ['The last day of the previous month', 'The first day of the month A2 is in', 'One month after A2', 'The first day of next month'],
      answer: 1,
      explain: 'End of last month plus one day = the 1st of this month.',
    },
    {
      kind: 'mc',
      q: 'You label months with =TEXT(date,"mmm-yy") and sort by that column. What goes wrong?',
      options: ['Nothing', 'It sorts alphabetically (Apr-24 before Jan-24), because the result is text', 'Excel shows #VALUE!', 'The dates change'],
      answer: 1,
      explain: 'TEXT output is text. Sort and calculate on a real date (e.g. the month-end) and use TEXT only for display.',
    },
    { kind: 'keys', q: "Stamp today's date into the cell as a fixed value (it will not change tomorrow).", cmd: 'edit.insertDate', keys: 'Ctrl+;', explain: 'Ctrl+; enters a static date — unlike =TODAY(), which changes every day.' },
    { kind: 'keys', q: 'Show the selected cells as plain numbers (General) to see the serial behind a date.', cmd: 'fmt.general', keys: 'Ctrl+Shift+~', explain: 'General format reveals the serial number — the fastest test of whether a "date" is real.' },
  ],
};
