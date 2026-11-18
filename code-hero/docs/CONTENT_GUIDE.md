# Code Hero Academy — content guide

The learner: a bank data analyst (strong with Excel; knows some Python/TS) preparing for big-tech
(FAANG-style) data / engineering interviews in 2026-27. **Heavy visual learner, learns by trial and error,
and struggles with retention of brand-new material.** Every lesson must therefore:

1. **Show before tell** — open with a visualization or a runnable example, then name the concept.
2. **Make them predict** — at least 2 `code` cells per lesson with a `predict` gate (predict → run → compare).
   Being wrong first and then seeing why is what makes things stick.
3. **Chunk** — short md cells (≤ 120 words), one idea each. Interleave md / code / viz / challenge.
4. **Hook memory** — at least one `callout` with tone `memory` (a mnemonic, analogy or picture).
5. **Retrieve** — finish with `quiz`, `recall` and `explain` cells, plus ≥ 4 flashcards (`cards`) of mixed kinds
   (`predict`, `concept`, `cloze`, `sql`). Cards are reviewed with spaced repetition for weeks — make them
   short and unambiguous, one fact each.
6. **Tie to interviews** — fill `faang` (why big-tech interviewers care; how it shows up in 2026-27 loops) and
   `tags`. Use `callout` tone `interview` for "how this is asked" tips and `trap` for common mistakes.
   Phrase company relevance as "common in Meta/Amazon-style loops" — never claim a specific question was asked.
7. **Explain the WHY** — the learner wants the chain of thought behind each technique, not just syntax.

Read first: `src/course/types.ts` (schema), `src/course/modules/sql01_select.ts` and `src/course/modules/py01_names.ts`
(reference lessons — match their quality and tone), `src/course/problems/*.ts` (gym problem format),
`src/sql/datasets.ts` (all SQL tables + their deliberate quirks), `src/course/grade.ts` (how grading works),
`src/course/course.test.ts` (what the validator enforces).

## Validator (must pass)
`npx vitest run src/course` checks every lesson and problem:
- Python `code` cells run under **real CPython 3.13 and our interpreter and must print identical output**.
  If `error: true`, both must raise and the last traceback line must match.
- Python `predict` (unless `fromOutput: false`): `options[answer]` must equal the cell's **entire stdout, trimmed**.
  So keep predicted cells to ONE line of output, or set `fromOutput: false` and ask about one part.
- SQL `predict` with `fromOutput: true`: `options[answer]` must be the row count (e.g. `'4'`) or the single value of a 1×1 result.
- Every `challenge`: the `solution` must pass and the `starter` must FAIL. SQL challenges are graded by comparing result
  rows with the solution's result (order-insensitive unless `sql.ordered`). Python challenges are graded by evaluating each
  expression in `py.tests` after the learner's code and comparing `repr()` with the solution's. Solutions also run in CPython.
- Python `predict` cards: `options[answer]` must equal the real stdout (trimmed).
- `cloze` cards: the number of `{{}}` blanks must equal `answers.length`.
- Lessons need ≥ 3 cards (aim for 4-6) and ≥ 1 challenge. Module `boss` ids must exist in `src/course/problems/`.

## Writing TS safely
- Code lives in JS template literals. **Escape `${` as `\${`** and **write Python `\n` as `\\n`** inside template literals
  (or use regular single-quoted strings with `\n` line breaks). Same for backslashes in regexes.
- Python output must be deterministic: no printing sets of strings (hash order), no `id()`, no default object reprs,
  no `random`, no timing. Sort before printing when order isn't guaranteed.

## Python interpreter (in-browser, ours) — supported
Python 3 core: functions (defaults, *args, **kwargs, keyword-only), closures, nonlocal/global, lambdas, classes
(inheritance, super(), properties, staticmethod/classmethod, most dunders incl. __repr__/__eq__/__lt__/__len__/__iter__/
__getitem__/__contains__/__add__/__call__), dataclasses, generators (yield, yield from, send), comprehensions, f-strings
(full format spec), % formatting, str.format, try/except/else/finally, raise, assert, with (user context managers),
walrus, unpacking (incl. *rest), slicing (incl. assignment), ints are arbitrary precision.
Modules: math, collections (Counter, defaultdict, deque, namedtuple, OrderedDict), heapq, bisect, itertools,
functools (reduce, lru_cache, cache, partial, cmp_to_key), string, copy, typing, dataclasses, operator, re (basic), sys, random.
**Not supported:** `match`, async, complex numbers, files/`open`, `input()` (no stdin), numpy/pandas, metaclasses, `__slots__`.
Effective recursion depth ≈ 500. If you find a gap, avoid that feature and report it in your final message.

## Visualizations
`viz` cells (`VizSpec` in types.ts):
- `{type:'trace', code, trace}` — a stepping Python visualizer (Python-Tutor style). `code` must run cleanly. Keep traces short (≤ 120 steps).
- `{type:'join', left, right, leftKey, rightKey, join?, show?}` — animated row matching between two tables in the lesson's dataset,
  with a Venn diagram and a join-type switcher (inner/left/right/full/cross). Use small tables (toy: `students`/`clubs`, `shirts`/`sizes`).
  `show` = columns to display.
- `{type:'pipeline', sql}` — animates logical execution order FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT with the real intermediate tables.
- `{type:'groupby', table, key, agg, col?}` — rows flying into buckets and collapsing to one aggregate per bucket.
- `{type:'window', table, partition?, order, value, show?}` — partitions coloured; learner picks ROW_NUMBER/RANK/DENSE_RANK/running SUM/LAG/LEAD and clicks rows to see their window frame.
- `{type:'schema'}` — ER diagram of the lesson dataset. `{type:'nulls'}` — three-valued-logic truth table.
- `{type:'index', n?}` — full scan vs B-tree index search race. `{type:'bigo'}` — growth-curve race O(1)…O(2^n). `{type:'hashmap', keys?}` — insert keys, watch hashing into buckets and collisions.
Trace hints (for `code` cells with `trace`, challenges, and trace viz): `view` is one of
- `heap` — frames + objects with arrows. Objects linked by a `next` attribute are drawn as a horizontal chain (linked lists);
  objects with `left`/`right` attributes are drawn as a tree. Great for aliasing, mutation, OOP, linked lists, BSTs.
- `array` — the list/str in `var` drawn as indexed cells with `pointers` (names of int variables, e.g. `['lo','mid','hi']`) as arrows.
- `bars` — the numeric list in `var` as bars (sorting), with `pointers` highlighted.
- `calltree` — recursion tree of calls to `fn` with arguments and return values (fib, permutations, DFS).
- `grid` — 2D list `var` as a table (DP tables, matrices), last-changed cell highlighted.
- `graph` — dict-of-lists adjacency `var` drawn as nodes/edges; if `pointers` names a set/list variable (e.g. `['visited']`) those nodes are highlighted.

## SQL datasets (see src/sql/datasets.ts)
`toy` (students/clubs, shirts/sizes), `shop` (customers, products, orders, order_items), `hr` (departments, employees w/ manager_id,
salary ties, a NULL dept), `social` (users, follows, posts, likes, logins with streaks/gaps), `bank` (accounts, transactions),
`rides` (drivers, riders, trips with NULL fares on cancels), `streaming` (shows, subscriptions with cancellations, views).
SQLite dialect (window functions, RIGHT/FULL JOIN, recursive CTEs, `date()`, `strftime()`, `julianday()` all work).
Query the data yourself (a scratch vitest file) to learn exact values before writing predicts — then delete the scratch file.
