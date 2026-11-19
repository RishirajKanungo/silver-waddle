# Authoring guide: Linear Algebra & ML workbook

The learner is a working software engineer (Python, TypeScript/React) preparing for ML engineer / ML-focused SWE roles at large tech companies in 2026–2027. They learn visually and by trial and error, struggle with retention, and will do pen-and-paper exercises like a university course. They want the highest-quality teaching content and **no marketing tone**.

`src/content/modules/la01_vectors.ts` is the reference module. Read it fully before writing anything. Match its standard: precise definitions, an interactive figure for every idea, derivations revealed step by step, paper problems with worked solutions, and ML relevance stated plainly. Its figures are in `src/viz/la/vectors.tsx`.

## 1. Writing style (strict)

- Write like a good textbook or a senior engineer explaining at a whiteboard: precise, plain, short sentences, concrete examples.
- No hype or filler. Never write "level up", "supercharge", "master", "unlock", "dive in", "journey", "let's explore", "in this lesson we will", "worth noting", "crucial", "powerful", or exclamation marks.
- No emoji. No em-dash asides. No "not X, but Y" framings. No rhetorical questions as section openers.
- Start with the idea, not with an announcement of it. Define before you use. One idea per paragraph.
- Use "you" sparingly, never "we'll". Imperative mood is fine for tasks ("Drag v so that…").
- **Accuracy is non-negotiable.**
  - Every number in prose, examples, predictions and solutions must be computed. Verify it with `python3` (numpy 2.5.3 is installed).
  - Never invent statistics, salaries, company practices or quotes. Do not claim "Google asks X". Write "a standard interview question" or describe why the topic matters technically.
  - When describing current (2026) practice, stick to well-established facts, for example:
    - pre-norm transformers with RMSNorm
    - RoPE, SwiGLU, grouped-query attention, FlashAttention, KV caching
    - AdamW with warmup and cosine decay
    - LoRA/QLoRA, DPO and RLHF, int8/4-bit quantization
    - mixture-of-experts, retrieval-augmented generation
  - Say "commonly", "typically", "for example" where practice varies.
- Notation is fixed (see §4). Bold lower-case vectors, upper-case matrices, $\top$ for transpose.

## 2. Structure

**Module** (`src/content/modules/<id>_<slug>.ts`, exporting `MODULE`):
- 3 lessons (2–4 allowed), each 25–40 minutes.
- `relevance`: 2–4 sentences on where this shows up in ML work and interviews, concrete and factual.
- `problems`: the **problem set**, 8–10 university-style problems.
  - Mix the types compute / proof / derive / apply / concept / code-on-paper, and difficulties 1/2/3.
  - At least 4 problems need machine-checkable `answer`s.
  - At least 2 must be proofs or derivations with a `rubric`.
  - Every solution is a list of steps (each step one move with its justification). The learner reveals them one at a time to find where they went wrong.

**Lesson cells.** A good lesson rhythm:
1. Short concrete motivation (one paragraph, an ML-flavoured example).
2. Definition or theorem callout.
3. A figure (`viz`) with a `task` that makes the learner *do* something and notice something.
4. A worked example.
5. A checkpoint: `check`, or `numeric` ("compute on paper, then enter").
6. A `derive` for each key result, using `choose` steps that make the learner pick the next move.
7. A `paper` problem (at least one per lesson).
8. A `code` cell (NumPy), and/or an `exercise` (graded), where computing it helps.
9. End with `recall` and/or `explain`.

Requirements per lesson:
- 3–5 objectives, each concrete and testable.
- At least 4 gated cells (check / numeric / derive / paper / exercise / recall / explain / code with predict).
- At least 2 figures.
- Exactly 5 review `cards`, mixing concept, cloze and compute.
- Cards must be answerable in under 30 seconds and test one fact or skill each. Cloze answers must be easy to type: no unicode math, one or two words or a short number.

**Intuition first, then rigor.** For every abstract idea (span, rank, null space, eigenvector, SVD, gradient, MLE, attention…):
- give a picture or figure the learner manipulates
- give a one-sentence intuition (`callout` tone `intuition`)
- give the formal statement (`definition`/`theorem`)
- finish with a computation on paper

Retention comes from doing (predict, compute, derive) and from spaced review, so make the cards and problems good.

**Drills** (`src/drills/<module>.ts`, exporting `DRILLS`): 2–4 generators per module for the computations that must become automatic, e.g. matrix products, determinants, eigenvalues of 2×2 matrices, gradients of simple functions, softmax of a small vector, precision/recall from a confusion matrix, parameter counts.
- Use the seeded `Rng` (`r.int`, `r.nz`, `r.pick`, `r.shuffle`, `r.normal`).
- Choose numbers that keep hand computation reasonable, with integer or simple-fraction answers.
- Each item has a `prompt`, an `answer` (`AnswerSpec`) and a step-by-step `solution`.
- Ids are lowercase with hyphens (`la-det2`, `ml-prf1`) because they appear in URLs.

**Interview questions** (`src/interview/<module>.ts`, exporting `QUESTIONS`): 5–8 per module.
- Areas: `math`, `ml-breadth`, `ml-depth`, `ml-coding`, `llm`, `system-design`.
- Levels: 1 = phone screen, 2 = onsite, 3 = depth/senior.
- `answer` is what a strong candidate would *say*: structured, 80–200 words, with formulas where they help.
- `pitfalls`: common weak answers. `followups`: likely next questions.

## 3. Cell reference (see `src/content/types.ts`)

```ts
{ kind: 'text', md }
{ kind: 'callout', tone: 'definition'|'theorem'|'intuition'|'example'|'warning'|'interview'|'remember'|'notation', title?, md }
{ kind: 'viz', viz: { type: 'la.transform2d', ...params }, task?, caption? }
{ kind: 'check', q, options, answer, explain }                       // multiple choice (gate)
{ kind: 'numeric', q, answer: AnswerSpec, hints?, explain, inputHint? } // compute on paper (gate)
{ kind: 'derive', title, goal, steps: [{ md, choose? }], takeaway? }  // stepwise derivation (gate)
{ kind: 'paper', problem: Problem }                                   // pen-and-paper (gate)
{ kind: 'code', code, predict?, note?, error? }                       // runnable Python with NumPy
{ kind: 'exercise', ex: { id, title, prompt, starter, solution, tests, hints, mustInclude?, mustExclude?, stdout? } }
{ kind: 'recall', prompt, answer }
{ kind: 'explain', prompt, model }
```

`AnswerSpec`:
- `{kind:'number', value, tol?}`
- `{kind:'vector', value:number[], upToScale?}`. Use `upToScale` for eigenvectors, normals and null-space directions.
- `{kind:'matrix', value}`
- `{kind:'set', value}` (unordered, e.g. eigenvalues)
- `{kind:'text', value:[accepted spellings]}`

The default tolerance is relative 1e-4. Learners can type `3/4`, `sqrt(2)/2`, `pi/4`, `e^-1`, `[1, 2]`, `[[1,2],[3,4]]` or `1 2; 3 4`.

**Predict cells.** The correct option, with backticks stripped, must equal the program's **entire** printed output, trimmed. Print exactly one thing in a predict cell. No distractor may equal the output.

**Code cells** run in our in-browser Python, with `import numpy as np` available. The validator runs every code cell in **real CPython + NumPy 2.5.3** and requires byte-identical stdout.
- Use the legacy `np.random.seed(…)` / `np.random.randn` / `np.random.rand` API. `default_rng` may be unsupported.
- Prefer `np.round(x, 3)` when printing floats you want to read.
- Exercises compare `repr(expr)` of each test expression between the learner's code and the reference solution. Use stable expressions like `np.round(f(X), 6).tolist()`, `round(float(loss), 6)` or `f(X).shape`.
- `mustExclude: ['for ']` forces a vectorized solution. The starter must fail at least one test.

## 4. Math and markdown

- Author every string with the `md` tag: ``md`…` `` (String.raw), so `\frac`, `\nabla` and `\theta` survive. Plain strings would turn `\f`, `\t`, `\n`, `\b` into control characters, and the validator rejects those.
- Inline math `$…$`, display math `$$…$$`. A literal dollar sign is `\$` (e.g. `\$150k`). Never write `${` (template interpolation).
- Inline code inside ``md`…` `` is written ``\`np.dot\` `` (escaped backticks).
- Markdown supported:
  - paragraphs, `### headings`
  - `-` and `1.` lists
  - `>` quotes
  - fenced code blocks
  - `| tables |`
  - `**bold**`, `*italic*`, `[links](https://…)`
- Macros:
  - fonts and sets: `\R \E \P \Var \Cov \argmin \argmax \tr \rank \Col \Row \Null \Span \diag \sign \softmax \relu \KL`
  - bold vectors `\ba … \bz` (= `\mathbf{a}`; except `\bf` and `\bm`)
  - `\bzero \btheta \bmu \bSigma \ihat \jhat`
  - `\T` (superscript ⊤, e.g. `A\T`)
  - `\norm{x} \abs{x} \inner{x}{y} \pd{f}{x}`
- Matrices: `\begin{bmatrix} 1 & 2 \\ 3 & 4 \end{bmatrix}`. Augmented: `\left[\begin{array}{cc|c} … \end{array}\right]`.

## 5. Figures (the core of the course)

Each figure is a React component in **your own folder** `src/viz/<folder>/`. Register them in `src/viz/<folder>/index.ts`:

```ts
import type { VizDef } from '../registry';
export const VIZ: Record<string, VizDef> = { 'la.transform2d': { component: Transform2D, validate: (s) => (Array.isArray(s.matrix) ? null : 'matrix required'), doc: '…' } };
```

Rules:
- Ids are prefixed by part: `la.`, `calc.`, `ml.`, `dl.`, `llm.`, `sd.`. Never reuse an existing id.
- Build from the kit in `src/viz/kit` (read the source first):
  - `Plane` (2-D world coordinates) with `Arrow`, `Handle` (draggable, snaps), `Point`, `Seg`, `InfLine`, `Poly`, `Path`, `Curve` (y=f(x)), `ParamCurve`, `TGrid` (image of the grid under a 2×2 matrix), `Contours` (level sets), `Heat` (raster), `Field` (vector field), `Label` (text or TeX)
  - `Space3D` (drag to rotate) with `Arrow3`, `Seg3`, `Point3`, `Poly3`, `PlanePatch`, `Line3`, `Label3`
  - `LinePlot` (series, log axes, reference lines), `Bars`, `MatGrid` (matrix as cells, with row/column/cell highlights and heat colouring)
  - controls: `Slider`, `SegControl`, `Toggle`, `usePlayer` (step/play through frames), `MatrixEdit`, `Readout` (rows of TeX label → value), `FigureLayout` (drawing + side panel + below)
  - math in `src/math`: `linalg.ts` (det, inv, solve, eig2, eigSym, svd, qr, lstsq, rank), `frac.ts` (exact rationals, `rrefSteps` with recorded row operations), `contour.ts`, `rng.ts`
- Every figure must:
  - be **interactive**: drag, slider, or step/play
  - show the **numbers** that change (`Readout`, `MatGrid`) next to the picture, so geometry and algebra are linked
  - look complete at rest, with sensible defaults from `spec` params
  - offer a `task` in the lesson that leads to the insight
- **Colours** come from CSS variables only, never hex:
  - `var(--c-u)`, `var(--c-v)`, `var(--c-w)` for vectors u, v, w/results
  - `var(--c-i)`, `var(--c-j)`, `var(--c-k)` for the basis vectors î, ĵ, k̂
  - `var(--c-err)` for residuals and errors
  - `var(--c-neg)` / `var(--c-pos)` for two classes or a diverging map
  - `var(--accent)`, `var(--muted)`, `var(--fg)`, `var(--surface)`, `var(--surface2)`, `var(--line)`, `var(--ok)`, `var(--bad)`, `var(--warn)`
  - Light and dark themes both work automatically through these.
- Drawing width up to 520 internal units. A `FigureLayout` side panel is 240 px. It must work at 390 px phone width: the layout stacks.
- Put any CSS in `src/viz/<folder>/<folder>.css`, imported by your component, with class names prefixed `<folder>-`. Don't edit `src/styles.css`.
- Keep figures fast. Precompute with `useMemo`. Animations step at ≤ 60 frames. Avoid > 3000 SVG nodes.

**Check your figures visually.** The dev server runs at `http://localhost:5175`. Open `#l-<lessonId>`, use the "Skip it" link to reveal all cells, and screenshot each figure with Playwright. Example: `/tmp/claude-0/-home-user-silver-waddle/2e5fadff-665c-507e-b8b4-df14ecb843ce/scratchpad/ml/figs.cjs` (run `node figs.cjs <lessonId>` from that folder; it saves one PNG per figure/checkpoint). Look at each image (Read tool) and fix:
- overlaps and clipped labels
- empty or ugly initial states
- unreadable text

Check the dark theme once with `colorScheme: 'dark'`.

## 6. Verify and finish

From `/home/user/silver-waddle/ml-workbook`:
- `npx tsc --noEmit`: clean.
- `npx vitest run src/content`: all your modules, drills and questions pass. It checks:
  - TeX parses
  - code output matches CPython
  - predictions match the output
  - exercises' solutions pass and starters fail
  - viz types exist and `validate` passes
  - drills generate 150 valid items
  - answers are self-consistent

**Only create files in your own areas:**
- `src/content/modules/<yourmodules>`
- `src/drills/<yourmodule>.ts`
- `src/interview/<yourmodule>.ts`
- `src/viz/<yourfolder>/`

Do not edit the kit, types, pages, styles or other people's files. If you need a kit feature, build it inside your folder. If you find a bug in shared code, describe it in your final report.

NumPy for the in-browser interpreter lives in `/home/user/silver-waddle/code-hero/src/py/numpy.ts` and is maintained by someone else. If a NumPy feature you need is missing or prints differently from real NumPy:
- Report the exact snippet.
- Don't work around it by weakening the lesson.
- Don't edit the interpreter.
