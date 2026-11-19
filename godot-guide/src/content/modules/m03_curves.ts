import { md, gd, type Module } from '../types';

const PANEL = gd`
extends Control
## A menu panel that slides in from the left with a small overshoot and fades in,
## then slides out with an ease-in. Keep it directly under a CanvasLayer, not inside a Container.

@export var shown_x := 16.0
@export var slide_time := 0.35

var _tween: Tween
var _open := false


func _ready() -> void:
    hide()


func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("pause"):
        if _open:
            hide_panel()
        else:
            show_panel()


func show_panel() -> void:
    _open = true
    _restart_tween()
    show()
    position.x = -size.x
    modulate.a = 0.0
    _tween.set_parallel(true)  # both properties animate at the same time
    _tween.tween_property(self, "position:x", shown_x, slide_time).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
    _tween.tween_property(self, "modulate:a", 1.0, slide_time * 0.5)


func hide_panel() -> void:
    _open = false
    _restart_tween()
    _tween.tween_property(self, "position:x", -size.x, 0.2).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
    _tween.tween_callback(hide)  # runs after the slide: steps are sequential by default


func _restart_tween() -> void:
    # A new animation replaces the old one. Two tweens on the same property would fight.
    if _tween:
        _tween.kill()
    _tween = create_tween()
`;

const CURVE_DASH = gd`
extends Node2D
## A dash whose speed over time follows a Curve drawn in the Inspector.

@export var speed_curve: Curve  ## x: 0..1 through the dash, y: fraction of dash_speed
@export var dash_speed := 240.0
@export var dash_time := 0.2

var _elapsed := -1.0  ## below zero means "not dashing"
var _direction := Vector2.RIGHT


func _physics_process(delta: float) -> void:
    if _elapsed < 0.0 and Input.is_action_just_pressed("dodge"):
        var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")
        _direction = input.normalized() if input != Vector2.ZERO else Vector2.RIGHT
        _elapsed = 0.0
    if _elapsed < 0.0:
        return
    _elapsed += delta
    var t := clampf(_elapsed / dash_time, 0.0, 1.0)  # normalized time, 0 to 1
    position += _direction * dash_speed * speed_curve.sample(t) * delta
    if t >= 1.0:
        _elapsed = -1.0
`;

const PICKUP = gd`
extends Node2D
## A pickup that pops in when it spawns and flies to the HUD corner when collected.

@export var hud_target := Vector2(300, 12)  ## where the gold counter is, in world space for this test

var _tween: Tween
var _collected := false

@onready var sprite: Sprite2D = $Sprite2D


func _ready() -> void:
    sprite.scale = Vector2.ZERO
    _tween = create_tween()
    # Sequential steps: a quick swell past full size, then an elastic settle.
    _tween.tween_property(sprite, "scale", Vector2(1.3, 1.3), 0.12).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
    _tween.tween_property(sprite, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_ELASTIC).set_ease(Tween.EASE_OUT)


func collect() -> void:
    if _collected:
        return  # a second collect while flying must not start a second animation
    _collected = true
    if _tween:
        _tween.kill()
    _tween = create_tween().set_parallel(true)
    _tween.tween_property(self, "global_position", hud_target, 0.4).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
    _tween.tween_property(sprite, "scale", Vector2(0.5, 0.5), 0.4).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
    _tween.tween_property(self, "modulate:a", 0.0, 0.15).set_delay(0.25)
    _tween.chain().tween_callback(queue_free)  # after all the parallel steps


func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("interact"):
        collect()
`;

const CURVED_SHOT = gd`
extends Node2D
## A shot that flies to its target along a quadratic Bezier curve, bowing to one side.

@export var flight_time := 0.5
@export var bend := 40.0  ## pixels: how far the control point sits to the side of the straight line

var _p0 := Vector2.ZERO
var _p1 := Vector2.ZERO
var _p2 := Vector2.ZERO
var _t := 0.0


func fire(from: Vector2, to: Vector2) -> void:
    _p0 = from
    _p2 = to
    var side := (to - from).orthogonal().normalized()  # perpendicular to the straight path
    _p1 = (from + to) * 0.5 + side * bend
    _t = 0.0
    global_position = from


func _physics_process(delta: float) -> void:
    _t = minf(_t + delta / flight_time, 1.0)
    # De Casteljau: two lerps, then a lerp between their results.
    var a := _p0.lerp(_p1, _t)
    var b := _p1.lerp(_p2, _t)
    var next := a.lerp(b, _t)
    if next != global_position:
        rotation = (next - global_position).angle()  # face along the path
    global_position = next
    if _t >= 1.0:
        queue_free()
`;

const SPRING_FOLLOW = gd`
extends Node2D
## Follows a target (or the mouse) with a damped spring.

@export var target: Node2D
@export var frequency := 3.0                       ## Hz: oscillations per second without damping
@export_range(0.0, 2.0) var damping_ratio := 0.4   ## 0 bounces forever, 1 has no overshoot

var spring_velocity := Vector2.ZERO


func _physics_process(delta: float) -> void:
    var goal: Vector2 = target.global_position if target else get_global_mouse_position()
    var omega := TAU * frequency
    var accel := omega * omega * (goal - global_position) - 2.0 * damping_ratio * omega * spring_velocity
    spring_velocity += accel * delta             # semi-implicit Euler: velocity first,
    global_position += spring_velocity * delta  # then position with the new velocity
`;

const CURSOR = gd`
extends Sprite2D
## A menu cursor that springs to the selected row and stretches along its motion.

@export var rows: Array[Vector2] = [Vector2(40, 60), Vector2(40, 80), Vector2(40, 100)]
@export var frequency := 4.0
@export_range(0.0, 2.0) var damping_ratio := 0.45
@export var stretch := 0.004  ## extra scale per px/s of speed

var _index := 0
var _velocity := Vector2.ZERO


func _ready() -> void:
    position = rows[0]


func _process(delta: float) -> void:
    if Input.is_action_just_pressed("ui_down"):
        _index = (_index + 1) % rows.size()
    if Input.is_action_just_pressed("ui_up"):
        _index = (_index - 1 + rows.size()) % rows.size()

    var omega := TAU * frequency
    var accel := omega * omega * (rows[_index] - position) - 2.0 * damping_ratio * omega * _velocity
    _velocity += accel * delta
    position += _velocity * delta

    # Stretch along the (vertical) motion and squash across it, keeping the area about the same.
    var s := 1.0 + minf(_velocity.length() * stretch, 0.5)
    scale = Vector2(1.0 / s, s)
`;

const ORBIT = gd`
extends Node2D
## Orbits every child Node2D around this node, like shards circling Kai.

@export var radius := 18.0
@export var squash := 0.5            ## y radius / x radius: a circle on the ground seen from above
@export var turns_per_second := 0.5
@export var bob_height := 2.0
@export var bob_frequency := 1.5     ## Hz

var _time := 0.0


func _process(delta: float) -> void:
    _time += delta
    var count := get_child_count()
    for i in count:
        var shard := get_child(i) as Node2D
        if shard == null:
            continue
        # Spread the children evenly: child i starts i / count of a turn ahead.
        var angle := TAU * (turns_per_second * _time + float(i) / count)
        var bob := sin(TAU * bob_frequency * _time + i) * bob_height
        shard.position = Vector2(cos(angle) * radius, sin(angle) * radius * squash - bob)
        shard.z_index = 1 if sin(angle) > 0.0 else -1  # near side in front of Kai, far side behind
`;

const SHAKE = gd`
extends Camera2D
## Trauma-based screen shake: events add trauma, trauma decays, and the offset is
## trauma squared times smooth noise.

@export var max_offset := Vector2(8, 6)  ## pixels at full trauma
@export var decay := 1.5                 ## trauma lost per second: full trauma lasts 1 / decay s
@export var noise_speed := 20.0          ## how fast we travel through the noise

var trauma := 0.0
var _time := 0.0
var _noise := FastNoiseLite.new()


func _ready() -> void:
    _noise.noise_type = FastNoiseLite.TYPE_PERLIN
    _noise.frequency = 1.0
    _noise.seed = randi()


func add_trauma(amount: float) -> void:
    trauma = minf(trauma + amount, 1.0)


func _process(delta: float) -> void:
    _time += delta
    trauma = maxf(trauma - decay * delta, 0.0)
    var shake := trauma * trauma
    var t := _time * noise_speed
    # Two rows of the same 2D noise, far apart, give two unrelated smooth signals.
    offset = Vector2(
        max_offset.x * shake * _noise.get_noise_2d(t, 0.0),
        max_offset.y * shake * _noise.get_noise_2d(t, 100.0)
    )
`;

const SHAKE_BUILD = gd`
extends Camera2D
## Trauma screen shake with per-event amounts and an accessibility scale.

@export var max_offset := Vector2(8, 6)
@export var decay := 1.5
@export var noise_speed := 20.0
@export_range(0.0, 1.0) var shake_scale := 1.0  ## 0 turns shake off; expose it in the options menu

var trauma := 0.0
var _time := 0.0
var _noise := FastNoiseLite.new()


func _ready() -> void:
    _noise.noise_type = FastNoiseLite.TYPE_PERLIN
    _noise.frequency = 1.0
    _noise.seed = randi()


func add_trauma(amount: float) -> void:
    trauma = minf(trauma + amount, 1.0)


func _unhandled_input(event: InputEvent) -> void:
    # Test bindings until combat sends real events: a light hit and a heavy slam.
    if event.is_action_pressed("attack"):
        add_trauma(0.3)
    elif event.is_action_pressed("guard"):
        add_trauma(0.6)


func _process(delta: float) -> void:
    _time += delta
    trauma = maxf(trauma - decay * delta, 0.0)
    var shake := trauma * trauma * shake_scale
    var t := _time * noise_speed
    offset = Vector2(
        max_offset.x * shake * _noise.get_noise_2d(t, 0.0),
        max_offset.y * shake * _noise.get_noise_2d(t, 100.0)
    ).round()  # whole pixels, so the 320×180 image does not shimmer
`;

export const MODULE: Module = {
  id: 'm03',
  part: 'math',
  order: 3,
  title: 'Curves, easing, springs and noise',
  summary: "Easing functions and Godot's Tween; Curve resources; Bezier paths by De Casteljau; damped springs from a frequency and a damping ratio; sin and cos for bobbing and orbits; noise and trauma-based screen shake.",
  relevance: md`This is the maths of polish. Shardbound's menus slide in with \`TRANS_BACK\` and the pickups pop with an elastic settle; Lyra's homing shards curve along Bezier paths; the battle cursor and the camera ride on springs that can be interrupted mid-motion; the golem's slam shakes the screen with trauma and smooth noise, while a goblin's poke barely nudges it; equipped shards orbit Kai in the menu and loot bobs on the ground. Each effect is a few lines once you know which curve to reach for and why.`,
  prereqs: ['g02', 'm02'],
  areas: ['math', 'feel'],
  lessons: [
    {
      id: 'm03-1',
      title: 'Easing functions and tweens',
      minutes: 40,
      objectives: [
        'Read an easing function as a map from normalized time $t \\in [0, 1]$ to progress, and say how in, out, in-out, back and elastic feel.',
        'Evaluate quad, cubic and sine easing at a given $t$ by hand, and derive ease-out from ease-in.',
        'Animate properties with `create_tween()`, `tween_property`, `set_trans` and `set_ease`, in sequence and in parallel.',
        'Shape a value over time with a `Curve` resource and `sample()`.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Open the pause menu in a polished game and the panel does not simply appear. It slides in fast, slows as it arrives, maybe overshoots by a few pixels and settles. A gold coin pops out of a chest larger than life and shrinks back. Damage numbers rise quickly and drift to a stop as they fade. None of this is extra content; it is the same movement from A to B with a different *timing curve*.

A linear move from A to B (constant speed, sudden start, sudden stop) reads as mechanical, because almost nothing in the world moves like that. Easing functions are a small vocabulary of timing curves, and Godot's \`Tween\` applies them to any property in one line.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Easing function',
          md: md`An easing function $f$ maps normalized time $t \in [0, 1]$ to progress, with $f(0) = 0$ and $f(1) = 1$. An animation of duration $D$ from $a$ to $b$ shows

$$\text{value}(\tau) = \operatorname{lerp}\!\big(a,\ b,\ f(\tau/D)\big)$$

at time $\tau$. Linear is $f(t) = t$. The *slope* of $f$ is the speed: a steep start means a fast start. Values of $f$ above 1 (or below 0) mean overshoot past the target (or a wind-up before leaving).`,
        },
        {
          kind: 'text',
          md: md`### The family

Most easing comes from one "in" curve per family, plus two mirrors:

- **in** (\`EASE_IN\`): starts slow, ends fast. $f_{\text{in}}$. Things *leaving*: a panel sliding off screen, a character winding up.
- **out** (\`EASE_OUT\`): starts fast, ends slow. $f_{\text{out}}(t) = 1 - f_{\text{in}}(1 - t)$. Things *arriving*: most UI, damage numbers, a camera settling.
- **in-out** (\`EASE_IN_OUT\`): slow, fast, slow. The first half is $f_{\text{in}}(2t)/2$, the second half its mirror. Things moving between two resting places: a platform, a cutscene camera.

The families (\`TRANS_*\` in Godot) set the strength: \`SINE\` ($1 - \cos(\pi t/2)$) is the gentlest, \`QUAD\` ($t^2$), \`CUBIC\` ($t^3$), \`QUART\`, \`QUINT\` and \`EXPO\` ($2^{10t - 10}$) get progressively sharper. \`BACK\` overshoots, \`ELASTIC\` oscillates around the target like a spring, \`BOUNCE\` lands like a dropped ball.`,
        },
        {
          kind: 'derive',
          title: 'Ease-out from ease-in, and the starting speed',
          goal: md`Derive quad ease-out from $f_{\text{in}}(t) = t^2$ and find how fast it starts compared with linear.`,
          steps: [
            {
              md: md`Ease-out is ease-in played backwards in time *and* upside down: run time from the end ($1 - t$) and measure progress from the target ($1 - f$).`,
              choose: {
                prompt: md`What is $f_{\text{out}}(t) = 1 - f_{\text{in}}(1 - t)$ for $f_{\text{in}}(t) = t^2$?`,
                options: [md`$1 - (1 - t)^2 = 2t - t^2$`, md`$1 - t^2$`, md`$(1 - t)^2$`],
                answer: 0,
                explain: md`Substitute: $1 - (1 - t)^2 = 1 - (1 - 2t + t^2) = 2t - t^2$. Check $f(0) = 0$ and $f(1) = 1$. The other two run from 1 to 0.`,
              },
            },
            {
              md: md`The starting speed is the slope at $t = 0$: $f'(t) = 2 - 2t$, so $f'(0) = 2$.`,
              choose: {
                prompt: md`A panel moves 200 px in 0.3 s with quad ease-out. How fast does it start?`,
                options: [md`$2 \times 200/0.3 \approx 1333$ px/s`, md`$200/0.3 \approx 667$ px/s`, md`0 px/s`],
                answer: 0,
                explain: md`Linear would move at the average speed, 667 px/s. Quad ease-out starts at twice the average and slows to zero at the end; cubic ease-out starts at three times the average.`,
              },
            },
          ],
          takeaway: md`Ease-out front-loads the motion: the element is near its target almost immediately and spends the rest of the time settling, which is why UI feels responsive with it even at durations of 0.3 s or more.`,
        },
        {
          kind: 'assets',
          ids: ['hero', 'ui_panel', 'sfx_menu_move'],
        },
        {
          kind: 'viz',
          viz: { type: 'math.easing', trans: 'back', ease: 'out' },
          task: md`Compare \`back\` out with \`cubic\` out, then try \`elastic\` and \`bounce\`. For each, read $\max f$ (overshoot) and $f'(0)$ (start speed). Switch \`quad\` between in, out and in_out and watch Kai's walk against the grey linear ghost.`,
          caption: md`The grey dot under Kai is where linear timing would put him. The UI box scales from 0 to 1 with the same curve, which is how pop-in effects use \`BACK\` and \`ELASTIC\`. The code under the figure is the tween for the current choice.`,
        },
        {
          kind: 'numeric',
          q: md`Evaluate cubic ease-out, $f(t) = 1 - (1 - t)^3$, at $t = 0.5$. What fraction of the distance has the element covered at half time?`,
          answer: { kind: 'number', value: 0.875 },
          explain: md`$1 - 0.5^3 = 1 - 0.125 = 0.875$: 87.5% of the way at half time.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'Tween in Godot 4',
          md: md`\`create_tween()\` (a method of every \`Node\`) returns a \`Tween\` bound to that node; it starts on the next frame and frees itself when done, or when the node leaves the tree.

- \`tween.tween_property(object, "property", final_value, duration)\` animates one property. Property paths can reach into components: \`"position:x"\`, \`"modulate:a"\`, \`"scale"\`.
- It returns a \`PropertyTweener\`, on which you chain \`.set_trans(Tween.TRANS_BACK)\`, \`.set_ease(Tween.EASE_OUT)\`, \`.from(start_value)\`, \`.set_delay(seconds)\` or \`.as_relative()\`.
- Steps added to one tween run **in sequence**. \`tween.set_parallel(true)\` makes later steps run together; \`tween.parallel()\` makes just the next step join the previous one; \`tween.chain()\` goes back to sequence after parallel steps.
- \`tween_interval(seconds)\` waits, \`tween_callback(callable)\` calls a function, \`tween.finished\` is a signal you can \`await\`.
- \`tween.kill()\` stops a tween. Keep a reference if a new animation may start before the old one ends.`,
        },
        { kind: 'code', file: 'scripts/math/slide_panel.gd', code: PANEL, note: md`Leaving uses \`EASE_IN\`: the panel starts slowly and leaves fast, the mirror of arriving. Because a \`Control\` scales and rotates around its \`pivot_offset\` (top-left by default), set the pivot to the centre (\`pivot_offset = size / 2\`) before tweening \`scale\` for a pop.` },
        {
          kind: 'check',
          q: md`The player presses pause twice quickly. The panel script creates a new tween on each press but never kills the old one. What happens?`,
          options: [md`Both tweens animate \`position:x\` at once and fight; the panel jitters and ends wherever the last-finishing tween leaves it`, md`The second tween waits until the first finishes`, md`Godot cancels the first tween automatically`, md`Nothing visible`],
          answer: 0,
          explain: md`Tweens are independent; each writes its value every frame. Keep the tween in a variable and \`kill()\` it before starting a new one, as \`_restart_tween()\` does.`,
        },
        {
          kind: 'text',
          md: md`### Curve resources: when no formula fits

Sometimes the shape you want is not a standard easing: a dash that bursts to full speed, holds, and tails off; a charge attack whose damage ramps slowly and then jumps near the end. A \`Curve\` resource lets you *draw* the shape in the Inspector (right-click to add points, drag tangent handles) and sample it in code with \`curve.sample(t)\` for \`t\` in $[0, 1]$. It is data, so a designer can tune it without touching the script, and the same script can use different curves for different characters.`,
        },
        { kind: 'code', file: 'scripts/math/curve_dash.gd', code: CURVE_DASH, note: md`The pattern is the same as a tween: normalized time \`t = elapsed / duration\`, then a shaping function. Here the curve shapes a *speed*, so the distance covered is the area under it: a curve that holds 1.0 for half the dash and falls to 0 covers about 75% of \`dash_speed * dash_time\`.` },
        {
          kind: 'steps',
          title: 'Tween a panel and draw a dash curve',
          steps: [
            md`Create \`scenes/math/tween_lab.tscn\` with a \`Node2D\` root. Add a \`CanvasLayer\` and, under it, a \`Panel\` sized about $120 \times 80$ at position $(16, 40)$. Attach \`scripts/math/slide_panel.gd\` to the panel.`,
            md`Make sure the \`pause\` action exists in **Project → Project Settings → Input Map** (Escape and the gamepad Start button). Run with **F6** and press Escape a few times, including quickly in a row.`,
            md`Add a \`Node2D\` named \`Dasher\` at $(60, 120)$ with a sprite of Kai, and attach \`scripts/math/curve_dash.gd\`. In the Inspector, click *Speed Curve* → **New Curve**, then click the curve to open the editor. Add points so it rises from 0.2 to 1.0 quickly, holds, then drops to 0.`,
            md`Run again and press the \`dodge\` action: Kai dashes with your curve. Change the curve while the game runs (select \`Dasher\` in the Remote tree) and dash again.`,
          ],
          result: md`The panel slides in with a slight overshoot and fades in together with the slide, then slides out accelerating, and rapid presses never leave it stuck halfway. The dash follows the curve you drew; flattening the curve's tail makes the dash end abruptly.`,
          troubleshoot: [
            { problem: md`The panel does not move, or snaps back.`, fix: md`A \`Container\` parent controls its children's positions. Put the panel directly under the \`CanvasLayer\` (or a plain \`Control\`).` },
            { problem: md`Error: "Invalid call. Nonexistent function 'sample' in base 'Nil'".`, fix: md`The \`speed_curve\` export is empty. Create the \`Curve\` in the Inspector.` },
          ],
        },
        {
          kind: 'build',
          ch: {
            id: 'm03-1-build',
            title: 'A pickup that pops and flies to the HUD',
            goal: md`Make a gold pickup that pops in when it spawns and, when collected, flies to the gold counter in the top-right corner while shrinking and fading. Test it with a few pickups in the tween lab and the \`interact\` action.`,
            requirements: [
              md`On spawn, the sprite swells to about 130% in 0.12 s, then settles to 100% with a small elastic wobble.`,
              md`On collect, it accelerates toward $(300, 12)$ over 0.4 s (ease-in), shrinking to half size; the fade starts 0.25 s in; then the node frees itself.`,
              md`Pressing \`interact\` again during the flight does not restart or break the animation.`,
              md`Collecting during the spawn pop works (the pop is cancelled cleanly).`,
            ],
            hints: [
              md`The pop is two sequential \`tween_property\` steps on the sprite's \`scale\`; the flight is three parallel steps, then \`chain()\` and a \`tween_callback(queue_free)\`.`,
              md`Guard \`collect()\` with a boolean, and \`kill()\` the pop tween before starting the flight.`,
              md`\`.set_delay(0.25)\` on the fade step starts it later within the parallel group.`,
            ],
            solution: [{ file: 'scripts/math/pickup.gd', code: PICKUP }],
            explain: md`Arrival uses ease-out shapes (\`QUAD\` out, \`ELASTIC\` out) and departure uses ease-in (\`CUBIC\` in), following the rule from the lesson. Keeping one \`_tween\` per node and killing it before starting another is what makes the pickup safe to collect at any moment.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'm03-1-paper',
            title: 'Easing values by hand',
            type: 'compute',
            difficulty: 1,
            minutes: 6,
            statement: md`Evaluate at $t = 0.25$: (a) quad ease-in, (b) quad ease-out, (c) cubic ease-in-out. Enter all three.`,
            hints: [md`In-out at $t < 0.5$ is $f_{\text{in}}(2t)/2$.`],
            solution: [
              md`(a) $0.25^2 = 0.0625$.`,
              md`(b) $1 - 0.75^2 = 0.4375$.`,
              md`(c) $f_{\text{in}}(0.5)/2 = 0.125/2 = 0.0625$. At a quarter of the time, ease-out has covered 7 times as much ground as ease-in.`,
            ],
            answer: { kind: 'vector', value: [0.0625, 0.4375, 0.0625] },
          },
        },
        {
          kind: 'recall',
          prompt: md`Which ease do you use for things arriving, things leaving, and things moving between two resting places? Write the Godot tween line for a sprite arriving at $x = 200$ in 0.4 s with an overshoot.`,
          answer: md`Arriving: \`EASE_OUT\`. Leaving: \`EASE_IN\`. Between rests: \`EASE_IN_OUT\`. \`create_tween().tween_property(sprite, "position:x", 200.0, 0.4).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)\`.`,
        },
        {
          kind: 'explain',
          prompt: md`Why does ease-out make UI feel more responsive than linear motion of the same duration?`,
          model: md`Responsiveness is judged by how soon something reacts and gets close to where it is going. Ease-out starts at two or three times the average speed, so the element is most of the way there in the first third of the animation; the remaining time is a gentle settle that the eye reads as weight rather than delay. Linear motion of the same duration is only a third of the way there at the same moment and then stops abruptly. Ease-in for UI arriving feels worst of all: it hesitates first, exactly when the player is waiting.`,
        },
      ],
      cards: [
        { id: 'm03-1-c1', kind: 'cloze', text: md`Ease-out from ease-in: f_out(t) = 1 − f_in({{}}).`, answers: ['1-t|1 - t|1−t'] },
        { id: 'm03-1-c2', kind: 'compute', front: md`Quad ease-out at $t = 0.5$?`, answer: { kind: 'number', value: 0.75 }, back: md`$1 - 0.5^2 = 0.75$.` },
        { id: 'm03-1-c3', kind: 'concept', front: md`How do you make two tween steps run at the same time, and then return to sequence?`, back: md`\`tween.set_parallel(true)\` (or \`tween.parallel()\` before one step); \`tween.chain()\` returns to sequential steps.` },
        { id: 'm03-1-c4', kind: 'cloze', text: md`To sample a \`Curve\` resource at normalized time t, call \`curve.{{}}(t)\`.`, answers: ['sample'] },
        { id: 'm03-1-c5', kind: 'concept', front: md`What goes wrong when a new tween starts on a property while an old one is still running, and how do you prevent it?`, back: md`Both write the property every frame and fight. Keep a reference and \`kill()\` the old tween first.` },
      ],
    },
    {
      id: 'm03-2',
      title: 'Bezier paths and damped springs',
      minutes: 45,
      objectives: [
        "Evaluate quadratic and cubic Bezier curves with De Casteljau's repeated lerp, and place a control point for a curved shot.",
        'Explain why even steps in $t$ are not even steps along the curve, and how `Curve2D` baking or `PathFollow2D` fixes it.',
        'Write a damped spring from a frequency $f$ and a damping ratio $\\zeta$, integrated with semi-implicit Euler.',
        'Predict overshoot, first-peak time and settling time from $f$ and $\\zeta$, and use springs for cursors, cameras and squash and stretch.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Lyra's homing shard should not fly in a straight line: it should leave her hand going sideways and curve onto the target, so the player reads it as magic and the enemy has a moment to react. And the battle menu's cursor should snap to the next ability with a tiny overshoot, even if the player presses down three times in half a second.

The first is a **Bezier curve**: a path shaped by control points. The second is a **spring**: motion driven by a force toward a target. Tweens can do neither well. A tween has a fixed start, end and duration, so it cannot follow a target that moves halfway through, while a spring simply keeps pulling toward wherever the target is now.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Quadratic Bezier curve',
          md: md`Given a start $\mathbf{p}_0$, a control point $\mathbf{p}_1$ and an end $\mathbf{p}_2$, for $t \in [0, 1]$:

$$\mathbf{a} = \operatorname{lerp}(\mathbf{p}_0, \mathbf{p}_1, t), \quad \mathbf{b} = \operatorname{lerp}(\mathbf{p}_1, \mathbf{p}_2, t), \quad \mathbf{B}(t) = \operatorname{lerp}(\mathbf{a}, \mathbf{b}, t).$$

This repeated lerp is **De Casteljau's algorithm**. The curve starts at $\mathbf{p}_0$ heading toward $\mathbf{p}_1$, ends at $\mathbf{p}_2$ arriving from the direction of $\mathbf{p}_1$, and never passes through $\mathbf{p}_1$; the control point pulls. A **cubic** curve has two control points and three rounds of lerp; Godot provides it as \`p0.bezier_interpolate(p1, p2, p3, t)\`.`,
        },
        {
          kind: 'derive',
          title: 'From repeated lerp to a formula',
          goal: md`Expand De Casteljau's construction for a quadratic curve into a single weighted sum of the three points.`,
          steps: [
            { md: md`$\mathbf{a} = (1-t)\mathbf{p}_0 + t\,\mathbf{p}_1$ and $\mathbf{b} = (1-t)\mathbf{p}_1 + t\,\mathbf{p}_2$ (a lerp is a weighted average).` },
            {
              md: md`$\mathbf{B} = (1-t)\mathbf{a} + t\,\mathbf{b}$. Substitute and collect each point's weight.`,
              choose: {
                prompt: md`What weight does $\mathbf{p}_1$ get?`,
                options: [md`$2t(1-t)$`, md`$t(1-t)$`, md`$t^2$`],
                answer: 0,
                explain: md`$\mathbf{p}_1$ appears in $\mathbf{a}$ with weight $t$ (then multiplied by $1 - t$) and in $\mathbf{b}$ with weight $1 - t$ (then multiplied by $t$): $2t(1 - t)$ in total.`,
              },
            },
            { md: md`$$\mathbf{B}(t) = (1-t)^2\mathbf{p}_0 + 2t(1-t)\,\mathbf{p}_1 + t^2\mathbf{p}_2.$$ The weights add up to $(1 - t + t)^2 = 1$, so the curve is always a weighted average of its points and stays inside their triangle. The cubic version has weights $(1-t)^3,\ 3t(1-t)^2,\ 3t^2(1-t),\ t^3$.` },
          ],
          takeaway: md`At $t = 0.5$ the quadratic weights are $\tfrac14, \tfrac12, \tfrac14$: the curve's midpoint is pulled only halfway toward the midpoint of the control polygon, which is why a control point must sit further out than the bulge you want.`,
        },
        {
          kind: 'viz',
          viz: { type: 'math.bezier', kind: 'quadratic' },
          task: md`Drag $p_1$ far above the line from Lyra to the slime: how high does the curve actually get? Play the motion and watch the three construction points. Then switch to cubic, make an S shape, and turn on **even spacing**.`,
          caption: md`The green dots are at $t = 0, 0.1, \dots, 1$. They crowd together where the curve turns sharply, so an object moving with constant $t$ speed slows down in bends. Even spacing re-times $t$ by distance along the curve, which is what \`Curve2D\`'s baked points do.`,
        },
        {
          kind: 'numeric',
          q: md`$\mathbf{p}_0 = (0, 0)$, $\mathbf{p}_1 = (40, -60)$, $\mathbf{p}_2 = (80, 0)$. Where is the quadratic curve at $t = 0.5$?`,
          answer: { kind: 'vector', value: [40, -30] },
          inputHint: 'x, y',
          explain: md`$\tfrac14(0,0) + \tfrac12(40,-60) + \tfrac14(80,0) = (20 + 20,\ -30) = (40, -30)$: 30 px up, half as high as the control point.`,
        },
        { kind: 'code', file: 'scripts/math/curved_shot.gd', code: CURVED_SHOT, note: md`\`orthogonal()\` returns the vector turned by 90° with the same length, so \`side\` is a unit vector perpendicular to the straight path; a negative \`bend\` curves the other way. Because $t$ advances uniformly, the shot slows slightly in the bend. For constant speed along a designed path, use a \`Path2D\` with a \`PathFollow2D\` child and advance \`progress\` (in pixels) instead; Godot bakes the curve into evenly spaced points for that.` },
        {
          kind: 'text',
          md: md`### Springs

A spring pulls toward its target with a force proportional to the distance, and a damper resists motion with a force proportional to the speed:

$$m\,\ddot x = -k\,(x - x_{\text{target}}) - c\,\dot x.$$

Stiffness $k$, damping $c$ and mass $m$ are awkward to tune: change one and both the speed and the bounciness change. Two derived numbers separate those effects.`,
        },
        {
          kind: 'derive',
          title: 'Frequency and damping ratio',
          goal: md`Rewrite the mass-spring-damper equation with an angular frequency $\omega$ and a damping ratio $\zeta$.`,
          steps: [
            {
              md: md`Divide by $m$: $\ddot x = -\tfrac{k}{m}(x - x_t) - \tfrac{c}{m}\dot x$. Without damping the solution is $\cos(\omega t)$ with $\omega^2 = k/m$.`,
              choose: {
                prompt: md`If $\omega = 2\pi f$, what does $f$ measure?`,
                options: [md`Oscillations per second (Hz) of the undamped spring`, md`The overshoot as a fraction`, md`The time to reach the target`],
                answer: 0,
                explain: md`$\cos(2\pi f t)$ completes $f$ cycles per second. Higher $f$ means a snappier, faster spring.`,
              },
            },
            { md: md`Define $\zeta = \dfrac{c}{2\sqrt{km}}$, so that $\tfrac{c}{m} = 2\zeta\omega$. Then $$\ddot x = \omega^2(x_t - x) - 2\zeta\omega\,\dot x.$$` },
            {
              md: md`$\zeta$ alone decides the *shape* of the response: below 1 it overshoots and oscillates (underdamped), at exactly 1 it reaches the target as fast as possible without overshooting (critically damped), above 1 it creeps in slowly (overdamped).`,
              choose: {
                prompt: md`A menu cursor should arrive quickly with a small, visible overshoot. Which damping ratio?`,
                options: [md`About 0.4 to 0.6`, md`Exactly 1`, md`About 2`],
                answer: 0,
                explain: md`$\zeta = 0.5$ overshoots by about 16%, enough to read as bounce without wobbling. 1 has no overshoot; 2 is sluggish.`,
              },
            },
          ],
          takeaway: md`Tune a spring with $f$ (how fast) and $\zeta$ (how bouncy). They are independent: doubling $f$ makes the same-shaped motion twice as fast.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'What f and ζ predict (underdamped, ζ < 1)',
          md: md`For a step to a new target, with $\omega = 2\pi f$ and $\omega_d = \omega\sqrt{1 - \zeta^2}$:

- **Overshoot** fraction: $e^{-\pi\zeta/\sqrt{1-\zeta^2}}$. $\zeta = 0.3$: 37%; $0.5$: 16%; $0.7$: 4.6%.
- **First peak** at $t = \pi/\omega_d$.
- **Settles** within 2% after roughly $4/(\zeta\omega)$ seconds.

Stability when stepped with semi-implicit Euler: keep $\omega\,\Delta t$ well below 2. At 60 Hz that limits $f$ to under about 19 Hz, far above anything that looks good.`,
        },
        {
          kind: 'viz',
          viz: { type: 'math.spring', frequency: 3, damping: 0.4 },
          task: md`Drag the target back and forth quickly, including in the middle of a bounce: the slime never jumps. Find the $\zeta$ where the overshoot disappears. Then set $\zeta = 0.4$ and change only the frequency: the plot keeps its shape and only gets faster.`,
          caption: md`The plot is the step response simulated at 60 Hz with the listing below; the red line marks the predicted overshoot. Squash and stretch reads the spring's speed: faster means longer and thinner.`,
        },
        {
          kind: 'numeric',
          q: md`A spring has $\zeta = 0.5$. By what percentage of the step does it overshoot?`,
          answer: { kind: 'number', value: 100 * Math.exp((-0.5 * Math.PI) / Math.sqrt(0.75)) },
          explain: md`$e^{-\pi\cdot 0.5/\sqrt{0.75}} = e^{-1.814} \approx 0.163$: about 16.3%. A cursor moving 20 px overshoots by about 3 px.`,
        },
        { kind: 'code', file: 'scripts/math/spring_follow.gd', code: SPRING_FOLLOW, note: md`The spring keeps its own velocity between frames, which is the difference from a tween: when the target moves mid-motion, the follower changes course smoothly instead of restarting. It runs in \`_physics_process\` for a fixed $\Delta t$; in \`_process\` it also works while $\omega\Delta t$ stays small at the lowest frame rate you support.` },
        {
          kind: 'check',
          q: md`Someone sets a spring's frequency to 20 Hz to make a camera "really tight". At 60 Hz physics the camera flies off to infinity within a second. Why?`,
          options: [
            md`$\omega\Delta t = 2\pi\cdot 20/60 \approx 2.1$, above the stability limit of about 2 for semi-implicit Euler`,
            md`The damping ratio must be above 1 for frequencies over 10 Hz`,
            md`Springs only work in \`_process\``,
            md`The target moved too far in one frame`,
          ],
          answer: 0,
          explain: md`Each step overcorrects more than the last. Lower the frequency (above 8 to 10 Hz looks like snapping anyway), or step the spring several times per frame with a smaller $\Delta t$.`,
        },
        {
          kind: 'steps',
          title: 'A spring follower',
          steps: [
            md`Create \`scenes/math/spring_lab.tscn\` with a \`Node2D\` root, and add a \`Node2D\` named \`Follower\` with a sprite (a frame of the slime works).`,
            md`Attach \`scripts/math/spring_follow.gd\` and leave \`target\` empty, so it follows the mouse. Run with **F6**.`,
            md`While it runs, select \`Follower\` in the Remote tree and try damping ratios 0.1, 0.5, 1.0 and 1.5, and frequencies 1, 3 and 8.`,
          ],
          result: md`The slime chases the mouse and overshoots more as the damping ratio drops; at 1.0 it arrives without overshoot; at 1.5 it lags. At frequency 8 it is almost glued to the pointer.`,
          troubleshoot: [
            { problem: md`It explodes off screen.`, fix: md`Check the order: velocity first, then position. Explicit Euler (position first) gains energy. Also keep the frequency under about 10 Hz at 60 Hz physics.` },
            { problem: md`It never settles at damping 0.`, fix: md`Correct: $\zeta = 0$ is an undamped spring that oscillates forever.` },
          ],
        },
        {
          kind: 'build',
          ch: {
            id: 'm03-2-build',
            title: 'A springy menu cursor with squash and stretch',
            goal: md`Make a menu cursor (\`Sprite2D\`, a frame of \`ui_cursor\`) that moves between three rows with \`ui_up\` / \`ui_down\` on a spring, stretching along its motion.`,
            requirements: [
              md`Pressing down moves the cursor to the next row with a small overshoot (2 to 4 px for a 20 px step) and it settles in under half a second.`,
              md`Pressing down several times quickly makes the cursor redirect smoothly toward the latest row, with no jumps.`,
              md`While moving, the cursor is taller and thinner in proportion to its speed, and returns to its normal shape at rest; the area stays roughly constant.`,
            ],
            hints: [
              md`$f = 4$ Hz, $\zeta = 0.45$: overshoot $e^{-\pi \cdot 0.45/0.893} \approx 20\%$ of the step, settling in about $4/(0.45\cdot 25) \approx 0.35$ s.`,
              md`For the stretch, compute $s = 1 + \min(k|\mathbf{v}|, 0.5)$ and set \`scale = Vector2(1.0 / s, s)\`: $x$ shrinks as much as $y$ grows, so $x \cdot y = 1$.`,
            ],
            solution: [{ file: 'scripts/math/menu_cursor.gd', code: CURSOR }],
            explain: md`The spring state (\`_velocity\`) survives between presses, so a new target only changes the force; the motion bends instead of restarting, which a tween cannot do without extra bookkeeping. Squash and stretch reads the spring's own speed, so it peaks mid-move and vanishes at rest without any timers.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'm03-2-paper',
            title: 'Reading a spring',
            type: 'compute',
            difficulty: 2,
            minutes: 8,
            statement: md`A camera spring uses $f = 2$ Hz and $\zeta = 0.4$. When does it reach its first peak, and roughly when does it settle within 2%? Enter [peak time, settle time] in seconds.`,
            solution: [
              md`$\omega = 4\pi \approx 12.566$; $\omega_d = \omega\sqrt{1 - 0.16} \approx 12.566 \times 0.9165 \approx 11.517$.`,
              md`First peak: $\pi/\omega_d \approx 0.273$ s.`,
              md`Settling: $4/(\zeta\omega) = 4/5.027 \approx 0.796$ s. Overshoot would be $e^{-\pi\cdot 0.4/0.9165} \approx 25\%$, a lot for a camera; $\zeta \approx 0.8$ is a calmer choice.`,
            ],
            answer: { kind: 'vector', value: [Math.PI / (4 * Math.PI * Math.sqrt(0.84)), 4 / (0.4 * 4 * Math.PI)] },
          },
        },
        {
          kind: 'recall',
          prompt: md`Write the spring acceleration in terms of $f$ and $\zeta$, and the two lines that integrate it.`,
          answer: md`$\omega = 2\pi f$; accel $= \omega^2(\text{target} - x) - 2\zeta\omega v$. Then \`v += accel * delta\` and \`x += v * delta\` (velocity first).`,
        },
        {
          kind: 'explain',
          prompt: md`When would you choose a spring over a tween for a UI element, and when a tween over a spring?`,
          model: md`A spring suits motion whose target can change at any time: cursors, cameras, things following the player, health bars catching up. It keeps its velocity, so retargeting mid-motion is smooth and needs no code. It has no fixed duration, though; it settles when physics says so. A tween suits scripted motion with a known start, end and duration that must sync with something else: a panel slide that must finish before a sound, a cutscene beat, a sequence of steps with callbacks. Tweens are also easier to chain and to make deterministic; springs are easier to interrupt.`,
        },
      ],
      cards: [
        { id: 'm03-2-c1', kind: 'cloze', text: md`In a quadratic Bezier curve, the control point $\mathbf{p}_1$ has weight {{}} (in terms of t).`, answers: ['2t(1-t)|2t(1 - t)|2*t*(1-t)'] },
        { id: 'm03-2-c2', kind: 'concept', front: md`Why does an object moving along a Bezier curve with constant $t$ speed slow down in bends?`, back: md`Equal steps in $t$ are not equal distances along the curve; samples crowd where the curve turns. Re-time by arc length (\`Curve2D\` baking, \`PathFollow2D.progress\`) for constant speed.` },
        { id: 'm03-2-c3', kind: 'compute', front: md`$m = 1$, $k = 400$, $c = 16$. Damping ratio $\zeta$?`, answer: { kind: 'number', value: 0.4 }, back: md`$\zeta = c/(2\sqrt{km}) = 16/40 = 0.4$ (and $\omega = 20$ rad/s).` },
        { id: 'm03-2-c4', kind: 'cloze', text: md`A damping ratio of exactly {{}} reaches the target fastest without overshooting.`, answers: ['1|1.0|one'] },
        { id: 'm03-2-c5', kind: 'compute', front: md`Overshoot (%) of a spring with $\zeta = 0.7$?`, answer: { kind: 'number', value: 100 * Math.exp((-0.7 * Math.PI) / Math.sqrt(0.51)) }, back: md`$e^{-\pi\cdot 0.7/\sqrt{0.51}} \approx 0.046$: about 4.6%.` },
      ],
    },
    {
      id: 'm03-3',
      title: 'Waves, noise and screen shake',
      minutes: 40,
      objectives: [
        'Use sin and cos for bobbing, pulsing and orbits, with amplitude in pixels, frequency in Hz and a phase.',
        'Explain the difference between per-frame random values and value or Perlin noise, and sample `FastNoiseLite`.',
        'Implement trauma-based screen shake where shake $= \\text{trauma}^2$ decays over time.',
        'Choose shake amounts per event, and keep shake readable and optional.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Some motion should never stop: a health potion bobbing on the dungeon floor, a save crystal pulsing, the equipped shards circling Kai in the status screen. Some motion should be violent and brief: the screen jolts when the golem's fists hit the ground, and barely twitches when a slime bumps Kai.

The first kind is built from **sine waves**, the second from **noise**, and both are driven by time. This lesson covers the trigonometry you need for the first and a standard, well-tested model for the second: trauma-based screen shake.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'A sine wave in game units',
          md: md`$$y(t) = A\sin(2\pi f t + \varphi)$$

- **Amplitude** $A$: the peak offset in pixels.
- **Frequency** $f$: cycles per second (Hz). In GDScript, \`sin(TAU * f * time)\`.
- **Phase** $\varphi$: a head start in radians. Giving each object a different phase (for example its index, or a random value) stops a row of pickups bobbing in lockstep.

The peak speed is $2\pi f A$, reached as the wave crosses zero. A circle is cos and sin together: $(r\cos\theta, r\sin\theta)$ with $\theta = 2\pi f t$ is a point going round $f$ times per second. In a top-down view a circle on the ground looks squashed vertically, so multiply the y part by a factor such as 0.5.`,
        },
        {
          kind: 'viz',
          viz: { type: 'math.orbit', count: 3 },
          task: md`Walk Kai around. Set \`squash\` to 1 and then to 0.5: which looks like shards circling *on the ground plane*? Watch a shard pass behind Kai. Then raise the count to 6 and compare the bob of neighbouring shards.`,
          caption: md`Each shard's angle is offset by $360°/n$, and each bob by its index as a phase. Shards with $\sin\theta > 0$ are on the near half of the ellipse (lower on screen) and draw in front of Kai; the others draw behind.`,
        },
        {
          kind: 'numeric',
          q: md`A pickup bobs with amplitude 3 px at 0.5 Hz. What is its peak vertical speed in px/s?`,
          answer: { kind: 'number', value: 2 * Math.PI * 0.5 * 3 },
          explain: md`$2\pi f A = 2\pi \cdot 0.5 \cdot 3 = 3\pi \approx 9.42$ px/s. Slow enough to read as floating; at 3 Hz it would be 57 px/s and look like vibrating.`,
        },
        { kind: 'code', file: 'scripts/math/orbiting_shards.gd', code: ORBIT, note: md`\`z_index\` is relative to the parent by default, so with this node as a child of Kai, $+1$ draws in front of Kai's sprite and $-1$ behind it. The orbit uses \`_process\` because it is purely visual; nothing collides with it.` },
        {
          kind: 'text',
          md: md`### Random versus noise

To shake the camera you need a value that changes unpredictably. The obvious tool, \`randf_range(-1.0, 1.0)\` every frame, gives **white noise**: each frame is unrelated to the last. It looks like a broken video signal rather than an impact, and it is frame-rate dependent (at 144 fps there are 2.4 times as many jumps per second as at 60).

**Coherent noise** is random but smooth. **Value noise** picks a random value at each integer position and blends smoothly between neighbours. **Perlin noise** (gradient noise) picks a random *slope* at each integer instead, which avoids the blocky look of value noise. Either way you sample it with a coordinate, \`noise(time * speed)\`: nearby times give nearby values, so the camera moves in smooth jolts, and the result depends on *time*, not on how many frames were drawn.

Godot's \`FastNoiseLite\` resource provides both (\`TYPE_VALUE\`, \`TYPE_PERLIN\`, \`TYPE_SIMPLEX\`, plus cellular noise): \`get_noise_1d(x)\` or \`get_noise_2d(x, y)\` returns a value roughly in $[-1, 1]$. Its \`frequency\` scales the input coordinate, and \`seed\` picks a different pattern.`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'Trauma-based shake',
          md: md`Instead of starting a shake animation per hit, keep one number, **trauma** in $[0, 1]$:

- Each event *adds* trauma (a light hit 0.2 to 0.3, a heavy slam 0.6, a boss death 1.0), clamped to 1. Hits that overlap stack naturally.
- Trauma *decays* linearly every frame (1 to 2 per second).
- The visible **shake** is $\text{trauma}^2$ (or cubed), and the camera offset is \`max_offset * shake * noise(time)\`.

Squaring is what makes it read well: small trauma produces almost nothing, large trauma a lot, and as trauma falls the shake fades out softly instead of stopping. Keep \`max_offset\` small at 320×180 (a few pixels), keep the HUD out of the shaken view (on a \`CanvasLayer\`), and offer a setting to reduce or disable shake, which some players need.`,
        },
        {
          kind: 'derive',
          title: 'Why square the trauma?',
          goal: md`Compare shake $= \text{trauma}$ and shake $= \text{trauma}^2$ for a small and a large hit.`,
          steps: [
            {
              md: md`A slime bump adds trauma 0.3. With a linear mapping the offset is 30% of \`max_offset\`; with the square it is $0.3^2 = 0.09$.`,
              choose: {
                prompt: md`With max_offset = 8 px, how large is the slime bump's shake with the square?`,
                options: [md`About 0.7 px: a barely visible twitch`, md`2.4 px`, md`8 px`],
                answer: 0,
                explain: md`$8 \times 0.09 = 0.72$ px. With the linear mapping it would be 2.4 px, which across dozens of small hits per fight becomes tiring.`,
              },
            },
            { md: md`The golem's slam adds 0.6 on top, reaching 0.9: $0.9^2 = 0.81$, so 6.5 px. The *ratio* between a big and a small event grows from 3 to 9 when you square, so big events read as big.` },
            {
              md: md`As trauma decays linearly, shake $= \text{trauma}^2$ decays along a parabola whose slope reaches zero as trauma reaches zero.`,
              choose: {
                prompt: md`With decay 1.5/s, trauma 0.6 becomes 0.3 after 0.2 s. What fraction of max_offset is the shake then?`,
                options: [md`0.09`, md`0.3`, md`0.15`],
                answer: 0,
                explain: md`$0.3^2 = 0.09$. The shake falls from 0.36 to 0.09 in the first 0.2 s, then fades over the next 0.2 s: a hard jolt with a soft tail.`,
              },
            },
          ],
          takeaway: md`Squaring separates small and large events and gives every shake a soft ending, with one line of code. Cubing exaggerates both effects.`,
        },
        {
          kind: 'assets',
          ids: ['golem', 'hero', 'tiles_overworld', 'sfx_explosion', 'sfx_hit'],
        },
        {
          kind: 'viz',
          viz: { type: 'math.shake', kind: 'noise' },
          task: md`Press J a few times, then K. Compare \`trauma\` with \`trauma²\` for a single J press. Switch the source to **random** and press K: compare the strip chart and the feel. Lower \`noise_speed\` to 5 and raise it to 50.`,
          caption: md`The trauma line is scaled to pixels (trauma × \`max_offset\`); the blue line is the horizontal offset. With noise the offset is a smooth wobble inside the trauma envelope; with random it is a fresh jump every frame. The HUD in the corner does not shake, as a \`CanvasLayer\` would not.`,
        },
        {
          kind: 'numeric',
          q: md`A heavy hit sets trauma to 0.8 with decay 2 per second. How long until the shake ($\text{trauma}^2$) drops below 0.04, in seconds?`,
          answer: { kind: 'number', value: 0.3 },
          explain: md`$\text{trauma}^2 < 0.04 \iff \text{trauma} < 0.2$. Trauma falls from 0.8 to 0.2 at 2/s: $0.6/2 = 0.3$ s. The whole shake lasts 0.4 s, but the visible part is about 0.3 s.`,
        },
        { kind: 'code', file: 'scripts/math/shake_camera.gd', code: SHAKE, note: md`\`offset\` moves the camera's view without moving the \`Camera2D\` node, so shake never disturbs the follow logic from module m02. \`get_noise_2d(t, 0.0)\` and \`get_noise_2d(t, 100.0)\` read two rows of the same noise that are far apart, giving independent signals for x and y. Perlin values rarely reach $\pm 1$; most of the time they stay within about $\pm 0.6$, so raise \`max_offset\` slightly if peaks feel weak.` },
        {
          kind: 'check',
          q: md`Why is \`offset = max_offset * shake * Vector2(randf_range(-1, 1), randf_range(-1, 1))\` a worse shake than sampling noise with time?`,
          options: [
            md`It jumps to an unrelated position every frame, which looks like jitter and changes with the frame rate; noise sampled with time is smooth and the same at any frame rate`,
            md`\`randf_range\` is too slow to call every frame`,
            md`Random numbers can exceed 1`,
            md`It cannot be scaled by trauma`,
          ],
          answer: 0,
          explain: md`White noise has no continuity, so the eye sees flicker instead of motion, and doubling the frame rate doubles the number of jumps. Noise sampled at \`time * speed\` has a controllable "speed" and does not depend on the frame rate.`,
        },
        {
          kind: 'steps',
          title: 'Add shake to a scene',
          steps: [
            md`In any test scene with a few sprites, add a \`Camera2D\` (it becomes the current camera when it is the only one; otherwise tick *Enabled*). Attach \`scripts/math/shake_camera.gd\`.`,
            md`Add a temporary test: in the camera script, add \`_unhandled_input\` that calls \`add_trauma(0.3)\` on \`attack\` and \`add_trauma(0.6)\` on \`guard\` (the build below does this).`,
            md`Run with **F6**, press the buttons, and tune \`max_offset\`, \`decay\` and \`noise_speed\` live in the Remote tree.`,
          ],
          result: md`Single light hits produce a small twitch, a heavy hit a clear jolt that fades out softly in about half a second, and several quick hits stack into a stronger shake capped at full trauma.`,
          troubleshoot: [
            { problem: md`Nothing shakes.`, fix: md`The camera is not the current one (check *Enabled*), or the scene has no other visible content to show movement against.` },
            { problem: md`The whole image shimmers during small shakes.`, fix: md`Sub-pixel offsets at 320×180 blur or shimmer pixel art. Round the offset to whole pixels (\`offset = (...).round()\`) as in the build.` },
          ],
        },
        {
          kind: 'build',
          ch: {
            id: 'm03-3-build',
            title: 'Shake by event, with an off switch',
            goal: md`Finish the shake camera: two event strengths, stacking, whole-pixel offsets, and an exported \`shake_scale\` that the options menu will later expose (0 disables shake).`,
            requirements: [
              md`\`attack\` adds 0.3 trauma (a barely visible twitch) and \`guard\` adds 0.6 (a clear jolt); repeated presses stack but never exceed 1.`,
              md`A full-trauma shake has visibly ended within 0.7 s.`,
              md`Offsets are whole pixels, so sprites never shimmer.`,
              md`Setting \`shake_scale\` to 0 in the Inspector disables shaking completely; 0.5 halves it.`,
            ],
            hints: [
              md`"Ended within 0.7 s" means trauma reaches 0 in that time: decay $\ge 1/0.7 \approx 1.43$ per second. 1.5 works.`,
              md`Multiply the shake by \`shake_scale\` rather than the trauma, so the trauma bookkeeping stays the same whatever the setting.`,
              md`\`Vector2.round()\` rounds both components.`,
            ],
            solution: [{ file: 'scripts/math/shake_camera.gd', code: SHAKE_BUILD }],
            explain: md`The camera owns all shake state, and anything in the game only needs to call \`add_trauma(amount)\`. In the combat modules, hits will reach it through the \`Events\` bus with an amount from the hit's data, so tuning "how much does this attack shake" becomes a number on the attack instead of code.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'm03-3-paper',
            title: 'Orbit speed',
            type: 'compute',
            difficulty: 1,
            minutes: 4,
            statement: md`Three shards orbit Kai at radius 18 px, making 0.5 turns per second (ignore the squash). How fast does each shard move, in px/s? How many degrees apart are they?`,
            solution: [md`The circumference is $2\pi \cdot 18 \approx 113.1$ px; half a turn per second gives $56.5$ px/s.`, md`Three shards are $360°/3 = 120°$ apart.`],
            answer: { kind: 'vector', value: [2 * Math.PI * 18 * 0.5, 120] },
          },
        },
        {
          kind: 'recall',
          prompt: md`Describe trauma-based shake in three rules, and say why the offset comes from noise rather than random numbers.`,
          answer: md`Events add trauma (clamped to 1); trauma decays linearly each second; offset = max_offset × trauma² × noise(time × speed). Noise is smooth and sampled by time, so the shake looks like motion and is frame-rate independent; random values jump every frame.`,
        },
        {
          kind: 'explain',
          prompt: md`A playtester says the combat "shakes all the time and gives me a headache". Using this lesson's model, what would you change?`,
          model: md`First, check the mapping: with shake = trauma (linear) every small hit shakes visibly; squaring or cubing makes small hits nearly invisible while keeping big ones. Second, lower the trauma per common event (basic hits 0.1 to 0.2) and reserve large values for rare, important events, so shake carries information. Third, raise the decay so shakes end sooner, and keep max_offset to a few pixels at 320×180. Fourth, make sure the HUD is not shaken. Finally, expose a shake-strength setting (including off), because some players are sensitive to screen motion whatever the tuning.`,
        },
      ],
      cards: [
        { id: 'm03-3-c1', kind: 'cloze', text: md`Bobbing in GDScript: \`offset_y = bob_height * sin({{}} * frequency * time)\`.`, answers: ['TAU|2*PI|2 * PI|tau'] },
        { id: 'm03-3-c2', kind: 'compute', front: md`Trauma 0.5 with shake = trauma². What fraction of max_offset?`, answer: { kind: 'number', value: 0.25 }, back: md`$0.5^2 = 0.25$.` },
        { id: 'm03-3-c3', kind: 'concept', front: md`Value noise versus Perlin noise in one sentence each.`, back: md`Value noise: random values at integer points, smoothly blended. Perlin (gradient) noise: random slopes at integer points, smoothly blended, which avoids the blocky look.` },
        { id: 'm03-3-c4', kind: 'compute', front: md`Decay 1.5 per second. How long does full trauma (1.0) last, in seconds?`, answer: { kind: 'number', value: 1 / 1.5 }, back: md`$1/1.5 \approx 0.67$ s.` },
        { id: 'm03-3-c5', kind: 'concept', front: md`Why should the HUD not shake with the camera?`, back: md`The HUD carries information (HP, ATB) the player must read during the impact. Put it on a \`CanvasLayer\`, which the camera's offset does not move.` },
      ],
    },
  ],
  problems: [
    {
      id: 'm03-p1',
      title: 'In-out quad',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`Evaluate quad ease-in-out at $t = 0.75$.`,
      solution: [md`For $t \ge 0.5$: $1 - f_{\text{in}}(2(1 - t))/2 = 1 - (0.5)^2/2$.`, md`$= 1 - 0.125 = 0.875$.`],
      answer: { kind: 'number', value: 0.875 },
      areas: ['math'],
    },
    {
      id: 'm03-p2',
      title: 'Cubic Bezier midpoint',
      type: 'compute',
      difficulty: 2,
      minutes: 5,
      statement: md`A cubic Bezier has $\mathbf{p}_0 = (0, 0)$, $\mathbf{p}_1 = (0, -40)$, $\mathbf{p}_2 = (80, -40)$, $\mathbf{p}_3 = (80, 0)$. Where is it at $t = 0.5$?`,
      solution: [md`The cubic weights at $t = 0.5$ are $\tfrac18, \tfrac38, \tfrac38, \tfrac18$.`, md`$x = (0 + 0 + 240 + 80)/8 = 40$; $y = (0 - 120 - 120 + 0)/8 = -30$. So $(40, -30)$.`],
      answer: { kind: 'vector', value: [40, -30] },
      areas: ['math'],
    },
    {
      id: 'm03-p3',
      title: 'From k, c, m to f and ζ',
      type: 'compute',
      difficulty: 2,
      minutes: 5,
      statement: md`An old camera script uses a spring with mass 1, stiffness 400 and damping 16. Express it as a frequency in Hz and a damping ratio. Enter $[f, \zeta]$.`,
      solution: [md`$\omega = \sqrt{k/m} = 20$ rad/s, so $f = 20/2\pi \approx 3.18$ Hz.`, md`$\zeta = c/(2\sqrt{km}) = 16/40 = 0.4$.`],
      answer: { kind: 'vector', value: [20 / (2 * Math.PI), 0.4] },
      areas: ['math'],
    },
    {
      id: 'm03-p4',
      title: 'The cursor that explodes',
      type: 'debug',
      difficulty: 2,
      minutes: 6,
      statement: md`This menu cursor wobbles more each time it moves and eventually flies off screen, especially at low frame rates. Find the bug.

\`\`\`gdscript
func _process(delta: float) -> void:
	var omega := TAU * frequency
	var accel := omega * omega * (goal - position) - 2.0 * damping_ratio * omega * velocity
	position += velocity * delta
	velocity += accel * delta
\`\`\``,
      solution: [
        md`Position is updated with the old velocity before the velocity changes: explicit Euler, which adds energy to an oscillator every step. Swap the two lines (velocity first, then position) to get semi-implicit Euler.`,
        md`Also check $\omega\Delta t$: in \`_process\` the delta grows when the frame rate drops, so a high frequency can still become unstable at 20 fps. Keep the frequency moderate, clamp delta, or move the spring to \`_physics_process\`.`,
      ],
      rubric: [md`Identifies explicit Euler (position before velocity)`, md`Swaps the order`, md`Mentions the $\omega\Delta t$ stability limit with variable delta`],
      areas: ['math', 'godot'],
    },
    {
      id: 'm03-p5',
      title: 'Why trauma squared?',
      type: 'concept',
      difficulty: 1,
      minutes: 4,
      statement: md`Explain in a few sentences why screen shake is usually computed from trauma squared rather than trauma.`,
      solution: [md`Squaring compresses small values and keeps large ones: trauma 0.3 gives 9% shake, 0.9 gives 81%. Frequent small events barely move the camera and rare big ones stand out.`, md`As trauma decays linearly, its square fades out with a soft tail instead of stopping abruptly.`],
      rubric: [md`Small events suppressed relative to large ones`, md`Soft ending as trauma decays`],
      areas: ['feel'],
    },
    {
      id: 'm03-p6',
      title: 'Back ease-out on paper',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 8,
      statement: md`Write \`func ease_out_back(t: float) -> float\` using $f_{\text{in}}(t) = c_3t^3 - c_1t^2$ with $c_1 = 1.70158$, $c_3 = c_1 + 1$, and evaluate it at $t = 0.5$.`,
      solution: [
        md`Ease-out is $1 - f_{\text{in}}(1 - t)$. Writing $u = t - 1$: $1 - (c_3(-u)^3 - c_1u^2) = 1 + c_3u^3 + c_1u^2$.
\`\`\`gdscript
func ease_out_back(t: float) -> float:
	const C1 := 1.70158
	const C3 := C1 + 1.0
	var u := t - 1.0
	return 1.0 + C3 * u * u * u + C1 * u * u
\`\`\``,
        md`At $t = 0.5$: $u = -0.5$, $1 + 2.70158(-0.125) + 1.70158(0.25) = 1 - 0.3377 + 0.4254 \approx 1.0877$. Already past the target at half time; the peak, about 1.10, comes at $t \approx 0.58$ (Penner chose $c_1$ for a 10% overshoot).`,
      ],
      rubric: [md`Mirrors the in-curve correctly`, md`Correct constants`, md`Value about 1.088`],
      answer: { kind: 'number', value: 1 + 2.70158 * -0.125 + 1.70158 * 0.25 },
      areas: ['math'],
    },
    {
      id: 'm03-p7',
      title: 'Overshoot at ζ = 0.7',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`What percentage overshoot does a spring with damping ratio 0.7 have?`,
      solution: [md`$e^{-\pi\zeta/\sqrt{1-\zeta^2}} = e^{-0.7\pi/0.7141}$.`, md`$= e^{-3.079} \approx 0.046$: about 4.6%.`],
      answer: { kind: 'number', value: 100 * Math.exp((-0.7 * Math.PI) / Math.sqrt(0.51)) },
      areas: ['math'],
    },
    {
      id: 'm03-p8',
      title: 'Choosing easing for UI events',
      type: 'design',
      difficulty: 2,
      minutes: 10,
      statement: md`Pick a transition, an ease and a duration for each Shardbound UI event and justify each: (a) the ATB bar segment filling, (b) the tactical menu opening, (c) a damage number appearing and floating up, (d) the "Staggered" banner arriving, (e) the pause menu closing.`,
      solution: [
        md`(a) ATB fill: \`LINEAR\` or \`SINE\` out over a short time (0.1 to 0.15 s) toward the new value, because the bar shows a quantity and must not overshoot or lie. (b) Tactical menu: \`CUBIC\` or \`BACK\` out, 0.15 to 0.2 s, since time is slowed and the player is waiting. (c) Damage number: \`QUAD\` or \`CUBIC\` out upward over 0.5 to 0.7 s plus a fade; arriving motion, readable quickly.`,
        md`(d) Staggered banner: \`BACK\` or \`ELASTIC\` out scale pop, 0.3 s, as a rare important event that may be emphatic. (e) Closing: \`QUAD\` in, 0.12 to 0.2 s; leaving motion should accelerate away and be shorter than opening, so control returns quickly.`,
      ],
      rubric: [md`Uses ease-out for arriving and ease-in for leaving`, md`Avoids overshoot for bars that display values`, md`Durations are short for frequent events and gameplay-critical UI`, md`Reserves emphatic curves (back, elastic) for rare events`],
      areas: ['feel', 'art'],
    },
    {
      id: 'm03-p9',
      title: 'Visible shake time',
      type: 'compute',
      difficulty: 2,
      minutes: 4,
      statement: md`Trauma starts at 0.8 and decays at 2 per second; shake is trauma². For how many seconds is the shake at least 4% of max_offset?`,
      solution: [md`Shake $\ge 0.04 \iff$ trauma $\ge 0.2$.`, md`Trauma goes from 0.8 to 0.2 in $0.6/2 = 0.3$ s.`],
      answer: { kind: 'number', value: 0.3 },
      areas: ['math', 'feel'],
    },
  ],
};
