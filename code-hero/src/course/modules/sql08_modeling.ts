import type { Module } from '../types';

export const module: Module = {
  id: 'sql08',
  track: 'sql',
  order: 8,
  title: 'Modeling, DML & Performance',
  icon: '🏗️',
  level: 'Advanced',
  blurb: 'Keys and normalization, changing data safely (INSERT/UPDATE/DELETE + transactions), indexes and query plans, and the data-quality checks every pipeline needs.',
  boss: ['sql-gym-dedupe-delete', 'sql-gym-low-water-balance', 'sql-gym-mom-spend'],
  lessons: [
    // ------------------------------------------------------------------ L1
    {
      id: 'sql08-l1',
      track: 'sql',
      title: 'Keys, relationships & normalization',
      summary: 'Primary and foreign keys, one-to-many vs many-to-many, normal forms, and the "grain" of a table — the root of most join fan-out bugs.',
      minutes: 15,
      faang: 'Data-engineering loops at Amazon, Meta and Airbnb include a "design the schema for X" round, and every SQL round punishes fan-out bugs. Being able to name the grain of a table and the keys that enforce it is what separates an analyst from a data engineer.',
      tags: ['Primary key', 'Foreign key', 'Normalization', 'Grain', 'Schema design'],
      dataset: 'shop',
      cells: [
        { kind: 'viz', viz: { type: 'schema' }, caption: 'The **shop** schema. Each line is a **foreign key**: `orders.customer_id → customers.id`, `order_items.order_id → orders.id`, `order_items.product_id → products.id`. Click a table to see its rows.' },
        {
          kind: 'md',
          text: `- A **primary key (PK)** identifies a row: unique and never NULL (\`customers.id\`).
- A **foreign key (FK)** is a column that must match a PK in another table (\`orders.customer_id\`).

The lines in the diagram are relationships:
- **one-to-many** — one customer, many orders (the FK lives on the "many" side)
- **many-to-many** — an order holds many products and a product appears in many orders, so a **bridge table** (\`order_items\`) sits between them.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: 'PRAGMA foreign_key_list(order_items);',
          predict: { question: 'SQLite can list a table\'s foreign keys. How many does `order_items` have?', options: ['0', '1', '2', '4'], answer: 2, fromOutput: true, explain: '**2** — one to `orders`, one to `products`. That is the signature of a bridge table: two FKs, one to each side of the many-to-many.' },
          note: 'Postgres equivalent: query `information_schema.table_constraints`. In interviews you just draw the boxes and arrows.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `INSERT INTO orders (id, customer_id, order_date, status)
VALUES (100, 99, '2024-07-01', 'delivered');`,
          error: true,
          predict: { question: 'There is no customer 99. What happens?', options: ['The order is inserted', 'Error: FOREIGN KEY constraint failed', 'customer_id is set to NULL', 'Customer 99 is created automatically'], answer: 1, explain: 'With FKs enforced, the database refuses an **orphan** row — an order pointing at nobody. That one rule prevents a whole class of silent join bugs.' },
        },
        {
          kind: 'callout',
          tone: 'why',
          title: 'Why keys matter in the real world',
          text: 'An orphan order would vanish from every `JOIN customers` report — revenue quietly disappears. Note: cloud warehouses (BigQuery, Snowflake, Redshift) usually let you *declare* PK/FK but **do not enforce** them, so data engineers run orphan and uniqueness checks themselves (lesson 3).',
        },
        {
          kind: 'md',
          text: `**Normalization** = store each fact **once**, so it can't disagree with itself.

- **1NF** — one value per cell (no \`"red,blue"\` lists), no repeating column groups.
- **2NF** — every non-key column depends on the **whole** key (in \`order_items\`, \`quantity\` depends on order *and* product).
- **3NF** — non-key columns depend on **nothing but** the key (the customer's city belongs in \`customers\`, not copied onto every order).

Break it and you get *update anomalies*: change a city in one place, the copies still say the old one.`,
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook',
          text: 'Every non-key column must depend on **"the key, the whole key, and nothing but the key — so help me Codd."** (Edgar Codd invented the relational model.) Key → 1NF, whole key → 2NF, nothing but the key → 3NF.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT o.id AS order_id, c.name, p.name AS product, oi.quantity
FROM orders o
JOIN customers c   ON c.id = o.customer_id
JOIN order_items oi ON oi.order_id = o.id
JOIN products p    ON p.id = oi.product_id;`,
          predict: { question: 'There are 24 orders and 49 order lines. How many rows does this 4-table join return?', options: ['24', '49', '10', '12'], answer: 1, fromOutput: true, explain: '**49**. The result has the **grain** of its most detailed table: one row per order line. Joining "down" a one-to-many multiplies rows — so `COUNT(*)` here counts lines, not orders.' },
          note: '**Grain** = what one row represents. Say it out loud before every aggregation: "one row per order line".',
        },
        {
          kind: 'callout',
          tone: 'interview',
          title: 'How to recognise it',
          text: '**"Design a schema for …"**, **"what tables would you create?"**, **"why is this count too high?"** List the entities → one table each with a PK → FKs on the many side → a bridge for many-to-many → state each table\'s grain. Bonus point: `order_items.unit_price` is *deliberate* denormalization — a snapshot of the price at purchase time, because `products.price` will change.',
        },
        {
          kind: 'challenge',
          id: 'sql08-l1-c1',
          lang: 'sql',
          title: 'Fix the broken review',
          prompt: 'The script creates a `reviews` table with an FK to products, an FK to customers and a CHECK that stars are 1–5. The third review is broken twice: Dan meant to review the **Tennis Racket** (find its real id) and to give **3** stars. Fix that INSERT so the whole script runs; keep the final SELECT.',
          starter: `CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  stars INTEGER CHECK (stars BETWEEN 1 AND 5)
);
INSERT INTO reviews VALUES (1, 1, 1, 5);   -- Alice: Laptop Pro
INSERT INTO reviews VALUES (2, 8, 3, 4);   -- Carla: headphones
INSERT INTO reviews VALUES (3, 99, 4, 6);  -- Dan: Tennis Racket (broken!)

SELECT r.id, c.name AS customer, p.name AS product, r.stars
FROM reviews r
JOIN customers c ON c.id = r.customer_id
JOIN products p ON p.id = r.product_id
ORDER BY r.id;`,
          hints: [
            'Run it and read the error: the CHECK constraint rejects 6 stars first. Change it to 3.',
            'Run again: now the FOREIGN KEY constraint fails — product 99 does not exist.',
            "Look the id up instead of guessing: `SELECT id FROM products WHERE name = 'Tennis Racket';` — or use that subquery directly inside the INSERT.",
          ],
          solution: `CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  stars INTEGER CHECK (stars BETWEEN 1 AND 5)
);
INSERT INTO reviews VALUES (1, 1, 1, 5);   -- Alice: Laptop Pro
INSERT INTO reviews VALUES (2, 8, 3, 4);   -- Carla: headphones
INSERT INTO reviews VALUES (3, (SELECT id FROM products WHERE name = 'Tennis Racket'), 4, 3);

SELECT r.id, c.name AS customer, p.name AS product, r.stars
FROM reviews r
JOIN customers c ON c.id = r.customer_id
JOIN products p ON p.id = r.product_id
ORDER BY r.id;`,
          explain: 'Constraints turn silent bad data into loud errors at write time — the cheapest moment to catch them. `reviews` is itself a bridge between customers and products, with its own PK.',
          sql: { ordered: true },
        },
        {
          kind: 'challenge',
          id: 'sql08-l1-c2',
          lang: 'sql',
          title: 'Orders and units per customer (mind the grain)',
          prompt: 'For each customer who has ordered, return `name`, `orders` (number of **orders**) and `units` (total quantity across all their order lines). Order by `name`.',
          starter: `SELECT c.name, COUNT(*) AS orders, SUM(oi.quantity) AS units
FROM customers c
JOIN orders o ON o.customer_id = c.id
JOIN order_items oi ON oi.order_id = o.id
GROUP BY c.id, c.name
ORDER BY c.name;`,
          hints: [
            'After joining `order_items`, the grain is one row per **order line** — COUNT(*) counts lines, not orders.',
            'Count each order once: `COUNT(DISTINCT o.id)`. SUM(quantity) is already correct at line grain.',
          ],
          solution: `SELECT c.name, COUNT(DISTINCT o.id) AS orders, SUM(oi.quantity) AS units
FROM customers c
JOIN orders o ON o.customer_id = c.id
JOIN order_items oi ON oi.order_id = o.id
GROUP BY c.id, c.name
ORDER BY c.name;`,
          explain: 'Alice has 4 orders but 8 lines; the starter reported 8. Whenever a query mixes measures from different grains, count the coarse thing with DISTINCT or pre-aggregate each grain in its own CTE before joining.',
          sql: { ordered: true },
        },
        {
          kind: 'quiz',
          id: 'sql08-l1-q1',
          q: 'Which design breaks **first normal form**?',
          options: ["A `products.tags` column holding `'red,blue,green'`", 'Storing `customer_id` in `orders`', 'A separate `order_items` table', 'A composite primary key `(order_id, product_id)`'],
          answer: 0,
          explain: 'A comma-separated list packs several values into one cell — you can\'t index, join or count them cleanly. Move tags into their own table (`product_tags(product_id, tag)`).',
        },
        { kind: 'recall', prompt: 'What is a bridge table, and how many foreign keys does it usually have?', answer: 'A table that resolves a many-to-many relationship (e.g. order_items between orders and products). It usually has two FKs, one to each side, and its grain is one row per pairing.' },
        { kind: 'explain', id: 'sql08-l1-e1', prompt: 'Explain "grain" and how ignoring it makes COUNT(*) too high after a join.' },
      ],
      cards: [
        { id: 'sql08-l1-k1', kind: 'concept', front: 'Primary key vs foreign key?', back: 'PK: unique, non-NULL identity of a row in its own table. FK: a column whose value must exist as a PK in another table.' },
        { id: 'sql08-l1-k2', kind: 'cloze', text: 'Declare an FK inline: `customer_id INTEGER {{}} customers(id)`', answers: ['REFERENCES'] },
        { id: 'sql08-l1-k3', kind: 'concept', front: 'The 3NF mnemonic?', back: '"The key, the whole key, and nothing but the key" (1NF, 2NF, 3NF).' },
        { id: 'sql08-l1-k4', kind: 'concept', front: 'Why does `order_items` store `unit_price` when `products` has `price`?', back: 'Deliberate denormalization: it snapshots the price at purchase time, since the catalog price changes later.' },
        { id: 'sql08-l1-k5', kind: 'sql', prompt: 'shop: number of orders per customer_id, counted correctly after joining order_items.', dataset: 'shop', solution: 'SELECT o.customer_id, COUNT(DISTINCT o.id) AS orders FROM orders o JOIN order_items oi ON oi.order_id = o.id GROUP BY o.customer_id;' },
      ],
    },

    // ------------------------------------------------------------------ L2
    {
      id: 'sql08-l2',
      track: 'sql',
      title: 'Changing data safely: DML & transactions',
      summary: 'INSERT, UPDATE and DELETE with the "SELECT your WHERE first" habit, foreign keys as a safety net, and BEGIN/COMMIT/ROLLBACK for all-or-nothing changes.',
      minutes: 16,
      faang: 'Data-engineering screens increasingly include "write the backfill / fix the bad rows" tasks, and system-design follow-ups ask what happens if a job dies halfway. Atomic transfers are the textbook transaction example — and as a bank analyst you can explain *why* better than most candidates.',
      tags: ['INSERT', 'UPDATE', 'DELETE', 'Transactions', 'ACID', 'Backfills'],
      dataset: 'bank',
      cells: [
        {
          kind: 'md',
          text: `So far you have only *read* data. **DML** (data manipulation language) changes it:

\`\`\`sql
INSERT INTO t (cols) VALUES (…);
UPDATE t SET col = value WHERE …;
DELETE FROM t WHERE …;
\`\`\`

Every cell here starts from a **fresh copy** of the bank, so experiment freely. DML returns no rows, so finish each script with a **SELECT** that shows the effect.

**Danger:** an UPDATE or DELETE **without WHERE** hits **every row**.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `INSERT INTO transactions (account_id, txn_date, amount, kind)
VALUES (106, '2024-04-20', 250, 'deposit');

SELECT COUNT(*) FROM transactions;`,
          predict: { question: '`transactions` starts with 42 rows. What does the final SELECT return?', options: ['42', '43', '44', '1'], answer: 1, fromOutput: true, explain: '**43**. We skipped `id` and SQLite filled it in — an `INTEGER PRIMARY KEY` auto-assigns the next value.' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'The habit: SELECT your WHERE first',
          text: '**Measure twice, cut once.** 1) Write `SELECT * FROM t WHERE …` and look at exactly which rows match. 2) Check the count is what you expect. 3) Only then replace `SELECT *` with `UPDATE t SET …` or `DELETE`, keeping the **same WHERE** untouched.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `-- step 1: preview the rows the UPDATE will touch
SELECT id, account_id, amount, kind
FROM transactions
WHERE kind = 'card' AND amount < -1000;`,
          predict: { question: 'We want to flag card payments bigger than 1,000 for review. How many rows will the UPDATE touch?', options: ['0', '2', '3', '14'], answer: 1, fromOutput: true, explain: '**2** (ids 23 and 27). There is also a −1170 **wire** — the `kind = \'card\'` condition correctly leaves it alone. Now you know the UPDATE is safe.' },
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `-- step 2: same WHERE, now as an UPDATE
UPDATE transactions
SET kind = 'card_review'
WHERE kind = 'card' AND amount < -1000;

SELECT kind, COUNT(*) AS n FROM transactions GROUP BY kind ORDER BY kind;`,
          note: 'Two rows moved from `card` (14 → 12) to `card_review`. Many tools also support `UPDATE … RETURNING id` to list the changed rows.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: 'DELETE FROM accounts WHERE id = 101;',
          error: true,
          predict: { question: 'Account 101 has 7 transactions pointing at it. What happens?', options: ['The account and its transactions are deleted', 'Only the account is deleted', 'Error: FOREIGN KEY constraint failed', 'Nothing — 0 rows deleted'], answer: 2, explain: 'The FK on `transactions.account_id` refuses to leave 7 orphan transactions. (`ON DELETE CASCADE` would delete them too — rarely what a bank wants.) Account 107 has no transactions, so it *can* be deleted.' },
        },
        {
          kind: 'md',
          text: `A **transaction** groups statements so they succeed or fail **together**:

\`\`\`sql
BEGIN;
  … several INSERT / UPDATE / DELETE …
COMMIT;    -- make it all permanent
-- or ROLLBACK;  -- undo everything since BEGIN
\`\`\`

That is the **A** in **ACID**: *Atomic* (all or nothing), *Consistent* (constraints hold), *Isolated* (others don't see half-done work), *Durable* (committed = survives a crash).`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `BEGIN;
DELETE FROM transactions;   -- oops, no WHERE!
ROLLBACK;

SELECT COUNT(*) FROM transactions;`,
          predict: { question: 'Every transaction is deleted… then ROLLBACK. What is the final count?', options: ['0', '42', '43', 'Error'], answer: 1, fromOutput: true, explain: '**42** — ROLLBACK undid the DELETE as if it never happened. Starting risky changes with BEGIN gives you an undo button (until you COMMIT).' },
        },
        {
          kind: 'callout',
          tone: 'why',
          title: 'Why banks care',
          text: 'A transfer is **two** writes: debit one account, credit the other. If the process crashes between them, money either vanishes or is created out of thin air. Inside `BEGIN … COMMIT` either both rows land or neither does — the books always balance.',
        },
        {
          kind: 'challenge',
          id: 'sql08-l2-c1',
          lang: 'sql',
          title: 'An atomic transfer',
          prompt: 'Transfer **1,000** from account **104** to account **105** on `2024-04-30`, as two `transfer` rows inside one transaction (`BEGIN … COMMIT`). The starter is missing half of the transfer. Keep the final SELECT, which shows both balances.',
          starter: `BEGIN;
INSERT INTO transactions (account_id, txn_date, amount, kind)
VALUES (104, '2024-04-30', -1000, 'transfer');
-- the other half of the transfer is missing!
COMMIT;

SELECT account_id, SUM(amount) AS balance
FROM transactions
WHERE account_id IN (104, 105)
GROUP BY account_id
ORDER BY account_id;`,
          hints: [
            'Money left 104 but never arrived at 105 — the total across both accounts dropped by 1,000.',
            "Add a second INSERT before COMMIT: `VALUES (105, '2024-04-30', 1000, 'transfer')`.",
          ],
          solution: `BEGIN;
INSERT INTO transactions (account_id, txn_date, amount, kind)
VALUES (104, '2024-04-30', -1000, 'transfer');
INSERT INTO transactions (account_id, txn_date, amount, kind)
VALUES (105, '2024-04-30', 1000, 'transfer');
COMMIT;

SELECT account_id, SUM(amount) AS balance
FROM transactions
WHERE account_id IN (104, 105)
GROUP BY account_id
ORDER BY account_id;`,
          explain: '104 goes from 11,970 to 10,970 and 105 from 10,350 to 11,350 — the combined total is unchanged, which is the invariant a transfer must keep.',
          sql: { ordered: true, mustInclude: ['BEGIN', 'COMMIT'] },
        },
        {
          kind: 'challenge',
          id: 'sql08-l2-c2',
          lang: 'sql',
          title: 'Close the dormant accounts',
          prompt: 'Delete every account that has **no transactions at all**. Preview first, then DELETE. End with the SELECT in the starter.',
          starter: `-- step 1: SELECT the accounts you are about to delete
-- step 2: turn it into a DELETE with the same WHERE

SELECT id, customer FROM accounts ORDER BY id;`,
          hints: [
            'Preview: `SELECT * FROM accounts WHERE id NOT IN (SELECT account_id FROM transactions);` — how many rows?',
            'Same WHERE, new verb: `DELETE FROM accounts WHERE id NOT IN (SELECT account_id FROM transactions);`',
            '`NOT EXISTS (SELECT 1 FROM transactions t WHERE t.account_id = accounts.id)` is the NULL-safe alternative.',
          ],
          solution: `DELETE FROM accounts
WHERE NOT EXISTS (
  SELECT 1 FROM transactions t WHERE t.account_id = accounts.id
);

SELECT id, customer FROM accounts ORDER BY id;`,
          explain: 'Only Dormant Co (107) goes. Deleting by "has no children" also means the FK can never complain. `NOT IN` also works here because no `account_id` is NULL in this data — if one were, `NOT IN` would delete nothing.',
          sql: { ordered: true },
        },
        {
          kind: 'quiz',
          id: 'sql08-l2-q1',
          q: 'A job runs `BEGIN; UPDATE accounts SET branch = \'NYC\';` and the server crashes **before COMMIT**. After restart, what do you see?',
          options: ['Every branch is NYC', 'Some branches are NYC, some not', 'Nothing changed — the uncommitted update was rolled back', 'The table is corrupted'],
          answer: 2,
          explain: 'Atomicity + durability: only committed work survives. An uncommitted transaction is rolled back on recovery, so there is never a half-applied change.',
        },
        { kind: 'recall', prompt: 'What are the three steps of "SELECT your WHERE first"?', answer: '1) Run SELECT * with the exact WHERE you plan to use. 2) Check the rows/count are what you expect. 3) Swap SELECT * for UPDATE … SET / DELETE, keeping the WHERE identical (ideally inside BEGIN so you can ROLLBACK).' },
        { kind: 'explain', id: 'sql08-l2-e1', prompt: 'Explain to a non-technical colleague why a money transfer must run inside a transaction.' },
      ],
      cards: [
        { id: 'sql08-l2-k1', kind: 'cloze', text: 'Undo everything since `BEGIN` with `{{}}`; make it permanent with `{{}}`.', answers: ['ROLLBACK', 'COMMIT'] },
        { id: 'sql08-l2-k2', kind: 'concept', front: 'What does the A in ACID guarantee?', back: 'Atomicity: all statements in a transaction take effect, or none do.' },
        { id: 'sql08-l2-k3', kind: 'concept', front: 'The safe-DML habit?', back: 'SELECT your WHERE first: preview the exact rows, check the count, then swap SELECT * for UPDATE/DELETE with the same WHERE.' },
        { id: 'sql08-l2-k4', kind: 'sql', prompt: "bank: rename kind 'wire' to 'wire_transfer', then list the distinct kinds.", dataset: 'bank', solution: "UPDATE transactions SET kind = 'wire_transfer' WHERE kind = 'wire';\nSELECT DISTINCT kind FROM transactions;" },
        { id: 'sql08-l2-k5', kind: 'concept', front: 'What happens to `UPDATE t SET x = 0;` with no WHERE?', back: 'Every row in t is updated. Always write (and preview) the WHERE first.' },
      ],
    },

    // ------------------------------------------------------------------ L3
    {
      id: 'sql08-l3',
      track: 'sql',
      title: 'Indexes, query plans & data quality',
      summary: 'How a B-tree index turns a full SCAN into a SEARCH, reading EXPLAIN QUERY PLAN, composite-index column order, and the checks to run before trusting a table.',
      minutes: 16,
      faang: '"This query is slow — what would you do?" and "how would you validate this table?" are standard follow-ups in 2026-27 data-engineering loops at Meta, Netflix and Amazon. Mentioning query plans, index column order and concrete data-quality tests signals production experience.',
      tags: ['CREATE INDEX', 'EXPLAIN', 'Performance', 'Data quality', 'dbt tests'],
      dataset: 'streaming',
      cells: [
        { kind: 'viz', viz: { type: 'index' }, caption: 'Race a **full scan** (check every row) against a **B-tree index** (halve the search space at each level). Increase the row count and watch the gap explode: O(n) vs O(log n).' },
        {
          kind: 'md',
          text: `An **index** is a separate, **sorted** copy of one or more columns, with a pointer back to each row — like the index at the back of a book.

- Without one, \`WHERE show_id = 3\` must **SCAN** the whole table.
- With one, the database **SEARCH**es the sorted index and jumps straight to the matching rows.

\`EXPLAIN QUERY PLAN <query>\` shows which one SQLite chose (Postgres/MySQL: \`EXPLAIN\`).`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: 'EXPLAIN QUERY PLAN\nSELECT * FROM views WHERE show_id = 3;',
          predict: { question: '`views` has no index on `show_id`. What will the `detail` column say?', options: ['SCAN views', 'SEARCH views USING INDEX', 'SEARCH views USING INTEGER PRIMARY KEY', 'An error'], answer: 0, explain: '**SCAN views** — every row is read and tested. Fine for 45 rows; a disaster for 4.5 billion.' },
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `CREATE INDEX IF NOT EXISTS idx_views_show ON views(show_id);

EXPLAIN QUERY PLAN
SELECT * FROM views WHERE show_id = 3;`,
          predict: { question: 'Same query, after creating the index. What does the plan say now?', options: ['SCAN views', 'SEARCH views USING INDEX idx_views_show (show_id=?)', 'SCAN idx_views_show', 'Nothing changes until you restart'], answer: 1, explain: 'The planner now **SEARCH**es the index for `show_id=?` and fetches only the matching rows. Same result, far less work.' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook',
          text: '**SCAN** = reading the whole book to find every mention of "Paris". **SEARCH USING INDEX** = flipping to the index at the back, finding "Paris → p. 12, 87", and going straight there.',
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'When an index does not help',
          text: '- **A function wrapped around the column**: `WHERE strftime(\'%m\', view_date) = \'03\'` can\'t use an index on `view_date` — rewrite as a range: `view_date >= \'2024-03-01\' AND view_date < \'2024-04-01\'`.\n- **Leading wildcard**: `LIKE \'%x\'`.\n- **Composite index without its first column** (next challenge).\n\nAnd indexes aren\'t free: every INSERT/UPDATE must also update each index, and they take storage.',
        },
        {
          kind: 'challenge',
          id: 'sql08-l3-c1',
          lang: 'sql',
          title: 'Column order in a composite index',
          prompt: 'A dashboard runs `SELECT * FROM views WHERE user_id = 7 AND view_date >= \'2024-03-15\'`. The starter builds a two-column index, but the plan only uses it for `view_date`. Recreate **`idx_views_user_date`** (keep that exact name) with the columns in the order that lets the plan use **both** columns. Keep the final EXPLAIN.',
          starter: `CREATE INDEX idx_views_user_date ON views(view_date, user_id);

EXPLAIN QUERY PLAN
SELECT * FROM views WHERE user_id = 7 AND view_date >= '2024-03-15';`,
          hints: [
            'A composite index is sorted like a phone book: by the first column, then by the second *within* each first value.',
            'Put the **equality** column first and the **range** column last, so the planner can jump to user 7 and then walk a contiguous date range.',
            'Expect the plan to show `(user_id=? AND view_date>?)`.',
          ],
          solution: `CREATE INDEX idx_views_user_date ON views(user_id, view_date);

EXPLAIN QUERY PLAN
SELECT * FROM views WHERE user_id = 7 AND view_date >= '2024-03-15';`,
          explain: 'With `(user_id, view_date)` all of user 7\'s rows sit together, already sorted by date — one jump plus one short walk. With `(view_date, user_id)` user 7\'s rows are scattered across every date, so only the date range is usable. Rule of thumb: **equality columns first, range column last.**',
        },
        {
          kind: 'md',
          text: `**Data quality.** Before you trust a table (or ship a pipeline), run the same few checks:

- **Volume** — row count in the expected range?
- **Completeness** — NULLs in columns that must be filled?
- **Uniqueness** — duplicates on the natural key?
- **Referential integrity** — orphans? (\`views.user_id\` has **no** declared FK!)
- **Validity / business rules** — values that can't be true, e.g. a view *after* the subscription was cancelled.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT COUNT(*) AS total_rows,
       SUM(minutes IS NULL) AS null_minutes,
       COUNT(*) - (SELECT COUNT(*) FROM
         (SELECT DISTINCT user_id, show_id, view_date FROM views)) AS duplicate_rows,
       SUM(user_id NOT IN (SELECT user_id FROM subscriptions)) AS orphan_views
FROM views;`,
          predict: { question: 'A one-query "scorecard". What will `duplicate_rows` be?', options: ['0', '1', '11', '45'], answer: 1, explain: '45 rows but 44 distinct (user, show, day) events → **1** duplicate (the double-logged view from the patterns module). No NULL minutes and no orphans — but those zeros are worth *proving*, not assuming.' },
        },
        {
          kind: 'callout',
          tone: 'interview',
          title: 'How to recognise it',
          text: '**"How would you validate this table?"**, **"the dashboard number looks wrong"**, **"what tests would you add to this pipeline?"** Walk the list: volume, NULLs, uniqueness, orphans, business rules — and name the tooling: dbt tests (`unique`, `not_null`, `relationships`, `accepted_values`) or Great Expectations, run on every load.',
        },
        {
          kind: 'challenge',
          id: 'sql08-l3-c2',
          lang: 'sql',
          title: 'Views outside the subscription',
          prompt: 'A view is invalid if it happened **before** the user\'s subscription `started`, or **after** it was `cancelled`. Return the `id`, `user_id` and `view_date` of every invalid view, ordered by `id`.',
          starter: `SELECT v.id, v.user_id, v.view_date
FROM views v
JOIN subscriptions s ON s.user_id = v.user_id
WHERE v.view_date > s.cancelled
ORDER BY v.id;`,
          hints: [
            'The starter only catches post-cancellation views. Look at user 7: started 2024-03-09, but has views on 03-01 and 03-04.',
            'Add the second rule with OR: `v.view_date < s.started OR v.view_date > s.cancelled`.',
            'Parenthesise if you add more conditions — and remember `x > NULL` is never TRUE, so active subscribers are safely excluded from the second rule.',
          ],
          solution: `SELECT v.id, v.user_id, v.view_date
FROM views v
JOIN subscriptions s ON s.user_id = v.user_id
WHERE v.view_date < s.started
   OR v.view_date > s.cancelled
ORDER BY v.id;`,
          explain: '9 invalid views: 7 after cancellation (users 3 and 5) and 2 before the start (user 7). In a real pipeline this query becomes a test that fails the load — or a flag column analysts can filter on.',
          sql: { ordered: true },
        },
        {
          kind: 'quiz',
          id: 'sql08-l3-q1',
          q: 'There is an index on `view_date`. Which WHERE clause can use it?',
          options: ["`strftime('%Y-%m', view_date) = '2024-03'`", "`view_date >= '2024-03-01' AND view_date < '2024-04-01'`", "`date(view_date, '+1 day') > '2024-03-15'`", "`view_date || '' = '2024-03-15'`"],
          answer: 1,
          explain: 'Only the plain range compares the raw column, so the planner can SEARCH the sorted index. The others compute a new value per row first, which forces a SCAN.',
        },
        { kind: 'recall', prompt: 'Name the five data-quality checks from this lesson.', answer: 'Volume (row counts), completeness (NULLs), uniqueness (duplicates on the natural key), referential integrity (orphans), validity / business rules (impossible values).' },
        { kind: 'explain', id: 'sql08-l3-e1', prompt: 'Explain why an index on (user_id, view_date) helps `WHERE user_id = 7 AND view_date >= …` but an index on (view_date, user_id) helps less.' },
      ],
      cards: [
        { id: 'sql08-l3-k1', kind: 'concept', front: 'SCAN vs SEARCH in a query plan?', back: 'SCAN reads every row of the table. SEARCH uses an index (or the primary key) to jump to the matching rows.' },
        { id: 'sql08-l3-k2', kind: 'cloze', text: 'See SQLite\'s chosen plan: `{{}} SELECT …`', answers: ['EXPLAIN QUERY PLAN'] },
        { id: 'sql08-l3-k3', kind: 'concept', front: 'Composite index column order rule of thumb?', back: 'Equality-filtered columns first, the range-filtered column last. An index is only usable from its leftmost column.' },
        { id: 'sql08-l3-k4', kind: 'concept', front: 'Why does `WHERE strftime(\'%m\', d) = \'03\'` ignore an index on d?', back: 'The function produces a new value per row, so the sorted index on raw d cannot be searched. Rewrite as a range on d.' },
        { id: 'sql08-l3-k5', kind: 'sql', prompt: 'streaming: count duplicate views (rows minus distinct user/show/day events).', dataset: 'streaming', solution: 'SELECT COUNT(*) - (SELECT COUNT(*) FROM (SELECT DISTINCT user_id, show_id, view_date FROM views)) AS duplicate_rows FROM views;' },
      ],
    },
  ],
};
