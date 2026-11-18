import type { Module } from '../types';

// Shared Python snippets (plain TS constants interpolated into the cells below).
const NODE = `class Node:
    def __init__(self, val, next=None):
        self.val = val
        self.next = next`;

const LL_HELPERS = `${NODE}

def from_list(vals):
    head = None
    for v in reversed(vals):
        head = Node(v, head)
    return head

def to_list(head):
    out = []
    while head:
        out.append(head.val)
        head = head.next
    return out`;

const TREE = `class TreeNode:
    def __init__(self, val, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right`;

const TREE_HELPERS = `${TREE}

def insert(root, val):
    if root is None:
        return TreeNode(val)
    if val < root.val:
        root.left = insert(root.left, val)
    else:
        root.right = insert(root.right, val)
    return root

def build(vals):
    root = None
    for v in vals:
        root = insert(root, v)
    return root`;

export const module: Module = {
  id: 'py06',
  track: 'python',
  order: 6,
  title: 'Data Structures, Visualized',
  icon: '🧱',
  level: 'Interview',
  blurb: 'Linked lists, stacks, queues, heaps, hash maps, trees and graphs — watch the arrows move, then build each one yourself.',
  boss: ['py-gym-reverse-linked-list', 'py-gym-valid-parentheses', 'py-gym-kth-largest'],
  lessons: [
    // ─────────────────────────────────────────────────────────────── L1
    {
      id: 'py06-l1',
      track: 'python',
      title: 'Linked lists: nodes & arrows',
      summary: 'Build, walk, rewire and reverse a chain of nodes — then catch cycles with a fast and a slow pointer.',
      minutes: 20,
      faang: 'Linked lists are a staple of Amazon/Microsoft/Meta-style phone screens because they test pointer discipline: one wrong assignment and half the list is lost. "Reverse a linked list" and "detect a cycle" are the two patterns to own cold.',
      tags: ['Linked list', 'Pointers', 'Reverse a list', 'Fast & slow pointers', 'Dummy node'],
      cells: [
        {
          kind: 'md',
          text: `A Python \`list\` is a row of numbered boxes. A **linked list** is a *train*: each car (a **node**) carries a value and a coupling — an arrow called \`next\` — to the car behind it. The last car's \`next\` is \`None\`.

You only hold the engine (\`head\`). To reach car 3 you must walk car → car → car.

Press **Step ▶** and watch the chain grow right-to-left, then read it left-to-right.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `${NODE}

c = Node(3)
b = Node(2, c)
a = Node(1, b)
head = a
print(head.val, head.next.val, head.next.next.val)`,
            trace: { view: 'heap' },
          },
          caption: 'Each `Node` is an object with two attributes. `next` is just a name tag pointing at another node — the heap view draws those `next` arrows as a horizontal chain.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `${NODE}

head = Node(4, Node(7, Node(1)))
cur = head
total = 0
while cur:
    total += cur.val
    cur = cur.next
print(total)`,
          predict: { question: 'The cursor `cur` walks the whole chain. What prints?', options: ['12', '11', '4', 'AttributeError'], answer: 0, explain: '`cur` visits 4, 7 and 1, then becomes `None` and the loop stops: 4 + 7 + 1 = 12.' },
          trace: { view: 'heap' },
          note: '`cur = cur.next` is the heartbeat of every linked-list loop: *step to the next car*. `while cur:` stops when you fall off the end (`None`). Walking is **O(n)** — there is no `head[2]` shortcut.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `${LL_HELPERS}

head = Node(1, Node(3))
head = Node(0, head)          # insert at the head: O(1)
p = head.next                 # p is the node holding 1
p.next = Node(2, p.next)      # insert 2 after p: O(1)
p.next = p.next.next          # delete the node after p
print(to_list(head))`,
          predict: { question: 'We insert at the head, insert 2 after node 1, then delete it again. What prints?', options: ['[0, 1, 2, 3]', '[0, 1, 3]', '[1, 3]', '[0, 1]'], answer: 1, explain: 'Deleting = making `p.next` skip over the 2. Nothing points at the 2 any more, so it is gone from the chain.' },
          trace: { view: 'heap' },
          note: 'Insert and delete are just **rewiring arrows** — no shifting like a Python list. Trap: `p.next = Node(2)` (forgetting to pass `p.next`) would cut off the rest of the train. Always hook the new node to the rest **first**.',
        },
        {
          kind: 'md',
          text: `**Reversing** is the #1 linked-list interview question. You flip every arrow so it points backwards, using three name tags:

- \`prev\` — the part already reversed (starts as \`None\`)
- \`cur\` — the node being flipped
- \`nxt\` — a bookmark to the rest, saved *before* the flip (otherwise it's lost)

Step through slowly and watch one arrow flip per loop.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `${NODE}

head = Node(1, Node(2, Node(3)))
prev = None
cur = head
while cur:
    nxt = cur.next    # 1. save the rest
    cur.next = prev   # 2. flip the arrow
    prev = cur        # 3. step prev forward
    cur = nxt         # 4. step cur forward
head = prev
print(head.val, head.next.val, head.next.next.val)`,
            trace: { view: 'heap', speed: 900 },
          },
          caption: 'After each loop, `prev` heads a reversed chain and `cur` heads what is left. When `cur` is `None`, `prev` is the new head. **O(n) time, O(1) extra space.**',
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: "Save, flip, step, step"',
          text: 'Chant it: **save** `nxt = cur.next` → **flip** `cur.next = prev` → **step** `prev = cur` → **step** `cur = nxt`. Each line uses the name the previous line just freed up. Picture turning train cars around one at a time while holding the coupling of the next car in your other hand.',
        },
        {
          kind: 'challenge',
          id: 'py06-l1-c1',
          lang: 'python',
          title: 'Remove every x (dummy node)',
          prompt: 'Write `remove_all(head, x)` that deletes **every** node whose value is `x` and returns the (possibly new) head. The helpers `from_list` / `to_list` are provided so the tests can compare plain Python lists.\n\nThe starter almost works — run it and find the case it gets wrong.',
          starter: `${LL_HELPERS}

def remove_all(head, x):
    cur = head
    while cur and cur.next:
        if cur.next.val == x:
            cur.next = cur.next.next
        else:
            cur = cur.next
    return head
`,
          hints: [
            'The starter never checks the **head** itself — try `[7, 7, 7]` with `x = 7`.',
            'Put a fake **dummy** node in front: `dummy = Node(0, head)`. Now every real node has a node before it.',
            'Run the starter\'s loop starting from `cur = dummy`, and `return dummy.next`.',
          ],
          solution: `${LL_HELPERS}

def remove_all(head, x):
    dummy = Node(0, head)
    cur = dummy
    while cur.next:
        if cur.next.val == x:
            cur.next = cur.next.next
        else:
            cur = cur.next
    return dummy.next
`,
          explain: 'A **dummy (sentinel) node** removes the special case "what if the head changes?". You will use this trick in merge, partition and delete problems.',
          py: {
            tests: [
              'to_list(remove_all(from_list([1, 2, 6, 3, 6]), 6))',
              'to_list(remove_all(from_list([7, 7, 7]), 7))',
              'to_list(remove_all(from_list([]), 1))',
              'to_list(remove_all(from_list([1, 2]), 3))',
              'to_list(remove_all(from_list([6, 1, 6]), 6))',
            ],
          },
          trace: { view: 'heap' },
        },
        {
          kind: 'code',
          lang: 'python',
          code: `${LL_HELPERS}

head = from_list([1, 2, 3, 4, 5])
slow = fast = head
while fast and fast.next:
    slow = slow.next
    fast = fast.next.next
print(slow.val)`,
          predict: { question: '**Fast & slow pointers:** `slow` moves 1 node per loop, `fast` moves 2. Where is `slow` when `fast` reaches the end?', options: ['2', '3', '4', '5'], answer: 1, explain: '`fast` covers twice the distance, so when it finishes, `slow` is halfway: the middle node, 3.' },
          trace: { view: 'heap' },
          note: 'Same trick detects a **cycle**: if the tail loops back, `fast` never reaches `None` — it laps `slow` and they land on the **same node** (`slow is fast`). O(n) time, O(1) space (no set of visited nodes).',
        },
        {
          kind: 'challenge',
          id: 'py06-l1-c2',
          lang: 'python',
          title: 'Does the train loop back?',
          prompt: 'Write `has_cycle(head)` that returns `True` if following `next` arrows ever revisits a node. `make_cycle(vals, pos)` builds a list whose tail points back at index `pos` (`-1` = no cycle). Use **fast & slow pointers** — no sets.',
          starter: `${NODE}

def make_cycle(vals, pos):
    nodes = [Node(v) for v in vals]
    for a, b in zip(nodes, nodes[1:]):
        a.next = b
    if nodes and pos >= 0:
        nodes[-1].next = nodes[pos]
    return nodes[0] if nodes else None

def has_cycle(head):
    return False
`,
          hints: [
            'Start `slow = fast = head`. Loop `while fast and fast.next:`.',
            'Move `slow` one step and `fast` two steps, *then* check `if slow is fast: return True`.',
            'If the loop ends, `fast` fell off the end → no cycle → `return False`.',
          ],
          solution: `${NODE}

def make_cycle(vals, pos):
    nodes = [Node(v) for v in vals]
    for a, b in zip(nodes, nodes[1:]):
        a.next = b
    if nodes and pos >= 0:
        nodes[-1].next = nodes[pos]
    return nodes[0] if nodes else None

def has_cycle(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:
            return True
    return False
`,
          explain: 'Floyd\'s tortoise & hare: inside a loop the gap between the pointers shrinks by 1 every step, so they must meet. Use `is` (same object), not `==` (same value) — two different nodes can hold equal values.',
          py: {
            tests: [
              'has_cycle(make_cycle([3, 2, 0, -4], 1))',
              'has_cycle(make_cycle([1, 2], 0))',
              'has_cycle(make_cycle([1], 0))',
              'has_cycle(make_cycle([1, 2, 3], -1))',
              'has_cycle(make_cycle([], -1))',
            ],
          },
          trace: { view: 'heap' },
        },
        {
          kind: 'quiz',
          id: 'py06-l1-q1',
          q: 'Which operation is **O(1)** on a singly linked list (given only `head`), but **O(n)** on a Python list?',
          options: ['Reading the 5th element', 'Inserting a new first element', 'Finding the last element', 'Searching for a value'],
          answer: 1,
          explain: '`head = Node(x, head)` is one rewire. A Python list must shift every element right to make room at index 0. Reading by index and searching are O(n) on a linked list.',
        },
        { kind: 'recall', prompt: 'Without looking: write the 4 lines inside the reverse loop, in order.', answer: '`nxt = cur.next` · `cur.next = prev` · `prev = cur` · `cur = nxt` — "save, flip, step, step". After the loop, `prev` is the new head.' },
        { kind: 'explain', id: 'py06-l1-e1', prompt: 'Explain why the fast pointer must eventually meet the slow pointer if there is a cycle, and why we compare with `is` instead of `==`.' },
      ],
      cards: [
        { id: 'py06-l1-k1', kind: 'predict', code: `${NODE}\n\nhead = Node(1, Node(2))\nhead = Node(0, head)\nprint(head.next.val)`, options: ['0', '1', '2', 'None'], answer: 1 },
        { id: 'py06-l1-k2', kind: 'cloze', text: 'Reverse loop: `nxt = cur.next`, `cur.next = {{}}`, `prev = cur`, `cur = {{}}`', answers: ['prev', 'nxt'] },
        { id: 'py06-l1-k3', kind: 'concept', front: 'Linked list Big-O: access by index, insert at head, insert after a known node, search?', back: 'Access O(n) · insert at head O(1) · insert after a known node O(1) · search O(n).' },
        { id: 'py06-l1-k4', kind: 'cloze', text: 'Delete the node after `p`: `p.next = {{}}`', answers: ['p.next.next'] },
        { id: 'py06-l1-k5', kind: 'concept', front: 'How do you detect a cycle in a linked list in O(1) space?', back: 'Fast & slow pointers (Floyd): slow moves 1, fast moves 2. If they ever point at the same node (`slow is fast`) there is a cycle; if fast hits `None`, there is none.' },
      ],
    },

    // ─────────────────────────────────────────────────────────────── L2
    {
      id: 'py06-l2',
      track: 'python',
      title: 'Stacks, queues & heaps: who leaves next?',
      summary: 'Three waiting lines with three rules — last-in-first-out, first-in-first-out, and smallest-first.',
      minutes: 18,
      faang: 'Stacks (matching brackets, undo, monotonic stacks), queues (BFS) and heaps (top-k, schedulers, Dijkstra) appear in a large share of Google/Amazon/Meta-style coding rounds. Knowing *which* line to use is often the whole insight.',
      tags: ['Stack', 'Queue', 'deque', 'Heap', 'heapq', 'Priority queue', 'Valid parentheses'],
      cells: [
        {
          kind: 'md',
          text: `Every structure in this lesson answers one question: **who leaves next?**

- **Stack** — the *last* one in (a stack of plates). Python: a plain \`list\` with \`append\` / \`pop\`.
- **Queue** — the *first* one in (the line at a bank teller). Python: \`collections.deque\`.
- **Heap** — the *smallest* one, whenever it arrived (ER triage). Python: \`heapq\`.

Watch a stack first — the top is the **right end** of the list.`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `stack = []
stack.append("a")
stack.append("b")
stack.append("c")
top = stack.pop()
stack.append("d")
print(top, stack)`,
          predict: { question: 'What prints?', options: ["a ['b', 'c', 'd']", "c ['a', 'b', 'd']", "c ['a', 'b', 'c', 'd']", "d ['a', 'b']"], answer: 1, explain: '`pop()` removes the **last** item pushed ("c"). Then "d" goes on top. Both `append` and `pop()` are O(1).' },
          trace: { view: 'array', var: 'stack' },
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `s = "([]{})"
pairs = {")": "(", "]": "[", "}": "{"}
stack = []
for ch in s:
    if ch in pairs:
        top = stack.pop()
        print(ch, "closes", top)
    else:
        stack.append(ch)
print("left over:", stack)`,
            trace: { view: 'array', var: 'stack' },
          },
          caption: '**Matching brackets:** every opener is pushed; every closer must match the opener on **top**. The most recently opened bracket must close first — that is exactly LIFO. A valid string leaves the stack empty.',
        },
        {
          kind: 'challenge',
          id: 'py06-l2-c1',
          lang: 'python',
          title: 'Crush adjacent duplicates',
          prompt: 'Write `crush(s)` that repeatedly removes **two equal adjacent letters** until none are left. `crush("abbaca")` → `"ca"` (remove "bb" → "aaca", remove "aa" → "ca").',
          starter: `def crush(s):
    out = ""
    for ch in s:
        if out and out[-1] == ch:
            continue
        out += ch
    return out
`,
          hints: [
            'Removing a pair can create a *new* pair ("a**bb**a" → "aa"). The latest letter is the one that can pair up — that smells like a stack.',
            'Loop over letters: if `stack` is non-empty and `stack[-1] == ch`, `pop()`; otherwise `append(ch)`.',
            "Return `''.join(stack)`.",
          ],
          solution: `def crush(s):
    stack = []
    for ch in s:
        if stack and stack[-1] == ch:
            stack.pop()
        else:
            stack.append(ch)
    return "".join(stack)
`,
          explain: 'One pass, O(n): each letter is pushed once and popped at most once. "The newest item interacts with the next one" is the signal for a stack.',
          py: { tests: ['crush("abbaca")', 'crush("azxxzy")', 'crush("")', 'crush("a")', 'crush("aaaa")'] },
          trace: { view: 'array', var: 'stack' },
        },
        {
          kind: 'code',
          lang: 'python',
          code: `from collections import deque

q = deque()
q.append("Ann")
q.append("Bo")
q.append("Cy")
first = q.popleft()
q.append("Di")
print(first, list(q))`,
          predict: { question: 'A bank teller queue. What prints?', options: ["Cy ['Ann', 'Bo', 'Di']", "Ann ['Bo', 'Cy', 'Di']", "Di ['Ann', 'Bo', 'Cy']", "Ann ['Di', 'Bo', 'Cy']"], answer: 1, explain: 'Queues are FIFO: `popleft()` serves whoever arrived first (Ann). New arrivals join at the right.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'Why not `list.pop(0)`?',
          text: 'A list stores items in one contiguous row. `pop(0)` removes box 0 and then **shifts every other item one box left** — O(n). Serving 100,000 customers that way is ~5 billion moves. `deque` is a double-ended queue: `append`, `appendleft`, `pop` and `popleft` are all **O(1)**.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `import heapq

h = []
for x in [5, 1, 8, 3]:
    heapq.heappush(h, x)
print(h[0], heapq.heappop(h), h[0])`,
          predict: { question: 'A min-heap. What prints?', options: ['5 5 1', '1 1 3', '1 1 1', '8 8 5'], answer: 1, explain: 'The smallest item always sits at `h[0]`. `heappop` removes it (1), and the next smallest (3) bubbles up to `h[0]`.' },
          trace: { view: 'array', var: 'h' },
          note: 'A heap is a list arranged as a tree: the children of index `i` live at `2*i + 1` and `2*i + 2`, and every parent ≤ its children. `heappush` / `heappop` are **O(log n)**, peeking `h[0]` is **O(1)**, `heapify(list)` is **O(n)**. For a max-heap, push negated values.',
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: plates, tellers, triage',
          text: '**Stack** = a spring-loaded plate dispenser (take from the top). **Queue** = the teller line at your branch (first come, first served). **Heap** = the ER: the most urgent patient goes next, no matter when they walked in.',
        },
        {
          kind: 'challenge',
          id: 'py06-l2-c2',
          lang: 'python',
          title: 'Serve requests by priority',
          prompt: 'Bank support requests arrive as `(priority, name)` tuples — **lower number = more urgent**. Write `serve_order(requests)` returning the names in the order they are served. Equal priorities are served in **arrival order**. Use `heapq`.',
          starter: `import heapq

def serve_order(requests):
    return [name for priority, name in requests]
`,
          hints: [
            'Push every request onto a heap, then pop until it is empty, collecting names.',
            'Tuples compare item by item. To break ties by arrival, push `(priority, i, name)` where `i` comes from `enumerate`.',
            'Without `i`, ties would be broken alphabetically by name — try it and see a test fail.',
          ],
          solution: `import heapq

def serve_order(requests):
    h = []
    for i, (priority, name) in enumerate(requests):
        heapq.heappush(h, (priority, i, name))
    out = []
    while h:
        out.append(heapq.heappop(h)[2])
    return out
`,
          explain: '`(priority, arrival_index, item)` is the standard heap entry: the index makes ties deterministic (and stops Python from ever comparing the items themselves). n pushes + n pops = O(n log n).',
          py: {
            tests: [
              'serve_order([(2, "loan"), (1, "fraud"), (3, "statement"), (1, "lost card")])',
              'serve_order([])',
              'serve_order([(5, "only")])',
              'serve_order([(1, "zed"), (1, "amy"), (1, "kim")])',
            ],
            mustInclude: ['heapq'],
          },
          trace: { view: 'array', var: 'h' },
        },
        {
          kind: 'quiz',
          id: 'py06-l2-q1',
          q: 'You need the **3 largest** of 10 million transaction amounts, streamed one at a time. What is the best approach?',
          options: ['Append all to a list, then sort: O(n log n) time, O(n) memory', 'Keep a min-heap of size 3; push each amount and pop when size > 3: O(n log 3) time, O(1) memory', 'Use a stack and pop 3 times', 'Use a deque and popleft 3 times'],
          answer: 1,
          explain: 'The size-k min-heap keeps the k largest seen so far; its root is the weakest of them and gets evicted first. This "top-k with a heap" pattern is everywhere in interviews.',
        },
        { kind: 'recall', prompt: 'For each of stack / queue / heap: which item leaves next, and which Python tool do you use?', answer: 'Stack: newest (LIFO) — `list.append` / `list.pop()`. Queue: oldest (FIFO) — `deque.append` / `deque.popleft()`. Heap: smallest — `heapq.heappush` / `heapq.heappop`.' },
        { kind: 'explain', id: 'py06-l2-e1', prompt: 'Explain why a stack is the right tool for checking brackets like `([)]`, and what would go wrong with a queue.' },
      ],
      cards: [
        { id: 'py06-l2-k1', kind: 'predict', code: 'st = [1, 2, 3]\nst.pop()\nst.append(9)\nprint(st)', options: ['[1, 2, 3, 9]', '[1, 2, 9]', '[9, 2, 3]', '[2, 3, 9]'], answer: 1 },
        { id: 'py06-l2-k2', kind: 'predict', code: 'from collections import deque\nq = deque([1, 2, 3])\nq.popleft()\nq.append(4)\nprint(list(q))', options: ['[1, 2, 3]', '[2, 3, 4]', '[1, 2, 4]', '[4, 2, 3]'], answer: 1 },
        { id: 'py06-l2-k3', kind: 'concept', front: 'Cost of `list.pop(0)` vs `deque.popleft()`?', back: '`list.pop(0)` is O(n) (every item shifts left). `deque.popleft()` is O(1). Use deque for queues / BFS.' },
        { id: 'py06-l2-k4', kind: 'cloze', text: 'In a `heapq` heap the smallest item is at `h[{{}}]`; `heappush` / `heappop` cost O({{}}).', answers: ['0', 'log n'] },
        { id: 'py06-l2-k5', kind: 'concept', front: '`heapq` is a min-heap. How do you get max-heap behaviour?', back: 'Push negated keys: `heappush(h, -x)`, and negate again when you pop: `-heappop(h)`.' },
      ],
    },

    // ─────────────────────────────────────────────────────────────── L3
    {
      id: 'py06-l3',
      track: 'python',
      title: 'Hash maps under the hood',
      summary: 'Why dict lookups are O(1): hash the key, jump to a bucket, check a few items. Then use it for two-sum and anagrams.',
      minutes: 17,
      faang: 'The hash map is the single most useful tool in coding interviews: "can I trade memory for time with a dict?" turns many O(n²) brute forces into O(n). Interviewers at Google/Meta also like to ask how a dict works inside — buckets, collisions and resizing.',
      tags: ['Hash map', 'dict', 'Hashing', 'Collisions', 'Two sum', 'Group anagrams'],
      cells: [
        {
          kind: 'md',
          text: `A dict feels like magic: \`balances["acct-9921"]\` is instant even with a million keys. Under the hood it is an **array of buckets**:

1. compute \`hash(key)\` — a big integer
2. \`hash(key) % number_of_buckets\` → a bucket index
3. look only inside that one bucket

Insert some keys below and watch where they land — and what happens when two land in the same bucket.`,
        },
        { kind: 'viz', viz: { type: 'hashmap', keys: ['alice', 'bob', 'carol', 'dave', 'erin', 'frank', 'grace'] }, caption: 'Two keys landing in the same bucket is a **collision**. The bucket then holds a short chain, and lookup checks each item in it.' },
        {
          kind: 'code',
          lang: 'python',
          code: `def my_hash(key):
    return sum(ord(c) for c in key)

buckets = [[], [], [], []]
for name in ["ann", "bob", "cy", "nan"]:
    i = my_hash(name) % 4
    buckets[i].append(name)
print(buckets)`,
          predict: { question: 'Our toy hash adds up the letter codes. Which two names end up in the **same bucket**?', options: ['ann & nan', 'bob & cy', 'ann & bob', 'No collisions'], answer: 0, fromOutput: false, explain: '"ann" and "nan" have the same letters, so the same letter-sum → same bucket. Real hash functions mix the bits so anagrams don\'t collide so easily.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'code',
          lang: 'python',
          code: `def my_hash(key):
    return sum(ord(c) for c in key)

buckets = [[] for _ in range(4)]

def put(key, value):
    b = buckets[my_hash(key) % len(buckets)]
    for pair in b:
        if pair[0] == key:
            pair[1] = value
            return
    b.append([key, value])

def get(key):
    b = buckets[my_hash(key) % len(buckets)]
    for k, v in b:
        if k == key:
            return v
    return None

put("ann", 10)
put("nan", 20)
put("ann", 30)
print(get("ann"), get("nan"), get("zed"))`,
          predict: { question: 'A tiny dict built from scratch. What prints?', options: ['10 20 None', '30 20 None', '30 30 None', '10 20 0'], answer: 1, explain: 'The second `put("ann", …)` finds the existing pair in its bucket and overwrites it. "nan" shares the bucket but is a different key, so it keeps 20.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: the coat check',
          text: 'The hash is your **ticket number**, it tells the attendant which hook to go to. A collision is **two coats on one hook**: they check the few coats on that hook, never the whole room. That\'s why lookup is O(1) on average.',
        },
        {
          kind: 'callout',
          tone: 'why',
          title: 'Why it stays O(1): resizing',
          text: 'If buckets get crowded, lookups slow down. So Python **grows the table** (roughly doubling) when it is about 2/3 full and re-places every key. A resize is O(n), but it happens so rarely that inserts are still **O(1) amortized**. Worst case (every key collides) is O(n), and a good hash function makes that extremely unlikely.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `d = {}
d[[1, 2]] = "x"`,
          error: true,
          note: 'Keys must be **hashable**: their hash can never change. A list can be mutated after it is stored, which would leave it in the wrong bucket, so lists are refused. Use a tuple instead: `d[(1, 2)] = "x"` works.',
        },
        {
          kind: 'challenge',
          id: 'py06-l3-c1',
          lang: 'python',
          title: 'Two sum (one pass)',
          prompt: 'Write `two_sum(nums, target)` returning `[i, j]` (with `i < j`) such that `nums[i] + nums[j] == target`, or `[]` if no pair exists. Aim for **O(n)** with a dict.',
          starter: `def two_sum(nums, target):
    return []
`,
          hints: [
            'For each number `x`, the partner you need is `target - x`. Have you seen it before?',
            'Keep `seen = {}` mapping value → index. Check `if target - x in seen` **before** storing `x`.',
            'Return `[seen[target - x], i]`; otherwise store `seen[x] = i`.',
          ],
          solution: `def two_sum(nums, target):
    seen = {}
    for i, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], i]
        seen[x] = i
    return []
`,
          explain: 'Brute force checks every pair: O(n²). The dict remembers everything seen so far, so each "have I seen my partner?" question is O(1) — total O(n) time, O(n) memory. Checking before storing stops a number from pairing with itself.',
          py: { tests: ['two_sum([2, 7, 11, 15], 9)', 'two_sum([3, 2, 4], 6)', 'two_sum([3, 3], 6)', 'two_sum([1, 2], 7)', 'two_sum([], 0)'] },
          trace: { view: 'array', var: 'nums', pointers: ['i'] },
        },
        {
          kind: 'challenge',
          id: 'py06-l3-c2',
          lang: 'python',
          title: 'Group anagrams',
          prompt: 'Write `group_anagrams(words)` that groups words made of the same letters. To make the answer unique, **sort the words inside each group**, then **sort the list of groups**.\n\n`["eat","tea","tan","ate","nat","bat"]` → `[[\'ate\', \'eat\', \'tea\'], [\'bat\'], [\'nat\', \'tan\']]`',
          starter: `def group_anagrams(words):
    return [[w] for w in sorted(words)]
`,
          hints: [
            'Anagrams share a **signature**: their letters sorted. `"".join(sorted("tea"))` → `"aet"`.',
            'Use `groups = defaultdict(list)` (from `collections`) and `groups[signature].append(w)`.',
            'Finish with `sorted(sorted(g) for g in groups.values())`.',
          ],
          solution: `from collections import defaultdict

def group_anagrams(words):
    groups = defaultdict(list)
    for w in words:
        groups["".join(sorted(w))].append(w)
    return sorted(sorted(g) for g in groups.values())
`,
          explain: 'The trick is choosing a **key** that is identical for everything that belongs together. The key must be hashable — a string or tuple, never a list.',
          py: {
            tests: [
              'group_anagrams(["eat", "tea", "tan", "ate", "nat", "bat"])',
              'group_anagrams([])',
              'group_anagrams([""])',
              'group_anagrams(["ab", "ba", "ab"])',
              'group_anagrams(["abc", "def"])',
            ],
          },
        },
        {
          kind: 'quiz',
          id: 'py06-l3-q1',
          q: 'Which of these can be a **dict key**?',
          options: ['`[1, 2]`', '`(1, 2)`', '`{1, 2}`', '`{"a": 1}`'],
          answer: 1,
          explain: 'Tuples (of hashable items) are immutable, so their hash never changes. Lists, sets and dicts are mutable and therefore unhashable.',
        },
        { kind: 'recall', prompt: 'Describe the 3 steps a dict takes to find `d[key]`, and what happens on a collision.', answer: '1) compute `hash(key)` 2) take it modulo the table size to pick a bucket 3) compare keys in that bucket. On a collision, several entries share a bucket (chaining) or probe to the next slot (Python uses open addressing) — either way only a few items are checked.' },
        { kind: 'explain', id: 'py06-l3-e1', prompt: 'Explain how a dict turns two-sum from O(n²) into O(n). What are you trading?' },
      ],
      cards: [
        { id: 'py06-l3-k1', kind: 'concept', front: 'dict / set lookup, insert, delete: average and worst-case Big-O?', back: 'Average O(1) (amortized for inserts). Worst case O(n) if everything collides.' },
        { id: 'py06-l3-k2', kind: 'predict', code: 'd = {}\nd["a"] = 1\nd["a"] = 2\nprint(len(d), d["a"])', options: ['2 1', '1 2', '2 2', '1 1'], answer: 1 },
        { id: 'py06-l3-k3', kind: 'cloze', text: 'Bucket index = `hash(key) {{}} number_of_buckets`', answers: ['%'] },
        { id: 'py06-l3-k4', kind: 'concept', front: 'Why can\'t a list be a dict key?', back: 'Lists are mutable, so their hash could change after insertion and the key would sit in the wrong bucket. Python refuses: `TypeError: unhashable type: \'list\'`. Use a tuple.' },
        { id: 'py06-l3-k5', kind: 'predict', code: 'print((1, 2) in {(1, 2): "x"}, [1] == [1])', options: ['True True', 'False True', 'True False', 'Error'], answer: 0 },
      ],
    },

    // ─────────────────────────────────────────────────────────────── L4
    {
      id: 'py06-l4',
      track: 'python',
      title: 'Binary trees & BSTs',
      summary: 'Nodes with two arrows: build a binary search tree, search it in O(log n), and walk it in-order, pre-order and level by level.',
      minutes: 20,
      faang: 'Trees are among the most common topics in Meta/Google/Amazon-style coding rounds: max depth, validate BST, level-order traversal, lowest common ancestor. Almost every tree answer is "handle `None`, recurse left, recurse right, combine".',
      tags: ['Binary tree', 'BST', 'Recursion', 'Inorder', 'Preorder', 'Level-order', 'BFS'],
      cells: [
        {
          kind: 'md',
          text: `Give a node **two** arrows instead of one — \`left\` and \`right\` — and you get a **binary tree**.

A **binary search tree (BST)** adds one rule: everything in the left subtree is **smaller** than the node, everything in the right subtree is **larger or equal**. Inserting is a walk: go left if smaller, right otherwise, until you find an empty spot.

Watch \`[5, 3, 8, 1, 4]\` get inserted one by one.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `class TreeNode:
    def __init__(self, val):
        self.val = val
        self.left = None
        self.right = None

def insert(root, val):
    if root is None:
        return TreeNode(val)
    if val < root.val:
        root.left = insert(root.left, val)
    else:
        root.right = insert(root.right, val)
    return root

root = None
for v in [5, 3, 8, 1, 4]:
    root = insert(root, v)
print(root.val, root.left.val, root.right.val)`,
            trace: { view: 'heap' },
          },
          caption: 'The heap view draws objects with `left` / `right` attributes as a tree. Each insert walks one path from the root down — O(height).',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `${TREE}

root = TreeNode(5, TreeNode(3, TreeNode(1), TreeNode(4)), TreeNode(8))
node = root
path = []
while node:
    path.append(node.val)
    if node.val == 4:
        break
    node = node.left if 4 < node.val else node.right
print(path)`,
          predict: { question: 'Searching for 4. Which nodes do we visit?', options: ['[5, 3, 1, 4]', '[5, 3, 4]', '[1, 3, 4]', '[5, 8, 4]'], answer: 1, explain: '4 < 5 → go left to 3. 4 > 3 → go right to 4. Found. We never touch 1 or 8: every comparison throws away a whole subtree.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: "higher or lower?"',
          text: 'A BST is the guessing game "I\'m thinking of a number — higher or lower?" baked into memory. A **balanced** tree halves the candidates each step → **O(log n)**. But insert already-sorted data (1, 2, 3, 4…) and every node goes right: the tree becomes a **linked list** and search degrades to **O(n)**.',
        },
        {
          kind: 'md',
          text: `Three ways to walk every node — the only difference is **when you visit the node itself**:

- **Preorder**: node, left, right (copy a tree, serialize it)
- **Inorder**: left, node, right — on a BST this gives **sorted order**
- **Postorder**: left, right, node (delete a tree, compute sizes)

Each is three lines of recursion. Watch the call tree for inorder.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `${TREE}

def inorder(node, out):
    if node is None:
        return out
    inorder(node.left, out)
    out.append(node.val)
    inorder(node.right, out)
    return out

root = TreeNode(5, TreeNode(3, TreeNode(1), TreeNode(4)), TreeNode(8))
print(inorder(root, []))`,
            trace: { view: 'calltree', fn: 'inorder' },
          },
          caption: 'Every call on `None` returns immediately — that base case is what stops the recursion. Values are appended in the order 1, 3, 4, 5, 8: sorted.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `${TREE}

def preorder(node):
    if node is None:
        return []
    return [node.val] + preorder(node.left) + preorder(node.right)

root = TreeNode(5, TreeNode(3, TreeNode(1), TreeNode(4)), TreeNode(8))
print(preorder(root))`,
          predict: { question: 'Same tree, **pre**order. What prints?', options: ['[1, 3, 4, 5, 8]', '[5, 3, 1, 4, 8]', '[5, 3, 8, 1, 4]', '[1, 4, 3, 8, 5]'], answer: 1, explain: 'Node first (5), then the whole left subtree in preorder (3, 1, 4), then the right (8). `[5, 3, 8, 1, 4]` would be level-order; `[1, 4, 3, 8, 5]` is postorder.' },
          trace: { view: 'calltree', fn: 'preorder' },
        },
        {
          kind: 'challenge',
          id: 'py06-l4-c1',
          lang: 'python',
          title: 'How tall is the tree?',
          prompt: 'Write `height(root)`: the number of nodes on the longest path from the root down to a leaf. An empty tree (`None`) has height 0. `build(vals)` inserts values into a BST for the tests.',
          starter: `${TREE_HELPERS}

def height(root):
    if root is None:
        return 0
    return 1 + height(root.left)
`,
          hints: [
            'The starter only looks down the **left** side. What about a tree that leans right?',
            'The height is 1 (for this node) + the taller of the two subtrees.',
            '`return 1 + max(height(root.left), height(root.right))`',
          ],
          solution: `${TREE_HELPERS}

def height(root):
    if root is None:
        return 0
    return 1 + max(height(root.left), height(root.right))
`,
          explain: 'The universal tree recipe: base case for `None`, recurse on both children, combine the answers. Each node is visited once → O(n). Note the sorted input `[1, 2, 3, 4]` builds a height-4 "stick".',
          py: { tests: ['height(build([5, 3, 8, 1, 4]))', 'height(None)', 'height(build([7]))', 'height(build([1, 2, 3, 4]))', 'height(build([2, 2, 2]))'] },
          trace: { view: 'calltree', fn: 'height' },
        },
        {
          kind: 'code',
          lang: 'python',
          code: `from collections import deque
${TREE}

root = TreeNode(5, TreeNode(3, TreeNode(1), TreeNode(4)), TreeNode(8))
order = []
q = deque([root])
while q:
    node = q.popleft()
    order.append(node.val)
    if node.left:
        q.append(node.left)
    if node.right:
        q.append(node.right)
print(order)`,
          predict: { question: '**Level-order** uses a queue instead of recursion. What prints?', options: ['[5, 3, 1, 4, 8]', '[5, 3, 8, 1, 4]', '[1, 3, 4, 5, 8]', '[5, 8, 3, 4, 1]'], answer: 1, explain: 'The queue serves nodes in the order they were discovered: the root, then its children (3, 8), then their children (1, 4) — top to bottom, left to right. This is **BFS** on a tree.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'challenge',
          id: 'py06-l4-c2',
          lang: 'python',
          title: 'Level by level',
          prompt: 'Write `levels(root)` returning a list of lists — one inner list per depth, left to right. For the tree from `[5, 3, 8, 1, 4]` that is `[[5], [3, 8], [1, 4]]`. Empty tree → `[]`.',
          starter: `from collections import deque
${TREE_HELPERS}

def levels(root):
    out = []
    q = deque([root])
    while q:
        node = q.popleft()
        out.append([node.val])
        if node.left:
            q.append(node.left)
        if node.right:
            q.append(node.right)
    return out
`,
          hints: [
            'Handle `root is None` first (the starter crashes on it).',
            'At the start of each round, the queue holds **exactly one whole level**. Remember `size = len(q)`.',
            'Pop exactly `size` nodes into a `level` list (pushing their children), then `out.append(level)`.',
          ],
          solution: `from collections import deque
${TREE_HELPERS}

def levels(root):
    if root is None:
        return []
    out = []
    q = deque([root])
    while q:
        level = []
        for _ in range(len(q)):
            node = q.popleft()
            level.append(node.val)
            if node.left:
                q.append(node.left)
            if node.right:
                q.append(node.right)
        out.append(level)
    return out
`,
          explain: 'The "snapshot the queue size" trick separates levels without storing depths. It is the backbone of right-side view, zigzag order and min-depth problems.',
          py: { tests: ['levels(build([5, 3, 8, 1, 4]))', 'levels(None)', 'levels(build([1]))', 'levels(build([1, 2, 3]))', 'levels(build([4, 2, 6, 1, 3, 5, 7]))'] },
          trace: { view: 'heap' },
        },
        {
          kind: 'quiz',
          id: 'py06-l4-q1',
          q: 'You insert `10, 20, 30, 40, 50` (in that order) into an empty BST. How many comparisons does searching for 50 take?',
          options: ['About log₂(5) ≈ 2', '5 — the tree is a straight line', '1', 'It depends on the hash'],
          answer: 1,
          explain: 'Sorted inserts always go right, making a degenerate "linked list" tree of height 5. Self-balancing trees (AVL, red-black) exist to prevent exactly this.',
        },
        { kind: 'recall', prompt: 'Which traversal of a BST returns the values in sorted order, and what order does it visit things in?', answer: 'Inorder: left subtree, node, right subtree.' },
        { kind: 'explain', id: 'py06-l4-e1', prompt: 'Explain the difference between DFS-style traversals (pre/in/post-order) and level-order. Which data structure drives each one?' },
      ],
      cards: [
        { id: 'py06-l4-k1', kind: 'concept', front: 'BST search / insert Big-O: balanced vs degenerate?', back: 'Balanced: O(log n). Degenerate (e.g. sorted inserts → a stick): O(n). Cost is always O(height).' },
        { id: 'py06-l4-k2', kind: 'cloze', text: 'Inorder traversal visits: left, {{}}, right — and on a BST that gives {{}} order.', answers: ['node', 'sorted'] },
        { id: 'py06-l4-k3', kind: 'predict', code: `${TREE}\n\ndef count(n):\n    if n is None:\n        return 0\n    return 1 + count(n.left) + count(n.right)\n\nprint(count(TreeNode(2, TreeNode(1), TreeNode(3, None, TreeNode(4)))))`, options: ['3', '4', '2', '5'], answer: 1 },
        { id: 'py06-l4-k4', kind: 'concept', front: 'Which data structure powers level-order traversal, and which powers preorder/inorder?', back: 'Level-order (BFS): a queue (`deque`). Pre/in/post-order (DFS): recursion, i.e. the call stack (or an explicit stack).' },
        { id: 'py06-l4-k5', kind: 'cloze', text: 'Tree height: `return 1 + {{}}(height(root.left), height(root.right))`', answers: ['max'] },
      ],
    },

    // ─────────────────────────────────────────────────────────────── L5
    {
      id: 'py06-l5',
      track: 'python',
      title: 'Graphs: BFS & DFS',
      summary: 'Store a network as a dict of neighbour lists, then explore it in ripples (BFS) or by diving deep (DFS).',
      minutes: 20,
      faang: 'Graph traversal is among the most frequent Medium topics in Google/Meta/Amazon-style loops — often disguised as grids, friend networks, course prerequisites or money transfers. Interviewers watch for a visited set and the right choice between BFS and DFS.',
      tags: ['Graph', 'Adjacency list', 'BFS', 'DFS', 'Visited set', 'Connected components'],
      cells: [
        {
          kind: 'md',
          text: `A **graph** is dots (nodes) and lines (edges): accounts that sent money to each other, friends, flights. The interview-standard way to store one is an **adjacency dict** — each node maps to the list of its neighbours:

\`\`\`python
graph = {"A": ["B", "C"], "B": ["D"], ...}
\`\`\`

**BFS** (breadth-first search) explores in rings: first everything 1 hop away, then 2 hops… using a **queue**. Watch the highlighted visited nodes spread.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `from collections import deque

graph = {
    "A": ["B", "C"],
    "B": ["D"],
    "C": ["D", "E"],
    "D": ["F"],
    "E": ["F"],
    "F": [],
}
visited = ["A"]
q = deque(["A"])
while q:
    node = q.popleft()
    for nb in graph[node]:
        if nb not in visited:
            visited.append(nb)
            q.append(nb)
print(visited)`,
            trace: { view: 'graph', var: 'graph', pointers: ['visited'] },
          },
          caption: 'A node is marked visited the moment it is **enqueued**, so D is only added once even though both B and C point to it. (We use a list here so the order is easy to see; real code uses a `set` for O(1) membership.)',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `from collections import deque

graph = {1: [2, 3], 2: [4], 3: [4, 5], 4: [6], 5: [], 6: []}
seen = {1}
q = deque([1])
order = []
while q:
    node = q.popleft()
    order.append(node)
    for nb in graph[node]:
        if nb not in seen:
            seen.add(nb)
            q.append(nb)
print(order)`,
          predict: { question: 'BFS from 1. What order are nodes served in?', options: ['[1, 2, 4, 6, 3, 5]', '[1, 2, 3, 4, 5, 6]', '[1, 3, 5, 2, 4, 6]', '[6, 4, 2, 5, 3, 1]'], answer: 1, explain: 'Ring 0: 1. Ring 1: 2, 3. Ring 2: 4 (from 2), 5 (from 3). Ring 3: 6. The queue serves rings in order.' },
          trace: { view: 'graph', var: 'graph', pointers: ['order'] },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: ripples vs. maze explorer',
          text: '**BFS = ripples in a pond** — a stone drops and the circle grows evenly (queue). **DFS = a maze explorer with chalk** — follow one corridor as deep as it goes, chalk-mark every junction, back up only at a dead end (recursion / stack).',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `graph = {"A": ["B", "C"], "B": ["D"], "C": ["E"], "D": [], "E": []}
order = []

def dfs(node):
    order.append(node)
    for nb in graph[node]:
        if nb not in order:
            dfs(nb)

dfs("A")
print(order)`,
          predict: { question: '**DFS** (recursive) from A. What prints?', options: ["['A', 'B', 'C', 'D', 'E']", "['A', 'B', 'D', 'C', 'E']", "['A', 'C', 'E', 'B', 'D']", "['D', 'B', 'E', 'C', 'A']"], answer: 1, explain: 'DFS dives: A → B → D (dead end, back up) → C → E. The BFS order would be A, B, C, D, E.' },
          trace: { view: 'calltree', fn: 'dfs' },
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'Forgetting "visited"',
          text: 'Real graphs have **cycles** (A → B → A). Without a visited set, BFS/DFS loops forever. In BFS, mark a node when you **enqueue** it — marking when you pop lets the same node enter the queue many times.',
        },
        {
          kind: 'challenge',
          id: 'py06-l5-c1',
          lang: 'python',
          title: 'Can money flow from src to dst?',
          prompt: 'Accounts are nodes; `graph[a]` lists the accounts `a` has sent money to. Write `has_path(graph, src, dst)` that returns `True` if money can flow from `src` to `dst` along the arrows (a node always reaches itself).',
          starter: `from collections import deque

def has_path(graph, src, dst):
    return dst in graph[src]
`,
          hints: [
            'The starter only checks direct neighbours (1 hop). You need any number of hops → BFS.',
            'Start with `seen = {src}` and `q = deque([src])`. Pop a node; if it is `dst`, return `True`.',
            'Push each unseen neighbour (adding it to `seen` as you push). If the queue empties, return `False`.',
          ],
          solution: `from collections import deque

def has_path(graph, src, dst):
    seen = {src}
    q = deque([src])
    while q:
        node = q.popleft()
        if node == dst:
            return True
        for nb in graph[node]:
            if nb not in seen:
                seen.add(nb)
                q.append(nb)
    return False
`,
          explain: 'Each node is enqueued at most once and each edge examined once: **O(V + E)**. The visited set is what makes the cycle test (`a → b → a`) terminate.',
          py: {
            tests: [
              'has_path({"a": ["b"], "b": ["c"], "c": []}, "a", "c")',
              'has_path({"a": ["b"], "b": ["c"], "c": []}, "c", "a")',
              'has_path({"a": ["b"], "b": ["a"], "x": []}, "a", "x")',
              'has_path({"a": []}, "a", "a")',
              'has_path({"a": ["b", "c"], "b": [], "c": ["d"], "d": []}, "a", "d")',
            ],
          },
          trace: { view: 'graph', var: 'graph', pointers: ['seen'] },
        },
        {
          kind: 'md',
          text: `**Undirected** edges (friendships, "these two accounts share a phone number") are usually given as pairs. Build the adjacency dict by adding **both** directions:

\`\`\`python
graph = defaultdict(list)
for a, b in edges:
    graph[a].append(b)
    graph[b].append(a)
\`\`\`

A **connected component** is a group of nodes all reachable from each other. Count them by starting a traversal from every node that is not yet visited — each fresh start is a new component.`,
        },
        {
          kind: 'challenge',
          id: 'py06-l5-c2',
          lang: 'python',
          title: 'Count linked-account clusters',
          prompt: 'Accounts are numbered `0 .. n-1`. Each pair in `edges` means two accounts are linked (undirected). Write `count_components(n, edges)` returning the number of separate clusters. Isolated accounts count as their own cluster.',
          starter: `def count_components(n, edges):
    return n - len(edges)
`,
          hints: [
            'The starter breaks when edges form a cycle. Build the graph with `defaultdict(list)`, adding both directions.',
            'Loop `for start in range(n):` — if `start` is not in `seen`, that\'s a new cluster: `count += 1`.',
            'Then traverse (DFS with a stack list, or BFS) from `start`, adding everything reachable to `seen`.',
          ],
          solution: `from collections import defaultdict

def count_components(n, edges):
    graph = defaultdict(list)
    for a, b in edges:
        graph[a].append(b)
        graph[b].append(a)
    seen = set()
    count = 0
    for start in range(n):
        if start in seen:
            continue
        count += 1
        seen.add(start)
        stack = [start]
        while stack:
            node = stack.pop()
            for nb in graph[node]:
                if nb not in seen:
                    seen.add(nb)
                    stack.append(nb)
    return count
`,
          explain: 'An iterative DFS is just BFS with a stack instead of a queue. Each node and edge is touched once: O(V + E). This "count the fresh starts" pattern is exactly Number of Islands, on a grid.',
          py: {
            tests: [
              'count_components(5, [[0, 1], [1, 2], [3, 4]])',
              'count_components(3, [])',
              'count_components(4, [[0, 1], [1, 2], [2, 3], [3, 0]])',
              'count_components(1, [])',
              'count_components(0, [])',
            ],
          },
        },
        {
          kind: 'callout',
          tone: 'interview',
          title: 'How this is asked',
          text: 'Graphs rarely say "graph". Look for: *grid of land/water* (each cell is a node), *dependencies / prerequisites* (directed graph → topological sort), *fewest steps / transfers* (BFS), *groups / clusters* (components, or union-find). State the representation and the **O(V + E)** cost out loud.',
        },
        {
          kind: 'quiz',
          id: 'py06-l5-q1',
          q: 'You need the **fewest hops** between two people in an (unweighted) friend network. Which traversal?',
          options: ['DFS, because it goes deep fast', 'BFS, because it explores in order of distance', 'Either — they always find the same path', 'Sort the friends first'],
          answer: 1,
          explain: 'BFS reaches every node at distance 1 before any node at distance 2, so the first time it meets the target is via a shortest path. DFS may find a long winding path first.',
        },
        { kind: 'recall', prompt: 'Write (in your head) the BFS skeleton with a queue and a visited set.', answer: '`seen = {start}; q = deque([start])` → `while q: node = q.popleft()` → `for nb in graph[node]: if nb not in seen: seen.add(nb); q.append(nb)`.' },
        { kind: 'explain', id: 'py06-l5-e1', prompt: 'Explain why BFS and DFS both run in O(V + E), and give one situation where you would pick each.' },
      ],
      cards: [
        { id: 'py06-l5-k1', kind: 'concept', front: 'BFS vs DFS: which data structure drives each?', back: 'BFS: a queue (`deque.popleft`) — explores by distance. DFS: recursion or a stack (`list.pop`) — explores deep first.' },
        { id: 'py06-l5-k2', kind: 'concept', front: 'Time complexity of BFS / DFS on an adjacency list?', back: 'O(V + E): every vertex is visited once and every edge is looked at once (twice if undirected).' },
        { id: 'py06-l5-k3', kind: 'cloze', text: 'BFS in Python: `q = collections.{{}}([start])`, then `node = q.{{}}()`', answers: ['deque', 'popleft'] },
        { id: 'py06-l5-k4', kind: 'predict', code: 'g = {"a": ["b", "c"], "b": ["c"], "c": []}\nprint(sum(len(v) for v in g.values()))', options: ['2', '3', '4', '6'], answer: 1 },
        { id: 'py06-l5-k5', kind: 'concept', front: 'In BFS, when should a node be marked visited?', back: 'When it is enqueued (pushed), not when it is popped — otherwise the same node can enter the queue many times.' },
      ],
    },
  ],
};
