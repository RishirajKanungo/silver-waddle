import { md, gd, type Module } from '../types';

// ------------------------------------------------------------------ lesson c04-1: tiles and terrains
const GROUND_LAYER = gd`
class_name GroundLayer
extends TileMapLayer

## Terrain set and terrain indices, in the order the TileSet's Terrain Sets list them.
const TERRAIN_SET := 0
const WATER := 0


## The "surface" custom data of the tile under a world position: "grass", "sand", "stone" or "".
func surface_at(world_position: Vector2) -> String:
    var cell := local_to_map(to_local(world_position))
    var data := get_cell_tile_data(cell)
    if data == null:
        return ""  # no tile in this cell
    return str(data.get_custom_data("surface"))


## True when the cell's tile has a collision polygon on physics layer 0.
func is_solid(cell: Vector2i) -> bool:
    var data := get_cell_tile_data(cell)
    return data != null and data.get_collision_polygons_count(0) > 0


## Paints water at runtime; Godot chooses the edge tiles of the cells and their neighbours
## from the terrain's peering bits, exactly as the editor's terrain brush does.
func add_water(cells: Array[Vector2i]) -> void:
    set_cells_terrain_connect(cells, TERRAIN_SET, WATER)
`;

const FOOTSTEPS = gd`
class_name Footsteps
extends AudioStreamPlayer2D

## One sound per surface name from the TileSet's "surface" custom data layer.
@export var sounds: Dictionary[String, AudioStream] = {}
## Played on surfaces that have no entry above.
@export var fallback: AudioStream


func play_step(surface: String) -> void:
    stream = sounds.get(surface, fallback)
    if stream == null:
        return
    pitch_scale = randf_range(0.9, 1.1)
    play()
`;

// ------------------------------------------------------------------ lesson c04-2: layers, y-sort, rooms
const TRANSITIONS = gd`
extends CanvasLayer

## The Marker2D name the next room should place the player at.
var spawn_name := ""
var _busy := false

@onready var fade: ColorRect = $Fade


func _ready() -> void:
    # Keep fading while the game is paused for the change.
    process_mode = Node.PROCESS_MODE_ALWAYS
    layer = 100  # above the game and the HUD
    fade.color.a = 0.0


## Fades out, swaps the room, fades in. The new room reads spawn_name in its _ready.
func change_room(scene_path: String, target_spawn: String) -> void:
    if _busy:
        return  # a second door touched during the fade is ignored
    _busy = true
    spawn_name = target_spawn
    get_tree().paused = true
    await _fade_to(1.0)
    get_tree().change_scene_to_file(scene_path)
    # The change happens at the end of this frame; wait for it before fading back in.
    await get_tree().process_frame
    await get_tree().process_frame
    get_tree().paused = false
    await _fade_to(0.0)
    _busy = false


func _fade_to(alpha: float) -> void:
    var tween := create_tween()
    tween.tween_property(fade, "color:a", alpha, 0.25)
    await tween.finished
`;

const DOOR = gd`
extends Area2D

## The room this door leads to.
@export_file("*.tscn") var target_room := ""
## Name of the Marker2D in the target room where the player appears.
@export var target_spawn := ""


func _ready() -> void:
    body_entered.connect(_on_body_entered)


func _on_body_entered(body: Node2D) -> void:
    if body is Player:
        Transitions.change_room(target_room, target_spawn)
`;

const ROOM = gd`
class_name Room
extends Node2D

@onready var player: Player = $World/Player
@onready var spawns: Node2D = $Spawns


func _ready() -> void:
    # Arriving through a door: stand on the named marker. Running the room directly: stay put.
    if Transitions.spawn_name == "":
        return
    var marker := spawns.get_node_or_null(Transitions.spawn_name) as Marker2D
    if marker:
        player.global_position = marker.global_position
    else:
        push_warning("No spawn point named %s in %s" % [Transitions.spawn_name, scene_file_path])
`;

// ------------------------------------------------------------------ lesson c04-3: cameras
const GAME_CAMERA = gd`
class_name GameCamera
extends Camera2D

## The node to follow, usually the player.
@export var target: Node2D
## How far ahead of the target the camera aims at full walking speed, px.
@export var look_ahead := 24.0
## How quickly the look-ahead follows a change of direction (higher is faster), 1/s.
@export var look_ahead_rate := 3.0
## The speed that counts as full speed for the look-ahead, px/s.
@export var walk_speed := 90.0

var _look := Vector2.ZERO


func _ready() -> void:
    # Move in physics frames, the same clock as the player, so the two never drift apart.
    process_callback = Camera2D.CAMERA2D_PROCESS_PHYSICS
    position_smoothing_enabled = true
    position_smoothing_speed = 5.0


func _physics_process(delta: float) -> void:
    if target == null:
        return
    var velocity := Vector2.ZERO
    var body := target as CharacterBody2D
    if body:
        velocity = body.velocity
    var wanted := (velocity / walk_speed).limit_length(1.0) * look_ahead
    # Exponential easing (m03): the same feel at any frame rate.
    _look = _look.lerp(wanted, 1.0 - exp(-look_ahead_rate * delta))
    global_position = target.global_position + _look


## Limits the view to the used rectangle of a tile layer, so it never shows outside the room.
func fit_to(map: TileMapLayer) -> void:
    var used := map.get_used_rect()
    var tile := map.tile_set.tile_size
    var origin := map.global_position
    limit_left = int(origin.x) + used.position.x * tile.x
    limit_top = int(origin.y) + used.position.y * tile.y
    limit_right = int(origin.x) + used.end.x * tile.x
    limit_bottom = int(origin.y) + used.end.y * tile.y


## Jump straight to the target, without smoothing: use after placing the player in a new room.
func snap_to_target() -> void:
    if target == null:
        return
    _look = Vector2.ZERO
    global_position = target.global_position
    reset_smoothing()
`;

const ROOM_CAMERA = gd`
class_name Room
extends Node2D

@onready var player: Player = $World/Player
@onready var spawns: Node2D = $Spawns
@onready var ground: TileMapLayer = $Ground
@onready var camera: GameCamera = $GameCamera


func _ready() -> void:
    if Transitions.spawn_name != "":
        var marker := spawns.get_node_or_null(Transitions.spawn_name) as Marker2D
        if marker:
            player.global_position = marker.global_position
    camera.target = player
    camera.fit_to(ground)
    # Without this the camera would glide in from wherever it was placed in the editor.
    camera.snap_to_target()
`;

const SCREEN_CAMERA = gd`
class_name ScreenCamera
extends Camera2D

## The node whose screen the camera shows.
@export var target: Node2D


func _ready() -> void:
    process_callback = Camera2D.CAMERA2D_PROCESS_PHYSICS
    # A short pan between screens; set to false for an instant cut.
    position_smoothing_enabled = true
    position_smoothing_speed = 8.0


func _physics_process(_delta: float) -> void:
    if target == null:
        return
    var screen := get_viewport_rect().size  # 320×180
    var cell := (target.global_position / screen).floor()
    global_position = cell * screen + screen / 2.0
`;

export const MODULE: Module = {
  id: 'c04',
  part: 'core',
  order: 4,
  title: 'Tile worlds, rooms and cameras',
  summary: 'TileMapLayer and TileSet setup with physics and terrains, layered maps and Y-sorting, rooms as scenes joined by doors and a Transitions autoload, and a Camera2D with limits, smoothing, drag margins and look-ahead.',
  relevance: md`Every place in Shardbound (the town, the overworld with its cliffs and pond, the dungeon) is a room scene built from 16×16 tiles. This module sets up the TileSets once with collision and terrains so painting a room takes minutes, makes characters walk behind trees and roofs correctly, joins rooms with doors that fade and place the player at the right spawn point, and gives the game a camera that follows smoothly and never shows outside a room.`,
  prereqs: ['c02', 'g03'],
  areas: ['godot', 'art', 'feel'],
  lessons: [
    {
      id: 'c04-1',
      title: 'TileMapLayer, TileSets and terrains',
      minutes: 45,
      objectives: [
        'Create a TileMapLayer with a 16×16 TileSet from an atlas image.',
        'Add a physics layer to the TileSet and give tiles collision shapes.',
        'Explain terrain sets, terrains and peering bits, and how many tiles each matching mode needs.',
        'Paint terrains in the editor and at runtime with set_cells_terrain_connect.',
        'Read per-tile custom data at a world position.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A 320×180 screen is 20×11.25 tiles of 16×16 pixels. Drawing a room as one big image would make every change a trip to the art program and give collision no structure. A **tile map** stores a grid of small references instead: "cell (4, 7) shows tile (2, 3) of the overworld atlas". The art is reused hundreds of times, collision and other data live on the tiles, and a room is painted in the editor like a picture.

The hard part of tiles is edges. A pond needs a shoreline that bends around each corner; a path needs edges that join. Choosing those edge tiles by hand is slow and error-prone, so Godot can choose them for you: you paint "water" and it picks the shoreline tiles from rules stored on each tile. That is **autotiling**, which Godot calls **terrains**.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'TileMapLayer and TileSet',
          md: md`- \`TileMapLayer\` (Godot 4.3+) is a node that holds one grid of tiles. A room uses several, one per layer (ground, decoration, objects, above the player). The older \`TileMap\` node, which held all layers in one node, is deprecated.
- A \`TileSet\` is a resource shared by layers: the tile size (16×16 here), one or more **atlas sources** (images cut into tiles), and per-tile data: **physics layers** (collision polygons), **terrain sets** (autotiling rules) and **custom data layers** (any value you name, such as \`surface\`).
- Coordinates: \`local_to_map(local_position)\` gives the cell \`Vector2i\` containing a point; \`map_to_local(cell)\` gives the cell's centre. \`set_cell(cell, source_id, atlas_coords)\` places a tile; \`get_cell_tile_data(cell)\` returns its \`TileData\` (or \`null\`).`,
        },
        { kind: 'assets', ids: ['tiles_overworld', 'tiles_dungeon'], note: md`The overworld sheet has a 3×3 cliff block with a face row and stairs, and two corner terrains of 15 tiles each (path and water). The dungeon sheet has floors, a wall-top block and pits. Every image is a 16-column grid of 16×16 tiles.` },
        {
          kind: 'steps',
          title: 'Set up the overworld TileSet',
          steps: [
            md`In \`scenes/test_room.tscn\`, add a \`TileMapLayer\` named \`Ground\`. In the Inspector, *Tile Set* → **New TileSet**. Click the TileSet to expand it and check *Tile Size* is (16, 16).`,
            md`Open the **TileSet** panel at the bottom of the editor. Drag \`assets/tiles/overworld.png\` from the FileSystem dock into its left column. Answer **Yes** when Godot offers to create tiles automatically in non-transparent areas.`,
            md`Back in the Inspector, expand the TileSet's **Physics Layers** and click *Add Element*. Set its *Collision Layer* to layer 1 (\`world\`) and clear its mask. Tiles on this layer now block bodies that mask \`world\`, such as the player.`,
            md`In the TileSet panel choose **Paint**, then *Paint Properties* → **Physics Layer 0**. Click the rock, stump, fence, tree trunk and the water tiles: each click gives the tile a full-tile collision square. For a fence or trunk, drag the polygon's points to cover only the base.`,
            md`Add a **Custom Data Layer** named \`surface\` of type *String*. Paint \`grass\` on the grass tiles, \`sand\` on the path tiles and \`stone\` on the cliff and stairs.`,
            md`Select the \`Ground\` layer, open the **TileMap** panel, pick grass tiles and paint the room. Run with **F6**; turn on **Debug → Visible Collision Shapes** to see the tile collisions.`,
          ],
          result: md`A grass room with rocks and a fence that Kai cannot walk through. With visible collision shapes on, every solid tile shows its shape.`,
          troubleshoot: [
            { problem: md`Kai walks through solid tiles.`, fix: md`The TileSet's physics layer must be on a layer the player's *Mask* includes (layer 1, \`world\`). Also check you painted the collision on the right physics layer index.` },
            { problem: md`Tiles show thin lines or bleed between them when the camera moves.`, fix: md`Texture filtering must be *Nearest* (the project default here). If lines remain, enable *Use Texture Padding* on the atlas source (it is on by default).` },
          ],
        },
        {
          kind: 'text',
          md: md`### Terrains and peering bits

A **terrain set** groups terrains that blend with each other (here: water on grass). Each tile in the set says two things:

- its **terrain** (the centre: is this a water tile at all?), and
- its **peering bits**: for each side and/or corner, which terrain is on the other side.

When you paint, Godot looks at each affected cell's neighbours and picks the tile whose peering bits match them. The **mode** of the set decides which bits exist:

| Mode | Bits per tile | Tiles for a complete set | Typical use |
|---|---|---|---|
| Match Sides | 4 (N, E, S, W) | 16 | thin walls, pipes, fences |
| Match Corners | 4 (the corners) | 16 patterns: plain grass plus 15 water tiles | organic shapes: water, paths, grass patches |
| Match Corners and Sides | 8 | 47 | precise blob shapes, wall tops |

Why 47 and not $2^8 = 256$? A corner only matters if both sides next to it are the same terrain: with water to the north and east, the north-east corner decides between a full tile and an inner corner; with grass to the north, the north-east corner is grass anyway. Applying that rule to all 256 patterns leaves 47 distinct tiles.

The overworld sheet's water and path sets are **Match Corners** sets: four corners, each water or grass, $2^4 = 16$ combinations. "All grass" is just the grass tile; the other 15 (14 transitions and the full water tile) are the 15-tile set.`,
        },
        {
          kind: 'derive',
          title: 'counting the tiles a terrain mode needs',
          goal: md`Count the tiles needed for Match Sides and Match Corners, and see why Match Corners shows inner corners that Match Sides cannot.`,
          steps: [
            { md: md`Match Sides has 4 bits, each "same terrain" or "other": $2^4 = 16$ patterns, one tile each.` },
            {
              md: md`Match Corners also has 4 bits, so also 16 patterns. Of those, "no corner is water" is the plain grass tile, leaving 15 water tiles: 14 transitions and the full tile.`,
              choose: {
                prompt: md`How many patterns does a set of $b$ independent two-valued bits have?`,
                options: [md`$2^b$`, md`$b^2$`, md`$2b$`],
                answer: 0,
                explain: md`Each bit doubles the count: $2 \cdot 2 \cdot \ldots = 2^b$.`,
              },
            },
            { md: md`A water cell surrounded by water on all four sides but grass diagonally (an inner corner) has side bits 1111 in Match Sides: the same as a full water tile. Match Sides cannot draw the small grass corner; Match Corners records it in the corner bit. Match Corners and Sides records both and needs 47 tiles.` },
          ],
          takeaway: md`Choose the mode by the art: shapes made of edges (walls, fences) need sides, organic blobs need corners. More bits mean more tiles to draw.`,
        },
        {
          kind: 'viz',
          viz: { type: 'core.autotile', mode: 'corners' },
          task: md`Click a few grass cells to paint water and watch the neighbours change. Select a cell and read its corner bits and tile name. Make a diagonal pair of water cells and find the \`water_diag\` tile. Then switch to **sides** and **corners + sides** and compare the inner corners of the same shape and the count of distinct tiles.`,
          caption: md`In corners mode each painted cell sets its four corners to water, and each cell's tile is chosen from its four corner bits (TL, TR, BL, BR), drawn with the real overworld water set. In sides and corners + sides modes the bits come from the 4 or 8 neighbouring cells; those modes are drawn as simple shapes. Bit order: corners TL=1, TR=2, BL=4, BR=8; sides N=1, E=2, S=4, W=8, then the diagonals NE=16, SE=32, SW=64, NW=128.`,
        },
        {
          kind: 'check',
          q: md`In Match Corners mode a cell's corners are TL = water, TR = water, BL = grass, BR = grass. Which tile from the overworld water set does it need?`,
          options: [md`\`water_b\`: the bottom edge of a pond, water above and grass below`, md`\`water_t\``, md`\`water_inner_tl\``, md`\`water_diag_a\``],
          answer: 0,
          explain: md`Water across the top two corners and grass across the bottom two is the strip along a pond's bottom edge. \`water_t\` is the opposite (water at the bottom corners).`,
        },
        {
          kind: 'steps',
          title: 'Make the water terrain',
          steps: [
            md`Select the TileSet in the Inspector. Under **Terrain Sets**, *Add Element*; set its *Mode* to **Match Corners**. Expand it, *Add Element* under *Terrains*, name it \`water\` and give it a blue colour.`,
            md`In the TileSet panel choose **Paint** → *Paint Properties* → **Terrains**, terrain set 0, terrain \`water\`. On each of the 15 water tiles, click the corners that are water: the corners light up in the terrain's colour. For \`water_c\` click all four corners and the centre.`,
            md`For the transition tiles, also click the centre if you want them to count as water when painting. A common choice: the centre is water for \`water_c\`, the inner corners and the diagonals.`,
            md`In the **TileMap** panel open the **Terrains** tab, choose \`water\` and paint on the \`Ground\` layer. Paint a pond, then erase part of it with right-click.`,
          ],
          result: md`Painting water draws a pond with a continuous shoreline. Every change updates the neighbouring tiles' edges.`,
          troubleshoot: [
            { problem: md`Painting places random tiles or leaves gaps.`, fix: md`A corner combination has no tile: Godot falls back to the closest match. Check each tile's bits against the shape of its art; the selected cell readout in the figure shows the expected bits.` },
            { problem: md`The Terrains tab is empty.`, fix: md`The terrain set must exist on the TileSet that this layer uses, and at least one tile must have bits painted.` },
          ],
        },
        { kind: 'code', file: 'scripts/ground_layer.gd', code: GROUND_LAYER, note: md`\`to_local\` converts a world position into the layer's own coordinates first, so the query still works if the layer is moved. \`get_custom_data\` returns a \`Variant\`; \`str()\` turns a missing value into an empty string. \`set_cells_terrain_connect\` takes the cells, the terrain set index and the terrain index.` },
        {
          kind: 'check',
          q: md`Kai stands at world position (100, 37) and the \`Ground\` layer sits at (0, 0) with 16×16 tiles. Which cell does \`local_to_map(to_local(Vector2(100, 37)))\` return?`,
          options: [md`\`Vector2i(6, 2)\``, md`\`Vector2i(7, 3)\``, md`\`Vector2i(100, 37)\``, md`\`Vector2i(6, 3)\``],
          answer: 0,
          explain: md`$\lfloor 100/16 \rfloor = 6$ and $\lfloor 37/16 \rfloor = 2$. Cells are counted from 0, and each covers $[16c, 16c + 16)$.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'c04-1-build',
            title: 'Footsteps that know the ground',
            goal: md`Make Kai's footsteps (c02-3) depend on the tile he walks on: grass, sand or stone, read from the \`surface\` custom data.`,
            requirements: [
              md`Walking on grass, path and cliff-top stone tiles plays three different step sounds.`,
              md`Tiles without a \`surface\` value fall back to a default sound, without errors.`,
              md`Moving or offsetting the \`Ground\` layer in the room does not break the lookup.`,
              md`Painting water at runtime with \`add_water([...])\` produces correct shorelines.`,
            ],
            hints: [
              md`Attach \`scripts/ground_layer.gd\` to \`Ground\` and add it to a group \`ground\` (*Node → Groups*). The player can find it with \`get_tree().get_first_node_in_group("ground") as GroundLayer\`.`,
              md`Replace Kai's \`Footsteps\` node script with the \`Footsteps\` class below and fill \`sounds\` in the Inspector. In \`_on_sprite_frame_changed\`, call \`footsteps.play_step(ground.surface_at(global_position))\`.`,
            ],
            solution: [
              { file: 'scripts/footsteps.gd', code: FOOTSTEPS },
              { file: 'scripts/ground_layer.gd', code: GROUND_LAYER },
            ],
            explain: md`The data lives on the tiles, so a new surface is a new custom data value and a new dictionary entry, with no code changes. \`Dictionary[String, AudioStream]\` (typed dictionaries, Godot 4.4) gives the Inspector a key and value editor of the right types.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'c04-1-paper',
            title: 'Corner bits to a tile',
            type: 'compute',
            difficulty: 1,
            minutes: 5,
            statement: md`Using the bit values TL = 1, TR = 2, BL = 4, BR = 8, compute the mask of a cell whose corners are water at TL, TR and BL, and of a cell with water only at BR. Enter both masks.`,
            solution: [md`First cell: $1 + 2 + 4 = 7$. Only its bottom-right corner is grass: an inner corner tile (\`water_inner_tl\` in the overworld sheet, the tile at the top-left of a grass island).`, md`Second cell: $8$. Water in one corner only: the outer corner at the top-left of a pond (\`water_tl\`).`],
            answer: { kind: 'vector', value: [7, 8] },
          },
        },
        {
          kind: 'recall',
          prompt: md`What are peering bits, and what does Godot do with them when you paint a terrain?`,
          answer: md`Per-tile flags saying which terrain lies across each side and/or corner of the tile. When painting, Godot chooses for the painted cells and their neighbours the tiles whose peering bits match the terrains actually around them, so edges join up.`,
        },
        {
          kind: 'explain',
          prompt: md`Why does Godot 4.3 replace the single TileMap node (with internal layers) by one TileMapLayer node per layer?`,
          model: md`Each layer becomes an ordinary node with its own position, visibility, z-index, Y-sort setting, modulate and script, all editable and animatable like any other node. Separate nodes can be y-sorted together with characters, shown or hidden independently (a roof layer that fades when the player walks inside), and reached by name from code. The old node kept those settings in arrays inside one node, which made them awkward to change and impossible to interleave with other nodes in the scene tree.`,
        },
      ],
      cards: [
        { id: 'c04-1-c1', kind: 'concept', front: md`How many tiles does a complete set need for Match Sides, Match Corners, and Match Corners and Sides?`, back: md`16, 16 (plain grass plus 15 water tiles: 14 transitions and the full tile), and 47 (a corner only matters when both sides next to it match).` },
        { id: 'c04-1-c2', kind: 'cloze', text: md`\`{{}}(cells, terrain_set, terrain)\` paints a terrain at runtime and picks the edge tiles.`, answers: ['set_cells_terrain_connect'] },
        { id: 'c04-1-c3', kind: 'compute', front: md`16×16 tiles, layer at the origin. Cell x index of world x = 250?`, answer: { kind: 'number', value: 15 }, back: md`$\lfloor 250/16 \rfloor = 15$.` },
        { id: 'c04-1-c4', kind: 'concept', front: md`Where do tile collisions come from in a TileMapLayer?`, back: md`From the TileSet: add a Physics Layer (with a collision layer such as \`world\`), then paint collision polygons onto tiles in the TileSet panel.` },
        { id: 'c04-1-c5', kind: 'concept', front: md`How do you read a per-tile value such as the surface under the player?`, back: md`Add a Custom Data Layer to the TileSet and paint values; at runtime \`get_cell_tile_data(local_to_map(to_local(pos))).get_custom_data("surface")\`, checking for \`null\`.` },
      ],
    },
    {
      id: 'c04-2',
      title: 'Layers, Y-sorting and rooms',
      minutes: 45,
      objectives: [
        'Split a room into ground, decoration, y-sorted objects and above-player layers.',
        'Y-sort characters and objects with y_sort_enabled and origins at the feet.',
        'Build rooms as scenes joined by door areas and spawn markers.',
        'Write a Transitions autoload that fades, changes scene and carries a spawn-point name.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Kai walks north behind a tree: the canopy should cover his head. He walks south past it: he should cover the trunk. He walks under a roof's overhang: the roof should cover him. Then he steps through the door of a house and arrives inside, standing on the doormat, after a short fade.

Two separate mechanisms make that work. **Draw order** decides who covers whom, through layers and Y-sorting. **Rooms** are separate scenes, swapped by an autoload that survives the swap and remembers where to put the player.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Layers and Y-sorting',
          md: md`- **Layers**: a room is drawn as a stack. Typical order, bottom to top: \`Ground\` (grass, paths, water), \`Decoration\` (flowers, cracks: never cover anyone), \`World\` (a y-sorted \`Node2D\` holding the player, NPCs, trees, rocks, and optionally a y-sorted \`TileMapLayer\` of tall tiles), \`AbovePlayer\` (roofs, tree canopies that should always cover characters).
- **Y-sorting**: with \`y_sort_enabled\` on a \`Node2D\`, its children are drawn in order of their \`position.y\`: further up the screen first, further down on top. Each node's origin must be where it touches the ground (the feet), or the comparison is meaningless.
- In a y-sorted \`TileMapLayer\`, each tile sorts individually by its cell position plus the tile's **Y Sort Origin** (a per-tile setting in the TileSet).`,
        },
        {
          kind: 'viz',
          viz: { type: 'core.ysort' },
          task: md`Walk around the tree, the rock and the villager. Turn \`y_sort_enabled\` off: Kai is drawn over everything because he was added to the scene last. Turn it back on and set the tree's origin to **sprite centre**: find the band north of the trunk where Kai is wrongly drawn in front of the canopy, and measure it with the sort lines.`,
          caption: md`Each white tick is an object's origin, the y used for sorting; Kai's is yellow. The list shows the current draw order. With the tree's origin at its sprite centre, the tree sorts 16 px too far up, so Kai stands "in front" of it while his feet are up to 16 px behind the trunk.`,
        },
        {
          kind: 'check',
          q: md`Kai's origin is at his feet. A tree scene has its \`Sprite2D\` centred on the node origin, and the node is placed so the picture looks right, which puts the origin 16 px above the trunk base. With Y-sort on, where does it go wrong?`,
          options: [
            md`When Kai's feet are less than 16 px north of the trunk base: he is behind the tree but drawn in front of it.`,
            md`When Kai is south of the tree: he is drawn behind it.`,
            md`Never; Y-sort uses the sprite's bottom edge automatically.`,
            md`Only when Kai is exactly level with the trunk.`,
          ],
          answer: 0,
          explain: md`Y-sort compares node positions, not sprite edges. The tree's key is 16 px too small, so for feet between base − 16 and base, Kai's key is larger and he is drawn later, on top. Fix it by moving the sprite up with *Offset* (or its position) so the node's origin sits at the trunk base.`,
        },
        {
          kind: 'steps',
          title: 'Layer and sort the room',
          steps: [
            md`In \`test_room.tscn\`, arrange the root's children as: \`Ground\` (TileMapLayer), \`Decoration\` (TileMapLayer, same TileSet), \`World\` (\`Node2D\`), \`AbovePlayer\` (TileMapLayer). Move the \`Player\` instance and any ledges or NPCs under \`World\`.`,
            md`Select \`World\` and turn on **Ordering → Y Sort Enabled**. Select \`AbovePlayer\` and set **Ordering → Z Index** to 10, so it draws above everything with a lower z.`,
            md`Make a tree scene: \`StaticBody2D\` named \`Tree\` with a \`Sprite2D\` (the 2×2 tree tiles as an \`AtlasTexture\`) and a \`CollisionShape2D\` 10×5 at the trunk. Set the sprite's *Offset* to (0, -14) so the trunk base sits on the node's origin. Instance three trees under \`World\`.`,
            md`For tall tiles you prefer to paint (bushes, rocks), add a fourth \`TileMapLayer\` \`Props\` *under World* and turn on its **Y Sort Enabled**. In the TileSet panel select those tiles and set *Rendering → Y Sort Origin* to the pixel row of their base (for a 16-px rock, about 6, measured from the tile centre).`,
            md`Run the room and walk around a tree and a rock.`,
          ],
          result: md`Kai is hidden by a canopy when north of the trunk and covers the trunk when south of it. Rocks from the \`Props\` layer sort with him the same way. Roof tiles on \`AbovePlayer\` always cover him.`,
          troubleshoot: [
            { problem: md`Y-sorting has no effect on Kai.`, fix: md`Only direct children of the y-sorted node are sorted together. If Kai sits under another plain \`Node2D\` (such as a \`Characters\` folder node), turn on Y Sort on that node too, or move Kai up.` },
            { problem: md`Kai disappears under the ground.`, fix: md`A layer has a higher *Z Index* than \`World\`. Z index beats tree order and Y-sort; keep \`Ground\` and \`Decoration\` at 0.` },
          ],
        },
        {
          kind: 'text',
          md: md`### Rooms and transitions

Each room is a scene: \`scenes/rooms/town.tscn\`, \`scenes/rooms/house_kai.tscn\`. A door is an \`Area2D\` that names the room it leads to and the **spawn point** to arrive at, a \`Marker2D\` in the target room. Names (instead of coordinates) keep doors working when you rearrange a room.

Something has to survive the scene change: the old room, including the door, is freed when the new one loads. An **autoload** is a node Godot adds under the root before the first scene and never frees, so it is the natural home for the transition. \`Transitions\` (\`scripts/autoload/transitions.gd\`):

1. remembers the spawn name;
2. pauses the game, so the player cannot walk into a second door during the fade;
3. fades a full-screen \`ColorRect\` to black;
4. calls \`get_tree().change_scene_to_file(path)\`, which swaps scenes at the end of the frame;
5. waits for the swap, unpauses and fades back in.

The new room reads \`Transitions.spawn_name\` in its \`_ready\` and moves the player to that marker before the first frame is drawn. The \`Transitions\` node sets \`process_mode = PROCESS_MODE_ALWAYS\`, so its tweens keep running while the tree is paused.`,
        },
        { kind: 'code', file: 'scripts/autoload/transitions.gd', code: TRANSITIONS, note: md`\`await\` on a function that itself awaits (\`_fade_to\`) waits for it to finish. \`"color:a"\` tweens only the alpha of the \`ColorRect\`'s colour. Waiting two \`process_frame\`s after \`change_scene_to_file\` is a safe margin: the swap happens at the end of the current frame, and the new room's \`_ready\` has run by the next.` },
        { kind: 'code', file: 'scripts/door.gd', code: DOOR, note: md`\`@export_file("*.tscn")\` gives the Inspector a file picker limited to scenes. The door only reacts to \`Player\`, so NPCs and enemies walking into it do nothing.` },
        { kind: 'code', file: 'scripts/room.gd', code: ROOM, note: md`Running a room on its own with **F6** leaves \`spawn_name\` empty, so the player stays where the scene puts him, which keeps every room testable alone.` },
        {
          kind: 'steps',
          title: 'Two rooms and a door',
          steps: [
            md`Create \`scenes/transitions.tscn\`: a \`CanvasLayer\` root with a child \`ColorRect\` named \`Fade\`. Set the ColorRect's *Layout → Anchors Preset* to **Full Rect**, colour black, and *Mouse → Filter* **Ignore**. Attach \`scripts/autoload/transitions.gd\` to the root.`,
            md`Open **Project → Project Settings → Globals → Autoload**, choose \`scenes/transitions.tscn\`, name it \`Transitions\` and click *Add*.`,
            md`Turn \`test_room.tscn\` into \`scenes/rooms/town.tscn\`: attach \`scripts/room.gd\` to the root and add a \`Node2D\` named \`Spawns\` with a \`Marker2D\` named \`from_house\`, placed one tile *south* of the house door.`,
            md`Make \`scenes/rooms/house.tscn\` the same way, with a \`Spawns/from_town\` marker one tile *north* of its exit.`,
            md`Make \`scenes/door.tscn\`: an \`Area2D\` with a 16×8 \`CollisionShape2D\` and \`scripts/door.gd\`; its *Mask* is layer 2 (\`player\`). Place one in each room and set *Target Room* and *Target Spawn* to the other room and its marker.`,
          ],
          result: md`Walking into the town's door fades to black and fades in inside the house, with Kai standing just inside the exit; walking into the exit brings him back in front of the house door.`,
          troubleshoot: [
            { problem: md`Kai bounces between the rooms forever.`, fix: md`The spawn marker is inside the other door's area, so arriving triggers that door. Put markers at least one tile away from doors.` },
            { problem: md`The screen stays black.`, fix: md`The fade tween runs on the \`Transitions\` node, which must keep processing while paused: check \`process_mode = PROCESS_MODE_ALWAYS\` ran (the script sets it in \`_ready\`).` },
            { problem: md`Errors about \`Transitions\` not being declared.`, fix: md`The autoload's name in Project Settings must be exactly \`Transitions\`, and the *Enable* (global variable) box must be ticked.` },
          ],
        },
        {
          kind: 'check',
          q: md`Why does the room read the spawn name in its own \`_ready\`, instead of \`Transitions\` moving the player right after \`change_scene_to_file\`?`,
          options: [
            md`\`change_scene_to_file\` only swaps the scene at the end of the frame; right after the call, the new room and its player do not exist yet.`,
            md`Autoloads cannot access nodes in the current scene.`,
            md`\`_ready\` runs before \`change_scene_to_file\`.`,
            md`Moving the player from an autoload is not allowed while the tree is paused.`,
          ],
          answer: 0,
          explain: md`The change is deferred. The new room's \`_ready\` is the first moment its nodes exist, and it runs before the first frame of the room is drawn, so the player never appears at the wrong spot.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'c04-2-build',
            title: 'A town with a house',
            goal: md`Build a small town room and a house interior, layered and y-sorted, joined by a door in each direction.`,
            requirements: [
              md`The town uses at least \`Ground\`, \`Decoration\`, a y-sorted \`World\` and an \`AbovePlayer\` layer; the house roof edge covers Kai when he walks below it.`,
              md`Kai, two NPCs and at least three trees sort correctly in every direction.`,
              md`Going through either door fades out and in within about half a second and places Kai at the correct marker, facing away from the door.`,
              md`Walking into a door twice quickly causes a single transition.`,
              md`Each room still runs on its own with **F6**.`,
            ],
            hints: [
              md`Give the spawn markers a facing: a \`Marker2D\` has no direction, but you can name markers \`from_house_down\` or add \`@export var facing := "down"\` to a small spawn script.`,
              md`The \`_busy\` flag in \`Transitions\` is what makes double triggers harmless; keep it even when the tree is paused.`,
            ],
            solution: [
              { file: 'scripts/autoload/transitions.gd', code: TRANSITIONS },
              { file: 'scripts/door.gd', code: DOOR },
              { file: 'scripts/room.gd', code: ROOM },
            ],
            explain: md`Rooms know nothing about each other except the names on their doors. The autoload carries the only piece of state that must cross the scene change, the spawn name. Later, \`GameState\` (r06) carries everything else that must persist, such as opened chests.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'c04-2-paper',
            title: 'Transition timing',
            type: 'compute',
            difficulty: 1,
            minutes: 4,
            statement: md`The fade out and the fade in take 0.25 s each and the scene change plus the two awaited frames take 3 frames at 60 Hz. How long, in seconds, is the player without control from touching the door to the end of the fade in? How many frames is that?`,
            solution: [md`$0.25 + 3/60 + 0.25 = 0.55$ s.`, md`$0.55 \cdot 60 = 33$ frames. Players accept about half a second for a door; much longer and frequent transitions start to feel slow.`],
            answer: { kind: 'vector', value: [0.55, 33] },
          },
        },
        {
          kind: 'recall',
          prompt: md`List the steps \`Transitions.change_room\` performs, in order, and why the tree is paused.`,
          answer: md`Store the spawn name, pause the tree, fade to black, \`change_scene_to_file\`, wait for the swap (process frames), unpause, fade in, clear the busy flag. Pausing stops the player and enemies from moving or touching another door during the fade.`,
        },
        {
          kind: 'explain',
          prompt: md`Why must every y-sorted object's origin be at its feet, and what is the usual way to achieve it for a Sprite2D?`,
          model: md`Y-sorting compares node positions, so the position has to represent where the object meets the ground; that is what "in front" means in a top-down view. If one object's origin is at its centre and another's at its feet, their comparison is off by half a sprite and characters pop in front of things they stand behind. For a Sprite2D, keep \`centered\` on and set *Offset* (or the sprite's position under the body) so the bottom of the art lands on the node origin, the same rule as the player's sprite at y = -12 in c02-1.`,
        },
      ],
      cards: [
        { id: 'c04-2-c1', kind: 'concept', front: md`What does \`y_sort_enabled\` on a Node2D do?`, back: md`Draws its direct children in order of \`position.y\`, smaller (higher on screen) first. Origins must be at the feet for this to look right.` },
        { id: 'c04-2-c2', kind: 'cloze', text: md`\`get_tree().{{}}(path)\` swaps the current scene at the end of the frame.`, answers: ['change_scene_to_file'] },
        { id: 'c04-2-c3', kind: 'concept', front: md`Why do doors carry a spawn-point name instead of coordinates?`, back: md`Names survive rearranging the target room; the room looks up the \`Marker2D\` by name in its \`_ready\` and places the player there.` },
        { id: 'c04-2-c4', kind: 'concept', front: md`Why is the room transition code in an autoload?`, back: md`Autoloads are never freed by scene changes, so the fade and the spawn name survive the swap that frees the old room and its door.` },
        { id: 'c04-2-c5', kind: 'concept', front: md`Where do roofs and canopies go so they always cover characters?`, back: md`On an \`AbovePlayer\` TileMapLayer with a higher Z Index (for example 10), outside the y-sorted \`World\`.` },
      ],
    },
    {
      id: 'c04-3',
      title: 'Cameras: limits, smoothing, drag and look-ahead',
      minutes: 40,
      objectives: [
        'Set Camera2D limits from a room\'s tile bounds.',
        'Tune position smoothing and drag margins and explain what each does to the view.',
        'Add a look-ahead that leads the player\'s motion, eased frame-rate independently.',
        'Keep pixel art crisp with pixel snapping, and choose between following zones and screen-by-screen rooms.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`The camera decides what the player can see, so it decides how fair the game feels. Locked rigidly to Kai, every turn jerks the whole world on screen. Too loose, and enemies arrive from off-screen before the camera catches up. Near the edge of a room it should stop, rather than show the grey void beyond the tiles.

\`Camera2D\` handles limits, smoothing and drag margins out of the box. Look-ahead needs a few lines of script. This lesson builds a \`GameCamera\` that combines them, and compares it with the screen-by-screen camera of older games.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'Camera2D, the parts that matter here',
          md: md`- The current \`Camera2D\` decides which part of the world the viewport shows. With the 320×180 viewport, the view is 320×180 world pixels centred on the camera (at *Zoom* 1).
- **Limits** (\`limit_left\`, \`limit_top\`, \`limit_right\`, \`limit_bottom\`, in pixels): the view never shows beyond them.
- **Position smoothing** (\`position_smoothing_enabled\`, \`position_smoothing_speed\`): the view eases toward the camera's position instead of jumping to it. Higher speed is tighter.
- **Drag margins** (\`drag_horizontal_enabled\`, \`drag_vertical_enabled\`, \`drag_left_margin\` and friends, fractions of half the screen): the view stays still while the camera's position moves inside a box around the view centre, and is dragged along when it leaves the box.
- \`process_callback\`: whether the camera updates in idle or physics frames. Following a \`CharacterBody2D\`, physics avoids a one-frame wobble between the two clocks.
- \`reset_smoothing()\`: jump to the current position immediately.`,
        },
        {
          kind: 'text',
          md: md`### Limits from the room

The room's \`Ground\` layer already knows the room's size: \`get_used_rect()\` returns the rectangle of cells that contain tiles, in cell units. Multiply by the tile size and add the layer's position to get pixels. Setting the limits from the tiles means you never type a room size by hand, and resizing a room updates its camera automatically.

### Look-ahead

When Kai walks right, what matters is to his right. A look-ahead offsets the camera's target in the direction of the velocity, up to \`look_ahead\` pixels at full speed. Two details make it pleasant:

- **Scale by speed**, so standing still recentres the view and a slow walk leads a little.
- **Ease the offset**, so a quick left-right tap does not swing the screen. The easing uses $1 - e^{-k\,\Delta t}$ as the lerp weight (m03), which gives the same motion at any frame rate. A plain \`lerp(a, b, 0.1)\` per frame would ease twice as fast at 120 Hz as at 60 Hz.

The script moves the camera's own position to the target plus the look-ahead; the built-in smoothing and drag margins then work on that position.`,
        },
        { kind: 'code', file: 'scripts/game_camera.gd', code: GAME_CAMERA, note: md`\`limit_length(1.0)\` caps the scaled velocity at length 1, so dashing (240 px/s) does not push the camera further than walking does. \`Rect2i.end\` is \`position + size\`.` },
        {
          kind: 'viz',
          viz: { type: 'core.camera', mode: 'follow' },
          task: md`Walk around the room. Set the drag margin to 0 and smoothing off: this is a rigidly locked camera. Then raise the drag margin to 0.3 and walk back and forth inside the yellow box: the view stays still. Turn on smoothing and set \`look_ahead\` to 40, walk right and stop. Finally walk into a corner of the room with limits on and off.`,
          caption: md`The yellow dashed box is the drag box, the cyan line goes from Kai to the camera's position (his position plus the look-ahead), and the white cross marks the view centre. The minimap shows the room and the 320×180 view. The view is drawn at whole pixels, as with pixel snapping on.`,
        },
        {
          kind: 'numeric',
          q: md`With a 320×180 view and drag margins of 0.25 on all sides, how far (px) can the camera's position move horizontally and vertically from the view centre before the view starts to move? Enter both.`,
          answer: { kind: 'vector', value: [40, 22.5] },
          explain: md`Margins are fractions of half the screen: $0.25 \cdot 160 = 40$ px and $0.25 \cdot 90 = 22.5$ px.`,
        },
        {
          kind: 'derive',
          title: 'how long smoothing takes to catch up',
          goal: md`With exponential easing at rate $k$ (per second), the remaining distance to the target after time $t$ is $d(t) = d_0 e^{-kt}$. Find the time to cover 95% of a sudden jump in the target.`,
          steps: [
            { md: md`Each frame multiplies the remaining distance by $1 - w$ with $w = 1 - e^{-k\Delta t}$, so after $n$ frames it is $d_0 e^{-kn\Delta t} = d_0 e^{-kt}$: the frame time cancels.` },
            {
              md: md`95% covered means 5% left: $e^{-kt} = 0.05$, so $t = \ln(20)/k \approx 3.0/k$.`,
              choose: {
                prompt: md`Solve $e^{-kt} = 0.05$ for $t$.`,
                options: [md`$t = \ln(20)/k$`, md`$t = 0.05/k$`, md`$t = 20k$`],
                answer: 0,
                explain: md`Take logs: $-kt = \ln 0.05 = -\ln 20$.`,
              },
            },
            { md: md`For $k = 5$: $t \approx 0.6$ s. For $k = 10$: 0.3 s. Godot's \`position_smoothing_speed\` behaves approximately like this rate; the look-ahead in \`GameCamera\` uses exactly this formula with \`look_ahead_rate\`.` },
          ],
          takeaway: md`A rate of $k$ settles in about $3/k$ seconds. Choose the look-ahead rate lower than the smoothing speed, so changes of direction move the view gently while ordinary following stays tight.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'Pixel snapping',
          md: md`Smoothing and look-ahead put the camera at fractional positions such as x = 103.4. A pixel-art game rendered at 320×180 cannot draw a sprite at a third of a pixel, so different objects round differently and appear to shimmer by a pixel against each other. Two project settings keep everything on the grid: **Rendering → 2D → Snap → Snap 2D Transforms to Pixel** and **Snap 2D Vertices to Pixel** (enable *Advanced Settings* in the Project Settings window to see them). The starter project renders at 320×180 (*Stretch Mode* \`viewport\`) and scales by an integer, so a snapped pixel stays a crisp square on screen.`,
        },
        {
          kind: 'text',
          md: md`### Following zones or screen by screen

There are two classic ways to show a world larger than the screen:

- **Following, with zones.** The camera follows the player and is limited to the current zone (a room, or a region of a large map). Exploration feels continuous, and you can see what is coming from the direction you move. Most modern top-down games, Shardbound's overworld included, work this way.
- **Screen by screen.** The world is divided into screen-sized cells; the camera shows one cell and pans or cuts to the next when the player crosses an edge, as in classic *Zelda* dungeons. Every screen is composed like a picture, and puzzles and fights can be designed knowing exactly what the player sees. It suits dungeons and puzzle rooms.

Both are a few lines with \`Camera2D\`. Screen by screen snaps the camera's position to the centre of the cell containing the player; smoothing turns the snap into a pan.`,
        },
        { kind: 'code', file: 'scripts/screen_camera.gd', code: SCREEN_CAMERA, note: md`\`(position / screen).floor()\` gives the screen cell as a \`Vector2\` of whole numbers. With a room of 2×2 screens, cells range from (0, 0) to (1, 1).` },
        {
          kind: 'viz',
          viz: { type: 'core.camera', mode: 'screens' },
          task: md`Walk across a screen boundary (the faint lines in the minimap) with smoothing on and off. Then imagine an enemy waiting just past the boundary: how does each camera present it?`,
          caption: md`The view always shows exactly one 320×180 cell of the room. With smoothing the change is a short pan; without it, a cut.`,
        },
        {
          kind: 'check',
          q: md`A designer wants a dungeon room where the player must see the whole puzzle at once, and an overworld where the player sees far ahead while running. Which cameras fit?`,
          options: [
            md`Screen by screen (or a fixed camera) for the puzzle room; following with look-ahead and zone limits for the overworld.`,
            md`Following with no limits everywhere.`,
            md`Screen by screen everywhere, for consistency.`,
            md`A rigid camera locked to the player everywhere.`,
          ],
          answer: 0,
          explain: md`A puzzle needs a stable, composed frame; travel needs to see ahead. Mixing camera styles per room is normal: each room scene carries its own camera setup.`,
        },
        {
          kind: 'steps',
          title: 'Add the camera to the rooms',
          steps: [
            md`In each room, add a \`Camera2D\` named \`GameCamera\` as a direct child of the root (not under the player) and attach \`scripts/game_camera.gd\`. Make sure it is the only enabled camera.`,
            md`Replace \`scripts/room.gd\` with the build solution below: it sets the target, fits the limits to \`Ground\` and snaps the camera to the player.`,
            md`In the camera's Inspector, enable *Drag → Horizontal Enabled* and *Vertical Enabled* and set all four margins to 0.15.`,
            md`Open **Project → Project Settings**, enable *Advanced Settings*, and turn on **Rendering → 2D → Snap → Snap 2D Transforms to Pixel**.`,
            md`Run both rooms and walk to every edge.`,
          ],
          result: md`The view follows Kai with a slight lead, stays still for small movements, never shows outside the tiles, and starts on Kai after each door instead of gliding in.`,
          troubleshoot: [
            { problem: md`The camera does not move at all.`, fix: md`\`target\` is empty: the room script sets it in \`_ready\`. Also check *Enabled* is on and no other \`Camera2D\` is current.` },
            { problem: md`Sprites shimmer by one pixel while the camera moves.`, fix: md`Pixel snapping is off, or the camera updates in idle frames while the player moves in physics frames; \`GameCamera\` sets \`process_callback\` to physics.` },
            { problem: md`The view shows a strip outside the room.`, fix: md`\`Ground\` must cover the whole room: \`get_used_rect()\` only counts painted cells. Paint the border, or set the limits from a \`ReferenceRect\` instead.` },
          ],
        },
        {
          kind: 'build',
          ch: {
            id: 'c04-3-build',
            title: 'A camera for every room',
            goal: md`Give every room the \`GameCamera\`, fitted to its tiles and snapped to the player on arrival, and make the house interior use the screen-by-screen camera.`,
            requirements: [
              md`In the town the view never shows outside the painted tiles, at any room size.`,
              md`After a door, the first frame already shows Kai at his spawn point (no glide from the editor position).`,
              md`Walking right and stopping leaves Kai about \`look_ahead\` px left of centre while moving and recentred about a second after stopping.`,
              md`The house uses \`ScreenCamera\` and shows exactly one 320×180 screen at a time.`,
            ],
            hints: [
              md`Order matters in \`_ready\`: place the player, then set the target, then fit the limits, then snap.`,
              md`For the house, a \`ScreenCamera\` needs only its \`target\`; the room script can set \`$ScreenCamera.target = player\` instead.`,
            ],
            solution: [
              { file: 'scripts/room.gd', code: ROOM_CAMERA },
              { file: 'scripts/game_camera.gd', code: GAME_CAMERA },
              { file: 'scripts/screen_camera.gd', code: SCREEN_CAMERA },
            ],
            explain: md`Each room composes its own camera, so camera style becomes a per-room design choice. Snapping on arrival matters because the camera node starts wherever it sits in the editor; \`reset_smoothing()\` moves the view there at once.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'c04-3-paper',
            title: 'Limits from a used rectangle',
            type: 'compute',
            difficulty: 1,
            minutes: 5,
            statement: md`A \`Ground\` layer at position (0, 0) with 16×16 tiles has \`get_used_rect()\` = position (-2, -1), size (40, 23). What do \`limit_left\`, \`limit_top\`, \`limit_right\` and \`limit_bottom\` become? Enter all four.`,
            solution: [md`Left $= -2 \cdot 16 = -32$, top $= -1 \cdot 16 = -16$.`, md`\`end\` $= (38, 22)$, so right $= 38 \cdot 16 = 608$ and bottom $= 22 \cdot 16 = 352$. The room is $640 \times 368$ px.`],
            answer: { kind: 'vector', value: [-32, -16, 608, 352] },
          },
        },
        {
          kind: 'recall',
          prompt: md`What do position smoothing, drag margins and look-ahead each do, in one sentence each?`,
          answer: md`Smoothing eases the view toward the camera's position; drag margins keep the view still until the camera's position leaves a box around the view centre; look-ahead moves the camera's position ahead of the player in the direction of motion.`,
        },
        {
          kind: 'explain',
          prompt: md`Why ease the look-ahead with $1 - e^{-k\Delta t}$ instead of \`lerp(current, target, 0.1)\` every frame?`,
          model: md`A fixed weight of 0.1 per frame makes the speed of the easing depend on the frame rate: at 120 Hz it applies twice as often and settles twice as fast. The weight $1 - e^{-k\Delta t}$ is what you get from a continuous exponential decay at rate $k$, so after any amount of time the remaining distance is $e^{-kt}$ of the start regardless of how that time was split into frames.`,
        },
      ],
      cards: [
        { id: 'c04-3-c1', kind: 'compute', front: md`Drag margin 0.2 on a 320-px-wide view. Horizontal free movement each side of centre, in px?`, answer: { kind: 'number', value: 32 }, back: md`Margins are fractions of half the screen: $0.2 \cdot 160 = 32$ px.` },
        { id: 'c04-3-c2', kind: 'cloze', text: md`\`limit_right = used.{{}}.x * tile.x\` sets the right limit from a TileMapLayer's used rect.`, answers: ['end'] },
        { id: 'c04-3-c3', kind: 'compute', front: md`Exponential smoothing at rate 6 per second: time to cover 95% of a jump, in seconds?`, answer: { kind: 'number', value: Math.log(20) / 6 }, back: md`$\ln 20 / 6 \approx 0.5$ s.` },
        { id: 'c04-3-c4', kind: 'concept', front: md`Why call \`reset_smoothing()\` after placing the player in a new room?`, back: md`Otherwise the view eases in from the camera's previous position (its place in the editor), gliding across the room on the first frames.` },
        { id: 'c04-3-c5', kind: 'concept', front: md`Following with zone limits versus screen by screen: one strength of each.`, back: md`Following: continuous exploration and visibility ahead. Screen by screen: every screen is a composed frame, ideal for puzzles and fights designed around what is visible.` },
      ],
    },
  ],
  problems: [
    {
      id: 'c04-p1',
      title: 'Cell under a point',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`A \`TileMapLayer\` with 16×16 tiles is placed at (-8, 24). Which cell contains the world point (100, 100)? Enter the cell as a vector.`,
      solution: [md`Local position: $(100 + 8, 100 - 24) = (108, 76)$.`, md`Cell: $(\lfloor 108/16 \rfloor, \lfloor 76/16 \rfloor) = (6, 4)$.`],
      answer: { kind: 'vector', value: [6, 4] },
    },
    {
      id: 'c04-p2',
      title: 'Counting blob tiles',
      type: 'compute',
      difficulty: 2,
      minutes: 10,
      statement: md`In Match Corners and Sides mode, a corner bit only matters when both sides next to it are the same terrain. Count the distinct tiles: for each number $s$ of matching sides (0 to 4), count the side patterns and the corner patterns that matter, and add up.`,
      hints: [md`A corner "matters" only between two matching sides. With 2 matching sides, it depends whether they are adjacent or opposite.`],
      solution: [
        md`0 sides: 1 pattern, no corners: 1. 1 side: 4 patterns, no corners: 4.`,
        md`2 sides: 4 adjacent pairs, each with 1 relevant corner ($4 \cdot 2 = 8$), and 2 opposite pairs with none (2): 10.`,
        md`3 sides: 4 patterns, each with 2 relevant corners: $4 \cdot 4 = 16$. 4 sides: 1 pattern with 4 corners: 16.`,
        md`Total $1 + 4 + 10 + 16 + 16 = 47$.`,
      ],
      answer: { kind: 'number', value: 47 },
    },
    {
      id: 'c04-p3',
      title: 'The door that never stops',
      type: 'debug',
      difficulty: 2,
      minutes: 6,
      statement: md`After walking through the town's door into the house, the game flickers between the two rooms forever. In the house, the \`from_town\` marker is at (160, 168) and the exit door's area covers (152..168, 164..172). What is wrong, and what are two fixes?`,
      solution: [md`The spawn point lies inside the exit door's \`Area2D\`. The player arrives overlapping it, \`body_entered\` fires on the first physics frame, and the house sends him back to the town, whose spawn is presumably inside the town door, and so on.`, md`Fix 1: move every marker at least one tile away from the doors. Fix 2 (defensive): have doors ignore bodies for a short time after a room loads, or only trigger when the player is moving toward the door.`],
      rubric: [md`Identifies the marker inside the door area`, md`Explains why body_entered fires on arrival`, md`Gives a placement fix and a code-side guard`],
    },
    {
      id: 'c04-p4',
      title: 'Y-sort that does nothing',
      type: 'debug',
      difficulty: 2,
      minutes: 6,
      statement: md`A room's tree is \`Room → World (y-sort on) → Characters (Node2D) → Player\` and \`Room → World → Trees (Node2D) → Tree1, Tree2\`. Kai is always drawn on top of the trees, even north of them. Explain and fix.`,
      solution: [md`Y-sort orders the *direct children* of \`World\`: \`Characters\` and \`Trees\`, each at y = 0. Their own children are drawn in tree order within them, so \`Characters\` (after \`Trees\`) draws Kai over all trees.`, md`Turn on Y Sort on \`Characters\` and \`Trees\` too: nested y-sorted nodes merge into the parent's sorting, so all four sort together by y. Alternatively put the player and trees directly under \`World\`.`],
      rubric: [md`States that only direct children are sorted`, md`Gives a fix (enable y-sort on the folder nodes or flatten)`],
    },
    {
      id: 'c04-p5',
      title: 'Drag box size',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`The view is 320×180 with drag margins left = right = 0.2 and top = bottom = 0.4. What are the width and height of the drag box in pixels?`,
      solution: [md`Width: $(0.2 + 0.2) \cdot 160 = 64$ px.`, md`Height: $(0.4 + 0.4) \cdot 90 = 72$ px.`],
      answer: { kind: 'vector', value: [64, 72] },
    },
    {
      id: 'c04-p6',
      title: 'Cameras for Shardbound',
      type: 'design',
      difficulty: 2,
      minutes: 12,
      statement: md`Shardbound has a town (several houses), an overworld (cliffs, a pond, ruins) and a dungeon (puzzle rooms and a boss arena). For each, choose a camera style and settings (limits, smoothing, drag, look-ahead) and justify the choice in terms of what the player needs to see. Mention one problem battles cause for the camera.`,
      solution: [
        md`Town: following within each zone, light smoothing, small drag box so talking to NPCs does not move the view, little look-ahead; house interiors smaller than the screen are centred with a fixed camera.`,
        md`Overworld: following with look-ahead around 24–32 px and zone limits per region, so running reveals what is ahead, drag box small.`,
        md`Dungeon: screen by screen for puzzle rooms (every element visible and composed), a fixed camera framing the whole boss arena so the boss's attacks are always on screen.`,
        md`Battles: three party members and enemies may not fit around the controlled character; the camera may need to frame the group (target the average position, or zoom out slightly), and look-ahead should be reduced so dodging does not swing the view.`,
      ],
      rubric: [md`A different, justified choice per area`, md`Concrete settings`, md`Names a battle-specific issue and a response`],
      areas: ['feel', 'godot'],
    },
    {
      id: 'c04-p7',
      title: 'Why layers are nodes',
      type: 'concept',
      difficulty: 1,
      minutes: 5,
      statement: md`Give three things you can do with a roof drawn on its own \`TileMapLayer\` node that would be awkward if the roof were painted into the ground layer.`,
      solution: [md`Draw it above characters with a higher Z Index while the ground stays below them.`, md`Fade it out (tween \`modulate:a\`) when the player walks under it, revealing the interior; toggle its visibility; give it its own collision or none, independent of the walls below.`],
      rubric: [md`Three distinct, correct uses`, md`At least one about draw order and one about changing it at runtime`],
    },
    {
      id: 'c04-p8',
      title: 'Is it water?',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 8,
      statement: md`Write a method for a \`TileMapLayer\` script, \`is_water_at(world_position: Vector2) -> bool\`, that returns true when the tile under the point belongs to terrain 0 of terrain set 0. Use \`TileData.terrain_set\` and \`TileData.terrain\`, and handle empty cells.`,
      solution: [
        md`\`\`\`gdscript
func is_water_at(world_position: Vector2) -> bool:
    var cell := local_to_map(to_local(world_position))
    var data := get_cell_tile_data(cell)
    if data == null:
        return false
    return data.terrain_set == 0 and data.terrain == 0
\`\`\``,
        md`Converting with \`to_local\` first keeps it correct when the layer is moved. \`get_cell_tile_data\` returns \`null\` for empty cells, which must be checked before reading properties.`,
      ],
      rubric: [md`Converts world to local to map`, md`Checks for null`, md`Compares terrain set and terrain`],
    },
    {
      id: 'c04-p9',
      title: 'Smoothing time',
      type: 'compute',
      difficulty: 2,
      minutes: 5,
      statement: md`The look-ahead eases at rate $k = 3$ per second with weight $1 - e^{-k\Delta t}$. After the player reverses direction, the look-ahead target jumps from +24 px to -24 px. How long until the offset is within 2 px of -24?`,
      solution: [md`Remaining distance starts at 48 px and decays as $48 e^{-3t}$.`, md`$48 e^{-3t} = 2 \Rightarrow t = \ln(24)/3 \approx 1.06$ s.`],
      answer: { kind: 'number', value: Math.log(24) / 3 },
    },
  ],
};
