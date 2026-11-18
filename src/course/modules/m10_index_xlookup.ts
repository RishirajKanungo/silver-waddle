import type { CheckCtx, Module } from '../types';
import type { Scalar } from '../../engine/types';
import { XLError } from '../../engine/types';
import { addrToA1, parseRange } from '../../engine/refs';
import { makeBook, customers, rng, pick, between, d, RATINGS, type Cellish } from '../data';
import { all, approx, fmtScalar, formulasMatch } from '../runner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compare a single-column range with expected values. Errors compare by code. */
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
    else ok = g === null || g === '' || g === 0;
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
const hasIndexMatch = /INDEX\(.*MATCH\(/i;

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const CUST = customers(60, 7);

// ---- Lesson 1: INDEX/MATCH (master has Name LEFT of the ID) ----
const R1 = Array.from({ length: 20 }, (_, i) => CUST[(i * 7 + 3) % 60]);
const l1Master: Cellish[][] = [
  ['Name', 'Customer ID', 'Segment', 'Region', 'Rating'],
  ...CUST.map((c) => [c.name, c.id, c.segment, c.region, c.rating]),
];
const posOf = (id: string) => CUST.findIndex((c) => c.id === id) + 1;

// ---- Lesson 2: two-way pricing grid ----
const TENORS = [1, 2, 3, 5, 7];
const BASE = [35, 50, 75, 125, 250, 400, 700];
const ADD = [0, 12, 25, 45, 65];
const spread = (rating: string, tenor: number) => {
  const i = RATINGS.indexOf(rating as (typeof RATINGS)[number]);
  const j = TENORS.indexOf(tenor);
  return Math.round(BASE[i] + ADD[j] * (1 + i * 0.35));
};
const DEALS = (() => {
  const r = rng(61);
  return Array.from({ length: 15 }, (_, i) => ({
    id: `DL-${3101 + i}`,
    rating: pick(r, RATINGS),
    tenor: pick(r, TENORS),
    notional: between(r, 4, 120) * 250000,
  }));
})();

// ---- Lesson 3: XLOOKUP ----
const R3: string[] = Array.from({ length: 17 }, (_, i) => CUST[(i * 11 + 5) % 60].id);
R3.splice(4, 0, 'C10999');
R3.splice(11, 0, 'C20001');
R3.splice(17, 0, 'C10003');
const l3Master: Cellish[][] = [
  ['Name', 'Customer ID', 'Segment', 'Region', 'Rating', 'Branch'],
  ...CUST.map((c) => [c.name, c.id, c.segment, c.region, c.rating, c.branch]),
];
const c3 = (id: string) => CUST.find((c) => c.id === id);

// ---- Lesson 4: latest record (rating history) ----
const WATCH = [2, 5, 9, 14, 20, 27, 33, 41, 48, 55].map((i) => CUST[i]);
const NO_HISTORY = CUST[59].id;
const HIST = (() => {
  const r = rng(77);
  const analysts = ['J. Smith', 'P. Patel', 'W. Chen', 'A. Khan'];
  const out: { date: number; id: string; rating: string; analyst: string }[] = [];
  for (const c of WATCH) {
    const n = between(r, 2, 5);
    let ri: number = RATINGS.indexOf(c.rating as (typeof RATINGS)[number]);
    const days = new Set<number>();
    while (days.size < n) days.add(d(between(r, 2022, 2024), between(r, 1, 12), between(r, 1, 28)));
    [...days].sort((a, b) => a - b).forEach((day, k) => {
      if (k > 0) ri = Math.max(0, Math.min(6, ri + pick(r, [-1, 0, 1, 1])));
      out.push({ date: day, id: c.id, rating: RATINGS[ri], analyst: pick(r, analysts) });
    });
  }
  return out.sort((a, b) => a.date - b.date || a.id.localeCompare(b.id));
})();
const H_END = HIST.length + 1;
const W_IDS = [...WATCH.map((c) => c.id).slice(0, 6), NO_HISTORY, ...WATCH.map((c) => c.id).slice(6)];
const firstOf = (id: string) => HIST.find((h) => h.id === id);
const lastOf = (id: string) => [...HIST].reverse().find((h) => h.id === id);
const hRng = (col: string) => `$${col}$2:$${col}$${H_END}`;

// ---------------------------------------------------------------------------

export const module: Module = {
  id: 'm10',
  title: 'INDEX/MATCH & XLOOKUP',
  level: 'Advanced',
  icon: '🎯',
  blurb: 'Look left, survive inserted columns, price off a two-way grid and pull the latest record — the lookups senior analysts actually use.',
  lessons: [
    // =====================================================================
    {
      id: 'm10-l1',
      title: 'INDEX + MATCH: look anywhere',
      summary: 'Split a lookup into "where is it?" (MATCH) and "what\'s there?" (INDEX) — then see why it beats VLOOKUP.',
      minutes: 12,
      featured: ['MATCH', 'INDEX', 'INDEX/MATCH'],
      intro: `VLOOKUP has two structural weaknesses you will hit on real data-lake extracts:

1. **It can't look left.** The key must be the *first* column of the table. If the master is \`Name | Customer ID | …\`, VLOOKUP can't return the Name from an ID.
2. **The column number is hard-coded.** \`…,4,FALSE)\` means "4th column" forever. When someone inserts a column into the table, your 4 now points at the wrong field — and **no error appears**.

**INDEX/MATCH splits the job in two:**
- \`MATCH(key, lookup_column, 0)\` answers **"which row is it on?"** → a position number (e.g. 17). The \`0\` means exact match — the same idea as VLOOKUP's FALSE.
- \`INDEX(return_column, n)\` answers **"what's in row n of this column?"**

Put them together: \`=INDEX(return_column, MATCH(key, lookup_column, 0))\`
Read it as: "From the **Name** column, give me the item at the position where the **ID** column matches my key."

**Why it's robust:** you point at the *actual columns*, not a count. Insert a column and Excel moves both references with the data. The return column can be left, right, or on another sheet (or file — Module 11).

**Common mistakes:** forgetting the \`0\` in MATCH (defaults to approximate); lookup and return ranges of different sizes/start rows (\`$I$2:$I$61\` with \`$H$1:$H$60\` returns the row *above*); not locking with $.`,
      workbooks: () => [
        makeBook('Branch_Report.xlsx', [
          {
            name: 'Report',
            rows: layout([
              {
                at: 'A1',
                rows: [
                  ['Customer ID', 'Name', 'Rating', 'Position'],
                  ...R1.map((c, i) => [c.id, null, `=VLOOKUP(A${i + 2},$I$2:$L$61,4,FALSE)`, null]),
                ],
              },
              { at: 'H1', rows: l1Master },
            ]),
            widths: [95, 150, 70, 70, 30, 30, 30, 150, 95, 110, 90, 60],
            freeze: true,
          },
        ]),
      ],
      start: { cell: 'D2' },
      tasks: [
        {
          id: 't1',
          title: 'MATCH: where is the key?',
          instruction: 'The master in **H:L** has **Name before Customer ID** — VLOOKUP can\'t return the name. First find each customer\'s position: in **D2:D21** enter\n`=MATCH(A2,$I$2:$I$61,0)`\n\nA result of 1 means "first row of the list", not row 1 of the sheet.',
          why: 'MATCH on its own is a superb diagnostic: a number means "found, at this position"; #N/A means "not in the list". Many analysts keep a MATCH column next to a recon just to see which keys exist.',
          hints: ['Lookup_array is the Customer ID column, I2:I61 — lock it with F4.', 'The last argument 0 = exact match.'],
          check: (c) =>
            all(
              formulasMatch(c, 'D2:D21', /MATCH\(.*,\s*0\s*\)/i, 'MATCH(…,0)'),
              colEquals(c, 'D2:D21', R1.map((x) => posOf(x.id)), 'Position'),
            ),
          solution: [{ set: { 'D2:D21': '=MATCH(A2,$I$2:$I$61,0)' } }],
        },
        {
          id: 't2',
          title: 'INDEX: what\'s at that position?',
          instruction: 'Now use the position. In **B2:B21** enter\n`=INDEX($H$2:$H$61,D2)`\n— "from the Name column, give me item number D2".',
          why: 'INDEX + a position is the whole trick. Note both ranges start on row 2: position 1 of I2:I61 lines up with item 1 of H2:H61. Misaligned ranges are the #1 INDEX/MATCH bug.',
          hints: ['Return range = Name column H2:H61 (locked).', '=INDEX($H$2:$H$61,D2)'],
          check: (c) =>
            all(formulasMatch(c, 'B2:B21', /INDEX\(/i, 'INDEX'), colEquals(c, 'B2:B21', R1.map((x) => x.name), 'Name')),
          solution: [{ set: { 'B2:B21': '=INDEX($H$2:$H$61,D2)' } }],
        },
        {
          id: 't3',
          title: 'Combine into one formula',
          instruction: 'Replace the helper: in **B2:B21** put the MATCH *inside* the INDEX:\n`=INDEX($H$2:$H$61,MATCH(A2,$I$2:$I$61,0))`\n\nThen clear the helper column **D2:D21** (select it, [[Delete]]).',
          why: 'Building it in two visible steps, checking each, then nesting is how professionals write complex formulas: prove each piece, then combine. The final formula has no hidden dependency on a helper column someone might delete.',
          hints: ['Swap D2 for the MATCH formula itself.', 'Select D2:D21 and press Delete when B no longer needs it.'],
          check: (c) =>
            all(
              formulasMatch(c, 'B2:B21', hasIndexMatch, 'INDEX(…,MATCH(…,0))'),
              colEquals(c, 'B2:B21', R1.map((x) => x.name), 'Name'),
              c.inputs('D2:D21').every((x) => x === '') ? true : 'Clear the helper column D2:D21.',
            ),
          solution: [{ set: { 'B2:B21': '=INDEX($H$2:$H$61,MATCH(A2,$I$2:$I$61,0))' } }, { select: 'D2:D21' }, { cmd: 'edit.clear' }],
        },
        {
          id: 't4',
          title: 'Insert a column — and break VLOOKUP',
          instruction: 'Column **C** holds a colleague\'s `=VLOOKUP(A2,$I$2:$L$61,4,FALSE)` for Rating. Data Ops adds a new field to the master: click **J1**, press [[Ctrl+Space]] to select the column and [[Ctrl+Shift+=]] to insert a column.\n\nNow look at column C: the "ratings" turned into **regions**. No error. Your INDEX/MATCH names in column B are still right.',
          why: 'VLOOKUP\'s 4 is a frozen count. Excel did grow the table to $I$2:$M$61, but the 4th column is now Region. This is exactly how a quarterly pack silently goes wrong when the upstream extract adds a field.',
          hints: ['Ctrl+Space selects the entire column J; Ctrl+Shift+= inserts a column to its left.'],
          check: (c) => (c.v('K1') === 'Segment' && c.v('I1') === 'Customer ID' ? true : 'Insert one new column at J (so Segment moves to K).'),
          solution: [{ select: 'J1' }, { cmd: 'sel.column' }, { cmd: 'cells.insert' }],
          explain: 'C2 now reads =VLOOKUP(A2,$I$2:$M$61,4,FALSE) and returns the Region column.',
        },
        {
          id: 't5',
          title: 'Fix the rating with INDEX/MATCH',
          instruction: 'Rewrite **C2:C21** with INDEX/MATCH so it can never drift again. Rating is now in column **M**:\n`=INDEX($M$2:$M$61,MATCH(A2,$I$2:$I$61,0))`',
          why: 'Because INDEX points at the Rating column itself, any future inserted or deleted column moves the reference with the data. That robustness is why model reviewers prefer INDEX/MATCH (or XLOOKUP) over VLOOKUP.',
          hints: ['Return column = Rating (now M2:M61). Lookup column = Customer ID (I2:I61).'],
          check: (c) =>
            all(
              formulasMatch(c, 'C2:C21', hasIndexMatch, 'INDEX(…,MATCH(…,0))'),
              colEquals(c, 'C2:C21', R1.map((x) => x.rating), 'Rating'),
            ),
          solution: [{ set: { 'C2:C21': '=INDEX($M$2:$M$61,MATCH(A2,$I$2:$I$61,0))' } }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm10-l2',
      title: 'Two-way lookup: tenor × rating',
      summary: 'INDEX/MATCH/MATCH pulls a credit spread from a pricing matrix — and becomes a one-cell pricer.',
      minutes: 10,
      featured: ['INDEX', 'MATCH', 'INDEX/MATCH/MATCH'],
      intro: `Credit pricing grids are **matrices**: ratings down the side, tenors across the top, a spread in each cell. A deal needs the cell where *its* row meets *its* column. VLOOKUP can only search one direction — you'd need a different column number per tenor.

**INDEX with two positions:** \`INDEX(grid, row_n, col_n)\` returns the cell at row n, column n of the grid. So:

\`=INDEX($K$2:$O$8, MATCH(rating, $J$2:$J$8, 0), MATCH(tenor, $K$1:$O$1, 0))\`

- The first MATCH searches the **rating labels** (down the side) → which row.
- The second MATCH searches the **tenor labels** (across the top) → which column.
- INDEX returns the intersection.

**Alignment is everything:** the row labels (\`J2:J8\`) must cover the same rows as the grid (\`K2:O8\`), and the column labels (\`K1:O1\`) the same columns. Don't include the corner cell in either.

**Bank uses:** spread grids, PD/LGD tables by rating × segment, FTP curves by tenor × currency, fee schedules by product × tier.

**Common mistakes:** including the header row/column in the grid (everything shifts by one); matching a tenor typed as "5Y" text against a header holding the number 5.`,
      workbooks: () => [
        makeBook('Pricing_Grid.xlsx', [
          {
            name: 'Deals',
            rows: layout([
              {
                at: 'A1',
                rows: [
                  ['Deal ID', 'Rating', 'Tenor (yrs)', 'Notional', 'Spread (bps)', 'Row #', 'Col #'],
                  ...DEALS.map((x) => [x.id, x.rating, x.tenor, x.notional, null, null, null]),
                ],
              },
              {
                at: 'J1',
                rows: [['Rating \\ Tenor', ...TENORS], ...RATINGS.map((rt) => [rt, ...TENORS.map((t) => spread(rt, t))])],
              },
              { at: 'J11', rows: [['Rating', 'BB'], ['Tenor (yrs)', 5], ['Spread (bps)', null]] },
            ]),
            widths: [80, 70, 85, 120, 95, 60, 60, 30, 30, 110, 60, 60, 60, 60, 60],
            formats: { 3: '#,##0' },
            styles: {
              J2: { b: true }, J3: { b: true }, J4: { b: true }, J5: { b: true }, J6: { b: true }, J7: { b: true }, J8: { b: true },
              J11: { b: true }, J12: { b: true }, J13: { b: true },
              K11: { fill: '#FFF2CC' }, K12: { fill: '#FFF2CC' }, K13: { b: true, fill: '#E2EFDA', border: { t: true, b: true, l: true, r: true } },
            },
          },
        ]),
      ],
      start: { cell: 'F2' },
      tasks: [
        {
          id: 't1',
          title: 'Find the row and the column',
          instruction: 'Use two helper columns:\n- **F2:F16** — which row of the grid? `=MATCH(B2,$J$2:$J$8,0)`\n- **G2:G16** — which column? `=MATCH(C2,$K$1:$O$1,0)`',
          why: 'Two MATCHes, two directions. Seeing the numbers first (e.g. row 4 = BBB, col 4 = 5 years) makes the final INDEX obvious and lets you spot a tenor that isn\'t on the grid (#N/A) before it pollutes a price.',
          hints: ['Rating labels run down J2:J8; tenor labels run across K1:O1.', 'Lock both ranges with F4.'],
          check: (c) =>
            all(
              formulasMatch(c, 'F2:G16', /MATCH\(.*,\s*0\s*\)/i, 'MATCH(…,0)'),
              colEquals(c, 'F2:F16', DEALS.map((x) => RATINGS.indexOf(x.rating) + 1), 'Row #'),
              colEquals(c, 'G2:G16', DEALS.map((x) => TENORS.indexOf(x.tenor) + 1), 'Col #'),
            ),
          solution: [{ set: { 'F2:F16': '=MATCH(B2,$J$2:$J$8,0)', 'G2:G16': '=MATCH(C2,$K$1:$O$1,0)' } }],
        },
        {
          id: 't2',
          title: 'INDEX the intersection',
          instruction: 'In **E2:E16** return the spread at that row and column of the grid **K2:O8**:\n`=INDEX($K$2:$O$8,F2,G2)`',
          why: 'INDEX(grid, row, col) is a coordinate lookup — like reading a mileage chart. Note the grid excludes the labels: K2:O8, not J1:O8.',
          hints: ['Grid = K2:O8 (numbers only).', '=INDEX($K$2:$O$8,F2,G2)'],
          check: (c) =>
            all(formulasMatch(c, 'E2:E16', /INDEX\(/i, 'INDEX'), colEquals(c, 'E2:E16', DEALS.map((x) => spread(x.rating, x.tenor)), 'Spread')),
          solution: [{ set: { 'E2:E16': '=INDEX($K$2:$O$8,F2,G2)' } }],
        },
        {
          id: 't3',
          title: 'One formula: INDEX/MATCH/MATCH',
          instruction: 'Nest both MATCHes inside the INDEX in **E2:E16**:\n`=INDEX($K$2:$O$8,MATCH(B2,$J$2:$J$8,0),MATCH(C2,$K$1:$O$1,0))`\n\nThen clear the helpers **F2:G16**.',
          why: 'This is the canonical two-way lookup — you will see it in every pricing, provisioning and capital model. Once you can read it as "grid, which row, which column", it stops looking scary.',
          hints: ['Replace F2 with the first MATCH and G2 with the second.', 'Select F2:G16 and press Delete.'],
          check: (c) =>
            all(
              formulasMatch(c, 'E2:E16', /INDEX\(.*MATCH\(.*MATCH\(/i, 'INDEX(grid,MATCH(…),MATCH(…))'),
              colEquals(c, 'E2:E16', DEALS.map((x) => spread(x.rating, x.tenor)), 'Spread'),
              c.inputs('F2:G16').every((x) => x === '') ? true : 'Clear the helper columns F2:G16.',
            ),
          solution: [
            { set: { 'E2:E16': '=INDEX($K$2:$O$8,MATCH(B2,$J$2:$J$8,0),MATCH(C2,$K$1:$O$1,0))' } },
            { select: 'F2:G16' },
            { cmd: 'edit.clear' },
          ],
        },
        {
          id: 't4',
          title: 'Build a one-cell pricer',
          instruction: 'Below the grid is a quote box. Set the inputs **K11** = `BBB` and **K12** = `7`, then in **K13** write an INDEX/MATCH/MATCH that reads **K11** and **K12**:\n`=INDEX($K$2:$O$8,MATCH(K11,$J$2:$J$8,0),MATCH(K12,$K$1:$O$1,0))`',
          why: 'Pointing the MATCHes at input cells turns a lookup into a tool: relationship managers type a rating and tenor and get an indicative spread instantly. Yellow inputs, green output is a common model-building convention.',
          hints: ['Type BBB in K11 and 7 in K12.', 'Same formula as the deals, but the keys are K11 and K12.'],
          check: (c) =>
            all(
              String(c.v('K11') ?? '').toUpperCase() === 'BBB' ? true : 'Set K11 to BBB.',
              c.v('K12') === 7 ? true : 'Set K12 to 7.',
              /INDEX\(.*MATCH\(\s*K11\s*,.*MATCH\(\s*K12\s*,/i.test(c.f('K13')) ? true : 'K13 should be INDEX(…,MATCH(K11,…),MATCH(K12,…)).',
              c.v('K13') === spread('BBB', 7) ? true : `K13 should show ${spread('BBB', 7)} bps.`,
            ),
          solution: [{ set: { K11: 'BBB', K12: '7', K13: '=INDEX($K$2:$O$8,MATCH(K11,$J$2:$J$8,0),MATCH(K12,$K$1:$O$1,0))' } }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm10-l3',
      title: 'XLOOKUP: the modern lookup',
      summary: 'Look left, label missing keys, return several columns at once and pick columns by header name.',
      minutes: 11,
      featured: ['XLOOKUP', 'if_not_found', 'spill'],
      intro: `**XLOOKUP** (Excel 365/2021+) rolls VLOOKUP, INDEX/MATCH and IFNA into one function:

\`=XLOOKUP(lookup_value, lookup_array, return_array, [if_not_found], [match_mode], [search_mode])\`

- **lookup_array** — the column holding the key. **return_array** — the column(s) to bring back. Separate ranges → it can look **left** and it survives inserted columns, just like INDEX/MATCH.
- **Exact match is the default.** No FALSE to forget — the safest default for IDs.
- **if_not_found** — built-in label for missing keys (\`"Not found"\`), so no IFNA wrapper.
- **Return several columns:** give a multi-column return_array (e.g. Segment through Branch) and the result **spills** across the cells to the right. One formula, four fields.

**Spill rules:** the cells the result spills into must be empty, otherwise you get **#SPILL!**. Only the first cell holds the formula; the rest are "ghost" values.

**When not to use it:** if the file must open in Excel 2016 or older (some counterparties, some regulators' templates), XLOOKUP shows #NAME?. Then INDEX/MATCH is the portable choice.

**Common mistakes:** lookup_array and return_array of different heights (→ #VALUE!); typing something to the right of a spilling formula (→ #SPILL!).`,
      workbooks: () => [
        makeBook('Customer_Recon.xlsx', [
          {
            name: 'Recon',
            rows: layout([
              {
                at: 'A1',
                rows: [['Customer ID', 'Name', 'Segment', 'Region', 'Rating', 'Branch', null, null], ...R3.map((id) => [id])],
              },
              { at: 'J1', rows: l3Master },
            ]),
            widths: [95, 150, 110, 90, 60, 70, 30, 90, 30, 150, 95, 110, 90, 60, 70],
            styles: { H1: { ...HDR } },
            freeze: true,
          },
        ]),
      ],
      start: { cell: 'B2' },
      tasks: [
        {
          id: 't1',
          title: 'Look left with a built-in "Not found"',
          instruction: 'The master in **J:O** has Name (J) to the **left** of Customer ID (K). In **B2:B21** enter\n`=XLOOKUP(A2,$K$2:$K$61,$J$2:$J$61,"Not found")`',
          why: 'Three of these IDs are not in the master. XLOOKUP labels them itself — and because the 4th argument only triggers on "not found", a broken range would still show an error. Same safety as IFNA, less typing.',
          hints: ['lookup_array = the ID column K2:K61, return_array = the Name column J2:J61.', 'Lock both ranges with F4.'],
          check: (c) =>
            all(
              formulasMatch(c, 'B2:B21', /XLOOKUP\(.*,\s*"Not found"\s*\)/i, 'XLOOKUP(…,"Not found")'),
              colEquals(c, 'B2:B21', R3.map((id) => c3(id)?.name ?? 'Not found'), 'Name'),
            ),
          solution: [{ set: { 'B2:B21': '=XLOOKUP(A2,$K$2:$K$61,$J$2:$J$61,"Not found")' } }],
        },
        {
          id: 't2',
          title: 'Four columns from one formula (spill)',
          instruction: 'In **C2** enter a single XLOOKUP whose return_array is the four columns **Segment → Branch** (L:O):\n`=XLOOKUP(A2,$K$2:$K$61,$L$2:$O$61,"Not found")`\n\nIt spills into C2:F2. Fill **C2** down to **C21** (only column C holds formulas).',
          why: 'One formula per row instead of four means one thing to audit and nothing to keep in sync. Note the spill needs D:F empty — a stray value there gives #SPILL!.',
          hints: ['Return array L2:O61 = Segment, Region, Rating, Branch.', 'Type it in C2, then select C2:C21 and Ctrl+D.'],
          check: (c) =>
            all(
              formulasMatch(c, 'C2:C21', /XLOOKUP\(.*\$L(\$\d+)?:\$O/i, 'XLOOKUP returning the four columns $L$2:$O$61'),
              c.inputs('D2:F21').every((x) => x === '') ? true : 'Only column C should hold formulas — D:F are filled by the spill. Clear anything typed in D2:F21.',
              colEquals(c, 'C2:C21', R3.map((id) => c3(id)?.segment ?? 'Not found'), 'Segment'),
              colEquals(c, 'D2:D21', R3.map((id) => c3(id)?.region ?? null), 'Region'),
              colEquals(c, 'E2:E21', R3.map((id) => c3(id)?.rating ?? null), 'Rating'),
              colEquals(c, 'F2:F21', R3.map((id) => c3(id)?.branch ?? null), 'Branch'),
            ),
          solution: [{ set: { 'C2:C21': '=XLOOKUP(A2,$K$2:$K$61,$L$2:$O$61,"Not found")' } }],
        },
        {
          id: 't3',
          title: 'Pick the column by header name',
          instruction: 'Make a column that follows whatever header you type. In **H1** type `Rating`. In **H2:H21** enter a nested XLOOKUP — the inner one finds the column whose header matches H1:\n`=XLOOKUP($A2,$K$2:$K$61,XLOOKUP(H$1,$J$1:$O$1,$J$2:$O$61),"Not found")`\n\nTry changing H1 to `Branch` and back — the column follows the header.',
          why: 'The inner XLOOKUP searches the header row and returns that whole column; the outer one picks the customer\'s row. Driving lookups by header name means a re-ordered extract can\'t break your report. H$1 is a mixed reference so you could fill it right for more fields.',
          hints: ['Inner: XLOOKUP(H$1,$J$1:$O$1,$J$2:$O$61) → the column under that header.', 'Outer: XLOOKUP($A2, ID column, <inner>, "Not found").', 'Leave H1 set to Rating when you finish.'],
          check: (c) =>
            all(
              String(c.v('H1') ?? '').toLowerCase() === 'rating' ? true : 'Set H1 to Rating.',
              formulasMatch(c, 'H2:H21', /XLOOKUP\(.*XLOOKUP\(\s*H\$1/i, 'nested XLOOKUP(…,XLOOKUP(H$1,…))'),
              colEquals(c, 'H2:H21', R3.map((id) => c3(id)?.rating ?? 'Not found'), 'Rating'),
            ),
          solution: [{ set: { H1: 'Rating', 'H2:H21': '=XLOOKUP($A2,$K$2:$K$61,XLOOKUP(H$1,$J$1:$O$1,$J$2:$O$61),"Not found")' } }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm10-l4',
      title: 'Latest record: search from the bottom',
      summary: 'A history table has many rows per customer. search_mode -1 returns the most recent one.',
      minutes: 9,
      featured: ['XLOOKUP …,0,-1', 'search_mode'],
      intro: `Data-lake tables are often **histories**: every rating review, every limit change, every balance snapshot is a new row. A customer appears many times.

Every lookup you've seen so far returns the **first** match from the top. In a history sorted oldest → newest, that's the **oldest** record — usually *not* what the credit committee wants.

**XLOOKUP's 6th argument, search_mode:**
- \`1\` (default) — search top to bottom → first/oldest match.
- \`-1\` — search **bottom to top** → last/most recent match.

\`=XLOOKUP(A2, ids, ratings, "No history", 0, -1)\`
(The 5th argument \`0\` = exact match; you have to fill it in to reach the 6th.)

**It relies on the order of the table.** "Last row = latest" is only true if the history is sorted by date ascending. Check the sort (or sort it yourself) before you trust it — and say so in your notes.

**Why it matters at a bank:** current rating for provisioning, latest limit for utilisation, last payment date for delinquency, most recent KYC review. Using the first match instead of the latest is a classic finding in model validation.

**Common mistakes:** forgetting the 0 before -1 (\`…,"No history",-1)\` makes -1 the *match mode*); assuming the extract is sorted when it isn't.`,
      workbooks: () => [
        makeBook('Rating_History.xlsx', [
          {
            name: 'Watchlist',
            rows: layout([
              {
                at: 'A1',
                rows: [['Customer ID', 'First Rating', 'Latest Rating', 'Latest Review', 'Migration'], ...W_IDS.map((id) => [id])],
              },
              { at: 'H1', rows: [['Review Date', 'Customer ID', 'Rating', 'Analyst'], ...HIST.map((h) => [h.date, h.id, h.rating, h.analyst])] },
            ]),
            widths: [95, 90, 95, 100, 95, 30, 30, 95, 95, 60, 90],
            formats: { 3: 'm/d/yyyy', 7: 'm/d/yyyy' },
            freeze: true,
          },
        ]),
      ],
      start: { cell: 'B2' },
      tasks: [
        {
          id: 't1',
          title: 'The default: first match',
          instruction: `In **B2:B12** return the rating from the history (rows 2–${H_END}) with a normal XLOOKUP:
\`=XLOOKUP(A2,${hRng('I')},${hRng('J')},"No history")\``,
          why: 'This is what VLOOKUP, INDEX/MATCH and a default XLOOKUP all give you: the first match from the top. Because the history is sorted oldest-first, it\'s each customer\'s ORIGINAL rating. Useful for migration analysis — dangerous if you think it\'s current.',
          hints: ['Lookup array = Customer ID column I, return array = Rating column J.', `=XLOOKUP(A2,${hRng('I')},${hRng('J')},"No history")`],
          check: (c) =>
            all(
              formulasMatch(c, 'B2:B12', /XLOOKUP\(/i, 'XLOOKUP'),
              colEquals(c, 'B2:B12', W_IDS.map((id) => firstOf(id)?.rating ?? 'No history'), 'First rating'),
            ),
          solution: [{ set: { 'B2:B12': `=XLOOKUP(A2,${hRng('I')},${hRng('J')},"No history")` } }],
        },
        {
          id: 't2',
          title: 'Latest rating with search_mode -1',
          instruction: `In **C2:C12** search from the **bottom** up:
\`=XLOOKUP(A2,${hRng('I')},${hRng('J')},"No history",0,-1)\``,
          why: 'Search from last + a history sorted by date = the most recent record. Compare columns B and C: wherever they differ, the customer has migrated since their first review.',
          hints: ['Add two more arguments after "No history": 0 (exact match) and -1 (search last-to-first).'],
          check: (c) =>
            all(
              formulasMatch(c, 'C2:C12', /XLOOKUP\(.*,\s*0\s*,\s*-1\s*\)/i, 'XLOOKUP(…,0,-1)'),
              colEquals(c, 'C2:C12', W_IDS.map((id) => lastOf(id)?.rating ?? 'No history'), 'Latest rating'),
            ),
          solution: [{ set: { 'C2:C12': `=XLOOKUP(A2,${hRng('I')},${hRng('J')},"No history",0,-1)` } }],
        },
        {
          id: 't3',
          title: 'When was the latest review?',
          instruction: `In **D2:D12** return the **Review Date** of that latest record — same lookup, different return column (H):
\`=XLOOKUP(A2,${hRng('I')},${hRng('H')},"No history",0,-1)\``,
          why: 'The date is your evidence. "Rating BB as of 14-Mar-2024" is auditable; "Rating BB" is not. It also flags stale reviews — anything older than 12 months on a watchlist needs a refresh.',
          hints: ['Only the return_array changes: Review Date is column H.', 'Column D is already formatted as a date.'],
          check: (c) =>
            all(
              formulasMatch(c, 'D2:D12', /XLOOKUP\(.*,\s*0\s*,\s*-1\s*\)/i, 'XLOOKUP(…,0,-1)'),
              colEquals(c, 'D2:D12', W_IDS.map((id) => lastOf(id)?.date ?? 'No history'), 'Latest review'),
            ),
          solution: [{ set: { 'D2:D12': `=XLOOKUP(A2,${hRng('I')},${hRng('H')},"No history",0,-1)` } }],
        },
        {
          id: 't4',
          title: 'Flag migrations',
          instruction: 'In **E2:E12** flag what each watchlist customer needs. A customer with **no review at all** is itself a finding, so test for that first, then compare first vs latest:\n`=IF(C2="No history","Review needed",IF(B2=C2,"No change","Changed"))`',
          why: 'A first-vs-latest comparison is the seed of a rating migration matrix — a standard credit-risk report. Filtering this column gives the credit committee its discussion list, and "Review needed" catches the watchlist name nobody has looked at.',
          hints: ['The outer IF catches the missing review; the inner IF compares first (B) with latest (C).', 'Order matters: check "No history" first, otherwise that row would read "No change".'],
          check: (c) =>
            all(
              formulasMatch(c, 'E2:E12', /IF\(/i, 'IF'),
              colEquals(
                c,
                'E2:E12',
                W_IDS.map((id) => (!lastOf(id) ? 'Review needed' : firstOf(id)!.rating === lastOf(id)!.rating ? 'No change' : 'Changed')),
                'Migration',
              ),
            ),
          solution: [{ set: { 'E2:E12': '=IF(C2="No history","Review needed",IF(B2=C2,"No change","Changed"))' } }],
        },
      ],
    },
  ],
  quiz: [
    {
      kind: 'mc',
      q: 'The master is laid out Name | Customer ID | Rating. You have an ID and need the Name. What works?',
      options: ['VLOOKUP with col_index_num -1', 'INDEX(Name column, MATCH(ID, ID column, 0)) or XLOOKUP', 'HLOOKUP', 'VLOOKUP with TRUE'],
      answer: 1,
      explain: 'VLOOKUP can only return columns to the right of the key. INDEX/MATCH and XLOOKUP use separate lookup and return ranges, so direction doesn\'t matter.',
    },
    {
      kind: 'formula',
      q: 'At what position does rating "BBB" appear in A2:A8? (exact match)',
      grid: [['Rating'], ['AAA'], ['AA'], ['A'], ['BBB'], ['BB'], ['B'], ['CCC']],
      at: 'C2',
      expect: 4,
      model: '=MATCH("BBB",A2:A8,0)',
      explain: 'MATCH returns the position within the range (not the sheet row). 0 = exact match.',
      mustUse: ['MATCH'],
    },
    {
      kind: 'formula',
      q: 'Return the Name (column A) for customer ID C1003 (column B) using INDEX and MATCH.',
      grid: [
        ['Name', 'Customer ID'],
        ['Acme Holdings', 'C1001'],
        ['Maria Garcia', 'C1002'],
        ['Delta Foods', 'C1003'],
      ],
      at: 'D2',
      expect: 'Delta Foods',
      model: '=INDEX(A2:A4,MATCH("C1003",B2:B4,0))',
      explain: 'MATCH finds position 3 in the ID column; INDEX returns item 3 of the Name column.',
      mustUse: ['INDEX'],
    },
    {
      kind: 'formula',
      q: 'Spread grid: ratings in A2:A4, tenors in B1:D1. Return the spread for rating "A", tenor 5.',
      grid: [
        ['Rating', 1, 3, 5],
        ['AA', 50, 60, 72],
        ['A', 75, 88, 101],
        ['BBB', 125, 141, 160],
      ],
      at: 'F2',
      expect: 101,
      model: '=INDEX(B2:D4,MATCH("A",A2:A4,0),MATCH(5,B1:D1,0))',
      explain: 'INDEX(grid, row via MATCH down the side, column via MATCH across the top). Note the grid B2:D4 excludes the labels.',
      mustUse: ['INDEX'],
    },
    {
      kind: 'mc',
      q: 'A colleague inserts a column inside the table used by =VLOOKUP(A2,$I$2:$L$61,4,FALSE). What happens?',
      options: [
        'Excel shows #REF!',
        'The range grows to $I$2:$M$61 but 4 now points at a different field — wrong values, no error',
        'Nothing — VLOOKUP adjusts the 4 automatically',
        'The formula is deleted',
      ],
      answer: 1,
      explain: 'The column number is a hard-coded constant. INDEX/MATCH and XLOOKUP reference the return column itself, so they move with it.',
    },
    {
      kind: 'formula',
      q: 'Use XLOOKUP to return the name for ID "C9999", showing "Not found" if it is missing.',
      grid: [
        ['Customer ID', 'Name'],
        ['C1001', 'Acme Holdings'],
        ['C1002', 'Maria Garcia'],
      ],
      at: 'D2',
      expect: 'Not found',
      model: '=XLOOKUP("C9999",A2:A3,B2:B3,"Not found")',
      explain: 'The 4th argument, if_not_found, replaces the #N/A for a missing key.',
      mustUse: ['XLOOKUP'],
    },
    {
      kind: 'formula',
      q: 'The history (oldest first) has several rows for C1. Return C1\'s LATEST rating.',
      grid: [
        ['Customer', 'Rating'],
        ['C1', 'A'],
        ['C2', 'BB'],
        ['C1', 'BBB'],
        ['C2', 'B'],
        ['C1', 'BB'],
      ],
      at: 'D2',
      expect: 'BB',
      model: '=XLOOKUP("C1",A2:A6,B2:B6,"",0,-1)',
      explain: 'search_mode -1 searches from the bottom, returning the last (most recent) match.',
      mustUse: ['XLOOKUP'],
    },
    {
      kind: 'mc',
      q: 'In =XLOOKUP(A2,ids,ratings,"None",0,-1), what does the 0 do?',
      options: ['Returns 0 when not found', 'Sets match_mode to exact match (needed to reach the 6th argument)', 'Searches from the top', 'Turns off spilling'],
      answer: 1,
      explain: 'Argument 5 is match_mode (0 = exact). You must fill it in to supply argument 6, search_mode.',
    },
    {
      kind: 'mc',
      q: 'Your XLOOKUP returns 4 columns and shows #SPILL!. Most likely cause?',
      options: ['The key is missing', 'One of the cells it needs to spill into is not empty', 'XLOOKUP cannot return multiple columns', 'The ranges are not locked'],
      answer: 1,
      explain: 'A spilling result needs every target cell empty. Clear the blocking cell and it spills.',
    },
    {
      kind: 'mc',
      q: 'When is INDEX/MATCH a better choice than XLOOKUP?',
      options: ['Never', 'When the file must work in Excel 2016 or older', 'When looking left', 'When you need exact match'],
      answer: 1,
      explain: 'XLOOKUP only exists in Excel 2021/365. INDEX/MATCH does everything important and works in every version.',
    },
  ],
};
