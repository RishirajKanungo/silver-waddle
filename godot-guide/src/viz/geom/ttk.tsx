// math.rpgTtk: hits and seconds to kill with random damage. A base damage from the divisive formula,
// a ± variance roll, crits; 20 000 simulated fights give the distribution of hits to kill.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { FigureLayout, Readout, Slider } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { Rng } from '../../math/rng';

export function TtkLab({ spec }: { spec: VizSpec }) {
  const [base, setBase] = useState((spec.base as number) ?? 24);
  const [hp, setHp] = useState((spec.hp as number) ?? 120);
  const [variance, setVariance] = useState((spec.variance as number) ?? 0.1);
  const [crit, setCrit] = useState((spec.crit as number) ?? 0.1);
  const [critMul, setCritMul] = useState(1.5);
  const [aps, setAps] = useState(2.5);

  const sim = useMemo(() => {
    const rng = new Rng(11);
    const FIGHTS = 20000;
    const hist = new Map<number, number>();
    let sum = 0;
    for (let f = 0; f < FIGHTS; f++) {
      let left = hp, hits = 0;
      while (left > 0 && hits < 1000) {
        let dmg = base * (1 - variance + rng.next() * 2 * variance);
        if (rng.next() < crit) dmg *= critMul;
        left -= Math.max(1, Math.round(dmg));
        hits++;
      }
      hist.set(hits, (hist.get(hits) ?? 0) + 1);
      sum += hits;
    }
    const keys = [...hist.keys()].sort((a, b) => a - b);
    return { keys, hist, mean: sum / FIGHTS, fights: FIGHTS };
  }, [base, hp, variance, crit, critMul]);

  const fixedHits = Math.ceil(hp / base);
  const expDmg = base * (1 + crit * (critMul - 1));
  const dps = expDmg * aps;
  const lo = sim.keys[0], hi = sim.keys[sim.keys.length - 1];
  const bins: number[] = [];
  for (let h = Math.max(1, lo - 1); h <= hi + 1; h++) bins.push(h);
  const maxC = Math.max(...bins.map((b) => sim.hist.get(b) ?? 0), 1);
  const W = 480, H = 170;
  const bw = Math.min(48, (W - 20) / bins.length);
  const x0 = 10 + (W - 20 - bw * bins.length) / 2;

  const code = `extends Node
## Damage with a small random range and crits. Expected damage per hit: ${expDmg.toFixed(2)}.

@export var variance := ${variance.toFixed(2)}  ## ±${(variance * 100).toFixed(0)}%
@export var crit_chance := ${crit.toFixed(2)}
@export var crit_multiplier := ${critMul.toFixed(2)}

var rng := RandomNumberGenerator.new()


func roll_damage(base: int) -> int:
	var dmg := base * rng.randf_range(1.0 - variance, 1.0 + variance)
	if rng.randf() < crit_chance:
		dmg *= crit_multiplier
	return maxi(roundi(dmg), 1)`;

  return (
    <FigureLayout
      side={
        <>
          <Slider label="base dmg" value={base} min={1} max={100} step={1} onChange={setBase} fmt={(v) => v.toFixed(0)} />
          <Slider label="enemy HP" value={hp} min={10} max={600} step={10} onChange={setHp} fmt={(v) => v.toFixed(0)} />
          <Slider label="variance ±" value={variance} min={0} max={0.5} step={0.01} onChange={setVariance} fmt={(v) => (v * 100).toFixed(0) + '%'} />
          <Slider label="crit chance" value={crit} min={0} max={0.5} step={0.01} onChange={setCrit} fmt={(v) => (v * 100).toFixed(0) + '%'} />
          <Slider label="crit ×" value={critMul} min={1} max={3} step={0.05} onChange={setCritMul} fmt={(v) => v.toFixed(2)} />
          <Slider label="hits / s" value={aps} min={0.5} max={6} step={0.1} onChange={setAps} fmt={(v) => v.toFixed(1)} />
          <Readout
            rows={[
              ['\\lceil HP / \\text{base} \\rceil', `${fixedHits} hits`],
              ['\\text{mean hits (simulated)}', sim.mean.toFixed(2)],
              ['\\text{range of hits}', `${lo} to ${hi}`],
              ['\\E[\\text{dmg}] = b(1 + p(m-1))', expDmg.toFixed(2)],
              ['\\text{DPS} = \\E[\\text{dmg}] \\times \\text{hits/s}', dps.toFixed(1)],
              ['\\text{TTK} \\approx HP / \\text{DPS}', `${(hp / dps).toFixed(2)} s`],
            ]}
          />
        </>
      }
      below={<CodeBlock code={code} file="scripts/damage_roll.gd" compact />}
    >
      <svg viewBox={`0 0 ${W} ${H + 40}`} className="geom-svg" role="img" aria-label="histogram of hits needed to kill">
        <rect width={W} height={H + 40} className="pl-bg" />
        <text x={10} y={16} className="pl-tick">
          share of {sim.fights.toLocaleString('en-US')} fights that needed n hits
        </text>
        {bins.map((b, i) => {
          const c = sim.hist.get(b) ?? 0;
          const y = 24 + H - (c / maxC) * (H - 20);
          const x = x0 + i * bw;
          return (
            <g key={b}>
              <rect x={x + 2} y={y} width={bw - 4} height={24 + H - y} style={{ fill: b === fixedHits ? 'var(--c-v)' : 'var(--c-u)' }} />
              {c > 0 && (
                <text x={x + bw / 2} y={y - 4} textAnchor="middle" className="pl-tick" style={{ fontSize: 10 }}>
                  {((c / sim.fights) * 100).toFixed(c / sim.fights < 0.01 ? 1 : 0)}%
                </text>
              )}
              <text x={x + bw / 2} y={24 + H + 14} textAnchor="middle" className="pl-tick" style={{ fontSize: 10 }}>
                {b}
              </text>
            </g>
          );
        })}
        <line x1={10} x2={W - 10} y1={24 + H} y2={24 + H} className="pl-axis" />
      </svg>
    </FigureLayout>
  );
}
