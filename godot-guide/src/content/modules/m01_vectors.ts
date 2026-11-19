import { md, gd, type Module } from '../types';

const CHASER = gd`
extends Node2D
## A bat that flies toward the mouse at a constant speed.

@export var speed := 60.0         ## pixels per second
@export var stop_distance := 6.0  ## close enough: stop instead of jittering on the spot


func _physics_process(delta: float) -> void:
    var target := get_global_mouse_position()
    var to_target := target - global_position  # displacement: from me to the target
    var distance := to_target.length()
    if distance < stop_distance:
        return
    var direction := to_target / distance  # the same as to_target.normalized()
    var velocity := direction * speed      # pixels per second
    global_position += velocity * delta    # pixels this frame
`;

const WISP = gd`
extends Node2D
## A wisp that follows the mouse but stays on a leash around an anchor point.

@export var speed := 90.0                ## pixels per second
@export var leash := 48.0                ## pixels from the anchor
@export var anchor := Vector2(160, 90)   ## the middle of a 320×180 screen


func _physics_process(delta: float) -> void:
    var goal := get_global_mouse_position()
    # Keep the goal inside a circle around the anchor: the offset keeps its
    # direction, but its length is capped at leash.
    goal = anchor + (goal - anchor).limit_length(leash)
    # move_toward never overshoots, so no stop distance is needed.
    global_position = global_position.move_toward(goal, speed * delta)
    queue_redraw()


func _draw() -> void:
    # _draw works in this node's local space, so convert the anchor first.
    var anchor_local := to_local(anchor)
    draw_arc(anchor_local, leash, 0.0, TAU, 48, Color(1, 1, 1, 0.4), 1.0)
    draw_line(Vector2.ZERO, anchor_local, Color(1, 1, 1, 0.25), 1.0)
`;

const VISION = gd`
extends Node2D
## A guard that notices the mouse inside a cone in front of it and turns toward it.

@export var view_range := 96.0           ## pixels
@export var view_angle_degrees := 90.0   ## full width of the cone
@export var turn_speed_degrees := 120.0  ## how fast the guard turns while it sees you

var facing := Vector2.LEFT


func can_see(point: Vector2) -> bool:
    var to_point := point - global_position
    if to_point.length() > view_range:
        return false
    var cos_half := cos(deg_to_rad(view_angle_degrees * 0.5))
    return facing.dot(to_point.normalized()) >= cos_half


func _physics_process(delta: float) -> void:
    var target := get_global_mouse_position()
    if can_see(target):
        var to_target := target - global_position
        # angle_to is signed: positive means clockwise on screen, the same sign
        # as facing.cross(to_target). Clamp it so the guard turns at a fixed rate.
        var max_step := deg_to_rad(turn_speed_degrees) * delta
        facing = facing.rotated(clampf(facing.angle_to(to_target), -max_step, max_step))
    queue_redraw()


func _draw() -> void:
    var half := deg_to_rad(view_angle_degrees * 0.5)
    var points := PackedVector2Array([Vector2.ZERO])
    for i in 17:
        var a := facing.angle() - half + 2.0 * half * i / 16.0
        points.append(Vector2.from_angle(a) * view_range)
    var seen := can_see(get_global_mouse_position())
    var color: Color = Color(1.0, 0.3, 0.2, 0.35) if seen else Color(1.0, 1.0, 0.6, 0.2)
    draw_colored_polygon(points, color)
    draw_line(Vector2.ZERO, facing * 20.0, Color.WHITE, 1.0)
`;

const GUARD = gd`
extends Node2D
## A guard with a vision cone, a short hearing radius all around it,
## and a label that says on which side the target is.

@export var view_range := 96.0
@export var view_angle_degrees := 90.0
@export var hearing_radius := 24.0
@export var turn_speed_degrees := 120.0

var facing := Vector2.LEFT

@onready var sprite: Sprite2D = $Sprite2D
@onready var side_label: Label = $Label


func notices(point: Vector2) -> bool:
    var to_point := point - global_position
    var distance := to_point.length()
    if distance <= hearing_radius:
        return true  # close enough to hear: the direction does not matter
    if distance > view_range:
        return false
    return facing.dot(to_point / distance) >= cos(deg_to_rad(view_angle_degrees * 0.5))


func _physics_process(delta: float) -> void:
    var target := get_global_mouse_position()
    var to_target := target - global_position
    if notices(target):
        var max_step := deg_to_rad(turn_speed_degrees) * delta
        facing = facing.rotated(clampf(facing.angle_to(to_target), -max_step, max_step))
        # y points down, so a positive cross product means clockwise on screen: the guard's right.
        side_label.text = "right" if facing.cross(to_target) > 0.0 else "left"
    else:
        side_label.text = ""
    sprite.flip_h = facing.x < 0.0  # side sprites face right
    queue_redraw()


func _draw() -> void:
    var half := deg_to_rad(view_angle_degrees * 0.5)
    var points := PackedVector2Array([Vector2.ZERO])
    for i in 17:
        var a := facing.angle() - half + 2.0 * half * i / 16.0
        points.append(Vector2.from_angle(a) * view_range)
    var seen := notices(get_global_mouse_position())
    var color: Color = Color(1.0, 0.3, 0.2, 0.35) if seen else Color(1.0, 1.0, 0.6, 0.2)
    draw_colored_polygon(points, color)
    draw_arc(Vector2.ZERO, hearing_radius, 0.0, TAU, 32, Color(1, 1, 1, 0.3), 1.0)
`;

const PIVOT = gd`
extends Node2D
## WeaponPivot: turns so that its +x axis points at the mouse. Its child, the
## sword hitbox, sits on that axis, so it follows the aim without any extra code.


func _physics_process(_delta: float) -> void:
    look_at(get_global_mouse_position())
`;

const HITBOX = gd`
class_name SwordHitbox
extends Area2D
## A 16×8 box. contains_point() tests a point in the box's own coordinates.

@export var half_size := Vector2(8, 4)


func contains_point(global_point: Vector2) -> bool:
    var p := to_local(global_point)  # the point measured along this node's own axes
    return absf(p.x) <= half_size.x and absf(p.y) <= half_size.y
`;

const KAI_RIG = gd`
extends Node2D
## Kai's test rig: move_left / move_right walk and turn him, attack swings the
## weapon pivot through a 120° arc, and a hit is reported once per swing.

@export var speed := 60.0
@export var swing_time := 0.2

var swing_left := 0.0
var hit_this_swing := false

@onready var facing_root: Node2D = $Facing
@onready var pivot: Node2D = $Facing/WeaponPivot
@onready var hitbox: SwordHitbox = $Facing/WeaponPivot/SwordHitbox
@onready var slime: Node2D = $"../Slime"


func _physics_process(delta: float) -> void:
    var x := Input.get_axis("move_left", "move_right")
    position.x += x * speed * delta
    if x != 0.0:
        # Mirror everything under Facing (sprite, pivot, hitbox) in one place.
        facing_root.scale.x = signf(x)

    if Input.is_action_just_pressed("attack") and swing_left <= 0.0:
        swing_left = swing_time
        hit_this_swing = false
    if swing_left > 0.0:
        swing_left -= delta
        var progress := 1.0 - swing_left / swing_time  # 0 at the start, 1 at the end
        pivot.rotation = deg_to_rad(lerpf(-60.0, 60.0, progress))
        if not hit_this_swing and hitbox.contains_point(slime.global_position):
            hit_this_swing = true
            print("hit, slime in hitbox space: ", hitbox.to_local(slime.global_position))
    else:
        pivot.rotation = 0.0
`;

export const MODULE: Module = {
  id: 'm01',
  part: 'math',
  order: 1,
  title: 'Vectors and transforms',
  summary: "Vector2 as position, direction and velocity; length and normalization; dot and cross products for facing tests, cones and turning; angles in radians; Transform2D and local versus global space in Godot's y-down world.",
  relevance: md`Almost every line of gameplay code in Shardbound is vector code. Kai's movement is a velocity vector; a bat flying at him is a normalized displacement times a speed; a skeleton that only notices Kai when he is in front of it is a dot product; a guard deciding which way to turn is a cross product; Bram's shield blocking only frontal hits is the same dot product test. The sword hitbox that follows Kai's facing and the damage numbers that float above an enemy are transforms: child nodes placed in their parent's local space. This module gives you the tools those systems are built from, in Godot's own API.`,
  prereqs: ['g02'],
  areas: ['math', 'godot'],
  lessons: [
    {
      id: 'm01-1',
      title: 'Vectors: positions, directions and speeds',
      minutes: 35,
      objectives: [
        "Read a Vector2 as a position, a displacement, a direction or a velocity, in Godot's y-down coordinates.",
        'Compute length, distance and a normalized direction by hand and with `Vector2` methods.',
        'Explain why a chaser must normalize its displacement before multiplying by a speed.',
        'Place a point part of the way between two others with `lerp`, and cap a distance with `limit_length`.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A bat hangs in a cave. Kai walks in. Every physics frame the bat's script has to answer three questions: *where is Kai compared with me*, *which way is that*, and *how far do I move this frame*. Each answer is a pair of numbers, an x and a y, and Godot stores each pair in the same type, \`Vector2\`.

The trouble beginners have with vectors is rarely the arithmetic. It is that the same type means four different things depending on where it came from, and mixing them up gives bugs that look like "the bat teleports" or "diagonal movement is too fast". This lesson separates the four meanings, then builds the bat.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Four readings of a Vector2',
          md: md`- **Position**: a point, measured from the origin. \`global_position = Vector2(200, 40)\` means 200 px right and 40 px down from the world origin.
- **Displacement**: how to get from one point to another, $\mathbf{d} = \mathbf{b} - \mathbf{a}$ ("target minus me"). It has a direction and a length (the distance).
- **Direction**: a displacement with length 1, written $\hat{\mathbf{d}}$. It says *which way* and nothing about *how far*.
- **Velocity**: displacement per second, in px/s. \`velocity = direction * speed\`; one frame moves the body by \`velocity * delta\`.

Positions are added to displacements, never to each other: $\text{position} + \text{displacement} = \text{position}$, and $\text{position} - \text{position} = \text{displacement}$.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: "Godot's 2D coordinates: y points down",
          md: md`In a 2D scene, x grows to the right and **y grows downward**, as in most screen and image APIs. The origin of the world is the top-left corner of the screen until a camera moves. So \`Vector2.UP\` is $(0, -1)$, \`Vector2.DOWN\` is $(0, 1)$, and jumping means making \`velocity.y\` negative. Angles follow from this: a positive \`rotation\` turns a node **clockwise** on screen. Every figure in this module uses Godot's convention, so the numbers you see match what \`print()\` shows in the editor.`,
        },
        {
          kind: 'viz',
          viz: { type: 'math.vectors', mode: 'basic' },
          task: md`Drag the tips of **a** and **b**. In **b − a**, check that the green arrow goes from the tip of a to the tip of b. In **normalize**, make a long and then short: $\hat{\mathbf{a}}$ always ends on the unit circle. In **lerp**, slide the weight and watch the point walk from a to b.`,
          caption: md`The code under the figure prints exactly what Godot returns for the current vectors. Notice the y labels: they grow downward.`,
        },
        {
          kind: 'text',
          md: md`### Length, distance and normalization

A vector's **length** (also called magnitude or norm) comes from Pythagoras: the x and y parts are the two short sides of a right triangle.

$$|\mathbf{v}| = \sqrt{v_x^2 + v_y^2}$$

The distance between two points is the length of the displacement between them, $|\mathbf{b} - \mathbf{a}|$. In Godot: \`v.length()\`, \`a.distance_to(b)\`, and \`v.length_squared()\`, which skips the square root and is enough when you only compare distances (if $|\mathbf{d}|^2 < r^2$ then $|\mathbf{d}| < r$).

**Normalizing** divides a vector by its length, giving a direction: \`v.normalized()\`, or \`a.direction_to(b)\` for the direction from one point to another.`,
        },
        {
          kind: 'derive',
          title: 'Why dividing by the length gives length 1',
          goal: md`Show that $\hat{\mathbf{v}} = \mathbf{v}/|\mathbf{v}|$ has length 1 for any non-zero $\mathbf{v}$, and see what this means for diagonal input.`,
          steps: [
            {
              md: md`Scaling a vector scales its length: $|s\mathbf{v}| = \sqrt{(s v_x)^2 + (s v_y)^2} = |s|\,\sqrt{v_x^2+v_y^2} = |s|\,|\mathbf{v}|$.`,
              choose: {
                prompt: md`What is $|3\mathbf{v}|$ if $|\mathbf{v}| = 5$?`,
                options: [md`15`, md`45`, md`$5\sqrt3$`],
                answer: 0,
                explain: md`The factor comes out of the square root as $|s| = 3$, so the length is $3 \times 5 = 15$.`,
              },
            },
            { md: md`Take $s = 1/|\mathbf{v}|$: $\;|\mathbf{v}/|\mathbf{v}|| = |\mathbf{v}|/|\mathbf{v}| = 1$. This fails only when $|\mathbf{v}| = 0$; Godot's \`normalized()\` returns \`Vector2.ZERO\` in that case instead of dividing by zero.` },
            {
              md: md`Raw keyboard input for "right and down" is $(1, 1)$, whose length is $\sqrt{1^2 + 1^2} = \sqrt2 \approx 1.414$. Multiplied by a speed, the character goes 41% faster diagonally.`,
              choose: {
                prompt: md`What is the normalized version of $(1, 1)$?`,
                options: [md`$(1/\sqrt2,\ 1/\sqrt2) \approx (0.707, 0.707)$`, md`$(0.5, 0.5)$`, md`$(1, 1)$`],
                answer: 0,
                explain: md`Divide each part by $\sqrt2$. Note that $(0.5, 0.5)$ has length $0.707$, not 1.`,
              },
            },
          ],
          takeaway: md`A direction must have length 1 before you multiply it by a speed, otherwise the speed silently depends on how long the vector happened to be. \`Input.get_vector\`, which the movement module uses, returns input that is already limited to length 1.`,
        },
        {
          kind: 'numeric',
          q: md`A bat is at $(200, 40)$ and Kai is at $(80, 130)$. What is the displacement from the bat to Kai, and how far apart are they? Enter $[d_x, d_y, \text{distance}]$.`,
          answer: { kind: 'vector', value: [-120, 90, 150] },
          inputHint: 'dx, dy, distance',
          hints: [md`Target minus me: $(80 - 200,\ 130 - 40)$.`],
          explain: md`$\mathbf{d} = (80-200,\ 130-40) = (-120, 90)$: left and *down* on screen. Its length is $\sqrt{120^2 + 90^2} = \sqrt{22500} = 150$ px. This is a 3-4-5 triangle scaled by 30.`,
        },
        {
          kind: 'assets',
          ids: ['bat', 'hero'],
          note: md`The bat sheet has a looping \`fly\` animation. In this module a single frame on a \`Sprite2D\` is enough; animation comes in the pixel-art module.`,
        },
        {
          kind: 'viz',
          viz: { type: 'math.seek' },
          task: md`Walk Kai around and watch the three arrows on the bat: orange is the displacement \`to_target\`, green is the direction (drawn 16 px long), blue is the velocity. Then turn off **normalize to_target** and watch the speed readout.`,
          caption: md`With normalization the bat always flies at \`speed\` px/s, however far away Kai is. Without it, velocity is \`to_target * speed\`: at 150 px away and speed 50 that is 7500 px/s, so the bat snaps onto Kai in a few frames and the readout explodes.`,
        },
        {
          kind: 'check',
          q: md`A beginner writes the chaser like this:

\`\`\`gdscript
var to_target := target - global_position
global_position += to_target * speed * delta
\`\`\`

With \`speed = 60.0\`, how does the bat behave?`,
          options: [
            md`Its speed is proportional to the distance: 60 times faster than intended at 60 px away, and it slows to a crawl as it gets close.`,
            md`It flies at a constant 60 px/s.`,
            md`It flies away from the target.`,
            md`It never moves, because \`to_target\` is a position.`,
          ],
          answer: 0,
          explain: md`\`to_target\` has length equal to the distance $d$, so the speed is $60\,d$ px/s. At $d = 60$ px that is 3600 px/s; at $d = 1$ px it is 60 px/s. Normalizing first (\`to_target.normalized() * speed\`) removes the distance from the speed.`,
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Normalizing a zero vector, and overshooting',
          md: md`When the bat sits exactly on its target, \`to_target\` is $(0, 0)$ and has no direction. Godot returns \`Vector2.ZERO\` rather than crashing, so the bat simply stops; but when it is *almost* on the target, the direction flips every frame as it steps past, and the sprite jitters. Two cures: stop inside a small \`stop_distance\`, as in the listing below, or use \`global_position.move_toward(target, speed * delta)\`, which moves at most \`speed * delta\` and lands exactly on the target instead of stepping past it.`,
        },
        {
          kind: 'steps',
          title: 'Build the chaser',
          steps: [
            md`Create a new scene (**Scene → New Scene**), choose **2D Scene** so the root is a \`Node2D\`, rename it \`VectorLab\` and save it as \`scenes/math/vector_lab.tscn\`.`,
            md`Add a child \`Node2D\` named \`Bat\` and give it a child \`Sprite2D\`. Drag the bat sheet from the **FileSystem** dock (its path is in the assets panel above) onto the sprite's *Texture*. In the Inspector's *Animation* section set *Hframes* and *Vframes* to the sheet's columns and rows so only one frame shows.`,
            md`Select \`Bat\`, set its *Position* to $(40, 40)$, attach a new script \`scripts/math/chaser.gd\` and type the listing below.`,
            md`Press **F6** to run the current scene and move the mouse around the window.`,
          ],
          result: md`The bat flies toward the mouse pointer at a steady speed from any distance, and stops calmly when it reaches it.`,
          troubleshoot: [
            { problem: md`The bat flies toward a point offset from the mouse.`, fix: md`You used \`position\` and \`get_local_mouse_position()\` together, or the \`VectorLab\` root is not at $(0, 0)$. Use \`global_position\` and \`get_global_mouse_position()\` so both are in world coordinates.` },
            { problem: md`The bat shakes back and forth on the pointer.`, fix: md`\`stop_distance\` is smaller than one frame of movement (\`speed * delta\`, 1 px at 60 px/s). Raise it, or switch to \`move_toward\`.` },
            { problem: md`The whole sheet shows instead of one bat.`, fix: md`Set *Hframes* and *Vframes* on the \`Sprite2D\`, under *Animation* in the Inspector.` },
          ],
        },
        { kind: 'code', file: 'scripts/math/chaser.gd', code: CHASER, note: md`The four readings appear in order: \`target\` and \`global_position\` are positions, \`to_target\` is a displacement, \`direction\` is a direction, \`velocity\` is a velocity, and \`velocity * delta\` is the displacement for this one frame (1/60 s).` },
        {
          kind: 'text',
          md: md`### Part of the way: lerp

\`a.lerp(b, t)\` returns the point a fraction $t$ of the way from $\mathbf{a}$ to $\mathbf{b}$:

$$\operatorname{lerp}(\mathbf{a}, \mathbf{b}, t) = \mathbf{a} + (\mathbf{b} - \mathbf{a})\,t$$

At $t = 0$ it is $\mathbf{a}$, at $t = 1$ it is $\mathbf{b}$, at $t = 0.5$ it is the midpoint. Read it as "start at a, then walk a fraction t of the displacement to b". Uses in Shardbound: a camera anchor halfway between Kai and the enemy he is fighting (\`t = 0.5\`), a damage number placed a third of the way up a health bar, a projectile at a known fraction of its path. Module m02 uses \`lerp\` in a loop for smoothing, which needs more care.`,
        },
        {
          kind: 'numeric',
          q: md`Compute \`Vector2(40, 100).lerp(Vector2(200, 20), 0.25)\`.`,
          answer: { kind: 'vector', value: [80, 80] },
          inputHint: 'x, y',
          explain: md`$\mathbf{b} - \mathbf{a} = (160, -80)$; a quarter of it is $(40, -20)$; $\mathbf{a} + (40, -20) = (80, 80)$.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'm01-1-build',
            title: 'A wisp on a leash',
            goal: md`Add a \`Wisp\` (a \`Node2D\` with any small sprite, for example a frame of \`fx_heal\`) to \`vector_lab.tscn\`. It follows the mouse at a constant speed but never strays more than 48 px from the middle of the screen, and it draws its leash.`,
            requirements: [
              md`The wisp moves toward the mouse at a constant 90 px/s and stops exactly on it, without jitter.`,
              md`When the mouse is outside the 48 px circle around $(160, 90)$, the wisp waits on the edge of the circle at the point closest to the mouse.`,
              md`The leash circle and a line from the wisp to the anchor are drawn and move correctly with the wisp.`,
              md`Changing \`leash\` in the Inspector changes the circle and the limit together.`,
            ],
            hints: [
              md`Clamp the *goal*, not the wisp: build the offset from the anchor to the mouse and cap its length with \`limit_length(leash)\`.`,
              md`\`_draw()\` draws in the node's local coordinates. Convert the anchor with \`to_local(anchor)\`, and call \`queue_redraw()\` every frame because the wisp moves.`,
            ],
            solution: [{ file: 'scripts/math/wisp.gd', code: WISP }],
            explain: md`The goal is \`anchor + offset\`, where \`offset.limit_length(leash)\` keeps the offset's direction but shortens it to at most 48 px. That point is the closest point of the circle to the mouse. \`move_toward\` replaces the normalize-and-stop logic of the chaser: it moves by at most \`speed * delta\` along the displacement and lands exactly on the goal.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'm01-1-paper',
            title: 'Frames to arrive',
            type: 'compute',
            difficulty: 1,
            minutes: 5,
            statement: md`A bat at $(16, 24)$ chases a stationary Kai at $(88, 120)$ at 60 px/s, using the normalized chaser. Physics runs at 60 Hz. How many physics frames does it take to arrive?`,
            hints: [md`Find the distance first; it is a scaled 3-4-5 triangle.`],
            solution: [
              md`Displacement: $(88 - 16,\ 120 - 24) = (72, 96) = 24 \cdot (3, 4)$, so the distance is $24 \cdot 5 = 120$ px.`,
              md`At 60 px/s that takes 2 s, which is $2 \times 60 = 120$ frames. Each frame moves exactly $60 \times \tfrac{1}{60} = 1$ px along the direction $(0.6, 0.8)$.`,
            ],
            answer: { kind: 'number', value: 120 },
          },
        },
        {
          kind: 'recall',
          prompt: md`Name the four readings of a \`Vector2\` and the operation that turns two positions into a displacement and a displacement into a direction.`,
          answer: md`Position, displacement, direction (length 1) and velocity (px/s). Displacement = target position − my position; direction = displacement / its length (\`normalized()\` or \`direction_to\`). Velocity = direction × speed, and one frame moves by velocity × delta.`,
        },
        {
          kind: 'explain',
          prompt: md`Why is \`velocity = (target - global_position) * speed\` a bug in a chaser, and why might a designer still want speed to depend on distance sometimes?`,
          model: md`\`target - global_position\` has the distance as its length, so the speed becomes distance × speed: absurdly fast far away and slow near the target. Normalizing first makes speed a tuning value in px/s that does not depend on where the target is. Speed that falls off with distance is sometimes wanted (a camera easing into place, a homing shot that slows as it arrives), but then it should be written on purpose, with a rate per second and frame-rate-independent maths, which module m02 covers.`,
        },
      ],
      cards: [
        { id: 'm01-1-c1', kind: 'concept', front: md`Position, displacement, direction, velocity: which is \`target - global_position\`?`, back: md`A displacement: from me to the target. Its length is the distance; normalized, it is the direction.` },
        { id: 'm01-1-c2', kind: 'cloze', text: md`In Godot 2D, y grows {{}}, so \`Vector2.UP\` is $(0, -1)$.`, answers: ['down|downward|downwards'] },
        { id: 'm01-1-c3', kind: 'compute', front: md`Length of $(-12, 5)$?`, answer: { kind: 'number', value: 13 }, back: md`$\sqrt{144 + 25} = \sqrt{169} = 13$.` },
        { id: 'm01-1-c4', kind: 'cloze', text: md`\`a.lerp(b, t)\` equals \`a + (b - a) * {{}}\`.`, answers: ['t'] },
        { id: 'm01-1-c5', kind: 'concept', front: md`Why can comparing \`length_squared()\` replace comparing \`length()\` for range checks?`, back: md`Both sides are non-negative, so $|\mathbf{d}| < r \iff |\mathbf{d}|^2 < r^2$. Squaring skips a square root per check.` },
      ],
    },
    {
      id: 'm01-2',
      title: 'Dot, cross and angles: facing, cones and turning',
      minutes: 45,
      objectives: [
        'Compute a dot product and use its sign and size for facing tests and vision cones.',
        'Project a vector onto a direction and slide a velocity along a wall.',
        "Use the 2D cross product's sign to tell left from right in Godot's y-down screen and choose a turning direction.",
        'Convert between angles and vectors with `angle()`, `atan2`, `Vector2.from_angle` and `rotated()`, in radians.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A skeleton guards a corridor in Shardbound's ruins. Kai should be able to sneak behind it, but the moment he steps in front of it, the skeleton raises its sword and turns to face him. Bram's shield should block hits from the front and not from behind. Kai's sword should hit enemies in a 120° arc in front of him.

All four are the same question: *how much does this direction point along that one?* The answer is a single number, the **dot product**, and it needs no angles, no \`acos\` and no special cases at 180°. Its partner, the **cross product**, answers *on which side?*`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Dot product',
          md: md`$$\mathbf{a}\cdot\mathbf{b} = a_x b_x + a_y b_y = |\mathbf{a}|\,|\mathbf{b}|\cos\theta$$

where $\theta$ is the angle between the two vectors. In Godot: \`a.dot(b)\`. For two **unit** vectors it is just $\cos\theta$: $1$ when they point the same way, $0$ when perpendicular, $-1$ when opposite. Its **sign** says "in front" ($> 0$) or "behind" ($< 0$) without normalizing anything.`,
        },
        {
          kind: 'derive',
          title: 'Why the component formula equals |a||b|cos θ',
          goal: md`Connect $a_x b_x + a_y b_y$ to the angle between the vectors.`,
          steps: [
            { md: md`Write unit vectors by their angles: $\hat{\mathbf{a}} = (\cos\alpha, \sin\alpha)$ and $\hat{\mathbf{b}} = (\cos\beta, \sin\beta)$. Every direction can be written this way; \`Vector2.from_angle(alpha)\` does exactly this.` },
            {
              md: md`Their component product is $\cos\alpha\cos\beta + \sin\alpha\sin\beta$.`,
              choose: {
                prompt: md`Which identity simplifies $\cos\alpha\cos\beta + \sin\alpha\sin\beta$?`,
                options: [md`$\cos(\beta - \alpha)$`, md`$\sin(\alpha + \beta)$`, md`$\cos\alpha + \cos\beta$`],
                answer: 0,
                explain: md`The cosine of a difference: $\cos(\beta-\alpha) = \cos\beta\cos\alpha + \sin\beta\sin\alpha$. So $\hat{\mathbf{a}}\cdot\hat{\mathbf{b}} = \cos\theta$ with $\theta = \beta - \alpha$, the angle between them.`,
              },
            },
            { md: md`For vectors of any length, $\mathbf{a} = |\mathbf{a}|\hat{\mathbf{a}}$ and the lengths factor out of the sum: $\mathbf{a}\cdot\mathbf{b} = |\mathbf{a}||\mathbf{b}|\,\hat{\mathbf{a}}\cdot\hat{\mathbf{b}} = |\mathbf{a}||\mathbf{b}|\cos\theta$.` },
          ],
          takeaway: md`The cheap formula (two multiplications and an addition) carries the angle information. To test an angle, compare the dot product of unit vectors with a precomputed cosine instead of computing the angle.`,
        },
        {
          kind: 'viz',
          viz: { type: 'math.vectors', mode: 'dot' },
          task: md`Let **a** be a facing direction. Drag **b** around it: find where the dot product changes sign (the edge of the shaded half-plane), and where the cross product changes sign. Then switch to **slide** and drag b into the wall.`,
          caption: md`Dot is zero when b is perpendicular to a; cross is zero when b lies along a's line. The violet arc is \`a.angle_to(b)\`: positive means clockwise on screen.`,
        },
        {
          kind: 'text',
          md: md`### Facing tests and cones

Let $\hat{\mathbf{f}}$ be a guard's facing (unit vector) and $\mathbf{d}$ the displacement from the guard to Kai.

- **In front at all** (a half-plane): $\hat{\mathbf{f}}\cdot\mathbf{d} > 0$. No normalization needed, because the lengths are positive and do not change the sign.
- **Inside a cone** of full width $2\varphi$: the angle between them is at most $\varphi$, which is the same as $\cos\theta \ge \cos\varphi$ (cosine decreases from 0° to 180°). So normalize $\mathbf{d}$ and test $\hat{\mathbf{f}}\cdot\hat{\mathbf{d}} \ge \cos\varphi$. Compute $\cos\varphi$ once; the test is then a few multiplications per enemy.
- **Inside a vision cone** with a range: also check $|\mathbf{d}| \le R$.

Comparing with an angle from \`acos\` would work too, but it costs more and invites bugs with angles that wrap around at ±180°. The dot-product test has no wrap-around.`,
        },
        {
          kind: 'check',
          q: md`A guard has a 90° vision cone (45° on each side of its facing). What threshold should \`facing.dot(to_target.normalized())\` be compared with?`,
          options: [md`$\cos 45° \approx 0.707$`, md`$\cos 90° = 0$`, md`$0.5$`, md`$45$`],
          answer: 0,
          explain: md`The cone's half-angle is 45°, and the target is inside when $\cos\theta \ge \cos 45° \approx 0.707$. A threshold of 0 would accept the whole front half-plane (a 180° cone); 0.5 is the threshold for a 120° cone.`,
        },
        {
          kind: 'numeric',
          q: md`A guard faces right, $\hat{\mathbf{f}} = (1, 0)$. Kai is at displacement $\mathbf{d} = (24, 32)$ from it. Compute $\hat{\mathbf{f}}\cdot\hat{\mathbf{d}}$. Is Kai inside a 120° cone?`,
          answer: { kind: 'number', value: 0.6 },
          explain: md`$|\mathbf{d}| = 40$, so $\hat{\mathbf{d}} = (0.6, 0.8)$ and $\hat{\mathbf{f}}\cdot\hat{\mathbf{d}} = 0.6$. A 120° cone has half-angle 60° and threshold $\cos 60° = 0.5$; $0.6 \ge 0.5$, so yes, he is seen (he is $\arccos 0.6 \approx 53°$ off the facing).`,
        },
        {
          kind: 'assets',
          ids: ['skeleton', 'hero'],
          note: md`The skeleton's side animations face right. Flip the sprite when its facing vector points left (\`facing.x < 0\`).`,
        },
        {
          kind: 'viz',
          viz: { type: 'math.cone', angle: 90, range: 96 },
          task: md`Sneak Kai from the left side of the screen past the skeleton without being seen. Then walk into the cone and step to one side: the guard turns toward you, and the cross readout says which side you are on. Try a 180° cone and a 30° cone.`,
          caption: md`The cone is the set of points with $\hat{\mathbf{f}}\cdot\hat{\mathbf{d}} \ge \cos(\text{half angle})$ and $|\mathbf{d}| \le$ \`view_range\`. When the guard sees Kai it rotates its facing by \`angle_to\`, clamped to the turn speed, so it never overshoots.`,
        },
        {
          kind: 'text',
          md: md`### Projection and sliding

The dot product with a **unit** vector $\hat{\mathbf{n}}$ measures how much of $\mathbf{v}$ points along $\hat{\mathbf{n}}$: the **scalar projection** $\mathbf{v}\cdot\hat{\mathbf{n}}$. Multiplying back by $\hat{\mathbf{n}}$ gives the **vector projection**, the part of $\mathbf{v}$ along that direction: $(\mathbf{v}\cdot\hat{\mathbf{n}})\,\hat{\mathbf{n}}$, which is \`v.project(n)\` in Godot (it normalizes for you).

Whatever is left, $\mathbf{v} - (\mathbf{v}\cdot\hat{\mathbf{n}})\hat{\mathbf{n}}$, is perpendicular to $\hat{\mathbf{n}}$. When $\hat{\mathbf{n}}$ is a wall's normal (the unit vector pointing out of the wall), that leftover is the velocity **sliding along the wall**: \`v.slide(n)\`. This is the "slide" in \`move_and_slide()\`: when Kai walks diagonally into a wall, the part of his velocity pointing into the wall is removed and he keeps moving along it.`,
        },
        {
          kind: 'derive',
          title: 'Sliding along a wall',
          goal: md`Find the velocity that remains after removing the part that points into a wall with unit normal $\hat{\mathbf{n}}$.`,
          steps: [
            { md: md`Split $\mathbf{v}$ into a part along the normal and a part along the wall: $\mathbf{v} = \mathbf{v}_\perp + \mathbf{v}_\parallel$, with $\mathbf{v}_\perp = (\mathbf{v}\cdot\hat{\mathbf{n}})\,\hat{\mathbf{n}}$.` },
            {
              md: md`Moving into the wall means $\mathbf{v}\cdot\hat{\mathbf{n}} < 0$ (the normal points *out* of the wall, toward the body).`,
              choose: {
                prompt: md`Which part do we keep so the body slides instead of entering the wall?`,
                options: [md`$\mathbf{v}_\parallel = \mathbf{v} - (\mathbf{v}\cdot\hat{\mathbf{n}})\hat{\mathbf{n}}$`, md`$\mathbf{v}_\perp$`, md`$-\mathbf{v}$`],
                answer: 0,
                explain: md`The parallel part runs along the wall. Keeping $\mathbf{v}_\perp$ would push straight into the wall; negating $\mathbf{v}$ is a bounce backwards. A bounce that keeps the sliding part is \`v.bounce(n)\` $= \mathbf{v} - 2(\mathbf{v}\cdot\hat{\mathbf{n}})\hat{\mathbf{n}}$.`,
              },
            },
            { md: md`Check: $\mathbf{v}_\parallel\cdot\hat{\mathbf{n}} = \mathbf{v}\cdot\hat{\mathbf{n}} - (\mathbf{v}\cdot\hat{\mathbf{n}})(\hat{\mathbf{n}}\cdot\hat{\mathbf{n}}) = 0$, because $\hat{\mathbf{n}}\cdot\hat{\mathbf{n}} = 1$. The result is exactly along the wall.` },
          ],
          takeaway: md`\`v.slide(n)\` $= \mathbf{v} - (\mathbf{v}\cdot\hat{\mathbf{n}})\hat{\mathbf{n}}$ needs a **unit** normal; Godot reports an error if \`n\` is not normalized. Collision normals from \`move_and_collide\` and \`get_slide_collision\` are already unit length.`,
        },
        {
          kind: 'numeric',
          q: md`Kai moves with velocity $(120, 60)$ px/s into a wall on his right. The wall's normal is $(-1, 0)$. What is \`velocity.slide(Vector2(-1, 0))\`?`,
          answer: { kind: 'vector', value: [0, 60] },
          inputHint: 'x, y',
          explain: md`$\mathbf{v}\cdot\hat{\mathbf{n}} = -120$. $\mathbf{v} - (-120)(-1, 0) = (120, 60) - (120, 0) = (0, 60)$. He keeps sliding downward at 60 px/s.`,
        },
        {
          kind: 'text',
          md: md`### The 2D cross product: which side?

$$\mathbf{a}\times\mathbf{b} = a_x b_y - a_y b_x = |\mathbf{a}|\,|\mathbf{b}|\sin\theta$$

(\`a.cross(b)\` in Godot). It is the z component of the 3D cross product of the two vectors with $z = 0$. Its **sign** says which way you turn to get from $\mathbf{a}$ to $\mathbf{b}$, and its size is zero when they are parallel.

Because Godot's y axis points **down**, the picture is mirrored compared with a maths textbook: in Godot, $\mathbf{a}\times\mathbf{b} > 0$ means $\mathbf{b}$ is **clockwise** from $\mathbf{a}$ on screen, which is on the right-hand side of a character facing along $\mathbf{a}$. The formula is the same; only the picture flips. Check it once with numbers: facing right $(1, 0)$, target below on screen $(0, 1)$: $1\cdot 1 - 0\cdot 0 = 1 > 0$, and "below" is clockwise from "right".

To turn a guard toward a target at a fixed rate, use the sign of the cross product as the turning direction, or use \`facing.angle_to(to_target)\`, which returns the signed angle directly ($\operatorname{atan2}(\mathbf{a}\times\mathbf{b},\ \mathbf{a}\cdot\mathbf{b})$) and has the same sign.`,
        },
        {
          kind: 'check',
          q: md`A guard faces down the screen, \`facing = Vector2(0, 1)\`. Kai is directly to the right on screen, \`to_target = Vector2(40, 0)\`. What is \`facing.cross(to_target)\`, and which way should the guard turn?`,
          options: [
            md`$-40$: counter-clockwise on screen. From the guard's point of view, facing down the screen, Kai is on its left.`,
            md`$40$: clockwise. Kai is on the guard's right.`,
            md`$0$: Kai is straight ahead.`,
            md`$-40$: clockwise, because negative means right.`,
          ],
          answer: 0,
          explain: md`$0\cdot 0 - 1\cdot 40 = -40$. Negative means counter-clockwise on screen, so \`rotation\` must decrease. A character walking toward the bottom of the screen has the screen's right on its left hand, which is why reasoning by "screen right" alone goes wrong and the sign test does not.`,
        },
        {
          kind: 'text',
          md: md`### Angles

Godot measures angles in **radians**: a full turn is $2\pi$ (\`TAU\` $\approx 6.283$), a quarter turn is $\pi/2$. Convert with \`deg_to_rad\` and \`rad_to_deg\`. An angle is measured from the +x axis, and because y points down, positive angles go clockwise on screen.

| You have | You want | Godot |
|---|---|---|
| a direction $\mathbf{v}$ | its angle | \`v.angle()\` $= \operatorname{atan2}(v_y, v_x)$, in $(-\pi, \pi]$ |
| an angle $\alpha$ | a unit direction | \`Vector2.from_angle(alpha)\` $= (\cos\alpha, \sin\alpha)$ |
| a vector | the same vector turned by $\alpha$ | \`v.rotated(alpha)\` |
| two directions | the signed angle between | \`a.angle_to(b)\` |
| a node | to face a point | \`look_at(point)\`, or \`rotation = (point - global_position).angle()\` for a node whose parent is not rotated |
| two angles | blend them without going the long way round | \`lerp_angle(from, to, weight)\` |

\`atan2(y, x)\` exists because \`atan(y / x)\` cannot tell $(1, 1)$ from $(-1, -1)$ and divides by zero when $x = 0$; \`atan2\` looks at both signs.`,
        },
        {
          kind: 'numeric',
          q: md`What does \`rad_to_deg(Vector2(-16, -16).angle())\` print? (Remember: y down.)`,
          answer: { kind: 'number', value: -135 },
          explain: md`$\operatorname{atan2}(-16, -16) = -3\pi/4$, which is $-135°$. The vector points up and to the left on screen: 135° counter-clockwise from +x, hence negative.`,
        },
        {
          kind: 'check',
          q: md`What does \`Vector2.from_angle(PI / 2)\` return, and where does it point on screen?`,
          options: [md`$(0, 1)$, pointing down`, md`$(0, 1)$, pointing up`, md`$(1, 0)$, pointing right`, md`$(0, -1)$, pointing up`],
          answer: 0,
          explain: md`$(\cos 90°, \sin 90°) = (0, 1)$. In Godot's coordinates $+y$ is down the screen, so a quarter turn clockwise from right is down.`,
        },
        {
          kind: 'steps',
          title: 'Build the guard',
          steps: [
            md`In \`vector_lab.tscn\` (or a new \`scenes/math/guard_lab.tscn\`), add a \`Node2D\` named \`Guard\` at $(220, 90)$ with a \`Sprite2D\` child showing one frame of the skeleton sheet.`,
            md`Attach \`scripts/math/vision_cone.gd\` to \`Guard\` and type the listing below.`,
            md`Run the scene (**F6**) and move the mouse into and out of the cone, then to either side of the guard while it sees you.`,
          ],
          result: md`A pale cone points left from the guard. It turns red when the mouse enters it, and the guard turns toward the mouse at 120°/s, settling exactly on it. Leaving the cone sideways faster than the guard turns escapes it.`,
          troubleshoot: [
            { problem: md`The cone is drawn in the wrong place or rotates with the sprite.`, fix: md`\`_draw()\` uses local coordinates, with $(0, 0)$ at the guard. Do not rotate the \`Guard\` node itself; the script keeps the facing in its own \`facing\` variable.` },
            { problem: md`The guard turns the long way round or spins forever.`, fix: md`Use the signed angle \`facing.angle_to(to_target)\`, clamped to \`max_step\`. Turning by a fixed step every frame without clamping overshoots and oscillates.` },
            { problem: md`The cone never changes colour.`, fix: md`Call \`queue_redraw()\` every physics frame; Godot only re-runs \`_draw()\` when asked.` },
          ],
        },
        { kind: 'code', file: 'scripts/math/vision_cone.gd', code: VISION, note: md`\`for i in 17\` runs $i = 0 \dots 16$, giving 17 points on the arc plus the guard's own position: a fan of 16 triangles. \`draw_colored_polygon\` fills it.` },
        {
          kind: 'build',
          ch: {
            id: 'm01-2-build',
            title: 'A guard that hears and tells sides',
            goal: md`Extend the guard so that it also notices the mouse when it is very close in any direction (hearing), flips its sprite to match its facing, and shows on which side of it the mouse is.`,
            requirements: [
              md`The mouse within 24 px of the guard counts as noticed, even directly behind it; a faint circle shows this radius.`,
              md`Outside that radius, the 90° cone with range 96 px still applies.`,
              md`While it notices the mouse, the guard turns toward it at 120°/s and a \`Label\` child shows "left" or "right" correctly from the guard's own point of view (test with the guard facing down as well as left).`,
              md`The sprite faces right or left to match \`facing.x\`.`,
            ],
            hints: [
              md`Check the hearing radius before the range and the cone; return early. Reuse the distance you already computed to normalize: \`to_point / distance\`.`,
              md`The side is the sign of \`facing.cross(to_target)\`: positive is clockwise on screen, the guard's right.`,
            ],
            solution: [{ file: 'scripts/math/guard.gd', code: GUARD }],
            explain: md`\`notices\` tests the cheapest and most permissive condition first (inside the hearing circle), then rejects anything out of range, then applies the cone. The label reads the cross product's sign directly, so it is correct whichever way the guard faces, which a test on screen x would not be.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'm01-2-paper',
            title: 'Which enemies does the sword hit?',
            type: 'compute',
            difficulty: 2,
            minutes: 10,
            statement: md`Kai stands at $(100, 100)$ facing up the screen, $\hat{\mathbf{f}} = (0, -1)$. His sword hits enemies within 28 px in a 120° arc in front of him. Enemies: (1) at $(110, 80)$, (2) at $(116, 88)$, (3) at $(96, 128)$, (4) at $(100, 70)$. Enter the numbers of the enemies that are hit, as a set.`,
            hints: [md`For each enemy compute $\mathbf{d}$, its length, and $\hat{\mathbf{f}}\cdot\hat{\mathbf{d}}$. The threshold is $\cos 60° = 0.5$.`],
            solution: [
              md`(1) $\mathbf{d} = (10, -20)$, $|\mathbf{d}| \approx 22.4 \le 28$, $\hat{\mathbf{f}}\cdot\mathbf{d} = 20$, so $\hat{\mathbf{f}}\cdot\hat{\mathbf{d}} \approx 0.894 \ge 0.5$: **hit**.`,
              md`(2) $\mathbf{d} = (16, -12)$, $|\mathbf{d}| = 20$, $\hat{\mathbf{f}}\cdot\hat{\mathbf{d}} = 12/20 = 0.6$: **hit** (53° off the facing).`,
              md`(3) $\mathbf{d} = (-4, 28)$: the dot product is negative, it is behind Kai (and also out of range): miss.`,
              md`(4) $\mathbf{d} = (0, -30)$: straight ahead but 30 px away, out of range: miss. The hit set is $\{1, 2\}$.`,
            ],
            answer: { kind: 'set', value: [1, 2] },
          },
        },
        {
          kind: 'recall',
          prompt: md`Write the test for "point $\mathbf{p}$ is inside a vision cone of full width $2\varphi$ and range $R$" for a guard at $\mathbf{g}$ with unit facing $\hat{\mathbf{f}}$.`,
          answer: md`$\mathbf{d} = \mathbf{p} - \mathbf{g}$; seen if $|\mathbf{d}| \le R$ and $\hat{\mathbf{f}}\cdot(\mathbf{d}/|\mathbf{d}|) \ge \cos\varphi$, with $\cos\varphi$ computed once.`,
        },
        {
          kind: 'explain',
          prompt: md`A teammate tests "is the enemy to Kai's right?" with \`enemy.global_position.x > global_position.x\`. Explain when this is wrong and what to use instead.`,
          model: md`Screen right is only the character's right when the character faces up the screen. Facing down, the screen's right is the character's left; facing right, "to my right" is below on screen. The correct test is relative to the facing vector: \`facing.cross(to_enemy) > 0\` means the enemy is clockwise from the facing on screen, which in Godot's y-down coordinates is the character's right-hand side. It works for every facing, including diagonals, with no special cases.`,
        },
      ],
      cards: [
        { id: 'm01-2-c1', kind: 'concept', front: md`What does the sign of \`facing.dot(to_target)\` tell you, and does either vector need normalizing for it?`, back: md`Positive: target in front (the half-plane ahead); negative: behind; zero: exactly beside. No normalizing is needed for the sign, only for comparing with a cosine.` },
        { id: 'm01-2-c2', kind: 'compute', front: md`Threshold for a 60° vision cone (dot of unit vectors)?`, answer: { kind: 'number', value: Math.cos(Math.PI / 6) }, back: md`Half-angle 30°: $\cos 30° \approx 0.866$.` },
        { id: 'm01-2-c3', kind: 'cloze', text: md`In Godot's y-down coordinates, \`a.cross(b) > 0\` means b is {{}} from a on screen.`, answers: ['clockwise'] },
        { id: 'm01-2-c4', kind: 'cloze', text: md`\`v.slide(n)\` equals \`v - n * v.{{}}(n)\` for a unit normal n.`, answers: ['dot'] },
        { id: 'm01-2-c5', kind: 'concept', front: md`Why use \`atan2(y, x)\` (or \`v.angle()\`) instead of \`atan(y / x)\`?`, back: md`\`atan\` loses the quadrant ($(1,1)$ and $(-1,-1)$ give the same ratio) and divides by zero at $x = 0$. \`atan2\` uses both signs and returns an angle in $(-\pi, \pi]$.` },
      ],
    },
    {
      id: 'm01-3',
      title: 'Transforms: local and global space',
      minutes: 40,
      objectives: [
        'Read a `Transform2D` as two axis vectors and an origin, and apply it to a point by hand.',
        'Convert between local and global coordinates with `to_global`, `to_local` and `global_position`.',
        'Predict how a child moves when its parent moves, rotates, scales or flips, by composing transforms.',
        'Build a weapon pivot whose hitbox follows the aim, and test points against a rotated box in its local space.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Kai swings his sword to the right, then to the left, then upward. The hitbox has to be in front of him every time. One way is to compute the hitbox's world position on every swing with sines and cosines. The way Godot is designed for is simpler: make the hitbox a **child** of a node that turns, and let the engine do the arithmetic. The hitbox's own position never changes; only its parent's rotation does.

That works because every \`Node2D\` has a **transform**, and a child's place in the world is its parent's transform applied to the child's own. This lesson makes that concrete, because the moment something "follows the wrong way" (a hitbox that stays on the right when Kai faces left, a damage number that rotates with the enemy), you need to know which space each number lives in.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Transform2D',
          md: md`A \`Transform2D\` is three vectors: the node's **x axis** \`x\`, its **y axis** \`y\`, and its **origin** \`origin\`, all expressed in the parent's coordinates. A point $\mathbf{p}$ given in the node's own (local) coordinates lands at

$$\mathbf{p}_{\text{parent}} = p_x\,\mathbf{x} + p_y\,\mathbf{y} + \mathbf{o} = \begin{bmatrix} x_x & y_x & o_x \\ x_y & y_y & o_y \end{bmatrix}\begin{bmatrix} p_x \\ p_y \\ 1 \end{bmatrix}$$

"Walk $p_x$ steps along my x axis, $p_y$ steps along my y axis, starting from my origin." With no rotation or scale, $\mathbf{x} = (1, 0)$, $\mathbf{y} = (0, 1)$ and the transform is just a translation by the origin.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'transform, global_transform and the helpers',
          md: md`A \`Node2D\`'s \`position\`, \`rotation\`, \`scale\` and \`skew\` are a friendlier view of its \`transform\` (relative to the parent). Godot also keeps \`global_transform\`, relative to the world:

- \`global_transform = get_parent().global_transform * transform\` (for a parent that is a \`Node2D\`).
- \`global_position\` is \`global_transform.origin\`.
- \`to_global(p)\` turns a point in this node's local space into world space: \`global_transform * p\`.
- \`to_local(p)\` goes the other way: \`global_transform.affine_inverse() * p\`.

\`transform * p\` applies the full transform (axes and origin) to a point. \`transform.basis_xform(v)\` applies only the axes, which is what you want for a *direction* (directions do not move when the origin moves).`,
        },
        {
          kind: 'derive',
          title: 'The axes of a rotated, scaled node',
          goal: md`Find a node's x and y axes when its \`rotation\` is $\varphi$ and its \`scale\` is $(s_x, s_y)$.`,
          steps: [
            { md: md`Rotating by $\varphi$ turns the unit x axis $(1, 0)$ into $(\cos\varphi, \sin\varphi)$, which is \`Vector2.from_angle(phi)\`. In Godot's y-down space a positive $\varphi$ turns it clockwise on screen.` },
            {
              md: md`The y axis is perpendicular to the x axis, a quarter turn further.`,
              choose: {
                prompt: md`Rotating $(0, 1)$ by $\varphi$ gives…`,
                options: [md`$(-\sin\varphi, \cos\varphi)$`, md`$(\sin\varphi, \cos\varphi)$`, md`$(\cos\varphi, -\sin\varphi)$`],
                answer: 0,
                explain: md`$(0, 1)$ has angle $90°$, so it becomes $(\cos(\varphi + 90°), \sin(\varphi + 90°)) = (-\sin\varphi, \cos\varphi)$. Check with $\varphi = 0$: $(0, 1)$.`,
              },
            },
            { md: md`Scale stretches each axis: $\mathbf{x} = s_x(\cos\varphi, \sin\varphi)$, $\mathbf{y} = s_y(-\sin\varphi, \cos\varphi)$. A negative $s_x$ flips the x axis, which mirrors the node and all its children horizontally.` },
          ],
          takeaway: md`The columns of the matrix are where the node's own axes point. To read a transform, read its columns: that is what the matrices under the next figure show.`,
        },
        {
          kind: 'viz',
          viz: { type: 'math.transform', aim: 30 },
          task: md`Rotate the pivot through a full turn and watch the hitbox circle Kai while its local position stays $(14, 0)$. Then flip Kai and scale him to 2: predict where the hitbox goes before you look. Finally drag the slime into the box and read \`to_local\`.`,
          caption: md`Blue arrows are x axes, green are y axes. The global transform is the product of the three local ones, right to left: the hitbox's own transform is applied first, Kai's last.`,
        },
        {
          kind: 'numeric',
          q: md`\`WeaponPivot\` has global position $(100, 80)$ and global rotation $90°$, no scale. Its child \`SwordHitbox\` has \`position = Vector2(14, 0)\`. What is the hitbox's \`global_position\`?`,
          answer: { kind: 'vector', value: [100, 94] },
          inputHint: 'x, y',
          explain: md`The pivot's x axis is $(\cos 90°, \sin 90°) = (0, 1)$: pointing down the screen. $14\,\mathbf{x} + 0\,\mathbf{y} + \mathbf{o} = (0, 14) + (100, 80) = (100, 94)$, 14 px below the pivot.`,
        },
        {
          kind: 'text',
          md: md`### Composing transforms

For Kai → WeaponPivot → SwordHitbox, the hitbox's global transform is

$$T_{\text{hitbox}}^{\text{global}} = T_{\text{Kai}}\; T_{\text{pivot}}\; T_{\text{hitbox}}$$

Read it right to left as "a point in the hitbox's space, placed in the pivot's space, then in Kai's space, then in the world". This is why the hierarchy does the work: change Kai's position and everything below moves; change the pivot's rotation and only the hitbox swings. The order matters: rotating then moving is not the same as moving then rotating, just as "walk 14 px forward, then turn" differs from "turn, then walk 14 px".

**Flipping.** A sprite's \`flip_h\` only mirrors the *picture*. Children of the sprite, or siblings like a hitbox, do not move. To mirror a whole rig, put the sprite, the pivot and the hitbox under one \`Node2D\` (call it \`Facing\`) and set \`Facing.scale.x = -1\`. Keep negative scale off physics bodies such as \`CharacterBody2D\`: the physics engine does not support mirrored bodies well, so flip a plain \`Node2D\` child instead.`,
        },
        {
          kind: 'check',
          q: md`Kai's sprite faces left using \`$Sprite2D.flip_h = true\`. The \`SwordHitbox\` is a sibling of the sprite at \`position = Vector2(14, 0)\`. Where is the hitbox when Kai faces left?`,
          options: [md`Still 14 px to Kai's right, behind him`, md`14 px to his left`, md`Mirrored and rotated by 180°`, md`At Kai's origin`],
          answer: 0,
          explain: md`\`flip_h\` changes how the texture is drawn and nothing else; the hitbox's transform is untouched. Mirror a parent \`Node2D\` with \`scale.x = -1\` (or move the hitbox in code) so the hitbox follows.`,
        },
        {
          kind: 'assets',
          ids: ['hero', 'slime', 'fx_slash'],
          note: md`\`fx_slash\` is a good sprite to put under the hitbox while testing: it will swing with it.`,
        },
        {
          kind: 'steps',
          title: 'Build a weapon pivot',
          steps: [
            md`Create \`scenes/math/transform_lab.tscn\` with a \`Node2D\` root. Add a \`Node2D\` named \`Kai\` at $(160, 100)$ with a \`Sprite2D\` child showing one frame of Kai's sheet, offset so his feet are on the origin (Position y about $-12$).`,
            md`Under \`Kai\`, add a \`Node2D\` named \`Facing\`. Move the \`Sprite2D\` under \`Facing\` (drag it in the Scene dock). Under \`Facing\`, add a \`Node2D\` named \`WeaponPivot\` at $(0, -8)$, chest height.`,
            md`Under \`WeaponPivot\`, add an \`Area2D\` named \`SwordHitbox\` at $(14, 0)$ with a \`CollisionShape2D\` child holding a **RectangleShape2D** of size $16 \times 8$. Optionally add a \`Sprite2D\` with a frame of \`fx_slash\` under the hitbox.`,
            md`Attach \`scripts/math/weapon_pivot.gd\` (below) to \`WeaponPivot\`. Turn on **Debug → Visible Collision Shapes** in the editor's top menu, then press **F6**.`,
          ],
          result: md`The rectangle orbits Kai's chest at 14 px, always pointing at the mouse. In the Remote scene tree (top of the Scene dock while the game runs), \`SwordHitbox\`'s *Position* stays $(14, 0)$ while its global position changes.`,
          troubleshoot: [
            { problem: md`The hitbox orbits Kai's feet instead of his chest.`, fix: md`\`WeaponPivot\` is at $(0, 0)$; set its position to $(0, -8)$. The pivot's origin is the centre of the swing.` },
            { problem: md`The hitbox points away from the mouse by a fixed angle.`, fix: md`\`look_at\` aims the node's **+x** axis. Put the hitbox on the x axis, $(14, 0)$, not $(0, -14)$.` },
          ],
        },
        { kind: 'code', file: 'scripts/math/weapon_pivot.gd', code: PIVOT, note: md`\`look_at(point)\` sets the rotation so that +x points at a world-space point, taking every parent's transform into account. The shortcut \`rotation = (mouse - global_position).angle()\` is only right while no parent is rotated or flipped, because \`rotation\` is relative to the parent; \`global_rotation = ...\` would also work.` },
        {
          kind: 'text',
          md: md`### Testing points in local space

To test whether a point is inside a **rotated** box, rotate the point into the box's space instead of rotating the box. In its own coordinates the hitbox is always the axis-aligned rectangle $|x| \le 8$, $|y| \le 4$, so after \`to_local\` the test is two comparisons. The same trick handles scaled and mirrored boxes for free, because \`to_local\` undoes the whole chain of parent transforms.

When the axes are unit length and perpendicular (rotation only, no scale), the inverse is easy to do by hand: the local coordinates of a world point are its offset from the origin **dotted with each axis**.`,
        },
        {
          kind: 'derive',
          title: 'to_local for a rotation and a translation',
          goal: md`Given a node with unit, perpendicular axes $\hat{\mathbf{x}}, \hat{\mathbf{y}}$ and origin $\mathbf{o}$, find the local coordinates of a world point $\mathbf{p}$.`,
          steps: [
            { md: md`From the definition, $\mathbf{p} = l_x\hat{\mathbf{x}} + l_y\hat{\mathbf{y}} + \mathbf{o}$, so the offset is $\mathbf{d} = \mathbf{p} - \mathbf{o} = l_x\hat{\mathbf{x}} + l_y\hat{\mathbf{y}}$.` },
            {
              md: md`Dot both sides with $\hat{\mathbf{x}}$.`,
              choose: {
                prompt: md`What is $\hat{\mathbf{x}}\cdot(l_x\hat{\mathbf{x}} + l_y\hat{\mathbf{y}})$?`,
                options: [md`$l_x$, because $\hat{\mathbf{x}}\cdot\hat{\mathbf{x}} = 1$ and $\hat{\mathbf{x}}\cdot\hat{\mathbf{y}} = 0$`, md`$l_x + l_y$`, md`$l_x l_y$`],
                answer: 0,
                explain: md`Unit length gives the 1, perpendicular axes give the 0. Likewise $\hat{\mathbf{y}}\cdot\mathbf{d} = l_y$.`,
              },
            },
            { md: md`So $\mathbf{l} = (\mathbf{d}\cdot\hat{\mathbf{x}},\ \mathbf{d}\cdot\hat{\mathbf{y}})$: two scalar projections. With a uniform scale $s$ the axes have length $s$, and each coordinate is divided by $s^2$. Godot's \`affine_inverse()\` handles every case.` },
          ],
          takeaway: md`Converting into a rotated frame is "offset from the origin, dotted with each axis". It is the same projection as in lesson 2, used twice.`,
        },
        {
          kind: 'numeric',
          q: md`The hitbox from the earlier question has global origin $(100, 94)$ and global rotation $90°$. A slime is at $(96, 100)$. What does \`hitbox.to_local(slime.global_position)\` return? Is the slime inside the $16\times 8$ box?`,
          answer: { kind: 'vector', value: [6, 4] },
          inputHint: 'x, y',
          explain: md`$\mathbf{d} = (96 - 100,\ 100 - 94) = (-4, 6)$. Axes: $\hat{\mathbf{x}} = (0, 1)$, $\hat{\mathbf{y}} = (-1, 0)$. $l_x = \mathbf{d}\cdot\hat{\mathbf{x}} = 6$, $l_y = \mathbf{d}\cdot\hat{\mathbf{y}} = 4$. Since $|6| \le 8$ and $|4| \le 4$, it is inside, right on the edge.`,
        },
        { kind: 'code', file: 'scripts/math/sword_hitbox.gd', code: HITBOX, note: md`\`class_name SwordHitbox\` lets other scripts declare \`var hitbox: SwordHitbox\` and call \`contains_point\` with type checking. In the combat modules the physics engine reports overlaps for you; this function shows what such a test does underneath.` },
        {
          kind: 'build',
          ch: {
            id: 'm01-3-build',
            title: 'A facing-aware sword swing',
            goal: md`Turn the transform lab into a small swing test: Kai walks left and right and faces that way, the attack button sweeps the hitbox through an arc in front of him, and a slime reports when it is hit.`,
            requirements: [
              md`\`move_left\` / \`move_right\` move Kai at 60 px/s and mirror the \`Facing\` node, so the sprite and the hitbox both face the direction of travel.`,
              md`Pressing \`attack\` rotates \`WeaponPivot\` from $-60°$ to $+60°$ over 0.2 s, then returns it to $0°$. The arc sweeps in front of Kai whichever way he faces.`,
              md`A \`Slime\` sprite placed in the scene prints one "hit" line per swing when it is inside the hitbox at any moment of the swing, with its local coordinates.`,
              md`No physics body has a negative scale; only \`Facing\` is mirrored.`,
            ],
            hints: [
              md`Remove \`weapon_pivot.gd\` from the pivot for this build; the rig script sets \`pivot.rotation\` during the swing.`,
              md`Because \`WeaponPivot\` is under the mirrored \`Facing\`, the same local rotation from $-60°$ to $+60°$ is mirrored in the world when Kai faces left. That is the point of the hierarchy.`,
              md`Give the hitbox script \`class_name SwordHitbox\` so the rig can call \`contains_point\` on a typed variable.`,
            ],
            solution: [
              { file: 'scripts/math/sword_hitbox.gd', code: HITBOX },
              { file: 'scripts/math/kai_rig.gd', code: KAI_RIG },
            ],
            explain: md`All the geometry lives in the hierarchy: \`Facing\` mirrors, \`WeaponPivot\` rotates, \`SwordHitbox\` sits 14 px along the pivot's x axis. The rig only sets one scale and one rotation. The hit test goes the other way through the same chain: \`to_local\` undoes Kai's position, the mirror and the pivot's rotation, so the slime can be compared with a fixed, axis-aligned box.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'm01-3-paper',
            title: 'Three levels of transform',
            type: 'compute',
            difficulty: 2,
            minutes: 8,
            statement: md`Kai is at $(60, 40)$ with no rotation or scale. His \`WeaponPivot\` child is at local position $(0, -8)$ with rotation $90°$. The \`SwordHitbox\` under the pivot is at local position $(14, 0)$. Compute the hitbox's global position.`,
            hints: [md`Work from the inside out: where is $(14, 0)$ in the pivot's parent space? Then add Kai's offset.`],
            solution: [
              md`Pivot axes: $\mathbf{x} = (0, 1)$, $\mathbf{y} = (-1, 0)$, origin $(0, -8)$ in Kai's space. The hitbox origin in Kai's space is $14(0, 1) + (0, -8) = (0, 6)$.`,
              md`Kai only translates by $(60, 40)$: global position $(60, 46)$. The sword points straight down from Kai's chest and ends up 6 px below his feet.`,
            ],
            answer: { kind: 'vector', value: [60, 46] },
          },
        },
        {
          kind: 'recall',
          prompt: md`What are the three vectors inside a \`Transform2D\`, and how do you apply it to a local point $\mathbf{p}$?`,
          answer: md`The x axis, the y axis and the origin, in the parent's coordinates. $\mathbf{p}_{\text{parent}} = p_x\mathbf{x} + p_y\mathbf{y} + \mathbf{o}$ (in GDScript \`transform * p\`). For the world, use \`global_transform * p\`, which is \`to_global(p)\`.`,
        },
        {
          kind: 'explain',
          prompt: md`Why is it better to make the sword hitbox a child of a rotating pivot than to compute its world position in Kai's script every frame?`,
          model: md`The hierarchy states the relationship once ("14 px in front of the pivot, which turns with the aim, under a node that mirrors with the facing") and the engine keeps it true every frame, including when Kai is moved by knockback, scaled for a squash effect or flipped. Hand-written world maths has to repeat every one of those steps and breaks when a new one is added. The local values are also what designers edit in the inspector: they can move the hitbox to 16 px and see it immediately. When a script does need world numbers, \`global_position\`, \`to_global\` and \`to_local\` convert at the boundary.`,
        },
      ],
      cards: [
        { id: 'm01-3-c1', kind: 'concept', front: md`What do the columns of a \`Transform2D\` mean?`, back: md`The node's x axis, its y axis and its origin, each expressed in the parent's coordinates.` },
        { id: 'm01-3-c2', kind: 'cloze', text: md`To test a world point against a rotated box, convert the point with \`{{}}\` and compare it with the box's half size.`, answers: ['to_local|to_local()'] },
        { id: 'm01-3-c3', kind: 'compute', front: md`A node at $(50, 20)$ rotated $180°$. Where does its local point $(10, 0)$ land in the parent?`, answer: { kind: 'vector', value: [40, 20] }, back: md`x axis $= (-1, 0)$: $10(-1, 0) + (50, 20) = (40, 20)$.` },
        { id: 'm01-3-c4', kind: 'concept', front: md`Why does \`flip_h\` on a sprite leave the sword hitbox on the wrong side?`, back: md`\`flip_h\` only mirrors the texture. To mirror children too, set \`scale.x = -1\` on a parent \`Node2D\` (not on a physics body).` },
        { id: 'm01-3-c5', kind: 'cloze', text: md`\`global_transform\` = parent's \`global_transform\` {{}} this node's \`transform\`.`, answers: ['*|times|×'] },
      ],
    },
  ],
  problems: [
    {
      id: 'm01-p1',
      title: 'Normalize by hand',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`Compute \`Vector2(-5, 12).normalized()\`.`,
      solution: [md`Length $\sqrt{25 + 144} = 13$.`, md`Divide each part: $(-5/13,\ 12/13) \approx (-0.385, 0.923)$.`],
      answer: { kind: 'vector', value: [-5 / 13, 12 / 13] },
      areas: ['math'],
    },
    {
      id: 'm01-p2',
      title: 'Cone threshold',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`Bram's shield blocks hits arriving within a 100° arc in front of him. What value should \`facing.dot(to_attacker.normalized())\` be compared with?`,
      solution: [md`The half-angle is 50°.`, md`Threshold $\cos 50° \approx 0.643$: block when the dot product is at least that.`],
      answer: { kind: 'number', value: Math.cos((50 * Math.PI) / 180) },
      areas: ['math', 'combat'],
    },
    {
      id: 'm01-p3',
      title: 'The length of a sum',
      type: 'derive',
      difficulty: 2,
      minutes: 8,
      statement: md`Show that $|\mathbf{a}+\mathbf{b}|^2 = |\mathbf{a}|^2 + |\mathbf{b}|^2 + 2\,\mathbf{a}\cdot\mathbf{b}$, and use it to explain why holding right and down moves a character $\sqrt2$ times faster than holding right alone.`,
      solution: [
        md`$|\mathbf{v}|^2 = \mathbf{v}\cdot\mathbf{v}$. Expand: $(\mathbf{a}+\mathbf{b})\cdot(\mathbf{a}+\mathbf{b}) = \mathbf{a}\cdot\mathbf{a} + 2\,\mathbf{a}\cdot\mathbf{b} + \mathbf{b}\cdot\mathbf{b}$, since the dot product distributes and is symmetric.`,
        md`Right is $(1, 0)$ and down is $(0, 1)$: perpendicular, so $\mathbf{a}\cdot\mathbf{b} = 0$ and $|\mathbf{a}+\mathbf{b}|^2 = 1 + 1 = 2$, giving length $\sqrt2$.`,
        md`So summing two perpendicular unit inputs produces a vector longer than either; multiplied by the same speed, diagonal movement is $\sqrt2 \approx 1.41$ times faster unless the input is normalized or limited to length 1.`,
      ],
      rubric: [md`Uses $|\mathbf{v}|^2 = \mathbf{v}\cdot\mathbf{v}$ and expands correctly`, md`Notes the cross term vanishes for perpendicular inputs`, md`Connects the result to the diagonal-speed bug`],
      areas: ['math', 'feel'],
    },
    {
      id: 'm01-p4',
      title: 'The teleporting bat',
      type: 'debug',
      difficulty: 1,
      minutes: 5,
      statement: md`This bat appears to teleport onto Kai when he is far away and to crawl when he is near. Find the bug and fix it.

\`\`\`gdscript
extends CharacterBody2D

@export var speed := 50.0
@export var target: Node2D


func _physics_process(_delta: float) -> void:
	velocity = (target.global_position - global_position) * speed
	move_and_slide()
\`\`\``,
      hints: [md`What is the length of \`target.global_position - global_position\`?`],
      solution: [
        md`The displacement's length is the distance, so the speed is distance × 50 px/s: 5000 px/s at 100 px away, 50 px/s at 1 px.`,
        md`Normalize first: \`velocity = global_position.direction_to(target.global_position) * speed\`. Add a stop distance (or set \`velocity = Vector2.ZERO\` within a few pixels) so it does not jitter on top of Kai.`,
      ],
      rubric: [md`Identifies that speed scales with distance`, md`Fix normalizes the displacement (\`direction_to\` or \`normalized()\`)`, md`Mentions stopping near the target`],
      areas: ['math', 'godot'],
    },
    {
      id: 'm01-p5',
      title: 'Slide on a slope',
      type: 'compute',
      difficulty: 2,
      minutes: 6,
      statement: md`A body moves with velocity $(120, 90)$ px/s into a sloped wall whose unit normal is $(-0.6, -0.8)$. Compute \`velocity.slide(normal)\`.`,
      solution: [
        md`$\mathbf{v}\cdot\hat{\mathbf{n}} = 120(-0.6) + 90(-0.8) = -72 - 72 = -144$: the body is moving into the wall.`,
        md`$\mathbf{v} - (\mathbf{v}\cdot\hat{\mathbf{n}})\hat{\mathbf{n}} = (120, 90) - (-144)(-0.6, -0.8) = (120, 90) - (86.4, 115.2) = (33.6, -25.2)$.`,
        md`Check: $(33.6)(-0.6) + (-25.2)(-0.8) = -20.16 + 20.16 = 0$, so the result runs along the slope. The speed drops from 150 to 42 px/s, which is why walking into a wall at a steep angle feels sticky.`,
      ],
      answer: { kind: 'vector', value: [33.6, -25.2] },
      areas: ['math'],
    },
    {
      id: 'm01-p6',
      title: 'Why not angles?',
      type: 'concept',
      difficulty: 2,
      minutes: 6,
      statement: md`A teammate implements a vision cone by computing \`rad_to_deg(facing.angle())\` and \`rad_to_deg(to_player.angle())\`, subtracting, and checking that the difference is under 45. Describe a case where this fails, and say why the dot-product test does not.`,
      solution: [
        md`Angles from \`angle()\` lie in $(-180°, 180°]$. A guard facing left has angle $180°$; a player slightly below-left has angle about $170°$, but slightly above-left gives about $-170°$. The difference is then $350°$ even though the player is 10° off the facing, so the guard misses a player right in front of it.`,
        md`Fixing it needs wrapping the difference into $(-180°, 180°]$ (or using \`angle_to\`). The dot-product test compares $\cos\theta$ with $\cos 45°$; it has no wrap-around, no trigonometry per test, and works the same for every facing.`,
      ],
      rubric: [md`Gives a concrete wrap-around failure near ±180°`, md`Explains that the dot product needs no wrapping`, md`Mentions \`angle_to\` or wrapping as the alternative fix`],
      areas: ['math'],
    },
    {
      id: 'm01-p7',
      title: 'Backstab bonus',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 8,
      statement: md`Write \`func is_backstab(attacker_pos: Vector2, defender_pos: Vector2, defender_facing: Vector2) -> bool\` that returns true when the attacker is within the 90° cone *behind* the defender. \`defender_facing\` is a unit vector.`,
      solution: [
        md`"Behind" means the direction from the defender to the attacker points against the facing. The cone behind has half-angle 45°, so the angle between $-\hat{\mathbf{f}}$ and $\hat{\mathbf{d}}$ is at most 45°: $(-\hat{\mathbf{f}})\cdot\hat{\mathbf{d}} \ge \cos 45°$.`,
        md`\`\`\`gdscript
func is_backstab(attacker_pos: Vector2, defender_pos: Vector2, defender_facing: Vector2) -> bool:
	var to_attacker := defender_pos.direction_to(attacker_pos)
	return (-defender_facing).dot(to_attacker) >= cos(deg_to_rad(45.0))
\`\`\``,
        md`Equivalently \`defender_facing.dot(to_attacker) <= -cos(deg_to_rad(45.0))\`. If attacker and defender are on the same spot, \`direction_to\` returns zero and the function returns false, which is a sensible answer.`,
      ],
      rubric: [md`Uses the direction from defender to attacker`, md`Compares with the cosine of the half-angle, negated facing or negated threshold`, md`Normalizes the displacement`],
      areas: ['math', 'combat'],
    },
    {
      id: 'm01-p8',
      title: 'Apply a transform',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`A \`Transform2D\` has \`x = Vector2(0, 2)\`, \`y = Vector2(-2, 0)\` and \`origin = Vector2(10, 5)\`. Where does it send the local point $(3, 1)$? (It is a 90° rotation with scale 2.)`,
      solution: [md`$3\mathbf{x} + 1\mathbf{y} + \mathbf{o} = (0, 6) + (-2, 0) + (10, 5)$.`, md`$= (8, 11)$.`],
      answer: { kind: 'vector', value: [8, 11] },
      areas: ['math'],
    },
    {
      id: 'm01-p9',
      title: 'The hitbox that stays behind',
      type: 'debug',
      difficulty: 2,
      minutes: 6,
      statement: md`Kai's scene is \`Player (CharacterBody2D)\` with children \`Sprite2D\` and \`SwordHitbox (Area2D)\` at $(14, 0)$. This code (\`sprite\` is an \`@onready\` reference to the \`Sprite2D\`) makes him face the direction of movement, but when he faces left his sword still hits enemies on his right. Explain and fix it.

\`\`\`gdscript
func _update_facing(input: Vector2) -> void:
	if input.x != 0.0:
		sprite.flip_h = input.x < 0.0
\`\`\``,
      solution: [
        md`\`flip_h\` mirrors only the drawn texture. The hitbox is a separate node whose transform never changes, so it stays at $(14, 0)$, on Kai's right.`,
        md`Fix: add a \`Node2D\` called \`Facing\` under \`Player\`, move \`Sprite2D\` and \`SwordHitbox\` under it, and set \`$Facing.scale.x = -1.0 if input.x < 0.0 else 1.0\`. Do not set a negative scale on the \`CharacterBody2D\` itself. (Alternatively set \`$SwordHitbox.position.x = -14.0\` when facing left, which works but has to be repeated for every child that should mirror.)`,
      ],
      rubric: [md`Explains that \`flip_h\` does not affect other nodes`, md`Mirrors a common parent \`Node2D\` with \`scale.x\``, md`Keeps negative scale off the physics body`],
      areas: ['godot', 'combat'],
    },
    {
      id: 'm01-p10',
      title: 'Turning time',
      type: 'compute',
      difficulty: 2,
      minutes: 6,
      statement: md`A guard faces $(1, 0)$. Kai appears at displacement $(-30, -30)$. Compute \`rad_to_deg(facing.angle_to(to_kai))\`, and how long the guard takes to face him at 180°/s. Enter [angle in degrees, time in s].`,
      solution: [
        md`\`angle_to\` $= \operatorname{atan2}(\mathbf{a}\times\mathbf{b},\ \mathbf{a}\cdot\mathbf{b})$. Cross: $1\cdot(-30) - 0\cdot(-30) = -30$. Dot: $-30$. $\operatorname{atan2}(-30, -30) = -135°$: turn counter-clockwise on screen.`,
        md`$135 / 180 = 0.75$ s.`,
      ],
      answer: { kind: 'vector', value: [-135, 0.75] },
      areas: ['math'],
    },
  ],
};
