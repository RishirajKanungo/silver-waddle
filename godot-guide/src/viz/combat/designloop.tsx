// combat.designloop: the hybrid combat loop as a resource-flow diagram you step through.
// Hits fill ATB and the stagger meter; ATB buys abilities; weakness hits and some abilities
// pressure the enemy; a full meter staggers it, and the damage multiplier pays off the ATB you saved.
import type { VizSpec } from '../../content/types';
import { usePlayer, FigureLayout, Readout } from '../kit';
import './combat.css';

type NodeId = 'hits' | 'guard' | 'atb' | 'abil' | 'press' | 'meter' | 'stag' | 'mult' | 'hp';
const NODES: Record<NodeId, { x: number; y: number; label: string; sub: string }> = {
  hits: { x: 80, y: 160, label: 'Basic attacks', sub: 'real time' },
  guard: { x: 80, y: 60, label: 'Guard / dodge', sub: 'real time' },
  atb: { x: 250, y: 60, label: 'ATB gauge', sub: '2 segments' },
  abil: { x: 430, y: 60, label: 'Abilities', sub: 'spells, items' },
  press: { x: 430, y: 160, label: 'Pressure', sub: 'gain ×2' },
  meter: { x: 250, y: 160, label: 'Stagger meter', sub: 'fills, decays' },
  stag: { x: 250, y: 250, label: 'Staggered', sub: 'helpless 6 s' },
  mult: { x: 430, y: 250, label: 'Damage ×1.6+', sub: 'multiplier' },
  hp: { x: 80, y: 250, label: 'Enemy HP', sub: '' },
};
type Edge = [NodeId, NodeId, string];
const EDGES: Edge[] = [
  ['hits', 'atb', '+11 / hit'],
  ['guard', 'atb', '+8 / block'],
  ['atb', 'abil', '1 segment'],
  ['hits', 'meter', '+3 / hit'],
  ['abil', 'meter', '+14 to +30'],
  ['abil', 'press', 'weakness, bash'],
  ['press', 'meter', '×2 gain'],
  ['meter', 'stag', 'full'],
  ['stag', 'mult', '×1.60'],
  ['abil', 'mult', 'Focus +0.25'],
  ['mult', 'hp', 'bigger hits'],
  ['hits', 'hp', 'damage'],
];

interface Step {
  text: string;
  edges: number[];
  atb: number;
  meter: number;
  state: 'normal' | 'pressured' | 'staggered';
  mult: number;
  hp: number;
}
// A scripted exchange: Kai and Lyra against a skeleton (300 HP, stagger_max 100, weak to ice).
const STEPS: Step[] = [
  { text: 'The fight starts. Every number is at rest: no ATB, an empty stagger meter, a normal damage multiplier.', edges: [], atb: 0, meter: 0, state: 'normal', mult: 1, hp: 300 },
  { text: 'Kai lands a three-hit string. Each hit adds 11 ATB and 3 stagger, and deals about 7 damage.', edges: [0, 3, 11], atb: 33, meter: 9, state: 'normal', mult: 1, hp: 279 },
  { text: 'Two more strings and a second of passive charge: the first ATB segment fills (the gauge emits segment_filled and the HUD flashes).', edges: [0, 3, 11], atb: 101, meter: 27, state: 'normal', mult: 1, hp: 237 },
  { text: 'The skeleton winds up. Kai guards: the blocked hit costs a few HP and still adds 8 ATB. Defence feeds offence.', edges: [1], atb: 109, meter: 27, state: 'normal', mult: 1, hp: 237 },
  { text: 'Kai strikes during its next windup. Punishing the windup puts it in the pressured state: stagger gain is doubled for 4 s, so the string adds 3 × 3 × 2 = 18.', edges: [0, 3, 11], atb: 142, meter: 45, state: 'pressured', mult: 1, hp: 214 },
  { text: 'Tactical mode (time ×0.1). You command Lyra: Blizzard hits the ice weakness for ×1.5 damage and 14 × 1.5 × 2 = 42 stagger, and refreshes the pressure.', edges: [2, 4, 5, 6], atb: 142, meter: 87, state: 'pressured', mult: 1, hp: 160 },
  { text: 'One more pressured string from Kai (+33 ATB, +18 stagger) fills the meter: staggered. Damage is now ×1.60 for 6 s.', edges: [0, 3, 6, 7, 8], atb: 175, meter: 100, state: 'staggered', mult: 1.6, hp: 137 },
  { text: 'Basic hits during the stagger deal ×1.60 and keep filling ATB. Kai now has two full segments.', edges: [0, 10, 11], atb: 200, meter: 85, state: 'staggered', mult: 1.6, hp: 100 },
  { text: 'Tactical mode again. On a staggered target Focus Strike raises the multiplier instead of the meter: ×1.60 becomes ×1.85.', edges: [2, 9], atb: 100, meter: 70, state: 'staggered', mult: 1.85, hp: 83 },
  { text: 'Braver with the last segment: 7 × 4 × 1.85 ≈ 52 damage. The ATB saved before the stagger is worth 85% more now.', edges: [2, 10], atb: 0, meter: 55, state: 'staggered', mult: 1.85, hp: 31 },
  { text: 'The stagger ends after 6 s: the meter resets to 0 and the multiplier to ×1.00. The loop starts again, and the skeleton has 31 HP left.', edges: [], atb: 12, meter: 0, state: 'normal', mult: 1, hp: 31 },
];

export function DesignLoop({ spec }: { spec: VizSpec }) {
  const { i, controls } = usePlayer(STEPS.length, { interval: (spec.interval as number) ?? 2600 });
  const s = STEPS[i];
  const Wd = 520, Hh = 300;
  const active = new Set(s.edges);
  const nodeOn = new Set<NodeId>();
  s.edges.forEach((k) => {
    nodeOn.add(EDGES[k][0]);
    nodeOn.add(EDGES[k][1]);
  });
  const bw = 112, bh = 38;
  const anchor = (a: NodeId, b: NodeId): [number, number, number, number] => {
    const A = NODES[a], B = NODES[b];
    const dx = B.x - A.x, dy = B.y - A.y;
    const clip = (n: { x: number; y: number }, ux: number, uy: number): [number, number] => {
      const tx = Math.abs(ux) > 1e-6 ? bw / 2 / Math.abs(ux) : Infinity;
      const ty = Math.abs(uy) > 1e-6 ? bh / 2 / Math.abs(uy) : Infinity;
      const t = Math.min(tx, ty) + 4;
      return [n.x + ux * t, n.y + uy * t];
    };
    const d = Math.hypot(dx, dy);
    const [x1, y1] = clip(A, dx / d, dy / d);
    const [x2, y2] = clip(B, -dx / d, -dy / d);
    return [x1, y1, x2, y2];
  };
  return (
    <FigureLayout
      side={
        <>
          <Readout
            title={`step ${i + 1} of ${STEPS.length}`}
            rows={[
              ['\\text{Kai ATB}', `${s.atb} / 200 (${Math.floor(s.atb / 100)} seg)`],
              ['\\text{stagger meter}', `${s.meter} / 100`],
              ['\\text{state}', s.state],
              ['\\text{damage multiplier}', '×' + s.mult.toFixed(2)],
              ['\\text{skeleton HP}', `${s.hp} / 300`],
            ]}
          />
          <p className="combat-note">{s.text}</p>
        </>
      }
      below={controls}
    >
      <svg viewBox={`0 0 ${Wd} ${Hh}`} className="combat-svg" role="img" aria-label="combat loop diagram: hits, ATB, abilities, pressure, stagger, damage multiplier">
        <defs>
          <marker id="dl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
          </marker>
        </defs>
        {EDGES.map(([a, b, label], k) => {
          const [x1, y1, x2, y2] = anchor(a, b);
          const on = active.has(k);
          // the multiplier → HP edge would cross the diagram: route it under the boxes
          const curved = a === 'mult' && b === 'hp';
          const path = curved ? `M${x1},${y1 + 10} C${x1 - 40},${Hh - 6} ${x2 + 40},${Hh - 6} ${x2},${y2 + 10}` : `M${x1},${y1} L${x2},${y2}`;
          const mx = curved ? (x1 + x2) / 2 : (x1 + x2) / 2, my = curved ? Hh - 14 : (y1 + y2) / 2;
          return (
            <g key={k} opacity={on ? 1 : 0.35}>
              <path d={path} fill="none" stroke={on ? 'var(--accent)' : 'var(--muted)'} strokeWidth={on ? 2.6 : 1.4} markerEnd="url(#dl-arrow)" />
              <text x={mx + (a === 'hits' && b === 'hp' ? -30 : a === 'hits' && b === 'atb' ? -18 : 0)} y={my - 4} fontSize={10.5} textAnchor="middle" style={{ fill: on ? 'var(--accent)' : 'var(--muted)', fontWeight: on ? 700 : 400 }}>
                {label}
              </text>
            </g>
          );
        })}
        {(Object.keys(NODES) as NodeId[]).map((id) => {
          const n = NODES[id];
          const on = nodeOn.has(id) || (id === 'stag' && s.state === 'staggered') || (id === 'press' && s.state === 'pressured');
          let fillFrac = -1;
          if (id === 'atb') fillFrac = s.atb / 200;
          if (id === 'meter') fillFrac = s.meter / 100;
          if (id === 'hp') fillFrac = s.hp / 300;
          return (
            <g key={id}>
              <rect x={n.x - bw / 2} y={n.y - bh / 2} width={bw} height={bh} rx={6} fill="var(--surface)" stroke={on ? 'var(--accent)' : 'var(--line)'} strokeWidth={on ? 2.4 : 1.2} />
              <text x={n.x} y={n.y - 3} fontSize={12} fontWeight={600} textAnchor="middle">
                {id === 'mult' ? `Damage ×${s.mult.toFixed(2)}` : n.label}
              </text>
              {fillFrac >= 0 ? (
                <g>
                  <rect x={n.x - 44} y={n.y + 5} width={88} height={6} rx={2} fill="var(--surface2)" stroke="var(--line)" />
                  <rect x={n.x - 44} y={n.y + 5} width={88 * Math.min(1, fillFrac)} height={6} rx={2} fill={id === 'hp' ? 'var(--ok)' : id === 'atb' ? 'var(--c-u)' : s.state === 'staggered' ? 'var(--bad)' : 'var(--c-v)'} />
                  {id === 'atb' && <line x1={n.x} x2={n.x} y1={n.y + 4} y2={n.y + 12} stroke="var(--fg)" />}
                </g>
              ) : (
                <text x={n.x} y={n.y + 12} fontSize={10} textAnchor="middle" style={{ fill: 'var(--muted)' }}>
                  {id === 'press' ? (s.state === 'pressured' ? 'active' : n.sub) : id === 'stag' ? (s.state === 'staggered' ? 'active' : n.sub) : n.sub}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </FigureLayout>
  );
}
