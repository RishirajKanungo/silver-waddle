// rpg.shop — the economy behind shop prices for r03-3. Gold per fight from drops (EnemyData.gold_reward)
// and sold materials, fights per minute, potions bought per fight as a sink; cumulative gold over play
// time against the shop's prices, and the minutes to afford each item.
import { useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Slider, SegControl, Toggle, FigureLayout, LinePlot } from '../kit';
import { Icon } from './common';
import { AREA_ECON, fightGold, item, type AreaId } from './items';
import { ENEMIES } from './model';

const STOCK = ['potion', 'leather_vest', 'iron_sword', 'chain_mail', 'swift_band', 'power_ring', 'guard_amulet', 'star_rod', 'rune_blade'];
const POTION_PRICE = 50;
const MINUTES = 120;

export function ShopEconomy({ spec }: { spec: VizSpec }) {
  const [area, setArea] = useState<AreaId>((spec.area as AreaId) ?? 'field');
  const [rate, setRate] = useState(1.5);
  const [potions, setPotions] = useState(0);
  const [sell, setSell] = useState(true);
  const [blade, setBlade] = useState(1500);
  const drops = fightGold(area);
  const mats = sell ? AREA_ECON[area].materials : 0;
  const sink = potions * POTION_PRICE;
  const perFight = drops + mats - sink;
  const perMinute = perFight * rate;
  const pts: [number, number][] = Array.from({ length: MINUTES + 1 }, (_, m) => [m, Math.max(0, perMinute * m)]);
  const price = (id: string) => (id === 'rune_blade' ? blade : item(id).price);
  const minutes = (p: number) => (perMinute > 0 ? Math.ceil(p / perMinute) : Infinity);
  const yMax = Math.max(1700, ...STOCK.map(price)) * 1.05;
  return (
    <FigureLayout
      side={
        <>
          <SegControl label="area" value={area} options={(Object.keys(AREA_ECON) as AreaId[]).map((a) => ({ v: a, label: AREA_ECON[a].label }))} onChange={setArea} />
          <div className="rpg-muted">
            a fight: {AREA_ECON[area].enemies.map((e) => `${ENEMIES[e].name} ${ENEMIES[e].gold} G`).join(' + ')} = {drops} G
          </div>
          <Slider label="fights / min" value={rate} min={0.5} max={4} step={0.1} onChange={setRate} fmt={(v) => v.toFixed(1)} />
          <Slider label="potions / fight" value={potions} min={0} max={1} step={0.05} onChange={setPotions} fmt={(v) => v.toFixed(2)} />
          <Toggle label={`sell materials (+${AREA_ECON[area].materials.toFixed(2)} G a fight)`} value={sell} onChange={setSell} />
          <Slider label="Rune Blade price" value={blade} min={300} max={3000} step={50} onChange={setBlade} fmt={(v) => v.toFixed(0)} />
          <div className="readout">
            <div className="readout-row">
              <span>net per fight</span>
              <span className="rpg-mono">{perFight.toFixed(2)} G</span>
            </div>
            <div className="readout-row">
              <span>per hour</span>
              <span className="rpg-mono">{Math.round(perMinute * 60)} G</span>
            </div>
            <div className="readout-row">
              <span>potions take</span>
              <span className="rpg-mono">{drops + mats > 0 ? Math.round((100 * sink) / (drops + mats)) : 0}%</span>
            </div>
          </div>
        </>
      }
    >
      <div className="rpg-col">
        <LinePlot
          series={[{ pts, color: 'var(--accent)', label: 'gold (after potions)' }]}
          x={[0, MINUTES]}
          y={[0, yMax]}
          height={220}
          xlabel="minutes of play"
          ylabel="gold"
          hlines={STOCK.filter((id) => id !== 'potion').map((id) => ({ y: price(id), color: id === 'rune_blade' ? 'var(--c-v)' : 'var(--muted)' }))}
          legend="tl"
        />
        <table className="rpg-table">
          <thead>
            <tr>
              <th>item</th>
              <th>buy</th>
              <th>sell</th>
              <th>minutes to afford</th>
            </tr>
          </thead>
          <tbody>
            {STOCK.map((id) => {
              const it = item(id);
              const m = minutes(price(id));
              return (
                <tr key={id} className={id === 'rune_blade' ? 'sel' : ''}>
                  <td>
                    <span className="rpg-row" style={{ gap: 6 }}>
                      <Icon name={it.icon} scale={1} /> {it.name}
                    </span>
                  </td>
                  <td>{price(id)}</td>
                  <td>{Math.floor(price(id) * 0.5)}</td>
                  <td className={m <= 30 ? 'rpg-up' : m > 90 ? 'rpg-down' : ''}>{Number.isFinite(m) ? m : 'never'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </FigureLayout>
  );
}
