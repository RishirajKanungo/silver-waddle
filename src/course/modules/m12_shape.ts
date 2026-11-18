import type { CheckCtx, Module } from '../types';
import { makeBook, customers, loans, type Loan } from '../data';
import { all, approx, formulasMatch, valuesEqual } from '../runner';
import { parseRange } from '../../engine/refs';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const CS = customers(60, 7);
const HEAD = ['Loan ID', 'Product', 'Branch', 'Status', 'Balance', 'Rate', 'DPD'];
const row = (l: Loan) => [l.id, l.product, l.branch, l.status, l.balance, l.rate, l.dpd];
const FORMATS = { 4: '#,##0.00', 5: '0.00%' };
const WIDTHS = [100, 110, 80, 100, 110, 70, 60];

// Lesson 1 & 2: a 60-loan tape
const L1 = loans(CS, 60, 12);
const N1 = L1.length; // 60 -> rows 2..61
const byId = new Map(L1.map((l) => [l.id, l]));
const total1 = L1.reduce((a, l) => a + l.balance, 0);
const top5 = [...L1].sort((a, b) => b.balance - a.balance).slice(0, 5).reduce((a, l) => a + l.balance, 0);

// Lesson 2 layout: summary block on rows 1-3, header on row 5, data rows 6..65
const HDR2 = 5;
const FIRST2 = HDR2 + 1;
const LAST2 = HDR2 + N1;
const delinq = L1.filter((l) => l.status === 'Delinquent');
const problem = L1.filter((l) => l.status !== 'Current');
const sumOf = (ls: Loan[]) => ls.reduce((a, l) => a + l.balance, 0);

// Lesson 3: 58 loans + 2 double-loaded rows (a classic extract bug)
const L3base = loans(CS, 58, 13);
const L3: Loan[] = [...L3base];
L3.splice(25, 0, { ...L3base[8] });
L3.splice(47, 0, { ...L3base[33] });
const N3 = L3.length; // 60 -> rows 2..61
const LAST3 = N3 + 1;
const idCount = new Map<string, number>();
L3.forEach((l) => idCount.set(l.id, (idCount.get(l.id) ?? 0) + 1));
const dupFlags = L3.map((l) => (idCount.get(l.id)! > 1));
const nDupRows = dupFlags.filter(Boolean).length;
const nOver100k = L3.filter((l) => l.balance > 100000).length;
const nPersonal = L3.filter((l) => l.product === 'Personal Loan').length;
// a loan the "customer calls about": unique ID, well down the list
const callIdx = L3.findIndex((l, i) => i > 30 && idCount.get(l.id) === 1);
const callLoan = L3[callIdx];
const callCell = `A${callIdx + 2}`;

// ---------------------------------------------------------------------------
// Check helpers
// ---------------------------------------------------------------------------

/** Every row in rows r1..r2 still carries the right balance/branch for its Loan ID. */
function intact(c: CheckCtx, r1: number, r2: number): true | string {
  const rows = c.range(`A${r1}:G${r2}`);
  for (let i = 0; i < rows.length; i++) {
    const id = rows[i][0];
    const l = byId.get(String(id));
    if (!l || !approx(rows[i][4], l.balance) || rows[i][2] !== l.branch)
      return `Row ${r1 + i} looks scrambled — ${String(id)} no longer sits next to its own balance. Undo ([[Ctrl+Z]]) and sort from a single cell so Excel moves whole rows.`;
  }
  return true;
}

const lc = (v: unknown) => String(v ?? '').toLowerCase();

function filterState(c: CheckCtx) {
  const sh = c.sheet();
  const hidden = Object.values(sh?.hiddenRows ?? {}).filter(Boolean).length;
  return { sh, f: sh?.filter, hidden };
}

function cfRule(c: CheckCtx, type: string, col: number, r1: number, r2: number) {
  const rules = c.sheet()?.cf ?? [];
  return rules.find((r) => {
    if (r.type !== type) return false;
    const g = parseRange(r.range);
    return !!g && g.c1 <= col && g.c2 >= col && g.r1 <= r1 && g.r2 >= r2;
  });
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const module: Module = {
  id: 'm12',
  title: 'Sort, Filter & Highlight',
  level: 'Advanced',
  icon: '🔎',
  blurb: 'Reorder a loan tape safely, filter to the problem loans, total only what you see with SUBTOTAL, and make exceptions jump off the page.',
  lessons: [
    // ------------------------------------------------------------------ L1
    {
      id: 'm12-l1',
      title: 'Sorting without breaking rows',
      summary: 'Quick sorts with Alt A S A / Alt A S D, multi-level custom sorts, and why an ID column is your undo button.',
      minutes: 8,
      featured: ['Alt A S A', 'Alt A S D', 'Alt A S S', 'Ctrl+Z'],
      intro: `Sorting is the first thing you do with a new extract: biggest exposures first, worst delinquencies first, branch by branch.

**The golden rule: a sort must move whole rows.** A loan's ID, branch, status and balance live in one row. If only the Balance column moves, every balance now belongs to the wrong loan — and nothing looks broken. That is how wrong numbers reach a credit committee.

**How to sort safely**
- Click **one cell** inside the column you want to sort by. Excel expands to the whole contiguous table (the *current region*) and keeps rows together.
- [[Alt]] [[A]] [[S]] [[A]] sorts **A→Z / smallest→largest**; [[Alt]] [[A]] [[S]] [[D]] sorts **Z→A / largest→smallest**.
- [[Alt]] [[A]] [[S]] [[S]] opens **Custom Sort** for several levels: e.g. *Branch* A→Z, then *Balance* largest first inside each branch. Levels are applied top-down: level 1 decides, level 2 only breaks ties.

**Common mistakes**
- Selecting a single column and sorting it → "Sort Warning: expand the selection?" Always say *Expand*.
- Blank rows/columns inside the data split it into separate regions, so only part of the table sorts.
- Header row sorted into the data (when headers look like data). Check "My data has headers".
- Losing the original order. Keep a unique **ID** (or row number) column so you can always sort back.`,
      workbooks: () => [
        makeBook('Loan_Tape_Nov.xlsx', [
          { name: 'Tape', rows: [HEAD, ...L1.map(row)], widths: WIDTHS, formats: FORMATS, freeze: true },
        ]),
      ],
      start: { cell: 'A1' },
      tasks: [
        {
          id: 't1',
          title: 'Biggest exposures first',
          instruction: 'Click any cell in the **Balance** column (e.g. **E2**) and press [[Alt]] [[A]] [[S]] [[D]] to sort largest → smallest.',
          why: 'Concentration is the first question any credit reviewer asks: "who are our biggest names?" A one-cell sort answers it in two seconds — and because you started from one cell, Excel moved the entire row, so each balance still belongs to its loan.',
          hints: ['Select just one cell in column E — not the whole column.', 'Tap Alt, then A (Data tab), S (Sort), D (Descending).'],
          check: (c) => {
            const bal = c.list(`E2:E${N1 + 1}`);
            for (let i = 1; i < bal.length; i++)
              if (typeof bal[i] !== 'number' || (bal[i] as number) > (bal[i - 1] as number) + 1e-9)
                return `Column E should run from largest to smallest — row ${i + 2} is bigger than the row above it.`;
            return intact(c, 2, N1 + 1);
          },
          solution: [{ select: 'E2' }, { cmd: 'data.sortDesc' }],
          explain: 'One cell selected → Excel sorts the current region A1:G61 by column E, descending, moving whole rows.',
        },
        {
          id: 't2',
          title: 'Top-5 concentration',
          instruction: 'With the tape sorted, the five biggest loans are in rows 2–6. In **J1** type `Top-5 share` and in **J2** enter a formula that divides the sum of the top five balances by the sum of all balances:\n\n`=SUM(E2:E6)/SUM(E2:E61)`\n\nFormat it as a percentage with [[Ctrl+Shift+%]].',
          why: 'Single-name concentration is a core risk metric: if 5 loans are 40% of the book, one default hurts a lot. Note the trap though: this formula depends on *position*. It is only right while the data is sorted by balance — re-sort and it silently changes meaning. (Later you will compute it position-free with LARGE or SORTBY.)',
          hints: ['Column J is outside the table (H and I are empty), so it won\'t get dragged around by later sorts.', 'Top five = E2:E6; everything = E2:E61.', '=SUM(E2:E6)/SUM(E2:E61)'],
          check: (c) =>
            all(
              /^=.*SUM\(/i.test(c.f('J2')) ? true : 'J2 should be a formula using SUM — not a typed number.',
              approx(c.v('J2'), top5 / total1, 1e-6) ? true : `J2 should be about ${((top5 / total1) * 100).toFixed(1)}%. Is the tape still sorted largest-first, and do you divide by all 60 balances (E2:E61)?`,
            ),
          solution: [{ set: { J1: 'Top-5 share', J2: '=SUM(E2:E6)/SUM(E2:E61)' } }, { select: 'J2' }, { cmd: 'fmt.percent' }],
        },
        {
          id: 't3',
          title: 'Multi-level sort: branch, then balance',
          instruction: 'The regional heads want the tape **by Branch (A→Z)** and, inside each branch, **largest Balance first**.\n\nClick **A1**, press [[Alt]] [[A]] [[S]] [[S]] to open Custom Sort, set level 1 = *Branch*, A to Z; click **Add Level**, level 2 = *Balance*, Largest to Smallest; OK.',
          why: 'Two quick sorts in a row do NOT reliably give you this — the second sort destroys the first. Custom Sort applies all levels at once: level 1 decides the order, level 2 only breaks ties within the same branch. Branch-by-branch views are how most bank MI packs are laid out.',
          hints: ['Alt A S S opens the Sort dialog. Make sure "My data has headers" is ticked.', 'Level 1: Branch, A to Z. Add Level. Level 2: Balance, Largest to Smallest.'],
          check: (c) => {
            const rows = c.range(`A2:G${N1 + 1}`);
            for (let i = 1; i < rows.length; i++) {
              const pb = lc(rows[i - 1][2]), b = lc(rows[i][2]);
              if (b < pb) return `Branches should run A→Z — row ${i + 2} (${String(rows[i][2])}) comes after ${String(rows[i - 1][2])}.`;
              if (b === pb && (rows[i][4] as number) > (rows[i - 1][4] as number) + 1e-9)
                return `Inside ${String(rows[i][2])}, balances should be largest first — check row ${i + 2}. Did you add the second level?`;
            }
            return intact(c, 2, N1 + 1);
          },
          solution: [{ select: 'A1' }, { sort: [{ col: 2 }, { col: 4, desc: true }] }],
          explain: 'Custom Sort with two keys: column C (index 2) ascending, then column E (index 4) descending.',
        },
        {
          id: 't4',
          title: 'Sort back to the original order',
          instruction: 'Put the tape back the way the data lake delivered it: click **A2** (Loan ID) and press [[Alt]] [[A]] [[S]] [[A]].\n\nNow look at **J2** — it changed. Why?',
          why: 'Because the extract arrived in Loan ID order, the ID column is your "undo" for sorting — even after you have saved and closed the file. If an extract has no natural key, add a row-number column (1, 2, 3…) before you sort anything. And J2 changed because it summed *positions* E2:E6, which no longer hold the top five. Position-dependent formulas are fragile; prefer formulas that look things up by meaning.',
          hints: ['One cell in column A, then Alt A S A (ascending).'],
          check: (c) =>
            all(
              valuesEqual(c, `A2:A${N1 + 1}`, L1.map((l) => l.id), 'Loan IDs'),
              intact(c, 2, N1 + 1),
            ),
          solution: [{ select: 'A2' }, { cmd: 'data.sortAsc' }],
        },
      ],
    },

    // ------------------------------------------------------------------ L2
    {
      id: 'm12-l2',
      title: 'AutoFilter & SUBTOTAL',
      summary: 'Filter to the problem loans with Ctrl+Shift+L and total only what is visible with SUBTOTAL.',
      minutes: 9,
      featured: ['Ctrl+Shift+L', 'Alt+↓', 'Alt A C', 'SUBTOTAL'],
      intro: `**AutoFilter** hides the rows you don't care about so you can focus: only delinquent loans, only one branch, only balances over $1M.

- [[Ctrl+Shift+L]] turns filter arrows on/off for the table around the active cell.
- [[Alt+↓]] on a header opens its drop-down; tick the values to keep.
- [[Alt]] [[A]] [[C]] clears every filter but keeps the arrows.

**The trap: SUM doesn't care what you can see.** Filtering only *hides* rows; they are still there, so \`=SUM(E6:E65)\` keeps adding all of them. Your "delinquent total" would really be the whole book.

**SUBTOTAL ignores filtered-out rows.** \`=SUBTOTAL(9, range)\` sums only visible rows. The first argument picks the math:
- **9** = SUM, **3** = COUNTA (count non-blank), **2** = COUNT (numbers), **1** = AVERAGE, **4** = MAX, **5** = MIN
- Add 100 (e.g. **109**) to also ignore rows you hid by hand.

**Where to put the totals:** *above* the data (or on another sheet). A total sitting in a row next to the data can itself be hidden by the filter — or swallowed into the filter range. That is why this tape has its summary block in rows 1–3.

**Tie-out habit:** with no filter applied, SUBTOTAL(9) must equal SUM. If not, something is hidden that you forgot about.`,
      workbooks: () => [
        makeBook('Delinquency_Review.xlsx', [
          {
            name: 'Tape',
            rows: [
              ['Delinquency review — November loan tape'],
              ['Loans shown', '', '', 'Total (SUM)', ''],
              ['', '', '', 'Visible (SUBTOTAL)', ''],
              [],
              HEAD,
              ...L1.map(row),
            ],
            widths: [110, 110, 80, 130, 120, 70, 60],
            formats: FORMATS,
            styles: Object.fromEntries(['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((col) => [`${col}${HDR2}`, { b: true, fill: '#DDEBF7', border: { b: true } }])),
          },
        ]),
      ],
      start: { cell: `A${HDR2}` },
      tasks: [
        {
          id: 't1',
          title: 'Turn on AutoFilter',
          instruction: `The active cell is **A${HDR2}** (the header row). Press [[Ctrl+Shift+L]] to add filter arrows to the table.`,
          why: 'Ctrl+Shift+L is the fastest way in and out of filtering. Starting from a cell inside the table lets Excel find the full range (A5:G65) — it stops at the blank row 4, which is exactly why we left a gap between the summary block and the data.',
          hints: ['Hold Ctrl and Shift, tap L.', 'Make sure the active cell is inside the table first.'],
          check: (c) => {
            const { f } = filterState(c);
            if (!f) return 'No filter arrows yet — press Ctrl+Shift+L with a cell in the table selected.';
            const g = parseRange(f.range);
            return g && g.r1 === HDR2 - 1 ? true : `The filter should start at the header row ${HDR2}. Turn it off (Ctrl+Shift+L), click A${HDR2}, and turn it on again.`;
          },
          solution: [{ select: `A${HDR2}` }, { cmd: 'data.filter' }],
          mustUseKeys: ['data.filter'],
        },
        {
          id: 't2',
          title: 'Show only Delinquent loans',
          instruction: `Open the **Status** drop-down (click the arrow in **D${HDR2}**, or select D${HDR2} and press [[Alt+↓]]), untick everything except **Delinquent**, and press OK.`,
          why: 'Collections teams work from the delinquent list, not the whole book. Notice the row numbers turn blue and skip — that is your visual cue that rows are hidden and any total you see on screen needs a second look.',
          hints: ['Alt+↓ opens the filter menu of the active header cell.', 'Untick "Select All" first, then tick Delinquent.'],
          check: (c) => {
            const { f, hidden } = filterState(c);
            if (!f) return 'The filter is off — turn it back on with Ctrl+Shift+L.';
            const allowed = f.allowed[3];
            if (!allowed || allowed.length !== 1 || lc(allowed[0]) !== 'delinquent') return 'Filter column D (Status) so that only "Delinquent" is ticked.';
            return hidden === N1 - delinq.length ? true : `Expected ${N1 - delinq.length} hidden rows — is another column filtered too?`;
          },
          solution: [{ filter: { col: 'D', allowed: ['Delinquent'] } }],
        },
        {
          id: 't3',
          title: 'SUM vs SUBTOTAL',
          instruction: `In **E2** enter \`=SUM(E${FIRST2}:E${LAST2})\` and in **E3** enter \`=SUBTOTAL(9,E${FIRST2}:E${LAST2})\`. Compare them.`,
          why: 'E2 still shows the whole book because SUM includes hidden rows. E3 shows only the delinquent balance — the number you actually want to report. Pasting a SUM under a filtered list and emailing it is one of the most common (and embarrassing) analyst errors.',
          hints: ['Both formulas point at the same range — only the function differs.', `SUBTOTAL's first argument 9 means "sum".`, `=SUBTOTAL(9,E${FIRST2}:E${LAST2})`],
          check: (c) =>
            all(
              /^=SUM\(/i.test(c.f('E2')) ? true : 'E2 should use =SUM(...).',
              approx(c.v('E2'), total1) ? true : `E2 should add all ${N1} balances (E${FIRST2}:E${LAST2}).`,
              /^=SUBTOTAL\(\s*(9|109)\s*,/i.test(c.f('E3')) ? true : 'E3 should use =SUBTOTAL(9, ...).',
              approx(c.v('E3'), sumOf(delinq)) ? true : `E3 should show only the visible (Delinquent) balances — check the range E${FIRST2}:E${LAST2}.`,
            ),
          solution: [{ set: { E2: `=SUM(E${FIRST2}:E${LAST2})`, E3: `=SUBTOTAL(9,E${FIRST2}:E${LAST2})` } }],
        },
        {
          id: 't4',
          title: 'Widen the filter & count what you see',
          instruction: `Credit wants **all problem loans**: change the Status filter to show **Delinquent** *and* **Non-Accrual**. Then in **B2** count the visible loans with \`=SUBTOTAL(3,A${FIRST2}:A${LAST2})\`.`,
          why: 'Function 3 is COUNTA — it counts non-blank cells, which is what you want for text IDs (COUNT, function 2, only counts numbers and would return 0 here). Watch E3 update by itself: SUBTOTAL recalculates every time the filter changes, so your summary block is always in sync with what is on screen.',
          hints: ['Reopen the Status drop-down and tick Non-Accrual as well.', 'SUBTOTAL(3, …) = count of visible non-blank cells.', `=SUBTOTAL(3,A${FIRST2}:A${LAST2})`],
          check: (c) => {
            const { f } = filterState(c);
            const allowed = (f?.allowed[3] ?? []).map(lc).sort();
            return all(
              allowed.join('|') === 'delinquent|non-accrual' ? true : 'The Status filter should show exactly Delinquent and Non-Accrual.',
              /^=SUBTOTAL\(\s*(3|103)\s*,/i.test(c.f('B2')) ? true : 'B2 should use =SUBTOTAL(3, ...) to count visible loans.',
              c.v('B2') === problem.length ? true : `B2 should count ${problem.length} visible loans.`,
              approx(c.v('E3'), sumOf(problem)) ? true : 'E3 should now total the Delinquent + Non-Accrual balances.',
            );
          },
          solution: [{ filter: { col: 'D', allowed: ['Delinquent', 'Non-Accrual'] } }, { set: { B2: `=SUBTOTAL(3,A${FIRST2}:A${LAST2})` } }],
        },
        {
          id: 't5',
          title: 'Clear filters and tie out',
          instruction: 'Press [[Alt]] [[A]] [[C]] to clear all filters. E2 and E3 should now match, and B2 should show all 60 loans.',
          why: 'This is your tie-out: with nothing hidden, SUBTOTAL must equal SUM. Clearing filters before you save or send a file also saves the next person from wondering why the totals "don\'t add up".',
          hints: ['Alt, A (Data), C (Clear). Ctrl+Shift+L twice would also work, but removes the arrows.'],
          check: (c) => {
            const { hidden } = filterState(c);
            return all(
              hidden === 0 ? true : 'Some rows are still hidden — clear the filters with Alt A C.',
              approx(c.v('E3'), total1) && approx(c.v('E2'), total1) ? true : 'E2 and E3 should both show the full book total.',
              c.v('B2') === N1 ? true : `B2 should show ${N1}.`,
            );
          },
          solution: [{ cmd: 'data.clearFilters' }],
        },
      ],
    },

    // ------------------------------------------------------------------ L3
    {
      id: 'm12-l3',
      title: 'Highlight, de-dupe & Find/Replace',
      summary: 'Conditional formatting for big exposures and duplicate IDs, formula flags you can count, and Find & Replace.',
      minutes: 10,
      featured: ['Alt H L', 'Ctrl+F', 'Ctrl+H', 'COUNTIF'],
      intro: `**Conditional formatting (CF)** colours cells *by rule*, so exceptions jump out — and keep jumping out when the data changes. [[Alt]] [[H]] [[L]] opens the menu: *Highlight Cells Rules* (greater than, between, text contains, **duplicate values**…).

**Why a rule beats painting cells by hand:** next month's extract has different rows. A rule re-evaluates; manual yellow fill stays on the wrong rows.

**But CF is only visual.** You can't SUM by colour, filter reliably by it in every tool, or prove it in an audit trail. So pair it with a **formula flag** — e.g. \`=COUNTIF($A$2:$A$61,A2)>1\` returns TRUE for duplicate IDs. A flag can be counted, filtered and reviewed.

**Duplicates matter at a bank:** a double-loaded loan doubles its exposure in every total downstream. Always check that the ID column is unique before you aggregate.

**Find & Replace**
- [[Ctrl+F]] finds the next cell containing your text — the fastest way to locate "loan LN-500xxx" in a 10,000-row tape.
- [[Ctrl+H]] replaces. **Replace All** rewrites every match — including *inside* longer text and formulas — so check "Match entire cell contents" when you mean an exact value, and always eyeball the count Excel reports.`,
      workbooks: () => [
        makeBook('Loan_Tape_Exceptions.xlsx', [
          {
            name: 'Tape',
            rows: [
              HEAD,
              ...L3.map(row),
            ].map((r, i) => (i === 0 ? [...r, '', '', 'Balances > 100k'] : i === 1 ? [...r, '', '', 'Duplicate ID rows'] : r)),
            widths: [100, 110, 80, 100, 110, 70, 60, 70, 20, 130, 80],
            formats: FORMATS,
          },
        ]),
      ],
      start: { cell: 'A1' },
      tasks: [
        {
          id: 't1',
          title: 'Highlight balances over $100k',
          instruction: `Select **E2:E${LAST3}** (click E2, then [[Ctrl+Shift+↓]]). Open Conditional Formatting ([[Alt]] [[H]] [[L]]) → **Greater Than…**, enter \`100000\`, choose the light-red fill, OK.`,
          why: 'Large exposures need a second pair of eyes (and often a different approval level). A CF rule keeps them visible as balances move month to month — no re-painting needed.',
          hints: ['Select only the balance cells, not the header.', 'Alt H L → Highlight Cells Rules → Greater Than.'],
          check: (c) => {
            const r = cfRule(c, 'gt', 4, 1, LAST3 - 1);
            if (!r) return `Add a "Greater Than" rule that covers E2:E${LAST3}.`;
            return Number(r.a) === 100000 ? true : 'The rule threshold should be 100000.';
          },
          solution: [{ select: `E2:E${LAST3}` }, { cf: { type: 'gt', a: '100000', fill: '#FFC7CE' } }],
        },
        {
          id: 't2',
          title: 'Count what you highlighted',
          instruction: `Colours can't be added up. In **K1** count the loans over $100k with \`=COUNTIF(E2:E${LAST3},">100000")\`.`,
          why: 'The CF makes the exceptions visible; the COUNTIF makes them reportable ("14 loans above the threshold"). Note the criteria is text in quotes — the operator and number travel together as one string.',
          hints: ['COUNTIF(range, criteria). The criteria for "greater than 100,000" is ">100000" (with the quotes).', `=COUNTIF(E2:E${LAST3},">100000")`],
          check: (c) =>
            all(
              /^=COUNTIFS?\(/i.test(c.f('K1')) ? true : 'K1 should use COUNTIF.',
              c.v('K1') === nOver100k ? true : `K1 should be ${nOver100k}. Check the range covers E2:E${LAST3} and the criteria is ">100000".`,
            ),
          solution: [{ set: { K1: `=COUNTIF(E2:E${LAST3},">100000")` } }],
        },
        {
          id: 't3',
          title: 'Highlight duplicate Loan IDs',
          instruction: `Select **A2:A${LAST3}** and add a CF rule: [[Alt]] [[H]] [[L]] → Highlight Cells Rules → **Duplicate Values…** → OK.`,
          why: 'A Loan ID must be unique. When the same ID appears twice, the loan was usually double-loaded by the extract job — every total built on this tape would overstate that exposure.',
          hints: ['Select the IDs only (A2 down).', 'Duplicate Values is the last option under Highlight Cells Rules.'],
          check: (c) => (cfRule(c, 'duplicate', 0, 1, LAST3 - 1) ? true : `Add a Duplicate Values rule covering A2:A${LAST3}.`),
          solution: [{ select: `A2:A${LAST3}` }, { cf: { type: 'duplicate', fill: '#FFC7CE' } }],
        },
        {
          id: 't4',
          title: 'A duplicate flag you can count',
          instruction: `In **H1** type \`Dup?\`. In **H2** enter \`=COUNTIF($A$2:$A$${LAST3},A2)>1\` and fill it down to **H${LAST3}**. Then in **K2** count the flagged rows: \`=COUNTIF(H2:H${LAST3},TRUE)\`.`,
          why: `COUNTIF($A$2:$A$${LAST3},A2) asks "how many times does this row's ID appear in the whole column?" — anything above 1 is a duplicate. The range is locked with $ so it doesn't slide as you fill down; A2 stays relative so each row tests its own ID. Unlike the colour, the TRUE/FALSE flag can be filtered, counted and handed to the data-engineering team as evidence.`,
          hints: ['Lock the lookup range: $A$2:$A$' + LAST3 + '. Leave A2 unlocked.', 'Fill down with a double-click on the fill handle or Ctrl+D.', 'K2: =COUNTIF(H2:H' + LAST3 + ',TRUE)'],
          check: (c) =>
            all(
              formulasMatch(c, `H2:H${LAST3}`, /COUNTIF\(\$A\$2:\$A\$\d+,A\d+\)>1/i, 'COUNTIF($A$2:$A$…,A2)>1'),
              valuesEqual(c, `H2:H${LAST3}`, dupFlags, 'Dup flags'),
              c.v('K2') === nDupRows && /^=COUNTIFS?\(/i.test(c.f('K2')) ? true : `K2 should count the TRUE flags with COUNTIF (expected ${nDupRows}).`,
            ),
          solution: [{ set: { H1: 'Dup?', [`H2:H${LAST3}`]: `=COUNTIF($A$2:$A$${LAST3},A2)>1`, K2: `=COUNTIF(H2:H${LAST3},TRUE)` } }],
        },
        {
          id: 't5',
          title: 'Find a loan fast',
          instruction: `A relationship manager calls about **${callLoan.id}**. Press [[Ctrl+F]], type \`${callLoan.id}\` and press [[Enter]] to jump straight to it.`,
          why: 'Scrolling a 60-row tape is fine; scrolling 60,000 rows is not. Ctrl+F jumps to the next match from the active cell — press Enter again to cycle through further matches (handy for spotting a duplicate).',
          hints: ['Ctrl+F opens Find. Type the full Loan ID and press Enter (Find Next).'],
          check: (c) => (c.sel.active === callCell ? true : `The active cell should be on ${callLoan.id} (${callCell}).`),
          solution: [
            { cmd: 'edit.find' },
            {
              custom: (s) => {
                const hit = s.find(callLoan.id, { from: { r: 0, c: 0 } });
                if (hit) s.select(hit.r, hit.c);
                s.openDialog(null);
              },
            },
          ],
        },
        {
          id: 't6',
          title: 'Replace a product label',
          instruction: 'The product taxonomy changed: **Personal Loan** is now **Consumer Loan**. Press [[Ctrl+H]], Find what: `Personal Loan`, Replace with: `Consumer Loan`, then **Replace All**.',
          why: `Excel should report ${nPersonal} replacements — always compare that count with what you expect (a quick COUNTIF beforehand tells you). Replace All also changes matches inside longer text and formulas, so for short codes (e.g. "CC") tick "Match entire cell contents" or you will mangle words that merely contain them.`,
          hints: ['Ctrl+H opens Replace directly.', 'Type the old and new text exactly, then click Replace All.'],
          check: (c) => {
            const prods = c.list(`B2:B${LAST3}`).map(lc);
            return all(
              prods.includes('personal loan') ? 'Some cells still say "Personal Loan".' : true,
              prods.filter((p) => p === 'consumer loan').length === nPersonal ? true : `There should be ${nPersonal} "Consumer Loan" rows.`,
            );
          },
          solution: [{ cmd: 'edit.replace' }, { custom: (s) => { s.replaceAll('Personal Loan', 'Consumer Loan'); s.openDialog(null); } }],
        },
      ],
    },
  ],
  quiz: [
    {
      kind: 'mc',
      q: 'You select only column E (Balance) and sort it largest-first, choosing "Continue with the current selection". What happened?',
      options: ['Nothing — Excel always moves whole rows', 'Balances are now attached to the wrong loans', 'Excel sorted the whole table anyway', 'The header moved to the bottom'],
      answer: 1,
      explain: 'Sorting a single column breaks the rows apart: every balance now sits next to a different loan ID. Sort from one cell (or expand the selection) so whole rows move.',
    },
    { kind: 'keys', q: 'Sort the table largest → smallest by the active column.', cmd: 'data.sortDesc', keys: 'Alt A S D', explain: 'Alt A S D = Data ▸ Sort Descending. Alt A S A sorts ascending.' },
    { kind: 'keys', q: 'Turn AutoFilter on (or off) for the current table.', cmd: 'data.filter', keys: 'Ctrl+Shift+L', explain: 'Ctrl+Shift+L toggles the filter arrows.' },
    {
      kind: 'mc',
      q: 'A list is filtered to 13 delinquent loans. Which formula totals only those 13 balances in E2:E61?',
      options: ['=SUM(E2:E61)', '=SUBTOTAL(9,E2:E61)', '=SUBTOTAL(3,E2:E61)', '=SUMIF(E2:E61,"visible")'],
      answer: 1,
      explain: 'SUBTOTAL(9, …) sums visible rows only. SUM includes hidden rows; SUBTOTAL(3, …) counts instead of sums.',
    },
    {
      kind: 'mc',
      q: 'In a Custom Sort with level 1 = Branch (A→Z) and level 2 = Balance (largest first), what does level 2 do?',
      options: ['Sorts the whole table by balance, undoing level 1', 'Orders loans by balance only within each branch', 'Nothing unless level 1 is removed', 'Sorts the branches by their total balance'],
      answer: 1,
      explain: 'Later levels only break ties left by earlier levels — so balances are ordered inside each branch.',
    },
    {
      kind: 'formula',
      q: 'Count the loans with a balance above 100,000.',
      grid: [['Loan', 'Balance'], ['L1', 250000], ['L2', 99000], ['L3', 100000], ['L4', 180500], ['L5', 12000]],
      at: 'D2',
      expect: 2,
      model: '=COUNTIF(B2:B6,">100000")',
      explain: 'The criteria ">100000" is strictly greater — 100,000 itself is not counted.',
      mustUse: ['COUNTIF', 'COUNTIFS'],
    },
    {
      kind: 'formula',
      q: 'Flag whether the ID in A3 appears more than once in A2:A6 (TRUE/FALSE).',
      grid: [['ID'], ['LN-1'], ['LN-2'], ['LN-3'], ['LN-2'], ['LN-5']],
      at: 'B3',
      expect: true,
      model: '=COUNTIF($A$2:$A$6,A3)>1',
      explain: 'COUNTIF counts how often the ID occurs; more than 1 means a duplicate.',
      mustUse: ['COUNTIF'],
    },
    { kind: 'keys', q: 'Open Find & Replace on the Replace tab.', cmd: 'edit.replace', keys: 'Ctrl+H', explain: 'Ctrl+H opens Replace; Ctrl+F opens Find.' },
    { kind: 'keys', q: 'Open the Conditional Formatting menu.', cmd: 'cf.open', keys: 'Alt H L', explain: 'Alt H L = Home ▸ Conditional Formatting.' },
    {
      kind: 'mc',
      q: 'Why pair a "duplicate values" highlight with a COUNTIF flag column?',
      options: ['CF is slower than formulas', 'Colours cannot be counted, summed or audited — a TRUE/FALSE flag can', 'COUNTIF changes the cell colour too', 'CF only works on numbers'],
      answer: 1,
      explain: 'Conditional formatting is visual only. A formula flag can be filtered, counted and attached as evidence.',
    },
  ],
};
