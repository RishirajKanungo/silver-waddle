// math.rpgDamage: damage formulas compared as curves. Sliders for attack, defence, the divisive
// constant k and the target's HP; the plot shows damage against defence (or attack) for every formula,
// with the zero-damage point of the subtractive formula marked.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { FigureLayout, Readout, Slider, SegControl, LinePlot, Toggle } from '../kit';
import { CodeBlock } from '../../ui/GameCells';

export const FORMULAS = {
  sub: { label: 'atk - def', color: 'var(--c-err)', f: (a: number, d: number) => Math.max(a - d, 0) },
  sub1: { label: 'max(atk - def, 1)', color: 'var(--c-v)', f: (a: number, d: number) => Math.max(a - d, 1) },
  div: { label: 'atk * k / (k + def)', color: 'var(--c-u)', f: (a: number, d: number, k: number) => (a * k) / (k + d) },
  ratio: { label: 'atk² / (atk + def)', color: 'var(--c-w)', f: (a: number, d: number) => (a + d > 0 ? (a * a) / (a + d) : 0) },
} as const;
export type FormulaId = keyof typeof FORMULAS;
const IDS = Object.keys(FORMULAS) as FormulaId[];

export function DamageExplorer({ spec }: { spec: VizSpec }) {
  const [atk, setAtk] = useState((spec.atk as number) ?? 40);
  const [def, setDef] = useState((spec.def as number) ?? 25);
  const [k, setK] = useState((spec.k as number) ?? 100);
  const [hp, setHp] = useState((spec.hp as number) ?? 120);
  const [xAxis, setXAxis] = useState<'def' | 'atk'>('def');
  const [on, setOn] = useState<Record<FormulaId, boolean>>({ sub: true, sub1: false, div: true, ratio: true });

  const series = useMemo(
    () =>
      IDS.filter((id) => on[id]).map((id) => {
        const pts: [number, number][] = [];
        for (let x = 0; x <= 200; x += 1) pts.push([x, xAxis === 'def' ? FORMULAS[id].f(atk, x, k) : FORMULAS[id].f(x, def, k)]);
        return { pts, color: FORMULAS[id].color, label: FORMULAS[id].label };
      }),
    [on, atk, def, k, xAxis],
  );
  const cur = xAxis === 'def' ? def : atk;
  const vals = IDS.map((id) => {
    const raw = FORMULAS[id].f(atk, def, k);
    const dmg = Math.round(raw);
    return { id, raw, dmg, hits: dmg > 0 ? Math.ceil(hp / dmg) : Infinity };
  });
  const yMax = Math.max(10, ...series.flatMap((s) => s.pts.map((p) => p[1])));

  const code = `class_name DamageFormulas
## Three ways to turn attack and defence into damage. Values now: atk ${atk}, def ${def}, k ${k}.


static func subtractive(atk: int, defence: int) -> int:
	return maxi(atk - defence, 1)  # ${vals[1].dmg}


static func divisive(atk: int, defence: int, k: float = ${k.toFixed(1)}) -> int:
	return roundi(atk * k / (k + defence))  # ${vals[2].raw.toFixed(2)} -> ${vals[2].dmg}


static func relative(atk: int, defence: int) -> int:
	return roundi(float(atk * atk) / float(atk + defence))  # ${vals[3].raw.toFixed(2)} -> ${vals[3].dmg}`;

  return (
    <FigureLayout
      side={
        <>
          <Slider label="atk" value={atk} min={1} max={200} step={1} onChange={setAtk} fmt={(v) => v.toFixed(0)} />
          <Slider label="def" value={def} min={0} max={200} step={1} onChange={setDef} fmt={(v) => v.toFixed(0)} />
          <Slider label="k" value={k} min={10} max={200} step={5} onChange={setK} fmt={(v) => v.toFixed(0)} />
          <Slider label="enemy HP" value={hp} min={10} max={1000} step={10} onChange={setHp} fmt={(v) => v.toFixed(0)} />
          <SegControl label="x axis" value={xAxis} onChange={setXAxis} options={[{ v: 'def', label: 'defence' }, { v: 'atk', label: 'attack' }]} />
          <div className="geom-checks">
            {IDS.map((id) => (
              <Toggle key={id} label={<span style={{ color: FORMULAS[id].color }}>{FORMULAS[id].label}</span>} value={on[id]} onChange={(v) => setOn({ ...on, [id]: v })} />
            ))}
          </div>
        </>
      }
      below={
        <>
          <table className="geom-table">
            <thead>
              <tr>
                <th>formula</th>
                <th>damage</th>
                <th>hits to kill {hp}</th>
              </tr>
            </thead>
            <tbody>
              {vals.map((v) => (
                <tr key={v.id}>
                  <td style={{ color: FORMULAS[v.id].color }}>{FORMULAS[v.id].label}</td>
                  <td>
                    {v.raw.toFixed(2)} → <b>{v.dmg}</b>
                  </td>
                  <td className={v.hits === Infinity ? 'geom-no' : ''}>{v.hits === Infinity ? 'never' : v.hits}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <CodeBlock code={code} file="scripts/damage_formulas.gd" compact />
        </>
      }
    >
      <div style={{ width: '100%' }}>
        <LinePlot
          series={series}
          x={[0, 200]}
          y={[0, yMax * 1.05]}
          xlabel={xAxis === 'def' ? `defence (atk = ${atk})` : `attack (def = ${def})`}
          ylabel="damage per hit"
          legend="tr"
          vlines={[{ x: cur, color: 'var(--fg)' }, ...(xAxis === 'def' && on.sub ? [{ x: atk, color: 'var(--c-err)' }] : [])]}
        >
          {(sx, sy) =>
            IDS.filter((id) => on[id]).map((id) => {
              const y = FORMULAS[id].f(atk, def, k);
              return <circle key={id} cx={sx(cur)} cy={sy(y)} r={4} style={{ fill: FORMULAS[id].color, stroke: 'var(--surface)', strokeWidth: 1.5 }} />;
            })
          }
        </LinePlot>
        <Readout
          rows={[
            ['\\text{subtractive is 0 from def} =', `${atk}`],
            ['\\text{divisive halves at def} = k =', `${k}`],
            ['\\text{relative halves at def} = \\text{atk} =', `${atk}`],
          ]}
        />
      </div>
    </FigureLayout>
  );
}
