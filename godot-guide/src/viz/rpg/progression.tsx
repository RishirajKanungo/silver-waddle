// rpg.stats.progression — the progression simulator for r02-3. The XP curve xp(L) = round(a L^k)
// (Progression.xp_to_next), the areas' fights and XP per fight, the level after every fight
// (PartyMember.add_xp), and each character's stats per level (CharacterStats.apply_to).
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Slider, SegControl, FigureLayout, LinePlot } from '../kit';
import { CHARS, CHAR_IDS, ENEMIES, STAT_LABEL, primaryAt, derivedFromPrimary, xpToNext, type Stat } from './model';

const AREAS = [
  { name: 'field', fights: 25, xp: ENEMIES.slime.xp + ENEMIES.bat.xp, target: 5, enemy: 'slime' as const },
  { name: 'ruins', fights: 30, xp: ENEMIES.skeleton.xp + ENEMIES.slime.xp, target: 8, enemy: 'skeleton' as const },
  { name: 'dungeon', fights: 30, xp: 2 * ENEMIES.skeleton.xp + ENEMIES.bat.xp, target: 11, enemy: 'skeleton' as const },
  { name: 'boss', fights: 1, xp: ENEMIES.golem.xp, target: 11, enemy: 'golem' as const },
];
const STAT_CHOICES: Stat[] = ['MAX_HP', 'ATTACK', 'MAGIC', 'DEFENCE'];
const COLOURS: Record<string, string> = { kai: 'var(--c-u)', lyra: 'var(--violet)', bram: 'var(--c-v)' };

export function ProgressionSim({ spec }: { spec: VizSpec }) {
  const [base, setBase] = useState<number>((spec.base as number) ?? 25);
  const [exponent, setExponent] = useState<number>((spec.exponent as number) ?? 1.5);
  const [scale, setScale] = useState(1);
  const [stat, setStat] = useState<Stat>('ATTACK');

  const sim = useMemo(() => {
    let level = 1, xp = 0, fight = 0;
    const pts: [number, number][] = [[0, 1]];
    const ends: { name: string; level: number; at: number; target: number; fights: number }[] = [];
    for (const a of AREAS) {
      const n = Math.max(1, Math.round(a.fights * (a.name === 'boss' ? 1 : scale)));
      for (let i = 0; i < n; i++) {
        fight++;
        // PartyMember.add_xp
        xp += a.xp;
        while (level < 50 && xp >= xpToNext(level, base, exponent)) {
          xp -= xpToNext(level, base, exponent);
          level++;
        }
        pts.push([fight, level]);
      }
      ends.push({ name: a.name, level, at: fight, target: a.target, fights: n });
    }
    return { pts, ends, total: fight };
  }, [base, exponent, scale]);

  const curve: [number, number][] = Array.from({ length: 20 }, (_, i) => [i + 1, xpToNext(i + 1, base, exponent)]);
  const statSeries = CHAR_IDS.map((c) => ({
    pts: Array.from({ length: 20 }, (_, i) => [i + 1, derivedFromPrimary(primaryAt(CHARS[c], i + 1))[stat]] as [number, number]),
    color: COLOURS[c],
    label: CHARS[c].name,
  }));
  const enemyRef = stat === 'DEFENCE' ? { y: ENEMIES.golem.stats.ATTACK, label: 'golem attack' } : stat === 'MAX_HP' ? null : { y: ENEMIES.skeleton.stats.DEFENCE, label: 'skeleton defence' };
  const lvAt = (name: string) => sim.ends.find((e) => e.name === name)!;

  return (
    <FigureLayout
      side={
        <>
          <Slider tex="a" value={base} min={10} max={80} step={1} onChange={setBase} fmt={(v) => v.toFixed(0)} />
          <Slider tex="k" value={exponent} min={1} max={2.5} step={0.05} onChange={setExponent} fmt={(v) => v.toFixed(2)} />
          <Slider label="fights ×" value={scale} min={0.5} max={2} step={0.05} onChange={setScale} fmt={(v) => v.toFixed(2)} />
          <div className="readout">
            <div className="readout-title">level at the end of each area</div>
            {sim.ends.map((e) => (
              <div key={e.name} className="readout-row">
                <span>
                  {e.name} ({e.fights} × {AREAS.find((a) => a.name === e.name)!.xp} XP)
                </span>
                <span className={'rpg-mono ' + (Math.abs(e.level - e.target) <= 0 ? 'rpg-up' : Math.abs(e.level - e.target) === 1 ? '' : 'rpg-down')}>
                  {e.level} / {e.target}
                </span>
              </div>
            ))}
          </div>
          <SegControl label="stat" value={stat} options={STAT_CHOICES.map((s) => ({ v: s, label: STAT_LABEL[s] }))} onChange={setStat} />
          <div className="rpg-muted">
            xp_to_next(10) = {xpToNext(10, base, exponent)}; dungeon fights per level at 11: {(xpToNext(11, base, exponent) / AREAS[2].xp).toFixed(1)}
          </div>
        </>
      }
    >
      <div className="rpg-col">
        <LinePlot series={[{ pts: curve, color: 'var(--accent)', label: `xp_to_next(L) = round(${base} L^${exponent.toFixed(2)})` }]} x={[1, 20]} height={150} xlabel="level L" ylabel="XP" legend="tl" />
        <LinePlot
          series={[{ pts: sim.pts, color: 'var(--c-u)', label: 'level after each fight' }]}
          x={[0, sim.total]}
          y={[1, Math.max(13, ...sim.pts.map((p) => p[1])) + 0.5]}
          height={180}
          xlabel="fights"
          ylabel="level"
          vlines={sim.ends.slice(0, -1).map((e) => ({ x: e.at, label: e.name }))}
          hlines={[5, 8, 11].map((y) => ({ y, color: 'var(--c-v)' }))}
          legend="tl"
        />
        <LinePlot series={statSeries} x={[1, 20]} height={170} xlabel="level" ylabel={STAT_LABEL[stat]} hlines={enemyRef ? [{ y: enemyRef.y, color: 'var(--c-err)' }] : []} vlines={[{ x: lvAt('ruins').level }, { x: lvAt('boss').level }]} legend="tl" />
        <div className="rpg-muted">
          Bottom: {STAT_LABEL[stat]} per level (before gear). {enemyRef ? `Red dashed line: ${enemyRef.label} (${enemyRef.y}). ` : ''}Grey dashed lines: expected levels after the ruins and at the boss.
        </div>
      </div>
    </FigureLayout>
  );
}
