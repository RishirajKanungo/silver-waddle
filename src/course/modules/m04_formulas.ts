import type { Module, CheckCtx } from '../types';
import { makeBook, customers, loans, rng, round2, BRANCHES, REGIONS } from '../data';
import { all, approx, valuesEqual } from '../runner';

// ---------------- helpers ----------------

/** Same rounding rule as Excel's ROUND (half away from zero). */
function xlRound(x: number, d: number) {
  const p = Math.pow(10, d);
  const v = x * p;
  return (Math.sign(v) * Math.round(Math.abs(v) + 1e-9)) / p;
}

const norm = (f: string) => f.toUpperCase().replace(/\s/g, '');

/** Every cell in a single-column range must be a formula; `test(formula, row)` checks its shape. */
function formulaShape(c: CheckCtx, ref: string, firstRow: number, test: (f: string, row: number) => boolean, msg: (cell: string) => string): true | string {
  const col = ref.replace(/^.*!/, '').replace(/\d.*$/, '');
  const sheet = ref.includes('!') ? ref.slice(0, ref.lastIndexOf('!') + 1) : '';
  const ins = c.inputs(ref);
  for (let i = 0; i < ins.length; i++) {
    const f = norm(ins[i]);
    if (!f.startsWith('=') || !test(f, firstRow + i)) return msg(`${sheet}${col}${firstRow + i}`.replace(/^.*!/, ''));
  }
  return true;
}

/** Give a block of (possibly empty) cells a number format — makeSheet only formats non-empty cells. */
const fmtBlock = (cols: string[], r1: number, r2: number, fmt: string) =>
  Object.fromEntries(cols.flatMap((c) => Array.from({ length: r2 - r1 + 1 }, (_, i) => [`${c}${r1 + i}`, { fmt }])));

// ---------------- Lesson 1 data: interest & fees on 10 loans ----------------
const L1 = loans(customers(20, 23), 10, 29);
const FEES = [120, 0, 60, 95, 0, 240, 35, 60, 0, 150];
const L1_LAST = L1.length + 1; // 11
const expInterest = L1.map((l) => l.balance * l.rate);
const expMonthly = L1.map((l, i) => (expInterest[i] + FEES[i]) / 12);
const expGrowth = L1.map((l) => l.balance * Math.pow(1 + l.rate, 3));

const costBook = () =>
  makeBook('Loan_Costs.xlsx', [
    {
      name: 'Costs',
      rows: [
        ['Loan ID', 'Balance', 'Annual Rate', 'Annual Fee', 'Annual Interest', 'Monthly Cost', 'Balance in 3 yrs'],
        ...L1.map((l, i) => [l.id, l.balance, l.rate, FEES[i], '', '', '']),
      ],
      widths: [95, 110, 90, 85, 115, 105, 120],
      formats: { 1: '#,##0.00', 2: '0.00%', 3: '#,##0' },
      styles: fmtBlock(['E', 'F', 'G'], 2, L1_LAST, '#,##0.00'),
    },
  ]);

// ---------------- Lesson 2 data: branch deposits, Q3 ($K) ----------------
const r2 = rng(91);
const BR2 = BRANCHES.slice(0, 10);
const months: (number | string | null)[][] = BR2.map(() => [0, 0, 0].map(() => Math.round((1500 + r2() * 7500) * 10) / 10));
months[3][2] = null; // ATL-01: September not received yet
months[7][2] = 'n/a'; // PHX-01: system sent text
const nums = (xs: (number | string | null)[]) => xs.filter((x): x is number => typeof x === 'number');
const colSum = (k: number) => nums(months.map((m) => m[k])).reduce((a, b) => a + b, 0);
const sepNums = nums(months.map((m) => m[2]));

const depBook = () =>
  makeBook('Branch_Deposits_Q3.xlsx', [
    {
      name: 'Deposits',
      rows: [
        ['Branch', 'Region', 'Jul', 'Aug', 'Sep', 'Q3 Total', 'Monthly Avg'],
        ...BR2.map((b, i) => [b, REGIONS[i % REGIONS.length], ...months[i].map((x) => (x === null ? '' : x))]),
        ['Total'],
        [],
        ['Largest Sep balance'],
        ['Smallest Sep balance'],
        ['Branches reporting Sep (COUNT)'],
        ['Branches in report (COUNTA)'],
      ],
      widths: [210, 90, 80, 80, 80, 90, 100],
      formats: { 2: '#,##0.0', 3: '#,##0.0', 4: '#,##0.0' },
      styles: { ...fmtBlock(['F', 'G'], 2, 11, '#,##0.0'), ...fmtBlock(['C', 'D', 'E'], 12, 12, '#,##0.0'), A12: { b: true } },
    },
  ]);

// ---------------- Lesson 3 data: product mix + a rate grid ----------------
const MIX: [string, number][] = [
  ['Mortgage', 1_842_500_000],
  ['HELOC', 312_400_000],
  ['Auto Loan', 455_750_000],
  ['Credit Card', 128_900_000],
  ['Personal Loan', 96_300_000],
  ['Business Loan', 1_020_000_000],
];
const MIX_TOTAL = MIX.reduce((a, [, b]) => a + b, 0);
const EUR = 0.9223;
const GRID_BAL = [10_000, 25_000, 50_000, 100_000, 250_000, 500_000];
const GRID_RATE = [0.03, 0.04, 0.05, 0.06, 0.07];
const GRID_COLS = ['B', 'C', 'D', 'E', 'F'];

const mixBook = () =>
  makeBook('Portfolio_Mix.xlsx', [
    {
      name: 'Mix',
      rows: [
        ['Product', 'Balance (USD)', '% of Total', 'Balance (EUR)', '', 'USD→EUR', EUR],
        ...MIX.map(([p, b]) => [p, b, '', '', '', '', '']),
        ['Total', '=SUM(B2:B7)'],
      ],
      widths: [120, 130, 90, 130, 30, 80, 70],
      formats: { 1: '#,##0', 2: '0.0%', 3: '#,##0' },
      styles: {
        ...fmtBlock(['C'], 2, 7, '0.0%'),
        ...fmtBlock(['D'], 2, 7, '#,##0'),
        A8: { b: true },
        B8: { b: true, fmt: '#,##0', border: { t: true } },
        F1: { b: true, fill: '#DDEBF7' },
        G1: { color: '#0070C0', fill: '#FFF2CC' },
      },
    },
    {
      name: 'RateGrid',
      header: false,
      rows: [
        ['Monthly interest by balance and annual rate'],
        ['Balance \\ Rate', ...GRID_RATE],
        ...GRID_BAL.map((b) => [b]),
      ],
      widths: [130, 80, 80, 80, 80, 80],
      styles: {
        A1: { b: true },
        A2: { b: true, fill: '#DDEBF7' },
        ...Object.fromEntries(GRID_COLS.map((c) => [`${c}2`, { b: true, fill: '#DDEBF7', fmt: '0.0%' }])),
        ...Object.fromEntries(GRID_BAL.map((_, i) => [`A${i + 3}`, { b: true, fmt: '#,##0' }])),
        ...Object.fromEntries(GRID_BAL.flatMap((_, i) => GRID_COLS.map((c) => [`${c}${i + 3}`, { fmt: '#,##0.00' }]))),
      },
    },
  ]);

// ---------------- Lesson 4 data: daily interest accrual ----------------
const r4 = rng(55);
const ACCR = Array.from({ length: 10 }, (_, i) => ({
  acct: `DDA-${70410 + i * 17}`,
  bal: round2(5000 + r4() * 895000),
  rate: Math.round((0.005 + r4() * 0.04) * 10000) / 10000,
}));
const dailyInt = ACCR.map((a) => (a.bal * a.rate) / 365);
const posted = dailyInt.map((x) => xlRound(x, 2));
const rawTotal = dailyInt.reduce((a, b) => a + b, 0);
const postedTotal = posted.reduce((a, b) => a + b, 0);

const accrBook = () =>
  makeBook('Interest_Accrual_0630.xlsx', [
    {
      name: 'Accrual',
      rows: [
        ['Account', 'Balance', 'Rate', 'Daily Interest', 'Posted (rounded)', 'Balance (nearest $000)'],
        ...ACCR.map((a, i) => [a.acct, a.bal, a.rate, `=B${i + 2}*C${i + 2}/365`, '', '']),
        ['Total', '', '', '=SUM(D2:D11)', ''],
        [],
        ['Rounding difference', ''],
      ],
      widths: [140, 110, 70, 110, 120, 160],
      formats: { 1: '#,##0.00', 2: '0.00%', 3: '#,##0.0000', 4: '#,##0.00', 5: '#,##0' },
      styles: {
        ...fmtBlock(['E'], 2, 11, '#,##0.00'),
        ...fmtBlock(['F'], 2, 11, '#,##0'),
        A12: { b: true },
        D12: { b: true, fmt: '#,##0.0000' },
        E12: { b: true, fmt: '#,##0.00' },
        B14: { fmt: '#,##0.0000' },
      },
    },
  ]);

export const module: Module = {
  id: 'm04',
  title: 'Formulas & References',
  level: 'Foundation',
  icon: '🧮',
  blurb: 'Arithmetic, SUM/AVERAGE/COUNT, AutoSum and Fill Down — then the idea that unlocks all of Excel: relative, absolute and mixed references.',
  lessons: [
    // =====================================================================
    {
      id: 'm04-l1',
      title: 'Arithmetic & order of operations',
      summary: 'Write formulas with + − * / ^, use parentheses on purpose, and copy them down with Ctrl+D and the fill handle.',
      minutes: 8,
      featured: ['=', '+ - * / ^', '( )', 'Ctrl+D', 'Double-click fill handle'],
      intro: `A formula starts with \`=\`. After that it is ordinary maths on **cell references**: \`=B2*C2\` multiplies whatever is in B2 by whatever is in C2. Change B2 and the result updates — that is the whole point. **Never type a number that already lives in a cell**; point at the cell instead.

**Operators:** \`+\` \`-\` \`*\` (multiply) \`/\` (divide) \`^\` (power).

**Order of operations** — Excel follows the school rules:
1. Parentheses \`( )\`
2. Powers \`^\`
3. Multiply and divide \`* /\` (left to right)
4. Add and subtract \`+ -\` (left to right)

So \`=E2+D2/12\` divides only D2 by 12, then adds E2. If you mean "add them, *then* divide", you must write \`=(E2+D2)/12\`. Excel will not warn you — both formulas are valid, one is just wrong. When in doubt, add parentheses: they cost nothing and make your intent obvious to a reviewer.

**Copying formulas down:**
- [[Ctrl+D]] (Fill Down) copies the top cell of the selection into the cells below it.
- **Double-click the fill handle** (the small square at the bottom-right of the selection) and Excel fills down as far as the column next to it has data — perfect for a 10,000-row extract.

When a formula is copied down a row, \`B2\` becomes \`B3\`, \`B4\`… automatically. These are **relative references** — more on that in lesson 3.

**Common mistakes**
- Forgetting the \`=\`: Excel stores the text "B2*C2".
- Typing the rate as a number (\`=B2*0.0525\`) — the next time the rate changes, the formula is silently wrong.
- Missing parentheses around a sum before dividing.`,
      workbooks: () => [costBook()],
      start: { cell: 'E2' },
      tasks: [
        {
          id: 't1',
          title: 'Annual interest = balance × rate',
          instruction: 'In **E2** type `=B2*C2` and press [[Enter]]. (Tip: type `=`, click B2, type `*`, click C2 — Excel writes the references for you.)',
          why: 'Pointing at cells instead of typing numbers means the formula keeps working when the balance or rate is updated — next month\'s tape drops straight in.',
          hints: ['Start with = so Excel knows it is a formula.', 'Multiply is the * key.', 'The formula is =B2*C2.'],
          check: (c) =>
            all(
              /^=(B2\*C2|C2\*B2)$/.test(norm(c.f('E2'))) ? true : 'E2 should be a formula that multiplies B2 by C2.',
              approx(c.v('E2'), expInterest[0]) ? true : 'E2 does not equal balance × rate yet.',
            ),
          solution: [{ set: { E2: '=B2*C2' } }],
        },
        {
          id: 't2',
          title: 'Monthly cost — parentheses matter',
          instruction: 'In **F2** calculate the monthly cost: annual interest **plus** the annual fee, **divided by 12**. Enter `=(E2+D2)/12`.',
          why: 'Without parentheses, =E2+D2/12 divides only the fee by 12 and adds a full year of interest — a 12× overstatement that no error message will catch. Reading formulas with "what happens first?" in mind is a core reviewer skill.',
          hints: ['Multiplication and division happen before addition.', 'Wrap the addition in parentheses: (E2+D2).', 'The formula is =(E2+D2)/12.'],
          check: (c) => {
            const v = c.v('F2');
            if (approx(v, expInterest[0] + FEES[0] / 12) && !approx(v, expMonthly[0])) return 'F2 divided only the fee by 12 — wrap E2+D2 in parentheses before dividing.';
            return all(
              norm(c.f('F2')).startsWith('=') && /E2/.test(norm(c.f('F2'))) && /D2/.test(norm(c.f('F2'))) ? true : 'F2 should be a formula using E2 and D2.',
              approx(v, expMonthly[0]) ? true : 'F2 should be (annual interest + annual fee) / 12.',
            );
          },
          solution: [{ set: { F2: '=(E2+D2)/12' } }],
        },
        {
          id: 't3',
          title: 'Fill down with Ctrl+D',
          instruction: `Select **E2:F${L1_LAST}** (both formula columns, down to the last loan) and press [[Ctrl+D]].`,
          why: 'Ctrl+D copies the top row of the selection into every row below it, adjusting B2 → B3 → B4 as it goes. One keystroke, no dragging, and it is exactly as many rows as you selected.',
          hints: [`E3:F${L1_LAST} are still empty, so Ctrl+Shift+↓ would overshoot to the bottom of the sheet. Type E2:F${L1_LAST} in the Name Box (or click E2, then Shift+click F${L1_LAST}).`, 'With the block selected, press Ctrl+D.'],
          check: (c) =>
            all(
              formulaShape(c, `E3:E${L1_LAST}`, 3, (f, r) => f.includes(`B${r}`) && f.includes(`C${r}`), (a) => `${a} should hold the interest formula for its own row — select E2:F${L1_LAST} and press Ctrl+D.`),
              formulaShape(c, `F3:F${L1_LAST}`, 3, (f, r) => f.includes(`E${r}`) && f.includes(`D${r}`), (a) => `${a} should hold the monthly cost formula for its own row.`),
              valuesEqual(c, `E2:E${L1_LAST}`, expInterest, 'Annual Interest'),
              valuesEqual(c, `F2:F${L1_LAST}`, expMonthly, 'Monthly Cost'),
            ),
          solution: [{ select: `E2:F${L1_LAST}` }, { cmd: 'fill.down' }],
          mustUseKeys: ['fill.down'],
        },
        {
          id: 't4',
          title: 'Powers and the fill handle',
          instruction: 'In **G2** project the balance after 3 years of compounding: `=B2*(1+C2)^3`. Then select G2 and **double-click the fill handle** (the small square at its bottom-right corner) to copy it down.',
          why: '^ is "to the power of": (1+rate)^3 compounds three times. Powers are evaluated before multiplication, so the parentheses around 1+C2 are essential. The fill-handle double-click is the fastest way to fill a formula to the bottom of a long extract — Excel looks at the neighbouring column to know where to stop.',
          hints: ['The ^ symbol is Shift+6.', '(1+C2) must be in parentheses, otherwise only C2 is cubed.', 'After entering G2, re-select it and double-click the little square at its bottom-right corner.'],
          check: (c) =>
            all(
              formulaShape(c, `G2:G${L1_LAST}`, 2, (f, r) => f.includes('^') && f.includes(`B${r}`) && f.includes(`C${r}`), (a) => `${a} should hold the compounding formula (with ^) for its own row.`),
              valuesEqual(c, `G2:G${L1_LAST}`, expGrowth, 'Balance in 3 yrs'),
            ),
          solution: [{ set: { G2: '=B2*(1+C2)^3' } }, { select: 'G2' }, { cmd: 'fill.handleDouble' }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm04-l2',
      title: 'SUM, AVERAGE, MIN, MAX & COUNT',
      summary: 'The everyday aggregate functions, AutoSum with Alt+=, and why COUNT and COUNTA give different answers.',
      minutes: 8,
      featured: ['Alt+=', 'SUM', 'AVERAGE', 'MIN', 'MAX', 'COUNT', 'COUNTA', 'Ctrl+R'],
      intro: `Functions take a **range** like \`C2:C11\` (everything from C2 to C11) and return one answer:

- \`=SUM(C2:C11)\` adds · \`=AVERAGE(C2:C11)\` mean · \`=MIN()\` / \`=MAX()\` smallest / largest.
- \`=COUNT(E2:E11)\` counts cells that contain **numbers**.
- \`=COUNTA(A2:A11)\` counts cells that are **not empty** (numbers, text, anything).

**AutoSum** [[Alt+=]] writes \`=SUM(...)\` for you, guessing the range from the numbers directly above (or to the left). Always glance at the guess before pressing Enter — it stops at the first blank or text cell.

**How blanks and text are treated — this is where analysts get caught:**
- SUM, AVERAGE, MIN, MAX and COUNT **ignore** blank cells and text.
- So AVERAGE of {100, 200, blank} is **150**, not 100. If a blank really means zero, the average is overstated.
- A number stored as text ("n/a", or "1,234" pasted from a PDF) is skipped silently.

That makes **COUNT vs COUNTA** a powerful data-quality check: if 10 branches are listed (COUNTA of names) but only 8 have numeric September balances (COUNT), two branches are missing or broken — before anyone reads your total.

[[Ctrl+R]] (Fill Right) is the sideways twin of Ctrl+D.`,
      workbooks: () => [depBook()],
      start: { cell: 'C12' },
      tasks: [
        {
          id: 't1',
          title: 'AutoSum the months',
          instruction: 'Click **C12** and press [[Alt+=]]. Excel proposes `=SUM(C2:C11)` — press [[Enter]]. Then select **C12:E12** and press [[Ctrl+R]] to copy the total across to Aug and Sep.',
          why: 'AutoSum is the most-used shortcut in finance: totals in two keystrokes, with the range picked for you. Ctrl+R then copies it sideways, shifting C → D → E. Why not AutoSum in E12 too? Try reading what it would guess: September has "n/a" in row 9, so AutoSum would stop there and propose only E10:E11 — exactly the kind of silent partial total you must watch for.',
          hints: ['Alt and = together (Alt+=), then Enter to accept.', 'Select C12:E12 and Ctrl+R fills the formula right.'],
          check: (c) =>
            all(
              c.used('edit.autosum') ? true : 'Use AutoSum (Alt+=) for the total in C12.',
              ['C', 'D', 'E'].map((col) => (norm(c.f(`${col}12`)) === `=SUM(${col}2:${col}11)` ? true : `${col}12 should be =SUM(${col}2:${col}11).`)).find((x) => x !== true) ?? true,
              valuesEqual(c, 'C12:E12', [colSum(0), colSum(1), colSum(2)], 'Totals'),
            ),
          solution: [{ select: 'C12' }, { cmd: 'edit.autosum' }, { custom: (s) => s.commitEdit('none') }, { select: 'C12:E12' }, { cmd: 'fill.right' }],
          mustUseKeys: ['edit.autosum'],
        },
        {
          id: 't2',
          title: 'Quarter total and monthly average per branch',
          instruction: 'In **F2** enter `=SUM(C2:E2)` and in **G2** `=AVERAGE(C2:E2)`. Then fill both down to row 11 (select **F2:G11**, [[Ctrl+D]]). Look at ATL-01 (row 5) and PHX-01 (row 9).',
          why: 'ATL-01 has no September yet and PHX-01 has "n/a". AVERAGE ignores both, so their averages are over 2 months, not 3 — reasonable here, but you need to *know* it happened. Excel never warns you about a skipped cell.',
          hints: ['SUM and AVERAGE take the same range: C2:E2.', 'Select F2:G11 and press Ctrl+D to fill both columns at once.'],
          check: (c) =>
            all(
              formulaShape(c, 'F2:F11', 2, (f, r) => f === `=SUM(C${r}:E${r})`, (a) => `${a} should be =SUM(C:E) for its own row.`),
              formulaShape(c, 'G2:G11', 2, (f, r) => f === `=AVERAGE(C${r}:E${r})`, (a) => `${a} should be =AVERAGE(C:E) for its own row.`),
              valuesEqual(c, 'F2:F11', months.map((m) => nums(m).reduce((a, b) => a + b, 0)), 'Q3 Total'),
              valuesEqual(c, 'G2:G11', months.map((m) => nums(m).reduce((a, b) => a + b, 0) / nums(m).length), 'Monthly Avg'),
            ),
          solution: [{ set: { F2: '=SUM(C2:E2)', G2: '=AVERAGE(C2:E2)' } }, { select: 'F2:G11' }, { cmd: 'fill.down' }],
        },
        {
          id: 't3',
          title: 'Largest and smallest September balance',
          instruction: 'In **B14** enter `=MAX(E2:E11)` and in **B15** `=MIN(E2:E11)`.',
          why: 'MIN and MAX are the first thing to run on any new numeric column: an unexpectedly huge or negative value is usually a data error (a balance in cents instead of dollars, a sign flip) — you want to find it before it is in a pivot.',
          hints: ['Same pattern as SUM: function name, then the range in parentheses.', 'September is column E, rows 2 to 11.'],
          check: (c) =>
            all(
              norm(c.f('B14')) === '=MAX(E2:E11)' ? true : 'B14 should be =MAX(E2:E11).',
              norm(c.f('B15')) === '=MIN(E2:E11)' ? true : 'B15 should be =MIN(E2:E11).',
              approx(c.v('B14'), Math.max(...sepNums)) && approx(c.v('B15'), Math.min(...sepNums)) ? true : 'Check the ranges in B14 and B15.',
            ),
          solution: [{ set: { B14: '=MAX(E2:E11)', B15: '=MIN(E2:E11)' } }],
        },
        {
          id: 't4',
          title: 'COUNT vs COUNTA — a data-quality check',
          instruction: 'In **B16** enter `=COUNT(E2:E11)` (branches with a numeric September balance) and in **B17** `=COUNTA(A2:A11)` (branches in the report). They differ — that gap is the number of branches you need to chase.',
          why: `COUNTA says ${BR2.length} branches are listed; COUNT says only ${sepNums.length} have a usable September number. Putting both side by side is a simple, permanent completeness check — the kind of control an auditor loves to see on a month-end pack.`,
          hints: ['COUNT counts numbers only; COUNTA counts anything non-empty.', 'B16: =COUNT(E2:E11). B17: =COUNTA(A2:A11).'],
          check: (c) =>
            all(
              norm(c.f('B16')).startsWith('=COUNT(') ? true : 'B16 should use COUNT on the September column.',
              norm(c.f('B17')).startsWith('=COUNTA(') ? true : 'B17 should use COUNTA on the branch names.',
              c.v('B16') === sepNums.length ? true : `B16 should count the numeric September balances (E2:E11).`,
              c.v('B17') === BR2.length ? true : 'B17 should count the branch names (A2:A11).',
            ),
          solution: [{ set: { B16: '=COUNT(E2:E11)', B17: '=COUNTA(A2:A11)' } }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm04-l3',
      title: 'Relative, absolute & mixed references',
      summary: 'Lock a total with $B$8, lock an FX rate, build a rate grid with $A3 and B$2, and audit with Ctrl+`.',
      minutes: 10,
      featured: ['$A$1', 'A$1', '$A1', 'F4', 'Ctrl+`'],
      intro: `When you copy a formula, Excel does not copy the *addresses* — it copies the *directions*. \`=B2/B8\` in C2 really means "the cell one to my left, divided by the cell six rows down and one left". Copy it to C3 and you get \`=B3/B9\` — B9 is empty, so you get **#DIV/0!**. That is a **relative** reference doing exactly what it is told.

A **$** pins the part that follows it:

- \`B8\` **relative** — row and column both move. Row-by-row maths.
- \`$B$8\` **absolute** — nothing moves. One total, one rate, one assumption.
- \`B$8\` **mixed, row locked** — the column moves, row 8 stays. A header row of rates.
- \`$B8\` **mixed, column locked** — the row moves, column B stays. A column of balances.

Press [[F4]] while the cursor is on a reference to cycle **B8 → $B$8 → B$8 → $B8 → B8**. Much faster (and less error-prone) than typing the dollars.

**The mixed-reference trick:** in a grid where the rows are balances (column A) and the columns are rates (row 2), one formula \`=$A3*B$2\` can be copied to *every* cell. \`$A\` always looks at the balance column; \`$2\` always looks at the rate row.

**Auditing:** [[Ctrl+\`]] (the key left of 1) shows every formula instead of its result. Scan a column: every row should look the same except for the row number. One cell that looks different is your bug.

**Common mistakes**
- Locking everything ($A$3) "to be safe" — then the copied formulas all point at the same cell.
- Forgetting to lock the total → #DIV/0! or silently wrong percentages.`,
      workbooks: () => [mixBook()],
      start: { sheet: 'Mix', cell: 'C2' },
      tasks: [
        {
          id: 't1',
          title: '% of total with a locked total',
          instruction: 'In **C2** enter `=B2/$B$8` (type `=B2/B8` and press [[F4]] once while the cursor is on B8). Then fill it down to **C7**.',
          why: 'Every row divides its own balance (relative B2 → B3 → …) by the same total (absolute $B$8). Without the $, the copies would divide by B9, B10… — empty cells → #DIV/0!. Product-mix tables like this are in every portfolio review.',
          hints: ['B2 should move as you copy down; B8 should not.', 'F4 right after typing B8 turns it into $B$8.', 'Select C2:C7 and Ctrl+D (or double-click the fill handle).'],
          check: (c) => {
            const errs = c.list('C2:C7').some((v) => v !== null && typeof v === 'object');
            if (errs) return 'Some cells show an error — is the total locked as $B$8?';
            return all(
              formulaShape(c, 'C2:C7', 2, (f, r) => f.includes(`B${r}/`) && /\$?B\$8/.test(f), (a) => `${a} should divide its own balance by the locked total: =B…/$B$8.`),
              valuesEqual(c, 'C2:C7', MIX.map(([, b]) => b / MIX_TOTAL), '% of Total'),
            );
          },
          solution: [{ set: { 'C2:C7': '=B2/$B$8' } }],
        },
        {
          id: 't2',
          title: 'Convert to EUR with a locked FX rate',
          instruction: 'The USD→EUR rate sits in **G1**. In **D2** enter `=B2*$G$1` and fill down to **D7**.',
          why: 'Keep a rate in ONE input cell (blue font — remember module 3) and point every formula at it with $G$1. When treasury sends tomorrow\'s rate you change one cell, not six formulas — and you cannot forget one.',
          hints: ['Lock G1 completely: $G$1.', 'Select D2:D7 and Ctrl+D.'],
          check: (c) =>
            all(
              formulaShape(c, 'D2:D7', 2, (f, r) => f.includes(`B${r}`) && /\$?G\$1/.test(f) && !/0\.9223/.test(f), (a) => `${a} should multiply its balance by the locked rate cell: =B…*$G$1 (no typed-in rate).`),
              valuesEqual(c, 'D2:D7', MIX.map(([, b]) => b * EUR), 'Balance (EUR)'),
            ),
          solution: [{ set: { 'D2:D7': '=B2*$G$1' } }],
        },
        {
          id: 't3',
          title: 'One formula for the whole rate grid',
          instruction: 'Go to the **RateGrid** sheet. In **B3** enter `=$A3*B$2/12` (monthly interest = balance × annual rate ÷ 12). Then copy it to the whole grid **B3:F8** — e.g. select B3:F8 and press [[Ctrl+D]] then [[Ctrl+R]], or copy B3 and paste onto B3:F8.',
          why: '$A3 keeps pointing at column A (the balances) when you copy right, but moves down the rows. B$2 keeps pointing at row 2 (the rates) when you copy down, but moves across. One formula, 30 correct cells — this pattern builds every sensitivity table and rate card you will ever make.',
          hints: ['Ask for each reference: should it move when I copy right? when I copy down?', 'Balance: column fixed, row moves → $A3. Rate: row fixed, column moves → B$2.', 'Press F4 three times on A3 to get $A3; twice on B2 to get B$2.'],
          check: (c) => {
            for (let i = 0; i < GRID_BAL.length; i++)
              for (let j = 0; j < GRID_COLS.length; j++) {
                const a = `${GRID_COLS[j]}${i + 3}`;
                const f = norm(c.f(`RateGrid!${a}`));
                if (!f.startsWith('=')) return `RateGrid!${a} is empty — copy the formula across the whole grid B3:F8.`;
                if (!approx(c.v(`RateGrid!${a}`), (GRID_BAL[i] * GRID_RATE[j]) / 12)) return `RateGrid!${a} is wrong — does it still point at column A and row 2? Use $A3 and B$2.`;
                if (!f.includes(`$A${i + 3}`) || !f.includes(`${GRID_COLS[j]}$2`)) return `RateGrid!${a} should use mixed references ($A${i + 3} and ${GRID_COLS[j]}$2).`;
              }
            return true;
          },
          solution: [{ sheetTab: 'RateGrid' }, { set: { 'RateGrid!B3': '=$A3*B$2/12' } }, { select: 'RateGrid!B3:F8' }, { cmd: 'fill.down' }, { cmd: 'fill.right' }],
        },
        {
          id: 't4',
          title: 'Audit with Show Formulas',
          instruction: 'Press [[Ctrl+`]] (the key left of 1) to show formulas instead of results. Scan the grid: every cell should follow the same $A/…$2 pattern. Press it again later to switch back.',
          why: 'Show Formulas is the fastest review tool in Excel: inconsistent formulas jump out visually. Reviewers use it to spot the one hard-coded number or the one formula that points at the wrong row.',
          hints: ['The backtick ` key is usually top-left, under Esc.', 'It is a toggle: same keys to switch back.'],
          check: (c) => (c.store.showFormulas && c.used('view.formulas') ? true : 'Press Ctrl+` to switch on Show Formulas.'),
          solution: [{ cmd: 'view.formulas' }],
          mustUseKeys: ['view.formulas'],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm04-l4',
      title: 'ROUND and the penny problem',
      summary: 'Round posted interest to cents, measure the rounding difference, and round to thousands for a board pack.',
      minutes: 7,
      featured: ['ROUND', 'ROUND(x,-3)'],
      intro: `\`=ROUND(number, digits)\` changes the **value**, not just the display. \`=ROUND(12.3456, 2)\` is 12.35 — and that is what every formula downstream will see.

**Formatting vs rounding:** a cell formatted to 2 decimals still *holds* 12.3456. Add up a column of such cells and the total can differ by a cent from the sum of what is displayed. In banking that matters: interest is **posted to accounts in cents**, so the ledger total is the sum of *rounded* amounts. If your spreadsheet sums unrounded amounts, it will not tie to the GL.

**digits** can be:
- \`2\` → cents · \`0\` → whole units
- \`-3\` → nearest thousand: \`=ROUND(1234567,-3)\` is 1,235,000 (useful for board packs where "$1.2bn" level precision is enough).

ROUNDUP / ROUNDDOWN always round away from / toward zero (fees and caps sometimes require this).

**Common mistakes**
- Rounding in the middle of a calculation chain and compounding the error — round at the point where the real world rounds (the posting), not earlier.
- Using formatting when the business rule actually requires rounded values.`,
      workbooks: () => [accrBook()],
      start: { cell: 'E2' },
      tasks: [
        {
          id: 't1',
          title: 'Round the posted interest to cents',
          instruction: 'In **E2** enter `=ROUND(D2,2)` and fill it down to **E11**.',
          why: 'Column D is the exact accrual (shown to 4 decimals). The core system posts cents, so column E is what actually hits each customer\'s account.',
          hints: ['ROUND takes the number and the number of decimals.', 'Fill down with Ctrl+D (select E2:E11) or the fill handle.'],
          check: (c) =>
            all(
              formulaShape(c, 'E2:E11', 2, (f, r) => f === `=ROUND(D${r},2)`, (a) => `${a} should be =ROUND(D…,2) for its own row.`),
              valuesEqual(c, 'E2:E11', posted, 'Posted (rounded)'),
            ),
          solution: [{ set: { 'E2:E11': '=ROUND(D2,2)' } }],
        },
        {
          id: 't2',
          title: 'Measure the rounding difference',
          instruction: 'In **E12** total the posted amounts with `=SUM(E2:E11)`. In **B14** show the difference between what was posted and the exact accrual: `=E12-D12`.',
          why: `The difference is tiny (fractions of a cent per account here) but on a million accounts it becomes real money that Finance has to explain. Knowing where it comes from — rounding at posting — is exactly the answer a controller wants to hear.`,
          hints: ['E12: =SUM(E2:E11) — or Alt+= from E12.', 'B14: posted total minus exact total.'],
          check: (c) =>
            all(
              norm(c.f('E12')) === '=SUM(E2:E11)' ? true : 'E12 should be =SUM(E2:E11).',
              norm(c.f('B14')).startsWith('=') && /E12/.test(norm(c.f('B14'))) && /D12/.test(norm(c.f('B14'))) ? true : 'B14 should be a formula comparing E12 and D12.',
              typeof c.v('B14') === 'number' && Math.abs((c.v('B14') as number) - (postedTotal - rawTotal)) < 1e-7 ? true : 'B14 should be posted total minus exact total (=E12-D12).',
            ),
          solution: [{ set: { E12: '=SUM(E2:E11)', B14: '=E12-D12' } }],
        },
        {
          id: 't3',
          title: 'Round to the nearest thousand',
          instruction: 'For the board pack, in **F2** enter `=ROUND(B2,-3)` and fill down to **F11**. A negative digits argument rounds to the left of the decimal point.',
          why: 'Senior readers want "$412k", not "$412,538.17". Rounding with ROUND(…,-3) gives clean numbers that still add up predictably — and the original balances stay untouched in column B for anyone who needs the detail.',
          hints: ['-1 = nearest 10, -2 = nearest 100, -3 = nearest 1,000.', 'Fill F2 down to F11.'],
          check: (c) =>
            all(
              formulaShape(c, 'F2:F11', 2, (f, r) => f === `=ROUND(B${r},-3)`, (a) => `${a} should be =ROUND(B…,-3) for its own row.`),
              valuesEqual(c, 'F2:F11', ACCR.map((a) => xlRound(a.bal, -3)), 'Balance (nearest $000)'),
            ),
          solution: [{ set: { 'F2:F11': '=ROUND(B2,-3)' } }],
        },
      ],
    },
  ],
  quiz: [
    { kind: 'mc', q: 'What does =2+3*4 return?', options: ['20', '14', '24', '9'], answer: 1, explain: 'Multiplication happens before addition: 3*4 = 12, then +2 = 14. Use (2+3)*4 for 20.' },
    { kind: 'keys', q: 'Insert an AutoSum in the active cell.', cmd: 'edit.autosum', keys: 'Alt+=', explain: 'Alt+= writes =SUM() with a guessed range — check it, then Enter.' },
    { kind: 'keys', q: 'Copy the top cell of the selection down into the rest of it.', cmd: 'fill.down', keys: 'Ctrl+D', explain: 'Ctrl+D = Fill Down, Ctrl+R = Fill Right.' },
    { kind: 'keys', q: 'Toggle Show Formulas.', cmd: 'view.formulas', keys: 'Ctrl+`', explain: 'Ctrl+` shows every formula — the quickest audit view.' },
    {
      kind: 'mc',
      q: 'You press F4 repeatedly with the cursor on A1. What is the cycle?',
      options: ['A1 → $A1 → A$1 → $A$1', 'A1 → $A$1 → A$1 → $A1 → A1', 'A1 → $A$1 → A1', 'A1 → A$1 → $A$1 → $A1'],
      answer: 1,
      explain: 'F4 cycles: fully absolute, row locked, column locked, back to relative.',
    },
    {
      kind: 'mc',
      q: 'B3 contains =$A3*B$2. You copy it to C4. What does C4 contain?',
      options: ['=$A3*B$2', '=$A4*C$2', '=$A4*C$3', '=$B4*C$2'],
      answer: 1,
      explain: '$A stays column A, the row 3 moves to 4; row $2 stays, column B moves to C.',
    },
    {
      kind: 'mc',
      q: 'AVERAGE(C2:E2) where C2=100, D2=200 and E2 is blank returns…',
      options: ['100', '150', '#DIV/0!', '0'],
      answer: 1,
      explain: 'Blank cells are ignored, so it averages two values. If blank means zero, put a 0 in the cell.',
    },
    {
      kind: 'formula',
      q: 'In C2, calculate this product\'s share of the total balance in B6 (as a decimal). Lock the total so the formula could be copied down.',
      grid: [
        ['Product', 'Balance', 'Share'],
        ['Mortgage', 600, ''],
        ['Auto', 250, ''],
        ['Card', 100, ''],
        ['Personal', 50, ''],
        ['Total', 1000, ''],
      ],
      at: 'C2',
      expect: 0.6,
      model: '=B2/$B$6',
      explain: 'Relative B2 moves with each row; $B$6 always points at the total.',
    },
    {
      kind: 'formula',
      q: 'B2 has 1,234,567.89. In C2, round it to the nearest thousand.',
      grid: [
        ['Item', 'Balance', 'Rounded'],
        ['Deposits', 1234567.89, ''],
      ],
      at: 'C2',
      expect: 1235000,
      model: '=ROUND(B2,-3)',
      explain: 'A negative digits argument rounds left of the decimal point: -3 = thousands.',
      mustUse: ['ROUND'],
    },
    {
      kind: 'formula',
      q: 'A2:A6 lists 5 branches; B2:B6 has their balances but two are "n/a". In D2, count how many branches have a numeric balance.',
      grid: [
        ['Branch', 'Balance', '', 'Reporting'],
        ['NYC-01', 410, '', ''],
        ['BOS-01', 'n/a', '', ''],
        ['CHI-01', 305, '', ''],
        ['DAL-01', 'n/a', '', ''],
        ['SEA-01', 156, '', ''],
      ],
      at: 'D2',
      expect: 3,
      model: '=COUNT(B2:B6)',
      explain: 'COUNT counts numbers only; COUNTA would return 5.',
      mustUse: ['COUNT'],
    },
  ],
};
