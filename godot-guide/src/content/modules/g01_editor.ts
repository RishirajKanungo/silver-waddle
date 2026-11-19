import { md, gd, type Module } from '../types';

const PROJECT_DISPLAY = `[display]

window/size/viewport_width=320
window/size/viewport_height=180
window/size/window_width_override=1280
window/size/window_height_override=720
window/stretch/mode="viewport"
window/stretch/scale_mode="integer"

[rendering]

textures/canvas_textures/default_texture_filter=0
`;

const LAYER_NAMES_CFG = `[layer_names]

2d_physics/layer_1="world"
2d_physics/layer_2="player"
2d_physics/layer_3="party"
2d_physics/layer_4="enemy"
2d_physics/layer_5="player_hitbox"
2d_physics/layer_6="enemy_hitbox"
2d_physics/layer_7="interactable"
2d_physics/layer_8="pickup"
`;

const INPUT_PROBE = gd`
extends Node
## Prints every course action when it is pressed, and the movement vector
## four times a second. Attach to any node, run the scene, press things.

const ACTIONS: Array[StringName] = [
    &"move_left", &"move_right", &"move_up", &"move_down",
    &"attack", &"dodge", &"jump", &"guard",
    &"tactical", &"switch_character", &"interact", &"pause",
]


func _process(_delta: float) -> void:
    for action in ACTIONS:
        if Input.is_action_just_pressed(action):
            print("pressed: ", action)
    var move := Input.get_vector("move_left", "move_right", "move_up", "move_down")
    if move != Vector2.ZERO and Engine.get_process_frames() % 15 == 0:
        print("move: ", move, "  length: ", snappedf(move.length(), 0.01))
`;

const DRIFTER_V1 = gd`
extends Node2D

## Horizontal speed in pixels per second.
@export var speed := 40.0


func _process(delta: float) -> void:
    # delta is the time since the previous frame, in seconds.
    position.x += speed * delta
    # Leave on the right, come back on the left.
    if position.x > 336.0:
        position.x = -16.0
`;

const DRIFTER_V2 = gd`
extends Node2D

## Pixels per second.
@export var speed := 60.0


func _process(delta: float) -> void:
    var input := Input.get_vector("move_left", "move_right", "move_up", "move_down")
    position += input * speed * delta
`;

const PATROL = gd`
extends Sprite2D
## Walks between two x positions and turns around at each end.
## Kai's side frames face right, so flip_h makes him face left.

## Walking speed, pixels per second.
@export var speed := 40.0
## Turning points, in pixels from the left edge of the screen.
@export var left_x := 40.0
@export var right_x := 280.0

## +1 walking right, -1 walking left.
var _direction := 1.0


func _physics_process(delta: float) -> void:
    position.x += _direction * speed * delta
    if position.x >= right_x:
        position.x = right_x
        _direction = -1.0
    elif position.x <= left_x:
        position.x = left_x
        _direction = 1.0
    flip_h = _direction < 0.0
`;

export const MODULE: Module = {
  id: 'g01',
  part: 'godot',
  order: 1,
  title: 'Editor, project setup and the first scene',
  summary: 'Install Godot 4.4, open the starter project, learn the editor, set up a crisp 320×180 pixel-art display, the input actions and physics layers the whole course uses, and move a sprite with frame-rate independent code.',
  relevance: md`Every later module assumes the settings made here: a 320×180 viewport scaled by whole numbers so Shardbound's pixel art stays sharp on a laptop, a 4K monitor and a Steam Deck; twelve named input actions so Kai can be played on keyboard or gamepad without code changes; eight named physics layers so walls, enemies, hitboxes and pickups only see what they should; and movement multiplied by \`delta\` so the game plays at the same speed at 60 and 144 Hz.`,
  areas: ['godot', 'art', 'feel'],
  lessons: [
    {
      id: 'g01-1',
      title: 'Installing Godot, the editor and a crisp pixel-art display',
      minutes: 40,
      objectives: [
        'Install Godot 4.4 or newer (standard build) and import the starter project.',
        'Name the Scene, FileSystem, Inspector and Node docks and say what each is for.',
        'Run the project with F5 and the current scene with F6, and find errors in the Output and Debugger panels.',
        'Set a 320×180 viewport with stretch mode `viewport`, integer scaling and nearest filtering, and explain what each setting prevents.',
        'Compute the integer scale and the black bars for a given window size: $s = \\lfloor \\min(W/320,\\ H/180) \\rfloor$.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Shardbound is drawn at 320×180 pixels, the size of a large Game Boy Advance screen stretched to 16:9. Players will run it in a 1280×720 window, fullscreen on a 1920×1080 monitor, on a 2560×1440 monitor and on a Steam Deck at 1280×800. On every one of those screens each game pixel has to become a sharp square block of screen pixels, all of the same size. If that goes wrong you see it immediately: soft, blurry sprites, or one-pixel outlines that flicker between thin and thick as a character walks.

Godot can do this with four project settings. Before setting them, this lesson installs Godot, opens the course's starter project and walks through the editor, because every later lesson gives instructions in terms of its panels.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'What a Godot project is made of',
          md: md`- A **node** is one object with one job: a sprite (\`Sprite2D\`), a collision shape, a sound player, a timer, a camera. Nodes form a tree: every node has one parent and any number of children.
- A **scene** is a tree of nodes saved to a \`.tscn\` file. A player, a coin, a room and the whole game are each scenes, and scenes can contain other scenes.
- A **script** (\`.gd\`, GDScript) attaches to a node and adds behaviour. It extends the node's class, so a script on a \`Sprite2D\` can read and change that sprite's properties directly.
- A **resource** is data Godot can save and load: textures, sounds, animations, and your own data such as enemy stats (module g04).
- \`res://\` is the project folder. Paths in Godot are written from there, for example \`res://scenes/player.tscn\`.`,
        },
        {
          kind: 'steps',
          title: 'Install Godot and open the starter project',
          steps: [
            md`Download **Godot 4.4 or newer, the standard version**, from godotengine.org (it is also on Steam and itch.io). Do not take the *.NET* version: it exists for C# and needs the .NET SDK. Godot is a single program with no installer: unzip it anywhere. On macOS, move *Godot.app* into *Applications*.`,
            md`Get the course repository. The starter project lives in \`godot-guide/godot/starter/\`. It already contains the folders the course uses (\`scenes/\`, \`scripts/\`, \`scripts/autoload/\`, \`scripts/resources/\`, \`scenes/components/\`, \`resources/\`, \`ui/\`) and all the art and sound under \`assets/\`.`,
            md`Start Godot. The **Project Manager** opens. Click **Import**, browse to \`godot-guide/godot/starter/project.godot\`, select it, and confirm with **Import & Edit**.`,
            md`The first time, Godot imports every image and sound (a progress bar for a few seconds). Imported data goes into a hidden \`.godot/\` folder that you never edit and never commit to git.`,
            md`Look at the editor (the tour below names every part). In the **FileSystem** dock, bottom left, open \`assets/\` and double-click a \`.png\`: the Inspector on the right shows the image and its import settings.`,
          ],
          result: md`The editor is open on the starter project. The FileSystem dock shows \`res://\` with the course folders, and the title bar shows the project's name.`,
          troubleshoot: [
            { problem: md`Godot says the project was made for a newer version and offers to convert it, or refuses to open it.`, fix: md`Your Godot is older than 4.4. Download a current 4.x standard build. Do not convert the project with an older editor.` },
            { problem: md`A dialog asks for the .NET SDK, or menus mention C#.`, fix: md`You downloaded the .NET build. Use the standard build; GDScript works in both, but the course never needs C#.` },
            { problem: md`You cannot find \`project.godot\` in the file dialog.`, fix: md`It is in \`godot-guide/godot/starter/\`, next to the \`assets\` folder. Some file dialogs hide files without a common extension; type the path directly.` },
          ],
        },
        {
          kind: 'text',
          md: md`### A tour of the editor

- **Scene dock** (top left): the node tree of the scene you are editing. Add children with the **+** button (*Add Child Node*, Ctrl+A), drag to reparent, right-click for more. While the game runs, a **Remote** tab appears here and shows the live tree of the running game.
- **FileSystem dock** (bottom left): everything in \`res://\`. Drag files from here onto properties in the Inspector, or into the 2D view to create a node that uses them.
- **Inspector** (right): every property of the selected node or resource. Changed values get a circular-arrow **revert** icon. Properties are grouped by the class that defines them, so a \`Sprite2D\`'s texture is under *Sprite2D* and its position is under *Node2D → Transform*.
- **Node dock** (a tab next to the Inspector): the selected node's **Signals** (events it can send, connected in module g03) and **Groups** (tags).
- **Main screen** (centre): the **2D** view where you place things, the **Script** editor, and the 3D view the course does not use. Switch with the buttons at the top centre.
- **Bottom panel**: **Output** (everything \`print\` writes, plus errors), **Debugger** (errors with stack traces, breakpoints, a performance monitor), and editors such as **Animation** and **SpriteFrames** that open when needed.
- **Run buttons** (top right): **F5** runs the project from its *main scene*; **F6** runs the scene you are editing; **F8** stops. (macOS uses different shortcuts; hover over the buttons to see them.)

F6 is the one you will use most: build a coin, press F6, and test only the coin.`,
        },
        {
          kind: 'check',
          q: md`You select a \`Sprite2D\` and want to change the image it shows and then make the sprite react when the player touches it. Which two docks do you use?`,
          options: [md`The Inspector for the texture, and the Node dock's Signals tab for the reaction`, md`The FileSystem dock for both`, md`The Scene dock for the texture, the Output panel for the reaction`, md`The Script editor for both; docks are only for viewing`],
          answer: 0,
          explain: md`Properties such as *Texture* are edited in the Inspector (or by dragging a file from FileSystem onto them). Events a node can send are signals, listed in the Node dock. A \`Sprite2D\` itself has no "touched" signal; that comes from an \`Area2D\`, which module g03 uses for a coin.`,
        },
        {
          kind: 'steps',
          title: 'See the problem first: a sprite at default settings',
          steps: [
            md`**Scene → New Scene**, click **2D Scene**. A \`Node2D\` called *Node2D* is created; rename it \`Sandbox\` (double-click the name).`,
            md`In FileSystem, find Kai's sprite sheet under \`assets/\` (the \`hero\` asset in the next lesson's asset panel; any character sheet works) and drag it into the 2D view. Godot creates a \`Sprite2D\` with that texture.`,
            md`In the Inspector, open the *Animation* section of *Sprite2D* and set **Hframes** and **Vframes** to the sheet's number of columns and rows, so only one 32×32 frame shows.`,
            md`Save the scene as \`scenes/sandbox.tscn\` (Ctrl+S) and press **F6**.`,
          ],
          result: md`A window of 1152×648 (Godot's default) opens with a tiny Kai, 32 screen pixels tall, possibly soft at the edges. Resize the window: the drawing area grows and Kai stays tiny. This is a game designed for a high resolution; the next steps turn it into a 320×180 game.`,
        },
        {
          kind: 'text',
          md: md`### Four settings for pixel art

1. **Viewport size 320×180.** The game's world is 320×180 pixels. A 16×16 tile is then 1/20 of the screen width, the same proportion as on a GBA.
2. **Window size override 1280×720.** The window opens at a size you can see (4× the viewport). Without it the window would be 320×180, tiny on a modern monitor.
3. **Stretch mode \`viewport\`.** Godot draws the game into a 320×180 image and then scales that image to the window. Everything, including movement, snaps to the 320×180 pixel grid. The other mode, \`canvas_items\`, draws at the window's resolution: smoother motion and sharper text, but a sprite at x = 10.5 lands between game pixels and rotated sprites show pixels of mixed sizes.
4. **Scale mode \`integer\`.** The 320×180 image is enlarged by a whole number (×3, ×4, ×6) and the rest of the window is filled with black bars. With \`fractional\`, the image fills as much of the window as possible, so the factor can be 4.27, and some game pixels become 4 screen pixels wide while their neighbours become 5.

Plus the texture filter: **Nearest** copies the nearest texel for each screen pixel (hard edges); **Linear** blends neighbouring texels (soft edges, right for photos and wrong for pixel art).

The figure simulates exactly this: it draws the game at 320×180, then scales it to a window of the size you pick.`,
        },
        {
          kind: 'viz',
          viz: { type: 'godot.pixelscale', mode: 'fractional', winW: 1366, winH: 768 },
          task: md`With **fractional** and the 1366×768 window, watch the orange cells in the strip under the loupe as Kai walks: game columns alternate between 4 and 5 screen pixels, and the one-pixel stripes on the path look uneven. Switch to **integer**: every column becomes 4 pixels and black bars appear. Then set the filter to **Linear** to see what the wrong filter does. Finally pick 1280×800 (Steam Deck) and read off the bars.`,
          caption: md`The loupe shows real screen pixels, magnified 4× so you can count them. With nearest filtering and a fractional scale $s$, a game pixel covers either $\lfloor s \rfloor$ or $\lceil s \rceil$ screen pixels, depending on where it lands; as a sprite moves, its pixels change width, which reads as shimmering.`,
        },
        {
          kind: 'derive',
          title: 'Integer scale and black bars',
          goal: md`For a window of $W \times H$ screen pixels and a $320 \times 180$ game, find the integer scale $s$ and the size of the black bars.`,
          steps: [
            { md: md`To fit horizontally, $320\,s \le W$, so $s \le W/320$. To fit vertically, $s \le H/180$. Both must hold: $s \le \min(W/320,\ H/180)$.` },
            {
              md: md`With integer scaling $s$ must also be a whole number, and we want the largest one: $$s = \left\lfloor \min\!\left(\frac{W}{320}, \frac{H}{180}\right) \right\rfloor, \quad s \ge 1.$$`,
              choose: {
                prompt: md`Why take the floor of the minimum and not round it?`,
                options: [md`Rounding up would make the image larger than the window and cut off part of the game`, md`Rounding is slower than floor`, md`Godot only supports even scales`],
                answer: 0,
                explain: md`For a 1366×768 window, $\min = 4.27$. Rounding gives 4 here, but at 1500×850 the minimum is 4.69 and rounding would give 5: an image of 1600×900 that does not fit.`,
              },
            },
            { md: md`The game image is $320s \times 180s$ and is centred, so each side bar is $(W - 320s)/2$ wide and each top/bottom bar is $(H - 180s)/2$ tall.` },
            { md: md`Example, Steam Deck 1280×800: $\min(4, 4.44) = 4$, image 1280×720, side bars 0, top and bottom bars $(800-720)/2 = 40$ px.` },
          ],
          takeaway: md`320×180 divides evenly into 1280×720 (×4), 1920×1080 (×6) and 2560×1440 (×8), which is why the course uses it. Other sizes get a few black bars, which players accept far more easily than blurry or uneven pixels.`,
        },
        {
          kind: 'numeric',
          q: md`A laptop runs the game fullscreen at 1366×768 with integer scaling. Enter the scale, the width of each side bar and the height of each top/bottom bar, in that order.`,
          answer: { kind: 'vector', value: [4, 43, 24] },
          inputHint: 'e.g. 4, 43, 24',
          explain: md`$\min(1366/320,\ 768/180) = \min(4.27, 4.27) = 4.27$, floor 4. Image 1280×720. Side bars $(1366-1280)/2 = 43$; top/bottom $(768-720)/2 = 24$.`,
        },
        {
          kind: 'steps',
          title: 'Set the display settings',
          steps: [
            md`Open **Project → Project Settings**, tab **General**. Switch on **Advanced Settings** (top right of the dialog); some settings below are hidden otherwise.`,
            md`**Display → Window**: under *Size* set **Viewport Width** 320, **Viewport Height** 180, **Window Width Override** 1280, **Window Height Override** 720.`,
            md`Still under **Display → Window**, in *Stretch*: **Mode** \`viewport\`, **Aspect** \`keep\`, **Scale Mode** \`integer\`.`,
            md`**Rendering → Textures**: under *Canvas Textures* set **Default Texture Filter** to \`Nearest\`.`,
            md`**Physics → Common**: check that **Physics Ticks per Second** is 60 (the default). Lesson 3 explains why it matters.`,
            md`Close the dialog (settings save immediately) and press **F6** on the sandbox scene again. Then resize the window slowly.`,
          ],
          result: md`The window opens at 1280×720 and Kai is now 128 screen pixels tall with hard square pixels. While you resize, the picture jumps between whole sizes (×2, ×3, ×4…) and black bars fill the rest; it never blurs.`,
          troubleshoot: [
            { problem: md`There is no *Window Width Override* or *Scale Mode*.`, fix: md`Turn on **Advanced Settings** in the top-right corner of Project Settings. You can also type the name into the dialog's *Filter Settings* box.` },
            { problem: md`Kai is large but blurry.`, fix: md`The default filter is still Linear, or this sprite overrides it. Check **Rendering → Textures → Canvas Textures → Default Texture Filter**, and on the sprite set *CanvasItem → Texture → Filter* to *Inherit*.` },
            { problem: md`Kai is large but fills the window with no bars, and pixels look uneven.`, fix: md`Scale Mode is \`fractional\`. Set it to \`integer\`.` },
          ],
        },
        {
          kind: 'code',
          file: 'project.godot',
          lang: 'cfg',
          code: PROJECT_DISPLAY,
          note: md`Project settings are stored as text in \`project.godot\`. Only values that differ from Godot's defaults are written, which is why *Physics Ticks per Second = 60* does not appear: 60 is the default. The texture filter is stored as a number (0 = Nearest).`,
        },
        {
          kind: 'callout',
          tone: 'design',
          title: 'What `viewport` mode costs you',
          md: md`Drawing everything at 320×180 keeps Shardbound honest to its style, but it has two costs. First, a camera that follows Kai moves in whole game pixels, so slow camera motion steps visibly; module c04 deals with that. Second, text drawn at 320×180 must use a pixel font designed for that size (the starter project has one); a normal font at 8 px is unreadable. Games that want smooth sub-pixel motion with pixel-art sprites use \`canvas_items\` with integer scaling and accept the occasional mixed-size pixel. Choose once, early, because animations, cameras and UI are tuned for it.`,
        },
        {
          kind: 'check',
          q: md`A player complains that the outline of Kai's sword "wobbles" between thin and thick when he walks, on a 1600×1000 monitor. Integer scaling is on. What is the most likely cause?`,
          options: [
            md`The default texture filter is Linear`,
            md`Stretch mode is \`canvas_items\` and the sprite moves at fractional positions, so it lands between game pixels`,
            md`The physics tick rate is too low`,
            md`The window is too large for integer scaling`,
          ],
          answer: 1,
          explain: md`At 1600×1000, $\min(5, 5.56) = 5$, a whole number, so scaling itself is even. With \`canvas_items\`, sprites are drawn at window resolution, and a sprite at x = 10.4 game pixels starts 52 screen pixels in; its edges no longer align with the 5-pixel grid, and lines change thickness as the position changes. \`viewport\` mode, or snapping positions to whole pixels, avoids it. A Linear filter would blur, not wobble.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'g01-1-paper',
            title: 'Ultrawide',
            type: 'compute',
            difficulty: 1,
            minutes: 4,
            statement: md`A player has a 3440×1440 ultrawide monitor. With integer scaling of a 320×180 game, what is the scale and how wide is each side bar? Enter $[s, \text{bar}]$.`,
            hints: [md`Compute both ratios; the smaller one limits the scale.`],
            solution: [md`$3440/320 = 10.75$ and $1440/180 = 8$, so $s = \lfloor 8 \rfloor = 8$.`, md`The image is $2560 \times 1440$, so each side bar is $(3440 - 2560)/2 = 440$ px.`, md`The height fits exactly; the width has 880 px of black. Some games fill such bars with a frame or blurred artwork; that is a later polish task.`],
            answer: { kind: 'vector', value: [8, 440] },
          },
        },
        {
          kind: 'recall',
          prompt: md`List the four project settings that make a 320×180 pixel-art game look crisp, with the value of each.`,
          answer: md`Viewport 320×180 (with a window override such as 1280×720); stretch mode \`viewport\`; scale mode \`integer\`; default texture filter \`Nearest\`.`,
        },
        {
          kind: 'explain',
          prompt: md`Explain to a teammate why fractional scaling makes pixel art shimmer, using the numbers for a 1366×768 window.`,
          model: md`At 1366×768 the largest factor that fits is about 4.27. A screen pixel can only show one game pixel, so with nearest filtering each game column gets either 4 or 5 screen columns, in a repeating pattern. When a sprite moves one game pixel to the right, each of its columns lands on a different part of that pattern, so a column that was 4 wide becomes 5 wide and the neighbour does the opposite. Lines change thickness frame to frame, which the eye reads as shimmering. With integer scaling at 4, every game pixel is exactly 4×4 and nothing changes as sprites move.`,
        },
      ],
      cards: [
        { id: 'g01-1-c1', kind: 'concept', front: md`What do the Scene, FileSystem, Inspector and Node docks each show?`, back: md`Scene: the node tree of the open scene (and the Remote tree while running). FileSystem: files under \`res://\`. Inspector: properties of the selected node or resource. Node: its signals and groups.` },
        { id: 'g01-1-c2', kind: 'cloze', text: md`F5 runs the project's main scene; {{}} runs the scene you are editing.`, answers: ['F6'] },
        { id: 'g01-1-c3', kind: 'compute', front: md`Integer scale for a 320×180 game in a 1920×1200 window?`, answer: { kind: 'number', value: 6 }, back: md`$\min(6, 6.67) = 6$, so ×6: a 1920×1080 image with 60 px bars top and bottom.` },
        { id: 'g01-1-c4', kind: 'concept', front: md`Stretch mode \`viewport\` versus \`canvas_items\` for pixel art?`, back: md`\`viewport\` renders at 320×180 and scales the image: everything snaps to game pixels. \`canvas_items\` renders at window resolution: smoother motion and text, but sprites at fractional positions or rotated show mixed pixel sizes.` },
        { id: 'g01-1-c5', kind: 'cloze', text: md`For pixel art the default texture filter is {{}}, which copies the nearest texel instead of blending.`, answers: ['Nearest'] },
      ],
    },
    {
      id: 'g01-2',
      title: 'Input actions and physics layers',
      minutes: 35,
      objectives: [
        'Explain why game code reads named input actions instead of keys.',
        'Create the twelve course actions with keyboard and gamepad bindings in the Input Map.',
        'Name the eight 2D physics layers and compute the integer value of a set of layers: $\\sum 2^{n-1}$.',
        'Predict whether two objects collide or detect each other from their layers and masks.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Shardbound will be played with a keyboard, an Xbox pad, a PlayStation pad and a Steam Deck. If the player code says "if J is pressed, attack", every one of those needs its own line, and remapping is impossible. Godot's answer is the **input action**: a name such as \`attack\` that any number of keys, buttons and stick directions can trigger. Code asks about \`attack\`; the **Input Map** decides what \`attack\` means.

The second piece of project setup is **physics layers**. Kai should stop at walls but walk through coins; his sword should hurt slimes but not Lyra; a coin should notice Kai but not a slime. Godot sorts every physics object onto numbered layers, and each object lists which layers it cares about. Naming those layers once, here, makes every later collision setting readable.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'Input actions',
          md: md`An action has a name, a list of input events (keys, mouse buttons, joypad buttons, joypad axis directions) and a **deadzone**: how far an analog stick must move before the action counts as pressed. In code:

- \`Input.is_action_pressed("guard")\`: held down right now. For things that last while held.
- \`Input.is_action_just_pressed("attack")\`: went down this frame. For one-off things, so holding the button does not attack 60 times a second.
- \`Input.get_vector("move_left", "move_right", "move_up", "move_down")\`: a \`Vector2\` from four actions, with length at most 1, using analog values from a stick.
- \`Input.get_axis("move_left", "move_right")\`: one axis from $-1$ to $1$.

Actions are saved in \`project.godot\`. Godot also ships built-in \`ui_*\` actions (\`ui_accept\`, \`ui_cancel\`, \`ui_up\`…) that menus use; leave them alone.`,
        },
        {
          kind: 'text',
          md: md`### The course's actions

| action | keyboard | gamepad (Xbox names) | used for |
|---|---|---|---|
| \`move_left\` \`move_right\` \`move_up\` \`move_down\` | A D W S and the arrow keys | left stick, d-pad | walking, menus in battle |
| \`attack\` | J | X (left face button) | basic attack strings |
| \`dodge\` | K, Shift | B (right face button) | dodge with invincibility frames |
| \`jump\` | Space | A (bottom face button) | jumping between heights |
| \`guard\` | I | RB (right shoulder) | Bram's guard, everyone's block |
| \`tactical\` | L, Tab | Y (top face button) | open tactical mode (slows time) |
| \`switch_character\` | Q | LB (left shoulder) | change who you control |
| \`interact\` | F, Enter | Y | talk, open chests |
| \`pause\` | Escape | Start (Menu) | pause menu |

\`interact\` and \`tactical\` share Y on the pad: you never talk to an NPC in the middle of a fight, so the context decides which one the game listens for. Everything else has its own button, and the keyboard layout keeps the right hand on J K L I and the left on WASD, Q, F and Space.`,
        },
        {
          kind: 'steps',
          title: 'Create the actions',
          steps: [
            md`Open **Project → Project Settings** and the **Input Map** tab.`,
            md`Type \`move_left\` into the **Add New Action** field and press **Add**. Repeat for the other eleven names in the table, spelled exactly as shown (lower case, underscores).`,
            md`Click the **+** next to \`move_left\`. In the dialog press the **A** key, choose **Physical Keycode** (the key's position on a US layout, so players with AZERTY or Dvorak keyboards get the same hand position), and click OK. Add the left arrow the same way.`,
            md`Click **+** again and pick **Joypad Axes → Left Stick Left**, then **+** once more for **Joypad Buttons → D-pad Left**. Do the same for the other three directions.`,
            md`Bind the remaining actions as in the table. Gamepad buttons are under **Joypad Buttons** (Bottom Action / A, Right Action / B, Left Action / X, Top Action / Y, Left Shoulder, Right Shoulder, Start).`,
            md`Set the **Deadzone** of the four move actions to 0.2, so a light stick tilt counts. Leave the others at the default.`,
            md`Attach the input probe below to the root of your sandbox scene, press **F6**, and press every key and button.`,
          ],
          result: md`The Output panel prints \`pressed: attack\` and so on for each action, and \`move: (0.71, -0.71)  length: 1.0\` while you hold up-right. A gamepad gives values in between, like \`(0.4, 0.0)\`.`,
          troubleshoot: [
            { problem: md`The keyboard works but the gamepad does nothing.`, fix: md`Check the device in each event: it should be *All Devices*. Connect the pad before starting the game, and check that the operating system sees it (Steam's controller settings can intercept a pad; close Steam to test).` },
            { problem: md`The output prints \`pressed:\` for nothing, and errors mention an unknown action.`, fix: md`A name in the script does not match the Input Map. Names are case sensitive: \`switch_character\`, not \`switch\`.` },
            { problem: md`Diagonal movement prints a length of 1.41.`, fix: md`You are building the vector yourself from two \`get_axis\` calls. \`get_vector\` limits the length to 1.` },
          ],
        },
        { kind: 'code', file: 'scripts/debug/input_probe.gd', code: INPUT_PROBE, note: md`\`&"attack"\` is a \`StringName\`, a string Godot stores once and compares by identity; input functions take them, and plain strings are converted automatically. \`Engine.get_process_frames() % 15 == 0\` limits the movement print to every 15th frame, four times a second at 60 fps.` },
        {
          kind: 'check',
          q: md`The attack should start once per button press. Which test belongs in the player's per-frame code?`,
          options: [md`\`Input.is_action_just_pressed("attack")\``, md`\`Input.is_action_pressed("attack")\``, md`\`Input.get_axis("attack", "attack")\``, md`\`Input.is_key_pressed(KEY_J)\``],
          answer: 0,
          explain: md`\`is_action_just_pressed\` is true on exactly one frame per press. \`is_action_pressed\` stays true while held, starting an attack every frame. \`is_key_pressed(KEY_J)\` works but ignores the Input Map, so the gamepad and remapping no longer apply.`,
        },
        {
          kind: 'text',
          md: md`### Layers and masks

Every physics object (\`CharacterBody2D\`, \`StaticBody2D\`, \`Area2D\`, tile collisions) has two sets of 32 checkboxes:

- **collision_layer**: the layers this object **is on**. "I am a wall." "I am an enemy."
- **collision_mask**: the layers this object **looks for**. A moving body is stopped only by objects on layers in its mask. An area reports only bodies and areas on layers in its mask.

Godot stores each set as one integer whose bits are the checkboxes: layer $n$ is bit $n-1$, worth $2^{n-1}$. Layers 1 and 4 together are $1 + 8 = 9$.

The course names the first eight layers:

1. \`world\`: walls, tile collisions, solid props
2. \`player\`: the body of the character you control
3. \`party\`: the bodies of the other two party members
4. \`enemy\`: enemy bodies and enemy hurtboxes
5. \`player_hitbox\`: the party's attack areas
6. \`enemy_hitbox\`: enemies' attack areas
7. \`interactable\`: NPCs, chests, signs
8. \`pickup\`: coins, items on the ground

Hitboxes get layers of their own so that Kai's sword can look for enemies without also hitting Lyra, and so a slime's attack can look for the party without hitting other slimes.`,
        },
        {
          kind: 'steps',
          title: 'Name the physics layers',
          steps: [
            md`In **Project → Project Settings → General**, open **Layer Names → 2D Physics**.`,
            md`Type the eight names above into *Layer 1* to *Layer 8*.`,
            md`Check it: select any \`CollisionObject2D\` (for example add a temporary \`Area2D\` to the sandbox), open *Collision* in the Inspector and hover over the layer grid. Each square now shows its name; the **⋮** menu next to the grid lists the names to tick.`,
          ],
          result: md`Collision grids in the Inspector show \`world\`, \`player\` and the rest on hover, and \`project.godot\` gains a \`[layer_names]\` section.`,
        },
        {
          kind: 'viz',
          viz: { type: 'godot.layers', a: 0, b: 3 },
          task: md`A is Kai's body, B is a coin. Read why B → A is "yes" and A → B is "no". Then set A to **Kai's sword Hitbox** and B to **Slime Hurtbox** and find which bit makes the hit register. Finally, put Kai's body on layer 4 by mistake and see what the coin and a slime would do.`,
          caption: md`"A → B" asks whether A's mask contains a layer B is on. Bodies are blocked only by bodies; only areas report overlaps. The *value* column is the integer stored in the scene file.`,
        },
        {
          kind: 'derive',
          title: 'Reading and writing mask bits',
          goal: md`Show how to compute the integer for a set of layers, and how to test one layer in code.`,
          steps: [
            { md: md`Layer $n$ is bit $n - 1$, so its value is $2^{n-1}$: layer 1 is 1, layer 2 is 2, layer 4 is 8, layer 8 is 128.` },
            {
              md: md`A set of layers is the sum (or bitwise OR) of their values: \`world\`, \`enemy\`, \`interactable\` is $1 + 8 + 64 = 73$, binary \`01001001\`.`,
              choose: {
                prompt: md`Why is a sum the same as a bitwise OR here?`,
                options: [md`Each layer has a different single bit, so no two values overlap and no carries happen`, md`Godot defines + on masks as OR`, md`It is only the same for layers below 8`],
                answer: 0,
                explain: md`Distinct powers of two share no bits, so adding them sets exactly those bits. Adding the same layer twice would carry into the next bit, which is why code uses \`|\` or the helper functions.`,
              },
            },
            { md: md`To test layer $n$ in a mask $m$: \`m & (1 << (n - 1)) != 0\`. Godot wraps this as \`get_collision_mask_value(n)\` and \`set_collision_mask_value(n, true)\`, with layer numbers starting at 1 as in the Inspector.` },
          ],
          takeaway: md`Prefer the Inspector and the \`*_value(n, …)\` helpers. You need the integers when reading \`.tscn\` files, writing \`@export_flags_2d_physics\` defaults, or debugging a value printed as \`73\`.`,
        },
        {
          kind: 'numeric',
          q: md`A slime's hurtbox should be on the \`enemy\` layer and look for \`player_hitbox\`. What are its \`collision_layer\` and \`collision_mask\` integers? Enter both, layer first.`,
          answer: { kind: 'vector', value: [8, 16] },
          inputHint: 'layer, mask',
          explain: md`\`enemy\` is layer 4: $2^3 = 8$. \`player_hitbox\` is layer 5: $2^4 = 16$.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'g01-2-build',
            title: 'Configure the project',
            goal: md`Finish the project configuration the rest of the course depends on, and prove it works with the input probe.`,
            requirements: [
              md`All twelve actions exist with the exact names, each with a keyboard binding; the move actions also have stick and d-pad bindings.`,
              md`The probe prints every action when pressed, from the keyboard and from a gamepad if you have one.`,
              md`Holding two arrow keys prints a movement vector of length 1.0, not 1.41.`,
              md`Collision grids in the Inspector show the eight layer names on hover.`,
              md`\`project.godot\` (open it in any text editor) contains \`[input]\` and \`[layer_names]\` sections and the display settings from lesson 1.`,
            ],
            hints: [
              md`If one action never prints, compare its spelling in the Input Map and in \`ACTIONS\`.`,
              md`Godot rewrites \`project.godot\` when you close Project Settings; reopen the file in your text editor after that.`,
            ],
            solution: [
              { file: 'scripts/debug/input_probe.gd', code: INPUT_PROBE },
              { file: 'project.godot (excerpt)', code: LAYER_NAMES_CFG, lang: 'cfg' },
            ],
            explain: md`Nothing in this build is gameplay yet, and that is deliberate: names typed here are typed again in every later module, so a typo found now saves an afternoon of "why does Kai not attack" later.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'g01-2-paper',
            title: 'A breakable pot',
            type: 'compute',
            difficulty: 2,
            minutes: 6,
            statement: md`A pot blocks movement like a wall and breaks when Kai's sword hits it. It is a \`StaticBody2D\` (for blocking) with a child \`Area2D\` hurtbox (for the hit). Using the course's layers, give the static body's \`collision_layer\` integer and the hurtbox's \`collision_mask\` integer. Enter both.`,
            hints: [md`What must Kai's body find in its mask to be blocked? What must the hurtbox look for?`],
            solution: [
              md`Kai's body has \`world\` (layer 1) in its mask, so a blocking object goes on layer 1: \`collision_layer = 1\`.`,
              md`The hurtbox looks for the party's attacks, \`player_hitbox\` (layer 5): \`collision_mask = 16\`.`,
              md`The hurtbox's own layer can stay empty (0): nothing needs to find it. Leaving enemy hitboxes out of its mask means slimes cannot break pots, which is a design choice you could change.`,
            ],
            answer: { kind: 'vector', value: [1, 16] },
          },
        },
        {
          kind: 'recall',
          prompt: md`What is the difference between a collision layer and a collision mask, in one sentence each?`,
          answer: md`The layer is what the object is ("I am on world"); the mask is what the object looks for ("I stop at, or report, things on these layers").`,
        },
      ],
      cards: [
        { id: 'g01-2-c1', kind: 'concept', front: md`Why read \`attack\` instead of the J key?`, back: md`The Input Map can bind any number of keys, buttons and stick directions to one action, players can remap it, and code stays the same for keyboard and gamepad.` },
        { id: 'g01-2-c2', kind: 'cloze', text: md`\`Input.is_action_{{}}("attack")\` is true on exactly one frame per press.`, answers: ['just_pressed'] },
        { id: 'g01-2-c3', kind: 'compute', front: md`Mask integer for layers \`player\` (2) and \`party\` (3)?`, answer: { kind: 'number', value: 6 }, back: md`$2^1 + 2^2 = 2 + 4 = 6$.` },
        { id: 'g01-2-c4', kind: 'concept', front: md`Name the course's 2D physics layers 1 to 8.`, back: md`world, player, party, enemy, player_hitbox, enemy_hitbox, interactable, pickup.` },
        { id: 'g01-2-c5', kind: 'concept', front: md`Does a \`CharacterBody2D\` stop when it walks into an \`Area2D\` on a layer in its mask?`, back: md`No. Bodies collide only with bodies; areas never block. The area can report the body if the body's layer is in the area's mask.` },
      ],
    },
    {
      id: 'g01-3',
      title: 'The first scene: a sprite that moves at the same speed everywhere',
      minutes: 40,
      objectives: [
        'Build a scene from a `Node2D` and a `Sprite2D` and save it as a `.tscn`.',
        'Attach a script and move a node in `_process(delta)`.',
        'Explain why movement is multiplied by `delta`, and compute distance per frame: $\\Delta x = v\\,\\Delta t$.',
        'Choose between `_process` and `_physics_process`.',
        'Set the main scene and run the game with F5.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`On your laptop Kai crosses the screen in 4 seconds. On a friend's 144 Hz monitor he crosses it in 1.7 seconds, and on a Steam Deck that drops to 40 fps in a busy room he crawls. Nothing in the code changed; only the number of frames per second did. This is the first bug every game programmer writes, and the fix is one multiplication.

This lesson builds the first real scene of the course, a sprite with a script, and uses it to understand frames, \`delta\` and the two update callbacks Godot gives every node.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'Node2D, Sprite2D and position',
          md: md`\`Node2D\` is the base of everything placed in a 2D world: it has a \`position\` (a \`Vector2\` in pixels, relative to its parent), a \`rotation\` and a \`scale\`. **In 2D, y grows downward**: (0, 0) is the top-left corner of the screen, (320, 180) the bottom-right. \`Sprite2D\` is a \`Node2D\` that draws a texture centred on its position; *Hframes*, *Vframes* and *Frame* pick one cell of a sprite sheet.`,
        },
        { kind: 'assets', ids: ['hero', 'tiles_overworld'], note: md`Kai's sheet uses 32×32 frames. The side-facing frames face right; flip them for left. Use the file path shown in the panel when the steps say "Kai's sheet".` },
        {
          kind: 'steps',
          title: 'Build the first scene',
          steps: [
            md`**Scene → New Scene → 2D Scene**. Rename the root \`FirstScene\`.`,
            md`With the root selected, press **Ctrl+A** (*Add Child Node*), search \`Sprite2D\`, and create it. Rename it \`Kai\`.`,
            md`Drag Kai's sheet from FileSystem onto the Inspector's **Texture** property. Under *Animation* set **Hframes** and **Vframes** to the sheet's columns and rows, and **Frame** to a side-facing frame.`,
            md`Set *Node2D → Transform → Position* to (40, 90): 40 px from the left, halfway down the 180-px screen.`,
            md`Save as \`scenes/first_scene.tscn\` and press **F6**.`,
          ],
          result: md`A 1280×720 window with Kai standing on the left, crisp and four screen pixels per game pixel. Close it with F8 or the window's close button.`,
          troubleshoot: [
            { problem: md`The whole sprite sheet is drawn.`, fix: md`Hframes and Vframes are still 1. Set them to the sheet's grid size.` },
            { problem: md`Kai is cut off at the top-left corner of the screen.`, fix: md`The position is still (0, 0) and \`Sprite2D\` draws centred on its position. Set the position, or check that you changed the \`Kai\` node and not the root.` },
          ],
        },
        {
          kind: 'text',
          md: md`### A script, and the frame loop

A game is a loop. Every frame Godot reads input, runs scripts, steps physics and draws the screen. A node's script hooks into that loop by defining **virtual methods** with special names; Godot calls them for you:

- \`_ready()\` once, when the node and its children have entered the scene.
- \`_process(delta)\` once per drawn frame.
- \`_physics_process(delta)\` once per physics tick, 60 times per second by default.

\`delta\` is a \`float\`: the time in seconds since the previous call. At 60 fps it is about 0.0167; at 144 fps about 0.0069; on a frame that stutters it might be 0.05.

To move at a speed $v$ in pixels per second, each frame must move $v \times$ the time that frame represents: \`position.x += speed * delta\`. Without \`delta\`, a step of 1 px per frame is 60 px/s at 60 fps and 144 px/s at 144 fps.`,
        },
        { kind: 'code', file: 'scripts/drifter.gd', code: DRIFTER_V1, note: md`\`extends Node2D\` works on the \`Sprite2D\` because a \`Sprite2D\` *is* a \`Node2D\`; a script can extend the node's class or any class it inherits from. \`@export\` shows \`speed\` in the Inspector, and the \`##\` comment above it becomes the tooltip.` },
        {
          kind: 'steps',
          title: 'Attach the script',
          steps: [
            md`Select \`Kai\` and click the **Attach Script** button (the scroll with a green +) at the top of the Scene dock.`,
            md`Set **Inherits** to \`Node2D\`, **Path** to \`res://scripts/drifter.gd\`, and click **Create**. The Script editor opens.`,
            md`Replace the template with the listing above and save (Ctrl+S). Back in the 2D view, the Inspector shows a **Speed** field under *drifter.gd*.`,
            md`Press **F6**. Then change **Speed** to 120 in the Inspector and run again.`,
          ],
          result: md`Kai slides to the right at 40 px/s (8 seconds to cross 320 px), leaves the screen and reappears on the left. At speed 120 he crosses in under 3 seconds.`,
          troubleshoot: [
            { problem: md`Error: "Script inherits from native type 'Node2D', so it can't be assigned to an object of type…"`, fix: md`You attached it to the root \`Node2D\` while the script says \`extends Sprite2D\`, or the other way round. A script's \`extends\` must be the node's class or one of its ancestors.` },
            { problem: md`Kai does not move and the Output panel shows a parse error.`, fix: md`Indentation is tabs in Godot. If you pasted code indented with spaces, use **Edit → Indentation → Convert Indent to Tabs** in the Script editor.` },
          ],
        },
        {
          kind: 'viz',
          viz: { type: 'godot.timestep', fps: 60 },
          task: md`At 60 fps all three sprites move at the same speed. Drag the frame rate to 144, then to 20, and read $v_1, v_2, v_3$. Then turn on **slow motion** at 20 fps and compare how far each sprite jumps per frame. Finally add **jitter** and watch the bottom strip: frames come at uneven times, physics ticks stay evenly spaced.`,
          caption: md`Lane 1 adds a fixed amount per frame, so its speed is proportional to the frame rate. Lane 2 multiplies by \`delta\`: the right speed at any frame rate, in bigger or smaller steps. Lane 3 runs in \`_physics_process\`, which Godot calls on a fixed 60 Hz clock: at 20 fps it runs three ticks per frame, at 144 fps most frames have no tick and the sprite does not move on them.`,
        },
        {
          kind: 'derive',
          title: 'Speed, frame rate and delta',
          goal: md`Show that \`position.x += speed * delta\` gives the same speed at any frame rate, and that a fixed step per frame does not.`,
          steps: [
            { md: md`At $f$ frames per second, each frame lasts $\Delta t = 1/f$ seconds, so one second contains $f$ frames.` },
            {
              md: md`With a fixed step of $k$ pixels per frame, one second moves $k \cdot f$ pixels: the speed is $kf$, and it changes with $f$.`,
              choose: {
                prompt: md`A step of 2 px per frame was tuned at 60 fps (120 px/s). What is the speed at 144 fps?`,
                options: [md`288 px/s`, md`120 px/s`, md`50 px/s`],
                answer: 0,
                explain: md`$2 \times 144 = 288$ px/s, 2.4 times faster than intended.`,
              },
            },
            { md: md`With a step of $v\,\Delta t$, one second moves $f \cdot v \cdot \frac1f = v$ pixels: the frame rate cancels. The steps are smaller at high frame rates and larger at low ones, but the distance per second is $v$.` },
            { md: md`With uneven frames the same holds, because each step uses that frame's own $\Delta t$: the sum of the $\Delta t$ over a second is one second, so the total distance is $v$.` },
          ],
          takeaway: md`Anything that changes over time (position, a timer, an ATB gauge filling) is "rate × delta". A number added per frame without \`delta\` is a bug unless you really mean "per frame".`,
        },
        {
          kind: 'numeric',
          q: md`A script does \`position.x += 3\` in \`_process\`. How fast (px/s) does the node move at 144 fps, and at 30 fps? Enter both.`,
          answer: { kind: 'vector', value: [432, 90] },
          explain: md`$3 \times 144 = 432$ px/s and $3 \times 30 = 90$ px/s: a factor of 4.8 between two players' machines.`,
        },
        {
          kind: 'text',
          md: md`### \`_process\` or \`_physics_process\`?

\`_process\` runs once per drawn frame, with a \`delta\` that varies. \`_physics_process\` runs on a fixed clock (*Physics Ticks per Second*, 60), with \`delta\` always $1/60$. When rendering is slow, Godot runs several physics ticks before drawing a frame (up to 8 by default); when rendering is fast, some frames have no tick at all.

Use \`_physics_process\` for anything that moves bodies, checks collisions or must behave the same on every machine: player and enemy movement, hitboxes, timing windows measured in frames. Fixed steps make physics stable (a fast object cannot skip through a wall because one frame was long) and make frame data exact: a 4-frame attack window is always 4 ticks, 66.7 ms.

Use \`_process\` for things that only affect what is drawn and should be as smooth as the display allows: UI animations, a blinking cursor, visual effects that do not interact.

At high refresh rates, \`_physics_process\` movement looks slightly steppy because objects move only on ticks. Godot 4.3+ can interpolate drawn positions between ticks (**Physics → Common → Physics Interpolation**); module c04 comes back to it with the camera.`,
        },
        {
          kind: 'check',
          q: md`Which callback should move Kai's \`CharacterBody2D\` with \`move_and_slide()\`, and why?`,
          options: [
            md`\`_physics_process\`, because collisions are resolved on the fixed physics clock and the result is the same at any frame rate`,
            md`\`_process\`, because it runs more often on fast monitors and so feels more responsive`,
            md`\`_ready\`, because it runs before anything else`,
            md`Either; \`delta\` makes them identical`,
          ],
          answer: 0,
          explain: md`\`delta\` fixes the *speed*, but collision checks, knockback and frame-counted timings also depend on the step size. Godot's physics expects bodies to move in \`_physics_process\`, and module c02 does exactly that.`,
        },
        { kind: 'code', file: 'scripts/drifter.gd', code: DRIFTER_V2, note: md`A first taste of control: \`get_vector\` reads the four move actions from lesson 2. This moves the sprite directly; module c02 replaces it with a \`CharacterBody2D\`, which stops at walls.` },
        {
          kind: 'build',
          ch: {
            id: 'g01-3-build',
            title: 'Kai on patrol, and the main scene',
            goal: md`Make Kai walk back and forth across the screen in \`_physics_process\`, facing the way he walks, and make this scene the one F5 starts.`,
            requirements: [
              md`Kai walks right to x = 280, turns around, walks left to x = 40, and repeats, at an exported speed.`,
              md`He faces the direction he walks (the side frame flipped for left).`,
              md`He never overshoots the turning points, even at a speed of 400.`,
              md`**F5** starts this scene: set it with **Project → Project Settings → Application → Run → Main Scene**, or right-click the scene in FileSystem and choose **Set as Main Scene**.`,
            ],
            hints: [
              md`Keep the direction in a member variable (\`+1.0\` or \`-1.0\`) so it survives from one call to the next; local variables are recreated every call.`,
              md`To avoid overshooting, clamp the position back to the turning point at the moment you flip the direction.`,
              md`\`flip_h\` is a \`Sprite2D\` property, so the script needs \`extends Sprite2D\` to use it without a prefix.`,
            ],
            solution: [{ file: 'scripts/patrol.gd', code: PATROL }],
            explain: md`The direction is *state*: it must persist between frames, so it lives in a member variable. Clamping on the turn prevents a large step from carrying Kai past the edge and flipping every frame (a step of 400 × 1/60 ≈ 6.7 px can jump over a narrow window). The flip follows the direction, not the position, so it is correct on the frame he turns.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'g01-3-paper',
            title: 'Ticks for a patrol',
            type: 'compute',
            difficulty: 1,
            minutes: 4,
            statement: md`Kai patrols from x = 40 to x = 280 at 40 px/s in \`_physics_process\` at 60 ticks per second. How many physics ticks does one crossing take, and how many pixels does he move per tick? Enter both.`,
            solution: [md`The distance is $280 - 40 = 240$ px, which takes $240/40 = 6$ s.`, md`At 60 ticks per second that is $6 \times 60 = 360$ ticks.`, md`Per tick he moves $40 \times \frac{1}{60} \approx 0.667$ px. In \`viewport\` mode he is drawn at whole pixels, so he visibly steps one pixel on two ticks out of three.`],
            answer: { kind: 'vector', value: [360, 40 / 60] },
          },
        },
        {
          kind: 'recall',
          prompt: md`What is \`delta\` in \`_process(delta)\` and in \`_physics_process(delta)\`, and what are typical values?`,
          answer: md`The time in seconds since the previous call. In \`_process\` it varies with the frame rate (about 0.0167 at 60 fps, 0.0069 at 144 fps, larger on a stutter). In \`_physics_process\` it is the fixed tick length, $1/60 \approx 0.0167$ s by default.`,
        },
        {
          kind: 'explain',
          prompt: md`A teammate says "we run physics at 60 Hz and \`_process\` usually runs at 60 fps too, so multiplying by delta is pointless". Explain why they are wrong.`,
          model: md`\`_process\` runs once per drawn frame, and the frame rate depends on the player's monitor and machine: 144 Hz monitors, a Steam Deck dropping to 40 fps, a stutter when a level loads. A fixed per-frame step makes the game speed proportional to the frame rate, so the game is 2.4 times faster on a 144 Hz monitor. Multiplying by delta turns "per frame" into "per second", which is what speeds, timers and gauges are designed in. Even in \`_physics_process\`, writing \`speed * delta\` keeps the numbers in per-second units and keeps working if the tick rate changes.`,
        },
      ],
      cards: [
        { id: 'g01-3-c1', kind: 'cloze', text: md`To move at \`speed\` pixels per second: \`position.x += speed * {{}}\`.`, answers: ['delta'] },
        { id: 'g01-3-c2', kind: 'compute', front: md`\`position.x += 2\` per frame at 144 fps: speed in px/s?`, answer: { kind: 'number', value: 288 }, back: md`$2 \times 144 = 288$ px/s.` },
        { id: 'g01-3-c3', kind: 'concept', front: md`When do you use \`_physics_process\` instead of \`_process\`?`, back: md`For movement, collisions and anything that must behave identically on every machine or be counted in frames. \`_process\` is for purely visual updates.` },
        { id: 'g01-3-c4', kind: 'concept', front: md`Which way does y grow in Godot 2D, and where is (0, 0) on screen?`, back: md`Downward. (0, 0) is the top-left corner; (320, 180) the bottom-right of the viewport.` },
        { id: 'g01-3-c5', kind: 'compute', front: md`How many milliseconds is one physics tick at 60 Hz?`, answer: { kind: 'number', value: 1000 / 60 }, back: md`$1000/60 \approx 16.67$ ms.` },
      ],
    },
  ],
  problems: [
    {
      id: 'g01-p1',
      title: 'A perfect fit',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`What integer scale does a 320×180 game get in a 1600×900 window, and how many pixels of black bar are there in total?`,
      solution: [md`$\min(1600/320, 900/180) = \min(5, 5) = 5$.`, md`The image is exactly 1600×900, so there are 0 pixels of bars. Enter $[5, 0]$.`],
      answer: { kind: 'vector', value: [5, 0] },
      areas: ['art'],
    },
    {
      id: 'g01-p2',
      title: 'Steam Deck',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`The Steam Deck's screen is 1280×800. With integer scaling, what is the scale, and how tall is each of the top and bottom bars?`,
      solution: [md`$\min(1280/320, 800/180) = \min(4, 4.44) = 4$.`, md`The image is 1280×720, leaving 80 px of height: 40 px at the top and 40 px at the bottom.`],
      answer: { kind: 'vector', value: [4, 40] },
      areas: ['art', 'ship'],
    },
    {
      id: 'g01-p3',
      title: 'Mask for an ally',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`An area should report the player, the party and enemies (layers 2, 3 and 4). What \`collision_mask\` integer does it need?`,
      solution: [md`Layer $n$ is worth $2^{n-1}$: $2 + 4 + 8$.`, md`The mask is 14 (binary \`00001110\`).`],
      answer: { kind: 'number', value: 14 },
      areas: ['godot'],
    },
    {
      id: 'g01-p4',
      title: 'Frames to milliseconds',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`An attack's hitbox is active for 4 physics ticks at 60 Hz, and the dodge's invincibility lasts 9 ticks. How long is each, in milliseconds?`,
      solution: [md`One tick is $1000/60 \approx 16.67$ ms.`, md`4 ticks: $66.7$ ms. 9 ticks: $150$ ms.`],
      answer: { kind: 'vector', value: [4000 / 60, 150] },
      areas: ['feel'],
    },
    {
      id: 'g01-p5',
      title: 'Fast on fast machines',
      type: 'debug',
      difficulty: 1,
      minutes: 5,
      statement: md`Playtesters on 120 Hz laptops say the bat is twice as fast as on everyone else's machine. Find the bug and fix it.

\`\`\`gdscript
extends Node2D

var angle := 0.0


func _process(_delta: float) -> void:
	angle += 0.05
	position = Vector2(160, 90) + Vector2(cos(angle), sin(angle)) * 40.0
\`\`\``,
      hints: [md`In what unit is \`angle\` increasing?`],
      solution: [md`\`angle\` grows by 0.05 radians per frame, so the bat circles at $0.05 \times 60 = 3$ rad/s at 60 fps and 6 rad/s at 120 fps.`, md`Make the rate per second and multiply by delta: \`@export var turn_speed := 3.0\` and \`angle += turn_speed * delta\` (rename \`_delta\` to \`delta\`). Since it moves something that may hit the player, put it in \`_physics_process\`.`],
      rubric: [md`Identifies the per-frame increment`, md`Computes the two angular speeds`, md`Fixes it with a per-second rate times delta`],
      areas: ['godot', 'feel'],
    },
    {
      id: 'g01-p6',
      title: 'Choosing a stretch mode',
      type: 'concept',
      difficulty: 2,
      minutes: 8,
      statement: md`Shardbound uses stretch mode \`viewport\` with integer scaling. Give one advantage and one cost of this choice compared with \`canvas_items\` and integer scaling, and name a kind of game for which \`canvas_items\` would be the better choice.`,
      solution: [
        md`Advantage: everything is drawn at 320×180, so every sprite, tile and effect lands on the same pixel grid. Nothing can be drawn at half a pixel, rotated sprites keep chunky pixels, and the look matches the art exactly.`,
        md`Cost: motion is quantised to game pixels, so slow movement and camera scrolling step visibly, and text must be a pixel font designed for the low resolution.`,
        md`\`canvas_items\` suits games that mix pixel-art sprites with smooth motion, high-resolution UI or large rotations and zooms, for example a fast shooter with smooth scrolling, or a game whose menus use a normal font.`,
      ],
      rubric: [md`Advantage tied to a single pixel grid`, md`Cost names quantised motion or text`, md`A reasonable example for \`canvas_items\``],
      areas: ['art'],
    },
    {
      id: 'g01-p7',
      title: 'A coin that ignores Kai',
      type: 'debug',
      difficulty: 1,
      minutes: 5,
      statement: md`A coin (\`Area2D\`) has \`collision_layer = 128\` and \`collision_mask = 1\`. Kai's body has \`collision_layer = 2\` and \`collision_mask = 1\`. The coin's \`body_entered\` never fires when Kai walks over it. What is wrong, and what should the coin's mask be?`,
      solution: [md`The coin's mask is 1 (\`world\`), so it reports only bodies on the world layer, such as walls. Kai is on layer 2 (\`player\`).`, md`Set the coin's mask to 2. Its layer (128, \`pickup\`) is fine: nothing needs to look for coins.`],
      answer: { kind: 'number', value: 2 },
      rubric: [md`Reads mask 1 as \`world\``, md`Sets the mask to the player layer, 2`],
      areas: ['godot'],
    },
    {
      id: 'g01-p8',
      title: 'An input layout',
      type: 'design',
      difficulty: 2,
      minutes: 10,
      statement: md`Shardbound needs to support a keyboard and a gamepad with four face buttons, two shoulder buttons, two triggers and Start. Propose a gamepad layout for the course's twelve actions, explain one deliberate shared binding, and explain why the keyboard bindings use physical keycodes.`,
      solution: [
        md`One reasonable layout: left stick and d-pad move; A jump; B dodge; X attack; Y tactical (and interact outside battle); RB guard; LB switch character; Start pause. The triggers stay free for later abilities or a quick-item menu.`,
        md`Sharing Y between \`tactical\` and \`interact\` works because they never apply at the same time: you do not talk to NPCs in battle, and tactical mode needs no target outside battle. The game listens for whichever fits the context.`,
        md`Physical keycodes bind a position on the keyboard instead of a letter, so WASD stays under the left hand on AZERTY (ZQSD) and Dvorak layouts without remapping.`,
      ],
      rubric: [md`Every action has a binding and the layout avoids accidental conflicts`, md`Justifies a shared binding by context`, md`Explains physical keycodes as layout-independent positions`],
      areas: ['godot', 'art'],
    },
    {
      id: 'g01-p9',
      title: 'Integer scale on paper',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 8,
      statement: md`Write a GDScript function \`integer_scale(window: Vector2i) -> int\` that returns the integer scale for a 320×180 game, never less than 1. Then write \`letterbox(window: Vector2i) -> Vector2i\` that returns the width of one side bar and the height of one top bar.`,
      solution: [
        md`\`\`\`gdscript
func integer_scale(window: Vector2i) -> int:
	var s := mini(window.x / 320, window.y / 180)
	return maxi(s, 1)


func letterbox(window: Vector2i) -> Vector2i:
	var s := integer_scale(window)
	return Vector2i((window.x - 320 * s) / 2, (window.y - 180 * s) / 2)
\`\`\``,
        md`Integer division of two ints truncates, which for positive numbers is the floor we want. \`mini\` and \`maxi\` are the integer versions of \`min\` and \`max\`. For windows smaller than 320×180 the bars come out negative, meaning the image is cropped.`,
      ],
      rubric: [md`Takes the minimum of the two ratios before flooring`, md`Clamps the scale to at least 1`, md`Bars are (window − scaled size) / 2 in each direction`],
      areas: ['godot', 'math'],
    },
  ],
};
