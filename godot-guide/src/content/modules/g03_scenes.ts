import { md, gd, type Module } from '../types';

const SLIME_TSCN = `[gd_scene load_steps=4 format=3 uid="uid://b6x3slime0q2k"]

[ext_resource type="Script" path="res://scripts/enemies/slime.gd" id="1_s7k2d"]
[ext_resource type="SpriteFrames" path="res://assets/enemies/slime_frames.tres" id="2_f4m1q"]

[sub_resource type="CircleShape2D" id="CircleShape2D_a3k1"]
radius = 6.0

[node name="Slime" type="CharacterBody2D" groups=["enemies"]]
collision_layer = 8
script = ExtResource("1_s7k2d")

[node name="AnimatedSprite2D" type="AnimatedSprite2D" parent="."]
position = Vector2(0, -8)
sprite_frames = ExtResource("2_f4m1q")
animation = &"idle"
autoplay = "idle"

[node name="CollisionShape2D" type="CollisionShape2D" parent="."]
position = Vector2(0, -4)
shape = SubResource("CircleShape2D_a3k1")
`;

const SLIME_STUB = gd`
extends CharacterBody2D
## A placeholder slime: it hops toward the right edge and wraps around.
## Module k02 replaces this with real enemy AI.

@export var speed := 20.0


func _physics_process(_delta: float) -> void:
    velocity = Vector2.RIGHT * speed
    move_and_slide()
    if position.x > 330.0:
        position.x = -10.0
`;

const SPAWNER = gd`
extends Node2D
## Spawns a slime at a random point every interval seconds, up to max_slimes.
## Pressing attack frees every node in the "enemies" group.

const SLIME_SCENE := preload("res://scenes/enemies/slime.tscn")

@export var interval := 2.0
@export var max_slimes := 5
## Where slimes may appear, in this node's coordinates.
@export var area := Rect2(32, 32, 256, 116)

var _time_left := 0.0


func _process(delta: float) -> void:
    _time_left -= delta
    if _time_left > 0.0:
        return
    _time_left = interval
    if get_tree().get_nodes_in_group("enemies").size() >= max_slimes:
        return
    var slime := SLIME_SCENE.instantiate() as Node2D
    # Set the position before add_child, so the slime's _ready already sees it.
    slime.position = Vector2(
        randf_range(area.position.x, area.end.x),
        randf_range(area.position.y, area.end.y)
    )
    add_child(slime)


func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("attack"):
        get_tree().call_group("enemies", "queue_free")
`;

const EVENTS_V1 = gd`
extends Node
## Global signal bus (autoload "Events"). Any node can emit or connect
## without a reference to the others. No class_name: the autoload name
## already makes "Events" available everywhere.

@warning_ignore("unused_signal")
signal coin_collected(value: int)
`;

const WALKER = gd`
extends CharacterBody2D
## A stand-in for the player until module c02 builds the real one.

@export var speed := 80.0


func _physics_process(_delta: float) -> void:
    velocity = Input.get_vector("move_left", "move_right", "move_up", "move_down") * speed
    move_and_slide()
`;

const COIN = gd`
class_name Coin
extends Area2D
## A pickup. Announces itself on the Events bus and disappears.
## Collision: layer 8 (pickup), mask 2 (player), set in the Inspector.

## How many coins this pickup is worth.
@export var value := 1

var _collected := false


func _ready() -> void:
    body_entered.connect(_on_body_entered)


func _on_body_entered(_body: Node2D) -> void:
    # The mask already guarantees this is the player: no type check needed.
    # The flag stops a second body in the same physics step counting twice,
    # because queue_free only takes effect at the end of the frame.
    if _collected:
        return
    _collected = true
    Events.coin_collected.emit(value)
    queue_free()
`;

const COIN_LABEL = gd`
extends Label
## Shows how many coins were collected. Knows nothing about coins themselves.

var _coins := 0


func _ready() -> void:
    Events.coin_collected.connect(_on_coin_collected)
    _refresh()


func _on_coin_collected(value: int) -> void:
    _coins += value
    _refresh()


func _refresh() -> void:
    text = "Coins: %d" % _coins
`;

const PAUSE_MENU = gd`
extends Control
## The pause menu. Its Process > Mode is Always, so it can react to the
## pause key both while the game runs and while it is paused.


func _ready() -> void:
    hide()


func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("pause"):
        get_tree().paused = not get_tree().paused
        visible = get_tree().paused
        # Stop other nodes from also reacting to this key press.
        get_viewport().set_input_as_handled()
`;

export const MODULE: Module = {
  id: 'g03',
  part: 'godot',
  order: 3,
  title: 'Nodes, scenes, signals and the scene tree',
  summary: 'Composition with scenes, instancing from the editor and from code, node paths and groups, signals versus direct calls ("call down, signal up"), a global Events bus, queue_free, processing order and pausing.',
  relevance: md`Shardbound is built from scenes: Kai, Lyra and Bram are scenes, every enemy and pickup is a scene, each room is a scene that instances them, and the HUD is a scene layered on top. How those scenes talk decides whether you can test a slime alone, drop a coin into any room, or replace the HUD without touching the enemies. This module sets the rules the whole course follows: parents call their children, children signal upward, and game-wide events go through the \`Events\` autoload.`,
  prereqs: ['g01', 'g02'],
  areas: ['godot', 'systems'],
  lessons: [
    {
      id: 'g03-1',
      title: 'Scenes, instancing and the scene tree',
      minutes: 40,
      objectives: [
        'Explain a scene as a reusable tree of nodes saved as `.tscn`, and compose scenes from other scenes.',
        'Instance scenes in the editor and from code with `preload`, `instantiate()` and `add_child()`.',
        'Read and write absolute and relative node paths, and find nodes with groups.',
        'Remove nodes with `queue_free()` and say what happens to their children.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`The first dungeon in Shardbound has about forty slimes. Each is a body, a sprite, a collision shape, a hurtbox and a script, five nodes wired the same way. You build that once as \`slime.tscn\`, and every room *instances* it. When playtests show the slime's collision circle is too big, you change it in one file and all forty change.

This is how everything in Godot is built: small scenes, instanced inside bigger scenes, inside the scene that is the running game.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Scene, instance, scene tree',
          md: md`- A **scene** is a tree of nodes with one root, saved as a \`.tscn\` text file. It is a template.
- An **instance** is a copy of a scene placed inside another scene (in the editor) or created at run time with \`instantiate()\`. In the parent scene it appears as one node with a clapperboard icon; its insides belong to the original scene file.
- The **scene tree** is the tree of nodes that exists while the game runs. Its root is a \`Window\` at \`/root\`; autoloads (lesson 2) are its first children, then the current main scene.
- A node does nothing until it is **in the tree**: it gets no \`_process\` calls, is not drawn and has no physics.`,
        },
        { kind: 'assets', ids: ['slime', 'tiles_overworld'], note: md`The slime sheet has \`idle\`, \`hop\`, \`hurt\` and \`die\` animations. Its file path is listed above; drag that file into the SpriteFrames editor.` },
        {
          kind: 'steps',
          title: 'Make the slime scene and instance it',
          steps: [
            md`**Scene → New Scene → Other Node → CharacterBody2D**. Rename it \`Slime\`.`,
            md`Add a child \`AnimatedSprite2D\`. In its *Sprite Frames* property choose **New SpriteFrames**, then click it to open the **SpriteFrames** panel at the bottom. Rename the \`default\` animation to \`idle\`, click **Add frames from a Sprite Sheet** (the grid icon), pick the slime sheet, set the grid to the sheet's columns and rows, select the idle frames and add them. Set 6 FPS and click **Autoplay on Load** (the play-arrow icon).`,
            md`Move the sprite up by 8 px (*Position* y = \`-8\`) so the slime's base sits on the root's origin.`,
            md`Add a child \`CollisionShape2D\` with a new **CircleShape2D** of radius 6, at y = \`-4\`.`,
            md`Select \`Slime\`. Under *CollisionObject2D → Collision* set **Layer** to 4 (\`enemy\`) only and **Mask** to 1 (\`world\`). In the **Node** dock, **Groups** tab, add the group \`enemies\`.`,
            md`Attach the placeholder script below as \`scripts/enemies/slime.gd\` and save the scene as \`scenes/enemies/slime.tscn\`.`,
            md`Create \`scenes/test_room.tscn\` with a \`Node2D\` root \`TestRoom\` and a \`Node2D\` child \`Enemies\`. Drag \`slime.tscn\` from FileSystem onto \`Enemies\` three times and spread them out. Press **F6**.`,
            md`While it runs, click **Remote** at the top of the Scene dock: this is the live scene tree. Then stop, open \`slime.tscn\`, change the sprite's *Modulate* to light blue, save, and run the room again.`,
          ],
          result: md`Three animated slimes drift right and wrap around. The Remote tree shows \`/root/TestRoom/Enemies/Slime\`, \`Slime2\`, \`Slime3\`. After the edit, all three are blue, though you changed only one file.`,
          troubleshoot: [
            { problem: md`The slimes are not animated.`, fix: md`Autoplay is off. In the SpriteFrames panel select \`idle\` and click **Autoplay on Load**, or set *Animation* and tick *Autoplay* in the Inspector.` },
            { problem: md`In the test room you cannot see or select the slime's sprite.`, fix: md`That is intended: an instance hides its internals. Edit the slime scene itself (the clapperboard icon opens it). Right-click an instance → **Editable Children** only for one-off changes.` },
          ],
        },
        { kind: 'code', file: 'scripts/enemies/slime.gd', code: SLIME_STUB, note: md`A placeholder so the slimes do something. Its \`_physics_process\` moves the body with \`move_and_slide()\`, which module c02 explains in depth.` },
        { kind: 'code', file: 'scenes/enemies/slime.tscn', lang: 'tscn', code: SLIME_TSCN, note: md`Open \`slime.tscn\` in a text editor: a scene is readable text. Nodes list their \`parent\` by path from the root (\`"."\`), only non-default properties are saved, the collision layer is the integer 8 (layer 4) from lesson g01-2, and the circle is an embedded *sub_resource*. Text scenes give readable diffs in git.` },
        {
          kind: 'text',
          md: md`### Paths, groups and instancing from code

Every node in the tree has an **absolute path** from the root, like \`/root/TestRoom/Enemies/Slime\`, and a **relative path** from any other node: from \`Player\` (a sibling of \`Enemies\`) the slime is \`../Enemies/Slime\`. \`get_node(path)\` and \`$path\` use relative paths; a path starting with \`/root\` is absolute.

Paths break when the tree changes, and spawned nodes do not have predictable names: when a spawned slime's name collides with a sibling's, Godot generates one such as \`@Slime@2\`. For "all enemies" use a **group**: \`get_tree().get_nodes_in_group("enemies")\` returns them wherever they are, \`get_tree().call_group("enemies", "method")\` calls a method on each, and \`node.is_in_group("enemies")\` tests one.

To create nodes at run time:

1. \`const SLIME_SCENE := preload("res://scenes/enemies/slime.tscn")\` loads the scene once, when the script loads.
2. \`var slime := SLIME_SCENE.instantiate()\` builds the node tree in memory (\`_init\` runs for each node).
3. Set properties such as \`slime.position\` now, so \`_ready\` sees them.
4. \`parent.add_child(slime)\` puts it in the tree: \`_enter_tree\`, then \`_ready\`, children first.

\`queue_free()\` removes a node and all its children at the end of the frame. Prefer it to \`free()\`, which deletes immediately and crashes anything that touches the node later in the same frame.`,
        },
        {
          kind: 'viz',
          viz: { type: 'godot.scenetree', mode: 'paths' },
          task: md`Instance two more slimes and read the names Godot gives them and the \`_ready\` order of each new subtree. Set *path from* to **CoinLabel** and select a new slime: what path would the label's script use? Then select \`Enemies\` and free it: what happens to the group count?`,
          caption: md`A **%** marks the unique name \`%CoinLabel\`, usable from any node saved in the main scene. Italic nodes belong to an instanced scene. The code panel shows what the last action looks like in GDScript, written from \`Main\`'s script.`,
        },
        {
          kind: 'check',
          q: md`In the figure's starting tree, what is the relative path from \`Player\` to \`CoinLabel\`?`,
          options: [md`\`../../HUD/CoinLabel\``, md`\`../HUD/CoinLabel\``, md`\`/root/Main/HUD/CoinLabel\``, md`\`HUD/CoinLabel\``],
          answer: 0,
          explain: md`\`Player\` is under \`World\`, which is under \`Main\`. Up once (\`..\`) is \`World\`, up twice is \`Main\`, then down into \`HUD/CoinLabel\`. The absolute path also works but ties the code to the root scene's name. Needing a path like this at all is a hint to use a signal instead (lesson 2).`,
        },
        {
          kind: 'check',
          q: md`\`Enemies\` has three slimes. You call \`$Enemies.queue_free()\` and, on the next line, \`print(get_tree().get_nodes_in_group("enemies").size())\`. What prints, and what prints one frame later?`,
          options: [md`3, then 0`, md`0, then 0`, md`3, then 3`, md`An error, because the nodes are gone`],
          answer: 0,
          explain: md`\`queue_free\` only marks the node; it and its children leave the tree at the end of the frame. The same frame still sees three slimes; the next frame sees none, because freeing a parent frees its whole subtree.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'g03-1-build',
            title: 'A slime spawner',
            goal: md`Add a spawner to the test room that instances slimes from code, caps their number with a group, and clears them on a key press.`,
            requirements: [
              md`A new slime appears every 2 s at a random point inside an exported rectangle, until there are 5.`,
              md`Pressing attack frees every slime, including the three placed in the editor; spawning then resumes.`,
              md`While running, the Remote tree shows spawned slimes under the spawner with generated names.`,
              md`*Interval*, *Max Slimes* and *Area* can be changed in the Inspector.`,
            ],
            hints: [
              md`\`preload\` needs the exact path of your slime scene; drag the file from FileSystem into the script editor to paste it.`,
              md`Count with the group, not with the spawner's children, so editor-placed slimes count too.`,
              md`\`randf_range(a, b)\` returns a random float between a and b.`,
            ],
            solution: [{ file: 'scripts/spawner.gd', code: SPAWNER }],
            explain: md`The spawner owns its timing with a countdown in \`_process\` (a \`Timer\` node would work as well). The cap uses the group, which counts every slime in the tree wherever it was created. \`call_group\` calls \`queue_free\` on each member, so the spawner needs no list of its own.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'g03-1-paper',
            title: 'Write the path',
            type: 'concept',
            difficulty: 1,
            minutes: 4,
            statement: md`A room scene \`Cave\` has children \`Party\` and \`Props\`. \`Party\` has \`Kai\`, \`Lyra\` and \`Bram\`; \`Props\` has \`Chest\`. Write the relative path from \`Lyra\` to \`Chest\`, and the call that finds every node in the group \`interactables\`.`,
            solution: [md`From \`Lyra\`: up to \`Party\` (\`..\`), up to \`Cave\` (\`../..\`), down into \`Props/Chest\`: \`../../Props/Chest\`.`, md`\`get_tree().get_nodes_in_group("interactables")\`, which does not depend on where the chest is.`],
            answer: { kind: 'text', value: ['../../Props/Chest'] },
          },
        },
        {
          kind: 'recall',
          prompt: md`List the four steps to spawn a scene from code, and when \`_ready\` runs.`,
          answer: md`\`preload\` the \`.tscn\`; \`instantiate()\` it; set properties such as position; \`add_child()\` it to a parent in the tree. \`_ready\` runs inside \`add_child\`, children first, before \`add_child\` returns.`,
        },
      ],
      cards: [
        { id: 'g03-1-c1', kind: 'concept', front: md`What is a scene, and what is an instance of it?`, back: md`A scene is a node tree saved as \`.tscn\`, a template. An instance is a copy of it inside another scene or created with \`instantiate()\`; changes to the scene file apply to every instance.` },
        { id: 'g03-1-c2', kind: 'cloze', text: md`\`var slime := SLIME_SCENE.{{}}()\` builds the node tree; \`add_child(slime)\` puts it in the scene tree.`, answers: ['instantiate'] },
        { id: 'g03-1-c3', kind: 'concept', front: md`Why use a group instead of a node path to find enemies?`, back: md`Paths break when the tree changes and spawned nodes get generated names. \`get_nodes_in_group("enemies")\` finds them wherever they are.` },
        { id: 'g03-1-c4', kind: 'concept', front: md`\`queue_free()\` versus \`free()\`?`, back: md`\`queue_free\` deletes the node and its children at the end of the frame, so code later in the frame can still touch it. \`free\` deletes immediately and is rarely needed.` },
        { id: 'g03-1-c5', kind: 'concept', front: md`What is at \`/root\` while the game runs?`, back: md`A \`Window\`. Its children are the autoloads (in order) and then the current main scene.` },
      ],
    },
    {
      id: 'g03-2',
      title: 'Signals between scenes: a coin, a HUD and the Events bus',
      minutes: 45,
      objectives: [
        'Connect signals in the Node dock and in code, and say when each is the better choice.',
        'Apply "call down, signal up" to decide which node holds a reference to which.',
        'Create an `Events` autoload and use it as a global signal bus.',
        'Build a coin pickup that updates a HUD label without either knowing about the other.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Kai walks over a coin. Four things should happen: the coin disappears, the counter in the corner goes up, a sound plays, and the gold total in the save data changes. The question is who tells whom. If the coin calls the HUD directly, the coin only works in rooms that have that exact HUD at that exact path; testing a coin in an empty room crashes. If the HUD searches the room for coins, it has to know about every kind of pickup.

Godot's answer, and the rule this course uses everywhere: **call down, signal up**. A node may call methods on its own children, because it created them and knows they exist. Anything that goes up or sideways is a signal: the node announces what happened and does not care who listens. For events many unrelated scenes care about, a global **signal bus** carries the signal.`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'Call down, signal up',
          md: md`- **Down**: a parent calls its children directly. \`Player\` calls \`$Sword.swing()\`; \`Room\` calls \`$Spawner.start()\`. The parent owns the child, so the reference is safe.
- **Up**: a child emits a signal; the parent connects to it in \`_ready\`. \`Sword\` emits \`hit_landed(target)\`; \`Player\` listens. The sword works under any parent, or none.
- **Sideways and far away**: unrelated scenes (a coin and the HUD, an enemy and the quest log) talk through the \`Events\` autoload: \`Events.coin_collected.emit(1)\`. Neither holds a reference to the other.`,
        },
        {
          kind: 'viz',
          viz: { type: 'godot.signalflow', scenario: 'updown' },
          task: md`Step through **call down, signal up**. Then untick **Sword is a child of Player** (the sword in a test room) and step again. Now tick **Sword calls get_parent() instead** and repeat both cases: which design survives the test room?`,
        },
        {
          kind: 'check',
          q: md`A \`HealthComponent\` node is a child of an enemy. When HP reaches 0, the enemy should play its death animation. Which design follows "call down, signal up"?`,
          options: [
            md`\`HealthComponent\` emits \`died\`; the enemy connects to it in \`_ready\` and plays the animation`,
            md`\`HealthComponent\` calls \`get_parent().play_death()\``,
            md`The enemy checks \`$HealthComponent.hp\` every frame`,
            md`\`HealthComponent\` finds the enemy with \`get_tree().get_first_node_in_group("enemies")\``,
          ],
          answer: 0,
          explain: md`The component reports upward with a signal, so it works on any enemy, on the player, or on a breakable pot (module c05 builds exactly this). Polling every frame works but wastes work and spreads the death logic. \`get_parent()\` assumes a parent with \`play_death\`; the group lookup finds *an* enemy, not necessarily this one.`,
        },
        {
          kind: 'text',
          md: md`### Connecting: editor or code

**In the editor**: select the emitting node, open **Node → Signals**, double-click the signal (for example \`body_entered\`), pick the receiving node and click **Connect**. Godot writes a method stub such as \`_on_body_entered\` in the receiver's script, and stores the connection in the \`.tscn\`. A green icon in the script's gutter marks connected methods.

**In code**: \`body_entered.connect(_on_body_entered)\` in \`_ready\`. The connection is visible in the script, and it is the only option for nodes created at run time and for autoloads.

Both are fine. The course connects in code, so every listing shows its own wiring.

### Autoloads

An **autoload** is a scene or script that Godot creates once at startup and adds under \`/root\` before the main scene. It survives scene changes, and its node name works as a global variable in every script. The course uses four: \`Events\` (this lesson), \`GameState\` (module g04), \`Audio\` and \`Transitions\` (later modules).`,
        },
        {
          kind: 'steps',
          title: 'Create the Events bus',
          steps: [
            md`Create \`scripts/autoload/events.gd\` with the listing below (in FileSystem: right-click \`scripts/autoload\` → **Create New → Script…**, inherits \`Node\`).`,
            md`Open **Project → Project Settings → Globals → Autoload**. Click the folder icon next to *Path*, pick \`events.gd\`, set **Node Name** to \`Events\`, and click **Add**. Leave *Global Variable* ticked.`,
            md`Run any scene and look at the Remote tree: \`/root/Events\` sits next to your scene.`,
          ],
          result: md`\`Events\` is listed in the Autoload tab and appears under \`/root\` at run time. Any script can now write \`Events.coin_collected\`.`,
          troubleshoot: [
            { problem: md`Error: *Class "Events" hides an autoload singleton.*`, fix: md`Remove \`class_name Events\` from the script. The autoload name already makes it global, and the two clash.` },
            { problem: md`A yellow warning says the signal \`coin_collected\` is declared but never emitted.`, fix: md`Expected for a bus, which only declares signals. The \`@warning_ignore("unused_signal")\` line above each signal silences it.` },
          ],
        },
        { kind: 'code', file: 'scripts/autoload/events.gd', code: EVENTS_V1 },
        { kind: 'assets', ids: ['objects', 'hero', 'sfx_coin'], note: md`The coin's frames are in the \`objects\` sheet; the panel lists its animations. Kai's sheet is for the stand-in walker.` },
        {
          kind: 'steps',
          title: 'Build the coin, a walker and the HUD',
          steps: [
            md`**Coin**: new scene, root \`Area2D\` named \`Coin\`. Child \`AnimatedSprite2D\` with a new SpriteFrames holding the coin frames from the \`objects\` sheet (8 FPS, autoplay). Child \`CollisionShape2D\` with a CircleShape2D of radius 5. On the root set **Collision → Layer** to 8 (\`pickup\`) only and **Mask** to 2 (\`player\`) only. Attach \`scripts/coin.gd\` (below) and save as \`scenes/pickups/coin.tscn\`.`,
            md`**Walker** (until module c02 makes the real player): new scene, root \`CharacterBody2D\` named \`Walker\`, a \`Sprite2D\` with Kai's sheet (y = \`-12\`), and a \`CollisionShape2D\` with a 10×6 RectangleShape2D at the feet. Layer 2 (\`player\`), mask 1 (\`world\`). Attach \`scripts/test_walker.gd\` and save as \`scenes/test_walker.tscn\`.`,
            md`**HUD**: new scene, root \`CanvasLayer\` named \`HUD\` (it draws on top of the game, unaffected by cameras). Child \`Label\` named \`CoinLabel\` at (4, 2), text \`Coins: 0\`, with the pixel font if the starter project's theme does not set it. Attach \`scripts/ui/coin_label.gd\` and save as \`ui/hud.tscn\`.`,
            md`In \`test_room.tscn\` instance the walker, five coins spread around, and the HUD. Press **F6** and collect the coins.`,
          ],
          result: md`Each coin vanishes when Kai's feet touch it and the label counts up to \`Coins: 5\`. Neither \`coin.gd\` nor \`coin_label.gd\` mentions the other.`,
          troubleshoot: [
            { problem: md`Kai walks over coins and nothing happens.`, fix: md`Check the layers: the walker must be on layer 2 and the coin's mask must include 2. The coin's *Monitoring* must be on (the default).` },
            { problem: md`Error: *Identifier "Events" not declared in the current scope.*`, fix: md`The autoload is missing or named differently. The node name in Project Settings must be exactly \`Events\`.` },
          ],
        },
        { kind: 'code', file: 'scripts/coin.gd', code: COIN },
        { kind: 'code', file: 'scripts/test_walker.gd', code: WALKER },
        { kind: 'code', file: 'scripts/ui/coin_label.gd', code: COIN_LABEL, note: md`The label connects to the bus in its own \`_ready\`. A coin in a room without a HUD emits into a bus with fewer listeners, and nothing breaks.` },
        {
          kind: 'viz',
          viz: { type: 'godot.signalflow', scenario: 'bus' },
          task: md`Step through the pickup with the bus. Click a connection line to disconnect GameState and step again. Then switch to **direct calls** and untick **the scene has a HUD**: where does the game stop?`,
          caption: md`\`emit()\` is an ordinary function call: every handler runs, in connection order, before \`emit\` returns to the coin. Autoloads are created before the main scene, so their handlers were connected first.`,
        },
        {
          kind: 'check',
          q: md`\`GameState\` (an autoload) and \`CoinLabel\` (in the HUD) both connect to \`Events.coin_collected\` in their \`_ready\`. When a coin emits, which handler runs first?`,
          options: [md`\`GameState\`'s, because autoloads enter the tree and become ready before the main scene`, md`\`CoinLabel\`'s, because UI updates first`, md`They run at the same time on different threads`, md`The order is random`],
          answer: 0,
          explain: md`Handlers run in the order they were connected. Autoloads are added under \`/root\` before the main scene, so their \`_ready\` (and their \`connect\`) happens first. Code should not depend on this order; if it must, emit two signals or have \`GameState\` emit its own \`gold_changed\` after updating, which module g04 does.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'g03-2-build',
            title: 'Collect the coins',
            goal: md`Make the pickup system that later rooms will reuse: coins announce themselves on the Events bus and a HUD label counts them.`,
            requirements: [
              md`Walking over each of five coins removes it and increases the label by its \`value\`.`,
              md`A coin with *Value* 5 set in the Inspector adds 5.`,
              md`Running \`coin.tscn\` alone with F6 does not crash (there is nothing to collect it, and no HUD).`,
              md`A room with a coin and no HUD works; a HUD with no coins shows \`Coins: 0\`.`,
              md`No script contains a node path that goes up the tree (\`..\`) or starts with \`/root\`.`,
            ],
            hints: [
              md`If one coin sometimes counts twice, keep the \`_collected\` flag: two bodies can enter in the same physics step, before \`queue_free\` takes effect.`,
              md`The label's initial text comes from \`_refresh()\` in \`_ready\`, so it is right even before the first coin.`,
            ],
            solution: [
              { file: 'scripts/autoload/events.gd', code: EVENTS_V1 },
              { file: 'scripts/coin.gd', code: COIN },
              { file: 'scripts/ui/coin_label.gd', code: COIN_LABEL },
              { file: 'scripts/test_walker.gd', code: WALKER },
            ],
            explain: md`The collision mask does the filtering, so the coin does not check what touched it. The bus decouples the two scenes completely: either can be tested, replaced or removed alone. Module g04 moves the count into \`GameState\` so it survives scene changes and saves.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'g03-2-paper',
            title: 'What goes on the bus',
            type: 'design',
            difficulty: 2,
            minutes: 8,
            statement: md`For each, say whether it should be a signal on the \`Events\` autoload, a local signal on the node, or a direct call, and why: (a) Kai's HP changed; (b) a boss was defeated (the quest log, the music and a door react); (c) the player presses attack and Kai must swing his sword; (d) a chest was opened.`,
            solution: [
              md`(a) Local signal on Kai's health (\`health_changed\`): the HUD connects to the character it displays. Putting every character's HP on the bus would need an extra "whose HP" argument and every listener would filter.`,
              md`(b) Bus (\`Events.boss_defeated\`): several unrelated systems in other scenes react, and none should hold a reference to the boss.`,
              md`(c) Direct call down: \`Player\` calls \`$Sword.swing()\` on its own child.`,
              md`(d) Usually local (\`opened\`) for the room's own logic (a door it opens), plus a bus signal if game-wide systems care (achievements, the save's world state, module r06).`,
            ],
            rubric: [md`Uses the bus only for events unrelated scenes care about`, md`Calls down to owned children`, md`Justifies each with who needs to know`],
          },
        },
        {
          kind: 'explain',
          prompt: md`Explain what goes wrong if the coin calls \`get_node("/root/Main/HUD/CoinLabel")\` directly, and how the Events bus avoids it.`,
          model: md`The coin then depends on one exact tree: a main scene named Main with a HUD child holding a CoinLabel. Testing the coin with F6, placing it in a room without a HUD, renaming the HUD or moving the label all make \`get_node\` fail and the next call crash. Every new listener (sound, save data) means editing the coin. With the bus the coin only knows the autoload, which always exists; it emits \`coin_collected\` and returns. Listeners connect themselves, and if there are none the signal simply has no effect.`,
        },
      ],
      cards: [
        { id: 'g03-2-c1', kind: 'concept', front: md`State "call down, signal up".`, back: md`A parent may call methods on its own children; children report upward with signals the parent connects to. Unrelated scenes talk through a signal bus.` },
        { id: 'g03-2-c2', kind: 'concept', front: md`What is an autoload, and where is it in the tree?`, back: md`A script or scene Godot creates at startup, added under \`/root\` before the main scene. It survives scene changes and its name is global.` },
        { id: 'g03-2-c3', kind: 'cloze', text: md`\`Events.coin_collected.{{}}(value)\` announces the pickup on the bus.`, answers: ['emit'] },
        { id: 'g03-2-c4', kind: 'concept', front: md`Does \`emit()\` return before or after the handlers run?`, back: md`After: emit calls every connected handler synchronously, in connection order, then returns.` },
        { id: 'g03-2-c5', kind: 'concept', front: md`Why must the Events script not have \`class_name Events\`?`, back: md`The autoload already registers the global name \`Events\`; a class with the same name clashes ("hides an autoload singleton").` },
      ],
    },
    {
      id: 'g03-3',
      title: 'Processing order and pausing',
      minutes: 35,
      objectives: [
        'Predict the order in which nodes process each frame and change it with `process_priority`.',
        'Pause the game with `get_tree().paused` and choose each node\'s `process_mode`.',
        'Build a pause menu that can both pause and unpause.',
        'Say which timers keep running during a pause, and how to make one stop.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Press Escape in the middle of a fight: the slimes freeze mid-hop, the ATB gauges stop filling, the pause menu appears and responds to the gamepad, and the music keeps playing quietly. That is four different behaviours from one boolean, \`get_tree().paused\`, because every node has a **process mode** that decides what pausing means for it.

Before pausing, one more thing about normal frames: the order in which nodes run.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'process_mode',
          md: md`Every node's *Process → Mode* (in code, \`process_mode\`) is one of:

- **Inherit** (default): use the parent's mode. The root counts as *Pausable*, so by default everything pauses.
- **Pausable**: runs only while the tree is not paused.
- **When Paused**: runs only while the tree is paused.
- **Always**: runs in both cases.
- **Disabled**: never runs.

"Runs" covers \`_process\`, \`_physics_process\`, input callbacks such as \`_unhandled_input\`, and, for physics bodies and areas, physics itself. A paused node is still drawn.`,
        },
        {
          kind: 'text',
          md: md`### The order within a frame

Each frame Godot runs the physics ticks that are due (each calls \`_physics_process\` on every node), then \`_process\` once on every node. Within each pass, nodes are visited in **tree order**: the order of the Scene dock from top to bottom, a parent before its children.

Order matters when one node reads what another wrote in the same frame. If a HUD bar reads Kai's HP in its \`_process\` and sits above Kai in the tree, it reads the value from before Kai took this frame's damage: the bar is one frame late. Usually one frame (16.7 ms) is invisible; for a camera following the player it is a visible jitter. Three fixes, in order of preference: have Kai emit a signal when HP changes (no polling, no order); move the reader below the writer in the tree; or set \`process_priority\` (lower numbers run first, default 0) on one of them. Godot 4.2 and later have a separate \`process_physics_priority\` for the physics pass.`,
        },
        {
          kind: 'check',
          q: md`\`Main\` has children in this order: \`HUD\`, \`World\`. \`World\` has a child \`Kai\`. All have \`process_priority\` 0 and a \`_process\`. In what order do they run, and what changes if you set \`HUD.process_priority = 10\`?`,
          options: [
            md`Main, HUD, World, Kai; with priority 10, HUD runs after the others`,
            md`Kai, World, HUD, Main; priority does nothing for \`_process\``,
            md`Main, World, Kai, HUD; priority 10 makes HUD run first`,
            md`The order is undefined unless priorities differ`,
          ],
          answer: 0,
          explain: md`Tree order is a pre-order walk: a node, then its children, top to bottom. \`process_priority\` sorts before tree order, lower first, so 10 moves HUD behind everything at 0.`,
        },
        {
          kind: 'viz',
          viz: { type: 'godot.scenetree', mode: 'pause' },
          task: md`Press **pause** with every node on *Inherit* and try to unpause. Then find a process mode for \`PauseMenu\` that lets it both pause and unpause. Finally make \`Music\` keep counting while paused, and make \`Slime\` freeze even when the game is not paused.`,
          caption: md`The counters are the number of \`_process\` calls each node received. The menu's script is the listing below: it toggles \`get_tree().paused\` from \`_unhandled_input\`, which only runs while the menu itself is processing.`,
        },
        {
          kind: 'check',
          q: md`Which process mode should the pause menu have, if its own script toggles the pause?`,
          options: [md`Always`, md`When Paused`, md`Pausable`, md`Inherit`],
          answer: 0,
          explain: md`*When Paused* never sees the key that pauses the game; *Pausable* and *Inherit* stop receiving input once paused, so the game cannot be unpaused. *Always* receives the key in both states. (An alternative split: a pausable node pauses, and a *When Paused* menu unpauses.)`,
        },
        {
          kind: 'steps',
          title: 'Build the pause menu',
          steps: [
            md`New scene: root \`Control\` named \`PauseMenu\`. In the toolbar's anchor menu choose **Full Rect** so it covers the screen.`,
            md`Add a \`ColorRect\` child, also Full Rect, colour black at about 50% alpha. Add a \`Label\` child with the text \`Paused\`, centred.`,
            md`Select \`PauseMenu\` and set **Node → Process → Mode** to **Always** in the Inspector.`,
            md`Attach \`ui/pause_menu.gd\` (below) and save as \`ui/pause_menu.tscn\`.`,
            md`Open \`ui/hud.tscn\` and instance \`pause_menu.tscn\` under \`HUD\`. Run the test room and press Escape twice.`,
          ],
          result: md`Escape darkens the screen and shows "Paused"; slimes, the spawner and the walker stop; Escape again resumes everything where it was.`,
          troubleshoot: [
            { problem: md`Escape pauses but a second press does nothing.`, fix: md`The menu's process mode is still *Inherit* or *Pausable*. Set it to *Always*.` },
            { problem: md`Escape does nothing at all.`, fix: md`The \`pause\` action is missing from the Input Map (lesson g01-2), or the menu is *When Paused*.` },
          ],
        },
        { kind: 'code', file: 'ui/pause_menu.gd', code: PAUSE_MENU, note: md`\`_unhandled_input\` receives input that no UI control consumed. \`set_input_as_handled()\` stops the same press from also reaching, say, the walker. Module r05 replaces this with a full menu with buttons and gamepad focus.` },
        {
          kind: 'text',
          md: md`### Timers and pausing

\`get_tree().create_timer(seconds)\` has a second parameter, \`process_always\`, which defaults to \`true\`: such a timer **keeps counting while the game is paused**. That is right for UI (a menu's fade) and wrong for gameplay: an enemy's \`await get_tree().create_timer(0.5).timeout\` windup would finish during the pause and the attack would land the moment you unpause. For gameplay waits write \`get_tree().create_timer(0.5, false)\`. A \`Timer\` *node* follows its own process mode like any other node.`,
        },
        {
          kind: 'numeric',
          q: md`At t = 0 a script runs \`await get_tree().create_timer(2.0).timeout\`. At t = 0.5 s the player pauses for 10 s. At what time does the timer fire with the default arguments, and at what time with \`create_timer(2.0, false)\`? Enter both.`,
          answer: { kind: 'vector', value: [2, 12] },
          explain: md`With \`process_always = true\` the pause does not matter: it fires at 2.0 s, during the pause. With \`false\` it stops counting for the 10 s of pause and fires at $2 + 10 = 12$ s.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'g03-3-build',
            title: 'Pause without side effects',
            goal: md`Make pausing safe for the test room: everything that is gameplay freezes, the menu works in both directions, and gameplay timers respect the pause.`,
            requirements: [
              md`Escape pauses and unpauses; the overlay is visible only while paused.`,
              md`Slimes, the spawner's countdown and the walker freeze during the pause and continue exactly where they were.`,
              md`The telegraphed strike from g02-3, placed in the room and triggered just before pausing, does not complete during the pause.`,
              md`The coin label still shows the right count after unpausing.`,
            ],
            hints: [
              md`The telegraph's windup uses \`create_timer(windup_time)\`, which ignores the pause. Pass \`false\` as the second argument.`,
              md`Nothing else needs code: the spawner and slimes inherit *Pausable* from the root.`,
            ],
            solution: [{ file: 'ui/pause_menu.gd', code: PAUSE_MENU }],
            explain: md`One boolean and per-node modes cover the whole feature. The only real trap is the SceneTreeTimer default, which is why gameplay code in this course passes \`false\` whenever it waits on a timer that should pause.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'g03-3-paper',
            title: 'Process modes for a battle',
            type: 'design',
            difficulty: 2,
            minutes: 8,
            statement: md`Tactical mode in Shardbound slows time instead of pausing it (module k04), but the pause menu must still freeze everything, including tactical mode. Give a process mode for each: the world with enemies and the party; the HUD's HP and ATB bars; the tactical menu; the pause menu; the music player; a screen-shake effect on the camera.`,
            solution: [
              md`World, enemies and party: *Inherit* from a pausable root, so they freeze.`,
              md`HUD bars: *Pausable* (inherit): they only change when gameplay does, and frozen bars are correct on a pause screen.`,
              md`Tactical menu: *Pausable*: it is part of gameplay, so the pause menu freezes it too.`,
              md`Pause menu: *Always*, so it can pause and unpause.`,
              md`Music: *Always*, perhaps with volume lowered while paused; or *Pausable* if you want silence. A design choice.`,
              md`Screen shake: *Pausable* (inherit), so the camera does not keep shaking behind the menu.`,
            ],
            rubric: [md`Only the pause menu (and optionally music) is Always`, md`Tactical menu is pausable, distinct from slowed time`, md`Gives a reason for the music choice`],
          },
        },
        {
          kind: 'recall',
          prompt: md`What does each process mode do, and which mode does the root effectively have?`,
          answer: md`Inherit: parent's mode. Pausable: runs when not paused. When Paused: runs only when paused. Always: both. Disabled: never. The root behaves as Pausable, so by default everything pauses.`,
        },
      ],
      cards: [
        { id: 'g03-3-c1', kind: 'concept', front: md`In what order do nodes get \`_process\` each frame?`, back: md`Tree order (pre-order, top to bottom of the Scene dock), after sorting by \`process_priority\` (lower first). Physics ticks run before \`_process\`.` },
        { id: 'g03-3-c2', kind: 'cloze', text: md`To pause the game: \`get_tree().{{}} = true\`.`, answers: ['paused'] },
        { id: 'g03-3-c3', kind: 'concept', front: md`Which process mode for a pause menu that toggles the pause itself?`, back: md`Always: When Paused cannot see the key that pauses; Pausable cannot see the key that unpauses.` },
        { id: 'g03-3-c4', kind: 'concept', front: md`Does \`get_tree().create_timer(1.0)\` keep counting while paused?`, back: md`Yes: \`process_always\` defaults to true. Use \`create_timer(1.0, false)\` for gameplay waits.` },
        { id: 'g03-3-c5', kind: 'concept', front: md`A HUD reads Kai's HP in \`_process\` and is above Kai in the tree. What goes wrong and what is the best fix?`, back: md`It shows last frame's value (one frame late). Best fix: Kai emits a signal when HP changes and the HUD updates in the handler.` },
      ],
    },
  ],
  problems: [
    {
      id: 'g03-p1',
      title: 'Ready order in a room',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`A room \`Cave\` has children \`TileMapLayer\`, \`Party\` and \`HUD\`. \`Party\` has \`Kai\` and \`Lyra\`; \`Kai\` has a child \`Sword\`. Counting from 1, in which position do \`Kai\` and \`Cave\` run \`_ready\`?`,
      solution: [md`Post-order: TileMapLayer (1), Sword (2), Kai (3), Lyra (4), Party (5), HUD (6), Cave (7).`, md`Kai is 3rd and Cave is 7th: the room's \`_ready\` can rely on everything in it.`],
      answer: { kind: 'vector', value: [3, 7] },
      areas: ['godot'],
    },
    {
      id: 'g03-p2',
      title: 'Relative path',
      type: 'concept',
      difficulty: 1,
      minutes: 3,
      statement: md`In the tree \`Main → World → Enemies → Slime\` and \`Main → HUD → BossBar\`, write the relative path from \`Slime\` to \`BossBar\`. Then say why the slime should not use it.`,
      solution: [md`Up three times (Enemies, World, Main), then down: \`../../../HUD/BossBar\`.`, md`It ties the slime to this exact tree; the slime should emit a signal (or use the bus) and let the HUD listen.`],
      answer: { kind: 'text', value: ['../../../HUD/BossBar'] },
      areas: ['godot'],
    },
    {
      id: 'g03-p3',
      title: 'Spawn times',
      type: 'compute',
      difficulty: 2,
      minutes: 5,
      statement: md`The lesson's spawner starts with \`_time_left = 0\`, uses \`interval = 1.5\` and \`max_slimes = 4\`, and the room starts empty. Ignoring rounding to frames, at what time (s) does the 4th slime appear, and how many slimes are there at t = 10 s if none are killed?`,
      solution: [md`The first frame has \`_time_left <= 0\`, so a slime spawns at t = 0; then at 1.5, 3.0 and 4.5 s. The 4th appears at 4.5 s.`, md`After that the cap stops spawning, so at 10 s there are still 4.`],
      answer: { kind: 'vector', value: [4.5, 4] },
      areas: ['godot'],
    },
    {
      id: 'g03-p4',
      title: 'Double coins',
      type: 'debug',
      difficulty: 2,
      minutes: 6,
      statement: md`A coin's mask includes \`player\` and \`party\`. When Kai and Lyra reach a coin in the same physics step, the counter goes up by 2. The coin's handler is:

\`\`\`gdscript
func _on_body_entered(_body: Node2D) -> void:
	Events.coin_collected.emit(value)
	queue_free()
\`\`\`

Explain and fix.`,
      solution: [md`Both bodies enter in the same physics step, so \`body_entered\` fires twice. \`queue_free\` deletes the coin only at the end of the frame, so the second call still runs.`, md`Guard with a flag (\`if _collected: return\` and set it before emitting), or disable detection with \`set_deferred("monitoring", false)\` and still keep the flag for the current step.`],
      rubric: [md`Two body_entered in one step`, md`queue_free is deferred`, md`A guard flag (or equivalent)`],
      areas: ['godot'],
    },
    {
      id: 'g03-p5',
      title: 'Stuck in the pause',
      type: 'debug',
      difficulty: 1,
      minutes: 4,
      statement: md`A pause menu's script toggles \`get_tree().paused\` in \`_unhandled_input\`. Pressing Escape pauses the game, but pressing it again does nothing. The menu's process mode is *Inherit* and its parent is the HUD. What is wrong?`,
      solution: [md`*Inherit* resolves to the HUD's mode, which inherits *Pausable* from the root. While paused, the menu does not process, so \`_unhandled_input\` is never called.`, md`Set the menu's process mode to *Always*.`],
      rubric: [md`Resolves Inherit up the tree`, md`Notes input callbacks stop while paused`, md`Fix: Always`],
      areas: ['godot'],
    },
    {
      id: 'g03-p6',
      title: 'Priorities',
      type: 'compute',
      difficulty: 2,
      minutes: 4,
      statement: md`Siblings \`A\`, \`B\`, \`C\` are in that tree order with \`process_priority\` 0, \`-5\` and 0. A fourth sibling \`D\` after them has priority \`-5\`. In what order do they run \`_process\`? Enter the letters separated by commas.`,
      solution: [md`Lower priority first; ties keep tree order. Priority \`-5\`: B, then D. Priority 0: A, then C.`, md`Order: B, D, A, C.`],
      answer: { kind: 'text', value: ['B,D,A,C', 'B, D, A, C', 'BDAC'] },
      areas: ['godot'],
    },
    {
      id: 'g03-p7',
      title: 'Composition',
      type: 'concept',
      difficulty: 2,
      minutes: 8,
      statement: md`A teammate proposes \`class Enemy extends CharacterBody2D\`, \`class FlyingEnemy extends Enemy\`, \`class FlyingShootingEnemy extends FlyingEnemy\` and so on. Explain how Godot's scenes and nodes offer a different approach, and give one case where inheritance is still the right tool.`,
      solution: [
        md`With scenes, behaviour comes from child nodes: a health component, a hurtbox, a movement controller, a shooter. A bat is a body plus "flying" movement plus a hurtbox; a turret is a body plus a shooter. New combinations need no new class, and each piece can be tested alone. Deep chains force every combination into one line of ancestry and duplicate code when two branches need the same feature.`,
        md`Inheritance remains right for a small, stable "is a" relationship with shared core behaviour, such as the course's \`Character\` class (module c05) that every party member and enemy body extends, or \`EquipmentData extends ItemData\` (module g04).`,
      ],
      rubric: [md`Describes composition with child nodes or instanced scenes`, md`Names the combinatorial problem of deep hierarchies`, md`A sensible case for shallow inheritance`],
      areas: ['godot', 'systems'],
    },
    {
      id: 'g03-p8',
      title: 'Clear the area',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 8,
      statement: md`Write \`func clear_enemies_near(center: Vector2, radius: float) -> int\` that frees every node in the group \`enemies\` within \`radius\` pixels of \`center\` (global coordinates) and returns how many it freed.`,
      solution: [
        md`\`\`\`gdscript
func clear_enemies_near(center: Vector2, radius: float) -> int:
	var freed := 0
	for node in get_tree().get_nodes_in_group("enemies"):
		var enemy := node as Node2D
		if enemy and enemy.global_position.distance_to(center) <= radius:
			enemy.queue_free()
			freed += 1
	return freed
\`\`\``,
        md`\`get_nodes_in_group\` returns a new array, so freeing while looping is safe, and \`queue_free\` defers deletion anyway. The \`as Node2D\` cast skips any non-2D node that ended up in the group. Comparing squared distances (\`distance_squared_to\` with \`radius * radius\`) avoids a square root per enemy.`,
      ],
      rubric: [md`Iterates the group`, md`Uses global positions and a distance test`, md`Uses queue_free and counts`],
      areas: ['godot'],
    },
  ],
};
