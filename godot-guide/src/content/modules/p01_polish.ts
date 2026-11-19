import { md, gd, type Module } from '../types';

// ------------------------------------------------------------------------------------ audio
const AUDIO = gd`
extends Node
## Audio autoload: pooled sound effects with pitch variation, and music that crossfades.

const POOL_SIZE := 8
const SFX_BUS := &"SFX"
const MUSIC_BUS := &"Music"

var _sfx_pool: Array[AudioStreamPlayer] = []
var _next_steal := 0
var _music_current: AudioStreamPlayer
var _music_previous: AudioStreamPlayer
var _music_tween: Tween


func _ready() -> void:
    # keep music and menu sounds running while the game is paused
    process_mode = Node.PROCESS_MODE_ALWAYS
    for i in POOL_SIZE:
        var player := AudioStreamPlayer.new()
        player.bus = SFX_BUS
        add_child(player)
        _sfx_pool.append(player)
    _music_current = _make_music_player()
    _music_previous = _make_music_player()


func play_sfx(stream: AudioStream, pitch_jitter := 0.08, volume_db := 0.0) -> void:
    var player := _get_free_player()
    player.stream = stream
    player.volume_db = volume_db
    # a slightly different pitch each time keeps repeated sounds from sounding mechanical
    player.pitch_scale = randf_range(1.0 - pitch_jitter, 1.0 + pitch_jitter)
    player.play()


func play_music(stream: AudioStream, fade_time := 1.0) -> void:
    if _music_current.stream == stream and _music_current.playing:
        return  # already playing this track: entering the same area twice changes nothing
    # swap roles: the old current fades out, the other player fades in with the new track
    var old := _music_current
    _music_current = _music_previous
    _music_previous = old
    _music_current.stream = stream
    _music_current.volume_db = -80.0
    _music_current.play()
    if _music_tween:
        _music_tween.kill()
    _music_tween = create_tween().set_parallel(true)
    _music_tween.tween_method(_set_player_volume.bind(_music_current), 0.0, 1.0, fade_time)
    var from := db_to_linear(_music_previous.volume_db)
    _music_tween.tween_method(_set_player_volume.bind(_music_previous), from, 0.0, fade_time)
    _music_tween.chain().tween_callback(_music_previous.stop)


func set_bus_volume(bus: StringName, linear: float) -> void:
    var index := AudioServer.get_bus_index(bus)
    AudioServer.set_bus_volume_db(index, linear_to_db(linear))
    AudioServer.set_bus_mute(index, linear <= 0.001)


func _get_free_player() -> AudioStreamPlayer:
    for player in _sfx_pool:
        if not player.playing:
            return player
    # every voice is busy: reuse them in turn (round robin), cutting one off
    var stolen := _sfx_pool[_next_steal]
    _next_steal = (_next_steal + 1) % POOL_SIZE
    return stolen


func _make_music_player() -> AudioStreamPlayer:
    var player := AudioStreamPlayer.new()
    player.bus = MUSIC_BUS
    add_child(player)
    return player


func _set_player_volume(linear: float, player: AudioStreamPlayer) -> void:
    # tween in linear amplitude, convert to decibels at the last moment
    player.volume_db = linear_to_db(maxf(linear, 0.0001))
`;

const LEVEL = gd`
extends Node2D
## Root script for an area scene (town, field, dungeon): starts the area's music.

@export var music: AudioStream
@export var fade_time := 1.0


func _ready() -> void:
    if music:
        Audio.play_music(music, fade_time)
`;

const FOOTSTEPS = gd`
extends Node
## Plays a footstep on the walk frames where a foot touches the ground.

const FOOTSTEP := preload("res://assets/audio/sfx/footstep.wav")

@export var sprite: AnimatedSprite2D
## Frames of the walk animations where a foot lands. Check them in the SpriteFrames editor.
@export var contact_frames: Array[int] = [1, 3]


func _ready() -> void:
    sprite.frame_changed.connect(_on_frame_changed)


func _on_frame_changed() -> void:
    if String(sprite.animation).begins_with("walk") and sprite.frame in contact_frames:
        Audio.play_sfx(FOOTSTEP, 0.1, -8.0)
`;

const VOLUME_SLIDER = gd`
extends HSlider
## Options-menu slider for one audio bus. The slider is linear 0..1; the bus stores decibels.

@export var bus: StringName = &"Master"


func _ready() -> void:
    min_value = 0.0
    max_value = 1.0
    step = 0.05
    # read the current bus volume before connecting, so this does not write it back
    value = db_to_linear(AudioServer.get_bus_volume_db(AudioServer.get_bus_index(bus)))
    value_changed.connect(_on_value_changed)


func _on_value_changed(v: float) -> void:
    Audio.set_bus_volume(bus, v)
`;

const ATTACK_SOUNDS = gd`
extends Node
## Example: where gameplay code calls the Audio autoload. Attach to the player for a quick test.

const SWING := preload("res://assets/audio/sfx/swing.wav")
const HIT := preload("res://assets/audio/sfx/hit.wav")
const CRIT := preload("res://assets/audio/sfx/crit.wav")


func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("attack"):
        Audio.play_sfx(SWING)


func on_hit_landed(was_crit: bool) -> void:
    # crits get their own sound and less pitch variation, so they stay recognisable
    if was_crit:
        Audio.play_sfx(CRIT, 0.03)
    else:
        Audio.play_sfx(HIT)
`;

// ---------------------------------------------------------------------------------- shaders
const SH_FLASH = gd`
shader_type canvas_item;

// Hit flash. A script animates flash_amount from 1 to 0.
uniform vec4 flash_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform float flash_amount : hint_range(0.0, 1.0) = 0.0;

void fragment() {
    // COLOR arrives as the texture sample times the node's modulate.
    COLOR.rgb = mix(COLOR.rgb, flash_color.rgb, flash_amount);
}
`;

const FLASH_SPRITE = gd`
class_name FlashSprite
extends AnimatedSprite2D
## Hit flash for any character. Needs a ShaderMaterial using hit_flash.gdshader,
## with Resource > Local to Scene ticked so every instance flashes on its own.

@export var flash_time := 0.1  ## seconds; 0.1 s is 6 frames at 60 fps

var _tween: Tween


func flash(color := Color.WHITE) -> void:
    var mat := material as ShaderMaterial
    if mat == null:
        push_warning("FlashSprite has no ShaderMaterial")
        return
    mat.set_shader_parameter("flash_color", color)
    if _tween:
        _tween.kill()  # a new hit restarts the flash instead of fighting the old tween
    _tween = create_tween()
    _tween.tween_property(mat, "shader_parameter/flash_amount", 0.0, flash_time).from(1.0)
`;

const SH_OUTLINE = gd`
shader_type canvas_item;

uniform vec4 outline_color : source_color = vec4(0.1, 0.06, 0.16, 1.0);
uniform int width : hint_range(0, 3) = 1;
uniform bool diagonals = false;

void fragment() {
    vec4 base = texture(TEXTURE, UV);
    // n = the most opaque neighbour within 'width' pixels
    float n = 0.0;
    for (int i = 1; i <= width; i++) {
        vec2 o = TEXTURE_PIXEL_SIZE * float(i);
        n = max(n, texture(TEXTURE, UV + vec2(o.x, 0.0)).a);
        n = max(n, texture(TEXTURE, UV - vec2(o.x, 0.0)).a);
        n = max(n, texture(TEXTURE, UV + vec2(0.0, o.y)).a);
        n = max(n, texture(TEXTURE, UV - vec2(0.0, o.y)).a);
        if (diagonals) {
            n = max(n, texture(TEXTURE, UV + o).a);
            n = max(n, texture(TEXTURE, UV - o).a);
            n = max(n, texture(TEXTURE, UV + vec2(o.x, -o.y)).a);
            n = max(n, texture(TEXTURE, UV + vec2(-o.x, o.y)).a);
        }
    }
    // opaque pixels keep the sprite; empty pixels next to the sprite get the outline
    vec4 outline = vec4(outline_color.rgb, n * outline_color.a);
    COLOR = mix(outline, base, base.a);
}
`;

const SH_PALETTE = gd`
shader_type canvas_item;

// Swap up to three colours. Pixel art uses few exact colours, so a small tolerance is enough.
uniform vec4 from_1 : source_color;
uniform vec4 to_1 : source_color;
uniform vec4 from_2 : source_color;
uniform vec4 to_2 : source_color;
uniform vec4 from_3 : source_color;
uniform vec4 to_3 : source_color;
uniform float tolerance : hint_range(0.0, 0.2) = 0.02;

void fragment() {
    vec4 c = texture(TEXTURE, UV);
    // else-if: a pixel is swapped at most once, so to_1 can equal from_2 safely
    if (distance(c.rgb, from_1.rgb) < tolerance) {
        c.rgb = to_1.rgb;
    } else if (distance(c.rgb, from_2.rgb) < tolerance) {
        c.rgb = to_2.rgb;
    } else if (distance(c.rgb, from_3.rgb) < tolerance) {
        c.rgb = to_3.rgb;
    }
    COLOR = c;
}
`;

const SH_DISSOLVE = gd`
shader_type canvas_item;

// noise_texture: a NoiseTexture2D with a FastNoiseLite, set in the Inspector.
uniform sampler2D noise_texture : filter_nearest, repeat_enable;
uniform float progress : hint_range(0.0, 1.0) = 0.0;
uniform float edge_width : hint_range(0.0, 0.3) = 0.08;
uniform vec4 edge_color : source_color = vec4(1.0, 0.55, 0.15, 1.0);

void fragment() {
    vec4 c = texture(TEXTURE, UV);
    float n = texture(noise_texture, UV).r;
    // a pixel survives while its noise value is at least progress
    float alive = step(progress, n);
    // survivors just above the threshold glow; sign() turns the edge off at progress 0
    float edge = alive * (1.0 - step(progress + edge_width, n)) * sign(progress);
    c.rgb = mix(c.rgb, edge_color.rgb, edge);
    c.a *= alive;
    COLOR = c;
}
`;

const SH_SCREEN = gd`
shader_type canvas_item;

// Put this on a full-screen ColorRect on a CanvasLayer. It reads what was drawn below it.
uniform sampler2D screen_texture : hint_screen_texture, filter_nearest;
uniform float amplitude_px : hint_range(0.0, 4.0) = 0.0;
uniform float wavelength_px : hint_range(2.0, 64.0) = 16.0;
uniform float speed : hint_range(0.0, 10.0) = 2.0;
uniform float vignette : hint_range(0.0, 1.0) = 0.0;

void fragment() {
    // SCREEN_PIXEL_SIZE is 1 / viewport size, so 'row' counts screen pixels
    float row = SCREEN_UV.y / SCREEN_PIXEL_SIZE.y;
    float shift_px = round(amplitude_px * sin(TAU * row / wavelength_px + TIME * speed));
    vec2 uv = SCREEN_UV + vec2(shift_px * SCREEN_PIXEL_SIZE.x, 0.0);
    vec3 c = texture(screen_texture, uv).rgb;
    // darken towards the corners: 0 in the middle, up to 'vignette' at the edges
    float d = distance(SCREEN_UV, vec2(0.5));
    c *= 1.0 - vignette * smoothstep(0.3, 0.75, d);
    COLOR = vec4(c, 1.0);
}
`;

const DISSOLVE_DEATH = gd`
extends Node
## Death effect: swap the sprite's material for a dissolve, play it, then free the owner.

const DISSOLVE := preload("res://assets/shaders/dissolve_material.tres")

@export var sprite: CanvasItem
@export var duration := 0.6


func play() -> void:
    # duplicate: every dying enemy needs its own progress value
    var mat := DISSOLVE.duplicate() as ShaderMaterial
    sprite.material = mat
    var tween := create_tween()
    tween.tween_property(mat, "shader_parameter/progress", 1.0, duration).from(0.0)
    await tween.finished
    owner.queue_free()
`;

const LOW_HP = gd`
extends ColorRect
## Low-health warning: fades a vignette in below 25% HP. Uses screen_fx.gdshader.

@export var health: HealthComponent
@export var threshold := 0.25

var _tween: Tween


func _ready() -> void:
    mouse_filter = Control.MOUSE_FILTER_IGNORE
    health.health_changed.connect(_on_health_changed)


func _on_health_changed(current: float, maximum: float) -> void:
    var target := 0.5 if current / maximum < threshold else 0.0
    if _tween:
        _tween.kill()
    _tween = create_tween()
    _tween.tween_property(material, "shader_parameter/vignette", target, 0.4)
`;

// -------------------------------------------------------------------------- particles, light
const SPARK_BURST = gd`
extends GPUParticles2D
## One-shot burst (scenes/fx/spark_burst.tscn): spawn it, it plays once, then frees itself.


func _ready() -> void:
    one_shot = true
    emitting = true
    finished.connect(queue_free)
`;

const HIT_SPARKS = gd`
extends Node
## Spawns sparks where a hit lands. Add as a child of an enemy and connect its Hurtbox.

const SPARKS := preload("res://scenes/fx/spark_burst.tscn")

@export var hurtbox: Hurtbox


func _ready() -> void:
    hurtbox.hurt.connect(_on_hurt)


func _on_hurt(_hit: HitData) -> void:
    var fx := SPARKS.instantiate() as GPUParticles2D
    # add to the level, not the enemy: the sparks must outlive an enemy that dies on this hit
    get_tree().current_scene.add_child(fx)
    fx.global_position = hurtbox.global_position
`;

const DUST = gd`
extends Node
## Raises dust at the feet while the character moves fast enough.

@export var body: CharacterBody2D
@export var dust: GPUParticles2D
@export var min_speed := 30.0  ## px/s; below this the character is barely moving


func _physics_process(_delta: float) -> void:
    # emitting = false lets live particles finish instead of vanishing
    dust.emitting = body.velocity.length() > min_speed
`;

const TORCH = gd`
extends PointLight2D
## Torch flicker: energy wanders around base_energy, driven by smooth noise.

@export var base_energy := 1.0
@export var flicker := 0.25
@export var speed := 8.0

var _noise := FastNoiseLite.new()
var _time := 0.0


func _ready() -> void:
    _noise.seed = randi()
    _noise.frequency = 1.0  # one noise "feature" per unit of input


func _process(delta: float) -> void:
    _time += delta
    # get_noise_1d returns roughly -1..1, so energy stays within base_energy ± flicker
    energy = base_energy + flicker * _noise.get_noise_1d(_time * speed)
`;

const DAY_NIGHT = gd`
extends CanvasModulate
## Day/night cycle: the tint of the whole world comes from a Gradient sampled by the hour.

@export var day_colors: Gradient  ## offset 0 = midnight, 0.5 = noon, 1 = midnight
@export var minutes_per_day := 12.0  ## real minutes for 24 game hours
@export_range(0.0, 24.0) var hour := 8.0


func _process(delta: float) -> void:
    hour = fmod(hour + delta * 24.0 / (minutes_per_day * 60.0), 24.0)
    color = day_colors.sample(hour / 24.0)
`;

const SH_WIPE = gd`
shader_type canvas_item;

uniform float progress : hint_range(0.0, 1.0) = 0.0; // 0 = clear, 1 = covered
uniform vec2 center = vec2(0.5, 0.5); // in UV: 0..1 across the screen
uniform float aspect = 1.7778; // width / height, so the circle is round

void fragment() {
    // distance from the centre, measured in screen heights
    vec2 d = (UV - center) * vec2(aspect, 1.0);
    // the farthest corner is never further than this from any centre on screen
    float max_radius = length(vec2(aspect, 1.0));
    float radius = (1.0 - progress) * max_radius;
    COLOR = vec4(0.0, 0.0, 0.0, step(radius, length(d)));
}
`;

const TRANSITIONS = gd`
extends CanvasLayer
## Transitions autoload: cover the screen, change scene behind it, uncover.

signal covered

const WIPE_SHADER := preload("res://assets/shaders/circle_wipe.gdshader")

var is_busy := false
var _rect := ColorRect.new()
var _wipe := ShaderMaterial.new()


func _ready() -> void:
    layer = 100  # above the game and the HUD
    process_mode = Node.PROCESS_MODE_ALWAYS  # keeps animating while the tree is paused
    _wipe.shader = WIPE_SHADER
    _rect.set_anchors_preset(Control.PRESET_FULL_RECT)
    _rect.color = Color.BLACK
    _rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
    _rect.visible = false
    add_child(_rect)


## style is "fade" or "circle"; center is in screen UV (0..1), used by the circle.
func go_to_scene(path: String, style := "circle", center := Vector2(0.5, 0.5), duration := 0.4) -> void:
    if is_busy:
        return  # a second door touched mid-transition must not start another one
    is_busy = true
    get_tree().paused = true  # gameplay stops; this node keeps running
    await _play(style, center, duration, true)
    covered.emit()
    get_tree().change_scene_to_file(path)
    # the new scene enters the tree at the end of this frame; wait for it
    await get_tree().process_frame
    get_tree().paused = false
    await _play(style, center, duration, false)
    is_busy = false


func _play(style: String, center: Vector2, duration: float, cover: bool) -> void:
    _rect.visible = true
    var from := 0.0 if cover else 1.0
    var to := 1.0 if cover else 0.0
    var tween := create_tween().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
    if style == "circle":
        _rect.material = _wipe
        _rect.modulate.a = 1.0
        _wipe.set_shader_parameter("center", center)
        _wipe.set_shader_parameter("aspect", _rect.size.x / _rect.size.y)
        tween.tween_property(_wipe, "shader_parameter/progress", to, duration).from(from)
    else:
        _rect.material = null
        tween.tween_property(_rect, "modulate:a", to, duration).from(from)
    await tween.finished
    if not cover:
        _rect.visible = false
`;

const DOOR = gd`
extends Area2D
## A door or room exit. Set its collision mask to the player layer (2).

@export_file("*.tscn") var target_scene: String


func _ready() -> void:
    body_entered.connect(_on_body_entered)


func _on_body_entered(body: Node2D) -> void:
    if not body.is_in_group("player"):
        return
    # the circle closes on the player: convert their position to screen UV (0..1)
    var screen_pos := body.get_global_transform_with_canvas().origin
    var center := screen_pos / get_viewport().get_visible_rect().size
    Transitions.go_to_scene(target_scene, "circle", center)
`;

export const MODULE: Module = {
  id: 'p01',
  part: 'ship',
  order: 1,
  title: 'Audio, shaders, particles and lighting',
  summary: 'Sound buses and an Audio autoload with pooled voices and music crossfades; canvas_item shaders for hit flash, outline, palette swap, dissolve and screen effects; particles, 2D lights and scene transitions.',
  relevance: md`This is the module where Shardbound stops looking like a prototype. Every hit gets a sound with a little pitch variation and a white flash from a shader, slimes come in three colours from one sprite sheet, enemies dissolve when they die, Kai kicks up dust when he runs, the dungeon is dark except for torches, and walking through a door closes a circle on the player instead of cutting to the next room. All of it is built as two autoloads (\`Audio\`, \`Transitions\`), a handful of \`.gdshader\` files and a few small scripts that the rest of the game calls.`,
  prereqs: ['c01', 'k01'],
  areas: ['art', 'feel', 'godot'],
  lessons: [
    // =========================================================================== p01-1
    {
      id: 'p01-1',
      title: 'Sound: buses, the Audio autoload and music',
      minutes: 40,
      objectives: [
        'Set up Master, Music and SFX buses and convert slider values to decibels with `linear_to_db`.',
        'Write the `Audio` autoload: a pool of AudioStreamPlayers, random pitch, and voice stealing.',
        'Crossfade music with a tween and explain why the fade runs in linear amplitude, not in dB.',
        'Call the course sounds from gameplay code: swings, hits, footsteps on animation frames, area music.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Turn the sound off in an action game and the hits stop feeling like hits. Sound tells the player that an attack connected, that a coin was collected, that an enemy is about to strike off screen. It also has problems that only show up once there is a lot of it:

- Three slimes die on the same frame and play the same 0.3 s sound three times, exactly in sync. The result is one sound, 9.5 dB louder and slightly hollow.
- The slime's death sound lives on an \`AudioStreamPlayer\` inside the slime scene. The slime calls \`queue_free()\`, and the sound stops after 2 frames.
- Kai swings 3 times per second and every swing sounds identical. After a minute it is the sound of a machine.
- The player walks from the town into the field and the town music cuts off mid-bar.
- The options menu needs separate Music and Effects volumes.

All of these are solved the same way: sound goes through one place, the \`Audio\` autoload, and through **buses** that group sounds for mixing.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'Buses, players and decibels',
          md: md`Godot mixes sound through **audio buses**, edited in the *Audio* panel at the bottom of the editor. Every bus has a volume in **decibels (dB)**, optional effects (reverb, compressor, limiter) and a *send* to another bus. All buses end at **Master**, which goes to the speakers.

An \`AudioStreamPlayer\` plays one \`AudioStream\` (a \`.wav\` or \`.ogg\` file) into the bus named by its \`bus\` property, with its own \`volume_db\` and \`pitch_scale\`. \`AudioStreamPlayer2D\` adds panning and fading with distance from the camera. On a 320×180 screen almost everything that makes a sound is on screen, so Shardbound uses the plain \`AudioStreamPlayer\` for nearly everything.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Decibels',
          md: md`A decibel value describes a *ratio* of amplitudes: $\text{dB} = 20 \log_{10}(\text{linear})$. Godot calls this \`linear_to_db(x)\`, and the inverse is \`db_to_linear(db)\`.

- 0 dB means "unchanged" (a factor of 1).
- −6 dB is about half the amplitude.
- −20 dB is a tenth.
- −80 dB is treated as silence.

Doubling the number of identical sounds doubles the amplitude, which is +6 dB. Hearing works roughly in ratios, which is why mixers use dB.`,
        },
        {
          kind: 'derive',
          title: 'Slider value to bus volume',
          goal: md`An options-menu slider goes from 0 to 1. Find the bus volume in dB for a slider value $v$, and check what a slider at 0.5 and at 0.1 does.`,
          steps: [
            { md: md`The slider value is a **linear amplitude factor**: 1 means full volume, 0.5 means half the amplitude. The bus stores dB, so convert: $$\text{volume\_db} = 20 \log_{10} v.$$` },
            {
              md: md`At $v = 0.5$: $20 \log_{10} 0.5 = 20 \times (-0.301) = -6.02$ dB. At $v = 0.1$: $20 \times (-1) = -20$ dB.`,
              choose: {
                prompt: md`What happens at $v = 0$?`,
                options: [md`$\log_{10} 0$ is $-\infty$, so the bus should be muted explicitly`, md`It gives 0 dB, full volume`, md`It gives −80 dB exactly`],
                answer: 0,
                explain: md`The logarithm of 0 is minus infinity. \`set_bus_volume\` in the listing below also calls \`AudioServer.set_bus_mute(index, true)\` when the slider is near 0, so "0" means silent without relying on how $-\infty$ is handled.`,
              },
            },
            { md: md`The common bug is the shortcut \`AudioServer.set_bus_volume_db(index, slider.value)\`: it sets the bus to between 0 and 1 **dB**, which is between "unchanged" and "slightly louder". The slider appears to do nothing.` },
          ],
          takeaway: md`Sliders and tweens work in linear amplitude; convert with \`linear_to_db\` at the moment you write \`volume_db\`.`,
        },
        {
          kind: 'assets',
          ids: ['sfx_swing', 'sfx_hit', 'sfx_crit', 'sfx_footstep', 'sfx_coin', 'music_town', 'music_field', 'music_battle'],
          note: md`The sound effects are short WAV files; the music tracks are made to loop. In the starter project they are under \`assets/audio/\`.`,
        },
        {
          kind: 'steps',
          title: 'Buses, looping music and the autoload',
          steps: [
            md`Open the **Audio** panel at the bottom of the editor. Click **Add Bus** twice and rename the new buses \`Music\` and \`SFX\` (double-click the name). Check that each one's send (the drop-down at the bottom of the bus strip) says **Master**. Godot saves the layout to \`default_bus_layout.tres\` automatically.`,
            md`Select a music file in the **FileSystem** dock, open the **Import** dock (next to *Scene*), turn on looping (for a WAV: *Edit → Loop Mode → Forward*; for an OGG: *Loop*), and click **Reimport**. Repeat for the three music tracks.`,
            md`Create \`scripts/autoload/audio.gd\` with the listing below.`,
            md`Open **Project → Project Settings → Globals → Autoload**, pick the script in *Path*, set the name to \`Audio\` and click **Add**. Any script can now call \`Audio.play_sfx(...)\`.`,
            md`Quick test: attach the example script further down to the player, run the game (**F5**) and press attack. Then open the Audio panel while the game runs: the SFX bus meter moves when Kai swings.`,
          ],
          result: md`Every swing plays a slightly different version of the swing sound, routed through the SFX bus. Muting the SFX bus in the Audio panel (the speaker icon on the strip) silences it while music, once added, keeps playing.`,
          troubleshoot: [
            { problem: md`\`Identifier "Audio" not declared in the current scope\`.`, fix: md`The autoload is not registered, or its name is not exactly \`Audio\`. Check **Project Settings → Globals → Autoload**.` },
            { problem: md`Sounds play on Master and the SFX bus does nothing.`, fix: md`The bus name in \`SFX_BUS\` must match the bus name exactly, including case. A player whose \`bus\` names a bus that does not exist falls back to Master.` },
            { problem: md`Music stops after one play-through.`, fix: md`Looping is an import setting: set it in the Import dock and click **Reimport**. Changing it on the player does nothing.` },
          ],
        },
        {
          kind: 'text',
          md: md`### Designing the autoload

**Where does a sound live?** If each slime has its own \`AudioStreamPlayer\`, the sound dies with the slime and retriggering it cuts off the previous play. A single long-lived owner fixes both: an autoload is created once at startup and never freed.

**How many sounds at once?** Each playing sound needs a player. Creating one per sound and freeing it afterwards works but allocates nodes during combat. A **pool** creates a fixed number of players up front (\`POOL_SIZE\`) and reuses whichever is idle. When all are busy, the pool **steals** one. Losing one of 9 overlapping hit sounds is inaudible; a mixer with 40 simultaneous hits is mud.

**Why the random pitch?** \`pitch_scale\` changes playback speed: 1.08 plays 8% faster and higher. A random factor in $[0.92, 1.08]$ makes each repetition slightly different and breaks up the exact-sync problem from the top of the lesson. Keep it small for sounds that carry information (a critical hit should stay recognisable) and larger for footsteps.

**Why two music players?** A crossfade needs the old track fading out while the new one fades in, so two players take turns.`,
        },
        { kind: 'code', file: 'scripts/autoload/audio.gd', code: AUDIO, note: md`\`_set_player_volume.bind(player)\` makes a Callable that calls \`_set_player_volume(value, player)\`: the tween supplies the first argument each frame, \`bind\` supplies the rest. \`set_parallel(true)\` runs the fade-in and fade-out together; \`chain()\` makes the final callback wait for both.` },
        {
          kind: 'viz',
          viz: { type: 'ship.mixer' },
          task: md`Set \`POOL_SIZE\` to 4 and press **8 hits in 0.3 s**: watch voices get stolen (red border). Then start the town music, switch to the field with the tween set to **volume_db** and listen; switch back with **amplitude**. Which fade sounds like a fade?`,
          caption: md`The grid is the SFX pool: each cell is an \`AudioStreamPlayer\`, the bar is the time left in its sound (longer when the pitch is lower). The plot shows the two music players' linear volume during a crossfade with the current settings; the marker follows a fade you start. A tween on \`volume_db\` from −80 to 0 dB spends most of its time below 1% amplitude and then jumps.`,
        },
        {
          kind: 'check',
          q: md`A slime scene has a child \`AudioStreamPlayer\` that plays its death sound, and its death code is:

\`\`\`gdscript
func die() -> void:
	get_node("DeathSound").play()
	queue_free()
\`\`\`

What does the player hear?`,
          options: [md`Almost nothing: the player node is freed with the slime at the end of the frame, which stops the sound`, md`The full death sound, because sounds finish once started`, md`The sound twice`, md`An error, because \`play()\` cannot be called before \`queue_free()\``],
          answer: 0,
          explain: md`\`queue_free()\` frees the slime and all its children at the end of the frame, including the player that was playing. Playing through the \`Audio\` autoload avoids this because the autoload's players are never freed.`,
        },
        {
          kind: 'numeric',
          q: md`\`play_sfx\` uses \`pitch_jitter = 0.08\`. A semitone is a pitch ratio of $2^{1/12}$. How many semitones above normal is the highest possible pitch, \`pitch_scale = 1.08\`?`,
          answer: { kind: 'number', value: 12 * Math.log2(1.08), tol: 0.01 },
          hints: [md`Semitones $= 12 \log_2(\text{ratio})$.`],
          explain: md`$12 \log_2 1.08 = 12 \times 0.111 = 1.33$ semitones. So ±8% is about ±1.3 semitones: enough to vary, not enough to sound like a different sound.`,
        },
        {
          kind: 'derive',
          title: 'Why the crossfade runs in amplitude',
          goal: md`Fade a track in over 1 s. Compare tweening \`volume_db\` from −80 to 0 dB with tweening the linear amplitude from 0 to 1.`,
          steps: [
            { md: md`**Tween in dB.** At time $t$ (seconds) the volume is $-80 + 80t$ dB. Halfway, at $t = 0.5$, that is −40 dB, an amplitude of $10^{-40/20} = 0.01$.` },
            {
              md: md`**Tween in amplitude.** The amplitude is $t$. Halfway it is 0.5, which is −6 dB.`,
              choose: {
                prompt: md`At $t = 0.9$ s, the dB tween is at −8 dB. What amplitude is that, and what does the listener hear over the 1 s fade?`,
                options: [md`About 0.4: near silence for most of the fade, then a sudden rise in the last 0.1–0.2 s`, md`About 0.9: a smooth rise all the way`, md`About 0.01: still silent`],
                answer: 0,
                explain: md`$10^{-8/20} \approx 0.40$. The dB tween is quiet until the very end and then jumps, so it sounds like a late cut. The amplitude tween is audible from the start and rises smoothly.`,
              },
            },
            { md: md`During a linear crossfade the two tracks have amplitudes $t$ and $1-t$. In the middle both are 0.5. For unrelated music the powers add, so the total is $\sqrt{0.5^2 + 0.5^2} = 0.71$, a dip of 3 dB. That dip is usually fine for a 1 s area change. An **equal-power** fade ($\sin$ and $\cos$ of $t \cdot \pi/2$) keeps the total at 1 if you want it perfectly level.` },
          ],
          takeaway: md`Animate volume in linear amplitude and convert with \`linear_to_db\` when writing \`volume_db\`. The figure's dashed line is the total power: watch the 0.71 dip in the middle of a crossfade.`,
        },
        {
          kind: 'text',
          md: md`### Calling it from the game

Gameplay code never touches players or buses; it asks the autoload. Sounds are \`preload\`ed into constants, so they load with the script instead of in the middle of a fight. Area music is a property of the area: each area scene's root script names its track and starts it in \`_ready()\`. Walking from the town into the field loads the field scene, whose \`_ready()\` calls \`play_music\`, and the autoload crossfades. Re-entering the same area does nothing, because \`play_music\` returns early when that stream is already playing.`,
        },
        { kind: 'code', file: 'scripts/attack_sounds.gd', code: ATTACK_SOUNDS, note: md`In the real game the swing sound belongs in the attack state from k01 and the hit sounds in the Hurtbox handler; this script only shows the calls.` },
        { kind: 'code', file: 'scripts/level.gd', code: LEVEL },
        {
          kind: 'build',
          ch: {
            id: 'p01-1-build',
            title: 'Wire up Shardbound\'s sound',
            goal: md`Give the slice its basic soundscape through the \`Audio\` autoload: attacks, hits, footsteps, area music and volume sliders.`,
            requirements: [
              md`Swings, hits and crits each play a sound through the SFX bus; spamming attack never cuts the music.`,
              md`Footsteps play on the frames where Kai's feet touch the ground, quieter than combat sounds and with ±10% pitch.`,
              md`Walking from the town to the field crossfades the music over about 1 s, with no gap and no jump in volume.`,
              md`Re-entering an area whose music is already playing does not restart the track.`,
              md`An options panel has Master, Music and SFX sliders that work immediately and reach full silence at 0.`,
            ],
            hints: [
              md`For footsteps, connect to the \`AnimatedSprite2D\`'s \`frame_changed\` signal and check \`sprite.frame\`. Find the contact frames by stepping through \`walk_down\` in the SpriteFrames editor.`,
              md`Give every area scene's root the \`level.gd\` script and set its \`music\` in the Inspector.`,
              md`The slider script reads the current bus volume in \`_ready()\` before connecting \`value_changed\`, so opening the menu does not reset the volume.`,
            ],
            solution: [
              { file: 'scripts/footsteps.gd', code: FOOTSTEPS },
              { file: 'ui/volume_slider.gd', code: VOLUME_SLIDER },
              { file: 'scripts/level.gd', code: LEVEL },
            ],
            explain: md`All three scripts are thin: the decisions (pooling, pitch, crossfading, dB conversion) live in the autoload, so changing how sound works later (adding a limiter, ducking music during dialogue) means editing one file. The footstep component reads the animation instead of a timer, so the steps stay in sync when the walk speed or the animation's FPS changes.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'p01-1-paper',
            title: 'How many voices does a fight need?',
            type: 'compute',
            difficulty: 2,
            minutes: 8,
            statement: md`In a busy fight, the three party members each swing every 0.4 s (swing sound 0.25 s long) and every swing lands, playing a 0.3 s hit sound. Six enemies each attack once per second with a 0.3 s sound. On average, how many sounds are playing at the same moment? (Average number playing = rate × duration, summed over sound types.)`,
            hints: [md`Swings per second: $3 / 0.4$.`],
            solution: [
              md`Swings: $3 / 0.4 = 7.5$ per second, each 0.25 s, so $7.5 \times 0.25 = 1.875$ playing on average.`,
              md`Hits: also 7.5 per second, each 0.3 s: $2.25$.`,
              md`Enemy attacks: 6 per second, each 0.3 s: $1.8$.`,
              md`Total: $1.875 + 2.25 + 1.8 = 5.925$. A pool of 8 covers the average with room for bursts; when a burst exceeds it, stealing drops the oldest sounds, which are the least noticeable.`,
            ],
            answer: { kind: 'number', value: 5.925 },
          },
        },
        {
          kind: 'recall',
          prompt: md`List what the \`Audio\` autoload does and why it is an autoload instead of a player inside each scene.`,
          answer: md`It owns a pool of SFX players (reused, with stealing when all are busy), randomises pitch, plays music on two players that crossfade with a tween, and sets bus volumes from linear values with \`linear_to_db\`. As an autoload it is never freed, so sounds outlive the nodes that trigger them, and there is one place to limit and mix sound.`,
        },
        {
          kind: 'explain',
          prompt: md`Why randomise pitch, and why less for a critical hit than for a footstep?`,
          model: md`Identical repeated sounds are recognised as a loop and become tiring; a small random pitch change makes each one sound like a new event and stops simultaneous copies from adding into one loud, phasey sound. The amount is a trade-off with recognisability: footsteps carry no information, so ±10% is fine, but a crit sound is a signal the player learns, and if it varies too much it starts to overlap with the normal hit sound, so it gets ±3%.`,
        },
      ],
      cards: [
        { id: 'p01-1-c1', kind: 'cloze', text: md`To set a bus from a 0..1 slider: \`AudioServer.set_bus_volume_db(index, {{}}(value))\`.`, answers: ['linear_to_db'] },
        { id: 'p01-1-c2', kind: 'compute', front: md`Linear volume 0.25 in dB?`, answer: { kind: 'number', value: 20 * Math.log10(0.25), tol: 0.01 }, back: md`$20 \log_{10} 0.25 = -12.04$ dB: each halving is about −6 dB.` },
        { id: 'p01-1-c3', kind: 'concept', front: md`Why does a sound on a child \`AudioStreamPlayer\` cut off when an enemy dies?`, back: md`\`queue_free()\` frees the enemy and its children, including the player. Play one-shot sounds through the \`Audio\` autoload, which is never freed.` },
        { id: 'p01-1-c4', kind: 'concept', front: md`Why tween music volume in linear amplitude instead of \`volume_db\`?`, back: md`A linear tween in dB stays near silence for most of the fade and then jumps at the end. Tween amplitude 0→1 and convert with \`linear_to_db\`.` },
        { id: 'p01-1-c5', kind: 'concept', front: md`What does an SFX pool do when every player is busy?`, back: md`It steals one (round robin in \`audio.gd\`), cutting it off to play the new sound. With 8 voices the stolen sound is rarely noticed; unlimited voices turn a big fight into mud.` },
      ],
    },
    // =========================================================================== p01-2
    {
      id: 'p01-2',
      title: 'Shaders for sprites: flash, outline, palette swap, dissolve',
      minutes: 45,
      objectives: [
        'Read a `canvas_item` fragment shader: `TEXTURE`, `UV`, `COLOR`, `TIME` and uniforms with hints.',
        'Write a hit-flash shader and drive it from GDScript with a tween on `shader_parameter/flash_amount`.',
        'Build outline, palette-swap and dissolve shaders, and explain each line.',
        'Apply a screen-space effect with `hint_screen_texture` on a full-screen ColorRect.',
        'Recognise Godot 3 shader names (`hint_color`, `SCREEN_TEXTURE`) in old tutorials and translate them.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A hit in Shardbound turns the enemy pure white for 6 frames. A blue slime and a red slime share one sprite sheet. A dying skeleton burns away from the edges instead of vanishing. When Kai is low on health the screen darkens at the corners. None of these needs new art: each is a few lines of **shader** code that changes how existing sprites are drawn.

\`modulate\` cannot do these, because it *multiplies* colours: it can tint and darken, but it cannot turn a dark-blue tunic white, recolour only the tunic, or remove pixels in a pattern. A shader decides each pixel's colour with arbitrary code.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'A canvas_item shader',
          md: md`A **shader** is a small program the GPU runs for every pixel of a sprite, all in parallel. A 2D shader starts with \`shader_type canvas_item;\` and usually defines \`void fragment()\`, which runs once per pixel and sets that pixel's output colour. Inside \`fragment()\`:

- \`UV\` is the position inside the texture, $(0,0)$ at the top-left corner and $(1,1)$ at the bottom-right.
- \`TEXTURE\` is the sprite's texture; \`texture(TEXTURE, UV)\` reads (samples) its colour at \`UV\`.
- \`TEXTURE_PIXEL_SIZE\` is the size of one texel in UV units: \`1.0 / texture size\`.
- \`COLOR\` arrives as the texture colour times the node's \`modulate\`; whatever you write to it is drawn.
- \`TIME\` is seconds since the engine started, for animation.
- **Uniforms** are inputs set from the Inspector or GDScript: \`uniform float flash_amount : hint_range(0.0, 1.0) = 0.0;\`. The **hint** controls the Inspector widget: \`source_color\` shows a colour picker, \`hint_range\` a slider.

Colours are \`vec4\` with components 0.0 to 1.0, not 0 to 255.`,
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Godot 3 tutorials',
          md: md`Many shader tutorials online are for Godot 3 and use names that no longer exist. \`hint_color\` is now \`source_color\`. The \`SCREEN_TEXTURE\` built-in is gone: declare \`uniform sampler2D screen_texture : hint_screen_texture;\` and sample that. From GDScript, \`set_shader_param\` is now \`set_shader_parameter\`, and the property path for tweens is \`shader_parameter/name\`, not \`shader_param/name\`.`,
        },
        {
          kind: 'steps',
          title: 'Add a shader to Kai',
          steps: [
            md`Open \`scenes/player.tscn\` and select the \`AnimatedSprite2D\`. In the Inspector, open **CanvasItem → Material** and choose **New ShaderMaterial**.`,
            md`Click the new ShaderMaterial to expand it, then in its **Shader** slot choose **New Shader**. Set *Type* to **Canvas Item**, the path to \`assets/shaders/hit_flash.gdshader\` (create the \`shaders\` folder) and click **Create**. The shader editor opens at the bottom.`,
            md`Replace the template with the listing below and save (**Ctrl+S**). The uniforms now appear in the Inspector under the material's **Shader Parameters**.`,
            md`Drag the *Flash Amount* slider in the Inspector: Kai turns white in the editor viewport. Set it back to 0.`,
            md`Expand the material's **Resource** section and tick **Local to Scene**. Do the same on every enemy scene's material. Each instance then gets its own copy, so flashing one slime does not flash all of them.`,
          ],
          result: md`Dragging *Flash Amount* fades Kai to the flash colour and back, and changing *Flash Color* with the colour picker changes the flash.`,
          troubleshoot: [
            { problem: md`The shader editor shows an error on the \`uniform\` line.`, fix: md`Check for Godot 3 names (\`hint_color\`) and a missing semicolon. The editor underlines the first error; fix that one first, since later errors are often caused by it.` },
            { problem: md`Shader Parameters do not appear in the Inspector.`, fix: md`The shader did not compile, or you are looking at a different material. Errors are listed in the shader editor's bottom bar.` },
            { problem: md`Hitting one slime flashes every slime.`, fix: md`They share one material. Tick **Resource → Local to Scene** on the material in the slime scene.` },
          ],
        },
        { kind: 'code', file: 'assets/shaders/hit_flash.gdshader', lang: 'shader', code: SH_FLASH },
        {
          kind: 'text',
          md: md`\`mix(a, b, t)\` is linear interpolation: $a + (b - a)\,t$. With \`flash_amount = 0\` the colour is unchanged; with 1 it is the flash colour; in between it blends. Only \`.rgb\` is changed, so transparent pixels around the sprite stay transparent and the flash keeps Kai's silhouette. Because \`COLOR\` already includes \`modulate\`, fading a sprite with \`modulate.a\` still works with the shader on.

The shader holds no timing. A script animates \`flash_amount\` from 1 down to 0 over \`flash_time\`, and a tween is the right tool: it runs for a fixed time, and a second hit can kill it and start a new one.`,
        },
        { kind: 'code', file: 'scripts/flash_sprite.gd', code: FLASH_SPRITE, note: md`Attach this script to the \`AnimatedSprite2D\` of the player and of every enemy, then call \`sprite.flash()\` from the Hurtbox handler you wrote in k01: \`hurtbox.hurt.connect(func(_hit: HitData) -> void: sprite.flash())\`.` },
        {
          kind: 'viz',
          viz: { type: 'ship.shaders', effect: 'flash' },
          task: md`Click the figure and press **J** a few times. Then set \`flash_time\` to 0.03 s and to 0.3 s. Hover a dark pixel and a light pixel at \`flash_amount\` 0.5 and compare \`TEXTURE\` with \`COLOR\`.`,
          caption: md`The figure runs the fragment function on every pixel of Kai's current frame, as the GPU would. At 0.03 s (2 frames) the flash is easy to miss; at 0.3 s it hides the hit animation. 0.08–0.12 s (5–7 frames) reads clearly without covering the art.`,
        },
        {
          kind: 'numeric',
          q: md`A pixel has \`COLOR.rgb = (0.2, 0.4, 0.8)\`. The flash colour is white and \`flash_amount = 0.25\`. What is the output colour? Enter three numbers.`,
          answer: { kind: 'vector', value: [0.4, 0.55, 0.85] },
          inputHint: 'r, g, b',
          explain: md`Each channel is $c + (1 - c) \times 0.25$: $0.2 + 0.8 \times 0.25 = 0.4$, $0.4 + 0.6 \times 0.25 = 0.55$, $0.8 + 0.2 \times 0.25 = 0.85$. Dark channels move further than bright ones, which is why the flash reads as "brighter" everywhere.`,
        },
        {
          kind: 'text',
          md: md`### Outline

An outline is drawn on *empty* pixels that sit next to the sprite. The shader cannot ask "am I on the edge?", but it can sample the texture at the neighbouring texels: one texel right is \`UV + vec2(TEXTURE_PIXEL_SIZE.x, 0.0)\`. If any neighbour is opaque and this pixel is not, this pixel is outline. Taking the \`max\` of the neighbours' alpha computes "is any neighbour opaque" without \`if\` statements.

Two limits come from where the shader runs. It only runs on pixels of the sprite's rectangle (its quad), so an outline cannot extend beyond the frame: leave at least 1 px of empty border in each frame, as the course sprites do. And with a sprite sheet, \`UV\` covers the whole sheet, so a frame whose art touches its edge would sample the neighbouring frame. The empty border avoids that too.`,
        },
        { kind: 'code', file: 'assets/shaders/outline.gdshader', lang: 'shader', code: SH_OUTLINE },
        {
          kind: 'text',
          md: md`### Palette swap

Pixel art uses a handful of exact colours. To make a red slime from the green one, replace each green with a red. The shader compares each pixel with \`from_1\`, \`from_2\` and \`from_3\` and replaces it with the matching \`to_\` colour. \`distance\` measures how far apart two colours are as 3D points; a tolerance of 0.02 allows for tiny rounding differences in the imported texture without catching neighbouring shades. Save three \`ShaderMaterial\` resources (\`slime_green.tres\`, \`slime_blue.tres\`, \`slime_red.tres\`) and pick one per enemy variant.`,
        },
        { kind: 'code', file: 'assets/shaders/palette_swap.gdshader', lang: 'shader', code: SH_PALETTE },
        {
          kind: 'text',
          md: md`### Dissolve

A dissolve removes pixels in a random-looking order. Give every pixel a fixed random number from a **noise texture**, then hide the pixels whose number is below \`progress\`. As \`progress\` goes from 0 to 1, more and more pixels disappear, and because noise is smooth, they disappear in blobs instead of single pixels. The pixels just above the threshold are about to go; colouring them \`edge_color\` makes a burning edge.

In the Inspector, set **Shader Parameters → Noise Texture** to a **New NoiseTexture2D**, give it a **New FastNoiseLite** as its *Noise*, and set its width and height to 32 so each sprite pixel gets one noise value.`,
        },
        { kind: 'code', file: 'assets/shaders/dissolve.gdshader', lang: 'shader', code: SH_DISSOLVE },
        {
          kind: 'viz',
          viz: { type: 'ship.shaders', start: 'outline' },
          task: md`Try each effect. **Outline**: compare 4 and 8 neighbours at width 1 around the feet and hair. **Palette**: click Kai's two most common colours and turn the hue. **Dissolve**: press **J**, then change the noise scale and play it again.`,
          caption: md`The right-hand panel shows the result at the size the player sees. An 8-neighbour outline fills the diagonal notches and reads as a thicker line; 4 neighbours keeps the classic 1-px pixel-art outline. The probe shows, for the dissolve, each pixel's noise value against \`progress\`.`,
        },
        {
          kind: 'check',
          q: md`Every slime instance uses the same \`slime.tscn\`, whose sprite has a ShaderMaterial with \`hit_flash.gdshader\`. You hit one slime and all of them flash. What fixes it?`,
          options: [md`Tick **Local to Scene** on the material (or duplicate it in code), so each instance has its own uniforms`, md`Use \`modulate\` instead of the shader`, md`Call \`flash()\` from \`_physics_process\``, md`Give each slime a different \`flash_color\``],
          answer: 0,
          explain: md`Uniform values belong to the **material**. Instances of a scene share its resources unless the resource is marked local to scene, so setting \`flash_amount\` on one sets it for all. The dissolve script in the build below calls \`duplicate()\` for the same reason.`,
        },
        {
          kind: 'text',
          md: md`### Screen-space effects

Some effects apply to the whole screen: a heat shimmer, an underwater wobble, a red vignette at low health. Put a \`ColorRect\` covering the screen on a \`CanvasLayer\` above the game, and give it a shader that reads the **screen texture**, the image drawn so far, with \`hint_screen_texture\`. \`SCREEN_UV\` is this pixel's position on screen (0 to 1), and \`SCREEN_PIXEL_SIZE\` is one screen pixel in those units. The shader below combines a horizontal wobble (measured in whole pixels, so the art stays crisp) with a vignette. Both default to 0, so the rect can stay in the scene and scripts only raise the uniforms when needed.`,
        },
        { kind: 'code', file: 'assets/shaders/screen_fx.gdshader', lang: 'shader', code: SH_SCREEN },
        {
          kind: 'derive',
          title: 'How fast does the wobble move?',
          goal: md`The shift of row $y$ at time $t$ is $A \sin\!\left(2\pi\,y/\lambda + s\,t\right)$, with amplitude $A$, wavelength $\lambda$ (pixels) and \`speed\` $s$. Find how fast the wave crests travel, in pixels per second, and the period.`,
          steps: [
            { md: md`A crest is where the sine's argument is a fixed value: $2\pi\,y/\lambda + s\,t = \text{const}$.` },
            {
              md: md`Solve for $y$: $y = \text{const}' - \dfrac{\lambda s}{2\pi}\,t$. So the crest moves by $\lambda s / 2\pi$ pixels per second.`,
              choose: {
                prompt: md`Which way does it move?`,
                options: [md`Up the screen (toward smaller $y$)`, md`Down the screen`, md`It does not move`],
                answer: 0,
                explain: md`$y$ decreases as $t$ grows, and in Godot $y$ points down, so the waves rise. Use $-s$ (or $-$TIME) for falling waves.`,
              },
            },
            { md: md`The pattern repeats when $s\,t$ grows by $2\pi$, a period of $2\pi/s$ seconds. With $\lambda = 16$ px and $s = 2$: crests move at $16 \times 2 / 2\pi \approx 5.1$ px/s, and the period is 3.14 s.` },
          ],
          takeaway: md`Uniforms in pixels and seconds make shader parameters tunable by feel: "a 16-pixel wave rising 5 px per second" is something you can picture before you run it.`,
        },
        {
          kind: 'check',
          q: md`Which line is valid in a Godot 4 shader?`,
          options: [
            md`\`uniform sampler2D screen_texture : hint_screen_texture, filter_nearest;\``,
            md`\`uniform vec4 tint : hint_color = vec4(1.0);\``,
            md`\`vec4 c = texture(SCREEN_TEXTURE, SCREEN_UV);\``,
            md`\`uniform float amount : hint_range(0, 1) = 0;\` with \`set_shader_param("amount", 1.0)\` in GDScript`,
          ],
          answer: 0,
          explain: md`\`hint_color\` became \`source_color\`, \`SCREEN_TEXTURE\` became a \`hint_screen_texture\` uniform, and \`set_shader_param\` became \`set_shader_parameter\`. The first line is the Godot 4 way to read the screen, with nearest filtering for pixel art.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'p01-2-build',
            title: 'A shader kit for Shardbound',
            goal: md`Use the four shaders in the game: hit flash on every character, slime colour variants, a dissolving death, and a low-health warning on screen.`,
            requirements: [
              md`Kai and every enemy flash white for about 0.1 s when hurt; each instance flashes independently, and a second hit during a flash restarts it.`,
              md`Three slime variants (green, blue, red) use one sprite sheet and three palette-swap materials.`,
              md`Enemies dissolve over 0.6 s with a glowing edge when they die, then are removed from the scene tree.`,
              md`Below 25% HP the screen corners darken over 0.4 s, and they clear again after healing.`,
              md`No Godot 3 names anywhere (\`hint_color\`, \`SCREEN_TEXTURE\`, \`shader_param\`).`,
            ],
            hints: [
              md`A sprite has one material. The death script swaps the flash material for a duplicated dissolve material at the moment of death.`,
              md`Save the dissolve ShaderMaterial (with its NoiseTexture2D) as \`assets/shaders/dissolve_material.tres\` so the script can \`preload\` it.`,
              md`The vignette rect goes on a \`CanvasLayer\` in the main scene, below the HUD's layer if you want the HUD unaffected, and needs \`health\` set to Kai's \`HealthComponent\` in the Inspector.`,
            ],
            solution: [
              { file: 'scripts/flash_sprite.gd', code: FLASH_SPRITE },
              { file: 'scripts/dissolve_death.gd', code: DISSOLVE_DEATH },
              { file: 'ui/low_hp_overlay.gd', code: LOW_HP },
            ],
            explain: md`Each script animates one uniform with a tween and leaves the drawing to the shader. \`dissolve_death.gd\` awaits the tween's \`finished\` signal before freeing the enemy, so the effect is never cut short; its \`owner\` is the enemy scene's root because the node is saved inside that scene. The overlay listens to \`health_changed\` instead of polling health every frame.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'p01-2-paper',
            title: 'The flash that never fades',
            type: 'debug',
            difficulty: 2,
            minutes: 6,
            statement: md`This code, ported from a Godot 3 tutorial, runs without errors. The sprite turns white on the first hit and never returns to normal. Find the bug.

\`\`\`gdscript
func flash() -> void:
	var mat := material as ShaderMaterial
	mat.set_shader_parameter("flash_amount", 1.0)
	var tween := create_tween()
	tween.tween_property(mat, "shader_param/flash_amount", 0.0, 0.1)
\`\`\``,
            hints: [md`Which of the two property names is Godot 4's?`],
            solution: [
              md`The first line uses Godot 4's \`set_shader_parameter\` and sets \`flash_amount\` to 1. The tween uses the Godot 3 property path \`shader_param/flash_amount\`, which does not exist on a Godot 4 ShaderMaterial, so it animates nothing (Godot prints a warning in the Debugger's Errors tab).`,
              md`Fix: \`tween.tween_property(mat, "shader_parameter/flash_amount", 0.0, 0.1)\`. With \`.from(1.0)\` the first line becomes unnecessary.`,
            ],
            rubric: [md`Identifies \`shader_param/\` as the Godot 3 path`, md`Gives the \`shader_parameter/\` fix`, md`Explains why the sprite stays white (the 1.0 is set but never animated back)`],
          },
        },
        {
          kind: 'recall',
          prompt: md`What do \`UV\`, \`TEXTURE_PIXEL_SIZE\`, \`COLOR\` and \`SCREEN_UV\` hold in a canvas_item fragment shader?`,
          answer: md`\`UV\`: this pixel's position in the texture, 0..1. \`TEXTURE_PIXEL_SIZE\`: one texel in UV units (1 / texture size), used to sample neighbours. \`COLOR\`: on input the texture colour times modulate; on output the colour drawn. \`SCREEN_UV\`: this pixel's position on screen, 0..1, used with a \`hint_screen_texture\` sampler.`,
        },
        {
          kind: 'explain',
          prompt: md`Why make slime variants with a palette-swap shader instead of three recoloured sprite sheets?`,
          model: md`One sheet means one set of animations to draw, fix and import; a change to the slime's hop animation reaches every variant at once. Variants become data (a material with six colours), so making a fourth costs a minute, and the same shader gives status effects (a poisoned tint) and party colours. The cost is a little GPU work per pixel, which is negligible at 320×180, and the limit that the variants must share their shapes.`,
        },
      ],
      cards: [
        { id: 'p01-2-c1', kind: 'cloze', text: md`Godot 4 colour uniform hint: \`uniform vec4 tint : {{}};\``, answers: ['source_color'] },
        { id: 'p01-2-c2', kind: 'cloze', text: md`Tween a shader uniform: \`tween.tween_property(mat, "{{}}/flash_amount", 0.0, 0.1)\`.`, answers: ['shader_parameter'] },
        { id: 'p01-2-c3', kind: 'concept', front: md`How does an outline shader know a pixel is on the edge?`, back: md`It samples the neighbours at \`UV ± TEXTURE_PIXEL_SIZE\`. A transparent pixel with an opaque neighbour gets the outline colour; \`max\` of the neighbours' alpha computes "any neighbour opaque".` },
        { id: 'p01-2-c4', kind: 'concept', front: md`How does a dissolve shader decide which pixels disappear first?`, back: md`Each pixel reads a value from a noise texture; pixels with noise below \`progress\` are hidden. Smooth noise makes them vanish in blobs; a band just above the threshold gets the edge colour.` },
        { id: 'p01-2-c5', kind: 'concept', front: md`How do you read the screen in a Godot 4 shader?`, back: md`\`uniform sampler2D screen_texture : hint_screen_texture;\` then \`texture(screen_texture, SCREEN_UV)\`, usually on a full-screen ColorRect on a CanvasLayer.` },
      ],
    },
    // =========================================================================== p01-3
    {
      id: 'p01-3',
      title: 'Particles, lights and scene transitions',
      minutes: 40,
      objectives: [
        'Choose between GPUParticles2D and CPUParticles2D and configure a ParticleProcessMaterial.',
        'Make continuous dust and a one-shot spark burst, and compute emission rate as amount / lifetime.',
        'Light a dungeon with CanvasModulate and PointLight2D, and drive a day/night tint from a Gradient.',
        'Build the `Transitions` autoload with a fade and a circle-wipe shader, and change scenes behind it.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Three more layers finish the look. **Particles**: puffs of dust behind Kai when he runs, a spray of sparks where a sword hits a skeleton. **Lights**: the dungeon is dark blue except near torches and around the party. **Transitions**: walking through a door closes a black circle on Kai, swaps the room, and opens it again, which also hides the frame or two the new scene takes to load.`,
        },
        {
          kind: 'callout',
          tone: 'godot',
          title: 'GPUParticles2D or CPUParticles2D',
          md: md`Both nodes emit many small sprites from one node. **GPUParticles2D** simulates particles on the graphics card, configured by a **ParticleProcessMaterial** resource; it handles thousands of particles cheaply and is the default choice. **CPUParticles2D** simulates them in the engine on the CPU, with the same settings stored on the node itself; it is fine for a few dozen particles and works on any renderer. A GPUParticles2D node can be converted from its toolbar menu (**GPUParticles2D → Convert to CPUParticles2D**), so starting with GPU particles costs nothing. Shardbound's effects use a few dozen particles at a time, so either works.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'How emission works',
          md: md`- \`amount\` is the number of particles the node owns.
- \`lifetime\` is how long each one lives, in seconds.

The node emits them in a cycle of \`lifetime\` seconds and reuses each slot when its particle dies, so **the emission rate is $\text{amount} / \text{lifetime}$ particles per second**, and at most \`amount\` are alive at once.

- \`explosiveness\` squeezes the emissions toward the start of the cycle: 1 releases all of them at once.
- \`one_shot\` stops after one cycle.
- \`local_coords\` decides whether live particles move with the node (on) or stay where they were emitted (off).

The ParticleProcessMaterial sets each particle's start and motion:

- \`direction\` and \`spread\` (degrees either side)
- \`initial_velocity_min\` / \`_max\` (px/s)
- \`gravity\` (px/s², a \`Vector3\` whose default \`(0, -9.8, 0)\` is meant for 3D)
- \`damping\` (px/s of speed lost per second)
- scale and colour over the lifetime.`,
        },
        {
          kind: 'assets',
          ids: ['fx_dust', 'fx_hit'],
          note: md`\`fx_dust\` is a short strip of puff frames for particles; set it as the particle texture with a \`CanvasItemMaterial\` whose *Particles Animation* is on and *H Frames* matches the strip.`,
        },
        {
          kind: 'steps',
          title: 'Dust at Kai\'s feet, sparks on hits',
          steps: [
            md`In \`player.tscn\` add a \`GPUParticles2D\` child named \`Dust\` at position (0, 0), the feet. In the Inspector: *Amount* 8, *Time → Lifetime* 0.5, *Drawing → Local Coords* off. Set *Texture* to the \`fx_dust\` image.`,
            md`*Process Material* → **New ParticleProcessMaterial**, then open it. *Direction* (0, −1, 0), *Spread* 60, *Gravity* (0, −10, 0) so the dust drifts up slightly, *Initial Velocity* min 8, max 16, *Damping* min and max 20. Under *Color → Color Ramp* create a gradient from white to transparent so puffs fade out.`,
            md`For the frames: *Material* → **New CanvasItemMaterial**, tick *Particles Animation*, set *H Frames* to the number of frames in \`fx_dust\`. In the process material set *Animation → Speed* min and max to 1, so each particle plays the strip once over its life.`,
            md`Add the dust script below as a child node of the player, and assign \`body\` (the player) and \`dust\` in the Inspector.`,
            md`For sparks: **Scene → New Scene**, root \`GPUParticles2D\`, save as \`scenes/fx/spark_burst.tscn\`. *Amount* 14, *Lifetime* 0.35, *Explosiveness* 1. Process material: *Spread* 180, *Initial Velocity* 60–130, *Gravity* (0, 300, 0), *Damping* 120, and a colour ramp from pale yellow to orange to transparent. Attach \`spark_burst.gd\`.`,
          ],
          result: md`Running makes a short trail of puffs that rises and fades behind Kai and stops a moment after he does. Instancing the spark scene anywhere throws a burst of sparks that arc down and disappear.`,
          troubleshoot: [
            { problem: md`Particles fall upward or fly off the top of the screen.`, fix: md`The default gravity is $(0, -9.8, 0)$, written for 3D where $+y$ is up. In 2D, $+y$ is down: use $(0, 300, 0)$ for falling sparks.` },
            { problem: md`The dust is a cloud stuck to Kai.`, fix: md`*Local Coords* is on, so particles move with the node. Turn it off.` },
            { problem: md`The particle texture shows the whole strip squashed into each particle.`, fix: md`Add the CanvasItemMaterial with *Particles Animation* and the right *H Frames*.` },
          ],
        },
        { kind: 'code', file: 'scripts/dust.gd', code: DUST },
        { kind: 'code', file: 'scripts/fx/spark_burst.gd', code: SPARK_BURST, note: md`\`finished\` fires when a one-shot emitter's last particle has died, so the node frees itself exactly when it is no longer visible.` },
        { kind: 'code', file: 'scripts/hit_sparks.gd', code: HIT_SPARKS },
        {
          kind: 'viz',
          viz: { type: 'ship.particles' },
          task: md`Walk and dash with the dust settings, then turn on **local_coords** and walk again. Switch to **sparks**, press **J**, and change \`gravity y\` and \`damping\`. Finally set the sparks' \`explosiveness\` to 0 and press J: what happens to the burst?`,
          caption: md`With \`explosiveness\` 0 the 14 sparks come out evenly over 0.35 s, a short stream instead of a burst. The readout shows the emission rate $\text{amount}/\text{lifetime}$ and how many particle slots are in use.`,
        },
        {
          kind: 'numeric',
          q: md`You want 24 dust puffs per second while running, each living 0.75 s. What \`amount\` should the emitter have?`,
          answer: { kind: 'number', value: 18 },
          explain: md`Rate = amount / lifetime, so amount = rate × lifetime = $24 \times 0.75 = 18$. That is also the most puffs alive at once.`,
        },
        {
          kind: 'derive',
          title: 'How high does a spark fly?',
          goal: md`A spark leaves the hit straight up at $v_0 = 120$ px/s, with gravity $g = 300$ px/s² downward and damping $d = 120$ px/s². Find its maximum height.`,
          steps: [
            { md: md`While rising, gravity and damping both slow the spark: gravity always pulls down, and damping always reduces the speed. Its speed drops by $g + d = 420$ px/s every second.` },
            {
              md: md`With constant deceleration $a$, the distance to stop from $v_0$ is $v_0^2 / 2a$ (the stopping-distance formula from c02).`,
              choose: {
                prompt: md`So the height is`,
                options: [md`$120^2 / (2 \times 420) \approx 17.1$ px`, md`$120^2 / (2 \times 300) = 24$ px`, md`$120 \times 0.35 = 42$ px`],
                answer: 0,
                explain: md`$14400 / 840 \approx 17.1$ px. Without damping it would be 24 px; ignoring gravity and drag entirely gives the 42 px of the third option, which is far too high.`,
              },
            },
            { md: md`Time to the top: $v_0 / (g+d) = 120/420 \approx 0.29$ s, just under the 0.35 s lifetime, so most sparks die near the top of their arc. Raise the lifetime if you want to see them fall.` },
          ],
          takeaway: md`Particle settings are the same kinematics as character movement. Decide the height and duration you want, then solve for velocity, gravity and lifetime.`,
        },
        {
          kind: 'text',
          md: md`### 2D lights

Godot's 2D lighting has two parts.

- A **CanvasModulate** node multiplies the colour of everything on its canvas layer: a dark blue \`Color(0.18, 0.2, 0.3)\` makes a dungeon dark.
- **PointLight2D** nodes add light back. Each has:
  - a \`texture\` that gives its shape (usually a radial gradient, white in the middle and black at the edge)
  - \`color\`
  - \`energy\` (brightness)
  - \`texture_scale\` (size)

With the default *Add* blend, a pixel's final colour is roughly its colour times (the modulate colour plus the lights that reach it).

Two consequences:

1. A light only matters where the modulate is dark. In daylight (modulate white) a torch adds almost nothing visible.
2. **CanvasModulate only affects its own canvas layer.** Put the HUD on a separate \`CanvasLayer\`, as r05 does, and it stays bright in a dark dungeon.

For shadows, add \`LightOccluder2D\` nodes (or occlusion shapes on the TileSet's tiles) and turn on the light's *Shadow → Enabled*.`,
        },
        {
          kind: 'steps',
          title: 'Light the dungeon',
          steps: [
            md`Open your dungeon scene and add a \`CanvasModulate\` to its root. Set *Color* to a dark blue-grey, around \`#2e3448\`. The room goes dark in the editor.`,
            md`On a torch object, add a child \`PointLight2D\`. *Texture* → **New GradientTexture2D**; open it and set *Fill* to **Radial**, *Fill From* (0.5, 0.5), *Fill To* (1.0, 0.5), width and height 128. The default white-to-black gradient is the falloff. Set *Color* to a warm orange.`,
            md`Attach \`torch_light.gd\` to the light. Run the scene: the torch glow wavers.`,
            md`Add a second, dimmer \`PointLight2D\` (energy about 0.6, slightly blue) as a child of the player, so the party carries a little light.`,
            md`Check that the HUD is on its own \`CanvasLayer\`: it should stay fully bright.`,
          ],
          result: md`The dungeon is dark except for warm, flickering pools of light around the torches and a soft light that moves with Kai. Walking between torches feels like moving through the room.`,
          troubleshoot: [
            { problem: md`The light is a hard-edged square.`, fix: md`The texture is not a radial gradient. Check *Fill: Radial* on the GradientTexture2D.` },
            { problem: md`The HUD is dark too.`, fix: md`The HUD is on the same canvas layer as the CanvasModulate. Move it under a \`CanvasLayer\` node.` },
          ],
        },
        { kind: 'code', file: 'scripts/torch_light.gd', code: TORCH },
        { kind: 'code', file: 'scripts/day_night.gd', code: DAY_NIGHT, note: md`In the Inspector, give \`day_colors\` a Gradient with stops like: 0.0 dark blue, 0.25 orange (dawn), 0.33 white, 0.7 white, 0.78 orange (dusk), 0.86 dark blue, 1.0 dark blue. \`Gradient.sample(offset)\` returns the interpolated colour.` },
        {
          kind: 'viz',
          viz: { type: 'ship.lighting', mode: 'lighting' },
          task: md`In the dungeon, walk between the torches and change \`modulate\`, \`energy\` and \`texture_scale\`. Switch to **field**, run the clock and watch dusk. At noon, does the light on Kai still show?`,
          caption: md`The figure lights each pixel as $\text{albedo} \times (\text{modulate} + \sum \text{light})$. At noon the modulate is already white, so lights cannot brighten further and the light on Kai disappears into the daylight; that is expected, and it is why day scenes rarely need lights.`,
        },
        {
          kind: 'check',
          q: md`The dungeon has a CanvasModulate of \`#2e3448\`. The HP bars are \`Control\` nodes that are children of the dungeon's root \`Node2D\`. What do they look like?`,
          options: [md`Dark, tinted like the dungeon, because they are on the same canvas layer as the CanvasModulate`, md`Normal, because Controls ignore lighting`, md`Invisible`, md`Normal, because CanvasModulate only affects sprites`],
          answer: 0,
          explain: md`CanvasModulate tints every canvas item on its layer, Controls included. Putting the HUD under a \`CanvasLayer\` gives it its own layer, which the dungeon's CanvasModulate does not touch.`,
        },
        {
          kind: 'text',
          md: md`### The Transitions autoload

A room change has to do three things in order: hide the screen, change the scene, show it again. Changing the scene first and then fading in would show the new room for a frame before the fade covers it. An autoload is the natural owner:

- It survives the scene change, so the second half of the animation can still run.
- Every door, cutscene and menu can call it.

It is a \`CanvasLayer\` with a high \`layer\` (100), so its \`ColorRect\` covers the game and the HUD, and with \`process_mode = ALWAYS\` it keeps animating while it pauses the game tree. Pausing also stops the player from walking during the transition, and \`is_busy\` stops a second door from starting another one.

The fade tweens the rect's \`modulate.a\`. The circle wipe uses a shader: each pixel measures its distance from \`center\` and is black if it is outside a radius that shrinks as \`progress\` grows. Multiplying the x distance by the aspect ratio (320/180) keeps the circle round on a wide screen.`,
        },
        { kind: 'code', file: 'assets/shaders/circle_wipe.gdshader', lang: 'shader', code: SH_WIPE },
        { kind: 'code', file: 'scripts/autoload/transitions.gd', code: TRANSITIONS, note: md`Register it as \`Transitions\` in **Project Settings → Globals → Autoload**. \`await _play(...)\` waits for the coroutine's tween to finish; \`go_to_scene\` itself can be awaited by callers that need to know when the new room is visible.` },
        { kind: 'code', file: 'scripts/door.gd', code: DOOR, note: md`\`get_global_transform_with_canvas()\` gives the body's position on screen in pixels, after the camera. Dividing by the viewport size turns it into the 0..1 UV the shader expects. Add the player to the \`player\` group (**Node → Groups**).` },
        {
          kind: 'viz',
          viz: { type: 'ship.lighting', mode: 'transition' },
          task: md`Walk into the door at the top, then press **F** from somewhere else in the room. Compare **fade** and **circle wipe**, and **LINEAR** against **SINE in-out** at a duration of 1 s. Scrub \`progress\` by hand and read the radius.`,
          caption: md`The circle centres on Kai each time, so the player's eye is already where the new room opens. With SINE in-out the circle starts and ends slowly; with LINEAR it seems to close fast at the end, because the visible area shrinks with the square of the radius.`,
        },
        {
          kind: 'numeric',
          q: md`The wipe is centred on the middle of a 320×180 screen. How many pixels from the centre is the farthest corner? That is the smallest radius at which the screen is fully clear.`,
          answer: { kind: 'number', value: Math.hypot(160, 90), tol: 0.01 },
          explain: md`$\sqrt{160^2 + 90^2} = \sqrt{25600 + 8100} \approx 183.6$ px. In the shader's units (screen heights) that is $183.6/180 \approx 1.02$. The shader uses $\sqrt{(320/180)^2 + 1} \approx 2.04$ instead, which is enough for any centre, including a player standing in a corner.`,
        },
        {
          kind: 'build',
          ch: {
            id: 'p01-3-build',
            title: 'Atmosphere pass',
            goal: md`Add particles, dungeon lighting and room transitions to the slice.`,
            requirements: [
              md`Dust puffs appear behind Kai while he runs or dashes and stop shortly after he stops; they stay where they were emitted.`,
              md`Every hit spawns a spark burst at the enemy's hurtbox, including the hit that kills it; burst nodes free themselves.`,
              md`The dungeon is dark with flickering torches and a soft light on the party; the HUD stays fully bright.`,
              md`Every room exit uses \`Transitions.go_to_scene\` with a circle wipe centred on Kai; the player cannot move during the transition, and touching two doors quickly changes the room once.`,
              md`The town uses the day/night CanvasModulate, and night falls at least once in 12 real minutes.`,
            ],
            hints: [
              md`Spawn sparks into \`get_tree().current_scene\`, not into the enemy, so they survive the enemy's \`queue_free()\`.`,
              md`If the player still moves during a transition, check that the player's \`process_mode\` is *Inherit* (the default) so pausing the tree stops it.`,
              md`To start a new room at the right door, store the target spawn name in \`GameState\` before changing scene and read it in the room's \`_ready()\` (c04 covers this).`,
            ],
            solution: [
              { file: 'scripts/autoload/transitions.gd', code: TRANSITIONS },
              { file: 'scripts/door.gd', code: DOOR },
              { file: 'scripts/hit_sparks.gd', code: HIT_SPARKS },
              { file: 'scripts/dust.gd', code: DUST },
            ],
            explain: md`The transitions code keeps all timing in one place and makes doors trivial. The order inside \`go_to_scene\` (cover, change, wait a frame, uncover) is what hides the switch. The two particle scripts show the ownership rule for effects: continuous effects are children of the thing that emits them; one-shot effects belong to the level so their emitter can die.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'p01-3-paper',
            title: 'Lyra\'s ice spell, frame by frame',
            type: 'design',
            difficulty: 2,
            minutes: 10,
            statement: md`Design the feedback for Lyra's ice spell hitting a skeleton, using only the tools from this module: sounds through \`Audio\`, the shaders, particles and lights. Give a timeline in frames at 60 fps from impact (frame 0) to frame 30, and justify each choice.`,
            solution: [
              md`Frame 0: \`sfx_ice\` with small pitch jitter (±3%, it is a recognisable spell); the skeleton's hit flash with a pale cyan \`flash_color\` for 6 frames, so the element reads instantly.`,
              md`Frame 0: a one-shot burst of 10–12 pale blue shards with high explosiveness, little gravity (ice shards drift) and strong damping, so they stop within about 15 frames; a short-lived cyan PointLight2D (energy 1.2 → 0 over 12 frames) that only shows in dark rooms.`,
              md`Frames 6–30: a palette swap towards blue on the skeleton for the duration of a slow/freeze status, removed when the status ends.`,
              md`Everything is short enough not to hide the next action: the flash ends at frame 6 and the burst by frame 20, so the player can read the skeleton's wind-up again.`,
            ],
            rubric: [md`Gives frame timings at 60 fps`, md`Uses a sound, a shader and particles, each with a reason`, md`Keeps the feedback from hiding enemy telegraphs`, md`Ties colour to the element consistently`],
          },
        },
        {
          kind: 'recall',
          prompt: md`What is the emission rate of a particle node, and what do \`explosiveness\`, \`one_shot\` and \`local_coords\` change?`,
          answer: md`Rate = amount / lifetime per second, with at most \`amount\` alive. \`explosiveness\` bunches emissions at the start of each cycle (1 = all at once). \`one_shot\` stops after one cycle. \`local_coords\` makes live particles move with the node (on) or stay in the world (off).`,
        },
        {
          kind: 'explain',
          prompt: md`Why does \`Transitions.go_to_scene\` wait for the cover animation before calling \`change_scene_to_file\`, and why is it an autoload?`,
          model: md`The scene must change while the screen is fully covered, otherwise the player sees the new room for a moment, or the old room vanishes before the fade. Awaiting the tween guarantees the order. It is an autoload because the old scene, with any node inside it, is freed by the scene change: only a node outside the current scene can finish the uncover animation, and every door and cutscene needs the same service.`,
        },
      ],
      cards: [
        { id: 'p01-3-c1', kind: 'compute', front: md`A GPUParticles2D has amount 12 and lifetime 0.4 s. Emission rate per second?`, answer: { kind: 'number', value: 30 }, back: md`$12 / 0.4 = 30$ per second, at most 12 alive.` },
        { id: 'p01-3-c2', kind: 'concept', front: md`Why is the default ParticleProcessMaterial gravity wrong for 2D?`, back: md`It is $(0, -9.8, 0)$, meant for 3D where $+y$ is up. In 2D $+y$ is down, and px/s² values are much larger: use something like $(0, 300, 0)$.` },
        { id: 'p01-3-c3', kind: 'concept', front: md`How do CanvasModulate and PointLight2D combine?`, back: md`CanvasModulate multiplies the whole canvas layer's colour; lights add on top (Add blend). Final ≈ albedo × (modulate + lights). The HUD on another CanvasLayer is unaffected.` },
        { id: 'p01-3-c4', kind: 'cloze', text: md`A one-shot effect frees itself with \`{{}}.connect(queue_free)\`.`, answers: ['finished'] },
        { id: 'p01-3-c5', kind: 'concept', front: md`The order of a scene transition?`, back: md`Cover (await the tween), \`change_scene_to_file\`, wait a frame for the new scene, uncover. Pause the tree meanwhile; the autoload runs with \`PROCESS_MODE_ALWAYS\`.` },
      ],
    },
  ],
  problems: [
    {
      id: 'p01-p1',
      title: 'Slider to decibels',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`A Music slider is at 0.3. What \`volume_db\` does \`set_bus_volume\` give the Music bus? Round to two decimals.`,
      solution: [md`$20 \log_{10} 0.3 = 20 \times (-0.5229)$.`, md`$\approx -10.46$ dB.`],
      answer: { kind: 'number', value: 20 * Math.log10(0.3), tol: 0.01 },
      areas: ['art'],
    },
    {
      id: 'p01-p2',
      title: 'Three identical sounds',
      type: 'compute',
      difficulty: 2,
      minutes: 4,
      statement: md`Three slimes die on the same frame and the same death sound plays three times in perfect sync. The amplitudes add. How many dB louder is the result than one sound?`,
      solution: [md`In sync, the waves add sample by sample: the amplitude is $3\times$.`, md`$20 \log_{10} 3 \approx 9.54$ dB. Random pitch breaks the sync, so the copies no longer add up exactly, and the result is both quieter and less phasey.`],
      answer: { kind: 'number', value: 20 * Math.log10(3), tol: 0.01 },
      areas: ['art'],
    },
    {
      id: 'p01-p3',
      title: 'The volume slider that does nothing',
      type: 'debug',
      difficulty: 1,
      minutes: 5,
      statement: md`The SFX slider (range 0 to 1) barely changes anything. Find the bug.

\`\`\`gdscript
func _on_value_changed(v: float) -> void:
	var index := AudioServer.get_bus_index("SFX")
	AudioServer.set_bus_volume_db(index, v)
\`\`\``,
      solution: [md`\`set_bus_volume_db\` takes decibels. Passing the slider value directly sets the bus to between 0 dB (unchanged) and 1 dB (slightly louder), so the slider only makes a tiny difference.`, md`Convert: \`AudioServer.set_bus_volume_db(index, linear_to_db(v))\`, and mute when \`v\` is near 0, since \`linear_to_db(0.0)\` is $-\infty$.`],
      rubric: [md`Identifies the dB/linear mismatch`, md`Uses \`linear_to_db\``, md`Handles 0 (mute)`],
      areas: ['art', 'godot'],
    },
    {
      id: 'p01-p4',
      title: 'Spark burst count',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`A continuous emitter must produce 30 particles per second, each living 0.4 s. What \`amount\` does it need, and how many particles are alive at a time once it is running?`,
      solution: [md`amount = rate × lifetime = $30 \times 0.4 = 12$.`, md`Once the first cycle has passed, all 12 slots are in use: 12 alive at any moment.`],
      answer: { kind: 'number', value: 12 },
      areas: ['art'],
    },
    {
      id: 'p01-p5',
      title: 'Dust that slides',
      type: 'derive',
      difficulty: 2,
      minutes: 6,
      statement: md`A dust puff starts at 40 px/s horizontally with no gravity and damping $d$ px/s². Derive how far it travels before stopping, and find $d$ so it travels at most 6 px.`,
      solution: [md`Damping removes $d$ px/s of speed per second, a constant deceleration, so $v(t) = 40 - d\,t$ until it reaches 0 at $t = 40/d$.`, md`Distance = area under the speed graph = $\tfrac12 \cdot \tfrac{40}{d} \cdot 40 = \dfrac{800}{d}$.`, md`$800/d \le 6 \Rightarrow d \ge 133.3$ px/s².`],
      answer: { kind: 'number', value: 800 / 6, tol: 0.01 },
      areas: ['art', 'math'],
    },
    {
      id: 'p01-p6',
      title: 'Never the same footstep twice',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 8,
      statement: md`Add a method \`play_random(streams: Array[AudioStream])\` to the \`Audio\` autoload that plays one of several variations of a sound, never the same one twice in a row, through \`play_sfx\`. Write it on paper.`,
      solution: [
        md`Keep the index of the last variation per array of variations. A Dictionary keyed by the array works: the caller passes the same constant array every time, so it finds the same entry.`,
        md`\`\`\`gdscript
var _last_variant := {}

func play_random(streams: Array[AudioStream]) -> void:
	if streams.is_empty():
		return
	var last: int = _last_variant.get(streams, -1)
	var i := randi() % streams.size()
	if streams.size() > 1 and i == last:
		i = (i + 1) % streams.size()
	_last_variant[streams] = i
	play_sfx(streams[i])
\`\`\``,
        md`Stepping to the next index instead of re-rolling keeps it to one random call and still gives every other variation an equal chance.`,
      ],
      rubric: [md`Remembers the previous choice`, md`Handles 0 and 1 variations`, md`Reuses \`play_sfx\` so pooling and pitch still apply`],
      areas: ['art', 'godot'],
    },
    {
      id: 'p01-p7',
      title: 'The golem slam',
      type: 'design',
      difficulty: 2,
      minutes: 10,
      statement: md`The golem's slam is its biggest attack. Specify the audio-visual feedback for its wind-up and impact using this module's tools, and explain how each element helps the player react.`,
      solution: [
        md`Wind-up (the telegraph): a low rumble sound that starts with the windup animation; a slowly rising outline or flash in a warning colour on the golem; a few dust particles drifting from its fists. These must be visible from anywhere on screen because they tell the player to dodge.`,
        md`Impact: \`sfx_explosion\` at low pitch, a ring of dust particles with high explosiveness and strong damping, a brief screen-space wobble (amplitude 1–2 px for 10 frames), and the screen shake from k01.`,
        md`Afterwards: the golem's stagger window, if any, gets its own colour (a palette shift) so the player learns when to punish. Music keeps playing; important sounds should not be stolen, so keep the pool large enough or give the slam its own player.`,
      ],
      rubric: [md`Separates telegraph and impact`, md`Uses sound, shader and particles purposefully`, md`Considers readability (does it hide the next attack?)`],
      areas: ['art', 'feel', 'combat'],
    },
    {
      id: 'p01-p8',
      title: 'GPU or CPU particles',
      type: 'concept',
      difficulty: 1,
      minutes: 4,
      statement: md`Explain the difference between GPUParticles2D and CPUParticles2D, and when you would switch Shardbound's effects to CPU particles.`,
      solution: [md`GPUParticles2D simulates on the graphics card from a ParticleProcessMaterial: cheap for large counts, the default. CPUParticles2D simulates on the CPU with properties on the node: fine for small counts, works on every renderer and device.`, md`Switch when a target device or renderer shows problems with GPU particles, or when you need to read particle data on the CPU. Godot's convert menu keeps the settings, so the switch is quick.`],
      rubric: [md`Where each simulates`, md`Scaling with count`, md`A sensible reason to switch`],
      areas: ['art', 'godot'],
    },
    {
      id: 'p01-p9',
      title: 'Circle radius mid-transition',
      type: 'compute',
      difficulty: 2,
      minutes: 6,
      statement: md`The circle wipe uses \`TRANS_SINE\` with \`EASE_IN_OUT\`, whose value at normalised time $k$ is $(1 - \cos \pi k)/2$. A cover animation lasts 0.4 s on a 320×180 screen. What is the radius in pixels 0.1 s in? (radius = (1 − progress) × max_radius, max_radius = $\sqrt{(320/180)^2+1}$ screen heights, 1 screen height = 180 px.)`,
      solution: [md`$k = 0.1/0.4 = 0.25$; progress $= (1 - \cos(\pi/4))/2 = (1 - 0.7071)/2 = 0.1464$.`, md`max_radius $= \sqrt{3.1605 + 1} = 2.0397$ screen heights.`, md`radius $= (1 - 0.1464) \times 2.0397 \times 180 \approx 313.4$ px. The circle is still larger than the screen, so nothing is covered yet: the sine ease starts slowly.`],
      answer: { kind: 'number', value: (1 - (1 - Math.cos(Math.PI / 4)) / 2) * Math.hypot(320 / 180, 1) * 180, tol: 0.01 },
      areas: ['art', 'math'],
    },
  ],
};
