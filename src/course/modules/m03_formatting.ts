import type { Module, CheckCtx } from '../types';
import { makeBook, customers, loans, SEGMENTS } from '../data';
import { all } from '../runner';
import { formatValue, isDateFmt } from '../../engine/format';
import { parseRange, addrToA1 } from '../../engine/refs';

// ---------------- helpers ----------------

/** Expand 'B8:E12' (optionally 'Sheet!B8:E12') to a list of single-cell refs. */
function cellsOf(ref: string): string[] {
  const bang = ref.lastIndexOf('!');
  const pre = bang >= 0 ? ref.slice(0, bang + 1) : '';
  const g = parseRange(ref.slice(bang + 1))!;
  const out: string[] = [];
  for (let r = g.r1; r <= g.r2; r++) for (let c = g.c1; c <= g.c2; c++) out.push(pre + addrToA1(r, c));
  return out;
}

/** Every cell's number format must satisfy `ok`; otherwise return `msg` naming the first bad cell. */
function fmtAll(c: CheckCtx, ref: string, ok: (fmt: string) => boolean, msg: string): true | string {
  for (const a of cellsOf(ref)) {
    const f = c.style(a).fmt ?? 'General';
    if (!ok(f)) return `${msg} (${a.replace(/^.*!/, '')} is still "${f}").`;
  }
  return true;
}

/** Number of decimals in the first section of a format ('#,##0.00' -> 2). */
const decimals = (f: string) => {
  const sec = f.split(';')[0];
  const m = /0\.(0+)/.exec(sec);
  return m ? m[1].length : 0;
};
const hasThousands = (f: string) => /#,##0/.test(f);
const showsParens = (f: string) => /^\(.*\)$/.test(formatValue(-1234, f).trim());

function hexRGB(hex?: string): [number, number, number] | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const isBlue = (hex?: string) => {
  const rgb = hexRGB(hex);
  return !!rgb && rgb[2] >= 0x99 && rgb[0] <= 0x70 && rgb[1] <= 0xa0;
};
const hasFill = (hex?: string) => {
  const rgb = hexRGB(hex);
  return !!rgb && !(rgb[0] === 255 && rgb[1] === 255 && rgb[2] === 255);
};

// ---------------- Lesson 1 data: an unformatted loan listing ----------------
const L1 = loans(customers(30, 3), 15, 17);
const L1_LAST = L1.length + 1; // 16
const loanListBook = () =>
  makeBook('Loan_Listing_Raw.xlsx', [
    {
      name: 'Loans',
      header: false, // straight out of the data lake: nothing formatted, not even the header
      rows: [
        ['Loan ID', 'Product', 'Orig Date', 'Amount', 'Balance', 'Rate', 'DPD'],
        ...L1.map((l) => [l.id, l.product, l.orig, l.amount, l.balance, l.rate, l.dpd]),
        ['Total', '', '', `=SUM(D2:D${L1_LAST})`, `=SUM(E2:E${L1_LAST})`, '', ''],
      ],
      widths: [95, 105, 85, 100, 110, 70, 50],
    },
  ]);
const TOTAL_ROW = L1_LAST + 1; // 17

// ---------------- Lesson 2 data: customer master + segment summary ----------------
const CUST = customers(60, 9);
const CUST_LAST = CUST.length + 1; // 61
const segRows = SEGMENTS.map((seg, i) => [seg, `=COUNTIF(Customers!C2:C${CUST_LAST},A${i + 4})`, `=B${i + 4}/$B$8`]);
const custBook = () =>
  makeBook('Customer_Master.xlsx', [
    {
      name: 'Summary',
      header: false,
      rows: [
        ['Customers by Segment'],
        [],
        ['Segment', 'Customers', '% of total'],
        ...segRows,
        ['Total', '=SUM(B4:B7)', '=SUM(C4:C7)'],
      ],
      widths: [150, 90, 90],
      styles: {
        A1: { b: true },
        A3: { b: true, fill: '#DDEBF7' },
        B3: { b: true, fill: '#DDEBF7' },
        C3: { b: true, fill: '#DDEBF7' },
        A8: { b: true },
        B8: { b: true },
        C8: { b: true, fmt: '0.0%' },
        C4: { fmt: '0.0%' },
        C5: { fmt: '0.0%' },
        C6: { fmt: '0.0%' },
        C7: { fmt: '0.0%' },
      },
    },
    {
      name: 'Customers',
      rows: [
        ['Customer ID', 'Name', 'Segment', 'Region', 'Rating', 'Customer Since', 'Branch'],
        ...CUST.map((x) => [x.id, x.name, x.segment, x.region, x.rating, x.since, x.branch]),
      ],
      widths: [30, 30, 30, 30, 30, 30, 30], // squashed: everything shows ### or is cut off
      formats: { 5: 'm/d/yyyy' },
    },
  ]);
const NARROW = 30;

// ---------------- Lesson 3 data: a small forecast model ----------------
const FC = [
  ['NYC-01', 412_500_000, 9_100_000],
  ['BOS-01', 238_750_000, 4_900_000],
  ['CHI-01', 305_200_000, 6_850_000],
  ['DAL-01', 187_400_000, 4_200_000],
  ['SFO-02 (closed)', 0, 0],
] as const;
const modelBook = () =>
  makeBook('Deposit_Forecast_FY25.xlsx', [
    {
      name: 'Model',
      header: false,
      rows: [
        ['Deposit Forecast — FY25'],
        ['Assumptions'],
        ['Deposit growth', 0.04],
        ['Net interest margin', 0.021],
        [],
        [],
        ['Branch', 'Deposits ($)', 'Budget NII ($)', 'Forecast Deposits ($)', 'Forecast NII ($)', 'Variance ($)'],
        ...FC.map(([b, dep, bud], i) => [b, dep, bud, `=B${i + 8}*(1+$B$3)`, `=D${i + 8}*$B$4`, `=E${i + 8}-C${i + 8}`]),
      ],
      widths: [140, 110, 110, 140, 120, 100],
      styles: {
        A1: { b: true },
        A2: { b: true, u: true },
        B3: { fmt: '0.0%' },
        B4: { fmt: '0.00%' },
        ...Object.fromEntries(['A7', 'B7', 'C7', 'D7', 'E7', 'F7'].map((a) => [a, { b: true, fill: '#DDEBF7', border: { b: true } }])),
      },
    },
  ]);

export const module: Module = {
  id: 'm03',
  title: 'Formatting like a Banker',
  level: 'Foundation',
  icon: '🎨',
  blurb: 'Number formats that tell the truth, clean borders, frozen headers, custom formats like #,##0,"K" and the blue-input convention every bank model uses.',
  lessons: [
    // =====================================================================
    {
      id: 'm03-l1',
      title: 'Number formats that tell the truth',
      summary: 'Bold headers, dates, thousands separators, decimals, comma style, percentages and accounting format.',
      minutes: 8,
      featured: ['Ctrl+B', 'Ctrl+Shift+#', 'Ctrl+Shift+!', 'Alt H 9', 'Alt H 0', 'Alt H K', 'Ctrl+Shift+%', 'Alt H A N'],
      intro: `A raw extract shows dates as \`45123\`, rates as \`0.0525\` and balances as \`412538.17\`. All correct — and all hard to read. **Formatting changes how a value is *displayed*, never the value itself.** 0.0525 formatted as 5.25% is still 0.0525 when a formula uses it.

That is the key idea: you can format freely without breaking your maths. (The reverse trap: a cell *showing* 5% might really hold 0.0525 — "the numbers don't add up" emails often come from rounding in the display, not in the data.)

**The shortcuts (select the cells first):**
- [[Ctrl+B]] bold — headers.
- [[Ctrl+Shift+#]] date (d-mmm-yy). Unambiguous: 3-Apr-24 cannot be mistaken for 4 March, unlike 3/4/24.
- [[Ctrl+Shift+!]] number with thousands separator and 2 decimals: \`#,##0.00\`.
- [[Alt]] [[H]] [[9]] / [[Alt]] [[H]] [[0]] decrease / increase decimals.
- [[Alt]] [[H]] [[K]] **Comma Style**: thousands separator, 2 decimals, negatives in (parentheses), and aligned decimal points.
- [[Ctrl+Shift+%]] percent (0 decimals — add some with Alt H 0).
- [[Alt]] [[H]] [[A]] [[N]] **Accounting**: like Comma Style with a $ sign.

**Banker conventions:** whole dollars for large balances (cents are noise in a $400M book), 2 decimals for rates, negatives in parentheses, and the $ sign only on the first row and the total — not on every line.

**Common mistakes**
- Formatting the header row along with the numbers (start your selection on row 2).
- Typing \`5%\` into a cell that already holds 0.05 — you get 0.0005 formatted as 0%.`,
      workbooks: () => [loanListBook()],
      start: { cell: 'A1' },
      tasks: [
        {
          id: 't1',
          title: 'Bold the header row',
          instruction: 'Select the header row **A1:G1** ([[Shift+→]] or [[Ctrl+Shift+→]] from A1) and press [[Ctrl+B]].',
          why: 'A bold header is the cheapest signal that "this row is labels, not data". It also helps Excel\'s own tools (sort, filter, pivot) guess that row 1 is a header.',
          hints: ['From A1, Ctrl+Shift+→ selects to G1.', 'Ctrl+B toggles bold on the whole selection.'],
          check: (c) => {
            const bad = cellsOf('A1:G1').find((a) => !c.style(a).b);
            return bad ? `${bad} is not bold yet — select A1:G1 and press Ctrl+B.` : true;
          },
          solution: [{ select: 'A1:G1' }, { cmd: 'fmt.bold' }],
        },
        {
          id: 't2',
          title: 'Turn serial numbers into dates',
          instruction: `Column C shows numbers like 44000 — those are dates stored as day counts since 1900. Select **C2:C${L1_LAST}** and press [[Ctrl+Shift+#]].`,
          why: 'Excel stores every date as a whole number (1 = 1-Jan-1900). Extracts often lose the date format, but the value is fine — you only need to change the display. d-mmm-yy is the safest format to send to colleagues in other countries.',
          hints: [`Click C2, then Ctrl+Shift+↓ — it stops at C${L1_LAST}.`, 'Ctrl+Shift+# (Shift+3 is #).'],
          check: (c) => fmtAll(c, `C2:C${L1_LAST}`, (f) => isDateFmt(f), 'Origination dates should use a date format'),
          solution: [{ select: `C2:C${L1_LAST}` }, { cmd: 'fmt.date' }],
        },
        {
          id: 't3',
          title: 'Whole dollars for loan amounts',
          instruction: `Select the amounts **D2:D${L1_LAST}**, press [[Ctrl+Shift+!]] (thousands separator, 2 decimals), then [[Alt]] [[H]] [[9]] twice to drop the decimals.`,
          why: 'Original loan amounts are round numbers — ".00" on every line is clutter that makes a column harder to scan. The thousands separator lets the eye see "three hundred thousand" instantly instead of counting digits.',
          hints: ['Ctrl+Shift+! applies #,##0.00.', 'Alt, H, 9 removes one decimal each time — do it twice.', 'The format should end up as #,##0.'],
          check: (c) => fmtAll(c, `D2:D${L1_LAST}`, (f) => hasThousands(f) && decimals(f) === 0, 'Amounts should show a thousands separator and no decimals'),
          solution: [{ select: `D2:D${L1_LAST}` }, { cmd: 'fmt.number' }, { cmd: 'fmt.decDec' }, { cmd: 'fmt.decDec' }],
        },
        {
          id: 't4',
          title: 'Comma Style for balances',
          instruction: `Select the balances **E2:E${L1_LAST}** and apply **Comma Style** with [[Alt]] [[H]] [[K]].`,
          why: 'Balances carry cents, so keep 2 decimals. Comma Style also puts negatives in (parentheses) and leaves a small gap on the right so positive and negative numbers line up on the decimal point — the standard look of a bank statement or GL report.',
          hints: ['Tap Alt, then H, then K — one key at a time.', `Select E2:E${L1_LAST} first (not the header).`],
          check: (c) => fmtAll(c, `E2:E${L1_LAST}`, (f) => hasThousands(f) && decimals(f) === 2 && showsParens(f), 'Balances should be in Comma Style (#,##0.00 with negatives in parentheses)'),
          solution: [{ select: `E2:E${L1_LAST}` }, { cmd: 'fmt.comma' }],
        },
        {
          id: 't5',
          title: 'Rates as percentages with 2 decimals',
          instruction: `Select **F2:F${L1_LAST}**, press [[Ctrl+Shift+%]], then [[Alt]] [[H]] [[0]] twice so 0.0525 reads **5.25%**.`,
          why: 'Rates are quoted to the basis point (0.01%), so 0 decimals would show 5% for both 4.50% and 5.49% — a 99 bp difference hidden by formatting. Remember the value underneath does not change: a formula still sees 0.0525.',
          hints: ['Ctrl+Shift+% gives 0% — no decimals.', 'Alt, H, 0 adds one decimal each time. Twice → 0.00%.'],
          check: (c) => fmtAll(c, `F2:F${L1_LAST}`, (f) => f.includes('%') && decimals(f) === 2, 'Rates should be percentages with 2 decimals (0.00%)'),
          solution: [{ select: `F2:F${L1_LAST}` }, { cmd: 'fmt.percent' }, { cmd: 'fmt.decInc' }, { cmd: 'fmt.decInc' }],
        },
        {
          id: 't6',
          title: 'Accounting format on the total',
          instruction: `Select the totals **D${TOTAL_ROW}:E${TOTAL_ROW}** and apply **Accounting** format with [[Alt]] [[H]] [[A]] [[N]]. Then press [[Ctrl+B]] to make the total row stand out.`,
          why: 'In financial statements the currency symbol appears on the first line and the total only — on every row it is noise. Accounting format also aligns the $ to the left edge of the cell, so a column of totals looks tidy.',
          hints: [`The totals are in row ${TOTAL_ROW}.`, 'Alt, H, A, N = Accounting Number Format.'],
          check: (c) =>
            all(
              fmtAll(c, `D${TOTAL_ROW}:E${TOTAL_ROW}`, (f) => f.includes('$') && showsParens(f), 'The totals should use Accounting format ($ with negatives in parentheses)'),
              c.style(`D${TOTAL_ROW}`).b && c.style(`E${TOTAL_ROW}`).b ? true : 'Make the totals bold too (Ctrl+B).',
            ),
          solution: [{ select: `D${TOTAL_ROW}:E${TOTAL_ROW}` }, { cmd: 'fmt.accounting' }, { cmd: 'fmt.bold' }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm03-l2',
      title: 'Widths, freeze panes, borders & gridlines',
      summary: 'AutoFit squashed columns, freeze headers, then dress a summary table for a management pack.',
      minutes: 7,
      featured: ['Alt H O I', 'Alt W F F', 'Alt W F R', 'Alt H B A', 'Alt H B T', 'Alt W V G'],
      intro: `Two different jobs, two different styles:

**1. Working data (the Customers sheet)** — you scroll through it, filter it, check it. What matters: every column readable, headers always visible.
- [[Alt]] [[H]] [[O]] [[I]] **AutoFit** column width to the longest entry in the selection. \`#####\` in a cell means "too narrow to show this number" — the value is fine.
- [[Alt]] [[W]] [[F]] [[F]] **Freeze Panes** at the active cell: everything *above* and *left* of it stays put while you scroll. [[Alt]] [[W]] [[F]] [[R]] freezes just the top row. Run Freeze Panes again to unfreeze.

**2. Presentation (the Summary sheet)** — someone else reads it, often printed or pasted into a deck.
- [[Alt]] [[H]] [[B]] [[A]] **All Borders** for a clean grid around a small table.
- [[Alt]] [[H]] [[B]] [[T]] **Thick Box Border** to draw the eye to the number that matters.
- [[Alt]] [[W]] [[V]] [[G]] toggles **gridlines** off: the page suddenly looks like a report instead of a spreadsheet.

**Why freeze at C2, not A2?** Freeze Panes keeps rows above *and* columns left of the active cell. On a customer master you want the header row *and* the ID + Name columns pinned, so you always know whose row you are looking at when you scroll right.

**Common mistakes**
- Freezing with the active cell somewhere in the middle of the sheet (you freeze half the screen).
- Borders on huge raw extracts: slow, and they get in the way when the data is refreshed. Save them for presentation tables.`,
      workbooks: () => [custBook()],
      start: { sheet: 'Customers', cell: 'A1' },
      tasks: [
        {
          id: 't1',
          title: 'AutoFit the squashed columns',
          instruction: 'Every column on **Customers** is too narrow. Press [[Ctrl+A]] to select the table, then [[Alt]] [[H]] [[O]] [[I]] to AutoFit all the columns at once.',
          why: 'Reading truncated names or ##### dates is how mistakes slip through a review. AutoFit sizes each column to its longest entry in one go — much faster than double-clicking every column border.',
          hints: ['Ctrl+A from inside the data selects A1:G61.', 'Tap Alt, H, O, I one after another (Home ▸ Format ▸ AutoFit Column Width).'],
          check: (c) => {
            const w = c.sheet('Customers')!.colWidths;
            const bad = [0, 1, 2, 3, 4, 5, 6].find((i) => !((w[i] ?? 72) > NARROW + 5));
            return bad === undefined ? true : `Column ${'ABCDEFG'[bad]} is still squashed — select the whole table and AutoFit (Alt H O I).`;
          },
          solution: [{ select: `Customers!A1:G${CUST_LAST}` }, { cmd: 'col.autofit' }],
        },
        {
          id: 't2',
          title: 'Freeze the header and the ID + Name columns',
          instruction: 'Click **C2** and press [[Alt]] [[W]] [[F]] [[F]] (Freeze Panes). Row 1 and columns A:B now stay on screen when you scroll down or right.',
          why: 'Freeze Panes pins everything above and to the left of the active cell. With 60 customers (or 60,000) you always see the column headers and whose row you are on.',
          hints: ['The active cell decides what freezes: rows above it, columns to its left.', 'Click C2, then Alt, W, F, F. (If something was already frozen, the same keys unfreeze — run it again.)'],
          check: (c) => {
            const fz = c.sheet('Customers')!.freeze;
            return fz && fz.rows === 1 && fz.cols === 2 ? true : fz && (fz.rows || fz.cols) ? `Frozen at ${fz.rows} row(s) and ${fz.cols} column(s) — unfreeze, click C2 and freeze again.` : 'Click C2 and use Freeze Panes (Alt W F F).';
          },
          solution: [{ select: 'Customers!C2' }, { cmd: 'view.freezePanes' }],
        },
        {
          id: 't3',
          title: 'All borders on the summary table',
          instruction: 'Switch to the **Summary** sheet ([[Ctrl+PgUp]]). Select the table **A3:C8** and apply **All Borders** with [[Alt]] [[H]] [[B]] [[A]].',
          why: 'A small summary table that will be pasted into an email or a slide needs its own structure — once gridlines are off (in a minute), borders are the only lines left.',
          hints: ['Summary is the sheet to the left of Customers.', 'Select A3:C8, then Alt, H, B, A.'],
          check: (c) => {
            const bad = cellsOf('A3:C8').find((a) => {
              const b = c.style(a).border;
              return !(b?.t && b.b && b.l && b.r);
            });
            return bad ? `${bad} is missing a border — select A3:C8 and use All Borders.` : true;
          },
          solution: [{ sheetTab: 'Summary' }, { select: 'A3:C8' }, { cmd: 'border.all' }],
        },
        {
          id: 't4',
          title: 'Thick box around the headline number',
          instruction: 'Select **B8** — total customers, the number your manager will quote — and apply a **Thick Box Border** with [[Alt]] [[H]] [[B]] [[T]].',
          why: 'Good reports guide the eye. One heavy box tells the reader "this is the answer" without them hunting through the table. Use it sparingly: if everything is highlighted, nothing is.',
          hints: ['Click B8.', 'Alt, H, B, T = Thick Box Border.'],
          check: (c) => {
            const b = c.style('B8').border;
            return b?.thick && b.t && b.b && b.l && b.r ? true : 'B8 should have a thick box border (Alt H B T).';
          },
          solution: [{ select: 'B8' }, { cmd: 'border.thick' }],
        },
        {
          id: 't5',
          title: 'Turn gridlines off',
          instruction: 'Still on **Summary**, press [[Alt]] [[W]] [[V]] [[G]] to hide the gridlines.',
          why: 'Gridlines are a working aid, not part of a report. With them off, your borders and fills carry the structure and the sheet reads like a finished page. It is a per-sheet setting, so the Customers working sheet keeps its gridlines.',
          hints: ['View tab ▸ Gridlines checkbox. Keys: Alt, W, V, G.'],
          check: (c) => (c.sheet('Summary')!.showGridlines === false ? true : 'Hide the gridlines on the Summary sheet (Alt W V G).'),
          solution: [{ sheetTab: 'Summary' }, { cmd: 'view.gridlines' }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm03-l3',
      title: 'Custom formats & the blue-input convention',
      summary: 'Ctrl+1 custom formats: thousands as K, negatives in parentheses, zeros as dashes; blue font and fill for inputs.',
      minutes: 9,
      featured: ['Ctrl+1', '#,##0,"K"', '#,##0_);(#,##0);"-"', 'Alt H F C', 'Alt H H'],
      intro: `[[Ctrl+1]] opens **Format Cells**. Under **Number ▸ Custom** you can type your own format code. A few characters do all the work:

- \`0\` a digit that is always shown · \`#\` a digit shown only if needed · \`,\` between digits = thousands separator.
- A \`,\` at the **end** of the number part divides the display by 1,000: \`#,##0,"K"\` shows 412,500,000 as **412,500K**. (\`,,\` divides by a million.)
- Text in quotes is shown as-is: \`"K"\`, \`"x"\`, \`"bps"\`.
- Up to **four sections** separated by \`;\` → *positive* ; *negative* ; *zero* ; *text*. So \`#,##0_);(#,##0);"-"\` shows positives normally, negatives in (parentheses) and zeros as a dash. The \`_)\` adds a space the width of ")" so positives line up with negatives.

Again: the format only changes the display. 412,500K is still 412500000 in every formula — which is exactly why it is safe.

**The colour convention — why bankers colour inputs blue.** In every bank, rating agency and deal model you will see:
- **Blue font** = a hard-coded input (an assumption or a number pasted in from a source).
- **Black font** = a formula.
- (Green font = a link to another sheet or file, in many shops.)

Reviewers check the blue cells against sources and the black cells for logic. If an input hides among formulas, nobody checks it and a stale number lives in the model for years. Many teams also give input cells a **light fill** so they are visible from across the room.

**Common mistakes**
- Typing numbers *over* formulas to "fix" a result — the cell is now an unlabelled hard-code. If you must override, colour it blue so it is visible.
- Using \`,"K"\` and then dividing by 1000 in the formula as well → shows thousands of thousands.`,
      workbooks: () => [modelBook()],
      start: { cell: 'A1' },
      tasks: [
        {
          id: 't1',
          title: 'Show the money in thousands',
          instruction: 'Select the money block **B8:E12** and press [[Ctrl+1]]. Choose **Custom** and type the format `#,##0,"K"`, then OK. 412,500,000 now reads **412,500K**.',
          why: 'Nine-digit numbers are unreadable in a table. Showing thousands keeps the precision in the cell (the formulas still use the full value) while the reader sees just enough digits — much safer than dividing by 1,000 in the formulas.',
          hints: ['Ctrl+1 ▸ Number tab ▸ Custom ▸ Type box.', 'The trailing comma before "K" is what divides the display by 1,000.', 'Exact code: #,##0,"K"'],
          check: (c) => fmtAll(c, 'B8:E12', (f) => formatValue(412_500_000, f).replace(/\s/g, '') === '412,500K', 'The money block should use the custom format #,##0,"K"'),
          solution: [{ select: 'B8:E12' }, { custom: (s) => s.setFormat('#,##0,"K"') }],
        },
        {
          id: 't2',
          title: 'Negative variances in parentheses',
          instruction: 'Select the variances **F8:F12**, press [[Ctrl+1]] and enter the custom format `#,##0_);(#,##0)`. Negative variances (missing budget) now show as **(1,234)**.',
          why: 'A minus sign is a single thin character that disappears in a printout or a screenshot. Parentheses are the accounting convention for negatives precisely because they are impossible to miss. The _) on the positive side keeps the digits aligned.',
          hints: ['Two sections separated by a semicolon: positive;negative.', 'Exact code: #,##0_);(#,##0)'],
          check: (c) => fmtAll(c, 'F8:F12', (f) => showsParens(f) && hasThousands(f), 'Variances should show negatives in parentheses, e.g. #,##0_);(#,##0)'),
          solution: [{ select: 'F8:F12' }, { custom: (s) => s.setFormat('#,##0_);(#,##0)') }],
        },
        {
          id: 't3',
          title: 'Zeros as a dash',
          instruction: 'The closed branch in row 12 shows a variance of **0**. Add a third section so zeros appear as a dash: format **F8:F12** as `#,##0_);(#,##0);"-"`.',
          why: 'In a big table, a column of 0s looks like data. A dash says "nothing here, on purpose" and lets the real numbers stand out. The third section of a custom format controls zeros only.',
          hints: ['Sections: positive ; negative ; zero.', 'Add ;"-" to the end of the previous format.'],
          check: (c) =>
            fmtAll(c, 'F8:F12', (f) => showsParens(f) && /^-$/.test(formatValue(0, f).trim()), 'Variances should show zeros as "-" (third section) and negatives in parentheses'),
          solution: [{ select: 'F8:F12' }, { custom: (s) => s.setFormat('#,##0_);(#,##0);"-"') }],
        },
        {
          id: 't4',
          title: 'Blue font for every hard-coded input',
          instruction: 'Colour the inputs **blue**: the assumptions **B3:B4** and the source numbers **B8:C12** (deposits and budget). Select each block and use the Font Color drop-down ([[Alt]] [[H]] [[F]] [[C]]) to pick **Blue**. Leave the formula columns D:F black.',
          why: 'This is the single most important formatting convention in banking models. A reviewer can see at a glance which numbers came from outside (check them against the source) and which are calculated (check the logic). A hard-coded number in a formula column is the classic hidden model error.',
          hints: ['Two blocks: B3:B4, then B8:C12.', 'Alt, H, F, C opens the font colour palette — pick a blue (e.g. "Blue" in Standard Colors).', 'Do NOT colour D8:F12 — those are formulas.'],
          check: (c) => {
            const bad = [...cellsOf('B3:B4'), ...cellsOf('B8:C12')].find((a) => !isBlue(c.style(a).color));
            if (bad) return `${bad} is an input — its font should be blue.`;
            const wrong = cellsOf('D8:F12').find((a) => isBlue(c.style(a).color));
            return wrong ? `${wrong} is a formula — keep its font black.` : true;
          },
          solution: [
            { custom: (s) => (s.lastFontColor = '#0070C0') },
            { select: 'B3:B4' },
            { cmd: 'fmt.fontColor' },
            { select: 'B8:C12' },
            { cmd: 'fmt.fontColor' },
          ],
        },
        {
          id: 't5',
          title: 'Fill the assumption cells',
          instruction: 'Select the assumptions **B3:B4** and give them a light fill colour with [[Alt]] [[H]] [[H]] (light yellow is the classic choice).',
          why: 'Assumptions are the cells people are *supposed* to change. A fill makes them obvious to whoever picks up the model next — "change the yellow cells, touch nothing else".',
          hints: ['Alt, H, H opens the fill colour palette.', 'Any light colour works; light yellow is the convention in many banks.'],
          check: (c) => {
            const bad = cellsOf('B3:B4').find((a) => !hasFill(c.style(a).fill));
            return bad ? `${bad} needs a fill colour.` : true;
          },
          solution: [{ custom: (s) => (s.lastFill = '#FFF2CC') }, { select: 'B3:B4' }, { cmd: 'fmt.fill' }],
        },
      ],
    },
  ],
  quiz: [
    { kind: 'keys', q: 'Apply the number format with thousands separator and 2 decimals.', cmd: 'fmt.number', keys: 'Ctrl+Shift+!', explain: 'Ctrl+Shift+! applies #,##0.00.' },
    { kind: 'keys', q: 'Open the Format Cells dialog.', cmd: 'fmt.cells', keys: 'Ctrl+1', explain: 'Ctrl+1 opens Format Cells — the home of custom number formats.' },
    { kind: 'keys', q: 'Freeze panes at the active cell.', cmd: 'view.freezePanes', keys: 'Alt W F F', explain: 'Everything above and to the left of the active cell stays visible.' },
    { kind: 'keys', q: 'AutoFit the selected columns.', cmd: 'col.autofit', keys: 'Alt H O I', explain: 'Home ▸ Format ▸ AutoFit Column Width.' },
    {
      kind: 'mc',
      q: 'A cell holds 0.0525 and is formatted as 0%. It shows 5%. What does =A1*100 return?',
      options: ['5', '5.25', '500', '#VALUE!'],
      answer: 1,
      explain: 'Formatting only changes the display; formulas always use the full stored value 0.0525.',
    },
    {
      kind: 'mc',
      q: 'What does the custom format  #,##0,"K"  show for 2,450,000?',
      options: ['2,450,000K', '2,450K', '2K', '2.45M'],
      answer: 1,
      explain: 'A trailing comma divides the display by 1,000; "K" is literal text.',
    },
    {
      kind: 'mc',
      q: 'In  #,##0_);(#,##0);"-"  what does the third section control?',
      options: ['Text', 'Negative numbers', 'Zero values', 'Errors'],
      answer: 2,
      explain: 'Sections are positive ; negative ; zero ; text.',
    },
    {
      kind: 'mc',
      q: 'In a bank model, a cell has blue font. What does that tell a reviewer?',
      options: ['It is a formula', 'It is a hard-coded input or assumption', 'It links to another file', 'It has an error'],
      answer: 1,
      explain: 'Blue = input, black = formula (green often = link to another sheet). Reviewers check blue cells against sources.',
    },
    {
      kind: 'mc',
      q: 'Which cell should be active when you Freeze Panes to keep row 1 AND columns A:B visible?',
      options: ['A1', 'B1', 'C2', 'B2'],
      answer: 2,
      explain: 'Freeze Panes keeps rows above and columns left of the active cell — C2 freezes row 1 and columns A:B.',
    },
    {
      kind: 'formula',
      q: 'B2 holds 2450000. Use TEXT to return it as text with a thousands separator: "2,450,000".',
      grid: [
        ['Item', 'Value', 'Label'],
        ['Deposits', 2450000, ''],
      ],
      at: 'C2',
      expect: '2,450,000',
      model: '=TEXT(B2,"#,##0")',
      explain: 'TEXT applies a number format inside a formula — handy for labels like "Deposits: 2,450,000".',
      mustUse: ['TEXT'],
    },
  ],
};
