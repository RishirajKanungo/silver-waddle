// Geometry for the virtualised grid: where is column c / row r, and which
// column/row sits at pixel x / y. Hidden rows have height 0, hidden columns width 0.

import type { Sheet } from '../../engine/types';
import { DEFAULT_COL_W, ROW_H } from '../../app/sheetOps';

export class Layout {
  private customCols: [number, number][]; // sorted [col, width]
  private hidden: number[]; // sorted hidden rows
  constructor(public sheet: Sheet, public zoom = 1) {
    this.customCols = Object.entries(sheet.colWidths)
      .map(([k, w]) => [Number(k), w] as [number, number])
      .sort((a, b) => a[0] - b[0]);
    this.hidden = Object.keys(sheet.hiddenRows ?? {})
      .filter((k) => sheet.hiddenRows![Number(k)])
      .map(Number)
      .sort((a, b) => a - b);
  }
  get rowH() {
    return Math.round(ROW_H * this.zoom);
  }
  colW(c: number): number {
    const w = this.sheet.colWidths[c];
    return Math.round((w === undefined ? DEFAULT_COL_W : w) * this.zoom);
  }
  colLeft(c: number): number {
    let x = c * DEFAULT_COL_W;
    for (const [k, w] of this.customCols) {
      if (k >= c) break;
      x += w - DEFAULT_COL_W;
    }
    return Math.round(x * this.zoom);
  }
  colAt(x: number): number {
    // binary search
    let lo = 0, hi = 20000;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.colLeft(mid) <= x) lo = mid;
      else hi = mid - 1;
    }
    // skip zero-width columns
    while (this.colW(lo) === 0 && lo < 20000) lo++;
    return lo;
  }
  private hiddenBefore(r: number): number {
    let lo = 0, hi = this.hidden.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.hidden[mid] < r) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  isHidden(r: number) {
    return !!this.sheet.hiddenRows?.[r];
  }
  rowHeight(r: number) {
    return this.isHidden(r) ? 0 : this.rowH;
  }
  rowTop(r: number): number {
    return (r - this.hiddenBefore(r)) * this.rowH;
  }
  rowAt(y: number): number {
    let lo = 0, hi = 200000;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.rowTop(mid) <= y) lo = mid;
      else hi = mid - 1;
    }
    while (this.isHidden(lo)) lo++;
    return lo;
  }
}
