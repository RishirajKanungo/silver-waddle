// Figures for r04 (dialogue, quests, cutscenes), r05 (menus, HUD, gamepad UI) and r06 (saving).
import type { VizDef } from '../registry';
import './world.css';
import { DialogueFigure, validateDialogue } from './dialogue';
import { QuestFigure } from './quest';
import { CutsceneFigure } from './cutscene';

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
};
