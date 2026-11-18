import type { Module } from '../types';

export const module: Module = {
  id: 'sql02',
  track: 'sql',
  order: 2,
  title: 'Aggregation & GROUP BY',
  icon: '🧮',
  level: 'Foundations',
  blurb: 'Squash many rows into answers: COUNT/SUM/AVG, NULLs in aggregates, GROUP BY buckets, HAVING vs WHERE and the real order SQL runs in.',
  boss: ['sql-gym-genre-minutes', 'sql-gym-big-departments', 'sql-gym-category-revenue'],
  lessons: [
    // ------------------------------------------------------------------ L1
    {
      id: 'sql02-l1',
      track: 'sql',
      title: 'Counting & summarising (and the NULLs inside)',
      summary: 'COUNT(*) vs COUNT(col) vs COUNT(DISTINCT col), SUM/AVG/MIN/MAX, how NULLs silently change the answer, and the integer-division trap.',
      minutes: 14,
      faang: 'Almost every product-analytics question ("cancellation rate", "average fare", "how many unique riders") is an aggregate. Interviewers at Uber/Lyft- and Meta-style loops deliberately include NULLs and ratios to see whether you know that AVG skips NULLs and that 33 / 36 is 0 in integer math.',
      tags: ['COUNT', 'COUNT DISTINCT', 'AVG', 'NULL', 'Ratios', 'Gotcha'],
      dataset: 'rides',
      cells: [
        { kind: 'viz', viz: { type: 'schema' }, caption: 'A ride-sharing database. Open **trips**: 36 ride requests. Look at the 3 **cancelled** trips — their `fare` and `rating` are **NULL** (no money changed hands). Those NULLs are the whole story of this lesson.' },
        {
          kind: 'md',
          text: `An **aggregate function** squashes a whole column into **one value** — exactly like the SUM / AVERAGE / COUNTA cells you put under a column in Excel.

\`COUNT\`, \`SUM\`, \`AVG\`, \`MIN\`, \`MAX\` all take many rows in and give one row out.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: 'SELECT COUNT(fare) FROM trips;',
          predict: { question: 'There are 36 trips and 3 of them have a NULL fare. What does `COUNT(fare)` return?', options: ['36', '33', '3', 'NULL'], answer: 1, fromOutput: true, explain: '`COUNT(column)` counts the **non-NULL values** in that column. 36 rows − 3 NULL fares = **33**.' },
        },
        {
          kind: 'md',
          text: `Three different counts — and interviewers expect you to pick the right one on purpose:
- \`COUNT(*)\` — number of **rows** (NULLs or not)
- \`COUNT(col)\` — number of rows where \`col\` is **not NULL**
- \`COUNT(DISTINCT col)\` — number of **different** non-NULL values`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT COUNT(*)                  AS all_trips,
       COUNT(fare)               AS paid_trips,
       COUNT(DISTINCT driver_id) AS drivers,
       MIN(fare)                 AS cheapest,
       MAX(requested_at)         AS latest_request
FROM trips;`,
          note: 'MIN and MAX work on text and dates too — ISO date strings sort in time order, so `MAX(requested_at)` is the most recent request.',
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Boxes on a shelf',
          text: 'Picture each row as a **box**. `COUNT(*)` counts the **boxes**. `COUNT(fare)` counts the boxes with **something inside**. `COUNT(DISTINCT driver_id)` counts the **different things** inside. An empty box (NULL) is still a box — but only `COUNT(*)` notices it.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT ROUND(AVG(fare), 2)            AS avg_fare,
       ROUND(SUM(fare) / COUNT(*), 2) AS fare_per_request
FROM trips;`,
          predict: { question: 'Will `avg_fare` and `fare_per_request` be the same number?', options: ['Yes — AVG is just SUM / COUNT(*)', 'No — AVG skips the 3 NULL fares, so it divides by 33, not 36', 'No — SUM treats NULL as 0 so it is bigger', 'It errors: you cannot divide two aggregates'], answer: 1, explain: '`AVG(fare)` = SUM of the non-NULL fares ÷ **33** = 31.52. Dividing the same sum by all **36** requests gives 28.89. Neither is "wrong" — they answer different questions (average *paid* fare vs revenue *per request*).' },
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'Every aggregate except COUNT(*) skips NULLs',
          text: 'SUM, AVG, MIN, MAX and COUNT(col) ignore NULLs. If a NULL should count as zero (a cancelled ride earns $0), say so explicitly: `AVG(COALESCE(fare, 0))`. And on **zero rows**, `COUNT` returns 0 but `SUM` returns **NULL** — wrap it: `COALESCE(SUM(fare), 0)`.',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: 'SELECT COUNT(fare) / COUNT(*) AS completion_rate\nFROM trips;',
          predict: { question: '33 of 36 trips completed (≈ 0.92). What does this query print?', options: ['0.92', '0', '1', '0.916666'], answer: 1, fromOutput: true, explain: 'Both counts are **integers**, and integer ÷ integer truncates: 33 / 36 = **0**. Postgres does the same. Multiply by `1.0` first: `COUNT(fare) * 1.0 / COUNT(*)`.' },
        },
        {
          kind: 'challenge',
          id: 'sql02-l1-c1',
          lang: 'sql',
          title: 'The ride dashboard tile',
          prompt: 'Return **one row** with three columns: `completed` (number of trips that have a fare), `revenue` (total fare, rounded to 2 decimals) and `avg_rating` (average rating, rounded to 2 decimals).',
          starter: 'SELECT COUNT(*) AS completed,\n       SUM(fare) AS revenue\nFROM trips;',
          hints: ['`COUNT(*)` counts cancelled trips too — count the `fare` column instead.', 'Add a third column: `ROUND(AVG(rating), 2) AS avg_rating`. AVG skips the NULL ratings automatically.', 'Wrap the sum too: `ROUND(SUM(fare), 2) AS revenue`.'],
          solution: 'SELECT COUNT(fare) AS completed,\n       ROUND(SUM(fare), 2) AS revenue,\n       ROUND(AVG(rating), 2) AS avg_rating\nFROM trips;',
          explain: '`COUNT(fare)` = 33 completed trips. SUM and AVG skip NULLs, so cancelled rides do not pollute the average rating. ROUND keeps floating-point noise out of your answer.',
          sql: { columns: ['completed', 'revenue', 'avg_rating'] },
        },
        {
          kind: 'challenge',
          id: 'sql02-l1-c2',
          lang: 'sql',
          title: 'Cancellation rate',
          prompt: 'Return one column `cancel_rate`: the **fraction** of trips that were cancelled (no fare), rounded to **3** decimals. The starter runs but prints 0 — fix it.',
          starter: 'SELECT (COUNT(*) - COUNT(fare)) / COUNT(*) AS cancel_rate\nFROM trips;',
          hints: ['The logic is right: cancelled = all rows − rows with a fare. The problem is the division.', 'Integer ÷ integer truncates to 0. Make one side a decimal: multiply by `1.0`.', '`ROUND((COUNT(*) - COUNT(fare)) * 1.0 / COUNT(*), 3)`'],
          solution: 'SELECT ROUND((COUNT(*) - COUNT(fare)) * 1.0 / COUNT(*), 3) AS cancel_rate\nFROM trips;',
          explain: '3 / 36 = 0.083. Another idiom you will see in interviews: `AVG(status = \'cancelled\')` — a comparison is 1 or 0 in SQLite, so its average *is* the rate (in Postgres write `AVG(CASE WHEN status = \'cancelled\' THEN 1.0 ELSE 0 END)`).',
          sql: { columns: ['cancel_rate'] },
        },
        {
          kind: 'quiz',
          id: 'sql02-l1-q1',
          q: "A column `promo` holds `'A', 'A', 'B', NULL, NULL`. What are `COUNT(*)`, `COUNT(promo)` and `COUNT(DISTINCT promo)`?",
          options: ['5, 5, 3', '5, 3, 2', '5, 3, 3', '3, 3, 2'],
          answer: 1,
          explain: '5 rows; 3 non-NULL values; 2 different non-NULL values (A, B). NULL is never counted as a "distinct value".',
        },
        { kind: 'recall', prompt: 'Which aggregate does **not** ignore NULLs — and how do you make AVG treat NULL as 0?', answer: 'Only `COUNT(*)` counts rows regardless of NULLs. To treat NULL as 0: `AVG(COALESCE(col, 0))`.' },
        { kind: 'explain', id: 'sql02-l1-e1', prompt: 'Your PM says "average fare is $31.52, so revenue per request is $31.52". Explain in two sentences why that is wrong.' },
      ],
      cards: [
        { id: 'sql02-l1-k1', kind: 'concept', front: '`COUNT(*)` vs `COUNT(col)`?', back: '`COUNT(*)` counts rows; `COUNT(col)` counts rows where col is NOT NULL.' },
        { id: 'sql02-l1-k2', kind: 'cloze', text: 'Number of different drivers: `SELECT COUNT({{}} driver_id) FROM trips`', answers: ['DISTINCT'] },
        { id: 'sql02-l1-k3', kind: 'concept', front: 'In SQLite/Postgres, what is `33 / 36`?', back: '0 — integer division truncates. Use `33 * 1.0 / 36`.' },
        { id: 'sql02-l1-k4', kind: 'concept', front: 'What does `SUM(x)` return when no rows match?', back: 'NULL (COUNT returns 0). Use `COALESCE(SUM(x), 0)`.' },
        { id: 'sql02-l1-k5', kind: 'sql', prompt: 'Return the cheapest and most expensive fare in `trips` as `min_fare` and `max_fare`.', dataset: 'rides', solution: 'SELECT MIN(fare) AS min_fare, MAX(fare) AS max_fare FROM trips;' },
      ],
    },
    // ------------------------------------------------------------------ L2
    {
      id: 'sql02-l2',
      track: 'sql',
      title: 'GROUP BY: one row per bucket',
      summary: 'Pivot-table thinking in SQL: group by one or more keys, compute revenue = quantity × unit_price, and the "every selected column must be grouped" rule.',
      minutes: 15,
      faang: 'GROUP BY is the single most-tested clause in data interviews — "revenue per category", "orders per customer", "top products". Amazon- and Shopify-style screens check that you compute revenue from line items correctly and never select a column that is not grouped.',
      tags: ['GROUP BY', 'SUM', 'Revenue', 'Multi-key grouping', 'Pivot'],
      dataset: 'shop',
      cells: [
        { kind: 'viz', viz: { type: 'groupby', table: 'orders', key: 'status', agg: 'count' }, caption: 'Watch the 24 orders fly into one **bucket per status**, then each bucket collapses into a single row with its count. That is all GROUP BY does.' },
        {
          kind: 'md',
          text: `So far an aggregate squashed the **whole table** into one row. Real questions are "**per** something": revenue *per* category, orders *per* customer.

\`GROUP BY key\` splits the rows into buckets (one per distinct key value) and runs the aggregate **inside each bucket**. If you have built an Excel **pivot table**, you already know this: the key is the "Rows" field, the aggregate is the "Values" field.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT status, COUNT(*) AS orders
FROM orders
GROUP BY status;`,
          predict: { question: 'How many rows come back?', options: ['1', '4', '15', '24'], answer: 1, fromOutput: true, explain: 'One row **per distinct status**: delivered, shipped, cancelled, returned → **4** rows. The 24 orders are inside the counts.' },
        },
        {
          kind: 'md',
          text: `**The golden rule:** with GROUP BY, every column in SELECT must be either
- a **grouped** column (the bucket label), or
- inside an **aggregate** (COUNT, SUM, AVG…).

Why? A bucket of 15 delivered orders has 15 different \`order_date\`s. If you ask for \`order_date\`, which one should it print? There is no right answer — so standard SQL refuses.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT category, name, COUNT(*) AS products
FROM products
GROUP BY category;`,
          predict: { question: '`name` is not grouped. Postgres, BigQuery and Snowflake reject this query. What does SQLite do?', options: ['Errors too', 'Returns 12 rows, one per product', 'Returns 4 rows, with one arbitrary product name per category', 'Returns 4 rows with all names joined by commas'], answer: 2, explain: 'SQLite is lenient: it quietly picks **some** row\'s name. "Electronics — Laptop Pro — 4" looks meaningful but is not. In an interview treat this as an error: group by every non-aggregated column.' },
          note: 'Lenient ≠ correct. Your interviewer will be thinking in Postgres/BigQuery rules.',
        },
        {
          kind: 'md',
          text: `**Revenue** lives in \`order_items\` — one row per line on a receipt. A line's value is \`quantity * unit_price\`, so an order's revenue is \`SUM(quantity * unit_price)\`.

Why \`order_items.unit_price\` and not \`products.price\`? Prices change and go on sale. The line item stores the price **actually paid**.`,
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT ROUND(SUM(quantity * unit_price), 2) AS revenue
FROM order_items
WHERE order_id = 9;`,
          predict: { question: 'Order 9 is: 2 × Office Chair @ 189, 1 × Standing Desk @ 499, 2 × Water Bottle @ 19.99. What is its revenue?', options: ['707.99', '916.98', '1215.99', '5'], answer: 1, fromOutput: true, explain: '378 + 499 + 39.98 = **916.98**. 707.99 is the classic bug: summing `unit_price` and forgetting the quantity.' },
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT customer_id, status, COUNT(*) AS orders
FROM orders
GROUP BY customer_id, status
ORDER BY customer_id, status;`,
          predict: { question: '**Two keys**: one bucket per *(customer, status)* pair. 8 customers have ordered and there are 4 statuses. How many rows?', options: ['8', '4', '16', '32'], answer: 2, fromOutput: true, explain: 'Only combinations that **actually occur** become buckets: **16**. 32 (8 × 4) would be every possible pair — GROUP BY never invents empty buckets.' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Coins into jars',
          text: 'GROUP BY = sorting coins into **jars**, one jar per label. Afterwards you may only talk about a jar **as a whole**: its label (the grouped column), how many coins (COUNT), their total (SUM), the biggest (MAX)… You can no longer point at "the" coin — there are many.',
        },
        {
          kind: 'challenge',
          id: 'sql02-l2-c1',
          lang: 'sql',
          title: 'Category price sheet',
          prompt: 'For each product `category`, return `products` (how many), `avg_price` (rounded to 2 decimals) and `cheapest` (lowest price). Sort by `avg_price`, highest first.',
          starter: 'SELECT category, COUNT(*) AS products\nFROM products\nGROUP BY category;',
          hints: ['Add two aggregates to the SELECT list: AVG and MIN of `price`.', '`ROUND(AVG(price), 2) AS avg_price, MIN(price) AS cheapest`', 'Finish with `ORDER BY avg_price DESC` — ORDER BY runs after SELECT, so it can use the alias.'],
          solution: 'SELECT category,\n       COUNT(*) AS products,\n       ROUND(AVG(price), 2) AS avg_price,\n       MIN(price) AS cheapest\nFROM products\nGROUP BY category\nORDER BY avg_price DESC;',
          explain: 'One bucket per category, several aggregates per bucket. Electronics averages 405.87 because a single 1299 laptop drags the mean up — a good moment to mention medians in an interview.',
          sql: { ordered: true },
        },
        {
          kind: 'challenge',
          id: 'sql02-l2-c2',
          lang: 'sql',
          title: 'Fix the best-sellers report',
          prompt: 'This report should list the **top 3 products by revenue**: `product_id`, `units` (total quantity) and `revenue` (rounded to 2 decimals). It runs, but the revenue numbers are wrong. Fix it.',
          starter: 'SELECT product_id,\n       SUM(quantity) AS units,\n       ROUND(SUM(unit_price), 2) AS revenue\nFROM order_items\nGROUP BY product_id\nORDER BY revenue DESC\nLIMIT 3;',
          hints: ['What is the value of one line item? Look at the `revenue` expression.', 'Revenue = quantity × unit_price, summed: `SUM(quantity * unit_price)`.'],
          solution: 'SELECT product_id,\n       SUM(quantity) AS units,\n       ROUND(SUM(quantity * unit_price), 2) AS revenue\nFROM order_items\nGROUP BY product_id\nORDER BY revenue DESC\nLIMIT 3;',
          explain: 'Multiply **inside** the SUM: compute each line\'s value, then add the lines. Summing prices alone treats "3 chairs" as "1 chair" and even changes the ranking (product 8 jumps from 3rd to 2nd).',
          sql: { ordered: true },
        },
        {
          kind: 'quiz',
          id: 'sql02-l2-q1',
          q: 'Which query is **invalid** in standard SQL (Postgres, BigQuery)?',
          options: ['`SELECT city, COUNT(*) FROM customers GROUP BY city`', '`SELECT city, name, COUNT(*) FROM customers GROUP BY city`', '`SELECT COUNT(*) FROM customers GROUP BY city`', '`SELECT city FROM customers GROUP BY city`'],
          answer: 1,
          explain: '`name` is neither grouped nor aggregated. Option 3 is legal (unlabelled counts per city) and option 4 is legal (same as SELECT DISTINCT city).',
        },
        { kind: 'recall', prompt: 'With GROUP BY, what two kinds of things are allowed in the SELECT list?', answer: 'Grouped columns (the bucket labels) and aggregate expressions (COUNT, SUM, AVG, MIN, MAX…). Nothing else.' },
        { kind: 'explain', id: 'sql02-l2-e1', prompt: 'Explain to an Excel user how `GROUP BY category` + `SUM(quantity * unit_price)` maps onto a pivot table.' },
      ],
      cards: [
        { id: 'sql02-l2-k1', kind: 'concept', front: 'GROUP BY rule for the SELECT list?', back: 'Every column must be grouped or inside an aggregate.' },
        { id: 'sql02-l2-k2', kind: 'cloze', text: 'Revenue per order: `SELECT order_id, SUM({{}} * {{}}) FROM order_items GROUP BY order_id`', answers: ['quantity', 'unit_price'] },
        { id: 'sql02-l2-k3', kind: 'concept', front: '`GROUP BY a, b` makes one row per…?', back: 'Distinct (a, b) combination that actually exists in the data.' },
        { id: 'sql02-l2-k4', kind: 'sql', prompt: 'Number of customers per `city` (columns: city, customers).', dataset: 'shop', solution: 'SELECT city, COUNT(*) AS customers FROM customers GROUP BY city;' },
        { id: 'sql02-l2-k5', kind: 'concept', front: 'Why use `order_items.unit_price` instead of `products.price` for revenue?', back: 'It is the price actually paid at the time of sale; list prices change.' },
      ],
    },
    // ------------------------------------------------------------------ L3
    {
      id: 'sql02-l3',
      track: 'sql',
      title: 'HAVING vs WHERE & the real order of execution',
      summary: 'Filter rows with WHERE, filter groups with HAVING, and see the logical pipeline FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT.',
      minutes: 15,
      faang: '"Departments with more than N employees" and "customers who spent over $X" are staple screen questions at Meta, Amazon and Google-style loops. Explaining *why* SUM() cannot go in WHERE (logical execution order) is a classic follow-up that signals real understanding.',
      tags: ['HAVING', 'WHERE', 'Execution order', 'GROUP BY', 'Gotcha'],
      dataset: 'hr',
      cells: [
        {
          kind: 'md',
          text: `Question from HR: *"Counting only people earning at least 120k, which departments have **3 or more** of them, and what is their average salary?"*

Two different filters hide in that sentence: one on **rows** (salary ≥ 120k) and one on **groups** (3 or more people). Step through how the database answers it:`,
        },
        {
          kind: 'viz',
          viz: { type: 'pipeline', sql: 'SELECT dept_id, COUNT(*) AS headcount, ROUND(AVG(salary)) AS avg_salary\nFROM employees\nWHERE salary >= 120000\nGROUP BY dept_id\nHAVING COUNT(*) >= 3\nORDER BY avg_salary DESC;' },
          caption: 'Click through the stages. **WHERE** removes 3 low-salary rows *before* any bucket exists. **HAVING** then removes the whole Marketing bucket (dept 4) because only 1 person is left in it.',
        },
        {
          kind: 'md',
          text: `You **write** SELECT first, but the database **runs**:

**FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT**

- **WHERE** filters **rows** — groups don't exist yet, so no aggregates allowed.
- **HAVING** filters **groups** — it runs after aggregation, so \`COUNT(*)\`, \`AVG(salary)\` are available.`,
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'The soup kitchen',
          text: '**F**ancy **W**aiters **G**ive **H**ot **S**oup **O**nly **L**ater → FROM, WHERE, GROUP BY, HAVING, SELECT, ORDER BY, LIMIT. Picture it: fetch the ingredients (FROM), throw out bad ones (WHERE), put them into pots (GROUP BY), discard pots that are too small (HAVING), plate the dish (SELECT), line the plates up (ORDER BY), serve the first few (LIMIT).',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT dept_id, COUNT(*) AS headcount
FROM employees
WHERE COUNT(*) >= 3
GROUP BY dept_id;`,
          error: true,
          predict: { question: 'What happens?', options: ['Returns departments with 3+ people', 'Returns every department', 'Error: misuse of aggregate COUNT()', 'Returns 0 rows'], answer: 2, explain: 'WHERE runs **before** GROUP BY — at that moment there is nothing to count yet. The fix is to move the condition into `HAVING COUNT(*) >= 3`.' },
          note: 'Read the error message — "misuse of aggregate" almost always means "this belongs in HAVING".',
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT dept_id, COUNT(*) AS headcount
FROM employees
GROUP BY dept_id;`,
          predict: { question: 'There are 4 department ids among the employees, and one contractor whose `dept_id` is **NULL**. How many rows?', options: ['4', '5', '17', '18'], answer: 1, fromOutput: true, explain: 'GROUP BY puts **all NULLs into one bucket** (even though `NULL = NULL` is not TRUE in WHERE). So you get 4 departments + 1 NULL group = **5**. Interviewers love asking about that extra row.' },
        },
        {
          kind: 'code',
          lang: 'sql',
          code: `SELECT dept_id, COUNT(*) AS headcount
FROM employees
WHERE salary >= 120000
GROUP BY dept_id;`,
          predict: { question: 'Same query, but WHERE first removes everyone under 120k (Lucy 95k, Aisha 105k, Victor 90k — Victor is the NULL-dept contractor). How many rows now?', options: ['3', '4', '5', '15'], answer: 1, fromOutput: true, explain: 'Victor was the only member of the NULL bucket, so that bucket never forms → **4** rows. Marketing survives with just 1 person. WHERE changes **which buckets exist**; HAVING only removes finished buckets.' },
        },
        {
          kind: 'callout',
          tone: 'interview',
          title: 'Where does each condition go?',
          text: 'Condition on a **raw column** → WHERE (it also makes the query faster: fewer rows to group). Condition on an **aggregate** → HAVING. **Aliases:** Postgres will not let WHERE or HAVING use a SELECT alias (`HAVING headcount >= 3` fails there) — repeat the expression. SQLite and MySQL are more lenient, but write the portable version. ORDER BY may use aliases everywhere.',
        },
        {
          kind: 'challenge',
          id: 'sql02-l3-c1',
          lang: 'sql',
          title: 'Departments still hiring',
          prompt: 'Considering only employees hired on or after **2020-01-01**, return each `dept_id` with `new_hires` (count) and `avg_salary` (rounded to a whole number), keeping only departments with **at least 2** such hires.',
          starter: "SELECT dept_id, COUNT(*) AS new_hires, ROUND(AVG(salary)) AS avg_salary\nFROM employees\nWHERE hire_date >= '2020-01-01' AND COUNT(*) >= 2\nGROUP BY dept_id;",
          hints: ['The date filter is about individual **rows** — it can stay in WHERE.', 'The "at least 2" filter is about **groups** — it needs to run after grouping.', "`... WHERE hire_date >= '2020-01-01' GROUP BY dept_id HAVING COUNT(*) >= 2`"],
          solution: "SELECT dept_id, COUNT(*) AS new_hires, ROUND(AVG(salary)) AS avg_salary\nFROM employees\nWHERE hire_date >= '2020-01-01'\nGROUP BY dept_id\nHAVING COUNT(*) >= 2;",
          explain: 'Both filters in one query: WHERE trims rows first, HAVING trims buckets last. ISO dates compare correctly as text, so `>= \'2020-01-01\'` works.',
        },
        {
          kind: 'challenge',
          id: 'sql02-l3-c2',
          lang: 'sql',
          title: 'The query that lies',
          prompt: 'For each `dept_id`, count the employees earning **at least 150000** (`seniors`), and keep only departments with **2 or more** seniors. The starter *runs* in SQLite — but returns the wrong rows. Fix it.',
          starter: 'SELECT dept_id, COUNT(*) AS seniors\nFROM employees\nGROUP BY dept_id\nHAVING salary >= 150000;',
          hints: ['`salary` in HAVING is a bare, non-aggregated column — SQLite silently uses one arbitrary row per bucket (Postgres would error).', 'The salary test is per **row** → move it to WHERE. The "2 or more" test is per **group** → that is the HAVING.', 'WHERE salary >= 150000 … GROUP BY dept_id HAVING COUNT(*) >= 2'],
          solution: 'SELECT dept_id, COUNT(*) AS seniors\nFROM employees\nWHERE salary >= 150000\nGROUP BY dept_id\nHAVING COUNT(*) >= 2;',
          explain: 'The starter counted **everyone** (6, 5, 4, 2) and filtered on a random row\'s salary. Correct answer: Engineering 5 seniors, Data 3. A query that runs is not a query that is right — always sanity-check counts.',
        },
        {
          kind: 'quiz',
          id: 'sql02-l3-q1',
          q: 'You need customers whose **total spend > 1000**, counting **only delivered orders**. Where do the two conditions go?',
          options: ['Both in WHERE', "`status = 'delivered'` in WHERE, `SUM(...) > 1000` in HAVING", "`SUM(...) > 1000` in WHERE, `status = 'delivered'` in HAVING", 'Both in HAVING'],
          answer: 1,
          explain: 'Row condition (status) → WHERE, before grouping. Aggregate condition (SUM) → HAVING, after grouping. Putting the status test in HAVING would be a bare column again.',
        },
        { kind: 'recall', prompt: 'Write the logical order of execution of a SELECT query, from first to last.', answer: 'FROM (+ JOINs) → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT.' },
        { kind: 'explain', id: 'sql02-l3-e1', prompt: 'Explain, using the order of execution, why `WHERE SUM(amount) > 100` is an error but `HAVING SUM(amount) > 100` works.' },
      ],
      cards: [
        { id: 'sql02-l3-k1', kind: 'concept', front: 'WHERE vs HAVING?', back: 'WHERE filters rows before grouping; HAVING filters groups after aggregation.' },
        { id: 'sql02-l3-k2', kind: 'cloze', text: 'Logical order: FROM → {{}} → GROUP BY → {{}} → SELECT → ORDER BY → LIMIT', answers: ['WHERE', 'HAVING'] },
        { id: 'sql02-l3-k3', kind: 'concept', front: 'Does GROUP BY put NULL keys in a group?', back: 'Yes — all NULLs form one group of their own.' },
        { id: 'sql02-l3-k4', kind: 'sql', prompt: 'dept_id and headcount for departments with more than 3 employees.', dataset: 'hr', solution: 'SELECT dept_id, COUNT(*) AS headcount FROM employees GROUP BY dept_id HAVING COUNT(*) > 3;' },
        { id: 'sql02-l3-k5', kind: 'concept', front: 'Error "misuse of aggregate" usually means…?', back: 'You used SUM/COUNT/AVG in WHERE — move that condition to HAVING.' },
      ],
    },
  ],
};
