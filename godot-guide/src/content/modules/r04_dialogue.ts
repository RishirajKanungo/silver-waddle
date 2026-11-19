import { md, gd, type Module } from '../types';

// ------------------------------------------------------------------------------------ listings

const ELDER_V1_JSON = `{
	"start": "greet",
	"nodes": {
		"greet": {
			"speaker": "Elder Maren",
			"portrait": "res://resources/portraits/elder.tres",
			"text": "Kai. You are up early. The lanterns for the festival are still in their crates.",
			"next": "ask"
		},
		"ask": {
			"speaker": "Elder Maren",
			"portrait": "res://resources/portraits/elder.tres",
			"text": "Walk with me later? The north road has been quiet, and I do not like quiet.",
			"next": "end"
		}
	}
}
`;

const DIALOGUE_DATA = gd`
class_name DialogueData
extends RefCounted
## One conversation, loaded from a JSON file: the id of the first node and a
## dictionary of nodes keyed by id. Pure data: no UI, no game state.

var start := "start"
var nodes: Dictionary = {}


static func load_file(path: String) -> DialogueData:
    if not FileAccess.file_exists(path):
        push_error("Dialogue file not found: %s" % path)
        return null
    var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
    if not (parsed is Dictionary):
        push_error("Dialogue file is not a JSON object: %s" % path)
        return null
    var data := DialogueData.new()
    data.start = parsed.get("start", "start")
    data.nodes = parsed.get("nodes", {})
    return data


func get_node_data(id: String) -> Dictionary:
    return nodes.get(id, {})
`;

const BOX_V1 = gd`
class_name DialogueBox
extends CanvasLayer
## Shows one line at a time with a typewriter effect.
## "interact" while the line is typing shows all of it; "interact" again advances.

signal advanced

## Characters after which the text waits a little, like a speaker taking a breath.
const PAUSE_CHARS := ".,!?;:"

@export var chars_per_second := 40.0   ## typing speed
@export var punctuation_pause := 0.12  ## extra seconds after a PAUSE_CHARS character

var _typing := false
var _progress := 0.0     # characters revealed so far; fractional, so slow speeds work
var _pause_left := 0.0   # seconds left in a punctuation pause

@onready var panel: PanelContainer = %Panel
@onready var name_label: Label = %NameLabel
@onready var text_label: Label = %TextLabel
@onready var portrait: TextureRect = %Portrait
@onready var next_icon: TextureRect = %NextIcon


func _ready() -> void:
    panel.hide()


## Show a line and return when the reader advances past it: await box.say(...)
func say(speaker: String, line: String, face: Texture2D = null) -> void:
    panel.show()
    name_label.text = speaker
    portrait.texture = face
    portrait.visible = face != null
    text_label.text = line
    text_label.visible_characters = 0
    next_icon.hide()
    _progress = 0.0
    _pause_left = 0.0
    _typing = true
    await advanced


func close() -> void:
    panel.hide()


func _process(delta: float) -> void:
    if not _typing:
        return
    if _pause_left > 0.0:
        _pause_left -= delta
        return
    _progress += chars_per_second * delta
    var total := text_label.get_total_character_count()
    var shown := mini(int(_progress), total)
    if shown > text_label.visible_characters:
        text_label.visible_characters = shown
        if text_label.text[shown - 1] in PAUSE_CHARS:
            _pause_left = punctuation_pause
    if shown >= total:
        _finish_typing()


func _finish_typing() -> void:
    _typing = false
    text_label.visible_characters = -1  # -1 means "show everything"
    next_icon.show()


func _unhandled_input(event: InputEvent) -> void:
    if not panel.visible or not event.is_action_pressed("interact"):
        return
    # This press is ours: nothing else (the player, an NPC) should also react to it.
    get_viewport().set_input_as_handled()
    if _typing:
        _finish_typing()
    else:
        advanced.emit()
`;

const TEST_DIALOGUE = gd`
extends Node
## Plays three lines through the DialogueBox. Run this scene with F6.

const LINES := [
    ["Elder Maren", "Kai. You are up early."],
    ["Kai", "Couldn't sleep. The well was making that sound again, like someone humming under the water."],
    ["Elder Maren", "Then we should both be careful today. Come, help me with the lanterns."],
]

@onready var box: DialogueBox = $DialogueBox


func _ready() -> void:
    for line in LINES:
        await box.say(line[0], line[1])
    box.close()
`;

const TEST_DIALOGUE_JSON = gd`
extends Node
## Plays a JSON conversation node by node (straight lines only for now).

@export_file("*.json") var dialogue_path := "res://resources/dialogue/elder.json"

@onready var box: DialogueBox = $DialogueBox


func _ready() -> void:
    var data := DialogueData.load_file(dialogue_path)
    if data == null:
        return
    var id := data.start
    while id != "end" and id != "":
        var node := data.get_node_data(id)
        var face: Texture2D = null
        if node.has("portrait"):
            face = load(node["portrait"]) as Texture2D
        await box.say(node.get("speaker", ""), node.get("text", ""), face)
        id = node.get("next", "end")
    box.close()
`;

const EVENTS = gd`
extends Node
## Global signal bus (autoload "Events"). These are the signals the dialogue, quest
## and cutscene systems use; keep any signals other modules added.

signal dialogue_requested(path: String, start_id: String)
signal dialogue_started
signal dialogue_finished
signal flag_changed(flag: String, value: int)
signal quest_updated(quest_id: String)
signal cutscene_started
signal cutscene_ended
`;

const INTERACTABLE = gd`
class_name Interactable
extends Area2D
## Put this on anything the player can use: NPCs, chests, signs, doors.
## It sits on physics layer 7 ("interactable") and does not look for anything itself.

signal interacted(by: Node2D)

@export var prompt := "Talk"  ## text shown above the object while it is the current target

@onready var prompt_label: Label = get_node_or_null("Prompt")


func _ready() -> void:
    collision_layer = 1 << 6  # layer 7, "interactable"
    collision_mask = 0
    monitoring = false        # others detect us; we never need to detect them
    set_highlighted(false)


func set_highlighted(on: bool) -> void:
    if prompt_label:
        prompt_label.text = prompt
        prompt_label.visible = on


func interact(by: Node2D) -> void:
    interacted.emit(by)
`;

const INTERACTOR = gd`
class_name Interactor
extends Area2D
## Child of the player. Picks the closest Interactable in front of the player and uses
## it when "interact" is pressed. Disabled while a dialogue or a cutscene runs.

## cos of the half-angle of the cone in front of the player: 0.5 means 60° each side.
@export var facing_cos := 0.5

var target: Interactable = null
var enabled := true
var facing := Vector2.DOWN

@onready var body: CharacterBody2D = get_parent()


func _ready() -> void:
    collision_layer = 0
    collision_mask = 1 << 6  # look only at layer 7, "interactable"
    monitorable = false
    Events.dialogue_started.connect(func() -> void: enabled = false)
    Events.dialogue_finished.connect(func() -> void: enabled = true)


func _physics_process(_delta: float) -> void:
    if body.velocity.length() > 5.0:
        facing = body.velocity.normalized()
    var best: Interactable = _find_target() if enabled else null
    if best != target:
        if target:
            target.set_highlighted(false)
        target = best
        if target:
            target.set_highlighted(true)


func _find_target() -> Interactable:
    var best: Interactable = null
    var best_d2 := INF
    for area in get_overlapping_areas():
        if not (area is Interactable):
            continue
        var to_it: Vector2 = area.global_position - body.global_position
        if to_it.length() > 2.0 and facing.dot(to_it.normalized()) < facing_cos:
            continue  # behind or beside the player
        var d2 := to_it.length_squared()
        if d2 < best_d2:
            best_d2 = d2
            best = area as Interactable
    return best


func _unhandled_input(event: InputEvent) -> void:
    if enabled and target and event.is_action_pressed("interact"):
        get_viewport().set_input_as_handled()
        target.interact(body)
`;

const NPC = gd`
class_name Npc
extends Node2D
## A villager who talks. The conversation lives in a JSON file, not in this script.

@export_file("*.json") var dialogue_path := ""
@export var start_id := ""  ## empty: use the file's "start"

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D
@onready var interactable: Interactable = $Interactable


func _ready() -> void:
    interactable.interacted.connect(_on_interacted)
    sprite.play("idle_down")


func _on_interacted(by: Node2D) -> void:
    _face(by.global_position - global_position)
    Events.dialogue_requested.emit(dialogue_path, start_id)


func _face(dir: Vector2) -> void:
    if absf(dir.x) > absf(dir.y):
        sprite.play("idle_side")
        sprite.flip_h = dir.x < 0.0
    else:
        sprite.play("idle_up" if dir.y < 0.0 else "idle_down")
`;

const GAME_STATE_FLAGS = gd`
extends Node
## Autoload "GameState". This lesson adds story flags; r03 adds inventory and gold,
## r06 saves everything. A flag is a name with an int value: 0 (or missing) means
## "not yet", 1 means "happened", and larger values count things (herbs found).

var flags: Dictionary = {}


func get_flag(flag: String) -> int:
    return int(flags.get(flag, 0))


func set_flag(flag: String, value: int = 1) -> void:
    if get_flag(flag) == value:
        return  # no change, no signal
    flags[flag] = value
    Events.flag_changed.emit(flag, value)


func add_flag(flag: String, amount: int = 1) -> void:
    set_flag(flag, get_flag(flag) + amount)


## "herbs_started", "!herbs_returned" or "herbs>=3". Empty means always true.
func check(condition: String) -> bool:
    condition = condition.strip_edges()
    if condition.is_empty():
        return true
    if condition.begins_with("!"):
        return not check(condition.substr(1))
    if ">=" in condition:
        var parts := condition.split(">=")
        return get_flag(parts[0].strip_edges()) >= int(parts[1])
    return get_flag(condition) > 0
`;

const ELDER_JSON = `{
	"start": "router",
	"nodes": {
		"router": {
			"branch": [
				{ "if": "herbs_returned", "next": "thanks" },
				{ "if": "herbs_started", "next": "progress" }
			],
			"next": "greet"
		},
		"greet": {
			"speaker": "Elder Maren",
			"portrait": "res://resources/portraits/elder.tres",
			"text": "Kai. The moonherbs by the north road have wilted, and the festival is in three days.",
			"next": "ask"
		},
		"ask": {
			"speaker": "Elder Maren",
			"portrait": "res://resources/portraits/elder.tres",
			"text": "Bring me three fresh ones from past the bridge?",
			"choices": [
				{ "text": "I will.", "next": "accept" },
				{ "text": "Not now.", "next": "decline" }
			]
		},
		"accept": {
			"speaker": "Elder Maren",
			"portrait": "res://resources/portraits/elder.tres",
			"text": "Thank you. Mind the slimes near the water.",
			"set": ["herbs_started"],
			"next": "end"
		},
		"decline": {
			"speaker": "Elder Maren",
			"text": "Then come back when you can.",
			"next": "end"
		},
		"progress": {
			"speaker": "Elder Maren",
			"text": "Any luck with the moonherbs?",
			"choices": [
				{ "text": "Here they are.", "if": "herbs>=3", "next": "turn_in" },
				{ "text": "Still looking.", "next": "end" }
			]
		},
		"turn_in": {
			"speaker": "Elder Maren",
			"text": "Three, and fresh. The lanterns will burn blue this year.",
			"set": ["herbs_returned"],
			"next": "end"
		},
		"thanks": {
			"speaker": "Elder Maren",
			"text": "Go and enjoy the festival. You earned it.",
			"next": "end"
		}
	}
}
`;

const BOX_V2 = gd`
class_name DialogueBox
extends CanvasLayer
## Plays a conversation from a JSON file: lines with a typewriter effect, branches and
## choices gated by story flags, and effects that set flags.
## Listens to Events.dialogue_requested, so any NPC, sign or cutscene can start one.

signal advanced
signal chosen(next_id: String)

const PAUSE_CHARS := ".,!?;:"

@export var chars_per_second := 40.0
@export var punctuation_pause := 0.12

var _typing := false
var _progress := 0.0
var _pause_left := 0.0

@onready var panel: PanelContainer = %Panel
@onready var name_label: Label = %NameLabel
@onready var text_label: Label = %TextLabel
@onready var portrait: TextureRect = %Portrait
@onready var next_icon: TextureRect = %NextIcon
@onready var choices: VBoxContainer = %Choices


func _ready() -> void:
    panel.hide()
    choices.hide()
    Events.dialogue_requested.connect(play)


## Run a whole conversation. Reads like the conversation itself, thanks to await.
func play(path: String, start_id: String = "") -> void:
    var data := DialogueData.load_file(path)
    if data == null:
        return
    var id := start_id if start_id != "" else data.start
    Events.dialogue_started.emit()
    while id != "" and id != "end":
        var node := data.get_node_data(id)
        if node.is_empty():
            push_error("%s: no node named '%s'" % [path, id])
            break
        if node.has("branch"):
            id = _pick_branch(node)
            continue
        await say(node.get("speaker", ""), node.get("text", ""), _portrait(node))
        for flag in node.get("set", []):
            GameState.set_flag(flag)
        if node.has("choices"):
            id = await _ask(node["choices"])
        else:
            id = node.get("next", "end")
    close()
    Events.dialogue_finished.emit()


func say(speaker: String, line: String, face: Texture2D = null) -> void:
    panel.show()
    name_label.text = speaker
    portrait.texture = face
    portrait.visible = face != null
    text_label.text = line
    text_label.visible_characters = 0
    next_icon.hide()
    _progress = 0.0
    _pause_left = 0.0
    _typing = true
    await advanced


func close() -> void:
    panel.hide()
    choices.hide()


func _pick_branch(node: Dictionary) -> String:
    for option in node["branch"]:
        if GameState.check(option.get("if", "")):
            return option["next"]
    return node.get("next", "end")


func _ask(options: Array) -> String:
    for child in choices.get_children():
        child.queue_free()
    var first: Button = null
    for option in options:
        if not GameState.check(option.get("if", "")):
            continue  # a locked choice is not shown at all
        var next_id: String = option["next"]
        var button := Button.new()
        button.text = option["text"]
        button.pressed.connect(func() -> void: chosen.emit(next_id))
        choices.add_child(button)
        if first == null:
            first = button
    if first == null:
        return "end"
    next_icon.hide()
    choices.show()
    first.grab_focus()
    var picked: String = await chosen
    choices.hide()
    return picked


func _portrait(node: Dictionary) -> Texture2D:
    if not node.has("portrait"):
        return null
    return load(node["portrait"]) as Texture2D


func _process(delta: float) -> void:
    if not _typing:
        return
    if _pause_left > 0.0:
        _pause_left -= delta
        return
    _progress += chars_per_second * delta
    var total := text_label.get_total_character_count()
    var shown := mini(int(_progress), total)
    if shown > text_label.visible_characters:
        text_label.visible_characters = shown
        if text_label.text[shown - 1] in PAUSE_CHARS:
            _pause_left = punctuation_pause
    if shown >= total:
        _finish_typing()


func _finish_typing() -> void:
    _typing = false
    text_label.visible_characters = -1
    next_icon.show()


func _unhandled_input(event: InputEvent) -> void:
    if not panel.visible or choices.visible or not event.is_action_pressed("interact"):
        return
    get_viewport().set_input_as_handled()
    if _typing:
        _finish_typing()
    else:
        advanced.emit()
`;

const LOCK_FRAGMENT = gd`
# scripts/player_controller.gd (c05): add a lock that dialogue and cutscenes set.
var locked := false


func _ready() -> void:
    Events.dialogue_started.connect(_set_locked.bind(true))
    Events.dialogue_finished.connect(_set_locked.bind(false))
    Events.cutscene_started.connect(_set_locked.bind(true))
    Events.cutscene_ended.connect(_set_locked.bind(false))


func _set_locked(on: bool) -> void:
    locked = on
    if on:
        intent.move = Vector2.ZERO  # stop walking now, not when the lock ends
`;

const QUEST_STEP = gd`
class_name QuestStep
extends Resource
## One objective. Done when GameState's flag reaches the target value.

@export var description := ""  ## shown in the quest log, e.g. "Gather moonherbs"
@export var flag := ""         ## e.g. "herbs"
@export var target := 1        ## e.g. 3 for "gather 3"
`;

const QUEST_DATA = gd`
class_name QuestData
extends Resource
## A quest is data plus a rule: its state is computed from story flags, never stored.

@export var id := ""
@export var title := ""
@export_multiline var summary := ""
@export var start_flag := ""  ## the quest appears in the log once this flag is set
@export var steps: Array[QuestStep] = []


## -1: not started. 0..steps.size()-1: the current step. steps.size(): complete.
## Takes the flags as an argument so it can be tested without the autoload.
func current_step(flags: Dictionary) -> int:
    if int(flags.get(start_flag, 0)) <= 0:
        return -1
    for i in steps.size():
        if int(flags.get(steps[i].flag, 0)) < steps[i].target:
            return i
    return steps.size()


func is_complete(flags: Dictionary) -> bool:
    return current_step(flags) == steps.size()


## "Gather moonherbs (2/3)" for the current step, for the log and the toast.
func step_text(flags: Dictionary) -> String:
    var i := current_step(flags)
    if i < 0:
        return ""
    if i >= steps.size():
        return "Complete"
    var step := steps[i]
    if step.target <= 1:
        return step.description
    var have := mini(int(flags.get(step.flag, 0)), step.target)
    return "%s (%d/%d)" % [step.description, have, step.target]
`;

const GAME_STATE_QUESTS = gd`
extends Node
## Autoload "GameState": story flags, and the quests that are computed from them.

const QUESTS := [
    preload("res://resources/quests/moonherbs.tres"),
    preload("res://resources/quests/silent_well.tres"),
]

var flags: Dictionary = {}
var _quest_text: Dictionary = {}  # quest id -> step text last time we looked


func _ready() -> void:
    for quest: QuestData in QUESTS:
        _quest_text[quest.id] = quest.step_text(flags)


func get_flag(flag: String) -> int:
    return int(flags.get(flag, 0))


func set_flag(flag: String, value: int = 1) -> void:
    if get_flag(flag) == value:
        return
    flags[flag] = value
    Events.flag_changed.emit(flag, value)
    _refresh_quests()


func add_flag(flag: String, amount: int = 1) -> void:
    set_flag(flag, get_flag(flag) + amount)


func check(condition: String) -> bool:
    condition = condition.strip_edges()
    if condition.is_empty():
        return true
    if condition.begins_with("!"):
        return not check(condition.substr(1))
    if ">=" in condition:
        var parts := condition.split(">=")
        return get_flag(parts[0].strip_edges()) >= int(parts[1])
    return get_flag(condition) > 0


## Emit quest_updated only for quests whose visible progress changed:
## a new step, or a new count like (2/3). A fifth herb changes nothing visible.
func _refresh_quests() -> void:
    for quest: QuestData in QUESTS:
        var now := quest.step_text(flags)
        if now != _quest_text.get(quest.id, ""):
            _quest_text[quest.id] = now
            Events.quest_updated.emit(quest.id)


func quest_by_id(id: String) -> QuestData:
    for quest: QuestData in QUESTS:
        if quest.id == id:
            return quest
    return null
`;

const QUEST_TOAST = gd`
extends Label
## ui/quest_toast.gd: a Label in the HUD that shows "Moonherbs: Gather moonherbs (2/3)"
## for two seconds whenever a quest changes.

var _tween: Tween


func _ready() -> void:
    modulate.a = 0.0
    Events.quest_updated.connect(_on_quest_updated)


func _on_quest_updated(quest_id: String) -> void:
    var quest := GameState.quest_by_id(quest_id)
    if quest == null:
        return
    text = "%s: %s" % [quest.title, quest.step_text(GameState.flags)]
    if _tween:
        _tween.kill()  # a new update restarts the toast instead of fighting the old one
    _tween = create_tween()
    _tween.tween_property(self, "modulate:a", 1.0, 0.15)
    _tween.tween_interval(2.0)
    _tween.tween_property(self, "modulate:a", 0.0, 0.4)
`;

const HERB = gd`
extends Node2D
## A moonherb you can pick. Counts toward the "herbs" flag and remembers that it is gone.

@export var persist_id := ""  ## unique per herb, e.g. "north_road/herb_1" (r06 explains why)

@onready var interactable: Interactable = $Interactable


func _ready() -> void:
    if GameState.get_flag("picked:" + persist_id) > 0:
        queue_free()
        return
    interactable.interacted.connect(_on_interacted)


func _on_interacted(_by: Node2D) -> void:
    GameState.set_flag("picked:" + persist_id)
    GameState.add_flag("herbs")
    queue_free()
`;

const CUTSCENE = gd`
class_name Cutscene
extends Node
## Plays one AnimationPlayer animation as a cutscene: locks the player, switches to a
## cutscene camera, waits for dialogue started from method-track keys, and plays
## only once if once_flag is set.

@export var anim: AnimationPlayer
@export var animation_name: StringName = &"elder_arrives"
@export var camera: Camera2D           ## the camera the animation moves
@export var once_flag := ""            ## e.g. "seen_elder_arrives"; empty plays every time

var playing := false


func play() -> void:
    if playing or (once_flag != "" and GameState.get_flag(once_flag) > 0):
        return
    playing = true
    var player_camera := get_viewport().get_camera_2d()
    camera.global_position = player_camera.get_screen_center_position()
    camera.make_current()
    Events.cutscene_started.emit()
    anim.play(animation_name)
    await anim.animation_finished
    # glide back to where the player's camera is looking, then hand control back
    var back := create_tween()
    back.tween_property(camera, "global_position", player_camera.get_screen_center_position(), 0.5)\
        .set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
    await back.finished
    player_camera.make_current()
    if once_flag != "":
        GameState.set_flag(once_flag)
    playing = false
    Events.cutscene_ended.emit()


## Called from a method-track key. Pauses the animation until the dialogue closes.
func say(path: String, start_id: String) -> void:
    anim.pause()
    Events.dialogue_requested.emit(path, start_id)
    await Events.dialogue_finished
    anim.play()  # no name: resume the paused animation where it stopped
`;

const CUTSCENE_TRIGGER = gd`
extends Area2D
## Starts a cutscene when the player walks in. Mask: layer 2 ("player").

@export var cutscene: Cutscene


func _ready() -> void:
    collision_layer = 0
    collision_mask = 1 << 1
    body_entered.connect(_on_body_entered)


func _on_body_entered(_body: Node2D) -> void:
    set_deferred("monitoring", false)  # never fire twice, even within one frame
    cutscene.play()
`;

// ---------------------------------------------------------------------------------- module

export const MODULE: Module = {
  id: 'r04',
  part: 'rpg',
  order: 4,
  title: 'Dialogue, quests and cutscenes',
  summary: 'Conversations as data with a typewriter dialogue box, NPCs you can talk to, branches and choices gated by story flags, quests computed from those flags, and cutscenes driven by AnimationPlayer.',
  relevance: md`Shardbound's town, its quests and its story beats all run on three small systems built here. The dialogue box and the JSON conversation format carry every line an NPC says. Story flags in \`GameState\` record what has happened (a quest accepted, three moonherbs picked, a cutscene seen), and the quest log is computed from them, so r06 can save the whole story by saving one dictionary. The cutscene player reuses the same dialogue box and locks the player through the same \`Events\` signals, so the elder walking into the square before the first dungeon is a few keyframes, not new code.`,
  prereqs: ['g03', 'g04'],
  areas: ['systems', 'godot', 'art'],
  lessons: [
    // ======================================================================== r04-1
    {
      id: 'r04-1',
      title: 'Dialogue as data and the dialogue box',
      minutes: 40,
      objectives: [
        'Choose where dialogue text lives (script, Resource, JSON, addon) and explain the trade-offs.',
        'Build a dialogue box scene on a CanvasLayer with a portrait, a name and a text Label.',
        'Type text out with `visible_characters`, with a punctuation pause, and compute how long a line takes: $T = n / c + k\\,p$.',
        'Make one button both skip the typing and advance, without one press doing both.',
        'Load a conversation from JSON and play it node by node with `await`.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`An RPG says most of what it has to say through a box at the bottom of the screen. The player walks up to the elder, presses a button, and the text appears letter by letter next to her portrait. Another press shows the rest of the line at once; a third moves on. It looks simple, and players notice immediately when it is wrong: a press that skips two lines, a word that starts on one line and jumps to the next while it types, a line that cannot be hurried.

Two separate problems hide in that box:

- **Where the words live.** A town with ten NPCs has hundreds of lines. They change constantly while you write the game, and someone may translate them later. They should not be buried in scripts.
- **How the words are shown.** The typewriter effect, skipping, advancing, the portrait and the name.

This lesson solves the second problem first, then loads conversations from data files. Lesson 2 adds choices and story flags.`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'Where dialogue text should live',
          md: md`Four common options, from least to most structured:

| Option | Good at | Weak at |
|---|---|---|
| Strings in scripts | a prototype with five lines | everything after that: editing text means editing code |
| A custom \`Resource\` per conversation | editor integration, typed fields, drag-and-drop portraits | writing long conversations in Inspector fields is slow |
| A JSON file per conversation | fast to write in any text editor, diffs well in git, easy to validate with a script | no editor UI; typos in ids fail at runtime unless you check them |
| An addon (Dialogic, Dialogue Manager) | a full editor or scripting language, translation tooling | another system to learn and keep updated |

Shardbound uses **JSON files** with a small runner you write yourself. The format stays small enough to understand completely, conversations are plain text you can read in a diff, and lesson 2 shows the same structure works for branches. Lesson 2 ends with when to switch to an addon.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'visible_characters and visible_ratio',
          md: md`\`Label\` and \`RichTextLabel\` lay out their whole \`text\` and then draw only part of it. \`visible_characters\` is how many characters are drawn (\`-1\` means all of them) and \`visible_ratio\` is the same thing as a fraction from 0 to 1. \`get_total_character_count()\` returns the number of characters that can be revealed.

Because the full text is laid out first, word wrapping is decided once. Each word is already on its final line before its first letter appears. If you instead set \`text\` to a growing substring, the Label re-wraps every frame, and a long word typed at the end of a line jumps to the next line halfway through.`,
        },
        {
          kind: 'assets',
          ids: ['ui_panel', 'ui_cursor', 'font_pixel', 'villager'],
          note: md`The panel is a 24×24 nine-slice with 8 px corners (r05 explains nine-slices in depth; here you only need its margins). The cursor doubles as the "more text" indicator. The portrait is a region of the villager sheet, cut out with an \`AtlasTexture\`.`,
        },
        {
          kind: 'viz',
          viz: { type: 'rpg.dialogue', mode: 'box' },
          task: md`Click the figure and press **F** (or Enter) to advance. Press F while a line is still typing to show it all at once. Then switch **reveal by** to *substring* and watch the word "unbearably" in the second line: it starts at the end of one line and jumps to the next. Finally set the speed to 15 characters per second and the pause to 0.3 s, and compare the measured time with $T = n/c + k\,p$ in the readout.`,
          caption: md`The readout mirrors the script below: \`_progress\` grows by \`chars_per_second × delta\` each frame, \`visible_characters\` is its integer part, and a punctuation character starts a pause. At 40 characters per second and 60 frames per second, a new character appears on two frames out of every three.`,
        },
        {
          kind: 'derive',
          title: 'how long a line takes to type',
          goal: md`A line has $n$ characters, $k$ of which are pause characters (\`.,!?;:\`). The box types $c$ characters per second and waits $p$ seconds after each pause character. Find the time $T$ until the line is complete.`,
          steps: [
            {
              md: md`Without pauses, \`_progress\` grows by $c\,\Delta t$ each frame, so it grows by $c$ per second. It reaches $n$ after $n / c$ seconds.`,
              choose: {
                prompt: md`Why accumulate a fractional \`_progress\` instead of adding a whole character each frame?`,
                options: [md`So the speed in characters per second does not depend on the frame rate, and speeds below 60 per second work`, md`Because \`visible_characters\` is a float`, md`To make the text type faster on fast computers`],
                answer: 0,
                explain: md`One character per frame would be 60 characters per second at 60 fps and 144 at 144 fps. Accumulating $c\,\Delta t$ and taking the integer part gives $c$ per second at any frame rate.`,
              },
            },
            {
              md: md`During a pause \`_progress\` does not grow at all: the \`_process\` function returns early. Each pause character therefore adds exactly $p$ seconds, and there are $k$ of them: $$T = \frac{n}{c} + k\,p.$$`,
            },
            {
              md: md`Per frame, the box reveals $c / 60$ characters on average at 60 fps. At $c = 40$ that is $0.67$: two frames out of three show a new character. Above $c = 60$ some frames reveal two characters at once, and the check \`text[shown - 1]\` only looks at the last one, so a pause character can be skipped.`,
              choose: {
                prompt: md`At $c = 90$ characters per second and 60 fps, how many characters appear per frame on average?`,
                options: [md`1.5`, md`0.67`, md`90`],
                answer: 0,
                explain: md`$90 / 60 = 1.5$. Frames alternate between revealing one and two characters, which is why the script's pause check is only reliable up to 60 characters per second.`,
              },
            },
          ],
          takeaway: md`A 120-character line at 40 characters per second with four pauses of 0.12 s takes $3 + 0.48 = 3.48$ s. That is long enough that players will want to skip it, which is why the skip press matters as much as the speed.`,
        },
        {
          kind: 'numeric',
          q: md`A line has 90 characters and no pause characters before character 36. The box types 30 characters per second. What is \`visible_ratio\` after 1.2 seconds?`,
          answer: { kind: 'number', value: 0.4 },
          explain: md`After 1.2 s, \`_progress\` $= 30 \times 1.2 = 36$, so 36 of 90 characters are visible: $36/90 = 0.4$.`,
        },
        {
          kind: 'steps',
          title: 'Build the dialogue box scene',
          steps: [
            md`Create a new scene (**Scene → New Scene**) with a \`CanvasLayer\` root named \`DialogueBox\` and set its *Layer* to 10, so it draws above the game and the HUD. Save it as \`ui/dialogue_box.tscn\`.`,
            md`Add a \`PanelContainer\` child named \`Panel\`. In the toolbar's anchor menu (the green cross icon) pick **Bottom Wide**, then set *Layout → Custom Minimum Size* y to 56 and the side and bottom offsets to 4 px, so the box sits 4 px from the screen edges. Under *Theme Overrides → Styles → Panel* create a **New StyleBoxTexture**, set its *Texture* to \`assets/ui/panel.png\`, all four *Texture Margins* to 8 and all four *Content Margins* to 6.`,
            md`Inside \`Panel\` add an \`HBoxContainer\` with *Theme Overrides → Constants → Separation* 6. In it add a \`TextureRect\` named \`Portrait\` (*Custom Minimum Size* 32×32, *Expand Mode* **Ignore Size**, *Stretch Mode* **Keep Centered**) and a \`VBoxContainer\` with *Size Flags → Horizontal* set to **Expand** and **Fill**.`,
            md`Inside the \`VBoxContainer\` add a \`Label\` named \`NameLabel\` and a \`Label\` named \`TextLabel\`. On \`TextLabel\` set *Autowrap Mode* to **Word (Smart)** and *Size Flags → Vertical* to **Expand**. Give both labels the pixel font (\`assets/ui/font_pixel.png\` imported as an image font) at size 8.`,
            md`Add a \`TextureRect\` named \`NextIcon\` inside the \`VBoxContainer\`, below \`TextLabel\`, with the texture \`assets/ui/cursor.png\` and *Size Flags → Horizontal* set to **Shrink End**, so it sits at the bottom right of the text. Containers decide where their children go, which is why you place it with size flags instead of dragging it.`,
            md`Select \`Panel\`, \`NameLabel\`, \`TextLabel\`, \`Portrait\` and \`NextIcon\` one at a time, right-click each and choose **Access as Unique Name**. A \`%\` appears next to each name. The script can now find them with \`%Panel\` wherever they sit in the tree.`,
            md`Attach \`ui/dialogue_box.gd\` (the listing below) to the root. Then make a test scene \`scenes/test_dialogue.tscn\`: a \`Node\` root with the script from the build challenge, and an instance of \`dialogue_box.tscn\` as a child. Run it with **F6**.`,
          ],
          result: md`A panel along the bottom of the 320×180 screen types "Kai. You are up early." letter by letter, with a short stop after the full stop. Pressing your \`interact\` key while it types shows the whole line; pressing it again moves to the next line. After the last line the box disappears.`,
          troubleshoot: [
            { problem: md`Errors like "Node not found: %Panel".`, fix: md`The node is not marked **Access as Unique Name**, or its name differs in case. Unique names only work for nodes inside the same scene as the script.` },
            { problem: md`The text is blurry or the letters have uneven widths.`, fix: md`The font is drawn at a size that is not its native size (8) or an integer multiple, or texture filtering is not *Nearest*. r05 sets up a project-wide theme that fixes this once.` },
            { problem: md`One press skips a whole line instead of finishing it.`, fix: md`Another node also reacts to \`interact\` in \`_process\` with \`Input.is_action_just_pressed\`. Handle the press in \`_unhandled_input\` and call \`get_viewport().set_input_as_handled()\`, as the listing does, so only one node uses each press.` },
          ],
        },
        {
          kind: 'code',
          file: 'ui/dialogue_box.gd',
          code: BOX_V1,
          note: md`\`say()\` ends with \`await advanced\`, so calling \`await box.say(...)\` pauses the caller until the reader has finished that line. A conversation then reads as a plain loop. \`_unhandled_input\` receives input only after the GUI and \`_input\` have had their chance, which is the right place for gameplay buttons.`,
        },
        {
          kind: 'check',
          q: md`The player presses \`interact\` once while a line is half typed. With the script above, what happens?

\`\`\`gdscript
if _typing:
	_finish_typing()
else:
	advanced.emit()
\`\`\``,
          options: [
            md`The rest of the line appears and the box waits for another press.`,
            md`The line finishes and the next line starts, because both branches run.`,
            md`Nothing, because \`interact\` is ignored while typing.`,
            md`The box closes.`,
          ],
          answer: 0,
          explain: md`Only one branch runs per press. \`_finish_typing()\` sets \`_typing = false\` and shows the "more" icon, so the *next* press takes the \`else\` branch and advances. Two separate presses for "show all" and "next" are what keep a fast reader from skipping a line they never saw.`,
        },
        {
          kind: 'text',
          md: md`### Conversations in JSON

A conversation is a set of **nodes** keyed by id. Each node has a speaker, an optional portrait, the text, and the id of the next node; \`"end"\` finishes the conversation. Lesson 2 adds branches and choices to the same structure, which is why it is a dictionary of named nodes rather than a plain list of lines: choices need somewhere to jump to.

Save this as \`resources/dialogue/elder.json\`. The portrait path points to an \`AtlasTexture\` resource: create one with **FileSystem → right-click → New Resource… → AtlasTexture**, set its *Atlas* to the villager sheet and its *Region* to the head of the first \`idle_down\` frame.`,
        },
        { kind: 'code', file: 'resources/dialogue/elder.json', lang: 'text', code: ELDER_V1_JSON },
        {
          kind: 'code',
          file: 'scripts/dialogue_data.gd',
          code: DIALOGUE_DATA,
          note: md`\`JSON.parse_string\` returns \`null\` when the text is not valid JSON, so the result is checked with \`is Dictionary\` before use. Keeping \`DialogueData\` free of UI and game state means you can load and check every conversation from a test script.`,
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'JSON files are not exported by default',
          md: md`Godot exports resources it knows (scenes, \`.tres\`, textures) and skips other files. A game that loads \`res://resources/dialogue/elder.json\` works in the editor and finds nothing in the exported build. In **Project → Export…**, select your preset, open the **Resources** tab and add \`*.json\` to *Filters to export non-resource files/folders*. Do it the day you add the first JSON file.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'r04-1-build',
            title: 'The elder speaks from a file',
            goal: md`Play \`elder.json\` through your dialogue box, with her portrait, from a test scene.`,
            requirements: [
              md`Running the test scene types the elder's two lines one after the other, with her name and portrait.`,
              md`One press while typing shows the full line; the next press advances. A single press never skips an unseen line.`,
              md`Words never jump from one line to the next while typing.`,
              md`Changing a line in \`elder.json\` and running again shows the new text without touching any script.`,
              md`A typo in a \`next\` id prints an error in the Output panel instead of failing silently.`,
            ],
            hints: [
              md`Start from the three-line test in the first solution file, then replace the constant with a loop over \`DialogueData\` nodes.`,
              md`Load the portrait with \`load(path) as Texture2D\`; \`null\` hides the \`TextureRect\`.`,
              md`For the typo check: \`get_node_data\` returns an empty dictionary for an unknown id. Test \`node.is_empty()\` and \`push_error\` the id.`,
            ],
            solution: [
              { file: 'scenes/test_dialogue.gd', code: TEST_DIALOGUE },
              { file: 'scenes/test_dialogue_json.gd', code: TEST_DIALOGUE_JSON },
            ],
            explain: md`The loop is the whole conversation runner: fetch a node, \`await\` the box, follow \`next\`. Because \`say()\` returns only when the reader advances, there is no state machine for "waiting for input"; the paused function *is* that state. The unknown-id check is left as the hint describes; lesson 2's runner includes it.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'r04-1-paper',
            title: 'A speed for the whole game',
            type: 'compute',
            difficulty: 1,
            minutes: 5,
            statement: md`Your longest line has 150 characters including 6 pause characters. You want it to finish typing in at most 4 seconds with a punctuation pause of 0.1 s. What is the slowest typing speed, in characters per second, that meets this?`,
            hints: [md`$T = n/c + k\,p \le 4$; solve for $c$.`],
            solution: [
              md`Pauses take $k\,p = 6 \times 0.1 = 0.6$ s, leaving $4 - 0.6 = 3.4$ s for typing.`,
              md`$150 / c \le 3.4 \iff c \ge 150 / 3.4 \approx 44.1$ characters per second.`,
            ],
            answer: { kind: 'number', value: 150 / 3.4 },
          },
        },
        {
          kind: 'recall',
          prompt: md`What do \`visible_characters = -1\` and \`get_total_character_count()\` do, and why is revealing text this way better than growing a substring?`,
          answer: md`\`-1\` shows every character. \`get_total_character_count()\` is the number of revealable characters. The Label lays out the full text once, so word wrapping is fixed before typing starts and words never jump between lines.`,
        },
        {
          kind: 'explain',
          prompt: md`Why does \`say()\` end with \`await advanced\` instead of returning immediately and letting the caller poll a "finished" variable?`,
          model: md`With \`await\`, the caller's function pauses at \`await box.say(...)\` and resumes when the reader advances. A conversation becomes a loop that reads top to bottom, and branches later are ordinary \`if\` statements. Polling would need a state variable ("which line am I on, am I waiting") checked every frame in \`_process\`, which is exactly the state machine the coroutine keeps for you.`,
        },
      ],
      cards: [
        { id: 'r04-1-c1', kind: 'cloze', text: md`\`label.{{}} = 0\` hides all characters of a Label while keeping its layout; \`-1\` shows all of them.`, answers: ['visible_characters'] },
        { id: 'r04-1-c2', kind: 'compute', front: md`A 100-character line with 4 pause characters types at 50 characters per second with a 0.25 s pause. Seconds until complete?`, answer: { kind: 'number', value: 3 }, back: md`$100/50 + 4 \times 0.25 = 2 + 1 = 3$ s.` },
        { id: 'r04-1-c3', kind: 'concept', front: md`Why should the same \`interact\` press never both finish the typing and advance?`, back: md`A fast reader presses once to see the line; if that press also advanced, they would skip a line they never read. Finish on one press, advance on the next.` },
        { id: 'r04-1-c4', kind: 'concept', front: md`Why must \`*.json\` be added to the export filter?`, back: md`Godot exports only files it recognises as resources. Without the filter, JSON dialogue works in the editor and is missing from the exported game.` },
        { id: 'r04-1-c5', kind: 'cloze', text: md`Gameplay buttons belong in \`{{}}\`, which runs after the GUI; call \`get_viewport().set_input_as_handled()\` once you use the event.`, answers: ['_unhandled_input'] },
      ],
    },

    // ======================================================================== r04-2
    {
      id: 'r04-2',
      title: 'NPCs, branches and story flags',
      minutes: 45,
      objectives: [
        'Detect what the player can talk to with Area2Ds on the `interactable` layer and a facing test $\\hat f \\cdot \\hat d \\ge \\cos\\theta$.',
        'Store what has happened as story flags in `GameState` and evaluate conditions like `herbs>=3`.',
        'Branch a conversation on flags and offer choices that only appear when their condition holds.',
        'Run whole conversations from any NPC through `Events.dialogue_requested`, and lock the player meanwhile.',
        'Decide when a dialogue addon such as Dialogic or Dialogue Manager is the better tool.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`The elder should not say the same thing forever. Before you accept her request she asks for help; afterwards she asks how it is going; once you bring three moonherbs she thanks you. The conversation depends on **what has happened**, and "what has happened" is the most important state an RPG keeps.

This lesson builds three things:

1. **Interaction.** The player walks up to someone, a prompt appears, and \`interact\` starts the conversation.
2. **Story flags.** A dictionary of named integers in \`GameState\`: \`herbs_started = 1\`, \`herbs = 2\`. Conversations read flags to choose a branch and set flags as effects.
3. **The full runner.** The JSON format from lesson 1 gains \`branch\` nodes, \`choices\` with conditions, and \`set\` effects.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Story flag',
          md: md`A **story flag** is a named integer that records progress: \`0\` (or missing) means it has not happened, \`1\` means it has, and larger values count things. A **condition** is a short string tested against the flags: \`"herbs_started"\` (flag above 0), \`"!herbs_returned"\` (flag is 0) or \`"herbs>=3"\`. Flags are plain data, so saving the story (r06) is saving one dictionary.`,
        },
        {
          kind: 'text',
          md: md`### Interaction: who is the player talking to?

Every usable thing (NPC, chest, sign, door) gets an **Interactable**: an \`Area2D\` on physics layer 7, \`interactable\`. The player carries an **Interactor**, an \`Area2D\` whose mask looks only at layer 7. When several interactables overlap the player's area, the player means the one *in front* of them, and of those, the closest.

"In front" is a dot product. With the facing direction $\hat f$ (unit length) and the unit direction to the object $\hat d$, $\hat f \cdot \hat d = \cos\alpha$ where $\alpha$ is the angle between them. The object is in front when $\alpha \le \theta$, the half-angle of a cone; for a 60° half-angle the test is $\hat f \cdot \hat d \ge 0.5$.`,
        },
        {
          kind: 'derive',
          title: 'the facing test',
          goal: md`Turn "the object is within $\theta$ of where the player faces" into a test with no trigonometry per frame.`,
          steps: [
            { md: md`For unit vectors, $\hat f \cdot \hat d = |\hat f|\,|\hat d| \cos\alpha = \cos\alpha$, where $\alpha \in [0°, 180°]$ is the angle between them.` },
            {
              md: md`Cosine decreases from 1 to $-1$ on $[0°, 180°]$, so $\alpha \le \theta \iff \cos\alpha \ge \cos\theta$. The test is $\hat f \cdot \hat d \ge \cos\theta$, and $\cos\theta$ is a constant you compute once (\`facing_cos\`).`,
              choose: {
                prompt: md`Why does the inequality flip direction when you replace angles by cosines?`,
                options: [md`Cosine is decreasing on $[0°, 180°]$: a smaller angle has a larger cosine`, md`Because the dot product can be negative`, md`It does not flip`],
                answer: 0,
                explain: md`$\cos 30° \approx 0.87 > \cos 60° = 0.5$. A smaller angle means a larger cosine, so "angle at most θ" becomes "cosine at least cos θ".`,
              },
            },
            {
              md: md`$\hat d$ needs a length: if the object stands exactly on the player, \`normalized()\` of a zero vector is zero and the dot product is 0. The listing skips the facing test when the object is closer than 2 px, so something you are standing on is always usable.`,
              choose: {
                prompt: md`The player faces right, $\hat f = (1, 0)$. A sign is at offset $(6, 8)$ px. With \`facing_cos = 0.5\`, is it a valid target?`,
                options: [md`Yes: $\hat f \cdot \hat d = 6/10 = 0.6 \ge 0.5$`, md`No: $\hat f \cdot \hat d = 0.6 < 0.8$`, md`No: it is below the player, not to the right`],
                answer: 0,
                explain: md`$|(6, 8)| = 10$, so $\hat d = (0.6, 0.8)$ and $\hat f \cdot \hat d = 0.6$. The angle is about 53°, inside the 60° cone.`,
              },
            },
          ],
          takeaway: md`Wider cones (\`facing_cos\` 0.3) forgive sloppy positioning; narrower ones (0.7) let you pick between two NPCs standing close together. 0.5 is a good start for 16×16 tiles.`,
        },
        {
          kind: 'code',
          file: 'scenes/components/interactable.gd',
          code: INTERACTABLE,
          note: md`Layer numbers in the editor start at 1, bits start at 0: layer 7 is \`1 << 6 = 64\`. \`monitoring = false\` means this area does not track overlaps itself; it is still \`monitorable\`, so the player's area can detect it.`,
        },
        {
          kind: 'code',
          file: 'scenes/components/interactor.gd',
          code: INTERACTOR,
          note: md`The facing direction comes from the body's velocity, so the component works on c02's \`Player\` and on c05's \`Character\` without knowing either. The highlight changes only when the target changes, so the prompt label is not touched every frame.`,
        },
        {
          kind: 'numeric',
          q: md`The player's \`Interactor\` must detect layer 7 (\`interactable\`) and layer 8 (\`pickup\`). What integer is \`collision_mask\`?`,
          answer: { kind: 'number', value: 192 },
          explain: md`Layer $n$ is bit $n-1$: layer 7 is $2^6 = 64$ and layer 8 is $2^7 = 128$. $64 + 128 = 192$.`,
        },
        {
          kind: 'text',
          md: md`### Flags and conditions

Add the flag functions to the \`GameState\` autoload. \`set_flag\` emits \`Events.flag_changed\` only when the value actually changes, so listeners (the quest log in lesson 3, the HUD) never react to a non-event. Flag names are \`String\`s everywhere, because r06 writes them to JSON and reads them back as \`String\` keys; one key type avoids two entries for the same flag.`,
        },
        { kind: 'code', file: 'scripts/autoload/events.gd', code: EVENTS, note: md`If c04 or k-modules already added signals to \`Events\`, keep them and add these.` },
        { kind: 'code', file: 'scripts/autoload/game_state.gd', code: GAME_STATE_FLAGS },
        {
          kind: 'check',
          q: md`With \`flags = {"herbs_started": 1, "herbs": 2}\`, which conditions are true?

\`\`\`gdscript
GameState.check("herbs_started")
GameState.check("!herbs_returned")
GameState.check("herbs>=3")
\`\`\``,
          options: [md`The first two`, md`All three`, md`Only the first`, md`Only the third`],
          answer: 0,
          explain: md`\`herbs_started\` is 1 (true). \`herbs_returned\` is missing, so \`get_flag\` returns 0 and the negation is true. \`herbs\` is 2, which is not $\ge 3$.`,
        },
        {
          kind: 'text',
          md: md`### Branches, choices and effects

Three additions to the JSON format cover nearly every conversation in Shardbound:

- A **branch** node has no text. It lists \`{ "if": condition, "next": id }\` options; the runner takes the first whose condition holds, or the node's \`next\` if none do. Put one at the start to route by progress.
- A line can have **choices** instead of \`next\`. Each choice has text, a \`next\` and an optional \`if\`. A choice whose condition fails is not shown.
- A line can have **effects**: \`"set": ["herbs_started"]\` sets those flags to 1 once the reader advances past the line.

Here is the elder's whole conversation. The figure below draws it as a graph.`,
        },
        { kind: 'code', file: 'resources/dialogue/elder.json', lang: 'text', code: ELDER_JSON },
        {
          kind: 'viz',
          viz: { type: 'rpg.dialogue', mode: 'graph' },
          task: md`Press **F** to talk to the elder and accept her request: watch \`herbs_started\` switch on when the "accept" line finishes. Talk again and notice the router now takes a different branch. Drag **herbs** to 3 and talk once more: the "Here they are." choice appears. Turn on **show locked choices** to see what the player would see if you greyed choices out instead of hiding them.`,
          caption: md`Green edges are the path taken in this conversation. The router node is a \`branch\`: it is never shown, it only picks where to go. Effects (\`set\`) apply after the line is read, so leaving mid-line does not accept a quest.`,
        },
        {
          kind: 'code',
          file: 'ui/dialogue_box.gd',
          code: BOX_V2,
          note: md`\`play()\` reads like the flowchart: get the node, route branches, show the line, apply effects, ask or follow \`next\`. The choice buttons are plain \`Button\`s; r05's theme styles them and makes them work with a gamepad. Each lambda captures its own \`next_id\` because GDScript lambdas copy local variables when they are created.`,
        },
        {
          kind: 'code',
          file: 'scripts/npc.gd',
          code: NPC,
          note: md`The NPC knows nothing about the dialogue box: it emits \`Events.dialogue_requested\` and the box, wherever it is in the scene tree, plays the conversation.`,
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Lock the player while people talk',
          md: md`Without a lock, the press that advances the dialogue can also swing Kai's sword, and the arrow keys walk him away mid-sentence. Dialogue emits \`dialogue_started\`/\`dialogue_finished\` and the player controller listens. Clear the movement intent when locking: a body that keeps its last intent keeps walking.`,
        },
        { kind: 'code', file: 'scripts/player_controller.gd', code: LOCK_FRAGMENT, fragment: true },
        {
          kind: 'steps',
          title: 'Put the elder in the village',
          steps: [
            md`Open *Project → Project Settings → Layer Names → 2D Physics* and check that layer 7 is named \`interactable\`.`,
            md`Make \`scenes/components/interactable.tscn\`: an \`Area2D\` root with the \`interactable.gd\` script, a \`CollisionShape2D\` (CircleShape2D, radius 10) and a \`Label\` named \`Prompt\` at position (-16, -36) with the text "Talk".`,
            md`Make \`scenes/npc.tscn\`: a \`Node2D\` root with \`npc.gd\`, an \`AnimatedSprite2D\` using the villager sheet (feet on the origin, as in c02), a \`StaticBody2D\` with a 10×6 feet collider on the \`world\` layer so the player cannot walk through, and an instance of \`interactable.tscn\`.`,
            md`In the player scene add an \`Area2D\` named \`Interactor\` with \`interactor.gd\` and a \`CollisionShape2D\` (CircleShape2D, radius 14). Add the \`DialogueBox\` instance to the scene that holds the game UI (or to the test room for now).`,
            md`Instance \`npc.tscn\` into the village room, set *Dialogue Path* to \`res://resources/dialogue/elder.json\`, and run the room.`,
          ],
          result: md`Walking up to the elder and facing her shows "Talk" above her head; turning away hides it. Pressing \`interact\` starts her conversation, Kai stops moving, and choosing "I will." sets \`herbs_started\`. Talking again starts at "Any luck with the moonherbs?".`,
          troubleshoot: [
            { problem: md`The prompt never appears.`, fix: md`Check the masks: the Interactor's mask must include layer 7 and the Interactable's layer must be 7. In the *Debug* menu, turn on **Visible Collision Shapes** to see both circles overlap.` },
            { problem: md`The prompt appears, but pressing interact does nothing.`, fix: md`The press is consumed earlier: another node calls \`set_input_as_handled()\` or a focused \`Control\` eats it. Make sure no \`Button\` has focus during gameplay.` },
            { problem: md`The first line of the conversation is skipped.`, fix: md`The press that started the conversation reached the dialogue box too. The Interactor must call \`get_viewport().set_input_as_handled()\` before \`target.interact(body)\`.` },
          ],
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'When to use Dialogic or Dialogue Manager',
          md: md`Your runner is about 150 lines and does lines, branches, choices and flag effects. Two well-known addons do far more:

- **Dialogic** gives you an editor inside Godot for timelines, characters with portraits, choices, variables and events, plus its own text box styles.
- **Dialogue Manager** lets writers author conversations in a compact script-like text format with conditions, mutations (calling game code) and translation export, and gives you a balloon UI you can restyle.

Switch when your needs outgrow the runner: hundreds of conversations, a writer who is not a programmer, localisation into several languages, or inline features such as variables in text, voice lines or per-line animations. Until then, owning 150 lines you fully understand is cheaper than learning and updating an addon. Either way keep the same boundaries: conversations are data, story state is \`GameState\` flags, and everything talks through \`Events\`.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'r04-2-build',
            title: 'A sign and a second villager',
            goal: md`Reuse the system for two new things without writing new dialogue code.`,
            requirements: [
              md`A signpost by the bridge shows "Read" as its prompt and plays a one-line conversation from \`resources/dialogue/sign_bridge.json\`.`,
              md`A second villager says one thing before \`herbs_started\` and something else after it, using a \`branch\` node.`,
              md`The second villager offers a choice "Where do moonherbs grow?" that only appears while the herb quest is active and not yet returned.`,
              md`Kai cannot move or attack while either conversation is open.`,
            ],
            hints: [
              md`The sign is \`npc.gd\` without the animation: give it a \`Sprite2D\` and an Interactable with \`prompt = "Read"\`, or make a tiny script that emits \`Events.dialogue_requested\`.`,
              md`"Active and not yet returned" is two conditions. Either add a branch node that checks \`herbs_returned\` first, or extend \`check\` to split on \`&&\`.`,
            ],
            solution: [
              {
                file: 'resources/dialogue/villager_tomas.json',
                lang: 'text',
                code: `{
	"start": "router",
	"nodes": {
		"router": {
			"branch": [
				{ "if": "herbs_returned", "next": "after" },
				{ "if": "herbs_started", "next": "during" }
			],
			"next": "before"
		},
		"before": { "speaker": "Tomas", "text": "The elder was looking for you. Something about the festival.", "next": "end" },
		"during": {
			"speaker": "Tomas",
			"text": "Off to the north road?",
			"choices": [
				{ "text": "Where do moonherbs grow?", "next": "where" },
				{ "text": "Bye.", "next": "end" }
			]
		},
		"where": { "speaker": "Tomas", "text": "In the shade under the cliffs. They glow a little at dusk.", "next": "end" },
		"after": { "speaker": "Tomas", "text": "Blue lanterns this year. Nice work.", "next": "end" }
	}
}
`,
              },
              { file: 'scripts/npc.gd', code: NPC },
            ],
            explain: md`No script changed: the sign and Tomas are new data and new scene instances. The router checks \`herbs_returned\` before \`herbs_started\`, so the "during" branch (with the herb choice) is reachable only while the quest is active. Ordering branch options from most to least specific is the general rule.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'r04-2-paper',
            title: 'Which NPC answers?',
            type: 'compute',
            difficulty: 2,
            minutes: 6,
            statement: md`Kai stands at the origin facing up, $\hat f = (0, -1)$, with \`facing_cos = 0.5\`. Three interactables overlap his area: a sign at $(0, -14)$, the elder at $(-9, -9)$ and a chest at $(10, 2)$. Which one does the Interactor pick? Enter its $\hat f \cdot \hat d$, rounded to 3 decimals.`,
            hints: [md`Reject anything with $\hat f \cdot \hat d < 0.5$, then pick the smallest distance among the rest.`],
            solution: [
              md`Sign: $\hat d = (0, -1)$, dot $= 1$, distance 14.`,
              md`Elder: $|(-9,-9)| \approx 12.73$, $\hat d \approx (-0.707, -0.707)$, dot $\approx 0.707 \ge 0.5$, distance 12.73.`,
              md`Chest: $\hat d \approx (0.981, 0.196)$, dot $\approx -0.196$: rejected, it is beside and slightly behind Kai.`,
              md`Of the sign (14) and the elder (12.73), the elder is closer, so the Interactor picks her, with $\hat f\cdot\hat d \approx 0.707$.`,
            ],
            answer: { kind: 'number', value: Math.SQRT1_2, tol: 2e-3 },
          },
        },
        {
          kind: 'recall',
          prompt: md`What are the three additions to the JSON format, and in what order does \`play()\` handle them for one node?`,
          answer: md`\`branch\` (route by the first true condition, never shown), \`choices\` with optional \`if\`, and \`set\` effects. For a node: branch nodes route immediately; otherwise show the line, apply \`set\` after the reader advances, then ask the choices or follow \`next\`.`,
        },
        {
          kind: 'explain',
          prompt: md`Why does the NPC emit \`Events.dialogue_requested\` instead of calling a method on the dialogue box directly?`,
          model: md`The NPC would otherwise need a reference to the box: a node path that breaks when the UI moves, or an autoload just for the box. With the signal bus, anything (NPCs, signs, cutscenes, a tutorial trigger) can start a conversation by emitting one signal, and the box can live wherever the UI lives. The same signals tell the player controller and the Interactor to lock, without the box knowing they exist.`,
        },
      ],
      cards: [
        { id: 'r04-2-c1', kind: 'compute', front: md`Physics layer 7 as a bit value in \`collision_mask\`?`, answer: { kind: 'number', value: 64 }, back: md`Layer $n$ is bit $n - 1$: $2^6 = 64$, written \`1 << 6\`.` },
        { id: 'r04-2-c2', kind: 'concept', front: md`The facing test for "is the object in front of the player?"`, back: md`$\hat f \cdot \hat d \ge \cos\theta$ with unit facing $\hat f$ and unit direction to the object $\hat d$; $\cos\theta = 0.5$ for a 60° half-angle.` },
        { id: 'r04-2-c3', kind: 'cloze', text: md`In the dialogue JSON, a node with a \`{{}}\` list has no text and routes to the first option whose condition holds.`, answers: ['branch'] },
        { id: 'r04-2-c4', kind: 'concept', front: md`Why are effects (\`set\`) applied after the reader advances past the line, not when it starts?`, back: md`So a player who leaves or is interrupted mid-line has not triggered the consequence, and the flag changes after the line that announces it has been read.` },
        { id: 'r04-2-c5', kind: 'concept', front: md`When is a dialogue addon (Dialogic, Dialogue Manager) the better choice?`, back: md`Many conversations, non-programmer writers, localisation, or inline features (variables in text, voice, per-line events) that would outgrow a small custom runner.` },
      ],
    },

    // ======================================================================== r04-3
    {
      id: 'r04-3',
      title: 'Quests and cutscenes',
      minutes: 45,
      objectives: [
        'Model a quest as a Resource with steps whose state is computed from story flags.',
        'Emit `Events.quest_updated` only when a quest\'s visible progress changes, and show it in a toast.',
        'Build a cutscene in AnimationPlayer with camera moves, method-track keys and `await animation_finished`.',
        'Pause a cutscene for dialogue and resume it, and lock player input without pausing the tree.',
        'Compute timing for eased camera moves: peak speed $\\tfrac32\\,d/T$ for smoothstep.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A quest is a promise the game makes: "bring three moonherbs and something will happen." The player sees it as a line in the quest log that updates as they play: *Gather moonherbs (1/3)*, *(2/3)*, *Return to Elder Maren*, *Complete*.

The tempting design is a \`Quest\` object with its own state variable that systems poke: the herb calls \`quest.advance()\`, the elder calls \`quest.complete()\`. It breaks in predictable ways. What if the player picks herbs before accepting the quest? What if they load a save? What if two systems disagree about the state? Each needs special code.

The design used here avoids all three: **a quest stores no state**. It is data (title, steps) plus a rule that computes the current step from story flags. The herb only adds to the \`herbs\` flag; the elder's dialogue only sets \`herbs_returned\`. The quest log asks "given these flags, where is this quest?" whenever a flag changes.`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'Derived state cannot get out of sync',
          md: md`If something can be computed from other state, compute it instead of storing a second copy. Quest progress computed from flags is always consistent with the flags, survives loading a save for free (r06 saves only the flags), and lets content designers reorder or add steps without migrating anyone's progress. The cost is a few dictionary lookups when a flag changes, which is nothing.`,
        },
        { kind: 'code', file: 'scripts/resources/quest_step.gd', code: QUEST_STEP },
        {
          kind: 'code',
          file: 'scripts/resources/quest_data.gd',
          code: QUEST_DATA,
          note: md`Create \`resources/quests/moonherbs.tres\` with **FileSystem → New Resource… → QuestData**: id \`moonherbs\`, start flag \`herbs_started\`, two steps: "Gather moonherbs" (\`herbs\`, target 3) and "Return to Elder Maren" (\`herbs_returned\`, target 1).`,
        },
        {
          kind: 'viz',
          viz: { type: 'rpg.quest' },
          task: md`Pick a moonherb *before* talking to the elder, then talk to her: the quest starts with one herb already counted. Turn off **count herbs before the quest starts** and reset: now early herbs are wasted. Then fight at the well and watch which signals fire, and which do not, as flags change.`,
          caption: md`Every button only changes flags, exactly like the game's herbs, slimes and dialogue. \`quest_updated\` fires only when a quest's computed step text changes, so killing a fifth slime after the step is done fires \`flag_changed\` but no quest update.`,
        },
        {
          kind: 'check',
          q: md`With the moonherb quest above and \`flags = {"herbs": 3, "herbs_returned": 1}\` (the player somehow never set \`herbs_started\`), what does \`current_step(flags)\` return?`,
          options: [md`$-1$: the quest has not started`, md`2: complete`, md`1: return to the elder`, md`0: gather moonherbs`],
          answer: 0,
          explain: md`The start flag is checked first. Without \`herbs_started\` the quest is not in the log at all, whatever the other flags say. Ordering the checks this way makes "not started" impossible to skip by accident.`,
        },
        {
          kind: 'code',
          file: 'scripts/autoload/game_state.gd',
          code: GAME_STATE_QUESTS,
          note: md`The quests are preloaded into the autoload, so they are tracked in every room. \`_quest_text\` remembers each quest's last step text only to decide whether to emit \`quest_updated\`: a new step or a new count is news, anything else is not. It is a cache, and r06 does not save it.`,
        },
        { kind: 'code', file: 'scenes/herb.gd', code: HERB, note: md`\`picked:\` flags remember which herbs are gone, so a herb you picked does not grow back when you re-enter the room. r06 turns this into a general persistent-id scheme.` },
        { kind: 'code', file: 'ui/quest_toast.gd', code: QUEST_TOAST },
        {
          kind: 'text',
          md: md`### Cutscenes with AnimationPlayer

A cutscene is a short scripted sequence: the camera pans to the square, the elder walks in, she speaks, the camera returns. Writing it as code (\`await\` a tween, \`await\` a walk, \`await\` a line) works for three steps and turns unreadable at fifteen. An \`AnimationPlayer\` gives you a timeline instead: tracks for properties, keys at times, and **method tracks** that call functions at a given time.

Four kinds of track do almost everything:

- **Value tracks** on \`position\` move the cutscene camera and the actors, with the curve between keys set per key (*Easing* in the key's Inspector).
- **Method tracks** call \`play("walk_side")\` on an \`AnimatedSprite2D\`, and \`say("res://resources/dialogue/elder_arrives.json", "start")\` on the \`Cutscene\` node.
- **Audio tracks** play a sound at a key.
- **Value tracks** on \`visible\` or \`modulate\` show and fade things.

The \`Cutscene\` script below plays an animation, waits for \`animation_finished\`, and hands control back. Its \`say()\` method pauses the animation until the dialogue box closes, so the timeline waits for the reader instead of guessing how long they take.`,
        },
        {
          kind: 'viz',
          viz: { type: 'rpg.cutscene' },
          task: md`Press **F** to start the cutscene (or the button), then hold the arrow keys while it runs. Turn off **lock player input** and play it again: Kai walks off while the camera ignores him. Turn off **pause for dialogue** and play: the elder's line flashes by because the timeline does not wait. Drag the timeline scrubber to inspect the camera and elder positions at any time.`,
          caption: md`The playhead stops at the \`say\` key until you finish the line with F, exactly as \`anim.pause()\` and \`await Events.dialogue_finished\` do. The camera track uses an ease-in-out curve: compare its speed at the start, middle and end of the pan in the readout.`,
        },
        {
          kind: 'code',
          file: 'scripts/cutscene.gd',
          code: CUTSCENE,
          note: md`\`anim.play()\` with no name resumes a paused animation from where it stopped. The camera glides back with a tween before \`make_current()\`, because switching the current camera is instant and would otherwise snap the view.`,
        },
        { kind: 'code', file: 'scripts/cutscene_trigger.gd', code: CUTSCENE_TRIGGER },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Why not pause the tree?',
          md: md`\`get_tree().paused = true\` stops the player, but it also stops the AnimationPlayer, the camera and the dialogue box, because nodes inherit the paused state. You would then set \`process_mode = PROCESS_MODE_ALWAYS\` on everything the cutscene uses, and enemies and particles stop mid-air. Locking only the *input* through \`Events.cutscene_started\` (the controller lock from lesson 2) keeps the world alive and stops only the player's control.`,
        },
        {
          kind: 'derive',
          title: 'how fast an eased camera pan moves',
          goal: md`A camera pans $d$ pixels in $T$ seconds with the smoothstep ease $s(u) = 3u^2 - 2u^3$, $u = t/T$. Find its peak speed and compare it with the average $d/T$.`,
          steps: [
            { md: md`Position is $x(t) = d\, s(t/T)$. Speed is the derivative: $x'(t) = \frac{d}{T}\, s'(u)$ with $s'(u) = 6u - 6u^2$.` },
            {
              md: md`$s'(u) = 6u(1 - u)$ is a downward parabola, zero at $u = 0$ and $u = 1$ (the pan starts and ends at rest) and largest at $u = \tfrac12$, where $s'(\tfrac12) = 6 \cdot \tfrac12 \cdot \tfrac12 = \tfrac32$.`,
              choose: {
                prompt: md`Where is $u(1-u)$ largest on $[0, 1]$?`,
                options: [md`At $u = 1/2$`, md`At $u = 1$`, md`At $u = 0$`],
                answer: 0,
                explain: md`$u(1-u)$ is symmetric about $u = 1/2$ and zero at both ends; its maximum is $1/4$ at the middle.`,
              },
            },
            { md: md`So the peak speed is $v_{\text{peak}} = \tfrac32 \, d/T$: half again the average speed. A 120 px pan over 1.5 s averages 80 px/s and peaks at 120 px/s.` },
          ],
          takeaway: md`Easing makes a pan feel calm at its ends by moving faster in the middle. If the middle looks too fast (background tiles smear at 4× scale), lengthen $T$ rather than switching to linear, which starts and stops with a jolt.`,
        },
        {
          kind: 'numeric',
          q: md`A cutscene camera pans 200 px in 2.5 s with smoothstep easing. What is its peak speed in px/s?`,
          answer: { kind: 'number', value: 120 },
          explain: md`$\tfrac32 \times 200 / 2.5 = 1.5 \times 80 = 120$ px/s.`,
        },
        {
          kind: 'steps',
          title: 'Build the "elder arrives" cutscene',
          steps: [
            md`In the village room add a \`Camera2D\` named \`CutsceneCamera\` (leave *Enabled* on; only the current camera renders), a \`Node\` named \`Cutscene\` with \`cutscene.gd\`, and an \`AnimationPlayer\`. In the \`Cutscene\` Inspector assign *Anim*, *Camera* and set *Once Flag* to \`seen_elder_arrives\`.`,
            md`Select the AnimationPlayer, click **Animation → New** and name it \`elder_arrives\`, length 5 s. With the playhead at 0, select \`CutsceneCamera\` and click the key icon next to *Position* to add a value track. Add keys at 1.0 s and 4.0 s for the pan to the square, and at each key set *Easing* in the Inspector (or use the track's interpolation menu) so the move eases in and out.`,
            md`Key the elder NPC's *Position*: off-screen right at 0.5 s, in the square at 2.5 s. Then **Add Track → Call Method Track** on the elder's \`AnimatedSprite2D\`: a key at 0.5 s calling \`play\` with argument \`"walk_side"\`, one at 2.5 s with \`"idle_side"\`.`,
            md`Add a **Call Method Track** on \`Cutscene\` with a key at 2.8 s calling \`say\` with arguments \`"res://resources/dialogue/elder_arrives.json"\` and \`"start"\`. Write that JSON file with two or three lines.`,
            md`Add an \`Area2D\` with \`cutscene_trigger.gd\` and a rectangle covering the road into the square. Assign its *Cutscene*. Run the room and walk in.`,
          ],
          result: md`As Kai steps onto the road he stops, the camera pans to the square, the elder walks in and stops, and her lines play. The timeline waits until you finish reading, the camera glides back to Kai, and control returns. Walking out and in again does not replay it.`,
          troubleshoot: [
            { problem: md`The camera jumps instead of panning at the start.`, fix: md`The first camera key is far from where the player camera was. \`Cutscene.play()\` starts the cutscene camera at the player camera's view; key the first position at the trigger area so the two agree, or add a short tween to the first key.` },
            { problem: md`The method key never fires.`, fix: md`Method tracks call functions only while the game runs (not when scrubbing in the editor), and the method name and argument types must match exactly. Check the Output panel for "method not found".` },
            { problem: md`The cutscene replays after loading a save.`, fix: md`The once flag is set at the very end; if the player saves mid-cutscene the flag is not set yet. Disable saving during cutscenes (r06 does this with \`Events.cutscene_started\`).` },
          ],
        },
        {
          kind: 'build',
          ch: {
            id: 'r04-3-build',
            title: 'The moonherb quest, end to end',
            goal: md`Make the herb quest playable from start to finish with a quest toast and a cutscene for the hand-in.`,
            requirements: [
              md`Accepting the elder's request shows a toast "Moonherbs for the festival: Gather moonherbs (0/3)".`,
              md`Each herb picked shows the updated count; picked herbs stay gone after leaving and re-entering the room.`,
              md`After the third herb the toast reads "Return to Elder Maren"; handing in the herbs plays a short cutscene (the lanterns turning blue) and the toast reads "Complete".`,
              md`During the cutscene Kai cannot move, and the cutscene does not play a second time.`,
              md`Picking a fifth herb (from a later room) does not show a toast.`,
            ],
            hints: [
              md`The hand-in line sets \`herbs_returned\`. Start the cutscene from \`Events.flag_changed\` when \`flag == "herbs_returned"\`, after the dialogue closes: \`await Events.dialogue_finished\`.`,
              md`The lanterns can be \`Sprite2D\`s whose \`modulate\` is keyed from white to blue in the animation.`,
              md`The fifth herb changes \`herbs\` from 4 to 5; the quest's step text is already "Complete", so \`_refresh_quests\` sees no change and emits nothing.`,
            ],
            solution: [
              { file: 'scripts/resources/quest_data.gd', code: QUEST_DATA },
              { file: 'scripts/autoload/game_state.gd', code: GAME_STATE_QUESTS },
              {
                file: 'scripts/lantern_cutscene_starter.gd',
                code: gd`
extends Node
## Starts the lantern cutscene once the hand-in conversation has closed.

@export var cutscene: Cutscene


func _ready() -> void:
    Events.flag_changed.connect(_on_flag_changed)


func _on_flag_changed(flag: String, value: int) -> void:
    if flag != "herbs_returned" or value <= 0:
        return
    await Events.dialogue_finished
    cutscene.play()
`,
              },
              { file: 'ui/quest_toast.gd', code: QUEST_TOAST },
            ],
            explain: md`The quest itself is two \`.tres\` files and a toast; every gameplay object only touches flags. Starting the cutscene from \`flag_changed\` keeps the dialogue file free of cutscene logic, and waiting for \`dialogue_finished\` prevents the cutscene and the conversation from fighting over the input lock.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'r04-3-paper',
            title: 'Method keys in frames',
            type: 'compute',
            difficulty: 1,
            minutes: 4,
            statement: md`A cutscene animation has method keys at 0.5 s, 2.8 s and 4.25 s. The game runs at 60 fps, and the animation's process callback is *Idle* (it advances once per rendered frame). On which frame number (counting from frame 0 at $t = 0$) does the 4.25 s key fire, at the earliest? Assume no pauses.`,
            solution: [
              md`At 60 fps, frame $k$ happens at $t = k/60$ s.`,
              md`The key fires on the first frame with $t \ge 4.25$: $k = 4.25 \times 60 = 255$. Frame 255 is exactly at 4.25 s, so the key fires on frame 255.`,
            ],
            answer: { kind: 'number', value: 255 },
          },
        },
        {
          kind: 'recall',
          prompt: md`How does \`Cutscene.say()\` make the timeline wait for the reader, and how does it resume?`,
          answer: md`It calls \`anim.pause()\`, emits \`Events.dialogue_requested\`, awaits \`Events.dialogue_finished\`, then calls \`anim.play()\` with no name, which resumes the paused animation where it stopped.`,
        },
        {
          kind: 'explain',
          prompt: md`A teammate wants the quest object to store its own \`state\` variable ("active", "step 2", "done") and save it. Explain the trade-off against computing state from flags.`,
          model: md`A stored state is a second copy of facts the flags already hold, so the two can disagree: herbs picked before the quest started, a save from an older build, a debug command that sets a flag. Each case needs code to repair the copy. Computing the state from flags makes those cases correct by construction, saves nothing extra, and lets designers change steps without migrating saves. A stored state is only needed for facts that cannot be derived (for example "which of two rewards the player chose"), and those are just more flags.`,
        },
      ],
      cards: [
        { id: 'r04-3-c1', kind: 'concept', front: md`Why compute quest progress from story flags instead of storing it?`, back: md`It cannot get out of sync, early progress counts automatically, saving the flags saves the quests, and steps can change without migrating saves.` },
        { id: 'r04-3-c2', kind: 'cloze', text: md`To wait for a cutscene animation to end: \`await anim.{{}}\`.`, answers: ['animation_finished'] },
        { id: 'r04-3-c3', kind: 'concept', front: md`How do you stop the player during a cutscene without stopping the cutscene?`, back: md`Lock input only: emit \`Events.cutscene_started\`, have the controller set \`locked\` and clear its intent. Pausing the tree would also pause the AnimationPlayer.` },
        { id: 'r04-3-c4', kind: 'compute', front: md`Smoothstep pan of 90 px over 1.2 s. Peak speed in px/s?`, answer: { kind: 'number', value: 112.5 }, back: md`$\tfrac32 \times 90/1.2 = 1.5 \times 75 = 112.5$ px/s.` },
        { id: 'r04-3-c5', kind: 'cloze', text: md`Calling \`anim.{{}}()\` with no animation name resumes a paused AnimationPlayer.`, answers: ['play'] },
      ],
    },
  ],

  // ------------------------------------------------------------------------------ problems
  problems: [
    {
      id: 'r04-p1',
      title: 'Typing time with pauses',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`A line has 84 characters, including 3 full stops and 2 commas. The dialogue box types 28 characters per second and pauses 0.15 s after every \`.\` or \`,\`. How many seconds does the line take to type completely?`,
      solution: [md`Typing: $84/28 = 3$ s.`, md`Pauses: $5 \times 0.15 = 0.75$ s.`, md`Total $T = 3.75$ s.`],
      answer: { kind: 'number', value: 3.75 },
      areas: ['systems'],
    },
    {
      id: 'r04-p2',
      title: 'Masks for the interactor',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`A cutscene trigger must detect the player (layer 2) and the party members (layer 3), nothing else. What is its \`collision_mask\` as an integer?`,
      solution: [md`Layer 2 is bit 1: $2^1 = 2$. Layer 3 is bit 2: $2^2 = 4$.`, md`Mask $= 2 + 4 = 6$.`],
      answer: { kind: 'number', value: 6 },
      areas: ['godot'],
    },
    {
      id: 'r04-p3',
      title: 'The skipped first line',
      type: 'debug',
      difficulty: 2,
      minutes: 8,
      statement: md`Talking to an NPC opens the dialogue box, but the first line always appears fully typed, as if the player had pressed \`interact\` twice. The two scripts:

\`\`\`gdscript
# interactor.gd
func _process(_delta: float) -> void:
	if target and Input.is_action_just_pressed("interact"):
		target.interact(body)

# dialogue_box.gd
func _process(delta: float) -> void:
	if panel.visible and Input.is_action_just_pressed("interact"):
		if _typing:
			_finish_typing()
		else:
			advanced.emit()
	# ... typing code ...
\`\`\`

Explain the bug and fix it.`,
      hints: [md`How long does \`is_action_just_pressed\` stay true?`],
      solution: [
        md`\`Input.is_action_just_pressed\` is true for every node that asks during the frame of the press. The interactor runs first, starts the conversation and shows the panel; later in the same frame the dialogue box asks the same question, gets true, and finishes the typing.`,
        md`Fix: handle the press as an event in \`_unhandled_input\` in both scripts and call \`get_viewport().set_input_as_handled()\` in whichever uses it. An event is delivered to one node after another and stops once handled, so one press has one effect.`,
      ],
      rubric: [md`Identifies that both scripts see the same just-pressed state in one frame`, md`Moves both to \`_unhandled_input\` (or an equivalent single owner)`, md`Marks the event handled after using it`],
      areas: ['godot', 'systems'],
    },
    {
      id: 'r04-p4',
      title: 'A validator for conversations',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 12,
      statement: md`Write \`static func validate(data: DialogueData) -> PackedStringArray\` that returns one error message per broken reference: a \`next\` in a node, a choice or a branch option that names a node that does not exist (\`"end"\` is always valid), and a \`start\` that does not exist.`,
      hints: [md`Collect every target id from the three places, then check each against \`data.nodes\`.`],
      solution: [
        md`Gather targets, then check them:

\`\`\`gdscript
static func validate(data: DialogueData) -> PackedStringArray:
	var errors := PackedStringArray()
	if not data.nodes.has(data.start):
		errors.append("start '%s' does not exist" % data.start)
	for id in data.nodes:
		var node: Dictionary = data.nodes[id]
		var targets: Array = []
		if node.has("next"):
			targets.append(node["next"])
		for option in node.get("choices", []) + node.get("branch", []):
			targets.append(option.get("next", ""))
		for target in targets:
			if target != "end" and not data.nodes.has(target):
				errors.append("%s -> '%s' does not exist" % [id, target])
	return errors
\`\`\``,
        md`Run it over every file in \`resources/dialogue/\` from a test scene or an editor script (\`DirAccess.get_files_at\`), so a typo fails in seconds instead of when a player reaches that branch.`,
      ],
      rubric: [md`Checks \`next\` of plain nodes`, md`Checks choices and branch options`, md`Treats \`end\` as valid and checks \`start\``, md`Returns messages that name the source node and the missing id`],
      areas: ['systems'],
    },
    {
      id: 'r04-p5',
      title: 'Paused cutscene',
      type: 'debug',
      difficulty: 2,
      minutes: 6,
      statement: md`To stop the player during cutscenes, a teammate writes:

\`\`\`gdscript
func play() -> void:
	get_tree().paused = true
	anim.play(animation_name)
	await anim.animation_finished
	get_tree().paused = false
\`\`\`

The game freezes forever when the cutscene starts. Why, and what is the better fix?`,
      solution: [
        md`Pausing the tree pauses every node whose \`process_mode\` is *Inherit* (the default), including the AnimationPlayer. It never advances, \`animation_finished\` never fires, and the tree is never unpaused.`,
        md`Setting the AnimationPlayer, camera and dialogue box to \`PROCESS_MODE_ALWAYS\` would work, but it also freezes everything else in the world. The better fix is to lock only the player's input through \`Events.cutscene_started\`/\`cutscene_ended\`, as the lesson's controller lock does.`,
      ],
      rubric: [md`Explains that the AnimationPlayer inherits the pause`, md`Notes the await never resumes`, md`Proposes an input lock (or justifies process modes)`],
      areas: ['godot'],
    },
    {
      id: 'r04-p6',
      title: 'Design: the thief at the gate',
      type: 'design',
      difficulty: 2,
      minutes: 12,
      statement: md`A quest: a thief stole the festival lanterns. The player can find him in the woods and either turn him in to the guard (reward: 100 gold) or let him go if he returns the lanterns (reward: a shard, and he appears later as a shopkeeper). Design the flags, the quest steps (\`QuestData\`) and the key dialogue conditions. Make sure both endings complete the quest.`,
      solution: [
        md`Flags: \`thief_started\` (guard tells you), \`thief_found\`, \`thief_turned_in\`, \`thief_spared\`, plus a derived ending flag \`thief_resolved\` set by either ending's dialogue effect.`,
        md`Quest steps: "Search the woods" (\`thief_found\`, 1); "Decide the thief's fate" (\`thief_resolved\`, 1). Both endings set \`thief_resolved\`, so the quest completes either way; the specific ending flag records which.`,
        md`Dialogue conditions: the thief's conversation offers "Come with me to the guard." and "Return the lanterns and go." only while \`!thief_resolved\`. The guard's router checks \`thief_turned_in\` for the reward line. The shopkeeper NPC's scene is visible only if \`thief_spared\` (its \`_ready\` checks the flag and hides itself otherwise).`,
      ],
      rubric: [md`Separate flags for each ending plus a shared completion flag`, md`Steps complete for both endings`, md`Conditions prevent resolving twice`, md`Later world change keyed off the ending flag`],
      areas: ['systems'],
    },
    {
      id: 'r04-p7',
      title: 'Build or adopt',
      type: 'concept',
      difficulty: 1,
      minutes: 5,
      statement: md`Give two situations where you would replace the lesson's JSON runner with Dialogic or Dialogue Manager, and one reason to keep the custom runner for Shardbound's vertical slice.`,
      solution: [
        md`Replace it when a writer who does not code needs to author hundreds of lines in a comfortable format, or when the game needs localisation export, variables inside text, voice lines or per-line events that the runner lacks.`,
        md`Keep it for the slice: about a dozen conversations, every feature is understood and debuggable in 150 lines, no external update cycle, and the data format can be converted later because it is plain JSON.`,
      ],
      rubric: [md`Two concrete situations tied to scale, team or features`, md`One concrete reason to keep the small runner`],
      areas: ['systems'],
    },
    {
      id: 'r04-p8',
      title: 'Facing cone',
      type: 'compute',
      difficulty: 2,
      minutes: 5,
      statement: md`Kai faces right, $\hat f = (1, 0)$. A chest is at offset $(12, -5)$ px. What is $\hat f \cdot \hat d$? Is the chest a valid target with \`facing_cos = 0.9\`?`,
      solution: [md`$|(12, -5)| = 13$, so $\hat d = (12/13, -5/13)$ and $\hat f \cdot \hat d = 12/13 \approx 0.923$.`, md`$0.923 \ge 0.9$, so yes, it is inside the cone (about 22.6° off the facing direction; the cone's half-angle is about 25.8°).`],
      answer: { kind: 'number', value: 12 / 13 },
      areas: ['math'],
    },
    {
      id: 'r04-p9',
      title: 'Peak speed of an eased pan',
      type: 'derive',
      difficulty: 2,
      minutes: 8,
      statement: md`A camera pans with the "smootherstep" curve $s(u) = 6u^5 - 15u^4 + 10u^3$. Derive its peak speed as a multiple of the average speed $d/T$.`,
      hints: [md`Differentiate, factor out $30u^2$, and evaluate at $u = 1/2$ by symmetry.`],
      solution: [
        md`$s'(u) = 30u^4 - 60u^3 + 30u^2 = 30u^2(u - 1)^2$.`,
        md`It is symmetric about $u = \tfrac12$ and zero at both ends, so the maximum is at $u = \tfrac12$: $30 \cdot \tfrac14 \cdot \tfrac14 = \tfrac{30}{16} = 1.875$.`,
        md`Peak speed $= 1.875\, d/T$, higher than smoothstep's $1.5$: smootherstep is gentler at the ends and faster in the middle.`,
      ],
      answer: { kind: 'number', value: 1.875 },
      areas: ['math'],
    },
  ],
};
