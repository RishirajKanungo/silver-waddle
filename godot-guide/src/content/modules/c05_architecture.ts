import { md, gd, type Module } from '../types';

// ------------------------------------------------------------------------------------ c05-1 listings
const PLAYER_FLAGS = gd`
class_name Player
extends CharacterBody2D

@export var max_speed := 90.0
@export var dash_speed := 260.0
@export var dash_time := 0.15
@export var attack_time := 0.3

var facing_vector := Vector2.DOWN
var is_dashing := false
var is_attacking := false
var _dash_left := 0.0
var _attack_left := 0.0

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D


func _physics_process(delta: float) -> void:
    var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")
    if input != Vector2.ZERO:
        facing_vector = input.normalized()

    if Input.is_action_just_pressed("dodge") and not is_attacking:
        is_dashing = true
        _dash_left = dash_time
        velocity = facing_vector * dash_speed
    if Input.is_action_just_pressed("attack"):
        is_attacking = true
        _attack_left = attack_time

    if is_dashing:
        _dash_left -= delta
        if _dash_left <= 0.0:
            is_dashing = false
    elif is_attacking:
        velocity = Vector2.ZERO
        _attack_left -= delta
        if _attack_left <= 0.0:
            is_attacking = false
    else:
        velocity = input * max_speed
    move_and_slide()

    if is_attacking:
        sprite.play("attack_" + _facing_name())
    elif is_dashing:
        sprite.play("dash_" + _facing_name())
    elif velocity != Vector2.ZERO:
        sprite.play("walk_" + _facing_name())
    else:
        sprite.play("idle_" + _facing_name())


func _facing_name() -> String:
    if absf(facing_vector.x) > absf(facing_vector.y):
        sprite.flip_h = facing_vector.x < 0.0
        return "side"
    return "up" if facing_vector.y < 0.0 else "down"
`;

const PLAYER_ENUM = gd`
class_name Player
extends CharacterBody2D

enum State { IDLE, MOVE, DASH, ATTACK }

@export var max_speed := 90.0
@export var acceleration := 900.0
@export var friction := 1200.0
@export var dash_speed := 260.0
@export var dash_time := 0.15
@export var attack_time := 0.3

var state := State.IDLE
var facing_vector := Vector2.DOWN
## Seconds since the current state began. Reset in exactly one place: _change_state.
var _time_in_state := 0.0

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D


func _ready() -> void:
    _change_state(State.IDLE)


func _physics_process(delta: float) -> void:
    _time_in_state += delta
    var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")
    match state:
        State.IDLE, State.MOVE:
            if Input.is_action_just_pressed("attack"):
                _change_state(State.ATTACK)
            elif Input.is_action_just_pressed("dodge"):
                _change_state(State.DASH)
            else:
                _walk(input, delta)
        State.DASH:
            if _time_in_state >= dash_time:
                _change_state(State.IDLE)
        State.ATTACK:
            velocity = velocity.move_toward(Vector2.ZERO, friction * delta)
            if _time_in_state >= attack_time:
                _change_state(State.IDLE)
    move_and_slide()


func _walk(input: Vector2, delta: float) -> void:
    if input != Vector2.ZERO:
        facing_vector = input.normalized()
    var rate := acceleration if input != Vector2.ZERO else friction
    velocity = velocity.move_toward(input * max_speed, rate * delta)
    var next: State = State.MOVE if input != Vector2.ZERO else State.IDLE
    if next != state:
        _change_state(next)
    sprite.play(("walk_" if state == State.MOVE else "idle_") + _facing_name())


## The only place state changes. Entry actions (things that happen once) live here.
func _change_state(next: State) -> void:
    state = next
    _time_in_state = 0.0
    match state:
        State.IDLE:
            sprite.play("idle_" + _facing_name())
        State.MOVE:
            sprite.play("walk_" + _facing_name())
        State.DASH:
            velocity = facing_vector * dash_speed
            sprite.play("dash_" + _facing_name())
        State.ATTACK:
            sprite.play("attack_" + _facing_name())


func _facing_name() -> String:
    if absf(facing_vector.x) > absf(facing_vector.y):
        sprite.flip_h = facing_vector.x < 0.0
        return "side"
    return "up" if facing_vector.y < 0.0 else "down"
`;

const PLAYER_ENUM_HURT = gd`
class_name Player
extends CharacterBody2D

enum State { IDLE, MOVE, DASH, ATTACK, HURT }

@export var max_speed := 90.0
@export var acceleration := 900.0
@export var friction := 1200.0
@export var dash_speed := 260.0
@export var dash_time := 0.15
@export var attack_time := 0.3
@export var hurt_time := 0.3
@export var knockback_speed := 160.0

var state := State.IDLE
var facing_vector := Vector2.DOWN
var _time_in_state := 0.0

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D


func _ready() -> void:
    _change_state(State.IDLE)


## Called by hazards. The state decides whether the hit counts: a dash ignores it (i-frames).
func take_hit(from: Vector2) -> void:
    if state == State.DASH or state == State.HURT:
        return
    velocity = (global_position - from).normalized() * knockback_speed
    _change_state(State.HURT)


func _physics_process(delta: float) -> void:
    _time_in_state += delta
    var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")
    match state:
        State.IDLE, State.MOVE:
            if Input.is_action_just_pressed("attack"):
                _change_state(State.ATTACK)
            elif Input.is_action_just_pressed("dodge"):
                _change_state(State.DASH)
            else:
                _walk(input, delta)
        State.DASH:
            if _time_in_state >= dash_time:
                _change_state(State.IDLE)
        State.ATTACK:
            velocity = velocity.move_toward(Vector2.ZERO, friction * delta)
            if _time_in_state >= attack_time:
                _change_state(State.IDLE)
        State.HURT:
            # The knockback slides out under friction; input is ignored until the timer ends.
            velocity = velocity.move_toward(Vector2.ZERO, friction * delta)
            if _time_in_state >= hurt_time:
                _change_state(State.IDLE)
    move_and_slide()


func _walk(input: Vector2, delta: float) -> void:
    if input != Vector2.ZERO:
        facing_vector = input.normalized()
    var rate := acceleration if input != Vector2.ZERO else friction
    velocity = velocity.move_toward(input * max_speed, rate * delta)
    var next: State = State.MOVE if input != Vector2.ZERO else State.IDLE
    if next != state:
        _change_state(next)
    sprite.play(("walk_" if state == State.MOVE else "idle_") + _facing_name())


func _change_state(next: State) -> void:
    state = next
    _time_in_state = 0.0
    match state:
        State.IDLE:
            sprite.play("idle_" + _facing_name())
        State.MOVE:
            sprite.play("walk_" + _facing_name())
        State.DASH:
            velocity = facing_vector * dash_speed
            sprite.play("dash_" + _facing_name())
        State.ATTACK:
            sprite.play("attack_" + _facing_name())
        State.HURT:
            sprite.play("hurt")


func _facing_name() -> String:
    if absf(facing_vector.x) > absf(facing_vector.y):
        sprite.flip_h = facing_vector.x < 0.0
        return "side"
    return "up" if facing_vector.y < 0.0 else "down"
`;

const SPIKES = gd`
extends Area2D
## A floor hazard. Set its Mask to the player layer (2) so only bodies on that layer are reported.


func _ready() -> void:
    body_entered.connect(_on_body_entered)


func _on_body_entered(body: Node2D) -> void:
    if body is Player:
        (body as Player).take_hit(global_position)
`;

// ------------------------------------------------------------------------------------ c05-2 listings
const STATE = gd`
class_name State
extends Node
## One state of a StateMachine. Override the methods you need; the others do nothing.

## The body this state drives. Set by StateMachine.start().
var character: Character
## The machine that owns this state, so a state can call state_machine.transition_to("Dash").
var state_machine: StateMachine


## Called once when the machine switches to this state.
func enter() -> void:
    pass


## Called once when the machine leaves this state, however it leaves. Undo anything enter() did.
func exit() -> void:
    pass


## Called every rendered frame while this state is active. Use it for visuals only.
func update(_delta: float) -> void:
    pass


## Called every physics tick (60 per second) while active. Movement and decisions go here.
func physics_update(_delta: float) -> void:
    pass
`;

const STATE_MACHINE = gd`
class_name StateMachine
extends Node
## Runs exactly one child State at a time and switches between them by node name.

## Emitted after every switch. Debug labels, AI and the HUD listen to it.
signal state_changed(previous: StringName, current: StringName)

## The state to enter when start() runs. Pick one of the children in the Inspector.
@export var initial_state: State

var current: State
var _states: Dictionary[StringName, State] = {}


## Called by the owning Character from its _ready(). By then every child node is ready too.
func start(character: Character) -> void:
    for child in get_children():
        var state := child as State
        if state == null:
            continue
        state.character = character
        state.state_machine = self
        _states[state.name] = state
    current = initial_state
    current.enter()


func transition_to(state_name: StringName) -> void:
    var next: State = _states.get(state_name)
    if next == null:
        push_error("StateMachine has no state named '%s'" % state_name)
        return
    var previous := current
    current.exit()
    current = next
    current.enter()
    state_changed.emit(previous.name, current.name)


func _process(delta: float) -> void:
    if current:
        current.update(delta)


func _physics_process(delta: float) -> void:
    if current:
        current.physics_update(delta)
`;

const INTENT = gd`
class_name Intent
extends RefCounted
## What a Character wants to do this frame. A controller writes it; the Character's states read it.

## Desired movement direction, length 0 to 1.
var move := Vector2.ZERO
## One-shot requests. The controller sets one to true; the state that acts on it sets it back to false.
var wants_attack := false
var wants_dodge := false
var wants_jump := false
## Held requests: true for as long as the controller wants it.
var wants_guard := false


## Forget everything, for example when control passes to another controller.
func clear() -> void:
    move = Vector2.ZERO
    wants_attack = false
    wants_dodge = false
    wants_jump = false
    wants_guard = false
`;

const PLAYER_CONTROLLER = gd`
class_name PlayerController
extends Node
## Fills the parent Character's intent from the keyboard or a gamepad.
## Keep this node ABOVE the StateMachine in the Scene dock: siblings run in tree order, so the
## intent is written before the states read it in the same physics tick.

## How long a press stays valid while the character is busy (the input buffer from c02-2).
@export var buffer_time := 0.15

## Seconds since each action was last pressed.
var _age: Dictionary[StringName, float] = {}

@onready var character: Character = get_parent()


func _physics_process(delta: float) -> void:
    var intent := character.intent
    intent.move = Input.get_vector("move_left", "move_right", "move_up", "move_down")
    intent.wants_guard = Input.is_action_pressed("guard")
    intent.wants_attack = _buffered(&"attack", intent.wants_attack, delta)
    intent.wants_dodge = _buffered(&"dodge", intent.wants_dodge, delta)
    intent.wants_jump = _buffered(&"jump", intent.wants_jump, delta)


## True on the tick the action is pressed. Afterwards it keeps the current value (a state may have
## consumed it) until buffer_time has passed, then it is false.
func _buffered(action: StringName, current: bool, delta: float) -> bool:
    if Input.is_action_just_pressed(action):
        _age[action] = 0.0
        return true
    _age[action] = _age.get(action, INF) + delta
    return current and _age[action] <= buffer_time
`;

const CHARACTER_V1 = gd`
class_name Character
extends CharacterBody2D
## Anything that moves and fights: Kai, the party, enemies. It never reads Input; it reads its
## intent, which a controller child (PlayerController or AIController) writes.

@export var max_speed := 90.0
@export var acceleration := 900.0
@export var friction := 1200.0

var intent := Intent.new()
## "down", "up" or "side". Side sprites face right and are flipped for left.
var facing := "down"
## Unit vector of the last direction faced. Dashes and attacks go this way.
var facing_vector := Vector2.DOWN

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D
@onready var state_machine: StateMachine = $StateMachine


func _ready() -> void:
    # Children are ready before their parent, so every state exists and is ready by now.
    state_machine.start(self)


## Accelerate toward intent.move * max_speed, then move. Idle and Move both call this.
func move_with_intent(delta: float, speed_scale := 1.0) -> void:
    var target := intent.move * max_speed * speed_scale
    var rate := acceleration if intent.move != Vector2.ZERO else friction
    velocity = velocity.move_toward(target, rate * delta)
    move_and_slide()


## Turn toward dir. A zero vector keeps the current facing.
func face(dir: Vector2) -> void:
    if dir == Vector2.ZERO:
        return
    facing_vector = dir.normalized()
    if absf(dir.x) > absf(dir.y):
        facing = "side"
        sprite.flip_h = dir.x < 0.0
    else:
        facing = "up" if dir.y < 0.0 else "down"


## play_anim("walk") plays walk_side, walk_up or walk_down. Animations without directions
## (hurt, ko, and most enemy animations) play under their plain name.
func play_anim(base: String) -> void:
    var anim := base + "_" + facing
    if not sprite.sprite_frames.has_animation(anim):
        anim = base
    if sprite.animation != anim or not sprite.is_playing():
        sprite.play(anim)
`;

const IDLE = gd`
extends State
## Standing still. Leaves as soon as the intent asks for something.


func enter() -> void:
    character.play_anim("idle")


func physics_update(delta: float) -> void:
    var intent := character.intent
    if intent.wants_attack:
        state_machine.transition_to("Attack")
        return
    if intent.wants_dodge:
        state_machine.transition_to("Dash")
        return
    if intent.move != Vector2.ZERO:
        state_machine.transition_to("Move")
        return
    # Friction brings any leftover velocity (from a walk or a knockback) to zero.
    character.move_with_intent(delta)
`;

const MOVE = gd`
extends State
## Walking. The same code moves Kai, an ally or a skeleton: only the controller differs.


func physics_update(delta: float) -> void:
    var intent := character.intent
    if intent.wants_attack:
        state_machine.transition_to("Attack")
        return
    if intent.wants_dodge:
        state_machine.transition_to("Dash")
        return
    if intent.move == Vector2.ZERO:
        state_machine.transition_to("Idle")
        return
    character.face(intent.move)
    character.move_with_intent(delta)
    character.play_anim("walk")
`;

const DASH = gd`
extends State
## A short burst of speed in the direction held (or faced), as in c02-2.

@export var dash_speed := 260.0
@export var duration := 0.15

var _time := 0.0


func enter() -> void:
    _time = 0.0
    character.intent.wants_dodge = false  # consume the request so it does not fire twice
    character.face(character.intent.move)
    character.velocity = character.facing_vector * dash_speed
    character.play_anim("dash")


func physics_update(delta: float) -> void:
    _time += delta
    character.move_and_slide()
    if _time >= duration:
        state_machine.transition_to("Idle")
`;

const ATTACK_V1 = gd`
extends State
## One sword swing. Lesson c05-3 gives it a hitbox and k01 turns it into a three-hit string.

@export var duration := 0.3

var _time := 0.0


func enter() -> void:
    _time = 0.0
    character.intent.wants_attack = false
    character.face(character.intent.move)  # a direction held at the press aims the swing
    character.play_anim("attack")


func physics_update(delta: float) -> void:
    _time += delta
    character.velocity = character.velocity.move_toward(Vector2.ZERO, character.friction * delta)
    character.move_and_slide()
    if _time >= duration:
        state_machine.transition_to("Idle")
`;

const STATE_LABEL = gd`
extends Label
## A debug label above a character that shows its current state. Delete it before release.

@export var state_machine: StateMachine


func _ready() -> void:
    state_machine.state_changed.connect(_on_state_changed)


func _on_state_changed(_previous: StringName, current: StringName) -> void:
    text = current
`;

const REPLAY_CONTROLLER = gd`
class_name ReplayController
extends Node
## Plays back a recording of intents, one entry per physics tick. Useful for bug reports and demos.

## Each entry: [move: Vector2, wants_attack: bool, wants_dodge: bool].
var recording: Array = []
var _tick := 0

@onready var character: Character = get_parent()


func _physics_process(_delta: float) -> void:
    if _tick >= recording.size():
        character.intent.clear()
        return
    var entry: Array = recording[_tick]
    character.intent.move = entry[0]
    character.intent.wants_attack = entry[1] or character.intent.wants_attack
    character.intent.wants_dodge = entry[2] or character.intent.wants_dodge
    _tick += 1
`;

// ------------------------------------------------------------------------------------ c05-3 listings
const HIT_DATA = gd`
class_name HitData
extends RefCounted
## One hit: what a Hitbox hands to the Hurtbox it touches. The same class as in g04.

## Damage before defence. The damage formula arrives in r01.
var amount := 0
var element: Element.Type = Element.Type.NONE
## Velocity given to the target, in px/s. Set from the attacker's facing when the swing starts.
var knockback := Vector2.ZERO
## Added to the target's stagger gauge (k04).
var stagger := 0.0
## Who dealt the hit: for hitstop on the attacker, ATB gain and aggro. May be freed later.
var source: Node


func _init(p_amount: int = 0, p_element: Element.Type = Element.Type.NONE, p_source: Node = null) -> void:
    amount = p_amount
    element = p_element
    source = p_source
`;

const HEALTH = gd`
class_name HealthComponent
extends Node
## Hit points for anything that can be damaged. It knows nothing about who owns it.

signal health_changed(current: int, maximum: int)
signal died

@export var max_health := 10

var health: int


func _ready() -> void:
    health = max_health


func damage(amount: int) -> void:
    if health <= 0 or amount <= 0:
        return  # already dead: a second hit in the same tick must not emit died twice
    health = maxi(health - amount, 0)
    health_changed.emit(health, max_health)
    if health == 0:
        died.emit()


func heal(amount: int) -> void:
    if health <= 0:
        return  # reviving is a separate, deliberate action
    health = mini(health + amount, max_health)
    health_changed.emit(health, max_health)
`;

const HITBOX = gd`
class_name Hitbox
extends Area2D
## The dangerous part of an attack. It carries a HitData; a Hurtbox that touches it reads it.
## Layer: player_hitbox (5) or enemy_hitbox (6). Mask: none. It is detected, it detects nothing.

@export var damage := 1
@export var element: Element.Type = Element.Type.NONE
@export var knockback_speed := 120.0
@export var stagger := 1.0

## The hit this box deals. prepare() makes a fresh one for every swing.
var hit := HitData.new()

@onready var _shape: CollisionShape2D = $CollisionShape2D


## Fill in the hit for a swing in direction dir. Call it before the box turns on.
func prepare(source: Node, dir: Vector2) -> void:
    hit = HitData.new(damage, element, source)
    hit.knockback = dir.normalized() * knockback_speed
    hit.stagger = stagger


## Turn the box on or off. Deferred, because shapes must not change while physics runs callbacks.
func set_active(on: bool) -> void:
    _shape.set_deferred("disabled", not on)
`;

const HURTBOX = gd`
class_name Hurtbox
extends Area2D
## The vulnerable part of a body. Emits hurt(hit) for every Hitbox that starts touching it.
## Layer: none. Mask: the opposing hitbox layer (enemy_hitbox for Kai, player_hitbox for enemies).

signal hurt(hit: HitData)

## While true, hits are ignored: dash i-frames, cutscenes, the moment after being hit.
var invincible := false


func _ready() -> void:
    area_entered.connect(_on_area_entered)


func _on_area_entered(area: Area2D) -> void:
    if invincible or not (area is Hitbox):
        return
    hurt.emit((area as Hitbox).hit)
`;

const CHARACTER_V2 = gd`
class_name Character
extends CharacterBody2D
## Anything that moves and fights. Reads its intent; a controller child writes it.
## Expected children: AnimatedSprite2D, StateMachine, HealthComponent, Hurtbox.

@export var max_speed := 90.0
@export var acceleration := 900.0
@export var friction := 1200.0

var intent := Intent.new()
var facing := "down"
var facing_vector := Vector2.DOWN

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D
@onready var state_machine: StateMachine = $StateMachine
@onready var health: HealthComponent = $HealthComponent
@onready var hurtbox: Hurtbox = $Hurtbox


func _ready() -> void:
    hurtbox.hurt.connect(_on_hurt)
    health.died.connect(_on_died)
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


func _on_hurt(hit: HitData) -> void:
    health.damage(hit.amount)
    if health.health <= 0:
        return  # died fired inside damage(), and _on_died already switched to Dead
    velocity = hit.knockback
    state_machine.transition_to("Hurt")


func _on_died() -> void:
    state_machine.transition_to("Dead")
`;

const DASH_IFRAMES = gd`
extends State
## A dash with invincibility frames. exit() always runs, so the i-frames can never get stuck on.

@export var dash_speed := 260.0
@export var duration := 0.15

var _time := 0.0


func enter() -> void:
    _time = 0.0
    character.intent.wants_dodge = false
    character.face(character.intent.move)
    character.velocity = character.facing_vector * dash_speed
    character.hurtbox.invincible = true
    character.play_anim("dash")


func exit() -> void:
    character.hurtbox.invincible = false


func physics_update(delta: float) -> void:
    _time += delta
    character.move_and_slide()
    if _time >= duration:
        state_machine.transition_to("Idle")
`;

const ATTACK_V2 = gd`
extends State
## One sword swing with a hitbox that is live from 0.08 s to 0.16 s.
## k01 moves these timings into an AnimationPlayer and builds a three-hit string.

@export var duration := 0.3
@export var active_from := 0.08
@export var active_until := 0.16
## The Hitbox under a Node2D pivot; the pivot is rotated to the facing direction.
@export var hitbox: Hitbox

var _time := 0.0


func enter() -> void:
    _time = 0.0
    character.intent.wants_attack = false
    character.face(character.intent.move)
    (hitbox.get_parent() as Node2D).rotation = character.facing_vector.angle()
    hitbox.prepare(character, character.facing_vector)
    character.play_anim("attack")


func exit() -> void:
    hitbox.set_active(false)  # interrupted mid-swing (Hurt): never leave the box on


func physics_update(delta: float) -> void:
    _time += delta
    hitbox.set_active(_time >= active_from and _time < active_until)
    character.velocity = character.velocity.move_toward(Vector2.ZERO, character.friction * delta)
    character.move_and_slide()
    if _time >= duration:
        state_machine.transition_to("Idle")
`;

const HURT = gd`
extends State
## Knocked back and out of control for a moment. Character._on_hurt set the velocity already.

@export var duration := 0.25
## Higher than walking friction, so a knockback is a short, sharp slide.
@export var knockback_friction := 900.0

var _time := 0.0


func enter() -> void:
    _time = 0.0
    character.play_anim("hurt")


func physics_update(delta: float) -> void:
    _time += delta
    character.velocity = character.velocity.move_toward(Vector2.ZERO, knockback_friction * delta)
    character.move_and_slide()
    if _time >= duration:
        state_machine.transition_to("Idle")
`;

const DEAD = gd`
extends State
## Out of the fight. Kai plays "ko"; enemies set the animation to "die" in the Inspector.

@export var animation := "ko"
## Enemies free themselves after the animation; the player stays for the game-over screen.
@export var free_after := -1.0


func enter() -> void:
    character.velocity = Vector2.ZERO
    character.play_anim(animation)
    # Deferred: we are probably inside a physics callback (the hit that killed us).
    character.hurtbox.set_deferred("monitoring", false)
    if free_after >= 0.0:
        await get_tree().create_timer(free_after).timeout
        character.queue_free()
`;

const HEALTH_BAR = gd`
class_name HealthBar
extends ProgressBar
## Shows a HealthComponent. It only listens; it never asks the component for anything.

@export var health: HealthComponent


func _ready() -> void:
    health.health_changed.connect(_on_health_changed)
    # The component may not have run its own _ready yet, so start from max_health.
    _on_health_changed(health.max_health, health.max_health)


func _on_health_changed(current: int, maximum: int) -> void:
    max_value = maximum
    value = current
`;

export const MODULE: Module = {
  id: 'c05',
  part: 'core',
  order: 5,
  title: 'State machines and components',
  summary: 'Why a growing if-chain breaks, finite state machines from enum + match to reusable State nodes, the Character + controller + intent refactor, and the HealthComponent, Hitbox and Hurtbox components that every fighter in the game is built from.',
  relevance: md`Every fighter in Shardbound (Kai, Lyra, Bram, slimes, skeletons, the golem) is a \`Character\` driven by a \`StateMachine\` and built from the same three components. This module is where that architecture is set up. Afterwards an enemy is a Character with an \`AIController\` instead of a \`PlayerController\` (k02), switching party members is moving one controller node (k05), and attack strings, stagger and tactical mode are new states rather than new branches in a 600-line script.`,
  prereqs: ['c02', 'g03', 'g04'],
  areas: ['godot', 'systems', 'combat'],
  lessons: [
    // =============================================================================== c05-1
    {
      id: 'c05-1',
      title: 'When if-statements stop scaling: finite state machines',
      minutes: 40,
      objectives: [
        'Recognise the symptoms of a boolean-flag player script: combinations nobody designed and bugs that depend on the order of if-blocks.',
        'Count the combinations $n$ flags can express and compare them with the states the design has.',
        'Draw a state diagram with transition conditions before writing code.',
        'Write a finite state machine with an enum, match, a single change-state function and a time-in-state counter.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`At the end of c02 Kai walks and dashes. Add a sword swing and the obvious code is one more \`if\`: a flag \`is_attacking\`, a timer, and a branch that stops movement while it is set. It works when you test it the way you wrote it. Then a playtester presses attack in the middle of a dash, and Kai slides across the room at dash speed with his sword out, then stops dead and swings a second time. Another one mashes the attack button, and the swing never ends.

Nobody wrote "slide attack" or "endless swing". They are combinations of flags that the code allows and the design never considered. Each new action (guard, jump, hurt, cast) multiplies them. This lesson replaces the flags with a **finite state machine**: one variable that holds exactly one state, and a short list of allowed transitions.`,
        },
        {
          kind: 'code',
          file: 'scripts/player.gd',
          code: PLAYER_FLAGS,
          note: md`This is a typical "flags" controller. Read the order of the blocks: the press checks run first and set flags, then one \`if / elif / else\` decides what moves Kai, then a second chain decides the animation. The two chains disagree about priority (movement checks dashing first, animation checks attacking first), which is where the slide attack comes from.`,
        },
        {
          kind: 'viz',
          viz: { type: 'core.fsm', mode: 'flags' },
          task: md`Click the figure. Dash with **K**, and while Kai is still sliding press **J**. Watch the flag panel: both \`is_dashing\` and \`is_attacking\` are true at once, a combination marked in red. Then hold still and mash **J**: the attack timer keeps restarting.`,
          caption: md`The panel on the right is the script's variables, live. The red row counts how long the script has spent in a flag combination the design does not contain.`,
        },
        {
          kind: 'check',
          q: md`In the flags script, the player presses attack 0.05 s into a 0.15 s dash. Which describes what happens next?`,
          options: [
            md`The dash finishes at dash speed while the attack animation plays; then the attack plays again for its full 0.3 s with Kai standing still.`,
            md`The attack is ignored because a dash is in progress.`,
            md`The dash is cancelled and the attack starts immediately.`,
            md`The attack plays for the remaining 0.25 s of the dash only.`,
          ],
          answer: 0,
          explain: md`The press sets \`is_attacking\` and \`_attack_left = 0.3\` no matter what. The movement chain checks \`is_dashing\` first, so the dash keeps its velocity and the attack timer is not decremented. The animation chain checks \`is_attacking\` first, so the sword is out. When the dash ends, the \`elif is_attacking\` branch finally runs the full 0.3 s timer.`,
        },
        {
          kind: 'derive',
          title: 'how many states do flags allow?',
          goal: md`Kai's script grows to four flags: \`is_dashing\`, \`is_attacking\`, \`is_hurt\`, \`is_guarding\`. Count the combinations the variables can hold and the ones the design allows.`,
          steps: [
            {
              md: md`Each boolean is independent, so each one doubles the number of combinations: $2 \cdot 2 \cdot 2 \cdot 2 = 2^4 = 16$.`,
              choose: {
                prompt: md`How many combinations can $n$ independent booleans hold?`,
                options: [md`$2^n$`, md`$2n$`, md`$n^2$`],
                answer: 0,
                explain: md`Each flag has two values and the choices multiply: $2^n$.`,
              },
            },
            {
              md: md`The design allows *at most one* action at a time: none set (idle or walking), or exactly one of the four. That is $1 + 4 = 5$ combinations. The other $16 - 5 = 11$ are states nobody designed, and every one of them is a bug waiting for the right sequence of button presses.`,
            },
            {
              md: md`Add a fifth action, \`is_jumping\`. Flags now allow $2^5 = 32$ combinations against $1 + 5 = 6$ designed ones: 26 undesigned.`,
              choose: {
                prompt: md`How did the number of undesigned combinations change when the fifth flag was added?`,
                options: [md`From 11 to 26: it more than doubled`, md`From 11 to 12: one more`, md`It stayed at 11`],
                answer: 0,
                explain: md`Designed states grow by one per action; flag combinations double. The gap grows exponentially.`,
              },
            },
            {
              md: md`An enum variable holds exactly one of its values. With \`enum State { IDLE, MOVE, DASH, ATTACK, GUARD, HURT, JUMP }\` the impossible combinations cannot even be written down. TypeScript programmers know the same idea as a discriminated union: make illegal states unrepresentable.`,
            },
          ],
          takeaway: md`$n$ flags allow $2^n$ combinations; a design with $n$ mutually exclusive actions has $n + 1$ states. Replace the flags with one enum.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Finite state machine',
          md: md`A **finite state machine** (FSM) has a fixed set of **states**, exactly one of which is **current**, and **transitions** between them, each guarded by a condition ("attack pressed", "0.15 s elapsed"). Each state decides what happens every tick while it is current. Two kinds of one-off code hang off transitions: an **entry action** runs once when a state begins (set the dash velocity, start the animation) and an **exit action** runs once when it ends (switch the i-frames off). A **state diagram** draws states as boxes and transitions as arrows labelled with their conditions.`,
        },
        {
          kind: 'text',
          md: md`### Draw the diagram first

Before writing code, list the states and, for each one, the conditions that leave it. Here is Kai's design:

| From | Condition | To |
|---|---|---|
| Idle | move input not zero | Move |
| Move | move input zero | Idle |
| Idle or Move | attack pressed | Attack |
| Idle or Move | dodge pressed | Dash |
| Dash | 0.15 s elapsed | Idle |
| Attack | 0.3 s elapsed | Idle |

Two design decisions are now visible that the flags script hid in the order of its \`if\` blocks. Dash has no "attack pressed" row, so attacking during a dash is simply not possible; if you later want a dash attack, you add a state and a row, deliberately. Attack has no "attack pressed" row either, so mashing cannot restart it.`,
        },
        {
          kind: 'viz',
          viz: { type: 'core.fsm', mode: 'enum' },
          task: md`Repeat the two experiments: press **J** during a dash, and mash **J** while standing. Then watch the diagram while you walk, dash and attack. Every arrow that lights up is a row in the table above.`,
          caption: md`The current state is filled. When a transition fires, its arrow flashes with the condition that triggered it. The readout shows \`_time_in_state\`, the counter that the Dash and Attack rows test.`,
        },
        {
          kind: 'code',
          file: 'scripts/player.gd',
          code: PLAYER_ENUM,
          note: md`\`match state:\` runs only the branch for the current state, so the order of branches no longer matters. \`State.IDLE, State.MOVE:\` lists two patterns for one branch, because both states accept the same presses. \`_change_state\` is the single place where \`state\` is assigned, which makes it the place for entry actions and for resetting the timer.`,
        },
        {
          kind: 'text',
          md: md`Three habits in this listing are worth keeping in every state machine you write:

- **One function changes state.** If \`state = ...\` appears in ten places, you cannot add an entry action reliably. With \`_change_state\`, setting the dash velocity once at the start of the dash is one line.
- **Count time in the state.** \`_time_in_state\` replaces the separate \`_dash_left\` and \`_attack_left\` timers. A state that needs a duration compares against it; nothing needs to remember to decrement anything.
- **Entry actions versus per-tick code.** Setting the dash velocity is an entry action: do it once, and \`move_and_slide()\` keeps it. Slowing the attack to a stop is per-tick: it runs every frame of the Attack state.`,
        },
        {
          kind: 'check',
          q: md`A teammate moves the dash velocity out of \`_change_state\` and into the \`State.DASH\` branch of \`match\`, so it runs every tick. What changes for the player?`,
          options: [
            md`Hitting a wall during a dash no longer stops Kai: the velocity \`move_and_slide()\` removed is restored every tick, so he grinds along the wall at full dash speed.`,
            md`Nothing; the result is identical.`,
            md`The dash becomes longer.`,
            md`The dash no longer moves Kai.`,
          ],
          answer: 0,
          explain: md`\`move_and_slide()\` removes the part of \`velocity\` pointing into a wall. Set once, the dash loses that part and slides along the wall. Set every tick, it is put back each frame. The two versions also diverge if anything else changes velocity during the dash (knockback, a moving platform). Entry actions run once for a reason.`,
        },
        {
          kind: 'numeric',
          q: md`The dash lasts \`dash_time = 0.15\` s at \`dash_speed = 260\` px/s. How many physics ticks (at 60 Hz) does the Dash state last, and how far does Kai travel in open space? Enter both, ticks first.`,
          answer: { kind: 'vector', value: [9, 39] },
          inputHint: 'ticks, pixels',
          explain: md`$0.15 \times 60 = 9$ ticks. Distance $= 260 \times 0.15 = 39$ px, about two and a half 16 px tiles.`,
        },
        {
          kind: 'steps',
          title: 'Convert your player to an enum state machine',
          steps: [
            md`Open \`scripts/player.gd\` from c02. Add \`"attack"\` and \`"dodge"\` to the Input Map if they are not there yet (**Project → Project Settings → Input Map**): J and Z for attack, K and Shift for dodge, and the face buttons on a gamepad.`,
            md`Make sure Kai's \`SpriteFrames\` has \`attack_down\`, \`attack_up\`, \`attack_side\`, \`dash_down\`, \`dash_up\` and \`dash_side\` (from \`assets/characters/kai.png\`, one animation per row). Untick **Loop** on the attack and dash animations in the SpriteFrames panel.`,
            md`Replace the script with the enum listing above. Keep your own tuned values for \`max_speed\`, \`acceleration\` and \`friction\`.`,
            md`Add a \`Label\` child to Kai, positioned about 24 px above the feet, and in \`_physics_process\` set its text with \`$Label.text = State.keys()[state]\`. \`State.keys()\` returns the names of the enum values as an array, so the label reads IDLE, MOVE, DASH or ATTACK.`,
            md`Run the test room (**F6**) and repeat the two experiments from the figure.`,
          ],
          result: md`The label always shows exactly one state. Pressing attack during a dash does nothing; mashing attack does not extend the swing; after each attack or dash Kai returns to IDLE and then MOVE if a direction is held.`,
          troubleshoot: [
            { problem: md`The attack animation loops forever even though the state returns to IDLE.`, fix: md`The state changed, but \`IDLE\` plays the idle animation only on entry. Check that \`_change_state(State.IDLE)\` really runs (watch the label) and that the \`match\` in \`_change_state\` has an \`IDLE\` branch.` },
            { problem: md`The label shows a number instead of a name.`, fix: md`\`str(state)\` prints the integer value of the enum. Use \`State.keys()[state]\`.` },
            { problem: md`An error says \`Cannot infer the type of "next" variable\`.`, fix: md`A ternary between two enum values does not infer a type. Declare it explicitly: \`var next: State = State.MOVE if ... else State.IDLE\`.` },
          ],
        },
        {
          kind: 'build',
          ch: {
            id: 'c05-1-build',
            title: 'Add a Hurt state and floor spikes',
            goal: md`Add a \`HURT\` state to the enum machine and a spike hazard that triggers it. A dash passes over the spikes unharmed, because only the states that should be vulnerable react to a hit.`,
            requirements: [
              md`Walking onto the spikes knocks Kai away from them at about 160 px/s and plays \`hurt\`; for 0.3 s he ignores input, then returns to IDLE.`,
              md`Dashing across the spikes does not trigger HURT.`,
              md`Touching the spikes again while already in HURT does not restart it.`,
              md`The spikes are an \`Area2D\` whose mask contains only the player layer (2), so enemies walking over them are not reported.`,
            ],
            hints: [
              md`Give the player a public method \`take_hit(from: Vector2)\` that the spikes call. The *state* decides whether the hit counts: return early in DASH and HURT.`,
              md`Set the knockback velocity in \`take_hit\` before changing state, and let HURT only apply friction. Then HURT works for any knockback direction.`,
              md`\`body_entered\` fires once when the body starts overlapping. If Kai stands on the spikes after HURT ends he is not hit again; that is fine for this exercise, and k01 handles it properly with hurtboxes.`,
            ],
            solution: [
              { file: 'scripts/player.gd', code: PLAYER_ENUM_HURT },
              { file: 'scripts/spikes.gd', code: SPIKES },
            ],
            explain: md`The i-frames rule ("a dash ignores hits") is now one comparison in \`take_hit\`, readable next to the HURT rule. In the flags version it would be one more condition hidden in whichever \`if\` happened to run first. The spikes do not know about states at all; they report a contact and the player decides.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'c05-1-paper',
            title: 'A guard state on paper',
            type: 'design',
            difficulty: 2,
            minutes: 10,
            statement: md`Shardbound has a \`guard\` action: hold it to raise Bram's shield, which halves damage and slows walking to 40% speed. Extend the transition table from the lesson with a GUARD state. For every row give From, Condition and To, and say whether each of these is possible: attacking while guarding, dodging out of a guard, guarding during an attack.`,
            solution: [
              md`New rows: Idle or Move, guard held → Guard. Guard, guard released → Idle. Guard, dodge pressed → Dash (a guard you cannot escape feels sticky; most action games allow it). Guard, hit received → stays in Guard (damage halved) or → Hurt if the design wants guard to be breakable.`,
              md`Attacking while guarding: no row, so impossible unless designed as a separate guard-counter state. Dodging out of a guard: allowed by the Guard → Dash row. Guarding during an attack: no row from Attack, so the swing must finish first; a cancel row from Attack's recovery to Guard is a later design choice (k01 calls this a cancel window).`,
              md`Per-tick code in Guard: \`_walk\` at \`max_speed * 0.4\`. Entry action: play \`guard\`. Exit action: none yet; with a hurtbox it would restore the damage multiplier.`,
            ],
            rubric: [md`Every new transition has a From, a condition and a To`, md`States which combinations are impossible and why (no row)`, md`Separates entry actions from per-tick behaviour`],
            areas: ['systems', 'combat'],
          },
        },
        {
          kind: 'recall',
          prompt: md`What are the four parts of a finite state machine, and which one does a flags script leave implicit?`,
          answer: md`States, the current state (exactly one), transitions, and the conditions that guard them (plus entry and exit actions). A flags script leaves the set of states implicit: any combination of flags is a "state", and the transitions are hidden in the order of the \`if\` blocks.`,
        },
        {
          kind: 'explain',
          prompt: md`A colleague says "an enum state machine is just a fancy if-chain". What does the enum version guarantee that the flags version does not?`,
          model: md`The enum variable holds exactly one value, so combinations like dashing-and-attacking cannot exist. \`match\` runs one branch, so the order of branches cannot create priority bugs. Every transition goes through one function, so entry actions and the time-in-state reset happen exactly once per change. And the allowed transitions are explicit: if there is no row for "attack during dash", it cannot happen. The flags version can only offer these by convention, and conventions break when a sixth feature arrives at 2 a.m. before a playtest.`,
        },
      ],
      cards: [
        { id: 'c05-1-c1', kind: 'concept', front: md`Why do boolean flags scale badly for character actions?`, back: md`$n$ flags allow $2^n$ combinations, but $n$ exclusive actions need only $n + 1$ states. The undesigned combinations (slide attack, endless swing) are bugs.` },
        { id: 'c05-1-c2', kind: 'cloze', text: md`In GDScript, \`{{}} state:\` runs only the branch for the current enum value.`, answers: ['match'] },
        { id: 'c05-1-c3', kind: 'concept', front: md`Entry action versus per-tick code: where does "set the dash velocity" belong, and why?`, back: md`Entry action, run once in \`_change_state\`. Per-tick it would undo what \`move_and_slide()\` does at walls and override knockback.` },
        { id: 'c05-1-c4', kind: 'compute', front: md`How many flag combinations do 6 booleans allow, and how many are undesigned if the actions are mutually exclusive?`, answer: { kind: 'vector', value: [64, 57] }, back: md`$2^6 = 64$ combinations, $6 + 1 = 7$ designed, $57$ undesigned.` },
        { id: 'c05-1-c5', kind: 'concept', front: md`Why keep a single \`_change_state\` function?`, back: md`It is the one place state is assigned, so entry actions, the time-in-state reset and debug output happen exactly once per transition.` },
      ],
    },
    // =============================================================================== c05-2
    {
      id: 'c05-2',
      title: 'A reusable state machine and the Character refactor',
      minutes: 45,
      objectives: [
        'Build StateMachine and State nodes with enter, exit, update and physics_update, and transition with state_machine.transition_to("Dash").',
        'Explain why child nodes are ready before their parent and start the machine from the Character.',
        'Split Player into a Character that reads an Intent and a PlayerController that writes it.',
        'Buffer one-shot requests in the controller and consume them in the states.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`The enum machine fixes the logic, but look at where it is heading. Every state's code lives in one file, so HURT, GUARD, JUMP and a three-hit combo push it past 400 lines. Worse, a skeleton needs IDLE, MOVE, ATTACK and HURT too. Copying the script and replacing \`Input\` with AI decisions means fixing every bug twice. And in k05 the player switches between Kai, Lyra and Bram mid-fight: the character you were controlling must keep fighting on its own.

Two changes solve all three problems:

1. **States become nodes.** Each state is a small script on a child of a \`StateMachine\` node, with the same four methods. Adding a state is adding a node.
2. **Input moves out of the character.** A \`Character\` never calls \`Input\`. It reads an **intent** (move this way, attack, dodge), and a **controller** child writes it: \`PlayerController\` from the gamepad, \`AIController\` from AI (k02). Swapping who controls a character is swapping one child node.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'The scene tree after the refactor',
          md: md`\`\`\`text
Kai (Character, CharacterBody2D)       scripts/character.gd
├─ AnimatedSprite2D
├─ CollisionShape2D                    feet, 10×6 px
├─ PlayerController (Node)             scripts/player_controller.gd
└─ StateMachine (Node)                 scripts/state_machine/state_machine.gd
   ├─ Idle (Node)                      scripts/states/idle.gd
   ├─ Move (Node)                      scripts/states/move.gd
   ├─ Dash (Node)                      scripts/states/dash.gd
   └─ Attack (Node)                    scripts/states/attack.gd
\`\`\`
The node *names* are the state names: \`transition_to("Dash")\` finds the child called \`Dash\`. Plain \`Node\`s cost almost nothing; they exist to hold a script and appear in the Scene dock, where you can see a character's states at a glance.`,
        },
        { kind: 'code', file: 'scripts/state_machine/state.gd', code: STATE, note: md`\`class_name State\` makes \`State\` a type other scripts can use. The base methods do nothing, so a state overrides only what it needs. Parameters that a method ignores start with an underscore (\`_delta\`), which silences the "unused parameter" warning.` },
        { kind: 'code', file: 'scripts/state_machine/state_machine.gd', code: STATE_MACHINE, note: md`\`child as State\` returns \`null\` for children that are not States (a debug Label, for example), so they are skipped. \`Dictionary[StringName, State]\` is a typed dictionary (Godot 4.4). \`state_changed\` is what makes the machine observable: a debug label, the AI and the HUD can react to transitions without the states knowing they exist.` },
        {
          kind: 'callout',
          tone: 'design',
          title: 'Two ways to request a transition',
          md: md`A state can call \`state_machine.transition_to("Dash")\` directly, as in this course. The alternative is a signal on \`State\` (\`signal transitioned(next: StringName)\`) that the machine connects to, so states never hold a reference to the machine. The signal version is looser, but a direct call is easier to follow: Ctrl+click on \`transition_to\` takes you to the code that runs. Pick one and use it everywhere; mixing both makes transitions hard to trace.`,
        },
        {
          kind: 'check',
          q: md`This \`physics_update\` sometimes moves Kai one extra frame after a dash ends. Why?

\`\`\`gdscript
func physics_update(delta: float) -> void:
    _time += delta
    if _time >= duration:
        state_machine.transition_to("Idle")
    character.move_and_slide()
\`\`\``,
          options: [
            md`\`transition_to\` runs Idle's \`enter()\` and returns here; the rest of the function still runs, so the dash moves once more after the machine has switched.`,
            md`\`transition_to\` is deferred to the next frame.`,
            md`Idle's \`physics_update\` runs in the same tick and moves Kai too.`,
            md`\`_time\` is never reset.`,
          ],
          answer: 0,
          explain: md`A transition is an ordinary function call. When it returns, the old state's function continues. Write \`return\` right after every \`transition_to\` (as the lesson's states do), so nothing runs in a state that is no longer current.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'Ready order: children first',
          md: md`Godot calls \`_ready()\` on children before their parent. When \`StateMachine._ready()\` runs, the Character's \`@onready\` variables (such as \`sprite\`) are still \`null\`, so entering the first state there would crash on \`character.play_anim(...)\`. The Character's \`_ready()\` runs last, when everything below it is ready, so it calls \`state_machine.start(self)\`. That one explicit call also hands every state its \`character\`, so states need no \`get_parent().get_parent()\` lookups.`,
        },
        {
          kind: 'text',
          md: md`### The intent

The intent is a small object with the character's wishes for this tick:

| Field | Kind | Written by |
|---|---|---|
| \`move: Vector2\` | held, length 0 to 1 | every tick |
| \`wants_attack\`, \`wants_dodge\`, \`wants_jump\` | one-shot request | set true on a press, set false by the state that acts on it |
| \`wants_guard\` | held | every tick |

Why a separate object rather than \`Input\` calls inside the states? Because then a state cannot tell, and does not care, who is asking. The Move state that walks Kai toward the stick walks a skeleton toward Kai. A recorded list of intents replays a bug report exactly. A cutscene can walk Kai to a door by writing \`intent.move\`. This is the same idea as separating a React component's props from where they come from.`,
        },
        { kind: 'code', file: 'scripts/intent.gd', code: INTENT, note: md`A \`RefCounted\` is a plain object that is freed when nothing references it; it is not a node and does not appear in the scene tree.` },
        { kind: 'code', file: 'scripts/player_controller.gd', code: PLAYER_CONTROLLER, note: md`\`INF\` is GDScript's infinity, so an action that was never pressed is infinitely old. \`@onready var character: Character = get_parent()\` reads the parent once the controller is in the tree.` },
        {
          kind: 'derive',
          title: 'when is a buffered press honoured?',
          goal: md`The player presses attack at tick $p$ while Kai is dashing. The dash ends and the Idle state, which reads \`wants_attack\`, first runs at tick $c$. With a buffer of $B$ ticks, find the condition for the press to start an attack.`,
          steps: [
            {
              md: md`\`buffer_time = 0.15\` s at 60 ticks per second is $B = 0.15 \times 60 = 9$ ticks.`,
            },
            {
              md: md`On tick $p$ the controller sets \`wants_attack = true\` and the age to 0. Each later tick adds $1/60$ s. On tick $c$ the age is $(c - p)/60$ s, and the request is still true if no state consumed it and the age is at most \`buffer_time\`.`,
              choose: {
                prompt: md`So the press starts an attack on tick $c$ exactly when...`,
                options: [md`$c - p \le B$`, md`$c - p < 1$`, md`$p \le B$`],
                answer: 0,
                explain: md`The age in ticks is $c - p$; the buffer keeps the request alive for up to $B$ ticks.`,
              },
            },
            {
              md: md`The dash lasts 9 ticks. A press on any tick of the dash satisfies $c - p \le 9$, so every press during a dash becomes an attack the moment the dash ends. Without the buffer ($B = 0$) only a press on exactly tick $c$ would count, and the game would feel like it drops inputs.`,
            },
          ],
          takeaway: md`A buffer of $B$ ticks forgives presses up to $B/60$ s early. Make it at least as long as the shortest action you want players to chain out of.`,
        },
        { kind: 'code', file: 'scripts/character.gd', code: CHARACTER_V1, note: md`\`Character\` replaces \`Player\`. It holds what every state needs (movement tuning, facing, animation helpers), and nothing about *which* state is active. \`move_with_intent\` is c02's acceleration and friction, now reading \`intent.move\` instead of \`Input\`.` },
        { kind: 'code', file: 'scripts/states/idle.gd', code: IDLE },
        { kind: 'code', file: 'scripts/states/move.gd', code: MOVE, note: md`Idle and Move check the same requests in the same order: attack beats dodge beats walking. That priority is a design decision, written once per state where you can see it.` },
        {
          kind: 'viz',
          viz: { type: 'core.fsm', mode: 'nodes' },
          task: md`Play for a minute with the intent panel in view. Press **K** and then **J** quickly: \`wants_attack\` stays lit (buffered) until the dash ends and Attack consumes it. Watch the code panel too: it always shows the script of the state that is running.`,
          caption: md`Left: the game, driven by a TypeScript copy of the listings. Right: the intent the controller wrote this tick. Below: the state machine and the current state's script. A slime wanders in the room; touch it to see that Hurt is reachable from Idle, Move and Attack but not from Dash.`,
        },
        {
          kind: 'steps',
          title: 'Refactor Player into Character',
          steps: [
            md`Create the folders \`scripts/state_machine/\` and \`scripts/states/\`. Save \`state.gd\`, \`state_machine.gd\`, \`intent.gd\`, \`player_controller.gd\` and \`character.gd\` from the listings. After saving \`state.gd\` and \`state_machine.gd\`, the **Create New Node** dialog lists \`State\` and \`StateMachine\` as node types.`,
            md`Open \`scenes/player.tscn\`. Select the root and in the Inspector drag \`scripts/character.gd\` onto its *Script* property, replacing \`player.gd\`. Rename the root \`Kai\`.`,
            md`Add a child \`PlayerController\` (search the class name in **Add Child Node**). Then add a \`StateMachine\` *below* it, with four \`State\` children named exactly \`Idle\`, \`Move\`, \`Dash\` and \`Attack\`. Attach \`scripts/states/idle.gd\` and the others to them (drag each file onto its node).`,
            md`Select \`StateMachine\` and set *Initial State* to \`Idle\` in the Inspector.`,
            md`Add a \`Label\` child to Kai with the \`state_label.gd\` script from the build below, set its *State Machine* export, and run the test room.`,
          ],
          result: md`Kai moves, dashes and attacks exactly as with the enum version, and the label shows Idle, Move, Dash or Attack. \`player.gd\` is no longer used by the scene.`,
          troubleshoot: [
            { problem: md`\`Invalid access to property or key 'intent' on a base object of type 'Nil'\`.`, fix: md`A state ran before \`start()\` gave it its \`character\`. Check that \`Character._ready()\` calls \`state_machine.start(self)\` and that no state does work in its own \`_ready()\`.` },
            { problem: md`\`StateMachine has no state named 'dash'\` in the Output panel.`, fix: md`Node names are case-sensitive and must match the strings in \`transition_to\`. Rename the node to \`Dash\`.` },
            { problem: md`Presses are sometimes acted on one tick late, or a dash fires twice.`, fix: md`The controller is below the StateMachine, so states read last tick's intent. Drag \`PlayerController\` above \`StateMachine\` in the Scene dock.` },
          ],
        },
        {
          kind: 'check',
          q: md`Why must \`PlayerController\` sit above \`StateMachine\` among Kai's children?`,
          options: [
            md`Siblings get \`_physics_process\` in tree order, so the controller writes this tick's intent before the states read it.`,
            md`Godot requires controllers to be the first child of a CharacterBody2D.`,
            md`Nodes lower in the tree are ready first, so the controller would be \`null\`.`,
            md`It only matters for drawing order.`,
          ],
          answer: 0,
          explain: md`Within one tick, \`_physics_process\` is called down the tree in order. If the states run first they act on the previous tick's intent: one tick of lag, and requests that the controller then overwrites. \`process_physics_priority\` can enforce an order too, but tree order is visible in the Scene dock.`,
        },
        {
          kind: 'numeric',
          q: md`With \`buffer_time = 0.15\`, the player presses attack 4 ticks into a 9-tick dash. The dash ends and Idle reads the intent on the tick after the dash's 9th tick. How old, in ticks, is the press when Idle reads it?`,
          answer: { kind: 'number', value: 6 },
          explain: md`The press happens on dash tick 4; Idle reads on tick 10 of the same count. The age is $10 - 4 = 6$ ticks, within the 9-tick buffer, so the attack starts.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'c05-2-build',
            title: 'Dash and Attack as states, and a state label',
            goal: md`Write \`dash.gd\` and \`attack.gd\` as States and a debug label that listens to \`state_changed\`. Kai should behave exactly as he did with the enum machine.`,
            requirements: [
              md`Dash moves Kai at 260 px/s for 0.15 s in the direction held (or faced, when no direction is held), then returns to Idle.`,
              md`Attack aims at the direction held when pressed, slows Kai to a stop, lasts 0.3 s and returns to Idle.`,
              md`A dodge press during an attack, or an attack press during a dash, is buffered and happens right after, if pressed within 0.15 s of the end.`,
              md`The label updates only when the state changes (it has no \`_process\`).`,
            ],
            hints: [
              md`Consume the request in \`enter()\` (\`character.intent.wants_dodge = false\`), otherwise Idle sees it again on the next tick and starts a second dash.`,
              md`\`character.face(character.intent.move)\` does nothing for a zero vector, so a dash with no direction held goes the way Kai faces.`,
              md`Connect the label in \`_ready()\` to \`state_machine.state_changed\`; the signal carries the new state's name.`,
            ],
            solution: [
              { file: 'scripts/states/dash.gd', code: DASH },
              { file: 'scripts/states/attack.gd', code: ATTACK_V1 },
              { file: 'scripts/debug/state_label.gd', code: STATE_LABEL },
            ],
            explain: md`Each state is now a file you can read in one screen. None of them mention \`Input\`, so in k02 the same four files drive a skeleton. The label is the first *observer* of the machine; the AI uses the same signal in k02 to know when an attack has finished.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'c05-2-paper',
            title: 'A replay controller',
            type: 'code-on-paper',
            difficulty: 2,
            minutes: 12,
            statement: md`Write \`ReplayController\` on paper: a controller node that plays back a recording of intents, one entry per physics tick, where each entry is \`[move: Vector2, wants_attack: bool, wants_dodge: bool]\`. When the recording runs out it should leave the character idle. Then explain why the replay reproduces the original run exactly only if the recording starts on the same tick as the run and physics runs at a fixed rate.`,
            solution: [
              md`The controller mirrors \`PlayerController\`: one entry per \`_physics_process\`, written into \`character.intent\`. One-shot requests are OR-ed in so a request the state has not consumed yet is not erased:

\`\`\`gdscript
func _physics_process(_delta: float) -> void:
    if _tick >= recording.size():
        character.intent.clear()
        return
    var entry: Array = recording[_tick]
    character.intent.move = entry[0]
    character.intent.wants_attack = entry[1] or character.intent.wants_attack
    character.intent.wants_dodge = entry[2] or character.intent.wants_dodge
    _tick += 1
\`\`\``,
              md`Determinism: the states read only the intent and fixed-step physics, so the same intents on the same ticks give the same positions. A recording shifted by one tick, a variable \`delta\`, or randomness (pitch variation is fine, random damage is not) breaks it.`,
              md`The full script is the \`scripts/replay_controller.gd\` listing below the problem set; it needs no change to Character or any state, which is the point of the intent.`,
            ],
            rubric: [md`Writes intent once per physics tick from the recording`, md`Handles the end of the recording`, md`Explains why determinism needs fixed ticks and the same starting tick`],
            areas: ['systems', 'godot'],
          },
        },
        { kind: 'code', file: 'scripts/replay_controller.gd', code: REPLAY_CONTROLLER, note: md`Swap it in for \`PlayerController\` (or put both on Kai and disable one with *Process → Mode: Disabled*). Recording is the reverse: append \`[intent.move, intent.wants_attack, intent.wants_dodge]\` every tick in a controller of your own.` },
        {
          kind: 'recall',
          prompt: md`Name the four methods of \`State\`, when each is called, and what kind of code belongs in each.`,
          answer: md`\`enter()\` once when the state becomes current (start animation, set velocity, consume a request); \`exit()\` once when it stops being current (undo what enter did); \`update(delta)\` every rendered frame (visual-only work); \`physics_update(delta)\` every physics tick (movement and transition decisions).`,
        },
        {
          kind: 'explain',
          prompt: md`Explain to a teammate why Character reads an intent instead of calling Input, using two concrete Shardbound features.`,
          model: md`Because the same body must be driven by different sources. In k02 a skeleton is a Character with an AIController; its Move and Attack states are the same files Kai uses, so movement tuning and bug fixes apply to both. In k05 the player switches from Kai to Lyra mid-fight: the PartyManager moves the PlayerController to Lyra and gives Kai an AIController, and neither character's states change. Replays, cutscenes and automated tests also become a matter of writing intents.`,
        },
      ],
      cards: [
        { id: 'c05-2-c1', kind: 'concept', front: md`Why does \`Character._ready()\` start the state machine instead of \`StateMachine._ready()\`?`, back: md`Children are ready before parents. In the machine's \`_ready()\` the Character's \`@onready\` variables are still null; in the Character's \`_ready()\` everything is ready.` },
        { id: 'c05-2-c2', kind: 'cloze', text: md`A state requests a switch with \`state_machine.{{}}("Dash")\` and then should \`{{}}\` immediately.`, answers: ['transition_to', 'return'] },
        { id: 'c05-2-c3', kind: 'concept', front: md`Who writes the intent, who reads it, and who clears a one-shot request?`, back: md`A controller (PlayerController, AIController) writes it; the Character's states read it; the state that acts on a request sets it back to false.` },
        { id: 'c05-2-c4', kind: 'compute', front: md`An input buffer of 0.2 s at 60 Hz is how many ticks?`, answer: { kind: 'number', value: 12 }, back: md`$0.2 \times 60 = 12$ ticks.` },
        { id: 'c05-2-c5', kind: 'concept', front: md`Why must the controller node sit above the StateMachine in the scene tree?`, back: md`Siblings run \`_physics_process\` in tree order; the controller must write this tick's intent before the states read it.` },
      ],
    },
    // =============================================================================== c05-3
    {
      id: 'c05-3',
      title: 'Components: health, hitboxes and hurtboxes',
      minutes: 45,
      objectives: [
        'Explain composition over inheritance with a concrete example from Shardbound.',
        'Build HealthComponent, Hitbox, Hurtbox and HitData and connect them with signals.',
        'Set physics layers and masks so each side hits only the other, and compute the mask values.',
        'Route a hit from a sword to a health bar and into the Hurt and Dead states.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Many things in Shardbound take damage: Kai and the party, slimes, skeletons, the golem, breakable crates, a cracked wall that hides a chest. Some of them deal damage: swords, a slime's body, spikes, a fireball. An inheritance tree for this goes wrong fast. If \`Enemy extends Character\` has health, a crate (not a Character) needs its own copy. A spiked crate that deals contact damage needs a third class. A mimic chest that is both a container and an enemy has two parents.

The alternative is to build behaviour from small nodes, **components**, that each do one job and know nothing about what they are attached to:

- \`HealthComponent\` (a \`Node\`): hit points; signals \`health_changed(current, maximum)\` and \`died\`.
- \`Hitbox\` (an \`Area2D\`): the dangerous part of an attack; carries a \`HitData\`.
- \`Hurtbox\` (an \`Area2D\`): the vulnerable part of a body; emits \`hurt(hit: HitData)\`.

A crate is a \`StaticBody2D\` with a Hurtbox and a HealthComponent. A slime is a Character with all three. A spike trap is just a Hitbox.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Composition over inheritance',
          md: md`**Inheritance** shares behaviour by making a class a kind of another class (\`Skeleton is an Enemy is a Character\`). **Composition** shares behaviour by giving an object parts (\`Skeleton has a Hurtbox and a HealthComponent\`). In Godot the parts are child nodes, often saved as their own small scenes in \`scenes/components/\`. Use inheritance for a true "is a" relationship with one axis of variation (every fighter *is a* \`Character\`); use components for capabilities that mix freely (can be hurt, can hurt, has health, can be picked up).`,
        },
        {
          kind: 'viz',
          viz: { type: 'core.component_lab' },
          task: md`Swing at all three objects with **J**. Then select the crate and give it a **Hitbox**: walk into it. Select the slime and remove its **Hurtbox**, then its **HealthComponent** instead. Each change is one node added or removed; no script changes.`,
          caption: md`The panel lists the selected object's child nodes. The event log shows the signals as they fire. Without a HealthComponent the hurt signal still fires but nothing listens, which the log shows as a hit with no effect.`,
        },
        { kind: 'code', file: 'scripts/resources/hit_data.gd', code: HIT_DATA, note: md`This is g04's \`HitData\`, unchanged. It is a \`RefCounted\`, not a \`Resource\`: it is created at runtime for one swing and never saved to disk. The fields are what every later system needs: \`amount\` for damage (r01), \`knockback\` for k01, \`stagger\` for the stagger gauge (k04), \`source\` for hitstop and ATB gain.` },
        { kind: 'code', file: 'scripts/components/health_component.gd', code: HEALTH, note: md`\`maxi\` and \`mini\` are the integer versions of \`max\` and \`min\`. The early return on \`health <= 0\` matters: two hitboxes can touch a dying slime in the same physics tick, and \`died\` must fire once.` },
        { kind: 'code', file: 'scripts/components/hitbox.gd', code: HITBOX },
        { kind: 'code', file: 'scripts/components/hurtbox.gd', code: HURTBOX, note: md`The Hurtbox does the detecting, so it is the one with \`monitoring\` on and a mask; the Hitbox only needs to be \`monitorable\` on a layer. One detector per pair keeps every hit reported exactly once.` },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'When does an Area2D see another?',
          md: md`Area A reports area B (\`area_entered\`) when all of these hold: A's \`monitoring\` is on, B's \`monitorable\` is on, B's **layer** has a bit that is in A's **mask**, and both have an enabled shape that overlaps. Layers say "what I am"; masks say "what I look for". Layer $k$ is bit $k - 1$, so its value is $2^{k-1}$: \`player_hitbox\` (layer 5) is $2^4 = 16$, \`enemy_hitbox\` (layer 6) is $2^5 = 32$. In the Inspector you tick the numbered boxes under *Collision → Layer* and *Mask*; in code you write the sum of the values.`,
        },
        {
          kind: 'numeric',
          q: md`Bram's shield bash should hit enemies and also breakable objects, which in this project have their Hurtbox on layer 7 (\`interactable\`). An enemy Hurtbox must detect Kai's sword. What integer is the mask of a crate's Hurtbox if it should be hit by both \`player_hitbox\` (5) and \`enemy_hitbox\` (6) attacks?`,
          answer: { kind: 'number', value: 48 },
          explain: md`Layer 5 is $2^4 = 16$, layer 6 is $2^5 = 32$. A mask with both is $16 + 32 = 48$. The crate's own layer (7, value 64) is what *it is*, and does not affect what it detects.`,
        },
        {
          kind: 'viz',
          viz: { type: 'core.component' },
          task: md`Step through one sword hit with the player controls. Then turn on **Hurtbox invincible** and step again: where does the chain stop? Do the same with **Mask missing layer 5**. Finally set HP to 3 and step to the end to see \`died\`.`,
          caption: md`Each step highlights the node that acts, the signal that fires, and the line of code that runs. The HitData card shows the values carried along the chain.`,
        },
        {
          kind: 'check',
          q: md`Kai dashes through a skeleton's sword while the hitbox is active, so the Hurtbox is invincible at the moment the two areas start overlapping. The dash ends while the sword is still overlapping Kai. What happens?`,
          options: [
            md`Nothing: \`area_entered\` fired once, at the start of the overlap, and was ignored. It fires again only if the areas separate and touch again.`,
            md`Kai is hit as soon as invincibility ends.`,
            md`Kai is hit every frame after invincibility ends.`,
            md`The game errors because the signal was ignored.`,
          ],
          answer: 0,
          explain: md`\`area_entered\` reports the start of an overlap, not its continuation. That is what makes "one hit per swing" work without extra bookkeeping, and why dodging through an attack fully avoids it. If you need damage while standing inside something (lava), check \`get_overlapping_areas()\` on a timer instead.`,
        },
        { kind: 'code', file: 'scripts/character.gd', code: CHARACTER_V2, note: md`The Character is the one place that knows its own components and connects them: hurt → damage and knockback and the Hurt state; died → the Dead state. The components never reference the Character, so the same \`hurtbox.tscn\` works on a crate.` },
        {
          kind: 'steps',
          title: 'Make the components and wire Kai',
          steps: [
            md`Open **Project → Project Settings → Layer Names → 2D Physics** and check the names: 1 \`world\`, 2 \`player\`, 3 \`party\`, 4 \`enemy\`, 5 \`player_hitbox\`, 6 \`enemy_hitbox\`, 7 \`interactable\`, 8 \`pickup\`.`,
            md`Create \`scenes/components/hurtbox.tscn\`: root \`Area2D\` named \`Hurtbox\` with \`hurtbox.gd\`, child \`CollisionShape2D\` (no shape yet). On the root untick every *Collision → Layer* box; leave *Monitoring* on. Save. Create \`hitbox.tscn\` the same way with \`hitbox.gd\`, *Monitoring* off, *Monitorable* on, every *Mask* box unticked, and the shape's *Disabled* ticked.`,
            md`Create \`health_component.tscn\`: a single \`Node\` named \`HealthComponent\` with \`health_component.gd\`.`,
            md`In \`player.tscn\`, instance \`hurtbox.tscn\` and \`health_component.tscn\` as children of Kai (the chain-link button in the Scene dock). Select the hurtbox's shape, tick **Editable Children** on the instance (right-click menu) and give it a RectangleShape2D about 12×18 px over Kai's body. Set the Hurtbox's *Mask* to layer 6 only.`,
            md`Add a \`Node2D\` named \`HitboxPivot\` under Kai and instance \`hitbox.tscn\` under it. Move the Hitbox 12 px to the right (+x); give its shape a 14×12 px rectangle. Set its *Layer* to 5 only. Rotating the pivot to \`facing_vector.angle()\` swings the box to any side.`,
            md`Replace \`character.gd\` with the version above, and \`dash.gd\` with the i-frame version from the build below.`,
          ],
          result: md`The game runs as before. With **Debug → Visible Collision Shapes** on, the hurtbox shows over Kai's body and the hitbox shape is greyed out (disabled) beside him.`,
          troubleshoot: [
            { problem: md`\`Invalid get index 'hurt' (on base: 'null instance')\` at startup.`, fix: md`The node is not called \`Hurtbox\` (instances keep the scene root's name, but renaming breaks \`$Hurtbox\`). Rename it, or change the \`@onready\` path.` },
            { problem: md`An error mentions "Can't change this state while flushing queries".`, fix: md`A shape or \`monitoring\` changed inside a physics callback. Use \`set_deferred("disabled", ...)\`, as \`Hitbox.set_active\` and the Dead state do.` },
          ],
        },
        { kind: 'code', file: 'ui/health_bar.gd', code: HEALTH_BAR, note: md`Put a \`ProgressBar\` named \`HealthBar\` in a \`CanvasLayer\` (or above an enemy's head), attach this script and drag the HealthComponent into its *Health* export. The bar and the component never call each other's methods except through the signal.` },
        {
          kind: 'build',
          ch: {
            id: 'c05-3-build',
            title: 'A training dummy and a sword that hits it',
            goal: md`Give Kai's Attack a hitbox, add Hurt and Dead states, and build a training dummy: a skeleton \`Character\` with no controller at all, a Hurtbox, a HealthComponent of 12 and a health bar. A Character without a controller has an empty intent, so it stands in Idle forever.`,
            requirements: [
              md`Kai's swing damages the dummy once per swing, only when the sword faces it, and only between 0.08 s and 0.16 s into the swing.`,
              md`The dummy is knocked back about 8 px per hit and plays \`hurt\`; its bar drops by one point per hit.`,
              md`At 0 HP the dummy plays \`die\`, stops taking hits and is freed 0.6 s later; \`died\` fires once.`,
              md`Dashing through the dummy's own hitbox (give it a Hitbox that is always active on layer 6) does not hurt Kai; walking into it does.`,
            ],
            hints: [
              md`The dummy's scene: \`Character\` root on layer 4 (\`enemy\`) with \`AnimatedSprite2D\` (skeleton frames), feet \`CollisionShape2D\`, \`StateMachine\` with Idle, Hurt and Dead, \`HealthComponent\` (max 12), and a \`Hurtbox\` whose mask is layer 5. The Character script expects these names.`,
              md`Set the dummy's Dead state *Animation* export to \`die\` and *Free After* to 0.6. Kai's stays \`ko\` and \`-1\`.`,
              md`The skeleton sheet has no \`idle_down\`, so \`play_anim("idle")\` falls back to \`idle\`. That is why \`play_anim\` checks \`has_animation\`.`,
              md`For the i-frames, Dash's \`enter()\` sets \`hurtbox.invincible = true\` and \`exit()\` sets it back. \`exit()\` runs however the dash ends.`,
            ],
            solution: [
              { file: 'scripts/states/attack.gd', code: ATTACK_V2 },
              { file: 'scripts/states/dash.gd', code: DASH_IFRAMES },
              { file: 'scripts/states/hurt.gd', code: HURT },
              { file: 'scripts/states/dead.gd', code: DEAD },
            ],
            explain: md`The same four state scripts and the same three components build both Kai and the dummy; only the scene composition and a few Inspector values differ. Knockback distance follows c02's stopping formula: with \`knockback_speed\` 120 px/s and \`knockback_friction\` 900 px/s², the slide is $120^2 / (2 \cdot 900) = 8$ px. \`exit()\` on Attack switches the hitbox off when a hit interrupts the swing, the classic source of "my sword stayed live after I got hit" bugs.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'c05-3-paper',
            title: 'The hurtbox that never fires',
            type: 'debug',
            difficulty: 2,
            minutes: 8,
            statement: md`A slime's Hurtbox never reports Kai's sword. The sword's Hitbox has Layer 5 only and its shape turns on during the swing (visible collision shapes confirm the overlap). The slime's Hurtbox sets its collision in code:

\`\`\`gdscript
func _ready() -> void:
    area_entered.connect(_on_area_entered)
    collision_layer = 0
    collision_mask = 5  # player_hitbox
\`\`\`

Find the bug and fix it. Then name one other setting that produces the same symptom.`,
            hints: [md`What layers does the integer 5 select?`],
            solution: [
              md`\`collision_mask\` is a bit field, not a layer number. 5 is binary 101: layers 1 (\`world\`) and 3 (\`party\`). Layer 5 is bit 4, value $2^4 = 16$.`,
              md`Fix: \`collision_mask = 16\`, or \`set_collision_mask_value(5, true)\`, which takes the layer number and is harder to get wrong.`,
              md`Same symptom: the Hitbox has *Monitorable* off; the Hurtbox has *Monitoring* off; the sword shape is switched on with a direct assignment during a physics callback (error in the Output panel); the Hurtbox's own shape is disabled.`,
            ],
            rubric: [md`Identifies that the mask is a bit field and computes 16`, md`Gives a correct fix`, md`Names another cause with the same symptom`],
            areas: ['godot', 'combat'],
          },
        },
        {
          kind: 'recall',
          prompt: md`Trace one sword hit from the swing to the HP bar, naming each node and each signal.`,
          answer: md`Attack state calls \`hitbox.prepare()\` and turns the Hitbox shape on → the target's Hurtbox gets \`area_entered(hitbox)\` → Hurtbox emits \`hurt(hit)\` → Character \`_on_hurt\` calls \`health.damage(hit.amount)\`, sets knockback and transitions to Hurt → HealthComponent emits \`health_changed(current, maximum)\` → the HealthBar updates; at 0 it emits \`died\` → Character transitions to Dead.`,
        },
        {
          kind: 'explain',
          prompt: md`Why does the Hurtbox emit a signal instead of calling \`get_parent().health.damage()\` directly?`,
          model: md`Because the Hurtbox does not know what it is attached to. On Kai the hurt should also trigger knockback and the Hurt state; on a crate it should only reduce health; on a boss it might feed a stagger gauge first; on a guarding Bram it should halve the damage. A signal lets each owner decide. It also means the Hurtbox works without a HealthComponent at all (a switch that reacts to being hit), and tests can connect to \`hurt\` without building a whole character.`,
        },
      ],
      cards: [
        { id: 'c05-3-c1', kind: 'concept', front: md`What does each of HealthComponent, Hitbox and Hurtbox do, and which signals do they have?`, back: md`HealthComponent: hit points; \`health_changed(current, maximum)\`, \`died\`. Hitbox: Area2D that carries a HitData. Hurtbox: Area2D that emits \`hurt(hit: HitData)\` when a Hitbox enters.` },
        { id: 'c05-3-c2', kind: 'compute', front: md`Collision layer 6 as a bit value?`, answer: { kind: 'number', value: 32 }, back: md`$2^{6-1} = 32$.` },
        { id: 'c05-3-c3', kind: 'cloze', text: md`Area A detects area B when A is {{}}, B is {{}}, and B's layer is in A's mask.`, answers: ['monitoring', 'monitorable'] },
        { id: 'c05-3-c4', kind: 'concept', front: md`Why switch hitbox shapes with \`set_deferred("disabled", ...)\`?`, back: md`Shapes cannot change while the physics server is flushing queries (inside \`area_entered\` and similar callbacks); deferring applies the change at the end of the frame.` },
        { id: 'c05-3-c5', kind: 'concept', front: md`Composition or inheritance: "a crate can be broken by sword hits"?`, back: md`Composition: give the crate a Hurtbox and a HealthComponent. A crate is not a kind of Character; it has the capability "can be hurt".` },
      ],
    },
  ],
  problems: [
    {
      id: 'c05-p1',
      title: 'Counting flag states',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`A boss script uses five flags: \`is_charging\`, \`is_slamming\`, \`is_stunned\`, \`is_summoning\`, \`is_enraged\`. The design says \`is_enraged\` can combine with any one of the other four actions or with none, and the other four are mutually exclusive. How many flag combinations exist, and how many does the design allow? Enter both.`,
      solution: [md`All combinations: $2^5 = 32$.`, md`Allowed: the four actions are exclusive, giving $1 + 4 = 5$ options, each with or without enrage: $5 \times 2 = 10$.`, md`As an FSM this is a five-value enum plus one independent boolean (or two machines), not five flags.`],
      answer: { kind: 'vector', value: [32, 10] },
      areas: ['systems'],
    },
    {
      id: 'c05-p2',
      title: 'Mask arithmetic',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`A fireball's Hitbox should be detected by enemy Hurtboxes and by breakable objects. Enemy Hurtboxes mask layer 5; breakable objects' Hurtboxes mask layers 5 and 6. The fireball also needs a \`RayCast2D\` that stops at walls (layer 1) and enemies' bodies (layer 4). What integer is the ray's \`collision_mask\`?`,
      solution: [md`Layer 1 is $2^0 = 1$; layer 4 is $2^3 = 8$.`, md`Mask $= 1 + 8 = 9$. (The fireball Hitbox itself sits on layer 5 so both kinds of Hurtbox see it.)`],
      answer: { kind: 'number', value: 9 },
      areas: ['godot'],
    },
    {
      id: 'c05-p3',
      title: 'Ready order',
      type: 'debug',
      difficulty: 2,
      minutes: 6,
      statement: md`A teammate moves the start of the state machine into the machine itself:

\`\`\`gdscript
# state_machine.gd
func _ready() -> void:
    for child in get_children():
        if child is State:
            child.character = get_parent()
            child.state_machine = self
            _states[child.name] = child
    current = initial_state
    current.enter()
\`\`\`

The game crashes at startup in Idle's \`enter()\` with "Invalid access to property or key 'sprite_frames' on a base object of type 'Nil'". Explain and fix.`,
      solution: [md`\`_ready()\` runs on children before parents. When the machine's \`_ready()\` runs, the Character's \`_ready()\` has not, so its \`@onready var sprite\` is still null. Idle's \`enter()\` calls \`play_anim\`, which reads \`sprite.sprite_frames\`.`, md`Fix: keep the loop but move \`current.enter()\` (or the whole thing) into a \`start()\` that the Character calls from its own \`_ready()\`. An alternative is \`await owner.ready\` at the top of the machine's \`_ready()\`, which waits for the scene root, but it hides the order and fails if the machine is ever added to a node that is already ready.`],
      rubric: [md`Explains children-first ready order`, md`Identifies the null @onready variable`, md`Gives a working fix and notes the trade-off of await`],
      areas: ['godot'],
    },
    {
      id: 'c05-p4',
      title: 'A slime on paper',
      type: 'design',
      difficulty: 2,
      minutes: 10,
      statement: md`Slimes move by hopping: they sit for 0.6 s, then hop 24 px toward the player over 0.3 s (the \`hop\` animation), and repeat. When hit they play \`hurt\` and cannot hop for 0.4 s; at 0 HP they play \`die\` and are freed. Draw the state diagram with conditions, and say which states can be shared with Kai's and which are slime-only.`,
      solution: [md`States: Rest (timer 0.6 s → Hop), Hop (entry: velocity = direction × 24/0.3 = 80 px/s; after 0.3 s → Rest), Hurt (0.4 s → Rest), Dead (entry: play \`die\`, free after the animation).`, md`Hurt and Dead are Kai's own scripts with different exports (animation \`hurt\`, duration 0.4; animation \`die\`, free_after). Rest and Hop are slime-only. The slime's AIController sets \`intent.move\` toward the player; Rest reads it at the moment it ends to aim the hop.`, md`Transitions to Hurt come from Character._on_hurt (any state); there is no Hurt → Hop edge, so a hit always restarts the rest timer.`],
      rubric: [md`Every state has an exit condition`, md`Hop speed computed from distance and duration`, md`Identifies reusable states and the role of the controller`],
      areas: ['systems', 'combat'],
    },
    {
      id: 'c05-p5',
      title: 'A mimic chest',
      type: 'concept',
      difficulty: 2,
      minutes: 6,
      statement: md`A mimic looks like a treasure chest (you can open it with \`interact\`) until you get close, then it fights like a skeleton. Describe it first as an inheritance hierarchy and then with components, and explain which is easier to build and why.`,
      solution: [md`Inheritance: \`Mimic extends Chest\` loses the Character movement and states; \`Mimic extends Skeleton\` loses the chest's interaction and loot table. Either way one capability is copied in.`, md`Composition: a Character with an AIController, StateMachine, HealthComponent, Hurtbox, a Hitbox for its bite, and the same \`Interactable\` component the real chest uses. Its AI starts in a Disguised state that ignores the player until in range; \`interacted\` triggers the reveal.`, md`Composition is easier: every part already exists and is tested; the mimic is a new scene and one new AI state.`],
      rubric: [md`Shows the diamond/duplication problem of inheritance`, md`Lists concrete components`, md`Justifies with reuse`],
      areas: ['systems'],
    },
    {
      id: 'c05-p6',
      title: 'Health after a sequence of hits',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`A HealthComponent with \`max_health = 30\` receives \`damage()\` with 7, 7, 9, 12 and then 5. After which call (1 to 5) does \`died\` fire, and how many times in total is \`health_changed\` emitted? Enter both.`,
      solution: [md`Health: 30 → 23 → 16 → 7 → 0 (the 4th call clamps $7 - 12$ to 0 and emits \`died\`).`, md`The 5th call returns early because health is already 0, so \`health_changed\` is emitted 4 times.`],
      answer: { kind: 'vector', value: [4, 4] },
      areas: ['systems'],
    },
    {
      id: 'c05-p7',
      title: 'A buffer that is too short',
      type: 'compute',
      difficulty: 2,
      minutes: 5,
      statement: md`Players complain that pressing attack "near the end" of a dash is often ignored. The dash lasts 12 ticks, \`buffer_time = 0.05\` s. What fraction of the dash's ticks can a press land on and still produce an attack when the dash ends (Idle reads on the tick after the 12th)?`,
      solution: [md`$B = 0.05 \times 60 = 3$ ticks. A press on dash tick $p$ is read at tick 13 with age $13 - p \le 3$, so $p \ge 10$: ticks 10, 11, 12.`, md`$3/12 = 0.25$. Three quarters of the dash swallows the press. A 0.15 s buffer (9 ticks) covers ticks 4 to 12, $9/12 = 0.75$.`],
      answer: { kind: 'number', value: 0.25 },
      areas: ['feel'],
    },
    {
      id: 'c05-p8',
      title: 'An invincibility window on the HealthComponent',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 10,
      statement: md`After Kai is hit, the design wants 0.5 s during which further hits do nothing (common in action RPGs so a crowd cannot chain damage). Write the change on paper. Decide whether it belongs in the Hurtbox, the HealthComponent, the Hurt state, or the Character, and justify it.`,
      solution: [
        md`It belongs where hits are filtered: the Hurtbox already has \`invincible\`. The Character turns it on when hurt and off after 0.5 s, because the Character is where "I was hit" is known:

\`\`\`gdscript
@export var mercy_time := 0.5

func _on_hurt(hit: HitData) -> void:
    health.damage(hit.amount)
    if health.health <= 0:
        return
    velocity = hit.knockback
    state_machine.transition_to("Hurt")
    hurtbox.invincible = true
    await get_tree().create_timer(mercy_time).timeout
    hurtbox.invincible = false
\`\`\``,
        md`Not in HealthComponent: healing-over-time or poison would also be blocked, and a crate does not want it. Not in the Hurt state alone: the mercy window is longer than the 0.25 s Hurt state. If the Dash also sets \`invincible\`, use a counter or two separate flags so one does not switch off the other.`,
      ],
      rubric: [md`Places the logic with a justified owner`, md`Uses a timer or tick count of 0.5 s`, md`Notices the conflict with dash i-frames`],
      areas: ['combat', 'systems'],
    },
    {
      id: 'c05-p9',
      title: 'Where does it go?',
      type: 'concept',
      difficulty: 1,
      minutes: 5,
      statement: md`For each, say whether it belongs in the Character, a State, a controller or a component: (a) "dodge is only possible if stamina is at least 20"; (b) reading the \`guard\` button; (c) \`max_speed\`; (d) "the skeleton attacks when the player is within 20 px"; (e) the number of hit points.`,
      solution: [md`(a) The Dash request is accepted or refused in the states that read \`wants_dodge\` (Idle, Move), reading a stamina component. (b) PlayerController. (c) Character (shared by every state).`, md`(d) AIController: it is a decision about what to want. (e) HealthComponent.`],
      rubric: [md`Controllers decide what to want; states decide what is allowed; components hold reusable data`],
      areas: ['systems'],
    },
  ],
};

/** Listings reused by the c05 figures (the code panel shows the running state's script). */
export const C05_CODE = { IDLE, MOVE, DASH, ATTACK: ATTACK_V1, HURT, PLAYER_FLAGS, PLAYER_ENUM, HEALTH, HITBOX, HURTBOX, CHARACTER_V2 };
