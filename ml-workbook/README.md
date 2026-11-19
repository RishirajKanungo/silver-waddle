# Linear Algebra & ML workbook

A browser-based course in linear algebra, calculus and probability, machine learning, deep learning and LLMs, aimed at ML engineer and ML-focused software roles. It runs fully offline in the browser: math is rendered with KaTeX, figures are interactive SVG, and Python with a NumPy implementation runs in the page.

## Contents

24 modules in six parts:
- Linear Algebra
- Calculus, Probability & Optimization
- Machine Learning
- Deep Learning
- Transformers & LLMs
- Interview Practice (ML system design, the ML coding round)

In total:
- 72 lessons (about 44 hours)
- 173 interactive figures
- 88 step-by-step derivations
- 232 problem-set problems, plus 73 paper problems inside lessons
- 48 graded NumPy exercises
- 360 review cards
- 86 drill generators
- 170 interview questions

## How it is meant to be used

- **Lessons**: short sections of reading, each followed by a figure you manipulate and a checkpoint. The rest of a lesson opens only after you attempt the checkpoint. Checkpoints include:
  - multiple choice
  - compute on paper and type the result
  - step-by-step derivations where you pick the next step
  - pen-and-paper problems with worked solutions
  - NumPy code with "predict the output" first
  - graded coding exercises
  - recall and explain-it-back prompts
- **Problem sets**: 8–10 university-style problems per module (computations, proofs, derivations, applications). Work on paper, check final answers where a box is shown, reveal the solution one step at a time, and grade yourself. Missed problems come back for another attempt.
- **Drills**: generated exercises with new numbers every time, for the computations that must become automatic (determinants, eigenvalues, gradients, softmax, metrics, parameter counts…).
- **Review**: spaced repetition (FSRS-style) over everything you finish: flashcards, problems to re-solve, drills, and interview questions.
- **Interview**: questions with answers you could give out loud, weak answers to avoid, and likely follow-ups, organized by area (math, ML breadth, ML depth, ML coding, LLMs, system design).
- **Reference**: every definition and theorem from the lessons in one searchable sheet.
- **Progress**: per-area readiness (how much of an area you have studied, times how much you are predicted to remember now), module recall, activity.

Progress is stored in the browser. **Progress → Copy progress code** moves it to another device.

## Run it

```bash
cd ml-workbook
npm install
npm run dev               # http://localhost:5175
npm test                  # math, answer parsing, and the full content validator
npm run build:artifact    # single self-contained HTML file in dist-single/
```

The Python interpreter and its NumPy implementation are shared with `../code-hero/src/py` (imported via the `@py` alias).

## How correctness is checked

`src/content/content.test.ts` validates every module, problem, drill and interview question. It checks that:

- every formula parses with KaTeX
- every code cell prints exactly what real CPython + NumPy print
- "predict the output" answers equal the real output
- every exercise's reference solution passes its tests and its starter does not, with test values cross-checked against CPython
- every figure type exists and its parameters validate
- every drill generator produces 150 valid, self-consistent items

## Layout

```
src/content/modules/   one file per module (lessons, cells, cards, problem set)
src/drills/            drill generators per module
src/interview/         interview questions per module
src/viz/kit/           figure primitives (2-D plane, 3-D space, plots, matrix grid, controls)
src/viz/<area>/        figures, registered by id (la., calc., ml., dl., llm., sd.)
src/math/              exact fractions and row reduction, float linear algebra, answer parsing
src/progress/          spaced repetition and progress state
src/ui/, src/pages/    cells, problem cards, pages
docs/CONTENT_GUIDE.md  authoring rules
```
