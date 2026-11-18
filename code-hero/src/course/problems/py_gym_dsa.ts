import type { Problem } from '../types';

// Linked-list helpers shared by the starters and solutions so tests can compare plain Python lists.
const LL = `class ListNode:
    def __init__(self, val, next=None):
        self.val = val
        self.next = next

def from_list(vals):
    head = None
    for v in reversed(vals):
        head = ListNode(v, head)
    return head

def to_list(head):
    out = []
    while head:
        out.append(head.val)
        head = head.next
    return out`;

export const problems: Problem[] = [
  // ───────────────────────────────────────────── Easy
  {
    id: 'py-gym-reverse-linked-list',
    track: 'python',
    title: 'Reverse a linked list',
    difficulty: 'Easy',
    pattern: 'Linked List pointers',
    companies: ['Amazon', 'Microsoft', 'Meta', 'Apple'],
    minutes: 10,
    challenge: {
      kind: 'challenge',
      id: 'py-gym-reverse-linked-list',
      lang: 'python',
      title: 'Reverse a linked list',
      prompt: 'Write `reverse(head)` that reverses a singly linked list **in place** (no new nodes, no Python list) and returns the new head. `from_list` / `to_list` convert between Python lists and nodes for the tests.',
      starter: `${LL}

def reverse(head):
    # flip every next-arrow, then return the new head
    return head
`,
      hints: [
        'Use three names: `prev = None`, `cur = head`, and a bookmark `nxt` inside the loop.',
        'Loop `while cur:` — "save, flip, step, step": `nxt = cur.next`, `cur.next = prev`, `prev = cur`, `cur = nxt`.',
        'When `cur` falls off the end, `prev` is the new head: `return prev`.',
      ],
      solution: `${LL}

def reverse(head):
    prev = None
    cur = head
    while cur:
        nxt = cur.next
        cur.next = prev
        prev = cur
        cur = nxt
    return prev
`,
      explain: 'Each node\'s arrow is flipped exactly once: O(n) time, O(1) extra space. The empty list works for free (the loop never runs and `prev` is `None`).',
      py: {
        tests: [
          'to_list(reverse(from_list([1, 2, 3, 4, 5])))',
          'to_list(reverse(from_list([])))',
          'to_list(reverse(from_list([7])))',
          'to_list(reverse(from_list([1, 1, 2])))',
          'to_list(reverse(from_list([1, 2])))',
        ],
      },
      trace: { view: 'heap' },
    },
    followups: ['Now write it recursively — what is the base case, and what is the space cost?', 'Reverse only the nodes between positions m and n (Reverse Linked List II).', 'Reverse the list in groups of k.'],
  },
  {
    id: 'py-gym-valid-parentheses',
    track: 'python',
    title: 'Valid parentheses',
    difficulty: 'Easy',
    pattern: 'Stack',
    companies: ['Amazon', 'Meta', 'Google', 'Bloomberg'],
    minutes: 10,
    challenge: {
      kind: 'challenge',
      id: 'py-gym-valid-parentheses',
      lang: 'python',
      title: 'Valid parentheses',
      prompt: 'Write `is_valid(s)` for a string of `()[]{}` characters. It is valid when every bracket is closed by the **same type**, in the **right order**. The empty string is valid.',
      starter: `def is_valid(s):
    return s.count("(") == s.count(")")
`,
      hints: [
        'Counting fails on `")("` and on `"([)]"`. The most recently opened bracket must close first → a stack.',
        'Map each closer to its opener: `pairs = {")": "(", "]": "[", "}": "{"}`. Push openers.',
        'On a closer: if the stack is empty or `stack.pop() != pairs[ch]`, return `False`. At the end, return `not stack`.',
      ],
      solution: `def is_valid(s):
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    for ch in s:
        if ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
        else:
            stack.append(ch)
    return not stack
`,
      explain: 'One pass with a stack: O(n) time and space. Two easy-to-miss checks: a closer arriving with an empty stack, and leftover openers at the end.',
      py: { tests: ['is_valid("()[]{}")', 'is_valid("(]")', 'is_valid("")', 'is_valid("(")', 'is_valid(")(")', 'is_valid("([{}])")'] },
      trace: { view: 'array', var: 'stack' },
    },
    followups: ['Return the minimum number of brackets to add to make the string valid.', 'Find the length of the longest valid parentheses substring.'],
  },

  // ───────────────────────────────────────────── Medium
  {
    id: 'py-gym-search-range',
    track: 'python',
    title: 'First and last position (binary search)',
    difficulty: 'Medium',
    pattern: 'Binary Search',
    companies: ['Meta', 'Google', 'Amazon', 'LinkedIn'],
    minutes: 18,
    challenge: {
      kind: 'challenge',
      id: 'py-gym-search-range',
      lang: 'python',
      title: 'First and last position',
      prompt: '`nums` is sorted and may contain duplicates. Write `search_range(nums, target)` returning `[first_index, last_index]` of `target`, or `[-1, -1]` if it is absent — in **O(log n)**.',
      starter: `def search_range(nums, target):
    i = nums.index(target)
    return [i, i]
`,
      hints: [
        'Write one helper that finds the **first** index where `nums[i] >= x` (a lower bound) with binary search.',
        'first = lower_bound(target). If `first == len(nums)` or `nums[first] != target`, return `[-1, -1]`.',
        'last = lower_bound(target + 1) - 1. (Or use `bisect_left` / `bisect_right`.)',
      ],
      solution: `def lower_bound(nums, x):
    lo, hi = 0, len(nums)
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] < x:
            lo = mid + 1
        else:
            hi = mid
    return lo

def search_range(nums, target):
    first = lower_bound(nums, target)
    if first == len(nums) or nums[first] != target:
        return [-1, -1]
    return [first, lower_bound(nums, target + 1) - 1]
`,
      explain: 'Two O(log n) searches. Note this template uses the half-open window `[lo, hi)`: `while lo < hi`, `hi = mid` — a different but equally valid convention. Never mix the two.',
      py: {
        tests: [
          'search_range([5, 7, 7, 8, 8, 10], 8)',
          'search_range([5, 7, 7, 8, 8, 10], 6)',
          'search_range([], 0)',
          'search_range([1], 1)',
          'search_range([2, 2, 2, 2], 2)',
        ],
      },
      trace: { view: 'array', var: 'nums', pointers: ['lo', 'mid', 'hi'] },
    },
    followups: ['Search in a rotated sorted array.', 'Count how many times `target` appears in O(log n).'],
  },
  {
    id: 'py-gym-top-k-frequent',
    track: 'python',
    title: 'Top-k frequent elements',
    difficulty: 'Medium',
    pattern: 'Hash Map + Heap',
    companies: ['Amazon', 'Meta', 'Google', 'Uber'],
    minutes: 15,
    challenge: {
      kind: 'challenge',
      id: 'py-gym-top-k-frequent',
      lang: 'python',
      title: 'Top-k frequent',
      prompt: 'Write `top_k_frequent(nums, k)` returning the `k` most frequent values, **most frequent first**; break ties by the **smaller value first**.',
      starter: `def top_k_frequent(nums, k):
    return nums[:k]
`,
      hints: [
        'Count first: `counts = Counter(nums)` (from `collections`).',
        'Order the distinct values by `(-counts[x], x)`: highest count first, then smaller value.',
        '`heapq.nsmallest(k, counts, key=lambda x: (-counts[x], x))` does it in O(n log k); `sorted(...)[:k]` is O(n log n) and also fine to start.',
      ],
      solution: `import heapq
from collections import Counter

def top_k_frequent(nums, k):
    counts = Counter(nums)
    return heapq.nsmallest(k, counts, key=lambda x: (-counts[x], x))
`,
      explain: 'Hash map to count (O(n)), then a size-k heap to pick winners (O(n log k)). Mention the O(n) bucket-sort alternative (index buckets by count) as a follow-up.',
      py: {
        tests: [
          'top_k_frequent([1, 1, 1, 2, 2, 3], 2)',
          'top_k_frequent([1], 1)',
          'top_k_frequent([4, 4, 5, 5, 6], 2)',
          'top_k_frequent([3, 3, 1, 1, 2, 2, 2], 1)',
          'top_k_frequent([], 0)',
        ],
      },
      trace: { view: 'heap' },
    },
    followups: ['Do it in O(n) with bucket sort.', 'Top-k frequent words, ties broken alphabetically.'],
  },
  {
    id: 'py-gym-kth-largest',
    track: 'python',
    title: 'Kth largest element (heap)',
    difficulty: 'Medium',
    pattern: 'Heap / Priority Queue',
    companies: ['Meta', 'Amazon', 'Microsoft', 'Spotify'],
    minutes: 12,
    challenge: {
      kind: 'challenge',
      id: 'py-gym-kth-largest',
      lang: 'python',
      title: 'Kth largest with a min-heap',
      prompt: 'Write `kth_largest(nums, k)` returning the k-th largest value (duplicates count separately: in `[7, 7, 7]` the 2nd largest is 7). Use a **min-heap of size k** with `heapq`.',
      starter: `def kth_largest(nums, k):
    return sorted(nums)[k]
`,
      hints: [
        'Keep `heap = []`. Push each number with `heapq.heappush(heap, x)`.',
        'Whenever `len(heap) > k`, `heapq.heappop(heap)` — this throws out the smallest, so the heap always holds the k largest seen so far.',
        'The root `heap[0]` is the smallest of the k largest — the answer.',
      ],
      solution: `import heapq

def kth_largest(nums, k):
    heap = []
    for x in nums:
        heapq.heappush(heap, x)
        if len(heap) > k:
            heapq.heappop(heap)
    return heap[0]
`,
      explain: 'O(n log k) time and O(k) space — better than sorting when k is small, and it works on a stream. Quickselect averages O(n) but is O(n²) in the worst case.',
      py: {
        tests: [
          'kth_largest([3, 2, 1, 5, 6, 4], 2)',
          'kth_largest([3, 2, 3, 1, 2, 4, 5, 5, 6], 4)',
          'kth_largest([1], 1)',
          'kth_largest([7, 7, 7], 2)',
          'kth_largest([-1, -5, 0], 3)',
        ],
        mustInclude: ['heapq'],
      },
      trace: { view: 'array', var: 'heap' },
    },
    followups: ['Design a class that returns the kth largest after each new number in a stream.', 'Explain quickselect and its average vs worst case.'],
  },
  {
    id: 'py-gym-number-of-islands',
    track: 'python',
    title: 'Number of islands',
    difficulty: 'Medium',
    pattern: 'Grid BFS / DFS',
    companies: ['Amazon', 'Google', 'Meta', 'Microsoft'],
    minutes: 18,
    challenge: {
      kind: 'challenge',
      id: 'py-gym-number-of-islands',
      lang: 'python',
      title: 'Number of islands',
      prompt: '`grid` is a list of rows of `"1"` (land) and `"0"` (water). An island is land connected **up/down/left/right** (not diagonally). Write `num_islands(grid)` returning the number of islands. An empty grid has 0.',
      starter: `def num_islands(grid):
    return sum(row.count("1") for row in grid)
`,
      hints: [
        'The starter counts land **cells**, not islands. Each island should be counted once.',
        'Scan every cell. When you find a `"1"`, that is a new island: `count += 1`, then BFS/DFS from it.',
        'During the BFS, turn every land cell you reach into `"0"` (sink it) so it is never counted again. Check bounds before indexing.',
      ],
      solution: `from collections import deque

def num_islands(grid):
    rows = len(grid)
    cols = len(grid[0]) if rows else 0
    count = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] != "1":
                continue
            count += 1
            grid[r][c] = "0"
            q = deque([(r, c)])
            while q:
                cr, cc = q.popleft()
                for dr, dc in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
                    nr, nc = cr + dr, cc + dc
                    if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == "1":
                        grid[nr][nc] = "0"
                        q.append((nr, nc))
    return count
`,
      explain: 'Connected components on a grid: every cell is visited once, O(rows × cols). Sinking land in place doubles as the visited marker (say so — and offer a separate `seen` set if mutating the input is not allowed).',
      py: {
        tests: [
          'num_islands([["1", "1", "0", "0"], ["1", "1", "0", "0"], ["0", "0", "1", "0"], ["0", "0", "0", "1"]])',
          'num_islands([["1", "1", "1"], ["0", "1", "0"], ["1", "1", "1"]])',
          'num_islands([])',
          'num_islands([["0"]])',
          'num_islands([["1", "0"], ["0", "1"]])',
        ],
      },
      trace: { view: 'grid', var: 'grid' },
    },
    followups: ['Return the area of the largest island.', 'Count islands without modifying the input.', 'Land is added one cell at a time — report the count after each addition (union-find).'],
  },
  {
    id: 'py-gym-longest-substring',
    track: 'python',
    title: 'Longest substring without repeating characters',
    difficulty: 'Medium',
    pattern: 'Sliding Window',
    companies: ['Amazon', 'Meta', 'Google', 'Bloomberg'],
    minutes: 18,
    challenge: {
      kind: 'challenge',
      id: 'py-gym-longest-substring',
      lang: 'python',
      title: 'Longest substring, no repeats',
      prompt: 'Write `longest_unique(s)` returning the length of the longest **contiguous** substring of `s` with no repeated characters. `"abcabcbb"` → 3 (`"abc"`).',
      starter: `def longest_unique(s):
    return len(set(s))
`,
      hints: [
        'Counting distinct letters ignores the "contiguous" part — `"pwwkew"` has 4 distinct letters but the answer is 3 (`"wke"`).',
        'Sliding window: grow `right`; while `s[right]` is already in the window, remove `s[left]` and `left += 1`.',
        'Faster: store `last[ch]` = last index seen. On a repeat, jump `left = max(left, last[ch] + 1)` — the `max` matters for `"abba"`.',
      ],
      solution: `def longest_unique(s):
    last = {}
    left = 0
    best = 0
    for right, ch in enumerate(s):
        if ch in last and last[ch] >= left:
            left = last[ch] + 1
        last[ch] = right
        best = max(best, right - left + 1)
    return best
`,
      explain: 'A variable sliding window plus a hash map of last positions: O(n) time, O(alphabet) space. The `last[ch] >= left` check stops `left` from jumping **backwards** to a character that already left the window (the `"abba"` trap).',
      py: { tests: ['longest_unique("abcabcbb")', 'longest_unique("bbbbb")', 'longest_unique("pwwkew")', 'longest_unique("")', 'longest_unique("abba")'] },
      trace: { view: 'array', var: 's', pointers: ['left', 'right'] },
    },
    followups: ['Longest substring with at most k distinct characters.', 'Minimum window substring containing all characters of t.'],
  },
  {
    id: 'py-gym-product-except-self',
    track: 'python',
    title: 'Product of array except self',
    difficulty: 'Medium',
    pattern: 'Prefix / Suffix products',
    companies: ['Amazon', 'Meta', 'Apple', 'Microsoft'],
    minutes: 15,
    challenge: {
      kind: 'challenge',
      id: 'py-gym-product-except-self',
      lang: 'python',
      title: 'Product except self (no division)',
      prompt: 'Write `product_except_self(nums)` returning a list where `out[i]` is the product of every element **except** `nums[i]`. Do not use division, and aim for O(n).',
      starter: `def product_except_self(nums):
    total = 1
    for x in nums:
        total *= x
    return [total // x for x in nums]
`,
      hints: [
        'Division breaks on zeros (try `[0, 0]`). Instead, `out[i]` = (product of everything **left** of i) × (product of everything **right** of i).',
        'Pass 1, left to right: `out[i] = running`, then `running *= nums[i]`.',
        'Pass 2, right to left with a new `running = 1`: `out[i] *= running`, then `running *= nums[i]`.',
      ],
      solution: `def product_except_self(nums):
    n = len(nums)
    out = [1] * n
    running = 1
    for i in range(n):
        out[i] = running
        running *= nums[i]
    running = 1
    for i in range(n - 1, -1, -1):
        out[i] *= running
        running *= nums[i]
    return out
`,
      explain: 'Prefix and suffix products in two passes: O(n) time and O(1) extra space besides the output. Prefix/suffix accumulation is the same idea as running totals in SQL window functions.',
      py: {
        tests: [
          'product_except_self([1, 2, 3, 4])',
          'product_except_self([-1, 1, 0, -3, 3])',
          'product_except_self([2, 3])',
          'product_except_self([0, 0])',
          'product_except_self([5])',
        ],
      },
      trace: { view: 'array', var: 'out', pointers: ['i'] },
    },
    followups: ['Explain how you would handle it if division were allowed but zeros were present.', 'Range sum queries with a prefix-sum array.'],
  },

  // ───────────────────────────────────────────── Hard
  {
    id: 'py-gym-merge-k-sorted',
    track: 'python',
    title: 'Merge sorted linked lists (2 → k)',
    difficulty: 'Hard',
    pattern: 'Linked List + Heap',
    companies: ['Amazon', 'Google', 'Meta', 'Microsoft'],
    minutes: 25,
    challenge: {
      kind: 'challenge',
      id: 'py-gym-merge-k-sorted',
      lang: 'python',
      title: 'Merge two, then merge k',
      prompt: 'Part 1: write `merge_two(a, b)` that merges two **sorted** linked lists into one sorted list by relinking nodes. Part 2: write `merge_k(lists)` that merges a list of k sorted linked lists (some may be `None`). Aim for O(N log k) for part 2.',
      starter: `${LL}

def merge_two(a, b):
    return a

def merge_k(lists):
    return None
`,
      hints: [
        '`merge_two`: start a `dummy = ListNode(0)` and a `tail = dummy`. While both lists exist, attach the smaller head to `tail.next` and advance. Finally attach whatever is left: `tail.next = a or b`.',
        '`merge_k`: push `(node.val, i, node)` for each non-empty head onto a heap — the index `i` breaks ties so Python never compares two nodes.',
        'Pop the smallest, attach it to the tail, and if it has a `next`, push `(nxt.val, i, nxt)`. Return `dummy.next`.',
      ],
      solution: `${LL}

import heapq

def merge_two(a, b):
    dummy = ListNode(0)
    tail = dummy
    while a and b:
        if a.val <= b.val:
            tail.next = a
            a = a.next
        else:
            tail.next = b
            b = b.next
        tail = tail.next
    tail.next = a or b
    return dummy.next

def merge_k(lists):
    heap = []
    for i, node in enumerate(lists):
        if node:
            heapq.heappush(heap, (node.val, i, node))
    dummy = ListNode(0)
    tail = dummy
    while heap:
        val, i, node = heapq.heappop(heap)
        tail.next = node
        tail = node
        if node.next:
            heapq.heappush(heap, (node.next.val, i, node.next))
    return dummy.next
`,
      explain: 'The heap always holds at most one node per list, so each of the N nodes costs one O(log k) push and pop: **O(N log k)**. Alternative: pairwise `merge_two` in rounds (divide and conquer) — also O(N log k). Merging one list at a time is O(N·k).',
      py: {
        tests: [
          'to_list(merge_two(from_list([1, 2, 4]), from_list([1, 3, 4])))',
          'to_list(merge_two(None, from_list([0])))',
          'to_list(merge_k([from_list([1, 4, 5]), from_list([1, 3, 4]), from_list([2, 6])]))',
          'to_list(merge_k([]))',
          'to_list(merge_k([None, from_list([1]), None]))',
        ],
      },
      trace: { view: 'heap' },
    },
    followups: ['Do merge_k with divide and conquer instead of a heap. Compare memory use.', 'Merge k sorted arrays that are too large to fit in memory (external merge sort).'],
  },
  {
    id: 'py-gym-coin-change',
    track: 'python',
    title: 'Coin change (fewest coins)',
    difficulty: 'Hard',
    pattern: 'Dynamic Programming',
    companies: ['Amazon', 'Google', 'Goldman Sachs', 'Bloomberg'],
    minutes: 25,
    challenge: {
      kind: 'challenge',
      id: 'py-gym-coin-change',
      lang: 'python',
      title: 'Coin change',
      prompt: 'Write `coin_change(coins, amount)` returning the **fewest** coins that add up to `amount` (unlimited coins of each value), or `-1` if it is impossible. `amount = 0` needs 0 coins.\n\nThe starter is greedy — find the case where taking the biggest coin first is wrong.',
      starter: `def coin_change(coins, amount):
    count = 0
    for c in sorted(coins, reverse=True):
        count += amount // c
        amount %= c
    return count if amount == 0 else -1
`,
      hints: [
        'Greedy fails for `coins = [1, 3, 4]`, `amount = 6`: it picks 4 + 1 + 1, but 3 + 3 is better.',
        'Let `dp[a]` = fewest coins for amount `a`. `dp[0] = 0`; every other entry starts at infinity.',
        'For each `a` from 1 to `amount`, for each coin `c <= a`: `dp[a] = min(dp[a], dp[a - c] + 1)`. Return `-1` if `dp[amount]` is still infinity.',
      ],
      solution: `def coin_change(coins, amount):
    INF = float("inf")
    dp = [0] + [INF] * amount
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a and dp[a - c] + 1 < dp[a]:
                dp[a] = dp[a - c] + 1
    return dp[amount] if dp[amount] != INF else -1
`,
      explain: 'Bottom-up DP over amounts: O(amount × len(coins)) time, O(amount) space. The state "fewest coins for this amount" captures everything needed, and trying every coin as the last coin guarantees the optimum.',
      py: {
        tests: [
          'coin_change([1, 2, 5], 11)',
          'coin_change([2], 3)',
          'coin_change([1], 0)',
          'coin_change([1, 3, 4], 6)',
          'coin_change([186, 419, 83, 408], 6249)',
        ],
      },
      trace: { view: 'array', var: 'dp', pointers: ['a'] },
    },
    followups: ['Count the number of distinct combinations that make the amount (Coin Change II).', 'Return which coins were used, not just how many.'],
  },
];
