import { describe, it, expect } from 'vitest';
import { AppStore } from './store';
import { makeBook } from '../course/data';
import { runCommand } from './commands';

const mk = () => new AppStore([makeBook('B.xlsx', [{ name: 'S', rows: [[1, 2, ''], [3, 4, ''], ['', '', '']], header: false }])]);

describe('store', () => {
  it('AutoSum on a block fills row and column totals', () => {
    const s = mk();
    s.goTo('A1:C3');
    runCommand(s, 'edit.autosum');
    expect(s.value(2, 0)).toBe(4);
    expect(s.value(2, 1)).toBe(6);
    expect(s.value(0, 2)).toBe(3);
    expect(s.value(1, 2)).toBe(7);
    expect(s.value(2, 2)).toBe(10);
  });
  it('cut + paste keeps formulas unchanged', () => {
    const s = mk();
    s.setInput('E1', '=SUM(A1:B2)');
    s.goTo('E1');
    s.copy(true);
    s.goTo('F5');
    s.paste();
    expect(s.sheet.cells['4,5'].v).toBe('=SUM(A1:B2)');
    expect(s.sheet.cells['0,4']).toBeUndefined();
  });
  it('thick box only thickens the outer edge', () => {
    const s = mk();
    s.goTo('A1:B2');
    runCommand(s, 'border.thick');
    expect(s.sheet.cells['0,0'].s?.border?.thickSides).toBe('tl');
    s.goTo('A1:C3');
    runCommand(s, 'border.none');
    runCommand(s, 'border.thick');
    expect(s.sheet.cells['1,1']?.s?.border).toBeUndefined();
  });
});
