// ship.revenue — from a price and a number of copies to money in the developer's account. Every
// input except the Valve share and the Steam Direct fee is an assumption the learner sets. The share
// is the standard one (30% of adjusted gross revenue up to US$10M, 25% from 10M to 50M, 20% above);
// the US$100 fee is paid back once the game passes US$1,000 of adjusted gross revenue.
import { useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Slider, Readout, FigureLayout, Bars } from '../kit';
import { money } from './common';

/** Valve's standard share on lifetime adjusted gross revenue, applied in tiers. */
export function valveShare(agr: number) {
  const t1 = Math.min(agr, 10e6);
  const t2 = Math.min(Math.max(agr - 10e6, 0), 40e6);
  const t3 = Math.max(agr - 50e6, 0);
  return 0.3 * t1 + 0.25 * t2 + 0.2 * t3;
}

export function RevenueCalc({ spec }: { spec: VizSpec }) {
  const [price, setPrice] = useState((spec.price as number) ?? 14.99);
  const [logUnits, setLogUnits] = useState(Math.log10((spec.units as number) ?? 5000));
  const [regional, setRegional] = useState(25);
  const [discount, setDiscount] = useState(15);
  const [vat, setVat] = useState(10);
  const [refunds, setRefunds] = useState(5);
  const units = Math.round(Math.pow(10, logUnits));

  const list = price * units;
  const afterPricing = list * (1 - regional / 100) * (1 - discount / 100);
  const afterTax = afterPricing * (1 - vat / 100);
  const agr = afterTax * (1 - refunds / 100); // adjusted gross revenue, as modelled here
  const share = valveShare(agr);
  const fee = 100;
  const recouped = agr >= 1000 ? 100 : 0;
  const net = agr - share - fee + recouped;
  const perUnit = units > 0 ? net / units : 0;
  const effShare = agr > 0 ? share / agr : 0.3;

  return (
    <FigureLayout
      side={
        <>
          <Slider label="price (US$)" value={price} min={0.99} max={39.99} step={1} onChange={(v) => setPrice(Math.round(v) - 0.01)} fmt={(v) => v.toFixed(2)} />
          <Slider label="copies sold" value={logUnits} min={1} max={6} step={0.01} onChange={setLogUnits} fmt={() => units.toLocaleString('en-US')} />
          <Slider label="regional pricing" value={regional} min={0} max={50} step={1} onChange={setRegional} fmt={(v) => '−' + v + '%'} />
          <Slider label="avg. discount" value={discount} min={0} max={60} step={1} onChange={setDiscount} fmt={(v) => '−' + v + '%'} />
          <Slider label="sales tax / VAT" value={vat} min={0} max={25} step={1} onChange={setVat} fmt={(v) => v + '%'} />
          <Slider label="refunds" value={refunds} min={0} max={25} step={1} onChange={setRefunds} fmt={(v) => v + '%'} />
          <Readout
            rows={[
              ['\\text{adjusted gross}', money(agr)],
              ['\\text{Valve share}', `${money(share)} (${(effShare * 100).toFixed(1)}%)`],
              ['\\text{Steam Direct fee}', recouped ? 'US$100 paid, recouped' : 'US$100 paid, not recouped'],
              ['\\text{net, before income tax}', money(net)],
              ['\\text{per copy}', `US$${perUnit.toFixed(2)}`],
            ]}
          />
        </>
      }
      below={
        <div className="ship-note">
          Assumptions are yours: the regional, discount, tax and refund sliders stand for averages over all sales, and none of them is a statistic about Steam. Income tax, any publisher or engine share, and currency conversion come after this. The Valve share and the fee are the standard Steam Direct terms.
        </div>
      }
    >
      <div className="ship-wide">
        <Bars
          data={[
            { label: 'list × copies', value: list },
            { label: 'after pricing', value: afterPricing },
            { label: 'after tax', value: afterTax },
            { label: 'after refunds', value: agr },
            { label: 'Valve share', value: share, color: 'var(--c-v)' },
            { label: 'net to you', value: Math.max(net, 0), color: 'var(--accent)' },
          ]}
          width={520}
          height={230}
          fmt={(v) => (v >= 1e6 ? 'US$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e4 ? 'US$' + (v / 1e3).toFixed(0) + 'k' : money(v))}
        />
      </div>
    </FigureLayout>
  );
}
