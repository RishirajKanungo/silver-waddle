import type { CheckCtx, Module } from '../types';
import { makeBook, customers, transactions, rng, between, pick, round2, BRANCHES } from '../data';
import { all, valuesEqual } from '../runner';

// ---------- Excel-equivalent text helpers (to compute expected answers) ----------
const xTrim = (s: string) => s.replace(/ +/g, ' ').trim();
const xProper = (s: string) => s.toLowerCase().replace(/(^|[^a-z])([a-z])/g, (_, a, b) => a + b.toUpperCase());

// ---------- check helper ----------
function formulas(c: CheckCtx, col: string, r1: number, r2: number, re: RegExp, msg: string, sheet = ''): true | string {
  for (let r = r1; r <= r2; r++) {
    const f = c.f(`${sheet}${col}${r}`);
    if (!f.startsWith('=')) return `${col}${r} needs a formula (it is ${f ? 'a typed value' : 'empty'}). Fill it down the whole column.`;
    if (!re.test(f)) return `${col}${r}: ${msg}`;
  }
  return true;
}

// =====================================================================
// Lesson 1 data: customer master with messy names / segments
const cs = customers(60, 7);
const L1N = 30;
const L1LAST = L1N + 1;
const messyName = (name: string, k: number) => {
  switch (k % 5) {
    case 0: return '  ' + name.toUpperCase() + ' ';
    case 1: return name.toLowerCase().replace(' ', '   ');
    case 2: return name + '   ';
    case 3: return name;
    default: return ' ' + name.replace(' ', '  ');
  }
};
const messySeg = (seg: string, k: number) => (k % 3 === 0 ? seg.toUpperCase() + ' ' : k % 3 === 1 ? seg.toLowerCase() : seg);
const l1 = cs.slice(0, L1N).map((c, k) => ({ id: c.id, raw: messyName(c.name, k), seg: messySeg(c.segment, k), region: c.region }));

// =====================================================================
// Lesson 2 data: fixed-width account refs + "Last, First" names + memos
const r2 = rng(606);
const people = cs.filter((c) => c.segment === 'Retail' || c.segment === 'Wealth').slice(0, 24);
const PRODS = ['CHK', 'SAV', 'MMA', 'CDS'];
const MEMOS = ['Payroll ACH credit', 'ach debit - utility', 'Wire In - Ref 8812', 'POS purchase', 'Mobile deposit', 'ACH CR TREASURY', 'ATM withdrawal', 'Zelle transfer', 'Check #1042', 'Bill pay - Ach'];
const l2 = people.map((p) => {
  const [first, ...rest] = p.name.split(' ');
  const last = rest.join(' ');
  const country = r2() < 0.8 ? 'US' : 'CA';
  const acct = String(between(r2, 1, 99999999)).padStart(8, '0');
  const prod = pick(r2, PRODS);
  return { ref: `${country}-${p.branch.replace('-', '')}-${acct}-${prod}`, cust: `${last}, ${first}`, memo: pick(r2, MEMOS), country, acct, prod, first, last };
});
const L2N = l2.length;
const L2LAST = L2N + 1;

// =====================================================================
// Lesson 3 data: GL lines with text balances + contacts
const r3 = rng(707);
const GL_ACCTS = ['1000', '1200', '2100', '4520', '6100'];
const CCYS = ['USD', 'USD', 'USD', 'EUR', 'GBP'];
const gl = Array.from({ length: 20 }, (_, k) => {
  const amt = round2((r3() < 0.15 ? -1 : 1) * (100 + r3() * 24000));
  const abs = Math.abs(amt);
  const style = k % 4;
  const fixed = abs.toFixed(2);
  const withCommas = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // how the data lake sent it: plain, with thousands separators, padded with spaces, or accounting negatives
  const text = amt < 0 ? `(${withCommas})` : style === 1 ? withCommas : style === 2 ? ` ${fixed} ` : fixed;
  return {
    branch: pick(r3, BRANCHES),
    acct: pick(r3, GL_ACCTS),
    ccy: pick(r3, CCYS),
    cc: `CC/${between(r3, 1000, 9999)}/${String(between(r3, 1, 12)).padStart(2, '0')}`,
    amt,
    text,
  };
});
const GLN = gl.length;
const GLLAST = GLN + 1;
const glTotal = round2(gl.reduce((a, g) => a + g.amt, 0));

const STREETS = ['12 Harbor St', '400 Park Ave', '77 Elm Rd', '9 Market Sq', '150 Lake Dr', '31 King St', '808 Pine Blvd', '5 River Way'];
const CITIES = ['New York', 'Boston', 'Atlanta', 'Chicago', 'Dallas', 'Seattle', 'Miami', 'Phoenix'];
const DOMAINS = ['northbank.com', 'gmail.com', 'outlook.com', 'harborcapital.co'];
const contacts = people.slice(0, 12).map((p, k) => {
  const [first, ...rest] = p.name.split(' ');
  return {
    name: p.name,
    email: `${first.toLowerCase()}.${rest.join('').toLowerCase()}@${DOMAINS[k % DOMAINS.length]}`,
    a1: STREETS[k % STREETS.length],
    a2: k % 3 === 0 ? `Suite ${100 + k * 10}` : '',
    city: CITIES[k % CITIES.length],
  };
});
const CN = contacts.length;
const CLAST = CN + 1;

// =====================================================================
// Lesson 4 data: CSV extract, duplicated customer list, report with blanks
const tx = transactions(20, 21);
const csvHeader = 'TxnID,Branch,Type,Amount';
const csvLines = tx.map((t) => `${t.id},${t.branch},${t.type},${t.amount}`);

const uniq = cs.slice(30, 55); // 25 unique customers
const dupAt = new Set([3, 7, 12, 18, 21, 24]); // these get loaded twice (a batch re-run)
const custRows: (string | number)[][] = [];
uniq.forEach((c, k) => {
  custRows.push([c.id, c.name, c.segment, c.region]);
  if (dupAt.has(k)) custRows.push([c.id, c.name, c.segment, c.region]);
});
const UN = uniq.length;

const REGION_OF: Record<string, string> = {
  'NYC-01': 'Northeast', 'NYC-02': 'Northeast', 'BOS-01': 'Northeast',
  'ATL-01': 'Southeast', 'MIA-01': 'Southeast',
  'CHI-01': 'Midwest',
  'DAL-01': 'Southwest', 'PHX-01': 'Southwest',
  'SFO-01': 'West', 'SEA-01': 'West',
};
const r4 = rng(808);
const report = BRANCHES.flatMap((b) => ['April', 'May'].map((m) => ({ region: REGION_OF[b], branch: b, month: m, dep: round2(80 + r4() * 400) })));
// The pivot-style export only prints a label when it changes
const reportRows = report.map((x, i) => [
  i > 0 && report[i - 1].region === x.region ? '' : x.region,
  i > 0 && report[i - 1].branch === x.branch ? '' : x.branch,
  x.month,
  x.dep,
]);
const RN = report.length;
const RLAST = RN + 1;

export const module: Module = {
  id: 'm06',
  title: 'Cleaning Data-Lake Extracts',
  level: 'Analyst',
  icon: '🧹',
  blurb: 'TRIM, text slicing, joining, numbers-stored-as-text, Paste Values, Text to Columns, Remove Duplicates and filling blanks — turn raw extracts into data you can trust.',
  lessons: [
    // =====================================================================
    {
      id: 'm06-l1',
      title: 'Spaces & case: TRIM, PROPER, UPPER, LEN',
      summary: 'Find invisible junk with LEN, strip it with TRIM, standardise case for keys and reports.',
      minutes: 9,
      featured: ['TRIM', 'LEN', 'PROPER', 'UPPER', 'LOWER'],
      intro: `Data-lake extracts are built by systems, not people. Fixed-width fields get padded with spaces, one source sends names in CAPS, another in lower case. To a human "MARIA ALI " and "Maria Ali" are the same customer. To Excel they are **different text**, so lookups fail, COUNTIFs undercount and pivots show the same customer twice.

**The toolkit:**
- \`LEN(text)\` counts characters — including invisible spaces. It is your **detector**.
- \`TRIM(text)\` removes leading/trailing spaces and squeezes runs of spaces to one.
- \`UPPER\`, \`LOWER\`, \`PROPER\` (Title Case) standardise case.

**Why build a *key* in UPPER case?** Lookups ignore case, but other tools (Power Query, SQL joins, Python) often do not. A clean, upper-case, trimmed key behaves the same everywhere.

**Common mistakes:**
- Cleaning by hand. It does not survive next month's refresh — a formula does.
- Trusting PROPER blindly: "LLC" becomes "Llc", "McDonald" becomes "Mcdonald". Fine for a quick report, not for legal names.
- Overwriting the raw column. Keep the raw data; put clean versions next to it (later you will learn to freeze them with Paste Values).`,
      workbooks: () => [
        makeBook('Customer_Master_Raw.xlsx', [
          {
            name: 'Extract',
            rows: [
              ['Cust ID', 'Name (raw)', 'Segment (raw)', 'Region', 'Extra Spaces?', 'Clean Name', 'Proper Name', 'Segment Key'],
              ...l1.map((x) => [x.id, x.raw, x.seg, x.region]),
            ],
            widths: [80, 190, 120, 90, 100, 170, 170, 120],
            freeze: true,
          },
        ]),
      ],
      start: { cell: 'E2' },
      tasks: [
        {
          id: 't1',
          title: 'Detect hidden spaces with LEN',
          instruction: `You cannot see trailing spaces — so measure them. In **E2** type \`=LEN(B2)<>LEN(TRIM(B2))\` and fill down to **E${L1LAST}**.

TRUE means the raw name carries junk spaces.`,
          why: 'Before you fix data, prove it is broken and how badly — that number goes in your data-quality note. If raw and trimmed lengths differ, something invisible is there. This same test is how you debug a lookup that "should" match but returns #N/A.',
          hints: ['LEN counts every character, spaces included.', '<> means "not equal".', `=LEN(B2)<>LEN(TRIM(B2)), then select E2:E${L1LAST} and Ctrl+D.`],
          check: (c) =>
            all(
              formulas(c, 'E', 2, L1LAST, /LEN\(/i, 'use LEN( ) to compare lengths.'),
              valuesEqual(c, `E2:E${L1LAST}`, l1.map((x) => x.raw.length !== xTrim(x.raw).length), 'Extra Spaces?'),
            ),
          solution: [{ set: { [`E2:E${L1LAST}`]: '=LEN(B2)<>LEN(TRIM(B2))' } }],
        },
        {
          id: 't2',
          title: 'Strip the spaces with TRIM',
          instruction: `In **F2** type \`=TRIM(B2)\` and fill down to **F${L1LAST}**.`,
          why: 'TRIM is the first thing to wrap around any text field from an extract. It removes the padding the source system added and collapses double spaces inside names, which are a top cause of "duplicate" customers.',
          hints: ['TRIM takes one argument: the text to clean.', `=TRIM(B2), fill down to F${L1LAST}.`],
          check: (c) => all(formulas(c, 'F', 2, L1LAST, /TRIM\(/i, 'use TRIM( ).'), valuesEqual(c, `F2:F${L1LAST}`, l1.map((x) => xTrim(x.raw)), 'Clean Name')),
          solution: [{ set: { [`F2:F${L1LAST}`]: '=TRIM(B2)' } }],
        },
        {
          id: 't3',
          title: 'Title Case with PROPER',
          instruction: `Make the names presentable: in **G2** type \`=PROPER(F2)\` and fill down to **G${L1LAST}**.

Spot the business names ending in "LLC" or "Inc" — what did PROPER do to them?`,
          why: 'Building on the cleaned column (F) instead of the raw one keeps each step simple and checkable. You could nest it as =PROPER(TRIM(B2)) — same answer, one column. PROPER capitalises after every non-letter, so "LLC" becomes "Llc": good enough for an internal report, not for a legal document.',
          hints: ['Point PROPER at the trimmed name in column F.', `=PROPER(F2), fill down to G${L1LAST}.`],
          check: (c) => all(formulas(c, 'G', 2, L1LAST, /PROPER\(/i, 'use PROPER( ).'), valuesEqual(c, `G2:G${L1LAST}`, l1.map((x) => xProper(xTrim(x.raw))), 'Proper Name')),
          solution: [{ set: { [`G2:G${L1LAST}`]: '=PROPER(F2)' } }],
        },
        {
          id: 't4',
          title: 'Build a clean segment key',
          instruction: `Segments arrive as "RETAIL ", "retail" and "Retail". Make one consistent key: in **H2** type \`=UPPER(TRIM(C2))\` and fill down to **H${L1LAST}**.`,
          why: 'Nesting runs inside-out: TRIM first, then UPPER. Upper-case trimmed keys are the convention for join keys because they behave identically in Excel, SQL and Python. Now a COUNTIF or pivot on column H sees 4 segments, not 10 spellings.',
          hints: ['Functions can be nested: the inner one runs first.', `=UPPER(TRIM(C2)), fill down to H${L1LAST}.`],
          check: (c) =>
            all(
              formulas(c, 'H', 2, L1LAST, /UPPER\(/i, 'use UPPER( ).'),
              formulas(c, 'H', 2, L1LAST, /TRIM\(/i, 'also TRIM the segment so "RETAIL " loses its trailing space.'),
              valuesEqual(c, `H2:H${L1LAST}`, l1.map((x) => xTrim(x.seg).toUpperCase()), 'Segment Key'),
            ),
          solution: [{ set: { [`H2:H${L1LAST}`]: '=UPPER(TRIM(C2))' } }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm06-l2',
      title: 'Slicing text: LEFT, RIGHT, MID, FIND, SEARCH',
      summary: 'Pull country, product and account number out of composite keys; split "Last, First" names.',
      minutes: 12,
      featured: ['LEFT', 'RIGHT', 'MID', 'FIND', 'SEARCH', 'ISNUMBER'],
      intro: `Core banking systems love **composite keys**: \`US-NYC01-00012345-CHK\` packs country, branch, account number and product into one field. Reports need the pieces.

**Fixed positions** — when every value has the same layout:
- \`LEFT(text, n)\` first *n* characters
- \`RIGHT(text, n)\` last *n* characters
- \`MID(text, start, n)\` *n* characters starting at position *start* (the first character is position 1)

**Variable positions** — when the piece you want ends at a delimiter whose position moves ("Ali, Maria" vs "Martinez, Diego"):
- \`FIND(",", text)\` returns the **position** of the comma. Then \`LEFT(B2, FIND(",",B2)-1)\` takes everything before it.
- \`SEARCH\` is the same but **ignores case** (and allows wildcards). FIND is case-sensitive.
- Both return #VALUE! when the text is not there — so \`ISNUMBER(SEARCH("ach",C2))\` is a neat "contains" test: TRUE if found, FALSE if not.

**Common mistakes:** forgetting the -1 (you grab the comma too); assuming fixed widths when a field can be shorter; and converting IDs like \`00012345\` to numbers — they are *identifiers*, keep them as text so the leading zeros survive.`,
      workbooks: () => [
        makeBook('Account_Keys.xlsx', [
          {
            name: 'Keys',
            rows: [
              ['Account Ref', 'Customer', 'Last Txn Memo', 'Country', 'Product', 'Account No', 'Last Name', 'First Name', 'ACH?'],
              ...l2.map((x) => [x.ref, x.cust, x.memo]),
            ],
            widths: [200, 150, 170, 70, 70, 100, 100, 100, 60],
            freeze: true,
          },
        ]),
      ],
      start: { cell: 'D2' },
      tasks: [
        {
          id: 't1',
          title: 'Country with LEFT',
          instruction: `The first 2 characters of the Account Ref are the country. In **D2**: \`=LEFT(A2,2)\`, fill down to D${L2LAST}.`,
          why: 'LEFT is the simplest slicer — use it whenever the piece you want always starts the string and has a fixed length (country codes, GL prefixes, branch codes).',
          hints: ['LEFT(text, how many characters).', `=LEFT(A2,2), then fill down to D${L2LAST}.`],
          check: (c) => all(formulas(c, 'D', 2, L2LAST, /LEFT\(/i, 'use LEFT( ).'), valuesEqual(c, `D2:D${L2LAST}`, l2.map((x) => x.country), 'Country')),
          solution: [{ set: { [`D2:D${L2LAST}`]: '=LEFT(A2,2)' } }],
        },
        {
          id: 't2',
          title: 'Product with RIGHT',
          instruction: `The last 3 characters are the product code (CHK, SAV…). In **E2**: \`=RIGHT(A2,3)\`, fill down to E${L2LAST}.`,
          why: 'RIGHT counts from the end, so it works even if the start of the string varies in length — as long as the end is fixed.',
          hints: ['RIGHT(text, how many characters from the end).', `=RIGHT(A2,3)`],
          check: (c) => all(formulas(c, 'E', 2, L2LAST, /RIGHT\(/i, 'use RIGHT( ).'), valuesEqual(c, `E2:E${L2LAST}`, l2.map((x) => x.prod), 'Product')),
          solution: [{ set: { [`E2:E${L2LAST}`]: '=RIGHT(A2,3)' } }],
        },
        {
          id: 't3',
          title: 'Account number with MID',
          instruction: `Count the positions in \`US-NYC01-00012345-CHK\`: "US-" is 1–3, "NYC01" is 4–8, the dash is 9, so the account number starts at **10** and is **8** characters long.

In **F2**: \`=MID(A2,10,8)\`, fill down to F${L2LAST}. Notice the leading zeros survive.`,
          why: 'MID needs a start position and a length. The result is text, which is exactly right for an account number: as a number, 00012345 would become 12345 and stop matching the core system. Rule of thumb: if you would never add it up, keep it as text.',
          hints: ['MID(text, start position, number of characters).', 'Start at 10, take 8.', `=MID(A2,10,8)`],
          check: (c) => all(formulas(c, 'F', 2, L2LAST, /MID\(/i, 'use MID( ).'), valuesEqual(c, `F2:F${L2LAST}`, l2.map((x) => x.acct), 'Account No')),
          solution: [{ set: { [`F2:F${L2LAST}`]: '=MID(A2,10,8)' } }],
        },
        {
          id: 't4',
          title: 'Last name with LEFT + FIND',
          instruction: `Names arrive as "Last, First" and last names have different lengths. Find the comma, then take everything before it.

In **G2**: \`=LEFT(B2,FIND(",",B2)-1)\`, fill down to G${L2LAST}.`,
          why: 'FIND returns the comma\'s position — say 4 in "Ali, Maria". You want 3 characters, hence the -1. Building it in two steps (first just =FIND(",",B2) to see the number) is a great way to debug.',
          hints: ['FIND(",",B2) tells you where the comma is.', 'Take one character fewer than that position.', '=LEFT(B2,FIND(",",B2)-1)'],
          check: (c) => all(formulas(c, 'G', 2, L2LAST, /FIND\(|SEARCH\(|TEXTBEFORE\(/i, 'use FIND( ) to locate the comma.'), valuesEqual(c, `G2:G${L2LAST}`, l2.map((x) => x.last), 'Last Name')),
          solution: [{ set: { [`G2:G${L2LAST}`]: '=LEFT(B2,FIND(",",B2)-1)' } }],
        },
        {
          id: 't5',
          title: 'First name with MID + FIND',
          instruction: `The first name starts 2 characters after the comma (comma + space). In **H2**:

\`=MID(B2,FIND(",",B2)+2,50)\`

Fill down to H${L2LAST}. (Asking MID for 50 characters is a common trick for "the rest of the string" — it simply stops at the end.)`,
          why: 'Same idea from the other side. If some rows had no space after the comma, you would use +1 and wrap it in TRIM to be safe: =TRIM(MID(B2,FIND(",",B2)+1,50)).',
          hints: ['Start position = comma position + 2.', 'Use a generous length like 50.', '=MID(B2,FIND(",",B2)+2,50)'],
          check: (c) => all(formulas(c, 'H', 2, L2LAST, /FIND\(|SEARCH\(|TEXTAFTER\(/i, 'use FIND( ) to locate the comma.'), valuesEqual(c, `H2:H${L2LAST}`, l2.map((x) => x.first), 'First Name')),
          solution: [{ set: { [`H2:H${L2LAST}`]: '=MID(B2,FIND(",",B2)+2,50)' } }],
        },
        {
          id: 't6',
          title: '"Contains" test with SEARCH',
          instruction: `Ops want every account whose last transaction was an **ACH** — but the memo spells it "ACH", "ach" and "Ach".

In **I2**: \`=ISNUMBER(SEARCH("ach",C2))\`, fill down to I${L2LAST}.`,
          why: 'SEARCH ignores case, so one formula catches every spelling; FIND("ach",…) would miss "ACH". SEARCH returns a position when found and #VALUE! when not, and ISNUMBER turns that into a clean TRUE/FALSE you can filter or count.',
          hints: ['SEARCH(what, where) — not case-sensitive.', 'Wrap it in ISNUMBER( ) to get TRUE/FALSE.', '=ISNUMBER(SEARCH("ach",C2))'],
          check: (c) =>
            all(
              formulas(c, 'I', 2, L2LAST, /SEARCH\(/i, 'use SEARCH( ) — it ignores case.'),
              valuesEqual(c, `I2:I${L2LAST}`, l2.map((x) => x.memo.toLowerCase().includes('ach')), 'ACH?'),
            ),
          solution: [{ set: { [`I2:I${L2LAST}`]: '=ISNUMBER(SEARCH("ach",C2))' } }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm06-l3',
      title: 'Joining, substituting & numbers stored as text',
      summary: 'Build match keys with &, fix delimiters with SUBSTITUTE, convert text balances with VALUE and freeze them with Paste Values.',
      minutes: 14,
      featured: ['&', 'CONCAT', 'TEXTJOIN', 'SUBSTITUTE', 'VALUE', 'TEXTBEFORE', 'TEXTAFTER', 'Alt H V V'],
      intro: `**Joining.** Reconciliations match records between two systems on a **key**. Often no single column is unique, so you build one: \`=A2&"-"&B2&"-"&C2\` → \`NYC-01-4520-USD\`. \`&\` glues text; \`CONCAT(A2,"-",B2)\` does the same. \`TEXTJOIN(", ",TRUE,C2:E2)\` joins a whole range with a delimiter and — with TRUE — **skips blanks**, so you never get "12 Elm Rd, , Boston".

**Fixing and splitting.** \`SUBSTITUTE(text, old, new)\` swaps every occurrence (e.g. "/" → "-"). \`TEXTBEFORE(text, "@")\` and \`TEXTAFTER(text, "@")\` grab what is before/after a delimiter — the modern, readable replacement for LEFT+FIND.

**Numbers stored as text.** Extracts often deliver amounts as text: \`"1,250.00"\`, \`" 980.10 "\`, \`"(1,200.00)"\`. They *look* like numbers, but **SUM ignores text**, so your total is silently wrong. Tell-tales: values aligned left, a green triangle in real Excel, or a SUM of 0. \`VALUE(text)\` converts them (it even understands commas and accounting brackets).

**Paste Values.** A helper column of formulas depends on the raw column. To keep the *results* and drop the dependency: copy → **Paste Values** ([[Alt]] [[H]] [[V]] [[V]], or classic [[Alt]] [[E]] [[S]] [[V]], or [[Ctrl+Alt+V]] then V). This replaces formulas with their results — the standard way to "lock in" a clean-up before you delete helper columns, send a file, or sort.`,
      workbooks: () => [
        makeBook('Recon_Prep.xlsx', [
          {
            name: 'GL',
            rows: [
              ['Branch', 'GL Account', 'Ccy', 'Cost Centre', 'Balance (text)', 'Match Key', 'Cost Centre (clean)', 'Balance (number)', '', 'Total of column E', `=SUM(E2:E${GLLAST})`],
              ...gl.map((g) => [g.branch, `'${g.acct}`, g.ccy, g.cc, `'${g.text}`]),
            ],
            widths: [80, 90, 50, 110, 110, 160, 130, 120, 20, 130, 110],
            freeze: true,
            styles: { K1: { fmt: '#,##0.00', b: true, fill: '#FFF2CC' } },
          },
          {
            name: 'Contacts',
            rows: [
              ['Name', 'Email', 'Address 1', 'Address 2', 'City', 'Full Address', 'Username', 'Domain'],
              ...contacts.map((x) => [x.name, x.email, x.a1, x.a2, x.city]),
            ],
            widths: [130, 210, 110, 80, 90, 230, 120, 130],
          },
        ]),
      ],
      start: { sheet: 'GL', cell: 'F2' },
      tasks: [
        {
          id: 't1',
          title: 'Build a match key with &',
          instruction: `In **F2** join Branch, GL Account and Currency with dashes: \`=A2&"-"&B2&"-"&C2\`. Fill down to F${GLLAST}.`,
          why: 'Neither branch, account nor currency is unique on its own, but the combination is. The same key built in the other system\'s extract is what you match on. Always put a delimiter between parts: without it, "NYC-01"&"1200" and "NYC-011"&"200" would collide.',
          hints: ['& joins text. Put the dash in quotes: "-".', '=A2&"-"&B2&"-"&C2'],
          check: (c) => all(formulas(c, 'F', 2, GLLAST, /&|CONCAT/i, 'join the pieces with & (or CONCAT).'), valuesEqual(c, `F2:F${GLLAST}`, gl.map((g) => `${g.branch}-${g.acct}-${g.ccy}`), 'Match Key')),
          solution: [{ set: { [`F2:F${GLLAST}`]: '=A2&"-"&B2&"-"&C2' } }],
        },
        {
          id: 't2',
          title: 'Fix delimiters with SUBSTITUTE',
          instruction: `The other system writes cost centres with dashes (CC-4520-01), ours uses slashes. In **G2**: \`=SUBSTITUTE(D2,"/","-")\`, fill down to G${GLLAST}.`,
          why: 'SUBSTITUTE swaps every occurrence of one piece of text for another. It is the formula version of Find & Replace — but it leaves the raw data intact and re-runs on next month\'s extract. Tip: SUBSTITUTE(x," ","") removes all spaces, even the ones inside that TRIM keeps.',
          hints: ['SUBSTITUTE(text, old_text, new_text).', '=SUBSTITUTE(D2,"/","-")'],
          check: (c) => all(formulas(c, 'G', 2, GLLAST, /SUBSTITUTE\(/i, 'use SUBSTITUTE( ).'), valuesEqual(c, `G2:G${GLLAST}`, gl.map((g) => g.cc.split('/').join('-')), 'Cost Centre (clean)')),
          solution: [{ set: { [`G2:G${GLLAST}`]: '=SUBSTITUTE(D2,"/","-")' } }],
        },
        {
          id: 't3',
          title: 'Convert text balances with VALUE',
          instruction: `Look at **K1**: the total of column E is **0**, because every balance is text. In **H2**: \`=VALUE(E2)\`, fill down to H${GLLAST}. Check that "(1,234.56)" style values become negatives.`,
          why: 'A total of 0 (or a total that is merely too small, if only some rows are text) is one of the most common silent errors in bank reporting. VALUE understands thousands separators, padding spaces and accounting brackets. Do not VALUE an ID column though — account numbers need their leading zeros.',
          hints: ['VALUE takes the text and returns a real number.', '=VALUE(E2), then fill down.'],
          check: (c) => all(formulas(c, 'H', 2, GLLAST, /VALUE\(|--|\*1|\+0/i, 'convert with VALUE( ).'), valuesEqual(c, `H2:H${GLLAST}`, gl.map((g) => g.amt), 'Balance (number)')),
          solution: [{ set: { [`H2:H${GLLAST}`]: '=VALUE(E2)' } }],
        },
        {
          id: 't4',
          title: 'Paste Values over the raw column, then drop the helper',
          instruction: `Now replace the text balances with real numbers:
- Select **H2:H${GLLAST}** and copy ([[Ctrl+C]]).
- Select **E2** and **Paste Values**: [[Alt]] [[H]] [[V]] [[V]] (or [[Alt]] [[E]] [[S]] [[V]]).
- The helper is no longer needed: select **H2:H${GLLAST}** and press [[Delete]].

K1 should now show the real total.`,
          why: 'Paste Values writes the results, not the formulas, so column E no longer depends on anything. That is what lets you safely delete the helper column. If you had pasted normally (Ctrl+V), E would contain =VALUE(E2) pointing at itself — a circular reference.',
          hints: ['Copy the helper column first.', 'Paste Values is Alt, H, V, V — or Ctrl+Alt+V then V.', 'After pasting, clear H2:H' + GLLAST + ' with Delete.'],
          check: (c) => {
            const ins = c.inputs(`E2:E${GLLAST}`);
            const vals = c.list(`E2:E${GLLAST}`);
            if (!c.used('clip.pasteValues') && !c.used('clip.pasteValuesLegacy')) return 'Use Paste Values (Alt H V V) to write the numbers into column E.';
            if (ins.some((x) => x.startsWith('='))) return 'Column E contains formulas — paste VALUES, not the formulas.';
            if (vals.some((v) => typeof v !== 'number')) return 'Some balances in column E are still text.';
            if (c.inputs(`H2:H${GLLAST}`).some((x) => x !== '')) return `Clear the helper column H2:H${GLLAST} now that E holds real numbers.`;
            return typeof c.v('K1') === 'number' && Math.abs((c.v('K1') as number) - glTotal) < 0.01 ? true : `K1 should now total ${glTotal.toLocaleString()}.`;
          },
          solution: [{ select: `H2:H${GLLAST}` }, { cmd: 'clip.copy' }, { select: 'E2' }, { cmd: 'clip.pasteValues' }, { select: `H2:H${GLLAST}` }, { cmd: 'edit.clear' }],
          explain: 'Copy the converted numbers, Paste Values over the text column, then delete the now-unneeded helper.',
        },
        {
          id: 't5',
          title: 'Addresses with TEXTJOIN',
          instruction: `Switch to the **Contacts** sheet. Some customers have no "Address 2". In **F2**: \`=TEXTJOIN(", ",TRUE,C2:E2)\`, fill down to F${CLAST}.`,
          why: 'With & you would get "12 Harbor St, , New York" whenever Address 2 is blank. TEXTJOIN\'s second argument TRUE means "ignore empty cells", so the delimiter only appears between real parts. It also takes a whole range, which is much shorter than chaining & for many columns.',
          hints: ['TEXTJOIN(delimiter, ignore_empty, range).', '=TEXTJOIN(", ",TRUE,C2:E2)'],
          check: (c) =>
            all(
              formulas(c, 'F', 2, CLAST, /TEXTJOIN\(/i, 'use TEXTJOIN( ).', 'Contacts!'),
              valuesEqual(c, `Contacts!F2:F${CLAST}`, contacts.map((x) => [x.a1, x.a2, x.city].filter(Boolean).join(', ')), 'Full Address'),
            ),
          solution: [{ sheetTab: 'Contacts' }, { set: { [`Contacts!F2:F${CLAST}`]: '=TEXTJOIN(", ",TRUE,C2:E2)' } }],
        },
        {
          id: 't6',
          title: 'Split emails with TEXTBEFORE / TEXTAFTER',
          instruction: `Still on **Contacts**: in **G2** \`=TEXTBEFORE(B2,"@")\` (username) and in **H2** \`=TEXTAFTER(B2,"@")\` (domain). Fill both down to row ${CLAST}.`,
          why: 'Domain tells you which customers use a corporate address — handy for KYC checks and for spotting staff accounts. TEXTBEFORE/TEXTAFTER say exactly what they do, which makes them far easier to review than LEFT(B2,FIND("@",B2)-1).',
          hints: ['TEXTBEFORE(text, delimiter) and TEXTAFTER(text, delimiter).', 'Select G2:H' + CLAST + ' after typing both, then Ctrl+D.'],
          check: (c) =>
            all(
              formulas(c, 'G', 2, CLAST, /TEXTBEFORE\(|LEFT\(/i, 'use TEXTBEFORE( ).', 'Contacts!'),
              formulas(c, 'H', 2, CLAST, /TEXTAFTER\(|MID\(|RIGHT\(/i, 'use TEXTAFTER( ).', 'Contacts!'),
              valuesEqual(c, `Contacts!G2:G${CLAST}`, contacts.map((x) => x.email.split('@')[0]), 'Username'),
              valuesEqual(c, `Contacts!H2:H${CLAST}`, contacts.map((x) => x.email.split('@')[1]), 'Domain'),
            ),
          solution: [{ set: { [`Contacts!G2:G${CLAST}`]: '=TEXTBEFORE(B2,"@")', [`Contacts!H2:H${CLAST}`]: '=TEXTAFTER(B2,"@")' } }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm06-l4',
      title: 'Bulk tools: Text to Columns, Remove Duplicates, fill blanks',
      summary: 'Split a CSV dump, de-duplicate a double-loaded customer list, and fill down a pivot-style report.',
      minutes: 12,
      featured: ['Alt A E', 'Alt A M', 'F5 → Special', 'Ctrl+Enter', 'Alt H V V'],
      intro: `Formulas are great for repeatable clean-up. Some jobs are one-off structural fixes, and Excel has tools for those.

**Text to Columns** ([[Alt]] [[A]] [[E]]) splits one column into many on a delimiter. Data-lake dumps often land as one long CSV string per row. *Mistake to avoid:* it overwrites the columns to the right — make sure they are empty.

**Remove Duplicates** ([[Alt]] [[A]] [[M]]) deletes repeated rows, judged on the columns you tick. A batch loaded twice is a classic: every customer appears twice and every total doubles. *Think before you click:* which column defines "the same record"? For a customer master it is the Customer ID, not the name (two different "Maria Ali"s are real). It is destructive — keep the raw extract on another sheet.

**Filling blanks** in pivot-style exports, which only print a label when it changes:
1. Select the area, [[F5]] → **Special** → **Blanks** — every empty cell is selected at once.
2. Type \`=\` and press [[↑]] (the formula points to the cell **above the first blank**, e.g. \`=A2\`).
3. Press [[Ctrl+Enter]] — the formula goes into **every** selected cell, each pointing at the cell above itself.
4. **Paste Values** to freeze the result. Skip this and sorting later will scramble the labels, because each still points "one row up".`,
      workbooks: () => [
        makeBook('Cleanup_Tools.xlsx', [
          {
            name: 'Extract',
            rows: [[csvHeader], ...csvLines.map((l) => [l])],
            header: false,
            widths: [330, 90, 90, 90],
          },
          {
            name: 'Customers',
            rows: [['Cust ID', 'Name', 'Segment', 'Region'], ...custRows],
            widths: [80, 170, 110, 90],
          },
          {
            name: 'Report',
            rows: [['Region', 'Branch', 'Month', 'Deposits ($M)'], ...reportRows],
            widths: [100, 80, 80, 110],
            formats: { 3: '#,##0.00' },
          },
        ]),
      ],
      start: { sheet: 'Extract', cell: 'A1' },
      tasks: [
        {
          id: 't1',
          title: 'Split the CSV with Text to Columns',
          instruction: `On **Extract**, each row is one comma-separated line. Select **A1:A${csvLines.length + 1}** (click A1, [[Ctrl+Shift+↓]]), then **Data → Text to Columns** ([[Alt]] [[A]] [[E]]), choose **Delimited**, tick **Comma**, Finish.`,
          why: 'Text to Columns turns one unusable string into proper fields in one move, and numbers come out as real numbers. It is a one-off tool: if you receive this file every month, a formula approach (TEXTSPLIT/TEXTBEFORE) or Power Query is more repeatable.',
          hints: ['Select the whole column of data including the header line.', 'Alt, A, E opens Text to Columns.', 'The delimiter is a comma.'],
          check: (c) =>
            all(
              valuesEqual(c, 'Extract!A1:D1', csvHeader.split(','), 'Headers'),
              valuesEqual(c, `Extract!A2:A${tx.length + 1}`, tx.map((t) => t.id), 'TxnID'),
              valuesEqual(c, `Extract!B2:B${tx.length + 1}`, tx.map((t) => t.branch), 'Branch'),
              valuesEqual(c, `Extract!D2:D${tx.length + 1}`, tx.map((t) => t.amount), 'Amount'),
            ),
          solution: [{ select: `A1:A${csvLines.length + 1}` }, { textToCols: ',' }],
        },
        {
          id: 't2',
          title: 'Remove the double-loaded customers',
          instruction: `Go to the **Customers** sheet. A batch was loaded twice, so some customers appear twice. Click any cell in the table, then **Data → Remove Duplicates** ([[Alt]] [[A]] [[M]]) and judge duplicates on **Cust ID** only.

You should be left with ${UN} customers.`,
          why: `The Customer ID is the business key — two rows with the same ID are the same customer. Judging on Name would wrongly merge different people who share a name; judging on all columns would miss duplicates where one field was edited. Always note the before/after count (${custRows.length} → ${UN}) in your data-quality log.`,
          hints: ['Ctrl+PgDn (or Ctrl+Alt+PgDn) moves to the next sheet.', 'Alt, A, M opens Remove Duplicates.', 'Tick only the Cust ID column; "My data has headers" stays on.'],
          check: (c) => {
            const ids = c.list(`Customers!A2:A${custRows.length + 1}`);
            const filled = ids.filter((x) => x !== null && x !== '');
            if (new Set(filled).size !== filled.length) return 'There are still repeated Customer IDs.';
            return valuesEqual(c, `Customers!A2:A${UN + 1}`, uniq.map((u) => u.id), 'Cust ID') === true && filled.length === UN ? true : `You should have exactly ${UN} customers left, in their original order.`;
          },
          solution: [{ sheetTab: 'Customers' }, { select: 'A1' }, { removeDup: { cols: ['A'] } }],
        },
        {
          id: 't3',
          title: 'Fill the blank labels (F5 → Blanks, Ctrl+Enter)',
          instruction: `Go to the **Report** sheet. Region and Branch are only printed when they change, so you cannot filter or SUMIF by them yet.
- Select **A2:B${RLAST}**.
- [[F5]] → **Special…** → **Blanks** → OK.
- Type \`=\`, press [[↑]] (you get \`=A2\`), then press [[Ctrl+Enter]].`,
          why: 'Ctrl+Enter enters the same relative formula into every selected cell. Because "=the cell above" is relative, each blank picks up the label above it — and the blank cells in column B get =B-above automatically. Thirty seconds instead of thirty minutes of copy-paste, and no typos.',
          hints: ['Only select the two label columns — the numbers have no blanks.', 'In the Go To Special box, pick Blanks.', 'The first blank is A3, so the formula is =A2. Finish with Ctrl+Enter, not Enter.'],
          check: (c) =>
            all(
              valuesEqual(c, `Report!A2:A${RLAST}`, report.map((x) => x.region), 'Region'),
              valuesEqual(c, `Report!B2:B${RLAST}`, report.map((x) => x.branch), 'Branch'),
            ),
          solution: [{ sheetTab: 'Report' }, { select: `A2:B${RLAST}` }, { gotoSpecial: 'blanks' }, { fillMulti: '=A2' }],
        },
        {
          id: 't4',
          title: 'Freeze the labels with Paste Values',
          instruction: `The filled cells are formulas pointing one row up. Lock them in: select **A2:B${RLAST}**, [[Ctrl+C]], then Paste Values ([[Alt]] [[H]] [[V]] [[V]]) right on top.`,
          why: 'If you sort this table while the labels are still =A2-style formulas, every label re-points to whatever row is now above it — and your report silently scrambles. Pasting values over the top makes them plain text. Rule: after any formula-based clean-up you intend to keep, Paste Values.',
          hints: ['Copy and paste onto the same range.', 'Alt, H, V, V = Paste Values.'],
          check: (c) => {
            if (!c.used('clip.pasteValues') && !c.used('clip.pasteValuesLegacy')) return 'Copy A2:B' + RLAST + ' and use Paste Values on top of it.';
            if (c.inputs(`Report!A2:B${RLAST}`).some((x) => x.startsWith('='))) return 'Some labels are still formulas — paste VALUES over the whole A2:B' + RLAST + ' range.';
            return all(valuesEqual(c, `Report!A2:A${RLAST}`, report.map((x) => x.region), 'Region'), valuesEqual(c, `Report!B2:B${RLAST}`, report.map((x) => x.branch), 'Branch'));
          },
          solution: [{ select: `A2:B${RLAST}` }, { cmd: 'clip.copy' }, { cmd: 'clip.pasteValues' }],
        },
      ],
    },
  ],
  quiz: [
    {
      kind: 'formula',
      q: 'A2 holds "  MARIA   ALI ". Return "Maria Ali".',
      grid: [['Raw name'], ['  MARIA   ALI ']],
      at: 'B2',
      expect: 'Maria Ali',
      model: '=PROPER(TRIM(A2))',
      explain: 'TRIM removes the padding and squeezes the double spaces; PROPER fixes the case. Inner function runs first.',
      mustUse: ['TRIM'],
    },
    {
      kind: 'formula',
      q: 'A2 holds "Martinez, Diego". Return the last name.',
      grid: [['Customer'], ['Martinez, Diego']],
      at: 'B2',
      expect: 'Martinez',
      model: '=LEFT(A2,FIND(",",A2)-1)',
      explain: 'FIND gives the comma position (9); LEFT takes one character fewer. TEXTBEFORE(A2,",") works too.',
    },
    {
      kind: 'formula',
      q: 'A2 holds "US-NYC01-00012345-CHK". Extract the 8-digit account number (keep the zeros).',
      grid: [['Account Ref'], ['US-NYC01-00012345-CHK']],
      at: 'B2',
      expect: '00012345',
      model: '=MID(A2,10,8)',
      explain: 'MID(text, start, length). The result is text, so the leading zeros survive.',
    },
    {
      kind: 'mc',
      q: 'What is the difference between FIND and SEARCH?',
      options: ['FIND is faster', 'SEARCH ignores upper/lower case (and allows wildcards); FIND is case-sensitive', 'SEARCH returns text, FIND returns a number', 'There is none'],
      answer: 1,
      explain: 'Use SEARCH when the source spells things inconsistently ("ACH", "ach").',
    },
    {
      kind: 'formula',
      q: "A2 holds the TEXT '1,250.00 (stored as text). Convert it to a real number.",
      grid: [['Balance (text)'], ["'1,250.00"]],
      at: 'B2',
      expect: 1250,
      model: '=VALUE(A2)',
      explain: 'VALUE converts number-looking text into a number that SUM will include.',
      mustUse: ['VALUE'],
    },
    {
      kind: 'mc',
      q: 'A column of balances shows numbers, but =SUM over it returns 0. Most likely cause?',
      options: ['The column is too narrow', 'The numbers are stored as text, and SUM ignores text', 'Calculation is set to manual', 'SUM cannot handle negatives'],
      answer: 1,
      explain: 'Text that looks like numbers is skipped by SUM. Convert with VALUE (or Text to Columns), then Paste Values.',
    },
    {
      kind: 'formula',
      q: 'A2 holds an email address. Return the domain (everything after the @).',
      grid: [['Email'], ['maria.ali@northbank.com']],
      at: 'B2',
      expect: 'northbank.com',
      model: '=TEXTAFTER(A2,"@")',
      explain: 'TEXTAFTER(text, delimiter) returns everything after the first delimiter.',
    },
    {
      kind: 'mc',
      q: 'You selected the blanks with Go To Special. The first blank is A3. You type =A2 and press Ctrl+Enter. What happens?',
      options: [
        'Only A3 gets =A2',
        'Every selected blank gets a formula pointing at the cell directly above itself',
        'Every blank gets exactly =A2',
        'Excel fills the blanks with zeros',
      ],
      answer: 1,
      explain: 'Ctrl+Enter enters the formula into all selected cells, adjusted relatively — so each blank copies the label above it.',
    },
    { kind: 'keys', q: 'Replace the selected formulas with their values: Paste Values (Home-tab key tips).', cmd: 'clip.pasteValues', keys: 'Alt H V V', explain: 'Alt H V V (or classic Alt E S V, or Ctrl+Alt+V then V) pastes results only.' },
    { kind: 'keys', q: 'Open Remove Duplicates.', cmd: 'data.removeDup', keys: 'Alt A M', explain: 'Data tab (A) → Remove Duplicates (M). Choose the key column(s) carefully.' },
  ],
};
