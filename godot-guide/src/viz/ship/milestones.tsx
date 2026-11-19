// ship.milestones — the slice's integration plan as a dependency graph. Each milestone has an
// estimate, the course modules it draws on and acceptance criteria. Select a milestone, mark it done
// when its prerequisites are done, and see what becomes unblocked, what is left and the critical
// path (the longest chain of remaining work, which sets the earliest finish).
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { SegControl, Readout, FigureLayout, Btn } from '../kit';

export interface Milestone {
  id: string;
  short: string;
  title: string;
  weeks: number;
  pre: string[];
  modules: string;
  accept: string[];
}

export const SLICE: Milestone[] = [
  { id: 'M1', short: 'Movement', title: 'Movement room', weeks: 2, pre: [], modules: 'c02, c03, c04', accept: ['Kai walks, dashes and jumps between two heights in a test room', 'the camera follows and stays inside the room', 'walking through a door loads the next room with a transition'] },
  { id: 'M2', short: 'Combat', title: 'Combat loop', weeks: 3, pre: ['M1'], modules: 'c05, k01', accept: ['Kai fights 3 slimes with a 3-hit string', 'each hit flashes, plays a sound, knocks back and has hitstop', 'slimes die; Kai can die and respawn'] },
  { id: 'M3', short: 'Enemies', title: 'Enemy roster', weeks: 3, pre: ['M2'], modules: 'k02', accept: ['slime, bat, skeleton and a slime variant, each with a readable telegraph', 'every enemy attack can be dodged on reaction'] },
  { id: 'M4', short: 'ATB', title: 'ATB, tactical mode, stagger', weeks: 4, pre: ['M2'], modules: 'k03, k04, m05', accept: ['hits fill 2 ATB segments', 'tactical mode slows time and spends ATB on an ability', 'filling an enemy\'s stagger gauge staggers it with a damage multiplier'] },
  { id: 'M5', short: 'Party', title: 'Party of three', weeks: 3, pre: ['M4'], modules: 'k05', accept: ['Kai, Lyra and Bram on the field; switch instantly', 'allies fight with AI and use ATB only when commanded'] },
  { id: 'M6', short: 'Gear', title: 'Stats, gear and shards', weeks: 3, pre: ['M4'], modules: 'r01, r02', accept: ['6 shards socket into gear and grant 6–8 abilities', 'damage follows the tested formula'] },
  { id: 'M7', short: 'Town', title: 'Town: dialogue, quest, shop', weeks: 3, pre: ['M1'], modules: 'r03, r04', accept: ['8 NPCs with dialogue', 'one quest from start to reward', 'a shop that sells items and a shard'] },
  { id: 'M8', short: 'Menus', title: 'Menus, HUD and saving', weeks: 3, pre: ['M6', 'M7'], modules: 'r05, r06', accept: ['party HUD with HP, MP, ATB', 'equipment and shard menus work with a gamepad', 'two save points; quitting and loading restores the world state'] },
  { id: 'M9', short: 'Areas', title: 'Field and dungeon', weeks: 4, pre: ['M3'], modules: 'c03, c04', accept: ['the field and a 6-room dungeon are playable', 'three puzzles use jumping between heights', 'encounters use all four enemy types'] },
  { id: 'M10', short: 'Golem', title: 'Golem boss', weeks: 3, pre: ['M5', 'M9'], modules: 'k02, k04', accept: ['three telegraphed attacks', 'stagger window', 'winnable with any controlled party member'] },
  { id: 'M11', short: 'Polish', title: 'Polish pass', weeks: 2, pre: ['M8', 'M10'], modules: 'p01', accept: ['music per area with crossfades', 'shaders, particles, lighting in the dungeon', 'no placeholder art or sound left'] },
  { id: 'M12', short: 'RC', title: 'Bug bash and release candidate', weeks: 2, pre: ['M11'], modules: 'p02, p03', accept: ['no open P1 or P2 bugs', 'a release build plays start to finish on Windows and a Deck', 'no frame over 16.7 ms on the critical path'] },
];

export const ROADMAP: Milestone[] = [
  { id: 'R1', short: 'Playtest', title: 'Slice playtests and fixes', weeks: 4, pre: [], modules: 'p02', accept: ['8+ fresh testers', 'top problems fixed'] },
  { id: 'R2', short: 'Store page', title: 'Store page and Coming Soon', weeks: 3, pre: ['R1'], modules: 'p03', accept: ['trailer, capsule, screenshots', 'page live'] },
  { id: 'R3', short: 'Demo', title: 'Next Fest demo', weeks: 3, pre: ['R1', 'R2'], modules: 'p03', accept: ['demo app with the slice', 'feedback link in the demo'] },
  { id: 'R4', short: 'Area 2', title: 'Content: second region', weeks: 10, pre: ['R1'], modules: 'c04, k02', accept: ['new tileset, 3 enemy types, a boss'] },
  { id: 'R5', short: 'Area 3', title: 'Content: third region', weeks: 10, pre: ['R4'], modules: 'c04, k02', accept: ['new tileset, 3 enemy types, a boss'] },
  { id: 'R6', short: 'Story', title: 'Story, quests, ending', weeks: 8, pre: ['R4'], modules: 'r04', accept: ['main quest complete', 'ending cutscene'] },
  { id: 'R7', short: 'Balance', title: 'Progression and balance', weeks: 4, pre: ['R5', 'R6'], modules: 'm05, r02', accept: ['level curve and shard AP tuned over the whole game'] },
  { id: 'R8', short: 'Languages', title: 'Localisation', weeks: 4, pre: ['R6'], modules: 'r05', accept: ['all text in translation files', 'one extra language'] },
  { id: 'R9', short: 'Beta', title: 'Beta branch and Deck checks', weeks: 4, pre: ['R7', 'R8'], modules: 'p03', accept: ['beta testers finish the game', 'Deck checklist passes'] },
  { id: 'R10', short: 'Launch', title: 'Launch', weeks: 2, pre: ['R3', 'R9'], modules: 'p03', accept: ['release build live on default', 'day-one patch plan'] },
];

/** depth = longest chain of prerequisites (for the column), remaining critical path in weeks */
function analyse(ms: Milestone[], done: Set<string>) {
  const byId = new Map(ms.map((m) => [m.id, m]));
  const depth = new Map<string, number>();
  const d = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    const m = byId.get(id)!;
    const v = m.pre.length ? 1 + Math.max(...m.pre.map(d)) : 0;
    depth.set(id, v);
    return v;
  };
  ms.forEach((m) => d(m.id));
  // earliest finish of remaining work: finish(m) = (done ? 0 : weeks) + max(finish(pre))
  const fin = new Map<string, number>();
  const f = (id: string): number => {
    if (fin.has(id)) return fin.get(id)!;
    const m = byId.get(id)!;
    const v = (done.has(id) ? 0 : m.weeks) + (m.pre.length ? Math.max(...m.pre.map(f)) : 0);
    fin.set(id, v);
    return v;
  };
  ms.forEach((m) => f(m.id));
  // walk back from the latest-finishing milestone to mark the critical path
  const crit = new Set<string>();
  let cur: Milestone | undefined = ms.reduce((a, b) => (f(b.id) > f(a.id) ? b : a));
  while (cur) {
    if (!done.has(cur.id)) crit.add(cur.id);
    const pres: Milestone[] = cur.pre.map((p) => byId.get(p)!);
    cur = pres.length ? pres.reduce((a, b) => (f(b.id) > f(a.id) ? b : a)) : undefined;
  }
  const critWeeks = Math.max(...ms.map((m) => f(m.id)));
  return { depth, crit, critWeeks };
}

export function MilestoneGraph({ spec }: { spec: VizSpec }) {
  const [plan, setPlan] = useState<'slice' | 'roadmap'>((spec.plan as 'slice' | 'roadmap') ?? 'slice');
  const ms = plan === 'slice' ? SLICE : ROADMAP;
  const [doneSets, setDoneSets] = useState<Record<string, string[]>>({ slice: [], roadmap: [] });
  const done = useMemo(() => new Set(doneSets[plan]), [doneSets, plan]);
  const [sel, setSel] = useState<string>(ms[0].id);
  const selected = ms.find((m) => m.id === sel) ?? ms[0];
  const { depth, crit, critWeeks } = useMemo(() => analyse(ms, done), [ms, done]);
  const ready = (m: Milestone) => !done.has(m.id) && m.pre.every((p) => done.has(p));
  const remaining = ms.filter((m) => !done.has(m.id)).reduce((a, m) => a + m.weeks, 0);

  const toggle = (m: Milestone) => {
    if (done.has(m.id)) {
      // un-marking also un-marks everything that depended on it
      const drop = new Set([m.id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const x of ms) if (!drop.has(x.id) && x.pre.some((p) => drop.has(p)) && done.has(x.id)) {
          drop.add(x.id);
          grew = true;
        }
      }
      setDoneSets((s) => ({ ...s, [plan]: s[plan].filter((id) => !drop.has(id)) }));
    } else if (ready(m)) setDoneSets((s) => ({ ...s, [plan]: [...s[plan], m.id] }));
  };

  // layout: one column per depth, nodes stacked
  const cols = Math.max(...[...depth.values()]) + 1;
  const W = 520, NW = 62, NH = 34;
  const colX = (c: number) => 8 + (c * (W - 16 - NW)) / Math.max(1, cols - 1);
  const perCol = new Map<number, Milestone[]>();
  ms.forEach((m) => perCol.set(depth.get(m.id)!, [...(perCol.get(depth.get(m.id)!) ?? []), m]));
  const maxRows = Math.max(...[...perCol.values()].map((v) => v.length));
  const H = 20 + maxRows * (NH + 18);
  const pos = new Map<string, [number, number]>();
  perCol.forEach((list, c) => list.forEach((m, i) => pos.set(m.id, [colX(c), 10 + (i + (maxRows - list.length) / 2) * (NH + 18)])));
  const fill = (m: Milestone) => (done.has(m.id) ? 'var(--ok)' : ready(m) ? 'var(--accent-soft)' : 'var(--surface2)');
  const stroke = (m: Milestone) => (done.has(m.id) ? 'var(--ok)' : ready(m) ? 'var(--accent)' : crit.has(m.id) ? 'var(--c-v)' : 'var(--line)');

  return (
    <FigureLayout
      side={
        <>
          <SegControl
            label="plan"
            value={plan}
            options={[
              { v: 'slice', label: 'vertical slice' },
              { v: 'roadmap', label: 'after the slice' },
            ]}
            onChange={(v) => {
              setPlan(v);
              setSel((v === 'slice' ? SLICE : ROADMAP)[0].id);
            }}
          />
          <div className="ship-note">
            <b>
              {selected.id} {selected.title}
            </b>{' '}
            ({selected.weeks} wk, {selected.modules})
          </div>
          <ul className="ship-note" style={{ margin: 0, paddingLeft: 18 }}>
            {selected.accept.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          {!done.has(selected.id) && !ready(selected) && <div className="ship-warn">Blocked by {selected.pre.filter((p) => !done.has(p)).join(', ')}.</div>}
          <Btn primary={ready(selected)} disabled={!done.has(selected.id) && !ready(selected)} onClick={() => toggle(selected)}>
            {done.has(selected.id) ? 'Undo (and dependents)' : 'Acceptance met: mark done'}
          </Btn>
          <Readout
            rows={[
              ['\\text{done}', `${done.size} / ${ms.length}`],
              ['\\text{ready now}', ms.filter(ready).map((m) => m.id).join(', ') || '-'],
              ['\\text{work left}', `${remaining} weeks`],
              ['\\text{critical path}', `${critWeeks} weeks`],
            ]}
          />
        </>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="ship-svg" role="group" aria-label="milestone dependency graph">
        <defs>
          <marker id="ms-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--muted)' }} />
          </marker>
        </defs>
        {ms.flatMap((m) =>
          m.pre.map((p) => {
            const [x1, y1] = pos.get(p)!, [x2, y2] = pos.get(m.id)!;
            const onCrit = crit.has(m.id) && crit.has(p);
            const sx = x1 + NW, sy = y1 + NH / 2, ex = x2, ey = y2 + NH / 2, mx = (sx + ex) / 2;
            return <path key={p + m.id} d={`M${sx},${sy} C${mx},${sy} ${mx},${ey} ${ex - 2},${ey}`} fill="none" markerEnd="url(#ms-arrow)" style={{ stroke: onCrit ? 'var(--c-v)' : 'var(--muted)', strokeWidth: onCrit ? 2 : 1, opacity: onCrit ? 1 : 0.6 }} />;
          }),
        )}
        {ms.map((m) => {
          const [x, y] = pos.get(m.id)!;
          return (
            <g
              key={m.id}
              className="ship-ms"
              tabIndex={0}
              role="button"
              aria-label={`${m.id} ${m.title}: ${done.has(m.id) ? 'done' : ready(m) ? 'ready' : 'blocked'}`}
              onClick={() => (sel === m.id ? toggle(m) : setSel(m.id))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (sel === m.id) toggle(m);
                  else setSel(m.id);
                }
              }}
            >
              <rect x={x} y={y} width={NW} height={NH} rx={6} style={{ fill: fill(m), stroke: stroke(m), strokeWidth: sel === m.id ? 3 : 1.5 }} />
              <text x={x + NW / 2} y={y + 14} textAnchor="middle" style={{ fontWeight: 700, fill: done.has(m.id) ? 'var(--surface)' : undefined }}>
                {m.id}
              </text>
              <text x={x + NW / 2} y={y + 27} textAnchor="middle" style={{ fontSize: 10, fill: done.has(m.id) ? 'var(--surface)' : undefined }}>
                {m.short}
              </text>
            </g>
          );
        })}
      </svg>
    </FigureLayout>
  );
}
