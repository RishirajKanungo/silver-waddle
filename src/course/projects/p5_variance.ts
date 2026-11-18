import type { Lesson, CheckCtx } from '../types';
import { makeBook, rng, between, round2, BRANCHES } from '../data';
import { all, approx, fmtScalar, formulasMatch, valuesEqual } from '../runner';
import { textToNumber } from '../../engine/values';
import { parseRange } from '../../engine/refs';
import { isErr } from '../../engine/types';

// ---------------------------------------------------------------------------
// March branch P&L (long format, one row per branch × line) vs:
//   - the FP&A budget, delivered as a MATRIX (branches down, lines across, in a
//     different order)            -> two-way INDEX/MATCH/MATCH
//   - February actuals, same long format but sorted differently, and PHX-01
//     didn't exist yet (opened in March)  -> two-key lookup with a default
// Planted: PHX-01 has a 0 Fee Income budget -> variance % divides by zero.
// ---------------------------------------------------------------------------

const REGION: Record<string, string> = {
  'NYC-01': 'Northeast', 'NYC-02': 'Northeast', 'BOS-01': 'Northeast', 'ATL-01': 'Southeast', 'MIA-01': 'Southeast',
  'CHI-01': 'Midwest', 'DAL-01': 'Southwest', 'PHX-01': 'Southwest', 'SFO-01': 'West', 'SEA-01': 'West',
};
const SUM_REGIONS = ['Northeast', 'Southeast', 'Midwest', 'Southwest', 'West'];
const LINES = ['Net Interest Income', 'Fee Income', 'Operating Expense'] as const;
const BUDGET_COLS = ['Operating Expense', 'Net Interest Income', 'Fee Income'] as const;
const NEW_BRANCH = 'PHX-01';

interface Row { branch: string; region: string; line: string; actual: number; budget: number; feb: number | null }
const r = rng(8080);
const ROWS: Row[] = [];
for (const b of BRANCHES) {
  for (const line of LINES) {
    const base = line === 'Net Interest Income' ? between(r, 400, 1200) * 1000 : line === 'Fee Income' ? between(r, 80, 300) * 1000 : -between(r, 300, 700) * 1000;
    const actual = round2(base * (0.97 + r() * 0.06));
    const swing = (r() - 0.5) * 0.4; // budget within ±20%
    let budget = Math.round((actual * (1 + swing)) / 1000) * 1000;
    if (b === NEW_BRANCH && line === 'Fee Income') budget = 0;
    const feb = b === NEW_BRANCH ? null : round2(actual * (0.92 + r() * 0.16));
    ROWS.push({ branch: b, region: REGION[b], line, actual, budget, feb });
  }
}
const N = ROWS.length; // 30 -> rows 2..31
const LAST = N + 1;
const BUD_BRANCHES = [...BRANCHES].sort();
const FEB_ROWS = ROWS.filter((x) => x.feb !== null).sort((a, b) => LINES.indexOf(a.line as never) - LINES.indexOf(b.line as never) || (a.branch < b.branch ? -1 : 1));
const FEB_LAST = FEB_ROWS.length + 1;

const varPct = (a: number, b: number) => (b === 0 ? null : (a - b) / Math.abs(b));
const EXP_BUDGET = ROWS.map((x) => x.budget);
const EXP_VAR = ROWS.map((x) => x.actual - x.budget);
const EXP_PCT = ROWS.map((x) => varPct(x.actual, x.budget));
const EXP_FEB = ROWS.map((x) => x.feb ?? 0);
const EXP_MOM = ROWS.map((x) => x.actual - (x.feb ?? 0));
const REG_ACT = SUM_REGIONS.map((g) => ROWS.filter((x) => x.region === g).reduce((a, x) => a + x.actual, 0));
const REG_BUD = SUM_REGIONS.map((g) => ROWS.filter((x) => x.region === g).reduce((a, x) => a + x.budget, 0));
const REG_VAR = REG_ACT.map((a, i) => a - REG_BUD[i]);
const REG_PCT = REG_ACT.map((a, i) => varPct(a, REG_BUD[i]) ?? 0);
const TOT_ACT = REG_ACT.reduce((a, b) => a + b, 0);
const TOT_BUD = REG_BUD.reduce((a, b) => a + b, 0);
const FLAGGED = EXP_PCT.filter((p) => p !== null && Math.abs(p) > 0.1).length;

const marBook = () =>
  makeBook('Actuals_Mar.xlsx', [
    {
      name: 'Actuals',
      rows: [['Branch', 'Region', 'Line', 'Actual'], ...ROWS.map((x) => [x.branch, x.region, x.line, x.actual])],
      widths: [80, 100, 150, 120, 120, 110, 80, 120, 110],
      formats: { 3: '#,##0.00' },
      freeze: true,
    },
    {
      name: 'Summary',
      header: false,
      rows: [
        ['Branch P&L Variance Pack: March 2024'],
        ['Contribution by region (NII + Fees − OpEx)'],
        [],
        ['Region', 'Actual', 'Budget', 'Var $', 'Var %', 'Commentary'],
        ...SUM_REGIONS.map((g) => [g]),
        ['Total'],
        [],
        ['Check vs Actuals tab (should be 0)'],
      ],
      widths: [210, 120, 120, 110, 80, 420],
      styles: {
        A1: { b: true },
        A2: { i: true },
        ...Object.fromEntries(['A4', 'B4', 'C4', 'D4', 'E4', 'F4'].map((a) => [a, { b: true, fill: '#DDEBF7' }])),
        A10: { b: true },
      },
    },
  ]);

const budgetBook = () =>
  makeBook('Budget_Mar.xlsx', [
    {
      name: 'Budget',
      rows: [['Branch', ...BUDGET_COLS], ...BUD_BRANCHES.map((b) => [b, ...BUDGET_COLS.map((l) => ROWS.find((x) => x.branch === b && x.line === l)!.budget)])],
      widths: [80, 140, 150, 110],
      formats: { 1: '#,##0', 2: '#,##0', 3: '#,##0' },
    },
  ]);

const febBook = () =>
  makeBook('Actuals_Feb.xlsx', [
    {
      name: 'Actuals',
      rows: [['Branch', 'Region', 'Line', 'Actual'], ...FEB_ROWS.map((x) => [x.branch, x.region, x.line, x.feb])],
      widths: [80, 100, 150, 120],
      formats: { 3: '#,##0.00' },
    },
  ]);

const hdr = (c: CheckCtx, ref: string, name: string) => (String(c.v(ref) ?? '').trim() ? true : `Type the header "${name}" in ${ref}.`);
const refsBook = (c: CheckCtx, ref: string, re: RegExp, book: string) => {
  const bad = c.inputs(ref).findIndex((x) => !re.test(x));
  return bad < 0 ? true : `The formulas in ${ref} should reference [${book}] (cell #${bad + 1} doesn't).`;
};
const fmtHas = (c: CheckCtx, cells: string[], re: RegExp, what: string) => {
  const bad = cells.find((a) => !re.test(c.style(a).fmt ?? ''));
  return bad ? `${bad} needs ${what}.` : true;
};
const cellsOf = (sheet: string, cols: string, r1: number, r2: number) => [...cols].flatMap((col) => Array.from({ length: r2 - r1 + 1 }, (_, i) => `${sheet}!${col}${r1 + i}`));

export const project: Lesson = {
  id: 'p5-variance',
  kind: 'project',
  title: 'Branch P&L Variance Pack',
  summary: 'Pull budget and prior month from two other files, compute variances safely, flag outliers, pivot and write auto-commentary.',
  minutes: 40,
  featured: ['INDEX', 'MATCH', 'XLOOKUP', 'IFERROR', 'ABS', 'SUMIFS', 'TEXT', 'Alt H L', 'Alt N V'],
  intro: `**From:** Tom Achterberg, Regional Finance Director
**To:** you
**Subject:** March variance pack — for Thursday's branch performance review

Can you put together the March variance pack? Three files:

- **Actuals_Mar.xlsx** — March actuals from the GL, one row per **branch × P&L line** (expenses are negative). Your working file.
- **Budget_Mar.xlsx** — FP&A's budget. Heads-up: it's a **matrix** (branches down, P&L lines across) and the columns are in a different order to ours. Read-only.
- **Actuals_Feb.xlsx** — last month's GL extract, same layout as March but sorted differently. **PHX-01 only opened in March**, so it isn't in there. Read-only.

I need, per row: budget, variance $ and %, prior month and month-on-month change. Highlight anything more than **10% off budget** either way. Then a region view — a quick pivot for me, plus a proper summary table with a one-line comment per region I can paste into the deck.

Careful: PHX-01 had **no fee budget** (0), so a naïve variance % will blow up with #DIV/0!.

**What "done" looks like:** no errors anywhere, ${FLAGGED} lines highlighted, the region summary ties back to the Actuals tab (check = 0), and every region has a readable comment.`,
  workbooks: () => [marBook(), budgetBook(), febBook()],
  readOnly: ['Budget_Mar.xlsx', 'Actuals_Feb.xlsx'],
  start: { book: 'Actuals_Mar.xlsx', sheet: 'Actuals', cell: 'E1' },
  tasks: [
    {
      id: 't1',
      title: 'Budget: two-way lookup into the matrix',
      instruction: `Header \`Budget\` in **E1**. In **E2:E${LAST}** pull the budget for each row's **Branch** (A) *and* **Line** (C) from the matrix **[Budget_Mar.xlsx]Budget!$A$1:$D$11**.

Use **INDEX** with two **MATCH**es: one finds the branch's row in column A, the other finds the line's column in row 1.`,
      why: `A matrix has two keys — the row label *and* the column header — so a VLOOKUP with a hard-coded column number would be wrong for two lines out of three (and break the day FP&A reorders their columns).

\`INDEX(block, MATCH(row key…), MATCH(column key…))\` is the classic **two-way lookup**: MATCH turns each key into a position, INDEX returns the cell at that crossing. Lock all the ranges with $; leave A2 and C2 relative.`,
      hints: [
        'Block of numbers: [Budget_Mar.xlsx]Budget!$B$2:$D$11. Row labels: $A$2:$A$11. Column headers: $B$1:$D$1.',
        'MATCH(A2, row labels, 0) gives the row number; MATCH(C2, column headers, 0) gives the column number.',
        '=INDEX([Budget_Mar.xlsx]Budget!$B$2:$D$11,MATCH(A2,[Budget_Mar.xlsx]Budget!$A$2:$A$11,0),MATCH(C2,[Budget_Mar.xlsx]Budget!$B$1:$D$1,0))',
      ],
      check: (c) =>
        all(
          hdr(c, 'Actuals!E1', 'Budget'),
          formulasMatch(c, `Actuals!E2:E${LAST}`, /(INDEX|XLOOKUP|SUMIFS|SUMPRODUCT)\(/i, 'INDEX/MATCH'),
          refsBook(c, `Actuals!E2:E${LAST}`, /budget_mar/i, 'Budget_Mar.xlsx'),
          valuesEqual(c, `Actuals!E2:E${LAST}`, EXP_BUDGET, 'Budget'),
        ),
      solution: [
        {
          set: {
            'Actuals!E1': 'Budget',
            [`Actuals!E2:E${LAST}`]: '=INDEX([Budget_Mar.xlsx]Budget!$B$2:$D$11,MATCH(A2,[Budget_Mar.xlsx]Budget!$A$2:$A$11,0),MATCH(C2,[Budget_Mar.xlsx]Budget!$B$1:$D$1,0))',
          },
        },
      ],
      xp: 40,
    },
    {
      id: 't2',
      title: 'Variance $ and a safe variance %',
      instruction: `Headers \`Var $\` in **F1** and \`Var %\` in **G1**.

- **F2:F${LAST}** — Actual − Budget.
- **G2:G${LAST}** — Var $ ÷ **ABS**(Budget), wrapped in **IFERROR** so a zero budget returns **0** instead of #DIV/0!.`,
      why: `**Why ABS?** Expenses are negative. Budget −100k, actual −120k: Var $ = −20k (bad). Dividing by the *signed* budget gives +20% — it would look *good*. Dividing by ABS(budget) keeps the sign meaning "favourable / unfavourable" for every line.

**Why IFERROR?** PHX-01's fee budget is 0, and one #DIV/0! will break every SUM, chart and pivot that touches the column. Returning 0 keeps the maths flowing — the 0 budget next to it tells the reader why. (Some teams prefer \`"n/a"\`; either is fine as long as it's deliberate.)`,
      hints: ['F2: =D2-E2', 'G2: =IFERROR(F2/ABS(E2),0)', 'Fill both down to row 31.'],
      check: (c) => {
        const base = all(
          hdr(c, 'Actuals!F1', 'Var $'),
          hdr(c, 'Actuals!G1', 'Var %'),
          formulasMatch(c, `Actuals!F2:F${LAST}`, /-/, 'Actual − Budget'),
          valuesEqual(c, `Actuals!F2:F${LAST}`, EXP_VAR, 'Var $'),
          formulasMatch(c, `Actuals!G2:G${LAST}`, /(IFERROR|IF)\(/i, 'IFERROR'),
          formulasMatch(c, `Actuals!G2:G${LAST}`, /ABS\(/i, 'ABS(Budget)'),
        );
        if (base !== true) return base;
        const got = c.list(`Actuals!G2:G${LAST}`);
        for (let i = 0; i < N; i++) {
          const e = EXP_PCT[i], g = got[i];
          if (e === null) {
            if (isErr(g)) return `G${i + 2} shows ${fmtScalar(g)} — the budget there is 0. Wrap the division in IFERROR.`;
          } else if (!approx(g, e, 1e-6)) return `G${i + 2} shows ${fmtScalar(g)} but should be ${fmtScalar(e)}. Did you divide by ABS(E${i + 2})?`;
        }
        return true;
      },
      solution: [{ set: { 'Actuals!F1': 'Var $', 'Actuals!G1': 'Var %', [`Actuals!F2:F${LAST}`]: '=D2-E2', [`Actuals!G2:G${LAST}`]: '=IFERROR(F2/ABS(E2),0)' } }],
      xp: 30,
    },
    {
      id: 't3',
      title: 'Prior month and MoM change',
      instruction: `Headers \`Feb Actual\` in **H1** and \`MoM $\` in **I1**.

- **H2:H${LAST}** — February's actual for the same Branch **and** Line from **[Actuals_Feb.xlsx]Actuals** (rows 2–${FEB_LAST}). Branches missing in February must return **0**.
- **I2:I${LAST}** — March Actual − Feb Actual.`,
      why: `February has the same two keys (branch + line) but in a different order, so you need a **two-key lookup**. Two good options:

- **XLOOKUP on a joined key**: \`XLOOKUP(A2&C2, FebBranch&FebLine, FebActual, 0)\` — joining the two lookup columns with & builds the composite key on the fly.
- **SUMIFS as a lookup**: \`SUMIFS(FebActual, FebBranch, A2, FebLine, C2)\` — returns 0 automatically when there's no match.

Both handle the new branch without an error. Just be sure the keys are unique — SUMIFS would silently *add* duplicates together.`,
      hints: [
        'The Feb columns are [Actuals_Feb.xlsx]Actuals!$A$2:$A$28 (Branch), $C$2:$C$28 (Line), $D$2:$D$28 (Actual).',
        `=XLOOKUP(A2&C2,[Actuals_Feb.xlsx]Actuals!$A$2:$A$${FEB_LAST}&[Actuals_Feb.xlsx]Actuals!$C$2:$C$${FEB_LAST},[Actuals_Feb.xlsx]Actuals!$D$2:$D$${FEB_LAST},0)`,
        'I2: =D2-H2',
      ],
      check: (c) =>
        all(
          hdr(c, 'Actuals!H1', 'Feb Actual'),
          hdr(c, 'Actuals!I1', 'MoM $'),
          formulasMatch(c, `Actuals!H2:H${LAST}`, /(XLOOKUP|SUMIFS|INDEX|VLOOKUP|SUMPRODUCT)\(/i, 'lookup'),
          refsBook(c, `Actuals!H2:H${LAST}`, /actuals_feb/i, 'Actuals_Feb.xlsx'),
          valuesEqual(c, `Actuals!H2:H${LAST}`, EXP_FEB, 'Feb Actual'),
          formulasMatch(c, `Actuals!I2:I${LAST}`, /-/, 'Mar − Feb'),
          valuesEqual(c, `Actuals!I2:I${LAST}`, EXP_MOM, 'MoM $'),
        ),
      solution: [
        {
          set: {
            'Actuals!H1': 'Feb Actual',
            'Actuals!I1': 'MoM $',
            [`Actuals!H2:H${LAST}`]: `=XLOOKUP(A2&C2,[Actuals_Feb.xlsx]Actuals!$A$2:$A$${FEB_LAST}&[Actuals_Feb.xlsx]Actuals!$C$2:$C$${FEB_LAST},[Actuals_Feb.xlsx]Actuals!$D$2:$D$${FEB_LAST},0)`,
            [`Actuals!I2:I${LAST}`]: '=D2-H2',
          },
        },
      ],
      xp: 35,
    },
    {
      id: 't4',
      title: 'Flag variances beyond ±10%',
      instruction: `Select **G2:G${LAST}** and add two Conditional Formatting rules ([[Alt]] [[H]] [[L]]):

- **Greater Than** \`0.1\` (or \`10%\`) with a fill colour
- **Less Than** \`-0.1\` with a fill colour`,
      why: `Thirty rows is already too many to read line by line in a meeting. Conditional formatting makes the ${FLAGGED} lines that need a story jump off the page — and because it's a rule, not manual colouring, it re-evaluates when the numbers change next month.

You need two rules because "more than 10% off" means *either* direction: a 25% cost overrun and a 25% revenue shortfall both need explaining.`,
      hints: ['Select G2:G31 first — the rule applies to the selection.', 'Alt, H, L → Highlight Cells Rules → Greater Than… → 0.1. Then again with Less Than… → -0.1.'],
      check: (c) => {
        const rules = c.sheet('Actuals')?.cf ?? [];
        const covers = (range: string) => {
          const g = parseRange(range);
          return !!g && g.c1 <= 6 && g.c2 >= 6 && g.r1 <= 1 && g.r2 >= N;
        };
        const num = (s?: string) => (s === undefined ? null : textToNumber(s));
        const gt = rules.some((x) => x.type === 'gt' && covers(x.range) && approx(num(x.a), 0.1, 1e-9));
        const lt = rules.some((x) => x.type === 'lt' && covers(x.range) && approx(num(x.a), -0.1, 1e-9));
        if (!gt) return 'Add a "Greater Than 0.1" rule that covers G2:G31.';
        if (!lt) return 'Add a "Less Than -0.1" rule that covers G2:G31.';
        return true;
      },
      solution: [{ select: `Actuals!G2:G${LAST}` }, { cf: { type: 'gt', a: '0.1', fill: '#FFC7CE' } }, { cf: { type: 'lt', a: '-0.1', fill: '#FFC7CE' } }],
      xp: 25,
    },
    {
      id: 't5',
      title: 'Quick pivot: actuals by region',
      instruction: `Click any cell in the **Actuals** table and insert a PivotTable ([[Alt]] [[N]] [[V]]) with **Region** in Rows and **Sum of Actual** in Values. It goes on a new sheet.`,
      why: `A pivot is the fastest way to answer "how did each region do?" without writing a formula — perfect for a director who wants a number *now*. It's also an independent cross-check for the SUMIFS summary you'll build next: two different methods, same answer.

(The pivot here is a static snapshot — refresh it if the data changes.)`,
      hints: ['Select Actuals!A1 (or any cell in the table), then Alt, N, V.', 'Rows: Region. Values: Actual, summarised by Sum.'],
      check: (c) => {
        const s = c.store;
        const bi = s.books.findIndex((b) => b.name === 'Actuals_Mar.xlsx');
        const book = s.books[bi];
        for (let si = 0; si < book.sheets.length; si++) {
          const sh = book.sheets[si];
          if (sh.name === 'Actuals' || sh.name === 'Summary') continue;
          const val = (rr: number, cc: number) => s.calc.value(bi, si, rr, cc);
          let vcol = -1;
          for (let cc = 1; cc < 12; cc++) if (/sum of actual$/i.test(String(val(0, cc) ?? ''))) vcol = cc;
          if (vcol < 0) continue;
          const found = SUM_REGIONS.map((g, i) => {
            for (let rr = 1; rr < 40; rr++) if (String(val(rr, 0) ?? '').toLowerCase() === g.toLowerCase()) return approx(val(rr, vcol), REG_ACT[i], 1e-6);
            return false;
          });
          if (found.every(Boolean)) return true;
          return 'Your pivot has Sum of Actual, but the regions don\'t match — put Region (not Branch) in Rows.';
        }
        return 'Insert a PivotTable from the Actuals table with Region in Rows and Sum of Actual in Values.';
      },
      solution: [{ select: 'Actuals!A1' }, { pivot: { rows: ['Region'], values: [{ field: 'Actual', agg: 'sum' }], sheetName: 'Region_Pivot' } }],
      xp: 25,
    },
    {
      id: 't6',
      title: 'Region summary with SUMIFS',
      instruction: `On **Summary**, for each region in A5:A9:

- **B5:B9** — total Actual, **C5:C9** — total Budget (SUMIFS on the Actuals tab, matching Region in column B).
- **D5:D9** — Var $ (Actual − Budget).
- **E5:E9** — Var % with the same IFERROR / ABS logic as before.`,
      why: `Unlike the pivot, this table is **live** and laid out exactly as the deck needs. Tip: write B5 as \`=SUMIFS(Actuals!D:D,Actuals!$B:$B,$A5)\` — the sum column is *relative*, so copying it one column right turns D:D into E:E (Budget) automatically. One formula fills both columns.`,
      hints: ['B5: =SUMIFS(Actuals!D:D,Actuals!$B:$B,$A5) — copy to B5:C9.', 'D5: =B5-C5', 'E5: =IFERROR(D5/ABS(C5),0)'],
      check: (c) =>
        all(
          formulasMatch(c, 'Summary!B5:C9', /SUMIFS?\(/i, 'SUMIFS'),
          valuesEqual(c, 'Summary!B5:B9', REG_ACT, 'Actual'),
          valuesEqual(c, 'Summary!C5:C9', REG_BUD, 'Budget'),
          formulasMatch(c, 'Summary!D5:D9', /-/, 'Actual − Budget'),
          valuesEqual(c, 'Summary!D5:D9', REG_VAR, 'Var $'),
          formulasMatch(c, 'Summary!E5:E9', /ABS\(/i, 'IFERROR(…/ABS(Budget))'),
          valuesEqual(c, 'Summary!E5:E9', REG_PCT, 'Var %'),
        ),
      solution: [{ set: { 'Summary!B5:C9': '=SUMIFS(Actuals!D:D,Actuals!$B:$B,$A5)', 'Summary!D5:D9': '=B5-C5', 'Summary!E5:E9': '=IFERROR(D5/ABS(C5),0)' } }],
      xp: 30,
    },
    {
      id: 't7',
      title: 'Totals and tie-out',
      instruction: `Row 10 is the **Total**: B10:D10 add up the regions, **E10** is the total Var % (same IFERROR / ABS formula). Then in **B12** prove the summary is complete: B10 minus the sum of **Actuals!D2:D${LAST}**. It must be **0**.`,
      why: `Notice E10 is **recomputed** from the totals, not summed or averaged from E5:E9 — percentages don't add, and a simple average would weight a tiny region the same as a big one.

The B12 check catches any row whose region label doesn't exactly match the summary (a typo like "North East" would silently fall out of every SUMIFS).`,
      hints: ['B10: =SUM(B5:B9), copied to C10:D10.', 'E10: =IFERROR(D10/ABS(C10),0)', `B12: =B10-SUM(Actuals!D2:D${LAST})`],
      check: (c) =>
        all(
          formulasMatch(c, 'Summary!B10:D10', /SUM\(/i, 'SUM'),
          valuesEqual(c, 'Summary!B10:D10', [TOT_ACT, TOT_BUD, TOT_ACT - TOT_BUD], 'Totals'),
          c.f('Summary!E10').startsWith('=') && approx(c.v('Summary!E10'), (TOT_ACT - TOT_BUD) / Math.abs(TOT_BUD), 1e-6) ? true : 'E10 should recompute Var % from the totals: =IFERROR(D10/ABS(C10),0).',
          /actuals!/i.test(c.f('Summary!B12')) && typeof c.v('Summary!B12') === 'number' && Math.abs(c.v('Summary!B12') as number) < 0.01
            ? true
            : `B12 should be B10 minus the sum of the Actuals tab, and show 0 (shows ${fmtScalar(c.v('Summary!B12'))}).`,
        ),
      solution: [{ set: { 'Summary!B10:D10': '=SUM(B5:B9)', 'Summary!E10': '=IFERROR(D10/ABS(C10),0)', 'Summary!B12': `=B10-SUM(Actuals!D2:D${LAST})` } }],
      xp: 25,
    },
    {
      id: 't8',
      title: 'Auto-commentary',
      instruction: `In **F5:F9** build a one-line comment per region by joining text with **&** and formatting the numbers with **TEXT**, e.g.

\`Northeast: 52,340 ahead of budget (3.1%)\`

The comment must include the region name and the variance % formatted as a percentage. Bonus: say "ahead of" or "behind" depending on the sign.`,
      why: `Numbers glued into text lose their formatting — \`="Var: "&D5\` shows \`Var: 52340.4200000001\`. **TEXT(value, "format")** applies a number format inside the string: \`"#,##0"\` for amounts, \`"0.0%"\` for percentages.

Formula-driven commentary means the sentence updates when the numbers do. You'll still add the *why* by hand ("NII up on deposit repricing") — but the *what* is never stale or mistyped.`,
      hints: [
        'Join pieces with &: =A5&": "&TEXT(ABS(D5),"#,##0")&…',
        'IF(D5>=0," ahead of"," behind") picks the wording.',
        '=A5&": "&TEXT(ABS(D5),"#,##0")&IF(D5>=0," ahead of"," behind")&" budget ("&TEXT(E5,"0.0%")&")"',
      ],
      check: (c) => {
        for (let i = 0; i < SUM_REGIONS.length; i++) {
          const a = `Summary!F${5 + i}`;
          const f = c.f(a), v = c.v(a);
          if (!f.startsWith('=')) return `F${5 + i} should be a formula, not typed text.`;
          if (!/TEXT\(/i.test(f)) return `F${5 + i} should format the numbers with TEXT().`;
          if (typeof v !== 'string' || !v.toLowerCase().includes(SUM_REGIONS[i].toLowerCase())) return `F${5 + i} should mention the region (${SUM_REGIONS[i]}).`;
          if (!v.includes('%')) return `F${5 + i} should include the variance % (use TEXT(E${5 + i},"0.0%")).`;
        }
        return true;
      },
      solution: [{ set: { 'Summary!F5:F9': '=A5&": "&TEXT(ABS(D5),"#,##0")&IF(D5>=0," ahead of"," behind")&" budget ("&TEXT(E5,"0.0%")&")"' } }],
      xp: 30,
    },
    {
      id: 't9',
      title: 'Format the pack',
      instruction: `- **Actuals!G2:G${LAST}** and **Summary!E5:E10** → Percent ([[Ctrl+Shift+%]]).
- **Summary!B5:D10** → thousands separator (Comma Style, [[Alt]] [[H]] [[K]]).`,
      why: `0.1234 in a variance column makes people ask "12% or 0.12%?". Percent format answers it. Same for amounts: separators make 1,234,567 readable at a glance in a meeting room.`,
      hints: ['Select Actuals!G2:G31, Ctrl+Shift+%. Same for Summary!E5:E10.', 'Select Summary!B5:D10 then Alt, H, K.'],
      check: (c) =>
        all(
          fmtHas(c, [...cellsOf('Actuals', 'G', 2, LAST), ...cellsOf('Summary', 'E', 5, 10)], /%/, 'a percent format'),
          fmtHas(c, cellsOf('Summary', 'BCD', 5, 10), /#,##0/, 'a thousands-separator format'),
        ),
      solution: [
        { select: `Actuals!G2:G${LAST}` },
        { cmd: 'fmt.percent' },
        { select: 'Summary!E5:E10' },
        { cmd: 'fmt.percent' },
        { select: 'Summary!B5:D10' },
        { cmd: 'fmt.comma' },
      ],
      xp: 20,
    },
  ],
};
