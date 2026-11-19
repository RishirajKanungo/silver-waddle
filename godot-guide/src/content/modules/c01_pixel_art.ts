import { md, gd, type Module } from '../types';

const PROJECT_SETTINGS = `[display]

window/size/viewport_width=320
window/size/viewport_height=180
window/size/window_width_override=1280
window/size/window_height_override=720
window/stretch/mode="viewport"
window/stretch/scale_mode="integer"

[rendering]

textures/canvas_textures/default_texture_filter=0
2d/snap/snap_2d_transforms_to_pixel=true
`;

const PALETTE_CHECK = gd`
@tool
extends EditorScript
## Lists the colours of a sprite sheet, darkest first, and warns when it uses more than a
## GBA-style sprite palette (15 colours plus transparency). Run with File > Run (Ctrl+Shift+X).

const SHEET_PATH := "res://assets/enemies/slime.png"
const MAX_COLOURS := 15


func _run() -> void:
    var texture: Texture2D = load(SHEET_PATH)
    var image := texture.get_image()
    if image.is_compressed():
        image.decompress()
    var seen := {}
    for y in image.get_height():
        for x in image.get_width():
            var c := image.get_pixel(x, y)
            if c.a > 0.0:
                seen[c.to_html(false)] = c
    var colours: Array = seen.values()
    colours.sort_custom(func(a: Color, b: Color) -> bool: return a.get_luminance() < b.get_luminance())
    print("%s: %d colours" % [SHEET_PATH, colours.size()])
    for c in colours:
        print("  #%s  luminance %.2f" % [c.to_html(false), c.get_luminance()])
    if colours.size() > MAX_COLOURS:
        push_warning("more than %d colours: check for stray anti-aliasing or blending" % MAX_COLOURS)
`;

const BUILD_FRAMES = gd`
@tool
extends EditorScript
## Builds Kai's SpriteFrames from his sheet: one animation per row, 4 columns of 32x32 frames.
## Run with File > Run in the script editor; it writes resources/kai_frames.tres.

const SHEET_PATH := "res://assets/characters/kai.png"
const OUT_PATH := "res://resources/kai_frames.tres"
const FRAME := Vector2i(32, 32)

## [name, row, frame count, frames per second, loops]
const ANIMS := [
    ["idle_down", 0, 2, 3.0, true], ["idle_up", 1, 2, 3.0, true], ["idle_side", 2, 2, 3.0, true],
    ["walk_down", 3, 4, 8.0, true], ["walk_up", 4, 4, 8.0, true], ["walk_side", 5, 4, 8.0, true],
    ["attack_down", 6, 4, 14.0, false], ["attack_up", 7, 4, 14.0, false], ["attack_side", 8, 4, 14.0, false],
    ["dash_down", 9, 2, 12.0, true], ["dash_up", 10, 2, 12.0, true], ["dash_side", 11, 2, 12.0, true],
    ["jump_down", 12, 2, 10.0, false], ["jump_side", 13, 2, 10.0, false],
    ["cast", 14, 3, 8.0, false], ["hurt", 15, 2, 8.0, false], ["ko", 16, 1, 1.0, false], ["guard", 17, 1, 1.0, false],
]


func _run() -> void:
    var sheet: Texture2D = load(SHEET_PATH)
    var frames := SpriteFrames.new()
    frames.remove_animation(&"default")  # a new SpriteFrames starts with an empty "default"
    for a in ANIMS:
        var anim := StringName(a[0])
        var row: int = a[1]
        var count: int = a[2]
        frames.add_animation(anim)
        frames.set_animation_speed(anim, a[3])
        frames.set_animation_loop(anim, a[4])
        for col in count:
            var atlas := AtlasTexture.new()
            atlas.atlas = sheet
            atlas.region = Rect2(Vector2(col * FRAME.x, row * FRAME.y), Vector2(FRAME))
            frames.add_frame(anim, atlas)
    var err := ResourceSaver.save(frames, OUT_PATH)
    print("saved %s: %s" % [OUT_PATH, error_string(err)])
`;

const BUILD_FRAMES_HOLDS = gd`
@tool
extends EditorScript
## Like build_frames.gd, but animations listed in HOLDS are timed in physics ticks: they run at
## 60 FPS, so each frame's duration is the number of ticks it is held.

const SHEET_PATH := "res://assets/characters/kai.png"
const OUT_PATH := "res://resources/kai_frames.tres"
const FRAME := Vector2i(32, 32)

## [name, row, frame count, frames per second, loops]
const ANIMS := [
    ["idle_down", 0, 2, 3.0, true], ["idle_up", 1, 2, 3.0, true], ["idle_side", 2, 2, 3.0, true],
    ["walk_down", 3, 4, 8.0, true], ["walk_up", 4, 4, 8.0, true], ["walk_side", 5, 4, 8.0, true],
    ["attack_down", 6, 4, 14.0, false], ["attack_up", 7, 4, 14.0, false], ["attack_side", 8, 4, 14.0, false],
    ["dash_down", 9, 2, 12.0, true], ["dash_up", 10, 2, 12.0, true], ["dash_side", 11, 2, 12.0, true],
    ["jump_down", 12, 2, 10.0, false], ["jump_side", 13, 2, 10.0, false],
    ["cast", 14, 3, 8.0, false], ["hurt", 15, 2, 8.0, false], ["ko", 16, 1, 1.0, false], ["guard", 17, 1, 1.0, false],
]
## Holds in ticks: anticipation 6, swing 2, impact 4, recovery 8 = 20 ticks = 333 ms.
const HOLDS := {
    "attack_down": [6, 2, 4, 8],
    "attack_up": [6, 2, 4, 8],
    "attack_side": [6, 2, 4, 8],
}


func _run() -> void:
    var sheet: Texture2D = load(SHEET_PATH)
    var frames := SpriteFrames.new()
    frames.remove_animation(&"default")
    for a in ANIMS:
        var anim := StringName(a[0])
        var row: int = a[1]
        var count: int = a[2]
        var timed_in_ticks: bool = HOLDS.has(a[0])
        frames.add_animation(anim)
        frames.set_animation_speed(anim, 60.0 if timed_in_ticks else a[3])
        frames.set_animation_loop(anim, a[4])
        for col in count:
            var atlas := AtlasTexture.new()
            atlas.atlas = sheet
            atlas.region = Rect2(Vector2(col * FRAME.x, row * FRAME.y), Vector2(FRAME))
            var duration: float = HOLDS[a[0]][col] if timed_in_ticks else 1.0
            frames.add_frame(anim, atlas, duration)
        print("%-12s %4.0f ms" % [anim, 1000.0 * _length(frames, anim)])
    var err := ResourceSaver.save(frames, OUT_PATH)
    print("saved %s: %s" % [OUT_PATH, error_string(err)])


## Seconds for one pass: the sum of frame durations divided by the animation speed.
func _length(frames: SpriteFrames, anim: StringName) -> float:
    var total := 0.0
    for i in frames.get_frame_count(anim):
        total += frames.get_frame_duration(anim, i)
    return total / frames.get_animation_speed(anim)
`;

const ATTACK_TIMER = gd`
extends AnimatedSprite2D
## Measures how long each animation really takes, to check the numbers against the plan.

var _started_ms := 0


func _ready() -> void:
    animation_finished.connect(_on_finished)
    play(&"attack_side")
    _started_ms = Time.get_ticks_msec()


func _on_finished() -> void:
    print("%s took %d ms" % [animation, Time.get_ticks_msec() - _started_ms])
`;

const PIXEL_CAMERA = gd`
extends Camera2D
## Follows a target with smoothing, but only ever sits on whole pixels, so the target and
## the ground are rounded the same way and the target cannot wobble against the background.

@export var target: Node2D
@export_range(0.01, 1.0) var smoothing := 0.1  ## fraction of the distance closed per tick

var _exact := Vector2.ZERO


func _ready() -> void:
    position_smoothing_enabled = false  # smooth here, then round
    if target:
        _exact = target.global_position


func _physics_process(_delta: float) -> void:
    if target == null:
        return
    _exact = _exact.lerp(target.global_position.round(), smoothing)
    global_position = _exact.round()
`;

const SWAP_SHADER = `shader_type canvas_item;
// Palette swap: replace the four colours of one ramp with another ramp.
// Set from_* to the sprite's original colours and to_* to the new ones.
uniform vec4 from_0 : source_color = vec4(0.153, 0.408, 0.220, 1.0);
uniform vec4 from_1 : source_color = vec4(0.310, 0.620, 0.243, 1.0);
uniform vec4 from_2 : source_color = vec4(0.635, 0.816, 0.322, 1.0);
uniform vec4 from_3 : source_color = vec4(0.984, 0.965, 0.902, 1.0);
uniform vec4 to_0 : source_color = vec4(0.290, 0.082, 0.188, 1.0);
uniform vec4 to_1 : source_color = vec4(0.604, 0.165, 0.227, 1.0);
uniform vec4 to_2 : source_color = vec4(0.847, 0.310, 0.235, 1.0);
uniform vec4 to_3 : source_color = vec4(0.973, 0.573, 0.369, 1.0);

vec3 swap(vec3 c, vec3 from_c, vec3 to_c) {
	return distance(c, from_c) < 0.02 ? to_c : c;
}

void fragment() {
	vec4 c = texture(TEXTURE, UV);
	vec3 rgb = c.rgb;
	rgb = swap(rgb, from_0.rgb, to_0.rgb);
	rgb = swap(rgb, from_1.rgb, to_1.rgb);
	rgb = swap(rgb, from_2.rgb, to_2.rgb);
	rgb = swap(rgb, from_3.rgb, to_3.rgb);
	COLOR = vec4(rgb, c.a);
}
`;

const FIRE_SLIME = gd`
extends AnimatedSprite2D
## A slime whose ramp is swapped by the palette shader. The same scene makes every colour variant.

@export var ramp: Array[Color] = [
    Color("#4a1530"), Color("#9a2a3a"), Color("#d84f3c"), Color("#f8925e"),
]


func _ready() -> void:
    # each instance needs its own material, or changing one slime would recolour all of them
    var swap := material.duplicate() as ShaderMaterial
    material = swap
    for i in ramp.size():
        swap.set_shader_parameter("to_%d" % i, ramp[i])
    play(&"idle")
`;

export const MODULE: Module = {
  id: 'c01',
  part: 'core',
  order: 1,
  title: 'Pixel art and animation pipeline',
  summary: 'GBA-era constraints and the course\'s resolution, tile and frame sizes; palettes and hue-shifted ramps; importing sheets into Godot; AnimatedSprite2D versus AnimationPlayer; timing animations in 60 Hz ticks; anchoring at the feet; sub-pixel jitter and snapping; palette swaps with a shader.',
  relevance: md`Every frame of Shardbound is pixel art at 320×180, and the way it is imported, timed and rendered decides whether the game looks crisp or smeared, whether Kai's attack reads as heavy or floaty, and whether he shimmers when the camera follows him. This module sets up the rendering every later module relies on, builds Kai's animations from his sheet (c02 plays them, k01 keys hitboxes to their frames), and previews the palette-swap shader that p01 extends.`,
  prereqs: ['g01'],
  areas: ['art', 'godot', 'feel'],
  lessons: [
    {
      id: 'c01-1',
      title: 'Constraints, palettes and readable sprites',
      minutes: 35,
      objectives: [
        'State the Game Boy Advance\'s screen and colour limits and why they still guide a pixel-art style.',
        'Explain Shardbound\'s 320×180 viewport, integer scaling, 16×16 tiles and 32×32 character frames.',
        'Compute the largest integer scale for a screen, $\\min(\\lfloor W/320 \\rfloor, \\lfloor H/180 \\rfloor)$, and the letterbox it leaves.',
        'Build a hue-shifted colour ramp and explain why it reads better than a brightness-only ramp.',
        'Use silhouettes and 1 px outlines so a sprite reads at 1×.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Shardbound looks like a late Game Boy Advance game. That is a style, but it started as a set of hardware limits, and the limits are why the style works: a small screen forces every sprite to read instantly, a small palette forces colour choices that hold together, and a fixed grid forces consistent detail. Keeping some of the limits on purpose keeps the art coherent even when it is drawn by one person over a year.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'The GBA in numbers',
          md: md`- **Screen**: 240×160 pixels, a 3:2 ratio.
- **Colour**: 15-bit (5 bits each for red, green and blue), so 32 768 possible colours.
- **Sprites** are built from 8×8 tiles. In the common 4-bit mode a sprite uses one **16-colour palette**, and colour 0 is transparent, so 15 visible colours; the hardware holds 16 such palettes for sprites and 16 for backgrounds.
- **Backgrounds** are layers of 8×8 tiles; games usually drew 16×16 "metatiles" made of four of them.

Characters in GBA RPGs were commonly around 16×24 pixels inside a 32×32 or 16×32 frame. A 15-colour budget per sprite is still a good self-imposed rule.`,
        },
        {
          kind: 'text',
          md: md`### Shardbound's choices

- **320×180 viewport.** A 16:9 cousin of the GBA's resolution with similar pixel density: 20 tiles across and 11.25 tiles down at 16 px. It scales by whole numbers to common screens: ×4 is 1280×720, ×6 is 1920×1080, ×8 is 2560×1440.
- **Integer scaling.** Every game pixel becomes an exact block of screen pixels (4×4 at ×4). A scale of 4.5 would make some game pixels 4 screen pixels wide and some 5, and the art would ripple as things move.
- **16×16 tiles** for the world and **32×32 frames** for characters, with about 16×24 pixels of actual character and room around it for swings and capes. Enemies use 16×16 (slime, bat), 32×32 (skeleton) and 48×48 (the golem).
- **Nearest-neighbour filtering**: when scaled, each pixel is copied, never blended with its neighbours.`,
        },
        {
          kind: 'derive',
          title: 'the largest integer scale and the letterbox',
          goal: md`Find the largest whole scale at which a 320×180 image fits a screen of $W \times H$ pixels, and the black bars left over.`,
          steps: [
            { md: md`At scale $s$ the image is $320s \times 180s$. It fits when $320s \le W$ and $180s \le H$.` },
            {
              md: md`So $s \le W/320$ and $s \le H/180$; the largest whole $s$ is $$s = \min\big(\lfloor W/320 \rfloor, \lfloor H/180 \rfloor\big).$$`,
              choose: {
                prompt: md`For the Steam Deck's 1280×800 screen, what is $s$?`,
                options: [md`4`, md`4.44`, md`5`, md`3`],
                answer: 0,
                explain: md`$1280/320 = 4$ and $800/180 \approx 4.44$; the floor of each is 4 and the minimum is 4. A scale of 4.44 would fill the screen but break the square pixels.`,
              },
            },
            { md: md`The leftover space is split evenly: bars of $(W - 320s)/2$ on the left and right and $(H - 180s)/2$ on the top and bottom. On the Deck: $(800 - 720)/2 = 40$ px above and below.` },
          ],
          takeaway: md`Godot does this for you with **Stretch → Scale Mode: integer**; knowing the formula tells you what each player's screen will show.`,
        },
        {
          kind: 'numeric',
          q: md`A player has a 2560×1080 ultrawide monitor. What integer scale does Shardbound use, and how wide is each side bar? Enter both.`,
          answer: { kind: 'vector', value: [6, 320] },
          inputHint: 'scale, bar px',
          explain: md`$\lfloor 2560/320 \rfloor = 8$, $\lfloor 1080/180 \rfloor = 6$, so $s = 6$: the image is 1920×1080. Each side bar is $(2560 - 1920)/2 = 320$ px. Height decides on wide screens.`,
        },
        {
          kind: 'steps',
          title: 'Set up pixel-perfect rendering',
          steps: [
            md`Open **Project → Project Settings** and turn on **Advanced Settings** (the toggle at the top right) so every option is visible.`,
            md`Under **Display → Window → Size**, set **Viewport Width** 320 and **Viewport Height** 180, and **Window Width Override** 1280 and **Window Height Override** 720 so the window opens at ×4.`,
            md`Under **Display → Window → Stretch**, set **Mode** to *viewport* and **Scale Mode** to *integer*. *viewport* renders the game at 320×180 and scales the finished image, so nothing can be drawn between game pixels.`,
            md`Under **Rendering → Textures → Canvas Textures**, set **Default Texture Filter** to *Nearest*. Under **Rendering → 2D → Snap**, turn on **Snap 2D Transforms to Pixel** (lesson c01-3 explains why).`,
            md`Run any scene with a sprite and resize the window by dragging its corner.`,
          ],
          result: md`The sprite stays sharp at every size, the image grows in steps (×4, ×5, ×6 …) rather than continuously, and black bars fill the rest of the window.`,
          troubleshoot: [
            { problem: md`The window is tiny (320×180).`, fix: md`The window overrides are empty. Set them, or press the maximize button; the integer scale adapts to the window.` },
            { problem: md`Sprites are blurry.`, fix: md`The default texture filter is still *Linear*, or a node overrides it: check **CanvasItem → Texture → Filter** on the sprite and its parents (it should be *Inherit* or *Nearest*).` },
          ],
        },
        { kind: 'code', file: 'project.godot', lang: 'cfg', code: PROJECT_SETTINGS, note: md`The same settings as they appear in \`project.godot\`. The filter value 0 means *Nearest*. You can compare your file with this after the steps.` },
        {
          kind: 'assets',
          ids: ['hero', 'mage', 'guard', 'slime', 'skeleton', 'golem', 'tiles_overworld'],
          note: md`Look at the party at 1×: each character is recognisable from the silhouette alone (Kai's sword and spiky hair, Lyra's hat and staff, Bram's shield and bulk). Every sprite has a 1 px outline, and each material (skin, cloth, metal) uses a short ramp of three or four colours.`,
        },
        {
          kind: 'text',
          md: md`### Readability: silhouettes and outlines

At 16×24 pixels a character has no room for detail that does not serve recognition. Two habits do most of the work:

- **Silhouette first.** Fill the character in one flat colour. If you cannot tell who it is, or which way it faces, no amount of shading will fix it. Exaggerate the identifying shapes (a big sword, a hat brim) and keep limbs separate from the body where you can.
- **1 px outline.** A dark outline separates the sprite from any background. Many artists use **selective outlines**: instead of pure black everywhere, each outline pixel is a darker shade of the colour it borders, which looks softer and keeps small sprites from becoming mostly black.

### Ramps and hue shifting

A **ramp** is the sequence of shades for one material, dark to light, usually 3 to 5 colours. The naive ramp changes only brightness. Real light does more: lit surfaces take on the light's warmth, shadows take on the cool colour of the sky and bounced light. Pixel artists imitate this by **hue shifting**: moving the hue toward yellow as the ramp gets lighter and toward blue or purple as it gets darker, and adjusting saturation at the ends. The result reads as light falling on a surface instead of the colour being dimmed, and neighbouring ramps (skin and cloth, grass and stone) harmonise because their shadows and highlights move toward the same hues.`,
        },
        {
          kind: 'viz',
          viz: { type: 'core.pixelRamp', hue: 140, steps: 4, shift: 30 },
          task: md`Compare the two blobs: set **hue shift** to 0 and back to 30. Try a red (hue 0) and a blue (hue 220) material and see which way each end turns. Then click one of Kai's colours to pick a ramp in his sprite and watch it take your hue-shifted ramp.`,
          caption: md`Left blob: brightness-only ramp. Right blob: hue-shifted ramp, the same brightness steps. The readout gives the brightness difference between neighbouring steps: steps closer than about 20 blur together at 1×. **GBA 15-bit colour** rounds each channel to 32 levels.`,
        },
        {
          kind: 'check',
          q: md`Why does a hue-shifted ramp usually look better than one that only changes brightness?`,
          options: [md`It imitates warm light and cool shadow, so the shading reads as lighting, and different materials' ramps share hues and harmonise`, md`It uses more colours`, md`The GBA could only display hue-shifted colours`, md`Darker colours are cheaper to store`],
          answer: 0,
          explain: md`Both ramps can have the same number of colours and the same brightness steps. The hue shift adds the colour temperature of light, and because many ramps shift toward the same yellows and blue-purples, a whole palette holds together.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'c01-1-build',
            title: 'A palette checker',
            goal: md`Write an editor script that lists a sprite sheet's colours, darkest first, and warns when there are more than 15.`,
            requirements: [
              md`Running it on \`assets/enemies/slime.png\` prints the number of colours and one line per colour with its hex code and luminance.`,
              md`Colours are sorted from darkest to lightest, so the slime's green ramp appears in order.`,
              md`Fully transparent pixels are not counted.`,
              md`Pointed at a sheet with soft (anti-aliased) edges or a blur, it reports a warning.`,
            ],
            hints: [
              md`\`load(path)\` returns the imported \`Texture2D\`; \`get_image()\` gives an \`Image\` you can read pixels from.`,
              md`Use a \`Dictionary\` keyed by \`color.to_html(false)\` to collect unique colours.`,
              md`\`Color.get_luminance()\` gives perceived brightness; sort with \`sort_custom\`.`,
            ],
            solution: [{ file: 'scripts/tools/palette_check.gd', code: PALETTE_CHECK }],
            explain: md`An \`EditorScript\` runs inside the editor (**File → Run** in the script editor), so it is a cheap way to build art tooling. The warning catches the most common pipeline mistake: exporting a sheet scaled with smoothing, which invents dozens of in-between colours.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'c01-1-paper',
            title: 'Screens and scales',
            type: 'compute',
            difficulty: 1,
            minutes: 5,
            statement: md`For each screen give Shardbound's integer scale: 1366×768 (a common laptop), 1920×1200, 3840×2160. Enter the three scales.`,
            solution: [
              md`1366×768: $\min(4, 4) = 4$ ($1366/320 = 4.27$, $768/180 = 4.27$), image 1280×720.`,
              md`1920×1200: $\min(6, 6) = 6$ ($1200/180 = 6.67$), image 1920×1080 with 60 px bars above and below.`,
              md`3840×2160: $\min(12, 12) = 12$, an exact fit.`,
            ],
            answer: { kind: 'vector', value: [4, 6, 12] },
          },
        },
        {
          kind: 'recall',
          prompt: md`What are the GBA's screen size and sprite palette limit, and what are Shardbound's viewport, tile and character frame sizes?`,
          answer: md`240×160; 16 colours per sprite palette (15 visible, colour 0 transparent) from 15-bit colour. Shardbound: 320×180 at integer scale, 16×16 tiles, 32×32 character frames.`,
        },
        {
          kind: 'explain',
          prompt: md`Why insist on integer scaling instead of filling the whole screen?`,
          model: md`At a non-integer scale such as 4.44, game pixels map to blocks of 4 or 5 screen pixels in an uneven pattern. Lines that should be even become uneven, and as sprites move their pixels change width from frame to frame, which reads as shimmering. Integer scaling keeps every pixel the same square size at the cost of black bars, which are a few percent of the screen at common resolutions.`,
        },
      ],
      cards: [
        { id: 'c01-1-c1', kind: 'concept', front: md`GBA screen, colour depth and sprite palette.`, back: md`240×160; 15-bit colour (32 768 colours); 4-bit sprites use a 16-colour palette with colour 0 transparent.` },
        { id: 'c01-1-c2', kind: 'compute', front: md`Largest integer scale of 320×180 on a 1680×1050 screen?`, answer: { kind: 'number', value: 5 }, back: md`$\min(\lfloor 5.25 \rfloor, \lfloor 5.83 \rfloor) = 5$, image 1600×900.` },
        { id: 'c01-1-c3', kind: 'concept', front: md`What is hue shifting in a ramp?`, back: md`Moving the hue toward yellow in the highlights and toward blue/purple in the shadows (adjusting saturation at the ends), so shading reads as warm light and cool shadow.` },
        { id: 'c01-1-c4', kind: 'cloze', text: md`Stretch mode {{}} renders the game at 320×180 and scales the finished image.`, answers: ['viewport'] },
        { id: 'c01-1-c5', kind: 'concept', front: md`What is a selective outline?`, back: md`A 1 px outline whose pixels are darker shades of the colours they border instead of pure black: it separates the sprite from the background without making it heavy.` },
      ],
    },
    {
      id: 'c01-2',
      title: 'Sprite sheets and animation timing',
      minutes: 45,
      objectives: [
        'Import a sprite sheet losslessly with nearest filtering and slice it with hframes/vframes or SpriteFrames.',
        'Choose between AnimatedSprite2D with SpriteFrames and AnimationPlayer for a given animation.',
        'Time animations in 60 Hz ticks and convert between FPS, ticks per frame and milliseconds.',
        'Use anticipation, a short contact frame and follow-through in a 4-frame attack.',
        'Anchor a sprite so the node\'s origin is at the character\'s feet.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Kai's sword attack is four drawings. Whether it feels snappy or sluggish, heavy or weightless, depends less on the drawings than on **how long each one stays on screen**. At 60 physics ticks per second, the difference between holding the wind-up for 4 ticks or 8 is 67 ms, and players feel it. This lesson gets the sheet into Godot, plays it two ways, and times it in ticks.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'Importing pixel art',
          md: md`Select a PNG in the **FileSystem** dock and open the **Import** dock (next to the Scene dock). For pixel art:
- **Compress → Mode**: *Lossless*. Lossy and VRAM compression change colours and smear edges.
- **Mipmaps → Generate**: off. Mipmaps are smaller blurred copies for distant 3D surfaces.
- Press **Reimport**. To make this the default, use the **Preset** menu at the top of the Import dock and save it as the default for Texture2D.

Filtering is not an import setting in Godot 4: it comes from **Rendering → Textures → Canvas Textures → Default Texture Filter** (set to *Nearest* in c01-1) or a node's **CanvasItem → Texture → Filter**.`,
        },
        { kind: 'assets', ids: ['hero', 'slime', 'skeleton', 'golem'], note: md`Character sheets have one animation per row, four columns of 32×32 frames, 18 rows, in the order idle (down, up, side), walk, attack, dash, jump (down, side), cast, hurt, ko, guard. The origin, the point that should sit on the node's position, is pixel (16, 30): the feet.` },
        {
          kind: 'text',
          md: md`### Slicing a sheet

A sheet is a grid. With $c$ columns, frame $(\text{col}, \text{row})$ has index $i = \text{row} \cdot c + \text{col}$, and the reverse is $\text{col} = i \bmod c$, $\text{row} = \lfloor i/c \rfloor$.

- **\`Sprite2D\`** shows one frame of a sheet: set **Animation → Hframes** (columns, 4) and **Vframes** (rows, 18), then **Frame** (the index) or **Frame Coords** (column and row). Changing \`frame\` from code or an \`AnimationPlayer\` animates it.
- **\`AnimatedSprite2D\`** plays named animations stored in a **\`SpriteFrames\`** resource. Each animation has a speed in frames per second, a loop flag, and per-frame **durations**: a frame with duration 2 stays twice as long as one with duration 1.`,
        },
        {
          kind: 'numeric',
          q: md`Kai's \`attack_side\` is row 8 of a 4-column sheet. What is the frame index of its third drawing?`,
          answer: { kind: 'number', value: 34 },
          explain: md`The third drawing is column 2 (counting from 0): $8 \cdot 4 + 2 = 34$. The animation's frames are 32, 33, 34, 35.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'AnimatedSprite2D or AnimationPlayer?',
          md: md`| | \`AnimatedSprite2D\` + \`SpriteFrames\` | \`AnimationPlayer\` |
|---|---|---|
| Animates | one sprite's frames | any property of any node, plus method calls and audio |
| Timing | FPS per animation, relative duration per frame | keys at exact times on a timeline |
| Good for | idle, walk, run, effects: anything that is only drawings | attacks and abilities, where a hitbox must switch on at frame 2, a sound must play on contact and the sprite must lunge 4 px |
| Set up | quick: "Add frames from sprite sheet" | slower: one track per property |

A common split, used in this course: \`AnimatedSprite2D\` for locomotion (c02 uses it for Kai's walk), \`AnimationPlayer\` driving a \`Sprite2D\`'s \`frame\` for actions, so the hitbox, sound and frame changes are keyed on one timeline and cannot drift apart (k01).`,
        },
        {
          kind: 'text',
          md: md`### Timing in ticks

Physics runs at 60 ticks per second, so one tick is $1000/60 \approx 16.7$ ms, and gameplay timing (when a hitbox is active, when a dodge ends) is counted in ticks. Animation timing should be counted the same way, so the drawing on screen matches what the game is doing.

An animation at $f$ frames per second holds each frame for $60/f$ ticks. At 12 FPS that is 5 ticks; at 8 FPS it is 7.5, which the renderer realises as alternating 7 and 8 ticks. Pixel animation rarely uses equal holds: a typical 4-frame attack holds its **anticipation** (wind-up) longest so the player sees it coming, flashes the **swing** for 2 ticks (often a smear frame), holds the **contact** a little, and spends the most time on **follow-through** (recovery), where the weapon settles. Holds of 2 to 6 ticks per frame are typical for fast actions, longer for idles.

In Godot, set the \`SpriteFrames\` animation speed to 60 FPS: then a frame's *duration* is simply its hold in ticks.`,
        },
        {
          kind: 'derive',
          title: 'from FPS and holds to milliseconds',
          goal: md`Find how long Kai's \`attack_side\` lasts at its default 14 FPS, and with holds of 6, 2, 4 and 8 ticks.`,
          steps: [
            { md: md`At $f$ FPS a frame lasts $1/f$ s, or $60/f$ ticks. At 14 FPS: $60/14 \approx 4.29$ ticks, about 71 ms.` },
            {
              md: md`Four frames: $4 \cdot 60/14 \approx 17.1$ ticks $\approx 286$ ms.`,
              choose: {
                prompt: md`In general, the length in milliseconds of an animation with holds $h_1, \dots, h_n$ ticks is:`,
                options: [md`$\tfrac{1000}{60}\sum_i h_i$`, md`$60\sum_i h_i$`, md`$\tfrac{1000}{60}\,n$`, md`$\sum_i h_i / 60$`],
                answer: 0,
                explain: md`Each tick is $1000/60$ ms, so add the ticks and convert once. $\sum_i h_i/60$ is the same length in seconds.`,
              },
            },
            { md: md`With holds 6, 2, 4, 8: $20$ ticks $= 333$ ms. The wind-up alone is 100 ms, long enough to read, and the swing is 33 ms, short enough to feel instant.` },
          ],
          takeaway: md`Plan attacks in ticks; convert with $\text{ms} = 16.\overline{6} \times \text{ticks}$. k01 uses the same numbers for startup, active and recovery frames.`,
        },
        {
          kind: 'viz',
          viz: { type: 'core.pixelAnim', sheet: 'hero', anim: 'attack_side', timing: 'holds' },
          task: md`Play Kai's \`attack_side\` with equal holds of 4, then set the holds to 8, 2, 4, 10 and compare: which reads as heavier? Step through frame by frame with onion skin on. Then switch to the slime's \`hop\` and the golem's \`slam\` and look for anticipation in each.`,
          caption: md`The bar shows each frame's share of the cycle in ticks, with the playhead; the yellow cross is the node's origin, where the feet should be. The sheet below outlines the animation's frames and fills the current one, with the column and row Sprite2D would use.`,
        },
        {
          kind: 'check',
          q: md`An attack feels "floaty": the swing seems to start before the player expects it and the hit lands softly. The holds are 3, 3, 3, 3 ticks. Which change most likely helps?`,
          options: [md`Lengthen the wind-up and recovery, shorten the swing: for example 6, 2, 3, 8`, md`Shorten every frame to 2 ticks`, md`Lengthen every frame to 6 ticks`, md`Add more frames between swing and contact`],
          answer: 0,
          explain: md`Equal holds give no emphasis. A held wind-up shows the attack coming, a 2-tick swing makes the motion feel fast and forceful, and a held recovery gives weight. Shortening everything makes it twitchy; lengthening everything makes it slow.`,
        },
        {
          kind: 'text',
          md: md`### Anchoring at the feet

In a top-down game a character's position is where they stand: collisions are at the feet (c02), and drawing order by y (later, with y-sort) compares feet. So the sprite must be drawn so its feet pixel lands on the node's origin.

A \`Sprite2D\` or \`AnimatedSprite2D\` with **Centered** on draws the frame's centre at the origin. For a 32×32 frame the centre is pixel (16, 16) and Kai's feet are at (16, 30), so set **Offset** to $(0, 16 - 30) = (0, -14)$. (c02 moved the sprite node up by 12 px for the same purpose; an offset of $-14$ puts the feet exactly on the origin.) With **Centered** off, the top-left corner is at the origin and the offset is $(-16, -30)$.`,
        },
        {
          kind: 'numeric',
          q: md`The golem's frames are 48×48 with its feet at pixel (24, 46). With **Centered** on, what **Offset** y puts its feet on the node's origin?`,
          answer: { kind: 'number', value: -22 },
          explain: md`The centre is (24, 24); the offset must move pixel 46 up to the origin: $24 - 46 = -22$. Offset x is $24 - 24 = 0$.`,
        },
        {
          kind: 'steps',
          title: "Build Kai's animations",
          steps: [
            md`Select \`assets/characters/kai.png\` in the FileSystem dock; in the Import dock check **Compress → Mode** is *Lossless* and **Mipmaps → Generate** is off, and **Reimport** if you changed anything.`,
            md`Create \`scripts/tools/build_frames.gd\` with the listing below, open it in the script editor and choose **File → Run** (Ctrl+Shift+X). The Output panel prints \`saved res://resources/kai_frames.tres: OK\`.`,
            md`Open \`scenes/player.tscn\`, select the \`AnimatedSprite2D\` and drag \`resources/kai_frames.tres\` into its **Sprite Frames** property. Set **Offset** to (0, -14) and its **Position** back to (0, 0).`,
            md`Open the **SpriteFrames** panel at the bottom: all 18 animations are listed. Select \`attack_side\` and press play in the panel.`,
            md`Run the game: c02's script plays \`idle_*\` and \`walk_*\` as before, now with the feet exactly on the collision shape.`,
          ],
          result: md`Kai walks and idles with all directions, the side animations flip for left, and the debug collision box (Debug → Visible Collision Shapes) sits exactly under his feet.`,
          troubleshoot: [
            { problem: md`"Error loading resource" or the sheet path is wrong.`, fix: md`Check \`SHEET_PATH\` against the file's path in the FileSystem dock (right-click → Copy Path).` },
            { problem: md`Frames show the wrong character pose or half of two frames.`, fix: md`The row or frame size is off. Kai's sheet is 4 columns × 18 rows of 32×32; the region for (col, row) is \`Rect2(col * 32, row * 32, 32, 32)\`.` },
            { problem: md`The script runs but nothing is saved.`, fix: md`An EditorScript needs \`@tool\` and \`extends EditorScript\`, and must be run from the script editor's **File → Run**, not with F5/F6.` },
          ],
        },
        { kind: 'code', file: 'scripts/tools/build_frames.gd', code: BUILD_FRAMES, note: md`Generating the \`SpriteFrames\` from a table is faster and less error-prone than clicking 50 frames into the editor, and rerunning it after the artist changes the sheet updates every animation. An \`AtlasTexture\` is a view into a region of another texture, so all frames share one image in memory.` },
        {
          kind: 'build',
          ch: {
            id: 'c01-2-build',
            title: 'Attacks timed in ticks',
            goal: md`Change the frame builder so attacks run at 60 FPS with per-frame holds, and measure the result in the running game.`,
            requirements: [
              md`\`attack_side\`, \`attack_down\` and \`attack_up\` use holds of 6, 2, 4 and 8 ticks.`,
              md`The tool prints each animation's length; the attacks print 333 ms.`,
              md`A test sprite playing \`attack_side\` once reports, through \`animation_finished\`, a measured time within one frame (17 ms) of 333 ms.`,
              md`Walk and idle animations keep their FPS-based timing.`,
            ],
            hints: [
              md`\`SpriteFrames.add_frame(anim, texture, duration)\` takes the duration as its third argument.`,
              md`The length of one pass is the sum of \`get_frame_duration\` over the frames divided by \`get_animation_speed\`.`,
              md`Measure with \`Time.get_ticks_msec()\` when you call \`play\` and again in the \`animation_finished\` handler.`,
            ],
            solution: [
              { file: 'scripts/tools/build_frames.gd', code: BUILD_FRAMES_HOLDS },
              { file: 'scripts/tests/attack_timer.gd', code: ATTACK_TIMER },
            ],
            explain: md`With the animation speed at 60 FPS, one unit of frame duration is one tick, so the holds in the table are the holds on screen. The measured time can differ from 333 ms by up to a rendered frame, because animation advances with rendering, not with the physics tick.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'c01-2-paper',
            title: 'A golem slam in ticks',
            type: 'design',
            difficulty: 2,
            minutes: 10,
            statement: md`The golem's \`windup\` (3 frames) and \`slam\` (3 frames) should give the player at least 0.5 s to see the attack coming and dodge, then hit hard. Choose holds in ticks for all six frames, give the total in milliseconds, and say which frame you would key the hitbox on.`,
            solution: [
              md`Wind-up: 8, 10, 14 ticks (32 ticks, 533 ms): the last wind-up frame, the golem at the top of its swing, is held longest, as a clear "now" cue before the slam.`,
              md`Slam: 2 (the fall, a smear), 6 (impact, with screen shake from k01), 16 (recovery, the punish window): 24 ticks, 400 ms.`,
              md`Total 56 ticks, about 933 ms. Key the hitbox on during the impact frame's 6 ticks only, so the danger matches what the player sees.`,
            ],
            rubric: [md`Wind-up totals at least 30 ticks (0.5 s)`, md`The fall or swing frame is short (2 to 3 ticks)`, md`Recovery is long enough to punish`, md`Hitbox tied to the impact frame`],
          },
        },
        {
          kind: 'recall',
          prompt: md`Convert: 12 FPS to ticks per frame; 4 ticks to milliseconds; holds 6, 2, 4, 8 to total milliseconds.`,
          answer: md`$60/12 = 5$ ticks. $4 \times 16.7 \approx 67$ ms. $20$ ticks $\approx 333$ ms.`,
        },
        {
          kind: 'explain',
          prompt: md`Why animate attacks with an AnimationPlayer instead of AnimatedSprite2D?`,
          model: md`An attack is more than drawings: the hitbox must turn on during the contact frames, a sound must play on contact, the character may lunge a few pixels, and the attack may be cancellable only after a certain tick. An AnimationPlayer keys all of these on one timeline, so if the artist changes a frame's hold, the hitbox and sound move with it. With an AnimatedSprite2D you would have to watch frame_changed and duplicate the timing in code, where it can drift from the art.`,
        },
      ],
      cards: [
        { id: 'c01-2-c1', kind: 'compute', front: md`An animation at 12 FPS: ticks per frame at 60 Hz?`, answer: { kind: 'number', value: 5 }, back: md`$60/12 = 5$ ticks, about 83 ms.` },
        { id: 'c01-2-c2', kind: 'cloze', text: md`With 4 columns, frame index $i$ is at column $i \bmod 4$ and row \`{{}}\`.`, answers: ['i / 4|floor(i/4)|i/4'] },
        { id: 'c01-2-c3', kind: 'concept', front: md`AnimatedSprite2D or AnimationPlayer for an attack, and why?`, back: md`AnimationPlayer: it keys the frame, the hitbox, the sound and any lunge on one timeline, so they stay in sync when timing changes.` },
        { id: 'c01-2-c4', kind: 'concept', front: md`How do you make SpriteFrames durations mean ticks?`, back: md`Set the animation speed to 60 FPS; a frame's duration is then the number of 60 Hz ticks it is held.` },
        { id: 'c01-2-c5', kind: 'compute', front: md`Centered 32×32 sprite, feet at pixel (16, 30). Offset y?`, answer: { kind: 'number', value: -14 }, back: md`$16 - 30 = -14$.` },
      ],
    },
    {
      id: 'c01-3',
      title: 'Pixel-perfect motion and palette swaps',
      minutes: 40,
      objectives: [
        'Explain how viewport and canvas_items stretch modes draw positions between pixels.',
        'Predict the stepping of sub-pixel motion: at $s$ px per tick the sprite moves 1 px every $1/s$ ticks on average.',
        'Remove jitter between a sprite and a smoothed camera by rounding positions in world space.',
        'Recolour a sprite with a palette-swap shader and set its colours per instance.',
        'Describe the pipeline from a pixel editor (Aseprite, LibreSprite, Pixelorama) to Godot.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Two problems show up the first time a camera follows Kai across a field. He moves slowly and his steps look uneven; and with camera smoothing on, he seems to shiver against the grass by one pixel. Both come from the same fact: positions are floats, but a 320×180 image only has whole pixels.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Sub-pixel positions',
          md: md`A node at x = 10.3 is between game pixels 10 and 11. In *viewport* stretch mode the game is rendered at 320×180, so the sprite must be drawn at 10 or 11: the fraction is kept in the position (motion stays correct over time) but is invisible in any one frame. In *canvas_items* mode the game is rendered at window resolution, so at ×4 the sprite can sit at 10.25 game pixels: motion looks smoother, but the sprite's pixels no longer line up with the background's, and rotated or scaled sprites show pixels of mixed sizes ("mixels").`,
        },
        {
          kind: 'derive',
          title: 'the stepping pattern of slow motion',
          goal: md`A sprite moves $s < 1$ px per tick and is drawn at its rounded position. When does the drawn position change?`,
          steps: [
            { md: md`After $n$ ticks the true position is $x_0 + s\,n$ and the drawn one is $\operatorname{round}(x_0 + s\,n)$. It increases by 1 each time the true position crosses a half-pixel boundary.` },
            {
              md: md`Boundaries are 1 px apart, so on average a crossing happens every $1/s$ ticks.`,
              choose: {
                prompt: md`At $s = 0.3$ px per tick, how many ticks pass between visible 1 px steps?`,
                options: [md`3 or 4, averaging 3.33`, md`Always 3`, md`Always 0.3`, md`10`],
                answer: 0,
                explain: md`$1/0.3 = 3.33$. Since ticks are whole, the gaps are 3 and 4 in the pattern 3, 3, 4, 3, 3, 4, …, which the eye notices as a slight limp.`,
              },
            },
            { md: md`For $s > 1$ the same happens per tick: at 1.5 px per tick (90 px/s, Kai's walk) the drawn position advances 1, 2, 1, 2 pixels. The unevenness is smaller relative to the motion and usually goes unnoticed; it matters most for slow things such as clouds, idle drifting and slow camera pans.` },
          ],
          takeaway: md`Uneven steps are unavoidable in a low-resolution viewport; choose speeds whose pattern is short (0.25, 0.5, 1, 2 px per tick are perfectly even) for slow, prominent motion.`,
        },
        {
          kind: 'viz',
          viz: { type: 'core.pixelSnap', draw: 'screen', camera: 'smooth', speed: 0.3 },
          task: md`With a smoothed camera and **round on screen**, watch Kai against the black dots on the ground and count the red backward steps in the strip. Switch to **snap in world**: the backward steps disappear. Then set the camera to **fixed** and try speeds 0.3, 0.25 and 0.5, reading the step pattern. Finally try **high-res** and look at Kai's pixels against the grass.`,
          caption: md`The view is 80×45 game pixels scaled ×4. The strip plots the drawn position minus the true position: a sawtooth between ±0.5 means clean rounding; red dots mark frames where Kai moved backward relative to the ground, the visible shiver.`,
        },
        {
          kind: 'text',
          md: md`### Why the shiver happens, and the fix

With a smoothed camera, the camera position is a float that lags behind Kai and moves at a different, changing speed. The renderer subtracts the camera and rounds each object's final position separately: Kai at $\operatorname{round}(x - c)$, the ground at $\operatorname{round}(-c)$. Their difference is not $\operatorname{round}(x)$; depending on the two fractional parts it can be one pixel more or less, and it flips back and forth as the fractions drift. Kai shivers against the ground while both move smoothly on their own.

The fix is to round **in the world**, before the camera is subtracted: keep the camera on whole pixels and draw Kai at a whole-pixel position. Then the difference between them is a whole number that changes only when Kai crosses a pixel. Two settings and one script do it in Godot:

- **Rendering → 2D → Snap → Snap 2D Transforms to Pixel** (set in c01-1) makes nodes draw at whole pixels.
- A camera that smooths a float position internally and **places itself on whole pixels**, the listing below. Godot's built-in **Position Smoothing** moves the camera to fractional positions, so this script turns it off and does its own.

Kai's physics position stays a float, so his speed is unaffected.`,
        },
        { kind: 'code', file: 'scripts/pixel_camera.gd', code: PIXEL_CAMERA, note: md`Add a \`Camera2D\` to the level scene (not as a child of Kai, so it can lag behind him), attach this script and drag Kai into **Target**. The smoothing is a fixed fraction per tick, which is frame-rate independent because \`_physics_process\` runs at a fixed 60 Hz.` },
        {
          kind: 'check',
          q: md`To stop the shiver, a teammate adds \`position = position.round()\` at the end of Kai's \`_physics_process\`. Kai's walk speed is 90 px/s, but his slow "sneak" at 15 px/s no longer moves at all. Why?`,
          options: [md`15 px/s is 0.25 px per tick; rounding the real position every tick throws the progress away before it can add up to a pixel`, md`\`round()\` does not exist on \`Vector2\``, md`Snapping is incompatible with \`move_and_slide\``, md`The camera is still smoothing`],
          answer: 0,
          explain: md`Each tick moves Kai 0.25 px and rounding puts him back where he was. Round only what is drawn (the camera's position, or a sprite child's \`global_position\`), never the physics position that accumulates motion.`,
        },
        {
          kind: 'numeric',
          q: md`A cloud drifts at 0.3 px per tick in a 320×180 viewport. How many visible 1 px steps does it make per second?`,
          answer: { kind: 'number', value: 18 },
          explain: md`$0.3 \times 60 = 18$ px per second, so 18 steps, spaced 3 or 4 ticks apart.`,
        },
        {
          kind: 'text',
          md: md`### Palette swaps

Enemy variants (a fire slime, an ice slime), alternative costumes and team colours are often the same drawings with a different palette. Instead of duplicating the sheet, a **shader** can swap colours as the sprite is drawn: for each pixel, if its colour matches one of the original ramp's colours, output the matching colour of the new ramp. This works cleanly only because pixel art uses a few exact colours; a blurred or anti-aliased sheet has in-between colours that will not match.

A shader is a small program that runs on the graphics card for every pixel. p01 covers shaders properly (flashes, outlines, dissolves); this one is short enough to use as it is.`,
        },
        {
          kind: 'viz',
          viz: { type: 'core.pixelRamp', hue: 8, steps: 4, shift: 25 },
          task: md`Pick Kai's tunic colours and build a red ramp for them (hue around 0 to 10). Then copy the shader below the figure: its \`from_*\` and \`to_*\` values are exactly the colours you see.`,
        },
        { kind: 'code', file: 'assets/shaders/palette_swap.gdshader', lang: 'shader', code: SWAP_SHADER, note: md`\`source_color\` tells the Inspector to show a colour picker for the uniform. The default \`from_*\` values are greens from the course palette and the \`to_*\` values a red ramp; set \`from_*\` to your sprite's exact colours (c01-1's palette checker lists them). The tolerance 0.02 absorbs rounding between the PNG and the GPU without catching neighbouring palette colours.` },
        {
          kind: 'steps',
          title: 'Make a fire slime',
          steps: [
            md`Create \`assets/shaders/palette_swap.gdshader\` (**FileSystem → right-click → Create New → Resource… → Shader**, or from the material in the next step) with the listing above.`,
            md`Open your slime scene, select its \`AnimatedSprite2D\` and, in **CanvasItem → Material**, choose **New ShaderMaterial**. Click it, and set its **Shader** to \`palette_swap.gdshader\`.`,
            md`Expand **Shader Parameters**. For each \`from_*\` use the colour picker's eyedropper on the slime in the 2D view, darkest to lightest, or run c01-1's palette checker and type the hex codes.`,
            md`Attach \`scripts/fire_slime.gd\` (below) to the \`AnimatedSprite2D\`, then instance two slimes in a test room and give one a blue ramp in its **Ramp** property.`,
          ],
          result: md`Two slimes from the same scene and sheet, one red and one blue, animating normally. Changing one's ramp does not change the other.`,
          troubleshoot: [
            { problem: md`Nothing changes colour.`, fix: md`The \`from_*\` colours do not match the sheet exactly. Check with the palette checker; a lossy import also alters colours (set **Compress → Mode** to *Lossless*).` },
            { problem: md`Changing one slime recolours every slime.`, fix: md`They share one material resource. Duplicate it per instance (the script does this in \`_ready\`), or tick **Local to Scene** on the material.` },
          ],
        },
        { kind: 'code', file: 'scripts/fire_slime.gd', code: FIRE_SLIME },
        {
          kind: 'callout',
          tone: 'design',
          title: 'The art pipeline',
          md: md`- **Editors.** *Aseprite* (paid, widely used, layers, tags for animations, sheet export), *LibreSprite* (free, a fork of an older Aseprite version), *Pixelorama* (free, made with Godot). Any of them can export a PNG sheet on a fixed grid.
- **Source files** (\`.aseprite\`, \`.pxo\`) go in a folder such as \`art_src/\` with an empty file named \`.gdignore\` in it, so Godot does not try to import them. Exported PNGs go in \`assets/\`.
- **Export at 1×**, never scaled: scaling belongs to the game. One animation per row in a fixed order, as this course's sheets do, keeps the frame builder's table valid.
- **Re-export over the same file.** Godot notices the change when its window regains focus and reimports with the same settings, and every SpriteFrames and AtlasTexture that points at the sheet updates.
- **Check with the tools**: the palette checker (colour count), and the game at 1× and at ×4.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'c01-3-build',
            title: 'Colour variants from one scene',
            goal: md`Make the slime scene support any number of colour variants through the palette-swap shader and an exported ramp.`,
            requirements: [
              md`One slime scene, with a **Ramp** property of four colours in the Inspector.`,
              md`Three instances in a room show three different colour schemes at the same time.`,
              md`Variants keep their 1 px outline and transparent background (alpha is untouched).`,
              md`Changing one instance's ramp in the running game (Remote scene tree) changes only that instance.`,
            ],
            hints: [
              md`\`material.set_shader_parameter("to_0", color)\` sets a uniform from GDScript.`,
              md`Duplicate the material in \`_ready\` so instances do not share it.`,
              md`The shader writes \`COLOR = vec4(rgb, c.a)\`, so alpha passes through untouched.`,
            ],
            solution: [
              { file: 'assets/shaders/palette_swap.gdshader', code: SWAP_SHADER, lang: 'shader' },
              { file: 'scripts/fire_slime.gd', code: FIRE_SLIME },
            ],
            explain: md`The sheet is drawn once; the ramp is data. The same approach gives Kai alternative costumes and makes status effects (poisoned green, frozen blue) a material swap. p01 extends the shader to fade between palettes and to flash on hits.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'c01-3-paper',
            title: 'Kai walking, pixel by pixel',
            type: 'compute',
            difficulty: 2,
            minutes: 6,
            statement: md`Kai walks right at 90 px/s from $x = 100.0$, drawn at the rounded position (round half up). (a) How many pixels does he move per tick? (b) Give his drawn x for ticks 1 to 4. Enter the four drawn positions.`,
            solution: [
              md`(a) $90/60 = 1.5$ px per tick.`,
              md`(b) True positions 101.5, 103.0, 104.5, 106.0; rounding half up gives 102, 103, 105, 106.`,
              md`The drawn steps are 2, 1, 2, 1 px: even on average, uneven tick to tick. At ×4 that is 8 and 4 screen pixels, which is why some games pick 1 or 2 px per tick for walking.`,
            ],
            answer: { kind: 'vector', value: [102, 103, 105, 106] },
          },
        },
        {
          kind: 'recall',
          prompt: md`What causes a sprite to shiver against the background when the camera smooths, and what fixes it?`,
          answer: md`The sprite and the background are rounded separately after the fractional camera position is subtracted, so their difference flips by a pixel. Round in world space: keep the camera on whole pixels (smooth a float, place the camera at its rounded value) and draw at whole pixels (Snap 2D Transforms to Pixel), while physics positions stay floats.`,
        },
        {
          kind: 'explain',
          prompt: md`Why does a palette-swap shader need exact colours, and what in the pipeline can break that?`,
          model: md`The shader decides per pixel by comparing the colour with the original ramp's colours, so only pixels that match within a small tolerance are replaced. Pixel art keeps a few exact colours, which makes this reliable. Anything that invents in-between colours breaks it: exporting a scaled-up sheet with smoothing, lossy or VRAM compression on import, linear filtering, or soft brushes and anti-aliasing in the editor. Those pixels keep their original colours and show up as speckles of the old palette.`,
        },
      ],
      cards: [
        { id: 'c01-3-c1', kind: 'concept', front: md`viewport versus canvas_items stretch for pixel art.`, back: md`viewport renders at 320×180 and scales the image: positions are drawn at whole game pixels. canvas_items renders at window resolution: smoother sub-pixel motion, but sprites can sit between game pixels and rotation shows mixels.` },
        { id: 'c01-3-c2', kind: 'compute', front: md`A sprite moves 0.25 px per tick. Ticks between 1 px steps?`, answer: { kind: 'number', value: 4 }, back: md`$1/0.25 = 4$, perfectly even.` },
        { id: 'c01-3-c3', kind: 'concept', front: md`Why must you not round a body's physics position every tick?`, back: md`Motion below 0.5 px per tick is thrown away each tick, so slow movement never happens. Round only what is drawn.` },
        { id: 'c01-3-c4', kind: 'cloze', text: md`Godot's setting \`rendering/2d/snap/{{}}\` makes nodes draw at whole pixels.`, answers: ['snap_2d_transforms_to_pixel'] },
        { id: 'c01-3-c5', kind: 'concept', front: md`How does a palette swap avoid duplicating sprite sheets?`, back: md`A shader replaces each pixel matching an original ramp colour with the matching colour of a new ramp; the ramp is per-instance data on the material.` },
      ],
    },
  ],
  problems: [
    {
      id: 'c01-p1',
      title: 'Ultrawide',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`On a 3440×1440 monitor, what integer scale does Shardbound use, and how wide is each side bar?`,
      solution: [md`$\lfloor 3440/320 \rfloor = 10$, $\lfloor 1440/180 \rfloor = 8$, so $s = 8$: 2560×1440.`, md`Side bars: $(3440 - 2560)/2 = 440$ px each.`],
      answer: { kind: 'vector', value: [8, 440] },
    },
    {
      id: 'c01-p2',
      title: 'Frame coordinates',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`A \`Sprite2D\` uses Kai's sheet with Hframes 4 and Vframes 18. Its \`frame\` is 37. What are its \`frame_coords\` (column, row), and which animation is that?`,
      solution: [md`Column $37 \bmod 4 = 1$, row $\lfloor 37/4 \rfloor = 9$.`, md`Row 9 is \`dash_down\` (rows 9 to 11 are the dashes), so frame 37 is its second drawing.`],
      answer: { kind: 'vector', value: [1, 9] },
    },
    {
      id: 'c01-p3',
      title: 'Attack length',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`An attack's frames are held 5, 2, 3 and 9 ticks at 60 Hz. How long is it, in milliseconds?`,
      solution: [md`$5 + 2 + 3 + 9 = 19$ ticks.`, md`$19 \times 1000/60 \approx 316.7$ ms.`],
      answer: { kind: 'number', value: (19 * 1000) / 60 },
    },
    {
      id: 'c01-p4',
      title: '8 FPS on a 60 Hz clock',
      type: 'compute',
      difficulty: 2,
      minutes: 5,
      statement: md`A walk cycle runs at 8 FPS with 4 frames. (a) Average ticks per frame? (b) Length of one cycle in milliseconds? Enter both.`,
      solution: [md`(a) $60/8 = 7.5$ ticks: frames alternate between 7 and 8 ticks on screen.`, md`(b) $4/8 = 0.5$ s $= 500$ ms (30 ticks).`],
      answer: { kind: 'vector', value: [7.5, 500] },
    },
    {
      id: 'c01-p5',
      title: 'Anchoring the bat',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`The bat's frames are 16×16 and its origin is (8, 8), the middle of its body, because it flies. With **Centered** on, what offset is needed? And with **Centered** off? Enter the y offsets for both cases.`,
      solution: [md`Centered: the centre is already (8, 8), so offset $(0, 0)$.`, md`Not centered: offset $(-8, -8)$. For a flying enemy the shadow is drawn separately at the ground below it (c03 builds the height and shadow).`],
      answer: { kind: 'vector', value: [0, -8] },
    },
    {
      id: 'c01-p6',
      title: 'The sneak that never moves',
      type: 'debug',
      difficulty: 2,
      minutes: 8,
      statement: md`This "pixel-perfect" player script stops jitter, but Kai's sneak (\`sneak_speed = 20\`) does not move at all, and his diagonal walk is slower than his straight walk. Find the bug and fix it.

\`\`\`gdscript
func _physics_process(_delta: float) -> void:
    var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")
    var speed := sneak_speed if Input.is_action_pressed("guard") else max_speed
    velocity = input * speed
    move_and_slide()
    position = position.round()
\`\`\``,
      hints: [md`How far does Kai move in one tick at 20 px/s? Diagonally at 90 px/s, how far on each axis?`],
      solution: [
        md`Rounding the physics position every tick discards any per-tick motion under 0.5 px. At 20 px/s Kai moves 0.33 px per tick and is rounded back each time. Diagonally at 90 px/s each axis moves $1.5/\sqrt 2 \approx 1.06$ px, rounded to 1 px: the diagonal speed drops, and with uneven inputs (a stick slightly off-diagonal) one axis can be rounded to 0 while the other moves, bending the path.`,
        md`Fix: delete the rounding line. Keep the physics position as a float; round only what is drawn, with **Snap 2D Transforms to Pixel** and a camera that sits on whole pixels.`,
      ],
      rubric: [md`Identifies that rounding the physics position discards sub-pixel motion`, md`Explains both symptoms`, md`Rounds only the drawn position or camera`],
    },
    {
      id: 'c01-p7',
      title: 'Which animation tool',
      type: 'concept',
      difficulty: 1,
      minutes: 5,
      statement: md`For each, choose \`AnimatedSprite2D\` or \`AnimationPlayer\` and say why: (a) a torch flickering on a wall; (b) Bram's shield bash, which lunges 6 px, enables a hitbox for 4 ticks and plays a sound; (c) Kai's walk cycle; (d) a chest opening that also spawns a coin and plays a jingle.`,
      solution: [md`(a) AnimatedSprite2D: only drawings, looping. (c) AnimatedSprite2D: drawings only, speed may scale with movement.`, md`(b) and (d) AnimationPlayer: several properties, a hitbox or a method call (spawning the coin) and audio must stay in sync with frames on one timeline.`],
      rubric: [md`Drawings-only cases use AnimatedSprite2D`, md`Cases with other synced properties, calls or sounds use AnimationPlayer`],
    },
    {
      id: 'c01-p8',
      title: 'Frame at a tick',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 8,
      statement: md`Write \`func frame_at(tick: int, holds: Array[int], loop: bool) -> int\` returning the frame index shown at a given tick since the animation started. Then evaluate it for holds \`[6, 2, 4, 8]\` at ticks 7, 19 and 25, with \`loop = true\`.`,
      solution: [
        md`\`\`\`gdscript
func frame_at(tick: int, holds: Array[int], loop: bool) -> int:
    var total := 0
    for h in holds:
        total += h
    if loop:
        tick = tick % total
    elif tick >= total:
        return holds.size() - 1  # a one-shot animation stays on its last frame
    for i in holds.size():
        if tick < holds[i]:
            return i
        tick -= holds[i]
    return holds.size() - 1
\`\`\``,
        md`Frame 0 covers ticks 0 to 5, frame 1 ticks 6 to 7, frame 2 ticks 8 to 11, frame 3 ticks 12 to 19. Tick 7 is frame 1; tick 19 is frame 3; tick 25 wraps to $25 \bmod 20 = 5$, frame 0.`,
        md`It is the same walk as the weighted pick in m05-3: holds laid end to end, find the segment containing the tick.`,
      ],
      answer: { kind: 'vector', value: [1, 3, 0] },
      rubric: [md`Wraps with modulo when looping`, md`Holds the last frame when not looping`, md`Evaluates to 1, 3, 0`],
    },
  ],
};
