// Every action is a named command. Keyboard shortcuts, Alt key-tips, ribbon
// buttons and lesson checks all speak in command ids, so a lesson can ask
// "did the learner use fill.down?" regardless of how it was triggered.

import type { AppStore } from './store';
import { FORMATS } from '../engine/format';
import { GRID_COLS, GRID_ROWS, currentRegion, usedRange } from './sheetOps';

export interface Command {
  id: string;
  label: string;
  keys?: string[]; // display strings, first one is the canonical shortcut
  keytip?: string; // Alt sequence (letters after Alt), e.g. 'HVV'
  group: string;
  run: (s: AppStore) => void;
}

const C = (id: string, label: string, group: string, run: (s: AppStore) => void, keys?: string[], keytip?: string): Command => ({ id, label, group, run, keys, keytip });

export const COMMANDS: Command[] = [
  // ---- navigation ----
  C('nav.up', 'Move up', 'Navigate', (s) => s.move(-1, 0), ['↑']),
  C('nav.down', 'Move down', 'Navigate', (s) => s.move(1, 0), ['↓']),
  C('nav.left', 'Move left', 'Navigate', (s) => s.move(0, -1), ['←']),
  C('nav.right', 'Move right', 'Navigate', (s) => s.move(0, 1), ['→']),
  C('nav.edgeUp', 'Jump to top edge of data', 'Navigate', (s) => s.edge(-1, 0), ['Ctrl+↑']),
  C('nav.edgeDown', 'Jump to bottom edge of data', 'Navigate', (s) => s.edge(1, 0), ['Ctrl+↓']),
  C('nav.edgeLeft', 'Jump to left edge of data', 'Navigate', (s) => s.edge(0, -1), ['Ctrl+←']),
  C('nav.edgeRight', 'Jump to right edge of data', 'Navigate', (s) => s.edge(0, 1), ['Ctrl+→']),
  C('nav.home', 'Go to column A', 'Navigate', (s) => s.select(s.sel.ar, 0), ['Home']),
  C('nav.ctrlHome', 'Go to A1', 'Navigate', (s) => s.select(s.sheet.freeze?.rows ?? 0, s.sheet.freeze?.cols ?? 0), ['Ctrl+Home']),
  C('nav.ctrlEnd', 'Go to last used cell', 'Navigate', (s) => {
    const u = usedRange(s.sheet);
    s.select(u ? u.r2 : 0, u ? u.c2 : 0);
  }, ['Ctrl+End']),
  C('nav.pageDown', 'One screen down', 'Navigate', (s) => s.move(25, 0), ['PgDn']),
  C('nav.pageUp', 'One screen up', 'Navigate', (s) => s.move(-25, 0), ['PgUp']),
  C('nav.screenRight', 'One screen right', 'Navigate', (s) => s.move(0, 10), ['Alt+PgDn']),
  C('nav.screenLeft', 'One screen left', 'Navigate', (s) => s.move(0, -10), ['Alt+PgUp']),
  C('nav.nextSheet', 'Next worksheet', 'Navigate', (s) => s.activateSheet(Math.min(s.si + 1, s.book.sheets.length - 1)), ['Ctrl+PgDn', 'Ctrl+Alt+PgDn']),
  C('nav.prevSheet', 'Previous worksheet', 'Navigate', (s) => s.activateSheet(Math.max(s.si - 1, 0)), ['Ctrl+PgUp', 'Ctrl+Alt+PgUp']),
  C('nav.nextBook', 'Switch to next open workbook', 'Navigate', (s) => s.activateBook((s.bi + 1) % s.books.length), ['Ctrl+Tab', 'Ctrl+F6']),
  C('nav.prevBook', 'Switch to previous open workbook', 'Navigate', (s) => s.activateBook((s.bi - 1 + s.books.length) % s.books.length), ['Ctrl+Shift+Tab', 'Ctrl+Shift+F6']),
  C('nav.goto', 'Go To…', 'Navigate', (s) => s.openDialog({ type: 'goto' }), ['F5', 'Ctrl+G'], 'HFDG'),
  C('nav.gotoSpecial', 'Go To Special…', 'Navigate', (s) => s.openDialog({ type: 'gotoSpecial' }), [], 'HFDS'),
  C('nav.tracePrecedent', 'Jump to referenced cells (precedents)', 'Navigate', (s) => s.tracePrecedent(), ['Ctrl+[']),
  C('nav.nameBox', 'Jump to the Name Box', 'Navigate', () => {
    if (typeof document !== 'undefined') document.getElementById('namebox')?.focus();
  }, ['Click the Name Box?']),
  C('edit.f4', 'Toggle $ absolute reference (while editing)', 'Edit', (s) => s.f4(), ['F4']),
  C('edit.fillSelection', 'Enter into every selected cell', 'Edit', (s) => (s.edit ? s.commitEdit('none', true) : undefined), ['Ctrl+Enter']),

  // ---- selection ----
  C('sel.up', 'Extend selection up', 'Select', (s) => s.extend(-1, 0), ['Shift+↑']),
  C('sel.down', 'Extend selection down', 'Select', (s) => s.extend(1, 0), ['Shift+↓']),
  C('sel.left', 'Extend selection left', 'Select', (s) => s.extend(0, -1), ['Shift+←']),
  C('sel.right', 'Extend selection right', 'Select', (s) => s.extend(0, 1), ['Shift+→']),
  C('sel.edgeUp', 'Select to top edge of data', 'Select', (s) => s.extendEdge(-1, 0), ['Ctrl+Shift+↑']),
  C('sel.edgeDown', 'Select to bottom edge of data', 'Select', (s) => s.extendEdge(1, 0), ['Ctrl+Shift+↓']),
  C('sel.edgeLeft', 'Select to left edge of data', 'Select', (s) => s.extendEdge(0, -1), ['Ctrl+Shift+←']),
  C('sel.edgeRight', 'Select to right edge of data', 'Select', (s) => s.extendEdge(0, 1), ['Ctrl+Shift+→']),
  C('sel.column', 'Select entire column', 'Select', (s) => {
    const g = s.range;
    s.selectRange({ r1: 0, c1: g.c1, r2: GRID_ROWS - 1, c2: g.c2 }, { r: 0, c: s.sel.ac });
  }, ['Ctrl+Space']),
  C('sel.row', 'Select entire row', 'Select', (s) => {
    const g = s.range;
    s.selectRange({ r1: g.r1, c1: 0, r2: g.r2, c2: GRID_COLS - 1 }, { r: s.sel.ar, c: 0 });
  }, ['Shift+Space']),
  C('sel.all', 'Select current region / all', 'Select', (s) => {
    const g = s.range;
    const reg = currentRegion(s.calc, s.bi, s.si, s.sheet, s.sel.ar, s.sel.ac);
    const same = reg.r1 === g.r1 && reg.r2 === g.r2 && reg.c1 === g.c1 && reg.c2 === g.c2;
    if (same || (reg.r1 === reg.r2 && reg.c1 === reg.c2)) s.selectRange({ r1: 0, c1: 0, r2: GRID_ROWS - 1, c2: GRID_COLS - 1 }, { r: s.sel.ar, c: s.sel.ac });
    else s.selectRange(reg, { r: s.sel.ar, c: s.sel.ac });
  }, ['Ctrl+A']),
  C('sel.toEnd', 'Select to last used cell', 'Select', (s) => {
    const u = usedRange(s.sheet);
    if (u) s.setSel({ ...s.sel, fr: u.r2, fc: u.c2 });
    s.notify();
  }, ['Ctrl+Shift+End']),
  C('sel.toHome', 'Select to A1', 'Select', (s) => {
    s.setSel({ ...s.sel, fr: 0, fc: 0 });
    s.notify();
  }, ['Ctrl+Shift+Home']),

  // ---- editing ----
  C('edit.start', 'Edit active cell', 'Edit', (s) => s.startEdit(undefined, 'edit'), ['F2']),
  C('edit.clear', 'Clear contents', 'Edit', (s) => (s.multi ? s.fillMulti('') : s.clearSelection()), ['Delete']),
  C('edit.undo', 'Undo', 'Edit', (s) => s.undo(), ['Ctrl+Z']),
  C('edit.redo', 'Redo', 'Edit', (s) => s.redo(), ['Ctrl+Y']),
  C('clip.copy', 'Copy', 'Edit', (s) => s.copy(false), ['Ctrl+C']),
  C('clip.cut', 'Cut', 'Edit', (s) => s.copy(true), ['Ctrl+X']),
  C('clip.paste', 'Paste', 'Edit', (s) => s.paste('all'), ['Ctrl+V'], 'HVP'),
  C('clip.pasteValues', 'Paste Values', 'Edit', (s) => s.paste('values'), ['Ctrl+Alt+V → V', 'Alt H V V', 'Alt E S V'], 'HVV'),
  C('clip.pasteValuesLegacy', 'Paste Values (classic Alt E S V)', 'Edit', (s) => s.paste('values'), ['Alt E S V'], 'ESV'),
  C('clip.pasteFormats', 'Paste Formats', 'Edit', (s) => s.paste('formats'), ['Alt H V R'], 'HVR'),
  C('clip.pasteTranspose', 'Paste Transpose', 'Edit', (s) => s.paste('all', true), ['Alt H V T'], 'HVT'),
  C('clip.pasteSpecial', 'Paste Special…', 'Edit', (s) => s.openDialog({ type: 'pasteSpecial' }), ['Ctrl+Alt+V'], 'HVS'),
  C('fill.down', 'Fill Down', 'Edit', (s) => s.fillDown(), ['Ctrl+D'], 'HFID'),
  C('fill.right', 'Fill Right', 'Edit', (s) => s.fillRight(), ['Ctrl+R'], 'HFIR'),
  C('fill.handleDouble', 'Auto-fill down (double-click fill handle)', 'Edit', (s) => s.autoFillDown(), ['Double-click ■']),
  C('edit.autosum', 'AutoSum', 'Formulas', (s) => s.autoSum(), ['Alt+='], 'MUS'),
  C('edit.insertDate', "Insert today's date", 'Edit', (s) => s.insertNow(false), ['Ctrl+;']),
  C('edit.insertTime', 'Insert current time', 'Edit', (s) => s.insertNow(true), ['Ctrl+Shift+;']),
  C('edit.find', 'Find…', 'Edit', (s) => s.openDialog({ type: 'find' }), ['Ctrl+F'], 'HFDF'),
  C('edit.replace', 'Replace…', 'Edit', (s) => s.openDialog({ type: 'find', replace: true }), ['Ctrl+H'], 'HFDR'),
  C('edit.save', 'Save (progress auto-saves)', 'Edit', (s) => s.toast('✓ Saved. (Your progress auto-saves.)'), ['Ctrl+S']),

  // ---- rows / columns / sheets ----
  C('row.insert', 'Insert row(s)', 'Cells', (s) => s.insertCells('row'), ['Ctrl+Shift+= (row selected)'], 'HIR'),
  C('col.insert', 'Insert column(s)', 'Cells', (s) => s.insertCells('col'), ['Ctrl+Shift+= (column selected)'], 'HIC'),
  C('row.delete', 'Delete row(s)', 'Cells', (s) => s.deleteCells('row'), ['Ctrl+- (row selected)'], 'HDR'),
  C('col.delete', 'Delete column(s)', 'Cells', (s) => s.deleteCells('col'), ['Ctrl+- (column selected)'], 'HDC'),
  C('cells.insert', 'Insert…', 'Cells', (s) => (s.isWholeRows() ? s.insertCells('row') : s.isWholeCols() ? s.insertCells('col') : s.openDialog({ type: 'insert' })), ['Ctrl+Shift+=']),
  C('cells.delete', 'Delete…', 'Cells', (s) => (s.isWholeRows() ? s.deleteCells('row') : s.isWholeCols() ? s.deleteCells('col') : s.openDialog({ type: 'delete' })), ['Ctrl+-']),
  C('row.hide', 'Hide rows', 'Cells', (s) => s.hideRows(true), ['Ctrl+9']),
  C('row.unhide', 'Unhide rows', 'Cells', (s) => s.hideRows(false), ['Ctrl+Shift+9']),
  C('col.hide', 'Hide columns', 'Cells', (s) => s.hideCols(true), ['Ctrl+0']),
  C('col.unhide', 'Unhide columns', 'Cells', (s) => s.hideCols(false), ['Ctrl+Shift+0']),
  C('col.autofit', 'AutoFit Column Width', 'Cells', (s) => s.autofitCols(), ['Alt H O I'], 'HOI'),
  C('col.width', 'Column Width…', 'Cells', (s) => s.openDialog({ type: 'colWidth' }), ['Alt H O W'], 'HOW'),
  C('sheet.insert', 'Insert worksheet', 'Cells', (s) => s.addSheet(), ['Shift+F11'], 'HIS'),
  C('sheet.delete', 'Delete worksheet', 'Cells', (s) => s.deleteSheet(s.si), [], 'HDS'),
  C('sheet.rename', 'Rename sheet', 'Cells', (s) => s.openDialog({ type: 'rename' }), ['Alt H O R'], 'HOR'),

  // ---- formatting ----
  C('fmt.bold', 'Bold', 'Format', (s) => s.toggleStyle('b'), ['Ctrl+B', 'Ctrl+2'], 'H1'),
  C('fmt.italic', 'Italic', 'Format', (s) => s.toggleStyle('i'), ['Ctrl+I', 'Ctrl+3'], 'H2'),
  C('fmt.underline', 'Underline', 'Format', (s) => s.toggleStyle('u'), ['Ctrl+U', 'Ctrl+4'], 'H3'),
  C('fmt.cells', 'Format Cells…', 'Format', (s) => s.openDialog({ type: 'formatCells' }), ['Ctrl+1'], 'HOE'),
  C('fmt.number', 'Number format (#,##0.00)', 'Format', (s) => s.setFormat(FORMATS.number), ['Ctrl+Shift+!']),
  C('fmt.comma', 'Comma Style', 'Format', (s) => s.setFormat(FORMATS.comma), ['Alt H K'], 'HK'),
  C('fmt.currency', 'Currency format', 'Format', (s) => s.setFormat(FORMATS.currency), ['Ctrl+Shift+$']),
  C('fmt.accounting', 'Accounting format', 'Format', (s) => s.setFormat(FORMATS.accounting), ['Alt H A N'], 'HAN'),
  C('fmt.percent', 'Percent style', 'Format', (s) => s.setFormat(FORMATS.percent), ['Ctrl+Shift+%', 'Alt H P'], 'HP'),
  C('fmt.date', 'Date format (d-mmm-yy)', 'Format', (s) => s.setFormat(FORMATS.dmy), ['Ctrl+Shift+#']),
  C('fmt.time', 'Time format', 'Format', (s) => s.setFormat(FORMATS.time), ['Ctrl+Shift+@']),
  C('fmt.general', 'General format', 'Format', (s) => s.setFormat('General'), ['Ctrl+Shift+~']),
  C('fmt.decInc', 'Increase decimal', 'Format', (s) => s.bumpDecimals(1), ['Alt H 0'], 'H0'),
  C('fmt.decDec', 'Decrease decimal', 'Format', (s) => s.bumpDecimals(-1), ['Alt H 9'], 'H9'),
  C('fmt.alignLeft', 'Align left', 'Format', (s) => s.style((x) => ({ ...x, align: 'left' })), ['Alt H A L'], 'HAL'),
  C('fmt.alignCenter', 'Center', 'Format', (s) => s.style((x) => ({ ...x, align: 'center' })), ['Alt H A C'], 'HAC'),
  C('fmt.alignRight', 'Align right', 'Format', (s) => s.style((x) => ({ ...x, align: 'right' })), ['Alt H A R'], 'HAR'),
  C('fmt.wrap', 'Wrap text', 'Format', (s) => s.style((x) => ({ ...x, wrap: !x.wrap })), ['Alt H W'], 'HW'),
  C('fmt.fill', 'Fill color', 'Format', (s) => s.style((x) => ({ ...x, fill: s.lastFill })), ['Alt H H'], 'HH'),
  C('fmt.noFill', 'No fill', 'Format', (s) => s.style((x) => ({ ...x, fill: undefined })), []),
  C('fmt.fontColor', 'Font color', 'Format', (s) => s.style((x) => ({ ...x, color: s.lastFontColor })), ['Alt H F C'], 'HFC'),
  C('border.all', 'All borders', 'Format', (s) => s.border('all'), ['Alt H B A'], 'HBA'),
  C('border.outside', 'Outside borders', 'Format', (s) => s.border('outside'), ['Ctrl+Shift+&', 'Alt H B S'], 'HBS'),
  C('border.thick', 'Thick box border', 'Format', (s) => s.border('thick'), ['Alt H B T'], 'HBT'),
  C('border.bottom', 'Bottom border', 'Format', (s) => s.border('bottom'), ['Alt H B O'], 'HBO'),
  C('border.top', 'Top border', 'Format', (s) => s.border('top'), ['Alt H B P'], 'HBP'),
  C('border.none', 'No border', 'Format', (s) => s.border('none'), ['Ctrl+Shift+_', 'Alt H B N'], 'HBN'),
  C('fmt.clear', 'Clear formats', 'Format', (s) => s.style(() => ({})), ['Alt H E F'], 'HEF'),
  C('cf.open', 'Conditional Formatting…', 'Format', (s) => s.openDialog({ type: 'cf' }), ['Alt H L'], 'HL'),

  // ---- data ----
  C('data.sortAsc', 'Sort A to Z', 'Data', (s) => s.sortQuick(false), ['Alt A S A', 'Alt H S S'], 'ASA'),
  C('data.sortDesc', 'Sort Z to A', 'Data', (s) => s.sortQuick(true), ['Alt A S D', 'Alt H S O'], 'ASD'),
  C('data.sortAscHome', 'Sort A to Z (Home tab)', 'Data', (s) => s.sortQuick(false), ['Alt H S S'], 'HSS'),
  C('data.sortDescHome', 'Sort Z to A (Home tab)', 'Data', (s) => s.sortQuick(true), ['Alt H S O'], 'HSO'),
  C('data.sortCustom', 'Custom Sort…', 'Data', (s) => s.openDialog({ type: 'sort' }), ['Alt A S S', 'Alt H S U'], 'ASS'),
  C('data.sortCustomHome', 'Custom Sort… (Home tab)', 'Data', (s) => s.openDialog({ type: 'sort' }), ['Alt H S U'], 'HSU'),
  C('data.filter', 'Toggle AutoFilter', 'Data', (s) => s.toggleFilter(), ['Ctrl+Shift+L', 'Alt A T'], 'AT'),
  C('data.filterHome', 'Toggle AutoFilter (Home tab)', 'Data', (s) => s.toggleFilter(), ['Alt H S F'], 'HSF'),
  C('data.filterMenu', 'Open filter drop-down', 'Data', (s) => s.sheet.filter && s.openDialog({ type: 'filterMenu', col: s.sel.ac }), ['Alt+↓']),
  C('data.clearFilters', 'Clear all filters', 'Data', (s) => s.clearFilters(), ['Alt A C'], 'AC'),
  C('data.removeDup', 'Remove Duplicates…', 'Data', (s) => s.openDialog({ type: 'removeDup' }), ['Alt A M'], 'AM'),
  C('data.textToCols', 'Text to Columns…', 'Data', (s) => s.openDialog({ type: 'textToCols' }), ['Alt A E'], 'AE'),
  C('insert.pivot', 'PivotTable…', 'Insert', (s) => s.openDialog({ type: 'pivot' }), ['Alt N V'], 'NV'),

  // ---- view ----
  C('view.freezePanes', 'Freeze / Unfreeze Panes', 'View', (s) => s.freeze('panes'), ['Alt W F F'], 'WFF'),
  C('view.freezeRow', 'Freeze Top Row', 'View', (s) => s.freeze('row'), ['Alt W F R'], 'WFR'),
  C('view.freezeCol', 'Freeze First Column', 'View', (s) => s.freeze('col'), ['Alt W F C'], 'WFC'),
  C('view.gridlines', 'Toggle gridlines', 'View', (s) => s.toggleGridlines(), ['Alt W V G'], 'WVG'),
  C('view.formulas', 'Show formulas', 'View', (s) => {
    s.showFormulas = !s.showFormulas;
    s.notify();
  }, ['Ctrl+`'], 'MH'),
  C('help.shortcuts', 'Keyboard shortcut cheat sheet', 'Help', (s) => s.openDialog({ type: 'shortcuts' }), ['F1']),
];

export const CMD: Record<string, Command> = Object.fromEntries(COMMANDS.map((c) => [c.id, c]));

export const KEYTIPS: Record<string, string> = {};
for (const c of COMMANDS) if (c.keytip) KEYTIPS[c.keytip] = c.id;

export function runCommand(s: AppStore, id: string, source: 'key' | 'mouse' = 'key') {
  const c = CMD[id];
  if (!c) return;
  c.run(s);
  s.emitCommand(id, source);
}

/** All Alt-sequences that start with `prefix` (for showing key-tip badges). */
export function keytipChildren(prefix: string): string[] {
  const out = new Set<string>();
  for (const k of Object.keys(KEYTIPS)) if (k.startsWith(prefix) && k.length > prefix.length) out.add(k[prefix.length]);
  return [...out];
}
