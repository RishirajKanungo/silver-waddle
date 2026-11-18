import type { Module } from '../types';

export const module: Module = {
  id: 'sql01',
  track: 'sql',
  order: 1,
  title: 'SELECT & WHERE',
  icon: '🔎',
  level: 'Foundations',
  blurb: 'Read any table, pick columns, sort, and filter — including the NULL traps interviewers love.',
  boss: ['sql-gym-active-products', 'sql-gym-null-referrals'],
  lessons: [
    {
      id: 'sql01-l1',
      track: 'sql',
      title: 'Your first queries',
      summary: 'SELECT, FROM, aliases, ORDER BY and LIMIT on a real e-commerce schema.',
      minutes: 12,
      faang: 'Every data/analytics loop at Meta, Amazon and Google opens with a "warm-up" query like these. They watch for clean column choice, aliases and correct sorting — sloppy basics cost you the round before the hard part starts.',
      tags: ['SELECT', 'ORDER BY', 'LIMIT', 'Warm-up round'],
      dataset: 'shop',
      cells: [
        {
          kind: 'md',
          text: `A database is a set of **tables**. A table is like a spreadsheet with strict rules: every row has the same **columns**, and each column holds one type of value.

A query is a *question* you ask the database. The smallest possible question is: **"show me everything in this table"**.`,
        },
        { kind: 'viz', viz: { type: 'schema' }, caption: 'The **shop** database you will use. Lines show which column points to which table (foreign keys). Click a table to peek at its rows.' },
        {
          kind: 'code',
          lang: 'sql',
          code: 'SELECT * FROM customers;',
          predict: { question: 'Before you run it: how many rows will come back? (Hint: look at the schema panel.)', options: ['1', '5', '10', '24'], answer: 2, fromOutput: true, explain: '`SELECT *` with no filter returns **every** row — the customers table has 10.' },
          note: '`*` means "all columns". Press [[Ctrl+Enter]] to run.',
        },
        {
          kind: 'md',
          text: `In real work you almost never want \`*\`. Production tables have 50+ columns and billions of rows — pulling everything is slow and expensive (cloud warehouses bill by bytes scanned).

Name the columns you need, in the order you want them, and give them friendly names with **AS**:`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT name AS customer, city
FROM customers
ORDER BY city, name;`,
          note: '`ORDER BY city, name` sorts by city first, then by name *within* each city. Ascending (A→Z, small→big) is the default.',
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook',
          text: 'You **write** `SELECT … FROM …` but the database **reads** FROM first: it has to find the table before it can pick columns. Keep this in mind — it explains half of SQL\'s weird rules later.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT name, price
FROM products
ORDER BY price DESC
LIMIT 3;`,
          predict: { question: 'What does this return?', options: ['The 3 cheapest products', 'The 3 most expensive products', '3 random products', 'An error: LIMIT needs a WHERE'], answer: 1, explain: '`DESC` flips the sort to largest-first, and `LIMIT 3` keeps the first three rows of that sorted list. "Top-N" questions are exactly this pattern.' },
        },
        {
          kind: 'challenge',
          id: 'sql01-l1-c1',
          lang: 'sql',
          title: 'Electronics price list',
          prompt: 'List every product in the **Electronics** category with its `name` and `price`, most expensive first.',
          starter: 'SELECT name, price\nFROM products\n',
          hints: ['You need a filter: `WHERE category = \'Electronics\'` (text values go in single quotes).', 'Sort with `ORDER BY price DESC`.'],
          solution: "SELECT name, price\nFROM products\nWHERE category = 'Electronics'\nORDER BY price DESC;",
          explain: 'Filter with WHERE, then sort with ORDER BY … DESC. Clause order matters: SELECT → FROM → WHERE → ORDER BY.',
          sql: { ordered: true },
        },
        {
          kind: 'quiz',
          id: 'sql01-l1-q1',
          q: 'Which query returns the **two newest** customers by `signup_date`?',
          options: ['`SELECT * FROM customers LIMIT 2`', '`SELECT * FROM customers ORDER BY signup_date LIMIT 2`', '`SELECT * FROM customers ORDER BY signup_date DESC LIMIT 2`', '`SELECT TOP 2 * FROM customers`'],
          answer: 2,
          explain: 'Newest = largest date = sort DESC, then LIMIT. Without ORDER BY, row order is **not guaranteed** — never rely on it. (`TOP` is SQL Server syntax, not SQLite/Postgres.)',
        },
        { kind: 'recall', prompt: 'Without scrolling up: in what order does the database *execute* SELECT, FROM and ORDER BY?', answer: 'FROM → SELECT → ORDER BY. It finds the table, computes the columns, then sorts the finished rows.' },
        { kind: 'explain', id: 'sql01-l1-e1', prompt: 'In one or two sentences, explain to a friend why `SELECT *` is a bad habit at a big tech company.' },
      ],
      cards: [
        { id: 'sql01-l1-k1', kind: 'concept', front: 'What does `ORDER BY price DESC, name` do?', back: 'Sorts by price largest-first; ties are broken by name A→Z.' },
        { id: 'sql01-l1-k2', kind: 'cloze', text: 'To get the 5 most expensive products: `SELECT name FROM products ORDER BY price {{}} LIMIT {{}}`', answers: ['DESC', '5'] },
        { id: 'sql01-l1-k3', kind: 'sql', prompt: 'Return the `name` and `city` of all customers, sorted by name.', dataset: 'shop', solution: 'SELECT name, city FROM customers ORDER BY name;', ordered: true },
        { id: 'sql01-l1-k4', kind: 'concept', front: 'Is row order guaranteed without ORDER BY?', back: 'No. Without ORDER BY the database may return rows in any order — always sort explicitly.' },
      ],
    },
    {
      id: 'sql01-l2',
      track: 'sql',
      title: 'Filtering with WHERE (and the NULL trap)',
      summary: 'AND/OR, IN, BETWEEN, LIKE, and why `= NULL` never matches.',
      minutes: 15,
      faang: 'NULL handling is the #1 "gotcha" interviewers use to separate memorized SQL from real understanding. Expect follow-ups like "what happens to rows where referred_by is NULL?"',
      tags: ['WHERE', 'NULL', 'IN', 'LIKE', 'Gotcha'],
      dataset: 'shop',
      cells: [
        {
          kind: 'md',
          text: `**WHERE** keeps only the rows where a condition is **TRUE**. Combine conditions with **AND** (both must be true) and **OR** (either).

Handy shortcuts:
- \`city IN ('Seattle', 'Austin')\` — same as two ORs
- \`price BETWEEN 20 AND 50\` — inclusive on both ends
- \`name LIKE 'A%'\` — \`%\` = any characters, \`_\` = exactly one`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT name, city, signup_date
FROM customers
WHERE city IN ('Seattle', 'Austin')
  AND signup_date < '2023-06-01';`,
          predict: { question: 'How many customers match?', options: ['3', '4', '5', '6'], answer: 1, fromOutput: true },
          note: 'Dates stored as ISO text (`YYYY-MM-DD`) sort correctly as strings — that is why `<` works here.',
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'AND binds tighter than OR',
          text: "`WHERE city = 'Seattle' OR city = 'Austin' AND signup_date < '2023-06-01'` means `Seattle OR (Austin AND early)` — probably not what you meant. **When mixing AND/OR, always use parentheses.**",
        },
        { kind: 'viz', viz: { type: 'nulls' }, caption: 'NULL means *unknown*. Any comparison with unknown is unknown — and WHERE only keeps **TRUE**.' },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT name, referred_by
FROM customers
WHERE referred_by = NULL;`,
          predict: { question: 'Four customers have no referrer (NULL). How many rows does this return?', options: ['0', '4', '6', '10'], answer: 0, fromOutput: true, explain: '`referred_by = NULL` is never TRUE (it is UNKNOWN), so **zero** rows match. Use `IS NULL`.' },
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT name
FROM customers
WHERE referred_by IS NULL;`,
        },
        {
          kind: 'challenge',
          id: 'sql01-l2-c1',
          lang: 'sql',
          title: 'Orders that need attention',
          prompt: 'Return the `id`, `customer_id` and `status` of every order whose status is **cancelled or returned**, ordered by `id`.',
          starter: "SELECT id, customer_id, status\nFROM orders\nWHERE status = 'cancelled'\nORDER BY id;",
          hints: ['Two acceptable values → use `IN (…, …)` or `OR`.', "`WHERE status IN ('cancelled', 'returned')`"],
          solution: "SELECT id, customer_id, status\nFROM orders\nWHERE status IN ('cancelled', 'returned')\nORDER BY id;",
          explain: '`IN` is cleaner than chained ORs and avoids AND/OR precedence mistakes.',
          sql: { ordered: true },
        },
        {
          kind: 'challenge',
          id: 'sql01-l2-c2',
          lang: 'sql',
          title: 'Organic signups',
          prompt: 'Find the `name` of customers who were **not** referred by anyone (no referrer), sorted by name.',
          starter: 'SELECT name\nFROM customers\nWHERE referred_by = NULL\nORDER BY name;',
          hints: ['`= NULL` never matches.', 'Use `IS NULL`.'],
          solution: 'SELECT name\nFROM customers\nWHERE referred_by IS NULL\nORDER BY name;',
          explain: 'Test for missing values with `IS NULL` / `IS NOT NULL`. This exact mistake appears in real interview debugging questions.',
          sql: { ordered: true },
        },
        {
          kind: 'quiz',
          id: 'sql01-l2-q1',
          q: '`WHERE referred_by <> 1` — does it return customers whose `referred_by` is NULL?',
          options: ['Yes, NULL is not equal to 1', 'No, NULL <> 1 is UNKNOWN so the row is dropped', 'Only in SQLite', 'It raises an error'],
          answer: 1,
          explain: 'Any comparison with NULL is UNKNOWN, and WHERE drops UNKNOWN. To include them: `WHERE referred_by <> 1 OR referred_by IS NULL`.',
        },
        { kind: 'recall', prompt: 'What are the three possible results of a comparison in SQL, and which ones does WHERE keep?', answer: 'TRUE, FALSE and UNKNOWN (from NULL). WHERE keeps only TRUE.' },
        { kind: 'explain', id: 'sql01-l2-e1', prompt: 'Explain why `WHERE x = NULL` returns nothing, as if teaching a new analyst.' },
      ],
      cards: [
        { id: 'sql01-l2-k1', kind: 'concept', front: 'How do you filter rows where `email` is missing?', back: '`WHERE email IS NULL` (never `= NULL`).' },
        { id: 'sql01-l2-k2', kind: 'concept', front: 'What does `x BETWEEN 5 AND 10` include?', back: 'Both ends: 5 ≤ x ≤ 10.' },
        { id: 'sql01-l2-k3', kind: 'cloze', text: "Names starting with 'A': `WHERE name {{}} 'A%'`", answers: ['LIKE'] },
        { id: 'sql01-l2-k4', kind: 'sql', prompt: "Products priced between 20 and 50 (inclusive): return name and price.", dataset: 'shop', solution: 'SELECT name, price FROM products WHERE price BETWEEN 20 AND 50;' },
      ],
    },
  ],
};
