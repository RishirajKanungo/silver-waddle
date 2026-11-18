import type { CheckCtx, Module } from '../types';
import { makeBook, customers, loans } from '../data';
import { all, valuesEqual } from '../runner';

// ---------- data ----------
// A loan tape with every non-current loan plus the first 20 current ones, in
// loan-number order: small enough to eyeball, but every DPD bucket shows up.
const allLoans = loans(customers(), 120, 11);
const firstCurrent = new Set(allLoans.filter((l) => l.dpd === 0).slice(0, 20).map((l) => l.id));
const tape = allLoans.filter((l) => l.dpd > 0 || firstCurrent.has(l.id));
const N = tape.length; // 50
const LAST = N + 1; // last data row

const tapeRows = (extra: string[]) => [
  ['Loan ID', 'Product', 'Branch', 'Balance', 'DPD', 'Status', ...extra],
  ...tape.map((l) => [l.id, l.product, l.branch, l.balance, l.dpd, l.status]),
];

const THRESH = 250000;
const NEW_THRESH = 300000;
// the colleague's broken formula points at the first "big" loan
const bigRow = tape.findIndex((l) => l.balance > 100000) + 2;

const bucket = (dpd: number) => (dpd === 0 ? 'Current' : dpd < 30 ? '1-29' : dpd < 60 ? '30-59' : dpd < 90 ? '60-89' : '90+');
const SECURED = new Set(['Mortgage', 'HELOC', 'Auto Loan']);

// ---------- covenant data (hand-made, $000s) ----------
type Cov = [string, number | '', number | '', number, string];
const COVS: Cov[] = [
  ['Acme Holdings', 12500, 2100, 38000, 'MFG'],
  ['Blue Harbor LLC', 4200, 2600, 21500, 'RET'],
  ['Cedar Logistics', 8800, 1900, 30100, 'TRN'],
  ['Delta Foods Inc', '', 1500, 18000, 'RET'],
  ['Evergreen Partners', 6100, 0, 9000, 'HLT'],
  ['Falcon Aerospace', 15300, 3400, 52000, 'MFG'],
  ['Granite Builders', 3900, 2200, 17800, 'CON'],
  ['Harbor Health', 9700, 1600, 24000, 'HLT'],
  ['Ironwood Capital', '', '', 40000, 'FIN'],
  ['Juniper Retail', 5200, 2900, 19500, 'RET'],
  ['Keystone Energy', 21000, 4100, 95000, 'ENR'],
  ['Lakeside Dental', 2400, 300, 6000, 'HLT'],
  ['Maple Tech', 7600, 0, 0, 'TEC'],
  ['Northwind Traders', 4800, 1200, 14000, 'RET'],
  ['Orion Media', 3100, 1700, 13500, 'TEC'],
];
const SECTORS: [string, string][] = [
  ['MFG', 'Manufacturing'],
  ['RET', 'Retail'],
  ['HLT', 'Healthcare'],
  ['TEC', 'Technology'],
  ['ENR', 'Energy'],
];
const CN = COVS.length;
const CLAST = CN + 1;
const leverage = COVS.map(([, e, , debt]) => (e === '' ? '' : debt / e));
const coverage = COVS.map(([, e, i]) => (e === '' ? '' : i === 0 || i === '' ? 'n/a' : e / i));
const covStatus = COVS.map((_, k) => {
  const g = leverage[k], h = coverage[k];
  if (g === '') return 'Pending';
  return g > 4 || (typeof h === 'number' && h < 2) ? 'BREACH' : 'OK';
});
const sectorOf = COVS.map(([, , , , code]) => SECTORS.find((s) => s[0] === code)?.[1] ?? 'Unmapped');

// ---------- check helpers ----------
/** Every cell in col[r1..r2] must be a formula that matches `re`. */
function formulas(c: CheckCtx, col: string, r1: number, r2: number, re: RegExp, msg: string, sheet = ''): true | string {
  for (let r = r1; r <= r2; r++) {
    const f = c.f(`${sheet}${col}${r}`);
    if (!f.startsWith('=')) return `${col}${r} needs a formula (it is ${f ? 'a typed value' : 'empty'}). Fill the formula down the whole column.`;
    if (!re.test(f)) return `${col}${r}: ${msg}`;
  }
  return true;
}

export const module: Module = {
  id: 'm05',
  title: 'Decisions with IF',
  level: 'Analyst',
  icon: '🔀',
  blurb: 'Comparison operators, IF, AND/OR/NOT, nested IF vs IFS, SWITCH and error-proofing — the logic behind every risk flag.',
  lessons: [
    // =====================================================================
    {
      id: 'm05-l1',
      title: 'Comparisons & your first IF',
      summary: 'TRUE/FALSE tests, IF with text results, blanks with "", and thresholds kept in a cell.',
      minutes: 9,
      featured: ['=', '<>', '>', '>=', 'IF', 'Ctrl+D'],
      intro: `Every risk flag at a bank starts with a **question that has a yes/no answer**: *is this loan past due? is the balance above the limit?* In Excel that question is a **comparison**, and it returns \`TRUE\` or \`FALSE\`.

- \`=\` equal, \`<>\` not equal
- \`>\` \`<\` \`>=\` \`<=\` greater / less (or equal)

\`=E2>0\` on its own already gives TRUE or FALSE. **IF** turns that answer into something readable:

\`=IF(test, value_if_true, value_if_false)\`

**Why a formula column instead of eyeballing or filtering?** Because the tape is refreshed every month. A formula re-decides every row automatically, it is auditable (anyone can click the cell and read the rule), and you can filter, count and pivot on it.

**Rules that trip people up:**
- Text goes in quotes: \`F2="Delinquent"\`. Text comparisons ignore case.
- Numbers do **not** go in quotes. \`D2>"100000"\` compares a number to *text*, and Excel always ranks text above numbers — so it is FALSE for every loan, silently.
- \`""\` (two quotes) means "empty text". Returning \`""\` keeps a flag column clean: only the rows that matter show anything.
- Never bury a policy number inside 50 formulas. Put the threshold in **one cell**, lock it with \`$\` (\`$L$1\`), and when credit policy changes you edit one cell.`,
      workbooks: () => [
        makeBook('Loan_Tape_Flags.xlsx', [
          {
            name: 'Tape',
            rows: [
              ...tapeRows(['Past Due?', 'Size Band', 'Watch List']).map((r, i) =>
                i === 0 ? [...r, '', 'Large balance threshold', THRESH] : i === 2 ? [...r, '', '', '', '', `Spot check: is row ${bigRow} big?`, `=IF(D${bigRow}>"100000","Big","Small")`] : r,
              ),
            ],
            widths: [100, 110, 80, 110, 60, 100, 90, 90, 90, 20, 190, 110],
            formats: { 3: '#,##0.00' },
            freeze: true,
            styles: { K1: { b: true }, L1: { fmt: '#,##0', fill: '#FFF2CC' }, K3: { i: true } },
          },
        ]),
      ],
      start: { cell: 'G2' },
      tasks: [
        {
          id: 't1',
          title: 'A bare comparison',
          instruction: `In **G2** type \`=E2>0\` and press [[Enter]]. Then copy it down to **G${LAST}**: select G2:G${LAST} and press [[Ctrl+D]] (or double-click the fill handle).

You should see TRUE for loans with days past due, FALSE for the rest.`,
          why: 'A comparison is the atom of every decision formula. Seeing raw TRUE/FALSE first makes it obvious what IF will be reacting to — and TRUE/FALSE columns are perfectly usable on their own: you can filter on them, and they count as 1/0 in maths.',
          hints: ['Start with = so Excel knows it is a formula, not text.', 'E2 is the DPD (days past due) column.', `=E2>0, then select G2:G${LAST} and Ctrl+D.`],
          check: (c) => all(formulas(c, 'G', 2, LAST, /E\d+/i, 'the test should look at the DPD in column E.'), valuesEqual(c, `G2:G${LAST}`, tape.map((l) => l.dpd > 0), 'Past Due?')),
          solution: [{ set: { [`G2:G${LAST}`]: '=E2>0' } }],
          explain: '`=E2>0` asks "is DPD greater than zero?" for each row; filling down shifts E2 to E3, E4… automatically.',
        },
        {
          id: 't2',
          title: 'IF with a threshold cell',
          instruction: `Credit policy says a balance of **${THRESH.toLocaleString()} or more** is a "Large" exposure. The threshold lives in **L1**.

In **H2** write \`=IF(D2>=$L$1,"Large","Standard")\` and fill it down to H${LAST}.`,
          why: 'Referencing L1 instead of typing 250000 into every formula means the rule is visible, documented and changeable in one place. The $ signs lock the reference so it still points at L1 after you fill down — without them, row 3 would look at L2, row 4 at L3…',
          hints: ['Three parts: the test, what to show if TRUE, what to show if FALSE.', 'Press F4 right after typing L1 to add the $ signs.', '=IF(D2>=$L$1,"Large","Standard")'],
          check: (c) =>
            all(
              formulas(c, 'H', 2, LAST, /^=IF\(/i, 'use an IF formula.'),
              formulas(c, 'H', 2, LAST, /\$L\$1/i, 'point at the threshold cell as $L$1 (locked), not a typed number.'),
              valuesEqual(c, `H2:H${LAST}`, tape.map((l) => (l.balance >= THRESH ? 'Large' : 'Standard')), 'Size Band'),
            ),
          solution: [{ set: { [`H2:H${LAST}`]: '=IF(D2>=$L$1,"Large","Standard")' } }],
        },
        {
          id: 't3',
          title: 'Show only what matters with ""',
          instruction: `Build a watch list in column **I**: show \`Watch\` when the Status is anything other than Current, and leave the cell looking empty otherwise.

In **I2**: \`=IF(F2<>"Current","Watch","")\` — then fill down to I${LAST}.`,
          why: '`""` is empty text: the cell looks blank, so your eye goes straight to the rows that need attention. `<>` means "not equal" — testing for "not Current" also catches any new status code the system invents next year (e.g. "Restructured"), which a list of named statuses would miss.',
          hints: ['<> is the "not equal to" operator.', 'Two double-quotes with nothing between them = empty text.', '=IF(F2<>"Current","Watch","")'],
          check: (c) => all(formulas(c, 'I', 2, LAST, /^=IF\(/i, 'use an IF formula.'), valuesEqual(c, `I2:I${LAST}`, tape.map((l) => (l.status !== 'Current' ? 'Watch' : '')), 'Watch List')),
          solution: [{ set: { [`I2:I${LAST}`]: '=IF(F2<>"Current","Watch","")' } }],
        },
        {
          id: 't4',
          title: 'Policy changed? Edit one cell',
          instruction: `Credit policy just raised the large-exposure limit to **${NEW_THRESH.toLocaleString()}**. Change **L1** to \`${NEW_THRESH}\` and watch column H re-decide every loan instantly.`,
          why: 'This is the payoff of keeping assumptions in cells. In a real model you would also label the cell and colour it as an input (yellow here) so reviewers know it is meant to be changed.',
          hints: ['Click L1 and type the new number — no need to touch column H.'],
          check: (c) =>
            all(
              c.v('L1') === NEW_THRESH ? true : `L1 should be ${NEW_THRESH}.`,
              valuesEqual(c, `H2:H${LAST}`, tape.map((l) => (l.balance >= NEW_THRESH ? 'Large' : 'Standard')), 'Size Band'),
            ),
          solution: [{ set: { L1: String(NEW_THRESH) } }],
        },
        {
          id: 't5',
          title: "Fix a colleague's quoted number",
          instruction: `**L3** holds a colleague's spot check: \`=IF(D${bigRow}>"100000","Big","Small")\`. Loan in row ${bigRow} has a balance well over 100,000, yet it says **Small**. Fix the formula so it says **Big**.`,
          why: 'With quotes, "100000" is text. Excel ranks every number below every piece of text, so the test is FALSE for all loans — no error, just a wrong answer. Silent bugs like this are the most dangerous kind in a risk report.',
          hints: ['Look closely at the 100000 — what is around it?', 'Remove the double quotes around the number.', `=IF(D${bigRow}>100000,"Big","Small")`],
          check: (c) =>
            all(
              c.f('L3').startsWith('=') ? true : 'L3 should still be a formula.',
              /"100000"/.test(c.f('L3')) ? 'The 100000 is still in quotes — that makes it text.' : true,
              c.v('L3') === 'Big' ? true : `L3 should now say Big (D${bigRow} is above 100,000).`,
            ),
          solution: [{ set: { L3: `=IF(D${bigRow}>100000,"Big","Small")` } }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm05-l2',
      title: 'AND, OR, NOT, nested IF vs IFS & SWITCH',
      summary: 'Combine conditions for risk flags, bucket DPD two ways, and map codes with SWITCH.',
      minutes: 12,
      featured: ['AND', 'OR', 'NOT', 'IFS', 'SWITCH'],
      intro: `Real policies have more than one condition.

- \`AND(a, b, …)\` is TRUE only if **every** test is TRUE. *Delinquent AND balance > 100k.*
- \`OR(a, b, …)\` is TRUE if **any** test is TRUE. *DPD ≥ 30 OR balance > 400k.*
- \`NOT(x)\` flips TRUE↔FALSE. Handy for "everything except…".

They go **inside** IF as the test: \`=IF(AND(F2="Delinquent",D2>100000),"FLAG","")\`.

**Buckets: nested IF vs IFS.** Days-past-due buckets (Current, 1-29, 30-59, 60-89, 90+) drive provisioning and regulatory reporting. A nested IF puts one IF inside the next one's FALSE slot. Excel checks the tests **in order and stops at the first TRUE** — so order matters:
- ✗ \`IF(E2>0,"1-29",IF(E2>=30,"30-59",…))\` puts a 75-DPD loan in "1-29", because E2>0 was already TRUE.
- ✓ Either go **up** from the bottom with \`<\` (\`E2<30\`, \`E2<60\`…) or **down** from the top with \`>=\` (\`E2>=90\`, \`E2>=60\`…).

**IFS** does the same thing without the nesting: pairs of *test, result*, and a final \`TRUE, "…"\` as the catch-all "else". Easier to read and to audit.

**SWITCH** is for exact matches on one value — mapping codes to labels: \`=SWITCH(B2,"Mortgage","Secured","HELOC","Secured","Unsecured")\`. The last unpaired argument is the default.`,
      workbooks: () => [
        makeBook('Loan_Tape_Risk.xlsx', [
          {
            name: 'Tape',
            rows: tapeRows(['High-Risk', 'Review', 'DPD Bucket', 'Bucket (IFS)', 'Secured?', 'Performing?']),
            widths: [100, 110, 80, 110, 60, 100, 80, 80, 90, 100, 90, 100],
            formats: { 3: '#,##0.00' },
            freeze: true,
          },
        ]),
      ],
      start: { cell: 'G2' },
      tasks: [
        {
          id: 't1',
          title: 'AND: delinquent and big',
          instruction: `Risk wants every loan that is **Delinquent AND has a balance over 100,000** flagged for the weekly credit committee.

In **G2**: \`=IF(AND(F2="Delinquent",D2>100000),"FLAG","")\`, then fill down to G${LAST}.`,
          why: 'Each condition alone is noisy: there are many small delinquent credit cards and many large current mortgages. The combination — big AND already slipping — is where losses come from, so that is what the committee wants to see.',
          hints: ['AND( ) takes the two tests separated by a comma.', 'The AND goes in the first slot of IF.', '=IF(AND(F2="Delinquent",D2>100000),"FLAG","")'],
          check: (c) =>
            all(
              formulas(c, 'G', 2, LAST, /AND\(/i, 'use AND( ) to combine both tests.'),
              valuesEqual(c, `G2:G${LAST}`, tape.map((l) => (l.status === 'Delinquent' && l.balance > 100000 ? 'FLAG' : '')), 'High-Risk'),
            ),
          solution: [{ set: { [`G2:G${LAST}`]: '=IF(AND(F2="Delinquent",D2>100000),"FLAG","")' } }],
        },
        {
          id: 't2',
          title: 'OR: either trigger means review',
          instruction: `A loan goes to annual **Review** if it is **30+ days past due OR its balance is over 400,000**.

In **H2**: \`=IF(OR(E2>=30,D2>400000),"Review","")\`, fill down to H${LAST}.`,
          why: 'OR is how you encode "any of these triggers". Typical bank review triggers: arrears, size, a rating downgrade, a covenant breach. Each trigger is one argument of OR, so adding a new one later is easy.',
          hints: ['OR( ) is TRUE if at least one test is TRUE.', '>= means "greater than or equal to".', '=IF(OR(E2>=30,D2>400000),"Review","")'],
          check: (c) =>
            all(
              formulas(c, 'H', 2, LAST, /OR\(/i, 'use OR( ) to combine the two triggers.'),
              valuesEqual(c, `H2:H${LAST}`, tape.map((l) => (l.dpd >= 30 || l.balance > 400000 ? 'Review' : '')), 'Review'),
            ),
          solution: [{ set: { [`H2:H${LAST}`]: '=IF(OR(E2>=30,D2>400000),"Review","")' } }],
        },
        {
          id: 't3',
          title: 'DPD buckets with nested IF',
          instruction: `Bucket each loan by DPD: **Current** (0), **1-29**, **30-59**, **60-89**, **90+**.

In **I2** build a nested IF that climbs up from the bottom:

\`=IF(E2=0,"Current",IF(E2<30,"1-29",IF(E2<60,"30-59",IF(E2<90,"60-89","90+"))))\`

Fill down to I${LAST}.`,
          why: 'Each IF only runs if every test before it was FALSE. So by the time Excel asks E2<60, it already knows E2 is at least 30 — you never need to write "between 30 and 59". Getting the order wrong is the #1 bucket bug; check a few rows by eye (e.g. a 75-DPD loan should say 60-89).',
          hints: ['Count your brackets: four IFs need four closing brackets at the end.', 'Order matters: test the smallest bucket first when using <.', 'Copy the formula from the instruction exactly, then Ctrl+D.'],
          check: (c) =>
            all(
              formulas(c, 'I', 2, LAST, /IF\(.*IF\(/i, 'use a nested IF (an IF inside another IF).'),
              valuesEqual(c, `I2:I${LAST}`, tape.map((l) => bucket(l.dpd)), 'DPD Bucket'),
            ),
          solution: [{ set: { [`I2:I${LAST}`]: '=IF(E2=0,"Current",IF(E2<30,"1-29",IF(E2<60,"30-59",IF(E2<90,"60-89","90+"))))' } }],
        },
        {
          id: 't4',
          title: 'The same buckets with IFS',
          instruction: `Now write the same logic with **IFS**, working down from the top. In **J2**:

\`=IFS(E2>=90,"90+",E2>=60,"60-89",E2>=30,"30-59",E2>0,"1-29",TRUE,"Current")\`

Fill down to J${LAST}. Columns I and J should match row for row.`,
          why: 'IFS reads like a policy document: condition, result, condition, result. The final TRUE is the catch-all "otherwise" — without it, a row that matches nothing returns #N/A. Building the same thing two ways and comparing them is also a classic self-check.',
          hints: ['IFS takes pairs: test1, result1, test2, result2…', 'Finish with TRUE,"Current" so every row gets an answer.', 'Copy the formula from the instruction, then fill down.'],
          check: (c) =>
            all(
              formulas(c, 'J', 2, LAST, /IFS\(/i, 'use IFS( ).'),
              valuesEqual(c, `J2:J${LAST}`, tape.map((l) => bucket(l.dpd)), 'Bucket (IFS)'),
            ),
          solution: [{ set: { [`J2:J${LAST}`]: '=IFS(E2>=90,"90+",E2>=60,"60-89",E2>=30,"30-59",E2>0,"1-29",TRUE,"Current")' } }],
        },
        {
          id: 't5',
          title: 'Map products with SWITCH',
          instruction: `Collateral matters for loss severity. In **K2**, label Mortgage, HELOC and Auto Loan as **Secured** and everything else as **Unsecured**:

\`=SWITCH(B2,"Mortgage","Secured","HELOC","Secured","Auto Loan","Secured","Unsecured")\`

Fill down to K${LAST}.`,
          why: 'SWITCH compares ONE value against a list of exact matches — perfect for code-to-label mappings. The lone last argument is the default; leave it out and any unexpected product becomes #N/A (which can be useful as an alarm). For long mappings, a lookup table (coming later) is easier to maintain.',
          hints: ['First argument = the cell you are testing (B2).', 'Then value, result pairs; finish with the default.'],
          check: (c) =>
            all(
              formulas(c, 'K', 2, LAST, /SWITCH\(/i, 'use SWITCH( ).'),
              valuesEqual(c, `K2:K${LAST}`, tape.map((l) => (SECURED.has(l.product) ? 'Secured' : 'Unsecured')), 'Secured?'),
            ),
          solution: [{ set: { [`K2:K${LAST}`]: '=SWITCH(B2,"Mortgage","Secured","HELOC","Secured","Auto Loan","Secured","Unsecured")' } }],
        },
        {
          id: 't6',
          title: 'NOT: performing loans',
          instruction: `A loan is **performing** unless it is on Non-Accrual. In **L2** write \`=NOT(F2="Non-Accrual")\` and fill down to L${LAST}.`,
          why: 'NOT flips a test. It reads naturally when the rule is defined as an exception ("everything except Non-Accrual"). `=F2<>"Non-Accrual"` gives the same answer — use whichever reads more clearly to the next person.',
          hints: ['NOT( ) wraps the test you want to reverse.', '=NOT(F2="Non-Accrual")'],
          check: (c) =>
            all(
              formulas(c, 'L', 2, LAST, /NOT\(/i, 'use NOT( ).'),
              valuesEqual(c, `L2:L${LAST}`, tape.map((l) => l.status !== 'Non-Accrual'), 'Performing?'),
            ),
          solution: [{ set: { [`L2:L${LAST}`]: '=NOT(F2="Non-Accrual")' } }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm05-l3',
      title: 'Error-proofing: blanks, IFERROR & IFNA',
      summary: 'Covenant tests that survive missing financials, zero interest and unmapped codes.',
      minutes: 11,
      featured: ['IFERROR', 'IFNA', '""', 'OR'],
      intro: `Covenant monitoring: commercial borrowers promise to keep **Leverage** (Debt ÷ EBITDA) at or below **4.0x** and **Interest Coverage** (EBITDA ÷ Interest) at or above **2.0x**. Breaches go to the credit committee, so the sheet must be right *and* clean.

Real data breaks naive formulas:
- **Financials not received yet** → EBITDA is blank. \`=D2/B2\` gives #DIV/0!, and \`=B2/C2\` gives **0** — which looks like a terrible breach. Test for the blank first: \`=IF(B2="","",D2/B2)\`.
- **No interest expense** (debt-free borrower) → division by zero. \`IFERROR(x, alt)\` returns *alt* when *x* is any error.
- **Unknown codes** in a lookup → #N/A. \`IFNA(x, alt)\` catches **only** #N/A.

**Why not wrap everything in IFERROR?** Because it also hides the errors you *want* to see: a #REF! from a deleted column, a #VALUE! from text in a number field. IFERROR turns a broken model into a quietly wrong one. Prefer: test for the specific situation (blank) → IFNA for lookups → IFERROR only around the one calculation that can legitimately fail.

Amounts are in **$000s**.`,
      workbooks: () => [
        makeBook('Covenant_Monitor.xlsx', [
          {
            name: 'Covenants',
            rows: [
              ['Borrower', 'EBITDA', 'Interest Exp', 'Total Debt', 'Sector Code', 'Sector', 'Leverage (x)', 'Coverage (x)', 'Covenant Status', '', '', 'Code', 'Sector'],
              ...COVS.map(([n, e, i, debt, code], k) => [n, e, i, debt, code, `=VLOOKUP(E${k + 2},$L$2:$M$6,2,FALSE)`, '', '', '', '', '', SECTORS[k]?.[0] ?? '', SECTORS[k]?.[1] ?? '']),
            ],
            widths: [150, 80, 90, 90, 90, 110, 100, 100, 120, 20, 20, 60, 110],
            formats: { 1: '#,##0', 2: '#,##0', 3: '#,##0' },
            styles: Object.fromEntries(
              Array.from({ length: CN }, (_, k) => [
                [`G${k + 2}`, { fmt: '0.00' }],
                [`H${k + 2}`, { fmt: '0.00' }],
              ]).flat(),
            ),
          },
        ]),
      ],
      start: { cell: 'G2' },
      tasks: [
        {
          id: 't1',
          title: 'Leverage that respects blanks',
          instruction: `Leverage = Total Debt ÷ EBITDA. Two borrowers (Delta Foods, Ironwood) have not sent financials, so EBITDA is blank.

In **G2**: \`=IF(B2="","",D2/B2)\` — fill down to G${CLAST}.`,
          why: 'Testing for the blank first states the business rule out loud: "no financials, no ratio". The cell stays empty instead of showing #DIV/0!, and a reviewer can see exactly why.',
          hints: ['B2="" is TRUE when B2 is empty.', 'If blank, return "" — otherwise do the division.', '=IF(B2="","",D2/B2)'],
          check: (c) => all(formulas(c, 'G', 2, CLAST, /D\d+\s*\/\s*B\d+/i, 'divide Total Debt (D) by EBITDA (B).'), valuesEqual(c, `G2:G${CLAST}`, leverage, 'Leverage')),
          solution: [{ set: { [`G2:G${CLAST}`]: '=IF(B2="","",D2/B2)' } }],
        },
        {
          id: 't2',
          title: 'Coverage with IFERROR',
          instruction: `Coverage = EBITDA ÷ Interest. Evergreen and Maple Tech pay **no interest**, so the division fails.

In **H2**: \`=IF(B2="","",IFERROR(B2/C2,"n/a"))\` — fill down to H${CLAST}.`,
          why: 'Two different situations, two different answers: missing financials → blank (still waiting), zero interest → "n/a" (ratio genuinely does not apply). Without the blank test, Delta Foods would show 0.00x coverage — a fake breach that wastes the committee\'s time.',
          hints: ['IFERROR(calculation, what to show instead).', 'Keep the blank test from G on the outside.', '=IF(B2="","",IFERROR(B2/C2,"n/a"))'],
          check: (c) => all(formulas(c, 'H', 2, CLAST, /IFERROR\(/i, 'wrap the division in IFERROR( ).'), valuesEqual(c, `H2:H${CLAST}`, coverage, 'Coverage')),
          solution: [{ set: { [`H2:H${CLAST}`]: '=IF(B2="","",IFERROR(B2/C2,"n/a"))' } }],
        },
        {
          id: 't3',
          title: 'Covenant breach flag',
          instruction: `Now the verdict. In **I2**:

\`=IF(G2="","Pending",IF(OR(G2>4,H2<2),"BREACH","OK"))\`

Fill down to I${CLAST}. A breach of **either** covenant is a breach.`,
          why: 'OR captures "either test fails". Notice what happens for "n/a" coverage: text always ranks above numbers, so "n/a"<2 is FALSE — a debt-free borrower cannot breach coverage, which is the right answer. "Pending" makes missing financials visible as a to-do instead of silently passing.',
          hints: ['Outer IF handles the blank leverage first.', 'Inner IF uses OR(leverage too high, coverage too low).', '=IF(G2="","Pending",IF(OR(G2>4,H2<2),"BREACH","OK"))'],
          check: (c) => all(formulas(c, 'I', 2, CLAST, /OR\(/i, 'use OR( ) to test both covenants.'), valuesEqual(c, `I2:I${CLAST}`, covStatus, 'Covenant Status')),
          solution: [{ set: { [`I2:I${CLAST}`]: '=IF(G2="","Pending",IF(OR(G2>4,H2<2),"BREACH","OK"))' } }],
        },
        {
          id: 't4',
          title: 'IFNA for unmapped codes',
          instruction: `Column **F** already looks up the sector name from the code table in L:M (you will build lookups yourself in a later module). Some codes are not in the table, so they show **#N/A**.

Edit **F2** to \`=IFNA(VLOOKUP(E2,$L$2:$M$6,2,FALSE),"Unmapped")\` and fill down to F${CLAST}.`,
          why: '#N/A from a lookup means "not found" — a data issue you want labelled, not a crash. IFNA catches only that. If someone deletes column M, the formula still shows #REF! loudly instead of a misleading "Unmapped". That selectivity is why IFNA beats IFERROR around lookups.',
          hints: ['Press F2 on F2, then add IFNA( after the = sign and ,"Unmapped") at the end.', 'Fill down with Ctrl+D after selecting F2:F' + CLAST + '.'],
          check: (c) => all(formulas(c, 'F', 2, CLAST, /IFNA\(/i, 'wrap the VLOOKUP in IFNA( ).'), valuesEqual(c, `F2:F${CLAST}`, sectorOf, 'Sector')),
          solution: [{ set: { [`F2:F${CLAST}`]: '=IFNA(VLOOKUP(E2,$L$2:$M$6,2,FALSE),"Unmapped")' } }],
        },
      ],
    },
  ],
  quiz: [
    {
      kind: 'mc',
      q: 'D2 holds the number 250000. What does =IF(D2>"100000","Big","Small") return?',
      options: ['Big', 'Small', '#VALUE!', 'TRUE'],
      answer: 1,
      explain: '"100000" in quotes is text, and Excel ranks all text above all numbers, so D2>"100000" is FALSE. Never put numbers in quotes.',
    },
    {
      kind: 'formula',
      q: 'Return "FLAG" when the loan is Delinquent AND the balance is over 100,000, otherwise "".',
      grid: [
        ['Loan', 'Status', 'Balance'],
        ['LN-1', 'Delinquent', 180000],
      ],
      at: 'D2',
      expect: 'FLAG',
      model: '=IF(AND(B2="Delinquent",C2>100000),"FLAG","")',
      explain: 'AND inside IF: both tests must be TRUE.',
      mustUse: ['IF', 'AND'],
    },
    {
      kind: 'mc',
      q: 'A loan has 75 DPD. What does =IF(E2>0,"1-29",IF(E2>=30,"30-59","60+")) return?',
      options: ['1-29', '30-59', '60+', '#N/A'],
      answer: 0,
      explain: 'Excel stops at the first TRUE test. E2>0 is already TRUE, so the later buckets are never reached. Test from the top with >= or from the bottom with <.',
    },
    {
      kind: 'formula',
      q: 'Bucket the DPD in B2 with IFS: 90+, 60-89, 30-59, 1-29, otherwise Current.',
      grid: [
        ['Loan', 'DPD'],
        ['LN-2', 75],
      ],
      at: 'C2',
      expect: '60-89',
      model: '=IFS(B2>=90,"90+",B2>=60,"60-89",B2>=30,"30-59",B2>0,"1-29",TRUE,"Current")',
      explain: 'IFS checks pairs in order; TRUE at the end is the catch-all.',
      mustUse: ['IFS'],
    },
    {
      kind: 'formula',
      q: 'Interest coverage = EBITDA ÷ Interest, but show "n/a" if the division fails.',
      grid: [
        ['Borrower', 'EBITDA', 'Interest'],
        ['Maple Tech', 7600, 0],
      ],
      at: 'D2',
      expect: 'n/a',
      model: '=IFERROR(B2/C2,"n/a")',
      explain: 'IFERROR returns the second argument when the first is any error (here #DIV/0!).',
      mustUse: ['IFERROR'],
    },
    {
      kind: 'mc',
      q: 'Why wrap a lookup in IFNA rather than IFERROR?',
      options: [
        'IFNA is faster to type',
        'IFNA only catches #N/A ("not found"), so real bugs like #REF! still show',
        'IFERROR does not work with lookups',
        'IFNA also fixes #DIV/0!',
      ],
      answer: 1,
      explain: 'IFERROR hides every error, including broken references. IFNA handles the expected "not found" case and leaves genuine mistakes visible.',
    },
    {
      kind: 'formula',
      q: 'Use SWITCH to return "Secured" for Mortgage or HELOC, otherwise "Unsecured".',
      grid: [
        ['Loan', 'Product'],
        ['LN-3', 'HELOC'],
      ],
      at: 'C2',
      expect: 'Secured',
      model: '=SWITCH(B2,"Mortgage","Secured","HELOC","Secured","Unsecured")',
      explain: 'SWITCH matches one value against exact options; the final lone argument is the default.',
      mustUse: ['SWITCH'],
    },
    {
      kind: 'mc',
      q: 'EBITDA is missing for a borrower. Why return "" instead of 0 for its leverage ratio?',
      options: [
        '"" is shorter',
        '0 would look like a real (excellent) ratio and would be counted in averages; "" looks blank and AVERAGE ignores it',
        'Excel cannot divide by blank cells',
        'There is no difference',
      ],
      answer: 1,
      explain: 'A fake 0 is data. Empty text says "no value yet" and is skipped by AVERAGE, MIN, etc.',
    },
    { kind: 'keys', q: 'You typed a flag formula in G2 and selected G2:G51. Copy it down.', cmd: 'fill.down', keys: 'Ctrl+D', explain: 'Ctrl+D fills the top cell of the selection down; relative references shift row by row.' },
    { kind: 'keys', q: 'Show every formula on the sheet so you can audit the flag logic.', cmd: 'view.formulas', keys: 'Ctrl+`', explain: 'Ctrl+` (grave accent) toggles formula view — great for spotting a hard-coded number in a column of formulas.' },
  ],
};
