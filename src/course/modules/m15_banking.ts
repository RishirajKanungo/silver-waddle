import type { CheckCtx, Module } from '../types';
import { makeBook, customers, loans, rng, d, BRANCHES } from '../data';
import { all, approx, formulasMatch, valuesEqual } from '../runner';

const CS = customers(60, 7);
const lc = (v: unknown) => String(v ?? '').trim().toLowerCase();
const isErrV = (v: unknown) => !!v && typeof v === 'object' && 'code' in (v as object);

// ---------------------------------------------------------------------------
// L1 — amortization
// ---------------------------------------------------------------------------
const P = 36000;
const RATE = 0.065;
const TERM = 36;
const SCHED0 = 7; // first schedule row
const SCHED1 = SCHED0 + TERM - 1; // 42
const i12 = RATE / 12;
const PAY = (P * i12) / (1 - Math.pow(1 + i12, -TERM));
const sched: { open: number; int: number; prin: number; close: number }[] = [];
{
  let bal = P;
  for (let k = 0; k < TERM; k++) {
    const int = bal * i12;
    const prin = PAY - int;
    sched.push({ open: bal, int, prin, close: bal - prin });
    bal -= prin;
  }
}
const TOTAL_INT = PAY * TERM - P;

// ---------------------------------------------------------------------------
// L2 — deal cash flows
// ---------------------------------------------------------------------------
const CF = [-2500000, 650000, 700000, 750000, 750000, 500000];
const DATES = [d(2025, 1, 15), d(2026, 1, 15), d(2027, 1, 15), d(2028, 3, 15), d(2029, 1, 15), d(2030, 6, 30)];
const HURDLE = 0.08;
const npvFrom1 = (r: number, xs: number[]) => xs.reduce((a, x, i) => a + x / Math.pow(1 + r, i + 1), 0);
const NPV_OK = npvFrom1(HURDLE, CF.slice(1)) + CF[0];
const NPV_WRONG = npvFrom1(HURDLE, CF);
const rootOf = (f: (r: number) => number) => {
  let lo = -0.99, hi = 1;
  for (let k = 0; k < 200; k++) {
    const m = (lo + hi) / 2;
    if (f(m) > 0) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
};
const IRR = rootOf((r) => CF.reduce((a, x, i) => a + x / Math.pow(1 + r, i), 0));
const xnpv = (r: number) => CF.reduce((a, x, i) => a + x / Math.pow(1 + r, (DATES[i] - DATES[0]) / 365), 0);
const XNPV = xnpv(HURDLE);
const XIRR = rootOf(xnpv);
const DECISION = IRR > HURDLE ? 'Accept' : 'Reject';

// ---------------------------------------------------------------------------
// L3 — aging buckets
// ---------------------------------------------------------------------------
const AG = loans(CS, 80, 41).map((l) => ({ ...l }));
// make sure every bucket is populated
AG[10].dpd = 35;
AG[40].dpd = 52;
AG[63].dpd = 41;
for (const l of AG) l.status = l.dpd >= 90 ? 'Non-Accrual' : l.dpd > 0 ? 'Delinquent' : 'Current';
const AG_LAST = AG.length + 1; // 81
const BUCKETS: [number, string][] = [
  [0, 'Current'],
  [1, '1-29 DPD'],
  [30, '30-59 DPD'],
  [60, '60-89 DPD'],
  [90, '90+ DPD'],
];
const bucketOf = (dpd: number) => [...BUCKETS].reverse().find(([m]) => dpd >= m)![1];
const agBuckets = AG.map((l) => bucketOf(l.dpd));
const agTotal = AG.reduce((a, l) => a + l.balance, 0);
const bCount = (b: string) => agBuckets.filter((x) => x === b).length;
const bSum = (b: string) => AG.reduce((a, l, i) => a + (agBuckets[i] === b ? l.balance : 0), 0);

// ---------------------------------------------------------------------------
// L4 — month-over-month variance
// ---------------------------------------------------------------------------
const VR = (() => {
  const r = rng(77);
  return BRANCHES.map((b) => {
    if (b === 'SEA-01') return { b, oct: 0, nov: 12500000 };
    const oct = Math.round(20000000 + r() * 60000000);
    const nov = Math.round(oct * (1 + (r() - 0.5) * 0.24));
    return { b, oct, nov };
  });
})();
const VN = VR.length; // rows 2..11
const VLAST = VN + 1;
const THRESH = 2000000;
const totOct = VR.reduce((a, x) => a + x.oct, 0);
const totNov = VR.reduce((a, x) => a + x.nov, 0);

// ---------------------------------------------------------------------------
// L5 — data-quality controls
// ---------------------------------------------------------------------------
const DQsrc = loans(CS, 40, 43);
const CONTROL_TOTAL = Math.round(DQsrc.reduce((a, l) => a + l.balance, 0) * 100) / 100;
const BLANK_AT = [5, 21];
const TEXT_AT = 14;
const DUP_FROM = 9, DUP_TO = 30;
const DQ = DQsrc.map((l, i) => ({
  id: i === DUP_TO ? DQsrc[DUP_FROM].id : l.id,
  cust: l.cust,
  product: l.product,
  branch: l.branch,
  bal: BLANK_AT.includes(i) ? '' : i === TEXT_AT ? "'" + l.balance.toFixed(2) : l.balance,
}));
const DQ_LAST = DQ.length + 1; // 41
const missing = BLANK_AT.reduce((a, i) => a + DQsrc[i].balance, 0) + DQsrc[TEXT_AT].balance;
const TAPE_SUM = CONTROL_TOTAL - missing;
const isNumFlags = DQ.map((x) => typeof x.bal === 'number');
const dupFlags = DQ.map((x) => DQ.filter((y) => y.id === x.id).length > 1);

const notFormula = (c: CheckCtx, ref: string) => !c.f(ref).startsWith('=');

// ---------------------------------------------------------------------------

export const module: Module = {
  id: 'm15',
  title: 'Banking Analytics Toolkit',
  level: 'Hero',
  icon: '🏦',
  blurb: 'The formulas a bank analyst reaches for every week: amortization schedules, NPV/IRR, DPD aging buckets, month-over-month variance and data-quality controls.',
  lessons: [
    // ------------------------------------------------------------------ L1
    {
      id: 'm15-l1',
      title: 'Loan payments & amortization',
      summary: 'PMT, IPMT and PPMT with the right signs, and a full schedule that pays down to zero.',
      minutes: 12,
      featured: ['PMT', 'IPMT', 'PPMT', 'SEQUENCE', 'Ctrl+D'],
      intro: `An **amortizing loan** pays the same amount every period; each payment covers that month's **interest** first and the rest repays **principal**. Early payments are mostly interest, later ones mostly principal.

**The three functions** (all take the *periodic* rate and number of periods):
- \`PMT(rate, nper, pv)\` — the level payment
- \`IPMT(rate, per, nper, pv)\` — the interest part of payment number *per*
- \`PPMT(rate, per, nper, pv)\` — the principal part (PMT = IPMT + PPMT)

**Rate and periods must match the payment frequency.** Monthly payments → annual rate **/12** and term in **months**. Using 6.5% as a monthly rate is the #1 mistake (the payment comes out ~12× too big).

**Sign convention — cash flow direction.** Excel thinks in cash flows: money you *receive* is positive, money you *pay* is negative. If the borrower receives \`pv = 36,000\`, the payments are outflows, so \`PMT\` returns a **negative** number. Two clean fixes:
- \`=PMT(B2/12, B3, -B1)\` — enter the loan as negative (the bank's view: we pay out the loan, receive payments), or
- \`=-PMT(B2/12, B3, B1)\` — flip the result.
Pick one and use it consistently; mixing signs is how schedules end up adding interest instead of subtracting it.

**Build-and-check habit:** opening balance → interest → principal → closing balance; the next row opens at the previous close. The schedule is right when the **final closing balance is 0** and total principal repaid equals the loan amount.`,
      workbooks: () => [
        makeBook('Auto_Loan_Schedule.xlsx', [
          {
            name: 'Loan',
            rows: [
              ['Loan amount', P],
              ['Annual rate', RATE],
              ['Term (months)', TERM],
              ['Monthly payment', ''],
              ['Total interest', '', 'Principal tie-out', ''],
              ['Period', 'Opening balance', 'Payment', 'Interest', 'Principal', 'Closing balance'],
            ],
            header: false,
            widths: [120, 130, 110, 110, 110, 130],
            styles: {
              A1: { b: true }, A2: { b: true }, A3: { b: true }, A4: { b: true }, A5: { b: true }, C5: { b: true },
              B1: { fmt: '#,##0.00' }, B2: { fmt: '0.00%' }, B4: { fmt: '#,##0.00', fill: '#FFF2CC' }, B5: { fmt: '#,##0.00' }, D5: { fmt: '#,##0.00' },
              ...Object.fromEntries('ABCDEF'.split('').map((x) => [`${x}6`, { b: true, fill: '#DDEBF7', border: { b: true } }])),
            },
          },
        ]),
      ],
      start: { cell: 'B4' },
      tasks: [
        {
          id: 't1',
          title: 'The monthly payment',
          instruction: 'In **B4** calculate the monthly payment as a **positive** number:\n\n`=PMT(B2/12,B3,-B1)`',
          why: `B2 is an annual rate, so /12 makes it monthly to match the monthly periods in B3. The loan amount goes in as -B1 because, from the lender's side, the loan is cash going out and the payments are cash coming in — so PMT returns a positive ${PAY.toFixed(2)}. Without the minus you would get −${PAY.toFixed(2)}: same number, opposite direction.`,
          hints: ['PMT(rate per period, number of periods, present value).', 'Monthly rate = B2/12. Term B3 is already in months.', 'Put a minus in front of B1 to get a positive payment.'],
          check: (c) => {
            const v = c.v('B4');
            if (!/PMT\(/i.test(c.f('B4'))) return 'B4 should use the PMT function.';
            if (approx(v, -PAY)) return 'Right size, wrong sign — enter the loan as -B1 (or put a minus before PMT) so the payment shows as positive.';
            if (typeof v === 'number' && Math.abs(v) > PAY * 3) return 'The payment is far too large — did you divide the annual rate by 12?';
            return approx(v, PAY, 1e-6) ? true : `B4 should be about ${PAY.toFixed(2)}.`;
          },
          solution: [{ set: { B4: '=PMT(B2/12,B3,-B1)' } }],
        },
        {
          id: 't2',
          title: 'Period numbers',
          instruction: `In **A${SCHED0}** enter \`=SEQUENCE(B3)\` — it spills the period numbers 1 to ${TERM}.`,
          why: 'Driving the period column from the term cell means you can never have 35 or 37 rows by accident. (The other columns are filled down to a fixed row here; in a fully dynamic model you would build them with spill formulas too.)',
          hints: ['SEQUENCE(n) returns 1…n.', '=SEQUENCE(B3)'],
          check: (c) =>
            all(
              /SEQUENCE\(\s*\$?B\$?3/i.test(c.f(`A${SCHED0}`)) ? true : `A${SCHED0} should be =SEQUENCE(B3), linked to the term cell.`,
              valuesEqual(c, `A${SCHED0}:A${SCHED1}`, sched.map((_, k) => k + 1), 'Period'),
            ),
          solution: [{ set: { [`A${SCHED0}`]: '=SEQUENCE(B3)' } }],
        },
        {
          id: 't3',
          title: 'Build period 1',
          instruction: `Fill row ${SCHED0}:\n\n- **B${SCHED0}** opening balance \`=B1\`\n- **C${SCHED0}** payment \`=$B$4\`\n- **D${SCHED0}** interest \`=-IPMT($B$2/12,A${SCHED0},$B$3,$B$1)\`\n- **E${SCHED0}** principal \`=-PPMT($B$2/12,A${SCHED0},$B$3,$B$1)\`\n- **F${SCHED0}** closing balance \`=B${SCHED0}-E${SCHED0}\``,
          why: `IPMT/PPMT follow the same sign rules as PMT: with a positive loan amount they return negatives, so we flip them with a leading minus. Sanity check the first interest by hand: ${P.toLocaleString('en-US')} × 6.5% / 12 = ${(P * i12).toFixed(2)}. Inputs are locked with $ so the row can be filled down; the period (A${SCHED0}) stays relative so each row asks for its own period.`,
          hints: ['Lock the inputs ($B$2, $B$3, $B$4, $B$1); leave A7 and B7/E7 relative.', `Interest for period 1 should be ${(P * i12).toFixed(2)}.`, 'Closing = opening − principal.'],
          check: (c) =>
            all(
              approx(c.v(`B${SCHED0}`), P) && !notFormula(c, `B${SCHED0}`) ? true : `B${SCHED0} should link to the loan amount (=B1).`,
              approx(c.v(`C${SCHED0}`), PAY) && !notFormula(c, `C${SCHED0}`) ? true : `C${SCHED0} should link to the payment (=$B$4).`,
              /IPMT\(/i.test(c.f(`D${SCHED0}`)) ? (approx(c.v(`D${SCHED0}`), sched[0].int) ? true : `D${SCHED0} should be +${sched[0].int.toFixed(2)} — check the sign and the /12.`) : `D${SCHED0} should use IPMT.`,
              /PPMT\(/i.test(c.f(`E${SCHED0}`)) ? (approx(c.v(`E${SCHED0}`), sched[0].prin) ? true : `E${SCHED0} should be +${sched[0].prin.toFixed(2)} — check the sign.`) : `E${SCHED0} should use PPMT.`,
              approx(c.v(`F${SCHED0}`), sched[0].close) && !notFormula(c, `F${SCHED0}`) ? true : `F${SCHED0} should be opening minus principal.`,
            ),
          solution: [
            {
              set: {
                [`B${SCHED0}`]: '=B1',
                [`C${SCHED0}`]: '=$B$4',
                [`D${SCHED0}`]: `=-IPMT($B$2/12,A${SCHED0},$B$3,$B$1)`,
                [`E${SCHED0}`]: `=-PPMT($B$2/12,A${SCHED0},$B$3,$B$1)`,
                [`F${SCHED0}`]: `=B${SCHED0}-E${SCHED0}`,
              },
            },
          ],
        },
        {
          id: 't4',
          title: 'Fill the schedule to zero',
          instruction: `In **B${SCHED0 + 1}** enter \`=F${SCHED0}\` (this month opens where last month closed). Copy **C${SCHED0}:F${SCHED0}** to row ${SCHED0 + 1}, then select **B${SCHED0 + 1}:F${SCHED1}** and press [[Ctrl+D]]. The last closing balance (**F${SCHED1}**) must be 0.`,
          why: 'Linking each opening balance to the previous closing balance is what makes it a schedule rather than 36 independent calculations. The final balance landing on exactly 0 proves rate, term, payment and signs all agree — if it ends at a big positive or negative number, one of them is inconsistent.',
          hints: [`B${SCHED0 + 1}: =F${SCHED0}.`, `Select B${SCHED0 + 1}:F${SCHED1} with the row-${SCHED0 + 1} formulas at the top, then Ctrl+D.`],
          check: (c) =>
            all(
              formulasMatch(c, `B${SCHED0 + 1}:B${SCHED1}`, /^=\$?F\$?\d+$/i, 'link to the previous closing balance'),
              formulasMatch(c, `D${SCHED0 + 1}:D${SCHED1}`, /IPMT\(/i, 'IPMT'),
              formulasMatch(c, `E${SCHED0 + 1}:E${SCHED1}`, /PPMT\(/i, 'PPMT'),
              valuesEqual(c, `D${SCHED0}:D${SCHED1}`, sched.map((x) => x.int), 'Interest'),
              typeof c.v(`F${SCHED1}`) === 'number' && Math.abs(c.v(`F${SCHED1}`) as number) < 0.01 ? true : `F${SCHED1} should be 0 — the loan is fully repaid.`,
            ),
          solution: [
            {
              set: {
                [`B${SCHED0 + 1}:B${SCHED1}`]: `=F${SCHED0}`,
                [`C${SCHED0 + 1}:C${SCHED1}`]: '=$B$4',
                [`D${SCHED0 + 1}:D${SCHED1}`]: `=-IPMT($B$2/12,A${SCHED0 + 1},$B$3,$B$1)`,
                [`E${SCHED0 + 1}:E${SCHED1}`]: `=-PPMT($B$2/12,A${SCHED0 + 1},$B$3,$B$1)`,
                [`F${SCHED0 + 1}:F${SCHED1}`]: `=B${SCHED0 + 1}-E${SCHED0 + 1}`,
              },
            },
          ],
        },
        {
          id: 't5',
          title: 'Totals & tie-out',
          instruction: `In **B5** total the interest: \`=SUM(D${SCHED0}:D${SCHED1})\`. In **D5** prove the principal ties out: \`=SUM(E${SCHED0}:E${SCHED1})-B1\` (must be 0).`,
          why: `Total interest (${TOTAL_INT.toFixed(2)}) is what the customer pays for borrowing — and what the bank earns over the life of the loan. It also equals payment × ${TERM} − principal, a quick mental check. The tie-out cell turns "looks right" into "proven right": total principal repaid must equal the amount lent.`,
          hints: [`Interest column is D${SCHED0}:D${SCHED1}.`, 'Principal column total minus the loan amount should be 0.'],
          check: (c) =>
            all(
              /SUM\(/i.test(c.f('B5')) && approx(c.v('B5'), TOTAL_INT) ? true : `B5 should SUM the interest column (≈ ${TOTAL_INT.toFixed(2)}).`,
              /SUM\(/i.test(c.f('D5')) ? true : 'D5 should be =SUM(principal column) − B1.',
              typeof c.v('D5') === 'number' && Math.abs(c.v('D5') as number) < 0.01 ? true : 'D5 should be 0.',
            ),
          solution: [{ set: { B5: `=SUM(D${SCHED0}:D${SCHED1})`, D5: `=SUM(E${SCHED0}:E${SCHED1})-B1` } }],
        },
      ],
    },

    // ------------------------------------------------------------------ L2
    {
      id: 'm15-l2',
      title: 'NPV, IRR & XNPV for a deal',
      summary: 'Value a lending deal against a hurdle rate — and avoid the NPV year-0 trap.',
      minutes: 10,
      featured: ['NPV', 'IRR', 'XNPV', 'XIRR', 'IF'],
      intro: `A deal is a series of cash flows: money out today (the loan or investment), money back later. Two questions:

- **NPV** (net present value): what are all the flows worth *today*, discounted at our **hurdle rate** (cost of funds + required margin)? NPV > 0 → the deal beats the hurdle.
- **IRR** (internal rate of return): what discount rate makes NPV exactly 0? IRR > hurdle → accept.

**The NPV trap.** Excel's \`NPV(rate, values)\` assumes the **first value arrives one period from now**. Your year-0 outflow happens *today* and must not be discounted, so:

\`=NPV(rate, year1…yearN) + year0\` ✅  — not \`=NPV(rate, year0…yearN)\` ❌

The wrong version discounts everything one extra year and understates the value. It's one of the most common errors in credit papers.

**IRR** takes the full series including year 0: \`=IRR(C2:C7)\`. It needs at least one negative and one positive flow.

**Real deals don't pay on neat anniversaries.** \`XNPV(rate, values, dates)\` and \`XIRR(values, dates)\` discount by the *actual days* between flows (÷365). XNPV discounts relative to the first date, so year 0 is included directly — no "+C2" trick. A payment that slips three months is worth less, and only the X-versions see that.

**Signs again:** outflows negative, inflows positive — from one consistent point of view (here: the bank's).`,
      workbooks: () => [
        makeBook('Equipment_Finance_Deal.xlsx', [
          {
            name: 'Deal',
            rows: [
              ['Year', 'Date', 'Cash flow', '', 'Hurdle rate', HURDLE],
              ...CF.map((x, i) => [i, DATES[i], x, '', ['NPV', 'IRR', 'Decision', 'XNPV (actual dates)', 'XIRR', ''][i], '']),
            ],
            widths: [60, 100, 120, 20, 150, 120],
            formats: { 1: 'd-mmm-yyyy', 2: '#,##0' },
            styles: { F1: { fmt: '0.00%', fill: '#FFF2CC' }, F2: { fmt: '#,##0' }, F3: { fmt: '0.00%' }, F5: { fmt: '#,##0' }, F6: { fmt: '0.00%' }, E1: { b: true, fill: '#DDEBF7' } },
          },
        ]),
      ],
      start: { cell: 'F2' },
      tasks: [
        {
          id: 't1',
          title: 'NPV at the hurdle rate',
          instruction: 'In **F2** calculate the NPV at the hurdle rate in F1. Discount only years 1–5 and add the year-0 flow undiscounted:\n\n`=NPV(F1,C3:C7)+C2`',
          why: `NPV() discounts its first value by one full period. Year 0 happens today, so it sits outside the function. Including it inside — =NPV(F1,C2:C7) — gives ${Math.round(NPV_WRONG).toLocaleString('en-US')} instead of ${Math.round(NPV_OK).toLocaleString('en-US')}: a ${(Math.abs(NPV_OK - NPV_WRONG) / 1000).toFixed(0)}k error from one cell reference.`,
          hints: ['NPV(rate, value1, …) — values are years 1-5 (C3:C7).', 'Then + C2 (the year-0 outflow, already negative).'],
          check: (c) => {
            if (!/NPV\(/i.test(c.f('F2'))) return 'F2 should use the NPV function.';
            if (approx(c.v('F2'), NPV_WRONG, 1e-6)) return 'That discounts year 0 too. Use =NPV(F1,C3:C7)+C2 — year 0 is today.';
            return approx(c.v('F2'), NPV_OK, 1e-6) ? true : `F2 should be about ${Math.round(NPV_OK).toLocaleString('en-US')}.`;
          },
          solution: [{ set: { F2: '=NPV(F1,C3:C7)+C2' } }],
        },
        {
          id: 't2',
          title: 'IRR',
          instruction: 'In **F3** calculate the deal\'s internal rate of return over all six flows: `=IRR(C2:C7)`.',
          why: 'IRR is the discount rate at which NPV = 0 — the deal\'s own yield. It is easy to communicate ("this deal returns 10.9%") and to compare with the hurdle. Unlike NPV, IRR includes year 0 inside the function.',
          hints: ['IRR takes the whole series, year 0 included.'],
          check: (c) => (/IRR\(/i.test(c.f('F3')) && approx(c.v('F3'), IRR, 1e-5) ? true : `F3 should be =IRR(C2:C7) ≈ ${(IRR * 100).toFixed(2)}%.`),
          solution: [{ set: { F3: '=IRR(C2:C7)' } }],
        },
        {
          id: 't3',
          title: 'Accept or reject',
          instruction: 'In **F4** write the decision rule: `=IF(F3>F1,"Accept","Reject")`.',
          why: 'IRR above hurdle and NPV above zero are two views of the same verdict for a conventional deal (one outflow, then inflows). Putting the rule in a formula means the recommendation flips automatically if someone changes the hurdle or the cash flows — and the reviewer sees exactly which test was applied.',
          hints: ['IF(test, value_if_true, value_if_false).', 'Compare F3 (IRR) with F1 (hurdle) — or test F2>0.'],
          check: (c) =>
            all(
              /^=IF\(/i.test(c.f('F4')) ? true : 'F4 should be an IF formula.',
              lc(c.v('F4')) === lc(DECISION) ? true : `F4 should show "${DECISION}".`,
            ),
          solution: [{ set: { F4: '=IF(F3>F1,"Accept","Reject")' } }],
        },
        {
          id: 't4',
          title: 'XNPV with real dates',
          instruction: 'The payments do not land on neat anniversaries (look at 2028 and 2030). In **F5** discount by actual dates: `=XNPV(F1,C2:C7,B2:B7)`.',
          why: `XNPV measures each flow's time from the first date in days/365, so the late 2028 and 2030 receipts are discounted more. Result: ${Math.round(XNPV).toLocaleString('en-US')} vs ${Math.round(NPV_OK).toLocaleString('en-US')}. Note there is no "+C2": XNPV includes the first flow undiscounted by design.`,
          hints: ['XNPV(rate, values, dates) — values and dates both include year 0.'],
          check: (c) => (/XNPV\(/i.test(c.f('F5')) && approx(c.v('F5'), XNPV, 1e-5) ? true : `F5 should be =XNPV(F1,C2:C7,B2:B7) ≈ ${Math.round(XNPV).toLocaleString('en-US')}.`),
          solution: [{ set: { F5: '=XNPV(F1,C2:C7,B2:B7)' } }],
        },
        {
          id: 't5',
          title: 'XIRR',
          instruction: 'In **F6** compute the date-accurate return: `=XIRR(C2:C7,B2:B7)`.',
          why: 'XIRR is the annualised return given the real timing — what you would quote for an actual loan with irregular payment dates. Delays push it below the neat-period IRR. If it fell under the hurdle, the "Accept" in F4 would be based on an optimistic timing assumption — worth a sentence in the credit paper.',
          hints: ['XIRR(values, dates). No rate argument needed.'],
          check: (c) => (/XIRR\(/i.test(c.f('F6')) && approx(c.v('F6'), XIRR, 1e-4) ? true : `F6 should be =XIRR(C2:C7,B2:B7) ≈ ${(XIRR * 100).toFixed(2)}%.`),
          solution: [{ set: { F6: '=XIRR(C2:C7,B2:B7)' } }],
        },
      ],
    },

    // ------------------------------------------------------------------ L3
    {
      id: 'm15-l3',
      title: 'Delinquency aging buckets',
      summary: 'Bucket loans by days past due with an approximate-match lookup, then summarise with COUNTIFS/SUMIFS.',
      minutes: 11,
      featured: ['VLOOKUP (approx)', 'XLOOKUP', 'IFS', 'COUNTIFS', 'SUMIFS'],
      intro: `Every bank reports delinquency in **aging buckets** by days past due (DPD): Current, 1-29, 30-59, 60-89, 90+. 90+ usually means non-accrual / default, and each step up the ladder drives provisions.

**Two ways to bucket a DPD number:**

1. **Approximate-match lookup** against a small boundary table (lower bound of each bucket, sorted ascending):
   \`=VLOOKUP(E2,$H$2:$I$6,2,TRUE)\` or \`=XLOOKUP(E2,$H$2:$H$6,$I$2:$I$6,,-1)\`
   TRUE / -1 means "find the largest boundary ≤ my value". DPD 45 → boundary 30 → "30-59 DPD".
2. **IFS** with the tests from the top down:
   \`=IFS(E2>=90,"90+ DPD",E2>=60,"60-89 DPD",E2>=30,"30-59 DPD",E2>=1,"1-29 DPD",TRUE,"Current")\`

**Prefer the table** in production: when Risk redefines a bucket you change one cell, not 80 formulas, and the boundaries are visible for audit. Approximate match requires the boundary column **sorted ascending** — unsorted boundaries return wrong buckets *without* an error.

**Common mistakes:** exact match (FALSE / 0) → #N/A for every DPD that isn't exactly a boundary; IFS tests in the wrong order (\`E2>=1\` first catches everything); forgetting $ on the table.

**Then summarise:** COUNTIFS for the number of loans per bucket, SUMIFS for balances, and % of total balance. Finish with a **tie-out**: bucket totals must equal the tape's row count and total balance — a loan that fell through (e.g. a negative or blank DPD) shows up here.`,
      workbooks: () => [
        makeBook('Aging_Report_Nov.xlsx', [
          {
            name: 'Tape',
            rows: [
              ['Loan ID', 'Product', 'Branch', 'Balance', 'DPD', 'Bucket', '', 'Min DPD', 'Bucket', '', 'Bucket', 'Loans', 'Balance', '% of balance'],
              ...AG.map((l, i) => {
                const r: (string | number)[] = [l.id, l.product, l.branch, l.balance, l.dpd];
                if (i < BUCKETS.length) r.push('', '', BUCKETS[i][0], BUCKETS[i][1], '', BUCKETS[i][1]);
                if (i === BUCKETS.length) r.push('', '', '', '', '', 'Total');
                if (i === BUCKETS.length + 2) r.push('', '', '', '', '', 'Tie-out vs tape');
                return r;
              }),
            ],
            widths: [100, 110, 80, 110, 60, 100, 20, 70, 100, 20, 120, 70, 120, 100],
            formats: { 3: '#,##0.00', 12: '#,##0.00', 13: '0.0%' },
            styles: { K7: { b: true }, K9: { b: true } },
          },
        ]),
      ],
      start: { cell: 'F2' },
      tasks: [
        {
          id: 't1',
          title: 'Bucket every loan',
          instruction: `The boundary table is in **H1:I6**. In **F2** look up the bucket for the DPD in E2 with an approximate match, and fill down to **F${AG_LAST}**:\n\n\`=VLOOKUP(E2,$H$2:$I$6,2,TRUE)\``,
          why: 'TRUE (approximate match) returns the row with the largest Min DPD that is ≤ the loan\'s DPD — exactly the definition of a bucket. The table is locked with $ so it stays put as you fill down 80 rows. If Risk moves a boundary, you edit H2:H6 and every loan re-buckets.',
          hints: ['Lock the table: $H$2:$I$6. Column 2 = the bucket name.', 'The last argument must be TRUE (or 1) for approximate match.', 'XLOOKUP alternative: =XLOOKUP(E2,$H$2:$H$6,$I$2:$I$6,,-1).'],
          check: (c) =>
            all(
              formulasMatch(c, `F2:F${AG_LAST}`, /(VLOOKUP|XLOOKUP|LOOKUP|IFS|INDEX)\(/i, 'bucket lookup (VLOOKUP/XLOOKUP/IFS)'),
              valuesEqual(c, `F2:F${AG_LAST}`, agBuckets, 'Bucket'),
            ),
          solution: [{ set: { [`F2:F${AG_LAST}`]: '=VLOOKUP(E2,$H$2:$I$6,2,TRUE)' } }],
        },
        {
          id: 't2',
          title: 'Loans per bucket',
          instruction: `In **L2** count the loans in the bucket named in K2 and fill down to **L6**:\n\n\`=COUNTIFS($F$2:$F$${AG_LAST},K2)\``,
          why: 'Counting by the bucket *label* (K2) means the summary and the tape always use the same definitions. Count matters to collections (how many customers to call); balance matters to provisioning — you need both.',
          hints: ['Criteria range = the Bucket column, locked. Criteria = K2 (relative).'],
          check: (c) =>
            all(
              formulasMatch(c, 'L2:L6', /COUNTIFS?\(/i, 'COUNTIFS'),
              valuesEqual(c, 'L2:L6', BUCKETS.map(([, b]) => bCount(b)), 'Loan count'),
            ),
          solution: [{ set: { 'L2:L6': `=COUNTIFS($F$2:$F$${AG_LAST},K2)` } }],
        },
        {
          id: 't3',
          title: 'Balance per bucket',
          instruction: `In **M2** sum the balances in each bucket and fill down to **M6**:\n\n\`=SUMIFS($D$2:$D$${AG_LAST},$F$2:$F$${AG_LAST},K2)\``,
          why: 'SUMIFS puts the sum range first, then criteria pairs. The 30+ and 90+ balances are the inputs to delinquency ratios and provisions — numbers that go to the board.',
          hints: ['Sum range = Balance (D), criteria range = Bucket (F), criteria = K2.'],
          check: (c) =>
            all(
              formulasMatch(c, 'M2:M6', /SUMIFS?\(/i, 'SUMIFS'),
              valuesEqual(c, 'M2:M6', BUCKETS.map(([, b]) => bSum(b)), 'Balance'),
            ),
          solution: [{ set: { 'M2:M6': `=SUMIFS($D$2:$D$${AG_LAST},$F$2:$F$${AG_LAST},K2)` } }],
        },
        {
          id: 't4',
          title: 'Totals and mix %',
          instruction: 'In **L7** and **M7** total the columns with SUM. In **N2** compute the bucket\'s share of balance, `=M2/$M$7`, and fill down to **N6**.',
          why: 'The mix (e.g. "4.1% of balances are 90+ DPD") is how delinquency is compared across months and portfolios of different sizes. $M$7 keeps the denominator fixed while you fill down.',
          hints: ['L7: =SUM(L2:L6). M7: =SUM(M2:M6).', 'N2: =M2/$M$7, then Ctrl+D to N6.'],
          check: (c) =>
            all(
              /SUM\(/i.test(c.f('L7')) && c.v('L7') === AG.length ? true : `L7 should SUM the counts (= ${AG.length}).`,
              /SUM\(/i.test(c.f('M7')) && approx(c.v('M7'), agTotal) ? true : 'M7 should SUM the bucket balances.',
              formulasMatch(c, 'N2:N6', /\/\s*\$M\$7/i, 'share (/$M$7)'),
              valuesEqual(c, 'N2:N6', BUCKETS.map(([, b]) => bSum(b) / agTotal), '% of balance'),
            ),
          solution: [{ set: { L7: '=SUM(L2:L6)', M7: '=SUM(M2:M6)', 'N2:N6': '=M2/$M$7' } }],
        },
        {
          id: 't5',
          title: 'Tie the buckets back to the tape',
          instruction: `Prove nothing fell through the cracks. In **L9** enter \`=L7-COUNTA(A2:A${AG_LAST})\` and in **M9** \`=M7-SUM(D2:D${AG_LAST})\`. Both must be **0**.`,
          why: 'If a loan had a blank or negative DPD, the lookup would return #N/A or no bucket and quietly drop out of the summary — the total would be short. These two cells catch that instantly. Every summary you build should end with a tie-out row like this.',
          hints: ['Bucket total minus tape total. COUNTA counts the Loan IDs; SUM adds the balances.'],
          check: (c) =>
            all(
              /COUNTA\(/i.test(c.f('L9')) && approx(c.v('L9'), 0) ? true : 'L9 should be L7 minus COUNTA of the Loan IDs, and show 0.',
              /SUM\(/i.test(c.f('M9')) && approx(c.v('M9'), 0) ? true : 'M9 should be M7 minus SUM of the tape balances, and show 0.',
            ),
          solution: [{ set: { L9: `=L7-COUNTA(A2:A${AG_LAST})`, M9: `=M7-SUM(D2:D${AG_LAST})` } }],
        },
      ],
    },

    // ------------------------------------------------------------------ L4
    {
      id: 'm15-l4',
      title: 'Month-over-month variance',
      summary: 'Change in $ and %, IFERROR for new branches, materiality flags, and why total % ≠ average %.',
      minutes: 9,
      featured: ['IFERROR', 'ABS', 'IF', 'SUM'],
      intro: `Month-end commentary starts with a variance table: **this month vs last month**, in dollars and percent, with the big movers flagged for explanation.

- **$ change** = current − prior (\`=C2-B2\`). Positive = growth.
- **% change** = $ change ÷ **prior** (\`=D2/B2\`). Always divide by the *base* period.
- A brand-new branch has a prior of 0 → **#DIV/0!**. Wrap it: \`=IFERROR(D2/B2,"New")\`. A label is more honest than 0% or a fake 100%.

**Materiality flags.** Nobody explains a $3k move on a $50M book. Flag only moves above a threshold — and test the **absolute** value, because a $5M *drop* needs explaining as much as a $5M rise: \`=IF(ABS(D2)>=$I$1,"Explain","OK")\`. Keep the threshold in a cell (I1) so it can be changed and audited.

**Totals:** total % change = total $ change ÷ total prior — **never the average of the branch percentages** (a small branch growing 50% would dominate).

**IFERROR caution:** it hides *every* error, including typos and broken links. Use it only around the specific calculation where you expect a particular error (here: division by a zero prior), not as a blanket around whole models.`,
      workbooks: () => [
        makeBook('Branch_Balances_MoM.xlsx', [
          {
            name: 'Variance',
            rows: [
              ['Branch', 'Oct balance', 'Nov balance', 'Change $', 'Change %', 'Flag', '', 'Threshold $', THRESH],
              ...VR.map((x) => [x.b, x.oct, x.nov]),
              ['Total'],
            ],
            widths: [90, 120, 120, 120, 90, 80, 20, 100, 110],
            formats: { 1: '#,##0', 2: '#,##0', 3: '#,##0', 4: '0.0%', 8: '#,##0' },
            styles: { [`A${VLAST + 1}`]: { b: true }, I1: { fill: '#FFF2CC', fmt: '#,##0', b: true } },
          },
        ]),
      ],
      start: { cell: 'D2' },
      tasks: [
        {
          id: 't1',
          title: 'Change in dollars',
          instruction: `In **D2** enter \`=C2-B2\` and fill down to **D${VLAST}**.`,
          why: 'Current minus prior, so growth is positive and run-off is negative — the sign convention every reader expects in a variance table.',
          hints: ['Select D2:D' + VLAST + ' and press Ctrl+D after typing D2.'],
          check: (c) =>
            all(
              formulasMatch(c, `D2:D${VLAST}`, /C\d+\s*-\s*B\d+/i, 'Nov − Oct'),
              valuesEqual(c, `D2:D${VLAST}`, VR.map((x) => x.nov - x.oct), 'Change $'),
            ),
          solution: [{ set: { [`D2:D${VLAST}`]: '=C2-B2' } }],
        },
        {
          id: 't2',
          title: 'Change in percent (safely)',
          instruction: `In **E2** enter \`=IFERROR(D2/B2,"New")\` and fill down to **E${VLAST}**. SEA-01 opened in November — what does it show?`,
          why: 'Divide by the prior month (B), the base. SEA-01 had no October balance, so D/B is a division by zero; IFERROR replaces that one expected error with a meaningful label. Without it, the #DIV/0! would also break any total or chart built on column E.',
          hints: ['IFERROR(calculation, what to show instead).', '=IFERROR(D2/B2,"New")'],
          check: (c) => {
            const bad = formulasMatch(c, `E2:E${VLAST}`, /IFERROR\(\s*D\d+\s*\/\s*B\d+/i, 'IFERROR(D/B, …)');
            if (bad !== true) return bad;
            for (let i = 0; i < VN; i++) {
              const v = c.v(`E${i + 2}`);
              if (VR[i].oct === 0) {
                if (isErrV(v) || typeof v === 'number') return `E${i + 2} (${VR[i].b}) should show a label such as "New", not a number or error.`;
              } else if (!approx(v, (VR[i].nov - VR[i].oct) / VR[i].oct, 1e-6)) return `E${i + 2} should be the change ÷ the October balance.`;
            }
            return true;
          },
          solution: [{ set: { [`E2:E${VLAST}`]: '=IFERROR(D2/B2,"New")' } }],
        },
        {
          id: 't3',
          title: 'Flag material movers',
          instruction: `In **F2** flag moves of at least the threshold in **I1** — up *or* down — and fill down:\n\n\`=IF(ABS(D2)>=$I$1,"Explain","OK")\``,
          why: 'ABS makes a −$5M run-off as visible as a +$5M increase. The threshold lives in I1 (locked with $) so management can change materiality without anyone editing formulas — and the auditor can see what it was.',
          hints: ['ABS(D2) strips the sign.', 'Lock the threshold: $I$1.'],
          check: (c) =>
            all(
              formulasMatch(c, `F2:F${VLAST}`, /ABS\(/i, 'ABS-based flag'),
              formulasMatch(c, `F2:F${VLAST}`, /\$I\$1/i, 'threshold reference $I$1'),
              valuesEqual(c, `F2:F${VLAST}`, VR.map((x) => (Math.abs(x.nov - x.oct) >= THRESH ? 'Explain' : 'OK')), 'Flag'),
            ),
          solution: [{ set: { [`F2:F${VLAST}`]: '=IF(ABS(D2)>=$I$1,"Explain","OK")' } }],
        },
        {
          id: 't4',
          title: 'Portfolio total',
          instruction: `In row **${VLAST + 1}** total B, C and D with SUM (\`=SUM(B2:B${VLAST})\` etc.). In **E${VLAST + 1}** compute the portfolio % change as total change ÷ total prior: \`=D${VLAST + 1}/B${VLAST + 1}\`.`,
          why: `The portfolio grew ${(((totNov - totOct) / totOct) * 100).toFixed(1)}%. Averaging the branch percentages would give a different (wrong) answer: it weights a small branch the same as a big one, and here it would choke on SEA-01's "New" anyway. Totals are always recomputed from totals.`,
          hints: [`B${VLAST + 1}: =SUM(B2:B${VLAST}), then fill right to D${VLAST + 1}.`, 'Percent = D total / B total — not AVERAGE(E2:E…).'],
          check: (c) => {
            const r = VLAST + 1;
            return all(
              /SUM\(/i.test(c.f(`B${r}`)) && approx(c.v(`B${r}`), totOct) ? true : `B${r} should SUM the October balances.`,
              /SUM\(/i.test(c.f(`C${r}`)) && approx(c.v(`C${r}`), totNov) ? true : `C${r} should SUM the November balances.`,
              /SUM\(|C\d+\s*-\s*B\d+/i.test(c.f(`D${r}`)) && approx(c.v(`D${r}`), totNov - totOct) ? true : `D${r} should be the total change.`,
              /AVERAGE/i.test(c.f(`E${r}`)) ? 'Don\'t average the percentages — divide the total change by the total prior.' : true,
              /D\d+\s*\/\s*B\d+/i.test(c.f(`E${r}`)) && approx(c.v(`E${r}`), (totNov - totOct) / totOct, 1e-6) ? true : `E${r} should be D${r}/B${r}.`,
            );
          },
          solution: [{ set: { [`B${VLAST + 1}:D${VLAST + 1}`]: `=SUM(B2:B${VLAST})`, [`E${VLAST + 1}`]: `=D${VLAST + 1}/B${VLAST + 1}` } }],
        },
      ],
    },

    // ------------------------------------------------------------------ L5
    {
      id: 'm15-l5',
      title: 'Data-quality control checks',
      summary: 'COUNTBLANK, ISNUMBER, duplicate-ID tests and a control-total tie-out — before any number leaves your desk.',
      minutes: 11,
      featured: ['COUNTBLANK', 'ISNUMBER', 'COUNTIF', 'AND'],
      intro: `Data-lake extracts break in boring, predictable ways. A **controls sheet** catches them before your analysis does:

- **Completeness:** blank critical fields — \`=COUNTBLANK(range)\`.
- **Validity:** numbers that arrived as **text** ("12500.00" left-aligned, often from CSV/ODBC). They look fine but **SUM, AVERAGE and pivots skip them silently**. \`=ISNUMBER(E2)\` returns FALSE for them (and for blanks).
- **Uniqueness:** a key such as Loan ID must appear once — \`=COUNTIF($A$2:$A$41,A2)>1\` flags duplicates.
- **Reconciliation:** the tape total must equal the **control total** published by the source system. The difference must be 0, or explained to the cent.

**Why per-row flags *and* a summary?** The summary (one number per control) tells you *whether* there's a problem; the flag column tells you *which rows* — filter on FALSE/TRUE and send the list to the data owner.

**One master switch:** \`=AND(all controls = 0)\` → TRUE/FALSE at the top of the sheet. Reviewers look there first; conditional-format it red/green.

**Common mistakes:** checking only the total (offsetting errors cancel out); comparing money with \`=B7=0\` when floating-point leaves 0.0000001 (use \`ABS(B7)<0.01\` or ROUND); fixing the data by hand without logging what you changed.`,
      workbooks: () => [
        makeBook('Loan_Extract_Controls.xlsx', [
          {
            name: 'Tape',
            rows: [['Loan ID', 'Customer', 'Product', 'Branch', 'Balance', 'Bal is number?', 'Dup ID?'], ...DQ.map((x) => [x.id, x.cust, x.product, x.branch, x.bal])],
            widths: [100, 80, 110, 80, 110, 110, 80],
            formats: { 4: '#,##0.00' },
          },
          {
            name: 'Controls',
            rows: [
              ['Control', 'Result'],
              ['Blank balances'],
              ['Balances not numeric (blank or text)'],
              ['Duplicate ID rows'],
              ['Tape total (SUM)'],
              ['Source system control total', CONTROL_TOTAL],
              ['Difference (tape − control)'],
              ['All controls pass?'],
            ],
            widths: [260, 140],
            styles: { B5: { fmt: '#,##0.00' }, B6: { fmt: '#,##0.00', fill: '#FFF2CC' }, B7: { fmt: '#,##0.00' }, A8: { b: true }, B8: { b: true } },
          },
        ]),
      ],
      start: { sheet: 'Controls', cell: 'B2' },
      tasks: [
        {
          id: 't1',
          title: 'Completeness: blank balances',
          instruction: `On **Controls**, in **B2** count blank balances on the tape: \`=COUNTBLANK(Tape!E2:E${DQ_LAST})\`.`,
          why: 'A blank balance is a loan the extract lost a value for. It will be excluded from every total without any warning. Counting them is the first, cheapest control.',
          hints: ['COUNTBLANK(range). Point it at the Balance column on the Tape sheet.'],
          check: (c) => (/COUNTBLANK\(/i.test(c.f('Controls!B2')) && c.v('Controls!B2') === BLANK_AT.length ? true : `Controls!B2 should be =COUNTBLANK(Tape!E2:E${DQ_LAST}) — expect ${BLANK_AT.length}.`),
          solution: [{ set: { 'Controls!B2': `=COUNTBLANK(Tape!E2:E${DQ_LAST})` } }],
        },
        {
          id: 't2',
          title: 'Validity: numbers stored as text',
          instruction: `On **Tape**, in **F2** enter \`=ISNUMBER(E2)\` and fill down to **F${DQ_LAST}**. Then on **Controls**, in **B3** count the FALSE results: \`=COUNTIF(Tape!F2:F${DQ_LAST},FALSE)\`.`,
          why: `You will find ${isNumFlags.filter((x) => !x).length} FALSE rows: the ${BLANK_AT.length} blanks plus one balance that arrived as text (row ${TEXT_AT + 2}). It looks like a number, but SUM ignores it — the classic "the totals are slightly off and nobody knows why". The flag column shows you exactly which row to fix.`,
          hints: ['ISNUMBER returns TRUE for real numbers only.', `COUNTIF(range, FALSE) counts the FALSE flags (no quotes around FALSE).`],
          check: (c) =>
            all(
              formulasMatch(c, `Tape!F2:F${DQ_LAST}`, /ISNUMBER\(\s*E\d+\s*\)/i, 'ISNUMBER(E…)'),
              valuesEqual(c, `Tape!F2:F${DQ_LAST}`, isNumFlags, 'Bal is number?'),
              /COUNTIF/i.test(c.f('Controls!B3')) && c.v('Controls!B3') === isNumFlags.filter((x) => !x).length ? true : `Controls!B3 should count the FALSE flags (expect ${isNumFlags.filter((x) => !x).length}).`,
            ),
          solution: [{ set: { [`Tape!F2:F${DQ_LAST}`]: '=ISNUMBER(E2)', 'Controls!B3': `=COUNTIF(Tape!F2:F${DQ_LAST},FALSE)` } }],
        },
        {
          id: 't3',
          title: 'Uniqueness: duplicate Loan IDs',
          instruction: `On **Tape**, in **G2** enter \`=COUNTIF($A$2:$A$${DQ_LAST},A2)>1\` and fill down. On **Controls**, in **B4**: \`=COUNTIF(Tape!G2:G${DQ_LAST},TRUE)\`.`,
          why: `Two rows share ${DQ[DUP_FROM].id}. Either a loan was double-loaded (overstating exposure) or two different loans got the same key (and lookups will return the wrong one). Both rows are flagged so you can compare them side by side.`,
          hints: ['Lock the ID range with $, keep A2 relative.', 'COUNTIF(range, TRUE) counts the flagged rows.'],
          check: (c) =>
            all(
              formulasMatch(c, `Tape!G2:G${DQ_LAST}`, /COUNTIF\(\$A\$2:\$A\$\d+,A\d+\)>1/i, 'COUNTIF($A$2:$A$…,A2)>1'),
              valuesEqual(c, `Tape!G2:G${DQ_LAST}`, dupFlags, 'Dup ID?'),
              /COUNTIF/i.test(c.f('Controls!B4')) && c.v('Controls!B4') === dupFlags.filter(Boolean).length ? true : `Controls!B4 should count the TRUE flags (expect ${dupFlags.filter(Boolean).length}).`,
            ),
          solution: [{ set: { [`Tape!G2:G${DQ_LAST}`]: `=COUNTIF($A$2:$A$${DQ_LAST},A2)>1`, 'Controls!B4': `=COUNTIF(Tape!G2:G${DQ_LAST},TRUE)` } }],
        },
        {
          id: 't4',
          title: 'Reconcile to the control total',
          instruction: `In **B5** total the tape: \`=SUM(Tape!E2:E${DQ_LAST})\`. In **B7** compute the difference to the source system's control total: \`=B5-B6\`.`,
          why: `The gap is ${missing.toLocaleString('en-US', { minimumFractionDigits: 2 })} — exactly the two blank balances plus the text-stored one. When a reconciliation breaks, the other controls usually tell you why; that is why you build all of them, not just the total. Never "plug" the difference: fix or document the rows.`,
          hints: ['SUM silently skips text and blanks — which is the point of this exercise.', 'B7: =B5-B6'],
          check: (c) =>
            all(
              /SUM\(.*Tape!/i.test(c.f('Controls!B5')) && approx(c.v('Controls!B5'), TAPE_SUM) ? true : `Controls!B5 should SUM Tape!E2:E${DQ_LAST}.`,
              c.f('Controls!B7').startsWith('=') && approx(c.v('Controls!B7'), -missing) ? true : 'Controls!B7 should be =B5-B6.',
            ),
          solution: [{ set: { 'Controls!B5': `=SUM(Tape!E2:E${DQ_LAST})`, 'Controls!B7': '=B5-B6' } }],
        },
        {
          id: 't5',
          title: 'The master switch',
          instruction: 'In **B8** combine every control into one TRUE/FALSE:\n\n`=AND(B2=0,B3=0,B4=0,ABS(B7)<0.01)`\n\nToday it should say FALSE — this extract is not fit to use yet.',
          why: 'One cell that says whether the data can be trusted. ABS(B7)<0.01 instead of B7=0 avoids false alarms from floating-point dust on money. In production you would put this at the top of the report and colour it with conditional formatting — and never publish while it reads FALSE.',
          hints: ['AND returns TRUE only if every test is TRUE.', 'Use ABS(B7)<0.01 for the money comparison.'],
          check: (c) =>
            all(
              /^=AND\(/i.test(c.f('Controls!B8')) ? true : 'Controls!B8 should be an AND(...) of all the controls.',
              /B2/i.test(c.f('Controls!B8')) && /B3/i.test(c.f('Controls!B8')) && /B4/i.test(c.f('Controls!B8')) && /B7/i.test(c.f('Controls!B8')) ? true : 'Include all four controls: B2, B3, B4 and B7.',
              c.v('Controls!B8') === false ? true : 'Controls!B8 should evaluate to FALSE for this extract.',
            ),
          solution: [{ set: { 'Controls!B8': '=AND(B2=0,B3=0,B4=0,ABS(B7)<0.01)' } }],
        },
      ],
    },
  ],
  quiz: [
    {
      kind: 'formula',
      q: 'Monthly payment (as a positive number) on 250,000 at 6% annual over 360 months. Rate in B1, months in B2, amount in B3.',
      grid: [['Rate', 'Months', 'Amount'], [0.06, 360, 250000]],
      at: 'D2',
      expect: (250000 * 0.005) / (1 - Math.pow(1.005, -360)),
      model: '=PMT(A2/12,B2,-C2)',
      explain: 'Monthly rate = annual/12; the loan entered as negative gives a positive payment (≈ 1,498.88).',
      mustUse: ['PMT'],
    },
    {
      kind: 'mc',
      q: '=PMT(0.06/12,360,250000) returns -1,498.88. Why negative?',
      options: ['The loan is underwater', 'Excel treats the 250,000 received as an inflow, so payments are outflows', 'Rates must be negative', 'It is a rounding artefact'],
      answer: 1,
      explain: 'Cash-flow sign convention: money in is positive, money out negative. Enter -pv or negate the result.',
    },
    {
      kind: 'formula',
      q: 'Interest portion (positive) of payment 1 on the same loan.',
      grid: [['Rate', 'Months', 'Amount'], [0.06, 360, 250000]],
      at: 'D2',
      expect: 1250,
      model: '=-IPMT(A2/12,1,B2,C2)',
      explain: 'Period 1 interest = 250,000 × 0.5% = 1,250. IPMT returns it negative with a positive pv, hence the leading minus.',
      mustUse: ['IPMT'],
    },
    {
      kind: 'mc',
      q: 'Year-0 flow in B2, years 1-5 in B3:B7, rate in E1. Which formula gives the correct NPV?',
      options: ['=NPV(E1,B2:B7)', '=NPV(E1,B3:B7)+B2', '=NPV(E1,B3:B7)', '=IRR(B2:B7)'],
      answer: 1,
      explain: 'NPV() discounts its first value by one period, so year 0 must sit outside and be added undiscounted.',
    },
    {
      kind: 'formula',
      q: 'IRR of the deal (year 0 to 3).',
      grid: [['Year', 'Cash flow'], [0, -1000], [1, 400], [2, 400], [3, 400]],
      at: 'D2',
      expect: 0.09701025,
      model: '=IRR(B2:B5)',
      explain: 'IRR includes year 0 inside the function. ≈ 9.70%.',
      mustUse: ['IRR'],
    },
    {
      kind: 'formula',
      q: 'Bucket the DPD in A2 with IFS: 90+ → "90+", 30+ → "30-89", 1+ → "1-29", else "Current".',
      grid: [['DPD'], [45]],
      at: 'B2',
      expect: '30-89',
      model: '=IFS(A2>=90,"90+",A2>=30,"30-89",A2>=1,"1-29",TRUE,"Current")',
      explain: 'Test from the highest bucket down; TRUE at the end is the catch-all.',
      mustUse: ['IFS', 'IF', 'VLOOKUP', 'XLOOKUP', 'LOOKUP'],
    },
    {
      kind: 'mc',
      q: 'Your bucket formula is =VLOOKUP(E2,$H$2:$I$6,2,FALSE). What happens to a loan with DPD 45?',
      options: ['Returns "30-59"', 'Returns #N/A — exact match only finds 0, 1, 30, 60 or 90', 'Returns "Current"', 'Returns 0'],
      answer: 1,
      explain: 'Bucketing needs approximate match (TRUE, or XLOOKUP match_mode -1) against ascending lower bounds.',
    },
    {
      kind: 'formula',
      q: '% change from Oct (B2) to Nov (C2); show "New" if Oct is 0.',
      grid: [['Branch', 'Oct', 'Nov'], ['SEA-01', 0, 12500000]],
      at: 'D2',
      expect: 'New',
      model: '=IFERROR((C2-B2)/B2,"New")',
      explain: 'Division by a zero prior gives #DIV/0!; IFERROR swaps that expected error for a label.',
      mustUse: ['IFERROR', 'IF'],
    },
    {
      kind: 'mc',
      q: 'The tape SUM is 12,500 below the source control total, but no balances are blank. Most likely cause?',
      options: ['SUM rounding', 'A balance stored as text, which SUM skips', 'A duplicate ID', 'The control total is wrong'],
      answer: 1,
      explain: 'Text-numbers look normal but are ignored by SUM. ISNUMBER flags them.',
    },
    {
      kind: 'keys',
      q: 'You typed the first row of a schedule and selected it plus 35 rows below. Fill the formulas down.',
      cmd: 'fill.down',
      keys: 'Ctrl+D',
      explain: 'Ctrl+D copies the top row of the selection into every row below, shifting relative references.',
    },
  ],
};
