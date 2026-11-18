// Course schema. A lesson is a *notebook*: a sequence of cells the learner
// works through top to bottom. Interactive cells gate progress so it's
// impossible to just scroll and read — every few minutes you predict, run,
// fix, or recall something (retrieval practice beats re-reading).

export type Track = 'sql' | 'python';

/** Mini-markup: **bold**, `code`, *italic*, [[Ctrl+Enter]] keys, "- " bullets, blank line = paragraph, ```lang fenced code```. */
export type Md = string;

export type Cell =
  | { kind: 'md'; text: Md }
  | { kind: 'callout'; tone: 'tip' | 'trap' | 'interview' | 'memory' | 'why'; title?: string; text: Md }
  | { kind: 'viz'; viz: VizSpec; caption?: Md }
  | {
      kind: 'code';
      lang: Track;
      code: string;
      /** a "predict the output before you run it" gate (multiple choice) */
      predict?: Predict;
      /** for Python: which visualizer view to open next to the code */
      trace?: TraceHint;
      note?: Md;
      /** this cell intentionally raises an error (to teach reading tracebacks) */
      error?: boolean;
    }
  | Challenge
  | { kind: 'quiz'; id: string; q: Md; options: Md[]; answer: number; explain: Md }
  | { kind: 'recall'; prompt: Md; answer: Md }
  | { kind: 'explain'; id: string; prompt: Md };

export interface Predict {
  question: Md;
  options: string[];
  answer: number;
  /** if true (default for python), the test-suite asserts options[answer] === the real stdout (trimmed) */
  fromOutput?: boolean;
  explain?: Md;
}

export interface TraceHint {
  view: 'heap' | 'array' | 'bars' | 'calltree' | 'grid' | 'graph';
  /** variable holding the list / grid / graph to draw */
  var?: string;
  /** int variables to draw as pointers under the array (i, j, left, right, mid...) */
  pointers?: string[];
  /** for calltree: function name to draw */
  fn?: string;
  /** auto-play speed in ms per step */
  speed?: number;
}

export type Challenge = {
  kind: 'challenge';
  id: string;
  lang: Track;
  title: string;
  prompt: Md;
  starter: string;
  hints: Md[];
  solution: string;
  explain: Md;
  xp?: number;
  /** SQL grading */
  sql?: { ordered?: boolean; columns?: string[]; mustInclude?: string[] };
  /** Python grading: expressions evaluated after the learner's code; expected values come from running the solution */
  py?: { tests: string[]; stdout?: boolean; mustInclude?: string[] };
  trace?: TraceHint;
};

export type VizSpec =
  | { type: 'join'; left: string; right: string; leftKey: string; rightKey: string; join?: 'inner' | 'left' | 'right' | 'full' | 'cross'; show?: string[] }
  | { type: 'pipeline'; sql: string }
  | { type: 'groupby'; table: string; key: string; agg: 'count' | 'sum' | 'avg' | 'max' | 'min'; col?: string }
  | { type: 'window'; table: string; partition?: string; order: string; value: string; show?: string[] }
  | { type: 'schema' }
  | { type: 'index'; n?: number }
  | { type: 'bigo' }
  | { type: 'hashmap'; keys?: string[] }
  | { type: 'trace'; code: string; trace: TraceHint }
  | { type: 'nulls' };

export interface Lesson {
  id: string;
  track: Track;
  title: string;
  summary: string;
  minutes: number;
  /** why big tech cares / how it shows up in 2026-27 interviews (1-3 sentences) */
  faang: Md;
  /** e.g. ['Meta DE screen', 'Amazon DA', 'Top-N per group'] */
  tags: string[];
  dataset?: string;
  cells: Cell[];
  /** spaced-repetition flashcards unlocked when the lesson is completed */
  cards: Card[];
}

export type Card =
  | { id: string; kind: 'concept'; front: Md; back: Md }
  | { id: string; kind: 'predict'; code: string; options: string[]; answer: number }
  | { id: string; kind: 'sql'; prompt: Md; dataset: string; solution: string; ordered?: boolean }
  | { id: string; kind: 'cloze'; text: Md; answers: string[] };

export interface Problem {
  id: string;
  track: Track;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  /** the pattern being trained (Two Pointers, Sliding Window, Top-N per group, Gaps & Islands...) */
  pattern: string;
  /** companies whose interviews commonly use this style of problem */
  companies: string[];
  minutes: number;
  dataset?: string;
  challenge: Challenge;
  /** what an interviewer would ask next */
  followups?: Md[];
}

export interface Module {
  id: string;
  track: Track;
  order: number;
  title: string;
  icon: string;
  level: 'Foundations' | 'Core' | 'Interview' | 'Advanced';
  blurb: string;
  lessons: Lesson[];
  /** problems from the gym that form this module's "interview round" boss */
  boss: string[];
}
