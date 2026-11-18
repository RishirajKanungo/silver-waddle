// CodeMirror 6 editor: Python/SQL highlighting, Ctrl/Cmd+Enter to run,
// and a highlighted "current line" driven by the step visualizer.

import { useEffect, useRef } from 'react';
import { EditorState, StateEffect, StateField, Compartment } from '@codemirror/state';
import { EditorView, Decoration, keymap, lineNumbers, highlightActiveLine, drawSelection, type DecorationSet } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { python } from '@codemirror/lang-python';
import { sql, SQLite } from '@codemirror/lang-sql';
import { tags as t } from '@lezer/highlight';

const setLine = StateEffect.define<{ line: number | null; kind: string }>();
const lineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setLine)) {
        const { line, kind } = e.value;
        if (line === null || line < 1 || line > tr.state.doc.lines) return Decoration.none;
        const l = tr.state.doc.line(line);
        return Decoration.set([Decoration.line({ class: 'cm-trace-' + kind }).range(l.from)]);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const hl = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--syn-kw)', fontWeight: '600' },
  { tag: [t.string, t.special(t.string)], color: 'var(--syn-str)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--syn-num)' },
  { tag: t.comment, color: 'var(--syn-com)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--syn-fn)' },
  { tag: [t.definition(t.variableName), t.className], color: 'var(--syn-def)' },
  { tag: [t.operator, t.punctuation], color: 'var(--syn-op)' },
  { tag: t.typeName, color: 'var(--syn-def)' },
  { tag: t.propertyName, color: 'var(--fg)' },
]);

interface Props {
  value: string;
  lang: 'python' | 'sql';
  onChange?: (v: string) => void;
  onRun?: () => void;
  readOnly?: boolean;
  line?: number | null;
  lineKind?: 'cur' | 'err';
  minLines?: number;
  label?: string;
}

export function Editor({ value, lang, onChange, onRun, readOnly, line = null, lineKind = 'cur', minLines = 3, label }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  onChangeRef.current = onChange;
  onRunRef.current = onRun;
  const roComp = useRef(new Compartment());

  useEffect(() => {
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ activateOnTyping: true }),
        highlightActiveLine(),
        syntaxHighlighting(hl),
        lang === 'python' ? python() : sql({ dialect: SQLite, upperCaseKeywords: true }),
        EditorState.tabSize.of(4),
        lineField,
        roComp.current.of([EditorState.readOnly.of(!!readOnly), EditorView.editable.of(!readOnly)]),
        keymap.of([
          { key: 'Mod-Enter', run: () => (onRunRef.current?.(), true) },
          { key: 'Shift-Enter', run: () => (onRunRef.current?.(), true) },
          ...closeBracketsKeymap,
          ...completionKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
        }),
        EditorView.contentAttributes.of({ 'aria-label': label ?? `${lang} editor` }),
        EditorView.theme({ '.cm-content': { minHeight: `${minLines * 1.5}em` } }),
      ],
    });
    const v = new EditorView({ state, parent: host.current! });
    view.current = v;
    return () => v.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // external value changes (reset / show solution)
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);
  useEffect(() => {
    view.current?.dispatch({ effects: roComp.current.reconfigure([EditorState.readOnly.of(!!readOnly), EditorView.editable.of(!readOnly)]) });
  }, [readOnly]);
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch({ effects: setLine.of({ line, kind: lineKind }) });
    if (line && line <= v.state.doc.lines) {
      const pos = v.state.doc.line(line).from;
      v.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'nearest' }) });
    }
  }, [line, lineKind]);

  return <div className={'editor lang-' + lang} ref={host} />;
}
