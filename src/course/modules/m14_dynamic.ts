import type { CheckCtx, Module } from '../types';
import { makeBook, customers, loans } from '../data';
import { all, approx, valuesEqual } from '../runner';

// ---------------------------------------------------------------------------
// Data: 80-loan tape (rows 2..81)
// ---------------------------------------------------------------------------

const CS = customers(60, 7);
const LS = loans(CS, 80, 23);
const N = LS.length;
const LAST = N + 1;
const HEAD = ['Loan ID', 'Customer', 'Branch', 'Product', 'Status', 'Balance', 'Rate', 'DPD'];
const tapeRows = () => [HEAD, ...LS.map((l) => [l.id, l.cust, l.branch, l.product, l.status, l.balance, l.rate, l.dpd])];
const WIDTHS = [100, 80, 80, 110, 100, 110, 70, 60];
const FORMATS = { 5: '#,##0.00', 6: '0.00%' };

const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const cmpText = (a: string, b: string) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0);
const sumBal = (ls: typeof LS) => ls.reduce((a, l) => a + l.balance, 0);

// Lesson 1
const branchesFirstSeen = uniq(LS.map((l) => l.branch));
const branchesSorted = [...branchesFirstSeen].sort(cmpText);
const delinqIds = LS.filter((l) => l.status === 'Delinquent').map((l) => l.id);
const nCustomers = uniq(LS.map((l) => l.cust)).length;
const BLOCK_ROW = 5; // stray note that blocks the FILTER spill in column M

// Lesson 2: choose the branch with the most loans 30+ days past due
const MIN_DPD = 30;
const focus = [...branchesSorted].sort((a, b) => LS.filter((l) => l.branch === b && l.dpd >= MIN_DPD).length - LS.filter((l) => l.branch === a && l.dpd >= MIN_DPD).length)[0];
const focusLoans = LS.filter((l) => l.branch === focus);
const focusLate = focusLoans.filter((l) => l.dpd >= MIN_DPD).map((l) => l.id);
const unsecured = LS.filter((l) => l.product === 'Credit Card' || l.product === 'Personal Loan').map((l) => l.id);
const top10 = LS.map((l, i) => ({ l, i }))
  .sort((a, b) => b.l.balance - a.l.balance || a.i - b.i)
  .slice(0, 10)
  .map((x) => x.l);

// Lesson 3
const simpleAvg = LS.reduce((a, l) => a + l.rate, 0) / N;
const waRate = LS.reduce((a, l) => a + l.balance * l.rate, 0) / sumBal(LS);
const mort = LS.filter((l) => l.product === 'Mortgage');
const waMort = mort.reduce((a, l) => a + l.balance * l.rate, 0) / sumBal(mort);
const naBranches = uniq(LS.filter((l) => l.status === 'Non-Accrual').map((l) => l.branch)).sort(cmpText).join(', ');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isErrV = (v: unknown) => !!v && typeof v === 'object' && 'code' in (v as object);
const errCode = (v: unknown) => (isErrV(v) ? String((v as { code: string }).code) : '');

/** The anchor holds a formula using `fn` and spills exactly `expected` down its column. */
function spillCheck(c: CheckCtx, sheetPrefix: string, col: string, row: number, fn: RegExp, expected: (string | number)[], label: string): true | string {
  const anchor = `${sheetPrefix}${col}${row}`;
  const f = c.f(anchor);
  if (!f.startsWith('=')) return `${anchor} should hold a formula.`;
  if (!fn.test(f)) return `${anchor} should use ${label}.`;
  const v0 = c.v(anchor);
  if (errCode(v0) === '#SPILL!') return `${anchor} shows #SPILL! — something is in the way of the results. Clear the cells below it.`;
  if (isErrV(v0)) return `${anchor} shows ${errCode(v0)} — check the ranges.`;
  const res = valuesEqual(c, `${sheetPrefix}${col}${row}:${col}${row + expected.length - 1}`, expected, label);
  if (res !== true) return res;
  const after = c.v(`${sheetPrefix}${col}${row + expected.length}`);
  return after === null ? true : `${label} should stop after ${expected.length} rows — is the source range right (rows 2 to ${LAST})?`;
}

const tapeBook = (name: string, extra?: (rows: (string | number)[][]) => void) => {
  const rows = tapeRows() as (string | number)[][];
  extra?.(rows);
  return makeBook(name, [{ name: 'Loans', rows, widths: WIDTHS, formats: FORMATS, freeze: true }]);
};

// ---------------------------------------------------------------------------

export const module: Module = {
  id: 'm14',
  title: 'Dynamic Arrays & Modern Excel',
  level: 'Hero',
  icon: '🌊',
  blurb: 'One formula, many results: UNIQUE, SORT, FILTER, SEQUENCE, spill references, SUMPRODUCT weighted averages, LET and TEXTJOIN.',
  lessons: [
    // ------------------------------------------------------------------ L1
    {
      id: 'm14-l1',
      title: 'Spill: UNIQUE, SORT & the # reference',
      summary: 'Write one formula that fills a whole list, refer to it with J2#, and fix #SPILL!.',
      minutes: 10,
      featured: ['UNIQUE', 'SORT', 'COUNTA', 'J2#', '#SPILL!'],
      intro: `In modern Excel (365 / 2021+), a formula can return **many values**. They **spill** into the cells below/right of the formula — you type in one cell, the result fills as many as it needs, and resizes automatically when the data changes.

- \`=UNIQUE(C2:C81)\` → the distinct branches, one per row
- \`=SORT(UNIQUE(C2:C81))\` → the same, A→Z
- Only the top-left cell (the **anchor**) holds the formula; the rest are "ghost" values you can't edit individually.

**The spill reference \`#\`:** \`J2#\` means "the whole spilled range anchored at J2, whatever its size today". \`=SUMIF(C2:C81,J2#,F2:F81)\` spills a total next to *every* branch — add a new branch to the data and both columns grow together. No more dragging formulas down and forgetting the last row.

**#SPILL! means "something is in my way".** A value (even a space or an old note) inside the area the result needs blocks the whole spill. Click the anchor — Excel draws a dashed border around the area it wants — and clear the blocker.

**Why analysts love this:** a distinct list of branches/products/customers used to need Remove Duplicates (a manual, one-off step). UNIQUE is *live*: next month's extract, same formula, new answer. And \`=COUNTA(UNIQUE(range))\` is the one-cell answer to "how many distinct customers do we lend to?"`,
      workbooks: () => [
        tapeBook('Loan_Tape_Dynamic.xlsx', (rows) => {
          rows[0].push('', 'Branch', 'Balance', '', 'Delinquent loans', '', 'Distinct customers');
          rows[BLOCK_ROW - 1][12] = 'old note';
        }),
      ],
      start: { cell: 'J2' },
      tasks: [
        {
          id: 't1',
          title: 'A live list of branches',
          instruction: 'In **J2** enter `=UNIQUE(C2:C81)` — one formula, and the distinct branches spill down column J.',
          why: 'This replaces copy → paste → Remove Duplicates. The difference: it is a formula, so when the tape is refreshed next month the list updates itself — no stale branch list in your report.',
          hints: ['Type the formula only in J2; do not fill it down.', '=UNIQUE(C2:C81)'],
          check: (c) => spillCheck(c, '', 'J', 2, /UNIQUE\(/i, branchesFirstSeen, 'UNIQUE branch list'),
          solution: [{ set: { J2: '=UNIQUE(C2:C81)' } }],
        },
        {
          id: 't2',
          title: 'Sort it',
          instruction: 'Edit **J2** ([[F2]]) and wrap it in SORT: `=SORT(UNIQUE(C2:C81))`.',
          why: 'UNIQUE keeps first-seen order, which is random from a reader\'s point of view. Nesting is the dynamic-array superpower: the output of one array function feeds the next. SORT works on the whole array in memory, the sheet never sees the unsorted version.',
          hints: ['Press F2 to edit, Home to jump to the start (after the =), type SORT(, End, type ).', '=SORT(UNIQUE(C2:C81))'],
          check: (c) => spillCheck(c, '', 'J', 2, /SORT\(\s*UNIQUE\(/i, branchesSorted, 'sorted branch list'),
          solution: [{ set: { J2: '=SORT(UNIQUE(C2:C81))' } }],
        },
        {
          id: 't3',
          title: 'Totals that follow the list (J2#)',
          instruction: 'In **K2** enter `=SUMIF(C2:C81,J2#,F2:F81)` — a balance for every branch in the spilled list.',
          why: '`J2#` always means "the entire spill at J2", however many rows it has. If a new branch appears next month, J grows by one row and K grows with it. A dragged-down formula would stop one row short and nobody would notice. (In Excel 365 SUMIFS accepts J2# too; in this trainer use SUMIF for spilled criteria.)',
          hints: ['Type J2 and then the # sign — Excel also writes it for you if you select the whole spilled range while typing.', '=SUMIF(C2:C81,J2#,F2:F81)'],
          check: (c) =>
            all(
              /J2#/i.test(c.f('K2')) ? true : 'K2 should use the spill reference J2# (not J2:J11).',
              spillCheck(c, '', 'K', 2, /SUMIFS?\(/i, branchesSorted.map((b) => sumBal(LS.filter((l) => l.branch === b))), 'Branch balances'),
            ),
          solution: [{ set: { K2: '=SUMIF(C2:C81,J2#,F2:F81)' } }],
        },
        {
          id: 't4',
          title: 'Fix a #SPILL!',
          instruction: `In **M2** enter \`=FILTER(A2:A81,E2:E81="Delinquent")\`. It shows **#SPILL!** — an old note in **M${BLOCK_ROW}** is in the way. Select M${BLOCK_ROW} and press [[Delete]].`,
          why: '#SPILL! is not a formula error — your logic is fine, the result just has nowhere to go. Excel refuses to overwrite data silently (good!), so it is your job to clear the path. Typical culprits: leftover notes, a space character, or another spill.',
          hints: [`The blocker is M${BLOCK_ROW}. Delete clears it.`, 'The FILTER result appears as soon as the path is clear.'],
          check: (c) =>
            all(
              c.f(`M${BLOCK_ROW}`) === '' ? true : `M${BLOCK_ROW} still holds the old note — clear it.`,
              spillCheck(c, '', 'M', 2, /FILTER\(/i, delinqIds, 'Delinquent loan list'),
            ),
          solution: [{ set: { M2: '=FILTER(A2:A81,E2:E81="Delinquent")' } }, { select: `M${BLOCK_ROW}` }, { cmd: 'edit.clear' }],
        },
        {
          id: 't5',
          title: 'Count distinct customers',
          instruction: 'In **O2** enter `=COUNTA(UNIQUE(B2:B81))` — how many different customers are on the tape?',
          why: `COUNTA counts the items in the UNIQUE array (${nCustomers} customers hold ${N} loans). "Distinct count" questions — customers, accounts, counterparties — come up constantly, and before dynamic arrays they needed a pivot or a SUMPRODUCT(1/COUNTIF()) trick.`,
          hints: ['UNIQUE builds the list in memory; COUNTA counts it.', '=COUNTA(UNIQUE(B2:B81))'],
          check: (c) =>
            all(
              /COUNTA\(\s*UNIQUE\(/i.test(c.f('O2')) || /ROWS\(\s*UNIQUE\(/i.test(c.f('O2')) ? true : 'O2 should use COUNTA(UNIQUE(...)).',
              c.v('O2') === nCustomers ? true : `O2 should be ${nCustomers}. Check the range is the Customer column B2:B81.`,
            ),
          solution: [{ set: { O2: '=COUNTA(UNIQUE(B2:B81))' } }],
        },
      ],
    },

    // ------------------------------------------------------------------ L2
    {
      id: 'm14-l2',
      title: 'FILTER, SORTBY & SEQUENCE',
      summary: 'Build a live watch-list: multi-condition FILTER with * and +, a top-10 with SORTBY, and rank numbers with SEQUENCE.',
      minutes: 12,
      featured: ['FILTER', 'SORTBY', 'SEQUENCE', 'TAKE', 'XLOOKUP'],
      intro: `**FILTER(array, include, [if_empty])** returns only the rows where *include* is TRUE. It is AutoFilter as a formula — live, and it can sit on a different sheet from the data.

**Multiple conditions use arithmetic on TRUE/FALSE:**
- **AND → multiply:** \`(Branch="NYC-02")*(DPD>=30)\` — TRUE×TRUE = 1, anything×FALSE = 0.
- **OR → add:** \`(Product="Credit Card")+(Product="Personal Loan")\` — any TRUE gives ≥ 1.
- Wrap each test in its own brackets. \`AND()\`/\`OR()\` do **not** work here: they collapse the whole column to one TRUE/FALSE.
- Give the third argument (e.g. \`"None"\`) so an empty result shows a message instead of #CALC!.

**SORTBY(array, by_array, order)** sorts one array by another (order **-1** = descending) — e.g. loan IDs by balance, without showing the balance. **TAKE(array, 10)** keeps the first 10 rows → a top-10 list.

**SEQUENCE(n)** returns 1, 2, … n — handy for rank labels, period numbers or row counters.

**Driver cells:** put the criteria (branch, DPD threshold) in input cells and point FILTER at them. Change the input, the report rebuilds — that's how you hand a manager a tool instead of a static list.`,
      workbooks: () => [
        makeBook('Watchlist.xlsx', [
          { name: 'Loans', rows: tapeRows(), widths: WIDTHS, formats: FORMATS, freeze: true },
          {
            name: 'Report',
            rows: [
              ['Branch', focus],
              ['Min DPD', MIN_DPD],
              [],
              [...HEAD, '', `${focus} ${MIN_DPD}+ DPD`, '', 'Unsecured loans', '', 'Rank', 'Top 10 by balance', 'Balance'],
            ],
            header: false,
            widths: [100, 80, 80, 110, 100, 110, 70, 60, 20, 130, 20, 120, 20, 50, 130, 110],
            styles: Object.fromEntries(['A1', 'A2', ...'ABCDEFGHJLNOP'.split('').map((x) => `${x}4`)].map((a) => [a, { b: true, fill: '#DDEBF7' }])),
          },
        ]),
      ],
      start: { sheet: 'Report', cell: 'A5' },
      tasks: [
        {
          id: 't1',
          title: 'All loans for one branch',
          instruction: 'On **Report**, in **A5** enter `=FILTER(Loans!A2:H81,Loans!C2:C81=B1)` — every column of every loan whose branch matches the driver cell **B1**.',
          why: 'FILTER returns whole rows (8 columns here) from one formula. Pointing the condition at B1 instead of typing "NYC-02" makes the report reusable: change B1 and the extract rebuilds itself.',
          hints: ['First argument: the whole table Loans!A2:H81. Second: the test Loans!C2:C81=B1.', '=FILTER(Loans!A2:H81,Loans!C2:C81=B1)'],
          check: (c) =>
            all(
              spillCheck(c, 'Report!', 'A', 5, /FILTER\(/i, focusLoans.map((l) => l.id), `${focus} loan IDs`),
              valuesEqual(c, `Report!F5:F${4 + focusLoans.length}`, focusLoans.map((l) => l.balance), 'Balances (column F)'),
              /B1/i.test(c.f('Report!A5')) ? true : 'Point the condition at the driver cell B1 rather than typing the branch.',
            ),
          solution: [{ set: { 'Report!A5': '=FILTER(Loans!A2:H81,Loans!C2:C81=B1)' } }],
        },
        {
          id: 't2',
          title: 'AND: branch and DPD',
          instruction: 'In **J5** list the loan IDs of that branch that are at least **B2** days past due:\n\n`=FILTER(Loans!A2:A81,(Loans!C2:C81=B1)*(Loans!H2:H81>=B2),"None")`',
          why: 'Multiplying the two TRUE/FALSE columns is AND: only rows where both are TRUE give 1. The "None" fallback matters in a live report — if the branch cures all its arrears, you want a clean message, not #CALC!.',
          hints: ['Each condition in its own brackets, joined with *.', 'Third argument "None" handles an empty result.'],
          check: (c) =>
            all(
              /\)\s*\*\s*\(/.test(c.f('Report!J5')) ? true : 'Join the two conditions with * — (cond1)*(cond2).',
              spillCheck(c, 'Report!', 'J', 5, /FILTER\(/i, focusLate.length ? focusLate : ['None'], `${focus} loans ${MIN_DPD}+ DPD`),
            ),
          solution: [{ set: { 'Report!J5': '=FILTER(Loans!A2:A81,(Loans!C2:C81=B1)*(Loans!H2:H81>=B2),"None")' } }],
        },
        {
          id: 't3',
          title: 'OR: unsecured products',
          instruction: 'In **L5** list every **Credit Card** *or* **Personal Loan** (the unsecured book):\n\n`=FILTER(Loans!A2:A81,(Loans!D2:D81="Credit Card")+(Loans!D2:D81="Personal Loan"))`',
          why: 'Adding the conditions is OR: a row passes if either test is TRUE. Unsecured lending carries higher loss-given-default, so risk teams often carve it out. Common mistake: =FILTER(…, OR(cond1, cond2)) — OR squashes 80 rows into a single TRUE and FILTER fails.',
          hints: ['Use + between the bracketed conditions.', 'Both conditions test the Product column D.'],
          check: (c) =>
            all(
              /\)\s*\+\s*\(/.test(c.f('Report!L5')) ? true : 'Join the conditions with + — (cond1)+(cond2).',
              spillCheck(c, 'Report!', 'L', 5, /FILTER\(/i, unsecured, 'Unsecured loan list'),
            ),
          solution: [{ set: { 'Report!L5': '=FILTER(Loans!A2:A81,(Loans!D2:D81="Credit Card")+(Loans!D2:D81="Personal Loan"))' } }],
        },
        {
          id: 't4',
          title: 'Rank labels with SEQUENCE',
          instruction: 'In **N5** enter `=SEQUENCE(10)` to number the top-10 list 1 to 10.',
          why: 'SEQUENCE generates numbers instead of you typing or dragging them — and because it is a formula you can make it dynamic, e.g. SEQUENCE(B3) for a user-chosen top-N, or SEQUENCE(360) for the periods of a mortgage schedule.',
          hints: ['=SEQUENCE(10)'],
          check: (c) => spillCheck(c, 'Report!', 'N', 5, /SEQUENCE\(/i, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'Rank 1-10'),
          solution: [{ set: { 'Report!N5': '=SEQUENCE(10)' } }],
        },
        {
          id: 't5',
          title: 'Top 10 by balance with SORTBY',
          instruction: 'In **O5** list the 10 largest loans by balance:\n\n`=TAKE(SORTBY(Loans!A2:A81,Loans!F2:F81,-1),10)`',
          why: 'SORTBY sorts the IDs by a different column (balance, descending with -1) without copying or re-sorting the source — the tape stays in its original order for everyone else. TAKE keeps the first 10. Unlike the "sort then SUM(E2:E6)" trick, this is position-independent and live.',
          hints: ['SORTBY(what to return, what to sort by, -1 for largest first).', 'TAKE(array, 10) keeps the first ten rows.'],
          check: (c) => spillCheck(c, 'Report!', 'O', 5, /SORTBY\(/i, top10.map((l) => l.id), 'Top-10 loan IDs'),
          solution: [{ set: { 'Report!O5': '=TAKE(SORTBY(Loans!A2:A81,Loans!F2:F81,-1),10)' } }],
        },
        {
          id: 't6',
          title: 'Look up a whole spill',
          instruction: 'In **P5** fetch the balance for every ID in the top-10 list at once: `=XLOOKUP(O5#,Loans!A2:A81,Loans!F2:F81)`.',
          why: 'Feeding a spill reference (O5#) into XLOOKUP looks up all ten IDs in one go and spills ten answers. One formula to audit instead of ten, and it can never fall out of step with the list next to it.',
          hints: ['O5# = the whole top-10 list.', '=XLOOKUP(O5#,Loans!A2:A81,Loans!F2:F81)'],
          check: (c) =>
            all(
              /O5#/i.test(c.f('Report!P5')) ? true : 'P5 should look up O5# (the spill reference), not a single cell.',
              spillCheck(c, 'Report!', 'P', 5, /(XLOOKUP|VLOOKUP|INDEX)\(/i, top10.map((l) => l.balance), 'Top-10 balances'),
            ),
          solution: [{ set: { 'Report!P5': '=XLOOKUP(O5#,Loans!A2:A81,Loans!F2:F81)' } }],
        },
      ],
    },

    // ------------------------------------------------------------------ L3
    {
      id: 'm14-l3',
      title: 'SUMPRODUCT, LET & TEXTJOIN',
      summary: 'Balance-weighted average rates, readable formulas with LET, and one-cell lists with TEXTJOIN.',
      minutes: 10,
      featured: ['SUMPRODUCT', 'LET', 'TEXTJOIN', 'AVERAGE'],
      intro: `**Weighted averages are everywhere in banking.** The "average rate on the book" is not the average of the rates — a $400k mortgage at 5% matters far more than an $8k card at 20%. The **balance-weighted average rate** is

\`=SUMPRODUCT(Balance, Rate) / SUM(Balance)\`

SUMPRODUCT multiplies the two columns row by row and adds the products (Σ balance × rate); dividing by Σ balance gives the weighted average. The same pattern gives weighted average maturity, weighted LTV, weighted PD…

**Conditions inside SUMPRODUCT:** multiply by a TRUE/FALSE test — \`(Product="Mortgage")*Balance*Rate\` keeps only mortgage rows.

**LET** names the pieces of a formula: \`=LET(bal, F2:F81, rate, G2:G81, SUMPRODUCT(bal,rate)/SUM(bal))\`. Benefits: readable (reviewers see *bal* and *rate*, not cell soup), each range is written once (one place to fix), and repeated sub-calculations are computed once.

**TEXTJOIN(delimiter, ignore_empty, values…)** glues an array into one string: \`=TEXTJOIN(", ", TRUE, list)\` → "ATL-01, BOS-01". Perfect for commentary cells: "Non-accrual loans sit in: …".

**Common mistakes:** averaging rates with AVERAGE when the question is about the book; mismatched range sizes in SUMPRODUCT (#VALUE!); forgetting the denominator must use the *same* filter as the numerator.`,
      workbooks: () => [
        tapeBook('Rate_Analysis.xlsx', (rows) => {
          const labels = ['Simple average rate', 'Weighted average rate', 'Mortgage WA rate', 'WA rate (LET)', 'Non-accrual branches'];
          labels.forEach((t, i) => {
            rows[i + 1][9] = t;
          });
          rows[0][9] = 'Metric';
          rows[0][10] = 'Value';
        }),
      ],
      start: { cell: 'K2' },
      tasks: [
        {
          id: 't1',
          title: 'Simple vs weighted average rate',
          instruction: 'In **K2** enter `=AVERAGE(G2:G81)`. In **K3** enter the balance-weighted average: `=SUMPRODUCT(F2:F81,G2:G81)/SUM(F2:F81)`. Format both as % with 2 decimals.',
          why: `The simple average (${(simpleAvg * 100).toFixed(2)}%) is pulled up by many small, high-rate credit cards; the weighted figure (${(waRate * 100).toFixed(2)}%) reflects where the money actually is. Net interest income is driven by the weighted number — quoting the simple one to ALCO would overstate the book's yield.`,
          hints: ['SUMPRODUCT(F2:F81,G2:G81) = Σ balance × rate.', 'Divide by SUM(F2:F81), the total balance.'],
          check: (c) =>
            all(
              /AVERAGE\(/i.test(c.f('K2')) && approx(c.v('K2'), simpleAvg, 1e-6) ? true : 'K2 should be =AVERAGE(G2:G81).',
              /SUMPRODUCT\(/i.test(c.f('K3')) ? true : 'K3 should use SUMPRODUCT.',
              approx(c.v('K3'), waRate, 1e-6) ? true : 'K3 should be Σ(balance × rate) / Σ balance — check both ranges cover rows 2-81 and you divide by SUM(F2:F81).',
            ),
          solution: [{ set: { K2: '=AVERAGE(G2:G81)', K3: '=SUMPRODUCT(F2:F81,G2:G81)/SUM(F2:F81)' } }, { select: 'K2:K3' }, { cmd: 'fmt.percent' }, { cmd: 'fmt.decInc' }, { cmd: 'fmt.decInc' }],
        },
        {
          id: 't2',
          title: 'Weighted rate for mortgages only',
          instruction: 'In **K4** compute the weighted average rate of **Mortgages** only:\n\n`=SUMPRODUCT((D2:D81="Mortgage")*F2:F81*G2:G81)/SUMIF(D2:D81,"Mortgage",F2:F81)`',
          why: 'The (D2:D81="Mortgage") test turns into 1s and 0s, switching non-mortgage rows off in the numerator. The denominator must apply the same condition — dividing by the whole book\'s balance is the classic mistake and gives a meaninglessly small rate.',
          hints: ['Numerator: SUMPRODUCT of condition × balance × rate.', 'Denominator: SUMIF of the mortgage balances only.'],
          check: (c) =>
            all(
              /SUMPRODUCT\(/i.test(c.f('K4')) ? true : 'K4 should use SUMPRODUCT with a Mortgage condition.',
              approx(c.v('K4'), waMort, 1e-6) ? true : 'K4 is off — does the denominator include only mortgage balances?',
            ),
          solution: [{ set: { K4: '=SUMPRODUCT((D2:D81="Mortgage")*F2:F81*G2:G81)/SUMIF(D2:D81,"Mortgage",F2:F81)' } }],
        },
        {
          id: 't3',
          title: 'Make it readable with LET',
          instruction: 'In **K5** rewrite the book-level weighted rate with named pieces:\n\n`=LET(bal,F2:F81,rate,G2:G81,SUMPRODUCT(bal,rate)/SUM(bal))`\n\nIt must equal K3.',
          why: 'LET pairs a name with a value, then uses the names in the final calculation. A model reviewer can read "SUMPRODUCT(bal, rate)/SUM(bal)" in one go, and if the tape grows you change F2:F81 once, not twice. In long formulas LET also avoids calculating the same thing repeatedly.',
          hints: ['LET(name1, value1, name2, value2, calculation).', 'Names cannot look like cell addresses (e.g. "B1") — use words.'],
          check: (c) =>
            all(
              /^=LET\(/i.test(c.f('K5')) ? true : 'K5 should start with =LET(.',
              approx(c.v('K5'), waRate, 1e-6) ? true : 'K5 should equal the weighted average rate in K3.',
            ),
          solution: [{ set: { K5: '=LET(bal,F2:F81,rate,G2:G81,SUMPRODUCT(bal,rate)/SUM(bal))' } }],
        },
        {
          id: 't4',
          title: 'One-cell commentary with TEXTJOIN',
          instruction: 'In **K6** produce a sorted, comma-separated list of the branches that hold Non-Accrual loans:\n\n`=TEXTJOIN(", ",TRUE,SORT(UNIQUE(FILTER(C2:C81,E2:E81="Non-Accrual"))))`',
          why: 'Read it inside-out: FILTER keeps the branches of non-accrual loans, UNIQUE removes repeats, SORT orders them, TEXTJOIN glues them into a sentence-ready string. Commentary cells like this ("Non-accrual exposure sits in CHI-01, DAL-01…") update themselves every month.',
          hints: ['Build it from the inside: FILTER → UNIQUE → SORT → TEXTJOIN.', 'TEXTJOIN(", ", TRUE, array) — TRUE ignores empty values.'],
          check: (c) =>
            all(
              /TEXTJOIN\(/i.test(c.f('K6')) && /FILTER\(/i.test(c.f('K6')) ? true : 'K6 should use TEXTJOIN around a FILTER.',
              String(c.v('K6') ?? '') === naBranches ? true : `K6 should read "${naBranches}".`,
            ),
          solution: [{ set: { K6: '=TEXTJOIN(", ",TRUE,SORT(UNIQUE(FILTER(C2:C81,E2:E81="Non-Accrual"))))' } }],
        },
      ],
    },
  ],
  quiz: [
    {
      kind: 'mc',
      q: 'J2 contains =UNIQUE(C2:C81) and shows #SPILL!. What is the fix?',
      options: ['Wrap it in IFERROR', 'Clear the non-empty cell(s) in the area below J2', 'Change UNIQUE to SORT', 'Press Ctrl+Shift+Enter'],
      answer: 1,
      explain: '#SPILL! means the result has nowhere to go — something occupies the spill area. Clear it and the result appears.',
    },
    {
      kind: 'mc',
      q: 'What does J2# refer to?',
      options: ['Cell J2 only', 'The entire spilled range anchored at J2, whatever its current size', 'Column J', 'The number format of J2'],
      answer: 1,
      explain: 'The # spill operator tracks the full, current size of a dynamic array result.',
    },
    {
      kind: 'mc',
      q: 'Which include-argument returns rows where Region is "West" AND Balance > 1,000,000?',
      options: ['AND(B2:B99="West",C2:C99>1000000)', '(B2:B99="West")*(C2:C99>1000000)', '(B2:B99="West")+(C2:C99>1000000)', 'B2:B99="West",C2:C99>1000000'],
      answer: 1,
      explain: 'Multiply bracketed conditions for AND, add them for OR. AND() collapses the arrays to a single TRUE/FALSE.',
    },
    {
      kind: 'formula',
      q: 'How many distinct branches appear in A2:A7?',
      grid: [['Branch'], ['NYC-01'], ['CHI-01'], ['NYC-01'], ['DAL-01'], ['CHI-01'], ['NYC-01']],
      at: 'C2',
      expect: 3,
      model: '=COUNTA(UNIQUE(A2:A7))',
      explain: 'UNIQUE returns the distinct list; COUNTA counts it.',
      mustUse: ['UNIQUE'],
    },
    {
      kind: 'formula',
      q: 'Balance-weighted average rate of the three loans.',
      grid: [['Loan', 'Balance', 'Rate'], ['L1', 400000, 0.05], ['L2', 8000, 0.2], ['L3', 32000, 0.07]],
      at: 'E2',
      expect: (400000 * 0.05 + 8000 * 0.2 + 32000 * 0.07) / 440000,
      model: '=SUMPRODUCT(B2:B4,C2:C4)/SUM(B2:B4)',
      explain: 'Σ(balance × rate) / Σ balance ≈ 5.42% — far below the simple average of 10.67%, because the big mortgage dominates.',
      mustUse: ['SUMPRODUCT'],
    },
    {
      kind: 'formula',
      q: 'Return the ID of the largest loan using SORTBY (first item of the sorted list).',
      grid: [['Loan', 'Balance'], ['L1', 5000], ['L2', 92000], ['L3', 41000], ['L4', 700]],
      at: 'D2',
      expect: 'L2',
      model: '=TAKE(SORTBY(A2:A5,B2:B5,-1),1)',
      explain: 'SORTBY sorts the IDs by balance (-1 = descending); TAKE(…,1) keeps the top one.',
      mustUse: ['SORTBY'],
    },
    {
      kind: 'formula',
      q: 'Join the products in A2:A5 into one string separated by ", " (skip blanks).',
      grid: [['Product'], ['Mortgage'], ['HELOC'], [''], ['Auto Loan']],
      at: 'C2',
      expect: 'Mortgage, HELOC, Auto Loan',
      model: '=TEXTJOIN(", ",TRUE,A2:A5)',
      explain: 'TEXTJOIN(delimiter, ignore_empty, values). TRUE skips the blank cell.',
      mustUse: ['TEXTJOIN'],
    },
    {
      kind: 'formula',
      q: 'Use LET to name the balance range "bal" and return its total divided by its count (average balance).',
      grid: [['Balance'], [100], [300], [200]],
      at: 'C2',
      expect: 200,
      model: '=LET(bal,A2:A4,SUM(bal)/COUNT(bal))',
      explain: 'LET(name, value, calculation) — the name bal is defined once and reused.',
      mustUse: ['LET'],
    },
    {
      kind: 'mc',
      q: 'Why use SORTBY(IDs, Balance, -1) instead of sorting the source tape?',
      options: ['SORTBY is the only way to sort descending', 'It leaves the source in its original order and stays live when data changes', 'It is required for pivots', 'It removes duplicates too'],
      answer: 1,
      explain: 'A formula-based sort doesn\'t disturb the source and recalculates automatically.',
    },
  ],
};
