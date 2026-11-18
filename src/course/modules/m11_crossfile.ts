import type { CheckCtx, Module } from '../types';
import type { Scalar } from '../../engine/types';
import { ERR, XLError } from '../../engine/types';
import { addrToA1, parseRange } from '../../engine/refs';
import { makeBook, customers, loans, rng, pick, round2, d, FX_RATES, type Cellish } from '../data';
import { all, approx, fmtScalar, formulasMatch } from '../runner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compare a single-column range with expected values. Errors compare by code. */
function colEquals(c: CheckCtx, ref: string, exp: Scalar[], label: string, tol = 0.0005): true | string {
  const got = c.list(ref);
  const r = parseRange(ref.replace(/^.*!/, ''))!;
  const vertical = r.r1 !== r.r2;
  for (let i = 0; i < exp.length; i++) {
    const e = exp[i], g = got[i];
    let ok: boolean;
    if (e instanceof XLError) ok = g instanceof XLError && g.code === e.code;
    else if (typeof e === 'number') ok = approx(g, e, tol);
    else if (typeof e === 'string') ok = typeof g === 'string' && g.trim().toLowerCase() === e.toLowerCase();
    else if (typeof e === 'boolean') ok = g === e;
    else ok = g === null || g === '';
    if (!ok) {
      const cell = addrToA1(vertical ? r.r1 + i : r.r1, vertical ? r.c1 : r.c1 + i);
      return `${label}: ${cell} shows ${fmtScalar(g)} but should be ${fmtScalar(e)}.`;
    }
  }
  return true;
}

function layout(blocks: { at: string; rows: Cellish[][] }[]): Cellish[][] {
  const out: Cellish[][] = [];
  for (const b of blocks) {
    const m = /^([A-Z]+)(\d+)$/.exec(b.at)!;
    let c0 = 0;
    for (const ch of m[1]) c0 = c0 * 26 + ch.charCodeAt(0) - 64;
    c0 -= 1;
    const r0 = Number(m[2]) - 1;
    b.rows.forEach((row, i) => {
      const rr = (out[r0 + i] ??= []);
      row.forEach((v, j) => (rr[c0 + j] = v));
    });
  }
  for (let i = 0; i < out.length; i++) {
    out[i] ??= [];
    for (let j = 0; j < out[i].length; j++) if (out[i][j] === undefined) out[i][j] = null;
  }
  return out;
}

const HDR = { b: true, fill: '#DDEBF7', border: { b: true } } as const;
const hdr = (cells: string[]) => Object.fromEntries(cells.map((a) => [a, { ...HDR }]));

const MASTER_REF = /\[Customer_Master\.xlsx\]/i;
const TAPE_REF = /\[Loan_Tape\.xlsx\]/i;
const FX_REF = /\[FX_Rates\.xlsx\]/i;

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const CUST = customers(60, 7);
const LOANS = loans(CUST, 120, 11);

// ---- Lesson 1: month-end pack across sheets ----
const COA: [number, string, string][] = [
  [10100, 'Cash & Due from Banks', 'Assets'],
  [12000, 'Loans Held for Investment', 'Assets'],
  [12500, 'Allowance for Credit Losses', 'Assets'],
  [15000, 'Premises & Equipment', 'Assets'],
  [20100, 'Demand Deposits', 'Liabilities'],
  [20200, 'Savings Deposits', 'Liabilities'],
  [20300, 'Time Deposits', 'Liabilities'],
  [40100, 'Interest Income - Loans', 'Income'],
  [40200, 'Interest Income - Securities', 'Income'],
  [50100, 'Interest Expense - Deposits', 'Expense'],
  [60100, 'Salaries & Benefits', 'Expense'],
  [61000, 'Provision for Credit Losses', 'Expense'],
];
const AS_OF = d(2024, 6, 30);
const GL = (() => {
  const r = rng(131);
  const ccs = [1100, 1200, 1300, 1400, 2100, 2200];
  const lines: { acct: number; desc: string; amount: number; cc: number }[] = [];
  for (let i = 0; i < 38; i++) {
    const [acct, name] = i < COA.length ? COA[i] : pick(r, COA);
    lines.push({ acct, desc: `${name} – JE ${24600 + i}`, amount: round2((r() - 0.25) * 400000), cc: pick(r, ccs) });
  }
  // Two postings to an unmapped suspense account: the tie-out will catch them.
  lines.splice(17, 0, { acct: 99999, desc: 'Suspense – unallocated wire', amount: 18250.4, cc: 2100 });
  lines.splice(31, 0, { acct: 99999, desc: 'Suspense – FX true-up', amount: -3120.15, cc: 1300 });
  return lines;
})();
const GL_FIRST = 4;
const GL_LAST = GL_FIRST + GL.length - 1;
const glSum = (acct: number) => round2(GL.filter((g) => g.acct === acct).reduce((a, g) => a + g.amount, 0));
const GL_TOTAL = GL.reduce((a, g) => a + g.amount, 0);
const MAPPED_TOTAL = COA.reduce((a, [acct]) => a + glSum(acct), 0);
const SUSPENSE = round2(GL_TOTAL - MAPPED_TOTAL);

// ---- Lesson 2: tape + customer master in two files ----
const TAPE2 = LOANS.slice(0, 40);
const NEW_CUSTOMERS = new Set([TAPE2[5].cust, TAPE2[17].cust, TAPE2[33].cust].filter((id) => id !== TAPE2[0].cust));
const MASTER2 = CUST.filter((c) => !NEW_CUSTOMERS.has(c.id));
const M_END = MASTER2.length + 1;
const m2 = (id: string) => MASTER2.find((c) => c.id === id);
const L2_MISSING = TAPE2.filter((l) => !m2(l.cust)).length;

function customerMasterBook() {
  return makeBook('Customer_Master.xlsx', [
    {
      name: 'Accounts',
      rows: [['Customer ID', 'Name', 'Segment', 'Region', 'Rating', 'Branch'], ...MASTER2.map((c) => [c.id, c.name, c.segment, c.region, c.rating, c.branch])],
      widths: [95, 150, 110, 90, 60, 70],
      freeze: true,
    },
    { name: 'ReadMe', rows: [['Extract'], ['dl_prod.customer_master — snapshot taken yesterday 23:00. Do not edit.']], widths: [520] },
  ]);
}

// ---- Lessons 3 & 4: multi-currency loan tape + FX rates ----
const FX = new Map(FX_RATES);
const CCYS = FX_RATES.map((x) => x[0]);
const TAPE3 = (() => {
  const r = rng(101);
  return LOANS.slice(0, 60).map((l) => {
    const ccy = r() < 0.45 ? 'USD' : pick(r, CCYS.slice(1));
    return { ...l, ccy, local: round2(l.balance / FX.get(ccy)!) };
  });
})();
const T_END = TAPE3.length + 1;
const R3 = Array.from({ length: 20 }, (_, i) => TAPE3[i * 3]);
const localByCcy = (ccy: string) => round2(TAPE3.filter((t) => t.ccy === ccy).reduce((a, t) => a + t.local, 0));

function loanTapeBook() {
  return makeBook('Loan_Tape.xlsx', [
    {
      name: 'Tape',
      rows: [
        ['Loan ID', 'Customer ID', 'Branch', 'Product', 'Currency', 'Balance (Local)'],
        ...TAPE3.map((t) => [t.id, t.cust, t.branch, t.product, t.ccy, t.local]),
      ],
      widths: [90, 95, 70, 110, 70, 130],
      formats: { 5: '#,##0.00' },
      freeze: true,
    },
  ]);
}
function fxBook() {
  return makeBook('FX_Rates.xlsx', [
    {
      name: 'Rates',
      rows: [['Currency', 'USD per unit', 'Rate Date'], ...FX_RATES.map(([c, v]) => [c, v, d(2024, 6, 28)])],
      widths: [80, 100, 95],
      formats: { 1: '0.0000', 2: 'm/d/yyyy' },
    },
  ]);
}

// Lesson 4: Treasury republishes EUR
const EUR_OLD = FX.get('EUR')!;
const EUR_NEW = 1.0901;
const rateL4 = (ccy: string) => (ccy === 'EUR' ? EUR_NEW : FX.get(ccy)!);

// ---------------------------------------------------------------------------

export const module: Module = {
  id: 'm11',
  title: 'Lookups Across Sheets & Files',
  level: 'Advanced',
  icon: '🌐',
  blurb: 'Pull data from other tabs and other workbooks — the daily reality of data-lake extracts — then audit, freeze and ship it safely.',
  lessons: [
    // =====================================================================
    {
      id: 'm11-l1',
      title: 'Referencing other sheets',
      summary: "Sheet!A1, quotes for 'GL Detail'!A1, and a month-end summary that ties out to the detail.",
      minutes: 10,
      featured: ["'Sheet Name'!A1", 'Ctrl+PgDn', 'VLOOKUP', 'SUMIFS'],
      intro: `Real workbooks are split into tabs: a **Summary** that people read, **detail** tabs pasted from extracts, and **mapping** tabs that translate codes into names. Formulas glue them together.

**The syntax:** \`SheetName!A1\` — sheet name, exclamation mark, cell. \`=Mapping!B2\` reads B2 on the Mapping tab.

**Names with spaces (or starting with a digit, or with symbols) need single quotes:** \`='GL Detail'!B1\`. Forget the quotes and Excel can't tell where the name ends. Tip: avoid the problem entirely by **pointing** instead of typing — start the formula, press [[Ctrl+PgDn]] (or click the tab), click the cell. Excel writes the sheet name and the quotes for you.

**Lookups across sheets work exactly the same** — only the table address gains a prefix:
- \`=VLOOKUP(A4,Mapping!$A$2:$B$13,2,FALSE)\`
- \`=SUMIFS('GL Detail'!$C:$C,'GL Detail'!$A:$A,A4)\` — total every GL line for this account.

**Why whole columns (\`$C:$C\`) for SUMIFS on a detail tab?** Next month's extract may have more rows. A whole-column reference keeps catching them; a fixed \`$C$4:$C$43\` silently drops the new ones.

**Always tie out.** A summary built from detail should add back to the detail. The tie-out cell (\`Summary total − Detail total\`) should be 0 — and when it isn't, it's telling you something (unmapped accounts, a bad filter, a missing row).`,
      workbooks: () => [
        makeBook('Month_End.xlsx', [
          {
            name: 'Summary',
            header: false,
            rows: [
              ['Month-End Summary as of', null, null],
              [null, null, null],
              ['Account', 'Account Name', 'Balance'],
              ...COA.map(([a]) => [a, null, null]),
              ['Total', null, null],
              ['Tie-out vs GL Detail', null, null],
            ],
            widths: [170, 210, 120],
            formats: { 2: '#,##0.00' },
            styles: { A1: { b: true }, B1: { fmt: 'm/d/yyyy', b: true }, ...hdr(['A3', 'B3', 'C3']), A16: { b: true }, C16: { b: true, fmt: '#,##0.00', border: { t: true } }, A17: { i: true } },
          },
          {
            name: 'GL Detail',
            header: false,
            rows: [
              ['As of', AS_OF, null, null],
              [null, null, null, null],
              ['Account', 'Description', 'Amount', 'Cost Center'],
              ...GL.map((g) => [g.acct, g.desc, g.amount, g.cc]),
            ],
            widths: [80, 260, 110, 90],
            formats: { 2: '#,##0.00' },
            styles: { A1: { b: true }, B1: { fmt: 'm/d/yyyy' }, ...hdr(['A3', 'B3', 'C3', 'D3']) },
          },
          {
            name: 'Mapping',
            rows: [['Account', 'Account Name', 'FS Line'], ...COA.map(([a, n, f]) => [a, n, f])],
            widths: [80, 220, 100],
          },
        ]),
      ],
      start: { sheet: 'Summary', cell: 'B1' },
      tasks: [
        {
          id: 't1',
          title: 'Link the as-of date',
          instruction: "In **Summary!B1**, pull the as-of date from **B1** on the **GL Detail** tab: `='GL Detail'!B1`\n\nFastest way: type `=`, press [[Ctrl+PgDn]] to go to GL Detail, click **B1** (or arrow to it), press [[Enter]]. Excel adds the quotes and brings you back.",
          why: "Linking the date (rather than typing it) means the summary can never claim a different period than the data it summarises. The quotes are there because 'GL Detail' contains a space.",
          hints: ["The sheet name has a space, so it must be wrapped in single quotes: 'GL Detail'!B1", 'Pointing with the mouse/keyboard writes the quotes for you.'],
          check: (c) =>
            all(
              /'GL Detail'!\$?B\$?1\b/i.test(c.f('B1')) ? true : "B1 should be a formula like ='GL Detail'!B1",
              c.v('B1') === AS_OF ? true : 'B1 should show the GL Detail as-of date (6/30/2024).',
            ),
          solution: [{ set: { B1: "='GL Detail'!B1" } }],
        },
        {
          id: 't2',
          title: 'Account names from the Mapping tab',
          instruction: 'In **B4:B15** look up each account name from the **Mapping** tab:\n`=VLOOKUP(A4,Mapping!$A$2:$B$13,2,FALSE)`\n\nTry building it by pointing: type `=VLOOKUP(A4,` then [[Ctrl+PgDn]] twice to Mapping, select A2:B13, press [[F4]], type `,2,FALSE)` and [[Enter]].',
          why: 'Mapping tabs are how banks keep reports stable while the chart of accounts evolves: change the mapping once, every report follows. "Mapping" has no spaces, so no quotes are needed.',
          hints: ['The table prefix is Mapping! — no quotes needed.', 'Lock the table, then fill down to B15.'],
          check: (c) =>
            all(
              formulasMatch(c, 'B4:B15', /VLOOKUP\(.*Mapping!/i, 'VLOOKUP into Mapping!'),
              colEquals(c, 'B4:B15', COA.map((x) => x[1]), 'Account name'),
            ),
          solution: [{ set: { 'B4:B15': '=VLOOKUP(A4,Mapping!$A$2:$B$13,2,FALSE)' } }],
        },
        {
          id: 't3',
          title: 'Balances with SUMIFS across sheets',
          instruction: "Each account has several lines on GL Detail. In **C4:C15** total them:\n`=SUMIFS('GL Detail'!$C:$C,'GL Detail'!$A:$A,A4)`",
          why: "SUMIFS(sum_range, criteria_range, criteria) is a lookup that ADDS every match instead of returning the first one — exactly what you need for detail-to-summary. Whole columns keep working when next month's extract is longer.",
          hints: ["sum_range = 'GL Detail'!$C:$C (Amount), criteria_range = 'GL Detail'!$A:$A (Account), criteria = A4.", 'Fill down to C15.'],
          check: (c) =>
            all(
              formulasMatch(c, 'C4:C15', /SUMIFS\(.*'GL Detail'!/i, "SUMIFS over 'GL Detail'!"),
              colEquals(c, 'C4:C15', COA.map(([a]) => glSum(a)), 'Balance'),
            ),
          solution: [{ set: { 'C4:C15': "=SUMIFS('GL Detail'!$C:$C,'GL Detail'!$A:$A,A4)" } }],
        },
        {
          id: 't4',
          title: 'Total and tie out',
          instruction: `- **C16**: \`=SUM(C4:C15)\`
- **C17**: the difference between your total and **all** GL detail lines: \`=C16-SUM('GL Detail'!C${GL_FIRST}:C${GL_LAST})\`

It is **not** zero. Go look at GL Detail for an account that isn't on the summary.`,
          why: `The tie-out shows ${fmtScalar(-SUSPENSE)}: two postings went to account 99999 (Suspense), which isn't mapped. The formula is right — the data has an issue. That is precisely why you build tie-outs: they turn silent gaps into a number someone has to explain before the pack goes out.`,
          hints: ['C16 adds the summary balances.', `C17 subtracts the sum of the whole Amount column on GL Detail (C${GL_FIRST}:C${GL_LAST}).`],
          check: (c) =>
            all(
              /^=SUM\(/i.test(c.f('C16')) && approx(c.v('C16'), MAPPED_TOTAL) ? true : 'C16 should be =SUM(C4:C15).',
              /'GL Detail'!/i.test(c.f('C17')) ? true : "C17 should subtract a SUM over the 'GL Detail' Amount column.",
              approx(c.v('C17'), -SUSPENSE, 0.0001) ? true : `C17 should show ${fmtScalar(round2(-SUSPENSE))} (summary minus all detail lines).`,
            ),
          solution: [{ set: { C16: '=SUM(C4:C15)', C17: `=C16-SUM('GL Detail'!C${GL_FIRST}:C${GL_LAST})` } }],
          explain: `The ${fmtScalar(round2(-SUSPENSE))} gap is the two suspense postings (account 99999) — escalate to the GL team rather than plugging it.`,
        },
      ],
    },
    // =====================================================================
    {
      id: 'm11-l2',
      title: 'VLOOKUP into another workbook',
      summary: 'The headline skill: a lookup whose table lives in a different file — built with Ctrl+Tab and point mode.',
      minutes: 12,
      featured: ['Ctrl+Tab', 'Ctrl+F6', 'Ctrl+Shift+↓', 'Ctrl+Shift+→', '[Book.xlsx]Sheet!$A$1'],
      intro: `On data-lake work the tables you need are rarely in your file. The loan tape comes from one extract, the customer master from another. **Two files open; one formula connects them.**

**What the reference looks like:**
\`[Customer_Master.xlsx]Accounts!$A$1:$F$${M_END}\`
- \`[Customer_Master.xlsx]\` — the **workbook** (square brackets)
- \`Accounts!\` — the **sheet** in that workbook
- \`$A$1:$F$${M_END}\` — the range. **Excel makes cross-file references absolute automatically** — the $ signs are already there, so fill-down is safe.

If the file or sheet name has spaces, the whole prefix gets single quotes: \`'[Customer Master.xlsx]Accounts'!$A:$F\`. (Another reason data teams name files with underscores.)

**The keyboard flow — learn this one by heart:**
1. In the tape, select **E2** and type \`=VLOOKUP(B2,\`
2. Press [[Ctrl+Tab]] (or [[Ctrl+F6]] if your browser grabs Ctrl+Tab) → you're now *looking at* Customer_Master.xlsx, still editing your formula.
3. Click **A1** (or just start from A1), press [[Ctrl+Shift+↓]] then [[Ctrl+Shift+→]] to select the whole table. Watch the formula bar fill in the reference.
4. Type \`,2,FALSE)\` and press [[Enter]] → Excel **takes you home** to the tape with the answer in E2.

**Behind the scenes (real Excel):** while the source is open, the link updates live. When it's closed, Excel shows the full path (\`'C:\\Data\\[Customer_Master.xlsx]Accounts'!…\`) and uses the **last saved values** until you refresh. That's where stale data comes from (lesson 4).

In this lesson **Customer_Master.xlsx is read-only** — just like a production extract you must never edit.`,
      workbooks: () => [
        makeBook('Loan_Tape.xlsx', [
          {
            name: 'Tape',
            rows: [
              ['Loan ID', 'Customer ID', 'Product', 'Balance', 'Customer Name', 'Rating'],
              ...TAPE2.map((l) => [l.id, l.cust, l.product, l.balance, null, null]),
            ],
            widths: [90, 95, 110, 110, 160, 110],
            formats: { 3: '#,##0.00' },
            freeze: true,
          },
        ]),
        customerMasterBook(),
      ],
      readOnly: ['Customer_Master.xlsx'],
      start: { book: 'Loan_Tape.xlsx', cell: 'E2' },
      tasks: [
        {
          id: 't1',
          title: 'Your first cross-file VLOOKUP',
          instruction: `Follow the keyboard flow for **E2**:
1. Type \`=VLOOKUP(B2,\`
2. [[Ctrl+Tab]] to **Customer_Master.xlsx**
3. From A1 press [[Ctrl+Shift+↓]] then [[Ctrl+Shift+→]]
4. Type \`,2,FALSE)\` and [[Enter]]

You should land back in the tape with the customer's name, and E2 should read \`=VLOOKUP(B2,[Customer_Master.xlsx]Accounts!$A$1:$F$${M_END},2,FALSE)\`.`,
          why: 'Pointing beats typing: no misspelt file names, no wrong sheet, and Excel adds the $ for you. Notice that you never left your formula — Ctrl+Tab in the middle of a formula switches the file you are LOOKING at, not the cell you are EDITING.',
          hints: [
            'If Ctrl+Tab changes your browser tab, use Ctrl+F6 instead (or turn on Excel Keys mode).',
            'Ctrl+Shift+↓ selects down to the last customer; Ctrl+Shift+→ extends across to Branch.',
            `Typed version: =VLOOKUP(B2,[Customer_Master.xlsx]Accounts!$A$1:$F$${M_END},2,FALSE)`,
          ],
          check: (c) => {
            const f = c.f('E2');
            if (!/^=VLOOKUP\(\s*B2\s*,/i.test(f)) return 'E2 should start with =VLOOKUP(B2,';
            if (!MASTER_REF.test(f)) return 'The table should live in the other file: [Customer_Master.xlsx]Accounts!…';
            if (!/Accounts'?!\$[A-Z]+\$?\d*:\$[A-Z]+/i.test(f)) return 'Lock the table range with $ (pointing does it for you).';
            if (!/,\s*(FALSE|0)\s*\)$/i.test(f)) return 'Finish with ,2,FALSE) — exact match.';
            return colEquals(c, 'E2', [m2(TAPE2[0].cust)!.name], 'Customer name');
          },
          solution: [{ set: { E2: `=VLOOKUP(B2,[Customer_Master.xlsx]Accounts!$A$1:$F$${M_END},2,FALSE)` } }],
          explain: 'B2 is local (relative); the table is in the other workbook and was made absolute automatically.',
        },
        {
          id: 't2',
          title: 'Fill down the whole tape',
          instruction: `Select **E2:E41** and press [[Ctrl+D]]. Because the external range is already absolute, every row looks in the same table.

**${L2_MISSING} rows show #N/A.** The master was extracted *yesterday*; these customers were onboarded today.`,
          why: 'Cross-file #N/A is very often a timing problem: two extracts taken at different moments. Before blaming the formula, compare the extract timestamps (see the ReadMe tab in the master).',
          hints: ['Shift+click E41 after selecting E2, then Ctrl+D.'],
          check: (c) =>
            all(
              formulasMatch(c, 'E2:E41', /VLOOKUP\(.*\[Customer_Master\.xlsx\]/i, 'VLOOKUP into [Customer_Master.xlsx]'),
              colEquals(c, 'E2:E41', TAPE2.map((l) => m2(l.cust)?.name ?? ERR.NA), 'Customer name'),
            ),
          solution: [{ select: 'E2:E41' }, { cmd: 'fill.down' }],
        },
        {
          id: 't3',
          title: 'Label the timing gaps',
          instruction: `Wrap the lookup in **E2:E41** so missing customers read \`Not in master\`:
\`=IFNA(VLOOKUP(B2,[Customer_Master.xlsx]Accounts!$A$1:$F$${M_END},2,FALSE),"Not in master")\``,
          why: '"Not in master" is specific: it tells the reader which side is missing data, so the next action (re-pull the master after 23:00) is obvious. A generic "error" label would not.',
          hints: ['Press F2 on E2, add IFNA( right after the =, and ,"Not in master") at the end. Then refill.'],
          check: (c) =>
            all(
              formulasMatch(c, 'E2:E41', /(IFNA|IFERROR)\(\s*VLOOKUP\(.*\[Customer_Master\.xlsx\]/i, 'IFNA(VLOOKUP(… [Customer_Master.xlsx] …),"Not in master")'),
              colEquals(c, 'E2:E41', TAPE2.map((l) => m2(l.cust)?.name ?? 'Not in master'), 'Customer name'),
            ),
          solution: [{ set: { 'E2:E41': `=IFNA(VLOOKUP(B2,[Customer_Master.xlsx]Accounts!$A$1:$F$${M_END},2,FALSE),"Not in master")` } }],
        },
        {
          id: 't4',
          title: 'Rating with a cross-file XLOOKUP',
          instruction: `Now the Rating, using XLOOKUP with whole columns from the other file. In **F2:F41**:
\`=XLOOKUP(B2,[Customer_Master.xlsx]Accounts!$A:$A,[Customer_Master.xlsx]Accounts!$E:$E,"Not in master")\`

Pointing works here too: after \`=XLOOKUP(B2,\` press [[Ctrl+Tab]], click column A's header (or [[Ctrl+Space]]), type a comma, and do the same for column E.`,
          why: 'Whole-column references into a source file keep working when tomorrow\'s extract has more customers — no need to edit the range. XLOOKUP also needs no column counting, so if Data Ops adds a field to the master, your rating stays a rating.',
          hints: ['lookup_array = [Customer_Master.xlsx]Accounts!$A:$A (IDs); return_array = …!$E:$E (Rating).', 'The 4th argument "Not in master" replaces IFNA.'],
          check: (c) =>
            all(
              formulasMatch(c, 'F2:F41', /XLOOKUP\(.*\[Customer_Master\.xlsx\]/i, 'XLOOKUP into [Customer_Master.xlsx]'),
              colEquals(c, 'F2:F41', TAPE2.map((l) => m2(l.cust)?.rating ?? 'Not in master'), 'Rating'),
            ),
          solution: [
            { set: { 'F2:F41': '=XLOOKUP(B2,[Customer_Master.xlsx]Accounts!$A:$A,[Customer_Master.xlsx]Accounts!$E:$E,"Not in master")' } },
          ],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm11-l3',
      title: 'Three files: an FX exposure report',
      summary: 'INDEX/MATCH, XLOOKUP and SUMIFS reaching into a loan tape and an FX rates file to build a USD exposure report.',
      minutes: 14,
      featured: ['INDEX/MATCH', 'XLOOKUP', 'SUMIFS', 'Ctrl+Tab'],
      intro: `A classic Treasury / Risk request: *"What's our loan exposure by currency, in USD?"* The pieces live in three places:

- **Exposure_Report.xlsx** — your report (home).
- **Loan_Tape.xlsx** — one row per loan, balance in **local currency** (read-only).
- **FX_Rates.xlsx** — Treasury's USD rate per currency (read-only).

Every technique you've learnt works across files — only the prefix changes:
- \`=INDEX([Loan_Tape.xlsx]Tape!$E$2:$E$${T_END},MATCH(A2,[Loan_Tape.xlsx]Tape!$A$2:$A$${T_END},0))\`
- \`=XLOOKUP(A2,[Loan_Tape.xlsx]Tape!$A$2:$A$${T_END},[Loan_Tape.xlsx]Tape!$F$2:$F$${T_END})\`
- \`=SUMIFS([Loan_Tape.xlsx]Tape!$F$2:$F$${T_END},[Loan_Tape.xlsx]Tape!$E$2:$E$${T_END},G2)\`

**Chain of thought for any multi-file report:**
1. *What is my key?* (Loan ID, currency code.)
2. *Which file holds the field I need?* (Balance → tape; rate → FX file.)
3. *One match or many?* One → lookup. Many → SUMIFS/COUNTIFS.
4. *Is the result in the right units?* (Local × USD-per-unit = USD.)
5. *Does it tie out?* (Sum of loan-level USD = sum of currency-level USD.)

With three books open, [[Ctrl+Tab]] cycles forward and [[Ctrl+Shift+Tab]] goes back — mid-formula too.`,
      workbooks: () => [
        makeBook('Exposure_Report.xlsx', [
          {
            name: 'Report',
            rows: layout([
              { at: 'A1', rows: [['Loan ID', 'Currency', 'Balance (Local)', 'Balance (USD)'], ...R3.map((t) => [t.id])] },
              { at: 'G1', rows: [['Currency', 'Local Exposure', 'USD Exposure'], ...CCYS.map((c) => [c]), ['Total', null, null]] },
            ]),
            widths: [90, 75, 130, 130, 30, 30, 75, 140, 140],
            formats: { 2: '#,##0.00', 3: '#,##0.00', 7: '#,##0.00', 8: '#,##0.00' },
            styles: { G9: { b: true }, I9: { b: true, fmt: '#,##0.00', border: { t: true } } },
            freeze: true,
          },
        ]),
        loanTapeBook(),
        fxBook(),
      ],
      readOnly: ['Loan_Tape.xlsx', 'FX_Rates.xlsx'],
      start: { book: 'Exposure_Report.xlsx', cell: 'B2' },
      tasks: [
        {
          id: 't1',
          title: 'Currency via INDEX/MATCH from the tape',
          instruction: `In **B2:B21** return each loan's **Currency** (column E of the tape):
\`=INDEX([Loan_Tape.xlsx]Tape!$E$2:$E$${T_END},MATCH(A2,[Loan_Tape.xlsx]Tape!$A$2:$A$${T_END},0))\``,
          why: 'INDEX/MATCH across files is the most portable cross-file lookup: works in every Excel version and survives columns being added to the source extract.',
          hints: ['Build it by pointing: =INDEX( → Ctrl+Tab → select E2:E61 → ,MATCH(A2, → Ctrl+Tab → select A2:A61 → ,0)) → Enter.', 'Both ranges must start on the same row (2) and end on the same row.'],
          check: (c) =>
            all(
              formulasMatch(c, 'B2:B21', /INDEX\(.*\[Loan_Tape\.xlsx\].*MATCH\(.*\[Loan_Tape\.xlsx\]/i, 'INDEX/MATCH into [Loan_Tape.xlsx]'),
              colEquals(c, 'B2:B21', R3.map((t) => t.ccy), 'Currency'),
            ),
          solution: [{ set: { 'B2:B21': `=INDEX([Loan_Tape.xlsx]Tape!$E$2:$E$${T_END},MATCH(A2,[Loan_Tape.xlsx]Tape!$A$2:$A$${T_END},0))` } }],
        },
        {
          id: 't2',
          title: 'Local balance via XLOOKUP',
          instruction: `In **C2:C21** return the **Balance (Local)** (tape column F):
\`=XLOOKUP(A2,[Loan_Tape.xlsx]Tape!$A$2:$A$${T_END},[Loan_Tape.xlsx]Tape!$F$2:$F$${T_END})\``,
          why: 'Same key, same file, different field. With XLOOKUP you point at the Balance column directly — no counting to 6.',
          hints: ['lookup_array = tape column A, return_array = tape column F.'],
          check: (c) =>
            all(
              formulasMatch(c, 'C2:C21', /XLOOKUP\(.*\[Loan_Tape\.xlsx\]/i, 'XLOOKUP into [Loan_Tape.xlsx]'),
              colEquals(c, 'C2:C21', R3.map((t) => t.local), 'Local balance'),
            ),
          solution: [{ set: { 'C2:C21': `=XLOOKUP(A2,[Loan_Tape.xlsx]Tape!$A$2:$A$${T_END},[Loan_Tape.xlsx]Tape!$F$2:$F$${T_END})` } }],
        },
        {
          id: 't3',
          title: 'Convert to USD with the FX file',
          instruction: 'In **D2:D21** multiply the local balance by the rate from **FX_Rates.xlsx**:\n`=C2*VLOOKUP(B2,[FX_Rates.xlsx]Rates!$A$2:$B$8,2,FALSE)`',
          why: 'Rates are quoted as USD per unit, so local × rate = USD. Always sanity-check units on one row: a JPY balance in the millions should become tens of thousands of USD — if you see billions, you multiplied by the wrong rate (or divided). A third file, the same pattern.',
          hints: ['Ctrl+Tab cycles through all three open books — keep going until FX_Rates.xlsx.', 'The key for the FX lookup is the currency in B2.'],
          check: (c) =>
            all(
              formulasMatch(c, 'D2:D21', /\[FX_Rates\.xlsx\]/i, 'formula using [FX_Rates.xlsx]'),
              colEquals(c, 'D2:D21', R3.map((t) => t.local * FX.get(t.ccy)!), 'USD balance'),
            ),
          solution: [{ set: { 'D2:D21': '=C2*VLOOKUP(B2,[FX_Rates.xlsx]Rates!$A$2:$B$8,2,FALSE)' } }],
        },
        {
          id: 't4',
          title: 'Exposure by currency with SUMIFS across files',
          instruction: `Now the whole tape, not just 20 loans. In **H2:H8** total the local balance for each currency in G:
\`=SUMIFS([Loan_Tape.xlsx]Tape!$F$2:$F$${T_END},[Loan_Tape.xlsx]Tape!$E$2:$E$${T_END},G2)\``,
          why: 'SUMIFS is the workhorse of cross-file reporting: it aggregates a big extract without copying it into your report. Your report stays small, and refreshing the tape refreshes the totals.',
          hints: ['sum_range = tape Balance (F), criteria_range = tape Currency (E), criteria = G2.'],
          check: (c) =>
            all(
              formulasMatch(c, 'H2:H8', /SUMIFS\(.*\[Loan_Tape\.xlsx\]/i, 'SUMIFS over [Loan_Tape.xlsx]'),
              colEquals(c, 'H2:H8', CCYS.map(localByCcy), 'Local exposure'),
            ),
          solution: [{ set: { 'H2:H8': `=SUMIFS([Loan_Tape.xlsx]Tape!$F$2:$F$${T_END},[Loan_Tape.xlsx]Tape!$E$2:$E$${T_END},G2)` } }],
        },
        {
          id: 't5',
          title: 'USD exposure and total',
          instruction: '- **I2:I8**: `=H2*VLOOKUP(G2,[FX_Rates.xlsx]Rates!$A$2:$B$8,2,FALSE)`\n- **I9**: `=SUM(I2:I8)` — total loan exposure in USD.',
          why: 'Adding up local balances across currencies is meaningless (yen + dollars); converting first, then summing, gives a number the ALCO can use. I9 should equal the USD value of every loan on the tape — a natural tie-out.',
          hints: ['Same FX lookup as column D, keyed on G2.', 'I9 is a plain SUM.'],
          check: (c) =>
            all(
              formulasMatch(c, 'I2:I8', /\[FX_Rates\.xlsx\]/i, 'formula using [FX_Rates.xlsx]'),
              colEquals(c, 'I2:I8', CCYS.map((x) => localByCcy(x) * FX.get(x)!), 'USD exposure'),
              /^=SUM\(/i.test(c.f('I9')) ? true : 'I9 should be =SUM(I2:I8).',
              approx(c.v('I9'), TAPE3.reduce((a, t) => a + t.local * FX.get(t.ccy)!, 0)) ? true : 'I9 should total the USD exposure.',
            ),
          solution: [{ set: { 'I2:I8': '=H2*VLOOKUP(G2,[FX_Rates.xlsx]Rates!$A$2:$B$8,2,FALSE)', I9: '=SUM(I2:I8)' } }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm11-l4',
      title: 'Audit, freeze & ship: Ctrl+[ and Paste Values',
      summary: 'Trace a number back to its source file, see links update live, then break them with Paste Values before emailing.',
      minutes: 10,
      featured: ['Ctrl+[', 'Ctrl+Shift+Tab', 'Ctrl+C', 'Alt H V V'],
      intro: `Your branch pack is built on live links into Loan_Tape.xlsx and FX_Rates.xlsx. Before it leaves your desk you need to answer two questions: **where does each number come from**, and **what will the recipient see?**

**Audit with [[Ctrl+[]]:** on a formula cell, Ctrl+[ jumps to the cells it refers to — **even in another open file**. It's the fastest way to answer "where does this number come from?" without reading the formula. ([[Ctrl+Shift+Tab]] takes you back.)

**Links are live — in both directions of risk:**
- While the source files are open, change a rate and your pack changes instantly. Great while you're working.
- Email the pack and the recipient doesn't have *your* Loan_Tape.xlsx. Excel will show "Security warning: links disabled", use the **last saved values**, or offer to "Update" against a file path that doesn't exist on their PC (→ #REF!). Worse, it exposes your folder structure.

**So bankers break the links before sending:** select the block, [[Ctrl+C]], then **Paste Values** ([[Alt]] [[H]] [[V]] [[V]], or [[Ctrl+Alt+V]] → V). Formulas become plain numbers: frozen, portable, safe.

**But frozen means frozen:** if the source is corrected *after* you paste values, your pack is now **stale** and nothing warns you. The discipline:
1. Refresh / confirm sources are final.
2. Tie out.
3. Paste values into a **copy** of the file (keep your linked working version).
4. Note the as-of time on the pack.`,
      workbooks: () => [
        makeBook('Branch_Pack.xlsx', [
          {
            name: 'Pack',
            header: false,
            rows: [
              ['Loan Exposure by Currency — Branch Pack', null, null, null],
              [null, null, null, null],
              ['Currency', 'Local Balance', 'FX Rate', 'USD Balance'],
              ...CCYS.map((ccy, i) => [
                ccy,
                `=SUMIFS([Loan_Tape.xlsx]Tape!$F:$F,[Loan_Tape.xlsx]Tape!$E:$E,A${i + 4})`,
                `=VLOOKUP(A${i + 4},[FX_Rates.xlsx]Rates!$A:$B,2,FALSE)`,
                `=B${i + 4}*C${i + 4}`,
              ]),
              ['Total', null, null, '=SUM(D4:D10)'],
            ],
            widths: [90, 140, 90, 140],
            formats: { 1: '#,##0.00', 2: '0.0000', 3: '#,##0.00' },
            styles: { A1: { b: true }, ...hdr(['A3', 'B3', 'C3', 'D3']), A11: { b: true }, D11: { b: true, fmt: '#,##0.00', border: { t: true } } },
          },
        ]),
        loanTapeBook(),
        fxBook(),
      ],
      readOnly: ['Loan_Tape.xlsx'],
      start: { book: 'Branch_Pack.xlsx', cell: 'B4' },
      tasks: [
        {
          id: 't1',
          title: 'Trace a number to its source file',
          instruction: 'Select **B4** (USD local balance) and press [[Ctrl+[]]. You jump straight into **Loan_Tape.xlsx**, onto the column the SUMIFS adds up.\n\nThen come home with [[Ctrl+Shift+Tab]] (or [[Ctrl+Shift+F6]]).',
          why: 'When a manager asks "where does 4.2m come from?", Ctrl+[ answers in one keystroke and works across files. It follows the first reference in the formula — here the sum column in the tape.',
          hints: ['Ctrl + left square bracket.', 'Ctrl+Shift+Tab goes to the previous open workbook.'],
          check: (c) => {
            if (!c.used('nav.tracePrecedent')) return 'Select B4 and press Ctrl+[ to follow the reference.';
            if (c.sel.book !== 'Branch_Pack.xlsx') return 'Nice — you are in the source file. Now press Ctrl+Shift+Tab to come back to Branch_Pack.xlsx.';
            return true;
          },
          solution: [{ select: 'B4' }, { cmd: 'nav.tracePrecedent' }, { cmd: 'nav.prevBook' }],
        },
        {
          id: 't2',
          title: 'Watch a live link update',
          instruction: `Treasury just republished EUR. Switch to **FX_Rates.xlsx** ([[Ctrl+Tab]]), change **B3** (EUR) from ${EUR_OLD} to \`${EUR_NEW}\` and press [[Enter]].

Go back to the pack: C5 and D5 have already moved.`,
          why: 'That live behaviour is what makes linked workbooks powerful while you work — and what makes them unpredictable once they leave your machine. (FX_Rates.xlsx is editable in this lesson so you can play Treasury for a moment.)',
          hints: ['Ctrl+Tab cycles the open books; FX_Rates.xlsx is the third one.', `Type ${EUR_NEW} in B3 and press Enter.`],
          check: (c) =>
            all(
              approx(c.v('[FX_Rates.xlsx]Rates!B3'), EUR_NEW, 0.00001) ? true : `Set B3 in FX_Rates.xlsx to ${EUR_NEW}.`,
              approx(c.v('C5'), EUR_NEW, 0.00001) ? true : 'The pack\'s EUR rate (C5) should now show the new rate.',
            ),
          solution: [{ set: { '[FX_Rates.xlsx]Rates!B3': String(EUR_NEW) } }],
        },
        {
          id: 't3',
          title: 'Break the links with Paste Values',
          instruction: 'Back in **Branch_Pack.xlsx**, select **B4:D11**, press [[Ctrl+C]], then Paste Values with [[Alt]] [[H]] [[V]] [[V]].\n\nClick any cell in the block: the formula bar shows a plain number — no more `[Loan_Tape.xlsx]`.',
          why: 'Pasting values over the same range replaces every formula with its current result. The recipient sees exactly what you saw, with no "Update links?" prompt and no file paths leaking.',
          hints: ['Copy first (Ctrl+C), then Alt, H, V, V — the selection stays the same.', 'Make sure you are on Branch_Pack.xlsx, not the FX file.'],
          check: (c) =>
            all(
              c.inputs('B4:D11').some((x) => x.startsWith('=')) ? 'B4:D11 still contains formulas — copy the block and Paste Values over it.' : true,
              c.used('clip.pasteValues') ? true : 'Use Paste Values (Alt H V V) — not a normal paste.',
              colEquals(c, 'B4:B10', CCYS.map(localByCcy), 'Local balance'),
              colEquals(c, 'C4:C10', CCYS.map(rateL4), 'FX rate', 0.00001),
              colEquals(c, 'D4:D10', CCYS.map((x) => localByCcy(x) * rateL4(x)), 'USD balance'),
            ),
          solution: [{ book: 'Branch_Pack.xlsx' }, { select: 'B4:D11' }, { cmd: 'clip.copy' }, { cmd: 'clip.pasteValues' }],
        },
        {
          id: 't4',
          title: 'See the stale-data risk',
          instruction: `Treasury emails: *"Sorry — the EUR republish was an error, the correct rate is ${EUR_OLD}."* Go to **FX_Rates.xlsx** and set **B3** back to \`${EUR_OLD}\`.

Now look at the pack: **C5 still says ${EUR_NEW}**. Nothing warns you.`,
          why: 'This is the flip side of breaking links: a frozen pack cannot notice a correction. That is why you paste values LAST — after sources are confirmed final — into a copy you send, keep the linked version for re-runs, and stamp the as-of time on the pack so a stale number can be traced.',
          hints: [`Ctrl+Tab to FX_Rates.xlsx, type ${EUR_OLD} in B3, Enter.`],
          check: (c) =>
            all(
              approx(c.v('[FX_Rates.xlsx]Rates!B3'), EUR_OLD, 0.00001) ? true : `Set FX_Rates.xlsx B3 back to ${EUR_OLD}.`,
              approx(c.v('C5'), EUR_NEW, 0.00001) && !c.f('C5').startsWith('=')
                ? true
                : 'The pack\'s C5 should still hold the frozen value — did a formula get back in?',
            ),
          solution: [{ set: { '[FX_Rates.xlsx]Rates!B3': String(EUR_OLD) } }],
          explain: 'The source changed; the pasted pack did not. In real life you would re-run from the linked working copy and paste values again.',
        },
      ],
    },
  ],
  quiz: [
    {
      kind: 'mc',
      q: 'Which reference correctly points to B1 on a sheet named GL Detail?',
      options: ['=GL Detail!B1', "='GL Detail'!B1", '=[GL Detail]B1', '="GL Detail"!B1'],
      answer: 1,
      explain: 'Sheet names with spaces must be wrapped in single quotes before the !.',
    },
    {
      kind: 'mc',
      q: 'Which is a valid reference to column A:D on sheet Accounts in Customer_Master.xlsx?',
      options: [
        '=Customer_Master.xlsx!Accounts!$A:$D',
        '=[Customer_Master.xlsx]Accounts!$A:$D',
        '=Accounts[Customer_Master.xlsx]!$A:$D',
        '=(Customer_Master.xlsx)Accounts!$A:$D',
      ],
      answer: 1,
      explain: 'Workbook in square brackets, then the sheet, then ! and the range. With spaces in the names it becomes \'[Book Name.xlsx]Sheet\'!$A:$D.',
    },
    {
      kind: 'keys',
      q: 'While typing a formula, switch to the next open workbook to point at its cells.',
      cmd: 'nav.nextBook',
      keys: 'Ctrl+Tab or Ctrl+F6',
      explain: 'Ctrl+Tab / Ctrl+F6 switch workbooks — even mid-formula — so you can select a range in another file.',
    },
    {
      kind: 'mc',
      q: 'You point at a range in another workbook while building a VLOOKUP. What does Excel insert?',
      options: ['A relative reference like A1:F58', 'An absolute reference like $A$1:$F$58', 'A named range', 'The values, not a reference'],
      answer: 1,
      explain: 'External references are made absolute by default — which is why a cross-file lookup can be filled down safely.',
    },
    {
      kind: 'keys',
      q: 'Jump from a formula to the cells it refers to (even in another open file).',
      cmd: 'nav.tracePrecedent',
      keys: 'Ctrl+[',
      explain: 'Ctrl+[ follows the formula\'s references — the quickest audit of "where does this number come from?".',
    },
    {
      kind: 'keys',
      q: 'You have copied a block of linked formulas. Paste them back as plain values.',
      cmd: 'clip.pasteValues',
      keys: 'Alt H V V (or Ctrl+Alt+V → V)',
      explain: 'Paste Values replaces formulas with their results, breaking the links to the source files.',
    },
    {
      kind: 'mc',
      q: 'Why do analysts Paste Values before emailing a pack built on links to other files?',
      options: [
        'It makes the numbers more accurate',
        'Recipients don\'t have the source files: links would prompt to update, break, or expose file paths',
        'Excel cannot email files with formulas',
        'It sorts the data',
      ],
      answer: 1,
      explain: 'Frozen values travel safely. Keep the linked version for re-runs.',
    },
    {
      kind: 'mc',
      q: 'After pasting values, Treasury corrects an FX rate in the source file. What happens to your pack?',
      options: ['It updates automatically', 'Nothing — it is now stale until you re-run from the linked copy', 'It shows #REF!', 'Excel asks you to update links'],
      answer: 1,
      explain: 'Pasted values have no memory of where they came from. Paste values last, and stamp the as-of time.',
    },
    {
      kind: 'formula',
      q: 'Total the Amount (column C) for currency "EUR" (column A) with SUMIFS.',
      grid: [
        ['Currency', 'Loan', 'Amount'],
        ['EUR', 'L1', 1200],
        ['USD', 'L2', 500],
        ['EUR', 'L3', 800],
        ['GBP', 'L4', 300],
        ['EUR', 'L5', 150],
      ],
      at: 'E2',
      expect: 2150,
      model: '=SUMIFS(C2:C6,A2:A6,"EUR")',
      explain: 'SUMIFS(sum_range, criteria_range, criteria) adds every matching row — the same pattern works with [Loan_Tape.xlsx]Tape! prefixes across files.',
      mustUse: ['SUMIFS'],
    },
    {
      kind: 'mc',
      q: 'A cross-file VLOOKUP shows #N/A for 3 loans; the formula is identical on every row. Most likely cause?',
      options: [
        'The other file is read-only',
        'The two extracts were taken at different times — those customers are not in the master yet',
        'External references cannot be filled down',
        'VLOOKUP does not work across files',
      ],
      answer: 1,
      explain: 'Check extract timestamps first; label the gap (IFNA "Not in master") and re-pull rather than hard-coding.',
    },
  ],
};
