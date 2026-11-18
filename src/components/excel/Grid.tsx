// The virtualised worksheet grid. Only visible cells are rendered.
// Layers (bottom -> top): gridlines, fills/borders, text, selection, editor.

import { type ReactElement, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AppStore } from '../../app/store';
import { useStore } from '../../app/useStore';
import { Layout } from './layout';
import { GRID_COLS, GRID_ROWS, getCell, usedRange } from '../../app/sheetOps';
import { colToLetters, norm, parseRange, RangeAddr, inRange } from '../../engine/refs';
import { formatValue, negativeIsRed } from '../../engine/format';
import { CFRule, Scalar, Sheet, isErr } from '../../engine/types';
import { handleGridKey, handleGridKeyUp } from '../../app/keyboard';
import { measure } from '../../app/store';
import { tokenize } from '../../engine/parser';
import { compare } from '../../engine/values';
import { CellEditor } from './CellEditor';
import { runCommand } from '../../app/commands';

const HEADER_H = 20;
export const REF_COLORS = ['#4472C4', '#C0504D', '#9BBB59', '#8064A2', '#F79646', '#4BACC6', '#E46C0A'];

interface Props {
  store: AppStore;
  onMouseUse?: () => void;
}

export function Grid({ store, onMouseUse }: Props) {
  useStore(store);
  const s = store;
  const sh = s.sheet;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: 800, h: 500 });
  const drag = useRef<null | { kind: 'sel' | 'point' | 'fill' | 'colsel' | 'rowsel' | 'resize'; r0?: number; c0?: number; col?: number; startX?: number; startW?: number }>(null);
  const [fillTarget, setFillTarget] = useState<RangeAddr | null>(null);
  const [resizeGhost, setResizeGhost] = useState<number | null>(null);
  const zoom = 1;
  const L = useMemo(() => new Layout(sh, zoom), [sh, zoom]);
  const used = useMemo(() => usedRange(sh), [sh]);
  const rowHeaderW = Math.max(34, String(Math.max(1000, (used?.r2 ?? 0) + 200)).length * 8 + 10);

  // keep a stable focus target
  const focusGrid = useCallback(() => {
    if (!s.edit && document.activeElement !== wrapRef.current) wrapRef.current?.focus({ preventScroll: true });
  }, [s]);
  useEffect(() => {
    if (!s.edit && !s.dialog) {
      const ae = document.activeElement as HTMLElement | null;
      const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT') && !ae.classList.contains('cell-editor') && !ae.classList.contains('fx-input');
      if (!typing) focusGrid();
    }
  });

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fr = sh.freeze?.rows ?? 0;
  const fc = sh.freeze?.cols ?? 0;
  const frozenH = L.rowTop(fr);
  const frozenW = L.colLeft(fc);
  const sel = s.sel;
  const edit = s.edit;
  const point = edit?.point && edit.point.bi === s.bi && edit.point.si === s.si ? edit.point : null;

  // ---- extent of the scrollable area (grows like Excel's) ----
  const focusR = point ? point.fr : sel.fr;
  const focusC = point ? point.fc : sel.fc;
  const extentRows = Math.min(GRID_ROWS, Math.max((used?.r2 ?? 0) + 60, focusR + 40, Math.ceil(size.h / L.rowH) + 10, scroll.y / L.rowH + Math.ceil(size.h / L.rowH) * 2));
  const extentCols = Math.min(GRID_COLS, Math.max((used?.c2 ?? 0) + 15, focusC + 10, 30, scroll.x / 64 + Math.ceil(size.w / 64) * 2));
  const totalW = L.colLeft(extentCols) + rowHeaderW;
  const totalH = L.rowTop(extentRows) + HEADER_H;

  // ---- keep active cell in view ----
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = focusR, c = focusC;
    const viewW = el.clientWidth - rowHeaderW - frozenW;
    const viewH = el.clientHeight - HEADER_H - frozenH;
    if (r >= fr) {
      const top = L.rowTop(r) - frozenH, bot = top + L.rowH;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (bot > el.scrollTop + viewH) el.scrollTop = bot - viewH;
    }
    if (c >= fc) {
      const left = L.colLeft(c) - frozenW, right = left + L.colW(c);
      if (left < el.scrollLeft) el.scrollLeft = left;
      else if (right > el.scrollLeft + viewW) el.scrollLeft = Math.min(left, right - viewW);
    }
  }, [focusR, focusC, s.bi, s.si, L, fr, fc, frozenH, frozenW, rowHeaderW]);

  useEffect(() => {
    // new sheet -> scroll to top
    const el = wrapRef.current;
    if (el) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
  }, [s.bi, s.si]);

  const onScroll = () => {
    const el = wrapRef.current!;
    setScroll({ x: el.scrollLeft, y: el.scrollTop });
  };

  // ---- visible windows ----
  const viewW = size.w - rowHeaderW;
  const viewH = size.h - HEADER_H;
  const r0 = Math.max(fr, L.rowAt(frozenH + scroll.y));
  const r1 = Math.min(extentRows, L.rowAt(frozenH + scroll.y + viewH - frozenH) + 1);
  const c0 = Math.max(fc, L.colAt(frozenW + scroll.x));
  const c1 = Math.min(extentCols, L.colAt(frozenW + scroll.x + viewW - frozenW) + 1);

  // screen position of a row/col
  const X = (c: number) => rowHeaderW + (c < fc ? L.colLeft(c) : L.colLeft(c) - scroll.x);
  const Y = (r: number) => HEADER_H + (r < fr ? L.rowTop(r) : L.rowTop(r) - scroll.y);

  const rowsVisible: number[] = [];
  for (let r = 0; r < fr; r++) if (!L.isHidden(r)) rowsVisible.push(r);
  for (let r = r0; r <= r1; r++) if (!L.isHidden(r)) rowsVisible.push(r);
  const colsVisible: number[] = [];
  for (let c = 0; c < fc; c++) if (L.colW(c) > 0) colsVisible.push(c);
  for (let c = c0; c <= c1; c++) if (L.colW(c) > 0) colsVisible.push(c);

  // ---- pixel -> cell ----
  const cellAt = (clientX: number, clientY: number): [number, number] => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const x = clientX - rect.left - rowHeaderW;
    const y = clientY - rect.top - HEADER_H;
    const gx = x < frozenW ? x : x + scroll.x;
    const gy = y < frozenH ? y : y + scroll.y;
    return [Math.max(0, L.rowAt(Math.max(0, gy))), Math.max(0, L.colAt(Math.max(0, gx)))];
  };

  // ---- mouse ----
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.cell-editor') || target.closest('.ac-list') || target.closest('.filter-btn')) return;
    onMouseUse?.();
    const rect = wrapRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (x > wrapRef.current!.clientWidth || y > wrapRef.current!.clientHeight) return; // scrollbar
    e.preventDefault();
    s.keytip = null;
    // corner: select all
    if (x < rowHeaderW && y < HEADER_H) {
      s.selectRange({ r1: 0, c1: 0, r2: GRID_ROWS - 1, c2: GRID_COLS - 1 });
      return;
    }
    // column header (resize near the border)
    if (y < HEADER_H) {
      const [, c] = cellAt(e.clientX, rect.top + HEADER_H + 1);
      const right = X(c) + L.colW(c);
      const nearBorder = Math.abs(x - right) < 5 ? c : Math.abs(x - X(c)) < 5 && c > 0 ? c - 1 : -1;
      if (nearBorder >= 0) {
        if (e.detail === 2) {
          s.selectRange({ r1: 0, c1: nearBorder, r2: GRID_ROWS - 1, c2: nearBorder });
          s.autofitCols();
          return;
        }
        drag.current = { kind: 'resize', col: nearBorder, startX: e.clientX, startW: L.colW(nearBorder) };
        setResizeGhost(L.colW(nearBorder));
        return;
      }
      if (edit && s.canPoint()) {
        s.pointAt(0, c, false);
        s.pointSelectWhole('col');
        return;
      }
      if (edit) s.commitEdit('none');
      if (e.shiftKey) s.selectRange(norm({ r1: 0, c1: sel.ac, r2: GRID_ROWS - 1, c2: c }), { r: 0, c: sel.ac });
      else s.selectRange({ r1: 0, c1: c, r2: GRID_ROWS - 1, c2: c });
      drag.current = { kind: 'colsel', c0: e.shiftKey ? sel.ac : c };
      return;
    }
    if (x < rowHeaderW) {
      const [r] = cellAt(rect.left + rowHeaderW + 1, e.clientY);
      if (edit) s.commitEdit('none');
      if (e.shiftKey) s.selectRange(norm({ r1: sel.ar, c1: 0, r2: r, c2: GRID_COLS - 1 }), { r: sel.ar, c: 0 });
      else s.selectRange({ r1: r, c1: 0, r2: r, c2: GRID_COLS - 1 });
      drag.current = { kind: 'rowsel', r0: e.shiftKey ? sel.ar : r };
      return;
    }
    // fill handle?
    if (target.classList.contains('fill-handle')) {
      if (e.detail === 2) {
        s.autoFillDown();
        return;
      }
      drag.current = { kind: 'fill' };
      setFillTarget(s.range);
      return;
    }
    const [r, c] = cellAt(e.clientX, e.clientY);
    if (edit) {
      if (s.canPoint()) {
        s.pointAt(r, c, e.shiftKey);
        drag.current = { kind: 'point' };
        return;
      }
      s.commitEdit('none');
    }
    if (e.detail === 2) {
      s.select(r, c);
      s.startEdit(undefined, 'edit');
      return;
    }
    s.select(r, c, e.shiftKey);
    drag.current = { kind: 'sel' };
  };

  useEffect(() => {
    const move = (e: MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      if (d.kind === 'resize') {
        setResizeGhost(Math.max(0, d.startW! + (e.clientX - d.startX!)));
        return;
      }
      const [r, c] = cellAt(e.clientX, e.clientY);
      if (d.kind === 'sel') {
        const cur = s.sel;
        if (cur.fr !== r || cur.fc !== c) s.select(r, c, true);
      } else if (d.kind === 'point') {
        s.pointAt(r, c, true);
      } else if (d.kind === 'colsel') {
        s.selectRange(norm({ r1: 0, c1: d.c0!, r2: GRID_ROWS - 1, c2: c }), { r: 0, c: d.c0! });
      } else if (d.kind === 'rowsel') {
        s.selectRange(norm({ r1: d.r0!, c1: 0, r2: r, c2: GRID_COLS - 1 }), { r: d.r0!, c: 0 });
      } else if (d.kind === 'fill') {
        const g = s.range;
        const dDown = r - g.r2, dUp = g.r1 - r, dRight = c - g.c2, dLeft = g.c1 - c;
        const m = Math.max(dDown, dUp, dRight, dLeft);
        let t: RangeAddr = g;
        if (m > 0) {
          if (m === dDown) t = { ...g, r2: r };
          else if (m === dUp) t = { ...g, r1: r };
          else if (m === dRight) t = { ...g, c2: c };
          else t = { ...g, c1: c };
        }
        setFillTarget(t);
      }
    };
    const up = () => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (d.kind === 'resize') {
        setResizeGhost((w) => {
          if (w !== null) s.setColWidth(d.col!, w / zoom);
          return null;
        });
      }
      if (d.kind === 'fill') {
        setFillTarget((t) => {
          const g = s.range;
          if (t && (t.r1 !== g.r1 || t.r2 !== g.r2 || t.c1 !== g.c1 || t.c2 !== g.c2)) {
            s.dragFill(g, t);
            s.emitCommand('fill.handleDrag', 'mouse');
          }
          return null;
        });
      }
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  });

  // ---- keyboard ----
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (s.edit || s.dialog) return;
    if (handleGridKey(s, e)) {
      /* handled */
    }
  };
  const onKeyUp = (e: React.KeyboardEvent) => {
    if (s.edit || s.dialog) return;
    handleGridKeyUp(s, e);
  };

  // ---- reference highlights while editing a formula ----
  const refBoxes = useMemo(() => {
    if (!edit || !edit.text.startsWith('=')) return [];
    const toks = tokenize(edit.text.slice(1)).filter((t) => t.type === 'ref');
    const out: { g: RangeAddr; color: string }[] = [];
    toks.forEach((t, i) => {
      const txt = t.text.replace(/#$/, '');
      const bang = txt.lastIndexOf('!');
      let book = s.books[edit.bi].name, sheet = s.books[edit.bi].sheets[edit.si].name;
      if (bang >= 0) {
        let pre = txt.slice(0, bang);
        if (pre.startsWith("'")) pre = pre.slice(1, -1);
        const m = /^\[([^\]]+)\](.*)$/.exec(pre);
        if (m) {
          book = m[1];
          sheet = m[2];
        } else sheet = pre;
      }
      if (book.toLowerCase() !== s.book.name.toLowerCase() || sheet.toLowerCase() !== sh.name.toLowerCase()) return;
      const g = parseRange(bang >= 0 ? txt.slice(bang + 1) : txt);
      if (g) out.push({ g: { ...g, r2: Math.min(g.r2, extentRows), c2: Math.min(g.c2, extentCols) }, color: REF_COLORS[i % REF_COLORS.length] });
    });
    return out;
  }, [edit?.text, edit?.bi, edit?.si, s.bi, s.si, sh.name, extentRows, extentCols]);

  // ---- rectangles ----
  const rectOf = (g: RangeAddr) => {
    const x1 = X(g.c1), y1 = Y(g.r1);
    const x2 = X(g.c2) + L.colW(g.c2), y2 = Y(g.r2) + L.rowHeight(g.r2);
    return { left: x1, top: y1, width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) };
  };
  const clipRect = (g: RangeAddr) => {
    const r = rectOf(g);
    // clip to viewport
    const minX = rowHeaderW - 2, minY = HEADER_H - 2;
    const left = Math.max(r.left, minX), top = Math.max(r.top, minY);
    const right = Math.min(r.left + r.width, size.w + 4), bottom = Math.min(r.top + r.height, size.h + 4);
    return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  };

  const range = s.range;
  const activeRect = rectOf({ r1: sel.ar, c1: sel.ac, r2: sel.ar, c2: sel.ac });
  const multiCell = range.r1 !== range.r2 || range.c1 !== range.c2;
  const showFill = !edit && !s.multi;
  const spill = s.calc.spillAreas.get(`${s.bi}|${s.si}|${sel.ar},${sel.ac}`) ?? s.calc.spillAnchorOf(s.bi, s.si, sel.ar, sel.ac)?.area;
  const filterG = sh.filter ? parseRange(sh.filter.range) : null;
  const gridlines = sh.showGridlines !== false;
  const editingHere = edit && edit.bi === s.bi && edit.si === s.si;

  return (
    <div
      ref={wrapRef}
      className="grid-wrap"
      tabIndex={0}
      onScroll={onScroll}
      onMouseDown={onMouseDown}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      data-testid="grid"
    >
      <div style={{ width: totalW, height: totalH, position: 'relative' }}>
        <div className="grid-viewport" style={{ width: size.w, height: size.h }}>
          <CellsLayer
            store={s}
            sheet={sh}
            L={L}
            rows={rowsVisible}
            cols={colsVisible}
            X={X}
            Y={Y}
            gridlines={gridlines}
            version={s.version}
            scrollKey={`${scroll.x},${scroll.y},${size.w},${size.h}`}
            showFormulas={s.showFormulas}
            bi={s.bi}
            si={s.si}
            fr={fr}
            fc={fc}
            frozenTop={HEADER_H + frozenH}
            frozenLeft={rowHeaderW + frozenW}
            vw={size.w}
            vh={size.h}
            rowHeaderW={rowHeaderW}
          />
          {/* frozen pane divider lines */}
          {fr > 0 && <div className="freeze-line-h" style={{ top: HEADER_H + frozenH - 1, left: 0, width: size.w }} />}
          {fc > 0 && <div className="freeze-line-v" style={{ left: rowHeaderW + frozenW - 1, top: 0, height: size.h }} />}

          {/* selection */}
          {!point && (
            <>
              {multiCell && <div className="sel-range" style={clipRect(range)} />}
              {!multiCell && !s.multi && <div className="sel-active" style={clipRect(range)} />}
              {multiCell && <div className="sel-active-cell" style={activeRect} />}
              {s.multi &&
                s.multi.slice(0, 400).map(([r, c]) => <div key={`m${r},${c}`} className="sel-multi" style={rectOf({ r1: r, c1: c, r2: r, c2: c })} />)}
              {showFill && (
                <div
                  className="fill-handle"
                  style={{ left: X(range.c2) + L.colW(range.c2) - 4, top: Y(range.r2) + L.rowHeight(range.r2) - 4 }}
                  title="Drag to fill — double-click to fill down"
                />
              )}
            </>
          )}
          {spill && !edit && <div className="spill-box" style={clipRect(spill)} />}
          {fillTarget && <div className="fill-target" style={clipRect(fillTarget)} />}
          {s.clip && s.clip.bi === s.bi && s.clip.si === s.si && <div className="marching" style={clipRect(s.clip.range)} />}
          {refBoxes.map((b, i) => (
            <div key={i} className="ref-box" style={{ ...clipRect(b.g), borderColor: b.color, background: b.color + '14' }} />
          ))}
          {point && <div className="point-box" style={clipRect(norm({ r1: point.ar, c1: point.ac, r2: point.fr, c2: point.fc }))} />}

          {/* headers */}
          <ColHeaders L={L} cols={colsVisible} X={X} range={point ? norm({ r1: point.ar, c1: point.ac, r2: point.fr, c2: point.fc }) : range} rowHeaderW={rowHeaderW} width={size.w} fcN={fc} />
          <RowHeaders L={L} rows={rowsVisible} Y={Y} range={point ? norm({ r1: point.ar, c1: point.ac, r2: point.fr, c2: point.fc }) : range} rowHeaderW={rowHeaderW} height={size.h} frN={fr} />
          <div className="corner" style={{ width: rowHeaderW, height: HEADER_H }}>
            <div className="corner-tri" />
          </div>
          {resizeGhost !== null && drag.current?.col !== undefined && (
            <div className="resize-ghost" style={{ left: X(drag.current.col) + resizeGhost, height: size.h }}>
              <span className="resize-tip">Width: {(resizeGhost / 7).toFixed(2)} ({Math.round(resizeGhost)} pixels)</span>
            </div>
          )}

          {/* filter buttons */}
          {filterG &&
            colsVisible
              .filter((c) => c >= filterG.c1 && c <= filterG.c2)
              .map((c) => {
                const active = !!sh.filter!.allowed[c];
                return (
                  <button
                    key={'f' + c}
                    className={'filter-btn' + (active ? ' active' : '')}
                    style={{ left: X(c) + L.colW(c) - 17, top: Y(filterG.r1) + 2 }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      onMouseUse?.();
                      s.select(filterG.r1, c);
                      runCommand(s, 'data.filterMenu', 'mouse');
                    }}
                    title="Filter (Alt+↓)"
                  >
                    {active ? '⧩' : '▾'}
                  </button>
                );
              })}

          {editingHere && edit && (
            <CellEditor store={s} left={X(edit.c)} top={Y(edit.r)} width={L.colW(edit.c)} height={L.rowH} maxRight={size.w} />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- headers ----------
function ColHeaders({ L, cols, X, range, rowHeaderW, width, fcN }: { fcN: number; L: Layout; cols: number[]; X: (c: number) => number; range: RangeAddr; rowHeaderW: number; width: number }) {
  const wholeCol = range.r1 === 0 && range.r2 === GRID_ROWS - 1;
  return (
    <div className="col-headers" style={{ height: HEADER_H, width }}>
      {[...cols].sort((a, b) => (a < fcN ? 1 : 0) - (b < fcN ? 1 : 0)).map((c) => {
        const on = c >= range.c1 && c <= range.c2;
        return (
          <div key={c} className={'col-h' + (on ? (wholeCol ? ' full' : ' on') : '')} style={{ left: X(c), width: L.colW(c) }}>
            {colToLetters(c)}
          </div>
        );
      })}
      <div style={{ position: 'absolute', left: 0, width: rowHeaderW, top: 0, height: HEADER_H }} />
    </div>
  );
}

function RowHeaders({ L, rows, Y, range, rowHeaderW, height, frN }: { frN: number; L: Layout; rows: number[]; Y: (r: number) => number; range: RangeAddr; rowHeaderW: number; height: number }) {
  const wholeRow = range.c1 === 0 && range.c2 === GRID_COLS - 1;
  const hidden = (r: number) => L.isHidden(r + 1);
  return (
    <div className="row-headers" style={{ width: rowHeaderW, height }}>
      {[...rows].sort((a, b) => (a < frN ? 1 : 0) - (b < frN ? 1 : 0)).map((r) => {
        const on = r >= range.r1 && r <= range.r2;
        return (
          <div
            key={r}
            className={'row-h' + (on ? (wholeRow ? ' full' : ' on') : '') + (hidden(r) ? ' hidden-below' : '')}
            style={{ top: Y(r), height: L.rowH, width: rowHeaderW, color: L.isHidden(r + 1) ? '#2F75B5' : undefined }}
          >
            {r + 1}
          </div>
        );
      })}
    </div>
  );
}

// ---------- cells ----------
interface CellsProps {
  store: AppStore;
  sheet: Sheet;
  L: Layout;
  rows: number[];
  cols: number[];
  X: (c: number) => number;
  Y: (r: number) => number;
  gridlines: boolean;
  version: number;
  scrollKey: string;
  showFormulas: boolean;
  bi: number;
  si: number;
  fr: number;
  fc: number;
  frozenTop: number;
  frozenLeft: number;
  vw: number;
  vh: number;
  rowHeaderW: number;
}

const CellsLayer = memo(
  function CellsLayer({ store: s, sheet: sh, L, rows, cols, X, Y, gridlines, showFormulas, bi, si, fr, fc, frozenTop, frozenLeft, vw, vh, rowHeaderW }: CellsProps) {
    const calc = s.calc;
    const cfRules = useMemo(() => prepareCF(sh.cf ?? [], (r, c) => calc.value(bi, si, r, c)), [sh.cf, calc, bi, si]);
    // 4 panes (frozen corner / frozen top / frozen left / main), each clipped to its area
    const panes = [0, 1, 2, 3].map(() => ({ lines: [] as ReactElement[], fills: [] as ReactElement[], texts: [] as ReactElement[] }));
    const paneOf = (r: number, c: number) => (r < fr ? (c < fc ? 0 : 1) : c < fc ? 2 : 3);
    if (gridlines) {
      for (const c of cols) {
        const el = (k: string) => <div key={k + c} className="gl-v" style={{ left: X(c) + L.colW(c) - 1 }} />;
        if (c < fc) { panes[0].lines.push(el('v0')); panes[2].lines.push(el('v2')); }
        else { panes[1].lines.push(el('v1')); panes[3].lines.push(el('v3')); }
      }
      for (const r of rows) {
        const el = (k: string) => <div key={k + r} className="gl-h" style={{ top: Y(r) + L.rowH - 1 }} />;
        if (r < fr) { panes[0].lines.push(el('h0')); panes[1].lines.push(el('h1')); }
        else { panes[2].lines.push(el('h2')); panes[3].lines.push(el('h3')); }
      }
    }
    const lastCol = cols[cols.length - 1] ?? 0;
    for (const r of rows) {
      const y = Y(r);
      for (let ci = 0; ci < cols.length; ci++) {
        const c = cols[ci];
        const cell = getCell(sh, r, c);
        let v: Scalar = cell && cell.v !== '' ? calc.value(bi, si, r, c) : calc.value(bi, si, r, c);
        if (!cell && v === null) continue;
        const st = cell?.s ?? {};
        const cf = cfRules.length ? matchCF(cfRules, r, c, v) : null;
        const x = X(c);
        const w = L.colW(c);
        const fill = cf?.fill ?? st.fill;
        const P = panes[paneOf(r, c)];
        if (fill || st.border) {
          const b = st.border;
          const tw2 = (side: string) => (b?.thick || b?.thickSides?.includes(side) ? 2 : 1);
          P.fills.push(
            <div
              key={`f${r},${c}`}
              className="cell-fill"
              style={{
                left: x - 1,
                top: y - 1,
                width: w + 1,
                height: L.rowH + 1,
                background: fill,
                borderTop: b?.t ? `${tw2('t')}px solid #000` : undefined,
                borderBottom: b?.b ? `${tw2('b')}px solid #000` : undefined,
                borderLeft: b?.l ? `${tw2('l')}px solid #000` : undefined,
                borderRight: b?.r ? `${tw2('r')}px solid #000` : undefined,
              }}
            />,
          );
        }
        if (v === null && !(showFormulas && cell?.v.startsWith('='))) continue;
        let text: string;
        let align = st.align;
        const isFormula = !!cell?.v.startsWith('=');
        if (showFormulas && cell) {
          text = cell.v;
          align = align ?? 'left';
        } else {
          if (typeof v === 'string' && v === '') continue;
          text = formatValue(v, st.fmt);
          if (!align) align = typeof v === 'number' ? 'right' : typeof v === 'boolean' || isErr(v) ? 'center' : 'left';
        }
        // number too wide -> ####
        const tw = measure(text, !!st.b);
        if (!showFormulas && typeof v === 'number' && tw > w - 4) text = '#'.repeat(Math.max(1, Math.floor((w - 4) / 7)));
        // left-aligned text overflows into empty neighbours
        let spanW = w;
        if (align === 'left' && typeof v === 'string' && !st.wrap && tw > w - 4) {
          for (let cj = c + 1; cj <= lastCol + 3; cj++) {
            const n = getCell(sh, r, cj);
            if ((n && n.v !== '') || calc.value(bi, si, r, cj) !== null) break;
            spanW += L.colW(cj);
            if (spanW > tw + 6) break;
          }
        }
        const color = cf?.color ?? (negativeIsRed(st.fmt, v) ? '#C00000' : st.color ?? (isErr(v) && !isFormula ? undefined : undefined));
        P.texts.push(
          <div
            key={`t${r},${c}`}
            className={'cell-text' + (st.wrap ? ' wrap' : '')}
            style={{
              left: align === 'right' ? x : x,
              top: y,
              width: align === 'left' ? spanW : w,
              height: L.rowH,
              justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
              fontWeight: st.b ? 700 : undefined,
              fontStyle: st.i ? 'italic' : undefined,
              textDecoration: st.u ? 'underline' : undefined,
              color,
              ...(spanW > w ? { background: fill ?? '#fff', height: L.rowH - 1, width: spanW - 1 } : {}),
            }}
          >
            {text}
          </div>,
        );
      }
    }
    const clips = [
      `inset(${HEADER_H}px ${vw - frozenLeft}px ${vh - frozenTop}px ${rowHeaderW}px)`,
      `inset(${HEADER_H}px 0 ${vh - frozenTop}px ${frozenLeft}px)`,
      `inset(${frozenTop}px ${vw - frozenLeft}px 0 ${rowHeaderW}px)`,
      `inset(${frozenTop}px 0 0 ${frozenLeft}px)`,
    ];
    return (
      <>
        {panes.map((p, i) =>
          (i === 3 || (i === 1 && fr > 0) || (i === 2 && fc > 0) || (i === 0 && fr > 0 && fc > 0)) ? (
            <div key={i} className="cells-layer" style={{ clipPath: clips[i] }}>
              {p.lines}
              {p.fills}
              {p.texts}
            </div>
          ) : null,
        )}
      </>
    );
  },
  (a, b) => a.version === b.version && a.scrollKey === b.scrollKey && a.sheet === b.sheet && a.showFormulas === b.showFormulas && a.L === b.L && a.rowHeaderW === b.rowHeaderW,
);

// ---------- conditional formatting ----------
interface PreparedCF {
  rule: CFRule;
  g: RangeAddr;
  dups?: Set<string>;
}

function prepareCF(rules: CFRule[], value: (r: number, c: number) => Scalar): PreparedCF[] {
  return rules
    .map((rule) => {
      const g = parseRange(rule.range);
      if (!g) return null;
      const p: PreparedCF = { rule, g };
      if (rule.type === 'duplicate') {
        const counts = new Map<string, number>();
        for (let r = g.r1; r <= Math.min(g.r2, g.r1 + 5000); r++)
          for (let c = g.c1; c <= g.c2; c++) {
            const v = value(r, c);
            if (v === null) continue;
            const k = typeof v === 'string' ? v.toLowerCase() : String(v);
            counts.set(k, (counts.get(k) ?? 0) + 1);
          }
        p.dups = new Set([...counts].filter(([, n]) => n > 1).map(([k]) => k));
      }
      return p;
    })
    .filter(Boolean) as PreparedCF[];
}

export function cfMatches(rule: CFRule, v: Scalar, dups?: Set<string>): boolean {
  const num = (x?: string) => (x === undefined || x === '' ? NaN : Number(x));
  switch (rule.type) {
    case 'gt': return typeof v === 'number' && v > num(rule.a);
    case 'lt': return typeof v === 'number' && v < num(rule.a);
    case 'between': return typeof v === 'number' && v >= num(rule.a) && v <= num(rule.b);
    case 'eq': return v !== null && (isNaN(num(rule.a)) ? compare(v, rule.a ?? '') === 0 && typeof v === 'string' : v === num(rule.a));
    case 'contains': return typeof v === 'string' && v.toLowerCase().includes((rule.a ?? '').toLowerCase());
    case 'blank': return v === null || v === '';
    case 'duplicate': return v !== null && !!dups?.has(typeof v === 'string' ? v.toLowerCase() : String(v));
  }
  return false;
}

function matchCF(rules: PreparedCF[], r: number, c: number, v: Scalar): { fill: string; color?: string } | null {
  for (const p of rules) {
    if (!inRange(p.g, r, c)) continue;
    if (cfMatches(p.rule, v, p.dups)) return { fill: p.rule.fill, color: p.rule.color };
  }
  return null;
}
