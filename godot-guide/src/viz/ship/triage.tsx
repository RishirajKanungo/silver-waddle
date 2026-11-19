// ship.triage — bug bash triage. Ten bug reports from a slice playtest; give each a severity and a
// frequency, and the priority comes from a fixed matrix. P1 and P2 must be fixed before the release
// candidate. "Compare" shows a model triage with the reasoning for each bug.
import { useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Readout, FigureLayout, Toggle } from '../kit';

type Sev = 1 | 2 | 3 | 4;
type Freq = 1 | 2 | 3;
const SEV: Record<Sev, string> = { 1: 'S1 crash / data loss', 2: 'S2 blocks progress', 3: 'S3 major', 4: 'S4 minor / cosmetic' };
const FREQ: Record<Freq, string> = { 1: 'always', 2: 'often', 3: 'rare' };
// priority matrix [severity][frequency]
const MATRIX: Record<Sev, Record<Freq, number>> = {
  1: { 1: 1, 2: 1, 3: 2 },
  2: { 1: 1, 2: 2, 3: 3 },
  3: { 1: 2, 2: 3, 3: 4 },
  4: { 1: 3, 2: 4, 3: 4 },
};
const BUGS: { text: string; sev: Sev; freq: Freq; why: string }[] = [
  { text: 'Game crashes when saving at the dungeon save point while Lyra is casting.', sev: 1, freq: 3, why: 'A crash during a save can corrupt progress; rare, but data loss is never acceptable in an RC.' },
  { text: 'Kai can dash through the east wall of the town and fall out of the world.', sev: 2, freq: 2, why: 'Blocks progress (soft lock) and players who dash along walls find it.' },
  { text: 'The golem sometimes stays staggered forever and cannot be damaged.', sev: 2, freq: 3, why: 'Blocks the end of the slice; rare, but a softlock at the boss ruins the demo.' },
  { text: 'Footstep sound plays twice when changing direction.', sev: 4, freq: 1, why: 'Every player hears it, but it does not affect play.' },
  { text: 'Shop shows the old gold value until the menu is reopened.', sev: 3, freq: 1, why: 'Misleading every time, and it affects buying decisions.' },
  { text: 'Bat telegraph is invisible against the dark dungeon floor.', sev: 3, freq: 1, why: 'Breaks the "every hit reads" pillar in every dungeon fight.' },
  { text: 'A typo in the innkeeper\'s second line of dialogue.', sev: 4, freq: 2, why: 'Cosmetic; fix it when touching dialogue.' },
  { text: 'Frame time spikes to 40 ms when three skeletons spawn.', sev: 3, freq: 2, why: 'A visible hitch in combat; the pool from p02 fixes it.' },
  { text: 'Tactical menu cannot be closed with the gamepad B button.', sev: 2, freq: 1, why: 'Deck and controller players get stuck in the menu every time.' },
  { text: 'Slime variant uses the green palette for one frame when it spawns.', sev: 4, freq: 1, why: 'Visible but harmless.' },
];

export function TriageLab({ spec }: { spec: VizSpec }) {
  void spec;
  const [sev, setSev] = useState<(Sev | 0)[]>(BUGS.map(() => 0));
  const [freq, setFreq] = useState<(Freq | 0)[]>(BUGS.map(() => 0));
  const [compare, setCompare] = useState(false);
  const pri = (i: number) => (sev[i] && freq[i] ? MATRIX[sev[i] as Sev][freq[i] as Freq] : 0);
  const model = (i: number) => MATRIX[BUGS[i].sev][BUGS[i].freq];
  const graded = BUGS.filter((_, i) => pri(i)).length;
  const agree = BUGS.filter((_, i) => pri(i) && pri(i) === model(i)).length;
  const mustFix = BUGS.filter((_, i) => pri(i) && pri(i) <= 2).length;

  return (
    <FigureLayout
      side={
        <>
          <div className="ship-scroll">
            <table className="ship-table">
              <thead>
                <tr>
                  <th />
                  <th className="num">always</th>
                  <th className="num">often</th>
                  <th className="num">rare</th>
                </tr>
              </thead>
              <tbody>
                {([1, 2, 3, 4] as Sev[]).map((s) => (
                  <tr key={s}>
                    <td>S{s}</td>
                    {([1, 2, 3] as Freq[]).map((f) => (
                      <td key={f} className="num">
                        <span className={'ship-pill p' + MATRIX[s][f]}>P{MATRIX[s][f]}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Toggle label="compare with a model triage" value={compare} onChange={setCompare} />
          <Readout
            rows={[
              ['\\text{triaged}', `${graded} / ${BUGS.length}`],
              ['\\text{fix before RC (P1, P2)}', String(mustFix)],
              ...(compare ? ([['\\text{same priority as model}', `${agree} / ${graded}`]] as [string, string][]) : []),
            ]}
          />
        </>
      }
    >
      <div className="ship-wide">
        {BUGS.map((b, i) => (
          <div className="ship-bug" key={i}>
            <div>
              <div>
                <b>#{i + 1}</b> {b.text}
              </div>
              {compare && (
                <div className="ship-note">
                  Model: S{b.sev}, {FREQ[b.freq]} → P{model(i)}. {b.why}
                </div>
              )}
            </div>
            <div className="sel">
              <select aria-label={`severity of bug ${i + 1}`} value={sev[i]} onChange={(e) => setSev((v) => v.map((x, k) => (k === i ? (Number(e.target.value) as Sev) : x)))}>
                <option value={0}>severity</option>
                {([1, 2, 3, 4] as Sev[]).map((s) => (
                  <option key={s} value={s}>
                    {SEV[s]}
                  </option>
                ))}
              </select>
              <select aria-label={`frequency of bug ${i + 1}`} value={freq[i]} onChange={(e) => setFreq((v) => v.map((x, k) => (k === i ? (Number(e.target.value) as Freq) : x)))}>
                <option value={0}>frequency</option>
                {([1, 2, 3] as Freq[]).map((f) => (
                  <option key={f} value={f}>
                    {FREQ[f]}
                  </option>
                ))}
              </select>
              {pri(i) > 0 && <span className={'ship-pill p' + pri(i)}>P{pri(i)}</span>}
            </div>
          </div>
        ))}
      </div>
    </FigureLayout>
  );
}
