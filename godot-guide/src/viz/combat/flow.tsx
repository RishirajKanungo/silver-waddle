// combat.battleflow: an encounter in the field, step by step. No separate battle screen: an Area2D
// starts the fight, arena walls switch on, enemies wake up, and signals carry the result back out.
// Choose the outcome (victory or defeat) and step through which nodes change and which signals fire.
import type { VizSpec } from '../../content/types';
import { usePlayer, FigureLayout, SegControl } from '../kit';
import { CodeBlock } from '../../ui/GameCells';
import { useState } from 'react';
import './combat.css';

type Outcome = 'victory' | 'defeat';
interface FStep {
  title: string;
  text: string;
  party: [number, number];
  enemies: number; // how many are alive
  walls: boolean;
  enemiesAwake: boolean;
  koParty?: boolean;
  signals: string[];
  code: string;
}
const COMMON: FStep[] = [
  {
    title: 'Exploring',
    text: 'The party walks the field. The encounter\'s enemies stand idle: their AIController is disabled until the fight starts. The arena walls exist but their collision shapes are disabled.',
    party: [60, 150],
    enemies: 3,
    walls: false,
    enemiesAwake: false,
    signals: [],
    code: `# encounter.gd, _ready()
for enemy in enemies:
	enemy.set_active(false)
_set_walls(false)`,
  },
  {
    title: 'Trigger',
    text: 'Kai\'s body enters the EncounterTrigger (an Area2D whose mask is the player layer). body_entered fires once; the encounter starts and turns the trigger off so it cannot fire again.',
    party: [170, 132],
    enemies: 3,
    walls: false,
    enemiesAwake: false,
    signals: ['trigger.body_entered(kai)'],
    code: `func _on_trigger_body_entered(_body: Node2D) -> void:
	trigger.set_deferred("monitoring", false)
	start()`,
  },
  {
    title: 'start()',
    text: 'Walls switch on with set_deferred (collision changes inside a physics callback must wait for the end of the frame), the camera is limited to the arena, enemies wake, and the Events bus tells the HUD and the music to switch.',
    party: [190, 128],
    enemies: 3,
    walls: true,
    enemiesAwake: true,
    signals: ['Events.battle_started', 'Audio: music_battle', 'HUD: show party bars'],
    code: `func start() -> void:
	_set_walls(true)
	_remaining = enemies.size()
	for enemy in enemies:
		enemy.set_active(true)
		enemy.health.died.connect(_on_enemy_died, CONNECT_ONE_SHOT)
	Events.battle_started.emit()`,
  },
  {
    title: 'Fighting',
    text: 'The battle runs in the same scene as the field. Each enemy\'s HealthComponent emits died; the encounter counts them down.',
    party: [230, 118],
    enemies: 2,
    walls: true,
    enemiesAwake: true,
    signals: ['slime.health.died', '_remaining: 3 → 2'],
    code: `func _on_enemy_died() -> void:
	_remaining -= 1
	if _remaining == 0:
		_win()`,
  },
];
const WIN: FStep[] = [
  {
    title: 'Last enemy falls',
    text: 'The count reaches zero. _win() runs.',
    party: [250, 112],
    enemies: 0,
    walls: true,
    enemiesAwake: true,
    signals: ['skeleton.health.died', '_remaining: 1 → 0'],
    code: `func _on_enemy_died() -> void:
	_remaining -= 1
	if _remaining == 0:
		_win()`,
  },
  {
    title: 'Victory',
    text: 'Rewards go to GameState, the walls open, the music returns, and the encounter records that it is cleared so it does not respawn when the room reloads.',
    party: [270, 100],
    enemies: 0,
    walls: false,
    enemiesAwake: false,
    signals: ['Events.battle_won(30, 12)', 'Events.battle_ended', 'GameState.set_flag("cave_1_cleared")', 'Audio: music_field'],
    code: `func _win() -> void:
	_set_walls(false)
	GameState.set_flag(encounter_id)
	Events.battle_won.emit(xp_reward, gold_reward)
	Events.battle_ended.emit()`,
  },
];
const LOSE: FStep[] = [
  {
    title: 'Party falls',
    text: 'Every Character\'s HealthComponent has emitted died. PartyManager notices that no member can take control and emits party_defeated.',
    party: [230, 118],
    enemies: 2,
    walls: true,
    enemiesAwake: true,
    koParty: true,
    signals: ['bram.health.died', 'PartyManager.party_defeated', 'Events.battle_lost', 'Events.battle_ended'],
    code: `# party_manager.gd
func _on_member_died(member: Character) -> void:
	if member == leader():
		var next := _next_alive_index()
		if next == -1:
			party_defeated.emit()
			return
		switch_to(next)`,
  },
  {
    title: 'Game over',
    text: 'Transitions fades out, the game reloads the last save, and the encounter is back at step 1 because its flag was never set.',
    party: [60, 150],
    enemies: 3,
    walls: false,
    enemiesAwake: false,
    signals: ['Transitions.fade_out()', 'GameState.load_last_save()'],
    code: `func _on_battle_lost() -> void:
	await Transitions.fade_out()
	GameState.load_last_save()`,
  },
];

export function BattleFlow({ spec }: { spec: VizSpec }) {
  const [outcome, setOutcome] = useState<Outcome>((spec.outcome as Outcome) ?? 'victory');
  const steps = [...COMMON, ...(outcome === 'victory' ? WIN : LOSE)];
  const { i, controls } = usePlayer(steps.length, { interval: 2400 });
  const s = steps[Math.min(i, steps.length - 1)];
  const Wd = 520, Hh = 210;
  const arena = { x: 150, y: 50, w: 200, h: 120 };
  const enemyPos: [number, number][] = [
    [300, 80],
    [320, 120],
    [270, 140],
  ];
  return (
    <FigureLayout
      side={
        <>
          <SegControl label="outcome" value={outcome} onChange={setOutcome} options={[{ v: 'victory', label: 'victory' }, { v: 'defeat', label: 'defeat' }]} />
          <div>
            <b>
              {i + 1}. {s.title}
            </b>
          </div>
          <p className="combat-note">{s.text}</p>
          <div className="combat-log">
            {s.signals.length ? s.signals.map((x) => <div key={x}>{x}</div>) : <div>no signals yet</div>}
          </div>
        </>
      }
      below={
        <>
          {controls}
          <CodeBlock compact file="scripts/battle/encounter.gd (excerpt)" code={s.code} />
        </>
      }
    >
      <svg viewBox={`0 0 ${Wd} ${Hh}`} className="combat-svg" role="img" aria-label="field map with an encounter arena">
        <rect x={0} y={0} width={Wd} height={Hh} fill="color-mix(in oklab, var(--ok) 12%, var(--surface))" />
        {/* path through the field */}
        <path d="M20,170 C120,150 200,120 300,100 S460,60 510,40" stroke="color-mix(in oklab, var(--warn) 30%, var(--surface))" strokeWidth={22} fill="none" />
        {/* trigger area */}
        <rect x={arena.x - 6} y={arena.y - 6} width={arena.w + 12} height={arena.h + 12} rx={6} fill="none" stroke="var(--c-u)" strokeDasharray="4 4" opacity={i >= 1 ? 0.35 : 0.9} />
        <text x={arena.x - 2} y={arena.y - 10} fontSize={10.5} style={{ fill: 'var(--c-u)' }}>
          EncounterTrigger (Area2D)
        </text>
        {/* walls */}
        <rect x={arena.x} y={arena.y} width={arena.w} height={arena.h} fill="none" stroke={s.walls ? 'var(--bad)' : 'var(--line)'} strokeWidth={s.walls ? 5 : 1.5} strokeDasharray={s.walls ? undefined : '3 5'} />
        <text x={arena.x + arena.w} y={arena.y + arena.h + 16} fontSize={10.5} textAnchor="end" style={{ fill: s.walls ? 'var(--bad)' : 'var(--muted)' }}>
          ArenaWalls: {s.walls ? 'collision on' : 'disabled'}
        </text>
        {/* enemies */}
        {enemyPos.map(([x, y], k) => {
          const alive = k < s.enemies;
          return (
            <g key={k} opacity={alive ? 1 : 0.25}>
              <circle cx={x} cy={y} r={8} fill={alive ? 'var(--bad)' : 'var(--muted)'} />
              <text x={x} y={y + 3.5} fontSize={9} textAnchor="middle" style={{ fill: 'var(--surface)' }}>
                {alive ? (s.enemiesAwake ? '!' : 'z') : 'x'}
              </text>
            </g>
          );
        })}
        {/* party */}
        {[0, 1, 2].map((k) => {
          const [px, py] = s.party;
          const x = px - k * 16, y = py + (k === 1 ? -10 : k === 2 ? 10 : 0);
          return (
            <g key={k} opacity={s.koParty ? 0.4 : 1}>
              <circle cx={x} cy={y} r={7} fill={k === 0 ? 'var(--c-u)' : k === 1 ? 'var(--c-k)' : 'var(--c-v)'} stroke="var(--surface)" />
              <text x={x} y={y + 3.5} fontSize={9} textAnchor="middle" style={{ fill: 'var(--surface)' }}>
                {s.koParty ? 'x' : ['K', 'L', 'B'][k]}
              </text>
            </g>
          );
        })}
        <text x={10} y={18} fontSize={11.5} fontWeight={700}>
          {s.title}
        </text>
      </svg>
    </FigureLayout>
  );
}
