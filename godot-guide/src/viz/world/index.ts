// Figures for r04 (dialogue, quests, cutscenes), r05 (menus, HUD, gamepad UI) and r06 (saving).
import type { VizDef } from '../registry';
import './world.css';
import { DialogueFigure, validateDialogue } from './dialogue';
import { QuestFigure } from './quest';
import { CutsceneFigure } from './cutscene';
import { NineSliceFigure } from './nineslice';
import { MenuFocusFigure } from './menufocus';
import { HudFigure } from './hud';
import { SaveInspector, validateSave } from './save';

export const VIZ: Record<string, VizDef> = {
  'rpg.dialogue': {
    component: DialogueFigure,
    validate: validateDialogue,
    doc: "Dialogue box and graph. mode 'box' (typewriter: chars_per_second, punctuation pause, visible_characters vs substring reflow, T = n/c + kp) or 'graph' (the elder's JSON conversation as a node graph with story flags, branches, choice conditions and set effects; play it in a typewriter box).",
  },
  'rpg.quest': {
    component: QuestFigure,
    validate: () => null,
    doc: 'Quests computed from story flags: world-event buttons change flags, set_flag → flag_changed → _refresh_quests → quest_updated → toast, with a computed quest log and a signal log. Toggle whether herbs count before the quest starts.',
  },
  'rpg.cutscene': {
    component: CutsceneFigure,
    validate: () => null,
    doc: 'Playable AnimationPlayer cutscene: camera pan (smoothstep keys), an NPC walking in, method keys, say() pausing the animation for dialogue, input lock. Timeline with keys, playhead and scrubber.',
  },
  'rpg.ui_nineslice': {
    component: NineSliceFigure,
    validate: () => null,
    doc: 'Drag a panel drawn from the 24×24 ui_panel as a nine-slice (or a plain stretched TextureRect): patch margin, content margin, tile/stretch, slice overlay, readouts of corner/edge/centre sizes and the matching StyleBoxTexture code.',
  },
  'rpg.menu_focus': {
    component: MenuFocusFigure,
    validate: () => null,
    doc: 'Playable pause menu: command list and a 4×3 item grid driven by focus (arrows, F = ui_accept, X/Esc = ui_cancel). Toggles: explicit focus neighbours vs geometric search, wrap, grid focusable only in its submenu, sounds. Shows neighbour arrows and the focus_neighbor_* code.',
  },
  'rpg.hud_bars': {
    component: HudFigure,
    validate: () => null,
    doc: 'Playable party HUD: J = slime hit, K = heal. HP bars with a delayed ghost drain (delay, duration, ease), MP and ATB bars from ui_bars, damage numbers, a 3 s plot of HP and ghost, bar pixels and t90.',
  },
  'rpg.save_inspector': {
    component: SaveInspector,
    validate: validateSave,
    doc: "Playable two-room world (chest, coins, elder, herbs) with its save JSON live and highlighted, three slots with metadata and on-disk files (.tmp/.bak), save/load/new game. mode 'live', 'slots' (ConfigFile view, simulated crash mid-save) or 'migrate' (step through _v1_to_v2, refuse a version-3 save).",
  },
};
