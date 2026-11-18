import type { CheckCtx, Module } from '../types';
import { makeBook, customers, loans, REGIONS } from '../data';
import { all, approx, formulasMatch } from '../runner';

// ---------------------------------------------------------------------------
// Data: 120-loan tape enriched with the customer's region
// ---------------------------------------------------------------------------

const CS = customers(60, 7);
const LS = loans(CS, 120, 11).map((l) => ({ ...l, region: CS.find((c) => c.id === l.cust)!.region }));
type L = (typeof LS)[number];
const N = LS.length; // rows 2..121
const LAST = N + 1;
const HEAD = ['Loan ID', 'Region', 'Branch', 'Product', 'Status', 'Balance', 'Rate', 'DPD'];
const tapeRows = () => [HEAD, ...LS.map((l) => [l.id, l.region, l.branch, l.product, l.status, l.balance, l.rate, l.dpd])];
const tapeSheet = () => ({ name: 'Loans', rows: tapeRows(), widths: [100, 100, 80, 110, 100, 110, 70, 60], formats: { 5: '#,##0.00', 6: '0.00%' }, freeze: true });

// Pivot ordering mirrors buildPivot: labels sorted with localeCompare
const sortLabels = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
const sum = (ls: L[]) => ls.reduce((a, l) => a + l.balance, 0);
const TOTAL = sum(LS);

const regions = sortLabels(LS.map((l) => l.region));
const regionSum = (r: string) => sum(LS.filter((l) => l.region === r));
const products = sortLabels(LS.map((l) => l.product));
const branches = sortLabels(LS.map((l) => l.branch));
const statuses = sortLabels(LS.map((l) => l.status));

// ---------------------------------------------------------------------------
// Helpers: find a pivot output sheet by its header shape, then read it
// ---------------------------------------------------------------------------

const q = (name: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`);
const lc = (v: unknown) => String(v ?? '').trim().toLowerCase();

/** Name of the first sheet (other than the source) whose cell `ref` reads `text`. */
function findSheet(c: CheckCtx, ref: string, text: string, ref2?: string, text2?: string): string | null {
  for (const n of c.sheetNames()) {
    if (n === 'Loans' || n === 'Summary') continue;
    if (lc(c.v(`${q(n)}!${ref}`)) !== lc(text)) continue;
    if (ref2 && lc(c.v(`${q(n)}!${ref2}`)) !== lc(text2)) continue;
    return n;
  }
  return null;
}

/** Column letter in row `r` of sheet `n` whose header reads `text`. */
function colOf(c: CheckCtx, n: string, r: number, text: string): string | null {
  const vals = c.list(`${q(n)}!A${r}:L${r}`);
  const i = vals.findIndex((v) => lc(v) === lc(text));
  return i < 0 ? null : String.fromCharCode(65 + i);
}

function checkColumn(c: CheckCtx, n: string, col: string, labels: string[], expected: (label: string) => number, firstRow: number, what: string): true | string {
  for (let i = 0; i < labels.length; i++) {
    const r = firstRow + i;
    if (lc(c.v(`${q(n)}!A${r}`)) !== lc(labels[i])) return `${n}!A${r} should be "${labels[i]}" — are the right field and source range (all ${N} loans) in Rows?`;
    const v = c.v(`${q(n)}!${col}${r}`);
    const e = expected(labels[i]);
    if (!(approx(v, e, 1e-6) || (e === 0 && (v === null || v === '')))) return `${what} for ${labels[i]} looks off (${n}!${col}${r}). Did the pivot use all ${N} rows of the tape?`;
  }
  return true;
}

const SRC = 'Loans!F2:F' + LAST;

// ---------------------------------------------------------------------------

export const module: Module = {
  id: 'm13',
  title: 'PivotTables',
  level: 'Advanced',
  icon: '🧮',
  blurb: 'Summarise thousands of loans in seconds, slice by two dimensions, and — crucially — prove the pivot ties back to the source.',
  lessons: [
    // ------------------------------------------------------------------ L1
    {
      id: 'm13-l1',
      title: 'Your first PivotTable',
      summary: 'Build a pivot with Alt N V, tie it back to the tape, and use count, sum and average side by side.',
      minutes: 10,
      featured: ['Alt N V', 'Sum', 'Count', 'Average'],
      intro: `A **PivotTable** answers "total *something* by *something*" without writing a single formula. You drag fields into four boxes:

- **Rows** — the categories down the side (Region, Branch, Product…)
- **Columns** — optional second dimension across the top (Status…)
- **Values** — what to aggregate and how (Sum of Balance, Count of Loan ID, Average of Rate)
- **Filters** — optional page-level filter

**When a pivot beats SUMIFS:** exploring. "What does the book look like by region? by product? by status?" — you can re-drag in seconds. **When SUMIFS beats a pivot:** a fixed report layout that must update instantly, sit next to other calculations, or follow a specific order. You'll compare both in lesson 3.

**How to build one:** click any cell in the data → [[Alt]] [[N]] [[V]] (Insert ▸ PivotTable) → choose a new worksheet → pick fields. A pivot needs a clean table: one header row, no blank rows or columns, no subtotal rows mixed in.

**Count vs Sum — the classic slip:** drop a *text* field (Loan ID) into Values and Excel counts it; drop a *number* field (Balance) and it sums. If a number column contains a single text value or blank, Excel may default to **Count** — always read the value header ("Sum of…" / "Count of…").

**Always tie out:** a pivot's Grand Total must equal the plain SUM of the source column. If it doesn't, the source range missed rows (common when data was appended below the original range).`,
      workbooks: () => [makeBook('Loan_Book_Nov.xlsx', [tapeSheet()])],
      start: { cell: 'A1' },
      tasks: [
        {
          id: 't1',
          title: 'Balance by Region',
          instruction: 'Click any cell in the tape, press [[Alt]] [[N]] [[V]] and build a pivot on a **new sheet named `Pivot`** with **Region** in Rows and **Balance** in Values (Sum).',
          why: 'This is the one-minute answer to "how is the book split by region?" — 120 rows collapsed to 5 lines plus a Grand Total. In practice you would build it on the full extract of tens of thousands of loans just the same.',
          hints: ['One cell inside the data is enough — Excel detects the whole table.', 'Rows: Region. Values: Balance — make sure it says "Sum of Balance", not "Count of Balance".'],
          check: (c) => {
            const n = findSheet(c, 'A1', 'Region');
            if (!n) return 'No pivot found yet. Insert ▸ PivotTable (Alt N V) with Region in Rows.';
            if (lc(c.v(`${q(n)}!B1`)) !== 'sum of balance') return `The value field on ${n} should be "Sum of Balance" (it shows "${String(c.v(`${q(n)}!B1`) ?? '')}").`;
            return all(
              checkColumn(c, n, 'B', regions, regionSum, 2, 'Sum of Balance'),
              lc(c.v(`${q(n)}!A${regions.length + 2}`)) === 'grand total' && approx(c.v(`${q(n)}!B${regions.length + 2}`), TOTAL) ? true : 'The Grand Total row should equal the whole book.',
            );
          },
          solution: [{ select: 'A1' }, { pivot: { rows: ['Region'], values: [{ field: 'Balance', agg: 'sum' }], sheetName: 'Pivot' } }],
          explain: 'Rows = Region, Values = Sum of Balance. The pivot lands on a new sheet: header row, one row per region (A→Z), then Grand Total.',
        },
        {
          id: 't2',
          title: 'Tie the pivot back to the source',
          instruction: `On the **Pivot** sheet: in **D1** type \`Source total\` and in **D2** enter \`=SUM(${SRC})\`. In **D3** type \`Difference\` and in **D4** enter \`=B${regions.length + 2}-D2\` (Grand Total minus source). It must be **0**.`,
          why: 'Every number you send out should be reconciled to its source. A non-zero difference means the pivot\'s source range missed rows (data appended later), included a totals row (double counting), or a balance was stored as text. Building the check *next to* the pivot makes it part of the deliverable, not a step you might forget.',
          hints: ['Type =SUM( then click the Loans tab and select F2:F121 — Excel writes Loans!F2:F121 for you.', `The Grand Total is in B${regions.length + 2}.`, `D4: =B${regions.length + 2}-D2`],
          check: (c) => {
            const n = findSheet(c, 'A1', 'Region');
            if (!n) return 'Build the Region pivot first (task 1).';
            return all(
              /^=SUM\(.*Loans!/i.test(c.f(`${q(n)}!D2`)) ? true : `${n}!D2 should SUM the Balance column on the Loans sheet.`,
              approx(c.v(`${q(n)}!D2`), TOTAL) ? true : `${n}!D2 should add all ${N} balances (Loans!F2:F${LAST}).`,
              c.f(`${q(n)}!D4`).startsWith('=') && /D2/i.test(c.f(`${q(n)}!D4`)) ? true : `${n}!D4 should be a formula: Grand Total minus D2.`,
              approx(c.v(`${q(n)}!D4`), 0) ? true : `${n}!D4 should be 0 — check it points at the Grand Total (B${regions.length + 2}).`,
            );
          },
          solution: [{ set: { 'Pivot!D1': 'Source total', 'Pivot!D2': `=SUM(${SRC})`, 'Pivot!D3': 'Difference', 'Pivot!D4': `=B${regions.length + 2}-D2` } }],
        },
        {
          id: 't3',
          title: 'Count, Sum and Average together',
          instruction: 'Go back to **Loans** and build a second pivot on a new sheet named `ByProduct`: **Product** in Rows, and three Values: **Loan ID** (Count), **Balance** (Sum), **Rate** (Average).',
          why: 'Count tells you *how many* loans, Sum tells you *how much* exposure, Average tells you the *typical* rate. Mortgages may be a few loans but most of the balance; cards many loans but little balance — you need both views. Note Average of Rate is a *simple* average: every loan counts equally regardless of size (the dynamic-arrays module shows the balance-weighted version).',
          hints: ['Ctrl+PgUp (or click the tab) to return to Loans, then Alt N V again.', 'Loan ID is text, so it can only be counted. Set Balance to Sum and Rate to Average via Value Field Settings.'],
          check: (c) => {
            const n = findSheet(c, 'A1', 'Product');
            if (!n) return 'No Product pivot yet — build one on a new sheet with Product in Rows.';
            const cc = colOf(c, n, 1, 'Count of Loan ID'), cs = colOf(c, n, 1, 'Sum of Balance'), ca = colOf(c, n, 1, 'Average of Rate');
            if (!cc) return `${n} needs a "Count of Loan ID" value.`;
            if (!cs) return `${n} needs a "Sum of Balance" value.`;
            if (!ca) return `${n} needs an "Average of Rate" value (Value Field Settings → Average).`;
            const of = (p: string) => LS.filter((l) => l.product === p);
            return all(
              checkColumn(c, n, cc, products, (p) => of(p).length, 2, 'Count of Loan ID'),
              checkColumn(c, n, cs, products, (p) => sum(of(p)), 2, 'Sum of Balance'),
              checkColumn(c, n, ca, products, (p) => of(p).reduce((a, l) => a + l.rate, 0) / of(p).length, 2, 'Average of Rate'),
            );
          },
          solution: [
            { sheetTab: 'Loans' },
            { select: 'A1' },
            { pivot: { rows: ['Product'], values: [{ field: 'Loan ID', agg: 'count' }, { field: 'Balance', agg: 'sum' }, { field: 'Rate', agg: 'average' }], sheetName: 'ByProduct' } },
          ],
        },
        {
          id: 't4',
          title: 'Share of book next to the pivot',
          instruction: `On **ByProduct**, in **F1** type \`% of book\`. In **F2** divide the product's Sum of Balance by the Grand Total with the total row locked — \`=C2/C$${products.length + 2}\` — and fill down to **F${products.length + 1}**. Format as %.`,
          why: 'Pivots give you building blocks; ratios usually live right next to them. Locking the row of the Grand Total (C$8) keeps the denominator fixed while the numerator walks down. In real Excel you can also use *Show Values As ▸ % of Grand Total* — but a formula is transparent to whoever reviews your file.',
          hints: [`The Grand Total row is row ${products.length + 2}.`, 'Use $ before the row number of the denominator so it stays put when you fill down.', `=C2/C$${products.length + 2}`],
          check: (c) => {
            const n = findSheet(c, 'A1', 'Product');
            if (!n) return 'Build the ByProduct pivot first.';
            const cs = colOf(c, n, 1, 'Sum of Balance') ?? 'C';
            const last = products.length + 1;
            return all(
              formulasMatch(c, `${q(n)}!F2:F${last}`, /\/\s*\$?[A-Z]+\$\d+/i, 'share (… / total with $-locked row)'),
              checkColumn(c, n, 'F', products, (p) => sum(LS.filter((l) => l.product === p)) / TOTAL, 2, `% of book (Sum column ${cs})`),
            );
          },
          solution: [{ set: { 'ByProduct!F1': '% of book', [`ByProduct!F2:F${products.length + 1}`]: `=C2/C$${products.length + 2}` } }, { select: `F2:F${products.length + 1}` }, { cmd: 'fmt.percent' }],
        },
      ],
    },

    // ------------------------------------------------------------------ L2
    {
      id: 'm13-l2',
      title: 'Two-dimensional pivots',
      summary: 'Rows × Columns: Branch by Status, Product by Status — and pulling numbers out of a pivot safely.',
      minutes: 10,
      featured: ['Alt N V', 'Columns field', 'XLOOKUP'],
      intro: `Add a field to **Columns** and the pivot becomes a grid: one row per Branch, one column per Status, each cell the total for that pair, with **Grand Totals** on the right and at the bottom.

**Reading the layout:** row 1 holds the value label ("Sum of Balance") and the column field name ("Status"); row 2 holds the row-field name and each column label. Data starts on row 3.

**Blank ≠ zero… mostly.** A branch with no Non-Accrual loans shows an *empty* cell, not 0. In arithmetic Excel treats a blank as 0, so \`=C3+D3\` still works — but COUNT and AVERAGE skip blanks, which can surprise you.

**Pulling numbers out of a pivot:** never hard-link a pivot cell like \`=E5\`. When the data refreshes, a new branch appears or one disappears and every row below shifts — your link now points at a different branch. Look the value up **by its label** instead (XLOOKUP / INDEX-MATCH). (Real Excel also auto-writes a GETPIVOTDATA formula when you click into a pivot — same idea: address by label, not by position.)

**Pick the right aggregation:** Sum of Balance for exposure, Count of Loan ID for "how many", Average for typical size or rate. A grid of *counts* by Product × Status is a quick delinquency-mix view.`,
      workbooks: () => [makeBook('Loan_Book_Nov.xlsx', [tapeSheet()])],
      start: { cell: 'A1' },
      tasks: [
        {
          id: 't1',
          title: 'Branch × Status grid',
          instruction: 'Build a pivot on a new sheet named `BranchStatus`: **Branch** in Rows, **Status** in Columns, **Balance** (Sum) in Values.',
          why: 'Credit risk loves this view: which branches carry the delinquent and non-accrual balances? One glance replaces 30 SUMIFS formulas.',
          hints: ['Alt N V from any cell in the data.', 'Drag Status to the Columns box — that makes the grid.'],
          check: (c) => {
            const n = findSheet(c, 'A2', 'Branch', 'B1', 'Status');
            if (!n) return 'No Branch × Status pivot yet: Branch in Rows, Status in Columns.';
            if (!lc(c.v(`${q(n)}!A1`)).startsWith('sum of balance')) return 'Values should be Sum of Balance.';
            const tests: (true | string)[] = [];
            statuses.forEach((s, j) => {
              const col = String.fromCharCode(66 + j);
              tests.push(lc(c.v(`${q(n)}!${col}2`)) === lc(s) ? true : `Column ${col} should be the "${s}" status.`);
              tests.push(checkColumn(c, n, col, branches, (b) => sum(LS.filter((l) => l.branch === b && l.status === s)), 3, `${s} balance`));
            });
            const gtCol = String.fromCharCode(66 + statuses.length);
            tests.push(checkColumn(c, n, gtCol, branches, (b) => sum(LS.filter((l) => l.branch === b)), 3, 'Branch grand total'));
            tests.push(approx(c.v(`${q(n)}!${gtCol}${branches.length + 3}`), TOTAL) ? true : 'The bottom-right Grand Total should equal the whole book.');
            return all(...tests);
          },
          solution: [{ select: 'A1' }, { pivot: { rows: ['Branch'], cols: 'Status', values: [{ field: 'Balance', agg: 'sum' }], sheetName: 'BranchStatus' } }],
        },
        {
          id: 't2',
          title: 'Problem-loan % by branch',
          instruction: `On **BranchStatus**, in **G2** type \`Problem %\`. In **G3** enter \`=(C3+D3)/E3\` (Delinquent + Non-Accrual, divided by the branch total) and fill down to **G${branches.length + 2}**. Format as %.`,
          why: 'Absolute balances favour big branches; a ratio lets you compare a small branch with a big one fairly. Notice C or D can be blank for some branches — blank counts as 0 in + and /, so the formula still works. (Bonus thought: what would happen if a whole branch total were 0? You would wrap it in IFERROR.)',
          hints: ['C = Delinquent, D = Non-Accrual, E = Grand Total for the row.', 'Fill down: select G3:G' + (branches.length + 2) + ' and press Ctrl+D.', '=(C3+D3)/E3'],
          check: (c) => {
            const n = findSheet(c, 'A2', 'Branch', 'B1', 'Status');
            if (!n) return 'Build the BranchStatus pivot first.';
            const last = branches.length + 2;
            return all(
              formulasMatch(c, `${q(n)}!G3:G${last}`, /\/\s*E\d+/i, 'ratio (… / E)'),
              checkColumn(c, n, 'G', branches, (b) => {
                const ls = LS.filter((l) => l.branch === b);
                return sum(ls.filter((l) => l.status !== 'Current')) / sum(ls);
              }, 3, 'Problem %'),
            );
          },
          solution: [{ set: { 'BranchStatus!G2': 'Problem %', [`BranchStatus!G3:G${branches.length + 2}`]: '=(C3+D3)/E3' } }, { select: `G3:G${branches.length + 2}` }, { cmd: 'fmt.percent' }],
        },
        {
          id: 't3',
          title: 'Count grid: Product × Status',
          instruction: 'Back on **Loans**, build another pivot on a new sheet `ProductStatus`: **Product** in Rows, **Status** in Columns, **Loan ID** (Count) in Values.',
          why: 'Counting instead of summing changes the question from "how much money is late?" to "how many customers are late?" — collections staffing depends on the second one. The Grand Total must equal the number of loans on the tape (120): that is the count version of tying out.',
          hints: ['Ctrl+PgUp back to Loans (or click the tab).', 'Loan ID is text, so Values will default to Count — exactly what you want.'],
          check: (c) => {
            const n = findSheet(c, 'A2', 'Product', 'B1', 'Status');
            if (!n) return 'No Product × Status pivot yet.';
            if (!lc(c.v(`${q(n)}!A1`)).startsWith('count of')) return 'Values should be a Count (Count of Loan ID).';
            const gtCol = String.fromCharCode(66 + statuses.length);
            return all(
              checkColumn(c, n, 'B', products, (p) => LS.filter((l) => l.product === p && l.status === statuses[0]).length, 3, `${statuses[0]} count`),
              checkColumn(c, n, gtCol, products, (p) => LS.filter((l) => l.product === p).length, 3, 'Row total count'),
              c.v(`${q(n)}!${gtCol}${products.length + 3}`) === N ? true : `The Grand Total should be ${N} loans.`,
            );
          },
          solution: [{ sheetTab: 'Loans' }, { select: 'A1' }, { pivot: { rows: ['Product'], cols: 'Status', values: [{ field: 'Loan ID', agg: 'count' }], sheetName: 'ProductStatus' } }],
        },
        {
          id: 't4',
          title: 'Look up a pivot value by label',
          instruction: `On **BranchStatus**: in **I2** type a branch code, \`${branches[3]}\`. In **J2** pull that branch's total with \`=XLOOKUP(I2,A3:A${branches.length + 2},E3:E${branches.length + 2})\`.`,
          why: 'A hard link like =E6 silently points at the wrong branch as soon as the pivot gains or loses a row. Looking up by the label survives refreshes and re-sorts — and anyone reading the formula can see *what* it fetches. Change I2 to another branch and J2 follows.',
          hints: ['XLOOKUP(what, where to look, what to return).', 'Look in the branch labels (column A), return the Grand Total column (E).'],
          check: (c) => {
            const n = findSheet(c, 'A2', 'Branch', 'B1', 'Status');
            if (!n) return 'Build the BranchStatus pivot first.';
            const b = String(c.v(`${q(n)}!I2`) ?? '');
            const e = LS.filter((l) => l.branch.toLowerCase() === b.toLowerCase());
            return all(
              e.length ? true : `${n}!I2 should hold a branch code from column A, e.g. ${branches[3]}.`,
              /(XLOOKUP|VLOOKUP|INDEX|LOOKUP)\(/i.test(c.f(`${q(n)}!J2`)) ? true : `${n}!J2 should be a lookup formula (XLOOKUP, VLOOKUP or INDEX/MATCH) — not a link to one cell.`,
              approx(c.v(`${q(n)}!J2`), sum(e)) ? true : `${n}!J2 should return the Grand Total of ${b || 'that branch'}.`,
            );
          },
          solution: [{ set: { 'BranchStatus!I1': 'Branch', 'BranchStatus!J1': 'Total balance', 'BranchStatus!I2': branches[3], 'BranchStatus!J2': `=XLOOKUP(I2,A3:A${branches.length + 2},E3:E${branches.length + 2})` } }],
        },
      ],
    },

    // ------------------------------------------------------------------ L3
    {
      id: 'm13-l3',
      title: 'Pivot or SUMIFS? Reconcile both',
      summary: 'Rebuild a pivot with SUMIFS, reconcile the two, and see why a pivot must be refreshed.',
      minutes: 9,
      featured: ['SUMIFS', 'XLOOKUP', 'Refresh (Alt A R A)'],
      intro: `Pivots and SUMIFS answer the same question in two different ways:

- **Speed to build:** pivot in seconds; SUMIFS report in minutes.
- **Layout:** pivot decides (A→Z); with SUMIFS *you* decide (e.g. the regulator's order).
- **Re-slicing:** trivial in a pivot; a rebuild with SUMIFS.
- **Updates when data changes:** SUMIFS instantly; a pivot **only after Refresh**.

That last point is the one that bites. A pivot stores a **snapshot (cache)** of the data. Change a balance in the source and the pivot keeps showing the old number until someone refreshes it ([[Alt]] [[A]] [[R]] [[A]] = Refresh All in Excel). Month-end packs have gone out with stale pivots more times than anyone admits.

**Professional pattern:** use the pivot to explore, then build the final report with SUMIFS in a fixed layout — and add a **check column** that compares the two. If both methods agree, you can trust the number. If they disagree, you've caught a stale pivot, a missing range or a mis-typed criterion before your manager does.

*In this trainer a pivot is created as a static snapshot — exactly like an un-refreshed pivot — so you'll see the stale-data effect for yourself.*`,
      workbooks: () => [
        makeBook('Regional_Report.xlsx', [
          tapeSheet(),
          {
            name: 'Summary',
            rows: [['Region', 'Balance (SUMIFS)', 'Balance (Pivot)', 'Check'], ...REGIONS.map((r) => [r])],
            widths: [110, 140, 130, 90],
            formats: { 1: '#,##0.00', 2: '#,##0.00', 3: '#,##0.00' },
          },
        ]),
      ],
      start: { sheet: 'Summary', cell: 'B2' },
      tasks: [
        {
          id: 't1',
          title: 'The formula version',
          instruction: 'On **Summary** the regions are in the order the regulator wants (not A→Z). In **B2** enter\n\n`=SUMIFS(Loans!$F$2:$F$121,Loans!$B$2:$B$121,A2)`\n\nand fill down to **B6**.',
          why: 'SUMIFS respects *your* layout — the regions stay exactly where the report template needs them. The ranges are fully locked ($F$2:$F$121) so filling down only moves the criterion (A2 → A3 → …).',
          hints: ['Sum range first (Balance = column F), then criteria range (Region = column B), then the criterion (A2).', 'Lock both ranges with F4 so they do not slide.'],
          check: (c) =>
            all(
              formulasMatch(c, 'Summary!B2:B6', /SUMIFS\(/i, 'SUMIFS'),
              ...REGIONS.map((r, i) => (approx(c.v(`Summary!B${i + 2}`), regionSum(r)) ? true : `Summary!B${i + 2} (${r}) is off — are the ranges locked with $ and pointing at Loans F (Balance) and B (Region)?`)),
            ),
          solution: [{ set: { 'Summary!B2:B6': '=SUMIFS(Loans!$F$2:$F$121,Loans!$B$2:$B$121,A2)' } }],
        },
        {
          id: 't2',
          title: 'The pivot version',
          instruction: 'Go to **Loans**, click A1 and build a pivot on a new sheet named `Pivot` with **Region** in Rows and **Sum of Balance** in Values.',
          why: 'Same question, second method. Two independent methods that agree are much stronger evidence than one method checked twice.',
          hints: ['Click the Loans tab, then Alt N V.', 'Name the new sheet Pivot — the next task looks it up by that name.'],
          check: (c) => {
            const n = findSheet(c, 'A1', 'Region', 'B1', 'Sum of Balance');
            if (!n) return 'No Region / Sum of Balance pivot yet.';
            if (n.toLowerCase() !== 'pivot') return `Rename the pivot sheet "${n}" to Pivot (double-click the tab).`;
            return checkColumn(c, n, 'B', regions, regionSum, 2, 'Sum of Balance');
          },
          solution: [{ sheetTab: 'Loans' }, { select: 'A1' }, { pivot: { rows: ['Region'], values: [{ field: 'Balance', agg: 'sum' }], sheetName: 'Pivot' } }],
        },
        {
          id: 't3',
          title: 'Reconcile the two',
          instruction: 'Back on **Summary**: in **C2** fetch the pivot number for the region with `=XLOOKUP(A2,Pivot!$A:$A,Pivot!$B:$B)` and in **D2** compute `=B2-C2`. Fill both down to row 6. Every check should be **0**.',
          why: 'This is the reconciliation habit in miniature: two methods, one difference column, expected value zero. The lookup is by region name, so it works even though the Summary order differs from the pivot\'s A→Z order — a position-based link (=Pivot!B2) would have compared Northeast to Midwest.',
          hints: ['Whole-column references (Pivot!$A:$A) are fine for lookups and keep working if the pivot grows.', 'D2: =B2-C2, then select C2:D6 and Ctrl+D.'],
          check: (c) =>
            all(
              formulasMatch(c, 'Summary!C2:C6', /(XLOOKUP|VLOOKUP|INDEX)\(.*Pivot!/i, 'lookup into the Pivot sheet'),
              formulasMatch(c, 'Summary!D2:D6', /B\d+\s*-\s*C\d+|C\d+\s*-\s*B\d+/i, 'difference (B − C)'),
              ...REGIONS.map((r, i) => (approx(c.v(`Summary!C${i + 2}`), regionSum(r)) ? true : `Summary!C${i + 2} should return the pivot total for ${r}.`)),
              ...REGIONS.map((_, i) => (approx(c.v(`Summary!D${i + 2}`), 0) ? true : `Summary!D${i + 2} should be 0.`)),
            ),
          solution: [{ set: { 'Summary!C2:C6': '=XLOOKUP(A2,Pivot!$A:$A,Pivot!$B:$B)', 'Summary!D2:D6': '=B2-C2' } }],
        },
        {
          id: 't4',
          title: 'Catch a stale pivot',
          instruction: `A late correction arrives: loan **${LS[0].id}** (${LS[0].region}) was paid off. Set **Loans!F2** to \`0\`. Then look at Summary column D.`,
          why: `The SUMIFS column updated instantly; the pivot did not — it still holds the old snapshot, so the ${LS[0].region} check now shows −${LS[0].balance.toLocaleString('en-US')}. That non-zero check is the whole point of building one: it tells you to Refresh (Alt A R A in Excel) before the pack goes out. Lesson: refresh every pivot after the data changes, and keep a check that would catch you if you forget.`,
          hints: ['Go to Loans!F2, type 0, Enter.', 'Then switch back to Summary and read column D.'],
          check: (c) => {
            if (c.v('Loans!F2') !== 0) return 'Set Loans!F2 to 0.';
            const i = REGIONS.indexOf(LS[0].region as (typeof REGIONS)[number]);
            return approx(c.v(`Summary!D${i + 2}`), -LS[0].balance) ? true : `Summary!D${i + 2} should now show the stale-pivot gap of −${LS[0].balance}.`;
          },
          solution: [{ set: { 'Loans!F2': '0' } }, { sheetTab: 'Summary' }],
        },
      ],
    },
  ],
  quiz: [
    { kind: 'keys', q: 'Insert a PivotTable from the current data.', cmd: 'insert.pivot', keys: 'Alt N V', explain: 'Alt N V = Insert ▸ PivotTable.' },
    {
      kind: 'mc',
      q: 'You drag Balance into Values and the header says "Count of Balance". What is the most likely cause?',
      options: ['Pivots always count by default', 'The Balance column contains text or blank cells', 'The pivot is filtered', 'Balance is in the Rows box too'],
      answer: 1,
      explain: 'If a column isn\'t purely numeric, Excel defaults to Count. Fix the source data (or switch to Sum in Value Field Settings) and re-check the total.',
    },
    {
      kind: 'mc',
      q: 'Your pivot Grand Total is 2% lower than =SUM of the source column. What should you suspect first?',
      options: ['Rounding in the pivot', 'The pivot\'s source range misses rows added later', 'SUM double counts', 'The pivot uses Average'],
      answer: 1,
      explain: 'A pivot built on A1:H1000 ignores rows appended at 1001+. Use the whole table (or an Excel Table) and always tie the Grand Total back to the source.',
    },
    {
      kind: 'mc',
      q: 'You changed several balances in the source. The pivot still shows old totals. Why?',
      options: ['Pivots only show integers', 'Pivots work from a cached snapshot until refreshed', 'The workbook is in manual calculation', 'The pivot has a filter'],
      answer: 1,
      explain: 'Pivots read a cache. Refresh (Alt A R A / Alt F5) after any data change — SUMIFS, by contrast, updates instantly.',
    },
    {
      kind: 'mc',
      q: 'When is a SUMIFS report a better choice than a pivot?',
      options: ['When you want to explore many slices quickly', 'When the layout is fixed (e.g. a regulatory template) and must update instantly', 'When the data has more than 100 rows', 'Never — pivots are always better'],
      answer: 1,
      explain: 'Pivots are for exploring; SUMIFS for fixed, always-live layouts. Many analysts use both and reconcile them.',
    },
    {
      kind: 'mc',
      q: 'Why look up a pivot value by label (XLOOKUP) instead of linking =E6?',
      options: ['XLOOKUP is faster', 'Rows shift when the pivot refreshes, so a cell link can point at a different item', 'Cell links don\'t work on pivot sheets', 'It formats the number'],
      answer: 1,
      explain: 'Refreshes add/remove items and rows move. A label-based lookup always fetches the item you named.',
    },
    {
      kind: 'formula',
      q: 'Rebuild one pivot cell with a formula: total Balance (C) for the West region (B2:B7).',
      grid: [['Loan', 'Region', 'Balance'], ['L1', 'West', 1200], ['L2', 'Midwest', 800], ['L3', 'West', 450], ['L4', 'Northeast', 2000], ['L5', 'West', 50], ['L6', 'Midwest', 300]],
      at: 'E2',
      expect: 1700,
      model: '=SUMIFS(C2:C7,B2:B7,"West")',
      explain: 'SUMIFS(sum_range, criteria_range, criteria) — the formula equivalent of Rows = Region, Values = Sum of Balance.',
      mustUse: ['SUMIFS', 'SUMIF'],
    },
    {
      kind: 'formula',
      q: 'Rebuild "Count of Loan" for Midwest.',
      grid: [['Loan', 'Region', 'Balance'], ['L1', 'West', 1200], ['L2', 'Midwest', 800], ['L3', 'West', 450], ['L4', 'Northeast', 2000], ['L5', 'West', 50], ['L6', 'Midwest', 300]],
      at: 'E2',
      expect: 2,
      model: '=COUNTIFS(B2:B7,"Midwest")',
      explain: 'Count of a text field in a pivot = COUNTIFS on the category.',
      mustUse: ['COUNTIFS', 'COUNTIF'],
    },
    {
      kind: 'formula',
      q: 'A pivot shows Grand Total in B8 = 5,000; the source SUM in D2 = 5,000. Write the reconciliation check (should be 0).',
      grid: [['Region', 'Sum of Balance', '', 'Source'], ['East', 3000, '', 5000], ['West', 2000], [''], [''], [''], [''], ['Grand Total', 5000]],
      at: 'D4',
      expect: 0,
      model: '=B8-D2',
      explain: 'Pivot total minus source total — anything but zero means the pivot missed or double counted something.',
    },
  ],
};
