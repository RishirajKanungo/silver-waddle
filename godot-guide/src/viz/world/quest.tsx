// rpg.quest — quests computed from story flags (r04-3). Every button changes flags only, like the game's
// herbs, slimes and dialogue. GameState.set_flag() emits flag_changed when a value changes, then
// _refresh_quests() recomputes each QuestData.step_text(flags) and emits quest_updated only when it changed.
import { useMemo, useRef, useState } from 'react';
import type { VizSpec } from '../../content/types';
import { Toggle, FigureLayout, Btn } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { playSound } from '../game';

type Flags = Record<string, number>;
interface Step {
  description: string;
  flag: string;
  target: number;
}
interface Quest {
  id: string;
  title: string;
  start_flag: string;
  steps: Step[];
}
const QUESTS: Quest[] = [
  {
    id: 'moonherbs',
    title: 'Moonherbs for the festival',
    start_flag: 'herbs_started',
    steps: [
      { description: 'Gather moonherbs', flag: 'herbs', target: 3 },
      { description: 'Return to Elder Maren', flag: 'herbs_returned', target: 1 },
    ],
  },
  {
    id: 'silent_well',
    title: 'The silent well',
    start_flag: 'well_seen',
    steps: [
      { description: 'Clear the slimes at the well', flag: 'slimes_well', target: 4 },
      { description: 'Tell the elder', flag: 'well_reported', target: 1 },
    ],
  },
];
const get = (f: Flags, k: string) => f[k] ?? 0;
/** QuestData.current_step(flags) */
function currentStep(q: Quest, f: Flags) {
  if (get(f, q.start_flag) <= 0) return -1;
  for (let i = 0; i < q.steps.length; i++) if (get(f, q.steps[i].flag) < q.steps[i].target) return i;
  return q.steps.length;
}
/** QuestData.step_text(flags) */
function stepText(q: Quest, f: Flags) {
  const i = currentStep(q, f);
  if (i < 0) return '';
  if (i >= q.steps.length) return 'Complete';
  const s = q.steps[i];
  if (s.target <= 1) return s.description;
  return `${s.description} (${Math.min(get(f, s.flag), s.target)}/${s.target})`;
}

interface LogLine {
  id: number;
  kind: 'event' | 'flag' | 'quest' | 'note';
  text: string;
}
const STAGES = ['world', 'set_flag', 'flag_changed', 'refresh', 'quest_updated', 'toast'] as const;
type Stage = (typeof STAGES)[number];
const STAGE_LABEL: Record<Stage, [string, string]> = {
  world: ['world event', 'herb/slime/talk'],
  set_flag: ['GameState', '.set_flag()'],
  flag_changed: ['Events', '.flag_changed'],
  refresh: ['GameState', '._refresh_quests'],
  quest_updated: ['Events', '.quest_updated'],
  toast: ['quest toast', 'ui/quest_toast.gd'],
};

export function QuestFigure(_: { spec: VizSpec }) {
  const [flags, setFlags] = useState<Flags>({});
  const [countEarly, setCountEarly] = useState(true);
  const [log, setLog] = useState<LogLine[]>([]);
  const [lit, setLit] = useState<{ stages: Set<Stage>; n: number }>({ stages: new Set(), n: 0 });
  const [toast, setToast] = useState<{ text: string; n: number } | null>(null);
  const lastText = useRef<Record<string, string>>({ moonherbs: '', silent_well: '' });
  const nextId = useRef(1);
  const toastTimer = useRef<number | null>(null);

  /** Run a world event: a label and a function that calls set(flag, value) any number of times. */
  const act = (label: string, fn: (f: Flags, set: (k: string, v: number) => void, note: (s: string) => void) => void) => {
    let f = { ...flags };
    const lines: LogLine[] = [{ id: nextId.current++, kind: 'event', text: label }];
    const stages = new Set<Stage>(['world']);
    let lastToast: string | null = null;
    const set = (k: string, v: number) => {
      stages.add('set_flag');
      if (get(f, k) === v) {
        lines.push({ id: nextId.current++, kind: 'note', text: `set_flag("${k}", ${v}): no change, no signal` });
        return;
      }
      f = { ...f, [k]: v };
      stages.add('flag_changed');
      stages.add('refresh');
      lines.push({ id: nextId.current++, kind: 'flag', text: `Events.flag_changed.emit("${k}", ${v})` });
      for (const q of QUESTS) {
        const now = stepText(q, f);
        if (now !== lastText.current[q.id]) {
          lastText.current[q.id] = now;
          stages.add('quest_updated');
          stages.add('toast');
          lines.push({ id: nextId.current++, kind: 'quest', text: `Events.quest_updated.emit("${q.id}")` });
          lastToast = `${q.title}: ${now}`;
        }
      }
    };
    const note = (s: string) => lines.push({ id: nextId.current++, kind: 'note', text: s });
    fn(f, set, note);
    setFlags(f);
    setLog((l) => [...lines.reverse(), ...l].slice(0, 40));
    setLit((x) => ({ stages, n: x.n + 1 }));
    if (lastToast) {
      setToast((x) => ({ text: lastToast!, n: (x?.n ?? 0) + 1 }));
      playSound('sfx_menu_select', 0.35);
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setToast(null), 2400);
    }
  };

  const add = (f: Flags, set: (k: string, v: number) => void, k: string, n = 1) => set(k, get(f, k) + n);

  const events: { label: string; run: () => void }[] = [
    {
      label: 'Talk to Elder Maren',
      run: () =>
        act('Talk to Elder Maren', (f, set, note) => {
          if (!get(f, 'herbs_started')) {
            note('dialogue: router → greet → ask → "I will." → accept');
            set('herbs_started', 1);
          } else if (get(f, 'herbs') >= 3 && !get(f, 'herbs_returned')) {
            note('dialogue: router → progress → "Here they are." → turn_in');
            set('herbs_returned', 1);
          } else if (get(f, 'slimes_well') >= 4 && !get(f, 'well_reported')) {
            note('dialogue: the elder hears about the well');
            set('well_reported', 1);
          } else note(get(f, 'herbs_returned') ? 'dialogue: router → thanks' : 'dialogue: router → progress → "Still looking."');
        }),
    },
    {
      label: 'Pick a moonherb',
      run: () =>
        act('Pick a moonherb', (f, set, note) => {
          if (countEarly || get(f, 'herbs_started') > 0) add(f, set, 'herbs');
          else note('herb.gd: quest not active, the herb is not counted');
        }),
    },
    {
      label: 'Defeat a slime at the well',
      run: () =>
        act('Defeat a slime at the well', (f, set) => {
          set('well_seen', 1);
          set('slimes_well', get(f, 'slimes_well') + 1);
        }),
    },
  ];

  const reset = () => {
    setFlags({});
    lastText.current = { moonherbs: '', silent_well: '' };
    setLog([]);
    setToast(null);
    setLit({ stages: new Set(), n: 0 });
  };

  const herbCode = useMemo(
    () =>
      countEarly
        ? `func _on_interacted(_by: Node2D) -> void:
	GameState.set_flag("picked:" + persist_id)
	GameState.add_flag("herbs")  # counts even before the quest starts
	queue_free()`
        : `func _on_interacted(_by: Node2D) -> void:
	GameState.set_flag("picked:" + persist_id)
	if GameState.get_flag("herbs_started") > 0:
		GameState.add_flag("herbs")  # only counts while the quest is active
	queue_free()`,
    [countEarly],
  );

  const flagKeys = ['herbs_started', 'herbs', 'herbs_returned', 'well_seen', 'slimes_well', 'well_reported'];

  return (
    <FigureLayout
      side={
        <>
          <div className="world-k">World events</div>
          {events.map((e) => (
            <Btn key={e.label} onClick={e.run}>
              {e.label}
            </Btn>
          ))}
          <Toggle label="count herbs before the quest starts" value={countEarly} onChange={setCountEarly} />
          <Btn onClick={reset}>Reset (new game)</Btn>
        </>
      }
      below={<CodeBlock code={herbCode} file="scenes/herb.gd" compact />}
    >
      <div className="world-quest">
        <svg viewBox="0 0 522 60" className="world-flow" role="img" aria-label="signal flow from a world event to the quest toast">
          {STAGES.map((st, i) => {
            const x = 2 + i * 87;
            const on = lit.stages.has(st);
            return (
              <g key={st + lit.n}>
                {i > 0 && <line x1={x - 5} y1={30} x2={x} y2={30} className={'world-flow-link' + (on ? ' on' : '')} />}
                <rect x={x} y={10} width={82} height={40} rx={5} className={'world-flow-node' + (on ? ' on' : '')} />
                <text x={x + 41} y={27} textAnchor="middle" className="world-flow-label">
                  {STAGE_LABEL[st][0]}
                </text>
                <text x={x + 41} y={40} textAnchor="middle" className="world-flow-label sub">
                  {STAGE_LABEL[st][1]}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="world-quest-grid">
          <div className="world-panel">
            <div className="world-k">GameState.flags</div>
            <table className="world-table">
              <tbody>
                {flagKeys.map((k) => (
                  <tr key={k} className={get(flags, k) ? '' : 'dim'}>
                    <td>
                      <code>{k}</code>
                    </td>
                    <td className="num">{get(flags, k)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="world-panel">
            <div className="world-k">Quest log (computed)</div>
            {QUESTS.map((q) => {
              const i = currentStep(q, flags);
              return (
                <div key={q.id} className={'world-quest-entry' + (i < 0 ? ' dim' : '')}>
                  <div className="world-quest-title">
                    {q.title} <span className="world-quest-step">{i < 0 ? 'not started' : i >= q.steps.length ? 'complete' : `step ${i + 1}/${q.steps.length}`}</span>
                  </div>
                  <ol className="world-steps">
                    {q.steps.map((s, k) => (
                      <li key={k} className={i < 0 ? '' : k < i ? 'done' : k === i ? 'cur' : ''}>
                        {s.description}
                        {s.target > 1 ? ` (${Math.min(get(flags, s.flag), s.target)}/${s.target})` : ''}
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
            <div className={'world-toast' + (toast ? ' on' : '')} key={toast?.n ?? 0} aria-live="polite">
              {toast ? toast.text : 'no quest update'}
            </div>
          </div>
        </div>
        <div className="world-panel">
          <div className="world-k">Signal log (newest first)</div>
          <ul className="world-log">
            {log.length === 0 && <li className="note">Press a world event.</li>}
            {log.map((l) => (
              <li key={l.id} className={l.kind}>
                {l.text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </FigureLayout>
  );
}
