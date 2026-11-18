// Python programs used to verify the interpreter against real CPython.
// Each must print deterministic output (no set-of-str printing, no ids).

export const CORPUS: Record<string, string> = {
  basics: `
x = 5
y = 2
print(x + y, x - y, x * y, x / y, x // y, x % y, x ** y)
print(-7 // 2, -7 % 2, 7 // -2, 7 % -2, 2 ** -1, 10 / 4)
print(0.1 + 0.2, 1e16, 1e-5, 123456789.123, 3.0, 1/3, 2.5e-10, float('inf'))
print(round(2.5), round(3.5), round(2.675, 2), round(-0.5), round(7.123456, 3))
print(int('42') + 1, float('3.5'), str(12) + '!', bool(0), bool('a'), int(-3.9))
print(True + True, True * 10, 7 == 7.0, 1 < 2 < 3, 3 > 2 > 5)
print(2 ** 100, 10 ** 20 // 3)
print(abs(-3), abs(-2.5), max(3, 9, 1), min([4, 2, 8]), sum([1, 2, 3]), sum([0.5, 0.25]))
print(divmod(17, 5), pow(2, 10), pow(3, 4, 5), hex(255), bin(5), oct(8))
print(type(3), type(3.0), type('a'), type([]), type({}), type(None), type(True))
print(isinstance(True, int), isinstance(3, (str, int)))
`,
  strings: `
s = "Hello, World"
print(s.upper(), s.lower(), s.swapcase(), len(s))
print(s[0], s[-1], s[0:5], s[7:], s[::-1], s[::2])
print(s.find('o'), s.rfind('o'), s.count('l'), s.index('W'))
print(s.replace('l', 'L'), s.replace('l', 'L', 1))
print(s.split(', '), '  a b  c '.split(), 'a,b,,c'.split(','), 'a b c'.split(' ', 1))
print('-'.join(['x', 'y', 'z']), ''.join(reversed('abc')))
print('  pad  '.strip() + '|', 'xxhixx'.strip('x'), '..a..'.lstrip('.'), '..a..'.rstrip('.'))
print('abc'.startswith('ab'), 'abc'.endswith(('x', 'c')), '123'.isdigit(), 'abc'.isalpha(), 'a1'.isalnum())
print('hello world'.title(), 'hello'.capitalize(), 'Python'.center(12, '*'), '7'.zfill(3), 'ab'.ljust(4, '.') + '|', 'ab'.rjust(4))
print('a-b-c'.partition('-'), 'a-b-c'.rpartition('-'))
print(repr('it\\'s'), repr("say \\"hi\\""), repr('tab\\there'), repr('new\\nline'))
name, age, pi = 'Ada', 36, 3.14159
print(f"{name} is {age} years old; pi={pi:.2f}; {age:>5}|{age:<5}|{age:^5}|")
print(f"{1234567:,} {0.25:.1%} {42:08.3f} {255:x} {255:#b} {'hi'!r} {age=} {3.0}")
print("{} and {}".format('A', 'B'), "{1}{0}".format('a', 'b'), "{x}-{y}".format(x=1, y=2), "{:>6.2f}".format(3.14159))
print("%s has %d items costing %.2f" % ('cart', 3, 9.5), "%5s|%-5s|%03d" % ('a', 'b', 7))
print('ab' * 3, 'a' in 'cat', 'z' not in 'cat', ord('A'), chr(97))
print("multi\\nline")
print('x', 'y', sep='-', end='!\\n')
print(str(None), str([1, 'a']), str((1,)), str({'k': [1, 2]}))
`,
  lists: `
nums = [5, 3, 8, 1]
nums.append(7)
nums.insert(0, 10)
print(nums, len(nums))
nums.remove(8)
print(nums.pop(), nums.pop(0), nums)
nums.extend([2, 2])
print(nums.count(2), nums.index(3))
nums.sort()
print(nums)
nums.sort(reverse=True)
print(nums)
print(sorted([3, 1, 2]), sorted(['b', 'A', 'c'], key=str.lower), sorted([(1, 'b'), (1, 'a'), (0, 'z')]))
words = ['banana', 'kiwi', 'apple', 'fig']
print(sorted(words, key=len), sorted(words, key=lambda w: (-len(w), w)))
a = [1, 2, 3]
b = a
b.append(4)
print(a, b, a is b, a == [1, 2, 3, 4])
c = a[:]
c.append(5)
print(a, c)
a += [9]
print(a, b)
grid = [[0] * 3 for _ in range(2)]
grid[0][1] = 5
print(grid)
bad = [[0] * 2] * 2
bad[0][0] = 1
print(bad)
print([1, 2] + [3], [0] * 4, [x * x for x in range(6) if x % 2 == 0])
print(list(range(10))[2:8:2], list(range(5, 0, -1)), list(range(0)))
m = [[1, 2, 3], [4, 5, 6]]
print([list(r) for r in zip(*m)], [v for row in m for v in row])
lst = [1, 2, 3, 4, 5]
lst[1:3] = ['a', 'b', 'c']
print(lst)
del lst[0]
del lst[-2:]
print(lst, lst[::-1], [3, 1] < [3, 2], max([[1, 2], [1, 3]]))
first, *rest = [1, 2, 3, 4]
*init, last = 'abcd'
print(first, rest, init, last)
x, y = 1, 2
x, y = y, x
print(x, y)
`,
  dicts_sets: `
d = {'apple': 3, 'banana': 1}
d['cherry'] = 7
d['apple'] += 1
print(d, len(d), 'apple' in d, 'zzz' in d)
print(d.get('banana'), d.get('zzz'), d.get('zzz', 0))
for k, v in d.items():
    print(k, v)
print(list(d.keys()), list(d.values()), sorted(d, key=d.get))
print(d.pop('banana'), d)
d.setdefault('kiwi', 0)
d.update({'apple': 10, 'mango': 2})
print(d)
counts = {}
for ch in 'mississippi':
    counts[ch] = counts.get(ch, 0) + 1
print(counts)
inv = {v: k for k, v in counts.items()}
print(inv)
print(dict(zip(['a', 'b'], [1, 2])), dict(x=1, y=2), {**{'a': 1}, 'b': 2})
s = {3, 1, 2, 3, 1}
s.add(5)
s.discard(10)
print(s, len(s), 2 in s, sorted(s))
a, b = {1, 2, 3, 4}, {3, 4, 5}
print(a | b, a & b, a - b, a ^ b, a <= {1, 2, 3, 4, 5})
print(set(), dict(), {1: 'one', 2: 'two'}[2])
print(sorted({'b', 'a', 'c'}))
nested = {'user': {'name': 'Ada', 'langs': ['py', 'sql']}}
print(nested['user']['langs'][1])
print(d.keys(), d.values())
try:
    d['nope']
except KeyError as e:
    print('KeyError', e)
`,
  control: `
for i in range(1, 16):
    if i % 15 == 0:
        print('FizzBuzz')
    elif i % 3 == 0:
        print('Fizz')
    elif i % 5 == 0:
        print('Buzz')
    else:
        print(i)
n = 0
while True:
    n += 1
    if n == 3:
        continue
    if n > 5:
        break
    print('n', n)
for x in [1, 2, 3]:
    if x == 10:
        break
else:
    print('no break')
for i, ch in enumerate('abc', start=1):
    print(i, ch)
for a, b in zip([1, 2, 3], 'xy'):
    print(a, b)
print('even' if 4 % 2 == 0 else 'odd')
print(any(x > 2 for x in [1, 2, 3]), all([]), any([]), all(x > 0 for x in [1, 2]))
if (k := len('hello')) > 3:
    print('walrus', k)
total = 0
for row in [[1, 2], [3, 4]]:
    for v in row:
        total += v
print(total)
`,
  functions: `
def greet(name, greeting='Hello'):
    return f'{greeting}, {name}!'
print(greet('Ada'), greet('Bob', greeting='Hi'), greet(greeting='Yo', name='C'))
def stats(*nums, **opts):
    return len(nums), sum(nums), sorted(opts.items())
print(stats(1, 2, 3, scale=2, mode='x'))
def make_counter():
    count = 0
    def inc():
        nonlocal count
        count += 1
        return count
    return inc
c = make_counter()
print(c(), c(), c())
x = 10
def change():
    global x
    x = 99
change()
print(x)
def fact(n):
    return 1 if n <= 1 else n * fact(n - 1)
print(fact(5), fact(20), fact(25))
def fib(n, memo={}):
    if n in memo:
        return memo[n]
    if n < 2:
        return n
    memo[n] = fib(n - 1) + fib(n - 2)
    return memo[n]
print(fib(50))
square = lambda v: v * v
print(list(map(square, [1, 2, 3])), list(filter(lambda v: v % 2, range(7))))
def apply(f, *args):
    return f(*args)
print(apply(max, 3, 9, 2))
funcs = [lambda: i for i in range(3)]
print([f() for f in funcs])
def kw_only(a, *, b=2):
    return a + b
print(kw_only(1), kw_only(1, b=5))
def outer():
    def inner():
        return 'inner'
    return inner()
print(outer())
def no_return():
    pass
print(no_return())
def bad():
    print(y_undefined)
try:
    bad()
except NameError as e:
    print(e)
def unbound():
    print(z)
    z = 1
try:
    unbound()
except UnboundLocalError as e:
    print(type(e).__name__)
try:
    greet()
except TypeError as e:
    print(e)
try:
    greet(1, 2, 3)
except TypeError as e:
    print(e)
`,
  classes: `
class Animal:
    species_count = 0
    def __init__(self, name, sound):
        self.name = name
        self.sound = sound
        Animal.species_count += 1
    def speak(self):
        return f'{self.name} says {self.sound}'
    def __repr__(self):
        return f'Animal({self.name!r})'
class Dog(Animal):
    def __init__(self, name):
        super().__init__(name, 'woof')
        self.tricks = []
    def add_trick(self, t):
        self.tricks.append(t)
        return self
    def speak(self):
        return super().speak() + '!'
d = Dog('Rex')
d.add_trick('sit').add_trick('roll')
print(d.speak(), d.tricks, Animal.species_count, isinstance(d, Animal), type(d).__name__)
print([Animal('cat', 'meow'), d])
class Vec:
    def __init__(self, x, y):
        self.x, self.y = x, y
    def __add__(self, o):
        return Vec(self.x + o.x, self.y + o.y)
    def __mul__(self, k):
        return Vec(self.x * k, self.y * k)
    def __eq__(self, o):
        return isinstance(o, Vec) and (self.x, self.y) == (o.x, o.y)
    def __lt__(self, o):
        return (self.x ** 2 + self.y ** 2) < (o.x ** 2 + o.y ** 2)
    def __len__(self):
        return 2
    def __str__(self):
        return f'<{self.x}, {self.y}>'
    __repr__ = __str__
v = Vec(1, 2) + Vec(3, 4)
print(v, v * 2, v == Vec(4, 6), len(v), sorted([Vec(3, 3), Vec(1, 0)]))
class Temp:
    def __init__(self, c):
        self._c = c
    @property
    def f(self):
        return self._c * 9 / 5 + 32
    @f.setter
    def f(self, val):
        self._c = (val - 32) * 5 / 9
    @staticmethod
    def unit():
        return 'C'
    @classmethod
    def freezing(cls):
        return cls(0)
t = Temp(100)
print(t.f, Temp.unit(), Temp.freezing().f)
t.f = 32
print(t._c)
class Stack:
    def __init__(self):
        self.items = []
    def push(self, x):
        self.items.append(x)
    def pop(self):
        if not self.items:
            raise IndexError('pop from empty stack')
        return self.items.pop()
    def __len__(self):
        return len(self.items)
    def __bool__(self):
        return bool(self.items)
    def __iter__(self):
        return iter(reversed(self.items))
s = Stack()
s.push(1); s.push(2); s.push(3)
print(s.pop(), len(s), bool(s), list(s))
try:
    Stack().pop()
except IndexError as e:
    print('error:', e)
class MyError(Exception):
    pass
class ValidationError(ValueError):
    def __init__(self, field):
        super().__init__(f'bad field: {field}')
        self.field = field
try:
    raise ValidationError('email')
except ValueError as e:
    print(type(e).__name__, e, e.field, e.args)
try:
    raise MyError('custom', 2)
except Exception as e:
    print(repr(e), str(e))
print(hasattr(d, 'name'), getattr(d, 'nope', 'default'))
`,
  linked_list: `
class Node:
    def __init__(self, val, next=None):
        self.val = val
        self.next = next
class LinkedList:
    def __init__(self):
        self.head = None
        self.size = 0
    def push_front(self, val):
        self.head = Node(val, self.head)
        self.size += 1
    def append(self, val):
        node = Node(val)
        if not self.head:
            self.head = node
        else:
            cur = self.head
            while cur.next:
                cur = cur.next
            cur.next = node
        self.size += 1
    def reverse(self):
        prev, cur = None, self.head
        while cur:
            nxt = cur.next
            cur.next = prev
            prev = cur
            cur = nxt
        self.head = prev
    def __iter__(self):
        cur = self.head
        while cur:
            yield cur.val
            cur = cur.next
    def __repr__(self):
        return ' -> '.join(str(v) for v in self) + ' -> None'
ll = LinkedList()
for v in [1, 2, 3]:
    ll.append(v)
ll.push_front(0)
print(ll, ll.size)
ll.reverse()
print(ll, list(ll), sum(ll))
def has_cycle(head):
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:
            return True
    return False
print(has_cycle(ll.head))
`,
  generators: `
def countdown(n):
    while n > 0:
        yield n
        n -= 1
    return 'done'
print(list(countdown(4)))
g = countdown(2)
print(next(g), next(g), next(g, 'end'))
def fib_gen():
    a, b = 0, 1
    while True:
        yield a
        a, b = b, a + b
import itertools
print(list(itertools.islice(fib_gen(), 10)))
squares = (x * x for x in range(5))
print(sum(squares), sum(squares))
def chain(*its):
    for it in its:
        yield from it
print(list(chain([1, 2], 'ab', range(2))))
def echo():
    received = yield 'ready'
    while True:
        received = yield f'got {received}'
e = echo()
print(next(e), e.send('x'), e.send('y'))
gen = (c.upper() for c in 'hey')
print(list(gen))
`,
  exceptions: `
def safe_div(a, b):
    try:
        result = a / b
    except ZeroDivisionError:
        return 'cannot divide by zero'
    except TypeError as e:
        return f'type problem: {e}'
    else:
        return result
    finally:
        print('finally runs')
print(safe_div(10, 2))
print(safe_div(1, 0))
print(safe_div('a', 1))
try:
    [1, 2][5]
except IndexError as e:
    print('IndexError:', e)
try:
    int('abc')
except ValueError as e:
    print('ValueError:', e)
try:
    {}['k']
except LookupError as e:
    print('LookupError caught KeyError:', repr(e))
try:
    'a' + 1
except TypeError as e:
    print(e)
try:
    1 + 'a'
except TypeError as e:
    print(e)
try:
    None.foo
except AttributeError as e:
    print(e)
try:
    [].foo()
except AttributeError as e:
    print(e)
try:
    len(5)
except TypeError as e:
    print(e)
try:
    5()
except TypeError as e:
    print(e)
try:
    3[0]
except TypeError as e:
    print(e)
try:
    assert 1 > 2, 'math broke'
except AssertionError as e:
    print('assert:', e)
try:
    try:
        raise ValueError('inner')
    except ValueError:
        raise
except ValueError as e:
    print('re-raised', e)
def deep(n):
    return deep(n + 1)
try:
    deep(0)
except RecursionError:
    print('recursion error caught')
a, b = 1, 0
try:
    x, y = [1, 2, 3]
except ValueError as e:
    print(e)
`,
  collections_mod: `
from collections import Counter, defaultdict, deque, namedtuple, OrderedDict
c = Counter('abracadabra')
print(c.most_common(2), c['a'], c['z'])
c2 = Counter(['x', 'y', 'x'])
c2.update(['y', 'y'])
print(c2, sorted(c2.elements()))
dd = defaultdict(list)
for word in ['apple', 'avocado', 'banana', 'blueberry', 'cherry']:
    dd[word[0]].append(word)
print(dict(dd))
cnt = defaultdict(int)
for ch in 'hello':
    cnt[ch] += 1
print(sorted(cnt.items()))
q = deque([1, 2, 3])
q.appendleft(0)
q.append(4)
print(q.popleft(), q.pop(), q, len(q))
q.rotate(1)
print(q)
w = deque(maxlen=3)
for i in range(5):
    w.append(i)
print(w)
Point = namedtuple('Point', ['x', 'y'])
p = Point(3, 4)
print(p, p.x + p.y, p[0])
od = OrderedDict()
od['b'] = 1
od['a'] = 2
print(list(od.keys()))
`,
  heapq_bisect: `
import heapq
h = []
for v in [5, 1, 8, 3, 2]:
    heapq.heappush(h, v)
print(h[0], [heapq.heappop(h) for _ in range(3)], h)
nums = [9, 4, 7, 1]
heapq.heapify(nums)
print(nums[0], heapq.nlargest(2, [5, 1, 9, 3]), heapq.nsmallest(2, [5, 1, 9, 3]))
tasks = []
heapq.heappush(tasks, (2, 'write'))
heapq.heappush(tasks, (1, 'plan'))
heapq.heappush(tasks, (3, 'ship'))
while tasks:
    print(heapq.heappop(tasks))
import bisect
arr = [1, 3, 5, 7]
print(bisect.bisect_left(arr, 5), bisect.bisect_right(arr, 5), bisect.bisect(arr, 4))
bisect.insort(arr, 4)
print(arr)
`,
  itertools_functools: `
from itertools import permutations, combinations, product, accumulate, chain, groupby, count
print(list(permutations('abc', 2)))
print(list(combinations([1, 2, 3, 4], 2)))
print(list(product('ab', repeat=2)))
print(list(accumulate([1, 2, 3, 4])), list(chain('ab', [1])))
for k, g in groupby('aaabbc'):
    print(k, list(g))
from functools import reduce, lru_cache
print(reduce(lambda a, b: a * b, [1, 2, 3, 4]))
@lru_cache(maxsize=None)
def ways(n):
    return 1 if n <= 1 else ways(n - 1) + ways(n - 2)
print(ways(60))
import math
print(math.sqrt(16), math.floor(3.7), math.ceil(3.2), math.gcd(12, 18), math.factorial(10), math.pi)
print(math.isqrt(17), math.comb(5, 2), math.inf > 10**100, math.log(8, 2), math.log10(1000))
`,
  algorithms: `
def binary_search(arr, target):
    lo, hi = 0, len(arr) - 1
    steps = 0
    while lo <= hi:
        steps += 1
        mid = (lo + hi) // 2
        if arr[mid] == target:
            return mid, steps
        elif arr[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1, steps
print(binary_search(list(range(0, 100, 3)), 42), binary_search([1, 2], 9))
def two_sum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target - n], i]
        seen[n] = i
    return []
print(two_sum([2, 7, 11, 15], 9), two_sum([3, 2, 4], 6))
def merge_sort(a):
    if len(a) <= 1:
        return a
    mid = len(a) // 2
    left, right = merge_sort(a[:mid]), merge_sort(a[mid:])
    out, i, j = [], 0, 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            out.append(left[i]); i += 1
        else:
            out.append(right[j]); j += 1
    return out + left[i:] + right[j:]
print(merge_sort([5, 2, 9, 1, 5, 6]))
def max_window(nums, k):
    best = cur = sum(nums[:k])
    for i in range(k, len(nums)):
        cur += nums[i] - nums[i - k]
        best = max(best, cur)
    return best
print(max_window([1, 4, 2, 10, 23, 3, 1, 0, 20], 4))
def is_palindrome(s):
    s = ''.join(c.lower() for c in s if c.isalnum())
    l, r = 0, len(s) - 1
    while l < r:
        if s[l] != s[r]:
            return False
        l += 1; r -= 1
    return True
print(is_palindrome('A man, a plan, a canal: Panama'), is_palindrome('race a car'))
from collections import deque
graph = {'A': ['B', 'C'], 'B': ['D'], 'C': ['D', 'E'], 'D': ['F'], 'E': ['F'], 'F': []}
def bfs(start):
    seen, order, q = {start}, [], deque([start])
    while q:
        node = q.popleft()
        order.append(node)
        for nb in graph[node]:
            if nb not in seen:
                seen.add(nb)
                q.append(nb)
    return order
print(bfs('A'))
def dfs(node, seen=None):
    seen = seen if seen is not None else []
    seen.append(node)
    for nb in graph[node]:
        if nb not in seen:
            dfs(nb, seen)
    return seen
print(dfs('A'))
def lcs(a, b):
    dp = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            dp[i][j] = dp[i-1][j-1] + 1 if a[i-1] == b[j-1] else max(dp[i-1][j], dp[i][j-1])
    return dp[-1][-1]
print(lcs('ABCBDAB', 'BDCABA'))
def valid_parens(s):
    pairs = {')': '(', ']': '[', '}': '{'}
    stack = []
    for ch in s:
        if ch in '([{':
            stack.append(ch)
        elif not stack or stack.pop() != pairs[ch]:
            return False
    return not stack
print(valid_parens('([]{})'), valid_parens('(]'))
`,
  trees: `
class TreeNode:
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
for v in [8, 3, 10, 1, 6, 14, 4]:
    root = insert(root, v)
def inorder(n):
    return inorder(n.left) + [n.val] + inorder(n.right) if n else []
def height(n):
    return 0 if not n else 1 + max(height(n.left), height(n.right))
print(inorder(root), height(root))
def level_order(root):
    out, level = [], [root]
    while level:
        out.append([n.val for n in level])
        level = [c for n in level for c in (n.left, n.right) if c]
    return out
print(level_order(root))
`,
  dataclass_typing: `
from dataclasses import dataclass, field
from typing import List, Optional
@dataclass
class Item:
    name: str
    price: float
    qty: int = 1
    def total(self) -> float:
        return self.price * self.qty
@dataclass
class Cart:
    items: List[Item] = field(default_factory=list)
    def add(self, item: Item) -> None:
        self.items.append(item)
cart = Cart()
cart.add(Item('pen', 1.5, 4))
cart.add(Item('book', 12.0))
print(cart.items[0], sum(i.total() for i in cart.items), Item('a', 1) == Item('a', 1))
def find(xs: List[int], t: int) -> Optional[int]:
    return xs.index(t) if t in xs else None
print(find([1, 2], 2), find([1], 5))
`,
  scope_mutation: `
def add_item(item, bucket=[]):
    bucket.append(item)
    return bucket
print(add_item(1), add_item(2))
def safer(item, bucket=None):
    if bucket is None:
        bucket = []
    bucket.append(item)
    return bucket
print(safer(1), safer(2))
def mutate(lst):
    lst.append('changed')
def rebind(lst):
    lst = ['new']
data = ['orig']
mutate(data)
rebind(data)
print(data)
t = (1, [2, 3])
t[1].append(4)
print(t)
s = 'abc'
s2 = s.upper()
print(s, s2)
a = 256
b = 256
print(a == b)
nums = [1, 2, 3]
for n in nums:
    n *= 10
print(nums)
for i in range(len(nums)):
    nums[i] *= 10
print(nums)
`,
  comprehension_tricks: `
matrix = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
print([row[::-1] for row in matrix])
print({x: x ** 2 for x in range(4)})
print(sorted({len(w) for w in ['a', 'bb', 'cc', 'ddd']}))
print([(i, j) for i in range(3) for j in range(i)])
print([w for w in 'the quick brown fox'.split() if len(w) > 3])
print(list(enumerate(['a', 'b'])), list(zip(range(3), 'abc')))
print(sum(x for x in range(101) if x % 2 == 0))
x = 'outer'
lst = [x for x in range(3)]
print(x, lst)
print(max(['apple', 'fig', 'banana'], key=len), min({'a': 3, 'b': 1}.items(), key=lambda kv: kv[1]))
print(list(reversed([1, 2, 3])), sorted('python'), ''.join(sorted('cba')))
`,
};

/** Programs that should raise an *uncaught* error; we compare the last traceback line. */
export const ERROR_CORPUS: Record<string, string> = {
  zero: `x = 1\ny = 0\nprint(x / y)`,
  name: `print(undefined_name)`,
  index: `a = [1, 2, 3]\nprint(a[3])`,
  key: `d = {'a': 1}\nprint(d['b'])`,
  type_concat: `print('age: ' + 30)`,
  attr: `x = 5\nx.append(3)`,
  call_args: `def f(a, b):\n    return a + b\nf(1)`,
  int_parse: `int('3.5')`,
  unpack: `a, b = 1, 2, 3`,
  not_iterable: `for x in 5:\n    pass`,
  unhashable: `d = {[1, 2]: 'x'}`,
  str_assign: `s = 'abc'\ns[0] = 'z'`,
  recursion: `def f(n):\n    return f(n + 1)\nf(0)`,
  custom: `class InsufficientFunds(Exception):\n    pass\nraise InsufficientFunds('balance too low')`,
};
