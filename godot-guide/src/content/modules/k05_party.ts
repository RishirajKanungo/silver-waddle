import { md, gd, type Module } from '../types';

// ------------------------------------------------------------------------------------ k05-1 listings
const PARTY_MANAGER_V1 = gd`
class_name PartyManager
extends Node2D
## Owns the party. Exactly one member carries the PlayerController; the others are driven by their
## AllyAIController. switch_to() moves control from one member to another within a single tick.

signal leader_changed(leader: Character)

@export var members: Array[Character] = []
## The only PlayerController in the scene. In the editor it starts as a child of the first member.
@export var player_controller: PlayerController
## A child Camera2D with Position Smoothing on, so a switch glides instead of cutting.
@export var camera: Camera2D
## Share of basic-hit ATB for members the player is not controlling (k03: 50%).
@export_range(0.0, 1.0) var ai_atb_scale := 0.5

var current_index := 0
var _menu_open := false


func _ready() -> void:
    for member in members:
        member.add_to_group("party")
    # the tactical menu uses switch_character to pick whom to command: ignore it while open
    Events.tactical_opened.connect(func() -> void: _menu_open = true)
    Events.tactical_closed.connect(func() -> void: _menu_open = false)
    # deferred: every member finishes _ready before the controller moves between them
    _apply_control.call_deferred()


func leader() -> Character:
    return members[current_index]


func _physics_process(_delta: float) -> void:
    camera.global_position = leader().global_position


func _unhandled_input(event: InputEvent) -> void:
    if _menu_open or not event.is_action_pressed("switch_character"):
        return
    switch_to((current_index + 1) % members.size())
    get_viewport().set_input_as_handled()


func switch_to(index: int) -> void:
    if index < 0 or index >= members.size() or index == current_index:
        return
    current_index = index
    _apply_control()
    leader_changed.emit(leader())


func _apply_control() -> void:
    var lead := leader()
    # 1. the one PlayerController moves to the new leader, first among its children, so it writes
    #    the intent before the StateMachine reads it in the same tick (c05)
    player_controller.reparent(lead, false)
    lead.move_child(player_controller, 0)
    # 2. its @onready "character" was set once, for its first parent: update it by hand
    player_controller.character = lead
    # 3. everyone else is driven by AI; nobody keeps a stale intent from before the switch
    for member in members:
        var is_lead := member == lead
        var ai := member.get_node("AllyAIController")
        ai.process_mode = Node.PROCESS_MODE_DISABLED if is_lead else Node.PROCESS_MODE_INHERIT
        member.intent.clear()
        if member.atb:
            member.atb.gain_scale = 1.0 if is_lead else ai_atb_scale
`;

const PARTY_MANAGER_FULL = gd`
class_name PartyManager
extends Node2D
## Owns the party. Exactly one member carries the PlayerController; the others are driven by their
## AllyAIController. Members that are KO are skipped; when the last one falls, party_defeated fires.

signal leader_changed(leader: Character)
signal party_defeated

@export var members: Array[Character] = []
@export var player_controller: PlayerController
@export var camera: Camera2D
@export_range(0.0, 1.0) var ai_atb_scale := 0.5

var current_index := 0
var _menu_open := false
var _down: Array[Character] = []


func _ready() -> void:
    for member in members:
        member.add_to_group("party")
        member.health.died.connect(_on_member_died.bind(member))
    Events.tactical_opened.connect(func() -> void: _menu_open = true)
    Events.tactical_closed.connect(func() -> void: _menu_open = false)
    _apply_control.call_deferred()


func leader() -> Character:
    return members[current_index]


func is_down(member: Character) -> bool:
    return member in _down


func _physics_process(_delta: float) -> void:
    camera.global_position = leader().global_position


func _unhandled_input(event: InputEvent) -> void:
    if _menu_open or not event.is_action_pressed("switch_character"):
        return
    var next := next_alive_index()
    if next != -1:
        switch_to(next)
    get_viewport().set_input_as_handled()


func switch_to(index: int) -> void:
    if index < 0 or index >= members.size() or index == current_index:
        return
    if is_down(members[index]):
        return
    current_index = index
    _apply_control()
    leader_changed.emit(leader())


## The next member after the leader who is not KO, wrapping around; -1 if there is none.
func next_alive_index() -> int:
    for step in range(1, members.size() + 1):
        var i := (current_index + step) % members.size()
        if not is_down(members[i]):
            return i
    return -1


func revive(member: Character) -> void:
    _down.erase(member)


func _on_member_died(member: Character) -> void:
    if not is_down(member):
        _down.append(member)
    if _down.size() == members.size():
        party_defeated.emit()
        return
    if member == leader():
        # the player is never left controlling a body on the floor
        switch_to(next_alive_index())


func _apply_control() -> void:
    var lead := leader()
    player_controller.reparent(lead, false)
    lead.move_child(player_controller, 0)
    player_controller.character = lead
    for member in members:
        var is_lead := member == lead
        var ai := member.get_node("AllyAIController")
        ai.process_mode = Node.PROCESS_MODE_DISABLED if is_lead else Node.PROCESS_MODE_INHERIT
        member.intent.clear()
        if member.atb:
            member.atb.gain_scale = 1.0 if is_lead else ai_atb_scale
`;

// ------------------------------------------------------------------------------------ k05-2 listings
const PARTY_ADD_FOLLOW = gd`
# scripts/battle/party_manager.gd: add for the allies, and replace _physics_process
## Allies fight the enemy nearest the leader, within this range.
@export var focus_range := 120.0
## A new trail point every trail_spacing px of leader movement.
@export var trail_spacing := 3.0

## The enemy the allies attack (null when there is none in range).
var focus_target: Node2D = null
## The leader's recent positions, oldest first.
var trail := PackedVector2Array()


func _physics_process(_delta: float) -> void:
    var lead := leader()
    camera.global_position = lead.global_position
    if trail.is_empty() or trail[-1].distance_to(lead.global_position) >= trail_spacing:
        trail.append(lead.global_position)
        if trail.size() > 200:
            trail.remove_at(0)
    focus_target = _nearest_enemy(lead.global_position)


func _nearest_enemy(from: Vector2) -> Node2D:
    var best: Node2D = null
    var best_distance := focus_range
    for node in get_tree().get_nodes_in_group("enemies"):
        var enemy := node as Character
        if enemy == null or enemy.health.health <= 0:
            continue
        var d := from.distance_to(enemy.global_position)
        if d < best_distance:
            best_distance = d
            best = enemy
    return best


## The point distance px behind the leader, measured along the path the leader walked.
func point_behind_leader(distance: float) -> Vector2:
    var remaining := distance
    var previous := leader().global_position
    for i in range(trail.size() - 1, -1, -1):
        var point := trail[i]
        var step := previous.distance_to(point)
        if step >= remaining:
            return previous.lerp(point, remaining / step)
        remaining -= step
        previous = point
    return previous
`;

const ALLY_AI = gd`
class_name AllyAIController
extends Node
## Drives a party member the player is not controlling: follow the leader's trail, fight the
## leader's target with basic attacks, guard against telegraphs. It never spends ATB: abilities
## only come from commands issued in tactical mode. PartyManager disables it on the leader.

@export var party: PartyManager
## 0 or 1: which side this ally takes behind the leader and around the target.
@export var slot := 0
@export var follow_distance := 18.0
## Distance from the target to fight at: about 16 for melee, 60 for Lyra.
@export var attack_range := 16.0
## Seconds between basic attacks. Allies attack less often than a player mashing.
@export var attack_pause := 1.0
## Guard when a telegraphing enemy is closer than this.
@export var guard_radius := 40.0

var _cooldown := 0.0

@onready var character: Character = get_parent()
@onready var runner := get_parent().get_node_or_null("AbilityRunner") as AbilityRunner


func _physics_process(delta: float) -> void:
    var intent := character.intent
    intent.move = Vector2.ZERO
    intent.wants_guard = false
    if runner and runner.busy:
        return  # a commanded ability is running: stay out of its way
    var target := party.focus_target
    if target == null:
        _steer_to(party.point_behind_leader((slot + 1) * follow_distance), 4.0)
        return
    if _threatened():
        intent.wants_guard = true
        return
    _fight(target, delta)


func _fight(target: Node2D, delta: float) -> void:
    # flank: stand to one side of the line from the target to the leader, so the three members
    # surround the enemy instead of queueing behind each other
    var leader_side := (party.leader().global_position - target.global_position).angle()
    var angle := leader_side + (1.2 if slot == 0 else -1.2)
    var spot := target.global_position + Vector2.from_angle(angle) * attack_range
    if character.global_position.distance_to(spot) > 6.0:
        _steer_to(spot, 4.0)
        return
    character.face(target.global_position - character.global_position)
    _cooldown -= delta
    if _cooldown <= 0.0:
        character.intent.wants_attack = true  # the Attack state consumes it
        _cooldown = attack_pause


func _steer_to(point: Vector2, stop_distance: float) -> void:
    var to_point := point - character.global_position
    var distance := to_point.length()
    if distance <= stop_distance:
        return
    # ease off over the last 24 px so allies settle instead of overshooting and jittering
    character.intent.move = to_point / distance * minf(1.0, distance / 24.0)


func _threatened() -> bool:
    # enemies add themselves to "telegraphing" in their windup state and leave it on exit
    for node in get_tree().get_nodes_in_group("telegraphing"):
        var enemy := node as Node2D
        if enemy and enemy.global_position.distance_to(character.global_position) < guard_radius:
            return true
    return false
`;

const COMMAND_MENU = gd`
class_name CommandMenu
extends PanelContainer
## The tactical menu: choose a party member, then an ability, then a target. Confirming pays the
## cost and queues a BattleCommand on that member's AbilityRunner, then closes tactical mode.
## Layout: VBox with a Title Label, a List VBoxContainer and an Info Label.

enum Step { ABILITY, TARGET }

@export var party: PartyManager
@export var tactical: TacticalMode

var _member := 0
var _cursor := 0
var _target_cursor := 0
var _step := Step.ABILITY
var _targets: Array[Node2D] = []

@onready var title: Label = $VBox/Title
@onready var list: VBoxContainer = $VBox/List
@onready var info: Label = $VBox/Info


func _ready() -> void:
    process_mode = Node.PROCESS_MODE_ALWAYS
    tactical.opened.connect(_on_opened)


func _on_opened() -> void:
    _member = party.current_index  # the menu opens on whoever you control
    _step = Step.ABILITY
    _cursor = 0
    _refresh()


func _unhandled_input(event: InputEvent) -> void:
    if not visible:
        return
    if event.is_action_pressed("ui_down"):
        _move(1)
    elif event.is_action_pressed("ui_up"):
        _move(-1)
    elif event.is_action_pressed("switch_character") and _step == Step.ABILITY:
        _next_member()
    elif event.is_action_pressed("ui_accept"):
        _confirm()
    elif event.is_action_pressed("ui_cancel"):
        if _step == Step.TARGET:
            _step = Step.ABILITY
        else:
            tactical.close()
    else:
        return
    get_viewport().set_input_as_handled()
    if visible:
        _refresh()


func _runner() -> AbilityRunner:
    return party.members[_member].get_node("AbilityRunner") as AbilityRunner


func _move(direction: int) -> void:
    if _step == Step.ABILITY:
        var count := _runner().abilities.size()
        if count > 0:
            _cursor = wrapi(_cursor + direction, 0, count)
    elif not _targets.is_empty():
        _target_cursor = wrapi(_target_cursor + direction, 0, _targets.size())


func _next_member() -> void:
    for step in range(1, party.members.size() + 1):
        var i := (_member + step) % party.members.size()
        if not party.is_down(party.members[i]):
            _member = i
            _cursor = 0
            return


func _confirm() -> void:
    var runner := _runner()
    if runner.abilities.is_empty():
        return
    var ability := runner.abilities[_cursor]
    if _step == Step.ABILITY:
        if not runner.can_use(ability):
            info.text = "Not enough ATB" if not runner.atb.can_spend(ability.atb_cost) else "Not enough MP"
            return
        if ability.target in [AbilityData.Target.SELF, AbilityData.Target.ALL_ENEMIES, AbilityData.Target.ALL_ALLIES]:
            _issue(runner, ability, party.members[_member])
            return
        _targets = _targets_for(ability)
        if _targets.is_empty():
            return
        _target_cursor = 0
        _step = Step.TARGET
        return
    _issue(runner, ability, _targets[_target_cursor])


func _issue(runner: AbilityRunner, ability: AbilityData, target: Node2D) -> void:
    if runner.enqueue(ability, target):
        tactical.close()


func _targets_for(ability: AbilityData) -> Array[Node2D]:
    var group := "party" if ability.target == AbilityData.Target.ONE_ALLY else "enemies"
    var out: Array[Node2D] = []
    for node in get_tree().get_nodes_in_group(group):
        var unit := node as Character
        if unit and unit.health.health > 0:
            out.append(unit)
    # left to right, so left and right on the stick feel spatial
    out.sort_custom(func(a: Node2D, b: Node2D) -> bool: return a.global_position.x < b.global_position.x)
    return out


func _refresh() -> void:
    var member := party.members[_member]
    var runner := _runner()
    title.text = "%s   ATB %d/%d   MP %d" % [member.name, runner.atb.segments(), runner.atb.max_segments, runner.mp]
    for child in list.get_children():
        child.queue_free()
    for i in runner.abilities.size():
        var ability := runner.abilities[i]
        var label := Label.new()
        var cost := "%d ATB" % ability.atb_cost
        if ability.mp_cost > 0:
            cost += "  %d MP" % ability.mp_cost
        label.text = "%s %s   %s" % ["> " if i == _cursor else "  ", ability.display_name, cost]
        label.modulate = Color.WHITE if runner.can_use(ability) else Color(1.0, 1.0, 1.0, 0.4)
        list.add_child(label)
    if _step == Step.TARGET:
        info.text = "Target: %s" % _targets[_target_cursor].name
    elif not runner.abilities.is_empty():
        info.text = runner.abilities[_cursor].description
`;

const TELEGRAPH_GROUP = gd`
# In the enemy's windup state (k02, extended in k04-2): announce the telegraph to the party AI
func enter() -> void:
    character.play_anim("windup")
    character.add_to_group("telegraphing")
    if character.stagger:
        character.stagger.vulnerable = true


func exit() -> void:
    character.remove_from_group("telegraphing")
    if character.stagger:
        character.stagger.vulnerable = false
`;

// ------------------------------------------------------------------------------------ k05-3 listings
const LIMIT_GAUGE = gd`
class_name LimitGauge
extends Node
## Fills mostly from damage taken, a little from hits dealt and from staggering enemies. When it is
## full, the member's limit break appears in the tactical menu. Child of a party Character.

signal changed(value: float, maximum: float)
signal filled

@export var maximum := 100.0
## Gauge points for losing your whole max HP. Proportional, so a 190 HP tank and a 100 HP mage
## fill at the same rate for the same share of their health.
@export var per_max_hp_taken := 90.0
@export var per_hit_dealt := 0.5
@export var per_enemy_staggered := 10.0
@export var limit_break: AbilityData

var value := 0.0
var _last_health := 0

@onready var _character: Character = get_parent()


func _ready() -> void:
    # the parent's @onready variables are not set yet (children are ready first): use the node
    var health := get_parent().get_node("HealthComponent") as HealthComponent
    _last_health = health.max_health
    health.health_changed.connect(_on_health_changed)
    Events.hit_landed.connect(_on_hit_landed)
    Events.enemy_staggered.connect(func(_enemy: Node2D) -> void: add(per_enemy_staggered))


func is_full() -> bool:
    return value >= maximum


func add(amount: float) -> void:
    if amount <= 0.0 or is_full():
        return
    value = minf(value + amount, maximum)
    changed.emit(value, maximum)
    if is_full():
        filled.emit()


func spend() -> bool:
    if not is_full():
        return false
    value = 0.0
    changed.emit(value, maximum)
    return true


func _on_health_changed(current: int, maximum_health: int) -> void:
    var lost := _last_health - current
    _last_health = current  # heals raise it again, so only real losses count
    if lost > 0:
        add(per_max_hp_taken * lost / float(maximum_health))


func _on_hit_landed(hit: HitData, _target: Node2D) -> void:
    if hit.source == _character:
        add(per_hit_dealt)
`;

const STAGGER_EVENT = gd`
# scripts/autoload/events.gd
signal enemy_staggered(enemy: Node2D)

# scripts/character.gd, in _on_staggered()
Events.enemy_staggered.emit(self)

# scripts/resources/ability_data.gd, in the Cost group
## Costs the full limit gauge instead of ATB and MP.
@export var is_limit := false
`;

const MEMBER_PANEL = gd`
class_name MemberPanel
extends PanelContainer
## One party member's name, HP, MP, ATB segments and limit gauge. bind() connects it; after that
## it changes only when a signal says something changed.
## Layout: VBox/Name (Label), VBox/HP (TextureProgressBar), VBox/HPText (Label),
## VBox/ATB/Segment1 and Segment2 (TextureProgressBar), VBox/MP (Label), VBox/Limit (ProgressBar).

@onready var name_label: Label = $VBox/Name
@onready var hp_bar: TextureProgressBar = $VBox/HP
@onready var hp_text: Label = $VBox/HPText
@onready var atb_segments: Array[TextureProgressBar] = [$VBox/ATB/Segment1, $VBox/ATB/Segment2]
@onready var mp_label: Label = $VBox/MP
@onready var limit_bar: ProgressBar = $VBox/Limit

var member: Character


func bind(p_member: Character) -> void:
    member = p_member
    name_label.text = member.name
    member.health.health_changed.connect(_on_health_changed)
    _on_health_changed(member.health.health, member.health.max_health)
    for bar in atb_segments:
        bar.max_value = member.atb.segment_size
    member.atb.changed.connect(_on_atb_changed)
    _on_atb_changed(member.atb.value, member.atb.maximum())
    var runner := member.get_node("AbilityRunner") as AbilityRunner
    runner.mp_changed.connect(_on_mp_changed)
    _on_mp_changed(runner.mp, runner.max_mp)
    var limit := member.get_node("LimitGauge") as LimitGauge
    limit.changed.connect(_on_limit_changed)
    _on_limit_changed(limit.value, limit.maximum)


func set_leader(is_leader: bool) -> void:
    name_label.text = ("> " if is_leader else "") + member.name
    modulate = Color.WHITE if is_leader else Color(0.85, 0.85, 0.85)


func _on_health_changed(current: int, maximum: int) -> void:
    hp_bar.max_value = maximum
    hp_bar.value = current
    hp_text.text = "%d/%d" % [current, maximum]
    # a KO shows at a glance; red below a third of max HP
    hp_text.modulate = Color(1.0, 0.45, 0.45) if current * 3 < maximum else Color.WHITE


func _on_atb_changed(value: float, _maximum: float) -> void:
    var segment := member.atb.segment_size
    for i in atb_segments.size():
        atb_segments[i].value = clampf(value - i * segment, 0.0, segment)


func _on_mp_changed(mp: int, max_mp: int) -> void:
    mp_label.text = "MP %d/%d" % [mp, max_mp]


func _on_limit_changed(value: float, maximum: float) -> void:
    limit_bar.max_value = maximum
    limit_bar.value = value
`;

const PARTY_HUD = gd`
extends HBoxContainer
## The party HUD: one MemberPanel per member, highlighting the leader. Lives in a CanvasLayer.

@export var party: PartyManager
@export var panel_scene: PackedScene

var _panels: Array[MemberPanel] = []


func _ready() -> void:
    # the HUD may become ready before the party does; wait so members' @onready vars are set
    if not party.is_node_ready():
        await party.ready
    for member in party.members:
        var panel := panel_scene.instantiate() as MemberPanel
        add_child(panel)
        panel.bind(member)
        _panels.append(panel)
    party.leader_changed.connect(_on_leader_changed)
    _on_leader_changed(party.leader())


func _on_leader_changed(leader: Character) -> void:
    for panel in _panels:
        panel.set_leader(panel.member == leader)
`;

const ABILITY_RUNNER_K05 = gd`
class_name AbilityRunner
extends Node
## Executes abilities for its parent Character, one at a time. k05 adds limit breaks (paid from the
## LimitGauge instead of ATB and MP) and an mp_changed signal for the HUD.

signal ability_started(ability: AbilityData)
signal ability_finished(ability: AbilityData)
signal mp_changed(mp: int, max_mp: int)

@export var abilities: Array[AbilityData] = []
@export var atb: AtbGauge
@export var limit: LimitGauge
@export var attack := 7
@export var magic := 4
@export var max_mp := 12

var mp := 0
var busy := false
var _queue: Array[BattleCommand] = []

@onready var character: Character = get_parent()


func _ready() -> void:
    mp = max_mp


## Everything the menu should list: the limit break first when the gauge is full.
func menu_abilities() -> Array[AbilityData]:
    var out: Array[AbilityData] = []
    if limit and limit.limit_break and limit.is_full():
        out.append(limit.limit_break)
    out.append_array(abilities)
    return out


func can_use(ability: AbilityData) -> bool:
    if ability.is_limit:
        return limit != null and limit.is_full()
    return atb.can_spend(ability.atb_cost) and mp >= ability.mp_cost


func enqueue(ability: AbilityData, target: Node2D) -> bool:
    if not can_use(ability):
        return false
    if ability.is_limit:
        limit.spend()
    else:
        atb.spend(ability.atb_cost)
        set_mp(mp - ability.mp_cost)
    var command := BattleCommand.new()
    command.user = character
    command.ability = ability
    command.target = target
    _queue.append(command)
    return true


func set_mp(value: int) -> void:
    mp = clampi(value, 0, max_mp)
    mp_changed.emit(mp, max_mp)


func _physics_process(_delta: float) -> void:
    if busy or _queue.is_empty():
        return
    var state := character.state_machine.current.name
    if state == &"Idle" or state == &"Move":
        _run(_queue.pop_front())


func _run(command: BattleCommand) -> void:
    busy = true
    var ability := command.ability
    ability_started.emit(ability)
    character.state_machine.transition_to("Ability")
    if is_instance_valid(command.target):
        character.face(command.target.global_position - character.global_position)
    character.play_anim(ability.animation)
    await get_tree().create_timer(ability.cast_time, false).timeout
    if character.health.health > 0 and character.state_machine.current.name == &"Ability":
        _apply(command)
        character.state_machine.transition_to("Idle")
    busy = false
    ability_finished.emit(ability)


func _apply(command: BattleCommand) -> void:
    var ability := command.ability
    var targets: Array[Node] = []
    match ability.target:
        AbilityData.Target.ALL_ENEMIES:
            targets = get_tree().get_nodes_in_group("enemies")
        AbilityData.Target.ALL_ALLIES:
            targets = get_tree().get_nodes_in_group("party")
        AbilityData.Target.SELF:
            targets = [character]
        _:
            if is_instance_valid(command.target):
                targets = [command.target]
    for node in targets:
        var target := node as Character
        if target == null or target.health.health <= 0:
            continue
        if ability.effect_scene:
            var effect := ability.effect_scene.instantiate() as Node2D
            target.add_sibling(effect)
            effect.global_position = target.global_position
        if ability.heal > 0:
            target.health.heal(ability.heal)
        if ability.power > 0.0:
            target.hurtbox.hurt.emit(_make_hit(ability, target))


func _make_hit(ability: AbilityData, target: Character) -> HitData:
    var stat := magic if ability.is_magic else attack
    var hit := HitData.new(roundi(ability.power * stat), ability.element, character)
    hit.stagger = ability.stagger
    hit.pressures = ability.pressures
    hit.multiplier_bonus = ability.multiplier_bonus
    hit.from_ability = true
    hit.knockback = (target.global_position - character.global_position).normalized() * 60.0
    return hit
`;

export const MODULE: Module = {
  id: 'k05',
  part: 'combat',
  order: 5,
  title: 'The party',
  summary: 'A PartyManager that moves the PlayerController between Kai, Lyra and Bram; allies with follow and fight AI that never spend ATB on their own; commands from tactical mode; synergies, limit breaks and the party HUD.',
  relevance: md`Shardbound's fights are designed for three: Kai builds ATB, Lyra spends it on weaknesses, Bram guards and pressures. This module puts all three on the field. You switch between them with one button, the other two follow and fight sensibly by themselves, and tactical mode lets you order any of them to cast, heal or bash a specific target. The limit gauge and the party HUD finish the battle system the rest of the course builds content for.`,
  prereqs: ['k04', 'k02'],
  areas: ['combat', 'godot', 'systems'],
  lessons: [
    // ======================================================================================== k05-1
    {
      id: 'k05-1',
      title: 'PartyManager: switching characters',
      minutes: 40,
      objectives: [
        'Build a PartyManager that owns three Characters and moves the single PlayerController with switch_to(index).',
        'Give the members you are not controlling their AI back, and lower their ATB gain.',
        'Retarget the camera smoothly and keep the HUD in sync through a leader_changed signal.',
        'Skip KO members when switching, and recover when the controlled member falls.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`In FF7 Remake you can press a button mid-fight and you are Tifa; the character you left keeps fighting without missing a beat. For that to work, the switch must take one frame, keep every character's state (HP, ATB, the animation they are in), and hand the old character to an AI that behaves sensibly from the very next tick.

c05 already did the hard part. A \`Character\` never reads \`Input\`; it reads its \`intent\`, which a controller child writes. Switching characters therefore comes down to one move: **take the PlayerController node from Kai, give it to Lyra, and switch Kai's AI on.** Nothing inside either character changes.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'Moving a node to another parent',
          md: md`\`node.reparent(new_parent, keep_global_transform)\` removes a node from its parent and adds it to another in one call, firing the exit and enter tree notifications but **not** \`_ready\` again. Two consequences for the PlayerController:

1. Its \`@onready var character = get_parent()\` was evaluated once, for the first parent. After a reparent it still points at Kai, so the manager sets \`player_controller.character\` by hand.
2. A newly added child goes to the end of the child list. Siblings process in tree order, and c05 placed the PlayerController *above* the StateMachine so the intent is written before it is read. \`move_child(controller, 0)\` puts it back at the top; otherwise the new leader reacts one frame late.`,
        },
        {
          kind: 'viz',
          viz: { type: 'combat.party' },
          task: md`Press *switch_to(1)* and watch which controller node each character has, and where the camera points. Then tick *Lyra is KO* and press *Q (next alive)* twice. Finally make Kai KO while he is the leader: what happens to control?`,
          caption: md`The figure runs the same \`PartyManager\` class as the battle figure. A switch changes two things only: which Character has the PlayerController, and the camera's target. Every other node is untouched.`,
        },
        { kind: 'code', file: 'scripts/battle/party_manager.gd', code: PARTY_MANAGER_V1 },
        {
          kind: 'text',
          md: md`Reading the script for the reasoning behind each line:

- **One PlayerController, moved.** An alternative is a PlayerController on every member, enabled on one. That works too, but then three nodes read \`Input\` and a mistake leaves two enabled, which moves two characters at once. A single node makes "exactly one member is controlled" true by construction.
- **\`intent.clear()\` on everyone.** If Kai was holding *right* when you switched, his intent still says \`move = (1, 0)\` and his AI only overwrites it on its next tick. Clearing removes stale input from both sides of the switch.
- **\`gain_scale\`.** k03's tuning gives uncontrolled members half the ATB per hit. The gauge has the knob (k04-1); the manager turns it.
- **The camera** is one \`Camera2D\` that the manager moves to the leader every physics tick. With **Position Smoothing** enabled in the Inspector (speed about 6), a switch becomes a short glide that shows the player where the new character is.
- **\`call_deferred\`** in \`_ready\`: reparenting while the scene is still being set up can collide with Godot adding children; deferring waits until the frame's setup is done.`,
        },
        {
          kind: 'check',
          q: md`After a switch, the new leader ignores the keyboard while the old leader keeps walking in the direction you last pressed. Which line did the author forget?`,
          options: [md`\`player_controller.character = lead\``, md`\`lead.move_child(player_controller, 0)\``, md`\`leader_changed.emit(leader())\``, md`\`ai.process_mode = Node.PROCESS_MODE_DISABLED\``],
          answer: 0,
          explain: md`The controller moved in the tree, but its \`character\` variable still points at the old leader, so it keeps writing that character's intent. Forgetting \`move_child\` would only delay the response by one frame.`,
        },
        {
          kind: 'steps',
          title: 'Build the party',
          steps: [
            md`Make Lyra and Bram scenes from Kai's: **Scene → New Inherited Scene** on \`scenes/kai.tscn\`, then swap the \`SpriteFrames\` to \`mage\` and \`guard\` and adjust the \`AtbGauge\`, \`AbilityRunner\` and \`HealthComponent\` numbers from k03-3's role table.`,
            md`Add an \`AllyAIController\` child (a \`Node\` for now, with an empty script; lesson 2 writes it) to all three, named exactly \`AllyAIController\`. Remove the \`PlayerController\` from Lyra and Bram: there must be only one, under Kai.`,
            md`In your field scene, add a \`Node2D\` named \`Party\` with \`scripts/battle/party_manager.gd\`. Move Kai under it and instance Lyra and Bram next to him. Add a \`Camera2D\` child of \`Party\` with **Position Smoothing → Enabled** on.`,
            md`Select \`Party\` and fill the exports: \`members\` = Kai, Lyra, Bram (in that order), \`player_controller\` = Kai's PlayerController, \`camera\` = the Camera2D. Point \`TacticalMode.player_controller\` at the same node.`,
            md`Add a \`switch_character\` action to the Input Map if it is missing (**Q**, a gamepad shoulder button). Run the scene and press **Q**.`,
          ],
          result: md`Kai walks with the keyboard; **Q** hands control to Lyra and the camera glides to her; Kai stops where he was (his AI does nothing yet). Another **Q** goes to Bram, then back to Kai.`,
          troubleshoot: [
            { problem: md`Error: \`Node not found: "AllyAIController"\`.`, fix: md`One member lacks the node, or it is named differently. The manager looks it up by name with \`get_node\`.` },
            { problem: md`Two characters move at once.`, fix: md`A second PlayerController is still in one of the inherited scenes. Search the Scene dock for it.` },
            { problem: md`The camera snaps instead of gliding.`, fix: md`Position Smoothing is off, or the camera is a child of Kai (it then moves with him). It must be a child of \`Party\`.` },
          ],
        },
        {
          kind: 'viz',
          viz: { type: 'combat.battle', mode: 'party' },
          task: md`Fight the first wave using only Kai, then restart and switch to Bram whenever an enemy winds up (hold **E** to guard with him). Compare how fast the party's ATB segments fill in each run, using the readout.`,
          caption: md`The readout is the live state of the \`PartyManager\`: which member has the PlayerController, each member's ATB segments and queued command. Uncontrolled members gain half ATB per hit.`,
        },
        {
          kind: 'numeric',
          q: md`Lyra, uncontrolled, lands one bolt every 1.1 s for 10 ATB per hit at \`ai_atb_scale\` 0.5, plus 3 ATB/s passive. How many seconds until she has one segment (100 ATB) from empty?`,
          answer: { kind: 'number', value: 100 / (10 * 0.5 / 1.1 + 3) },
          explain: md`Hit ATB per second: $10 \times 0.5 / 1.1 \approx 4.55$. Total $\approx 7.55$ ATB/s, so $100/7.55 \approx 13.2$ s. Controlling her (scale 1, faster bolts) roughly halves it: switching matters.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'k05-1-build',
            title: 'Switching that survives a KO',
            goal: md`Extend the PartyManager so KO members are skipped, the player is moved off a member who falls, and \`party_defeated\` fires when nobody is left. Hook it into the encounter from k04-3.`,
            requirements: [
              md`**Q** cycles to the next member who is not KO, skipping fallen ones.`,
              md`If the controlled member falls, control moves to the next living member on the same tick.`,
              md`When all three are KO, \`party_defeated\` is emitted once, and the encounter emits \`Events.battle_lost\`.`,
              md`\`revive(member)\` (used by the Revive Feather item later) makes a member selectable again.`,
              md`The HUD highlights whoever is in control, through \`leader_changed\`.`,
            ],
            hints: [
              md`Connect each member's \`health.died\` with \`.bind(member)\` so one handler knows who fell.`,
              md`In the encounter, replace the \`player\` export with a \`party: PartyManager\` and connect \`party.party_defeated\` to \`_lose\` with \`CONNECT_ONE_SHOT\`.`,
            ],
            solution: [{ file: 'scripts/battle/party_manager.gd', code: PARTY_MANAGER_FULL }],
            explain: md`The KO list is the manager's own record, so it does not depend on how \`HealthComponent\` stores health. \`next_alive_index\` walks forward from the leader, wrapping, and returns -1 only when everyone is down, which \`_on_member_died\` turns into \`party_defeated\` before trying to switch.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'k05-1-paper',
            title: 'Next alive',
            type: 'compute',
            difficulty: 1,
            minutes: 4,
            statement: md`Members are [Kai, Lyra, Bram] (indices 0, 1, 2). Bram is in control and Kai is KO. Which index does \`next_alive_index()\` return? Show the indices it checks.`,
            solution: [md`From \`current_index\` 2, it checks $(2 + 1) \bmod 3 = 0$ (Kai, KO, skip), then $(2 + 2) \bmod 3 = 1$ (Lyra, alive).`, md`It returns 1.`],
            answer: { kind: 'number', value: 1 },
            areas: ['godot', 'combat'],
          },
        },
        {
          kind: 'recall',
          prompt: md`What exactly changes in the scene tree when \`switch_to(1)\` runs?`,
          answer: md`The single PlayerController is reparented to member 1 and moved to child index 0, and its \`character\` variable is updated. Member 1's AllyAIController is disabled and the others' are enabled. Every member's intent is cleared, ATB gain scales are set, and \`leader_changed\` is emitted (the camera follows the new leader from the next physics tick).`,
        },
      ],
      cards: [
        { id: 'k05-1-c1', kind: 'concept', front: md`Why does switching characters only move a controller node?`, back: md`Characters never read Input; they read intent written by a controller child (c05). Moving the PlayerController and enabling AI on the old leader changes who drives each body without touching their state.` },
        { id: 'k05-1-c2', kind: 'cloze', text: md`After reparent(), call {{}}(controller, 0) so the controller runs before the StateMachine.`, answers: ['move_child'] },
        { id: 'k05-1-c3', kind: 'concept', front: md`Why must PartyManager set player_controller.character after reparenting?`, back: md`@onready ran once, for the first parent; reparent does not run _ready again, so the variable still points at the old leader.` },
        { id: 'k05-1-c4', kind: 'compute', front: md`Members 4, current index 3, members 0 and 1 KO. next_alive_index()?`, answer: { kind: 'number', value: 2 }, back: md`Checks 0 (KO), 1 (KO), 2 (alive): returns 2.` },
        { id: 'k05-1-c5', kind: 'concept', front: md`Why clear every member's intent on a switch?`, back: md`A held direction or buffered press from before the switch would otherwise keep driving the old leader (or the new one) until its new controller writes over it.` },
      ],
    },
    // ======================================================================================== k05-2
    {
      id: 'k05-2',
      title: 'Allies that fight on their own, and commands',
      minutes: 45,
      objectives: [
        'Write an AllyAIController that follows the leader with spacing, fights the leader\'s target with basic attacks and guards against telegraphs.',
        'Compare follow strategies (chase, trail, formation slots) and predict where each fails.',
        'Compute flanking positions around a target and the spacing they give.',
        'Issue commands from tactical mode (member, ability, target) that pay on confirm and queue on the member\'s AbilityRunner.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Watch an FF7 Remake fight without touching the controller: the party members you are not playing keep attacking with basic attacks, they guard now and then, and they stay near the action. What they do *not* do is cast Firaga on their own; abilities only happen when you order them. That split is deliberate, and Shardbound copies it:

- **Allies are competent but plain.** They follow, attack, guard and stay out of each other's way. A player who never opens the menu still has a party that helps.
- **Every ability is the player's decision.** Allies never spend ATB. That keeps fights readable (you know why a big spell went off) and keeps the tactical layer worth opening.`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'Rules for Shardbound\'s allies',
          md: md`1. **No enemy near the leader:** follow the leader's path at a fixed spacing, one slot each.
2. **An enemy near the leader:** that is the *focus target*. Take a flanking spot beside it and attack with basic attacks every \`attack_pause\` seconds (1 s: slower than a player).
3. **An enemy telegraphs nearby:** guard (Bram and Kai) instead of attacking. Bram's guard earns ATB, so a good ally also charges the player's resources.
4. **A command is running:** step aside and let the AbilityRunner work.
5. **Never** spend ATB without a command.`,
        },
        {
          kind: 'viz',
          viz: { type: 'combat.partyfollow', strategy: 'chase' },
          task: md`With *chase*, walk Kai through the gap between the two walls and stop: count how often an ally reads "stuck", and look at the Lyra-Bram distance. Switch to *trail* and repeat. Then try *slots* and walk up against the left wall, so a slot ends up inside the wall.`,
          caption: md`Crosses mark each ally's current target point. Chasing the leader is one line of code, but allies stack on top of each other and push into walls. A trail follows the leader's own path, so it always leads around obstacles. Formation slots look neat in open ground but can sit inside walls.`,
        },
        {
          kind: 'text',
          md: md`Shardbound uses the **trail** for following: the PartyManager records a point every 3 px the leader moves, and each ally walks to the point that is \`(slot + 1) × follow_distance\` pixels back along that path. It costs a small array and a loop, and it never asks an ally to walk through a wall the leader just walked around.

In a fight, allies switch to **flanking spots** around the focus target instead: positions on a circle around the enemy, offset to either side of the leader. That is the next derivation.`,
        },
        { kind: 'code', file: 'scripts/battle/party_manager.gd', code: PARTY_ADD_FOLLOW, fragment: true },
        {
          kind: 'derive',
          title: 'flanking spots around a target',
          goal: md`The leader attacks from angle $\theta_L$ around the target. Each ally stands at radius $r$ and angle $\theta_L \pm \Delta$. Find the distance between the leader and an ally, and the smallest $\Delta$ that keeps them at least $d$ apart.`,
          steps: [
            {
              md: md`Two points on a circle of radius $r$, separated by angle $\Delta$, are a chord apart: $$c = 2r\sin\frac{\Delta}{2}.$$`,
              choose: {
                prompt: md`Where does the formula come from?`,
                options: [md`Split the isosceles triangle (centre and two points) into two right triangles with angle $\Delta/2$`, md`The arc length $r\Delta$`, md`The law of sines with a right angle at the centre`],
                answer: 0,
                explain: md`Each half of the chord is $r\sin(\Delta/2)$. The arc length $r\Delta$ is slightly longer than the chord and only close for small angles.`,
              },
            },
            { md: md`Requiring $c \ge d$: $$\Delta \ge 2\arcsin\frac{d}{2r}.$$` },
            { md: md`With melee radius $r = 16$ px and minimum spacing $d = 14$ px (two bodies of radius 5 plus a gap): $\Delta \ge 2\arcsin(14/32) \approx 0.905$ rad $\approx 52°$. The script uses $\Delta = 1.2$ rad ($69°$), which gives $c = 2 \cdot 16 \sin 0.6 \approx 18$ px, and the two allies are $2\Delta = 2.4$ rad apart, about 30 px.` },
          ],
          takeaway: md`Three melee fighters fit around one small enemy only if the radius is large enough. Lyra's \`attack_range\` of 60 puts her on a much larger circle, so she never competes for melee spots.`,
        },
        {
          kind: 'numeric',
          q: md`Allies stand at radius $r = 20$ px around the golem, at $\pm 1.0$ rad from the leader. How far is each ally from the leader, in px?`,
          answer: { kind: 'number', value: 2 * 20 * Math.sin(0.5) },
          explain: md`$c = 2r\sin(\Delta/2) = 40 \sin 0.5 \approx 19.2$ px.`,
        },
        { kind: 'code', file: 'scripts/ally_ai_controller.gd', code: ALLY_AI, note: md`The ally knows nothing about enemy AI internals: it reads the \`telegraphing\` group, which enemies join in their windup state (fragment below). Kai and Bram guard; for Lyra, set \`guard_radius\` to 0 and give her an \`attack_range\` of 60, and she simply stays out of reach. The AI never touches \`AbilityRunner.enqueue\`, which is rule 5 enforced by structure.` },
        { kind: 'code', file: 'scripts/states/windup.gd', code: TELEGRAPH_GROUP, fragment: true },
        {
          kind: 'text',
          md: md`### Commands from tactical mode

The menu's job is to turn three choices into one \`BattleCommand\`:

1. **Who.** It opens on the member you control; **Q** (\`switch_character\`) moves to the next member who is not KO.
2. **What.** The member's \`AbilityRunner.abilities\`, greyed out when \`can_use\` is false (not enough ATB or MP).
3. **On whom.** Enemies or allies, sorted left to right; self and all-target abilities skip this step.

Confirming calls \`enqueue\`, which pays the cost and queues the command, and closes tactical mode. The member runs it as soon as they are free, even while you keep fighting with someone else. You can queue one command for each segment a member has, so "Lyra: Blizzard, then Fire" is two menu visits and two segments.`,
        },
        { kind: 'code', file: 'ui/command_menu.gd', code: COMMAND_MENU, note: md`Bind **J** and the gamepad's A button to \`ui_accept\` and **K** and B to \`ui_cancel\` in the Input Map, so the menu uses the same buttons as attacking and dodging. The menu runs with \`PROCESS_MODE_ALWAYS\`, like \`TacticalMode\`, so it also works in wait style.` },
        {
          kind: 'viz',
          viz: { type: 'combat.battle', mode: 'party' },
          task: md`Without switching away from Kai, open tactical mode, press **→** to select Lyra, choose *Blizzard* and target the skeleton. Then order Bram's *Shield Bash* on the same target. Watch the stagger meter. How many basic hits does Kai need afterwards to finish the stagger?`,
          caption: md`A queued command shows its name above the member until it lands. Lyra walks to range only if needed; she casts from up to 120 px away.`,
        },
        {
          kind: 'check',
          q: md`The menu shows Lyra with one segment. You order *Fire*, reopen the menu at once and order *Blizzard*. What happens, and why is it the right behaviour?`,
          options: [md`Blizzard is greyed out ("Not enough ATB"), because Fire's segment was paid when it was queued.`, md`Both are queued, and Blizzard fails silently later.`, md`Fire is replaced by Blizzard.`, md`Both cast, and Lyra's ATB goes negative.`],
          answer: 0,
          explain: md`Paying in \`enqueue\` means the menu always shows what is really available. If payment happened when the cast started, the menu would accept the second order and it would vanish later with no feedback.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'k05-2-build',
            title: 'A party that fights, and a menu that commands it',
            goal: md`Give Lyra and Bram their AllyAIController, and build the command menu so you can order any member to use an ability on a chosen target.`,
            requirements: [
              md`Outside battle, Lyra and Bram follow Kai's path at about 18 and 36 px, and walk around walls he walked around.`,
              md`In battle, they take spots on either side of the focus target and attack with basic attacks about once a second; they never use an ability on their own.`,
              md`When an enemy winds up next to Bram, he guards (and his ATB rises when the hit lands).`,
              md`From tactical mode you can choose any living member, an ability they can afford and a target; the ability runs shortly after the menu closes.`,
              md`Abilities they cannot afford are greyed out, and choosing one shows why.`,
            ],
            hints: [
              md`Build \`ui/command_menu.tscn\` as \`PanelContainer > VBox (VBoxContainer) > Title (Label), List (VBoxContainer), Info (Label)\`, and set it as \`TacticalMode.menu\`.`,
              md`Set the allies' \`party\` export to the \`Party\` node and give Lyra \`slot\` 0 and Bram \`slot\` 1.`,
              md`If allies jitter at their spot, raise the 6 px "close enough" distance in \`_fight\` or lower their acceleration.`,
            ],
            solution: [
              { file: 'scripts/ally_ai_controller.gd', code: ALLY_AI },
              { file: 'ui/command_menu.gd', code: COMMAND_MENU },
            ],
            explain: md`The AI and the menu never talk to each other. The AI writes intent; the menu writes commands into the AbilityRunner's queue; the runner sets \`busy\`, which the AI checks so it stops steering while an ability plays. Each piece can be tested alone: the menu works with no AI at all, and the AI works if the menu is never opened.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'k05-2-paper',
            title: 'Room for three',
            type: 'compute',
            difficulty: 2,
            minutes: 6,
            statement: md`Kai and two melee allies surround a slime at radius $r$ px, spaced evenly ($120°$ apart). Bodies need 14 px between centres. What is the smallest $r$?`,
            hints: [md`Use the chord $2r\sin(\Delta/2) \ge d$ with $\Delta = 120°$.`],
            solution: [md`$2r\sin 60° \ge 14 \iff r\sqrt3 \ge 14$.`, md`$r \ge 14/\sqrt3 \approx 8.08$ px. A slime's radius plus a character's is about 11 px, so even radius 11 leaves room; it is the larger golem that needs bigger spots.`],
            answer: { kind: 'number', value: 14 / Math.sqrt(3) },
            areas: ['math', 'combat'],
          },
        },
        {
          kind: 'explain',
          prompt: md`Why is "allies never spend ATB on their own" enforced by the code's structure (the AI has no path to \`enqueue\`) rather than by a setting?`,
          model: md`A rule enforced by structure cannot be broken by accident: there is simply no line in the AI that queues an ability, so no bug in its decision logic can fire one. A setting ("allow ally abilities: off") would leave the code path in place, and a later change (a smarter AI, a cheat flag left on, a refactor) could re-enable it without anyone noticing. Keeping the menu as the only producer of commands also makes the system easy to reason about and to test: every ability in a log was ordered by the player.`,
        },
      ],
      cards: [
        { id: 'k05-2-c1', kind: 'concept', front: md`Why do Shardbound's allies follow the leader's trail instead of chasing the leader?`, back: md`Chasing stacks allies on one point and pushes them into walls the leader walked around; a trail follows the leader's actual path at fixed spacing.` },
        { id: 'k05-2-c2', kind: 'compute', front: md`Chord between two points at radius 16 px, 1.2 rad apart?`, answer: { kind: 'number', value: 32 * Math.sin(0.6) }, back: md`$2 \cdot 16 \sin 0.6 \approx 18.1$ px.` },
        { id: 'k05-2-c3', kind: 'cloze', text: md`Enemies join the "{{}}" group in their windup state so allies can guard without knowing the enemy's AI.`, answers: ['telegraphing'] },
        { id: 'k05-2-c4', kind: 'concept', front: md`The three choices a tactical command needs, and what confirming does.`, back: md`Member, ability, target. Confirming calls AbilityRunner.enqueue, which pays ATB/MP and queues a BattleCommand; then tactical mode closes.` },
        { id: 'k05-2-c5', kind: 'concept', front: md`What does an ally do while its AbilityRunner is busy?`, back: md`Nothing: the AllyAIController clears move and guard and returns, so it does not steer away during a commanded ability.` },
      ],
    },
    // ======================================================================================== k05-3
    {
      id: 'k05-3',
      title: 'Synergy, limit breaks and the party HUD',
      minutes: 40,
      objectives: [
        'Find synergies in the numbers: Bram\'s guard feeding ATB, Lyra hitting weaknesses for pressure, staggers paying off Kai\'s Braver.',
        'Build a LimitGauge that fills from damage taken (in proportion to max HP), hits dealt and staggers, and a limit break paid from it.',
        'Compute how quickly a limit fills from damage taken.',
        'Build a party HUD of HP, MP, ATB segments and limit, driven only by signals.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A **synergy** is when one character's action makes another's better. Shardbound does not need special "combo" code for it: the systems from k04 already connect, and the numbers decide how strongly.

- **Bram guards, the party gets ATB.** Bram guarding the golem's slam earns 25 ATB for 6 damage. His Shield Bash then pressures the golem.
- **Lyra hits a weakness, everyone staggers faster.** Blizzard on the skeleton adds 42 stagger and pressures it, so every member's hits count double for 4 s.
- **The stagger pays off Kai's ATB.** Braver at ×1.85 deals 52 instead of 28.

The figure at the end of this lesson is the whole system. First, the last two pieces: the limit gauge and the HUD.`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'Synergy chains in Shardbound',
          md: md`| Setup | Payoff | Numbers |
|---|---|---|
| Bram guards a telegraphed hit | Bram's Shield Bash sooner | +25 ATB per block |
| Shield Bash or a weakness spell pressures | everyone's stagger ×2 for 4 s | Kai's string: 9 → 18 stagger |
| A stagger | Braver, Fire, limit breaks ×1.6 or more | Focus Strike +0.25 each |
| Taking hits | limit gauge | 90 points per max HP lost |
| Staggering an enemy | limit for the whole party | +10 each |

Good synergies cross characters, so the player has a reason to switch and to command.`,
        },
        {
          kind: 'derive',
          title: 'how fast Bram\'s guard pays',
          goal: md`An enemy attacks Bram every $T$ seconds and he guards each attack. Compare his ATB rate from guarding with his rate from attacking.`,
          steps: [
            { md: md`Guarding: one block per $T$ seconds, $b$ ATB each: $r_{\text{guard}} = b/T$.` },
            {
              md: md`Attacking (controlled): $r_{\text{atk}} = a\,h\,u$ from k03.`,
              choose: {
                prompt: md`With $b = 25$, $T = 2.5$ s, $a = 9$, $h = 1.6$, $u = 0.5$, which is larger?`,
                options: [md`Guarding: 10 ATB/s against 7.2 ATB/s`, md`Attacking: 14.4 ATB/s against 10`, md`They are equal`],
                answer: 0,
                explain: md`$25/2.5 = 10$ and $9 \times 1.6 \times 0.5 = 7.2$. Against a steady attacker, Bram's best ATB source is standing in front of it.`,
              },
            },
            { md: md`He can do both: guard the telegraphed hit, then attack in the recovery window. His total, about 17 ATB/s, fills a segment every 6 s while taking $0.2 \times$ damage, so Shield Bash comes up about once per golem slam cycle.` },
          ],
          takeaway: md`The designer's lever is $b$: it decides whether guarding is a defensive reflex or Bram's main job. 25 makes it his job.`,
        },
        {
          kind: 'numeric',
          q: md`Lyra (max HP 100) takes three hits of 14 damage. With \`per_max_hp_taken\` 90, how many limit points does she gain?`,
          answer: { kind: 'number', value: (90 * 42) / 100 },
          explain: md`She loses 42 HP, which is 0.42 of her max: $90 \times 0.42 = 37.8$ points.`,
        },
        { kind: 'code', file: 'scripts/components/limit_gauge.gd', code: LIMIT_GAUGE, note: md`\`_last_health\` turns \`health_changed(current, maximum)\` into "how much was lost"; heals raise it, so only real damage counts. Dividing by max HP keeps the gauge fair across characters: Bram (190 HP) and Lyra (100 HP) both fill 90 points by losing their whole health.` },
        { kind: 'code', file: 'scripts/autoload/events.gd', code: STAGGER_EVENT, fragment: true, note: md`Three small additions in three files: the event, its emission when an enemy is staggered, and a flag that marks an \`AbilityData\` as a limit break.` },
        {
          kind: 'derive',
          title: 'time to a limit',
          goal: md`Estimate how long a character takes to fill the limit gauge from damage taken and hits dealt.`,
          steps: [
            { md: md`Damage taken at $D$ HP/s fills $k\,D/H$ points per second ($k$ = \`per_max_hp_taken\`, $H$ = max HP). Hits dealt at $h u$ per second fill $q\,h\,u$ ($q$ = \`per_hit_dealt\`).` },
            {
              md: md`Time to fill $L$ points: $$t_{\text{limit}} = \frac{L}{k\,D/H + q\,h\,u}.$$`,
              choose: {
                prompt: md`Kai: $H = 140$, takes $D = 4$ HP/s, $k = 90$, $q = 0.5$, $h u = 1.5$, $L = 100$. Roughly how long?`,
                options: [md`about 31 s`, md`about 3 s`, md`about 140 s`],
                answer: 0,
                explain: md`$90 \times 4/140 \approx 2.57$ plus $0.5 \times 1.5 = 0.75$: 3.32 points/s, so $100/3.32 \approx 30$ s. Staggers add 10 each and shorten it further.`,
              },
            },
          ],
          takeaway: md`About one limit per character per tough fight is the target: rare enough to feel special, common enough that players learn to use them.`,
        },
        { kind: 'assets', ids: ['ui_panel', 'ui_bars', 'icons', 'font_pixel'], note: md`\`ui_panel\` is the nine-slice window for each member's panel (patch margins 8). \`ui_bars\` rows: HP 0, MP 1, ATB 2, ATB full 3. The pixel font keeps HUD text crisp at 320×180.` },
        { kind: 'code', file: 'ui/member_panel.gd', code: MEMBER_PANEL },
        { kind: 'code', file: 'ui/party_hud.gd', code: PARTY_HUD, note: md`The HUD never polls: each bar changes only when its signal fires, so an idle HUD costs nothing and cannot show a value that the game did not report. \`await party.ready\` handles the case where the HUD's \`CanvasLayer\` sits above the party in the tree and becomes ready first.` },
        {
          kind: 'steps',
          title: 'Build the party HUD',
          steps: [
            md`Create \`ui/member_panel.tscn\`: a \`PanelContainer\` with a \`StyleBoxTexture\` using \`ui_panel\` (texture margins 8). Inside, a \`VBoxContainer\` named \`VBox\` with \`Name\` (Label), \`HP\` (TextureProgressBar), \`HPText\` (Label), an \`HBoxContainer\` \`ATB\` with \`Segment1\` and \`Segment2\` (TextureProgressBar), \`MP\` (Label) and \`Limit\` (ProgressBar, 2 px tall).`,
            md`For each TextureProgressBar use \`AtlasTexture\`s of \`ui_bars\`: *Under* = the empty row \`(0, 30, 48, 6)\`, *Progress* = the HP row \`(0, 0, 48, 6)\` or the ATB row \`(0, 12, 48, 6)\`. Attach \`ui/member_panel.gd\`.`,
            md`In the field scene's HUD \`CanvasLayer\`, add an \`HBoxContainer\` anchored to the bottom of the screen with \`ui/party_hud.gd\`; set \`party\` and \`panel_scene\`.`,
            md`Add a \`LimitGauge\` to each member, with \`limit_break\` set to \`cross_slash.tres\`, \`healing_wind.tres\` or \`earthbreaker.tres\` (each with \`is_limit\` on), and set the runner's \`limit\` export.`,
            md`Run, take some hits, and watch every bar move without any \`_process\` code in the HUD.`,
          ],
          result: md`Three panels sit along the bottom edge. HP drops as members are hit, ATB segments fill and flash, MP falls when spells are cast, the limit line grows with damage taken, and the controlled member's name is marked with \`>\`.`,
          troubleshoot: [
            { problem: md`Error: \`Invalid access to property 'changed' on a base object of type 'Nil'\` in \`bind\`.`, fix: md`A member has no \`AtbGauge\`, or the HUD bound before the party was ready. Check the node names and that \`_ready\` awaits \`party.ready\`.` },
            { problem: md`The bars stay full or empty.`, fix: md`\`max_value\` is still 100 while the HP is 190, or the progress texture is missing. \`_on_health_changed\` sets \`max_value\` on every update; check that \`fill_mode\` is *Left to Right*.` },
          ],
        },
        {
          kind: 'check',
          q: md`Why does the HUD update from signals instead of reading every member's values in \`_process\`?`,
          options: [md`It does work only when something changes, and it shows exactly what the game reported, in the same frame.`, md`\`_process\` cannot read other nodes' variables.`, md`Signals are faster than reading a variable.`, md`\`_process\` stops while tactical mode is open.`],
          answer: 0,
          explain: md`Polling three members every frame works, but it spreads knowledge of every component's internals into the HUD and runs when nothing changes. Signals keep the HUD a pure listener. (\`_process\` does run in tactical mode, with a smaller delta.)`,
        },
        {
          kind: 'viz',
          viz: { type: 'combat.battle', mode: 'full' },
          task: md`Win the full fight, then try to win faster. Use at least one synergy on purpose: Bram guards the golem's slam and Shield Bashes it, Lyra's Blizzard pressures the skeleton, and Kai saves Braver for the stagger. When a limit line flashes, open the menu: the limit break is at the top.`,
          caption: md`Two waves: slimes and a skeleton, then the golem with a slime. The thin line under each member's ATB is the limit gauge. The fight is tuned for 60 to 90 s with tactics; mashing alone takes noticeably longer.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'k05-3-build',
            title: 'Limit breaks',
            goal: md`Make limit breaks work end to end: the gauge fills, the menu lists the limit break first when it is full, using it empties the gauge, and it costs no ATB or MP.`,
            requirements: [
              md`Each member has a \`LimitGauge\` with a limit break resource (\`is_limit\` on).`,
              md`The command menu lists the limit break at the top only while the gauge is full.`,
              md`Using it empties the limit gauge and leaves ATB and MP untouched.`,
              md`The HUD's limit bar empties at the same moment.`,
              md`Staggering an enemy adds limit to every party member.`,
            ],
            hints: [
              md`In \`CommandMenu\`, replace \`_runner().abilities\` with \`_runner().menu_abilities()\` everywhere, so the list and the cursor agree.`,
              md`Earthbreaker uses \`Target.ALL_ENEMIES\` and \`pressures\`; Healing Wind uses \`ALL_ALLIES\` with \`heal\` and power 0.`,
            ],
            solution: [{ file: 'scripts/components/ability_runner.gd', code: ABILITY_RUNNER_K05 }],
            explain: md`The limit break is just another \`AbilityData\`; the only difference is where its cost comes from. \`can_use\` and \`enqueue\` branch on \`is_limit\`, and \`menu_abilities()\` builds the list the menu shows, so the menu needs no special case beyond calling it. \`set_mp\` emits \`mp_changed\`, which the HUD panel listens to.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'k05-3-paper',
            title: 'Fair limit gain',
            type: 'compute',
            difficulty: 2,
            minutes: 6,
            statement: md`Suppose limit gain were a flat 0.5 points per HP lost instead of proportional. Bram (190 HP) and Lyra (100 HP) each lose 60% of their HP. How many points does each gain, under the flat rule and under the lesson's rule ($k = 90$)? Enter [Bram flat, Lyra flat, Bram proportional, Lyra proportional].`,
            solution: [md`Flat: Bram loses 114 HP → 57 points; Lyra loses 60 HP → 30 points.`, md`Proportional: both lose 0.6 of their max: $90 \times 0.6 = 54$ points each.`, md`The flat rule makes the tank's limit come almost twice as fast for the same danger; proportional gain ties the limit to how close each character came to falling.`],
            answer: { kind: 'vector', value: [57, 30, 54, 54] },
            areas: ['combat', 'math'],
          },
        },
        {
          kind: 'explain',
          prompt: md`Describe one synergy in Shardbound's party in terms of the systems that create it (which signal, gauge or state each step touches), from the first action to the payoff.`,
          model: md`Bram guards the golem's slam: the golem's windup state put it in the \`telegraphing\` group, so Bram's AllyAIController set \`wants_guard\` and he entered Guard. The hit arrives through his Hurtbox; \`Character._on_hurt\` reduces it by \`guard_factor\` and adds \`atb_per_block\` (25) to his AtbGauge, which fills a segment and emits \`segment_filled\`. In tactical mode the player commands Shield Bash; \`enqueue\` pays the segment, and the AbilityRunner later emits a HitData with \`pressures\` on the golem's Hurtbox. The golem's StaggerComponent enters PRESSURED, so for 4 s Kai's basic hits add double stagger. When the meter fills, it emits \`staggered\`; the golem enters its Staggered state, Events.enemy_staggered adds limit to the party, and Kai's saved Braver lands at ×1.6.`,
        },
      ],
      cards: [
        { id: 'k05-3-c1', kind: 'concept', front: md`What is a synergy, in Shardbound's terms?`, back: md`One character's action makes another's better through shared systems: Bram's guard → ATB → Shield Bash → pressure → everyone's stagger; a stagger → Kai's Braver ×1.6.` },
        { id: 'k05-3-c2', kind: 'compute', front: md`Max HP 150, k = 90. Limit points for losing 50 HP?`, answer: { kind: 'number', value: 30 }, back: md`$90 \times 50/150 = 30$.` },
        { id: 'k05-3-c3', kind: 'concept', front: md`Why does LimitGauge._ready find HealthComponent with get_node instead of using the parent's health variable?`, back: md`Children become ready before their parent, so the parent's @onready variables are still null when the child's _ready runs.` },
        { id: 'k05-3-c4', kind: 'cloze', text: md`MemberPanel updates only through signals; for HP it connects to health.{{}}(current, maximum).`, answers: ['health_changed'] },
        { id: 'k05-3-c5', kind: 'compute', front: md`Guard ATB 25 per block, one block every 2.5 s. ATB per second from guarding?`, answer: { kind: 'number', value: 10 }, back: md`$25/2.5 = 10$ ATB/s.` },
      ],
    },
  ],
  problems: [
    {
      id: 'k05-p1',
      title: 'ATB when switching',
      type: 'compute',
      difficulty: 2,
      minutes: 6,
      statement: md`Kai lands 1.5 hits/s for 11 ATB each; uncontrolled members get 50%. Passive charge is 2/s for everyone. Over a 20 s stretch, how much more ATB does Kai earn if you control him the whole time instead of controlling Bram?`,
      solution: [md`Controlled: $11 \times 1.5 + 2 = 18.5$ ATB/s, so 370 in 20 s (capped at 200 if not spent, but assume he spends).`, md`Uncontrolled: $5.5 \times 1.5 + 2 = 10.25$ ATB/s, so 205.`, md`Difference: 165 ATB, about one and a half segments.`],
      answer: { kind: 'number', value: 165 },
      areas: ['combat', 'math'],
    },
    {
      id: 'k05-p2',
      title: 'The switch that lags a frame',
      type: 'debug',
      difficulty: 2,
      minutes: 8,
      statement: md`After a switch, the new leader responds to input one physics tick late, which shows up as a dropped buffered attack. The manager does:

\`\`\`gdscript
player_controller.reparent(lead, false)
player_controller.character = lead
\`\`\`

Explain the delay and fix it.`,
      solution: [md`\`reparent\` adds the controller as the *last* child of the new leader, after its StateMachine. Siblings process in tree order, so on each tick the StateMachine reads the intent before the controller writes it: the input of tick $n$ is acted on in tick $n + 1$.`, md`Add \`lead.move_child(player_controller, 0)\` so the controller runs first again, as c05 required.`],
      rubric: [md`Identifies child order after reparent`, md`Connects tree order to processing order`, md`Fixes with move_child to index 0`],
      areas: ['godot'],
    },
    {
      id: 'k05-p3',
      title: 'Trail distance',
      type: 'compute',
      difficulty: 2,
      minutes: 6,
      statement: md`The leader walked from $(0, 0)$ to $(30, 0)$, then to $(30, 40)$, recording a trail point every few pixels along those two segments. Bram's slot is 1 and \`follow_distance\` is 18. Where is Bram's target point, \`point_behind_leader(36)\`?`,
      hints: [md`Walk back from the leader at $(30, 40)$ along the path.`],
      solution: [md`The last segment, from $(30, 0)$ to $(30, 40)$, is 40 px long, more than 36.`, md`So the point is 36 px back along it: $(30, 40 - 36) = (30, 4)$.`],
      answer: { kind: 'vector', value: [30, 4] },
      areas: ['math'],
    },
    {
      id: 'k05-p4',
      title: 'Allies and the golem',
      type: 'design',
      difficulty: 3,
      minutes: 12,
      statement: md`Playtesters say the allies "stand in the golem's slam". The slam hits a circle of radius 30 px around a point 20 px in front of the golem, after a 1 s windup. Design changes to the AllyAIController (not the golem) so allies avoid it, and explain how each change reads the situation without peeking into the golem's script.`,
      solution: [
        md`Expose the danger area as data on the telegraph: in its windup state the golem joins \`telegraphing\` and sets a \`telegraph_area: Rect2\` or a centre and radius that any reader can query. The ally reads that, not the golem's internals.`,
        md`In \`_threatened\`, for an area telegraph, compute the distance from the ally to the area's centre. If it is inside the radius plus a margin, steer straight away from the centre (Lyra, Kai) or guard if leaving in time is impossible (Bram, who also gains ATB from it).`,
        md`Use the remaining windup time: leaving needs (radius − distance) / speed seconds; at 80 px/s and 15 px to cover, 0.19 s. If more time remains, move; otherwise guard.`,
        md`Return to the flanking spot after the slam (the group membership ends with the windup).`,
      ],
      rubric: [md`Communicates the danger through data the golem publishes (group, area), not by reading its script`, md`Chooses between moving out and guarding using time and distance`, md`Handles returning to the fight afterwards`],
      areas: ['combat'],
    },
    {
      id: 'k05-p5',
      title: 'Why commands pay on confirm',
      type: 'concept',
      difficulty: 1,
      minutes: 4,
      statement: md`Explain what would go wrong for the player if \`AbilityRunner\` paid ATB when an ability *started* instead of when it was queued.`,
      solution: [md`The menu would show the same segment as available for several commands; the player could queue two abilities with one segment.`, md`The second would fail when it tried to start, possibly seconds later, with no clear feedback, and the player's plan would silently break. Paying on confirm keeps the menu truthful.`],
      rubric: [md`Mentions double-promising the same segment`, md`Mentions the late, silent failure`],
      areas: ['combat', 'systems'],
    },
    {
      id: 'k05-p6',
      title: 'Write next_alive_index on paper',
      type: 'code-on-paper',
      difficulty: 1,
      minutes: 6,
      statement: md`Write \`next_alive_index() -> int\` for a \`PartyManager\` with \`members: Array[Character]\`, \`current_index\` and \`is_down(member) -> bool\`: return the next member after the leader who is not down, wrapping around, or -1.`,
      solution: [
        md`\`\`\`gdscript
func next_alive_index() -> int:
	for step in range(1, members.size() + 1):
		var i := (current_index + step) % members.size()
		if not is_down(members[i]):
			return i
	return -1
\`\`\``,
        md`The loop includes \`step = members.size()\`, which is the leader itself: if only the leader is alive, it returns the current index, and \`switch_to\` ignores it.`,
      ],
      rubric: [md`Wraps with modulo`, md`Skips down members`, md`Returns -1 when everyone is down`],
      areas: ['godot'],
    },
    {
      id: 'k05-p7',
      title: 'Limit from a fight',
      type: 'compute',
      difficulty: 2,
      minutes: 6,
      statement: md`Over a fight, Bram (190 HP) loses 133 HP, lands 30 basic hits (0.5 each) and the party staggers enemies 3 times (10 each). With $k = 90$, how many limit points does Bram gain (before the cap of 100)?`,
      solution: [md`Damage taken: $90 \times 133/190 = 90 \times 0.7 = 63$.`, md`Hits: $30 \times 0.5 = 15$. Staggers: $3 \times 10 = 30$.`, md`Total: $63 + 15 + 30 = 108$, so his limit is full (capped at 100) before the fight ends.`],
      answer: { kind: 'number', value: 108 },
      areas: ['combat', 'math'],
    },
    {
      id: 'k05-p8',
      title: 'HUD before the party',
      type: 'debug',
      difficulty: 2,
      minutes: 6,
      statement: md`The party HUD crashes with "Invalid access to property 'changed' on a base object of type 'Nil'" in \`MemberPanel.bind\`, but only in the field scene, not in a test scene. In the field scene the \`HUD\` CanvasLayer is the first child of the root; in the test scene it is the last. Explain and fix.`,
      solution: [
        md`Nodes become ready in tree order (children before parents, siblings in order). When the HUD comes first, its \`_ready\` runs before the party's members are ready, so \`member.atb\` (an \`@onready\` variable on Character) is still \`null\`.`,
        md`Fix: in the HUD's \`_ready\`, \`if not party.is_node_ready(): await party.ready\` before binding, or move the HUD after the party in the tree. The await makes the order irrelevant.`,
      ],
      rubric: [md`Explains ready order and @onready timing`, md`Fixes by awaiting the party's ready signal or reordering`],
      areas: ['godot'],
    },
  ],
};
