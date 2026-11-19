// Small syntax highlighters for GDScript, Godot shaders and .tscn/.cfg text. Output: HTML spans.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const GD_KW = new Set(
  'if elif else for while match break continue pass return class class_name extends is in as self signal func static const enum var await yield super preload load breakpoint not and or when'.split(' '),
);
const GD_LIT = new Set(['true', 'false', 'null', 'PI', 'TAU', 'INF', 'NAN']);
const GD_BUILTIN_FN = new Set(
  'print print_debug push_warning push_error str int float bool len range abs absf absi sign signf clamp clampf clampi min max minf maxf lerp lerpf lerp_angle inverse_lerp remap move_toward sqrt pow exp log sin cos tan atan atan2 asin acos deg_to_rad rad_to_deg floor ceil round snapped wrapf wrapi randf randi randf_range randi_range randomize seed is_instance_valid typeof instance_from_id ease smoothstep step_decimals fposmod posmod hash weakref get_stack is_equal_approx is_zero_approx'.split(' '),
);

const SH_KW = new Set('shader_type render_mode uniform varying const void return if else for while discard in out inout break continue'.split(' '));
const SH_TYPE = /^(?:float|int|uint|bool|vec[234]|ivec[234]|bvec[234]|mat[234]|sampler2D|isampler2D)$/;

function span(cls: string, s: string) {
  return `<span class="hl-${cls}">${esc(s)}</span>`;
}

export function highlightGd(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const rest = src.slice(i);
    // comments
    if (c === '#') {
      const end = src.indexOf('\n', i);
      const s = src.slice(i, end < 0 ? n : end);
      out += span('com', s);
      i += s.length;
      continue;
    }
    // strings: """…""", "…", '…', with &"…" (StringName) and ^"…" (NodePath) prefixes
    const strM = /^(?:[&^r])?(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')/.exec(rest);
    if (strM && (c === '"' || c === "'" || ((c === '&' || c === '^' || c === 'r') && (rest[1] === '"' || rest[1] === "'")))) {
      out += span('str', strM[0]);
      i += strM[0].length;
      continue;
    }
    // node paths: $Node/Child, $"Quoted", %Unique
    const np = /^[$%](?:"[^"\n]*"|[A-Za-z_][\w/]*)/.exec(rest);
    if (np) {
      out += span('node', np[0]);
      i += np[0].length;
      continue;
    }
    // annotations
    const ann = /^@[A-Za-z_]\w*/.exec(rest);
    if (ann) {
      out += span('ann', ann[0]);
      i += ann[0].length;
      continue;
    }
    // numbers
    const num = /^(?:0x[0-9a-fA-F_]+|0b[01_]+|\d[\d_]*\.?\d*(?:e[+-]?\d+)?|\.\d+)/.exec(rest);
    if (num && !/[\w]/.test(src[i - 1] ?? '')) {
      out += span('num', num[0]);
      i += num[0].length;
      continue;
    }
    // identifiers
    const id = /^[A-Za-z_]\w*/.exec(rest);
    if (id) {
      const w = id[0];
      const after = src.slice(i + w.length).match(/^\s*\(/);
      const prevNonSpace = src.slice(0, i).replace(/\s+$/, '').slice(-4);
      if (GD_KW.has(w)) out += span('kw', w);
      else if (GD_LIT.has(w)) out += span('lit', w);
      else if (/func$/.test(prevNonSpace) || /signal$/.test(prevNonSpace)) out += span('def', w);
      else if (/^[A-Z]/.test(w) && /[a-z]/.test(w)) out += span('type', w);
      else if (after && GD_BUILTIN_FN.has(w)) out += span('bfn', w);
      else if (after) out += span('fn', w);
      else out += esc(w);
      i += w.length;
      continue;
    }
    out += esc(c);
    i++;
  }
  return out;
}

export function highlightShader(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    const com = /^(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)/.exec(rest);
    if (com) {
      out += span('com', com[0]);
      i += com[0].length;
      continue;
    }
    const num = /^\d+\.?\d*(?:e[+-]?\d+)?f?/.exec(rest);
    if (num && !/\w/.test(src[i - 1] ?? '')) {
      out += span('num', num[0]);
      i += num[0].length;
      continue;
    }
    const id = /^[A-Za-z_]\w*/.exec(rest);
    if (id) {
      const w = id[0];
      if (SH_KW.has(w)) out += span('kw', w);
      else if (SH_TYPE.test(w)) out += span('type', w);
      else if (/^[A-Z][A-Z_0-9]+$/.test(w)) out += span('lit', w);
      else if (/^hint_|^source_color$|^filter_/.test(w)) out += span('ann', w);
      else if (/^\s*\(/.test(src.slice(i + w.length))) out += span('fn', w);
      else out += esc(w);
      i += w.length;
      continue;
    }
    out += esc(src[i]);
    i++;
  }
  return out;
}

export function highlightCfg(src: string): string {
  return src
    .split('\n')
    .map((line) => {
      if (/^\s*\[.*\]\s*$/.test(line)) return span('type', line);
      if (/^\s*;/.test(line)) return span('com', line);
      const m = /^(\s*[\w/.:]+)(\s*=\s*)(.*)$/.exec(line);
      if (m) return span('fn', m[1]) + esc(m[2]) + (/^".*"$/.test(m[3]) ? span('str', m[3]) : /^[\d.-]+$/.test(m[3]) ? span('num', m[3]) : esc(m[3]));
      return esc(line);
    })
    .join('\n');
}

export function highlight(code: string, lang: string | undefined): string {
  const l = (lang ?? 'gdscript').toLowerCase();
  if (l === 'gdscript' || l === 'gd') return highlightGd(code);
  if (l === 'shader' || l === 'gdshader' || l === 'glsl') return highlightShader(code);
  if (l === 'tscn' || l === 'cfg' || l === 'tres' || l === 'ini') return highlightCfg(code);
  return esc(code);
}
