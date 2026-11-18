import type { Module } from '../types';

export const module: Module = {
  id: 'sql06',
  track: 'sql',
  order: 6,
  title: 'Window Functions',
  icon: '🪟',
  level: 'Interview',
  blurb: 'The most-tested advanced SQL topic: OVER / PARTITION BY, ranking with ties, top-N per group, LAG/LEAD, running totals, moving averages and NTILE.',
  boss: ['sql-gym-top-riders-per-city', 'sql-gym-second-highest-per-dept', 'sql-gym-rolling-watch-minutes'],
  lessons: [
    // ------------------------------------------------------------------ L1
    {
      id: 'sql06-l1',
      track: 'sql',
      title: 'OVER(): aggregates that keep every row',
      summary: 'PARTITION BY vs GROUP BY, empty OVER(), and percent-of-total — without losing a single row.',
      minutes: 15,
      faang:
        'Window functions are the single most-tested advanced SQL topic in big-tech data interviews. Almost every medium/hard question — share of total, compare to group average, ranking, running totals — starts with knowing that a window keeps the rows while GROUP BY collapses them.',
      tags: ['Window functions', 'OVER', 'PARTITION BY', 'Percent of total'],
      dataset: 'hr',
      cells: [
        {
          kind: 'viz',
          viz: { type: 'window', table: 'employees', partition: 'dept_id', order: 'salary', value: 'salary', show: ['name', 'dept_id', 'salary'] },
          caption: 'Each colour is a **partition** (one department). Click any row: its window is the set of rows it can "see". Notice that **all 18 rows stay on screen** — nothing collapses.',
        },
        {
          kind: 'md',
          text: `You already know **GROUP BY**: rows go into buckets and each bucket becomes **one** row. Great for summaries — but the individual rows are gone.

A **window function** computes the same kind of aggregate **over a group of related rows**, and writes the answer **next to every row**. Same maths, no collapsing. Compare:`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT dept_id, ROUND(AVG(salary)) AS dept_avg
FROM employees
GROUP BY dept_id;`,
          predict: {
            question: 'Four departments have people, plus Victor with dept_id NULL. How many rows?',
            options: ['4', '5', '6', '18'],
            answer: 1,
            fromOutput: true,
            explain: 'One row per distinct dept_id — and NULL is its own group. 5 rows, no names.',
          },
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT name, dept_id, salary,
       ROUND(AVG(salary) OVER (PARTITION BY dept_id)) AS dept_avg
FROM employees;`,
          predict: {
            question: 'Same average, but as a window. How many rows now?',
            options: ['4', '5', '6', '18'],
            answer: 3,
            fromOutput: true,
            explain: "All 18. `OVER (PARTITION BY dept_id)` means \"average over the rows in *my* department\" — and every employee keeps their own row with the department average beside it.",
          },
          note: 'Read `AVG(salary) OVER (PARTITION BY dept_id)` as: "the average salary, over my partition (department)".',
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: blender vs glasses',
          text: '**GROUP BY is a blender**: rows go in, one smoothie per bucket comes out. **A window is a pair of glasses**: every row stays itself, but puts on glasses that let it *see* its neighbours (its partition) and write what it sees in a new column.',
        },
        {
          kind: 'md',
          text: `The anatomy: \`function(…) OVER (PARTITION BY … ORDER BY … frame)\` — every part is optional.

- **PARTITION BY** = which rows belong together (like GROUP BY, but without collapsing)
- **Empty \`OVER ()\`** = the whole result is one big window

So \`SUM(salary) OVER ()\` puts the **company payroll** on every row — perfect for **percent of total**.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT name, salary,
       ROUND(100.0 * salary / SUM(salary) OVER (), 1) AS pct_of_payroll
FROM employees
ORDER BY salary DESC
LIMIT 4;`,
          predict: {
            question: 'Payroll is 2,985,000. Roughly what is Priya\'s (310,000) share?',
            options: ['1.0', '10.4', '31.0', '100'],
            answer: 1,
            fromOutput: false,
            explain: '310,000 / 2,985,000 ≈ 10.4%. The window gives every row the grand total, so the division happens row by row.',
          },
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'Integer division strikes again',
          text: '`salary * 100 / SUM(salary) OVER ()` is integer ÷ integer, so Priya gets **10**, not 10.4 — and a share below 1% becomes **0**. Always write `100.0 *` (or multiply by 1.0) before dividing.',
        },
        {
          kind: 'viz',
          viz: { type: 'pipeline', sql: 'SELECT name, dept_id, salary, ROUND(AVG(salary) OVER (PARTITION BY dept_id)) AS dept_avg FROM employees WHERE dept_id IS NOT NULL ORDER BY dept_id, salary DESC' },
          caption: 'Windows are computed in the **SELECT** step — *after* WHERE. So WHERE decides which rows the window can see (Victor is gone before the averages are computed).',
        },
        {
          kind: 'challenge',
          id: 'sql06-l1-c1',
          lang: 'sql',
          title: 'Share of department payroll',
          prompt: 'For every employee return `name`, `dept_id`, `salary`, `dept_total` (their department\'s total salary) and `pct_of_dept` = 100 × salary / dept_total, **rounded to 1 decimal**. All 18 rows.',
          starter: 'SELECT dept_id, SUM(salary) AS dept_total\nFROM employees\nGROUP BY dept_id;',
          hints: [
            'GROUP BY loses the names. Replace it with a window: `SUM(salary) OVER (PARTITION BY dept_id) AS dept_total`.',
            'Percent: `ROUND(100.0 * salary / SUM(salary) OVER (PARTITION BY dept_id), 1)` — remember the `100.0`.',
          ],
          solution: 'SELECT name, dept_id, salary,\n       SUM(salary) OVER (PARTITION BY dept_id) AS dept_total,\n       ROUND(100.0 * salary / SUM(salary) OVER (PARTITION BY dept_id), 1) AS pct_of_dept\nFROM employees;',
          explain: '"Share of group" = value / SUM(value) OVER (PARTITION BY group). Ben gets 58.8% of Marketing; Victor is 100% of his one-person NULL partition.',
        },
        {
          kind: 'challenge',
          id: 'sql06-l1-c2',
          lang: 'sql',
          title: 'Gap to the department top',
          prompt: 'For every employee return `name`, `dept_id`, `salary` and `gap` = how much less they earn than the **highest salary in their own department** (0 for the top earner).',
          starter: 'SELECT name, dept_id, salary,\n       MAX(salary) OVER () - salary AS gap\nFROM employees;',
          hints: [
            'The starter compares everyone with the *company* max (Priya). Which part of OVER(…) restricts the window to my department?',
            '`MAX(salary) OVER (PARTITION BY dept_id) - salary`',
          ],
          solution: 'SELECT name, dept_id, salary,\n       MAX(salary) OVER (PARTITION BY dept_id) - salary AS gap\nFROM employees;',
          explain: 'Empty OVER () = whole table; PARTITION BY dept_id = my department. Any aggregate (SUM, AVG, MIN, MAX, COUNT) can be used as a window this way.',
        },
        {
          kind: 'quiz',
          id: 'sql06-l1-q1',
          q: 'How many rows does `SELECT dept_id, COUNT(*) OVER (PARTITION BY dept_id) FROM employees` return?',
          options: ['5 — one per department', '18 — one per employee', '1', 'Error: COUNT needs GROUP BY'],
          answer: 1,
          explain: 'A window never removes rows. You get 18 rows, each showing the size of its department (and many repeated values).',
        },
        { kind: 'recall', prompt: 'In one sentence each: what does GROUP BY do to rows, and what does PARTITION BY do?', answer: 'GROUP BY collapses each group to one output row. PARTITION BY (inside OVER) groups rows for the calculation but keeps every row, writing the result beside each one.' },
        { kind: 'explain', id: 'sql06-l1-e1', prompt: 'Explain to a teammate how you would show each salary as a % of its department total, and why GROUP BY alone can not do it.' },
      ],
      cards: [
        { id: 'sql06-l1-k1', kind: 'concept', front: 'GROUP BY vs PARTITION BY: what happens to the rows?', back: 'GROUP BY collapses each group into one row; PARTITION BY keeps every row and adds the group result beside it.' },
        { id: 'sql06-l1-k2', kind: 'cloze', text: 'Department total on every row: `SUM(salary) {{}} (PARTITION BY dept_id)`', answers: ['OVER'] },
        { id: 'sql06-l1-k3', kind: 'concept', front: 'What window does `OVER ()` (empty) cover?', back: 'The whole result set — one big partition. Handy for grand totals and percent-of-total.' },
        { id: 'sql06-l1-k4', kind: 'sql', prompt: "Each employee's `name`, `salary` and `pct_of_payroll` = 100 × salary / total payroll (rounded to 1 decimal).", dataset: 'hr', solution: 'SELECT name, salary, ROUND(100.0 * salary / SUM(salary) OVER (), 1) AS pct_of_payroll FROM employees;' },
        { id: 'sql06-l1-k5', kind: 'concept', front: 'In which logical step are window functions computed?', back: 'In SELECT — after FROM, WHERE, GROUP BY and HAVING, before ORDER BY and LIMIT.' },
      ],
    },
    // ------------------------------------------------------------------ L2
    {
      id: 'sql06-l2',
      track: 'sql',
      title: 'ROW_NUMBER, RANK, DENSE_RANK & top-N per group',
      summary: 'Three ways to number rows, how they treat ties, and the two-step recipe for "top N in each group".',
      minutes: 16,
      faang:
        '"Top 3 salaries per department", "most recent order per customer", "best-selling product per category" — top-N per group is the most common window question in Meta/Amazon/Google-style loops. The tie-handling follow-up decides between ROW_NUMBER, RANK and DENSE_RANK.',
      tags: ['ROW_NUMBER', 'RANK', 'DENSE_RANK', 'Top-N per group', 'Ties'],
      dataset: 'hr',
      cells: [
        {
          kind: 'viz',
          viz: { type: 'window', table: 'employees', partition: 'dept_id', order: 'salary DESC', value: 'salary', show: ['name', 'dept_id', 'salary'] },
          caption: 'Switch between **ROW_NUMBER**, **RANK** and **DENSE_RANK**. Watch Engineering\'s two 165,000 engineers and Data\'s two 128,000 analysts — that is where the three functions disagree.',
        },
        {
          kind: 'md',
          text: `Ranking functions take **no argument** — the ranking order comes from \`ORDER BY\` **inside** OVER:

\`\`\`sql
RANK() OVER (ORDER BY salary DESC)
\`\`\`

They only differ when there are **ties**:
- **ROW_NUMBER** — 1, 2, 3, 4 … always unique (ties broken arbitrarily)
- **RANK** — 1, 1, 3 … ties share, then a **gap**
- **DENSE_RANK** — 1, 1, 2 … ties share, **no gap**`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT name, salary,
       ROW_NUMBER() OVER (ORDER BY salary DESC) AS row_num,
       RANK()       OVER (ORDER BY salary DESC) AS rnk,
       DENSE_RANK() OVER (ORDER BY salary DESC) AS dense
FROM employees;`,
          predict: {
            question: 'Tom and Yuki tie at 165,000 and both get RANK 8. What RANK does Ben Cohen (next, 150,000) get?',
            options: ['8', '9', '10', '11'],
            answer: 2,
            fromOutput: false,
            explain: 'RANK = 1 + the number of rows strictly ahead of you. Nine people earn more than Ben, so his RANK is 10 — rank 9 is skipped. His DENSE_RANK is 9.',
          },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: the podium',
          text: '**RANK = the Olympics**: two golds, then *no silver* — next is bronze (1, 1, 3). **DENSE_RANK = a dense crowd, no gaps** (1, 1, 2). **ROW_NUMBER = the deli ticket machine**: everyone gets a unique number, even if they arrived together.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT r
FROM (SELECT name, DENSE_RANK() OVER (ORDER BY salary DESC) AS r
      FROM employees)
WHERE name = 'Liam Walsh';   -- salary 125,000`,
          predict: {
            question: 'There are two ties above Liam (the 165,000s and the 128,000s). What is his DENSE_RANK?',
            options: ['12', '13', '14', '15'],
            answer: 1,
            fromOutput: true,
            explain: 'DENSE_RANK counts *distinct* salaries above you, plus one: 12 distinct higher salaries → 13. His RANK would be 15 and his ROW_NUMBER 15.',
          },
          note: 'Notice the shape: compute the window in a subquery, filter in the outer query. Lesson 4 explains why that is required.',
        },
        {
          kind: 'md',
          text: `**Top-N per group** — the most famous window pattern — is always two steps:

1. In a CTE, rank inside each group: \`… OVER (PARTITION BY group ORDER BY metric DESC)\`
2. Outside, keep \`WHERE rk <= N\`

PARTITION BY restarts the numbering at 1 in every group.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `WITH ranked AS (
  SELECT name, dept_id, salary,
         RANK() OVER (PARTITION BY dept_id ORDER BY salary) AS r
  FROM employees
)
SELECT name, dept_id, salary
FROM ranked
WHERE r = 1;   -- lowest paid in each department`,
          predict: {
            question: 'There are 5 partitions (4 departments + the NULL one). How many rows have r = 1?',
            options: ['4', '5', '6', '18'],
            answer: 2,
            fromOutput: true,
            explain: "Data's two analysts tie for lowest (128,000) and RANK gives both 1 → 6 rows. With ROW_NUMBER you would get 5 and silently lose one of them.",
          },
        },
        {
          kind: 'callout',
          tone: 'interview',
          title: 'Ask the tie question out loud',
          text: 'Before writing a top-N query, ask: *"If two people tie, should both be returned?"* Yes → RANK or DENSE_RANK (DENSE_RANK for "top 3 **distinct** salaries"). Exactly N rows → ROW_NUMBER **with a tie-breaker** in ORDER BY (e.g. `salary DESC, id`). Interviewers in Meta/Amazon-style loops often grade this clarifying question.',
        },
        {
          kind: 'challenge',
          id: 'sql06-l2-c1',
          lang: 'sql',
          title: 'Top 2 earners per department',
          prompt: 'Return `dept` (department name), `name` and `salary` for the **two highest-paid employees in each department** (if salaries tie, include both). Order by `dept`, then `salary` descending, then `name`.',
          starter: 'SELECT d.name AS dept, e.name, e.salary\nFROM employees e\nJOIN departments d ON d.id = e.dept_id\nORDER BY e.salary DESC\nLIMIT 2;',
          hints: [
            'LIMIT 2 keeps two rows for the *whole company*. You need the numbering to restart per department → PARTITION BY.',
            'In a CTE: `DENSE_RANK() OVER (PARTITION BY e.dept_id ORDER BY e.salary DESC) AS rk` along with dept, name, salary.',
            'Then: `SELECT dept, name, salary FROM ranked WHERE rk <= 2 ORDER BY dept, salary DESC, name;`',
          ],
          solution: 'WITH ranked AS (\n  SELECT d.name AS dept, e.name, e.salary,\n         DENSE_RANK() OVER (PARTITION BY e.dept_id ORDER BY e.salary DESC) AS rk\n  FROM employees e\n  JOIN departments d ON d.id = e.dept_id\n)\nSELECT dept, name, salary\nFROM ranked\nWHERE rk <= 2\nORDER BY dept, salary DESC, name;',
          explain: 'Rank inside a partition, filter outside. This exact skeleton solves "top N per group" for salaries, products, posts, drivers — anything.',
          sql: { ordered: true },
        },
        {
          kind: 'challenge',
          id: 'sql06-l2-c2',
          lang: 'sql',
          title: 'Pay levels with no gaps',
          prompt: 'Company-wide, give every employee a `level` by salary (highest = 1) where **equal salaries share a level** and the levels have **no gaps**. Return `name`, `salary`, `level`, ordered by `level` then `name`.',
          starter: 'SELECT name, salary,\n       ROW_NUMBER() OVER (ORDER BY salary DESC) AS level\nFROM employees\nORDER BY level, name;',
          hints: [
            'ROW_NUMBER gives Tom and Yuki different levels. Which function lets ties share a number?',
            'Shares *and* no gaps → `DENSE_RANK()`.',
          ],
          solution: 'SELECT name, salary,\n       DENSE_RANK() OVER (ORDER BY salary DESC) AS level\nFROM employees\nORDER BY level, name;',
          explain: 'DENSE_RANK ends at 16 for 18 people because two pairs tie. RANK would also share levels but jump from 8 to 10.',
          sql: { ordered: true },
        },
        {
          kind: 'quiz',
          id: 'sql06-l2-q1',
          q: 'Salaries 300, 300, 200, 100 sorted DESC. What are the RANK values?',
          options: ['1, 2, 3, 4', '1, 1, 2, 3', '1, 1, 3, 4', '1, 1, 3, 3'],
          answer: 2,
          explain: 'RANK shares ties and then skips: 1, 1, 3, 4. DENSE_RANK would give 1, 1, 2, 3 and ROW_NUMBER 1, 2, 3, 4.',
        },
        { kind: 'recall', prompt: 'Write the two-step recipe for "top 3 per group" from memory.', answer: 'CTE: `RANK()/DENSE_RANK()/ROW_NUMBER() OVER (PARTITION BY group ORDER BY metric DESC) AS rk`; outer query: `WHERE rk <= 3`.' },
        { kind: 'explain', id: 'sql06-l2-e1', prompt: 'Explain the difference between RANK and DENSE_RANK using the hr salary ties, and say which you would use for "the 2nd-highest distinct salary".' },
      ],
      cards: [
        { id: 'sql06-l2-k1', kind: 'concept', front: 'Values 50, 50, 40: RANK vs DENSE_RANK vs ROW_NUMBER?', back: 'RANK 1, 1, 3 · DENSE_RANK 1, 1, 2 · ROW_NUMBER 1, 2, 3.' },
        { id: 'sql06-l2-k2', kind: 'cloze', text: 'Restart numbering per department: `ROW_NUMBER() OVER ({{}} BY dept_id ORDER BY salary DESC)`', answers: ['PARTITION'] },
        { id: 'sql06-l2-k3', kind: 'concept', front: 'Which ranking function for "top 3 **distinct** salaries per department"?', back: 'DENSE_RANK — ties share a number and no values are skipped.' },
        { id: 'sql06-l2-k4', kind: 'sql', prompt: 'Return `name`, `dept_id`, `salary` of the highest-paid employee(s) in each dept_id (include ties).', dataset: 'hr', solution: 'WITH r AS (SELECT name, dept_id, salary, RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS rk FROM employees) SELECT name, dept_id, salary FROM r WHERE rk = 1;' },
        { id: 'sql06-l2-k5', kind: 'concept', front: 'Why add a tie-breaker (e.g. `, id`) to ROW_NUMBER\'s ORDER BY?', back: 'Without it, tied rows get numbers in an arbitrary order — results can change between runs.' },
      ],
    },
    // ------------------------------------------------------------------ L3
    {
      id: 'sql06-l3',
      track: 'sql',
      title: 'LAG/LEAD, running totals & moving averages',
      summary: 'Running balances with ORDER BY inside OVER, the default-frame trap, ROWS BETWEEN frames, and looking at the previous/next row.',
      minutes: 18,
      faang:
        'Running totals, moving averages and "change vs previous period" are everyday metrics at big tech (and at banks). Expect them in Amazon/Meta-style rounds as "running balance per account", "7-day rolling average" or "day-over-day growth" — and expect a follow-up on ROWS vs RANGE.',
      tags: ['Running total', 'LAG', 'LEAD', 'ROWS BETWEEN', 'Moving average'],
      dataset: 'bank',
      cells: [
        {
          kind: 'viz',
          viz: { type: 'window', table: 'transactions', partition: 'account_id', order: 'txn_date, id', value: 'amount', show: ['id', 'account_id', 'txn_date', 'amount'] },
          caption: 'Pick **running SUM** and click a row: its frame runs from the first row of its account up to itself. Then try **LAG** and **LEAD** — they reach exactly one row back or forward.',
        },
        {
          kind: 'md',
          text: `Add **ORDER BY inside OVER** and an aggregate stops looking at the whole partition: it looks from the **first row up to the current row**. That's a **running total**:

\`\`\`sql
SUM(amount) OVER (PARTITION BY account_id ORDER BY txn_date, id)
\`\`\`

For a bank, that's the **running balance** after each transaction — restarting for every account.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT account_id, id, txn_date, amount,
       SUM(amount) OVER (PARTITION BY account_id ORDER BY txn_date, id) AS balance
FROM transactions
WHERE account_id IN (101, 104)
ORDER BY account_id, txn_date, id;`,
          predict: {
            question: 'Account 101 opens with a 14,500 deposit, then deposits 660. What is `balance` on its 2nd row?',
            options: ['660', '14,500', '15,160', '12,340'],
            answer: 2,
            fromOutput: false,
            explain: '14,500 + 660 = 15,160. Each row adds its amount to everything before it in the same account. 12,340 is the *final* balance (the last row of 101).',
          },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: the snowball',
          text: 'A running total is a **snowball rolling down the partition**: it picks up each row\'s amount as it passes. At a new account (partition) it **melts and starts again** from zero. ORDER BY decides the direction it rolls.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `-- the whole bank, ordered only by date
SELECT id, txn_date, amount,
       SUM(amount) OVER (ORDER BY txn_date) AS running
FROM transactions
LIMIT 8;`,
          predict: {
            question: 'Six opening deposits all happened on 2024-01-01. What does `running` show on the very first row (id 1, amount 14,500)?',
            options: ['14,500', '22,000', '71,500', 'NULL'],
            answer: 2,
            fromOutput: false,
            explain: 'All six Jan-1 rows show **71,500**. With ORDER BY, the default frame is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` — and RANGE includes every **peer** (same txn_date) of the current row.',
          },
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'The default frame is RANGE, not ROWS',
          text: 'Ties in the window ORDER BY get summed **together**. Two fixes: add a unique tie-breaker (`ORDER BY txn_date, id`) or spell out the frame: `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` — ROWS counts physical rows, one at a time.',
        },
        {
          kind: 'md',
          text: `**LAG(col)** reads \`col\` from the **previous** row of the window; **LEAD(col)** reads the **next** row. Perfect for "change vs previous" and "days since last".

When several columns use the same window, name it once with a **WINDOW** clause: \`… LAG(amount) OVER w … WINDOW w AS (PARTITION BY account_id ORDER BY txn_date, id)\`.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT id, txn_date, amount,
       LAG(amount) OVER w                  AS prev_amount,
       amount - LAG(amount) OVER w         AS change,
       CAST(julianday(txn_date) - julianday(LAG(txn_date) OVER w) AS INTEGER) AS days_since_prev
FROM transactions
WHERE account_id = 103
WINDOW w AS (PARTITION BY account_id ORDER BY txn_date, id)
ORDER BY txn_date;`,
          predict: {
            question: 'What is `prev_amount` on the first row (the opening deposit)?',
            options: ['0', '14,500', 'NULL', 'An error'],
            answer: 2,
            fromOutput: false,
            explain: 'There is no previous row, so LAG returns NULL — and so do `change` and `days_since_prev`. Use `LAG(amount, 1, 0)` to supply a default instead.',
          },
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT id, txn_date, amount,
       ROUND(AVG(amount) OVER (PARTITION BY account_id ORDER BY txn_date, id
                               ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 1) AS moving_avg_3
FROM transactions
WHERE account_id = 105
ORDER BY txn_date;`,
          note: '**Moving average**: `ROWS BETWEEN 2 PRECEDING AND CURRENT ROW` = a window of at most 3 rows that slides down the partition. The first rows have fewer neighbours, so they average over 1 and 2 rows.',
        },
        {
          kind: 'challenge',
          id: 'sql06-l3-c1',
          lang: 'sql',
          title: 'Running balance per account',
          prompt: 'Return `account_id`, `id`, `txn_date`, `amount` and `balance` = the running balance of that account after each transaction. Order by `account_id`, `txn_date`, `id`.',
          starter: 'SELECT account_id, id, txn_date, amount,\n       SUM(amount) OVER (PARTITION BY account_id) AS balance\nFROM transactions\nORDER BY account_id, txn_date, id;',
          hints: [
            'The starter shows the account *total* on every row. What makes a window grow row by row?',
            'Add `ORDER BY txn_date, id` inside OVER (the `id` tie-breaker keeps it one row at a time).',
          ],
          solution: 'SELECT account_id, id, txn_date, amount,\n       SUM(amount) OVER (PARTITION BY account_id ORDER BY txn_date, id) AS balance\nFROM transactions\nORDER BY account_id, txn_date, id;',
          explain: 'PARTITION BY restarts per account; ORDER BY turns the total into a running total. Your bank statement, in one line of SQL.',
          sql: { ordered: true },
        },
        {
          kind: 'challenge',
          id: 'sql06-l3-c2',
          lang: 'sql',
          title: 'Days until the next transaction',
          prompt: 'For account **104**, return `id`, `txn_date` and `days_to_next` = whole days until that account\'s **next** transaction (NULL for the last one). Order by `txn_date`, `id`.',
          starter: 'SELECT id, txn_date,\n       CAST(julianday(txn_date) - julianday(LAG(txn_date) OVER (ORDER BY txn_date, id)) AS INTEGER) AS days_to_next\nFROM transactions\nWHERE account_id = 104\nORDER BY txn_date, id;',
          hints: [
            'LAG looks *backwards*. Which function looks at the next row?',
            "Use `LEAD(txn_date)` and flip the subtraction: `julianday(LEAD(txn_date) OVER (…)) - julianday(txn_date)`.",
          ],
          solution: 'SELECT id, txn_date,\n       CAST(julianday(LEAD(txn_date) OVER (ORDER BY txn_date, id)) - julianday(txn_date) AS INTEGER) AS days_to_next\nFROM transactions\nWHERE account_id = 104\nORDER BY txn_date, id;',
          explain: 'LEAD = next row, LAG = previous row. Here WHERE already narrows to one account, so no PARTITION BY is needed — for all accounts at once, add `PARTITION BY account_id`.',
          sql: { ordered: true },
        },
        {
          kind: 'quiz',
          id: 'sql06-l3-q1',
          q: 'How many rows, at most, does `ROWS BETWEEN 2 PRECEDING AND CURRENT ROW` include?',
          options: ['2', '3', 'All previous rows', 'It depends on ties'],
          answer: 1,
          explain: 'Two before plus the current row = 3. Because it is **ROWS**, ties make no difference. A 7-day moving average over daily rows is `ROWS BETWEEN 6 PRECEDING AND CURRENT ROW`.',
        },
        { kind: 'recall', prompt: 'Why did `SUM(amount) OVER (ORDER BY txn_date)` show 71,500 on six rows, and how do you fix it?', answer: 'The default frame is RANGE … CURRENT ROW, which includes all peers with the same txn_date. Add a unique tie-breaker (txn_date, id) or use ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW.' },
        { kind: 'explain', id: 'sql06-l3-e1', prompt: 'Explain how you would compute "change vs previous transaction" per account, and what happens on each account\'s first row.' },
      ],
      cards: [
        { id: 'sql06-l3-k1', kind: 'cloze', text: 'Running total: `SUM(amount) OVER (PARTITION BY account_id ORDER BY txn_date ROWS BETWEEN {{}} PRECEDING AND CURRENT ROW)`', answers: ['UNBOUNDED'] },
        { id: 'sql06-l3-k2', kind: 'concept', front: 'With ORDER BY in OVER and no frame, what is the default frame?', back: 'RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW — which includes all rows tied with the current one.' },
        { id: 'sql06-l3-k3', kind: 'concept', front: 'What does LAG(x) return on the first row of a partition?', back: 'NULL (unless you pass a default: LAG(x, 1, 0)).' },
        { id: 'sql06-l3-k4', kind: 'sql', prompt: 'Running balance per account: `account_id`, `id`, `balance`, ordered by account_id, txn_date, id.', dataset: 'bank', solution: 'SELECT account_id, id, SUM(amount) OVER (PARTITION BY account_id ORDER BY txn_date, id) AS balance FROM transactions ORDER BY account_id, txn_date, id;', ordered: true },
        { id: 'sql06-l3-k5', kind: 'cloze', text: '3-row moving average frame: `ROWS BETWEEN {{}} PRECEDING AND CURRENT ROW`', answers: ['2'] },
      ],
    },
    // ------------------------------------------------------------------ L4
    {
      id: 'sql06-l4',
      track: 'sql',
      title: 'Filtering on windows & NTILE',
      summary: 'Why WHERE can not see window results, the CTE fix (and QUALIFY elsewhere), and splitting rows into buckets with NTILE.',
      minutes: 15,
      faang:
        'Nearly every window interview question ends with a filter: "keep only the latest view", "users in the top quartile". Knowing that windows run after WHERE — and fixing it with a CTE (or QUALIFY on Snowflake/BigQuery/Databricks) — is expected in Meta/Netflix/Amazon-style loops.',
      tags: ['Filter on window', 'CTE', 'QUALIFY', 'NTILE', 'Latest per group'],
      dataset: 'streaming',
      cells: [
        {
          kind: 'md',
          text: `Task: **the first show each user watched**. You number each user's views by date — and keep number 1. The obvious attempt:`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT user_id, show_id,
       ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY view_date) AS rn
FROM views
WHERE rn = 1;`,
          error: true,
          note: 'Run it and read the error: **misuse of aliased window function rn**. WHERE runs *before* SELECT, so the window column does not exist yet when WHERE filters.',
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: wet paint',
          text: 'Window functions are the **last coat of paint**, applied in the SELECT step. WHERE comes earlier, so it would be filtering on **wet paint**. Let it dry in a CTE (or subquery), then filter on the dry result in the outer query.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `WITH ordered AS (
  SELECT user_id, show_id, view_date,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY view_date, id) AS rn
  FROM views
)
SELECT user_id, show_id, view_date
FROM ordered
WHERE rn = 1;`,
          predict: {
            question: '7 users have 45 views between them. How many rows come back?',
            options: ['1', '7', '45', 'Still an error'],
            answer: 1,
            fromOutput: true,
            explain: 'Inside the CTE the window is computed; outside, `rn` is a plain column, so WHERE works. One row per user = 7. (`id` breaks ties for users with two views on the same day.)',
          },
        },
        {
          kind: 'viz',
          viz: { type: 'pipeline', sql: 'WITH ordered AS (SELECT user_id, show_id, view_date, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY view_date, id) AS rn FROM views) SELECT user_id, show_id, view_date FROM ordered WHERE rn = 1' },
          caption: 'The outer query\'s **FROM** step already has `rn` filled in (computed by the CTE). Its **WHERE** step can now filter on it.',
        },
        {
          kind: 'callout',
          tone: 'interview',
          title: 'QUALIFY — know it exists',
          text: 'Snowflake, BigQuery and Databricks support `QUALIFY rn = 1` — a WHERE that runs *after* windows. SQLite, Postgres and MySQL do not, so the CTE pattern is the portable answer. In an interview, write the CTE and mention: *"on Snowflake I would use QUALIFY."*',
        },
        {
          kind: 'viz',
          viz: { type: 'window', table: 'views', partition: 'user_id', order: 'view_date, id', value: 'minutes', show: ['id', 'user_id', 'view_date', 'minutes'] },
          caption: 'One partition per user. Try ROW_NUMBER and find each user\'s row 1 — that is what the CTE kept. User 6 has two views on 2024-03-07 and two on 03-15: that is why the tie-breaker matters.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT user_id,
       SUM(minutes) AS total_minutes,
       NTILE(3) OVER (ORDER BY SUM(minutes) DESC) AS third
FROM views
GROUP BY user_id
ORDER BY total_minutes DESC;`,
          predict: {
            question: 'NTILE(3) deals 7 users into 3 buckets. How many users land in buckets 1, 2 and 3?',
            options: ['3, 2, 2', '2, 2, 3', '2, 3, 2', '3, 3, 1'],
            answer: 0,
            fromOutput: false,
            explain: 'NTILE makes buckets as equal as possible and gives the **leftover rows to the earliest buckets**: 7 = 3 + 2 + 2. A window can even wrap an aggregate — it runs after GROUP BY.',
          },
          note: '**NTILE(n)** sorts rows by the window ORDER BY and deals them into n numbered buckets, like dealing cards. NTILE(4) = quartiles, NTILE(100) = percentiles.',
        },
        {
          kind: 'challenge',
          id: 'sql06-l4-c1',
          lang: 'sql',
          title: 'Latest show per user',
          prompt: "For each user, return `user_id`, the `title` of the show from their **most recent** view, and that `view_date`. Order by `user_id`.",
          starter: "SELECT v.user_id, s.title, v.view_date,\n       ROW_NUMBER() OVER (PARTITION BY v.user_id ORDER BY v.view_date DESC) AS rn\nFROM views v\nJOIN shows s ON s.id = v.show_id\nWHERE rn = 1\nORDER BY v.user_id;",
          hints: [
            'The starter filters on wet paint. Move the SELECT (with the ROW_NUMBER) into `WITH latest AS (…)`.',
            'Inside the window, sort newest first and break ties: `ORDER BY v.view_date DESC, v.id DESC`.',
            'Outer query: `SELECT user_id, title, view_date FROM latest WHERE rn = 1 ORDER BY user_id;`',
          ],
          solution: 'WITH latest AS (\n  SELECT v.user_id, s.title, v.view_date,\n         ROW_NUMBER() OVER (PARTITION BY v.user_id ORDER BY v.view_date DESC, v.id DESC) AS rn\n  FROM views v\n  JOIN shows s ON s.id = v.show_id\n)\nSELECT user_id, title, view_date\nFROM latest\nWHERE rn = 1\nORDER BY user_id;',
          explain: '"Latest X per entity" = ROW_NUMBER … ORDER BY date DESC in a CTE, then rn = 1. (SQLite also allows a non-standard `MAX()` + bare column trick — it does not work in Postgres or BigQuery, so do not rely on it in interviews.)',
          sql: { ordered: true },
        },
        {
          kind: 'challenge',
          id: 'sql06-l4-c2',
          lang: 'sql',
          title: 'Top third of watchers',
          prompt: 'Split users into **3 buckets** by total minutes watched (highest first) with NTILE, and return `user_id` and `total_minutes` for the users in **bucket 1**.',
          starter: 'SELECT user_id, SUM(minutes) AS total_minutes\nFROM views\nGROUP BY user_id\nORDER BY total_minutes DESC\nLIMIT 2;',
          hints: [
            'Guessing a LIMIT is not the same as "the top third". Compute totals per user in one CTE.',
            'Second CTE: `NTILE(3) OVER (ORDER BY total_minutes DESC) AS bucket`. Then filter `WHERE bucket = 1` outside.',
          ],
          solution: 'WITH totals AS (\n  SELECT user_id, SUM(minutes) AS total_minutes\n  FROM views\n  GROUP BY user_id\n),\nbucketed AS (\n  SELECT user_id, total_minutes,\n         NTILE(3) OVER (ORDER BY total_minutes DESC) AS bucket\n  FROM totals\n)\nSELECT user_id, total_minutes\nFROM bucketed\nWHERE bucket = 1;',
          explain: 'Aggregate → bucket → filter: three CTE steps, each easy to check. Users 7, 6 and 4 (514+ minutes) form the top third.',
        },
        {
          kind: 'quiz',
          id: 'sql06-l4-q1',
          q: 'Why can\'t `WHERE ROW_NUMBER() OVER (…) = 1` work in SQLite or Postgres?',
          options: ['ROW_NUMBER needs a GROUP BY', 'WHERE runs before window functions are computed', 'You must use HAVING instead', 'Window functions only work in ORDER BY'],
          answer: 1,
          explain: 'Logical order: FROM → WHERE → GROUP BY → HAVING → **SELECT (windows)** → ORDER BY. WHERE and HAVING both run too early; wrap in a CTE/subquery (or QUALIFY where supported).',
        },
        { kind: 'recall', prompt: 'Name two ways to keep only rows where a window function result equals 1, and which engines support each.', answer: 'A CTE or subquery, then WHERE outside (works everywhere); QUALIFY rn = 1 (Snowflake, BigQuery, Databricks).' },
        { kind: 'explain', id: 'sql06-l4-e1', prompt: 'Explain to a teammate why their `WHERE rn = 1` query errors, using the logical order of SQL clauses.' },
      ],
      cards: [
        { id: 'sql06-l4-k1', kind: 'concept', front: 'How do you filter on a window function result in SQLite/Postgres?', back: 'Compute it in a CTE or subquery, then filter in the outer query (WHERE rn = 1).' },
        { id: 'sql06-l4-k2', kind: 'concept', front: 'What is QUALIFY?', back: 'A filter clause that runs after window functions (Snowflake, BigQuery, Databricks) — e.g. `QUALIFY ROW_NUMBER() OVER (…) = 1`.' },
        { id: 'sql06-l4-k3', kind: 'cloze', text: 'Split users into quartiles: `{{}}(4) OVER (ORDER BY total_minutes DESC)`', answers: ['NTILE'] },
        { id: 'sql06-l4-k4', kind: 'sql', prompt: 'Return each user\'s first `view_date` and `show_id` using ROW_NUMBER in a CTE.', dataset: 'streaming', solution: 'WITH o AS (SELECT user_id, show_id, view_date, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY view_date, id) AS rn FROM views) SELECT user_id, show_id, view_date FROM o WHERE rn = 1;' },
        { id: 'sql06-l4-k5', kind: 'concept', front: 'NTILE(3) over 7 rows: bucket sizes?', back: '3, 2, 2 — leftover rows go to the earliest buckets.' },
      ],
    },
  ],
};
