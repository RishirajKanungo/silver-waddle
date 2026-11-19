import { md, gd, type Module } from '../types';

// ------------------------------------------------------------------------------------ k01-1 listings
const ATTACK_DATA = gd`
class_name AttackData
extends Resource
## One attack in a string: what the player may do, and when. What the attack itself does (sprite
## frames, when the hitbox is on, the swing sound) is keyed in its AnimationPlayer animation.

## The AnimationPlayer animation for this attack, e.g. "attack_1".
@export var animation: StringName = &"attack_1"
## From this frame on, a buffered attack press starts the next attack in the string.
@export var cancel_frame := 10
## From this frame on, a dodge press interrupts the attack.
@export var dodge_cancel_frame := 8
@export var damage := 4
## Speed given to the target, px/s, along the attacker's facing.
@export var knockback := 80.0
## Forward speed at the start of the swing, px/s. Friction removes it within a few frames.
@export var lunge := 60.0
`;

const ATTACK_COMBO = gd`
class_name AttackState
extends State
## A string of attacks. Each step's AnimationPlayer animation keys the sprite frame and the hitbox
## on exact frames; this state counts frames to decide when the next step, a dodge or Idle may start.

@export var combo: Array[AttackData] = []
@export var hitbox: Hitbox
@export var animation_player: AnimationPlayer

var _step := 0
var _frame := 0
var _length := 0


func enter() -> void:
    _start_step(0)


func exit() -> void:
    animation_player.stop()
    hitbox.set_active(false)  # an interrupted swing must not leave its hitbox on


func physics_update(delta: float) -> void:
    _frame += 1
    var data := combo[_step]
    var intent := character.intent
    character.velocity = character.velocity.move_toward(Vector2.ZERO, character.friction * delta)
    character.move_and_slide()
    if _frame >= data.cancel_frame and intent.wants_attack and _step + 1 < combo.size():
        _start_step(_step + 1)
        return
    if _frame >= data.dodge_cancel_frame and intent.wants_dodge:
        state_machine.transition_to("Dash")
        return
    if _frame >= _length:
        state_machine.transition_to("Idle")


func _start_step(step: int) -> void:
    _step = step
    _frame = 0
    var data := combo[step]
    character.intent.wants_attack = false
    character.face(character.intent.move)  # the stick may re-aim each hit
    (hitbox.get_parent() as Node2D).rotation = character.facing_vector.angle()
    hitbox.damage = data.damage
    hitbox.knockback_speed = data.knockback
    hitbox.prepare(character, character.facing_vector)
    character.velocity = character.facing_vector * data.lunge
    # Pick attack_side/up/down, then stop it: the AnimationPlayer keys its frame from here on.
    character.play_anim("attack")
    character.sprite.pause()
    animation_player.stop()  # play() would not restart an animation that is already playing
    animation_player.play(data.animation)
    _length = roundi(animation_player.current_animation_length * 60.0)
`;

// ------------------------------------------------------------------------------------ k01-2 listings
const EVENTS_ADD = gd`
## A hit connected. HitFeedback turns it into hitstop, shake, sparks, numbers and sound.
signal hit_landed(hit: HitData, target: Node2D)
`;

const HITSTOP_FRAGMENT = gd`
var _hitstop_id := 0


## Freeze this character (script, states, sprite, AnimationPlayer) for duration seconds of real time.
func hitstop(duration: float) -> void:
    _hitstop_id += 1
    var id := _hitstop_id
    process_mode = Node.PROCESS_MODE_DISABLED
    await get_tree().create_timer(duration, true, false, true).timeout
    if id == _hitstop_id:  # a newer hitstop started meanwhile: let that one end the freeze
        process_mode = Node.PROCESS_MODE_INHERIT
`;

const SHAKE_CAMERA = gd`
class_name ShakeCamera
extends Camera2D
## A camera that shakes by trauma: hits add trauma, trauma decays, and the offset grows with trauma².

## Offset in pixels at full trauma.
@export var max_offset := Vector2(6.0, 4.0)
## Trauma lost per second. 1.5 clears a full shake in about 0.67 s.
@export var decay := 1.5
## Noise samples per second: higher is a faster rattle.
@export var frequency := 30.0

var trauma := 0.0
var _noise := FastNoiseLite.new()
var _time := 0.0


func _ready() -> void:
    _noise.frequency = 1.0  # one noise feature per unit, so _time * frequency sets the speed


func add_trauma(amount: float) -> void:
    trauma = minf(trauma + amount, 1.0)


func _process(delta: float) -> void:
    _time += delta
    trauma = maxf(trauma - decay * delta, 0.0)
    var shake := trauma * trauma
    # Two rows of the same noise give two independent smooth wobbles, roughly in -1..1.
    var wobble := Vector2(_noise.get_noise_2d(_time * frequency, 0.0), _noise.get_noise_2d(_time * frequency, 100.0))
    # Round: in a pixel-art game the world should move by whole pixels.
    offset = (wobble * max_offset * shake).round()
`;

const HIT_FEEDBACK_V1 = gd`
class_name HitFeedback
extends Node
## Turns every landed hit into hitstop and screen shake (k01-3 adds sparks, numbers and sound).
## One per level. Hits arrive through the Events bus, so attackers and targets need no wiring.

@export var camera: ShakeCamera
## Hits of at least this amount are heavy: a longer freeze and more shake.
@export var heavy_amount := 8
@export var light_hitstop_frames := 4
@export var heavy_hitstop_frames := 7


func _ready() -> void:
    Events.hit_landed.connect(_on_hit_landed)


func _on_hit_landed(hit: HitData, target: Node2D) -> void:
    var heavy := hit.amount >= heavy_amount
    var frames := heavy_hitstop_frames if heavy else light_hitstop_frames
    var duration := frames / 60.0
    # Freeze both sides of the hit; everything else (other enemies, the camera) keeps moving.
    if target is Character:
        (target as Character).hitstop(duration)
    if hit.source is Character:
        (hit.source as Character).hitstop(duration)
    if camera:
        camera.add_trauma(0.45 if heavy else 0.2)
`;

const CHARACTER_K01 = gd`
class_name Character
extends CharacterBody2D
## Anything that moves and fights. Reads its intent; a controller child writes it.
## k01 adds hitstop, the hit flash and the hit_landed event.

@export var max_speed := 90.0
@export var acceleration := 900.0
@export var friction := 1200.0

var intent := Intent.new()
var facing := "down"
var facing_vector := Vector2.DOWN
var _hitstop_id := 0
var _flash_tween: Tween

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


## Freeze this character (script, states, sprite, AnimationPlayer) for duration seconds of real time.
func hitstop(duration: float) -> void:
    _hitstop_id += 1
    var id := _hitstop_id
    process_mode = Node.PROCESS_MODE_DISABLED
    await get_tree().create_timer(duration, true, false, true).timeout
    if id == _hitstop_id:
        process_mode = Node.PROCESS_MODE_INHERIT


## Flash the sprite white and fade back. Needs the hit_flash shader on the sprite's material.
func flash(duration := 0.12) -> void:
    var mat := sprite.material as ShaderMaterial
    if mat == null:
        return
    if _flash_tween:
        _flash_tween.kill()  # restart cleanly when hits come faster than the fade
    mat.set_shader_parameter("flash", 1.0)
    _flash_tween = create_tween()
    _flash_tween.tween_property(mat, "shader_parameter/flash", 0.0, duration)


func _on_hurt(hit: HitData) -> void:
    health.damage(hit.amount)
    flash()
    Events.hit_landed.emit(hit, self)
    if health.health <= 0:
        return
    velocity = hit.knockback
    state_machine.transition_to("Hurt")


func _on_died() -> void:
    state_machine.transition_to("Dead")
`;

const HURT_K01 = gd`
extends State
## Knocked back and out of control for a moment. Character._on_hurt set the velocity already.
## The slide is v² / (2 * knockback_friction): 180 px/s and 900 px/s² slide 18 px.

@export var duration := 0.25
@export var knockback_friction := 900.0

var _time := 0.0


func enter() -> void:
    _time = 0.0
    character.play_anim("hurt")


func physics_update(delta: float) -> void:
    _time += delta
    character.velocity = character.velocity.move_toward(Vector2.ZERO, knockback_friction * delta)
    character.move_and_slide()
    # Never leave Hurt while still sliding: the next state would apply walking friction instead.
    if _time >= duration and character.velocity == Vector2.ZERO:
        state_machine.transition_to("Idle")
`;

// ------------------------------------------------------------------------------------ k01-3 listings
const FLASH_SHADER = String.raw`shader_type canvas_item;

// 0 = the sprite's own colours, 1 = solid flash colour. Character.flash() tweens it back to 0.
uniform float flash : hint_range(0.0, 1.0) = 0.0;
uniform vec4 flash_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);

void fragment() {
	// COLOR arrives holding the node's modulate; multiply so modulate still works.
	vec4 tex = texture(TEXTURE, UV) * COLOR;
	// Keep the alpha: the silhouette flashes, not the whole frame rectangle.
	COLOR = vec4(mix(tex.rgb, flash_color.rgb, flash), tex.a);
}
`;

const HIT_SPARK = gd`
extends AnimatedSprite2D
## A one-shot spark (fx_hit) at the point of contact. Untick Loop on its "play" animation.


func _ready() -> void:
    animation_finished.connect(queue_free)
    play("play")
`;

const DAMAGE_NUMBER = gd`
class_name DamageNumber
extends Label
## A number that pops out of a hit, rises 14 px with ease-out and fades. Spawned by HitFeedback.
## In the scene: custom_minimum_size (32, 10), horizontal_alignment Center, the pixel font, an outline.


func pop(amount: int, at: Vector2, heavy: bool) -> void:
    text = str(amount)
    if heavy:
        modulate = Color(1.0, 0.94, 0.6)  # pale gold for heavy hits
    position = at - Vector2(16.0, 10.0)  # centre the 32 px wide label on the point
    var tween := create_tween()
    tween.tween_property(self, "position:y", position.y - 14.0, 0.45).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
    tween.parallel().tween_property(self, "modulate:a", 0.0, 0.15).set_delay(0.35)
    tween.tween_callback(queue_free)
`;

const HIT_FEEDBACK = gd`
class_name HitFeedback
extends Node
## Turns every landed hit into hitstop, shake, a spark, a number and layered sound. One per level.

@export var camera: ShakeCamera
@export var spark_scene: PackedScene
@export var number_scene: PackedScene
@export var hit_sound: AudioStream
@export var crit_sound: AudioStream
@export var heavy_amount := 8
@export var light_hitstop_frames := 4
@export var heavy_hitstop_frames := 7


func _ready() -> void:
    Events.hit_landed.connect(_on_hit_landed)


func _on_hit_landed(hit: HitData, target: Node2D) -> void:
    var heavy := hit.amount >= heavy_amount
    var frames := heavy_hitstop_frames if heavy else light_hitstop_frames
    var duration := frames / 60.0
    if target is Character:
        (target as Character).hitstop(duration)
    if hit.source is Character:
        (hit.source as Character).hitstop(duration)
    if camera:
        camera.add_trauma(0.45 if heavy else 0.2)

    # Where the blade met the body: a third of the way from the target's chest to the attacker.
    var at := target.global_position + Vector2(0.0, -12.0)
    if hit.source is Node2D:
        at = at.lerp((hit.source as Node2D).global_position + Vector2(0.0, -12.0), 0.3)
    _spawn_spark(at)
    _spawn_number(hit.amount, at + Vector2(0.0, -8.0), heavy)
    # Layer: every hit gets the hit sound with a little pitch variation; heavy hits add the crit.
    _play(hit_sound, randf_range(0.94, 1.06))
    if heavy:
        _play(crit_sound, 1.0)


func _spawn_spark(at: Vector2) -> void:
    if spark_scene == null:
        return
    var spark := spark_scene.instantiate() as Node2D
    # Add to the level, not to the target: a freed or frozen target must not take the spark with it.
    get_tree().current_scene.add_child(spark)
    spark.global_position = at


func _spawn_number(amount: int, at: Vector2, heavy: bool) -> void:
    if number_scene == null:
        return
    var number := number_scene.instantiate() as DamageNumber
    get_tree().current_scene.add_child(number)
    number.pop(amount, at, heavy)


func _play(stream: AudioStream, pitch: float) -> void:
    if stream == null:
        return
    var player := AudioStreamPlayer.new()
    player.stream = stream
    player.pitch_scale = pitch
    player.finished.connect(player.queue_free)
    add_child(player)
    player.play()
`;

export const MODULE: Module = {
  id: 'k01',
  part: 'combat',
  order: 1,
  title: 'Hits that feel heavy',
  summary: 'Attack strings described by frame data, hitboxes keyed on exact frames, and the feedback that makes a hit land: hitstop, trauma-based screen shake, knockback, a hit-flash shader, sparks, damage numbers and layered sound.',
  relevance: md`Kai's sword string is the thing a Shardbound player does most in a fight, and in the hybrid battle system each landed hit also fills the ATB gauge (k04), so hits must be readable and satisfying. This module turns c05's single swing into a three-hit string with exact frame data and builds the \`HitFeedback\` node that every later attack, spell and enemy hit goes through. The golem's slam, Bram's shield bash and Lyra's fireball all reuse it.`,
  prereqs: ['c05', 'm03'],
  areas: ['feel', 'combat', 'godot'],
  lessons: [
    // =============================================================================== k01-1
    {
      id: 'k01-1',
      title: 'Attack strings and frame data',
      minutes: 45,
      objectives: [
        'Describe an attack by its startup, active and recovery frames and convert frames to milliseconds at 60 fps.',
        'Key a hitbox on exact frames with an AnimationPlayer that runs in physics mode.',
        'Chain three attacks with cancel frames and a buffered combo input window.',
        'Trace a HitData from the attacker\'s Hitbox to the target\'s HealthComponent.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Watch any action game's basic attack frame by frame and the swing has three parts. First the character pulls the weapon back: nothing can be hit yet, but the player sees what is coming. Then the blade sweeps through: for a few frames, anything in its path is hit. Then the character follows through and recovers: the swing is over, but the character is still committed and cannot act. Animators call these anticipation, action and follow-through. Fighting-game players call them **startup**, **active** and **recovery**, and count them in frames.

Those three numbers decide how an attack feels. Short startup feels responsive; long startup feels heavy and is easy to see coming. Long recovery makes a miss costly. Kai's three-hit string uses all of it: two quick slashes, then a slow finisher that hits hard and leaves him open.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Frame data',
          md: md`At 60 physics ticks per second one **frame** is $1/60$ s $\approx 16.7$ ms. An attack's **startup** is the number of frames before its hitbox turns on, **active** is how many frames the hitbox is on, and **recovery** is the frames after it turns off until the character can act again. Their sum is the attack's total length. A **cancel window** is a range of frames during which another action may interrupt the attack early; the **combo input window** is when an attack press is accepted to continue the string.`,
        },
        {
          kind: 'assets',
          ids: ['hero', 'skeleton', 'fx_slash', 'sfx_swing'],
          note: md`Kai's \`attack_side\`, \`attack_up\` and \`attack_down\` have four frames each: wind-up, strike (with a smear), follow-through and recover. That maps directly onto startup (frame 0), active (frame 1) and recovery (frames 2 and 3).`,
        },
        {
          kind: 'viz',
          viz: { type: 'combat.frame' },
          task: md`Pick **hit 1** and press play. Then scrub frame by frame and find the frame where the hitbox turns on. Switch to **hit 3** and compare the startup and recovery. Finally drag *startup* to 2 and *recovery* to 6: how many attacks per second could Kai now throw?`,
          caption: md`Top: Kai at the selected frame, with the hitbox drawn when it is active. Middle: one cell per frame. Bottom: the AnimationPlayer keys that produce it, with their times in seconds, which is what you type into Godot.`,
        },
        {
          kind: 'derive',
          title: 'from frames to time',
          goal: md`Kai's first slash has startup 5, active 3, recovery 14 frames. Find its length in milliseconds, when the hitbox turns on, and how many slashes per second a player could throw by repeating it.`,
          steps: [
            {
              md: md`Total frames: $5 + 3 + 14 = 22$. One frame is $1000/60 \approx 16.67$ ms, so the slash lasts $22 \times 16.67 \approx 367$ ms.`,
              choose: {
                prompt: md`How many milliseconds is one frame at 60 fps?`,
                options: [md`$1000/60 \approx 16.67$`, md`$60/1000 = 0.06$`, md`$1/60 \approx 0.0167$`],
                answer: 0,
                explain: md`$1/60$ s is $0.0167$ s, which is $16.67$ ms.`,
              },
            },
            {
              md: md`Frames are counted from 0. Startup is frames 0 to 4, so the hitbox turns on **at frame 5**, which is time $5/60 \approx 0.0833$ s. It is on for frames 5, 6 and 7 and turns off at frame 8 ($8/60 \approx 0.1333$ s). These are the times you key in the AnimationPlayer.`,
            },
            {
              md: md`Repeating the slash from the start: one every 22 frames, so $60/22 \approx 2.73$ slashes per second. The number that matters for damage is the rate, so a string that cancels into the next hit at frame 10 instead of waiting 22 frames almost doubles the rate.`,
              choose: {
                prompt: md`A slash that can be cancelled into the next one at frame 10 repeats every...`,
                options: [md`10 frames: 6 per second`, md`22 frames: 2.73 per second`, md`32 frames`],
                answer: 0,
                explain: md`The next attack starts at frame 10 of the current one, so a new attack begins every 10 frames.`,
              },
            },
          ],
          takeaway: md`Time in seconds is frames $/60$; in milliseconds, frames $\times 16.67$. Key the hitbox at startup$/60$ and (startup + active)$/60$ seconds.`,
        },
        {
          kind: 'numeric',
          q: md`The finisher has startup 9, active 4, recovery 24. How long is it in milliseconds, and at what time in seconds does its hitbox turn on? Enter both.`,
          answer: { kind: 'vector', value: [616.67, 0.15], tol: 1e-3 },
          inputHint: 'ms, seconds',
          explain: md`$9 + 4 + 24 = 37$ frames, $37 \times 1000/60 \approx 616.7$ ms. The hitbox turns on at frame 9: $9/60 = 0.15$ s.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'AnimationPlayer as the source of truth for an attack',
          md: md`An \`AnimationPlayer\` can key *any* property of any node below its root, not just sprites. For an attack, one animation keys \`AnimatedSprite2D:frame\` (which art frame shows), \`HitboxPivot/Hitbox/CollisionShape2D:disabled\` (when the hitbox is live), and an Audio track for \`sfx_swing\`. All three then line up by construction, which is hard to guarantee with separate timers in code. Set the AnimationPlayer's **Callback Mode → Process** to **Physics** in the Inspector so it advances in the same 60 Hz ticks as the state that counts frames; in the default *Idle* mode it advances with the rendered frame rate, and on a 144 Hz monitor the hitbox would switch between physics ticks.`,
        },
        {
          kind: 'steps',
          title: 'Key the first slash',
          steps: [
            md`In \`player.tscn\`, add an \`AnimationPlayer\` as a child of Kai. In the Inspector set **Callback Mode → Process** to *Physics*.`,
            md`Open the **Animation** panel at the bottom, click **Animation → New** and name it \`attack_1\`. Set its length (the clock field at the right of the panel) to $22/60 = 0.3667$ s and its step (the snap field at the bottom) to $1/60 \approx 0.0167$ s, so the timeline snaps to frames.`,
            md`Select \`AnimatedSprite2D\`, set its *Animation* to \`attack_side\`, and click the key icon next to *Frame* in the Inspector at times 0 (frame 0), 0.0833 (frame 1), 0.1333 (frame 2) and 0.25 (frame 3). Godot creates the \`AnimatedSprite2D:frame\` track the first time.`,
            md`Select \`HitboxPivot/Hitbox/CollisionShape2D\`. Key *Disabled* = on at 0, off at 0.0833 and on at 0.1333. Bool tracks are discrete: the value jumps at the key.`,
            md`Add an **Audio Playback Track** (the **+ Add Track** menu) targeting an \`AudioStreamPlayer2D\` child of Kai, and drop \`sfx_swing.wav\` on it at 0.0667, one frame before the hitbox turns on, so the sound leads the hit very slightly.`,
            md`Duplicate the animation twice (**Animation → Duplicate**) as \`attack_2\` (length $24/60 = 0.4$ s, hitbox on 0.1 to 0.15) and \`attack_3\` (length $37/60 \approx 0.6167$ s, hitbox on 0.15 to 0.2167), and move the keys.`,
          ],
          result: md`Scrubbing the timeline in the editor moves the sprite through its four frames and greys the hitbox shape out except during the active frames (with **Debug → Visible Collision Shapes** the same happens in the running game).`,
          troubleshoot: [
            { problem: md`The *Frame* key icon does nothing, or the keyed frames show the wrong direction.`, fix: md`The track keys only the frame index. The Attack state chooses \`attack_side\`, \`attack_up\` or \`attack_down\` from the facing before the AnimationPlayer starts, and pauses the sprite's own playback.` },
            { problem: md`The hitbox sometimes stays on after an attack is interrupted.`, fix: md`An interrupted animation stops wherever it was. \`exit()\` in the Attack state calls \`hitbox.set_active(false)\` for this reason.` },
          ],
        },
        { kind: 'code', file: 'scripts/resources/attack_data.gd', code: ATTACK_DATA, note: md`Create three resources in \`resources/attacks/\` (**FileSystem → New Resource → AttackData**): \`kai_1.tres\` (animation \`attack_1\`, cancel 10, dodge cancel 8, damage 4, knockback 80, lunge 60), \`kai_2.tres\` (\`attack_2\`, 11, 9, 5, 100, 60) and \`kai_3.tres\` (\`attack_3\`, cancel 99 so nothing follows, dodge cancel 13, damage 9, knockback 180, lunge 120).` },
        {
          kind: 'text',
          md: md`### Who owns which number?

There are two kinds of timing in an attack, and they live in different places on purpose:

- **What the attack does**: which art frame shows, when the hitbox is live, when the swing sound plays. These are keyed in the AnimationPlayer, where you can see and scrub them against the art.
- **What the player may do**: when the next hit may start, when a dodge may interrupt, when control returns. These are rules for the state machine, so they live in \`AttackData\` and the Attack state counts frames to apply them.

Keeping each number in exactly one place is what keeps them consistent. The total length is not stored at all: the state reads it from the animation.`,
        },
        { kind: 'code', file: 'scripts/states/attack.gd', code: ATTACK_COMBO, note: md`\`_frame\` counts physics ticks since the current hit started, so frame data in the resources means exactly what the figure shows. \`current_animation_length\` is in seconds; times 60 is the length in frames. The check order in \`physics_update\` is the priority: chaining the next hit beats dodging, which beats returning to Idle.` },
        {
          kind: 'viz',
          viz: { type: 'combat.hit', mode: 'frames' },
          task: md`Attack a few times with **J** and watch the frame meter under the game. Press **J** once, then three times at a steady rhythm, then three times as fast as you can, then three times slowly (about half a second apart). Which rhythm drops the string, and why does mashing still work?`,
          caption: md`The frame meter scrolls one column per physics tick: amber startup, red active, blue recovery, grey idle. A white tick marks each press; a gold mark is a connected hit. The bracket under the current hit shows its combo input window.`,
        },
        {
          kind: 'check',
          q: md`Hit 1 has \`cancel_frame = 10\` and a total of 22 frames; the controller buffers presses for 9 frames. The player presses attack on frame 2 of hit 1. What happens?`,
          options: [
            md`The press is buffered; on frame 10 its age is 8 frames, still within the buffer, so hit 2 starts on frame 10.`,
            md`The press is ignored because it came before \`cancel_frame\`.`,
            md`Hit 2 starts immediately on frame 2.`,
            md`The press restarts hit 1.`,
          ],
          answer: 0,
          explain: md`\`wants_attack\` stays true for up to 9 frames. The Attack state only reads it from frame 10, when the press is 8 frames old. A press on frame 0 would be 10 frames old at frame 10 and would have expired, so very early mashing can be dropped; in practice players press repeatedly and a later press catches the window.`,
        },
        {
          kind: 'numeric',
          q: md`With \`cancel_frame = 10\`, a total length of 22 frames and a 9-frame buffer, on how many different frames of hit 1 can a press be made and still produce hit 2? (A press on the last frame, 21, still counts; a press on frame 22 is read by Idle and starts a new string instead.)`,
          answer: { kind: 'number', value: 21 },
          explain: md`The earliest press that survives to frame 10 is on frame $10 - 9 = 1$. The latest is frame 21. Frames 1 to 21 inclusive is 21 frames, about 350 ms: a generous window, which is right for a basic string.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'k01-1-build',
            title: "Kai's three-hit string",
            goal: md`Replace c05's single swing with the \`attack.gd\` above, three AttackData resources and three keyed animations. Use the training dummy from c05-3 as the target.`,
            requirements: [
              md`Pressing attack three times in rhythm plays all three hits; the third knocks the dummy visibly farther than the first two.`,
              md`Pressing attack slowly (after the 22nd frame of a hit) restarts the string at hit 1.`,
              md`During the recovery of any hit, a dodge press interrupts it from that hit's \`dodge_cancel_frame\` on.`,
              md`Holding a direction between hits re-aims the next hit.`,
              md`The dummy's health bar drops by 4, 5 and 9.`,
            ],
            hints: [
              md`In the Inspector of the \`Attack\` node, add three elements to *Combo* and drag the three \`.tres\` files in; drag \`HitboxPivot/Hitbox\` and the \`AnimationPlayer\` into the other two exports.`,
              md`If the second hit never starts, print \`_frame\` and \`intent.wants_attack\` each tick: either the buffer expires before \`cancel_frame\` or the PlayerController is below the StateMachine in the tree.`,
              md`If hit 3 hits twice, its animation keys the hitbox on twice; each activation is a fresh \`area_entered\`.`,
            ],
            solution: [
              { file: 'scripts/resources/attack_data.gd', code: ATTACK_DATA },
              { file: 'scripts/states/attack.gd', code: ATTACK_COMBO },
            ],
            explain: md`The string is data: three resources and three animations. A fourth hit is one more \`.tres\` and one more animation, and a slower, heavier weapon for Bram is a different combo array on his Attack node. The state's logic (count frames, check the windows in priority order) never changes.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'k01-1-paper',
            title: 'Damage per second of a string',
            type: 'compute',
            difficulty: 2,
            minutes: 8,
            statement: md`Kai's string: hit 1 (cancel at frame 10, damage 4), hit 2 (cancel at frame 11, damage 5), hit 3 (total 37 frames, damage 9). A player chains every hit at the earliest cancel frame and starts a new string as soon as hit 3 ends. What is the damage per second? Round to one decimal.`,
            solution: [
              md`One full string takes $10 + 11 + 37 = 58$ frames $= 58/60 \approx 0.967$ s and deals $4 + 5 + 9 = 18$ damage.`,
              md`$18 / (58/60) = 18 \times 60/58 \approx 18.6$ damage per second.`,
              md`For comparison, repeating hit 1 alone at 22 frames: $4 \times 60/22 \approx 10.9$. The string is worth finishing, which is the point of a finisher, and its 24 recovery frames are the price.`,
            ],
            answer: { kind: 'number', value: 18.62, tol: 0.01 },
            areas: ['combat', 'math'],
          },
        },
        {
          kind: 'recall',
          prompt: md`Which timings live in the AnimationPlayer and which in AttackData, and why split them?`,
          answer: md`AnimationPlayer: the sprite frame, when the hitbox is on (\`CollisionShape2D:disabled\`) and the swing sound, because they must line up with the art. AttackData: cancel frame, dodge-cancel frame, damage, knockback, lunge, because they are rules the Attack state applies. Each number lives in one place, so they cannot disagree; the total length is read from the animation.`,
        },
        {
          kind: 'explain',
          prompt: md`Why should an attack's hitbox be keyed in an AnimationPlayer set to Physics rather than switched by a timer in the state?`,
          model: md`Keying it in the same animation as the sprite frames guarantees the hitbox is live exactly while the strike frame is visible, and you can scrub the timeline to check it. With a separate timer the two drift apart whenever someone retimes the art. Physics callback mode makes the animation advance in the same 60 Hz ticks as the state's frame counter and the physics queries, so "active frames 5 to 7" means three physics ticks on every machine, independent of the monitor's refresh rate.`,
        },
      ],
      cards: [
        { id: 'k01-1-c1', kind: 'concept', front: md`Define startup, active and recovery frames.`, back: md`Startup: frames before the hitbox turns on. Active: frames it is on. Recovery: frames after it turns off until the character can act. Their sum is the attack's length.` },
        { id: 'k01-1-c2', kind: 'compute', front: md`An attack is 5 + 3 + 14 frames. Length in ms at 60 fps?`, answer: { kind: 'number', value: 366.67, tol: 1e-3 }, back: md`$22 \times 1000/60 \approx 366.7$ ms.` },
        { id: 'k01-1-c3', kind: 'compute', front: md`At what time in seconds do you key the hitbox on for startup 6?`, answer: { kind: 'number', value: 0.1 }, back: md`Frame 6 starts at $6/60 = 0.1$ s.` },
        { id: 'k01-1-c4', kind: 'cloze', text: md`Set the attack AnimationPlayer's Callback Mode Process to {{}} so it advances with the physics ticks.`, answers: ['Physics'] },
        { id: 'k01-1-c5', kind: 'concept', front: md`What is a combo input window, and how does the input buffer widen it?`, back: md`The frames on which an attack press continues the string. The state accepts it from \`cancel_frame\`; a buffer of $B$ frames lets a press up to $B$ frames earlier still count.` },
      ],
    },
    // =============================================================================== k01-2
    {
      id: 'k01-2',
      title: 'Hitstop, screen shake and knockback',
      minutes: 40,
      objectives: [
        'Freeze attacker and target for 3 to 8 frames on a hit, and choose between Engine.time_scale and pausing individual nodes.',
        'Implement trauma-based screen shake and explain why the offset uses trauma squared.',
        'Apply knockback with linear decay and compute the slide distance $v^2/2f$.',
        'Route every landed hit through one HitFeedback node via the Events bus.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`With frame data in place, hits are *correct*: they connect on the right frames and do the right damage. They do not yet feel like anything. A sword passing through a skeleton looks like a sword passing through a picture of a skeleton.

What makes contact read is a handful of small lies told at the moment of impact. The game freezes for a few frames, as if the blade met resistance. The camera jolts. The target is pushed away. Each is tiny (60 to 130 ms, 2 to 6 pixels) and players rarely notice any of them consciously, but take them away and the same attack feels weightless. This lesson builds the three that change the *timing and motion*: hitstop, shake and knockback.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Hitstop',
          md: md`**Hitstop** (also hit-pause or freeze frames) stops the attacker and the target for a few frames when a hit connects. In many action games, light hits freeze for about 3 to 5 frames and heavy hits for 6 to 10; the freeze is long enough to register and short enough not to feel like lag. It also gives the player's eye time to see the contact frame, and widens the moment in which a follow-up press feels "in time".`,
        },
        {
          kind: 'viz',
          viz: { type: 'combat.hit', mode: 'feel' },
          task: md`Attack the skeleton with **J** with hitstop at 0, then at 4, then at 10. Then set the method to **Engine.time_scale** and watch the bat in the corner and the camera shake during a freeze. Finally turn knockback off and on.`,
          caption: md`The frame meter shows hitstop as dark columns: frames that took real time but did not advance Kai's attack. The bat is a bystander: with per-node hitstop it keeps flying; with \`time_scale = 0\` the whole world stops.`,
        },
        {
          kind: 'text',
          md: md`### Two ways to freeze

**Engine.time_scale.** Set \`Engine.time_scale = 0.0\` and every \`delta\` becomes 0: physics, animations, tweens and timers stop. To end the freeze you need a timer that ignores the time scale (\`create_timer(duration, true, false, true)\`; the fourth argument is \`ignore_time_scale\`). It is one line and freezes everything, which is also its problem: the other four enemies, the camera shake, particles, the UI tween on the ATB bar all stop too. With several hits per second in a crowd, the whole game stutters.

**Per-node pause.** Set \`process_mode = Node.PROCESS_MODE_DISABLED\` on the attacker and the target. Their scripts, states, \`AnimatedSprite2D\` and \`AnimationPlayer\` stop (children inherit the mode); everything else keeps running. The camera can shake *during* the freeze, which is exactly when the shake is most visible. Tweens created by the frozen node pause with it, which makes the hit flash hold at full white for the length of the freeze. This course uses per-node hitstop.`,
        },
        { kind: 'code', file: 'scripts/character.gd', code: HITSTOP_FRAGMENT, fragment: true, note: md`Add this to \`Character\`. \`create_timer(time, process_always, process_in_physics, ignore_time_scale)\` makes a \`SceneTreeTimer\`: it belongs to the tree, not to the frozen node, so it still runs. The id makes overlapping hitstops safe: if a second hit arrives during the first freeze, the first timer must not unfreeze the character early.` },
        {
          kind: 'check',
          q: md`Remove the \`_hitstop_id\` check. Kai lands two hits in quick succession: a 7-frame freeze starts on tick 100 and a 4-frame freeze on tick 103. When does Kai start moving again?`,
          options: [
            md`On tick 107, when the first timer ends: it re-enables Kai even though the second freeze runs until tick 107 as well. Here they coincide by luck; with a 10-frame first freeze the second hit's freeze would be cut or extended unpredictably.`,
            md`On tick 103.`,
            md`Never: the second freeze cancels the first timer.`,
            md`On tick 110, the sum of both freezes.`,
          ],
          answer: 0,
          explain: md`Each call starts its own timer and each timer re-enables processing when it fires, whichever was started last. With the id check only the most recent call is allowed to end the freeze. Ordering bugs like this show up only in fights with several enemies, which is why the guard is there from the start.`,
        },
        { kind: 'code', file: 'scripts/autoload/events.gd', code: EVENTS_ADD, fragment: true, note: md`Add this signal to the \`Events\` autoload. \`Character._on_hurt\` emits it; anything that reacts to hits in general (feedback, the ATB gauge in k04, achievement counters) connects to it without the attacker or target knowing.` },
        { kind: 'code', file: 'scripts/hit_feedback.gd', code: HIT_FEEDBACK_V1 },
        {
          kind: 'text',
          md: md`### Screen shake by trauma

The naive shake (offset the camera by a random vector each frame for 0.2 s) has two problems: random offsets each frame look like noise rather than a jolt, and two hits in a row either reset the timer or stack into chaos. The **trauma** model fixes both. Hits *add* trauma, a number from 0 to 1. Trauma *decays* linearly over time. The camera offset is \`max_offset * trauma² * noise(t)\`, where noise is a smooth function in $-1..1$, so the camera wobbles rather than teleports.`,
        },
        { kind: 'code', file: 'scripts/shake_camera.gd', code: SHAKE_CAMERA, note: md`\`FastNoiseLite\` is Godot's built-in noise generator; m03 explains why smooth noise looks better than \`randf\`. Rounding the offset matters at 320×180: a camera at a fractional position makes pixel art shimmer.` },
        {
          kind: 'derive',
          title: 'why trauma squared?',
          goal: md`A light hit adds 0.2 trauma and a heavy hit 0.45, with \`max_offset\` 6 px and \`decay\` 1.5 per second. Compare the shake from \`trauma\` and from \`trauma²\`, and find how long each hit shakes.`,
          steps: [
            {
              md: md`Linear shake: a light hit moves the camera up to $6 \times 0.2 = 1.2$ px, a heavy one $6 \times 0.45 = 2.7$ px. The heavy hit is $2.25$ times stronger.`,
            },
            {
              md: md`Squared: light $6 \times 0.2^2 = 0.24$ px, heavy $6 \times 0.45^2 \approx 1.22$ px. The ratio is now $(0.45/0.2)^2 \approx 5.1$.`,
              choose: {
                prompt: md`After rounding to whole pixels, what does the light hit's squared shake look like?`,
                options: [md`No visible shake: 0.24 px rounds to 0`, md`A 1 px rattle`, md`The same as the heavy hit`],
                answer: 0,
                explain: md`$0.24 \times$ noise is always below 0.5 px, so it rounds to 0. Light hits do not shake at all; only heavy hits, or several light hits stacking trauma, do. That is the intended effect.`,
              },
            },
            {
              md: md`Duration: trauma falls by \`decay\` per second, so a trauma of $T$ lasts $T/\text{decay}$ s. Light: $0.2/1.5 \approx 0.13$ s; heavy: $0.45/1.5 = 0.3$ s. Three light hits in quick succession stack to 0.6 and shake for up to 0.4 s, with a peak offset of $6 \times 0.36 \approx 2.2$ px.`,
            },
          ],
          takeaway: md`Squaring makes small trauma nearly invisible and large trauma dramatic, so the shake separates heavy hits from light ones and still rewards a fast string. Duration is trauma divided by decay.`,
        },
        {
          kind: 'viz',
          viz: { type: 'combat.hit_curves', mode: 'shake' },
          task: md`Add one heavy hit and watch both curves. Then add three light hits quickly. Switch the exponent between 1, 2 and 3 and repeat: with which exponent can you tell a light hit from a heavy one in the preview?`,
          caption: md`Upper curve: trauma. Lower curve: the shake amount $\text{trauma}^p$ that multiplies \`max_offset\`. The preview moves the camera by the rounded offset.`,
        },
        {
          kind: 'numeric',
          q: md`\`max_offset\` is 8 px, trauma is 0.5 and the exponent is 2. What is the largest camera offset in pixels that this trauma can produce (before rounding)?`,
          answer: { kind: 'number', value: 2 },
          explain: md`$8 \times 0.5^2 = 2$ px, reached when the noise is at $\pm 1$.`,
        },
        {
          kind: 'text',
          md: md`### Knockback with decay

c05's \`_on_hurt\` already sets \`velocity = hit.knockback\` and the Hurt state removes it with \`move_toward(Vector2.ZERO, knockback_friction * delta)\`. That is c02's friction again, so the slide distance is c02's stopping distance, $d = v^2/(2f)$. With \`knockback_friction\` 900 px/s², Kai's three hits (80, 100 and 180 px/s) push the skeleton about 3.6, 5.6 and 18 px. The finisher's push is what tells the player the string is over: the enemy ends up out of range of a fourth swing.

The Hurt state in this lesson also waits for the slide to finish before returning to Idle; otherwise a long knockback would be cut short by walking friction.`,
        },
        {
          kind: 'viz',
          viz: { type: 'combat.hit_curves', mode: 'knockback' },
          task: md`Set the speed to 180 and find a friction that slides the skeleton exactly 18 px. Then turn on the exponential comparison: which version stops dead, and which creeps?`,
          caption: md`Position against time for linear friction ($v$ drops by $f$ each second) and for exponential decay ($v$ drops by the same fraction each second). The vertical line is when the linear slide stops.`,
        },
        {
          kind: 'numeric',
          q: md`The golem's slam knocks Kai back at 240 px/s and Kai's \`knockback_friction\` is 900 px/s². How far does Kai slide, in pixels, and for how long, in seconds? Enter both.`,
          answer: { kind: 'vector', value: [32, 0.26667], tol: 1e-3 },
          inputHint: 'px, s',
          explain: md`$d = 240^2/(2 \times 900) = 57600/1800 = 32$ px, two tiles. $t = v/f = 240/900 \approx 0.267$ s, so Hurt must last at least 0.27 s or wait for the slide to end, as this lesson's Hurt state does.`,
        },
        {
          kind: 'steps',
          title: 'Wire hitstop, shake and knockback',
          steps: [
            md`Add the \`hit_landed\` signal to \`scripts/autoload/events.gd\` and the \`hitstop\` method and \`_hitstop_id\` variable to \`character.gd\`.`,
            md`In your test room, replace the \`Camera2D\` with one that has \`shake_camera.gd\` attached (or attach the script to the existing camera; it extends \`Camera2D\`). Keep it a child of Kai or of your camera rig from c04.`,
            md`Add a \`Node\` named \`HitFeedback\` to the room with \`hit_feedback.gd\`, and drag the camera into its *Camera* export.`,
            md`Add \`Events.hit_landed.emit(hit, self)\` to \`Character._on_hurt\` right after \`health.damage(hit.amount)\`, and replace \`hurt.gd\` with the version in the build below.`,
            md`Run, attack the dummy, and compare with the figure.`,
          ],
          result: md`Each hit freezes Kai and the dummy for a moment; the finisher freezes longer, shakes the screen and pushes the dummy about a tile away.`,
          troubleshoot: [
            { problem: md`Everything freezes, including the camera.`, fix: md`Something sets \`Engine.time_scale\` or \`get_tree().paused\`. Per-node hitstop changes only \`process_mode\` on the two characters.` },
            { problem: md`Kai never unfreezes.`, fix: md`The timer was created with \`process_always = false\` and something paused the tree, or the \`await\` line is in a function that was never awaited to completion because the node was freed. Use \`create_timer(duration, true, false, true)\`.` },
            { problem: md`The camera shakes but the image blurs or shimmers.`, fix: md`The offset is fractional. Keep the \`.round()\` and check that the project uses integer scaling (**Project Settings → Display → Window → Stretch → Scale Mode: integer**).` },
          ],
        },
        {
          kind: 'build',
          ch: {
            id: 'k01-2-build',
            title: 'A finisher that lands',
            goal: md`Make hit 3 of Kai's string unmistakably heavier than hits 1 and 2 using only hitstop, shake and knockback.`,
            requirements: [
              md`Hits 1 and 2 freeze both characters for 4 frames and do not visibly shake the camera.`,
              md`Hit 3 (9 damage) freezes for 7 frames, shakes the camera for about 0.3 s and pushes the dummy about 18 px.`,
              md`During a freeze, a second enemy walking nearby keeps moving.`,
              md`Hitting two enemies with one swing does not unfreeze Kai early.`,
            ],
            hints: [
              md`\`heavy_amount = 8\` makes hit 3 heavy and hits 1 and 2 light. Tuning by damage rather than by "which hit" means a heavy spell or a crit in r01 gets the heavy treatment for free.`,
              md`If the dummy stops sliding early, the Hurt state left before the knockback ended: check the velocity condition in \`hurt.gd\`.`,
              md`To test the second enemy, duplicate the dummy and give it a simple \`AIController\` stub that sets \`intent.move = Vector2.RIGHT\`.`,
            ],
            solution: [
              { file: 'scripts/character.gd', code: CHARACTER_K01 },
              { file: 'scripts/states/hurt.gd', code: HURT_K01 },
              { file: 'scripts/hit_feedback.gd', code: HIT_FEEDBACK_V1 },
            ],
            explain: md`One hit fans out through one signal into three independent effects. The listing of \`character.gd\` above also contains \`flash()\` for k01-3. Two hits on two enemies call \`hitstop\` on Kai twice in the same tick; the id guard means the later call owns the unfreeze, so the freeze lasts the full duration once.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'k01-2-paper',
            title: 'The cost of time_scale hitstop',
            type: 'compute',
            difficulty: 2,
            minutes: 6,
            statement: md`In a fight, Kai lands on average 2.5 light hits per second (4-frame hitstop each) and Bram, controlled by AI, 1 heavy hit per second (7 frames each). If hitstop used \`Engine.time_scale = 0\`, what fraction of real time would the *whole game* be frozen? Assume the freezes do not overlap.`,
            solution: [
              md`Frozen frames per second: $2.5 \times 4 + 1 \times 7 = 17$ frames.`,
              md`$17/60 \approx 0.283$: the world would stand still 28% of the time, and Lyra's movement, enemy attacks and the ATB bars would all stutter. With per-node hitstop each freeze affects only the two characters involved.`,
            ],
            answer: { kind: 'number', value: 0.28333, tol: 1e-3 },
            areas: ['feel', 'combat'],
          },
        },
        {
          kind: 'recall',
          prompt: md`Give the formulas for trauma-based shake and for knockback distance, with the meaning of each symbol.`,
          answer: md`Shake offset $= \text{max\_offset} \cdot \text{trauma}^2 \cdot n(t)$, where trauma in $[0, 1]$ is added by hits and decays linearly, and $n(t)$ is smooth noise in $[-1, 1]$; duration is trauma / decay. Knockback with friction $f$ from speed $v$: distance $v^2/(2f)$, time $v/f$.`,
        },
        {
          kind: 'explain',
          prompt: md`Why does hitstop make a hit feel heavier, even though it makes the game objectively slower?`,
          model: md`Real impacts transfer momentum: a blade hitting a body slows down. Freezing both characters for a few frames imitates that resistance; a sword that keeps moving at full speed through an enemy reads as passing through air. The freeze also holds the contact frame (and the white flash) on screen long enough for the eye to register it, and creates a small rhythm that makes the next press feel timed. The cost is a few frames per hit, which is why light hits get 3 to 5 frames and only heavy hits get more, and why the freeze is applied only to the two characters involved.`,
        },
      ],
      cards: [
        { id: 'k01-2-c1', kind: 'concept', front: md`Per-node hitstop versus Engine.time_scale: what does each freeze, and which does this course use?`, back: md`\`time_scale = 0\` freezes everything (other enemies, camera, tweens, timers). Per-node (\`process_mode = PROCESS_MODE_DISABLED\` on attacker and target) freezes only them; the camera can shake during the freeze. The course uses per-node.` },
        { id: 'k01-2-c2', kind: 'compute', front: md`Trauma 0.6, decay 1.5/s. How long (s) until the shake stops?`, answer: { kind: 'number', value: 0.4 }, back: md`$0.6/1.5 = 0.4$ s.` },
        { id: 'k01-2-c3', kind: 'compute', front: md`Knockback 120 px/s, friction 900 px/s². Slide distance in px?`, answer: { kind: 'number', value: 8 }, back: md`$120^2/1800 = 8$ px.` },
        { id: 'k01-2-c4', kind: 'cloze', text: md`\`get_tree().create_timer(d, true, false, {{}})\`: the fourth argument makes the timer ignore Engine.time_scale.`, answers: ['true'] },
        { id: 'k01-2-c5', kind: 'concept', front: md`Why is screen shake proportional to trauma squared rather than trauma?`, back: md`Squaring makes small trauma nearly invisible and large trauma strong, so light hits barely shake, heavy hits clearly do, and stacked light hits build up.` },
      ],
    },
    // =============================================================================== k01-3
    {
      id: 'k01-3',
      title: 'Flash, sparks, numbers and sound',
      minutes: 40,
      objectives: [
        'Write a canvas_item hit-flash shader with a flash uniform and drive it with a tween.',
        'Spawn hit sparks and damage numbers that place and free themselves.',
        'Layer swing, hit and crit sounds with pitch variation, timed to frames.',
        'Explain what each feedback element tells the player and tune them together.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Hitstop, shake and knockback change motion. The remaining feedback is information, each piece answering one question the player has at the moment of impact:

| Element | Answers |
|---|---|
| hit flash | *which* enemy did I hit? |
| hit spark | *where* did the blade connect? |
| damage number | *how much* did it do? |
| sound | *how hard* was it, even when I am not looking at that enemy |

A crowd of five skeletons makes the first question real: the flash is what tells you the second skeleton from the left took the hit. Because every element is one more thing on screen, each must be short (most are gone in under half a second) and consistent.`,
        },
        { kind: 'assets', ids: ['fx_hit', 'fx_slash', 'font_pixel', 'sfx_swing', 'sfx_hit', 'sfx_crit', 'skeleton'] },
        {
          kind: 'viz',
          viz: { type: 'combat.hit', mode: 'full' },
          task: md`Turn every effect off and attack. Then turn them on one at a time in this order: flash, sparks, numbers, sound, hitstop, shake, knockback. Which single element made the biggest difference for you? Finally turn everything on and attack with the sound off, then with it on.`,
          caption: md`Every toggle maps to one line of \`HitFeedback\` or \`Character\`. Sound plays only after you have clicked the game.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'canvas_item shaders',
          md: md`A shader with \`shader_type canvas_item;\` runs on the GPU for every pixel of a 2D node. In \`fragment()\`, \`TEXTURE\` and \`UV\` give the sprite's pixel, \`COLOR\` arrives holding the node's modulate and is what you write out. A \`uniform\` is a parameter you set from GDScript with \`material.set_shader_parameter("flash", 1.0)\`, or animate with a tween on the property path \`"shader_parameter/flash"\`. p01 covers shaders properly; this one is six lines.`,
        },
        { kind: 'code', file: 'assets/shaders/hit_flash.gdshader', lang: 'shader', code: FLASH_SHADER, note: md`\`mix(a, b, t)\` is linear interpolation: \`flash = 0\` gives the sprite, \`1\` gives solid white, \`0.5\` halfway. \`hint_range\` makes the Inspector show a slider; \`source_color\` shows a colour picker.` },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Local to Scene',
          md: md`A \`ShaderMaterial\` is a Resource, and resources are shared by default. If every skeleton's sprite uses the same material, setting \`flash\` on one flashes all of them. Tick **Resource → Local to Scene** on the material in the skeleton scene, so each instance gets its own copy when the scene is instantiated.`,
        },
        {
          kind: 'check',
          q: md`\`Character.flash()\` creates its tween with \`create_tween()\` on the Character. During a 7-frame hitstop the Character's \`process_mode\` is DISABLED. What does the flash look like?`,
          options: [
            md`It holds at full white for the 7 frames of the freeze, then fades over 0.12 s: tweens made by a node pause when that node cannot process.`,
            md`It fades during the freeze and is gone by the time the character moves again.`,
            md`It never fades, because the tween was killed by the freeze.`,
            md`It flickers.`,
          ],
          answer: 0,
          explain: md`\`Node.create_tween()\` binds the tween to the node, and a bound tween processes only when the node does. Holding the white silhouette through the freeze is the classic look, so this is a free bonus of per-node hitstop.`,
        },
        { kind: 'code', file: 'scenes/fx/hit_spark.gd', code: HIT_SPARK },
        { kind: 'code', file: 'ui/damage_number.gd', code: DAMAGE_NUMBER, note: md`\`set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)\` makes the number rise fast and settle, the easing from m03. \`parallel()\` runs the fade alongside the rise; \`set_delay(0.35)\` starts it near the end, so the number is readable for most of its half second.` },
        {
          kind: 'text',
          md: md`### Sound layering

A hit sound is usually not one sound but layers that each carry part of the information:

- **\`sfx_swing\`**, keyed in the attack animation one frame before the active frames. It plays whether or not anything is hit, so a miss still has weight.
- **\`sfx_hit\`**, played by \`HitFeedback\` on every connected hit, with the pitch varied by a few percent so ten hits in a row do not sound like a machine gun.
- **\`sfx_crit\`**, layered *on top of* \`sfx_hit\` for heavy hits. The two together sound bigger than either alone.

Pitch is multiplicative: \`pitch_scale = 2\` is one octave up. One semitone is a factor of $2^{1/12} \approx 1.0595$, so \`randf_range(0.94, 1.06)\` varies the pitch by about one semitone either way, enough to hear as variety and too little to hear as a different sound.`,
        },
        {
          kind: 'derive',
          title: 'pitch variation in semitones',
          goal: md`Find the \`pitch_scale\` range for a variation of $\pm s$ semitones and check the lesson's 0.94 to 1.06.`,
          steps: [
            {
              md: md`An octave (12 semitones) doubles the frequency, and each semitone multiplies it by the same factor $r$: $r^{12} = 2$, so $r = 2^{1/12} \approx 1.0595$.`,
              choose: {
                prompt: md`Why a factor per semitone rather than a fixed number of Hz?`,
                options: [md`Pitch perception is logarithmic: equal musical steps are equal frequency ratios`, md`Because Godot stores pitch in semitones`, md`It is arbitrary`],
                answer: 0,
                explain: md`An octave sounds like the same step whether it is from 220 to 440 Hz or 880 to 1760 Hz: it is a ratio.`,
              },
            },
            { md: md`$\pm s$ semitones is the range $[2^{-s/12}, 2^{s/12}]$. For $s = 1$: $[0.944, 1.059]$. The lesson's $[0.94, 1.06]$ is one semitone, rounded.` },
          ],
          takeaway: md`\`pitch_scale\` $= 2^{\text{semitones}/12}$. One semitone of random variation per hit is a good default for impacts.`,
        },
        {
          kind: 'numeric',
          q: md`A designer wants hit sounds varied by $\pm 2$ semitones. What is the upper bound for \`randf_range\`? Give three decimals.`,
          answer: { kind: 'number', value: 1.1225, tol: 1e-3 },
          explain: md`$2^{2/12} = 2^{1/6} \approx 1.1225$. The lower bound is $1/1.1225 \approx 0.891$.`,
        },
        { kind: 'code', file: 'scripts/hit_feedback.gd', code: HIT_FEEDBACK, note: md`Sparks and numbers are added to \`get_tree().current_scene\`, not to the target: if the hit kills a slime that frees itself, its children would vanish with it mid-animation. The one-shot \`AudioStreamPlayer\` frees itself when \`finished\` fires.` },
        {
          kind: 'steps',
          title: 'Make the effect scenes',
          steps: [
            md`**Flash.** Save the shader as \`assets/shaders/hit_flash.gdshader\`. On Kai's and the skeleton's \`AnimatedSprite2D\`, set *Material* to **New ShaderMaterial**, assign the shader, and tick **Local to Scene** on the material.`,
            md`**Spark.** New scene \`scenes/fx/hit_spark.tscn\` with an \`AnimatedSprite2D\` root: SpriteFrames from \`assets/fx/hit.png\` (the \`fx_hit\` sheet), one animation \`play\` at about 20 FPS with Loop off. Attach \`hit_spark.gd\`.`,
            md`**Number.** New scene \`ui/damage_number.tscn\` with a \`Label\` root: *Custom Minimum Size* 32×10, *Horizontal Alignment* Center, the pixel font (\`assets/ui/font_pixel.png\` imported as a font) with an outline of 1 px in a dark colour under **Theme Overrides**. Set *Z Index* to 10 so numbers draw over characters. Attach \`damage_number.gd\`.`,
            md`On \`HitFeedback\`, drag the two scenes into *Spark Scene* and *Number Scene* and the \`hit.wav\` and \`crit.wav\` files into the sound exports.`,
          ],
          result: md`Every hit flashes the dummy white, a spark appears between the blade and the body, a number rises and fades, and you hear the hit; the finisher adds the crit layer and a gold number.`,
          troubleshoot: [
            { problem: md`All skeletons flash when one is hit.`, fix: md`The material is shared. Tick **Local to Scene** on the ShaderMaterial in the skeleton scene (not just in one instance).` },
            { problem: md`The number appears at the wrong place, far from the hit.`, fix: md`It was added to a node with an offset or to a \`CanvasLayer\` (screen space). Add it to the level (\`current_scene\`), which shares the world's coordinates.` },
            { problem: md`The spark loops forever.`, fix: md`\`animation_finished\` is never emitted for looping animations. Untick Loop on \`play\`.` },
          ],
        },
        {
          kind: 'build',
          ch: {
            id: 'k01-3-build',
            title: 'The full hit',
            goal: md`Finish \`HitFeedback\` so every connected hit gets the full treatment, then tune it in a fight with three dummies.`,
            requirements: [
              md`Each dummy flashes on its own when hit; the others do not.`,
              md`A spark appears at the contact point, between the sword and the body, and frees itself.`,
              md`Numbers rise about 14 px and fade within half a second; the finisher's number is gold.`,
              md`Ten quick hits do not sound identical; the finisher sounds heavier than the first two hits.`,
              md`The swing sound plays on misses too, one frame before the active frames.`,
            ],
            hints: [
              md`The spark position uses \`lerp\` toward the attacker: \`at.lerp(source_position, 0.3)\` is 30% of the way from the target to the attacker.`,
              md`If numbers overlap into an unreadable stack in a fast string, offset each new one by a random 0 to 4 px sideways.`,
              md`Check the swing key time in all three animations: one frame before the first active frame is (startup - 1)/60 s.`,
            ],
            solution: [
              { file: 'scripts/hit_feedback.gd', code: HIT_FEEDBACK },
              { file: 'ui/damage_number.gd', code: DAMAGE_NUMBER },
              { file: 'scenes/fx/hit_spark.gd', code: HIT_SPARK },
            ],
            explain: md`All of the feedback lives in one node that reacts to one signal. When Lyra's fireball (r02) or the golem's slam (k02) lands, it goes through the same \`hurt\` → \`hit_landed\` path and gets consistent feedback without new code. Tuning happens in one Inspector.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'k01-3-paper',
            title: 'A feedback budget for crowds',
            type: 'design',
            difficulty: 2,
            minutes: 10,
            statement: md`In a fight with five skeletons, Kai, Lyra and Bram together land about 6 hits per second. Playtesters say the screen is noise. Propose concrete rules for which feedback elements scale down, are merged or are kept, and justify each with what the element communicates.`,
            solution: [
              md`Keep the flash on every hit: it is the cheapest and answers "which enemy", which matters most in a crowd.`,
              md`Hitstop only for hits involving the *controlled* character; allies' hits get none, so the player's own rhythm stays clean. Shake only for heavy hits and hits on the player.`,
              md`Merge damage numbers: hits on the same enemy within 0.3 s add into the existing number (re-popping it) instead of spawning new ones. Allies' numbers smaller or dimmer.`,
              md`Sound: limit simultaneous \`sfx_hit\` instances (for example 3, oldest stopped) and lower allies' hit volume by about 6 dB. Keep \`sfx_crit\` for the player's heavy hits so it stays special.`,
            ],
            rubric: [md`Each rule tied to what the element communicates`, md`Distinguishes the controlled character from allies`, md`Gives concrete limits (counts, durations, volumes)`],
            areas: ['feel', 'art'],
          },
        },
        {
          kind: 'recall',
          prompt: md`List the seven feedback elements of a hit in this module and the one question or sensation each is responsible for.`,
          answer: md`Hitstop: resistance at contact. Screen shake: force (heavy hits). Knockback: the push, and the end of the string. Flash: which enemy was hit. Spark: where. Damage number: how much. Sound layers: how hard (swing for the attempt, hit for contact, crit for heavy).`,
        },
        {
          kind: 'explain',
          prompt: md`Why is every element of hit feedback routed through one signal and one HitFeedback node rather than written into each attack?`,
          model: md`Consistency and tuning. Every source of damage (Kai's sword, Bram's bash, Lyra's fireball, a skeleton's swing, spikes) emits the same \`hit_landed\` through \`Character._on_hurt\`, so all of them get the same feedback with no extra code, and changing the light-hit freeze from 4 to 5 frames is one Inspector value. It also keeps attacks and targets ignorant of presentation: an attack decides damage and knockback; how a hit looks and sounds is decided in one place that a designer can tune or disable.`,
        },
      ],
      cards: [
        { id: 'k01-3-c1', kind: 'cloze', text: md`In the hit-flash shader, \`COLOR = vec4({{}}(tex.rgb, flash_color.rgb, flash), tex.a);\``, answers: ['mix'] },
        { id: 'k01-3-c2', kind: 'concept', front: md`Why tick Local to Scene on the hit-flash ShaderMaterial?`, back: md`Resources are shared between instances by default; without it, flashing one skeleton flashes every skeleton using the material.` },
        { id: 'k01-3-c3', kind: 'compute', front: md`pitch_scale for +3 semitones?`, answer: { kind: 'number', value: 1.1892, tol: 1e-3 }, back: md`$2^{3/12} = 2^{1/4} \approx 1.189$.` },
        { id: 'k01-3-c4', kind: 'concept', front: md`Why are sparks and damage numbers added to the current scene, not to the target?`, back: md`The target may be frozen (hitstop) or freed (died); children would freeze or vanish with it.` },
        { id: 'k01-3-c5', kind: 'concept', front: md`What do sfx_swing, sfx_hit and sfx_crit each communicate?`, back: md`Swing: the attempt (plays on misses too). Hit: contact. Crit: a heavy hit, layered on top of the hit sound.` },
      ],
    },
  ],
  problems: [
    {
      id: 'k01-p1',
      title: 'Frames and milliseconds',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`A boss's tail swipe has 28 startup frames. A player's average reaction time to a visual cue is about 250 ms, and Kai's dodge becomes invincible on its first frame. How many frames of margin does the player have after reacting?`,
      solution: [md`250 ms is $0.25 \times 60 = 15$ frames.`, md`$28 - 15 = 13$ frames of margin (about 217 ms) to press dodge after reacting. Comfortable for a telegraphed boss attack.`],
      answer: { kind: 'number', value: 13 },
      areas: ['combat', 'feel'],
    },
    {
      id: 'k01-p2',
      title: 'Key times',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`Bram's mace swing has startup 12, active 5, recovery 20. Give the three key times in seconds for the hitbox track (disabled on, off, on). Enter as a list.`,
      solution: [md`On at frame 0: 0 s. Off at frame 12: $12/60 = 0.2$ s.`, md`On again at frame $12 + 5 = 17$: $17/60 \approx 0.2833$ s. Animation length $37/60 \approx 0.6167$ s.`],
      answer: { kind: 'vector', value: [0, 0.2, 0.28333], tol: 1e-3 },
      areas: ['godot', 'combat'],
    },
    {
      id: 'k01-p3',
      title: 'The double hit',
      type: 'debug',
      difficulty: 2,
      minutes: 8,
      statement: md`Kai's finisher sometimes deals damage twice to the same skeleton. Its animation keys \`CollisionShape2D:disabled\` false at 0.15 s and true at 0.2167 s. The Attack state also contains:

\`\`\`gdscript
func physics_update(delta: float) -> void:
    _frame += 1
    hitbox.set_active(_frame >= 9 and _frame < 13)
\`\`\`

Explain how a double hit happens and fix it.`,
      solution: [md`Two systems switch the same shape. The AnimationPlayer (physics mode) and \`set_active\` (deferred to the end of the frame) can disagree for a tick: for example the animation disables the shape on a frame where the deferred call re-enables it. Each off-on flip is a new overlap, so \`area_entered\` fires again.`, md`Fix: one owner. Delete the \`set_active\` line and let the animation key the shape; keep \`set_active(false)\` only in \`exit()\` for interruptions.`],
      rubric: [md`Identifies two writers of the same property`, md`Connects re-enabling to a new area_entered`, md`Fix keeps a single source of truth`],
      areas: ['godot', 'combat'],
    },
    {
      id: 'k01-p4',
      title: 'Stacked trauma',
      type: 'compute',
      difficulty: 2,
      minutes: 6,
      statement: md`\`decay\` is 1.5/s and hits add 0.2 trauma. Kai lands hits at frames 0, 10 and 21 (the string's cancel points). What is the trauma just after the third hit? Give three decimals.`,
      solution: [md`After hit 1: 0.2. By frame 10 it decays by $1.5 \times 10/60 = 0.25$, so it reached 0 at frame 8; after hit 2: 0.2.`, md`By frame 21: $0.2 - 1.5 \times 11/60 = 0.2 - 0.275 < 0$, so trauma is back to 0 and the third hit sets it to 0.2.`, md`Answer: 0.200. With these values light hits never stack: 10 frames of decay remove 0.25, more than one hit adds. Stacking needs faster hits, slower decay or more trauma per hit.`],
      answer: { kind: 'number', value: 0.2 },
      areas: ['feel', 'math'],
    },
    {
      id: 'k01-p5',
      title: 'Exponential knockback',
      type: 'derive',
      difficulty: 3,
      minutes: 10,
      statement: md`An alternative to linear friction is \`velocity *= exp(-k * delta)\` each tick. Show that the total slide distance from speed $v_0$ is $v_0/k$, and find $k$ so a 180 px/s knockback slides 18 px. How long until the speed is below 5 px/s?`,
      solution: [md`Each tick multiplies by $e^{-k\Delta t}$, so $v(t) = v_0 e^{-kt}$. Distance $= \int_0^\infty v_0 e^{-kt}\,dt = v_0/k$.`, md`$v_0/k = 18 \Rightarrow k = 180/18 = 10$ per second.`, md`$v_0 e^{-kt} = 5 \Rightarrow t = \ln(180/5)/10 = \ln 36/10 \approx 0.358$ s, against $180/900 = 0.2$ s for linear friction with the same distance. Exponential decay creeps for a long time, which is why games often add a cutoff speed.`],
      answer: { kind: 'number', value: 0.35835, tol: 1e-3 },
      areas: ['math', 'feel'],
    },
    {
      id: 'k01-p6',
      title: 'The flash that flashes everyone',
      type: 'debug',
      difficulty: 1,
      minutes: 4,
      statement: md`Hitting one slime flashes all six slimes in the room. The slime scene's sprite has a ShaderMaterial with the hit-flash shader, and \`Character.flash()\` is as in the lesson. Give the cause and two fixes.`,
      solution: [md`The six instances share one ShaderMaterial resource; setting its \`flash\` parameter changes it for all of them.`, md`Fix 1: tick **Local to Scene** on the material in the slime scene. Fix 2: in \`_ready()\`, \`sprite.material = sprite.material.duplicate()\`. (Fix 1 is preferred: no code, and it is visible in the Inspector.)`],
      rubric: [md`Identifies the shared resource`, md`Gives Local to Scene`, md`Gives a code alternative`],
      areas: ['godot', 'art'],
    },
    {
      id: 'k01-p7',
      title: 'A heavy weapon on paper',
      type: 'design',
      difficulty: 2,
      minutes: 10,
      statement: md`Design Bram's two-hit mace string. He should feel slow and strong compared with Kai, and his second hit should stagger enemies (k04). Give startup, active, recovery, cancel and dodge-cancel frames, damage, knockback and hitstop for both hits, and justify the numbers against Kai's.`,
      solution: [md`Hit 1: startup 12, active 4, recovery 18 (34 frames), cancel 20, dodge cancel 18, damage 7, knockback 120, light hitstop 4. Hit 2: startup 16, active 5, recovery 28 (49 frames), dodge cancel 24, damage 12, knockback 220, heavy hitstop 7.`, md`Justification: startup about twice Kai's makes swings readable and heavy; damage per hit about 1.5 to 2 times Kai's; DPS slightly below Kai's ($19 \times 60/(20 + 49) \approx 16.5$) so Bram's value is stagger and knockback, not damage. Long dodge-cancel frames make committing to a swing a real decision.`],
      rubric: [md`All frame values given and consistent (cancel within the attack)`, md`Compares DPS or timing with Kai's string`, md`Ties the numbers to the character's role`],
      areas: ['combat', 'feel'],
    },
    {
      id: 'k01-p8',
      title: 'Hitstop budget',
      type: 'compute',
      difficulty: 2,
      minutes: 5,
      statement: md`Kai's string (hits at cancel frames 10 and 11, finisher 37 frames) gets hitstop of 4, 4 and 7 frames on top. Hitstop freezes Kai, so it lengthens the string in real time. How many seconds does one full string take including hitstop, and by what percentage did hitstop lengthen it? Enter both, percentage as a number like 25.`,
      solution: [md`Without hitstop: 58 frames. With: $58 + 4 + 4 + 7 = 73$ frames $\approx 1.217$ s.`, md`Increase: $15/58 \approx 25.9\%$. The damage per second drops by the same factor, which is why balance numbers (m05, r01) should be measured with hitstop on.`],
      answer: { kind: 'vector', value: [1.21667, 25.862], tol: 1e-3 },
      areas: ['combat', 'math'],
    },
    {
      id: 'k01-p9',
      title: 'Why the AnimationPlayer runs in physics',
      type: 'concept',
      difficulty: 2,
      minutes: 5,
      statement: md`On a 144 Hz monitor, a tester reports that Kai's first slash "sometimes misses an enemy it clearly touches". The attack AnimationPlayer is in the default Idle callback mode. Explain the bug in terms of ticks and frames.`,
      solution: [md`In Idle mode the animation advances once per rendered frame (144 per second) while physics runs at 60. The 3 active frames are 0.05 s of animation time; which physics ticks see the shape enabled depends on where the rendered frames fall, and a short active window can straddle ticks so physics sees it for 2 ticks instead of 3, or sees the enemy only after the overlap has already been on and off.`, md`In Physics mode the animation advances exactly once per physics tick, so active frames 5 to 7 are exactly three physics queries on every machine.`],
      rubric: [md`Distinguishes render frames from physics ticks`, md`Explains the varying overlap`, md`States the fix`],
      areas: ['godot'],
    },
  ],
};
