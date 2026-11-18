import type { Module } from '../types';

export const module: Module = {
  id: 'py03',
  track: 'python',
  order: 3,
  title: 'Lists, Dicts, Sets & Tuples',
  icon: '🧺',
  level: 'Foundations',
  blurb: 'The four containers behind every interview answer — and the hash map that turns O(n²) into O(n).',
  boss: ['py-gym-valid-anagram', 'py-gym-group-anagrams'],
  lessons: [
    {
      id: 'py03-l1',
      track: 'python',
      title: 'Lists, slicing & tuples',
      summary: 'Watch list methods mutate one object, slice out copies, and unpack tuples like a pro.',
      minutes: 15,
      faang: 'Lists are the default input type in coding screens. Knowing which methods mutate in place (and return `None`), that slices are copies, and how to unpack tuples in one line removes a whole class of bugs that interviewers love to probe.',
      tags: ['Lists', 'Mutation', 'Slicing', 'Tuples', 'Unpacking'],
      cells: [
        {
          kind: 'md',
          text: `A **list** is an ordered, **mutable** sequence: you can add, remove and replace items *in place*. Step through and watch the **one** list object on the right change — and notice that \`also\` is just a second name tag for it.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `cart = ["milk", "eggs"]
cart.append("bread")
cart.insert(0, "jam")
last = cart.pop()
cart.remove("eggs")
also = cart
also.extend(["tea", "rice"])
print(cart, last)`,
            trace: { view: 'heap' },
          },
          caption: '`append` adds at the end, `insert(i, x)` at position i, `pop()` removes **and returns** the last item, `remove(x)` deletes the first `x`, `extend` adds many.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `nums = [3, 1, 2]
result = nums.sort()
print(result)`,
          predict: { question: 'What prints?', options: ['[1, 2, 3]', 'None', '[3, 1, 2]', 'Error'], answer: 1, explain: '`.sort()` sorts the list **in place** and returns `None`. `nums` is now `[1, 2, 3]`, but `result` is `None`.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'In-place methods return None',
          text: '`append`, `extend`, `insert`, `sort`, `reverse`, `remove` all change the list and return `None`. So `xs = xs.sort()` **destroys** your list. Use `sorted(xs)` / `reversed(xs)` when you want a *new* result.',
        },
        {
          kind: 'md',
          text: `**Slicing** works on lists exactly like on strings — \`xs[start:stop:step]\`, stop excluded. One new fact: a slice is a **new list** (a shallow copy). Changing the slice does not touch the original.`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `a = [10, 20, 30, 40, 50]
b = a[1:4]
b[0] = 99
print(a[1], b)`,
          predict: { question: 'What prints?', options: ['99 [99, 30, 40]', '20 [99, 30, 40]', '20 [20, 30, 40]', '99 [20, 30, 40]'], answer: 1, explain: '`a[1:4]` builds a **new** list `[20, 30, 40]`. Writing into `b` leaves `a` alone.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'md',
          text: `A **tuple** is an **immutable** sequence: \`point = (3, 4)\`. Use it for fixed records (a row, a coordinate, a dict key). Its superpower is **unpacking** — assign several names at once:`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `point = (3, 4)
x, y = point
x, y = y, x
first, *middle, last = [1, 2, 3, 4, 5]
print(x, y, first, middle, last)`,
          trace: { view: 'heap' },
          note: '`x, y = y, x` swaps without a temp variable (the right side is packed into a tuple first). `*middle` collects "everything else" into a **list**.',
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: whiteboard vs receipt',
          text: 'A **list** is a whiteboard — erase and rewrite any time. A **tuple** is a printed bank **receipt** — once issued it can\'t change, which is exactly why it is safe to use as a dict key.',
        },
        {
          kind: 'challenge',
          id: 'py03-l1-c1',
          lang: 'python',
          title: 'Rotate right',
          prompt: 'Write `rotate(nums, k)` that returns a **new** list rotated right by `k` steps (`rotate([1, 2, 3, 4, 5], 2)` → `[4, 5, 1, 2, 3]`). `k` may be larger than the list. Don\'t modify the input.',
          starter: 'def rotate(nums, k):\n    return nums[-k:] + nums[:-k]\n',
          hints: ['Try `rotate([1, 2], 5)` with the starter. Rotating a 2-item list 5 times = rotating it once.', 'Reduce `k` with `k %= len(nums)` — but guard the empty list first (`% 0` is an error).', '`if not nums: return []`, then `k %= len(nums)`, then the slice expression.'],
          solution: 'def rotate(nums, k):\n    if not nums:\n        return []\n    k %= len(nums)\n    return nums[-k:] + nums[:-k]\n',
          explain: 'Slices build new lists, so the input is untouched. `k % n` normalises big rotations; the empty-list guard avoids `ZeroDivisionError`. (And `k = 0` works because `nums[-0:]` is the whole list.)',
          py: { tests: ['rotate([1, 2, 3, 4, 5], 2)', 'rotate([], 3)', 'rotate([1, 2], 5)', 'rotate([7], 0)', '(lambda xs: (rotate(xs, 1), xs))([1, 2, 3])'] },
          trace: { view: 'heap' },
        },
        {
          kind: 'challenge',
          id: 'py03-l1-c2',
          lang: 'python',
          title: 'Min and max in one pass',
          prompt: 'Write `min_max(nums)` that returns a tuple `(smallest, largest)` in a single loop (no `min()`/`max()`), or `None` for an empty list.',
          starter: 'def min_max(nums):\n    lo = hi = 0\n    for n in nums:\n        if n < lo:\n            lo = n\n        if n > hi:\n            hi = n\n    return (lo, hi)\n',
          hints: ['Starting at 0 breaks for all-negative or all-positive data.', 'Guard the empty list, then start both at the first element: `lo = hi = nums[0]`.'],
          solution: 'def min_max(nums):\n    if not nums:\n        return None\n    lo = hi = nums[0]\n    for n in nums:\n        if n < lo:\n            lo = n\n        if n > hi:\n            hi = n\n    return (lo, hi)\n',
          explain: 'Returning a tuple is Python\'s way to return several values; the caller can unpack it: `lo, hi = min_max(xs)`.',
          py: { tests: ['min_max([3, -1, 7])', 'min_max([])', 'min_max([5])', 'min_max([2, 2, 2])', 'min_max([-3, -8])'] },
        },
        { kind: 'quiz', id: 'py03-l1-q1', q: 'Which of these can be used as a **dict key**?', options: ['`[1, 2]`', '`(1, 2)`', '`{1: 2}`', '`{1, 2}`'], answer: 1, explain: 'Dict keys must be hashable (immutable). A tuple of ints is; lists, dicts and sets are mutable and are not.' },
        { kind: 'recall', prompt: 'What does `xs[:]` give you, and why is it useful?', answer: 'A **shallow copy** of the whole list — a new list object with the same items, so mutating it doesn\'t affect `xs`.' },
        { kind: 'explain', id: 'py03-l1-e1', prompt: 'Why does `xs = xs.sort()` leave you with `None`? What should you write instead?' },
      ],
      cards: [
        { id: 'py03-l1-k1', kind: 'predict', code: 'print([1, 2, 3, 4, 5][::2])', options: ['[1, 3, 5]', '[2, 4]', '[1, 2]', '[5, 3, 1]'], answer: 0 },
        { id: 'py03-l1-k2', kind: 'predict', code: 'x = [1, 2]\ny = x + [3]\nprint(x)', options: ['[1, 2]', '[1, 2, 3]', '[3]', 'None'], answer: 0 },
        { id: 'py03-l1-k3', kind: 'concept', front: '`xs.sort()` vs `sorted(xs)`?', back: '`xs.sort()` sorts in place and returns None; `sorted(xs)` returns a new sorted list and leaves xs unchanged.' },
        { id: 'py03-l1-k4', kind: 'cloze', text: 'After `a, *b = [1, 2, 3]`, `b` is {{}}.', answers: ['[2, 3]'] },
        { id: 'py03-l1-k5', kind: 'predict', code: 'print((1, 2) + (3,))', options: ['(1, 2, 3)', '(1, 2, (3,))', 'Error: tuples are immutable', '(4, 2)'], answer: 0 },
      ],
    },
    {
      id: 'py03-l2',
      track: 'python',
      title: 'Dicts are hash maps',
      summary: 'See keys hash into buckets, then use dicts to count, look up and remember in O(1).',
      minutes: 16,
      faang: 'The hash map is the single most important interview data structure: two-sum, anagrams, frequency counts, caching and de-duplication all reduce to "remember it in a dict". Interviewers expect you to reach for one whenever a brute force has a nested loop.',
      tags: ['Dicts', 'Hash maps', 'Counting', 'Counter', 'Two-sum'],
      cells: [
        {
          kind: 'md',
          text: `A **dict** maps **keys → values**: \`{"alice": 120}\`. Under the hood it is a **hash table**: Python runs \`hash(key)\` to compute a bucket number and stores the pair there. A lookup re-computes the hash and jumps straight to the bucket — no scanning. That's why \`d[key]\` is **O(1) on average**, however big the dict.

Insert some keys below and watch where they land. Two keys in one bucket is a **collision** — Python handles it, but it's why keys must be **hashable** (immutable).`,
        },
        {
          kind: 'viz',
          viz: { type: 'hashmap', keys: ['alice', 'bob', 'carol', 'dave', 'eve'] },
          caption: 'Same key → same hash → same bucket, every time. That is the whole trick.',
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `balances = {"alice": 120, "bob": 40}
balances["carol"] = 75
balances["bob"] -= 10
del balances["alice"]
print(balances)
print("bob" in balances, balances.get("zed", 0))`,
            trace: { view: 'heap' },
          },
          caption: 'Assigning to a new key **adds** it; to an existing key **replaces** it. `in` checks keys. `.get(key, default)` avoids a `KeyError` for missing keys.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `d = {"a": 1}
d["b"] = 2
d["a"] = 3
print(len(d), d["a"])`,
          predict: { question: 'What prints?', options: ['3 1', '2 3', '3 3', '2 1'], answer: 1, explain: 'Keys are unique: `d["a"] = 3` overwrites the old value instead of adding a second "a". So there are 2 keys, and "a" maps to 3.' },
        },
        {
          kind: 'md',
          text: `**The counting pattern** — the most common dict move in interviews:

\`\`\`python
counts[x] = counts.get(x, 0) + 1
\`\`\`

"Look up the count so far (0 if never seen), add one, store it back." Watch it run:`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `words = ["buy", "sell", "buy", "hold", "buy"]
counts = {}
for w in words:
    counts[w] = counts.get(w, 0) + 1
print(counts)`,
          predict: { question: 'What is `counts["buy"]` at the end?', options: ['1', '3', '5', 'Error: "buy" is missing at first'], answer: 1, fromOutput: false, explain: '`.get(w, 0)` returns 0 the first time, so there\'s no KeyError. "buy" appears 3 times.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'code',
          lang: 'python',
          code: `from collections import Counter

c = Counter("mississippi")
print(c.most_common(2))
print(c["s"], c["z"])`,
          note: '`Counter` is a dict that does the counting for you. `most_common(k)` gives the top k (ties keep first-seen order), and a missing key counts as **0** instead of raising.',
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: the coat check',
          text: 'A dict is a **coat check**. Hand over your ticket (the key) and the attendant walks straight to the right hook (the hash bucket) — no searching every rack. Two identical tickets can\'t exist, so a new coat on the same ticket replaces the old one.',
        },
        {
          kind: 'callout',
          tone: 'interview',
          title: 'How this is asked',
          text: 'Whenever your first idea is a nested loop that "searches for" something, ask: **"could a dict remember what I\'ve already seen?"** Two-sum goes from O(n²) to O(n) this way — it\'s often the very first question in an Amazon/Meta-style screen.',
        },
        {
          kind: 'challenge',
          id: 'py03-l2-c1',
          lang: 'python',
          title: 'Word frequencies',
          prompt: 'Write `word_freq(text)` that returns a dict mapping each **lower-cased** word to how many times it appears.',
          starter: 'def word_freq(text):\n    counts = {}\n    for w in text.split():\n        counts[w] = 1\n    return counts\n',
          hints: ['The starter overwrites every count with 1 — and "A" and "a" are counted as different words.', 'Use the counting pattern on `w.lower()`: `counts[w] = counts.get(w, 0) + 1`.'],
          solution: 'def word_freq(text):\n    counts = {}\n    for w in text.lower().split():\n        counts[w] = counts.get(w, 0) + 1\n    return counts\n',
          explain: '`get(key, 0)` is the idiom for "count so far". `Counter(text.lower().split())` does the same in one line — mention it, but be ready to write the loop.',
          py: { tests: ['word_freq("the cat the hat")', 'word_freq("")', 'word_freq("A a A")', 'sorted(word_freq("x y x z").items())'] },
          trace: { view: 'heap' },
        },
        {
          kind: 'challenge',
          id: 'py03-l2-c2',
          lang: 'python',
          title: 'Two-sum with a dict',
          prompt: 'Write `two_sum(nums, target)` that returns `[i, j]` (with `i < j`) such that `nums[i] + nums[j] == target`, in **one pass** using a dict. Return `None` if no pair exists.',
          starter: 'def two_sum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        seen[n] = i\n        if target - n in seen:\n            return [seen[target - n], i]\n    return None\n',
          hints: ['Run `two_sum([3, 2, 4], 6)` on the starter: it pairs the 3 with **itself**.', 'Check for the partner **before** you store the current number.', 'Swap the two steps: first `if target - n in seen: return [seen[target - n], i]`, then `seen[n] = i`.'],
          solution: 'def two_sum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        if target - n in seen:\n            return [seen[target - n], i]\n        seen[n] = i\n    return None\n',
          explain: '`seen` maps value → index of everything **before** `i`. For each number we ask the dict "have I met my partner yet?" in O(1). One pass, O(n) time, O(n) memory.',
          py: { tests: ['two_sum([2, 7, 11, 15], 9)', 'two_sum([3, 2, 4], 6)', 'two_sum([3, 3], 6)', 'two_sum([-1, -2, -3, -4], -6)', 'two_sum([1, 2], 10)'] },
          trace: { view: 'heap' },
        },
        { kind: 'quiz', id: 'py03-l2-q1', q: 'What is the **average** time to check `key in d` for a dict with a million keys?', options: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'], answer: 0, explain: 'Hashing jumps straight to the bucket, so membership tests and lookups are O(1) on average, independent of size.' },
        { kind: 'recall', prompt: 'Write the one-line counting idiom for a plain dict `counts` and an item `x`.', answer: '`counts[x] = counts.get(x, 0) + 1`' },
        { kind: 'explain', id: 'py03-l2-e1', prompt: 'Explain, using the bucket picture, why a list can\'t be a dict key but a tuple can.' },
      ],
      cards: [
        { id: 'py03-l2-k1', kind: 'predict', code: 'd = {}\nd["x"] = d.get("x", 0) + 1\nd["x"] = d.get("x", 0) + 1\nprint(d)', options: ["{'x': 2}", "{'x': 1}", "{'x': 1, 'x': 1}", 'KeyError'], answer: 0 },
        { id: 'py03-l2-k2', kind: 'predict', code: 'from collections import Counter\nprint(Counter("banana").most_common(1))', options: ["[('a', 3)]", "[('b', 1)]", "[('n', 2)]", "('a', 3)"], answer: 0 },
        { id: 'py03-l2-k3', kind: 'concept', front: 'What happens on `d["missing"]`, and how do you avoid it?', back: 'It raises KeyError. Use `d.get("missing", default)`, check `in` first, or use a defaultdict/Counter.' },
        { id: 'py03-l2-k4', kind: 'cloze', text: 'Average-case dict lookup is O({{}}) because keys are {{}} into buckets.', answers: ['1', 'hashed'] },
        { id: 'py03-l2-k5', kind: 'concept', front: 'Which objects can be dict keys?', back: 'Hashable (immutable) ones: int, str, float, bool, tuple of hashables, frozenset. Not list, dict or set.' },
      ],
    },
    {
      id: 'py03-l3',
      track: 'python',
      title: 'Sets: membership & de-duplication',
      summary: 'Unique items with O(1) membership — and why `x in my_list` quietly costs O(n).',
      minutes: 13,
      faang: '"Contains duplicate", "intersection of two arrays" and "visited" tracking in BFS/DFS are all sets. Switching `in list` (O(n)) to `in set` (O(1)) inside a loop is one of the most common optimisations interviewers ask for.',
      tags: ['Sets', 'Membership', 'De-duplication', 'Big-O'],
      cells: [
        {
          kind: 'md',
          text: `A **set** is a dict with keys only: an unordered bag of **unique**, hashable items. Step through: each number is checked against \`seen\` — if it's already there, it's a duplicate.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `seen = set()
dupes = []
for x in [4, 1, 4, 2, 1, 4]:
    if x in seen:
        dupes.append(x)
    else:
        seen.add(x)
print(sorted(seen), dupes)`,
            trace: { view: 'heap' },
          },
          caption: '`seen` never holds the same number twice. `x in seen` is one hash lookup, no matter how many items are in it.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `print(len(set([3, 1, 3, 2, 1])))`,
          predict: { question: 'What prints?', options: ['5', '3', '2', '[1, 2, 3]'], answer: 1, explain: 'Converting to a set drops duplicates: {1, 2, 3} → 3 items. `len(set(xs))` is the classic one-line "how many distinct?".' },
        },
        {
          kind: 'md',
          text: `**Why sets are fast:** \`x in my_list\` checks items **one by one** — O(n). \`x in my_set\` hashes \`x\` and jumps to one bucket — O(1).

Inside a loop over n items, that's the difference between **O(n²)** and **O(n)**. Race the curves:`,
        },
        { kind: 'viz', viz: { type: 'bigo' }, caption: 'At n = 1,000,000: O(n) is a million steps per lookup; O(1) is about one. Do that lookup in a loop and the gap explodes.' },
        {
          kind: 'code',
          lang: 'python',
          code: `a = {1, 2, 3, 4}
b = {3, 4, 5}
print(sorted(a & b), sorted(a | b), sorted(a - b))`,
          predict: { question: 'What prints?', options: ['[3, 4] [1, 2, 3, 4, 5] [1, 2]', '[3, 4] [1, 2, 3, 4, 5] [5]', '[1, 2] [1, 2, 3, 4, 5] [3, 4]', '[3, 4] [1, 2, 3, 4, 3, 4, 5] [1, 2]'], answer: 0, explain: '`&` = in both (intersection), `|` = in either (union, no duplicates), `a - b` = in a but not b.' },
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'Three set gotchas',
          text: '- Sets are **unordered** — never rely on the print order; `sorted(s)` when order matters.\n- `{}` is an empty **dict**. An empty set is `set()`.\n- Items must be hashable: a set of lists is an error; use tuples.',
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: the guest list',
          text: 'A set is a nightclub **guest list**. The bouncer finds a name instantly (hash lookup), and nobody gets in twice. A list is a queue outside: to check if someone is there, you walk past everyone.',
        },
        {
          kind: 'challenge',
          id: 'py03-l3-c1',
          lang: 'python',
          title: 'De-duplicate, keep order',
          prompt: 'Write `dedup(xs)` that returns the items of `xs` with duplicates removed, **keeping the first occurrence order** (`[3, 1, 3, 2, 1]` → `[3, 1, 2]`).',
          starter: 'def dedup(xs):\n    return sorted(set(xs))\n',
          hints: ['`set` removes duplicates but forgets the original order.', 'Use a set for the O(1) "seen?" check **and** a list for the output order.', 'Loop: `if x not in seen: seen.add(x); out.append(x)`.'],
          solution: 'def dedup(xs):\n    seen = set()\n    out = []\n    for x in xs:\n        if x not in seen:\n            seen.add(x)\n            out.append(x)\n    return out\n',
          explain: 'Set for speed, list for order — a very common pairing. (`list(dict.fromkeys(xs))` is a clever one-liner that does the same, since dicts keep insertion order.)',
          py: { tests: ['dedup([3, 1, 3, 2, 1])', 'dedup([])', 'dedup(["b", "a", "b"])', 'dedup([-1, -1, 0])', 'dedup([5])'] },
          trace: { view: 'heap' },
        },
        {
          kind: 'challenge',
          id: 'py03-l3-c2',
          lang: 'python',
          title: 'Contains duplicate',
          prompt: 'Write `has_duplicate(nums)` that returns `True` if any value appears at least twice. Aim for O(n).',
          starter: 'def has_duplicate(nums):\n    for i in range(len(nums)):\n        for j in range(len(nums)):\n            if nums[i] == nums[j]:\n                return True\n    return False\n',
          hints: ['The starter compares each item with **itself** (i == j), so it says True for `[1, 2, 3]` — and it\'s O(n²) anyway.', 'Walk once with a `seen` set: if `x in seen` → `True`, else add it.', 'One-liner alternative: `len(set(nums)) != len(nums)`.'],
          solution: 'def has_duplicate(nums):\n    seen = set()\n    for x in nums:\n        if x in seen:\n            return True\n        seen.add(x)\n    return False\n',
          explain: 'The loop version can stop at the **first** duplicate (early exit); the `len(set(...))` version always builds the full set. Both are O(n) — mention the trade-off.',
          py: { tests: ['has_duplicate([1, 2, 3, 1])', 'has_duplicate([1, 2, 3])', 'has_duplicate([])', 'has_duplicate([-1, -1])', 'has_duplicate([0])'] },
          trace: { view: 'heap' },
        },
        { kind: 'quiz', id: 'py03-l3-q1', q: 'Which operation is **O(1)** on average?', options: ['`x in my_list`', '`x in my_set`', '`my_list.index(x)`', '`sorted(my_set)`'], answer: 1, explain: 'Set membership hashes once. List membership and `.index` scan; sorting is O(n log n).' },
        { kind: 'recall', prompt: 'How do you create an empty set — and what does `{}` create instead?', answer: '`set()`. `{}` creates an empty **dict**.' },
        { kind: 'explain', id: 'py03-l3-e1', prompt: 'A loop does `if x in big_list:` for each of n items. Explain why that is O(n²) and how one change makes it O(n).' },
      ],
      cards: [
        { id: 'py03-l3-k1', kind: 'predict', code: 'print(sorted({3, 1, 3}))', options: ['[1, 3]', '[1, 3, 3]', '[3, 1]', '{1, 3}'], answer: 0 },
        { id: 'py03-l3-k2', kind: 'predict', code: 'print(len({"a", "A", "a"}))', options: ['1', '2', '3', 'Error'], answer: 1 },
        { id: 'py03-l3-k3', kind: 'cloze', text: '`x in my_list` is O({{}}), but `x in my_set` is O({{}}).', answers: ['n', '1'] },
        { id: 'py03-l3-k4', kind: 'concept', front: 'Set operators for intersection, union and difference?', back: '`a & b` (in both), `a | b` (in either), `a - b` (in a, not in b).' },
        { id: 'py03-l3-k5', kind: 'concept', front: 'Remove duplicates from a list but keep the original order?', back: 'Loop with a `seen` set and an output list (or `list(dict.fromkeys(xs))`).' },
      ],
    },
    {
      id: 'py03-l4',
      track: 'python',
      title: 'Comprehensions & sorting with key=',
      summary: 'Compress loop-and-append into one readable line, know when not to, and sort anything by anything.',
      minutes: 15,
      faang: 'Comprehensions are expected Python fluency in a screen, and `sorted(..., key=...)` with tuple keys solves "top-N", "sort by frequency then alphabetically" and interval problems. Interviewers also notice when a comprehension is too clever to read.',
      tags: ['Comprehensions', 'Sorting', 'key functions', 'Top-N'],
      cells: [
        {
          kind: 'md',
          text: `Step through: the loop on top and the one-liner below build **the same list**. A **list comprehension** is just "loop + if + append" folded into one expression.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `prices = [12, 7, 30, 5]
big = []
for p in prices:
    if p >= 10:
        big.append(p * 2)
same = [p * 2 for p in prices if p >= 10]
print(big, same)`,
            trace: { view: 'heap' },
          },
          caption: 'Read `[p * 2 for p in prices if p >= 10]` left to right as: "give me **p × 2**, **for** each p in prices, **if** p ≥ 10".',
        },
        {
          kind: 'md',
          text: `Anatomy: \`[EXPR for X in ITERABLE if CONDITION]\` — the \`if\` part is optional. The same shape builds dicts and sets:

\`\`\`python
lengths = {name: len(name) for name in names}   # dict
initials = {name[0] for name in names}          # set
\`\`\``,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `print([x * x for x in range(5) if x % 2 == 0])`,
          predict: { question: 'What prints?', options: ['[0, 4, 16]', '[1, 9]', '[0, 1, 4, 9, 16]', '[4, 16]'], answer: 0, explain: 'range(5) is 0..4; keep the evens 0, 2, 4; square them → 0, 4, 16.' },
        },
        {
          kind: 'code',
          lang: 'python',
          code: `print(["even" if n % 2 == 0 else "odd" for n in [1, 2, 3]])`,
          predict: { question: 'What prints?', options: ["['odd', 'even', 'odd']", "['even']", "['odd', 'odd']", 'SyntaxError'], answer: 0, explain: 'An `if … else` **before** `for` is a conditional expression that *chooses a value* for every item. An `if` **after** `for` *filters* items out.' },
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'When NOT to use a comprehension',
          text: '- For **side effects**: `[print(x) for x in xs]` builds a useless list — write a loop.\n- When it needs **nested loops plus conditions** — if you have to read it twice, a loop is clearer.\n- When you need `break` or several statements per item.',
        },
        {
          kind: 'md',
          text: `**Sorting by anything:** \`sorted(items, key=f)\` calls \`f(item)\` once per item and sorts by those results. Tips:

- \`reverse=True\` for descending
- A **tuple key** sorts by several things: \`key=lambda t: (-t[1], t[0])\` → amount descending, then name ascending
- Sorting is **stable**: items with equal keys keep their original order`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `txns = [("rent", 1200), ("coffee", 4), ("salary", 3000), ("book", 4)]
by_amount = sorted(txns, key=lambda t: t[1])
print([name for name, _ in by_amount])`,
          predict: { question: 'What prints?', options: ["['coffee', 'book', 'rent', 'salary']", "['book', 'coffee', 'rent', 'salary']", "['salary', 'rent', 'coffee', 'book']", "['book', 'coffee', 'rent', 'salary'] (alphabetical)"], answer: 0, explain: 'coffee and book tie at 4. A **stable** sort keeps their original order, so coffee (first in the input) stays first.' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: the name badge',
          text: '`key=` pins a **name badge** on every item. Python lines items up by what is written on the badge — the items themselves are never compared. Want two rules? Write two things on the badge: `(-amount, name)`.',
        },
        {
          kind: 'challenge',
          id: 'py03-l4-c1',
          lang: 'python',
          title: 'Top spenders',
          prompt: '`totals` maps customer name → total spend. Write `top_spenders(totals, n)` that returns the names of the top `n` spenders, **highest first**, breaking ties **alphabetically**.',
          starter: 'def top_spenders(totals, n):\n    return sorted(totals, reverse=True)[:n]\n',
          hints: ['`sorted(totals)` sorts the **keys** (names) — you need to sort by the values.', 'Sort the names with a key that looks up the amount: `key=lambda name: totals[name]`.', 'For "highest first, then alphabetical" use a tuple key without `reverse`: `key=lambda name: (-totals[name], name)`.'],
          solution: 'def top_spenders(totals, n):\n    return sorted(totals, key=lambda name: (-totals[name], name))[:n]\n',
          explain: 'Negating the number flips its direction while the name stays ascending — one sort, two rules. Slicing `[:n]` works even if n is bigger than the list.',
          py: { tests: ['top_spenders({"a": 5, "b": 9, "c": 5}, 2)', 'top_spenders({}, 3)', 'top_spenders({"z": 1, "y": 1, "x": 1}, 2)', 'top_spenders({"a": -5, "b": -1}, 5)'] },
        },
        {
          kind: 'challenge',
          id: 'py03-l4-c2',
          lang: 'python',
          title: 'Word lengths (dict comprehension)',
          prompt: 'Write `word_lengths(words)` that returns a dict `{word: length}` for every word with **at least 3 letters**, lower-cased. Use a **dict comprehension**.',
          starter: 'def word_lengths(words):\n    return {}\n',
          hints: ['Shape: `{KEY: VALUE for w in words if CONDITION}`.', '`{w.lower(): len(w) for w in words if len(w) >= 3}`'],
          solution: 'def word_lengths(words):\n    return {w.lower(): len(w) for w in words if len(w) >= 3}\n',
          explain: 'Dict comprehensions are perfect for "transform and filter into a lookup table". If two words lower-case to the same key, the later one wins — just like normal dict assignment.',
          py: { tests: ['word_lengths(["Hi", "There", "you"])', 'word_lengths([])', 'word_lengths(["AAA", "aaa"])', 'word_lengths(["a", "bb"])'], mustInclude: ['for'] },
        },
        { kind: 'quiz', id: 'py03-l4-q1', q: 'What does `sorted(["ccc", "a", "bb"], key=len, reverse=True)` return?', options: ["`['a', 'bb', 'ccc']`", "`['ccc', 'bb', 'a']`", "`['a', 'ccc', 'bb']`", "`['bb', 'a', 'ccc']`"], answer: 1, explain: 'Sort by length (1, 2, 3), then reverse → longest first.' },
        { kind: 'recall', prompt: 'Write a key that sorts `(name, amount)` tuples by amount **descending**, then name **ascending**.', answer: '`key=lambda t: (-t[1], t[0])`' },
        { kind: 'explain', id: 'py03-l4-e1', prompt: 'Explain the difference between `[x for x in xs if c]` and `[a if c else b for x in xs]`.' },
      ],
      cards: [
        { id: 'py03-l4-k1', kind: 'predict', code: 'print(sorted(["bb", "a", "ccc"], key=len))', options: ["['a', 'bb', 'ccc']", "['ccc', 'bb', 'a']", "['a', 'ccc', 'bb']", "['bb', 'a', 'ccc']"], answer: 0 },
        { id: 'py03-l4-k2', kind: 'predict', code: 'print([c for c in "a1b2" if c.isalpha()])', options: ["['a', 'b']", "['1', '2']", "'ab'", "['a', '1', 'b', '2']"], answer: 0 },
        { id: 'py03-l4-k3', kind: 'cloze', text: 'Sort `(name, amount)` pairs by amount descending, then name: `key=lambda t: ({{}}, t[0])`', answers: ['-t[1]'] },
        { id: 'py03-l4-k4', kind: 'concept', front: 'Name two situations where a plain loop beats a comprehension.', back: 'Side effects (printing, appending elsewhere), needing break/multiple statements, or deeply nested logic that is hard to read.' },
        { id: 'py03-l4-k5', kind: 'concept', front: 'What does "Python\'s sort is stable" mean?', back: 'Items with equal keys keep their original relative order.' },
      ],
    },
  ],
};
