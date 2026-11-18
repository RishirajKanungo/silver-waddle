import type { ReactNode } from 'react';
import type { AppStore } from '../../app/store';
import { useStore } from '../../app/useStore';
import { Ribbon } from './Ribbon';
import { BookBar, FormulaBar, SheetTabs, StatusBar } from './Chrome';
import { Grid } from './Grid';
import { Dialogs } from './Dialogs';

export function ExcelWindow({ store, side, onMouseUse, titleExtra }: { store: AppStore; side?: ReactNode; onMouseUse?: () => void; titleExtra?: ReactNode }) {
  useStore(store);
  const s = store;
  return (
    <div className="xl-window">
      <div className="xl-titlebar">
        <span className="xl-logo">X</span>
        <span className="xl-qat" title="Save (Ctrl+S)">💾</span>
        <span className="xl-qat" title="Undo (Ctrl+Z)" onMouseDown={(e) => { e.preventDefault(); s.undo(); }}>↶</span>
        <span className="xl-qat" title="Redo (Ctrl+Y)" onMouseDown={(e) => { e.preventDefault(); s.redo(); }}>↷</span>
        <span className="xl-title">
          {s.book?.name ?? 'Book1.xlsx'}
          {s.readOnlyBooks.has(s.bi) && ' [Read-Only]'} — Excel
        </span>
        <span className="grow" />
        {titleExtra}
      </div>
      <Ribbon store={s} onMouseUse={onMouseUse} />
      <FormulaBar store={s} onMouseUse={onMouseUse} />
      <div className="xl-main">
        <div className="xl-sheet">
          <Grid store={s} onMouseUse={onMouseUse} />
          <SheetTabs store={s} onMouseUse={onMouseUse} />
        </div>
        {side}
      </div>
      <StatusBar store={s} />
      <BookBar store={s} onMouseUse={onMouseUse} />
      <Dialogs store={s} />
      <div className="toasts">
        {s.toasts.map((t) => (
          <div key={t.id} className={'toast ' + (t.kind ?? '')}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
