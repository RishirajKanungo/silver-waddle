import { md, gd, type Module } from '../types';

const CRATE = gd`
extends CharacterBody2D
## A crate that falls under gravity, integrated the way every CharacterBody2D script does it.

@export var gravity := 600.0         ## px/s²
@export var max_fall_speed := 400.0  ## px/s: a cap keeps long falls readable

var _fall_time := 0.0


func _physics_process(delta: float) -> void:
    # 1. Change the velocity by the acceleration: px/s² × s = px/s.
    velocity.y = minf(velocity.y + gravity * delta, max_fall_speed)
    # 2. Move with the new velocity. move_and_slide() multiplies by delta itself.
    move_and_slide()
    if not is_on_floor():
        _fall_time += delta
    elif _fall_time > 0.0:
        print("landed after %.3f s" % _fall_time)
        _fall_time = 0.0
`;

const BALL = gd`
extends CharacterBody2D
## A ball that bounces lower each time, then comes to rest.

@export var gravity := 600.0
@export var restitution := 0.6        ## fraction of the speed kept on each bounce
@export var min_bounce_speed := 30.0  ## below this landing speed, stop bouncing


func _physics_process(delta: float) -> void:
    velocity.y += gravity * delta
    var falling_speed := velocity.y  # remember it: move_and_slide() zeroes it on landing
    move_and_slide()
    if is_on_floor() and falling_speed > min_bounce_speed:
        velocity.y = -falling_speed * restitution
`;

const JUMPER = gd`
extends CharacterBody2D
## A side-view jump tuned with designer parameters instead of raw physics constants.

@export var run_speed := 90.0
@export var jump_height := 48.0      ## pixels (3 tiles)
@export var time_to_apex := 0.4      ## seconds from takeoff to the top of the jump
@export var fall_multiplier := 1.8   ## gravity is this much stronger on the way down
@export var jump_cut := 0.5          ## upward speed kept when jump is released early


func _physics_process(delta: float) -> void:
    # Derived every frame (it is cheap) so that tuning in the Inspector works while the game runs.
    var gravity := 2.0 * jump_height / (time_to_apex * time_to_apex)
    var jump_velocity := -2.0 * jump_height / time_to_apex  # negative: up is -y

    var g := gravity
    if velocity.y > 0.0:
        g *= fall_multiplier
    velocity.y += g * delta

    if is_on_floor() and Input.is_action_just_pressed("jump"):
        velocity.y = jump_velocity
    if Input.is_action_just_released("jump") and velocity.y < 0.0:
        velocity.y *= jump_cut

    velocity.x = Input.get_axis("move_left", "move_right") * run_speed
    move_and_slide()
`;

const JUMP_SPEC = gd`
extends CharacterBody2D
## Kai's side-view jump, tuned from a written spec, printing the height of every jump.

@export var run_speed := 90.0
@export var jump_height := 40.0     ## clears a 32 px wall with 8 px to spare
@export var time_to_apex := 0.35
@export var fall_multiplier := 2.0
@export var jump_cut := 0.5         ## a tap gives about jump_cut² × jump_height = 10 px

var _takeoff_y := 0.0
var _highest := 0.0
var _airborne := false


func _physics_process(delta: float) -> void:
    var gravity := 2.0 * jump_height / (time_to_apex * time_to_apex)
    var jump_velocity := -2.0 * jump_height / time_to_apex
    var g := gravity * fall_multiplier if velocity.y > 0.0 else gravity
    velocity.y += g * delta

    if is_on_floor() and Input.is_action_just_pressed("jump"):
        velocity.y = jump_velocity
        _takeoff_y = global_position.y
        _highest = global_position.y
        _airborne = true
    if Input.is_action_just_released("jump") and velocity.y < 0.0:
        velocity.y *= jump_cut

    velocity.x = Input.get_axis("move_left", "move_right") * run_speed
    move_and_slide()

    if _airborne:
        _highest = minf(_highest, global_position.y)  # y down: higher means smaller y
        if is_on_floor() and velocity.y >= 0.0:
            _airborne = false
            print("apex %.1f px" % (_takeoff_y - _highest))
`;

const LOB_MATH = gd`
class_name LobMath
## Launch maths for lobbed projectiles. Static functions: call LobMath.launch_velocity(...).


## The velocity that carries a projectile from "from" to "to" in exactly flight_time
## seconds, under gravity px/s² pulling toward +y (down the screen).
static func launch_velocity(from: Vector2, to: Vector2, flight_time: float, gravity: float) -> Vector2:
    var g := Vector2(0.0, gravity)
    return (to - from) / flight_time - 0.5 * g * flight_time
`;

const FOLLOW = gd`
extends Camera2D
## A follow camera whose smoothing looks the same at 30, 60 or 144 frames per second.

@export var target: Node2D
@export var sharpness := 6.0  ## 1/s. Half the remaining gap closes every ln(2) / sharpness seconds.


func _process(delta: float) -> void:
    if target == null:
        return
    # The fraction of the gap to close this frame. Over any stretch of time the
    # gap shrinks by exp(-sharpness * time), however that time is cut into frames.
    var weight := 1.0 - exp(-sharpness * delta)
    global_position = global_position.lerp(target.global_position, weight)
`;

const KNOCKBACK = gd`
extends CharacterBody2D
## An enemy that can be knocked back. Knockback is a velocity that decays to zero.

@export var knockback_decay := 900.0  ## px/s²: 180 px/s of knockback stops in 0.2 s, after 18 px

var knockback := Vector2.ZERO


func apply_knockback(from_position: Vector2, strength: float) -> void:
    knockback = from_position.direction_to(global_position) * strength


func _physics_process(delta: float) -> void:
    knockback = knockback.move_toward(Vector2.ZERO, knockback_decay * delta)
    velocity = knockback  # the enemy's own movement is added here in the enemy AI module
    move_and_slide()
`;

const LOB = gd`
class_name LobbedShard
extends Node2D
## A shard lobbed across the top-down world. The ground position moves in a straight
## line while the height z follows a parabola; the sprite is drawn z pixels above its shadow.

@export var gravity := 500.0  ## px/s² pulling z back to the ground

var ground_velocity := Vector2.ZERO
var z := 0.0
var z_velocity := 0.0
var time_left := 0.0

@onready var sprite: Sprite2D = $Sprite2D


func launch(from: Vector2, to: Vector2, flight_time: float) -> void:
    global_position = from
    ground_velocity = (to - from) / flight_time  # nothing pulls along the ground
    z_velocity = 0.5 * gravity * flight_time     # v = d/T - g*T/2 with d = 0 and gravity pulling z down
    time_left = flight_time


func _physics_process(delta: float) -> void:
    z_velocity -= gravity * delta
    z = maxf(z + z_velocity * delta, 0.0)
    global_position += ground_velocity * delta
    sprite.position.y = -z  # up the screen by z pixels; the Shadow sprite stays at y = 0
    time_left -= delta
    if time_left <= 0.0:
        queue_free()
`;

const LYRA = gd`
extends Node2D
## Lyra lobs a shard at the mouse on a left click.

@export var shard_scene: PackedScene
@export var flight_time := 0.6


func _unhandled_input(event: InputEvent) -> void:
    var click := event as InputEventMouseButton
    if click and click.pressed and click.button_index == MOUSE_BUTTON_LEFT:
        var shard := shard_scene.instantiate() as LobbedShard
        get_parent().add_child(shard)
        shard.launch(global_position, get_global_mouse_position(), flight_time)
`;

export const MODULE: Module = {
  id: 'm02',
  part: 'math',
  order: 2,
  title: 'Motion and physics',
  summary: 'Position, velocity and acceleration stepped frame by frame; semi-implicit Euler and what move_and_slide does; jump physics from a height and a time to apex; fall gravity and variable jumps; projectile launch velocities; friction, drag, frame-rate independent smoothing and knockback.',
  relevance: md`Shardbound's feel lives in a handful of numbers per frame. Kai's jump between ledges in the overworld and the side-view platforming sections are tuned from a height in tiles and a time to the top, not from a gravity constant guessed in the Inspector. Lyra's lobbed spells land where the player aims because their launch velocity is solved, not tweaked. The camera that trails Kai behaves identically on a 60 Hz laptop and a 144 Hz monitor, and Bram's mace knocks a skeleton back exactly 18 px, every time. This module derives each of those formulas and shows how they map onto \`velocity\`, \`delta\` and \`move_and_slide()\`.`,
  prereqs: ['g02', 'm01'],
  areas: ['math', 'feel'],
  lessons: [
    {
      id: 'm02-1',
      title: 'Kinematics: stepping motion one frame at a time',
      minutes: 40,
      objectives: [
        'Relate position, velocity and acceleration as rates of change, with units of px, px/s and px/s².',
        'Step a body forward one frame with explicit and with semi-implicit Euler.',
        'Explain why games use semi-implicit Euler, and predict its apex error on a jump ($v_0\\,\\Delta t/2$).',
        'Say what `move_and_slide()` does with `velocity` and `delta`, and avoid double-counting either.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Every platformer's physics fits in two lines of a \`_physics_process\`: change the velocity, then move. Those two lines are an approximation of calculus, run 60 times a second. Getting them in the right order, with \`delta\` in the right places, is the difference between a jump that is the same height on every computer and one that changes with the frame rate, or a spring that settles and one that explodes.

This lesson starts from the definitions, then looks closely at what one physics frame does.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Position, velocity, acceleration',
          md: md`- **Velocity** is the rate of change of position: $\mathbf{v} = d\mathbf{p}/dt$, in px/s. Over a short time $\Delta t$, $\Delta\mathbf{p} \approx \mathbf{v}\,\Delta t$.
- **Acceleration** is the rate of change of velocity: $\mathbf{a} = d\mathbf{v}/dt$, in px/s². Over $\Delta t$, $\Delta\mathbf{v} \approx \mathbf{a}\,\Delta t$.

Gravity in a side view is a constant acceleration pointing down the screen, so in Godot it is $+y$: \`velocity.y += gravity * delta\`. Units are a free bug check: px/s² × s gives px/s, px/s × s gives px. If the units of a line do not work out, the line is wrong.`,
        },
        {
          kind: 'derive',
          title: 'Motion under constant acceleration',
          goal: md`Find the exact position at time $t$ for a body starting at $p_0$ with velocity $v_0$ and constant acceleration $a$ (one axis).`,
          steps: [
            { md: md`Velocity changes at the constant rate $a$: $v(t) = v_0 + a t$. On a speed–time graph this is a straight line.` },
            {
              md: md`The displacement is the area under the velocity graph between $0$ and $t$: a trapezoid with parallel sides $v_0$ and $v_0 + at$ and width $t$.`,
              choose: {
                prompt: md`What is that area?`,
                options: [md`$v_0 t + \tfrac12 a t^2$`, md`$v_0 t + a t^2$`, md`$(v_0 + at)\,t$`],
                answer: 0,
                explain: md`Trapezoid area = average height × width $= \tfrac12\big(v_0 + (v_0 + at)\big)t = v_0 t + \tfrac12 a t^2$. Using the final velocity for the whole interval, $(v_0+at)t$, overestimates by $\tfrac12 a t^2$.`,
              },
            },
            { md: md`So $p(t) = p_0 + v_0 t + \tfrac12 a t^2$: a parabola in time. A jump in a side view is exactly this with $v_0$ negative (up) and $a = g$ positive (down).` },
          ],
          takeaway: md`For constant acceleration the exact answer is known, which is why the next figure can draw the true parabola and measure how far a frame-stepped jump strays from it.`,
        },
        {
          kind: 'text',
          md: md`### One frame at a time

A game does not evaluate the formula; it steps. Each physics frame lasts $\Delta t = 1/60$ s and does two updates, in one of two orders:

| | first | then |
|---|---|---|
| **explicit Euler** | $p \mathrel{+}= v\,\Delta t$ (old velocity) | $v \mathrel{+}= a\,\Delta t$ |
| **semi-implicit Euler** | $v \mathrel{+}= a\,\Delta t$ | $p \mathrel{+}= v\,\Delta t$ (new velocity) |

Both are first-order approximations: each frame pretends the velocity is constant for the whole frame. Explicit Euler uses the velocity at the *start* of the frame, so on a jump it rises a little too far. Semi-implicit Euler uses the velocity at the *end*, so it rises a little too short. With a constant gravity the error is the same size either way, but the next figure shows a case where the order matters much more.`,
        },
        {
          kind: 'viz',
          viz: { type: 'math.integrators', mode: 'jump', hz: 20 },
          task: md`At 20 Hz, compare the three apex readouts. Raise the physics rate to 60 and then 120 Hz: how does the error change? Check the last readout, $v_0\Delta t/2$, against the measured errors.`,
          caption: md`Dots are physics frames. Explicit Euler (red) overshoots the true apex and semi-implicit (blue) undershoots, each by about $v_0\,\Delta t/2$, which halves when the rate doubles.`,
        },
        {
          kind: 'numeric',
          q: md`A jump starts with upward speed $v_0 = 240$ px/s under gravity $g = 600$ px/s², stepped with semi-implicit Euler at 60 Hz. Each frame the upward speed drops by $g\Delta t$. How many frames until it reaches zero?`,
          answer: { kind: 'number', value: 24 },
          explain: md`$g\,\Delta t = 600/60 = 10$ px/s per frame; $240/10 = 24$ frames, which is $0.4$ s, the same as the exact $v_0/g$.`,
        },
        {
          kind: 'numeric',
          q: md`Continue the last question. Semi-implicit Euler moves by the *new* speed each frame: $230/60$, then $220/60$, …, then $0/60$ px. What apex height does it reach? (The exact parabola peaks at $v_0^2/2g = 48$ px.)`,
          answer: { kind: 'number', value: 46 },
          hints: [md`Sum $230 + 220 + \dots + 10 + 0$, then divide by 60. The sum of an arithmetic series is (number of terms) × (first + last) / 2.`],
          explain: md`$\sum_{k=1}^{24}(240 - 10k) = 24\cdot 240 - 10\cdot\tfrac{24\cdot 25}{2} = 5760 - 3000 = 2760$, and $2760/60 = 46$ px. Explicit Euler, which sums $240 + 230 + \dots + 10$, gets $3000/60 = 50$ px. Both miss 48 by $v_0\Delta t/2 = 2$ px.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          title: 'Why semi-implicit Euler is the default',
          md: md`Two pixels on a 48 px jump will not matter. What matters is what happens to things that oscillate: springs, pendulums, orbits, a camera on a spring. Explicit Euler adds a little energy every step, so an undamped spring's swings grow until it flies apart. Semi-implicit Euler keeps the energy bounded: the swings stay the same size forever, with only a small timing error. It costs nothing extra; it is the same two lines in the other order. There is a second, practical reason: if a collision or a jump changes the velocity this frame, semi-implicit Euler moves with that change immediately, which is exactly what \`velocity.y = jump_velocity\` followed by \`move_and_slide()\` does.`,
        },
        {
          kind: 'viz',
          viz: { type: 'math.integrators', mode: 'spring', hz: 30 },
          task: md`Watch explicit Euler's spring over 4 seconds at 30 Hz. Raise the frequency to 4 Hz. Then lower the physics rate to 10 Hz and watch the semi-implicit curve too: what happens when $\omega\Delta t$ gets near 2?`,
          caption: md`The energy readout is relative to the start. Explicit Euler's energy multiplies by $1 + (\omega\Delta t)^2$ every step. Semi-implicit Euler stays bounded as long as $\omega\,\Delta t < 2$; beyond that, nothing that steps this crudely is stable, which is why fast springs need a high physics rate or a softer frequency.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'What move_and_slide() does with velocity',
          md: md`\`CharacterBody2D.move_and_slide()\` reads the body's \`velocity\` (px/s), multiplies by the physics frame's delta **internally**, moves the body, resolves collisions, slides along surfaces (lesson m01-2), and writes the slid velocity back into \`velocity\`. So:

- Change \`velocity\` with \`* delta\` (an acceleration times a time), and **do not** multiply by delta when handing it to \`move_and_slide()\`.
- Do not also add \`velocity * delta\` to \`position\`: that moves the body twice per frame and skips collision for the second move.
- After landing, \`velocity.y\` has been set to zero by the slide against the floor; if you need the landing speed (for a bounce, a landing sound or fall damage), read it **before** calling \`move_and_slide()\`.
- \`_physics_process(delta)\` runs at a fixed 60 Hz by default (*Project Settings → Physics → Common → Physics Ticks Per Second*), so \`delta\` there is $1/60$ s.

The pattern \`velocity.y += gravity * delta\` then \`move_and_slide()\` is semi-implicit Euler.`,
        },
        {
          kind: 'check',
          q: md`Which line has a bug?

\`\`\`gdscript
func _physics_process(delta: float) -> void:
	velocity.y += gravity               # line A
	velocity.x = input_x * run_speed    # line B
	move_and_slide()                    # line C
\`\`\``,
          options: [md`Line A: gravity is an acceleration and must be multiplied by \`delta\``, md`Line B: velocity must be multiplied by \`delta\``, md`Line C: it should be \`move_and_slide(velocity * delta)\``, md`None of them`],
          answer: 0,
          explain: md`Line A adds 600 px/s every frame, which is 36 000 px/s² at 60 Hz, and the jump would change with the tick rate. Line B sets a velocity in px/s, which is correct. \`move_and_slide()\` takes no arguments in Godot 4 and applies delta itself.`,
        },
        {
          kind: 'steps',
          title: 'Drop a crate',
          steps: [
            md`Create \`scenes/math/physics_lab.tscn\` with a \`Node2D\` root. Add a \`StaticBody2D\` named \`Floor\` at $(160, 170)$ with a \`CollisionShape2D\` holding a **RectangleShape2D** of $320 \times 16$, and a \`ColorRect\` or tile sprite so you can see it.`,
            md`Add a \`CharacterBody2D\` named \`Crate\` at $(160, 62)$ with a \`Sprite2D\` (the \`crate\` tile of the platform tileset works) and a $16\times 16$ \`CollisionShape2D\`. The crate's bottom edge starts 92 px above the floor's top edge.`,
            md`Attach \`scripts/math/crate.gd\` (below) to \`Crate\` and run the scene with **F6**. Read the **Output** panel.`,
            md`Change *Physics Ticks Per Second* to 30 in **Project → Project Settings → Physics → Common**, run again, then set it back to 60.`,
          ],
          result: md`The crate falls and lands, and the Output prints about \`landed after 0.550 s\` (the exact time for 92 px is $\sqrt{2\cdot 92/600} \approx 0.554$ s; frame stepping rounds to whole frames). At 30 ticks per second the time stays within a frame or two of that.`,
          troubleshoot: [
            { problem: md`The crate falls through the floor.`, fix: md`Both bodies need a \`CollisionShape2D\` with a shape assigned, and they must share a collision layer and mask (both default to layer 1).` },
            { problem: md`It prints "landed" with a tiny time on the first frame.`, fix: md`The crate started touching the floor. Move it up so it starts in the air.` },
          ],
        },
        { kind: 'code', file: 'scripts/math/crate.gd', code: CRATE, note: md`\`minf(..., max_fall_speed)\` is a cap on falling speed, common in platformers: past a certain speed the player cannot react, and very fast bodies can pass through thin floors between two frames.` },
        {
          kind: 'build',
          ch: {
            id: 'm02-1-build',
            title: 'A ball that bounces lower each time',
            goal: md`Add a \`Ball\` (\`CharacterBody2D\`, circle collision of radius 6) to the physics lab that falls, bounces with a restitution of 0.6, and comes to rest.`,
            requirements: [
              md`Dropped from 100 px above the floor, the first bounce rises to about 36 px, the second to about 13 px.`,
              md`The ball comes to rest after a few bounces instead of jittering forever on the floor.`,
              md`Changing \`restitution\` in the Inspector changes the bounce heights the way $e^2$ predicts.`,
            ],
            hints: [
              md`\`move_and_slide()\` zeroes \`velocity.y\` on landing, so store the falling speed in a local variable *before* calling it.`,
              md`Height is proportional to speed squared ($h = v^2/2g$), so keeping a fraction $e$ of the speed keeps $e^2$ of the height: $0.6^2 = 0.36$.`,
              md`Stop bouncing below a minimum landing speed; otherwise each tiny bounce lasts one frame and the ball buzzes.`,
            ],
            solution: [{ file: 'scripts/math/ball.gd', code: BALL }],
            explain: md`Each landing reverses the stored falling speed and scales it by \`restitution\`. The rise height after a bounce is $(e v)^2 / 2g = e^2 h$, so the heights form a geometric sequence $100, 36, 13, 4.7, \dots$ px; the threshold ends it cleanly once the landing speed drops below 30 px/s (a bounce of under 1 px).`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'm02-1-paper',
            title: 'Explicit Euler apex',
            type: 'compute',
            difficulty: 2,
            minutes: 8,
            statement: md`A jump has $v_0 = 300$ px/s and $g = 900$ px/s², stepped with **explicit** Euler at 30 Hz. What apex height does it reach? Compare with the exact apex.`,
            hints: [md`Explicit Euler moves by the *old* speed: $300/30$, $270/30$, …`, md`It keeps rising while the old speed is positive.`],
            solution: [
              md`$g\Delta t = 900/30 = 30$ px/s per frame. The speeds at the start of each frame are $300, 270, \dots, 30$ (10 frames), then $0$.`,
              md`Height $= (300 + 270 + \dots + 30)/30 = \tfrac{10\cdot(300+30)/2}{30} = 1650/30 = 55$ px.`,
              md`Exact: $v_0^2/2g = 90000/1800 = 50$ px. Explicit Euler overshoots by $v_0\Delta t/2 = 300/60 = 5$ px; semi-implicit would reach 45 px.`,
            ],
            answer: { kind: 'number', value: 55 },
          },
        },
        {
          kind: 'recall',
          prompt: md`Write the two lines of semi-implicit Euler for gravity in Godot, and say what \`move_and_slide()\` does with \`velocity\`.`,
          answer: md`\`velocity.y += gravity * delta\` then \`move_and_slide()\` (which moves by \`velocity * delta\` itself). It moves the body, resolves collisions, slides along surfaces and writes the slid velocity back.`,
        },
        {
          kind: 'explain',
          prompt: md`A colleague says the order of "update velocity" and "update position" does not matter because the difference is a pixel or two. When does it matter?`,
          model: md`For constant gravity the two orders differ by about $v_0\Delta t/2$ in the apex, a couple of pixels, so they are right about jumps. It matters for anything that oscillates or reacts to its own position: springs, orbits, a camera on a spring, a bobbing pickup driven by a force. Explicit Euler pumps energy in every step, so those systems grow until they blow up, especially at low frame rates or high stiffness; semi-implicit Euler keeps the energy bounded. It also matters for responsiveness: with velocity first, a jump or a collision response moves the body in the same frame.`,
        },
      ],
      cards: [
        { id: 'm02-1-c1', kind: 'cloze', text: md`Semi-implicit Euler updates the {{}} first, then moves with the new value.`, answers: ['velocity'] },
        { id: 'm02-1-c2', kind: 'compute', front: md`Exact apex for $v_0 = 200$ px/s, $g = 500$ px/s²?`, answer: { kind: 'number', value: 40 }, back: md`$v_0^2/2g = 40000/1000 = 40$ px.` },
        { id: 'm02-1-c3', kind: 'concept', front: md`Why must you not write \`position += velocity * delta\` as well as calling \`move_and_slide()\`?`, back: md`\`move_and_slide()\` already moves by \`velocity * delta\`. Adding it again moves twice per frame, and the extra move skips collision detection.` },
        { id: 'm02-1-c4', kind: 'concept', front: md`What happens to an undamped spring integrated with explicit Euler?`, back: md`Its energy grows by a factor $1 + (\omega\Delta t)^2$ each step, so the oscillation grows until it explodes. Semi-implicit Euler keeps it bounded (for $\omega\Delta t < 2$).` },
        { id: 'm02-1-c5', kind: 'compute', front: md`Apex error of a frame-stepped jump with $v_0 = 240$ px/s at 60 Hz (px)?`, answer: { kind: 'number', value: 2 }, back: md`$v_0\Delta t/2 = 240/120 = 2$ px (low for semi-implicit, high for explicit).` },
      ],
    },
    {
      id: 'm02-2',
      title: 'Jump physics from designer parameters',
      minutes: 45,
      objectives: [
        'Derive gravity and jump velocity from a jump height $h$ and a time to apex $t$: $g = 2h/t^2$, $v_0 = 2h/t$.',
        'Add a stronger fall gravity and compute the fall time and total airtime.',
        'Implement variable jump height by cutting the upward velocity on release, and compute the smallest hop ($c^2 h$).',
        'Tune a jump in the lab, then carry the parameters into a `CharacterBody2D` script and verify them in game.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Ask a designer how a jump should feel and you will hear "three tiles high", "snappy", "gets to the top quickly and falls fast", "a tap is a little hop, holding goes full height". Nobody says "gravity 980". Yet gravity and a takeoff velocity are what the code needs.

The fix is to expose the parameters people can judge (height in pixels, time to the top in seconds) and *derive* the physics constants from them. Change the height and the jump still takes the same time; change the time and the height stays put. This lesson derives the formulas, adds two standard refinements (faster falling and variable height), and builds the controller.`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'Parameters you can feel',
          md: md`- **Jump height** $h$, in pixels. Level design depends on it: 48 px is three 16 px tiles, and every ledge in a room is placed against it.
- **Time to apex** $t$. Short (0.3 s) feels light and arcade-like; long (0.6 s) feels floaty, like low gravity.
- **Fall multiplier** $m$. Falling faster than rising (often 1.5 to 3 times the gravity) reads as weight and gives control back sooner.
- **Jump cut** $c$. Releasing the button early multiplies the upward speed by $c$, so a tap is a hop and a hold is the full jump.`,
        },
        {
          kind: 'derive',
          title: 'Gravity and jump velocity from h and t',
          goal: md`Find the gravity $g$ and takeoff speed $v_0$ that make a jump reach height $h$ exactly $t$ seconds after takeoff.`,
          steps: [
            {
              md: md`Take "up" as positive for the derivation. The upward speed is $v(\tau) = v_0 - g\tau$. At the apex the body stops rising.`,
              choose: {
                prompt: md`What condition defines the apex time $t$?`,
                options: [md`$v(t) = 0$, so $v_0 = g\,t$`, md`$v(t) = v_0/2$`, md`$h = v_0\,t$`],
                answer: 0,
                explain: md`At the top the vertical speed is zero. So $v_0 = g t$.`,
              },
            },
            {
              md: md`The height at time $t$ is $h = v_0 t - \tfrac12 g t^2$. Substitute $v_0 = g t$: $h = g t^2 - \tfrac12 g t^2 = \tfrac12 g t^2$.`,
              choose: {
                prompt: md`Solve $h = \tfrac12 g t^2$ for $g$.`,
                options: [md`$g = 2h/t^2$`, md`$g = h/t^2$`, md`$g = 2h/t$`],
                answer: 0,
                explain: md`Multiply both sides by $2/t^2$.`,
              },
            },
            { md: md`Then $v_0 = g t = 2h/t$. In Godot's y-down space the jump velocity is negative: \`jump_velocity = -2.0 * jump_height / time_to_apex\`, and gravity is added to \`velocity.y\` as a positive number.` },
          ],
          takeaway: md`$$g = \frac{2h}{t^2}, \qquad v_0 = \frac{2h}{t}$$ Double the height at the same time and both double; halve the time at the same height and gravity quadruples.`,
        },
        {
          kind: 'numeric',
          q: md`Kai should jump 3 tiles (48 px) and reach the top in 0.4 s. Compute gravity and jump speed. Enter $[g, v_0]$.`,
          answer: { kind: 'vector', value: [600, 240] },
          inputHint: 'g, v0',
          explain: md`$g = 2\cdot 48/0.4^2 = 96/0.16 = 600$ px/s²; $v_0 = 2\cdot 48/0.4 = 240$ px/s. In code \`jump_velocity = -240.0\`.`,
        },
        {
          kind: 'assets',
          ids: ['hero', 'tiles_platform', 'sfx_jump', 'sfx_land'],
          note: md`\`jump_side\` is Kai's airborne pose. The platform tileset is for side-view rooms; the lab uses its ground tiles.`,
        },
        {
          kind: 'viz',
          viz: { type: 'math.jumplab', height: 48, timeToApex: 0.4, fallMultiplier: 1 },
          task: md`Jump on the spot and check the measured apex against the dashed 48 px line. Can you get on the 64 px pillar? Set \`jump_height\` to 72 and try again. Then set \`fall_multiplier\` to 2 and compare how the jump feels and what the inset plot does. Finally turn on **variable height** and tap Space.`,
          caption: md`The yellow dots are the real arc, stepped at 60 Hz. The inset plots height above the takeoff point against time: dots are measured, the blue line is the analytic curve (rise with $g$, fall with $m g$). The measured apex sits about 2 px *above* $h$: on the takeoff frame the body moves with the full jump speed before gravity has acted on it, so the stepped jump peaks at $h + v_0\Delta t/2$ (lesson 1's error, with the sign set by the order of the lines).`,
        },
        {
          kind: 'text',
          md: md`### Falling faster

Rising and falling with the same gravity gives a symmetric parabola, which tends to feel floaty: the player hangs at the top and drifts down. Using a larger gravity $m g$ once \`velocity.y > 0\` (moving down) shortens the fall without changing the height or the rise. The fall from the apex covers the same $h$ under the stronger gravity:

$$h = \tfrac12 (m g)\, t_{\text{fall}}^2 \;\Rightarrow\; t_{\text{fall}} = \sqrt{\frac{2h}{m g}} = \frac{t}{\sqrt m}$$

(using $2h/g = t^2$). Total airtime is $t + t/\sqrt m$, and a character running at $v_x$ covers $v_x\,(t + t/\sqrt m)$ horizontally: the longest gap it can jump between floors at the same height.`,
        },
        {
          kind: 'numeric',
          q: md`With $h = 48$ px, $t = 0.4$ s and fall multiplier $m = 2$, what is the total airtime of a full jump (takeoff to landing at the same height), in seconds?`,
          answer: { kind: 'number', value: 0.4 + 0.4 / Math.SQRT2 },
          explain: md`$t_{\text{fall}} = 0.4/\sqrt2 \approx 0.283$ s, so the airtime is $0.4 + 0.283 \approx 0.683$ s, against 0.8 s with $m = 1$.`,
        },
        {
          kind: 'text',
          md: md`### Variable jump height

Players expect a tap to give a small hop and a hold to give the full jump. The standard way is to let every jump start the same, and when the jump button is **released while still rising**, multiply the upward velocity by a cut factor $c$ (0.4 to 0.6 is common). The body then decelerates from a smaller speed and peaks early. Holding the button never triggers the cut, so the full jump is unchanged.

Two alternatives you will see: setting the upward speed to a fixed small value on release (\`velocity.y = maxf(velocity.y, -min_jump_speed)\`), which gives the same minimum hop whenever you release, and applying extra gravity while the button is not held. All three work; the multiply is the simplest to tune with one number.`,
        },
        {
          kind: 'derive',
          title: 'The smallest hop',
          goal: md`Find the height of the shortest possible jump, released immediately after takeoff, with cut factor $c$.`,
          steps: [
            { md: md`From an upward speed $u$ under gravity $g$, a body rises a further $u^2/(2g)$ (the same formula as the apex, $v_0^2/2g$).` },
            {
              md: md`Released at once, the upward speed is still about $v_0$, and the cut makes it $c\,v_0$.`,
              choose: {
                prompt: md`How high does the hop go?`,
                options: [md`$\dfrac{(c v_0)^2}{2g} = c^2 h$`, md`$c\,h$`, md`$h/c$`],
                answer: 0,
                explain: md`$(c v_0)^2/2g = c^2 \cdot v_0^2/2g = c^2 h$. The speed is cut by $c$ but the height by $c^2$, because height goes with speed squared.`,
              },
            },
            { md: md`With $c = 0.5$ and $h = 48$: a 12 px hop, a quarter of the full jump. Releasing later gives anything between 12 and 48 px.` },
          ],
          takeaway: md`Choose $c$ from the smallest hop you want: $c = \sqrt{h_{\min}/h}$. For a 10 px minimum on a 40 px jump, $c = 0.5$.`,
        },
        {
          kind: 'check',
          q: md`A designer doubles \`time_to_apex\` from 0.3 s to 0.6 s and keeps \`jump_height\` at 48. What happens to gravity and jump speed?`,
          options: [md`Gravity becomes a quarter, jump speed half`, md`Both halve`, md`Gravity halves, jump speed stays`, md`Both stay the same; only the animation slows`],
          answer: 0,
          explain: md`$g = 2h/t^2$ falls by $2^2 = 4$; $v_0 = 2h/t$ falls by 2. The jump reaches the same height, slowly: the moon-gravity feel.`,
        },
        {
          kind: 'steps',
          title: 'A side-view jump lab in Godot',
          steps: [
            md`Create \`scenes/math/jump_lab.tscn\` with a \`Node2D\` root. Add a \`StaticBody2D\` floor along the bottom ($320\times 16$ rectangle at $y = 172$) and two more \`StaticBody2D\` pillars, 32 px and 64 px tall, so you can test which heights are reachable.`,
            md`Add a \`CharacterBody2D\` named \`Jumper\` with a \`Sprite2D\` (one frame of Kai's \`jump_side\` or \`idle_side\`, offset so the feet are at the origin) and a $10\times 22$ **RectangleShape2D** collision shape whose bottom edge is at the origin.`,
            md`Check **Project → Project Settings → Input Map** has \`jump\` (Space and a gamepad face button), \`move_left\` and \`move_right\`.`,
            md`Attach \`scripts/math/jump_lab_player.gd\` (below) to \`Jumper\` and press **F6**. Tune the exported values in the Inspector while the game runs (in the Remote tree, select \`Jumper\`).`,
          ],
          result: md`Kai runs and jumps 48 to 50 px high, reaching the top in 0.4 s. A tap gives a small hop. Raising \`jump_height\` to 72 at runtime gets him onto the 64 px pillar without changing the timing.`,
          troubleshoot: [
            { problem: md`He never jumps; \`is_on_floor()\` is always false.`, fix: md`\`is_on_floor()\` is updated by \`move_and_slide()\`, and only for surfaces facing \`up_direction\` (default \`Vector2.UP\`). Make sure gravity is applied every frame so the body presses into the floor, and that the collision shapes touch.` },
            { problem: md`The printed or measured jump is 2 px higher than \`jump_height\`.`, fix: md`Expected. The jump velocity is set after gravity in the takeoff frame, so that frame moves by the full $v_0\Delta t$; every later frame is semi-implicit. The total is $h + v_0\Delta t/2$ (lesson 1). Design levels with a few pixels of margin either way.` },
            { problem: md`Changing values in the Inspector at runtime does nothing.`, fix: md`Edit the instance in the **Remote** scene tree while the game runs, not the scene file in the Local tree. The script derives gravity every frame so edits apply at once.` },
          ],
        },
        { kind: 'code', file: 'scripts/math/jump_lab_player.gd', code: JUMPER, note: md`Gravity is computed from the exported values every frame instead of once in \`_ready()\`: two divisions per frame cost nothing, and live tuning then works. The cut only applies while \`velocity.y < 0\` (rising), so releasing during the fall does nothing. The full side-view controller, with coyote time and a jump buffer, is built in the jumping module.` },
        {
          kind: 'build',
          ch: {
            id: 'm02-2-build',
            title: 'Meet a jump spec',
            goal: md`A level designer hands you this spec for Kai's side-view jump: *clears a 2-tile (32 px) wall from a standstill with some margin; reaches the top in 0.35 s; falls twice as hard as it rises; a tap is a hop of at most 10 px*. Choose the parameters, implement them, and print the measured apex of every jump.`,
            requirements: [
              md`A held jump clears a 32 px pillar from a standstill next to it, with at least 4 px to spare (check the printed apex).`,
              md`The rise takes 0.35 s (measure with the frame count or trust the derivation) and falling is visibly quicker than rising.`,
              md`A quick tap prints an apex of 10 px or less.`,
              md`Every jump prints its apex height in pixels when Kai lands.`,
            ],
            hints: [
              md`Pick $h$ first: 32 px plus a margin for imprecise jumps. 40 px is a comfortable choice.`,
              md`Then $c = \sqrt{h_{\min}/h} = \sqrt{10/40} = 0.5$.`,
              md`Track the smallest \`global_position.y\` since takeoff (y grows downward) and print \`takeoff_y - highest_y\` on landing.`,
            ],
            solution: [{ file: 'scripts/math/jump_spec_player.gd', code: JUMP_SPEC }],
            explain: md`With $h = 40$, $t = 0.35$: $g = 80/0.1225 \approx 653$ px/s² and $v_0 \approx 229$ px/s. The measured apex is about $40 + 229/120 \approx 42$ px (the takeoff-frame effect from the lab), clearing 32 px with room to spare. The fall takes $0.35/\sqrt2 \approx 0.25$ s. A tap gives about $0.25 \times 40 = 10$ px, a little more if released a frame late.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'm02-2-paper',
            title: 'How wide a gap?',
            type: 'compute',
            difficulty: 2,
            minutes: 8,
            statement: md`Kai runs at 90 px/s and jumps with $h = 48$ px, $t = 0.4$ s and fall multiplier 2. How far does he travel horizontally during a full jump that lands at the same height it started? Give the answer in pixels.`,
            hints: [md`Airtime is $t + t/\sqrt m$.`],
            solution: [
              md`Rise: 0.4 s. Fall: $0.4/\sqrt2 \approx 0.2828$ s. Airtime $\approx 0.6828$ s.`,
              md`Distance $= 90 \times 0.6828 \approx 61.5$ px, a little under 4 tiles. Gaps should be at most 3 tiles wide so the jump is forgiving; with $m = 1$ the distance would be 72 px.`,
            ],
            answer: { kind: 'number', value: 90 * (0.4 + 0.4 / Math.SQRT2) },
          },
        },
        {
          kind: 'recall',
          prompt: md`From jump height $h$ and time to apex $t$, write gravity, jump speed, fall time with multiplier $m$, and the smallest hop with cut $c$.`,
          answer: md`$g = 2h/t^2$, $v_0 = 2h/t$ (negative in Godot's y-down), $t_{\text{fall}} = t/\sqrt m$, smallest hop $c^2 h$.`,
        },
        {
          kind: 'explain',
          prompt: md`Why expose jump height and time to apex in the Inspector instead of gravity and jump velocity?`,
          model: md`Height and time are what level design and feel depend on: ledges are placed in tiles, and "how long am I in the air" is what a player senses. With raw gravity and velocity, changing one changes both height and timing, so tuning becomes a guessing loop and every tweak can break level geometry. Deriving $g = 2h/t^2$ and $v_0 = 2h/t$ makes the two knobs independent: change the height and the timing stays, change the timing and every ledge stays reachable.`,
        },
      ],
      cards: [
        { id: 'm02-2-c1', kind: 'cloze', text: md`From jump height h and time to apex t: gravity = {{}} and jump speed = {{}}.`, answers: ['2h/t^2|2h/t²|2*h/t^2|2h/(t^2)', '2h/t|2*h/t'] },
        { id: 'm02-2-c2', kind: 'compute', front: md`$h = 64$ px, $t = 0.5$ s. Gravity in px/s²?`, answer: { kind: 'number', value: 512 }, back: md`$2\cdot 64/0.25 = 512$.` },
        { id: 'm02-2-c3', kind: 'compute', front: md`Rise time 0.4 s, fall multiplier 4. Fall time in seconds?`, answer: { kind: 'number', value: 0.2 }, back: md`$t/\sqrt m = 0.4/2 = 0.2$ s.` },
        { id: 'm02-2-c4', kind: 'concept', front: md`Why does cutting the upward speed by $c$ cut the hop height by $c^2$?`, back: md`The remaining rise is $u^2/2g$: height goes with speed squared.` },
        { id: 'm02-2-c5', kind: 'concept', front: md`Where does the jump cut go in code, and what guard does it need?`, back: md`On \`Input.is_action_just_released("jump")\`, multiply \`velocity.y\` by \`jump_cut\`, only while \`velocity.y < 0\` (still rising).` },
      ],
    },
    {
      id: 'm02-3',
      title: 'Projectiles, drag, smoothing and knockback',
      minutes: 45,
      objectives: [
        'Solve for the launch velocity that lands a projectile on a target in a chosen flight time: $\\mathbf{v} = \\mathbf{d}/T - \\tfrac12\\mathbf{g}T$.',
        'Apply friction and drag per frame so the result does not depend on the frame rate, and compute a terminal velocity.',
        'Explain why `lerp(a, b, 0.1)` every frame depends on the frame rate, and replace it with `1 - exp(-k * delta)`.',
        'Implement a knockback impulse that decays, and compute how far and how long it pushes.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Three moments from a Shardbound fight. Lyra lobs a fire shard over a rock and it lands exactly where the player aimed. The camera trails Kai as he dashes, with a little lag that feels the same on every monitor. Bram's mace connects and the skeleton slides back a short, fixed distance before it can act again.

Each is a small piece of motion maths: solving for a launch velocity, decaying a value smoothly over time, and an impulse that dies away. They share one theme: write rates *per second*, apply them with \`delta\`, and check the result does not change when the frame rate does.`,
        },
        {
          kind: 'derive',
          title: 'Launch velocity for a chosen flight time',
          goal: md`A projectile starts at $\mathbf{p}_0$ under constant gravity $\mathbf{g}$. Find the launch velocity $\mathbf{v}$ that puts it at the target $\mathbf{p}_1$ after exactly $T$ seconds.`,
          steps: [
            { md: md`Constant acceleration works component by component, so the position at time $T$ is $\mathbf{p}(T) = \mathbf{p}_0 + \mathbf{v}T + \tfrac12\mathbf{g}T^2$ (lesson 1, now with vectors).` },
            {
              md: md`Set $\mathbf{p}(T) = \mathbf{p}_1$ and write $\mathbf{d} = \mathbf{p}_1 - \mathbf{p}_0$.`,
              choose: {
                prompt: md`Solve $\mathbf{d} = \mathbf{v}T + \tfrac12\mathbf{g}T^2$ for $\mathbf{v}$.`,
                options: [md`$\mathbf{v} = \mathbf{d}/T - \tfrac12\mathbf{g}T$`, md`$\mathbf{v} = \mathbf{d}/T + \tfrac12\mathbf{g}T$`, md`$\mathbf{v} = \mathbf{d}/T - \mathbf{g}T$`],
                answer: 0,
                explain: md`Subtract $\tfrac12\mathbf{g}T^2$ and divide by $T$. The $-\tfrac12\mathbf{g}T$ term aims above the target by exactly as much as gravity will pull the shot down.`,
              },
            },
            { md: md`In Godot's side view $\mathbf{g} = (0, g)$, so $v_x = d_x/T$ and $v_y = d_y/T - \tfrac12 g T$. For a target at the same height ($d_y = 0$), the shot peaks at $T/2$ and rises $\tfrac18 g T^2$.` },
          ],
          takeaway: md`Choosing the flight time, rather than the speed, always has exactly one answer and makes timing predictable: an enemy can dodge on a fixed beat. Choosing a fixed speed instead gives zero, one or two launch angles (a high lob and a flat shot), from a quadratic, and is more work.`,
        },
        {
          kind: 'numeric',
          q: md`Lyra throws at a slime 120 px to her right at the same height, with flight time 0.8 s and gravity 400 px/s² (pulling toward $+y$). What launch velocity does \`launch_velocity\` return?`,
          answer: { kind: 'vector', value: [150, -160] },
          inputHint: 'vx, vy',
          explain: md`$v_x = 120/0.8 = 150$; $v_y = 0/0.8 - \tfrac12\cdot 400\cdot 0.8 = -160$ (up). The shot rises $160^2/(2\cdot 400) = 32$ px and peaks at 0.4 s.`,
        },
        {
          kind: 'assets',
          ids: ['mage', 'slime', 'fx_fireball', 'sfx_fire'],
        },
        {
          kind: 'viz',
          viz: { type: 'math.projectile', flightTime: 0.8, gravity: 400 },
          task: md`Throw (J or Space) at the slime on the ledge, then drag it to the far right and throw again: the shot still lands in 0.8 s, so it flies flatter and faster. Make the flight time long and watch the arc rise; make gravity small and see how $-\tfrac12gT$ shrinks.`,
          caption: md`The dashed line is the analytic arc; the dots are the stepped shot. They land together because the launch velocity was solved for this gravity and flight time; the small difference from frame stepping is under a pixel at these speeds.`,
        },
        { kind: 'code', file: 'scripts/math/lob_math.gd', code: LOB_MATH, note: md`A script with \`class_name\` and only static functions is a handy home for maths helpers: any script can call \`LobMath.launch_velocity(...)\` without an instance. It extends \`RefCounted\` implicitly.` },
        {
          kind: 'text',
          md: md`### Friction and drag

Two ways to slow something down, with different feel:

- **Constant friction** removes a fixed amount of speed per second, $f$ px/s²: \`velocity = velocity.move_toward(Vector2.ZERO, friction * delta)\`. It stops in finite time, $v/f$, after $v^2/2f$ px. This is the friction from the movement module: crisp stops.
- **Linear drag** removes a *fraction* of the speed per second: $dv/dt = -c\,v$, whose exact solution is $v(t) = v_0 e^{-ct}$. Per frame: \`velocity *= exp(-drag * delta)\`. It never quite reaches zero (stop it below a small threshold), and the total distance is $v_0/c$. It feels like moving through air or water: fast things slow quickly, slow things drift.

With gravity plus linear drag, the body speeds up until drag balances gravity: $g = c\,v$, so the **terminal velocity** is $g/c$. A floaty feather or a parachuting slime is gravity with strong drag.

What you must not write is \`velocity *= 0.95\` every frame: that removes 5% *per frame*, which is a different amount per second at 60 and at 144 frames per second. The same trap, in its most common form, is camera smoothing.`,
        },
        {
          kind: 'code',
          lang: 'gdscript',
          fragment: true,
          code: gd`
# constant friction: lose 600 px/s of speed every second, stop in finite time
velocity = velocity.move_toward(Vector2.ZERO, 600.0 * delta)

# linear drag: keep exp(-drag * delta) of the speed this frame (drag in 1/s)
velocity *= exp(-drag * delta)

# frame-rate dependent: keeps 95% per FRAME, not per second
velocity *= 0.95
`,
          note: md`The first two lines lose the same amount of speed per second at any frame rate. The last line does not.`,
        },
        {
          kind: 'derive',
          title: 'Why lerp(a, b, w) per frame depends on the frame rate',
          goal: md`A camera does \`pos = pos.lerp(target, w)\` every rendered frame. Find what fraction of the gap to a still target remains after $t$ seconds at $F$ frames per second, and fix it.`,
          steps: [
            { md: md`Each frame closes a fraction $w$ of the gap, so a fraction $1 - w$ remains. After $n$ frames, $(1-w)^n$ remains.` },
            {
              md: md`In $t$ seconds there are $n = F t$ frames, so the remaining gap is $(1-w)^{Ft}$.`,
              choose: {
                prompt: md`With $w = 0.1$, which camera is closer to its target after 0.25 s?`,
                options: [md`The 144 fps camera: $0.9^{36} \approx 2\%$ of the gap remains, against $0.9^{7.5} \approx 45\%$ at 30 fps`, md`The 30 fps camera`, md`They are the same`],
                answer: 0,
                explain: md`More frames means more multiplications by 0.9. The same game feels sluggish on a slow machine and stiff on a fast one.`,
              },
            },
            { md: md`We want the remaining fraction after $t$ seconds to be $e^{-kt}$ for a chosen rate $k$, whatever $F$ is. Split $t$ into frames of length $\Delta t$: $e^{-kt} = (e^{-k\Delta t})^{t/\Delta t}$. So each frame should keep $e^{-k\Delta t}$ of the gap, which means closing a fraction $w = 1 - e^{-k\,\Delta t}$.` },
            { md: md`To keep the feel of a weight $w_0$ tuned at 60 fps, choose $k = -60\ln(1 - w_0)$. For $w_0 = 0.1$, $k \approx 6.32$/s. Half the gap closes every $\ln 2/k$ seconds, a number designers can reason about.` },
          ],
          takeaway: md`\`pos.lerp(target, 1.0 - exp(-k * delta))\` is frame-rate independent exponential smoothing. Inside \`_physics_process\` at a fixed 60 Hz the naive version is stable, but camera and UI code usually runs in \`_process\`, at the monitor's rate.`,
        },
        {
          kind: 'viz',
          viz: { type: 'math.smoothing', method: 'naive' },
          task: md`Walk Kai across the screen and stop. Compare the three camera frames (red 30, yellow 60, blue 144 frames per second). Switch the method to $1 - e^{-k\,\delta}$ with the matching $k$ and repeat.`,
          caption: md`With per-frame lerp, the 30 fps camera lags far behind the 144 fps one and the step responses in the plot fan out. With exponential smoothing all three follow the same curve $100(1 - e^{-kt})$; they differ only in how often they sample it.`,
        },
        {
          kind: 'numeric',
          q: md`A camera used \`lerp(..., 0.1)\` per frame and felt right at 60 fps. What sharpness $k$ (per second) in \`1.0 - exp(-k * delta)\` reproduces that feel at every frame rate?`,
          answer: { kind: 'number', value: -60 * Math.log(0.9) },
          explain: md`$k = -60\ln(0.9) \approx 6.32$ s$^{-1}$. Check: at 60 fps, $1 - e^{-6.32/60} = 1 - 0.9 = 0.1$.`,
        },
        { kind: 'code', file: 'scripts/math/follow_camera.gd', code: FOLLOW, note: md`\`Camera2D\` has its own *Position Smoothing* option, which is fine for many games; writing the follow yourself shows the maths and lets you reuse it for anything that should glide: a health bar's trailing damage segment, a cursor, a pet that follows Kai. At 320×180, consider rounding the camera position to whole pixels when drawing to avoid shimmering sprites.` },
        {
          kind: 'text',
          md: md`### Knockback

A hit should push the target away from the attacker. Model knockback as its own velocity, set once by the hit (an **impulse**: an instant change of velocity) and then decayed:

1. On hit: \`knockback = attacker_position.direction_to(global_position) * strength\`. Direction from the attacker to the target, so it pushes away.
2. Every frame: \`knockback = knockback.move_toward(Vector2.ZERO, decay * delta)\`, then add it to whatever velocity the body wants.

With a constant decay $a$ (px/s²), a strength $s$ (px/s) lasts $s/a$ seconds and pushes $s^2/2a$ pixels: the friction formulas again. That gives designers two meaningful numbers: how far, and for how long the target is pushed (and usually unable to act). Exponential decay (\`knockback *= exp(-k * delta)\`) is the other common choice; it pushes $s/k$ in total and feels softer at the end.`,
        },
        {
          kind: 'numeric',
          q: md`Bram's mace applies knockback strength 180 px/s, and the skeleton's \`knockback_decay\` is 900 px/s². How far is it pushed, and for how long? Enter [distance in px, time in s].`,
          answer: { kind: 'vector', value: [18, 0.2] },
          inputHint: 'distance, time',
          explain: md`Time $180/900 = 0.2$ s (12 frames). Distance $180^2/(2\cdot 900) = 32400/1800 = 18$ px, a little over one tile.`,
        },
        { kind: 'code', file: 'scripts/math/knockback_body.gd', code: KNOCKBACK, note: md`Keeping knockback separate from the movement the AI or the player wants makes both easy to reason about. In the combat modules the hit's \`HitData\` carries the strength, and the state machine ignores input while knockback is above a threshold.` },
        {
          kind: 'check',
          q: md`A teammate implements knockback decay as \`knockback *= 0.85\` in \`_process\`. On a 144 Hz monitor the knockback distance is much shorter than on a 60 Hz one. Which fix keeps the feel they tuned at 60 Hz?`,
          options: [
            md`\`knockback *= exp(-k * delta)\` with $k = -60\ln 0.85 \approx 9.75$, ideally in \`_physics_process\``,
            md`\`knockback *= 0.85 * delta\``,
            md`\`knockback *= 0.85 / delta\``,
            md`Move the same line to \`_physics_process\` and change nothing else; it is then frame-rate independent at every physics rate`,
          ],
          answer: 0,
          explain: md`The per-frame factor 0.85 corresponds to $e^{-k/60}$ with $k = -60\ln 0.85$. Moving the unchanged line to \`_physics_process\` helps only while the physics rate stays 60 Hz. Multiplying by \`delta\` gives a factor near 0.014 per frame, which kills the knockback almost instantly.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'm02-3-build',
            title: 'Click to lob, top-down',
            goal: md`In Shardbound's top-down view there is no gravity on the ground plane; a lobbed shard moves in a straight line on the ground while a separate height $z$ rises and falls. Build Lyra's lob: clicking anywhere sends a shard that lands exactly on the click after 0.6 s, with its sprite drawn above a shadow.`,
            requirements: [
              md`Each left click spawns a shard at Lyra that lands within a pixel of the clicked point after 0.6 s, near or far.`,
              md`The sprite rises and falls above a shadow that slides along the ground in a straight line; the peak is about 22 px above the shadow with gravity 500.`,
              md`The shard frees itself on landing; many clicks in a row work.`,
            ],
            hints: [
              md`Apply $\mathbf{v} = \mathbf{d}/T - \tfrac12\mathbf{g}T$ separately: on the ground plane $\mathbf{g} = 0$, so the ground velocity is $\mathbf{d}/T$; for the height, $d_z = 0$ and gravity pulls $z$ down, so $v_z = \tfrac12 g T$.`,
              md`Scene: \`LobbedShard\` (\`Node2D\`) with a \`Shadow\` \`Sprite2D\` at $(0, 0)$ and the shard \`Sprite2D\` whose \`position.y\` is set to \`-z\`.`,
              md`Give the shard script \`class_name LobbedShard\` so Lyra's script can cast the instance and call \`launch\`.`,
            ],
            solution: [
              { file: 'scripts/math/lobbed_shard.gd', code: LOB },
              { file: 'scripts/math/lyra_lob.gd', code: LYRA },
            ],
            explain: md`The ground and the height are independent axes, so the launch formula splits: the ground part needs no gravity term and the height part needs no displacement term. The peak height is $v_z^2/2g = 150^2/1000 = 22.5$ px. This split, ground position plus a fake height with a shadow, is the same model the jumping module uses for Kai's top-down jumps.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'm02-3-paper',
            title: 'Half-life of a follow camera',
            type: 'compute',
            difficulty: 1,
            minutes: 4,
            statement: md`A designer wants the camera to close half its distance to Kai every 0.1 s. What sharpness $k$ should \`follow_camera.gd\` use?`,
            solution: [md`The gap left after $t$ is $e^{-kt}$. Half remains when $e^{-k\cdot 0.1} = 0.5$.`, md`$k = \ln 2/0.1 \approx 6.93$ s$^{-1}$.`],
            answer: { kind: 'number', value: Math.LN2 / 0.1 },
          },
        },
        {
          kind: 'recall',
          prompt: md`Write the frame-rate independent smoothing line, and the knockback distance and duration for strength $s$ with constant decay $a$.`,
          answer: md`\`pos = pos.lerp(target, 1.0 - exp(-k * delta))\`. Knockback lasts $s/a$ seconds and travels $s^2/2a$ pixels.`,
        },
        {
          kind: 'explain',
          prompt: md`Explain to a teammate why \`velocity *= 0.9\` in \`_process\` is a bug, even if it looks right on their machine.`,
          model: md`It removes 10% of the velocity per *frame*, and the number of frames per second depends on the machine and the monitor. At 144 Hz it runs 2.4 times as often as at 60 Hz, so velocity dies much faster and distances shrink. A per-second rule must be written with \`delta\`: the exact version is \`velocity *= exp(-k * delta)\`, which keeps $e^{-kt}$ after $t$ seconds however the time is sliced, with $k = -60\ln 0.9$ to match the 60 Hz feel. Running it in \`_physics_process\` at a fixed rate also hides the problem, but only until someone changes the tick rate.`,
        },
      ],
      cards: [
        { id: 'm02-3-c1', kind: 'cloze', text: md`Launch velocity for flight time T: $\mathbf{v} = \mathbf{d}/T - $ {{}}.`, answers: ['g*T/2|gT/2|0.5*g*T|0.5gT|½gT'] },
        { id: 'm02-3-c2', kind: 'cloze', text: md`Frame-rate independent smoothing: \`pos.lerp(target, 1.0 - {{}}(-k * delta))\`.`, answers: ['exp'] },
        { id: 'm02-3-c3', kind: 'compute', front: md`Gravity 600 px/s², linear drag 3 s$^{-1}$. Terminal velocity (px/s)?`, answer: { kind: 'number', value: 200 }, back: md`$g/c = 600/3 = 200$ px/s.` },
        { id: 'm02-3-c4', kind: 'compute', front: md`Knockback 120 px/s with decay 1200 px/s². Distance (px)?`, answer: { kind: 'number', value: 6 }, back: md`$s^2/2a = 14400/2400 = 6$ px, over 0.1 s.` },
        { id: 'm02-3-c5', kind: 'concept', front: md`Why is \`lerp(a, b, 0.1)\` in \`_physics_process\` less of a problem than in \`_process\`?`, back: md`Physics runs at a fixed rate (60 Hz by default), so the per-frame factor is a fixed per-second rate. \`_process\` runs at the render rate, which varies by machine. It still breaks if the physics tick rate changes.` },
      ],
    },
  ],
  problems: [
    {
      id: 'm02-p1',
      title: 'Four tiles in half a second',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`A jump should reach 64 px (4 tiles) in 0.5 s. Compute gravity and jump speed. Enter $[g, v_0]$.`,
      solution: [md`$g = 2\cdot 64/0.25 = 512$ px/s².`, md`$v_0 = 2\cdot 64/0.5 = 256$ px/s, so \`jump_velocity = -256.0\`.`],
      answer: { kind: 'vector', value: [512, 256] },
      areas: ['math', 'feel'],
    },
    {
      id: 'm02-p2',
      title: 'Apex from speed and gravity',
      type: 'derive',
      difficulty: 1,
      minutes: 6,
      statement: md`Derive the apex height of a jump from its takeoff speed $v_0$ and gravity $g$ using the area under the speed–time graph, and check it against $g = 2h/t^2$, $v_0 = 2h/t$.`,
      solution: [
        md`The upward speed falls linearly from $v_0$ to 0 over $t = v_0/g$. The height gained is the area of that triangle: $\tfrac12\, v_0\, t = \tfrac12 v_0 \cdot v_0/g = v_0^2/(2g)$.`,
        md`Check: with $v_0 = 2h/t$ and $g = 2h/t^2$, $v_0^2/2g = (4h^2/t^2)/(4h/t^2) = h$.`,
      ],
      rubric: [md`Uses the triangle under the speed graph (or $v^2 = v_0^2 - 2gh$)`, md`Finds $t = v_0/g$ and $h = v_0^2/2g$`, md`Checks consistency with the designer formulas`],
      areas: ['math'],
    },
    {
      id: 'm02-p3',
      title: 'Airtime with fall gravity',
      type: 'compute',
      difficulty: 2,
      minutes: 5,
      statement: md`A jump has $h = 40$ px, $t = 0.35$ s and fall multiplier 2. What is the total airtime for a full jump landing at the starting height, in seconds?`,
      solution: [md`$t_{\text{fall}} = t/\sqrt m = 0.35/\sqrt2 \approx 0.2475$ s.`, md`Airtime $\approx 0.35 + 0.2475 = 0.5975$ s.`],
      answer: { kind: 'number', value: 0.35 + 0.35 / Math.SQRT2 },
      areas: ['math', 'feel'],
    },
    {
      id: 'm02-p4',
      title: 'The moon jump',
      type: 'debug',
      difficulty: 2,
      minutes: 6,
      statement: md`This controller jumps absurdly high and the height changes when the physics tick rate changes. Find both bugs.

\`\`\`gdscript
func _physics_process(delta: float) -> void:
	velocity.y += gravity
	if is_on_floor() and Input.is_action_just_pressed("jump"):
		velocity.y = jump_velocity
	position += velocity * delta
	move_and_slide()
\`\`\``,
      hints: [md`Check the units of each line, and count how many times the body moves per frame.`],
      solution: [
        md`\`velocity.y += gravity\` adds an acceleration without \`* delta\`: at 60 Hz the effective gravity is 60 times too large, and it changes with the tick rate. Write \`velocity.y += gravity * delta\`.`,
        md`\`position += velocity * delta\` moves the body once, and \`move_and_slide()\` moves it again, so it travels twice as far and the first move ignores collisions. Delete the \`position\` line.`,
        md`(With the first bug alone the jump would be tiny, because gravity is far too strong; the double move is what makes the takeoff frame launch so high. Fix both.)`,
      ],
      rubric: [md`Finds the missing \`delta\` on the acceleration`, md`Finds the double move and that it skips collision`, md`States the corrected lines`],
      areas: ['godot', 'math'],
    },
    {
      id: 'm02-p5',
      title: 'Converting a smoothing weight',
      type: 'compute',
      difficulty: 2,
      minutes: 6,
      statement: md`A UI cursor used \`lerp(..., 0.15)\` per frame at 60 fps. To keep that feel, what per-frame weight should it use on a 144 fps monitor?`,
      solution: [md`Match the per-second rate: $k = -60\ln(0.85) \approx 9.751$ s$^{-1}$.`, md`At 144 fps: $w = 1 - e^{-k/144} = 1 - 0.85^{60/144} \approx 0.0655$.`],
      answer: { kind: 'number', value: 1 - Math.pow(0.85, 60 / 144) },
      areas: ['math'],
    },
    {
      id: 'm02-p6',
      title: 'Why semi-implicit?',
      type: 'concept',
      difficulty: 2,
      minutes: 6,
      statement: md`Explain why game physics updates velocity before position (semi-implicit Euler) rather than after (explicit Euler). Give one case where the difference is visible to a player.`,
      solution: [
        md`Both are first-order and cost the same, but explicit Euler adds energy to oscillating systems every step, so springs, orbits and bobbing objects grow and eventually blow up; semi-implicit Euler keeps the energy bounded for $\omega\Delta t < 2$.`,
        md`Visible case: a camera or UI element on a spring that overshoots more each time and flies off screen at low frame rates. Also, velocity-first means a jump or a collision response takes effect in the same frame's movement.`,
      ],
      rubric: [md`Energy growth vs bounded energy`, md`A concrete visible example (spring, orbit, camera)`, md`Notes same cost / same two lines reordered`],
      areas: ['math', 'feel'],
    },
    {
      id: 'm02-p7',
      title: 'Launch velocity on paper',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 8,
      statement: md`Write \`static func launch_velocity(from: Vector2, to: Vector2, flight_time: float, gravity: float) -> Vector2\` for a side view where gravity pulls toward $+y$, and compute its result for \`from = (0, 0)\`, \`to = (90, -30)\`, \`flight_time = 0.6\`, \`gravity = 500\`.`,
      solution: [
        md`\`\`\`gdscript
static func launch_velocity(from: Vector2, to: Vector2, flight_time: float, gravity: float) -> Vector2:
	return (to - from) / flight_time - 0.5 * Vector2(0.0, gravity) * flight_time
\`\`\``,
        md`$v_x = 90/0.6 = 150$; $v_y = -30/0.6 - \tfrac12\cdot 500\cdot 0.6 = -50 - 150 = -200$. Result $(150, -200)$.`,
      ],
      rubric: [md`Divides the displacement by the flight time`, md`Subtracts $\tfrac12 g T$ on the y component only`, md`Gets $(150, -200)$`],
      answer: { kind: 'vector', value: [150, -200] },
      areas: ['math', 'godot'],
    },
    {
      id: 'm02-p8',
      title: 'Exponential knockback',
      type: 'compute',
      difficulty: 3,
      minutes: 8,
      statement: md`Knockback starts at 200 px/s and decays as \`knockback *= exp(-10.0 * delta)\`. How far does it push in total, and after how many seconds does it drop below 10 px/s? Enter [distance, time].`,
      hints: [md`$v(t) = 200e^{-10t}$; distance is its integral from 0 to $\infty$.`],
      solution: [md`Distance $\int_0^\infty 200e^{-10t}\,dt = 200/10 = 20$ px.`, md`$200e^{-10t} = 10 \Rightarrow t = \ln(20)/10 \approx 0.300$ s. Compare constant decay: it would stop completely, but exponential decay needs a cutoff.`],
      answer: { kind: 'vector', value: [20, Math.log(20) / 10] },
      areas: ['math', 'combat'],
    },
    {
      id: 'm02-p9',
      title: 'Two characters, two jumps',
      type: 'design',
      difficulty: 2,
      minutes: 10,
      statement: md`In side-view sections the player can switch between Kai (light, agile) and Bram (heavy, armoured). Both must clear the same 2-tile (32 px) ledges. Propose jump height, time to apex, fall multiplier and jump cut for each, and justify the differences.`,
      solution: [
        md`Both need $h \ge 32$ plus margin, so the *height* should be similar (about 40 px); otherwise one character cannot traverse the level. The differences go into timing: Kai $t = 0.32$ s, $m = 1.8$, $c = 0.45$ (quick, controllable, small hops possible); Bram $t = 0.42$ s, $m = 2.5$, $c = 0.7$ (slower rise, heavy drop, less height control).`,
        md`Consequences to check: Bram's gravity $2\cdot 40/0.42^2 \approx 454$ px/s² rising and $\approx 1134$ falling reads as weight; Kai's airtime $0.32(1 + 1/\sqrt{1.8}) \approx 0.56$ s against Bram's $0.42(1 + 1/\sqrt{2.5}) \approx 0.69$ s, so Bram also jumps further at the same run speed unless he runs slower, which he should.`,
      ],
      rubric: [md`Keeps the reachable height compatible with level geometry`, md`Expresses weight through time to apex and fall multiplier`, md`Computes at least one derived number (gravity or airtime) to check the proposal`, md`Considers horizontal distance or run speed`],
      areas: ['feel'],
    },
    {
      id: 'm02-p10',
      title: 'Parachuting slime',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`A slime falls with gravity 600 px/s² and linear drag \`velocity *= exp(-4.0 * delta)\`. What is its terminal falling speed?`,
      solution: [md`At terminal speed gravity's gain equals drag's loss: $g = c\,v$.`, md`$v = 600/4 = 150$ px/s.`],
      answer: { kind: 'number', value: 150 },
      areas: ['math'],
    },
  ],
};
