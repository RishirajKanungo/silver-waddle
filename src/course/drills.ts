// Shortcut Dojo drills. Each drill asks for an action; the learner must trigger
// the matching command from the keyboard. Spaced repetition decides the order.

export interface DrillDef {
  id: string;
  cmd: string;
  accept?: string[]; // other command ids that also count
  prompt: string;
  keys: string;
  tier: 1 | 2 | 3;
  at?: string; // cell or range to select first
  setup?: 'copy' | 'formula' | 'twoBooks';
  why: string;
}

export const DRILLS: DrillDef[] = [
  // ---------- Tier 1: daily drivers ----------
  { id: 'd-edgeDown', cmd: 'nav.edgeDown', prompt: 'Jump to the last row of this column of data', keys: 'Ctrl+↓', tier: 1, at: 'B2', why: 'Check row counts instantly.' },
  { id: 'd-edgeRight', cmd: 'nav.edgeRight', prompt: 'Jump to the last column of this row of data', keys: 'Ctrl+→', tier: 1, at: 'A5', why: 'See how wide an extract is.' },
  { id: 'd-edgeUp', cmd: 'nav.edgeUp', prompt: 'Jump back up to the top of the data in this column', keys: 'Ctrl+↑', tier: 1, at: 'C40', why: 'Return to the header row.' },
  { id: 'd-edgeLeft', cmd: 'nav.edgeLeft', prompt: 'Jump to the first column of this row', keys: 'Ctrl+←', tier: 1, at: 'F12', why: 'Back to the ID column.' },
  { id: 'd-home', cmd: 'nav.ctrlHome', prompt: 'Go to cell A1', keys: 'Ctrl+Home', tier: 1, at: 'E30', why: 'Reset your position.' },
  { id: 'd-end', cmd: 'nav.ctrlEnd', prompt: 'Go to the last used cell of the sheet', keys: 'Ctrl+End', tier: 1, at: 'B3', why: 'Spot stray data far from the table.' },
  { id: 'd-selDown', cmd: 'sel.edgeDown', prompt: 'Select from here down to the last row of data', keys: 'Ctrl+Shift+↓', tier: 1, at: 'D2', why: 'Select a whole column of values for a formula or format.' },
  { id: 'd-selRight', cmd: 'sel.edgeRight', prompt: 'Select from here to the last column of the row', keys: 'Ctrl+Shift+→', tier: 1, at: 'A1', why: 'Grab the header row.' },
  { id: 'd-selCol', cmd: 'sel.column', prompt: 'Select the entire column', keys: 'Ctrl+Space', tier: 1, at: 'C7', why: 'Before inserting/deleting/formatting a column.' },
  { id: 'd-selRow', cmd: 'sel.row', prompt: 'Select the entire row', keys: 'Shift+Space', tier: 1, at: 'C7', why: 'Before inserting/deleting a row.' },
  { id: 'd-selAll', cmd: 'sel.all', prompt: 'Select the whole data table around the active cell', keys: 'Ctrl+A', tier: 1, at: 'C7', why: 'Select the current region for sorting or copying.' },
  { id: 'd-f2', cmd: 'edit.start', prompt: 'Edit the active cell (keep its contents)', keys: 'F2', tier: 1, at: 'B4', why: 'Fix a formula without retyping it.' },
  { id: 'd-undo', cmd: 'edit.undo', prompt: 'Undo', keys: 'Ctrl+Z', tier: 1, at: 'B4', why: 'Your safety net.' },
  { id: 'd-redo', cmd: 'edit.redo', prompt: 'Redo', keys: 'Ctrl+Y', tier: 1, at: 'B4', why: 'Undo the undo.' },
  { id: 'd-copy', cmd: 'clip.copy', prompt: 'Copy the selection', keys: 'Ctrl+C', tier: 1, at: 'A1:C5', why: '' },
  { id: 'd-paste', cmd: 'clip.paste', prompt: 'Paste (something is already copied)', keys: 'Ctrl+V', tier: 1, at: 'J2', setup: 'copy', why: '' },
  { id: 'd-cut', cmd: 'clip.cut', prompt: 'Cut the selection', keys: 'Ctrl+X', tier: 1, at: 'A1:A3', why: 'Move data, references follow it.' },
  { id: 'd-bold', cmd: 'fmt.bold', prompt: 'Make the selection bold', keys: 'Ctrl+B', tier: 1, at: 'A1:G1', why: 'Headers.' },
  { id: 'd-italic', cmd: 'fmt.italic', prompt: 'Italicize the selection', keys: 'Ctrl+I', tier: 1, at: 'A1', why: 'Notes and sources.' },
  { id: 'd-goto', cmd: 'nav.goto', prompt: 'Open the Go To box', keys: 'F5 or Ctrl+G', tier: 1, at: 'A1', why: 'Jump to any address.' },
  { id: 'd-find', cmd: 'edit.find', prompt: 'Open Find', keys: 'Ctrl+F', tier: 1, at: 'A1', why: 'Locate an account ID in an extract.' },
  { id: 'd-filldown', cmd: 'fill.down', prompt: 'Fill the top cell of the selection down', keys: 'Ctrl+D', tier: 1, at: 'H2:H20', why: 'Copy a formula down a column in one keystroke.' },
  { id: 'd-fillright', cmd: 'fill.right', prompt: 'Fill the left cell of the selection to the right', keys: 'Ctrl+R', tier: 1, at: 'B30:F30', why: 'Copy a total across columns.' },
  { id: 'd-autosum', cmd: 'edit.autosum', prompt: 'Insert an AutoSum', keys: 'Alt+=', tier: 1, at: 'G202', why: 'Fastest total in Excel.' },
  { id: 'd-save', cmd: 'edit.save', prompt: 'Save the workbook', keys: 'Ctrl+S', tier: 1, at: 'A1', why: 'Save early, save often.' },

  // ---------- Tier 2: formatting & structure ----------
  { id: 'd-num', cmd: 'fmt.number', prompt: 'Apply Number format with 2 decimals and thousands separators', keys: 'Ctrl+Shift+!', tier: 2, at: 'G2:G20', why: 'Readable amounts.' },
  { id: 'd-cur', cmd: 'fmt.currency', prompt: 'Apply Currency format', keys: 'Ctrl+Shift+$', tier: 2, at: 'G2:G20', why: '' },
  { id: 'd-pct', cmd: 'fmt.percent', prompt: 'Apply Percent format', keys: 'Ctrl+Shift+%', tier: 2, at: 'G2', why: 'Rates and ratios.' },
  { id: 'd-date', cmd: 'fmt.date', prompt: 'Apply the d-mmm-yy date format', keys: 'Ctrl+Shift+#', tier: 2, at: 'B2:B20', why: 'Turn serial numbers into dates.' },
  { id: 'd-gen', cmd: 'fmt.general', prompt: 'Reset to General format', keys: 'Ctrl+Shift+~', tier: 2, at: 'B2', why: 'See the raw serial number behind a date.' },
  { id: 'd-outline', cmd: 'border.outside', prompt: 'Put an outline border around the selection', keys: 'Ctrl+Shift+&', tier: 2, at: 'A1:G10', why: '' },
  { id: 'd-noborder', cmd: 'border.none', prompt: 'Remove all borders', keys: 'Ctrl+Shift+_', tier: 2, at: 'A1:G10', why: '' },
  { id: 'd-fmtcells', cmd: 'fmt.cells', prompt: 'Open Format Cells', keys: 'Ctrl+1', tier: 2, at: 'G2', why: 'Custom number formats live here.' },
  { id: 'd-ins', cmd: 'cells.insert', prompt: 'Insert (with the row already selected)', keys: 'Ctrl+Shift+=', tier: 2, at: 'A5:XFD5', why: '' },
  { id: 'd-del', cmd: 'cells.delete', prompt: 'Delete (with the row already selected)', keys: 'Ctrl+-', tier: 2, at: 'A5:XFD5', why: '' },
  { id: 'd-newsheet', cmd: 'sheet.insert', prompt: 'Insert a new worksheet', keys: 'Shift+F11', tier: 2, at: 'A1', why: '' },
  { id: 'd-nextsheet', cmd: 'nav.nextSheet', prompt: 'Go to the next worksheet', keys: 'Ctrl+PgDn (or Ctrl+Alt+PgDn)', tier: 2, at: 'A1', why: '' },
  { id: 'd-filter', cmd: 'data.filter', prompt: 'Turn on AutoFilter', keys: 'Ctrl+Shift+L', tier: 2, at: 'A1', why: 'Slice an extract in seconds.' },
  { id: 'd-today', cmd: 'edit.insertDate', prompt: "Insert today's date", keys: 'Ctrl+;', tier: 2, at: 'J1', why: 'Date-stamp a report.' },
  { id: 'd-showf', cmd: 'view.formulas', prompt: 'Show formulas instead of results', keys: 'Ctrl+`', tier: 2, at: 'A1', why: 'Audit a model fast.' },
  { id: 'd-hiderow', cmd: 'row.hide', prompt: 'Hide the selected row', keys: 'Ctrl+9', tier: 2, at: 'A4', why: '' },
  { id: 'd-hidecol', cmd: 'col.hide', prompt: 'Hide the selected column', keys: 'Ctrl+0', tier: 2, at: 'C1', why: '' },
  { id: 'd-replace', cmd: 'edit.replace', prompt: 'Open Find & Replace', keys: 'Ctrl+H', tier: 2, at: 'A1', why: 'Fix a code across the whole sheet.' },
  { id: 'd-selend', cmd: 'sel.toEnd', prompt: 'Select from here to the last used cell', keys: 'Ctrl+Shift+End', tier: 2, at: 'A1', why: 'Grab everything.' },
  { id: 'd-f4', cmd: 'edit.f4', prompt: 'You are typing a formula — lock the reference with $ signs', keys: 'F4', tier: 2, at: 'J2', setup: 'formula', why: 'Absolute refs before filling down.' },

  // ---------- Tier 3: Alt key-tips & power moves ----------
  { id: 'd-pv', cmd: 'clip.pasteValues', accept: ['clip.pasteValuesLegacy'], prompt: 'Paste Values only (something is copied)', keys: 'Alt H V V', tier: 3, at: 'J2', setup: 'copy', why: 'Break formulas/links into plain numbers.' },
  { id: 'd-esv', cmd: 'clip.pasteValuesLegacy', accept: ['clip.pasteValues'], prompt: 'Paste Values the classic banker way', keys: 'Alt E S V', tier: 3, at: 'J2', setup: 'copy', why: 'Old-school, still works, still loved.' },
  { id: 'd-autofit', cmd: 'col.autofit', prompt: 'AutoFit the column width', keys: 'Alt H O I', tier: 3, at: 'A1:G1', why: 'No more ####.' },
  { id: 'd-allb', cmd: 'border.all', prompt: 'Apply All Borders', keys: 'Alt H B A', tier: 3, at: 'A1:G10', why: '' },
  { id: 'd-thickb', cmd: 'border.thick', prompt: 'Apply a Thick Box Border', keys: 'Alt H B T', tier: 3, at: 'A1:G10', why: 'Frame a totals block.' },
  { id: 'd-freeze', cmd: 'view.freezePanes', prompt: 'Freeze panes at the active cell', keys: 'Alt W F F', tier: 3, at: 'B2', why: 'Keep headers and IDs visible.' },
  { id: 'd-freezerow', cmd: 'view.freezeRow', prompt: 'Freeze the top row', keys: 'Alt W F R', tier: 3, at: 'A1', why: '' },
  { id: 'd-grid', cmd: 'view.gridlines', prompt: 'Toggle gridlines', keys: 'Alt W V G', tier: 3, at: 'A1', why: 'Clean, presentation-ready sheets.' },
  { id: 'd-sorta', cmd: 'data.sortAsc', accept: ['data.sortAscHome'], prompt: 'Sort A to Z by this column', keys: 'Alt A S A', tier: 3, at: 'D2', why: '' },
  { id: 'd-sortd', cmd: 'data.sortDesc', accept: ['data.sortDescHome'], prompt: 'Sort Z to A (largest first) by this column', keys: 'Alt A S D', tier: 3, at: 'G2', why: 'Biggest balances on top.' },
  { id: 'd-sortc', cmd: 'data.sortCustom', accept: ['data.sortCustomHome'], prompt: 'Open the multi-level Sort dialog', keys: 'Alt A S S', tier: 3, at: 'D2', why: '' },
  { id: 'd-dupes', cmd: 'data.removeDup', prompt: 'Open Remove Duplicates', keys: 'Alt A M', tier: 3, at: 'A2', why: 'Dedupe IDs.' },
  { id: 'd-pivot', cmd: 'insert.pivot', prompt: 'Insert a PivotTable', keys: 'Alt N V', tier: 3, at: 'A2', why: '' },
  { id: 'd-decinc', cmd: 'fmt.decInc', prompt: 'Increase decimal places', keys: 'Alt H 0', tier: 3, at: 'G2', why: '' },
  { id: 'd-decdec', cmd: 'fmt.decDec', prompt: 'Decrease decimal places', keys: 'Alt H 9', tier: 3, at: 'G2', why: '' },
  { id: 'd-comma', cmd: 'fmt.comma', prompt: 'Apply Comma Style', keys: 'Alt H K', tier: 3, at: 'G2:G20', why: 'Banker default for amounts.' },
  { id: 'd-acct', cmd: 'fmt.accounting', prompt: 'Apply Accounting format', keys: 'Alt H A N', tier: 3, at: 'G2:G20', why: '' },
  { id: 'd-rename', cmd: 'sheet.rename', prompt: 'Rename the sheet', keys: 'Alt H O R', tier: 3, at: 'A1', why: '' },
  { id: 'd-t2c', cmd: 'data.textToCols', prompt: 'Open Text to Columns', keys: 'Alt A E', tier: 3, at: 'C2', why: 'Split "ACC-1001" style codes.' },
  { id: 'd-ps', cmd: 'clip.pasteSpecial', prompt: 'Open Paste Special (something is copied)', keys: 'Ctrl+Alt+V', tier: 3, at: 'J2', setup: 'copy', why: '' },
  { id: 'd-prec', cmd: 'nav.tracePrecedent', prompt: 'Jump to the cells this formula refers to', keys: 'Ctrl+[', tier: 3, at: 'I2', why: 'Audit where a number comes from — even in another file.' },
  { id: 'd-nextbook', cmd: 'nav.nextBook', prompt: 'Switch to the other open workbook', keys: 'Ctrl+Tab or Ctrl+F6', tier: 3, at: 'A1', setup: 'twoBooks', why: 'The cross-file VLOOKUP move.' },
  { id: 'd-cf', cmd: 'cf.open', prompt: 'Open Conditional Formatting', keys: 'Alt H L', tier: 3, at: 'G2:G20', why: '' },
];
