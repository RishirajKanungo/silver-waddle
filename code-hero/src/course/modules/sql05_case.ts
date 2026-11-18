import type { Module } from '../types';

export const module: Module = {
  id: 'sql05',
  track: 'sql',
  order: 5,
  title: 'CASE, NULLs, strings & dates',
  icon: '🧰',
  level: 'Core',
  blurb: 'The everyday toolbox: CASE bucketing and pivots, COALESCE / NULLIF, text functions, and SQLite date math for monthly reports.',
  boss: ['sql-gym-driver-rating-mix', 'sql-gym-monthly-status-pivot'],
  lessons: [
    // ------------------------------------------------------------------ L1
    {
      id: 'sql05-l1',
      track: 'sql',
      title: 'CASE WHEN: buckets & pivots',
      summary: 'Label rows with CASE, bucket them, and turn rows into columns with SUM(CASE …) — conditional aggregation.',
      minutes: 15,
      faang:
        'Conditional aggregation — `SUM(CASE WHEN … THEN … END)` — is how you compute rates, pivots and segment splits in one pass. It appears in almost every Meta/Amazon-style product-analytics round ("% of rides cancelled", "revenue by status per month").',
      tags: ['CASE', 'Bucketing', 'Pivot', 'Conditional aggregation'],
      dataset: 'bank',
      cells: [
        {
          kind: 'md',
          text: `**CASE** is SQL's IF — like Excel's \`IFS()\`:

\`\`\`sql
CASE
  WHEN condition1 THEN result1
  WHEN condition2 THEN result2
  ELSE fallback
END
\`\`\`

It produces **one value per row**, so it can go anywhere a column can: SELECT, WHERE, GROUP BY, ORDER BY, even inside SUM(). Watch how it picks a branch:`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT CASE
         WHEN amount > 0     THEN 'in'
         WHEN amount > 10000 THEN 'big in'
         ELSE 'out'
       END AS label
FROM transactions
WHERE id = 1;   -- the 14,500 opening deposit`,
          predict: {
            question: 'Transaction 1 is a deposit of 14,500. Which label comes back?',
            options: ['big in', 'in', 'out', 'NULL'],
            answer: 1,
            fromOutput: true,
            explain: "CASE stops at the **first** TRUE branch. 14,500 > 0 is TRUE, so it never even looks at `> 10000`. Put the most specific conditions **first**.",
          },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: the waterfall',
          text: 'Picture each row **falling down a waterfall of ledges** (the WHENs). It lands on the **first** ledge that is TRUE and stops. `ELSE` is the pool at the bottom — and with no ELSE, the row falls into **NULL**.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT CASE
         WHEN amount >= 5000 THEN 'opening deposit'
         WHEN amount > 0     THEN 'deposit'
         WHEN amount > -500  THEN 'small debit'
         ELSE 'large debit'
       END AS bucket,
       COUNT(*) AS n
FROM transactions
GROUP BY bucket
ORDER BY n DESC;`,
          predict: {
            question: 'Which bucket will be at the top (most transactions)?',
            options: ['opening deposit', 'deposit', 'small debit', 'large debit'],
            answer: 3,
            fromOutput: false,
            explain: '19 of the 42 transactions are debits of 500 or more. Bucketing + GROUP BY is how you build histograms and segment reports in SQL.',
          },
          note: 'You can GROUP BY the CASE alias (`bucket`) in SQLite, Postgres and BigQuery. Some engines make you repeat the whole CASE expression.',
        },
        {
          kind: 'md',
          text: `Now the power move: put CASE **inside** an aggregate. That's **conditional aggregation**:

- \`SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END)\` = Excel's **SUMIF**
- \`SUM(CASE WHEN kind = 'card' THEN 1 ELSE 0 END)\` = **COUNTIF**

One GROUP BY, several CASE columns → you've **pivoted** rows into columns, like a pivot table.`,
        },
        { kind: 'viz', viz: { type: 'groupby', table: 'transactions', key: 'account_id', agg: 'sum', col: 'amount' }, caption: 'A plain GROUP BY gives **one** total per account. Conditional aggregation splits that bucket into several labelled totals (money in, money out…) side by side.' },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT account_id,
       SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END)  AS money_in,
       SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS money_out,
       SUM(amount)                                        AS net
FROM transactions
GROUP BY account_id
ORDER BY account_id;`,
          predict: {
            question: 'The bank has 7 accounts; account 107 (Dormant Co) has never transacted. How many rows?',
            options: ['6', '7', '42', '2'],
            answer: 0,
            fromOutput: true,
            explain: 'GROUP BY only creates buckets for values that appear in `transactions`, so 107 is missing. (To show it with zeros, LEFT JOIN from `accounts`.)',
          },
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'COUNT counts zeros too',
          text: '`COUNT(x)` counts every non-NULL value — and **0 is not NULL**. So `COUNT(CASE WHEN … THEN 1 ELSE 0 END)` counts *every* row. Use `SUM(CASE … THEN 1 ELSE 0 END)` or `COUNT(CASE … THEN 1 END)` (no ELSE → NULL → not counted).',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT COUNT(CASE WHEN amount < 0 THEN 1 ELSE 0 END) AS withdrawals
FROM transactions;`,
          predict: {
            question: 'There are 25 withdrawals among 42 transactions. What does this return?',
            options: ['25', '42', '17', '0'],
            answer: 1,
            fromOutput: true,
            explain: 'Every row gets a 1 or a 0 — both non-NULL — so COUNT returns all 42. Swap COUNT for SUM, or delete `ELSE 0`, to get 25.',
          },
        },
        {
          kind: 'challenge',
          id: 'sql05-l1-c1',
          lang: 'sql',
          title: 'Pivot transaction kinds',
          prompt: 'Return one row per `account_id` with three columns counting its transactions by kind: `card_n`, `wire_n`, `deposit_n`. Order by `account_id`.',
          starter: 'SELECT account_id, kind, COUNT(*) AS n\nFROM transactions\nGROUP BY account_id, kind\nORDER BY account_id;',
          hints: [
            'The starter is "long" format (one row per account × kind). You want "wide": GROUP BY account_id only.',
            "One column per kind: `SUM(CASE WHEN kind = 'card' THEN 1 ELSE 0 END) AS card_n`, then the same for 'wire' and 'deposit'.",
          ],
          solution: "SELECT account_id,\n       SUM(CASE WHEN kind = 'card' THEN 1 ELSE 0 END)    AS card_n,\n       SUM(CASE WHEN kind = 'wire' THEN 1 ELSE 0 END)    AS wire_n,\n       SUM(CASE WHEN kind = 'deposit' THEN 1 ELSE 0 END) AS deposit_n\nFROM transactions\nGROUP BY account_id\nORDER BY account_id;",
          explain: 'Long → wide with conditional aggregation. Note account 105 shows `wire_n = 0` rather than disappearing — that is the advantage over filtering with WHERE.',
          sql: { ordered: true },
        },
        {
          kind: 'challenge',
          id: 'sql05-l1-c2',
          lang: 'sql',
          title: 'Balance tiers',
          prompt: "For each `account_id`, return its `balance` (sum of amounts) and a `tier`: **'high'** if balance ≥ 12,000, **'mid'** if ≥ 8,000, otherwise **'low'**. Order by `account_id`. The starter's tiers are wrong — why?",
          starter: "SELECT account_id,\n       SUM(amount) AS balance,\n       CASE WHEN SUM(amount) >= 8000 THEN 'mid'\n            WHEN SUM(amount) >= 12000 THEN 'high'\n            ELSE 'low' END AS tier\nFROM transactions\nGROUP BY account_id\nORDER BY account_id;",
          hints: [
            'Accounts 101 and 103 have more than 12,000, yet they are labelled mid. Which WHEN do they hit first?',
            'Waterfall rule: test the **highest** threshold first. Swap the two WHEN lines.',
          ],
          solution: "SELECT account_id,\n       SUM(amount) AS balance,\n       CASE WHEN SUM(amount) >= 12000 THEN 'high'\n            WHEN SUM(amount) >= 8000 THEN 'mid'\n            ELSE 'low' END AS tier\nFROM transactions\nGROUP BY account_id\nORDER BY account_id;",
          explain: 'With `>=` thresholds, order WHENs from biggest to smallest so each row stops at the right ledge. CASE can wrap an aggregate, too — it runs after GROUP BY.',
          sql: { ordered: true },
        },
        {
          kind: 'quiz',
          id: 'sql05-l1-q1',
          q: "What does `CASE WHEN amount > 100000 THEN 'huge' END` return for an amount of 50?",
          options: ["'huge'", "'' (empty string)", 'NULL', 'An error — ELSE is required'],
          answer: 2,
          explain: 'No branch matched and there is no ELSE, so the result is NULL. ELSE is optional — which is exactly why `COUNT(CASE … THEN 1 END)` works.',
        },
        { kind: 'recall', prompt: 'Write (from memory) the expression that counts card transactions inside a GROUP BY account_id query.', answer: "`SUM(CASE WHEN kind = 'card' THEN 1 ELSE 0 END)` — or `COUNT(CASE WHEN kind = 'card' THEN 1 END)`." },
        { kind: 'explain', id: 'sql05-l1-e1', prompt: 'Explain to an Excel user how SUM(CASE WHEN …) relates to a pivot table and to SUMIF.' },
      ],
      cards: [
        { id: 'sql05-l1-k1', kind: 'concept', front: 'CASE with no matching WHEN and no ELSE returns…?', back: 'NULL.' },
        { id: 'sql05-l1-k2', kind: 'cloze', text: "Count card transactions: `SUM(CASE WHEN kind = 'card' THEN 1 {{}} 0 {{}})`", answers: ['ELSE', 'END'] },
        { id: 'sql05-l1-k3', kind: 'concept', front: 'CASE has two WHENs that are both TRUE for a row. Which result wins?', back: 'The first one, top to bottom. Put the most specific / highest threshold first.' },
        { id: 'sql05-l1-k4', kind: 'sql', prompt: 'Per `account_id`, return `money_in` = the sum of positive amounts only.', dataset: 'bank', solution: 'SELECT account_id, SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS money_in FROM transactions GROUP BY account_id;' },
        { id: 'sql05-l1-k5', kind: 'concept', front: 'Why is `COUNT(CASE WHEN x THEN 1 ELSE 0 END)` a bug?', back: 'COUNT counts every non-NULL value, and 0 is not NULL — so it counts all rows. Use SUM, or drop the ELSE.' },
      ],
    },
    // ------------------------------------------------------------------ L2
    {
      id: 'sql05-l2',
      track: 'sql',
      title: 'NULL tools & string functions',
      summary: 'COALESCE for defaults, NULLIF for safe division, integer-division traps, and ||, UPPER, SUBSTR, INSTR, REPLACE, TRIM, LENGTH.',
      minutes: 15,
      faang:
        'Clean reporting needs NULL defaults and safe ratios — interviewers deliberately plant NULLs and zero denominators to see if you notice. String parsing (split a name, build an email, normalise a code) is a common warm-up in Amazon/Meta-style data screens.',
      tags: ['COALESCE', 'NULLIF', 'Safe division', 'String functions'],
      dataset: 'hr',
      cells: [
        {
          kind: 'md',
          text: `NULL is **contagious**: almost any operation that touches it becomes NULL.

- \`1 + NULL\` → NULL
- \`'Sales' || NULL\` → NULL  (\`||\` glues strings together)

**COALESCE(a, b, c, …)** returns the **first non-NULL** argument. It's your "default value" tool: \`COALESCE(d.name, 'Unassigned')\`.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT 'Sales' || NULL AS glued,
       COALESCE(NULL, NULL, 'third', 'fourth') AS first_found;`,
          predict: {
            question: 'What does the `glued` column show?',
            options: ['Sales', 'SalesNULL', 'NULL', 'An error'],
            answer: 2,
            fromOutput: false,
            explain: "Concatenating with NULL yields NULL — the whole label disappears. `first_found` is 'third': COALESCE walks left to right and returns the first non-NULL.",
          },
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT e.name,
       COALESCE(m.name, '(none)')     AS manager,
       COALESCE(d.name, 'Unassigned') AS dept
FROM employees e
LEFT JOIN employees m   ON m.id = e.manager_id
LEFT JOIN departments d ON d.id = e.dept_id
ORDER BY e.id;`,
          predict: {
            question: 'Two people have no manager and Victor has no department. How many rows?',
            options: ['15', '16', '17', '18'],
            answer: 3,
            fromOutput: true,
            explain: 'LEFT JOINs keep all 18 employees; the missing sides come back NULL, and COALESCE swaps those NULLs for readable labels.',
          },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: roll call & "never mind"',
          text: '**COALESCE** is a **roll call**: it reads names down the list and answers with the first one who is actually present. **NULLIF(a, b)** is **"never mind"**: if a equals b, it pretends it saw nothing (NULL); otherwise it hands back a.',
        },
        {
          kind: 'md',
          text: `**Safe division:** \`x / NULLIF(y, 0)\`. If y is 0, NULLIF turns it into NULL and the result is NULL instead of a crash. (SQLite quietly returns NULL for \`x / 0\`, but Postgres, Snowflake and SQL Server **raise an error** — write portable SQL.)

**Integer division:** when both sides are integers, SQLite and Postgres **drop the decimals**. Multiply by \`1.0\` first: \`7 * 1.0 / 2\` = 3.5.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: 'SELECT 7 / 2;',
          predict: {
            question: 'What does SQLite return?',
            options: ['3.5', '3', '4', 'An error'],
            answer: 1,
            fromOutput: true,
            explain: 'Integer ÷ integer = integer, truncated. This is the #1 reason "conversion rate" answers come out as 0 in interviews. Fix: `7 * 1.0 / 2` or `CAST(7 AS REAL) / 2`.',
          },
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: '`<>` silently drops NULLs',
          text: '`WHERE dept_id <> 1` returns 11 rows, not 12 — Victor (NULL) is UNKNOWN and gets dropped. If "not Engineering" should include him, write `WHERE COALESCE(dept_id, 0) <> 1` (12 rows).',
        },
        {
          kind: 'md',
          text: `**String toolbox** (SQLite; positions start at **1**):

- \`UPPER(s)\`, \`LOWER(s)\`, \`LENGTH(s)\`, \`TRIM(s)\` (strip spaces at both ends)
- \`SUBSTR(s, start, len)\` — piece of a string
- \`INSTR(s, 'x')\` — position of the first 'x' (0 if absent)
- \`REPLACE(s, 'from', 'to')\`, and \`a || b\` to concatenate

Combine them to split "First Last" at the space:`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT name,
       INSTR(name, ' ')                     AS space_at,
       SUBSTR(name, 1, INSTR(name, ' ') - 1) AS first_name,
       SUBSTR(name, INSTR(name, ' ') + 1)    AS last_name
FROM employees
LIMIT 3;`,
          predict: {
            question: "For 'Priya Shah', what is `space_at`?",
            options: ['5', '6', '7', '0'],
            answer: 1,
            fromOutput: false,
            explain: "P-r-i-y-a is positions 1–5, the space is 6. So the first name is the first 6 − 1 = 5 characters, and the last name starts at 6 + 1 = 7. SUBSTR without a length runs to the end.",
          },
        },
        {
          kind: 'challenge',
          id: 'sql05-l2-c1',
          lang: 'sql',
          title: 'Build company emails',
          prompt: "For the Data department (`dept_id = 2`), return `id` and `email` in the form `first.last@corp.com`, all lowercase (e.g. `nadia.haddad@corp.com`). Order by `id`.",
          starter: "SELECT id, LOWER(name) || '@corp.com' AS email\nFROM employees\nWHERE dept_id = 2\nORDER BY id;",
          hints: [
            "Run the starter: you get `nadia haddad@corp.com` — the space needs to become a dot.",
            "`REPLACE(name, ' ', '.')` swaps the space; wrap it in `LOWER(…)` and append with `|| '@corp.com'`.",
          ],
          solution: "SELECT id, LOWER(REPLACE(name, ' ', '.')) || '@corp.com' AS email\nFROM employees\nWHERE dept_id = 2\nORDER BY id;",
          explain: 'Functions nest inside-out: REPLACE first, then LOWER, then concatenate. (SUBSTR + INSTR would also work, but REPLACE is shorter when there is exactly one space.)',
          sql: { ordered: true },
        },
        {
          kind: 'challenge',
          id: 'sql05-l2-c2',
          lang: 'sql',
          title: 'Directory with no blanks',
          prompt: "Return every employee's `name`, their manager's name as `manager` (`'(none)'` if they have no manager) and their department name as `dept` (`'Unassigned'` if none). All 18 employees, ordered by employee `id`.",
          starter: 'SELECT e.name, m.name AS manager, d.name AS dept\nFROM employees e\nJOIN employees m ON m.id = e.manager_id\nJOIN departments d ON d.id = e.dept_id\nORDER BY e.id;',
          hints: [
            'INNER JOINs drop Priya, Carlos (no manager) and Victor (no department). Which join keeps unmatched rows?',
            "Make both joins `LEFT JOIN`, then wrap the columns: `COALESCE(m.name, '(none)')`, `COALESCE(d.name, 'Unassigned')`.",
          ],
          solution: "SELECT e.name,\n       COALESCE(m.name, '(none)') AS manager,\n       COALESCE(d.name, 'Unassigned') AS dept\nFROM employees e\nLEFT JOIN employees m ON m.id = e.manager_id\nLEFT JOIN departments d ON d.id = e.dept_id\nORDER BY e.id;",
          explain: 'LEFT JOIN keeps the rows; COALESCE makes the gaps readable. This pair is the bread and butter of every report you will ever ship.',
          sql: { ordered: true },
        },
        {
          kind: 'quiz',
          id: 'sql05-l2-q1',
          q: 'Which expression computes a conversion rate safely and with decimals?',
          options: ['`buyers / visitors`', '`buyers * 1.0 / NULLIF(visitors, 0)`', '`COALESCE(buyers / visitors, 0)`', '`NULLIF(buyers, 0) / visitors`'],
          answer: 1,
          explain: '`* 1.0` forces decimal division and `NULLIF(visitors, 0)` avoids division by zero. Option 3 still truncates to 0 and still crashes on Postgres when visitors = 0.',
        },
        { kind: 'recall', prompt: 'What do COALESCE(a, b) and NULLIF(a, b) each return?', answer: 'COALESCE: the first non-NULL of its arguments. NULLIF: NULL if a = b, otherwise a.' },
        { kind: 'explain', id: 'sql05-l2-e1', prompt: 'Explain why `x / NULLIF(y, 0)` is safer than `x / y`, and what extra fix you need when x and y are integers.' },
      ],
      cards: [
        { id: 'sql05-l2-k1', kind: 'concept', front: 'What does `COALESCE(NULL, NULL, 5, 7)` return?', back: '5 — the first non-NULL argument.' },
        { id: 'sql05-l2-k2', kind: 'cloze', text: 'Safe division: `revenue / {{}}(orders, 0)`', answers: ['NULLIF'] },
        { id: 'sql05-l2-k3', kind: 'concept', front: 'In SQLite or Postgres, what is `7 / 2`?', back: '3 — integer division truncates. Use `7 * 1.0 / 2` for 3.5.' },
        { id: 'sql05-l2-k4', kind: 'cloze', text: "First name from 'First Last': `SUBSTR(name, 1, {{}}(name, ' ') - 1)`", answers: ['INSTR'] },
        { id: 'sql05-l2-k5', kind: 'sql', prompt: "Return every employee's `name` and their department name, showing 'Unassigned' when they have none.", dataset: 'hr', solution: "SELECT e.name, COALESCE(d.name, 'Unassigned') AS dept FROM employees e LEFT JOIN departments d ON d.id = e.dept_id;" },
      ],
    },
    // ------------------------------------------------------------------ L3
    {
      id: 'sql05-l3',
      track: 'sql',
      title: 'Dates: date(), strftime() & julianday()',
      summary: 'SQLite stores dates as text. Shift them with modifiers, bucket them into months, and measure gaps with julianday().',
      minutes: 15,
      faang:
        'Nearly every analytics question is time-bound: "monthly active users", "revenue by month", "days between signup and first purchase". Interviewers expect fluent month bucketing and date differences — and they notice when you subtract two date strings.',
      tags: ['Dates', 'strftime', 'julianday', 'Monthly report'],
      dataset: 'bank',
      cells: [
        {
          kind: 'md',
          text: `SQLite has **no DATE type**. Dates are stored as **ISO text**: \`'YYYY-MM-DD'\`. Because the biggest unit comes first, they **sort and compare correctly as strings**.

Three tools do everything:
- \`date(value, modifier, …)\` — shift a date: \`'+7 day'\`, \`'-1 month'\`, \`'start of month'\`
- \`strftime(format, value)\` — format it: \`'%Y-%m'\` gives \`'2024-01'\`
- \`julianday(value)\` — turn it into a day number you can subtract`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT txn_date,
       strftime('%Y-%m', txn_date)       AS month,
       date(txn_date, '+7 day')          AS week_later,
       date(txn_date, 'start of month')  AS month_start
FROM transactions
WHERE id IN (1, 14, 28);`,
          note: "Modifiers chain left to right: `date('2024-01-15', 'start of month', '+1 month', '-1 day')` → `'2024-01-31'` (last day of the month).",
        },
        {
          kind: 'code',
          lang: 'sql',
          code: "SELECT '2024-03-01' - '2024-01-01' AS days_between;",
          predict: {
            question: 'Two months apart. What does SQLite return?',
            options: ['0', '60', '2', 'An error'],
            answer: 0,
            fromOutput: true,
            explain: "These are **strings**. For `-`, SQLite converts each to a number using its leading digits: 2024 − 2024 = 0. No error, just a wrong answer. Use julianday().",
          },
        },
        {
          kind: 'code',
          lang: 'sql',
          code: "SELECT julianday('2024-03-01') - julianday('2024-02-01') AS days_in_feb;",
          predict: {
            question: 'How many days does this report?',
            options: ['28', '29', '30', '1'],
            answer: 1,
            fromOutput: true,
            explain: '2024 is a leap year, so February has 29 days. julianday() turns each date into a continuous day count, so subtraction gives real days. Wrap in `CAST(… AS INTEGER)` for whole numbers.',
          },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: the giant ruler',
          text: '**julianday** places every date on one giant ruler of days (day 0 is in 4714 BC). To measure the distance between two dates, read both positions on the ruler and subtract. Text dates are labels; julianday numbers are positions.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT strftime('%Y-%m', txn_date) AS month,
       COUNT(*)    AS txns,
       SUM(amount) AS net
FROM transactions
GROUP BY strftime('%Y-%m', txn_date)
ORDER BY month;`,
          predict: {
            question: 'Transactions run from January to mid-April 2024. How many rows does this monthly report have?',
            options: ['3', '4', '12', '42'],
            answer: 1,
            fromOutput: true,
            explain: "One bucket per distinct `'YYYY-MM'`: 2024-01 … 2024-04. This is **month bucketing** — the backbone of every monthly report. `date(txn_date, 'start of month')` works too and stays a real date.",
          },
        },
        {
          kind: 'viz',
          viz: { type: 'pipeline', sql: "SELECT strftime('%Y-%m', txn_date) AS month, COUNT(*) AS txns, SUM(amount) AS net FROM transactions GROUP BY strftime('%Y-%m', txn_date) ORDER BY month" },
          caption: 'At the **GROUP BY** step, rows are stacked by their month label — 42 daily rows collapse into 4 monthly ones.',
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'Month arithmetic overflows',
          text: "`date('2024-01-31', '+1 month')` is **'2024-03-02'**, not Feb 29: SQLite makes 'Feb 31' and rolls the extra days forward. To step month by month, start from the **first** of the month. Also: strftime returns **text**, so compare with `'02'`, not `2`.",
        },
        {
          kind: 'challenge',
          id: 'sql05-l3-c1',
          lang: 'sql',
          title: 'Monthly card spend',
          prompt: "Return `month` (`'YYYY-MM'`) and `card_spend` = total spent on **card** transactions that month as a **positive** number. Order by month.",
          starter: "SELECT txn_date AS month, SUM(amount) AS card_spend\nFROM transactions\nWHERE kind = 'card'\nGROUP BY txn_date\nORDER BY month;",
          hints: [
            "The starter groups by *day*. Bucket by month with `strftime('%Y-%m', txn_date)` instead (and group by that).",
            'Card amounts are negative (money out). Flip the sign: `-SUM(amount)`.',
          ],
          solution: "SELECT strftime('%Y-%m', txn_date) AS month, -SUM(amount) AS card_spend\nFROM transactions\nWHERE kind = 'card'\nGROUP BY month\nORDER BY month;",
          explain: "Month bucket + filter + aggregate — the shape of countless real dashboards. February was the big card month (6,070).",
          sql: { ordered: true },
        },
        {
          kind: 'challenge',
          id: 'sql05-l3-c2',
          lang: 'sql',
          title: 'Days until the first transaction',
          prompt: 'For each account that has transactions, return `id`, `opened` and `days_waiting` = whole days from `opened` to its **first** transaction. Order by `id`.',
          starter: 'SELECT a.id, a.opened, MIN(t.txn_date) - a.opened AS days_waiting\nFROM accounts a\nJOIN transactions t ON t.account_id = a.id\nGROUP BY a.id, a.opened\nORDER BY a.id;',
          hints: [
            'The starter subtracts two strings, so it gets the difference in *years* (2, 1, 3…).',
            'Use `julianday(MIN(t.txn_date)) - julianday(a.opened)` and wrap it in `CAST(… AS INTEGER)`.',
          ],
          solution: 'SELECT a.id, a.opened,\n       CAST(julianday(MIN(t.txn_date)) - julianday(a.opened) AS INTEGER) AS days_waiting\nFROM accounts a\nJOIN transactions t ON t.account_id = a.id\nGROUP BY a.id, a.opened\nORDER BY a.id;',
          explain: '"Time to first X" (first purchase, first ride, first deposit) is a classic metric: MIN() the event date per entity, then julianday-subtract the start date.',
          sql: { ordered: true },
        },
        {
          kind: 'quiz',
          id: 'sql05-l3-q1',
          q: 'Which expression gives the **last day of the month** for any date `d`?',
          options: ["`date(d, '+1 month')`", "`date(d, 'start of month', '+1 month', '-1 day')`", "`strftime('%Y-%m-31', d)`", "`date(d, 'end of month')`"],
          answer: 1,
          explain: "Go to the 1st, jump a month, step back a day. `'%Y-%m-31'` would invent dates like April 31, and SQLite has no 'end of month' modifier.",
        },
        { kind: 'recall', prompt: 'How do you (a) bucket a date into its month and (b) get the number of days between two dates in SQLite?', answer: "(a) `strftime('%Y-%m', d)` or `date(d, 'start of month')`. (b) `julianday(later) - julianday(earlier)`." },
        { kind: 'explain', id: 'sql05-l3-e1', prompt: "Explain why `'2024-03-01' - '2024-01-01'` gives 0 in SQLite, and what you should write instead." },
      ],
      cards: [
        { id: 'sql05-l3-k1', kind: 'cloze', text: 'Month bucket in SQLite: `strftime({{}}, txn_date)`', answers: ["'%Y-%m'"] },
        { id: 'sql05-l3-k2', kind: 'concept', front: 'How do you get the days between two dates in SQLite?', back: '`julianday(later) - julianday(earlier)` (CAST to INTEGER for whole days).' },
        { id: 'sql05-l3-k3', kind: 'concept', front: "What does `'2024-03-01' - '2024-01-01'` return in SQLite, and why?", back: '0 — text is converted to numbers by its leading digits (2024 − 2024).' },
        { id: 'sql05-l3-k4', kind: 'cloze', text: "One week later: `date(txn_date, {{}})`", answers: ["'+7 day'"] },
        { id: 'sql05-l3-k5', kind: 'sql', prompt: "Count transactions per month (`month` as 'YYYY-MM'), ordered by month.", dataset: 'bank', solution: "SELECT strftime('%Y-%m', txn_date) AS month, COUNT(*) AS txns FROM transactions GROUP BY month ORDER BY month;", ordered: true },
      ],
    },
  ],
};
