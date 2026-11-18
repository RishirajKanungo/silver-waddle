import type { CheckCtx, Module } from '../types';
import type { Scalar } from '../../engine/types';
import { ERR, XLError } from '../../engine/types';
import { addrToA1, parseRange } from '../../engine/refs';
import { makeBook, customers, loans, rng, pick, between, round2, type Cellish } from '../data';
import { all, approx, fmtScalar, formulasMatch } from '../runner';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const NA = ERR.NA;
const isNA = (v: Scalar) => v instanceof XLError && v.code === '#N/A';

/** Compare a single-column (or single-row) range with expected values. Errors compare by code. */
function colEquals(c: CheckCtx, ref: string, exp: Scalar[], label: string): true | string {
  const got = c.list(ref);
  const r = parseRange(ref.replace(/^.*!/, ''))!;
  const vertical = r.r1 !== r.r2;
  for (let i = 0; i < exp.length; i++) {
    const e = exp[i], g = got[i];
    let ok: boolean;
    if (e instanceof XLError) ok = g instanceof XLError && g.code === e.code;
    else if (typeof e === 'number') ok = approx(g, e, 0.0005);
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

/** Lay several blocks of rows onto one sheet grid. `at` is the top-left cell of each block. */
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
/** Header styles for a block that does not start on row 1. */
function hdrStyles(cells: string[]) {
  return Object.fromEntries(cells.map((a) => [a, { ...HDR }]));
}

const lockedKP = /\$K\$?\d*:\$P\$?\d*/i;

// ---------------------------------------------------------------------------
// Data (seeded => identical for every learner and for the tests)
// ---------------------------------------------------------------------------

const CUST = customers(60, 7);
const LOANS = loans(CUST, 120, 11);
const byId = new Map(CUST.map((c) => [c.id, c]));

const masterRows: Cellish[][] = [
  ['Customer ID', 'Name', 'Segment', 'Region', 'Rating', 'Branch'],
  ...CUST.map((c) => [c.id, c.name, c.segment, c.region, c.rating, c.branch]),
];

// ---- Lessons 1 & 2: loan tape + customer master side by side ----
function tapeBook(n: number, prefillE2?: string) {
  const tape = LOANS.slice(0, n);
  const rows = layout([
    {
      at: 'A1',
      rows: [
        ['Loan ID', 'Customer ID', 'Product', 'Balance', 'Customer Name', 'Segment', 'Rating', 'Branch'],
        ...tape.map((l) => [l.id, l.cust, l.product, l.balance, null, null, null, null]),
      ],
    },
    { at: 'K1', rows: masterRows },
  ]);
  if (prefillE2) rows[1][4] = prefillE2;
  return makeBook('Loan_Book.xlsx', [
    {
      name: 'Tape',
      rows,
      widths: [90, 95, 100, 100, 140, 110, 60, 70, 30, 30, 95, 140, 110, 90, 60, 70],
      formats: { 3: '#,##0.00' },
      freeze: true,
    },
  ]);
}
const tape30 = LOANS.slice(0, 30);
const tape40 = LOANS.slice(0, 40);
const fieldOf = (l: { cust: string }, k: 'name' | 'segment' | 'region' | 'rating' | 'branch') => byId.get(l.cust)![k];

// How many rows break when the unlocked formula is filled down E2:E41?
// Row r (1-based) looks in K r : P r+59, i.e. master index >= r-2.
const brokenCount = tape40.filter((l, i) => CUST.findIndex((c) => c.id === l.cust) < i).length;

// ---- Lesson 3: dirty keys ----
const L3 = LOANS.slice(40, 64); // 24 loans
const L3_MISSING = new Set([L3[6].cust, L3[20].cust]); // customers onboarded after the master was extracted
const L3_DIRTY: Record<number, (id: string) => string> = {
  3: (id) => id + ' ',
  9: (id) => id + '  ',
  16: (id) => ' ' + id,
};
const l3Keys = L3.map((l, i) => (L3_DIRTY[i] ? L3_DIRTY[i](l.cust) : l.cust));
const l3Master = CUST.filter((c) => !L3_MISSING.has(c.id));
const L3_END = l3Master.length + 1; // last row of the master table
const l3Find = (key: string) => l3Master.find((c) => c.id.toLowerCase() === key.toLowerCase());
const l3Raw: Scalar[] = l3Keys.map((k) => l3Find(k)?.name ?? NA);
const l3Trim: Scalar[] = l3Keys.map((k) => l3Find(k.trim())?.name ?? NA);
const l3Label: Scalar[] = l3Keys.map((k) => l3Find(k.trim())?.name ?? 'Not found');
const l3RawNA = l3Raw.filter(isNA).length;
const l3NotFound = l3Label.filter((x) => x === 'Not found').length;
const l3Rng = `$K$2:$M$${L3_END}`;

// ---- Lesson 4: numbers stored as text (GL extract) ----
const COA: [number, string][] = [
  [10100, 'Cash & Due from Banks'],
  [12000, 'Loans Held for Investment'],
  [12500, 'Allowance for Credit Losses'],
  [15000, 'Premises & Equipment'],
  [20100, 'Demand Deposits'],
  [20200, 'Savings Deposits'],
  [20300, 'Time Deposits'],
  [40100, 'Interest Income - Loans'],
  [40200, 'Interest Income - Securities'],
  [50100, 'Interest Expense - Deposits'],
  [60100, 'Salaries & Benefits'],
  [61000, 'Provision for Credit Losses'],
];
const CCS: [number, string][] = [
  [1100, 'Retail Banking'],
  [1200, 'Commercial Lending'],
  [1300, 'Treasury'],
  [1400, 'Wealth Management'],
  [2100, 'Operations'],
  [2200, 'Finance'],
];
const glLines = (() => {
  const r = rng(91);
  return Array.from({ length: 15 }, (_, i) => {
    const [acct, name] = pick(r, COA);
    const [cc, ccName] = pick(r, CCS);
    return { je: `JE-${24060 + i}`, acct, name, cc, ccName, amount: round2((r() - 0.3) * 250000) };
  });
})();

// ---- Lesson 5: approximate match ----
const TIERS: [number, string][] = [
  [0, 'Standard'],
  [25000, 'Bronze'],
  [100000, 'Silver'],
  [250000, 'Gold'],
  [500000, 'Platinum'],
];
const GRADES_SORTED: [number, string][] = [
  [300, 'E'],
  [580, 'D'],
  [620, 'C'],
  [680, 'B'],
  [740, 'A'],
  [800, 'A+'],
];
const GRADES_UNSORTED: [number, string][] = [
  [680, 'B'],
  [300, 'E'],
  [800, 'A+'],
  [620, 'C'],
  [740, 'A'],
  [580, 'D'],
];
const LOSS: [string, number][] = [
  ['Mortgage', 0.004],
  ['Auto Loan', 0.012],
  ['Credit Card', 0.035],
  ['Personal Loan', 0.028],
  ['HELOC', 0.009],
  ['Business Loan', 0.018],
];
const L5 = (() => {
  const r = rng(55);
  return LOANS.slice(64, 84).map((l) => ({ ...l, score: between(r, 560, 830) }));
})();
const floorLookup = <T,>(x: number, table: [number, T][]) => {
  let best = table[0][1];
  for (const [k, v] of table) if (k <= x) best = v;
  return best;
};

// ---------------------------------------------------------------------------

export const module: Module = {
  id: 'm09',
  title: 'VLOOKUP Mastery',
  level: 'Analyst',
  icon: '🔎',
  blurb: 'Pull customer names, segments and ratings onto a loan tape — and understand every #N/A you will ever meet.',
  lessons: [
    // =====================================================================
    {
      id: 'm09-l1',
      title: 'Anatomy of a VLOOKUP',
      summary: 'The four arguments, counting columns, and why exact match (FALSE) is non-negotiable at a bank.',
      minutes: 9,
      featured: ['VLOOKUP', 'F2', 'Ctrl+`'],
      intro: `A loan tape from the data lake tells you **Customer ID C10162** owes $212,000. Your manager asks: *who is that, and what is their rating?* That information lives in a different table — the **customer master**. VLOOKUP is the bridge between the two.

**Read VLOOKUP as a sentence:**
\`=VLOOKUP(lookup_value, table_array, col_index_num, FALSE)\`
"Take **this key**, find it in the **first column of that table**, walk **N columns** to the right, and give me what's there — but only if the key matches **exactly**."

- **lookup_value** — the key you already have (e.g. \`B2\`, the Customer ID on this row).
- **table_array** — the lookup table. Its **first column must contain the key**. Everything you want back must be to the right.
- **col_index_num** — which column of the *table* to return, counting the key column as **1** (not the sheet's column letter!).
- **range_lookup** — \`FALSE\` (or 0) = exact match. \`TRUE\` (or leaving it out!) = approximate match.

**Why FALSE is the default at a bank:** with TRUE/omitted, Excel assumes the first column is sorted and returns the *closest smaller* key when the exact one is missing. For a customer or account ID that means **someone else's data, silently**. A #N/A is annoying; a wrong customer's rating in a credit report is an audit finding. Always end with \`FALSE\` unless you deliberately want tiers (lesson 5).

**Common mistakes:** counting columns from column A of the sheet instead of from the table's first column; forgetting FALSE; picking a table that doesn't start at the key column.`,
      workbooks: () => [tapeBook(30)],
      start: { cell: 'E2' },
      tasks: [
        {
          id: 't1',
          title: 'Your first VLOOKUP',
          instruction: `The loan tape is in **A:D**; the customer master is in **K1:P61** (key = Customer ID in column K).

In **E2** type \`=VLOOKUP(B2,K2:P61,2,FALSE)\` and press [[Enter]].

Read it back as a sentence: *find B2's customer ID in the first column of K2:P61, return the 2nd column (Name), exact match only.*`,
          why: 'Typing it out loud ("key, table, column, exact") is how you stop mixing up the argument order. Every lookup you will ever write — VLOOKUP, INDEX/MATCH, XLOOKUP — answers the same three questions: what key, where to look, what to bring back.',
          hints: [
            'Start with = then VLOOKUP( — the autocomplete list will show it; Tab accepts.',
            'You can click B2 and drag over K2:P61 instead of typing the addresses.',
            'Name is the 2nd column of the table (K=1, L=2).',
            'Full answer: =VLOOKUP(B2,K2:P61,2,FALSE)',
          ],
          check: (c) => {
            const f = c.f('E2');
            if (!/^=VLOOKUP\(/i.test(f)) return 'E2 should start with =VLOOKUP(';
            if (!/^=VLOOKUP\(\s*B2\s*,/i.test(f)) return 'The first argument (lookup_value) should be B2 — the Customer ID on this row.';
            if (!/,\s*(FALSE|0)\s*\)$/i.test(f)) return 'End with ,FALSE) so Excel only accepts an exact match.';
            return colEquals(c, 'E2', [fieldOf(tape30[0], 'name')], 'Customer name');
          },
          solution: [{ set: { E2: '=VLOOKUP(B2,K2:P61,2,FALSE)' } }],
          explain: 'B2 is the key, K2:P61 is the master (key in its first column), 2 = the Name column, FALSE = exact match.',
        },
        {
          id: 't2',
          title: 'See the danger of leaving out FALSE',
          instruction: `Customer **C10002** does not exist in the master. In **E33** type \`=VLOOKUP("C10002",K2:P61,2)\` — note: **no fourth argument** — and press [[Enter]].

Look at the result. Excel confidently returns a name. Whose?`,
          why: 'Omitting the 4th argument means TRUE = approximate match. Excel looks for the largest key that is less than or equal to "C10002" and returns that row — here C10001. No error, no warning: the classic silent VLOOKUP bug that ends up in a regulator pack.',
          hints: ['Type the key in double quotes: "C10002".', 'Stop after the 2: =VLOOKUP("C10002",K2:P61,2)'],
          check: (c) => {
            const f = c.f('E33');
            if (!/^=VLOOKUP\(\s*"C10002"\s*,/i.test(f)) return 'E33 should be =VLOOKUP("C10002",K2:P61,2)';
            if (/,\s*(FALSE|0)\s*\)$/i.test(f)) return 'For this experiment leave out the 4th argument (no FALSE).';
            return c.v('E33') === CUST[0].name ? true : `E33 should show ${CUST[0].name} (the closest smaller ID). Check the table range K2:P61 and column 2.`;
          },
          solution: [{ set: { E33: '=VLOOKUP("C10002",K2:P61,2)' } }],
          explain: `Approximate match returned ${CUST[0].name} — the customer C10001 — for an ID that doesn't exist.`,
        },
        {
          id: 't3',
          title: 'Fix it with FALSE',
          instruction: 'Press [[F2]] on **E33**, add `,FALSE` before the closing bracket so it reads `=VLOOKUP("C10002",K2:P61,2,FALSE)`, and press [[Enter]].\n\nNow you get **#N/A** — the honest answer: *this customer is not in the master*.',
          why: '#N/A is information. It tells you a key is missing so you can chase it (new customer? typo? stale master?). At a bank you want lookups to fail loudly, never to guess.',
          hints: ['F2 puts you in Edit mode with the cursor at the end.', 'Move left one character (←) past the ) and type ,FALSE'],
          check: (c) => {
            const f = c.f('E33');
            if (!/^=VLOOKUP\(\s*"C10002"/i.test(f)) return 'Keep the lookup for "C10002" in E33.';
            if (!/,\s*(FALSE|0)\s*\)$/i.test(f)) return 'Add ,FALSE as the 4th argument.';
            return isNA(c.v('E33')) ? true : 'E33 should now show #N/A.';
          },
          solution: [{ set: { E33: '=VLOOKUP("C10002",K2:P61,2,FALSE)' } }],
        },
        {
          id: 't4',
          title: 'Count the columns',
          instruction: `Now bring back other fields for the first loan:
- **F2**: the **Segment** → \`=VLOOKUP(B2,K2:P61,3,FALSE)\`
- **G2**: the **Rating** → which column number is Rating in the table? Count from **K = 1**.`,
          why: 'col_index_num counts columns of the *table*, not of the sheet. Rating sits in sheet column O, but it is the 5th column of K:P. Getting this wrong returns a valid-looking but wrong field — e.g. Region instead of Rating.',
          hints: ['K=1 (ID), L=2 (Name), M=3 (Segment), N=4 (Region), O=5 (Rating), P=6 (Branch).', 'G2: =VLOOKUP(B2,K2:P61,5,FALSE)'],
          check: (c) =>
            all(
              formulasMatch(c, 'F2:G2', /VLOOKUP\(.*,\s*(FALSE|0)\s*\)/i, 'VLOOKUP …,FALSE'),
              colEquals(c, 'F2', [fieldOf(tape30[0], 'segment')], 'Segment'),
              colEquals(c, 'G2', [fieldOf(tape30[0], 'rating')], 'Rating (is your column number 5?)'),
            ),
          solution: [{ set: { F2: '=VLOOKUP(B2,K2:P61,3,FALSE)', G2: '=VLOOKUP(B2,K2:P61,5,FALSE)' } }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm09-l2',
      title: 'Lock the table with $ and F4',
      summary: 'Fill a VLOOKUP down 40 loans, watch it break, and fix it with absolute references.',
      minutes: 8,
      featured: ['F4', 'Ctrl+D', '$K$2:$P$61'],
      intro: `One VLOOKUP is a curiosity; the job is **one formula filled down the whole tape**. That's where most VLOOKUP disasters happen.

**What fill-down does:** Excel copies the formula and shifts every *relative* reference by the number of rows moved. That's exactly what you want for the key (\`B2\` → \`B3\` → \`B4\`…), and exactly what you **don't** want for the table: \`K2:P61\` becomes \`K3:P62\`, then \`K4:P63\`… The table slides down the page and the top customers fall out of it → **#N/A** for any loan whose customer is "above" the window.

**The fix: anchor the table with $.** \`$K$2:$P$61\` means "always these cells, no matter where the formula is copied". The fastest way: while editing, put the cursor on the reference and press [[F4]]. It cycles:
- \`K2\` → \`$K$2\` (lock column and row) → \`K$2\` (lock row only) → \`$K2\` (lock column only) → back to \`K2\`.

**Rule of thumb:** key relative (\`B2\`), table absolute (\`$K$2:$P$61\`), column number a constant. Lock the table *before* you fill down — every time, even when the table is on the same row today.

**Common mistake:** locking only one end (\`$K$2:P61\`) — the bottom still slides. Press F4 with the cursor on the whole range, or check both halves have $.`,
      workbooks: () => [tapeBook(40, '=VLOOKUP(B2,K2:P61,2,FALSE)')],
      start: { cell: 'E2' },
      tasks: [
        {
          id: 't1',
          title: 'Fill down — and watch it break',
          instruction: `**E2** already holds a colleague's formula: \`=VLOOKUP(B2,K2:P61,2,FALSE)\`. Select **E2:E41** (click E2 then [[Shift]]+click E41, or type \`E2:E41\` in the Name Box and press [[Enter]]) and press [[Ctrl+D]] to fill it down.

You should see **${brokenCount} rows of #N/A**. Press [[F2]] on **E41** and read the table reference. Where did K2:P61 go?`,
          why: 'Seeing the table reference drift to K41:P100 is the "aha" moment. Every analyst has sent a report with this bug once; the goal is that you only do it in this trainer.',
          hints: ['Click E2, hold Shift and click E41 (or type E2:E41 in the Name Box and press Enter).', 'Ctrl+D copies the top cell of the selection down.'],
          check: (c) => formulasMatch(c, 'E2:E41', /VLOOKUP\(/i, 'VLOOKUP'),
          solution: [{ select: 'E2:E41' }, { cmd: 'fill.down' }],
          explain: 'E41 now reads =VLOOKUP(B41,K41:P100,2,FALSE) — the table slid 39 rows down, so customers near the top of the master are no longer inside it.',
        },
        {
          id: 't2',
          title: 'Lock the table with F4',
          instruction: `Fix it at the source: select **E2**, press [[F2]], click/arrow into \`K2:P61\` and press [[F4]] once so it becomes \`$K$2:$P$61\`. Press [[Enter]].

Then refill: select **E2:E41** and [[Ctrl+D]]. Every #N/A should disappear.`,
          why: 'Fixing the first cell and refilling (rather than patching rows one by one) guarantees every row runs the *same* logic — which is what an auditor checks: consistent formulas down a column.',
          hints: ['In Edit mode, put the cursor anywhere inside K2:P61 before pressing F4.', 'If only part of the range got $, press F4 again until you see $K$2:$P$61.', 'Formula: =VLOOKUP(B2,$K$2:$P$61,2,FALSE) filled to E41.'],
          check: (c) =>
            all(
              formulasMatch(c, 'E2:E41', lockedKP, 'VLOOKUP with the table locked as $K$2:$P$61'),
              colEquals(c, 'E2:E41', tape40.map((l) => fieldOf(l, 'name')), 'Customer name'),
            ),
          solution: [{ set: { E2: '=VLOOKUP(B2,$K$2:$P$61,2,FALSE)' } }, { select: 'E2:E41' }, { cmd: 'fill.down' }],
        },
        {
          id: 't3',
          title: 'Segment for every loan',
          instruction: 'In **F2:F41** return each customer\'s **Segment** (3rd column of the table). Write it once in F2 with the table locked, then fill down.',
          why: 'Segment drives most bank reporting cuts (Retail vs Commercial). Notice you only changed the column number — the key and the locked table are identical. That pattern is why locking matters.',
          hints: ['=VLOOKUP(B2,$K$2:$P$61,3,FALSE)', 'Select F2:F41 then Ctrl+D (or double-click the fill handle).'],
          check: (c) =>
            all(
              formulasMatch(c, 'F2:F41', lockedKP, 'VLOOKUP with a locked table'),
              colEquals(c, 'F2:F41', tape40.map((l) => fieldOf(l, 'segment')), 'Segment'),
            ),
          solution: [{ set: { 'F2:F41': '=VLOOKUP(B2,$K$2:$P$61,3,FALSE)' } }],
        },
        {
          id: 't4',
          title: 'Rating and Branch',
          instruction: 'Finish the tape: **G2:G41** = Rating, **H2:H41** = Branch. Work out the column numbers yourself by counting from K.',
          why: 'Counting columns is the weak spot of VLOOKUP — it is a hard-coded number that knows nothing about headers. Say the count out loud (K1, L2, M3, N4, O5, P6). In the next module you will meet INDEX/MATCH and XLOOKUP, which remove this fragility.',
          hints: ['Rating is column O → 5th column of K:P.', 'Branch is column P → 6th.', 'G2: =VLOOKUP(B2,$K$2:$P$61,5,FALSE) · H2: =VLOOKUP(B2,$K$2:$P$61,6,FALSE)'],
          check: (c) =>
            all(
              formulasMatch(c, 'G2:H41', lockedKP, 'VLOOKUP with a locked table'),
              colEquals(c, 'G2:G41', tape40.map((l) => fieldOf(l, 'rating')), 'Rating'),
              colEquals(c, 'H2:H41', tape40.map((l) => fieldOf(l, 'branch')), 'Branch'),
            ),
          solution: [{ set: { 'G2:G41': '=VLOOKUP(B2,$K$2:$P$61,5,FALSE)', 'H2:H41': '=VLOOKUP(B2,$K$2:$P$61,6,FALSE)' } }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm09-l3',
      title: '#N/A detective: spaces & missing keys',
      summary: 'Diagnose why a lookup fails, clean keys with TRIM, label true gaps with IFNA and count the exceptions.',
      minutes: 10,
      featured: ['LEN', 'TRIM', 'IFNA', 'IFERROR', 'COUNTIF'],
      intro: `Data-lake extracts are messy. When a VLOOKUP returns **#N/A** there are only a few possible causes — work through them like a checklist instead of guessing:

1. **The key really isn't there.** (A customer onboarded after the master was extracted, a closed account, a typo upstream.) → Legit exception: label it and report it.
2. **Invisible characters.** \`"C10162 "\` (trailing space) is *not* \`"C10162"\`. Systems that pad fixed-width fields love this. → Diagnose with \`LEN()\`, fix with \`TRIM()\`.
3. **Number vs text.** \`40100\` (number) is *not* \`"40100"\` (text). → Next lesson.
4. **The table moved** (unlocked range) or the key isn't in the table's first column.

**Diagnose before you fix.** \`=LEN(B2)\` shows the true length: an ID that should be 6 characters but shows 7 has a hidden space.

**Clean inside the formula:** \`=VLOOKUP(TRIM(B2),${l3Rng},2,FALSE)\` — TRIM strips leading/trailing spaces (and doubles inside) from the key before looking it up. You don't modify the source extract, which keeps your work reproducible.

**Then handle the real gaps:** \`=IFNA(VLOOKUP(…),"Not found")\` replaces only #N/A with a label. Prefer **IFNA** over **IFERROR**: IFERROR also hides #REF!, #VALUE! and #NAME? — i.e. *your own* mistakes — which you definitely want to see.

**Never just hide exceptions.** Count them (\`COUNTIF(range,"Not found")\`) and put the number at the top of the report. "3 loans have no customer in the master" is a finding someone needs to act on.`,
      workbooks: () => [
        makeBook('Recon_Extract.xlsx', [
          {
            name: 'Tape',
            rows: layout([
              {
                at: 'A1',
                rows: [
                  ['Loan ID', 'Customer ID', 'Balance', 'Customer Name', 'Key Length', null, 'Exceptions', null],
                  ...L3.map((l, i) => [l.id, l3Keys[i], l.balance, null, null]),
                ],
              },
              { at: 'K1', rows: [['Customer ID', 'Name', 'Segment'], ...l3Master.map((c) => [c.id, c.name, c.segment])] },
            ]),
            widths: [90, 100, 100, 150, 85, 30, 85, 60, 30, 30, 95, 140, 110],
            formats: { 2: '#,##0.00' },
            freeze: true,
          },
        ]),
      ],
      start: { cell: 'D2' },
      tasks: [
        {
          id: 't1',
          title: 'Run the lookup and count the damage',
          instruction: `In **D2:D25** look up each customer's **Name** from the master in **K:M** (it ends on row ${L3_END}):
\`=VLOOKUP(B2,${l3Rng},2,FALSE)\`

You should get **${l3RawNA} × #N/A**. Don't fix anything yet — first we find out *why*.`,
          why: 'Resist the urge to wrap everything in IFERROR immediately. Each #N/A is a clue; covering them up before you understand them is how real data problems end up "reconciled" in a report.',
          hints: ['Lock the table with F4 before filling down.', `=VLOOKUP(B2,${l3Rng},2,FALSE) in D2, then fill to D25.`],
          check: (c) => {
            const fm = formulasMatch(c, 'D2:D25', /VLOOKUP\(.*,\s*(FALSE|0)\s*\)/i, 'VLOOKUP(B2,…,2,FALSE)');
            if (fm !== true) return fm;
            // Already cleaning the key? Fine — you're ahead of the lesson.
            if (/TRIM\(/i.test(c.f('D2'))) return colEquals(c, 'D2:D25', l3Trim, 'Customer name');
            return colEquals(c, 'D2:D25', l3Raw, 'Customer name');
          },
          solution: [{ set: { 'D2:D25': `=VLOOKUP(B2,${l3Rng},2,FALSE)` } }],
        },
        {
          id: 't2',
          title: 'Diagnose with LEN',
          instruction: 'Every Customer ID should be **6** characters (C + 5 digits). In **E2:E25** enter `=LEN(B2)` and fill down.\n\nWhich rows show 7 or 8? Compare them with the #N/A rows in column D.',
          why: 'LEN makes the invisible visible. Some #N/A rows have the wrong length (hidden spaces → fixable); others are exactly 6 and still fail (the customer genuinely is not in the master → a real exception). Two different problems, two different fixes.',
          hints: ['=LEN(B2) then fill down to E25.'],
          check: (c) =>
            all(formulasMatch(c, 'E2:E25', /LEN\(/i, 'LEN'), colEquals(c, 'E2:E25', l3Keys.map((k) => k.length), 'Key length')),
          solution: [{ set: { 'E2:E25': '=LEN(B2)' } }],
          explain: `Rows with length 7–8 carry spaces; the ${l3NotFound} rows with length 6 that still fail are true missing customers.`,
        },
        {
          id: 't3',
          title: 'Clean the key with TRIM',
          instruction: `Change **D2** to \`=VLOOKUP(TRIM(B2),${l3Rng},2,FALSE)\` and fill down to **D25**.

The space-padded IDs now resolve. Only **${l3NotFound}** #N/A should remain — the genuinely missing customers.`,
          why: 'Cleaning the key inside the formula leaves the source extract untouched (you can re-pull it tomorrow and the formula still works). TRIM is cheap insurance on any key that came from a text file or another system.',
          hints: ['Wrap only the lookup_value: TRIM(B2).', `=VLOOKUP(TRIM(B2),${l3Rng},2,FALSE)`],
          check: (c) =>
            all(
              formulasMatch(c, 'D2:D25', /VLOOKUP\(\s*TRIM\(/i, 'VLOOKUP(TRIM(B2),…)'),
              colEquals(c, 'D2:D25', l3Trim, 'Customer name'),
            ),
          solution: [{ set: { 'D2:D25': `=VLOOKUP(TRIM(B2),${l3Rng},2,FALSE)` } }],
        },
        {
          id: 't4',
          title: 'Label true gaps with IFNA',
          instruction: `Wrap the lookup so the remaining #N/A become the text \`Not found\`:
\`=IFNA(VLOOKUP(TRIM(B2),${l3Rng},2,FALSE),"Not found")\` in **D2:D25**.`,
          why: 'A labelled exception reads better in a report and lets totals/filters work (errors break SUM and pivots). IFNA only catches #N/A, so if you later fat-finger the range and get #REF!, you still see it. IFERROR would silently hide that too.',
          hints: ['IFNA(value, value_if_na)', `=IFNA(VLOOKUP(TRIM(B2),${l3Rng},2,FALSE),"Not found")`],
          check: (c) =>
            all(
              formulasMatch(c, 'D2:D25', /(IFNA|IFERROR)\(\s*VLOOKUP\(/i, 'IFNA(VLOOKUP(…),"Not found")'),
              colEquals(c, 'D2:D25', l3Label, 'Customer name'),
            ),
          solution: [{ set: { 'D2:D25': `=IFNA(VLOOKUP(TRIM(B2),${l3Rng},2,FALSE),"Not found")` } }],
        },
        {
          id: 't5',
          title: 'Count the exceptions',
          instruction: 'In **H1** (next to the "Exceptions" label) count how many loans have no customer: `=COUNTIF(D2:D25,"Not found")`.',
          why: `This number goes in the cover email: "${l3NotFound} loans reference customers missing from the master — raised with Data Ops." Exceptions you count get fixed; exceptions you hide become restatements.`,
          hints: ['COUNTIF(range, criteria) — the criteria is the text "Not found".'],
          check: (c) =>
            all(
              /^=COUNTIF\(/i.test(c.f('H1')) ? true : 'H1 should use =COUNTIF(D2:D25,"Not found").',
              c.v('H1') === l3NotFound ? true : `H1 should count ${l3NotFound} exceptions.`,
            ),
          solution: [{ set: { H1: '=COUNTIF(D2:D25,"Not found")' } }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm09-l4',
      title: 'Numbers stored as text',
      summary: 'GL account numbers from a CSV look identical but won\'t match. Fix the type with VALUE or &"".',
      minutes: 8,
      featured: ['ISTEXT', 'ISNUMBER', 'VALUE', 'TEXT', '&""'],
      intro: `The sneakiest #N/A of all: the key *looks* identical on both sides but one is a **number** and the other is **text**. To Excel, \`40100\` and \`"40100"\` are different values, so an exact-match lookup fails.

**Why it happens:** CSV exports, data-lake queries that cast IDs to strings, systems that keep leading zeros ("00412"), or someone typing an apostrophe. Account numbers, cost centers, branch codes and sort codes are the usual suspects.

**How to spot it:**
- Text sits **left-aligned**, numbers **right-aligned** (unless someone formatted them).
- \`=ISTEXT(A2)\` / \`=ISNUMBER(A2)\` tell you for sure.

**How to fix it — convert the key, not the table:**
- Key is text, table is numbers → \`VALUE(A2)\` turns "40100" into 40100.
- Key is a number, table is text → \`A2&""\` (glue on an empty string) or \`TEXT(A2,"0")\` turns 1100 into "1100".

Decide the direction by asking: *what type is the table's first column?* Then make the key match it.

**Common mistake:** changing the cell format to "Number". Formatting changes how a value *looks*, not what it *is* — a text "40100" stays text.`,
      workbooks: () => [
        makeBook('GL_Extract.xlsx', [
          {
            name: 'GL',
            header: true,
            rows: layout([
              {
                at: 'A1',
                rows: [
                  ['GL Account', 'Cost Center', 'Amount', 'Account Name', 'Cost Center Name'],
                  ...glLines.map((g) => ["'" + g.acct, g.cc, g.amount, null, null]),
                ],
              },
              { at: 'H1', rows: [['Account', 'Account Name'], ...COA.map(([a, n]) => [a, n])] },
              { at: 'K1', rows: [['Cost Center', 'Name'], ...CCS.map(([a, n]) => ["'" + a, n])] },
              { at: 'A19', rows: [['Is A2 text?'], ['Is H2 a number?']] },
            ]),
            widths: [90, 90, 110, 200, 150, 30, 30, 70, 200, 30, 90, 150],
            formats: { 2: '#,##0.00' },
            styles: { A19: { b: true }, A20: { b: true } },
          },
        ]),
      ],
      start: { cell: 'D2' },
      tasks: [
        {
          id: 't1',
          title: 'Try the obvious lookup',
          instruction: 'In **D2:D16** look up the account name from the chart of accounts in **H2:I13**:\n`=VLOOKUP(A2,$H$2:$I$13,2,FALSE)`\n\nEvery row returns **#N/A** — even though 40100 is clearly in the table. Notice the account numbers in column A hug the **left** edge of their cells.',
          why: 'Seeing a 100% failure rate is itself a clue: when *every* row fails, it\'s almost never missing data — it is a systematic mismatch (type, spaces, wrong column).',
          hints: ['Write the plain version first — we want to see it fail.', '=VLOOKUP(A2,$H$2:$I$13,2,FALSE) filled to D16.'],
          check: (c) => {
            const fm = formulasMatch(c, 'D2:D16', /VLOOKUP\(/i, 'VLOOKUP(A2,…)');
            if (fm !== true) return fm;
            // Converted the key already? You're ahead — accept correct names.
            if (/VALUE\(|--/i.test(c.f('D2'))) return colEquals(c, 'D2:D16', glLines.map((g) => g.name), 'Account name');
            if (!c.list('D2:D16').every(isNA)) return 'Use the plain key A2 for this step so you can see every row fail with #N/A.';
            return true;
          },
          solution: [{ set: { 'D2:D16': '=VLOOKUP(A2,$H$2:$I$13,2,FALSE)' } }],
        },
        {
          id: 't2',
          title: 'Prove it with ISTEXT / ISNUMBER',
          instruction: 'In **B19** enter `=ISTEXT(A2)` and in **B20** enter `=ISNUMBER(H2)`. Both say **TRUE**: the key is text, the table is numbers.',
          why: 'Never guess the data type from how a cell looks — formats can lie. ISTEXT/ISNUMBER are the lie detector. Thirty seconds of diagnosis saves an hour of re-typing.',
          hints: ['B19: =ISTEXT(A2)', 'B20: =ISNUMBER(H2)'],
          check: (c) =>
            all(
              /ISTEXT\(\s*A2\s*\)/i.test(c.f('B19')) && c.v('B19') === true ? true : 'B19 should be =ISTEXT(A2) showing TRUE.',
              /ISNUMBER\(\s*H2\s*\)/i.test(c.f('B20')) && c.v('B20') === true ? true : 'B20 should be =ISNUMBER(H2) showing TRUE.',
            ),
          solution: [{ set: { B19: '=ISTEXT(A2)', B20: '=ISNUMBER(H2)' } }],
        },
        {
          id: 't3',
          title: 'Convert the key with VALUE',
          instruction: 'The table holds numbers, so convert the key to a number. Change **D2:D16** to:\n`=VLOOKUP(VALUE(A2),$H$2:$I$13,2,FALSE)`',
          why: 'You convert the key (one value per row) instead of re-typing the chart of accounts, and the original extract stays untouched — tomorrow\'s refresh will work with no manual steps.',
          hints: ['Wrap A2 in VALUE( ).', '=VLOOKUP(VALUE(A2),$H$2:$I$13,2,FALSE)'],
          check: (c) =>
            all(
              formulasMatch(c, 'D2:D16', /VLOOKUP\(\s*(VALUE\(|--|NUMBERVALUE\()/i, 'VLOOKUP(VALUE(A2),…)'),
              colEquals(c, 'D2:D16', glLines.map((g) => g.name), 'Account name'),
            ),
          solution: [{ set: { 'D2:D16': '=VLOOKUP(VALUE(A2),$H$2:$I$13,2,FALSE)' } }],
        },
        {
          id: 't4',
          title: 'The reverse: number key, text table',
          instruction: 'Cost centers are the opposite: column **B** holds numbers, but the cost-center table in **K2:L7** stores them as **text**. In **E2:E16** return the cost center name with\n`=VLOOKUP(B2&"",$K$2:$L$7,2,FALSE)`',
          why: 'B2&"" glues an empty string onto the number, turning 1100 into "1100" — the type the table uses. TEXT(B2,"0") does the same and also lets you add leading zeros (TEXT(B2,"00000")) for codes like "00412".',
          hints: ['Try it without &"" first and you will see #N/A again.', '=VLOOKUP(B2&"",$K$2:$L$7,2,FALSE)'],
          check: (c) =>
            all(
              formulasMatch(c, 'E2:E16', /VLOOKUP\(\s*(B\d+\s*&\s*""|TEXT\()/i, 'VLOOKUP(B2&"",…)'),
              colEquals(c, 'E2:E16', glLines.map((g) => g.ccName), 'Cost center name'),
            ),
          solution: [{ set: { 'E2:E16': '=VLOOKUP(B2&"",$K$2:$L$7,2,FALSE)' } }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm09-l5',
      title: 'Approximate match: tiers, grades & HLOOKUP',
      summary: 'When TRUE is right: pricing tiers and score-to-grade bands on a sorted table. Plus HLOOKUP for sideways tables.',
      minutes: 10,
      featured: ['VLOOKUP …,TRUE', 'HLOOKUP', 'Alt A S A'],
      intro: `Exact match is for **IDs**. Approximate match (\`TRUE\`) is for **bands**: "balances from 100,000 up to 249,999.99 are Silver", "credit scores 680–739 are grade B".

**How TRUE works:** the first column holds the *lower bound* of each band, **sorted ascending**. Excel finds the **largest bound that is ≤ your value** and returns that row. A balance of 180,000 → biggest bound ≤ 180,000 is 100,000 → Silver. You never have to list every possible value.

**Why it MUST be sorted:** Excel doesn't scan every row — it does a fast *binary search* (jump to the middle, go up or down, repeat). That shortcut only works if the column is in order. On an unsorted table it lands on the wrong band and returns **plausible wrong answers** (and the odd random #N/A). You will see it happen.

**Bank uses:** rate tiers, relationship pricing, score-to-grade mapping, DPD buckets (0, 30, 60, 90+), tax/fee brackets.

**HLOOKUP** is the same idea for tables laid out **sideways** — keys across the top row, return the Nth *row*: \`=HLOOKUP(key, table, row_index, FALSE)\`. You'll meet it in older templates; XLOOKUP (next module) handles both directions.

**Common mistakes:** using TRUE for IDs (silent wrong matches); band tables sorted descending; a band table that doesn't start at the smallest possible value (values below the first bound → #N/A).`,
      workbooks: () => [
        makeBook('Pricing.xlsx', [
          {
            name: 'Loans',
            rows: layout([
              {
                at: 'A1',
                rows: [
                  ['Loan ID', 'Product', 'Balance', 'Credit Score', 'Relationship Tier', 'Grade', 'Loss Rate'],
                  ...L5.map((l) => [l.id, l.product, l.balance, l.score, null, null, null]),
                ],
              },
              { at: 'I1', rows: [['Balance From', 'Tier'], ...TIERS.map(([a, b]) => [a, b])] },
              { at: 'L1', rows: [['Score From', 'Grade'], ...GRADES_UNSORTED.map(([a, b]) => [a, b])] },
              { at: 'I10', rows: [['Product', ...LOSS.map((x) => x[0])], ['Loss Rate', ...LOSS.map((x) => x[1])]] },
            ]),
            widths: [90, 110, 100, 90, 120, 60, 80, 30, 95, 80, 30, 85, 60, 100, 100],
            formats: { 2: '#,##0.00', 6: '0.0%', 8: '#,##0' },
            styles: {
              ...hdrStyles(['I10', 'J10', 'K10', 'L10', 'M10', 'N10', 'O10']),
              I11: { b: true },
              J11: { fmt: '0.0%' }, K11: { fmt: '0.0%' }, L11: { fmt: '0.0%' }, M11: { fmt: '0.0%' }, N11: { fmt: '0.0%' }, O11: { fmt: '0.0%' },
            },
          },
        ]),
      ],
      start: { cell: 'E2' },
      tasks: [
        {
          id: 't1',
          title: 'Relationship tier by balance',
          instruction: 'The tier table in **I2:J6** lists the lower bound of each band, sorted ascending. In **E2:E21** return the tier for each balance:\n`=VLOOKUP(C2,$I$2:$J$6,2,TRUE)`',
          why: 'No balance is exactly 25,000 or 100,000 — they fall *between* bounds. TRUE says "find the band this value falls into", which is exactly what a pricing grid means. Writing TRUE explicitly (rather than leaving it out) tells the next reader you meant it.',
          hints: ['C2 is the balance; the table has 2 columns; you want the 2nd.', '=VLOOKUP(C2,$I$2:$J$6,2,TRUE) filled to E21.'],
          check: (c) =>
            all(
              formulasMatch(c, 'E2:E21', /VLOOKUP\(.*,\s*(TRUE|1)\s*\)/i, 'VLOOKUP(…,TRUE)'),
              colEquals(c, 'E2:E21', L5.map((l) => floorLookup(l.balance, TIERS)), 'Tier'),
            ),
          solution: [{ set: { 'E2:E21': '=VLOOKUP(C2,$I$2:$J$6,2,TRUE)' } }],
        },
        {
          id: 't2',
          title: 'Grades from an UNSORTED table',
          instruction: `Now map credit score → grade using the table in **L2:M7**. In **F2:F21** enter \`=VLOOKUP(D2,$L$2:$M$7,2,TRUE)\` and fill down.

Check a few rows by eye against the table: **F3** has a score of ${L5[1].score}, which should be grade **${floorLookup(L5[1].score, GRADES_SORTED)}** — what does it show? And why are some rows #N/A? Look at the order of the Score From column.`,
          why: 'This is the failure mode you must be able to recognise: plausible-looking wrong grades and random #N/A — because the band table is not sorted and the binary search jumps to the wrong place.',
          hints: ['=VLOOKUP(D2,$L$2:$M$7,2,TRUE)', 'Some grades will be wrong — that is the point of this step.'],
          check: (c) => formulasMatch(c, 'F2:F21', /VLOOKUP\(\s*D\d+\s*,\s*\$L\$2:\$M\$7\s*,\s*2\s*,\s*(TRUE|1)\s*\)/i, 'VLOOKUP(D2,$L$2:$M$7,2,TRUE)'),
          solution: [{ set: { 'F2:F21': '=VLOOKUP(D2,$L$2:$M$7,2,TRUE)' } }],
        },
        {
          id: 't3',
          title: 'Sort the band table — watch the grades fix themselves',
          instruction: 'Click **L1** (the Score From header) and sort ascending with [[Alt]] [[A]] [[S]] [[A]] (Data → Sort A to Z). The grades in column F recalculate — now they\'re all correct.',
          why: 'Approximate match needs the first column ascending. Make "is the band table sorted?" part of your checklist whenever you inherit a pricing model. Better still, keep band tables on a locked, documented sheet.',
          hints: ['The sort uses the current region around L1, so it sorts L1:M7 together (scores stay with their grades).', 'Alt, A, S, A — or Home → Sort & Filter → Sort A to Z.'],
          check: (c) => {
            const ks = c.list('L2:L7').map(Number);
            if (!ks.every((k, i) => i === 0 || ks[i - 1] <= k)) return 'Sort L1:M7 so Score From runs smallest to largest.';
            return colEquals(c, 'F2:F21', L5.map((l) => floorLookup(l.score, GRADES_SORTED)), 'Grade');
          },
          solution: [{ sort: [{ col: 11 }], range: 'L1:M7', header: true }],
        },
        {
          id: 't4',
          title: 'HLOOKUP a sideways table',
          instruction: 'The loss-rate table in **I10:O11** runs **across**: products on row 10, rates on row 11. In **G2:G21** return each loan\'s loss rate:\n`=HLOOKUP(B2,$I$10:$O$11,2,FALSE)`',
          why: 'HLOOKUP searches the top row and returns from the Nth row down. Product names are IDs (not bands), so this is an exact match — FALSE again. You will see HLOOKUP in legacy templates; knowing it lets you audit them.',
          hints: ['Key = product name in B2. Row 2 of the table holds the rate.', '=HLOOKUP(B2,$I$10:$O$11,2,FALSE)'],
          check: (c) =>
            all(
              formulasMatch(c, 'G2:G21', /HLOOKUP\(.*,\s*(FALSE|0)\s*\)/i, 'HLOOKUP(…,FALSE)'),
              colEquals(c, 'G2:G21', L5.map((l) => LOSS.find((x) => x[0] === l.product)![1]), 'Loss rate'),
            ),
          solution: [{ set: { 'G2:G21': '=HLOOKUP(B2,$I$10:$O$11,2,FALSE)' } }],
        },
      ],
    },
  ],
  quiz: [
    {
      kind: 'mc',
      q: 'In =VLOOKUP(B2,$K$2:$P$61,5,FALSE), what does the 5 mean?',
      options: ['Return sheet column E', 'Return the 5th column of the table K:P (column O)', 'Look in the 5th row', 'Return the 5th match'],
      answer: 1,
      explain: 'col_index_num counts columns of the table_array, starting at 1 for the key column. K=1 … O=5.',
    },
    {
      kind: 'mc',
      q: 'Why do bank analysts end almost every VLOOKUP with FALSE?',
      options: [
        'It makes the formula calculate faster',
        'Without it, a missing ID silently returns a neighbouring record instead of #N/A',
        'FALSE is required when the table is on another sheet',
        'It ignores trailing spaces',
      ],
      answer: 1,
      explain: 'TRUE/omitted = approximate match: a missing key returns the closest smaller key\'s data with no error. Wrong customer data is far worse than a visible #N/A.',
    },
    {
      kind: 'formula',
      q: 'Return the Rating of customer C1003 using VLOOKUP with an exact match.',
      grid: [
        ['Customer ID', 'Name', 'Rating'],
        ['C1001', 'Acme Holdings', 'BBB'],
        ['C1002', 'Maria Garcia', 'A'],
        ['C1003', 'Delta Foods', 'BB'],
        ['C1004', 'Wei Chen', 'AA'],
      ],
      at: 'E2',
      expect: 'BB',
      model: '=VLOOKUP("C1003",A2:C5,3,FALSE)',
      explain: 'Key "C1003", table A2:C5, Rating is the 3rd column, FALSE for exact match.',
      mustUse: ['VLOOKUP'],
    },
    {
      kind: 'mc',
      q: 'You fill =VLOOKUP(B2,K2:P61,2,FALSE) down 40 rows and the lower rows start showing #N/A. Most likely cause?',
      options: ['The customers are missing', 'The table range was not locked, so it slid down (K41:P100)', 'FALSE should be TRUE', 'Column B is formatted as text'],
      answer: 1,
      explain: 'Relative table references shift when filled. Lock it: $K$2:$P$61 (F4).',
    },
    {
      kind: 'keys',
      q: 'You have the formula in the top cell and the range below selected. Copy it down.',
      cmd: 'fill.down',
      keys: 'Ctrl+D',
      explain: 'Ctrl+D fills the top cell of the selection down, shifting relative references.',
    },
    {
      kind: 'formula',
      q: 'The key in A2 has a trailing space ("C7 "). Return the name from D2:E4 anyway.',
      grid: [
        ['Key', '', '', 'ID', 'Name'],
        ['C7 ', '', '', 'C5', 'Blue Harbor LLC'],
        ['', '', '', 'C7', 'Cedar Logistics'],
        ['', '', '', 'C9', 'Harbor Health'],
      ],
      at: 'B2',
      expect: 'Cedar Logistics',
      model: '=VLOOKUP(TRIM(A2),D2:E4,2,FALSE)',
      explain: 'TRIM strips the hidden space from the key before the lookup.',
      mustUse: ['VLOOKUP'],
    },
    {
      kind: 'mc',
      q: 'A GL extract has account "40100" stored as text; the chart of accounts has 40100 as a number. Best fix?',
      options: [
        'Format column A as Number',
        'Use VALUE(A2) as the lookup_value',
        'Use TRUE as the 4th argument',
        'Wrap the formula in IFERROR',
      ],
      answer: 1,
      explain: 'Formatting does not change the underlying type. VALUE converts the text key to a number so it matches the table. (If the table were text, use A2&"".)',
    },
    {
      kind: 'mc',
      q: 'Why prefer IFNA(…,"Not found") over IFERROR(…,"Not found")?',
      options: [
        'IFNA is faster',
        'IFERROR does not work with VLOOKUP',
        'IFNA only hides #N/A, so your own mistakes (#REF!, #VALUE!, #NAME?) stay visible',
        'IFNA also trims spaces',
      ],
      answer: 2,
      explain: 'You want "key missing" labelled but genuine formula errors to stay loud.',
    },
    {
      kind: 'formula',
      q: 'Rate tiers: balances from the bound in column A upward get the rate in column B. Return the rate for a 72,000 balance.',
      grid: [
        ['Balance From', 'Rate'],
        [0, 0.001],
        [10000, 0.0025],
        [50000, 0.005],
        [100000, 0.0075],
      ],
      at: 'D2',
      expect: 0.005,
      model: '=VLOOKUP(72000,A2:B5,2,TRUE)',
      explain: 'Approximate match finds the largest bound ≤ 72,000 → 50,000 → 0.5%. The bounds must be sorted ascending.',
      mustUse: ['VLOOKUP'],
    },
    {
      kind: 'mc',
      q: 'An approximate-match VLOOKUP returns plausible but wrong grades. What should you check first?',
      options: ['That the band table\'s first column is sorted ascending', 'That the keys have no spaces', 'That IFNA is used', 'That the workbook is saved'],
      answer: 0,
      explain: 'TRUE uses a binary search that assumes ascending order; unsorted bands give wrong answers with no error.',
    },
  ],
};
