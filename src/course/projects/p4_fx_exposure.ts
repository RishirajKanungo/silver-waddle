import type { Lesson, CheckCtx } from '../types';
import { makeBook, rng, pick, between, FX_RATES } from '../data';
import { all, approx, fmtScalar, formulasMatch, valuesEqual } from '../runner';

// ---------------------------------------------------------------------------
// 60 credit positions booked in 7 currencies across 10 counterparties.
// Rates come from the treasury FX file (FX_RATES), internal credit scores from
// the ratings file. One counterparty ("Lakeside Pharma") was onboarded last
// week and has NO rating yet -> policy says treat as unrated: score 0, 150%.
// ---------------------------------------------------------------------------

const CPTYS = ['Atlas Prime Brokerage', 'Northbridge Capital', 'Summit Clearing', 'Pioneer Markets', 'Meridian Bank', 'Goldline Securities', 'Harbor Freight Co', 'Keystone Energy', 'Orion Media Group', 'Lakeside Pharma'] as const;
const RATINGS: [string, string, number][] = [
  ['Summit Clearing', 'AAA', 91],
  ['Atlas Prime Brokerage', 'AA', 84],
  ['Northbridge Capital', 'A', 72],
  ['Keystone Energy', 'A', 68],
  ['Meridian Bank', 'BBB', 61],
  ['Goldline Securities', 'BBB', 55],
  ['Pioneer Markets', 'BB', 47],
  ['Harbor Freight Co', 'B', 33],
  ['Orion Media Group', 'CCC', 22],
];
const BANDS: [number, number, string][] = [
  [0, 1.5, 'Unrated / CCC'],
  [30, 1.0, 'BB / B'],
  [50, 0.75, 'BBB'],
  [65, 0.5, 'A'],
  [80, 0.2, 'AA / AAA'],
];
const PRODUCTS = ['Term Loan', 'Revolver', 'FX Forward', 'Guarantee', 'Trade Finance'];

const r = rng(5150);
const POS = Array.from({ length: 60 }, (_, i) => {
  const [ccy, rate] = pick(r, FX_RATES);
  const usd = between(r, 500, 20000) * 1000;
  return { id: `POS-${3001 + i}`, cpty: pick(r, CPTYS), product: pick(r, PRODUCTS), ccy, local: Math.round(usd / rate / 1000) * 1000 };
});
const N = POS.length;
const LAST = N + 1;

const rateOf = new Map(FX_RATES);
const scoreOf = new Map(RATINGS.map(([c, , s]) => [c, s]));
const weightOf = (score: number) => {
  let w = BANDS[0][1];
  for (const [min, wt] of BANDS) if (score >= min) w = wt;
  return w;
};

const EXP_RATE = POS.map((p) => rateOf.get(p.ccy)!);
const EXP_USD = POS.map((p) => p.local * rateOf.get(p.ccy)!);
const EXP_SCORE = POS.map((p) => scoreOf.get(p.cpty) ?? 0);
const EXP_RW = EXP_SCORE.map(weightOf);
const TOTAL_USD = EXP_USD.reduce((a, b) => a + b, 0);
const TOTAL_RWA = EXP_USD.reduce((a, u, i) => a + u * EXP_RW[i], 0);

const ci = (s: string) => s.toLowerCase();
const NAMES = [...new Set(POS.map((p) => p.cpty))].sort((a, b) => (ci(a) < ci(b) ? -1 : ci(a) > ci(b) ? 1 : 0));
const NC = NAMES.length;
const TBL_LAST = 7 + NC; // A8:A(7+NC)
const BY_USD = NAMES.map((n) => POS.reduce((a, p, i) => (p.cpty === n ? a + EXP_USD[i] : a), 0));
const BY_RWA = NAMES.map((n) => POS.reduce((a, p, i) => (p.cpty === n ? a + EXP_USD[i] * EXP_RW[i] : a), 0));
const TOP5 = NAMES.map((n, i) => ({ n, v: BY_USD[i] })).sort((a, b) => b.v - a.v).slice(0, 5);

const posBook = () =>
  makeBook('Positions.xlsx', [
    {
      name: 'Positions',
      rows: [['Position ID', 'Counterparty', 'Product', 'Currency', 'Local Amount'], ...POS.map((p) => [p.id, p.cpty, p.product, p.ccy, p.local])],
      widths: [90, 170, 110, 70, 130, 80, 130, 70, 90],
      formats: { 4: '#,##0' },
      freeze: true,
    },
    {
      name: 'Summary',
      header: false,
      rows: [
        ['Counterparty Exposure Report (USD)'],
        [],
        ['Total USD exposure'],
        ['Total RWA'],
        ['RWA density'],
        [],
        ['Counterparty', 'USD Exposure', 'RWA', '', 'Top 5 Counterparty', 'USD Exposure'],
        ...NAMES.map(() => []),
        ['Total'],
        ['Check vs total (should be 0)'],
      ],
      widths: [190, 130, 130, 20, 190, 130],
      styles: {
        A1: { b: true },
        ...Object.fromEntries(['A7', 'B7', 'C7', 'E7', 'F7'].map((a) => [a, { b: true, fill: '#DDEBF7' }])),
        [`A${TBL_LAST + 1}`]: { b: true },
      },
    },
  ]);

const fxBook = () =>
  makeBook('FX_Rates.xlsx', [
    { name: 'Rates', rows: [['Currency', 'USD per unit'], ...FX_RATES.map(([c, v]) => [c, v])], widths: [80, 110], formats: { 1: '0.0000' } },
  ]);

const ratingsBook = () =>
  makeBook('Counterparty_Ratings.xlsx', [
    { name: 'Ratings', rows: [['Counterparty', 'Rating', 'Internal Score'], ...RATINGS.map(([c, g, s]) => [c, g, s])], widths: [190, 70, 110] },
    { name: 'RiskWeights', rows: [['Min Score', 'Risk Weight', 'Band'], ...BANDS.map(([m, w, b]) => [m, w, b])], widths: [90, 100, 140], formats: { 1: '0%' } },
  ]);

const refs = (c: CheckCtx, ref: string, re: RegExp, book: string) => {
  const bad = c.inputs(ref).findIndex((x) => !re.test(x));
  return bad < 0 ? true : `The formulas in ${ref} should look up into [${book}] (cell #${bad + 1} doesn't).`;
};
const hdr = (c: CheckCtx, ref: string, name: string) => (String(c.v(ref) ?? '').trim() ? true : `Type the header "${name}" in ${ref}.`);
const fmtHas = (c: CheckCtx, cells: string[], re: RegExp, what: string) => {
  const bad = cells.find((a) => !re.test(c.style(a).fmt ?? ''));
  return bad ? `${bad.replace(/^.*!/, '')} needs ${what}.` : true;
};
const colCells = (sheet: string, col: string, r1: number, r2: number) => Array.from({ length: r2 - r1 + 1 }, (_, i) => `${sheet}!${col}${r1 + i}`);

export const project: Lesson = {
  id: 'p4-fx-exposure',
  kind: 'project',
  title: 'Multi-Currency Exposure Report',
  summary: 'Convert positions to USD across files, map scores to risk weights with an approximate match, and rank counterparties.',
  minutes: 40,
  featured: ['VLOOKUP', 'XLOOKUP', 'SUMPRODUCT', 'UNIQUE', 'SORT', 'TAKE', 'SUMIFS', 'LARGE'],
  intro: `**From:** Sofia Bianchi, Credit Risk Management
**To:** you
**Subject:** Counterparty exposure — CRO wants it before the 2pm risk call

The CRO wants a single-currency view of our counterparty exposure and a rough risk-weighted number. Three files are open:

- **Positions.xlsx** — 60 positions, each in its **local currency** (USD, EUR, GBP, JPY, CAD, CHF, INR). Your working file.
- **FX_Rates.xlsx** — treasury's month-end rates, *USD per 1 unit* of currency. Read-only.
- **Counterparty_Ratings.xlsx** — our internal credit score per counterparty (**Ratings** tab) and the policy table that turns a score into a **risk weight** (**RiskWeights** tab). Read-only.

Heads-up: **Lakeside Pharma** was onboarded last week and isn't rated yet. Policy: unrated = score **0** (the most conservative weight).

What I need:

- Every position converted to USD, with its score and risk weight.
- Totals: USD exposure, RWA (exposure × risk weight) and RWA density.
- Exposure and RWA per counterparty, and the **top 5** counterparties by USD exposure.

**What "done" looks like:** the per-counterparty table adds back to the total (check cell = 0) and the top 5 is a live formula, not a hand-typed list.`,
  workbooks: () => [posBook(), fxBook(), ratingsBook()],
  readOnly: ['FX_Rates.xlsx', 'Counterparty_Ratings.xlsx'],
  start: { book: 'Positions.xlsx', sheet: 'Positions', cell: 'F1' },
  tasks: [
    {
      id: 't1',
      title: 'Look up the FX rate',
      instruction: `On **Positions**, header \`FX Rate\` in **F1**. In **F2:F${LAST}** look up each position's Currency (D) in **[FX_Rates.xlsx]Rates** and return the *USD per unit* rate (exact match).`,
      why: `FX conversion is a lookup, never a typed number: rates change every month-end and the file has to be re-runnable. Keeping the rate in its own column (rather than burying it inside the USD formula) also lets a reviewer eyeball "is JPY really 0.0067?" in one glance.`,
      hints: ['Lookup value D2, table [FX_Rates.xlsx]Rates!$A:$B, column 2, exact match.', '=VLOOKUP(D2,[FX_Rates.xlsx]Rates!$A:$B,2,FALSE)'],
      check: (c) =>
        all(
          hdr(c, 'Positions!F1', 'FX Rate'),
          formulasMatch(c, `Positions!F2:F${LAST}`, /(VLOOKUP|XLOOKUP|INDEX)\(/i, 'lookup'),
          refs(c, `Positions!F2:F${LAST}`, /fx_rates/i, 'FX_Rates.xlsx'),
          valuesEqual(c, `Positions!F2:F${LAST}`, EXP_RATE, 'FX Rate'),
        ),
      solution: [{ set: { 'Positions!F1': 'FX Rate', [`Positions!F2:F${LAST}`]: '=VLOOKUP(D2,[FX_Rates.xlsx]Rates!$A:$B,2,FALSE)' } }],
      xp: 25,
    },
    {
      id: 't2',
      title: 'Convert to USD',
      instruction: `Header \`USD Amount\` in **G1**, and in **G2:G${LAST}** = Local Amount × FX Rate.`,
      why: `The rate is quoted as **USD per 1 unit** of the foreign currency, so you **multiply**. If the file had been quoted the other way (units per USD, e.g. JPY 149.2) you would divide. Getting the direction wrong is a classic — sanity check one row: ¥1bn should be roughly $6.7m, not $149bn.`,
      hints: ['Multiply the Local Amount (E) by the FX Rate (F) you just looked up.', `=E2*F2 filled down to G${LAST}.`],
      check: (c) =>
        all(
          hdr(c, 'Positions!G1', 'USD Amount'),
          formulasMatch(c, `Positions!G2:G${LAST}`, /\*/, 'multiplication (Local × Rate)'),
          valuesEqual(c, `Positions!G2:G${LAST}`, EXP_USD, 'USD Amount'),
        ),
      solution: [{ set: { 'Positions!G1': 'USD Amount', [`Positions!G2:G${LAST}`]: '=E2*F2' } }],
      xp: 20,
    },
    {
      id: 't3',
      title: 'Bring in the credit score (with a default)',
      instruction: `Header \`Score\` in **H1**. In **H2:H${LAST}** use **XLOOKUP** to return each Counterparty's **Internal Score** from **[Counterparty_Ratings.xlsx]Ratings** (column C). If the counterparty isn't rated, return **0**.`,
      why: `XLOOKUP's 4th argument (*if_not_found*) is how you encode a **policy default** right in the formula: "unrated = 0 = most conservative". It's explicit and auditable, unlike an IFERROR that would also silently swallow typos in the formula.

Look at the Lakeside Pharma rows afterwards — they should show 0, not #N/A.`,
      hints: [
        'XLOOKUP(lookup_value, lookup_array, return_array, if_not_found)',
        '=XLOOKUP(B2,[Counterparty_Ratings.xlsx]Ratings!$A:$A,[Counterparty_Ratings.xlsx]Ratings!$C:$C,0)',
      ],
      check: (c) =>
        all(
          hdr(c, 'Positions!H1', 'Score'),
          formulasMatch(c, `Positions!H2:H${LAST}`, /(XLOOKUP|VLOOKUP|INDEX)\(/i, 'XLOOKUP'),
          refs(c, `Positions!H2:H${LAST}`, /counterparty_ratings/i, 'Counterparty_Ratings.xlsx'),
          valuesEqual(c, `Positions!H2:H${LAST}`, EXP_SCORE, 'Score'),
        ),
      solution: [{ set: { 'Positions!H1': 'Score', [`Positions!H2:H${LAST}`]: '=XLOOKUP(B2,[Counterparty_Ratings.xlsx]Ratings!$A:$A,[Counterparty_Ratings.xlsx]Ratings!$C:$C,0)' } }],
      xp: 30,
    },
    {
      id: 't4',
      title: 'Score → risk weight (approximate match)',
      instruction: `Header \`Risk Weight\` in **I1**. In **I2:I${LAST}** find each Score in the **RiskWeights** band table (\`[Counterparty_Ratings.xlsx]RiskWeights!$A$2:$B$6\`) using an **approximate match**, and return the Risk Weight.`,
      why: `The policy table lists the **minimum score** of each band (0, 30, 50, 65, 80). A score of 72 isn't in the list — you want the band whose minimum is the largest value **≤ 72**, i.e. 65 → 50%. That is exactly what an approximate-match lookup does (VLOOKUP with **TRUE**), *provided the first column is sorted ascending*.

This is the one legitimate use of TRUE in VLOOKUP: tax brackets, DPD buckets, rating bands, commission tiers.`,
      hints: [
        'Same VLOOKUP as before, but the last argument is TRUE.',
        'Lock the table with $ so it doesn\'t slide down as you fill.',
        '=VLOOKUP(H2,[Counterparty_Ratings.xlsx]RiskWeights!$A$2:$B$6,2,TRUE)',
      ],
      check: (c) =>
        all(
          hdr(c, 'Positions!I1', 'Risk Weight'),
          formulasMatch(c, `Positions!I2:I${LAST}`, /(VLOOKUP|XLOOKUP|INDEX|LOOKUP)\(/i, 'approximate-match lookup'),
          refs(c, `Positions!I2:I${LAST}`, /riskweights/i, 'Counterparty_Ratings.xlsx]RiskWeights'),
          valuesEqual(c, `Positions!I2:I${LAST}`, EXP_RW, 'Risk Weight'),
        ),
      solution: [{ set: { 'Positions!I1': 'Risk Weight', [`Positions!I2:I${LAST}`]: '=VLOOKUP(H2,[Counterparty_Ratings.xlsx]RiskWeights!$A$2:$B$6,2,TRUE)' } }],
      xp: 35,
    },
    {
      id: 't5',
      title: 'Headline totals with SUMPRODUCT',
      instruction: `On **Summary**:

- **B3** — total USD exposure (sum of Positions!G).
- **B4** — total **RWA** = Σ (USD Amount × Risk Weight), in one cell with **SUMPRODUCT** — no helper column.
- **B5** — RWA density = B4 / B3.`,
      why: `SUMPRODUCT multiplies two ranges row by row and adds the results — a weighted sum in one cell. It's how you get portfolio-level weighted numbers (RWA, weighted-average rate, weighted-average life) without adding a column to someone else's tape.

RWA density (RWA / exposure) is the single number risk committees watch: it tells you how "risky per dollar" the book is.`,
      hints: [`B3: =SUM(Positions!G2:G${LAST})`, `B4: =SUMPRODUCT(Positions!G2:G${LAST},Positions!I2:I${LAST})`, 'B5: =B4/B3'],
      check: (c) =>
        all(
          /positions!/i.test(c.f('Summary!B3')) && approx(c.v('Summary!B3'), TOTAL_USD, 1e-9) ? true : `B3 should sum the USD Amount column on Positions (shows ${fmtScalar(c.v('Summary!B3'))}).`,
          /SUMPRODUCT\(/i.test(c.f('Summary!B4')) ? true : 'B4 should use SUMPRODUCT.',
          approx(c.v('Summary!B4'), TOTAL_RWA, 1e-9) ? true : `B4 shows ${fmtScalar(c.v('Summary!B4'))} — it should be the sum of USD Amount × Risk Weight.`,
          c.f('Summary!B5').startsWith('=') && approx(c.v('Summary!B5'), TOTAL_RWA / TOTAL_USD, 1e-9) ? true : 'B5 should be a formula: RWA divided by total exposure.',
        ),
      solution: [{ set: { 'Summary!B3': `=SUM(Positions!G2:G${LAST})`, 'Summary!B4': `=SUMPRODUCT(Positions!G2:G${LAST},Positions!I2:I${LAST})`, 'Summary!B5': '=B4/B3' } }],
      xp: 30,
    },
    {
      id: 't6',
      title: 'List the counterparties',
      instruction: `In **Summary!A8** write one formula that returns the **unique** counterparties from Positions!B2:B${LAST}, **sorted A→Z**. It will spill down to A${TBL_LAST}.`,
      why: `UNIQUE + SORT builds your row labels from the data itself, so a new counterparty next month appears automatically — no more "we forgot to add the new client to the summary" incidents.

If you see **#SPILL!**, something is sitting in the cells below A8 — clear them.`,
      hints: ['Wrap UNIQUE inside SORT.', `=SORT(UNIQUE(Positions!B2:B${LAST}))`],
      check: (c) =>
        all(
          /UNIQUE\(/i.test(c.f('Summary!A8')) ? true : 'A8 should use UNIQUE (wrapped in SORT).',
          valuesEqual(c, `Summary!A8:A${TBL_LAST}`, NAMES, 'Counterparties'),
        ),
      solution: [{ set: { 'Summary!A8': `=SORT(UNIQUE(Positions!B2:B${LAST}))` } }],
      xp: 25,
    },
    {
      id: 't7',
      title: 'Exposure and RWA per counterparty',
      instruction: `Next to the list:

- **B8:B${TBL_LAST}** — USD exposure per counterparty (SUMIFS on Positions).
- **C8:C${TBL_LAST}** — RWA per counterparty, using **SUMPRODUCT** with a condition: \`(Positions!$B$2:$B$${LAST}=A8)\` × USD × Risk Weight.
- **B${TBL_LAST + 1}** — total of B8:B${TBL_LAST}, and **B${TBL_LAST + 2}** = that total minus **B3**. It must be **0**.`,
      why: `SUMPRODUCT accepts a TRUE/FALSE test as one of its "arrays" — TRUE counts as 1, FALSE as 0 — so it becomes a **conditional weighted sum**, something SUMIFS can't do (SUMIFS can only add an existing column, not a product of two).

The check row proves no position fell through the cracks (e.g. a counterparty name with a trailing space that UNIQUE treats as separate).`,
      hints: [
        `B8: =SUMIFS(Positions!$G$2:$G$${LAST},Positions!$B$2:$B$${LAST},A8)`,
        `C8: =SUMPRODUCT((Positions!$B$2:$B$${LAST}=A8)*Positions!$G$2:$G$${LAST}*Positions!$I$2:$I$${LAST})`,
        `B${TBL_LAST + 1}: =SUM(B8:B${TBL_LAST})   B${TBL_LAST + 2}: =B${TBL_LAST + 1}-B3`,
      ],
      check: (c) =>
        all(
          formulasMatch(c, `Summary!B8:B${TBL_LAST}`, /(SUMIFS?|SUMPRODUCT)\(/i, 'SUMIFS'),
          valuesEqual(c, `Summary!B8:B${TBL_LAST}`, BY_USD, 'USD Exposure'),
          formulasMatch(c, `Summary!C8:C${TBL_LAST}`, /SUMPRODUCT\(/i, 'SUMPRODUCT'),
          valuesEqual(c, `Summary!C8:C${TBL_LAST}`, BY_RWA, 'RWA'),
          c.f(`Summary!B${TBL_LAST + 1}`).startsWith('=') && approx(c.v(`Summary!B${TBL_LAST + 1}`), TOTAL_USD, 1e-9) ? true : `B${TBL_LAST + 1} should total the exposure column.`,
          c.f(`Summary!B${TBL_LAST + 2}`).startsWith('=') && typeof c.v(`Summary!B${TBL_LAST + 2}`) === 'number' && Math.abs(c.v(`Summary!B${TBL_LAST + 2}`) as number) < 0.01
            ? true
            : `B${TBL_LAST + 2} should be a formula (total minus B3) that shows 0.`,
        ),
      solution: [
        {
          set: {
            [`Summary!B8:B${TBL_LAST}`]: `=SUMIFS(Positions!$G$2:$G$${LAST},Positions!$B$2:$B$${LAST},A8)`,
            [`Summary!C8:C${TBL_LAST}`]: `=SUMPRODUCT((Positions!$B$2:$B$${LAST}=A8)*Positions!$G$2:$G$${LAST}*Positions!$I$2:$I$${LAST})`,
            [`Summary!B${TBL_LAST + 1}`]: `=SUM(B8:B${TBL_LAST})`,
            [`Summary!B${TBL_LAST + 2}`]: `=B${TBL_LAST + 1}-B3`,
          },
        },
      ],
      xp: 35,
    },
    {
      id: 't8',
      title: 'Top 5 counterparties',
      instruction: `In **E8:F12** show the 5 counterparties with the largest USD exposure, largest first — name in E, exposure in F.

Two good ways:
- **Dynamic arrays:** one formula in E8: \`=TAKE(SORT(A8:B${TBL_LAST},2,-1),5)\`
- **Classic:** F8 \`=LARGE($B$8:$B$${TBL_LAST},1)\` (2, 3… down the rows), and E8 \`=INDEX($A$8:$A$${TBL_LAST},MATCH(F8,$B$8:$B$${TBL_LAST},0))\``,
      why: `"Who are our biggest exposures?" is the first question on every risk call. SORT by column 2 descending, then TAKE the first 5 rows, gives a live league table in one cell.

The LARGE + INDEX/MATCH route works in every Excel version (useful when your file goes to someone on Excel 2016). Its weakness: two counterparties with *identical* exposure would both MATCH the first one.`,
      hints: ['SORT(array, sort_index, sort_order): sort_index 2 = exposure column, sort_order -1 = descending.', `=TAKE(SORT(A8:B${TBL_LAST},2,-1),5) in E8.`],
      check: (c) =>
        all(
          c.f('Summary!E8').startsWith('=') ? true : 'E8 should be a formula (TAKE/SORT or INDEX/MATCH), not typed text.',
          valuesEqual(c, 'Summary!E8:E12', TOP5.map((x) => x.n), 'Top 5 names'),
          valuesEqual(c, 'Summary!F8:F12', TOP5.map((x) => x.v), 'Top 5 exposure'),
        ),
      solution: [{ set: { 'Summary!E8': `=TAKE(SORT(A8:B${TBL_LAST},2,-1),5)` } }],
      xp: 35,
    },
    {
      id: 't9',
      title: 'Format for the CRO',
      instruction: `Apply number formats:

- Thousands separator (Comma Style, [[Alt]] [[H]] [[K]]) on **Positions!G2:G${LAST}**, **Summary!B3:B4**, **Summary!B8:C${TBL_LAST + 2}** and **Summary!F8:F12**.
- Percent ([[Ctrl+Shift+%]]) on **Summary!B5** and on the risk weights **Positions!I2:I${LAST}**.`,
      why: `A CRO reads \`1,234,567,890.12\` as "1.2 billion" instantly; \`1234567890.12\` makes them count digits. Risk weights shown as 0.75 invite "is that 75% or 0.75%?" — percent format removes the ambiguity.`,
      hints: ['Select each range and press Alt, H, K.', 'Select B5 and Ctrl+Shift+% (and the same for Positions!I2:I61).'],
      check: (c) =>
        all(
          fmtHas(c, [...colCells('Positions', 'G', 2, LAST), 'Summary!B3', 'Summary!B4', ...colCells('Summary', 'B', 8, TBL_LAST + 2), ...colCells('Summary', 'C', 8, TBL_LAST), ...colCells('Summary', 'F', 8, 12)], /#,##0/, 'a thousands-separator format'),
          fmtHas(c, ['Summary!B5', ...colCells('Positions', 'I', 2, LAST)], /%/, 'a percent format'),
        ),
      solution: [
        { select: `Positions!G2:G${LAST}` },
        { cmd: 'fmt.comma' },
        { select: `Positions!I2:I${LAST}` },
        { cmd: 'fmt.percent' },
        { select: 'Summary!B3:B4' },
        { cmd: 'fmt.comma' },
        { select: `Summary!B8:C${TBL_LAST + 2}` },
        { cmd: 'fmt.comma' },
        { select: 'Summary!F8:F12' },
        { cmd: 'fmt.comma' },
        { select: 'Summary!B5' },
        { cmd: 'fmt.percent' },
      ],
      xp: 20,
    },
  ],
};
