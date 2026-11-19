// combat.designspace: "who waits for whom" in five combat systems. A 16-second strip of real time
// shows what the player is doing (deciding, acting, waiting), how fast the world runs, and when
// enemy attacks land. The hybrid row exposes the tactical time scale.
import { useMemo, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Slider, SegControl, Readout, FigureLayout } from '../kit';
import './combat.css';

type Sys = 'turn' | 'atb' | 'atbwait' | 'action' | 'hybrid';
type Act = 'decide' | 'act' | 'wait';
interface Seg {
  t0: number;
  t1: number;
  act: Act;
  scale: number; // world seconds per real second
  label?: string;
}
const T = 16;
const ENEMY_PERIOD = 2.5; // world seconds between enemy attacks (real-time systems)

function build(sys: Sys, think: number, tscale: number): Seg[] {
  const out: Seg[] = [];
  let t = 0;
  const push = (d: number, act: Act, scale: number, label?: string) => {
    if (t >= T) return;
    out.push({ t0: t, t1: Math.min(T, t + d), act, scale, label });
    t += d;
  };
  while (t < T) {
    if (sys === 'turn') {
      push(think, 'decide', 0, 'menu');
      push(1, 'act', 1, 'your move');
      push(1.2, 'wait', 1, 'enemy turn');
    } else if (sys === 'atb' || sys === 'atbwait') {
      push(3, 'wait', 1, 'gauge fills');
      push(think, 'decide', sys === 'atb' ? 1 : 0, 'menu');
      push(1, 'act', 1, 'action');
    } else if (sys === 'action') {
      push(T, 'act', 1, 'real-time control');
    } else {
      push(3, 'act', 1, 'attack, guard, dodge');
      push(think, 'decide', tscale, 'tactical');
      push(0.6, 'act', 1, 'ability');
    }
  }
  return out;
}

/** enemy attacks, in real time, and what the player is doing when each lands */
function attacks(sys: Sys, segs: Seg[]): { t: number; kind: 'menu' | 'react' | 'scripted' }[] {
  const out: { t: number; kind: 'menu' | 'react' | 'scripted' }[] = [];
  if (sys === 'turn') {
    for (const s of segs) if (s.label === 'enemy turn') out.push({ t: (s.t0 + s.t1) / 2, kind: 'scripted' });
    return out;
  }
  // walk real time, accumulating world time; an attack lands every ENEMY_PERIOD world seconds
  let world = 0;
  let next = ENEMY_PERIOD * 0.6;
  for (const s of segs) {
    if (s.scale <= 0) continue;
    const dur = s.t1 - s.t0;
    const w1 = world + dur * s.scale;
    while (next <= w1) {
      const t = s.t0 + (next - world) / s.scale;
      out.push({ t, kind: s.act === 'decide' ? 'menu' : sys === 'atb' || sys === 'atbwait' ? 'scripted' : 'react' });
      next += ENEMY_PERIOD;
    }
    world = w1;
  }
  return out;
}

const SYS_LABEL: Record<Sys, string> = { turn: 'Turn-based', atb: 'ATB (active)', atbwait: 'ATB (wait)', action: 'Action', hybrid: 'Hybrid' };

export function DesignSpace({ spec }: { spec: VizSpec }) {
  const [think, setThink] = useState((spec.think as number) ?? 2.5);
  const [tscale, setTscale] = useState((spec.timeScale as number) ?? 0.1);
  const [focus, setFocus] = useState<Sys>('hybrid');
  const rows = useMemo(() => (['turn', 'atb', 'atbwait', 'action', 'hybrid'] as Sys[]).map((s) => ({ sys: s, segs: build(s, think, tscale), })).map((r) => ({ ...r, hits: attacks(r.sys, r.segs) })), [think, tscale]);

  const Wd = 520, L = 92, R = 8, rowH = 50, top = 22;
  const sx = (t: number) => L + (t / T) * (Wd - L - R);
  const base = top + rows.length * rowH;
  const Hh = base + 40;
  const fill: Record<Act, string> = { decide: 'var(--c-u)', act: 'var(--ok)', wait: 'var(--muted)' };

  const f = rows.find((r) => r.sys === focus)!;
  const total = (a: Act) => f.segs.filter((s) => s.act === a).reduce((x, s) => x + (s.t1 - s.t0), 0);
  const worldPerDecision = focus === 'action' ? 0 : think * (focus === 'turn' || focus === 'atbwait' ? 0 : focus === 'atb' ? 1 : tscale);
  const menuHits = f.hits.filter((h) => h.kind === 'menu').length;
  const reactHits = f.hits.filter((h) => h.kind === 'react').length;

  return (
    <FigureLayout
      side={
        <>
          <Slider label="think time per decision (s)" value={think} min={0.5} max={6} step={0.25} onChange={setThink} fmt={(v) => v.toFixed(2)} />
          <Slider label="hybrid tactical time scale" value={tscale} min={0} max={1} step={0.05} onChange={setTscale} fmt={(v) => '×' + v.toFixed(2)} />
          <SegControl label="details for" value={focus} onChange={setFocus} options={(['turn', 'atb', 'atbwait', 'action', 'hybrid'] as Sys[]).map((s) => ({ v: s, label: SYS_LABEL[s].replace(' (', ' (') }))} />
          <Readout
            title={SYS_LABEL[focus]}
            rows={[
              ['\\text{deciding}', `${((100 * total('decide')) / T).toFixed(0)}% of the time`],
              ['\\text{acting}', `${((100 * total('act')) / T).toFixed(0)}%`],
              ['\\text{waiting}', `${((100 * total('wait')) / T).toFixed(0)}%`],
              ['\\text{world time per decision}', `${worldPerDecision.toFixed(2)} s`],
              ['\\text{hits while in a menu}', String(menuHits)],
              ['\\text{hits to react to}', String(reactHits)],
            ]}
          />
        </>
      }
    >
      <svg viewBox={`0 0 ${Wd} ${Hh}`} className="combat-svg" role="img" aria-label="timelines of five combat systems over 16 seconds of real time">
        {[0, 4, 8, 12, 16].map((t) => (
          <g key={t}>
            <line x1={sx(t)} x2={sx(t)} y1={top - 6} y2={base} stroke="var(--line)" />
            <text x={sx(t)} y={base + 12} fontSize={11} textAnchor="middle" style={{ fill: 'var(--muted)' }}>
              {t} s
            </text>
          </g>
        ))}
        <text x={L} y={12} fontSize={11} style={{ fill: 'var(--muted)' }}>
          real time (what the player experiences)
        </text>
        {rows.map((r, i) => {
          const y = top + i * rowH;
          const on = r.sys === focus;
          return (
            <g key={r.sys} onClick={() => setFocus(r.sys)} style={{ cursor: 'pointer' }} opacity={on ? 1 : 0.62}>
              <text x={4} y={y + 16} fontSize={12} fontWeight={on ? 700 : 500}>
                {SYS_LABEL[r.sys]}
              </text>
              <text x={4} y={y + 34} fontSize={10} style={{ fill: 'var(--muted)' }}>
                world speed
              </text>
              {r.segs.map((s, k) => (
                <g key={k}>
                  <rect x={sx(s.t0) + 0.5} y={y + 4} width={Math.max(0, sx(s.t1) - sx(s.t0) - 1)} height={16} fill={fill[s.act]} opacity={0.85} rx={2} />
                  {/* world speed: bar height is the time scale */}
                  <rect x={sx(s.t0)} y={y + 40 - 12 * s.scale} width={Math.max(0, sx(s.t1) - sx(s.t0))} height={Math.max(1, 12 * s.scale)} fill="var(--c-v)" opacity={0.55} />
                </g>
              ))}
              {r.hits.map((h, k) => (
                <g key={'h' + k}>
                  <circle cx={sx(h.t)} cy={y + 12} r={4.2} fill={h.kind === 'menu' ? 'var(--bad)' : h.kind === 'react' ? 'var(--warn)' : 'var(--surface)'} stroke="var(--fg)" strokeWidth={1} />
                </g>
              ))}
            </g>
          );
        })}
        <g transform={`translate(${L - 80}, ${Hh - 6})`} fontSize={10.5}>
          {(
            [
              ['var(--c-u)', 'deciding'],
              ['var(--ok)', 'acting'],
              ['var(--muted)', 'waiting'],
            ] as const
          ).map(([c, l], k) => (
            <g key={l} transform={`translate(${k * 78}, 0)`}>
              <rect x={0} y={-8} width={10} height={9} fill={c} rx={2} />
              <text x={14} y={0}>
                {l}
              </text>
            </g>
          ))}
          <g transform="translate(236, 0)">
            <circle cx={4} cy={-4} r={4} fill="var(--bad)" stroke="var(--fg)" />
            <text x={11} y={0}>hit in a menu</text>
            <circle cx={92} cy={-4} r={4} fill="var(--warn)" stroke="var(--fg)" />
            <text x={99} y={0}>hit to react to</text>
          </g>
        </g>
      </svg>
    </FigureLayout>
  );
}
