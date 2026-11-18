import type { CheckCtx, Module } from '../types';
import { makeBook, customers, loans, transactions, round2, REGIONS, PRODUCTS } from '../data';
import type { CellStyle } from '../../engine/types';
import { all, approx, valuesEqual } from '../runner';
import { dateToSerial, ymd } from '../../engine/format';

// ---------- data: loan tape with the customer's region joined on ----------
const cs = customers(60, 7);
const regionOf = new Map(cs.map((c) => [c.id, c.region]));
const tape = loans(cs, 120, 11).map((l) => ({ ...l, region: regionOf.get(l.cust)! }));
const N = tape.length; // 120
const LAST = N + 1;
const tapeHeader = ['Loan ID', 'Product', 'Region', 'Branch', 'Balance', 'DPD', 'Status', 'Rate'];
const tapeData = tape.map((l) => [l.id, l.product, l.region, l.branch, l.balance, l.dpd, l.status, l.rate]);
const tapeSheet = (name: string, extra: (string | number)[][] = [], styles: Record<string, CellStyle> = {}) => ({
  name,
  rows: [
    [...tapeHeader, ...(extra[0] ?? [])],
    ...tapeData.map((r, i) => [...r, ...(extra[i + 1] ?? [])]),
  ],
  widths: [95, 105, 90, 70, 105, 50, 95, 55, 20, 230, 120],
  formats: { 4: '#,##0.00', 7: '0.00%' },
  freeze: true,
  styles,
});

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const balOf = (f: (l: (typeof tape)[number]) => boolean) => round2(sum(tape.filter(f).map((l) => l.balance)));
const cnt = (f: (l: (typeof tape)[number]) => boolean) => tape.filter(f).length;

// ---------- lesson 1 expectations ----------
const THRESH = 250000;
const E1 = {
  delinquent: cnt((l) => l.status === 'Delinquent'),
  mortgage: balOf((l) => l.product === 'Mortgage'),
  dpd30: cnt((l) => l.dpd >= 30),
  large: cnt((l) => l.balance > THRESH),
  loanProducts: balOf((l) => /loan/i.test(l.product)),
  notCurrent: cnt((l) => l.status !== 'Current'),
};

// ---------- lesson 2: pick a busy region/product combo for the panel ----------
const combos = REGIONS.flatMap((r) => PRODUCTS.map((p) => ({ r, p, n: cnt((l) => l.region === r && l.product === p) })));
const best = combos.reduce((a, b) => (b.n > a.n ? b : a));
const P_REGION = best.r;
const P_PRODUCT = best.p;
const altRegion = combos.filter((x) => x.p === P_PRODUCT && x.r !== P_REGION).reduce((a, b) => (b.n > a.n ? b : a)).r;
const panel = (region: string) => {
  const f = (l: (typeof tape)[number]) => l.region === region && l.product === P_PRODUCT;
  const sel = tape.filter(f);
  return {
    count: sel.length,
    bal: balOf(f),
    rate: sum(sel.map((l) => l.rate)) / sel.length,
    max: Math.max(...sel.map((l) => l.balance)),
    min: Math.min(...sel.map((l) => l.balance)),
  };
};
const P1 = panel(P_REGION);
const P2 = panel(altRegion);

// ---------- lesson 3: region x product grid (with a header typo) ----------
const GRID_PRODUCTS = PRODUCTS.map((p) => (p === 'Business Loan' ? 'Busines Loan' : p));
const COLS = ['B', 'C', 'D', 'E', 'F', 'G'];
const gridVal = (r: string, p: string) => balOf((l) => l.region === r && l.product === p);
const rawTotal = balOf(() => true);
const bizTotal = balOf((l) => l.product === 'Business Loan');

// ---------- lesson 4: monthly transaction volumes ----------
const tx = transactions(200, 21);
const TXN = tx.length;
const TXLAST = TXN + 1;
const monthEnds = [1, 2, 3, 4, 5, 6].map((m) => dateToSerial(2024, m + 1, 0));
const inMonth = (s: number, me: number) => {
  const a = ymd(s), b = ymd(me);
  return a.y === b.y && a.m === b.m;
};
const mCount = monthEnds.map((me) => tx.filter((t) => inMonth(t.date, me)).length);
const mType = (type: string) => monthEnds.map((me) => round2(sum(tx.filter((t) => inMonth(t.date, me) && t.type === type).map((t) => t.amount))));

// ---------- check helpers ----------
function formulas(c: CheckCtx, col: string, r1: number, r2: number, re: RegExp, msg: string, sheet = ''): true | string {
  for (let r = r1; r <= r2; r++) {
    const f = c.f(`${sheet}${col}${r}`);
    if (!f.startsWith('=')) return `${col}${r} needs a formula (it is ${f ? 'a typed value' : 'empty'}).`;
    if (!re.test(f)) return `${col}${r}: ${msg}`;
  }
  return true;
}
/** One answer cell: must be a formula matching `re` and evaluate to `want`. */
function answer(c: CheckCtx, ref: string, re: RegExp, fn: string, want: number, extra?: (f: string) => true | string): true | string {
  const f = c.f(ref);
  if (!f.startsWith('=')) return `${ref} needs a formula${f ? ' — no typing the number in!' : '.'}`;
  if (!re.test(f)) return `${ref} should use ${fn}.`;
  const x = extra?.(f);
  if (x && x !== true) return x;
  const v = c.v(ref);
  return approx(v, want, 1e-6) ? true : `${ref} shows ${typeof v === 'number' ? round2(v).toLocaleString() : String(v)} — expected ${round2(want).toLocaleString()}. Check your ranges and criteria.`;
}
const gridRef = (col: number, row: number) => `${String.fromCharCode(66 + col)}${row}`;

export const module: Module = {
  id: 'm08',
  title: 'Summaries with COUNTIFS & SUMIFS',
  level: 'Analyst',
  icon: '🧮',
  blurb: 'Count, sum, average and find max/min by condition; build a region × product grid from ONE formula with mixed references, then reconcile it back to the raw total.',
  lessons: [
    // =====================================================================
    {
      id: 'm08-l1',
      title: 'COUNTIF & SUMIF: one condition',
      summary: 'Count and sum by status or product, use operators, cell-driven thresholds, wildcards and "not equal".',
      minutes: 11,
      featured: ['COUNTIF', 'SUMIF', '">"&cell', '"*text*"', '"<>"'],
      intro: `Most management questions are "how many…" or "how much…" **for a slice** of the data: *how many loans are delinquent? what is the total mortgage balance?* That is exactly what these do:

- \`COUNTIF(range, criteria)\` counts the cells in *range* that meet *criteria*.
- \`SUMIF(range, criteria, sum_range)\` adds up *sum_range* on the rows where *range* meets *criteria*.

**Criteria syntax** — the criteria is text describing the test:
- an exact value: \`"Delinquent"\` (not case-sensitive)
- an operator + number, **in quotes**: \`">=30"\`, \`"<>0"\`
- an operator + **a cell**: \`">"&K5\` — the operator is text, the cell is joined on with &
- wildcards: \`"*Loan*"\` = contains "Loan"; \`"LN-5*"\` = starts with; \`?\` = any one character
- not equal: \`"<>Current"\`

**Why formulas instead of a filter + status bar?** A filtered total is a one-off number you copy by hand. A SUMIF is a live, auditable answer that updates when next month's tape lands.

**Common mistakes:**
- \`">K5"\` — inside the quotes, K5 is just the letters K and 5. Use \`">"&K5\`.
- Ranges of different sizes (E2:E121 vs B2:B120) — results shift or error.
- Typing the answer you saw on screen instead of the formula. Hard-coded numbers never update.`,
      workbooks: () => [
        makeBook('Loan_Tape_Summary.xlsx', [
          tapeSheet('Tape', [
            ['', 'Question', 'Answer'],
            ['', 'Delinquent loans (count)'],
            ['', 'Mortgage balance'],
            ['', 'Loans 30+ days past due'],
            ['', 'Large exposure threshold', THRESH],
            ['', 'Loans above threshold'],
            ['', 'Balance of all "…Loan" products'],
            ['', 'Loans not Current (count)'],
          ], { K5: { fmt: '#,##0', fill: '#FFF2CC' }, K3: { fmt: '#,##0.00' }, K7: { fmt: '#,##0.00' } }),
        ]),
      ],
      start: { cell: 'K2' },
      tasks: [
        {
          id: 't1',
          title: 'COUNTIF: how many are delinquent?',
          instruction: `In **K2** count the loans whose Status (column G) is Delinquent:

\`=COUNTIF(G2:G${LAST},"Delinquent")\``,
          why: 'COUNTIF scans the range and counts matches. It answers the first question any credit manager asks about a portfolio, and it updates the moment the tape changes. Text criteria are not case-sensitive.',
          hints: ['COUNTIF(range, criteria).', 'The range is the Status column, G2:G' + LAST + '.', `=COUNTIF(G2:G${LAST},"Delinquent")`],
          check: (c) => answer(c, 'K2', /COUNTIF/i, 'COUNTIF', E1.delinquent),
          solution: [{ set: { K2: `=COUNTIF(G2:G${LAST},"Delinquent")` } }],
        },
        {
          id: 't2',
          title: 'SUMIF: total mortgage balance',
          instruction: `In **K3** total the Balance (column E) of Mortgage loans (Product in column B):

\`=SUMIF(B2:B${LAST},"Mortgage",E2:E${LAST})\``,
          why: 'SUMIF has three parts: where to look (Product), what to look for ("Mortgage"), and what to add up (Balance). The test range and the sum range must be the same size and line up row for row.',
          hints: ['SUMIF(range to test, criteria, range to add).', 'Test column B, add column E.', `=SUMIF(B2:B${LAST},"Mortgage",E2:E${LAST})`],
          check: (c) => answer(c, 'K3', /SUMIF/i, 'SUMIF', E1.mortgage),
          solution: [{ set: { K3: `=SUMIF(B2:B${LAST},"Mortgage",E2:E${LAST})` } }],
        },
        {
          id: 't3',
          title: 'Operators: 30+ days past due',
          instruction: `In **K4** count loans with DPD (column F) of **30 or more**: \`=COUNTIF(F2:F${LAST},">=30")\``,
          why: '30+ DPD is the standard "early delinquency" line used in regulatory and investor reporting. The operator and number go together inside the quotes.',
          hints: ['The criteria is ">=30" — in quotes.', `=COUNTIF(F2:F${LAST},">=30")`],
          check: (c) => answer(c, 'K4', /COUNTIF/i, 'COUNTIF', E1.dpd30),
          solution: [{ set: { K4: `=COUNTIF(F2:F${LAST},">=30")` } }],
        },
        {
          id: 't4',
          title: 'Criteria from a cell: ">"&K5',
          instruction: `**K5** holds the large-exposure threshold. In **K6** count loans with a balance above it — referencing K5, not typing the number:

\`=COUNTIF(E2:E${LAST},">"&K5)\``,
          why: 'The operator is text (">") and the threshold is a number in a cell; & glues them into the criteria ">250000". Now the threshold is an input the reader can see and change. Writing ">K5" is the classic bug: Excel would look for text greater than the letters "K5".',
          hints: ['Put the operator in quotes and join the cell with &.', `=COUNTIF(E2:E${LAST},">"&K5)`],
          check: (c) =>
            answer(c, 'K6', /COUNTIF/i, 'COUNTIF', E1.large, (f) =>
              /"[^"]*K\$?5[^"]*"/i.test(f) ? 'K5 is inside the quotes, so Excel treats it as text. Use ">"&K5.' : /&\s*\$?K\$?5/i.test(f) ? true : 'Join the threshold cell onto the operator: ">"&K5.',
            ),
          solution: [{ set: { K6: `=COUNTIF(E2:E${LAST},">"&K5)` } }],
        },
        {
          id: 't5',
          title: 'Wildcards: every "…Loan" product',
          instruction: `Auto Loan, Personal Loan and Business Loan all contain the word "Loan". In **K7**:

\`=SUMIF(B2:B${LAST},"*Loan*",E2:E${LAST})\``,
          why: '* stands for "any characters", so "*Loan*" means "contains Loan". Wildcards save you from adding three SUMIFs together and keep working if a new "Green Loan" product appears. Check what you catch, though: "*Loan*" would not include HELOC.',
          hints: ['Put * on both sides of the word.', `=SUMIF(B2:B${LAST},"*Loan*",E2:E${LAST})`],
          check: (c) => answer(c, 'K7', /SUMIF/i, 'SUMIF', E1.loanProducts, (f) => (/\*/.test(f) ? true : 'Use a wildcard criteria like "*Loan*".')),
          solution: [{ set: { K7: `=SUMIF(B2:B${LAST},"*Loan*",E2:E${LAST})` } }],
        },
        {
          id: 't6',
          title: '"Not equal": everything except Current',
          instruction: `In **K8** count loans that are not Current: \`=COUNTIF(G2:G${LAST},"<>Current")\``,
          why: '"<>Current" catches every other status — Delinquent, Non-Accrual, and any new code the system adds later. Tip: "<>" on its own counts non-blank cells.',
          hints: ['<> means "not equal to".', `=COUNTIF(G2:G${LAST},"<>Current")`],
          check: (c) => answer(c, 'K8', /COUNTIF/i, 'COUNTIF', E1.notCurrent, (f) => (/<>/.test(f) ? true : 'Use the "<>Current" criteria.')),
          solution: [{ set: { K8: `=COUNTIF(G2:G${LAST},"<>Current")` } }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm08-l2',
      title: 'COUNTIFS, SUMIFS, AVERAGEIFS, MAXIFS, MINIFS',
      summary: 'Several conditions at once, driven by input cells, so one panel answers any region/product question.',
      minutes: 11,
      featured: ['COUNTIFS', 'SUMIFS', 'AVERAGEIFS', 'MAXIFS', 'MINIFS'],
      intro: `The **-IFS** family takes any number of *criteria_range, criteria* pairs, and a row counts only if it meets **all** of them (AND logic).

- \`COUNTIFS(range1, crit1, range2, crit2, …)\`
- \`SUMIFS(sum_range, range1, crit1, range2, crit2, …)\`
- \`AVERAGEIFS\`, \`MAXIFS\`, \`MINIFS\` — same shape as SUMIFS: **the range to calculate comes first**.

**Watch the argument order.** SUMIF puts the sum range *last*; SUMIFS puts it *first*. Mixing them up is the most common error. Many analysts use SUMIFS even for one condition so they only have to remember one layout.

**Drive criteria from cells.** Put "Region" and "Product" in input cells and point every formula at them. Change one cell and the whole panel answers a new question. That is the beginning of a real model.

**Common mistakes:** criteria ranges of different lengths (#VALUE!); hard-coding "West" inside five formulas; and forgetting that AVERAGEIFS with no matches returns #DIV/0! (wrap in IFERROR for a dashboard).`,
      workbooks: () => [
        makeBook('Portfolio_Panel.xlsx', [
          tapeSheet('Tape', [
            ['', 'Region', P_REGION],
            ['', 'Product', P_PRODUCT],
            [],
            ['', 'Number of loans'],
            ['', 'Total balance'],
            ['', 'Average rate'],
            ['', 'Largest balance'],
            ['', 'Smallest balance'],
          ], {
            K1: { b: true, fill: '#FFF2CC' },
            K2: { b: true, fill: '#FFF2CC' },
            K5: { fmt: '#,##0.00' },
            K6: { fmt: '0.00%' },
            K7: { fmt: '#,##0.00' },
            K8: { fmt: '#,##0.00' },
          }),
        ]),
      ],
      start: { cell: 'K4' },
      tasks: [
        {
          id: 't1',
          title: 'COUNTIFS: two conditions',
          instruction: `**K1** holds a region and **K2** a product. In **K4** count loans matching both:

\`=COUNTIFS(C2:C${LAST},K1,B2:B${LAST},K2)\``,
          why: 'Each pair is "look here, for this". A row is counted only if every pair matches. Pointing at K1 and K2 (instead of typing "' + P_REGION + '") makes this a reusable question rather than a one-off answer.',
          hints: ['Pairs: (Region column, K1), (Product column, K2).', `=COUNTIFS(C2:C${LAST},K1,B2:B${LAST},K2)`],
          check: (c) => answer(c, 'K4', /COUNTIFS/i, 'COUNTIFS', P1.count, (f) => (/K\$?1\b/i.test(f) && /K\$?2\b/i.test(f) ? true : 'Point the criteria at the input cells K1 and K2.')),
          solution: [{ set: { K4: `=COUNTIFS(C2:C${LAST},K1,B2:B${LAST},K2)` } }],
        },
        {
          id: 't2',
          title: 'SUMIFS: sum range comes FIRST',
          instruction: `In **K5** total the balance for the same region and product:

\`=SUMIFS(E2:E${LAST},C2:C${LAST},K1,B2:B${LAST},K2)\``,
          why: 'In SUMIFS the column you add up goes first, then the criteria pairs — the opposite of SUMIF. Saying it out loud helps: "sum THIS, where Region is K1 and Product is K2".',
          hints: ['First argument: the Balance column.', 'Then the same pairs as COUNTIFS.', `=SUMIFS(E2:E${LAST},C2:C${LAST},K1,B2:B${LAST},K2)`],
          check: (c) => answer(c, 'K5', /SUMIFS/i, 'SUMIFS', P1.bal, (f) => (/K\$?1\b/i.test(f) && /K\$?2\b/i.test(f) ? true : 'Point the criteria at K1 and K2.')),
          solution: [{ set: { K5: `=SUMIFS(E2:E${LAST},C2:C${LAST},K1,B2:B${LAST},K2)` } }],
        },
        {
          id: 't3',
          title: 'AVERAGEIFS: average rate',
          instruction: `In **K6** average the Rate (column H) for the selection:

\`=AVERAGEIFS(H2:H${LAST},C2:C${LAST},K1,B2:B${LAST},K2)\``,
          why: 'Same layout as SUMIFS. Note this is a simple average — every loan counts equally. For portfolio yield a balance-weighted average (SUMPRODUCT of rate × balance ÷ balance) is usually what management wants; know which one you are showing.',
          hints: ['Average range first (Rate), then the pairs.', `=AVERAGEIFS(H2:H${LAST},C2:C${LAST},K1,B2:B${LAST},K2)`],
          check: (c) => answer(c, 'K6', /AVERAGEIFS/i, 'AVERAGEIFS', P1.rate),
          solution: [{ set: { K6: `=AVERAGEIFS(H2:H${LAST},C2:C${LAST},K1,B2:B${LAST},K2)` } }],
        },
        {
          id: 't4',
          title: 'MAXIFS & MINIFS: the extremes',
          instruction: `In **K7** the largest balance and in **K8** the smallest, for the same region and product:

\`=MAXIFS(E2:E${LAST},C2:C${LAST},K1,B2:B${LAST},K2)\`
\`=MINIFS(E2:E${LAST},C2:C${LAST},K1,B2:B${LAST},K2)\``,
          why: 'The largest single exposure matters for concentration risk; the smallest often reveals data issues (a $0.01 "loan" is usually a fee balance or a closed account that never got cleaned up).',
          hints: ['Same shape as SUMIFS — swap the function name.', 'Copy K5, paste into K7, and edit SUMIFS to MAXIFS.'],
          check: (c) => all(answer(c, 'K7', /MAXIFS/i, 'MAXIFS', P1.max), answer(c, 'K8', /MINIFS/i, 'MINIFS', P1.min)),
          solution: [{ set: { K7: `=MAXIFS(E2:E${LAST},C2:C${LAST},K1,B2:B${LAST},K2)`, K8: `=MINIFS(E2:E${LAST},C2:C${LAST},K1,B2:B${LAST},K2)` } }],
        },
        {
          id: 't5',
          title: 'Ask a new question by changing one cell',
          instruction: `Your manager asks: "and what about **${altRegion}**?" Change **K1** to \`${altRegion}\` and watch the whole panel update.`,
          why: 'This is why the criteria live in cells. One input, five answers, zero formula edits — and no risk of updating four formulas but forgetting the fifth.',
          hints: [`Click K1 and type ${altRegion}.`],
          check: (c) =>
            all(
              String(c.v('K1') ?? '').toLowerCase() === altRegion.toLowerCase() ? true : `K1 should be ${altRegion}.`,
              approx(c.v('K4'), P2.count) ? true : 'K4 did not update — does it point at K1?',
              approx(c.v('K5'), P2.bal) ? true : 'K5 did not update — does it point at K1?',
            ),
          solution: [{ set: { K1: altRegion } }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm08-l3',
      title: 'One formula, whole grid: mixed references & reconciliation',
      summary: 'Build a region × product SUMIFS grid from a single formula with $A2 / B$1, total it, and reconcile to the raw tape.',
      minutes: 14,
      featured: ['SUMIFS', '$A2', 'B$1', 'F4', 'Alt+=', 'ABS'],
      intro: `A summary grid has row labels down column A and column labels across row 1. Every cell asks the same question — *sum balance where Region = this row's label and Product = this column's label*. So **one formula** should fill the whole grid. The trick is **mixed references**:

- \`$A2\` — the **column** is locked (always look in column A for the region), the row moves as you fill down.
- \`B$1\` — the **row** is locked (always look in row 1 for the product), the column moves as you fill right.
- The tape ranges are fully locked: \`Tape!$E$2:$E$${LAST}\`.

Press [[F4]] repeatedly while the cursor is on a reference to cycle A1 → $A$1 → A$1 → $A1.

**Reconcile. Every time.** At a bank a summary that does not tie back to the source is not a summary — it is a liability. After building the grid:
1. Total it (row totals, column totals, grand total).
2. Compute the raw total straight from the tape: \`=SUM(Tape!E2:E${LAST})\`.
3. Difference = grand total − raw total. It must be **0**. Show a check cell that says OK or BREAK.

If it does not tie, something is being dropped: a product or region missing from your labels, a typo in a header, a blank region on the tape. The recon is how you find out *before* your manager does.`,
      workbooks: () => [
        makeBook('Portfolio_Summary.xlsx', [
          {
            name: 'Summary',
            rows: [
              ['Region \\ Product', ...GRID_PRODUCTS, 'Total'],
              ...REGIONS.map((r) => [r]),
              ['Total'],
              [],
              ['Raw tape total'],
              ['Difference'],
              ['Check'],
            ],
            widths: [140, 110, 110, 110, 110, 110, 110, 120],
            styles: {
              A7: { b: true, border: { t: true } },
              A9: { b: true },
              A10: { b: true },
              A11: { b: true },
              ...Object.fromEntries(
                ['B', 'C', 'D', 'E', 'F', 'G', 'H'].flatMap((col) => [2, 3, 4, 5, 6, 7].map((r) => [`${col}${r}`, { fmt: '#,##0', ...(r === 7 || col === 'H' ? { b: true } : {}) }])),
              ),
              B9: { fmt: '#,##0.00' },
              B10: { fmt: '#,##0.00' },
            },
          },
          { ...tapeSheet('Tape'), widths: [95, 105, 90, 70, 105, 50, 95, 55] },
        ]),
      ],
      start: { sheet: 'Summary', cell: 'B2' },
      tasks: [
        {
          id: 't1',
          title: 'Write the ONE formula in B2',
          instruction: `In **B2** sum the balance for region **$A2** and product **B$1**:

\`=SUMIFS(Tape!$E$2:$E$${LAST},Tape!$C$2:$C$${LAST},$A2,Tape!$B$2:$B$${LAST},B$1)\`

Tip: type the formula, then click into each reference and press [[F4]] to cycle the $ signs.`,
          why: 'Think about what must stay fixed when this formula is copied. The tape ranges never move ($E$2:$E$121). The region always comes from column A ($A), but from the current row. The product always comes from row 1 (row $1), but from the current column. Get those four $ right and the grid builds itself.',
          hints: ['Start from the SUMIFS you wrote in the last lesson, but point it at the Tape sheet.', '$A2: dollar before the A only. B$1: dollar before the 1 only.', 'Copy the formula from the instruction.'],
          check: (c) =>
            answer(c, 'B2', /SUMIFS/i, 'SUMIFS', gridVal(REGIONS[0], GRID_PRODUCTS[0]), (f) =>
              !/\$A2\b/i.test(f) ? 'Use $A2 for the region (column locked, row free).' : !/\bB\$1\b/i.test(f) ? 'Use B$1 for the product (row locked, column free).' : /\$E\$2:\$E\$\d+/i.test(f) ? true : 'Lock the tape ranges with $ (e.g. Tape!$E$2:$E$' + LAST + ').',
            ),
          solution: [{ set: { B2: `=SUMIFS(Tape!$E$2:$E$${LAST},Tape!$C$2:$C$${LAST},$A2,Tape!$B$2:$B$${LAST},B$1)` } }],
        },
        {
          id: 't2',
          title: 'Fill the whole grid',
          instruction: `Copy B2 to the whole grid **B2:G6**: select B2:G6, then [[Ctrl+R]] (fill right) and [[Ctrl+D]] (fill down) — or copy B2 and paste over B2:G6.

Click a few cells and read the formula: the region and product references moved, the tape ranges did not.`,
          why: 'If any cell shows the wrong number, the $ signs are wrong — and you would only ever have to fix one formula and refill. That is the maintainability argument for one-formula grids: 30 cells, one piece of logic to review.',
          hints: ['Select B2:G6 first.', 'Ctrl+R copies the left column across; Ctrl+D copies the top row down.', 'Notice column G — something looks off. Leave it for now.'],
          check: (c) => {
            for (let ri = 0; ri < REGIONS.length; ri++)
              for (let pi = 0; pi < GRID_PRODUCTS.length; pi++) {
                const ref = gridRef(pi, ri + 2);
                const f = c.f(ref);
                if (!/^=SUMIFS\(/i.test(f)) return `${ref} needs the SUMIFS formula — fill B2 across and down to G6.`;
                const v = c.v(ref);
                if (!approx(v, gridVal(REGIONS[ri], GRID_PRODUCTS[pi]), 1e-6)) return `${ref} shows the wrong total — check the $ signs in B2 and refill.`;
              }
            return true;
          },
          solution: [{ set: { 'B2:G6': `=SUMIFS(Tape!$E$2:$E$${LAST},Tape!$C$2:$C$${LAST},$A2,Tape!$B$2:$B$${LAST},B$1)` } }],
        },
        {
          id: 't3',
          title: 'Row and column totals',
          instruction: `Add totals:
- **H2:H6**: \`=SUM(B2:G2)\` (filled down)
- **B7:H7**: \`=SUM(B2:B6)\` (filled right) — H7 is the grand total.

Fast way: in **H2** press [[Alt+=]] — AutoSum proposes \`=SUM(B2:G2)\` — press [[Enter]], then fill down. Same in **B7**, then fill right with [[Ctrl+R]].`,
          why: 'Totals in both directions are an internal cross-check: the sum of the row totals and the sum of the column totals must both equal H7. Bold the totals so nobody mistakes them for data.',
          hints: ['In H2, Alt+= proposes =SUM(B2:G2): accept it with Enter, then select H2:H6 and Ctrl+D.', 'In B7, Alt+= proposes =SUM(B2:B6): accept it, then select B7:H7 and Ctrl+R.'],
          check: (c) => {
            for (let r = 2; r <= 6; r++) {
              const f = c.f(`H${r}`);
              if (!/^=SUM\(/i.test(f)) return `H${r} needs =SUM(B${r}:G${r}).`;
              const want = sum(GRID_PRODUCTS.map((p) => gridVal(REGIONS[r - 2], p)));
              if (!approx(c.v(`H${r}`), want, 1e-6)) return `H${r} should total row ${r}.`;
            }
            for (let k = 0; k < 7; k++) {
              const col = String.fromCharCode(66 + k);
              const f = c.f(`${col}7`);
              if (!/^=SUM\(/i.test(f)) return `${col}7 needs =SUM(${col}2:${col}6).`;
              const want = k < 6 ? sum(REGIONS.map((r) => gridVal(r, GRID_PRODUCTS[k]))) : sum(REGIONS.flatMap((r) => GRID_PRODUCTS.map((p) => gridVal(r, p))));
              if (!approx(c.v(`${col}7`), want, 1e-6)) return `${col}7 should total column ${col}.`;
            }
            return true;
          },
          solution: [{ set: { 'H2:H6': '=SUM(B2:G2)', 'B7:H7': '=SUM(B2:B6)' } }],
        },
        {
          id: 't4',
          title: 'Reconcile to the raw tape',
          instruction: `Now the control every bank reviewer expects:
- **B9**: \`=SUM(Tape!E2:E${LAST})\` — total balance straight from the source
- **B10**: \`=H7-B9\` — the difference

It should be zero… is it?`,
          why: 'The raw total does not depend on your labels or criteria, so it is an independent check. A non-zero difference means your summary is silently dropping (or double-counting) something. Reviewers and auditors look for this tie-out first.',
          hints: ['B9 sums the whole Balance column on the Tape sheet.', 'B10 = grand total minus raw total.'],
          check: (c) =>
            all(
              answer(c, 'B9', /SUM\(.*Tape!/i, 'SUM over the Tape balance column', rawTotal),
              c.f('B10').startsWith('=') && /H7/i.test(c.f('B10')) && /B9/i.test(c.f('B10')) ? true : 'B10 should be a formula: =H7-B9.',
              approx(c.v('B10'), (c.v('H7') as number) - rawTotal, 1e-6) ? true : 'B10 should equal H7 minus B9.',
            ),
          solution: [{ set: { B9: `=SUM(Tape!E2:E${LAST})`, B10: '=H7-B9' } }],
        },
        {
          id: 't5',
          title: 'An OK / BREAK check cell',
          instruction: `In **B11**: \`=IF(ABS(B10)<0.01,"OK","BREAK")\`

ABS ignores the sign, and the 0.01 tolerance absorbs tiny floating-point rounding.`,
          why: 'A big, obvious OK/BREAK flag means nobody has to read a number to know whether the pack ties. Never test for exactly 0 with money: sums of decimals can leave 0.0000000001 behind. This check says BREAK — the summary is missing ' + bizTotal.toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' of balance. Time to investigate.',
          hints: ['ABS(B10) is the size of the difference.', '=IF(ABS(B10)<0.01,"OK","BREAK")'],
          check: (c) =>
            all(
              c.f('B11').startsWith('=') && /IF\(/i.test(c.f('B11')) && /B10/i.test(c.f('B11')) ? true : 'B11 should be an IF formula testing B10.',
              c.v('B11') === 'BREAK' ? true : 'B11 should currently say BREAK (the difference is not zero).',
            ),
          solution: [{ set: { B11: '=IF(ABS(B10)<0.01,"OK","BREAK")' } }],
        },
        {
          id: 't6',
          title: 'Find and fix the break',
          instruction: `Find the cause. Look at the difference in B10, then at the grid — which column is all zeros? Compare its header with the product names on the **Tape** sheet.

Fix the header so the recon says **OK**.`,
          why: 'The header says "Busines Loan" — one missing letter, so SUMIFS matched nothing and the whole Business Loan book vanished from the summary without a single error message. This is exactly why the recon exists: formulas do not warn you about criteria that match nothing.',
          hints: ['Column G is all zeros.', 'The difference equals the total Business Loan balance.', 'Retype G1 as Business Loan.'],
          check: (c) =>
            all(
              String(c.v('G1') ?? '').trim().toLowerCase() === 'business loan' ? true : 'G1 should read "Business Loan" exactly as on the tape.',
              c.v('B11') === 'OK' ? true : 'B11 should now say OK.',
            ),
          solution: [{ set: { G1: 'Business Loan' } }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm08-l4',
      title: 'Between two dates: monthly volumes',
      summary: 'COUNTIFS/SUMIFS with ">"&EOMONTH(…) and "<="&month-end, then reconcile the count to the extract.',
      minutes: 10,
      featured: ['COUNTIFS', 'SUMIFS', 'EOMONTH', 'COUNTA'],
      intro: `Monthly MI packs ask "how many transactions in March? how much was deposited?". The extract has one row per transaction with a date. You need a **date window** per month — two criteria on the same date column:

\`">"&EOMONTH($A2,-1)\` — after the end of the previous month
\`"<="&$A2\` — on or before this month-end

**Why "> previous month-end" and "<= this month-end"?** Because every date then falls in exactly one window: no gaps, no overlaps. Using \`>=\` on both ends double-counts the boundary day; using \`<\` on both ends loses it.

Store the months as **real month-end dates** (not "Mar-24" text) so the criteria can do maths with them.

**Reconcile the count:** the monthly counts must add up to the number of rows in the extract (\`COUNTA\` of the ID column). If they do not, some transactions fall outside your months — or your windows overlap.`,
      workbooks: () => [
        makeBook('Txn_Monthly.xlsx', [
          {
            name: 'Monthly',
            rows: [['Month End', 'Txn Count', 'Deposit', 'Fee'], ...monthEnds.map((me) => [me]), ['Total'], ['Rows in extract'], ['Difference']],
            widths: [120, 90, 120, 110],
            formats: { 0: 'm/d/yyyy' },
            styles: {
              A8: { b: true, border: { t: true } },
              A9: { b: true },
              A10: { b: true },
              ...Object.fromEntries(['C', 'D'].flatMap((col) => [2, 3, 4, 5, 6, 7].map((r) => [`${col}${r}`, { fmt: '#,##0.00' }]))),
            },
          },
          {
            name: 'Data',
            rows: [['Txn ID', 'Date', 'Account', 'Branch', 'Type', 'Channel', 'Amount'], ...tx.map((t) => [t.id, t.date, t.acct, t.branch, t.type, t.channel, t.amount])],
            widths: [90, 90, 90, 80, 90, 80, 100],
            formats: { 1: 'm/d/yyyy', 6: '#,##0.00' },
            freeze: true,
          },
        ]),
      ],
      start: { sheet: 'Monthly', cell: 'B2' },
      tasks: [
        {
          id: 't1',
          title: 'Count per month with a date window',
          instruction: `In **B2**:

\`=COUNTIFS(Data!$B$2:$B$${TXLAST},">"&EOMONTH($A2,-1),Data!$B$2:$B$${TXLAST},"<="&$A2)\`

Fill down to B7.`,
          why: 'The same date column appears twice — once for each end of the window. EOMONTH($A2,-1) computes the previous month-end on the fly, so you only maintain one date per row. Locking the Data ranges lets you fill down safely.',
          hints: ['Two criteria pairs, both on the Date column (Data!B).', 'Lower bound: ">"&EOMONTH($A2,-1). Upper bound: "<="&$A2.', 'Copy the formula from the instruction and fill down.'],
          check: (c) =>
            all(
              formulas(c, 'B', 2, 7, /COUNTIFS\(/i, 'use COUNTIFS with two date criteria.'),
              valuesEqual(c, 'B2:B7', mCount, 'Txn Count'),
            ),
          solution: [{ set: { 'B2:B7': `=COUNTIFS(Data!$B$2:$B$${TXLAST},">"&EOMONTH($A2,-1),Data!$B$2:$B$${TXLAST},"<="&$A2)` } }],
        },
        {
          id: 't2',
          title: 'Deposits and fees from one formula',
          instruction: `C1 and D1 hold transaction **types**. In **C2** write one SUMIFS that uses the date window **and** the type from row 1:

\`=SUMIFS(Data!$G$2:$G$${TXLAST},Data!$B$2:$B$${TXLAST},">"&EOMONTH($A2,-1),Data!$B$2:$B$${TXLAST},"<="&$A2,Data!$E$2:$E$${TXLAST},C$1)\`

Fill it across and down to **D7**.`,
          why: 'Same mixed-reference idea as the region × product grid: $A2 keeps pointing at the month column, C$1 keeps pointing at the header row. Fees come out negative because they are debits in the extract — sign conventions are worth a note in your pack.',
          hints: ['Sum range first: Amount (Data!G).', 'Then the two date criteria, then Type = C$1.', 'Select C2:D7, Ctrl+R then Ctrl+D (or paste the formula over the range).'],
          check: (c) =>
            all(
              formulas(c, 'C', 2, 7, /SUMIFS\(/i, 'use SUMIFS.'),
              formulas(c, 'D', 2, 7, /SUMIFS\(/i, 'use SUMIFS (fill the formula right from column C).'),
              formulas(c, 'D', 2, 7, /D\$1/i, 'the type should come from the header, D$1, after filling right — is C$1 locked on the row only?'),
              valuesEqual(c, 'C2:C7', mType('Deposit'), 'Deposit'),
              valuesEqual(c, 'D2:D7', mType('Fee'), 'Fee'),
            ),
          solution: [{ set: { 'C2:D7': `=SUMIFS(Data!$G$2:$G$${TXLAST},Data!$B$2:$B$${TXLAST},">"&EOMONTH($A2,-1),Data!$B$2:$B$${TXLAST},"<="&$A2,Data!$E$2:$E$${TXLAST},C$1)` } }],
        },
        {
          id: 't3',
          title: 'Reconcile the count to the extract',
          instruction: `Prove that every transaction landed in exactly one month:
- **B8**: \`=SUM(B2:B7)\`
- **B9**: \`=COUNTA(Data!A2:A${TXLAST})\` — rows in the extract
- **B10**: \`=B8-B9\` — must be 0`,
          why: 'If B10 is positive your windows overlap (double counting); if negative, some rows fall outside your months or between windows. A count recon is cheap, and it catches the boundary-day bugs that are almost impossible to spot by eye.',
          hints: ['COUNTA counts non-empty cells — perfect for an ID column.', 'Difference = summary total − source count.'],
          check: (c) =>
            all(
              answer(c, 'B8', /SUM\(/i, 'SUM', sum(mCount)),
              answer(c, 'B9', /COUNTA\(|ROWS\(|COUNT\(/i, 'COUNTA on the Txn ID column', TXN),
              c.f('B10').startsWith('=') ? true : 'B10 should be a formula: =B8-B9.',
              c.v('B10') === 0 ? true : 'B10 should be 0.',
            ),
          solution: [{ set: { B8: '=SUM(B2:B7)', B9: `=COUNTA(Data!A2:A${TXLAST})`, B10: '=B8-B9' } }],
        },
      ],
    },
  ],
  quiz: [
    {
      kind: 'formula',
      q: 'Count the Delinquent loans.',
      grid: [
        ['Product', 'Status', 'Balance'],
        ['Mortgage', 'Current', 300000],
        ['Auto Loan', 'Delinquent', 20000],
        ['Mortgage', 'Delinquent', 150000],
        ['Credit Card', 'Current', 5000],
        ['Personal Loan', 'Delinquent', 12000],
      ],
      at: 'E2',
      expect: 3,
      model: '=COUNTIF(B2:B6,"Delinquent")',
      explain: 'COUNTIF(range, criteria).',
      mustUse: ['COUNTIF'],
    },
    {
      kind: 'formula',
      q: 'Total the balance of Mortgage loans.',
      grid: [
        ['Product', 'Status', 'Balance'],
        ['Mortgage', 'Current', 300000],
        ['Auto Loan', 'Delinquent', 20000],
        ['Mortgage', 'Delinquent', 150000],
        ['Credit Card', 'Current', 5000],
        ['Personal Loan', 'Delinquent', 12000],
      ],
      at: 'E2',
      expect: 450000,
      model: '=SUMIF(A2:A6,"Mortgage",C2:C6)',
      explain: 'SUMIF(test range, criteria, sum range). SUMIFS(C2:C6,A2:A6,"Mortgage") works too.',
    },
    {
      kind: 'formula',
      q: 'E2 holds a threshold. Count balances ABOVE it (reference E2, do not type the number).',
      grid: [
        ['Product', 'Status', 'Balance', '', 'Threshold'],
        ['Mortgage', 'Current', 300000, '', 100000],
        ['Auto Loan', 'Delinquent', 20000],
        ['Mortgage', 'Delinquent', 150000],
        ['Credit Card', 'Current', 5000],
        ['Personal Loan', 'Delinquent', 12000],
      ],
      at: 'F2',
      expect: 2,
      model: '=COUNTIF(C2:C6,">"&E2)',
      explain: 'Operator in quotes, cell joined with &. ">E2" would look for text.',
      mustUse: ['COUNTIF'],
    },
    {
      kind: 'formula',
      q: 'Total the balance of Mortgage loans that are Delinquent.',
      grid: [
        ['Product', 'Status', 'Balance'],
        ['Mortgage', 'Current', 300000],
        ['Auto Loan', 'Delinquent', 20000],
        ['Mortgage', 'Delinquent', 150000],
        ['Credit Card', 'Current', 5000],
        ['Personal Loan', 'Delinquent', 12000],
      ],
      at: 'E2',
      expect: 150000,
      model: '=SUMIFS(C2:C6,A2:A6,"Mortgage",B2:B6,"Delinquent")',
      explain: 'SUMIFS: sum range first, then the criteria pairs.',
      mustUse: ['SUMIFS'],
    },
    {
      kind: 'formula',
      q: 'Return the largest balance among Delinquent loans.',
      grid: [
        ['Product', 'Status', 'Balance'],
        ['Mortgage', 'Current', 300000],
        ['Auto Loan', 'Delinquent', 20000],
        ['Mortgage', 'Delinquent', 150000],
        ['Credit Card', 'Current', 5000],
        ['Personal Loan', 'Delinquent', 12000],
      ],
      at: 'E2',
      expect: 150000,
      model: '=MAXIFS(C2:C6,B2:B6,"Delinquent")',
      explain: 'MAXIFS has the same layout as SUMIFS.',
      mustUse: ['MAXIFS'],
    },
    {
      kind: 'mc',
      q: 'Where does the range you are adding up go in SUMIF vs SUMIFS?',
      options: ['First in both', 'Last in both', 'Last in SUMIF, first in SUMIFS', 'First in SUMIF, last in SUMIFS'],
      answer: 2,
      explain: 'SUMIF(range, criteria, sum_range) vs SUMIFS(sum_range, range1, criteria1, …). Mixing them up is the #1 error.',
    },
    {
      kind: 'mc',
      q: 'Which products does the criteria "*Loan*" match?',
      options: ['Only a product named exactly "Loan"', 'Auto Loan, Personal Loan, Business Loan (anything containing "Loan")', 'Every product', 'HELOC'],
      answer: 1,
      explain: '* means any characters. HELOC does not contain the word "Loan".',
    },
    {
      kind: 'mc',
      q: 'In =SUMIFS(Tape!$E$2:$E$121,Tape!$C$2:$C$121,$A2,Tape!$B$2:$B$121,B$1), why $A2 and B$1?',
      options: [
        'They are typos — it should be A2 and B1',
        'Region labels are always in column A (row moves), product labels are always in row 1 (column moves), so one formula fills the grid',
        'So the formula cannot be copied',
        'To make the formula calculate faster',
      ],
      answer: 1,
      explain: 'Lock the column for row labels and the row for column labels — mixed references.',
    },
    {
      kind: 'mc',
      q: 'Your summary grand total is 1,980,000 but =SUM of the raw balance column is 2,215,000. What does this most likely mean?',
      options: ['Excel rounding', 'The summary is dropping something — a missing or misspelled label, or a blank category on the tape', 'The raw total is wrong', 'Nothing, small differences are normal'],
      answer: 1,
      explain: 'A material break means rows are not being captured by your criteria. Find the missing label before the pack goes out.',
    },
    { kind: 'keys', q: 'You are in the total cell under a column of numbers. Insert a SUM of the numbers above with one shortcut.', cmd: 'edit.autosum', keys: 'Alt+=', explain: 'AutoSum (Alt+=) proposes =SUM( ) over the adjacent block of numbers; press Enter to accept.' },
  ],
};
