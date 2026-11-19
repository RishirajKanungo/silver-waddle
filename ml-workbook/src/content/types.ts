import type { AnswerSpec } from '../math/answer';
import type { Rng } from '../math/rng';

/** Markdown with $inline$ and $$display$$ TeX. Author with String.raw: md`…` (see tex tag below). */
export type Md = string;
/** Tag for authoring content: keeps backslashes (\frac, \nabla, \theta) intact. */
export const md = String.raw;

export type Part = 'la' | 'calc' | 'ml' | 'dl' | 'llm' | 'prep';
export const PARTS: { id: Part; title: string; blurb: string }[] = [
  { id: 'la', title: 'Linear Algebra', blurb: 'Vectors, matrices as maps, systems, subspaces, determinants, orthogonality, eigenvalues, SVD.' },
  { id: 'calc', title: 'Calculus, Probability & Optimization', blurb: 'Gradients and matrix calculus, probability and information theory, gradient-based optimization.' },
  { id: 'ml', title: 'Machine Learning', blurb: 'Regression, classification, evaluation, generalization, classical models, unsupervised learning.' },
  { id: 'dl', title: 'Deep Learning', blurb: 'Neural networks, backpropagation, training at scale, convolution and embeddings.' },
  { id: 'llm', title: 'Transformers & LLMs', blurb: 'Attention and the transformer, how LLMs are trained and aligned, inference, retrieval and serving.' },
  { id: 'prep', title: 'Interview Practice', blurb: 'ML system design and the ML coding round: structured walkthroughs and from-scratch NumPy implementations.' },
];

/** Interview areas used to report readiness. */
export type Area = 'math' | 'ml-breadth' | 'ml-depth' | 'ml-coding' | 'llm' | 'system-design';
export const AREAS: { id: Area; title: string }[] = [
  { id: 'math', title: 'Math foundations' },
  { id: 'ml-breadth', title: 'ML breadth' },
  { id: 'ml-depth', title: 'ML depth / derivations' },
  { id: 'ml-coding', title: 'ML coding (NumPy)' },
  { id: 'llm', title: 'LLMs & transformers' },
  { id: 'system-design', title: 'ML system design' },
];

export interface VizSpec {
  type: string; // registered visualization id, e.g. 'la.transform2d'
  [param: string]: unknown;
}

export type CalloutTone = 'definition' | 'theorem' | 'intuition' | 'example' | 'warning' | 'interview' | 'remember' | 'notation';

export interface Choice {
  q: Md;
  options: Md[];
  answer: number;
  explain: Md;
}

export interface DeriveStep {
  /** the step itself, usually a displayed equation with one line of justification */
  md: Md;
  /** optional: make the learner pick the next step before it is shown */
  choose?: { prompt: Md; options: Md[]; answer: number; explain?: Md };
}

export interface PyTest {
  expr: string; // Python expression evaluated after the learner's code
  label?: string;
}

export interface Exercise {
  id: string;
  title: string;
  prompt: Md;
  starter: string;
  solution: string;
  /** expressions compared (by repr) against the reference solution's values */
  tests?: PyTest[];
  /** compare full stdout with the solution's stdout */
  stdout?: boolean;
  hints: Md[];
  /** substrings that must appear in the learner's code (e.g. "@" to require a matrix product) */
  mustInclude?: string[];
  /** substrings that must NOT appear (e.g. "for " to require vectorized code) */
  mustExclude?: string[];
}

export type Cell =
  | { kind: 'text'; md: Md }
  | { kind: 'callout'; tone: CalloutTone; title?: string; md: Md }
  | { kind: 'viz'; viz: VizSpec; caption?: Md; task?: Md }
  /** multiple-choice checkpoint (gate) */
  | ({ kind: 'check' } & Choice)
  /** compute on paper, type the result (gate) */
  | { kind: 'numeric'; q: Md; answer: AnswerSpec; hints?: Md[]; explain: Md; inputHint?: string }
  /** a derivation revealed one step at a time, optionally with "what comes next?" choices (gate) */
  | { kind: 'derive'; title: string; goal: Md; steps: DeriveStep[]; takeaway?: Md }
  /** pen-and-paper exercise inline in a lesson, self-graded against a worked solution (gate) */
  | { kind: 'paper'; problem: Problem }
  /** runnable Python (NumPy available); optional predict-the-output gate */
  | { kind: 'code'; code: string; predict?: Choice & { fromOutput?: boolean }; note?: Md; error?: boolean }
  /** coding exercise graded by tests (gate) */
  | { kind: 'exercise'; ex: Exercise }
  /** recall prompt, self-rated (gate) */
  | { kind: 'recall'; prompt: Md; answer: Md }
  /** explain in your own words (gate); a model answer is revealed after writing */
  | { kind: 'explain'; prompt: Md; model: Md };

export type ProblemType = 'compute' | 'proof' | 'derive' | 'concept' | 'apply' | 'code-on-paper';

export interface Problem {
  id: string; // 'la03-p4'
  title: string;
  type: ProblemType;
  difficulty: 1 | 2 | 3; // 1 routine · 2 standard exam · 3 hard / interview-depth
  minutes: number;
  statement: Md;
  hints?: Md[];
  /** worked solution as ordered steps, revealed one at a time */
  solution: Md[];
  /** optional machine-checkable final answer */
  answer?: AnswerSpec;
  /** what a grader would look for (shown with the solution) */
  rubric?: Md[];
  areas?: Area[];
}

export type Card =
  | { id: string; kind: 'concept'; front: Md; back: Md }
  | { id: string; kind: 'cloze'; text: Md; answers: string[] } // text contains {{}} blanks
  | { id: string; kind: 'compute'; front: Md; answer: AnswerSpec; back: Md };

export interface Lesson {
  id: string; // 'la01-1'
  title: string;
  minutes: number;
  /** "After this lesson you can …" — concrete, testable */
  objectives: string[];
  cells: Cell[];
  cards: Card[];
}

export interface Module {
  id: string; // 'la01'
  part: Part;
  order: number; // global order within the part
  title: string;
  summary: string; // one sentence
  /** where this shows up in ML work and interviews — factual, concrete, short */
  relevance: Md;
  prereqs?: string[]; // module ids
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
  id: string; // 'la.det2'
  module: string; // module id it belongs to
  title: string;
  /** one line: what skill this builds */
  skill: string;
  gen: (rng: Rng) => DrillItem;
}

export interface InterviewQ {
  id: string;
  module: string;
  area: Area;
  q: Md;
  /** a strong answer: structured, concise, what you would actually say */
  answer: Md;
  followups?: Md[];
  /** common wrong or weak answers */
  pitfalls?: Md[];
  level: 1 | 2 | 3; // 1 screen, 2 onsite, 3 senior/depth
}
