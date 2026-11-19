// rpg.shard — the learning simulator for r02-2. Fight N battles in an area: every socketed shard earns
// the battle's AP times the socket's growth multiplier (Loadout.award_ap), and each use of the weapon's
// ability adds proficiency (AbilityBook.record_use) until it is learned for good.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Slider, SegControl, Toggle, FigureLayout, LinePlot } from '../kit';
import { SHARDS, shardLevel, GEAR, ENEMIES, type ShardDef } from './model';

const AREAS = {
  field: { label: 'field', enemies: ['slime', 'bat'] as const },
  ruins: { label: 'ruins', enemies: ['skeleton', 'skeleton'] as const },
  dungeon: { label: 'dungeon', enemies: ['skeleton', 'skeleton', 'bat'] as const },
};
type AreaId = keyof typeof AREAS;
const WEAPONS = { iron_sword: 20, rune_blade: 10 } as const;
type WeaponId = keyof typeof WEAPONS;
const SHARD_IDS = ['fire', 'heal', 'hp_up', 'elemental'];
const MAX_BATTLES = 80;
const SHARD_LIST = SHARD_IDS.map((id) => SHARDS.find((s) => s.id === id)!) as ShardDef[];

export function ShardLearning({ spec }: { spec: VizSpec }) {
  const [area, setArea] = useState<AreaId>((spec.area as AreaId) ?? 'field');
  const [weapon, setWeapon] = useState<WeaponId>('iron_sword');
  const [uses, setUses] = useState(1);
  const [growth2, setGrowth2] = useState(false);
  const [battles, setBattles] = useState(40);
  const apPerBattle = AREAS[area].enemies.reduce((a, e) => a + ENEMIES[e].ap, 0);
  const mult = growth2 ? 2 : 1;
  const perUse = WEAPONS[weapon];
  const teaches = GEAR.find((g) => g.id === weapon)!.teaches!;
  const shards = SHARD_LIST;

  const { events, apPts, profPts } = useMemo(() => {
    const ev: { b: number; msg: string }[] = [];
    const ap: [number, number][] = [];
    const prof: [number, number][] = [];
    let total = 0, points = 0, learned = false;
    const levels = shards.map(() => 1);
    for (let b = 0; b <= MAX_BATTLES; b++) {
      if (b > 0) {
        // during the battle: each use of the weapon's ability (AbilityBook.record_use)
        for (let u = 0; u < uses && !learned; u++) {
          points = Math.min(100, points + perUse);
          if (points >= 100) {
            learned = true;
            ev.push({ b, msg: `Kai learned ${teaches}` });
          }
        }
        // after the battle: award_ap(amount) to every socketed shard
        total += apPerBattle * mult;
        shards.forEach((s, k) => {
          const lv = shardLevel(s, total);
          if (lv > levels[k]) {
            levels[k] = lv;
            ev.push({ b, msg: `${s.name} reached level ${lv}${s.abilities[lv - 1] ? ': ' + s.abilities[lv - 1] : s.kind === 'PASSIVE' ? `: ${s.mods.map((m) => `+${m.value * lv}${m.kind === 'PERCENT' ? '%' : ''}`).join('')}` : ''}` });
          }
        });
      }
      ap.push([b, total]);
      prof.push([b, points]);
    }
    return { events: ev, apPts: ap, profPts: prof };
  }, [uses, perUse, apPerBattle, mult, teaches, shards]);

  const apNow = apPts[battles][1];
  const profNow = profPts[battles][1];
  const colours = ['var(--c-v)', 'var(--c-w)', 'var(--c-u)', 'var(--violet)'];
  const hl = shards.flatMap((s, k) => s.apThresholds.map((t) => ({ y: t, color: colours[k] })));
  return (
    <FigureLayout
      side={
        <>
          <SegControl label="area" value={area} options={(Object.keys(AREAS) as AreaId[]).map((a) => ({ v: a, label: AREAS[a].label }))} onChange={setArea} />
          <div className="rpg-muted">
            {AREAS[area].enemies.map((e) => `${ENEMIES[e].name} ${ENEMIES[e].ap}`).join(' + ')} = {apPerBattle} AP per battle
          </div>
          <SegControl label="weapon" value={weapon} options={[{ v: 'iron_sword', label: 'Iron Sword' }, { v: 'rune_blade', label: 'Rune Blade' }]} onChange={setWeapon} />
          <div className="rpg-muted">
            teaches {teaches}: +{perUse} per use
          </div>
          <Slider label="uses / battle" value={uses} min={0} max={4} step={1} onChange={setUses} fmt={(v) => v.toFixed(0)} />
          <Toggle label="×2 growth sockets" value={growth2} onChange={setGrowth2} />
          <Slider label="battles" value={battles} min={0} max={MAX_BATTLES} step={1} onChange={setBattles} fmt={(v) => v.toFixed(0)} />
          <div className="readout">
            <div className="readout-row">
              <span>AP per shard</span>
              <span className="rpg-mono">{apNow}</span>
            </div>
            <div className="readout-row">
              <span>{teaches}</span>
              <span className="rpg-mono">{profNow}%</span>
            </div>
          </div>
        </>
      }
    >
      <div className="rpg-col">
        <table className="rpg-table">
          <thead>
            <tr>
              <th>shard</th>
              <th>thresholds</th>
              <th>level</th>
              <th>next</th>
            </tr>
          </thead>
          <tbody>
            {shards.map((s, k) => {
              const lv = shardLevel(s, apNow);
              const next = s.apThresholds[lv - 1];
              return (
                <tr key={s.id}>
                  <td>
                    <span style={{ color: colours[k] }}>●</span> {s.name}
                  </td>
                  <td>{s.apThresholds.join(', ')}</td>
                  <td>
                    <b>{lv}</b>
                  </td>
                  <td>{next ? `${next - apNow} AP (${Math.ceil((next - apNow) / (apPerBattle * mult))} battles)` : 'max'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <LinePlot series={[{ pts: apPts, color: 'var(--fg)', label: 'AP of every socketed shard' }]} x={[0, MAX_BATTLES]} y={[0, 1300]} height={190} xlabel="battles" ylabel="AP" hlines={hl} vlines={[{ x: battles }]} legend="tl" />
        <LinePlot series={[{ pts: profPts, color: 'var(--accent)', label: `${teaches} proficiency %` }]} x={[0, MAX_BATTLES]} y={[0, 110]} height={130} xlabel="battles" ylabel="%" hlines={[{ y: 100 }]} vlines={[{ x: battles }]} legend="br" />
        <div className="rpg-log">
          {events.filter((e) => e.b <= battles).length === 0 && <div className="old">no unlocks yet</div>}
          {events.map((e, i) => (
            <div key={i} className={e.b <= battles ? '' : 'old'}>
              {`battle ${String(e.b).padStart(2)}  ${e.msg}`}
            </div>
          ))}
        </div>
      </div>
    </FigureLayout>
  );
}
