// Godot 3 idioms and deprecated Godot 4 APIs that must not appear in code written for Godot 4.4+.
// Each rule: a pattern and the Godot 4 replacement.
const RULES: [RegExp, string][] = [
  [/\byield\s*\(/, 'yield(…) → await signal'],
  [/\bKinematicBody(2D)?\b/, 'KinematicBody2D → CharacterBody2D'],
  [/^\s*export\s*(\(|var\b)/m, 'export var → @export var'],
  [/^\s*onready\s+var\b/m, 'onready var → @onready var'],
  [/^\s*tool\s*$/m, 'tool → @tool'],
  [/\.instance\(\s*\)/, '.instance() → .instantiate()'],
  [/move_and_slide\s*\(\s*[^)\s]/, 'move_and_slide() takes no arguments in Godot 4 (set velocity first)'],
  [/\b(deg2rad|rad2deg|rand_range|stepify|range_lerp|linear2db|db2linear)\s*\(/, 'renamed: deg_to_rad, rad_to_deg, randf_range, snapped, remap, linear_to_db, db_to_linear'],
  [/\bPool\w+Array\b/, 'PoolXArray → PackedXArray'],
  [/\bsetget\b/, 'setget → property syntax: var x: int: set = …, get = …'],
  [/\b(extends|as|new)\s+TileMap\b(?!Layer)|:\s*TileMap\b(?!Layer)|\bTileMap\.new\(/, 'the TileMap node is deprecated since 4.3 → TileMapLayer'],
  [/\bPosition2D\b/, 'Position2D → Marker2D'],
  [/\bYSort\b/, 'YSort node → y_sort_enabled on a Node2D'],
  [/\bVisibilityNotifier2D\b/, 'VisibilityNotifier2D → VisibleOnScreenNotifier2D'],
  [/\bTween\.new\(\)|interpolate_property\s*\(/, 'Tween nodes → create_tween() and tween_property()'],
  [/\.connect\(\s*"[^"]+"\s*,\s*self\s*,/, 'connect("sig", self, "method") → sig.connect(method)'],
  [/\bchange_scene\s*\(/, 'change_scene() → change_scene_to_file() / change_scene_to_packed()'],
  [/\bOS\.get_ticks_m?sec\b/, 'OS.get_ticks_msec → Time.get_ticks_msec'],
  [/\bEngine\.editor_hint\b/, 'Engine.editor_hint → Engine.is_editor_hint()'],
  [/\.linear_interpolate\s*\(/, 'linear_interpolate → lerp'],
  [/\bfuncref\s*\(/, 'funcref → Callable'],
  [/\b(to_json|parse_json)\s*\(/, 'to_json/parse_json → JSON.stringify / JSON.parse_string'],
  [/\b(File|Directory)\.new\s*\(/, 'File/Directory → FileAccess.open / DirAccess.open'],
  [/\brect_(position|size|min_size|global_position|rotation|scale)\b/, 'rect_* → position, size, custom_minimum_size …'],
  [/\bmargin_(left|right|top|bottom)\b/, 'margin_* → offset_*'],
  [/\bBUTTON_(LEFT|RIGHT|MIDDLE|WHEEL_UP|WHEEL_DOWN)\b/, 'BUTTON_LEFT → MOUSE_BUTTON_LEFT'],
  [/\.empty\(\s*\)/, '.empty() → .is_empty()'],
  [/\bget_action_strength\s*\(\s*"[^"]+"\s*\)\s*-\s*Input\.get_action_strength/, 'prefer Input.get_axis / Input.get_vector'],
  [/\bremote\s+func\b|\bpuppet\b|\bmaster\s+func\b/, 'networking keywords → @rpc'],
  [/\bis_network_master\b/, 'is_network_master → is_multiplayer_authority'],
  [/\bget_tree\(\)\.paused\s*=\s*\w+\s*;?\s*$/m, ''], // allowed (placeholder to keep the table aligned)
  [/\bBUTTON_A\b|\bJOY_BUTTON_0\b/, 'JOY_BUTTON_* constants → JOY_BUTTON_A etc.'],
  [/\bClippedCamera\b|\bInterpolatedCamera\b/, 'removed node'],
  [/\.set_cellv\s*\(|\.get_cellv\s*\(/, 'set_cellv/get_cellv → TileMapLayer.set_cell / get_cell_source_id'],
  [/\bLight2D\b(?!.*Point)/, 'Light2D is abstract in Godot 4 → PointLight2D / DirectionalLight2D'],
  [/\bParticles2D\b/, 'Particles2D → GPUParticles2D'],
  [/\bAudioStreamSample\b/, 'AudioStreamSample → AudioStreamWAV'],
  [/\bStreamTexture\b/, 'StreamTexture → CompressedTexture2D'],
  [/\bSpatial\b/, 'Spatial → Node3D'],
  [/\bNavigation2D\b|\bNavigationPolygonInstance\b/, 'Navigation2D → NavigationRegion2D + NavigationAgent2D'],
  [/\.get_rect\(\)\.has_point\(get_global_mouse_position/, ''],
];

export function godot3Isms(code: string): string[] {
  const out: string[] = [];
  // ignore comments
  const src = code.replace(/#[^\n]*/g, '');
  for (const [re, msg] of RULES) if (msg && re.test(src)) out.push(msg);
  return out;
}

const SHADER_RULES: [RegExp, string][] = [
  [/\bhint_color\b/, 'hint_color → source_color'],
  [/\bhint_albedo\b/, 'hint_albedo → source_color'],
  [/\bSCREEN_TEXTURE\b/, 'SCREEN_TEXTURE → uniform sampler2D screen_texture : hint_screen_texture'],
  [/\bDEPTH_TEXTURE\b/, 'DEPTH_TEXTURE → hint_depth_texture uniform'],
  [/\bWORLD_MATRIX\b/, 'WORLD_MATRIX → MODEL_MATRIX'],
];
export function shaderIsms(code: string): string[] {
  const src = code.replace(/\/\/[^\n]*/g, '');
  return SHADER_RULES.filter(([re]) => re.test(src)).map(([, m]) => m);
}
