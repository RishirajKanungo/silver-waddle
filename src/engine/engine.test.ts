import { describe, it, expect } from 'vitest';
import { Calc } from './calc';
import { Workbook, Sheet, cellKey } from './types';
import { parseA1 } from './refs';
import { shiftFormula, toggleAbsoluteAt, adjustForInsert } from './parser';
import { formatValue } from './format';

function sheet(name: string, grid: Record<string, string | number>): Sheet {
  const cells: Sheet['cells'] = {};
  for (const [a1, v] of Object.entries(grid)) {
    const p = parseA1(a1)!;
    cells[cellKey(p.row, p.col)] = { v: String(v) };
  }
  return { name, cells, colWidths: {} };
}
function wb(name: string, ...sheets: Sheet[]): Workbook {
  return { id: name, name, sheets };
}
function val(calc: Calc, a1: string, bi = 0, si = 0) {
  const p = parseA1(a1)!;
  return calc.value(bi, si, p.row, p.col);
}

describe('engine', () => {
  it('arithmetic & precedence', () => {
    const c = new Calc([wb('B.xlsx', sheet('Sheet1', { A1: 2, A2: 3, B1: '=A1+A2*2', B2: '=-A1^2', B3: '=(A1+A2)/0', B4: '="x"&A1&TRUE', B5: '=10%', B6: '=A1>A2' }))]);
    expect(val(c, 'B1')).toBe(8);
    expect(val(c, 'B2')).toBe(4);
    expect(String(val(c, 'B3'))).toBe('#DIV/0!');
    expect(val(c, 'B4')).toBe('x2TRUE');
    expect(val(c, 'B5')).toBe(0.1);
    expect(val(c, 'B6')).toBe(false);
  });
  it('SUM ignores text in ranges', () => {
    const c = new Calc([wb('B', sheet('S', { A1: 1, A2: 'x', A3: "'5", A4: 4, B1: '=SUM(A1:A4)', B2: '=SUM(A:A)', B3: '=COUNT(A1:A4)', B4: '=COUNTA(A1:A4)', B5: '=AVERAGE(A1:A4)' }))]);
    expect(val(c, 'B1')).toBe(5);
    expect(val(c, 'B2')).toBe(5);
    expect(val(c, 'B3')).toBe(2);
    expect(val(c, 'B4')).toBe(4);
    expect(val(c, 'B5')).toBe(2.5);
  });
  it('VLOOKUP exact / approx / cross workbook', () => {
    const master = wb('Customer_Master.xlsx', sheet('Accounts', { A1: 'ID', B1: 'Name', C1: 'Region', A2: 'C001', B2: 'Acme', C2: 'East', A3: 'C002', B3: 'Beta', C3: 'West' }));
    const tape = wb(
      'Loan_Tape.xlsx',
      sheet('Tape', {
        A2: 'C002', B2: "=VLOOKUP(A2,'[Customer_Master.xlsx]Accounts'!$A:$C,3,FALSE)",
        A3: 'C009', B3: '=IFERROR(VLOOKUP(A3,[Customer_Master.xlsx]Accounts!$A$2:$C$3,2,FALSE),"Missing")',
        D1: 0, E1: 'Low', D2: 50, E2: 'Mid', D3: 80, E3: 'High',
        F1: 65, G1: '=VLOOKUP(F1,D1:E3,2,TRUE)', G2: '=VLOOKUP(F1,D1:E3,2)', G3: '=VLOOKUP(-1,D1:E3,2)',
        H1: '=XLOOKUP("Beta",[Customer_Master.xlsx]Accounts!B:B,[Customer_Master.xlsx]Accounts!A:A)',
        H2: '=INDEX([Customer_Master.xlsx]Accounts!C:C,MATCH("C001",[Customer_Master.xlsx]Accounts!A:A,0))',
      }),
    );
    const c = new Calc([tape, master]);
    expect(val(c, 'B2')).toBe('West');
    expect(val(c, 'B3')).toBe('Missing');
    expect(val(c, 'G1')).toBe('Mid');
    expect(val(c, 'G2')).toBe('Mid');
    expect(String(val(c, 'G3'))).toBe('#N/A');
    expect(val(c, 'H1')).toBe('C002');
    expect(val(c, 'H2')).toBe('East');
  });
  it('text vs number lookup mismatch gives #N/A', () => {
    const c = new Calc([wb('B', sheet('S', { A1: "'1001", B1: 'x', D1: 1001, E1: '=VLOOKUP(D1,A1:B1,2,FALSE)', E2: '=VLOOKUP(TEXT(D1,"0"),A1:B1,2,FALSE)' }))]);
    expect(String(val(c, 'E1'))).toBe('#N/A');
    expect(val(c, 'E2')).toBe('x');
  });
  it('conditional aggregation', () => {
    const c = new Calc([wb('B', sheet('S', { A1: 'East', B1: 10, A2: 'West', B2: 20, A3: 'East', B3: 30, C1: '=SUMIF(A1:A3,"East",B1:B3)', C2: '=COUNTIFS(A1:A3,"East",B1:B3,">15")', C3: '=SUMIFS(B1:B3,A1:A3,"E*")', C4: '=AVERAGEIFS(B1:B3,A1:A3,"<>West")', C5: '=COUNTIF(B1:B3,">=20")' }))]);
    expect(val(c, 'C1')).toBe(40);
    expect(val(c, 'C2')).toBe(1);
    expect(val(c, 'C3')).toBe(40);
    expect(val(c, 'C4')).toBe(20);
    expect(val(c, 'C5')).toBe(2);
  });
  it('dates', () => {
    const c = new Calc([wb('B', sheet('S', { A1: '2024-01-15', B1: '=EOMONTH(A1,0)', B2: '=YEAR(A1)', B3: '=TEXT(A1,"yyyy-mm-dd")', B4: '=WORKDAY(DATE(2024,1,19),2)', B5: '=NETWORKDAYS(DATE(2024,1,1),DATE(2024,1,31))', B6: '=TEXT(EDATE(A1,1),"mmm d, yyyy")', B7: '=DATEDIF(DATE(2020,1,1),DATE(2024,6,1),"Y")' }))]);
    expect(val(c, 'A1')).toBe(45306);
    expect(formatValue(val(c, 'B1'), 'yyyy-mm-dd')).toBe('2024-01-31');
    expect(val(c, 'B2')).toBe(2024);
    expect(val(c, 'B3')).toBe('2024-01-15');
    expect(formatValue(val(c, 'B4'), 'yyyy-mm-dd')).toBe('2024-01-23');
    expect(val(c, 'B5')).toBe(23);
    expect(val(c, 'B6')).toBe('Feb 15, 2024');
    expect(val(c, 'B7')).toBe(4);
  });
  it('dynamic arrays spill', () => {
    const c = new Calc([wb('B', sheet('S', { A1: 'b', A2: 'a', A3: 'b', A4: 'c', C1: '=UNIQUE(A1:A4)', D1: '=COUNTA(C1#)', E1: '=SORT(UNIQUE(A1:A4))', F1: 'x', F2: '=SEQUENCE(3)', G1: '=UPPER(A1:A2)' }))]);
    expect(val(c, 'C1')).toBe('b');
    expect(val(c, 'C2')).toBe('a');
    expect(val(c, 'C3')).toBe('c');
    expect(val(c, 'D1')).toBe(3);
    expect(val(c, 'E1')).toBe('a');
    expect(val(c, 'E3')).toBe('c');
    expect(val(c, 'F3')).toBe(2);
    expect(val(c, 'G2')).toBe('A');
  });
  it('spill blocked', () => {
    const c = new Calc([wb('B', sheet('S', { A1: '=SEQUENCE(3)', A2: 'block' }))]);
    expect(String(val(c, 'A1'))).toBe('#SPILL!');
  });
  it('text functions', () => {
    const c = new Calc([wb('B', sheet('S', { A1: '  ACME   corp ', B1: '=PROPER(TRIM(A1))', B2: '=LEFT("ACC-1234",3)', B3: '=MID("ACC-1234",5,4)*1', B4: '=SUBSTITUTE("1,234",",","")+0', B5: '=TEXTJOIN("-",TRUE,"a","","b")', B6: '=TEXT(1234.5,"$#,##0.00")', B7: '=TEXT(0.256,"0.0%")', B8: '=FIND("-","ACC-1")', B9: '=TEXTAFTER("ACC-1234","-")' }))]);
    expect(val(c, 'B1')).toBe('Acme Corp');
    expect(val(c, 'B2')).toBe('ACC');
    expect(val(c, 'B3')).toBe(1234);
    expect(val(c, 'B4')).toBe(1234);
    expect(val(c, 'B5')).toBe('a-b');
    expect(val(c, 'B6')).toBe('$1,234.50');
    expect(val(c, 'B7')).toBe('25.6%');
    expect(val(c, 'B8')).toBe(4);
    expect(val(c, 'B9')).toBe('1234');
  });
  it('financial', () => {
    const c = new Calc([wb('B', sheet('S', { B1: '=PMT(0.06/12,360,300000)', B2: '=NPV(0.1,100,100,100)', B3: '=IRR({-100,60,60})' }))]);
    expect(val(c, 'B1') as number).toBeCloseTo(-1798.65, 2);
    expect(val(c, 'B2') as number).toBeCloseTo(248.685, 2);
    expect(val(c, 'B3') as number).toBeCloseTo(0.1307, 3);
  });
  it('circular ref', () => {
    const c = new Calc([wb('B', sheet('S', { A1: '=B1+1', B1: '=A1+1' }))]);
    val(c, 'A1');
    expect(c.circular).toBeTruthy();
  });
  it('ref rewriting', () => {
    expect(shiftFormula('=A1+$B$2+C$3+$D4+Sheet2!E5', 1, 1)).toBe('=B2+$B$2+D$3+$D5+Sheet2!F6');
    expect(shiftFormula('=SUM(A:A)', 3, 1)).toBe('=SUM(B:B)');
    expect(shiftFormula('=A1', -1, 0)).toBe('=#REF!');
    expect(toggleAbsoluteAt('=A1+B2', 3).text).toBe('=$A$1+B2');
    expect(toggleAbsoluteAt('=$A$1', 5).text).toBe('=A$1');
    expect(adjustForInsert('=SUM(A1:A5)+B9', 'row', 2, 2, 'S', 'S')).toBe('=SUM(A1:A7)+B11');
    expect(adjustForInsert('=A3', 'row', 2, -1, 'S', 'S')).toBe('=#REF!');
  });
  it('formats', () => {
    expect(formatValue(1234.567, '#,##0.00')).toBe('1,234.57');
    expect(formatValue(-1234.5, '$#,##0.00_);($#,##0.00)')).toBe('($1,234.50)');
    expect(formatValue(0.1234, '0.0%')).toBe('12.3%');
    expect(formatValue(45306, 'd-mmm-yy')).toBe('15-Jan-24');
    expect(formatValue(45306, 'm/d/yyyy')).toBe('1/15/2024');
    expect(formatValue(1500000, '#,##0,"K"')).toBe('1,500K');
  });
});
