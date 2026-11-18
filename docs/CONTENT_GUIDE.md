# Writing course content

Each module lives in `src/course/modules/mNN_name.ts` and exports `module: Module`.
Each capstone project lives in `src/course/projects/pN_name.ts` and exports `project: Lesson`.
Both are auto-discovered (import.meta.glob) — no registry to edit.

Read these files first:
- `src/course/types.ts` — the schema (Module, Lesson, Task, CheckCtx, SolutionStep, QuizQuestion)
- `src/course/modules/m01_grid.ts` — the reference example. Match its tone and depth.
- `src/course/data.ts` — seeded bank datasets (customers, loans, transactions, trades, FX) + `makeBook`/`makeSheet`
- `src/course/runner.ts` — check helpers (`valuesEqual`, `formulasMatch`, `approx`, `all`) and how solutions run
- `src/app/commands.ts` — every command id (use these in `{ cmd }` steps, `mustUseKeys`, `used()` checks, quiz `keys` questions)
- `src/engine/functions.ts` — supported functions (FUNCS). Only teach functions that exist there.

## Rules
1. **Every task must be auto-checkable and solvable.** `npx vitest run src/course` runs each lesson:
   the check must NOT pass before the solution and MUST pass after it. Tasks run in order and state carries over.
2. Unqualified refs in checks (`c.v('D2')`) mean the FIRST sheet of the FIRST workbook. Qualify otherwise:
   `c.v('Summary!B2')`, `c.v('[Loan_Tape.xlsx]Tape!D2')`.
3. Compute expected answers in TypeScript from the same seeded data (don't hand-type numbers).
   Check both the *values* and that the cells contain the right kind of *formula* (no hard-coding).
4. Checks return `true` or a short, specific, kind message telling the learner what is still wrong
   (e.g. "D7 shows #N/A — is your table range locked with $?").
5. Instructions use mini-markup: `**bold**`, `` `code` ``, `[[Ctrl+D]]` key caps, blank line = paragraph, `- ` bullets.
6. Always include `why` on tasks: the reasoning, when you'd use it at a bank, common mistakes. The learner
   wants to understand the chain of thought, not just keystrokes.
7. 2–4 hints per task, from gentle nudge to near-answer. The `solution` doubles as the "Show me" replay.
8. Bank / data-lake flavour: loan tapes, GL extracts, trade recon, customer masters, branch reports, month-end.
9. Module quiz: 8–10 questions mixing `mc`, `keys` (press the shortcut) and `formula` (learner types a formula
   evaluated against a small grid; `model` must evaluate to `expect`; the grid row 1 is A1).
10. Keep datasets small enough to be friendly (≤ 250 rows).
