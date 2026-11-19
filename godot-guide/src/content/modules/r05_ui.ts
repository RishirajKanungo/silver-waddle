import { md, gd, type Module } from '../types';

// ------------------------------------------------------------------------------------ listings

const MAKE_THEME = gd`
@tool
extends EditorScript
## ui/make_theme.gd. Builds ui/main_theme.tres from the pixel assets.
## Open this script in the Script editor and run it with File → Run (Ctrl+Shift+X).
## Re-run it whenever you change a number here; the .tres is the result, this is the recipe.

const PANEL := preload("res://assets/ui/panel.png")
const FONT := preload("res://assets/ui/font_pixel.png")  # imported as Font Data (Image Font)

const INK := Color("fbf6e6")     # warm white text
const DIM := Color("86829e")     # disabled text
const GOLD := Color("eebb3e")    # focused and hovered text


func _run() -> void:
    var theme := Theme.new()
    theme.default_font = FONT
    theme.default_font_size = 8  # the font's native size: never a non-integer multiple

    # Windows: the 24×24 panel, sliced with 8 px corners.
    theme.set_stylebox("panel", "PanelContainer", _panel_box(6))
    theme.set_stylebox("panel", "Panel", _panel_box(6))

    # Buttons: no frame of their own; the focused one gets gold text (and the cursor, lesson 2).
    var flat := StyleBoxEmpty.new()
    flat.content_margin_left = 10  # room for the cursor to the left of the text
    flat.content_margin_top = 1
    flat.content_margin_bottom = 1
    for state in ["normal", "hover", "pressed", "focus", "disabled"]:
        theme.set_stylebox(state, "Button", flat)
    theme.set_color("font_color", "Button", INK)
    theme.set_color("font_hover_color", "Button", INK)
    theme.set_color("font_focus_color", "Button", GOLD)
    theme.set_color("font_pressed_color", "Button", GOLD)
    theme.set_color("font_disabled_color", "Button", DIM)
    theme.set_color("font_color", "Label", INK)

    # Tight spacing: at 320×180 every pixel counts.
    theme.set_constant("separation", "VBoxContainer", 2)
    theme.set_constant("separation", "HBoxContainer", 4)
    theme.set_constant("h_separation", "GridContainer", 2)
    theme.set_constant("v_separation", "GridContainer", 2)

    var err := ResourceSaver.save(theme, "res://ui/main_theme.tres")
    print("Saved ui/main_theme.tres: ", error_string(err))


func _panel_box(content: int) -> StyleBoxTexture:
    var box := StyleBoxTexture.new()
    box.texture = PANEL
    # The slice: corners stay 8×8, edges stretch along one axis, the centre along both.
    box.texture_margin_left = 8
    box.texture_margin_top = 8
    box.texture_margin_right = 8
    box.texture_margin_bottom = 8
    # The padding: where children may start, so text clears the rim.
    box.content_margin_left = content
    box.content_margin_top = content
    box.content_margin_right = content
    box.content_margin_bottom = content
    return box
`;

const STATUS_ROW = gd`
class_name StatusRow
extends HBoxContainer
## ui/status_row.gd: one party member in the status window. Layout lives in the scene
## (containers and size flags); this script only fills in the values.

@onready var name_label: Label = %NameLabel
@onready var level_label: Label = %LevelLabel
@onready var hp_label: Label = %HpLabel
@onready var mp_label: Label = %MpLabel


func show_member(display_name: String, level: int, hp: int, max_hp: int, mp: int, max_mp: int) -> void:
    name_label.text = display_name
    level_label.text = "Lv %d" % level
    # %3d pads to three characters, so numbers line up in a fixed-width pixel font
    hp_label.text = "HP %3d/%3d" % [hp, max_hp]
    mp_label.text = "MP %3d/%3d" % [mp, max_mp]
    # dim a knocked-out member instead of hiding them: the layout must not jump
    modulate = Color(1, 1, 1, 0.5) if hp <= 0 else Color.WHITE
`;

const STATUS_WINDOW = gd`
extends PanelContainer
## ui/status_window.gd: a window that lists the party, one StatusRow each.

const ROW := preload("res://ui/status_row.tscn")

## Placeholder data until k05's PartyManager provides the real members.
const DEMO := [
    {"name": "Kai", "level": 3, "hp": 64, "max_hp": 80, "mp": 6, "max_mp": 12},
    {"name": "Lyra", "level": 3, "hp": 41, "max_hp": 52, "mp": 30, "max_mp": 34},
    {"name": "Bram", "level": 2, "hp": 0, "max_hp": 96, "mp": 4, "max_mp": 8},
]

@onready var rows: VBoxContainer = %Rows


func _ready() -> void:
    show_party(DEMO)


func show_party(members: Array) -> void:
    for child in rows.get_children():
        child.queue_free()
    for m in members:
        var row: StatusRow = ROW.instantiate()
        rows.add_child(row)  # add first: @onready variables are set when it enters the tree
        row.show_member(m["name"], m["level"], m["hp"], m["max_hp"], m["mp"], m["max_mp"])
`;

const PAUSE_MENU = gd`
class_name PauseMenu
extends CanvasLayer
## ui/pause_menu.gd. Opens with "pause", pauses the game, and is driven entirely by
## focus: arrows / D-pad move focus, ui_accept presses the focused button, ui_cancel goes back.

@onready var root: Control = %Root
@onready var commands: VBoxContainer = %Commands
@onready var items_button: Button = %ItemsButton
@onready var resume_button: Button = %ResumeButton
@onready var item_grid: GridContainer = %ItemGrid
@onready var move_sfx: AudioStreamPlayer = %MoveSfx
@onready var select_sfx: AudioStreamPlayer = %SelectSfx
@onready var back_sfx: AudioStreamPlayer = %BackSfx

var _silent := false               # true while code (not the player) moves focus
var _return_to: Control = null     # where ui_cancel goes back to inside a submenu


func _ready() -> void:
    # The menu must keep running while the rest of the tree is paused. Children inherit
    # this, including the AudioStreamPlayers, so menu sounds play during the pause.
    process_mode = Node.PROCESS_MODE_ALWAYS
    root.hide()
    for button in _buttons(commands) + _buttons(item_grid):
        button.focus_entered.connect(_on_focus_entered)
        button.pressed.connect(select_sfx.play)
    items_button.pressed.connect(_open_items)
    resume_button.pressed.connect(close)
    _wire_grid()
    _set_grid_focusable(false)


func _unhandled_input(event: InputEvent) -> void:
    if root.visible and event.is_action_pressed("ui_cancel"):
        get_viewport().set_input_as_handled()
        back()
    elif event.is_action_pressed("pause"):
        get_viewport().set_input_as_handled()
        if root.visible:
            close()
        else:
            open()


func open() -> void:
    get_tree().paused = true
    root.show()
    _focus_silently(items_button)


func close() -> void:
    _set_grid_focusable(false)
    _return_to = null
    root.hide()
    get_tree().paused = false


func back() -> void:
    back_sfx.play()
    if _return_to:
        _set_grid_focusable(false)
        _focus_silently(_return_to)  # back to "Items", not to the first command
        _return_to = null
    else:
        close()


func _open_items() -> void:
    _return_to = items_button
    _set_grid_focusable(true)
    _focus_silently(item_grid.get_child(0))


func _on_focus_entered() -> void:
    if not _silent:
        move_sfx.play()  # only for moves the player made


func _focus_silently(control: Control) -> void:
    _silent = true
    control.grab_focus()  # emits focus_entered synchronously, while _silent is true
    _silent = false


## Grid slots are only focusable inside the Items submenu, so the arrow keys
## cannot wander from the command list into the grid.
func _set_grid_focusable(on: bool) -> void:
    for slot in _buttons(item_grid):
        slot.focus_mode = Control.FOCUS_ALL if on else Control.FOCUS_NONE


## Explicit neighbours: left/right wrap within a row, up/down wrap within a column.
func _wire_grid() -> void:
    var slots := _buttons(item_grid)
    var cols := item_grid.columns
    var rows := ceili(float(slots.size()) / cols)
    for i in slots.size():
        var row := floori(float(i) / cols)
        var col := i % cols
        var left := slots[row * cols + posmod(col - 1, cols)]
        var right := slots[mini(row * cols + posmod(col + 1, cols), slots.size() - 1)]
        var up := slots[mini(posmod(row - 1, rows) * cols + col, slots.size() - 1)]
        var down := slots[mini(posmod(row + 1, rows) * cols + col, slots.size() - 1)]
        slots[i].focus_neighbor_left = slots[i].get_path_to(left)
        slots[i].focus_neighbor_right = slots[i].get_path_to(right)
        slots[i].focus_neighbor_top = slots[i].get_path_to(up)
        slots[i].focus_neighbor_bottom = slots[i].get_path_to(down)


func _buttons(parent: Node) -> Array[Button]:
    var out: Array[Button] = []
    for child in parent.get_children():
        if child is Button:
            out.append(child)
    return out
`;

const MENU_CURSOR = gd`
extends TextureRect
## ui/menu_cursor.gd: the pointing glove. Follows whichever Button has focus, anywhere
## in the UI, by listening to the viewport instead of to each button.

@export var offset := Vector2(-9, 0)  ## from the button's left edge, vertically centred


func _ready() -> void:
    top_level = true  # position in screen space, ignoring containers
    hide()
    get_viewport().gui_focus_changed.connect(_on_focus_changed)


func _on_focus_changed(control: Control) -> void:
    visible = control is Button and control.is_visible_in_tree()
    if not visible:
        return
    var target := control.global_position + Vector2(offset.x, control.size.y / 2.0 - size.y / 2.0)
    create_tween().tween_property(self, "global_position", target.round(), 0.05)
`;

const MEMBER_ROW = gd`
class_name MemberRow
extends HBoxContainer
## ui/member_row.gd: one party member in the battle HUD. The real HP bar moves at once;
## a "ghost" bar behind it waits, then drains to the new value, so the player can see
## how much a hit (or a whole combo) took.

@export var ghost_delay := 0.35     ## seconds the ghost holds before draining
@export var ghost_duration := 0.45  ## seconds the drain takes

var _ghost_tween: Tween

@onready var name_label: Label = %NameLabel
@onready var hp_bar: TextureProgressBar = %HpBar
@onready var hp_ghost: TextureProgressBar = %HpGhost
@onready var hp_label: Label = %HpLabel
@onready var mp_bar: TextureProgressBar = %MpBar
@onready var atb_bar: TextureProgressBar = %AtbBar


## Connect to a c05 HealthComponent and show its current values.
func bind(display_name: String, health: HealthComponent, hp: int, max_hp: int) -> void:
    name_label.text = display_name
    health.health_changed.connect(set_hp)
    set_hp(hp, max_hp, true)


func set_hp(current: int, maximum: int, instant: bool = false) -> void:
    hp_bar.max_value = maximum
    hp_ghost.max_value = maximum
    hp_label.text = "%3d" % current
    var dropped := current < hp_bar.value
    hp_bar.value = current  # the truth, immediately
    if _ghost_tween:
        _ghost_tween.kill()  # a new hit restarts the wait: a combo drains once, at the end
    if instant or not dropped:
        hp_ghost.value = current  # healing (or setup): no ghost
        return
    _ghost_tween = create_tween()
    _ghost_tween.tween_interval(ghost_delay)
    _ghost_tween.tween_property(hp_ghost, "value", float(current), ghost_duration)\
        .set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


func set_mp(current: int, maximum: int) -> void:
    mp_bar.max_value = maximum
    mp_bar.value = current


## ATB from k04's AtbGauge: 0..2 segments as a float.
func set_atb(segments: float) -> void:
    atb_bar.max_value = 2.0
    atb_bar.value = segments
`;

const DAMAGE_NUMBER = gd`
class_name DamageNumber
extends Label
## ui/damage_number.gd: a number that pops out of a hit, rises and fades.
## It lives in the world (not on the HUD's CanvasLayer), so it stays on the enemy when
## the camera moves.

const RISE := 14.0      ## pixels it travels upward
const LIFETIME := 0.6   ## seconds until it is gone


static func spawn(parent: Node, at: Vector2, amount: int, crit: bool = false) -> void:
    var n := DamageNumber.new()
    n.text = str(amount)
    n.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    n.size = Vector2(32, 10)
    n.position = (at + Vector2(-16, -30)).round()  # centred above the feet
    n.z_index = 10
    if crit:
        n.modulate = Color("eebb3e")
        n.text += "!"
    parent.add_child(n)
    n._play()


func _play() -> void:
    var t := create_tween().set_parallel(true)
    t.tween_property(self, "position:y", position.y - RISE, LIFETIME)\
        .set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
    t.tween_property(self, "modulate:a", 0.0, LIFETIME * 0.4).set_delay(LIFETIME * 0.6)
    t.chain().tween_callback(queue_free)
`;

const PARTY_HUD = gd`
extends CanvasLayer
## ui/party_hud.gd: the battle HUD, drawn above the world on its own CanvasLayer.
## One MemberRow per party member, bound to that member's HealthComponent.

const ROW := preload("res://ui/member_row.tscn")

@export var members: Array[Character] = []  ## filled by k05's PartyManager, or by hand

@onready var rows: VBoxContainer = %Rows


func _ready() -> void:
    layer = 5  # above the world (0), below dialogue (10) and the pause menu (20)
    for member in members:
        var row: MemberRow = ROW.instantiate()
        rows.add_child(row)
        var health: HealthComponent = member.get_node("HealthComponent")
        row.bind(member.name, health, health.current, health.maximum)
`;

// ---------------------------------------------------------------------------------- module

export const MODULE: Module = {
  id: 'r05',
  part: 'rpg',
  order: 5,
  title: 'Menus, HUD and gamepad UI',
  summary: 'Control nodes and containers, a pixel-art Theme with a nine-slice panel and an integer-size font, focus navigation for gamepads, a pause menu that runs while the game is paused, and a battle HUD with ghost-draining HP bars and damage numbers.',
  relevance: md`Shardbound is played with a gamepad on a 320×180 screen, so every menu must work without a mouse and every pixel of the HUD is a decision. This module builds the theme every window shares (the panel, the font, the cursor), the pause menu with its item grid, and the party HUD: three rows of HP, MP and ATB bars where a hit drains a ghost bar the player can read at a glance. The same focus rules drive the tactical-mode command menu in k04 and the shop in r03.`,
  prereqs: ['g03'],
  areas: ['art', 'godot', 'systems'],
  lessons: [
    // ======================================================================== r05-1
    {
      id: 'r05-1',
      title: 'Controls, containers and a pixel-art theme',
      minutes: 40,
      objectives: [
        'Lay out UI with anchors, containers and size flags instead of hand-placed positions.',
        'Set the project to render at 320×180 and scale by an integer factor $k = \\lfloor \\min(W/320, H/180) \\rfloor$.',
        'Slice a 24×24 panel with 8 px margins and compute its corner, edge and centre sizes.',
        'Build one Theme for the whole game: the panel StyleBoxTexture, the pixel font at its native size and button colours.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Game UI looks like decoration and behaves like software. A status window has to fit three party members at 320×180, keep its numbers aligned, survive a name that is longer than expected, and look like it belongs to the same world as the sprites. Doing that by dragging nodes to pixel positions works once and breaks the first time anything changes.

Godot's UI nodes, the **Controls**, solve layout the way CSS flexbox and React layout components do: a **container** decides where its children go, and each child only states preferences (a minimum size, whether to expand). This lesson sets up the project's resolution, builds a theme from the pixel assets, and lays out a status window.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'Controls, anchors and containers',
          md: md`- A **Control** has a rectangle. Outside a container, its rectangle is set by **anchors** (fractions of the parent: 0 is the left or top edge, 1 the right or bottom) plus **offsets** in pixels. The *Anchor preset* menu sets common cases: *Bottom Wide*, *Center*, *Full Rect*.
- A **container** (\`VBoxContainer\`, \`HBoxContainer\`, \`GridContainer\`, \`MarginContainer\`, \`PanelContainer\`) overrides its children's position and size. You cannot drag a container's child; you change its **size flags** (*Fill*, *Expand*, *Shrink Center*, *Shrink End*) and its *Custom Minimum Size* instead.
- **Expand** asks for a share of the leftover space; **Fill** says "make my rectangle as big as my share". *Expand + Fill* on a label in an HBox is the flexbox \`flex: 1\`.
- \`PanelContainer\` draws its theme's \`panel\` style box and keeps children inside its content margins. \`MarginContainer\` is the same without the drawing.`,
        },
        {
          kind: 'text',
          md: md`### Resolution: 320×180, scaled by whole numbers

Shardbound renders everything (world and UI) into a 320×180 image and scales it up. With *Stretch Mode* **viewport**, Godot draws at the base size and scales the finished image, so UI pixels stay exactly as big as sprite pixels. With **Scale Mode** set to **integer**, the scale is a whole number and the rest of the window is filled with black bars. A non-integer scale (4.5×) would make some pixel columns 4 screen pixels wide and others 5, and thin lines in the font would visibly wobble.`,
        },
        {
          kind: 'derive',
          title: 'the integer scale and the black bars',
          goal: md`A window is $W \times H$ screen pixels. Find the largest whole scale $k$ at which a 320×180 image fits, and the size of the bars.`,
          steps: [
            { md: md`The image fits horizontally if $320k \le W$, i.e. $k \le W/320$, and vertically if $k \le H/180$.` },
            {
              md: md`The largest whole number satisfying both is $$k = \left\lfloor \min\!\left(\frac{W}{320}, \frac{H}{180}\right) \right\rfloor.$$`,
              choose: {
                prompt: md`At 1920×1080, what is $k$?`,
                options: [md`6`, md`5`, md`6.75`],
                answer: 0,
                explain: md`$1920/320 = 6$ and $1080/180 = 6$, so $k = 6$ with no bars at all. 1920×1080 is exactly 6×.`,
              },
            },
            {
              md: md`The image covers $320k \times 180k$; the bars are what remains, split evenly: $(W - 320k)/2$ on each side and $(H - 180k)/2$ above and below.`,
              choose: {
                prompt: md`The Steam Deck's screen is 1280×800. How tall is each black bar?`,
                options: [md`40 px`, md`80 px`, md`0 px`],
                answer: 0,
                explain: md`$\min(1280/320, 800/180) = \min(4, 4.44) = 4$. The image is 1280×720, leaving $800 - 720 = 80$ px, 40 above and 40 below.`,
              },
            },
          ],
          takeaway: md`320×180 divides evenly into 1280×720 (4×), 1920×1080 (6×) and 2560×1440 (8×), the most common 16:9 sizes. Other shapes get bars, which is the price of pixels that never wobble.`,
        },
        {
          kind: 'numeric',
          q: md`A player runs the game in a 1600×1000 window. What integer scale $k$ does Godot use, and how wide is each side bar in screen pixels? Enter both.`,
          answer: { kind: 'vector', value: [5, 0] },
          inputHint: 'k, bar width',
          explain: md`$1600/320 = 5$ and $1000/180 \approx 5.56$, so $k = 5$. The image is 1600 px wide: no side bars. Vertically it is 900 px tall, leaving 50 px bars above and below.`,
        },
        {
          kind: 'steps',
          title: 'Set up the window',
          steps: [
            md`Open **Project → Project Settings → Display → Window** (turn on *Advanced Settings* in the top right if you do not see everything). Set *Viewport Width* 320 and *Viewport Height* 180, and *Window Width Override* 1280 and *Window Height Override* 720 so the editor's test window opens at 4×.`,
            md`Under *Stretch*, set *Mode* to **viewport**, *Aspect* to **keep** and *Scale Mode* to **integer**.`,
            md`Under **Rendering → Textures**, check *Default Texture Filter* is **Nearest** (the starter project sets it).`,
            md`Select \`assets/ui/font_pixel.png\` in the FileSystem dock, open the **Import** dock, change *Import As* to **Font Data (Image Font)**, set *Columns* 16, *Rows* 6, and *Character Ranges* to \`32-126\`, then click **Reimport**.`,
          ],
          result: md`Running any scene opens a 1280×720 window in which every pixel is a crisp 4×4 block. Resizing the window to something in between snaps the image to the largest whole scale and adds black bars.`,
          troubleshoot: [
            { problem: md`Text looks smooth or blurry at 4×.`, fix: md`*Stretch Mode* is \`canvas_items\`, which draws UI at the window's resolution. Use \`viewport\` for a strict pixel look.` },
            { problem: md`The font shows boxes or wrong letters.`, fix: md`The character range or grid is off. The sheet holds ASCII 32 to 126 in 16 columns and 6 rows; re-check the import settings and reimport.` },
          ],
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Nine-slice',
          md: md`A **nine-slice** (Godot: \`NinePatchRect\`, or a \`StyleBoxTexture\` with texture margins) cuts a small texture into a 3×3 grid with four margins. The four **corners** are drawn at their original size; the four **edges** stretch (or tile) along one axis; the **centre** stretches along both. One 24×24 panel image can then draw a window of any size with crisp corners and an even border.`,
        },
        {
          kind: 'assets',
          ids: ['ui_panel', 'ui_cursor', 'font_pixel'],
          note: md`The panel is 24×24 with 8 px corners. The font is 6×8 (capitals 7 px tall), white so the theme can tint it.`,
        },
        {
          kind: 'viz',
          viz: { type: 'rpg.ui_nineslice' },
          task: md`Drag the panel's bottom-right handle. Turn on **show slices** and watch which parts stretch. Set *patch margin* to 4, then to 11: find what goes wrong with the corners at each. Switch **draw as** to *TextureRect (stretch)* to see what happens without slicing. Finally shrink the panel until the text no longer fits inside the content margins.`,
          caption: md`The readout splits the panel into its regions: four $m \times m$ corners, edges of length $w - 2m$ and $h - 2m$, a $(w-2m) \times (h-2m)$ centre. A margin smaller than the art's real border stretches part of the corner; a larger one copies part of the centre into the corners.`,
        },
        {
          kind: 'numeric',
          q: md`The 24×24 panel with 8 px margins is drawn as a 120×48 window. How many pixels wide is the stretched top edge, and how big (w×h) is the centre? Enter edge width, centre width, centre height.`,
          answer: { kind: 'vector', value: [104, 104, 32] },
          inputHint: 'edge, centre w, centre h',
          explain: md`The top edge spans between the two 8 px corners: $120 - 16 = 104$. The centre is $(120 - 16) \times (48 - 16) = 104 \times 32$. The source centre is only $8 \times 8$, so it is stretched 13× horizontally and 4× vertically.`,
        },
        {
          kind: 'text',
          md: md`### One theme for the whole game

A **Theme** is a resource holding style boxes, fonts, colours and constants per Control type: "a \`Button\`'s \`focus\` style is this", "a \`Label\`'s \`font_color\` is that". Set it once on the project (*Project Settings → GUI → Theme → Custom*) and every Control in every scene uses it unless it overrides something locally. Building the theme from a script, instead of clicking it together in the Theme editor, keeps every number in one readable place and makes it reproducible; the \`.tres\` it saves is what the game loads.`,
        },
        {
          kind: 'code',
          file: 'ui/make_theme.gd',
          code: MAKE_THEME,
          note: md`An \`EditorScript\` runs inside the editor when you choose **File → Run** in the Script editor. Texture margins decide *how the image is sliced*; content margins decide *where children go*, which is why they are separate numbers. \`error_string(err)\` turns an error code into text ("OK" on success).`,
        },
        {
          kind: 'check',
          q: md`A \`Label\` inside a \`PanelContainer\` touches the panel's rim. Which property fixes that?`,
          options: [md`The StyleBoxTexture's \`content_margin_*\``, md`The StyleBoxTexture's \`texture_margin_*\``, md`The Label's *Position*`, md`The PanelContainer's anchors`],
          answer: 0,
          explain: md`Content margins are the padding between the panel's edge and its children. Texture margins only control how the image is sliced, and a container's child cannot be positioned by hand.`,
        },
        {
          kind: 'steps',
          title: 'Build the status window',
          steps: [
            md`Run \`ui/make_theme.gd\` (**File → Run** in the Script editor) and set **Project → Project Settings → GUI → Theme → Custom** to \`res://ui/main_theme.tres\`.`,
            md`Make \`ui/status_row.tscn\`: an \`HBoxContainer\` root with \`status_row.gd\` and four \`Label\`s: \`NameLabel\` (*Custom Minimum Size* x 30), \`LevelLabel\` (x 30), \`HpLabel\` (*Size Flags → Horizontal* **Expand + Fill**) and \`MpLabel\`. Mark all four **Access as Unique Name**.`,
            md`Make \`ui/status_window.tscn\`: a \`PanelContainer\` root with \`status_window.gd\`, anchor preset **Center**, and a \`VBoxContainer\` child named \`Rows\` (unique name).`,
            md`Run the scene with **F6**.`,
          ],
          result: md`A panel in the middle of the screen lists Kai, Lyra and Bram, one row each, with names, levels and HP/MP lined up in columns. Bram (0 HP) is dimmed. The panel grows to fit its rows; nothing was positioned by hand.`,
          troubleshoot: [
            { problem: md`The labels overlap or the panel collapses to a thin strip.`, fix: md`A row is not a container, or the labels have no minimum width. Check the row's root is an \`HBoxContainer\` and the name and level labels have a *Custom Minimum Size*.` },
            { problem: md`\`show_member\` crashes with "null instance".`, fix: md`It was called before the row entered the tree, so its \`@onready\` variables were not set yet. Add the row as a child first, then call it, as the listing does.` },
          ],
        },
        { kind: 'code', file: 'ui/status_row.gd', code: STATUS_ROW },
        { kind: 'code', file: 'ui/status_window.gd', code: STATUS_WINDOW },
        {
          kind: 'build',
          ch: {
            id: 'r05-1-build',
            title: 'The pause screen layout',
            goal: md`Lay out the pause screen at 320×180 (lesson 2 makes it work): a command list on the left, the status window on the right, gold and play time at the bottom.`,
            requirements: [
              md`A command panel on the left (Items, Equip, Shards, Save, Resume) is exactly as wide as its longest command plus padding.`,
              md`The status window fills the remaining width; a 4 px gap separates every panel and the screen edge.`,
              md`A small panel at the bottom right shows "Gold 1240" and "Time 1:02:05" right-aligned.`,
              md`Renaming "Shards" to "Shard Sockets" widens the command panel and shrinks the status window, with no manual changes.`,
            ],
            hints: [
              md`Root: a \`MarginContainer\` with *Full Rect* anchors and 4 px margins (*Theme Overrides → Constants*). Inside it an \`HBoxContainer\` (separation 4).`,
              md`The command panel needs no size flags (it shrinks to fit); the right column is a \`VBoxContainer\` with *Expand + Fill*, holding the status window (*Expand + Fill* vertically) and the gold panel (*Shrink End* horizontally).`,
            ],
            solution: [
              {
                file: 'ui/pause_layout.tscn',
                lang: 'text',
                code: `PauseLayout (MarginContainer, anchors Full Rect, margins 4)
└─ HBox (HBoxContainer, separation 4)
   ├─ Commands (PanelContainer)                      size flags: default (shrink to fit)
   │  └─ CommandList (VBoxContainer)
   │     └─ ItemsButton, EquipButton, ShardsButton, SaveButton, ResumeButton (Button)
   └─ Right (VBoxContainer, separation 4)            horizontal: Expand + Fill
      ├─ StatusWindow (instance of status_window.tscn) vertical: Expand + Fill
      └─ GoldPanel (PanelContainer)                   horizontal: Shrink End
         └─ VBox (VBoxContainer)
            ├─ GoldLabel (Label, align Right)   "Gold 1240"
            └─ TimeLabel (Label, align Right)   "Time 1:02:05"
`,
              },
            ],
            explain: md`Every position is a consequence of containers and size flags. The command panel's width comes from its longest button's minimum size, so renaming a command reflows the whole screen. This is the property that makes UI survive localisation, longer item names and late design changes.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'r05-1-paper',
            title: 'How tall is the menu?',
            type: 'compute',
            difficulty: 1,
            minutes: 5,
            statement: md`A \`PanelContainer\` with content margins of 6 px holds a \`VBoxContainer\` (separation 2) of 5 buttons. Each button is a line of 8 px font plus 1 px content margin above and below. How tall, in pixels, is the panel?`,
            solution: [
              md`Each button is $1 + 8 + 1 = 10$ px tall.`,
              md`The VBox is $5 \times 10 + 4 \times 2 = 58$ px: five buttons and four gaps between them.`,
              md`The panel adds its content margins top and bottom: $58 + 6 + 6 = 70$ px.`,
            ],
            answer: { kind: 'number', value: 70 },
          },
        },
        {
          kind: 'recall',
          prompt: md`What is the difference between a StyleBoxTexture's texture margins and its content margins?`,
          answer: md`Texture margins say where to cut the image into nine pieces (corner size). Content margins are the padding between the box's edge and the children a container places inside it.`,
        },
        {
          kind: 'explain',
          prompt: md`Why use containers and size flags for game UI when you could place every Control at exact pixel positions at 320×180?`,
          model: md`Exact positions encode assumptions: this name is 4 letters, this list has 5 items, this panel is 120 px. Each change (a longer item name, a translated label, a new menu entry) then means moving several nodes by hand, and mistakes show up as overlaps. Containers compute positions from content and preferences, so the layout adapts and stays consistent, the same way flexbox does in web UI. You still control the pixels through minimum sizes, separations and margins, which live in one theme.`,
        },
      ],
      cards: [
        { id: 'r05-1-c1', kind: 'compute', front: md`Integer scale for a 2560×1440 window with a 320×180 viewport?`, answer: { kind: 'number', value: 8 }, back: md`$\lfloor\min(2560/320, 1440/180)\rfloor = \lfloor\min(8, 8)\rfloor = 8$.` },
        { id: 'r05-1-c2', kind: 'concept', front: md`In a nine-slice, which parts stretch?`, back: md`Corners never stretch; top and bottom edges stretch horizontally, left and right edges vertically, the centre both ways.` },
        { id: 'r05-1-c3', kind: 'cloze', text: md`To make a Label take all leftover width in an HBoxContainer, set its horizontal size flags to {{}} and Fill.`, answers: ['Expand'] },
        { id: 'r05-1-c4', kind: 'concept', front: md`Why *Stretch Mode* \`viewport\` with *Scale Mode* \`integer\` for a pixel-art game?`, back: md`The game and UI render at 320×180 and the image is scaled by a whole number, so every art pixel is the same size and fonts never wobble.` },
        { id: 'r05-1-c5', kind: 'concept', front: md`Why can't you drag a child of a VBoxContainer to a new position?`, back: md`The container sets its children's position and size every layout pass; you influence it with size flags, minimum size and separation instead.` },
      ],
    },

    // ======================================================================== r05-2
    {
      id: 'r05-2',
      title: 'Focus, gamepad navigation and the pause menu',
      minutes: 45,
      objectives: [
        'Drive menus with focus: `grab_focus()`, `ui_accept`, `ui_cancel` and the `ui_*` direction actions.',
        'Set explicit focus neighbours for a grid with wrap-around, using $i = r \\cdot c_n + c$ and `posmod`.',
        'Build a pause menu that runs while the game is paused with `process_mode = PROCESS_MODE_ALWAYS`.',
        'Give every menu action a sound and avoid sounds for focus changes made by code.',
        'Return focus to the right control when backing out of a submenu.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`With a mouse, the user points at what they want. With a gamepad, the game has to keep track of **which control is selected**, move that selection when the stick or D-pad is pushed, and press it on the A button. Godot builds this in as **focus**: exactly one Control in the viewport has focus at a time, the \`ui_up\`/\`ui_down\`/\`ui_left\`/\`ui_right\` actions move it to a neighbour, and \`ui_accept\` presses a focused \`Button\`.

The failures players notice are all about focus: a menu that opens with nothing selected (so the first press does nothing), a cursor that jumps somewhere unexpected, a back button that returns to the top of the list instead of where you were, and a silent menu that gives no feedback.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'Focus in Godot',
          md: md`- \`control.grab_focus()\` gives focus to a Control whose \`focus_mode\` is \`FOCUS_ALL\` (Buttons default to that). Call it whenever a menu opens.
- Moving focus with \`ui_*\` directions uses \`focus_neighbor_left\`, \`_right\`, \`_top\` and \`_bottom\` (NodePaths) when they are set; otherwise Godot searches for the nearest focusable Control in that direction.
- \`focus_entered\` and \`focus_exited\` fire on the control; the viewport emits \`gui_focus_changed(control)\` for every change.
- \`ui_accept\` (Enter, Space, the gamepad's bottom face button) presses the focused Button; \`ui_cancel\` (Escape, the right face button) does nothing by default; your menu handles it.
- Godot's built-in \`ui_*\` actions already map the arrow keys and the D-pad. In the Input Map, turn on **Show Built-in Actions** to check them and to add the left stick if your version does not include it.`,
        },
        {
          kind: 'viz',
          viz: { type: 'rpg.menu_focus' },
          task: md`Click the figure and use the arrows, **F** (ui_accept) and **X** or Escape (ui_cancel). Open *Items*, move to the grid's left column and press left. With **explicit neighbours** off, focus follows geometry and lands in the command list, possibly on a different command. Turn it on and try again, then toggle **wrap**. Back out with X and check where focus returns.`,
          caption: md`Arrows show the focused control's four neighbours. With explicit neighbours on they come from \`_wire_grid()\`; with them off the figure searches the nearest focusable control in that direction, as Godot does when a neighbour is not set. The grid is only focusable inside the Items submenu unless you turn that off too.`,
        },
        {
          kind: 'derive',
          title: 'grid neighbours with wrap-around',
          goal: md`A grid has $n_c$ columns and $n_r$ rows, filled row by row. Find the index of each slot's four neighbours, wrapping at the edges.`,
          steps: [
            { md: md`Slot $i$ is in row $r = \lfloor i / n_c \rfloor$ and column $c = i \bmod n_c$; conversely $i = r\,n_c + c$.` },
            {
              md: md`Left and right stay in the row and wrap the column: $c' = (c \pm 1) \bmod n_c$. The neighbour is $r\,n_c + c'$. Up and down wrap the row: $r' = (r \pm 1) \bmod n_r$, neighbour $r'\,n_c + c$.`,
              choose: {
                prompt: md`Why \`posmod(c - 1, n)\` instead of \`(c - 1) % n\`?`,
                options: [md`\`%\` of a negative number is negative in GDScript, so column 0 would map to $-1$`, md`\`posmod\` is faster`, md`\`%\` only works on floats`],
                answer: 0,
                explain: md`\`-1 % 4\` is \`-1\` in GDScript (as in C), not 3. \`posmod(-1, 4)\` returns 3, the mathematical modulo that wraps to the last column.`,
              },
            },
            {
              md: md`A partly filled last row has holes: with 10 slots in 4 columns, slot 11 does not exist. The listing clamps such indices to the last slot with \`mini(…, size - 1)\`, so pressing down from slot 7 wraps to slot 9 instead of a missing slot.`,
              choose: {
                prompt: md`4 columns, 12 slots. What is the *right* neighbour of slot 7 with wrap?`,
                options: [md`4`, md`8`, md`0`],
                answer: 0,
                explain: md`Slot 7 is row 1, column 3. $(3 + 1) \bmod 4 = 0$, so the neighbour is $1 \times 4 + 0 = 4$, the first slot of the same row.`,
              },
            },
          ],
          takeaway: md`Explicit neighbours turn "where does focus go?" into a formula you can test. Wrap within the grid, and never let a direction leave a submenu: leaving is ui_cancel's job.`,
        },
        {
          kind: 'numeric',
          q: md`A 5-column inventory grid with wrap. What is the *up* neighbour of slot 2 when the grid has 3 full rows (15 slots)?`,
          answer: { kind: 'number', value: 12 },
          explain: md`Slot 2 is row 0, column 2. Up wraps to row $(0 - 1) \bmod 3 = 2$: index $2 \times 5 + 2 = 12$.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'Pausing: the tree stops, the menu must not',
          md: md`\`get_tree().paused = true\` stops \`_process\`, \`_physics_process\` and input for every node whose \`process_mode\` is *Inherit* (the default) or *Pausable*. The pause menu must keep working, so its root sets \`process_mode = PROCESS_MODE_ALWAYS\` and its children inherit it. Two consequences: the menu's \`AudioStreamPlayer\`s keep playing during the pause, and tweens created by the menu keep running. Music on a player under a pausable node stops with the game, which is usually what you want.`,
        },
        {
          kind: 'code',
          file: 'ui/pause_menu.gd',
          code: PAUSE_MENU,
          note: md`Focus changes made by code (opening the menu, returning from a submenu) would also fire \`focus_entered\` and play the move sound; \`_focus_silently\` suppresses that, because \`grab_focus()\` emits \`focus_entered\` before it returns. \`_return_to\` remembers which command opened the submenu, so ui_cancel lands back on *Items* and not on the first command.`,
        },
        {
          kind: 'check',
          q: md`The pause menu opens, but none of its buttons respond to the keyboard. The menu's root is a \`CanvasLayer\` and \`open()\` is:

\`\`\`gdscript
func open() -> void:
	get_tree().paused = true
	root.show()
	items_button.grab_focus()
\`\`\`

What is the most likely cause?`,
          options: [
            md`The menu's \`process_mode\` is still *Inherit*, so it is paused along with everything else.`,
            md`\`grab_focus()\` must be called before \`root.show()\`.`,
            md`Buttons cannot be focused inside a CanvasLayer.`,
            md`\`get_tree().paused\` must be set at the end of the function.`,
          ],
          answer: 0,
          explain: md`A paused node receives no input, and GUI input is processed through the same pause rules. Setting \`process_mode = Node.PROCESS_MODE_ALWAYS\` on the menu's root (as \`_ready\` does in the listing) keeps it alive while the tree is paused.`,
        },
        {
          kind: 'code',
          file: 'ui/menu_cursor.gd',
          code: MENU_CURSOR,
          note: md`Listening to \`get_viewport().gui_focus_changed\` means one cursor serves every menu: pause, shop, tactical commands. \`top_level = true\` frees it from its parent container's layout so it can sit anywhere. The 0.05 s tween is just enough to read as motion without slowing a fast player down.`,
        },
        {
          kind: 'steps',
          title: 'Make the pause menu work',
          steps: [
            md`In **Project Settings → Input Map** check that \`pause\` exists (Escape and the gamepad's Start button), turn on **Show Built-in Actions**, and confirm \`ui_accept\`, \`ui_cancel\` and the four \`ui_*\` directions have keyboard and D-pad events.`,
            md`Turn your pause layout from lesson 1 into \`ui/pause_menu.tscn\`: a \`CanvasLayer\` root (*Layer* 20) with \`pause_menu.gd\`, the \`PauseLayout\` as a child named \`Root\`, and a \`GridContainer\` named \`ItemGrid\` (*Columns* 4) of 12 \`Button\`s inside the status area. Mark \`Root\`, \`Commands\` (the VBox of commands), \`ItemsButton\`, \`ResumeButton\` and \`ItemGrid\` as unique names.`,
            md`Add three \`AudioStreamPlayer\`s named \`MoveSfx\`, \`SelectSfx\` and \`BackSfx\` with \`sfx_menu_move\`, \`sfx_menu_select\` and \`sfx_menu_back\`, as unique names.`,
            md`Add a \`TextureRect\` with \`assets/ui/cursor.png\` and \`menu_cursor.gd\` as the last child of \`Root\`, so it draws on top.`,
            md`Instance \`pause_menu.tscn\` into your main game scene (or the test room) and run it. Press Escape, move around, open Items, back out, and resume.`,
          ],
          result: md`Escape freezes the game and shows the menu with *Items* selected and the glove next to it. Every move ticks, accept clicks, back makes its own sound, and opening the menu makes no sound. In the grid, left from the first column wraps to the last; Escape from the grid returns to *Items*; Escape again resumes the game.`,
          troubleshoot: [
            { problem: md`The first press after opening does nothing.`, fix: md`Nothing had focus: \`grab_focus()\` was not called, or was called on a hidden control. Show the menu first, then grab focus.` },
            { problem: md`Pressing Escape inside the grid closes the whole menu.`, fix: md`\`pause\` and \`ui_cancel\` are both bound to Escape and \`pause\` is checked first. Check \`ui_cancel\` first while the menu is open, as \`_unhandled_input\` does.` },
            { problem: md`Focus jumps from the command list into the grid.`, fix: md`The grid slots are focusable outside their submenu. Keep their \`focus_mode\` at \`FOCUS_NONE\` until Items is opened (\`_set_grid_focusable\`).` },
          ],
        },
        {
          kind: 'build',
          ch: {
            id: 'r05-2-build',
            title: 'An Equip submenu',
            goal: md`Add an Equip submenu that lists three slots (Weapon, Armour, Accessory) for the selected party member, with correct focus and sounds.`,
            requirements: [
              md`*Equip* opens a vertical list of three slot buttons with the first focused, without a move sound.`,
              md`Up and down wrap within the three slots; left and right do nothing.`,
              md`ui_cancel returns focus to *Equip* (not *Items*) with the back sound.`,
              md`While the Equip list is open, the item grid and command list cannot receive focus.`,
            ],
            hints: [
              md`Generalise \`_open_items\` into \`_open_submenu(opener: Button, container: Control)\` and keep one \`_return_to\` and one "current submenu" variable.`,
              md`A one-column list is a grid with \`cols = 1\`: \`_wire_grid\` gives up/down wrap and makes left/right point at the slot itself, which means "stay".`,
              md`Make the command list unfocusable too while a submenu is open, or a neighbour search can still escape to it.`,
            ],
            solution: [
              {
                file: 'ui/pause_menu_submenus.gd',
                code: gd`
extends PauseMenu
## Generalised submenus for the pause menu: Items and Equip share the same logic.

@onready var equip_button: Button = %EquipButton
@onready var equip_list: VBoxContainer = %EquipList

var _submenu: Control = null


func _ready() -> void:
    super()
    for button in _buttons(equip_list):
        button.focus_entered.connect(_on_focus_entered)
        button.pressed.connect(select_sfx.play)
    equip_button.pressed.connect(_open_submenu.bind(equip_button, equip_list))
    _set_focusable(equip_list, false)


func _open_submenu(opener: Button, container: Control) -> void:
    _return_to = opener
    _submenu = container
    _set_focusable(commands, false)
    _set_focusable(container, true)
    _focus_silently(container.get_child(0))


func back() -> void:
    if _submenu:
        _set_focusable(_submenu, false)
        _set_focusable(commands, true)
        _submenu = null
    super()


func _set_focusable(container: Control, on: bool) -> void:
    for button in _buttons(container):
        button.focus_mode = Control.FOCUS_ALL if on else Control.FOCUS_NONE
`,
              },
            ],
            explain: md`Extending \`PauseMenu\` keeps the original working and adds one idea: a submenu is "a container whose buttons become focusable while everything else is not, plus a control to return to". \`super()\` calls the parent's version, so the back sound and the return-to logic are reused. The vertical list needs no neighbour wiring: in a VBox with nothing else focusable, Godot's automatic up/down search already stays inside it; add \`_wire_grid\`-style wrap if you want the ends to wrap.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'r05-2-paper',
            title: 'Neighbours in a ragged grid',
            type: 'compute',
            difficulty: 2,
            minutes: 6,
            statement: md`An item grid has 4 columns and 10 slots (the last row holds slots 8 and 9). Using the lesson's \`_wire_grid\` (wrap, then clamp to the last slot), what are the *down* neighbours of slots 6 and 7? Enter both.`,
            hints: [md`$n_r = \lceil 10 / 4 \rceil = 3$. Compute $r' n_c + c$, then clamp with \`mini(…, 9)\`.`],
            solution: [
              md`Slot 6: row 1, column 2. Down: row 2, index $2 \times 4 + 2 = 10$, which does not exist; clamped to 9.`,
              md`Slot 7: row 1, column 3. Down: index $2 \times 4 + 3 = 11$, clamped to 9.`,
              md`Both go to slot 9, the last item. A friendlier rule for ragged grids is "the nearest existing slot in the target row", which here is also 9.`,
            ],
            answer: { kind: 'vector', value: [9, 9] },
          },
        },
        {
          kind: 'recall',
          prompt: md`Why does the pause menu need \`_focus_silently\`, and how does it work?`,
          answer: md`\`grab_focus()\` emits \`focus_entered\`, which plays the move sound, but focus changes made by code (opening, returning) should be silent. It sets \`_silent = true\`, grabs focus (the signal fires synchronously and sees the flag), then clears the flag.`,
        },
        {
          kind: 'explain',
          prompt: md`Why should every menu action have a sound, and why should *code-driven* focus changes not?`,
          model: md`On a gamepad the player often looks at the game, not the cursor; a tick per move, a click per accept and a distinct back sound confirm each input landed and what it did, even out of the corner of the eye. Sounds for focus changes the player did not make (opening a menu, returning from a submenu) carry no information about their input, so they sound like a glitch or a double press. Feedback should map one-to-one to the player's actions.`,
        },
      ],
      cards: [
        { id: 'r05-2-c1', kind: 'cloze', text: md`A pause menu keeps running while the tree is paused with \`process_mode = Node.{{}}\`.`, answers: ['PROCESS_MODE_ALWAYS'] },
        { id: 'r05-2-c2', kind: 'compute', front: md`4-column grid, slot 8 (row 2, col 0). Left neighbour with wrap?`, answer: { kind: 'number', value: 11 }, back: md`$(0 - 1) \bmod 4 = 3$, index $2 \times 4 + 3 = 11$.` },
        { id: 'r05-2-c3', kind: 'concept', front: md`What must every menu do the moment it opens?`, back: md`Give a control focus with \`grab_focus()\` (after showing it), or the first gamepad press does nothing.` },
        { id: 'r05-2-c4', kind: 'concept', front: md`Where should ui_cancel return focus when leaving a submenu?`, back: md`To the control that opened it (remembered in a variable), not to the first item of the parent menu.` },
        { id: 'r05-2-c5', kind: 'cloze', text: md`One cursor can follow focus in every menu by connecting to \`get_viewport().{{}}\`.`, answers: ['gui_focus_changed'] },
      ],
    },

    // ======================================================================== r05-3
    {
      id: 'r05-3',
      title: 'The battle HUD: bars, ghosts and damage numbers',
      minutes: 40,
      objectives: [
        'Draw the HUD on a CanvasLayer above the world, and damage numbers in the world.',
        'Build HP, MP and ATB bars from `TextureProgressBar` and the `ui_bars` atlas.',
        'Drain a ghost bar with a delayed, eased tween and restart it on every hit.',
        'Compute bar pixels $\\lfloor 46 \\cdot hp / hp_{\\max} \\rfloor$ and when an eased drain looks finished.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`In an action fight the player looks at Kai, not at the corner of the screen. The HUD has a fraction of a second to say "you lost about a quarter of your health" and "Lyra's ATB is ready". Two techniques carry most of that:

- **Ghost bars.** When HP drops, the real bar drops at once and a lighter bar behind it holds for a moment, then drains. The gap between them *is* the damage, visible long enough to notice. In a combo the ghost keeps holding until the combo ends, so the player sees the total.
- **Damage numbers.** A number pops out of the target, rises a few pixels and fades. It confirms the hit landed and how hard, in the place the player is already looking.

Both are tweens. The work is in the timing.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'CanvasLayer and TextureProgressBar',
          md: md`- A **CanvasLayer** draws its children in its own layer, ignoring the camera. The world is layer 0; Shardbound's HUD uses 5, dialogue 10 and the pause menu 20. Anything that should stay on the screen (bars, the minimap) goes in a CanvasLayer; anything that should stay on a *thing in the world* (damage numbers, an enemy's stagger bar) goes in the world.
- A **TextureProgressBar** draws \`texture_under\` (the empty bar), then \`texture_progress\` cropped to \`value / max_value\` of its width, then \`texture_over\` (the frame). \`tint_progress\` recolours the fill, which is how one HP texture becomes the pale ghost.`,
        },
        {
          kind: 'assets',
          ids: ['ui_bars', 'font_pixel', 'sfx_hurt', 'sfx_heal'],
          note: md`\`ui_bars\` is one 48×42 atlas of 48×6 rows: \`hp_fill\`, \`mp_fill\`, \`atb_fill\`, \`atb_full\`, \`stagger_fill\`, \`empty\` and \`frame\`. Each fill is 46×4 inside a 1 px frame. Cut each row out with an \`AtlasTexture\` (region x 0, y = 6 × row, 48×6).`,
        },
        {
          kind: 'viz',
          viz: { type: 'rpg.hud_bars' },
          task: md`Click the figure and press **J** for a slime hit on Kai, **K** to heal. Hit three times quickly: the ghost holds until the combo ends, then drains once. Set *ghost_delay* to 0 and compare. Switch the ease between linear and cubic out with a long duration and watch the plot: which one looks finished sooner? Finally set Kai's max HP to 240 and find a hit too small to move the bar.`,
          caption: md`The plot shows HP (solid) and the ghost (pale) over the last three seconds. The bar's width in pixels is $\lfloor 46 \cdot hp / hp_{\max} \rfloor$, shown in the readout: damage below $hp_{\max}/46$ may not move it at all. Numbers rise 14 px over 0.6 s with an ease-out and fade during the last 40%.`,
        },
        {
          kind: 'derive',
          title: 'when does an eased drain look finished?',
          goal: md`The ghost drains a drop of $\Delta$ HP over $D$ seconds after a delay $d$, with cubic ease-out $e(u) = 1 - (1 - u)^3$. Find when 90% of the drop has drained.`,
          steps: [
            { md: md`At time $d + uD$ (for $0 \le u \le 1$) the ghost has covered $e(u)\,\Delta$ of the drop.` },
            {
              md: md`Set $e(u) = 0.9$: $(1 - u)^3 = 0.1$, so $1 - u = 0.1^{1/3} \approx 0.464$ and $u \approx 0.536$.`,
              choose: {
                prompt: md`How do you undo the cube in $(1-u)^3 = 0.1$?`,
                options: [md`Take the cube root of both sides`, md`Divide by 3`, md`Take the square root twice`],
                answer: 0,
                explain: md`$(1-u)^3 = 0.1 \iff 1 - u = \sqrt[3]{0.1} \approx 0.464$.`,
              },
            },
            {
              md: md`So 90% of the drain happens by $t_{90} = d + 0.536\,D$. With the defaults ($d = 0.35$ s, $D = 0.45$ s) that is $0.35 + 0.24 = 0.59$ s, although the tween formally ends at 0.8 s. A linear drain reaches 90% only at $d + 0.9D = 0.755$ s.`,
              choose: {
                prompt: md`Why does ease-out feel more responsive than linear for the same duration?`,
                options: [md`It moves fastest at the start, so most of the change happens early`, md`It has a shorter duration`, md`It skips the delay`],
                answer: 0,
                explain: md`$e'(u) = 3(1-u)^2$ is 3 at the start and 0 at the end: the bar drops quickly and settles gently, so it reads as finished well before the tween ends.`,
              },
            },
          ],
          takeaway: md`Tune the delay for readability (long enough to see the gap, about 0.3 to 0.5 s) and the duration and ease for how heavy the drain feels. Ease-out makes a long duration feel shorter.`,
        },
        {
          kind: 'numeric',
          q: md`Kai has 240 max HP, drawn on the 46 px fill. What is the smallest whole amount of damage that is *guaranteed* to move the bar by at least one pixel, whatever his current HP?`,
          answer: { kind: 'number', value: 6 },
          explain: md`One pixel is $240/46 \approx 5.22$ HP. A drop of $\Delta$ HP lowers $46 \cdot hp/240$ by $46\Delta/240$, which is at least 1 when $\Delta \ge 5.22$; the smallest whole amount is 6. Smaller hits may or may not cross a pixel boundary. That is a reason for damage numbers: the bar alone cannot show small hits.`,
        },
        { kind: 'code', file: 'ui/member_row.gd', code: MEMBER_ROW, note: md`\`set_hp\` is connected straight to \`health_changed(current, maximum)\`; the signal has two arguments and \`instant\` takes its default. Killing the previous tween before starting a new one is what makes a combo drain once: each hit restarts the delay from the current ghost value.` },
        {
          kind: 'check',
          q: md`A teammate writes the ghost drain like this. What happens during a fast three-hit combo?

\`\`\`gdscript
func set_hp(current: int, maximum: int) -> void:
	hp_bar.value = current
	var t := create_tween()
	t.tween_interval(ghost_delay)
	t.tween_property(hp_ghost, "value", float(current), ghost_duration)
\`\`\``,
          options: [
            md`Three tweens run at once and fight over \`hp_ghost.value\`; the ghost stutters and may end on the wrong value.`,
            md`The ghost drains once, after the last hit.`,
            md`The ghost never moves, because tweens cannot animate \`value\`.`,
            md`Godot merges the three tweens automatically.`,
          ],
          answer: 0,
          explain: md`Each call starts a new independent tween. The first hit's tween wakes up after its delay and drains toward the first value while later tweens wait, then they all write \`value\` in turn. Keeping the tween in a variable and calling \`kill()\` before starting a new one gives exactly one drain toward the latest value.`,
        },
        { kind: 'code', file: 'ui/damage_number.gd', code: DAMAGE_NUMBER, note: md`\`spawn\` is a static function, so a hurtbox (c05) can call \`DamageNumber.spawn(get_tree().current_scene, global_position, hit.amount, hit.crit)\` without holding a reference to anything. \`set_parallel(true)\` runs the rise and the fade together; \`chain()\` makes the \`queue_free\` wait for both.` },
        { kind: 'code', file: 'ui/party_hud.gd', code: PARTY_HUD, note: md`\`health.current\` and \`health.maximum\` are the HealthComponent's values from c05; if your component names them differently, adapt these two reads. Assigning \`layer\` in code documents the stacking order next to the reason for it.` },
        {
          kind: 'steps',
          title: 'Build the party HUD',
          steps: [
            md`In the FileSystem dock create seven \`AtlasTexture\` resources in \`ui/bars/\` (**New Resource… → AtlasTexture**): atlas \`assets/ui/bars.png\`, region (0, 6 × row, 48, 6) for rows 0 to 6: \`hp_fill\`, \`mp_fill\`, \`atb_fill\`, \`atb_full\`, \`stagger_fill\`, \`empty\`, \`frame\`.`,
            md`Make \`ui/member_row.tscn\`: an \`HBoxContainer\` root with \`member_row.gd\`; a \`Label\` \`NameLabel\` (min width 26); a \`Control\` with min size 48×6 holding two \`TextureProgressBar\`s with *Full Rect* anchors, \`HpGhost\` first and \`HpBar\` second (later children draw on top). Give both *Under* \`empty\`, *Progress* \`hp_fill\`, *Over* \`frame\`, and set \`HpGhost\`'s *Tint → Progress* to a pale red such as \`#f8925e\`.`,
            md`Add \`HpLabel\`, then \`MpBar\` and \`AtbBar\` (\`TextureProgressBar\`s with \`mp_fill\` and \`atb_fill\`). Mark the six named nodes as unique names.`,
            md`Make \`ui/party_hud.tscn\`: a \`CanvasLayer\` root with \`party_hud.gd\`, a \`MarginContainer\` (anchor preset **Top Left**, margins 4) and a \`VBoxContainer\` named \`Rows\` (separation 1).`,
            md`Instance the HUD in your battle test room, drag the three party \`Character\` nodes into its *Members* array, and run the room. Let a slime hit Kai.`,
          ],
          result: md`Three rows sit in the top-left corner and stay there as the camera follows Kai. When the slime hits, Kai's green bar drops at once, a pale bar behind it holds for about a third of a second and then slides down. A number pops out of Kai and fades while rising.`,
          troubleshoot: [
            { problem: md`The HUD scrolls away with the camera.`, fix: md`It is not under a \`CanvasLayer\`, or it is a child of the camera. The HUD's root must be the CanvasLayer.` },
            { problem: md`The ghost bar is drawn over the real bar.`, fix: md`Sibling order decides drawing order. Move \`HpGhost\` above \`HpBar\` in the Scene dock so the real bar draws last.` },
            { problem: md`Bars look 1 px off or blurry.`, fix: md`An AtlasTexture region is not on whole pixels, or a bar sits at a fractional position. Use integer regions and whole-pixel positions; containers do that for you.` },
          ],
        },
        {
          kind: 'build',
          ch: {
            id: 'r05-3-build',
            title: 'ATB ready and a low-HP warning',
            goal: md`Make the HUD show two more things the player must notice without looking: a full ATB segment, and Kai being in danger.`,
            requirements: [
              md`When a member's ATB crosses a full segment (1.0 or 2.0), the bar switches to the \`atb_full\` texture for that segment and \`sfx_atb_ready\` plays once.`,
              md`Below 25% HP, the member's HP label blinks between white and red twice per second; above it, the blinking stops and the colour resets.`,
              md`Healing never shows a ghost; damage during a running drain restarts the delay.`,
            ],
            hints: [
              md`Compare \`floori(old)\` with \`floori(new)\` in \`set_atb\`: a segment completed when the integer part grows.`,
              md`For the blink, a looping tween on \`hp_label.modulate\`: \`create_tween().set_loops()\`, two \`tween_property\` steps of 0.25 s. Keep it in a variable so you can \`kill()\` it.`,
            ],
            solution: [
              {
                file: 'ui/member_row_extras.gd',
                code: gd`
extends MemberRow
## ATB "ready" feedback and a low-HP blink on top of MemberRow.

const ATB_FILL := preload("res://ui/bars/atb_fill.tres")
const ATB_FULL := preload("res://ui/bars/atb_full.tres")

@onready var ready_sfx: AudioStreamPlayer = %ReadySfx

var _atb := 0.0
var _blink: Tween


func set_atb(segments: float) -> void:
    super(segments)
    if floori(segments) > floori(_atb):
        ready_sfx.play()
    atb_bar.texture_progress = ATB_FULL if segments >= 1.0 else ATB_FILL
    _atb = segments


func set_hp(current: int, maximum: int, instant: bool = false) -> void:
    super(current, maximum, instant)
    var danger := maximum > 0 and current > 0 and current * 4 < maximum
    if danger and _blink == null:
        _blink = create_tween().set_loops()
        _blink.tween_property(hp_label, "modulate", Color("d84f3c"), 0.25)
        _blink.tween_property(hp_label, "modulate", Color.WHITE, 0.25)
    elif not danger and _blink != null:
        _blink.kill()
        _blink = null
        hp_label.modulate = Color.WHITE
`,
              },
            ],
            explain: md`Both effects are state changes detected at the moment the value changes, not every frame: crossing a segment boundary, entering or leaving the danger zone. \`current * 4 < maximum\` avoids a float division for "below 25%". The blink tween loops forever until killed, so the HUD needs no \`_process\` at all.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'r05-3-paper',
            title: 'Pixels per hit',
            type: 'compute',
            difficulty: 1,
            minutes: 4,
            statement: md`Bram has 96 max HP and is at 96. A skeleton hits him for 17. How many pixels of the 46 px fill does the real bar lose immediately? (Bar width $= \lfloor 46 \cdot hp / hp_{\max} \rfloor$.)`,
            solution: [md`Before: $\lfloor 46 \cdot 96/96 \rfloor = 46$ px.`, md`After: $\lfloor 46 \cdot 79/96 \rfloor = \lfloor 37.85 \rfloor = 37$ px.`, md`It loses $46 - 37 = 9$ px.`],
            answer: { kind: 'number', value: 9 },
          },
        },
        {
          kind: 'recall',
          prompt: md`What goes on a CanvasLayer and what stays in the world, and why?`,
          answer: md`Things tied to the screen (party bars, quest toast, minimap) go on a CanvasLayer so the camera does not move them. Things tied to a world object (damage numbers, an enemy's stagger bar, interaction prompts) stay in the world so they follow the object as the camera moves.`,
        },
        {
          kind: 'explain',
          prompt: md`Why does the ghost bar wait before draining, and why should a new hit restart the wait?`,
          model: md`The real bar changes in one frame, which the player can easily miss mid-fight. The ghost keeps the old value visible for a third of a second, so the gap between the bars shows the size of the hit at a glance. Restarting the wait on every hit makes a combo read as one block of damage that drains when the combo ends, which is the information the player needs ("that string took half my health"); draining after each hit would show several small, hard-to-judge slides.`,
        },
      ],
      cards: [
        { id: 'r05-3-c1', kind: 'concept', front: md`Ghost bar: what moves immediately and what moves later?`, back: md`The real bar jumps to the new HP at once; the pale ghost behind it waits (about 0.3 to 0.5 s), then tweens down. A new hit kills and restarts the ghost tween.` },
        { id: 'r05-3-c2', kind: 'compute', front: md`Max HP 184, bar fill 46 px. HP per pixel?`, answer: { kind: 'number', value: 4 }, back: md`$184/46 = 4$ HP per pixel.` },
        { id: 'r05-3-c3', kind: 'cloze', text: md`A TextureProgressBar draws texture_under, then texture_{{}} cropped to the value, then texture_over.`, answers: ['progress'] },
        { id: 'r05-3-c4', kind: 'compute', front: md`Cubic ease-out drain: fraction of the duration until 90% done? (3 decimals)`, answer: { kind: 'number', value: 1 - Math.cbrt(0.1), tol: 2e-3 }, back: md`$1 - 0.1^{1/3} \approx 0.536$.` },
        { id: 'r05-3-c5', kind: 'concept', front: md`Why do damage numbers live in the world rather than on the HUD's CanvasLayer?`, back: md`They belong to the thing that was hit: in the world they stay on it while the camera moves; on a CanvasLayer they would slide relative to the target.` },
      ],
    },
  ],

  // ------------------------------------------------------------------------------ problems
  problems: [
    {
      id: 'r05-p1',
      title: 'Scale for a 4K monitor',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`A 3840×2160 monitor shows the 320×180 game fullscreen with integer scaling. What is the scale, and how big are the bars?`,
      solution: [md`$3840/320 = 12$ and $2160/180 = 12$, so $k = 12$.`, md`$320 \times 12 = 3840$ and $180 \times 12 = 2160$: no bars.`],
      answer: { kind: 'number', value: 12 },
      areas: ['art'],
    },
    {
      id: 'r05-p2',
      title: 'An ultrawide window',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`A 2560×1080 ultrawide monitor runs the game fullscreen with integer scaling and *Aspect* keep. How wide is each side bar, in screen pixels?`,
      solution: [md`$\min(2560/320, 1080/180) = \min(8, 6) = 6$.`, md`The image is $1920 \times 1080$; side bars are $(2560 - 1920)/2 = 320$ px each.`],
      answer: { kind: 'number', value: 320 },
      areas: ['art'],
    },
    {
      id: 'r05-p3',
      title: 'Shop list height',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`A shop window is a \`PanelContainer\` (content margins 6) holding a \`VBoxContainer\` (separation 2) with a 10 px title label and 7 item buttons of 10 px each. How tall is the window? Does it fit above a 60 px dialogue box on a 180 px screen with 4 px gaps above, between and below?`,
      solution: [
        md`VBox: 8 children of 10 px and 7 gaps of 2 px: $80 + 14 = 94$ px. Panel: $94 + 12 = 106$ px.`,
        md`Available: $180 - 60 - 3 \times 4 = 108$ px. $106 \le 108$, so it fits, with 2 px to spare. An eighth item would not.`,
      ],
      answer: { kind: 'number', value: 106 },
      areas: ['art', 'systems'],
    },
    {
      id: 'r05-p4',
      title: 'A drain that reads as quick',
      type: 'compute',
      difficulty: 2,
      minutes: 6,
      statement: md`The ghost drains with cubic ease-out after a 0.3 s delay. The designer wants 90% of the drain visible within 0.6 s of the hit. What is the longest duration $D$ (in seconds) that meets this?`,
      hints: [md`$t_{90} = d + (1 - 0.1^{1/3}) D$.`],
      solution: [md`$0.3 + 0.536\,D \le 0.6 \iff D \le 0.3/0.536 \approx 0.560$ s.`, md`Any duration up to about 0.56 s works; 0.5 s leaves a margin.`],
      answer: { kind: 'number', value: 0.3 / (1 - Math.cbrt(0.1)), tol: 5e-3 },
      areas: ['feel'],
    },
    {
      id: 'r05-p5',
      title: 'The silent pause menu',
      type: 'debug',
      difficulty: 2,
      minutes: 6,
      statement: md`The pause menu's buttons work, but none of its sounds play. The menu root has \`process_mode = PROCESS_MODE_ALWAYS\`; the sounds are played through a shared autoload:

\`\`\`gdscript
# scripts/autoload/audio.gd (autoload "Audio")
extends Node
@onready var ui_player: AudioStreamPlayer = $UiPlayer

func play_ui(stream: AudioStream) -> void:
	ui_player.stream = stream
	ui_player.play()
\`\`\`

Why are they silent, and what is the fix?`,
      solution: [
        md`The \`Audio\` autoload has the default process mode (*Inherit*, which resolves to *Pausable* at the root). While the tree is paused its \`AudioStreamPlayer\` is paused too, so \`play()\` starts a stream that does not advance.`,
        md`Give the UI player \`process_mode = PROCESS_MODE_ALWAYS\` (or the whole Audio autoload, if it should never pause), while leaving gameplay sound players pausable so world sounds stop with the game.`,
      ],
      rubric: [md`Identifies that the autoload's player is paused by the tree pause`, md`Sets process mode on the UI player (not on everything)`, md`Notes that world sounds should still pause`],
      areas: ['godot'],
    },
    {
      id: 'r05-p6',
      title: 'The double tick',
      type: 'debug',
      difficulty: 2,
      minutes: 6,
      statement: md`Opening the shop plays the move sound once, and closing a submenu plays it again, even though the player has not moved the cursor:

\`\`\`gdscript
func open() -> void:
	show()
	first_item.grab_focus()

func _on_item_focus_entered() -> void:
	move_sfx.play()
\`\`\`

Explain the cause and give the fix.`,
      solution: [
        md`\`grab_focus()\` emits \`focus_entered\` on the newly focused control, whether the player or code moved focus, so code-driven focus changes play the move sound.`,
        md`Track the source: set a flag around code-driven focus changes (\`_silent = true; control.grab_focus(); _silent = false\`) and only play the sound when the flag is false. The signal is emitted synchronously inside \`grab_focus()\`, so the flag is set at the right time.`,
      ],
      rubric: [md`Explains that grab_focus emits focus_entered`, md`Distinguishes player and code focus changes`, md`A working silent-flag (or equivalent) fix`],
      areas: ['godot', 'art'],
    },
    {
      id: 'r05-p7',
      title: 'Design the HUD budget',
      type: 'design',
      difficulty: 2,
      minutes: 10,
      statement: md`Design the battle HUD for 320×180: three party members (name, HP number, HP/MP/ATB bars), the controlled character's limit gauge, and the targeted enemy's name and stagger bar. Give pixel positions and sizes, and explain what you leave out of the 320×180 world view and why.`,
      solution: [
        md`Party block, top-left, 4 px margin: three rows of 8 px (6 px bars + 2 px gap), each "Kai 64 [HP 48px] [MP 24px] [ATB 48px]": about $26 + 18 + 48 + 24 + 48 + 4 \times 3 \approx 176$ px wide, $3 \times 8 = 24$ px tall. The controlled character's row is highlighted rather than duplicated.`,
        md`Limit gauge: a 48×4 bar under the controlled row, so the eye finds it where it already looks. Target: centred at the top, the enemy name (8 px) and a 96×6 stagger bar, shown only while an enemy is targeted.`,
        md`Leave out persistent MP numbers and an XP bar during battle (not decision-relevant in real time). Keep the bottom 40% of the screen clear: the player character and incoming attacks live there in a top-down view, and the dialogue box needs it.`,
      ],
      rubric: [md`Concrete pixel sizes that add up within 320×180`, md`Groups information by where the player looks`, md`Justifies omissions by what the player decides in real time`, md`Keeps the play area around the character clear`],
      areas: ['art', 'combat'],
    },
    {
      id: 'r05-p8',
      title: 'Where should it live?',
      type: 'concept',
      difficulty: 1,
      minutes: 4,
      statement: md`For each, say CanvasLayer (screen) or world, and why: (a) party HP bars, (b) damage numbers, (c) an enemy's stagger bar, (d) the "Talk" prompt above an NPC, (e) the quest toast.`,
      solution: [
        md`(a) CanvasLayer: always in the same screen spot. (e) CanvasLayer: a screen message.`,
        md`(b), (c), (d) World: they describe a specific object and must stay on it as the camera moves. Put them on a high \`z_index\` so they draw above the sprites.`,
      ],
      rubric: [md`All five assigned correctly`, md`The reason is "tied to the screen" versus "tied to an object"`],
      areas: ['art'],
    },
    {
      id: 'r05-p9',
      title: 'Wire a grid on paper',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 10,
      statement: md`Write \`func neighbour(i: int, dir: Vector2i, cols: int, count: int) -> int\` that returns the index of slot $i$'s neighbour in direction \`dir\` (one of the four unit vectors, y down) in a grid of \`count\` slots filled row by row, wrapping at the edges and clamping to the last slot.`,
      solution: [
        md`Compute the row and column, wrap each with \`posmod\`, rebuild the index:

\`\`\`gdscript
func neighbour(i: int, dir: Vector2i, cols: int, count: int) -> int:
	var rows := ceili(float(count) / cols)
	var r := floori(float(i) / cols)
	var c := i % cols
	var nr := posmod(r + dir.y, rows)
	var nc := posmod(c + dir.x, cols)
	return mini(nr * cols + nc, count - 1)
\`\`\``,
        md`Test it on paper: 4 columns, 10 slots. \`neighbour(0, Vector2i.LEFT, 4, 10)\` is 3; \`neighbour(6, Vector2i.DOWN, 4, 10)\` is $\min(10, 9) = 9$; \`neighbour(9, Vector2i.DOWN, 4, 10)\` wraps to row 0: index 1.`,
      ],
      rubric: [md`Row/column from the index`, md`Wraps with posmod (not %)`, md`Clamps missing slots`, md`Correct for all four directions`],
      areas: ['systems'],
    },
  ],
};
