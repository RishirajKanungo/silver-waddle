import type { AnswerSpec } from '../math/answer';
import type { Rng } from '../math/rng';

/** Markdown with $inline$ and $$display$$ TeX. Author with md`…` (String.raw). */
export type Md = string;
export const md = String.raw;

export type Part = 'godot' | 'math' | 'core' | 'combat' | 'rpg' | 'ship';
export const PARTS: { id: Part; title: string; blurb: string }[] = [
  { id: 'godot', title: 'Godot Foundations', blurb: 'The editor, GDScript, nodes and scenes, signals, resources: everything else is built from these.' },
  { id: 'math', title: 'Game Math', blurb: 'Vectors and transforms, motion and physics, curves and springs, collision geometry, and the numbers behind RPG balance.' },
  { id: 'core', title: 'Core Gameplay', blurb: 'Pixel art pipeline, top-down movement with good feel, jumping and height, tile worlds and cameras, state machines and components.' },
  { id: 'combat', title: 'Combat', blurb: 'Hitboxes and game feel, enemy AI, and a hybrid real-time / ATB battle system with stagger, tactical mode and a party.' },
  { id: 'rpg', title: 'RPG Systems', blurb: 'Stats, gear and socketable abilities, inventory and loot, dialogue and quests, menus and HUD, saving the world state.' },
  { id: 'ship', title: 'Polish & Shipping', blurb: 'Audio, shaders and particles, production and scoping, and releasing on Steam.' },
];

/** Skill areas, used for the readiness view. */
export type Area = 'godot' | 'math' | 'feel' | 'combat' | 'systems' | 'art' | 'ship';
export const AREAS: { id: Area; title: string }[] = [
  { id: 'godot', title: 'Godot & GDScript' },
  { id: 'math', title: 'Game math' },
  { id: 'feel', title: 'Movement & game feel' },
  { id: 'combat', title: 'Combat & AI' },
  { id: 'systems', title: 'RPG systems' },
  { id: 'art', title: 'Art, audio & UI' },
  { id: 'ship', title: 'Production & shipping' },
];

export interface VizSpec {
  type: string; // registered figure id, e.g. 'math.vectors'
  [param: string]: unknown;
}

export type CalloutTone = 'definition' | 'theorem' | 'intuition' | 'example' | 'warning' | 'design' | 'remember' | 'notation' | 'godot';

export interface Choice {
  q: Md;
  options: Md[];
  answer: number;
  explain: Md;
}

export interface DeriveStep {
  md: Md;
  choose?: { prompt: Md; options: Md[]; answer: number; explain?: Md };
}

export type CodeLang = 'gdscript' | 'shader' | 'tscn' | 'cfg' | 'text';

/** A solution file for a build challenge */
export interface CodeFile {
  file: string; // e.g. 'scripts/player.gd'
  code: string;
  lang?: CodeLang; // default gdscript
}

export interface Challenge {
  id: string;
  title: string;
  goal: Md;
  /** acceptance criteria the learner checks off in their running game */
  requirements: Md[];
  hints: Md[];
  solution: CodeFile[];
  /** how the solution works, shown with it */
  explain?: Md;
}

export type Cell =
  | { kind: 'text'; md: Md }
  | { kind: 'callout'; tone: CalloutTone; title?: string; md: Md }
  | { kind: 'viz'; viz: VizSpec; caption?: Md; task?: Md }
  /** multiple choice (gate) — code can go in the question as a ```gdscript fence */
  | ({ kind: 'check' } & Choice)
  /** compute on paper, type the result (gate) */
  | { kind: 'numeric'; q: Md; answer: AnswerSpec; hints?: Md[]; explain: Md; inputHint?: string }
  /** derivation revealed one step at a time (gate) */
  | { kind: 'derive'; title: string; goal: Md; steps: DeriveStep[]; takeaway?: Md }
  /** pen-and-paper problem, self-graded (gate) */
  | { kind: 'paper'; problem: Problem }
  /**
   * A code listing to type or copy into Godot. `file` names where it goes in the project.
   * GDScript is parsed by gdtoolkit in the validator; set `fragment: true` only for pieces that
   * are not a complete script (they are still checked for Godot 3 idioms).
   */
  | { kind: 'code'; file?: string; lang?: CodeLang; code: string; note?: Md; fragment?: boolean }
  /** do this in the Godot editor (gate: "done") */
  | { kind: 'steps'; title: string; steps: Md[]; result: Md; troubleshoot?: { problem: Md; fix: Md }[] }
  /** the assets this lesson uses, with live previews and where to find them */
  | { kind: 'assets'; ids: string[]; note?: Md }
  /** build something in your project and check it against acceptance criteria (gate) */
  | { kind: 'build'; ch: Challenge }
  /** recall, self-rated (gate) */
  | { kind: 'recall'; prompt: Md; answer: Md }
  /** explain in your own words, compared with a model answer (gate) */
  | { kind: 'explain'; prompt: Md; model: Md };

export type ProblemType = 'compute' | 'derive' | 'design' | 'debug' | 'concept' | 'code-on-paper';

export interface Problem {
  id: string;
  title: string;
  type: ProblemType;
  difficulty: 1 | 2 | 3;
  minutes: number;
  statement: Md;
  hints?: Md[];
  solution: Md[];
  answer?: AnswerSpec;
  rubric?: Md[];
  areas?: Area[];
}

export type Card =
  | { id: string; kind: 'concept'; front: Md; back: Md }
  | { id: string; kind: 'cloze'; text: Md; answers: string[] } // '|' separates accepted spellings
  | { id: string; kind: 'compute'; front: Md; answer: AnswerSpec; back: Md };

export interface Lesson {
  id: string;
  title: string;
  minutes: number;
  objectives: string[];
  cells: Cell[];
  cards: Card[];
}

export interface Module {
  id: string;
  part: Part;
  order: number;
  title: string;
  summary: string;
  /** what this unlocks in the game you are building — concrete */
  relevance: Md;
  prereqs?: string[];
  lessons: Lesson[];
  problems: Problem[];
  areas: Area[];
}

export interface DrillItem {
  prompt: Md;
  answer: AnswerSpec;
  solution: Md;
  inputHint?: string;
}

export interface Drill {
  id: string;
  module: string;
  title: string;
  skill: string;
  gen: (rng: Rng) => DrillItem;
}

/** Design and concept questions with model answers (reviewed with spaced repetition). */
export interface InterviewQ {
  id: string;
  module: string;
  area: Area;
  q: Md;
  answer: Md;
  followups?: Md[];
  pitfalls?: Md[];
  level: 1 | 2 | 3;
}

/**
 * Tag for GDScript listings: keeps backslashes (like md) and converts each leading group of four
 * spaces to a tab, because Godot's editor indents with tabs and mixed indentation is an error.
 * A leading newline is dropped so listings can start on the line after the backtick.
 */
export const gd = (strings: TemplateStringsArray, ...vals: unknown[]): string =>
  String.raw(strings, ...vals)
    .replace(/^\n/, '')
    .split('\n')
    .map((line) => {
      const m = /^(?: {4})+/.exec(line);
      return m ? '\t'.repeat(m[0].length / 4) + line.slice(m[0].length) : line;
    })
    .join('\n');
