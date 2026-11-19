import { md, gd, type Module } from '../types';

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
  ],
};
