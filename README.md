# Excel Hero Academy

A zero-to-hero Excel course for bank / data-lake analysts that runs in your browser. It has an Excel-style workbook built in, with real Windows Excel shortcuts and Alt key-tips, a formula engine that supports cross-file references, and lessons that check your work automatically as you go.

## What's inside

| Area | What you get |
|---|---|
| **Learn** | 15 modules / 54 lessons, from "what is a cell" to dynamic arrays and banking analytics. Every task is checked live and comes with a "Why this matters" explanation, hints and a **Show me** replay. |
| **Cross-file lookups** | Several workbooks open at once (taskbar at the bottom). You can write `=VLOOKUP(B2,[Customer_Master.xlsx]Accounts!$A:$D,4,FALSE)` by typing it or the real keyboard way: `=VLOOKUP(B2,` → **Ctrl+Tab** → **Ctrl+Shift+↓/→** → `,4,FALSE)` → **Enter**. **Ctrl+[** follows a reference into the other file. |
| **Projects** | 5 capstones based on real analyst requests: month-end loan book, front-to-back trade recon, data-lake extract cleanup, multi-currency exposure, branch P&L variance. |
| **Quizzes** | One per module. Question types are multiple choice, *press the shortcut*, and *write the formula* (your formula is actually evaluated). 80% passes. |
| **Shortcut Dojo** | Timed drills in a live sheet with spaced repetition (Leitner boxes). White/Yellow/Black belts, combos, and a mastery chart for 68 shortcuts and Alt sequences. |
| **Rewards** | XP, a promotion ladder (Intern → Analyst → Associate → VP → MD → Excel Hero), daily goal ring, streaks and an activity heat-map. Also 30 achievements, 1–3 stars per lesson (bonus for no hints and keyboard-only), confetti, and a printable certificate. |
| **Sandbox** | Four linked sample bank files. You can open your own CSV and export any sheet. |
| **Reference** | Searchable shortcut sheet, Alt key-tip list and function reference (160+ functions). |

### The workbook
- **Look and layout:** green title bar, ribbon tabs (Home / Insert / Formulas / Data / View), Name Box, formula bar with coloured references, sheet tabs and a status bar (Average / Count / Min / Max / Sum).
- **Grid:** virtualised, frozen panes, gridlines toggle, column resize and autofit, text overflow, `####` for numbers that don't fit, and the fill handle (drag, or double-click to fill down).
- **Editing:** Enter, Edit and Point modes like Excel. Arrow keys insert references while you type a formula. **F4** cycles `$A$1 → A$1 → $A1`. Function autocomplete (Tab) and argument tool-tips.
- **Formulas:** 160+ functions, including VLOOKUP/HLOOKUP/XLOOKUP/INDEX/MATCH/XMATCH, SUMIFS/COUNTIFS/AVERAGEIFS/MAXIFS, IF/IFS/IFERROR/SWITCH/LET, text and date functions (EOMONTH, WORKDAY, NETWORKDAYS, DATEDIF…), dynamic arrays (UNIQUE, FILTER, SORT, SORTBY, SEQUENCE, TAKE with spill and `A2#`) and finance (PMT, IPMT, PPMT, NPV, IRR, XNPV, XIRR…).
- **Data tools:** sort (quick and multi-level), AutoFilter, Remove Duplicates, Text to Columns, PivotTables, conditional formatting, Find & Replace, Go To Special → Blanks with Ctrl+Enter, and Paste Special (values / formats / transpose).
- **Shortcuts:** Windows Excel shortcuts, plus Alt key-tips (Alt H V V, Alt E S V, Alt H O I, Alt W F F, Alt A S D, Alt N V…). On a Mac, ⌘ works as Ctrl.

> **Browser note:** browsers reserve a few keys (Ctrl+Tab, Ctrl+PgUp/PgDn, Ctrl+N/T/W). Click **⌨ Excel Keys** in the top bar to go full-screen with keyboard lock (Chrome/Edge), so those keys reach the app like real Excel. Alternatives also work: Ctrl+F6 to switch files, Ctrl+Alt+PgUp/PgDn to switch sheets.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

Other commands:

```bash
npm test             # engine + store unit tests, and proof that every lesson/project is solvable
npm run build        # production build in dist/ (deploy to Vercel / Netlify / GitHub Pages)
npm run build:single # ONE self-contained file: dist-single/index.html — double-click it, works offline
```

Progress is saved in your browser's localStorage. Use **Trophies → Export progress** to back it up or move it to another computer.

## How it's built (and why)

- **`src/engine/`** — a small spreadsheet engine with no dependencies.
  - `parser.ts`: tokenizer and Pratt parser. It keeps source positions so the same tokens power reference colouring, F4, and copy/insert reference shifting.
  - `calc.ts`: lazy, memoised evaluation over immutable workbook snapshots, with cycle detection and a two-pass spill for dynamic arrays. External refs (`[Book.xlsx]Sheet!A1`) resolve against every open workbook.
  - `functions.ts`: the function library. Scalar functions "lift" over arrays the way Excel 365 does.
- **`src/app/`** — the controller.
  - `store.ts`: selection, editing / point mode, undo snapshots, data tools.
  - `commands.ts`: every action is a named command, so a shortcut, a ribbon click and an Alt key-tip are the same thing to a lesson check.
  - `keyboard.ts`: keyboard routing.
- **`src/components/`** — React UI (Excel window, lesson Coach pane, quizzes, Dojo, pages).
- **`src/course/`** — content. Each lesson is data plus small `check` functions and a `solution` script. `course.test.ts` replays every solution and asserts each check *fails before* and *passes after*, so no lesson can be broken or give free points. See `docs/CONTENT_GUIDE.md` to add your own lessons.
