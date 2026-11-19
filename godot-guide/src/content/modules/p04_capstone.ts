import { md, gd, type Module } from '../types';

const SLICE_DOC = `# docs/slice.md: the Shardbound vertical slice (20-30 minutes)

## Route
Brindle (town) -> Shardfall Fields -> Sunken Archive (dungeon, 6 rooms) -> golem -> back to Brindle

## Content
Areas      town, field, dungeon                         tilesets: overworld, dungeon
Party      Kai (sword), Lyra (mage), Bram (shield)      Lyra joins in town, Bram in the field
Enemies    slime, ember slime (palette swap), bat, skeleton
Boss       golem (3 attacks, stagger window)
Abilities  Rising Slash, Whirlwind (Kai), Taunt (Bram), Fire, Ice, Heal, Shield Bash (shards)
Shards     Fire, Ice, Heal, Bash (grant abilities), Swiftness (+10% ATB rate), Vigor (+10% max HP)
Town       8 NPCs, 1 shop (potions, Swiftness shard), 1 quest: the elder's lost shard
Saves      inn (town), archive entrance

## Pacing target (minutes)
town 6, field 7, dungeon 8, golem 4

## Cut list (in order, if a milestone runs 2+ weeks late)
1. ember slime -> plain slime
2. third dungeon puzzle
3. Taunt
4. 8 NPCs -> 5
`;

const PUZZLE_MAP = `Sunken Archive, room 3: "the plate and the ledge"   (one character = 16x16 tile)

  ###########
  #^^^^^^^^G#    ^ = raised floor, elevation 1     G = gate, open while P is pressed
  #^^C^^^^^^#    C = crate on the raised floor
  #^^^^^^^^^#
  #.........#    . = floor, elevation 0
  #..P...S..#    P = pressure plate               S = stairs up to elevation 1 (one way)
  #.........#
  ###D#######    D = door you came in by

Solution: climb the stairs, push the crate off the ledge so it drops onto P, walk to G.
Teaches: elevation is a place you can push things from, not only stand on.
Safe to fail: a crate that misses P lands on the floor; walking into the room resets it.
`;

const CONTENT_TEST = gd`
extends GutTest
## test/unit/test_slice_content.gd: catches missing or broken data before a playtester does.

const ABILITY_DIR := "res://resources/abilities/"
const SHARD_DIR := "res://resources/shards/"
const ENEMY_DIR := "res://resources/enemies/"
const PARTY_DIR := "res://resources/party/"


func _load_all(dir: String) -> Array[Resource]:
    var out: Array[Resource] = []
    for file in DirAccess.get_files_at(dir):
        if file.ends_with(".tres"):
            out.append(load(dir + file))
    return out


func test_every_resource_loads() -> void:
    for dir in [ABILITY_DIR, SHARD_DIR, ENEMY_DIR, PARTY_DIR]:
        for res in _load_all(dir):
            assert_not_null(res, "a .tres in %s failed to load" % dir)


func test_slice_counts() -> void:
    assert_between(_load_all(ABILITY_DIR).size(), 6, 8, "6-8 abilities")
    assert_eq(_load_all(SHARD_DIR).size(), 6, "6 shards")
    assert_eq(_load_all(PARTY_DIR).size(), 3, "Kai, Lyra, Bram")
    # slime, ember slime, bat, skeleton and the golem
    assert_eq(_load_all(ENEMY_DIR).size(), 5, "4 enemy types + golem")
`;

const EVENTS = gd`
extends Node
## Events autoload: the global signal bus. These are the signals the slice's systems use to talk
## across module boundaries. Add the ones your bus does not have yet.

signal area_entered(area_id: String)
signal enemy_defeated(enemy_id: String)
signal enemy_staggered(enemy_id: String, by_member: String)
signal boss_defeated(boss_id: String)
signal party_leader_changed(member_id: String)
signal shard_equipped
signal item_bought(item_id: String)
signal quest_updated(quest_id: String, stage: int)
signal save_requested
`;

const AREAS_TEST = gd`
extends GutTest
## test/integration/test_areas_load.gd: every area scene loads, enters the tree and runs 10 frames.
## Cheap to run at every milestone; catches broken paths and errors in _ready().

const AREAS := [
    "res://scenes/areas/town.tscn",
    "res://scenes/areas/field.tscn",
    "res://scenes/areas/dungeon_1.tscn",
]


func test_areas_load_and_run() -> void:
    for path in AREAS:
        var scene := load(path) as PackedScene
        assert_not_null(scene, "%s does not load" % path)
        if scene == null:
            continue
        var area := scene.instantiate()
        add_child_autofree(area)
        await wait_frames(10)
        assert_true(area.is_inside_tree(), "%s left the tree" % path)
`;

const MILESTONES_DOC = `# docs/milestones.md (estimates in weeks at my pace)

| id  | milestone                  | est | actual | ratio | tag            |
|-----|----------------------------|-----|--------|-------|----------------|
| M1  | Movement room              | 2   | 3      | 1.50  | m1-movement    |
| M2  | Combat loop                | 3   | 4      | 1.33  | m2-combat      |
| M3  | Enemy roster               | 3   | 4      | 1.33  | m3-enemies     |
| M4  | ATB, tactical, stagger     | 4   |        |       |                |
...
Running ratio: 11 / 8 = 1.375. Remaining estimate 27 wk -> forecast 37 wk.
Decision: apply cut 1 now (ember slime -> plain slime).
`;

const BUGBASH = `# docs/bugbash.md: run on a release build, controller in hand, video recording on

## Movement and collision
[ ] Dash along every wall of every room, into every corner, at every angle
[ ] Jump at every ledge edge; fall into every pit; jump during a room transition
[ ] Walk into doors from the side and diagonally

## Combat
[ ] Attack, dodge and guard at once; spam each button during hitstop
[ ] Die while casting, while staggered, during tactical mode
[ ] Stagger the golem and switch characters during the stagger

## Party and menus
[ ] Switch leader during every animation; open the menu mid-attack
[ ] Every menu: open, navigate, close with the gamepad only
[ ] Unplug and replug the controller in combat and in a menu

## Saving
[ ] Save at both save points, quit, load: compare HP, items, quest stage, opened chests
[ ] Save with a full inventory and with 0 gold

## Platform
[ ] Alt-tab during a fight; resize the window; 60 Hz and 144 Hz monitors
[ ] Steam Deck: sleep and wake mid-fight; read every text
[ ] Play 30 minutes straight and watch the Monitors for growing node count or memory
`;

const BUG_REPORT = `TITLE  Golem stays staggered forever after a stagger during its slam wind-up
BUILD  0.9.0-rc1 (Windows, release)            FREQUENCY  3 of 10 tries
SEVERITY  S2 blocks progress

STEPS
1. Load the save "archive_entrance" (attached), enter the golem room.
2. Fill the golem's stagger gauge with Bram's Shield Bash while its slam wind-up plays.
3. Wait for the stagger to end (4 s).

EXPECTED  the golem recovers after 4 s and resumes attacking
ACTUAL    the golem stays in "stagger", takes no damage, the fight cannot end
EVIDENCE  video 00:41-01:10, godot.log, bug capture 2026-11-02T21-14-03.png
NOTES     the windup state's timer keeps running while staggered (guess)
`;

const BUG_CAPTURE = gd`
extends Node
## Bug capture for playtest builds: F8 saves a screenshot and a note with the build, scene,
## player position and frame rate, so every report comes with evidence.


func _ready() -> void:
    if not OS.is_debug_build():
        queue_free()


func _unhandled_input(event: InputEvent) -> void:
    var key := event as InputEventKey
    if key == null or not key.pressed or key.echo or key.keycode != KEY_F8:
        return
    var stamp := Time.get_datetime_string_from_system().replace(":", "-")
    var dir := "user://bug_reports/"
    DirAccess.make_dir_recursive_absolute(dir)
    get_viewport().get_texture().get_image().save_png(dir + stamp + ".png")
    var note := FileAccess.open(dir + stamp + ".txt", FileAccess.WRITE)
    note.store_line("build: %s" % ProjectSettings.get_setting("application/config/version", "dev"))
    note.store_line("scene: %s" % get_tree().current_scene.scene_file_path)
    var player := get_tree().get_first_node_in_group("player") as Node2D
    if player:
        note.store_line("player: %s" % player.global_position)
    note.store_line("fps: %d" % Engine.get_frames_per_second())
    note.close()
    print("Bug capture saved in ", ProjectSettings.globalize_path(dir))
`;

const ROADMAP_DOC = `# docs/roadmap.md: from the slice to release (weeks at my pace, x1.375 measured ratio)

R1  Slice playtests and fixes             4 -> 5.5
R2  Store page, Coming Soon               3 -> 4      (after R1)
R3  Next Fest demo                        3 -> 4      (after R1, R2; festival date: TBD from Valve)
R4  Region 2 content                     10 -> 14     (after R1)
R5  Region 3 content                     10 -> 14     (after R4)
R6  Story, quests, ending                 8 -> 11     (after R4)
R7  Progression and balance               4 -> 5.5    (after R5, R6)
R8  Localisation                          4 -> 5.5    (after R6)
R9  Beta branch, Deck checks              4 -> 5.5    (after R7, R8)
R10 Launch                                2 -> 3      (after R3, R9)
Total ~72 weeks of work. Cut first if late: R5 becomes a smaller region; R8 after launch.
`;

export const MODULE: Module = {
  id: 'p04',
  part: 'ship',
  order: 4,
  title: 'Capstone: the vertical slice',
  summary: 'Defining Shardbound\'s vertical slice, an integration plan of milestones with acceptance criteria and a critical path, a structured bug bash with triage and a release candidate, and the roadmap from the slice to a full release.',
  relevance: md`Everything in the course comes together here: one town, one field and a dungeon with height puzzles, Kai, Lyra and Bram, four enemy types and the golem, 6–8 abilities and 6 shards, a shop, a quest, dialogue and save points, built to final quality in about 20–30 minutes of play. This module is the plan for building it: what exactly is in it, in which order the systems are connected, how you know each milestone is really done, how you find the bugs before players do, and what happens after it.`,
  prereqs: ['c04', 'c05', 'k05', 'r05', 'r06', 'p01', 'p02', 'p03'],
  areas: ['ship', 'systems', 'combat'],
  lessons: [
    // =========================================================================== p04-1
    {
      id: 'p04-1',
      title: "Defining Shardbound's vertical slice",
      minutes: 40,
      objectives: [
        "Write the slice's content list and check each item against the design pillars.",
        'Pace the slice in minutes per area and derive how many encounters each area needs.',
        'Design height puzzles for the dungeon that teach, test and are safe to fail.',
        "Set up the slice's project structure and data resources, guarded by a content test.",
      ],
      cells: [
        {
          kind: 'text',
          md: md`The slice is the smallest piece of Shardbound that is the whole game. A player starts in the town of **Brindle**, where Lyra joins and the elder asks them to recover a shard from the **Sunken Archive**. They buy a potion and a shard in the shop, cross **Shardfall Fields** (slimes, bats, Bram joins), solve three height puzzles in the archive's six rooms, fight skeletons, defeat the golem and return for the reward. Twenty to thirty minutes, every system, final quality.

"Final quality" is the expensive part, and the reason the slice must be small. A short list of content, finished, is the target; anything not on the list waits for the full game.`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'The slice content list',
          md: md`| Part | In the slice | Pillar it serves |
|---|---|---|
| Areas | town, field, 6-room dungeon | moving feels good (height, dashing) |
| Party | Kai, Lyra, Bram | the party matters |
| Enemies | slime, ember slime (palette swap), bat, skeleton | every hit reads (four distinct telegraphs) |
| Boss | the golem: 3 attacks, a stagger window | real time and tactics in one fight |
| Abilities | Rising Slash, Whirlwind, Taunt, Fire, Ice, Heal, Shield Bash | tactics |
| Shards | Fire, Ice, Heal, Bash, Swiftness, Vigor | tactics, the party |
| Town | 8 NPCs, a shop, one quest, dialogue | a reason to explore |
| Saves | inn, archive entrance | finishing a session safely |

Each line is justified by a pillar. Anything that is not (fishing, crafting, a second town) is out.`,
        },
        {
          kind: 'derive',
          title: 'How many encounters in the field?',
          goal: md`The pacing target gives the field 7 minutes. An encounter lasts about 40 s, and walking (plus a little exploring) between encounters takes about 45 s. How many encounters should the field have?`,
          steps: [
            { md: md`One encounter plus the walk to the next takes $40 + 45 = 85$ s. That is the field's repeating unit.` },
            {
              md: md`Seven minutes is 420 s.`,
              choose: {
                prompt: md`So the field holds about`,
                options: [md`$420 / 85 \approx 5$ encounters`, md`$420 / 40 \approx 10$ encounters`, md`$420 / 45 \approx 9$ encounters`],
                answer: 0,
                explain: md`Each encounter costs its own duration plus the walk to it. Counting only fight time would pack the field with twice as many fights, and the 7 minutes would feel like 15.`,
              },
            },
            { md: md`Five encounters with four enemy types: introduce one type per encounter (slime, then bat), then combine them, and save the ember slime for the last one. The same arithmetic sizes the dungeon: 8 minutes with puzzles taking about 60 s each leaves room for three puzzles and three fights across 6 rooms.` },
          ],
          takeaway: md`Pacing in minutes turns into counts of encounters and rooms, which turn into work items you can estimate.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ship.scope', preset: 'slice' },
          task: md`Replace the default costs with your measured ones (from p02's build), set your weekly hours, and read the total. Then add one area and two enemy types: how many weeks does that cost?`,
          caption: md`The slice preset matches the content list above: about 30 minutes, three areas, four enemy types, one boss, eight NPCs, seven abilities.`,
        },
        {
          kind: 'text',
          md: md`### Height puzzles

The dungeon is where Shardbound's movement becomes a puzzle. Use your own numbers from c03 (how high Kai jumps, how far a dash-jump carries him), and build each puzzle from one idea.

A good sequence **teaches, then tests, then combines**:

1. **Teach.** The first puzzle teaches climbing between elevations with no risk: a raised path to a switch, where a missed jump just means walking around again.
2. **Test.** The second tests the dash-jump over a pit, where falling sends the party back to the room's entrance with a little damage.
3. **Combine.** The third combines height with an object: push a crate off a ledge onto a pressure plate below.

Every puzzle must be **safe to fail**: leaving and re-entering the room resets it, so nothing can get permanently stuck.`,
        },
        { kind: 'code', file: 'docs/puzzles/room3.txt', lang: 'text', code: PUZZLE_MAP },
        {
          kind: 'check',
          q: md`A playtester falls into the pit in the second puzzle six times and gives up. The pit puzzle comes first in the dungeon. What change follows the teach-test-combine order?`,
          options: [
            md`Move the riskless climbing puzzle first, and add a short, low-risk dash-jump before the pit room so the move is learned before it is tested`,
            md`Make the pit narrower and keep the order`,
            md`Remove the fall damage and keep everything else`,
            md`Add a text box explaining the dash-jump at the pit`,
          ],
          answer: 0,
          explain: md`The tester failed because the test came before the lesson. Teaching the move where failure is free, then testing it, fixes the cause; a narrower pit or a text box treats the symptom.`,
        },
        {
          kind: 'steps',
          title: 'Lay out the slice project',
          steps: [
            md`Create the area scenes \`scenes/areas/town.tscn\`, \`field.tscn\` and \`dungeon_1.tscn\` to \`dungeon_6.tscn\`, each with \`level.gd\` (p01) as its root script and its music set in the Inspector.`,
            md`Connect them with \`door.gd\` instances (p01-3): town ↔ field ↔ dungeon_1, and dungeon rooms in order. Set **Project → Project Settings → Application → Run → Main Scene** to your title screen, which starts in the town.`,
            md`Create the data folders \`resources/party\`, \`resources/enemies\`, \`resources/abilities\` and \`resources/shards\`. In each, create the slice's \`.tres\` files from the classes of g04 and r01–r02 (**FileSystem → right-click → New → Resource**, pick \`CharacterStats\`, \`EnemyData\`, \`AbilityData\` or \`ShardData\`). Placeholder numbers are fine.`,
            md`Add the content test below to \`test/unit/\` and run it in the GUT panel.`,
            md`Write \`docs/slice.md\` (listing below) and commit: \`git commit -m "Slice skeleton: areas, doors, data"\`.`,
          ],
          result: md`Pressing F5 starts in Brindle, and you can walk through every door to the last dungeon room and back. The content test passes with 7 abilities, 6 shards, 3 party members and 5 enemies.`,
          troubleshoot: [
            { problem: md`The content test finds 0 files.`, fix: md`Check the folder paths, including the trailing slash, and that the files end in \`.tres\` (resources saved as \`.res\` are binary and are skipped by this test).` },
            { problem: md`A door leads to the wrong room or the player appears inside a wall.`, fix: md`Each door's \`target_scene\` is set in the Inspector; spawn positions come from c04's spawn-point system. Walk every door once before committing.` },
          ],
        },
        { kind: 'code', file: 'test/unit/test_slice_content.gd', code: CONTENT_TEST, note: md`The test reads the folders instead of a hard-coded list, so a resource added or deleted by mistake shows up as a wrong count. \`assert_between\` passes for any value in the range.` },
        {
          kind: 'build',
          ch: {
            id: 'p04-1-build',
            title: 'The slice skeleton',
            goal: md`Turn the content list into a project you can walk through end to end: every area, every door, every data resource, and a document that says what is in and what is out.`,
            requirements: [
              md`\`docs/slice.md\` lists the route, the content (matching the table above), a pacing target per area and an ordered cut list.`,
              md`From the title screen you can walk town → field → all six dungeon rooms → back, through doors with transitions, without errors in the Debugger.`,
              md`Each area plays its own music, crossfading at doors.`,
              md`All party, enemy, ability and shard \`.tres\` files exist and \`test_slice_content.gd\` passes.`,
              md`Paper designs for the three dungeon puzzles exist, each with what it teaches and how it resets.`,
            ],
            hints: [
              md`Grey boxes are fine at this stage: block out rooms with a few tiles and collision; art comes in the milestones.`,
              md`If a room needs more than one idea to describe, it is two rooms or one idea too many.`,
            ],
            solution: [
              { file: 'docs/slice.md', code: SLICE_DOC, lang: 'text' },
              { file: 'test/unit/test_slice_content.gd', code: CONTENT_TEST },
              { file: 'docs/puzzles/room3.txt', code: PUZZLE_MAP, lang: 'text' },
            ],
            explain: md`The skeleton makes the slice concrete before any milestone starts: every later piece of work has a place to go, the data has a test that guards it, and the cut list means the decision about what to drop is already made when the schedule slips.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'p04-1-paper',
            title: 'A fourth puzzle',
            type: 'design',
            difficulty: 2,
            minutes: 10,
            statement: md`Design one more height puzzle for the Sunken Archive that uses a party member (Bram or Lyra) instead of an object. Give a map sketch, what it teaches, how it resets, and which systems it depends on. Then argue whether it belongs in the slice.`,
            solution: [
              md`Example: a pressure plate on the lower floor holds a gate open on the upper floor. Kai switches to Bram, parks him on the plate, switches back, climbs and passes the gate. It teaches that party members are physical bodies in the world and that switching is spatial, not only tactical.`,
              md`It resets when the leader leaves the room (the party regroups). It depends on party switching (k05), allies that stay where they are told, and elevation (c03), so it cannot be built before M5.`,
              md`Slice or not: it serves "the party matters", but it adds a dependency on ally behaviour in a milestone that is already on the critical path. A reasonable call is to keep it on the post-slice list, or swap it in for the crate puzzle only if M5 finishes early.`,
            ],
            rubric: [md`Clear single idea, teaches something`, md`Reset rule`, md`Names the systems and milestone it depends on`, md`Makes a scope argument`],
          },
        },
        {
          kind: 'recall',
          prompt: md`List the slice's content in one breath.`,
          answer: md`Town, field, 6-room dungeon with height puzzles; Kai, Lyra, Bram; slime, ember slime, bat, skeleton; the golem; 7 abilities; 6 shards; a shop, 8 NPCs, one quest with dialogue; two save points.`,
        },
        {
          kind: 'explain',
          prompt: md`Why does every item in the slice need a design pillar next to it?`,
          model: md`The slice's job is to prove the game's core, and the pillars are the definition of that core. An item that serves no pillar is cost without evidence: it takes time from the systems that need polish, and it will not tell you anything about whether Shardbound works. Writing the pillar down also makes cuts easier: when time runs out, the items with the weakest link to a pillar go first.`,
        },
      ],
      cards: [
        { id: 'p04-1-c1', kind: 'concept', front: md`The three steps of a puzzle sequence?`, back: md`Teach (no risk), test (some risk), combine (two ideas). Every puzzle resets when you leave the room.` },
        { id: 'p04-1-c2', kind: 'compute', front: md`An 8-minute area with 60 s puzzles and 60 s walks between them: how many puzzles fit?`, answer: { kind: 'number', value: 4 }, back: md`$480 / (60 + 60) = 4$.` },
        { id: 'p04-1-c3', kind: 'concept', front: md`How many shards and abilities are in the slice?`, back: md`6 shards (4 grant abilities, 2 passives) and 7 abilities (3 from weapons, 4 from shards).` },
        { id: 'p04-1-c4', kind: 'concept', front: md`What does the slice content test check, and why read folders instead of a list?`, back: md`That every \`.tres\` loads and the counts match the slice. Reading the folders catches files added or deleted by mistake.` },
        { id: 'p04-1-c5', kind: 'cloze', text: md`Pacing turns minutes into counts: encounters $\approx$ area time / (fight time + {{}} time).`, answers: ['walk|walking|travel'] },
      ],
    },
    // =========================================================================== p04-2
    {
      id: 'p04-2',
      title: 'The integration plan: milestones and acceptance criteria',
      minutes: 45,
      objectives: [
        'Order the slice as milestones with dependencies, estimates and acceptance criteria.',
        'Compute the critical path and slack, and explain why a solo developer still needs the total.',
        'Integrate systems through the Events bus, one seam per milestone, with an always-playable main branch.',
        'Close each milestone with a fixed routine and re-forecast from measured estimate ratios.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`By now you have built every system of Shardbound in its own lesson, often in its own test scene. Integration is where solo projects stall: the combat works in the test arena, the shop works in the test town, and the moment they meet, the HUD shows the wrong gold, the save forgets the shard, and the boss fight breaks the transition. Each problem is small; there are many of them, and they appear all at once if you integrate at the end.

The answer is to integrate **continuously**. The slice is built as a chain of milestones, each one connecting a new system to the ones before it, and the \`main\` branch is playable from the title screen to the last thing finished at every commit.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Dependencies and the critical path',
          md: md`A milestone **depends on** another when it cannot be finished (its acceptance criteria cannot pass) before the other is done. The **critical path** is the longest chain of dependent work, in weeks. It is the earliest possible finish if everything off the chain could happen in parallel. A milestone off the critical path has **slack**: it can finish later by that many weeks without delaying the end.

Working alone, nothing happens in parallel, so the finish is the **total** of all estimates. The critical path still tells you the **order**: work on it first, because everything after it is waiting.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ship.milestones', plan: 'slice' },
          task: md`Click M1, read its criteria, and mark it done (click again or use the button). Keep going and watch "ready now" and the critical path. Which milestones can you do in any order? What happens when you undo M2?`,
          caption: md`Orange edges and borders are the critical path through the remaining work. Undoing a milestone also undoes everything that depended on it, which is what happens in practice when a system you built on turns out not to meet its criteria.`,
        },
        {
          kind: 'derive',
          title: 'The critical path of the slice',
          goal: md`Compute the earliest finish of each milestone as $\text{finish}(m) = \text{weeks}(m) + \max_{p \in \text{pre}(m)} \text{finish}(p)$, and compare the critical path with the total.`,
          steps: [
            { md: md`Along the combat chain: M1 finishes at 2, M2 at $3 + 2 = 5$, M4 at $4 + 5 = 9$, M5 at $3 + 9 = 12$. Along the enemies chain: M3 at $3 + 5 = 8$, M9 at $4 + 8 = 12$.` },
            { md: md`M10 (the golem) needs M5 and M9: $3 + \max(12, 12) = 15$. M8 (menus, saving) needs M6 ($3 + 9 = 12$) and M7 ($3 + 2 = 5$): $3 + 12 = 15$. M11: $2 + \max(15, 15) = 17$. M12: $2 + 17 = 19$ weeks.` },
            {
              md: md`The estimates add up to $2+3+3+4+3+3+3+3+4+3+2+2 = 35$ weeks.`,
              choose: {
                prompt: md`You build the slice alone. How long does it take, by these estimates?`,
                options: [md`35 weeks: one person does the milestones one after another`, md`19 weeks: the critical path`, md`12 weeks: the longest single chain before the boss`],
                answer: 0,
                explain: md`The critical path assumes parallel work. Alone, every week of work is on your calendar, so the finish is the total. The critical path matters if you add a contractor (an artist for M7's town, a composer for M11), whose work can run alongside yours.`,
              },
            },
          ],
          takeaway: md`For a solo developer, the total sets the date and the critical path sets the order. With collaborators, the critical path sets the date.`,
        },
        {
          kind: 'numeric',
          q: md`An artist builds the town (M7, 3 weeks) while you code. How many weeks of slack does M7 have, that is, how late can it finish without delaying M8?`,
          answer: { kind: 'number', value: 7 },
          explain: md`M8 starts when both M6 and M7 are done. M6 finishes at week 12, M7 at week 5, so M7 can finish as late as week 12: $12 - 5 = 7$ weeks of slack.`,
        },
        {
          kind: 'text',
          md: md`### Seams between systems

Each milestone connects systems through **seams**, and the cleanest seams are signals on the \`Events\` bus.

- Combat emits \`enemy_defeated\`; the quest system and achievements listen.
- The party manager emits \`party_leader_changed\`; the HUD and the camera listen.
- The shop emits \`item_bought\`; the save system marks the game as changed.

A system that only emits and listens can be tested alone and added to the slice without editing the others. Integrating a milestone means wiring its signals and checking the acceptance criteria in the full game, not in the test scene.

Keep \`main\` playable: do milestone work on a branch, merge when the acceptance criteria pass, and run a quick automated check that every area still loads.`,
        },
        { kind: 'code', file: 'scripts/autoload/events.gd', code: EVENTS },
        { kind: 'code', file: 'test/integration/test_areas_load.gd', code: AREAS_TEST, note: md`\`add_child_autofree\` adds the area under the test and frees it afterwards; \`await wait_frames(10)\` lets it run ten frames, so errors in \`_ready()\` and the first physics frames show up as failures. Add every new area to the list.` },
        {
          kind: 'steps',
          title: 'Close a milestone',
          steps: [
            md`Run the unit and integration tests (GUT panel or the command line from p02-3). All pass.`,
            md`Export a release build with \`tools/build.sh\` and play it from the title screen through everything finished so far, with a gamepad.`,
            md`Check each acceptance criterion in that build, out loud or on paper. A criterion that "almost" passes does not pass.`,
            md`Merge the milestone branch into \`main\`, tag it (\`git tag m3-enemies\`) and push the tag.`,
            md`Record the actual weeks next to the estimate in \`docs/milestones.md\`, update the running ratio, and apply the next cut from \`docs/slice.md\` if the forecast passes your deadline.`,
          ],
          result: md`A tagged, playable build per milestone, and a forecast that gets more accurate each time.`,
          troubleshoot: [
            { problem: md`A criterion passes in the test scene but not in the full game.`, fix: md`That is an integration bug, and finding it is the point of the routine. The milestone is not done until it passes in the build.` },
            { problem: md`You keep adding "one more thing" before closing.`, fix: md`If it is not in the acceptance criteria, it goes in the backlog for a later milestone. Close on the criteria.` },
          ],
        },
        {
          kind: 'check',
          q: md`M9 (field and dungeon content) is two weeks late. You work alone. What happens to the slice's finish?`,
          options: [
            md`It moves two weeks later, because alone every week of work adds to the total`,
            md`Nothing, because M9 has slack`,
            md`It moves four weeks later`,
            md`Nothing, if M10 is started first`,
          ],
          answer: 0,
          explain: md`Slack only helps when other work can proceed in parallel. Alone, two extra weeks anywhere are two extra weeks at the end, unless you cut something. That is what the cut list is for.`,
        },
        {
          kind: 'text',
          md: md`### Forecasting from evidence

Your estimates will be wrong in a consistent direction. After each milestone, divide total actual weeks by total estimated weeks so far. That **ratio** is your personal correction factor; multiply the remaining estimates by it. Three milestones in, the forecast is based on your real speed instead of hope. When it passes the deadline, apply cuts in the order you decided in p04-1, rather than working longer hours until the slice is late anyway.`,
        },
        { kind: 'code', file: 'docs/milestones.md', lang: 'text', code: MILESTONES_DOC },
        {
          kind: 'build',
          ch: {
            id: 'p04-2-build',
            title: 'Integrate the first three milestones',
            goal: md`Build M1 (movement room), M2 (combat loop) and M3 (enemy roster) into the slice skeleton, closing each with the routine and tracking estimates.`,
            requirements: [
              md`M1: Kai walks, dashes and jumps between two heights in the field; the camera follows; doors transition.`,
              md`M2: Kai fights slimes in the field with a 3-hit string, hit flash, sound, knockback and hitstop; slimes die, Kai can die and respawn.`,
              md`M3: slime, ember slime, bat and skeleton appear in field encounters, each with a telegraph that can be dodged on reaction.`,
              md`Each milestone is merged and tagged (\`m1-…\`, \`m2-…\`, \`m3-…\`), with tests passing and a release build played through.`,
              md`\`docs/milestones.md\` holds estimates, actuals, the running ratio and the new forecast.`,
            ],
            hints: [
              md`Most of M1–M3 is code you already wrote in c02–c05, k01 and k02; the work is moving it from test scenes into the areas and connecting it through \`Events\`.`,
              md`When a milestone runs long, check whether you are building beyond its criteria before blaming the estimate.`,
            ],
            solution: [
              { file: 'scripts/autoload/events.gd', code: EVENTS },
              { file: 'test/integration/test_areas_load.gd', code: AREAS_TEST },
              { file: 'docs/milestones.md', code: MILESTONES_DOC, lang: 'text' },
            ],
            explain: md`The solution files are the scaffolding around the milestones: the signals that connect systems, the test that keeps \`main\` loadable, and the tracking table. The milestones themselves are your game code from the earlier modules, now living in the slice's scenes.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'p04-2-paper',
            title: 'Re-forecast',
            type: 'compute',
            difficulty: 2,
            minutes: 6,
            statement: md`After three milestones: M1 estimated 2 weeks, took 3; M2 estimated 3, took 4; M3 estimated 3, took 4. The remaining milestones are estimated at 27 weeks. What is the forecast for the remaining work, in weeks?`,
            hints: [md`Use the ratio of total actual to total estimated, not the average of the three ratios.`],
            solution: [md`Actual $3 + 4 + 4 = 11$, estimated $2 + 3 + 3 = 8$: ratio $11/8 = 1.375$.`, md`Forecast $27 \times 1.375 = 37.125$ weeks. If that passes the deadline, apply the first cuts now rather than at the end.`],
            answer: { kind: 'number', value: 37.125 },
          },
        },
        {
          kind: 'recall',
          prompt: md`What are the five steps of closing a milestone?`,
          answer: md`Run the tests; export a release build and play it through with a gamepad; check every acceptance criterion in that build; merge and tag; record actual vs estimate, update the ratio and forecast, and cut if needed.`,
        },
        {
          kind: 'explain',
          prompt: md`Why integrate each milestone into the full game instead of finishing systems separately and connecting them at the end?`,
          model: md`Systems that work alone often fail together, at their seams: the HUD listens for a signal combat never emits, the save system does not know about shards, a transition runs during hitstop. Integrating continuously finds these one at a time, while the code is fresh and the cause is the change you just made. Integrating at the end finds them all at once, tangled together, at the point where the schedule has the least room. It also means you always have a playable build to test and show.`,
        },
      ],
      cards: [
        { id: 'p04-2-c1', kind: 'concept', front: md`Critical path vs total: which sets a solo developer's finish date?`, back: md`The total of all estimates. The critical path sets the order (and the date only when work runs in parallel).` },
        { id: 'p04-2-c2', kind: 'cloze', text: md`finish(m) = weeks(m) + {{}} of finish(p) over m's prerequisites.`, answers: ['max|maximum'] },
        { id: 'p04-2-c3', kind: 'compute', front: md`Estimates 4 and 6 weeks took 5 and 9. Remaining estimate 20 weeks. Forecast?`, answer: { kind: 'number', value: 28 }, back: md`Ratio $14/10 = 1.4$; $20 \times 1.4 = 28$ weeks.` },
        { id: 'p04-2-c4', kind: 'concept', front: md`What is slack?`, back: md`How much later a milestone can finish without delaying the end: latest allowed finish minus earliest finish. Zero on the critical path.` },
        { id: 'p04-2-c5', kind: 'concept', front: md`Why keep \`main\` playable at every commit?`, back: md`So integration problems appear one at a time, there is always a build to test or show, and a broken change is easy to find and revert.` },
      ],
    },
    // =========================================================================== p04-3
    {
      id: 'p04-3',
      title: 'Bug bash, release candidate and the road to release',
      minutes: 40,
      objectives: [
        'Run a structured bug bash with a checklist that covers every system of the slice.',
        'Write reproducible bug reports and triage them by severity and frequency.',
        'Estimate how often a "rare" bug reaches players with $1 - (1-p)^n$, and decide when a build is a release candidate.',
        'Plan the road from the slice to a full release, with forecasts scaled by your measured ratio.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`The slice plays from start to finish. Now break it on purpose. Bugs in games hide in **combinations**, which a normal playthrough never tries:
- saving in the middle of a fight
- switching characters during a stagger
- opening the menu during a transition
- unplugging the controller in tactical mode
- dashing into the one corner of the one wall where the collision shapes leave a gap.

A **bug bash** is a time-boxed session where you (and anyone you can recruit) try those combinations systematically, on a release build, and write down everything that goes wrong.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Bug bash, release candidate, feature freeze',
          md: md`- A **bug bash** is a focused session of trying to break the game, guided by a checklist so every system is covered.
- A **release candidate** (RC) is a build you would ship if testing finds nothing blocking. Concretely: no open bugs of priority P1 or P2, all tests passing, played through on every target platform.
- A **feature freeze** comes before it: no new features, only fixes, because every new feature brings new bugs into the build you are trying to stabilise.`,
        },
        { kind: 'code', file: 'docs/bugbash.md', lang: 'text', code: BUGBASH },
        {
          kind: 'text',
          md: md`### Reports you can act on

A bug you cannot reproduce is a bug you cannot fix or confirm fixed. Every report needs:
- the **build**
- numbered **steps** from a known state (attach a save file)
- what you **expected** and what **actually** happened
- how **often** it happens (3 of 10 tries)
- **evidence**: a video timestamp, the log, a screenshot.

Godot writes a log file in \`user://logs/\` on desktop platforms, which testers can send. A small capture script that saves a screenshot and the game state on a key press makes evidence automatic.`,
        },
        { kind: 'code', file: 'docs/bugs/golem_stagger.txt', lang: 'text', code: BUG_REPORT },
        { kind: 'code', file: 'scripts/bug_capture.gd', code: BUG_CAPTURE, note: md`Add it to the main scene next to the debug overlay. \`ProjectSettings.globalize_path\` turns \`user://\` into the real folder path, so a tester knows where to find the files.` },
        {
          kind: 'viz',
          viz: { type: 'ship.triage' },
          task: md`Triage all ten reports from the slice's bug bash, then turn on **compare**. Where do you disagree with the model, and which of your P1/P2 bugs would you fix first?`,
          caption: md`Severity is how bad the bug is when it happens; frequency is how often a player meets it. The matrix combines them, so a rare crash and a constant cosmetic glitch can land in different places than either number alone suggests.`,
        },
        {
          kind: 'derive',
          title: 'How rare is "rare"?',
          goal: md`A bug happens with probability $p$ each time a player does something (saves, enters the boss room). Find the chance that a player meets it at least once in $n$ tries, and what "rare" means across many players.`,
          steps: [
            { md: md`Each try avoids the bug with probability $1 - p$. If tries are independent, all $n$ avoid it with probability $(1-p)^n$.` },
            {
              md: md`So the chance of meeting it at least once is $$P = 1 - (1-p)^n.$$`,
              choose: {
                prompt: md`A crash on saving happens 1 time in 100 saves. Each player saves about 10 times in the slice. What fraction of players crash at least once?`,
                options: [md`$1 - 0.99^{10} \approx 9.6\%$`, md`$0.01 \times 10 = 10\%$ exactly`, md`$1\%$`],
                answer: 0,
                explain: md`$0.99^{10} \approx 0.904$, so about 9.6% of players crash. Multiplying $p \times n$ is a good approximation only while the result is small, and it can exceed 1 for large $n$, which a probability cannot.`,
              },
            },
            { md: md`Across 1,000 demo players, that is about 96 crashes. A bug that showed up once in your testing is common in the wild, which is why a rare crash is at least P2 in the matrix.` },
          ],
          takeaway: md`"Rare in testing" multiplied by many players and many tries is "certain to be reported". Weigh frequency per player session, not per attempt.`,
        },
        {
          kind: 'numeric',
          q: md`A bug reproduces 3 times in 20 tries of a boss phase. A player sees that phase 4 times in a playthrough. What is the probability they meet the bug at least once? (Give a decimal.)`,
          answer: { kind: 'number', value: 1 - Math.pow(0.85, 4), tol: 0.002 },
          explain: md`$p = 3/20 = 0.15$. $1 - 0.85^4 = 1 - 0.522 = 0.478$: nearly half of players.`,
        },
        {
          kind: 'check',
          q: md`After the bug bash, the build has no P1 bugs, two P2 bugs and fifteen P3/P4 bugs. All tests pass. Is it a release candidate?`,
          options: [md`No: P2 bugs must be fixed first; P3 and P4 can wait`, md`Yes: no P1 bugs means it can ship`, md`No: every bug must be fixed first`, md`Yes, if the P2 bugs are listed in the known issues`],
          answer: 0,
          explain: md`P1 and P2 block an RC. Waiting for zero bugs means never shipping; P3 and P4 go to the backlog for a patch or the full game.`,
        },
        {
          kind: 'steps',
          title: 'Run the bug bash and cut the RC',
          steps: [
            md`Declare the feature freeze. Export a release build with \`tools/build.sh\` and upload it to the \`beta\` branch (p03-2), so testers install it the way players will.`,
            md`Split \`docs/bugbash.md\` among testers (or into 30-minute blocks for yourself). Record video. 90 minutes, then stop.`,
            md`Turn every finding into a report with the template above, in GitHub Issues or a sheet. Triage the same day with the severity × frequency matrix.`,
            md`Fix all P1 and P2 bugs. For each logic bug, add a unit test that fails before the fix and passes after, so it cannot return. Re-test each fix in a new build.`,
            md`When nothing P1 or P2 is open, tests pass and the build has been played through on Windows and a Deck, tag it: \`git tag v0.9.0-rc1\`.`,
          ],
          result: md`A tagged release candidate on the beta branch, a closed list of P1/P2 bugs each with its fix commit, and a backlog of P3/P4 items.`,
          troubleshoot: [
            { problem: md`A fix for one bug causes another.`, fix: md`That is why each fix is re-tested in a fresh build, and why logic fixes get a regression test. Re-run the checklist section around the fix.` },
            { problem: md`You cannot reproduce a reported bug.`, fix: md`Ask for the save file, the log and the bug capture, and try with their exact steps on their platform. If it still does not reproduce, keep the report open with a "needs info" label rather than closing it.` },
          ],
        },
        {
          kind: 'text',
          md: md`### After the slice

The slice changes what kind of project Shardbound is:
- Every system exists.
- Every content type has been made at least once.
- You know your real cost per room, enemy and ability, and your estimate ratio.

The road to a full release is mostly **content production**, which is predictable, plus the shipping work from p03: playtests on the slice, the store page and Coming Soon, a Next Fest demo built from the slice, more regions, the story, balance, localisation, a beta, and the launch.

Plan it as a second milestone graph, scale every estimate by your measured ratio, and keep a cut list for it too. After launch, the same discipline applies to patches: fix on a branch, upload to \`beta\`, test, then set live on default.`,
        },
        {
          kind: 'viz',
          viz: { type: 'ship.milestones', plan: 'roadmap' },
          task: md`Mark R1 done and look at what opens. Which milestones decide the launch date if a composer and an artist work alongside you, and which if you are alone?`,
          caption: md`The roadmap's estimates are before your ratio is applied. The Next Fest demo (R3) only needs the slice and the store page, so it can happen long before the content is finished.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'p04-3-build',
            title: 'Release candidate of the slice, and the roadmap',
            goal: md`Stabilise the slice into a release candidate through a bug bash, and write the plan from here to a full release.`,
            requirements: [
              md`Every section of \`docs/bugbash.md\` was run on a release build from the beta branch, with video.`,
              md`Every finding has a reproducible report (build, steps, expected, actual, frequency, evidence) and a priority from the matrix.`,
              md`No P1 or P2 bugs are open; each fixed logic bug has a regression test; the build is tagged \`v0.9.0-rc1\`.`,
              md`The RC plays start to finish on Windows and on a Steam Deck (or Linux), with a gamepad.`,
              md`\`docs/roadmap.md\` lists the post-slice milestones with dependencies, estimates scaled by your measured ratio, and a cut list.`,
            ],
            hints: [
              md`F8 from \`bug_capture.gd\` during the bash saves most of the evidence you need.`,
              md`For the roadmap, use the slice's milestone actuals to set costs per region; a region is a bigger version of the field and dungeon you already built.`,
            ],
            solution: [
              { file: 'scripts/bug_capture.gd', code: BUG_CAPTURE },
              { file: 'docs/bugbash.md', code: BUGBASH, lang: 'text' },
              { file: 'docs/roadmap.md', code: ROADMAP_DOC, lang: 'text' },
            ],
            explain: md`The checklist makes the bash systematic, the capture script makes reports reproducible, and the matrix makes the release decision a rule instead of a mood. The roadmap applies the slice's lessons: measured costs, a correction ratio, dependencies, and cuts decided in advance.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'p04-3-paper',
            title: 'Your road to release',
            type: 'design',
            difficulty: 3,
            minutes: 15,
            statement: md`Using the roadmap milestones (R1–R10), your measured ratio from the slice, and your weekly hours, write a dated plan to launch. Include where the Coming Soon page and the Next Fest demo fall, what you cut if you are 25% over at R5, and what you will not cut.`,
            solution: [
              md`Example with a ratio of 1.375 and 12 h/week: the roadmap's 52 estimated weeks become about 72 weeks of work. R1 and R2 come first, so the Coming Soon page is up around week 10 and collects wishlists for over a year. The demo (R3) targets the first Next Fest after week 14, using the slice.`,
              md`If 25% over at R5: shrink region 3 to a dungeon without a new tileset, move localisation (R8) to after launch, and reduce new enemy types by palette swaps.`,
              md`Not cut: the systems the pillars depend on (movement, readable hits, real time plus tactics, the party), the Deck checks, and the beta phase, because shipping a broken build costs more than shipping a shorter one.`,
            ],
            rubric: [md`Uses the measured ratio and real weekly hours`, md`Places the page and demo early, before content production ends`, md`Gives an ordered cut list tied to pillars`, md`Protects testing and platform checks`],
          },
        },
        {
          kind: 'recall',
          prompt: md`What must a bug report contain, and what makes a build a release candidate?`,
          answer: md`Build, steps from a known state (with a save), expected, actual, frequency, evidence (video, log, screenshot), and a severity. A release candidate has no open P1/P2 bugs, passes all tests, and has been played through on every target platform, after a feature freeze.`,
        },
        {
          kind: 'explain',
          prompt: md`Why should a bug that appeared once in 50 tries during testing still block a release candidate, if it is a crash?`,
          model: md`Testing samples a tiny number of tries; players provide thousands. With $p = 0.02$ per try and 10 tries per player, about $1 - 0.98^{10} \approx 18\%$ of players would crash at least once, and a crash during a save can destroy progress, the worst thing a game can do to a player. Severity matters as well as frequency: a rare crash costs more than a constant cosmetic glitch, which is why the matrix puts it at P2 or above.`,
        },
      ],
      cards: [
        { id: 'p04-3-c1', kind: 'compute', front: md`A bug with $p = 0.05$ per try; 10 tries per player. Chance a player meets it?`, answer: { kind: 'number', value: 1 - Math.pow(0.95, 10), tol: 0.002 }, back: md`$1 - 0.95^{10} \approx 0.401$.` },
        { id: 'p04-3-c2', kind: 'concept', front: md`What blocks a release candidate?`, back: md`Open P1 or P2 bugs, failing tests, or a target platform not played through.` },
        { id: 'p04-3-c3', kind: 'concept', front: md`What is a feature freeze for?`, back: md`Stopping new features so the build can stabilise: every new feature brings new bugs into the build you are trying to finish.` },
        { id: 'p04-3-c4', kind: 'concept', front: md`Five parts of a bug report?`, back: md`Build; steps from a known state; expected vs actual; frequency; evidence (video, log, save, screenshot).` },
        { id: 'p04-3-c5', kind: 'concept', front: md`What makes post-slice work predictable?`, back: md`Every system exists and every content type has been made once, so costs per item and your estimate ratio are measured.` },
      ],
    },
  ],
  problems: [
    {
      id: 'p04-p1',
      title: 'Solo total',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`The milestones M1–M6 of the slice are estimated at 2, 3, 3, 4, 3 and 3 weeks. Working alone at a measured ratio of 1.25, how many weeks will they take?`,
      solution: [md`Total $2+3+3+4+3+3 = 18$ weeks.`, md`$18 \times 1.25 = 22.5$ weeks.`],
      answer: { kind: 'number', value: 22.5 },
      areas: ['ship'],
    },
    {
      id: 'p04-p2',
      title: 'Critical path',
      type: 'compute',
      difficulty: 2,
      minutes: 6,
      statement: md`A has 2 weeks, no prerequisites. B (3 weeks) needs A. C (5 weeks) needs A. D (2 weeks) needs B and C. E (4 weeks) needs B. F (1 week) needs D and E. What is the critical path length in weeks?`,
      solution: [md`Finish times: A 2, B 5, C 7, D $2 + \max(5, 7) = 9$, E $4 + 5 = 9$, F $1 + \max(9, 9) = 10$.`, md`Critical path: 10 weeks (A–C–D–F and A–B–E–F tie). The total is 17 weeks.`],
      answer: { kind: 'number', value: 10 },
      areas: ['ship'],
    },
    {
      id: 'p04-p3',
      title: 'Slack',
      type: 'compute',
      difficulty: 2,
      minutes: 4,
      statement: md`In the graph of the previous problem, change E to 2 weeks. How much slack does E have?`,
      solution: [md`E finishes at $5 + 2 = 7$. F needs D (9) and E (7), so E can finish as late as 9.`, md`Slack $9 - 7 = 2$ weeks.`],
      answer: { kind: 'number', value: 2 },
      areas: ['ship'],
    },
    {
      id: 'p04-p4',
      title: 'Forecast from four milestones',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`Four milestones were estimated at 2, 3, 4 and 3 weeks and took 2, 5, 5 and 4. Remaining estimates total 22 weeks. What is the forecast for the remaining work?`,
      solution: [md`Ratio $(2+5+5+4)/(2+3+4+3) = 16/12 = 1.333$.`, md`$22 \times 4/3 \approx 29.33$ weeks.`],
      answer: { kind: 'number', value: (22 * 16) / 12, tol: 0.002 },
      areas: ['ship'],
    },
    {
      id: 'p04-p5',
      title: 'Demo players and a rare crash',
      type: 'compute',
      difficulty: 2,
      minutes: 5,
      statement: md`A crash happens on 1 in 200 room transitions. A demo player goes through about 25 transitions. Out of 2,000 demo players, about how many crash at least once?`,
      solution: [md`Per player: $1 - (1 - 0.005)^{25} = 1 - 0.995^{25} \approx 1 - 0.8822 = 0.1178$.`, md`$2000 \times 0.1178 \approx 236$ players.`],
      answer: { kind: 'number', value: 2000 * (1 - Math.pow(0.995, 25)), tol: 0.01 },
      areas: ['ship', 'math'],
    },
    {
      id: 'p04-p6',
      title: 'Criteria for the party milestone',
      type: 'design',
      difficulty: 2,
      minutes: 8,
      statement: md`Write acceptance criteria for M5, "Party of three", that can be checked by playing the build.`,
      solution: [
        md`Kai, Lyra and Bram are on the field together after Bram joins; switching the controlled character is instant (same frame) and the camera follows the new leader within 0.3 s.`,
        md`Uncontrolled allies follow, attack nearby enemies and dodge telegraphed attacks at least sometimes; they never use ATB abilities unless commanded from tactical mode.`,
        md`Commanding an ally from tactical mode spends that ally's ATB and plays its ability on the chosen target.`,
        md`If the leader is KO'd, control moves to a living member; if all three are KO'd, the game-over flow starts. No frame over 16.7 ms with three characters and six enemies.`,
      ],
      rubric: [md`Each criterion is observable in the build`, md`Covers switching, ally AI limits, commands, KO handling`, md`Includes a performance check`],
      areas: ['ship', 'combat'],
    },
    {
      id: 'p04-p7',
      title: 'Integrate early',
      type: 'concept',
      difficulty: 1,
      minutes: 4,
      statement: md`Explain why the slice keeps \`main\` playable from the title screen at every commit, and what practice makes that possible.`,
      solution: [md`Integration problems appear at the seams between systems; finding them one at a time, right after the change that caused them, is far cheaper than finding them all at the end. A playable \`main\` is also always available for playtests and recording.`, md`Practices: milestone work on branches merged only when criteria pass; an automated test that loads every area; tags per milestone so a known-good build can always be rebuilt.`],
      rubric: [md`Explains seam bugs and cost of late integration`, md`Names branches, tests and tags`],
      areas: ['ship'],
    },
    {
      id: 'p04-p8',
      title: 'Fix the report',
      type: 'debug',
      difficulty: 1,
      minutes: 5,
      statement: md`A tester writes: "Combat is broken sometimes, the golem gets stuck, please fix." Rewrite it as a report you could act on, saying what information you would ask for.`,
      solution: [
        md`Ask for the build, the save closest to the golem, and the video or bug capture. Then write: title "Golem stays staggered forever after a stagger during its slam wind-up"; steps from the archive entrance save; expected recovery after 4 s; actual permanent stagger; frequency 3 of 10; severity S2 (blocks the end of the slice).`,
        md`The original has no steps, no build, no expected behaviour and no frequency, so it cannot be reproduced or confirmed fixed.`,
      ],
      rubric: [md`Asks for build, save and evidence`, md`Produces steps, expected, actual, frequency, severity`],
      areas: ['ship'],
    },
  ],
};
