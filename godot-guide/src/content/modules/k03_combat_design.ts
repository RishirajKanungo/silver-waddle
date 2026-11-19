import { md, gd, type Module } from '../types';

// ------------------------------------------------------------------------------------ listings
const TIME_PROBE = gd`
extends Node
## A measuring tool for this lesson. Press the tactical action to slow the game down, press it
## again to restore it, and read how much game time your decision cost in the Output panel.

## Engine.time_scale while "deciding". 0.1 means one real second is a tenth of a game second.
@export_range(0.01, 1.0) var tactical_scale := 0.1

var _real_start_ms := 0
var _game_time := 0.0


func _process(delta: float) -> void:
    # delta is already multiplied by Engine.time_scale, so this sums game time
    _game_time += delta


func _unhandled_input(event: InputEvent) -> void:
    if not event.is_action_pressed("tactical"):
        return
    if Engine.time_scale == 1.0:
        Engine.time_scale = tactical_scale
        _real_start_ms = Time.get_ticks_msec()  # wall-clock time: time_scale does not touch it
        _game_time = 0.0
    else:
        Engine.time_scale = 1.0
        var real := (Time.get_ticks_msec() - _real_start_ms) / 1000.0
        print("decision: %.2f s real, %.2f s of game time" % [real, _game_time])


func _exit_tree() -> void:
    Engine.time_scale = 1.0  # never leave the editor's next run in slow motion
`;

const HIT_METER = gd`
class_name HitMeter
extends Node
## Measures how fast hits land on a training dummy: hits per second, the gap between hits and the
## stagger delivered. These are the inputs of the pacing formulas in k03-3.

## The dummy's Hurtbox (c05). Set it in the Inspector.
@export var hurtbox: Hurtbox
## Seconds of history to average over.
@export var window := 5.0
## Optional Label that shows the numbers on screen.
@export var label: Label

var _times: Array[float] = []
var _stagger: Array[float] = []
var _print_timer := 0.0


func _ready() -> void:
    hurtbox.hurt.connect(_on_hurt)


func _on_hurt(hit: HitData) -> void:
    _times.append(_now())
    _stagger.append(hit.stagger)


func _process(delta: float) -> void:
    # forget hits older than the window
    var cutoff := _now() - window
    while not _times.is_empty() and _times[0] < cutoff:
        _times.pop_front()
        _stagger.pop_front()
    _print_timer += delta
    if _print_timer < 0.5:
        return
    _print_timer = 0.0
    var report := "hits/s %.2f   gap %.3f s   stagger/s %.1f" % [hits_per_second(), mean_gap(), stagger_per_second()]
    if label:
        label.text = report


func hits_per_second() -> float:
    return _times.size() / window


func mean_gap() -> float:
    if _times.size() < 2:
        return 0.0
    return (_times[-1] - _times[0]) / (_times.size() - 1)


func stagger_per_second() -> float:
    var total := 0.0
    for s in _stagger:
        total += s
    return total / window


func _now() -> float:
    return Time.get_ticks_msec() / 1000.0
`;

const TUNING = gd`
class_name CombatTuning
extends Resource
## The pacing numbers for one party member against one kind of enemy, and the targets they must
## meet. One .tres per pairing in res://resources/tuning/. The formulas are derived in k03-3.

@export var label := "Kai vs skeleton"

@export_group("Attacker")
@export var atb_per_hit := 11.0
## Hits per second while a string is running (measure it with HitMeter).
@export var hits_per_second := 3.0
## Share of the fight spent landing hits (the rest is moving, dodging, guarding).
@export_range(0.0, 1.0) var uptime := 0.5
@export var passive_rate := 2.0
@export var segment_size := 100.0
@export var damage_per_hit := 7.0
@export var stagger_per_hit := 3.0
@export var ability_damage := 28.0
@export var ability_stagger := 30.0

@export_group("Enemy")
@export var enemy_hp := 300.0
@export var stagger_max := 100.0
@export var stagger_multiplier := 1.6
@export var stagger_duration := 6.0

@export_group("Targets")
@export var segment_seconds_min := 3.0
@export var segment_seconds_max := 5.0
@export var fight_seconds_min := 30.0
@export var fight_seconds_max := 90.0


## Seconds to fill one ATB segment: S / (a * h * u + p).
func seconds_per_segment() -> float:
    return segment_size / (atb_per_hit * hits_per_second * uptime + passive_rate)


## Basic hits alone needed to fill the stagger meter.
func basic_hits_to_stagger() -> int:
    return ceili(stagger_max / stagger_per_hit)


## Seconds to stagger when every filled segment is spent on an ability.
func seconds_to_stagger() -> float:
    var per_second := stagger_per_hit * hits_per_second * uptime + ability_stagger / seconds_per_segment()
    return stagger_max / per_second


## A rough fight length: alternate "build to stagger" and "staggered" phases until HP runs out.
func estimated_fight_seconds() -> float:
    var dps := damage_per_hit * hits_per_second * uptime + ability_damage / seconds_per_segment()
    var build := seconds_to_stagger()
    var hp := enemy_hp
    var t := 0.0
    while t < 600.0:
        if hp <= dps * build:
            return t + hp / dps
        hp -= dps * build
        t += build
        var burst := dps * stagger_multiplier * stagger_duration
        if hp <= burst:
            return t + hp / (dps * stagger_multiplier)
        hp -= burst
        t += stagger_duration
    return t


func report() -> String:
    var seg := seconds_per_segment()
    var fight := estimated_fight_seconds()
    var seg_ok := seg >= segment_seconds_min and seg <= segment_seconds_max
    var fight_ok := fight >= fight_seconds_min and fight <= fight_seconds_max
    return "%s: %.1f s/segment%s, %d hits or %.1f s to stagger, fight %.0f s%s" % [
        label, seg, "" if seg_ok else " (OFF TARGET)", basic_hits_to_stagger(),
        seconds_to_stagger(), fight, "" if fight_ok else " (OFF TARGET)"]
`;

const TUNING_REPORT = gd`
@tool
extends EditorScript
## Open this script in the Script editor and use File > Run (Ctrl+Shift+X): it prints the pacing
## report for every CombatTuning in res://resources/tuning/.

const FOLDER := "res://resources/tuning/"


func _run() -> void:
    for file in DirAccess.get_files_at(FOLDER):
        if not file.ends_with(".tres"):
            continue
        var tuning := load(FOLDER + file) as CombatTuning
        if tuning == null:
            push_warning("%s is not a CombatTuning" % file)
            continue
        print(tuning.report())
`;

export const MODULE: Module = {
  id: 'k03',
  part: 'combat',
  order: 3,
  title: 'Designing hybrid real-time / ATB combat',
  summary: 'The design space of turn-based, ATB, action and hybrid combat; the FF7 Remake loop read from what the player observes, with Sea of Stars and CrossCode as other answers; Shardbound\'s goals, roles and tuning targets turned into numbers you can check.',
  relevance: md`Before writing the battle system (k04) and the party (k05), this module pins down what Shardbound's combat must feel like and turns it into targets: seconds per ATB segment, hits to stagger, fights of 30 to 90 seconds, and a distinct role for Kai, Lyra and Bram. Those numbers become the exported values in your \`AtbGauge\`, \`StaggerComponent\` and ability resources, and a tuning report tells you when a change breaks the pace.`,
  prereqs: ['k01', 'm05'],
  areas: ['combat', 'feel', 'math'],
  lessons: [
    // ======================================================================================== k03-1
    {
      id: 'k03-1',
      title: 'The design space: who waits for whom',
      minutes: 35,
      objectives: [
        'Place turn-based, ATB, action and hybrid combat by who waits for whom and where the decisions happen.',
        'Compute the battle time a decision costs under a time scale, $t_{\\text{game}} = s\\,t_{\\text{real}}$.',
        'Name the problem each family has that the hybrid is built to solve, and what the hybrid costs in return.',
        'Measure the cost of a decision in Godot with Engine.time_scale and Time.get_ticks_msec.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Picture two moments. In a classic turn-based RPG a menu is open, the enemy stands frozen mid-pose, and you take as long as you like to pick *Fire* because it is weak to fire. In an action game a skeleton raises its sword, and you have about half a second to dodge; nobody asks what you would like to do.

Both moments are good. The first is about **decisions**: reading the situation and choosing well. The second is about **execution**: timing, movement, the feel of the controls. Every combat system decides how much of each it wants, and the main tool it uses is **time**: when the world runs, when it stops, and who has to wait for whom.

Shardbound wants both moments in one fight, the way *Final Fantasy VII Remake* does. This lesson maps the options, so that the hybrid is a choice with known costs rather than a copy.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Four families of combat',
          md: md`- **Turn-based.** Time stops while anyone decides. Actions resolve one at a time in an order set by speed stats. All of the challenge is in the decisions.
- **ATB (active time battle).** Each fighter has a gauge that fills in real time; when yours is full, you may act. In *active* mode the world keeps running while you browse the menu; in *wait* mode it stops while a menu is open. Real time shows up as waiting and as pressure to decide quickly.
- **Action.** You control the character directly, every frame. Decisions happen inside execution: you choose by pressing a button at the right moment.
- **Hybrid.** Real-time control most of the time; a resource earned in real time (ATB) buys access to a menu in which time is slowed almost to a stop. Execution fills the gauge, decisions spend it.`,
        },
        {
          kind: 'viz',
          viz: { type: 'combat.designspace' },
          task: md`Set the think time to 4 s. Compare *ATB (active)* and *Hybrid*: count the red markers (enemy hits that land while you are in a menu). Then drag the hybrid time scale from 0.1 to 1 and watch the hybrid row turn into active ATB. Finally, read the "waiting" share for turn-based and classic ATB.`,
          caption: md`Each row is 16 seconds of *real* time. The coloured strip is what the player is doing; the orange bars underneath are how fast the world runs (full height is 1.0). An enemy attacks every 2.5 s of *game* time, so slowing the world spreads its attacks out in real time. In turn-based combat, enemy actions happen on their own turns and need no reflexes.`,
        },
        {
          kind: 'check',
          q: md`In ATB with *active* mode, what happens while you browse the menu for 4 seconds?`,
          options: [md`The enemies keep acting at full speed, so they can hit you while you decide.`, md`Time stops until you choose.`, md`Time runs at a tenth of its speed.`, md`Your own gauge drains while the menu is open.`],
          answer: 0,
          explain: md`Active mode keeps the world running: the cost of a slow decision is the hits you take meanwhile. Wait mode stops time instead, which makes it a turn-based system with real-time waiting between turns.`,
        },
        {
          kind: 'derive',
          title: 'what a decision costs',
          goal: md`With the game running at time scale $s$ while a menu is open, find how much game time passes during a decision that takes $t_{\text{real}}$ seconds, and the longest decision that fits inside an enemy's telegraph.`,
          steps: [
            {
              md: md`Game time advances $s$ seconds per real second, so a decision of $t_{\text{real}}$ real seconds costs $$t_{\text{game}} = s\,t_{\text{real}}.$$ At $s = 1$ (active ATB) the cost is the whole decision; at $s = 0$ (wait mode, turn-based) it is nothing.`,
              choose: {
                prompt: md`At $s = 0.1$, a 3-second decision costs how much game time?`,
                options: [md`0.3 s`, md`3 s`, md`30 s`],
                answer: 0,
                explain: md`$0.1 \times 3 = 0.3$ s. A tenth of the decision happens in the game.`,
              },
            },
            {
              md: md`An enemy telegraph (a windup you can see) lasts $w$ seconds of game time. You can open the menu, decide and act before it lands if $s\,t_{\text{real}} < w$, that is $$t_{\text{real}} < \frac{w}{s}.$$`,
            },
            {
              md: md`For a skeleton windup of $w = 0.6$ s and $s = 0.1$, you have up to $0.6 / 0.1 = 6$ real seconds. At $s = 0.25$ you have only 2.4 s, which is the speed of a quick glance at the menu.`,
            },
          ],
          takeaway: md`The time scale turns "how long may the player think?" into a number. Around 0.1 gives several seconds inside a half-second telegraph, so decisions are possible without stopping the action. At 0 the world stops entirely, which removes the tension that makes the menu feel like part of the fight.`,
        },
        {
          kind: 'numeric',
          q: md`A golem's slam has a 1.0 s windup. Tactical mode runs at $s = 0.08$. What is the longest decision, in real seconds, that still finishes before the slam lands?`,
          answer: { kind: 'number', value: 12.5 },
          explain: md`$t_{\text{real}} < w/s = 1.0 / 0.08 = 12.5$ s.`,
        },
        {
          kind: 'text',
          md: md`### What each family does well, and what it costs

| | Decisions | Execution | Typical problem |
|---|---|---|---|
| Turn-based | deep, unhurried | none, or a timing minigame | long fights feel static; the moment-to-moment feel is missing |
| ATB (active) | under time pressure | none | waiting for gauges; hits land while you read a menu |
| Action | quick, made with the hands | central | hard to steer a party; less room for planning or for slower players |
| Hybrid | slowed menus, a few per minute | central | two control schemes to learn; ally AI must be good; harder to balance |

A party makes the action column hard. In an action game, three characters means either AI companions you cannot direct or a lot of buttons. The hybrid answers that: you play one character directly, and the menu lets you give orders to all three.`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'What the hybrid solves, and what it asks for',
          md: md`**Solves.** The player never waits for a gauge with nothing to do: attacking, guarding and dodging *are* the way to earn the next decision. Decisions get thinking time without freezing the fight. A party becomes controllable, because the menu can address any member.

**Asks for.** A real-time layer that is fun by itself (k01's hits must feel good, because basic attacks are most of what the player does). A resource that links the layers (ATB). Allies that behave sensibly on their own (k05). And numbers that keep both layers relevant: if basic attacks deal most of the damage, nobody opens the menu; if the menu deals all of it, the real-time layer is busywork. Lesson 3 turns this into targets.`,
        },
        {
          kind: 'viz',
          viz: { type: 'combat.battle', mode: 'atb' },
          task: md`Click the figure and press **J** to begin. Walk to the dummy and attack (**J**) until one ATB segment is full. Then press **L** for tactical mode, choose *Braver* with **J**, and confirm the target with **J**. Notice how slowly everything moves while the menu is open, and how quickly the next segment fills when you keep attacking.`,
          caption: md`The loop in its smallest form. The readout on the right separates ATB earned by hits from the slow passive charge; the HUD at the bottom shows the two segments. This figure runs on the same simulation as the full battle in later lessons.`,
        },
        {
          kind: 'steps',
          title: 'Measure a decision in Godot',
          steps: [
            md`Open your project. If the Input Map has no \`tactical\` action yet, add it (**Project → Project Settings → Input Map**) and bind **L**, **Tab** and a gamepad shoulder button.`,
            md`Create a scene \`scenes/debug/time_probe.tscn\` with a \`Node2D\` root. Add an \`AnimatedSprite2D\` with Kai's \`walk_down\` animation set to autoplay, so you can see the world speed.`,
            md`Add a child \`Node\` named \`TimeProbe\` and attach a new script \`scripts/debug/time_probe.gd\` with the listing below.`,
            md`Run the scene with **F6**. Press **L**, count to three, press **L** again, and read the Output panel.`,
            md`Change \`tactical_scale\` in the Inspector to 0.25 and to 0.02 and repeat. Watch how the walk animation reads at each value: too fast and the menu feels rushed, too slow and the world looks frozen.`,
          ],
          result: md`The Output panel prints lines such as \`decision: 3.04 s real, 0.30 s of game time\`, and Kai's walk cycle slows to a crawl while the probe is active.`,
          troubleshoot: [
            { problem: md`Nothing is printed when you press L.`, fix: md`The action name must be exactly \`tactical\`, and the scene must have focus (click the game window). \`_unhandled_input\` only receives events that no Control consumed first.` },
            { problem: md`Game time and real time come out equal.`, fix: md`You are measuring real time twice. \`_process\`'s \`delta\` is scaled by \`Engine.time_scale\`; \`Time.get_ticks_msec()\` is not. Check that \`_game_time\` sums \`delta\`.` },
            { problem: md`The next run of the game starts in slow motion.`, fix: md`\`Engine.time_scale\` is global and survives scene changes. The \`_exit_tree\` function resets it; keep that habit in every script that changes it.` },
          ],
        },
        { kind: 'code', file: 'scripts/debug/time_probe.gd', code: TIME_PROBE, note: md`\`Engine.time_scale\` multiplies the \`delta\` that every \`_process\` and \`_physics_process\` receives, and it slows animations, timers and tweens. It does not change how often physics runs (still 60 ticks per real second) or slow input: key presses arrive immediately. That is exactly what tactical mode needs, and k04-1 builds on it.` },
        {
          kind: 'check',
          q: md`Why does the probe measure real time with \`Time.get_ticks_msec()\` instead of summing \`delta\`?`,
          options: [md`Because \`delta\` is scaled by \`Engine.time_scale\`, so summing it measures game time, not wall-clock time.`, md`Because \`delta\` is only accurate in \`_physics_process\`.`, md`Because \`Time.get_ticks_msec()\` is faster to call.`, md`Because \`delta\` is in milliseconds.`],
          answer: 0,
          explain: md`Both numbers are needed, and they differ by exactly the time scale. \`Time.get_ticks_msec()\` counts milliseconds since the engine started, independent of the time scale.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'k03-1-paper',
            title: 'Active ATB versus the hybrid',
            type: 'compute',
            difficulty: 2,
            minutes: 6,
            statement: md`An enemy attacks once every 2.5 s of game time. A player spends 4 real seconds in a menu. How many enemy attacks land during that menu, on average, in active ATB ($s = 1$) and in a hybrid with $s = 0.1$? Enter both, active first.`,
            hints: [md`Convert the real seconds in the menu into game seconds first.`],
            solution: [md`Active: 4 s of game time pass, so $4 / 2.5 = 1.6$ attacks land on average.`, md`Hybrid: $0.1 \times 4 = 0.4$ s of game time pass, so $0.4 / 2.5 = 0.16$ attacks: most menus see none.`, md`The hybrid keeps a little pressure (about one menu in six is interrupted by a hit) without punishing players for reading.`],
            answer: { kind: 'vector', value: [1.6, 0.16] },
            areas: ['combat', 'math'],
          },
        },
        {
          kind: 'explain',
          prompt: md`A friend says: "Just pause the game when the menu opens, like wait mode. Slow motion is a gimmick." Give the strongest argument for slowing to about 0.1 instead, and one situation where a full pause is the better choice.`,
          model: md`Slow motion keeps the fight alive while you decide: projectiles still creep forward, a windup still finishes eventually, and you can see the consequence of waiting. That keeps a thread of tension and makes the menu part of the fight rather than an interruption. With a 0.6 s telegraph and $s = 0.1$ the player still has 6 real seconds, which is plenty for a deliberate choice. A full pause is better as an accessibility option (players who need more time, or who play with one hand), and for menus that are not decisions in the fight, such as the pause menu or the equipment screen.`,
        },
      ],
      cards: [
        { id: 'k03-1-c1', kind: 'concept', front: md`What distinguishes active ATB from wait mode?`, back: md`In active mode the world keeps running while a menu is open; in wait mode it stops. Active adds time pressure to decisions; wait removes it.` },
        { id: 'k03-1-c2', kind: 'compute', front: md`Tactical time scale 0.1, a 5 s decision. Game seconds that pass?`, answer: { kind: 'number', value: 0.5 }, back: md`$t_{\text{game}} = s\,t_{\text{real}} = 0.1 \times 5 = 0.5$ s.` },
        { id: 'k03-1-c3', kind: 'cloze', text: md`In Godot, \`Engine.{{}}\` multiplies the delta of every _process and _physics_process.`, answers: ['time_scale'] },
        { id: 'k03-1-c4', kind: 'concept', front: md`In the hybrid, what links the real-time layer to the menu layer?`, back: md`A resource earned in real time (ATB, filled by landing hits and guarding) that is spent in the menu (abilities, spells, items).` },
        { id: 'k03-1-c5', kind: 'compute', front: md`Enemy windup 0.6 s, time scale 0.1. Longest decision (real seconds) that beats it?`, answer: { kind: 'number', value: 6 }, back: md`$w/s = 0.6/0.1 = 6$ s.` },
      ],
    },
    // ======================================================================================== k03-2
    {
      id: 'k03-2',
      title: 'Reading the reference games',
      minutes: 40,
      objectives: [
        'Describe FF7 Remake\'s battle loop through mechanics a player can observe.',
        'Trace the resources through the loop: hits → ATB → abilities → pressure → stagger → damage multiplier.',
        'Decide when to spend ATB now and when to save it for a stagger, from the gauge cap and the multiplier.',
        'Compare Sea of Stars\' timed hits and locks, and CrossCode\'s element modes, as other answers to "make choices matter without stopping the action".',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Studying another game's combat is a skill. Play with a notebook, and write down only what you can **observe**: what fills when you do what, what changes on screen, how long things take with a stopwatch. Avoid guessing internal numbers. "The enemy's stagger bar fills faster after I hit it with fire" is a useful observation. "Fire does 2.5× stagger" is a guess dressed as a fact.

This lesson reads three games that way, then traces the loop Shardbound takes from them.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'FF7 Remake\'s loop, as a player sees it',
          md: md`- **Basic attacks and guarding fill the ATB gauge.** Each character has a gauge with segments. Attacking fills it fastest; it also fills slowly over time, and guarding attacks adds a little. Characters you are not controlling fill theirs more slowly.
- **Abilities, spells and items cost ATB.** Spells also cost MP. Opening the command menu slows time to a crawl, so choosing feels calm even mid-fight.
- **Pressure, then stagger.** Enemies have a stagger gauge. Normal hits fill it slowly. Certain conditions (a particular attack, an elemental weakness, interrupting a move) put an enemy in a *pressured* state, during which the gauge fills much faster. A full gauge leaves the enemy **staggered**: helpless for a few seconds and taking increased damage, shown as a percentage that some abilities can raise further.
- **Switching characters.** You can take direct control of any party member at any time; the others act on their own and use abilities when you command them.
- **Limit breaks.** A separate gauge, filled mostly by taking damage, unlocks a character's strongest move.`,
        },
        {
          kind: 'viz',
          viz: { type: 'combat.designloop' },
          task: md`Step through the exchange with **›**. At each step, predict which arrows light up before you click. Stop at step 7 and work out why Kai saved his ATB instead of spending it at step 3.`,
          caption: md`The numbers follow Shardbound's tuning (Kai: 11 ATB and 3 stagger per hit; Focus Strike +30 stagger; the skeleton: 300 HP, stagger meter 100, weak to ice). Pressure doubles stagger gain; a weakness adds 50%.`,
        },
        {
          kind: 'check',
          q: md`In the loop above, which resource does the *real-time* layer produce that the menu layer needs?`,
          options: [md`ATB, from landed hits and guarded hits`, md`MP, from basic attacks`, md`Stagger, which buys abilities`, md`Limit, which refills ATB`],
          answer: 0,
          explain: md`ATB is the bridge: you earn it by acting in real time and spend it in the menu. Stagger is a separate meter on the enemy, filled by both layers, that pays off as a damage multiplier.`,
        },
        {
          kind: 'derive',
          title: 'save ATB for the stagger, or spend it now?',
          goal: md`An ability deals $D$ normally and $mD$ during a stagger ($m = 1.6$). The gauge holds at most 2 segments. Find when holding a segment for the stagger beats spending it now.`,
          steps: [
            { md: md`Spending now earns $D$. Holding the segment and spending it in the stagger earns $mD$, a gain of $(m - 1)D$, but only if nothing is lost while holding.` },
            {
              md: md`The gauge is capped. While it sits full, ATB earned is thrown away. If the gauge is at value $v$ (out of 200) and fills at $r$ ATB per second, it is full after $t_{\text{full}} = (200 - v)/r$. If the stagger is $t_s$ seconds away and $t_s > t_{\text{full}}$, the waste is $r\,(t_s - t_{\text{full}})$ ATB.`,
              choose: {
                prompt: md`How do you turn wasted ATB into wasted damage?`,
                options: [md`Divide by the segment size (100) and multiply by $D$`, md`Multiply by $m$`, md`It wastes nothing, because ATB is capped`],
                answer: 0,
                explain: md`Each 100 ATB is one ability, worth $D$ (at least). Wasted ATB is abilities you will never cast.`,
              },
            },
            { md: md`Holding wins when $$(m - 1)\,D > \frac{r\,(t_s - t_{\text{full}})}{100}\,D \iff (m - 1) > \frac{r\,(t_s - t_{\text{full}})}{100}.$$ With $m = 1.6$, holding is right as long as you waste less than 60 ATB.` },
            { md: md`Example: $r = 20$ ATB/s, $v = 150$, so $t_{\text{full}} = 2.5$ s. If the stagger comes in 4 s, the waste is $20 \times 1.5 = 30$ ATB: hold. If it is 8 s away, the waste is 110 ATB: spend one segment now, then keep building.` },
          ],
          takeaway: md`The cap is what makes the decision interesting. Without it, hoarding ATB for staggers would always be right. With two segments, "spend one, keep one for the stagger" is the usual rhythm, and the menu stays busy.`,
        },
        {
          kind: 'numeric',
          q: md`Kai's Braver has power 4 and Kai's attack is 7. The skeleton is staggered and Focus Strike has raised the multiplier to 1.85. How much damage does Braver deal (before rounding)?`,
          answer: { kind: 'number', value: 51.8 },
          explain: md`$7 \times 4 \times 1.85 = 51.8$, shown as 52. Unstaggered it would be 28.`,
        },
        {
          kind: 'text',
          md: md`### Two other answers

**Sea of Stars** keeps turns, then puts execution into every action:

- **Timed hits.** Pressing the action button as an attack connects adds an extra hit; pressing it as an enemy hit lands reduces the damage. Each turn has a moment of skill inside it.
- **Locks.** When an enemy prepares a strong move, it shows a countdown and a row of lock icons, each an attack type (sword, moon, sun and so on). Hitting it with those types before the countdown ends breaks locks and weakens or cancels the move. Choosing *who acts and with what* becomes a race against a visible clock.
- **Live mana.** Basic attacks release small orbs that a character can absorb to boost the next attack or skill: plain attacks feed the stronger moves.

**CrossCode** is a real-time action RPG that moves decisions into the hands:

- **Element modes.** At any moment you can switch between neutral and four elements (heat, cold, shock and wave). Each mode changes your attacks and combat arts and your resistances; using elemental attacks too much overloads you back to neutral for a while.
- **Weaknesses.** Enemies react differently to elements, so the choice of mode is a decision made in real time, without a menu.

All three answer one question: *how do you make choices matter without stopping the action?* FF7 Remake slows time and uses a resource; Sea of Stars stops time but adds timing and visible countdowns; CrossCode never stops and makes the choice a quick switch.`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'What Shardbound takes from each',
          md: md`- **From FF7 Remake:** ATB earned by attacking and guarding, a tactical menu at about 0.1 time scale, pressure and stagger with a growing multiplier, switching, commands to allies, limit breaks.
- **From Sea of Stars:** windups you can read and *punish*. Hitting an enemy during its telegraph pressures it, which rewards watching the enemy over mashing. Visible timers on dangerous moves.
- **From CrossCode:** elements as quick, readable decisions. Lyra's Fire and Blizzard exist to hit weaknesses, and a weakness hit pressures the target.`,
        },
        {
          kind: 'viz',
          viz: { type: 'combat.battle', mode: 'stagger' },
          task: md`Kai against a skeleton (weak to ice, which Kai cannot use). Wait for its windup (the red "!" and the shaded area), and strike during it to put it in the pressured state. Use *Focus Strike* while it is pressured to stagger it, then *Braver* while it is staggered. Compare the damage numbers.`,
          caption: md`The top bar shows the target's HP and stagger meter, with its state: a percentage, PRESSURED with the time left, or STAGGER with the multiplier and time left. Guarding (hold **E**) blocks most of a hit and adds ATB.`,
        },
        {
          kind: 'check',
          q: md`Which of these is an *observation* you can safely write in a design notebook about a game you are studying?`,
          options: [md`"After I hit the bomb enemy with ice during its swelling animation, its stagger bar filled about twice as fast for a few seconds."`, md`"Ice does 2× stagger damage to bombs."`, md`"The stagger formula is damage × 0.3."`, md`"Pressure lasts exactly 4.0 seconds."`],
          answer: 0,
          explain: md`The first describes what you saw, with honest approximations. The others claim internal numbers you cannot see. Shardbound picks its own numbers anyway; what you copy is the *shape* of the mechanic.`,
        },
        {
          kind: 'steps',
          title: 'Build a hit meter for your training dummy',
          steps: [
            md`Create \`scenes/debug/training_dummy.tscn\`: a \`Node2D\` root named \`Dummy\`, a \`Sprite2D\` (any placeholder; the skeleton's first frame works), and a \`Hurtbox\` (c05) with a \`CollisionShape2D\` about 12×16 px. Set the Hurtbox's mask to \`player_hitbox\` (layer 5).`,
            md`Add a \`Label\` at the top-left of the scene (or in a \`CanvasLayer\` so it stays on screen) and a child \`Node\` named \`HitMeter\` with the script below. In the Inspector, set \`hurtbox\` to the Hurtbox and \`label\` to the Label.`,
            md`Instance the dummy into your test room next to Kai and run it. Attack it the way you would in a fight: full strings, then a pause, then a dodge.`,
            md`Write down three numbers: hits per second while mashing, hits per second in a realistic rhythm (with movement and dodges), and the gap between hits in a string. Lesson 3 uses them.`,
          ],
          result: md`The label updates twice a second, for example \`hits/s 2.40   gap 0.300 s   stagger/s 7.2\`. Mashing gives a higher rate than a realistic rhythm; the difference is your *uptime*.`,
          troubleshoot: [
            { problem: md`The numbers stay at zero.`, fix: md`The Hurtbox never sees Kai's Hitbox. Check layers: Kai's Hitbox is on layer 5 (\`player_hitbox\`), the dummy's Hurtbox masks layer 5, and both have enabled collision shapes. **Debug → Visible Collision Shapes** shows them while the game runs.` },
            { problem: md`Each swing counts two or three times.`, fix: md`The Hitbox is entering, leaving and re-entering the Hurtbox during one swing (for example because the lunge moves it). Turn the Hitbox on for the active frames only, as in k01, so each swing produces one \`area_entered\`.` },
          ],
        },
        { kind: 'code', file: 'scripts/debug/hit_meter.gd', code: HIT_METER, note: md`\`Time.get_ticks_msec()\` is wall-clock time; if you measure while tactical mode is open, the rates will look low, which is correct for real time. \`Array.pop_front()\` is fine for a few dozen entries; for thousands, a ring buffer would avoid shifting the array.` },
        {
          kind: 'paper',
          problem: {
            id: 'k03-2-paper',
            title: 'Pressure pays',
            type: 'compute',
            difficulty: 2,
            minutes: 6,
            statement: md`An enemy's stagger meter holds 100. Kai's hits add 3 each; pressure doubles stagger gain. How many hits does Kai need to fill the meter (a) without pressure, (b) if every hit lands while the enemy is pressured? Enter both.`,
            solution: [md`Without pressure: $\lceil 100 / 3 \rceil = 34$ hits.`, md`Pressured: each hit adds 6, so $\lceil 100 / 6 \rceil = 17$ hits.`, md`At about 3 hits per second, pressure turns an 11-second job into a 6-second one, which is why punishing windups matters.`],
            answer: { kind: 'vector', value: [34, 17] },
            areas: ['combat', 'math'],
          },
        },
        {
          kind: 'recall',
          prompt: md`Name the six links of the hybrid loop in order, starting from basic attacks.`,
          answer: md`Basic attacks (and guards) → ATB → abilities, spells and items → pressure → stagger → damage multiplier, which makes the next hits and abilities worth more. Hits also add to the stagger meter directly.`,
        },
      ],
      cards: [
        { id: 'k03-2-c1', kind: 'concept', front: md`What does the pressured state do in FF7 Remake-style stagger systems?`, back: md`For a while, the enemy's stagger gauge fills much faster. It is triggered by specific conditions: weaknesses, certain abilities, interrupting a move.` },
        { id: 'k03-2-c2', kind: 'compute', front: md`Damage 28 normally; staggered at ×1.6. Damage during the stagger?`, answer: { kind: 'number', value: 44.8 }, back: md`$28 \times 1.6 = 44.8$, shown as 45.` },
        { id: 'k03-2-c3', kind: 'concept', front: md`Sea of Stars' answer to "make turn-based active"?`, back: md`Timed hits (press on impact for an extra hit or less damage), locks (break a charging move's lock icons with the right attack types before its countdown ends) and live mana from basic attacks.` },
        { id: 'k03-2-c4', kind: 'concept', front: md`Why does a 2-segment cap make "save ATB for the stagger" a real decision?`, back: md`Holding a segment gains $(m-1)D$ in the stagger, but a full gauge wastes everything you earn while holding. You must weigh the multiplier against the waste.` },
        { id: 'k03-2-c5', kind: 'cloze', text: md`In CrossCode the player switches between neutral and four {{}} modes in real time.`, answers: ['element|elemental'] },
      ],
    },
    // ======================================================================================== k03-3
    {
      id: 'k03-3',
      title: 'Shardbound\'s combat: roles, pace and tuning targets',
      minutes: 40,
      objectives: [
        'Write Shardbound\'s combat goals as checkable targets: seconds per ATB segment, hits to stagger, fights of 30 to 90 s.',
        'Derive seconds per segment $t_{\\text{seg}} = S/(a\\,h\\,u + p)$ and time to stagger from the per-hit numbers.',
        'Give Kai, Lyra and Bram distinct roles through their numbers rather than through rules.',
        'Store tuning in a Resource and print a pacing report with an EditorScript.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`"Combat should feel fast but tactical" is a wish, not a goal: nobody can tell whether a change met it. A goal is something you can check. Shardbound's combat goals:

1. **Pace.** A normal fight lasts 30 to 90 seconds. Shorter, and the tactical layer never comes into play; longer, and fights against weak enemies drag.
2. **A decision every few seconds.** The controlled character fills one ATB segment in 3 to 5 seconds of normal play, so the menu comes up a few times per fight without being constant.
3. **Stagger is earned.** Basic attacks alone take 25 to 40 hits to stagger a normal enemy; pressure and abilities cut that sharply, so playing well is visibly faster.
4. **Roles.** Each party member is best at a different part of the loop.

The rest of this lesson turns these into formulas, sets numbers for the three characters, and builds a report that checks them.`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'Three roles, expressed as numbers',
          md: md`| | Kai (sword) | Lyra (mage) | Bram (shield and mace) |
|---|---|---|---|
| Role | builds ATB fast | spends ATB on spells | builds pressure and stagger, guards |
| Basic attack | 3-hit string, about 3 hits/s, 7 damage | 2-shot bolts, about 2/s, 4 damage | 2-hit string, about 1.6 hits/s, 11 damage |
| ATB per hit | 11 | 10 | 9 |
| ATB per guarded hit | 8 | 8 | 25 |
| Stagger per hit | 3 | 2 | 7 |
| Abilities | Braver (damage), Focus Strike (stagger, raises the multiplier) | Fire, Blizzard (weaknesses), Cure | Shield Bash (pressures), Provoke |
| MP | 12 | 48 | 10 |

No rule says "Bram is the tank". His numbers make guarding profitable (25 ATB for a blocked hit) and his hits heavy on stagger, so playing him well *means* standing in front and pressuring. Lyra has few ATB sources of her own, but she has the MP and the spells that exploit weaknesses, so the player spends her ATB (and, in k05, commands her) at the right moment.`,
        },
        {
          kind: 'derive',
          title: 'seconds per ATB segment',
          goal: md`A character lands $h$ hits per second while attacking, attacks a fraction $u$ of the time (the uptime), gains $a$ ATB per hit and $p$ ATB per second passively. Find the time to fill a segment of size $S$.`,
          steps: [
            { md: md`Average hits per second over the whole fight: $h\,u$. ATB from hits per second: $a\,h\,u$.` },
            {
              md: md`Add the passive charge: $r = a\,h\,u + p$ ATB per second. One segment takes $$t_{\text{seg}} = \frac{S}{a\,h\,u + p}.$$`,
              choose: {
                prompt: md`Kai: $a = 11$, $h = 3$, $u = 0.5$, $p = 2$, $S = 100$. What is $t_{\text{seg}}$?`,
                options: [md`about 5.4 s`, md`about 3.0 s`, md`about 9.1 s`],
                answer: 0,
                explain: md`$r = 11 \cdot 3 \cdot 0.5 + 2 = 18.5$ ATB/s, so $100/18.5 \approx 5.4$ s. At full uptime it would be $100/35 \approx 2.9$ s.`,
              },
            },
            { md: md`Read the formula as a tuning guide: uptime is the player's skill (staying in range, not getting hit), so $a$ decides how much skill is rewarded, and $p$ is the floor for a player who mostly dodges. With $p$ at 2, a player who never attacks still gets a segment every 50 s; the menu stays reachable, but slowly.` },
          ],
          takeaway: md`Uptime around 0.5 to 0.6 is realistic once enemies fight back (measure yours with the HitMeter from lesson 2). Kai at 5.4 s is a little slow for the 3 to 5 s target; raising $a$ to 13 gives $100/(19.5+2) \approx 4.7$ s.`,
        },
        {
          kind: 'numeric',
          q: md`Bram: $a = 9$, $h = 1.6$, $u = 0.5$, $p = 2$, $S = 100$. He also guards one enemy hit every 4 s, gaining 25 ATB each time. How many seconds per segment?`,
          answer: { kind: 'number', value: 100 / (9 * 1.6 * 0.5 + 2 + 25 / 4) },
          hints: [md`A guarded hit every 4 s adds $25/4$ ATB per second to the rate.`],
          explain: md`$r = 9 \cdot 1.6 \cdot 0.5 + 2 + 25/4 = 7.2 + 2 + 6.25 = 15.45$ ATB/s, so $t_{\text{seg}} = 100/15.45 \approx 6.5$ s. Guarding supplies 40% of Bram's ATB: his role, in numbers.`,
        },
        {
          kind: 'viz',
          viz: { type: 'combat.atbpace', preset: 'kai' },
          task: md`With the Kai preset against a 1500 HP enemy, the fight is too long. First find an \`atb_per_hit\` that gives 3 to 5 s per segment at 50% uptime. Then lower the uptime to 30% (a player under pressure) and check that the fight stays under 90 s. Finally switch to the Bram preset and see how his stagger numbers change the curve.`,
          caption: md`The plot simulates one character against one enemy: the ATB curve saw-tooths each time a segment is spent on an ability, the stagger meter climbs (faster with each ability) and drains during the stagger, and HP drops faster during each stagger. The model ignores decay and pressure, so real fights stagger a little later.`,
        },
        {
          kind: 'derive',
          title: 'time to stagger',
          goal: md`Find how long it takes to fill a stagger meter of size $M$ with basic hits adding $s_h$ each and abilities adding $s_a$ each, when every segment is spent on an ability.`,
          steps: [
            { md: md`Basic hits add $s_h\,h\,u$ stagger per second.` },
            {
              md: md`One ability is cast every $t_{\text{seg}}$ seconds, adding $s_a / t_{\text{seg}}$ stagger per second on average.`,
              choose: {
                prompt: md`So the time to stagger is`,
                options: [md`$t_{\text{stagger}} = M / (s_h h u + s_a / t_{\text{seg}})$`, md`$t_{\text{stagger}} = M / s_h$`, md`$t_{\text{stagger}} = M\,t_{\text{seg}} / s_a$`],
                answer: 0,
                explain: md`Rates add. $M/s_h$ is a number of hits, not seconds; the third ignores basic hits.`,
              },
            },
            { md: md`Kai against the skeleton: $s_h = 3$, $h u = 1.5$, $s_a = 30$, $t_{\text{seg}} = 5.4$: rate $= 4.5 + 5.6 = 10.1$ per second, so $t_{\text{stagger}} \approx 9.9$ s. With pressure doubling everything for part of that time, the observed stagger comes in 6 to 8 s.` },
          ],
          takeaway: md`Basic hits alone would take $\lceil 100/3 \rceil = 34$ hits, about 23 s at 1.5 hits/s. Abilities more than halve that, which is the point: the menu is the fast way to a stagger.`,
        },
        {
          kind: 'check',
          q: md`Fights against the golem run to 140 s in playtests. Which single change shortens them *and* keeps the tactical layer important?`,
          options: [md`Raise the stagger multiplier from 1.6 to 2.0, so staggers (earned mostly through abilities) do more of the work.`, md`Double the damage of basic attacks.`, md`Raise passive ATB charge to 20 per second.`, md`Remove the golem's windups so players can attack all the time.`],
          answer: 0,
          explain: md`A larger multiplier pays off the loop: build stagger with abilities, then burst. Doubling basic damage shortens fights by making the menu less necessary. Passive 20/s hands out a segment every 5 s for doing nothing. Removing windups removes the pressure condition and the reason to watch the enemy.`,
        },
        {
          kind: 'callout',
          tone: 'remember',
          title: 'Shardbound\'s tuning targets',
          md: md`| Target | Value | Why |
|---|---|---|
| Tactical time scale | 0.1 | 6 real seconds inside a 0.6 s windup |
| ATB segments | 2 of 100 | one to spend, one to save |
| Seconds per segment, controlled character | 3 to 5 s at 50% uptime | a menu every few seconds |
| ATB from hits, uncontrolled members | 50% | switching and commanding both matter |
| Basic hits to stagger a normal enemy | 25 to 40 | stagger must be earned |
| Stagger | 6 s at ×1.6, raised by some abilities to at most ×3 | a burst window you plan for |
| Fight length | 30 to 90 s; bosses 2 to 4 min | the loop runs several times per fight |`,
        },
        {
          kind: 'build',
          ch: {
            id: 'k03-3-build',
            title: 'A tuning report you can rerun',
            goal: md`Put the pacing numbers in Resources and write an EditorScript that prints a report for every pairing, flagging values outside the targets. From now on, every balance change in k04 and k05 starts by running it.`,
            requirements: [
              md`\`scripts/resources/combat_tuning.gd\` defines a \`CombatTuning\` Resource with the attacker, enemy and target numbers as exported variables.`,
              md`It computes seconds per segment, basic hits to stagger, seconds to stagger and an estimated fight length.`,
              md`At least three \`.tres\` files exist in \`res://resources/tuning/\`: Kai, Lyra and Bram, each against the skeleton.`,
              md`Running \`scripts/tools/tuning_report.gd\` with **File → Run** prints one line per file, and marks any number outside its target.`,
              md`Changing a value in the Inspector and running the report again shows the new numbers.`,
            ],
            hints: [
              md`Create a \`.tres\` with **FileSystem → right-click → New → Resource…**, search for \`CombatTuning\`, and save it in \`resources/tuning/\`.`,
              md`An \`EditorScript\` needs \`@tool\` and \`extends EditorScript\`, and its code goes in \`_run()\`. The script must be open in the Script editor when you use **File → Run** (Ctrl+Shift+X).`,
              md`\`DirAccess.get_files_at(path)\` returns the file names in a folder without opening it first.`,
            ],
            solution: [
              { file: 'scripts/resources/combat_tuning.gd', code: TUNING },
              { file: 'scripts/tools/tuning_report.gd', code: TUNING_REPORT },
            ],
            explain: md`The fight estimate alternates two phases: building to a stagger at the normal damage rate, then the stagger window at the multiplied rate. It returns as soon as the remaining HP fits inside a phase. It ignores pressure, decay and enemy behaviour, so treat it as a lower bound and confirm with playtests. Keeping these numbers in \`.tres\` files means the same values can later feed the real \`AtbGauge\` and \`StaggerComponent\` exports, and the report stays honest.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'k03-3-paper',
            title: 'Tune Lyra to the target',
            type: 'compute',
            difficulty: 2,
            minutes: 8,
            statement: md`Lyra lands 2 bolts per second with 50% uptime and gets $p = 3$ ATB/s passively. What \`atb_per_hit\` gives exactly one segment (100 ATB) every 5 s when she is the controlled character?`,
            hints: [md`Solve $100/(a \cdot 2 \cdot 0.5 + 3) = 5$ for $a$.`],
            solution: [md`The rate needed is $100/5 = 20$ ATB/s.`, md`$a \cdot 2 \cdot 0.5 + 3 = 20 \Rightarrow a = 17$.`, md`17 is far above her 10. Shardbound keeps her at 10 on purpose: Lyra is the character whose ATB the player plans around, and Kai is the fast builder. If she felt too slow in playtests, raising her passive rate would help without making her bolts the best ATB source.`],
            answer: { kind: 'number', value: 17 },
            areas: ['combat', 'math'],
          },
        },
        {
          kind: 'explain',
          prompt: md`Why does Shardbound give Bram 25 ATB for a guarded hit instead of a rule like "Bram's abilities cost less"?`,
          model: md`A per-hit reward shapes behaviour during real-time play: to earn ATB with Bram, you stand in front of enemies and guard their attacks, which is exactly the tank role, and it makes enemy windups an opportunity rather than only a threat. A discount would make Bram cheaper without changing how he is played. It also creates a synergy: Bram guarding the golem's slam fills his gauge for a Shield Bash, which pressures the golem for Kai. Roles that come from numbers on actions show up in what the player does, second to second.`,
        },
      ],
      cards: [
        { id: 'k03-3-c1', kind: 'concept', front: md`Seconds per ATB segment, as a formula`, back: md`$t_{\text{seg}} = S/(a\,h\,u + p)$: segment size over (ATB per hit × hits per second × uptime + passive rate).` },
        { id: 'k03-3-c2', kind: 'compute', front: md`$a = 12$, $h = 3$, $u = 0.5$, $p = 2$, $S = 100$. Seconds per segment?`, answer: { kind: 'number', value: 5 }, back: md`$100/(18 + 2) = 5$ s.` },
        { id: 'k03-3-c3', kind: 'concept', front: md`What is "uptime" in combat tuning?`, back: md`The fraction of fight time a character is actually landing hits, as opposed to moving, dodging, guarding or recovering. It turns hits per second in a string into hits per second in a fight.` },
        { id: 'k03-3-c4', kind: 'compute', front: md`Stagger meter 100, Bram adds 7 per hit. Basic hits to stagger?`, answer: { kind: 'number', value: 15 }, back: md`$\lceil 100/7 \rceil = 15$.` },
        { id: 'k03-3-c5', kind: 'cloze', text: md`An {{}} with a _run() function runs from the Script editor with File → Run.`, answers: ['EditorScript'] },
      ],
    },
  ],
  problems: [
    {
      id: 'k03-p1',
      title: 'Seconds per segment',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`A character lands 2.5 hits per second with 60% uptime, gains 12 ATB per hit and 2 ATB per second passively. Segments are 100 ATB. How many seconds per segment?`,
      solution: [md`$r = 12 \times 2.5 \times 0.6 + 2 = 18 + 2 = 20$ ATB/s.`, md`$t_{\text{seg}} = 100/20 = 5$ s.`],
      answer: { kind: 'number', value: 5 },
      areas: ['combat', 'math'],
    },
    {
      id: 'k03-p2',
      title: 'The cost of reading',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`Tactical mode runs at time scale 0.12. A player reads ability descriptions for 7 real seconds. How many seconds of game time pass?`,
      solution: [md`$t_{\text{game}} = s\,t_{\text{real}} = 0.12 \times 7$.`, md`$= 0.84$ s, longer than a skeleton's 0.6 s windup: long reads are not free.`],
      answer: { kind: 'number', value: 0.84 },
      areas: ['combat', 'math'],
    },
    {
      id: 'k03-p3',
      title: 'Hold or spend',
      type: 'derive',
      difficulty: 3,
      minutes: 12,
      statement: md`The ATB gauge holds 200 and fills at 25 ATB/s. It is at 140. An enemy will be staggered in 6 s, and the multiplier will be 1.6. Using the lesson's rule, should the player spend a segment now or hold both for the stagger? How much ATB would holding waste?`,
      hints: [md`Find $t_{\text{full}} = (200 - v)/r$ first.`],
      solution: [
        md`$t_{\text{full}} = (200 - 140)/25 = 2.4$ s.`,
        md`Waste while full: $25 \times (6 - 2.4) = 90$ ATB.`,
        md`Holding gains $(m - 1)D = 0.6D$; the waste costs $0.9D$. Spend one segment now; the gauge then has room to refill before the stagger.`,
      ],
      answer: { kind: 'number', value: 90 },
      areas: ['combat', 'math'],
    },
    {
      id: 'k03-p4',
      title: 'Allies and their ATB',
      type: 'design',
      difficulty: 2,
      minutes: 10,
      statement: md`Shardbound's allies only spend ATB when commanded, and earn ATB from hits at 50% of the rate of the controlled character. Argue for both rules from the player's point of view, and describe what goes wrong if allies earn ATB at 100% and spend it on their own.`,
      solution: [
        md`Commanded-only spending keeps the tactical layer in the player's hands: every ability is a decision the player made, so the outcome is readable and the menu matters.`,
        md`The 50% rate makes switching meaningful (control a character to build their gauge fast) and keeps the number of decisions manageable: three characters at full rate would produce a segment every 1 to 2 seconds in total, more than anyone can spend thoughtfully.`,
        md`If allies earn at 100% and act alone, fights resolve without the player's input, the menu becomes optional, and the player cannot predict when a big ability will fire, which also makes stagger windows impossible to plan.`,
      ],
      rubric: [md`Connects commanded-only spending to player agency and readability`, md`Explains the 50% rate through switching and decision load, with rough numbers`, md`Describes the failure mode (fights play themselves, unpredictable bursts)`],
      areas: ['combat'],
    },
    {
      id: 'k03-p5',
      title: 'Cooldowns or ATB?',
      type: 'concept',
      difficulty: 2,
      minutes: 6,
      statement: md`Many action games gate abilities with cooldowns (usable once every $n$ seconds). Explain what ATB costs do that cooldowns do not, in terms of what the player is motivated to do between abilities.`,
      solution: [
        md`A cooldown refills by itself: between abilities the player may do anything, including playing safe at range. Nothing links the real-time layer to the ability layer.`,
        md`ATB refills mainly by landing hits and guarding, so the player is motivated to engage. Good real-time play directly buys more abilities.`,
        md`ATB is also shared between abilities, which makes choosing *which* ability to spend it on a decision; cooldowns let you fire every ability as soon as it is ready.`,
      ],
      rubric: [md`States that cooldowns refill independently of play`, md`States that ATB rewards engaging (hits, guards)`, md`Mentions the shared pool creating a choice`],
      areas: ['combat'],
    },
    {
      id: 'k03-p6',
      title: 'Weakness and pressure',
      type: 'compute',
      difficulty: 2,
      minutes: 6,
      statement: md`Blizzard adds 14 stagger. A weakness multiplies stagger by 1.5 and puts the enemy in the pressured state, which doubles stagger gain (including the hit that caused it). How much stagger does a Blizzard on an ice-weak enemy add?`,
      solution: [md`Weakness: $14 \times 1.5 = 21$.`, md`Pressured: $21 \times 2 = 42$.`],
      answer: { kind: 'number', value: 42 },
      areas: ['combat', 'math'],
    },
    {
      id: 'k03-p7',
      title: 'Fight length',
      type: 'compute',
      difficulty: 3,
      minutes: 12,
      statement: md`A party deals 30 damage per second outside staggers. It takes 12 s to stagger the enemy, and a stagger lasts 6 s at ×1.6. The enemy has 1200 HP. Using the lesson's two-phase model (build, then stagger, repeat), how long does the fight last, in seconds?`,
      hints: [md`One cycle is 12 s at 30 dps plus 6 s at 48 dps.`],
      solution: [
        md`One cycle deals $12 \times 30 + 6 \times 48 = 360 + 288 = 648$ HP and lasts 18 s.`,
        md`After one cycle, $1200 - 648 = 552$ HP remain. The next build phase deals 360 in 12 s, leaving 192.`,
        md`The next stagger deals 48 per second: $192/48 = 4$ s. Total: $18 + 12 + 4 = 34$ s.`,
      ],
      answer: { kind: 'number', value: 34 },
      areas: ['combat', 'math'],
    },
    {
      id: 'k03-p8',
      title: 'A pressure condition for the golem',
      type: 'design',
      difficulty: 2,
      minutes: 10,
      statement: md`The golem resists fire and has no elemental weakness. Design two conditions that put it in the pressured state, each tied to something the player can observe and react to. For each, name which party member is best at triggering it and why.`,
      solution: [
        md`**Punish the slam.** Hitting the golem during its 1 s windup pressures it. The telegraph (raised arms, a shaded circle) is readable, and Kai's fast hits land inside the window. It rewards stepping in rather than away.`,
        md`**Break its guard.** After a slam, the golem's arm is stuck in the ground for a moment; a Shield Bash in that moment pressures it. Bram is built for it: guarding the slam fills his ATB, so he has the segment ready exactly when the opening comes.`,
        md`Both conditions are visible, timed and tied to the enemy's own behaviour, which teaches players to watch the boss instead of mashing.`,
      ],
      rubric: [md`Both conditions are observable on screen and have a clear timing window`, md`Each is matched to a party member with a reason based on their numbers or abilities`, md`Avoids invisible or random triggers`],
      areas: ['combat'],
    },
  ],
};
