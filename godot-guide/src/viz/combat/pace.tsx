// combat.atbpace: a pacing calculator for the hybrid battle system. From hit rate, ATB per hit,
// segment size and stagger numbers it derives seconds per ATB segment, hits and time to stagger,
// and simulates a fight against one enemy to estimate its length against the 30-90 s target.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Slider, SegControl, Readout, FigureLayout, LinePlot } from '../kit';
import './combat.css';

interface P {
  atbPerHit: number;
  hitsPerSec: number;
  uptime: number; // fraction of the fight spent landing hits
  passive: number;
  segment: number;
  staggerPerHit: number;
  abilityStagger: number;
  staggerMax: number;
  enemyHp: number;
  dmgPerHit: number;
  abilityDmg: number;
  mult: number;
  staggerTime: number;
}
const PRESETS: Record<string, P> = {
  kai: { atbPerHit: 11, hitsPerSec: 3, uptime: 0.5, passive: 2, segment: 100, staggerPerHit: 3, abilityStagger: 30, staggerMax: 100, enemyHp: 1500, dmgPerHit: 7, abilityDmg: 28, mult: 1.6, staggerTime: 6 },
  lyra: { atbPerHit: 10, hitsPerSec: 2, uptime: 0.5, passive: 3, segment: 100, staggerPerHit: 2, abilityStagger: 21, staggerMax: 100, enemyHp: 1500, dmgPerHit: 4, abilityDmg: 54, mult: 1.6, staggerTime: 6 },
  bram: { atbPerHit: 9, hitsPerSec: 1.6, uptime: 0.5, passive: 2, segment: 100, staggerPerHit: 7, abilityStagger: 44, staggerMax: 100, enemyHp: 1500, dmgPerHit: 11, abilityDmg: 20, mult: 1.6, staggerTime: 6 },
};

export function simulateFight(p: P, maxT = 240) {
  // continuous-rate model: hits land at hitsPerSec * uptime; a segment is spent on an ability as
  // soon as it fills; the stagger meter ignores decay; when it fills, damage is multiplied for staggerTime
  const dt = 0.05;
  let t = 0, atb = 0, meter = 0, hp = p.enemyHp, staggerLeft = 0;
  const atbPts: [number, number][] = [], meterPts: [number, number][] = [], hpPts: [number, number][] = [];
  let firstStagger = -1, abilities = 0, staggers = 0;
  const hitRate = p.hitsPerSec * p.uptime;
  while (hp > 0 && t < maxT) {
    const m = staggerLeft > 0 ? p.mult : 1;
    atb += (p.atbPerHit * hitRate + p.passive) * dt;
    hp -= p.dmgPerHit * hitRate * m * dt;
    if (staggerLeft > 0) {
      staggerLeft -= dt;
      meter = (p.staggerMax * Math.max(0, staggerLeft)) / p.staggerTime;
      if (staggerLeft <= 0) meter = 0;
    } else meter += p.staggerPerHit * hitRate * dt;
    if (atb >= p.segment) {
      atb -= p.segment;
      abilities++;
      hp -= p.abilityDmg * m;
      if (staggerLeft <= 0) meter += p.abilityStagger;
    }
    if (staggerLeft <= 0 && meter >= p.staggerMax) {
      meter = p.staggerMax;
      staggerLeft = p.staggerTime;
      staggers++;
      if (firstStagger < 0) firstStagger = t;
    }
    t += dt;
    if (Math.round(t / dt) % 4 === 0) {
      atbPts.push([t, Math.min(1, atb / p.segment)]);
      meterPts.push([t, meter / p.staggerMax]);
      hpPts.push([t, Math.max(0, hp) / p.enemyHp]);
    }
  }
  return { t, atbPts, meterPts, hpPts, firstStagger, abilities, staggers, done: hp <= 0 };
}

export function Pace({ spec }: { spec: VizSpec }) {
  const [who, setWho] = useState<string>((spec.preset as string) ?? 'kai');
  const [p, setP] = useState<P>(PRESETS[(spec.preset as string) ?? 'kai'] ?? PRESETS.kai);
  const set = (k: keyof P) => (v: number) => setP({ ...p, [k]: v });
  const pick = (w: string) => {
    setWho(w);
    setP(PRESETS[w]);
  };
  const hitRate = p.hitsPerSec * p.uptime;
  const atbRate = p.atbPerHit * hitRate + p.passive;
  const tSeg = p.segment / atbRate;
  const hitsToStagger = Math.ceil(p.staggerMax / p.staggerPerHit);
  const staggerRate = p.staggerPerHit * hitRate + p.abilityStagger / tSeg;
  const tStagger = p.staggerMax / staggerRate;
  const sim = useMemo(() => simulateFight(p), [p]);
  const inBand = sim.done && sim.t >= 30 && sim.t <= 90;
  const tMax = Math.max(100, Math.min(240, Math.ceil(sim.t / 10) * 10));

  return (
    <FigureLayout
      side={
        <>
          <SegControl label="preset" value={who} onChange={pick} options={[{ v: 'kai', label: 'Kai' }, { v: 'lyra', label: 'Lyra' }, { v: 'bram', label: 'Bram' }]} />
          <Slider label="hits per second (in a string)" value={p.hitsPerSec} min={0.5} max={5} step={0.1} onChange={set('hitsPerSec')} fmt={(v) => v.toFixed(1)} />
          <Slider label="uptime (share of time hitting)" value={p.uptime} min={0.1} max={1} step={0.05} onChange={set('uptime')} fmt={(v) => (v * 100).toFixed(0) + '%'} />
          <Slider label="atb_per_hit" value={p.atbPerHit} min={2} max={30} step={1} onChange={set('atbPerHit')} fmt={(v) => v.toFixed(0)} />
          <Slider label="passive_rate (per s)" value={p.passive} min={0} max={10} step={0.5} onChange={set('passive')} fmt={(v) => v.toFixed(1)} />
          <Slider label="stagger per basic hit" value={p.staggerPerHit} min={1} max={15} step={1} onChange={set('staggerPerHit')} fmt={(v) => v.toFixed(0)} />
          <Slider label="stagger per ability" value={p.abilityStagger} min={0} max={80} step={1} onChange={set('abilityStagger')} fmt={(v) => v.toFixed(0)} />
          <Slider label="enemy HP" value={p.enemyHp} min={100} max={4000} step={50} onChange={set('enemyHp')} fmt={(v) => v.toFixed(0)} />
          <Slider label="stagger multiplier" value={p.mult} min={1} max={3} step={0.05} onChange={set('mult')} fmt={(v) => '×' + v.toFixed(2)} />
        </>
      }
      below={
        <Readout
          rows={[
            ['r_{\\text{ATB}} = a_{\\text{hit}}\\,h\\,u + p', `${atbRate.toFixed(1)} ATB/s`],
            ['t_{\\text{seg}} = S / r_{\\text{ATB}}', `${tSeg.toFixed(2)} s per segment`],
            ['\\text{hits to stagger (basic only)}', `⌈${p.staggerMax}/${p.staggerPerHit}⌉ = ${hitsToStagger}`],
            ['t_{\\text{stagger}} \\approx M / (s_{\\text{hit}} h u + s_{\\text{ab}}/t_{\\text{seg}})', `${tStagger.toFixed(1)} s`],
            ['\\text{simulated fight}', sim.done ? `${sim.t.toFixed(0)} s, ${sim.staggers} stagger${sim.staggers === 1 ? '' : 's'}, ${sim.abilities} abilities ${inBand ? '(inside 30–90 s)' : '(outside 30–90 s)'}` : 'over 240 s'],
          ]}
        />
      }
    >
      <LinePlot
        width={520}
        height={260}
        x={[0, tMax]}
        y={[0, 1.4]}
        xlabel="seconds"
        ylabel="fraction"
        legend="tr"
        vlines={[
          { x: 30, color: 'var(--ok)', label: '30 s' },
          { x: 90, color: 'var(--ok)', label: '90 s' },
        ]}
        series={[
          { pts: sim.hpPts, color: 'var(--ok)', label: 'enemy HP' },
          { pts: sim.meterPts, color: 'var(--c-v)', label: 'stagger meter' },
          { pts: sim.atbPts, color: 'var(--c-u)', label: 'ATB (segment)', width: 1.2 },
        ]}
      />
    </FigureLayout>
  );
}
