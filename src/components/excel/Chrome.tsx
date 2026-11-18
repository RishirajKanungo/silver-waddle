// Name Box + formula bar, sheet tabs, status bar, and the open-workbooks taskbar.

import { useEffect, useRef, useState } from 'react';
import type { AppStore } from '../../app/store';
import { useStore } from '../../app/useStore';
import { addrToA1, colToLetters } from '../../engine/refs';
import { GRID_COLS, GRID_ROWS } from '../../app/sheetOps';
import { ColoredFormula, FormulaAssist, useEditorBinding } from './CellEditor';
import { formatValue } from '../../engine/format';
import { isErr } from '../../engine/types';
import { runCommand } from '../../app/commands';

export function FormulaBar({ store, onMouseUse }: { store: AppStore; onMouseUse?: () => void }) {
  useStore(store);
  const s = store;
  const ref = useRef<HTMLTextAreaElement>(null);
  const [nameText, setNameText] = useState<string | null>(null);
  const g = s.range;
  const sel = s.sel;
  const editing = !!s.edit;
  const bind = useEditorBinding(s, ref, true);
  // When a formula is being built while looking at another sheet/file (point mode),
  // the in-cell editor isn't visible — keep typing focus in the formula bar.
  const awayFromOrigin = !!s.edit && (s.edit.bi !== s.bi || s.edit.si !== s.si);
  useEffect(() => {
    const el = ref.current;
    if (awayFromOrigin && el && document.activeElement !== el) {
      el.focus({ preventScroll: true });
      el.setSelectionRange(s.edit!.caret, s.edit!.caret);
    }
  });
  const h = g.r2 - g.r1 + 1, w = g.c2 - g.c1 + 1;
  const multi = h > 1 || w > 1;
  const point = s.edit?.point;
  let name = addrToA1(sel.ar, sel.ac);
  if (point) name = `${h > 1 || w > 1 ? '' : ''}${addrToA1(point.ar, point.ac)}`;
  const wholeCols = g.r1 === 0 && g.r2 === GRID_ROWS - 1;
  const wholeRows = g.c1 === 0 && g.c2 === GRID_COLS - 1;
  const sizeLabel = s.edit ? null : wholeCols && wholeRows ? null : multi && drag(s) ? `${h}R x ${w}C` : null;
  const content = s.edit ? s.edit.text : s.sheet.cells[`${sel.ar},${sel.ac}`]?.v ?? '';
  const spillAnchor = !s.edit && !content ? s.calc.spillAnchorOf(s.bi, s.si, sel.ar, sel.ac) : null;
  const shown = spillAnchor ? s.sheet.cells[`${spillAnchor.r},${spillAnchor.c}`]?.v ?? '' : content;
  return (
    <div className="formula-bar">
      <div className="namebox-wrap">
        <input
          id="namebox"
          className="namebox"
          value={nameText ?? sizeLabel ?? (wholeCols && !wholeRows ? `${colToLetters(g.c1)}:${colToLetters(g.c2)}` : name)}
          onFocus={(e) => {
            setNameText(e.target.value);
            e.target.select();
          }}
          onMouseUp={(e) => e.preventDefault()}
          onChange={(e) => setNameText(e.target.value)}
          onBlur={() => setNameText(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const t = (nameText ?? '').trim();
              if (t && !s.goTo(t)) s.toast(`"${t}" is not a valid reference.`, 'warn');
              else s.emitCommand('nav.nameBox', 'key');
              setNameText(null);
              (e.target as HTMLInputElement).blur();
            } else if (e.key === 'Escape') {
              setNameText(null);
              (e.target as HTMLInputElement).blur();
            }
          }}
          spellCheck={false}
          data-testid="namebox"
        />
        <span className="namebox-arrow">▾</span>
      </div>
      <div className="fx-sep">⋮</div>
      <button className={'fx-btn' + (editing ? '' : ' dim')} title="Cancel (Esc)" onMouseDown={(e) => { e.preventDefault(); s.cancelEdit(); }}>✕</button>
      <button className={'fx-btn ok' + (editing ? '' : ' dim')} title="Enter" onMouseDown={(e) => { e.preventDefault(); s.commitEdit('none'); }}>✓</button>
      <button className="fx-btn fx" title="Insert Function" onMouseDown={(e) => { e.preventDefault(); if (!s.edit) s.startEdit('=', 'enter'); }}>
        <i>f</i>x
      </button>
      <div className="fx-input-wrap">
        {editing ? (
          <>
            <div className="editor-hl fx-hl" aria-hidden>
              <ColoredFormula text={s.edit!.text} />
              {'​'}
            </div>
            <textarea
              ref={ref}
              className="fx-input"
              defaultValue={s.edit!.text}
              spellCheck={false}
              {...bind}
              onMouseDown={(e) => e.stopPropagation()}
              data-testid="formula-bar"
            />
            {document.activeElement === ref.current && <FormulaAssist store={s} left={0} top={26} />}
          </>
        ) : (
          <div
            className="fx-static"
            onMouseDown={(e) => {
              e.preventDefault();
              onMouseUse?.();
              s.startEdit(undefined, 'edit');
              setTimeout(() => {
                const el = document.querySelector('.fx-input') as HTMLTextAreaElement | null;
                el?.focus();
                el?.setSelectionRange(el.value.length, el.value.length);
              }, 0);
            }}
            data-testid="formula-bar-static"
          >
            <span className={spillAnchor ? 'ghost' : ''}>{shown}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function drag(_s: AppStore) {
  return false;
}

export function SheetTabs({ store, onMouseUse }: { store: AppStore; onMouseUse?: () => void }) {
  useStore(store);
  const s = store;
  const [renaming, setRenaming] = useState<number | null>(null);
  const [val, setVal] = useState('');
  return (
    <div className="sheet-tabs">
      <div className="tab-nav">
        <button onMouseDown={(e) => { e.preventDefault(); s.activateSheet(s.si - 1); }}>◀</button>
        <button onMouseDown={(e) => { e.preventDefault(); s.activateSheet(s.si + 1); }}>▶</button>
      </div>
      <div className="tabs">
        {s.book.sheets.map((sh, i) => (
          <div
            key={sh.name + i}
            className={'tab' + (i === s.si ? ' on' : '')}
            onMouseDown={(e) => {
              e.preventDefault();
              onMouseUse?.();
              if (s.edit && !s.canPoint()) s.commitEdit('none');
              s.activateSheet(i);
            }}
            onDoubleClick={() => {
              setRenaming(i);
              setVal(sh.name);
            }}
            title="Double-click to rename"
            data-testid={`tab-${sh.name}`}
          >
            {renaming === i ? (
              <input
                autoFocus
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') {
                    s.renameSheet(i, val);
                    s.emitCommand('sheet.rename', 'mouse');
                    setRenaming(null);
                  }
                  if (e.key === 'Escape') setRenaming(null);
                }}
                onBlur={() => setRenaming(null)}
                onMouseDown={(e) => e.stopPropagation()}
              />
            ) : (
              sh.name
            )}
          </div>
        ))}
        <button className="tab-add" title="New sheet (Shift+F11)" onMouseDown={(e) => { e.preventDefault(); runCommand(s, 'sheet.insert', 'mouse'); }}>
          +
        </button>
      </div>
    </div>
  );
}

export function StatusBar({ store }: { store: AppStore }) {
  useStore(store);
  const s = store;
  const g = s.clampToUsed(s.range);
  let sum = 0, count = 0, nums = 0, mn = Infinity, mx = -Infinity;
  const cells = (g.r2 - g.r1 + 1) * (g.c2 - g.c1 + 1);
  if (cells > 1 && cells < 200000) {
    for (let r = g.r1; r <= g.r2; r++) {
      if (s.isHiddenRow(r)) continue;
      for (let c = g.c1; c <= g.c2; c++) {
        const v = s.value(r, c);
        if (v === null || v === '') continue;
        count++;
        if (typeof v === 'number') {
          nums++;
          sum += v;
          mn = Math.min(mn, v);
          mx = Math.max(mx, v);
        }
      }
    }
  }
  const fmt = (n: number) => formatValue(n, Math.abs(n) >= 1000 ? '#,##0.00' : 'General');
  const mode = s.edit ? (s.edit.point ? 'Point' : s.edit.mode === 'edit' ? 'Edit' : 'Enter') : 'Ready';
  const hidden = Object.keys(s.sheet.hiddenRows ?? {}).length;
  const filterInfo = s.sheet.filter && hidden ? `Filter Mode` : null;
  const errCount = 0;
  void errCount;
  return (
    <div className="status-bar">
      <span className="mode">{s.status ?? mode}</span>
      {filterInfo && <span className="stat">{filterInfo}</span>}
      {s.calc.circular && <span className="stat warn">Circular References: {s.calc.circular}</span>}
      <span className="grow" />
      {count > 1 && nums > 0 && <span className="stat">Average: {fmt(sum / nums)}</span>}
      {count > 1 && <span className="stat">Count: {count}</span>}
      {count > 1 && nums > 1 && <span className="stat">Min: {fmt(mn)}</span>}
      {count > 1 && nums > 1 && <span className="stat">Max: {fmt(mx)}</span>}
      {count > 1 && nums > 0 && <span className="stat">Sum: {fmt(sum)}</span>}
      <span className="views">▦ ▤ ▥</span>
      <span className="zoom">— ┼ + 100%</span>
    </div>
  );
}

/** Windows-style taskbar of open workbooks — makes cross-file work tangible. */
export function BookBar({ store, onMouseUse }: { store: AppStore; onMouseUse?: () => void }) {
  useStore(store);
  const s = store;
  if (s.books.length < 2) return null;
  return (
    <div className="book-bar">
      <span className="bb-label">Open files</span>
      {s.books.map((b, i) => (
        <button
          key={b.id}
          className={'bb-item' + (i === s.bi ? ' on' : '') + (s.readOnlyBooks.has(i) ? ' ro' : '')}
          onMouseDown={(e) => {
            e.preventDefault();
            onMouseUse?.();
            if (s.edit && !s.canPoint()) s.commitEdit('none');
            s.activateBook(i);
          }}
          title={s.readOnlyBooks.has(i) ? 'Read-only source file' : b.name}
          data-testid={`book-${b.name}`}
        >
          <span className="xl-icon">X</span>
          {b.name}
          {s.readOnlyBooks.has(i) && <span className="ro-tag">Read-Only</span>}
        </button>
      ))}
      <span className="bb-tip">Switch files: Ctrl+Tab / Ctrl+F6 (works mid-formula)</span>
    </div>
  );
}

export function valueTip(v: unknown) {
  return isErr(v) ? String(v) : '';
}
