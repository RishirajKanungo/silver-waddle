import type { Lesson, CheckCtx } from '../types';
import { makeBook, rng, pick, between, round2, d, BRANCHES, REGIONS } from '../data';
import { all, fmtScalar, formulasMatch, valuesEqual } from '../runner';

// ---------------------------------------------------------------------------
// A raw "customer balances" extract from the data lake, exported the way lake
// jobs love to export things:
//   - IDs as zero-padded TEXT, some with trailing spaces
//   - names in random case with stray spaces
//   - Branch only printed on the first row of each group (report-style)
//   - dates as yyyymmdd TEXT
//   - 5 duplicate rows (a partition was double-loaded) that only look
//     identical AFTER cleaning
//   - planted invalid records: 3 missing balances, 2 impossible dates (2042),
//     2 rows on a branch code that doesn't exist in the branch reference
// ---------------------------------------------------------------------------

const FIRST = ['james', 'maria', 'wei', 'aisha', 'carlos', 'priya', 'john', 'elena', 'kwame', 'sofia', 'liam', 'yuki', 'omar', 'grace', 'diego', 'hannah', 'raj', 'chloe', 'ivan', 'fatima'];
const LAST_NAMES = ['smith', 'garcia', 'chen', 'khan', 'lopez', 'patel', 'johnson', 'rossi', 'mensah', 'silva', 'brown', 'tanaka', 'haddad', 'kim', 'martinez', 'muller', 'singh', 'dubois', 'petrov', 'ali'];
const EXTRACT_DATE = d(2024, 6, 30);
const BRANCH_NAMES: Record<string, string> = {
  'NYC-01': 'Manhattan Midtown', 'NYC-02': 'Brooklyn Heights', 'BOS-01': 'Boston Back Bay', 'ATL-01': 'Atlanta Peachtree', 'MIA-01': 'Miami Brickell',
  'CHI-01': 'Chicago Loop', 'DAL-01': 'Dallas Uptown', 'PHX-01': 'Phoenix Central', 'SFO-01': 'San Francisco FiDi', 'SEA-01': 'Seattle Downtown',
};
const BRANCH_REGION: Record<string, string> = {
  'NYC-01': REGIONS[0], 'NYC-02': REGIONS[0], 'BOS-01': REGIONS[0], 'ATL-01': REGIONS[1], 'MIA-01': REGIONS[1],
  'CHI-01': REGIONS[2], 'DAL-01': REGIONS[4], 'PHX-01': REGIONS[4], 'SFO-01': REGIONS[3], 'SEA-01': REGIONS[3],
};

const proper = (s: string) => s.toLowerCase().replace(/(^|[^a-z])([a-z])/g, (_, a, b) => a + b.toUpperCase());
const trim = (s: string) => s.replace(/ +/g, ' ').trim();
const ymdText = (y: number, m: number, dd: number) => `${y}${String(m).padStart(2, '0')}${String(dd).padStart(2, '0')}`;

interface Rec { id: number; first: string; last: string; branch: string; y: number; m: number; dd: number; bal: number | null }

function messName(r: () => number, first: string, last: string) {
  const styles = [
    () => `${first} ${last}`,
    () => `${first.toUpperCase()} ${last.toUpperCase()}`,
    () => `  ${first} ${last.toUpperCase()}`,
    () => `${proper(first)}  ${last} `,
    () => `${first.toUpperCase()} ${proper(last)}  `,
  ];
  return pick(r, styles)();
}

const r = rng(3030);
const recs: Rec[] = [];
for (let i = 0; i < 50; i++) {
  recs.push({
    id: 104000 + i * 53 + between(r, 0, 40),
    first: pick(r, FIRST),
    last: pick(r, LAST_NAMES),
    branch: i === 13 || i === 37 ? 'TMP-00' : pick(r, BRANCHES),
    y: between(r, 2009, 2024),
    m: between(r, 1, 12),
    dd: between(r, 1, 28),
    bal: round2(between(r, 100, 250000) + r()),
  });
}
// planted invalid records (indices are into `recs`, chosen not to overlap)
for (const i of [5, 22, 41]) recs[i].bal = null;
for (const i of [9, 30]) recs[i].y = 2042;
recs.forEach((x) => {
  if (x.y === 2024 && x.m > 6) x.m = 6; // nothing legit after the extract date
});
recs.sort((a, b) => (a.branch < b.branch ? -1 : a.branch > b.branch ? 1 : a.id - b.id));

const DUP_OF = new Set<number>(); // ids that get a duplicate row
{
  const ok = recs.filter((x) => x.bal !== null && x.y !== 2042 && x.branch !== 'TMP-00');
  for (const k of [2, 11, 19, 27, 36]) DUP_OF.add(ok[k].id);
}

interface RawRow { id: string; name: string; branch: string; date: string; bal: number | null; rec: Rec; dup: boolean }
const rawRows: RawRow[] = [];
{
  const r2 = rng(77);
  let prevBranch = '';
  for (const x of recs) {
    const pad = String(x.id).padStart(8, '0');
    rawRows.push({ id: pad + (r2() < 0.3 ? ' ' : ''), name: messName(r2, x.first, x.last), branch: x.branch === prevBranch ? '' : x.branch, date: ymdText(x.y, x.m, x.dd), bal: x.bal, rec: x, dup: false });
    prevBranch = x.branch;
    if (DUP_OF.has(x.id)) rawRows.push({ id: pad + '  ', name: messName(r2, x.first, x.last), branch: '', date: ymdText(x.y, x.m, x.dd), bal: x.bal, rec: x, dup: true });
  }
}
const RAW_N = rawRows.length; // 55 -> rows 2..56
const RAW_LAST = RAW_N + 1;

const branchSet = new Set<string>(BRANCHES);
const flagOf = (x: Rec) => (x.bal === null ? 'Missing balance' : x.y === 2042 ? 'Bad date' : !branchSet.has(x.branch) ? 'Unknown branch' : 'OK');
const serialOf = (x: Rec) => d(x.y, x.m, x.dd);

// expected values per raw row (before de-duplication)
const PRE = {
  id: rawRows.map((x) => x.rec.id),
  name: rawRows.map((x) => proper(trim(x.name))),
  branch: rawRows.map((x) => x.rec.branch),
  date: rawRows.map((x) => serialOf(x.rec)),
  bal: rawRows.map((x) => x.rec.bal),
  flag: rawRows.map((x) => flagOf(x.rec)),
};
const UNIQ = rawRows.filter((x) => !x.dup).map((x) => x.rec);
const UNIQ_N = UNIQ.length; // 50
const BLANK_BRANCHES = rawRows.filter((x) => x.branch === '').length;
const INVALID = UNIQ.filter((x) => flagOf(x) !== 'OK').length;

const rawBook = () =>
  makeBook('Lake_Extract.xlsx', [
    {
      name: 'Raw',
      rows: [
        ['cust_id', 'cust_name', 'branch_cd', 'open_dt', 'ledger_bal'],
        // leading apostrophe = stored as text, exactly like a CSV import keeps it
        ...rawRows.map((x) => ["'" + x.id, x.name, x.branch, "'" + x.date, x.bal]),
      ],
      widths: [100, 170, 90, 90, 100],
    },
  ]);

const refBook = () =>
  makeBook('Branch_Ref.xlsx', [
    {
      name: 'Branches',
      rows: [['Branch Code', 'Branch Name', 'Region'], ...BRANCHES.map((b) => [b, BRANCH_NAMES[b], BRANCH_REGION[b]])],
      widths: [100, 170, 100],
    },
  ]);

const needSheet = (c: CheckCtx, name: string) => (c.sheet(name) ? true : `Add a sheet named "${name}" to Lake_Extract.xlsx first.`);
const refsRaw = (c: CheckCtx, ref: string) => {
  const bad = c.inputs(ref).findIndex((x) => !/raw!/i.test(x));
  return bad < 0 ? true : `The formulas in ${ref} should read from the Raw sheet (cell #${bad + 1} doesn't).`;
};
const C_HEAD = ['Cust ID', 'Name', 'Branch', 'Open Date', 'Balance', 'DQ Flag'];

export const project: Lesson = {
  id: 'p3-data-cleanup',
  kind: 'project',
  title: 'Data-Lake Extract Cleanup',
  summary: 'Turn a messy lake extract into a tidy table with formulas, freeze it with Paste Values, de-duplicate and report data quality.',
  minutes: 35,
  featured: ['TRIM', 'PROPER', 'VALUE', 'DATE', 'LEFT', 'MID', 'RIGHT', 'COUNTIF', 'COUNTBLANK', 'Alt H V V', 'Alt A M'],
  intro: `**From:** Priya Raman, Data Governance Lead
**To:** you
**Subject:** Lake extract for the balances migration — can you clean it?

Hi — the customer-balance extract from the lake (\`dl_core.cust_balances\`, as of **30 Jun 2024**) is in **Lake_Extract.xlsx** and it's… a typical lake extract:

- \`cust_id\` came through as **text** with leading zeros and stray trailing spaces, so it won't match anything numeric.
- Names are in random CASE with extra spaces.
- \`branch_cd\` is only printed on the **first row of each branch** — the rows below are blank.
- \`open_dt\` is **yyyymmdd text**, not a real date.
- The job double-loaded a partition, so there are **duplicates** — but they only look identical *after* you clean them.

**Branch_Ref.xlsx** (read-only) is the official branch list.

Please build a tidy **Clean** sheet with formulas, freeze it to values, remove the duplicates, and give me a small **DQ** sheet with data-quality metrics I can paste into the migration sign-off.

**What "done" looks like:** Clean has ${UNIQ_N} unique, typed rows (numbers are numbers, dates are dates), every row has a DQ Flag, and the DQ sheet shows before/after row counts, blanks filled and invalid records.

**Don't edit Raw** — keep it as the untouched audit copy.`,
  workbooks: () => [rawBook(), refBook()],
  readOnly: ['Branch_Ref.xlsx'],
  start: { book: 'Lake_Extract.xlsx', sheet: 'Raw', cell: 'A1' },
  tasks: [
    {
      id: 't1',
      title: 'Set up the Clean sheet',
      instruction: `Insert a new sheet ([[Shift+F11]]) and rename it \`Clean\`. In **A1:E1** type the headers: \`Cust ID\`, \`Name\`, \`Branch\`, \`Open Date\`, \`Balance\`.`,
      why: `Never clean in place. Raw stays exactly as received (your audit trail — "what did the lake actually send?"), Clean holds formulas that transform it. If the logic is wrong you fix one formula, not 55 hand-edited cells, and anyone can see what you did.`,
      hints: ['Shift+F11 inserts a sheet; double-click its tab (or Alt H O R) to rename.', 'Type the headers with Tab between them.'],
      check: (c) => {
        const s = needSheet(c, 'Clean');
        if (s !== true) return s;
        for (let i = 0; i < 5; i++) {
          const a = `Clean!${'ABCDE'[i]}1`;
          if (String(c.v(a) ?? '').trim().toLowerCase() !== C_HEAD[i].toLowerCase()) return `${a} should read "${C_HEAD[i]}".`;
        }
        return true;
      },
      solution: [{ addSheet: 'Clean' }, { set: { 'Clean!A1': 'Cust ID', 'Clean!B1': 'Name', 'Clean!C1': 'Branch', 'Clean!D1': 'Open Date', 'Clean!E1': 'Balance' } }],
      xp: 20,
    },
    {
      id: 't2',
      title: 'Fix IDs and names',
      instruction: `In **Clean!A2:A${RAW_LAST}** turn each Raw \`cust_id\` into a real **number** (strip the spaces, then convert). In **B2:B${RAW_LAST}** make each name tidy: no extra spaces, Proper Case.`,
      why: `**Text that looks like a number is the #1 reason cross-file lookups fail.** \`"00104017"\` (text) and \`104017\` (number) are different values to VLOOKUP/XLOOKUP, so you get #N/A even though they "look the same". TRIM first (trailing spaces), then VALUE.

TRIM also collapses double spaces *inside* the text, and PROPER fixes the casing — so \`"  MARIA  garcia "\` becomes \`"Maria Garcia"\`. Without this, de-duplication would treat them as different people.`,
      hints: [
        'Nest the functions inside-out: TRIM the raw cell, then VALUE the result.',
        `A2: =VALUE(TRIM(Raw!A2))`,
        `B2: =PROPER(TRIM(Raw!B2)) — then fill both down to row ${RAW_LAST}.`,
      ],
      check: (c) =>
        all(
          needSheet(c, 'Clean'),
          formulasMatch(c, `Clean!A2:A${RAW_LAST}`, /(VALUE|NUMBERVALUE|--|\*1|\+0)/i, 'TRIM + VALUE'),
          refsRaw(c, `Clean!A2:A${RAW_LAST}`),
          (() => {
            const got = c.list(`Clean!A2:A${RAW_LAST}`);
            const i = got.findIndex((g, k) => g !== PRE.id[k]);
            return i < 0 ? true : `Clean!A${i + 2} shows ${fmtScalar(got[i])} — it should be the number ${PRE.id[i]} (not text).`;
          })(),
          formulasMatch(c, `Clean!B2:B${RAW_LAST}`, /PROPER\(/i, 'PROPER(TRIM())'),
          formulasMatch(c, `Clean!B2:B${RAW_LAST}`, /TRIM\(/i, 'PROPER(TRIM())'),
          refsRaw(c, `Clean!B2:B${RAW_LAST}`),
          valuesEqual(c, `Clean!B2:B${RAW_LAST}`, PRE.name, 'Name'),
        ),
      solution: [{ set: { [`Clean!A2:A${RAW_LAST}`]: '=VALUE(TRIM(Raw!A2))', [`Clean!B2:B${RAW_LAST}`]: '=PROPER(TRIM(Raw!B2))' } }],
      xp: 30,
    },
    {
      id: 't3',
      title: 'Fill down the branch with a formula',
      instruction: `Raw only shows \`branch_cd\` on the first row of each group. In **Clean!C2:C${RAW_LAST}** write a formula that takes the Raw branch when there is one, and otherwise **repeats the value from the row above in Clean**.`,
      why: `Report-style exports drop repeated values to look "clean" to a human, but a blank branch breaks every filter, pivot and SUMIFS. The formula \`=IF(Raw!C2="",C1,Raw!C2)\` points at **its own column one row up**, so the last known branch cascades down until a new one appears.

(If you were fixing the Raw sheet itself you'd use **Go To Special → Blanks**, type \`=\` + ↑ and press [[Ctrl+Enter]]. Same idea, but here we keep Raw untouched.)`,
      hints: [
        'Test whether Raw!C2 is empty: Raw!C2=""',
        'If it is empty, use C1 (the cell above, in Clean). Otherwise use Raw!C2.',
        `=IF(Raw!C2="",C1,Raw!C2) filled down to C${RAW_LAST}.`,
      ],
      check: (c) =>
        all(
          needSheet(c, 'Clean'),
          formulasMatch(c, `Clean!C2:C${RAW_LAST}`, /IF\(/i, 'IF'),
          refsRaw(c, `Clean!C2:C${RAW_LAST}`),
          valuesEqual(c, `Clean!C2:C${RAW_LAST}`, PRE.branch, 'Branch'),
        ),
      solution: [{ set: { [`Clean!C2:C${RAW_LAST}`]: '=IF(Raw!C2="",C1,Raw!C2)' } }],
      xp: 30,
    },
    {
      id: 't4',
      title: 'Turn yyyymmdd text into real dates',
      instruction: `In **Clean!D2:D${RAW_LAST}** build a real date from the \`open_dt\` text: year = first 4 characters, month = characters 5–6, day = last 2.`,
      why: `\`"20190412"\` is text, so you can't subtract it, filter by month or apply EOMONTH. DATE(year, month, day) builds a proper date serial. LEFT/MID/RIGHT return text like \`"04"\`, but DATE happily coerces it to 4.

Watch out for DATEVALUE: it only understands formats your PC's locale recognises, and yyyymmdd isn't one of them. Slicing the string is locale-proof.`,
      hints: ['LEFT(text,4) = year, MID(text,5,2) = month, RIGHT(text,2) = day.', `=DATE(LEFT(Raw!D2,4),MID(Raw!D2,5,2),RIGHT(Raw!D2,2))`],
      check: (c) =>
        all(
          needSheet(c, 'Clean'),
          formulasMatch(c, `Clean!D2:D${RAW_LAST}`, /DATE\(/i, 'DATE'),
          refsRaw(c, `Clean!D2:D${RAW_LAST}`),
          valuesEqual(c, `Clean!D2:D${RAW_LAST}`, PRE.date, 'Open Date'),
        ),
      solution: [{ set: { [`Clean!D2:D${RAW_LAST}`]: '=DATE(LEFT(Raw!D2,4),MID(Raw!D2,5,2),RIGHT(Raw!D2,2))' } }],
      xp: 25,
    },
    {
      id: 't5',
      title: 'Balance + data-quality flag',
      instruction: `**E2:E${RAW_LAST}** — the Raw balance, but return \`""\` (empty text) when it's blank (a plain \`=Raw!E2\` would turn blanks into 0, which is a lie).

Header \`DQ Flag\` in **F1**, and in **F2:F${RAW_LAST}** flag each row, first rule that applies wins:

- \`Missing balance\` — E is empty
- \`Bad date\` — Open Date is after the extract date, 30 Jun 2024
- \`Unknown branch\` — the branch is not in **[Branch_Ref.xlsx]Branches!A:A**
- \`OK\` otherwise`,
      why: `A blank balance and a zero balance mean very different things in a migration (unknown vs. empty account). Keeping the blank visible lets you count it.

The DQ flag is the row-level evidence behind the metrics you'll report. Checking the branch against the **reference file** with COUNTIF(...)=0 is the standard "does this code exist?" test — the same anti-join pattern used in recons.`,
      hints: [
        'E2: =IF(Raw!E2="","",Raw!E2)',
        'For the date test compare D2 with DATE(2024,6,30).',
        '=IF(E2="","Missing balance",IF(D2>DATE(2024,6,30),"Bad date",IF(COUNTIF([Branch_Ref.xlsx]Branches!$A:$A,C2)=0,"Unknown branch","OK")))',
      ],
      check: (c) =>
        all(
          needSheet(c, 'Clean'),
          refsRaw(c, `Clean!E2:E${RAW_LAST}`),
          valuesEqual(c, `Clean!E2:E${RAW_LAST}`, PRE.bal, 'Balance'),
          (() => {
            const got = c.list(`Clean!E2:E${RAW_LAST}`);
            const i = PRE.bal.findIndex((b, k) => b === null && got[k] === 0);
            return i < 0 ? true : `Clean!E${i + 2} shows 0 but the raw balance is blank — return "" instead.`;
          })(),
          String(c.v('Clean!F1') ?? '').trim() ? true : 'Type the header "DQ Flag" in F1.',
          formulasMatch(c, `Clean!F2:F${RAW_LAST}`, /(IF|IFS)\(/i, 'IF'),
          formulasMatch(c, `Clean!F2:F${RAW_LAST}`, /branch_ref/i, 'branch-reference (COUNTIF on [Branch_Ref.xlsx])'),
          valuesEqual(c, `Clean!F2:F${RAW_LAST}`, PRE.flag, 'DQ Flag'),
        ),
      solution: [
        {
          set: {
            [`Clean!E2:E${RAW_LAST}`]: '=IF(Raw!E2="","",Raw!E2)',
            'Clean!F1': 'DQ Flag',
            [`Clean!F2:F${RAW_LAST}`]: '=IF(E2="","Missing balance",IF(D2>DATE(2024,6,30),"Bad date",IF(COUNTIF([Branch_Ref.xlsx]Branches!$A:$A,C2)=0,"Unknown branch","OK")))',
          },
        },
      ],
      xp: 35,
    },
    {
      id: 't6',
      title: 'Freeze the results with Paste Values',
      instruction: `Select **Clean!A2:F${RAW_LAST}**, copy ([[Ctrl+C]]) and paste back over itself as **values** ([[Alt]] [[H]] [[V]] [[V]], or [[Ctrl+Alt+V]] → Values).`,
      why: `Next you'll remove duplicate rows. Remove Duplicates **moves rows around** — and the branch fill-down formula points at "the row above", so it would start pointing at the wrong row and silently corrupt the data.

Rule of thumb: **formulas to transform, values to hand over.** Converting to values also means the file no longer needs Raw or Branch_Ref to be open.`,
      hints: ['Click A2, then Ctrl+Shift+End (or Ctrl+Shift+↓ then →) to select the block.', 'Ctrl+C, then with the same selection Alt, H, V, V.'],
      check: (c) => {
        const s = needSheet(c, 'Clean');
        if (s !== true) return s;
        const ins = c.inputs(`Clean!A2:F${RAW_LAST}`);
        const k = ins.findIndex((x) => x.startsWith('='));
        if (k >= 0) return `Clean still has formulas (e.g. cell #${k + 1} of A2:F${RAW_LAST}). Copy and Paste Values over the block.`;
        return all(
          (() => {
            const got = c.list(`Clean!A2:A${RAW_LAST}`);
            const i = got.findIndex((g, j) => g !== PRE.id[j]);
            return i < 0 ? true : `Clean!A${i + 2} lost its value (${fmtScalar(got[i])}). Undo and paste values from the formulas again.`;
          })(),
          valuesEqual(c, `Clean!C2:C${RAW_LAST}`, PRE.branch, 'Branch'),
          valuesEqual(c, `Clean!F2:F${RAW_LAST}`, PRE.flag, 'DQ Flag'),
        );
      },
      solution: [{ select: `Clean!A2:F${RAW_LAST}` }, { cmd: 'clip.copy' }, { cmd: 'clip.pasteValues' }],
      xp: 25,
    },
    {
      id: 't7',
      title: 'Remove the duplicates',
      instruction: `With a cell in the Clean table selected, run **Data → Remove Duplicates** ([[Alt]] [[A]] [[M]]) using all columns. You should be left with **${UNIQ_N}** customers.`,
      why: `The double-loaded rows had different spacing and casing in Raw, so Remove Duplicates on Raw would have found **nothing**. Cleaning first is what makes them identical — order of operations matters.

Using *all* columns is the safe choice: it only removes rows that are identical in every field. Two rows with the same ID but different balances are not duplicates, they're a question for the data owner.`,
      hints: ['Click Clean!A1 (any cell in the table works).', 'Alt, A, M opens Remove Duplicates — keep every column ticked, "My data has headers" on.'],
      check: (c) => {
        const s = needSheet(c, 'Clean');
        if (s !== true) return s;
        const ids = c.list(`Clean!A2:A${RAW_LAST}`);
        const kept = ids.filter((x) => x !== null && x !== '');
        if (kept.length !== UNIQ_N) return `Clean has ${kept.length} rows of data — it should have ${UNIQ_N} after removing duplicates.`;
        return valuesEqual(c, `Clean!A2:A${UNIQ_N + 1}`, UNIQ.map((x) => x.id), 'Cust ID');
      },
      solution: [{ select: 'Clean!A1' }, { removeDup: { cols: ['A', 'B', 'C', 'D', 'E', 'F'] } }],
      xp: 25,
    },
    {
      id: 't8',
      title: 'Data-quality metrics',
      instruction: `Add a sheet named \`DQ\`. Put labels in column A and **formulas** in column B:

- **B2** — rows in the raw extract (COUNTA of Raw!A2:A${RAW_LAST})
- **B3** — rows in Clean after de-duplication
- **B4** — duplicates removed (B2 − B3)
- **B5** — blank branch cells that were filled (COUNTBLANK on Raw!C2:C${RAW_LAST})
- **B6** — invalid records in Clean (DQ Flag is anything other than OK)`,
      why: `A data-quality sign-off is a handful of numbers that let someone else trust your file without redoing your work: what came in, what went out, what changed and what's still wrong. Formulas (not typed numbers) mean the metrics stay honest if the extract is re-run.

For B6, careful: \`COUNTIF(range,"<>OK")\` also counts **empty** cells below the data. Counting the non-blank flags and subtracting the OKs avoids that trap.`,
      hints: [
        `B2: =COUNTA(Raw!A2:A${RAW_LAST})   B3: =COUNTA(Clean!A2:A${RAW_LAST})   B4: =B2-B3`,
        `B5: =COUNTBLANK(Raw!C2:C${RAW_LAST})`,
        `B6: =COUNTA(Clean!F2:F${RAW_LAST})-COUNTIF(Clean!F2:F${RAW_LAST},"OK")`,
      ],
      check: (c) => {
        const s = needSheet(c, 'DQ');
        if (s !== true) return s;
        const exp: [string, number, string][] = [
          ['B2', RAW_N, 'raw row count'],
          ['B3', UNIQ_N, 'clean row count'],
          ['B4', RAW_N - UNIQ_N, 'duplicates removed'],
          ['B5', BLANK_BRANCHES, 'blank branches filled'],
          ['B6', INVALID, 'invalid records'],
        ];
        for (const [a, v, what] of exp) {
          if (!c.f(`DQ!${a}`).startsWith('=')) return `DQ!${a} should be a formula for the ${what}.`;
          if (c.v(`DQ!${a}`) !== v) return `DQ!${a} (${what}) shows ${fmtScalar(c.v(`DQ!${a}`))} — expected ${v}.`;
        }
        return true;
      },
      solution: [
        { addSheet: 'DQ' },
        {
          set: {
            'DQ!A1': 'Metric',
            'DQ!B1': 'Value',
            'DQ!A2': 'Rows in raw extract',
            'DQ!A3': 'Rows after de-dup',
            'DQ!A4': 'Duplicates removed',
            'DQ!A5': 'Blank branches filled',
            'DQ!A6': 'Invalid records',
            'DQ!B2': `=COUNTA(Raw!A2:A${RAW_LAST})`,
            'DQ!B3': `=COUNTA(Clean!A2:A${RAW_LAST})`,
            'DQ!B4': '=B2-B3',
            'DQ!B5': `=COUNTBLANK(Raw!C2:C${RAW_LAST})`,
            'DQ!B6': `=COUNTA(Clean!F2:F${RAW_LAST})-COUNTIF(Clean!F2:F${RAW_LAST},"OK")`,
          },
        },
      ],
      xp: 30,
    },
  ],
};
