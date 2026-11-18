// The ribbon. Every button runs a command id, so ribbon clicks, shortcuts and
// Alt key-tips all count the same way for lessons. When Alt is tapped, badges
// show the remaining letters of each Alt sequence (e.g. "VV" for Paste Values).

import { useState } from 'react';
import type { AppStore } from '../../app/store';
import { useStore } from '../../app/useStore';
import { CMD, runCommand } from '../../app/commands';
import { FORMATS } from '../../engine/format';
import { getCell } from '../../app/sheetOps';

type Btn = { cmd: string; label: string; icon: string; big?: boolean; title?: string };
type Group = { name: string; items: (Btn | Btn[])[] };

const TABS: { id: string; label: string; key: string; groups: Group[] }[] = [
  {
    id: 'home',
    label: 'Home',
    key: 'H',
    groups: [
      {
        name: 'Clipboard',
        items: [
          { cmd: 'clip.paste', label: 'Paste', icon: '📋', big: true },
          [
            { cmd: 'clip.cut', label: 'Cut', icon: '✂' },
            { cmd: 'clip.copy', label: 'Copy', icon: '⧉' },
            { cmd: 'clip.pasteValues', label: 'Paste Values', icon: '¹²³' },
          ],
        ],
      },
      {
        name: 'Font',
        items: [
          [
            { cmd: 'fmt.bold', label: 'Bold', icon: 'B' },
            { cmd: 'fmt.italic', label: 'Italic', icon: 'I' },
            { cmd: 'fmt.underline', label: 'Underline', icon: 'U' },
          ],
          [
            { cmd: 'border.all', label: 'All Borders', icon: '▦' },
            { cmd: 'border.thick', label: 'Thick Box', icon: '▣' },
            { cmd: 'border.none', label: 'No Border', icon: '⬚' },
          ],
          [
            { cmd: 'fmt.fill', label: 'Fill Color', icon: '🖌' },
            { cmd: 'fmt.fontColor', label: 'Font Color', icon: 'A' },
          ],
        ],
      },
      {
        name: 'Alignment',
        items: [
          [
            { cmd: 'fmt.alignLeft', label: 'Align Left', icon: '⫷' },
            { cmd: 'fmt.alignCenter', label: 'Center', icon: '☰' },
            { cmd: 'fmt.alignRight', label: 'Align Right', icon: '⫸' },
          ],
          [{ cmd: 'fmt.wrap', label: 'Wrap Text', icon: '↵' }],
        ],
      },
      {
        name: 'Number',
        items: [
          [
            { cmd: 'fmt.accounting', label: 'Accounting', icon: '$' },
            { cmd: 'fmt.percent', label: 'Percent', icon: '%' },
            { cmd: 'fmt.comma', label: 'Comma Style', icon: ',' },
          ],
          [
            { cmd: 'fmt.decInc', label: 'Increase Decimal', icon: '←.0' },
            { cmd: 'fmt.decDec', label: 'Decrease Decimal', icon: '.00→' },
          ],
        ],
      },
      { name: 'Styles', items: [{ cmd: 'cf.open', label: 'Conditional Formatting', icon: '▤', big: true }] },
      {
        name: 'Cells',
        items: [
          [
            { cmd: 'row.insert', label: 'Insert Rows', icon: '⊞' },
            { cmd: 'col.insert', label: 'Insert Cols', icon: '⊞' },
            { cmd: 'sheet.insert', label: 'Insert Sheet', icon: '⊕' },
          ],
          [
            { cmd: 'row.delete', label: 'Delete Rows', icon: '⊟' },
            { cmd: 'col.delete', label: 'Delete Cols', icon: '⊟' },
            { cmd: 'col.autofit', label: 'AutoFit Width', icon: '↔' },
          ],
        ],
      },
      {
        name: 'Editing',
        items: [
          [
            { cmd: 'edit.autosum', label: 'AutoSum', icon: 'Σ' },
            { cmd: 'fill.down', label: 'Fill Down', icon: '⬇' },
            { cmd: 'fmt.clear', label: 'Clear Formats', icon: '⌫' },
          ],
          [
            { cmd: 'data.sortAscHome', label: 'Sort A→Z', icon: 'A↓' },
            { cmd: 'data.filterHome', label: 'Filter', icon: '⏷' },
            { cmd: 'edit.find', label: 'Find', icon: '🔍' },
          ],
        ],
      },
    ],
  },
  {
    id: 'insert',
    label: 'Insert',
    key: 'N',
    groups: [
      { name: 'Tables', items: [{ cmd: 'insert.pivot', label: 'PivotTable', icon: '⊞', big: true }] },
      { name: 'Worksheet', items: [{ cmd: 'sheet.insert', label: 'New Sheet', icon: '⊕', big: true }] },
    ],
  },
  {
    id: 'formulas',
    label: 'Formulas',
    key: 'M',
    groups: [
      { name: 'Function Library', items: [{ cmd: 'edit.autosum', label: 'AutoSum', icon: 'Σ', big: true }] },
      {
        name: 'Formula Auditing',
        items: [
          { cmd: 'view.formulas', label: 'Show Formulas', icon: 'ƒx', big: true },
          { cmd: 'nav.tracePrecedent', label: 'Go to Precedent (Ctrl+[)', icon: '⇱', big: true },
        ],
      },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    key: 'A',
    groups: [
      {
        name: 'Sort & Filter',
        items: [
          [
            { cmd: 'data.sortAsc', label: 'Sort A to Z', icon: 'A↓Z' },
            { cmd: 'data.sortDesc', label: 'Sort Z to A', icon: 'Z↓A' },
          ],
          { cmd: 'data.sortCustom', label: 'Sort', icon: '⇅', big: true },
          { cmd: 'data.filter', label: 'Filter', icon: '⏷', big: true },
          [{ cmd: 'data.clearFilters', label: 'Clear', icon: '✕' }],
        ],
      },
      {
        name: 'Data Tools',
        items: [
          { cmd: 'data.textToCols', label: 'Text to Columns', icon: '⫼', big: true },
          { cmd: 'data.removeDup', label: 'Remove Duplicates', icon: '⊜', big: true },
        ],
      },
    ],
  },
  {
    id: 'view',
    label: 'View',
    key: 'W',
    groups: [
      {
        name: 'Window',
        items: [
          [
            { cmd: 'view.freezePanes', label: 'Freeze Panes', icon: '❄' },
            { cmd: 'view.freezeRow', label: 'Freeze Top Row', icon: '▔' },
            { cmd: 'view.freezeCol', label: 'Freeze First Column', icon: '▏' },
          ],
        ],
      },
      {
        name: 'Show',
        items: [
          { cmd: 'view.gridlines', label: 'Gridlines', icon: '#', big: true },
          { cmd: 'view.formulas', label: 'Formulas', icon: 'ƒx', big: true },
        ],
      },
    ],
  },
];

const TAB_KEYS: Record<string, string> = { H: 'home', N: 'insert', M: 'formulas', A: 'data', W: 'view' };

export function Ribbon({ store, onMouseUse, extra }: { store: AppStore; onMouseUse?: () => void; extra?: React.ReactNode }) {
  useStore(store);
  const s = store;
  const [tab, setTab] = useState('home');
  const kt = s.keytip;
  const ktTab = kt && kt.length >= 1 ? TAB_KEYS[kt[0]] : undefined;
  const shown = ktTab ?? tab;
  const cur = TABS.find((t) => t.id === shown)!;
  const cell = getCell(s.sheet, s.sel.ar, s.sel.ac);
  const st = cell?.s ?? {};
  const fmtName = Object.entries({ General: undefined, Number: FORMATS.number, Currency: FORMATS.currency, Accounting: FORMATS.accounting, 'Short Date': FORMATS.shortDate, Percentage: FORMATS.percent, Text: FORMATS.text }).find(([, f]) => f === st.fmt)?.[0] ?? (st.fmt ? 'Custom' : 'General');

  const press = (cmd: string) => {
    onMouseUse?.();
    if (s.edit) s.commitEdit('none');
    runCommand(s, cmd, 'mouse');
  };

  const badge = (cmd: string) => {
    if (kt === null || kt.length === 0) return null;
    const k = CMD[cmd]?.keytip;
    if (!k || !k.startsWith(kt)) return null;
    return <span className="keytip">{k.slice(kt.length)}</span>;
  };

  const active = (cmd: string) =>
    (cmd === 'fmt.bold' && st.b) || (cmd === 'fmt.italic' && st.i) || (cmd === 'fmt.underline' && st.u) || (cmd === 'view.gridlines' && s.sheet.showGridlines !== false) || (cmd === 'view.formulas' && s.showFormulas) || (cmd === 'data.filter' && !!s.sheet.filter) || (cmd === 'view.freezePanes' && !!s.sheet.freeze);

  const renderBtn = (b: Btn, small: boolean) => (
    <button
      key={b.cmd + b.label}
      className={(small ? 'rb-small' : 'rb-big') + (active(b.cmd) ? ' on' : '')}
      onMouseDown={(e) => {
        e.preventDefault();
        press(b.cmd);
      }}
      title={`${b.label}${CMD[b.cmd]?.keys?.length ? `  (${CMD[b.cmd].keys!.join(' / ')})` : ''}`}
      data-cmd={b.cmd}
    >
      <span className={'rb-icon' + (b.icon === 'B' ? ' bold' : b.icon === 'I' ? ' ital' : b.icon === 'U' ? ' und' : '')}>{b.icon}</span>
      <span className="rb-label">{b.label}</span>
      {badge(b.cmd)}
    </button>
  );

  return (
    <div className="ribbon">
      <div className="ribbon-tabs">
        <div className="rt file" title="File">
          File{kt === '' && <span className="keytip tab">F</span>}
        </div>
        {TABS.map((t) => (
          <div
            key={t.id}
            className={'rt' + (t.id === shown ? ' on' : '')}
            onMouseDown={(e) => {
              e.preventDefault();
              setTab(t.id);
            }}
          >
            {t.label}
            {kt === '' && <span className="keytip tab">{t.key}</span>}
          </div>
        ))}
        <div className="rt-spacer" />
        {extra}
      </div>
      <div className="ribbon-body">
        {cur.groups.map((g) => (
          <div className="rgroup" key={g.name}>
            <div className="rgroup-items">
              {g.name === 'Number' && (
                <div className="rcol">
                  <select
                    className="numfmt"
                    value={fmtName}
                    onChange={(e) => {
                      onMouseUse?.();
                      const map: Record<string, string> = { General: 'General', Number: FORMATS.number, Currency: FORMATS.currency, Accounting: FORMATS.accounting, 'Short Date': FORMATS.shortDate, Percentage: FORMATS.percent, Text: FORMATS.text };
                      if (map[e.target.value]) s.setFormat(map[e.target.value]);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {['General', 'Number', 'Currency', 'Accounting', 'Short Date', 'Percentage', 'Text', 'Custom'].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  <button className="rb-small" onMouseDown={(e) => { e.preventDefault(); press('fmt.cells'); }} title="Format Cells (Ctrl+1)">
                    <span className="rb-icon">⋯</span>
                    <span className="rb-label">More formats…</span>
                    {badge('fmt.cells')}
                  </button>
                </div>
              )}
              {g.items.map((it, i) =>
                Array.isArray(it) ? (
                  <div className="rcol" key={i}>
                    {it.map((b) => renderBtn(b, true))}
                  </div>
                ) : (
                  renderBtn(it, false)
                ),
              )}
            </div>
            <div className="rgroup-name">{g.name}</div>
          </div>
        ))}
      </div>
      {kt !== null && (
        <div className="keytip-banner">
          Key Tips: <b>Alt {kt.split('').join(' ')}</b> {kt === '' ? '— press a tab letter (H = Home, A = Data, W = View, N = Insert, M = Formulas). Legacy: E S V = Paste Values.' : '— keep typing the letters shown on the buttons.'} Esc to back out.
        </div>
      )}
    </div>
  );
}
