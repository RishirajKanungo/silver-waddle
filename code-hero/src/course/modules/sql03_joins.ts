import type { Module } from '../types';

export const module: Module = {
  id: 'sql03',
  track: 'sql',
  order: 3,
  title: 'JOINs, visually',
  icon: '🔗',
  level: 'Core',
  blurb: 'See every join type as animated row-matching and Venn diagrams, then use them for real: anti-joins, self joins, multi-table chains and the fan-out trap.',
  boss: ['sql-gym-manager-span', 'sql-gym-content-engagement', 'sql-gym-customer-ltv'],
  lessons: [
    // ------------------------------------------------------------------ L1
    {
      id: 'sql03-l1',
      track: 'sql',
      title: 'Join diagrams: INNER, LEFT, RIGHT, FULL, CROSS',
      summary: 'Watch rows find their partners on tiny tables, connect each join type to its Venn picture, and learn exactly which rows survive.',
      minutes: 16,
      faang: 'Every SQL interview contains at least one join, and "which rows does this return?" is the fastest way for an interviewer to check you are not guessing. Knowing what happens to unmatched rows and NULL keys is expected in Meta/Amazon-style screens.',
      tags: ['INNER JOIN', 'LEFT JOIN', 'FULL OUTER JOIN', 'CROSS JOIN', 'Venn'],
      dataset: 'toy',
      cells: [
        {
          kind: 'viz',
          viz: { type: 'join', left: 'students', right: 'clubs', leftKey: 'club_id', rightKey: 'id', join: 'inner' },
          caption: 'Two tiny tables. Each **student** has a `club_id`; each **club** has an `id`. Press play and watch every student look for the club whose `id` equals its `club_id`. Notice the misfits: **Dev** has no club (NULL), **Eli** points to club 40 which does not exist, and nobody is in **Drama**.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT s.name, c.club
FROM students s
JOIN clubs c ON s.club_id = c.id;`,
          predict: { question: 'An INNER JOIN keeps only rows that found a partner. How many rows?', options: ['3', '5', '6', '15'], answer: 0, fromOutput: true, explain: 'Ava, Ben and Cleo match. Dev (NULL), Eli (club 40) and the Drama club have no partner, so INNER JOIN drops them → **3** rows.' },
          note: '`s` and `c` are **aliases** (nicknames) for the tables. `ON` is the matching rule. Plain `JOIN` means `INNER JOIN`.',
        },
        {
          kind: 'viz',
          viz: { type: 'join', left: 'students', right: 'clubs', leftKey: 'club_id', rightKey: 'id', join: 'left' },
          caption: '**LEFT JOIN** keeps **every** row of the left table (the one written first). Students without a match still appear — their club columns are filled with **NULL**.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT s.name, c.club
FROM students s
LEFT JOIN clubs c ON s.club_id = c.id;`,
          predict: { question: 'How many rows now?', options: ['3', '4', '5', '6'], answer: 2, fromOutput: true, explain: 'All **5** students: the 3 matches plus Dev and Eli with `club = NULL`. Drama still does not appear — it is on the right side, and LEFT JOIN only protects the left.' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Two circles',
          text: 'Draw two overlapping circles: **left table** and **right table**. INNER = the lens in the middle. LEFT = the whole left circle. RIGHT = the whole right circle. FULL = both circles. **CROSS is not a Venn at all — it is a grid**: every left row × every right row. And "left" simply means "written first".',
        },
        {
          kind: 'viz',
          viz: { type: 'join', left: 'students', right: 'clubs', leftKey: 'club_id', rightKey: 'id', join: 'full' },
          caption: '**FULL OUTER JOIN** keeps unmatched rows from **both** sides. **RIGHT JOIN** is the mirror image of LEFT (keep every club) — use the switcher to compare all four.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT s.name, c.club
FROM students s
FULL OUTER JOIN clubs c ON s.club_id = c.id;`,
          predict: { question: 'How many rows does the FULL OUTER JOIN return?', options: ['3', '5', '6', '8'], answer: 2, fromOutput: true, explain: '3 matches + 2 lonely students (Dev, Eli) + 1 lonely club (Drama) = **6**.' },
          note: 'Experiment: change `FULL OUTER` to `RIGHT` and run again — you should get the 3 matches plus Drama with `name = NULL`.',
        },
        {
          kind: 'viz',
          viz: { type: 'join', left: 'shirts', right: 'sizes', leftKey: 'color', rightKey: 'size', join: 'cross' },
          caption: '**CROSS JOIN** has no matching rule: every shirt colour is paired with every size — a full grid. Useful for building "every combination" lists (every day × every product).',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT color, size
FROM shirts
CROSS JOIN sizes;`,
          predict: { question: '2 colours, 3 sizes. How many rows?', options: ['2', '3', '5', '6'], answer: 3, fromOutput: true, explain: '2 × 3 = **6**. A CROSS JOIN of two 1-million-row tables is a trillion rows — this is why a forgotten ON condition can melt a warehouse.' },
        },
        {
          kind: 'challenge',
          id: 'sql03-l1-c1',
          lang: 'sql',
          title: 'Everyone gets a badge',
          prompt: 'Print a name badge for **every** student: `name` and `club`, where students without a valid club show the text **`No club`**. Sort by name.',
          starter: "SELECT s.name, COALESCE(c.club, 'No club') AS club\nFROM students s\nJOIN clubs c ON s.club_id = c.id\nORDER BY s.name;",
          hints: ['Count the rows of the starter — who is missing?', 'Dev and Eli disappear because INNER JOIN drops unmatched rows. Which join keeps every left row?', 'Change `JOIN` to `LEFT JOIN`. COALESCE then turns their NULL club into `No club`.'],
          solution: "SELECT s.name, COALESCE(c.club, 'No club') AS club\nFROM students s\nLEFT JOIN clubs c ON s.club_id = c.id\nORDER BY s.name;",
          explain: 'LEFT JOIN guarantees one row per student; COALESCE replaces the NULL padding with a friendly label.',
          sql: { ordered: true },
        },
        {
          kind: 'challenge',
          id: 'sql03-l1-c2',
          lang: 'sql',
          title: 'Empty clubs',
          prompt: 'Return the `club` name of every club that has **no students**.',
          starter: 'SELECT c.club\nFROM clubs c\nLEFT JOIN students s ON s.club_id = c.id;',
          hints: ['The starter keeps every club. For empty clubs, what do the student columns contain?', 'They are NULL — keep only those rows with a WHERE.', '`WHERE s.id IS NULL`'],
          solution: 'SELECT c.club\nFROM clubs c\nLEFT JOIN students s ON s.club_id = c.id\nWHERE s.id IS NULL;',
          explain: 'This is the **anti-join**: LEFT JOIN, then keep the rows where the right side found nothing. Test a column that is never NULL for a real match (the primary key `s.id`).',
        },
        {
          kind: 'quiz',
          id: 'sql03-l1-q1',
          q: 'Dev\'s `club_id` is NULL. Suppose a club with `id = NULL` existed. Would Dev match it in an INNER JOIN?',
          options: ['Yes, NULL equals NULL', 'No — `NULL = NULL` is UNKNOWN, and ON keeps only TRUE', 'Only in a LEFT JOIN', 'It raises an error'],
          answer: 1,
          explain: 'ON behaves like WHERE: it keeps only TRUE. NULL keys never match anything — not even another NULL.',
        },
        { kind: 'recall', prompt: 'For each of INNER, LEFT, RIGHT, FULL and CROSS: which rows does it keep?', answer: 'INNER: only matches. LEFT: all left rows (+ matches). RIGHT: all right rows (+ matches). FULL: all rows from both sides. CROSS: every left row paired with every right row.' },
        { kind: 'explain', id: 'sql03-l1-e1', prompt: 'Using the two-circles picture, explain to a teammate the difference between INNER JOIN and LEFT JOIN.' },
      ],
      cards: [
        { id: 'sql03-l1-k1', kind: 'concept', front: 'LEFT JOIN: what fills the right-side columns when there is no match?', back: 'NULL.' },
        { id: 'sql03-l1-k2', kind: 'concept', front: 'Rows in a CROSS JOIN of 4 rows × 5 rows?', back: '20 — every left row paired with every right row.' },
        { id: 'sql03-l1-k3', kind: 'cloze', text: 'Anti-join: `FROM a LEFT JOIN b ON b.a_id = a.id WHERE b.id {{}}`', answers: ['IS NULL'] },
        { id: 'sql03-l1-k4', kind: 'sql', prompt: 'List every student `name` with their `club` (NULL if none).', dataset: 'toy', solution: 'SELECT s.name, c.club FROM students s LEFT JOIN clubs c ON s.club_id = c.id;' },
        { id: 'sql03-l1-k5', kind: 'concept', front: 'Do NULL keys ever match in a join?', back: 'No — NULL = NULL is UNKNOWN, so the row never matches.' },
      ],
    },
    // ------------------------------------------------------------------ L2
    {
      id: 'sql03-l2',
      track: 'sql',
      title: 'LEFT JOIN at work: zeros, anti-joins, ON vs WHERE',
      summary: 'Count per customer without losing the zeros, find customers who never ordered, and learn where to put a filter so a LEFT JOIN stays LEFT.',
      minutes: 16,
      faang: '"Include customers with zero orders" and "find users who never did X" are among the most common SQL screen prompts in Amazon/Meta-style loops. The ON-vs-WHERE trap is a favourite debugging question because the broken query still runs.',
      tags: ['LEFT JOIN', 'Anti-join', 'ON vs WHERE', 'COUNT with zeros', 'Gotcha'],
      dataset: 'shop',
      cells: [
        {
          kind: 'md',
          text: `Back to the **shop**. A classic request: *"How many orders has each customer placed — including people who have placed **none**?"*

Two customers (Farid and Ines) never ordered. Watch what happens to them:`,
        },
        {
          kind: 'viz',
          viz: { type: 'join', left: 'customers', right: 'orders', leftKey: 'id', rightKey: 'customer_id', join: 'left', show: ['id', 'name', 'customer_id', 'status'] },
          caption: 'Customers on the left, orders on the right. Most customers match **several** orders (one output row each). Farid and Ines match none — LEFT JOIN keeps them with NULL order columns.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT COUNT(*) AS joined_rows
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id;`,
          predict: { question: 'There are 24 orders, and an INNER JOIN returns 24 rows. How many rows does the LEFT JOIN return?', options: ['10', '24', '26', '34'], answer: 2, fromOutput: true, explain: '24 matched rows + 1 NULL-padded row for each of the 2 customers with no orders = **26**.' },
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT c.name, COUNT(*) AS orders
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
GROUP BY c.id, c.name
ORDER BY orders, c.name;`,
          predict: { question: 'Farid has **no** orders. What does this query show for him?', options: ['0', '1', 'NULL', 'He is missing'], answer: 1, explain: 'His NULL-padded row is still a row, and `COUNT(*)` counts rows → **1**. Change it to `COUNT(o.id)`: COUNT(column) skips NULLs, so Farid gets the correct **0**.' },
          note: 'We group by `c.id, c.name` — two customers could share a name, but never an id.',
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'After a LEFT JOIN, never COUNT(*)',
          text: 'Count a column from the **right** table, ideally its primary key: `COUNT(o.id)`. It is NULL exactly when there was no match, so the zeros come out as 0 instead of 1.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT c.name
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.id IS NULL;`,
          predict: { question: 'This is the **anti-join**: "customers with no matching order". How many rows?', options: ['0', '2', '8', '10'], answer: 1, fromOutput: true, explain: 'Only Farid and Ines have NULL-padded rows → **2**. `NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)` gives the same answer and is often what an interviewer expects you to mention as an alternative.' },
        },
        {
          kind: 'md',
          text: `**ON vs WHERE** — the trap that still runs.

For a LEFT JOIN, a condition on the **right** table means very different things depending on where you put it:
- in **ON**: "match only *returned* orders" — customers without one still survive, with NULLs.
- in **WHERE**: runs *after* the join and throws away every row whose status is not 'returned' — **including the NULL rows**. Your LEFT JOIN silently became an INNER JOIN.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT c.name, COUNT(o.id) AS returns
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'returned'
GROUP BY c.id, c.name;`,
          predict: { question: 'We wanted all 10 customers with their number of returns. How many rows do we get?', options: ['10', '3', '2', '0'], answer: 2, fromOutput: true, explain: 'Only Alice and Gina have returns. Everyone else\'s rows had `status` ≠ \'returned\' (or NULL) and WHERE removed them → **2** rows. Move the condition into ON to keep all 10.' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Two bouncers',
          text: '**ON is the bouncer at the join door** — it decides *who gets matched*. **WHERE is the bouncer at the exit** — it decides *who leaves the building at all*. With a LEFT JOIN, filters on the right table belong at the **door** (ON).',
        },
        {
          kind: 'challenge',
          id: 'sql03-l2-c1',
          lang: 'sql',
          title: 'Returns per customer — all of them',
          prompt: 'Return **every** customer\'s `name` and `returns` (number of their orders with status `returned`, 0 if none), sorted by name.',
          starter: "SELECT c.name, COUNT(o.id) AS returns\nFROM customers c\nLEFT JOIN orders o ON o.customer_id = c.id\nWHERE o.status = 'returned'\nGROUP BY c.id, c.name\nORDER BY c.name;",
          hints: ['The starter returns only 2 rows. Which clause is deleting the NULL-padded customers?', "The status test is in WHERE. Move it into the join condition with AND.", "`LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'returned'`"],
          solution: "SELECT c.name, COUNT(o.id) AS returns\nFROM customers c\nLEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'returned'\nGROUP BY c.id, c.name\nORDER BY c.name;",
          explain: 'In ON, the filter only decides which orders are allowed to match. Customers with no returned orders keep a NULL row, and `COUNT(o.id)` turns that into 0.',
          sql: { ordered: true },
        },
        {
          kind: 'challenge',
          id: 'sql03-l2-c2',
          lang: 'sql',
          title: 'Never returned anything',
          prompt: 'Marketing wants to thank customers who have **never returned an order** (customers with no orders at all count too). Return their `name`, sorted by name. The starter returns 0 rows — fix it.',
          starter: "SELECT c.name\nFROM customers c\nLEFT JOIN orders o ON o.customer_id = c.id\nWHERE o.status = 'returned' AND o.id IS NULL\nORDER BY c.name;",
          hints: ['Can a row have `status = \'returned\'` AND `o.id IS NULL` at the same time? No — so 0 rows.', 'Match only *returned* orders in ON, then keep the customers who found **no** returned order.', "`LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'returned' WHERE o.id IS NULL`"],
          solution: "SELECT c.name\nFROM customers c\nLEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'returned'\nWHERE o.id IS NULL\nORDER BY c.name;",
          explain: 'A **filtered anti-join**: the ON condition defines "a matching order" (a returned one), the WHERE keeps customers with none. 8 of 10 customers qualify — everyone except Alice and Gina.',
          sql: { ordered: true },
        },
        {
          kind: 'quiz',
          id: 'sql03-l2-q1',
          q: "`FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.status = 'shipped'` — what is this, effectively?",
          options: ['A LEFT JOIN that keeps all customers', 'An INNER JOIN restricted to shipped orders', 'A CROSS JOIN', 'An anti-join'],
          answer: 1,
          explain: 'WHERE removes the NULL-padded rows (NULL = \'shipped\' is UNKNOWN), so only customers with a shipped order remain — exactly what an INNER JOIN would return.',
        },
        { kind: 'recall', prompt: 'Write the anti-join pattern for "customers who never placed an order".', answer: '`SELECT c.name FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.id IS NULL;` (or `WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)`).' },
        { kind: 'explain', id: 'sql03-l2-e1', prompt: 'A colleague\'s "orders per customer" report is missing the customers with zero orders. List the two most likely bugs and how to fix each.' },
      ],
      cards: [
        { id: 'sql03-l2-k1', kind: 'concept', front: 'After a LEFT JOIN, why `COUNT(o.id)` instead of `COUNT(*)`?', back: 'COUNT(*) counts the NULL-padded row as 1; COUNT(o.id) skips it and gives 0.' },
        { id: 'sql03-l2-k2', kind: 'concept', front: 'LEFT JOIN + `WHERE right.col = x` does what?', back: 'Drops the NULL-padded rows → behaves like an INNER JOIN. Put the filter in ON instead.' },
        { id: 'sql03-l2-k3', kind: 'cloze', text: "Keep all customers, match only cancelled orders: `LEFT JOIN orders o ON o.customer_id = c.id {{}} o.status = 'cancelled'`", answers: ['AND'] },
        { id: 'sql03-l2-k4', kind: 'sql', prompt: 'Names of customers who have never placed an order.', dataset: 'shop', solution: 'SELECT c.name FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.id IS NULL;' },
      ],
    },
    // ------------------------------------------------------------------ L3
    {
      id: 'sql03-l3',
      track: 'sql',
      title: 'Self joins & outer joins at work',
      summary: 'Join a table to itself to pair employees with managers, and use LEFT/FULL joins to find orphans on both sides of a relationship.',
      minutes: 15,
      faang: '"Employees who earn more than their manager" and "managers with N direct reports" are textbook self-join questions in Amazon/Meta-style screens. FULL OUTER JOIN reconciliation ("rows in system A but not B") is everyday work for data engineers — and for bank analysts matching ledgers.',
      tags: ['Self join', 'FULL OUTER JOIN', 'Hierarchy', 'Reconciliation', 'NULL'],
      dataset: 'hr',
      cells: [
        {
          kind: 'md',
          text: `In **hr**, \`employees.manager_id\` points to **another row of the same table**. To print "employee → manager" we need the table twice: once as the employee, once as the manager.

That is a **self join**: same table, two aliases — \`e\` (employee) and \`m\` (manager) — joined on \`e.manager_id = m.id\`.`,
        },
        {
          kind: 'viz',
          viz: { type: 'join', left: 'employees', right: 'employees', leftKey: 'manager_id', rightKey: 'id', join: 'inner', show: ['id', 'name', 'manager_id', 'title'] },
          caption: 'The left copy is "employees", the right copy is "managers". Each employee looks up the row whose `id` equals their `manager_id`. Priya and Carlos have no manager (NULL) — they are the tops of the tree.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT e.name AS employee, m.name AS manager
FROM employees e
JOIN employees m ON e.manager_id = m.id;`,
          predict: { question: 'There are 18 employees, 2 of them without a manager. How many rows?', options: ['2', '16', '18', '324'], answer: 1, fromOutput: true, explain: 'INNER JOIN drops the two top bosses (their manager_id is NULL) → **16**. Use LEFT JOIN to keep them with `manager = NULL`.' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Two hats',
          text: 'The same table wears **two hats**: `e` is the *employee hat*, `m` is the *manager hat*. Read `e.manager_id = m.id` aloud as **"the employee\'s manager-id is the manager\'s id"**. If you swap the sides you get each person\'s *reports* instead.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT m.name AS manager, COUNT(*) AS reports
FROM employees e
JOIN employees m ON e.manager_id = m.id
GROUP BY m.id, m.name
ORDER BY reports DESC, m.name;`,
          predict: { question: 'Self join + GROUP BY = "direct reports per manager". How many managers are there?', options: ['2', '7', '16', '18'], answer: 1, fromOutput: true, explain: 'Seven different people appear as someone\'s manager → **7** rows. Carlos and Priya tie at 4 reports; the `m.name` tie-breaker puts Carlos first.' },
        },
        {
          kind: 'viz',
          viz: { type: 'join', left: 'employees', right: 'departments', leftKey: 'dept_id', rightKey: 'id', join: 'full', show: ['id', 'name', 'dept_id', 'location'] },
          caption: 'Orphans on **both** sides: contractor **Victor** has no department (NULL `dept_id`), and the **Legal** department has no employees. INNER loses both, LEFT keeps Victor, RIGHT keeps Legal, **FULL keeps both**.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT e.name AS employee, d.name AS department
FROM employees e
FULL OUTER JOIN departments d ON e.dept_id = d.id
WHERE e.id IS NULL OR d.id IS NULL;`,
          predict: { question: 'This keeps only the rows that did **not** match on one side or the other. How many?', options: ['0', '1', '2', '19'], answer: 2, fromOutput: true, explain: 'Victor (no department) and Legal (no employees) → **2**. This "FULL JOIN, keep the NULL sides" pattern finds every mismatch between two lists.' },
        },
        {
          kind: 'callout',
          tone: 'interview',
          title: 'Reconciliation is a FULL OUTER JOIN',
          text: '"Which transactions are in our ledger but not the processor\'s file, and vice versa?" → `FULL OUTER JOIN … WHERE a.id IS NULL OR b.id IS NULL`. MySQL has no FULL JOIN: say you would emulate it with a LEFT JOIN `UNION` a RIGHT-side anti-join. Mentioning that unprompted is a strong signal.',
        },
        {
          kind: 'challenge',
          id: 'sql03-l3-c1',
          lang: 'sql',
          title: 'The full org chart',
          prompt: 'Return **all 18** employees with three columns: `employee` (name), `manager` (manager\'s name, NULL if none) and `department` (department name, NULL if none).',
          starter: 'SELECT e.name AS employee, m.name AS manager, d.name AS department\nFROM employees e\nJOIN employees m ON e.manager_id = m.id\nJOIN departments d ON d.id = e.dept_id;',
          hints: ['The starter returns 15 rows. Who is missing and why?', 'The two top bosses have no manager; Victor has no department. INNER JOIN drops each of them.', 'Make **both** joins LEFT JOINs — a chain of LEFT JOINs keeps every employee.'],
          solution: 'SELECT e.name AS employee, m.name AS manager, d.name AS department\nFROM employees e\nLEFT JOIN employees m ON e.manager_id = m.id\nLEFT JOIN departments d ON d.id = e.dept_id;',
          explain: 'When the first table is the one you must preserve, every following join should be LEFT. A single INNER JOIN anywhere in the chain can silently drop rows.',
          sql: { columns: ['employee', 'manager', 'department'] },
        },
        {
          kind: 'challenge',
          id: 'sql03-l3-c2',
          lang: 'sql',
          title: 'Managed across departments',
          prompt: 'List `employee` and `manager` names for every employee whose department is **different** from their manager\'s department. An employee with **no department** (NULL) counts as different.',
          starter: 'SELECT e.name AS employee, m.name AS manager\nFROM employees e\nJOIN employees m ON e.manager_id = m.id\nWHERE e.dept_id <> m.dept_id;',
          hints: ['The starter finds Nadia and Ben, but misses one person. Who has a NULL dept_id?', '`NULL <> 1` is UNKNOWN, so WHERE drops Victor. Add an explicit NULL check.', '`WHERE e.dept_id <> m.dept_id OR e.dept_id IS NULL`'],
          solution: 'SELECT e.name AS employee, m.name AS manager\nFROM employees e\nJOIN employees m ON e.manager_id = m.id\nWHERE e.dept_id <> m.dept_id OR e.dept_id IS NULL;',
          explain: 'Self joins let you compare a row with a *related* row of the same table. Postgres and modern SQLite also offer `e.dept_id IS DISTINCT FROM m.dept_id`, a NULL-safe "not equal".',
        },
        {
          kind: 'quiz',
          id: 'sql03-l3-q1',
          q: 'In `employees e LEFT JOIN employees m ON e.manager_id = m.id`, what is `m.name` on Priya\'s row (she has no manager)?',
          options: ['Priya Shah', 'NULL', 'An empty string', 'Her row is dropped'],
          answer: 1,
          explain: 'LEFT JOIN keeps Priya; no manager matched, so every `m.` column is NULL.',
        },
        { kind: 'recall', prompt: 'What two things make a self join work?', answer: 'Two different aliases for the same table (e.g. e and m), and an ON condition linking a column of one copy to the key of the other (e.manager_id = m.id).' },
        { kind: 'explain', id: 'sql03-l3-e1', prompt: 'Explain how you would find accounts that exist in one system but not another, and why a FULL OUTER JOIN fits.' },
      ],
      cards: [
        { id: 'sql03-l3-k1', kind: 'concept', front: 'What is a self join?', back: 'Joining a table to itself under two aliases, e.g. employees e JOIN employees m ON e.manager_id = m.id.' },
        { id: 'sql03-l3-k2', kind: 'cloze', text: 'Employee with manager name: `FROM employees e JOIN employees m ON e.{{}} = m.{{}}`', answers: ['manager_id', 'id'] },
        { id: 'sql03-l3-k3', kind: 'concept', front: 'Pattern to find mismatches between two tables?', back: 'FULL OUTER JOIN … WHERE a.key IS NULL OR b.key IS NULL.' },
        { id: 'sql03-l3-k4', kind: 'sql', prompt: 'Department names that have no employees.', dataset: 'hr', solution: 'SELECT d.name FROM departments d LEFT JOIN employees e ON e.dept_id = d.id WHERE e.id IS NULL;' },
        { id: 'sql03-l3-k5', kind: 'sql', prompt: 'Each manager\'s name and their number of direct reports (`reports`).', dataset: 'hr', solution: 'SELECT m.name, COUNT(*) AS reports FROM employees e JOIN employees m ON e.manager_id = m.id GROUP BY m.id, m.name;' },
      ],
    },
    // ------------------------------------------------------------------ L4
    {
      id: 'sql03-l4',
      track: 'sql',
      title: 'Multi-table joins & the fan-out trap',
      summary: 'Chain orders → order_items → products, track what one row means after each join, and stop SUM and COUNT from double-counting.',
      minutes: 18,
      faang: 'Real interview schemas need 3-4 joins, and the most common wrong answer is a correct-looking number that is inflated by fan-out. Interviewers at Amazon/Meta-style loops often ask "what is the grain of this result?" — being able to say it out loud is a senior signal.',
      tags: ['Multi-table join', 'Fan-out', 'Grain', 'COUNT DISTINCT', 'Pre-aggregation'],
      dataset: 'shop',
      cells: [
        { kind: 'viz', viz: { type: 'schema' }, caption: 'Follow the arrows: **customers** ← **orders** ← **order_items** → **products**. A revenue-by-category question has to walk the path order_items → products; a revenue-by-customer question walks order_items → orders → customers.' },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT o.id AS order_id, p.name AS product, oi.quantity, oi.unit_price
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
JOIN products p ON p.id = oi.product_id
WHERE o.customer_id = 4
ORDER BY o.id;`,
          predict: { question: 'Customer 4 (Dan) placed **5** orders. How many rows does this return?', options: ['5', '12', '24', '49'], answer: 1, fromOutput: true, explain: 'One row per **line item**, not per order: Dan\'s 5 orders contain **12** lines. Joining to a "many" table changes what one row means.' },
          note: 'Each JOIN adds columns. Chain them in the order the arrows go, and give every table a short alias.',
        },
        {
          kind: 'md',
          text: `Ask after every join: **"what does one row represent now?"** — the **grain**.

- \`orders\` alone: one row = one order.
- \`orders JOIN order_items\`: one row = one **line item**. Every order is now **copied** once per line.

Columns from the "one" side (the order's id, date, status) are repeated. If you COUNT or SUM them, you count the copies. That is **fan-out**.`,
        },
        {
          kind: 'viz',
          viz: { type: 'join', left: 'orders', right: 'order_items', leftKey: 'id', rightKey: 'order_id', join: 'inner', show: ['id', 'customer_id', 'status', 'order_id', 'product_id', 'quantity'] },
          caption: 'Watch a single order on the left light up **several** rows on the right. Each pairing is a separate output row — the order has been photocopied.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT ROUND(SUM(p.price), 2) AS home_list_price
FROM products p
JOIN order_items oi ON oi.product_id = p.id
WHERE p.category = 'Home';`,
          predict: { question: 'The three Home products cost 34 + 189 + 499 = **722**. What does this query return?', options: ['722', '2302', '3727', '34'], answer: 1, fromOutput: true, explain: '**2302**. Each product\'s price is added once **per order line** that contains it (the Office Chair alone appears in 8 lines). The join was only meant to filter "ordered products" — it multiplied them instead.' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'The photocopier',
          text: 'Joining a "one" row to a "many" table **photocopies** the one row once per match. COUNT and SUM cannot tell copies from originals. Before aggregating, ask: **"Did I photocopy the thing I am counting?"**',
        },
        {
          kind: 'md',
          text: `Three fixes, from quickest to most robust:
1. **Counting?** Use \`COUNT(DISTINCT o.id)\` — copies of the same order collapse back to one.
2. **Summing?** **Aggregate first, then join**: compute one total per order in a subquery, so the join is one-to-one.
3. **Only filtering?** Don't join at all — use \`WHERE id IN (SELECT …)\` or \`EXISTS\`, which never duplicates rows.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT c.name, COUNT(o.id) AS orders, ROUND(SUM(t.order_total), 2) AS revenue
FROM customers c
JOIN orders o ON o.customer_id = c.id
JOIN (SELECT order_id, SUM(quantity * unit_price) AS order_total
      FROM order_items
      GROUP BY order_id) t ON t.order_id = o.id
GROUP BY c.id, c.name
ORDER BY revenue DESC;`,
          predict: { question: 'The subquery `t` has exactly one row per order. How many rows does the whole query return?', options: ['8', '10', '24', '49'], answer: 0, fromOutput: true, explain: 'One per customer who has ordered → **8**. Because `t` is one row per order, `COUNT(o.id)` and `SUM(t.order_total)` are both correct — no DISTINCT needed.' },
          note: 'A subquery in FROM is a temporary table. You will meet the cleaner `WITH` (CTE) syntax for this in a later module.',
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'SUM(DISTINCT …) is not a fix',
          text: '`COUNT(DISTINCT o.id)` repairs counts, but `SUM(DISTINCT p.price)` does **not** repair sums: two different products that happen to cost the same would be added only once. For sums, pre-aggregate.',
        },
        {
          kind: 'challenge',
          id: 'sql03-l4-c1',
          lang: 'sql',
          title: 'Revenue by category',
          prompt: 'Return each product `category` with its `revenue` (quantity × unit_price over all order lines, rounded to 2 decimals), highest first.',
          starter: 'SELECT p.category, ROUND(SUM(p.price), 2) AS revenue\nFROM products p\nJOIN order_items oi ON oi.product_id = p.id\nGROUP BY p.category\nORDER BY revenue DESC;',
          hints: ['The join is fine — the grain is one row per order line. Look at *what* is summed.', '`p.price` is the list price and ignores quantity. Revenue lives on the line item.', '`SUM(oi.quantity * oi.unit_price)`'],
          solution: 'SELECT p.category, ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue\nFROM order_items oi\nJOIN products p ON p.id = oi.product_id\nGROUP BY p.category\nORDER BY revenue DESC;',
          explain: 'Here the line-item grain is exactly what we want: each line contributes its own value once. Start the FROM from the table whose grain matches the measure (order_items), then join the descriptive table (products) for the label.',
          sql: { ordered: true },
        },
        {
          kind: 'challenge',
          id: 'sql03-l4-c2',
          lang: 'sql',
          title: 'Orders and units per customer',
          prompt: 'For each customer who has ordered, return `name`, `orders` (number of **orders**) and `units` (total quantity of items bought), sorted by name. The starter double-counts orders.',
          starter: 'SELECT c.name, COUNT(*) AS orders, SUM(oi.quantity) AS units\nFROM customers c\nJOIN orders o ON o.customer_id = c.id\nJOIN order_items oi ON oi.order_id = o.id\nGROUP BY c.id, c.name\nORDER BY c.name;',
          hints: ['Dan shows 12 orders but placed 5. What is one row after joining order_items?', 'Each order appears once per line item. Count each order only once.', '`COUNT(DISTINCT o.id) AS orders` — `SUM(oi.quantity)` is already correct at line grain.'],
          solution: 'SELECT c.name, COUNT(DISTINCT o.id) AS orders, SUM(oi.quantity) AS units\nFROM customers c\nJOIN orders o ON o.customer_id = c.id\nJOIN order_items oi ON oi.order_id = o.id\nGROUP BY c.id, c.name\nORDER BY c.name;',
          explain: 'Two measures, two grains: `units` belongs to the line-item grain (sum every line), `orders` belongs to the order grain (count distinct order ids).',
          sql: { ordered: true },
        },
        {
          kind: 'quiz',
          id: 'sql03-l4-q1',
          q: 'You join `orders` (one row per order) to `order_items` (several rows per order). What is the grain of the result?',
          options: ['One row per order', 'One row per order line item', 'One row per product', 'One row per customer'],
          answer: 1,
          explain: 'The result takes the grain of the "many" side: one row per (order, line). Order-level columns are repeated on every line.',
        },
        { kind: 'recall', prompt: 'Name three ways to avoid double-counting after a one-to-many join.', answer: '1) COUNT(DISTINCT key) for counts; 2) aggregate the many side first in a subquery/CTE, then join one-to-one; 3) filter with IN / EXISTS instead of joining.' },
        { kind: 'explain', id: 'sql03-l4-e1', prompt: 'Your "revenue per customer" dashboard suddenly doubled after someone joined a `shipments` table. Explain what probably happened and how you would prove it.' },
      ],
      cards: [
        { id: 'sql03-l4-k1', kind: 'concept', front: 'What is join fan-out?', back: 'A one-to-many join repeats each "one" row per match, inflating COUNT/SUM of its columns.' },
        { id: 'sql03-l4-k2', kind: 'cloze', text: 'Count orders after joining order_items: `COUNT({{}} o.id)`', answers: ['DISTINCT'] },
        { id: 'sql03-l4-k3', kind: 'concept', front: 'Safest fix for SUM after a one-to-many join?', back: 'Aggregate the many side first (subquery/CTE), then join one-to-one.' },
        { id: 'sql03-l4-k4', kind: 'sql', prompt: 'Revenue (quantity × unit_price) per product name, highest first.', dataset: 'shop', solution: 'SELECT p.name, SUM(oi.quantity * oi.unit_price) AS revenue FROM order_items oi JOIN products p ON p.id = oi.product_id GROUP BY p.id, p.name ORDER BY revenue DESC;', ordered: true },
        { id: 'sql03-l4-k5', kind: 'concept', front: 'How do you report every city × category, even with zero sales?', back: 'CROSS JOIN the two dimension lists to build the grid, then LEFT JOIN the facts and COALESCE(SUM(...), 0).' },
      ],
    },
  ],
};
