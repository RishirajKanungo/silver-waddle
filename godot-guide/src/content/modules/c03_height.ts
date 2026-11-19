import { md, gd, type Module } from '../types';
import { PLAYER_FEEL } from './c02_movement';

/** Insert pieces into a listing at known anchors; throws if an anchor is missing, so the
 *  validator fails loudly if the c02 script changes. */
function patch(src: string, pairs: [string, string][]): string {
  let out = src;
  for (const [a, b] of pairs) {
    if (!out.includes(a)) throw new Error('c03: listing anchor not found: ' + a.slice(0, 80));
    out = out.replace(a, b);
  }
  return out;
}

// ------------------------------------------------------------------ lesson c03-1: fake Z
const JUMP_VARS = gd`
@export_group("Jump")
## Apex height of a jump above the ground, px.
@export var jump_height := 20.0
## Seconds from takeoff to the apex.
@export var time_to_peak := 0.25

## Height above the base ground, px. Up is positive.
var z := 0.0
## Vertical speed, px/s. Up is positive.
var z_velocity := 0.0
var _airborne := false

@onready var shadow: Sprite2D = $Shadow
`;

const UPDATE_HEIGHT = gd`
func _update_height(delta: float) -> void:
    var floor_z := 0.0  # flat ground for now; lesson 2 reads it from the level
    var gravity := 2.0 * jump_height / (time_to_peak * time_to_peak)
    var grounded := z <= floor_z and z_velocity <= 0.0
    if grounded and Input.is_action_just_pressed("jump"):
        z_velocity = 2.0 * jump_height / time_to_peak
        grounded = false
    if grounded:
        z = floor_z
        z_velocity = 0.0
    else:
        # Exact for constant gravity, so the apex is jump_height at any frame rate.
        z += z_velocity * delta - 0.5 * gravity * delta * delta
        z_velocity -= gravity * delta
        if z <= floor_z and z_velocity < 0.0:
            z = floor_z
            z_velocity = 0.0
            grounded = true
    _airborne = not grounded
    # Draw the body z pixels higher; the shadow stays on the floor.
    sprite.position.y = SPRITE_Y - z
    shadow.position.y = -floor_z
    # A higher character casts a smaller shadow: 100% on the floor, 60% at the apex.
    var t := clampf((z - floor_z) / jump_height, 0.0, 1.0)
    shadow.scale = Vector2.ONE * lerpf(1.0, 0.6, t)
`;

const UPDATE_HEIGHT_LANDING = gd`
func _update_height(delta: float) -> void:
    var floor_z := 0.0
    var gravity := 2.0 * jump_height / (time_to_peak * time_to_peak)
    var grounded := z <= floor_z and z_velocity <= 0.0
    if grounded and Input.is_action_just_pressed("jump"):
        z_velocity = 2.0 * jump_height / time_to_peak
        grounded = false
        jump_sound.play()
    if grounded:
        z = floor_z
        z_velocity = 0.0
    else:
        z += z_velocity * delta - 0.5 * gravity * delta * delta
        z_velocity -= gravity * delta
        if z <= floor_z and z_velocity < 0.0:
            z = floor_z
            z_velocity = 0.0
            grounded = true
            _on_landed()
    _airborne = not grounded
    sprite.position.y = SPRITE_Y - z
    shadow.position.y = -floor_z
    var t := clampf((z - floor_z) / jump_height, 0.0, 1.0)
    shadow.scale = Vector2.ONE * lerpf(1.0, 0.6, t)


func _on_landed() -> void:
    land_sound.play()
    # Squash for a moment, then spring back: the eye reads it as weight.
    sprite.scale = Vector2(1.25, 0.8)
    var tween := create_tween()
    tween.tween_property(sprite, "scale", Vector2.ONE, 0.12).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
`;

const ANIM_OLD = gd`
    var state := "idle"
    if _dash_frames_left > 0:
        state = "dash"
    elif velocity.length() > 5.0:
        state = "walk"
    var anim := state + "_" + facing
`;
const ANIM_NEW = gd`
    var state := "idle"
    if _airborne:
        state = "jump"
    elif _dash_frames_left > 0:
        state = "dash"
    elif velocity.length() > 5.0:
        state = "walk"
    # The sheet has jump_down and jump_side only, so a jump facing up uses jump_down.
    var anim_facing := "down" if state == "jump" and facing == "up" else facing
    var anim := state + "_" + anim_facing
`;

const BASE_PATCHES: [string, string][] = [
  ['extends CharacterBody2D\n', 'extends CharacterBody2D\n\n## The sprite\'s resting y offset, so the feet sit on the body\'s origin.\nconst SPRITE_Y := -12.0\n'],
  ['@export var step_frames: Array[int] = [0, 2]\n', '@export var step_frames: Array[int] = [0, 2]\n\n' + JUMP_VARS.replace(/\n@onready[^\n]*\n$/, '\n').replace(/\n+$/, '\n')],
  ['@onready var footsteps: AudioStreamPlayer2D = $Footsteps\n', '@onready var footsteps: AudioStreamPlayer2D = $Footsteps\n@onready var shadow: Sprite2D = $Shadow\n'],
  ['\t_since_dodge_press += delta\n\t_update_animation()\n', '\t_since_dodge_press += delta\n\t_update_height(delta)\n\t_update_animation()\n'],
  [ANIM_OLD, ANIM_NEW],
];

const PLAYER_JUMP = patch(PLAYER_FEEL, [
  ...BASE_PATCHES,
  ['@onready var shadow: Sprite2D = $Shadow\n', '@onready var shadow: Sprite2D = $Shadow\n@onready var jump_sound: AudioStreamPlayer2D = $JumpSound\n@onready var land_sound: AudioStreamPlayer2D = $LandSound\n'],
]).replace(/\n*$/, '\n\n\n' + UPDATE_HEIGHT_LANDING);

// ------------------------------------------------------------------ lesson c03-2: elevation levels
const ELEVATION_ZONE = gd`
class_name ElevationZone
extends Area2D

## Elevation level of the ground inside this area. 0 is the base ground.
@export var level := 1

const ELEVATION_LAYER := 9


func _ready() -> void:
    # Zones are found by the player's floor probe; they detect nothing themselves.
    collision_layer = 0
    collision_mask = 0
    set_collision_layer_value(ELEVATION_LAYER, true)
    monitoring = false
`;

const LEDGE = gd`
class_name Ledge
extends Node2D

## Elevation level of the top of this ledge.
@export_range(1, 2) var level := 1
## Level of the ground this ledge stands on (1 for a ledge on top of another ledge).
@export_range(0, 1) var base_level := 0
## Footprint on the ground plane, px. The node's position is its top-left corner.
@export var size := Vector2(96, 64)

const LEVEL_HEIGHT := 16.0
const FIRST_CLIFF_LAYER := 10

@onready var cliff: StaticBody2D = $Cliff
@onready var cliff_shape: CollisionShape2D = $Cliff/CollisionShape2D
@onready var zone: ElevationZone = $Zone
@onready var zone_shape: CollisionShape2D = $Zone/CollisionShape2D
@onready var top: ColorRect = $Top
@onready var face: ColorRect = $Face


func _ready() -> void:
    # The same rectangle is the wall below the ledge and the floor on top of it.
    var footprint := RectangleShape2D.new()
    footprint.size = size
    cliff_shape.shape = footprint
    cliff_shape.position = size / 2.0
    zone_shape.shape = footprint
    zone_shape.position = size / 2.0
    cliff.collision_layer = 0
    cliff.collision_mask = 0
    cliff.set_collision_layer_value(FIRST_CLIFF_LAYER + level - 1, true)
    zone.level = level
    # Draw the top surface shifted up by its height, and the cliff face below it.
    var height := level * LEVEL_HEIGHT
    top.position = Vector2(0.0, -height)
    top.size = size
    face.position = Vector2(0.0, size.y - height)
    face.size = Vector2(size.x, (level - base_level) * LEVEL_HEIGHT)
`;

const LEVELS_VARS = gd`
const LEVEL_HEIGHT := 16.0
## Physics layer of the level-1 cliffs; level 2 cliffs use the next layer.
const FIRST_CLIFF_LAYER := 10
const TOP_LEVEL := 2

@onready var floor_probe: Area2D = $FloorProbe
`;

const LEVELS_FUNCS = gd`
## The height of the floor under the feet: the highest zone the probe touches.
func _floor_height() -> float:
    var level := 0
    for area in floor_probe.get_overlapping_areas():
        if area is ElevationZone:
            level = maxi(level, (area as ElevationZone).level)
    return level * LEVEL_HEIGHT


## A ledge's cliff blocks the player only while the player is below the top of that ledge.
func _update_cliff_mask() -> void:
    for level in range(1, TOP_LEVEL + 1):
        set_collision_mask_value(FIRST_CLIFF_LAYER + level - 1, z < level * LEVEL_HEIGHT)
`;

const PLAYER_LEVELS = patch(PLAYER_FEEL, [
  ...BASE_PATCHES,
  ['## The sprite\'s resting y offset, so the feet sit on the body\'s origin.\nconst SPRITE_Y := -12.0\n', '## The sprite\'s resting y offset, so the feet sit on the body\'s origin.\nconst SPRITE_Y := -12.0\nconst LEVEL_HEIGHT := 16.0\n## Physics layer of the level-1 cliffs; level 2 cliffs use the next layer.\nconst FIRST_CLIFF_LAYER := 10\nconst TOP_LEVEL := 2\n'],
  ['@onready var shadow: Sprite2D = $Shadow\n', '@onready var shadow: Sprite2D = $Shadow\n@onready var floor_probe: Area2D = $FloorProbe\n'],
]).replace(
  /\n*$/,
  '\n\n\n' +
    patch(UPDATE_HEIGHT, [
      ['\tvar floor_z := 0.0  # flat ground for now; lesson 2 reads it from the level\n', '\tvar floor_z := _floor_height()\n'],
      ['\t_airborne = not grounded\n', '\t_airborne = not grounded\n\t_update_cliff_mask()\n'],
    ]) +
    '\n\n' +
    LEVELS_FUNCS,
);

// ------------------------------------------------------------------ lesson c03-3: platformer
const PLATFORMER = gd`
class_name PlatformerPlayer
extends CharacterBody2D

@export var run_speed := 100.0
@export var run_acceleration := 1000.0

@export_group("Jump")
## Apex height of a full jump, px.
@export var jump_height := 40.0
## Seconds from takeoff to the apex.
@export var time_to_peak := 0.35
## Seconds from the apex back to takeoff height; shorter than time_to_peak, so falls feel snappy.
@export var time_to_fall := 0.28
## Highest falling speed, px/s.
@export var max_fall_speed := 300.0
## Seconds after leaving a ledge during which a jump still works.
@export var coyote_time := 0.1
## Seconds a jump press is remembered before landing.
@export var jump_buffer := 0.12
## Upward speed is multiplied by this when jump is released while rising.
@export var jump_cut := 0.5
## Vertical speeds below this (px/s) count as the apex.
@export var apex_threshold := 30.0
## Gravity multiplier at the apex while jump is held.
@export var apex_gravity_scale := 0.5

# Seconds since we last stood on a floor, and since jump was last pressed. INF means "never".
var _since_on_floor := INF
var _since_jump_press := INF

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D


func _physics_process(delta: float) -> void:
    # Derived every frame, so edits in the Inspector apply while the game runs.
    var jump_velocity := -2.0 * jump_height / time_to_peak
    var rise_gravity := 2.0 * jump_height / (time_to_peak * time_to_peak)
    var fall_gravity := 2.0 * jump_height / (time_to_fall * time_to_fall)

    if is_on_floor():
        _since_on_floor = 0.0
    if Input.is_action_just_pressed("jump"):
        _since_jump_press = 0.0

    # y grows downward, so "rising" means velocity.y < 0.
    var gravity := rise_gravity if velocity.y < 0.0 else fall_gravity
    if absf(velocity.y) < apex_threshold and Input.is_action_pressed("jump"):
        gravity *= apex_gravity_scale
    if not is_on_floor():
        velocity.y = minf(velocity.y + gravity * delta, max_fall_speed)

    # A recent press and a recent floor: covers both early presses and late presses.
    if _since_jump_press <= jump_buffer and _since_on_floor <= coyote_time:
        velocity.y = jump_velocity
        _since_jump_press = INF  # consume the press
        _since_on_floor = INF  # and the coyote window, so one ledge gives one jump

    # Variable height: letting go while rising cuts the upward speed.
    if Input.is_action_just_released("jump") and velocity.y < 0.0:
        velocity.y *= jump_cut

    var direction := Input.get_axis("move_left", "move_right")
    velocity.x = move_toward(velocity.x, direction * run_speed, run_acceleration * delta)
    move_and_slide()

    _since_on_floor += delta
    _since_jump_press += delta
    _update_animation(direction)


func _update_animation(direction: float) -> void:
    if direction != 0.0:
        sprite.flip_h = direction < 0.0
    var anim := "idle_side"
    if not is_on_floor():
        anim = "jump_side"
    elif absf(velocity.x) > 5.0:
        anim = "walk_side"
    if sprite.animation != anim:
        sprite.play(anim)
`;

const MOVING_PLATFORM = gd`
extends AnimatableBody2D

## How far the platform travels from its start, px.
@export var offset := Vector2(80.0, 0.0)
## Seconds for one leg of the trip.
@export var duration := 2.0


func _ready() -> void:
    var start := position
    var tween := create_tween().set_loops()
    # Move in physics frames, so bodies standing on it are carried without jitter.
    tween.set_process_mode(Tween.TWEEN_PROCESS_PHYSICS)
    tween.tween_property(self, "position", start + offset, duration).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
    tween.tween_property(self, "position", start, duration).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
`;

const PLATFORMER_DROP = patch(PLATFORMER, [
  ['var _since_jump_press := INF\n', 'var _since_jump_press := INF\nvar _drop_left := 0.0\n\n## Physics layer of one-way platforms (Project Settings → Layer Names → 2D Physics).\nconst ONE_WAY_LAYER := 12\n'],
  [
    '\tif Input.is_action_just_pressed("jump"):\n\t\t_since_jump_press = 0.0\n',
    '\tif Input.is_action_just_pressed("jump"):\n\t\t_since_jump_press = 0.0\n\n\t# Down + jump on a one-way platform drops through it instead of jumping.\n\t_drop_left = maxf(_drop_left - delta, 0.0)\n\tif _since_jump_press == 0.0 and Input.is_action_pressed("move_down") and _on_one_way_floor():\n\t\t_drop_left = 0.25\n\t\t_since_jump_press = INF\n\t\t_since_on_floor = INF  # and no coyote jump out of the drop\n\tset_collision_mask_value(ONE_WAY_LAYER, _drop_left <= 0.0)\n',
  ],
]).replace(
  /\n*$/,
  '\n\n\n' +
    gd`
## True when one of the surfaces we touched in the last move is on the one-way layer.
func _on_one_way_floor() -> bool:
    if not is_on_floor():
        return false
    for i in get_slide_collision_count():
        var body := get_slide_collision(i).get_collider() as CollisionObject2D
        if body and body.get_collision_layer_value(ONE_WAY_LAYER):
            return true
    return false
`,
);

export const MODULE: Module = {
  id: 'c03',
  part: 'core',
  order: 3,
  title: 'Jumping, height and platforming',
  summary: 'A fake height axis for jumping in a top-down world, elevation levels with collision per level, and a side-view platformer controller with coyote time, jump buffering and variable jump height.',
  relevance: md`Shardbound's overworld has cliffs, ruins and gaps that Kai crosses by jumping, so height is part of exploration and of puzzle design. This module gives Kai a height (\`z\`) with a shadow, elevation levels he can jump up to and drop down from, and the reach numbers you need to design jumping puzzles. The side-view controller covers the platforming rooms, and its forgiveness tricks (coyote time, buffering) carry over to every action in the game.`,
  prereqs: ['c02', 'm02'],
  areas: ['feel', 'math', 'godot'],
  lessons: [
    {
      id: 'c03-1',
      title: 'A fake Z axis: jumping in a top-down world',
      minutes: 40,
      objectives: [
        'Represent height as a separate value $z$ and draw the sprite at $(x, y - z)$ with the shadow left on the ground.',
        'Derive gravity $g = 2h/T^2$ and jump velocity $v_0 = 2h/T$ from a jump height and a time to the apex.',
        'Integrate the jump exactly for constant gravity and detect the landing.',
        'Scale the shadow with height and add landing feedback.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`In a top-down game the screen shows the ground from above and at an angle, and both screen axes are taken: $x$ is left–right and $y$ is near–far. A jump needs a third direction, up, and the screen has no axis left for it.

The trick used by top-down games with jumping, *CrossCode* being the clearest example, is to keep height as a separate number, $z$, and only use it when drawing: the character's sprite is drawn $z$ pixels higher than its position on the ground, while a shadow stays on the ground. The eye reads the gap between sprite and shadow as height. Collisions keep working in 2D on the ground position; nothing in the physics engine knows about $z$.

This lesson adds that height to Kai. Physics stays in $(x, y)$; $z$ and its velocity are two more floats in the player script.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Ground position, height, screen position',
          md: md`- **Ground position** $(x, y)$: where the character stands on the ground plane. This is the \`CharacterBody2D\`'s \`position\`, the thing \`move_and_slide\` moves and collides.
- **Height** $z \ge 0$: how far above the ground the character is, in pixels, up is positive. **Vertical speed** \`z_velocity\`, px/s, up is positive.
- **Screen position** of the sprite: $(x, y - z)$. Screen $y$ grows downward, so rising means subtracting.
- **Shadow**: drawn at the ground position $(x, y)$, smaller when $z$ is larger.`,
        },
        {
          kind: 'assets',
          ids: ['hero', 'sfx_jump', 'sfx_land'],
          note: md`Kai's sheet has \`jump_down\` and \`jump_side\` (flip for left); there is no \`jump_up\`, so the code uses \`jump_down\` when he faces up. The shadow needs no art: a \`GradientTexture2D\` makes one.`,
        },
        {
          kind: 'derive',
          title: 'gravity and jump speed from height and time',
          goal: md`A designer specifies a jump by its apex height $h$ and the time to reach it, $T$. Find the gravity $g$ and the takeoff speed $v_0$.`,
          steps: [
            { md: md`Under constant gravity, $z(t) = v_0 t - \tfrac12 g t^2$ and $\dot z(t) = v_0 - g t$ (m02).` },
            {
              md: md`At the apex the vertical speed is zero: $v_0 - gT = 0$, so $v_0 = gT$.`,
              choose: {
                prompt: md`What is true at the apex?`,
                options: [md`The vertical speed is zero`, md`The acceleration is zero`, md`The height equals $v_0 T$`],
                answer: 0,
                explain: md`Gravity never stops acting, so the acceleration is $-g$ everywhere; the apex is where the speed changes sign.`,
              },
            },
            { md: md`The height at the apex is $h = v_0 T - \tfrac12 g T^2 = gT^2 - \tfrac12 gT^2 = \tfrac12 g T^2$, so $$g = \frac{2h}{T^2}, \qquad v_0 = gT = \frac{2h}{T}.$$` },
            { md: md`For $h = 20$ px and $T = 0.25$ s: $g = 40/0.0625 = 640$ px/s² and $v_0 = 40/0.25 = 160$ px/s. The jump lasts $2T = 0.5$ s on flat ground; at 90 px/s Kai covers 45 px, nearly three tiles.` },
          ],
          takeaway: md`Never tune gravity and jump speed directly: they interact, and every change of one breaks the other. Tune height and time, the two things a player perceives, and derive both.`,
        },
        {
          kind: 'numeric',
          q: md`A jump should reach 24 px in 0.3 s. Find the gravity (px/s²) and the takeoff speed (px/s). Enter both.`,
          answer: { kind: 'vector', value: [533.333, 160] },
          inputHint: 'e.g. 533.3, 160',
          explain: md`$g = 2 \cdot 24/0.09 \approx 533.3$ px/s², $v_0 = 2 \cdot 24/0.3 = 160$ px/s. Same takeoff speed as before, gentler gravity, so a higher and floatier jump.`,
        },
        {
          kind: 'text',
          md: md`### Designing the update

**Who owns $z$?** The player script, not the physics engine. \`move_and_slide\` moves the ground position; a separate function, \`_update_height\`, moves $z$. Keeping them apart means the dash, corner correction and walls all keep working while airborne, with no changes.

**When can Kai jump?** Only when grounded: $z$ at the floor and not moving up. Without the grounded check, mashing jump would climb into the sky.

**Integration.** From m02, updating velocity first and then position (semi-implicit Euler) slightly undershoots the apex. Here we own the integrator, and gravity is constant, so we can use the exact step: $$z \leftarrow z + v\,\Delta t - \tfrac12 g\,\Delta t^2, \qquad v \leftarrow v - g\,\Delta t.$$ This lands exactly on the parabola at every frame, so the apex is exactly \`jump_height\` at any frame rate.

**Landing.** When $z$ falls to the floor while moving down, clamp it to the floor and zero the speed. The check needs both conditions: on the takeoff frame $z$ is still at the floor, but the speed is positive.

**Drawing.** The sprite's resting offset is \`SPRITE_Y = -12\` (feet on the body origin, from c02-1). Each frame sets \`sprite.position.y = SPRITE_Y - z\`. The shadow is a sibling of the sprite, so it does not move with it.`,
        },
        { kind: 'code', file: 'scripts/player.gd', fragment: true, code: JUMP_VARS + '\n\n' + UPDATE_HEIGHT, note: md`Add the variables near the top of the player script, the function at the bottom, and a call to \`_update_height(delta)\` in \`_physics_process\` just before \`_update_animation()\`. Add \`const SPRITE_Y := -12.0\` under \`extends\`. The complete script is the build solution below.` },
        {
          kind: 'viz',
          viz: { type: 'core.height', mode: 'jump' },
          task: md`Click the figure and jump with Space while walking. Watch the arc (white dots) and the $z$ graph. Change \`time_to_peak\` and keep \`jump_height\`: the graph keeps its height and changes width. Turn off "shadow shrinks with height" and judge how high Kai seems to be at the apex.`,
          caption: md`The white dots trace the sprite's screen position $(x, y - z)$ during the last jump, a parabola stretched along the walking direction. "Last apex" is measured; with the exact update it equals \`jump_height\`.`,
        },
        {
          kind: 'check',
          q: md`A teammate makes the \`Shadow\` a child of the \`AnimatedSprite2D\` "so they stay together". What does the player see during a jump?`,
          options: [
            md`The shadow rises with the sprite, so the jump looks like the whole character teleporting upward and the height cue is lost.`,
            md`Nothing changes; children of sprites are drawn on the ground.`,
            md`The shadow is drawn on top of the character.`,
            md`The shadow flips when the sprite flips, otherwise nothing changes.`,
          ],
          answer: 0,
          explain: md`A child inherits its parent's position. Changing \`sprite.position.y\` would move the shadow up as well. The shadow must be a sibling, positioned by the body (the ground position).`,
        },
        {
          kind: 'steps',
          title: 'Give Kai a height and a shadow',
          steps: [
            md`In **Project → Project Settings → Input Map**, add the action \`jump\` and bind it to **Space** and the gamepad's bottom face button (A on Xbox layouts, Cross on PlayStation).`,
            md`Open \`scenes/player.tscn\`. Add a \`Sprite2D\` named \`Shadow\` as a child of \`Player\` and drag it *above* \`AnimatedSprite2D\` in the Scene dock, so it is drawn first, underneath.`,
            md`In the Shadow's *Texture*, choose **New GradientTexture2D**. Set *Width* 14, *Height* 6, *Fill* to **Radial**, *Fill From* (0.5, 0.5) and *Fill To* (1.0, 0.5). Edit its *Gradient*: the left stop black with alpha about 0.4, the right stop black with alpha 0. You get a soft dark ellipse.`,
            md`Add the \`jump_*\` animations to the SpriteFrames (\`jump_down\`, \`jump_side\`, 10 FPS, loop off). Add two \`AudioStreamPlayer2D\` children, \`JumpSound\` and \`LandSound\`, with \`sfx_jump\` and \`sfx_land\`.`,
            md`Update \`scripts/player.gd\` with the fragment above (or the build solution) and run the test room with **F6**.`,
          ],
          result: md`Space makes Kai jump about 20 px with his shadow staying on the ground and shrinking as he rises. He can walk, turn and dash in the air. He lands where the shadow is.`,
          troubleshoot: [
            { problem: md`Kai jumps but sinks into the ground afterwards, or floats a few pixels up.`, fix: md`The sprite's resting offset in the scene must match \`SPRITE_Y\`. If you moved the \`AnimatedSprite2D\` to y = -12 in c02-1, use -12; the code now sets the y position every frame.` },
            { problem: md`The shadow is drawn over Kai.`, fix: md`Children draw in tree order: \`Shadow\` must come before \`AnimatedSprite2D\` in the Scene dock.` },
            { problem: md`Holding Space makes Kai jump again on every landing.`, fix: md`Use \`Input.is_action_just_pressed("jump")\`, which is true for one physics frame per press, not \`is_action_pressed\`.` },
          ],
        },
        {
          kind: 'build',
          ch: {
            id: 'c03-1-build',
            title: 'A jump with weight',
            goal: md`Make the jump read clearly: a sound on takeoff, a sound and a short squash on landing, the jump animation in the air.`,
            requirements: [
              md`The apex is 20 px with the default values, and the jump lasts 0.5 s on flat ground.`,
              md`Takeoff plays \`sfx_jump\`; landing plays \`sfx_land\` once.`,
              md`On landing the sprite squashes (wider and shorter) and springs back within about 0.12 s.`,
              md`In the air Kai plays \`jump_side\` (flipped for left) or \`jump_down\`, and returns to walk or idle on landing.`,
            ],
            hints: [
              md`Detect the landing inside the branch that clamps $z$ to the floor, and call a separate \`_on_landed()\` from there.`,
              md`\`set_trans(Tween.TRANS_BACK)\` overshoots slightly before settling, which reads as a springy recovery.`,
            ],
            solution: [{ file: 'scripts/player.gd', code: PLAYER_JUMP }],
            explain: md`The jump is self-contained: four exported or member values and one function, called once per frame after the horizontal movement. The landing branch is the single place where "we just touched down" is known, so the feedback hangs off it. The squash scales the sprite around its centre; if the feet lift visibly, set the sprite's *Offset* so its origin sits at the feet instead.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'c03-1-paper',
            title: 'A floaty jump',
            type: 'compute',
            difficulty: 2,
            minutes: 6,
            statement: md`A designer wants a jump that is 28 px high and lasts 0.7 s in total on flat ground. Find \`time_to_peak\`, the gravity and the takeoff speed, and how far Kai travels horizontally during the jump at 90 px/s. Enter $[T, g, v_0, d]$.`,
            solution: [
              md`Symmetric jump: $T = 0.7/2 = 0.35$ s.`,
              md`$g = 2 \cdot 28/0.35^2 = 56/0.1225 \approx 457.1$ px/s²; $v_0 = 2 \cdot 28/0.35 = 160$ px/s.`,
              md`Distance: $90 \cdot 0.7 = 63$ px, almost four tiles.`,
            ],
            answer: { kind: 'vector', value: [0.35, 457.143, 160, 63] },
          },
        },
        {
          kind: 'recall',
          prompt: md`Write the formulas for gravity and jump speed from height $h$ and time to apex $T$, and the exact position update for constant gravity.`,
          answer: md`$g = 2h/T^2$, $v_0 = 2h/T$. Exact step: $z \mathrel{+}= v\,\Delta t - \tfrac12 g\Delta t^2$, then $v \mathrel{-}= g\,\Delta t$.`,
        },
        {
          kind: 'explain',
          prompt: md`Why keep $z$ out of the physics engine instead of making the top-down world a 3D physics scene?`,
          model: md`Almost everything in a top-down game only cares about the ground plane: walls, enemies and triggers collide by footprint. Height only matters in a few places (jumping, ledges, projectiles that pass over low walls), and those can be handled by explicit rules on one number. A 3D physics scene would force every collision shape, tile and character into 3D and make pixel-exact 2D art much harder to line up. With a fake $z$ the 2D engine does the common case and a few lines of code handle the rest.`,
        },
      ],
      cards: [
        { id: 'c03-1-c1', kind: 'compute', front: md`Jump height 20 px, time to apex 0.25 s. Gravity in px/s²?`, answer: { kind: 'number', value: 640 }, back: md`$g = 2h/T^2 = 40/0.0625 = 640$ px/s².` },
        { id: 'c03-1-c2', kind: 'cloze', text: md`The sprite is drawn at screen position $(x, y - {{}})$ and the shadow at $(x, y)$.`, answers: ['z'] },
        { id: 'c03-1-c3', kind: 'concept', front: md`Why must the shadow be a sibling of the sprite rather than its child?`, back: md`Children move with their parent. The shadow has to stay on the ground while the sprite rises by $z$.` },
        { id: 'c03-1-c4', kind: 'concept', front: md`Exact position update for constant gravity, and why use it here?`, back: md`$z \mathrel{+}= v\Delta t - \tfrac12 g\Delta t^2$, then $v \mathrel{-}= g\Delta t$. It follows the parabola exactly, so the apex is exactly the designed height at any frame rate.` },
        { id: 'c03-1-c5', kind: 'compute', front: md`$v_0 = 160$ px/s, $g = 640$ px/s². Total air time on flat ground, in seconds?`, answer: { kind: 'number', value: 0.5 }, back: md`$2v_0/g = 320/640 = 0.5$ s.` },
      ],
    },
    {
      id: 'c03-2',
      title: 'Elevation levels, ledges and jumping puzzles',
      minutes: 45,
      objectives: [
        'Model ledges as footprints with an elevation level, drawn shifted up by their height.',
        'Find the floor height under the player with Area2D zones and a floor probe.',
        'Switch collision masks per elevation, so a cliff blocks only while the player is below its top.',
        'Compute the time window and distance in which a jump can reach a higher ledge.',
        'Design jumping puzzles from the jump\'s reach.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Kai stands below a cliff one tile high. Walking into it stops him. Jumping and pushing toward it carries him up onto the ledge, where he lands with his shadow on the ledge top. Walking off the far edge, he drops back down. Two tiles higher is a second ledge he can only reach from the first.

That is the whole elevation system: a set of ledges, each with a height, and two rules. Where am I standing (what is the floor height under my feet)? And which cliffs block me (those whose top is above my current height)?`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Elevation level, footprint, floor height',
          md: md`- **Elevation level** $L = 0, 1, 2, \dots$: the height of a surface in steps of one tile, \`LEVEL_HEIGHT = 16\` px. Level 0 is the base ground.
- **Footprint**: the rectangle a ledge covers on the ground plane. It is both the ledge's *wall* (for someone below it) and its *floor* (for someone on top).
- **Drawing**: like the player, a ledge's top surface is drawn shifted up by its height, $16L$ px; the cliff face fills the gap below it. Footprint and drawn top therefore differ by $16L$ pixels.
- **Floor height** \`floor_z\` $= 16L$ for the highest ledge whose footprint contains the player's feet, 0 if none.`,
        },
        {
          kind: 'text',
          md: md`### Choosing how to block cliffs

A cliff must block Kai when he is below its top and let him pass when he is at or above it. Three ways to do that:

1. **Check by hand.** Before moving, test the destination against every ledge and refuse the move if \`z < 16L\`. This rebuilds collision and sliding, which \`move_and_slide\` already does well.
2. **One scene per level.** Swap the whole collision world when Kai changes level. Heavy, and a jump that passes between levels mid-air is awkward.
3. **One physics layer per level.** Put the cliff footprints of level $L$ on their own layer, and include that layer in the player's collision mask only while $z < 16L$. The engine does the blocking and sliding; the script flips a few bits per frame.

Option 3 keeps the engine in charge and the rule in one line. This module uses physics layer 9 for elevation zones (\`elevation\`), 10 for level-1 cliffs (\`cliff_1\`) and 11 for level-2 cliffs (\`cliff_2\`), after the eight shared layers.

**Finding the floor.** Each ledge has an \`ElevationZone\` (an \`Area2D\` with a \`level\`) covering its footprint. The player carries a tiny \`Area2D\`, the \`FloorProbe\`, at the feet; \`get_overlapping_areas()\` lists the zones under it and the highest level wins. The probe is a 2×2 px point, smaller than the 10-px feet box. Kai's body is stopped by a cliff before his centre can enter the ledge's zone, so the floor can never jump up under a player who has not jumped.`,
        },
        {
          kind: 'derive',
          title: 'the window for jumping onto a ledge',
          goal: md`With jump height $h = 20$ and $T = 0.25$ ($v_0 = 160$, $g = 640$), find the time interval during which $z \ge 16$, starting from the ground.`,
          steps: [
            { md: md`Solve $v_0 t - \tfrac12 g t^2 \ge 16$, i.e. $320 t^2 - 160 t + 16 \le 0$, or after dividing by 320: $t^2 - 0.5\,t + 0.05 \le 0$.` },
            {
              md: md`The quadratic formula gives the roots $$t = \frac{0.5 \pm \sqrt{0.25 - 0.2}}{2} = \frac{0.5 \pm 0.2236}{2},$$ so $t_1 \approx 0.138$ s and $t_2 \approx 0.362$ s.`,
              choose: {
                prompt: md`The parabola opens upward in $t$ (positive $t^2$ coefficient). Where is it $\le 0$?`,
                options: [md`Between the two roots`, md`Outside the two roots`, md`Only at the larger root`],
                answer: 0,
                explain: md`An upward-opening parabola is negative between its roots; there the height is above 16 px.`,
              },
            },
            { md: md`The window lasts $t_2 - t_1 \approx 0.224$ s, about 13 frames. At 90 px/s Kai covers about 20 px in it. In general the window is $2\sqrt{2(h - 16)/g}$: with $h = 16$ exactly it shrinks to an instant, which is why the jump must be clearly higher than one level.` },
          ],
          takeaway: md`A step-up needs $h > 16$ with margin, and the player must be within about 20 px of the cliff when the window opens. With $h = 20$ the window is generous; with $h = 17$ it would be about 0.11 s and feel unreliable.`,
        },
        {
          kind: 'numeric',
          q: md`With $h = 24$ px and $T = 0.3$ s ($g \approx 533.3$), how long (s) is Kai above 16 px during a jump from the ground? Use $2\sqrt{2(h-16)/g}$.`,
          answer: { kind: 'number', value: 2 * Math.sqrt((2 * 8) / (2 * 24 / 0.09)) },
          explain: md`$2\sqrt{16/533.3} = 2\sqrt{0.03} \approx 0.346$ s, about 21 frames.`,
        },
        { kind: 'code', file: 'scripts/elevation_zone.gd', code: ELEVATION_ZONE, note: md`The zone sets its own layer in \`_ready\`, so you cannot forget it in the Inspector. Turning \`monitoring\` off means the zone never looks for overlaps itself; it is only found.` },
        { kind: 'code', file: 'scripts/ledge.gd', code: LEDGE, note: md`One scene, configured by three exported values. The \`RectangleShape2D\` is shared by the cliff and the zone, so their footprints can never disagree. \`ColorRect\` placeholders stand in for tiles until c04 builds tile maps.` },
        { kind: 'code', file: 'scripts/player.gd', fragment: true, code: LEVELS_VARS + '\n\n' + LEVELS_FUNCS, note: md`In \`_update_height\`, replace \`var floor_z := 0.0\` with \`var floor_z := _floor_height()\` and call \`_update_cliff_mask()\` after \`_airborne = not grounded\`. Standing on level 1, $z = 16$ exactly, so \`z < 16\` is false and level-1 cliffs no longer block: Kai can walk off the edge.` },
        {
          kind: 'viz',
          viz: { type: 'core.height', mode: 'levels' },
          task: md`Walk up into the lower cliff (16 px): blocked, and its footprint outline is red. Jump while pushing up: the outline turns white once $z \ge 16$ and Kai lands on top. From there reach the 32-px ledge. Then try to jump the 32-px gap to the ledge on the right, and lower \`jump_height\` until you can no longer make it.`,
          caption: md`Dashed rectangles are footprints (collision and floor zones); the tops are drawn $16L$ px higher. Red means that cliff's layer is in Kai's mask right now. The yellow box is Kai's 10×6 feet collider. Kai is drawn behind a ledge when he stands north of its footprint, which is what y-sorting by footprint gives you.`,
        },
        {
          kind: 'check',
          q: md`Kai stands on a level-1 ledge ($z = 16$). Next to him is a level-2 ledge. Which cliff layers are in his mask, and can he walk onto the level-2 ledge?`,
          options: [
            md`Only \`cliff_2\`; he cannot walk onto it, he must jump to $z \ge 32$.`,
            md`Both; he cannot move at all.`,
            md`Neither; he can walk onto it.`,
            md`Only \`cliff_1\`; he can walk onto the level-2 ledge.`,
          ],
          answer: 0,
          explain: md`\`z < 16\` is false (so \`cliff_1\` is off) and \`z < 32\` is true (so \`cliff_2\` is on). From $z = 16$ a 20-px jump peaks at 36, which clears 32.`,
        },
        {
          kind: 'steps',
          title: 'Build ledges and a small height test',
          steps: [
            md`In **Project → Project Settings → Layer Names → 2D Physics**, name layer 9 \`elevation\`, layer 10 \`cliff_1\` and layer 11 \`cliff_2\`.`,
            md`Create \`scenes/ledge.tscn\`: root \`Node2D\` named \`Ledge\` with \`scripts/ledge.gd\`. Children: a \`ColorRect\` \`Face\` (brown), a \`ColorRect\` \`Top\` (a lighter green) *below Face* in the tree so the top draws over the face, a \`StaticBody2D\` \`Cliff\` with a child \`CollisionShape2D\`, and an \`Area2D\` \`Zone\` with \`scripts/elevation_zone.gd\` and a child \`CollisionShape2D\`. Leave the shapes empty; the script fills them. Set both ColorRects' *Mouse → Filter* to **Ignore**.`,
            md`In \`player.tscn\`, add an \`Area2D\` named \`FloorProbe\` at (0, 0) with a 2×2 **RectangleShape2D**. Set its *Collision Layer* to none and its *Mask* to layer 9 only. On the \`Player\` body, add layers 10 and 11 to the *Mask* (keep layer 1).`,
            md`Make the room y-sorted: select the root of \`test_room.tscn\` and turn on **Ordering → Y Sort Enabled**. Instance two ledges: one with level 1, size (160, 80); one with level 2, base level 1, size (72, 40), placed inside the first. Update the player script with the fragment and run.`,
          ],
          result: md`Kai is stopped by the cliff faces, jumps up onto the first ledge and from there onto the second, and drops off any edge with a short fall. Behind a ledge (north of it) he is hidden by it; on top or in front he is drawn over it.`,
          troubleshoot: [
            { problem: md`Kai walks through cliffs as if they were not there.`, fix: md`The \`Player\` mask needs layers 10 and 11 at start; \`_update_cliff_mask\` only switches them. Also check that the \`Cliff\` body got its layer: run with **Debug → Visible Collision Shapes** on.` },
            { problem: md`Kai lands on top but immediately falls through the ledge.`, fix: md`\`_floor_height()\` returned 0: the \`FloorProbe\` mask must include layer 9 and its *Monitoring* must be on. The zones must be \`ElevationZone\`s (the script attached).` },
            { problem: md`The ledge top is drawn over Kai when he stands on it.`, fix: md`Y-sorting compares the \`Ledge\` node's y (the top edge of the footprint) with Kai's. Both must be direct children of the y-sorted room; a ledge nested under another node sorts with that node.` },
          ],
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'Jumping puzzles from the reach numbers',
          md: md`Top-down jumping puzzles (rooms of ledges, gaps and drops) are built from a few pieces whose difficulty follows from the jump's numbers. With $h = 20$, $T = 0.25$ and 90 px/s:

| Piece | Rule | Default numbers |
|---|---|---|
| Gap at the same level | gap $<$ reach $= v \cdot 2T$ | reach 45 px: a 2-tile gap is comfortable, 3 tiles is impossible |
| Step up one level | $h > 16$; take off within the window distance | window 0.22 s, about 20 px |
| Step up two levels | impossible from the ground; needs an intermediate ledge | forces a route |
| Drop | always allowed; falling takes longer from higher | $\sqrt{2 \cdot 16/640} \approx 0.22$ s per level from rest |

Some games, *CrossCode* among them, make the jump automatic: running off a ledge toward a reachable surface jumps by itself, which removes the timing and turns puzzles into route-finding. Pick one style for Shardbound and design every gap from the same numbers, so players learn the reach once.`,
        },
        {
          kind: 'check',
          q: md`Two level-1 ledges are separated by a 40-px gap of level-0 ground. With the default jump (reach 45 px), what happens if Kai takes off 8 px before the edge?`,
          options: [
            md`He needs 48 px but has 45: he comes down below 16 px before reaching the far ledge, its cliff blocks him, and he falls to the ground.`,
            md`He lands on the far ledge with 5 px to spare.`,
            md`He stops in mid-air above the gap.`,
            md`He falls immediately because he left the floor zone.`,
          ],
          answer: 0,
          explain: md`From takeoff he travels 45 px before $z$ returns to 16. Takeoff 8 px early means 48 px to cover. Gaps should be designed with slack for imprecise takeoffs, which is why two tiles (32 px) is the comfortable maximum.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'c03-2-build',
            title: 'A three-level puzzle room',
            goal: md`Build a room where the exit sits on a level-2 ledge that can only be reached by a route: ground, a level-1 ledge, a 2-tile gap to a second level-1 ledge, then up to level 2.`,
            requirements: [
              md`Kai cannot reach level 2 from the ground directly anywhere in the room.`,
              md`The 2-tile gap can be jumped every time from a run, and a 3-tile gap elsewhere cannot be jumped at all.`,
              md`Falling off any ledge lands Kai on the level below with his shadow on that level's surface during the fall.`,
              md`Kai is drawn behind ledges when north of them and in front when south of them or on top.`,
            ],
            hints: [
              md`The shadow uses \`shadow.position.y = -floor_z\`, so during a fall from level 1 it jumps down to the ground as soon as the probe leaves the zone. That is correct: the shadow shows where he will land.`,
              md`Use the reach table: 32-px gap yes, 48-px gap no, with the default jump.`,
            ],
            solution: [
              { file: 'scripts/player.gd', code: PLAYER_LEVELS },
              { file: 'scripts/ledge.gd', code: LEDGE },
              { file: 'scripts/elevation_zone.gd', code: ELEVATION_ZONE },
            ],
            explain: md`All the elevation logic lives in two small player functions and two tiny scripts. \`_floor_height\` asks "what am I standing on?" and \`_update_cliff_mask\` answers "what blocks me?"; everything else (sliding along cliffs, falling, landing) falls out of \`move_and_slide\` and \`_update_height\` unchanged.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'c03-2-paper',
            title: 'The widest gap',
            type: 'compute',
            difficulty: 2,
            minutes: 6,
            statement: md`Kai walks at 90 px/s and his jump uses $h = 20$ px, $T = 0.25$ s. Taking off exactly at the edge of a level-1 ledge, what is the widest gap (px) to another level-1 ledge he can cross? He must be over the far ledge before $z$ drops back to 16 px.`,
            hints: [md`Jumping from level 1, the jump starts at $z = 16$ and returns to 16 after the full air time $2T$.`],
            solution: [md`From $z = 16$ the jump returns to 16 after $2T = 0.5$ s.`, md`In that time Kai moves $90 \cdot 0.5 = 45$ px, so the widest gap is 45 px. In practice design for 32 px (two tiles) to leave room for early takeoffs.`],
            answer: { kind: 'number', value: 45 },
          },
        },
        {
          kind: 'recall',
          prompt: md`State the two rules of the elevation system and how each is implemented in Godot.`,
          answer: md`Floor: the floor height is $16L$ for the highest \`ElevationZone\` under the feet, found with a small \`FloorProbe\` area and \`get_overlapping_areas()\`. Blocking: the cliffs of level $L$ are on their own physics layer, which is in the player's mask only while \`z < 16L\` (\`set_collision_mask_value\`).`,
        },
        {
          kind: 'explain',
          prompt: md`Why is the floor probe a 2×2 point instead of the full 10×6 feet box?`,
          model: md`The floor height must change only when the player's centre is over a ledge. If the probe were as wide as the feet, it would touch a ledge's zone while the body is still being held back by that ledge's cliff, and \`floor_z\` would jump to 16 under a player standing on the ground below, lifting him onto the ledge without a jump. A point probe is smaller than the collider, so the body is always stopped before the probe can reach a higher zone.`,
        },
      ],
      cards: [
        { id: 'c03-2-c1', kind: 'concept', front: md`In the elevation system, when does a level-$L$ cliff block the player?`, back: md`While \`z < L * 16\`. Its physics layer is in the player's collision mask only then.` },
        { id: 'c03-2-c2', kind: 'cloze', text: md`\`set_collision_{{}}_value(10, z < 16.0)\` switches whether the player collides with layer 10.`, answers: ['mask'] },
        { id: 'c03-2-c3', kind: 'compute', front: md`Jump reach at 90 px/s with air time 0.5 s, in px?`, answer: { kind: 'number', value: 45 }, back: md`$90 \cdot 0.5 = 45$ px: a two-tile gap is safe, three tiles is not.` },
        { id: 'c03-2-c4', kind: 'concept', front: md`Why does a ledge's top surface appear 16L px above its footprint?`, back: md`Everything is drawn at $(x, y - z)$; the top of a level-$L$ ledge has $z = 16L$. The footprint is where it stands on the ground plane, and it is what collides.` },
        { id: 'c03-2-c5', kind: 'concept', front: md`How does the player find the floor height under the feet?`, back: md`A tiny \`FloorProbe\` \`Area2D\` at the feet; \`get_overlapping_areas()\` lists \`ElevationZone\`s; floor height = 16 × the highest level, or 0.` },
      ],
    },
    {
      id: 'c03-3',
      title: 'A side-view platformer controller',
      minutes: 45,
      objectives: [
        'Derive separate rise and fall gravity from a jump height and two times.',
        'Implement coyote time and jump buffering as "time since" timers.',
        'Add variable jump height with a jump cut, an apex hang and a fall-speed cap.',
        'Use is_on_floor, one-way platforms and a moving AnimatableBody2D that carries the player.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Some of Shardbound's rooms are seen from the side: a ruined tower climbed from the inside, a cave crossed on moving platforms. There Kai uses a separate controller whose \`y\` is real height and gravity is always on.

A side-view jump that only uses one gravity and "jump if on the floor" works, and feels poor. Players complain that the game ignored their jump at the edge of a platform, or right before landing, that the jump is floaty, that they cannot make small hops. Each complaint has a standard fix, and each fix is a few lines once the controller is structured around timers.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'The forgiving jump',
          md: md`- **Coyote time:** a jump still works for a short time (about 0.1 s) after walking off a ledge. Named after the cartoon coyote who runs off cliffs and only falls once he looks down.
- **Jump buffer:** a jump pressed shortly before landing (about 0.1–0.15 s) fires on the landing frame.
- **Variable jump height:** releasing jump while rising cuts the upward speed, so a tap gives a hop and a hold gives a full jump.
- **Apex hang:** gravity is reduced near the top of the jump while the button is held, which gives a moment of control at the apex.
- **Fall-speed cap:** falling speed is limited, so long falls stay readable and controllable.
- **Asymmetric gravity:** falling is faster than rising, so the jump feels decisive instead of floaty.`,
        },
        {
          kind: 'derive',
          title: 'rise and fall gravity, and the shortest hop',
          goal: md`From a jump height $h$, a rise time $T_\uparrow$ and a fall time $T_\downarrow$, find the takeoff velocity and the two gravities. Then find the height of the shortest possible hop with a jump cut factor $c$.`,
          steps: [
            { md: md`The rise is the c03-1 derivation with y pointing down: $v_0 = -2h/T_\uparrow$ (negative is up) and $g_\uparrow = 2h/T_\uparrow^2$.` },
            { md: md`The fall from the apex (speed 0) back down by $h$ takes $T_\downarrow$: $h = \tfrac12 g_\downarrow T_\downarrow^2$, so $g_\downarrow = 2h/T_\downarrow^2$. With $h = 40$, $T_\uparrow = 0.35$, $T_\downarrow = 0.28$: $v_0 \approx -228.6$ px/s, $g_\uparrow \approx 653$, $g_\downarrow \approx 1020$ px/s².` },
            {
              md: md`A cut on the first frame turns $v_0$ into $c\,v_0$. The height reached with speed $v$ under $g_\uparrow$ is $v^2/(2g_\uparrow)$, so the hop reaches $$h_{\min} = \frac{(c v_0)^2}{2 g_\uparrow} = c^2 h.$$`,
              choose: {
                prompt: md`How does the apex height depend on the takeoff speed?`,
                options: [md`Quadratically: $v^2/(2g)$`, md`Linearly: $v/g$`, md`Not at all; only gravity matters`],
                answer: 0,
                explain: md`From $v^2 = v_0^2 - 2gz$ with $v = 0$ at the apex: $z = v_0^2/(2g)$. Halving the speed quarters the height.`,
              },
            },
          ],
          takeaway: md`With $c = 0.5$ the smallest hop is a quarter of the full jump: 10 px for a 40 px jump. Pick $c$ from the hop you want: $c = \sqrt{h_{\min}/h}$.`,
        },
        {
          kind: 'numeric',
          q: md`A full jump is 48 px and the designer wants the smallest hop to be 12 px. What jump cut factor $c$ is needed?`,
          answer: { kind: 'number', value: 0.5 },
          explain: md`$c = \sqrt{12/48} = \sqrt{0.25} = 0.5$.`,
        },
        {
          kind: 'text',
          md: md`### Structuring the controller around timers

Coyote time and buffering look like two features. They are one test. Keep two numbers: seconds since the player was last on the floor, and seconds since jump was last pressed. A jump happens when *both* are small enough:

- pressed now, on the floor now: both are 0, ordinary jump;
- pressed now, left the floor 4 frames ago: coyote time;
- pressed 5 frames ago, landing now: buffered jump.

After jumping, set both timers to \`INF\`: the press is consumed, and the same coyote window cannot give a second jump. This is the same "seconds since, \`INF\` when used" pattern as the dash buffer in c02-2.

**Order of operations.** Refresh the timers from this frame's state, apply gravity, test for the jump, apply the cut, move, then age the timers. \`is_on_floor()\` reports the result of the *previous* \`move_and_slide()\`, which is exactly the state at the start of this frame.`,
        },
        { kind: 'code', file: 'scripts/platformer_player.gd', code: PLATFORMER, note: md`A separate \`class_name\` from \`Player\`: the side-view rooms instance this scene instead. \`Input.get_axis\` returns -1, 0 or 1 on a keyboard and anything between on a stick. \`move_toward\` for a single float is the global function.` },
        {
          kind: 'viz',
          viz: { type: 'core.platformer' },
          task: md`Run right off the starting ledge and press jump just after leaving it: the blue coyote bar on the timeline catches it. Turn coyote time off and try again. Then press jump a few frames before landing, with and without the buffer. Tap and hold jump to compare heights. Finally stand on the moving platform and jump off it in its direction of travel.`,
          caption: md`The timeline shows the last 130 frames: when Kai was on a floor, when jump was held and pressed, the buffer and coyote windows, accepted jumps and presses that were eaten. "Last apex" is measured: about 2 px under \`jump_height\`, because \`move_and_slide\` integrates with velocity first (problem 9 explains the gap).`,
        },
        {
          kind: 'check',
          q: md`Coyote time is 0.1 s. Kai walks off a ledge and the player presses jump 8 frames later. With the listing above, what happens?`,
          options: [
            md`Nothing: 8 frames is about 0.133 s, more than 0.1 s, so the press waits in the buffer and fires on landing if it is within 0.12 s of the press.`,
            md`He jumps, because the buffer adds 0.12 s to the coyote time.`,
            md`He jumps with half height.`,
            md`He jumps, because \`is_on_floor()\` is still true for one second.`,
          ],
          answer: 0,
          explain: md`Both conditions must hold at the same frame. The press is buffered, but the landing happens well after 0.12 s for a real fall, so in practice the jump is eaten. The two windows do not add up.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'Floors, one-way platforms and moving platforms',
          md: md`- \`CharacterBody2D\` in **Grounded** motion mode (the default) uses \`up_direction\` (default \`Vector2.UP\`) to sort contacts into floor, wall and ceiling. \`is_on_floor()\` is true after a \`move_and_slide()\` that touched a floor. *Floor → Snap Length* keeps the body glued to slopes and steps going down.
- **One-way platforms:** select the platform's \`CollisionShape2D\` and turn on **One Way Collision**. The shape only collides with bodies coming from the side its arrow points away from (by default, from above), so you can jump up through it and land on it.
- **Moving platforms:** use an \`AnimatableBody2D\`. Move it from code, a tween or an \`AnimationPlayer\`; with *Sync to Physics* on (the default) its motion is applied in the physics step. A \`CharacterBody2D\` standing on it is carried by \`move_and_slide()\`. When the character leaves the platform, its *Platform On Leave* setting decides what happens to the platform's velocity: **Add Velocity** (the default) adds it, so jumping off a moving platform carries its momentum.`,
        },
        { kind: 'code', file: 'scripts/moving_platform.gd', code: MOVING_PLATFORM, note: md`\`set_loops()\` with no argument repeats forever. \`TWEEN_PROCESS_PHYSICS\` steps the tween in physics frames, the same clock as \`move_and_slide\`, so the platform and the player never disagree about where the platform is.` },
        {
          kind: 'steps',
          title: 'Build a side-view test room',
          steps: [
            md`Create \`scenes/platformer_player.tscn\`: a \`CharacterBody2D\` named \`PlatformerPlayer\` with an \`AnimatedSprite2D\` (Kai's frames, at y = -12) and a \`CollisionShape2D\` with a 10×20 **RectangleShape2D** whose bottom edge sits at the origin (position (0, -10)). Attach \`scripts/platformer_player.gd\`.`,
            md`Create \`scenes/side_room.tscn\` with a \`Node2D\` root. Add floors as \`StaticBody2D\`s with rectangle shapes on layer 1 (\`world\`): a ground strip with a 48-px gap and a raised block. Draw them with \`ColorRect\`s or the \`tiles_platform\` tiles.`,
            md`Add a one-way platform: a \`StaticBody2D\` with a 56×4 rectangle shape and **One Way Collision** on.`,
            md`Add a moving platform: an \`AnimatableBody2D\` with a 40×8 shape and a \`ColorRect\`, with \`scripts/moving_platform.gd\`; set *Offset* to (80, 0).`,
            md`Instance the player, add a \`Camera2D\` as its child if the room is larger than the screen, and run the scene with **F6**.`,
          ],
          result: md`Kai runs, jumps 40 px with a full press and about 10 px with a tap, can still jump a few frames after running off an edge, jumps on the landing frame if you press early, jumps up through the one-way platform and lands on it, and rides the moving platform.`,
          troubleshoot: [
            { problem: md`\`is_on_floor()\` is never true and Kai cannot jump.`, fix: md`*Motion Mode* must be **Grounded** (not Floating, which the top-down Kai uses), and *Up Direction* must be (0, -1).` },
            { problem: md`Kai slides off the moving platform.`, fix: md`The platform must be an \`AnimatableBody2D\` moved in physics frames. A \`StaticBody2D\` moved by changing \`position\` does not report a velocity, so nothing carries the player.` },
            { problem: md`Kai lands on the one-way platform from below or the side.`, fix: md`The one-way arrow must point up (rotation 0). One-way collision is a property of the \`CollisionShape2D\`, not of the body.` },
          ],
        },
        {
          kind: 'text',
          md: md`### Why the apex is 2 px short

\`move_and_slide()\` moves by the velocity *after* this frame's gravity was applied (semi-implicit Euler, m02). Each frame of the rise therefore moves a little less than the exact parabola would, and the total shortfall at the apex is $g_\uparrow\,\Delta t\,T_\uparrow/2 = h\,\Delta t/T_\uparrow$: for $h = 40$ and $T_\uparrow = 0.35$, about 1.9 px. Two pixels rarely matter, but they explain why a carefully designed 40-px jump fails to clear a 40-px wall. Either design walls with a few pixels of margin, or apply half the gravity before \`move_and_slide()\` and half after, which follows the parabola exactly for constant gravity.`,
        },
        {
          kind: 'check',
          q: md`A teammate wants a "floatier" jump and lowers \`fall_gravity\` by hand to 300 while leaving everything else. What else changes?`,
          options: [
            md`Only the fall gets slower; the apex height is unchanged because it depends on rise gravity and takeoff speed.`,
            md`The jump becomes higher.`,
            md`The rise becomes slower too.`,
            md`Coyote time gets longer.`,
          ],
          answer: 0,
          explain: md`The apex is $v_0^2/(2g_\uparrow)$; fall gravity only acts once \`velocity.y >= 0\`. Changing it by hand breaks the link to \`time_to_fall\`, though: set \`time_to_fall\` instead, and the code derives the gravity.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'c03-3-build',
            title: 'Drop through one-way platforms',
            goal: md`Let the player hold down and press jump on a one-way platform to drop through it. On solid ground, down + jump should still jump.`,
            requirements: [
              md`On a one-way platform, holding down and pressing jump drops Kai through it; he lands on whatever is below.`,
              md`On solid ground, down + jump performs a normal jump.`,
              md`After dropping, Kai can land on the same one-way platform again on a later jump.`,
              md`Coyote time does not turn a drop into a jump.`,
            ],
            hints: [
              md`Put one-way platforms on their own physics layer (12, \`one_way\`) and remove that layer from the player's mask for 0.25 s.`,
              md`After \`move_and_slide()\`, \`get_slide_collision(i).get_collider()\` returns what was touched; check its layer with \`get_collision_layer_value\`.`,
              md`Consume the press (\`_since_jump_press = INF\`) when dropping, so the jump test below does not also fire.`,
            ],
            solution: [{ file: 'scripts/platformer_player.gd', code: PLATFORMER_DROP }],
            explain: md`The drop reuses the jump's press timer: a press that drops is consumed before the jump test sees it. Turning the layer off for a quarter second is longer than it takes to fall the platform's thickness at any speed, and turning it back on afterwards needs no extra state. Checking the slide collisions makes the drop impossible on solid ground, so down + jump keeps its normal meaning there.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'c03-3-paper',
            title: 'Gap from the jump numbers',
            type: 'compute',
            difficulty: 2,
            minutes: 6,
            statement: md`The platformer uses $T_\uparrow = 0.35$ s, $T_\downarrow = 0.28$ s and runs at 100 px/s. Ignoring apex hang and the 2-px integration error, how long is a full jump that lands at its takeoff height, and how wide a gap can Kai cross from a running start? Enter $[t, d]$.`,
            solution: [md`Air time is rise plus fall: $0.35 + 0.28 = 0.63$ s.`, md`Distance at full run speed: $100 \cdot 0.63 = 63$ px, just under four 16-px tiles. Design gaps of three tiles (48 px) for a comfortable margin.`],
            answer: { kind: 'vector', value: [0.63, 63] },
          },
        },
        {
          kind: 'recall',
          prompt: md`Write the jump test that implements both coyote time and the jump buffer, and say what happens to the timers after the jump.`,
          answer: md`\`if _since_jump_press <= jump_buffer and _since_on_floor <= coyote_time:\` jump, then set both timers to \`INF\` so the press and the coyote window are consumed.`,
        },
        {
          kind: 'explain',
          prompt: md`Why does a faster fall than rise make a jump feel better, when real projectiles rise and fall symmetrically?`,
          model: md`Players judge a jump by control and readability, not by realism. A symmetric arc spends as long coming down as going up, and the descent, where the player is waiting to land and has little to decide, feels floaty. A stronger fall gravity shortens that wait and makes landings feel deliberate, while the slower rise keeps the jump high and readable. Apex hang adds a short moment of precision at the top, where players aim their landing.`,
        },
      ],
      cards: [
        { id: 'c03-3-c1', kind: 'concept', front: md`What single test implements both coyote time and jump buffering?`, back: md`\`_since_jump_press <= jump_buffer and _since_on_floor <= coyote_time\`. Then consume both (set to \`INF\`).` },
        { id: 'c03-3-c2', kind: 'compute', front: md`Full jump 40 px, jump cut 0.5 applied immediately. Smallest hop in px?`, answer: { kind: 'number', value: 10 }, back: md`$c^2 h = 0.25 \cdot 40 = 10$ px.` },
        { id: 'c03-3-c3', kind: 'cloze', text: md`A moving platform that carries a CharacterBody2D standing on it should be an {{}} moved in physics frames.`, answers: ['AnimatableBody2D'] },
        { id: 'c03-3-c4', kind: 'concept', front: md`How do you make a platform you can jump up through and stand on?`, back: md`Turn on **One Way Collision** on its \`CollisionShape2D\`; it only collides with bodies coming from above (against its arrow).` },
        { id: 'c03-3-c5', kind: 'compute', front: md`$h = 40$ px, fall time 0.28 s. Fall gravity in px/s²? (round to an integer)`, answer: { kind: 'number', value: 1020.41, tol: 0.001 }, back: md`$2h/T_\downarrow^2 = 80/0.0784 \approx 1020$ px/s².` },
      ],
    },
  ],
  problems: [
    {
      id: 'c03-p1',
      title: 'Jump from a spec',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`A top-down jump should peak at 18 px after 0.2 s. Find the gravity (px/s²) and takeoff speed (px/s). Enter both.`,
      solution: [md`$g = 2h/T^2 = 36/0.04 = 900$ px/s².`, md`$v_0 = 2h/T = 36/0.2 = 180$ px/s.`],
      answer: { kind: 'vector', value: [900, 180] },
    },
    {
      id: 'c03-p2',
      title: 'Is the step-up window long enough?',
      type: 'compute',
      difficulty: 2,
      minutes: 8,
      statement: md`A designer lowers the jump to $h = 18$ px with $T = 0.25$ s to make it look smaller. How long, in seconds, is Kai above 16 px in a jump from the ground? How many physics frames is that?`,
      hints: [md`The window is $2\sqrt{2(h - 16)/g}$ with $g = 2h/T^2$.`],
      solution: [
        md`$g = 36/0.0625 = 576$ px/s².`,
        md`Window: $2\sqrt{2 \cdot 2/576} = 2\sqrt{0.006944} \approx 0.1667$ s, 10 frames.`,
        md`Ten frames is workable, but walking at 90 px/s Kai covers only 15 px in it, so the player must be close to the cliff when jumping. Raise $h$ if playtesters miss step-ups.`,
      ],
      answer: { kind: 'number', value: 1 / 6 },
    },
    {
      id: 'c03-p3',
      title: 'Where the shadow goes',
      type: 'concept',
      difficulty: 1,
      minutes: 5,
      statement: md`Explain why the shadow is placed at \`-floor_z\` rather than at 0, and what the player would see during a jump on top of a level-1 ledge if it were placed at 0.`,
      solution: [md`The shadow represents the point on the surface directly below the character. On a level-1 ledge that surface is drawn 16 px higher than the ground, so the shadow must be shifted up by the floor height to sit on the ledge top.`, md`At 0 the shadow would be drawn on the ground plane 16 px below the ledge top, on or below the cliff face, so the character would appear to hover 16 px above the ledge while standing on it, and the jump height would read wrong.`],
      rubric: [md`States what the shadow represents`, md`Describes the 16 px offset error on a ledge`],
    },
    {
      id: 'c03-p4',
      title: 'Falling through the ledge',
      type: 'debug',
      difficulty: 2,
      minutes: 8,
      statement: md`After adding ledges, Kai jumps onto a level-1 ledge, the sprite drops 16 px below the ledge top and he stands "inside" the cliff face. The relevant code:

\`\`\`gdscript
func _update_height(delta: float) -> void:
    var floor_z := _floor_height()
    var gravity := 2.0 * jump_height / (time_to_peak * time_to_peak)
    var grounded := z <= 0.0 and z_velocity <= 0.0
    if grounded and Input.is_action_just_pressed("jump"):
        z_velocity = 2.0 * jump_height / time_to_peak
        grounded = false
    if grounded:
        z = floor_z
        z_velocity = 0.0
    else:
        z += z_velocity * delta - 0.5 * gravity * delta * delta
        z_velocity -= gravity * delta
        if z <= 0.0 and z_velocity < 0.0:
            z = 0.0
            z_velocity = 0.0
\`\`\``,
      hints: [md`Look for every place that still assumes the floor is at height 0.`],
      solution: [md`The grounded test and the landing test compare with 0 instead of \`floor_z\`. Over a ledge, Kai keeps falling past $z = 16$ until $z = 0$, then is drawn at the ground height while standing inside the ledge footprint.`, md`Replace both \`0.0\` comparisons and the clamp with \`floor_z\`: \`grounded := z <= floor_z and ...\`, \`if z <= floor_z and z_velocity < 0.0: z = floor_z\`.`],
      rubric: [md`Finds both comparisons with 0`, md`Explains the visible result (drawn 16 px too low)`, md`Fix uses floor_z in the test and the clamp`],
    },
    {
      id: 'c03-p5',
      title: 'Jump cut factor',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`A platformer jump is 48 px with a jump cut of 0.6 applied on the frame the button is released. If the player releases on the first frame, how high does the hop go, in px?`,
      solution: [md`The speed is multiplied by $c = 0.6$; the height scales with the square of the speed.`, md`$h_{\min} = c^2 h = 0.36 \cdot 48 = 17.28$ px.`],
      answer: { kind: 'number', value: 17.28 },
    },
    {
      id: 'c03-p6',
      title: 'Falling one level',
      type: 'derive',
      difficulty: 2,
      minutes: 8,
      statement: md`Kai walks off a level-1 ledge (no jump) with $g = 640$ px/s². Derive how long the 16-px fall takes, and how far he moves horizontally at 90 px/s meanwhile. Enter $[t, d]$.`,
      solution: [md`He starts with $z = 16$, $\dot z = 0$: $z(t) = 16 - \tfrac12 g t^2$.`, md`$z = 0$ when $t = \sqrt{2 \cdot 16/640} = \sqrt{0.05} \approx 0.2236$ s.`, md`Horizontal distance $90 \cdot 0.2236 \approx 20.1$ px, a little more than one tile: falls carry the player a tile past the edge, so leave room below ledges.`],
      answer: { kind: 'vector', value: [Math.sqrt(0.05), 90 * Math.sqrt(0.05)] },
    },
    {
      id: 'c03-p7',
      title: 'A puzzle room on paper',
      type: 'design',
      difficulty: 3,
      minutes: 15,
      statement: md`Sketch a 20×11-tile top-down room (320×176 px) that teaches the jump in three beats: first a step-up the player cannot miss, then a gap at the same level, then a combination with a drop as the "return path". Give every height and gap in tiles and justify each with the reach numbers ($h = 20$, $T = 0.25$, 90 px/s).`,
      solution: [
        md`Beat 1: a level-1 ledge across the whole room's middle with the entrance below it, so the only way forward is up. Any run-up works because the window is about 20 px of travel.`,
        md`Beat 2: on level 1, a one-tile gap (16 px) first, then two tiles (32 px), both well under the 45-px reach; falling into the gap returns the player to the start of the beat via a short walk on level 0.`,
        md`Beat 3: a level-2 ledge reachable only from a level-1 ledge across a two-tile gap; the exit sits on level 2. A drop from level 2 straight to level 0 near the entrance gives the return path and shows the player the route from above.`,
      ],
      rubric: [md`Each beat introduces one new idea`, md`All gaps are below 45 px and justified`, md`Level 2 is reachable only via level 1`, md`Failure states return the player to the start of the beat, not the room`],
      areas: ['feel'],
    },
    {
      id: 'c03-p8',
      title: 'The jump test',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 8,
      statement: md`Write a function \`_try_jump(on_floor: bool, pressed: bool, delta: float) -> bool\` for a controller that keeps \`_since_on_floor\` and \`_since_jump_press\` as members. It refreshes both timers from this frame's state, returns true (and consumes both windows) when a jump should start, and ages the timers by \`delta\` otherwise. Use \`coyote_time\` and \`jump_buffer\`.`,
      solution: [
        md`\`\`\`gdscript
func _try_jump(on_floor: bool, pressed: bool, delta: float) -> bool:
    if on_floor:
        _since_on_floor = 0.0
    if pressed:
        _since_jump_press = 0.0
    if _since_jump_press <= jump_buffer and _since_on_floor <= coyote_time:
        _since_jump_press = INF
        _since_on_floor = INF
        return true
    _since_on_floor += delta
    _since_jump_press += delta
    return false
\`\`\``,
        md`Refreshing before the test lets same-frame presses on the floor work with windows of 0. Consuming both prevents a double jump from one press and from one coyote window.`,
      ],
      rubric: [md`Refreshes timers before testing`, md`Tests both windows with and`, md`Consumes both on success`, md`Ages the timers by delta`],
    },
    {
      id: 'c03-p9',
      title: 'The missing two pixels',
      type: 'compute',
      difficulty: 3,
      minutes: 10,
      statement: md`A platformer jump is designed for $h = 40$ px and $T_\uparrow = 0.35$ s at 60 Hz, with velocity updated before the move (as \`move_and_slide\` does). After $k$ frames of rising the height is $k\,v_0\,\Delta t - g\,\Delta t^2\,k(k+1)/2$. With $k = T_\uparrow/\Delta t = 21$, how many pixels short of 40 is the apex?`,
      hints: [md`$v_0 = 2h/T_\uparrow \approx 228.57$ px/s, $g = 2h/T_\uparrow^2 \approx 653.06$ px/s².`],
      solution: [
        md`$k\,v_0\,\Delta t = 21 \cdot 228.571/60 = 80$ px.`,
        md`$g\,\Delta t^2\,k(k+1)/2 = 653.06 \cdot 231/3600 \approx 41.905$ px.`,
        md`Apex $\approx 38.095$ px, short by $h\,\Delta t/T_\uparrow = 40/21 \approx 1.905$ px.`,
      ],
      answer: { kind: 'number', value: 40 / 21 },
    },
  ],
};
