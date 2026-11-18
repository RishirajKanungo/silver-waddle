import type { Module } from '../types';

export const module: Module = {
  id: 'py08',
  track: 'python',
  order: 8,
  title: 'Pythonic Code & Data Wrangling',
  icon: '🧰',
  level: 'Advanced',
  blurb: 'Generators, exceptions, collections and itertools — then parse, group and test real transaction data without pandas.',
  boss: ['py-gym-i-group-anagrams', 'py-gym-i-top-k-words', 'py-gym-i-lru-cache'],
  lessons: [
    // ─────────────────────────────────────────────────────────────── L1
    {
      id: 'py08-l1',
      track: 'python',
      title: 'Lazy pipelines: iterators & generators',
      summary: 'Process log lines one at a time with `yield` and generator expressions — and see why that needs almost no memory.',
      minutes: 16,
      faang: '"What if the file doesn\'t fit in memory?" is a standard follow-up in Meta/Amazon-style data-engineering loops. Answering with a generator pipeline — and explaining why it uses O(1) memory instead of O(n) — signals real production experience.',
      tags: ['Generators', 'Iterators', 'yield', 'Lazy evaluation', 'Streaming', 'Memory'],
      cells: [
        {
          kind: 'md',
          text: `Before any definitions, watch something odd. The function below contains \`yield\` instead of \`return\`.

Press **Step ▶** and watch the **order of the prints**: does it read all three log lines first and then handle them — or does it take turns?`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `def read_logs():
    for line in ["INFO login", "ERROR timeout", "INFO logout"]:
        print("read:", line)
        yield line

for line in read_logs():
    print("got:", line)`,
            trace: { view: 'heap' },
          },
          caption: '"read" and "got" **take turns**. Each `yield` hands one value to the loop and *pauses* the function — its frame stays alive (look at the left side) until the loop asks for the next value.',
        },
        {
          kind: 'md',
          text: `That pausing function is a **generator**. It works because of the **iterator protocol**, which every \`for\` loop uses behind the scenes:

- \`iter(x)\` gives you an *iterator* over \`x\`
- \`next(it)\` pulls **one** value out of it
- when nothing is left, \`next\` raises **StopIteration** — that is how a \`for\` loop knows to stop

An iterator remembers where it is, like a bookmark.`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `it = iter([10, 20, 30])
next(it)
print(next(it), next(it))`,
          predict: { question: 'What prints?', options: ['10 20', '20 30', '10 20 30', 'StopIteration'], answer: 1, explain: 'The first `next(it)` consumed 10 (its value was just thrown away). The bookmark is now at 20, so the print pulls 20 and then 30.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'code',
          lang: 'python',
          code: `def countdown(n):
    while n > 0:
        yield n
        n -= 1

g = countdown(3)
print(list(g), list(g))`,
          predict: { question: 'What prints?', options: ['[3, 2, 1] [3, 2, 1]', '[3, 2, 1] []', '[] []', '[3, 2, 1, 0] []'], answer: 1, explain: 'The first `list(g)` drains the generator. A generator is **one-shot**: the second `list(g)` finds it already exhausted and gets nothing.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: report vs tap',
          text: 'A **list** is a printed report: every row exists on paper right now. A **generator** is a **tap**: water (values) only flows when you open it with `next()`, one cup at a time — and once the tank is empty, it stays empty. Square brackets `[ ]` = report, round brackets `( )` = tap.',
        },
        {
          kind: 'md',
          text: `You rarely need a whole \`def\` for a generator. A **generator expression** looks like a list comprehension with round brackets:

\`\`\`python
squares_list = [x * x for x in range(10**6)]   # builds 1,000,000 ints NOW
squares_gen  = (x * x for x in range(10**6))   # builds nothing yet
total = sum(x * x for x in range(10**6))       # one value in memory at a time
\`\`\`

The list needs memory for every element (**O(n)**); the generator holds just one (**O(1)**). Chain several and you get a **lazy pipeline** — nothing runs until someone pulls from the end.`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `logs = [
    "2026-03-01 INFO user=7 login",
    "2026-03-01 ERROR user=3 timeout",
    "2026-03-02 ERROR user=7 card_declined",
    "2026-03-02 INFO user=3 logout",
]
errors = (line for line in logs if " ERROR " in line)
users = (line.split()[2] for line in errors)
print(next(users), list(users))`,
          predict: { question: 'What prints?', options: ["user=3 ['user=7']", "user=3 ['user=3', 'user=7']", "['user=3', 'user=7']", "user=7 []"], answer: 0, explain: '`next(users)` pulls the first error\'s user (user=3). `list(users)` then drains what is *left* — only user=7. Each stage pulls from the one before it, one line at a time.' },
          trace: { view: 'heap' },
          note: 'Swap `logs` for a 50 GB file and this pipeline still uses the same tiny amount of memory — that is the whole point.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `g = (x * 2 for x in range(3))
print(len(g))`,
          error: true,
          note: '**Trap:** a generator has no length (it doesn\'t know how many values it will produce until it runs) and you can only loop over it **once**. Need both? Materialise it first: `items = list(g)`.',
        },
        {
          kind: 'challenge',
          id: 'py08-l1-c1',
          lang: 'python',
          title: 'Streaming running balance',
          prompt: 'Write a **generator** `running_balance(txns, start=0)` that yields the account balance after each transaction amount in `txns`. Example: `list(running_balance([100, -30]))` → `[100, 70]`. It must be lazy — use `yield`, don\'t return a list.',
          starter: 'def running_balance(txns, start=0):\n    out = []\n    bal = start\n    for t in txns:\n        bal += t\n        out.append(bal)\n    return out\n\nprint(list(running_balance([100, -30, -80])))\n',
          hints: [
            'The starter builds the whole list up front. Tests call `next()` on your result — a list is not an iterator, so that fails.',
            'Delete `out` entirely. Inside the loop, after updating `bal`, hand it out with `yield`.',
            '```python\ndef running_balance(txns, start=0):\n    bal = start\n    for t in txns:\n        bal += t\n        yield bal\n```',
          ],
          solution: 'def running_balance(txns, start=0):\n    bal = start\n    for t in txns:\n        bal += t\n        yield bal\n\nprint(list(running_balance([100, -30, -80])))\n',
          explain: 'Replacing `out.append(x)` with `yield x` turns any list-building loop into a generator. The caller decides how much to pull: `next()` for one, `list()` for all, or a `for` loop for a stream.',
          py: { tests: ['list(running_balance([100, -30, -80]))', 'list(running_balance([], 5))', 'next(running_balance([10, 20], 100))', 'type(running_balance([1])).__name__'] },
          trace: { view: 'heap' },
        },
        {
          kind: 'challenge',
          id: 'py08-l1-c2',
          lang: 'python',
          title: 'First N errors — stop reading early',
          prompt: 'Write `first_errors(lines, n)` that returns a **list** of the first `n` lines containing `"ERROR"`. `lines` may be a huge stream, so **stop reading as soon as you have `n`** — one test checks that the remaining lines were never consumed.',
          starter: 'def first_errors(lines, n):\n    return [l for l in lines if "ERROR" in l][:n]\n',
          hints: [
            'The list comprehension reads *every* line before slicing. Make the filter lazy with round brackets.',
            '`itertools.islice(iterable, n)` takes at most `n` items from any iterator and then stops pulling. (A loop with `break` also works.)',
            '```python\nfrom itertools import islice\n\ndef first_errors(lines, n):\n    errors = (l for l in lines if "ERROR" in l)\n    return list(islice(errors, n))\n```',
          ],
          solution: 'from itertools import islice\n\ndef first_errors(lines, n):\n    errors = (l for l in lines if "ERROR" in l)\n    return list(islice(errors, n))\n',
          explain: 'A generator expression + `islice` reads only as far as needed. On a 10-million-line log where the first two errors are near the top, this is the difference between milliseconds and minutes.',
          py: {
            tests: [
              'first_errors(["ERROR a", "INFO b", "ERROR c"], 5)',
              'first_errors(["INFO x"], 2)',
              '(lambda it: (first_errors(it, 1), list(it)))(iter(["INFO a", "ERROR b", "ERROR c", "INFO d"]))',
              '(lambda it: (first_errors(it, 0), list(it)))(iter(["ERROR z", "INFO y"]))',
            ],
          },
        },
        {
          kind: 'quiz',
          id: 'py08-l1-q1',
          q: '`nums` has 100 million numbers. Which line uses the **least extra memory**?',
          options: ['`sum([x * 2 for x in nums])`', '`sum(x * 2 for x in nums)`', '`sum(list(map(lambda x: x * 2, nums)))`', 'They all use the same'],
          answer: 1,
          explain: 'The generator expression feeds `sum` one value at a time (O(1) extra). The other two build a 100-million-element list first (O(n)).',
        },
        { kind: 'recall', prompt: 'What three things does `for x in thing:` do behind the scenes?', answer: '1) calls `iter(thing)` to get an iterator, 2) calls `next()` on it each round, 3) stops when `next()` raises **StopIteration**.' },
        { kind: 'explain', id: 'py08-l1-e1', prompt: 'Explain to an interviewer why a generator pipeline can process a file bigger than your RAM, and name one thing you *can\'t* do with a generator that you can with a list.' },
      ],
      cards: [
        { id: 'py08-l1-k1', kind: 'predict', code: 'g = (x for x in [1, 2, 3])\nprint(sum(g), sum(g))', options: ['6 6', '6 0', '0 6', 'Error'], answer: 1 },
        { id: 'py08-l1-k2', kind: 'predict', code: 'def f():\n    yield 1\n    yield 2\n\ng = f()\nprint(next(g) + next(g))', options: ['1', '2', '3', 'StopIteration'], answer: 2 },
        { id: 'py08-l1-k3', kind: 'cloze', text: 'A generator function hands out values with {{}}, and a `for` loop stops when `next()` raises {{}}.', answers: ['yield', 'StopIteration'] },
        { id: 'py08-l1-k4', kind: 'concept', front: 'Memory: `[x*x for x in data]` vs `(x*x for x in data)`?', back: 'List comprehension builds every element now → O(n). Generator expression yields one at a time on demand → O(1).' },
        { id: 'py08-l1-k5', kind: 'concept', front: 'Two things you cannot do with a generator that you can with a list?', back: 'Call `len()` on it, and loop over it a second time (it is one-shot). Index it with `g[0]` is a third.' },
      ],
    },
    // ─────────────────────────────────────────────────────────────── L2
    {
      id: 'py08-l2',
      track: 'python',
      title: 'Exceptions done right',
      summary: 'Read tracebacks bottom-up, use try/except/else/finally on purpose, raise your own exceptions, and prefer EAFP.',
      minutes: 16,
      faang: 'Senior-level code handles the unhappy path. In Amazon/Stripe-style loops a common follow-up is "what if a row is malformed?" — data-engineering screens expect you to skip-and-count bad records instead of crashing the whole batch, and to raise clear, specific errors from your own functions.',
      tags: ['Exceptions', 'try/except/else/finally', 'Custom exceptions', 'EAFP vs LBYL', 'Tracebacks', 'Dirty data'],
      cells: [
        {
          kind: 'md',
          text: `Real bank feeds are dirty. Run this: **one** bad row and the whole batch dies.

Then practise the most underrated interview skill — **reading the traceback**. Start at the **bottom line**: it tells you the *type* of error and the *exact value* that broke.`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `rows = ["120.50", "40.00", "n/a", "15.25"]
total = 0
for r in rows:
    total += float(r)
print(total)`,
          error: true,
          note: 'Bottom line: `ValueError: could not convert string to float: \'n/a\'`. The line above it shows **where** (`total += float(r)`). Type → message → location: you know exactly what to fix without guessing.',
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: read it like a bank statement',
          text: 'A traceback is a statement: the **closing balance is at the bottom** (what went wrong), the transaction history above it is how you got there — "most recent call last". Always read the bottom line first.',
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `def parse_amount(s):
    try:
        value = float(s)
    except ValueError:
        print("skip", s)
        return None
    else:
        print("ok", s)
        return value
    finally:
        print("done", s)

parse_amount("12.5")
parse_amount("n/a")`,
            trace: { view: 'heap' },
          },
          caption: `The **four rooms** of a try statement — step through and watch which ones each call visits:
- \`try\` — the risky line(s), keep it short
- \`except X\` — runs only if an **X** was raised
- \`else\` — runs only if **nothing** was raised (the happy path)
- \`finally\` — runs **always**, even after \`return\` (cleanup: close files, release locks)`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `def check(s):
    try:
        n = int(s)
    except ValueError:
        return "bad"
    else:
        return "good"
    finally:
        print("finally", end=" ")

print(check("7"))`,
          predict: { question: 'What prints?', options: ['good', 'finally good', 'good finally', 'finally bad'], answer: 1, explain: '`int("7")` works, so `else` runs and *prepares* to return "good". But `finally` must run before the function actually leaves — so "finally" is printed first, then the outer print shows "good".' },
          trace: { view: 'heap' },
        },
        {
          kind: 'code',
          lang: 'python',
          code: `class InsufficientFunds(Exception):
    pass

def withdraw(balance, amount):
    if amount > balance:
        raise InsufficientFunds(f"balance {balance} < requested {amount}")
    return balance - amount

print(withdraw(100, 30))
print(withdraw(50, 80))`,
          error: true,
          note: '**Raise your own exceptions.** A custom class is one line (`class X(Exception): pass`) and makes the bottom line of the traceback self-explanatory. Callers can now catch *exactly* this case with `except InsufficientFunds`. Raise **early**, with the numbers in the message.',
        },
        {
          kind: 'md',
          text: `Exceptions form a **family tree**. \`except Parent\` also catches every child: \`KeyError\` and \`IndexError\` are both \`LookupError\`s, and everything you'd normally catch is an \`Exception\`.

Two styles of defensive code:
- **LBYL** — *Look Before You Leap*: \`if key in acct: x = acct[key]\`
- **EAFP** — *Easier to Ask Forgiveness than Permission*: \`try: x = acct[key]\` / \`except KeyError: ...\`

Python favours **EAFP**: one lookup instead of two, and no gap where the data can change between the check and the use.`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `class BankError(Exception):
    pass

class AccountFrozen(BankError):
    pass

try:
    raise AccountFrozen("acct 7")
except ValueError:
    print("value")
except BankError as e:
    print("bank:", e)`,
          predict: { question: 'What prints?', options: ['value', 'bank: acct 7', 'AccountFrozen: acct 7', 'Nothing — it crashes'], answer: 1, explain: '`AccountFrozen` is not a `ValueError`, so the first clause is skipped. It **is** a `BankError` (its parent), so the second clause catches it. `print(e)` shows the message.' },
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'Trap: the bare except',
          text: 'Never write `except:` or `except Exception: pass`. It silently swallows *your own* bugs (a typo raises `NameError` — swallowed!) and hides bad data. Catch the **narrowest** exception you expect (`ValueError`, `KeyError`), and keep the `try` block to the one risky line.',
        },
        {
          kind: 'challenge',
          id: 'py08-l2-c1',
          lang: 'python',
          title: 'Skip and count bad rows',
          prompt: 'Write `clean_amounts(rows)` → a tuple `(total, bad)`: `total` is the sum of every row that `float()` can parse, **rounded to 2 decimals**, and `bad` is how many rows could not be parsed. Example: `clean_amounts(["120.50", "n/a"])` → `(120.5, 1)`.',
          starter: 'def clean_amounts(rows):\n    total = sum(float(r) for r in rows)\n    return (round(total, 2), 0)\n\nprint(clean_amounts(["120.50", "n/a", "15.25"]))\n',
          hints: [
            'The starter crashes on the first bad row. Loop over rows one by one and put **only** `float(r)` inside `try`.',
            '`except ValueError:` → `bad += 1`. `else:` → `total += value`.',
            '```python\ndef clean_amounts(rows):\n    total, bad = 0, 0\n    for r in rows:\n        try:\n            value = float(r)\n        except ValueError:\n            bad += 1\n        else:\n            total += value\n    return (round(total, 2), bad)\n```',
          ],
          solution: 'def clean_amounts(rows):\n    total, bad = 0, 0\n    for r in rows:\n        try:\n            value = float(r)\n        except ValueError:\n            bad += 1\n        else:\n            total += value\n    return (round(total, 2), bad)\n\nprint(clean_amounts(["120.50", "n/a", "15.25"]))\n',
          explain: 'Skip-and-count is the standard data-pipeline pattern: one bad record should never kill the batch, but you must **count** (or log) what you skipped so nobody silently loses money. Notice `float(" 7 ")` and `float("1e3")` are valid — test your assumptions!',
          py: {
            tests: [
              'clean_amounts(["120.50", "40.00", "n/a", "15.25"])',
              'clean_amounts([])',
              'clean_amounts(["", "abc", "1e3"])',
              'clean_amounts(["-5", " 7 ", "0.1", "0.2"])',
            ],
          },
          trace: { view: 'heap' },
        },
        {
          kind: 'challenge',
          id: 'py08-l2-c2',
          lang: 'python',
          title: 'Raise it, then catch it',
          prompt: `Complete two functions:
- \`withdraw(balance, amount)\` returns the new balance. If \`amount <= 0\` raise \`ValueError("amount must be positive")\`. If \`amount > balance\` raise \`InsufficientFunds(f"need {amount - balance} more")\`.
- \`try_withdraw(balance, amount)\` calls \`withdraw\` and returns \`"ok: <new balance>"\`, \`"declined: <message>"\` for InsufficientFunds, or \`"error: <message>"\` for ValueError.`,
          starter: 'class InsufficientFunds(Exception):\n    pass\n\ndef withdraw(balance, amount):\n    return balance - amount\n\ndef try_withdraw(balance, amount):\n    return f"ok: {withdraw(balance, amount)}"\n',
          hints: [
            'In `withdraw`, check the two bad cases first with `if ...: raise ...`, then return the happy result.',
            'In `try_withdraw`: `try: new = withdraw(...)`, then `except InsufficientFunds as e: return f"declined: {e}"` and a second `except ValueError as e`.',
            'Use `else: return f"ok: {new}"` for the happy path — it makes clear which line was risky.',
          ],
          solution: 'class InsufficientFunds(Exception):\n    pass\n\ndef withdraw(balance, amount):\n    if amount <= 0:\n        raise ValueError("amount must be positive")\n    if amount > balance:\n        raise InsufficientFunds(f"need {amount - balance} more")\n    return balance - amount\n\ndef try_withdraw(balance, amount):\n    try:\n        new = withdraw(balance, amount)\n    except InsufficientFunds as e:\n        return f"declined: {e}"\n    except ValueError as e:\n        return f"error: {e}"\n    else:\n        return f"ok: {new}"\n',
          explain: 'The function that *detects* a problem raises; the function that knows *what to do about it* catches. Separating the two is what makes code testable — and it\'s exactly how payment services distinguish "declined" from "bad request".',
          py: {
            tests: ['try_withdraw(100, 30)', 'try_withdraw(50, 80)', 'try_withdraw(50, 0)', 'try_withdraw(50, 50)', 'issubclass(InsufficientFunds, Exception)'],
            mustInclude: ['raise', 'except'],
          },
        },
        {
          kind: 'quiz',
          id: 'py08-l2-q1',
          q: 'In `try / except / else / finally`, when does the **else** block run?',
          options: ['Always', 'Only when an exception was raised', 'Only when the try block raised nothing', 'Only when no except clause matched'],
          answer: 2,
          explain: '`else` is the "it worked" room — it runs only if `try` finished without raising. `finally` is the one that always runs.',
        },
        { kind: 'recall', prompt: 'What do EAFP and LBYL stand for, and which does Python prefer?', answer: 'EAFP = Easier to Ask Forgiveness than Permission (try/except). LBYL = Look Before You Leap (if-check first). Python prefers EAFP.' },
        { kind: 'explain', id: 'py08-l2-e1', prompt: 'Your pipeline reads 1 million transaction rows and 12 are malformed. Explain how you would handle them, and why `except: pass` is the wrong answer.' },
      ],
      cards: [
        { id: 'py08-l2-k1', kind: 'predict', code: 'try:\n    x = 1 / 1\nexcept ZeroDivisionError:\n    print("A", end=" ")\nelse:\n    print("B", end=" ")\nfinally:\n    print("C")', options: ['A C', 'B C', 'B', 'C'], answer: 1 },
        { id: 'py08-l2-k2', kind: 'cloze', text: 'The {{}} block runs only when no exception was raised; the {{}} block always runs.', answers: ['else', 'finally'] },
        { id: 'py08-l2-k3', kind: 'concept', front: 'Which line of a traceback do you read first, and what does it tell you?', back: 'The **bottom** line: the exception type and message (e.g. `ValueError: could not convert string to float: \'n/a\'`). The line above it is where it happened.' },
        { id: 'py08-l2-k4', kind: 'predict', code: 'print(issubclass(KeyError, LookupError), issubclass(KeyError, ValueError))', options: ['True True', 'True False', 'False False', 'False True'], answer: 1 },
        { id: 'py08-l2-k5', kind: 'concept', front: 'EAFP vs LBYL — show both for reading `acct["balance"]`.', back: 'LBYL: `if "balance" in acct: x = acct["balance"]`. EAFP: `try: x = acct["balance"]` / `except KeyError: x = 0`. Python favours EAFP.' },
      ],
    },
    // ─────────────────────────────────────────────────────────────── L3
    {
      id: 'py08-l3',
      track: 'python',
      title: 'The collections & itertools toolbox',
      summary: 'Counter, defaultdict, deque and namedtuple — plus permutations, groupby, accumulate and lru_cache — turn 15-line answers into 3.',
      minutes: 18,
      faang: 'Interviewers at Google/Meta-style loops expect you to reach for `Counter`, `defaultdict` and `deque` without thinking — it frees minutes for the actual algorithm. Knowing their quirks (most_common tie order, groupby needing sorted input) is a quiet seniority signal.',
      tags: ['collections', 'Counter', 'defaultdict', 'deque', 'namedtuple', 'itertools', 'functools', 'lru_cache'],
      cells: [
        {
          kind: 'code',
          lang: 'python',
          code: `from collections import Counter

merchants = ["Tesco", "Uber", "Tesco", "Amazon", "Uber", "Tesco"]

counts = {}
for m in merchants:
    counts[m] = counts.get(m, 0) + 1
print(counts)

c = Counter(merchants)
print(c.most_common(2))
print(c["Tesco"], c["Netflix"])`,
          predict: { question: 'What is `c["Netflix"]` (a merchant that never appears)?', options: ['KeyError', 'None', '0', '-1'], answer: 2, fromOutput: false, explain: 'A `Counter` returns **0** for missing keys instead of raising — it is a dict built for tallying.' },
          note: 'Same tally twice: the hand-written dict loop (4 lines) and `Counter` (1 line). `most_common(k)` gives the top k `(item, count)` pairs, biggest first.',
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `from collections import defaultdict

txns = [("A1", 50), ("B2", 20), ("A1", -15), ("B2", 5)]
by_acct = defaultdict(list)
for acct, amt in txns:
    by_acct[acct].append(amt)
print(dict(by_acct))`,
            trace: { view: 'heap' },
          },
          caption: '`defaultdict(list)` creates an empty list the **first** time you touch a missing key — so grouping is one line, with no `if acct not in by_acct` check. Watch a new list appear for "A1" and "B2".',
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: the bank branch',
          text: '- **Counter** = the tally clicker at the door\n- **defaultdict** = a filing cabinet that grows a new empty folder whenever you ask for one that isn\'t there\n- **deque** = the queue at the counter, with doors at **both** ends (fast in/out at either side)\n- **namedtuple** = a row slip with labelled columns: `t.amount` instead of `t[1]`',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `from collections import deque

window = deque(maxlen=3)
for amt in [10, 20, 30, 40]:
    window.append(amt)
print(list(window), sum(window) / len(window))`,
          predict: { question: 'What prints?', options: ['[10, 20, 30] 20.0', '[20, 30, 40] 30.0', '[10, 20, 30, 40] 25.0', '[40] 40.0'], answer: 1, explain: 'With `maxlen=3`, appending a 4th item silently pushes the oldest (10) out of the other end. Perfect for "last 3 transactions" rolling windows.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'code',
          lang: 'python',
          code: `from collections import namedtuple

Txn = namedtuple("Txn", ["acct", "amount"])
t = Txn("A1", 25.0)
acct, amount = t
print(t.amount == t[1], t)`,
          predict: { question: 'What prints?', options: ["True Txn(acct='A1', amount=25.0)", "True ('A1', 25.0)", "False Txn(acct='A1', amount=25.0)", 'AttributeError'], answer: 0, explain: 'A namedtuple is a tuple with names: index **or** attribute access, unpacking works, and its repr shows the field names — great for readable debugging.' },
        },
        {
          kind: 'code',
          lang: 'python',
          code: `from itertools import permutations, combinations, product

cards = ["A", "B", "C"]
print(len(list(permutations(cards, 2))), len(list(combinations(cards, 2))), len(list(product(cards, repeat=2))))`,
          predict: { question: 'What prints?', options: ['6 3 9', '3 6 9', '6 6 9', '3 3 6'], answer: 0, explain: '**permutations**: order matters (AB ≠ BA) → 3×2 = 6. **combinations**: order doesn\'t → 3. **product** = nested loops, repeats allowed → 3×3 = 9.' },
          note: 'Interview use: brute-force search spaces. `permutations` for "all orderings", `combinations` for "choose k of n", `product` to replace nested `for` loops (e.g. all PIN codes).',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `from itertools import groupby

kinds = ["debit", "debit", "credit", "debit"]
print([(k, len(list(g))) for k, g in groupby(kinds)])`,
          predict: { question: 'What prints?', options: ["[('debit', 3), ('credit', 1)]", "[('credit', 1), ('debit', 3)]", "[('debit', 2), ('credit', 1), ('debit', 1)]", "[('debit', 2), ('credit', 1)]"], answer: 2, explain: '`groupby` only groups **consecutive** equal items — it is a "run detector", not SQL GROUP BY. The final debit starts a new group.' },
        },
        {
          kind: 'callout',
          tone: 'trap',
          title: 'Trap: groupby without sorting',
          text: 'To use `itertools.groupby` like SQL `GROUP BY`, **sort by the same key first**: `groupby(sorted(rows, key=f), key=f)`. Or skip it and use `defaultdict`/`Counter`, which don\'t care about order. (Unsorted `groupby` *is* handy for streaks: "longest run of declined payments".)',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `from itertools import accumulate
from functools import reduce, lru_cache

print(list(accumulate([100, -30, 45])))
print(reduce(lambda a, b: a * b, [1, 2, 3, 4]))

@lru_cache(maxsize=None)
def ways(n):
    if n <= 1:
        return 1
    return ways(n - 1) + ways(n - 2)

print(ways(60))`,
          note: '`accumulate` = running totals (Excel\'s cumulative SUM column). `reduce` folds a list into one value. `@lru_cache` **memoises**: each `ways(n)` is computed once, so this exponential recursion becomes linear — the fastest way to turn a recursive solution into DP in an interview.',
        },
        {
          kind: 'challenge',
          id: 'py08-l3-c1',
          lang: 'python',
          title: 'Top merchants, ties broken alphabetically',
          prompt: 'Write `top_merchants(names, k)` → the `k` most frequent merchants as `(name, count)` tuples, highest count first; **ties sorted alphabetically**. Example: `top_merchants(["Uber", "Tesco", "Uber", "Tesco", "Aldi"], 2)` → `[("Tesco", 2), ("Uber", 2)]`.',
          starter: 'from collections import Counter\n\ndef top_merchants(names, k):\n    return Counter(names).most_common(k)\n\nprint(top_merchants(["Uber", "Tesco", "Uber", "Tesco", "Aldi"], 2))\n',
          hints: [
            'Run the example: `most_common` breaks ties by **first appearance** (Uber came first), not alphabetically.',
            'Sort the `(name, count)` pairs yourself with a tuple key: count descending → `-count`, then name ascending.',
            '```python\ndef top_merchants(names, k):\n    counts = Counter(names)\n    return sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:k]\n```',
          ],
          solution: 'from collections import Counter\n\ndef top_merchants(names, k):\n    counts = Counter(names)\n    return sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:k]\n\nprint(top_merchants(["Uber", "Tesco", "Uber", "Tesco", "Aldi"], 2))\n',
          explain: '`most_common` is great until the spec says how to break ties — then you need your own sort key. "Top-k with ties" is a favourite interviewer twist precisely because `most_common` gets it subtly wrong.',
          py: {
            tests: [
              'top_merchants(["Uber", "Tesco", "Uber", "Tesco", "Aldi"], 2)',
              'top_merchants([], 3)',
              'top_merchants(["b", "a"], 5)',
              'top_merchants(["x", "y", "y"], 1)',
            ],
          },
          trace: { view: 'heap' },
        },
        {
          kind: 'challenge',
          id: 'py08-l3-c2',
          lang: 'python',
          title: 'Rolling average with a deque',
          prompt: 'Write `rolling_avg(amounts, k)` → a list of the averages of each **full** window of the last `k` amounts, rounded to 2 decimals. Example: `rolling_avg([10, 20, 30, 40], 2)` → `[15.0, 25.0, 35.0]`. No output until the window is full.',
          starter: 'from collections import deque\n\ndef rolling_avg(amounts, k):\n    window = deque(maxlen=k)\n    out = []\n    for a in amounts:\n        window.append(a)\n        out.append(round(sum(window) / len(window), 2))\n    return out\n\nprint(rolling_avg([10, 20, 30, 40], 2))\n',
          hints: [
            'The starter also averages partial windows at the start. When is the window "full"?',
            'Only append to `out` when `len(window) == k`.',
          ],
          solution: 'from collections import deque\n\ndef rolling_avg(amounts, k):\n    window = deque(maxlen=k)\n    out = []\n    for a in amounts:\n        window.append(a)\n        if len(window) == k:\n            out.append(round(sum(window) / k, 2))\n    return out\n\nprint(rolling_avg([10, 20, 30, 40], 2))\n',
          explain: '`deque(maxlen=k)` evicts the oldest item for you. (Follow-up an interviewer would ask: keep a running sum so each step is O(1) instead of re-summing k items.)',
          py: {
            tests: ['rolling_avg([10, 20, 30, 40], 2)', 'rolling_avg([5], 3)', 'rolling_avg([1, 2, 3], 3)', 'rolling_avg([1, 2, 4], 1)', 'rolling_avg([], 2)'],
          },
          trace: { view: 'heap' },
        },
        {
          kind: 'quiz',
          id: 'py08-l3-q1',
          q: 'You need "the 3 most common error codes" from a list. What\'s the most Pythonic first move?',
          options: ['`sorted(set(codes))[:3]`', '`Counter(codes).most_common(3)`', '`groupby(codes)` then count', '`max(codes, key=codes.count)`'],
          answer: 1,
          explain: '`Counter` tallies in O(n) and `most_common(3)` returns the top three. `groupby` would need sorting first, and `codes.count` inside `max` is O(n²).',
        },
        { kind: 'explain', id: 'py08-l3-e1', prompt: 'Explain `@lru_cache` to a non-programmer colleague, and why it can turn an exponential recursive function into a fast one.' },
      ],
      cards: [
        { id: 'py08-l3-k1', kind: 'predict', code: 'from collections import Counter\nprint(Counter("banana").most_common(1))', options: ["[('a', 3)]", "[('b', 1)]", "('a', 3)", "[('n', 2)]"], answer: 0 },
        { id: 'py08-l3-k2', kind: 'predict', code: 'from collections import defaultdict\nd = defaultdict(int)\nd["x"] += 2\nprint(d["x"], d["y"], len(d))', options: ['2 0 1', '2 0 2', '2 KeyError', '2 None 2'], answer: 1 },
        { id: 'py08-l3-k3', kind: 'cloze', text: '`itertools.groupby` only groups {{}} equal items, so {{}} by the same key first.', answers: ['consecutive', 'sort'] },
        { id: 'py08-l3-k4', kind: 'concept', front: 'From 4 items, how many `permutations(items, 2)` vs `combinations(items, 2)`?', back: 'Permutations (order matters): 4×3 = **12**. Combinations (order doesn\'t): 12/2 = **6**.' },
        { id: 'py08-l3-k5', kind: 'concept', front: 'What does `deque(maxlen=3)` do when you append a 4th item?', back: 'It silently drops the item at the opposite end (the oldest) — a ready-made sliding window.' },
        { id: 'py08-l3-k6', kind: 'concept', front: 'What does `@functools.lru_cache` do?', back: 'Memoises a function: remembers the result for each argument tuple, so repeated calls are O(1). Turns naive recursion into top-down DP.' },
      ],
    },
    // ─────────────────────────────────────────────────────────────── L4
    {
      id: 'py08-l4',
      track: 'python',
      title: 'Data wrangling without pandas (and testing it)',
      summary: 'Parse CSV-like text into dicts, group & aggregate transactions, sort by several keys — then prove it works with assert.',
      minutes: 18,
      faang: 'Many data-engineering and analytics coding rounds (common in Meta/Amazon-style loops) hand you raw strings and say "no pandas": parse, clean, aggregate, sort, report. It is your Excel pivot-table day job in plain Python — and finishing with a few asserts on edge cases shows the interviewer you verify your own work.',
      tags: ['Parsing', 'CSV', 'Group & aggregate', 'Multi-key sort', 'assert', 'Testing', 'Banking data'],
      cells: [
        {
          kind: 'md',
          text: `This is your day job — in Python. An export lands as raw text: a **header row**, then one line per transaction.

In Excel you'd use the header to name columns. In Python we do the same thing: split each line on commas and **zip** the header with the values to get a dict per row. Step through and watch \`rows\` fill up.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `raw = "acct,amount\\nA1,120.50\\nB2,40.00"
lines = raw.split("\\n")
header = lines[0].split(",")
rows = []
for line in lines[1:]:
    values = line.split(",")
    rows.append(dict(zip(header, values)))
print(rows)`,
            trace: { view: 'heap' },
          },
          caption: '`zip(header, values)` pairs `acct↔A1`, `amount↔120.50`; `dict(...)` turns the pairs into a row you can read by column name: `row["amount"]`.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `header = ["acct", "amount"]
row = dict(zip(header, "A1,120.50".split(",")))
print(row["amount"] + row["amount"])`,
          predict: { question: 'What prints?', options: ['241.0', '120.50120.50', '241.00', 'TypeError'], answer: 1, explain: 'Everything parsed from text is a **string**. `+` on strings concatenates. Convert explicitly: `float(row["amount"])` — the #1 bug in hand-rolled parsing.' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: the zipper',
          text: 'Picture a **zipper**: the header is the left row of teeth, the values are the right row. `zip` locks them together pair by pair — `dict(zip(header, values))` is "give every cell its column name". If a row is short, the zipper just stops early (no error!) — so validate row length on dirty data.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `from collections import defaultdict

txns = [
    {"acct": "A1", "kind": "debit", "amount": 120.5},
    {"acct": "B2", "kind": "credit", "amount": 40.0},
    {"acct": "A1", "kind": "credit", "amount": 15.25},
    {"acct": "B2", "kind": "debit", "amount": 9.75},
]
net = defaultdict(float)
for t in txns:
    sign = 1 if t["kind"] == "credit" else -1
    net[t["acct"]] += sign * t["amount"]
print(dict(net))`,
          predict: { question: 'What prints?', options: ["{'A1': 135.75, 'B2': 49.75}", "{'A1': -105.25, 'B2': 30.25}", "{'A1': 105.25, 'B2': -30.25}", "{'A1': -120.5, 'B2': 40.0}"], answer: 1, explain: 'A1: −120.5 + 15.25 = −105.25. B2: +40 − 9.75 = 30.25. Debits subtract, credits add.' },
          trace: { view: 'heap' },
          note: 'This is **GROUP BY acct, SUM(signed amount)** — or an Excel pivot table. The recipe: `totals = defaultdict(float)`, then `totals[key] += value` for each row.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `accounts = [("C3", 500), ("A1", 250), ("B2", 500), ("D4", 250)]
print(sorted(accounts, key=lambda a: (-a[1], a[0])))`,
          predict: { question: 'What prints?', options: ["[('B2', 500), ('C3', 500), ('A1', 250), ('D4', 250)]", "[('C3', 500), ('B2', 500), ('A1', 250), ('D4', 250)]", "[('A1', 250), ('D4', 250), ('B2', 500), ('C3', 500)]", "[('A1', 250), ('B2', 500), ('C3', 500), ('D4', 250)]"], answer: 0, explain: 'Tuples compare left to right: first by `-balance` (so biggest first), and only on a tie by name A→Z.' },
          note: '**Multi-key sort = tuple key.** Negate numbers to flip a single key to descending. (For a descending *string* key, sort twice — Python\'s sort is stable — or use `reverse=True` when every key is descending.)',
        },
        {
          kind: 'callout',
          tone: 'interview',
          title: 'How this is asked',
          text: 'Narrate the pipeline before typing: **parse → clean → group → aggregate → sort → format**. Then name the edge cases out loud: empty input, header-only file, blank lines, bad amounts, ties. Interviewers grade the structure and the edge cases as much as the final number.',
        },
        {
          kind: 'md',
          text: `How do you know your wrangling is right? **Test it.** \`assert condition, "message"\` does nothing when the condition is true and raises \`AssertionError\` when it's false.

Write 3–5 asserts per function — at least one **normal** case and the **edge** cases (empty, one item, ties, bad data). Run them before you say "done". Below, the third assert finds a real bug.`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `def average(xs):
    return sum(xs) / len(xs)

assert average([10, 20]) == 15
assert average([5]) == 5
assert average([]) == 0, "empty list should give 0"`,
          error: true,
          note: 'The first two asserts pass silently. The empty-list test doesn\'t even reach its comparison: `len([])` is 0, so we get **ZeroDivisionError**. An edge-case test just found a crash before production did. Fix: `return sum(xs) / len(xs) if xs else 0`.',
        },
        {
          kind: 'challenge',
          id: 'py08-l4-c1',
          lang: 'python',
          title: 'Spend by category from a raw statement',
          prompt: `Write \`spend_by_category(raw)\`. \`raw\` is CSV text with header \`date,merchant,category,amount\`. Return a list of \`(category, total)\` tuples:
- totals **rounded to 2 decimals**
- sorted by total **descending**, ties by category **A→Z**
- **skip** blank lines and rows whose amount isn't a number`,
          starter: 'def spend_by_category(raw):\n    lines = raw.split("\\n")\n    header = lines[0].split(",")\n    totals = {}\n    for line in lines[1:]:\n        row = dict(zip(header, line.split(",")))\n        # TODO: convert the amount, skip bad rows, add to totals\n    return sorted(totals.items())\n',
          hints: [
            'Skip blank lines with `if not line.strip(): continue`. Convert with `float(row["amount"])` inside `try` / `except ValueError: continue`.',
            'Accumulate with `totals = defaultdict(float)` and `totals[row["category"]] += amount`.',
            'Round first, then sort: `pairs = [(c, round(t, 2)) for c, t in totals.items()]` and `sorted(pairs, key=lambda p: (-p[1], p[0]))`.',
          ],
          solution: 'from collections import defaultdict\n\ndef spend_by_category(raw):\n    lines = raw.split("\\n")\n    header = lines[0].split(",")\n    totals = defaultdict(float)\n    for line in lines[1:]:\n        if not line.strip():\n            continue\n        row = dict(zip(header, line.split(",")))\n        try:\n            amount = float(row["amount"])\n        except ValueError:\n            continue\n        totals[row["category"]] += amount\n    pairs = [(c, round(t, 2)) for c, t in totals.items()]\n    return sorted(pairs, key=lambda p: (-p[1], p[0]))\n',
          explain: 'Parse → clean → group → aggregate → sort: the same five steps as a SQL query with `WHERE`, `GROUP BY`, `SUM` and `ORDER BY total DESC, category`. Rounding *before* sorting avoids float noise like 30.000000000000004 breaking a tie.',
          py: {
            tests: [
              'spend_by_category("date,merchant,category,amount\\n2026-01-02,Tesco,groceries,20.50\\n2026-01-02,Uber,transport,12.00\\n2026-01-03,Aldi,groceries,9.50\\n2026-01-04,Shell,transport,18.00")',
              'spend_by_category("date,merchant,category,amount\\n2026-01-02,Tesco,groceries,5\\n2026-01-03,Bad,fees,n/a\\n\\n2026-01-04,Netflix,subscriptions,15.99\\n")',
              'spend_by_category("date,merchant,category,amount")',
              'spend_by_category("date,merchant,category,amount\\nd,a,misc,0.1\\nd,b,misc,0.2\\nd,c,zoo,0.3")',
            ],
          },
        },
        {
          kind: 'challenge',
          id: 'py08-l4-c2',
          lang: 'python',
          title: 'Make the asserts pass: dedupe transaction ids',
          prompt: 'Payment feeds sometimes **replay** messages, so the same transaction id arrives twice. `dedupe(ids)` should return the ids with duplicates removed, keeping the **first** occurrence and the original **order**. The asserts at the bottom are the spec — run it, read which one fails, and fix `dedupe` (keep the asserts!).',
          starter: 'def dedupe(ids):\n    out = []\n    for i in range(len(ids) - 1):\n        if ids[i] != ids[i + 1]:\n            out.append(ids[i])\n    return out\n\nassert dedupe(["t1", "t2", "t1"]) == ["t1", "t2"], "non-adjacent duplicate"\nassert dedupe([]) == [], "empty feed"\nassert dedupe(["t9"]) == ["t9"], "single id"\n',
          hints: [
            'Run it and read the bottom line of the traceback: which assert message appears? The starter only compares **neighbours** and never looks at the last id.',
            'Keep a `seen = set()`. For each id: if it isn\'t in `seen`, append it to `out` and add it to `seen`.',
            '```python\ndef dedupe(ids):\n    seen = set()\n    out = []\n    for t in ids:\n        if t not in seen:\n            seen.add(t)\n            out.append(t)\n    return out\n```',
          ],
          solution: 'def dedupe(ids):\n    seen = set()\n    out = []\n    for t in ids:\n        if t not in seen:\n            seen.add(t)\n            out.append(t)\n    return out\n\nassert dedupe(["t1", "t2", "t1"]) == ["t1", "t2"], "non-adjacent duplicate"\nassert dedupe([]) == [], "empty feed"\nassert dedupe(["t9"]) == ["t9"], "single id"\n',
          explain: 'A set gives O(1) "have I seen this?" checks; the list keeps order. (`list(set(ids))` would lose the order — and `list(dict.fromkeys(ids))` is a slick one-liner alternative.) Writing the asserts *first* is test-driven development in miniature.',
          py: {
            tests: ['dedupe(["t1", "t2", "t1", "t3", "t2"])', 'dedupe([])', 'dedupe(["a", "a", "a"])', 'dedupe(["x"])'],
            mustInclude: ['assert'],
          },
          trace: { view: 'heap' },
        },
        {
          kind: 'quiz',
          id: 'py08-l4-q1',
          q: '`sorted(rows, key=lambda r: (r["acct"], -r["amount"]))` sorts by…',
          options: ['amount descending, then acct', 'acct A→Z, and within each acct biggest amount first', 'acct A→Z, then amount smallest first', 'It raises — you can\'t negate inside a key'],
          answer: 1,
          explain: 'The tuple compares `acct` first; only rows with the same acct are compared by `-amount`, which puts larger amounts first.',
        },
        { kind: 'recall', prompt: 'What is the Python recipe for SQL `SELECT key, SUM(val) ... GROUP BY key`?', answer: '`totals = defaultdict(float)`; `for r in rows: totals[r["key"]] += r["val"]` — then `sorted(totals.items(), key=...)` for the ORDER BY.' },
        { kind: 'explain', id: 'py08-l4-e1', prompt: 'You wrote a function that parses a statement and totals spend per category. Which 4 assert tests would you write, and why each one?' },
      ],
      cards: [
        { id: 'py08-l4-k1', kind: 'predict', code: 'print(sorted([("b", 1), ("a", 2), ("c", 1)], key=lambda t: (t[1], t[0])))', options: ["[('b', 1), ('c', 1), ('a', 2)]", "[('a', 2), ('b', 1), ('c', 1)]", "[('c', 1), ('b', 1), ('a', 2)]", "[('b', 1), ('a', 2), ('c', 1)]"], answer: 0 },
        { id: 'py08-l4-k2', kind: 'predict', code: 'row = dict(zip(["a", "b"], "1,2".split(",")))\nprint(row["a"] + row["b"])', options: ['3', '12', '1,2', 'TypeError'], answer: 1 },
        { id: 'py08-l4-k3', kind: 'concept', front: 'One `sorted` call: balance high→low, then name A→Z?', back: '`sorted(rows, key=lambda r: (-r["balance"], r["name"]))` — negate the number to make that key descending.' },
        { id: 'py08-l4-k4', kind: 'cloze', text: '`assert cond, msg` does nothing if `cond` is true, otherwise raises {{}} with `msg`.', answers: ['AssertionError'] },
        { id: 'py08-l4-k5', kind: 'concept', front: 'Turn a header list and a CSV line into a row dict?', back: '`dict(zip(header, line.split(",")))` — then convert numeric fields explicitly with `float()`/`int()`.' },
      ],
    },
  ],
};
