// NumPy programs checked against real numpy (python3) by numpy.test.ts.
// Transcendental results (exp, tanh, ...) are printed through arrays (8 significant
// digits) or rounded: NumPy's own SIMD exp/tanh are not correctly rounded, so their
// last bit is machine-specific. log / sqrt / random / sums are compared exactly.

export const NP_CORPUS: Record<string, string> = {
  construction: `
import numpy as np
a = np.array([1, 2, 3])
b = np.array([1, 2.5])
c = np.array([[1, 2], [3, 4]], dtype=float)
d = np.array([True, False, True])
print(a, a.dtype, b, b.dtype, c, c.dtype, d, d.dtype)
print(repr(a), repr(b), repr(c), repr(d))
print(np.array([1, 2], dtype=np.float64), np.array([1.7, -2.7], dtype=int), np.array([0, 3], dtype=bool))
print(np.asarray([[1, 2]]), np.array((1, 2, 3)), np.array([np.int64(3), 4]), np.array([np.float64(1), 2]))
print(np.zeros(3), np.zeros((2, 3)), np.ones((2, 2), dtype=int), np.full((2, 2), 7), np.full(3, 2.5), np.full((2,), True))
print(np.zeros_like(c), np.ones_like(a), np.full_like(b, 9), np.empty_like(a).shape, np.zeros_like(a, dtype=float))
print(np.eye(3), np.eye(2, 3), np.eye(3, k=1), np.identity(2), np.eye(2, dtype=int))
print(np.arange(5), np.arange(2, 10, 3), np.arange(0, 1, 0.25), np.arange(5.0), np.arange(10, 0, -2), np.arange(0.1, 0.5, 0.1))
print(repr(np.arange(3)), repr(np.arange(3.0)), np.arange(0), repr(np.arange(0)))
print(np.linspace(0, 1, 5), np.linspace(0, 10, 4, endpoint=False), np.linspace(-1, 1, 3), np.linspace(0, 1, 1), np.linspace(1, 2, 0))
print(np.linspace(0, 1, 11))
print(np.linspace(0, 9, 4, dtype=int), np.linspace(0, 1, 3, retstep=True))
print(np.pi, np.e, np.inf, -np.inf, np.nan, np.newaxis is None)
print(np.array(5), repr(np.array(5)), np.array(2.5), repr(np.array(2.5)), repr(np.array(True)), np.array(3).ndim, np.array(3).shape)
print(np.array([[1, 2, 3]]).shape, np.array([]).shape, np.array([[]]).shape, np.zeros((2, 0)).shape)
print(np.array([1, 2], ndmin=2), np.copy(a), np.array(a) is a, np.asarray(a) is a)
print(np.array([[1, 2], [3, 4]]).astype(float), np.array([1.9, -1.9, 0.5]).astype(int), np.array([0.0, 2.0]).astype(bool))
`,
  float_printing: `
import numpy as np
print(np.array([1.5, 2.0]), repr(np.array([1.5, 2.0])))
print(np.array([0.1, 0.25, 1/3]), np.array([1/3, 2/3, 1.0]))
print(np.array([1e-5, 1.0]), np.array([1e-4, 1.0]), np.array([0.0001, 0.1]), np.array([1e8, 1.0]), np.array([99999999.0, 1.0]))
print(np.array([1000.0, 1.0]), np.array([1001.0, 1.0]), np.array([1e3, 0.5]), np.array([123456.789]))
print(np.array([1e-10, 1e10]), np.array([1.5e-8, -2.25e-3, 3.0]), np.array([1e100, 1e-100]), np.array([-1e-5]))
print(np.array([np.nan, 1.0, np.inf]), np.array([-np.inf, 2.5]), np.array([np.nan]), np.array([np.inf, -np.inf]), np.array([np.nan, 1e-6]))
print(np.array([-0.0, 0.0, 1.0]), np.array([0.0]), np.array([-0.0]), np.array([0.0, 0.0]))
print(np.array([1.23456789012, 2.0]), np.array([123.456, -0.001]), np.array([1e16, 1]), np.array([0.5, 100.25, -3.0]))
print(np.array([3.14159265358979, 2.71828182845905, 1.41421356237310]))
print(np.array([0.1 + 0.2, 0.3]), np.array([1 - 1e-9, 1.0]), np.array([0.999999999, 1.0000000001]))
print(repr(np.array([1e-5, 1.0])), repr(np.array([np.nan, -1.5])), repr(np.array([-0.0])))
print(np.array([1e-300, 1e300]), np.array([5e-324, 1.0]), np.array([1.7976931348623157e308]))
print(np.array([2.0 ** -9, 1.0]), np.array([0.125, 0.375]), np.array([1.25e-3, 2.5e-3]))
print(np.array([[1.5, -2.25], [100.0, 0.001]]))
print(np.array([[1e-6, 1.0], [2.0, 3.0]]))
x = np.array([1.0, 2.0, 3.0]) / 7
print(x, x * 1e6, x * 1e-6, x * 1e9, -x)
`,
  int_bool_printing: `
import numpy as np
print(np.array([1, -2, 30]), np.array([[1, 200], [-3, 4]]), np.array([0, 0]), np.array([-5]))
print(repr(np.array([1, -2, 30])), repr(np.array([[1, 200], [-3, 4]])))
print(np.array([True, False]), np.array([True, True]), np.array([False]), np.array([[True], [False]]))
print(repr(np.array([True, True])), repr(np.array([[True, False]])))
print(np.array([10**12, 1]), np.array([-10**15, 7]), np.array([2**62]))
print(repr(np.array([], dtype=int)), repr(np.array([], dtype=bool)), repr(np.zeros((0, 3))), repr(np.zeros((2, 0), dtype=int)), str(np.array([])))
`,
  wrapping: `
import numpy as np
a = np.arange(30)
print(a)
print(repr(a))
print(np.arange(100))
print(repr(np.arange(100)))
b = np.linspace(0, 1, 12)
print(b)
print(repr(b))
print(np.arange(40) * 1.5)
print(repr(np.arange(40) * 1.5))
print(np.arange(24).reshape(2, 12) * 1000.5)
print(repr(np.arange(24).reshape(2, 12) * 1000.5))
print(np.arange(24).reshape(2, 3, 4))
print(repr(np.arange(24).reshape(2, 3, 4)))
print(np.arange(16).reshape(2, 2, 2, 2))
print(np.array([[True, False] * 10]))
print(repr(np.arange(12.0).reshape(3, 4) / 3))
print(np.arange(60).reshape(3, 20))
print(repr(np.arange(60).reshape(3, 20)))
print(np.ones((2, 3, 2)))
`,
  summarize: `
import numpy as np
a = np.arange(2000)
print(a)
print(repr(a))
print(np.arange(3000.0) / 7)
print(repr(np.arange(3000.0)))
b = np.arange(2000).reshape(40, 50)
print(b)
print(repr(b))
print(np.zeros((10, 10, 20)))
`,
  printoptions: `
import numpy as np
x = np.array([1/3, 2/3, 1e-7, 1.0])
print(x)
np.set_printoptions(precision=3)
print(x, np.array([1.23456, 7.0]))
np.set_printoptions(suppress=True)
print(x, np.array([1e-10, 5.0]), np.array([1e9, 1.5]))
np.set_printoptions(precision=8, suppress=False)
print(x)
np.set_printoptions(linewidth=40)
print(np.arange(30))
np.set_printoptions(linewidth=75, threshold=10)
print(np.arange(20), repr(np.arange(20)))
np.set_printoptions(threshold=1000, edgeitems=3)
print(np.get_printoptions()['precision'], np.get_printoptions()['suppress'])
with np.printoptions(precision=2):
    print(np.array([3.14159]))
print(np.array([3.14159]))
np.set_printoptions(precision=4, floatmode='fixed')
print(np.array([1.0, 2.5]))
np.set_printoptions(precision=8, floatmode='maxprec', sign='+')
print(np.array([1.0, -2.5]), np.array([3, -4]))
np.set_printoptions(sign='-')
print(np.array2string(np.array([1.0, 2.5]), separator=', '), np.format_float_positional(0.1 + 0.2), np.format_float_scientific(12345.678, precision=3))
print(np.format_float_positional(1.5, precision=3, trim='-'), np.format_float_positional(2.0, trim='0'))
`,
  scalars: `
import numpy as np
a = np.array([1.5, 2.5, 3.5])
i = np.array([1, 2, 3])
s = a.sum()
print(s, repr(s), type(s), repr(a[0]), repr(i[0]), repr(i.sum()), repr(a.mean()), repr(i.mean()))
print(repr(np.float64(3.0)), str(np.float64(3.0)), repr(np.int64(5)), str(np.int64(5)), repr(np.True_), str(np.False_), repr(np.bool_(1)))
print(repr(np.float64(1e-5)), repr(np.float64(1e16)), repr(np.float64(0.1 + 0.2)), repr(np.float64(np.nan)), repr(np.float64(-np.inf)), repr(np.float64(-0.0)))
x = np.float64(2.5)
n = np.int64(7)
print(repr(x + 1), repr(x * 2), repr(1 + x), repr(n + 1), repr(n / 2), repr(n // 2), repr(n % 3), repr(n * 1.5), repr(-n), repr(abs(np.int64(-3))))
print(repr(x ** 2), repr(2 ** n), repr(n ** 2), repr(x > 2), repr(n == 7), x < 3, n != 7)
print(float(x), int(x), int(n), float(n), round(x), round(np.float64(3.5)), round(np.float64(2.567), 2), repr(round(np.float64(2.567), 2)), round(n))
print(f"{x:.3f} {x} {n:5d} {n} {x:>8.2f}|{x:e} {np.float64(1/3):.4}", "%.2f %d %s" % (x, n, x))
print(x.item(), type(x.item()), n.item(), type(n.item()), np.True_.item(), x.dtype, n.dtype, x.shape, x.ndim)
print(isinstance(x, float), isinstance(n, int), isinstance(x, np.floating), isinstance(n, np.integer), isinstance(x, np.number), isinstance(np.True_, np.bool_))
print(type(n), type(np.True_), np.float64, np.int64, np.bool_, type(a.max()), type(i.argmax()))
print([np.float64(1.5), np.int64(2)], {np.int64(1): 'a'}[1], {1: 'b'}[np.int64(1)], [10, 20, 30][np.int64(1)], list(range(np.int64(3))))
print(sorted([np.float64(2), np.float64(1)]), max(np.int64(3), 2), min(i), max(a), sum(i), sum(a))
print(np.float64(5) / 0, -np.float64(5) / 0, np.float64(0) / 0, np.int64(5) // 0 if False else 'skip')
print(repr(np.True_ + np.True_), repr(np.True_ & np.False_), repr(~np.True_), repr(np.True_ * 3), repr(np.float64(2) * np.int64(3)))
print(np.float64(1) == 1.0, np.int64(1) in [1, 2], np.float64(0.5).is_integer(), np.float64(2).is_integer(), hash(np.float64(1.0)) == hash(1.0))
print(bool(np.float64(0)), bool(np.int64(3)), bool(np.array([0])), bool(np.array([2.0])), not np.False_)
print(repr(np.float64('1.5')), repr(np.int64(3.9)), repr(np.float64(2)), repr(np.bool_(0)), np.int64(5) * [1], [0] * np.int64(2))
`,
  dtype_promotion: `
import numpy as np
i = np.array([1, 2, 3])
f = np.array([1.0, 2.0, 3.0])
b = np.array([True, False, True])
for r in [i + f, i + 1, i + 1.5, i / 2, i // 2, i % 2, i * True, b + b, b * b, b + 1, b + 1.0, i > 1, f == 2, i ** 2, i ** 0.5, f // 2, f % 2, -i, -f]:
    print(repr(r), r.dtype)
print(b.sum(), repr(b.sum()), repr(i.sum()), repr(f.sum()), repr(i.mean()), repr(b.mean()), repr(i.prod()), repr(b.any()), repr(b.all()))
print(i.dtype == np.int64, f.dtype == np.float64, f.dtype == float, i.dtype == int, b.dtype == bool, f.dtype == 'float64', i.dtype != f.dtype, f.dtype.name, i.dtype.kind, b.dtype.itemsize)
print(repr(f.dtype), str(i.dtype), f.astype(int).dtype, i.astype(float).dtype, i.astype(bool), np.dtype('float64'), np.dtype(int) == np.int64)
print(np.array([1, 2]) + np.array([0.5]), np.array([1, 2]) * 2.0, np.array([5, 7]) / np.array([2, 2]))
print(repr(np.array([-7, 7]) // 2), repr(np.array([-7, 7]) % 3), repr(np.array([-7.5, 7.5]) // 2), repr(np.array([-7.5, 7.5]) % 2), repr(np.array([5, -5]) % -3))
print(repr(np.array([1, 0]) // 0 if False else 0), np.array([1.0, -1.0, 0.0]) / 0)
print(repr(np.sum(b)), repr(np.cumsum(b)), repr(np.array([True, True]).sum(axis=0)), repr(np.maximum(i, 2.5)), repr(np.where(b, i, 0.5)))
print(repr(np.array([1, 2]) & np.array([3, 1])), repr(np.array([1, 2]) | 4), repr(np.array([5]) ^ 1), repr(~np.array([0, 5])), repr(b & ~b), repr(b | ~b), repr(b ^ True), repr(np.array([1, 2]) << 2), repr(np.array([8]) >> 1))
`,
  attributes_methods: `
import numpy as np
a = np.arange(12).reshape(3, 4)
print(a.shape, a.ndim, a.size, a.dtype, a.itemsize, a.nbytes, a.T.shape, len(a))
print(a.reshape(4, 3), a.reshape(-1), a.reshape(2, -1), a.reshape((6, 2)), a.reshape(-1, 1).shape)
print(a.flatten(), a.ravel(), a.T, a.transpose(), a.transpose(1, 0), a.copy(), a.astype(float))
print(a.tolist(), np.array([1.5, 2]).tolist(), np.array([True]).tolist(), a[0].tolist(), np.array(5).tolist(), a.item(5), np.array([7]).item(), a.item(1, 2))
print(a.sum(), a.sum(axis=0), a.sum(axis=1), a.sum(axis=-1), a.sum(axis=(0, 1)), a.sum(axis=0, keepdims=True), a.sum(axis=1, keepdims=True), a.sum(keepdims=True))
print(a.mean(), a.mean(axis=0), a.mean(axis=1), a.max(), a.max(axis=0), a.min(axis=1), a.argmax(), a.argmax(axis=0), a.argmin(axis=1), a.argmax(axis=1, keepdims=True))
print(a.std(), a.std(axis=0), a.var(), a.var(axis=1), a.var(ddof=1), a.std(axis=0, ddof=1), a.prod(axis=1), a.cumsum(), a.cumsum(axis=0), a.cumsum(axis=1), a.cumprod(axis=1))
print(a.max(axis=(0, 1)), a.min(axis=(0,)), a.mean(axis=(0, 1)), a.mean(axis=0, keepdims=True))
b = np.array([[0, 1], [2, 0]])
print(b.all(), b.any(), b.all(axis=0), b.any(axis=1), (a > 5).any(), (a >= 0).all(), np.array([]).all(), np.array([]).any())
c = np.array([1.2345, -2.5, 3.5, 0.5, 1.5, 2.5])
print(c.round(), c.round(2), c.round(1), np.round(c, 1), np.around(c), np.round(1234.5, -2), np.round(np.array([15, 25, 1234]), -1), c.clip(-1, 1), c.clip(0, None), c.clip(None, 2), np.clip(c, 0, 1.5))
print(a.dot(np.ones(4)), a[0].dot(a[1]), np.ones((1, 3)).squeeze(), np.ones((2, 1, 3)).squeeze().shape, np.ones((2, 1, 3)).squeeze(axis=1).shape, np.ones((1, 1)).squeeze())
s = np.array([3, 1, 2, 5, 4])
s2 = s.copy()
s2.sort()
print(s2, s, s.argsort(), np.sort(s), np.argsort(-s), np.sort(np.array([[3, 1], [1, 2]]), axis=0), np.sort(np.array([[3, 1], [1, 2]])), np.sort(np.array([2.0, np.nan, 1.0])))
m = np.array([[3, 1, 2], [9, 7, 8]])
m.sort(axis=1)
print(m, m.swapaxes(0, 1), np.ones((2, 3, 4)).transpose(2, 0, 1).shape, np.ones((2, 3, 4)).transpose((1, 2, 0)).shape)
z = np.zeros(3)
z.fill(4)
print(z, a.diagonal(), a.trace(), a.nonzero(), np.array([[1, 2], [3, 4]]).T.copy(), a.take([0, 2]), a.repeat(2)[:6], np.array([1, 2]).repeat(3))
`,
  reductions_order: `
import numpy as np
np.random.seed(1)
X = np.random.randn(37, 23)
print(repr(X.sum()), repr(X.mean()), repr(X.std()), repr(X.var()))
print(repr(X.sum(axis=0)[:3].tolist()), repr(X.sum(axis=1)[:3].tolist()), repr(X.mean(axis=0)[:3].tolist()), repr(X.std(axis=1)[:3].tolist()))
print(repr(X.T.sum()), repr(X.T.sum(axis=0)[:3].tolist()), repr(X.T.sum(axis=1)[:3].tolist()), repr(X[:, ::2].sum()), repr(X[::3].mean(axis=1)[:2].tolist()))
Y = np.random.rand(4, 50, 30)
print(repr(Y.sum()), repr(Y.sum(axis=(1, 2))[0]), repr(Y.sum(axis=(0, 1))[0]), repr(Y.mean(axis=2)[0, :2].tolist()), repr(Y.var(axis=0)[0, :2].tolist()))
v = np.random.randn(1000)
print(repr(v.sum()), repr(np.mean(v)), repr(np.std(v)), repr(v.prod()), repr(v.cumsum()[-1]), repr(np.sum(v ** 2)), repr(np.sqrt(np.sum(v * v))))
print(repr(np.linalg.norm(v[:10])), repr(v[:10] @ v[10:20]), repr(np.dot(v[:5], v[5:10])))
I = np.random.randint(0, 100, (30, 40))
print(repr(I.mean()), repr(I.std()), repr(I.sum(axis=0)[:5].tolist()), repr(I.mean(axis=1)[:3].tolist()), repr(np.median(I)), repr(np.percentile(I, 25)))
`,
  indexing_basic: `
import numpy as np
a = np.arange(10)
print(a[0], a[-1], a[2:5], a[::2], a[::-1], a[-3:], a[:100], a[5:2], a[8:2:-2], a[np.int64(3)])
M = np.arange(20).reshape(4, 5)
print(M[0], M[-1], M[1, 2], M[1][2], M[:, 0], M[:, -1], M[1:3], M[1:3, 2:4], M[::2, ::2], M[::-1], M[:, ::-1], M[-1, -1])
print(M[..., 0], M[0, ...], M[None].shape, M[:, None].shape, M[:, :, None].shape, M[np.newaxis, :, np.newaxis].shape, M[..., None].shape)
T = np.arange(24).reshape(2, 3, 4)
print(T[0, 1], T[:, 1, :], T[..., 2], T[1, ..., 1], T[:, :, ::3], T[-1, -1, -1], T[0][1][2])
print(M[1, :].shape, M[1:2, :].shape, M[:, 1].shape, M[:, 1:2].shape)
`,
  indexing_fancy: `
import numpy as np
a = np.arange(10) * 10
print(a[[0, 2, 4]], a[np.array([1, 1, 3])], a[[-1, -2]], a[a > 50], a[(a > 20) & (a < 70)], a[~(a > 50)], a[[True, False] * 5])
M = np.arange(20).reshape(4, 5)
print(M[[0, 2]], M[:, [1, 3]], M[[0, 1], [2, 3]], M[np.arange(4), [0, 1, 2, 3]], M[[1, 2], 1:3], M[M % 2 == 0], M[M[:, 0] > 5], M[[True, False, True, False]])
print(M[[[0], [1]], [2, 3]], M[1, [0, 4]], M[[0, 1], 1], M[np.array([[0, 1], [2, 3]])].shape)
T = np.arange(24).reshape(2, 3, 4)
print(T[[0, 1], :, [1, 2]].shape, T[:, [0, 2], :].shape, T[0, :, [1, 3]].shape, T[:, [1, 2], [0, 3]].shape, T[[1], [2], [3]])
idx = np.argsort(np.array([3, 1, 2]))
print(np.array([30, 10, 20])[idx], np.array(['skip'] if False else [1, 2, 3])[[]], a[[]].shape)
probs = np.array([[0.1, 0.7, 0.2], [0.3, 0.3, 0.4]])
y = np.array([1, 2])
print(probs[np.arange(2), y], probs[range(2), y] if False else 0, -np.log(probs[np.arange(len(y)), y]))
`,
  views_and_setitem: `
import numpy as np
a = np.arange(10)
b = a[2:5]
b[0] = 100
print(a, b)
c = a[::2]
c *= 2
print(a)
M = np.zeros((3, 4))
M[0] = 1
M[:, 1] += 5
M[1, 2:] = [7, 8]
M[2, ::2] = -1
print(M)
row = M[1]
row[:] = 9
print(M)
x = np.array([-2, -1, 0, 1, 2])
x[x < 0] = 0
print(x)
x[[0, 4]] = 42
print(x)
x[np.array([1, 2])] += 1
print(x)
x[1:3] = np.array([5.9, 6.1])
print(x, x.dtype)
f = np.arange(6.0).reshape(2, 3)
t = f.T
t[0, 1] = 99
print(f)
r = f.reshape(3, 2)
r[0, 0] = -1
print(f)
fl = f.flatten()
fl[0] = 1000
print(f[0, 0])
rv = f.ravel()
rv[1] = 555
print(f)
G = np.zeros((3, 3))
G[np.arange(3), np.arange(3)] = 1
G[[0, 1], [2, 2]] = 5
print(G)
H = np.zeros((2, 3))
H[:] = [1, 2, 3]
H[...] = H * 2
H[0, :] = np.array([[7, 7, 7]])
print(H)
E = np.ones((2, 2, 2))
E[:, 0, :] = 0
E[1] = 3
print(E)
s = np.arange(5.0)
s[2] = np.nan
s[3] = np.inf
print(s, np.isnan(s), np.isinf(s), np.isfinite(s))
cnt = np.zeros(3, dtype=int)
cnt[[0, 0, 1]] += 1
print(cnt)
w = np.array([1.5, 2.5])
w -= 0.5
w /= 2
w **= 2
print(w)
q = np.arange(4)
q += 1
q *= 3
q //= 2
q %= 4
print(q)
A = np.ones((2, 2))
B = A
B += 1
print(A, A is B)
`,
  iteration: `
import numpy as np
M = np.arange(6).reshape(3, 2)
for row in M:
    print(row, type(row))
for x in np.array([1.5, 2.5]):
    print(x, repr(x))
for i, (p, q) in enumerate(M):
    print(i, p, q, repr(p))
print(list(np.arange(3)), [float(v) for v in np.array([0.5, 1.5])], len(M), len(M[0]), tuple(np.array([1, 2])))
a, b = np.array([10, 20])
print(a, b, repr(a))
for z in zip(np.array([1, 2]), np.array([3.5, 4.5])):
    print(z)
print(sum(np.array([[1, 2], [3, 4]])), [r.sum() for r in M], dict(zip(['a', 'b'], np.array([1, 2]))))
print(3 in np.array([1, 2, 3]), 5 in np.array([1, 2, 3]), np.array([1, 2]) in [np.array([0])] if False else 'ok')
for v in np.arange(4).reshape(2, 2).flat:
    print(v, end=' ')
print()
`,
  broadcasting: `
import numpy as np
a = np.arange(3)
B = np.arange(6).reshape(2, 3)
print(a + B, B * a, B - a[:, None] if False else B - np.array([[1], [2]]), a[:, None] * a[None, :], a[:, None] + a)
print(np.ones((2, 1, 3)) + np.arange(4).reshape(4, 1), (np.ones((2, 1, 3)) + np.arange(4).reshape(4, 1)).shape)
print(B / B.sum(axis=1, keepdims=True), B - B.mean(axis=0), (B - B.mean(axis=1, keepdims=True)) / B.std(axis=1, keepdims=True))
print(B > a, B == a, a != 1, B >= 2, 2 < B, np.array([1, 2]) == np.array([1, 3]), B == 3, B != B)
print(a + [10, 20, 30], [1, 2, 3] * a, (1, 2, 3) - a, a ** a, 2 ** a, a ** 2.0, 10 / (a + 1), 7 // (a + 1), 7 % (a + 1))
print(-B, +B, abs(-B), abs(np.array([-1.5, 2])), np.abs(np.array([-3, 3])), ~(B > 2), (B > 1) & (B < 5), (B < 1) | (B > 4), (B > 1) ^ (B > 3))
x = np.array([1.0, 2.0])
print(x == None, x != None, (x == 'a') if False else 0, np.array([1, 2]) * np.array([[1], [2], [3]]))
`,
  ufuncs: `
import numpy as np
x = np.array([0.5, 1.0, 2.0, 4.0])
print(np.log(x), np.log2(x), np.log10(x), np.log1p(x), np.sqrt(x), np.square(x), np.exp(x), np.expm1(x * 0.01))
print(repr(np.log(2.0)), repr(np.log(10.0)), repr(np.sqrt(2.0)), repr(np.log2(8.0)), repr(np.log10(1000.0)), repr(np.log1p(1e-10)))
t = np.array([-2.0, -0.5, 0.0, 0.5, 2.0])
print(np.tanh(t), np.sin(t), np.cos(t), np.tan(t), np.arctan(t), np.sinh(t), np.cosh(t), np.arcsin(t / 2), np.arccos(t / 2))
print(np.sign(t), np.sign(np.array([-3, 0, 3])), np.abs(t), np.absolute(t), np.floor(t * 1.5), np.ceil(t * 1.5), np.trunc(t * 1.5), np.rint(t * 1.5), np.floor(np.array([1, 2])))
print(np.power(2, np.arange(5)), np.power(np.array([2.0, 3.0]), 2), np.power(np.array([4.0, 9.0]), 0.5), np.maximum(t, 0), np.minimum(t, 0), np.maximum(np.array([1, np.nan]), 0), np.fmax(np.array([1, np.nan]), 0))
print(np.arctan2(np.array([1.0, -1.0]), np.array([1.0, 1.0])), np.hypot(3.0, 4.0), np.degrees(np.pi), np.radians(180.0), np.deg2rad(90.0))
print(np.add(1, 2), np.subtract(np.array([5, 6]), 1), np.multiply(2.0, np.array([1, 2])), np.divide(1, 4), np.true_divide(3, 2), np.floor_divide(7, 2), np.mod(7, 3), np.remainder(-7, 3), np.negative(np.array([1, -1])), np.reciprocal(np.array([2.0, 4.0])))
print(np.equal(1, 1), np.not_equal(np.array([1, 2]), 1), np.less(1, 2), np.greater_equal(np.array([1, 2]), 2), np.logical_and(True, np.array([True, False])), np.logical_or(False, np.array([True, False])), np.logical_not(np.array([True, False])), np.logical_xor(True, True))
print(np.exp(np.array([1000.0])), np.log(np.array([0.0, -1.0])), np.sqrt(np.array([-1.0])), np.array([1.0]) / 0)
print(np.isnan(np.nan), np.isinf(np.inf), np.isfinite(1.0), np.isnan(np.array([1, 2])), np.signbit(np.array([-0.0, 1.0])))
`,
  functions_shape: `
import numpy as np
a = np.array([[1, 2], [3, 4]])
b = np.array([[5, 6]])
print(np.concatenate([a, b]), np.concatenate([a, b.T], axis=1), np.concatenate([np.array([1, 2]), np.array([3])]), np.concatenate([a, a], axis=None), np.concatenate((a, a), axis=-1))
print(np.stack([np.array([1, 2]), np.array([3, 4])]), np.stack([np.array([1, 2]), np.array([3, 4])], axis=1), np.stack([a, a], axis=2).shape, np.stack([a, a], axis=-1).shape)
print(np.vstack([np.array([1, 2]), np.array([3, 4])]), np.vstack([a, b]), np.hstack([np.array([1, 2]), np.array([3])]), np.hstack([a, a]), np.column_stack([np.array([1, 2]), np.array([3, 4])]), np.column_stack([a, np.array([9, 9])]))
print(np.transpose(a), np.transpose(np.ones((2, 3, 4)), (1, 0, 2)).shape, np.swapaxes(np.ones((2, 3, 4)), 0, 2).shape, np.moveaxis(np.ones((2, 3, 4)), 0, -1).shape, np.reshape(a, (4,)), np.reshape(a, -1), np.ravel(a), np.expand_dims(np.array([1, 2]), 0).shape, np.expand_dims(np.array([1, 2]), axis=1).shape, np.squeeze(np.ones((1, 2, 1))).shape)
print(np.triu(np.ones((3, 3))), np.tril(np.ones((3, 3)), k=-1), np.triu(np.arange(9).reshape(3, 3), k=1), np.tril(np.arange(12).reshape(3, 4), 1))
print(np.diag(np.array([1, 2, 3])), np.diag(a), np.diag(np.arange(9).reshape(3, 3), k=1), np.diag(np.array([1, 2]), k=-1), np.trace(a), np.trace(np.eye(4)), np.diagonal(np.arange(9).reshape(3, 3)))
print(np.where(a > 2, a, -1), np.where(a > 2), np.where(np.array([True, False]), 1.5, 0), np.where(a % 2 == 0, 'skip', 0) if False else 0, np.nonzero(np.array([0, 3, 0, 4])), np.argwhere(a > 1), np.count_nonzero(a > 1), np.count_nonzero(np.array([[0, 1], [1, 1]]), axis=0), np.flatnonzero(np.array([0, 1, 0, 2])))
print(np.unique(np.array([3, 1, 2, 3, 1])), np.unique(np.array([[1, 2], [2, 3]])), np.unique(np.array([2, 1, 2]), return_counts=True), np.unique(np.array([5, 4, 5]), return_index=True, return_inverse=True), np.unique(np.array([1.5, np.nan, 1.5, np.nan])))
print(np.sort(np.array([[3, 2, 1], [6, 5, 4]]), axis=None), np.argsort(np.array([[3, 1, 2], [1, 3, 2]]), axis=1), np.argsort(np.array([3, 1, 2]), axis=0), np.argmax(np.array([1, 5, 2])), np.argmin(np.array([[4, 2], [1, 3]]), axis=0), np.argmax(np.array([[1, 9], [8, 2]])))
print(np.allclose(np.array([1.0, 2.0]), np.array([1.0, 2.0 + 1e-9])), np.allclose(1.0, 1.1), np.isclose(np.array([1.0, np.nan]), np.array([1.0 + 1e-6, np.nan])), np.isclose(np.nan, np.nan, equal_nan=True), np.array_equal(a, a.copy()), np.array_equal(a, b), np.array_equal(np.array([1, 2]), np.array([1.0, 2.0])))
print(np.flip(np.array([1, 2, 3])), np.flip(a, axis=0), np.fliplr(a), np.flipud(a), np.roll(np.arange(5), 2), np.roll(a, 1, axis=1), np.tile(np.array([1, 2]), 3), np.tile(np.array([1, 2]), (2, 2)), np.repeat(np.array([1, 2]), 2), np.repeat(a, 2, axis=0), np.repeat(np.array([1, 2]), [1, 3]))
print(np.append(np.array([1, 2]), 3), np.append(a, [[7, 8]], axis=0), np.diff(np.array([1, 4, 9, 16])), np.diff(np.array([1, 4, 9, 16]), n=2), np.diff(a, axis=0), np.cumsum(np.array([1, 2, 3])), np.cumprod(np.array([1, 2, 3, 4])), np.cumsum(a, axis=1))
print(np.median(np.array([3, 1, 2])), np.median(np.array([4, 1, 2, 3])), np.median(a, axis=0), np.percentile(np.arange(10), 50), np.percentile(np.arange(11), [10, 90]), np.quantile(np.array([1.0, 2.0, 4.0]), 0.5), np.average(np.array([1, 2, 3]), weights=np.array([3, 1, 1])), np.average(a, axis=0))
X, Y = np.meshgrid(np.array([1, 2, 3]), np.array([10, 20]))
print(X, Y, np.meshgrid(np.arange(2), np.arange(3), indexing='ij')[0], np.bincount(np.array([0, 1, 1, 3])), np.bincount(np.array([1, 1]), minlength=4), np.searchsorted(np.array([1, 3, 5]), 4), np.searchsorted(np.array([1, 3, 5]), np.array([0, 3, 6]), side='right'))
print(np.split(np.arange(6), 3), np.array_split(np.arange(7), 3), np.split(np.arange(6), [2, 5]), np.atleast_2d(np.array([1, 2])), np.atleast_1d(5), np.ndim(a), np.shape(a), np.size(a), np.isscalar(3.0), np.isscalar(a))
print(np.sum(a), np.sum(a, axis=0), np.mean(a, axis=1), np.max(a), np.amax(a, axis=0), np.min(a), np.amin(a, axis=1), np.prod(a), np.std(np.array([1, 2, 3, 4])), np.var(np.array([1, 2, 3, 4]), ddof=1), np.ptp(np.array([3, 9, 1])))
print(np.cov(np.array([[1, 2, 3], [2, 4, 7]])), np.corrcoef(np.array([1, 2, 3]), np.array([2, 4, 7])), np.cov(np.array([1.0, 2.0, 4.0])), np.interp(2.5, np.array([1, 2, 3]), np.array([10, 20, 40])), np.nan_to_num(np.array([np.nan, np.inf, 1.0])))
`,
  dot_matmul: `
import numpy as np
A = np.array([[1, 2], [3, 4]])
B = np.array([[5, 6], [7, 8]])
v = np.array([1, 2])
print(A @ B, A.dot(B), np.dot(A, B), np.matmul(A, B), A @ v, v @ A, v @ v, np.dot(v, v), repr(v @ v), np.dot(3, 4), np.dot(A, 2))
print(np.outer(v, np.array([1, 2, 3])), np.inner(v, v), np.inner(A, B), np.vdot(A, B), np.tensordot(A, B, axes=1))
X = np.arange(24.0).reshape(2, 3, 4)
W = np.arange(20.0).reshape(4, 5)
print((X @ W).shape, X @ W, np.dot(X, W).shape, (X @ X.transpose(0, 2, 1)).shape, X @ np.ones(4), np.ones(3) @ X)
Q = np.arange(2 * 2 * 3 * 4, dtype=float).reshape(2, 2, 3, 4)
print((Q @ Q.swapaxes(-1, -2)).shape, Q @ Q.swapaxes(-1, -2), (np.ones((1, 3, 4)) @ np.ones((5, 4, 2))).shape)
print(np.einsum('ij,jk->ik', A, B), np.einsum('i,i->', v, v), np.einsum('ij->ji', A), np.einsum('ii->', A), np.einsum('ij,ij->ij', A, B), np.einsum('bij,bjk->bik', X, X.transpose(0, 2, 1)).shape, np.einsum('i,j->ij', v, v), np.einsum('ij->', A), np.einsum('ij,j', A, v))
q = np.arange(2 * 3 * 4 * 5.0).reshape(2, 3, 4, 5)
print(np.einsum('bhqd,bhkd->bhqk', q, q).shape, np.allclose(np.einsum('bhqd,bhkd->bhqk', q, q), q @ q.transpose(0, 1, 3, 2)))
R = np.array([[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]])
S = np.array([[0.7, 0.8], [0.9, 1.0], [1.1, 1.2]])
print(R @ S, repr((R @ S)[0, 0]), repr((R @ S)[1, 1]), repr(R[0] @ S[:, 0]), (np.array([True, False]) @ np.array([True, True])))
np.random.seed(3)
P = np.random.randn(5, 7)
Z = np.random.randn(7, 3)
print([repr(float(t)) for t in (P @ Z).ravel()])
print([repr(float(t)) for t in (P @ Z[:, 0])])
`,
  errors: `
import numpy as np
def show(f):
    try:
        r = f()
        print('ok', r)
    except Exception as e:
        print(type(e).__name__, e)
show(lambda: np.ones(3) + np.ones(4))
show(lambda: np.ones((2, 3)) + np.ones((3, 2)))
show(lambda: np.ones((2, 3)) @ np.ones((2, 3)))
show(lambda: np.ones(3) @ np.ones(4))
show(lambda: np.dot(np.ones((2, 3)), np.ones((2, 3))))
show(lambda: np.dot(np.ones(3), np.ones(4)))
show(lambda: np.arange(6).reshape(4))
show(lambda: np.arange(6).reshape(4, -1))
show(lambda: np.arange(6).reshape(-1, -1))
show(lambda: np.arange(3)[5])
show(lambda: np.arange(3)[-4])
show(lambda: np.zeros((2, 3))[1, 3])
show(lambda: np.zeros((2, 3))[0, 0, 0])
show(lambda: np.arange(3)[[0, 5]])
show(lambda: np.arange(3)[1.5])
show(lambda: np.arange(3)[np.array([1.0])])
show(lambda: np.arange(3)[np.array([True, False])])
show(lambda: np.linalg.inv(np.array([[1.0, 2.0], [2.0, 4.0]])))
show(lambda: np.linalg.solve(np.zeros((2, 2)), np.ones(2)))
show(lambda: np.linalg.inv(np.ones((2, 3))))
show(lambda: np.linalg.inv(np.ones(3)))
show(lambda: bool(np.array([1, 2])))
show(lambda: bool(np.array([])))
show(lambda: np.array([1, 2]) and True)
show(lambda: np.ones((2, 3)).sum(axis=2))
show(lambda: np.ones((2, 3)).mean(axis=-3))
show(lambda: np.max(np.array([])))
show(lambda: np.array([1, 2]) ** -1)
show(lambda: np.concatenate([np.ones((2, 3)), np.ones((2, 2))]))
show(lambda: np.stack([np.ones(2), np.ones(3)]))
show(lambda: np.array([[1, 2], [3]]))
show(lambda: np.ones(3).foo)
show(lambda: np.foo)
show(lambda: float(np.array([1.0, 2.0])))
show(lambda: len(np.array(3)))
show(lambda: np.array([True]) - np.array([True]))
show(lambda: -np.array([True]))
show(lambda: np.array([1.5]) & np.array([1]))
show(lambda: np.where(np.ones(2) > 0, np.ones(3), np.ones(2)))
show(lambda: np.random.choice(3, 5, replace=False))
show(lambda: np.random.randint(5, 2))
show(lambda: np.zeros((2, 2))[np.array([0, 1]), np.array([0, 1, 1])])
show(lambda: np.squeeze(np.ones((2, 3)), axis=0))
show(lambda: {np.array([1]): 1})
show(lambda: np.ones(2) @ 3)
show(lambda: np.eye(2).T.shape.foo)
def iadd():
    a = np.arange(3)
    a += 1.5
show(iadd)
def setbad():
    a = np.zeros(3)
    a[:2] = np.ones(3)
show(setbad)
def iaddb():
    a = np.zeros(3)
    a += np.ones((2, 3))
show(iaddb)
try:
    np.linalg.inv(np.zeros((3, 3)))
except np.linalg.LinAlgError as e:
    print('caught', type(e).__name__, e, isinstance(e, ValueError))
show(lambda: np.random.default_rng(0) if False else 'skip')
`,
  random_legacy: `
import numpy as np
np.random.seed(0)
print(np.random.rand(3))
print(np.random.rand(2, 3))
print(repr(np.random.rand()))
print(np.random.randn(4))
print(repr(np.random.randn()))
print(np.random.randint(0, 10, size=8), np.random.randint(5, size=(2, 3)), repr(np.random.randint(100)))
print(np.random.normal(0, 1, 3), np.random.normal(loc=5.0, scale=0.1, size=(2, 2)), repr(np.random.normal()))
print(np.random.uniform(-1, 1, 4), np.random.uniform(size=2), repr(np.random.uniform(2, 3)))
print(np.random.random(3), np.random.random((1, 2)), np.random.random_sample(2), repr(np.random.random()))
print(np.random.choice(5), np.random.choice(5, 3), np.random.choice([10, 20, 30], size=4), np.random.choice(10, 4, replace=False), np.random.choice(4, 6, p=[0.1, 0.2, 0.3, 0.4]))
print(np.random.choice(6, 3, replace=False, p=[0.1, 0.1, 0.1, 0.1, 0.1, 0.5]), repr(np.random.choice([1.5, 2.5])))
print(np.random.permutation(8), np.random.permutation([1, 2, 3, 4]), np.random.permutation(np.arange(6).reshape(3, 2)))
x = np.arange(8)
np.random.shuffle(x)
print(x)
m = np.arange(6).reshape(3, 2)
np.random.shuffle(m)
print(m)
l = list(range(6))
np.random.shuffle(l)
print(l)
np.random.seed(42)
w = np.random.randn(3, 2) * 0.01
print(w)
np.random.seed(2**32 - 1)
print(np.random.rand(2), np.random.randint(0, 2**33, 3), np.random.randint(-5, 5, 6))
np.random.seed(7)
print([repr(float(v)) for v in np.random.randn(25)])
print(np.random.normal(np.array([0.0, 10.0, 100.0]), np.array([1.0, 2.0, 3.0])), np.random.normal(np.zeros((2, 1)), 1.0, size=(2, 3)).shape)
rs = np.random.RandomState(123)
print(rs.rand(2), rs.randn(2), rs.randint(0, 5, 3), rs.choice(4, 2, replace=False), rs.normal(0, 1, 2), rs.permutation(4))
rs2 = np.random.RandomState(123)
print(rs2.rand(2))
np.random.seed(1)
print(np.random.exponential(1.5, 3), np.random.standard_normal(3), np.random.standard_exponential(2))
`,
  linalg: `
import numpy as np
A = np.array([[4.0, 1.0, 2.0], [1.0, 3.0, 0.5], [2.0, 0.5, 5.0]])
b = np.array([1.0, 2.0, 3.0])
print(repr(np.linalg.det(np.array([[1.0, 2.0], [3.0, 4.0]]))), repr(np.linalg.det(A)), np.linalg.det(np.eye(3)), np.linalg.det(np.array([[1.0, 2.0], [2.0, 4.0]])))
Ai = np.linalg.inv(A)
print(np.round(Ai, 6), np.allclose(A @ Ai, np.eye(3)), np.round(np.linalg.inv(np.array([[1, 2], [3, 4]])), 10))
x = np.linalg.solve(A, b)
print(np.round(x, 8), np.allclose(A @ x, b), np.round(np.linalg.solve(A, np.eye(3)), 6))
w, V = np.linalg.eigh(A)
print(np.round(w, 8), np.allclose(A @ V, V * w), np.allclose(V.T @ V, np.eye(3)), np.round(np.abs(V), 6))
print(np.round(np.linalg.eigvalsh(np.array([[2.0, 1.0], [1.0, 2.0]])), 10))
M = np.array([[4.0, 1.0, 0.0], [2.0, 3.0, 0.0], [1.0, 0.5, 1.0]])
we, Ve = np.linalg.eig(M)
order = np.argsort(we.real)
print(np.round(we[order], 8), we.dtype, np.allclose(M @ Ve, Ve * we), np.round(np.abs(Ve[:, order]), 6), np.round(we.real[order], 6))
ev = np.sort(np.linalg.eigvals(np.array([[1.0, 2.0], [2.0, 1.0]])))
print(np.round(ev, 10), np.round(ev.real, 10), ev.imag, repr(np.round(ev, 6)), np.round(ev, 6)[0], repr(np.complex128(0.5)), np.array([1.5 + 0j, -2 + 0j]) if False else 0)
X = np.array([[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]])
U, S, Vt = np.linalg.svd(X)
print(U.shape, S.shape, Vt.shape, np.round(S, 8), np.allclose(U[:, :2] * S @ Vt, X), np.allclose(U.T @ U, np.eye(3)))
U2, S2, Vt2 = np.linalg.svd(X, full_matrices=False)
print(U2.shape, Vt2.shape, np.allclose((U2 * S2) @ Vt2, X), np.round(np.abs(Vt2), 8), np.round(np.linalg.svd(X.T, compute_uv=False), 8))
U3, S3, Vt3 = np.linalg.svd(X.T)
print(U3.shape, S3.shape, Vt3.shape, np.allclose(U3 @ np.diag(S3) @ Vt3[:2], X.T))
Q, R = np.linalg.qr(X)
print(Q.shape, R.shape, np.round(Q, 8), np.round(R, 8), np.allclose(Q @ R, X))
Qc, Rc = np.linalg.qr(X, mode='complete')
print(Qc.shape, Rc.shape, np.allclose(Qc @ Rc, X))
print(np.linalg.matrix_rank(X), np.linalg.matrix_rank(np.array([[1.0, 2.0], [2.0, 4.0]])), np.linalg.matrix_rank(np.eye(4)), np.linalg.matrix_rank(np.zeros((2, 2))))
P = np.linalg.pinv(X)
print(np.round(P, 8), np.allclose(X @ P @ X, X))
sol, res, rk, sv = np.linalg.lstsq(X, np.array([1.0, 2.0, 2.0]), rcond=None)
print(np.round(sol, 8), np.round(res, 8), rk, np.round(sv, 8))
print(repr(np.linalg.norm(np.array([3.0, 4.0]))), np.linalg.norm(np.array([3.0, 4.0]), 1), np.linalg.norm(np.array([3.0, -4.0]), np.inf), np.round(np.linalg.norm(X), 10), np.round(np.linalg.norm(X, 'fro'), 10), np.linalg.norm(X, axis=1), np.linalg.norm(X, axis=0, keepdims=True), np.round(np.linalg.norm(X, 2), 8), np.linalg.norm(X, 1), np.linalg.norm(X, np.inf), np.linalg.norm(np.array([[1, 2], [3, 4]]), axis=1, keepdims=True))
print(np.round(np.linalg.matrix_power(np.array([[1.0, 1.0], [1.0, 0.0]]), 10), 6), np.round(np.linalg.slogdet(A)[1], 10), np.linalg.slogdet(A)[0])
B3 = np.stack([np.eye(2) * 2, np.eye(2) * 4])
print(np.linalg.inv(B3), np.linalg.det(B3))
from numpy.linalg import inv, norm
print(norm(np.array([1.0, 1.0])) ** 2, inv(np.eye(2)))
`,
  ml_softmax_xent: `
import numpy as np
def softmax(z):
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)
logits = np.array([[2.0, 1.0, 0.1], [0.5, 2.5, 0.3], [1.0, 1.0, 1.0], [1000.0, 1001.0, 999.0]])
p = softmax(logits)
print(p)
print(p.sum(axis=1), p.argmax(axis=1), np.round(p, 4))
y = np.array([0, 1, 2, 1])
n = len(y)
loss = -np.log(p[np.arange(n), y]).mean()
print(round(float(loss), 10))
grad = p.copy()
grad[np.arange(n), y] -= 1
grad /= n
print(grad)
onehot = np.eye(3)[y]
print(onehot, (p.argmax(axis=1) == y).mean())
`,
  ml_linear_regression: `
import numpy as np
np.random.seed(0)
X = np.random.rand(100, 3)
true_w = np.array([2.0, -1.0, 0.5])
y = X @ true_w + 0.3 + 0.01 * np.random.randn(100)
w = np.zeros(3)
b = 0.0
lr = 0.5
for epoch in range(200):
    pred = X @ w + b
    err = pred - y
    dw = X.T @ err / len(y)
    db = err.mean()
    w -= lr * dw
    b -= lr * db
    if epoch % 50 == 0:
        print(epoch, np.round(np.mean(err ** 2), 6))
print(np.round(w, 3), round(b, 3))
Xb = np.hstack([X, np.ones((100, 1))])
theta = np.linalg.solve(Xb.T @ Xb, Xb.T @ y)
print(np.round(theta, 3), np.round(np.linalg.lstsq(Xb, y, rcond=None)[0], 3))
`,
  ml_logistic: `
import numpy as np
np.random.seed(1)
X = np.vstack([np.random.randn(50, 2) + 2, np.random.randn(50, 2) - 2])
y = np.hstack([np.ones(50), np.zeros(50)])
def sigmoid(z):
    return 1 / (1 + np.exp(-z))
w = np.zeros(2)
b = 0.0
for i in range(100):
    p = sigmoid(X @ w + b)
    w -= 0.1 * X.T @ (p - y) / len(y)
    b -= 0.1 * np.mean(p - y)
loss = -np.mean(y * np.log(p) + (1 - y) * np.log(1 - p))
print(np.round(w, 4), np.round(b, 4), np.round(loss, 4))
pred = (sigmoid(X @ w + b) > 0.5).astype(int)
print(pred[:10], (pred == y).mean(), np.sum(pred), pred.dtype)
`,
  ml_kmeans: `
import numpy as np
np.random.seed(3)
pts = np.vstack([np.random.randn(20, 2) + [0, 0], np.random.randn(20, 2) + [5, 5], np.random.randn(20, 2) + [0, 5]])
k = 3
centroids = pts[np.random.choice(len(pts), k, replace=False)]
for it in range(5):
    d = np.linalg.norm(pts[:, None, :] - centroids[None, :, :], axis=2)
    labels = d.argmin(axis=1)
    centroids = np.array([pts[labels == j].mean(axis=0) for j in range(k)])
    print(it, np.bincount(labels, minlength=k))
print(np.round(centroids[np.argsort(centroids[:, 0] + centroids[:, 1])], 4))
inertia = sum(((pts[labels == j] - centroids[j]) ** 2).sum() for j in range(k))
print(round(float(inertia), 6))
`,
  ml_pca: `
import numpy as np
np.random.seed(4)
X = np.random.randn(50, 3) @ np.array([[3.0, 0.0, 0.0], [1.0, 1.0, 0.0], [0.5, 0.2, 0.1]])
Xc = X - X.mean(axis=0)
C = Xc.T @ Xc / (len(X) - 1)
print(np.round(C, 6), np.allclose(C, np.cov(X, rowvar=False)))
vals, vecs = np.linalg.eigh(C)
order = np.argsort(vals)[::-1]
vals, vecs = vals[order], vecs[:, order]
vecs = vecs * np.sign(vecs[0])
print(np.round(vals, 6), np.round(vals / vals.sum(), 6))
print(np.round(vecs, 6))
U, S, Vt = np.linalg.svd(Xc, full_matrices=False)
Vt = Vt * np.sign(Vt[:, :1])
print(np.round(S ** 2 / (len(X) - 1), 6), np.round(Vt.T, 6), np.allclose(np.abs(Vt.T), np.abs(vecs)))
Z = Xc @ vecs[:, :2]
print(Z.shape, np.round(Z[:3], 6), np.round(Z.var(axis=0, ddof=1), 6))
`,
  ml_mlp: `
import numpy as np
np.random.seed(0)
X = np.random.randn(8, 4)
y = np.array([0, 1, 1, 0, 1, 0, 0, 1])
W1 = np.random.randn(4, 5) * 0.1
b1 = np.zeros(5)
W2 = np.random.randn(5, 2) * 0.1
b2 = np.zeros(2)
for step in range(3):
    h = X @ W1 + b1
    a = np.maximum(h, 0)
    z = a @ W2 + b2
    z = z - z.max(axis=1, keepdims=True)
    p = np.exp(z) / np.exp(z).sum(axis=1, keepdims=True)
    loss = -np.log(p[np.arange(len(y)), y]).mean()
    dz = p.copy()
    dz[np.arange(len(y)), y] -= 1
    dz /= len(y)
    dW2 = a.T @ dz
    db2 = dz.sum(axis=0)
    da = dz @ W2.T
    dh = da * (h > 0)
    dW1 = X.T @ dh
    db1 = dh.sum(axis=0)
    for P, dP in [(W1, dW1), (b1, db1), (W2, dW2), (b2, db2)]:
        P -= 0.5 * dP
    print(step, np.round(loss, 8))
print(dW1.shape, np.round(dW2, 8), np.round(b1, 8))
print(W1.dtype, (h > 0).dtype, (h > 0).sum())
`,
  ml_attention: `
import numpy as np
np.random.seed(0)
B, T, H, D = 2, 4, 2, 3
x = np.random.randn(B, T, H * D)
Wq = np.random.randn(H * D, H * D) * 0.5
Wk = np.random.randn(H * D, H * D) * 0.5
Wv = np.random.randn(H * D, H * D) * 0.5
def split(t):
    return t.reshape(B, T, H, D).transpose(0, 2, 1, 3)
q, k, v = split(x @ Wq), split(x @ Wk), split(x @ Wv)
print(q.shape, k.shape, v.shape)
scores = q @ k.transpose(0, 1, 3, 2) / np.sqrt(D)
mask = np.triu(np.ones((T, T), dtype=bool), k=1)
print(mask)
scores = np.where(mask, -np.inf, scores)
print(np.round(scores[0, 0], 4))
w = np.exp(scores - scores.max(axis=-1, keepdims=True))
w = w / w.sum(axis=-1, keepdims=True)
print(np.round(w[0, 0], 4), np.allclose(w.sum(axis=-1), 1.0))
out = w @ v
merged = out.transpose(0, 2, 1, 3).reshape(B, T, H * D)
print(merged.shape, np.round(merged[0], 4))
e = np.einsum('bhqd,bhkd->bhqk', q, k) / np.sqrt(D)
print(np.allclose(np.where(mask, -np.inf, e), scores))
pos = np.arange(T)[:, None] / np.power(10000, np.arange(0, D, 2)[None, :] / D)
print(np.round(np.sin(pos), 6), np.round(np.cos(pos), 6))
`,
  ml_misc: `
import numpy as np
np.random.seed(10)
data = np.random.randn(6, 3) * 5 + 2
mu, sd = data.mean(axis=0), data.std(axis=0)
z = (data - mu) / sd
print(np.round(z.mean(axis=0), 10), np.round(z.std(axis=0), 10))
mn, mx = data.min(axis=0), data.max(axis=0)
print(np.round((data - mn) / (mx - mn), 6))
idx = np.random.permutation(len(data))
train, test = data[idx[:4]], data[idx[4:]]
print(train.shape, test.shape, idx)
acts = np.array([-2.0, -0.5, 0.0, 0.5, 2.0])
relu = np.maximum(0, acts)
leaky = np.where(acts > 0, acts, 0.01 * acts)
print(relu, leaky, 1 / (1 + np.exp(-acts)), np.tanh(acts), (acts > 0).astype(float))
batch = np.arange(10)
for i in range(0, 10, 4):
    print(batch[i:i + 4])
conf = np.zeros((3, 3), dtype=int)
for t, p in zip([0, 1, 2, 2, 1], [0, 2, 2, 2, 1]):
    conf[t, p] += 1
print(conf, np.trace(conf) / conf.sum())
dists = np.sqrt(((data[:, None, :] - data[None, :, :]) ** 2).sum(axis=-1))
print(np.round(dists[:3, :3], 6), np.argsort(dists[0])[:3])
`,
  random_generator: `
import numpy as np
rng = np.random.default_rng(42)
print(rng.random(3), repr(rng.random()), rng.random((2, 2)))
print(rng.standard_normal(5), repr(rng.standard_normal()), rng.normal(0, 1, (2, 3)), rng.normal(10, 0.5, 2), repr(rng.normal()))
print(rng.integers(0, 10, 8), repr(rng.integers(5)), rng.integers(-3, 3, (2, 3)), rng.integers(0, 2**40, 3), rng.integers(1, 6, 4, endpoint=True), rng.integers(10, size=3))
print(rng.uniform(-1, 1, 3), repr(rng.uniform()), rng.uniform(size=2))
print(rng.choice(5), rng.choice(5, 3), rng.choice([10, 20, 30], 4), rng.choice(10, 4, replace=False), rng.choice(4, 6, p=[0.1, 0.2, 0.3, 0.4]), rng.choice(6, 3, replace=False, p=[0.1] * 5 + [0.5]), rng.choice(10, 3, replace=False, shuffle=False))
print(rng.choice(20000, 5, replace=False), rng.choice(20000, 500, replace=False)[:5])
print(rng.permutation(8), rng.permutation([1, 2, 3, 4]), rng.permutation(np.arange(6).reshape(3, 2)))
x = np.arange(10)
rng.shuffle(x)
print(x)
z = np.random.default_rng(0).standard_normal(3000)
print([repr(float(v)) for v in z[::97]], repr(z.sum()), repr(z.mean()), repr(z.std()))
r2 = np.random.default_rng(12345)
X = r2.normal(size=(100, 3))
w = r2.normal(size=3)
y = X @ w + 0.1 * r2.normal(size=100)
print(np.round(np.linalg.lstsq(X, y, rcond=None)[0], 4), np.round(w, 4))
print(np.random.default_rng([1, 2]).random(2), np.random.default_rng(2**70).random(2), type(np.random.default_rng().random()))
`,
  index_tricks_complex: `
import numpy as np
print(np.c_[np.ones(3), np.arange(3)], np.r_[1:4, 10, 20], np.r_[np.array([1, 2]), np.array([3])], np.c_[np.eye(2), np.zeros(2)])
X = np.arange(6.0).reshape(3, 2)
print(np.c_[np.ones(len(X)), X])
w, V = np.linalg.eig(np.diag([3.0, 1.0, 2.0]))
print(w, repr(w), w.dtype, V, w.real, w.imag, np.abs(w), w + 1, (w * 2).dtype, np.sort(w), w.max(), w.sum(), repr(w[0]), str(w[0]), w.astype(float))
print(repr(np.complex128(0.5)), np.round(w / 3, 3), np.real(w), np.imag(w), np.iscomplexobj(w), repr(np.array([1.5, -2.0]) + 0 * w[:2]))
`,
  tracer_types: `
import numpy as np
a = np.zeros((2, 2))
print(type(a).__name__, type(a.sum()).__name__, type(a.dtype), np.ndarray, isinstance(a, np.ndarray), isinstance(1.0, np.ndarray))
print(np.float64.__name__, np.array([1]).dtype.type, np.int64(1).dtype, a.dtype.type(3))
`,
  logaddexp: `
import numpy as np
a = np.array([-2.0, 0.0, 1.5, 100.0, -1000.0])
b = np.array([1.0, 0.0, -3.25, 99.0, -999.5])
print(np.logaddexp(a, b))
print(np.logaddexp(a, 0.5), np.logaddexp(2.0, 3.0))
print(np.logaddexp2(a, b))
`,
  bool_ops_last_operand: `
import numpy as np
x = None or np.zeros(3)
y = 1 and np.ones(2)
z = 0 or [] or np.arange(3)
print(x, y, z)
`,
  range_index: `
import numpy as np
Q = np.array([[1., -2.], [3., 4.]])
print(Q[np.array([1, 1]), range(2)], Q[range(2)], np.arange(10)[range(1, 8, 3)])
`,
  tri_indices: `
import numpy as np
print(np.triu_indices(3, k=1))
print(np.tril_indices(3))
r, c = np.triu_indices(4, 1)
D = np.arange(16).reshape(4, 4)
print(D[r, c], D[np.tril_indices(4, -1)], np.triu_indices(2, 0, 3))
`,
  float16_scalars: `
import numpy as np
for v in [0, 1e-4, 9e-5, 0.1, 0.3333, 1.0, 100, 1000, 2047, 2048, 2049, 4096, 10000, 65504, 65519, 65520, -0.5, 6e-8, 2.9e-8, 3e-8, 3.07e-5, 1e-5, 1.5, 0.000655, 123.4, 999.9, 1e-8, -7.2e-6]:
    x = np.float16(v); print(repr(v), '->', str(x), repr(x), float(x))
grad = 1e-8
print(np.float16(grad))
S = 2.0 ** 16
scaled = np.float16(grad * S)
print(scaled, float(scaled) / S)
print(type(scaled).__name__, isinstance(scaled, np.floating))
`,
};
