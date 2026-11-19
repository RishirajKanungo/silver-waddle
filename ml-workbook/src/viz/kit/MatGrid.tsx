// A matrix drawn as a grid of cells: highlight rows/columns/cells, optional heat-map fill,
// row/column labels. Used for matrix products, attention weights, confusion matrices.
import type { ReactNode } from 'react';
import { colorMap } from './Plane';

export function MatGrid({
  m,
  fmt = (v: number) => (Number.isInteger(v) ? String(v) : (Math.round(v * 100) / 100).toString()),
  rows = [],
  cols = [],
  cells = [],
  heat,
  heatRange,
  rowLabels,
  colLabels,
  caption,
  dim = [],
  cellSize,
  onCell,
  bracket = true,
}: {
  m: number[][];
  fmt?: (v: number, i: number, j: number) => string;
  rows?: number[];
  cols?: number[];
  cells?: [number, number][];
  heat?: 'seq' | 'div';
  heatRange?: [number, number];
  rowLabels?: ReactNode[];
  colLabels?: ReactNode[];
  caption?: ReactNode;
  /** cells drawn faded (e.g. masked attention entries) */
  dim?: [number, number][];
  cellSize?: number;
  onCell?: (i: number, j: number) => void;
  bracket?: boolean;
}) {
  const flat = m.flat().filter(Number.isFinite);
  const lo = heatRange?.[0] ?? Math.min(...flat), hi = heatRange?.[1] ?? Math.max(...flat);
  const has = (list: [number, number][], i: number, j: number) => list.some(([a, b]) => a === i && b === j);
  return (
    <figure className="matgrid">
      <div className="mg-wrap">
        {colLabels && (
          <div className="mg-collabels" style={{ gridTemplateColumns: `${rowLabels ? 'auto ' : ''}repeat(${m[0]?.length ?? 0}, ${cellSize ? cellSize + 'px' : 'minmax(2.4em, auto)'})` }}>
            {rowLabels && <span />}
            {colLabels.map((c, j) => (
              <span key={j} className={'mg-cl' + (cols.includes(j) ? ' hl' : '')}>
                {c}
              </span>
            ))}
          </div>
        )}
        <div className={'mg-body' + (bracket ? ' bracket' : '')} style={{ gridTemplateColumns: `${rowLabels ? 'auto ' : ''}repeat(${m[0]?.length ?? 0}, ${cellSize ? cellSize + 'px' : 'minmax(2.4em, auto)'})` }}>
          {m.map((row, i) => [
            rowLabels ? (
              <span key={'rl' + i} className={'mg-rl' + (rows.includes(i) ? ' hl' : '')}>
                {rowLabels[i]}
              </span>
            ) : null,
            ...row.map((v, j) => {
              const cls = ['mg-c'];
              if (rows.includes(i)) cls.push('hr');
              if (cols.includes(j)) cls.push('hc');
              if (has(cells, i, j)) cls.push('hx');
              if (has(dim, i, j)) cls.push('dim');
              if (onCell) cls.push('click');
              const bg = heat && Number.isFinite(v) ? colorMap((v - lo) / (hi - lo || 1), heat) : undefined;
              return (
                <span key={i + '-' + j} className={cls.join(' ')} style={bg ? { background: bg } : undefined} onClick={onCell ? () => onCell(i, j) : undefined} role={onCell ? 'button' : undefined} tabIndex={onCell ? 0 : undefined} onKeyDown={onCell ? (e) => (e.key === 'Enter' || e.key === ' ') && onCell(i, j) : undefined}>
                  {Number.isFinite(v) ? fmt(v, i, j) : v === -Infinity ? '−∞' : '·'}
                </span>
              );
            }),
          ])}
        </div>
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
