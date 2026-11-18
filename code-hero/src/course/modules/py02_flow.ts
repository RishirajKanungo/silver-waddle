import type { Module } from '../types';

export const module: Module = {
  id: 'py02',
  track: 'python',
  order: 2,
  title: 'Control Flow & Loops',
  icon: '🔁',
  level: 'Foundations',
  blurb: 'Decisions and repetition: watch the loop variable move, and learn the accumulator pattern behind most interview answers.',
  boss: ['py-gym-second-largest', 'py-gym-first-unique-char'],
  lessons: [
    {
      id: 'py02-l1',
      track: 'python',
      title: 'Decisions & the for loop',
      summary: 'if/elif/else, truthiness, and for + range — with the loop index drawn as a moving arrow.',
      minutes: 15,
      faang: 'Every coding screen is built from branches and loops. Interviewers watch for clean `if/elif` ordering (most specific first), Pythonic truthiness checks (`if not items:`), and correct `range` bounds — off-by-one errors are the most common bug in phone screens.',
      tags: ['Control flow', 'Truthiness', 'for loops', 'range', 'Off-by-one'],
      cells: [
        {
          kind: 'md',
          text: `Before any theory — press **Step ▶** and watch the arrow \`i\` walk along a list of bank transactions.

At each stop Python asks a **question** (\`if\`) and runs only the branch whose answer is *yes*. Keep an eye on \`deposits\` and \`withdrawals\` growing.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `amounts = [120, -40, 0, 75, -10]
deposits = 0
withdrawals = 0
for i in range(len(amounts)):
    if amounts[i] > 0:
        deposits += amounts[i]
    elif amounts[i] < 0:
        withdrawals += amounts[i]
print(deposits, withdrawals)`,
            trace: { view: 'array', var: 'amounts', pointers: ['i'] },
          },
          caption: 'At `0` neither condition is true, so **nothing** runs — an `if/elif` without `else` is allowed to do nothing.',
        },
        {
          kind: 'md',
          text: `**How \`if / elif / else\` decides:** Python checks the conditions **top to bottom** and runs the **first** branch whose condition is true. Then it skips the rest of the chain — even if later conditions are also true.

- \`if\` — always checked
- \`elif\` — checked only if everything above was false
- \`else\` — runs only if *nothing* above was true`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `score = 85
if score >= 70:
    print("C")
elif score >= 80:
    print("B")
else:
    print("F")`,
          predict: { question: 'What prints?', options: ['B', 'C', 'B and C', 'F'], answer: 1, explain: '85 ≥ 70 is true, so the **first** branch wins and the chain stops. The `elif score >= 80` line is never even checked. Fix: test the strictest condition first.' },
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'Order your elifs from most specific to least',
          text: 'Put the **narrowest** condition first (`>= 90`, then `>= 80`, then `>= 70`). It is the same reason FizzBuzz checks "divisible by 15" before 3 or 5.',
        },
        {
          kind: 'md',
          text: `**Truthiness:** \`if\` doesn't need a real \`True\`/\`False\`. Every object can be tested:

- **Falsy:** \`0\`, \`0.0\`, \`""\`, \`[]\`, \`{}\`, \`set()\`, \`None\`, \`False\`
- **Truthy:** everything else — including \`"0"\`, \`" "\` and \`[0]\`

So the Pythonic emptiness check is \`if not items:\` rather than \`if len(items) == 0:\`.`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `items = []
name = ""
count = 0
if items or name or count:
    print("something")
else:
    print("all empty")`,
          predict: { question: 'What prints?', options: ['something', 'all empty', 'Error: can\'t test a list'], answer: 1, explain: '`[]`, `""` and `0` are all falsy, so the whole `or` chain is falsy and `else` runs.' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: the empty wallet',
          text: '**Zero, nothing, or empty → False.** An empty wallet, a zero balance and a blank name all "fail the check". Anything with *something* inside — even the string `"0"` — passes.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `print(list(range(5)))
print(list(range(2, 11, 3)))
print(list(range(5, 0, -1)))`,
          note: '`range(start, stop, step)` uses the same **fence-post** rule as slicing: `start` is included, `stop` is **excluded**. A negative step counts down.',
        },
        {
          kind: 'challenge',
          id: 'py02-l1-c1',
          lang: 'python',
          title: 'Sign counter',
          prompt: 'Write `sign_counts(nums)` that returns a tuple `(positives, negatives, zeros)` counting each kind of number.',
          starter: 'def sign_counts(nums):\n    pos = neg = zero = 0\n    for n in nums:\n        if n > 0:\n            pos += 1\n        else:\n            neg += 1\n    return (pos, neg, zero)\n',
          hints: ['The starter treats 0 as negative — `else` catches *everything* that is not positive.', 'You need three branches: `if n > 0`, `elif n < 0`, `else`.', 'Inside the `else`: `zero += 1`.'],
          solution: 'def sign_counts(nums):\n    pos = neg = zero = 0\n    for n in nums:\n        if n > 0:\n            pos += 1\n        elif n < 0:\n            neg += 1\n        else:\n            zero += 1\n    return (pos, neg, zero)\n',
          explain: '`else` is a catch-all: it gets every case you didn\'t name. When there are three outcomes, name two with `if/elif` and let `else` take the last.',
          py: { tests: ['sign_counts([1, -2, 0, 3])', 'sign_counts([])', 'sign_counts([-1, -1])', 'sign_counts([0, 0, 0])'] },
          trace: { view: 'heap' },
        },
        {
          kind: 'challenge',
          id: 'py02-l1-c2',
          lang: 'python',
          title: 'Largest without max()',
          prompt: 'Write `largest(nums)` that returns the biggest number **without using `max()`**. Return `None` for an empty list.',
          starter: 'def largest(nums):\n    best = 0\n    for i in range(len(nums)):\n        if nums[i] > best:\n            best = nums[i]\n    return best\n',
          hints: ['Try `largest([-5, -2, -9])` with the starter: why does it say 0?', 'Start `best` at the **first element**, not at 0 — and handle the empty list first with `if not nums: return None`.', 'Then loop `for i in range(1, len(nums))` comparing `nums[i] > best`.'],
          solution: 'def largest(nums):\n    if not nums:\n        return None\n    best = nums[0]\n    for i in range(1, len(nums)):\n        if nums[i] > best:\n            best = nums[i]\n    return best\n',
          explain: 'Seeding "best so far" with 0 silently assumes the data is positive. Seeding it with the first element works for any data — a classic interview edge case (all negatives, empty input).',
          py: { tests: ['largest([3, 8, 1])', 'largest([-5, -2, -9])', 'largest([])', 'largest([7])', 'largest([4, 4, 4])'], mustInclude: ['for'] },
          trace: { view: 'array', var: 'nums', pointers: ['i'] },
        },
        { kind: 'quiz', id: 'py02-l1-q1', q: 'Which of these values is **falsy**?', options: ['`"0"`', '`[0]`', '`0.0`', '`" "`'], answer: 2, explain: '`0.0` is a zero number → falsy. `"0"` and `" "` are non-empty strings, `[0]` is a non-empty list → all truthy.' },
        { kind: 'recall', prompt: 'Which numbers does `range(1, 10, 3)` produce? Say them before revealing.', answer: '1, 4, 7 — start at 1, add 3 each time, stop **before** 10.' },
        { kind: 'explain', id: 'py02-l1-e1', prompt: 'Why does `if score >= 70 … elif score >= 80` give a B-student a C? Explain how Python walks an if/elif chain.' },
      ],
      cards: [
        { id: 'py02-l1-k1', kind: 'predict', code: 'print(list(range(1, 10, 4)))', options: ['[1, 5, 9]', '[1, 5]', '[1, 4, 7, 10]', '[4, 8]'], answer: 0 },
        { id: 'py02-l1-k2', kind: 'predict', code: 'print(bool("False"), bool([]))', options: ['False False', 'True False', 'True True', 'False True'], answer: 1 },
        { id: 'py02-l1-k3', kind: 'concept', front: 'In an if/elif/else chain, how many branches can run?', back: 'At most ONE — the first whose condition is true (or else if none is).' },
        { id: 'py02-l1-k4', kind: 'cloze', text: '`range(start, stop)` includes `start` and excludes {{}}.', answers: ['stop'] },
        { id: 'py02-l1-k5', kind: 'concept', front: 'Pythonic way to check that a list `xs` is empty?', back: '`if not xs:` — empty containers are falsy.' },
      ],
    },
    {
      id: 'py02-l2',
      track: 'python',
      title: 'while loops, invariants, break & continue',
      summary: 'Loop until something changes, prove your loop is right with an invariant, and steer it with break/continue/else.',
      minutes: 16,
      faang: 'Two-pointer and binary-search questions (very common in Google/Meta-style loops) are `while` loops whose correctness rests on an **invariant**. Saying the invariant out loud ("everything left of `lo` is already done") is exactly the reasoning interviewers want to hear.',
      tags: ['while loops', 'Loop invariants', 'break/continue', 'Two pointers'],
      cells: [
        {
          kind: 'md',
          text: `A \`for\` loop walks over items you already have. A \`while\` loop keeps going **until a condition stops being true** — useful when you don't know the number of steps in advance.

Step through this two-pointer reversal. Watch \`lo\` and \`hi\` close in from both ends.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `nums = [1, 2, 3, 4, 5, 6]
lo = 0
hi = len(nums) - 1
while lo < hi:
    nums[lo], nums[hi] = nums[hi], nums[lo]
    lo += 1
    hi -= 1
print(nums)`,
            trace: { view: 'array', var: 'nums', pointers: ['lo', 'hi'] },
          },
          caption: 'Pause at any step: every cell **left of `lo`** and **right of `hi`** is already in its final place. That sentence is the loop **invariant**.',
        },
        {
          kind: 'md',
          text: `A **loop invariant** is a fact that is true **before every iteration**. To trust a loop, check three things:

- **Start:** is it true before the first iteration? (nothing swapped yet → trivially yes)
- **Keep:** does one iteration keep it true *and make progress*? (one swap, both pointers move)
- **End:** when the loop stops, does *invariant + exit condition* give the answer? (\`lo >= hi\` → whole list done)`,
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: the treadmill',
          text: 'A `while` loop is a **treadmill** — it only stops if something carries you toward the exit. Before running one, point at the line that **changes the condition** (`lo += 1`). No such line → infinite loop.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `n = 10
steps = 0
while n != 1:
    if n % 2 == 0:
        n = n // 2
    else:
        n = 3 * n + 1
    steps += 1
print(steps)`,
          predict: { question: 'How many steps until `n` reaches 1?', options: ['5', '6', '7', 'It loops forever'], answer: 1, explain: '10 → 5 → 16 → 8 → 4 → 2 → 1: six changes of `n`, so six iterations.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'md',
          text: `Three tools to steer any loop:

- \`break\` — leave the loop **right now**
- \`continue\` — skip the rest of this iteration, jump to the next one
- \`else\` on a loop — runs only if the loop finished **without** hitting \`break\` ("search failed")`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `for n in [3, 7, 9]:
    if n % 2 == 0:
        print("first even:", n)
        break
else:
    print("no evens")`,
          predict: { question: 'What prints?', options: ['nothing', 'no evens', 'first even: 9', 'Error: else needs an if'], answer: 1, explain: 'No number is even, so `break` never runs. The loop ends normally → its `else` block runs. Read loop-`else` as **"no break"**.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'code',
          lang: 'python',
          code: `total = 0
for x in [5, -2, 8, -1, 3]:
    if x < 0:
        continue
    total += x
print(total)`,
          note: '`continue` skips the negatives: only 5 + 8 + 3 are added → 16.',
        },
        {
          kind: 'challenge',
          id: 'py02-l2-c1',
          lang: 'python',
          title: 'Years to savings goal',
          prompt: 'Write `years_to_goal(balance, rate_pct, goal)`. Each year the balance grows to `balance * (100 + rate_pct) // 100` (whole currency units). Return how many years until `balance >= goal`. If the balance can **never** grow (the new balance is not bigger than the old one), return `-1` instead of looping forever.',
          starter: 'def years_to_goal(balance, rate_pct, goal):\n    years = 0\n    # loop while the goal is not reached yet\n    return years\n',
          hints: ['Use `while balance < goal:` — you don\'t know the number of years in advance.', 'Inside: compute `new = balance * (100 + rate_pct) // 100`. If `new <= balance`, the loop would never progress → `return -1`.', 'Otherwise set `balance = new` and `years += 1`. After the loop, `return years`.'],
          solution: 'def years_to_goal(balance, rate_pct, goal):\n    years = 0\n    while balance < goal:\n        new = balance * (100 + rate_pct) // 100\n        if new <= balance:\n            return -1\n        balance = new\n        years += 1\n    return years\n',
          explain: 'The "progress" check is the invariant thinking in action: every iteration must move toward the exit. With floor division, 5 × 110 // 100 is still 5 — a real infinite-loop bug that the guard catches.',
          py: { tests: ['years_to_goal(1000, 10, 1500)', 'years_to_goal(1500, 10, 1000)', 'years_to_goal(100, 0, 200)', 'years_to_goal(5, 10, 100)', 'years_to_goal(1, 100, 8)'] },
          trace: { view: 'heap' },
        },
        {
          kind: 'challenge',
          id: 'py02-l2-c2',
          lang: 'python',
          title: 'First overdraft',
          prompt: 'An account starts with `start`. Apply the transactions in `txns` in order. Return the **index** of the first transaction that makes the balance go **below 0**, or `-1` if it never does. (A balance of exactly 0 is fine.)',
          starter: 'def first_overdraft(start, txns):\n    for i in range(len(txns)):\n        if txns[i] < 0:\n            return i\n    return -1\n',
          hints: ['The starter returns the first *withdrawal*, not the first *overdraft*. You need a running balance.', 'Keep `balance = start`, add each transaction, then check `if balance < 0: return i` (that `return` acts like a `break`).'],
          solution: 'def first_overdraft(start, txns):\n    balance = start\n    for i in range(len(txns)):\n        balance += txns[i]\n        if balance < 0:\n            return i\n    return -1\n',
          explain: 'Accumulate, then test — in that order. Returning from inside the loop is the cleanest "stop at the first match" (an early exit, like `break`).',
          py: { tests: ['first_overdraft(100, [-30, -50, -40, 20])', 'first_overdraft(0, [])', 'first_overdraft(10, [5, -15, -1])', 'first_overdraft(0, [-1])', 'first_overdraft(50, [-50, 10])'] },
          trace: { view: 'array', var: 'txns', pointers: ['i'] },
        },
        { kind: 'quiz', id: 'py02-l2-q1', q: 'When does the `else` block of a `for` loop run?', options: ['Only when the loop ran zero times', 'Whenever the loop ends without hitting `break`', 'Whenever `break` runs', 'After every iteration'], answer: 1, explain: 'Loop-`else` means "no break happened". (A loop over an empty list also runs it — because no break happened.)' },
        { kind: 'recall', prompt: 'Name the three checks that prove a loop invariant makes your loop correct.', answer: '**Start** (true before the first iteration), **Keep** (each iteration keeps it true and makes progress), **End** (invariant + exit condition ⇒ the answer).' },
        { kind: 'explain', id: 'py02-l2-e1', prompt: 'State the invariant of the two-pointer list reversal in one sentence, and explain why the loop must stop.' },
      ],
      cards: [
        { id: 'py02-l2-k1', kind: 'predict', code: 'i = 0\nwhile i < 10:\n    i += 3\nprint(i)', options: ['9', '10', '12', '3'], answer: 2 },
        { id: 'py02-l2-k2', kind: 'predict', code: 'out = []\nfor c in "a1b2":\n    if c.isdigit():\n        continue\n    out.append(c)\nprint("".join(out))', options: ['a1b2', 'ab', '12', 'a'], answer: 1 },
        { id: 'py02-l2-k3', kind: 'cloze', text: "A `for` loop's `else` block runs only if the loop ends without {{}}.", answers: ['break'] },
        { id: 'py02-l2-k4', kind: 'concept', front: 'What is a loop invariant?', back: 'A fact that is true before every iteration of a loop; together with the exit condition it proves the result.' },
        { id: 'py02-l2-k5', kind: 'concept', front: 'Difference between `break` and `continue`?', back: '`break` leaves the loop entirely; `continue` skips to the next iteration.' },
      ],
    },
    {
      id: 'py02-l3',
      track: 'python',
      title: 'enumerate, zip, nested loops & accumulators',
      summary: 'Pythonic iteration, the n×m cost of nested loops, and the accumulator pattern behind most answers.',
      minutes: 16,
      faang: 'Interviewers notice `for i in range(len(xs))` vs `enumerate` — it signals fluency. Nested loops are the brute-force O(n²) answer you state first, then improve with a hash map; and nearly every solution is an accumulator (sum, count, best-so-far, result list).',
      tags: ['enumerate', 'zip', 'Nested loops', 'Accumulator pattern', 'Big-O'],
      cells: [
        {
          kind: 'md',
          text: `Two helpers make loops cleaner:

- \`enumerate(xs)\` gives **(index, item)** pairs — no more \`range(len(xs))\`
- \`zip(a, b)\` walks two lists **side by side**, giving \`(a[i], b[i])\` pairs

Watch both at once — and notice \`best\` and \`best_name\` only change when a bigger score shows up.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `names = ["ana", "bo", "cy"]
scores = [88, 92, 75]
best_name = ""
best = -1
for i, (name, s) in enumerate(zip(names, scores)):
    if s > best:
        best, best_name = s, name
print(best_name, best)`,
            trace: { view: 'array', var: 'scores', pointers: ['i'] },
          },
          caption: '`enumerate(zip(...))` yields `(0, ("ana", 88))`, `(1, ("bo", 92))`, … — the parentheses in `i, (name, s)` unpack the inner pair.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `print(list(zip([1, 2, 3], "ab")))`,
          predict: { question: 'What prints?', options: ["[(1, 'a'), (2, 'b')]", "[(1, 'a'), (2, 'b'), (3, None)]", 'Error: lengths differ', "[1, 'a', 2, 'b']"], answer: 0, explain: '`zip` stops at the **shortest** input. The 3 has no partner, so it is silently dropped — a classic source of lost rows.' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: a zipper',
          text: '`zip` is a **zipper**: teeth from each side lock together in pairs, and the zipper ends where the **shorter** side ends.',
        },
        {
          kind: 'md',
          text: `**The accumulator pattern** — most loop answers have the same three steps:

1. **Start** an accumulator: \`total = 0\`, \`count = 0\`, \`out = []\`, \`seen = {}\`, \`best = xs[0]\`
2. **Update** it once per item
3. **Return** it after the loop

Choose the start value carefully: 0 for sums, 1 for products, the first item for "best so far".`,
        },
        {
          kind: 'md',
          text: `**Nested loops:** the inner loop runs **completely** for each step of the outer loop. Outer 3 × inner 3 = 9 steps. Step through and watch the grid fill row by row.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `grid = []
for r in range(1, 4):
    row = []
    for c in range(1, 4):
        row.append(r * c)
    grid.append(row)
print(grid)`,
            trace: { view: 'grid', var: 'grid' },
          },
          caption: 'A multiplication table: `c` sweeps 1→3 for **every** value of `r`.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `nums = [1, 2, 3, 4]
count = 0
for i in range(len(nums)):
    for j in range(i + 1, len(nums)):
        count += 1
print(count)`,
          predict: { question: 'How many (i, j) pairs are counted?', options: ['16', '6', '12', '4'], answer: 1, explain: '`j` always starts **after** `i`, so each unordered pair is counted once: 3 + 2 + 1 + 0 = 6 (= n·(n−1)/2).' },
          trace: { view: 'array', var: 'nums', pointers: ['i', 'j'] },
        },
        {
          kind: 'callout',
          tone: 'interview',
          title: 'How this is asked',
          text: 'Pair problems (two-sum, duplicates, closest pair) all have a nested-loop **O(n²)** brute force. Say it first, give its complexity, then improve it — usually with a dict or set (next module). Interviewers reward that progression.',
        },
        {
          kind: 'challenge',
          id: 'py02-l3-c1',
          lang: 'python',
          title: 'Count target pairs',
          prompt: 'Write `pair_sums(nums, target)` that counts pairs of **different positions** `i < j` with `nums[i] + nums[j] == target`.',
          starter: 'def pair_sums(nums, target):\n    count = 0\n    for i in range(len(nums)):\n        for j in range(len(nums)):\n            if nums[i] + nums[j] == target:\n                count += 1\n    return count\n',
          hints: ['The starter counts each pair twice — and even pairs an element with itself.', 'Start the inner loop **after** `i`: `for j in range(i + 1, len(nums)):`'],
          solution: 'def pair_sums(nums, target):\n    count = 0\n    for i in range(len(nums)):\n        for j in range(i + 1, len(nums)):\n            if nums[i] + nums[j] == target:\n                count += 1\n    return count\n',
          explain: '`range(i + 1, n)` is the standard trick for "each unordered pair once". It is O(n²) — fine for small inputs, and the baseline you\'ll beat with hashing.',
          py: { tests: ['pair_sums([1, 2, 3, 4], 5)', 'pair_sums([], 3)', 'pair_sums([2, 2, 2], 4)', 'pair_sums([-1, 1, 0], 0)', 'pair_sums([5], 10)'] },
          trace: { view: 'array', var: 'nums', pointers: ['i', 'j'] },
        },
        {
          kind: 'challenge',
          id: 'py02-l3-c2',
          lang: 'python',
          title: 'Running balance',
          prompt: 'Write `running_totals(amounts)` that returns a list where element `k` is the sum of `amounts[0..k]` — the balance after each transaction.',
          starter: 'def running_totals(amounts):\n    total = 0\n    for a in amounts:\n        total += a\n    return [total]\n',
          hints: ['You need **two** accumulators: the running `total` and the `out` list.', 'After `total += a`, do `out.append(total)`; return `out`.'],
          solution: 'def running_totals(amounts):\n    total = 0\n    out = []\n    for a in amounts:\n        total += a\n        out.append(total)\n    return out\n',
          explain: 'This is a running SUM — the Python twin of `SUM(amount) OVER (ORDER BY ts)` in SQL. Two accumulators side by side is a very common shape.',
          py: { tests: ['running_totals([100, -30, 20])', 'running_totals([])', 'running_totals([-5, -5])', 'running_totals([0])'] },
          trace: { view: 'heap' },
        },
        { kind: 'quiz', id: 'py02-l3-q1', q: 'An outer loop runs `n` times and the inner loop runs `n` times for each. Roughly how many inner steps?', options: ['n', '2n', 'n²', 'log n'], answer: 2, explain: 'n iterations × n iterations = n² — quadratic. Doubling the input quadruples the work.' },
        { kind: 'recall', prompt: 'What are the three steps of the accumulator pattern?', answer: '**Start** the accumulator (0, [], {}, first item…), **update** it once per item, **return** it after the loop.' },
        { kind: 'explain', id: 'py02-l3-e1', prompt: 'Why is `for i, x in enumerate(xs)` preferred over `for i in range(len(xs))`? When might you still need `range`?' },
      ],
      cards: [
        { id: 'py02-l3-k1', kind: 'predict', code: 'for i, ch in enumerate("hey", start=1):\n    print(i, ch, end=" ")', options: ['0 h 1 e 2 y', '1 h 2 e 3 y', 'h e y', '1 2 3'], answer: 1 },
        { id: 'py02-l3-k2', kind: 'predict', code: 'print(dict(zip("abc", [1, 2, 3])))', options: ["{'a': 1, 'b': 2, 'c': 3}", "[('a', 1), ('b', 2), ('c', 3)]", "{'abc': [1, 2, 3]}", 'Error'], answer: 0 },
        { id: 'py02-l3-k3', kind: 'concept', front: 'What does `zip` do when the inputs have different lengths?', back: 'It stops at the shortest input — extra items are silently dropped.' },
        { id: 'py02-l3-k4', kind: 'cloze', text: 'To visit each unordered pair once: `for j in range({{}}, len(xs))`.', answers: ['i + 1'] },
        { id: 'py02-l3-k5', kind: 'concept', front: 'Good starting value for a "best so far" accumulator?', back: 'The first element (after checking the list is non-empty) — not 0, which breaks on negative data.' },
      ],
    },
  ],
};
