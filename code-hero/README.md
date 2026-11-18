# Code Hero Academy

Interactive SQL and Python notebooks that run in the browser. They're built for visual learners who learn by trial and error, and for keeping what you learn: you watch code move, predict what happens before you run it, fix challenges with exact feedback, and spaced repetition brings each idea back just before you'd forget it.

Both languages run locally in the browser. **SQLite** runs as asm.js, and **Python** runs through a step-tracing interpreter written for this app, so there's no server and it works offline.

## What's inside

| Area | What you get |
|---|---|
| **SQL track** | 8 modules / 26 lessons: SELECT → aggregates → JOINs → subqueries & CTEs → CASE/NULLs/dates → window functions → interview patterns (streaks, cohorts, funnels, median, de-dup) → modeling, DML, transactions & indexes. Uses seven realistic datasets (shop, HR, bank, social, rides, streaming…). |
| **Python track** | 8 modules / 30 lessons: names & types → control flow → lists/dicts/sets → functions, scope & recursion → classes → linked lists, stacks/queues, trees, graphs, heaps → Big-O, binary search, two pointers, sliding window, sorting, DP → Pythonic idioms. |
| **Visualizers** | Step through code (heap view with arrows), linked lists drawn as chains, trees as trees, arrays with moving pointers, sorting bars, DP grids, graph traversal, recursion call trees. For SQL: animated JOINs (INNER/LEFT/RIGHT/FULL/CROSS with Venn and match lines), the logical clause pipeline (FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT), GROUP BY buckets, window frames, schema diagrams, NULL truth tables, index vs full scan, Big-O growth curves and hash-map buckets. |
| **Learning loop** | Each lesson is a notebook that unlocks cell by cell. 🔮 *Predict first* gates mean you guess before you run. Challenges are graded exactly: missing/extra rows, failing tests and plain-English error tips. Lessons end with quiz, 🧠 recall and ✍️ explain-it-back cells. |
| **Retention** | Each lesson adds about 5 flashcards (concept, cloze, predict-the-output, write-the-query) to an FSRS-style spaced-repetition deck. The **Review** tab shows what's due, a 14-day forecast, and memory % per lesson. |
| **Interview Gym** | 59 timed problems (Easy/Medium/Hard) tagged with pattern and company style, each with interviewer follow-ups. Every module ends in a **boss round** that moves you along an offer pipeline (Recruiter screen → Phone screen → Onsite rounds → Hiring committee → Team match → Offer 🎉). |
| **Rewards** | XP with a streak multiplier (up to ×1.5), a career ladder L1 Curious Coder → L10 Fellow, gems, streak freezes, 3 daily quests with a mystery chest, combos, 28 achievements, and themes to unlock. |
| **Playground & Notes** | A free SQL/Python scratchpad with any dataset. All your explain-it-back notes are collected in one place. |

Progress is saved in the browser (localStorage). Use **Profile → Copy progress code** to move it to another browser or device.

## Run it

```bash
cd code-hero
npm install
npm run dev          # http://localhost:5174
npm test             # interpreter vs CPython, SQL engine, SRS, and every lesson validated
npm run build        # static site in dist/
npm run build:artifact   # single self-contained HTML file in dist-single/
```

## How correctness is guaranteed

- **Python fidelity:** the interpreter is differential-tested against CPython 3.13 (`src/py/interp.test.ts`, `src/py/corpus.ts`). Every code snippet in every lesson is also run in CPython, so the output you see is what real Python prints.
- **Lesson validation:** `src/course/course.test.ts` checks every lesson:
  - Predict answers equal the real output.
  - Every challenge's reference solution passes and its starter code fails.
  - SQL predict answers match the actual data.
  - Flashcards are well-formed.
- **End-to-end:** a browser play-through (Playwright) completes every lesson the way a learner would.

## Layout

```
src/py/        Python lexer/parser/interpreter with step tracing (+ builtins, CPython tests)
src/sql/       sql.js wrapper, datasets, result diffing, clause pipeline
src/course/    lesson + gym content (modules/*.ts, problems/*.ts), graders, validator
src/progress/  spaced repetition (srs.ts) and the XP/levels/quests/achievements store
src/components visualizers (viz/), notebook cells, editor
src/pages/     Home, tracks, lesson, review, gym/boss, playground, notes, profile
docs/CONTENT_GUIDE.md   how to add lessons
```
