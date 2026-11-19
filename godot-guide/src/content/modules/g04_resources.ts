import { md, gd, type Module } from '../types';

const ELEMENT = gd`
class_name Element
extends RefCounted
## Elements shared by abilities, hits, weaknesses and resistances.
## Use the enum as a type: var element: Element.Type

enum Type { NONE, FIRE, ICE, LIGHTNING, EARTH }
`;

const ENEMY_DATA = gd`
class_name EnemyData
extends Resource
## Everything that is the same for every enemy of one kind.
## One .tres per kind, in resources/enemies/. Run-time state (current HP,
## position, target) lives on the enemy node, never here.

@export var display_name := ""
@export_group("Stats")
@export_range(1, 9999) var max_hp := 10
@export_range(0, 999) var attack := 5
@export_range(0, 999) var defense := 0
## Walking speed in pixels per second.
@export_range(0.0, 300.0, 5.0) var speed := 40.0
@export var weakness: Element.Type = Element.Type.NONE
## Stagger gauge size; module k04 fills it.
@export var stagger_max := 100
@export_group("Rewards")
@export var xp_reward := 0
@export var gold_reward := 0
@export var drop_item: ItemData
@export_range(0.0, 1.0, 0.05) var drop_chance := 0.0
@export_group("Look")
@export var sprite_frames: SpriteFrames
`;

const ITEM_DATA = gd`
class_name ItemData
extends Resource
## Anything that can sit in the inventory. Module r03 adds use effects.

## Stable id used by saves and the inventory, e.g. &"potion".
@export var id: StringName
@export var display_name := ""
@export_multiline var description := ""
@export var icon: Texture2D
## Shop price in gold; shops buy back at half.
@export var price := 0
@export_range(1, 99) var max_stack := 99
`;

const BESTIARY = gd`
extends Node
## Prints the enemy table to check the data. Edit a .tres in the Inspector,
## run again, and the numbers change without touching any code.

const SLIME: EnemyData = preload("res://resources/enemies/slime.tres")

## The basic attack of the party member we compare against.
@export var kai_attack := 12
@export var enemies: Array[EnemyData] = []


func _ready() -> void:
    # load() at run time returns the same cached object as preload():
    print(SLIME == load("res://resources/enemies/slime.tres"))  # true
    for data in enemies:
        var damage := maxi(1, kai_attack - data.defense)
        var hits := ceili(float(data.max_hp) / damage)
        print("%-10s HP %4d  DEF %2d  hits to defeat: %d" % [data.display_name, data.max_hp, data.defense, hits])
`;

const ENEMY_STATS_BUGGY = gd`
class_name EnemyStats
extends Resource
## The buggy design: mutable state inside a shared resource.

@export var max_hp := 30
@export var hp := 30
`;

const SLIME_SPLIT = gd`
class_name Slime
extends CharacterBody2D
## Definition in the resource, state on the node.

@export var data: EnemyData

var hp := 0

@onready var hp_label: Label = $HpLabel


func _ready() -> void:
    assert(data != null, "%s needs an EnemyData resource" % name)
    hp = data.max_hp
    _refresh()


func take_damage(amount: int) -> void:
    hp = maxi(hp - amount, 0)
    _refresh()
    if hp == 0:
        queue_free()


func _refresh() -> void:
    hp_label.text = str(hp)
`;

const DAMAGE_DEBUG = gd`
extends Node2D
## Test room helper: attack damages the first enemy in the group.


func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("attack"):
        var target := get_tree().get_first_node_in_group("enemies")
        if target and target.has_method("take_damage"):
            target.take_damage(8)
`;

const CHARACTER_STATS = gd`
class_name CharacterStats
extends Resource
## Base stats and growth for one party member. Module m05 and r02 replace
## the linear growth with designed curves; the fields stay.

@export var display_name := ""
@export var portrait: Texture2D
@export_group("Base (level 1)")
@export var max_hp := 100
@export var max_mp := 20
@export var attack := 10
@export var defense := 8
@export var magic := 8
@export var spirit := 8
@export var speed := 10
@export_group("Growth per level")
@export var hp_growth := 12
@export var mp_growth := 3
@export var attack_growth := 2
@export var defense_growth := 2
@export var magic_growth := 2
@export var spirit_growth := 2


## A stat at a level, for linear growth: base + growth * (level - 1).
static func at_level(base: int, growth: int, level: int) -> int:
    return base + growth * (level - 1)


func max_hp_at(level: int) -> int:
    return at_level(max_hp, hp_growth, level)
`;

const ABILITY_DATA = gd`
class_name AbilityData
extends Resource
## One ability or spell: what it costs and what it does. Module r02 fills in
## effects; k04 spends the ATB.

enum Target { SELF, ONE_ENEMY, ALL_ENEMIES, ONE_ALLY, ALL_ALLIES }

@export var display_name := ""
@export_multiline var description := ""
## ATB segments spent (each character has 2).
@export_range(0, 2) var atb_cost := 1
@export var mp_cost := 0
@export var power := 10
@export var element: Element.Type = Element.Type.NONE
@export var target: Target = Target.ONE_ENEMY
## Animation the user plays, e.g. &"cast" or &"attack_side".
@export var animation: StringName = &"cast"
`;

const EQUIPMENT_DATA = gd`
class_name EquipmentData
extends ItemData
## A weapon, armour or accessory. It is an item, so the inventory can hold it.

enum Slot { WEAPON, ARMOR, ACCESSORY }

@export var slot: Slot = Slot.WEAPON
@export_group("Stat bonuses")
@export var attack_bonus := 0
@export var defense_bonus := 0
@export var magic_bonus := 0
@export var spirit_bonus := 0
@export var speed_bonus := 0
@export var max_hp_bonus := 0
@export_group("Shards")
## How many shards can be socketed into this piece.
@export_range(0, 4) var shard_sockets := 1
## Abilities this weapon teaches through use (module r02).
@export var teaches: Array[AbilityData] = []
`;

const SHARD_DATA = gd`
class_name ShardData
extends Resource
## A socketable gem. It grants an ability or spell, or a passive effect,
## and grows stronger with AP (module r01, r02).

enum Kind { ABILITY, SPELL, PASSIVE, SUPPORT }

@export var display_name := ""
@export_multiline var description := ""
@export var kind: Kind = Kind.SPELL
@export var color := Color(0.9, 0.3, 0.3)
## The ability or spell granted, for ABILITY and SPELL shards.
@export var granted_ability: AbilityData
## For PASSIVE shards: which stat and by how much per shard level.
@export var passive_stat: StringName
@export var passive_amount := 0
## AP needed to reach level 2, 3, ...; the shard's max level is size() + 1.
@export var ap_to_level: Array[int] = [200, 600, 1400]


func max_level() -> int:
    return ap_to_level.size() + 1
`;

const HIT_DATA = gd`
class_name HitData
extends RefCounted
## One hit, created when an attack connects and dropped right after.
## RefCounted: freed automatically, never saved, never edited in the Inspector.

var amount := 0
var element: Element.Type = Element.Type.NONE
## Push applied to the target, in pixels per second.
var knockback := Vector2.ZERO
## How much this hit fills the target's stagger gauge (module k04).
var stagger := 0.0
## Who dealt it, for aggro, reflect and kill credit. May be freed later.
var source: Node


func _init(p_amount: int = 0, p_element: Element.Type = Element.Type.NONE, p_source: Node = null) -> void:
    amount = p_amount
    element = p_element
    source = p_source
`;

const EVENTS_V2 = gd`
extends Node
## Global signal bus (autoload "Events"). Signals here are for things
## several unrelated scenes care about. No class_name on purpose.

@warning_ignore("unused_signal")
signal coin_collected(value: int)
@warning_ignore("unused_signal")
signal gold_changed(total: int)
@warning_ignore("unused_signal")
signal inventory_changed
@warning_ignore("unused_signal")
signal enemy_defeated(data: EnemyData, at: Vector2)
@warning_ignore("unused_signal")
signal party_changed
`;

const GAME_STATE = gd`
extends Node
## Global game state (autoload "GameState"): the party, the inventory,
## gold and story flags. Module r06 saves and loads exactly this.

const PARTY_STATS := [
    preload("res://resources/characters/kai_stats.tres"),
    preload("res://resources/characters/lyra_stats.tres"),
    preload("res://resources/characters/bram_stats.tres"),
]

var party: Array[CharacterStats] = []
## item id -> count
var inventory: Dictionary = {}
var gold := 0
## Story flags, e.g. &"met_lyra": true
var flags: Dictionary = {}
## Index of the save slot in use, -1 before the first save.
var save_slot := -1


func _ready() -> void:
    party.assign(PARTY_STATS)
    Events.coin_collected.connect(add_gold)


func add_gold(amount: int) -> void:
    gold = maxi(gold + amount, 0)
    Events.gold_changed.emit(gold)


func add_item(item: ItemData, count: int = 1) -> void:
    inventory[item.id] = int(inventory.get(item.id, 0)) + count
    Events.inventory_changed.emit()


func has_flag(flag: StringName) -> bool:
    return flags.get(flag, false)


func set_flag(flag: StringName, value: bool = true) -> void:
    flags[flag] = value
`;

const COIN_LABEL_V2 = gd`
extends Label
## Shows the party's gold. GameState owns the number; this only displays it.


func _ready() -> void:
    Events.gold_changed.connect(_on_gold_changed)
    _on_gold_changed(GameState.gold)


func _on_gold_changed(total: int) -> void:
    text = "Gold: %d" % total
`;

export const MODULE: Module = {
  id: 'g04',
  part: 'godot',
  order: 4,
  title: 'Resources and data-driven design',
  summary: 'Custom Resource classes edited in the Inspector and saved as .tres, loading and caching, the shared-resource bug and its fixes, the course\'s data classes in skeleton form, HitData as a RefCounted, and the Events and GameState autoloads.',
  relevance: md`Shardbound's content is data: three party members, a dozen enemies, thirty abilities, a hundred items and the shards are all \`.tres\` files filled in the Inspector, read by a handful of scripts. Adding the skeleton's stronger cousin means duplicating a file and changing four numbers, not writing code, and balancing a fight means editing values while it runs. This module defines those data classes, the rule that keeps shared data from turning into shared bugs, and the \`GameState\` autoload the save system (r06) writes to disk.`,
  prereqs: ['g02', 'g03'],
  areas: ['godot', 'systems'],
  lessons: [
    {
      id: 'g04-1',
      title: 'Resources: data you edit in the Inspector',
      minutes: 40,
      objectives: [
        'Write a `Resource` subclass with `class_name` and `@export` fields.',
        'Create, edit and save `.tres` files in the Inspector, and read their text.',
        'Load resources with `preload`, `load` and exported properties, and explain the resource cache.',
        'Compute hits to defeat an enemy from its data: $\\lceil \\text{hp} / \\max(1, a - d) \\rceil$.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A slime, a bat and a skeleton behave differently, but most of what separates them is numbers: HP, attack, defence, speed, weakness, rewards. If those numbers live in three scripts, tuning a fight means editing code, and the bat with 18 HP and the bat with 22 HP become two classes. If they live in data files, there is one enemy script and as many enemies as you have files, the Inspector edits them, and git shows exactly which number changed.

Godot's tool for this is the **Resource**: a data object it knows how to save, load, share and show in the Inspector. Textures, sounds and the \`SpriteFrames\` from module g03 are resources already. This lesson makes your own.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Resource',
          md: md`\`Resource\` is a base class for data. A script that \`extends Resource\` and has \`class_name EnemyData\` defines a new resource type; its \`@export\` variables become fields that are shown in the Inspector and written to the file. A resource saved on its own is a \`.tres\` file (text) or \`.res\` (binary); one embedded inside a scene is a *sub-resource*. Resources are reference-counted: they are freed when nothing refers to them, and two variables can refer to the same one.`,
        },
        { kind: 'code', file: 'scripts/resources/element.gd', code: ELEMENT, note: md`A home for the \`Element\` enum, so every class refers to the same \`Element.Type\`. Extending \`RefCounted\` and never instancing it is a common way to hold shared enums and constants.` },
        { kind: 'code', file: 'scripts/resources/item_data.gd', code: ITEM_DATA, note: md`\`EnemyData\` refers to \`ItemData\` for its drop, so create this file first. Lesson 3 adds the other data classes.` },
        { kind: 'code', file: 'scripts/resources/enemy_data.gd', code: ENEMY_DATA, note: md`Every field has a default that is a valid but bland enemy. Groups organise the Inspector; \`sprite_frames\` lets one enemy scene show any enemy's animations.` },
        {
          kind: 'steps',
          title: 'Create the enemy data files',
          steps: [
            md`Save the three scripts above in \`scripts/resources/\`.`,
            md`In FileSystem, right-click \`resources/\` → **Create New → Folder** \`enemies\`. Right-click \`enemies\` → **Create New → Resource…**, type \`EnemyData\` in the search box, select it and click **Create**. Name the file \`slime.tres\`.`,
            md`The Inspector shows the empty resource. Fill in: Display Name \`Slime\`, Max Hp 30, Attack 6, Defense 0, Speed 30, Weakness \`FIRE\`, Stagger Max 60, Xp Reward 4, Gold Reward 3, Drop Chance 0.25. Save with Ctrl+S.`,
            md`Make \`bat.tres\` (18 HP, attack 5, speed 70, weakness \`LIGHTNING\`) and \`skeleton.tres\` (60 HP, attack 12, defense 4, weakness \`EARTH\`) the same way, or duplicate \`slime.tres\` (right-click → **Duplicate…**) and change the fields.`,
            md`Open \`slime.tres\` in a text editor and compare it with the figure below.`,
          ],
          result: md`Three \`.tres\` files in \`resources/enemies/\`. Double-clicking one opens it in the Inspector. The text files list only the fields you changed.`,
          troubleshoot: [
            { problem: md`\`EnemyData\` is not in the *Create New Resource* list.`, fix: md`The script has an error or was not saved, or it lacks \`class_name EnemyData\`. Fix the script (the Script editor shows errors at the bottom), save, and try again.` },
            { problem: md`*Weakness* shows a number instead of a drop-down.`, fix: md`The variable is declared as \`int\`. Declare it as \`Element.Type\` so the Inspector knows the names.` },
          ],
        },
        {
          kind: 'viz',
          viz: { type: 'godot.tresedit', schema: 'enemy' },
          task: md`Set the slime's *Weakness* back to \`NONE\` with ↺ and watch the line disappear from the file. Raise the skeleton's *Defense* until Kai needs more than 15 hits. Then give the bat a drop and check the "drop in 5 kills" number against the formal answer below.`,
          caption: md`Godot writes only fields whose value differs from the script's default, so the file shrinks when values return to defaults, and changing a default in the script changes every file that did not override it. Enums are stored as integers (\`weakness = 1\` is \`FIRE\`), and other resources become \`ExtResource\` references by path. The \`uid\` strings are unique per file and will differ in your project.`,
        },
        {
          kind: 'check',
          q: md`You change the default of \`speed\` in \`enemy_data.gd\` from 40.0 to 50.0. The slime's file sets \`speed = 30.0\`; the bat's file has no \`speed\` line. What are their speeds now?`,
          options: [md`Slime 30, bat 50`, md`Slime 30, bat 40`, md`Both 50`, md`Slime 50, bat 50, because scripts override files`],
          answer: 0,
          explain: md`A missing line means "use the default", and the default now comes from the new script. Explicit values in the file win. This is useful (change all un-tuned enemies at once) and occasionally surprising, so change defaults deliberately.`,
        },
        {
          kind: 'text',
          md: md`### Getting data into code

- **Exported property** (most common): \`@export var data: EnemyData\` on the enemy scene, with the \`.tres\` dragged onto it in the Inspector. No paths in code; each instance in a room can use a different file.
- \`preload("res://…")\`: loads when the script itself loads, so the path must be a constant. Missing files are errors before the game runs.
- \`load("res://…")\`: loads at run time from any string. Returns \`null\` (and prints an error) if the file is missing.
- \`ResourceLoader.load_threaded_request(path)\`: starts loading in the background, for large scenes during a fade (module r06).

All of them go through Godot's **resource cache**: loading the same path again returns the *same object*, not a copy. That is fast and saves memory, and it is the cause of the bug in the next lesson.`,
        },
        { kind: 'code', file: 'scripts/debug/bestiary.gd', code: BESTIARY, note: md`\`Array[EnemyData]\` exports as a list in the Inspector: drag the three \`.tres\` files into it. \`%-10s\` pads the name to 10 characters so the columns line up.` },
        {
          kind: 'derive',
          title: 'Hits to defeat',
          goal: md`With a placeholder damage rule "attack minus defence, at least 1", find how many hits defeat an enemy with $h$ HP and defence $d$ when the attacker has attack $a$.`,
          steps: [
            { md: md`Damage per hit: $D = \max(1,\ a - d)$. The floor of 1 keeps weak attacks from doing nothing, which feels broken to players.` },
            {
              md: md`After $n$ hits the enemy has taken $nD$. It is defeated when $nD \ge h$, so the smallest $n$ is $$n = \left\lceil \frac{h}{D} \right\rceil.$$`,
              choose: {
                prompt: md`Why the ceiling and not the floor?`,
                options: [md`A partial hit's worth of HP still needs one more whole hit`, md`The floor would always be one too many`, md`Integer division in GDScript rounds up`],
                answer: 0,
                explain: md`For $h = 30$, $D = 8$: $30/8 = 3.75$. Three hits leave 6 HP; the fourth finishes it. The floor would say 3. GDScript's integer division truncates, so the code uses \`ceili(float(h) / D)\`.`,
              },
            },
            { md: md`For the skeleton ($h = 60$, $d = 4$) and Kai ($a = 12$): $D = 8$ and $n = \lceil 7.5 \rceil = 8$ hits.` },
          ],
          takeaway: md`Hits-to-defeat is the number players feel. Module r01 replaces this rule with the real damage pipeline, and module m05 designs the curves; the habit of turning data into "how many hits, how many seconds" stays.`,
        },
        {
          kind: 'numeric',
          q: md`The slime drops a potion with probability 0.25 per defeat, independently. What is the probability of getting at least one potion from 4 slimes?`,
          answer: { kind: 'number', value: 1 - 0.75 ** 4 },
          explain: md`The chance of no potion from one slime is 0.75, from four it is $0.75^4 \approx 0.316$. At least one: $1 - 0.316 \approx 0.684$.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'g04-1-build',
            title: 'A bestiary from data',
            goal: md`Create the three enemy data files and a debug script that prints a table computed from them, then tune an enemy without touching code.`,
            requirements: [
              md`Running the bestiary scene prints \`true\` and one line per enemy with HP, defence and hits to defeat (slime 3, bat 2, skeleton 8 with the values above).`,
              md`Changing the skeleton's *Defense* to 8 in the Inspector and running again prints 15 hits, with no script edited.`,
              md`Each \`.tres\` opened in a text editor contains only the fields that differ from the defaults.`,
              md`A fourth enemy (any name) added by duplicating a file and dragging it into the *Enemies* list shows up in the table.`,
            ],
            hints: [
              md`Integer division: \`data.max_hp / damage\` truncates; convert to float before \`ceili\`.`,
              md`If the table is empty, the exported *Enemies* array in the Inspector has no entries.`,
            ],
            solution: [
              { file: 'scripts/resources/enemy_data.gd', code: ENEMY_DATA },
              { file: 'scripts/debug/bestiary.gd', code: BESTIARY },
            ],
            explain: md`The code knows nothing about slimes or skeletons; it loops over data. Adding content is now a data task, which is how the rest of the course adds enemies, abilities and items.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'g04-1-paper',
            title: 'Tuning a bat',
            type: 'compute',
            difficulty: 1,
            minutes: 4,
            statement: md`Designers want the bat to take exactly 3 of Kai's hits (attack 12) and have defence 2. What range of \`max_hp\` values gives exactly 3 hits? Enter the smallest and largest.`,
            solution: [md`$D = \max(1, 12 - 2) = 10$. Exactly 3 hits means $\lceil h/10 \rceil = 3$, so $20 < h \le 30$.`, md`The smallest integer is 21, the largest 30. Picking 21 makes the third hit barely needed; 30 makes it exact. Many designers pick a value just above a threshold so a small attack upgrade drops it to 2 hits, a reward the player can feel.`],
            answer: { kind: 'vector', value: [21, 30] },
          },
        },
        {
          kind: 'recall',
          prompt: md`Three ways to get a resource into a script, and what the resource cache does.`,
          answer: md`An exported property set in the Inspector; \`preload\` with a constant path (loaded with the script); \`load\` at run time. The cache returns the same object for the same path, so everything that loads a file shares one instance.`,
        },
      ],
      cards: [
        { id: 'g04-1-c1', kind: 'concept', front: md`What makes a script a new resource type usable in the Inspector?`, back: md`\`extends Resource\`, a \`class_name\`, and \`@export\` fields. Then *Create New → Resource…* lists it.` },
        { id: 'g04-1-c2', kind: 'concept', front: md`Which fields does Godot write to a \`.tres\`?`, back: md`Only those whose value differs from the script's default. Missing fields take the current default.` },
        { id: 'g04-1-c3', kind: 'cloze', text: md`\`{{}}\` loads a resource when the script loads and needs a constant path; \`load\` works at run time.`, answers: ['preload'] },
        { id: 'g04-1-c4', kind: 'compute', front: md`HP 45, attack 10, defence 3, damage $\max(1, a-d)$: hits to defeat?`, answer: { kind: 'number', value: 7 }, back: md`$D = 7$, $\lceil 45/7 \rceil = \lceil 6.43 \rceil = 7$.` },
        { id: 'g04-1-c5', kind: 'concept', front: md`Does \`load()\` of the same path twice return two objects?`, back: md`No: the resource cache returns the same instance.` },
      ],
    },
    {
      id: 'g04-2',
      title: 'Shared resources, duplicate() and Local to Scene',
      minutes: 35,
      objectives: [
        'Explain why two nodes that use the same `.tres` share one object at run time.',
        'Reproduce the shared-resource bug and fix it with `duplicate()` or Local to Scene.',
        'Separate definitions (in the resource) from run-time state (on the node).',
        'Say what `duplicate()` copies and what it still shares.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A classic first bug in Godot: you hit one slime and both slimes' HP bars drop. You defeat them, the spawner creates a fresh one, and it appears already dead. Nothing is wrong with the damage code. Both slimes point at the same object, because the cache handed both of them the same \`slime_stats.tres\`.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'References, not copies',
          md: md`A resource variable holds a reference. Every node whose \`stats\` property names \`slime_stats.tres\` gets the one cached instance, so writing \`stats.hp -= 8\` changes the HP every slime reads. Nothing is written to disk (unless you call \`ResourceSaver.save\`), so the file still says 30 and the bug disappears when you restart, which makes it confusing to track down.`,
        },
        { kind: 'code', file: 'scripts/resources/enemy_stats.gd', code: ENEMY_STATS_BUGGY, note: md`Do not keep this class: it exists to reproduce the bug. The fix at the end of the lesson removes it.` },
        {
          kind: 'viz',
          viz: { type: 'godot.sharedres', mode: 'shared' },
          task: md`With **shared**, hit Slime A twice and look at Slime B. Then spawn Slime C. Switch to **duplicate()** and **Local to Scene** and repeat. Finally pick **hp on the node** and note how many resource boxes there are compared with duplicate().`,
          caption: md`The red outline marks a resource referenced by more than one node. "On disk" never changes: everything here happens in memory.`,
        },
        {
          kind: 'check',
          q: md`In the shared setup, why does a newly spawned Slime C start with the HP the others were left with?`,
          options: [
            md`Its \`stats\` refers to the cached instance the other slimes already damaged; spawning does not reload the file`,
            md`The spawner copies HP from the last slime`,
            md`The \`.tres\` file on disk was overwritten`,
            md`\`_ready\` runs before the stats are loaded`,
          ],
          answer: 0,
          explain: md`\`preload\` and the Inspector reference both resolve to the cache, which holds the one modified instance. The file on disk still says 30.`,
        },
        {
          kind: 'text',
          md: md`### Three fixes

1. **\`duplicate()\` in \`_ready\`**: \`stats = stats.duplicate()\` replaces the shared reference with a private copy. Simple, explicit, and works however the resource was assigned.
2. **Local to Scene**: tick *Resource → Local to Scene* on the resource in the Inspector. Each time a scene that uses it is instanced, Godot gives that instance its own copy. It only applies to resources assigned inside a scene; one assigned from code is still shared.
3. **Split definition from state**: keep the resource read-only (\`EnemyData\`: \`max_hp\`, attack, rewards) and put the values that change during play on the node (\`var hp\`). Nothing is copied; every slime shares one immutable definition.

\`duplicate()\` is **shallow** by default: fields that hold other resources (the \`drop_item\`, the \`sprite_frames\`) still point at the same objects as the original. \`duplicate(true)\` also copies sub-resources. That is usually what you want for the drop item (shared is fine) and a trap if a sub-resource holds state too.`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: "The course's rule",
          md: md`A resource holds what is **the same for every instance** and does not change during play: stats tables, ability costs, item prices. A node holds what is **different for each instance** or changes: current HP, position, cooldowns, the current target. If you ever need to write to a field of a resource at run time, ask whether that field belongs on a node (or in \`GameState\`) instead. This rule is why Shardbound uses option 3, and why \`HealthComponent\` (module c05) owns \`current_hp\` while \`EnemyData\` owns \`max_hp\`.`,
        },
        {
          kind: 'numeric',
          q: md`Three slimes share one stats resource with \`hp = 30\`. Kai hits Slime A twice and Slime B once, 8 damage each. A Slime C is then spawned with the same resource. What HP does Slime C start with?`,
          answer: { kind: 'number', value: 6 },
          explain: md`All three hits change the same \`hp\`: $30 - 3 \times 8 = 6$. Slime C reads that instance.`,
        },
        {
          kind: 'check',
          q: md`\`EnemyData\` has \`drop_item: ItemData\`. A script calls \`var copy := data.duplicate()\` and then sets \`copy.drop_item.price = 0\`. What happens to \`data.drop_item.price\`?`,
          options: [md`It also becomes 0: the shallow copy shares the same \`ItemData\``, md`It is unchanged: duplicate copies everything`, md`An error: duplicated resources are read-only`, md`It becomes 0 only if the item is Local to Scene`],
          answer: 0,
          explain: md`\`duplicate()\` copies the \`EnemyData\` object's fields; a field that holds a resource copies the reference. Use \`duplicate(true)\` to copy sub-resources as well, or, better, do not change shared item data at run time.`,
        },
        {
          kind: 'steps',
          title: 'Reproduce the bug, then fix it',
          steps: [
            md`Save \`enemy_stats.gd\`. Create \`resources/enemies/slime_stats.tres\` from it (*Create New → Resource… → EnemyStats*).`,
            md`In \`slime.tscn\` add a \`Label\` child named \`HpLabel\` above the sprite. Temporarily give \`slime.gd\` an \`@export var stats: EnemyStats\`, a \`take_damage(amount)\` that does \`stats.hp -= amount\`, and a \`_process\` that sets \`$HpLabel.text = str(stats.hp)\`. Assign \`slime_stats.tres\` to *Stats* in the slime scene.`,
            md`In the test room put two slimes and attach the helper below to the root. Press **F6** and press attack: both labels drop by 8.`,
            md`Fix 1: add \`stats = stats.duplicate()\` at the start of the slime's \`_ready\`. Run: only the first slime changes. Remove it, tick *Local to Scene* on \`slime_stats.tres\` instead, and run again: same result.`,
            md`Fix 3, the one to keep: replace the slime script with the listing below, assign \`slime.tres\` (the \`EnemyData\` from lesson 1) to *Data*, and delete \`enemy_stats.gd\` and \`slime_stats.tres\`.`,
          ],
          result: md`With the final script, attacking lowers only the first slime's label, defeated slimes disappear, and new ones from the spawner start at 30.`,
          troubleshoot: [{ problem: md`After deleting \`enemy_stats.gd\`, the slime scene shows an error about a missing script on a resource.`, fix: md`The scene still references \`slime_stats.tres\`. Clear the old *Stats* property (or remove the variable from the script first), save the scene, then delete the files.` }],
        },
        { kind: 'code', file: 'scripts/debug/damage_first_enemy.gd', code: DAMAGE_DEBUG, note: md`\`get_first_node_in_group\` returns the first node of the group in tree order, or \`null\`. \`has_method\` lets the helper work with any enemy script.` },
        { kind: 'code', file: 'scripts/enemies/slime.gd', code: SLIME_SPLIT, note: md`This replaces the placeholder slime from g03. The movement comes back in module k02 when slimes get AI.` },
        {
          kind: 'build',
          ch: {
            id: 'g04-2-build',
            title: 'Independent slimes from shared data',
            goal: md`Make every slime read its definition from \`EnemyData\` and keep its own HP, so that any number of slimes share one file safely.`,
            requirements: [
              md`Damaging one slime never changes another's HP label.`,
              md`Slimes spawned after others were damaged start at full HP.`,
              md`Changing \`max_hp\` in \`slime.tres\` changes every slime the next time it is created.`,
              md`A slime with no data assigned stops the game with a clear assert message naming the node.`,
              md`No script writes to a field of an \`EnemyData\` at run time.`,
            ],
            hints: [md`Read \`data.max_hp\` once in \`_ready\` and keep \`hp\` on the node.`, md`To make a bat, instance the same enemy scene and assign \`bat.tres\`, once the enemy scene is generic (module k02).`],
            solution: [{ file: 'scripts/enemies/slime.gd', code: SLIME_SPLIT }],
            explain: md`The resource is a definition, never written; the node is the state. Sharing is then a benefit (one object in memory, one place to tune) rather than a bug.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'g04-2-paper',
            title: 'The poisoned party',
            type: 'debug',
            difficulty: 2,
            minutes: 6,
            statement: md`Each party member's scene exports \`stats: CharacterStats\`, and status effects are stored on it: \`stats.poisoned = true\`. Kai and a recruitable twin of Kai both use \`kai_stats.tres\`. Poisoning Kai poisons the twin, and the poison survives a scene change but not a restart. Explain all three symptoms and propose the fix that follows the course's rule.`,
            solution: [
              md`Both characters reference the one cached \`kai_stats.tres\`, so writing \`poisoned\` on it affects both. The cache keeps the instance alive while anything holds it (\`GameState.party\` does), so it survives scene changes; nothing writes the file, so a restart reloads a clean copy.`,
              md`Fix: status effects are run-time state. Keep them on the character node or on a per-character state object in \`GameState\` (which the save system writes explicitly), and keep \`CharacterStats\` read-only.`,
            ],
            rubric: [md`Shared cached instance`, md`Explains survival across scenes and loss on restart`, md`Moves state off the resource`],
          },
        },
        {
          kind: 'explain',
          prompt: md`Compare \`duplicate()\` in \`_ready\` with keeping HP on the node. When would you still choose \`duplicate()\`?`,
          model: md`Both stop instances from sharing changing data. Keeping HP on the node never copies anything and makes the resource a clear, read-only definition, so there is no way to modify shared data by accident. \`duplicate()\` copies the whole resource per instance and keeps state and definition mixed, which is easy to get wrong with sub-resources (shallow copies). It is still a good choice when the resource really is per-instance state that benefits from being a resource: for example a character's equipment loadout edited in the Inspector, saved with \`ResourceSaver\`, and changed during play.`,
        },
      ],
      cards: [
        { id: 'g04-2-c1', kind: 'concept', front: md`Why do two slimes with the same \`stats.tres\` lose HP together?`, back: md`The resource cache gives both the same instance; \`stats.hp -= 8\` changes the one object both read.` },
        { id: 'g04-2-c2', kind: 'cloze', text: md`\`stats = stats.{{}}()\` in \`_ready\` gives a node its own copy of a resource.`, answers: ['duplicate'] },
        { id: 'g04-2-c3', kind: 'concept', front: md`What does *Local to Scene* do?`, back: md`Each time a scene using the resource is instanced, that instance gets its own copy. It does not apply to resources assigned from code.` },
        { id: 'g04-2-c4', kind: 'concept', front: md`Does \`duplicate()\` copy a resource's sub-resources?`, back: md`No, it is shallow: fields holding resources still point at the originals. \`duplicate(true)\` copies sub-resources too.` },
        { id: 'g04-2-c5', kind: 'concept', front: md`State the course's rule for what goes in a resource.`, back: md`Resources hold definitions that are the same for every instance and do not change in play. Nodes (or GameState) hold run-time state such as current HP.` },
      ],
    },
    {
      id: 'g04-3',
      title: "The course's data classes and autoloads",
      minutes: 45,
      objectives: [
        'Create skeleton resource classes for characters, abilities, items, equipment, shards and enemies.',
        'Explain why `HitData` is a `RefCounted` and not a `Resource` or a `Dictionary`.',
        'Register the `Events` and `GameState` autoloads at the paths the course uses.',
        'Decide whether a piece of state belongs in a resource, a node or an autoload.',
        'Compute a stat at a level with linear growth: $s(L) = b + g\\,(L-1)$.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Later modules each fill in one system: stats and damage (r01), abilities and progression (r02), items and shops (r03), the battle system (k04), saves (r06). They all read the same data, so the classes are defined here, now, with the fields the rest of the course expects. Each is a skeleton: the fields exist, the behaviour comes later.

| class | file | holds | filled in by |
|---|---|---|---|
| \`CharacterStats\` | \`scripts/resources/character_stats.gd\` | base stats and growth per level | m05, r01, r02 |
| \`AbilityData\` | \`scripts/resources/ability_data.gd\` | name, ATB and MP cost, power, element, target, animation | r02, k04 |
| \`ItemData\` | \`scripts/resources/item_data.gd\` | id, name, icon, price, stack size | r03 |
| \`EquipmentData\` | \`scripts/resources/equipment_data.gd\` | slot, stat bonuses, shard sockets | r01 |
| \`ShardData\` | \`scripts/resources/shard_data.gd\` | granted ability or passive, AP to level | r01, r02 |
| \`EnemyData\` | \`scripts/resources/enemy_data.gd\` | stats, weakness, stagger, rewards, frames | k02, k04, r03 |
| \`HitData\` | \`scripts/resources/hit_data.gd\` | one hit: amount, element, knockback, stagger, source | k01, c05, r01 |`,
        },
        { kind: 'code', file: 'scripts/resources/character_stats.gd', code: CHARACTER_STATS, note: md`Linear growth is a placeholder that is easy to reason about; the derivation below uses it. \`static func\` can be called as \`CharacterStats.at_level(...)\` without an instance.` },
        {
          kind: 'derive',
          title: 'A stat at level L',
          goal: md`With base value $b$ at level 1 and growth $g$ per level, find the stat at level $L$, and the level at which it first reaches a target $T$.`,
          steps: [
            { md: md`Each level adds $g$. From level 1 to $L$ there are $L - 1$ level-ups, so $s(L) = b + g(L-1)$.` },
            {
              md: md`To reach $T$: $b + g(L-1) \ge T \iff L \ge 1 + \dfrac{T - b}{g}$, and $L$ is a whole number.`,
              choose: {
                prompt: md`Kai has base HP 120 and growth 14. At what level does he first have at least 400 HP?`,
                options: [md`21`, md`20`, md`29`],
                answer: 0,
                explain: md`$1 + (400 - 120)/14 = 1 + 20 = 21$. At level 21: $120 + 14 \times 20 = 400$ exactly. Level 20 gives 386.`,
              },
            },
            { md: md`Linear growth makes early levels feel big (12 HP on 100 is +12%) and late levels small (12 on 400 is +3%). Module m05 compares linear, polynomial and exponential curves for exactly this reason.` },
          ],
          takeaway: md`Keep growth as data on the resource; the formula lives in one static function, so changing the curve later touches one place.`,
        },
        {
          kind: 'numeric',
          q: md`Lyra has base MP 40 and MP growth 6. What is her maximum MP at level 12?`,
          answer: { kind: 'number', value: 106 },
          explain: md`$40 + 6 \times (12 - 1) = 40 + 66 = 106$.`,
        },
        { kind: 'code', file: 'scripts/resources/ability_data.gd', code: ABILITY_DATA, note: md`\`&"cast"\` is a \`StringName\` literal; animation names are \`StringName\`s in Godot.` },
        {
          kind: 'viz',
          viz: { type: 'godot.tresedit', schema: 'ability' },
          task: md`Compare *Fire* and *Triple Slash* on power per ATB segment. Make Triple Slash cost 1 ATB and see the number double, then consider what that would do to Kai's damage output. Change Cure's *Target* and read the integer stored for it.`,
        },
        { kind: 'code', file: 'scripts/resources/equipment_data.gd', code: EQUIPMENT_DATA },
        {
          kind: 'check',
          q: md`Why does \`EquipmentData\` extend \`ItemData\` instead of \`Resource\`?`,
          options: [
            md`Equipment is an item: it has an id, a name, an icon and a price, and the inventory can hold it as an \`ItemData\``,
            md`Godot requires every resource to extend another custom resource`,
            md`So it can be Local to Scene`,
            md`Inheritance makes it load faster`,
          ],
          answer: 0,
          explain: md`A small, stable "is a" relationship is where inheritance fits (compare problem g03-p7). Code that handles items (inventory, shops, loot) works with equipment unchanged, and \`item is EquipmentData\` tells them apart where needed.`,
        },
        { kind: 'code', file: 'scripts/resources/shard_data.gd', code: SHARD_DATA, note: md`\`granted_ability\` refers to an \`AbilityData\` \`.tres\`: a Fire shard points at \`fire.tres\`, so the spell's numbers live in one file however many shards grant it.` },
        { kind: 'code', file: 'scripts/resources/hit_data.gd', code: HIT_DATA },
        {
          kind: 'text',
          md: md`### Why \`HitData\` is a \`RefCounted\`

A hit is created when an attack connects, passed from the hitbox to the hurtbox to the health component, and forgotten a moment later; dozens per second in a busy fight. It is never saved, never edited in the Inspector, and never shared between two hits.

- A \`Resource\` would work, but brings what a hit does not need: a path, caching, saving, Inspector support.
- A \`Dictionary\` (\`{"amount": 12}\`) has no types: a typo in a key returns \`null\` at run time instead of an error in the editor, and the hurtbox cannot declare \`signal hurt(hit: HitData)\`.
- A \`Node\` must be added to the tree and freed by hand.

\`RefCounted\` is the lightest typed object: it frees itself when the last reference goes away. (\`Resource\` itself extends \`RefCounted\`; \`HitData\` simply stops one level lower.) \`source\` is a plain reference to the attacker, which can be freed before the hit is processed, so code that uses it checks \`is_instance_valid(hit.source)\`.`,
        },
        {
          kind: 'check',
          q: md`Which of these should be a \`Resource\` saved as \`.tres\`, and which a \`RefCounted\` created in code? (1) The Fire spell's costs and power. (2) The result of one Fire cast hitting one slime. (3) A shop's list of items and prices.`,
          options: [md`(1) Resource, (2) RefCounted, (3) Resource`, md`All Resources`, md`(1) RefCounted, (2) Resource, (3) RefCounted`, md`All RefCounted`],
          answer: 0,
          explain: md`Definitions authored in the editor and shared are resources. A short-lived value created at run time and passed along is a \`RefCounted\` (\`HitData\`).`,
        },
        {
          kind: 'steps',
          title: 'Register the autoloads',
          steps: [
            md`Replace \`scripts/autoload/events.gd\` with the extended version below. It is already registered as \`Events\` (module g03).`,
            md`Create the party data: \`resources/characters/kai_stats.tres\`, \`lyra_stats.tres\` and \`bram_stats.tres\` from \`CharacterStats\`. Suggested starts: Kai HP 120, attack 14, speed 14; Lyra HP 90, MP 40, magic 16; Bram HP 160, defense 14, speed 8.`,
            md`Create \`scripts/autoload/game_state.gd\` (below). In **Project → Project Settings → Globals → Autoload** add it with the node name \`GameState\`, **below** \`Events\`: autoloads are created in list order, and \`GameState._ready\` connects to \`Events\`. Use the arrows on the right to reorder if needed.`,
            md`Update the coin label to the version below, which shows \`GameState.gold\`. Run the test room and collect coins.`,
          ],
          result: md`The Autoload tab lists \`Events\` then \`GameState\`; the Remote tree shows \`/root/Events\` and \`/root/GameState\` before the room. The label reads \`Gold: 0\` and counts up as coins are collected, and the Remote inspector for \`GameState\` shows \`gold\` changing.`,
          troubleshoot: [
            { problem: md`Error on start: *Identifier "Events" not declared* inside \`game_state.gd\`, or the connection silently does nothing.`, fix: md`Check the Autoload order: \`Events\` must be above \`GameState\`. Both must have *Global Variable* ticked.` },
            { problem: md`\`preload\` fails: *Resource file not found*.`, fix: md`The three \`*_stats.tres\` files must exist at exactly the paths in \`PARTY_STATS\`. Create them before saving the script.` },
          ],
        },
        { kind: 'code', file: 'scripts/autoload/events.gd', code: EVENTS_V2 },
        { kind: 'code', file: 'scripts/autoload/game_state.gd', code: GAME_STATE, note: md`\`party.assign(PARTY_STATS)\` copies the elements of the untyped constant into the typed array, checking each one is a \`CharacterStats\`. \`GameState\` holds references to the read-only \`CharacterStats\`; per-character run-time state (current HP, equipment, shard AP) is added in modules r01 and r06 as separate data, following lesson 2's rule.` },
        { kind: 'code', file: 'scripts/ui/coin_label.gd', code: COIN_LABEL_V2 },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Autoloads are global state',
          md: md`Anything in an autoload can be read and changed from anywhere, which is convenient and makes bugs hard to trace. Keep the course's four autoloads small and specific: \`Events\` only declares signals; \`GameState\` holds what the save file contains and changes it through methods (\`add_gold\`, \`set_flag\`) that announce the change. A system that only one scene uses (the battle's turn order, a room's puzzle) belongs in that scene, not in an autoload.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'g04-3-build',
            title: 'The data layer',
            goal: md`Create every data class, a first file of each, and the two autoloads, so later modules can start from data.`,
            requirements: [
              md`All seven scripts parse, and *Create New → Resource…* lists the six resource classes.`,
              md`\`resources/\` contains at least: three character stats, \`fire.tres\` and \`cure.tres\` abilities, a \`potion.tres\` item, a \`bronze_sword.tres\` weapon that teaches an ability, and a \`fire_shard.tres\` that grants \`fire.tres\`.`,
              md`\`Events\` and \`GameState\` are autoloads in that order; at startup \`GameState.party\` has three entries.`,
              md`Collecting coins changes \`GameState.gold\` and the label shows it, through \`Events.gold_changed\`.`,
              md`Running \`print(HitData.new(12, Element.Type.FIRE).amount)\` anywhere prints 12.`,
            ],
            hints: [
              md`Create \`item_data.gd\` before \`equipment_data.gd\` and \`ability_data.gd\` before \`shard_data.gd\`: a class must exist before another script names it.`,
              md`\`potion.tres\` needs an \`id\` (\`potion\`); the inventory uses it as the key.`,
            ],
            solution: [
              { file: 'scripts/resources/hit_data.gd', code: HIT_DATA },
              { file: 'scripts/autoload/events.gd', code: EVENTS_V2 },
              { file: 'scripts/autoload/game_state.gd', code: GAME_STATE },
              { file: 'scripts/ui/coin_label.gd', code: COIN_LABEL_V2 },
            ],
            explain: md`The coin still knows only \`Events\`; \`GameState\` turns \`coin_collected\` into gold and announces \`gold_changed\`; the label only displays. Each piece can be replaced alone, which is what modules r03 (inventory), r05 (HUD) and r06 (saves) do.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'g04-3-paper',
            title: 'Where does it live?',
            type: 'design',
            difficulty: 2,
            minutes: 8,
            statement: md`For each, choose resource (\`.tres\`), node, autoload, or \`RefCounted\`, and justify: (a) Bram's current HP during a fight; (b) the skeleton's attack value; (c) whether the player has met Lyra; (d) one sword slash's damage and knockback; (e) the number of potions the party carries; (f) the list of enemies in the current room.`,
            solution: [
              md`(a) Node (Bram's health component): run-time state of one character in the scene. It is copied into \`GameState\` when saving or changing scenes.`,
              md`(b) Resource (\`skeleton.tres\`): a definition shared by every skeleton.`,
              md`(c) Autoload (\`GameState.flags\`): story state that outlives scenes and is saved.`,
              md`(d) \`RefCounted\` (\`HitData\`): short-lived, created per hit.`,
              md`(e) Autoload (\`GameState.inventory\`): persists across scenes and saves.`,
              md`(f) Node: the room's \`Enemies\` node or the \`enemies\` group. It only exists while the room does.`,
            ],
            rubric: [md`Definitions in resources, run-time state in nodes`, md`Persistent, saved state in GameState`, md`Per-hit data as RefCounted`],
          },
        },
        {
          kind: 'recall',
          prompt: md`Name the two autoloads created so far, their paths, and the one rule for each.`,
          answer: md`\`Events\` (\`scripts/autoload/events.gd\`): only declares signals, no state. \`GameState\` (\`scripts/autoload/game_state.gd\`): party, inventory, gold, flags; change it through methods that emit the matching \`Events\` signal. \`Events\` is listed first.`,
        },
      ],
      cards: [
        { id: 'g04-3-c1', kind: 'concept', front: md`Why is \`HitData\` a \`RefCounted\`?`, back: md`A hit is short-lived, created in code, never saved or edited. RefCounted is typed and frees itself; a Resource adds unneeded features, a Dictionary loses typing.` },
        { id: 'g04-3-c2', kind: 'compute', front: md`Base 100, growth 12 per level: stat at level 8?`, answer: { kind: 'number', value: 184 }, back: md`$100 + 12 \times 7 = 184$.` },
        { id: 'g04-3-c3', kind: 'cloze', text: md`Autoloads are created in list order, so \`{{}}\` must be above \`GameState\`.`, answers: ['Events'] },
        { id: 'g04-3-c4', kind: 'concept', front: md`Why does \`EquipmentData\` extend \`ItemData\`?`, back: md`Equipment is an item (id, name, icon, price), so inventory and shop code handle it unchanged.` },
        { id: 'g04-3-c5', kind: 'concept', front: md`What may \`Events\` contain, and what may \`GameState\` contain?`, back: md`Events: signal declarations only. GameState: the saved state (party, inventory, gold, flags), changed through methods that emit Events signals.` },
      ],
    },
  ],
  problems: [
    {
      id: 'g04-p1',
      title: 'Shared HP',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`Four bats share one stats resource with \`hp = 18\`, and their script does \`stats.hp -= amount\` with no clamp. Lyra's Thunder hits all four for 5 each, once. What HP does each bat show afterwards?`,
      solution: [md`Each of the four hits subtracts 5 from the same \`hp\`: $18 - 20 = -2$, or 0 if clamped.`, md`Every bat shows the same value, and the fourth hit was already "overkill". With HP on each node, each would show 13.`],
      answer: { kind: 'number', value: -2 },
      areas: ['godot', 'systems'],
    },
    {
      id: 'g04-p2',
      title: 'Drop over many kills',
      type: 'compute',
      difficulty: 2,
      minutes: 5,
      statement: md`A skeleton drops an ether with probability 0.1. How many skeletons must the player defeat for at least a 90% chance of at least one ether?`,
      solution: [md`$P(\text{at least one in } n) = 1 - 0.9^n \ge 0.9 \iff 0.9^n \le 0.1 \iff n \ge \ln 0.1 / \ln 0.9 \approx 21.85$.`, md`So 22 skeletons. A "10% drop" takes 22 kills to be 90% sure, which is why module r03 discusses guaranteed drops and pity counters.`],
      answer: { kind: 'number', value: 22 },
      areas: ['systems', 'math'],
    },
    {
      id: 'g04-p3',
      title: 'Defence thresholds',
      type: 'compute',
      difficulty: 2,
      minutes: 5,
      statement: md`An enemy has 48 HP. Kai's attack is 14 and damage is $\max(1, a - d)$. For defence 0, 6 and 13, how many hits does it take?`,
      solution: [md`$d = 0$: $D = 14$, $\lceil 48/14 \rceil = 4$. $d = 6$: $D = 8$, $48/8 = 6$ exactly, 6 hits.`, md`$d = 13$: $D = 1$, 48 hits. Subtractive defence becomes extreme near the attack value, one reason module r01 uses a different formula.`],
      answer: { kind: 'vector', value: [4, 6, 48] },
      areas: ['systems', 'math'],
    },
    {
      id: 'g04-p4',
      title: 'Born dead',
      type: 'debug',
      difficulty: 2,
      minutes: 6,
      statement: md`Spawned skeletons sometimes appear and immediately die. The skeleton script is:

\`\`\`gdscript
@export var data: EnemyData


func take_damage(amount: int) -> void:
	data.max_hp -= amount
	if data.max_hp <= 0:
		die()
\`\`\`

Explain the bug and fix it.`,
      solution: [md`The script writes to the shared \`EnemyData\`: every skeleton (and every future one) reads the cached instance, so damage accumulates across all of them and new skeletons spawn with \`max_hp\` at or below 0.`, md`Keep \`var hp := 0\` on the node, set \`hp = data.max_hp\` in \`_ready\`, subtract from \`hp\`, and never write to \`data\`.`],
      rubric: [md`Identifies writing to a shared resource`, md`Explains why new instances are affected`, md`Moves HP to the node`],
      areas: ['godot'],
    },
    {
      id: 'g04-p5',
      title: 'preload or load',
      type: 'concept',
      difficulty: 1,
      minutes: 4,
      statement: md`When would you use \`preload\`, \`load\`, and an exported resource property? Give one Shardbound example of each.`,
      solution: [md`\`preload\`: a constant dependency the script always needs, loaded with the script and checked early, e.g. the spawner's \`SLIME_SCENE\` or \`GameState\`'s party stats.`, md`\`load\`: a path known only at run time, e.g. the room to load from a save file's \`"res://scenes/rooms/cave_03.tscn"\`. Exported property: data chosen per instance in the editor, e.g. each enemy's \`EnemyData\`, which keeps paths out of code entirely.`],
      rubric: [md`preload for constant dependencies`, md`load for run-time paths`, md`exports for per-instance data`],
      areas: ['godot'],
    },
    {
      id: 'g04-p6',
      title: 'HitData on paper',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 8,
      statement: md`Write \`HitData\` as the course defines it, with an \`_init\` taking amount, element and source with defaults. Then write a \`Hurtbox\` method \`receive(hit: HitData) -> void\` that ignores hits whose source is this hurtbox's own owner, and otherwise emits \`hurt(hit)\`.`,
      solution: [
        md`\`HitData\`: \`class_name HitData\`, \`extends RefCounted\`, typed fields \`amount\`, \`element: Element.Type\`, \`knockback: Vector2\`, \`stagger: float\`, \`source: Node\`, and \`_init(p_amount := 0, p_element := Element.Type.NONE, p_source: Node = null)\` assigning them (as in lesson 3).`,
        md`\`\`\`gdscript
signal hurt(hit: HitData)


func receive(hit: HitData) -> void:
	if is_instance_valid(hit.source) and hit.source == owner:
		return
	hurt.emit(hit)
\`\`\``,
        md`\`owner\` is the root of the scene the hurtbox was saved in, here the character. The validity check handles an attacker freed before its hit arrived.`,
      ],
      rubric: [md`RefCounted with typed fields and defaulted _init`, md`Self-hit check with a validity guard`, md`Emits a typed signal`],
      areas: ['godot', 'combat'],
    },
    {
      id: 'g04-p7',
      title: 'Text or binary',
      type: 'concept',
      difficulty: 1,
      minutes: 4,
      statement: md`Why does the course save resources as \`.tres\` instead of \`.res\`? Is there a cost?`,
      solution: [md`\`.tres\` is text: git diffs show exactly which value changed, merges are possible, and you can read or search the files. Data files are the most edited files in the project.`, md`The cost is size and loading speed for large resources (meshes, big tile sets). Export settings can convert text resources to binary in the shipped game, so players get the faster format anyway.`],
      rubric: [md`Readable diffs and merges`, md`Mentions size or speed and conversion on export`],
      areas: ['godot', 'ship'],
    },
    {
      id: 'g04-p8',
      title: 'Level for a spell',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`Fire costs 6 MP. Lyra has base MP 40, growth 6 per level. At what level can she cast Fire 20 times from full MP?`,
      solution: [md`She needs $20 \times 6 = 120$ MP: $40 + 6(L - 1) \ge 120 \iff L - 1 \ge 13.33$.`, md`$L = 15$ (level 15 gives $40 + 84 = 124$ MP).`],
      answer: { kind: 'number', value: 15 },
      areas: ['systems'],
    },
    {
      id: 'g04-p9',
      title: 'A data-driven enemy roster',
      type: 'design',
      difficulty: 3,
      minutes: 12,
      statement: md`The dungeon needs a "fire slime" that is a slime with more HP, a fire weakness swapped for ice, a red tint and a different drop. Describe how you add it with the course's data classes and no new script, and what you would have to add to \`EnemyData\` if the fire slime also leaves burning ground behind it.`,
      solution: [
        md`Duplicate \`slime.tres\` as \`fire_slime.tres\`, change \`display_name\`, \`max_hp\`, \`weakness\` (\`ICE\`) and \`drop_item\`. For the tint, either point \`sprite_frames\` at recoloured frames or add a \`tint: Color\` field to \`EnemyData\` that the enemy script applies to \`modulate\` in \`_ready\` (one line, useful for every palette swap). Place the slime scene and assign the new file.`,
        md`Burning ground is behaviour, not a number. Add a data hook rather than a subclass: for example \`@export var trail_scene: PackedScene\` and \`trail_interval: float\`, which the generic enemy script spawns when set. Slimes without a trail leave it empty. If behaviours multiply, move them into component scenes (module c05) chosen in the data.`,
      ],
      rubric: [md`New .tres from a duplicate, no new script`, md`A reasonable approach to the tint`, md`Behaviour added as data (PackedScene or component) rather than a subclass`],
      areas: ['systems'],
    },
  ],
};
