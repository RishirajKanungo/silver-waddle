// ship.launch — plan a Steam launch backwards from the release date. The learner picks the launch
// date and a Steam Next Fest edition (Valve announces the dates; enter a real one), and how long the
// Coming Soon page should collect wishlists. The planner works out when to pay the fee, submit the
// store page, have the demo ready, and checks the plan against Steamworks rules (whose current
// values the learner should confirm in the Steamworks documentation).
import { useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Slider, Readout, FigureLayout } from '../kit';

const DAY = 864e5;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const fmtD = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export function LaunchPlanner({ spec }: { spec: VizSpec }) {
  const today = new Date(new Date().toISOString().slice(0, 10));
  const [launch, setLaunch] = useState(iso(addDays(today, (spec.months as number | undefined) ? (spec.months as number) * 30 : 365)));
  const [fest, setFest] = useState(iso(addDays(today, 270)));
  const [useFest, setUseFest] = useState(true);
  const [csWeeks, setCsWeeks] = useState(30); // Coming Soon lead
  const [demoWeeks, setDemoWeeks] = useState(4); // demo ready before the festival
  const [minCs, setMinCs] = useState(2); // Steamworks minimum Coming Soon period (check docs)
  const [feeWait, setFeeWait] = useState(30); // days between paying the fee and release (check docs)

  const L = new Date(launch), F = new Date(fest);
  const pageLive = addDays(L, -csWeeks * 7);
  const pageSubmit = addDays(pageLive, -7); // Valve reviews the store page; allow a week
  const feePaid = addDays(pageSubmit, -14); // app ID, Steamworks setup, capsule art
  const demoReady = addDays(F, -demoWeeks * 7);
  const buildReview = addDays(L, -14); // release build submitted for review
  const events = [
    { d: feePaid, label: 'pay Steam Direct fee', k: 'admin' },
    { d: pageSubmit, label: 'store page to review', k: 'admin' },
    { d: pageLive, label: 'Coming Soon page live', k: 'page' },
    ...(useFest ? [{ d: demoReady, label: 'demo ready', k: 'demo' }, { d: F, label: 'Next Fest', k: 'demo' }] : []),
    { d: buildReview, label: 'release build to review', k: 'admin' },
    { d: L, label: 'launch', k: 'launch' },
  ].sort((a, b) => a.d.getTime() - b.d.getTime());

  const warn: string[] = [];
  if (pageLive < today) warn.push('The Coming Soon page would have to be live already: move the launch or shorten the lead.');
  if (feePaid < today) warn.push('The fee and Steamworks setup would have to be done already.');
  if ((L.getTime() - pageLive.getTime()) / DAY < minCs * 7) warn.push(`The page is visible for less than the ${minCs}-week minimum Coming Soon period.`);
  if ((L.getTime() - feePaid.getTime()) / DAY < feeWait) warn.push(`Less than ${feeWait} days between paying the fee and launch.`);
  if (useFest && F >= L) warn.push('Next Fest is for unreleased games: the festival must come before launch.');
  if (useFest && F < pageLive) warn.push('The festival is before the store page goes live: wishlists from the demo need a page to land on.');
  if (useFest && demoReady < today) warn.push('The demo would have to be ready already.');

  const t0 = Math.min(today.getTime(), ...events.map((e) => e.d.getTime())) - 15 * DAY;
  const t1 = L.getTime() + 30 * DAY;
  const W = 520, X0 = 12, X1 = W - 12;
  const sx = (t: number) => X0 + ((t - t0) / (t1 - t0)) * (X1 - X0);
  const color = (k: string) => (k === 'launch' ? 'var(--accent)' : k === 'demo' ? 'var(--c-v)' : k === 'page' ? 'var(--c-w)' : 'var(--c-u)');
  // month ticks
  const ticks: Date[] = [];
  for (let d = new Date(new Date(t0).getFullYear(), new Date(t0).getMonth() + 1, 1); d.getTime() < t1; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) ticks.push(d);
  const step = Math.ceil(ticks.length / 9);

  return (
    <FigureLayout
      side={
        <>
          <label className="ctl-slider" style={{ gridTemplateColumns: 'auto 1fr' }}>
            <span className="ctl-label">launch</span>
            <input type="date" value={launch} onChange={(e) => e.target.value && setLaunch(e.target.value)} />
          </label>
          <label className="ctl-slider" style={{ gridTemplateColumns: 'auto 1fr' }}>
            <span className="ctl-label">Next Fest</span>
            <input type="date" value={fest} disabled={!useFest} onChange={(e) => e.target.value && setFest(e.target.value)} />
          </label>
          <label className="ctl-toggle">
            <input type="checkbox" checked={useFest} onChange={(e) => setUseFest(e.target.checked)} />
            <span>enter a Next Fest with a demo</span>
          </label>
          <Slider label="Coming Soon lead" value={csWeeks} min={1} max={78} step={1} onChange={setCsWeeks} fmt={(v) => v + ' wk'} />
          {useFest && <Slider label="demo before fest" value={demoWeeks} min={1} max={12} step={1} onChange={setDemoWeeks} fmt={(v) => v + ' wk'} />}
          <div className="ship-note">Steamworks rules (confirm the current values in the Steamworks documentation):</div>
          <Slider label="min Coming Soon" value={minCs} min={0} max={8} step={1} onChange={setMinCs} fmt={(v) => v + ' wk'} />
          <Slider label="fee to launch" value={feeWait} min={0} max={60} step={1} onChange={setFeeWait} fmt={(v) => v + ' d'} />
          <Readout
            rows={[
              ['\\text{page collects wishlists for}', `${csWeeks} weeks`],
              ['\\text{weeks until launch}', `${Math.round((L.getTime() - today.getTime()) / DAY / 7)}`],
            ]}
          />
        </>
      }
      below={
        <div className="ship-wide">
          <table className="ship-table">
            <tbody>
              {events.map((e) => (
                <tr key={e.label}>
                  <td style={{ color: color(e.k) }}>■</td>
                  <td>{e.label}</td>
                  <td className="num">{fmtD(e.d)}</td>
                  <td className="num">{e.d < today ? <span className="ship-bad">in the past</span> : `in ${Math.round((e.d.getTime() - today.getTime()) / DAY / 7)} wk`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {warn.length > 0 ? (
            warn.map((w) => (
              <div key={w} className="ship-warn">
                {w}
              </div>
            ))
          ) : (
            <div className="ship-ok" style={{ fontSize: 13 }}>
              The plan passes every check.
            </div>
          )}
        </div>
      }
    >
      <svg viewBox={`0 0 ${W} 190`} className="ship-svg" role="img" aria-label="launch timeline">
        <rect x={sx(pageLive.getTime())} y={70} width={Math.max(0, sx(L.getTime()) - sx(pageLive.getTime()))} height={14} rx={3} style={{ fill: 'var(--c-w)', opacity: 0.25 }} />
        <text x={(sx(pageLive.getTime()) + sx(L.getTime())) / 2} y={81} textAnchor="middle" className="muted">
          wishlists
        </text>
        <line x1={X0} x2={X1} y1={100} y2={100} className="ax" />
        {ticks.map((d, i) =>
          i % step === 0 ? (
            <g key={d.getTime()}>
              <line x1={sx(d.getTime())} x2={sx(d.getTime())} y1={96} y2={104} className="ax" />
              <text x={sx(d.getTime())} y={118} textAnchor="middle" className="muted" style={{ fontSize: 10 }}>
                {d.toLocaleDateString('en-GB', { month: 'short' })}
                {d.getMonth() === 0 ? ` ${String(d.getFullYear()).slice(2)}` : ''}
              </text>
            </g>
          ) : null,
        )}
        <line x1={sx(today.getTime())} x2={sx(today.getTime())} y1={40} y2={104} style={{ stroke: 'var(--fg)', strokeDasharray: '2 3' }} />
        <text x={sx(today.getTime()) + 3} y={46} style={{ fontSize: 10 }}>
          today
        </text>
        {events.map((e, i) => {
          const x = sx(e.d.getTime());
          const up = i % 2 === 0;
          const ly = up ? 56 - ((i / 2) % 2) * 26 : 146 + (((i - 1) / 2) % 2) * 26;
          return (
            <g key={e.label}>
              <circle cx={x} cy={100} r={5} style={{ fill: color(e.k) }} />
              <line x1={x} x2={x} y1={up ? 95 : 105} y2={up ? ly + 4 : ly - 11} style={{ stroke: color(e.k) }} />
              <text x={Math.min(Math.max(x, 50), W - 50)} y={ly} textAnchor="middle" style={{ fontSize: 10.5 }}>
                {e.label}
              </text>
            </g>
          );
        })}
      </svg>
    </FigureLayout>
  );
}
