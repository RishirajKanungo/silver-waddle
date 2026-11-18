import type { Lesson, CheckCtx } from '../types';
import { makeBook, customers, loans, REGIONS, d } from '../data';
import { all, approx, fmtScalar, formulasMatch, valuesEqual } from '../runner';
import { dateToSerial, ymd } from '../../engine/format';

// ---------------------------------------------------------------------------
// Data: a customer master (read-only, owned by the CRM team) and an 80-loan
// month-end tape pulled from the lending data mart. Two loans belong to
// customers onboarded after the master snapshot was taken -> they will NOT be
// found by the lookup (planted on purpose, it is the #1 real-world surprise).
// ---------------------------------------------------------------------------

const CUSTS = customers(60, 107);
const LOANS = loans(CUSTS, 80, 211).map((l, i) => (i === 17 ? { ...l, cust: 'C20003' } : i === 52 ? { ...l, cust: 'C20011' } : l));
const N = LOANS.length; // 80 -> rows 2..81
const LAST = N + 1;
const STATUSES = ['Current', 'Delinquent', 'Non-Accrual'] as const;
const SUM_REGIONS = [...REGIONS, 'Unmapped'];

const custById = new Map(CUSTS.map((c) => [c.id, c]));
const regionOf = (id: string) => custById.get(id)?.region ?? 'Unmapped';
const segmentOf = (id: string) => custById.get(id)?.segment ?? 'Unmapped';
const UNMAPPED_ROWS = LOANS.map((l, i) => (custById.has(l.cust) ? -1 : i + 2)).filter((r) => r > 0);

const eom = (serial: number) => {
  const { y, m } = ymd(serial);
  return dateToSerial(y, m + 1, 0);
};
const bucket = (dpd: number) => (dpd === 0 ? 'Current' : dpd < 30 ? '1-29' : dpd < 90 ? '30-89' : '90+');

const EXP_REGION = LOANS.map((l) => regionOf(l.cust));
const EXP_SEGMENT = LOANS.map((l) => segmentOf(l.cust));
const EXP_VINTAGE = LOANS.map((l) => eom(l.orig));
const EXP_BUCKET = LOANS.map((l) => bucket(l.dpd));
const GRID = SUM_REGIONS.map((reg) => STATUSES.map((st) => LOANS.filter((l) => regionOf(l.cust) === reg && l.status === st).reduce((a, l) => a + l.balance, 0)));
const ROW_TOT = GRID.map((r) => r.reduce((a, b) => a + b, 0));
const COL_TOT = STATUSES.map((_, j) => GRID.reduce((a, r) => a + r[j], 0));
const TAPE_TOTAL = LOANS.reduce((a, l) => a + l.balance, 0);

const COLS = ['B', 'C', 'D'];

const tapeBook = () =>
  makeBook('Loan_Tape.xlsx', [
    {
      name: 'Tape',
      rows: [
        ['Loan ID', 'Customer ID', 'Product', 'Orig Date', 'Balance', 'DPD', 'Status'],
        ...LOANS.map((l) => [l.id, l.cust, l.product, l.orig, l.balance, l.dpd, l.status]),
      ],
      widths: [100, 100, 110, 90, 110, 60, 100, 100, 110, 90, 90],
      formats: { 3: 'm/d/yyyy', 4: '#,##0.00' },
    },
    {
      name: 'Summary',
      header: false,
      rows: [
        ['Month-End Loan Book: Balance by Region & Status'],
        ['As of', d(2024, 12, 31)],
        [],
        ['Region', 'Current', 'Delinquent', 'Non-Accrual', 'Total'],
        ...SUM_REGIONS.map((r) => [r]),
        ['Total'],
        [],
        ['Control total (Tape)'],
        ['Difference'],
      ],
      widths: [170, 120, 120, 120, 130],
      styles: { A1: { b: true }, B2: { fmt: 'd-mmm-yy', align: 'left' } },
    },
  ]);

const masterBook = () =>
  makeBook('Customer_Master.xlsx', [
    {
      name: 'Customers',
      rows: [['Customer ID', 'Name', 'Segment', 'Region', 'Rating', 'Branch'], ...CUSTS.map((c) => [c.id, c.name, c.segment, c.region, c.rating, c.branch])],
      widths: [100, 170, 120, 100, 70, 80],
      freeze: true,
    },
  ]);

const headerIs = (c: CheckCtx, ref: string, name: string) =>
  String(c.v(ref) ?? '').trim().toLowerCase() === name.toLowerCase() ? true : `Give the new column a header: ${ref} should read "${name}".`;

const refsMaster = (c: CheckCtx, ref: string) => {
  const bad = c.inputs(ref).findIndex((x) => !/customer_master/i.test(x));
  return bad < 0 ? true : `The formulas in ${ref} should look up into [Customer_Master.xlsx] (cell #${bad + 1} doesn't).`;
};

export const project: Lesson = {
  id: 'p1-loan-book',
  kind: 'project',
  title: 'Month-End Loan Book Report',
  summary: 'Enrich a loan tape from the customer master, bucket arrears, build a region × status summary and tie it out.',
  minutes: 35,
  featured: ['VLOOKUP', 'IFERROR', 'EOMONTH', 'IF', 'SUMIFS', 'SUM', 'Alt W F F', 'Ctrl+B'],
  intro: `**From:** Dana Whitfield, Head of Credit Reporting
**To:** you
**Subject:** Month-end loan book — need it by 10am

Morning! December month-end (and year-end) closed overnight. Two files are open for you:

- **Loan_Tape.xlsx** — the loan-level tape from the lending mart (80 loans). It has no region or segment on it, because that lives in the CRM.
- **Customer_Master.xlsx** — the CRM snapshot. **Read-only**: it belongs to the CRM team, don't touch it.

What I need for the 10am credit committee pack:

- Region and Segment on every loan (pulled from the master — no copy-paste, I want to be able to refresh it next month).
- A **Vintage** column (origination month-end) and a **DPD bucket** column.
- The **Summary** tab filled in: balance by region × status, with totals.
- A tie-out of the summary back to the tape. If it doesn't tie, it doesn't go out.
- Make it presentable: number formats, bold headers, frozen panes.

**What "done" looks like:** every loan has a region (or is clearly marked as unmapped), the Summary total equals the tape total to the cent, and the difference cell shows **0**.

*Tip: switch between workbooks with [[Ctrl+Tab]], and between tabs with [[Ctrl+PgDn]] / [[Ctrl+PgUp]].*`,
  workbooks: () => [tapeBook(), masterBook()],
  readOnly: ['Customer_Master.xlsx'],
  start: { book: 'Loan_Tape.xlsx', sheet: 'Tape', cell: 'H1' },
  tasks: [
    {
      id: 't1',
      title: 'Pull Region from the customer master',
      instruction: `On the **Tape** sheet, type the header \`Region\` in **H1**. In **H2** write a VLOOKUP that finds the loan's Customer ID (column B) in **[Customer_Master.xlsx]Customers** and returns the **Region** (the 4th column of A:F), exact match. Fill it down to **H${LAST}**.

Don't worry if a couple of rows show \`#N/A\` — we deal with them next.`,
      why: `This is *the* everyday analyst move: the tape knows the loan, the master knows the customer, and the Customer ID is the bridge. Writing the lookup (instead of pasting values) means next month you just refresh.

- Lock the table with **$** (\`$A:$F\`) so it doesn't slide when you fill down.
- Always use **FALSE** (exact match) for IDs. TRUE/omitted does an approximate match that silently returns the *wrong customer* on unsorted data.
- The cleanest way to build the reference: type \`=VLOOKUP(B2,\`, then [[Ctrl+Tab]] to the master and select columns A:F with the mouse — Excel writes the \`[Customer_Master.xlsx]Customers!\` part for you.`,
      hints: [
        'The lookup value is B2 (Customer ID). The table lives in the other workbook.',
        'Region is the 4th column of Customers!A:F (ID, Name, Segment, Region…).',
        'Type the formula in H2, then double-click the fill handle or select H2:H81 and press Ctrl+D.',
        `=VLOOKUP(B2,[Customer_Master.xlsx]Customers!$A:$F,4,FALSE)`,
      ],
      check: (c) => {
        const h = headerIs(c, 'Tape!H1', 'Region');
        if (h !== true) return h;
        const f = formulasMatch(c, `Tape!H2:H${LAST}`, /(VLOOKUP|XLOOKUP|INDEX)\(/i, 'lookup (VLOOKUP)');
        if (f !== true) return f;
        const r = refsMaster(c, `Tape!H2:H${LAST}`);
        if (r !== true) return r;
        const got = c.list(`Tape!H2:H${LAST}`);
        for (let i = 0; i < N; i++) {
          if (UNMAPPED_ROWS.includes(i + 2)) continue;
          if (String(got[i]).toLowerCase() !== EXP_REGION[i].toLowerCase())
            return `H${i + 2} shows ${fmtScalar(got[i])} but customer ${LOANS[i].cust} is in ${EXP_REGION[i]}. Check the column number (4) and the FALSE at the end.`;
        }
        return true;
      },
      solution: [{ set: { 'Tape!H1': 'Region', [`Tape!H2:H${LAST}`]: '=VLOOKUP(B2,[Customer_Master.xlsx]Customers!$A:$F,4,FALSE)' } }],
      xp: 30,
    },
    {
      id: 't2',
      title: 'Handle the unmapped loans, add Segment',
      instruction: `${UNMAPPED_ROWS.length} loans (rows ${UNMAPPED_ROWS.join(' and ')}) show \`#N/A\`: their customers were onboarded after the CRM snapshot. Wrap the Region lookup in **IFERROR** so they read \`Unmapped\` instead.

Then add a **Segment** column: header \`Segment\` in **I1**, and in **I2:I${LAST}** the same kind of lookup returning the **3rd** column, also wrapped so missing customers show \`Unmapped\`.`,
      why: `An #N/A is information — it tells you the master is stale — but left raw it poisons every SUM and SUMIFS downstream. Converting it to a clear label keeps the money in the report *and* makes the gap visible so you can footnote it ("2 loans pending CRM onboarding").

Before you blanket-wrap anything in IFERROR, always look at *why* it errors first. IFERROR also hides genuine mistakes like a wrong column number.`,
      hints: [
        'IFERROR(value, value_if_error) — your VLOOKUP goes in the first argument.',
        '=IFERROR(VLOOKUP(B2,[Customer_Master.xlsx]Customers!$A:$F,4,FALSE),"Unmapped")',
        'For Segment change the column number from 4 to 3.',
      ],
      check: (c) =>
        all(
          headerIs(c, 'Tape!I1', 'Segment'),
          valuesEqual(c, `Tape!H2:H${LAST}`, EXP_REGION, 'Region'),
          valuesEqual(c, `Tape!I2:I${LAST}`, EXP_SEGMENT, 'Segment'),
          formulasMatch(c, `Tape!H2:H${LAST}`, /(IFERROR|IFNA|XLOOKUP)\(/i, 'IFERROR-wrapped lookup'),
          formulasMatch(c, `Tape!I2:I${LAST}`, /(VLOOKUP|XLOOKUP|INDEX)\(/i, 'lookup'),
          refsMaster(c, `Tape!I2:I${LAST}`),
        ),
      solution: [
        {
          set: {
            [`Tape!H2:H${LAST}`]: '=IFERROR(VLOOKUP(B2,[Customer_Master.xlsx]Customers!$A:$F,4,FALSE),"Unmapped")',
            'Tape!I1': 'Segment',
            [`Tape!I2:I${LAST}`]: '=IFERROR(VLOOKUP(B2,[Customer_Master.xlsx]Customers!$A:$F,3,FALSE),"Unmapped")',
          },
        },
      ],
      xp: 30,
    },
    {
      id: 't3',
      title: 'Vintage = origination month-end',
      instruction: `Header \`Vintage\` in **J1**. In **J2:J${LAST}** use **EOMONTH** to turn each Orig Date (column D) into the last day of its month.`,
      why: `Credit teams group loans by **vintage** — the month they were booked — to compare how each cohort performs. Month-ends are the standard key because every reporting system agrees on them (no arguing over the 1st vs the 15th).

\`EOMONTH(date, 0)\` = end of the same month; \`EOMONTH(date, -1)\` = end of the previous month (handy for "prior month-end" columns). If you see a 5-digit number instead of a date, it's just unformatted — dates are numbers underneath.`,
      hints: ['EOMONTH(start_date, months) — months = 0 means "this month".', `=EOMONTH(D2,0) filled down to J${LAST}.`],
      check: (c) =>
        all(
          headerIs(c, 'Tape!J1', 'Vintage'),
          formulasMatch(c, `Tape!J2:J${LAST}`, /EOMONTH\(/i, 'EOMONTH'),
          valuesEqual(c, `Tape!J2:J${LAST}`, EXP_VINTAGE, 'Vintage'),
        ),
      solution: [{ set: { 'Tape!J1': 'Vintage', [`Tape!J2:J${LAST}`]: '=EOMONTH(D2,0)' } }],
      xp: 20,
    },
    {
      id: 't4',
      title: 'DPD bucket',
      instruction: `Header \`DPD Bucket\` in **K1**. In **K2:K${LAST}** classify the Days Past Due (column F):

- 0 → \`Current\`
- 1–29 → \`1-29\`
- 30–89 → \`30-89\`
- 90 or more → \`90+\``,
      why: `Regulators and credit committees never look at raw DPD — they look at **buckets**, because the risk jumps at the 30 and 90 day thresholds (90+ usually means non-accrual / default).

Nested IF reads top-down and stops at the first TRUE, so order the tests from smallest to largest. An alternative that scales better is an approximate-match lookup against a small bucket table — you'll use that pattern in the FX project.`,
      hints: [
        'Start with =IF(F2=0,"Current", … ) and nest the next test in the "else" part.',
        'Because the IF stops at the first TRUE, the second test only needs F2<30.',
        '=IF(F2=0,"Current",IF(F2<30,"1-29",IF(F2<90,"30-89","90+")))',
      ],
      check: (c) =>
        all(
          headerIs(c, 'Tape!K1', 'DPD Bucket'),
          formulasMatch(c, `Tape!K2:K${LAST}`, /(IF|IFS|LOOKUP|VLOOKUP|XLOOKUP|SWITCH)\(/i, 'IF / lookup'),
          valuesEqual(c, `Tape!K2:K${LAST}`, EXP_BUCKET, 'DPD Bucket'),
        ),
      solution: [{ set: { 'Tape!K1': 'DPD Bucket', [`Tape!K2:K${LAST}`]: '=IF(F2=0,"Current",IF(F2<30,"1-29",IF(F2<90,"30-89","90+")))' } }],
      xp: 25,
    },
    {
      id: 't5',
      title: 'Summary: balance by region × status',
      instruction: `Go to the **Summary** tab. Fill **B5:D10** with one SUMIFS formula that adds the Tape **Balance** (E) where the Tape **Region** (H) equals the row label in column A *and* the Tape **Status** (G) equals the column header in row 4.

Write it once in B5 with the right **$** anchors, then copy it across the whole block.`,
      why: `SUMIFS is how analysts build a cross-tab that stays live. The trick is **mixed references**:

- \`$A5\` — column locked, row free: every column reads the region from A.
- \`B$4\` — row locked, column free: every row reads the status from row 4.
- \`Tape!$E:$E\` — fully locked: the data never moves.

One formula, copied into 18 cells, no edits. If you find yourself retyping a formula per cell, your anchors are wrong.`,
      hints: [
        'SUMIFS(sum_range, criteria_range1, criteria1, criteria_range2, criteria2)',
        'Sum range = Tape!$E:$E. Region criteria = Tape!$H:$H with $A5. Status criteria = Tape!$G:$G with B$4.',
        '=SUMIFS(Tape!$E:$E,Tape!$H:$H,$A5,Tape!$G:$G,B$4) — then copy B5 to B5:D10.',
      ],
      check: (c) => {
        for (let j = 0; j < 3; j++) {
          const col = COLS[j];
          const f = formulasMatch(c, `Summary!${col}5:${col}10`, /SUMIFS\(/i, 'SUMIFS');
          if (f !== true) return f;
          const v = valuesEqual(c, `Summary!${col}5:${col}10`, GRID.map((r) => r[j]), STATUSES[j]);
          if (v !== true) return v + ' Check your $ anchors ($A5 and B$4).';
        }
        return /tape!/i.test(c.f('Summary!B5')) ? true : 'B5 should sum data on the Tape sheet.';
      },
      solution: [{ set: { 'Summary!B5:D10': '=SUMIFS(Tape!$E:$E,Tape!$H:$H,$A5,Tape!$G:$G,B$4)' } }],
      xp: 40,
    },
    {
      id: 't6',
      title: 'Row and column totals',
      instruction: `Still on **Summary**: put row totals in **E5:E10** and column totals in **B11:E11** (row 11 is "Total").`,
      why: `Totals both ways are your first sanity check: the bottom-right cell must be the same whether you add across or down. [[Alt+=]] (AutoSum) on a selected block writes all of them in one go.`,
      hints: ['Select B5:E11 and press Alt+= — AutoSum fills the empty total row and column.', 'Or: E5 =SUM(B5:D5) filled down, B11 =SUM(B5:B10) filled right to E11.'],
      check: (c) =>
        all(
          formulasMatch(c, 'Summary!E5:E10', /SUM\(/i, 'SUM'),
          formulasMatch(c, 'Summary!B11:E11', /SUM\(/i, 'SUM'),
          valuesEqual(c, 'Summary!E5:E10', ROW_TOT, 'Row totals'),
          valuesEqual(c, 'Summary!B11:E11', [...COL_TOT, TAPE_TOTAL], 'Column totals'),
        ),
      solution: [{ set: { 'Summary!E5:E10': '=SUM(B5:D5)', 'Summary!B11:E11': '=SUM(B5:B10)' } }],
      xp: 20,
    },
    {
      id: 't7',
      title: 'Tie out to the tape',
      instruction: `Prove the summary is complete. In **Summary!B13** sum the **Balance** column straight from the Tape sheet. In **B14** compute the difference between the summary grand total (**E11**) and B13. It must be **0**.`,
      why: `A **control total** is a number computed independently of your report logic. If your SUMIFS missed a region (say the "Unmapped" loans), the summary would be short and nobody would notice — until audit does.

Banks call this a **tie-out** or **reconciliation to source**. Get in the habit: every summary you send has a check cell that should be zero.`,
      hints: ['B13: =SUM(Tape!E:E) — the header is text so SUM ignores it.', 'B14: =E11-B13'],
      check: (c) => {
        if (!/tape!/i.test(c.f('Summary!B13'))) return 'B13 should be a SUM straight from the Tape sheet (e.g. =SUM(Tape!E:E)).';
        if (!approx(c.v('Summary!B13'), TAPE_TOTAL, 1e-9)) return `B13 shows ${fmtScalar(c.v('Summary!B13'))} — it should be the tape's total balance.`;
        if (!c.f('Summary!B14').startsWith('=')) return 'B14 should be a formula: =E11-B13.';
        const v = c.v('Summary!B14');
        return typeof v === 'number' && Math.abs(v) < 0.005 ? true : `B14 shows ${fmtScalar(v)} — the summary doesn't tie. Did the Unmapped row get included?`;
      },
      solution: [{ set: { 'Summary!B13': '=SUM(Tape!E:E)', 'Summary!B14': '=E11-B13' } }],
      xp: 30,
    },
    {
      id: 't8',
      title: 'Make the Summary presentable',
      instruction: `On **Summary**:

- Bold the header row **A4:E4** and the total row **A11:E11** ([[Ctrl+B]]).
- Give the numbers **B5:E11** and **B13:B14** a thousands-separator format — Comma Style ([[Alt]] [[H]] [[K]]) or [[Ctrl+Shift+!]].`,
      why: `Committee members read numbers like \`1234567.891\` as noise. \`1,234,567.89\` is instantly readable. Bold headers and totals give the eye anchors. This is 30 seconds of work that decides whether your report looks trustworthy.`,
      hints: ['Select A4:E4, Ctrl+B. Then A11:E11, Ctrl+B.', 'Select B5:E11, then Alt H K (Comma Style). Repeat for B13:B14.'],
      check: (c) => {
        for (const col of ['A', 'B', 'C', 'D', 'E']) {
          if (!c.style(`Summary!${col}4`).b) return `${col}4 should be bold (header row).`;
          if (!c.style(`Summary!${col}11`).b) return `${col}11 should be bold (total row).`;
        }
        const cells = [...['B', 'C', 'D', 'E'].flatMap((col) => [5, 6, 7, 8, 9, 10, 11].map((r) => `${col}${r}`)), 'B13', 'B14'];
        const bad = cells.find((a) => !/#,##0/.test(c.style(`Summary!${a}`).fmt ?? ''));
        return bad ? `${bad} needs a thousands-separator number format (Comma Style).` : true;
      },
      solution: [
        { select: 'Summary!A4:E4' },
        { cmd: 'fmt.bold' },
        { select: 'Summary!A11:E11' },
        { cmd: 'fmt.bold' },
        { select: 'Summary!B5:E11' },
        { cmd: 'fmt.comma' },
        { select: 'Summary!B13:B14' },
        { cmd: 'fmt.comma' },
      ],
      xp: 20,
    },
    {
      id: 't9',
      title: 'Polish the tape: headers + freeze panes',
      instruction: `Back on **Tape**: bold your new headers **H1:K1**, then click **B2** and freeze panes ([[Alt]] [[W]] [[F]] [[F]]) so the header row *and* the Loan ID column stay visible while scrolling.`,
      why: `Freeze Panes freezes everything **above and to the left** of the active cell. From B2 that's row 1 (headers) and column A (the key). Whoever reviews your tape can scroll to row 80 or column K and still know which loan and which field they're looking at.`,
      hints: ['Select H1:K1 and press Ctrl+B.', 'Click B2 (not A1!) then Alt, W, F, F.'],
      check: (c) => {
        for (const col of ['H', 'I', 'J', 'K']) if (!c.style(`Tape!${col}1`).b) return `${col}1 should be bold like the other headers.`;
        const fz = c.sheet('Tape')?.freeze;
        if (!fz || (!fz.rows && !fz.cols)) return 'Freeze panes on the Tape sheet with B2 selected.';
        return fz.rows === 1 && fz.cols === 1 ? true : `Panes are frozen at ${fz.rows} row(s) / ${fz.cols} column(s) — select B2 first so exactly row 1 and column A freeze.`;
      },
      solution: [{ select: 'Tape!H1:K1' }, { cmd: 'fmt.bold' }, { select: 'Tape!B2' }, { cmd: 'view.freezePanes' }],
      xp: 20,
    },
  ],
};
