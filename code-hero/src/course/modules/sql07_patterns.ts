import type { Module } from '../types';

export const module: Module = {
  id: 'sql07',
  track: 'sql',
  order: 7,
  title: 'Interview Patterns',
  icon: '🧩',
  level: 'Interview',
  blurb: 'The recurring big-tech SQL questions — Nth highest, de-dup, streaks, retention, funnels, growth, median, "X but not Y" — each with a recognition cue and a template.',
  boss: ['sql-gym-longest-streak', 'sql-gym-cohort-matrix', 'sql-gym-top2-per-category'],
  lessons: [
    // ------------------------------------------------------------------ L1
    {
      id: 'sql07-l1',
      track: 'sql',
      title: 'Nth highest & the median',
      summary: 'Three ways to get the second / Nth highest value, why ties break LIMIT/OFFSET, and a portable median recipe.',
      minutes: 16,
      faang: '"Second highest salary" is the most famous SQL screen question of all time, and interviewers still use it in 2026-27 because the follow-ups ("now with ties", "now per department", "return NULL if there is none", "now the median") separate template-memorisers from people who understand ranking.',
      tags: ['Nth highest', 'DENSE_RANK', 'LIMIT/OFFSET', 'Median', 'Ties'],
      dataset: 'hr',
      cells: [
        {
          kind: 'md',
          text: `Most big-tech SQL rounds are built from about **eight recurring patterns**. This module gives each one a *recognition cue* (how to spot it in the wording) and a *template* (the shape of the answer).

**Pattern 1 — Nth highest.** First look at the salaries sorted from top to bottom. Pick each ranking function in the panel and watch the two engineers on **165000**.`,
        },
        { kind: 'viz', viz: { type: 'window', table: 'employees', order: 'salary', value: 'salary', show: ['name', 'salary'] }, caption: 'Tom and Yuki both earn 165000. ROW_NUMBER gives them **different** numbers; RANK and DENSE_RANK give them the **same** number. Now check the next salary: RANK skips a number, DENSE_RANK does not.' },
        {
          kind: 'callout',
          tone: 'interview',
          title: 'How to recognise it',
          text: 'Wording like **"second highest"**, **"Nth largest"**, **"runner-up"**, **"top earner excluding the max"**. Your first clarifying question: *"Nth highest distinct **value**, or Nth **row**? And what should happen with ties?"* Asking that out loud is worth points on its own.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT salary
FROM employees
ORDER BY salary DESC
LIMIT 1 OFFSET 8;`,
          predict: { question: '`OFFSET 8` skips 8 rows and returns the 9th. Which salary comes back?', options: ['150000', '165000', '125000', '132000'], answer: 1, fromOutput: true, explain: 'Rows 8 and 9 are Tom and Yuki, both on **165000**. LIMIT/OFFSET counts **rows**, so a tie makes the "9th highest" a duplicate of the 8th. Add `DISTINCT` (`SELECT DISTINCT salary …`) to count values instead.' },
          note: 'For the Nth row you skip N−1 rows: `LIMIT 1 OFFSET N-1`.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `WITH ranked AS (
  SELECT name, salary,
         DENSE_RANK() OVER (ORDER BY salary DESC) AS rnk
  FROM employees
)
SELECT DISTINCT salary
FROM ranked
WHERE rnk = 9;`,
          predict: { question: 'Same question, but with DENSE_RANK = 9. What comes back now?', options: ['165000', '150000', '140000', 'No rows'], answer: 1, fromOutput: true, explain: 'DENSE_RANK gives both 165000 rows rank 8, so rank 9 is the next **distinct** salary: **150000** (Ben Cohen). This is the version that survives the "what about ties?" follow-up.' },
          note: 'You cannot write `WHERE DENSE_RANK() … = 9` directly — window functions run after WHERE, so rank in a CTE, filter outside.',
        },
        {
          kind: 'md',
          text: `Three templates, from narrowest to most general:

- **MAX subquery** (only for N = 2): \`SELECT MAX(salary) FROM employees WHERE salary < (SELECT MAX(salary) FROM employees)\`
- **DISTINCT + LIMIT/OFFSET**: any N, one global list only.
- **DENSE_RANK in a CTE**: any N, ties handled, and add \`PARTITION BY dept_id\` to get it **per group**.

Lead with DENSE_RANK in interviews. **Trap:** if there is no Nth value these return *zero rows*; wrap as \`SELECT (subquery) AS nth\` to get one row with NULL.`,
        },
        {
          kind: 'challenge',
          id: 'sql07-l1-c1',
          lang: 'sql',
          title: 'Runner-up in every department',
          prompt: 'For each department, return the employee(s) with the **second-highest distinct salary**: `dept` (department name), `name`, `salary`. Ignore the employee with no department. Order by `dept`, then `name`.',
          starter: `SELECT d.name AS dept, e.name, e.salary
FROM employees e
JOIN departments d ON d.id = e.dept_id
ORDER BY e.salary DESC
LIMIT 1 OFFSET 1;`,
          hints: [
            'The starter finds the runner-up of the whole company. You need one ranking **per department** → `PARTITION BY`.',
            'In a CTE: `DENSE_RANK() OVER (PARTITION BY e.dept_id ORDER BY e.salary DESC) AS rnk`.',
            'Outside the CTE: `WHERE rnk = 2 ORDER BY dept, name`.',
          ],
          solution: `WITH ranked AS (
  SELECT d.name AS dept, e.name, e.salary,
         DENSE_RANK() OVER (PARTITION BY e.dept_id ORDER BY e.salary DESC) AS rnk
  FROM employees e
  JOIN departments d ON d.id = e.dept_id
)
SELECT dept, name, salary
FROM ranked
WHERE rnk = 2
ORDER BY dept, name;`,
          explain: '`PARTITION BY` restarts the ranking for each department, DENSE_RANK makes "second" mean the second distinct salary, and the filter has to live outside the CTE because window functions are computed after WHERE.',
          sql: { ordered: true },
        },
        {
          kind: 'md',
          text: `**Pattern 2 — the median.** Means get dragged around by outliers (one VP salary pulls the average up); the median is the middle value of the sorted list.

SQLite has no \`MEDIAN()\` (Postgres/Snowflake have \`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x)\`). The portable recipe is the same "position in a sorted list" idea as Nth highest:

1. number the rows in order with \`ROW_NUMBER()\`
2. count them with \`COUNT(*) OVER ()\`
3. keep the middle one (odd count) or two (even count) and \`AVG\` them.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `WITH r AS (
  SELECT salary,
         ROW_NUMBER() OVER (ORDER BY salary) AS rn,
         COUNT(*) OVER () AS n
  FROM employees
)
SELECT AVG(salary) AS median_salary
FROM r
WHERE rn IN ((n + 1) / 2, (n + 2) / 2);`,
          predict: { question: 'There are 18 employees, so rows 9 and 10 are averaged. What is the median?', options: ['165833.33', '157500', '165000', '150000'], answer: 1, fromOutput: true, explain: 'Sorted ascending, row 9 is 150000 and row 10 is 165000 → median **157500**. The mean (165833.33) is higher because a few big salaries pull it up — exactly why analysts report medians.' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: the two middle seats',
          text: 'Picture people sitting in a row of chairs sorted by salary. `(n+1)/2` and `(n+2)/2` (integer division) are **the two middle seats**. With 18 people they are seats 9 and 10; with 17 people both formulas point at seat 9 — one formula, odd or even.',
        },
        {
          kind: 'challenge',
          id: 'sql07-l1-c2',
          lang: 'sql',
          title: 'Median salary per department',
          prompt: 'Return each department\'s `dept` (name) and `median_salary`. Skip the employee with no department. Order by `dept`.',
          starter: `SELECT d.name AS dept, AVG(e.salary) AS median_salary
FROM employees e
JOIN departments d ON d.id = e.dept_id
GROUP BY d.name
ORDER BY dept;`,
          hints: [
            'AVG of the whole department is the **mean**, not the median. Number the rows *within* each department.',
            '`ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary)` and `COUNT(*) OVER (PARTITION BY dept_id)`.',
            'Keep `rn IN ((n + 1) / 2, (n + 2) / 2)`, then `GROUP BY` the department and take `AVG(salary)`.',
          ],
          solution: `WITH r AS (
  SELECT d.name AS dept, e.salary,
         ROW_NUMBER() OVER (PARTITION BY e.dept_id ORDER BY e.salary) AS rn,
         COUNT(*) OVER (PARTITION BY e.dept_id) AS n
  FROM employees e
  JOIN departments d ON d.id = e.dept_id
)
SELECT dept, AVG(salary) AS median_salary
FROM r
WHERE rn IN ((n + 1) / 2, (n + 2) / 2)
GROUP BY dept
ORDER BY dept;`,
          explain: 'Same recipe, partitioned: each department gets its own numbering and count, the middle seat(s) survive the filter, and the final AVG collapses one or two middle values into the median.',
          sql: { ordered: true },
        },
        {
          kind: 'quiz',
          id: 'sql07-l1-q1',
          q: 'You need the **3rd highest distinct salary in each department**, ties included. Which tool fits best?',
          options: ['`ORDER BY salary DESC LIMIT 1 OFFSET 2`', '`MAX(salary)` with two nested subqueries', '`DENSE_RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC)` then `= 3`', '`ROW_NUMBER() OVER (ORDER BY salary DESC)` then `= 3`'],
          answer: 2,
          explain: 'LIMIT/OFFSET works on one global list, nested MAX gets unreadable past N = 2, and ROW_NUMBER splits ties into different positions. DENSE_RANK + PARTITION BY handles groups **and** ties.',
        },
        { kind: 'recall', prompt: 'Without scrolling: what are the three ways to find the second-highest salary, and which one handles ties *and* groups?', answer: '1) MAX(salary) WHERE salary < (SELECT MAX…), 2) SELECT DISTINCT … ORDER BY … DESC LIMIT 1 OFFSET 1, 3) DENSE_RANK() in a CTE then filter rnk = 2. DENSE_RANK (with PARTITION BY) handles ties and per-group.' },
        { kind: 'explain', id: 'sql07-l1-e1', prompt: 'Explain to a teammate why `LIMIT 1 OFFSET 8` and `DENSE_RANK() = 9` gave different answers on this table.' },
      ],
      cards: [
        { id: 'sql07-l1-k1', kind: 'concept', front: 'Salaries 100, 90, 90, 80: what do RANK and DENSE_RANK give the 80?', back: 'RANK → 4 (it skips 3). DENSE_RANK → 3 (no gaps).' },
        { id: 'sql07-l1-k2', kind: 'cloze', text: 'Nth highest distinct salary: `SELECT DISTINCT salary FROM employees ORDER BY salary DESC LIMIT 1 {{}} N-1`', answers: ['OFFSET'] },
        { id: 'sql07-l1-k3', kind: 'sql', prompt: 'Return the **third-highest distinct salary** in hr.employees as a single value (NULL if it does not exist).', dataset: 'hr', solution: 'SELECT (SELECT DISTINCT salary FROM employees ORDER BY salary DESC LIMIT 1 OFFSET 2) AS third_highest;' },
        { id: 'sql07-l1-k4', kind: 'cloze', text: 'Median middle positions (integer division): `rn IN (({{}}) / 2, ({{}}) / 2)`', answers: ['n + 1', 'n + 2'] },
        { id: 'sql07-l1-k5', kind: 'concept', front: 'Why can\'t you write `WHERE DENSE_RANK() OVER (…) = 2`?', back: 'Window functions are computed after WHERE (in the SELECT step). Rank inside a CTE/subquery, then filter in the outer query.' },
      ],
    },

    // ------------------------------------------------------------------ L2
    {
      id: 'sql07-l2',
      track: 'sql',
      title: 'Duplicates & "did X but not Y"',
      summary: 'Find duplicate events with GROUP BY/HAVING, keep exactly one with ROW_NUMBER, and answer "users who did X but never Y" at the user level.',
      minutes: 16,
      faang: 'Event logs at Meta, Netflix and Amazon are delivered "at least once", so duplicates are a daily reality — "find and remove the duplicates" is a staple data-engineering screen. "Users who did X but not Y" is the most common way interviewers test whether you think in rows or in entities.',
      tags: ['Duplicates', 'ROW_NUMBER', 'De-dup', 'Anti-join', 'EXCEPT', 'Netflix-style'],
      dataset: 'streaming',
      cells: [
        {
          kind: 'md',
          text: `**Pattern 3 — duplicates.** Streaming apps log a "view" event every time someone watches a show. Networks retry, so the same event can land twice.

Detection is one GROUP BY: group by the columns that **define** a duplicate, keep groups with more than one row.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT user_id, show_id, view_date, COUNT(*) AS copies
FROM views
GROUP BY user_id, show_id, view_date
HAVING COUNT(*) > 1;`,
          predict: { question: 'A duplicate = same user, same show, same day. How many duplicate groups are in `views`?', options: ['0', '1', '3', '11'], answer: 1, fromOutput: true, explain: 'Exactly **one**: user 6 watched show 3 twice on 2024-03-15. (If you grouped by just user and show you would get 11 — rewatching on different days is not a duplicate. Defining the key is the real question.)' },
        },
        {
          kind: 'callout',
          tone: 'interview',
          title: 'How to recognise it',
          text: '**"Find duplicates"**, **"appears more than once"**, **"de-duplicate"**, **"keep only the latest / first record per X"**. Detection → `GROUP BY key HAVING COUNT(*) > 1`. Removal → `ROW_NUMBER() OVER (PARTITION BY key ORDER BY rule)` and keep `rn = 1`. Always ask: *which columns make two rows "the same", and which copy wins?*',
        },
        { kind: 'viz', viz: { type: 'window', table: 'views', partition: 'user_id', order: 'view_date', value: 'minutes', show: ['id', 'user_id', 'show_id', 'view_date', 'minutes'] }, caption: 'Pick **ROW_NUMBER**: every partition gets 1, 2, 3… The two copies of user 6\'s view (ids 12 and 42) have **different minutes** (92 vs 110), so `SELECT DISTINCT *` keeps both. De-dup = partition by the duplicate key, order by the winning rule, keep row 1.' },
        {
          kind: 'code',
          lang: 'sql',
          code: `WITH ranked AS (
  SELECT *,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, show_id, view_date
           ORDER BY minutes DESC, id
         ) AS rn
  FROM views
)
SELECT COUNT(*) AS clean_rows
FROM ranked
WHERE rn = 1;`,
          predict: { question: '`views` has 45 rows and one duplicate pair. How many rows survive `rn = 1`?', options: ['29', '44', '45', '1'], answer: 1, fromOutput: true, explain: 'Each duplicate group keeps exactly one row, every other row is already alone with rn = 1 → **44**. The `ORDER BY minutes DESC, id` rule keeps the longer (110-minute) copy, with id as a tie-breaker so the result is deterministic.' },
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'ROW_NUMBER, not RANK',
          text: 'If the two copies tied on your ORDER BY, `RANK()` would give **both** rank 1 and you would keep the duplicate. `ROW_NUMBER()` always breaks ties, so exactly one row per key survives. Add a unique column (like `id`) as the last tie-breaker to make the winner deterministic.',
        },
        {
          kind: 'challenge',
          id: 'sql07-l2-c1',
          lang: 'sql',
          title: 'First watch of every show',
          prompt: 'For every (user, show) pair, return the user\'s **first** view of that show: `user_id`, `show_id`, `view_date`, `minutes`. If two views tie on the earliest date, keep the one with more minutes. Order by `user_id`, `show_id`.',
          starter: `SELECT user_id, show_id, view_date, minutes
FROM views
ORDER BY user_id, show_id;`,
          hints: [
            'One row per (user_id, show_id) → that pair is your `PARTITION BY`.',
            'The winner is the earliest date, then the most minutes: `ORDER BY view_date, minutes DESC`.',
            'Rank in a CTE with `ROW_NUMBER()`, then keep `WHERE rn = 1`.',
          ],
          solution: `WITH ranked AS (
  SELECT user_id, show_id, view_date, minutes,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, show_id
           ORDER BY view_date, minutes DESC
         ) AS rn
  FROM views
)
SELECT user_id, show_id, view_date, minutes
FROM ranked
WHERE rn = 1
ORDER BY user_id, show_id;`,
          explain: '"Keep the first/latest/best row per X" is the de-dup template with a different key. MIN(view_date) alone could not give you the matching `minutes` — ROW_NUMBER keeps the **whole row**.',
          sql: { ordered: true },
        },
        {
          kind: 'md',
          text: `**Pattern 4 — "did X but not Y".** Example: *users who watched a Comedy but never a Sci-Fi show.*

The question is about **users**, but each row of \`views\` is one **view**. A WHERE clause looks at one row at a time, and one row can never tell you what a user *never* did. Predict what the naive query does:`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT DISTINCT v.user_id
FROM views v
JOIN shows s ON s.id = v.show_id
WHERE s.genre = 'Comedy' AND s.genre <> 'Sci-Fi';`,
          predict: { question: 'How many users does this return? (The correct answer to the question is 4.)', options: ['4', '7', '0', '3'], answer: 1, fromOutput: true, explain: 'All **7** users have at least one Comedy view, and every Comedy row trivially satisfies `<> \'Sci-Fi\'`. The condition is checked per **row**, but "never" is a fact about the **user\'s whole history**.' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: the passport, not the stamp',
          text: "Each row is one **stamp**; the user is the **passport**. \"Visited France but never Spain\" can only be answered by flipping through the whole passport — so first collapse to **one row per user**, *then* ask the question:\n\n```sql\nSELECT v.user_id\nFROM views v JOIN shows s ON s.id = v.show_id\nGROUP BY v.user_id\nHAVING SUM(s.genre = 'Comedy') > 0   -- at least one Comedy\n   AND SUM(s.genre = 'Sci-Fi') = 0;  -- zero Sci-Fi\n```\n\nIn SQLite a comparison is 1/0, so `SUM(cond)` counts matching rows (portable: `SUM(CASE WHEN … THEN 1 ELSE 0 END)`). `EXCEPT` and `NOT EXISTS` work too.",
        },
        {
          kind: 'challenge',
          id: 'sql07-l2-c2',
          lang: 'sql',
          title: 'Documentary fans who skipped Sci-Fi',
          prompt: 'Return the `user_id` and `plan` of every subscriber who watched at least one **Documentary** but **never** a **Sci-Fi** show. Order by `user_id`.',
          starter: `SELECT DISTINCT v.user_id, sub.plan
FROM views v
JOIN shows s ON s.id = v.show_id
JOIN subscriptions sub ON sub.user_id = v.user_id
WHERE s.genre = 'Documentary' AND s.genre <> 'Sci-Fi'
ORDER BY v.user_id;`,
          hints: [
            'The starter tests each row on its own, so a user who also watched Sci-Fi on another row still slips through.',
            'Group to one row per user: `GROUP BY v.user_id, sub.plan`.',
            "`HAVING SUM(s.genre = 'Documentary') > 0 AND SUM(s.genre = 'Sci-Fi') = 0`",
          ],
          solution: `SELECT v.user_id, sub.plan
FROM views v
JOIN shows s ON s.id = v.show_id
JOIN subscriptions sub ON sub.user_id = v.user_id
GROUP BY v.user_id, sub.plan
HAVING SUM(s.genre = 'Documentary') > 0
   AND SUM(s.genre = 'Sci-Fi') = 0
ORDER BY v.user_id;`,
          explain: 'Users 4 and 6 watched documentaries **and** Sci-Fi, so the row-level filter wrongly kept them. Moving the logic to HAVING evaluates each user\'s whole history at once.',
          sql: { ordered: true },
        },
        {
          kind: 'quiz',
          id: 'sql07-l2-q1',
          q: 'Which query does **not** correctly find users who watched Comedy but never Sci-Fi?',
          options: [
            "Comedy viewers `EXCEPT` Sci-Fi viewers",
            "Comedy viewers `WHERE NOT EXISTS` (a Sci-Fi view by the same user)",
            "`GROUP BY user_id HAVING SUM(genre='Comedy') > 0 AND SUM(genre='Sci-Fi') = 0`",
            "`WHERE genre = 'Comedy' AND genre <> 'Sci-Fi'`",
          ],
          answer: 3,
          explain: 'The WHERE version filters single rows, so it can never see that the same user has a Sci-Fi row elsewhere. The other three all reason about the user\'s full set of views.',
        },
        { kind: 'recall', prompt: 'What is the de-dup template, in one line?', answer: 'ROW_NUMBER() OVER (PARTITION BY <duplicate key> ORDER BY <winning rule>, <unique tie-breaker>) in a CTE, then keep rn = 1.' },
        { kind: 'explain', id: 'sql07-l2-e1', prompt: 'Explain why a WHERE clause can never answer "users who never did Y", and name two constructs that can.' },
      ],
      cards: [
        { id: 'sql07-l2-k1', kind: 'concept', front: 'Duplicate detection template?', back: '`GROUP BY <key columns> HAVING COUNT(*) > 1`' },
        { id: 'sql07-l2-k2', kind: 'cloze', text: 'De-dup: `ROW_NUMBER() OVER ({{}} BY key ORDER BY rule)` then keep `rn = {{}}`', answers: ['PARTITION', '1'] },
        { id: 'sql07-l2-k3', kind: 'concept', front: 'Why ROW_NUMBER and not RANK for de-dup?', back: 'RANK gives tied rows the same rank, so both copies could have rank 1. ROW_NUMBER always yields exactly one row 1.' },
        { id: 'sql07-l2-k4', kind: 'sql', prompt: 'streaming: user_ids who watched a Drama but never a Reality show.', dataset: 'streaming', solution: "SELECT v.user_id FROM views v JOIN shows s ON s.id = v.show_id GROUP BY v.user_id HAVING SUM(s.genre = 'Drama') > 0 AND SUM(s.genre = 'Reality') = 0;" },
        { id: 'sql07-l2-k5', kind: 'concept', front: '"Did X but not Y" — the core mental shift?', back: 'Think per entity (user), not per row: collapse to one row per user (GROUP BY / EXCEPT / NOT EXISTS) before testing "never".' },
      ],
    },

    // ------------------------------------------------------------------ L3
    {
      id: 'sql07-l3',
      track: 'sql',
      title: 'Streaks & retention',
      summary: 'Gaps & islands with the "date minus row number" trick, and day-1 / week-1 retention with a LEFT JOIN that keeps the denominator honest.',
      minutes: 18,
      faang: 'Consecutive-day streaks ("users active 3+ days in a row") and day-1/week-1 retention are signature Meta- and TikTok-style product-analytics questions. Interviewers watch for the gaps-and-islands trick and for a correct denominator — the two places most candidates slip.',
      tags: ['Gaps & islands', 'Streaks', 'Retention', 'ROW_NUMBER', 'Meta-style'],
      dataset: 'social',
      cells: [
        { kind: 'viz', viz: { type: 'window', table: 'logins', partition: 'user_id', order: 'login_date', value: 'login_date', show: ['user_id', 'login_date'] }, caption: 'Pick **ROW_NUMBER** and look at user 1: dates 04-01 … 04-05 climb by one day while the row number climbs by one. Then 04-09 — the date jumps, the row number doesn\'t.' },
        {
          kind: 'md',
          text: `**Pattern 5 — gaps & islands (streaks).** An *island* is a run of consecutive days; a *gap* is a missing day between runs.

The trick: inside a streak, the **date** and the **row number** both go up by exactly 1 each row — so \`date − row_number\` stays **constant**. When a day is missed, the date jumps but the row number doesn't, and the difference changes. That constant is the streak's ID.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT user_id, login_date,
       ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY login_date) AS rn,
       date(login_date,
            '-' || ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY login_date) || ' days') AS grp
FROM logins
WHERE user_id IN (1, 3)
ORDER BY user_id, login_date;`,
          predict: { question: 'User 1 logged in on 04-01…04-05, 04-09, 04-10 and 04-16. How many **different** `grp` values will user 1 get?', options: ['1', '3', '5', '8'], answer: 1, explain: 'Three islands → three IDs: 2024-03-31 (the 5-day run), 2024-04-03 (the 2-day run), 2024-04-08 (the single day). The grp date itself is meaningless — only "same or different" matters.' },
          note: "`date(d, '-3 days')` subtracts days in SQLite. In Postgres it's `login_date - rn * INTERVAL '1 day'`; in many engines `DATEADD(day, -rn, login_date)`.",
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: two escalators',
          text: 'The calendar and the row counter are **two escalators moving at the same speed**. While you keep logging in daily you ride side by side, so the distance between you stays the same. Miss a day and the calendar escalator jumps ahead — new distance, new island.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `WITH g AS (
  SELECT user_id, login_date,
         julianday(login_date)
           - ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY login_date) AS grp
  FROM logins
)
SELECT user_id, MIN(login_date) AS start_date, MAX(login_date) AS end_date,
       COUNT(*) AS days
FROM g
GROUP BY user_id, grp
ORDER BY user_id, start_date;`,
          predict: { question: 'Once each streak has an ID, `GROUP BY user_id, grp` gives one row per island. How many islands are there across all 10 users?', options: ['10', '19', '43', '5'], answer: 1, fromOutput: true, explain: '**19** islands from 43 logins. User 2 alone has 4 single-day islands (every other day), user 7 has one 7-day island.' },
          note: '`julianday()` turns a date into a day number, so subtracting the row number is plain arithmetic.',
        },
        {
          kind: 'callout',
          tone: 'interview',
          title: 'How to recognise it',
          text: '**"Consecutive days"**, **"N days in a row"**, **"longest streak"**, **"continuous periods"**, **"sessions"**. Template: `date − ROW_NUMBER()` → `GROUP BY` the difference → `COUNT/MIN/MAX`. Ask first: *can a user log in twice in one day?* If so, de-dup with `SELECT DISTINCT user_id, login_date` first — otherwise the row number advances twice on the same date and splits the streak.',
        },
        {
          kind: 'challenge',
          id: 'sql07-l3-c1',
          lang: 'sql',
          title: 'Three days in a row',
          prompt: 'Return `user_id` and `longest_streak` (in days) for every user whose longest run of consecutive login days is **3 or more**. Order by `longest_streak` descending, then `user_id`.',
          starter: `SELECT user_id, COUNT(*) AS longest_streak
FROM logins
GROUP BY user_id
HAVING COUNT(*) >= 3
ORDER BY longest_streak DESC, user_id;`,
          hints: [
            'The starter counts *total* logins — user 2 has 4 logins but never two days in a row.',
            'Build the island ID first: `julianday(login_date) - ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY login_date) AS grp`.',
            'Count rows per `(user_id, grp)` to get each streak\'s length, then take `MAX(...)` per user and keep `>= 3`.',
          ],
          solution: `WITH g AS (
  SELECT user_id,
         julianday(login_date)
           - ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY login_date) AS grp
  FROM logins
),
streaks AS (
  SELECT user_id, COUNT(*) AS len
  FROM g
  GROUP BY user_id, grp
)
SELECT user_id, MAX(len) AS longest_streak
FROM streaks
GROUP BY user_id
HAVING MAX(len) >= 3
ORDER BY longest_streak DESC, user_id;`,
          explain: 'Three layers: tag each row with its island, measure each island, keep each user\'s biggest island. Interviewers love this because the starter\'s "count all logins" bug is exactly what rushed candidates write.',
          sql: { ordered: true },
        },
        {
          kind: 'md',
          text: `**Pattern 6 — retention.** *"Of the users who first showed up on day 0, what % came back on day 1?"*

1. **Anchor**: each user's first activity date (\`MIN(login_date)\`).
2. **Look for the return**: LEFT JOIN activity on \`anchor + 1 day\`.
3. **Ratio**: matched users ÷ **all** anchored users.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `WITH firsts AS (
  SELECT user_id, MIN(login_date) AS first_day
  FROM logins
  GROUP BY user_id
)
SELECT ROUND(100.0 * COUNT(l.user_id) / COUNT(*), 1) AS day1_retention_pct
FROM firsts f
LEFT JOIN logins l
  ON l.user_id = f.user_id
 AND l.login_date = date(f.first_day, '+1 day');`,
          predict: { question: 'Users 2, 4 and 8 did **not** log in the day after their first login. What is day-1 retention?', options: ['50', '70', '80', '100'], answer: 1, fromOutput: true, explain: '7 of 10 users came back → **70%**. `COUNT(*)` counts every anchored user (the denominator), `COUNT(l.user_id)` counts only those whose LEFT JOIN found a day-1 login (NULLs are not counted).' },
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'Two denominator killers',
          text: '1) An **INNER JOIN** drops the users who did not return — your denominator shrinks to only returners and retention is always 100%. Use LEFT JOIN. 2) **Integer division**: `7 / 10` is `0` in SQLite and Postgres. Multiply by `100.0` first.',
        },
        {
          kind: 'challenge',
          id: 'sql07-l3-c2',
          lang: 'sql',
          title: 'Week-1 → week-2 retention',
          prompt: 'Of the users who logged in during **week 1** (2024-04-01 to 2024-04-07 inclusive), how many also logged in during **week 2** (2024-04-08 to 2024-04-14)? Return one row: `week1_users`, `retained`, `retention_pct` (rounded to 1 decimal).',
          starter: `SELECT COUNT(DISTINCT user_id) AS week1_users,
       0 AS retained,
       0 AS retention_pct
FROM logins
WHERE login_date BETWEEN '2024-04-01' AND '2024-04-07';`,
          hints: [
            'Make two sets of distinct users in CTEs: `w1` (week-1 logins) and `w2` (week-2 logins).',
            '`FROM w1 LEFT JOIN w2 ON w2.user_id = w1.user_id` keeps every week-1 user; `COUNT(w2.user_id)` counts the returners.',
            '`ROUND(100.0 * COUNT(w2.user_id) / COUNT(*), 1) AS retention_pct`',
          ],
          solution: `WITH w1 AS (
  SELECT DISTINCT user_id FROM logins
  WHERE login_date BETWEEN '2024-04-01' AND '2024-04-07'
),
w2 AS (
  SELECT DISTINCT user_id FROM logins
  WHERE login_date BETWEEN '2024-04-08' AND '2024-04-14'
)
SELECT COUNT(*) AS week1_users,
       COUNT(w2.user_id) AS retained,
       ROUND(100.0 * COUNT(w2.user_id) / COUNT(*), 1) AS retention_pct
FROM w1
LEFT JOIN w2 ON w2.user_id = w1.user_id;`,
          explain: '8 users were active in week 1 and 4 of them (users 1, 3, 5, 9) came back in week 2 → 50.0%. `DISTINCT` in each CTE matters: without it, a user with several week-2 logins would be counted several times.',
        },
        {
          kind: 'quiz',
          id: 'sql07-l3-q1',
          q: 'A bug logs user 5 twice on 2024-04-07. What happens to the `date − ROW_NUMBER()` streak trick?',
          options: ['Nothing — dates are the same', 'The streak 04-06…04-08 is split into two islands', 'The query errors', 'The streak gets longer by one day'],
          answer: 1,
          explain: 'The duplicate row bumps the row number without moving the date, so the difference changes mid-streak and one island becomes two. De-dup to one row per user per day first.',
        },
        { kind: 'recall', prompt: 'State the gaps & islands trick in one sentence.', answer: 'Within a run of consecutive dates, date minus ROW_NUMBER() (per user, ordered by date) is constant, so GROUP BY that difference to get one row per streak.' },
        { kind: 'explain', id: 'sql07-l3-e1', prompt: 'Explain why retention must use a LEFT JOIN from the "first activity" set, and what goes wrong with an INNER JOIN.' },
      ],
      cards: [
        { id: 'sql07-l3-k1', kind: 'concept', front: 'Gaps & islands: what stays constant within a streak?', back: '`date − ROW_NUMBER() OVER (PARTITION BY user ORDER BY date)` — use it as the streak ID.' },
        { id: 'sql07-l3-k2', kind: 'cloze', text: "SQLite: subtract N days with `date(d, '-' || {{}} || ' days')`; day number with `{{}}(d)`", answers: ['N', 'julianday'] },
        { id: 'sql07-l3-k3', kind: 'concept', front: 'Day-1 retention denominator?', back: 'ALL users with a first-activity date (LEFT JOIN from the anchor set) — not just the ones who came back.' },
        { id: 'sql07-l3-k4', kind: 'sql', prompt: 'social: return each user_id with their number of login streaks (islands).', dataset: 'social', solution: 'WITH g AS (SELECT user_id, julianday(login_date) - ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY login_date) AS grp FROM logins) SELECT user_id, COUNT(DISTINCT grp) AS streaks FROM g GROUP BY user_id;' },
        { id: 'sql07-l3-k5', kind: 'concept', front: 'Why is `SELECT 7 / 10` a retention bug?', back: 'Integer division → 0. Write `100.0 * 7 / 10` (or CAST to REAL) to get 70.0.' },
      ],
    },

    // ------------------------------------------------------------------ L4
    {
      id: 'sql07-l4',
      track: 'sql',
      title: 'Growth, cohorts & funnels',
      summary: 'Month-over-month growth with LAG, the missing-month trap, cohort return rates, and funnel conversion with conditional aggregation.',
      minutes: 18,
      faang: 'MoM growth, cohort retention and funnel conversion are the bread and butter of Amazon/Meta/Uber-style product and business analytics rounds. The 2026-27 twist is the follow-up: "what if a month has no data?", "what\'s the denominator?", "why is it 87 and not 87.5?"',
      tags: ['LAG', 'MoM growth', 'Cohorts', 'Funnels', 'Conversion rate', 'Amazon-style'],
      dataset: 'shop',
      cells: [
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT strftime('%Y-%m', order_date) AS month, COUNT(*) AS orders
FROM orders
GROUP BY month
ORDER BY month;`,
          predict: { question: 'Orders run from January to June 2024. How many rows (months) come back?', options: ['4', '6', '12', '24'], answer: 1, fromOutput: true, explain: '**6** months, 2024-01 … 2024-06. `strftime(\'%Y-%m\', d)` buckets dates into months — always aggregate to **one row per period** before comparing periods.' },
        },
        {
          kind: 'md',
          text: `**Pattern 7 — period-over-period growth.** \`LAG(x) OVER (ORDER BY month)\` reaches back one row and hands you the previous month's value, right next to this month's.

Growth % = \`(this − previous) / previous × 100\`.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `WITH m AS (
  SELECT strftime('%Y-%m', order_date) AS month, COUNT(*) AS orders
  FROM orders
  GROUP BY month
)
SELECT month, orders,
       LAG(orders) OVER (ORDER BY month) AS prev,
       ROUND(100.0 * (orders - LAG(orders) OVER (ORDER BY month))
             / LAG(orders) OVER (ORDER BY month), 1) AS mom_pct
FROM m
ORDER BY month;`,
          predict: { question: 'February had 1 order, March had 4. What is March\'s `mom_pct`?', options: ['75', '300', '400', '-75'], answer: 1, explain: '(4 − 1) / 1 × 100 = **300**% growth. (400 would be "March as a % of February".) January\'s mom_pct is NULL — there is no earlier row to LAG to.' },
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'LAG = previous ROW, not previous MONTH',
          text: "Count only **delivered** orders and February disappears (it had none). Now LAG pairs March with **January** and calls it month-over-month. Fix: build a full month list (a calendar table or recursive CTE), LEFT JOIN your totals onto it with `COALESCE(x, 0)`, and only then LAG.\n\n```sql\nSELECT strftime('%Y-%m', order_date) AS month, COUNT(*) AS delivered\nFROM orders WHERE status = 'delivered'\nGROUP BY month;  -- 5 rows: 2024-02 is missing\n```",
        },
        {
          kind: 'callout',
          tone: 'interview',
          title: 'How to recognise it',
          text: '**"Month-over-month"**, **"growth rate"**, **"vs. previous period"**, **"week-over-week"**, **"YoY"**. Template: aggregate to one row per period in a CTE → `LAG()` → percentage. YoY on monthly rows is `LAG(x, 12)` (only safe with no missing months) or a self-join on "same month last year".',
        },
        {
          kind: 'challenge',
          id: 'sql07-l4-c1',
          lang: 'sql',
          title: 'Revenue month over month',
          prompt: 'Using non-cancelled orders only, return `month`, `revenue` (sum of `quantity * unit_price`, rounded to 2), `prev_revenue` (previous month, rounded to 2) and `mom_pct` (rounded to 1). Order by `month`.',
          starter: `SELECT strftime('%Y-%m', o.order_date) AS month,
       ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE o.status <> 'cancelled'
GROUP BY month
ORDER BY month;`,
          hints: [
            'Put the starter\'s monthly revenue in a CTE `m` (without the ROUND — round at the end).',
            'In the outer query: `LAG(revenue) OVER (ORDER BY month)` is the previous month.',
            '`ROUND(100.0 * (revenue - LAG(revenue) OVER (ORDER BY month)) / LAG(revenue) OVER (ORDER BY month), 1) AS mom_pct`',
          ],
          solution: `WITH m AS (
  SELECT strftime('%Y-%m', o.order_date) AS month,
         SUM(oi.quantity * oi.unit_price) AS revenue
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  WHERE o.status <> 'cancelled'
  GROUP BY month
)
SELECT month,
       ROUND(revenue, 2) AS revenue,
       ROUND(LAG(revenue) OVER (ORDER BY month), 2) AS prev_revenue,
       ROUND(100.0 * (revenue - LAG(revenue) OVER (ORDER BY month))
             / LAG(revenue) OVER (ORDER BY month), 1) AS mom_pct
FROM m
ORDER BY month;`,
          explain: 'Aggregate first, compare second. Rounding only at the very end avoids compounding rounding errors in the growth figure. (February\'s −90.4% is real: a single order after a January boosted by laptop orders.)',
          sql: { ordered: true },
        },
        {
          kind: 'md',
          text: `**Pattern 8 — cohorts.** A *cohort* groups customers by **when they started** (their first order month). Retention then asks: of each cohort, how many came back in a **later** month?

Template: CTE of \`customer → first month\`, LEFT JOIN later activity, \`COUNT(DISTINCT returner) / COUNT(DISTINCT customer)\`.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `WITH firsts AS (
  SELECT customer_id, strftime('%Y-%m', MIN(order_date)) AS cohort
  FROM orders
  GROUP BY customer_id
)
SELECT f.cohort,
       COUNT(DISTINCT f.customer_id) AS customers,
       COUNT(DISTINCT o.customer_id) AS came_back,
       ROUND(100.0 * COUNT(DISTINCT o.customer_id)
             / COUNT(DISTINCT f.customer_id), 1) AS return_pct
FROM firsts f
LEFT JOIN orders o
  ON o.customer_id = f.customer_id
 AND strftime('%Y-%m', o.order_date) > f.cohort
GROUP BY f.cohort
ORDER BY f.cohort;`,
          predict: { question: '8 customers have ordered, first orders fall in Jan, Feb or Mar. How many cohort rows come back?', options: ['3', '6', '8', '10'], answer: 0, fromOutput: true, explain: '**3** cohorts (2024-01: 5 customers, 2024-02: 1, 2024-03: 2). The January cohort\'s return rate is 80% — 4 of 5 ordered again in a later month.' },
          note: 'The "later month" condition lives in the **ON** clause. Put it in WHERE and the LEFT JOIN quietly turns into an INNER JOIN, deleting non-returners from the denominator.',
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: the class of 2024-01',
          text: 'A cohort is a **school class**: you belong to the class of the year you *started*, forever. Retention is the reunion headcount — how many of the class of 2024-01 still show up.',
        },
        {
          kind: 'md',
          text: `**Pattern 9 — funnels.** A funnel counts how many entities survive each step, then divides each step by the one before it. For shop orders:

**placed** (all) → **shipped** (not cancelled) → **delivered** (delivered or returned) → **kept** (delivered, not returned).

Conditional aggregation does it in one pass: \`SUM(status <> 'cancelled')\`, \`SUM(status IN ('delivered','returned'))\` … (portable form: \`SUM(CASE WHEN … THEN 1 ELSE 0 END)\`).`,
        },
        {
          kind: 'challenge',
          id: 'sql07-l4-c2',
          lang: 'sql',
          title: 'Order funnel conversion',
          prompt: 'Return one row with the step-to-step conversion rates of the order funnel above, each as a percentage **rounded to 1 decimal**: `shipped_pct` (shipped ÷ placed), `delivered_pct` (delivered ÷ shipped), `kept_pct` (kept ÷ delivered).',
          starter: `SELECT
  100 * SUM(status <> 'cancelled') / COUNT(*) AS shipped_pct,
  100 * SUM(status IN ('delivered', 'returned')) / SUM(status <> 'cancelled') AS delivered_pct,
  100 * SUM(status = 'delivered') / SUM(status IN ('delivered', 'returned')) AS kept_pct
FROM orders;`,
          hints: [
            'Run the starter: 87, 85, 83 — suspiciously whole numbers. Every value in there is an integer.',
            'Integer ÷ integer truncates. Make one side REAL: `100.0 * …`.',
            "`ROUND(100.0 * SUM(status <> 'cancelled') / COUNT(*), 1) AS shipped_pct`, and the same for the other two.",
          ],
          solution: `SELECT
  ROUND(100.0 * SUM(status <> 'cancelled') / COUNT(*), 1) AS shipped_pct,
  ROUND(100.0 * SUM(status IN ('delivered', 'returned')) / SUM(status <> 'cancelled'), 1) AS delivered_pct,
  ROUND(100.0 * SUM(status = 'delivered') / SUM(status IN ('delivered', 'returned')), 1) AS kept_pct
FROM orders;`,
          explain: '24 → 21 → 18 → 15 orders gives 87.5%, 85.7%, 83.3%. The truncated 87/85/83 is the most common silent bug in rate questions — interviewers plant it on purpose.',
        },
        {
          kind: 'quiz',
          id: 'sql07-l4-q1',
          q: 'In a cohort-retention LEFT JOIN, you move `strftime(\'%Y-%m\', o.order_date) > f.cohort` from ON into WHERE. What happens?',
          options: ['Nothing changes', 'Customers who never came back are removed, so every cohort shows 100%', 'The query errors', 'Every customer counts as returned'],
          answer: 1,
          explain: 'WHERE runs after the join and drops rows where `o.order_date` is NULL — exactly the non-returners. The denominator shrinks to returners only.',
        },
        { kind: 'recall', prompt: 'Write the MoM growth expression from memory (column `revenue`, ordered by `month`).', answer: '100.0 * (revenue - LAG(revenue) OVER (ORDER BY month)) / LAG(revenue) OVER (ORDER BY month) — after aggregating to one row per month.' },
        { kind: 'explain', id: 'sql07-l4-e1', prompt: 'Explain why a missing month breaks a LAG-based month-over-month query and how you would fix it.' },
      ],
      cards: [
        { id: 'sql07-l4-k1', kind: 'cloze', text: 'Previous month\'s value: `{{}}(revenue) OVER (ORDER BY month)`', answers: ['LAG'] },
        { id: 'sql07-l4-k2', kind: 'concept', front: 'LAG and a missing month?', back: 'LAG returns the previous ROW, so a missing month makes it compare to two months back. Fill gaps with a calendar LEFT JOIN first.' },
        { id: 'sql07-l4-k3', kind: 'concept', front: 'What defines a customer\'s cohort?', back: 'The period of their first activity (e.g. strftime(\'%Y-%m\', MIN(order_date))) — it never changes.' },
        { id: 'sql07-l4-k4', kind: 'sql', prompt: 'shop: percentage of orders (rounded to 1) whose status is cancelled.', dataset: 'shop', solution: "SELECT ROUND(100.0 * SUM(status = 'cancelled') / COUNT(*), 1) AS cancel_pct FROM orders;" },
        { id: 'sql07-l4-k5', kind: 'cloze', text: 'Funnel step in one pass: `SUM({{}} WHEN status = \'delivered\' THEN 1 ELSE 0 END)`', answers: ['CASE'] },
      ],
    },
  ],
};
