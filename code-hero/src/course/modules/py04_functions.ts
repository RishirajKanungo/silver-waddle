import type { Module } from '../types';

export const module: Module = {
  id: 'py04',
  track: 'python',
  order: 4,
  title: 'Functions, Scope & Recursion',
  icon: '🧩',
  level: 'Core',
  blurb: 'Watch every call get its own frame, see recursion as a tree, and make slow recursion fast with memoization.',
  boss: ['py-gym-flatten-nested', 'py-gym-power-set'],
  lessons: [
    {
      id: 'py04-l1',
      track: 'python',
      title: 'Parameters, return & the mutable-default trap',
      summary: 'Defaults, keyword arguments, *args/**kwargs, return vs print — and the famous shared-default bug.',
      minutes: 15,
      faang: 'Graders and interviewers call your function and check what it **returns** — printing instead is an instant fail. The mutable-default-argument bug (`def f(x, acc=[])`) is one of the most-asked Python "gotcha" questions in Google/Meta-style screens.',
      tags: ['Functions', 'Default arguments', '*args/**kwargs', 'Mutable default trap'],
      cells: [
        {
          kind: 'md',
          text: `A function is a **named recipe**: inputs (parameters) in, one result (\`return\`) out. Parameters can have **defaults**, and callers can pass arguments **by name**.

Step through and watch a fresh frame appear for each call — with \`rate\` and \`minimum\` filled in from the defaults when the caller leaves them out.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `def fee(amount, rate=0.02, minimum=1):
    return max(amount * rate, minimum)

a = fee(100)
b = fee(1000, rate=0.01)
c = fee(10, minimum=5)
print(a, b, c)`,
            trace: { view: 'heap' },
          },
          caption: 'Keyword arguments (`rate=0.01`) can skip over parameters you want to leave at their default.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `def double(x):
    print(x * 2)

result = double(4)
print(result)`,
          predict: { question: 'What does the **last** line print?', options: ['8', 'None', '16', 'Error'], answer: 1, fromOutput: false, explain: '`double` **prints** 8 but returns nothing — and a function with no `return` returns `None`. So `result` is `None`.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: shout vs hand over',
          text: '`print` is **shouting** the answer into the room — the caller can\'t catch it. `return` **hands** the answer back so the caller can store it, test it, or pass it on.',
        },
        {
          kind: 'md',
          text: `**Flexible arguments:**

- \`*args\` collects extra **positional** arguments into a **tuple**
- \`**kwargs\` collects extra **keyword** arguments into a **dict**
- Anything after \`*args\` must be passed by keyword (\`currency=...\`)

Order in a signature: normal → \`*args\` → keyword-only → \`**kwargs\`.`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `def total(*amounts, currency="USD", **meta):
    return f"{sum(amounts)} {currency} {meta}"

print(total(5, 10, 20))
print(total(1, 2, currency="EUR", source="atm"))`,
          predict: { question: 'Inside the function, what **type** is `amounts`?', options: ['list', 'tuple', 'dict', 'int'], answer: 1, fromOutput: false, explain: '`*amounts` packs the positional arguments into a **tuple**: `(5, 10, 20)`. `**meta` is a dict: `{"source": "atm"}`.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'md',
          text: `**The mutable-default trap.** A default value is created **once**, when the \`def\` line runs — not on every call. If that default is a list, *every* call that relies on it shares the **same list**. Predict, then step through and watch the single list in the heap grow:`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `def add_txn(t, log=[]):
    log.append(t)
    return log

a = add_txn("coffee")
b = add_txn("rent")
print(a)`,
          predict: { question: 'What prints?', options: ["['coffee']", "['coffee', 'rent']", "['rent']", 'Error'], answer: 1, explain: 'Both calls append to the **same** default list, and `a` and `b` are two names for it. The arrows in the heap view make this obvious.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'The fix: default to None',
          text: 'Use `None` as the default and create the list **inside** the function:\n\n```python\ndef add_txn(t, log=None):\n    if log is None:\n        log = []\n```\n\nNow each call gets a fresh list unless the caller passes one.',
        },
        {
          kind: 'challenge',
          id: 'py04-l1-c1',
          lang: 'python',
          title: 'Fix the shared cart',
          prompt: '`add_item(item, cart)` should append `item` to `cart` and return it. If no cart is passed, it must start a **new, empty** cart every time.',
          starter: 'def add_item(item, cart=[]):\n    cart.append(item)\n    return cart\n',
          hints: ['Call `add_item("a")` twice with the starter — the second call remembers the first.', 'Change the default to `cart=None`.', 'Then `if cart is None: cart = []` before appending.'],
          solution: 'def add_item(item, cart=None):\n    if cart is None:\n        cart = []\n    cart.append(item)\n    return cart\n',
          explain: '`None` is immutable, so sharing it is harmless; the real list is created per call. Use `is None` (not `if not cart`) so an explicitly passed empty list is still used.',
          py: { tests: ['add_item("a")', '(add_item("a"), add_item("b"))[1]', 'add_item("x", ["y"])', '(lambda c: (add_item(1, c), c))([0])'] },
          trace: { view: 'heap' },
        },
        {
          kind: 'challenge',
          id: 'py04-l1-c2',
          lang: 'python',
          title: 'Stats with *args',
          prompt: 'Write `stats(*nums, precision=2)` that returns a tuple `(count, mean)` where `mean` is rounded to `precision` decimals. With no numbers, return `(0, None)`.',
          starter: 'def stats(nums, precision=2):\n    return (len(nums), round(sum(nums) / len(nums), precision))\n',
          hints: ['The tests call `stats(1, 2, 3)` — separate arguments, not a list. Which syntax collects them?', 'Signature: `def stats(*nums, precision=2):` — `precision` becomes keyword-only.', 'Guard the empty case before dividing: `if not nums: return (0, None)`.'],
          solution: 'def stats(*nums, precision=2):\n    if not nums:\n        return (0, None)\n    return (len(nums), round(sum(nums) / len(nums), precision))\n',
          explain: '`*nums` is a tuple, so `len` and `sum` just work. Because `precision` comes after `*nums`, callers must write `precision=1` — it can never be swallowed by accident.',
          py: { tests: ['stats(1, 2, 3)', 'stats()', 'stats(1, 2, precision=0)', 'stats(-1, -2)', 'stats(1, 1, 2, precision=1)'] },
        },
        { kind: 'quiz', id: 'py04-l1-q1', q: 'When is a default argument value like `acc=[]` evaluated?', options: ['On every call', 'Once, when the `def` statement runs', 'Only when the caller omits it', 'When the function returns'], answer: 1, explain: 'Defaults are evaluated once at definition time and stored on the function — that\'s why a mutable default is shared between calls.' },
        { kind: 'recall', prompt: 'Write the safe pattern for a function that needs an optional list argument.', answer: '`def f(x, items=None):` then `if items is None: items = []`.' },
        { kind: 'explain', id: 'py04-l1-e1', prompt: 'Explain the difference between `return` and `print` to someone who has only used Excel formulas.' },
      ],
      cards: [
        { id: 'py04-l1-k1', kind: 'predict', code: 'def f(*a):\n    return len(a)\nprint(f(1, 2, 3))', options: ['1', '3', '(1, 2, 3)', 'Error'], answer: 1 },
        { id: 'py04-l1-k2', kind: 'predict', code: 'def f(x, acc=[]):\n    acc.append(x)\n    return len(acc)\nf(1)\nprint(f(2))', options: ['1', '2', '0', 'Error'], answer: 1 },
        { id: 'py04-l1-k3', kind: 'concept', front: 'What does a function return if it has no `return` statement?', back: '`None`.' },
        { id: 'py04-l1-k4', kind: 'cloze', text: '`*args` collects extra positional arguments into a {{}}; `**kwargs` collects extra keyword arguments into a {{}}.', answers: ['tuple', 'dict'] },
        { id: 'py04-l1-k5', kind: 'predict', code: 'def g(x, y=10):\n    return x + y\nprint(g(1), g(1, 2))', options: ['11 3', '11 12', '1 3', 'Error'], answer: 0 },
      ],
    },
    {
      id: 'py04-l2',
      track: 'python',
      title: 'Scope, frames, closures & lambdas',
      summary: 'Every call gets its own frame; inner functions can carry variables with them; lambdas are tiny throwaway functions.',
      minutes: 16,
      faang: 'Scope questions ("what does this print?") test whether you have a real mental model of frames — common in Python-heavy loops at Google and Meta. Closures power decorators, callbacks and `key=` functions, and `UnboundLocalError` is a classic trick question.',
      tags: ['Scope', 'LEGB', 'Closures', 'nonlocal', 'Lambdas'],
      cells: [
        {
          kind: 'md',
          text: `Every time a function is called, Python creates a fresh **frame** — a private notepad for that call's local variables. When the call returns, the notepad is thrown away.

Step through and watch the frames stack up: \`year_end\` calls \`interest\`, which reads \`rate\` from the **global** frame.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `rate = 0.05

def interest(balance):
    gain = balance * rate
    return round(balance + gain, 2)

def year_end(balances):
    out = []
    for b in balances:
        out.append(interest(b))
    return out

print(year_end([100, 250]))`,
            trace: { view: 'heap' },
          },
          caption: 'Each `interest` call gets its **own** `balance` and `gain`. Two calls never see each other\'s locals.',
        },
        {
          kind: 'md',
          text: `**How Python finds a name — LEGB:** it looks in the **L**ocal frame, then any **E**nclosing function, then **G**lobal (module level), then **B**uilt-ins (\`len\`, \`print\`…). First match wins.

One rule causes most surprises: **assigning** to a name inside a function makes it **local to that whole function** — unless you declare \`global\` or \`nonlocal\`.`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `count = 0

def bump():
    count += 1

bump()`,
          error: true,
          note: '`count += 1` assigns, so `count` is local to `bump` — and it is read before it has a value. Read the error: Python says exactly that.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `x = "global"

def show():
    x = "local"
    return x

show()
print(x)`,
          predict: { question: 'What prints?', options: ['local', 'global', 'Error', 'None'], answer: 1, explain: 'The `x = "local"` inside `show` creates a **new local** name in show\'s frame. The global `x` is untouched.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'md',
          text: `**Closures:** an inner function can use variables from the function that created it — and it **keeps them alive** even after the outer function has returned. \`nonlocal\` lets the inner function *rebind* such a variable.`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `def make_counter():
    count = 0
    def tick():
        nonlocal count
        count += 1
        return count
    return tick

c1 = make_counter()
c2 = make_counter()
c1()
c1()
print(c1(), c2())`,
          predict: { question: 'What prints?', options: ['3 3', '3 1', '1 1', '4 2'], answer: 1, explain: 'Each call to `make_counter` creates a **separate** `count`. `c1` has ticked 3 times; `c2` only once.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: the backpack',
          text: 'A closure is a function wearing a **backpack**. Before leaving home (the outer function), it packs the variables it needs. Every new trip (`make_counter()`) packs a **new** backpack.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `accounts = [("ana", 300), ("bo", 50), ("cy", 300)]
print(sorted(accounts, key=lambda a: a[1]))
print(sorted(accounts, key=lambda a: (-a[1], a[0])))
print(max(accounts, key=lambda a: a[1])[0])`,
          note: 'A **lambda** is a one-expression function without a name: `lambda a: a[1]` ≈ `def f(a): return a[1]`. Its main job in interviews is `key=` for `sorted`, `max` and `min`. (`max` returns the **first** of tied items: "ana".)',
        },
        {
          kind: 'challenge',
          id: 'py04-l2-c1',
          lang: 'python',
          title: 'Function factory',
          prompt: 'Write `make_multiplier(k)` that **returns a function**; calling that function with `x` returns `x * k`. So `make_multiplier(3)(5)` → `15`.',
          starter: 'def make_multiplier(k):\n    return k\n',
          hints: ['You need to define a function *inside* `make_multiplier` and return it (without calling it).', '`def times(x): return x * k` then `return times` — or `return lambda x: x * k`.'],
          solution: 'def make_multiplier(k):\n    def times(x):\n        return x * k\n    return times\n',
          explain: '`times` closes over `k`. Each call to `make_multiplier` builds a new function with its own `k` — that is exactly how decorators and callbacks remember their settings.',
          py: { tests: ['make_multiplier(3)(5)', 'make_multiplier(0)(9)', 'make_multiplier(-2)(4)', '[f(2) for f in [make_multiplier(i) for i in range(3)]]'] },
          trace: { view: 'heap' },
        },
        {
          kind: 'challenge',
          id: 'py04-l2-c2',
          lang: 'python',
          title: 'Running-total closure',
          prompt: 'Write `make_accumulator()` that returns a function `add(x)`. Each call adds `x` to a private running total and returns the new total. Separate accumulators must not share totals.',
          starter: 'def make_accumulator():\n    total = 0\n    def add(x):\n        total += x\n        return total\n    return add\n',
          hints: ['Run the starter: `UnboundLocalError`. `total += x` makes `total` local to `add`.', 'Tell Python that `total` lives in the enclosing function: add `nonlocal total` as the first line of `add`.'],
          solution: 'def make_accumulator():\n    total = 0\n    def add(x):\n        nonlocal total\n        total += x\n        return total\n    return add\n',
          explain: '`nonlocal` is the closure version of `global`: "rebind the variable from the enclosing function". Without it, any assignment creates a new local.',
          py: { tests: ['(lambda a: (a(5), a(10), a(-3)))(make_accumulator())', '(lambda a, b: (a(1), b(1), a(1)))(make_accumulator(), make_accumulator())', 'make_accumulator()(0)'] },
          trace: { view: 'heap' },
        },
        { kind: 'quiz', id: 'py04-l2-q1', q: 'In which order does Python look up a name?', options: ['Global → Local → Built-in → Enclosing', 'Local → Enclosing → Global → Built-in', 'Built-in → Global → Enclosing → Local', 'Local → Global → Enclosing → Built-in'], answer: 1, explain: 'LEGB: Local, Enclosing, Global, Built-in. The first match wins.' },
        { kind: 'recall', prompt: 'Why does `count += 1` inside a function raise `UnboundLocalError` when `count` is global?', answer: 'Any assignment makes `count` local to the whole function, so `count += 1` tries to read the local before it has a value. Fix with `global count` (or better, pass and return values).' },
        { kind: 'explain', id: 'py04-l2-e1', prompt: 'Explain how `c1` and `c2` from `make_counter()` keep separate counts. Use the word "frame".' },
      ],
      cards: [
        { id: 'py04-l2-k1', kind: 'predict', code: 'x = 1\ndef f():\n    x = 2\nf()\nprint(x)', options: ['1', '2', 'None', 'Error'], answer: 0 },
        { id: 'py04-l2-k2', kind: 'predict', code: 'f = lambda x, y=2: x * y\nprint(f(3))', options: ['6', '5', '3', 'Error'], answer: 0 },
        { id: 'py04-l2-k3', kind: 'cloze', text: 'Python looks names up in order: {{}}, Enclosing, Global, Built-in.', answers: ['Local'] },
        { id: 'py04-l2-k4', kind: 'concept', front: 'What does `nonlocal x` do?', back: 'Lets an inner function rebind `x` from the enclosing function\'s scope (instead of creating a new local).' },
        { id: 'py04-l2-k5', kind: 'concept', front: 'What is a closure?', back: 'A function that remembers variables from the scope where it was created, even after that scope has returned.' },
      ],
    },
    {
      id: 'py04-l3',
      track: 'python',
      title: 'Recursion & base cases',
      summary: 'Watch a function call itself as a tree of calls — and learn to trust the smaller problem.',
      minutes: 17,
      faang: 'Trees, graphs, backtracking (subsets, permutations) and divide-and-conquer are all recursion, and they fill the medium/hard tier of FAANG-style loops. Interviewers expect you to name the base case, the recursive case, the time complexity and the recursion depth.',
      tags: ['Recursion', 'Base case', 'Call stack', 'Call tree'],
      cells: [
        {
          kind: 'md',
          text: `A **recursive** function solves a problem by calling **itself on a smaller version** of it. Press play and watch the call tree: \`fact(5)\` asks \`fact(4)\`, which asks \`fact(3)\`… until \`fact(1)\` answers directly. Then the answers flow back **up**.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)

print(fact(5))`,
            trace: { view: 'calltree', fn: 'fact' },
          },
          caption: 'Going **down**: each call waits for a smaller one. Coming **up**: 1 → 2 → 6 → 24 → 120.',
        },
        {
          kind: 'md',
          text: `Every recursive function has two parts:

- **Base case** — a version so small you answer it directly (\`n <= 1 → 1\`). No base case = it never stops.
- **Recursive case** — shrink the problem and **trust** the recursive call to solve the smaller one (\`n * fact(n - 1)\`).

Each waiting call is a frame on the **call stack** — switch to the heap view below to see them pile up.`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `def total(nums):
    if not nums:
        return 0
    return nums[0] + total(nums[1:])

print(total([4, 1, 5]))`,
          predict: { question: 'What prints?', options: ['10', '4', '0', 'RecursionError'], answer: 0, explain: '4 + total([1, 5]) = 4 + (1 + total([5])) = 4 + (1 + (5 + total([]))) = 4 + 1 + 5 + 0 = 10.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: Russian dolls',
          text: 'Recursion is **opening Russian dolls**: keep opening (calling) until you reach the solid smallest doll (the base case). Then close them back up one by one (the returns), each adding its bit to the answer.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `def countdown(n):
    return countdown(n - 1)

countdown(3)`,
          error: true,
          note: 'No base case → the calls never stop → Python gives up with `RecursionError`. Python\'s limit is about 1000 frames (≈500 in this browser), so very deep inputs need a loop instead.',
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)

print(fib(5))`,
            trace: { view: 'calltree', fn: 'fib' },
          },
          caption: '**Two recursive calls = a tree.** `fib(n) = fib(n-1) + fib(n-2)` branches into two at every level. Count the `fib(2)` boxes: three of them, all doing the same work. The tree roughly **doubles** with each extra n → O(2ⁿ).',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `calls = 0

def fib(n):
    global calls
    calls += 1
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)

fib(5)
print(calls)`,
          predict: { question: 'How many times is `fib` called in total for `fib(5)`?', options: ['5', '8', '15', '32'], answer: 2, explain: 'Count the boxes in the tree above: 1 + 2 + 4 + 5 + 3 = 15. For fib(30) it is over 2.6 million — next lesson fixes that.' },
        },
        {
          kind: 'callout',
          tone: 'interview',
          title: 'How this is asked',
          text: 'Before coding, say: **"Base case is …, recursive case is …"**. After coding, give **time** (count the calls in the tree) and **space** (the maximum depth of the stack). For huge inputs, mention converting to a loop to avoid the recursion limit.',
        },
        {
          kind: 'challenge',
          id: 'py04-l3-c1',
          lang: 'python',
          title: 'Recursive power',
          prompt: 'Write `power(base, exp)` **recursively** (no `**` or `pow`) for whole numbers `exp >= 0`. Remember `x⁰ = 1`.',
          starter: 'def power(base, exp):\n    if exp == 1:\n        return base\n    return base * power(base, exp - 1)\n',
          hints: ['What happens with `power(5, 0)` in the starter? `exp` goes 0, -1, -2… and never hits 1.', 'Use the smallest valid input as the base case: `if exp == 0: return 1`.'],
          solution: 'def power(base, exp):\n    if exp == 0:\n        return 1\n    return base * power(base, exp - 1)\n',
          explain: 'Pick the **smallest** valid input as the base case — here 0, not 1 — so every legal input reaches it. (Follow-up: halve `exp` each call for O(log n) "fast power".)',
          py: { tests: ['power(2, 10)', 'power(5, 0)', 'power(-3, 3)', 'power(0, 0)', 'power(1, 50)'] },
          trace: { view: 'calltree', fn: 'power' },
        },
        {
          kind: 'challenge',
          id: 'py04-l3-c2',
          lang: 'python',
          title: 'Reverse a string recursively',
          prompt: 'Write `reverse_str(s)` recursively (no slicing with `[::-1]` and no `reversed`).',
          starter: 'def reverse_str(s):\n    return s\n',
          hints: ['Base case: a string of length 0 or 1 is its own reverse.', 'Recursive case: reverse everything after the first character, then put the first character at the **end**.', '`return reverse_str(s[1:]) + s[0]`'],
          solution: 'def reverse_str(s):\n    if len(s) <= 1:\n        return s\n    return reverse_str(s[1:]) + s[0]\n',
          explain: '"Solve the rest, then fix up the first item" is the most common recursive shape on sequences. It is O(n²) because of the slicing copies — fine to mention.',
          py: { tests: ['reverse_str("abc")', 'reverse_str("")', 'reverse_str("a")', 'reverse_str("racecar")', 'reverse_str("ab")'] },
          trace: { view: 'calltree', fn: 'reverse_str' },
        },
        { kind: 'quiz', id: 'py04-l3-q1', q: 'What are the two parts every recursive function needs?', options: ['A loop and a counter', 'A base case and a recursive case that shrinks the problem', 'A global variable and a return', 'Two recursive calls'], answer: 1, explain: 'The base case stops the recursion; the recursive case must make progress toward it.' },
        { kind: 'recall', prompt: 'Why is naive recursive Fibonacci so slow?', answer: 'Each call makes two more, and the same sub-problems (fib(2), fib(3)…) are recomputed many times → about O(2ⁿ) calls.' },
        { kind: 'explain', id: 'py04-l3-e1', prompt: 'Walk through `total([4, 1, 5])` aloud: what does each call wait for, and what does it return?' },
      ],
      cards: [
        { id: 'py04-l3-k1', kind: 'predict', code: 'def f(n):\n    if n == 0:\n        return 0\n    return n + f(n - 1)\nprint(f(4))', options: ['10', '4', '24', 'RecursionError'], answer: 0 },
        { id: 'py04-l3-k2', kind: 'predict', code: 'def g(s):\n    return s if len(s) <= 1 else g(s[1:]) + s[0]\nprint(g("abc"))', options: ['cba', 'abc', 'bca', 'c'], answer: 0 },
        { id: 'py04-l3-k3', kind: 'concept', front: 'What causes a RecursionError?', back: 'Too many nested calls — usually a missing or unreachable base case (or input too deep for the recursion limit).' },
        { id: 'py04-l3-k4', kind: 'cloze', text: 'Naive recursive Fibonacci makes about O({{}}) calls.', answers: ['2^n'] },
        { id: 'py04-l3-k5', kind: 'concept', front: 'Space complexity of a recursive function?', back: 'At least the maximum depth of the call stack (one frame per waiting call).' },
      ],
    },
    {
      id: 'py04-l4',
      track: 'python',
      title: 'Memoization & @lru_cache',
      summary: 'Remember answers you already computed — watch the call tree collapse from exponential to linear.',
      minutes: 15,
      faang: 'Memoization is the doorway to dynamic programming — climbing stairs, coin change, unique paths and edit distance are staples of Amazon/Google-style loops. The standard interview arc is: brute-force recursion → spot repeated sub-problems → memoize → (optionally) bottom-up table.',
      tags: ['Memoization', 'lru_cache', 'Dynamic programming', 'Call tree'],
      cells: [
        {
          kind: 'md',
          text: `Last lesson, \`fib(5)\` made **15** calls and computed \`fib(2)\` three times. **Memoization** fixes that: keep a dict of answers; before computing, check whether you already know.

Here's the **before** picture again — remember its shape:`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)

print(fib(5))`,
            trace: { view: 'calltree', fn: 'fib' },
          },
          caption: '**Before:** a bushy tree — the same sub-trees appear again and again.',
        },
        {
          kind: 'md',
          text: `The memo pattern has three steps:

1. **Check:** \`if n in memo: return memo[n]\`
2. **Compute** the answer the normal recursive way
3. **Store** it: \`memo[n] = answer\` before returning

Now the **after** picture — same function, plus a memo dict. Watch the tree become a thin line:`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `memo = {}

def fib(n):
    if n in memo:
        return memo[n]
    if n < 2:
        return n
    memo[n] = fib(n - 1) + fib(n - 2)
    return memo[n]

print(fib(6))`,
            trace: { view: 'calltree', fn: 'fib' },
          },
          caption: '**After:** each `fib(k)` is computed once. The right-hand branches are instant memo hits. Calls grow like **n**, not 2ⁿ.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `calls = 0
memo = {}

def fib(n):
    global calls
    calls += 1
    if n in memo:
        return memo[n]
    if n < 2:
        return n
    memo[n] = fib(n - 1) + fib(n - 2)
    return memo[n]

fib(10)
print(calls)`,
          predict: { question: 'How many calls does memoized `fib(10)` make? (Naive makes 177.)', options: ['19', '177', '10', '55'], answer: 0, explain: 'fib(10) … fib(2) each run once and make 2 calls: 1 + 2 × 9 = 19. Linear instead of exponential.' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: the sticky note',
          text: 'Memoization is a **sticky note on the fridge**. Before doing a long calculation, check the fridge. If the answer is there, you\'re done; if not, do the work once and stick the answer up for next time.',
        },
        {
          kind: 'md',
          text: `Python can write the memo for you: the \`@lru_cache\` **decorator** from \`functools\` wraps the function in a dict keyed by its arguments. (\`@cache\` is the same thing with no size limit.) Arguments must be **hashable** — ints, strings, tuples; not lists.`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `from functools import lru_cache

@lru_cache(maxsize=None)
def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)

print(fib(80))`,
          predict: { question: 'What happens?', options: ['23416728348467685', 'RecursionError', 'Nothing — it runs for hours', 'OverflowError'], answer: 0, explain: 'It prints instantly: only 81 distinct calls are ever computed. Naive recursion would need ~10¹⁶ calls. Python ints never overflow, so the big number is exact.' },
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'Memo gotchas',
          text: '- `@lru_cache` on a function taking a **list** → `TypeError: unhashable type`. Pass a tuple instead.\n- A memo dict at module level is **shared** across calls with different inputs — fine for pure functions, wrong if the answer depends on anything else.\n- Memoization trades **memory** for **time**: you store one answer per distinct argument.',
        },
        {
          kind: 'challenge',
          id: 'py04-l4-c1',
          lang: 'python',
          title: 'Climbing stairs (make it fast)',
          prompt: 'You climb a staircase of `n` steps, taking **1 or 2** steps at a time. `climb(n)` returns how many distinct ways there are (`climb(0)` is 1: do nothing). The starter is correct but exponential — `climb(40)` takes forever. Make it fast.',
          starter: 'def climb(n):\n    if n <= 1:\n        return 1\n    return climb(n - 1) + climb(n - 2)\n',
          hints: ['Draw the call tree for `climb(5)`: `climb(3)` appears twice, `climb(2)` three times — repeated sub-problems.', 'Add `from functools import lru_cache` and put `@lru_cache(maxsize=None)` on the line above `def`.', 'Or keep a `memo = {}` dict: check it first, store before returning.'],
          solution: 'from functools import lru_cache\n\n@lru_cache(maxsize=None)\ndef climb(n):\n    if n <= 1:\n        return 1\n    return climb(n - 1) + climb(n - 2)\n',
          explain: 'To reach step n your last move was from n−1 or n−2, so ways(n) = ways(n−1) + ways(n−2) — Fibonacci in disguise. Memoized: O(n) time. Bottom-up with two variables: O(n) time and O(1) space — a great follow-up answer.',
          py: { tests: ['climb(1)', 'climb(2)', 'climb(5)', 'climb(0)', 'climb(40)'] },
          trace: { view: 'calltree', fn: 'climb' },
        },
        {
          kind: 'challenge',
          id: 'py04-l4-c2',
          lang: 'python',
          title: 'Grid paths (fix the base case)',
          prompt: '`grid_paths(r, c)` counts the paths from the top-left to the bottom-right of an `r × c` grid moving only **right** or **down** (`r, c >= 1`). A 1-wide or 1-tall grid has exactly 1 path. The starter is memoized but its base case is wrong.',
          starter: 'from functools import lru_cache\n\n@lru_cache(maxsize=None)\ndef grid_paths(r, c):\n    if r == 1 and c == 1:\n        return 1\n    return grid_paths(r - 1, c) + grid_paths(r, c - 1)\n',
          hints: ['From (1, 5) the starter calls `grid_paths(0, 5)` — a grid with zero rows — and never stops.', 'Any grid with a single row **or** a single column has exactly one path.', 'Change the base case to `if r == 1 or c == 1: return 1`.'],
          solution: 'from functools import lru_cache\n\n@lru_cache(maxsize=None)\ndef grid_paths(r, c):\n    if r == 1 or c == 1:\n        return 1\n    return grid_paths(r - 1, c) + grid_paths(r, c - 1)\n',
          explain: 'Memoization doesn\'t fix a wrong base case — it only speeds up a correct recursion. With the cache there are only r × c distinct calls, so `grid_paths(12, 12)` is instant.',
          py: { tests: ['grid_paths(2, 2)', 'grid_paths(3, 3)', 'grid_paths(1, 5)', 'grid_paths(3, 7)', 'grid_paths(12, 12)'] },
          trace: { view: 'calltree', fn: 'grid_paths' },
        },
        { kind: 'quiz', id: 'py04-l4-q1', q: 'What does memoization trade?', options: ['Correctness for speed', 'Memory for time', 'Time for memory', 'Recursion for loops'], answer: 1, explain: 'You spend memory (one stored answer per distinct input) to avoid recomputing — saving time.' },
        { kind: 'recall', prompt: 'List the three steps of the memo pattern.', answer: '**Check** the memo → **compute** recursively if missing → **store** the answer before returning.' },
        { kind: 'explain', id: 'py04-l4-e1', prompt: 'Compare the "before" and "after" call trees. Why does the memoized tree have only about n calls?' },
      ],
      cards: [
        { id: 'py04-l4-k1', kind: 'predict', code: 'memo = {}\ndef f(n):\n    if n in memo:\n        return memo[n]\n    memo[n] = n * 2\n    return memo[n]\nf(3)\nf(4)\nf(3)\nprint(len(memo))', options: ['2', '3', '1', '0'], answer: 0 },
        { id: 'py04-l4-k2', kind: 'concept', front: 'Why can\'t you put `@lru_cache` on a function that takes a list?', back: 'The cache is a dict keyed by the arguments, so they must be hashable; lists are not. Pass a tuple instead.' },
        { id: 'py04-l4-k3', kind: 'cloze', text: 'Memoized `fib(n)` computes each value once, so it makes O({{}}) calls.', answers: ['n'] },
        { id: 'py04-l4-k4', kind: 'concept', front: 'Interview arc for a DP problem?', back: 'Brute-force recursion → spot repeated sub-problems → memoize (top-down) → optionally bottom-up table / O(1) variables.' },
        { id: 'py04-l4-k5', kind: 'predict', code: 'from functools import lru_cache\ncalls = []\n@lru_cache(maxsize=None)\ndef sq(x):\n    calls.append(x)\n    return x * x\nsq(3)\nsq(3)\nsq(4)\nprint(len(calls))', options: ['2', '3', '1', '0'], answer: 0 },
      ],
    },
  ],
};
