import type { Problem } from '../types';

// Interview-style SQL problems: the recurring big-tech patterns (module sql07)
// plus data-modeling / DML flavoured ones (module sql08).
export const problems: Problem[] = [
  // ------------------------------------------------------------ Easy
  {
    id: 'sql-gym-second-highest-salary',
    track: 'sql',
    title: 'Second highest salary',
    difficulty: 'Easy',
    pattern: 'Nth highest',
    companies: ['Amazon', 'Google', 'Microsoft'],
    minutes: 6,
    dataset: 'hr',
    challenge: {
      kind: 'challenge',
      id: 'sql-gym-second-highest-salary',
      lang: 'sql',
      title: 'Second highest salary',
      prompt: 'Return the **second-highest distinct** salary in `employees` as a single column `second_highest`. The query must return exactly one row — NULL if no second salary exists.',
      starter: 'SELECT MAX(salary) AS second_highest\nFROM employees;',
      hints: [
        'Distinct salaries, sorted DESC, skip one: `SELECT DISTINCT salary … ORDER BY salary DESC LIMIT 1 OFFSET 1`.',
        'Wrap that in a scalar subquery — `SELECT (…) AS second_highest` — so "no row" becomes NULL instead of an empty result.',
      ],
      solution: 'SELECT (\n  SELECT DISTINCT salary\n  FROM employees\n  ORDER BY salary DESC\n  LIMIT 1 OFFSET 1\n) AS second_highest;',
      explain: '`DISTINCT` makes ties count once, `OFFSET 1` skips the top value, and the scalar-subquery wrapper guarantees one row (NULL when empty). `MAX(salary) WHERE salary < (SELECT MAX(salary) …)` is an equally valid answer.',
    },
    followups: ['Generalise it to the **Nth** highest — which approach scales best (DENSE_RANK vs OFFSET vs nested MAX)?', 'Now return the second-highest salary **per department**, keeping ties.'],
  },
  {
    id: 'sql-gym-cancel-rate-by-city',
    track: 'sql',
    title: 'Trip cancellation rate by city',
    difficulty: 'Easy',
    pattern: 'Conditional aggregation / rates',
    companies: ['Uber', 'Lyft', 'DoorDash'],
    minutes: 8,
    dataset: 'rides',
    challenge: {
      kind: 'challenge',
      id: 'sql-gym-cancel-rate-by-city',
      lang: 'sql',
      title: 'Trip cancellation rate by city',
      prompt: 'For every city in `trips`, return `city`, `trips` (all trips), `cancelled` (cancelled trips) and `cancel_pct` (cancelled ÷ all × 100, rounded to 1 decimal). Include cities with zero cancellations. Order by `cancel_pct` descending, then `city`.',
      starter: "SELECT city, COUNT(*) AS trips, COUNT(*) AS cancelled,\n       100 * COUNT(*) / COUNT(*) AS cancel_pct\nFROM trips\nWHERE status = 'cancelled'\nGROUP BY city\nORDER BY cancel_pct DESC, city;",
      hints: [
        'Filtering with WHERE throws away the completed trips you need for the denominator (and drops LA entirely).',
        "Count cancellations *inside* the aggregate: `SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)`.",
        "`ROUND(100.0 * SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) / COUNT(*), 1)` — note the `100.0`.",
      ],
      solution: "SELECT city,\n       COUNT(*) AS trips,\n       SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,\n       ROUND(100.0 * SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) / COUNT(*), 1) AS cancel_pct\nFROM trips\nGROUP BY city\nORDER BY cancel_pct DESC, city;",
      explain: 'Rates need numerator and denominator from the **same** rows, so the condition moves from WHERE into a CASE inside the aggregate. NYC 2/16 = 12.5%, SF 1/11 = 9.1%, LA 0%.',
      sql: { ordered: true },
    },
    followups: ['Compute it **per day** and only for riders with at least 2 trips — where does each filter go?', 'Why might `AVG(status = \'cancelled\')` be a neat shortcut, and is it portable to Postgres?'],
  },
  {
    id: 'sql-gym-genre-share',
    track: 'sql',
    title: 'Share of watch time by genre',
    difficulty: 'Easy',
    pattern: 'Percent of total',
    companies: ['Netflix', 'Spotify', 'YouTube'],
    minutes: 8,
    dataset: 'streaming',
    challenge: {
      kind: 'challenge',
      id: 'sql-gym-genre-share',
      lang: 'sql',
      title: 'Share of watch time by genre',
      prompt: 'Return each `genre`, its total `minutes` watched, and `pct_of_total` (its share of all minutes, × 100, rounded to 1 decimal). Order by `minutes` descending.',
      starter: 'SELECT s.genre, SUM(v.minutes) AS minutes,\n       100 * SUM(v.minutes) / (SELECT SUM(minutes) FROM views) AS pct_of_total\nFROM views v\nJOIN shows s ON s.id = v.show_id\nGROUP BY s.genre\nORDER BY minutes DESC;',
      hints: [
        'The structure is right, but the result shows whole numbers only — integer division.',
        'Use `100.0 *` and wrap in `ROUND(…, 1)`.',
        'Window alternative for the denominator: `SUM(SUM(v.minutes)) OVER ()` — the total of the group totals.',
      ],
      solution: 'SELECT s.genre,\n       SUM(v.minutes) AS minutes,\n       ROUND(100.0 * SUM(v.minutes) / SUM(SUM(v.minutes)) OVER (), 1) AS pct_of_total\nFROM views v\nJOIN shows s ON s.id = v.show_id\nGROUP BY s.genre\nORDER BY minutes DESC;',
      explain: '`SUM(SUM(x)) OVER ()` looks odd but reads cleanly: the inner SUM is per group, the outer window SUM adds up all groups. Drama leads with 32.5% of 2631 minutes.',
      sql: { ordered: true },
    },
    followups: ['Now give each genre\'s share **within each subscription plan** (hint: `PARTITION BY plan`).', 'How would you show a running cumulative share (Pareto curve)?'],
  },

  // ------------------------------------------------------------ Medium
  {
    id: 'sql-gym-top2-per-category',
    track: 'sql',
    title: 'Top 2 products per category (with ties)',
    difficulty: 'Medium',
    pattern: 'Top-N per group',
    companies: ['Amazon', 'Shopify', 'Walmart'],
    minutes: 12,
    dataset: 'shop',
    challenge: {
      kind: 'challenge',
      id: 'sql-gym-top2-per-category',
      lang: 'sql',
      title: 'Top 2 products per category (with ties)',
      prompt: 'For each category, return the products with the **top 2 distinct unit totals** (sum of `quantity` across all `order_items`). Ties must all be included. Columns: `category`, `product` (name), `units`. Order by `category`, `units` descending, then `product`.',
      starter: `WITH units AS (
  SELECT p.category, p.name AS product, SUM(oi.quantity) AS units
  FROM order_items oi
  JOIN products p ON p.id = oi.product_id
  GROUP BY p.id
),
ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY units DESC) AS rnk
  FROM units
)
SELECT category, product, units
FROM ranked
WHERE rnk <= 2
ORDER BY category, units DESC, product;`,
      hints: [
        'Look at Electronics: two products are tied on 13 units. ROW_NUMBER splits the tie and squeezes out a product.',
        '"Ties included, top 2 distinct values" is DENSE_RANK\'s job.',
      ],
      solution: `WITH units AS (
  SELECT p.category, p.name AS product, SUM(oi.quantity) AS units
  FROM order_items oi
  JOIN products p ON p.id = oi.product_id
  GROUP BY p.id
),
ranked AS (
  SELECT *, DENSE_RANK() OVER (PARTITION BY category ORDER BY units DESC) AS rnk
  FROM units
)
SELECT category, product, units
FROM ranked
WHERE rnk <= 2
ORDER BY category, units DESC, product;`,
      explain: 'Aggregate → rank per partition → filter outside. With DENSE_RANK, USB-C Hub and the headphones share rank 1 and Wireless Mouse is rank 2, so Electronics returns three rows.',
      sql: { ordered: true },
    },
    followups: ['What changes if the business says "exactly 2 rows per category, break ties by revenue"?', 'How would you rank by **revenue** but only for delivered orders?'],
  },
  {
    id: 'sql-gym-mutual-follows',
    track: 'sql',
    title: 'Mutual follows',
    difficulty: 'Medium',
    pattern: 'Self-join',
    companies: ['Meta', 'LinkedIn', 'X'],
    minutes: 10,
    dataset: 'social',
    challenge: {
      kind: 'challenge',
      id: 'sql-gym-mutual-follows',
      lang: 'sql',
      title: 'Mutual follows',
      prompt: 'Find every pair of users who follow **each other**. Return each pair **once** as `user_a`, `user_b` (usernames), where `user_a` is the one with the smaller user id. Order by `user_a`.',
      starter: `SELECT ua.username AS user_a, ub.username AS user_b
FROM follows a
JOIN follows b ON b.follower_id = a.followee_id AND b.followee_id = a.follower_id
JOIN users ua ON ua.id = a.follower_id
JOIN users ub ON ub.id = a.followee_id
ORDER BY user_a;`,
      hints: [
        'The self-join is right — but every mutual pair appears twice (A→B and B→A).',
        'Keep just one orientation: `WHERE a.follower_id < a.followee_id`.',
      ],
      solution: `SELECT ua.username AS user_a, ub.username AS user_b
FROM follows a
JOIN follows b ON b.follower_id = a.followee_id AND b.followee_id = a.follower_id
JOIN users ua ON ua.id = a.follower_id
JOIN users ub ON ub.id = a.followee_id
WHERE a.follower_id < a.followee_id
ORDER BY user_a;`,
      explain: 'Join the table to itself with the columns swapped, then break the symmetry with `<`. bilal ↔ diego and gwen ↔ iris are the only mutual pairs.',
      sql: { ordered: true },
    },
    followups: ['Return each user with their number of mutual follows — including users with zero.', '"People you may know": users followed by 2+ of the people I follow but whom I don\'t follow yet.'],
  },
  {
    id: 'sql-gym-dedupe-delete',
    track: 'sql',
    title: 'Delete duplicate events',
    difficulty: 'Medium',
    pattern: 'De-duplication (DML)',
    companies: ['Netflix', 'Meta', 'Databricks'],
    minutes: 12,
    dataset: 'streaming',
    challenge: {
      kind: 'challenge',
      id: 'sql-gym-dedupe-delete',
      lang: 'sql',
      title: 'Delete duplicate events',
      prompt: 'A retry bug logged some views twice. Two rows are duplicates when they share `user_id`, `show_id` **and** `view_date`. **DELETE** the extra copies, keeping the row with the **lowest `id`** in each group. Keep the final SELECT — it is what gets graded.',
      starter: `-- 1) preview the rows you will delete (SELECT your WHERE first!)
-- 2) write the DELETE

SELECT (SELECT COUNT(*) FROM views) AS total_rows,
       (SELECT GROUP_CONCAT(id) FROM views
         WHERE user_id = 6 AND show_id = 3 AND view_date = '2024-03-15') AS kept_ids;`,
      hints: [
        'Rank copies: `ROW_NUMBER() OVER (PARTITION BY user_id, show_id, view_date ORDER BY id) AS rn` — every row with `rn > 1` is an extra copy.',
        'SQLite cannot DELETE from a CTE directly; delete by id: `DELETE FROM views WHERE id IN (SELECT id FROM (…ranked…) WHERE rn > 1);`',
        'Shorter alternative: `DELETE FROM views WHERE id NOT IN (SELECT MIN(id) FROM views GROUP BY user_id, show_id, view_date);`',
      ],
      solution: `DELETE FROM views
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY user_id, show_id, view_date ORDER BY id) AS rn
    FROM views
  )
  WHERE rn > 1
);

SELECT (SELECT COUNT(*) FROM views) AS total_rows,
       (SELECT GROUP_CONCAT(id) FROM views
         WHERE user_id = 6 AND show_id = 3 AND view_date = '2024-03-15') AS kept_ids;`,
      explain: 'Rank inside a subquery, delete by primary key. The table drops from 45 to 44 rows and only id 12 survives in the duplicate group. In production you would run the inner SELECT first and wrap the DELETE in a transaction.',
    },
    followups: ['How would you prevent the duplicates from ever landing? (UNIQUE constraint / idempotent `INSERT … ON CONFLICT DO NOTHING`)', 'The table has 5 billion rows — would you DELETE in place or rebuild with `CREATE TABLE … AS SELECT` the de-duplicated rows?'],
  },
  {
    id: 'sql-gym-low-water-balance',
    track: 'sql',
    title: 'Lowest running balance per account',
    difficulty: 'Medium',
    pattern: 'Running total',
    companies: ['Stripe', 'JPMorgan', 'Robinhood'],
    minutes: 12,
    dataset: 'bank',
    challenge: {
      kind: 'challenge',
      id: 'sql-gym-low-water-balance',
      lang: 'sql',
      title: 'Lowest running balance per account',
      prompt: 'Every account starts at 0 and `amount` is signed (deposits +, spending −). For each account, find its **lowest running balance** after any transaction and the **first date** it hit that low. Return `account_id`, `lowest_balance`, `on_date`, ordered by `account_id`. (Order transactions by `txn_date`, then `id`.)',
      starter: 'SELECT account_id, MIN(amount) AS lowest_balance, MIN(txn_date) AS on_date\nFROM transactions\nGROUP BY account_id\nORDER BY account_id;',
      hints: [
        'The starter finds the smallest single transaction, not the smallest *balance*. You need a running total first.',
        '`SUM(amount) OVER (PARTITION BY account_id ORDER BY txn_date, id) AS bal` gives the balance after every row.',
        'Then pick one row per account: `ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY bal, txn_date)` and keep `rn = 1`.',
      ],
      solution: `WITH b AS (
  SELECT account_id, txn_date,
         SUM(amount) OVER (PARTITION BY account_id ORDER BY txn_date, id) AS bal
  FROM transactions
),
r AS (
  SELECT account_id, txn_date, bal,
         ROW_NUMBER() OVER (PARTITION BY account_id ORDER BY bal, txn_date) AS rn
  FROM b
)
SELECT account_id, bal AS lowest_balance, txn_date AS on_date
FROM r
WHERE rn = 1
ORDER BY account_id;`,
      explain: 'Two window passes: a running SUM to build the balance curve, then ROW_NUMBER to pick each curve\'s lowest point (earliest on ties). Ordering the running sum by `txn_date, id` keeps same-day transactions deterministic.',
      sql: { ordered: true },
    },
    followups: ['Flag every transaction that would have taken a balance **below zero** (an overdraft).', 'Why does `ORDER BY txn_date` alone give a different running total when two transactions share a date? (RANGE vs ROWS frames)'],
  },
  {
    id: 'sql-gym-mom-spend',
    track: 'sql',
    title: 'Month-over-month spending',
    difficulty: 'Medium',
    pattern: 'Period-over-period growth (LAG)',
    companies: ['Capital One', 'Amazon', 'Stripe'],
    minutes: 10,
    dataset: 'bank',
    challenge: {
      kind: 'challenge',
      id: 'sql-gym-mom-spend',
      lang: 'sql',
      title: 'Month-over-month spending',
      prompt: 'Monthly **spend** is the total of money going out (the negative amounts, shown as a positive number). Return `month` (YYYY-MM), `spend`, `prev_spend` and `mom_pct` (change vs previous month × 100, rounded to 1 decimal). Order by `month`.',
      starter: "SELECT strftime('%Y-%m', txn_date) AS month, SUM(amount) AS spend\nFROM transactions\nGROUP BY month\nORDER BY month;",
      hints: [
        'Two problems: the starter nets deposits against spending, and there is no comparison yet. Keep only `amount < 0` and flip the sign: `-SUM(amount)`.',
        'Put the monthly totals in a CTE, then use `LAG(spend) OVER (ORDER BY month)`.',
        '`ROUND(100.0 * (spend - LAG(spend) OVER (ORDER BY month)) / LAG(spend) OVER (ORDER BY month), 1) AS mom_pct`',
      ],
      solution: `WITH m AS (
  SELECT strftime('%Y-%m', txn_date) AS month, -SUM(amount) AS spend
  FROM transactions
  WHERE amount < 0
  GROUP BY month
)
SELECT month, spend,
       LAG(spend) OVER (ORDER BY month) AS prev_spend,
       ROUND(100.0 * (spend - LAG(spend) OVER (ORDER BY month))
             / LAG(spend) OVER (ORDER BY month), 1) AS mom_pct
FROM m
ORDER BY month;`,
      explain: 'Define the metric precisely, aggregate to one row per month, then LAG. Spend rose 40.2% in February and fell 72.8% in April (a partial month — worth saying out loud in an interview).',
      sql: { ordered: true },
    },
    followups: ['April only has data up to the 13th — how would you compare like-for-like (month-to-date vs same days last month)?', 'Rewrite it to compute **year-over-year** growth if you had several years of data.'],
  },
  {
    id: 'sql-gym-electronics-not-home',
    track: 'sql',
    title: 'Bought Electronics, never Home',
    difficulty: 'Medium',
    pattern: 'Did X but not Y',
    companies: ['Amazon', 'Target', 'Instacart'],
    minutes: 10,
    dataset: 'shop',
    challenge: {
      kind: 'challenge',
      id: 'sql-gym-electronics-not-home',
      lang: 'sql',
      title: 'Bought Electronics, never Home',
      prompt: 'Return the `name` of every customer who has ordered at least one **Electronics** product but **never** a **Home** product (orders of any status count). Order by `name`.',
      starter: `SELECT DISTINCT c.name
FROM customers c
JOIN orders o ON o.customer_id = c.id
JOIN order_items oi ON oi.order_id = o.id
JOIN products p ON p.id = oi.product_id
WHERE p.category = 'Electronics' AND p.category <> 'Home'
ORDER BY c.name;`,
      hints: [
        'The WHERE clause checks one order line at a time — it can never see that the same customer bought a Home product on another line.',
        'Group to one row per customer: `GROUP BY c.id, c.name`.',
        "`HAVING SUM(p.category = 'Electronics') > 0 AND SUM(p.category = 'Home') = 0` (or use EXCEPT / NOT EXISTS).",
      ],
      solution: `SELECT c.name
FROM customers c
JOIN orders o ON o.customer_id = c.id
JOIN order_items oi ON oi.order_id = o.id
JOIN products p ON p.id = oi.product_id
GROUP BY c.id, c.name
HAVING SUM(p.category = 'Electronics') > 0
   AND SUM(p.category = 'Home') = 0
ORDER BY c.name;`,
      explain: 'Only Bob Martin and Eve Park qualify. "Never" is a property of a customer\'s whole history, so decide it after grouping (HAVING) or with a set operation, never in a row-level WHERE.',
      sql: { ordered: true },
    },
    followups: ['Rewrite it with `NOT EXISTS`. Which version would you expect to be fastest on a huge table, and why?', 'Now: customers who bought Electronics and then, **later**, bought nothing for 60 days.'],
  },

  // ------------------------------------------------------------ Hard
  {
    id: 'sql-gym-longest-streak',
    track: 'sql',
    title: 'Longest login streak per user',
    difficulty: 'Hard',
    pattern: 'Gaps & islands',
    companies: ['Meta', 'TikTok', 'Duolingo'],
    minutes: 18,
    dataset: 'social',
    challenge: {
      kind: 'challenge',
      id: 'sql-gym-longest-streak',
      lang: 'sql',
      title: 'Longest login streak per user',
      prompt: 'For **every** user with logins, return their longest run of consecutive login days: `user_id`, `streak_start`, `streak_end`, `days`. If a user has several equally long streaks, report the **earliest**. Order by `days` descending, then `user_id`.',
      starter: `SELECT user_id,
       MIN(login_date) AS streak_start,
       MAX(login_date) AS streak_end,
       COUNT(*) AS days
FROM logins
GROUP BY user_id
ORDER BY days DESC, user_id;`,
      hints: [
        'The starter treats all of a user\'s logins as one streak. Tag each login with an island id: `julianday(login_date) - ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY login_date)`.',
        'GROUP BY `user_id, grp` to get every streak with its MIN, MAX and COUNT.',
        'Then pick one streak per user: `ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY days DESC, streak_start)` and keep `= 1`.',
      ],
      solution: `WITH g AS (
  SELECT user_id, login_date,
         julianday(login_date)
           - ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY login_date) AS grp
  FROM logins
),
streaks AS (
  SELECT user_id, MIN(login_date) AS streak_start, MAX(login_date) AS streak_end,
         COUNT(*) AS days
  FROM g
  GROUP BY user_id, grp
),
best AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY days DESC, streak_start) AS rn
  FROM streaks
)
SELECT user_id, streak_start, streak_end, days
FROM best
WHERE rn = 1
ORDER BY days DESC, user_id;`,
      explain: 'Islands → measure → pick the best per user: three CTEs, each one idea. User 7 leads with 7 days; user 3 has a 3-day and a 5-day streak, and the 5-day one (04-11 to 04-15) wins.',
      sql: { ordered: true },
    },
    followups: ['What breaks if the table can contain the same user and date twice, and how do you fix it?', 'Return users whose **current** streak (ending on the latest date in the table) is 3+ days.'],
  },
  {
    id: 'sql-gym-cohort-matrix',
    track: 'sql',
    title: 'Cohort retention matrix',
    difficulty: 'Hard',
    pattern: 'Cohorts & retention',
    companies: ['Amazon', 'Airbnb', 'Shopify'],
    minutes: 20,
    dataset: 'shop',
    challenge: {
      kind: 'challenge',
      id: 'sql-gym-cohort-matrix',
      lang: 'sql',
      title: 'Cohort retention matrix',
      prompt: 'A customer\'s cohort is the month (YYYY-MM) of their **first order**. For each cohort and each `month_offset` (0 = the cohort month, 1 = the month after, …) in which at least one cohort member ordered, return `cohort`, `month_offset`, `active_customers` (distinct customers who ordered that month). Order by `cohort`, `month_offset`.',
      starter: `SELECT strftime('%Y-%m', c.signup_date) AS cohort,
       0 AS month_offset,
       COUNT(DISTINCT o.customer_id) AS active_customers
FROM customers c
JOIN orders o ON o.customer_id = c.id
GROUP BY cohort
ORDER BY cohort, month_offset;`,
      hints: [
        'Wrong anchor: the cohort is the first **order** month, not the signup month. Start with a CTE `firsts(customer_id, first_date)` using `MIN(order_date)`.',
        "Month offset = month number of the order minus month number of the first order, where month number = `CAST(strftime('%Y', d) AS INT) * 12 + CAST(strftime('%m', d) AS INT)`.",
        'Join orders to `firsts`, compute cohort + offset per order, then `GROUP BY cohort, month_offset` with `COUNT(DISTINCT customer_id)`.',
      ],
      solution: `WITH firsts AS (
  SELECT customer_id, MIN(order_date) AS first_date
  FROM orders
  GROUP BY customer_id
),
activity AS (
  SELECT o.customer_id,
         strftime('%Y-%m', f.first_date) AS cohort,
         (CAST(strftime('%Y', o.order_date) AS INT) * 12 + CAST(strftime('%m', o.order_date) AS INT))
       - (CAST(strftime('%Y', f.first_date) AS INT) * 12 + CAST(strftime('%m', f.first_date) AS INT)) AS month_offset
  FROM orders o
  JOIN firsts f ON f.customer_id = o.customer_id
)
SELECT cohort, month_offset, COUNT(DISTINCT customer_id) AS active_customers
FROM activity
GROUP BY cohort, month_offset
ORDER BY cohort, month_offset;`,
      explain: 'Anchor every customer to their first month, convert dates to a month index so offsets work across year boundaries, then count distinct customers per (cohort, offset). Divide by the offset-0 count to turn it into the classic retention-percentage triangle.',
      sql: { ordered: true },
    },
    followups: ['Turn the counts into percentages of each cohort\'s size (hint: `FIRST_VALUE` or a join to offset 0).', 'How would you show offsets with **zero** active customers as explicit 0 rows?'],
  },
  {
    id: 'sql-gym-streaming-funnel',
    track: 'sql',
    title: 'Subscriber engagement funnel',
    difficulty: 'Hard',
    pattern: 'Funnel conversion',
    companies: ['Netflix', 'Spotify', 'Disney+'],
    minutes: 18,
    dataset: 'streaming',
    challenge: {
      kind: 'challenge',
      id: 'sql-gym-streaming-funnel',
      lang: 'sql',
      title: 'Subscriber engagement funnel',
      prompt: `Build a 4-step funnel where **each step is a subset of the previous one**:

1. \`subscribed\` — every row of \`subscriptions\`
2. \`watched anything\` — subscribers with at least one view
3. \`watched 4+ shows\` — of those, users with 4 or more **distinct** shows
4. \`still subscribed\` — of those, users whose \`cancelled\` is NULL

Return \`step\`, \`stage\`, \`users\`, \`pct_of_prev\` (users ÷ previous step × 100, rounded to 1; NULL for step 1). Order by \`step\`.`,
      starter: `WITH steps AS (
  SELECT 1 AS step, 'subscribed' AS stage, COUNT(*) AS users FROM subscriptions
  UNION ALL
  SELECT 2, 'watched anything', COUNT(DISTINCT user_id) FROM views
  UNION ALL
  SELECT 3, 'watched 4+ shows', COUNT(*) FROM (
    SELECT user_id FROM views GROUP BY user_id HAVING COUNT(DISTINCT show_id) >= 4)
  UNION ALL
  SELECT 4, 'still subscribed', COUNT(*) FROM subscriptions WHERE cancelled IS NULL
)
SELECT step, stage, users,
       ROUND(100.0 * users / LAG(users) OVER (ORDER BY step), 1) AS pct_of_prev
FROM steps
ORDER BY step;`,
      hints: [
        'The starter\'s step 4 counts every active subscriber (5) — the same as step 3, so it reports 100%. A funnel step may only count users who passed the previous step.',
        'Restrict step 4 to the step-3 users: `… WHERE cancelled IS NULL AND user_id IN (SELECT user_id FROM views GROUP BY user_id HAVING COUNT(DISTINCT show_id) >= 4)`.',
        'Cleaner: put the step-3 user list in its own CTE and reuse it in both steps.',
      ],
      solution: `WITH engaged AS (
  SELECT user_id FROM views
  GROUP BY user_id
  HAVING COUNT(DISTINCT show_id) >= 4
),
steps AS (
  SELECT 1 AS step, 'subscribed' AS stage, COUNT(*) AS users FROM subscriptions
  UNION ALL
  SELECT 2, 'watched anything', COUNT(*) FROM subscriptions
   WHERE user_id IN (SELECT user_id FROM views)
  UNION ALL
  SELECT 3, 'watched 4+ shows', COUNT(*) FROM subscriptions
   WHERE user_id IN (SELECT user_id FROM engaged)
  UNION ALL
  SELECT 4, 'still subscribed', COUNT(*) FROM subscriptions
   WHERE cancelled IS NULL AND user_id IN (SELECT user_id FROM engaged)
)
SELECT step, stage, users,
       ROUND(100.0 * users / LAG(users) OVER (ORDER BY step), 1) AS pct_of_prev
FROM steps
ORDER BY step;`,
      explain: '7 → 7 → 5 → 3 users: 100%, 71.4%, 60%. The starter\'s step 4 ignored the funnel order and reported 100% — a funnel only makes sense when each stage filters the one before it. Anchoring every step on `subscriptions` also protects you from viewers who never subscribed.',
      sql: { ordered: true },
    },
    followups: ['Add `pct_of_top` (share of the first step) with `FIRST_VALUE(users) OVER (ORDER BY step)`.', 'Make it time-bound: step 2 only counts views within 14 days of `started`. Where does that condition go?'],
  },
];
