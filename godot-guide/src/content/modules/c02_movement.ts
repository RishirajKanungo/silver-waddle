import { md, gd, type Lesson, type Module } from '../types';

const PLAYER_V1 = gd`
extends CharacterBody2D

@export var max_speed := 90.0


func _physics_process(_delta: float) -> void:
    var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")
    velocity = input * max_speed
    move_and_slide()
`;

const PLAYER_V2 = gd`
extends CharacterBody2D

@export var max_speed := 90.0      ## top speed, pixels per second
@export var acceleration := 900.0  ## how fast we reach top speed, px/s²
@export var friction := 1200.0     ## how fast we stop, px/s²


func _physics_process(delta: float) -> void:
    var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")
    var rate := acceleration if input != Vector2.ZERO else friction
    velocity = velocity.move_toward(input * max_speed, rate * delta)
    move_and_slide()
`;

const PLAYER_FULL = gd`
class_name Player
extends CharacterBody2D

@export var max_speed := 90.0
@export var acceleration := 900.0
@export var friction := 1200.0

## "down", "up" or "side". Side sprites face right; we flip them for left.
var facing := "down"

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D


func _physics_process(delta: float) -> void:
    var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")
    var rate := acceleration if input != Vector2.ZERO else friction
    velocity = velocity.move_toward(input * max_speed, rate * delta)
    move_and_slide()
    _update_facing(input)
    _update_animation()


func _update_facing(input: Vector2) -> void:
    if input == Vector2.ZERO:
        return  # keep the last direction while standing still
    if absf(input.x) > absf(input.y):
        facing = "side"
        sprite.flip_h = input.x < 0.0
    else:
        facing = "up" if input.y < 0.0 else "down"


func _update_animation() -> void:
    var state := "walk" if velocity.length() > 5.0 else "idle"
    var anim := state + "_" + facing
    if sprite.animation != anim:
        sprite.play(anim)
`;

// ------------------------------------------------------------------ lesson c02-2: dash, i-frames, buffer
const PLAYER_DASH = gd`
class_name Player
extends CharacterBody2D

@export var max_speed := 90.0
@export var acceleration := 900.0
@export var friction := 1200.0

@export_group("Dash")
## Speed during the dash, px/s.
@export var dash_speed := 240.0
## Length of the dash in physics frames (60 per second).
@export var dash_frames := 10
## Invincible frames, counted from the first frame of the dash.
@export var iframe_frames := 8
## Seconds after a dash ends before the next one can start.
@export var dash_cooldown := 0.3
## How long an early press of "dodge" is remembered, in seconds.
@export var buffer_time := 0.12

## "down", "up" or "side". Side sprites face right; we flip them for left.
var facing := "down"

var _dash_frames_left := 0
var _dash_direction := Vector2.ZERO
var _iframes_left := 0
var _cooldown_left := 0.0
# Seconds since "dodge" was pressed. INF means no press is waiting.
var _since_dodge_press := INF

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D


func _physics_process(delta: float) -> void:
    _cooldown_left = maxf(_cooldown_left - delta, 0.0)
    _iframes_left = maxi(_iframes_left - 1, 0)
    if Input.is_action_just_pressed("dodge"):
        _since_dodge_press = 0.0
    var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")

    if _dash_frames_left > 0:
        _dash_step()
    elif _since_dodge_press <= buffer_time and _cooldown_left <= 0.0:
        _start_dash(input)
        _dash_step()
    else:
        _walk(input, delta)
    _since_dodge_press += delta
    _update_animation()


func is_invincible() -> bool:
    return _iframes_left > 0


## Called by hazards now and by enemy hitboxes later.
func hurt(from_position: Vector2) -> void:
    if is_invincible():
        return
    _dash_frames_left = 0
    velocity = from_position.direction_to(global_position) * 160.0
    # A short grace period after a hit, so one hazard cannot hit on every frame.
    _iframes_left = 36
    var tween := create_tween()
    tween.tween_property(sprite, "modulate", Color(1.0, 0.35, 0.35), 0.05)
    tween.tween_property(sprite, "modulate", Color.WHITE, 0.25)


func _walk(input: Vector2, delta: float) -> void:
    var rate := acceleration if input != Vector2.ZERO else friction
    velocity = velocity.move_toward(input * max_speed, rate * delta)
    move_and_slide()
    _update_facing(input)


func _start_dash(input: Vector2) -> void:
    _since_dodge_press = INF  # consume the press: one press, one dash
    # Dash where the stick points; with no input, dash the way Kai faces.
    _dash_direction = input.normalized() if input != Vector2.ZERO else _facing_vector()
    _dash_frames_left = dash_frames
    _iframes_left = iframe_frames
    _update_facing(_dash_direction)


func _dash_step() -> void:
    velocity = _dash_direction * dash_speed
    move_and_slide()
    _dash_frames_left -= 1
    if _dash_frames_left % 2 == 0:
        _spawn_afterimage()
    if _dash_frames_left == 0:
        _cooldown_left = dash_cooldown
        # Leave the dash at walking speed; at dash speed, friction would add a long slide.
        velocity = _dash_direction * max_speed


func _facing_vector() -> Vector2:
    match facing:
        "up":
            return Vector2.UP
        "down":
            return Vector2.DOWN
    return Vector2.LEFT if sprite.flip_h else Vector2.RIGHT


func _spawn_afterimage() -> void:
    var ghost := Sprite2D.new()
    ghost.texture = sprite.sprite_frames.get_frame_texture(sprite.animation, sprite.frame)
    ghost.flip_h = sprite.flip_h
    ghost.modulate = Color(0.55, 0.8, 1.0, 0.7)
    get_parent().add_child(ghost)
    ghost.global_position = sprite.global_position
    var tween := ghost.create_tween()
    tween.tween_property(ghost, "modulate:a", 0.0, 0.25)
    tween.tween_callback(ghost.queue_free)


func _update_facing(input: Vector2) -> void:
    if input == Vector2.ZERO:
        return
    if absf(input.x) > absf(input.y):
        facing = "side"
        sprite.flip_h = input.x < 0.0
    else:
        facing = "up" if input.y < 0.0 else "down"


func _update_animation() -> void:
    var state := "idle"
    if _dash_frames_left > 0:
        state = "dash"
    elif velocity.length() > 5.0:
        state = "walk"
    var anim := state + "_" + facing
    if sprite.animation != anim:
        sprite.play(anim)
`;

const SPIKES = gd`
extends Area2D

## Checks every physics frame instead of using body_entered. A player who is still standing
## on the spikes when their invincibility runs out gets hurt at that moment.
func _physics_process(_delta: float) -> void:
    for body in get_overlapping_bodies():
        if body is Player:
            (body as Player).hurt(global_position)
`;

const PLAYER_DASH_SOLUTION = gd`
class_name Player
extends CharacterBody2D

@export var max_speed := 90.0
@export var acceleration := 900.0
@export var friction := 1200.0

@export_group("Dash")
@export var dash_speed := 240.0
@export var dash_frames := 10
@export var iframe_frames := 8
@export var dash_cooldown := 0.3
@export var buffer_time := 0.12

var facing := "down"

var _dash_frames_left := 0
var _dash_direction := Vector2.ZERO
var _iframes_left := 0
var _cooldown_left := 0.0
var _since_dodge_press := INF

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D
@onready var dash_sound: AudioStreamPlayer2D = $DashSound


func _physics_process(delta: float) -> void:
    _cooldown_left = maxf(_cooldown_left - delta, 0.0)
    _iframes_left = maxi(_iframes_left - 1, 0)
    if Input.is_action_just_pressed("dodge"):
        _since_dodge_press = 0.0
    var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")

    if _dash_frames_left > 0:
        _dash_step()
    elif _since_dodge_press <= buffer_time and _cooldown_left <= 0.0:
        _start_dash(input)
        _dash_step()
    else:
        _walk(input, delta)
    _since_dodge_press += delta
    _update_animation()
    _update_blink()


func is_invincible() -> bool:
    return _iframes_left > 0


func hurt(from_position: Vector2) -> void:
    if is_invincible():
        return
    _dash_frames_left = 0
    velocity = from_position.direction_to(global_position) * 160.0
    _iframes_left = 36
    var tween := create_tween()
    tween.tween_property(sprite, "modulate", Color(1.0, 0.35, 0.35), 0.05)
    tween.tween_property(sprite, "modulate", Color.WHITE, 0.25)


func _walk(input: Vector2, delta: float) -> void:
    var rate := acceleration if input != Vector2.ZERO else friction
    velocity = velocity.move_toward(input * max_speed, rate * delta)
    move_and_slide()
    _update_facing(input)


func _start_dash(input: Vector2) -> void:
    _since_dodge_press = INF
    _dash_direction = input.normalized() if input != Vector2.ZERO else _facing_vector()
    _dash_frames_left = dash_frames
    _iframes_left = iframe_frames
    _update_facing(_dash_direction)
    # A slightly different pitch each time keeps a repeated sound from droning.
    dash_sound.pitch_scale = randf_range(0.95, 1.05)
    dash_sound.play()


func _dash_step() -> void:
    velocity = _dash_direction * dash_speed
    move_and_slide()
    _dash_frames_left -= 1
    if _dash_frames_left % 2 == 0:
        _spawn_afterimage()
    if _dash_frames_left == 0:
        _cooldown_left = dash_cooldown
        velocity = _dash_direction * max_speed


## Blink while invincible: hide the sprite on every other group of 3 frames.
## The physics frame counter keeps the blink steady regardless of rendering speed.
func _update_blink() -> void:
    if is_invincible():
        sprite.visible = (Engine.get_physics_frames() / 3) % 2 == 0
    else:
        sprite.visible = true


func _facing_vector() -> Vector2:
    match facing:
        "up":
            return Vector2.UP
        "down":
            return Vector2.DOWN
    return Vector2.LEFT if sprite.flip_h else Vector2.RIGHT


func _spawn_afterimage() -> void:
    var ghost := Sprite2D.new()
    ghost.texture = sprite.sprite_frames.get_frame_texture(sprite.animation, sprite.frame)
    ghost.flip_h = sprite.flip_h
    ghost.modulate = Color(0.55, 0.8, 1.0, 0.7)
    get_parent().add_child(ghost)
    ghost.global_position = sprite.global_position
    var tween := ghost.create_tween()
    tween.tween_property(ghost, "modulate:a", 0.0, 0.25)
    tween.tween_callback(ghost.queue_free)


func _update_facing(input: Vector2) -> void:
    if input == Vector2.ZERO:
        return
    if absf(input.x) > absf(input.y):
        facing = "side"
        sprite.flip_h = input.x < 0.0
    else:
        facing = "up" if input.y < 0.0 else "down"


func _update_animation() -> void:
    var state := "idle"
    if _dash_frames_left > 0:
        state = "dash"
    elif velocity.length() > 5.0:
        state = "walk"
    var anim := state + "_" + facing
    if sprite.animation != anim:
        sprite.play(anim)
`;

// ------------------------------------------------------------------ lesson c02-3: game feel
const FEEL_WALK = gd`
func _walk(input: Vector2, delta: float) -> void:
    # dot < 0: the stick points against the motion, so the player is turning around
    var turning := input != Vector2.ZERO and velocity.dot(input) < 0.0
    var rate := friction
    if turning:
        rate = turn_acceleration
    elif input != Vector2.ZERO:
        rate = acceleration
    if turning and not _turning:
        dust.restart()  # one puff on the frame the turn starts
    _turning = turning
    velocity = velocity.move_toward(input * max_speed, rate * delta)
    _corner_correction(input, delta)
    move_and_slide()
    _update_facing(input)
`;

const FEEL_CORNER = gd`
## When straight movement is blocked, look for free space up to corner_nudge pixels to
## either side and move one pixel toward it. One pixel per frame reads as a slide, not a jump.
func _corner_correction(input: Vector2, delta: float) -> void:
    var motion := velocity * delta
    if motion == Vector2.ZERO or not test_move(global_transform, motion):
        return  # nothing in the way
    var across := Vector2.ZERO
    if absf(input.y) < 0.2 and input.x != 0.0:
        across = Vector2.DOWN  # moving sideways: try up and down
    elif absf(input.x) < 0.2 and input.y != 0.0:
        across = Vector2.RIGHT  # moving vertically: try left and right
    else:
        return  # diagonal: move_and_slide already slides along the wall
    for i in range(1, corner_nudge + 1):
        for s: float in [1.0, -1.0]:
            if not test_move(global_transform.translated(across * (i * s)), motion):
                global_position += across * s
                return
`;

const FEEL_ANIM = gd`
func _ready() -> void:
    sprite.frame_changed.connect(_on_sprite_frame_changed)


func _update_animation() -> void:
    var state := "idle"
    if _dash_frames_left > 0:
        state = "dash"
    elif velocity.length() > 5.0:
        state = "walk"
    var anim := state + "_" + facing
    if sprite.animation != anim:
        sprite.play(anim)
    # The walk cycle runs at the speed the body moves, so feet do not skate while accelerating.
    sprite.speed_scale = clampf(velocity.length() / max_speed, 0.4, 1.0) if state == "walk" else 1.0


func _on_sprite_frame_changed() -> void:
    if String(sprite.animation).begins_with("walk") and sprite.frame in step_frames:
        footsteps.pitch_scale = randf_range(0.9, 1.1)
        footsteps.play()
`;

const FEEL_SNAP = gd`
## Snap analog input to the nearest of 8 directions, keeping how far the stick is pushed.
func _snap_8(input: Vector2) -> Vector2:
    if input == Vector2.ZERO:
        return input
    var angle := snappedf(input.angle(), PI / 4.0)
    return Vector2.from_angle(angle) * input.length()
`;

export const PLAYER_FEEL = gd`
class_name Player
extends CharacterBody2D

@export var max_speed := 90.0
@export var acceleration := 1200.0
@export var friction := 1600.0

@export_group("Dash")
@export var dash_speed := 240.0
@export var dash_frames := 10
@export var iframe_frames := 8
@export var dash_cooldown := 0.3
@export var buffer_time := 0.12

@export_group("Feel")
## Acceleration while the stick points against the motion, px/s².
@export var turn_acceleration := 3000.0
## How far the player may be nudged sideways around a corner, px.
@export var corner_nudge := 4
## Frames of each walk animation where a foot touches the ground.
@export var step_frames: Array[int] = [0, 2]

var facing := "down"

var _dash_frames_left := 0
var _dash_direction := Vector2.ZERO
var _iframes_left := 0
var _cooldown_left := 0.0
var _since_dodge_press := INF
var _turning := false

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D
@onready var dust: CPUParticles2D = $Dust
@onready var footsteps: AudioStreamPlayer2D = $Footsteps


func _ready() -> void:
    sprite.frame_changed.connect(_on_sprite_frame_changed)


func _physics_process(delta: float) -> void:
    _cooldown_left = maxf(_cooldown_left - delta, 0.0)
    _iframes_left = maxi(_iframes_left - 1, 0)
    if Input.is_action_just_pressed("dodge"):
        _since_dodge_press = 0.0
    var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")

    if _dash_frames_left > 0:
        _dash_step()
    elif _since_dodge_press <= buffer_time and _cooldown_left <= 0.0:
        _start_dash(input)
        _dash_step()
    else:
        _walk(input, delta)
    _since_dodge_press += delta
    _update_animation()


func is_invincible() -> bool:
    return _iframes_left > 0


func hurt(from_position: Vector2) -> void:
    if is_invincible():
        return
    _dash_frames_left = 0
    velocity = from_position.direction_to(global_position) * 160.0
    _iframes_left = 36
    var tween := create_tween()
    tween.tween_property(sprite, "modulate", Color(1.0, 0.35, 0.35), 0.05)
    tween.tween_property(sprite, "modulate", Color.WHITE, 0.25)


func _walk(input: Vector2, delta: float) -> void:
    var turning := input != Vector2.ZERO and velocity.dot(input) < 0.0
    var rate := friction
    if turning:
        rate = turn_acceleration
    elif input != Vector2.ZERO:
        rate = acceleration
    if turning and not _turning:
        dust.restart()
    _turning = turning
    velocity = velocity.move_toward(input * max_speed, rate * delta)
    _corner_correction(input, delta)
    move_and_slide()
    _update_facing(input)


func _corner_correction(input: Vector2, delta: float) -> void:
    var motion := velocity * delta
    if motion == Vector2.ZERO or not test_move(global_transform, motion):
        return
    var across := Vector2.ZERO
    if absf(input.y) < 0.2 and input.x != 0.0:
        across = Vector2.DOWN
    elif absf(input.x) < 0.2 and input.y != 0.0:
        across = Vector2.RIGHT
    else:
        return
    for i in range(1, corner_nudge + 1):
        for s: float in [1.0, -1.0]:
            if not test_move(global_transform.translated(across * (i * s)), motion):
                global_position += across * s
                return


func _start_dash(input: Vector2) -> void:
    _since_dodge_press = INF
    _dash_direction = input.normalized() if input != Vector2.ZERO else _facing_vector()
    _dash_frames_left = dash_frames
    _iframes_left = iframe_frames
    _update_facing(_dash_direction)


func _dash_step() -> void:
    velocity = _dash_direction * dash_speed
    move_and_slide()
    _dash_frames_left -= 1
    if _dash_frames_left % 2 == 0:
        _spawn_afterimage()
    if _dash_frames_left == 0:
        _cooldown_left = dash_cooldown
        velocity = _dash_direction * max_speed


func _facing_vector() -> Vector2:
    match facing:
        "up":
            return Vector2.UP
        "down":
            return Vector2.DOWN
    return Vector2.LEFT if sprite.flip_h else Vector2.RIGHT


func _spawn_afterimage() -> void:
    var ghost := Sprite2D.new()
    ghost.texture = sprite.sprite_frames.get_frame_texture(sprite.animation, sprite.frame)
    ghost.flip_h = sprite.flip_h
    ghost.modulate = Color(0.55, 0.8, 1.0, 0.7)
    get_parent().add_child(ghost)
    ghost.global_position = sprite.global_position
    var tween := ghost.create_tween()
    tween.tween_property(ghost, "modulate:a", 0.0, 0.25)
    tween.tween_callback(ghost.queue_free)


func _update_facing(input: Vector2) -> void:
    if input == Vector2.ZERO:
        return
    if absf(input.x) > absf(input.y):
        facing = "side"
        sprite.flip_h = input.x < 0.0
    else:
        facing = "up" if input.y < 0.0 else "down"


func _update_animation() -> void:
    var state := "idle"
    if _dash_frames_left > 0:
        state = "dash"
    elif velocity.length() > 5.0:
        state = "walk"
    var anim := state + "_" + facing
    if sprite.animation != anim:
        sprite.play(anim)
    sprite.speed_scale = clampf(velocity.length() / max_speed, 0.4, 1.0) if state == "walk" else 1.0


func _on_sprite_frame_changed() -> void:
    if String(sprite.animation).begins_with("walk") and sprite.frame in step_frames:
        footsteps.pitch_scale = randf_range(0.9, 1.1)
        footsteps.play()
`;

const LESSON_DASH: Lesson = {
  id: 'c02-2',
  title: 'Dash, invincibility frames and input buffering',
  minutes: 40,
  objectives: [
    'Add a dash that moves at a fixed speed for a fixed number of physics frames, with a cooldown.',
    'Choose the dash direction from input, or from facing when there is none.',
    'Make the player invincible for the first frames of the dash and explain the flag and hurtbox options.',
    'Buffer an early press for about 120 ms and explain why it makes the controls feel responsive.',
    'Spawn fading afterimages with a Sprite2D and a tween.',
  ],
  cells: [
    {
      kind: 'text',
      md: md`Press dodge and Kai bursts forward about two and a half tiles in a sixth of a second, a trail of fading ghosts behind him. A slime's lunge passes straight through him. Press dodge again a moment before the dash ends and the second dash starts on the very frame the first one stops.

Three separate problems hide in that description:

- **A movement mode.** For a fixed number of frames the dash ignores acceleration and the stick and moves at one speed in one direction. Afterwards normal walking resumes, after a cooldown that stops the player from chaining dashes forever.
- **Invincibility.** For part of the dash, hits do not land. Fighting games and action RPGs call these **invincibility frames**, or i-frames.
- **Early presses.** Players press a little before the game is ready. A game that ignores those presses feels unresponsive even when its frame rate is perfect. An **input buffer** remembers the press for a short time and acts on it as soon as it can.

All three are built on counters that tick once per physics frame, which is why this lesson counts in frames: at 60 Hz one frame is $1/60 \approx 16.7$ ms.`,
    },
    {
      kind: 'callout',
      tone: 'definition',
      title: 'Dash, i-frames, cooldown, input buffer',
      md: md`- **Dash:** a fixed-speed movement for $n$ physics frames. Distance $d = v_{\text{dash}} \cdot n / 60$.
- **I-frames:** frames during which the character cannot be hurt. They usually start on the first frame of the dash and may end before it does, so a dash started too late still gets you hit.
- **Cooldown:** time after a dash ends during which another cannot start.
- **Input buffer:** a press that arrives while the action is not possible is remembered for a window of time (here \`buffer_time\`, about 0.1–0.15 s); if the action becomes possible inside the window, it fires then.`,
    },
    {
      kind: 'derive',
      title: 'dash distance, and why the dash ends at walking speed',
      goal: md`Find the distance of a dash of $n$ frames at speed $v_{\text{dash}}$, and the extra slide if the dash simply let friction stop the character.`,
      steps: [
        { md: md`Each physics frame moves the body by $v_{\text{dash}}\,\Delta t$ with $\Delta t = 1/60$ s. After $n$ frames: $$d = n\, v_{\text{dash}}\, \Delta t = \frac{v_{\text{dash}}\, n}{60}.$$ With $v_{\text{dash}} = 240$ px/s and $n = 10$: $d = 40$ px, two and a half 16-px tiles, in $10/60 \approx 0.167$ s.` },
        {
          md: md`If the dash ended by handing $v_{\text{dash}}$ to the walking code, friction $f$ would bring it to rest. From c02-1 the stopping distance is $v^2/(2f)$: $$\frac{240^2}{2 \cdot 1200} = 24 \text{ px}.$$`,
          choose: {
            prompt: md`Which formula gives the slide after the dash?`,
            options: [md`$v^2/(2f)$, the stopping distance under constant deceleration`, md`$v \cdot f$`, md`$v / f$, the stopping time`],
            answer: 0,
            explain: md`$v/f$ is how long the stop takes; the distance is the area under the falling speed line, $\tfrac12 \cdot v \cdot v/f$.`,
          },
        },
        { md: md`A 24-px slide makes the dash 60% longer than designed and hard to aim. Setting the velocity to $v_{\max} = 90$ px/s on the last frame leaves a slide of $90^2/2400 \approx 3.4$ px when the stick is released, and none if it is held: the dash hands over to an ordinary walk.` },
      ],
      takeaway: md`Design the dash by distance and duration, then derive speed and frames: $v_{\text{dash}} = 60\,d/n$. Control how it ends explicitly; the transition back to walking is part of the feel.`,
    },
    {
      kind: 'text',
      md: md`### Designing the code before writing it

**Why a frame counter for the dash.** \`_physics_process\` runs at a fixed 60 Hz, so counting frames gives exactly the same dash every time: 10 frames is 10 steps of the same size, 40.0 px. A timer in seconds that subtracts \`delta\` can land a hair above or below zero because $1/60$ has no exact binary representation, and the dash becomes 10 frames sometimes and 11 at other times. For the cooldown and the buffer that one-frame wobble does not matter, so they stay in seconds, which is how a designer thinks about them.

**Why a separate branch.** While dashing, nothing else should touch the velocity: no acceleration, no reading the stick. The cleanest way to guarantee that is an \`if\` that sends the frame either to \`_dash_step()\` or to \`_walk()\`, never both. In c05 this branch grows into a state machine with a \`DashState\`.

**Why normalize the direction.** \`get_vector\` returns a vector of length up to 1; a half-tilted stick gives length 0.5. Normalizing makes every dash the same length. With no input the dash goes the way Kai faces, so a dodge always does something.

**How the buffer works.** Instead of asking "was dodge pressed this frame?", store *when* it was last pressed, as seconds since the press, and ask "was it pressed within the last \`buffer_time\` seconds?". A press during a dash or the cooldown then waits, and fires on the first frame the dash is allowed. Starting the dash sets the timer to \`INF\`, which consumes the press so that it cannot fire twice.`,
    },
    { kind: 'code', file: 'scripts/player.gd', code: PLAYER_DASH, note: md`\`@export_group("Dash")\` groups the following exported variables under a foldable heading in the Inspector. \`INF\` is GDScript's infinity constant; \`INF + delta\` stays \`INF\`, so "no press waiting" needs no extra boolean.` },
    {
      kind: 'viz',
      viz: { type: 'core.dash' },
      task: md`Click the figure. Set \`buffer_time\` to 0 ms and \`dash_cooldown\` to 0.3 s, then press dodge twice quickly while walking: the second press shows up as **lost** on the timeline. Set \`buffer_time\` to 120 ms and do the same: the yellow buffer bar now bridges the press to a second dash, and **rescued by buffer** counts it. Finally dash across the spikes with \`iframe_frames\` at 8, then at 2.`,
      caption: md`The timeline shows the last 130 physics frames, one column of 2 pixels per frame, with grid lines every 10 frames. A press during the dash or cooldown opens a buffer window (yellow). If the window reaches a frame where dashing is allowed, the dash starts there (green tick); if not, the press is lost (red tick). Blue marks i-frames; the hero blinks while they last.`,
    },
    {
      kind: 'check',
      q: md`With \`buffer_time = 0.0\`, a player presses dodge 3 frames before the cooldown ends. What happens?`,
      options: [
        md`Nothing: on the press frame the cooldown blocks the dash, and on the next frame the press is already $1/60$ s old, which is more than 0.`,
        md`The dash starts 3 frames later, when the cooldown ends.`,
        md`The dash starts immediately and the cooldown is skipped.`,
        md`The game crashes because \`INF\` is compared with 0.`,
      ],
      answer: 0,
      explain: md`The condition is \`_since_dodge_press <= buffer_time\`. With a window of 0 only a press on the same frame counts. This is the "eaten input" players complain about: they did press, early by 50 ms. A window of 0.12 s accepts presses up to 7 frames early.`,
    },
    {
      kind: 'numeric',
      q: md`A dash uses \`dash_speed = 300\` and \`dash_frames = 8\`. How far does it go in pixels, and how long does it take in milliseconds? Enter both, distance first.`,
      answer: { kind: 'vector', value: [40, 133.333] },
      inputHint: 'e.g. 40, 133.3',
      explain: md`$d = 300 \cdot 8/60 = 40$ px; $t = 8/60$ s $\approx 133.3$ ms. Same distance as the default dash, a little quicker and therefore snappier.`,
    },
    {
      kind: 'callout',
      tone: 'godot',
      title: 'Two ways to make a character invincible',
      md: md`Damage in Shardbound will flow through areas: an enemy's \`Hitbox\` (an \`Area2D\` on layer \`enemy_hitbox\`) overlaps the player's \`Hurtbox\` (an \`Area2D\` whose mask includes \`enemy_hitbox\`), and the hurtbox reports the hit (c05 builds both). There are two ways to ignore hits:

1. **A flag checked by the receiver.** The hurt code asks \`is_invincible()\` and returns early. The overlap is still reported, so the game *knows* a dodge happened, which is what you need for a reward on a well-timed dodge in the battle system.
2. **Switching the detection off.** Set the hurtbox's \`monitoring\` to false, or clear a bit with \`set_collision_mask_value(6, false)\`. Physics changes made inside a physics callback such as \`area_entered\` must be deferred: \`hurtbox.set_deferred("monitoring", false)\`. Nothing is reported, which is simple, but you cannot react to near misses.

This lesson uses the flag. The hazard asks every frame (\`get_overlapping_bodies()\`), so standing on spikes when the i-frames run out hurts at that moment rather than never.`,
    },
    { kind: 'code', file: 'scripts/spikes.gd', code: SPIKES, note: md`\`body is Player\` works because the player script declares \`class_name Player\`. The cast \`(body as Player)\` tells the type checker which methods exist, since \`get_overlapping_bodies()\` returns plain \`Node2D\`s.` },
    {
      kind: 'steps',
      title: 'Add the dash and a spike trap',
      steps: [
        md`Open **Project → Project Settings → Input Map** and add the action \`dodge\`. Bind it to **Shift**, **K** and the gamepad's right face button (B on Xbox layouts, Circle on PlayStation).`,
        md`In Kai's SpriteFrames, add \`dash_down\`, \`dash_up\` and \`dash_side\` from the sheet (see the assets panel of c02-1 for the frames). Set them to 12 FPS and loop off; the dash only lasts 10 frames.`,
        md`Replace \`scripts/player.gd\` with the listing above. Select the \`Player\` node and check that the **Dash** group shows up in the Inspector.`,
        md`Make the trap: **Scene → New Scene**, root \`Area2D\` named \`Spikes\`, save as \`scenes/spikes.tscn\`. Add a \`Sprite2D\` (any spike tile from \`objects\`) and a \`CollisionShape2D\` with a 32×32 **RectangleShape2D**. In the Inspector under **Collision**, clear the *Layer* bits and set *Mask* to layer 2 (\`player\`), the player's body layer. Attach \`scripts/spikes.gd\`.`,
        md`Check that the \`Player\` body is on layer 2 (\`player\`) and masks layer 1 (\`world\`). Instance \`spikes.tscn\` into \`test_room.tscn\` and press **F6**.`,
      ],
      result: md`Shift makes Kai dash 40 px with fading ghosts. Walking onto the spikes knocks him back with a red flash; dashing across them does nothing. Pressing Shift just before a dash ends chains a second dash.`,
      troubleshoot: [
        { problem: md`Walking onto the spikes does nothing.`, fix: md`The spikes' mask must include the layer the Player body is *on*. Check both in the Inspector under **Collision**; the layer names come from **Project Settings → Layer Names → 2D Physics**.` },
        { problem: md`The ghosts appear in the wrong place, offset from Kai.`, fix: md`The ghost copies \`sprite.global_position\` after it is added to the tree. If your \`AnimatedSprite2D\` uses *Offset* instead of *Position* to lift the sprite, copy the offset too: \`ghost.offset = sprite.offset\`.` },
        { problem: md`The dash direction is always right.`, fix: md`\`_facing_vector()\` reads \`facing\` and \`sprite.flip_h\`. If \`facing\` never changes, \`_update_facing\` is not being called from \`_walk\`.` },
      ],
    },
    {
      kind: 'text',
      md: md`### Afterimages

An afterimage is a copy of the current frame left behind in the world, fading out. \`sprite.sprite_frames.get_frame_texture(animation, frame)\` returns the exact texture on screen this frame; a plain \`Sprite2D\` with that texture and the same flip is the ghost. It is added to the *parent* (the room), not to the player: a child of the player would move along with him and no trail would appear.

\`ghost.create_tween()\` creates a tween bound to the ghost, so the tween stops if the ghost is freed early. \`tween_property(ghost, "modulate:a", 0.0, 0.25)\` animates only the alpha channel (the \`:a\` subproperty) to zero over 0.25 s, and \`tween_callback(ghost.queue_free)\` deletes the node when the fade is done. Spawning on every second dash frame gives five ghosts about 8 px apart, enough to read as a streak without overdraw.`,
    },
    {
      kind: 'check',
      q: md`A teammate spawns afterimages with \`add_child(ghost)\` inside the player script, so each ghost becomes a child of the player. What does the player see?`,
      options: [
        md`The ghosts stay glued to Kai and fade in place, so no trail appears.`,
        md`The trail works the same.`,
        md`The ghosts are drawn behind the ground tiles.`,
        md`An error, because Sprite2D cannot be a child of CharacterBody2D.`,
      ],
      answer: 0,
      explain: md`A child's position is relative to its parent, so a ghost under the player moves with him. Ghosts must live in the world: \`get_parent().add_child(ghost)\`, or a dedicated \`Effects\` node in the room.`,
    },
    {
      kind: 'build',
      ch: {
        id: 'c02-2-build',
        title: 'A dodge that reads',
        goal: md`Make the dash readable to the player. While i-frames last, Kai blinks; every dash plays \`sfx_dash\` with a slightly varied pitch.`,
        requirements: [
          md`Kai blinks (sprite hidden and shown in a steady rhythm) exactly while \`is_invincible()\` is true, after a dash and after being hurt, and is always visible otherwise.`,
          md`Each dash plays the dash sound once, with a pitch between 0.95 and 1.05.`,
          md`Pressing dodge up to 0.12 s before a dash can start still triggers it; pressing earlier does not.`,
          md`Dashing across the spikes with the default values never hurts; walking onto them does.`,
        ],
        hints: [
          md`Add an \`AudioStreamPlayer2D\` named \`DashSound\` under \`Player\` and set its *Stream* to the \`sfx_dash\` file.`,
          md`\`Engine.get_physics_frames()\` counts physics frames since start. Integer division by 3 and \`% 2\` gives a value that flips every 3 frames.`,
          md`Restore \`sprite.visible = true\` when invincibility ends, or Kai may stay hidden.`,
        ],
        solution: [{ file: 'scripts/player.gd', code: PLAYER_DASH_SOLUTION }],
        explain: md`The blink reads the same \`_iframes_left\` counter that protects Kai, so what the player sees can never disagree with what the game does. Using the physics frame counter (instead of a tween) keeps the blink in lockstep with the i-frames.`,
      },
    },
    {
      kind: 'paper',
      problem: {
        id: 'c02-2-paper',
        title: 'A dash from a spec',
        type: 'compute',
        difficulty: 2,
        minutes: 6,
        statement: md`A designer wants a dash that covers 48 px in 0.15 s, with i-frames for the first two thirds of it, and a 100 ms input buffer. At 60 Hz, find \`dash_speed\` (px/s), \`dash_frames\`, \`iframe_frames\` and the number of frames early a press can be. Enter all four in that order.`,
        hints: [md`Convert times to frames first: frames = seconds × 60.`],
        solution: [
          md`\`dash_frames\` $= 0.15 \cdot 60 = 9$.`,
          md`\`dash_speed\` $= 60 \cdot d / n = 60 \cdot 48 / 9 = 320$ px/s.`,
          md`I-frames: $\tfrac23 \cdot 9 = 6$ frames. Buffer: $0.1 \cdot 60 = 6$ frames early.`,
        ],
        answer: { kind: 'vector', value: [320, 9, 6, 6] },
      },
    },
    {
      kind: 'recall',
      prompt: md`Name the four counters or timers in the dash code and what each one is for.`,
      answer: md`\`_dash_frames_left\` (frames of dash remaining; the dash branch runs while it is above 0), \`_iframes_left\` (frames of invincibility), \`_cooldown_left\` (seconds before another dash may start) and \`_since_dodge_press\` (seconds since the last unused press; \`INF\` when none, compared with \`buffer_time\`).`,
    },
    {
      kind: 'explain',
      prompt: md`Why does an input buffer make a game feel *more* responsive, when it actually delays some actions? What goes wrong if the window is 0.5 s?`,
      model: md`Without a buffer, an early press is ignored and the action never happens, so to the player the game failed to respond. With a buffer the action happens at the earliest legal frame, which is what the player meant. The delay is the time until the action becomes legal, not extra lag. A window that is too long fires actions the player no longer wants: a dodge pressed half a second ago, during a dash, fires after they have changed their mind and walked into an enemy. Around 0.1–0.15 s (6–9 frames) covers human early presses without that surprise.`,
    },
  ],
  cards: [
    { id: 'c02-2-c1', kind: 'compute', front: md`Dash at 240 px/s for 10 frames at 60 Hz. Distance in px?`, answer: { kind: 'number', value: 40 }, back: md`$240 \cdot 10/60 = 40$ px.` },
    { id: 'c02-2-c2', kind: 'concept', front: md`What is an input buffer, and what does "consuming" the press mean?`, back: md`Remember when an action was pressed and fire it if it becomes possible within a short window (about 0.12 s). Consuming means clearing the stored press (here, \`_since_dodge_press = INF\`) when it fires, so one press gives one action.` },
    { id: 'c02-2-c3', kind: 'cloze', text: md`To fade only the alpha of a node over 0.25 s: \`tween.tween_property(ghost, "{{}}", 0.0, 0.25)\``, answers: ['modulate:a'] },
    { id: 'c02-2-c4', kind: 'concept', front: md`I-frames with a flag or by disabling the hurtbox: what does each give you?`, back: md`A flag keeps overlaps reported, so you can detect and reward a dodge; you must remember to check it. Disabling \`monitoring\` (with \`set_deferred\` inside physics callbacks) reports nothing, which is simpler but hides near misses.` },
    { id: 'c02-2-c5', kind: 'concept', front: md`Why count the dash in physics frames but the cooldown in seconds?`, back: md`The dash's distance must be identical every time, and counting fixed 1/60 s steps guarantees it. A float timer can land a frame early or late; that wobble is harmless for a cooldown or buffer, which designers think of in seconds.` },
  ],
};

const LESSON_FEEL: Lesson = {
  id: 'c02-3',
  title: 'Game feel: responsiveness, corners and feedback',
  minutes: 45,
  objectives: [
    'Measure responsiveness in frames from press to visible motion, and derive it from the acceleration.',
    'Add a separate turn-around acceleration using the sign of the dot product.',
    'Nudge the player around wall corners with test_move.',
    'Sync the walk cycle to speed, puff dust on turns and play footsteps on contact frames.',
    'Decide between analog and 8-direction movement and apply a feel checklist to any controller.',
  ],
  cells: [
    {
      kind: 'text',
      md: md`Two controllers can have the same top speed and still feel completely different. One feels like steering a shopping trolley; the other seems to read your mind. The difference is a set of small mechanics, each easy to measure once you know where to look.

Record a few seconds of *CrossCode* or *Sea of Stars* with a screen recorder and step through it frame by frame. Count the frames from the moment a direction is pressed to the first frame the character moves. Watch a 180° turn: how many frames until the character runs the other way, and is there a visual on the turn? Watch the feet: do they slide on the ground while the character speeds up? Walk into the corner of a wall slightly off-centre: does the game let you through? Note what the camera does when you change direction.

This lesson turns each of those observations into a mechanic you can add, toggle and measure in Kai's controller. None of them changes what the player *can* do; all of them change how it feels to do it.`,
    },
    {
      kind: 'callout',
      tone: 'definition',
      title: 'Game feel',
      md: md`**Game feel** is how controlling the character feels, moment to moment. It splits into three parts you can work on separately:

- **Responsiveness:** how soon and how exactly the game reacts to input (latency in frames, acceleration, turn speed, buffering).
- **Forgiveness:** small corrections in the player's favour that they never notice (input buffers, coyote time in c03, corner correction).
- **Feedback:** what the player sees and hears confirming the action (animation, particles, sound, camera). Developers often call this layer *juice*.`,
    },
    {
      kind: 'text',
      md: md`### Responsiveness in frames

Godot reads input at the start of a frame, \`_physics_process\` moves the body, and the frame is drawn. With acceleration, the first frames after a press move the body by less than a pixel, and a pixel-art game cannot show less than a pixel. The player perceives the delay until the first visible pixel, so that is the number to compute.`,
    },
    {
      kind: 'derive',
      title: 'frames to the first visible pixel',
      goal: md`With acceleration $a$ and frame time $\Delta t = 1/60$ s, find the position after $k$ frames, starting from rest, and the first $k$ where it reaches 1 px.`,
      steps: [
        { md: md`\`move_toward\` raises the speed by $a\,\Delta t$ every frame, so after frame $i$ the speed is $v_i = a\,i\,\Delta t$ (until it reaches $v_{\max}$).` },
        {
          md: md`\`move_and_slide\` then moves by the *new* speed times $\Delta t$. Summing over $k$ frames: $$x_k = \sum_{i=1}^{k} a\, i\, \Delta t^2 = a\,\Delta t^2\,\frac{k(k+1)}{2} = \frac{a\,k(k+1)}{7200}.$$`,
          choose: {
            prompt: md`What is $\sum_{i=1}^{k} i$?`,
            options: [md`$k(k+1)/2$`, md`$k^2$`, md`$k(k-1)/2$`],
            answer: 0,
            explain: md`Gauss's sum. It is a little more than $k^2/2$ because the speed is updated *before* the move (semi-implicit Euler, from m02).`,
          },
        },
        { md: md`Set $x_k \ge 1$: $k(k+1) \ge 7200/a$. For $a = 900$: $k(k+1) \ge 8$, so $k = 3$ (since $2 \cdot 3 = 6 < 8 \le 3 \cdot 4 = 12$). For $a = 3000$: $k(k+1) \ge 2.4$, so $k = 2$. For an instant start: $k = 1$.` },
      ],
      takeaway: md`Every frame of acceleration before the first visible pixel adds 16.7 ms of perceived latency on top of the display's own. Two or three frames still feels immediate; past about five frames players describe the controls as sluggish.`,
    },
    {
      kind: 'numeric',
      q: md`With \`acceleration = 1200\`, on which frame after the press does the character first move a whole pixel?`,
      answer: { kind: 'number', value: 2 },
      explain: md`$k(k+1) \ge 7200/1200 = 6$: $k = 2$ gives $6 \ge 6$. Position after 2 frames: $1200 \cdot 6/7200 = 1$ px.`,
    },
    {
      kind: 'text',
      md: md`### Turning around

In c02-1 a 180° turn at 900 px/s² takes $180/900 = 0.2$ s: the velocity must fall from $+90$ to $-90$. That is twelve frames of drifting the wrong way, and it is the most common complaint about acceleration-based controllers. The fix is a third rate, used only while the stick points *against* the motion.

How do you detect "against"? The dot product from m01: $\mathbf v \cdot \mathbf u < 0$ exactly when the angle between velocity and input is more than 90°. It needs no angles and no trigonometry, and it works for analog sticks at any angle. With \`turn_acceleration = 3000\` the same turn takes $180/3000 = 0.06$ s, under four frames, while starts and stops keep their gentler rates.

The turn is also the moment for a puff of dust. Remembering whether the previous frame was already turning (\`_turning\`) makes the puff fire once, on the first frame of the turn.`,
    },
    { kind: 'code', file: 'scripts/player.gd', fragment: true, code: FEEL_WALK, note: md`\`dust\` is a \`CPUParticles2D\` child with *One Shot* on; \`restart()\` plays one burst. The full script is in the build challenge at the end of this lesson.` },
    {
      kind: 'viz',
      viz: { type: 'core.feel' },
      task: md`The same keys move A (left) and B (right). Walk right, then tap left: compare **frames to turn around**. Walk up into the one-tile gap between the two top blocks a few pixels off-centre: B slips through, A stops. Now switch B's elements off one at a time and find the one you miss most. Set both sides to the same curve and toggle only the camera.`,
      caption: md`Both characters run the same simulation with different settings; nothing else differs. "Frames to first pixel" is measured from a press at rest; "frames to turn around" from the first frame the input opposes the velocity until the speed in the new direction reaches 90% of \`max_speed\`.`,
    },
    {
      kind: 'check',
      q: md`Kai moves right at $\mathbf v = (90, 0)$. The player pushes the stick up and slightly left, $\mathbf u = (-0.2, -0.98)$. Which rate does \`_walk\` use?`,
      options: [md`\`turn_acceleration\`, because $\mathbf v \cdot \mathbf u = -18 < 0$`, md`\`acceleration\`, because the input is mostly up`, md`\`friction\`, because the input changed`, md`\`turn_acceleration\` only if the input is exactly opposite`],
      answer: 0,
      explain: md`$90 \cdot (-0.2) + 0 \cdot (-0.98) = -18$. Any input more than 90° away from the motion counts as a turn. If that feels too eager, compare with a threshold such as \`velocity.normalized().dot(input) < -0.5\` (more than 120°).`,
    },
    {
      kind: 'text',
      md: md`### Corner correction

Kai's feet are 10 px wide and a doorway is 16 px wide, so he fits with 6 px to spare. A player walking up at a door 3 px off-centre hits the corner and stops dead, which reads as the game being sticky, because on screen he obviously fits. **Corner correction** nudges the body sideways when straight movement is blocked and there is free space a few pixels to one side.

\`test_move(from, motion)\` asks the physics engine whether the body, placed at transform \`from\`, would collide if it moved by \`motion\`, without moving it. Trying offsets of 1, 2, 3, 4 px to each side and moving one pixel toward the first free one gives a gentle slide around the corner over a few frames. Only straight movement is corrected: on diagonals \`move_and_slide\` already slides along the wall.`,
    },
    { kind: 'code', file: 'scripts/player.gd', fragment: true, code: FEEL_CORNER, note: md`\`global_transform.translated(offset)\` returns a copy of the transform moved by \`offset\` in world space. \`for s: float in [...]\` gives the loop variable a type, so \`across * (i * s)\` is typed as well.` },
    {
      kind: 'text',
      md: md`### Feedback: animation, dust and footsteps

**Animation sync.** A walk cycle drawn for 90 px/s looks like ice skating when played at full rate while the body moves at 20 px/s. Scaling \`sprite.speed_scale\` by \`velocity.length() / max_speed\` keeps the feet planted during acceleration. A floor of 0.4 stops the animation from freezing at very low speed.

**Footsteps.** Sound tied to time drifts away from the feet; sound tied to animation frames cannot. \`AnimatedSprite2D\` emits \`frame_changed\` whenever the displayed frame changes. Playing the step sound on the frames where a foot touches the ground, with a random pitch between 0.9 and 1.1, keeps a repeated sample from sounding mechanical.

**Camera.** A camera that follows the player rigidly makes every turn jerk the whole screen. Smoothing (the camera eases toward the player) and look-ahead (the camera aims a little ahead of the motion, so you see more of where you are going) are covered in c04, lesson 3; the figure above lets you feel them already.`,
    },
    { kind: 'code', file: 'scripts/player.gd', fragment: true, code: FEEL_ANIM, note: md`\`sprite.animation\` is a \`StringName\`; wrapping it in \`String(...)\` gives access to every string method. \`step_frames\` is an exported \`Array[int]\`, so you can set the contact frames per sprite sheet in the Inspector.` },
    {
      kind: 'text',
      md: md`### Analog or eight directions

\`get_vector\` gives an analog vector: tilt the stick halfway and Kai walks at half speed in any direction. That is precise, and on a gamepad it feels natural. Two things argue for snapping to eight directions in a pixel-art game: the sprites only face three ways (plus a flip), so a 20° walk looks like a sideways walk drifting up; and shallow angles make the character's pixel position step unevenly (one pixel up every few pixels across), which can read as jitter. Snapping the *angle* to multiples of 45° while keeping the stick's *length* keeps slow walking and removes odd angles.`,
    },
    { kind: 'code', file: 'scripts/player.gd', fragment: true, code: FEEL_SNAP, note: md`Call it on the input before \`_walk(input, delta)\` if you prefer 8-direction movement. Keyboard input is already 8-directional.` },
    {
      kind: 'check',
      q: md`A playtester on a gamepad says Kai "wobbles" walking at a shallow angle, and one on a keyboard never notices. What is the most likely cause and fix?`,
      options: [
        md`Analog input at shallow angles gives uneven pixel steps and a mismatched facing; snap the angle to 45° with \`_snap_8\`.`,
        md`The gamepad has a lower frame rate; raise the physics tick rate.`,
        md`The dead zone is too small; set it to 0.9.`,
        md`\`move_and_slide\` does not support analog input.`,
      ],
      answer: 0,
      explain: md`A keyboard only produces the eight directions, so it never shows the problem. Snapping the angle and keeping the length is the usual compromise; a huge dead zone would make slow walking impossible.`,
    },
    {
      kind: 'callout',
      tone: 'remember',
      title: 'A feel checklist for any controller',
      md: md`1. **First pixel** within 2–3 frames of a press.
2. **Stops** within a few pixels; no unwanted sliding.
3. **Turns** in about 4–6 frames, faster than starting from rest.
4. **Diagonals** no faster than straight lines.
5. **Early presses** of actions are buffered (about 0.1–0.15 s).
6. **Corners** forgive a few pixels of misalignment.
7. **Feet** do not skate: walk cycle tied to speed, footsteps tied to frames.
8. **Every action** has a visual and a sound on its first frame.
9. **The camera** never jerks: smoothed, and leading the motion slightly.
10. **Numbers are written down** with the reason for each.`,
    },
    {
      kind: 'steps',
      title: 'Add the feel layer to the player scene',
      steps: [
        md`Select \`Player\` and in the Inspector set **Motion Mode** to **Floating**. The default *Grounded* mode treats upward-facing surfaces as floors, which is meant for side-view games; in a top-down game every surface is a wall.`,
        md`Add a \`CPUParticles2D\` child named \`Dust\` at the feet (position 0, 0). Set **Emitting** off, **One Shot** on, **Amount** 6, **Lifetime** 0.35, **Explosiveness** 1. Under **Direction** set *Spread* to 60; under **Gravity** set (0, 0); under **Initial Velocity** set *Min* 15 and *Max* 35; under **Scale** set *Amount Min* 1 and *Max* 2; give it a pale beige **Color**.`,
        md`Add an \`AudioStreamPlayer2D\` child named \`Footsteps\` with the \`sfx_footstep\` sound as its *Stream* and *Volume dB* around -8.`,
        md`Replace the script with the build solution below (or add the fragments yourself) and open the walk animations in the SpriteFrames panel to find the contact frames; enter them in **Step Frames**.`,
        md`Build a doorway in \`test_room.tscn\`: two \`StaticBody2D\` blocks 16 px apart. Run with **F6** and walk at the gap slightly off-centre.`,
      ],
      result: md`Kai turns around in a handful of frames with a puff of dust, his feet stay planted while he speeds up, footsteps land on the contact frames, and he slips through the 16-px doorway when approaching up to 4 px off-centre.`,
      troubleshoot: [
        { problem: md`The dust never appears.`, fix: md`With *One Shot* on, *Emitting* must start off; \`restart()\` then plays one burst. Also check the particles are not hidden behind the ground: the \`Dust\` node is a child of \`Player\`, so it draws with the player.` },
        { problem: md`Footsteps play twice per step or never.`, fix: md`Print \`sprite.frame\` in \`_on_sprite_frame_changed\` and check which frames the feet touch the ground. Frame numbers start at 0.` },
        { problem: md`Corner correction makes Kai jitter against a long wall.`, fix: md`The probe found space 1 px away on both sides in alternation. Keep the order fixed (+ then -) and only correct when \`test_move\` reports a collision for the *unmodified* motion, as in the listing.` },
      ],
    },
    {
      kind: 'build',
      ch: {
        id: 'c02-3-build',
        title: 'Tune Kai with the checklist',
        goal: md`Assemble the feel layer into the player script, then tune it against the checklist and record your final numbers and reasons in a comment at the top of the script.`,
        requirements: [
          md`A 180° turn completes in 6 frames or fewer (\`turn_acceleration\` $\ge 180 \cdot 60/6 = 1800$ px/s²) and puffs dust once.`,
          md`Starting from rest, the first visible pixel comes within 3 frames.`,
          md`Approaching a 16-px doorway up to 4 px off-centre lets Kai through without stopping.`,
          md`The walk cycle slows down with the body during acceleration and deceleration, and footsteps match the contact frames.`,
          md`The dash, buffer and i-frames from c02-2 still work.`,
        ],
        hints: [
          md`Keep the old \`_walk\` for comparison by renaming it \`_walk_old\`; switching between them is a fast A/B test.`,
          md`If the turn feels too eager on a gamepad, require a more opposed stick: \`velocity.normalized().dot(input) < -0.5\`.`,
        ],
        solution: [{ file: 'scripts/player.gd', code: PLAYER_FEEL }],
        explain: md`Every addition is a small, separate function: \`_walk\` picks a rate, \`_corner_correction\` moves at most one pixel, \`_update_animation\` scales the walk cycle, \`_on_sprite_frame_changed\` plays steps. Each can be switched off by setting one value (\`turn_acceleration = acceleration\`, \`corner_nudge = 0\`, empty \`step_frames\`), which keeps tuning sessions fast.`,
      },
    },
    {
      kind: 'paper',
      problem: {
        id: 'c02-3-paper',
        title: 'Turn time in frames',
        type: 'compute',
        difficulty: 1,
        minutes: 4,
        statement: md`Kai runs right at 90 px/s and the player pushes left. With \`turn_acceleration = 2400\`, how long (s) does the velocity take to reach $-90$ px/s, and on which physics frame after the push is it reached? Enter both.`,
        solution: [md`The velocity changes by 180 px/s at 2400 px/s²: $t = 180/2400 = 0.075$ s.`, md`In frames: $0.075 \cdot 60 = 4.5$, so it is reached during frame 5 (each frame changes the speed by $2400/60 = 40$ px/s: $90 \to 50 \to 10 \to -30 \to -70 \to -90$).`],
        answer: { kind: 'vector', value: [0.075, 5] },
      },
    },
    {
      kind: 'recall',
      prompt: md`List the three parts of game feel and one mechanic from this module for each.`,
      answer: md`Responsiveness: acceleration and turn acceleration, first-pixel latency. Forgiveness: input buffer, corner correction. Feedback: afterimages, dust, footsteps on contact frames, walk cycle synced to speed, camera smoothing.`,
    },
    {
      kind: 'explain',
      prompt: md`Corner correction changes the player's position without their input. Why do players not notice it, and when would it become a problem?`,
      model: md`It only acts when straight movement is blocked and free space is a few pixels away, which is exactly when the player believes they should fit; the art shows a gap, so the correction matches their intention. It moves one pixel per frame, so it reads as a slide. It becomes a problem when the nudge is large (more than about a quarter of the body width), because then the player is pulled into openings they meant to walk past, or when it acts on diagonals and fights \`move_and_slide\`'s own sliding.`,
    },
  ],
  cards: [
    { id: 'c02-3-c1', kind: 'compute', front: md`Acceleration 900 px/s² from rest at 60 Hz: on which frame is the first whole pixel reached?`, answer: { kind: 'number', value: 3 }, back: md`$x_k = a\,k(k+1)/7200 \ge 1 \Rightarrow k(k+1) \ge 8 \Rightarrow k = 3$.` },
    { id: 'c02-3-c2', kind: 'concept', front: md`How do you detect that the player is turning around, for any stick angle?`, back: md`\`velocity.dot(input) < 0\`: the input points more than 90° away from the motion. Use a larger turn acceleration while that holds.` },
    { id: 'c02-3-c3', kind: 'cloze', text: md`\`{{}}(global_transform, motion)\` reports whether the body would collide if it moved by \`motion\`, without moving it.`, answers: ['test_move'] },
    { id: 'c02-3-c4', kind: 'concept', front: md`Why tie footsteps to animation frames instead of a timer?`, back: md`The frames show the feet touching the ground; a timer drifts out of step whenever the walk speed or \`speed_scale\` changes. \`frame_changed\` plus a list of contact frames cannot drift.` },
    { id: 'c02-3-c5', kind: 'concept', front: md`Name the three parts of game feel.`, back: md`Responsiveness (how fast and exactly input acts), forgiveness (invisible corrections in the player's favour), feedback (animation, particles, sound and camera confirming actions).` },
  ],
};

export const MODULE: Module = {
  id: 'c02',
  part: 'core',
  order: 2,
  title: 'Top-down movement and feel',
  summary: 'A CharacterBody2D that moves in eight directions, acceleration and friction tuned by feel, facing and animation from velocity, and a dash with invincibility frames.',
  relevance: md`Movement is the system the player touches every second, so it is where "feel" is won or lost. This module builds Kai's controller for the top-down world of Shardbound: the same code later drives the party in combat, so a dash with invincibility frames and an input buffer here become the dodge and the attack cancel in the battle system.`,
  prereqs: ['g03', 'm01', 'm02'],
  areas: ['feel', 'godot', 'math'],
  lessons: [
    {
      id: 'c02-1',
      title: 'Moving a character: velocity, acceleration and friction',
      minutes: 40,
      objectives: [
        'Build a player scene from CharacterBody2D, AnimatedSprite2D and CollisionShape2D.',
        'Move in eight directions with Input.get_vector and move_and_slide.',
        'Explain the diagonal-speed bug and why get_vector fixes it.',
        'Add acceleration and friction with move_toward and compute time and distance to top speed.',
        'Choose the idle or walk animation and the facing direction from velocity and input.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A top-down character needs to answer two questions every physics frame: *where does the player want to go*, and *how fast am I going right now*. The first comes from input. The second is the **velocity**, a vector in pixels per second. Godot's \`CharacterBody2D\` does the rest: you set \`velocity\`, call \`move_and_slide()\`, and Godot moves the body, stops it at walls and lets it slide along them.

Two numbers decide most of how movement feels:

- **Top speed.** At a resolution of 320×180, 90 px/s crosses the screen horizontally in about 3.6 seconds. Faster than about 120 px/s and the camera struggles to show what is ahead; slower than about 60 px/s and walking feels like wading.
- **Responsiveness.** How long it takes to reach top speed, and to stop. Action games keep both short, a few hundredths of a second, so the character goes where the stick points almost immediately but still has a little weight.

This lesson builds the controller in two steps: first constant speed, then acceleration and friction.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'CharacterBody2D and move_and_slide()',
          md: md`\`CharacterBody2D\` is the node for bodies you move with code (players, enemies). Its \`velocity\` property is a \`Vector2\` in **pixels per second**. \`move_and_slide()\` moves the body by \`velocity × delta\` for you, resolves collisions with \`StaticBody2D\`s and tile collisions, slides along surfaces, and updates \`velocity\` (a wall you run into removes the part of the velocity that points into it). Call it once per \`_physics_process\`, which runs at a fixed 60 times per second by default.`,
        },
        {
          kind: 'assets',
          ids: ['hero', 'tiles_overworld'],
          note: md`Kai's sheet has 32×32 frames with the feet near the bottom of each frame. The side-facing animations face right; you will flip them for left.`,
        },
        {
          kind: 'steps',
          title: 'Build the player scene',
          steps: [
            md`Open the starter project. Create a new scene (**Scene → New Scene**), choose **Other Node** and pick \`CharacterBody2D\`. Rename it \`Player\` and save it as \`scenes/player.tscn\`.`,
            md`Add a child \`AnimatedSprite2D\`. In the Inspector, create a **New SpriteFrames** in its *Sprite Frames* property and open it. Use **Add frames from sprite sheet** (the grid icon), pick \`assets/characters/kai.png\`, set the grid to 32×32 px frames, and add the frames for \`idle_down\` (rename the default animation). Repeat for \`walk_down\`, \`walk_up\`, \`walk_side\`, \`idle_up\` and \`idle_side\`. The asset panel above lists which frames belong to each animation; set walk animations to 8 FPS.`,
            md`Move the \`AnimatedSprite2D\` up by about 12 px (Position y = -12) so the character's feet sit on the \`Player\` node's origin. The body's position is then where the character stands, which makes Y-sorting and collisions behave later.`,
            md`Add a child \`CollisionShape2D\` and give it a **RectangleShape2D** of about 10×6 px at the feet. Top-down games collide with the feet, not the whole body, so characters can walk in front of walls and objects the way the art suggests.`,
            md`Open **Project → Project Settings → Input Map** and add four actions: \`move_left\`, \`move_right\`, \`move_up\`, \`move_down\`. Bind each to its arrow key, to WASD, and to the left stick of a gamepad.`,
            md`Attach a new script to \`Player\` (\`scripts/player.gd\`) and type in the listing below. Then create a \`scenes/test_room.tscn\` with a \`Node2D\` root, instance the player into it (drag \`player.tscn\` onto the root) and press **F6** to run the current scene.`,
          ],
          result: md`Kai stands in the middle of a grey window and moves in all eight directions with the keyboard or a gamepad. He does not animate yet; that comes at the end of the lesson.`,
          troubleshoot: [
            { problem: md`The character is blurry.`, fix: md`Texture filtering is on. The starter project sets **Rendering → Textures → Default Texture Filter** to *Nearest*; check that setting, or set *Texture → Filter* to *Nearest* on the sprite.` },
            { problem: md`Nothing moves, and the Output panel shows errors about unknown actions.`, fix: md`The action names in the script must match the Input Map exactly (\`move_left\`, not \`left\`). Names are case-sensitive.` },
            { problem: md`The character moves but much too fast or too slow.`, fix: md`The window is scaled up from 320×180, so 90 px/s in the game is 360 screen pixels per second at 4× scale. That is expected; tune \`max_speed\` in game pixels.` },
          ],
        },
        { kind: 'code', file: 'scripts/player.gd', code: PLAYER_V1, note: md`\`Input.get_vector(negative_x, positive_x, negative_y, positive_y)\` reads four actions and returns a \`Vector2\` with length at most 1. In Godot's 2D coordinates y grows **downward**, so "up" is negative y.` },
        {
          kind: 'viz',
          viz: { type: 'core.topdown', mode: 'basic' },
          task: md`Click the figure, then move with WASD or the arrow keys. Turn off **normalize diagonal input** and walk diagonally: watch the speed readout and the spacing of the footstep dots.`,
          caption: md`With normalization off, the input vector for "right + down" is $(1, 1)$, whose length is $\sqrt 2 \approx 1.41$, so diagonal movement is 41% faster. The dots are dropped every 0.1 s, so wider spacing means more speed.`,
        },
        {
          kind: 'check',
          q: md`A beginner writes the input like this instead of using \`get_vector\`:

\`\`\`gdscript
var input := Vector2(Input.get_axis("move_left", "move_right"), Input.get_axis("move_up", "move_down"))
velocity = input * max_speed
\`\`\`

What goes wrong?`,
          options: [md`Diagonal movement is about 41% faster than straight movement.`, md`The character cannot move diagonally.`, md`Up and down are reversed.`, md`Nothing; it is equivalent to \`get_vector\`.`],
          answer: 0,
          explain: md`Each axis is $-1$, $0$ or $1$, so a diagonal input is $(\pm1, \pm1)$ with length $\sqrt2$. \`get_vector\` limits the result to length 1 (and applies a dead zone), so every direction has the same top speed.`,
        },
        {
          kind: 'numeric',
          q: md`With \`max_speed = 90\` and the unnormalized input above, how fast (px/s) does the character move diagonally?`,
          answer: { kind: 'number', value: 90 * Math.SQRT2 },
          explain: md`$90 \times \sqrt{2} \approx 127.3$ px/s, against 90 px/s along an axis.`,
        },
        {
          kind: 'text',
          md: md`### Acceleration and friction

Setting \`velocity\` straight to \`input * max_speed\` means zero to full speed in one frame and full speed to zero in one frame. It is precise but feels stiff, like a cursor. A small amount of **acceleration** (how quickly speed builds) and **friction** (how quickly it drops when you let go) adds weight without making the character feel slow.

Godot's \`Vector2.move_toward(to, delta)\` moves a vector toward a target by at most \`delta\`. Each physics frame, nudge the velocity toward the velocity the player is asking for, by at most \`rate × delta\`:

$$\bv \leftarrow \operatorname{move\_toward}\big(\bv,\ \bv_{\text{target}},\ a\,\Delta t\big), \qquad \bv_{\text{target}} = v_{\max}\,\hat{\mathbf{u}}.$$

Because the step is \`rate * delta\`, the result is the same at 60 or 144 frames per second: the speed changes by $a$ pixels per second, every second.`,
        },
        {
          kind: 'derive',
          title: 'time and distance to top speed',
          goal: md`From rest, the speed grows by $a$ every second until it reaches $v_{\max}$. Find the time $t_{\text{top}}$ and the distance travelled while accelerating.`,
          steps: [
            { md: md`Speed grows linearly: $v(t) = a\,t$. It reaches $v_{\max}$ when $a\,t = v_{\max}$, so $$t_{\text{top}} = \frac{v_{\max}}{a}.$$` },
            {
              md: md`Distance is the area under the speed-time graph. Under a straight line from 0 to $v_{\max}$ that is a triangle: $$d_{\text{top}} = \tfrac12\, t_{\text{top}}\, v_{\max} = \frac{v_{\max}^2}{2a}.$$`,
              choose: {
                prompt: md`How do you get the distance from a speed that changes over time?`,
                options: [md`Area under the speed–time graph`, md`Top speed times time`, md`Slope of the speed–time graph`],
                answer: 0,
                explain: md`Distance is the integral of speed. Top speed times time overestimates, because the character was slower at the start; the slope of the speed graph is the acceleration.`,
              },
            },
            { md: md`Stopping is the same with friction $f$ in place of $a$: $t_{\text{stop}} = v_{\max}/f$ and $d_{\text{stop}} = v_{\max}^2/(2f)$. The stopping distance is the slide the player sees after releasing the stick.` },
          ],
          takeaway: md`Tune with these in mind. For a responsive character, aim for $t_{\text{top}}$ around 0.05–0.15 s and a stopping slide of a few pixels. Larger values feel heavy or slippery, which is right for ice or a heavily armoured character.`,
        },
        { kind: 'code', file: 'scripts/player.gd', code: PLAYER_V2, note: md`\`## comments\` after \`@export\` variables show up as tooltips in the Inspector. Because the values are exported, you can tune them in the Inspector while the game runs (**Debug → Synchronize Script Changes** keeps edits live).` },
        {
          kind: 'viz',
          viz: { type: 'core.topdown', mode: 'accel' },
          task: md`Try \`acceleration\` 300, then 4000. Then set friction to 150 and walk into a wall and let go. Find values where turning around feels quick but not twitchy, and copy the script with your numbers.`,
          caption: md`The yellow graph is speed over the last three seconds; the faint line is \`max_speed\`. The readout shows $t_{\text{top}} = v_{\max}/a$ and $d_{\text{stop}} = v_{\max}^2/2f$ for the current values. Walls stop the velocity component that points into them, which is the "slide" in \`move_and_slide\`.`,
        },
        {
          kind: 'numeric',
          q: md`With \`max_speed = 90\` and \`acceleration = 600\`, how long (in seconds) does it take to reach top speed from rest, and how many pixels does the character cover meanwhile? Enter both, time first.`,
          answer: { kind: 'vector', value: [0.15, 6.75] },
          inputHint: 'e.g. 0.15, 6.75',
          explain: md`$t = 90/600 = 0.15$ s and $d = 90^2/(2 \cdot 600) = 8100/1200 = 6.75$ px.`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'Tune by feel, then write the numbers down',
          md: md`Play with a gamepad and a keyboard, at 60 and at 144 Hz if you can. Tune top speed first (does crossing a room take a pleasant amount of time?), then acceleration (does the first step feel immediate?), then friction (does stopping on a ledge feel safe?). When something feels right, record the values and the reason. Later systems (dash, knockback, ice) build on these numbers, and you will want to know why they are what they are.`,
        },
        {
          kind: 'text',
          md: md`### Facing and animation

The character should face the way the player last pushed the stick, and keep facing that way when standing still. With three sprite directions (down, up and a right-facing side view) the rule is: compare the horizontal and vertical parts of the input, use the larger one, and flip the side sprite for left. The animation state comes from the *velocity*, not the input, so the walk keeps playing while the character decelerates and stops exactly when it does.`,
        },
        {
          kind: 'check',
          q: md`The player holds left and up equally, an exact diagonal. With the rule \`if absf(input.x) > absf(input.y)\` from the listing below, which way does Kai face?`,
          options: [md`Up, because the comparison is strict and a tie falls through to the vertical branch`, md`Left (side sprite, flipped)`, md`Whichever direction was pressed first`, md`Down`],
          answer: 0,
          explain: md`For an exact diagonal $|x| = |y|$, so \`>\` is false and the code chooses between up and down; $y < 0$ gives up. Many games prefer the side sprite on diagonals because it shows more of the character's motion: use \`>=\` for that. Pick one deliberately, because diagonals are common on keyboards.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'c02-1-build',
            title: 'Make Kai walk',
            goal: md`Extend your player script so that Kai accelerates, stops, faces the right way and animates. Use the \`@onready\` variable to reach the \`AnimatedSprite2D\`.`,
            requirements: [
              md`Moving diagonally is no faster than moving straight.`,
              md`Kai speeds up and slows down smoothly, and the values can be tuned in the Inspector.`,
              md`While moving he plays \`walk_down\`, \`walk_up\` or \`walk_side\`, flipped when walking left.`,
              md`When he stops he plays the idle animation for the direction he last faced.`,
              md`Walking into a wall stops him without jitter, and walking along it slides.`,
            ],
            hints: [
              md`Keep a \`facing\` variable outside \`_physics_process\` so it survives between frames, and only change it when the input is not zero.`,
              md`\`sprite.play(name)\` restarts nothing if the animation is already playing, but checking \`sprite.animation != name\` first makes the intent obvious and avoids surprises with non-looping animations later.`,
              md`If he jitters against walls, make sure the collision shape is a rectangle at the feet and that you call \`move_and_slide()\` exactly once per physics frame.`,
            ],
            solution: [{ file: 'scripts/player.gd', code: PLAYER_FULL }],
            explain: md`\`class_name Player\` registers the script as a global type, so other scripts can write \`if body is Player\`. The facing logic reads *input* (the player's intention) and the animation logic reads *velocity* (what actually happens), which keeps the walk cycle in step with the motion during acceleration and friction.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'c02-1-paper',
            title: 'Tuning from a spec',
            type: 'compute',
            difficulty: 1,
            minutes: 6,
            statement: md`A designer asks for a top speed of 96 px/s, reached in 0.08 s from rest, and a stopping slide of at most 4 px. Find the acceleration and the smallest friction that meet the spec. Enter $[a, f]$ in px/s².`,
            hints: [md`$t_{\text{top}} = v_{\max}/a$ and $d_{\text{stop}} = v_{\max}^2/(2f)$.`],
            solution: [
              md`Acceleration: $a = v_{\max}/t_{\text{top}} = 96/0.08 = 1200$ px/s².`,
              md`Stopping slide: $v_{\max}^2/(2f) \le 4 \iff f \ge 96^2/8 = 9216/8 = 1152$ px/s².`,
              md`So $a = 1200$ and any $f \ge 1152$ works; the smallest is 1152. In practice you might round both to 1200.`,
            ],
            answer: { kind: 'vector', value: [1200, 1152] },
          },
        },
        {
          kind: 'recall',
          prompt: md`What does \`move_and_slide()\` need from you, what does it do, and how often should it be called?`,
          answer: md`You set \`velocity\` (px/s) first. It moves the body by velocity × delta, resolves collisions, slides along surfaces and removes the blocked part of \`velocity\`. Call it once per \`_physics_process\`.`,
        },
        {
          kind: 'explain',
          prompt: md`Why are acceleration and friction two separate parameters instead of one "responsiveness" value?`,
          model: md`They control different moments: acceleration is how the first step after pressing feels, friction is how the stop after releasing feels. Players are much more sensitive to unwanted sliding than to a slightly soft start, so games often stop faster than they start. Separate values also make special surfaces easy: ice keeps acceleration but lowers friction; mud lowers both. Even the turnaround, which mixes both, behaves better when each can be tuned on its own.`,
        },
      ],
      cards: [
        { id: 'c02-1-c1', kind: 'concept', front: md`Why does movement need \`Input.get_vector\` (or normalization)?`, back: md`Raw axes give $(\pm1, \pm1)$ on diagonals, length $\sqrt2$, so diagonal movement is 41% faster. \`get_vector\` limits the input to length 1.` },
        { id: 'c02-1-c2', kind: 'cloze', text: md`\`velocity = velocity.{{}}(input * max_speed, rate * delta)\` moves the velocity toward the target by at most rate × delta.`, answers: ['move_toward'] },
        { id: 'c02-1-c3', kind: 'compute', front: md`$v_{\max} = 80$ px/s, acceleration 800 px/s². Time to top speed in seconds?`, answer: { kind: 'number', value: 0.1 }, back: md`$t = v_{\max}/a = 80/800 = 0.1$ s.` },
        { id: 'c02-1-c4', kind: 'compute', front: md`$v_{\max} = 100$ px/s, friction 1000 px/s². Stopping distance in px?`, answer: { kind: 'number', value: 5 }, back: md`$v^2/(2f) = 10000/2000 = 5$ px.` },
        { id: 'c02-1-c5', kind: 'concept', front: md`Which should drive the walk/idle animation choice, input or velocity, and why?`, back: md`Velocity: it reflects what the body actually does, so the walk keeps playing while decelerating and stops exactly when the character stops. Facing uses input, so you can turn on the spot.` },
      ],
    },
    LESSON_DASH,
    LESSON_FEEL,
  ],
  problems: [
    {
      id: 'c02-p1',
      title: 'Diagonal speed',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`A character uses unnormalized input with \`max_speed = 75\`. How much faster, in px/s, does it move diagonally than horizontally?`,
      solution: [md`Diagonal speed is $75\sqrt2 \approx 106.07$ px/s.`, md`The difference is $75(\sqrt2 - 1) \approx 31.07$ px/s.`],
      answer: { kind: 'number', value: 75 * (Math.SQRT2 - 1) },
    },
    {
      id: 'c02-p2',
      title: 'Frame-rate independence',
      type: 'concept',
      difficulty: 1,
      minutes: 5,
      statement: md`A script does \`velocity = velocity.move_toward(target, 15.0)\` every physics frame. Explain what changes if the physics tick rate is raised from 60 to 120 Hz, and fix the line.`,
      solution: [md`The step of 15 px/s happens per frame, so at 60 Hz the velocity changes by $15 \cdot 60 = 900$ px/s², and at 120 Hz by 1800 px/s². The character feels twice as responsive on the faster tick.`, md`Multiply by \`delta\`: \`velocity.move_toward(target, acceleration * delta)\` with \`acceleration = 900.0\`. Now the change per second is the same at any tick rate.`],
      rubric: [md`Identifies that the rate is per frame, not per second`, md`Computes the effective acceleration at both rates`, md`Fixes it with \`* delta\` and a per-second constant`],
    },
    {
      id: 'c02-p3',
      title: 'Turning around',
      type: 'compute',
      difficulty: 2,
      minutes: 8,
      statement: md`A character moves right at $v_{\max} = 90$ px/s and the player instantly pushes left. With the lesson's controller (rate = acceleration = 900 px/s² while input is held), how long does it take to reach full speed to the left?`,
      hints: [md`The target is $-90$; the velocity must change by 180 px/s.`],
      solution: [md`While input is held the rate is the acceleration, applied along the line from the current velocity to the target.`, md`The velocity has to change from $+90$ to $-90$, a change of 180 px/s, at 900 px/s².`, md`$t = 180/900 = 0.2$ s. A turnaround takes twice as long as starting from rest, which is why some games use a larger "turn" acceleration when the input opposes the velocity.`],
      answer: { kind: 'number', value: 0.2 },
    },
    {
      id: 'c02-p4',
      title: 'Feet collision box',
      type: 'design',
      difficulty: 1,
      minutes: 5,
      statement: md`Explain why a top-down character's collision shape covers only the feet (for example 10×6 px) rather than the whole 16×24 sprite. Describe one bug the full-body box would cause.`,
      solution: [md`In a 3/4 top-down view the sprite's upper body is drawn "in front of" things behind the character, and the ground plane is where the feet are. Collision should model what the character occupies on the ground.`, md`With a full-body box the character could not walk close to the bottom edge of a wall or behind a tree trunk: the head would hit the wall above it, and the character would stop well before the art suggests it should, which reads as an invisible wall.`],
      rubric: [md`Connects collision to the ground plane / feet`, md`Gives a concrete bug (stopping short of walls, cannot pass behind objects)`],
    },
    {
      id: 'c02-p5',
      title: 'Ice',
      type: 'compute',
      difficulty: 2,
      minutes: 6,
      statement: md`On ice the designer wants the stopping slide to be 36 px from a top speed of 90 px/s. What friction should the ice use, in px/s²?`,
      solution: [md`$d = v^2/(2f) \Rightarrow f = v^2/(2d) = 8100/72$.`, md`$f = 112.5$ px/s².`],
      answer: { kind: 'number', value: 112.5 },
    },
    {
      id: 'c02-p6',
      title: 'Which line is wrong?',
      type: 'debug',
      difficulty: 2,
      minutes: 6,
      statement: md`This controller works, but the character sometimes plays \`idle_side\` facing the wrong way after stopping. Find the bug.

\`\`\`gdscript
func _physics_process(delta: float) -> void:
	var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	velocity = velocity.move_toward(input * max_speed, acceleration * delta)
	move_and_slide()
	sprite.flip_h = velocity.x < 0.0
	sprite.play(("walk_" if velocity.length() > 5.0 else "idle_") + facing)
\`\`\``,
      hints: [md`What is \`velocity.x\` once the character has stopped?`],
      solution: [md`\`flip_h\` is set from \`velocity.x\` every frame. When the character stops, \`velocity.x\` becomes 0, the condition is false, and the side sprite flips back to facing right even if the character was walking left.`, md`Set \`flip_h\` only when there is horizontal input (or horizontal velocity), and leave it unchanged otherwise, as in the lesson's \`_update_facing\`.`],
      rubric: [md`Identifies the flip reset when velocity reaches zero`, md`Fix only updates the flip when moving horizontally`],
    },
    {
      id: 'c02-p7',
      title: 'Is dash-spamming faster than walking?',
      type: 'compute',
      difficulty: 2,
      minutes: 6,
      statement: md`A dash covers 40 px in 10 frames and has a 0.3 s cooldown. A player chains dashes as fast as the cooldown allows. What is the average speed in px/s, ignoring the walking done during the cooldown? Compare it with \`max_speed = 90\`.`,
      hints: [md`One cycle is the dash time plus the cooldown.`],
      solution: [
        md`One cycle lasts $10/60 + 0.3 \approx 0.4667$ s and covers 40 px.`,
        md`Average: $40/0.4667 \approx 85.7$ px/s, slower than walking at 90 px/s. Walking during the cooldown adds distance, but the dash alone is not a faster way to travel.`,
        md`That is usually what a designer wants: the dash is for dodging and crossing gaps, and spamming it should not replace walking. To make dashing a travel tool, shorten the cooldown.`,
      ],
      answer: { kind: 'number', value: 40 / (10 / 60 + 0.3) },
    },
    {
      id: 'c02-p8',
      title: 'One press, two dashes',
      type: 'debug',
      difficulty: 2,
      minutes: 8,
      statement: md`A teammate sets \`dash_cooldown = 0.0\` and \`buffer_time = 0.2\` and reports that one tap of dodge sometimes produces two dashes back to back. Their start function is below. Find the bug and explain why it only shows with these values.

\`\`\`gdscript
func _start_dash(input: Vector2) -> void:
    _dash_direction = input.normalized() if input != Vector2.ZERO else _facing_vector()
    _dash_frames_left = dash_frames
    _iframes_left = iframe_frames
\`\`\``,
      hints: [md`How old is the press when a 10-frame dash ends?`],
      solution: [
        md`The press is never consumed: \`_since_dodge_press\` keeps counting up from the press.`,
        md`When the 10-frame dash ends the press is $10/60 \approx 0.167$ s old. With \`buffer_time = 0.2\` that is still inside the window, and with no cooldown the same press starts a second dash.`,
        md`With the defaults (cooldown 0.3 s, buffer 0.12 s) the press is too old by the time a dash is allowed, which hid the bug. Fix: set \`_since_dodge_press = INF\` at the start of \`_start_dash\`.`,
      ],
      rubric: [md`Identifies that the buffered press is not consumed`, md`Explains the timing: 0.167 s < 0.2 s with no cooldown`, md`Fixes it by clearing the stored press when the dash starts`],
    },
    {
      id: 'c02-p9',
      title: 'Designing the combat dodge',
      type: 'design',
      difficulty: 3,
      minutes: 12,
      statement: md`In Shardbound's battles the same dash is the dodge. Enemies telegraph attacks, and the design document wants a reward for a well-timed dodge (for example a small ATB gain). Propose the frame data (dash frames, i-frame window and where it starts, cooldown, buffer) and explain how the code detects a "perfect" dodge. Say what you would measure in a playtest.`,
      solution: [
        md`Frame data, as a starting point: 10 dash frames (167 ms), i-frames on frames 1–8 so a late dodge still gets clipped by the end of an attack, 0.25–0.3 s cooldown so dodging cannot be held down through a combo, 0.12 s buffer so a dodge pressed during an attack's recovery comes out at the first legal frame.`,
        md`Detection: keep the i-frame *flag* (do not disable the hurtbox). When the hurtbox reports an overlap with an enemy hitbox while \`is_invincible()\` is true, the hit was avoided by the dodge; if it happened in the first few i-frames, the dodge was close to the hit and counts as perfect. Emit a signal (\`Events.perfect_dodge\`) and grant the ATB there.`,
        md`Playtest measures: how often players get hit at the end of a dash (i-frames too short), how often perfect dodges happen by accident (window too generous), and whether players dodge in place of guarding everything (cooldown too short).`,
      ],
      rubric: [md`Gives concrete frame counts with reasons`, md`Uses the flag approach so overlaps are still reported`, md`Defines "perfect" in terms of the overlap timing`, md`Names measurable playtest outcomes`],
      areas: ['feel', 'combat'],
    },
    {
      id: 'c02-p10',
      title: 'First pixel',
      type: 'compute',
      difficulty: 2,
      minutes: 5,
      statement: md`A floaty character uses \`acceleration = 500\` px/s². Starting from rest at 60 Hz, on which physics frame after the press does it first move a whole pixel? Use $x_k = a\,k(k+1)/7200$.`,
      solution: [md`Need $k(k+1) \ge 7200/500 = 14.4$.`, md`$3 \cdot 4 = 12 < 14.4$ and $4 \cdot 5 = 20 \ge 14.4$, so frame 4, about 67 ms after the press, which players will notice as sluggish.`],
      answer: { kind: 'number', value: 4 },
    },
  ],
};
