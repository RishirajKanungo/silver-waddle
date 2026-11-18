import type { Module, SolutionStep } from '../types';
import { makeBook, transactions, customers, loans, rng, round2, BRANCHES, REGIONS } from '../data';
import { all, approx, valuesEqual } from '../runner';

// ---------------- Lesson 1 data: a transaction extract with a stray note ----------------
const tx = transactions(150, 42);
const txRows = [
  ['Txn ID', 'Date', 'Account', 'Branch', 'Type', 'Channel', 'Amount'],
  ...tx.map((t) => [t.id, t.date, t.acct, t.branch, t.type, t.channel, t.amount]),
];
const LAST_TX_ROW = tx.length + 1; // 151

const txBook = () => {
  const b = makeBook('Transactions_May.xlsx', [
    { name: 'Data', rows: txRows, widths: [90, 90, 90, 80, 90, 80, 100], formats: { 1: 'm/d/yyyy', 6: '#,##0.00' } },
  ]);
  // a forgotten scratch note far below/right of the data — Ctrl+Shift+End will expose it
  b.sheets[0].cells['159,9'] = { v: 'tmp - recheck w/ ops' };
  return b;
};

// ---------------- Lesson 2 data: a loan tape + a tie-out sheet ----------------
const lns = loans(customers(40, 5), 80, 13);
const tapeRows = [
  ['Loan ID', 'Customer', 'Product', 'Orig Date', 'Amount', 'Balance', 'Rate', 'DPD', 'Status', 'Branch'],
  ...lns.map((l) => [l.id, l.cust, l.product, l.orig, l.amount, l.balance, l.rate, l.dpd, l.status, l.branch]),
];
const BAL_SUM = round2(lns.reduce((a, l) => a + l.balance, 0));
const TAPE_LAST = lns.length + 1; // 81

const tapeBook = () =>
  makeBook('Loan_Tape_Apr.xlsx', [
    {
      name: 'Tape',
      rows: tapeRows,
      widths: [90, 80, 100, 85, 90, 100, 60, 50, 90, 70],
      formats: { 3: 'm/d/yyyy', 4: '#,##0', 5: '#,##0.00', 6: '0.00%' },
    },
    {
      name: 'Summary',
      rows: [
        ['Tie-out check', 'Status bar', 'Formula', 'Difference'],
        ['Total balance', '', '', ''],
        ['Number of loans', '', '', ''],
      ],
      widths: [130, 110, 110, 100],
      styles: { B2: { fmt: '#,##0.00' }, C2: { fmt: '#,##0.00' }, D2: { fmt: '#,##0.00' } },
    },
  ]);

// ---------------- Lesson 3 data: branch deposits, January vs February ----------------
const r3 = rng(77);
const BR = BRANCHES.slice(0, 10);
const brRegion = BR.map((_, i) => REGIONS[i % REGIONS.length]);
const jan = BR.map(() => round2(80 + r3() * 340));
const feb = jan.map((x) => round2(x * (0.94 + r3() * 0.12)));
const NEW_BRANCH = ['PHX-02', 'Southwest', 45.2] as const;

const depBook = () =>
  makeBook('Branch_Deposits_2024.xlsx', [
    {
      name: 'Jan',
      rows: [['Branch', 'Region', 'Deposits ($M)'], ...BR.map((b, i) => [b, brRegion[i], jan[i]])],
      widths: [90, 100, 110],
      formats: { 2: '#,##0.0' },
    },
    {
      name: 'Feb',
      rows: [
        ['', '', 'Deposits ($M)', 'Month', 'Change vs Jan'],
        ...BR.map((_, i) => ['', '', feb[i], '', '']),
        [],
        [],
        [],
        [NEW_BRANCH[0], NEW_BRANCH[1], NEW_BRANCH[2]],
      ],
      widths: [90, 100, 110, 70, 110],
      formats: { 2: '#,##0.0' },
      styles: Object.fromEntries(BR.map((_, i) => [`E${i + 2}`, { fmt: '#,##0.0_);(#,##0.0)' }])),
    },
  ]);

/** Ctrl+Enter: type into the active cell and fill every selected cell with it. */
const ctrlEnter = (range: string, text: string): SolutionStep[] => [
  { select: range },
  {
    custom: (s) => {
      s.startEdit(text, 'enter');
      s.commitEdit('none', true);
    },
  },
];

const isWholeColumn = (c: { r1: number; r2: number }) => c.r1 === 0 && c.r2 > 50000;

export const module: Module = {
  id: 'm02',
  title: 'Selection & Speed',
  level: 'Foundation',
  icon: '⚡',
  blurb: 'Grab whole blocks of data in one keystroke, read totals off the status bar, jump anywhere with the Name Box, and move data around with copy, cut, paste and Ctrl+Enter.',
  lessons: [
    // =====================================================================
    {
      id: 'm02-l1',
      title: 'Select blocks of data in one keystroke',
      summary: 'Shift+Arrows, Ctrl+Shift+Arrows, Ctrl+A, Ctrl+Space and Ctrl+Shift+End.',
      minutes: 7,
      featured: ['Shift+→', 'Ctrl+Shift+↓', 'Ctrl+Shift+→', 'Ctrl+A', 'Ctrl+Space', 'Shift+Space', 'Ctrl+Shift+End'],
      intro: `Almost everything in Excel works on the **selection**: formatting, copying, sorting, charting, deleting. If selecting is slow, everything is slow. The rule is simple: **add Shift to any movement key and it selects instead of moves.**

- [[Shift+→]] / [[Shift+↓]] grow the selection one cell at a time.
- [[Ctrl+Shift+↓]] / [[Ctrl+Shift+→]] grow it to the **edge of the data block** — the same jump as Ctrl+Arrow, but selecting everything on the way. 150 rows or 150,000 rows, it is one keystroke.
- [[Ctrl+A]] inside a table selects the **current region** — the whole contiguous block around the active cell. Press it again to select the entire sheet.
- [[Ctrl+Space]] selects the entire **column**, [[Shift+Space]] the entire **row**.
- [[Ctrl+Shift+End]] selects from the active cell to the **last used cell** of the sheet.

**Why not just drag with the mouse?** Dragging over 150 rows overshoots, undershoots and scrolls past. Ctrl+Shift+↓ stops *exactly* on the last row of data, every time — and it tells you something: if it stops early, there is a blank cell in your data.

**Common mistakes**
- Pressing Ctrl+Shift+↓ from a *blank* cell — it then skips to the next filled block (or the bottom of the sheet).
- Expecting Ctrl+A to grab everything when the data has a completely blank row or column in the middle: the current region stops at the gap.
- Forgetting that the **active cell** (the white one inside the selection) is where your typing goes.`,
      workbooks: () => [txBook()],
      start: { cell: 'A1' },
      tasks: [
        {
          id: 't1',
          title: 'Select the header row, one cell at a time',
          instruction: 'From **A1**, hold [[Shift]] and press [[→]] six times so the selection covers the header row **A1:G1**.',
          why: 'Shift+Arrow is precise: perfect when you want *exactly* three cells, not "to the end". Notice the Name Box shows how many rows × columns you have selected while you hold Shift.',
          hints: ['Start on A1 (Ctrl+Home gets you there).', 'Keep Shift held down and tap → six times: B, C, D, E, F, G.'],
          check: (c) => (c.sel.range === 'A1:G1' ? true : `The selection is ${c.sel.range} — it should be exactly A1:G1.`),
          solution: [{ select: 'A1' }, { cmd: 'sel.right' }, { cmd: 'sel.right' }, { cmd: 'sel.right' }, { cmd: 'sel.right' }, { cmd: 'sel.right' }, { cmd: 'sel.right' }],
          mustUseKeys: ['sel.right'],
        },
        {
          id: 't2',
          title: 'Grab a whole column of amounts',
          instruction: `Click **G2** (the first Amount), then press [[Ctrl+Shift+↓]] to select every amount down to the last transaction (row ${LAST_TX_ROW}).`,
          why: 'Starting on G2 rather than G1 leaves the header out — exactly what you want before formatting numbers or reading a total off the status bar. One keystroke, no scrolling, no overshoot.',
          hints: ['Click G2, or from A2 press Ctrl+→.', 'Hold Ctrl and Shift together, then tap ↓ once.'],
          check: (c) => (c.sel.range === `G2:G${LAST_TX_ROW}` ? true : `The selection is ${c.sel.range} — start on G2 and press Ctrl+Shift+↓ to reach G${LAST_TX_ROW}.`),
          solution: [{ select: 'G2' }, { cmd: 'sel.edgeDown' }],
          mustUseKeys: ['sel.edgeDown'],
        },
        {
          id: 't3',
          title: 'Select the entire table from A1',
          instruction: `Go to **A1** ([[Ctrl+Home]]), press [[Ctrl+Shift+→]] to select across the headers, then [[Ctrl+Shift+↓]] to extend down. You should end with **A1:G${LAST_TX_ROW}** selected.`,
          why: 'Right-then-down is the analyst reflex for "select the dataset". It works even when Ctrl+A would not (for example when a note sits right next to the table). Doing it in two steps also lets you sanity-check the width and the height separately.',
          hints: ['Ctrl+Home first, so you start at A1.', 'Ctrl+Shift+→ stops at G1 (last header). Then Ctrl+Shift+↓ — the selection keeps its width and grows down.'],
          check: (c) =>
            all(
              c.sel.range === `A1:G${LAST_TX_ROW}` ? true : `The selection is ${c.sel.range} — it should be A1:G${LAST_TX_ROW}.`,
              c.usedKey('sel.edgeRight') && c.usedKey('sel.edgeDown') ? true : 'Use Ctrl+Shift+→ and then Ctrl+Shift+↓ to build the selection.',
            ),
          solution: [{ cmd: 'nav.ctrlHome' }, { cmd: 'sel.edgeRight' }, { cmd: 'sel.edgeDown' }],
        },
        {
          id: 't4',
          title: 'Ctrl+A: the current region',
          instruction: 'Click any cell inside the data — say **D50** — and press [[Ctrl+A]]. Excel selects the whole block around it, and the active cell stays on D50.',
          why: 'Ctrl+A from inside a table is the fastest "select this dataset" there is — no need to go to A1 first. Excel expands in every direction until it hits a fully blank row and column. That is also why blank rows inside an extract are dangerous: Ctrl+A, sorting and pivots all silently stop at the gap.',
          hints: ['Go to D50 with F5 or the Name Box, or just click it.', 'Ctrl+A once = current region. (Twice = whole sheet.)'],
          check: (c) =>
            all(
              c.used('sel.all') ? true : 'Press Ctrl+A from inside the data.',
              c.sel.active === 'D50' ? true : 'Start from D50 so the active cell stays there.',
              c.sel.range === `A1:G${LAST_TX_ROW}` ? true : `Ctrl+A should select A1:G${LAST_TX_ROW} — you have ${c.sel.range}.`,
            ),
          solution: [{ select: 'D50' }, { cmd: 'sel.all' }],
          mustUseKeys: ['sel.all'],
        },
        {
          id: 't5',
          title: 'Select a whole column with Ctrl+Space',
          instruction: 'Click any cell in column **E** (Type) and press [[Ctrl+Space]] to select the entire column. (Its cousin [[Shift+Space]] selects the entire row.)',
          why: 'Whole-column selection is what you need before inserting/deleting a column, changing its width or applying a format to every future row too. At a bank, extracts get re-pulled each month — formatting the whole column means next month\'s extra rows are formatted as well.',
          hints: ['Any cell in column E works — E1, E2, E77…', 'Ctrl+Space = column, Shift+Space = row.'],
          check: (c) => (c.sel.c1 === 4 && c.sel.c2 === 4 && isWholeColumn(c.sel) ? true : 'Select the whole of column E: click a cell in E, then Ctrl+Space.'),
          solution: [{ select: 'E5' }, { cmd: 'sel.column' }],
          mustUseKeys: ['sel.column'],
        },
        {
          id: 't6',
          title: 'Ctrl+Shift+End exposes stray data',
          instruction: `Press [[Ctrl+Home]], then [[Ctrl+Shift+End]]. The selection runs past the table to **J160** — someone left a scratch note there. Jump to it ([[Ctrl+End]]) and press [[Delete]] to clear it.`,
          why: 'Ctrl+Shift+End selects to the last *used* cell, so it reveals forgotten notes, test numbers or old pastes hiding outside your table. Those stray cells inflate file size, confuse Ctrl+End for colleagues, and — worst case — get swept into a SUM over whole columns. Checking Ctrl+End before sending a file is a good habit.',
          hints: ['Ctrl+Home, then Ctrl+Shift+End — look at how far the selection goes.', 'Ctrl+End jumps to J160. Delete clears it.'],
          check: (c) =>
            all(
              c.usedKey('sel.toEnd') ? true : 'First press Ctrl+Shift+End (from A1) to see how far the used range goes.',
              c.f('J160') === '' ? true : 'The stray note in J160 is still there — go to it and press Delete.',
            ),
          solution: [{ cmd: 'nav.ctrlHome' }, { cmd: 'sel.toEnd' }, { cmd: 'nav.ctrlEnd' }, { cmd: 'edit.clear' }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm02-l2',
      title: 'Name Box, Go To & the status bar',
      summary: 'Type a range to select it, read Sum/Count off the status bar, switch sheets, and prove it with a tie-out formula.',
      minutes: 7,
      featured: ['Name Box', 'F5', 'Ctrl+PgDn', 'Ctrl+PgUp', 'Status bar'],
      intro: `**The Name Box** (left of the formula bar) is not just a display — you can type into it. Type \`F2:F81\` and press [[Enter]] and Excel selects that range. Type \`Tape!H2:H81\` and it switches sheet *and* selects. [[F5]] / [[Ctrl+G]] (Go To) does the same thing in a dialog.

**The status bar** (bottom right) shows live statistics for whatever is selected: **Average**, **Count** and **Sum**. It is the quickest sanity check in Excel — no formula needed. Analysts use it constantly: "the loan tape says 80 loans and $X of balance — does that match the system report?"

**Switching sheets:** [[Ctrl+PgDn]] goes to the next sheet, [[Ctrl+PgUp]] to the previous one (in the browser use [[Ctrl+Alt+PgDn]] / [[Ctrl+Alt+PgUp]] if your browser grabs the keys).

**Why a formula as well?** The status bar disappears the moment you click elsewhere — it is evidence for *you*. A tie-out formula on a Summary sheet is evidence for your reviewer and auditor, and it updates when the data is refreshed. In month-end work you do both: eyeball with the status bar, document with a formula.

**Common mistakes**
- Selecting the header too — Count goes up by one (the status bar Count counts text as well as numbers).
- Reading the Sum off a column that contains numbers stored as text: those are silently skipped.`,
      workbooks: () => [tapeBook()],
      start: { sheet: 'Tape', cell: 'A1' },
      tasks: [
        {
          id: 't1',
          title: 'Select a range from the Name Box',
          instruction: `Click in the **Name Box** (top-left, it currently says A1), type \`F2:F${TAPE_LAST}\` and press [[Enter]]. The whole Balance column is selected.`,
          why: 'When you already know the address — from an email, a reviewer note or a reconciliation break — typing it is faster and more exact than scrolling. It also works for huge ranges like A2:A250000.',
          hints: ['The Name Box is the small box left of the formula bar showing the active cell address.', `Type F2:F${TAPE_LAST} and press Enter.`],
          check: (c) => (c.sel.sheet === 'Tape' && c.sel.range === `F2:F${TAPE_LAST}` ? true : `Select F2:F${TAPE_LAST} on the Tape sheet (you have ${c.sel.range}).`),
          solution: [{ select: `F2:F${TAPE_LAST}` }],
        },
        {
          id: 't2',
          title: 'Read the status bar, record it on Summary',
          instruction: `With the balances selected, look at the **status bar**: note the **Sum** and the **Count**. Then switch to the **Summary** sheet with [[Ctrl+PgDn]] and type them in: the Sum into **B2** (to the nearest dollar is fine) and the Count into **B3**.`,
          why: 'This is the "first look" every analyst does on a new extract: how many records, how much money. Writing the numbers down before you start transforming data gives you a baseline to tie back to at the end.',
          hints: ['The status bar is at the bottom right: Average · Count · Sum.', 'Ctrl+PgDn (or Ctrl+Alt+PgDn) moves to the next sheet — Summary.', 'B2 = the Sum, B3 = the Count (it should be the number of loans).'],
          check: (c) =>
            all(
              typeof c.v('Summary!B2') === 'number' && Math.abs((c.v('Summary!B2') as number) - BAL_SUM) <= 1 ? true : 'Summary!B2 should hold the Sum shown on the status bar for the balances.',
              c.v('Summary!B3') === lns.length ? true : 'Summary!B3 should hold the Count shown on the status bar.',
            ),
          solution: [{ cmd: 'nav.nextSheet' }, { set: { 'Summary!B2': String(Math.round(BAL_SUM)), 'Summary!B3': String(lns.length) } }],
        },
        {
          id: 't3',
          title: 'Go To another sheet in one move',
          instruction: `Press [[F5]] (or click the Name Box), type \`Tape!H2:H${TAPE_LAST}\` and press [[Enter]]. Excel jumps back to the Tape sheet with the DPD (days past due) column selected. Glance at the status bar: what is the Sum of days past due?`,
          why: 'Sheet-qualified addresses (Sheet!Range) are how formulas point at other sheets — the same syntax works in Go To. Being able to read and type them fluently pays off in the next modules.',
          hints: ['The format is SheetName!Range — an exclamation mark separates the sheet from the cells.', `Type Tape!H2:H${TAPE_LAST} into Go To (F5) and press Enter.`],
          check: (c) => (c.sel.sheet === 'Tape' && c.sel.range === `H2:H${TAPE_LAST}` ? true : `Use Go To with Tape!H2:H${TAPE_LAST} — you are on ${c.sel.sheet}!${c.sel.range}.`),
          solution: [{ select: `Tape!H2:H${TAPE_LAST}` }],
        },
        {
          id: 't4',
          title: 'Document the tie-out with a formula',
          instruction: `Go back to **Summary**. In **C2** enter \`=SUM(Tape!F2:F${TAPE_LAST})\` — tip: type \`=SUM(\`, press [[Ctrl+PgUp]] to go to Tape, select the balances with the mouse or [[Ctrl+Shift+↓]], then press [[Enter]]. In **D2** enter \`=C2-B2\` to show the difference.`,
          why: 'D2 should be (nearly) zero: your eyeball number and the formula agree. A visible, live check like this is what reviewers look for — if the tape is re-pulled and the total moves, the difference lights up immediately instead of hiding in a number someone typed.',
          hints: ['Building a formula across sheets: type =SUM( then click the Tape tab — Excel writes Tape! for you.', `The finished formula is =SUM(Tape!F2:F${TAPE_LAST}).`, 'D2 is just =C2-B2.'],
          check: (c) => {
            const f = c.f('Summary!C2').toUpperCase().replace(/\s/g, '');
            return all(
              f.startsWith('=SUM(') && f.includes('TAPE!') ? true : 'Summary!C2 should be a SUM formula that points at the Tape sheet.',
              approx(c.v('Summary!C2'), BAL_SUM, 1e-6) ? true : `Summary!C2 should total the balances F2:F${TAPE_LAST} on Tape.`,
              c.f('Summary!D2').startsWith('=') ? true : 'Summary!D2 should be a formula: =C2-B2.',
              typeof c.v('Summary!D2') === 'number' && Math.abs(c.v('Summary!D2') as number) <= 1 ? true : 'D2 should show a difference of (almost) zero — check B2 and C2.',
            );
          },
          solution: [{ sheetTab: 'Summary' }, { set: { 'Summary!C2': `=SUM(Tape!F2:F${TAPE_LAST})`, 'Summary!D2': '=C2-B2' } }],
        },
      ],
    },
    // =====================================================================
    {
      id: 'm02-l3',
      title: 'Copy, cut, paste & Ctrl+Enter',
      summary: 'Move data between sheets, relocate a stray row, and fill a whole selection with one entry.',
      minutes: 8,
      featured: ['Ctrl+C', 'Ctrl+X', 'Ctrl+V', 'Ctrl+Enter'],
      intro: `**Copy** [[Ctrl+C]] / **Cut** [[Ctrl+X]] / **Paste** [[Ctrl+V]] — you know these from every other app, but Excel adds two twists:

- After Ctrl+C the source gets a **marching-ants** border and stays on the clipboard, so you can paste it into several places. [[Esc]] clears it.
- When you paste, you only need to select the **top-left cell** of the destination. Excel lays the block out from there. (Select a bigger, matching area and Excel repeats the block to fill it.)

**Copy vs Cut:** Copy duplicates; Cut *moves* (the source is cleared when you paste). Use Cut to relocate data without leaving a stale copy behind.

**Ctrl+Enter — fill the selection.** Select a range, type one entry, press [[Ctrl+Enter]] instead of Enter: **every** selected cell gets it. If you type a formula, each cell gets the formula with its references *adjusted* to its own row — exactly as if you had filled it down.

**Why it matters at a bank:** month-end packs are built by stacking monthly extracts. Tagging each block with its month (Ctrl+Enter) and copying the branch list once instead of retyping it removes a whole class of typo-driven breaks.

**Common mistakes**
- Selecting a destination the wrong size ("The copy area and paste area are not the same size").
- Pressing Enter instead of Ctrl+Enter: only the first cell is filled.
- Pasting over data you needed — Ctrl+Z is your friend.`,
      workbooks: () => [depBook()],
      start: { sheet: 'Jan', cell: 'A1' },
      tasks: [
        {
          id: 't1',
          title: 'Copy the branch list to February',
          instruction: 'On **Jan**, select the Branch and Region columns **A1:B11** (A1, then [[Ctrl+Shift+↓]] and [[Shift+→]]) and press [[Ctrl+C]]. Switch to **Feb** ([[Ctrl+PgDn]]), click **A1** and press [[Ctrl+V]].',
          why: 'February\'s extract came with balances only. Copying the labels from January — rather than retyping them — guarantees the branch codes are spelled identically, which matters the moment you look them up or pivot on them.',
          hints: ['From A1: Ctrl+Shift+↓ selects A1:A11, then Shift+→ widens it to B.', 'Ctrl+C, Ctrl+PgDn to go to Feb, click A1, Ctrl+V.'],
          check: (c) =>
            all(
              valuesEqual(c, 'Feb!A1:A11', ['Branch', ...BR], 'Feb Branch column'),
              valuesEqual(c, 'Feb!B1:B11', ['Region', ...brRegion], 'Feb Region column'),
            ),
          solution: [{ select: 'Jan!A1:B11' }, { cmd: 'clip.copy' }, { cmd: 'nav.nextSheet' }, { select: 'A1' }, { cmd: 'clip.paste' }],
        },
        {
          id: 't2',
          title: 'Move a stray row with Cut',
          instruction: `A new branch, **${NEW_BRANCH[0]}**, was appended at the bottom of Feb in row **15**, with gaps above it. Select **A15:C15**, press [[Ctrl+X]], click **A12** and press [[Ctrl+V]] so it joins the table.`,
          why: 'Blank rows split a table into two "regions": Ctrl+Shift+↓, Ctrl+A, sorting and pivots would all miss the new branch. Cut moves it and leaves nothing behind — copy would leave a duplicate that someone later double-counts.',
          hints: ['Select A15:C15 (click A15, Shift+→ twice).', 'Ctrl+X, then click A12 and Ctrl+V. Row 15 should end up empty.'],
          check: (c) =>
            all(
              c.v('Feb!A12') === NEW_BRANCH[0] ? true : `Feb!A12 should now hold ${NEW_BRANCH[0]}.`,
              c.v('Feb!C12') === NEW_BRANCH[2] ? true : `Feb!C12 should hold its deposits (${NEW_BRANCH[2]}).`,
              c.f('Feb!A15') === '' && c.f('Feb!C15') === '' ? true : 'Row 15 should be empty after the move — use Cut (Ctrl+X), not Copy.',
            ),
          solution: [{ select: 'Feb!A15:C15' }, { cmd: 'clip.cut' }, { select: 'Feb!A12' }, { cmd: 'clip.paste' }],
        },
        {
          id: 't3',
          title: 'Tag every row with Ctrl+Enter',
          instruction: 'On Feb, select **D2:D12**, type `Feb` and press [[Ctrl+Enter]] (not plain Enter). All eleven cells fill at once.',
          why: 'When you later stack January and February into one table, this "Month" column is what tells the rows apart. Ctrl+Enter is the fastest way to stamp a constant onto a block — no copying, no dragging.',
          hints: ['Column D is empty, so Ctrl+Shift+↓ would run to the bottom of the sheet. Type D2:D12 in the Name Box instead (or Shift+↓ from D2).', 'Type Feb, then hold Ctrl and press Enter.'],
          check: (c) =>
            all(
              c.used('edit.fillSelection') ? true : 'Type Feb into the selection and press Ctrl+Enter (not Enter).',
              valuesEqual(c, 'Feb!D2:D12', Array(11).fill('Feb'), 'Month column'),
            ),
          solution: ctrlEnter('Feb!D2:D12', 'Feb'),
        },
        {
          id: 't4',
          title: 'Ctrl+Enter a formula',
          instruction: 'Select **E2:E11** on Feb and type `=C2-Jan!C2`, then press [[Ctrl+Enter]]. Each row now shows its February change versus January — the references moved down row by row.',
          why: 'With a formula, Ctrl+Enter behaves like Fill Down: E5 gets =C5-Jan!C5. The new branch in row 12 is deliberately left out — it has no January balance, and a formula there would show a misleading "change" equal to its whole balance.',
          hints: ['Select E2:E11 (Name Box, or click E2 and Shift+↓).', 'Type =C2-Jan!C2 — it is written for the active cell E2 — then Ctrl+Enter.'],
          check: (c) => {
            const ins = c.inputs('Feb!E2:E11').map((x) => x.toUpperCase());
            const bad = ins.findIndex((x, i) => x.replace(/\s/g, '') !== `=C${i + 2}-JAN!C${i + 2}`);
            return all(
              bad < 0 ? true : `Feb!E${bad + 2} should contain =C${bad + 2}-Jan!C${bad + 2} — type the formula once and press Ctrl+Enter.`,
              valuesEqual(c, 'Feb!E2:E11', feb.map((x, i) => x - jan[i]), 'Change vs Jan'),
            );
          },
          solution: ctrlEnter('Feb!E2:E11', '=C2-Jan!C2'),
        },
      ],
    },
  ],
  quiz: [
    { kind: 'keys', q: 'Select from the active cell down to the last filled cell of this block.', cmd: 'sel.edgeDown', keys: 'Ctrl+Shift+↓', explain: 'Add Shift to Ctrl+↓ and Excel selects everything on the way to the edge of the data.' },
    { kind: 'keys', q: 'Select the current region (the whole table around the active cell).', cmd: 'sel.all', keys: 'Ctrl+A', explain: 'Ctrl+A inside data selects the current region; press it again for the whole sheet.' },
    { kind: 'keys', q: 'Select the entire row of the active cell.', cmd: 'sel.row', keys: 'Shift+Space', explain: 'Shift+Space = row, Ctrl+Space = column.' },
    {
      kind: 'mc',
      q: 'You press Ctrl+A inside a 5,000-row extract, but the selection stops at row 2,311. What is the most likely reason?',
      options: ['Ctrl+A is limited to 2,310 rows', 'Row 2,312 is completely blank, so the current region ends there', 'The sheet is protected', 'The data is sorted'],
      answer: 1,
      explain: 'The current region stops at a fully blank row or column. A blank row inside an extract is a data-quality red flag — it also breaks sorting, filters and pivots.',
    },
    {
      kind: 'mc',
      q: 'You select B2:B101 (100 amounts). The status bar shows Count: 100 but the Sum looks too low. What should you suspect first?',
      options: ['Some amounts are stored as text, so Sum skips them', 'The status bar only sums visible digits', 'Count includes the header', 'Excel rounds the Sum to thousands'],
      answer: 0,
      explain: 'Count counts every non-empty cell, Sum only adds real numbers. Numbers stored as text (common in CSV extracts) are counted but not summed.',
    },
    {
      kind: 'mc',
      q: 'What does typing  Tape!H2:H81  into the Name Box and pressing Enter do?',
      options: ['Creates a named range called Tape', 'Jumps to the Tape sheet and selects H2:H81', 'Sums H2:H81 on Tape', 'Nothing — the Name Box is read-only'],
      answer: 1,
      explain: 'The Name Box (and Go To, F5) accept any address, including sheet-qualified ranges.',
    },
    {
      kind: 'mc',
      q: 'You select D2:D50, type Q2 and press Ctrl+Enter. What happens?',
      options: ['Only D2 gets Q2', 'All 49 cells get Q2', 'Excel fills a series Q2, Q3, Q4…', 'The selection moves down one row'],
      answer: 1,
      explain: 'Ctrl+Enter enters the same thing into every selected cell. (A formula would be adjusted for each row, like Fill Down.)',
    },
    { kind: 'keys', q: 'Move to the next worksheet.', cmd: 'nav.nextSheet', keys: 'Ctrl+PgDn', explain: 'Ctrl+PgDn / Ctrl+PgUp step through the sheet tabs (Ctrl+Alt+PgDn in the browser).' },
    { kind: 'keys', q: 'Cut the selection so you can move it.', cmd: 'clip.cut', keys: 'Ctrl+X', explain: 'Cut + Paste moves data and leaves the source empty; Copy leaves the original in place.' },
    {
      kind: 'formula',
      q: 'Write a tie-out formula in D2 that totals the balances in B2:B6.',
      grid: [
        ['Loan', 'Balance', '', 'Check'],
        ['LN-1', 125000, '', ''],
        ['LN-2', 98000.5, '', ''],
        ['LN-3', 310250, '', ''],
        ['LN-4', 45999.5, '', ''],
        ['LN-5', 76000, '', ''],
      ],
      at: 'D2',
      expect: 655250,
      model: '=SUM(B2:B6)',
      explain: 'A formula documents the check and updates when the data changes — the status bar only shows it while the cells are selected.',
      mustUse: ['SUM'],
    },
  ],
};
