// Excel-style dialog boxes. Enter = OK, Esc = Cancel (like the real thing).

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppStore } from '../../app/store';
import { useStore } from '../../app/useStore';
import { COMMANDS, runCommand } from '../../app/commands';
import { FORMATS, formatValue } from '../../engine/format';
import { addrToA1, colToLetters, parseRange, RangeAddr } from '../../engine/refs';
import { displayText, getCell } from '../../app/sheetOps';
import type { CFRule } from '../../engine/types';

function Dialog({ title, onOk, onClose, children, okLabel = 'OK', width = 380, extraButtons }: { title: string; onOk?: () => void; onClose: () => void; children: React.ReactNode; okLabel?: string; width?: number; extraButtons?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector('input:not([type=checkbox]):not([type=radio]), select, button.primary') as HTMLElement | null;
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  }, []);
  return (
    <div className="dlg-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className="dlg"
        style={{ width }}
        role="dialog"
        aria-label={title}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          } else if (e.key === 'Enter' && onOk && !(e.target instanceof HTMLTextAreaElement)) {
            e.preventDefault();
            onOk();
          }
        }}
      >
        <div className="dlg-title">
          <span>{title}</span>
          <button className="dlg-x" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="dlg-body">{children}</div>
        <div className="dlg-foot">
          {extraButtons}
          <span className="grow" />
          {onOk && (
            <button className="primary" onClick={onOk}>
              {okLabel}
            </button>
          )}
          <button onClick={onClose}>{onOk ? 'Cancel' : 'Close'}</button>
        </div>
      </div>
    </div>
  );
}

export function Dialogs({ store }: { store: AppStore }) {
  useStore(store);
  const d = store.dialog;
  if (!d) return null;
  const close = () => store.openDialog(null);
  switch (d.type) {
    case 'goto':
      return <GotoDialog s={store} close={close} />;
    case 'gotoSpecial':
      return <GotoSpecialDialog s={store} close={close} />;
    case 'find':
      return <FindDialog s={store} close={close} replace={!!d.replace} />;
    case 'formatCells':
      return <FormatCellsDialog s={store} close={close} />;
    case 'pasteSpecial':
      return <PasteSpecialDialog s={store} close={close} />;
    case 'insert':
    case 'delete':
      return <InsertDeleteDialog s={store} close={close} del={d.type === 'delete'} />;
    case 'sort':
      return <SortDialog s={store} close={close} />;
    case 'pivot':
      return <PivotDialog s={store} close={close} />;
    case 'removeDup':
      return <RemoveDupDialog s={store} close={close} />;
    case 'textToCols':
      return <TextToColsDialog s={store} close={close} />;
    case 'cf':
      return <CFDialog s={store} close={close} />;
    case 'rename':
      return <RenameDialog s={store} close={close} />;
    case 'colWidth':
      return <ColWidthDialog s={store} close={close} />;
    case 'filterMenu':
      return <FilterMenu s={store} close={close} col={d.col} />;
    case 'shortcuts':
      return <ShortcutSheet close={close} />;
  }
}

type P = { s: AppStore; close: () => void };

function GotoDialog({ s, close }: P) {
  const [ref, setRef] = useState('');
  const ok = () => {
    if (s.goTo(ref)) close();
    else s.toast('Reference isn’t valid.', 'warn');
  };
  return (
    <Dialog title="Go To" onOk={ok} onClose={close} extraButtons={<button onClick={() => s.openDialog({ type: 'gotoSpecial' })}>Special…</button>}>
      <label className="dlg-label">Reference:</label>
      <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. B200 or Summary!A1" />
      <p className="dlg-note">Tip: Special… → Blanks selects every empty cell in the data — then type = ↑ and press Ctrl+Enter to fill them all.</p>
    </Dialog>
  );
}

function GotoSpecialDialog({ s, close }: P) {
  const [k, setK] = useState<'blanks' | 'constants' | 'formulas' | 'errors'>('blanks');
  const ok = () => {
    close();
    const n = s.gotoSpecial(k);
    if (n) s.emitCommand('nav.gotoSpecial.' + k, 'key');
  };
  return (
    <Dialog title="Go To Special" onOk={ok} onClose={close}>
      {(['blanks', 'constants', 'formulas', 'errors'] as const).map((x) => (
        <label key={x} className="dlg-radio">
          <input type="radio" checked={k === x} onChange={() => setK(x)} /> {x[0].toUpperCase() + x.slice(1)}
        </label>
      ))}
      <p className="dlg-note">Works on the selection (or the current region if a single cell is selected).</p>
    </Dialog>
  );
}

function FindDialog({ s, close, replace }: P & { replace: boolean }) {
  const [q, setQ] = useState('');
  const [rep, setRep] = useState('');
  const [mc, setMc] = useState(false);
  const [msg, setMsg] = useState('');
  const next = () => {
    const hit = s.find(q, { matchCase: mc });
    if (hit) {
      s.select(hit.r, hit.c);
      setMsg(`Found in ${addrToA1(hit.r, hit.c)}`);
    } else setMsg('Microsoft Excel cannot find the data you’re searching for.');
  };
  return (
    <Dialog
      title="Find and Replace"
      onOk={next}
      okLabel="Find Next"
      onClose={close}
      extraButtons={
        replace ? (
          <button
            onClick={() => {
              const n = s.replaceAll(q, rep, mc);
              setMsg(`All done. We made ${n} replacements.`);
              s.emitCommand('edit.replaceAll', 'mouse');
            }}
          >
            Replace All
          </button>
        ) : undefined
      }
    >
      <label className="dlg-label">Find what:</label>
      <input value={q} onChange={(e) => setQ(e.target.value)} />
      {replace && (
        <>
          <label className="dlg-label">Replace with:</label>
          <input value={rep} onChange={(e) => setRep(e.target.value)} />
        </>
      )}
      <label className="dlg-check">
        <input type="checkbox" checked={mc} onChange={(e) => setMc(e.target.checked)} /> Match case
      </label>
      {msg && <p className="dlg-note">{msg}</p>}
    </Dialog>
  );
}

const CATS = ['General', 'Number', 'Currency', 'Accounting', 'Date', 'Percentage', 'Text', 'Custom'] as const;

function FormatCellsDialog({ s, close }: P) {
  const cell = getCell(s.sheet, s.sel.ar, s.sel.ac);
  const st = cell?.s ?? {};
  const v = s.value(s.sel.ar, s.sel.ac);
  const [tab, setTab] = useState<'Number' | 'Alignment' | 'Font' | 'Fill'>('Number');
  const [cat, setCat] = useState<(typeof CATS)[number]>(st.fmt ? 'Custom' : 'General');
  const [dec, setDec] = useState(2);
  const [sep, setSep] = useState(true);
  const [neg, setNeg] = useState(0);
  const [dateFmt, setDateFmt] = useState('m/d/yyyy');
  const [custom, setCustom] = useState(st.fmt ?? 'General');
  const [align, setAlign] = useState(st.align ?? '');
  const [wrap, setWrap] = useState(!!st.wrap);
  const [b, setB] = useState(!!st.b);
  const [i, setI] = useState(!!st.i);
  const [u, setU] = useState(!!st.u);
  const [color, setColor] = useState(st.color ?? '');
  const [fill, setFill] = useState(st.fill ?? '');
  const d0 = dec > 0 ? '.' + '0'.repeat(dec) : '';
  const fmt =
    cat === 'General' ? 'General' :
    cat === 'Number' ? (() => { const base = (sep ? '#,##0' : '0') + d0; return neg === 1 ? `${base};[Red]${base}` : neg === 2 ? `${base}_);(${base})` : neg === 3 ? `${base}_);[Red](${base})` : base; })() :
    cat === 'Currency' ? `$#,##0${d0}` + (neg === 2 ? `_);($#,##0${d0})` : '') :
    cat === 'Accounting' ? `$#,##0${d0}_);($#,##0${d0})` :
    cat === 'Date' ? dateFmt :
    cat === 'Percentage' ? `0${d0}%` :
    cat === 'Text' ? '@' : custom;
  const sample = typeof v === 'number' || v === null ? formatValue(typeof v === 'number' ? v : 1234.5, fmt) : formatValue(v, fmt);
  const ok = () => {
    s.style((x) => ({ ...x, fmt: fmt === 'General' ? undefined : fmt, align: (align || undefined) as never, wrap, b, i, u, color: color || undefined, fill: fill || undefined }));
    s.emitCommand('fmt.cells.ok', 'mouse');
    close();
  };
  const swatches = ['', '#FFFF00', '#FFC7CE', '#C6EFCE', '#FFEB9C', '#DDEBF7', '#D9D9D9', '#F4B084', '#9BC2E6', '#A9D08E'];
  return (
    <Dialog title="Format Cells" onOk={ok} onClose={close} width={520}>
      <div className="dlg-tabs">
        {(['Number', 'Alignment', 'Font', 'Fill'] as const).map((t) => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'Number' && (
        <div className="fc-number">
          <div className="fc-cats">
            <label className="dlg-label">Category:</label>
            <select size={8} value={cat} onChange={(e) => setCat(e.target.value as never)}>
              {CATS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="fc-opts">
            <div className="fc-sample">
              Sample: <b>{sample}</b>
            </div>
            {['Number', 'Currency', 'Accounting', 'Percentage'].includes(cat) && (
              <label className="dlg-inline">
                Decimal places: <input type="number" min={0} max={10} value={dec} onChange={(e) => setDec(Math.max(0, +e.target.value))} style={{ width: 60 }} />
              </label>
            )}
            {cat === 'Number' && (
              <>
                <label className="dlg-check">
                  <input type="checkbox" checked={sep} onChange={(e) => setSep(e.target.checked)} /> Use 1000 Separator (,)
                </label>
                <label className="dlg-label">Negative numbers:</label>
                <select size={4} value={neg} onChange={(e) => setNeg(+e.target.value)}>
                  <option value={0}>-1,234.10</option>
                  <option value={1} style={{ color: '#C00000' }}>1,234.10</option>
                  <option value={2}>(1,234.10)</option>
                  <option value={3} style={{ color: '#C00000' }}>(1,234.10)</option>
                </select>
              </>
            )}
            {cat === 'Date' && (
              <>
                <label className="dlg-label">Type:</label>
                <select size={6} value={dateFmt} onChange={(e) => setDateFmt(e.target.value)}>
                  {['m/d/yyyy', 'yyyy-mm-dd', 'd-mmm-yy', 'dd-mmm-yyyy', 'mmm-yy', 'mmmm d, yyyy', 'dddd'].map((f) => (
                    <option key={f} value={f}>
                      {formatValue(typeof v === 'number' ? v : 45306, f)}
                    </option>
                  ))}
                </select>
              </>
            )}
            {cat === 'Custom' && (
              <>
                <label className="dlg-label">Type:</label>
                <input value={custom} onChange={(e) => setCustom(e.target.value)} />
                <select size={6} value={custom} onChange={(e) => setCustom(e.target.value)}>
                  {['General', '0', '0.00', '#,##0', '#,##0.00', '#,##0_);(#,##0)', '#,##0.00_);[Red](#,##0.00)', '$#,##0,"K"', '$#,##0.0,,"M"', '0%', '0.0%', 'yyyy-mm-dd', 'mmm-yy', '@'].map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
                <p className="dlg-note">Tip: a trailing comma divides by 1,000 — `$#,##0,"K"` shows 1,500,000 as $1,500K.</p>
              </>
            )}
            {cat === 'Accounting' && <p className="dlg-note">Accounting puts negatives in parentheses — the banking standard.</p>}
            {cat === 'Text' && <p className="dlg-note">Text format makes Excel keep exactly what you type (e.g. account IDs with leading zeros).</p>}
          </div>
        </div>
      )}
      {tab === 'Alignment' && (
        <div>
          <label className="dlg-label">Horizontal:</label>
          <select value={align} onChange={(e) => setAlign(e.target.value as never)}>
            <option value="">General</option>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
          <label className="dlg-check">
            <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} /> Wrap text
          </label>
        </div>
      )}
      {tab === 'Font' && (
        <div>
          <label className="dlg-check"><input type="checkbox" checked={b} onChange={(e) => setB(e.target.checked)} /> Bold</label>
          <label className="dlg-check"><input type="checkbox" checked={i} onChange={(e) => setI(e.target.checked)} /> Italic</label>
          <label className="dlg-check"><input type="checkbox" checked={u} onChange={(e) => setU(e.target.checked)} /> Underline</label>
          <label className="dlg-label">Color:</label>
          <div className="swatches">
            {['', '#000000', '#0000FF', '#C00000', '#00B050', '#7030A0', '#808080'].map((c) => (
              <button key={c || 'auto'} className={'swatch' + (color === c ? ' on' : '')} style={{ background: c || '#fff' }} onClick={() => setColor(c)} title={c === '#0000FF' ? 'Blue = hard-coded input (banking convention)' : c || 'Automatic'}>
                {c ? '' : 'A'}
              </button>
            ))}
          </div>
        </div>
      )}
      {tab === 'Fill' && (
        <div>
          <label className="dlg-label">Background Color:</label>
          <div className="swatches">
            {swatches.map((c) => (
              <button key={c || 'none'} className={'swatch' + (fill === c ? ' on' : '')} style={{ background: c || '#fff' }} onClick={() => setFill(c)} title={c || 'No Color'}>
                {c ? '' : '∅'}
              </button>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  );
}

function PasteSpecialDialog({ s, close }: P) {
  const [mode, setMode] = useState<'all' | 'values' | 'formulas' | 'formats'>('values');
  const [tr, setTr] = useState(false);
  const ok = () => {
    close();
    s.paste(mode, tr);
    s.emitCommand(mode === 'values' ? 'clip.pasteValues' : 'clip.paste.' + mode, 'key');
    if (tr) s.emitCommand('clip.pasteTranspose', 'key');
  };
  return (
    <Dialog
      title="Paste Special"
      onOk={ok}
      onClose={close}
    >
      <div
        onKeyDown={(e) => {
          const k = e.key.toLowerCase();
          if (k === 'v') setMode('values');
          if (k === 'f') setMode('formulas');
          if (k === 't') setMode('formats');
          if (k === 'a') setMode('all');
          if (k === 'e') setTr((x) => !x);
        }}
      >
        <label className="dlg-label">Paste</label>
        {(
          [
            ['all', 'All', 'A'],
            ['formulas', 'Formulas', 'F'],
            ['values', 'Values', 'V'],
            ['formats', 'Formats', 'T'],
          ] as const
        ).map(([k, l, u]) => (
          <label key={k} className="dlg-radio">
            <input type="radio" checked={mode === k} onChange={() => setMode(k)} /> {l} <span className="ul">({u})</span>
          </label>
        ))}
        <label className="dlg-check">
          <input type="checkbox" checked={tr} onChange={(e) => setTr(e.target.checked)} /> Transpose <span className="ul">(E)</span>
        </label>
        <p className="dlg-note">Values replaces formulas with their results — how you “break links” to other files before emailing a report.</p>
      </div>
    </Dialog>
  );
}

function InsertDeleteDialog({ s, close, del }: P & { del: boolean }) {
  const [k, setK] = useState<'row' | 'col'>('row');
  const ok = () => {
    close();
    if (del) s.deleteCells(k);
    else s.insertCells(k);
    s.emitCommand(`${k}.${del ? 'delete' : 'insert'}`, 'key');
  };
  return (
    <Dialog title={del ? 'Delete' : 'Insert'} onOk={ok} onClose={close} width={300}>
      <label className="dlg-radio">
        <input type="radio" checked={k === 'row'} onChange={() => setK('row')} /> Entire <u>r</u>ow
      </label>
      <label className="dlg-radio">
        <input type="radio" checked={k === 'col'} onChange={() => setK('col')} /> Entire <u>c</u>olumn
      </label>
      <p className="dlg-note">Pro move: select the row first with Shift+Space (or column with Ctrl+Space) and this box is skipped.</p>
    </Dialog>
  );
}

function headersOf(s: AppStore, g: RangeAddr, hasHeader: boolean) {
  const out: { col: number; name: string }[] = [];
  for (let c = g.c1; c <= g.c2; c++) out.push({ col: c, name: hasHeader ? String(s.value(g.r1, c) ?? `Column ${colToLetters(c)}`) : `Column ${colToLetters(c)}` });
  return out;
}

function SortDialog({ s, close }: P) {
  const g = useMemo(() => s.dataRange(), [s]);
  const [hdr, setHdr] = useState(s.guessHeader(g));
  const heads = headersOf(s, g, hdr);
  const [levels, setLevels] = useState([{ col: s.sel.ac, desc: false }]);
  const ok = () => {
    close();
    s.selectRange(g);
    s.sort(levels, g, hdr);
    s.emitCommand('data.sortCustom.ok', 'mouse');
  };
  return (
    <Dialog
      title="Sort"
      onOk={ok}
      onClose={close}
      width={520}
      extraButtons={
        <>
          <button onClick={() => setLevels([...levels, { col: g.c1, desc: false }])}>+ Add Level</button>
          <button onClick={() => setLevels(levels.slice(0, -1))} disabled={levels.length < 2}>
            Delete Level
          </button>
        </>
      }
    >
      <label className="dlg-check">
        <input type="checkbox" checked={hdr} onChange={(e) => setHdr(e.target.checked)} /> My data has headers
      </label>
      <p className="dlg-note">Range: {addrToA1(g.r1, g.c1)}:{addrToA1(g.r2, g.c2)}</p>
      {levels.map((lv, i) => (
        <div className="sort-level" key={i}>
          <span>{i === 0 ? 'Sort by' : 'Then by'}</span>
          <select value={lv.col} onChange={(e) => setLevels(levels.map((x, j) => (j === i ? { ...x, col: +e.target.value } : x)))}>
            {heads.map((h) => (
              <option key={h.col} value={h.col}>
                {h.name}
              </option>
            ))}
          </select>
          <select value={lv.desc ? 'd' : 'a'} onChange={(e) => setLevels(levels.map((x, j) => (j === i ? { ...x, desc: e.target.value === 'd' } : x)))}>
            <option value="a">A to Z / Smallest to Largest</option>
            <option value="d">Z to A / Largest to Smallest</option>
          </select>
        </div>
      ))}
    </Dialog>
  );
}

function PivotDialog({ s, close }: P) {
  const g0 = useMemo(() => s.dataRange(), [s]);
  const [src, setSrc] = useState(`${addrToA1(g0.r1, g0.c1)}:${addrToA1(g0.r2, g0.c2)}`);
  const g = parseRange(src) ?? g0;
  const heads = headersOf(s, g, true);
  const [rows, setRows] = useState<number[]>([]);
  const [cols, setCols] = useState<number | ''>('');
  const [vals, setVals] = useState<{ col: number; agg: 'sum' | 'count' | 'average' | 'min' | 'max' }[]>([]);
  const [name, setName] = useState('PivotTable');
  const ok = () => {
    if (!rows.length || !vals.length) {
      s.toast('Choose at least one Rows field and one Values field.', 'warn');
      return;
    }
    close();
    s.pivot({ source: { bi: s.bi, si: s.si, range: g }, rows, cols: cols === '' ? undefined : cols, values: vals, sheetName: name });
    s.emitCommand('insert.pivot.ok', 'mouse');
  };
  const numeric = (c: number) => typeof s.value(g.r1 + 1, c) === 'number';
  return (
    <Dialog title="Create PivotTable" onOk={ok} onClose={close} width={600}>
      <label className="dlg-label">Table/Range:</label>
      <input value={src} onChange={(e) => setSrc(e.target.value)} />
      <div className="pv-grid">
        <div>
          <div className="dlg-label">PivotTable Fields</div>
          <div className="pv-fields">
            {heads.map((h) => (
              <div key={h.col} className="pv-field">
                <span>{h.name}</span>
                <span className="pv-actions">
                  <button title="Add to Rows" onClick={() => setRows(rows.includes(h.col) ? rows : [...rows, h.col])}>Rows</button>
                  <button title="Add to Columns" onClick={() => setCols(h.col)}>Cols</button>
                  <button title="Add to Values" onClick={() => setVals([...vals, { col: h.col, agg: numeric(h.col) ? 'sum' : 'count' }])}>Σ</button>
                </span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="pv-area">
            <div className="dlg-label">≡ Rows</div>
            {rows.map((c) => (
              <span key={c} className="chip" onClick={() => setRows(rows.filter((x) => x !== c))}>
                {heads.find((h) => h.col === c)?.name} ✕
              </span>
            ))}
          </div>
          <div className="pv-area">
            <div className="dlg-label">⦀ Columns</div>
            {cols !== '' && (
              <span className="chip" onClick={() => setCols('')}>
                {heads.find((h) => h.col === cols)?.name} ✕
              </span>
            )}
          </div>
          <div className="pv-area">
            <div className="dlg-label">Σ Values</div>
            {vals.map((v, i) => (
              <span key={i} className="chip">
                <select value={v.agg} onChange={(e) => setVals(vals.map((x, j) => (j === i ? { ...x, agg: e.target.value as never } : x)))}>
                  {['sum', 'count', 'average', 'min', 'max'].map((a) => (
                    <option key={a} value={a}>
                      {a[0].toUpperCase() + a.slice(1)}
                    </option>
                  ))}
                </select>{' '}
                of {heads.find((h) => h.col === v.col)?.name} <b onClick={() => setVals(vals.filter((_, j) => j !== i))}>✕</b>
              </span>
            ))}
          </div>
          <label className="dlg-label">New worksheet name:</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      </div>
      <p className="dlg-note">A PivotTable groups rows by a field and aggregates another — the same answer SUMIFS gives, without writing formulas.</p>
    </Dialog>
  );
}

function RemoveDupDialog({ s, close }: P) {
  const g = useMemo(() => s.dataRange(), [s]);
  const [hdr, setHdr] = useState(true);
  const heads = headersOf(s, g, hdr);
  const [cols, setCols] = useState<number[]>(heads.map((h) => h.col));
  const ok = () => {
    close();
    s.removeDuplicates(cols, g, hdr);
    s.emitCommand('data.removeDup.ok', 'mouse');
  };
  return (
    <Dialog title="Remove Duplicates" onOk={ok} onClose={close}>
      <p className="dlg-note">Select one or more columns that contain duplicates. A row is a duplicate when ALL checked columns match.</p>
      <div className="dlg-row">
        <button onClick={() => setCols(heads.map((h) => h.col))}>Select All</button>
        <button onClick={() => setCols([])}>Unselect All</button>
        <label className="dlg-check">
          <input type="checkbox" checked={hdr} onChange={(e) => setHdr(e.target.checked)} /> My data has headers
        </label>
      </div>
      <div className="dlg-list">
        {heads.map((h) => (
          <label key={h.col} className="dlg-check">
            <input type="checkbox" checked={cols.includes(h.col)} onChange={(e) => setCols(e.target.checked ? [...cols, h.col] : cols.filter((x) => x !== h.col))} /> {h.name}
          </label>
        ))}
      </div>
    </Dialog>
  );
}

function TextToColsDialog({ s, close }: P) {
  const [delim, setDelim] = useState(',');
  const [other, setOther] = useState('');
  const ok = () => {
    close();
    s.textToColumns(delim === 'other' ? other : delim);
    s.emitCommand('data.textToCols.ok', 'mouse');
  };
  return (
    <Dialog title="Convert Text to Columns Wizard" onOk={ok} okLabel="Finish" onClose={close}>
      <p className="dlg-note">Splits the selected column at each delimiter, writing into the columns to the right (they will be overwritten).</p>
      {[
        [',', 'Comma'],
        ['\t', 'Tab'],
        [';', 'Semicolon'],
        [' ', 'Space'],
        ['|', 'Pipe |'],
        ['-', 'Hyphen -'],
        ['other', 'Other:'],
      ].map(([k, l]) => (
        <label key={k} className="dlg-radio">
          <input type="radio" checked={delim === k} onChange={() => setDelim(k)} /> {l}
        </label>
      ))}
      {delim === 'other' && <input value={other} onChange={(e) => setOther(e.target.value)} maxLength={3} />}
    </Dialog>
  );
}

function CFDialog({ s, close }: P) {
  const [type, setType] = useState<CFRule['type']>('gt');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [style, setStyle] = useState(0);
  const styles = [
    { name: 'Light Red Fill with Dark Red Text', fill: '#FFC7CE', color: '#9C0006' },
    { name: 'Yellow Fill with Dark Yellow Text', fill: '#FFEB9C', color: '#9C5700' },
    { name: 'Green Fill with Dark Green Text', fill: '#C6EFCE', color: '#006100' },
    { name: 'Light Red Fill', fill: '#FFC7CE' },
  ];
  const ok = () => {
    close();
    s.addCF({ type, a, b, fill: styles[style].fill, color: styles[style].color });
    s.emitCommand('cf.add', 'mouse');
  };
  const g = s.range;
  return (
    <Dialog
      title="Conditional Formatting — Highlight Cells Rules"
      onOk={ok}
      onClose={close}
      width={480}
      extraButtons={
        <button
          onClick={() => {
            s.clearCF();
            close();
          }}
        >
          Clear Rules from Sheet
        </button>
      }
    >
      <p className="dlg-note">Applies to: {addrToA1(g.r1, g.c1)}:{addrToA1(Math.min(g.r2, 99999), g.c2)}</p>
      <label className="dlg-label">Format cells that are:</label>
      <select value={type} onChange={(e) => setType(e.target.value as never)}>
        <option value="gt">Greater Than…</option>
        <option value="lt">Less Than…</option>
        <option value="between">Between…</option>
        <option value="eq">Equal To…</option>
        <option value="contains">Text that Contains…</option>
        <option value="duplicate">Duplicate Values</option>
        <option value="blank">Blanks</option>
      </select>
      {!['duplicate', 'blank'].includes(type) && <input value={a} onChange={(e) => setA(e.target.value)} placeholder="value" />}
      {type === 'between' && <input value={b} onChange={(e) => setB(e.target.value)} placeholder="and" />}
      <label className="dlg-label">with</label>
      <select value={style} onChange={(e) => setStyle(+e.target.value)}>
        {styles.map((x, i) => (
          <option key={i} value={i}>
            {x.name}
          </option>
        ))}
      </select>
      <div className="cf-preview" style={{ background: styles[style].fill, color: styles[style].color }}>
        AaBbCc 1,234
      </div>
    </Dialog>
  );
}

function RenameDialog({ s, close }: P) {
  const [n, setN] = useState(s.sheet.name);
  return (
    <Dialog
      title="Rename Sheet"
      onOk={() => {
        s.renameSheet(s.si, n);
        close();
      }}
      onClose={close}
      width={300}
    >
      <input value={n} onChange={(e) => setN(e.target.value)} maxLength={31} />
    </Dialog>
  );
}

function ColWidthDialog({ s, close }: P) {
  const [w, setW] = useState(String(Math.round((s.sheet.colWidths[s.sel.ac] ?? 64) / 7.5 * 100) / 100));
  return (
    <Dialog
      title="Column Width"
      onOk={() => {
        const g = s.range;
        for (let c = g.c1; c <= Math.min(g.c2, g.c1 + 200); c++) s.setColWidth(c, Number(w) * 7.5);
        close();
      }}
      onClose={close}
      width={260}
    >
      <label className="dlg-label">Column width (characters):</label>
      <input value={w} onChange={(e) => setW(e.target.value)} />
    </Dialog>
  );
}

function FilterMenu({ s, close, col }: P & { col: number }) {
  const sh = s.sheet;
  const g = parseRange(sh.filter!.range)!;
  const values = useMemo(() => {
    const set = new Set<string>();
    for (let r = g.r1 + 1; r <= g.r2; r++) set.add(displayText(s.calc, s.bi, s.si, sh, r, col));
    return [...set].sort((a, b) => {
      const na = Number(a.replace(/[$,%]/g, '')), nb = Number(b.replace(/[$,%]/g, ''));
      return !isNaN(na) && !isNaN(nb) && a !== '' && b !== '' ? na - nb : a.localeCompare(b);
    });
  }, [sh, col]);
  const cur = sh.filter!.allowed[col];
  const [checked, setChecked] = useState<Set<string>>(new Set(cur ?? values));
  const [q, setQ] = useState('');
  const shown = values.filter((v) => v.toLowerCase().includes(q.toLowerCase()));
  const ok = () => {
    close();
    const all = values.every((v) => checked.has(v));
    s.setFilter(col, all ? undefined : [...checked]);
    s.emitCommand('data.filter.apply', 'mouse');
  };
  return (
    <Dialog title={`Filter: ${String(s.value(g.r1, col) ?? colToLetters(col))}`} onOk={ok} onClose={close} width={320}>
      <div className="fm-sorts">
        <button onClick={() => { close(); s.select(g.r1 + 1, col); runCommand(s, 'data.sortAsc', 'mouse'); }}>A↓Z Sort Smallest to Largest</button>
        <button onClick={() => { close(); s.select(g.r1 + 1, col); runCommand(s, 'data.sortDesc', 'mouse'); }}>Z↓A Sort Largest to Smallest</button>
        <button onClick={() => { close(); s.setFilter(col, undefined); }}>✕ Clear Filter</button>
      </div>
      <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="dlg-list tall">
        <label className="dlg-check">
          <input
            type="checkbox"
            checked={shown.every((v) => checked.has(v))}
            onChange={(e) => {
              const n = new Set(checked);
              shown.forEach((v) => (e.target.checked ? n.add(v) : n.delete(v)));
              setChecked(n);
            }}
          />{' '}
          (Select All{q ? ' Search Results' : ''})
        </label>
        {shown.map((v) => (
          <label key={v} className="dlg-check">
            <input
              type="checkbox"
              checked={checked.has(v)}
              onChange={(e) => {
                const n = new Set(checked);
                if (e.target.checked) n.add(v);
                else n.delete(v);
                setChecked(n);
              }}
            />{' '}
            {v === '' ? '(Blanks)' : v}
          </label>
        ))}
      </div>
    </Dialog>
  );
}

export function ShortcutSheet({ close }: { close: () => void }) {
  const groups = [...new Set(COMMANDS.map((c) => c.group))];
  return (
    <Dialog title="Keyboard Shortcuts (Windows Excel)" onClose={close} width={760}>
      <div className="sc-sheet">
        {groups.map((g) => (
          <div key={g} className="sc-group">
            <h4>{g}</h4>
            {COMMANDS.filter((c) => c.group === g && c.keys?.length && !c.id.endsWith('Home') && !c.keys[0].includes('?')).map((c) => (
              <div key={c.id} className="sc-row">
                <span>{c.label}</span>
                <span className="sc-keys">{c.keys!.slice(0, 2).join('  ·  ')}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Dialog>
  );
}
