import type { Module } from '../types';

export const module: Module = {
  id: 'py07',
  track: 'python',
  order: 7,
  title: 'Algorithms & Big-O',
  icon: '⚡',
  level: 'Interview',
  blurb: 'Count the steps, then cut them: binary search, sorting, two pointers, sliding windows, dynamic programming and BFS on grids.',
  boss: ['py-gym-search-range', 'py-gym-longest-substring', 'py-gym-coin-change'],
  lessons: [
    // ─────────────────────────────────────────────────────────────── L1
    {
      id: 'py07-l1',
      track: 'python',
      title: 'Big-O & binary search',
      summary: 'Feel how step counts grow, then meet the O(log n) hero: halving a sorted list until the answer is cornered.',
      minutes: 18,
      faang: 'Every Google/Meta/Amazon-style coding round ends with "what is the time and space complexity?" — and a brute force followed by a better Big-O is the expected arc. Binary search (and its off-by-one traps) is a favourite way to test precision.',
      tags: ['Big-O', 'Complexity', 'Binary search', 'bisect', 'Off-by-one'],
      cells: [
        {
          kind: 'md',
          text: `**Big-O** answers one question: *when the input gets bigger, how fast does the work grow?* We ignore constants and keep the dominant term — \`3n² + 5n + 2\` is just **O(n²)**.

Start the race below and watch which curves explode as **n** grows. That gap is why a 2-second O(n log n) solution beats an O(n²) one that would take hours on a million rows.`,
        },
        { kind: 'viz', viz: { type: 'bigo' }, caption: 'O(1) and O(log n) hug the floor. O(n) is a straight line. O(n²) and O(2ⁿ) leave the chart almost immediately.' },
        {
          kind: 'code',
          lang: 'python',
          code: `n = 4
ops = 0
for i in range(n):
    for j in range(n):
        ops += 1
print(ops)`,
          predict: { question: 'Count the operations. What prints?', options: ['4', '8', '16', '64'], answer: 2, explain: 'A loop inside a loop: n × n = 16. Double n to 8 and you get 64 — **4×** the work. That is the signature of O(n²).' },
        },
        {
          kind: 'code',
          lang: 'python',
          code: `n = 1024
steps = 0
while n > 1:
    n //= 2
    steps += 1
print(steps)`,
          predict: { question: 'Halve 1024 until it reaches 1. How many steps?', options: ['512', '100', '10', '32'], answer: 2, explain: '1024 = 2¹⁰, so it takes 10 halvings. A million needs only ~20 and a billion ~30. Anything that **halves the problem each step is O(log n)**.' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: the complexity ladder',
          text: '**1 < log n < n < n log n < n² < 2ⁿ**. What happens when the input **doubles**? O(1): same. O(log n): **+1 step**. O(n): 2×. O(n log n): a bit more than 2×. O(n²): **4×**. O(2ⁿ): squared — hopeless.',
        },
        {
          kind: 'md',
          text: `**Binary search** finds a value in a **sorted** list by halving. Keep two pointers \`lo\` and \`hi\` around the part that could still contain the target:

1. look at the middle \`mid = (lo + hi) // 2\`
2. too small → the answer is to the right: \`lo = mid + 1\`
3. too big → it is to the left: \`hi = mid - 1\`

Watch the window shrink.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `nums = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]
target = 23
lo, hi = 0, len(nums) - 1
while lo <= hi:
    mid = (lo + hi) // 2
    if nums[mid] == target:
        print("found at", mid)
        break
    elif nums[mid] < target:
        lo = mid + 1
    else:
        hi = mid - 1`,
            trace: { view: 'array', var: 'nums', pointers: ['lo', 'mid', 'hi'], speed: 900 },
          },
          caption: '10 items, found in 2 looks. A linear scan would need 6. With a million items: ~20 looks vs up to a million.',
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'Off-by-one traps',
          text: 'Pick **one** template and never mix: the closed window `[lo, hi]` uses `while lo <= hi`, `lo = mid + 1`, `hi = mid - 1`. Mixing `while lo < hi` with `hi = mid - 1` skips answers; `lo = mid` (instead of `mid + 1`) can loop forever when `hi = lo + 1`. Always test a 1-element and a 2-element list.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `from bisect import bisect_left, bisect_right

scores = [10, 20, 20, 20, 30]
print(bisect_left(scores, 20), bisect_right(scores, 20))`,
          predict: { question: '`bisect_left` gives the first index where 20 could go, `bisect_right` the index just after the last 20. What prints?', options: ['1 3', '1 4', '2 3', '0 4'], answer: 1, explain: 'The 20s occupy indices 1, 2, 3. So left = 1 and right = 4, and `right - left = 3` counts them — in O(log n).' },
        },
        {
          kind: 'challenge',
          id: 'py07-l1-c1',
          lang: 'python',
          title: 'Binary search by hand',
          prompt: 'Write `binary_search(nums, target)` that returns the index of `target` in the sorted list `nums` (all values distinct), or `-1` if it is absent. Use a `while` loop with `lo` / `hi` — no `.index`, no `bisect`.',
          starter: `def binary_search(nums, target):
    return nums.index(target)
`,
          hints: [
            '`.index` is O(n) and raises `ValueError` when the value is missing. Start with `lo, hi = 0, len(nums) - 1`.',
            'Loop `while lo <= hi:`, compute `mid = (lo + hi) // 2`, compare `nums[mid]` with `target`.',
            'Move `lo = mid + 1` or `hi = mid - 1`. If the loop ends, return `-1`.',
          ],
          solution: `def binary_search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        elif nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
`,
          explain: 'Each loop halves the window `[lo, hi]`, so at most ~log₂(n) + 1 loops: O(log n) time, O(1) space. The empty list works automatically because `hi = -1 < lo`.',
          py: {
            tests: ['binary_search([1, 3, 5, 7, 9], 7)', 'binary_search([1, 3, 5, 7, 9], 4)', 'binary_search([], 3)', 'binary_search([5], 5)', 'binary_search([1, 3, 5, 7, 9], 1)', 'binary_search([1, 3, 5, 7, 9], 9)'],
            mustInclude: ['while'],
          },
          trace: { view: 'array', var: 'nums', pointers: ['lo', 'mid', 'hi'] },
        },
        {
          kind: 'challenge',
          id: 'py07-l1-c2',
          lang: 'python',
          title: 'Binary search on the answer: integer square root',
          prompt: 'Write `floor_sqrt(n)` returning the largest integer `r` with `r * r <= n` (for `n >= 0`). Don\'t use `** 0.5` or `math` — binary-search the **answer** between 0 and n.',
          starter: `def floor_sqrt(n):
    return n // 2
`,
          hints: [
            'The candidates 0, 1, 2, … n are "sorted" by whether `r * r <= n`: a run of yes then a run of no. Find the last yes.',
            'Keep `lo, hi = 0, n` and a variable `ans = 0`. If `mid * mid <= n`, record `ans = mid` and search right (`lo = mid + 1`).',
            'Otherwise search left: `hi = mid - 1`. Return `ans`.',
          ],
          solution: `def floor_sqrt(n):
    lo, hi = 0, n
    ans = 0
    while lo <= hi:
        mid = (lo + hi) // 2
        if mid * mid <= n:
            ans = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return ans
`,
          explain: '"Binary search on the answer" works whenever a yes/no test flips only once as the candidate grows. It powers many Medium/Hard problems (minimum capacity, Koko eating bananas, split array).',
          py: { tests: ['floor_sqrt(0)', 'floor_sqrt(1)', 'floor_sqrt(8)', 'floor_sqrt(16)', 'floor_sqrt(2147395599)'], mustInclude: ['while'] },
        },
        {
          kind: 'quiz',
          id: 'py07-l1-q1',
          q: 'An algorithm takes 1 second on 1,000 rows. Roughly how long on 2,000 rows if it is **O(n²)**?',
          options: ['1 second', '2 seconds', '4 seconds', '1,000 seconds'],
          answer: 2,
          explain: 'Doubling n multiplies n² by 4. An O(n) algorithm would take 2 seconds, an O(log n) one barely longer than 1.',
        },
        { kind: 'recall', prompt: 'What two conditions does binary search need, and what is its complexity?', answer: 'The data must be **sorted** (or the yes/no test must flip only once) and you need **random access** by index. O(log n) time, O(1) space.' },
        { kind: 'explain', id: 'py07-l1-e1', prompt: 'Explain why halving the search space each step gives O(log n). Use the 1024 → 10 steps example.' },
      ],
      cards: [
        { id: 'py07-l1-k1', kind: 'cloze', text: 'Complexity ladder: 1 < {{}} < n < {{}} < n² < 2ⁿ', answers: ['log n', 'n log n'] },
        { id: 'py07-l1-k2', kind: 'predict', code: 'ops = 0\nfor i in range(3):\n    for j in range(i):\n        ops += 1\nprint(ops)', options: ['9', '3', '6', '0'], answer: 1 },
        { id: 'py07-l1-k3', kind: 'predict', code: 'from bisect import bisect_left\nprint(bisect_left([1, 3, 3, 5], 3))', options: ['0', '1', '2', '3'], answer: 1 },
        { id: 'py07-l1-k4', kind: 'concept', front: 'If the input doubles, how does the work change for O(log n), O(n), O(n²)?', back: 'O(log n): +1 step. O(n): 2×. O(n²): 4×.' },
        { id: 'py07-l1-k5', kind: 'concept', front: 'Binary search: loop condition and pointer updates for the closed window [lo, hi]?', back: '`while lo <= hi`, `mid = (lo + hi) // 2`, then `lo = mid + 1` or `hi = mid - 1`.' },
      ],
    },

    // ─────────────────────────────────────────────────────────────── L2
    {
      id: 'py07-l2',
      track: 'python',
      title: 'Sorting: insertion, merge & Timsort',
      summary: 'Watch bars swap in insertion sort, see merge sort split and zip, and learn why Python\'s sort is O(n log n) and stable.',
      minutes: 18,
      faang: 'You will rarely be asked to write a sort from scratch, but merge sort\'s "split and merge" is the template for many problems (merge intervals, merge k lists, count inversions), and "sort first, then scan" is one of the most common Meta/Amazon-style opening moves.',
      tags: ['Sorting', 'Insertion sort', 'Merge sort', 'Stable sort', 'Timsort', 'Divide and conquer'],
      cells: [
        {
          kind: 'md',
          text: `Watch first, name it after. Each bar is a number. The pointer \`j\` carries one bar to the left, swapping it past every bigger neighbour — like sliding a new card into the right place in your hand.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `a = [5, 2, 4, 1, 3]
for i in range(1, len(a)):
    j = i
    while j > 0 and a[j - 1] > a[j]:
        a[j - 1], a[j] = a[j], a[j - 1]
        j -= 1
print(a)`,
            trace: { view: 'bars', var: 'a', pointers: ['i', 'j'], speed: 600 },
          },
          caption: 'This is **insertion sort**. Everything left of `i` is already sorted; each round inserts `a[i]` into that sorted part.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `a = [4, 3, 2, 1]
swaps = 0
for i in range(1, len(a)):
    j = i
    while j > 0 and a[j - 1] > a[j]:
        a[j - 1], a[j] = a[j], a[j - 1]
        j -= 1
        swaps += 1
print(swaps)`,
          predict: { question: 'Worst case: the list is reversed. How many swaps?', options: ['3', '4', '6', '16'], answer: 2, explain: 'Bar i must travel i places: 1 + 2 + 3 = 6. In general n(n-1)/2 → **O(n²)**. On an already-sorted list it does 0 swaps → O(n) best case.' },
          trace: { view: 'bars', var: 'a', pointers: ['j'] },
        },
        {
          kind: 'md',
          text: `**Merge sort** is *divide and conquer*:

1. split the list in half, and keep splitting until pieces have 1 item (already sorted!)
2. **merge** pairs of sorted pieces by repeatedly taking the smaller front item

There are about **log n** levels of splitting, and each level does **n** work merging → **O(n log n)**. Watch the call tree split down and merge back up.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `def merge(left, right):
    out = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            out.append(left[i])
            i += 1
        else:
            out.append(right[j])
            j += 1
    return out + left[i:] + right[j:]

def merge_sort(a):
    if len(a) <= 1:
        return a
    mid = len(a) // 2
    return merge(merge_sort(a[:mid]), merge_sort(a[mid:]))

print(merge_sort([4, 1, 3, 2]))`,
            trace: { view: 'calltree', fn: 'merge_sort' },
          },
          caption: 'Each `merge_sort` call returns a sorted list. Leaves are 1-item lists; every parent zips its two children together.',
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: the zipper',
          text: '**Merging = a zipper** (or two teller queues sorted by ticket number): look at the two front customers, serve the smaller ticket, repeat. When one line is empty, the rest of the other line walks straight through. Merge sort = **"split until trivial, zip back up."**',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `people = [("bo", 30), ("al", 25), ("cy", 30), ("di", 25)]
by_age = sorted(people, key=lambda p: p[1])
print([name for name, age in by_age])`,
          predict: { question: 'Sort by age only. In what order do the names come out?', options: ["['al', 'di', 'bo', 'cy']", "['al', 'di', 'cy', 'bo']", "['di', 'al', 'bo', 'cy']", "['al', 'bo', 'cy', 'di']"], answer: 0, explain: 'Python\'s sort is **stable**: items with equal keys keep their original order. "al" came before "di", and "bo" before "cy".' },
        },
        {
          kind: 'callout',
          tone: 'why',
          title: 'Why Python\'s sort is O(n log n)',
          text: '`sorted()` / `list.sort()` use **Timsort**: it finds already-sorted runs, extends short runs with insertion sort (fast on tiny or nearly-sorted data), then merges runs like merge sort. Worst case **O(n log n)**, best case **O(n)** on sorted input, and **stable**. No comparison sort can beat O(n log n) in general: there are n! possible orders and each comparison only halves them.',
        },
        {
          kind: 'challenge',
          id: 'py07-l2-c1',
          lang: 'python',
          title: 'Merge two sorted lists',
          prompt: 'Write `merge(a, b)` that merges two **already sorted** lists into one sorted list in O(len(a) + len(b)). Use two index pointers and a `while` loop — no `sorted()`.',
          starter: `def merge(a, b):
    return a + b
`,
          hints: [
            'Keep `i = j = 0` and an `out` list. While both lists have items left, compare `a[i]` and `b[j]`.',
            'Append the smaller one and advance **its** pointer. Use `<=` so equal items from `a` come first (stability).',
            'After the loop one list is used up: `return out + a[i:] + b[j:]`.',
          ],
          solution: `def merge(a, b):
    out = []
    i = j = 0
    while i < len(a) and j < len(b):
        if a[i] <= b[j]:
            out.append(a[i])
            i += 1
        else:
            out.append(b[j])
            j += 1
    return out + a[i:] + b[j:]
`,
          explain: 'Each step moves one pointer forward, so the total work is the combined length: linear. This exact loop reappears in Merge Two Sorted Lists, merge intervals and external sorting.',
          py: { tests: ['merge([1, 3, 5], [2, 4, 6])', 'merge([], [1])', 'merge([], [])', 'merge([1, 2, 2], [2, 3])', 'merge([5], [1, 2, 3])'], mustInclude: ['while'] },
          trace: { view: 'array', var: 'out', pointers: ['i', 'j'] },
        },
        {
          kind: 'challenge',
          id: 'py07-l2-c2',
          lang: 'python',
          title: 'Rank customers by spend',
          prompt: 'Each row is `(name, total_spend)`. Write `rank(rows)` returning the names sorted by **spend, highest first**; ties broken by **name A→Z**.',
          starter: `def rank(rows):
    return [name for name, spend in sorted(rows)]
`,
          hints: [
            'Use `sorted(rows, key=...)`. A key can be a **tuple**: Python compares the first item, then the second on ties.',
            'To sort spend descending but name ascending, negate the number: `key=lambda r: (-r[1], r[0])`.',
          ],
          solution: `def rank(rows):
    return [name for name, spend in sorted(rows, key=lambda r: (-r[1], r[0]))]
`,
          explain: 'Tuple keys + negation is the Python equivalent of SQL\'s `ORDER BY spend DESC, name ASC`. (For strings you cannot negate — then sort twice using stability, least important key first.)',
          py: { tests: ['rank([("cy", 50), ("al", 20), ("bo", 90)])', 'rank([("amy", 5), ("cat", 70), ("bob", 70)])', 'rank([])', 'rank([("zed", 1)])', 'rank([("b", 10), ("a", 10), ("c", 10)])'] },
        },
        {
          kind: 'quiz',
          id: 'py07-l2-q1',
          q: 'Which statement about merge sort is **true**?',
          options: ['It is O(n²) in the worst case', 'It is O(n log n) in every case but needs O(n) extra memory', 'It sorts in place with O(1) memory', 'It is fastest on reversed input'],
          answer: 1,
          explain: 'Merge sort always does log n levels × n work, but merging builds new lists, so it uses O(n) extra space. Quicksort is in place but O(n²) in its worst case.',
        },
        { kind: 'recall', prompt: 'Give the best and worst-case time of insertion sort and merge sort, and say which one Python borrows from for tiny runs.', answer: 'Insertion: best O(n) (sorted), worst O(n²). Merge: O(n log n) always. Timsort uses insertion sort on small runs and merges them like merge sort.' },
        { kind: 'explain', id: 'py07-l2-e1', prompt: 'Explain where the "log n" and the "n" in merge sort\'s O(n log n) come from.' },
      ],
      cards: [
        { id: 'py07-l2-k1', kind: 'concept', front: 'Merge sort: time and extra space?', back: 'O(n log n) time in every case; O(n) extra space for the merged lists.' },
        { id: 'py07-l2-k2', kind: 'concept', front: 'What does it mean that a sort is **stable**?', back: 'Items with equal keys keep their original relative order. Python\'s `sorted` / `list.sort` are stable.' },
        { id: 'py07-l2-k3', kind: 'cloze', text: 'Sort by score descending, then name ascending: `sorted(rows, key=lambda r: ({{}}r[1], r[0]))`', answers: ['-'] },
        { id: 'py07-l2-k4', kind: 'predict', code: 'print(sorted(["b", "A", "a", "B"]))', options: ["['A', 'B', 'a', 'b']", "['a', 'A', 'b', 'B']", "['A', 'a', 'B', 'b']", "['a', 'b', 'A', 'B']"], answer: 0 },
        { id: 'py07-l2-k5', kind: 'concept', front: 'Insertion sort: best and worst case?', back: 'Best O(n) on already-sorted input; worst O(n²) on reversed input (n(n-1)/2 swaps).' },
      ],
    },

    // ─────────────────────────────────────────────────────────────── L3
    {
      id: 'py07-l3',
      track: 'python',
      title: 'Two pointers & sliding windows',
      summary: 'Replace nested loops with two indices that only move forward — pairs on sorted data, and windows over sequences.',
      minutes: 20,
      faang: 'Two pointers and sliding window are among the most frequent array/string patterns in Meta/Amazon/Google-style screens: pair sums, palindromes, longest substring, minimum window. The win is always the same: O(n²) → O(n).',
      tags: ['Two pointers', 'Sliding window', 'Arrays', 'Strings', 'O(n)'],
      cells: [
        {
          kind: 'md',
          text: `**Two pointers.** In a **sorted** list, find two numbers that add up to 10. Brute force tries every pair (O(n²)). Instead put \`left\` at the smallest and \`right\` at the largest:

- sum too small → the only way up is \`left += 1\`
- sum too big → the only way down is \`right -= 1\`

Watch the pointers squeeze in.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `nums = [1, 3, 4, 6, 8, 11]
target = 10
left, right = 0, len(nums) - 1
while left < right:
    s = nums[left] + nums[right]
    if s == target:
        print(nums[left], nums[right])
        break
    elif s < target:
        left += 1
    else:
        right -= 1`,
            trace: { view: 'array', var: 'nums', pointers: ['left', 'right'], speed: 900 },
          },
          caption: 'Each step permanently rules out one number, so it is at most n steps: **O(n)**, O(1) space.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `chars = list("bank")
i, j = 0, len(chars) - 1
while i < j:
    chars[i], chars[j] = chars[j], chars[i]
    i += 1
    j -= 1
print("".join(chars))`,
          predict: { question: 'Two pointers walking toward each other, swapping. What prints?', options: ['bank', 'knab', 'kanb', 'nkab'], answer: 1, explain: 'Swap the ends (b↔k), step inward, swap again (a↔n), and stop when the pointers meet: an in-place reverse in O(n).' },
          trace: { view: 'array', var: 'chars', pointers: ['i', 'j'] },
        },
        {
          kind: 'callout',
          tone: 'why',
          title: 'Why moving one pointer is safe',
          text: 'If `nums[left] + nums[right]` is too small, then `nums[left]` plus **anything** left of `right` is even smaller, so `nums[left]` can never be part of the answer. Throw it away. Every move is a **proof** that you skipped nothing.',
        },
        {
          kind: 'challenge',
          id: 'py07-l3-c1',
          lang: 'python',
          title: 'Squares of a sorted list',
          prompt: '`nums` is sorted but may contain negatives. Write `sorted_squares(nums)` returning the squares in sorted order in **O(n)** — no `sort`. `[-4, -1, 0, 3, 10]` → `[0, 1, 9, 16, 100]`.',
          starter: `def sorted_squares(nums):
    return [x * x for x in nums]
`,
          hints: [
            'The biggest square is at one of the **ends** (a big negative or a big positive).',
            'Put `left = 0`, `right = len(nums) - 1`, and fill an output list from the **back**.',
            'While `left <= right`: take the larger of `nums[left]**2` and `nums[right]**2`, place it at `out[k]`, move that pointer, `k -= 1`.',
          ],
          solution: `def sorted_squares(nums):
    out = [0] * len(nums)
    left, right = 0, len(nums) - 1
    k = len(nums) - 1
    while left <= right:
        a, b = nums[left] * nums[left], nums[right] * nums[right]
        if a > b:
            out[k] = a
            left += 1
        else:
            out[k] = b
            right -= 1
        k -= 1
    return out
`,
          explain: 'Sorting the squares would be O(n log n). Comparing the two ends gives the next-largest square each time, so one pass suffices.',
          py: { tests: ['sorted_squares([-4, -1, 0, 3, 10])', 'sorted_squares([])', 'sorted_squares([5])', 'sorted_squares([-3, -2, -1])', 'sorted_squares([-2, -2, 2])'], mustInclude: ['while'] },
          trace: { view: 'array', var: 'out', pointers: ['left', 'right', 'k'] },
        },
        {
          kind: 'md',
          text: `**Sliding window.** A *window* is a contiguous slice \`nums[left..right]\` that slides along the list.

- **Fixed size k** (best 3-day deposit total): add the item entering on the right, subtract the one leaving on the left — never re-sum the whole window.
- **Variable size** (longest stretch under a budget): grow \`right\` every step; **while** the window breaks the rule, shrink from \`left\`.

Each item enters once and leaves once → **O(n)**.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `deposits = [4, 2, 7, 1, 8, 3]
k = 3
window = sum(deposits[:k])
best = window
for right in range(k, len(deposits)):
    left = right - k
    window += deposits[right] - deposits[left]
    best = max(best, window)
print(best)`,
            trace: { view: 'array', var: 'deposits', pointers: ['left', 'right'], speed: 900 },
          },
          caption: 'Fixed window of 3: `right` is the day entering, `left` the day leaving. Totals go 13 → 10 → 16 → 12, and each update is O(1).',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `amounts = [2, 1, 5, 1, 1, 3]
budget = 7
left = 0
total = 0
best = 0
for right in range(len(amounts)):
    total += amounts[right]
    while total > budget:
        total -= amounts[left]
        left += 1
    best = max(best, right - left + 1)
print(best)`,
          predict: { question: 'Variable window: the longest run of consecutive transactions totalling at most 7. What prints?', options: ['2', '3', '4', '6'], answer: 1, explain: 'Windows that fit: [2, 1], [1, 5, 1], [5, 1, 1], [1, 1, 3]… the longest has 3 items. Adding a 4th always pushes the total over 7.' },
          trace: { view: 'array', var: 'amounts', pointers: ['left', 'right'] },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: the caterpillar',
          text: 'A sliding window is a **caterpillar**: the head (`right`) always stretches forward; when the body gets too heavy, the tail (`left`) scrunches up. Neither end ever moves backwards, which is why it is O(n). Window length = `right - left + 1`.',
        },
        {
          kind: 'challenge',
          id: 'py07-l3-c2',
          lang: 'python',
          title: 'Shortest run reaching a target',
          prompt: 'All numbers are positive. Write `min_len(nums, target)` returning the length of the **shortest** contiguous run whose sum is **at least** `target`, or `0` if none exists.',
          starter: `def min_len(nums, target):
    return 0
`,
          hints: [
            'Grow `right` one step at a time, adding to `total`.',
            'This time the rule is "shrink **while** the window is *good*": `while total >= target`, record `right - left + 1`, then remove `nums[left]` and `left += 1`.',
            'Start with `best = float("inf")` and return `0` if it never changed.',
          ],
          solution: `def min_len(nums, target):
    best = float("inf")
    left = 0
    total = 0
    for right in range(len(nums)):
        total += nums[right]
        while total >= target:
            best = min(best, right - left + 1)
            total -= nums[left]
            left += 1
    return 0 if best == float("inf") else best
`,
          explain: 'For "longest" windows you shrink while the window is **invalid**; for "shortest" windows you shrink while it is **valid**, recording as you go. Positive numbers guarantee that shrinking lowers the sum — with negatives, sliding window breaks (use prefix sums).',
          py: { tests: ['min_len([2, 3, 1, 2, 4, 3], 7)', 'min_len([1, 4, 4], 4)', 'min_len([1, 1, 1], 10)', 'min_len([], 5)', 'min_len([5], 5)'] },
          trace: { view: 'array', var: 'nums', pointers: ['left', 'right'] },
        },
        {
          kind: 'quiz',
          id: 'py07-l3-q1',
          q: 'The variable sliding window has a `while` loop inside a `for` loop. Why is it still **O(n)**, not O(n²)?',
          options: ['Because the inner loop usually runs only once', 'Because `left` only moves forward, so across the whole run it moves at most n times', 'Because Python optimises nested loops', 'It is actually O(n log n)'],
          answer: 1,
          explain: 'Count total pointer moves instead of loops: `right` moves n times and `left` moves at most n times — 2n in total.',
        },
        { kind: 'recall', prompt: 'When does a problem smell like two pointers, and when like a sliding window?', answer: 'Two pointers: sorted data, pairs/triples, palindromes, in-place reversal or partition. Sliding window: "longest / shortest / best **contiguous** subarray or substring" satisfying some rule.' },
        { kind: 'explain', id: 'py07-l3-e1', prompt: 'Explain the difference between shrinking "while invalid" (longest window) and "while valid" (shortest window).' },
      ],
      cards: [
        { id: 'py07-l3-k1', kind: 'cloze', text: 'Window length: `right - left + {{}}`', answers: ['1'] },
        { id: 'py07-l3-k2', kind: 'cloze', text: 'Pair sum on a sorted list: if the sum is too small, move {{}}; if too big, move {{}}.', answers: ['left', 'right'] },
        { id: 'py07-l3-k3', kind: 'concept', front: 'Why is a sliding window O(n)?', back: 'Each element enters the window once (right pointer) and leaves at most once (left pointer): at most 2n moves.' },
        { id: 'py07-l3-k4', kind: 'predict', code: 'a = [3, 1, 4, 1, 5]\nk = 2\nprint(max(sum(a[i:i + k]) for i in range(len(a) - k + 1)))', options: ['5', '6', '9', '4'], answer: 1 },
        { id: 'py07-l3-k5', kind: 'concept', front: 'When does the sliding-window "shrink while too big" trick fail?', back: 'When numbers can be negative: removing an item no longer guarantees the sum goes down. Use prefix sums + a hash map instead.' },
      ],
    },

    // ─────────────────────────────────────────────────────────────── L4
    {
      id: 'py07-l4',
      track: 'python',
      title: 'Dynamic programming: remember, don\'t redo',
      summary: 'See naive recursion repeat itself, fix it with a memo, then fill DP tables bottom-up for paths and coin change.',
      minutes: 22,
      faang: 'Dynamic programming is the topic candidates fear most, and it appears regularly in Google/Amazon-style loops (climbing stairs, house robber, coin change, longest common subsequence). Interviewers mostly want the recipe: define the state, the recurrence and the base case, then pick top-down or bottom-up.',
      tags: ['Dynamic programming', 'Memoization', 'lru_cache', 'DP table', 'Coin change', 'House robber'],
      cells: [
        {
          kind: 'md',
          text: `**Climbing stairs:** you can climb 1 or 2 steps at a time. How many ways to reach step n?

To be standing on step n, your last move came from step n−1 **or** step n−2. So:

\`ways(n) = ways(n - 1) + ways(n - 2)\`, with \`ways(1) = 1\`, \`ways(2) = 2\`.

Run the call tree and look for **repeats**.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `def ways(n):
    if n <= 2:
        return n
    return ways(n - 1) + ways(n - 2)

print(ways(5))`,
            trace: { view: 'calltree', fn: 'ways' },
          },
          caption: '`ways(3)` is computed twice, `ways(2)` three times. The tree doubles at every level → **O(2ⁿ)**.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `calls = 0

def ways(n):
    global calls
    calls += 1
    if n <= 2:
        return n
    return ways(n - 1) + ways(n - 2)

ways(10)
print(calls)`,
          predict: { question: 'How many calls does `ways(10)` make?', options: ['10', '55', '109', '1024'], answer: 2, explain: '109 calls to compute only 9 distinct answers. For n = 40 it is over 160 million calls.' },
        },
        {
          kind: 'code',
          lang: 'python',
          code: `memo = {}
calls = 0

def ways(n):
    global calls
    calls += 1
    if n <= 2:
        return n
    if n in memo:
        return memo[n]
    memo[n] = ways(n - 1) + ways(n - 2)
    return memo[n]

print(ways(10), calls)`,
          predict: { question: 'Same function plus a **memo** dict: store each answer the first time, look it up afterwards. What prints?', options: ['89 109', '89 17', '89 10', '55 17'], answer: 1, explain: 'Each `ways(k)` is computed once; later requests are a dict lookup. Calls drop from 109 to 17 — O(2ⁿ) becomes **O(n)**. `@functools.lru_cache` (or `@cache`) does this for you.' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: write it on the whiteboard',
          text: 'DP = **never solve the same subproblem twice**. **Top-down** (memo): ask the big question, and write every answer on the whiteboard as you find it. **Bottom-up** (table): start from the smallest cases and fill the whiteboard in order, so every answer you need is already there.',
        },
        {
          kind: 'md',
          text: `**Bottom-up on a grid.** How many paths go from the top-left to the bottom-right of a 3×4 grid, moving only right or down?

A cell can be entered from **above** or from the **left**, so:

\`dp[r][c] = dp[r - 1][c] + dp[r][c - 1]\`

The first row and first column are all 1 (only one straight path). Watch the table fill in.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `rows, cols = 3, 4
dp = [[1] * cols for _ in range(rows)]
for r in range(1, rows):
    for c in range(1, cols):
        dp[r][c] = dp[r - 1][c] + dp[r][c - 1]
print(dp[rows - 1][cols - 1])`,
            trace: { view: 'grid', var: 'dp', speed: 900 },
          },
          caption: 'Each cell is filled from two cells that are already done. 12 cells, each O(1) → **O(rows × cols)**. The answer is 10.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `coins = [1, 3, 4]
amount = 6
INF = float("inf")
dp = [0] + [INF] * amount
for a in range(1, amount + 1):
    for c in coins:
        if c <= a:
            dp[a] = min(dp[a], dp[a - c] + 1)
print(dp[amount])`,
          predict: { question: '**Coin change:** `dp[a]` = fewest coins to make amount `a`. With coins 1, 3, 4, what is `dp[6]`?', options: ['3', '2', '6', '4'], answer: 1, explain: '6 = 3 + 3, two coins. `dp[a]` tries every coin as the *last* coin: 1 + `dp[a - c]`, and keeps the minimum.' },
          trace: { view: 'array', var: 'dp', pointers: ['a'] },
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'Greedy is not DP',
          text: 'The "obvious" greedy answer — always take the biggest coin — gives 4 + 1 + 1 = **3 coins** for 6. Greedy only works for special coin systems. If the interviewer says "minimum / maximum / number of ways" and small choices interact, reach for DP and **test greedy against a counter-example**.',
        },
        {
          kind: 'challenge',
          id: 'py07-l4-c1',
          lang: 'python',
          title: 'House robber',
          prompt: '`nums[i]` is the cash in house `i`. You cannot rob two **adjacent** houses (the alarms are linked). Write `rob(nums)` returning the most cash you can take.',
          starter: `def rob(nums):
    return max(sum(nums[0::2]), sum(nums[1::2]))
`,
          hints: [
            'The starter only tries "every other house". Try `[2, 1, 1, 2]` — the best is 2 + 2 (houses 0 and 3).',
            'State: `best[i]` = most cash from houses 0..i. Either skip house i (`best[i-1]`) or rob it (`best[i-2] + nums[i]`).',
            'You only need the last two values: keep `prev2, prev1 = 0, 0` and update `prev2, prev1 = prev1, max(prev1, prev2 + x)` for each `x`.',
          ],
          solution: `def rob(nums):
    prev2, prev1 = 0, 0
    for x in nums:
        prev2, prev1 = prev1, max(prev1, prev2 + x)
    return prev1
`,
          explain: 'Recurrence `best[i] = max(best[i-1], best[i-2] + nums[i])`; since each value depends only on the previous two, the table shrinks to two variables: O(n) time, **O(1)** space.',
          py: { tests: ['rob([1, 2, 3, 1])', 'rob([2, 7, 9, 3, 1])', 'rob([])', 'rob([5])', 'rob([2, 1, 1, 2])'] },
          trace: { view: 'array', var: 'nums' },
        },
        {
          kind: 'challenge',
          id: 'py07-l4-c2',
          lang: 'python',
          title: 'Grid paths with roadblocks',
          prompt: '`grid[r][c]` is `0` (open) or `1` (blocked). Write `paths(grid)` returning the number of right/down paths from the top-left to the bottom-right that avoid blocked cells. If the start or the end is blocked, the answer is 0.',
          starter: `def paths(grid):
    rows, cols = len(grid), len(grid[0])
    dp = [[1] * cols for _ in range(rows)]
    for r in range(1, rows):
        for c in range(1, cols):
            dp[r][c] = dp[r - 1][c] + dp[r][c - 1]
    return dp[rows - 1][cols - 1]
`,
          hints: [
            'The starter ignores the roadblocks. A blocked cell has **0** paths into it.',
            'Start with `dp` full of zeros and set `dp[0][0] = 1` if the start is open.',
            'Visit every cell in order; if open, add `dp[r-1][c]` (when `r > 0`) and `dp[r][c-1]` (when `c > 0`). Skip `(0, 0)` itself.',
          ],
          solution: `def paths(grid):
    rows, cols = len(grid), len(grid[0])
    dp = [[0] * cols for _ in range(rows)]
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == 1:
                continue
            if r == 0 and c == 0:
                dp[r][c] = 1
                continue
            if r > 0:
                dp[r][c] += dp[r - 1][c]
            if c > 0:
                dp[r][c] += dp[r][c - 1]
    return dp[rows - 1][cols - 1]
`,
          explain: 'Same recurrence, plus a base case for blocked cells. Because we go row by row, left to right, the cells above and to the left are always finished before we need them — that is what "bottom-up order" means.',
          py: { tests: ['paths([[0, 0, 0], [0, 1, 0], [0, 0, 0]])', 'paths([[1]])', 'paths([[0]])', 'paths([[0, 1], [0, 0]])', 'paths([[0, 0], [1, 1], [0, 0]])'] },
          trace: { view: 'grid', var: 'dp' },
        },
        {
          kind: 'quiz',
          id: 'py07-l4-q1',
          q: 'What turns a plain recursive solution into a **dynamic programming** solution?',
          options: ['Using a loop instead of recursion', 'Overlapping subproblems whose answers are stored and reused', 'Sorting the input first', 'Choosing the largest option at each step'],
          answer: 1,
          explain: 'DP needs overlapping subproblems (the same call repeats) and optimal substructure (the answer is built from sub-answers). Storing them — memo or table — is the whole trick. The last option is greedy.',
        },
        { kind: 'recall', prompt: 'List the four steps of the DP recipe.', answer: '1) **State**: what does `dp[i]` (or `dp[r][c]`) mean? 2) **Recurrence**: how is it built from smaller states? 3) **Base cases**. 4) **Order**: memoize top-down, or fill a table bottom-up so dependencies come first.' },
        { kind: 'explain', id: 'py07-l4-e1', prompt: 'Explain top-down memoization vs bottom-up tabulation, and one advantage of each.' },
      ],
      cards: [
        { id: 'py07-l4-k1', kind: 'predict', code: 'from functools import lru_cache\n\n@lru_cache(maxsize=None)\ndef f(n):\n    return n if n < 2 else f(n - 1) + f(n - 2)\n\nprint(f(10))', options: ['34', '55', '89', '10'], answer: 1 },
        { id: 'py07-l4-k2', kind: 'cloze', text: 'Coin change: `dp[a] = min(dp[a], dp[a - c] + {{}})`, with `dp[0] = {{}}`', answers: ['1', '0'] },
        { id: 'py07-l4-k3', kind: 'concept', front: 'Naive recursive Fibonacci / climbing stairs vs memoized: time complexity?', back: 'Naive: O(2ⁿ) (the call tree doubles). Memoized or bottom-up: O(n).' },
        { id: 'py07-l4-k4', kind: 'concept', front: 'Why does greedy fail for coin change with coins [1, 3, 4] and amount 6?', back: 'Greedy takes 4 + 1 + 1 = 3 coins, but 3 + 3 = 2 coins is optimal. Locally best ≠ globally best, so you need DP.' },
        { id: 'py07-l4-k5', kind: 'cloze', text: 'Grid paths: `dp[r][c] = dp[r - 1][c] + {{}}`', answers: ['dp[r][c - 1]'] },
      ],
    },

    // ─────────────────────────────────────────────────────────────── L5
    {
      id: 'py07-l5',
      track: 'python',
      title: 'BFS shortest paths on a grid',
      summary: 'A grid is a graph in disguise: BFS spreads out ring by ring, so the first time it reaches the exit is the shortest path.',
      minutes: 20,
      faang: 'Grid BFS (shortest path in a maze, rotting oranges, walls and gates, number of islands) is one of the most common Medium patterns in Amazon/Meta/Google-style loops. Interviewers watch for bounds checks, a visited marker and correct distance bookkeeping.',
      tags: ['BFS', 'Grid', 'Shortest path', 'Multi-source BFS', 'deque'],
      cells: [
        {
          kind: 'md',
          text: `Treat every open cell of a grid as a **node**, and connect it to its 4 neighbours (up, down, left, right). Now "shortest path in a maze" is just **BFS**:

- start cell gets distance 0
- its neighbours get 1, their unvisited neighbours get 2, …

Below, \`1\` is a wall and \`dist\` starts as all \`-1\` (unvisited). Watch the numbers flood around the wall.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `from collections import deque

grid = [
    [0, 0, 0],
    [1, 1, 0],
    [0, 0, 0],
]
dist = [[-1] * 3 for _ in range(3)]
dist[0][0] = 0
q = deque([(0, 0)])
while q:
    r, c = q.popleft()
    for nr, nc in [(r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)]:
        if 0 <= nr < 3 and 0 <= nc < 3 and grid[nr][nc] == 0 and dist[nr][nc] == -1:
            dist[nr][nc] = dist[r][c] + 1
            q.append((nr, nc))
print(dist[2][0])`,
            trace: { view: 'grid', var: 'dist', speed: 700 },
          },
          caption: 'The bottom-left cell is only 2 rows down, but the wall forces a detour: distance **6**. Walls and visited cells (`dist != -1`) are never entered.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `r, c = 0, 2
rows, cols = 3, 3
nbrs = []
for dr, dc in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
    nr, nc = r + dr, c + dc
    if 0 <= nr < rows and 0 <= nc < cols:
        nbrs.append((nr, nc))
print(len(nbrs))`,
          predict: { question: 'Cell (0, 2) is the top-right corner of a 3×3 grid. How many in-bounds neighbours does it have?', options: ['4', '3', '2', '1'], answer: 2, explain: 'Up and right fall off the grid. Only down (1, 2) and left (0, 1) remain. The direction list + bounds check is the reusable core of every grid BFS.' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: spilled paint',
          text: 'BFS on a grid = **paint spilled on the start cell**. Each second it spreads one cell in all four directions, flowing around walls. The first second the paint touches the exit **is** the shortest distance — nothing can get there sooner, because everything closer was painted first.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `grid = [[1, 2], [3, 4]]
r, c = 0, 0
print(grid[r - 1][c])`,
          predict: { question: 'We step "up" from row 0 and forget the bounds check. What happens?', options: ['IndexError', '3', '1', 'None'], answer: 1, explain: '`r - 1` is `-1`, and in Python `grid[-1]` is the **last** row — no error, just a silently wrong neighbour that wraps around. Always check `0 <= nr < rows` **before** indexing.' },
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'The three grid-BFS bugs',
          text: '1) **No bounds check** — negative indices wrap around silently. 2) **Marking visited when popping** instead of when pushing — cells enter the queue many times. 3) **Using DFS** for shortest path — it finds *a* path, not the shortest. Also handle a blocked start cell.',
        },
        {
          kind: 'challenge',
          id: 'py07-l5-c1',
          lang: 'python',
          title: 'Escape the maze',
          prompt: '`grid` is a list of rows of `0` (open) and `1` (wall). Write `shortest(grid)` returning the fewest moves (up/down/left/right) from the top-left to the bottom-right cell, or `-1` if it cannot be reached. A 1×1 open grid needs 0 moves.',
          starter: `from collections import deque

def shortest(grid):
    rows, cols = len(grid), len(grid[0])
    return rows + cols - 2
`,
          hints: [
            'The starter ignores walls. If `grid[0][0] == 1`, return `-1` straight away.',
            'Make `dist = [[-1] * cols for _ in range(rows)]`, set `dist[0][0] = 0` and BFS with `q = deque([(0, 0)])`.',
            'For each popped cell try the 4 directions; push open, in-bounds cells whose `dist` is still `-1`. Return `dist[rows - 1][cols - 1]` at the end.',
          ],
          solution: `from collections import deque

def shortest(grid):
    rows, cols = len(grid), len(grid[0])
    if grid[0][0] == 1:
        return -1
    dist = [[-1] * cols for _ in range(rows)]
    dist[0][0] = 0
    q = deque([(0, 0)])
    while q:
        r, c = q.popleft()
        for dr, dc in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 0 and dist[nr][nc] == -1:
                dist[nr][nc] = dist[r][c] + 1
                q.append((nr, nc))
    return dist[rows - 1][cols - 1]
`,
          explain: 'Every cell is enqueued at most once and checks 4 neighbours: **O(rows × cols)** time and space. `dist` doubles as the visited marker, and an unreached exit is still `-1` — exactly the required answer.',
          py: {
            tests: [
              'shortest([[0, 0, 0], [1, 1, 0], [0, 0, 0]])',
              'shortest([[0]])',
              'shortest([[1]])',
              'shortest([[0, 1], [1, 0]])',
              'shortest([[0, 0, 0], [0, 0, 0]])',
            ],
          },
          trace: { view: 'grid', var: 'dist' },
        },
        {
          kind: 'md',
          text: `**Multi-source BFS.** Sometimes the spread starts from **many** cells at once — a fraud alert spreading from several flagged accounts, or every rotten orange in a crate. Put **all** the sources in the queue at distance 0 before the loop starts. The rings then grow from all of them simultaneously, and you still visit every cell once.`,
        },
        {
          kind: 'challenge',
          id: 'py07-l5-c2',
          lang: 'python',
          title: 'How long until the alert reaches everyone?',
          prompt: 'In `grid`, `2` = an account already flagged, `1` = a clean account, `0` = empty. Every minute, each flagged account flags its 4 neighbours. Write `minutes_to_flag(grid)` returning the minutes until no clean account is left, or `-1` if some can never be reached. (No clean accounts → 0.)',
          starter: `def minutes_to_flag(grid):
    return 0
`,
          hints: [
            'Scan the grid once: push every `2` as `(r, c, 0)` into a deque and count the `1`s as `clean`.',
            'BFS: when you flag a neighbouring `1`, set it to `2`, decrement `clean`, and push it with `minute + 1`. Track the largest minute seen.',
            'At the end return the largest minute if `clean == 0`, else `-1`.',
          ],
          solution: `from collections import deque

def minutes_to_flag(grid):
    rows, cols = len(grid), len(grid[0])
    q = deque()
    clean = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == 2:
                q.append((r, c, 0))
            elif grid[r][c] == 1:
                clean += 1
    last = 0
    while q:
        r, c, m = q.popleft()
        last = max(last, m)
        for dr, dc in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 1:
                grid[nr][nc] = 2
                clean -= 1
                q.append((nr, nc, m + 1))
    return last if clean == 0 else -1
`,
          explain: 'This is the classic "rotting oranges" problem. Seeding the queue with every source is what makes all spreads happen in parallel; flagging a cell when it is **pushed** prevents double counting. O(rows × cols).',
          py: {
            tests: [
              'minutes_to_flag([[2, 1, 1], [1, 1, 0], [0, 1, 1]])',
              'minutes_to_flag([[2, 1, 1], [0, 1, 1], [1, 0, 1]])',
              'minutes_to_flag([[0, 2]])',
              'minutes_to_flag([[1]])',
              'minutes_to_flag([[2, 2], [1, 1]])',
            ],
          },
          trace: { view: 'grid', var: 'grid' },
        },
        {
          kind: 'quiz',
          id: 'py07-l5-q1',
          q: 'Why does BFS find the **shortest** path in an unweighted grid, while DFS might not?',
          options: ['BFS is faster in Big-O terms', 'BFS reaches all cells at distance d before any cell at distance d + 1', 'DFS cannot handle walls', 'BFS sorts the cells by distance first'],
          answer: 1,
          explain: 'Both are O(rows × cols). The queue processes cells in order of distance, so the first visit to a cell is along a shortest path. With weighted edges you need Dijkstra (BFS + a heap).',
        },
        { kind: 'recall', prompt: 'Write the 4-direction neighbour loop with its bounds check from memory.', answer: '`for dr, dc in [(1, 0), (-1, 0), (0, 1), (0, -1)]:` → `nr, nc = r + dr, c + dc` → `if 0 <= nr < rows and 0 <= nc < cols and ...:`' },
        { kind: 'explain', id: 'py07-l5-e1', prompt: 'Explain how multi-source BFS differs from running a separate BFS from each source, and why it is faster.' },
      ],
      cards: [
        { id: 'py07-l5-k1', kind: 'predict', code: 'grid = [[1, 2], [3, 4]]\nprint(grid[-1][0])', options: ['1', '3', 'IndexError', '4'], answer: 1 },
        { id: 'py07-l5-k2', kind: 'concept', front: 'Time complexity of BFS on an R × C grid?', back: 'O(R × C): each cell is enqueued once and checks 4 neighbours.' },
        { id: 'py07-l5-k3', kind: 'cloze', text: 'Grid BFS directions: `[(1, 0), (-1, 0), (0, 1), ({{}})]`', answers: ['0, -1'] },
        { id: 'py07-l5-k4', kind: 'concept', front: 'Shortest path when edges have different weights?', back: 'Dijkstra\'s algorithm: BFS where the queue is a min-heap (`heapq`) keyed by distance so far.' },
        { id: 'py07-l5-k5', kind: 'concept', front: 'Multi-source BFS: how do you start it?', back: 'Push every source cell into the queue at distance 0 before the loop; the rings then grow from all sources at once.' },
      ],
    },
  ],
};
