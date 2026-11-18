import type { Lesson, CheckCtx } from '../types';
import { makeBook, trades, rng, round2 } from '../data';
import { all, approx, fmtScalar, formulasMatch, valuesEqual } from '../runner';

// ---------------------------------------------------------------------------
// Front office (trading system) vs back office (settlements). The BO file is a
// shuffled copy of FO with deliberate breaks planted at fixed positions:
//   - 3 trades never reached BO              -> "Missing in BO"
//   - 3 quantity mismatches                   -> "Qty break"
//   - 2 price mismatches                      -> "Price break"
//   - 1 trade settled twice                   -> "Duplicate in BO"
//   - 2 settlements with no FO trade          -> "Missing in FO"
// ---------------------------------------------------------------------------

const FO = trades(60, 4242);
const N = FO.length; // rows 2..61
const LAST = N + 1;
const MISSING = new Set([4, 23, 47]);
const QTY = new Map([[9, 100], [31, 300], [52, 500]]);
const PRICE = new Map([[15, 0.25], [38, -1.1]]);
const DUP = 27;

interface BoRow { id: string; settle: number; cpty: string; qty: number; price: number }
const boRows: BoRow[] = [];
FO.forEach((t, i) => {
  if (MISSING.has(i)) return;
  const qty = t.qty + (QTY.get(i) ?? 0);
  const price = round2(t.price + (PRICE.get(i) ?? 0));
  boRows.push({ id: t.id, settle: t.date + 2, cpty: t.cpty, qty, price });
  if (i === DUP) boRows.push({ id: t.id, settle: t.date + 3, cpty: t.cpty, qty, price });
});
boRows.push({ id: 'T79014', settle: FO[0].date + 2, cpty: 'Atlas Prime', qty: 1500, price: 101.25 });
boRows.push({ id: 'T79022', settle: FO[0].date + 5, cpty: 'Summit Clearing', qty: 800, price: 54.1 });
// deterministic shuffle so BO order doesn't line up with FO
{
  const r = rng(99);
  for (let i = boRows.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [boRows[i], boRows[j]] = [boRows[j], boRows[i]];
  }
}
const BO_N = boRows.length; // 60 -> rows 2..61
const BO_LAST = BO_N + 1;

const foIds = new Set(FO.map((t) => t.id));
const boCount = (id: string) => boRows.filter((b) => b.id === id).length;
const boFirst = (id: string) => boRows.find((b) => b.id === id);

const EXP_COUNT = FO.map((t) => boCount(t.id));
const EXP_QTY = FO.map((t) => boFirst(t.id)?.qty ?? 'Missing');
const EXP_PRICE = FO.map((t) => boFirst(t.id)?.price ?? 'Missing');
const EXP_STATUS = FO.map((t) => {
  const n = boCount(t.id);
  if (n === 0) return 'Missing in BO';
  if (n > 1) return 'Duplicate in BO';
  const b = boFirst(t.id)!;
  if (b.qty !== t.qty) return 'Qty break';
  if (b.price !== t.price) return 'Price break';
  return 'Matched';
});
const EXP_NOTIONAL = FO.map((t) => t.qty * t.price);
const BO_ONLY = boRows.filter((b) => !foIds.has(b.id)).map((b) => b.id);

const LABELS = ['Matched', 'Qty break', 'Price break', 'Missing in BO', 'Duplicate in BO'];
const EXP_CNT = LABELS.map((l) => EXP_STATUS.filter((s) => s === l).length);
const EXP_NOT = LABELS.map((l) => EXP_STATUS.reduce((a, s, i) => (s === l ? a + EXP_NOTIONAL[i] : a), 0));
const TOTAL_BREAKS = EXP_CNT.slice(1).reduce((a, b) => a + b, 0) + BO_ONLY.length;
const TOTAL_BREAK_NOTIONAL = EXP_NOT.slice(1).reduce((a, b) => a + b, 0);

const foBook = () =>
  makeBook('FO_Trades.xlsx', [
    {
      name: 'FO',
      rows: [['Trade ID', 'Trade Date', 'Counterparty', 'Instrument', 'Side', 'Qty', 'Price'], ...FO.map((t) => [t.id, t.date, t.cpty, t.instrument, t.side, t.qty, t.price])],
      widths: [80, 90, 150, 140, 50, 70, 80, 80, 80, 80, 130, 110],
      formats: { 1: 'm/d/yyyy', 5: '#,##0', 6: '#,##0.00' },
    },
    {
      name: 'Breaks',
      header: false,
      rows: [
        ['FO vs BO Trade Recon — Break Summary', '', '', '', 'Settled in BO, unknown to FO'],
        [],
        ['Status', 'Count', 'FO Notional'],
        ...LABELS.map((l) => [l]),
        ['Missing in FO'],
        [],
        ['Total breaks'],
        [],
        ['FO trades'],
        ['BO rows'],
        ['Proof (should be 0)'],
      ],
      widths: [170, 80, 140, 20, 200],
      styles: { A1: { b: true }, E1: { b: true }, A3: { b: true, fill: '#DDEBF7' }, B3: { b: true, fill: '#DDEBF7' }, C3: { b: true, fill: '#DDEBF7' }, A11: { b: true }, A15: { b: true } },
    },
  ]);

const boBook = () =>
  makeBook('BO_Settlements.xlsx', [
    {
      name: 'BO',
      rows: [['Trade Ref', 'Settle Date', 'Counterparty', 'Qty', 'Price', 'Settle Amount'], ...boRows.map((b) => [b.id, b.settle, b.cpty, b.qty, b.price, round2(b.qty * b.price)])],
      widths: [80, 90, 150, 70, 80, 120],
      formats: { 1: 'm/d/yyyy', 3: '#,##0', 4: '#,##0.00', 5: '#,##0.00' },
      freeze: true,
    },
  ]);

const nonEmptyHeader = (c: CheckCtx, ref: string, name: string) => (String(c.v(ref) ?? '').trim() ? true : `Give the column a header: type "${name}" in ${ref}.`);
const refsBO = (c: CheckCtx, ref: string) => {
  const bad = c.inputs(ref).findIndex((x) => !/bo_settlements/i.test(x));
  return bad < 0 ? true : `The formulas in ${ref} should reference [BO_Settlements.xlsx] (cell #${bad + 1} doesn't).`;
};

export const project: Lesson = {
  id: 'p2-trade-recon',
  kind: 'project',
  title: 'Front-to-Back Trade Reconciliation',
  summary: 'Match front-office trades to back-office settlements across two files, classify every break and prove the counts.',
  minutes: 40,
  featured: ['COUNTIF', 'XLOOKUP', 'IF', 'FILTER', 'SUMIF', 'COUNTA', 'Ctrl+Shift+L'],
  intro: `**From:** Marcus Oyelaran, Operations Control
**To:** you
**Subject:** URGENT — March trade recon, breaks to Ops by noon

The front-to-back recon failed overnight and the vendor tool is down. We need to do it by hand today.

- **FO_Trades.xlsx** — 60 trades booked by the desk (front office). This is your working file.
- **BO_Settlements.xlsx** — what settlements actually processed (back office). **Read-only**, it's the system of record. It's sorted by whatever the settlement engine felt like, not by trade ID.

Every FO trade must end up with exactly one status:

- **Matched** — in BO once, same qty and price
- **Qty break** / **Price break** — found, but the numbers differ
- **Missing in BO** — never settled (risk: failed settlement, claims)
- **Duplicate in BO** — settled twice (risk: we paid out double!)

…and separately, any BO settlement with **no FO trade** (**Missing in FO**) — somebody settled something we never traded.

**What "done" looks like:** a status on all 60 FO rows, the **Breaks** tab filled in with counts and notional per status, a proof that the FO and BO row counts reconcile, and the FO list filtered to breaks only so I can paste it to Ops.`,
  workbooks: () => [foBook(), boBook()],
  readOnly: ['BO_Settlements.xlsx'],
  start: { book: 'FO_Trades.xlsx', sheet: 'FO', cell: 'H1' },
  tasks: [
    {
      id: 't1',
      title: 'Count each trade in BO',
      instruction: `On **FO**, header \`BO Count\` in **H1**. In **H2:H${LAST}** use **COUNTIF** to count how many times each Trade ID (A) appears in the BO file's **Trade Ref** column (\`[BO_Settlements.xlsx]BO!$A:$A\`).`,
      why: `Count *before* you look up. A lookup only ever returns the **first** match, so it can't tell you a trade settled twice, and it can't distinguish "missing" from "zero". COUNTIF answers the existence question cleanly:

- **0** → missing in BO
- **1** → found once (now compare the numbers)
- **2+** → duplicate settlement — the scariest break of all`,
      hints: ['COUNTIF(range, criteria) — the range is in the other workbook, the criteria is A2.', '=COUNTIF([BO_Settlements.xlsx]BO!$A:$A,A2) filled down.'],
      check: (c) =>
        all(
          nonEmptyHeader(c, 'FO!H1', 'BO Count'),
          formulasMatch(c, `FO!H2:H${LAST}`, /COUNTIFS?\(/i, 'COUNTIF'),
          refsBO(c, `FO!H2:H${LAST}`),
          valuesEqual(c, `FO!H2:H${LAST}`, EXP_COUNT, 'BO Count'),
        ),
      solution: [{ set: { 'FO!H1': 'BO Count', [`FO!H2:H${LAST}`]: '=COUNTIF([BO_Settlements.xlsx]BO!$A:$A,A2)' } }],
      xp: 25,
    },
    {
      id: 't2',
      title: 'Pull BO quantity and price',
      instruction: `Headers \`BO Qty\` in **I1** and \`BO Price\` in **J1**. Use **XLOOKUP** to bring back the BO **Qty** (column D) and **Price** (column E) for each Trade ID. When the trade isn't in BO, return the text \`Missing\` (XLOOKUP's 4th argument).`,
      why: `XLOOKUP takes a lookup column and a return column separately, so it doesn't care that Qty is to the right of the key (VLOOKUP would need a column number, which breaks when someone inserts a column in the source).

Its built-in **if_not_found** argument replaces the IFERROR wrapper — and unlike IFERROR it only catches "not found", not genuine formula mistakes.`,
      hints: [
        'XLOOKUP(lookup_value, lookup_array, return_array, [if_not_found])',
        '=XLOOKUP(A2,[BO_Settlements.xlsx]BO!$A:$A,[BO_Settlements.xlsx]BO!$D:$D,"Missing")',
        'Same for price with column $E:$E.',
      ],
      check: (c) =>
        all(
          nonEmptyHeader(c, 'FO!I1', 'BO Qty'),
          nonEmptyHeader(c, 'FO!J1', 'BO Price'),
          formulasMatch(c, `FO!I2:J${LAST}`, /(XLOOKUP|VLOOKUP|INDEX)\(/i, 'lookup (XLOOKUP)'),
          refsBO(c, `FO!I2:J${LAST}`),
          valuesEqual(c, `FO!I2:I${LAST}`, EXP_QTY, 'BO Qty'),
          valuesEqual(c, `FO!J2:J${LAST}`, EXP_PRICE, 'BO Price'),
        ),
      solution: [
        {
          set: {
            'FO!I1': 'BO Qty',
            'FO!J1': 'BO Price',
            [`FO!I2:I${LAST}`]: '=XLOOKUP(A2,[BO_Settlements.xlsx]BO!$A:$A,[BO_Settlements.xlsx]BO!$D:$D,"Missing")',
            [`FO!J2:J${LAST}`]: '=XLOOKUP(A2,[BO_Settlements.xlsx]BO!$A:$A,[BO_Settlements.xlsx]BO!$E:$E,"Missing")',
          },
        },
      ],
      xp: 30,
    },
    {
      id: 't3',
      title: 'Classify every trade',
      instruction: `Header \`Status\` in **K1**. In **K2:K${LAST}** write one formula that returns, in this order of priority:

- \`Missing in BO\` if the BO Count is 0
- \`Duplicate in BO\` if the BO Count is more than 1
- \`Qty break\` if BO Qty ≠ FO Qty
- \`Price break\` if BO Price ≠ FO Price
- \`Matched\` otherwise`,
      why: `Order matters. A missing trade also "has a different qty" (\`Missing\` ≠ 500), so the existence tests must come first. This "waterfall" is how every recon engine classifies — one trade, one reason, the most severe first.

Keep the status text **exactly** consistent; the summary and the filter you build next depend on matching it.`,
      hints: [
        'Nest IFs: =IF(H2=0,"Missing in BO",IF(H2>1,"Duplicate in BO",IF(…)))',
        'Not-equal in Excel is <>.',
        '=IF(H2=0,"Missing in BO",IF(H2>1,"Duplicate in BO",IF(I2<>F2,"Qty break",IF(J2<>G2,"Price break","Matched"))))',
      ],
      check: (c) =>
        all(
          nonEmptyHeader(c, 'FO!K1', 'Status'),
          formulasMatch(c, `FO!K2:K${LAST}`, /(IF|IFS)\(/i, 'IF'),
          valuesEqual(c, `FO!K2:K${LAST}`, EXP_STATUS, 'Status'),
        ),
      solution: [{ set: { 'FO!K1': 'Status', [`FO!K2:K${LAST}`]: '=IF(H2=0,"Missing in BO",IF(H2>1,"Duplicate in BO",IF(I2<>F2,"Qty break",IF(J2<>G2,"Price break","Matched"))))' } }],
      xp: 35,
    },
    {
      id: 't4',
      title: 'Notional per trade',
      instruction: `Header \`Notional\` in **L1**, and in **L2:L${LAST}** the FO notional = **Qty × Price**. Give L2:L${LAST} a thousands-separator format (Comma Style, [[Alt]] [[H]] [[K]]).`,
      why: `Ops prioritises breaks by **size**, not by count: one $5M price break matters more than ten $2k qty breaks. Notional is the common yardstick across instruments.`,
      hints: ['=F2*G2 filled down.', 'Select L2:L61 then Alt, H, K.'],
      check: (c) => {
        const r = all(nonEmptyHeader(c, 'FO!L1', 'Notional'), formulasMatch(c, `FO!L2:L${LAST}`, /[A-Z]+\d+\s*\*\s*\$?[A-Z]+\d+|PRODUCT\(/i, 'Qty × Price'), valuesEqual(c, `FO!L2:L${LAST}`, EXP_NOTIONAL, 'Notional'));
        if (r !== true) return r;
        return /#,##0/.test(c.style('FO!L2').fmt ?? '') && /#,##0/.test(c.style(`FO!L${LAST}`).fmt ?? '') ? true : 'Format L2:L61 with a thousands separator (Comma Style).';
      },
      solution: [{ set: { 'FO!L1': 'Notional', [`FO!L2:L${LAST}`]: '=F2*G2' } }, { select: `FO!L2:L${LAST}` }, { cmd: 'fmt.comma' }],
      xp: 20,
    },
    {
      id: 't5',
      title: 'Find settlements unknown to FO',
      instruction: `The BO file is read-only, so you can't add a helper column there. Instead, on the **Breaks** tab, put one **FILTER** formula in **E2** that lists every BO Trade Ref (\`[BO_Settlements.xlsx]BO!A2:A${BO_LAST}\`) whose COUNTIF in **FO!A2:A${LAST}** is 0. It will spill down.`,
      why: `A recon runs **both ways**. Matching FO→BO only proves every trade settled; it says nothing about settlements nobody traded (fat-finger, fraud, or a booking that never made it into the FO system).

COUNTIF with a *whole range* as the criteria returns one count per BO row — an array — and FILTER keeps the rows where that count is 0. That's a dynamic-array "anti-join" in one cell.`,
      hints: [
        'FILTER(array, include). The include argument is a TRUE/FALSE test per BO row.',
        'COUNTIF(FO!$A$2:$A$61, [BO_Settlements.xlsx]BO!A2:A61)=0 is TRUE for BO refs that FO has never heard of.',
        `=FILTER([BO_Settlements.xlsx]BO!A2:A${BO_LAST},COUNTIF(FO!$A$2:$A$${LAST},[BO_Settlements.xlsx]BO!A2:A${BO_LAST})=0)`,
      ],
      check: (c) => {
        const f = c.f('Breaks!E2');
        if (!f.startsWith('=')) return 'Put a FILTER formula in Breaks!E2.';
        if (!/bo_settlements/i.test(f)) return 'The formula in E2 should read the Trade Refs from [BO_Settlements.xlsx].';
        return valuesEqual(c, `Breaks!E2:E${1 + BO_ONLY.length}`, BO_ONLY, 'BO-only trades');
      },
      solution: [{ set: { 'Breaks!E2': `=FILTER([BO_Settlements.xlsx]BO!A2:A${BO_LAST},COUNTIF(FO!$A$2:$A$${LAST},[BO_Settlements.xlsx]BO!A2:A${BO_LAST})=0)` } }],
      xp: 40,
    },
    {
      id: 't6',
      title: 'Break summary: counts and notional',
      instruction: `On **Breaks**:

- **B4:B8** — count of FO trades with each status in column A (COUNTIF on FO!K).
- **C4:C8** — total FO Notional for each status (SUMIF / SUMIFS on FO!L).
- **B9** — the number of BO-only trades (count what your FILTER spilled, e.g. \`=ROWS(E2#)\` or \`=COUNTA(E2:E20)\`).
- **B11** — total breaks = everything except Matched (**B5:B9**).
- **C11** — total break notional (**C5:C8**).`,
      why: `This is the table Ops actually reads. Counts tell them the workload, notional tells them the risk. Note that "Matched" is deliberately excluded from the totals — it's there so your counts add back to 60 FO trades.

\`E2#\` is a **spill reference**: it always means "the whole spilled result of E2", however many rows that is today.`,
      hints: [
        'B4: =COUNTIF(FO!$K:$K,A4) filled to B8.',
        'C4: =SUMIF(FO!$K:$K,A4,FO!$L:$L) filled to C8.',
        'B9: =ROWS(E2#).  B11: =SUM(B5:B9).  C11: =SUM(C5:C8).',
      ],
      check: (c) =>
        all(
          formulasMatch(c, 'Breaks!B4:B8', /COUNTIFS?\(/i, 'COUNTIF'),
          formulasMatch(c, 'Breaks!C4:C8', /SUMIFS?\(/i, 'SUMIF/SUMIFS'),
          valuesEqual(c, 'Breaks!B4:B8', EXP_CNT, 'Counts'),
          valuesEqual(c, 'Breaks!C4:C8', EXP_NOT, 'Notional'),
          c.f('Breaks!B9').startsWith('=') && c.v('Breaks!B9') === BO_ONLY.length ? true : `B9 should be a formula counting the BO-only trades (${fmtScalar(c.v('Breaks!B9'))} so far).`,
          c.f('Breaks!B11').startsWith('=') && c.v('Breaks!B11') === TOTAL_BREAKS ? true : `B11 should add up the break counts in B5:B9 (shows ${fmtScalar(c.v('Breaks!B11'))}).`,
          c.f('Breaks!C11').startsWith('=') && approx(c.v('Breaks!C11'), TOTAL_BREAK_NOTIONAL, 1e-9) ? true : `C11 should add up the break notional in C5:C8 (shows ${fmtScalar(c.v('Breaks!C11'))}).`,
        ),
      solution: [
        {
          set: {
            'Breaks!B4:B8': '=COUNTIF(FO!$K:$K,A4)',
            'Breaks!C4:C8': '=SUMIF(FO!$K:$K,A4,FO!$L:$L)',
            'Breaks!B9': '=ROWS(E2#)',
            'Breaks!B11': '=SUM(B5:B9)',
            'Breaks!C11': '=SUM(C5:C8)',
          },
        },
      ],
      xp: 35,
    },
    {
      id: 't7',
      title: 'Prove the row counts',
      instruction: `Still on **Breaks**:

- **B13** — FO trade count: \`COUNTA\` of FO!A2:A${LAST}.
- **B14** — BO row count: \`COUNTA\` of the BO Trade Ref column (rows 2–${BO_LAST}).
- **B15** — the proof: FO trades − Missing in BO + Duplicates + Missing in FO − BO rows. It must be **0**.`,
      why: `Notice FO and BO **both have 60 rows** — a lazy check would say "counts match, we're fine". They match by coincidence: 3 missing, 1 extra duplicate and 2 strangers cancel out.

The proof walks from one population to the other using your break counts. If it isn't 0, a trade is in the wrong bucket (or you double-counted). Auditors love this line.`,
      hints: ['B13: =COUNTA(FO!A2:A61)', `B14: =COUNTA([BO_Settlements.xlsx]BO!A2:A${BO_LAST})`, 'B15: =B13-B7+B8+B9-B14'],
      check: (c) =>
        all(
          c.f('Breaks!B13').startsWith('=') && c.v('Breaks!B13') === N ? true : `B13 should count the FO trades with a formula (expect ${N}).`,
          /bo_settlements/i.test(c.f('Breaks!B14')) && c.v('Breaks!B14') === BO_N ? true : `B14 should COUNTA the Trade Refs in [BO_Settlements.xlsx] (expect ${BO_N}).`,
          c.f('Breaks!B15').startsWith('=') && /B13/i.test(c.f('Breaks!B15')) && c.v('Breaks!B15') === 0 ? true : `B15 should be a formula using B13, the break counts and B14 that returns 0 (shows ${fmtScalar(c.v('Breaks!B15'))}).`,
        ),
      solution: [{ set: { 'Breaks!B13': `=COUNTA(FO!A2:A${LAST})`, 'Breaks!B14': `=COUNTA([BO_Settlements.xlsx]BO!A2:A${BO_LAST})`, 'Breaks!B15': '=B13-B7+B8+B9-B14' } }],
      xp: 30,
    },
    {
      id: 't8',
      title: 'Filter the FO list to breaks for Ops',
      instruction: `Go to **FO**, turn on AutoFilter ([[Ctrl+Shift+L]]) and filter the **Status** column so that every status **except Matched** is shown.`,
      why: `Ops doesn't want 60 rows; they want the ${N - EXP_CNT[0]} they have to chase. Filtering (rather than deleting or sorting) keeps your formulas intact and lets you clear it in one click once the breaks are resolved.

Tip: in the filter drop-down, untick "Matched" rather than ticking each break type — if a new break type appears tomorrow it'll still show.`,
      hints: ['Click any cell in the FO table, press Ctrl+Shift+L.', 'Open the Status drop-down (Alt+↓ on K1) and untick Matched.'],
      check: (c) => {
        const sh = c.sheet('FO');
        if (!sh?.filter) return 'Turn on AutoFilter on the FO sheet (Ctrl+Shift+L).';
        const hidden = sh.hiddenRows ?? {};
        for (let i = 0; i < N; i++) {
          const isHidden = !!hidden[i + 1];
          if (EXP_STATUS[i] === 'Matched' && !isHidden) return `Row ${i + 2} is Matched but still visible — filter Status to exclude Matched.`;
          if (EXP_STATUS[i] !== 'Matched' && isHidden) return `Row ${i + 2} is a ${EXP_STATUS[i]} but it's hidden — only Matched rows should be filtered out.`;
        }
        return true;
      },
      solution: [{ select: 'FO!A1' }, { filter: { col: 'K', allowed: LABELS.slice(1) } }],
      xp: 25,
    },
  ],
};
