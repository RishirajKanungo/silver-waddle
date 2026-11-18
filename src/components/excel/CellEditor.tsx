// In-cell editor + the shared formula-text input logic (also used by the formula bar).

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { AppStore } from '../../app/store';
import { fnContext, fnSuggestions, measure, partialFn } from '../../app/store';
import { handleEditorKey } from '../../app/keyboard';
import { FN_INFO } from '../../engine/functions';
import { tokenize } from '../../engine/parser';
import { REF_COLORS } from './Grid';

/** Keeps a textarea in sync with store.edit (text + caret). */
export function useEditorBinding(store: AppStore, ref: React.RefObject<HTMLTextAreaElement | null>, active: boolean) {
  const e = store.edit;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !e) return;
    if (el.value !== e.text) el.value = e.text;
    if (active && document.activeElement === el && (el.selectionStart !== e.caret || el.selectionEnd !== e.caret)) {
      el.setSelectionRange(e.caret, e.caret);
    }
  });
  return {
    onChange: (ev: React.ChangeEvent<HTMLTextAreaElement>) => store.setEditText(ev.target.value, ev.target.selectionStart),
    onKeyDown: (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const el = ev.currentTarget;
      store.setEditCaret(el.selectionStart);
      if (handleEditorKey(store, ev, el.selectionStart)) ev.stopPropagation();
    },
    onSelect: (ev: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const el = ev.currentTarget;
      if (store.edit && el.selectionStart !== store.edit.caret && el.selectionStart === el.selectionEnd) store.setEditCaret(el.selectionStart);
    },
  };
}

export function CellEditor({ store, left, top, width, height, maxRight }: { store: AppStore; left: number; top: number; width: number; height: number; maxRight: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const e = store.edit!;
  const bind = useEditorBinding(store, ref, true);
  const focusedBar = typeof document !== 'undefined' && document.activeElement?.classList.contains('fx-input');

  useEffect(() => {
    if (!focusedBar) {
      ref.current?.focus({ preventScroll: true });
      const n = e.text.length;
      ref.current?.setSelectionRange(e.caret ?? n, e.caret ?? n);
    }
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lines = e.text.split('\n');
  const textW = Math.max(...lines.map((l) => measure(l))) + 16;
  const w = Math.max(width + 1, Math.min(textW, maxRight - left - 4));
  const h = Math.max(height + 1, lines.length * 17 + 4);

  return (
    <>
      <div className="cell-editor-wrap" style={{ left: left - 1, top: top - 1, width: w, height: h }} onMouseDown={(ev) => ev.stopPropagation()}>
        <div className="editor-hl" aria-hidden>
          <ColoredFormula text={e.text} />
          {'\u200b'}
        </div>
        <textarea ref={ref} className="cell-editor" defaultValue={e.text} spellCheck={false} {...bind} data-testid="cell-editor" />
      </div>
      <FormulaAssist store={store} left={left} top={top + h + 2} />
    </>
  );
}

/** Autocomplete list + function argument tooltip (like Excel's ScreenTips). */
export function FormulaAssist({ store, left, top }: { store: AppStore; left: number; top: number }) {
  const e = store.edit;
  if (!e || !e.text.startsWith('=')) return null;
  const ac = partialFn(e.text, e.caret);
  const sugg = ac ? fnSuggestions(ac.prefix) : [];
  if (sugg.length) {
    const idx = Math.min(e.acIndex, sugg.length - 1);
    const info = FN_INFO[sugg[idx]];
    return (
      <div className="ac-list" style={{ left, top }} onMouseDown={(ev) => ev.preventDefault()}>
        {sugg.map((name, i) => (
          <div
            key={name}
            className={'ac-item' + (i === idx ? ' on' : '')}
            onMouseDown={(ev) => {
              ev.preventDefault();
              const text = e.text.slice(0, ac!.start) + name + '(' + e.text.slice(e.caret);
              store.setEditText(text, ac!.start + name.length + 1);
            }}
          >
            <span className="ac-fx">ƒx</span> {name}
          </div>
        ))}
        {info?.desc && <div className="ac-desc">{info.desc}</div>}
        <div className="ac-hint">↑↓ to choose · Tab to insert</div>
      </div>
    );
  }
  const ctx = fnContext(e.text, e.caret);
  if (!ctx) return null;
  const info = FN_INFO[ctx.name];
  if (!info) return null;
  const m = /^([^(]+)\((.*)\)$/.exec(info.syntax);
  if (!m) return null;
  const args = m[2].split(/,\s*/);
  const repeating = args[args.length - 1] === '...';
  let cur = ctx.arg;
  if (repeating && cur >= args.length - 1) cur = args.length - 2;
  return (
    <div className="fn-tip" style={{ left, top }}>
      <b>{m[1]}</b>(
      {args.map((a, i) => (
        <span key={i}>
          {i > 0 && ', '}
          <span className={i === cur ? 'cur' : ''}>{a}</span>
        </span>
      ))}
      )
    </div>
  );
}

/** Formula text with references coloured like Excel (for the formula bar overlay). */
export function ColoredFormula({ text }: { text: string }) {
  if (!text.startsWith('=')) return <>{text}</>;
  const body = text.slice(1);
  const toks = tokenize(body);
  let refIdx = 0;
  return (
    <>
      =
      {toks.map((t, i) => {
        const s = body.slice(t.start, t.end);
        if (t.type === 'ref') {
          const color = REF_COLORS[refIdx++ % REF_COLORS.length];
          return (
            <span key={i} style={{ color }}>
              {s}
            </span>
          );
        }
        return <span key={i}>{s}</span>;
      })}
    </>
  );
}
