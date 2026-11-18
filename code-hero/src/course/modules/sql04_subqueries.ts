import type { Module } from '../types';

export const module: Module = {
  id: 'sql04',
  track: 'sql',
  order: 4,
  title: 'Subqueries & CTEs',
  icon: '🪆',
  level: 'Core',
  blurb: 'Queries inside queries: scalar subqueries, IN / EXISTS (and the NOT IN NULL trap), correlated subqueries, CTEs and recursive org charts.',
  boss: ['sql-gym-one-way-follows', 'sql-gym-second-highest-per-dept', 'sql-gym-org-payroll'],
  lessons: [
    // ------------------------------------------------------------------ L1
    {
      id: 'sql04-l1',
      track: 'sql',
      title: 'A query inside a query',
      summary: 'Scalar subqueries, IN (subquery), and why NOT IN silently returns nothing when a NULL sneaks in.',
      minutes: 14,
      faang:
        '"Who earns more than the average?" is the classic first subquery question in Amazon/Meta-style SQL screens. The NOT IN + NULL trap is a favourite follow-up: interviewers want to hear you say "NOT IN is not NULL-safe" before they have to ask.',
      tags: ['Subquery', 'IN', 'NOT IN', 'NULL trap', 'Screen round'],
      dataset: 'hr',
      cells: [
        {
          kind: 'md',
          text: `Question from your manager: **"Who earns more than the company average?"**

Your first instinct is \`WHERE salary > AVG(salary)\` — but WHERE runs *before* aggregates exist, so that's an error.

The fix: compute the average in its **own little query**, wrap it in parentheses, and drop it where a number would go. Predict first, then we'll watch it run.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT name, salary
FROM employees
WHERE salary > (SELECT AVG(salary) FROM employees)
ORDER BY salary DESC;`,
          predict: {
            question: 'The company average salary is about 165,833. How many of the 18 employees earn more than that?',
            options: ['5', '7', '9', '18'],
            answer: 1,
            fromOutput: true,
            explain: 'The inner query becomes the single number 165833.33…, then WHERE keeps the 7 salaries above it. Tom and Yuki (165,000) are just under the line.',
          },
          note: 'The part in parentheses is a **subquery**. It runs on its own, produces one value, and the outer query uses that value like a constant.',
        },
        {
          kind: 'viz',
          viz: { type: 'pipeline', sql: 'SELECT name, salary FROM employees WHERE salary > (SELECT AVG(salary) FROM employees) ORDER BY salary DESC' },
          caption: 'Step through it. At the **WHERE** step the subquery has already turned into one number, so the filter is just `salary > 165833.33`.',
        },
        {
          kind: 'md',
          text: `A subquery that returns **exactly one row and one column** is a **scalar subquery**. You can use it anywhere a single value fits — in WHERE, and in SELECT too:

\`\`\`sql
SELECT name, salary,
       salary - (SELECT AVG(salary) FROM employees) AS vs_avg
FROM employees;
\`\`\`

Why this matters: it lets you compare each row to a **summary of the whole table** without collapsing rows.`,
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: inside-out, like Excel',
          text: 'In Excel, `=B2 - AVERAGE(B:B)` computes `AVERAGE(B:B)` first and then uses it in every row. A scalar subquery is the same: **the parentheses run first and shrink to one number**. Read nested SQL from the innermost parentheses outwards.',
        },
        {
          kind: 'md',
          text: `A subquery can also return **one column of many rows** — a *list*. Use it with **IN**:

- \`WHERE dept_id IN (SELECT id FROM departments WHERE location = 'New York')\`

Read it as: "build the list of New York department ids, then keep employees whose dept_id is on the list."`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT name, dept_id
FROM employees
WHERE dept_id IN (SELECT id FROM departments WHERE location = 'New York');`,
          predict: {
            question: 'Sales (4 people) and Marketing (2 people) are both in New York. How many rows come back?',
            options: ['2', '4', '6', '7'],
            answer: 2,
            fromOutput: true,
            explain: 'The subquery returns the list (3, 4). Everyone whose dept_id is 3 or 4 matches: 4 + 2 = 6.',
          },
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'The NOT IN + NULL trap',
          text: '`x NOT IN (1, 2, NULL)` expands to `x <> 1 AND x <> 2 AND x <> NULL`. The last test is **UNKNOWN**, and TRUE AND UNKNOWN is UNKNOWN — so WHERE drops **every** row. One NULL in the subquery result and NOT IN returns nothing. Victor Hugo (a contractor) has `dept_id = NULL`…',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `-- departments with no employees?
SELECT name
FROM departments
WHERE id NOT IN (SELECT dept_id FROM employees);`,
          predict: {
            question: 'Legal has nobody in it. How many rows does this return?',
            options: ['0', '1', '4', '5'],
            answer: 0,
            fromOutput: true,
            explain: "Zero! The subquery's list contains Victor's NULL, so `5 NOT IN (1, 2, 3, 4, NULL)` is UNKNOWN, not TRUE. No error, no warning — just a silently wrong answer.",
          },
        },
        {
          kind: 'challenge',
          id: 'sql04-l1-c1',
          lang: 'sql',
          title: 'Find the empty department (for real)',
          prompt: 'Fix the query so it returns the `name` of every department that has **no** employees. Keep using `NOT IN`.',
          starter: 'SELECT name\nFROM departments\nWHERE id NOT IN (SELECT dept_id FROM employees);',
          hints: [
            'The query is fine — the *list* is the problem. Which value inside `SELECT dept_id FROM employees` poisons NOT IN?',
            'Remove the NULLs from the list itself: add a WHERE to the **subquery**.',
            '`WHERE id NOT IN (SELECT dept_id FROM employees WHERE dept_id IS NOT NULL)`',
          ],
          solution: 'SELECT name\nFROM departments\nWHERE id NOT IN (SELECT dept_id FROM employees WHERE dept_id IS NOT NULL);',
          explain: 'Filtering NULLs out of the subquery makes NOT IN safe. Next lesson you will meet `NOT EXISTS`, which is NULL-safe by design — the habit interviewers want to see.',
        },
        {
          kind: 'challenge',
          id: 'sql04-l1-c2',
          lang: 'sql',
          title: 'Beat the engineers',
          prompt: 'Return `name` and `salary` of every employee (any department) who earns **more than the average Engineering salary**. Engineering is `dept_id = 1`.',
          starter: 'SELECT name, salary\nFROM employees\nWHERE salary > (SELECT AVG(salary) FROM employees);',
          hints: [
            'The starter compares to the *company* average. The subquery needs its own filter.',
            'Put `WHERE dept_id = 1` **inside** the parentheses — not on the outer query (that would only keep engineers).',
          ],
          solution: 'SELECT name, salary\nFROM employees\nWHERE salary > (SELECT AVG(salary) FROM employees WHERE dept_id = 1);',
          explain: 'The inner WHERE shapes the benchmark (Engineering average ≈ 201,667); the outer query still scans everybody. Five people clear the bar — including Nadia (Data) and Carlos (Sales).',
        },
        {
          kind: 'quiz',
          id: 'sql04-l1-q1',
          q: 'Which subquery is safe to use right after `WHERE salary >`?',
          options: ['`(SELECT salary FROM employees)`', '`(SELECT MAX(salary) FROM employees)`', '`(SELECT dept_id, AVG(salary) FROM employees GROUP BY dept_id)`', '`(SELECT * FROM employees)`'],
          answer: 1,
          explain: 'A comparison needs **one** value: one row, one column. `MAX(salary)` with no GROUP BY guarantees that. Many rows is an error in Postgres — and in SQLite it silently uses the *first* row, which is worse.',
        },
        { kind: 'recall', prompt: 'Without scrolling: why does `WHERE id NOT IN (SELECT dept_id FROM employees)` return zero rows here, and what are two ways to fix it?', answer: 'The subquery list contains a NULL, so every `id <> NULL` test is UNKNOWN and WHERE drops the row. Fix: filter `WHERE dept_id IS NOT NULL` inside the subquery, or use NOT EXISTS (or LEFT JOIN … IS NULL).' },
        { kind: 'explain', id: 'sql04-l1-e1', prompt: 'Explain to a new analyst, in two sentences, what a scalar subquery is and when you would reach for one.' },
      ],
      cards: [
        { id: 'sql04-l1-k1', kind: 'concept', front: 'What must a **scalar** subquery return?', back: 'Exactly one row and one column — a single value.' },
        { id: 'sql04-l1-k2', kind: 'concept', front: 'Why can `x NOT IN (subquery)` return zero rows?', back: 'If the subquery returns any NULL, `x <> NULL` is UNKNOWN, so the whole NOT IN is never TRUE.' },
        { id: 'sql04-l1-k3', kind: 'cloze', text: "Employees in New York departments: `WHERE dept_id {{}} (SELECT id FROM departments WHERE location = 'New York')`", answers: ['IN'] },
        { id: 'sql04-l1-k4', kind: 'sql', prompt: 'Return `name` and `salary` of employees earning more than the company average salary.', dataset: 'hr', solution: 'SELECT name, salary FROM employees WHERE salary > (SELECT AVG(salary) FROM employees);' },
        { id: 'sql04-l1-k5', kind: 'cloze', text: 'NULL-safe NOT IN: `WHERE id NOT IN (SELECT dept_id FROM employees WHERE dept_id {{}})`', answers: ['IS NOT NULL'] },
      ],
    },
    // ------------------------------------------------------------------ L2
    {
      id: 'sql04-l2',
      track: 'sql',
      title: 'Correlated subqueries, EXISTS & derived tables',
      summary: 'Subqueries that look at the outer row, EXISTS / NOT EXISTS (the NULL-safe anti-join), and subqueries in FROM.',
      minutes: 16,
      faang:
        '"Employees who earn more than their department average" and "customers with no orders" are staples of Meta/Amazon-style loops. Interviewers listen for the words correlated, EXISTS and anti-join — and whether you pick a NULL-safe pattern.',
      tags: ['Correlated subquery', 'EXISTS', 'Anti-join', 'Derived table'],
      dataset: 'hr',
      cells: [
        {
          kind: 'md',
          text: `New question: **"Who earns more than the average of *their own* department?"**

One company-wide number won't do — each row needs a *different* benchmark. So the subquery must **peek at the outer row** to know which department to average. That is a **correlated subquery**: \`x.dept_id = e.dept_id\` links the inner table (\`x\`) to the outer row (\`e\`).`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT e.name, e.dept_id, e.salary
FROM employees e
WHERE e.salary > (SELECT AVG(x.salary)
                  FROM employees x
                  WHERE x.dept_id = e.dept_id);`,
          predict: {
            question: 'Engineering, Data, Sales and Marketing each have some above-average earners. Victor has dept_id NULL. How many rows?',
            options: ['3', '7', '8', '9'],
            answer: 2,
            fromOutput: true,
            explain: '3 in Engineering + 3 in Data + Carlos (Sales) + Ben (Marketing) = 8. Victor vanishes: `x.dept_id = NULL` matches nothing, his benchmark is NULL, and `90000 > NULL` is UNKNOWN.',
          },
          note: 'Table aliases (`e` outside, `x` inside) are not optional here — they are how you say *which* employees table you mean.',
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: AVERAGEIF dragged down a column',
          text: 'In Excel you would write `=AVERAGEIF(C:C, C2, F:F)` and drag it down: every row averages *its own* department. A correlated subquery is that formula — conceptually **re-run once per outer row**, with that row\'s values plugged in.',
        },
        {
          kind: 'md',
          text: `**EXISTS (subquery)** asks a yes/no question: *"does the subquery return at least one row?"* It doesn't care what's in the row, so people write \`SELECT 1\`.

**NOT EXISTS** is the opposite — the **anti-join** ("rows with no match"). It's **NULL-safe**: a NULL simply fails to match, it can't poison the whole test the way it poisons NOT IN.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `-- managers = employees that at least one person reports to
SELECT m.name
FROM employees m
WHERE EXISTS (SELECT 1 FROM employees r WHERE r.manager_id = m.id);`,
          predict: {
            question: 'How many employees have at least one direct report?',
            options: ['5', '7', '11', '16'],
            answer: 1,
            fromOutput: true,
            explain: 'Priya, Marcus, Sofia, Nadia, Omar, Carlos and Ben all appear as somebody\'s manager_id — 7 managers.',
          },
        },
        {
          kind: 'challenge',
          id: 'sql04-l2-c1',
          lang: 'sql',
          title: 'Individual contributors',
          prompt: 'Return the `name` of every employee who **manages nobody** (no one has them as `manager_id`), sorted by name. The starter looks right but returns nothing — find out why and fix it.',
          starter: 'SELECT name\nFROM employees\nWHERE id NOT IN (SELECT manager_id FROM employees)\nORDER BY name;',
          hints: [
            'Run `SELECT manager_id FROM employees` on its own. Priya and Carlos have no manager — what does that put in the list?',
            'Switch to `NOT EXISTS (SELECT 1 FROM employees r WHERE r.manager_id = e.id)` — alias the outer table as `e`.',
            'Full shape: `SELECT e.name FROM employees e WHERE NOT EXISTS (…) ORDER BY e.name;`',
          ],
          solution: 'SELECT e.name\nFROM employees e\nWHERE NOT EXISTS (SELECT 1 FROM employees r WHERE r.manager_id = e.id)\nORDER BY e.name;',
          explain: 'manager_id contains NULLs (top bosses), so NOT IN was poisoned. NOT EXISTS checks each employee independently and ignores NULLs — 11 individual contributors.',
          sql: { ordered: true },
        },
        {
          kind: 'callout',
          tone: 'interview',
          title: 'How this is asked',
          text: '"Find X with no Y" has three standard answers: `NOT EXISTS`, `LEFT JOIN … WHERE y.id IS NULL`, and `NOT IN`. Say which you pick and why: *"NOT EXISTS — it is NULL-safe and the optimizer runs it as an anti-join."* Mentioning the NOT IN trap unprompted is a strong signal in Meta/Amazon-style loops.',
        },
        {
          kind: 'md',
          text: `A subquery can also sit in **FROM**. Its result becomes a temporary table — a **derived table** — and it **must have an alias**.

Why bother? It lets you **filter or join on aggregates** you just computed: e.g. build one row per department with its average and headcount, then keep only departments with 3+ people.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT d.dept_id, ROUND(d.avg_sal) AS avg_sal, d.n
FROM (SELECT dept_id, AVG(salary) AS avg_sal, COUNT(*) AS n
      FROM employees
      GROUP BY dept_id) AS d
WHERE d.n >= 3
ORDER BY avg_sal DESC;`,
          predict: {
            question: 'Group sizes: Engineering 6, Data 5, Sales 4, Marketing 2, and Victor alone in the NULL group. How many rows survive?',
            options: ['2', '3', '4', '5'],
            answer: 1,
            fromOutput: true,
            explain: 'Only the groups with n ≥ 3: Engineering, Data, Sales. (You could also do this with HAVING — derived tables shine once you need several steps.)',
          },
        },
        {
          kind: 'viz',
          viz: { type: 'pipeline', sql: 'SELECT d.dept_id, ROUND(d.avg_sal) AS avg_sal, d.n FROM (SELECT dept_id, AVG(salary) AS avg_sal, COUNT(*) AS n FROM employees GROUP BY dept_id) AS d WHERE d.n >= 3 ORDER BY avg_sal DESC' },
          caption: 'The **FROM** step already shows the derived table: 5 summary rows, not 18 employees. Everything after works on that small table.',
        },
        {
          kind: 'challenge',
          id: 'sql04-l2-c2',
          lang: 'sql',
          title: 'Top earner in every department',
          prompt: 'For each department, return the department name as `dept` and the name of its highest-paid employee as `top_earner`, sorted by `dept`. (Victor has no department — skip him.)',
          starter: "SELECT d.name AS dept, e.name AS top_earner\nFROM employees e\nJOIN departments d ON d.id = e.dept_id\nWHERE e.salary = (SELECT MAX(x.salary) FROM employees x)\nORDER BY dept;",
          hints: [
            'The starter compares everyone with the *company* maximum, so only Engineering shows up.',
            'Correlate the subquery: add `WHERE x.dept_id = e.dept_id` inside the parentheses.',
          ],
          solution: "SELECT d.name AS dept, e.name AS top_earner\nFROM employees e\nJOIN departments d ON d.id = e.dept_id\nWHERE e.salary = (SELECT MAX(x.salary) FROM employees x WHERE x.dept_id = e.dept_id)\nORDER BY dept;",
          explain: 'One link (`x.dept_id = e.dept_id`) turns a global benchmark into a per-department one. If two people tied for the top salary, both would appear — a nice property to mention.',
          sql: { ordered: true },
        },
        {
          kind: 'quiz',
          id: 'sql04-l2-q1',
          q: 'What makes a subquery **correlated**?',
          options: ['It uses GROUP BY', 'It references a column from the outer query', 'It is in the FROM clause', 'It returns more than one row'],
          answer: 1,
          explain: 'A correlated subquery mentions the outer row (e.g. `e.dept_id`), so its result changes from row to row. A subquery in FROM (derived table) is usually *not* correlated.',
        },
        { kind: 'recall', prompt: 'Name the three ways to write "employees who manage nobody", and say which one breaks on NULLs.', answer: 'NOT EXISTS (…), LEFT JOIN … WHERE r.id IS NULL, and NOT IN (…). NOT IN breaks when the subquery returns a NULL.' },
        { kind: 'explain', id: 'sql04-l2-e1', prompt: 'In your own words: why is NOT EXISTS NULL-safe while NOT IN is not?' },
      ],
      cards: [
        { id: 'sql04-l2-k1', kind: 'concept', front: 'What is a correlated subquery?', back: 'A subquery that references the outer row (e.g. `x.dept_id = e.dept_id`), so it is conceptually re-evaluated for every outer row.' },
        { id: 'sql04-l2-k2', kind: 'cloze', text: 'Employees who manage nobody: `WHERE {{}} (SELECT 1 FROM employees r WHERE r.manager_id = e.id)`', answers: ['NOT EXISTS'] },
        { id: 'sql04-l2-k3', kind: 'concept', front: 'What does a subquery in FROM (a derived table) always need?', back: 'An alias, e.g. `FROM (SELECT …) AS d`.' },
        { id: 'sql04-l2-k4', kind: 'sql', prompt: 'Return the `name` of every employee who has at least one direct report (use EXISTS).', dataset: 'hr', solution: 'SELECT m.name FROM employees m WHERE EXISTS (SELECT 1 FROM employees r WHERE r.manager_id = m.id);' },
        { id: 'sql04-l2-k5', kind: 'concept', front: 'Does EXISTS care which columns the subquery selects?', back: 'No — it only checks whether at least one row exists. `SELECT 1` is the convention.' },
      ],
    },
    // ------------------------------------------------------------------ L3
    {
      id: 'sql04-l3',
      track: 'sql',
      title: 'WITH: CTEs and recursive CTEs',
      summary: 'Name each step of a query with WITH, then use WITH RECURSIVE to walk an org chart and generate date series.',
      minutes: 18,
      faang:
        'Interviewers at Meta, Amazon and Google grade readability: a multi-step answer written as named CTEs is easier to follow and debug than nested subqueries. Recursive CTEs show up for hierarchies (org charts, category trees) and for building a calendar to fill missing days.',
      tags: ['CTE', 'WITH', 'Recursive CTE', 'Hierarchy', 'Date spine'],
      dataset: 'hr',
      cells: [
        {
          kind: 'md',
          text: `Real interview answers have 3–5 steps. Nest them as subqueries and you get an onion nobody can read.

**WITH** lets you give each step a **name**, top to bottom, like a recipe:

\`\`\`sql
WITH step1 AS (…),
     step2 AS (… FROM step1 …)
SELECT … FROM step2;
\`\`\`

Each name is a **CTE** (Common Table Expression): a temporary, named result that only lives for this one query.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `WITH dept_stats AS (
  SELECT dept_id, AVG(salary) AS avg_salary
  FROM employees
  GROUP BY dept_id
),
company AS (
  SELECT AVG(salary) AS avg_salary FROM employees
)
SELECT d.name, ROUND(s.avg_salary) AS avg_salary
FROM dept_stats s
JOIN departments d ON d.id = s.dept_id
CROSS JOIN company c
WHERE s.avg_salary > c.avg_salary
ORDER BY s.avg_salary DESC;`,
          predict: {
            question: 'Which departments pay above the company average (≈165,833)? How many rows?',
            options: ['1', '2', '3', '4'],
            answer: 1,
            fromOutput: true,
            explain: 'Engineering (≈201,667) and Data (170,600). Sales (144,250) and Marketing (127,500) fall below. `company` has one row, so CROSS JOIN just glues that number onto every row.',
          },
        },
        {
          kind: 'viz',
          viz: { type: 'pipeline', sql: 'WITH dept_stats AS (SELECT dept_id, AVG(salary) AS avg_salary FROM employees GROUP BY dept_id), company AS (SELECT AVG(salary) AS avg_salary FROM employees) SELECT d.name, ROUND(s.avg_salary) AS avg_salary FROM dept_stats s JOIN departments d ON d.id = s.dept_id CROSS JOIN company c WHERE s.avg_salary > c.avg_salary ORDER BY s.avg_salary DESC' },
          caption: 'The final SELECT reads the CTEs like ordinary tables. FROM + JOIN shows the per-department rows with the company average glued on; WHERE keeps two.',
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: helper tabs in a workbook',
          text: 'A CTE is a **helper tab** in Excel: build `dept_stats` on its own sheet, then your final formula refers to the sheet *by name*. Top-to-bottom, one idea per tab — and you can open any tab (`SELECT * FROM dept_stats`) to check it.',
        },
        {
          kind: 'callout',
          tone: 'interview',
          title: 'Narrate your CTEs',
          text: 'In a live round, write the CTE names first and talk through them: *"Step 1 `dept_stats` gets one row per department. Step 2 compares it with the company average."* If the answer is wrong, you can debug one step at a time — interviewers love watching that.',
        },
        {
          kind: 'md',
          text: `**WITH RECURSIVE** lets a CTE refer to **itself**. It has two halves joined by UNION ALL:

1. **Anchor** — the starting rows.
2. **Recursive member** — builds new rows from the rows added in the previous round.

SQL keeps running round after round and **stops when a round adds no new rows**. So the recursive member *must* eventually produce nothing (a WHERE stop condition, or running out of matches).`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `WITH RECURSIVE days(d) AS (
  SELECT '2024-01-01'                -- anchor
  UNION ALL
  SELECT date(d, '+1 day')           -- next day
  FROM days
  WHERE d < '2024-01-07'             -- stop condition
)
SELECT d FROM days;`,
          predict: {
            question: 'How many rows does this generate?',
            options: ['6', '7', '8', 'It never stops'],
            answer: 1,
            fromOutput: true,
            explain: "Jan 1 … Jan 7. When d = '2024-01-07' the WHERE fails, that round adds nothing, and recursion stops. A calendar like this is called a **date spine**.",
          },
          note: "`date(d, '+1 day')` is SQLite date arithmetic (more in the next module).",
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'Forgetting the stop condition',
          text: 'Drop the `WHERE d < …` and the recursive member always produces a new row — the query **never finishes**. While experimenting, add `LIMIT 100` to the final SELECT as a seatbelt.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `WITH RECURSIVE org(id, name, lvl) AS (
  SELECT id, name, 0 FROM employees WHERE id = 1      -- Priya, the VP
  UNION ALL
  SELECT e.id, e.name, o.lvl + 1
  FROM employees e
  JOIN org o ON e.manager_id = o.id                     -- people who report to someone already found
)
SELECT id, name, lvl FROM org ORDER BY lvl, id;`,
          predict: {
            question: 'Walking the org chart *down* from Priya: how many rows (Priya + everyone under her)?',
            options: ['6', '11', '12', '18'],
            answer: 2,
            fromOutput: true,
            explain: 'Round 0: Priya. Round 1: her 4 reports. Round 2: their 6 reports. Round 3: Emma. 1 + 4 + 6 + 1 = 12. Carlos (Sales Director) has no manager, so his 5-person tree is never reached.',
          },
          note: 'Each round joins `employees` to the rows found in the **previous** round — like spreading out one level of the tree at a time.',
        },
        {
          kind: 'challenge',
          id: 'sql04-l3-c1',
          lang: 'sql',
          title: "Emma's chain of command",
          prompt: 'Walk **up** the org chart from Emma Novak (`id = 11`). Return each manager\'s `name` and `lvl` (1 = her direct manager, 2 = their manager, …), ordered by `lvl`.',
          starter: 'SELECT m.name, 1 AS lvl\nFROM employees e\nJOIN employees m ON m.id = e.manager_id\nWHERE e.id = 11;',
          hints: [
            'The starter finds only the first step (Omar). Make it the **anchor** of a `WITH RECURSIVE chain(id, name, manager_id, lvl)`.',
            "Recursive member: from each chain row, look up *its* manager: `FROM chain c JOIN employees m ON m.id = c.manager_id`, with `c.lvl + 1`.",
            'It stops by itself when it reaches Priya, whose manager_id is NULL (the join finds nothing). Finish with `SELECT name, lvl FROM chain ORDER BY lvl;`',
          ],
          solution: 'WITH RECURSIVE chain(id, name, manager_id, lvl) AS (\n  SELECT m.id, m.name, m.manager_id, 1\n  FROM employees e\n  JOIN employees m ON m.id = e.manager_id\n  WHERE e.id = 11\n  UNION ALL\n  SELECT m.id, m.name, m.manager_id, c.lvl + 1\n  FROM chain c\n  JOIN employees m ON m.id = c.manager_id\n)\nSELECT name, lvl FROM chain ORDER BY lvl;',
          explain: 'Omar (1) → Nadia (2) → Priya (3). Going *up* means joining on `m.id = c.manager_id`; going *down* means `e.manager_id = o.id`. Same machine, opposite direction.',
          sql: { ordered: true },
        },
        {
          kind: 'challenge',
          id: 'sql04-l3-c2',
          lang: 'sql',
          title: 'Hires per month — keep the zeros',
          prompt: "Return one row for **every month of 2021**: `month_start` (e.g. `'2021-01-01'`) and `hires` = how many employees were hired that month (**0** if none), ordered by `month_start`. The starter skips empty months.",
          starter: "SELECT date(hire_date, 'start of month') AS month_start, COUNT(*) AS hires\nFROM employees\nWHERE hire_date LIKE '2021%'\nGROUP BY month_start\nORDER BY month_start;",
          hints: [
            "GROUP BY can only report months that *have* rows. Generate all 12 months first: `WITH RECURSIVE months(m) AS (SELECT '2021-01-01' UNION ALL SELECT date(m, '+1 month') FROM months WHERE m < '2021-12-01')`.",
            "LEFT JOIN employees onto the months: `ON e.hire_date >= months.m AND e.hire_date < date(months.m, '+1 month')`.",
            'Use `COUNT(e.id)`, not `COUNT(*)` — COUNT(*) would count the empty month itself as 1.',
          ],
          solution: "WITH RECURSIVE months(m) AS (\n  SELECT '2021-01-01'\n  UNION ALL\n  SELECT date(m, '+1 month') FROM months WHERE m < '2021-12-01'\n)\nSELECT months.m AS month_start, COUNT(e.id) AS hires\nFROM months\nLEFT JOIN employees e\n  ON e.hire_date >= months.m AND e.hire_date < date(months.m, '+1 month')\nGROUP BY months.m\nORDER BY months.m;",
          explain: 'The **date spine** pattern: generate the full calendar, LEFT JOIN the facts onto it, count a column from the right table so empty months show 0. Dashboards and "daily active users" questions rely on it.',
          sql: { ordered: true },
        },
        {
          kind: 'quiz',
          id: 'sql04-l3-q1',
          q: 'When does a recursive CTE stop?',
          options: ['After 100 rounds', 'When a round produces no new rows', 'When the anchor returns NULL', 'When you add ORDER BY'],
          answer: 1,
          explain: 'Each round feeds on the previous round\'s new rows. As soon as a round adds nothing — the WHERE fails or the JOIN finds no more children — recursion ends.',
        },
        { kind: 'recall', prompt: 'Name the two halves of a recursive CTE, and what keyword joins them.', answer: 'The anchor (starting rows) and the recursive member (which reads the CTE itself), joined by UNION ALL, inside WITH RECURSIVE.' },
        { kind: 'explain', id: 'sql04-l3-e1', prompt: 'Explain to a teammate why you would rewrite a three-level nested subquery as CTEs. Give two concrete benefits.' },
      ],
      cards: [
        { id: 'sql04-l3-k1', kind: 'concept', front: 'What is a CTE?', back: 'A named, temporary result defined with `WITH name AS (…)` that the rest of the query can use like a table.' },
        { id: 'sql04-l3-k2', kind: 'cloze', text: "Date series: `WITH {{}} days(d) AS (SELECT '2024-01-01' {{}} SELECT date(d, '+1 day') FROM days WHERE d < '2024-01-31')`", answers: ['RECURSIVE', 'UNION ALL'] },
        { id: 'sql04-l3-k3', kind: 'concept', front: 'When does a recursive CTE stop?', back: 'When a round of the recursive member adds no new rows.' },
        { id: 'sql04-l3-k4', kind: 'sql', prompt: 'Generate the numbers 1 to 10 in a column `n` with a recursive CTE.', dataset: 'hr', solution: 'WITH RECURSIVE nums(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM nums WHERE n < 10) SELECT n FROM nums;', ordered: true },
        { id: 'sql04-l3-k5', kind: 'concept', front: 'Walking an org chart **down** vs **up**: what changes in the recursive JOIN?', back: 'Down: `e.manager_id = o.id` (find my reports). Up: `m.id = c.manager_id` (find my manager).' },
      ],
    },
  ],
};
