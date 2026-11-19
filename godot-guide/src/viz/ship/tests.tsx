// ship.tests — what makes a good unit test? The damage formula from the lesson and five "mutants",
// each a realistic one-line bug. Add test cases (inputs + the expected value the correct formula
// gives); a mutant is "killed" when some test's assertion would fail on it. The GUT test file for
// the current cases is generated below.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Slider, SegControl, Toggle, Readout, FigureLayout, Btn } from '../kit';
import { CodeBlock } from '../../ui/GameCells';

interface Case {
  attack: number;
  power: number;
  defence: number;
  element: number;
  crit: boolean;
}
type Fn = (c: Case) => number;

// mirrors scripts/damage_formula.gd
const correct: Fn = ({ attack, power, defence, element, crit }) => {
  let dmg = (attack * power * 100.0) / (100.0 + defence);
  dmg *= element;
  if (crit) dmg *= 1.5;
  return Math.max(1, Math.floor(dmg));
};
const MUTANTS: { id: string; name: string; line: string; fn: Fn }[] = [
  {
    id: 'm1',
    name: 'no minimum damage',
    line: 'return maxi(0, floori(dmg))',
    fn: (c) => {
      let dmg = (c.attack * c.power * 100.0) / (100.0 + c.defence);
      dmg *= c.element;
      if (c.crit) dmg *= 1.5;
      return Math.max(0, Math.floor(dmg));
    },
  },
  {
    id: 'm2',
    name: 'integer division',
    line: 'var dmg := attack * power * (100 / (100 + defence))',
    fn: (c) => {
      let dmg = c.attack * c.power * Math.trunc(100 / (100 + c.defence)); // int / int truncates in GDScript
      dmg *= c.element;
      if (c.crit) dmg *= 1.5;
      return Math.max(1, Math.floor(dmg));
    },
  },
  {
    id: 'm3',
    name: 'crit doubles',
    line: 'dmg *= 2.0  # crit',
    fn: (c) => {
      let dmg = (c.attack * c.power * 100.0) / (100.0 + c.defence);
      dmg *= c.element;
      if (c.crit) dmg *= 2.0;
      return Math.max(1, Math.floor(dmg));
    },
  },
  {
    id: 'm4',
    name: 'rounds instead of floors',
    line: 'return maxi(1, roundi(dmg))',
    fn: (c) => {
      let dmg = (c.attack * c.power * 100.0) / (100.0 + c.defence);
      dmg *= c.element;
      if (c.crit) dmg *= 1.5;
      return Math.max(1, Math.round(dmg));
    },
  },
  {
    id: 'm5',
    name: 'resistances ignored',
    line: 'if element_mult > 1.0: dmg *= element_mult',
    fn: (c) => {
      let dmg = (c.attack * c.power * 100.0) / (100.0 + c.defence);
      if (c.element > 1) dmg *= c.element;
      if (c.crit) dmg *= 1.5;
      return Math.max(1, Math.floor(dmg));
    },
  },
];

const callStr = (c: Case) => `DamageFormula.compute(${c.attack}, ${c.power.toFixed(2)}, ${c.defence}, ${c.element.toFixed(1)}, ${c.crit})`;

export function TestsLab({ spec }: { spec: VizSpec }) {
  const [cur, setCur] = useState<Case>({ attack: 20, power: 1, defence: 0, element: 1, crit: false });
  const [cases, setCases] = useState<Case[]>(spec.seed === false ? [] : [{ attack: 20, power: 1, defence: 0, element: 1, crit: false }]);
  const set = (k: keyof Case) => (v: number | boolean) => setCur((o) => ({ ...o, [k]: v }));
  const killed = MUTANTS.map((m) => cases.findIndex((c) => m.fn(c) !== correct(c)));
  const nKilled = killed.filter((k) => k >= 0).length;
  const code = useMemo(
    () =>
      `extends GutTest
## test/unit/test_damage_formula.gd. ${cases.length} case${cases.length === 1 ? '' : 's'}.
${cases
  .map(
    (c, i) => `

func test_case_${i + 1}() -> void:
	assert_eq(${callStr(c)}, ${correct(c)})`,
  )
  .join('')}
`,
    [cases],
  );

  return (
    <FigureLayout
      side={
        <>
          <Slider label="attack" value={cur.attack} min={0} max={60} step={1} onChange={set('attack')} />
          <Slider label="power" value={cur.power} min={0.25} max={3} step={0.25} onChange={set('power')} fmt={(v) => v.toFixed(2)} />
          <Slider label="defence" value={cur.defence} min={0} max={300} step={5} onChange={set('defence')} />
          <SegControl label="element" value={cur.element} options={[0.5, 1, 1.5, 2].map((v) => ({ v, label: '×' + v }))} onChange={set('element')} />
          <Toggle label="crit" value={cur.crit} onChange={set('crit')} />
          <Readout rows={[['\\text{expected}', String(correct(cur))], ['\\text{raw dmg}', (((cur.attack * cur.power * 100) / (100 + cur.defence)) * cur.element * (cur.crit ? 1.5 : 1)).toFixed(3)]]} />
          <div className="ship-btnrow">
            <Btn primary onClick={() => setCases((cs) => [...cs, { ...cur }].slice(-8))}>
              Add test
            </Btn>
            <Btn onClick={() => setCases([])}>Clear</Btn>
          </div>
          <Readout rows={[['\\text{mutants killed}', `${nKilled} / ${MUTANTS.length}`], ['\\text{tests}', String(cases.length)]]} />
        </>
      }
      below={<CodeBlock code={code} file="test/unit/test_damage_formula.gd" compact />}
    >
      <div className="ship-scroll">
        <table className="ship-table">
          <thead>
            <tr>
              <th>version</th>
              {cases.map((_, i) => (
                <th key={i} className="num">
                  t{i + 1}
                </th>
              ))}
              <th>status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <b>correct</b>
              </td>
              {cases.map((c, i) => (
                <td key={i} className="num">
                  <b>{correct(c)}</b>
                </td>
              ))}
              <td />
            </tr>
            {MUTANTS.map((m, j) => (
              <tr key={m.id}>
                <td>
                  {m.name}
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--muted)' }}>{m.line}</div>
                </td>
                {cases.map((c, i) => {
                  const v = m.fn(c), ok = v === correct(c);
                  return (
                    <td key={i} className={'num ' + (ok ? '' : 'ship-bad')}>
                      {v}
                    </td>
                  );
                })}
                <td className={killed[j] >= 0 ? 'ship-ok' : 'ship-bad'}>{killed[j] >= 0 ? `killed by t${killed[j] + 1}` : 'survives'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {cases.length > 0 && (
          <div className="ship-note" style={{ marginTop: 6 }}>
            {cases.map((c, i) => (
              <div key={i}>
                t{i + 1}: <code>{callStr(c)}</code>
              </div>
            ))}
          </div>
        )}
      </div>
    </FigureLayout>
  );
}
