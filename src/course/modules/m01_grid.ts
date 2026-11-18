import type { Module } from '../types';
import { makeBook, transactions, BRANCHES } from '../data';
import { all } from '../runner';

const tx = transactions(200, 21);
const txRows = [
  ['Txn ID', 'Date', 'Account', 'Branch', 'Type', 'Channel', 'Amount'],
  ...tx.map((t) => [t.id, t.date, t.acct, t.branch, t.type, t.channel, t.amount]),
];

const txBook = () =>
  makeBook('Transactions_Q2.xlsx', [
    { name: 'Data', rows: txRows, widths: [90, 90, 90, 80, 90, 80, 100], formats: { 1: 'm/d/yyyy', 6: '#,##0.00' } },
    { name: 'Notes', rows: [['Analyst notes'], ['Extract pulled from the data lake: core_banking.transactions_q2']], header: true, widths: [400] },
  ]);

export const module: Module = {
  id: 'm01',
  title: 'Welcome to the Grid',
  level: 'Zero',
  icon: '🧭',
  blurb: 'Cells, typing, editing, undo, and the keyboard moves every analyst uses 500 times a day.',
  lessons: [
    {
      id: 'm01-l1',
      title: 'Cells, typing & editing',
      summary: 'Enter text and numbers, fix typos with F2, clear and undo.',
      minutes: 6,
      featured: ['F2', 'Enter', 'Tab', 'Esc', 'Delete', 'Ctrl+Z'],
      intro: `A worksheet is a grid. **Columns** are letters (A, B, C…), **rows** are numbers (1, 2, 3…). Where they cross is a **cell**, named by column then row — **B3** is column B, row 3.

The cell with the thick green border is the **active cell**. Its address shows in the **Name Box** (top-left) and its contents in the **Formula Bar**.

**Two ways to type into a cell — and why it matters:**
- Just start typing → you *replace* whatever was there (Enter mode).
- Press [[F2]] → you *edit* the existing contents, cursor at the end (Edit mode).

Finish an entry with [[Enter]] (moves down) or [[Tab]] (moves right). Press [[Esc]] to cancel. Made a mistake? [[Ctrl+Z]] undoes it.`,
      workbooks: () => [
        makeBook('Branch_Deposits.xlsx', [
          {
            name: 'Sheet1',
            rows: [
              ['', '', ''],
              ['Branch', 'City', 'Deposits ($M)'],
              ['NYC-01', 'New York', 412.5],
              ['CHI-01', 'Chicgo', 233.1],
              ['DAL-01', 'Dallas', 198.7],
              ['SEA-01', 'Seattle', 156.2],
              ['TMP-99', 'DELETE ME', 0],
            ],
            header: false,
            widths: [90, 110, 110],
            styles: { A2: { b: true, fill: '#DDEBF7' }, B2: { b: true, fill: '#DDEBF7' }, C2: { b: true, fill: '#DDEBF7' } },
          },
        ]),
      ],
      start: { cell: 'A1' },
      tasks: [
        {
          id: 't1',
          title: 'Give the report a title',
          instruction: 'The active cell is **A1**. Type `Branch Deposit Report` and press [[Enter]].',
          why: 'Every report you hand to a manager should say what it is in A1 — it is the first cell anyone sees.',
          hints: ['Just start typing — no need to click anything first.', 'Press Enter when done to lock the entry in.'],
          check: (c) => (c.f('A1').trim().toLowerCase() === 'branch deposit report' ? true : 'A1 should read "Branch Deposit Report".'),
          solution: [{ set: { A1: 'Branch Deposit Report' } }],
        },
        {
          id: 't2',
          title: 'Fix a typo with F2',
          instruction: 'Cell **B4** says `Chicgo`. Move there with the arrow keys, press [[F2]] to edit, fix it to `Chicago`, and press [[Enter]].',
          why: 'F2 keeps the existing text so you only fix the mistake. Typing over a long formula by accident is one of the most common ways analysts break a model.',
          hints: ['From A2, press ↓ twice and → once to reach B4.', 'In Edit mode the arrow keys move the text cursor instead of changing cells.'],
          check: (c) => (c.v('B4') === 'Chicago' ? true : 'B4 should say "Chicago".'),
          solution: [{ set: { B4: 'Chicago' } }],
        },
        {
          id: 't3',
          title: 'Clear a test row',
          instruction: 'Row 7 holds a test branch. Select **A7:C7** (click A7, then [[Shift+→]] twice) and press [[Delete]] to clear it.',
          why: 'Delete clears *contents* but keeps formatting. Later you will learn to delete whole rows; for now, clearing is the safe move.',
          hints: ['Hold Shift and press → to grow the selection.', 'Delete clears every selected cell at once.'],
          check: (c) => all(c.f('A7') === '' ? true : 'A7 still has text.', c.f('B7') === '' ? true : 'B7 still has text.', c.f('C7') === '' ? true : 'C7 still has a value.'),
          solution: [{ select: 'A7:C7' }, { cmd: 'edit.clear' }],
        },
        {
          id: 't4',
          title: 'Add a branch',
          instruction: 'In row 7 enter a new branch: **A7** `MIA-01`, **B7** `Miami`, **C7** `141.9`. Use [[Tab]] to move right between cells and [[Enter]] at the end.',
          why: 'Tab-Tab-Enter is the fastest way to enter rows of data: after Enter, Excel jumps back to the column where you started.',
          hints: ['Type MIA-01, press Tab, type Miami, press Tab, type 141.9, press Enter.'],
          check: (c) => all(c.v('A7') === 'MIA-01' ? true : 'A7 should be MIA-01', c.v('B7') === 'Miami' ? true : 'B7 should be Miami', c.v('C7') === 141.9 ? true : 'C7 should be the number 141.9'),
          solution: [{ set: { A7: 'MIA-01', B7: 'Miami', C7: '141.9' } }],
        },
        {
          id: 't5',
          title: 'Undo is your safety net',
          instruction: 'Type `oops` into **C3** (replacing 412.5) and press [[Enter]]. Then press [[Ctrl+Z]] to bring 412.5 back.',
          why: 'Ctrl+Z works for almost everything: typing, deleting, formatting, sorting. Knowing you can undo makes you fast and fearless.',
          hints: ['After Enter, press Ctrl+Z once.'],
          check: (c) => (c.v('C3') === 412.5 && c.used('edit.undo') ? true : c.used('edit.undo') ? 'C3 should be back to 412.5.' : 'Type oops into C3, press Enter, then Ctrl+Z.'),
          solution: [{ set: { C3: 'oops' } }, { cmd: 'edit.undo' }],
        },
      ],
    },
    {
      id: 'm01-l2',
      title: 'Fly around with Ctrl + Arrows',
      summary: 'Jump to the edges of 200 rows of data instantly, use Ctrl+Home, Ctrl+End and Go To.',
      minutes: 6,
      featured: ['Ctrl+↓', 'Ctrl+→', 'Ctrl+Home', 'Ctrl+End', 'F5'],
      intro: `Real extracts have thousands of rows. Scrolling with the mouse is slow and you lose your place. Instead:

- [[Ctrl+↓]] jumps to the **last filled cell** in the column (the edge of the data block). [[Ctrl+↑]], [[Ctrl+←]], [[Ctrl+→]] work the same way.
- [[Ctrl+Home]] goes back to **A1**. [[Ctrl+End]] goes to the **last used cell** of the sheet.
- [[F5]] (or [[Ctrl+G]]) opens **Go To** — type any address like \`F150\` and press Enter. You can also click the **Name Box**, type an address and press Enter.

**How Ctrl+Arrow decides where to stop:** if the next cell has data, it runs to the last filled cell before a blank. If the next cell is blank, it skips blanks to the next filled cell. That is why a single blank row in an extract can "trap" you — a classic data-quality red flag.`,
      workbooks: () => [txBook()],
      start: { cell: 'A1' },
      tasks: [
        {
          id: 't1',
          title: 'Jump to the bottom',
          instruction: 'Press [[Ctrl+↓]] to jump to the last transaction in column A.',
          why: 'This is how you check how many rows an extract has in one keystroke — the row number tells you (minus the header).',
          hints: ['Hold Ctrl and tap the down arrow once.'],
          check: (c) => (c.sel.active === 'A201' ? true : 'The active cell should be A201 (the last row of data).'),
          solution: [{ select: 'A1' }, { cmd: 'nav.edgeDown' }],
          mustUseKeys: ['nav.edgeDown'],
        },
        {
          id: 't2',
          title: 'Jump to the last column',
          instruction: 'Now press [[Ctrl+→]] to jump to the right edge of the data (the Amount column).',
          hints: ['Same idea, different arrow.'],
          check: (c) => (c.sel.active === 'G201' ? true : 'You should land on G201.'),
          solution: [{ cmd: 'nav.edgeRight' }],
          mustUseKeys: ['nav.edgeRight'],
        },
        {
          id: 't3',
          title: 'Home again',
          instruction: 'Press [[Ctrl+Home]] to return to A1.',
          hints: ['Ctrl + the Home key (on laptops it may be Fn+←).'],
          check: (c) => (c.sel.active === 'A1' && c.used('nav.ctrlHome') ? true : 'Press Ctrl+Home to go back to A1.'),
          solution: [{ cmd: 'nav.ctrlHome' }],
        },
        {
          id: 't4',
          title: 'Go To a specific cell',
          instruction: 'Press [[F5]], type `H150` and press [[Enter]] — you jump straight there. Type `Check this` and press [[Enter]].',
          why: 'Go To is how you follow up on "row 150 looks off" in an email without scrolling.',
          hints: ['F5 opens the Go To box. Type H150 and press Enter.', 'Then type Check this and press Enter.'],
          check: (c) => (String(c.v('Data!H150') ?? '').toLowerCase() === 'check this' ? true : 'H150 should say "Check this".'),
          solution: [{ set: { 'Data!H150': 'Check this' } }],
        },
        {
          id: 't5',
          title: 'Find the last used cell',
          instruction: 'Press [[Ctrl+End]]. Where did you land, and why is it not G201 anymore?',
          why: 'Ctrl+End goes to the intersection of the last used row and last used column. Your note in column H widened the "used range". Stray notes far away from your data make files slower and confuse colleagues.',
          hints: ['Ctrl+End jumps to the last row and last column that contain anything.'],
          check: (c) => (c.sel.active === 'H201' ? true : 'Press Ctrl+End — you should land on H201.'),
          solution: [{ cmd: 'nav.ctrlEnd' }],
          mustUseKeys: ['nav.ctrlEnd'],
        },
      ],
    },
    {
      id: 'm01-l3',
      title: 'Rows, columns & sheets',
      summary: 'Insert and delete rows/columns, add and rename sheets, switch tabs.',
      minutes: 7,
      featured: ['Shift+Space', 'Ctrl+Space', 'Ctrl+Shift+=', 'Ctrl+-', 'Shift+F11', 'Alt H O R'],
      intro: `Structure changes are faster with the keyboard:

- [[Shift+Space]] selects the whole **row**; [[Ctrl+Space]] selects the whole **column**.
- With a row/column selected, [[Ctrl+Shift+=]] (think "Ctrl +") **inserts** and [[Ctrl+-]] **deletes**.
- [[Shift+F11]] inserts a new **sheet**. [[Alt]] [[H]] [[O]] [[R]] renames it (tap Alt, then each letter — these are **Key Tips** that walk the ribbon).
- [[Ctrl+PgDn]] / [[Ctrl+PgUp]] switch sheets. *Browsers reserve those keys — if they switch your browser tab instead, use [[Ctrl+Alt+PgDn]] / [[Ctrl+Alt+PgUp]] or turn on **Excel Keys** mode (top bar) to unlock them.*

**Why formulas survive inserts:** when you insert a row, Excel rewrites every formula that points below it so the references still point at the same data. You will see this happen live.`,
      workbooks: () => [
        makeBook('Branch_Summary.xlsx', [
          {
            name: 'Summary',
            rows: [
              ['Branch', 'Region', 'Deposits', 'Loans', 'Junk'],
              ...BRANCHES.slice(0, 6).map((b, i) => [b, ['Northeast', 'Northeast', 'Northeast', 'Southeast', 'Southeast', 'Midwest'][i], 100 + i * 37, 80 + i * 21, 'x']),
              ['Total', '', '=SUM(C2:C7)', '=SUM(D2:D7)', ''],
            ],
            widths: [90, 100, 90, 90, 60],
            styles: { A8: { b: true }, C8: { b: true }, D8: { b: true } },
          },
        ]),
      ],
      tasks: [
        {
          id: 't1',
          title: 'Delete the junk column',
          instruction: 'Go to any cell in column **E** (Junk), press [[Ctrl+Space]] to select the whole column, then [[Ctrl+-]] to delete it.',
          why: 'Deleting the *entire* column (not just clearing it) removes the gap, so the table stays contiguous for Ctrl+Arrow, sorting and pivots.',
          hints: ['Click E1 or arrow over to it.', 'Ctrl+Space selects the column; Ctrl+- (minus) deletes it.'],
          check: (c) => (c.v('E1') === null && c.v('D1') === 'Loans' ? true : 'Column E (Junk) should be gone.'),
          solution: [{ select: 'E1' }, { cmd: 'sel.column' }, { cmd: 'cells.delete' }],
        },
        {
          id: 't2',
          title: 'Insert a row for a new branch',
          instruction: 'Select row **5** with [[Shift+Space]] (from any cell in row 5) and insert a row above it with [[Ctrl+Shift+=]]. Then type `NYC-03` in A5, `Northeast` in B5, `90` in C5 and `70` in D5.',
          why: 'Watch the totals in row 9: the SUM automatically grew from C2:C7 to C2:C8 because you inserted *inside* the range.',
          hints: ['Shift+Space selects the row, Ctrl+Shift+= inserts.', 'The new row appears above the selected one.'],
          check: (c) =>
            all(
              c.v('A5') === 'NYC-03' ? true : 'A5 should be NYC-03',
              c.v('C5') === 90 ? true : 'C5 should be 90',
              c.f('C9').toUpperCase() === '=SUM(C2:C8)' ? true : 'The total in C9 should now read =SUM(C2:C8)',
            ),
          solution: [{ select: 'A5' }, { cmd: 'sel.row' }, { cmd: 'cells.insert' }, { set: { A5: 'NYC-03', B5: 'Northeast', C5: '90', D5: '70' } }],
        },
        {
          id: 't3',
          title: 'Add a notes sheet',
          instruction: 'Press [[Shift+F11]] to insert a new sheet, then rename it to `Notes` (double-click the tab, or [[Alt]] [[H]] [[O]] [[R]]).',
          hints: ['Shift+F11 adds a sheet to the left of the current one.', 'Rename with a double-click on the tab or Alt, H, O, R.'],
          check: (c) => (c.sheetNames().some((n) => n.toLowerCase() === 'notes') ? true : 'There should be a sheet named Notes.'),
          solution: [{ cmd: 'sheet.insert' }, { rename: 'Notes' }],
        },
        {
          id: 't4',
          title: 'Write a note and go back',
          instruction: 'On the **Notes** sheet type `Source: core_banking.branch_daily` in A1. Then switch back to **Summary** ([[Ctrl+PgDn]] / [[Ctrl+Alt+PgDn]] or click the tab).',
          hints: ['Notes was inserted to the LEFT of Summary, so Summary is the next sheet.'],
          check: (c) =>
            all(
              String(c.v('Notes!A1') ?? '').toLowerCase().startsWith('source') ? true : 'Notes!A1 should hold the source note.',
              c.sel.sheet === 'Summary' ? true : 'Switch back to the Summary sheet.',
            ),
          solution: [{ set: { 'Notes!A1': 'Source: core_banking.branch_daily' } }, { sheetTab: 'Summary' }],
        },
      ],
    },
  ],
  quiz: [
    { kind: 'mc', q: 'You press F2 on a cell containing a formula. What happens?', options: ['The cell is cleared', 'You edit the existing contents with the cursor at the end', 'The formula is shown in every cell', 'Excel opens Help'], answer: 1, explain: 'F2 enters Edit mode so you can change part of the contents without retyping.' },
    { kind: 'keys', q: 'Jump to the last filled cell below the active cell in this column.', cmd: 'nav.edgeDown', keys: 'Ctrl+↓', explain: 'Ctrl+Arrow jumps to the edge of the current block of data.' },
    { kind: 'mc', q: 'Ctrl+End takes you to…', options: ['The last cell of column A', 'The last row of the sheet (1,048,576)', 'The intersection of the last used row and last used column', 'The previous sheet'], answer: 2, explain: 'Ctrl+End goes to the bottom-right corner of the used range — a quick way to spot stray data.' },
    { kind: 'keys', q: 'Select the entire column of the active cell.', cmd: 'sel.column', keys: 'Ctrl+Space', explain: 'Ctrl+Space = column, Shift+Space = row.' },
    { kind: 'mc', q: 'A SUM in row 9 adds C2:C8. You insert a row at row 5. What does the SUM become?', options: ['=SUM(C2:C8) — unchanged', '=SUM(C2:C9) and it moves to row 10', '#REF!', '=SUM(C3:C9)'], answer: 1, explain: 'Inserting inside a referenced range expands it, and the formula itself shifts down a row.' },
    { kind: 'keys', q: 'Undo your last action.', cmd: 'edit.undo', keys: 'Ctrl+Z', explain: 'Ctrl+Z undoes; Ctrl+Y redoes.' },
    { kind: 'mc', q: 'Which key finishes an entry and moves the active cell to the RIGHT?', options: ['Enter', 'Tab', 'Esc', 'F2'], answer: 1, explain: 'Tab moves right, Enter moves down, Esc cancels.' },
    { kind: 'keys', q: 'Open the Go To box.', cmd: 'nav.goto', keys: 'F5 or Ctrl+G', explain: 'F5 / Ctrl+G opens Go To; type an address and Enter.' },
  ],
};
