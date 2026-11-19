import { md, gd, type Module } from '../types';

const FAST_SHOT = gd`
extends Area2D
## A fast shot that sweeps its path with a ray every physics frame, so it cannot skip a thin wall.

@export var speed := 900.0  ## px/s, 15 px per physics frame
@export var direction := Vector2.RIGHT
@export_flags_2d_physics var wall_mask := 1  ## world


func _ready() -> void:
    # free the shot after 2 s if it never hits anything
    get_tree().create_timer(2.0).timeout.connect(queue_free)


func _physics_process(delta: float) -> void:
    var motion := direction.normalized() * speed * delta
    var from := global_position
    var query := PhysicsRayQueryParameters2D.create(from, from + motion, wall_mask)
    var hit := get_world_2d().direct_space_state.intersect_ray(query)
    if hit.is_empty():
        global_position = from + motion
        return
    # stop exactly on the wall's surface and report what we hit
    global_position = hit.position
    print("hit %s at %s, normal %s" % [hit.collider.name, hit.position, hit.normal])
    set_physics_process(false)
    queue_free()
`;

const NAIVE_SHOT = gd`
extends Area2D
## Moves by teleporting a fixed step each physics frame. Fast shots can skip thin walls.

@export var speed := 900.0  ## px/s, 15 px per physics frame
@export var direction := Vector2.RIGHT


func _ready() -> void:
    body_entered.connect(_on_body_entered)


func _physics_process(delta: float) -> void:
    position += direction.normalized() * speed * delta


func _on_body_entered(body: Node2D) -> void:
    print("hit ", body.name)
    queue_free()
`;

const SPIKES = gd`
extends Area2D
## Floor spikes: hurt party members who step on them, ignore enemies.

signal stepped_on(body: Node2D)

@export var damage := 5


func _ready() -> void:
    collision_layer = 0  # nothing needs to find the spikes
    collision_mask = 0
    set_collision_mask_value(2, true)  # player
    set_collision_mask_value(3, true)  # party
    body_entered.connect(_on_body_entered)


func _on_body_entered(body: Node2D) -> void:
    print("%s stepped on the spikes: %d damage (mask = %d)" % [body.name, damage, collision_mask])
    stepped_on.emit(body)
`;

const COIN = gd`
extends Area2D
## A coin: on the pickup layer, scanning only the player layer, so enemies walk over it.

signal collected(value: int)

@export var value := 1


func _ready() -> void:
    collision_layer = 0
    set_collision_layer_value(8, true)  # pickup: what I am
    collision_mask = 0
    set_collision_mask_value(2, true)  # player: what I scan
    body_entered.connect(_on_body_entered)


func _on_body_entered(_body: Node2D) -> void:
    # the mask already guarantees this is Kai, so no type check is needed
    collected.emit(value)
    queue_free()
`;

const SIGHT = gd`
extends Node2D
## Line of sight for an enemy: range first, then the view cone, then a ray that walls block.

@export var sight_range := 160.0  ## px
@export var fov_degrees := 100.0  ## full width of the view cone
@export_flags_2d_physics var sight_mask := 3  ## world + player

## Unit vector the enemy looks along; the enemy script updates it when it turns.
var facing := Vector2.RIGHT


func can_see(target: Node2D) -> bool:
    var to_target := target.global_position - global_position
    # 1. cheapest test first: too far away
    if to_target.length() > sight_range:
        return false
    # 2. outside the cone: compare cosines instead of angles, no acos needed
    if facing.dot(to_target.normalized()) < cos(deg_to_rad(fov_degrees / 2.0)):
        return false
    # 3. the ray: the first thing on the line must be the target itself
    var query := PhysicsRayQueryParameters2D.create(global_position, target.global_position, sight_mask)
    var hit := get_world_2d().direct_space_state.intersect_ray(query)
    return not hit.is_empty() and hit.collider == target
`;

const INTERACT_RAY = gd`
extends RayCast2D
## Kai's interaction ray: points the way Kai faces and reports the interactable in front of him.

@export var reach := 14.0  ## px from Kai's feet


func _ready() -> void:
    collision_mask = 0
    set_collision_mask_value(1, true)  # world: a wall in between blocks the ray
    set_collision_mask_value(7, true)  # interactable
    collide_with_areas = true  # chests and signs are Area2Ds
    target_position = Vector2.DOWN * reach


func point_toward(direction: Vector2) -> void:
    if direction != Vector2.ZERO:
        target_position = direction.normalized() * reach


## The Area2D in front of Kai, or null (nothing there, or a wall came first).
func get_interactable() -> Area2D:
    force_raycast_update()
    return get_collider() as Area2D
`;

const ICE_SHARD = gd`
extends CharacterBody2D
## Lyra's ice shard: flies straight, bounces off walls a few times, then shatters.

@export var speed := 180.0  ## px/s
@export var max_bounces := 3

var bounces_left := max_bounces


func launch(direction: Vector2) -> void:
    velocity = direction.normalized() * speed


func _physics_process(delta: float) -> void:
    # move_and_collide sweeps the shape along the motion and stops at the first contact
    var collision := move_and_collide(velocity * delta)
    if collision == null:
        return
    if bounces_left == 0:
        queue_free()
        return
    bounces_left -= 1
    var n := collision.get_normal()
    velocity = velocity.bounce(n)  # v - 2 (v.n) n: same speed, normal part flipped
    print("bounce, normal %s, new velocity %s" % [n, velocity])
`;

export const MODULE: Module = {
  id: 'm04',
  part: 'math',
  order: 4,
  title: 'Collision geometry and queries',
  summary: 'Overlap tests for boxes and circles, the separating axis idea, tunnelling and swept tests; Godot bodies and areas, collision layers and masks as bitmasks; raycasts, line of sight, normals, bouncing and sliding.',
  relevance: md`Every interaction in Shardbound is a collision question. Kai's feet against walls, his sword against a slime's hurtbox, a coin against the player, an ice shard against a pillar, a skeleton's line of sight to the party. This module gives you the tests behind those questions, the eight named physics layers that keep the right pairs talking (and the wrong ones apart: Kai's sword must never hit Kai), and the raycasts that the enemy AI (k02), the hitbox system (k01, c05) and the height system (c03) rely on.`,
  prereqs: ['m01', 'g03'],
  areas: ['math', 'godot', 'combat'],
  lessons: [
    {
      id: 'm04-1',
      title: 'Overlap tests: boxes, circles and the separating axis',
      minutes: 40,
      objectives: [
        'Test point-in-rectangle, box against box and circle against circle with comparisons only, no square roots.',
        'Compute the overlap depth of two boxes and the smallest vector that pushes one out of the other.',
        'Explain the separating axis idea and why it handles rotated boxes.',
        'Predict when a fast object tunnels through a thin wall ($v > 60(w + b)$) and fix it with a swept ray.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Many times per physics frame, the game asks the same question about pairs of shapes: *do these two overlap?* Kai's 10×6 px feet box against a wall tile. The sword's arc against a slime's hurtbox. A coin's circle against Kai. Godot's physics engine answers it for you, but you still need the tests yourself, for three reasons:

- **To pick shapes.** A circle and a box behave differently at corners, and they differ in cost.
- **To write cheap custom checks.** 200 bullets against a boss's weak point do not each need a physics node.
- **To understand the failures.** A fast fireball that passes through a wall is not a bug in Godot; it is what discrete tests do.

All coordinates here are Godot's: x grows to the right, **y grows downward**, units are game pixels.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Axis-aligned box (AABB) and Rect2',
          md: md`An **axis-aligned bounding box** is a rectangle whose edges are parallel to the x and y axes. Godot's \`Rect2\` stores one as \`position\` (the top-left corner) and \`size\`; \`end\` is \`position + size\`, the bottom-right corner. A point $p$ is inside when

$$\text{position}_x \le p_x < \text{end}_x \quad\text{and}\quad \text{position}_y \le p_y < \text{end}_y,$$

which is what \`rect.has_point(p)\` checks. Four comparisons, no arithmetic beyond an addition: this is why boxes are the default shape for tiles, feet and hitboxes.`,
        },
        {
          kind: 'derive',
          title: 'when do two boxes overlap?',
          goal: md`Find a test for two boxes $A$ and $B$ that uses only comparisons.`,
          steps: [
            {
              md: md`Start in one dimension. Interval $A = [a_0, a_1]$ and interval $B = [b_0, b_1]$. Overlap is awkward to describe directly (B can stick out on the left, on the right, both, or sit inside), so describe the opposite: the intervals are **separated** when $A$ ends before $B$ starts, or $B$ ends before $A$ starts: $$a_1 \le b_0 \quad\text{or}\quad b_1 \le a_0.$$`,
              choose: {
                prompt: md`Why describe "separated" first instead of "overlapping"?`,
                options: [md`Separation has only two cases, so it is easy to write down; overlap is everything else`, md`Separation is faster to compute`, md`Godot requires it`],
                answer: 0,
                explain: md`Overlap has several arrangements (partial left, partial right, containment). Separation has exactly two. Negating a simple condition is a standard trick for geometry tests.`,
              },
            },
            {
              md: md`Negate it (De Morgan: "not (P or Q)" is "not P and not Q"): the intervals overlap when $$a_0 < b_1 \quad\text{and}\quad b_0 < a_1.$$`,
            },
            {
              md: md`Two boxes overlap when their x intervals overlap **and** their y intervals overlap. If either axis has a gap, a straight line along that gap separates them. That gives four comparisons: $$a.\text{pos}_x < b.\text{end}_x,\ \ b.\text{pos}_x < a.\text{end}_x,\ \ a.\text{pos}_y < b.\text{end}_y,\ \ b.\text{pos}_y < a.\text{end}_y.$$`,
              choose: {
                prompt: md`Two boxes overlap on x but have a 1 px gap on y. Do they collide?`,
                options: [md`No: one axis with a gap is enough to separate them`, md`Yes: overlapping on one axis is enough`, md`It depends on the sizes`],
                answer: 0,
                explain: md`Both axes must overlap. A box directly above another with a 1 px gap overlaps in x but not in y, and they do not touch.`,
              },
            },
            {
              md: md`How deep is the overlap? On each axis it is the smaller end minus the larger start: $$o_x = \min(a.\text{end}_x, b.\text{end}_x) - \max(a.\text{pos}_x, b.\text{pos}_x),$$ and the same for $y$. Pushing $B$ out along the axis with the **smaller** overlap is the shortest way out: this is how simple physics resolves box collisions.`,
            },
          ],
          takeaway: md`\`Rect2.intersects(b)\` is exactly these four comparisons. The overlap depths give the push-out vector.`,
        },
        {
          kind: 'viz',
          viz: { type: 'math.collisionShapes', mode: 'rect' },
          task: md`Drag box B around A. Find a position where exactly one of the four comparisons is false, and check that the boxes do not overlap there. Then overlap them a little from the right and read the push-out vector.`,
          caption: md`The coloured bars along the left and bottom edges are each box's interval on that axis. The boxes overlap only while both pairs of bars overlap. The red arrow is the shortest push that separates them.`,
        },
        {
          kind: 'numeric',
          q: md`Kai's feet box is \`Rect2(100, 120, 10, 6)\` and a wall tile is \`Rect2(108, 110, 32, 16)\`. Compute the overlap on x and on y, in pixels. Enter both, x first.`,
          answer: { kind: 'vector', value: [2, 6] },
          inputHint: 'e.g. 3, 4',
          hints: [md`Kai spans x 100 to 110 and y 120 to 126; the wall spans x 108 to 140 and y 110 to 126.`],
          explain: md`$o_x = \min(110, 140) - \max(100, 108) = 2$ and $o_y = \min(126, 126) - \max(120, 110) = 6$. The x overlap is smaller, so the shortest fix moves Kai 2 px left. This is why \`move_and_slide\` stops Kai at the wall's side instead of pushing him 6 px up.`,
        },
        {
          kind: 'text',
          md: md`### Circles

A circle is a centre and a radius. Two circles overlap when the distance between the centres is less than the sum of the radii:
$$|\mathbf{b} - \mathbf{a}| < r_a + r_b.$$
Both sides are non-negative, so squaring keeps the comparison true and removes the square root:
$$(b_x - a_x)^2 + (b_y - a_y)^2 < (r_a + r_b)^2.$$
In GDScript that is \`a.distance_squared_to(b) < (ra + rb) * (ra + rb)\`. Circles are a good fit for things whose orientation does not matter: pickup ranges, explosion radii, a slime's body. Rotating a circle changes nothing, and a circle slides smoothly around corners where a box catches.

**Box against circle.** Clamp the circle's centre into the box to find the box's closest point, \`center.clamp(rect.position, rect.end)\`, then compare the squared distance from the centre to that point with $r^2$. If the centre is inside the box the closest point is the centre itself and the distance is 0.`,
        },
        {
          kind: 'viz',
          viz: { type: 'math.collisionShapes', mode: 'circle' },
          task: md`Change the radii and drag the circles until they just touch: $d^2$ and $(r_a + r_b)^2$ are then nearly equal. Then switch to **box/circle** and slide the circle around a corner of the box: watch where the closest point goes.`,
        },
        {
          kind: 'check',
          q: md`A pickup check runs for 300 coins every frame. Why compare \`distance_squared_to\` with \`(ra + rb) * (ra + rb)\` instead of \`distance_to\` with \`ra + rb\`?`,
          options: [md`Both give the same answer, and the squared form skips 300 square roots per frame`, md`The squared form is more accurate for large distances`, md`\`distance_to\` does not exist on \`Vector2\``, md`The squared form also works for boxes`],
          answer: 0,
          explain: md`Squaring is monotonic for non-negative numbers, so $d < r \iff d^2 < r^2$. The answer is identical and the square root disappears. A square root is not expensive on modern hardware, but in a loop over hundreds of objects there is no reason to pay for it.`,
        },
        {
          kind: 'text',
          md: md`### Rotated boxes: the separating axis idea

The box test checks two directions, x and y, because the boxes' edges line up with them. Once a box rotates (a swinging sword's hitbox, a tilted log), the gaps between shapes can run diagonally, and checking x and y alone gives false hits.

The **separating axis theorem** says: two convex shapes do **not** overlap exactly when there is some direction (an *axis*) along which their shadows do not overlap. Project both shapes onto the axis (take the dot product of every corner with the unit axis vector; the minimum and maximum give the shadow interval) and compare intervals, as in the 1D box test.

You cannot try every direction, but you do not need to: for polygons, a separating axis exists only if one exists among the **edge normals** of the two shapes. A rectangle has two distinct edge directions, so two rotated rectangles need **four** interval tests. If all four overlap, the boxes collide; if any one has a gap, they do not.

Godot's physics engine runs this test (and its relatives for circles and capsules) inside every collision check. You rarely write it, but it explains why convex shapes are fast and why a concave polygon is split into convex pieces.`,
        },
        {
          kind: 'viz',
          viz: { type: 'math.collisionShapes', mode: 'sat' },
          task: md`Rotate both boxes and drag them so that their corners nearly touch along a diagonal. Step through the four axes with **show axis**: find the one with a gap. Then drag them together until every axis reports an overlap.`,
          caption: md`The thick bars are the two shapes' projections onto the selected axis, drawn beside it. A gap on any one of the four axes proves the boxes are apart.`,
        },
        {
          kind: 'check',
          q: md`How many axes does the separating axis test need for a triangle against a rotated rectangle?`,
          options: [md`5: three edge normals from the triangle, two from the rectangle`, md`2: x and y`, md`7: one per edge`, md`4`],
          answer: 0,
          explain: md`A triangle's three edges point three different ways, so it contributes three normals. A rectangle's four edges come in two parallel pairs, so it contributes two. In general, collect the distinct edge normals of both polygons.`,
        },
        {
          kind: 'text',
          md: md`### Tunnelling

Physics runs at 60 Hz. Between two physics frames nothing exists: an object is at one position, then at the next. A test that only checks the new position cannot know what lies between the two.

At 900 px/s a projectile moves **15 px per frame**. A 4 px bullet against a 4 px wall overlaps it only while its centre is inside an 8 px window. With a 15 px step, about half of the shots have no frame where they overlap the wall: they are on the near side in one frame and past the wall in the next. This is **tunnelling**, the classic "fast bullets pass through walls" bug.`,
        },
        {
          kind: 'derive',
          title: 'how often does a shot tunnel?',
          goal: md`A shot of width $b$ moves $s = v/60$ px per frame toward a wall of thickness $w$. Find the probability that some frame catches it overlapping the wall, if its starting point is arbitrary.`,
          steps: [
            { md: md`The shot overlaps the wall while its centre is within a window of width $L = w + b$: from half a bullet before the wall's near face to half a bullet past its far face.` },
            {
              md: md`The centre is sampled at points $s$ apart. If $s \le L$, at least one sample must fall inside the window, so the hit is certain.`,
              choose: {
                prompt: md`Why is the hit certain when $s \le L$?`,
                options: [md`Consecutive samples are at most $L$ apart, so they cannot both jump over a window of width $L$`, md`The physics engine slows the bullet down`, md`Because the bullet is wider than the wall`],
                answer: 0,
                explain: md`To skip a window you have to step over all of it. A step no longer than the window always lands inside or on its edge.`,
              },
            },
            {
              md: md`If $s > L$, at most one sample can land in the window, and where the samples fall depends on the arbitrary starting point. The chance that one lands inside is the window's share of a step: $$P(\text{hit}) = \frac{L}{s} = \frac{60\,(w + b)}{v}.$$`,
            },
            { md: md`So the shot can never tunnel when $v \le 60\,(w + b)$. For a 4 px shot and a 16 px wall tile that is $v \le 1200$ px/s; for a 4 px wall it is only 480 px/s.` },
          ],
          takeaway: md`Thin walls and fast shots are the dangerous combination. The safe speed grows with the physics rate: at 120 Hz it doubles.`,
        },
        {
          kind: 'viz',
          viz: { type: 'math.collisionTunnel', mode: 'discrete', speed: 900, wall: 4 },
          task: md`With the overlap test, compare the measured hit rate with the expected one at 300, 900 and 1500 px/s (press **Reset count** after each change and let 20 shots fire). Turn on slow motion to watch the numbered samples step over the wall. Then switch to **swept ray** at 1800 px/s.`,
          caption: md`The yellow boxes are the most recent shot's position at each physics frame. In swept mode the blue segments are the rays cast from each position to the next: they cover the whole path, so nothing in between is missed.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'Which Godot objects can tunnel',
          md: md`- An \`Area2D\` (or any node) moved by setting \`position\` teleports. Its overlap is tested only where it lands, so it tunnels exactly as in the figure.
- A \`CharacterBody2D\` moved with \`move_and_slide()\` or \`move_and_collide()\` does not: those functions sweep the body's shape along the motion and stop at the first contact. This is one reason projectiles that must bounce are often \`CharacterBody2D\`s.
- A \`RigidBody2D\` is stepped by the physics engine and can tunnel at high speed. Set its \`continuous_cd\` property to *Cast Ray* or *Cast Shape* to sweep it.
- For your own fast shots, cast a ray from the old position to the new one each frame: \`PhysicsRayQueryParameters2D.create(from, to, mask)\` and \`get_world_2d().direct_space_state.intersect_ray(query)\`. Lesson m04-3 covers rays in detail.`,
        },
        {
          kind: 'code',
          file: 'scripts/naive_shot.gd',
          code: NAIVE_SHOT,
          note: md`The version that tunnels. \`body_entered\` fires only if a physics frame finds the shot overlapping a body, which at 15 px per frame is not guaranteed for thin walls.`,
        },
        {
          kind: 'steps',
          title: 'Reproduce tunnelling in Godot',
          steps: [
            md`Create a scene \`scenes/tests/tunnel_test.tscn\` with a \`Node2D\` root. Add a \`StaticBody2D\` named \`Wall\` at (200, 90) with a \`CollisionShape2D\` child holding a **RectangleShape2D** of size 4×100. Leave it on layer 1 (\`world\`).`,
            md`Create \`scenes/naive_shot.tscn\`: an \`Area2D\` root with a \`CollisionShape2D\` (RectangleShape2D 4×4) and, for visibility, a \`ColorRect\` of 4×4 at position (-2, -2). Attach the \`naive_shot.gd\` listing above. Set the Area2D's **Collision → Mask** to layer 1 only.`,
            md`Instance ten shots into the test scene at x = 20 and y = 50, 60, …, 140, then shift each one's x by a different amount between 0 and 15 px, so their phases differ as real shots' do. Turn on **Debug → Visible Collision Shapes** and run the scene with **F6**.`,
            md`Count the "hit Wall" lines in the Output panel. Then set every shot's \`speed\` to 300 and run again.`,
          ],
          result: md`At 900 px/s roughly half the shots print a hit and the rest fly through the wall; at 300 px/s (5 px per frame, less than the 8 px window) every shot hits.`,
          troubleshoot: [
            { problem: md`No shot ever reports a hit, even at 300 px/s.`, fix: md`The shot's mask must include the wall's layer. Check that the Area2D's **Collision → Mask** has layer 1 ticked and that \`Monitoring\` is on.` },
            { problem: md`Every shot hits, even at 900 px/s.`, fix: md`Check the wall's thickness: a 16 px or thicker wall makes the window larger than the 15 px step. The tunnelling needs a thin wall.` },
          ],
        },
        {
          kind: 'build',
          ch: {
            id: 'm04-1-build',
            title: 'A shot that cannot tunnel',
            goal: md`Replace the naive shot with one that sweeps its path with a ray every physics frame.`,
            requirements: [
              md`At 900 px/s, all ten shots stop at the 4 px wall.`,
              md`At 1800 px/s, against a 1 px wall, they still stop.`,
              md`Each shot stops with its centre exactly on the wall's near face (print the hit position and compare with the wall's x).`,
              md`Each hit prints the collider's name and the surface normal, which is (-1, 0) for a shot travelling right.`,
              md`A shot that hits nothing frees itself after 2 seconds.`,
            ],
            hints: [
              md`\`intersect_ray\` must run during \`_physics_process\`; the physics space is locked at other times.`,
              md`The ray goes from the current \`global_position\` to \`global_position + motion\`. If the result is empty, move the full step; otherwise move to \`hit.position\`.`,
              md`\`get_tree().create_timer(2.0).timeout.connect(queue_free)\` frees the node after 2 s without adding a Timer node.`,
            ],
            solution: [{ file: 'scripts/fast_shot.gd', code: FAST_SHOT }],
            explain: md`The ray covers the segment the shot travels this frame, so any wall that crosses the segment is found no matter how thin it is. The shot's own collision shape is no longer needed for walls (it can stay for hitting enemies through an Area2D signal). \`set_physics_process(false)\` stops it moving in the same frame it is freed.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'm04-1-paper',
            title: 'Safe speeds',
            type: 'compute',
            difficulty: 2,
            minutes: 6,
            statement: md`Lyra's fireball has a 6 px collision box and the thinnest wall in the dungeon is 10 px. Physics runs at 60 Hz. (a) What is the highest speed at which a discrete overlap test can never miss the wall? (b) At 1500 px/s, what fraction of fireballs pass through? Enter $[v_{\max}, \text{fraction}]$.`,
            hints: [md`The window is $w + b$ wide; a hit is certain when the step $v/60$ is at most the window.`],
            solution: [
              md`(a) $v_{\max} = 60\,(w + b) = 60 \cdot 16 = 960$ px/s.`,
              md`(b) At 1500 px/s the step is 25 px. $P(\text{hit}) = 16/25 = 0.64$, so $0.36$ of fireballs pass through.`,
              md`At 120 Hz physics the safe speed would double to 1920 px/s, which is one reason some action games raise the physics rate; a swept ray is the cheaper fix.`,
            ],
            answer: { kind: 'vector', value: [960, 0.36] },
          },
        },
        {
          kind: 'recall',
          prompt: md`Write the four comparisons that decide whether \`Rect2\`s \`a\` and \`b\` overlap, and say how to find the shortest push-out.`,
          answer: md`\`a.position.x < b.end.x\`, \`b.position.x < a.end.x\`, \`a.position.y < b.end.y\`, \`b.position.y < a.end.y\`. Overlap on each axis is min(ends) minus max(starts); push out along the axis with the smaller overlap.`,
        },
        {
          kind: 'explain',
          prompt: md`Explain to a teammate why the fireball sometimes passes through the thin gate, and give two fixes with their trade-offs.`,
          model: md`Physics only checks the fireball where it is at each 60 Hz frame. At 1500 px/s it moves 25 px per frame, more than the 16 px window in which its 6 px box overlaps the 10 px gate, so some frames land before the gate and the next one past it. Fix 1: cast a ray (or the shape) from the old position to the new one each frame; it is exact for any speed and costs one query per shot per frame. Fix 2: keep speed below 60 × (wall + shot), 960 px/s here, or thicken the gate's collision; free, but it constrains design. Moving the shot as a CharacterBody2D with move_and_collide also sweeps.`,
        },
      ],
      cards: [
        { id: 'm04-1-c1', kind: 'concept', front: md`When do two intervals $[a_0, a_1]$ and $[b_0, b_1]$ overlap?`, back: md`When $a_0 < b_1$ and $b_0 < a_1$. Boxes overlap when their x intervals and their y intervals both overlap.` },
        { id: 'm04-1-c2', kind: 'cloze', text: md`Two circles overlap when \`a.{{}}(b) < (ra + rb) * (ra + rb)\`.`, answers: ['distance_squared_to'] },
        { id: 'm04-1-c3', kind: 'concept', front: md`State the separating axis idea for two convex polygons.`, back: md`They are apart exactly when their projections onto some axis do not overlap; it is enough to test the edge normals of both shapes (4 axes for two rectangles).` },
        { id: 'm04-1-c4', kind: 'compute', front: md`A 4 px shot and a 4 px wall at 60 Hz: the highest speed (px/s) at which a discrete test never misses?`, answer: { kind: 'number', value: 480 }, back: md`$60\,(w + b) = 60 \cdot 8 = 480$ px/s.` },
        { id: 'm04-1-c5', kind: 'concept', front: md`Which moving Godot bodies sweep their shape, and which teleport?`, back: md`\`CharacterBody2D\` with \`move_and_slide\`/\`move_and_collide\` sweeps. Setting \`position\` on any node (an Area2D shot) teleports. \`RigidBody2D\` sweeps only with \`continuous_cd\` enabled.` },
      ],
    },
    {
      id: 'm04-2',
      title: 'Bodies, areas, layers and masks',
      minutes: 40,
      objectives: [
        'Choose between Area2D, StaticBody2D, AnimatableBody2D, CharacterBody2D and RigidBody2D for a game object.',
        'Read collision layers and masks as bitmasks: the layer is what an object is, the mask is what it scans.',
        'Compute the value of layer $n$ as $2^{n-1}$ (`1 << (n - 1)`) and a mask from a list of layers.',
        'Wire hitboxes, hurtboxes, pickups and rays on the course\'s eight layers so nothing hits itself.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Put Kai, a slime, a wall, a coin and Kai's sword in one room with Godot's defaults, and everything collides with everything: the sword swings through Kai's own hurtbox and he hurts himself, the slime picks up the coin, Lyra blocks Kai in a corridor. Two decisions fix this, and you make both for every physics object:

1. **What kind of object is it?** Something that blocks, something that moves under your code, something the simulation moves, or something that only detects overlaps.
2. **Which other objects should it notice?** That is what collision layers and masks express.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'The five collision objects',
          md: md`| Node | Moved by | Blocks others | Use it for |
|---|---|---|---|
| \`StaticBody2D\` | nothing (or rarely, by code) | yes | walls, rocks; a \`TileMapLayer\`'s tile collisions behave the same way |
| \`AnimatableBody2D\` | your code or an \`AnimationPlayer\` | yes, and pushes characters it moves into | moving platforms, sliding doors, lifts |
| \`CharacterBody2D\` | your code, through \`move_and_slide()\` | yes | Kai, the party, enemies |
| \`RigidBody2D\` | the physics simulation (forces, gravity, impulses) | yes | crates that tumble, rubble, physics props |
| \`Area2D\` | your code (or a parent) | no, it only detects | hitboxes, hurtboxes, pickups, triggers, damage zones |

All five extend \`CollisionObject2D\`, need a \`CollisionShape2D\` or \`CollisionPolygon2D\` child to have a shape, and share \`collision_layer\` and \`collision_mask\`. An \`Area2D\` reports overlaps with the signals \`body_entered(body)\`, \`body_exited(body)\`, \`area_entered(area)\` and \`area_exited(area)\`.`,
        },
        {
          kind: 'check',
          q: md`A stone platform slides back and forth over a chasm, and Kai must ride on it. Which node should the platform be?`,
          options: [md`\`AnimatableBody2D\`, moved by an AnimationPlayer or a tween`, md`\`StaticBody2D\` with its position changed every frame`, md`\`RigidBody2D\` with gravity off`, md`\`Area2D\``],
          answer: 0,
          explain: md`An \`AnimatableBody2D\` is meant to be moved by code or animation and reports its motion to the physics engine, so characters standing on it are carried and characters it moves into are pushed. A \`StaticBody2D\` moved by setting its position teleports, which characters do not ride reliably. A \`RigidBody2D\` would be pushed around by Kai. An \`Area2D\` does not block, so Kai would fall through.`,
        },
        {
          kind: 'text',
          md: md`### Layers and masks

Every collision object has 32 **layers**, numbered 1 to 32, stored as the bits of two integers:

- \`collision_layer\`: the layers this object **is on**. *What I am.*
- \`collision_mask\`: the layers this object **scans**. *What I look for.*

The rule is one line. Object A notices object B when A's mask shares a bit with B's layer:
$$(A.\text{collision\_mask}\ \&\ B.\text{collision\_layer}) \ne 0.$$
What "notices" means depends on A. A \`CharacterBody2D\`'s mask decides what stops it in \`move_and_slide()\`. An \`Area2D\`'s mask decides which bodies and areas trigger its signals (another area must also have \`monitorable\` on, the default). A \`RayCast2D\` has only a mask: it is never something to be found.

The relationship is directed. Kai's hurtbox can scan for enemy attacks while nothing scans for Kai's hurtbox, so a hurtbox's own layer can be empty.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Layers as bits',
          md: md`Layer $n$ is bit $n - 1$ of the integer, so its value is $2^{n-1}$, written \`1 << (n - 1)\` in code. A mask that scans several layers is the sum (the bitwise OR) of their values.

| Layer | Name in this course | Value |
|---|---|---|
| 1 | \`world\` | 1 |
| 2 | \`player\` | 2 |
| 3 | \`party\` | 4 |
| 4 | \`enemy\` | 8 |
| 5 | \`player_hitbox\` | 16 |
| 6 | \`enemy_hitbox\` | 32 |
| 7 | \`interactable\` | 64 |
| 8 | \`pickup\` | 128 |

Godot also lets you work in layer numbers: \`set_collision_mask_value(4, true)\`, \`get_collision_layer_value(2)\`. The Inspector shows the bits as a grid of numbered boxes, and \`@export_flags_2d_physics var mask := 1\` gives your own exported variables the same grid with your layer names.`,
        },
        {
          kind: 'derive',
          title: 'a mask from layer names',
          goal: md`A slime's body should be stopped by walls and by other enemies (so slimes do not stack on one tile), and walk through the party. Find its \`collision_mask\` as an integer.`,
          steps: [
            { md: md`List the layers it scans: \`world\` (1) and \`enemy\` (4). Not \`player\` (2) or \`party\` (3).` },
            {
              md: md`Convert each layer number to its bit value $2^{n-1}$: layer 1 is $2^0 = 1$.`,
              choose: {
                prompt: md`What is the value of layer 4?`,
                options: [md`8`, md`4`, md`16`, md`3`],
                answer: 0,
                explain: md`Layer 4 is bit 3, and $2^3 = 8$. The off-by-one between layer numbers (from 1) and bit positions (from 0) is the most common mistake with masks.`,
              },
            },
            { md: md`Add the values (no two layers share a bit, so adding is the same as OR): $1 + 8 = 9$. In binary that is \`0b00001001\`: bits 0 and 3 are set.` },
            {
              md: md`Check the reverse: which layers does mask 9 contain? Write 9 as a sum of distinct powers of two, $8 + 1$, and read off layers 4 and 1.`,
              choose: {
                prompt: md`Which layers does the mask value 50 scan?`,
                options: [md`2, 5 and 6 (\`player\`, \`player_hitbox\`, \`enemy_hitbox\`)`, md`1, 5 and 6`, md`5 and 0`, md`2, 4 and 5`],
                answer: 0,
                explain: md`$50 = 32 + 16 + 2$, which are $2^5$, $2^4$ and $2^1$: layers 6, 5 and 2.`,
              },
            },
          ],
          takeaway: md`Mask = sum of $2^{n-1}$ over the scanned layers. To decode, take out the largest power of two that fits, repeatedly.`,
        },
        {
          kind: 'steps',
          title: 'Name the layers and set up Kai',
          steps: [
            md`Open **Project → Project Settings → General → Layer Names → 2D Physics** and type the eight names into layers 1 to 8: \`world\`, \`player\`, \`party\`, \`enemy\`, \`player_hitbox\`, \`enemy_hitbox\`, \`interactable\`, \`pickup\`. Close the dialog.`,
            md`Open \`scenes/player.tscn\` and select the root \`Player\`. In the Inspector, expand **Collision**. Click the **Layer** grid: untick 1, tick 2. Hover the boxes: the tooltips now show your names. Set **Mask** to layer 1 only.`,
            md`Open your wall or tile setup. For a \`TileMapLayer\`, select its TileSet, expand **Physics Layers** and check that physics layer 0 has **Collision Layer** 1. For a \`StaticBody2D\` wall, set its layer to 1 and clear its mask (static bodies do not need to scan anything).`,
            md`Turn on **Debug → Visible Collision Shapes** and run your test room. Walk Kai into a wall.`,
          ],
          result: md`Kai still stops at walls (his mask has \`world\`, and the wall's layer is \`world\`). In the Inspector his **Layer** reads 2 and **Mask** reads 1.`,
          troubleshoot: [
            { problem: md`Kai walks through walls after the change.`, fix: md`His mask lost layer 1, or the walls are not on layer 1. A \`CharacterBody2D\` is stopped only by bodies whose layer is in **its own** mask.` },
            { problem: md`The tooltips show "Layer 1" instead of your names.`, fix: md`The names were typed under **3D Physics** or **2D Render**. They belong under **Layer Names → 2D Physics**.` },
          ],
        },
        {
          kind: 'viz',
          viz: { type: 'math.collisionLayers', preset: 'course' },
          task: md`Hover a few cells of the matrix and check the rule: row mask AND column layer. Press **all on 1** (Godot's defaults) and read the list of problems. Then press **buggy** and fix both bugs by toggling bits until the panel reports a match.`,
          caption: md`Rows scan, columns are scanned. **B**: the row body is blocked by the column. **D**: the row area or ray detects the column. The integers are what \`collision_layer\` and \`collision_mask\` hold. Click an object's name to see its setup as GDScript.`,
        },
        {
          kind: 'text',
          md: md`### Why the hurtbox scans the hitbox

An attack needs two areas: the attacker's **hitbox** (the sword's arc, active only during the swing) and the defender's **hurtbox** (the body that can be hurt). One of them has to scan for the other. Both work; the course picks one and uses it everywhere:

- **The hurtbox scans for hitboxes.** The defender owns everything about being hit: invincibility frames after a dodge, guarding, Bram's shield. Its \`area_entered\` handler reads the hitbox's \`HitData\` and decides. The hitbox is passive and can be on a layer with an empty mask.
- So Kai's sword sits on \`player_hitbox\` (5), and each enemy's hurtbox scans layer 5. A slime's bite sits on \`enemy_hitbox\` (6), and Kai's hurtbox scans layer 6. Kai's own hurtbox never scans layer 5, so Kai cannot hit himself, and no rule in code is needed to prevent it.

The \`Hitbox\` and \`Hurtbox\` components themselves are built in c05 and filled with timing in k01; the layers you set here are what they rely on.`,
        },
        {
          kind: 'numeric',
          q: md`Kai's interaction ray should be blocked by walls and find chests and signs (layers \`world\` and \`interactable\`). What integer is its \`collision_mask\`?`,
          answer: { kind: 'number', value: 65 },
          explain: md`\`world\` is layer 1, value 1; \`interactable\` is layer 7, value $2^6 = 64$. The mask is $1 + 64 = 65$, \`0b01000001\`.`,
        },
        { kind: 'code', file: 'scripts/coin.gd', code: COIN, note: md`Setting \`collision_layer\` and \`collision_mask\` to 0 first and then switching single layers on makes the intent readable and avoids keeping the default layer 1 by accident. You can do the same in the Inspector; code is useful when objects are spawned at runtime.` },
        {
          kind: 'check',
          q: md`A slime walks over a coin and the coin disappears. The coin uses the script above, except that its mask was set in the Inspector to the value 10. What happened?`,
          options: [md`Mask 10 is layers 2 and 4, so the coin also scans \`enemy\` and the slime's body triggers it`, md`Mask 10 is layer 10, which nothing uses`, md`Areas always detect every body`, md`The coin is on the wrong layer`],
          answer: 0,
          explain: md`$10 = 8 + 2$: bits for layer 4 (\`enemy\`) and layer 2 (\`player\`). A coin should scan only layer 2, value 2.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'm04-2-build',
            title: 'Spikes that only hurt the party',
            goal: md`Make a floor-spike \`Area2D\` that reports party members stepping on it and ignores enemies, with its layers set in code.`,
            requirements: [
              md`Kai walking onto the spikes prints a message with his name and the damage.`,
              md`A slime (a \`CharacterBody2D\` on layer 4, moving across the spikes) does not trigger them.`,
              md`The printed mask is 6 (layers \`player\` and \`party\`).`,
              md`The spikes are on no layer, and Kai can still walk over them (they do not block).`,
              md`The spikes emit a \`stepped_on(body)\` signal another node could connect to.`,
            ],
            hints: [
              md`Use \`set_collision_mask_value(2, true)\` and \`set_collision_mask_value(3, true)\` after clearing the mask to 0.`,
              md`To move a slime across for the test, give it a script that sets \`velocity = Vector2(40, 0)\` and calls \`move_and_slide()\`.`,
              md`An \`Area2D\` never blocks movement, whatever its layers, so walking over it works automatically.`,
            ],
            solution: [{ file: 'scripts/spikes.gd', code: SPIKES }],
            explain: md`The spikes only need to find bodies, so their own layer is empty. Their mask is $2 + 4 = 6$. Enemies on layer 4 never match, so no type check is needed in the handler: the physics engine never reports them.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'm04-2-paper',
            title: 'A breakable pot',
            type: 'design',
            difficulty: 2,
            minutes: 8,
            statement: md`Design the collision setup for a clay pot in the dungeon: it blocks movement for everyone, Kai's sword and Lyra's fireball break it, enemy attacks do not, and when it breaks a coin drops. Name the nodes, and give each one's layer and mask as layer names and integers.`,
            solution: [
              md`Root: \`StaticBody2D\` with a small rectangle at the pot's base. Layer \`world\` (1), mask 0. Everyone already scans \`world\`, so it blocks Kai, the party and enemies.`,
              md`Child: a \`Hurtbox\` (\`Area2D\`) covering the pot's sprite. Layer 0 (nothing scans for it), mask \`player_hitbox\` (5) = 16. Kai's sword and Lyra's fireball are both player-side hitboxes on layer 5; slime bites on layer 6 are ignored.`,
              md`On break: free the pot and spawn a coin: \`Area2D\` on \`pickup\` (8) = 128, mask \`player\` (2) = 2.`,
            ],
            rubric: [md`Uses a static body on \`world\` for blocking`, md`Uses an Area2D hurtbox that scans only \`player_hitbox\` (16)`, md`Gives correct integers for every layer and mask`, md`Explains why enemy attacks do not break it (layer 6 not in the mask)`],
          },
        },
        {
          kind: 'recall',
          prompt: md`What do \`collision_layer\` and \`collision_mask\` mean, and what is the rule for A noticing B?`,
          answer: md`Layer: the layers the object is on (what I am). Mask: the layers it scans (what I look for). A notices B when A's mask AND B's layer is non-zero. Layer $n$ has value $2^{n-1}$.`,
        },
        {
          kind: 'explain',
          prompt: md`Why use separate layers for \`player_hitbox\` and \`enemy_hitbox\` instead of putting all hitboxes on one "hitbox" layer?`,
          model: md`With one layer, every hurtbox that scans it would detect every hitbox, including its own team's: Kai's hurtbox would detect his own sword and Lyra's fireball, and you would need team checks in code for every hit. With two layers the physics engine filters by team before any script runs: enemy hurtboxes scan only \`player_hitbox\`, party hurtboxes scan only \`enemy_hitbox\`. It is cheaper, it cannot be forgotten in one script, and the matrix of who hits whom is visible in the Inspector.`,
        },
      ],
      cards: [
        { id: 'm04-2-c1', kind: 'concept', front: md`Layer versus mask, in four words each.`, back: md`Layer: what I am. Mask: what I scan. A notices B when \`A.collision_mask & B.collision_layer != 0\`.` },
        { id: 'm04-2-c2', kind: 'compute', front: md`Mask integer for layers 1, 4 and 7?`, answer: { kind: 'number', value: 73 }, back: md`$1 + 8 + 64 = 73$.` },
        { id: 'm04-2-c3', kind: 'cloze', text: md`Layer $n$ has the value \`1 << ({{}})\`.`, answers: ['n - 1|n-1'] },
        { id: 'm04-2-c4', kind: 'concept', front: md`Which body type for: moving platform, crate that tumbles, enemy, wall?`, back: md`AnimatableBody2D, RigidBody2D, CharacterBody2D, StaticBody2D (or a TileMapLayer's collisions).` },
        { id: 'm04-2-c5', kind: 'concept', front: md`In this course, which area scans which in an attack?`, back: md`The hurtbox scans for hitboxes. Enemy hurtboxes scan \`player_hitbox\` (5); Kai's hurtbox scans \`enemy_hitbox\` (6). Hitboxes have empty masks.` },
      ],
    },
    {
      id: 'm04-3',
      title: 'Raycasts, normals, bouncing and sliding',
      minutes: 45,
      objectives: [
        'Cast rays with a RayCast2D node and with `intersect_ray`, and read the hit position, normal and collider.',
        'Write a line-of-sight check from range, a view cone (dot product) and a ray.',
        'Reflect a velocity with $\\mathbf{v} - 2(\\mathbf{v}\\cdot\\mathbf{n})\\mathbf{n}$ and slide it with $\\mathbf{v} - (\\mathbf{v}\\cdot\\mathbf{n})\\mathbf{n}$.',
        'Read the collisions of a `move_and_slide()` call with `get_slide_collision`.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A skeleton guarding a corridor should notice Kai only if it could plausibly see him: close enough, roughly in front of it, and with no wall in between. Lyra's ice shard should ricochet off pillars at the right angle. Kai should slide along a wall he runs into diagonally instead of sticking to it. All three come from one tool, the **ray**, and one quantity it returns, the **surface normal**.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Ray, hit and normal',
          md: md`A **ray** (in practice a segment) is the set of points $\mathbf{p}(t) = \mathbf{o} + t\,(\mathbf{e} - \mathbf{o})$ for $t$ from 0 to 1, from an origin $\mathbf{o}$ to an end $\mathbf{e}$. A **raycast** finds the first collision shape the segment touches and returns:
- the **position** of the contact point,
- the **normal** $\mathbf{n}$: the unit vector perpendicular to the surface at that point, pointing out of the surface (back toward the side the ray came from),
- the **collider**: the node that was hit.

On a wall facing left, the normal is $(-1, 0)$; on a floor seen from above in a side view, it is $(0, -1)$, because y grows downward.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'Two ways to cast a ray',
          md: md`**A \`RayCast2D\` node.** Add it as a child, set \`target_position\` (relative to the node), \`collision_mask\`, and \`collide_with_areas\` if you want areas (it is off by default). It updates once per physics frame; read \`is_colliding()\`, \`get_collider()\`, \`get_collision_point()\` and \`get_collision_normal()\`. Call \`force_raycast_update()\` to cast immediately after moving it. \`exclude_parent\` (on by default) keeps it from hitting its own body. Good for rays that always exist: an interaction ray, ledge detection, a turret's laser.

**A direct query.** From any \`Node2D\` during \`_physics_process\`:
\`\`\`gdscript
var query := PhysicsRayQueryParameters2D.create(from, to, mask)
var hit := get_world_2d().direct_space_state.intersect_ray(query)
\`\`\`
\`hit\` is a \`Dictionary\` with \`position\`, \`normal\`, \`collider\` and a few more keys, or empty when nothing was hit. \`query.exclude\` takes an array of RIDs (\`[get_rid()]\` on a body) to skip. Good for one-off or many rays: line of sight to each of three party members, a swept projectile. For areas of any shape there is \`intersect_shape\` with \`PhysicsShapeQueryParameters2D\`, useful for "which enemies are inside this explosion".`,
        },
        {
          kind: 'viz',
          viz: { type: 'math.raycast', mode: 'sight' },
          task: md`Drag Kai behind the tall wall and watch the ray stop at the wall, with its normal. Move him out of the cone with the wall out of the way, then move him beyond the range. Each test fails for a different reason: find all three, and set the view to 360° to see what changes.`,
          caption: md`Tests run cheapest first: distance, then the cone, then the ray. Only if all three pass does \`can_see\` return true. The ray's mask is \`world + player\`, so it is blocked by walls and finds Kai's body, and it can never hit the skeleton itself, which is on \`enemy\`.`,
        },
        {
          kind: 'derive',
          title: 'the view cone test',
          goal: md`The enemy faces along the unit vector $\mathbf{f}$ and has a field of view $\varphi$ (the full width of the cone). Decide whether the direction $\hat{\mathbf{d}}$ to the target is inside the cone without computing an angle.`,
          steps: [
            { md: md`From m01, the dot product of two unit vectors is the cosine of the angle between them: $\mathbf{f}\cdot\hat{\mathbf{d}} = \cos\theta$.` },
            { md: md`The target is inside the cone when the angle from the facing direction is at most half the field of view: $\theta \le \varphi/2$.` },
            {
              md: md`On $[0°, 180°]$ cosine decreases, so $\theta \le \varphi/2 \iff \cos\theta \ge \cos(\varphi/2)$. The test is $$\mathbf{f}\cdot\hat{\mathbf{d}} \;\ge\; \cos(\varphi/2).$$`,
              choose: {
                prompt: md`Why does the inequality flip from $\le$ to $\ge$?`,
                options: [md`Cosine decreases as the angle grows, so a smaller angle has a larger cosine`, md`Because y grows downward in Godot`, md`Because the dot product can be negative`],
                answer: 0,
                explain: md`A target straight ahead has $\cos 0° = 1$, the largest value. As the target moves toward the edge of the cone, the cosine drops to $\cos(\varphi/2)$.`,
              },
            },
            { md: md`$\cos(\varphi/2)$ depends only on the field of view, so compute it once. Each check is then one normalization and one dot product. A field of view of 360° gives $\cos 180° = -1$, and every direction passes.` },
          ],
          takeaway: md`Range first (cheapest), cone second (a dot product), ray last (a physics query). Most enemies fail the first test most of the time.`,
        },
        {
          kind: 'numeric',
          q: md`A skeleton faces right, $\mathbf{f} = (1, 0)$, with a 90° field of view. Kai is at offset $(30, 40)$ from it. What is $\mathbf{f}\cdot\hat{\mathbf{d}}$, and is Kai in the cone? Enter the dot product.`,
          answer: { kind: 'number', value: 0.6 },
          explain: md`$|(30, 40)| = 50$, so $\hat{\mathbf{d}} = (0.6, 0.8)$ and $\mathbf{f}\cdot\hat{\mathbf{d}} = 0.6$. The threshold is $\cos 45° \approx 0.707$. Since $0.6 < 0.707$, Kai is about 53° off to the side and outside the cone.`,
        },
        { kind: 'code', file: 'scripts/enemy_sight.gd', code: SIGHT, note: md`Add this as a child \`Node2D\` named \`Sight\` of an enemy, at eye height, and call \`$Sight.can_see(kai)\` from the enemy's AI (k02 builds that). Because \`sight_mask\` does not include \`enemy\`, the ray cannot hit the enemy's own body, so no \`exclude\` is needed. If Lyra stands between the skeleton and Kai, the ray passes through her, because \`party\` is not in the mask: decide whether that is what you want.` },
        {
          kind: 'steps',
          title: 'Give Kai an interaction ray',
          steps: [
            md`Open \`scenes/player.tscn\`, add a \`RayCast2D\` child to \`Player\`, name it \`InteractRay\`, and attach a new script \`scripts/interact_ray.gd\` with the listing below.`,
            md`In \`scripts/player.gd\`, add \`@onready var interact_ray: RayCast2D = $InteractRay\` and, in \`_update_facing\` after the facing is decided, call \`interact_ray.point_toward(input)\`.`,
            md`In \`_physics_process\`, after \`move_and_slide()\`, add: \`if Input.is_action_just_pressed("interact"): print(interact_ray.get_interactable())\`.`,
            md`In the test room, add an \`Area2D\` named \`Sign\` with a 12×12 \`CollisionShape2D\`, on layer 7 (\`interactable\`) with an empty mask. Place a \`StaticBody2D\` wall segment so that you can stand with the wall between Kai and the sign.`,
            md`Run with **Debug → Visible Collision Shapes** on. Face the sign from 10 px away and press the interact key; then try through the wall.`,
          ],
          result: md`Facing the sign prints \`Sign:<Area2D#…>\`. Facing away, out of reach, or with the wall in between prints \`<null>\`. The ray is drawn as a short line from Kai's feet that turns with him.`,
          troubleshoot: [
            { problem: md`It always prints \`<null>\`, even right in front of the sign.`, fix: md`\`collide_with_areas\` must be true (the sign is an Area2D), the sign must be on layer 7, and the ray's mask must include 7. Also check that \`reach\` (14 px) actually reaches the sign's shape.` },
            { problem: md`It prints the wall or Kai's own body.`, fix: md`\`get_collider() as Area2D\` returns null for bodies, so a wall should print \`<null>\`. If you see Kai, \`exclude_parent\` was turned off; turn it back on.` },
          ],
        },
        { kind: 'code', file: 'scripts/interact_ray.gd', code: INTERACT_RAY },
        {
          kind: 'text',
          md: md`### Normals: bouncing and sliding

Split a velocity $\mathbf{v}$ hitting a surface with unit normal $\mathbf{n}$ into two parts:
- the **normal part** $(\mathbf{v}\cdot\mathbf{n})\,\mathbf{n}$, pointing into the surface (for an incoming velocity $\mathbf{v}\cdot\mathbf{n} < 0$),
- the **tangent part** $\mathbf{v} - (\mathbf{v}\cdot\mathbf{n})\,\mathbf{n}$, along the surface.

Two responses follow directly:
- **Slide**: drop the normal part, keep the tangent part: $\mathbf{v}_{\text{slide}} = \mathbf{v} - (\mathbf{v}\cdot\mathbf{n})\,\mathbf{n}$. This is what \`move_and_slide()\` does to Kai's velocity at a wall, and it is Godot's \`v.slide(n)\`.
- **Bounce**: flip the normal part, keep the tangent part: $\mathbf{v}_{\text{bounce}} = \mathbf{v} - 2(\mathbf{v}\cdot\mathbf{n})\,\mathbf{n}$. This is \`v.bounce(n)\`. A ball that loses energy on impact scales the flipped part by a restitution $e$ between 0 and 1: $\mathbf{v} - (1 + e)(\mathbf{v}\cdot\mathbf{n})\,\mathbf{n}$.`,
        },
        {
          kind: 'derive',
          title: 'the reflection formula',
          goal: md`Show that $\mathbf{v}' = \mathbf{v} - 2(\mathbf{v}\cdot\mathbf{n})\mathbf{n}$ reverses the normal part, keeps the tangent part, and keeps the speed.`,
          steps: [
            { md: md`Write $\mathbf{v} = \mathbf{v}_n + \mathbf{v}_t$ with $\mathbf{v}_n = (\mathbf{v}\cdot\mathbf{n})\mathbf{n}$ and $\mathbf{v}_t = \mathbf{v} - \mathbf{v}_n$. Since $|\mathbf{n}| = 1$, $\mathbf{v}_t\cdot\mathbf{n} = \mathbf{v}\cdot\mathbf{n} - (\mathbf{v}\cdot\mathbf{n})(\mathbf{n}\cdot\mathbf{n}) = 0$: the parts are perpendicular.` },
            {
              md: md`A mirror bounce keeps the tangent part and negates the normal part: $\mathbf{v}' = \mathbf{v}_t - \mathbf{v}_n = (\mathbf{v} - \mathbf{v}_n) - \mathbf{v}_n = \mathbf{v} - 2\mathbf{v}_n$.`,
              choose: {
                prompt: md`Why is the factor 2 needed?`,
                options: [md`Subtracting $\mathbf{v}_n$ once only cancels it (that is the slide); subtracting it twice reverses it`, md`To double the speed after a bounce`, md`Because the normal has length 2`],
                answer: 0,
                explain: md`$\mathbf{v} - \mathbf{v}_n$ is the slide. One more $-\mathbf{v}_n$ makes the normal part point out of the surface with the same size.`,
              },
            },
            { md: md`Speed: the parts are perpendicular, so by Pythagoras $|\mathbf{v}'|^2 = |\mathbf{v}_t|^2 + |-\mathbf{v}_n|^2 = |\mathbf{v}_t|^2 + |\mathbf{v}_n|^2 = |\mathbf{v}|^2$.` },
          ],
          takeaway: md`Bounce and slide differ by one factor: 2 for a mirror bounce, 1 for a slide, $1 + e$ for a bounce that loses energy. All need a **unit** normal; physics normals already are.`,
        },
        {
          kind: 'viz',
          viz: { type: 'math.raycast', mode: 'bounce' },
          task: md`Drag the aim knob so the first hit is on a wall face, and read $\mathbf{v}\cdot\mathbf{n}$, the bounce and the slide. Check that the speed after the bounce is still 200. Then set 5 bounces and aim into the corner between two walls: what direction does the shot leave in?`,
          caption: md`Orange: the path, traced by one ray per segment. Purple: the surface normal at each hit. Green dashes: the slide direction at the first hit, the motion \`move_and_slide\` would keep.`,
        },
        {
          kind: 'numeric',
          q: md`An ice shard moving at $\mathbf{v} = (100, 0)$ px/s hits a slanted wall with normal $\mathbf{n} = (-0.6, -0.8)$. What is its velocity after a mirror bounce? Enter the vector.`,
          answer: { kind: 'vector', value: [28, -96] },
          inputHint: 'e.g. 10, -20',
          hints: [md`$\mathbf{v}\cdot\mathbf{n} = 100 \cdot (-0.6) + 0 \cdot (-0.8)$.`],
          explain: md`$\mathbf{v}\cdot\mathbf{n} = -60$, so $\mathbf{v}' = (100, 0) - 2(-60)(-0.6, -0.8) = (100, 0) + (-72, -96) = (28, -96)$. Its length is $\sqrt{784 + 9216} = 100$, the same speed. The slide would be $(100, 0) + 60(-0.6, -0.8) = (64, -48)$.`,
        },
        { kind: 'code', file: 'scripts/ice_shard.gd', code: ICE_SHARD, note: md`\`move_and_collide()\` moves the body until its shape touches something and returns a \`KinematicCollision2D\` (or null). The remaining motion of that frame is dropped, which is invisible at 3 px per frame. Give the shard a mask of \`world\` only; its damage to enemies comes from a child hitbox \`Area2D\`.` },
        {
          kind: 'text',
          md: md`### Collisions from move_and_slide

\`move_and_slide()\` can touch several surfaces in one frame (a wall and a corner, say). After it returns, \`get_slide_collision_count()\` says how many, and \`get_slide_collision(i)\` returns each as a \`KinematicCollision2D\` with \`get_normal()\`, \`get_collider()\` and \`get_position()\`. Use them for reactions that depend on what was hit and how hard: a bump sound, pushing a crate, a stagger when a knocked-back enemy hits a wall.

How hard is the speed into the surface before the slide removed it, $-\mathbf{v}\cdot\mathbf{n}$, so remember the velocity before calling \`move_and_slide()\`:
\`\`\`gdscript
var before := velocity
move_and_slide()
for i in get_slide_collision_count():
    var collision := get_slide_collision(i)
    var impact := -before.dot(collision.get_normal())
    if impact > 60.0:
        print("bumped into %s at %.0f px/s" % [collision.get_collider().name, impact])
\`\`\``,
        },
        {
          kind: 'check',
          q: md`Kai moves with velocity $(-80, 30)$ into a wall whose normal is $(1, 0)$. What is his velocity after \`move_and_slide()\`?`,
          options: [md`$(0, 30)$`, md`$(80, 30)$`, md`$(0, 0)$`, md`$(-80, 30)$`],
          answer: 0,
          explain: md`$\mathbf{v}\cdot\mathbf{n} = -80$; the slide is $(-80, 30) - (-80)(1, 0) = (0, 30)$. The part into the wall is removed and the part along it remains, so Kai slides down along the wall at 30 px/s. $(80, 30)$ would be a bounce.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'm04-3-build',
            title: 'The ricochet shard',
            goal: md`Make Lyra's ice shard a \`CharacterBody2D\` that bounces off walls a fixed number of times and then breaks.`,
            requirements: [
              md`Launched at 45° into a room's corner, the shard bounces off both walls and comes back out.`,
              md`Its speed is the same after every bounce (print \`velocity.length()\`).`,
              md`Each bounce prints the normal; on a left wall it is (1, 0).`,
              md`After \`max_bounces\` bounces the next wall contact frees it.`,
              md`At 600 px/s it still never passes through a 4 px wall.`,
            ],
            hints: [
              md`Use \`move_and_collide(velocity * delta)\`, not \`move_and_slide()\`: you want the collision object to bounce yourself, not an automatic slide.`,
              md`\`velocity.bounce(collision.get_normal())\` is the mirror bounce.`,
              md`Give the shard a \`CircleShape2D\` of radius 3 and a mask of layer 1.`,
            ],
            solution: [{ file: 'scripts/ice_shard.gd', code: ICE_SHARD }],
            explain: md`\`move_and_collide\` sweeps the circle along the motion, so it stops at the first contact even at high speed, which is why the shard cannot tunnel. Bouncing flips only the normal part of the velocity, so the speed is unchanged and the angle out equals the angle in.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'm04-3-paper',
            title: 'Bounce with restitution',
            type: 'code-on-paper',
            difficulty: 2,
            minutes: 8,
            statement: md`Write \`func reflect_velocity(v: Vector2, n: Vector2, restitution: float) -> Vector2\` that keeps the tangent part of \`v\` and reverses the normal part scaled by \`restitution\` (1 is a mirror bounce, 0 is a slide). Then compute the result for $\mathbf{v} = (60, 80)$, $\mathbf{n} = (0, -1)$, restitution 0.5.`,
            solution: [
              md`\`\`\`gdscript
func reflect_velocity(v: Vector2, n: Vector2, restitution: float) -> Vector2:
    var into := v.dot(n)  # negative when moving into the surface
    if into >= 0.0:
        return v  # already moving away: leave it alone
    return v - (1.0 + restitution) * into * n
\`\`\``,
              md`For the numbers: $\mathbf{v}\cdot\mathbf{n} = -80$, so $\mathbf{v}' = (60, 80) - 1.5 \cdot (-80)(0, -1) = (60, 80) + (0, -120) = (60, -40)$.`,
              md`The guard against \`into >= 0\` matters: without it, a body that is already leaving the surface (for example after a previous frame's bounce) would be turned back into it.`,
            ],
            rubric: [md`Computes the normal component with a dot product`, md`Uses the factor $1 + e$`, md`Ignores velocities already moving away from the surface`, md`Gets $(60, -40)$`],
          },
        },
        {
          kind: 'recall',
          prompt: md`Write the slide and bounce formulas, and name the Godot methods for each.`,
          answer: md`Slide: $\mathbf{v} - (\mathbf{v}\cdot\mathbf{n})\mathbf{n}$, \`v.slide(n)\`. Bounce: $\mathbf{v} - 2(\mathbf{v}\cdot\mathbf{n})\mathbf{n}$, \`v.bounce(n)\`. Both need a unit normal.`,
        },
        {
          kind: 'explain',
          prompt: md`A teammate's line-of-sight check casts a ray from each enemy to Kai every physics frame, for 40 enemies. Suggest how to make it cheaper without changing what enemies notice.`,
          model: md`Order the tests by cost: distance first (squared, no square root), then the cone's dot product, and cast the ray only for the few enemies that pass both. Most enemies are out of range most of the time. Then spread the work: an enemy does not need fresh sight every 16.7 ms; checking every 6th frame (10 times a second), with enemies offset so the checks do not all land on the same frame, is unnoticeable to players. Keep the ray's mask to \`world\` and \`player\` so it never has to consider other enemies.`,
        },
      ],
      cards: [
        { id: 'm04-3-c1', kind: 'concept', front: md`What does a ray hit return in Godot, and when is \`intersect_ray\` allowed?`, back: md`A Dictionary with \`position\`, \`normal\`, \`collider\` (and \`collider_id\`, \`rid\`, \`shape\`), or empty. Call it during \`_physics_process\`, when the space is not locked.` },
        { id: 'm04-3-c2', kind: 'cloze', text: md`Target is inside a view cone of width $\varphi$ when \`facing.dot(dir) >= {{}}(deg_to_rad(fov / 2.0))\`.`, answers: ['cos'] },
        { id: 'm04-3-c3', kind: 'compute', front: md`In a side view, $\mathbf{v} = (3, 4)$ (falling, y grows downward) bounces off a floor with $\mathbf{n} = (0, -1)$. New $\mathbf{v}$?`, answer: { kind: 'vector', value: [3, -4] }, back: md`$\mathbf{v}\cdot\mathbf{n} = -4$, so $\mathbf{v} - 2(-4)(0, -1) = (3, 4) + (0, -8) = (3, -4)$: falling becomes rising at the same speed.` },
        { id: 'm04-3-c4', kind: 'concept', front: md`RayCast2D node or \`intersect_ray\` query: when each?`, back: md`Node: a persistent ray that follows its parent (interaction, ledge detection). Query: one-off or many dynamic rays (line of sight to each party member, swept shots).` },
        { id: 'm04-3-c5', kind: 'concept', front: md`Why does a bounced velocity keep its speed?`, back: md`The tangent and normal parts are perpendicular; bouncing only flips the sign of the normal part, so $|\mathbf{v}'|^2 = |\mathbf{v}_t|^2 + |\mathbf{v}_n|^2 = |\mathbf{v}|^2$.` },
      ],
    },
  ],
  problems: [
    {
      id: 'm04-p1',
      title: 'Push-out vector',
      type: 'compute',
      difficulty: 1,
      minutes: 5,
      statement: md`Box A is \`Rect2(40, 40, 16, 16)\` and box B is \`Rect2(52, 50, 20, 12)\`. Find the smallest translation of **A** that separates the boxes. Enter it as a vector.`,
      solution: [md`x: A spans 40 to 56, B spans 52 to 72, overlap $\min(56, 72) - \max(40, 52) = 4$. y: A spans 40 to 56, B 50 to 62, overlap $\min(56, 62) - \max(40, 50) = 6$.`, md`The x overlap is smaller. B is to the right of A, so A moves left by 4: $(-4, 0)$.`],
      answer: { kind: 'vector', value: [-4, 0] },
    },
    {
      id: 'm04-p2',
      title: 'Slime contact',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`A slime's contact circle is at $(100, 60)$ with radius 7; Kai's hurtbox circle is at $(110, 52)$ with radius 6. Do they overlap, and by how many pixels (penetration depth $r_a + r_b - d$)?`,
      solution: [md`$d^2 = 10^2 + 8^2 = 164$ and $(r_a + r_b)^2 = 169$, so $164 < 169$: they overlap.`, md`Depth: $13 - \sqrt{164} \approx 13 - 12.806 = 0.194$ px. A fifth of a pixel, so the contact is barely registered, which is why contact damage usually uses slightly generous shapes.`],
      answer: { kind: 'number', value: 13 - Math.sqrt(164) },
    },
    {
      id: 'm04-p3',
      title: 'Encode a mask',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`An enemy's sight ray should be blocked by \`world\`, see \`player\` and \`party\`, and ignore everything else. What integer is its \`collision_mask\`?`,
      solution: [md`Layers 1, 2, 3 have values 1, 2, 4.`, md`$1 + 2 + 4 = 7$.`],
      answer: { kind: 'number', value: 7 },
    },
    {
      id: 'm04-p4',
      title: 'Decode a mask',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`A node in a teammate's scene has \`collision_mask = 37\`. Which layer numbers does it scan? Enter them as a set.`,
      solution: [md`$37 = 32 + 4 + 1 = 2^5 + 2^2 + 2^0$.`, md`Bits 5, 2, 0 are layers 6, 3, 1: \`enemy_hitbox\`, \`party\`, \`world\`. That is an odd mix, worth asking about: something scanning enemy attacks and walls together is probably two jobs in one node.`],
      answer: { kind: 'set', value: [1, 3, 6] },
    },
    {
      id: 'm04-p5',
      title: 'Tunnelling budget',
      type: 'compute',
      difficulty: 2,
      minutes: 5,
      statement: md`Bram's shield bash launches enemies at up to 900 px/s as \`Area2D\`-checked projectiles with a 10 px box. Walls are at least 8 px thick. Physics runs at 60 Hz. What fraction of launched enemies could pass through a wall at full speed?`,
      solution: [md`Step $s = 900/60 = 15$ px; window $L = 8 + 10 = 18$ px.`, md`$s \le L$, so every launch hits: the fraction is 0. (Speeds up to $60 \cdot 18 = 1080$ px/s are safe.)`],
      answer: { kind: 'number', value: 0 },
    },
    {
      id: 'm04-p6',
      title: 'Bounce preserves speed',
      type: 'derive',
      difficulty: 2,
      minutes: 8,
      statement: md`Prove algebraically, without the perpendicular-parts argument, that $|\mathbf{v} - 2(\mathbf{v}\cdot\mathbf{n})\mathbf{n}| = |\mathbf{v}|$ for any unit vector $\mathbf{n}$.`,
      solution: [
        md`Let $k = \mathbf{v}\cdot\mathbf{n}$. Expand $|\mathbf{v} - 2k\mathbf{n}|^2 = \mathbf{v}\cdot\mathbf{v} - 4k\,(\mathbf{v}\cdot\mathbf{n}) + 4k^2\,(\mathbf{n}\cdot\mathbf{n})$.`,
        md`With $\mathbf{v}\cdot\mathbf{n} = k$ and $\mathbf{n}\cdot\mathbf{n} = 1$: $|\mathbf{v}|^2 - 4k^2 + 4k^2 = |\mathbf{v}|^2$.`,
        md`If $\mathbf{n}$ were not unit length the last term would be $4k^2|\mathbf{n}|^2$ and the speed would change: always normalize normals you compute yourself.`,
      ],
      rubric: [md`Expands the squared length with dot products`, md`Uses $\mathbf{n}\cdot\mathbf{n} = 1$ explicitly`, md`Notes the unit-length requirement`],
    },
    {
      id: 'm04-p7',
      title: 'The skeleton that sees too far',
      type: 'debug',
      difficulty: 2,
      minutes: 8,
      statement: md`This line-of-sight check lets skeletons spot Kai far off to their side when he is distant, but not when he is close at the same angle. Find the bug.

\`\`\`gdscript
func can_see(target: Node2D) -> bool:
    var to_target := target.global_position - global_position
    if to_target.length() > sight_range:
        return false
    if facing.dot(to_target) < cos(deg_to_rad(fov_degrees / 2.0)):
        return false
    var query := PhysicsRayQueryParameters2D.create(global_position, target.global_position, sight_mask)
    var hit := get_world_2d().direct_space_state.intersect_ray(query)
    return not hit.is_empty() and hit.collider == target
\`\`\``,
      hints: [md`What is the size of \`facing.dot(to_target)\` when Kai is 100 px away?`],
      solution: [md`\`to_target\` is not normalized, so the dot product is $|\mathbf{d}|\cos\theta$ and grows with distance. At 100 px, even $\theta = 80°$ gives $100 \cdot 0.17 = 17 > 0.64$, so the cone test passes. Close up, the same angle gives a small value and fails.`, md`Fix: \`facing.dot(to_target.normalized())\`, or compare \`facing.dot(to_target) >= cos_half * to_target.length()\`, which avoids the division.`],
      rubric: [md`Identifies the missing normalization`, md`Explains why the error grows with distance`, md`Gives a correct fix`],
    },
    {
      id: 'm04-p8',
      title: 'Pick the node',
      type: 'design',
      difficulty: 2,
      minutes: 10,
      statement: md`Choose a node type and a layer/mask setup (with layer names) for each: (a) a pressure plate that opens a door when Kai or a pushable crate stands on it; (b) a pushable crate; (c) arrows fired by a wall trap; (d) a lift that carries Kai between floors.`,
      solution: [
        md`(a) \`Area2D\`, layer 0, mask \`player\` (2) + \`world\` (1) = 3, because crates are on \`world\`. Keep its shape clear of walls, which are on \`world\` too. It only detects, so Kai walks onto it; count bodies in \`body_entered\`/\`body_exited\` and open the door while the count is above 0.`,
        md`(b) \`RigidBody2D\` on \`world\` (1), mask \`world\` + \`player\` + \`party\`, so walls stop it and characters can push it. Lock its rotation for a top-down game (\`lock_rotation\`).`,
        md`(c) An \`Area2D\` hitbox on \`enemy_hitbox\` (6) moved with a swept ray against \`world\`, or a \`CharacterBody2D\` with \`move_and_collide\`; party hurtboxes already scan layer 6.`,
        md`(d) \`AnimatableBody2D\` on \`world\`, moved by an \`AnimationPlayer\`, so it carries and pushes characters.`,
      ],
      rubric: [md`Area for the plate, rigid body for the crate, animatable body for the lift`, md`Arrows on \`enemy_hitbox\` so existing hurtboxes catch them`, md`Mentions tunnelling or sweeping for fast arrows`, md`Layer and mask choices are consistent with the course's table`],
    },
    {
      id: 'm04-p9',
      title: 'Circle against box',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 8,
      statement: md`Write \`func circle_hits_rect(center: Vector2, radius: float, rect: Rect2) -> bool\` without square roots, then evaluate it for center $(30, 10)$, radius 6 and \`Rect2(0, 12, 24, 24)\`.`,
      solution: [
        md`\`\`\`gdscript
func circle_hits_rect(center: Vector2, radius: float, rect: Rect2) -> bool:
    var closest := center.clamp(rect.position, rect.end)
    return center.distance_squared_to(closest) < radius * radius
\`\`\``,
        md`The rectangle spans x 0 to 24, y 12 to 36. Clamping $(30, 10)$ gives $(24, 12)$, the top-right corner.`,
        md`Squared distance $6^2 + 2^2 = 40$, against $r^2 = 36$: $40 > 36$, so **false**. The circle is beside the corner, close but not touching, a case a box-against-box test with the circle's bounding box would have reported as a hit.`,
      ],
      rubric: [md`Uses clamp to find the closest point`, md`Compares squared distances`, md`Evaluates the example correctly (false)`],
    },
    {
      id: 'm04-p10',
      title: 'Why the body does not tunnel',
      type: 'concept',
      difficulty: 2,
      minutes: 5,
      statement: md`An Area2D shot at 900 px/s passes through a 4 px wall about half the time, while a CharacterBody2D shot at the same speed with \`move_and_collide\` never does. Explain the difference.`,
      solution: [md`The Area2D is moved by setting its position, so the physics engine only sees it at each frame's position and tests overlap there. Positions 15 px apart can straddle an 8 px window.`, md`\`move_and_collide\` casts the body's shape along the whole motion vector and stops it at the first time of contact, a swept test, so any wall crossing the path is found regardless of thickness.`],
      rubric: [md`Distinguishes teleport-and-test from a swept test`, md`Relates the miss to step size versus wall plus shot width`],
    },
  ],
};
