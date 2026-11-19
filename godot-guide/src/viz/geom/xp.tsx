// math.rpgXp: design an XP curve. Choose the shape (linear, power, exponential) and its parameters,
// the XP the player earns per minute, and read off XP per level, total XP and hours to reach a level.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { FigureLayout, Readout, Slider, SegControl, LinePlot } from '../kit';
import { CodeBlock } from '../../ui/GameCells';

type Shape = 'linear' | 'power' | 'exp';

export function xpToNext(shape: Shape, base: number, p: number, r: number, level: number) {
  if (shape === 'linear') return Math.round(base * level);
  if (shape === 'power') return Math.round(base * Math.pow(level, p));
  return Math.round(base * Math.pow(r, level - 1));
}

export function XpCurve({ spec }: { spec: VizSpec }) {
  const [shape, setShape] = useState<Shape>((spec.shape as Shape) ?? 'power');
  const [base, setBase] = useState((spec.base as number) ?? 100);
  const [p, setP] = useState((spec.p as number) ?? 1.5);
  const [r, setR] = useState((spec.r as number) ?? 1.15);
  const [maxLevel, setMaxLevel] = useState((spec.maxLevel as number) ?? 30);
  const [rate, setRate] = useState((spec.rate as number) ?? 60);
  const [rewards, setRewards] = useState<'flat' | 'level'>('level');
  const [show, setShow] = useState<'next' | 'total' | 'minutes' | 'hours'>((spec.show as 'next') ?? 'next');
  const [target, setTarget] = useState(20);
  const tgt = Math.min(target, maxLevel);

  const table = useMemo(() => {
    // rows for level 1..maxLevel: xp to go from L to L+1, total XP to reach L, hours to reach L
    const rows: { level: number; next: number; total: number; minutes: number; hours: number }[] = [];
    let total = 0, hours = 0;
    for (let L = 1; L <= maxLevel; L++) {
      const next = xpToNext(shape, base, p, r, L);
      const perMin = rewards === 'flat' ? rate : rate * L;
      rows.push({ level: L, next, total, minutes: next / perMin, hours });
      total += next;
      hours += next / perMin / 60;
    }
    return rows;
  }, [shape, base, p, r, maxLevel, rate, rewards]);

  const row = table[tgt - 1];
  const ys = table.map((t) => (show === 'next' ? t.next : show === 'total' ? t.total : show === 'minutes' ? t.minutes : t.hours));
  const LABEL = { next: 'XP to next level', total: 'total XP to reach level', minutes: 'minutes to finish level', hours: 'hours to reach level' };
  const series = [{ pts: table.map((t, i) => [t.level, ys[i]] as [number, number]), color: 'var(--c-u)', label: LABEL[show] }];

  // inverse: solve for the level from a total amount of XP, by the loop the GDScript uses
  const levelFor = (xp: number) => {
    let L = 1;
    while (L < maxLevel && xp >= table[L].total) L++;
    return L;
  };
  const closed =
    shape === 'linear'
      ? `L = \\lfloor (1 + \\sqrt{1 + 8T/${base}})/2 \\rfloor`
      : shape === 'exp'
        ? `L = 1 + \\lfloor \\log(1 + T(r-1)/b) / \\log r \\rfloor`
        : '\\text{loop (no closed form)}';
  const curveLine = shape === 'linear' ? 'return roundi(base * level)' : shape === 'power' ? 'return roundi(base * pow(level, exponent))' : 'return roundi(base * pow(growth, level - 1))';

  const code = `class_name XpCurve
extends Resource

@export var base := ${base.toFixed(1)}
${shape === 'power' ? `@export var exponent := ${p.toFixed(2)}` : shape === 'exp' ? `@export var growth := ${r.toFixed(3)}` : '# linear: each level costs base more than the last'}
@export var max_level := ${maxLevel}


## XP needed to go from level to level + 1.
func xp_to_next(level: int) -> int:
	${curveLine}  # level ${tgt}: ${row.next}


## Total XP needed to reach level, starting from 0 XP at level 1.
func total_xp(level: int) -> int:
	var total := 0
	for k in range(1, level):
		total += xp_to_next(k)
	return total  # level ${tgt}: ${row.total}


func level_for_xp(xp: int) -> int:
	var level := 1
	while level < max_level and xp >= total_xp(level + 1):
		level += 1
	return level`;

  return (
    <FigureLayout
      side={
        <>
          <SegControl value={shape} onChange={setShape} options={[{ v: 'linear', label: 'linear' }, { v: 'power', label: 'power' }, { v: 'exp', label: 'exponential' }]} />
          <Slider label="base" value={base} min={10} max={500} step={10} onChange={setBase} fmt={(v) => v.toFixed(0)} />
          {shape === 'power' && <Slider label="exponent" value={p} min={1} max={3} step={0.05} onChange={setP} fmt={(v) => v.toFixed(2)} />}
          {shape === 'exp' && <Slider label="growth r" value={r} min={1.02} max={1.4} step={0.01} onChange={setR} fmt={(v) => v.toFixed(2)} />}
          <Slider label="max level" value={maxLevel} min={10} max={60} step={1} onChange={setMaxLevel} fmt={(v) => v.toFixed(0)} />
          <Slider label="XP/min at Lv 1" value={rate} min={10} max={400} step={10} onChange={setRate} fmt={(v) => v.toFixed(0)} />
          <SegControl label="enemy XP" value={rewards} onChange={setRewards} options={[{ v: 'flat', label: 'flat' }, { v: 'level', label: '× level' }]} />
          <Slider label="look at level" value={tgt} min={2} max={maxLevel} step={1} onChange={setTarget} fmt={(v) => v.toFixed(0)} />
          <Readout
            rows={[
              ['\\text{xp\\_to\\_next}(L)', `${row.next}`],
              ['\\text{total\\_xp}(L)', `${row.total}`],
              ['\\text{minutes for this level}', row.minutes.toFixed(1)],
              ['\\text{hours to reach } L', row.hours.toFixed(2)],
              ['\\text{level after 1 h, 5 h}', `${levelFor(hoursToXp(table, 1, rate, rewards))}, ${levelFor(hoursToXp(table, 5, rate, rewards))}`],
            ]}
          />
        </>
      }
      below={<CodeBlock code={code} file="scripts/resources/xp_curve.gd" compact />}
    >
      <div style={{ width: '100%' }}>
        <SegControl value={show} onChange={setShow} options={[{ v: 'next', label: 'XP per level' }, { v: 'total', label: 'total XP' }, { v: 'minutes', label: 'minutes per level' }, { v: 'hours', label: 'hours played' }]} />
        <LinePlot series={series} x={[1, maxLevel]} xlabel="level" ylabel={show === 'hours' ? 'hours' : show === 'minutes' ? 'minutes' : 'XP'} legend="tl" vlines={[{ x: tgt, color: 'var(--fg)' }]}>
          {(sx, sy) => <circle cx={sx(tgt)} cy={sy(ys[tgt - 1])} r={4} style={{ fill: 'var(--c-u)', stroke: 'var(--surface)', strokeWidth: 1.5 }} />}
        </LinePlot>
        <Readout rows={[['\\text{inverse}', `$${closed}`]]} />
      </div>
    </FigureLayout>
  );
}

/** Total XP earned after h hours of play, when the rate depends on the current level. */
function hoursToXp(table: { level: number; next: number; total: number }[], h: number, rate: number, rewards: 'flat' | 'level') {
  let minutes = h * 60, xp = 0;
  for (const t of table) {
    const perMin = rewards === 'flat' ? rate : rate * t.level;
    const need = t.next / perMin;
    if (minutes < need) return xp + minutes * perMin;
    minutes -= need;
    xp += t.next;
  }
  return xp;
}
