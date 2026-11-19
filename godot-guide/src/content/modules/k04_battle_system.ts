import { md, gd, type Module } from '../types';

// ------------------------------------------------------------------------------------ k04-1 listings
const EVENTS_TACTICAL = gd`
# scripts/autoload/events.gd: add below hit_landed (k01)
signal tactical_opened
signal tactical_closed
`;

const HIT_DATA_FROM_ABILITY = gd`
# scripts/resources/hit_data.gd (c05): add this field
## True for hits delivered by an AbilityRunner. Abilities spend ATB, so they must not refill it.
var from_ability := false
`;

const ATB_GAUGE = gd`
class_name AtbGauge
extends Node
## A party member's ATB: max_segments segments of segment_size points. Landing basic hits fills it
## fast, blocking hits fills it a little, and it trickles in over time. Abilities spend whole segments.
## Child of a Character; reads hits from the Events bus, so neither Hitbox nor Hurtbox knows about it.

signal changed(value: float, maximum: float)
## Emitted when the gauge crosses into a new full segment. segments = how many are full now.
signal segment_filled(segments: int)

@export var segment_size := 100.0
@export var max_segments := 2
## ATB per second, always. Low: it only keeps the menu reachable for a player who rarely attacks.
@export var passive_rate := 2.0
## ATB for each basic hit this character lands.
@export var atb_per_hit := 11.0
## ATB for each enemy hit blocked in the Guard state.
@export var atb_per_block := 8.0
## PartyManager (k05) lowers this for members the player is not controlling.
var gain_scale := 1.0

var value := 0.0

@onready var _character: Node = get_parent()


func _ready() -> void:
    Events.hit_landed.connect(_on_hit_landed)


func _physics_process(delta: float) -> void:
    # delta shrinks with Engine.time_scale, so the trickle slows in tactical mode too
    add(passive_rate * delta)


func maximum() -> float:
    return segment_size * max_segments


## Whole segments available to spend. Derived from value, never stored separately.
func segments() -> int:
    return floori(value / segment_size)


func can_spend(count: int) -> bool:
    return segments() >= count


func add(amount: float) -> void:
    if amount <= 0.0 or value >= maximum():
        return
    var before := segments()
    value = minf(value + amount, maximum())
    changed.emit(value, maximum())
    if segments() > before:
        segment_filled.emit(segments())


## Spend whole segments. Partial progress toward the next segment is kept.
func spend(count: int) -> bool:
    if not can_spend(count):
        return false
    value -= count * segment_size
    changed.emit(value, maximum())
    return true


func _on_hit_landed(hit: HitData, _target: Node2D) -> void:
    # only our own basic attacks count: an ability that refilled ATB would pay for itself
    if hit.source == _character and not hit.from_ability:
        add(atb_per_hit * gain_scale)
`;

const GUARD_STATE = gd`
extends State
## Holding the guard: slow movement, reduced damage, and blocked hits feed the ATB gauge
## (Character._on_hurt does the reduction). Leaves as soon as the guard is released.

## Movement speed while guarding, as a fraction of max_speed.
@export var speed_scale := 0.3


func enter() -> void:
    character.play_anim("guard")


func physics_update(delta: float) -> void:
    if not character.intent.wants_guard:
        state_machine.transition_to("Idle")
        return
    character.move_with_intent(delta, speed_scale)
`;

const ON_HURT_GUARD = gd`
# scripts/character.gd: new export and a new first half of _on_hurt
## Share of damage taken while in the Guard state.
@export var guard_factor := 0.3

@onready var atb := get_node_or_null("AtbGauge") as AtbGauge


func _on_hurt(hit: HitData) -> void:
    var amount := hit.amount
    if state_machine.current.name == &"Guard":
        amount = maxi(1, roundi(amount * guard_factor))
        if atb:
            atb.add(atb.atb_per_block)
    health.damage(amount)
    # ... the rest of k01's _on_hurt follows, using amount
`;

const TACTICAL_MODE = gd`
class_name TacticalMode
extends Node
## Opens and closes tactical mode. In SLOW style, gameplay runs at tactical_time_scale while the
## menu is open; in WAIT style the tree pauses. This node and the menu run with PROCESS_MODE_ALWAYS,
## so they keep working in both styles.

signal opened
signal closed

enum Style { SLOW, WAIT }

## SLOW slows the world (the default). WAIT pauses it (an accessibility option).
@export var style := Style.SLOW
@export_range(0.01, 1.0) var tactical_time_scale := 0.1
## The command menu (k05 fills it in). Shown while tactical mode is open.
@export var menu: Control
## Disabled while the menu is open, so menu navigation does not also walk the character.
@export var player_controller: PlayerController

var is_open := false


func _ready() -> void:
    process_mode = Node.PROCESS_MODE_ALWAYS
    menu.process_mode = Node.PROCESS_MODE_ALWAYS
    menu.hide()


func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("tactical"):
        if is_open:
            close()
        else:
            open()
        get_viewport().set_input_as_handled()


func open() -> void:
    if is_open:
        return
    is_open = true
    player_controller.process_mode = Node.PROCESS_MODE_DISABLED
    player_controller.character.intent.clear()  # forget the held direction and buffered presses
    if style == Style.SLOW:
        Engine.time_scale = tactical_time_scale
    else:
        get_tree().paused = true
    menu.show()
    opened.emit()
    Events.tactical_opened.emit()


func close() -> void:
    if not is_open:
        return
    is_open = false
    Engine.time_scale = 1.0
    get_tree().paused = false
    player_controller.process_mode = Node.PROCESS_MODE_INHERIT
    menu.hide()
    closed.emit()
    Events.tactical_closed.emit()


func _exit_tree() -> void:
    # time_scale is global: never leave the next scene in slow motion
    Engine.time_scale = 1.0
`;

const ATB_BAR = gd`
class_name AtbBar
extends HBoxContainer
## Two TextureProgressBar segments bound to an AtbGauge. A segment flashes and a sound plays when
## it fills. Driven entirely by the gauge's signals.

@export var gauge: AtbGauge

@onready var _segments: Array[TextureProgressBar] = [$Segment1, $Segment2]
@onready var _ready_sound: AudioStreamPlayer = $ReadySound


func _ready() -> void:
    for bar in _segments:
        bar.max_value = gauge.segment_size
    gauge.changed.connect(_on_changed)
    gauge.segment_filled.connect(_on_segment_filled)
    _on_changed(gauge.value, gauge.maximum())


func _on_changed(value: float, _maximum: float) -> void:
    # segment i shows the part of value that falls inside [i * size, (i + 1) * size]
    for i in _segments.size():
        _segments[i].value = clampf(value - i * gauge.segment_size, 0.0, gauge.segment_size)


func _on_segment_filled(count: int) -> void:
    var bar := _segments[count - 1]
    bar.modulate = Color(2.0, 2.0, 2.0)  # values above 1 brighten the texture
    var tween := create_tween()
    tween.tween_property(bar, "modulate", Color.WHITE, 0.25)
    _ready_sound.play()
`;

// ------------------------------------------------------------------------------------ k04-2 listings
const HIT_DATA_K04 = gd`
# scripts/resources/hit_data.gd (c05): add these fields and the method
## Puts the target's StaggerComponent into the pressured state.
var pressures := false
## Added to the target's damage multiplier if it is already staggered.
var multiplier_bonus := 0.0


## A copy with a different amount, so a target can report what it really took without changing
## the HitData that the attacker's Hitbox shares between every target of one swing.
func with_amount(new_amount: int) -> HitData:
    var copy := HitData.new()
    copy.amount = new_amount
    copy.element = element
    copy.knockback = knockback
    copy.stagger = stagger
    copy.source = source
    copy.from_ability = from_ability
    copy.pressures = pressures
    copy.multiplier_bonus = multiplier_bonus
    return copy
`;

const ABILITY_DATA = gd`
class_name AbilityData
extends Resource
## One ability, spell or item use. Each is a .tres file (braver.tres, fire.tres, potion.tres);
## the AbilityRunner executes any of them, so adding an ability needs no new code.

enum Target { ENEMY, ALLY, SELF, ALL_ENEMIES, ALL_ALLIES }

@export var display_name := ""
@export_multiline var description := ""

@export_group("Cost")
@export_range(0, 2) var atb_cost := 1
@export var mp_cost := 0

@export_group("Effect")
@export var target := Target.ENEMY
## Multiplies the user's attack (or magic, for spells). 0 for pure support.
@export var power := 1.0
@export var is_magic := false
## "physical", "fire" or "ice": the same strings HitData uses.
@export var element := "physical"
## Added to the target's stagger meter.
@export var stagger := 10.0
## Puts the target into the pressured state.
@export var pressures := false
## Added to the damage multiplier when the target is already staggered (Focus Strike: 0.25).
@export var multiplier_bonus := 0.0
## HP restored to each target (Cure, potions).
@export var heal := 0

@export_group("Presentation")
## Base name for Character.play_anim(): "attack", "cast" or "guard".
@export var animation := "cast"
## Seconds from the start of the animation to the effect landing (game time, so it slows in tactical mode).
@export var cast_time := 0.4
## Spawned at each target when the effect lands: a fireball burst, a heal sparkle.
@export var effect_scene: PackedScene
`;

const BATTLE_COMMAND = gd`
class_name BattleCommand
extends RefCounted
## One order: who acts, with what, on whom. The tactical menu creates them; the AbilityRunner runs them.

var user: Character
var ability: AbilityData
var target: Node2D
`;

const ABILITY_RUNNER = gd`
class_name AbilityRunner
extends Node
## Executes abilities for its parent Character, one at a time: pays the cost when the command is
## accepted, waits for a free moment, plays the animation, waits cast_time, spawns the effect and
## delivers the hit through the target's Hurtbox, the same path a sword swing takes.

signal ability_started(ability: AbilityData)
signal ability_finished(ability: AbilityData)

## What this member can use. The tactical menu lists these.
@export var abilities: Array[AbilityData] = []
@export var atb: AtbGauge
## Attack and magic until r01 gives every character a StatBlock.
@export var attack := 7
@export var magic := 4
@export var max_mp := 12

var mp := 0
var busy := false
var _queue: Array[BattleCommand] = []

@onready var character: Character = get_parent()


func _ready() -> void:
    mp = max_mp


func can_use(ability: AbilityData) -> bool:
    return atb.can_spend(ability.atb_cost) and mp >= ability.mp_cost


## Pay now and queue. Paying at confirm time means the menu can never promise the same ATB twice.
func enqueue(ability: AbilityData, target: Node2D) -> bool:
    if not can_use(ability):
        return false
    atb.spend(ability.atb_cost)
    mp -= ability.mp_cost
    var command := BattleCommand.new()
    command.user = character
    command.ability = ability
    command.target = target
    _queue.append(command)
    return true


func _physics_process(_delta: float) -> void:
    if busy or _queue.is_empty():
        return
    # wait for a free moment: never cut into a dodge, a swing or a hurt reaction
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
    # false: the timer stops while the tree is paused; time scale slows it like everything else
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
            # through the Hurtbox: damage, multiplier, stagger, hit_landed, all as for a sword
            target.hurtbox.hurt.emit(_make_hit(ability, target))


func _make_hit(ability: AbilityData, target: Character) -> HitData:
    var hit := HitData.new()
    var stat := magic if ability.is_magic else attack
    hit.amount = roundi(ability.power * stat)
    hit.element = ability.element
    hit.stagger = ability.stagger
    hit.pressures = ability.pressures
    hit.multiplier_bonus = ability.multiplier_bonus
    hit.from_ability = true
    hit.source = character
    hit.knockback = (target.global_position - character.global_position).normalized() * 60.0
    return hit
`;

const ABILITY_STATE = gd`
extends State
## Standing still while the AbilityRunner plays an ability. The runner enters and leaves this state;
## Character._on_hurt does not interrupt it (abilities have super armour).


func enter() -> void:
    character.velocity = Vector2.ZERO


func physics_update(delta: float) -> void:
    character.velocity = character.velocity.move_toward(Vector2.ZERO, character.friction * delta)
    character.move_and_slide()
`;

const STAGGER_COMPONENT = gd`
class_name StaggerComponent
extends Node
## Pressure and stagger for an enemy. Hits fill the meter; the pressured state multiplies the gain;
## a full meter staggers the enemy, which then takes damage_multiplier times damage until it recovers.
## Character._on_hurt calls take_hit() and reads damage_multiplier.

signal pressured
signal staggered
signal recovered
signal changed(value: float, maximum: float)

enum State { NORMAL, PRESSURED, STAGGERED }

@export var stagger_max := 100.0
@export var pressure_duration := 4.0
## Stagger gain multiplier while pressured.
@export var pressured_gain := 2.0
@export var stagger_duration := 6.0
## The damage multiplier a stagger starts at: 1.6 means 160%.
@export var base_multiplier := 1.6
@export var max_multiplier := 3.0
## The meter starts draining this long after the last hit...
@export var decay_delay := 2.5
## ...at this many points per second.
@export var decay_rate := 8.0
## Elements that pressure this enemy and add 50% stagger.
@export var weaknesses := PackedStringArray()

var state := State.NORMAL
var value := 0.0
var damage_multiplier := 1.0
## Set by the enemy's windup state: hits that land during a telegraph pressure it.
var vulnerable := false
var _timer := 0.0
var _since_hit := 0.0


func take_hit(hit: HitData) -> void:
    if state == State.STAGGERED:
        # staggered: no meter gain, but some abilities raise the multiplier
        if hit.multiplier_bonus > 0.0:
            damage_multiplier = minf(damage_multiplier + hit.multiplier_bonus, max_multiplier)
        return
    _since_hit = 0.0
    var amount := hit.stagger
    var weak := hit.element in weaknesses
    if weak:
        amount *= 1.5
    if hit.pressures or weak or vulnerable:
        if state == State.NORMAL:
            state = State.PRESSURED
            pressured.emit()
        _timer = pressure_duration  # every pressuring hit refreshes the window
    if state == State.PRESSURED:
        amount *= pressured_gain
    value = minf(value + amount, stagger_max)
    changed.emit(value, stagger_max)
    if value >= stagger_max:
        _start_stagger()


func _start_stagger() -> void:
    state = State.STAGGERED
    _timer = stagger_duration
    damage_multiplier = base_multiplier
    staggered.emit()


func _physics_process(delta: float) -> void:
    _since_hit += delta
    match state:
        State.STAGGERED:
            _timer -= delta
            # the meter drains over the stagger, so the HUD doubles as a countdown
            value = stagger_max * maxf(_timer, 0.0) / stagger_duration
            changed.emit(value, stagger_max)
            if _timer <= 0.0:
                state = State.NORMAL
                value = 0.0
                damage_multiplier = 1.0
                recovered.emit()
        State.PRESSURED:
            _timer -= delta
            if _timer <= 0.0:
                state = State.NORMAL
            _decay(delta)
        State.NORMAL:
            _decay(delta)


func _decay(delta: float) -> void:
    if _since_hit > decay_delay and value > 0.0:
        value = maxf(value - decay_rate * delta, 0.0)
        changed.emit(value, stagger_max)
`;

const STAGGERED_STATE = gd`
extends State
## Helpless while the StaggerComponent is staggered. Character connects stagger.staggered to a
## transition into this state; recovered brings the enemy back to Idle.


func enter() -> void:
    character.velocity = Vector2.ZERO
    character.play_anim("stagger")
    character.stagger.recovered.connect(_on_recovered)


func exit() -> void:
    # leaving early (for example into Dead) must not leave the connection behind
    if character.stagger.recovered.is_connected(_on_recovered):
        character.stagger.recovered.disconnect(_on_recovered)


func physics_update(delta: float) -> void:
    character.velocity = character.velocity.move_toward(Vector2.ZERO, character.friction * delta)
    character.move_and_slide()


func _on_recovered() -> void:
    state_machine.transition_to("Idle")
`;

const CHARACTER_K04 = gd`
class_name Character
extends CharacterBody2D
## Anything that moves and fights. Reads its intent; a controller child writes it.
## k01 added hitstop and the flash. k04 adds guarding, the ATB gauge (party members), the
## stagger component (enemies), super armour during abilities and the Staggered state.

@export var max_speed := 90.0
@export var acceleration := 900.0
@export var friction := 1200.0
## Share of damage taken while in the Guard state.
@export var guard_factor := 0.3

var intent := Intent.new()
var facing := "down"
var facing_vector := Vector2.DOWN
var _hitstop_id := 0
var _flash_tween: Tween

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D
@onready var state_machine: StateMachine = $StateMachine
@onready var health: HealthComponent = $HealthComponent
@onready var hurtbox: Hurtbox = $Hurtbox
## Optional components: party members have an AtbGauge, enemies a StaggerComponent.
@onready var atb := get_node_or_null("AtbGauge") as AtbGauge
@onready var stagger := get_node_or_null("StaggerComponent") as StaggerComponent


func _ready() -> void:
    hurtbox.hurt.connect(_on_hurt)
    health.died.connect(_on_died)
    if stagger:
        stagger.staggered.connect(_on_staggered)
    state_machine.start(self)


func move_with_intent(delta: float, speed_scale := 1.0) -> void:
    var target := intent.move * max_speed * speed_scale
    var rate := acceleration if intent.move != Vector2.ZERO else friction
    velocity = velocity.move_toward(target, rate * delta)
    move_and_slide()


func face(dir: Vector2) -> void:
    if dir == Vector2.ZERO:
        return
    facing_vector = dir.normalized()
    if absf(dir.x) > absf(dir.y):
        facing = "side"
        sprite.flip_h = dir.x < 0.0
    else:
        facing = "up" if dir.y < 0.0 else "down"


func play_anim(base: String) -> void:
    var anim := base + "_" + facing
    if not sprite.sprite_frames.has_animation(anim):
        anim = base
    if sprite.animation != anim or not sprite.is_playing():
        sprite.play(anim)


func hitstop(duration: float) -> void:
    _hitstop_id += 1
    var id := _hitstop_id
    process_mode = Node.PROCESS_MODE_DISABLED
    await get_tree().create_timer(duration, true, false, true).timeout
    if id == _hitstop_id:
        process_mode = Node.PROCESS_MODE_INHERIT


func flash(duration := 0.12) -> void:
    var mat := sprite.material as ShaderMaterial
    if mat == null:
        return
    if _flash_tween:
        _flash_tween.kill()
    mat.set_shader_parameter("flash", 1.0)
    _flash_tween = create_tween()
    _flash_tween.tween_property(mat, "shader_parameter/flash", 0.0, duration)


func _on_hurt(hit: HitData) -> void:
    var amount := hit.amount
    if state_machine.current.name == &"Guard":
        amount = maxi(1, roundi(amount * guard_factor))
        if atb:
            atb.add(atb.atb_per_block)
    if stagger:
        # damage at the multiplier the hit found, then the hit's stagger (which may start a stagger)
        amount = roundi(amount * stagger.damage_multiplier)
        stagger.take_hit(hit)
    health.damage(amount)
    flash()
    Events.hit_landed.emit(hit.with_amount(amount), self)
    if health.health <= 0:
        return
    # read the state again: take_hit() may just have switched us to Staggered
    var now := state_machine.current.name
    if now == &"Guard" or now == &"Ability" or now == &"Staggered":
        return  # super armour: no knockback, no Hurt
    velocity = hit.knockback
    state_machine.transition_to("Hurt")


func _on_staggered() -> void:
    if health.health > 0:
        state_machine.transition_to("Staggered")


func _on_died() -> void:
    state_machine.transition_to("Dead")
`;

const WINDUP_FRAGMENT = gd`
# In the enemy's windup (telegraph) state from k02: open and close the punish window
func enter() -> void:
    character.play_anim("windup")
    if character.stagger:
        character.stagger.vulnerable = true


func exit() -> void:
    if character.stagger:
        character.stagger.vulnerable = false
`;

// ------------------------------------------------------------------------------------ k04-3 listings
const EVENTS_BATTLE = gd`
# scripts/autoload/events.gd: battle flow signals
signal battle_started(encounter: Node)
signal battle_won(xp: int, gold: int)
signal battle_lost
`;

const ENCOUNTER = gd`
class_name Encounter
extends Node2D
## A battle where the party stands: no separate battle scene. Children: EncounterTrigger (Area2D,
## mask = player), ArenaWalls (StaticBody2D whose CollisionShape2D children start disabled) and
## the enemies (Character scenes with an "AIController" child).

@export var encounter_id := "field_slimes_1"
@export var xp_reward := 30
@export var gold_reward := 12
## Kai until k05; then PartyManager's party_defeated replaces this.
@export var player: Character
@export var battle_music: AudioStream
@export var field_music: AudioStream

var _remaining := 0
var _enemies: Array[Character] = []

@onready var trigger: Area2D = $EncounterTrigger
@onready var walls: StaticBody2D = $ArenaWalls


func _ready() -> void:
    for child in get_children():
        if child is Character:
            _enemies.append(child as Character)
    if GameState.get_flag(encounter_id) > 0:
        # already won on this save: the enemies stay gone
        for enemy in _enemies:
            enemy.queue_free()
        trigger.monitoring = false
        return
    for enemy in _enemies:
        _set_enemy_active(enemy, false)
    _set_walls(false)
    trigger.body_entered.connect(_on_trigger_body_entered)


func _on_trigger_body_entered(_body: Node2D) -> void:
    # body_entered runs inside the physics step; monitoring may only change after it
    trigger.set_deferred("monitoring", false)
    start()


func start() -> void:
    _set_walls(true)
    _remaining = _enemies.size()
    for enemy in _enemies:
        _set_enemy_active(enemy, true)
        enemy.add_to_group("enemies")
        enemy.health.died.connect(_on_enemy_died, CONNECT_ONE_SHOT)
    player.health.died.connect(_lose, CONNECT_ONE_SHOT)
    if battle_music:
        Audio.play_music(battle_music)
    Events.battle_started.emit(self)


func _on_enemy_died() -> void:
    _remaining -= 1
    if _remaining == 0:
        _win()


func _win() -> void:
    _set_walls(false)
    if player.health.died.is_connected(_lose):
        player.health.died.disconnect(_lose)
    GameState.set_flag(encounter_id)
    if field_music:
        Audio.play_music(field_music)
    Events.battle_won.emit(xp_reward, gold_reward)


func _lose() -> void:
    Events.battle_lost.emit()


func _set_walls(on: bool) -> void:
    for shape in walls.get_children():
        if shape is CollisionShape2D:
            # deferred: shapes must not change while the physics server is running callbacks
            shape.set_deferred("disabled", not on)
    walls.visible = on


func _set_enemy_active(enemy: Character, on: bool) -> void:
    var controller := enemy.get_node_or_null("AIController")
    if controller:
        controller.process_mode = Node.PROCESS_MODE_INHERIT if on else Node.PROCESS_MODE_DISABLED
    enemy.intent.clear()  # an idle enemy must not keep the last thing its AI wanted
`;

const TACTICAL_CLOSE_ON_END = gd`
# scripts/battle/tactical_mode.gd: add to _ready()
Events.battle_won.connect(func(_xp: int, _gold: int) -> void: close())
Events.battle_lost.connect(close)
`;

const BATTLE_RESULT = gd`
extends Control
## Victory and defeat banners. Process mode Always, so the Retry button works while the tree is paused.

@onready var title: Label = $Panel/VBox/Title
@onready var details: Label = $Panel/VBox/Details
@onready var retry: Button = $Panel/VBox/Retry


func _ready() -> void:
    process_mode = Node.PROCESS_MODE_ALWAYS
    hide()
    Events.battle_won.connect(_on_won)
    Events.battle_lost.connect(_on_lost)
    retry.pressed.connect(_on_retry)


func _on_won(xp: int, gold: int) -> void:
    title.text = "Victory"
    details.text = "+%d XP   +%d gold" % [xp, gold]
    retry.hide()
    show()
    await get_tree().create_timer(2.0).timeout
    hide()


func _on_lost() -> void:
    Engine.time_scale = 1.0
    get_tree().paused = true  # freeze the enemies behind the banner
    title.text = "Defeated"
    details.text = "Kai has fallen."
    retry.show()
    show()
    retry.grab_focus()  # so a gamepad can press it


func _on_retry() -> void:
    get_tree().paused = false
    get_tree().reload_current_scene()
`;

export const MODULE: Module = {
  id: 'k04',
  part: 'combat',
  order: 4,
  title: 'Building the battle system',
  summary: 'The ATB gauge as a component, tactical mode with Engine.time_scale or a pause, abilities as AbilityData resources run by an AbilityRunner, the stagger gauge on enemies, and battles that start and end in the field.',
  relevance: md`This is where Shardbound's combat stops being a design and becomes code. By the end, Kai earns ATB by hitting and guarding, opens a slowed tactical menu, spends segments on Braver or a potion, and staggers a skeleton for a damage multiplier, all in the same scene as exploration, with walls that close around the fight and a victory or defeat at the end. k05 adds Lyra and Bram on top of exactly these pieces.`,
  prereqs: ['k03', 'c05'],
  areas: ['combat', 'godot', 'systems'],
  lessons: [
    // ======================================================================================== k04-1
    {
      id: 'k04-1',
      title: 'The ATB gauge and tactical mode',
      minutes: 45,
      objectives: [
        'Build AtbGauge as a component with segments, a passive charge and a segment_filled signal.',
        'Fill it from landed hits through the Events bus and from blocked hits in a Guard state.',
        'Implement tactical mode with Engine.time_scale or with a pause and PROCESS_MODE_ALWAYS, and weigh the trade-offs.',
        'Compute the game time that passes during a menu, $t_{\\text{game}} = s\\,t_{\\text{real}}$.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`In the figure from k03 you attacked a dummy and watched two bars fill; when one was full, a sound played and the bar flashed, and the tactical menu could spend it. Three things happened there, and each becomes a piece of code:

1. **A number that grows and is spent in chunks.** That is the gauge. It lives on the character, knows nothing about input or enemies, and announces changes through signals.
2. **Something that feeds it.** Landing a basic hit, blocking a hit, and a slow trickle over time.
3. **A way to stop and choose.** Tactical mode, which slows the game so a menu can be read.

The gauge comes first, because everything else talks to it.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'A component, connected through the Events bus',
          md: md`\`AtbGauge\` is a plain \`Node\` child of a \`Character\`, like c05's \`HealthComponent\`. It has no idea who hits whom. Instead it listens to \`Events.hit_landed(hit, target)\`, the signal k01 added to the global bus, and adds ATB when \`hit.source\` is its own character. Hitboxes, hurtboxes, enemies and the HUD never call the gauge, so you can remove it from a character and nothing breaks. That is the test for good decoupling: delete the node, and the game still runs.`,
        },
        { kind: 'assets', ids: ['ui_bars', 'hero', 'sfx_atb_ready'], note: md`\`ui_bars\` row 2 is the ATB fill and row 3 the "full" fill; use them as the progress textures of two \`TextureProgressBar\`s. \`sfx_atb_ready\` is the short chime for a filled segment.` },
        { kind: 'code', file: 'scripts/components/atb_gauge.gd', code: ATB_GAUGE },
        {
          kind: 'text',
          md: md`Four decisions in this script are worth seeing explicitly, because each avoids a bug that is easy to write:

- **\`value\` is one float; \`segments()\` is derived.** Storing "segments" and "partial" separately means keeping two numbers in sync, and they drift (a spend that forgets the partial, a refill that overflows into nothing). One number, and a function that reads it, cannot disagree with itself.
- **\`spend()\` subtracts whole segments and keeps the remainder.** With 150 ATB, spending one segment leaves 50, so the half-built second segment is not lost. FF7 Remake's gauge behaves this way when you watch it.
- **\`segment_filled\` fires on the crossing, not on "is full".** The check compares segments before and after, so the sound plays once per segment even though \`add()\` runs every frame.
- **The passive charge runs in \`_physics_process\` with \`delta\`.** Tactical mode scales \`delta\` down, so the trickle slows with the world, as it should.`,
        },
        {
          kind: 'viz',
          viz: { type: 'combat.battle', mode: 'atb' },
          task: md`Set \`passive_rate\` to 0 and measure, with the readout, how long one segment takes while you attack steadily. Then set \`atb_per_hit\` to 4: does the menu still feel like part of the fight? Find a value where a segment takes 3 to 5 s of normal attacking, as k03's targets ask.`,
          caption: md`The code panel shows the exported values you would set on Kai's \`AtbGauge\` in the Inspector. "Last segment took" is measured between two \`segment_filled\` emissions.`,
        },
        {
          kind: 'check',
          q: md`The gauge is at 90. A single call \`add(120.0)\` runs. What does \`segment_filled\` emit?

\`\`\`gdscript
var before := segments()
value = minf(value + amount, maximum())
changed.emit(value, maximum())
if segments() > before:
    segment_filled.emit(segments())
\`\`\``,
          options: [md`Once, with 2`, md`Twice, with 1 and then 2`, md`Once, with 1`, md`Nothing, because 210 is over the maximum`],
          answer: 0,
          explain: md`\`before\` is 0; the value is clamped to 200, so \`segments()\` is 2 and the signal fires once with 2. If the HUD needs to flash both segments, it should flash every segment up to \`segments\`. In practice a single hit never adds 110 ATB, so once is fine.`,
        },
        { kind: 'code', file: 'scripts/resources/hit_data.gd', code: HIT_DATA_FROM_ABILITY, fragment: true, note: md`Ability hits (lesson 2) set this flag, and the gauge ignores them. Without it, Braver would refund part of its own cost every time it landed.` },
        {
          kind: 'text',
          md: md`### Guarding feeds the gauge

k03 gave Bram 25 ATB per blocked hit. Guarding needs a state, and the damage reduction belongs where damage is applied: \`Character._on_hurt\`. The \`Guard\` state itself only holds still (slowly) and leaves when the button is released; Idle and Move enter it when \`intent.wants_guard\` is true, just as they enter Attack when \`wants_attack\` is.`,
        },
        { kind: 'code', file: 'scripts/states/guard.gd', code: GUARD_STATE },
        { kind: 'code', file: 'scripts/character.gd', code: ON_HURT_GUARD, fragment: true, note: md`Lesson 2 gives the complete \`character.gd\` with everything k04 adds. \`get_node_or_null\` keeps the gauge optional: enemies have no \`AtbGauge\`, and \`atb\` is then \`null\`.` },
        {
          kind: 'text',
          md: md`### Tactical mode: three ways to stop the clock

You have three tools in Godot, and they behave differently:

- **\`Engine.time_scale = 0.1\`.** Every \`delta\` shrinks to a tenth: physics, animations, \`Timer\`s and tweens all slow down. Input is not slowed: a key press arrives at once. The catch is that the menu's own animations (a bobbing cursor, a fade) slow down too, unless each such tween calls \`set_ignore_time_scale()\`.
- **\`get_tree().paused = true\`.** Every node whose process mode is *Inherit* (the default) or *Pausable* stops completely. The menu must be set to *Always* (\`PROCESS_MODE_ALWAYS\`), or it stops as well and the game can never be unpaused. This is wait mode.
- **A custom battle clock.** Gameplay scripts multiply their own \`delta\` by a \`Battle.time_scale\` value. Precise, but every script, \`AnimationPlayer\` and \`Timer\` in the battle must cooperate, and one that forgets runs at full speed.

Shardbound uses the first by default and offers the second as a "wait" setting for players who want unlimited time.`,
        },
        {
          kind: 'viz',
          viz: { type: 'combat.atbtactical', approach: 'scale' },
          task: md`Press **L** to open the menu with *time_scale*. Move the cursor with the arrows: input is instant, but watch the cursor's nudge animation. Switch to *scale + ignore* and compare. Then choose *pause*, untick *process_mode = ALWAYS*, open the menu, and try to close it.`,
          caption: md`The table lists how fast each node runs while the menu is open. Under a pause with *Inherit*, the menu node itself is paused, so it never receives the key that would close it: the game is stuck.`,
        },
        { kind: 'code', file: 'scripts/autoload/events.gd', code: EVENTS_TACTICAL, fragment: true },
        { kind: 'code', file: 'scripts/battle/tactical_mode.gd', code: TACTICAL_MODE, note: md`\`_unhandled_input\` is not slowed by the time scale, and with *Always* it runs during a pause too. \`set_input_as_handled()\` stops the same press from reaching other nodes. Disabling the \`PlayerController\` matters: the menu is navigated with the arrow keys, which are also \`move_*\` actions, and without it Kai would walk (slowly) while you choose.` },
        {
          kind: 'derive',
          title: 'menu time in game time',
          goal: md`Godot hands every \`_physics_process\` a \`delta\` of $\frac{1}{60}\,s$ seconds when \`Engine.time_scale\` is $s$. Find how much game time passes while a menu is open for $t$ real seconds, and how far a projectile moves meanwhile.`,
          steps: [
            {
              md: md`Physics still ticks 60 times per real second. Each tick adds $s/60$ seconds of game time, so in $t$ seconds: $$t_{\text{game}} = 60\,t \cdot \frac{s}{60} = s\,t.$$`,
              choose: {
                prompt: md`What does \`Engine.time_scale\` change about physics ticks?`,
                options: [md`The delta each tick receives, not how many ticks run per real second`, md`The number of ticks per second`, md`Nothing; only animations slow down`],
                answer: 0,
                explain: md`Ticks stay at 60 per real second (\`physics_ticks_per_second\`); each tick simulates less time. That is why slow motion stays smooth.`,
              },
            },
            { md: md`A fireball at $v$ px/s moves $v\,s\,t$ pixels. At 160 px/s, $s = 0.1$ and a 4 s decision, that is $160 \times 0.1 \times 4 = 64$ px, which is visible but slow enough to react to.` },
          ],
          takeaway: md`Everything written with \`delta\` slows correctly. Anything that counts frames instead of seconds (\`_frame += 1\`) does not slow at all under \`time_scale\`, which is a good reason to write timers in seconds.`,
        },
        {
          kind: 'numeric',
          q: md`With \`Engine.time_scale = 0.1\`, what \`delta\` (in seconds) does \`_physics_process\` receive at the default 60 ticks per second? Then: a menu open for 3 s lets how much passive ATB in at \`passive_rate = 2\`? Enter both.`,
          answer: { kind: 'vector', value: [0.1 / 60, 0.6] },
          inputHint: 'e.g. 0.00167, 0.6',
          explain: md`$\delta = 0.1/60 \approx 0.00167$ s. Game time in 3 s is 0.3 s, so the gauge gains $2 \times 0.3 = 0.6$ ATB.`,
        },
        {
          kind: 'check',
          q: md`You implement wait mode with \`get_tree().paused = true\` but forget to change the menu's process mode. What happens when the player opens tactical mode?`,
          options: [md`The menu appears but ignores input, and the game cannot be unpaused.`, md`The menu works normally because UI is never paused.`, md`The game slows to a tenth of its speed.`, md`Godot raises an error and unpauses.`],
          answer: 0,
          explain: md`A paused node with the default *Inherit* mode receives no input or processing callbacks. \`TacticalMode\` sets both itself and the menu to \`PROCESS_MODE_ALWAYS\` in \`_ready\` so this cannot happen.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'k04-1-build',
            title: 'ATB on the HUD',
            goal: md`Give Kai an \`AtbGauge\` and show it as two segments on the HUD, with a flash and a chime when a segment fills. Wire tactical mode to the \`tactical\` action.`,
            requirements: [
              md`Kai has an \`AtbGauge\` child; landing basic hits on the dummy fills it, and holding guard against an attack adds \`atb_per_block\`.`,
              md`The HUD shows two segments that fill left to right; a full segment flashes once and the \`sfx_atb_ready\` sound plays.`,
              md`Pressing **L** slows the game to 0.1 and shows a placeholder menu panel; pressing **L** again restores normal speed.`,
              md`While the menu is open, the arrow keys do not move Kai.`,
              md`Quitting the scene with the menu open does not leave the next run in slow motion.`,
            ],
            hints: [
              md`Build the bar scene as an \`HBoxContainer\` with two \`TextureProgressBar\` children named \`Segment1\` and \`Segment2\` and an \`AudioStreamPlayer\` named \`ReadySound\`. Use \`ui_bars\` as an \`AtlasTexture\`: region \`(0, 30, 48, 6)\` (the empty row) for *Under* and \`(0, 12, 48, 6)\` (the ATB row) for *Progress*.`,
              md`Put the bar in a \`CanvasLayer\` so it stays on screen, and set its \`gauge\` export to Kai's \`AtbGauge\` in the Inspector.`,
              md`\`TacticalMode\` needs its \`menu\` and \`player_controller\` exports set; an empty \`PanelContainer\` is enough as the menu for now.`,
            ],
            solution: [
              { file: 'ui/atb_bar.gd', code: ATB_BAR },
              { file: 'scripts/battle/tactical_mode.gd', code: TACTICAL_MODE },
            ],
            explain: md`The bar never polls the gauge: \`changed\` updates both segments, and \`segment_filled\` triggers the flash. A \`modulate\` above 1 brightens a texture, which makes a cheap flash without a shader. Segment $i$ shows $\operatorname{clamp}(v - 100\,i,\ 0,\ 100)$, so 150 ATB draws a full first segment and a half second one.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'k04-1-paper',
            title: 'Find the double refund',
            type: 'debug',
            difficulty: 2,
            minutes: 8,
            statement: md`A tester reports that Braver (cost 1 segment) sometimes leaves Kai with *more* ATB than before. Kai's gauge listens like this:

\`\`\`gdscript
func _on_hit_landed(hit: HitData, _target: Node2D) -> void:
	if hit.source == _character:
		add(atb_per_hit * gain_scale)
\`\`\`

Braver deals one hit, Kai's \`atb_per_hit\` is 11, and he cast it with 105 ATB. Explain the report and fix the line.`,
            solution: [
              md`Braver's hit comes from Kai, so the handler adds 11 ATB when it lands. Casting at 105 leaves 5; the hit adds 11, giving 16. That is not more than 105, so look further: Braver with an area effect, or a multi-hit ability, adds 11 per target. Fire hitting three slimes refunds 33.`,
              md`Abilities must not feed the gauge at all. Mark ability hits (\`hit.from_ability = true\` in the AbilityRunner) and check it: \`if hit.source == _character and not hit.from_ability:\`.`,
              md`The report "more than before" comes from a multi-target ability used near the end of a segment: the refunds cross a segment boundary and \`segment_filled\` plays, which looks like a gain.`,
            ],
            rubric: [md`Identifies that ability hits pass the source check`, md`Fixes it with a flag on HitData that the gauge checks`, md`Notes that multi-target abilities multiply the refund`],
            areas: ['combat', 'godot'],
          },
        },
        {
          kind: 'recall',
          prompt: md`What does \`Engine.time_scale\` slow down, and what does it not?`,
          answer: md`It scales the \`delta\` of \`_process\` and \`_physics_process\`, and slows animations, timers and tweens (unless a tween calls \`set_ignore_time_scale()\` or a timer is created with \`ignore_time_scale\`). It does not change the number of physics ticks per real second, and it does not slow input events.`,
        },
      ],
      cards: [
        { id: 'k04-1-c1', kind: 'concept', front: md`Why does AtbGauge store one float and derive segments()?`, back: md`Two stored numbers (segments and partial) can drift out of sync; one value plus a derived count cannot disagree with itself.` },
        { id: 'k04-1-c2', kind: 'cloze', text: md`A menu that must work while the tree is paused needs process_mode = {{}}.`, answers: ['PROCESS_MODE_ALWAYS|Always'] },
        { id: 'k04-1-c3', kind: 'compute', front: md`Gauge at 170 (segments of 100). After spend(1), what is the value?`, answer: { kind: 'number', value: 70 }, back: md`$170 - 100 = 70$: partial progress is kept.` },
        { id: 'k04-1-c4', kind: 'concept', front: md`How does the AtbGauge learn that its character landed a hit?`, back: md`It connects to \`Events.hit_landed(hit, target)\` and adds ATB when \`hit.source\` is its parent and the hit is not from an ability.` },
        { id: 'k04-1-c5', kind: 'compute', front: md`time_scale 0.1, menu open 5 s. Passive ATB gained at 2 per second?`, answer: { kind: 'number', value: 1 }, back: md`Game time $0.1 \times 5 = 0.5$ s; $2 \times 0.5 = 1$ ATB.` },
      ],
    },
    // ======================================================================================== k04-2
    {
      id: 'k04-2',
      title: 'Abilities and the stagger gauge',
      minutes: 45,
      objectives: [
        'Describe abilities as AbilityData resources: costs, power, element, target, stagger, animation, effect.',
        'Execute them with an AbilityRunner that pays on confirm, waits for a free moment and delivers hits through the target\'s Hurtbox.',
        'Build StaggerComponent with normal, pressured and staggered states, decay, and a damage multiplier that starts at 160%.',
        'Compute stagger gain under weakness and pressure, and damage under a raised multiplier.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Braver, Fire, Cure, Shield Bash and a potion look like five different features. They are one feature with five sets of numbers: each costs something, waits a moment while an animation plays, and then changes HP (and maybe stagger) on one or more targets. If each were its own script, the tenth ability would mean the tenth script and the tenth set of bugs. Instead, an ability is **data**, and one **runner** executes any of them.

The second half of the lesson builds the payoff for those abilities: the stagger gauge.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'Resources as data (from g04)',
          md: md`A script that \`extends Resource\` with \`class_name\` becomes a new resource type. Create instances with **FileSystem → right-click → New → Resource…**, pick the type, and save as \`resources/abilities/braver.tres\`. The Inspector edits its exported fields; \`@export_group\` sorts them into foldable sections. A node holds them in an exported \`Array[AbilityData]\`, and a designer can add an ability without opening a script.`,
        },
        { kind: 'code', file: 'scripts/resources/ability_data.gd', code: ABILITY_DATA },
        { kind: 'code', file: 'scripts/battle/battle_command.gd', code: BATTLE_COMMAND },
        { kind: 'code', file: 'scripts/components/ability_runner.gd', code: ABILITY_RUNNER },
        {
          kind: 'text',
          md: md`How the runner was designed, problem by problem:

- **When to pay.** If the cost were paid when the ability *starts*, the menu could accept two commands against the same segment, and the second would fail later with no feedback. Paying in \`enqueue()\` makes acceptance final: if the menu accepted it, it is paid for.
- **When to start.** A command can arrive while Kai is mid-dodge. Cutting the dodge short would break its i-frames (c02-2). So the runner waits until the state machine is in \`Idle\` or \`Move\`, which in practice is a fraction of a second.
- **How to deal damage.** The runner builds a \`HitData\` and emits it on the target's \`Hurtbox\`. That one line means abilities get the same damage handling, stagger multiplier, flash, hitstop and damage numbers as sword hits, with no second code path to keep in sync.
- **Interruptions.** After the \`await\`, the runner checks that the user is alive and still in \`Ability\`. A KO during the cast cancels the effect instead of letting a defeated character finish a spell.`,
        },
        { kind: 'code', file: 'scripts/states/ability.gd', code: ABILITY_STATE },
        {
          kind: 'check',
          q: md`Why does \`_run\` create its timer with \`get_tree().create_timer(ability.cast_time, false)\`?`,
          options: [md`So the cast pauses with the tree in wait mode, and (like all timers) slows under Engine.time_scale in slow mode.`, md`So the timer ignores the time scale and the cast finishes at normal speed in tactical mode.`, md`Because the second argument makes the timer one-shot.`, md`So the timer runs in the physics step.`],
          answer: 0,
          explain: md`The second argument is \`process_always\`. With \`false\`, a paused tree pauses the timer; otherwise a cast would complete while the game is paused. The fourth argument, \`ignore_time_scale\`, defaults to \`false\`, so the cast also slows in tactical mode, as everything in the world should.`,
        },
        {
          kind: 'text',
          md: md`### The stagger gauge

The design from k03, as rules an enemy component can enforce:

1. Every hit adds its \`stagger\` value to a meter, ×1.5 if the hit's element is one of the enemy's weaknesses.
2. Certain hits **pressure** the enemy: weakness hits, abilities with \`pressures\`, and any hit during its windup. While pressured (4 s, refreshed by each pressuring hit), gain is multiplied by \`pressured_gain\`.
3. A full meter **staggers** it for 6 s: no actions, and damage is multiplied by \`damage_multiplier\`, which starts at 1.6. Hits no longer fill the meter, but abilities with a \`multiplier_bonus\` raise the multiplier, up to 3.0.
4. If nothing hits it for 2.5 s, the meter drains at 8 per second, so pressure has to be kept up.`,
        },
        { kind: 'code', file: 'scripts/components/stagger_component.gd', code: STAGGER_COMPONENT },
        {
          kind: 'viz',
          viz: { type: 'combat.stagger' },
          task: md`Press *Kai hit* three times, then *Blizzard (weak)*, then *Kai hit* until it staggers. Count the hits, then press *Reset* and try to stagger it with as few button presses as possible. Once staggered, press *Focus Strike* twice and watch the multiplier. Finally, hit it once and wait: when does the meter start draining?`,
          caption: md`This figure runs the same \`StaggerComponent\` class (in TypeScript) that the battle figures use, with the GDScript's names. The log shows each hit's gain, including the pressured multiplier.`,
        },
        { kind: 'code', file: 'scripts/resources/hit_data.gd', code: HIT_DATA_K04, fragment: true },
        { kind: 'code', file: 'scripts/character.gd', code: CHARACTER_K04, note: md`The order inside \`_on_hurt\` matters: damage uses the multiplier the hit *found*, then \`take_hit\` adds stagger. The hit that fills the meter is not itself multiplied, which is how most stagger systems feel when you watch the numbers. \`hit.with_amount(amount)\` reports the real damage to \`hit_landed\`, so k01's damage numbers show 45 instead of 28 during a stagger.` },
        { kind: 'code', file: 'scripts/states/staggered.gd', code: STAGGERED_STATE },
        {
          kind: 'derive',
          title: 'stagger gain per hit',
          goal: md`Write the stagger a hit adds, from its base value $b$, a weakness and the pressured state, and find the hits needed to stagger.`,
          steps: [
            { md: md`Weakness: $b \to 1.5\,b$. Pressured state (including a pressure caused by this very hit): multiply by $g$ (\`pressured_gain\`, 2). So $$\Delta = b \cdot (1.5 \text{ if weak}) \cdot (g \text{ if pressured}).$$` },
            {
              md: md`A hit that *causes* the pressure already gets $g$, because \`take_hit\` switches to PRESSURED before computing the gain.`,
              choose: {
                prompt: md`Blizzard ($b = 14$, ice) on a NORMAL, ice-weak skeleton adds how much?`,
                options: [md`42`, md`21`, md`28`],
                answer: 0,
                explain: md`$14 \times 1.5 = 21$ for the weakness, and the weakness pressures, so $\times 2 = 42$.`,
              },
            },
            { md: md`Hits to fill a meter $M$ from $v$ with gains of $\Delta$ each: $\lceil (M - v)/\Delta \rceil$. From 45, Kai's pressured hits ($3 \times 2 = 6$) need $\lceil 55/6 \rceil = 10$; Bram's ($7 \times 2 = 14$) need 4.` },
          ],
          takeaway: md`Pressure doubles everything, so the fastest route to a stagger is to start pressure early (a weakness, a punish, Shield Bash) and then pour hits in during its 4 s window.`,
        },
        {
          kind: 'numeric',
          q: md`The skeleton is staggered at ×1.6. Kai uses Focus Strike (\`multiplier_bonus\` 0.25), then Braver (power 4, Kai's attack 7). What is Braver's damage, rounded to an integer?`,
          answer: { kind: 'number', value: 52 },
          explain: md`The multiplier becomes $1.6 + 0.25 = 1.85$. Braver: $\operatorname{round}(7 \times 4 \times 1.85) = \operatorname{round}(51.8) = 52$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'combat.battle', mode: 'stagger' },
          task: md`Use the sliders to make stagger hard (\`stagger_max\` 180, \`pressured_gain\` 1) and play for 30 s. Then make it easy (\`stagger_max\` 60, \`pressured_gain\` 3). Which version makes you watch the skeleton's windups, and why?`,
          caption: md`The skeleton is pressured by any hit during its windup (\`vulnerable\`), so punishing telegraphs is the main way Kai, who has no ice spell, staggers it.`,
        },
        { kind: 'code', file: 'scripts/states/windup.gd', code: WINDUP_FRAGMENT, fragment: true, note: md`k02's enemy windup state is where the telegraph plays. Setting \`vulnerable\` in \`enter()\` and clearing it in \`exit()\` opens the punish window for exactly as long as the telegraph lasts, however the state is left.` },
        {
          kind: 'steps',
          title: 'Abilities and stagger on a skeleton',
          steps: [
            md`Create \`resources/abilities/\` and in it \`braver.tres\` (power 4, atb_cost 1, stagger 14, animation \`attack\`, cast_time 0.3) and \`focus_strike.tres\` (power 1.5, stagger 30, multiplier_bonus 0.25). Add a \`potion.tres\` with target \`SELF\`, power 0 and heal 70.`,
            md`Add an \`AbilityRunner\` to Kai, set its \`atb\` export to his \`AtbGauge\` and drag the three \`.tres\` files into \`abilities\`. Add an \`Ability\` state (\`scripts/states/ability.gd\`) and a \`Guard\` state under his \`StateMachine\`.`,
            md`Open the skeleton scene from k02. Add a \`StaggerComponent\` child, set \`weaknesses\` to \`["ice"]\`, add a \`Staggered\` state under its \`StateMachine\`, and update its windup state as in the fragment above.`,
            md`Replace \`scripts/character.gd\` with the listing above and add the new fields to \`hit_data.gd\`.`,
            md`Until k05 builds the menu, test with a debug key: in a test script, on a key press call \`$Kai/AbilityRunner.enqueue(braver, $Skeleton)\` with \`braver\` preloaded from the \`.tres\`.`,
          ],
          result: md`Kai plays his attack animation, and 0.3 s later the skeleton flashes and loses 28 HP. After a few pressured strings it stops moving, its stagger meter drains over 6 s, and Braver now hits for 45.`,
          troubleshoot: [
            { problem: md`\`enqueue\` returns false.`, fix: md`Kai has less than one ATB segment, or \`atb\` is not set on the runner. Print \`atb.value\` before the call.` },
            { problem: md`The skeleton gets staggered and then immediately plays Hurt and walks off.`, fix: md`\`_on_hurt\` read the state *before* \`take_hit\` and transitioned to Hurt afterwards. Read \`state_machine.current.name\` again after \`take_hit\`, as the listing does.` },
            { problem: md`Error: \`Invalid access to property or key 'recovered' on a base object of type 'Nil'\`.`, fix: md`An enemy without a \`StaggerComponent\` entered \`Staggered\`, or the node is not named exactly \`StaggerComponent\`, so \`character.stagger\` is \`null\`.` },
          ],
        },
        {
          kind: 'build',
          ch: {
            id: 'k04-2-build',
            title: 'Lyra\'s spells as data',
            goal: md`Make Fire, Blizzard and Cure as \`.tres\` files and get them working through the same runner, including MP, elements and an area effect for Fire, without writing a new script per spell.`,
            requirements: [
              md`\`fire.tres\`, \`blizzard.tres\` and \`cure.tres\` exist with \`is_magic\` true, MP costs 6, 6 and 8, and \`effect_scene\` set (\`fx_fireball\`, \`fx_ice\`, \`fx_heal\`).`,
              md`Blizzard on the ice-weak skeleton pressures it and adds 42 stagger from NORMAL.`,
              md`Fire damages every enemy within 18 px of its target (an area spell).`,
              md`Cure restores HP to an ally; casting with less than 8 MP is refused.`,
              md`No ability has its own script.`,
            ],
            hints: [
              md`Area damage is a property of the data: add \`@export var radius := 0.0\` to \`AbilityData\`, and in \`_apply\`, when it is above 0, collect every node in the \`enemies\` group within \`radius\` of the target.`,
              md`An effect scene is an \`AnimatedSprite2D\` with the fx sheet's \`play\` animation (loop off) and a script that frees itself on \`animation_finished\`.`,
            ],
            solution: [
              {
                file: 'scripts/components/ability_runner.gd',
                code: ABILITY_RUNNER.replace(
                  gd`        _:
            if is_instance_valid(command.target):
                targets = [command.target]`,
                  gd`        _:
            if is_instance_valid(command.target):
                targets = [command.target]
                if ability.radius > 0.0:
                    targets = _in_radius(command.target.global_position, ability.radius)`,
                ).replace(
                  `func _make_hit(`,
                  gd`## Every enemy whose position is within radius px of center (Fire's area).
func _in_radius(center: Vector2, radius: float) -> Array[Node]:
    var out: Array[Node] = []
    for node in get_tree().get_nodes_in_group("enemies"):
        var enemy := node as Node2D
        if enemy and enemy.global_position.distance_to(center) <= radius:
            out.append(enemy)
    return out


func _make_hit(`,
                ),
              },
            ],
            explain: md`The only code change is generic: an area radius in the data, and a helper that collects the enemies inside it. Fire, Blizzard and Cure differ purely in their \`.tres\` values (element, power, MP, heal, radius, effect). The weakness and pressure logic lives in the target's \`StaggerComponent\`, so Blizzard knows nothing about skeletons; the skeleton knows it is weak to ice.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'k04-2-paper',
            title: 'A stagger by the numbers',
            type: 'compute',
            difficulty: 2,
            minutes: 8,
            statement: md`A skeleton's meter is at 30 (NORMAL, max 100, ice-weak). Lyra casts Blizzard ($b = 14$). Immediately after, Bram lands basic hits ($b = 7$) while it is still pressured. How many Bram hits are needed to stagger it?`,
            solution: [md`Blizzard: $14 \times 1.5 \times 2 = 42$, meter $30 + 42 = 72$, and the skeleton is now pressured.`, md`Bram's pressured hits add $7 \times 2 = 14$. Remaining: $100 - 72 = 28$, so $\lceil 28/14 \rceil = 2$ hits.`],
            answer: { kind: 'number', value: 2 },
            areas: ['combat', 'math'],
          },
        },
        {
          kind: 'explain',
          prompt: md`Why does the AbilityRunner deliver damage by emitting \`hurtbox.hurt\` on the target, instead of calling \`target.health.damage()\` directly?`,
          model: md`Everything that should happen when something is hit already hangs off the Hurtbox: \`Character._on_hurt\` applies guard reduction, the stagger multiplier and the stagger meter, flashes the sprite, transitions to Hurt or keeps super armour, and emits \`hit_landed\`, which drives hitstop, damage numbers, sounds, ATB and limit gain. Calling \`health.damage()\` directly would skip all of that, and every feature added to hits later would need a second implementation for abilities. One path for all hits means one place to change and no drift between swords and spells.`,
        },
      ],
      cards: [
        { id: 'k04-2-c1', kind: 'concept', front: md`Why does the AbilityRunner pay ATB in enqueue() rather than when the ability starts?`, back: md`So acceptance is final: the menu can never accept two commands against the same segment, and a queued command cannot fail later for lack of ATB.` },
        { id: 'k04-2-c2', kind: 'compute', front: md`Base stagger 10, target weak to the element, pressured gain 2. Stagger added?`, answer: { kind: 'number', value: 30 }, back: md`$10 \times 1.5 \times 2 = 30$ (the weakness pressures, so the same hit gets the gain).` },
        { id: 'k04-2-c3', kind: 'cloze', text: md`A staggered enemy takes damage × damage_multiplier, which starts at {{}} (as a factor).`, answers: ['1.6|1.60|160%'] },
        { id: 'k04-2-c4', kind: 'concept', front: md`Name the three StaggerComponent states and what moves between them.`, back: md`NORMAL → PRESSURED on a pressuring hit (weakness, pressuring ability, hit during a windup); back to NORMAL when the pressure timer runs out. NORMAL or PRESSURED → STAGGERED when the meter is full; STAGGERED → NORMAL when stagger_duration ends (meter 0, multiplier 1).` },
        { id: 'k04-2-c5', kind: 'concept', front: md`Why read the state machine's state again after stagger.take_hit() in _on_hurt?`, back: md`take_hit may emit staggered, which switches the enemy to Staggered; using the old value would send it to Hurt and cancel the stagger.` },
      ],
    },
    // ======================================================================================== k04-3
    {
      id: 'k04-3',
      title: 'Battles in the field: encounters, victory and defeat',
      minutes: 35,
      objectives: [
        'Start a battle where the party stands, with an Area2D trigger, arena walls and enemies that wake up.',
        'Count enemies down through died signals and end with victory or defeat through the Events bus.',
        'Change collision shapes and monitoring safely from physics callbacks with set_deferred.',
        'Decide what is saved after a battle so encounters do not respawn, and what resets on defeat.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`In older RPGs, touching an enemy faded the screen to a separate battle scene with its own background. FF7 Remake, CrossCode and Sea of Stars fight where you stand: enemies notice you, the music changes, an invisible boundary appears, and when the last enemy falls you simply walk on.

For Shardbound that means a battle is not a scene; it is a **state of the field**. Something must notice that the party walked in, close the area, wake the enemies, watch for the end, and undo all of it afterwards. That something is an \`Encounter\` node placed in the level.`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'What changes when a battle starts, and back when it ends',
          md: md`| | Exploring | Battle | After victory |
|---|---|---|---|
| Arena walls | collision off, hidden | on, visible | off |
| Enemies' AI | disabled (standing idle) | enabled | gone |
| Camera | follows the party | limited to the arena | follows again |
| Music | field | battle | field |
| HUD | minimal | party HP/MP/ATB | minimal |
| Save data | | | encounter flagged as cleared |

Each row is one line of code in \`start()\` or \`_win()\`. The HUD and music listen to \`Events.battle_started\` and \`Events.battle_won\`, so the encounter does not need to know they exist.`,
        },
        {
          kind: 'viz',
          viz: { type: 'combat.battleflow' },
          task: md`Step through the victory outcome and note which signals fire at each step. Then switch to *defeat* and find the step where the two outcomes diverge. Why does the encounter come back after a defeat but not after a victory?`,
          caption: md`Blue dashes: the trigger area. Red: arena walls with collision on. Enemies show z while their AI is disabled and ! once it runs.`,
        },
        { kind: 'code', file: 'scripts/autoload/events.gd', code: EVENTS_BATTLE, fragment: true },
        { kind: 'code', file: 'scripts/battle/encounter.gd', code: ENCOUNTER },
        {
          kind: 'text',
          md: md`Three Godot details carry this script:

- **\`set_deferred\`.** \`body_entered\` is emitted while the physics server is in the middle of processing. Changing an area's \`monitoring\` or a shape's \`disabled\` at that moment is not allowed (Godot reports "Function blocked during in/out signal"), so both are deferred to the end of the frame with \`set_deferred("property", value)\`.
- **\`CONNECT_ONE_SHOT\`.** Each enemy's \`died\` is connected once and disconnects itself after firing. If an enemy somehow emitted \`died\` twice (c05's \`HealthComponent\` guards against it), the count could not go wrong.
- **The flag.** \`GameState.set_flag(encounter_id)\` records the win in the save data. On the next load, \`_ready\` sees the flag and removes the enemies, so cleared areas stay cleared. A defeat sets nothing, so retrying finds the encounter again.`,
        },
        {
          kind: 'check',
          q: md`You write \`trigger.monitoring = false\` (not deferred) inside \`_on_trigger_body_entered\`. What happens?`,
          options: [md`Godot reports an error that the function is blocked during an in/out signal, and monitoring is not changed.`, md`It works the same as set_deferred.`, md`The game crashes.`, md`The signal is emitted twice.`],
          answer: 0,
          explain: md`Area monitoring cannot change while the area is being flushed in the physics step. The error appears in the debugger and the area keeps monitoring, so walking back in could start the battle twice.`,
        },
        {
          kind: 'steps',
          title: 'Build an encounter in the field',
          steps: [
            md`Create \`scenes/battle/encounter.tscn\` with a \`Node2D\` root named \`Encounter\` and attach \`scripts/battle/encounter.gd\`.`,
            md`Add an \`Area2D\` named \`EncounterTrigger\` with a \`CollisionShape2D\` (a rectangle covering the battle area, about 240×140 px). Set its **Collision → Mask** to \`player\` (layer 2) only, and its layer to none.`,
            md`Add a \`StaticBody2D\` named \`ArenaWalls\` on the \`world\` layer with four \`CollisionShape2D\` children (thin rectangles, 8 px thick) forming a box just inside the trigger. Tick **Disabled** on each shape. Add a few rock or fence sprites under it so the walls are visible when it is shown.`,
            md`Instance two slimes and a skeleton from k02 as children of \`Encounter\`. Make sure each has a child named \`AIController\`.`,
            md`Place the encounter in your field scene, set \`player\` to Kai, and set the two music exports to \`music_battle\` and \`music_field\`. Add the \`TacticalMode\` lines below so the menu closes when the battle ends.`,
            md`Run, walk in, win, then reload the scene: the encounter is gone (once \`GameState\` saves flags; until r06, it resets on reload).`,
          ],
          result: md`The enemies stand still until Kai crosses the dashed line; then walls appear, the music changes and the enemies attack. When the last one dies, the walls vanish and the field music returns.`,
          troubleshoot: [
            { problem: md`The battle never starts.`, fix: md`The trigger's mask does not include Kai's layer, or Kai's collision layer is not \`player\`. The trigger must *detect* Kai, so it is the trigger's **mask** that matters.` },
            { problem: md`Enemies attack before Kai arrives.`, fix: md`Their controller is not named \`AIController\`, so \`get_node_or_null\` returns \`null\` and nothing is disabled. Rename it, or export a reference instead.` },
            { problem: md`Kai can walk through the walls.`, fix: md`The walls are on a layer Kai's body does not mask. Kai's mask must include \`world\` (layer 1).` },
          ],
        },
        { kind: 'code', file: 'scripts/battle/tactical_mode.gd', code: TACTICAL_CLOSE_ON_END, fragment: true, note: md`A battle can end while the menu is open (a queued Fire kills the last enemy). Closing tactical mode on both outcomes restores \`Engine.time_scale\` before the banners appear.` },
        {
          kind: 'numeric',
          q: md`The arena is 400×220 px and the view is 320×180. With camera limits set to the arena, how many pixels can the camera centre travel horizontally and vertically? Enter both.`,
          answer: { kind: 'vector', value: [80, 40] },
          explain: md`The centre can be anywhere from half a view inside one edge to half a view inside the other: $400 - 320 = 80$ px horizontally, $220 - 180 = 40$ px vertically. An arena exactly the size of the view gives a fixed camera, which suits small fights.`,
        },
        {
          kind: 'viz',
          viz: { type: 'combat.battle', mode: 'full' },
          task: md`Play the whole fight: two slimes and a skeleton, then the golem. Lose once on purpose (stand in the golem's slam) and win once. Note what the game does on each outcome and how long the fight took.`,
          caption: md`The dashed rectangle is the arena boundary. This figure is the k05 version with the full party; for now, notice the start, the two waves and the two endings.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'k04-3-build',
            title: 'Victory and defeat banners',
            goal: md`Show the outcome of a battle: a short victory banner with the rewards, and a defeat screen that pauses the game and offers a retry.`,
            requirements: [
              md`On \`Events.battle_won\`, a banner shows "Victory" and the XP and gold for 2 s, while the game keeps running.`,
              md`On \`Events.battle_lost\`, the game pauses, a "Defeated" panel appears and its Retry button has keyboard and gamepad focus.`,
              md`Retry unpauses and reloads the scene.`,
              md`If the menu was open when the battle ended, the game is not left in slow motion.`,
            ],
            hints: [
              md`Build \`ui/battle_result.tscn\` as a \`Control\` (full rect) with \`Panel/VBox\` holding two \`Label\`s and a \`Button\`, and put it in the HUD's \`CanvasLayer\`.`,
              md`A paused tree stops the panel too unless its process mode is *Always*.`,
              md`\`grab_focus()\` on the button makes \`ui_accept\` press it.`,
            ],
            solution: [{ file: 'ui/battle_result.gd', code: BATTLE_RESULT }],
            explain: md`The panel listens to the bus, so neither the encounter nor the player script knows it exists. On defeat it resets the time scale itself as well, in case the defeat happened inside tactical mode in a scene that has no \`TacticalMode\`. \`reload_current_scene()\` is the simplest retry; r06 replaces it with loading the last save.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'k04-3-paper',
            title: 'The encounter that ends twice',
            type: 'debug',
            difficulty: 2,
            minutes: 8,
            statement: md`A tester reports that after winning, the victory banner sometimes appears twice and the XP is given twice. The encounter connects deaths like this:

\`\`\`gdscript
func start() -> void:
	_remaining = _enemies.size()
	for enemy in _enemies:
		enemy.health.died.connect(_on_enemy_died)
\`\`\`

and the trigger handler calls \`start()\` without turning the trigger off. Explain both ways the bug can happen and fix them.`,
            solution: [
              md`Without disabling the trigger, Kai leaving and re-entering the area (knocked back across the line) calls \`start()\` again. The second call resets \`_remaining\` to 3 and connects every \`died\` a second time; each death then runs \`_on_enemy_died\` twice, and the counter hits zero twice.`,
              md`Fix: turn the trigger off on the first entry (\`trigger.set_deferred("monitoring", false)\`), and guard \`start()\` with a \`_started\` flag. Connect with \`CONNECT_ONE_SHOT\`, which also prevents a double connection from surviving.`,
            ],
            rubric: [md`Identifies the re-entry calling start() twice`, md`Explains the duplicate connections doubling the count`, md`Fixes with deferred monitoring off and a guard or one-shot connections`],
            areas: ['godot', 'combat'],
          },
        },
        {
          kind: 'recall',
          prompt: md`List what \`Encounter.start()\` changes, and what \`_win()\` changes back or records.`,
          answer: md`start(): walls on (deferred), enemies' AI on, died signals connected one-shot, defeat watcher connected, battle music, \`Events.battle_started\`. _win(): walls off, defeat watcher disconnected, the encounter flag set in GameState, field music, \`Events.battle_won(xp, gold)\`.`,
        },
      ],
      cards: [
        { id: 'k04-3-c1', kind: 'concept', front: md`Why use set_deferred to change a CollisionShape2D's disabled inside body_entered?`, back: md`The signal runs during physics processing, when shapes and monitoring may not change; set_deferred applies the change at the end of the frame.` },
        { id: 'k04-3-c2', kind: 'cloze', text: md`connect(callable, {{}}) disconnects the connection automatically after it fires once.`, answers: ['CONNECT_ONE_SHOT'] },
        { id: 'k04-3-c3', kind: 'concept', front: md`How does a cleared encounter stay cleared after a reload?`, back: md`_win() sets a GameState flag with the encounter's id; _ready() checks it and frees the enemies instead of arming the trigger.` },
        { id: 'k04-3-c4', kind: 'compute', front: md`Arena 360 px wide, view 320 px. Horizontal camera travel with limits on the arena?`, answer: { kind: 'number', value: 40 }, back: md`$360 - 320 = 40$ px.` },
        { id: 'k04-3-c5', kind: 'concept', front: md`Why close tactical mode on battle_won and battle_lost?`, back: md`A battle can end while the menu is open; without closing it, Engine.time_scale stays at 0.1 and the game continues in slow motion.` },
      ],
    },
  ],
  problems: [
    {
      id: 'k04-p1',
      title: 'Segments on the HUD',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`The gauge holds 137.5 with segments of 100. What fraction of the second HUD segment is filled?`,
      solution: [md`Segment 2 shows $\operatorname{clamp}(137.5 - 100, 0, 100) = 37.5$.`, md`As a fraction: $37.5/100 = 0.375$.`],
      answer: { kind: 'number', value: 0.375 },
      areas: ['combat'],
    },
    {
      id: 'k04-p2',
      title: 'Slow-motion arrow',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`A skeleton archer's arrow flies at 150 px/s toward Lyra, 90 px away, when the player opens tactical mode at time scale 0.1. How many real seconds does the player have before it lands?`,
      solution: [md`In game time the arrow needs $90/150 = 0.6$ s.`, md`In real time: $0.6/0.1 = 6$ s.`],
      answer: { kind: 'number', value: 6 },
      areas: ['combat', 'math'],
    },
    {
      id: 'k04-p3',
      title: 'Frame counters and slow motion',
      type: 'debug',
      difficulty: 2,
      minutes: 8,
      statement: md`An enemy's attack state ends like this, and in tactical mode the enemy attacks at full speed while everything else slows. Explain and fix.

\`\`\`gdscript
var _frames := 0

func physics_update(_delta: float) -> void:
	_frames += 1
	if _frames >= 36:
		state_machine.transition_to("Recover")
\`\`\``,
      solution: [
        md`\`Engine.time_scale\` does not change how many physics ticks run per real second; it changes the \`delta\` each tick receives. Counting ticks ignores the time scale, so the attack still lasts 36 ticks = 0.6 real seconds.`,
        md`Count seconds instead: \`_time += delta\` and \`if _time >= 0.6:\`. The attack then lasts 0.6 *game* seconds, which is 6 real seconds at time scale 0.1.`,
      ],
      rubric: [md`States that time_scale scales delta, not the tick rate`, md`Replaces the frame count with accumulated delta in seconds`],
      areas: ['godot', 'combat'],
    },
    {
      id: 'k04-p4',
      title: 'Multiplier cap',
      type: 'compute',
      difficulty: 2,
      minutes: 5,
      statement: md`A golem is staggered at ×1.6 with \`max_multiplier\` 3.0. Kai uses Focus Strike (+0.25) every time he has a segment, and gets one every 1.5 s during the stagger. How many Focus Strikes are needed to reach the cap, and can he reach it within one 6 s stagger?`,
      solution: [md`Needed: $(3.0 - 1.6)/0.25 = 5.6$, so 6 Focus Strikes.`, md`In 6 s he gets 4 segments, reaching $1.6 + 4 \times 0.25 = 2.6$. He cannot reach the cap alone; Bram's Shield Bash (+0.1) and staggers that last longer would be needed.`],
      answer: { kind: 'number', value: 6 },
      areas: ['combat', 'math'],
    },
    {
      id: 'k04-p5',
      title: 'Where the multiplier lives',
      type: 'concept',
      difficulty: 2,
      minutes: 6,
      statement: md`The staggered damage multiplier could be applied by the attacker (the Hitbox multiplies \`hit.amount\`), by the target (\`_on_hurt\` multiplies), or by a global damage function. Explain why this lesson applies it on the target and what would go wrong if the Hitbox did it.`,
      solution: [
        md`The multiplier is a property of the *target's* state: only that enemy is staggered. The target knows its \`StaggerComponent\`; the attacker would have to look it up for every target.`,
        md`A Hitbox's \`HitData\` is shared between every target of one swing. If the Hitbox multiplied \`hit.amount\` for a staggered enemy, a second unstaggered enemy hit by the same swing would also take the multiplied damage, or the first would take it twice.`,
        md`r01's \`DamageCalc\` takes the multiplier as a parameter; it is still the target's \`Combatant\` that supplies it.`,
      ],
      rubric: [md`Ties the multiplier to the target's state`, md`Explains the shared HitData problem`, md`Mentions that a central damage function still receives it from the target`],
      areas: ['combat', 'systems'],
    },
    {
      id: 'k04-p6',
      title: 'Write take_hit on paper',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 12,
      statement: md`Without looking at the lesson, write \`StaggerComponent.take_hit(hit: HitData)\` for this specification: staggered enemies only receive \`multiplier_bonus\` (capped at \`max_multiplier\`); a weakness multiplies stagger by 1.5; weakness, \`hit.pressures\` or \`vulnerable\` pressure the enemy (and refresh the pressure timer); pressured gain is multiplied by \`pressured_gain\`; a full meter starts the stagger.`,
      solution: [
        md`\`\`\`gdscript
func take_hit(hit: HitData) -> void:
	if state == State.STAGGERED:
		if hit.multiplier_bonus > 0.0:
			damage_multiplier = minf(damage_multiplier + hit.multiplier_bonus, max_multiplier)
		return
	_since_hit = 0.0
	var amount := hit.stagger
	var weak := hit.element in weaknesses
	if weak:
		amount *= 1.5
	if hit.pressures or weak or vulnerable:
		if state == State.NORMAL:
			state = State.PRESSURED
			pressured.emit()
		_timer = pressure_duration
	if state == State.PRESSURED:
		amount *= pressured_gain
	value = minf(value + amount, stagger_max)
	changed.emit(value, stagger_max)
	if value >= stagger_max:
		_start_stagger()
\`\`\``,
        md`Check against the lesson: the pressure switch happens *before* the gain is computed, so the hit that pressures also gets the bonus, and \`_since_hit\` resets so decay waits.`,
      ],
      rubric: [md`Staggered branch only touches the multiplier, with the cap`, md`Weakness ×1.5 and pressure applied before the gain`, md`Pressure refresh and the pressured signal only on the transition`, md`Clamp, changed signal, and stagger start when full`],
      areas: ['combat', 'godot'],
    },
    {
      id: 'k04-p7',
      title: 'Time scale or pause',
      type: 'design',
      difficulty: 2,
      minutes: 8,
      statement: md`A playtester with limited hand mobility finds tactical mode at time scale 0.1 stressful. Propose how Shardbound should support them, which Godot mechanism it uses, and two things that must be checked so the option does not break other systems.`,
      solution: [
        md`Offer a "wait" style in the options: \`TacticalMode.style = Style.WAIT\` pauses the tree (\`get_tree().paused = true\`) while the menu is open.`,
        md`Check 1: everything that must run during the menu (the menu, its cursor tweens, \`TacticalMode\` itself, the HUD if it animates) uses \`PROCESS_MODE_ALWAYS\`; otherwise the game cannot be unpaused.`,
        md`Check 2: timers created during battle (\`create_timer(t, false)\` in the AbilityRunner, hitstop timers) behave sensibly under a pause; hitstop uses \`process_always = true\`, which is fine since nothing else moves, but a cast should not finish during the pause.`,
        md`Optionally keep a small amount of motion (time scale 0.02) for players who want the world to stay alive but have ample time.`,
      ],
      rubric: [md`Proposes a pause-based wait option tied to TacticalMode`, md`Names PROCESS_MODE_ALWAYS for the menu and related nodes`, md`Identifies at least one timer or tween interaction to verify`],
      areas: ['combat', 'godot'],
    },
    {
      id: 'k04-p8',
      title: 'Guarding pays',
      type: 'compute',
      difficulty: 2,
      minutes: 6,
      statement: md`Bram has \`guard_factor\` 0.2 and \`atb_per_block\` 25. The golem's slam deals 30. Bram guards three slams in a row. How much damage does he take in total, and how much ATB does he gain? Enter both.`,
      solution: [md`Each blocked slam deals $\max(1, \operatorname{round}(30 \times 0.2)) = 6$; three deal 18.`, md`Each adds 25 ATB: 75 in total, three quarters of a segment.`],
      answer: { kind: 'vector', value: [18, 75] },
      areas: ['combat', 'math'],
    },
  ],
};
