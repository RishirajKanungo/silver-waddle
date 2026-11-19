import { md, gd, type Module } from '../types';

// ------------------------------------------------------------------------------------ k02-1 listings
const AI_V1 = gd`
class_name AIController
extends Node
## Fills the parent Character's intent from what it perceives, exactly where a PlayerController
## would fill it from the gamepad. A small enum state machine (the brain) decides what to want;
## the Character's own states (Idle, Move, Attack, Hurt) carry it out.

enum Brain { IDLE, PATROL, CHASE, ATTACK, RECOVER }

## Only walls (layer 1, world) block sight.
const WORLD_MASK := 1

## How far the enemy can see, px.
@export var sight_range := 96.0
## Full width of the vision cone, degrees.
@export_range(10.0, 360.0) var sight_angle := 90.0
## Moving targets closer than this are heard from any direction, px.
@export var hearing_radius := 40.0
@export var attack_range := 22.0
## Seconds the enemy keeps hunting the last known position after losing the target.
@export var memory_time := 3.0
@export var idle_time := 1.5
@export var recover_time := 0.6
## Fraction of max_speed while chasing (patrols walk at half speed).
@export var chase_speed := 1.0
## Marker2D nodes in the level to walk between.
@export var patrol_points: Array[Marker2D] = []

var brain := Brain.IDLE
var target: Character
## Where the target was last seen or heard.
var last_seen := Vector2.ZERO
## True on ticks when the target is seen or heard right now.
var senses_target := false
var _since_sensed := INF
var _brain_time := 0.0
var _patrol_index := 0

@onready var character: Character = get_parent()


func _ready() -> void:
    target = get_tree().get_first_node_in_group("player") as Character
    # The Character is not ready yet (children first), so its @onready state_machine is still null.
    # The node itself exists, so fetch it by path.
    var machine := character.get_node("StateMachine") as StateMachine
    machine.state_changed.connect(_on_state_changed)


func _physics_process(delta: float) -> void:
    _brain_time += delta
    _perceive(delta)
    var intent := character.intent
    intent.move = Vector2.ZERO
    match brain:
        Brain.IDLE:
            if _aware():
                _set_brain(Brain.CHASE)
            elif _brain_time >= idle_time and not patrol_points.is_empty():
                _set_brain(Brain.PATROL)
        Brain.PATROL:
            if _aware():
                _set_brain(Brain.CHASE)
                return
            var point := patrol_points[_patrol_index].global_position
            if character.global_position.distance_to(point) < 4.0:
                _patrol_index = (_patrol_index + 1) % patrol_points.size()
                _set_brain(Brain.IDLE)
            else:
                _move_toward(point, 0.5)
        Brain.CHASE:
            if not _aware():
                _set_brain(Brain.IDLE)  # memory ran out: give up
                return
            var to_target := target.global_position - character.global_position
            if senses_target and to_target.length() <= attack_range:
                intent.move = to_target.normalized()  # Attack.enter() aims along intent.move
                intent.wants_attack = true
                _set_brain(Brain.ATTACK)
            elif character.global_position.distance_to(last_seen) > 4.0:
                _move_toward(last_seen, chase_speed)
            # Otherwise: standing where the target was last seen, waiting for memory to run out.
        Brain.ATTACK:
            # The Attack state is running; _on_state_changed moves on when it ends. If the request
            # was never acted on (the enemy was in Hurt), drop it after a second.
            if _brain_time > 1.0 and character.state_machine.current.name != &"Attack":
                intent.wants_attack = false
                _set_brain(Brain.RECOVER)
        Brain.RECOVER:
            if _brain_time >= recover_time:
                _set_brain(Brain.CHASE)


func can_see(point: Vector2) -> bool:
    var to_point := point - character.global_position
    if to_point.length() > sight_range:
        return false
    # Inside the cone: the angle to the point is at most half the cone width, which for unit
    # vectors is the same as dot >= cos(half angle). No acos, no angle wrapping.
    if character.facing_vector.dot(to_point.normalized()) < cos(deg_to_rad(sight_angle / 2.0)):
        return false
    # Line of sight: a ray against the world layer must reach the point without hitting a wall.
    var query := PhysicsRayQueryParameters2D.create(character.global_position, point, WORLD_MASK)
    return character.get_world_2d().direct_space_state.intersect_ray(query).is_empty()


func can_hear(other: Character) -> bool:
    # Only a moving target makes noise: standing still behind an enemy is safe.
    var close := character.global_position.distance_to(other.global_position) <= hearing_radius
    return close and other.velocity.length() > 20.0


func _perceive(delta: float) -> void:
    _since_sensed += delta
    senses_target = target != null and (can_see(target.global_position) or can_hear(target))
    if senses_target:
        last_seen = target.global_position
        _since_sensed = 0.0


func _aware() -> bool:
    return _since_sensed <= memory_time


func _move_toward(point: Vector2, speed_scale: float) -> void:
    character.intent.move = character.global_position.direction_to(point) * speed_scale


func _set_brain(next: Brain) -> void:
    brain = next
    _brain_time = 0.0


func _on_state_changed(previous: StringName, _current: StringName) -> void:
    # The swing ended (or a hit interrupted it): recover before deciding again.
    if previous == &"Attack" and brain == Brain.ATTACK:
        _set_brain(Brain.RECOVER)
`;

const BRAIN_LABEL = gd`
extends Label
## Debug: shows an AIController's brain state above the enemy. Delete it before release.

@export var ai: AIController


func _physics_process(_delta: float) -> void:
    text = AIController.Brain.keys()[ai.brain]
    modulate = Color.ORANGE_RED if ai.senses_target else Color.WHITE
`;

// ------------------------------------------------------------------------------------ k02-2 listings
const STEERING = gd`
class_name Steering
extends RefCounted
## Steering behaviours as pure functions. Each returns a desired direction of length 0 to 1, ready
## to write into intent.move. Character.move_with_intent then accelerates toward it, which plays
## the role of the "steering force" in the classic formulation, capped at the acceleration.


static func seek(from: Vector2, to: Vector2) -> Vector2:
    return from.direction_to(to)


static func flee(from: Vector2, threat: Vector2) -> Vector2:
    return threat.direction_to(from)


## Like seek, but slows down linearly inside slow_radius and stops on the target.
static func arrive(from: Vector2, to: Vector2, slow_radius: float) -> Vector2:
    var offset := to - from
    var distance := offset.length()
    if distance < 1.0:
        return Vector2.ZERO
    return offset / distance * minf(distance / slow_radius, 1.0)


## Push away from neighbours closer than radius, harder the closer they are.
static func separation(from: Vector2, neighbours: Array[Vector2], radius: float) -> Vector2:
    var push := Vector2.ZERO
    for other in neighbours:
        var away := from - other
        var distance := away.length()
        if distance > 0.0 and distance < radius:
            push += away / distance * (1.0 - distance / radius)
    return push.limit_length(1.0)
`;

const NAV_MOVE = gd`
@export var nav_agent: NavigationAgent2D
## Ask for a new path at most this often (s), or when the goal moves more than a tile.
@export var repath_interval := 0.25
## Neighbours closer than this push each other apart, px.
@export var separation_radius := 18.0

var _repath_left := 0.0


func _move_toward(point: Vector2, speed_scale: float) -> void:
    _repath_left -= get_physics_process_delta_time()
    if _repath_left <= 0.0 or nav_agent.target_position.distance_to(point) > 16.0:
        nav_agent.target_position = point
        _repath_left = repath_interval
    if nav_agent.is_navigation_finished():
        return
    var next := nav_agent.get_next_path_position()
    var desired := Steering.seek(character.global_position, next) * speed_scale
    desired += Steering.separation(character.global_position, _neighbours(), separation_radius) * 0.7
    character.intent.move = desired.limit_length(1.0)


func _neighbours() -> Array[Vector2]:
    var out: Array[Vector2] = []
    for node in get_tree().get_nodes_in_group("enemies"):
        if node != character:
            out.append((node as Node2D).global_position)
    return out
`;

const AI_V2 = gd`
class_name AIController
extends Node
## Perception, a brain, and movement along navigation paths with separation (k02-2).

enum Brain { IDLE, PATROL, CHASE, ATTACK, RECOVER }

const WORLD_MASK := 1

@export var sight_range := 96.0
@export_range(10.0, 360.0) var sight_angle := 90.0
@export var hearing_radius := 40.0
@export var attack_range := 22.0
@export var memory_time := 3.0
@export var idle_time := 1.5
@export var recover_time := 0.6
@export var chase_speed := 1.0
@export var patrol_points: Array[Marker2D] = []
@export var nav_agent: NavigationAgent2D
@export var repath_interval := 0.25
@export var separation_radius := 18.0

var brain := Brain.IDLE
var target: Character
var last_seen := Vector2.ZERO
var senses_target := false
var _since_sensed := INF
var _brain_time := 0.0
var _patrol_index := 0
var _repath_left := 0.0

@onready var character: Character = get_parent()


func _ready() -> void:
    target = get_tree().get_first_node_in_group("player") as Character
    var machine := character.get_node("StateMachine") as StateMachine
    machine.state_changed.connect(_on_state_changed)


func _physics_process(delta: float) -> void:
    _brain_time += delta
    _perceive(delta)
    var intent := character.intent
    intent.move = Vector2.ZERO
    match brain:
        Brain.IDLE:
            if _aware():
                _set_brain(Brain.CHASE)
            elif _brain_time >= idle_time and not patrol_points.is_empty():
                _set_brain(Brain.PATROL)
        Brain.PATROL:
            if _aware():
                _set_brain(Brain.CHASE)
                return
            var point := patrol_points[_patrol_index].global_position
            if character.global_position.distance_to(point) < 6.0:
                _patrol_index = (_patrol_index + 1) % patrol_points.size()
                _set_brain(Brain.IDLE)
            else:
                _move_toward(point, 0.5)
        Brain.CHASE:
            if not _aware():
                _set_brain(Brain.IDLE)
                return
            var to_target := target.global_position - character.global_position
            if senses_target and to_target.length() <= attack_range:
                intent.move = to_target.normalized()
                intent.wants_attack = true
                _set_brain(Brain.ATTACK)
            elif character.global_position.distance_to(last_seen) > 6.0:
                _move_toward(last_seen, chase_speed)
        Brain.ATTACK:
            if _brain_time > 1.0 and character.state_machine.current.name != &"Attack":
                intent.wants_attack = false
                _set_brain(Brain.RECOVER)
        Brain.RECOVER:
            if _brain_time >= recover_time:
                _set_brain(Brain.CHASE)


func can_see(point: Vector2) -> bool:
    var to_point := point - character.global_position
    if to_point.length() > sight_range:
        return false
    if character.facing_vector.dot(to_point.normalized()) < cos(deg_to_rad(sight_angle / 2.0)):
        return false
    var query := PhysicsRayQueryParameters2D.create(character.global_position, point, WORLD_MASK)
    return character.get_world_2d().direct_space_state.intersect_ray(query).is_empty()


func can_hear(other: Character) -> bool:
    var close := character.global_position.distance_to(other.global_position) <= hearing_radius
    return close and other.velocity.length() > 20.0


func _perceive(delta: float) -> void:
    _since_sensed += delta
    senses_target = target != null and (can_see(target.global_position) or can_hear(target))
    if senses_target:
        last_seen = target.global_position
        _since_sensed = 0.0


func _aware() -> bool:
    return _since_sensed <= memory_time


func _move_toward(point: Vector2, speed_scale: float) -> void:
    _repath_left -= get_physics_process_delta_time()
    if _repath_left <= 0.0 or nav_agent.target_position.distance_to(point) > 16.0:
        nav_agent.target_position = point
        _repath_left = repath_interval
    if nav_agent.is_navigation_finished():
        return
    var next := nav_agent.get_next_path_position()
    var desired := Steering.seek(character.global_position, next) * speed_scale
    desired += Steering.separation(character.global_position, _neighbours(), separation_radius) * 0.7
    character.intent.move = desired.limit_length(1.0)


func _neighbours() -> Array[Vector2]:
    var out: Array[Vector2] = []
    for node in get_tree().get_nodes_in_group("enemies"):
        if node != character:
            out.append((node as Node2D).global_position)
    return out


func _set_brain(next: Brain) -> void:
    brain = next
    _brain_time = 0.0


func _on_state_changed(previous: StringName, _current: StringName) -> void:
    if previous == &"Attack" and brain == Brain.ATTACK:
        _set_brain(Brain.RECOVER)
`;

// ------------------------------------------------------------------------------------ k02-3 listings
const TOKENS = gd`
class_name AttackTokens
extends Node
## Lets only max_tokens enemies attack the player at once. One per level, in group "attack_tokens".

@export var max_tokens := 2

var _holders: Array[Node] = []


## True if enemy may attack now. An enemy that already holds a token keeps it.
func request(enemy: Node) -> bool:
    if enemy in _holders:
        return true
    if _holders.size() >= max_tokens:
        return false
    _holders.append(enemy)
    return true


func release(enemy: Node) -> void:
    _holders.erase(enemy)


func holders() -> int:
    return _holders.size()
`;

const TOKEN_CHASE = gd`
@export var orbit_radius := 44.0

@onready var tokens: AttackTokens = get_tree().get_first_node_in_group("attack_tokens")


# In _physics_process, the CHASE branch becomes:
#     Brain.CHASE:
#         if not _aware():
#             _set_brain(Brain.IDLE)
#             return
#         var to_target := target.global_position - character.global_position
#         if senses_target and to_target.length() <= orbit_radius + 8.0 and not tokens.request(character):
#             _orbit(to_target)
#         elif senses_target and to_target.length() <= attack_range:
#             ...attack exactly as before
#         elif character.global_position.distance_to(last_seen) > 6.0:
#             _move_toward(last_seen, chase_speed)
# and RECOVER calls tokens.release(character) when it ends.


## Without a token: hold a ring around the target and drift sideways, facing it.
func _orbit(to_target: Vector2) -> void:
    var distance := to_target.length()
    var radial := to_target / distance * clampf((distance - orbit_radius) / 16.0, -1.0, 1.0)
    var tangent := to_target.orthogonal().normalized() * 0.4
    character.intent.move = (radial + tangent).limit_length(0.6)


func _exit_tree() -> void:
    # A token holder that dies or leaves the level must give its token back.
    if tokens:
        tokens.release(character)
`;

const BOSS_PHASE = gd`
class_name BossPhase
extends Resource
## One phase of a boss fight. It starts when the boss's health falls to hp_fraction or below.

@export_range(0.0, 1.0) var hp_fraction := 1.0
## The Attack state's combo for this phase.
@export var combo: Array[AttackData] = []
## AIController.chase_speed in this phase.
@export var chase_speed := 0.6
## AIController.recover_time in this phase: the opening the player gets after each attack.
@export var recover_time := 1.2
`;

const BOSS_PHASES = gd`
class_name BossPhases
extends Node
## Switches a boss between phases as its health drops. A component: the golem's AIController,
## Attack state and HealthComponent are the ordinary ones; this node only reconfigures them.

signal phase_changed(index: int)

@export var phases: Array[BossPhase] = []
@export var health: HealthComponent
@export var attack_state: AttackState
@export var brain: AIController

var phase := 0


func _ready() -> void:
    health.health_changed.connect(_on_health_changed)
    _apply(0)


func _on_health_changed(current: int, maximum: int) -> void:
    var fraction := float(current) / maximum
    # while, not if: one big hit can cross two thresholds, and every phase must still begin.
    # Phases only go forward, so healing the boss never replays a transition.
    while phase + 1 < phases.size() and fraction <= phases[phase + 1].hp_fraction:
        phase += 1
        _apply(phase)
        phase_changed.emit(phase)


func _apply(index: int) -> void:
    var p := phases[index]
    attack_state.combo = p.combo
    brain.chase_speed = p.chase_speed
    brain.recover_time = p.recover_time
`;

export const MODULE: Module = {
  id: 'k02',
  part: 'combat',
  order: 2,
  title: 'Enemy AI',
  summary: 'Perception with vision cones, line of sight, hearing and memory; AI brains as state machines that write the same intent as the player; steering and NavigationAgent2D pathfinding; readable telegraphs, attack tokens for crowds, and a golem boss with phases driven by health thresholds.',
  relevance: md`Shardbound's slimes, bats, skeletons and the golem are \`Character\`s with an \`AIController\` instead of a \`PlayerController\`: they reuse Kai's states, components and hit feedback, and only the brain is new. The same controller drives Lyra and Bram when you are not controlling them (k05). Fair, readable enemies are also what makes the ATB layer work: you can only plan in tactical mode if you can see what each enemy is about to do.`,
  prereqs: ['c05', 'm04'],
  areas: ['combat', 'math', 'systems'],
  lessons: [
    // =============================================================================== k02-1
    {
      id: 'k02-1',
      title: 'Perception and the AI brain',
      minutes: 45,
      objectives: [
        'Test whether a target is inside a vision cone with one dot product and a precomputed cosine.',
        'Check line of sight with a ray query against the world layer only.',
        'Give an enemy hearing and a memory of the last position where it sensed the target.',
        'Write an AIController whose idle/patrol/chase/attack/recover brain fills the same intent as the PlayerController.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A good enemy is mostly a good *observer*. Players forgive a skeleton that is slow or dim, but not one that sees through walls, notices them from behind across the room, or forgets them the instant they step behind a pillar. The opposite also fails: an enemy that never notices you until you stab it is furniture.

So before deciding what to do, an enemy needs perception that matches what the player can see on screen:

- **Vision**: a cone in front of it, limited by range and blocked by walls.
- **Hearing**: anything moving close enough, from any direction.
- **Memory**: after losing the player, keep going to where it last sensed them for a few seconds.

Then a small state machine (the **brain**) turns perception into wishes, and writes them into the intent. Everything below the intent (walking, swinging, getting hurt) is already built: it is the Character from c05.`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'Brain and body',
          md: md`An enemy has two state machines on purpose. The **body** (the Character's \`StateMachine\`: Idle, Move, Attack, Hurt, Dead) decides what is *physically possible*: a skeleton in Hurt cannot swing. The **brain** (inside the \`AIController\`) decides what the enemy *wants*: chase, attack, back off. The brain only writes intent; the body may ignore it. This is why the same Attack state with its frame data, cancel rules and hitbox works for Kai and for every enemy.`,
        },
        {
          kind: 'derive',
          title: 'the vision cone test',
          goal: md`A skeleton at the origin faces $\hat{\mathbf f}$ (a unit vector) with a cone of total width $\theta$. Find a test for "target $\mathbf p$ is inside the cone" without computing any angle.`,
          steps: [
            {
              md: md`The target is inside if the angle $\alpha$ between $\hat{\mathbf f}$ and $\mathbf p$ is at most $\theta/2$. For unit vectors the dot product is the cosine of that angle: $\hat{\mathbf f} \cdot \hat{\mathbf p} = \cos\alpha$, with $\hat{\mathbf p} = \mathbf p/|\mathbf p|$.`,
              choose: {
                prompt: md`For $\alpha$ between $0$ and $180°$, cosine is...`,
                options: [md`decreasing: a smaller angle gives a larger cosine`, md`increasing`, md`not monotonic`],
                answer: 0,
                explain: md`$\cos 0 = 1$, $\cos 90° = 0$, $\cos 180° = -1$, falling all the way.`,
              },
            },
            {
              md: md`Because cosine decreases, $\alpha \le \theta/2 \iff \cos\alpha \ge \cos(\theta/2)$. The test is $$\hat{\mathbf f} \cdot \hat{\mathbf p} \ \ge\ \cos(\theta/2).$$ $\cos(\theta/2)$ is a constant per enemy, so the test costs one normalization and one dot product, with no \`acos\` and no angle wrapping at $\pm 180°$.`,
            },
            {
              md: md`Example: $\theta = 90°$, so the threshold is $\cos 45° \approx 0.707$. Facing right, $\hat{\mathbf f} = (1, 0)$; the player at $(30, 20)$ has $\hat{\mathbf p} \approx (0.832, 0.555)$; the dot product is $0.832 \ge 0.707$: seen.`,
              choose: {
                prompt: md`What does a cone of $\theta = 360°$ give as the threshold?`,
                options: [md`$\cos 180° = -1$: every direction passes`, md`$\cos 360° = 1$: nothing passes`, md`0: the front half passes`],
                answer: 0,
                explain: md`The half angle is $180°$, and every dot product of unit vectors is at least $-1$, so the enemy sees all around (limited only by range and walls).`,
              },
            },
          ],
          takeaway: md`In the cone $\iff \hat{\mathbf f}\cdot\hat{\mathbf p} \ge \cos(\theta/2)$. Check range first (cheap), then the cone, then the ray (most expensive).`,
        },
        {
          kind: 'numeric',
          q: md`A bat faces up, $\hat{\mathbf f} = (0, -1)$ (y grows downward), with a 120° cone. The player is at offset $(40, -30)$ from it. Enter the dot product $\hat{\mathbf f} \cdot \hat{\mathbf p}$ and the threshold $\cos 60°$.`,
          answer: { kind: 'vector', value: [0.6, 0.5] },
          inputHint: 'dot, threshold',
          explain: md`$|\mathbf p| = 50$, $\hat{\mathbf p} = (0.8, -0.6)$, dot $= 0 \cdot 0.8 + (-1)(-0.6) = 0.6$. Threshold $\cos 60° = 0.5$. $0.6 \ge 0.5$, so the bat sees the player.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'Ray queries',
          md: md`\`get_world_2d().direct_space_state\` is the physics world you can query directly, at any time during physics processing. \`PhysicsRayQueryParameters2D.create(from, to, mask)\` describes a ray; \`intersect_ray(query)\` returns a Dictionary with the first hit (\`position\`, \`collider\`, \`normal\`) or an empty one if nothing on the mask is in the way. With the mask set to layer 1 (\`world\`) only, the ray ignores the player's and enemies' bodies, so "empty" means "no wall between us". A \`RayCast2D\` node does the same continuously; a query is better when you need it for one specific target only when range and cone already passed.`,
        },
        {
          kind: 'viz',
          viz: { type: 'combat.ai', mode: 'perception' },
          task: md`Walk Kai around the patrolling skeleton. Stand behind it, then walk slowly up behind it: when does it notice? Break line of sight behind a pillar during a chase and watch the memory marker and timer. Shrink the cone to 40° and widen it to 200°.`,
          caption: md`Yellow cone: vision (range and angle). Dashed circle: hearing, which only triggers when Kai moves faster than 20 px/s. The line to Kai is the ray: green when clear, red when a wall blocks it. The cross is \`last_seen\`; the label above the skeleton is its brain state.`,
        },
        { kind: 'code', file: 'scripts/ai/ai_controller.gd', code: AI_V1, note: md`\`@export_range(10.0, 360.0)\` shows a slider in the Inspector. \`get_first_node_in_group("player")\` finds Kai without wiring: add him to the group in **Node → Groups**. The brain uses \`_brain_time\` exactly like c05-1's \`_time_in_state\`.` },
        {
          kind: 'check',
          q: md`Why does \`_ready()\` fetch the StateMachine with \`character.get_node("StateMachine")\` instead of using \`character.state_machine\`?`,
          options: [
            md`The AIController is a child of the Character, so its \`_ready()\` runs before the Character's: \`character.state_machine\` is an \`@onready\` variable that is still null.`,
            md`\`state_machine\` is private to Character.`,
            md`\`get_node\` is faster.`,
            md`The StateMachine is not a child of the Character.`,
          ],
          answer: 0,
          explain: md`c05-2's ready order again: children first. The node exists (it was created with the scene), only the variable pointing at it is not set yet. Fetching by path works; so would connecting later.`,
        },
        {
          kind: 'text',
          md: md`### Reading the brain

| Brain | Wants | Leaves when |
|---|---|---|
| IDLE | nothing | aware → CHASE; after \`idle_time\` with patrol points → PATROL |
| PATROL | walk to the next point at half speed | aware → CHASE; arrived → IDLE |
| CHASE | walk to \`last_seen\` | memory ran out → IDLE; senses the target in range → ATTACK |
| ATTACK | one \`wants_attack\` | the body leaves Attack → RECOVER |
| RECOVER | stand still | \`recover_time\` elapsed → CHASE |

RECOVER is the enemy's version of recovery frames: after each swing it stands still for 0.6 s, which is the player's window to hit back. Without it the skeleton attacks back to back and the fight has no rhythm.`,
        },
        {
          kind: 'steps',
          title: 'Make a skeleton that hunts',
          steps: [
            md`Duplicate \`player.tscn\` as \`scenes/enemies/skeleton.tscn\`. Replace the sprite frames with the skeleton's (\`assets/enemies/skeleton.png\`: \`idle\`, \`walk\`, \`windup\`, \`attack\`, \`hurt\`, \`die\`). Set the root's *Max Speed* to 60.`,
            md`Delete \`PlayerController\` and add a \`Node\` named \`AIController\` with \`scripts/ai/ai_controller.gd\` in its place (above the StateMachine). Remove Dash from the StateMachine; skeletons do not dodge.`,
            md`Put the root on layer 4 (\`enemy\`) with mask 1 (\`world\`). Set the Hurtbox mask to layer 5 and the hitbox's layer to 6. Add the root to the group \`enemies\`, and Kai's root to the group \`player\`.`,
            md`Add a \`Label\` above the skeleton with \`brain_label.gd\` (below) and drag the AIController into its export.`,
            md`In the test room add two \`Marker2D\`s and drag them into *Patrol Points*. Instance the skeleton and run.`,
          ],
          result: md`The skeleton walks between the markers at half speed with PATROL above it. When Kai walks into its cone it switches to CHASE and follows; next to Kai it swings and then pauses (RECOVER). Behind a wall it walks to where it last saw Kai, waits, and returns to IDLE after 3 seconds.`,
          troubleshoot: [
            { problem: md`The skeleton sees Kai through walls.`, fix: md`The ray mask includes something other than walls, or the walls are not on layer 1. Print \`intersect_ray(query)\` to see what it hits; with \`WORLD_MASK = 1\` only layer-1 colliders count.` },
            { problem: md`It never sees Kai even in front of it.`, fix: md`The ray hits the skeleton's own body or Kai's body: both must be off layer 1. Or \`target\` is null because Kai is not in the \`player\` group.` },
            { problem: md`It turns to face Kai only after it starts moving.`, fix: md`That is correct with this code: facing comes from the Move state. For an enemy that turns on hearing, call \`character.face(to_target)\` in IDLE when \`senses_target\` is true.` },
          ],
        },
        { kind: 'code', file: 'scripts/debug/brain_label.gd', code: BRAIN_LABEL, note: md`\`Brain.keys()\` returns the enum names; indexing it with the current value gives "CHASE" and so on.` },
        {
          kind: 'build',
          ch: {
            id: 'k02-1-build',
            title: 'Stealth rules',
            goal: md`Tune and extend the skeleton so a careful player can sneak past it and a careless one cannot.`,
            requirements: [
              md`Walking slowly (hold a modifier so Kai moves at 15 px/s) behind the skeleton within 40 px does not alert it; walking or dashing at full speed does.`,
              md`A skeleton that loses sight walks to \`last_seen\`, looks around (turns left and right twice, 0.5 s each), then returns to its patrol.`,
              md`When it first notices Kai it stops for 0.4 s and shows a \`!\` label before chasing, so the player sees the moment of detection.`,
              md`The brain label turns orange only on ticks where the skeleton senses Kai.`,
            ],
            hints: [
              md`For the slow walk, add a \`walk_slow\` action and multiply \`intent.move\` by 0.17 in the PlayerController while it is held; \`can_hear\` already ignores velocities under 20 px/s.`,
              md`Looking around is a new brain state, SEARCH, entered from CHASE on arrival at \`last_seen\`. In it, call \`character.face(Vector2.LEFT)\` and \`Vector2.RIGHT\` on a timer; the vision cone follows \`facing_vector\`, so turning really searches.`,
              md`The detection pause is a brain state too (ALERT): it sets nothing for 0.4 s, then goes to CHASE.`,
            ],
            solution: [{ file: 'scripts/ai/ai_controller.gd', code: AI_V1 }],
            explain: md`The reference solution is the lesson's controller; the requirements are each one new brain state or one condition. That is the point of the enum brain: SEARCH and ALERT are rows in the table above, not new flags in every branch. Telegraphing detection with a pause and a \`!\` label is the same idea as telegraphing an attack (k02-3): the player should always see *why* an enemy changed behaviour.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'k02-1-paper',
            title: 'Cone or no cone',
            type: 'compute',
            difficulty: 2,
            minutes: 6,
            statement: md`A skeleton faces $\hat{\mathbf f} = (0.6, 0.8)$ with \`sight_angle\` 100° and \`sight_range\` 96. The player is at offset $(-20, 70)$. Is the player in range and in the cone? Enter the distance and the dot product $\hat{\mathbf f}\cdot\hat{\mathbf p}$ (three decimals).`,
            solution: [
              md`Distance $\sqrt{400 + 4900} = \sqrt{5300} \approx 72.80 < 96$: in range.`,
              md`$\hat{\mathbf p} = (-20, 70)/72.80 \approx (-0.2747, 0.9615)$. Dot $= 0.6(-0.2747) + 0.8(0.9615) \approx 0.604$.`,
              md`Threshold $\cos 50° \approx 0.643$. $0.604 < 0.643$: just outside the cone. A ray query is not needed.`,
            ],
            answer: { kind: 'vector', value: [72.801, 0.604], tol: 1e-3 },
            areas: ['math', 'combat'],
          },
        },
        {
          kind: 'recall',
          prompt: md`List the three perception checks in the order the code does them, and say why that order.`,
          answer: md`Range (one length), cone (one dot product against a precomputed cosine), line of sight (a physics ray query against the world layer). Cheapest first: most targets fail range or cone, so the expensive ray is rarely cast.`,
        },
        {
          kind: 'explain',
          prompt: md`Why does the AIController write intent rather than moving the skeleton directly?`,
          model: md`Because the body's rules then apply to the AI too: a skeleton in Hurt or mid-swing cannot move or attack, with no extra checks in the brain. The skeleton gets acceleration, friction, facing, frame data, hitboxes and hit feedback from the same states as Kai, so tuning and bug fixes are shared. And control can switch: k05 puts an AIController on Lyra when the player controls Kai, with no change to Lyra's states.`,
        },
      ],
      cards: [
        { id: 'k02-1-c1', kind: 'concept', front: md`Vision cone test without angles?`, back: md`$\hat{\mathbf f}\cdot\hat{\mathbf p} \ge \cos(\theta/2)$, with $\hat{\mathbf f}$ the facing, $\hat{\mathbf p}$ the normalized offset to the target and $\theta$ the full cone width.` },
        { id: 'k02-1-c2', kind: 'compute', front: md`Threshold $\cos(\theta/2)$ for a 90° cone (3 decimals)?`, answer: { kind: 'number', value: 0.70711, tol: 1e-3 }, back: md`$\cos 45° = \sqrt2/2 \approx 0.707$.` },
        { id: 'k02-1-c3', kind: 'cloze', text: md`Line of sight: \`get_world_2d().direct_space_state.{{}}(query)\` returns an empty Dictionary when nothing blocks the ray.`, answers: ['intersect_ray'] },
        { id: 'k02-1-c4', kind: 'concept', front: md`Brain versus body in an enemy?`, back: md`Brain (AIController): what the enemy wants, written into intent. Body (Character's StateMachine): what is physically possible; it may ignore the intent (in Hurt, mid-swing).` },
        { id: 'k02-1-c5', kind: 'concept', front: md`What does memory (\`last_seen\`, \`memory_time\`) add to an enemy?`, back: md`After losing the target it keeps hunting the last known position for a few seconds, so breaking line of sight does not instantly reset it, and hiding works only if you move away.` },
      ],
    },
    // =============================================================================== k02-2
    {
      id: 'k02-2',
      title: 'Steering and pathfinding',
      minutes: 45,
      objectives: [
        'Write seek, flee, arrive and separation as functions that return a desired direction.',
        'Choose an arrive slow radius from the stopping distance $v^2/2a$.',
        'Bake a NavigationRegion2D over a tile room and follow a NavigationAgent2D path with get_next_path_position.',
        'Keep a crowd apart with separation or the navigation server\'s avoidance, and limit how often paths are recomputed.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`k02-1's skeleton walks straight at \`last_seen\`. In an open field that is fine. In a dungeon it walks into the first pillar and grinds against it, and four skeletons chasing Kai merge into one clump that attacks as a single blob.

Two separate problems, two separate tools:

- **Steering** decides the direction for the next few frames from nearby things: go toward this point, slow down as you arrive, keep away from your neighbours.
- **Pathfinding** decides the route around walls: a list of waypoints through the walkable area. Godot's \`NavigationAgent2D\` computes it; steering then follows the next waypoint.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Steering behaviours',
          md: md`A **steering behaviour** maps the agent's situation to a **desired velocity**. **Seek**: full speed toward a point. **Flee**: full speed away from it. **Arrive**: like seek, but the desired speed falls linearly to zero inside a *slow radius*, so the agent stops on the point instead of overshooting. **Separation**: away from neighbours closer than a radius, harder the closer they are. Behaviours are combined by adding their outputs with weights. The classic formulation then applies a *steering force* = desired − current velocity, capped by a maximum; in this course \`Character.move_with_intent\` does that already, with \`acceleration\` as the cap.`,
        },
        {
          kind: 'viz',
          viz: { type: 'combat.ai_steer' },
          task: md`Move Kai around with each behaviour selected. With **arrive**, set the slow radius to 2 px and watch the slimes overshoot and jitter; raise it until they stop cleanly. Then turn **separation** off and on while they arrive.`,
          caption: md`The arrows on the highlighted slime are its desired velocity (blue) and the steering it applies, desired minus current (orange). The ring is the slow radius around Kai.`,
        },
        { kind: 'code', file: 'scripts/ai/steering.gd', code: STEERING, note: md`Static functions are called on the class: \`Steering.arrive(a, b, 24.0)\`. They take positions and return directions, so they are easy to test and to show in a figure. \`limit_length(1.0)\` keeps the result a valid \`intent.move\`.` },
        {
          kind: 'derive',
          title: 'choosing the slow radius',
          goal: md`An agent with top speed $v$ and acceleration $a$ arrives at a point using a slow radius $r$. Find the smallest $r$ that lets it stop without overshooting.`,
          steps: [
            {
              md: md`From c02, braking from speed $v$ at deceleration $a$ takes distance $d = v^2/(2a)$. If the agent starts braking later than that, it overshoots.`,
            },
            {
              md: md`Inside the slow radius the *desired* speed is $v\,d/r$, which drops as the agent gets closer. The agent can follow that drop only if the desired speed falls no faster than it can decelerate; starting to slow down at distance $r$ needs at least the braking distance: $r \ge v^2/(2a)$.`,
              choose: {
                prompt: md`A slime with $v = 60$ px/s and $a = 900$ px/s². Minimum slow radius?`,
                options: [md`2 px`, md`60 px`, md`0.07 px`],
                answer: 0,
                explain: md`$60^2/1800 = 2$ px.`,
              },
            },
            {
              md: md`That is a lower bound. Linear slowdown over a radius only slightly above it looks abrupt; in practice $r$ of 3 to 10 times the braking distance (here 8 to 24 px) gives a visible, smooth approach. For enemies that should crowd the player, arrive at a ring around the player rather than at the player's position.`,
            },
          ],
          takeaway: md`Slow radius $\ge v^2/2a$; pick several times that for a smooth stop.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'NavigationRegion2D and NavigationAgent2D',
          md: md`A \`NavigationRegion2D\` holds a \`NavigationPolygon\`: the walkable area as polygons, which the navigation server uses for path queries. You can draw its outline by hand, or **bake** it: draw one outline around the whole room and let Godot cut out the obstacles it finds (with *Parsed Geometry Type* set to *Static Colliders*, the walls' and tiles' collision shapes), shrunk by the agent radius so paths keep clear of walls. A \`NavigationAgent2D\`, a child of the moving body, asks the server for a path to its \`target_position\` and hands out the waypoints one at a time: \`get_next_path_position()\` returns the next one, and \`is_navigation_finished()\` says when the last is reached.`,
        },
        {
          kind: 'steps',
          title: 'Bake navigation for a tile room',
          steps: [
            md`In the test room add a \`NavigationRegion2D\` above the \`TileMapLayer\`. In the Inspector give it a **New NavigationPolygon**.`,
            md`With the region selected, use the polygon tool in the 2D toolbar to draw a rectangle around the whole floor of the room (four clicks, then click the first point again).`,
            md`On the NavigationPolygon: *Geometry → Parsed Geometry Type* = **Static Colliders**, *Parsed Collision Mask* = layer 1 only, *Agents → Radius* = 6 px. Then click **Bake NavigationPolygon** in the toolbar. The walkable area turns blue-green with holes around the wall tiles.`,
            md`Add a \`NavigationAgent2D\` child to the skeleton. Set *Path Desired Distance* and *Target Desired Distance* to 4 px. Turn on **Debug → Enabled** on it to draw its path in the running game.`,
            md`Replace \`_move_toward\` in the AIController with the version below, drag the agent into the new *Nav Agent* export, and run.`,
          ],
          result: md`When Kai hides behind a wall, the skeleton walks around it along a drawn path instead of pushing into it. With two skeletons, they keep a few pixels apart.`,
          troubleshoot: [
            { problem: md`Baking produces nothing, or one polygon with no holes.`, fix: md`The outline must enclose the obstacles, and the walls must be on the *Parsed Collision Mask*. For tiles, the TileSet's physics layer must actually have collision polygons on the wall tiles.` },
            { problem: md`\`get_next_path_position()\` returns the agent's own position on the first frames.`, fix: md`The navigation map syncs on the first physics frame, so the first query finds no map. Ignore movement until \`is_navigation_finished()\` is false, as the code does, or wait one physics frame in \`_ready()\`.` },
            { problem: md`Enemies cut corners into walls.`, fix: md`The bake radius is smaller than the enemy's collision shape. Set *Agents → Radius* to at least half the feet box width and bake again.` },
          ],
        },
        { kind: 'code', file: 'scripts/ai/ai_controller.gd', code: NAV_MOVE, fragment: true, note: md`Setting \`target_position\` asks the server for a new path. Doing that every tick for every enemy wastes work, so the path is refreshed every 0.25 s, or at once if the goal moved more than a tile. \`get_physics_process_delta_time()\` is the fixed physics step, 1/60 s.` },
        {
          kind: 'viz',
          viz: { type: 'combat.ai', mode: 'nav' },
          task: md`Hide behind the long wall and toggle **use navigation**. Without it the skeletons seek straight at \`last_seen\` and get stuck; with it they follow the drawn paths. Then turn **separation** off and watch two chasers merge.`,
          caption: md`The paths are computed on the 16 px tile grid, the same idea as a baked navigation polygon. Dots are waypoints; the highlighted one is \`get_next_path_position()\`.`,
        },
        {
          kind: 'check',
          q: md`Four skeletons chase Kai, each setting \`nav_agent.target_position = target.global_position\` every physics tick. What is the cost, and what does the lesson's code do instead?`,
          options: [
            md`240 path queries per second for four enemies, most returning almost the same path; the lesson refreshes every 0.25 s (16 per second) or when the goal moves more than a tile.`,
            md`No cost: Godot caches paths automatically.`,
            md`The enemies stop moving because the path resets.`,
            md`The cost is in rendering, not navigation.`,
          ],
          answer: 0,
          explain: md`$4 \times 60 = 240$ queries per second. Each query is cheap in a small room, but crowds and large maps add up, and a path that changes every tick can make agents dither. Refreshing on a timer or on a significant move keeps paths stable and cheap.`,
        },
        {
          kind: 'numeric',
          q: md`Separation with \`radius\` 18 px: a neighbour is 6 px to the left of the slime. What is the strength $1 - d/r$ of its push, and in which direction (enter the push vector)?`,
          answer: { kind: 'vector', value: [0.66667, 0], tol: 1e-3 },
          explain: md`$d = 6$, strength $1 - 6/18 = 2/3$. "Away" is from the neighbour toward the slime: to the right, $(1, 0)$. Push $= (0.667, 0)$.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'Avoidance from the navigation server',
          md: md`Instead of separation, a \`NavigationAgent2D\` can ask the server for a velocity that avoids other agents (RVO avoidance). Turn on *Avoidance Enabled*, set *Radius* and *Max Speed*, then each tick set \`nav_agent.velocity\` to the velocity you want and receive a safe one in the \`velocity_computed\` signal. It handles dense crowds better than separation; separation is simpler, deterministic and easy to show, which is why it is the default here.

\`\`\`gdscript
func _steer_with_avoidance(desired: Vector2) -> void:
    nav_agent.velocity = desired * character.max_speed

func _on_velocity_computed(safe_velocity: Vector2) -> void:
    character.intent.move = (safe_velocity / character.max_speed).limit_length(1.0)
\`\`\``,
        },
        {
          kind: 'build',
          ch: {
            id: 'k02-2-build',
            title: 'A pack of slimes that does not clump',
            goal: md`Give the slimes an AIController that chases with navigation and separation, and make them flee briefly after being hit.`,
            requirements: [
              md`Four slimes chase Kai around walls without getting stuck and without stacking on one spot.`,
              md`A hit slime flees from Kai at full speed for 0.5 s, then resumes the chase.`,
              md`Slimes arrive at about 14 px from Kai rather than inside him.`,
              md`With **Debug → Visible Navigation** on, the paths go around the wall tiles.`,
            ],
            hints: [
              md`Fleeing is a brain state, FLEE, entered from the Hurtbox's \`hurt\` signal; it writes \`Steering.flee(position, target.global_position)\`.`,
              md`To arrive at a ring, target the point \`target.global_position + offset.normalized() * 14\`, where offset points from Kai to the slime.`,
              md`Slimes move by hopping; let the slime's Move state turn \`intent.move\` into hops (c05's problem set has the design). The AI does not need to know.`,
            ],
            solution: [
              { file: 'scripts/ai/ai_controller.gd', code: AI_V2 },
              { file: 'scripts/ai/steering.gd', code: STEERING },
            ],
            explain: md`The controller's structure did not change from k02-1: only \`_move_toward\` grew. Perception decides *where* the enemy wants to go, the navigation agent decides *the route*, steering decides *this frame's direction*, and the Character's Move state decides *how the body moves*. Each layer can be replaced without touching the others.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'k02-2-paper',
            title: 'Arrive, step by step',
            type: 'compute',
            difficulty: 2,
            minutes: 6,
            statement: md`A skeleton uses \`Steering.arrive\` with slow radius 24 px toward a point 18 px away, and \`max_speed\` 60. What desired speed (px/s) does it ask for? If its current velocity is 60 px/s straight toward the point, what is the magnitude of the steering (desired minus current) in px/s?`,
            solution: [
              md`Desired direction length $\min(18/24, 1) = 0.75$, so desired speed $0.75 \times 60 = 45$ px/s.`,
              md`Steering $= 45 - 60 = -15$ px/s along the line: magnitude 15. \`move_with_intent\` applies it at most \`acceleration\` × delta per tick ($900/60 = 15$ px/s per tick), so it brakes to 45 px/s in one tick.`,
            ],
            answer: { kind: 'vector', value: [45, 15] },
            areas: ['math', 'combat'],
          },
        },
        {
          kind: 'recall',
          prompt: md`What do \`target_position\`, \`get_next_path_position()\` and \`is_navigation_finished()\` do on a NavigationAgent2D?`,
          answer: md`\`target_position\`: setting it requests a path to that point. \`get_next_path_position()\`: the next waypoint to steer toward (it advances as you reach waypoints). \`is_navigation_finished()\`: true when the final waypoint is reached (or no path).`,
        },
        {
          kind: 'explain',
          prompt: md`Why combine pathfinding with steering instead of using one of them alone?`,
          model: md`Pathfinding knows the static map: it finds a route around walls but knows nothing about the other moving enemies, and following waypoints exactly makes agents queue and stack. Steering reacts to the local situation every tick (neighbours, slowing on arrival) but has no idea how to get around a wall, so seek alone gets stuck on the first pillar. Pathfinding supplies the next waypoint; steering turns "go to that waypoint" plus "keep away from neighbours" into this tick's direction.`,
        },
      ],
      cards: [
        { id: 'k02-2-c1', kind: 'concept', front: md`Seek, flee, arrive, separation in one line each?`, back: md`Seek: full speed toward. Flee: full speed away. Arrive: seek, slowing linearly inside a slow radius. Separation: away from close neighbours, stronger when closer.` },
        { id: 'k02-2-c2', kind: 'compute', front: md`Minimum arrive slow radius for $v = 90$ px/s, $a = 900$ px/s² (px)?`, answer: { kind: 'number', value: 4.5 }, back: md`$v^2/2a = 8100/1800 = 4.5$ px.` },
        { id: 'k02-2-c3', kind: 'cloze', text: md`Each tick, steer toward \`nav_agent.{{}}()\`, the next waypoint of the path.`, answers: ['get_next_path_position'] },
        { id: 'k02-2-c4', kind: 'concept', front: md`Why not set \`target_position\` every physics tick?`, back: md`Each set requests a new path; for many enemies that is hundreds of queries per second and unstable paths. Refresh on a timer (0.25 s) or when the goal moves a tile.` },
        { id: 'k02-2-c5', kind: 'concept', front: md`What does baking a NavigationPolygon with Static Colliders do?`, back: md`Starts from your outline, cuts out the collision shapes on the parsed mask (walls, wall tiles), shrinks by the agent radius, and stores the walkable polygons.` },
      ],
    },
    // =============================================================================== k02-3
    {
      id: 'k02-3',
      title: 'Fair fights: telegraphs, attack tokens and a boss',
      minutes: 40,
      objectives: [
        'Size an attack telegraph from human reaction time and the player\'s defensive options, in frames.',
        'Build a telegraph from wind-up frames, a flash and a sound keyed in the attack animation.',
        'Limit simultaneous attackers with attack tokens and give token-less enemies something readable to do.',
        'Drive a boss through phases with health thresholds that only move forward.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Players accept losing to an enemy they understood and resent losing to one they could not read. Two things make a fight readable:

1. **Telegraphs.** Every enemy attack announces itself early enough to react: a wind-up pose, a flash, a sound. The skeleton's sheet has a \`windup\` animation for exactly this.
2. **Pacing.** Five skeletons that all swing at the same instant cannot be dodged by anyone. Action games keep only a few enemies attacking at once and have the rest circle and wait their turn.

Then the boss: one big enemy whose behaviour changes as the fight goes on, so the last third does not feel like the first.`,
        },
        {
          kind: 'derive',
          title: 'how long should a wind-up be?',
          goal: md`Find the minimum startup (in frames) of an enemy attack so that a player who reacts to the telegraph can still dodge it.`,
          steps: [
            {
              md: md`A typical simple visual reaction time is around 200 to 250 ms. In a busy fight, where the player must also notice *which* enemy is winding up, budget about 250 ms: $0.25 \times 60 = 15$ frames.`,
            },
            {
              md: md`After reacting, the player's dodge must make Kai invincible before the hitbox arrives. Kai's dash is invincible from its first frame, but the press may land during his own attack: the worst case adds the remaining frames until his \`dodge_cancel_frame\`, up to 8 frames for hit 1.`,
              choose: {
                prompt: md`Minimum startup for an attack the player can always dodge, even mid-swing?`,
                options: [md`$15 + 8 = 23$ frames`, md`15 frames`, md`8 frames`],
                answer: 0,
                explain: md`Reaction time plus the longest delay before the dodge can start. Fewer frames makes the attack undodgeable from some of the player's own states.`,
              },
            },
            {
              md: md`The skeleton's swing uses 24 startup frames (400 ms): \`windup\` for 24 frames, then 4 active frames of \`attack\`. The golem's slam uses 40 (667 ms), because its hit is much heavier and it is the set piece of the dungeon. Fast enemies (bats) can have short startup only if their attacks are weak or easy to avoid by positioning.`,
            },
          ],
          takeaway: md`Startup $\ge$ reaction frames (about 15) + the longest delay before the player's defence starts. Heavier attacks deserve longer telegraphs.`,
        },
        {
          kind: 'numeric',
          q: md`Bram's guard comes up 6 frames after the press. A bat's dive has 14 startup frames. With a 15-frame reaction budget, how many frames late is Bram's guard (a negative answer would mean early)?`,
          answer: { kind: 'number', value: 7 },
          explain: md`Needed: $15 + 6 = 21$ frames; available: 14. Bram is 7 frames late: the dive is not reactable with the guard. Either lengthen the bat's startup, weaken the dive, or accept that bats are avoided by positioning, not reaction.`,
        },
        {
          kind: 'steps',
          title: "Key the skeleton's telegraph",
          steps: [
            md`Give the skeleton the combo Attack state from k01 (\`attack.gd\`, \`class_name AttackState\`) with one AttackData: animation \`skeleton_swing\`, cancel 99, dodge cancel 99 (enemies do not dodge), damage 3, knockback 120, lunge 40.`,
            md`In the skeleton's AnimationPlayer create \`skeleton_swing\`, length $50/60 \approx 0.8333$ s, step 1/60. Key \`AnimatedSprite2D:animation\` = \`windup\` at 0 and \`attack\` at 0.4; key \`AnimatedSprite2D:frame\` 0 at 0, 1 at 0.2, 0 at 0.4, 1 at 0.4333, 2 at 0.5.`,
            md`Key the hitbox shape *Disabled* = on at 0, off at 0.4, on at 0.4667 (4 active frames).`,
            md`Telegraph flash: the skeleton's sprite has the hit-flash material from k01-3. Add a track for its \`shader_parameter/flash_color\` set to orange at 0, and \`shader_parameter/flash\` at 0 (value 0), 0.25 (0.6), 0.3333 (0), 0.3667 (0.6) and 0.4 (0): two orange pulses in the last 9 frames of the wind-up. Add an Audio track key for a short scrape sound at 0.0167.`,
            md`Run and stand next to the skeleton. Count: the orange pulses come right before the swing; dash on the second pulse.`,
          ],
          result: md`The skeleton raises its sword for 0.4 s, pulses orange twice, then swings. Dashing at the second pulse avoids the hit every time.`,
          troubleshoot: [
            { problem: md`The telegraph flash stays orange on later hits.`, fix: md`The k01 hit flash sets \`flash\` but not \`flash_color\`. Key \`flash_color\` back to white at the end of the animation, or have \`Character.flash()\` set the colour each time.` },
            { problem: md`The sprite shows \`attack\` during the wind-up.`, fix: md`The Attack state calls \`play_anim("attack")\` before the AnimationPlayer starts; the animation track must key \`windup\` at time 0 to override it.` },
          ],
        },
        {
          kind: 'viz',
          viz: { type: 'combat.ai_tokens' },
          task: md`Set **max tokens** to 5 and survive 20 seconds. Then set it to 1, then 2. Turn **telegraph** off at 2 tokens. How many hits do you take in each setup, and which feels like a fight rather than a pile-on?`,
          caption: md`Skeletons holding a token are outlined and approach to attack; the others hold a ring around Kai and drift sideways, waiting. The bar under each attacker is its wind-up. The readout counts hits taken and the most simultaneous wind-ups.`,
        },
        { kind: 'code', file: 'scripts/ai/attack_tokens.gd', code: TOKENS, note: md`One instance per level, in the group \`attack_tokens\`. The holder list is plain data, so a debug overlay can show who holds a token.` },
        { kind: 'code', file: 'scripts/ai/ai_controller.gd', code: TOKEN_CHASE, fragment: true, note: md`\`orthogonal()\` rotates a vector 90°, giving the sideways drift. The radial term pulls the enemy back to the ring from either side. \`_exit_tree()\` runs when the node leaves the tree, including when the enemy is freed, so a dead holder never keeps a token.` },
        {
          kind: 'check',
          q: md`With \`max_tokens = 2\`, a skeleton holding a token is killed mid-swing. Without the \`_exit_tree()\` release, what happens to the fight?`,
          options: [
            md`Only one token is ever available again, and after a second death none: the remaining skeletons circle forever and never attack.`,
            md`Nothing; Godot frees the token with the node.`,
            md`A new token is created automatically.`,
            md`All remaining skeletons attack at once.`,
          ],
          answer: 0,
          explain: md`The holder list still contains the freed node, so \`_holders.size()\` stays at 2 after two deaths. Any shared resource that is acquired must be released on every exit path, including death. In GDScript, a reference to a freed node also becomes invalid, which is one more reason to release on exit.`,
        },
        {
          kind: 'text',
          md: md`### The golem: phases

The golem's fight has three phases. Each changes the attack string and the opening the player gets after each attack:

| Phase | Starts at | Attack | Recover | Chase speed |
|---|---|---|---|---|
| 1 | 100% HP | one slam, 40-frame wind-up | 1.2 s | 0.6 |
| 2 | 60% | two slams, 32-frame wind-ups | 0.9 s | 0.7 |
| 3 | 30% | three slams, 24-frame wind-ups | 0.7 s | 0.85 |

The phase is a function of health, but the *transition* is an event: it plays a roar (the \`stagger\` animation), and it must happen exactly once even if the golem is healed or one hit crosses two thresholds.`,
        },
        { kind: 'code', file: 'scripts/resources/boss_phase.gd', code: BOSS_PHASE },
        { kind: 'code', file: 'scripts/ai/boss_phases.gd', code: BOSS_PHASES, note: md`The golem is an ordinary Character with an ordinary AIController and AttackState; \`BossPhases\` is one more component that listens to \`health_changed\` and reconfigures them. \`phase_changed\` is the hook for the roar, a music change or a camera zoom.` },
        {
          kind: 'viz',
          viz: { type: 'combat.ai_phases' },
          task: md`Drag the golem's HP down slowly and watch the phase and the attack timeline change. Reset, then use **big hit (-45%)** from full health: which phases begin, and in what order? Then drag HP back up past a threshold.`,
          caption: md`The timeline shows one attack cycle of the current phase: wind-up (amber, the telegraph), slam (red), recover (blue, the player's opening). The log lists \`phase_changed\` emissions.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'k02-3-build',
            title: 'The golem',
            goal: md`Build the golem from the existing pieces: Character, AIController, AttackState with slam AttackData, HealthComponent (120), Hurtbox, and BossPhases with the three phases from the table.`,
            requirements: [
              md`Each slam is telegraphed by the \`windup\` animation and an orange pulse; the wind-up lengths are 40, 32 and 24 frames in phases 1 to 3.`,
              md`At 60% and 30% HP the golem roars (plays \`stagger\` for 1 s, invincible) exactly once each, even if one hit crosses both thresholds.`,
              md`After each attack cycle the golem stands still for the phase's recover time, during which Kai can hit it freely.`,
              md`The slam knocks Kai back about 32 px (240 px/s against Kai's 900 px/s² knockback friction) and uses the heavy hit feedback.`,
            ],
            hints: [
              md`The roar is a state: add a \`Roar\` state to the golem's StateMachine (play \`stagger\`, set \`hurtbox.invincible\` in \`enter()\` and clear it in \`exit()\`, return to Idle after 1 s) and connect \`phase_changed\` to a function that calls \`state_machine.transition_to("Roar")\`.`,
              md`Two slams in a row are two AttackData entries in the phase's combo with \`cancel_frame\` set so the second starts after the first's recovery; the AI sets \`wants_attack\` once and the Attack state needs it again for the second hit, so give the golem's AIController a tiny rule: in ATTACK, keep \`wants_attack\` true until the body leaves Attack.`,
              md`A one-hit crossing of both thresholds runs the \`while\` loop twice and emits \`phase_changed\` twice in the same tick; make the Roar handler ignore a second request while already roaring.`,
            ],
            solution: [
              { file: 'scripts/ai/boss_phases.gd', code: BOSS_PHASES },
              { file: 'scripts/resources/boss_phase.gd', code: BOSS_PHASE },
            ],
            explain: md`Nothing in the golem is boss-specific code except the 30-line BossPhases component and its data. Its slam goes through Hitbox → Hurtbox → HealthComponent → HitFeedback like Kai's sword. Tuning the fight is editing three \`.tres\` files; the phases table above *is* the data.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'k02-3-paper',
            title: 'Token arithmetic',
            type: 'compute',
            difficulty: 2,
            minutes: 6,
            statement: md`Each skeleton's attack cycle with a token is: approach about 0.5 s, wind-up 0.4 s, swing 0.067 s, recovery 0.33 s, then it releases the token and waits 0.6 s before asking again. With \`max_tokens = 2\` and six skeletons, how many attacks per second does Kai face at most? How many with \`max_tokens = 6\`, if every skeleton cycles as fast as it can?`,
            solution: [
              md`With a token, one cycle lasts $0.5 + 0.4 + 0.067 + 0.33 \approx 1.3$ s. Two tokens: at most $2/1.3 \approx 1.54$ attacks per second; the wait does not matter because other skeletons are queued for the free token.`,
              md`Six tokens: every skeleton cycles in $1.3 + 0.6 = 1.9$ s: $6/1.9 \approx 3.16$ attacks per second, often overlapping. Two tokens halve the pressure and, more importantly, keep wind-ups from overlapping.`,
            ],
            answer: { kind: 'vector', value: [1.54, 3.16], tol: 0.01 },
            areas: ['combat', 'math'],
          },
        },
        {
          kind: 'recall',
          prompt: md`Three rules that make enemy attacks fair, with the number or mechanism for each.`,
          answer: md`Telegraph: startup at least reaction (about 15 frames) plus the longest delay before the player's defence starts (skeleton 24 frames, golem 40), shown with a wind-up pose, flash and sound. Pacing: attack tokens limit simultaneous attackers (2 in normal fights). Openings: a recover period after each attack (0.6 s for skeletons, 0.7 to 1.2 s for the golem) in which the player can punish.`,
        },
        {
          kind: 'explain',
          prompt: md`Why are boss phases driven by health thresholds through a component, and why must phase transitions only move forward?`,
          model: md`Health is the player's progress through the fight, so tying phases to it guarantees every player sees every phase, and in order. Doing it in a separate component keeps the boss an ordinary Character: the AI, attacks and hit handling are the shared, tested ones, and the phase logic is a small listener on \`health_changed\` that swaps data. Transitions must be one-way events because heals, regeneration or a hit that crosses two thresholds would otherwise replay a roar, reset patterns or skip a phase's setup; a \`while\` loop over increasing thresholds handles multi-threshold hits and never goes back.`,
        },
      ],
      cards: [
        { id: 'k02-3-c1', kind: 'compute', front: md`Reaction budget 15 frames, the player's dodge can start at worst 8 frames late. Minimum enemy startup (frames)?`, answer: { kind: 'number', value: 23 }, back: md`$15 + 8 = 23$ frames.` },
        { id: 'k02-3-c2', kind: 'concept', front: md`What is an attack token system?`, back: md`A shared pool of N tokens; an enemy may attack only while holding one, and releases it after its attack (and on death). Others hold a ring and wait.` },
        { id: 'k02-3-c3', kind: 'concept', front: md`Three ingredients of a telegraph?`, back: md`A wind-up pose (\`windup\` animation) long enough to react to, a visual flash or pulse, and a sound cue: all keyed in the attack's animation.` },
        { id: 'k02-3-c4', kind: 'cloze', text: md`BossPhases uses \`{{}}\`, not \`if\`, so one hit that crosses two thresholds still starts both phases in order.`, answers: ['while'] },
        { id: 'k02-3-c5', kind: 'concept', front: md`Why release tokens in \`_exit_tree()\`?`, back: md`It runs on every way of leaving the tree, including death and level changes, so a holder can never keep a token forever.` },
      ],
    },
  ],
  problems: [
    {
      id: 'k02-p1',
      title: 'Behind or in front',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`A skeleton faces $(-1, 0)$. Kai is at offset $(12, 5)$. Compute $\hat{\mathbf f}\cdot\hat{\mathbf p}$. Is Kai in front of the skeleton or behind it?`,
      solution: [md`$|\mathbf p| = 13$, $\hat{\mathbf p} = (12/13, 5/13)$. Dot $= -12/13 \approx -0.923$.`, md`Negative: Kai is behind (more than 90° from the facing). Only hearing can detect him.`],
      answer: { kind: 'number', value: -0.92308, tol: 1e-3 },
      areas: ['math'],
    },
    {
      id: 'k02-p2',
      title: 'The skeleton that sees through walls',
      type: 'debug',
      difficulty: 2,
      minutes: 6,
      statement: md`This line-of-sight check lets skeletons see Kai through walls only when Kai stands directly against the wall. Explain and fix.

\`\`\`gdscript
var query := PhysicsRayQueryParameters2D.create(character.global_position, target.global_position)
var hit := character.get_world_2d().direct_space_state.intersect_ray(query)
return hit.is_empty() or hit.collider == target
\`\`\``,
      solution: [md`\`create\` without a mask uses all layers, so the ray can hit the skeleton's own body, Kai's body or other enemies first. The \`hit.collider == target\` exception accepts the case where Kai's body is hit; when Kai stands against the wall, his feet box overlaps the wall's edge and the ray reaches his collider before the wall.`, md`Fix: pass the world mask (\`create(from, to, 1)\`) so only walls block, and treat an empty result as "visible". Optionally aim at Kai's chest instead of his feet and exclude self with \`query.exclude = [character.get_rid()]\`.`],
      rubric: [md`Identifies the default all-layers mask`, md`Explains why standing at the wall changes the result`, md`Fix uses a world-only mask`],
      areas: ['godot', 'math'],
    },
    {
      id: 'k02-p3',
      title: 'Memory time',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`A skeleton chases at 60 px/s. Kai breaks line of sight when the skeleton is 80 px from \`last_seen\`. With \`memory_time\` 3 s, how long does the skeleton wait at \`last_seen\` before returning to IDLE (in seconds)?`,
      solution: [md`It walks $80/60 \approx 1.33$ s to reach \`last_seen\` (ignoring acceleration).`, md`It waits the rest of the memory: $3 - 1.33 \approx 1.67$ s.`],
      answer: { kind: 'number', value: 1.66667, tol: 1e-3 },
      areas: ['combat'],
    },
    {
      id: 'k02-p4',
      title: 'An archer on paper',
      type: 'design',
      difficulty: 2,
      minutes: 10,
      statement: md`Design the brain of a skeleton archer that keeps 64 to 96 px from Kai, backs off if he comes closer, and shoots when it has line of sight. Give the brain states, their transitions, which steering behaviours each uses, and the telegraph.`,
      solution: [md`States: IDLE, PATROL (as before), KITE (in range band: arrive at a point 80 px from Kai along the current offset, plus separation), RETREAT (Kai closer than 64: flee, with navigation so it does not back into a corner), AIM (line of sight and in band: stand still, face Kai, request a token), SHOOT (wants_attack once), RECOVER.`, md`Transitions: KITE → AIM when in band with line of sight and a token; AIM → SHOOT after the telegraph; any → RETREAT when Kai is within 64 px; RETREAT → KITE when beyond 72 px (hysteresis to avoid flicker).`, md`Telegraph: an \`aim\` pose for 30 frames with a visible line toward Kai, since a projectile from range needs a longer warning than a melee swing.`],
      rubric: [md`States and transitions with conditions`, md`Uses hysteresis or another guard against flicker at the range boundary`, md`Telegraph length justified`],
      areas: ['combat', 'systems'],
    },
    {
      id: 'k02-p5',
      title: 'Phase skipping',
      type: 'compute',
      difficulty: 2,
      minutes: 5,
      statement: md`The golem has 120 HP and phases at 60% and 30%. It has 80 HP when Lyra's spell deals 50 damage. Which phase indices (0, 1, 2) begin, and how many times is \`phase_changed\` emitted?`,
      solution: [md`After the hit: $30/120 = 0.25$. The \`while\` loop: $0.25 \le 0.6$ → phase 1, emit; $0.25 \le 0.3$ → phase 2, emit.`, md`Phases 1 and 2 begin, in order, in the same tick: 2 emissions. With \`if\` instead of \`while\`, only phase 1 would begin until the next hit.`],
      answer: { kind: 'number', value: 2 },
      areas: ['systems'],
    },
    {
      id: 'k02-p6',
      title: 'Separation strength',
      type: 'compute',
      difficulty: 2,
      minutes: 6,
      statement: md`A slime at the origin has neighbours at $(6, 0)$ and $(0, -9)$, separation radius 18. Compute the separation push before \`limit_length\` (enter as a vector).`,
      solution: [md`Neighbour 1: away $= (-6, 0)$, $d = 6$, strength $1 - 6/18 = 2/3$: $(-0.667, 0)$.`, md`Neighbour 2: away $= (0, 9)$, $d = 9$, strength $0.5$: $(0, 0.5)$.`, md`Sum $(-0.667, 0.5)$, length $0.833 < 1$, so \`limit_length\` leaves it unchanged.`],
      answer: { kind: 'vector', value: [-0.66667, 0.5], tol: 1e-3 },
      areas: ['math'],
    },
    {
      id: 'k02-p7',
      title: 'Why not one big state machine',
      type: 'concept',
      difficulty: 2,
      minutes: 6,
      statement: md`A teammate proposes merging the skeleton's brain into its body StateMachine: states Patrol, Chase, Windup, Swing, Recover, Hurt, each reading perception directly. Give two concrete problems this causes in Shardbound.`,
      solution: [md`The body states could no longer be shared with Kai and the party: Kai's Attack state is the same script as the skeleton's; a merged machine needs a second copy of Attack, Hurt and so on for AI, and fixes diverge.`, md`Party switching (k05) needs the same body to be driven by a player or by AI; with decisions inside the body states that means swapping the whole machine. Also, Hurt interrupting a decision state loses the decision (was it chasing or retreating?), while a separate brain keeps its state while the body is in Hurt.`],
      rubric: [md`Mentions reuse of body states with Kai`, md`Mentions controller swapping or decisions surviving Hurt`],
      areas: ['systems'],
    },
    {
      id: 'k02-p8',
      title: 'Ring spacing',
      type: 'compute',
      difficulty: 2,
      minutes: 5,
      statement: md`Token-less skeletons hold a ring of radius 44 px around Kai. How many can stand on the ring with at least 18 px (the separation radius) between neighbours along the circle? Use the arc length.`,
      solution: [md`Circumference $2\pi \times 44 \approx 276.5$ px.`, md`$\lfloor 276.5/18 \rfloor = 15$. Far more than a fight needs, so separation rarely fights the ring; at 6 skeletons they are about 46 px apart.`],
      answer: { kind: 'number', value: 15 },
      areas: ['math'],
    },
  ],
};
