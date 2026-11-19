import { md, gd, type Module } from '../types';

// ------------------------------------------------------------------------------------ listings

const GAME_STATE = gd`
extends Node
## Autoload "GameState": everything that must survive quitting the game, and nothing
## that can be rebuilt. Scenes read it in _ready and write it when something changes;
## SaveSystem turns it into a Dictionary and back.

const QUESTS := [
    preload("res://resources/quests/moonherbs.tres"),
    preload("res://resources/quests/silent_well.tres"),
]

var gold := 0
var inventory: Dictionary = {}  # item id -> count (r03)
var flags: Dictionary = {}      # story flags (r04)
var opened: Dictionary = {}     # persistent ids of opened chests, picked herbs... -> true
var party: Array = []           # one Dictionary per member: id, level, xp, hp, mp, gear, shards
var room := "village"
var player_position := Vector2(160, 96)
var playtime := 0.0             # seconds

var _quest_text: Dictionary = {}  # cache for quest_updated (r04); never saved


func _process(delta: float) -> void:
    # An autoload pauses with the tree, so time in the pause menu does not count.
    playtime += delta


func to_dict() -> Dictionary:
    return {
        "gold": gold,
        "inventory": inventory.duplicate(),
        "flags": flags.duplicate(),
        "opened": opened.duplicate(),
        "party": party.duplicate(true),
        "room": room,
        "position": [player_position.x, player_position.y],  # JSON has no Vector2
        "playtime": playtime,
    }


func from_dict(d: Dictionary) -> void:
    gold = int(d.get("gold", 0))
    inventory = _int_values(d.get("inventory", {}))
    flags = _int_values(d.get("flags", {}))
    opened = d.get("opened", {}).duplicate()
    party = d.get("party", []).duplicate(true)
    room = d.get("room", "village")
    var p: Array = d.get("position", [160, 96])
    player_position = Vector2(p[0], p[1])
    playtime = float(d.get("playtime", 0.0))
    _quest_text.clear()
    for quest: QuestData in QUESTS:
        _quest_text[quest.id] = quest.step_text(flags)


func new_game() -> void:
    from_dict({})


## JSON has one number type, so a count of 3 comes back as 3.0. Counts are ints.
static func _int_values(src: Dictionary) -> Dictionary:
    var out := {}
    for key in src:
        out[str(key)] = int(src[key])
    return out


# ---- world objects
func is_opened(id: String) -> bool:
    return opened.has(id)


func mark_opened(id: String) -> void:
    opened[id] = true


func add_item(id: String, count: int = 1) -> void:
    inventory[id] = int(inventory.get(id, 0)) + count


# ---- story flags (r04)
func get_flag(flag: String) -> int:
    return int(flags.get(flag, 0))


func set_flag(flag: String, value: int = 1) -> void:
    if get_flag(flag) == value:
        return
    flags[flag] = value
    Events.flag_changed.emit(flag, value)
    for quest: QuestData in QUESTS:
        var now := quest.step_text(flags)
        if now != _quest_text.get(quest.id, ""):
            _quest_text[quest.id] = now
            Events.quest_updated.emit(quest.id)
`;

const PERSIST = gd`
class_name Persist
extends RefCounted
## Stable ids for things in rooms that remember their state.


## "village/Objects/Chest2": the room's scene file name, then the node's path inside
## that room. Stable as long as nobody renames or moves the node; pin it with an
## exported id when that matters.
static func id_for(node: Node) -> String:
    var room_root := node.owner if node.owner else node
    var room_name := room_root.scene_file_path.get_file().get_basename()
    return "%s/%s" % [room_name, room_root.get_path_to(node)]
`;

const CHEST = gd`
class_name Chest
extends StaticBody2D
## A chest that stays open forever: its state lives in GameState.opened, keyed by a
## persistent id, so leaving the room or loading a save cannot refill it.

@export var persist_id := ""  ## leave empty to derive it from the room and node path
@export var gold := 0
@export var item_id := ""

@onready var sprite: Sprite2D = $Sprite2D            # objects.png: hframes 8, vframes 3
@onready var interactable: Interactable = $Interactable
@onready var open_sfx: AudioStreamPlayer2D = $OpenSfx


func _ready() -> void:
    if persist_id == "":
        persist_id = Persist.id_for(self)
    if GameState.is_opened(persist_id):
        _show_open()
        return
    interactable.interacted.connect(_on_interacted)


func _on_interacted(_by: Node2D) -> void:
    GameState.mark_opened(persist_id)
    GameState.gold += gold
    if item_id != "":
        GameState.add_item(item_id)
    open_sfx.play()
    _show_open()


func _show_open() -> void:
    sprite.frame = 1  # chest_open
    interactable.queue_free()  # nothing left to interact with
`;

const SAVE_SYSTEM = gd`
class_name SaveSystem
extends RefCounted
## Writes GameState to user://saves/slot_N.json and reads it back.
## Only static functions: nothing to instance, nothing to add to the tree.

const VERSION := 2
const DIR := "user://saves"
const SLOTS := 3  ## manual slots 1..3; slot 0 is the autosave


static func slot_path(slot: int) -> String:
    return "%s/slot_%d.json" % [DIR, slot]


static func save_slot(slot: int) -> Error:
    DirAccess.make_dir_recursive_absolute(DIR)
    var data := GameState.to_dict()
    data["version"] = VERSION
    data["meta"] = {
        "saved_at": Time.get_datetime_string_from_system(),
        "room": GameState.room,
        "playtime": GameState.playtime,
    }
    return write_json(slot_path(slot), data)


## Never overwrite the only good copy: write a temporary file, keep the previous
## save as .bak, then rename the new file into place.
static func write_json(path: String, data: Dictionary) -> Error:
    var tmp := path + ".tmp"
    var file := FileAccess.open(tmp, FileAccess.WRITE)
    if file == null:
        return FileAccess.get_open_error()
    file.store_string(JSON.stringify(data, "\t"))
    file.close()
    if FileAccess.file_exists(path):
        var bak := path + ".bak"
        if FileAccess.file_exists(bak):
            DirAccess.remove_absolute(bak)
        DirAccess.rename_absolute(path, bak)
    return DirAccess.rename_absolute(tmp, path)


## The save, or its backup if the save is missing or damaged, or {} if neither works.
static func read_json(path: String) -> Dictionary:
    for candidate in [path, path + ".bak"]:
        if not FileAccess.file_exists(candidate):
            continue
        var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(candidate))
        if parsed is Dictionary:
            return parsed
        push_warning("Save %s is damaged; trying the backup." % candidate)
    return {}


static func load_slot(slot: int) -> bool:
    var data := read_json(slot_path(slot))
    if data.is_empty():
        return false
    GameState.from_dict(data)  # lesson 3 puts SaveMigrations.migrate(data) here
    return true


## What the slot menu shows, without touching GameState.
static func slot_info(slot: int) -> Dictionary:
    return read_json(slot_path(slot)).get("meta", {})


static func format_playtime(seconds: float) -> String:
    var s := int(seconds)
    return "%d:%02d:%02d" % [s / 3600, (s / 60) % 60, s % 60]
`;

const SLOT_MENU = gd`
extends VBoxContainer
## ui/slot_menu.gd: three save slots as buttons with their metadata. Used by the
## title screen (load) and the pause menu (save).

signal slot_chosen(slot: int)

@export var saving := false  ## true in the pause menu, false on the title screen


func _ready() -> void:
    refresh()


func refresh() -> void:
    for child in get_children():
        child.queue_free()
    for slot in range(1, SaveSystem.SLOTS + 1):
        var info := SaveSystem.slot_info(slot)
        var button := Button.new()
        if info.is_empty():
            button.text = "Slot %d   (empty)" % slot
            button.disabled = not saving  # nothing to load
        else:
            button.text = "Slot %d   %s   %s" % [slot, str(info.get("room", "?")).capitalize(),
                SaveSystem.format_playtime(float(info.get("playtime", 0.0)))]
        button.pressed.connect(func() -> void: slot_chosen.emit(slot))
        add_child(button)
`;

const CONTINUE_FRAGMENT = gd`
# ui/title_menu.gd: loading a slot and entering its room.
func _on_slot_chosen(slot: int) -> void:
    if not SaveSystem.load_slot(slot):
        return  # show "This save could not be read" in a real game
    get_tree().change_scene_to_file("res://scenes/rooms/%s.tscn" % GameState.room)

# scripts/player.gd (or Character): start where the save says.
func _ready() -> void:
    global_position = GameState.player_position
`;

const MIGRATIONS = gd`
class_name SaveMigrations
extends RefCounted
## Turns any older save Dictionary into the current format, one version at a time.
## Pure functions: no autoloads, no files. That is what makes them easy to test.

const CURRENT := 2


## Returns the upgraded data, or {} for a save from a newer build than this one.
static func migrate(data: Dictionary) -> Dictionary:
    var version := int(data.get("version", 1))  # the first build wrote no version
    if version > CURRENT:
        push_error("Save version %d is newer than this game (%d)." % [version, CURRENT])
        return {}
    while version < CURRENT:
        match version:
            1:
                data = _v1_to_v2(data)
        version += 1
        data["version"] = version
    return data


## Version 1 (the first demo build): flags were a list of names, opened chests were
## a list called "chests", items were "items", and the position was "x" and "y".
static func _v1_to_v2(old: Dictionary) -> Dictionary:
    var data := old.duplicate(true)
    var flags := {}
    for flag_name in old.get("flags", []):
        flags[flag_name] = 1
    data["flags"] = flags
    var opened := {}
    for id in old.get("chests", []):
        opened[id] = true
    data["opened"] = opened
    data["inventory"] = old.get("items", {})
    data["position"] = [old.get("x", 160), old.get("y", 96)]
    for key in ["chests", "items", "x", "y"]:
        data.erase(key)
    if not data.has("playtime"):
        data["playtime"] = 0.0
    return data
`;

const LOAD_WITH_MIGRATION = gd`
# scripts/save_system.gd: load_slot with migration.
static func load_slot(slot: int) -> bool:
    var data := SaveMigrations.migrate(read_json(slot_path(slot)))
    if data.is_empty():
        return false
    GameState.from_dict(data)
    return true
`;

const AUTOSAVE = gd`
extends Node
## scripts/autosave.gd: a child of the main game scene. Saves to slot 0 when the player
## enters a room (at most once a minute) and at checkpoints (always), but never in the
## middle of a dialogue, cutscene or battle; a save that has to wait happens right after.

const SLOT := 0

@export var min_interval := 60.0  ## seconds of playtime between room autosaves

var _busy := 0             # how many dialogues, cutscenes and battles are running
var _pending := false      # a save was requested while busy
var _last_save := -1000.0  # playtime of the last autosave


func _ready() -> void:
    Events.room_changed.connect(_on_room_changed)
    Events.checkpoint_reached.connect(_on_checkpoint)
    for sig in [Events.dialogue_started, Events.cutscene_started, Events.battle_started]:
        sig.connect(_on_busy_started)
    for sig in [Events.dialogue_finished, Events.cutscene_ended, Events.battle_ended]:
        sig.connect(_on_busy_ended)


func _on_room_changed(_room_id: String) -> void:
    _request(false)


func _on_checkpoint(_checkpoint: String) -> void:
    _request(true)


func _on_busy_started() -> void:
    _busy += 1


func _on_busy_ended() -> void:
    _busy = maxi(0, _busy - 1)
    if _busy == 0 and _pending:
        _request(true)


func _request(force: bool) -> void:
    if _busy > 0:
        _pending = true
        return
    if not force and GameState.playtime - _last_save < min_interval:
        return
    _pending = false
    if SaveSystem.save_slot(SLOT) == OK:
        _last_save = GameState.playtime
        Events.autosaved.emit()
`;

const EVENTS_R06 = gd`
extends Node
## Global signal bus. Signals added for saving; keep the earlier ones (r04, k04, c04).

signal room_changed(room_id: String)        ## c04's Transitions emits it after a room loads
signal checkpoint_reached(checkpoint: String)
signal battle_started
signal battle_ended
signal autosaved                             ## the HUD shows a small save icon
`;

const SAVE_TEST = gd`
extends SceneTree
## tests/test_save.gd. Run from the project folder:
##   godot --headless --script res://tests/test_save.gd
## Exits with the number of failures, so CI can fail the build (p02).

const Migrations := preload("res://scripts/save_migrations.gd")

var failures := 0


func _init() -> void:
    _test_v1_migrates()
    _test_current_is_unchanged()
    _test_newer_is_refused()
    _test_json_numbers()
    print("save tests: %d failure(s)" % failures)
    quit(failures)


func _check(ok: bool, what: String) -> void:
    if not ok:
        failures += 1
        printerr("FAIL: ", what)


func _test_v1_migrates() -> void:
    var v1 := {"version": 1, "gold": 120, "x": 96, "y": 80,
        "flags": ["met_elder"], "chests": ["village/Objects/Chest1"], "items": {"potion": 2}}
    var v2 := Migrations.migrate(v1)
    _check(int(v2["version"]) == 2, "version becomes 2")
    _check(int(v2["flags"].get("met_elder", 0)) == 1, "flag list becomes a dictionary")
    _check(v2["opened"].has("village/Objects/Chest1"), "chests become opened ids")
    _check(v2["position"] == [96, 80], "x and y become position")
    _check(not v2.has("x") and not v2.has("chests"), "old keys are removed")
    _check(int(v2["gold"]) == 120, "untouched fields survive")


func _test_current_is_unchanged() -> void:
    var v2 := {"version": 2, "gold": 5, "flags": {"a": 1}}
    _check(Migrations.migrate(v2.duplicate(true)) == v2, "a current save is not modified")


func _test_newer_is_refused() -> void:
    _check(Migrations.migrate({"version": 99}).is_empty(), "a save from the future is refused")


func _test_json_numbers() -> void:
    var back: Variant = JSON.parse_string(JSON.stringify({"gold": 3}))
    _check(back["gold"] is float, "JSON numbers come back as float: convert with int()")
`;

// ---------------------------------------------------------------------------------- module

export const MODULE: Module = {
  id: 'r06',
  part: 'rpg',
  order: 6,
  title: 'Saving and world state',
  summary: 'What an RPG saves and what it rebuilds, persistent ids for world objects, JSON saves with atomic writes and backups, save slots with metadata, the serialization options and their risks, versioned saves with migrations, autosave rules, and tests.',
  relevance: md`A player who loses three hours to a broken save does not come back, and a Steam review will say so. This module makes Shardbound's state survive: the party, gold, inventory, story flags and every opened chest go through one \`GameState\` dictionary into a versioned JSON file per slot, written so that a crash mid-save cannot destroy the previous one. Chests and herbs remember themselves by persistent ids, the slot menu shows room and play time, autosave runs at room changes and save crystals, and migrations let you change the format during development without invalidating your playtesters' saves. p03 then hands the save folder to Steam Cloud.`,
  prereqs: ['g04', 'r03'],
  areas: ['systems', 'godot', 'ship'],
  lessons: [
    // ======================================================================== r06-1
    {
      id: 'r06-1',
      title: 'What to save, and how to name it',
      minutes: 40,
      objectives: [
        'List what Shardbound must save (party, inventory, gold, flags, opened objects, room, position, play time) and what it should rebuild instead.',
        'Give world objects persistent ids derived from room and node path, and pin them when needed.',
        'Keep all saved state in `GameState` with `to_dict()`/`from_dict()` and let scenes restore themselves in `_ready`.',
        'Serialize with `JSON.stringify` and `JSON.parse_string`, and handle what JSON loses: ints, `Vector2`, key types.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Saving looks like a file problem and is mostly a **state** problem. The file part is twenty lines. The hard questions come first:

- **What is the game's state?** Kai's level and HP are state. The position of every slime is arguably not: rooms respawn their enemies anyway. The quest log is not either: r04 computes it from flags.
- **Where does it live?** If the gold count lives in the HUD and the opened chests live in each chest node, saving means visiting every node in every room, including rooms that are not loaded.
- **How does a chest know it was opened,** when the room is a fresh instance of a scene file every time you enter it?

Shardbound's answer to all three: **every fact that must survive lives in the \`GameState\` autoload** as plain data (numbers, strings, arrays, dictionaries). Scenes read it when they load and write it when something changes. Saving is then \`GameState.to_dict()\` written to a file, and loading is the reverse followed by entering the saved room.`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'Save facts, rebuild everything else',
          md: md`| Save | Rebuild (do not save) |
|---|---|
| party: level, XP, current HP/MP, equipped gear and shard ids | max HP and stats: computed from level, gear and shards (r01) |
| inventory (item id → count), gold | item names, icons, prices: in \`ItemData\` resources |
| story flags | quest steps and the quest log: computed from flags (r04) |
| opened chests, picked herbs, broken walls (persistent ids) | enemies: respawn with the room |
| current room and position, play time | camera, HUD, particles, music position |

Saving a derived value creates a second copy that can disagree with the first after a balance patch. Saving ids instead of whole resources means a fixed typo in a sword's description reaches old saves too.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Persistent id',
          md: md`A **persistent id** is a string that names one object in the world across sessions and saves, such as \`"village/Objects/Chest2"\`. The object looks up its own state by that id when its room loads. Node references and instance ids cannot do this: they are different every time the scene is instanced.`,
        },
        {
          kind: 'viz',
          viz: { type: 'rpg.save_inspector', mode: 'live' },
          task: md`Walk Kai with the arrows and press **F** next to things: open the chest, pick up the coins, talk to the elder. Watch which JSON lines change (highlighted). Walk through the door on the right into the north road, open its chest, and come back: the village chest is still open because its id is in \`opened\`. Then press **Save** to slot 1, open another chest, and **Load** slot 1.`,
          caption: md`The JSON is exactly what \`JSON.stringify(GameState.to_dict(), "\\t")\` would write, updated every time state changes. Nothing in the room scene is saved: on load, each chest and coin asks \`GameState.is_opened(persist_id)\` in its \`_ready\`, as in the listing below.`,
        },
        { kind: 'code', file: 'scripts/autoload/game_state.gd', code: GAME_STATE, note: md`\`to_dict()\` copies (\`duplicate\`) so a save in progress cannot be changed under it, and so a loaded dictionary never aliases the live state. \`from_dict\` uses \`get\` with defaults everywhere: a save missing a key (an older save, a hand-edited one) still loads.` },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'What JSON does to your types',
          md: md`- **Numbers**: JSON has one number type, and \`JSON.parse_string\` returns every number as a \`float\`. \`3\` comes back as \`3.0\`; \`int()\` it back, as \`from_dict\` does. A \`match\` with pattern \`3\` does not match \`3.0\`.
- **Vectors and colors**: \`JSON.stringify\` turns a \`Vector2\` into the string \`"(96, 80)"\`. Store \`[x, y]\` and rebuild the vector.
- **Keys**: object keys are always strings. A dictionary keyed by ints comes back keyed by \`"1"\`, \`"2"\`.
- **Objects and resources** cannot be stored. Save the id (\`"iron_sword"\`) and look the resource up on load.`,
        },
        {
          kind: 'check',
          q: md`After loading, this check never succeeds even though the save file shows \`"herbs": 3\`. Why?

\`\`\`gdscript
match GameState.flags["herbs"]:
	3:
		start_lantern_cutscene()
\`\`\``,
          options: [
            md`The loaded value is the float \`3.0\`, and \`match\` compares types strictly, so the pattern \`3\` does not match.`,
            md`JSON stores numbers as strings.`,
            md`\`match\` cannot be used on dictionary values.`,
            md`Flags are reset when a save loads.`,
          ],
          answer: 0,
          explain: md`\`JSON.parse_string\` returns floats. \`3.0 == 3\` is true, but \`match\` requires the same type. Converting on load (\`_int_values\` in \`from_dict\`) fixes it at the boundary, so no gameplay code has to care.`,
        },
        {
          kind: 'text',
          md: md`### Persistent ids from the scene tree

Typing a unique id into every chest works but is tedious and error-prone: copy a chest, forget to change its id, and opening one opens both. A good default derives the id from where the object is: the room's scene file name plus the node's path inside the room. Two chests in one room cannot have the same path, and the same chest gets the same id every time the room loads.

The weakness: rename or move the node in the editor and the id changes, so old saves forget that chest was opened. For objects that matter (a key item, a one-time boss), pin the id with the exported \`persist_id\`.`,
        },
        { kind: 'code', file: 'scripts/persist.gd', code: PERSIST, note: md`\`owner\` is the root of the scene the node was saved in. For a chest instanced into \`village.tscn\`, it is the village root, so \`get_path_to\` gives the path inside that room.` },
        {
          kind: 'numeric',
          q: md`A room has 6 chests, 10 herbs and 4 breakable walls, each remembered by one entry in \`opened\` when used. Ids average 26 characters. In tab-indented JSON each entry is a line \`\t\t"<id>": true,\` (2 tabs, 2 quotes, a colon, a space, \`true\`, a comma, a newline: 12 characters plus the id). How many bytes do the entries of a fully cleared room take?`,
          answer: { kind: 'number', value: 760 },
          explain: md`20 entries × (26 + 12) = 20 × 38 = 760 bytes. A whole region of 30 rooms is about 23 KB: saves of this design stay small, which matters later for cloud sync.`,
        },
        {
          kind: 'steps',
          title: 'Make a chest that remembers',
          steps: [
            md`Replace \`scripts/autoload/game_state.gd\` with the listing above (it keeps r04's flags and quests) and add \`scripts/persist.gd\`.`,
            md`Make \`scenes/chest.tscn\`: a \`StaticBody2D\` root with \`chest.gd\`, a \`Sprite2D\` with \`assets/objects/objects.png\` (*Animation → Hframes* 8, *Vframes* 3, *Frame* 0), a 14×8 \`CollisionShape2D\` on the \`world\` layer, an instance of r04's \`interactable.tscn\` with *Prompt* "Open", and an \`AudioStreamPlayer2D\` named \`OpenSfx\` with \`sfx_chest\`.`,
            md`Put two chests in the village room, one with *Gold* 50 and one with *Item Id* \`potion\`.`,
            md`Run the room, open one chest, leave through a door and come back (or reload the room with **F6** after adding a debug key that calls \`get_tree().reload_current_scene()\`).`,
          ],
          result: md`The opened chest is still open when the room loads again, and its gold was added only once. The other chest is still closed. In the *Remote* scene tree (*Debug* panel while the game runs), \`GameState\`'s \`opened\` shows one id such as \`"village/Objects/Chest1"\`.`,
          troubleshoot: [
            { problem: md`Both chests open together.`, fix: md`They share an id: both have the same \`persist_id\` typed in, or one is a duplicate with a pinned id. Clear the field so the id derives from the node path.` },
            { problem: md`The id starts with \`/\` or the room name is empty.`, fix: md`The chest is the root of the scene you ran (running \`chest.tscn\` itself) so it has no owner room. Test inside a room scene.` },
          ],
        },
        { kind: 'code', file: 'scenes/chest.gd', code: CHEST },
        {
          kind: 'build',
          ch: {
            id: 'r06-1-build',
            title: 'A wall that stays broken',
            goal: md`Add a cracked wall that Bram's mace can break (any hit will do for now), and make it stay broken across room changes and saves.`,
            requirements: [
              md`Hitting the wall plays a short break effect, removes its collision, and adds its id to \`GameState.opened\`.`,
              md`Re-entering the room shows the wall already broken, with no effect and no collision.`,
              md`Duplicating the wall in the editor gives the copy its own id automatically.`,
              md`\`print(JSON.stringify(GameState.to_dict(), "\\t"))\` shows the wall's id under \`opened\`.`,
            ],
            hints: [
              md`The wall is a \`StaticBody2D\` with a c05 \`Hurtbox\` child: connect its \`hurt\` signal.`,
              md`Copy the chest's \`_ready\` pattern: derive the id, check \`is_opened\`, and either show the broken state or connect the signal.`,
            ],
            solution: [
              {
                file: 'scenes/breakable_wall.gd',
                code: gd`
extends StaticBody2D
## A cracked wall that breaks once and stays broken.

@export var persist_id := ""

@onready var sprite: Sprite2D = $Sprite2D
@onready var shape: CollisionShape2D = $CollisionShape2D
@onready var hurtbox: Hurtbox = $Hurtbox


func _ready() -> void:
    if persist_id == "":
        persist_id = Persist.id_for(self)
    if GameState.is_opened(persist_id):
        _show_broken()
        return
    hurtbox.hurt.connect(_on_hurt)


func _on_hurt(_hit: HitData) -> void:
    GameState.mark_opened(persist_id)
    var t := create_tween()
    t.tween_property(sprite, "modulate:a", 0.0, 0.2)
    t.tween_callback(_show_broken)


func _show_broken() -> void:
    sprite.hide()
    shape.set_deferred("disabled", true)  # physics shapes change safely after the step
    hurtbox.queue_free()
`,
              },
            ],
            explain: md`Every world object with memory follows the same three steps: get an id, ask \`GameState\` in \`_ready\`, record the change in \`GameState\` when it happens. \`opened\` is a general "this has been used up" set; it is not only for chests. \`set_deferred\` is needed because changing a collision shape inside a physics callback is not allowed mid-step.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'r06-1-paper',
            title: 'Save or rebuild?',
            type: 'design',
            difficulty: 1,
            minutes: 6,
            statement: md`For each, say *save* or *rebuild* and why: (a) Lyra's max MP, (b) Lyra's current MP, (c) the step text of the moonherb quest, (d) which shard is socketed in Kai's sword, (e) the position of a slime in the current room, (f) the fact that the golem was defeated.`,
            solution: [
              md`Save: (b) current MP (it changes in play and cannot be derived), (d) the socketed shard's id (a player choice), (f) a flag \`golem_defeated\` (a story fact).`,
              md`Rebuild: (a) max MP comes from level, gear and shards; (c) the quest text is computed from flags; (e) enemies respawn with the room.`,
            ],
            rubric: [md`All six classified correctly`, md`Reasons distinguish player choices and story facts from derived or transient values`],
          },
        },
        {
          kind: 'recall',
          prompt: md`What are three things \`JSON.parse_string\` gives back differently from what you stored, and how does \`from_dict\` handle each?`,
          answer: md`Every number becomes a float (convert counts with \`int()\`); a \`Vector2\` would come back as a string, so it is stored as \`[x, y]\` and rebuilt; dictionary keys are always strings (use string keys from the start).`,
        },
        {
          kind: 'explain',
          prompt: md`Why do chests read their state from \`GameState\` in \`_ready\` instead of the save system visiting every chest when saving?`,
          model: md`Only the current room's nodes exist; chests in other rooms are not in the tree, so a save that visits nodes would lose their state or need every room loaded. With the state in \`GameState\`, the save system never needs to know chests exist: it saves one dictionary. Each chest restores itself whenever its room is instanced, which works the same for entering a room and for loading a save.`,
        },
      ],
      cards: [
        { id: 'r06-1-c1', kind: 'concept', front: md`Why save item and shard *ids* instead of the resources themselves?`, back: md`JSON cannot hold objects, and ids keep saves small and let fixes to the resource data reach old saves.` },
        { id: 'r06-1-c2', kind: 'cloze', text: md`\`JSON.parse_string\` returns every number as a {{}}, so convert counts with \`int()\` when loading.`, answers: ['float'] },
        { id: 'r06-1-c3', kind: 'concept', front: md`How does \`Persist.id_for\` derive an id, and when does it break?`, back: md`Room scene file name plus the node's path inside the room. It changes if the node is renamed or moved, so pin important ids with an exported \`persist_id\`.` },
        { id: 'r06-1-c4', kind: 'concept', front: md`Name three things Shardbound rebuilds instead of saving.`, back: md`Max HP and stats (from level and gear), the quest log (from flags), enemies (respawn with the room); also camera, HUD and music position.` },
        { id: 'r06-1-c5', kind: 'cloze', text: md`A \`Vector2\` is saved to JSON as the array {{}} and rebuilt with \`Vector2(p[0], p[1])\`.`, answers: ['[x, y]|[x,y]'] },
      ],
    },

    // ======================================================================== r06-2
    {
      id: 'r06-2',
      title: 'Files, slots and formats',
      minutes: 40,
      objectives: [
        'Find `user://` on Windows, macOS and Linux, and choose a stable folder name with a custom user dir.',
        'Write saves atomically (temporary file, backup, rename) and fall back to the backup on load.',
        'Build save slots with metadata a menu can show without loading the game.',
        'Compare JSON, ConfigFile, `store_var` and `ResourceSaver`, including why loading untrusted `.tres` files is unsafe.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Lesson 1 produced a dictionary. This lesson puts it on disk in a way that survives the two things that destroy saves in practice: a write interrupted halfway (the game crashes, the battery dies, the player alt-F4s during the save), and a file the game cannot read anymore. It also adds the slot menu every RPG has, and looks at the other ways Godot can serialize data, with one that you should not use for saves at all.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'user:// on each platform',
          md: md`\`res://\` is the project, read-only in an exported game. \`user://\` is a per-user folder where the game may write:

| Platform | Default \`user://\` |
|---|---|
| Windows | \`%APPDATA%\Godot\app_userdata\<project name>\` |
| macOS | \`~/Library/Application Support/Godot/app_userdata/<project name>\` |
| Linux | \`~/.local/share/godot/app_userdata/<project name>\` |

With **Project Settings → Application → Config → Use Custom User Dir** on, the \`Godot/app_userdata\` part is replaced by your *Custom User Dir Name* (for example \`%APPDATA%\Shardbound\`). Turn it on before the first public build: the folder name then no longer depends on the project name, and Steam Cloud (p03) needs a path that never changes. **Project → Open User Data Folder** opens it from the editor; \`OS.get_user_data_dir()\` returns it at runtime.`,
        },
        {
          kind: 'text',
          md: md`### Writing without ever losing the old save

Opening the save file for writing truncates it immediately. If the game dies between that moment and the last byte, the only copy is now half a file. The fix costs four lines: write the new save to \`slot_1.json.tmp\`, close it, rename the current \`slot_1.json\` to \`slot_1.json.bak\`, rename the temporary file to \`slot_1.json\`. At every instant, at least one complete save exists on disk. On load, if the main file is missing or does not parse, read the \`.bak\`.`,
        },
        { kind: 'code', file: 'scripts/save_system.gd', code: SAVE_SYSTEM, note: md`\`save_slot\` stores a small \`meta\` dictionary next to the game data, so the slot menu can show room and play time. \`JSON.stringify(data, "\\t")\` indents with tabs, which makes saves readable while you debug; pass no indent for a smaller file in release. \`format_playtime\` relies on integer division of ints, which GDScript performs (and warns about, harmlessly).` },
        {
          kind: 'check',
          q: md`The game crashes *after* \`DirAccess.rename_absolute(path, bak)\` but *before* the final rename. What does the next \`read_json(path)\` return?`,
          options: [
            md`The previous save, read from the \`.bak\` file, because \`slot_1.json\` does not exist at that moment.`,
            md`An empty dictionary: the save is lost.`,
            md`The new save, from the \`.tmp\` file.`,
            md`A half-written file.`,
          ],
          answer: 0,
          explain: md`After the first rename, the old save is \`slot_1.json.bak\` and the new one is the complete \`.tmp\`. \`read_json\` finds no \`slot_1.json\`, moves on to the backup and returns the previous save. The player loses only the progress since that save. (Reading the \`.tmp\` too would recover even that, at the risk of trusting a file whose write may not have finished.)`,
        },
        {
          kind: 'viz',
          viz: { type: 'rpg.save_inspector', mode: 'slots' },
          task: md`Play a little, then save to slots 1 and 2 at different moments and compare their metadata in the slot list. Switch **format** to *ConfigFile* to see the same state in Godot's ConfigFile text format (note \`Vector2(…)\` and ints survive), then back to JSON. Press **Simulate a crash mid-save** and load the slot: the backup is used.`,
          caption: md`Each slot shows \`meta\`: room, play time and the save time. A slot menu reads only that part, which is why it is stored separately from the game data in the same file. The file list shows what is on disk after each step of \`write_json\`.`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'Four ways to serialize, one to avoid for saves',
          md: md`| Option | Readable | Keeps Godot types | Safe to load a file someone sent you | Use it for |
|---|---|---|---|---|
| JSON (\`JSON.stringify\`, \`JSON.parse_string\`) | yes | no: numbers become floats, vectors become strings | yes: it is only data | saves you want to read, diff and migrate |
| \`ConfigFile\` | yes, INI-like sections | yes, in Godot's text format (\`Vector2(96, 80)\`) | treat as data you wrote yourself | settings: volume, key bindings, window mode |
| \`FileAccess.store_var\` / \`get_var\` | no, binary | yes, all built-in types | yes while \`allow_objects\` stays \`false\` (the default) | compact saves once the format is stable |
| \`ResourceSaver.save\` a custom \`Resource\` (\`.tres\`) | yes | yes, typed, editable in the Inspector | **no** | editor data, never player saves |

The \`.tres\` problem: a resource file can contain or reference a script, and loading it with \`ResourceLoader.load\` (or \`load\`) instantiates that script. A save file shared on a forum, or a cloud save on a compromised account, then becomes a way to run arbitrary code on the player's machine. Keep player-writable files to plain data that you parse yourself.`,
        },
        {
          kind: 'numeric',
          q: md`The slot menu shows 3 slots plus the autosave. Each \`read_json\` of a 23 KB save takes about 0.4 ms to read and 1.1 ms to parse on the Steam Deck. How many milliseconds does opening the menu spend reading saves? Would that cause a dropped frame at 60 fps?`,
          answer: { kind: 'number', value: 6 },
          explain: md`$4 \times (0.4 + 1.1) = 6$ ms, under the 16.7 ms frame budget at 60 fps, so a single menu open does not drop a frame by itself. If saves grow tenfold, write the meta to a small separate file (\`slot_1.meta.json\`) or cache it.`,
        },
        { kind: 'code', file: 'ui/slot_menu.gd', code: SLOT_MENU, note: md`Each lambda captures its own \`slot\`, because GDScript copies local variables into a lambda when it is created. Empty slots stay pressable when saving (to save into them) and are disabled when loading.` },
        { kind: 'code', file: 'ui/title_menu.gd', code: CONTINUE_FRAGMENT, fragment: true },
        {
          kind: 'steps',
          title: 'Save to a slot and find the file',
          steps: [
            md`In **Project Settings → Application → Config**, turn on *Use Custom User Dir* and set *Custom User Dir Name* to \`Shardbound\`.`,
            md`Add \`scripts/save_system.gd\`. Give the pause menu's *Save* command a submenu with \`slot_menu.tscn\` (a \`VBoxContainer\` with \`slot_menu.gd\`, *Saving* on) and connect \`slot_chosen\` to a function that calls \`SaveSystem.save_slot(slot)\` and then \`refresh()\`.`,
            md`Run the game, open a chest, save to slot 1, then choose **Project → Open User Data Folder** in the editor.`,
            md`Open \`saves/slot_1.json\` in a text editor. Then delete a closing brace to damage it and load slot 1 from the title menu.`,
          ],
          result: md`The folder contains \`saves/slot_1.json\` (and a \`.bak\` after the second save). The JSON shows your gold, flags, the chest's id under \`opened\`, and the \`meta\` block. Loading the damaged file prints the "trying the backup" warning and loads the previous save.`,
          troubleshoot: [
            { problem: md`\`save_slot\` returns error 31 or the folder is empty.`, fix: md`Error 31 is \`ERR_CANT_OPEN\`: the \`saves\` directory does not exist. \`make_dir_recursive_absolute\` must run before \`FileAccess.open\`.` },
            { problem: md`Loading works but Kai appears at the room's default spawn.`, fix: md`Something sets the position after the player's \`_ready\` (a room spawn point from c04). Apply \`GameState.player_position\` last, or skip the spawn point when entering from a save.` },
          ],
        },
        {
          kind: 'build',
          ch: {
            id: 'r06-2-build',
            title: 'Settings in a ConfigFile',
            goal: md`Store player settings separately from saves: music and SFX volume, and whether screen shake is on, in \`user://settings.cfg\`.`,
            requirements: [
              md`Changing a setting in the options menu writes \`user://settings.cfg\` immediately.`,
              md`Starting the game applies the stored volumes to the \`Music\` and \`SFX\` audio buses before the title music starts.`,
              md`Deleting the file restores defaults without errors.`,
              md`Settings are shared by all save slots and are never inside a save file.`,
            ],
            hints: [
              md`\`ConfigFile.load(path)\` returns an \`Error\`; ignore it and use \`get_value(section, key, default)\`, which returns the default when the file or key is missing.`,
              md`Audio buses take decibels: \`AudioServer.set_bus_volume_db(AudioServer.get_bus_index("Music"), linear_to_db(volume))\`.`,
            ],
            solution: [
              {
                file: 'scripts/settings.gd',
                code: gd`
class_name Settings
extends RefCounted
## Player settings in user://settings.cfg, shared by every save slot.

const PATH := "user://settings.cfg"

static var music_volume := 0.8
static var sfx_volume := 0.8
static var screen_shake := true


static func load_and_apply() -> void:
    var cfg := ConfigFile.new()
    cfg.load(PATH)  # a missing file leaves cfg empty, and get_value returns the defaults
    music_volume = cfg.get_value("audio", "music", 0.8)
    sfx_volume = cfg.get_value("audio", "sfx", 0.8)
    screen_shake = cfg.get_value("video", "screen_shake", true)
    apply()


static func save() -> void:
    var cfg := ConfigFile.new()
    cfg.set_value("audio", "music", music_volume)
    cfg.set_value("audio", "sfx", sfx_volume)
    cfg.set_value("video", "screen_shake", screen_shake)
    cfg.save(PATH)
    apply()


static func apply() -> void:
    AudioServer.set_bus_volume_db(AudioServer.get_bus_index("Music"), linear_to_db(music_volume))
    AudioServer.set_bus_volume_db(AudioServer.get_bus_index("SFX"), linear_to_db(sfx_volume))
`,
              },
            ],
            explain: md`Settings belong to the player, not to a playthrough, so they get their own file and their own format. ConfigFile is a good fit: human-readable, keeps bools and floats as they are, and \`get_value\` with defaults makes a missing or old file harmless. Static variables (Godot 4.1+) hold the current values without an autoload; call \`Settings.load_and_apply()\` from the first scene's \`_ready\`.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'r06-2-paper',
            title: 'Where is it on disk?',
            type: 'concept',
            difficulty: 1,
            minutes: 4,
            statement: md`A player on Linux reports a broken save. Your project is named "Shardbound Prototype" and *Use Custom User Dir* is on with the name \`Shardbound\`. Which file should they send you for slot 2, and which second file might rescue them?`,
            solution: [
              md`With a custom user dir on Linux, \`user://\` is \`~/.local/share/Shardbound\`. The save is \`~/.local/share/Shardbound/saves/slot_2.json\`.`,
              md`The previous save is \`slot_2.json.bak\` in the same folder. Renaming it to \`slot_2.json\` restores the save before the last one.`,
            ],
            rubric: [md`Correct base folder with the custom dir name`, md`Correct relative path and file name`, md`Mentions the .bak backup`],
          },
        },
        {
          kind: 'recall',
          prompt: md`In what order does \`write_json\` touch the files, and why that order?`,
          answer: md`Write and close \`path.tmp\`; delete the old \`.bak\`; rename \`path\` to \`path.bak\`; rename \`.tmp\` to \`path\`. At every moment a complete save exists (the old one or the new one), so a crash at any step loses at most the newest progress.`,
        },
        {
          kind: 'explain',
          prompt: md`A teammate wants to save the game by making \`GameState\` a custom Resource and calling \`ResourceSaver.save(state, "user://slot_1.tres")\`. What do you tell them?`,
          model: md`It is convenient (typed fields, readable \`.tres\`, no conversion code), but loading a \`.tres\` instantiates any script it contains or references, so a save file that came from someone else can run arbitrary code when loaded. Players share saves and cloud sync moves files between machines, so saves are untrusted input. Keep saves as plain data (JSON, or \`store_var\` with objects disallowed) and parse them yourself; use Resources for game data that ships inside the project.`,
        },
      ],
      cards: [
        { id: 'r06-2-c1', kind: 'concept', front: md`Why turn on *Use Custom User Dir* before the first public build?`, back: md`The save folder then has a fixed name (e.g. \`%APPDATA%\Shardbound\`) that does not change with the project name, which Steam Cloud and players' backups rely on.` },
        { id: 'r06-2-c2', kind: 'concept', front: md`Why must a save never be loaded with \`ResourceLoader.load\` from user files?`, back: md`A \`.tres\` can contain or reference scripts, which run on load: a shared or tampered save could execute arbitrary code.` },
        { id: 'r06-2-c3', kind: 'cloze', text: md`Atomic save: write to a {{}} file, keep the old save as .bak, then rename into place.`, answers: ['temporary|tmp|.tmp'] },
        { id: 'r06-2-c4', kind: 'cloze', text: md`\`FileAccess.get_var\` is safe on untrusted files as long as \`allow_objects\` stays {{}}.`, answers: ['false'] },
        { id: 'r06-2-c5', kind: 'concept', front: md`Why store a small \`meta\` dictionary in each save?`, back: md`The slot menu needs room, play time and save time for every slot without loading each game into GameState.` },
      ],
    },

    // ======================================================================== r06-3
    {
      id: 'r06-3',
      title: 'Versions, autosave and tests',
      minutes: 40,
      objectives: [
        'Version every save and migrate old saves one step at a time ($v \\to v+1$) with pure functions.',
        'Refuse saves from a newer build instead of guessing.',
        'Autosave at room changes (throttled) and checkpoints, never mid-dialogue, cutscene or battle.',
        'Test migrations headless with `godot --headless --script`, and prepare the save folder for Steam Cloud.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`The save format will change. You will rename a key, turn a list into a dictionary, add equipment slots, split one flag into two. Each change breaks every existing save, including your playtesters' and, after launch, your players'. The standard answer is two small habits:

1. Every save records its **format version**.
2. For each version change there is a **migration**: a function that turns a version-$v$ dictionary into version $v+1$. Loading runs the chain until the data is current.

Migrations are written once, when you change the format, while you still remember what changed. They are pure functions on dictionaries, so they are easy to test, and the test suite then guarantees old saves keep loading forever.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Migration chain',
          md: md`A **migration chain** is the sequence of functions $m_1, m_2, \dots$ where $m_v$ converts version $v$ to $v+1$. A save at version $a$ loaded by a build at version $b$ runs $m_a, m_{a+1}, \dots, m_{b-1}$: $b - a$ steps. Each migration only knows two adjacent formats, which keeps each one small, and adding a version means writing one new function, not one per old version.`,
        },
        {
          kind: 'viz',
          viz: { type: 'rpg.save_inspector', mode: 'migrate' },
          task: md`Press **Load a version-1 save**. Step through the migration with **Next step**: each line of \`_v1_to_v2\` changes one part of the data, highlighted in the JSON. When it finishes, the game state is loaded and the chest from the old save is open in the room. Then try **Load a version-3 save**: the build refuses it.`,
          caption: md`Version 1 stored flags as a list of names, opened chests as \`chests\`, items as \`items\`, and the position as \`x\` and \`y\`. Version 2 is lesson 1's format. Old keys are removed so the migrated save looks exactly like a fresh version-2 save.`,
        },
        { kind: 'code', file: 'scripts/save_migrations.gd', code: MIGRATIONS, note: md`The \`while\` loop with \`match\` grows by one branch per version: \`2: data = _v2_to_v3(data)\`. A save with no \`version\` key is treated as version 1, because the first build did not write one. \`duplicate(true)\` makes the migration leave its input untouched, which keeps tests simple.` },
        { kind: 'code', file: 'scripts/save_system.gd', code: LOAD_WITH_MIGRATION, fragment: true },
        {
          kind: 'check',
          q: md`Your game is at save version 5. A tester loads a version-2 save. How many migration functions run, and which?`,
          options: [md`3: \`_v2_to_v3\`, \`_v3_to_v4\`, \`_v4_to_v5\``, md`1: \`_v2_to_v5\``, md`5: every migration from version 1`, md`4: \`_v2_to_v3\` through \`_v5_to_v6\``],
          answer: 0,
          explain: md`The chain runs from the save's version to the current one, one step each: $5 - 2 = 3$ functions. No direct \`_v2_to_v5\` exists, which is the point: each migration only knows two adjacent formats.`,
        },
        {
          kind: 'text',
          md: md`### Autosave and checkpoints

Manual saving alone loses progress to crashes and forgetful players; saving constantly hitches the game and can capture a broken moment. Shardbound uses three rules:

- **Room changes** trigger an autosave to slot 0, at most once per \`min_interval\` seconds of play time, because a quick back-and-forth between two rooms should not write ten files.
- **Checkpoints** (save crystals, the moment before a boss) always save.
- **Never while busy**: not during dialogue, a cutscene or a battle. A save requested then waits and happens as soon as the last of them ends. Loading a save taken mid-cutscene would restart the game halfway through a scripted sequence.`,
        },
        { kind: 'code', file: 'scripts/autoload/events.gd', code: EVENTS_R06 },
        { kind: 'code', file: 'scripts/autosave.gd', code: AUTOSAVE, note: md`\`_busy\` counts instead of being a bool, because a dialogue can start inside a cutscene: the save must wait until both have ended. \`_last_save\` uses play time, not wall-clock time, so time in the pause menu or with the game minimised does not count toward the interval.` },
        {
          kind: 'derive',
          title: 'how many autosaves an hour, and how much can a crash cost',
          goal: md`Rooms change every $r$ seconds of play time, and the autosave interval is $I$. Find how often autosaves actually happen, and the most progress a crash can lose.`,
          steps: [
            { md: md`An autosave happens at the first room change at least $I$ seconds after the previous save. Room changes happen at multiples of $r$, so the gap between saves is the smallest multiple of $r$ that is $\ge I$: $$g = r \left\lceil \frac{I}{r} \right\rceil.$$` },
            {
              md: md`With $r = 40$ s and $I = 60$ s: $\lceil 60/40 \rceil = 2$, so $g = 80$ s, and an hour of play produces $3600/80 = 45$ autosaves.`,
              choose: {
                prompt: md`Why is the gap 80 s and not 60 s?`,
                options: [md`At 60 s no room change happens; the next one is at 80 s`, md`The interval is doubled for safety`, md`Saving takes 20 s`],
                answer: 0,
                explain: md`Saves only happen at room changes. The change at 40 s is too early ($40 < 60$), the next one at 80 s qualifies.`,
              },
            },
            {
              md: md`A crash just before the next save loses at most $g$ seconds of play (plus whatever happened since the last room change, which the next autosave would have caught). On average the loss is about $g/2$.`,
              choose: {
                prompt: md`With $r = 25$ s and $I = 60$ s, what is the longest gap between autosaves?`,
                options: [md`75 s`, md`60 s`, md`50 s`],
                answer: 0,
                explain: md`$\lceil 60/25 \rceil = 3$, so $g = 3 \times 25 = 75$ s.`,
              },
            },
          ],
          takeaway: md`Pick $I$ for the worst loss you accept, then remember the real gap is rounded up to the room rhythm. Checkpoints before hard fights cap the loss where it would hurt most.`,
        },
        {
          kind: 'numeric',
          q: md`Rooms change every 35 s of play and \`min_interval\` is 90 s. How many room autosaves happen in one hour of play?`,
          answer: { kind: 'number', value: 3600 / 105 },
          explain: md`$\lceil 90/35 \rceil = 3$, so saves are $3 \times 35 = 105$ s apart: $3600/105 \approx 34.3$ autosaves per hour.`,
        },
        {
          kind: 'text',
          md: md`### Testing saves

Save bugs are the worst kind to find late: they show up hours into a playthrough, on someone else's machine, after an update. Three tests catch most of them, and none needs the game to run:

1. **Migration**: a real version-1 save (keep a copy of one from each old build in \`tests/saves/\`) migrates to the current format with the expected values.
2. **Round trip**: \`from_dict(to_dict())\` gives back the same state, including ints and vectors.
3. **Refusal**: a save from a newer version is rejected instead of half-loaded.

Godot can run a script without opening a window: \`godot --headless --script res://tests/test_save.gd\`. The script extends \`SceneTree\`, runs its checks in \`_init\`, and exits with the number of failures, which a CI job (p02) treats as pass or fail. It loads only \`save_migrations.gd\`, a script with no autoload references, which is why the migrations live in their own pure script.`,
        },
        { kind: 'code', file: 'tests/test_save.gd', code: SAVE_TEST },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'Steam Cloud, in preview',
          md: md`p03 sets up Steam Cloud in the Steamworks partner site. What this module already does for it: saves live in one folder under a fixed custom user dir; files are small JSON; writes are atomic, so the cloud never uploads half a file; slot metadata carries \`saved_at\` and \`playtime\`, so when two machines disagree you can show the player which save is newer and longer. Keep settings (\`settings.cfg\`) in a separate file so you can decide independently whether they sync.`,
        },
        {
          kind: 'steps',
          title: 'Migrate a real old save',
          steps: [
            md`Add \`scripts/save_migrations.gd\` and change \`SaveSystem.load_slot\` to the migrating version above.`,
            md`In the user data folder, create \`saves/slot_3.json\` by hand with version-1 contents: \`{"version": 1, "gold": 120, "x": 96, "y": 80, "room": "village", "flags": ["herbs_started"], "chests": ["village/Objects/Chest1"], "items": {"potion": 2}}\`. Copy it to \`tests/saves/v1_village.json\` in the project too.`,
            md`Load slot 3 from the title menu.`,
            md`Add \`tests/test_save.gd\` and run it from a terminal in the project folder: \`godot --headless --script res://tests/test_save.gd\` (use the full path to the Godot executable if it is not on your PATH).`,
          ],
          result: md`Slot 3 loads into the village with 120 gold, two potions, the first chest open and the moonherb quest active. The terminal prints \`save tests: 0 failure(s)\` and the command's exit code is 0.`,
          troubleshoot: [
            { problem: md`The test prints "Identifier not declared" errors.`, fix: md`The test or \`save_migrations.gd\` references an autoload (\`GameState\`, \`Events\`). Headless scripts run without your autoloads; keep migrations pure.` },
            { problem: md`Loading the v1 save crashes in \`from_dict\` on \`p[0]\`.`, fix: md`The migration did not run: \`load_slot\` still calls \`from_dict(data)\` directly. Pass the data through \`SaveMigrations.migrate\` first.` },
          ],
        },
        {
          kind: 'build',
          ch: {
            id: 'r06-3-build',
            title: 'Version 3: equipment slots',
            goal: md`r01 changed party gear from a single \`"weapon": "iron_sword"\` key per member to a dictionary \`"gear": {"weapon": "iron_sword", "armour": "", "accessory": ""}\`. Make it version 3 without breaking any version-1 or version-2 save.`,
            requirements: [
              md`\`SaveMigrations.CURRENT\` is 3 and \`SaveSystem.VERSION\` matches it.`,
              md`A version-2 save with \`"weapon"\` keys loads with the weapon in \`gear.weapon\` and empty armour and accessory.`,
              md`The version-1 test save still loads (it runs two migrations).`,
              md`New tests cover the 2 → 3 step and the full 1 → 3 chain, and all pass headless.`,
            ],
            hints: [
              md`Add \`2: data = _v2_to_v3(data)\` to the \`match\`; the loop does the rest.`,
              md`Members are dictionaries inside \`data["party"]\`. Build a new array rather than modifying while iterating.`,
              md`Make \`SaveSystem.VERSION\` refer to the migrations: \`const VERSION := SaveMigrations.CURRENT\`, so the two can never disagree.`,
            ],
            solution: [
              {
                file: 'scripts/save_migrations.gd',
                code: gd`
class_name SaveMigrations
extends RefCounted
## Turns any older save Dictionary into the current format, one version at a time.

const CURRENT := 3


static func migrate(data: Dictionary) -> Dictionary:
    var version := int(data.get("version", 1))
    if version > CURRENT:
        push_error("Save version %d is newer than this game (%d)." % [version, CURRENT])
        return {}
    while version < CURRENT:
        match version:
            1:
                data = _v1_to_v2(data)
            2:
                data = _v2_to_v3(data)
        version += 1
        data["version"] = version
    return data


static func _v1_to_v2(old: Dictionary) -> Dictionary:
    var data := old.duplicate(true)
    var flags := {}
    for flag_name in old.get("flags", []):
        flags[flag_name] = 1
    data["flags"] = flags
    var opened := {}
    for id in old.get("chests", []):
        opened[id] = true
    data["opened"] = opened
    data["inventory"] = old.get("items", {})
    data["position"] = [old.get("x", 160), old.get("y", 96)]
    for key in ["chests", "items", "x", "y"]:
        data.erase(key)
    if not data.has("playtime"):
        data["playtime"] = 0.0
    return data


## Version 3: each member's single "weapon" becomes a "gear" dictionary with three slots.
static func _v2_to_v3(old: Dictionary) -> Dictionary:
    var data := old.duplicate(true)
    var party: Array = []
    for member in old.get("party", []):
        var m: Dictionary = member.duplicate(true)
        m["gear"] = {"weapon": m.get("weapon", ""), "armour": "", "accessory": ""}
        m.erase("weapon")
        party.append(m)
    data["party"] = party
    return data
`,
              },
            ],
            explain: md`The new step knows only versions 2 and 3; the chain takes care of version 1 by running \`_v1_to_v2\` first. Tying \`SaveSystem.VERSION\` to \`SaveMigrations.CURRENT\` prevents the classic mistake of writing version-3 data labelled as version 2, which would run the migration again on the next load.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'r06-3-paper',
            title: 'Pairwise or chained?',
            type: 'compute',
            difficulty: 1,
            minutes: 4,
            statement: md`By launch, Shardbound has save versions 1 to 7. With a migration chain you write one function per step. If you instead wrote a direct converter from every older version to the current one, and had to rewrite them all at every new version, how many converter functions would you have written in total by version 7? (Count the converters that exist for each current version 2, 3, …, 7 and add them up.)`,
            solution: [
              md`At current version $b$, direct converters exist from each of versions $1..b-1$: $b - 1$ functions.`,
              md`Summed over $b = 2..7$: $1 + 2 + 3 + 4 + 5 + 6 = 21$ functions, against 6 for the chain.`,
            ],
            answer: { kind: 'number', value: 21 },
          },
        },
        {
          kind: 'recall',
          prompt: md`What does \`SaveMigrations.migrate\` do with a save that has no version key, with one from a newer build, and with a current one?`,
          answer: md`No key: treat it as version 1 and run the whole chain. Newer than \`CURRENT\`: report an error and return \`{}\`, so the game refuses it. Current: the loop does nothing and the data comes back unchanged.`,
        },
        {
          kind: 'explain',
          prompt: md`Why should an autosave requested during a cutscene be postponed rather than skipped or taken immediately?`,
          model: md`Taken immediately, the save records the middle of a scripted sequence: loading it would start the game with the player locked, the camera elsewhere and the cutscene's once-flag not yet set, so the scene either replays from an odd point or never finishes. Skipped, the room change that requested it leaves no autosave at all, which is exactly the progress a crash would lose. Postponing until the last busy state ends gives a save at the first moment the world is consistent.`,
        },
      ],
      cards: [
        { id: 'r06-3-c1', kind: 'compute', front: md`Current save version 6, loading a version-2 save. How many migrations run?`, answer: { kind: 'number', value: 4 }, back: md`$6 - 2 = 4$: \`_v2_to_v3\` through \`_v5_to_v6\`.` },
        { id: 'r06-3-c2', kind: 'concept', front: md`Why keep migrations in a script with no autoload references?`, back: md`They become pure functions on dictionaries that a headless test (\`godot --headless --script\`) can run without the game's autoloads.` },
        { id: 'r06-3-c3', kind: 'compute', front: md`Rooms every 30 s, autosave interval 75 s. Seconds between autosaves?`, answer: { kind: 'number', value: 90 }, back: md`$30 \lceil 75/30 \rceil = 30 \times 3 = 90$ s.` },
        { id: 'r06-3-c4', kind: 'cloze', text: md`Run a test script without a window: \`godot --{{}} --script res://tests/test_save.gd\`.`, answers: ['headless'] },
        { id: 'r06-3-c5', kind: 'concept', front: md`When must an autosave never be written, and what happens to the request?`, back: md`During dialogue, cutscenes and battles; it is postponed and written as soon as the last of them ends.` },
      ],
    },
  ],

  // ------------------------------------------------------------------------------ problems
  problems: [
    {
      id: 'r06-p1',
      title: 'Play time on the slot',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`A save's \`playtime\` is 3725.4 seconds. What does \`format_playtime\` show? Enter it as h:mm:ss.`,
      solution: [md`$\lfloor 3725.4 \rfloor = 3725$ s. Hours: $3725 / 3600 = 1$ (integer division). Minutes: $(3725 / 60) \bmod 60 = 62 \bmod 60 = 2$. Seconds: $3725 \bmod 60 = 5$.`, md`\`"%d:%02d:%02d"\` gives \`1:02:05\`.`],
      answer: { kind: 'text', value: ['1:02:05'] },
      areas: ['systems'],
    },
    {
      id: 'r06-p2',
      title: 'Expected loss from a crash',
      type: 'compute',
      difficulty: 2,
      minutes: 5,
      statement: md`Rooms change every 45 s and the autosave interval is 60 s. A crash happens at a uniformly random moment. On average, how many seconds of play since the last autosave are lost?`,
      hints: [md`First find the gap $g$ between autosaves; a uniform moment within a gap is on average $g/2$ after its start.`],
      solution: [md`$g = 45 \lceil 60/45 \rceil = 45 \times 2 = 90$ s.`, md`The expected time since the last save is $g/2 = 45$ s.`],
      answer: { kind: 'number', value: 45 },
      areas: ['systems'],
    },
    {
      id: 'r06-p3',
      title: 'Migrations to write',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`The demo shipped with save version 2, early access will ship with version 6. How many migration functions must early access contain so that every demo save and every save from the internal versions 3 to 5 loads?`,
      solution: [md`The chain needs one function per step from the oldest supported version to the current one.`, md`From 2 to 6: $m_2, m_3, m_4, m_5$, so 4 functions (\`_v2_to_v3\` … \`_v5_to_v6\`). Version 1 was never public, so its migration can be dropped.`],
      answer: { kind: 'number', value: 4 },
      areas: ['systems', 'ship'],
    },
    {
      id: 'r06-p4',
      title: 'The vector that became a string',
      type: 'debug',
      difficulty: 2,
      minutes: 6,
      statement: md`Saving works, but loading crashes with "Invalid get index '0' (on base: 'String')":

\`\`\`gdscript
func to_dict() -> Dictionary:
	return {"room": room, "position": player_position, "gold": gold}

func from_dict(d: Dictionary) -> void:
	var p: Array = d.get("position", [0, 0])
	player_position = Vector2(p[0], p[1])
\`\`\`

Explain and fix.`,
      solution: [
        md`\`JSON.stringify\` cannot represent a \`Vector2\`, so it writes its string form: \`"position": "(96, 80)"\`. On load, \`d.get("position")\` is that string, and indexing a String with \`[0]\` as if it were an Array fails (the typed \`var p: Array\` assignment fails first in a debug build).`,
        md`Store the components: \`"position": [player_position.x, player_position.y]\`. Loading then gets an Array of floats and \`Vector2(p[0], p[1])\` works. Old saves with the string form need a migration (parse the string or fall back to the room's spawn point).`,
      ],
      rubric: [md`Identifies that JSON stringifies the Vector2`, md`Stores it as an array of numbers`, md`Mentions existing saves already written in the broken format`],
      areas: ['godot'],
    },
    {
      id: 'r06-p5',
      title: 'The chest that closed itself',
      type: 'debug',
      difficulty: 2,
      minutes: 6,
      statement: md`After a level-design pass, playtesters report that chests they had opened are closed again (and can be looted twice) when they load their saves. No code changed. What happened, and how do you prevent it?`,
      solution: [
        md`The chests' ids are derived from room name and node path. The level-design pass renamed or reorganised nodes (for example moving chests under a new \`Objects\` node), so the derived ids changed and no longer match the ids in the saves.`,
        md`Prevention: pin ids (\`persist_id\`) for objects already in tester or player hands, or add a migration that maps old ids to new ones. A cheap guard is an editor check (a \`@tool\` script or test) that lists all derived ids per room and compares them with the previous release's list.`,
      ],
      rubric: [md`Connects the bug to derived ids changing with node paths`, md`Gives pinning or an id migration as the fix`, md`Suggests a check that catches it before release`],
      areas: ['systems'],
    },
    {
      id: 'r06-p6',
      title: 'Design the save for the vertical slice',
      type: 'design',
      difficulty: 2,
      minutes: 12,
      statement: md`Write the version-2 save dictionary for Shardbound's vertical slice as an annotated JSON skeleton: top-level keys, the shape of each, and one comment per key on why it is saved (or a note on what you deliberately left out).`,
      solution: [
        md`\`version\`, \`meta\` {\`saved_at\`, \`room\`, \`playtime\`}; \`gold\`; \`inventory\` {item id: count}; \`flags\` {name: int}; \`opened\` {persistent id: true}; \`room\`; \`position\` [x, y]; \`playtime\`; \`party\` [{\`id\`, \`level\`, \`xp\`, \`hp\`, \`mp\`, \`gear\` {weapon, armour, accessory: ids}, \`shards\` [ids per socket], \`shard_ap\` {shard id: AP}}]; \`leader\` (which member the player controls).`,
        md`Left out: max HP/MP and stats (derived from level, gear, shards), quest log (derived from flags), enemy positions and room state other than \`opened\` (rebuilt on room load), ATB and stagger (battle-only), camera and HUD.`,
      ],
      rubric: [md`Every player choice and story fact is present`, md`Uses ids, not resources`, md`Derived and transient values are explicitly left out with reasons`, md`Has version and meta`],
      areas: ['systems'],
    },
    {
      id: 'r06-p7',
      title: 'Why not .tres saves?',
      type: 'concept',
      difficulty: 1,
      minutes: 4,
      statement: md`Explain in three sentences why Shardbound does not save with \`ResourceSaver\` and load with \`load()\`, even though it would save writing \`to_dict\`/\`from_dict\`.`,
      solution: [
        md`A \`.tres\` file can contain or reference a script, and loading it instantiates that script, so loading a file means trusting whoever wrote it.`,
        md`Save files are untrusted input: players share them, edit them, and sync them through the cloud. Plain data parsed by your own code (JSON, or \`get_var\` without objects) cannot run code, so the conversion functions are the price of safety.`,
      ],
      rubric: [md`Names script execution on load`, md`Explains why saves are untrusted`, md`Names a safe alternative`],
      areas: ['ship', 'godot'],
    },
    {
      id: 'r06-p8',
      title: 'A migration on paper',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 10,
      statement: md`Version 4 renames the flag \`herbs\` to \`moonherbs_found\` and merges two booleans \`met_elder\` and \`met_tomas\` into a counter \`villagers_met\` (0, 1 or 2). Write \`static func _v3_to_v4(old: Dictionary) -> Dictionary\`.`,
      solution: [
        md`Work on a copy and rebuild the flags:

\`\`\`gdscript
static func _v3_to_v4(old: Dictionary) -> Dictionary:
	var data := old.duplicate(true)
	var flags: Dictionary = data.get("flags", {})
	if flags.has("herbs"):
		flags["moonherbs_found"] = flags["herbs"]
		flags.erase("herbs")
	var met := 0
	for flag_name in ["met_elder", "met_tomas"]:
		if int(flags.get(flag_name, 0)) > 0:
			met += 1
		flags.erase(flag_name)
	flags["villagers_met"] = met
	data["flags"] = flags
	return data
\`\`\``,
        md`Then add \`3: data = _v3_to_v4(data)\` to the \`match\`, raise \`CURRENT\` to 4, update every dialogue condition that used the old names, and add a test with a version-3 save that has both villagers met.`,
      ],
      rubric: [md`Copies instead of mutating the input`, md`Renames without losing the value`, md`Counts the booleans correctly and removes them`, md`Mentions updating CURRENT, the match and content that uses the names`],
      areas: ['systems'],
    },
    {
      id: 'r06-p9',
      title: 'Autosaves per hour',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`Rooms change every 40 s and \`min_interval\` is 60 s. Ignoring checkpoints, how many room autosaves happen in an hour of play?`,
      solution: [md`$g = 40 \lceil 60/40 \rceil = 80$ s.`, md`$3600 / 80 = 45$ autosaves.`],
      answer: { kind: 'number', value: 45 },
      areas: ['systems'],
    },
  ],
};
