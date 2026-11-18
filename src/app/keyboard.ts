// Keyboard routing. Mirrors Windows Excel. On a Mac, Cmd is accepted as Ctrl.
//
// Three states:
//   READY  – no cell is being edited: arrows move, shortcuts run commands
//   ENTER/EDIT – typing in a cell; Enter/Tab/Esc/F4/arrows have special meaning
//   KEYTIP – Alt was tapped; letters walk the ribbon (Alt H V V = paste values)

import type { AppStore } from './store';
import { KEYTIPS, runCommand } from './commands';
import { fnSuggestions, partialFn } from './store';

export interface KeyLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  preventDefault(): void;
}

/** Normalised combo string like 'Ctrl+Shift+ArrowDown' or 'Ctrl+1'. */
export function combo(e: KeyLike): string {
  const ctrl = e.ctrlKey || e.metaKey;
  let k = e.key;
  const code = e.code || '';
  if (code.startsWith('Key')) k = code.slice(3);
  else if (code.startsWith('Digit')) k = code.slice(5);
  else if (code.startsWith('Numpad') && /\d$/.test(code)) k = code.slice(6);
  else {
    const map: Record<string, string> = {
      Semicolon: ';', Equal: '=', Minus: '-', Backquote: '`', BracketLeft: '[', BracketRight: ']',
      Comma: ',', Period: '.', Slash: '/', Backslash: '\\', Quote: "'", Space: 'Space', NumpadAdd: '+', NumpadSubtract: '-',
    };
    if (map[code]) k = map[code];
    else if (k === ' ') k = 'Space';
    else if (k.length === 1) k = k.toUpperCase();
  }
  return `${ctrl ? 'Ctrl+' : ''}${e.altKey ? 'Alt+' : ''}${e.shiftKey ? 'Shift+' : ''}${k}`;
}

/** READY-mode bindings (combo -> command id). */
export const BINDINGS: Record<string, string> = {
  ArrowUp: 'nav.up', ArrowDown: 'nav.down', ArrowLeft: 'nav.left', ArrowRight: 'nav.right',
  'Ctrl+ArrowUp': 'nav.edgeUp', 'Ctrl+ArrowDown': 'nav.edgeDown', 'Ctrl+ArrowLeft': 'nav.edgeLeft', 'Ctrl+ArrowRight': 'nav.edgeRight',
  'Shift+ArrowUp': 'sel.up', 'Shift+ArrowDown': 'sel.down', 'Shift+ArrowLeft': 'sel.left', 'Shift+ArrowRight': 'sel.right',
  'Ctrl+Shift+ArrowUp': 'sel.edgeUp', 'Ctrl+Shift+ArrowDown': 'sel.edgeDown', 'Ctrl+Shift+ArrowLeft': 'sel.edgeLeft', 'Ctrl+Shift+ArrowRight': 'sel.edgeRight',
  Home: 'nav.home', 'Ctrl+Home': 'nav.ctrlHome', 'Ctrl+End': 'nav.ctrlEnd', 'Ctrl+Shift+End': 'sel.toEnd', 'Ctrl+Shift+Home': 'sel.toHome',
  PageDown: 'nav.pageDown', PageUp: 'nav.pageUp', 'Alt+PageDown': 'nav.screenRight', 'Alt+PageUp': 'nav.screenLeft',
  'Ctrl+PageDown': 'nav.nextSheet', 'Ctrl+PageUp': 'nav.prevSheet', 'Ctrl+Alt+PageDown': 'nav.nextSheet', 'Ctrl+Alt+PageUp': 'nav.prevSheet',
  'Ctrl+Tab': 'nav.nextBook', 'Ctrl+F6': 'nav.nextBook', 'Ctrl+Shift+Tab': 'nav.prevBook', 'Ctrl+Shift+F6': 'nav.prevBook',
  F5: 'nav.goto', 'Ctrl+G': 'nav.goto', 'Ctrl+[': 'nav.tracePrecedent',
  'Ctrl+Space': 'sel.column', 'Shift+Space': 'sel.row', 'Ctrl+A': 'sel.all', 'Ctrl+Shift+Space': 'sel.all',
  F2: 'edit.start', Delete: 'edit.clear', 'Ctrl+Z': 'edit.undo', 'Ctrl+Y': 'edit.redo',
  'Ctrl+C': 'clip.copy', 'Ctrl+X': 'clip.cut', 'Ctrl+V': 'clip.paste', 'Ctrl+Alt+V': 'clip.pasteSpecial',
  'Ctrl+D': 'fill.down', 'Ctrl+R': 'fill.right', 'Alt+=': 'edit.autosum', 'Alt+Shift+=': 'edit.autosum',
  'Ctrl+;': 'edit.insertDate', 'Ctrl+Shift+;': 'edit.insertTime',
  'Ctrl+F': 'edit.find', 'Ctrl+H': 'edit.replace', 'Ctrl+S': 'edit.save',
  'Ctrl+Shift+=': 'cells.insert', 'Ctrl++': 'cells.insert', 'Ctrl+-': 'cells.delete',
  'Ctrl+9': 'row.hide', 'Ctrl+Shift+9': 'row.unhide', 'Ctrl+0': 'col.hide', 'Ctrl+Shift+0': 'col.unhide',
  'Shift+F11': 'sheet.insert',
  'Ctrl+B': 'fmt.bold', 'Ctrl+2': 'fmt.bold', 'Ctrl+I': 'fmt.italic', 'Ctrl+3': 'fmt.italic', 'Ctrl+U': 'fmt.underline', 'Ctrl+4': 'fmt.underline',
  'Ctrl+1': 'fmt.cells',
  'Ctrl+Shift+1': 'fmt.number', 'Ctrl+Shift+4': 'fmt.currency', 'Ctrl+Shift+5': 'fmt.percent', 'Ctrl+Shift+3': 'fmt.date',
  'Ctrl+Shift+2': 'fmt.time', 'Ctrl+Shift+`': 'fmt.general', 'Ctrl+Shift+7': 'border.outside', 'Ctrl+Shift+-': 'border.none',
  'Ctrl+Shift+L': 'data.filter', 'Alt+ArrowDown': 'data.filterMenu',
  'Ctrl+`': 'view.formulas', F1: 'help.shortcuts',
};

/** Keys the browser must never act on while the grid has focus. */
const ALWAYS_PREVENT = new Set(['Ctrl+S', 'Ctrl+P', 'Ctrl+F', 'Ctrl+H', 'Ctrl+G', 'Ctrl+D', 'Ctrl+R', 'Ctrl+B', 'Ctrl+I', 'Ctrl+U', 'Ctrl+A', 'F1', 'F5', 'Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+4', 'Ctrl+0', 'Ctrl+9', 'Ctrl+-', 'Ctrl+=', 'Ctrl+Shift+=', 'Ctrl+Y', 'Ctrl+Z', 'Ctrl+K', 'Ctrl+E', 'Ctrl+L', 'Ctrl+O', 'F3', 'F6', 'F7', 'F10', 'F11', 'F12', 'Ctrl+J', 'Ctrl+Shift+L']);

let altDownAlone = false;

/** Returns true if the key was handled. */
export function handleGridKey(s: AppStore, e: KeyLike): boolean {
  const k = combo(e);

  // ----- KEYTIP mode -----
  if (s.keytip !== null) {
    if (e.key === 'Escape') {
      s.keytip = s.keytip.length ? s.keytip.slice(0, -1) : null;
      if (s.keytip === '') s.keytip = s.keytip; // stay at top level
      s.notify();
      e.preventDefault();
      return true;
    }
    if (e.key === 'Alt') {
      e.preventDefault();
      return true;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      const letter = combo({ ...e, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false }).replace(/^Shift\+/, '');
      const path = s.keytip + letter;
      e.preventDefault();
      if (KEYTIPS[path]) {
        s.keytip = null;
        s.notify();
        runCommand(s, KEYTIPS[path], 'key');
        s.emitCommand('keytip.' + path, 'key');
        return true;
      }
      if (Object.keys(KEYTIPS).some((p) => p.startsWith(path))) {
        s.keytip = path;
        s.notify();
        return true;
      }
      s.keytip = null;
      s.notify();
      return true;
    }
    s.keytip = null;
    s.notify();
  }

  if (e.key === 'Alt') {
    altDownAlone = true;
    e.preventDefault();
    return true;
  }
  altDownAlone = false;

  // Alt+letter held together also starts a key-tip path (Alt+H, then O, I)
  if (e.altKey && !e.ctrlKey && !e.metaKey && /^Key[A-Z]$/.test(e.code)) {
    const letter = e.code.slice(3);
    if (Object.keys(KEYTIPS).some((p) => p.startsWith(letter))) {
      e.preventDefault();
      s.keytip = letter;
      s.notify();
      return true;
    }
  }

  // Go To Special multi-selection: typing starts an entry for all of them
  const cmd = BINDINGS[k];
  if (cmd) {
    e.preventDefault();
    if (s.clip && (cmd.startsWith('nav.') || cmd.startsWith('sel.'))) {
      /* marching ants stay until Esc or a paste, like Excel */
    }
    runCommand(s, cmd, 'key');
    return true;
  }
  if (e.key === 'Escape') {
    s.clip = null;
    s.status = null;
    s.multi = null;
    s.notify();
    return true;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (s.clip) {
      runCommand(s, 'clip.paste', 'key');
      s.clip = null;
      s.status = null;
      s.notify();
      return true;
    }
    s.withinRange ? s.moveWithin(e.shiftKey ? -1 : 1, 0) : s.move(e.shiftKey ? -1 : 1, 0);
    return true;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    s.withinRange ? s.moveWithin(0, e.shiftKey ? -1 : 1) : s.move(0, e.shiftKey ? -1 : 1);
    return true;
  }
  if (e.key === 'Backspace') {
    e.preventDefault();
    s.startEdit('', 'enter');
    return true;
  }
  if (ALWAYS_PREVENT.has(k)) {
    e.preventDefault();
    return true;
  }
  // printable character starts Enter mode
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    s.startEdit(e.key, 'enter');
    return true;
  }
  return false;
}

export function handleGridKeyUp(s: AppStore, e: KeyLike) {
  if (e.key === 'Alt' && altDownAlone) {
    altDownAlone = false;
    s.keytip = s.keytip === null ? '' : null;
    s.notify();
    e.preventDefault();
  }
}

/** Keys pressed while a cell editor (in-cell or formula bar) has focus. */
export function handleEditorKey(s: AppStore, e: KeyLike, caret: number): boolean {
  const ed = s.edit;
  if (!ed) return false;
  const k = combo(e);
  const ac = partialFn(ed.text, caret);
  const sugg = ac ? fnSuggestions(ac.prefix) : [];

  // autocomplete list navigation
  if (sugg.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.shiftKey && !e.ctrlKey && !ed.point) {
    const n = sugg.length;
    s.edit = { ...ed, acIndex: (ed.acIndex + (e.key === 'ArrowDown' ? 1 : n - 1)) % n };
    s.notify();
    e.preventDefault();
    return true;
  }
  if (sugg.length && e.key === 'Tab' && ac) {
    const name = sugg[Math.min(ed.acIndex, sugg.length - 1)];
    const text = ed.text.slice(0, ac.start) + name + '(' + ed.text.slice(caret);
    s.setEditText(text, ac.start + name.length + 1);
    s.emitCommand('edit.autocomplete', 'key');
    e.preventDefault();
    return true;
  }

  switch (k) {
    case 'Enter':
    case 'Shift+Enter':
      e.preventDefault();
      if (s.multi) {
        s.multi = null;
      }
      s.commitEdit(e.shiftKey ? 'up' : 'down');
      return true;
    case 'Ctrl+Enter':
      e.preventDefault();
      if (s.multi) {
        const text = ed.text;
        s.cancelEdit();
        s.fillMulti(text);
        s.emitCommand('edit.fillSelection', 'key');
        return true;
      }
      s.commitEdit('none', true);
      return true;
    case 'Alt+Enter': {
      e.preventDefault();
      const text = ed.text.slice(0, caret) + '\n' + ed.text.slice(caret);
      s.setEditText(text, caret + 1);
      return true;
    }
    case 'Tab':
    case 'Shift+Tab':
      e.preventDefault();
      s.commitEdit(e.shiftKey ? 'left' : 'right');
      return true;
    case 'Escape':
      e.preventDefault();
      s.cancelEdit();
      return true;
    case 'F4':
      e.preventDefault();
      s.f4();
      s.emitCommand('edit.f4', 'key');
      return true;
    case 'F2':
      e.preventDefault();
      s.toggleEditMode();
      return true;
    case 'Ctrl+;':
      e.preventDefault();
      s.insertNow(false);
      return true;
    case 'Ctrl+Shift+;':
      e.preventDefault();
      s.insertNow(true);
      return true;
    case 'Ctrl+Tab':
    case 'Ctrl+F6':
    case 'Ctrl+Shift+Tab':
    case 'Ctrl+Shift+F6':
      // switch workbook while building a formula (point mode across files)
      e.preventDefault();
      if (s.canPoint() || ed.point) {
        const dir = e.shiftKey ? -1 : 1;
        s.bi = (s.bi + dir + s.books.length) % s.books.length;
        s.emitCommand('nav.nextBook', 'key');
        s.notify();
      }
      return true;
    case 'Ctrl+PageDown':
    case 'Ctrl+PageUp':
    case 'Ctrl+Alt+PageDown':
    case 'Ctrl+Alt+PageUp':
      e.preventDefault();
      if (s.canPoint() || ed.point) {
        const dir = e.key === 'PageDown' ? 1 : -1;
        const n = s.book.sheets.length;
        s.sheetIdx[s.bi] = Math.max(0, Math.min(n - 1, s.si + dir));
        s.emitCommand(dir > 0 ? 'nav.nextSheet' : 'nav.prevSheet', 'key');
        s.notify();
      }
      return true;
  }

  // Arrow keys: in ENTER mode they either point (formula) or commit & move.
  const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (arrows[e.key] && !e.altKey) {
    if (ed.mode === 'edit' && !ed.point) return false; // native caret movement
    const [dr, dc] = arrows[e.key];
    if (s.canPoint()) {
      e.preventDefault();
      s.pointMove(dr, dc, e.shiftKey, e.ctrlKey || e.metaKey);
      s.emitCommand(`point.${e.ctrlKey || e.metaKey ? 'edge' : 'move'}${e.shiftKey ? 'Extend' : ''}`, 'key');
      return true;
    }
    if (e.shiftKey || e.ctrlKey || e.metaKey) return false; // let textarea select text
    e.preventDefault();
    s.commitEdit('none');
    s.move(dr, dc);
    return true;
  }
  if ((k === 'Ctrl+Space' || k === 'Shift+Space') && ed.point) {
    e.preventDefault();
    s.pointSelectWhole(k === 'Ctrl+Space' ? 'col' : 'row');
    return true;
  }
  return false;
}
