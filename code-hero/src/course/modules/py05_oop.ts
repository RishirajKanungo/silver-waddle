import type { Module } from '../types';

export const module: Module = {
  id: 'py05',
  track: 'python',
  order: 5,
  title: 'Classes & Objects',
  icon: '🏦',
  level: 'Core',
  blurb: 'Bundle data and behaviour: build a BankAccount, make objects print and sort nicely, and choose inheritance vs composition.',
  boss: ['py-gym-min-stack', 'py-gym-lru-cache'],
  lessons: [
    {
      id: 'py05-l1',
      track: 'python',
      title: 'Classes, instances & self',
      summary: 'A class is a blueprint, an instance is one object built from it — see both in the heap, then build a BankAccount.',
      minutes: 16,
      faang: '"Design a class for …" (a bank account, a stack, a parking lot, an LRU cache) is a standard round in Amazon/Microsoft-style loops. Interviewers look for state kept in `self`, rules enforced inside methods (raise on invalid input) and a helpful `__repr__`.',
      tags: ['OOP', 'Classes', '__init__', 'self', '__repr__', 'Exceptions'],
      cells: [
        {
          kind: 'md',
          text: `A **class** is a blueprint; an **instance** is one object built from it. Step through and watch the heap: one \`Account\` class object, two separate instance objects — each with its **own** \`owner\` and \`balance\`.`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `class Account:
    bank = "CodeHero Bank"

    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def deposit(self, amount):
        self.balance += amount
        return self.balance

a = Account("ana", 100)
b = Account("bo")
a.deposit(50)
print(a.owner, a.balance, b.balance, b.bank)`,
            trace: { view: 'heap' },
          },
          caption: '`Account("ana", 100)` creates an empty object and runs `__init__` on it to fill in attributes. `bank` lives on the **class**, so every instance can read it.',
        },
        {
          kind: 'md',
          text: `**What is \`self\`?** Just the instance the method was called on. Python passes it for you:

\`a.deposit(50)\` is the same as \`Account.deposit(a, 50)\`.

- \`self.balance = ...\` → an **instance attribute** (one per object)
- \`bank = ...\` in the class body → a **class attribute** (one, shared by all)`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `class Counter:
    total = 0

    def __init__(self):
        self.mine = 0

    def hit(self):
        self.mine += 1
        Counter.total += 1

x = Counter()
y = Counter()
x.hit()
x.hit()
y.hit()
print(x.mine, y.mine, Counter.total)`,
          predict: { question: 'What prints?', options: ['2 1 3', '3 3 3', '2 1 2', '1 1 3'], answer: 0, explain: '`mine` is per instance (x: 2, y: 1). `total` is one shared class attribute, bumped by every hit → 3.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: cookie cutter',
          text: 'The **class** is the cookie cutter, each **instance** is a cookie. `self` means "**this** cookie". Icing one cookie (`self.balance += 50`) doesn\'t ice the others.',
        },
        {
          kind: 'md',
          text: `Methods should **protect the object's rules**. A bank account must never let you withdraw more than you have — so the method refuses by **raising** an exception. The caller can catch it with \`try/except\`; if nobody does, the program stops with a clear message:`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `class Account:
    def __init__(self, balance):
        self.balance = balance

    def withdraw(self, amount):
        if amount > self.balance:
            raise ValueError("insufficient funds")
        self.balance -= amount

acct = Account(30)
acct.withdraw(50)`,
          error: true,
          note: 'The check happens **before** the balance changes, so a refused withdrawal leaves the account untouched. `ValueError` is the standard exception for "right type, invalid value".',
        },
        {
          kind: 'md',
          text: `**Making objects print nicely.** By default an object prints as \`<__main__.Money object at 0x…>\` — useless. Define:

- \`__repr__\` — the developer view, ideally looks like code: \`Money(1250)\`. Used in lists, the debugger, the REPL.
- \`__str__\` — the friendly view for users. Used by \`print()\` and \`str()\`; falls back to \`__repr__\` if missing.`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `class Money:
    def __init__(self, cents):
        self.cents = cents

    def __repr__(self):
        return f"Money({self.cents})"

    def __str__(self):
        return f"\${self.cents / 100:.2f}"

m = Money(1250)
print(m, [m])`,
          predict: { question: 'What prints?', options: ['$12.50 [Money(1250)]', 'Money(1250) [Money(1250)]', '$12.50 [$12.50]', '$12.50 $12.50'], answer: 0, explain: '`print(m)` uses `__str__`. A **list** shows its items with `__repr__` — that\'s why defining `__repr__` matters most.' },
        },
        {
          kind: 'challenge',
          id: 'py05-l1-c1',
          lang: 'python',
          title: 'BankAccount with rules',
          prompt: 'Finish `BankAccount`:\n\n- `deposit(amount)` raises `ValueError("deposit must be positive")` if `amount <= 0`, otherwise adds it and returns the new balance\n- `withdraw(amount)` raises `ValueError("insufficient funds")` if `amount > balance`, otherwise subtracts it and returns the new balance\n- `repr(acct)` looks like `BankAccount(\'ana\', 100)`\n\n(`attempt` is a helper the tests use to catch errors — leave it as is.)',
          starter: `def attempt(fn, *args):
    # test helper: returns the result, or the ValueError message
    try:
        return fn(*args)
    except ValueError as e:
        return f"ValueError: {e}"

class BankAccount:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def deposit(self, amount):
        self.balance += amount
        return self.balance

    def withdraw(self, amount):
        # TODO: refuse if amount > balance
        self.balance -= amount
        return self.balance

    # TODO: __repr__
`,
          hints: ['Check first, change second: `if amount > self.balance: raise ValueError("insufficient funds")` goes **before** the subtraction.', 'Same idea in `deposit` with `if amount <= 0:`.', '`def __repr__(self): return f"BankAccount({self.owner!r}, {self.balance})"` — `!r` adds the quotes around the name.'],
          solution: `def attempt(fn, *args):
    # test helper: returns the result, or the ValueError message
    try:
        return fn(*args)
    except ValueError as e:
        return f"ValueError: {e}"

class BankAccount:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def deposit(self, amount):
        if amount <= 0:
            raise ValueError("deposit must be positive")
        self.balance += amount
        return self.balance

    def withdraw(self, amount):
        if amount > self.balance:
            raise ValueError("insufficient funds")
        self.balance -= amount
        return self.balance

    def __repr__(self):
        return f"BankAccount({self.owner!r}, {self.balance})"
`,
          explain: 'Validate **before** mutating, so a failed operation leaves the object exactly as it was. That "never leave the object in a broken state" idea (an *invariant*: balance ≥ 0) is what interviewers look for in class design.',
          py: { tests: ['repr(BankAccount("ana", 100))', '(lambda a: (a.deposit(50), a.withdraw(30), a.balance))(BankAccount("ana", 100))', 'attempt(BankAccount("bo", 20).withdraw, 50)', 'attempt(BankAccount("cy").deposit, -5)', '(lambda a: (attempt(a.withdraw, 999), a.balance))(BankAccount("dee", 10))'] },
          trace: { view: 'heap' },
        },
        {
          kind: 'challenge',
          id: 'py05-l1-c2',
          lang: 'python',
          title: 'A Stack class',
          prompt: 'Build a `Stack` class with `push(x)`, `pop()` (returns the top item, or `None` if empty), `peek()` (the top item without removing it, or `None`), `is_empty()` and `len(stack)` support via `__len__`.',
          starter: 'class Stack:\n    def __init__(self):\n        pass\n\n    def push(self, x):\n        pass\n\n    def pop(self):\n        pass\n\n    def peek(self):\n        pass\n\n    def is_empty(self):\n        pass\n\n    def __len__(self):\n        pass\n',
          hints: ['Store the items in a list on the instance: `self.items = []` in `__init__`.', 'The **end** of the list is the top: `append` to push, `pop()` to pop — both O(1).', 'Guard the empty cases: `return self.items.pop() if self.items else None`; `__len__` returns `len(self.items)`.'],
          solution: 'class Stack:\n    def __init__(self):\n        self.items = []\n\n    def push(self, x):\n        self.items.append(x)\n\n    def pop(self):\n        return self.items.pop() if self.items else None\n\n    def peek(self):\n        return self.items[-1] if self.items else None\n\n    def is_empty(self):\n        return not self.items\n\n    def __len__(self):\n        return len(self.items)\n',
          explain: 'Wrapping a list in a class hides the details and exposes only the operations a stack allows. Defining `__len__` makes `len(s)` work — Python\'s dunder methods plug your class into built-in syntax.',
          py: { tests: ['(lambda s: (s.push(1), s.push(2), s.pop(), s.peek(), len(s)))(Stack())', 'Stack().is_empty()', '(lambda s: (s.push(5), s.is_empty()))(Stack())', 'Stack().pop()', 'len(Stack())'] },
          trace: { view: 'heap' },
        },
        { kind: 'quiz', id: 'py05-l1-q1', q: 'In `a.deposit(50)`, what is `self` inside `deposit`?', options: ['The class `Account`', 'The object `a`', 'The number 50', 'A new copy of `a`'], answer: 1, explain: 'Python passes the instance the method was called on as the first argument: `Account.deposit(a, 50)`.' },
        { kind: 'recall', prompt: 'Which method does `print(obj)` use, and which does `print([obj])` use?', answer: '`print(obj)` → `__str__` (falling back to `__repr__`). Inside a list → `__repr__`.' },
        { kind: 'explain', id: 'py05-l1-e1', prompt: 'Why should `withdraw` check the balance **before** subtracting rather than after?' },
      ],
      cards: [
        { id: 'py05-l1-k1', kind: 'predict', code: 'class A:\n    n = 1\na = A()\nb = A()\na.n = 5\nprint(b.n)', options: ['1', '5', 'Error', 'None'], answer: 0 },
        { id: 'py05-l1-k2', kind: 'predict', code: 'class P:\n    def __init__(self, x):\n        self.x = x\np = P(3)\nq = p\nq.x = 9\nprint(p.x)', options: ['3', '9', 'Error', 'None'], answer: 1 },
        { id: 'py05-l1-k3', kind: 'cloze', text: '`acct.deposit(5)` is the same as `Account.deposit({{}}, 5)`.', answers: ['acct'] },
        { id: 'py05-l1-k4', kind: 'concept', front: '`__repr__` vs `__str__`?', back: '`__repr__`: unambiguous developer view (used in containers, REPL). `__str__`: friendly user view (used by print/str), falls back to `__repr__`.' },
        { id: 'py05-l1-k5', kind: 'concept', front: 'Which exception for "right type, but invalid value" (e.g. withdrawing too much)?', back: '`ValueError`.' },
      ],
    },
    {
      id: 'py05-l2',
      track: 'python',
      title: 'Comparing objects, @property & @dataclass',
      summary: 'Teach objects to compare and sort, guard attributes with properties, and let @dataclass write the boilerplate.',
      minutes: 16,
      faang: 'Sorting custom objects (by `__lt__` or `key=`) shows up in scheduling, interval and leaderboard problems. `@dataclass` lets you model a record in two lines during a timed interview, and `@property` is the Pythonic answer to "how would you validate this field?"',
      tags: ['__eq__', '__lt__', 'Sorting objects', '@property', '@dataclass'],
      cells: [
        {
          kind: 'md',
          text: `By default, \`==\` on two objects asks "are these the **same object**?" — not "do they hold the same data?". Predict this one:`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

print(Point(1, 2) == Point(1, 2))`,
          predict: { question: 'What prints?', options: ['True', 'False', 'Error', 'None'], answer: 1, explain: 'Two separate objects in the heap. Without `__eq__`, `==` falls back to identity (`is`), so it\'s False.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'md',
          text: `Define **comparison dunders** to give objects meaning:

- \`__eq__(self, other)\` → powers \`==\`
- \`__lt__(self, other)\` → powers \`<\` — and that's all \`sorted()\`, \`min()\` and \`max()\` need

\`functools.total_ordering\` can fill in \`<=\`, \`>\`, \`>=\` from those two.`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `class Txn:
    def __init__(self, name, amount):
        self.name = name
        self.amount = amount

    def __eq__(self, other):
        return self.amount == other.amount

    def __lt__(self, other):
        return self.amount < other.amount

    def __repr__(self):
        return self.name

txns = [Txn("rent", 1200), Txn("tea", 4), Txn("pay", 3000)]
print(sorted(txns), Txn("a", 4) == Txn("b", 4))`,
          predict: { question: 'What prints?', options: ['[tea, rent, pay] True', '[pay, rent, tea] True', '[tea, rent, pay] False', 'TypeError: cannot compare Txn'], answer: 0, explain: '`sorted` calls `__lt__` to compare amounts (4 < 1200 < 3000). `__eq__` compares amounts too, so two different 4-unit transactions are "equal".' },
        },
        {
          kind: 'md',
          text: `**@property** turns a method into something that *looks* like a plain attribute. Add a **setter** and every assignment goes through your validation — callers still just write \`acct.balance = 70\`. Step through and watch the setter run on assignment:`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `class Account:
    def __init__(self, balance):
        self._balance = balance

    @property
    def balance(self):
        return self._balance

    @balance.setter
    def balance(self, value):
        if value < 0:
            raise ValueError("negative balance")
        self._balance = value

acct = Account(100)
acct.balance = 70
print(acct.balance)`,
            trace: { view: 'heap' },
          },
          caption: 'The real data lives in `_balance` (a leading underscore means "internal, please don\'t touch"). `balance` is the guarded front door.',
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: the receptionist',
          text: 'A property is a **receptionist**. Visitors ask for `acct.balance` as if walking straight to a desk, but the receptionist (getter/setter) checks the rules first. Callers never see the back office (`_balance`).',
        },
        {
          kind: 'md',
          text: `**@dataclass** writes \`__init__\`, \`__repr__\` and \`__eq__\` for you from type-annotated fields. Extras:

- \`@dataclass(order=True)\` adds \`<\`, \`>\`… comparing fields **in order** (like tuples)
- \`field(default_factory=list)\` gives each instance its **own** list — the dataclass fix for the mutable-default trap`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `from dataclasses import dataclass, field

@dataclass
class Customer:
    name: str
    tier: int = 1
    tags: list = field(default_factory=list)

a = Customer("ana")
b = Customer("ana")
print(a == b, a)`,
          predict: { question: 'What prints?', options: ["True Customer(name='ana', tier=1, tags=[])", 'False Customer(name=ana)', "True <Customer object>", "False Customer(name='ana', tier=1, tags=[])"], answer: 0, explain: 'The generated `__eq__` compares all fields, and the generated `__repr__` lists them. Two lines of class, zero boilerplate.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'challenge',
          id: 'py05-l2-c1',
          lang: 'python',
          title: 'Comparable versions',
          prompt: 'Write a `Version` class built from strings like `"1.10.2"`. Two versions compare **numerically, part by part**, so `Version("1.9") < Version("1.10")`. Implement `__eq__`, `__lt__` and `__repr__` (→ `Version(\'1.10\')`).',
          starter: 'class Version:\n    def __init__(self, s):\n        self.s = s\n\n    def __eq__(self, other):\n        return self.s == other.s\n\n    def __lt__(self, other):\n        return self.s < other.s\n\n    def __repr__(self):\n        return f"Version({self.s!r})"\n',
          hints: ['As strings, `"1.10" < "1.9"` is True (character "1" < "9"). You need numbers.', 'In `__init__`, also store `self.parts = tuple(int(p) for p in s.split("."))`.', 'Compare the tuples: `return self.parts < other.parts` (tuples compare element by element).'],
          solution: 'class Version:\n    def __init__(self, s):\n        self.s = s\n        self.parts = tuple(int(p) for p in s.split("."))\n\n    def __eq__(self, other):\n        return self.parts == other.parts\n\n    def __lt__(self, other):\n        return self.parts < other.parts\n\n    def __repr__(self):\n        return f"Version({self.s!r})"\n',
          explain: 'Turn the object into a **tuple key** once, then let tuple comparison do the work. (Interview follow-up: should "1.0" equal "1.0.0"? Pad with zeros.)',
          py: { tests: ['Version("1.10") < Version("1.9")', 'Version("1.2") < Version("1.10")', 'Version("1.0") == Version("1.0")', 'sorted([Version("2.0"), Version("1.10"), Version("1.2")])', 'Version("0.1") < Version("0.1")'] },
        },
        {
          kind: 'challenge',
          id: 'py05-l2-c2',
          lang: 'python',
          title: 'Validated salary property',
          prompt: 'Make `Employee.salary` a **property** whose setter raises `ValueError("salary must be >= 0")` for negative values (including in `__init__`). Add a **read-only** property `monthly` = `round(salary / 12, 2)`.',
          starter: 'def attempt(fn):\n    # test helper: returns the result, or the ValueError message\n    try:\n        return fn()\n    except ValueError as e:\n        return f"ValueError: {e}"\n\nclass Employee:\n    def __init__(self, name, salary):\n        self.name = name\n        self.salary = salary\n\n    # TODO: a validated `salary` property and a read-only `monthly` property\n',
          hints: ['Store the real value in `self._salary`. The getter: `@property def salary(self): return self._salary`.', 'The setter: `@salary.setter def salary(self, value):` — raise if `value < 0`, else set `self._salary = value`. Keep `self.salary = salary` in `__init__` so it goes through the setter too.', 'Read-only = a property with no setter: `@property def monthly(self): return round(self._salary / 12, 2)`.'],
          solution: 'def attempt(fn):\n    # test helper: returns the result, or the ValueError message\n    try:\n        return fn()\n    except ValueError as e:\n        return f"ValueError: {e}"\n\nclass Employee:\n    def __init__(self, name, salary):\n        self.name = name\n        self.salary = salary\n\n    @property\n    def salary(self):\n        return self._salary\n\n    @salary.setter\n    def salary(self, value):\n        if value < 0:\n            raise ValueError("salary must be >= 0")\n        self._salary = value\n\n    @property\n    def monthly(self):\n        return round(self._salary / 12, 2)\n',
          explain: 'Assigning through `self.salary` in `__init__` means **one** place enforces the rule. A computed property like `monthly` can never go stale, because it is recalculated on every read.',
          py: { tests: ['Employee("a", 1200).monthly', '(lambda e: (setattr(e, "salary", 2400), e.monthly))(Employee("a", 1200))', 'attempt(lambda: Employee("b", -5))', 'attempt(lambda: setattr(Employee("c", 10), "salary", -1))', 'Employee("d", 0).monthly'] },
          trace: { view: 'heap' },
        },
        { kind: 'quiz', id: 'py05-l2-q1', q: 'Which methods does a plain `@dataclass` generate for you?', options: ['Only `__init__`', '`__init__`, `__repr__` and `__eq__`', '`__init__`, `__lt__` and `__hash__`', 'None — it only adds type checking'], answer: 1, explain: 'By default: `__init__`, `__repr__`, `__eq__`. `order=True` adds the ordering methods. It does **not** check types at runtime.' },
        { kind: 'recall', prompt: 'What is the minimum a class needs for `sorted(list_of_objects)` to work?', answer: 'A `__lt__` method (or pass `key=` to sorted instead).' },
        { kind: 'explain', id: 'py05-l2-e1', prompt: 'Why use `@property` instead of a `get_salary()` / `set_salary()` method pair?' },
      ],
      cards: [
        { id: 'py05-l2-k1', kind: 'predict', code: 'class A:\n    pass\nprint(A() == A())', options: ['True', 'False', 'Error', 'None'], answer: 1 },
        { id: 'py05-l2-k2', kind: 'predict', code: 'from dataclasses import dataclass\n@dataclass\nclass P:\n    x: int\nprint(P(1) == P(1), P(2))', options: ['True P(x=2)', 'False P(x=2)', 'True P(2)', 'False <P object>'], answer: 0 },
        { id: 'py05-l2-k3', kind: 'cloze', text: 'Use `field(default_factory={{}})` for a list default in a dataclass.', answers: ['list'] },
        { id: 'py05-l2-k4', kind: 'concept', front: 'What does `sorted()` need from custom objects?', back: '`__lt__` (less-than) — or a `key=` function that returns comparable values.' },
        { id: 'py05-l2-k5', kind: 'concept', front: 'Why use `@property` with a setter?', back: 'Attribute-style access (`obj.x = 5`) while still running validation/computation on every get/set.' },
      ],
    },
    {
      id: 'py05-l3',
      track: 'python',
      title: 'Inheritance, super() & composition',
      summary: 'Reuse code with "is-a" inheritance and super(), and build bigger objects out of smaller ones with "has-a" composition.',
      minutes: 15,
      faang: 'Object-oriented design rounds ("design a bank", "design a parking lot") test whether you pick **is-a** (inheritance) vs **has-a** (composition) sensibly, keep responsibilities small, and enforce invariants in methods. "Favour composition over inheritance" is a phrase interviewers like to hear — with a reason.',
      tags: ['Inheritance', 'super()', 'Polymorphism', 'Composition', 'OOP design'],
      cells: [
        {
          kind: 'md',
          text: `**Inheritance** says "a \`Savings\` account **is an** \`Account\`, plus extras". The child class gets all the parent's methods for free and can add or override some. Step through — watch \`super().__init__\` run the parent's setup on the same object:`,
        },
        {
          kind: 'viz',
          viz: {
            type: 'trace',
            code: `class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def withdraw(self, amount):
        if amount > self.balance:
            raise ValueError("insufficient funds")
        self.balance -= amount

class Savings(Account):
    def __init__(self, owner, balance=0, rate=0.02):
        super().__init__(owner, balance)
        self.rate = rate

    def add_interest(self):
        self.balance += round(self.balance * self.rate, 2)

s = Savings("ana", 1000)
s.withdraw(200)
s.add_interest()
print(s.owner, s.balance, isinstance(s, Account))`,
            trace: { view: 'heap' },
          },
          caption: '`s.withdraw` isn\'t defined on `Savings`, so Python finds it on `Account`. One object, attributes from both classes.',
        },
        {
          kind: 'md',
          text: `**Method lookup:** for \`obj.method()\` Python searches the **instance**, then its **class**, then the **parent**, and so on up. The first match wins — so a child can **override** a parent method. Inside the override, \`super().method()\` calls the parent's version.

Calling the same method on different classes and getting class-specific behaviour is **polymorphism**.`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `class Account:
    def fee(self):
        return 5

class Premium(Account):
    def fee(self):
        return super().fee() - 5

class Student(Account):
    def fee(self):
        return 2

print([a.fee() for a in [Account(), Premium(), Student()]])`,
          predict: { question: 'What prints?', options: ['[5, 0, 2]', '[5, 5, 5]', '[5, -5, 2]', '[5, 0, 7]'], answer: 0, explain: 'Each object uses its own class\'s `fee`. `Premium.fee` asks the parent (5) and subtracts 5 → 0.' },
        },
        {
          kind: 'callout',
          tone: 'memory',
          title: 'Memory hook: the elevator goes up',
          text: 'Attribute lookup is an **elevator that only goes up**: instance floor → class floor → parent floor → … The first floor that has the name wins. `super()` means "skip my floor, start one above".',
        },
        {
          kind: 'code',
          lang: 'python',
          code: `class Base:
    def __init__(self):
        self.ready = True

class Child(Base):
    def __init__(self):
        self.name = "kid"

c = Child()
print(hasattr(c, "ready"))`,
          predict: { question: 'What prints?', options: ['True', 'False', 'Error', 'None'], answer: 1, explain: '`Child.__init__` overrides `Base.__init__` and never calls `super().__init__()`, so `ready` is never set. Forgetting `super().__init__` is the #1 inheritance bug.' },
          trace: { view: 'heap' },
        },
        {
          kind: 'md',
          text: `**Composition** says "a \`Bank\` **has** accounts". Instead of inheriting, an object holds other objects as attributes and delegates work to them.

Rule of thumb: use inheritance only for a true **is-a** with shared behaviour. For **has-a** — or when you'd inherit just to reuse one method — compose. Composition keeps classes small and easy to swap.`,
        },
        {
          kind: 'code',
          lang: 'python',
          code: `class Account:
    def __init__(self, owner, balance):
        self.owner = owner
        self.balance = balance

class Bank:
    def __init__(self):
        self.accounts = {}

    def open(self, owner, balance=0):
        self.accounts[owner] = Account(owner, balance)

    def total(self):
        return sum(a.balance for a in self.accounts.values())

bank = Bank()
bank.open("ana", 100)
bank.open("bo", 250)
print(bank.total(), len(bank.accounts))`,
          trace: { view: 'heap' },
          note: 'The heap shows a `Bank` whose dict points at two `Account` objects — has-a, drawn as arrows.',
        },
        {
          kind: 'callout',
          tone: 'interview',
          title: 'How OOP design is asked',
          text: 'In a "design a bank / parking lot / library" round: name the **nouns** (classes) and **verbs** (methods), say which relationships are is-a vs has-a, state the **invariants** (balance ≥ 0) and which method enforces each, and raise clear errors on invalid input. Code only the core; describe the rest.',
        },
        {
          kind: 'challenge',
          id: 'py05-l3-c1',
          lang: 'python',
          title: 'Checking account with overdraft',
          prompt: 'Write `CheckingAccount(Account)` taking `owner, balance=0, overdraft=0`. It reuses the parent\'s setup via `super()`, and its `withdraw` allows the balance to go down to `-overdraft` (raising `ValueError("insufficient funds")` beyond that). `withdraw` returns the new balance.',
          starter: `def attempt(fn, *args):
    # test helper: returns the result, or the ValueError message
    try:
        return fn(*args)
    except ValueError as e:
        return f"ValueError: {e}"

class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def deposit(self, amount):
        self.balance += amount
        return self.balance

    def withdraw(self, amount):
        if amount > self.balance:
            raise ValueError("insufficient funds")
        self.balance -= amount
        return self.balance

class CheckingAccount(Account):
    def __init__(self, owner, balance=0, overdraft=0):
        self.overdraft = overdraft
    # TODO: run the parent's __init__, and override withdraw
`,
          hints: ['The starter never sets `owner` or `balance` — the parent\'s `__init__` is skipped.', 'First line of `__init__`: `super().__init__(owner, balance)`.', 'Override: `def withdraw(self, amount):` — raise if `self.balance - amount < -self.overdraft`, else subtract and return the balance.'],
          solution: `def attempt(fn, *args):
    # test helper: returns the result, or the ValueError message
    try:
        return fn(*args)
    except ValueError as e:
        return f"ValueError: {e}"

class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def deposit(self, amount):
        self.balance += amount
        return self.balance

    def withdraw(self, amount):
        if amount > self.balance:
            raise ValueError("insufficient funds")
        self.balance -= amount
        return self.balance

class CheckingAccount(Account):
    def __init__(self, owner, balance=0, overdraft=0):
        super().__init__(owner, balance)
        self.overdraft = overdraft

    def withdraw(self, amount):
        if self.balance - amount < -self.overdraft:
            raise ValueError("insufficient funds")
        self.balance -= amount
        return self.balance
`,
          explain: 'The child reuses `__init__` and `deposit` unchanged and overrides only the rule that differs. That\'s inheritance at its best: a genuine is-a with one specialised behaviour.',
          py: { tests: ['(lambda c: (c.withdraw(150), c.balance))(CheckingAccount("a", 100, overdraft=100))', 'attempt(CheckingAccount("b", 0, overdraft=50).withdraw, 60)', 'CheckingAccount("c", 10).overdraft', 'isinstance(CheckingAccount("d", 1), Account)', '(lambda c: (c.deposit(5), c.owner))(CheckingAccount("e", 0, overdraft=10))'] },
          trace: { view: 'heap' },
        },
        {
          kind: 'challenge',
          id: 'py05-l3-c2',
          lang: 'python',
          title: 'Safe transfers (composition)',
          prompt: '`Bank` **has** accounts. Fix `transfer(src, dst, amount)` so that it raises `ValueError("unknown account")` if either name is missing, and if the withdrawal fails, **neither** balance changes.',
          starter: `def attempt(fn, *args):
    # test helper: returns the result, or the ValueError message
    try:
        return fn(*args)
    except ValueError as e:
        return f"ValueError: {e}"

class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def deposit(self, amount):
        self.balance += amount

    def withdraw(self, amount):
        if amount > self.balance:
            raise ValueError("insufficient funds")
        self.balance -= amount

class Bank:
    def __init__(self):
        self.accounts = {}

    def open(self, owner, balance=0):
        self.accounts[owner] = Account(owner, balance)

    def balance_of(self, owner):
        return self.accounts[owner].balance

    def transfer(self, src, dst, amount):
        self.accounts[dst].deposit(amount)
        self.accounts[src].withdraw(amount)
`,
          hints: ['With the starter, a failed transfer has **already** credited `dst` before `withdraw` raises.', 'Withdraw first: if it raises, nothing else has happened yet. Then deposit.', 'Before anything: `if src not in self.accounts or dst not in self.accounts: raise ValueError("unknown account")`.'],
          solution: `def attempt(fn, *args):
    # test helper: returns the result, or the ValueError message
    try:
        return fn(*args)
    except ValueError as e:
        return f"ValueError: {e}"

class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def deposit(self, amount):
        self.balance += amount

    def withdraw(self, amount):
        if amount > self.balance:
            raise ValueError("insufficient funds")
        self.balance -= amount

class Bank:
    def __init__(self):
        self.accounts = {}

    def open(self, owner, balance=0):
        self.accounts[owner] = Account(owner, balance)

    def balance_of(self, owner):
        return self.accounts[owner].balance

    def transfer(self, src, dst, amount):
        if src not in self.accounts or dst not in self.accounts:
            raise ValueError("unknown account")
        self.accounts[src].withdraw(amount)
        self.accounts[dst].deposit(amount)
`,
          explain: 'Do the step that can fail **first**, then the steps that can\'t — so a failure leaves no half-finished transfer. It\'s the same all-or-nothing idea as a database transaction (and a favourite follow-up in bank-themed design rounds).',
          py: { tests: ['(lambda b: (b.open("a", 100), b.open("b", 0), b.transfer("a", "b", 30), b.balance_of("a"), b.balance_of("b")))(Bank())', '(lambda b: (b.open("a", 10), b.open("b", 0), attempt(b.transfer, "a", "b", 50), b.balance_of("a"), b.balance_of("b")))(Bank())', 'attempt(Bank().transfer, "x", "y", 1)', '(lambda b: (b.open("a", 5), b.open("b", 5), b.transfer("a", "b", 5), b.balance_of("a")))(Bank())'] },
          trace: { view: 'heap' },
        },
        { kind: 'quiz', id: 'py05-l3-q1', q: 'A `Car` and an `Engine`: which relationship fits best?', options: ['`Car` inherits from `Engine`', '`Engine` inherits from `Car`', '`Car` has an `Engine` attribute (composition)', 'They should be one class'], answer: 2, explain: 'A car **has an** engine — it is not a kind of engine. Has-a → composition.' },
        { kind: 'recall', prompt: 'What does `super().__init__(...)` do, and what goes wrong if you forget it?', answer: 'It runs the parent class\'s `__init__` on the same object. Forget it and the parent\'s attributes are never set (AttributeError later).' },
        { kind: 'explain', id: 'py05-l3-e1', prompt: 'Explain "favour composition over inheritance" using the Bank and Account example.' },
      ],
      cards: [
        { id: 'py05-l3-k1', kind: 'predict', code: 'class A:\n    def hi(self):\n        return "A"\nclass B(A):\n    def hi(self):\n        return "B" + super().hi()\nprint(B().hi())', options: ['BA', 'AB', 'B', 'A'], answer: 0 },
        { id: 'py05-l3-k2', kind: 'predict', code: 'class A:\n    pass\nclass B(A):\n    pass\nprint(isinstance(B(), A), issubclass(A, B))', options: ['True False', 'True True', 'False False', 'False True'], answer: 0 },
        { id: 'py05-l3-k3', kind: 'cloze', text: 'Call the parent constructor with `{{}}().__init__(...)`.', answers: ['super'] },
        { id: 'py05-l3-k4', kind: 'concept', front: 'is-a vs has-a?', back: 'is-a → inheritance (Savings is an Account). has-a → composition (Bank has Accounts).' },
        { id: 'py05-l3-k5', kind: 'concept', front: 'What is polymorphism?', back: 'Calling the same method on objects of different classes and getting each class\'s own behaviour (e.g. `a.fee()` for Account/Premium/Student).' },
      ],
    },
  ],
};
