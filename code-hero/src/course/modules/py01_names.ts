import type { Module } from '../types';

export const module: Module = {
  id: 'py01',
  track: 'python',
  order: 1,
  title: 'Names, Objects & Types',
  icon: '🏷️',
  level: 'Foundations',
  blurb: 'The mental model that makes everything else click: variables are name tags pointing at objects.',
  boss: ['py-gym-reverse-words', 'py-gym-fizzbuzz'],
  lessons: [
    {
      id: 'py01-l1',
      track: 'python',
      title: 'Variables are name tags',
      summary: 'See names and objects as arrows — and why changing one list can "change" another.',
      minutes: 14,
      faang: 'Aliasing bugs (two names, one list) are a classic Google/Meta phone-screen trap, and explaining "names vs objects" clearly is a signal of seniority. Interviewers often ask you to predict output before running code — exactly what you\'ll practise here.',
      tags: ['Memory model', 'Mutability', 'Aliasing', 'Predict the output'],
      cells: [
        {
          kind: 'md',
          text: `In many languages a variable is a *box* that holds a value. In Python it's better to think of a variable as a **name tag** tied to an **object**.

\`x = [1, 2]\` means: *create a list object, then tie the name \`x\` to it.*

Press **Step ▶** below and watch the arrows. Left side = names (the frame). Right side = objects.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `a = [1, 2]
b = a
b.append(3)
print(a)
c = list(a)
c.append(4)
print(a, c)`,
            trace: { view: 'heap' },
          },
          caption: '`b = a` does **not** copy the list — it ties a second name tag to the *same* object. `list(a)` builds a new object.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `scores = [90, 85]
backup = scores
scores.append(70)
print(len(backup))`,
          predict: { question: 'What prints?', options: ['2', '3', 'Error'], answer: 1, explain: '`backup` and `scores` are two names for the **same** list, so the append shows up through both.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: "= ties a tag"',
          text: 'Read `=` as **"ties the tag"**, not "equals". `b = a` ties tag *b* to whatever *a* is tied to. Nothing is copied.',
        },
        {
          kind: 'md',
          text: `Some objects can change (**mutable**: list, dict, set) and some can't (**immutable**: int, float, str, tuple). With immutable objects "changing" a variable really means tying the tag to a **new** object:`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `n = 10
m = n
n = n + 1
print(m, n)`,
          predict: { question: 'What prints?', options: ['11 11', '10 11', '10 10'], answer: 1 },
          trace: { view: 'heap' },
          note: 'Ints are immutable: `n + 1` creates a new int 11 and re-ties `n`; `m` still points at 10.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `print(type(42), type(4.2), type("42"), type([42]), type(True))
print(7 / 2, 7 // 2, 7 % 2, 2 ** 10)`,
          note: '`/` always gives a float, `//` is floor division, `%` is the remainder, `**` is power.',
        },
        {
          kind: 'challenge',
          id: 'py01-l1-c1',
          lang: 'python',
          title: 'Temperature converter',
          prompt: 'Write `to_fahrenheit(c)` that returns the temperature in Fahrenheit: **F = C × 9/5 + 32**.',
          starter: 'def to_fahrenheit(c):\n    # your code here\n    pass\n',
          hints: ['Use `return` to send the value back (printing is not returning).', '`return c * 9 / 5 + 32`'],
          solution: 'def to_fahrenheit(c):\n    return c * 9 / 5 + 32\n',
          explain: 'Functions **return** values; `print` only shows them. Graders (and interviewers) call your function and check what it returns.',
          py: { tests: ['to_fahrenheit(0)', 'to_fahrenheit(100)', 'to_fahrenheit(-40)', 'to_fahrenheit(37)'] },
        },
        {
          kind: 'challenge',
          id: 'py01-l1-c2',
          lang: 'python',
          title: 'Safe copy',
          prompt: '`add_bonus(scores)` should return a **new** list with 5 added to every score — **without changing** the original list.',
          starter: 'def add_bonus(scores):\n    for i in range(len(scores)):\n        scores[i] += 5\n    return scores\n',
          hints: ['The starter mutates the caller\'s list. Build a new one instead.', 'A list comprehension creates a new list: `[s + 5 for s in scores]`'],
          solution: 'def add_bonus(scores):\n    return [s + 5 for s in scores]\n',
          explain: 'Mutating an argument is a side effect the caller didn\'t ask for. Returning a new list keeps functions predictable — interviewers notice this.',
          py: { tests: ['add_bonus([1, 2])', '(lambda xs: (add_bonus(xs), xs))([10, 20])'] },
          trace: { view: 'heap' },
        },
        { kind: 'quiz', id: 'py01-l1-q1', q: 'Which of these types are **mutable**?', options: ['int and str', 'list and dict', 'tuple and str', 'float and bool'], answer: 1, explain: 'list, dict and set can change in place. int, float, str, bool and tuple cannot.' },
        { kind: 'recall', prompt: 'Close your eyes: draw (in your head) what `a = [1]; b = a; b.append(2)` looks like. Then reveal.', answer: 'One list object [1, 2] with TWO name tags (a and b) pointing at it.' },
        { kind: 'explain', id: 'py01-l1-e1', prompt: 'Explain, in your own words, the difference between `b = a` and `b = list(a)`.' },
      ],
      cards: [
        { id: 'py01-l1-k1', kind: 'predict', code: 'a = [1, 2]\nb = a\nb.append(3)\nprint(a)', options: ['[1, 2]', '[1, 2, 3]', '[3]'], answer: 1 },
        { id: 'py01-l1-k2', kind: 'predict', code: 'x = 5\ny = x\nx += 1\nprint(y)', options: ['5', '6', 'Error'], answer: 0 },
        { id: 'py01-l1-k3', kind: 'concept', front: 'Name three mutable and three immutable built-in types.', back: 'Mutable: list, dict, set. Immutable: int, str, tuple (also float, bool, frozenset).' },
        { id: 'py01-l1-k4', kind: 'cloze', text: '`7 // 2` is {{}} and `7 % 2` is {{}}.', answers: ['3', '1'] },
      ],
    },
    {
      id: 'py01-l2',
      track: 'python',
      title: 'Strings, slicing & f-strings',
      summary: 'Index and slice like a pro, and format output the modern way.',
      minutes: 14,
      faang: 'String manipulation is in nearly every coding screen (palindromes, anagrams, parsing logs). Fluent slicing — especially `s[::-1]` and negative indices — saves precious minutes on the clock.',
      tags: ['Strings', 'Slicing', 'f-strings'],
      cells: [
        {
          kind: 'md',
          text: `A string is a sequence of characters, each with an **index** starting at 0. Negative indices count from the end: \`-1\` is the last character.

Slicing \`s[start:stop:step]\` takes characters from **start** up to (but not including) **stop**.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `s = "PYTHON"
i = 0
j = len(s) - 1
out = ""
while i <= j:
    out = out + s[j]
    j -= 1
print(out)`,
            trace: { view: 'array', var: 's', pointers: ['i', 'j'] },
          },
          caption: 'Watch the pointer `j` walk backwards over the string while `out` grows — this is how reversing works under the hood.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `s = "interview"
print(s[0], s[-1], s[2:5], s[:5], s[5:], s[::-1])`,
          predict: { question: 'What is `s[2:5]`?', options: ['ter', 'nte', 'terv', 'int'], answer: 0, fromOutput: false, explain: 'Index 2 is `t`, and the slice stops *before* index 5 → `t e r`.' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: fence posts',
          text: 'Think of indices as the **fence posts between letters**: `|i|n|t|e|r|` — `s[2:5]` is everything between post 2 and post 5. That\'s why the stop index is excluded and `s[:5] + s[5:] == s` always.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `name = "Ada"
balance = 1234.5
rate = 0.0375
print(f"{name} has \${balance:,.2f} at {rate:.1%}")
print(f"|{name:>6}|{name:<6}|{name:^7}|")`,
          note: '`:,.2f` → thousands separator + 2 decimals. `:.1%` multiplies by 100 and adds %. `>6` right-aligns in 6 characters.',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `word = "hello"
word[0] = "J"`,
          error: true,
          note: 'Strings are **immutable** — read the error message: Python tells you exactly what is wrong. Build a new string instead: `"J" + word[1:]`.',
        },
        {
          kind: 'challenge',
          id: 'py01-l2-c1',
          lang: 'python',
          title: 'Initials',
          prompt: 'Write `initials(full_name)` that returns the uppercase initials, e.g. `initials("grace brewster hopper")` → `"GBH"`.',
          starter: 'def initials(full_name):\n    return full_name[0]\n',
          hints: ['`full_name.split()` gives a list of words.', 'Take `w[0]` from each word, join them, then `.upper()`.'],
          solution: "def initials(full_name):\n    return ''.join(w[0] for w in full_name.split()).upper()\n",
          explain: 'split → pick first letters → join → upper. Chaining small string methods is very Pythonic.',
          py: { tests: ['initials("grace brewster hopper")', 'initials("Ada Lovelace")', 'initials("  alan   turing ")'] },
        },
        {
          kind: 'challenge',
          id: 'py01-l2-c2',
          lang: 'python',
          title: 'Is it a palindrome?',
          prompt: 'Write `is_palindrome(s)` that returns `True` if `s` reads the same backwards, **ignoring case and spaces**.',
          starter: 'def is_palindrome(s):\n    return s == s[::-1]\n',
          hints: ['Normalise first: lower-case and remove spaces.', "`t = s.lower().replace(' ', '')` then compare `t == t[::-1]`."],
          solution: "def is_palindrome(s):\n    t = s.lower().replace(' ', '')\n    return t == t[::-1]\n",
          explain: 'Normalise, then compare with the reverse. In interviews you would then be asked for an O(1)-space two-pointer version — coming up in the Patterns module.',
          py: { tests: ['is_palindrome("Race car")', 'is_palindrome("hello")', 'is_palindrome("Never odd or even")', 'is_palindrome("")'] },
        },
        { kind: 'quiz', id: 'py01-l2-q1', q: 'What is `"abcdef"[-3:]`?', options: ['`"abc"`', '`"def"`', '`"cde"`', '`"f"`'], answer: 1, explain: '`-3` is the third character from the end (`d`); with no stop it goes to the end.' },
        { kind: 'recall', prompt: 'How do you reverse any string or list in one expression?', answer: '`s[::-1]` — a slice with step -1.' },
        { kind: 'explain', id: 'py01-l2-e1', prompt: 'Why is the stop index excluded in slices? Explain using the fence-post picture.' },
      ],
      cards: [
        { id: 'py01-l2-k1', kind: 'predict', code: 's = "banana"\nprint(s[1:4])', options: ['ban', 'ana', 'anan', 'nan'], answer: 1 },
        { id: 'py01-l2-k2', kind: 'predict', code: 'print(f"{0.25:.0%}")', options: ['0.25', '25%', '0%', '25.0%'], answer: 1 },
        { id: 'py01-l2-k3', kind: 'cloze', text: 'Reverse a string `s`: `s[{{}}]`', answers: ['::-1'] },
        { id: 'py01-l2-k4', kind: 'concept', front: 'Can you change one character of a string in place?', back: 'No — strings are immutable. Build a new string: `"J" + s[1:]`.' },
      ],
    },
  ],
};
