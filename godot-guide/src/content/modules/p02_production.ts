import { md, gd, type Module } from '../types';

const BACKLOG = `# Shardbound backlog. Top of each list = next. Estimates in hours.

## M3 Combat loop (target 3 weeks)
Acceptance: in the field, Kai fights 3 slimes; every hit flashes, plays a sound
and knocks back; slimes die and drop nothing yet; no frame over 16.7 ms.

[must]   Kai 3-hit light attack string with hitstop            6
[must]   Slime AI: idle, hop toward player, contact damage     5
[must]   HealthComponent + Hurtbox on slime                    3
[should] Damage numbers (pooled Labels)                        3
[could]  Slime death dissolve                                  1

## Bugs
[must]   Kai can dash through the east wall of the town (repro: dash right at x=312)
[should] Footstep plays twice when changing direction
`;

const SCOPE_DOC = `# Shardbound: slice scope (docs/scope.md)

## The slice
Play time 20-30 min. Areas: town, field, dungeon (3 tilesets, 3 music tracks + battle + boss).
Party: Kai, Lyra, Bram. Enemies: slime, bat, skeleton, slime variant. Boss: golem.
Abilities: 7. Shards: 6. NPCs: 8. Shop: 1. Quest: 1. Save points: 2.

## Estimate (my costs, from timing the first enemy and first room)
Rooms: 30 min / 4 min per room = 8 rooms x 5 h      =  40 h
Enemies: 4 x 18 h = 72 h       Boss: 1 x 45 h      = 117 h
Abilities: 7 x 7 h = 49 h      NPCs: 8 x 3 h       =  73 h
Tilesets 3 x 30 h + music 5 x 12 h                 = 150 h
Systems (rest of the course)                       = 300 h
Subtotal 680 h, +30% polish and bugs = 884 h
At 12 h/week: 74 weeks. Too long: cut to fit 52 weeks (624 h).

## Cuts (in order)
1. Buy or commission music instead of composing (-60 h)
2. Slime variant via palette swap, not new art (-14 h)
3. Abilities 7 -> 6 (-7 h) ...

## Milestones
M1 Movement room   accept: walk, dash, jump between 2 heights, camera follows
M2 Combat loop     accept: fight 3 slimes with flash, sound, knockback, death
...
`;

const GITIGNORE = `# Godot 4: the import cache and editor state. Regenerated on open.
.godot/

# exports (build them again from export_presets.cfg)
builds/

# OS clutter
.DS_Store
Thumbs.db
`;

const GITATTRIBUTES = `# Text files: normalise line endings so Windows and Linux edits do not conflict.
* text=auto eol=lf

# Large binaries go to Git LFS: the repository stores small pointer files.
*.png filter=lfs diff=lfs merge=lfs -text
*.wav filter=lfs diff=lfs merge=lfs -text
*.ogg filter=lfs diff=lfs merge=lfs -text
*.aseprite filter=lfs diff=lfs merge=lfs -text
*.ttf filter=lfs diff=lfs merge=lfs -text
`;

const CONFLICT = `[gd_scene format=3 uid="uid://b2k7x1q9field"]

[ext_resource type="Script" path="res://scripts/level.gd" id="1_level"]
[ext_resource type="PackedScene" path="res://scenes/enemies/slime.tscn" id="2_slime"]

[node name="Field" type="Node2D"]
script = ExtResource("1_level")

<<<<<<< HEAD
[node name="Slime" parent="." instance=ExtResource("2_slime")]
position = Vector2(120, 88)
=======
[node name="Slime" parent="." instance=ExtResource("2_slime")]
position = Vector2(136, 96)
>>>>>>> field-layout
`;

const POOL = gd`
class_name NodePool
extends Node2D
## Reuses instances of one scene: take() and give_back() replace instantiate() and queue_free().
## Pooled nodes stay in the tree, hidden and disabled, so _ready() runs once, at load time.

@export var scene: PackedScene
@export var initial_size := 8

var _free: Array[Node2D] = []


func _ready() -> void:
    for i in initial_size:
        _free.append(_create())


func take() -> Node2D:
    var node: Node2D = _free.pop_back() if not _free.is_empty() else _create()
    node.process_mode = Node.PROCESS_MODE_INHERIT
    node.show()
    # each pooled scene resets its own state (HP, timers, animation) in reset()
    if node.has_method("reset"):
        node.call("reset")
    return node


func give_back(node: Node2D) -> void:
    node.hide()
    # DISABLED stops processing; collision objects leave the physics world too
    node.process_mode = Node.PROCESS_MODE_DISABLED
    _free.append(node)


func _create() -> Node2D:
    var node := scene.instantiate() as Node2D
    add_child(node)
    node.hide()
    node.process_mode = Node.PROCESS_MODE_DISABLED
    return node
`;

const SPAWNER = gd`
extends Node2D
## Spawns a wave of enemies from a NodePool instead of instantiating them mid-fight.

@export var pool: NodePool
@export var spawn_points: Array[Marker2D] = []


func spawn_wave() -> void:
    for point in spawn_points:
        var enemy := pool.take()
        enemy.global_position = point.global_position
        var health := enemy.get_node("HealthComponent") as HealthComponent
        # one-shot: the connection removes itself, so a reused enemy never gets two
        health.died.connect(pool.give_back.bind(enemy), CONNECT_ONE_SHOT)
`;

const DAMAGE = gd`
class_name DamageFormula
extends RefCounted
## A compact version of the r01 damage pipeline, kept free of nodes so it can be unit tested.

const CRIT_MULTIPLIER := 1.5


static func compute(attack: int, power: float, defence: int, element_mult := 1.0, crit := false) -> int:
    # defence divides instead of subtracting, so high defence never reaches zero damage
    var dmg := attack * power * 100.0 / (100.0 + defence)
    dmg *= element_mult
    if crit:
        dmg *= CRIT_MULTIPLIER
    # every hit does at least 1 damage, so the player always sees progress
    return maxi(1, floori(dmg))
`;

const TEST_DAMAGE = gd`
extends GutTest
## test/unit/test_damage_formula.gd. Each test checks one rule of the formula.


func test_typical_hit() -> void:
    assert_eq(DamageFormula.compute(20, 1.0, 0), 20)


func test_defence_100_halves_damage() -> void:
    assert_eq(DamageFormula.compute(20, 1.0, 100), 10)


func test_minimum_damage_is_one() -> void:
    # 1 * 100 / 300 = 0.33: the floor gives 0, the minimum lifts it to 1
    assert_eq(DamageFormula.compute(1, 1.0, 200), 1)


func test_resistance_reduces_damage() -> void:
    assert_eq(DamageFormula.compute(20, 1.0, 0, 0.5), 10)


func test_crit_is_one_and_a_half() -> void:
    assert_eq(DamageFormula.compute(20, 1.0, 0, 1.0, true), 30)


func test_result_is_floored() -> void:
    # 7 * 1.5 = 10.5 must give 10, not 11
    assert_eq(DamageFormula.compute(7, 1.5, 0), 10)


func test_fractional_defence_combined() -> void:
    # 20 * 100 / 150 = 13.33; * 0.5 = 6.67; * 1.5 = 10.0
    assert_eq(DamageFormula.compute(20, 1.0, 50, 0.5, true), 10)
`;

const OVERLAY = gd`
class_name DebugOverlay
extends CanvasLayer
## Debug overlay and cheats (ui/debug_overlay.tscn: a CanvasLayer with a Label child).
## Removes itself in release builds, so none of this ships.

static var god_mode := false

@onready var _label: Label = $Label


func _ready() -> void:
    if not OS.is_debug_build():
        queue_free()
        return
    layer = 90
    visible = false
    process_mode = Node.PROCESS_MODE_ALWAYS
    if not Performance.has_custom_monitor(&"game/enemies"):
        # shows up as a graph in Debugger > Monitors
        Performance.add_custom_monitor(&"game/enemies", _count_enemies)


func _process(_delta: float) -> void:
    if not visible:
        return
    _label.text = "FPS %d   frame %.1f ms\nnodes %d   draw calls %d\nenemies %d   god %s   speed x%.2f" % [
        Engine.get_frames_per_second(),
        Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0,
        Performance.get_monitor(Performance.OBJECT_NODE_COUNT),
        Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
        _count_enemies(),
        god_mode,
        Engine.time_scale,
    ]


func _unhandled_input(event: InputEvent) -> void:
    var key := event as InputEventKey
    if key == null or not key.pressed or key.echo:
        return
    match key.keycode:
        KEY_F1:
            visible = not visible
        KEY_F2:
            god_mode = not god_mode
        KEY_F3:
            GameState.gold += 1000
        KEY_F4:
            # slow motion, for checking attack frames and hitboxes by eye
            Engine.time_scale = 0.25 if Engine.time_scale == 1.0 else 1.0
        _:
            return
    get_viewport().set_input_as_handled()


func _count_enemies() -> int:
    return get_tree().get_nodes_in_group("enemies").size()
`;

export const MODULE: Module = {
  id: 'p02',
  part: 'ship',
  order: 2,
  title: 'Production: scope, git, debugging, testing',
  summary: 'Estimating an RPG by multiplying content, defining a vertical slice, milestones and a backlog, playtesting; git and Git LFS for a Godot project; the debugger and profiler; object pooling; unit tests with GUT and debug overlays.',
  relevance: md`Shardbound is a solo project of many months, and the main risks are not technical: they are building more than you can finish, losing work, and bugs that come back. This module turns the design document into a slice-sized scope with an estimate you can trust, puts the project under git with LFS for the art and audio, teaches the debugger and profiler you will use for every bug from here on, removes the hitch when an enemy wave spawns with a \`NodePool\`, and protects the damage formula with unit tests that run in seconds.`,
  prereqs: ['g03'],
  areas: ['ship', 'godot'],
  lessons: [
    // =========================================================================== p02-1
    {
      id: 'p02-1',
      title: 'Scope, milestones and playtesting',
      minutes: 40,
      objectives: [
        'Estimate an RPG\'s size by multiplying content counts by measured costs, and compare it with your weekly hours.',
        'Define a vertical slice and explain why it comes before content production.',
        'Split the slice into milestones with acceptance criteria and keep a prioritised backlog.',
        'Run a playtest: what to watch, what not to say, and how notes become backlog items.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Write down the RPG you want to make: ten hours long, eight regions, forty enemies, a hundred NPCs. Now count. Ten hours at about four minutes per room is 150 rooms. If laying out, populating and scripting one room takes five hours, that is 750 hours, before a single enemy is drawn. At ten hours a week, the rooms alone take a year and a half.

Content **multiplies**. Every area needs a tileset, music and enemies; every enemy needs animations, AI and tuning; every hour of play needs rooms. The code systems (movement, combat, menus, saving) are built once, but the content they carry grows with every line of the design document. Shardbound's fifth design pillar exists for this reason: *small and finished beats big and broken*.

This lesson turns that into numbers you can plan with, then into a **vertical slice**, milestones and a backlog.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Vertical slice',
          md: md`A **vertical slice** is a short part of the game, built to final quality, that contains every system: about 20–30 minutes of Shardbound with a town, a field and a dungeon, the full party, combat with ATB and stagger, abilities, shards, a shop, a quest, saving and a boss. "Vertical" because it cuts through every layer (code, art, sound, UI) for a thin piece of content, as opposed to a *horizontal* approach that builds all the levels as grey boxes first.

It answers the questions a plan cannot. Is the combat fun for 20 minutes? How long does a room, an enemy, an ability really take you? It also becomes the demo, the trailer footage and the playtest build.`,
        },
        {
          kind: 'derive',
          title: 'An estimate you can argue with',
          goal: md`Write the total effort as a formula, see which terms grow with the size of the game, and turn hours into a date.`,
          steps: [
            { md: md`Split the work into a fixed part $F$ (systems built once) and content items $i$, each with a count $n_i$ and a cost per unit $c_i$ in hours: $$T_0 = F + \sum_i n_i\,c_i.$$` },
            { md: md`Polish, playtesting and bug fixing take a share of everything, so multiply by an overhead factor: $T = (1 + p)\,T_0$, with $p$ around 0.3 as a starting assumption.` },
            {
              md: md`Rooms are driven by play time: $n_{\text{rooms}} = 60\,H / m$ for $H$ hours of play at $m$ minutes per room.`,
              choose: {
                prompt: md`You double the hours of play and keep everything else. Which part of $T$ doubles?`,
                options: [md`The room term (and any content tied to play time); $F$ stays the same`, md`All of $T$`, md`Only $F$`],
                answer: 0,
                explain: md`Systems are built once; rooms scale with play time. In practice a longer game also needs more enemy types, areas and music to stay interesting, so the real growth is a bit faster than the room term alone.`,
              },
            },
            { md: md`Calendar time is $T / h$ weeks for $h$ hours per week. Use your real $h$ (after work, family, rest) and measure each $c_i$ by timing your first one; the defaults in any calculator are guesses.` },
          ],
          takeaway: md`An estimate is a model with named assumptions. When it says three years, change the scope (the $n_i$), not the assumptions.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ship.scope', preset: 'small' },
          task: md`Set **your hours/week** honestly. Compare the three presets. Then start from **small game** and find a scope that finishes in about 18 months at your pace. Which sliders moved the total most?`,
          caption: md`The per-item costs in the table are assumptions; type your own once you have timed a room and an enemy. The bar chart excludes the fixed systems cost, so you can see which content dominates.`,
        },
        {
          kind: 'numeric',
          q: md`Your plan: 2 hours of play at 4 minutes per room (5 h per room), 8 enemy types at 18 h each, 300 h of systems, and +30% for polish and bugs. At 12 hours per week, how many weeks is that?`,
          answer: { kind: 'number', value: ((30 * 5 + 8 * 18 + 300) * 1.3) / 12, tol: 0.002 },
          hints: [md`Rooms: $2 \times 60 / 4 = 30$.`],
          explain: md`Rooms $30 \times 5 = 150$ h, enemies $8 \times 18 = 144$ h, systems 300 h: 594 h, times 1.3 = 772.2 h. Divided by 12: about 64.4 weeks, and that is before areas, music, NPCs and abilities.`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'How to cut',
          md: md`- **Cut breadth, keep depth.** Fewer areas, each finished, beat more areas that feel empty.
- **Reuse with variation.** A palette-swapped slime with one new behaviour is a new enemy for a fraction of the cost (p01).
- **Recombine.** Place three known enemies in a new arrangement and the encounter is new.
- **Check every system against the pillars.** A system that serves none of them (fishing, crafting, a second currency) is the first candidate to cut.
- **Cut early.** A cut feature costs nothing in month 2 and wastes weeks in month 10.`,
        },
        {
          kind: 'text',
          md: md`### Milestones and the backlog

A **milestone** is a playable state of the game with **acceptance criteria**: statements you can check by playing the build. "Combat works" is not checkable. "In the field, Kai fights three slimes; every hit flashes, plays a sound and knocks the slime back; slimes die; no frame is over 16.7 ms" is. Two to four weeks per milestone is a good size: long enough to finish something, short enough to notice when you are slipping.

The **backlog** is the list of everything not yet done, in priority order. Each item should be small (a few hours, at most a day) so that progress is visible, and tagged *must*, *should* or *could* for the current milestone. Bugs go in the same list, with steps to reproduce. Where it lives matters less than keeping it current: a Markdown file in the repository, a GitHub Project or a Trello board all work.`,
        },
        { kind: 'code', file: 'docs/backlog.md', lang: 'text', code: BACKLOG },
        {
          kind: 'check',
          q: md`Which is a usable acceptance criterion for the "Dungeon puzzles" milestone?`,
          options: [
            md`The player can cross the 2-level gap room only by jumping from the raised ledge, and falling returns them to the room's entrance with 1 heart lost`,
            md`The puzzles are fun and polished`,
            md`Puzzle code is clean and well structured`,
            md`About 70% of the puzzle work is done`,
          ],
          answer: 0,
          explain: md`An acceptance criterion describes behaviour you can verify by playing the build, with no judgment call about whether it is met. "Fun" is what playtests measure; "clean code" and "70% done" cannot be checked in the build.`,
        },
        {
          kind: 'text',
          md: md`### Playtesting

You cannot see your own game fresh: you know where the secret is, which attack the golem telegraphs, and that the shop is behind the inn. A **playtest** puts someone who does not know in front of the build while you watch.

What to watch, and write down with a timestamp:
- where they hesitate or get lost
- what they try that does not work
- which telegraphs they miss (where they get hit)
- where they die
- what they say aloud
- where they stop paying attention.

What not to do: explain, help, or defend the design. Every time you would explain, write down what you would have said; that is a problem to fix in the game.

Afterwards, ask a few open questions ("What was the most frustrating moment?", "What do you think the shards do?"). Then turn notes into backlog items. One player getting lost is an anecdote; three of five getting lost in the same room is a problem. A fresh tester can only be fresh once, so spread your testers across milestones.`,
        },
        {
          kind: 'steps',
          title: 'Run your first playtest',
          steps: [
            md`Make a build the tester can run without the editor (an export, p03-1) or run it on your machine with the editor hidden. Turn the debug overlay off.`,
            md`Prepare a sheet with three columns: *time*, *what happened*, *what they said*. Start a screen recording if the tester agrees.`,
            md`Say only this: "Play as you would at home. Please think out loud. I won't help, because I need to see where the game fails to explain itself." Then stay quiet for 15 minutes.`,
            md`Ask three open questions at the end, and write the answers verbatim.`,
            md`Within a day, turn every note into a backlog item or a deliberate "won't fix", and tag the ones you saw more than once.`,
          ],
          result: md`A page of timestamped observations and a handful of new backlog items, each tied to something a player did.`,
          troubleshoot: [
            { problem: md`The tester only says "it's good".`, fix: md`Opinions are polite; behaviour is honest. Rely on what they did. Ask about specific moments: "At 6:40 you stopped in the field for a while. What were you thinking?"` },
            { problem: md`You keep wanting to explain the controls.`, fix: md`Write down the explanation instead; it becomes a tutorial prompt or a UI change. If the tester is completely stuck for over a minute, note it, then unblock them so the rest of the test is useful.` },
          ],
        },
        {
          kind: 'build',
          ch: {
            id: 'p02-1-build',
            title: 'Write the slice plan',
            goal: md`Create \`docs/scope.md\` in your project: the slice's content list, an estimate with your own costs, the cuts that make it fit, milestones with acceptance criteria, and the first backlog.`,
            requirements: [
              md`The content list matches the slice in p04: town, field, dungeon, three party members, four enemy types, the golem, 6–8 abilities, 6 shards, a shop, a quest, save points.`,
              md`The estimate uses at least two costs you measured yourself (time your next room and your next enemy), and states your weekly hours.`,
              md`If the estimate is over 12 months, a list of cuts in order brings it under.`,
              md`At least five milestones, each with acceptance criteria a playtester could check.`,
              md`The first milestone's backlog has at least ten items of a day or less, tagged must/should/could.`,
            ],
            hints: [
              md`Use the calculator above with the **slice** preset as a starting point, then replace its costs with yours.`,
              md`If an item is bigger than a day, split it along what you could show: "slime hops toward player" and "slime contact damage" instead of "slime AI".`,
            ],
            solution: [{ file: 'docs/scope.md', code: SCOPE_DOC, lang: 'text' }],
            explain: md`The plan is short on purpose: one page you will reread at every milestone. The estimate lists its assumptions so that when reality differs, you know which number to change. The cuts are ordered so that the decision is already made when you fall behind.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'p02-1-paper',
            title: 'Fit the dream into a year',
            type: 'design',
            difficulty: 2,
            minutes: 12,
            statement: md`A plan has 12 areas, 40 enemy types, 10 bosses, 100 NPCs, 40 abilities and 25 hours of play. You have 10 hours a week for 12 months (about 520 hours). Using the costs from the calculator (room 5 h at 4 min, area 30 h, music 12 h, enemy 18 h, boss 45 h, NPC 3 h, ability 7 h, systems 300 h, +30%), propose a scope that fits and justify the cuts against Shardbound's pillars.`,
            solution: [
              md`Budget: 520 h / 1.3 = 400 h before overhead. Systems take 300 h, leaving about 100 h of content. That is roughly the slice: the full dream plan is over 6000 h.`,
              md`What 100 h buys at these costs: 6 rooms (30 min of play at 5 min each, 30 h), one new tileset with the second area reusing the course tileset (30 h), two new enemy types (36 h), licensed music instead of composed (0 h). That is 96 h, with bosses, NPCs and new abilities coming from the course's existing assets.`,
              md`The honest conclusion: at 10 h/week, the first year produces a slice-sized game. Either release it as a short game, extend the timeline, or increase hours. The pillars decide what stays: movement, readable hits, real-time plus tactics, and the party come first; NPC count and extra areas go.`,
            ],
            rubric: [md`Computes the budget and notices how much the fixed systems cost consumes`, md`Cuts content in an order justified by the pillars`, md`Reaches an honest conclusion about what fits`],
          },
        },
        {
          kind: 'recall',
          prompt: md`What is a vertical slice, and what three things does it give you?`,
          answer: md`A short part of the game at final quality containing every system. It proves the core is fun, measures your real cost per room, enemy and ability for estimating the rest, and becomes the demo, trailer footage and playtest build.`,
        },
        {
          kind: 'explain',
          prompt: md`Why build the slice before producing the rest of the content?`,
          model: md`Content made before the systems are settled has to be redone when they change: rooms built before the jump height is final need new gaps, enemies tuned before the stagger system get retuned. The slice settles the systems on a small amount of content, measures the real cost of each piece, and tests whether the game is fun before you commit hundreds of hours. After it, content production is repetition of known work, which is predictable.`,
        },
      ],
      cards: [
        { id: 'p02-1-c1', kind: 'concept', front: md`Why does an RPG's effort grow faster than its list of features suggests?`, back: md`Content multiplies: hours of play need rooms, areas need tilesets and music, enemy types need frames, AI and tuning. Systems are built once; content scales with every count.` },
        { id: 'p02-1-c2', kind: 'compute', front: md`3 hours of play at 4 min per room, 5 h per room. Hours for rooms?`, answer: { kind: 'number', value: 225 }, back: md`$3 \times 60 / 4 = 45$ rooms, $\times 5 = 225$ h.` },
        { id: 'p02-1-c3', kind: 'concept', front: md`What makes an acceptance criterion good?`, back: md`It describes behaviour you can check by playing the build, with no judgment call: "Kai fights 3 slimes; each hit flashes and knocks back", not "combat feels good".` },
        { id: 'p02-1-c4', kind: 'concept', front: md`During a playtest, what do you do when you want to explain something?`, back: md`Say nothing and write it down: each explanation you wanted to give is a problem the game should solve itself.` },
        { id: 'p02-1-c5', kind: 'cloze', text: md`Total effort: $T = (1 + p)(F + \sum n_i c_i)$, and calendar weeks $= T / {{}}$.`, answers: ['h|hours per week|weekly hours'] },
      ],
    },
    // =========================================================================== p02-2
    {
      id: 'p02-2',
      title: 'Git, the debugger and the profiler',
      minutes: 45,
      objectives: [
        'Put a Godot project under git with the right `.gitignore` and `.gitattributes`, using Git LFS for art and audio.',
        'Read a merge conflict in a `.tscn` file and decide between fixing the text and redoing the change in the editor.',
        'Debug with breakpoints, stepping, the remote scene tree, `print_debug` and `push_warning`.',
        'Read the Profiler and Monitors to find what makes a frame miss the 16.7 ms budget.',
        'Remove spawn hitches with `preload` and a `NodePool`, and avoid per-frame lookups and allocations.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Two things will happen during the slice. You will break something that worked last week and want it back. And the game will stutter for a moment every time a wave of skeletons appears. Git handles the first; the debugger and profiler handle the second, and every other bug from here on.

Godot is friendly to git: scenes (\`.tscn\`), resources (\`.tres\`), scripts and \`project.godot\` are all text, so git can show what changed line by line.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'What to commit',
          md: md`**Commit:**
- \`project.godot\`
- scenes, resources and scripts
- \`export_presets.cfg\`
- the assets
- the \`.import\` file next to each asset, which holds its import settings (filter, loop, compression)
- the \`.uid\` files Godot 4.4 creates next to scripts and shaders, which hold their stable IDs.

**Ignore** the \`.godot/\` folder: it is a cache of imported assets and editor state that Godot rebuilds when it opens the project.

Large binary files (PNG, WAV, OGG, Aseprite) belong in **Git LFS**: git keeps every version of every file forever, so a 2 MB music track changed twenty times costs 40 MB in every clone. LFS stores a small pointer in the repository and the file contents on the server, and a clone downloads only the versions it checks out.`,
        },
        {
          kind: 'steps',
          title: 'Put Shardbound under git',
          steps: [
            md`Install git and Git LFS. In a terminal in the project folder: \`git init\`, then \`git lfs install\`.`,
            md`Create \`.gitignore\` and \`.gitattributes\` with the listings below. (Godot's project manager can generate a basic pair when it creates a project; check that they match.)`,
            md`\`git add .\` then \`git status\`. Check that nothing under \`.godot/\` is listed and that \`git lfs ls-files\` shows your PNG and WAV files after the first commit.`,
            md`\`git commit -m "Shardbound: starter project"\`. Create a private repository on GitHub (or another host with LFS support), add it as the remote and push.`,
            md`From now on, commit whenever something works: small commits with messages that say what changed ("Slime hops toward player"), and always before a risky change.`,
          ],
          result: md`\`git log\` shows your first commit, the remote has the project, and \`git lfs ls-files\` lists the binary assets.`,
          troubleshoot: [
            { problem: md`\`git status\` lists hundreds of files in \`.godot/\`.`, fix: md`The \`.gitignore\` is missing or misnamed (it must be exactly \`.gitignore\` at the project root). If they were already committed, run \`git rm -r --cached .godot\` and commit.` },
            { problem: md`PNGs show as text pointers in the editor after cloning.`, fix: md`Git LFS was not installed on that machine before cloning. Run \`git lfs install\` then \`git lfs pull\`.` },
          ],
        },
        { kind: 'code', file: '.gitignore', lang: 'text', code: GITIGNORE },
        { kind: 'code', file: '.gitattributes', lang: 'text', code: GITATTRIBUTES, note: md`\`text=auto eol=lf\` stores text files with Unix line endings, so a scene saved on Windows and the same scene saved on Linux do not differ on every line.` },
        {
          kind: 'numeric',
          q: md`Without LFS, 30 sprite sheets of 200 KB each are each saved 16 times over the project (the original plus 15 edits). Roughly how many MB do they add to the repository history, ignoring compression?`,
          answer: { kind: 'number', value: (30 * 200 * 16) / 1000 },
          explain: md`$30 \times 0.2 \text{ MB} \times 16 = 96$ MB, downloaded by every fresh clone. With LFS the history holds 480 small pointer files, and a clone downloads only the current 6 MB.`,
        },
        {
          kind: 'text',
          md: md`### Merge conflicts in scenes

Working alone you still get conflicts, between a branch where you rearranged the field and \`main\` where you fixed a slime's position. A \`.tscn\` file is a list of \`[ext_resource]\` entries (files the scene uses, with short ids) followed by \`[node]\` entries with their properties. Git marks the conflicting region between \`<<<<<<<\`, \`=======\` and \`>>>>>>>\`.

Rules that keep this manageable:
- **Small property conflicts** (a position, a colour) can be fixed in a text editor: keep one side, delete the markers, open the scene in Godot to check.
- **Structural conflicts** (both sides added nodes, or the \`ext_resource\` ids differ) are safer to resolve by taking one side whole (\`git checkout --theirs scenes/field.tscn\`) and redoing the other change in the editor.
- **Avoid them:** keep scenes small by instancing sub-scenes, and commit before you start editing a scene.`,
        },
        { kind: 'code', file: 'scenes/field.tscn', lang: 'tscn', code: CONFLICT, note: md`Both branches moved the same slime. Keep one \`[node]\` block and its \`position\`, delete the three marker lines, save, and open the scene in Godot before committing.` },
        {
          kind: 'check',
          q: md`A merge conflict in \`dungeon.tscn\`: on one side you added six torch nodes, on the other you added a puzzle with new \`[ext_resource]\` lines, and the ids overlap. What is the safest resolution?`,
          options: [
            md`Take one side whole, then redo the other change in the editor and commit`,
            md`Keep both sides' text and delete the markers`,
            md`Delete \`.godot/\` and reopen the project`,
            md`Keep neither side and rebuild the dungeon from scratch`,
          ],
          answer: 0,
          explain: md`Concatenating both sides can produce duplicate resource ids or nodes whose parents do not exist, and Godot may fail to load the scene. Taking one side and redoing the smaller change in the editor always produces a valid file.`,
        },
        {
          kind: 'text',
          md: md`### The debugger

When the game misbehaves, the fastest path is usually to *look* at the running game instead of reasoning about the code.

- **Breakpoints.** Click left of a line number in the script editor (a red dot appears). When that line is about to run, the game pauses and the **Debugger** panel shows the stack (which functions called which) and every variable's value. **Step Over** runs one line, **Step Into** enters a function call, **Continue** resumes. The keyword \`breakpoint\` in code does the same.
- **Remote scene tree.** While the game runs, the Scene dock gets **Remote** and **Local** tabs. **Remote** is the live tree: select any node and the Inspector shows its current properties, which you can edit live.
- **Printing.** \`print_debug(x)\` prints with the file and line. \`push_warning\` and \`push_error\` appear in the Debugger's **Errors** tab with a stack trace. \`assert(condition, "message")\` stops a debug build when an assumption breaks and does nothing in release builds.`,
        },
        {
          kind: 'steps',
          title: 'Debug a hit that does not land',
          steps: [
            md`The bug: Kai's sword passes through the skeleton and nothing happens. Start with what you can see: **Debug → Visible Collision Shapes**, then run. Are the hitbox and the hurtbox drawn, and do they overlap during the swing?`,
            md`If they overlap but nothing happens, put a breakpoint on the first line of the Hurtbox's \`_on_area_entered\`. Swing again. If the game does not pause, the overlap is never reported.`,
            md`While running, switch the Scene dock to **Remote**, select the skeleton's \`Hurtbox\` and read *Collision → Layer* and the Hitbox's *Mask*, and the *Monitoring* flags. The usual culprit: the Hitbox's mask does not include the \`enemy\` layer (4), or monitoring was turned off after a previous hit and never turned back on.`,
            md`Fix it in the scene, run again, and confirm the breakpoint now pauses on contact. Remove the breakpoint.`,
          ],
          result: md`The breakpoint pauses on contact, the Locals show the \`HitData\`, and after continuing the skeleton flashes and takes damage.`,
          troubleshoot: [
            { problem: md`Breakpoints never pause the game.`, fix: md`Run the game from the editor (F5/F6), not from an exported build. Check that the script with the breakpoint is the one actually attached to the node (the Remote tree shows each node's script).` },
            { problem: md`The Remote tab is empty.`, fix: md`It only fills while the game is running and connected to the editor. Start the game, then click **Remote**.` },
          ],
        },
        {
          kind: 'text',
          md: md`### The profiler

At 60 fps each frame has $1000/60 = 16.7$ ms for scripts, physics and drawing. A frame that takes 46 ms means the screen shows the previous image for three refreshes: the player sees a hitch. **Averages hide this**: 359 frames of 7 ms and one of 46 ms average to 7.1 ms, a number that looks healthy.

Godot's tools, in the **Debugger** panel while the game runs:
- **Profiler** (click *Start*): a graph of frame time, and for each frame the time spent in each script function. *Self* is time in the function itself; *total* includes the functions it called.
- **Visual Profiler**: CPU and GPU time per frame, split into categories.
- **Monitors**: graphs over time of FPS, process and physics time, node count, draw calls and memory, plus your own custom monitors.

The method: reproduce the hitch, find the tall frame, open its function list, and sort by time.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ship.profiler' },
          task: md`Click the tallest bars and pick a cause for each. Then apply one fix at a time and watch the readouts. Which fix changes the **average** most, and which changes the **worst** frame most?`,
          caption: md`Blue is script time, green physics, orange rendering. The wave spawns every 1.5 s: \`load\` reads and parses the scene from disk on the frame it is needed, \`instantiate\` builds the nodes. Between 4.2 and 5.3 s a burst of separate particle emitters adds draw calls. The autosave at 3.6 s writes a file on the main thread.`,
        },
        {
          kind: 'numeric',
          q: md`On a 60 Hz display, a frame takes 46 ms to produce. For how many screen refreshes is the previous image shown? (A refresh happens every 16.7 ms; count the refreshes until the new frame is ready.)`,
          answer: { kind: 'number', value: 3 },
          explain: md`$46 / 16.7 \approx 2.76$, so the new image is ready only at the third refresh: the old one is shown 3 times, a 50 ms freeze that a player notices, especially during movement.`,
        },
        {
          kind: 'text',
          md: md`### Performance basics for 2D

Shardbound's 320×180 screen leaves the GPU with little to do; hitches usually come from the CPU doing too much work in a single frame:

- **Load ahead of time.** \`preload()\` loads at script load; \`load()\` in the middle of a fight reads the disk on that frame.
- **Pool what you spawn often.** Enemies, projectiles, damage numbers and effects can be reused instead of instantiated and freed. Instancing a scene builds every node and runs every \`_ready()\`.
- **Do not search every frame.**
  - Cache node references in \`@onready\` variables.
  - Keep lists of enemies in a manager instead of calling \`get_nodes_in_group()\` in each enemy's \`_physics_process\`.
  - Use Area2D signals instead of distance checks against everything.
- **Spread expensive AI.** An enemy deciding its next move 15 times a second instead of 60 looks the same.
- **Avoid allocations in hot loops.** Building new Arrays, Dictionaries and Strings every frame in many nodes adds up.
- **Keep draw calls down.** Sprites that share a texture can be drawn together; one emitter with many particles is cheaper than many emitters.
- **Measure first, change one thing, measure again.**`,
        },
        { kind: 'code', file: 'scripts/node_pool.gd', code: POOL, note: md`\`node.call("reset")\` instead of \`node.reset()\` because the variable is typed \`Node2D\`, which has no \`reset\` method; the pooled scene's root script defines it. Disabling \`process_mode\` also removes CollisionObject2Ds from the physics world (their \`disable_mode\` defaults to *Remove*), so a pooled enemy cannot be hit while it waits.` },
        {
          kind: 'build',
          ch: {
            id: 'p02-2-build',
            title: 'Remove the wave-spawn hitch',
            goal: md`Measure the hitch when a wave of three skeletons appears, then remove it with \`preload\` and a \`NodePool\`, and measure again.`,
            requirements: [
              md`Before changing anything, record the worst frame time during a wave from the Profiler, in \`docs/perf.md\`.`,
              md`Enemy scenes are \`preload\`ed or held by a pool; nothing calls \`load()\` during combat.`,
              md`Skeletons come from a \`NodePool\` created when the room loads; a defeated skeleton returns to the pool and comes back with full HP and its idle state.`,
              md`After the change, no frame during a wave exceeds 16.7 ms in the Profiler, and the result is recorded next to the "before" number.`,
              md`The project is committed, with the before/after numbers in the commit message.`,
            ],
            hints: [
              md`Give the skeleton's root script a \`reset()\` that refills \`HealthComponent\`, returns the state machine to idle and re-enables the hurtbox.`,
              md`Size the pool to the most enemies on screen at once (here 12), so \`take()\` never has to create one mid-fight.`,
              md`If the frame is still slow after pooling, look at what \`reset()\` and \`_ready()\` do: an expensive \`_ready()\` is now paid at room load, which is fine, but an expensive \`reset()\` is still paid mid-fight.`,
            ],
            solution: [
              { file: 'scripts/node_pool.gd', code: POOL },
              { file: 'scripts/enemy_spawner.gd', code: SPAWNER },
            ],
            explain: md`The pool moves the cost of building enemies from the frame they appear to the moment the room loads, which is hidden behind the transition from p01. \`CONNECT_ONE_SHOT\` disconnects the \`died\` handler after it fires, so a skeleton reused five times is returned once per death instead of five times.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'p02-2-paper',
            title: 'Two performance bugs',
            type: 'debug',
            difficulty: 2,
            minutes: 8,
            statement: md`This script is on each of 12 bats. The game hitches whenever bats are near Kai, and the Profiler shows the bat's \`_physics_process\` at the top. Find two problems and fix them.

\`\`\`gdscript
func _physics_process(delta: float) -> void:
	for p in get_tree().get_nodes_in_group("player"):
		if global_position.distance_to(p.global_position) < 40.0:
			var fx := load("res://scenes/fx/screech.tscn").instantiate()
			add_child(fx)
	velocity = velocity.move_toward(target_velocity, 300.0 * delta)
	move_and_slide()
\`\`\``,
            hints: [md`What does \`load\` do the first time it is called on a frame, and how often does the \`if\` run while the bat is near?`],
            solution: [
              md`\`load(...)\` inside the loop: the first call reads and parses the scene on that frame. Even when cached, the effect is instanced every physics frame (60 times a second) while the bat is within 40 px, spawning dozens of nodes. Use \`const SCREECH := preload(...)\`, and trigger the effect once on entering range (an Area2D's \`body_entered\`, or a boolean that remembers the bat was already near).`,
              md`\`get_tree().get_nodes_in_group("player")\` every frame in 12 bats builds a new Array each time. Cache the player once (\`@onready var player := get_tree().get_first_node_in_group("player")\`) or have a manager hand it to enemies.`,
            ],
            rubric: [md`Finds the runtime \`load\` and per-frame instancing`, md`Finds the per-frame group lookup`, md`Fixes both with preload, an edge trigger and a cached reference`],
          },
        },
        {
          kind: 'recall',
          prompt: md`Which files in a Godot 4.4 project are committed, which are ignored, and which go to LFS?`,
          answer: md`Commit project.godot, scenes, resources, scripts, export_presets.cfg, assets with their \`.import\` files, and the \`.uid\` files. Ignore \`.godot/\` (the cache). Large binaries (PNG, WAV, OGG, Aseprite, fonts) go through Git LFS via \`.gitattributes\`.`,
        },
        {
          kind: 'explain',
          prompt: md`A colleague says "the game averages 120 fps, performance is fine". What do you check, and why?`,
          model: md`The worst frames, not the average. A game can average 120 fps and still freeze for 50 ms when an enemy wave loads or a save is written, and players notice those freezes far more than a lower steady frame rate. I would look at the Profiler's frame graph during the moments that matter (spawns, saves, effects, room changes), find any frame above the budget, and read its function breakdown; the 99th-percentile or worst frame time is the number to track.`,
        },
      ],
      cards: [
        { id: 'p02-2-c1', kind: 'cloze', text: md`In a Godot 4 project, \`.gitignore\` must contain \`{{}}\`.`, answers: ['.godot/|.godot'] },
        { id: 'p02-2-c2', kind: 'compute', front: md`Frame budget at 60 fps, in ms?`, answer: { kind: 'number', value: 1000 / 60, tol: 0.002 }, back: md`$1000/60 \approx 16.7$ ms for scripts, physics and rendering together.` },
        { id: 'p02-2-c3', kind: 'concept', front: md`Why does an average frame time hide hitches?`, back: md`One 46 ms frame among hundreds of 7 ms frames barely moves the average but freezes the image for 3 refreshes. Track the worst or 99th-percentile frame.` },
        { id: 'p02-2-c4', kind: 'concept', front: md`What does object pooling move, and to when?`, back: md`The cost of creating nodes (instancing, \`_ready\`) moves from the frame they appear to the moment the level loads; afterwards nodes are taken and given back instead of created and freed.` },
        { id: 'p02-2-c5', kind: 'concept', front: md`How do you resolve a structural merge conflict in a .tscn?`, back: md`Take one side whole (\`git checkout --theirs/--ours\`), open it in Godot, and redo the other change in the editor. Hand-merging can produce duplicate ids or orphan nodes.` },
      ],
    },
    // =========================================================================== p02-3
    {
      id: 'p02-3',
      title: 'Automated tests, debug tools and cheats',
      minutes: 35,
      objectives: [
        'Install GUT (or gdUnit4) and write unit tests for pure game logic such as the damage formula.',
        'Choose test cases at boundaries and explain why they catch more bugs than typical values.',
        'Run tests from the editor and the command line, and keep logic testable by separating it from nodes.',
        'Build a debug overlay and cheats that exist only in debug builds.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`In month nine you change the damage formula so that Bram's guard ability feels stronger. Two weeks later a playtester notices that critical hits on resistant enemies do 1 damage. Which change caused it? A **unit test** for the formula would have failed the moment you made the change, with the inputs that break it.

Not everything in a game can be tested automatically: whether a jump feels good is for playtests. But the rules underneath are plain functions and are easy to test:
- damage
- XP curves
- drop chances
- inventory stacking
- shard levelling
- save data round-trips

They are also the code most likely to break silently, because nothing crashes when a number is wrong.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Unit tests in Godot',
          md: md`A **unit test** calls one piece of code with chosen inputs and **asserts** the output equals what you expect. A test that used to pass and now fails has found a **regression**.

Godot has no built-in test runner. Two community add-ons from the Asset Library are widely used:
- **GUT**: test scripts extend \`GutTest\` and contain functions starting with \`test_\`, using assertions like \`assert_eq(got, expected)\`.
- **gdUnit4**: test suites extend \`GdUnitTestSuite\` and use fluent assertions like \`assert_int(got).is_equal(expected)\`.

Both run from a panel in the editor and from the command line. This lesson uses GUT; the ideas carry over unchanged.`,
        },
        {
          kind: 'steps',
          title: 'Install GUT',
          steps: [
            md`Open the **AssetLib** tab at the top of the editor, search for **GUT**, pick the version for Godot 4, click **Download** and then **Install**. It installs into \`addons/gut/\`.`,
            md`Enable it: **Project → Project Settings → Plugins**, tick **Gut**. A **GUT** panel appears at the bottom of the editor.`,
            md`Create the folder \`test/unit/\`. In the GUT panel's settings, add \`res://test/unit\` to the test directories.`,
            md`Add \`scripts/damage_formula.gd\` and \`test/unit/test_damage_formula.gd\` from the listings below, then click **Run All** in the GUT panel.`,
          ],
          result: md`The GUT panel lists seven tests, all passing. Change \`CRIT_MULTIPLIER\` to 2.0 and run again: exactly the crit tests fail, naming the expected and actual values. Change it back.`,
          troubleshoot: [
            { problem: md`GUT finds 0 tests.`, fix: md`The file name must start with \`test_\` (by default), it must extend \`GutTest\`, and its folder must be in the panel's directory list.` },
            { problem: md`\`Identifier "DamageFormula" not declared\`.`, fix: md`The \`class_name\` line is missing, or the project has not rescanned scripts; save the script and wait a moment, or restart the editor.` },
          ],
        },
        { kind: 'code', file: 'scripts/damage_formula.gd', code: DAMAGE, note: md`The formula is a \`static func\` on a \`RefCounted\` class: no node, no scene tree, no randomness inside. Combat code calls it; tests call it the same way. The crit roll happens outside and is passed in as \`crit\`, which is what makes the function testable.` },
        { kind: 'code', file: 'test/unit/test_damage_formula.gd', code: TEST_DAMAGE },
        {
          kind: 'derive',
          title: 'What should "defence 100" do?',
          goal: md`The formula multiplies by $\frac{100}{100 + D}$ for defence $D$. Derive what that means for expected values in the tests and for how much each point of defence is worth.`,
          steps: [
            { md: md`Damage after defence: $d = d_0 \cdot \dfrac{100}{100 + D}$. At $D = 100$: $\dfrac{100}{200} = \dfrac12$. That is the \`test_defence_100_halves_damage\` case: 20 becomes 10.` },
            {
              md: md`How many hits does a target with HP $H$ survive? Each hit does $d_0 \cdot \frac{100}{100+D}$, so it takes $H \cdot \dfrac{100 + D}{100\,d_0}$ hits. Call $H \cdot \frac{100 + D}{100}$ the **effective HP**.`,
              choose: {
                prompt: md`How does effective HP grow with $D$?`,
                options: [md`Linearly: each point of defence adds 1% of base HP`, md`It doubles with every point`, md`It stops growing after $D = 100$`],
                answer: 0,
                explain: md`$H(1 + D/100)$ is a straight line in $D$: 100 defence doubles effective HP, 200 triples it. Damage falls off more and more slowly, but survivability grows steadily, which keeps defence worth buying at every level.`,
              },
            },
            { md: md`For tests this means: pick $D$ values where the multiplier is exact (0, 100, 300 give 1, ½, ¼) for readable expectations, plus one value where it is not (50 gives ⅔) to exercise the rounding.` },
          ],
          takeaway: md`Understanding the formula's shape tells you which inputs make good test cases: exact values for readable checks, awkward ones for rounding, extremes for the minimum.`,
        },
        {
          kind: 'text',
          md: md`### Which cases to test

A test with typical values (attack 20, no defence, no crit) checks that the formula runs, and little else: many bugs give the right answer for it. Good cases sit where bugs live:
- **Boundaries**, where a rule kicks in: damage that rounds to 0 (is the minimum of 1 applied?), defence 0 against defence 300.
- **One rule per test**, so a failure names the rule: resistance alone, crit alone.
- **Rounding**, with a fractional result such as 10.5, which separates floor from round.
- **One combined case**, to check the order of operations.

One way to judge a test suite is **mutation testing**: make small deliberate bugs (mutants) and check that some test fails for each. The figure does that for five realistic one-line bugs.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ship.tests' },
          task: md`The suite starts with one typical test. How many mutants does it kill? Add tests until all five are killed, using as few tests as you can.`,
          caption: md`A mutant is killed when at least one test's expected value (from the correct formula) differs from what the mutant returns; that test would fail if the bug were real. Three well-chosen tests are enough to kill all five.`,
        },
        {
          kind: 'check',
          q: md`Which single test kills the "integer division" mutant, \`attack * power * (100 / (100 + defence))\`?`,
          options: [
            md`\`assert_eq(DamageFormula.compute(20, 1.0, 50), 13)\``,
            md`\`assert_eq(DamageFormula.compute(20, 1.0, 0), 20)\``,
            md`\`assert_eq(DamageFormula.compute(20, 1.0, 0, 1.0, true), 30)\``,
            md`\`assert_eq(DamageFormula.compute(7, 1.5, 0), 10)\``,
          ],
          answer: 0,
          explain: md`In GDScript, \`100 / (100 + defence)\` with two ints is integer division: with defence 0 it is 1 (no visible bug), with any positive defence it is 0, so the mutant returns the minimum, 1. Only a test with defence above 0 sees the difference: the correct value is $\lfloor 20 \cdot 100/150 \rfloor = 13$.`,
        },
        {
          kind: 'numeric',
          q: md`What does \`DamageFormula.compute(30, 1.5, 50, 0.5, true)\` return?`,
          answer: { kind: 'number', value: 22 },
          explain: md`$30 \times 1.5 \times 100 / 150 = 30$; $\times 0.5 = 15$; crit $\times 1.5 = 22.5$; floor gives 22.`,
        },
        {
          kind: 'text',
          md: md`### Running tests often

Tests only help if they run. GUT also runs headless from a terminal, which makes it easy to run before every commit, or on every push with a CI service such as GitHub Actions:

\`\`\`text
godot --headless -s addons/gut/gut_cmdln.gd -gdir=res://test/unit -gexit
\`\`\`

The command prints the results and exits with a non-zero code when a test fails, which is what CI checks. Keep the suite fast (pure functions run in milliseconds) so running it is never a chore.

### Debug overlays and cheats

The other half of testing is manual, and it goes faster with tools:
- an overlay that shows frame time, node count and draw calls while you play
- god mode, to reach the boss without dying
- extra gold, to test the shop
- slow motion, to check attack frames by eye.

These must never reach players. \`OS.is_debug_build()\` is true when running from the editor or a debug export and false in a release export, so the overlay frees itself in release builds.`,
        },
        { kind: 'code', file: 'ui/debug_overlay.gd', code: OVERLAY, note: md`Add \`ui/debug_overlay.tscn\` (a CanvasLayer with a Label child and this script) to the main scene. For god mode, add one line at the top of \`HealthComponent.take_damage\`: \`if DebugOverlay.god_mode and owner.is_in_group("player"): return\`.` },
        {
          kind: 'build',
          ch: {
            id: 'p02-3-build',
            title: 'Tests and tools for the slice',
            goal: md`Protect the slice's rules with unit tests and give yourself a debug overlay and cheats for manual testing.`,
            requirements: [
              md`GUT (or gdUnit4) is installed, and \`test/unit/\` has at least seven damage tests that all pass.`,
              md`Every rule of the formula (defence, minimum, element, crit, floor) has its own test, and changing any single constant makes at least one test fail.`,
              md`The suite runs from the command line and exits with a failure code when you deliberately break the formula.`,
              md`F1 toggles an overlay with FPS, frame time, node count, draw calls and enemy count; F2 god mode, F3 gold, F4 slow motion all work.`,
              md`A release export contains no overlay: pressing F1 in it does nothing.`,
            ],
            hints: [
              md`To check the last requirement, export a release build (p03-1) and run it; \`OS.is_debug_build()\` is false there.`,
              md`If a test is hard to write because the code needs nodes, move the calculation into a static function and test that.`,
            ],
            solution: [
              { file: 'test/unit/test_damage_formula.gd', code: TEST_DAMAGE },
              { file: 'ui/debug_overlay.gd', code: OVERLAY },
            ],
            explain: md`The tests pin down each rule separately, so a failure tells you which rule changed. The overlay's cheats are guarded twice: the node frees itself in release builds, and god mode is a static flag that only it can set.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'p02-3-paper',
            title: 'Tests for stacking items',
            type: 'code-on-paper',
            difficulty: 2,
            minutes: 10,
            statement: md`\`Inventory.add_to_stack(current: int, amount: int, max_stack := 99) -> int\` adds \`amount\` to a stack and returns how many items did **not** fit. Write a GUT test script with the cases you consider necessary, and say what each one guards against.`,
            solution: [
              md`\`\`\`gdscript
extends GutTest

func test_fits() -> void:
	assert_eq(Inventory.add_to_stack(10, 5), 0)

func test_exactly_full() -> void:
	assert_eq(Inventory.add_to_stack(94, 5), 0)

func test_overflow() -> void:
	assert_eq(Inventory.add_to_stack(98, 5), 4)

func test_already_full() -> void:
	assert_eq(Inventory.add_to_stack(99, 3), 3)

func test_custom_max() -> void:
	assert_eq(Inventory.add_to_stack(8, 5, 10), 3)
\`\`\``,
              md`\`test_exactly_full\` guards the off-by-one between \`<\` and \`<=\`; \`test_overflow\` checks the returned remainder; \`test_already_full\` a stack with no room; \`test_custom_max\` that the parameter is used instead of a hard-coded 99. Adding 0 items is a reasonable extra case.`,
            ],
            rubric: [md`Includes the exact boundary (filling to max)`, md`Checks the returned overflow value, not only that something is returned`, md`Covers the custom max_stack`, md`One rule per test`],
          },
        },
        {
          kind: 'recall',
          prompt: md`What makes game code easy to unit test, and what should you test by playtesting instead?`,
          answer: md`Pure functions with no nodes, no scene tree and no randomness inside (pass dice rolls in), such as the damage formula, XP curves, drop tables and inventory rules. Feel, readability and fun (jump arcs, hit feedback, difficulty) are for playtests.`,
        },
        {
          kind: 'explain',
          prompt: md`Why does a test with typical values catch fewer bugs than a test at a boundary?`,
          model: md`Many bugs only change the result in a corner: a missing minimum only matters when damage rounds to 0, integer division only when defence is positive, round versus floor only when the fraction is at least 0.5. Typical values sit away from those corners, so a buggy formula often returns the right answer for them. Boundary cases are chosen where a rule switches on, which is where the mistakes are.`,
        },
      ],
      cards: [
        { id: 'p02-3-c1', kind: 'cloze', text: md`GUT test scripts extend \`{{}}\` and their test functions start with \`test_\`.`, answers: ['GutTest'] },
        { id: 'p02-3-c2', kind: 'concept', front: md`What is a mutant in mutation testing?`, back: md`A copy of the code with a small deliberate bug. A good suite has a test that fails for every mutant; a surviving mutant shows a missing test case.` },
        { id: 'p02-3-c3', kind: 'compute', front: md`Defence multiplier $\frac{100}{100+D}$ at $D = 300$?`, answer: { kind: 'number', value: 0.25 }, back: md`$100/400 = 0.25$: a quarter of the damage, four times the effective HP.` },
        { id: 'p02-3-c4', kind: 'cloze', text: md`Cheats and overlays check \`OS.{{}}()\` so they never run in release exports.`, answers: ['is_debug_build'] },
        { id: 'p02-3-c5', kind: 'concept', front: md`Why pass the crit roll into \`DamageFormula.compute\` instead of rolling inside?`, back: md`Randomness inside makes the result unpredictable, so a test cannot state the expected value. Rolling outside keeps the function pure and testable.` },
      ],
    },
  ],
  problems: [
    {
      id: 'p02-p1',
      title: 'Rooms for an hour of play',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`A dungeon should give 75 minutes of play. Rooms take 5 minutes on average to clear, and each room takes 6 hours to build. How many hours of room work is that?`,
      solution: [md`$75 / 5 = 15$ rooms.`, md`$15 \times 6 = 90$ hours.`],
      answer: { kind: 'number', value: 90 },
      areas: ['ship'],
    },
    {
      id: 'p02-p2',
      title: 'Weeks at your pace',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`A slice estimate is 680 hours before overhead. With +25% for polish and bugs and 14 hours of work a week, how many weeks does it take?`,
      solution: [md`$680 \times 1.25 = 850$ h.`, md`$850 / 14 \approx 60.7$ weeks.`],
      answer: { kind: 'number', value: (680 * 1.25) / 14, tol: 0.002 },
      areas: ['ship'],
    },
    {
      id: 'p02-p3',
      title: 'What is left of the frame',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`At 60 fps, physics takes 2.4 ms and rendering 5.1 ms. How many milliseconds are left for scripts before the frame misses its budget?`,
      solution: [md`Budget $1000/60 = 16.67$ ms.`, md`$16.67 - 2.4 - 5.1 = 9.17$ ms.`],
      answer: { kind: 'number', value: 1000 / 60 - 7.5, tol: 0.002 },
      areas: ['ship', 'godot'],
    },
    {
      id: 'p02-p4',
      title: 'Music history',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`Five music tracks of 4 MB each are re-exported 12 times during development and committed each time, without LFS. How many MB of history do they add (original plus 12 versions)?`,
      solution: [md`Each track is stored 13 times: $13 \times 4 = 52$ MB.`, md`Five tracks: $260$ MB, downloaded by every clone. With LFS a clone gets only the current 20 MB.`],
      answer: { kind: 'number', value: 260 },
      areas: ['ship'],
    },
    {
      id: 'p02-p5',
      title: 'The skeleton that comes back dead',
      type: 'debug',
      difficulty: 2,
      minutes: 6,
      statement: md`After adding a \`NodePool\`, skeletons in the second wave die from a single hit, and some never attack. Their scene has \`HealthComponent\` and a \`StateMachine\`, and their root script has no \`reset()\`. Explain the bug and the fix.`,
      solution: [
        md`A pooled skeleton is the same node that died earlier. Without \`reset()\`, it comes back with the HP it had when it died (0 or less) and whatever state its state machine was left in (dead, or mid-attack with timers running).`,
        md`Add \`reset()\` to the skeleton's root script: set HP to max (and emit \`health_changed\` so bars update), put the state machine back in idle, clear timers and status effects, re-enable the hurtbox, and reset the animation. \`NodePool.take()\` calls it on every reuse.`,
      ],
      rubric: [md`Identifies stale state on reused nodes`, md`Lists the state to reset (HP, state machine, timers, collision, animation)`],
      areas: ['ship', 'godot'],
    },
    {
      id: 'p02-p6',
      title: 'Acceptance criteria for the golem',
      type: 'design',
      difficulty: 2,
      minutes: 8,
      statement: md`Write acceptance criteria for the milestone "Golem boss fight" that a playtester could check without reading code.`,
      solution: [
        md`The golem's arena is reached through the dungeon's last door; the door locks behind the party and opens when the golem is defeated.`,
        md`The golem has three attacks, each with a wind-up animation and sound at least 0.5 s before the hit; a player who dodges on the wind-up takes no damage.`,
        md`Filling its stagger gauge staggers it for 4 s, during which it takes increased damage; the gauge and the stagger state are visible.`,
        md`The fight can be won with any one of the three party members controlled; defeat returns the party to the last save point; no frame exceeds 16.7 ms during the fight.`,
      ],
      rubric: [md`Each criterion is checkable by playing`, md`Covers telegraphs, stagger, win and lose conditions`, md`Includes a performance or stability criterion`],
      areas: ['ship', 'combat'],
    },
    {
      id: 'p02-p7',
      title: 'What to automate',
      type: 'concept',
      difficulty: 1,
      minutes: 5,
      statement: md`For each of these, say whether it should be a unit test, a playtest question, or both, and why: (a) the XP needed for level 10, (b) whether the dash feels responsive, (c) that a saved game loads with the same inventory, (d) whether players understand shards.`,
      solution: [
        md`(a) Unit test: a pure function with an exact expected value. (c) Unit test (save to a string, load it back, compare), plus a manual check that it works across real game sessions.`,
        md`(b) and (d) Playtest: feel and understanding are about people, not values. You can unit test the dash's numbers, but not whether they feel right.`,
      ],
      rubric: [md`Pure rules → tests`, md`Feel and comprehension → playtests`, md`Notes that some need both`],
      areas: ['ship'],
    },
    {
      id: 'p02-p8',
      title: 'A test for the crit rule',
      type: 'code-on-paper',
      difficulty: 1,
      minutes: 5,
      statement: md`Write a GUT test function that checks only the crit rule of \`DamageFormula.compute\`, in a way that would still pass if the base formula changed, as long as crits stay ×1.5.`,
      solution: [
        md`Compare a crit and a non-crit call with the same inputs, chosen so both values are whole numbers before flooring:

\`\`\`gdscript
func test_crit_multiplies_by_one_and_a_half() -> void:
	var normal := DamageFormula.compute(40, 1.0, 0)
	var crit := DamageFormula.compute(40, 1.0, 0, 1.0, true)
	assert_eq(crit, int(normal * 1.5))
\`\`\``,
        md`Testing the ratio instead of a hard-coded 60 ties the test to the rule it is about. Inputs that give whole numbers (40 → 40 and 60) avoid rounding noise.`,
      ],
      rubric: [md`Tests the relation between crit and non-crit`, md`Chooses inputs that avoid rounding ambiguity`],
      areas: ['ship', 'godot'],
    },
    {
      id: 'p02-p9',
      title: 'Merging a scene',
      type: 'concept',
      difficulty: 1,
      minutes: 4,
      statement: md`Explain when you can resolve a \`.tscn\` merge conflict by editing text, and when you should take one side and redo the other change in the editor. How do you make conflicts rarer?`,
      solution: [
        md`Text edits are safe for a conflict in a single property of an existing node (a position, a colour): keep one value and delete the markers. When both sides added or removed nodes or resources, the ids and parent paths may clash; take one side whole and redo the other change in the editor.`,
        md`Make them rarer with small scenes instanced into larger ones, committing before editing a scene, and not editing the same scene on two branches.`,
      ],
      rubric: [md`Distinguishes property from structural conflicts`, md`Gives the take-one-side approach`, md`Gives a prevention strategy`],
      areas: ['ship', 'godot'],
    },
  ],
};
