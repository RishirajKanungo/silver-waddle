import { md, type Module } from '../types';

// Fenced code inside md`…` must use real backticks: the block parser looks for ``` before it
// un-escapes \`, so build fences with this helper.
const py = (code: string) => '\n\n```python\n' + code.trim() + '\n```\n\n';

// ------------------------------------------------------------------ exercises: lesson 1

const KNN_STARTER = `import numpy as np

def pairwise_sq_dists(A, B):
    # A: (n, d), B: (m, d)  ->  (n, m)
    pass

def knn_predict(X_train, y_train, X_test, k):
    # X_train: (n, d), y_train: (n,) ints, X_test: (m, d)  ->  (m,) ints
    pass
`;
const KNN_SOLUTION = `import numpy as np

def pairwise_sq_dists(A, B):
    # A: (n, d), B: (m, d)  ->  (n, m)
    sq_a = (A ** 2).sum(axis=1)                  # (n,)
    sq_b = (B ** 2).sum(axis=1)                  # (m,)
    D = sq_a[:, None] + sq_b[None, :] - 2 * A @ B.T
    return np.maximum(D, 0.0)                    # round-off can make tiny negatives

def knn_predict(X_train, y_train, X_test, k):
    # X_train: (n, d), y_train: (n,) ints, X_test: (m, d)  ->  (m,) ints
    D = pairwise_sq_dists(X_test, X_train)       # (m, n)
    nn = np.argsort(D, axis=1, kind='stable')[:, :k]   # (m, k) neighbour indices
    C = int(y_train.max()) + 1
    votes = np.eye(C)[y_train[nn]].sum(axis=1)   # (m, k, C) -> (m, C)
    return votes.argmax(axis=1)                  # first maximum = smallest label
`;

const KMEANS_STARTER = `import numpy as np

def kmeans(X, centroids, n_iters):
    # X: (n, d), centroids: (K, d) initial positions
    # returns (centroids (K, d), labels (n,))
    pass
`;
const KMEANS_SOLUTION = `import numpy as np

def assign(X, C):
    D = (X ** 2).sum(axis=1)[:, None] + (C ** 2).sum(axis=1)[None, :] - 2 * X @ C.T   # (n, K)
    return D.argmin(axis=1)                                                          # (n,)

def kmeans(X, centroids, n_iters):
    # X: (n, d), centroids: (K, d) initial positions
    # returns (centroids (K, d), labels (n,))
    C = centroids.astype(float).copy()
    K = C.shape[0]
    for _ in range(n_iters):
        labels = assign(X, C)
        onehot = np.eye(K)[labels]                  # (n, K)
        counts = onehot.sum(axis=0)                 # (K,)
        sums = onehot.T @ X                         # (K, d)
        C = np.where(counts[:, None] > 0, sums / np.maximum(counts, 1)[:, None], C)
    return C, assign(X, C)
`;

const LINREG_FIXTURE = `# Data used by the tests. Keep these lines.
np.random.seed(2)
X_demo = np.random.randn(20, 3)
y_demo = X_demo @ np.array([1.0, -2.0, 0.5]) + 3.0 + 0.1 * np.random.randn(20)
X_line = np.array([[0.0], [1.0], [2.0], [3.0]])
y_line = np.array([1.0, 3.0, 5.0, 7.0])
`;
const LINREG_STARTER = `import numpy as np

def fit_closed_form(X, y):
    # X: (n, d), y: (n,)  ->  (w (d,), b float)
    pass

def fit_gd(X, y, lr, n_steps):
    # gradient descent on the mean squared error, starting from w = 0, b = 0
    pass

${LINREG_FIXTURE}`;
const LINREG_SOLUTION = `import numpy as np

def fit_closed_form(X, y):
    # X: (n, d), y: (n,)  ->  (w (d,), b float)
    Xb = np.hstack([X, np.ones((X.shape[0], 1))])          # (n, d+1): a column of ones for b
    theta = np.linalg.solve(Xb.T @ Xb, Xb.T @ y)           # normal equations, no explicit inverse
    return theta[:-1], float(theta[-1])

def fit_gd(X, y, lr, n_steps):
    # gradient descent on the mean squared error, starting from w = 0, b = 0
    n, d = X.shape
    w = np.zeros(d)
    b = 0.0
    for _ in range(n_steps):
        r = X @ w + b - y                     # (n,) residuals
        w = w - lr * (2 / n) * (X.T @ r)      # (d,)
        b = b - lr * (2 / n) * r.sum()
    return w, float(b)

${LINREG_FIXTURE}`;

const LOGREG_FIXTURE = `# Data used by the tests. Keep these lines.
np.random.seed(4)
X_demo = np.random.randn(50, 2)
y_demo = (X_demo @ np.array([2.0, -1.0]) + 0.5 + 0.5 * np.random.randn(50) > 0).astype(float)
`;
const LOGREG_STARTER = `import numpy as np

def sigmoid(z):
    pass

def logreg_loss(X, y, w, b):
    # mean binary cross-entropy (float)
    pass

def logreg_fit(X, y, lr, n_epochs):
    # full-batch gradient descent from w = 0, b = 0  ->  (w (d,), b float)
    pass

${LOGREG_FIXTURE}`;
const LOGREG_SOLUTION = `import numpy as np

def sigmoid(z):
    return 1.0 / (1.0 + np.exp(-z))

def logreg_loss(X, y, w, b):
    # mean binary cross-entropy (float)
    p = np.clip(sigmoid(X @ w + b), 1e-12, 1 - 1e-12)
    return float(-(y * np.log(p) + (1 - y) * np.log(1 - p)).mean())

def logreg_fit(X, y, lr, n_epochs):
    # full-batch gradient descent from w = 0, b = 0  ->  (w (d,), b float)
    n, d = X.shape
    w = np.zeros(d)
    b = 0.0
    for _ in range(n_epochs):
        g = sigmoid(X @ w + b) - y            # (n,): dLoss/dz for each example, times n
        w = w - lr * (X.T @ g) / n
        b = b - lr * g.mean()
    return w, float(b)

${LOGREG_FIXTURE}`;

// ------------------------------------------------------------------ exercises: lesson 2

const SOFTMAX_STARTER = `import numpy as np

def softmax(Z):
    # Z: (n, C) logits  ->  (n, C) probabilities, each row sums to 1
    pass

def cross_entropy(Z, y):
    # Z: (n, C) logits, y: (n,) int labels  ->  mean loss (float)
    pass
`;
const SOFTMAX_SOLUTION = `import numpy as np

def softmax(Z):
    # Z: (n, C) logits  ->  (n, C) probabilities, each row sums to 1
    Z = Z - Z.max(axis=1, keepdims=True)       # shift: same result, no overflow
    E = np.exp(Z)
    return E / E.sum(axis=1, keepdims=True)

def cross_entropy(Z, y):
    # Z: (n, C) logits, y: (n,) int labels  ->  mean loss (float)
    Zs = Z - Z.max(axis=1, keepdims=True)
    log_p = Zs - np.log(np.exp(Zs).sum(axis=1, keepdims=True))   # log-softmax, (n, C)
    n = Z.shape[0]
    return float(-log_p[np.arange(n), y].mean())
`;

const MLP_FIXTURE = `# Data and parameters used by the tests. Keep these lines.
np.random.seed(0)
X = np.random.randn(6, 4)
y = np.array([0, 2, 1, 2, 0, 1])
W1 = 0.5 * np.random.randn(4, 5)
b1 = 0.1 * np.random.randn(5)
W2 = 0.5 * np.random.randn(5, 3)
b2 = 0.1 * np.random.randn(3)
`;
const MLP_STARTER = `import numpy as np

def mlp_loss_grads(X, y, W1, b1, W2, b2):
    # X: (n, D), y: (n,), W1: (D, H), b1: (H,), W2: (H, C), b2: (C,)
    # returns (loss float, {'W1': ..., 'b1': ..., 'W2': ..., 'b2': ...})
    pass

${MLP_FIXTURE}`;
const MLP_SOLUTION = `import numpy as np

def mlp_loss_grads(X, y, W1, b1, W2, b2):
    # X: (n, D), y: (n,), W1: (D, H), b1: (H,), W2: (H, C), b2: (C,)
    # returns (loss float, {'W1': ..., 'b1': ..., 'W2': ..., 'b2': ...})
    n = X.shape[0]
    Z1 = X @ W1 + b1                    # (n, H)
    A1 = np.maximum(Z1, 0)              # (n, H)
    Z2 = A1 @ W2 + b2                   # (n, C)
    Zs = Z2 - Z2.max(axis=1, keepdims=True)
    P = np.exp(Zs)
    P = P / P.sum(axis=1, keepdims=True)
    loss = float(-np.log(P[np.arange(n), y]).mean())

    dZ2 = P.copy()                      # (n, C): (P - Y) / n
    dZ2[np.arange(n), y] -= 1
    dZ2 /= n
    dW2 = A1.T @ dZ2                    # (H, C)
    db2 = dZ2.sum(axis=0)               # (C,)
    dA1 = dZ2 @ W2.T                    # (n, H)
    dZ1 = dA1 * (Z1 > 0)                # ReLU passes gradient only where Z1 > 0
    dW1 = X.T @ dZ1                     # (D, H)
    db1 = dZ1.sum(axis=0)               # (H,)
    return loss, {'W1': dW1, 'b1': db1, 'W2': dW2, 'b2': db2}

${MLP_FIXTURE}`;

const GC_FIXTURE = `# A model with a known-correct gradient, and a buggy one. Keep these lines.
np.random.seed(1)
Xg = np.random.randn(8, 3)
yg = np.array([0, 1, 2, 1, 0, 2, 2, 1])
W0 = 0.1 * np.random.randn(3, 3)

def loss_and_grad(W):
    Z = Xg @ W
    Z = Z - Z.max(axis=1, keepdims=True)
    P = np.exp(Z) / np.exp(Z).sum(axis=1, keepdims=True)
    n = Xg.shape[0]
    loss = float(-np.log(P[np.arange(n), yg]).mean())
    P[np.arange(n), yg] -= 1
    return loss, Xg.T @ P / n

def buggy_grad(W):
    return loss_and_grad(W)[1] * Xg.shape[0]     # forgot to divide by n
`;
const GC_STARTER = `import numpy as np

def numerical_grad(f, P, h=1e-5):
    # f: function from an array shaped like P to a float
    # returns G with G.shape == P.shape, by central differences
    pass

def rel_error(A, B):
    # max over entries of |A - B| / max(|A| + |B|, 1e-12)
    pass

${GC_FIXTURE}`;
const GC_SOLUTION = `import numpy as np

def numerical_grad(f, P, h=1e-5):
    # f: function from an array shaped like P to a float
    # returns G with G.shape == P.shape, by central differences
    G = np.zeros(P.size)
    for i in range(P.size):
        E = np.zeros(P.size)
        E[i] = h
        E = E.reshape(P.shape)                    # nudge one entry, leave P itself untouched
        G[i] = (f(P + E) - f(P - E)) / (2 * h)
    return G.reshape(P.shape)

def rel_error(A, B):
    # max over entries of |A - B| / max(|A| + |B|, 1e-12)
    return float(np.max(np.abs(A - B) / np.maximum(np.abs(A) + np.abs(B), 1e-12)))

${GC_FIXTURE}`;

const LN_STARTER = `import numpy as np

def layernorm(X, gamma, beta, eps=1e-5):
    # X: (..., D), gamma: (D,), beta: (D,)  ->  same shape as X
    pass
`;
const LN_SOLUTION = `import numpy as np

def layernorm(X, gamma, beta, eps=1e-5):
    # X: (..., D), gamma: (D,), beta: (D,)  ->  same shape as X
    mu = X.mean(axis=-1, keepdims=True)               # (..., 1)
    var = X.var(axis=-1, keepdims=True)               # (..., 1), divides by D
    return gamma * (X - mu) / np.sqrt(var + eps) + beta
`;

const ATT_FIXTURE = `# Inputs used by the tests. Keep these lines.
np.random.seed(3)
Qr = np.random.randn(2, 4, 3)
Kr = np.random.randn(2, 4, 3)
Vr = np.random.randn(2, 4, 2)
`;
const ATT_STARTER = `import numpy as np

def attention(Q, K, V, causal=False):
    # Q: (..., T, d), K: (..., S, d), V: (..., S, dv)  ->  (..., T, dv)
    pass

${ATT_FIXTURE}`;
const ATT_SOLUTION = `import numpy as np

def attention(Q, K, V, causal=False):
    # Q: (..., T, d), K: (..., S, d), V: (..., S, dv)  ->  (..., T, dv)
    d = Q.shape[-1]
    S = Q @ np.swapaxes(K, -1, -2) / np.sqrt(d)        # (..., T, S)
    if causal:
        T, Sk = S.shape[-2], S.shape[-1]
        future = np.triu(np.ones((T, Sk), dtype=bool), k=1)   # True above the diagonal
        S = np.where(future, -np.inf, S)
    S = S - S.max(axis=-1, keepdims=True)              # stable softmax over keys
    W = np.exp(S)                                      # exp(-inf) = 0
    W = W / W.sum(axis=-1, keepdims=True)
    return W @ V                                       # (..., T, dv)

${ATT_FIXTURE}`;

// ------------------------------------------------------------------ exercises: lesson 3

const SPLIT_STARTER = `import numpy as np

def train_test_split(n, n_test, seed):
    # returns (train_idx, test_idx)
    pass

def standardize(X_train, X_test):
    # returns (X_train_scaled, X_test_scaled), using training statistics only
    pass
`;
const SPLIT_SOLUTION = `import numpy as np

def train_test_split(n, n_test, seed):
    # returns (train_idx, test_idx)
    np.random.seed(seed)
    perm = np.random.permutation(n)
    return perm[n_test:], perm[:n_test]

def standardize(X_train, X_test):
    # returns (X_train_scaled, X_test_scaled), using training statistics only
    mu = X_train.mean(axis=0)                  # (d,)
    sd = X_train.std(axis=0)                   # (d,)
    sd = np.where(sd == 0, 1.0, sd)            # a constant column would give 0/0
    return (X_train - mu) / sd, (X_test - mu) / sd
`;

const PRF_STARTER = `import numpy as np

def confusion_matrix(y_true, y_pred, n_classes):
    # (n_classes, n_classes) ints: rows = true class, columns = predicted class
    pass

def precision_recall_f1(y_true, y_pred):
    # binary 0/1 labels  ->  (precision, recall, f1); 0/0 counts as 0.0
    pass
`;
const PRF_SOLUTION = `import numpy as np

def confusion_matrix(y_true, y_pred, n_classes):
    # (n_classes, n_classes) ints: rows = true class, columns = predicted class
    idx = y_true * n_classes + y_pred                  # one integer per (true, pred) pair
    return np.bincount(idx, minlength=n_classes * n_classes).reshape(n_classes, n_classes)

def precision_recall_f1(y_true, y_pred):
    # binary 0/1 labels  ->  (precision, recall, f1); 0/0 counts as 0.0
    tp = int(((y_pred == 1) & (y_true == 1)).sum())
    fp = int(((y_pred == 1) & (y_true == 0)).sum())
    fn = int(((y_pred == 0) & (y_true == 1)).sum())
    p = tp / (tp + fp) if tp + fp > 0 else 0.0
    r = tp / (tp + fn) if tp + fn > 0 else 0.0
    f1 = 2 * p * r / (p + r) if p + r > 0 else 0.0
    return p, r, f1
`;

const AUC_STARTER = `import numpy as np

def roc_auc(y_true, scores):
    # y_true: (n,) 0/1, scores: (n,)  ->  AUC (float); tied scores count one half
    pass
`;
const AUC_SOLUTION = `import numpy as np

def roc_auc(y_true, scores):
    # y_true: (n,) 0/1, scores: (n,)  ->  AUC (float); tied scores count one half
    u, inv, counts = np.unique(scores, return_inverse=True, return_counts=True)
    ranks = (np.cumsum(counts) - (counts - 1) / 2)[inv]     # 1-based ranks, ties averaged
    pos = y_true == 1
    n_pos = int(pos.sum())
    n_neg = len(y_true) - n_pos
    return float((ranks[pos].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg))
`;

const TOPK_FIXTURE = `# Inputs used by the tests. Keep these lines.
np.random.seed(6)
Q_demo = np.random.randn(3, 5)
D_demo = np.random.randn(12, 5)
`;
const TOPK_STARTER = `import numpy as np

def topk_cosine(Q, D, k):
    # Q: (q, d) queries, D: (n, d) documents  ->  (q, k) int indices, most similar first
    pass

${TOPK_FIXTURE}`;
const TOPK_SOLUTION = `import numpy as np

def topk_cosine(Q, D, k):
    # Q: (q, d) queries, D: (n, d) documents  ->  (q, k) int indices, most similar first
    Qn = Q / np.maximum(np.linalg.norm(Q, axis=1, keepdims=True), 1e-12)   # (q, d)
    Dn = D / np.maximum(np.linalg.norm(D, axis=1, keepdims=True), 1e-12)   # (n, d)
    S = Qn @ Dn.T                                                          # (q, n) cosines
    return np.argsort(-S, axis=1, kind='stable')[:, :k]

${TOPK_FIXTURE}`;

const KF_STARTER = `import numpy as np

def stratified_kfold(y, k, seed=None):
    # y: (n,) class labels  ->  (n,) fold id in 0..k-1 for every sample
    pass

def fold_split(fold, f):
    # fold: (n,) fold ids  ->  (train_idx, test_idx), both sorted
    pass
`;
const KF_SOLUTION = `import numpy as np

def stratified_kfold(y, k, seed=None):
    # y: (n,) class labels  ->  (n,) fold id in 0..k-1 for every sample
    if seed is not None:
        np.random.seed(seed)
    fold = np.zeros(len(y), dtype=int)
    for c in np.unique(y):                       # a loop over classes, not over samples
        idx = np.flatnonzero(y == c)             # this class's indices, increasing
        if seed is not None:
            idx = np.random.permutation(idx)
        fold[idx] = np.arange(len(idx)) % k      # deal them out: 0, 1, ..., k-1, 0, 1, ...
    return fold

def fold_split(fold, f):
    # fold: (n,) fold ids  ->  (train_idx, test_idx), both sorted
    return np.flatnonzero(fold != f), np.flatnonzero(fold == f)
`;

export const MODULE: Module = {
  id: 'code01',
  part: 'prep',
  order: 2,
  title: 'The ML coding round',
  summary: 'Classical models, neural-network pieces and evaluation utilities written from scratch in NumPy, with a routine for working under interview conditions.',
  relevance: md`Many ML engineer interview loops include a coding round where you implement a model, a layer or a metric from scratch, usually in Python with NumPy and without ML libraries. The same skills are used daily: writing a custom loss, debugging a gradient, computing a metric that a library gets subtly wrong for your data. Interviewers watch how you work as much as whether the code runs: whether you state shapes, test small cases, avoid Python loops over data, and can say what the code costs in time and memory.`,
  areas: ['ml-coding', 'ml-depth', 'ml-breadth'],
  lessons: [
    // ------------------------------------------------------------------ 1
    {
      id: 'code01-1',
      title: 'Classical models from scratch',
      minutes: 40,
      objectives: [
        'Apply a five-step routine to an ML coding problem: shapes, tiny example, vectorize, edge cases, complexity.',
        'Compute all pairwise squared distances with one matrix product, and say why the result must be clipped at zero.',
        'Implement a k-NN classifier and k-means in NumPy with no Python loop over data points.',
        'Fit linear regression in closed form and by gradient descent, and logistic regression by gradient descent.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`In an ML coding round you are asked to implement something you know well, such as k-means, a logistic regression training loop or the AUC metric, in about 30 to 45 minutes, typically in Python with NumPy only. The algorithms are short. What separates a strong performance from a weak one is method: code that is correct on the first run because the shapes were written down, a tiny example was checked by hand, and the edge cases were named before the interviewer asked.`,
        },
        {
          kind: 'callout',
          tone: 'interview',
          title: 'A routine for every problem',
          md: md`1. **Restate inputs and outputs with shapes.** Write \`# X: (n, d), y: (n,) -> (m,)\` as the first line. Ask about dtypes, whether labels are \`0..C-1\`, and what to do on ties.
2. **Work a tiny example.** Two or three points that you can compute by hand. It becomes your first test.
3. **Vectorize.** Think of the loop version, then replace the loop over data with broadcasting, a matrix product or a reduction along an axis. Loops over iterations or epochs are fine.
4. **Test edge cases.** \`k\` equal to \`n\`, ties, an empty cluster, a constant feature, very large or very small values, a class that never appears.
5. **Narrate complexity.** Time and memory in terms of \`n\`, \`d\`, \`k\`, and what you would change if \`n\` were a billion.`,
        },
        {
          kind: 'text',
          md: md`### Pairwise distances

k-NN, k-means and RBF kernels all need the squared distance between every row of $A \in \R^{n\times d}$ and every row of $B \in \R^{m\times d}$. The double loop costs $nm$ Python-level iterations. Expanding the square turns it into one matrix product, which NumPy runs in optimized compiled code.`,
        },
        {
          kind: 'derive',
          title: 'all pairwise distances with one matrix product',
          goal: md`Write the $n \times m$ matrix $D_{ij} = \lVert\ba_i - \bb_j\rVert^2$ using $AB\T$.`,
          steps: [
            { md: md`Expand one entry with the dot product: $$\lVert\ba_i - \bb_j\rVert^2 = (\ba_i - \bb_j)\cdot(\ba_i - \bb_j) = \lVert\ba_i\rVert^2 + \lVert\bb_j\rVert^2 - 2\,\ba_i\cdot\bb_j.$$` },
            {
              md: md`The cross terms $\ba_i\cdot\bb_j$ for all $i, j$ are exactly the entries of $AB\T$, an $(n, d)\,@\,(d, m) = (n, m)$ product.`,
              choose: {
                prompt: md`Which matrix holds every $\ba_i\cdot\bb_j$?`,
                options: [md`$AB\T$, shape $(n, m)$`, md`$A\T B$, shape $(d, d)$`, md`$A \odot B$, element-wise`],
                answer: 0,
                explain: md`Row $i$ of $A$ dotted with row $j$ of $B$ is entry $(i, j)$ of $AB\T$. $A\T B$ would sum over the data points instead of the features, and the element-wise product needs equal shapes.`,
              },
            },
            {
              md: md`The squared norms form a column $\bs^A \in \R^{n\times 1}$ and a row $(\bs^B)\T \in \R^{1\times m}$. Broadcasting adds them to every entry: $$D = \bs^A\,\mathbf{1}\T + \mathbf{1}\,(\bs^B)\T - 2AB\T.$$ In NumPy: \`sq_a[:, None] + sq_b[None, :] - 2 * A @ B.T\`.`,
              choose: {
                prompt: md`\`sq_a\` has shape \`(n,)\` and \`sq_b\` has shape \`(m,)\`. How do you add them to get an \`(n, m)\` matrix?`,
                options: [md`\`sq_a[:, None] + sq_b[None, :]\`, shapes (n, 1) + (1, m)`, md`\`sq_a + sq_b\``, md`\`np.outer(sq_a, sq_b)\``],
                answer: 0,
                explain: md`Broadcasting stretches the size-1 axes. \`sq_a + sq_b\` fails unless $n = m$, and then it adds element-wise instead. \`np.outer\` multiplies.`,
              },
            },
          ],
          takeaway: md`Cost: $O(nmd)$ arithmetic done by one matrix product, and $O(nm)$ memory for $D$. The memory, not the arithmetic, is usually what forces you to process the queries in chunks.`,
        },
        {
          kind: 'viz',
          viz: { type: 'sd.pairdist' },
          task: md`Click the cell for $\ba_2$ and $\bb_3$ and check that the three pieces add up to the squared distance. Then drag $\bb_1$ on top of $\ba_1$ and watch row 1 of $D$: which entry becomes $0$, and which pieces cancel to produce it?`,
          caption: md`Each entry of $D$ is a squared norm from the column, plus one from the row, minus twice a dot product. The shapes $(n,1) + (1,m) - (n,m)$ broadcast to $(n, m)$.`,
        },
        {
          kind: 'numeric',
          q: md`Use the identity to compute $\lVert\ba - \bb\rVert^2$ for $\ba = (1, 2)$ and $\bb = (3, -1)$. Compute $\lVert\ba\rVert^2$, $\lVert\bb\rVert^2$ and $\ba\cdot\bb$ first.`,
          answer: { kind: 'number', value: 13 },
          explain: md`$\lVert\ba\rVert^2 = 5$, $\lVert\bb\rVert^2 = 10$, $\ba\cdot\bb = 3 - 2 = 1$, so $5 + 10 - 2 = 13$. Directly: $\ba - \bb = (-2, 3)$ and $4 + 9 = 13$.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(5)
X = np.random.randn(5, 3) * 100          # 5 points, coordinates of size about 100
sq = (X ** 2).sum(axis=1)                # (5,)
D = sq[:, None] + sq[None, :] - 2 * X @ X.T
print(np.diag(D))                        # each point's squared distance to itself
print(D[4, 4] < 0)
print(np.sqrt(np.maximum(D, 0.0))[4, 4])`,
          note: md`The diagonal should be exactly $0$, but $\lVert\bx\rVert^2 + \lVert\bx\rVert^2 - 2\,\bx\cdot\bx$ subtracts two numbers near $6 \times 10^4$ and keeps the rounding error. A negative entry passed to \`np.sqrt\` gives \`nan\`. Clip with \`np.maximum(D, 0)\` before any square root.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'code01-ex-knn',
            title: 'k-nearest-neighbour classifier',
            prompt:
              md`Implement both functions with no Python loops (no \`for \`, which also rules out comprehensions).` +
              py(`def pairwise_sq_dists(A, B):
    """A: (n, d), B: (m, d) -> (n, m) with entry [i, j] = ||A[i] - B[j]||^2, clipped at 0."""

def knn_predict(X_train, y_train, X_test, k):
    """X_train: (n, d), y_train: (n,) ints in 0..C-1, X_test: (m, d), 1 <= k <= n.
    Returns (m,) ints: the majority label among the k nearest training points."""`) +
              md`Break ties in distance by the smaller training index (\`np.argsort(..., kind='stable')\`), and ties in the vote by the smaller label.`,
            starter: KNN_STARTER,
            solution: KNN_SOLUTION,
            tests: [
              { expr: `np.round(pairwise_sq_dists(np.array([[0., 0.], [1., 2.]]), np.array([[1., 0.], [0., 0.], [3., 4.]])), 6).tolist()`, label: 'distances on a 2 × 3 example' },
              { expr: `np.round(np.diag(pairwise_sq_dists(*((np.random.seed(5), (np.random.randn(5, 3) * 100,) * 2)[1]))), 6).tolist()`, label: 'self-distances of large points are exactly 0 (clipped)' },
              { expr: `knn_predict(np.array([[0., 0.], [5., 5.]]), np.array([0, 1]), np.array([[1., 1.], [4., 4.5]]), 1).tolist()`, label: 'k = 1 returns the nearest label' },
              { expr: `knn_predict(np.array([[0.], [1.], [2.], [10.], [11.]]), np.array([0, 0, 1, 1, 1]), np.array([[1.5], [9.]]), 3).tolist()`, label: 'k = 3 majority vote' },
              { expr: `knn_predict(np.array([[0.], [2.]]), np.array([1, 0]), np.array([[1.]]), 2).tolist()`, label: 'a tied vote goes to the smaller label' },
              { expr: `knn_predict(*((np.random.seed(0), (np.random.randn(40, 3), np.random.randint(0, 3, 40), np.random.randn(6, 3), 5))[1])).tolist()`, label: '40 random training points, 3 classes, k = 5' },
            ],
            hints: [
              md`\`(A ** 2).sum(axis=1)\` has shape \`(n,)\`. Make it a column with \`[:, None]\`, make B's a row with \`[None, :]\`, and the sum broadcasts to \`(n, m)\`.`,
              md`\`np.argsort(D, axis=1, kind='stable')[:, :k]\` gives the \`(m, k)\` neighbour indices, and \`y_train[nn]\` their labels.`,
              md`To count votes without a loop, index an identity matrix: \`np.eye(C)[labels]\` has shape \`(m, k, C)\`. Sum over axis 1, then \`argmax(axis=1)\` returns the first maximum, which is the smallest label on a tie.`,
            ],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'text',
          md: md`### k-means

Lloyd's algorithm alternates two steps from a given set of $K$ centroids:

1. **Assign** each point to its nearest centroid.
2. **Update** each centroid to the mean of the points assigned to it.

Neither step can raise the **inertia** $\sum_i \lVert\bx_i - \bc_{z_i}\rVert^2$: assignment picks the closest centroid for every point, and the mean is the point that minimizes the sum of squared distances to a set. The inertia is therefore non-increasing, and the algorithm stops at a local minimum that depends on the initialization. Libraries commonly default to k-means++ initialization, and keeping the best of several restarts is a common safeguard. In an interview, be ready to handle a centroid that loses all its points: the mean of an empty set is undefined.`,
        },
        {
          kind: 'viz',
          viz: { type: 'sd.kmeans' },
          task: md`Step through the iterations and watch the inertia. Then drag two of the initial centroids into the same blob, step again, and compare the final inertia with the first run.`,
          caption: md`Each frame is one assign or update step. The inertia never increases, but a poor start can end in a worse local minimum, which is why restarts and k-means++ are used.`,
        },
        {
          kind: 'check',
          q: md`During k-means, the inertia after an update step is $41.2$. What can you say about the inertia after the next assignment step?`,
          options: [md`It is at most $41.2$.`, md`It is exactly $41.2$.`, md`It can be larger, because points may switch clusters.`, md`It is at least $41.2$.`],
          answer: 0,
          explain: md`A point only switches cluster when another centroid is strictly closer, which lowers its term in the sum. If no point moves, the inertia stays the same. It never increases.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'code01-ex-kmeans',
            title: 'k-means with a fixed initialization',
            prompt:
              md`Implement Lloyd's algorithm.` +
              py(`def kmeans(X, centroids, n_iters):
    """X: (n, d), centroids: (K, d) initial positions, n_iters >= 0.
    Returns (C, labels): C (K, d) after n_iters assign-then-update steps,
    labels (n,) = index of the nearest centroid in C for every point."""`) +
              md`- Nearest means smallest squared distance; ties go to the smaller centroid index (\`argmin\` does this).
- A centroid with no assigned points stays where it is.
- With \`n_iters = 0\`, return the initial centroids and their assignment.
- A Python loop over iterations is fine. Inside one iteration, use array operations only. Do not modify the \`centroids\` argument.`,
            starter: KMEANS_STARTER,
            solution: KMEANS_SOLUTION,
            tests: [
              { expr: `np.round(kmeans(np.array([[0., 0.], [0., 1.], [1., 0.], [9., 9.], [9., 10.], [10., 9.]]), np.array([[0., 0.], [1., 0.]]), 3)[0], 6).tolist()`, label: 'two blobs, 3 iterations: centroids' },
              { expr: `kmeans(np.array([[0., 0.], [0., 1.], [1., 0.], [9., 9.], [9., 10.], [10., 9.]]), np.array([[0., 0.], [1., 0.]]), 3)[1].tolist()`, label: 'two blobs, 3 iterations: labels' },
              { expr: `np.round(kmeans(np.array([[0., 0.], [4., 0.]]), np.array([[1., 0.], [2.5, 0.]]), 0)[0], 6).tolist()`, label: 'n_iters = 0 returns the initial centroids' },
              { expr: `np.round(kmeans(np.array([[0., 0.], [1., 0.], [0., 1.]]), np.array([[0., 0.], [100., 100.]]), 2)[0], 6).tolist()`, label: 'a centroid with no points stays put' },
              { expr: `round(float((lambda X: (lambda C, L: ((X - C[L]) ** 2).sum())(*kmeans(X, X[:3].copy(), 10)))((np.random.seed(1), np.random.randn(30, 2))[1])), 6)`, label: 'inertia after 10 iterations on 30 random points, K = 3' },
            ],
            hints: [
              md`Write a helper \`assign(X, C)\` that builds the \`(n, K)\` squared-distance matrix as in the previous exercise and returns \`D.argmin(axis=1)\`.`,
              md`One-hot encode the labels: \`onehot = np.eye(K)[labels]\` has shape \`(n, K)\`. Then \`onehot.T @ X\` is the \`(K, d)\` matrix of per-cluster sums and \`onehot.sum(axis=0)\` the counts.`,
              md`For empty clusters: \`np.where(counts[:, None] > 0, sums / np.maximum(counts, 1)[:, None], C)\` keeps the old centroid where the count is 0 and avoids dividing by 0.`,
            ],
            mustInclude: ['argmin'],
          },
        },
        {
          kind: 'text',
          md: md`### Linear and logistic regression

Append a column of ones to $X$ so that the intercept becomes one more weight. Least squares then solves the **normal equations** $X\T X\,\btheta = X\T\by$. Call \`np.linalg.solve\` on them, which is cheaper and more accurate than forming the inverse. For gradient descent on the mean squared error $L = \frac1n\lVert X\bw + b - \by\rVert^2$, the gradients are $$\nabla_{\bw} L = \tfrac{2}{n}X\T\br, \qquad \pd{L}{b} = \tfrac{2}{n}\textstyle\sum_i r_i, \qquad \br = X\bw + b - \by.$$

For logistic regression with mean binary cross-entropy, the gradient has the same shape with the sigmoid's output in place of the linear prediction: $$\nabla_{\bw} L = \tfrac1n X\T(\sigma(X\bw + b) - \by), \qquad \pd{L}{b} = \tfrac1n\textstyle\sum_i (\sigma(z_i) - y_i).$$ A quick shape check catches most bugs: $X\T$ is $(d, n)$, the residual is $(n,)$, so the gradient is $(d,)$, the shape of $\bw$.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'code01-ex-linreg',
            title: 'Linear regression two ways',
            prompt:
              md`Implement least-squares linear regression with an intercept.` +
              py(`def fit_closed_form(X, y):
    """X: (n, d), y: (n,) -> (w (d,), b float), solving the normal equations."""

def fit_gd(X, y, lr, n_steps):
    """Gradient descent on (1/n) * ||X w + b - y||^2 from w = 0, b = 0.
    Each step: w -= lr * (2/n) X^T r and b -= lr * (2/n) sum(r), with r = X w + b - y."""`) +
              md`Return \`b\` as a Python \`float\`. The loop over steps is fine; each step must use matrix operations (\`@\`). The starter defines \`X_demo\`, \`y_demo\`, \`X_line\` and \`y_line\` for the tests.`,
            starter: LINREG_STARTER,
            solution: LINREG_SOLUTION,
            tests: [
              { expr: `np.round(fit_closed_form(X_line, y_line)[0], 6).tolist()`, label: 'closed form recovers y = 2x + 1: w' },
              { expr: `round(float(fit_closed_form(X_line, y_line)[1]), 6)`, label: 'closed form recovers y = 2x + 1: b' },
              { expr: `np.round(fit_closed_form(X_demo, y_demo)[0], 6).tolist()`, label: 'closed form on noisy data with 3 features' },
              { expr: `[np.round(fit_gd(X_line, y_line, 0.1, 1)[0], 6).tolist(), round(float(fit_gd(X_line, y_line, 0.1, 1)[1]), 6)]`, label: 'one gradient step from zero' },
              { expr: `np.round(fit_gd(X_demo, y_demo, 0.05, 500)[0], 6).tolist()`, label: '500 steps on the noisy data: w' },
              { expr: `round(float(fit_gd(X_demo, y_demo, 0.05, 500)[1]), 6)`, label: '500 steps on the noisy data: b' },
            ],
            hints: [
              md`\`np.hstack([X, np.ones((n, 1))])\` appends the column of ones. The last entry of the solution is \`b\`.`,
              md`\`np.linalg.solve(Xb.T @ Xb, Xb.T @ y)\` solves $X\T X\btheta = X\T\by$.`,
              md`In the loop, compute the residual vector once, \`r = X @ w + b - y\`, then update both \`w\` and \`b\` from it.`,
            ],
            mustInclude: ['@'],
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'code01-ex-logreg',
            title: 'Logistic regression training loop',
            prompt:
              md`Implement binary logistic regression trained by full-batch gradient descent.` +
              py(`def sigmoid(z): ...

def logreg_loss(X, y, w, b):
    """Mean binary cross-entropy (float). Clip probabilities to [1e-12, 1 - 1e-12] before the log."""

def logreg_fit(X, y, lr, n_epochs):
    """X: (n, d), y: (n,) in {0, 1}. Start from w = 0, b = 0. Each epoch:
    g = sigmoid(X w + b) - y;  w -= lr * X^T g / n;  b -= lr * mean(g).
    Returns (w (d,), b float)."""`) +
              md`The loop over epochs is fine; use \`@\` inside it. The starter defines \`X_demo\` (50 × 2) and \`y_demo\`.`,
            starter: LOGREG_STARTER,
            solution: LOGREG_SOLUTION,
            tests: [
              { expr: `round(float(logreg_loss(X_demo, y_demo, np.zeros(2), 0.0)), 6)`, label: 'loss at w = 0 is ln 2' },
              { expr: `[np.round(logreg_fit(np.array([[1.], [2.]]), np.array([0., 1.]), 1.0, 1)[0], 6).tolist(), round(float(logreg_fit(np.array([[1.], [2.]]), np.array([0., 1.]), 1.0, 1)[1]), 6)]`, label: 'one epoch from zero on two points' },
              { expr: `np.round(logreg_fit(X_demo, y_demo, 0.5, 200)[0], 6).tolist()`, label: '200 epochs: weights' },
              { expr: `round(float(logreg_fit(X_demo, y_demo, 0.5, 200)[1]), 6)`, label: '200 epochs: bias' },
              { expr: `round(float(logreg_loss(X_demo, y_demo, *logreg_fit(X_demo, y_demo, 0.5, 200))), 6)`, label: 'training loss after 200 epochs' },
            ],
            hints: [
              md`At $\bw = \bzero$ every probability is $0.5$, so the loss is $-\ln 0.5 = \ln 2 \approx 0.693147$. Use this to test \`logreg_loss\` first.`,
              md`The gradient of the mean loss with respect to $\bw$ is \`X.T @ (p - y) / n\`, shape \`(d,)\`.`,
              md`Return \`float(b)\` so the bias is a Python number, not a NumPy scalar.`,
            ],
            mustInclude: ['@'],
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'code01-1-paper',
            title: 'k-NN on paper, then at scale',
            type: 'code-on-paper',
            difficulty: 2,
            minutes: 12,
            statement: md`(a) Write \`knn_predict(X_train, y_train, X_test, k)\` on paper, with a shape comment on every line.

(b) Give its time and memory complexity for $n$ training points, $m$ queries and dimension $d$.

(c) With $n = 10^6$, $m = 10^3$ and $d = 128$, how many gigabytes ($10^9$ bytes) does the float64 distance matrix take? Enter the number. What do you change?`,
            hints: [md`The distance matrix is $m \times n$ and each float64 is 8 bytes.`],
            solution: [
              md`(a) One version:` + py(`def knn_predict(X_train, y_train, X_test, k):
    sq_te = (X_test ** 2).sum(axis=1)                 # (m,)
    sq_tr = (X_train ** 2).sum(axis=1)                # (n,)
    D = sq_te[:, None] + sq_tr[None, :] - 2 * X_test @ X_train.T   # (m, n)
    D = np.maximum(D, 0)
    nn = np.argsort(D, axis=1, kind='stable')[:, :k]  # (m, k)
    C = y_train.max() + 1
    return np.eye(C)[y_train[nn]].sum(axis=1).argmax(axis=1)       # (m,)`),
              md`(b) The matrix product costs $O(mnd)$. Sorting each row costs $O(mn\log n)$; \`np.argpartition\` reduces this to $O(mn)$ when only the top $k$ are needed. Memory is $O(mn)$ for $D$, plus $O(nd)$ for the stored training set. There is no training cost: k-NN is "lazy".`,
              md`(c) $m n \times 8 = 10^3 \cdot 10^6 \cdot 8 = 8 \times 10^9$ bytes $= 8$ GB. Process the queries in chunks, for example 100 at a time ($0.8$ GB each), and keep only the top $k$ per chunk.`,
              md`At this scale a production system would also replace exact search with an approximate nearest-neighbour index (IVF, HNSW, product quantization), trading a little recall for orders of magnitude less work per query.`,
            ],
            answer: { kind: 'number', value: 8 },
            rubric: [md`Distance matrix built with the norm identity and clipped`, md`Correct shapes on every line, including \`(m, k)\` neighbours`, md`Time $O(mnd + mn\log n)$ and memory $O(mn)$ stated`, md`Chunking or ANN proposed for the 8 GB case`],
            areas: ['ml-coding'],
          },
        },
        {
          kind: 'recall',
          prompt: md`Without looking back: the five steps of the routine, and the one-line NumPy expression for all pairwise squared distances.`,
          answer: md`Restate inputs and outputs with shapes; work a tiny example; vectorize; test edge cases; narrate complexity. Distances: \`np.maximum((A**2).sum(1)[:, None] + (B**2).sum(1)[None, :] - 2 * A @ B.T, 0)\`.`,
        },
        {
          kind: 'explain',
          prompt: md`You have just written k-means. The interviewer asks: *what does one iteration cost, and what would you change for 100 million points?* Answer as you would out loud.`,
          model: md`One iteration computes an $n \times K$ distance matrix, which is $O(nKd)$ time and $O(nK)$ memory, then an $O(nd)$ update, so $t$ iterations cost $O(tnKd)$. For $10^8$ points I would not hold the full distance matrix: I would process points in chunks and accumulate per-cluster sums and counts, which needs only $O(Kd)$ extra memory. I would likely switch to mini-batch k-means, which updates centroids from small random batches and converges in far fewer passes over the data, initialize with k-means++ on a sample, and, if the data is distributed, compute partial sums per shard and reduce them. Since the result depends on the initialization, I would run a few restarts on a sample and keep the lowest inertia.`,
        },
      ],
      cards: [
        { id: 'code01-1-c1', kind: 'concept', front: md`State the identity used to vectorize pairwise squared distances, and the NumPy shapes that broadcast.`, back: md`$\lVert\ba-\bb\rVert^2 = \lVert\ba\rVert^2 + \lVert\bb\rVert^2 - 2\,\ba\cdot\bb$. Column \`(n, 1)\` + row \`(1, m)\` − \`2 * A @ B.T\` \`(n, m)\`.` },
        { id: 'code01-1-c2', kind: 'cloze', text: md`Before taking the square root of vectorized squared distances, clip them with \`np.{{}}(D, 0)\`.`, answers: ['maximum'] },
        { id: 'code01-1-c3', kind: 'compute', front: md`Memory of a float32 distance matrix for $m = 2000$ queries and $n = 500{,}000$ points, in GB ($10^9$ bytes)?`, answer: { kind: 'number', value: 4 }, back: md`$2000 \cdot 500{,}000 \cdot 4 = 4 \times 10^9$ bytes $= 4$ GB.` },
        { id: 'code01-1-c4', kind: 'concept', front: md`Why does k-means inertia never increase, and what does it converge to?`, back: md`Assignment picks the nearest centroid for each point and the mean minimizes the sum of squared distances to a set, so neither step can raise the inertia. It converges to a local minimum that depends on initialization.` },
        { id: 'code01-1-c5', kind: 'concept', front: md`Gradient of mean binary cross-entropy for logistic regression with respect to $\bw$.`, back: md`$\frac1n X\T(\sigma(X\bw + b) - \by)$, shape $(d,)$.` },
      ],
    },
    // ------------------------------------------------------------------ 2
    {
      id: 'code01-2',
      title: 'Neural network pieces from scratch',
      minutes: 40,
      objectives: [
        'Implement a numerically stable softmax and the mean cross-entropy over a batch.',
        'Write the forward and backward pass of a two-layer ReLU network using shapes to place every transpose.',
        'Check an analytic gradient against central differences and interpret the relative error.',
        'Implement LayerNorm over the last axis and scaled dot-product attention with a causal mask for batched inputs.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`The neural-network version of the coding round asks for one piece of a model: a softmax that does not overflow, a backward pass, a normalization layer, or attention. Each is a few lines of NumPy. The bugs are always the same few: a reduction along the wrong axis, a missing \`keepdims=True\`, an overflow in \`np.exp\`, a transpose in the wrong place. The habits from lesson 1 catch all of them.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Softmax and log-sum-exp',
          md: md`For logits $\bz \in \R^C$, $$\softmax(\bz)_c = \frac{e^{z_c}}{\sum_{j} e^{z_j}}, \qquad \operatorname{LSE}(\bz) = \log \sum_j e^{z_j}.$$ Both are unchanged in a useful way by a shift: $\softmax(\bz - m) = \softmax(\bz)$ and $\operatorname{LSE}(\bz) = m + \operatorname{LSE}(\bz - m)$ for any constant $m$. With $m = \max_j z_j$ every exponent is at most $0$, so nothing overflows and the largest term is exactly $1$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'sd.softmax' },
          task: md`Raise the shift $c$ added to every logit until the naive computation breaks. At what $c$ does it first fail, and what does the stable version print there? Then select a target class and compare the two cross-entropy readouts.`,
          caption: md`Float64 overflows above about $e^{709.78}$. Subtracting the maximum keeps every exponent at or below $0$. The probabilities do not depend on $c$ at all.`,
        },
        {
          kind: 'derive',
          title: 'cross-entropy from logits, and its gradient',
          goal: md`For logits $\bz$ and true class $y$, show that $\ell = -\log\softmax(\bz)_y = \operatorname{LSE}(\bz) - z_y$ and that $\nabla_{\bz}\ell = \bp - \be_y$, where $\bp = \softmax(\bz)$.`,
          steps: [
            { md: md`Take the log of the softmax: $$\log\softmax(\bz)_y = z_y - \log\sum_j e^{z_j} = z_y - \operatorname{LSE}(\bz).$$ So $\ell = \operatorname{LSE}(\bz) - z_y$, which never evaluates $\log 0$.` },
            {
              md: md`Differentiate the LSE term: $$\pd{}{z_c}\log\sum_j e^{z_j} = \frac{e^{z_c}}{\sum_j e^{z_j}} = p_c.$$`,
              choose: {
                prompt: md`What is the derivative of $\log\sum_j e^{z_j}$ with respect to $z_c$?`,
                options: [md`$p_c = \softmax(\bz)_c$`, md`$e^{z_c}$`, md`$1/\sum_j e^{z_j}$`],
                answer: 0,
                explain: md`Chain rule: the derivative of $\log u$ is $u'/u$, and $\partial u/\partial z_c = e^{z_c}$.`,
              },
            },
            { md: md`The term $-z_y$ contributes $-1$ in coordinate $y$ and $0$ elsewhere, that is $-\be_y$. Together $\nabla_{\bz}\ell = \bp - \be_y$. For a batch with the **mean** loss, each row's gradient is divided by $n$: $\frac1n(P - Y)$ with $Y$ one-hot.` },
          ],
          takeaway: md`The gradient of softmax cross-entropy is "predicted minus true". That is why frameworks fuse the two into one operation that takes logits.`,
        },
        {
          kind: 'numeric',
          q: md`Logits $\bz = (\ln 2,\ 0,\ 0)$, true class $y = 0$. Compute the cross-entropy loss.`,
          answer: { kind: 'number', value: Math.log(2) },
          inputHint: 'e.g. ln(2)',
          explain: md`$e^{\bz} = (2, 1, 1)$, so $\softmax(\bz)_0 = 2/4 = 0.5$ and $\ell = -\ln 0.5 = \ln 2 \approx 0.693$.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

def softmax(z):
    z = z - z.max(axis=-1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=-1, keepdims=True)

print(np.round(softmax(np.array([1000.0, 1001.0, 1002.0])), 3))`,
          predict: {
            q: md`Without the max-subtraction, \`np.exp(1000.0)\` is \`inf\`. With it, what is printed?`,
            options: ['`[0.09  0.245 0.665]`', '`[nan nan nan]`', '`[0.333 0.333 0.333]`', '`[0.    0.    1.   ]`'],
            answer: 0,
            explain: md`Subtracting $1002$ gives $(-2, -1, 0)$, and $\softmax(-2, -1, 0) = (0.090, 0.245, 0.665)$: the same as for $(0, 1, 2)$. NumPy pads the columns to equal width.`,
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'code01-ex-softmax',
            title: 'Stable softmax and cross-entropy',
            prompt:
              md`Implement both without Python loops.` +
              py(`def softmax(Z):
    """Z: (n, C) logits -> (n, C) probabilities; must not overflow for logits near 1000."""

def cross_entropy(Z, y):
    """Z: (n, C) logits, y: (n,) int labels -> mean of -log softmax(Z)[i, y[i]] as a float.
    Compute it through log-sum-exp so that it never takes log(0)."""`),
            starter: SOFTMAX_STARTER,
            solution: SOFTMAX_SOLUTION,
            tests: [
              { expr: `np.round(softmax(np.array([[1., 2., 3.], [0., 0., 0.]])), 6).tolist()`, label: 'two small rows' },
              { expr: `np.round(softmax(np.array([[1000., 1001., 1002.]])), 6).tolist()`, label: 'logits near 1000 do not overflow' },
              { expr: `round(float(cross_entropy(np.zeros((4, 3)), np.array([0, 1, 2, 0]))), 6)`, label: 'uniform logits give ln 3' },
              { expr: `round(float(cross_entropy(np.array([[0., 1000.]]), np.array([0]))), 6)`, label: 'confident and wrong: the loss is the logit gap, 1000' },
              { expr: `round(float(cross_entropy(*((np.random.seed(0), (np.random.randn(5, 4) * 3, np.array([0, 3, 1, 1, 2])))[1]))), 6)`, label: 'batch of 5 random rows' },
              { expr: `np.round(softmax((np.random.seed(1), np.random.randn(3, 5) * 50)[1]).sum(axis=1), 6).tolist()`, label: 'rows sum to 1 for large random logits' },
            ],
            hints: [
              md`\`Z.max(axis=1, keepdims=True)\` has shape \`(n, 1)\`, so subtracting it broadcasts across each row. Without \`keepdims\` the shape \`(n,)\` would broadcast against the columns.`,
              md`Log-softmax is \`Zs - np.log(np.exp(Zs).sum(axis=1, keepdims=True))\` with \`Zs\` the shifted logits. Taking \`np.log(softmax(Z))\` fails when a probability underflows to 0.`,
              md`Pick each row's true-class entry with \`log_p[np.arange(n), y]\`.`,
            ],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'text',
          md: md`### A two-layer network, forward and backward

For $X \in \R^{n\times D}$, a hidden layer of width $H$ and $C$ classes:

| forward | shape | backward | shape |
|---|---|---|---|
| $Z_1 = XW_1 + \bb_1$ | $(n, H)$ | $dZ_2 = \frac1n(P - Y)$ | $(n, C)$ |
| $A_1 = \relu(Z_1)$ | $(n, H)$ | $dW_2 = A_1\T dZ_2$, $d\bb_2 = \sum_i dZ_2$ | $(H, C)$, $(C,)$ |
| $Z_2 = A_1W_2 + \bb_2$ | $(n, C)$ | $dA_1 = dZ_2 W_2\T$ | $(n, H)$ |
| $P = \softmax(Z_2)$ | $(n, C)$ | $dZ_1 = dA_1 \odot \mathbb{1}[Z_1 > 0]$ | $(n, H)$ |
| $L = -\frac1n\sum_i \log P_{i, y_i}$ | scalar | $dW_1 = X\T dZ_1$, $d\bb_1 = \sum_i dZ_1$ | $(D, H)$, $(H,)$ |

Here $dW$ means $\partial L/\partial W$. A bias that was broadcast over the batch in the forward pass has its gradient **summed** over the batch in the backward pass.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          title: 'Let the shapes write the backward pass',
          md: md`A gradient always has the shape of the thing it is the gradient of. For $Z = AW$, $dW$ must be $(H, C)$, built from $A$ $(n, H)$ and $dZ$ $(n, C)$. The only product with that shape is $A\T dZ$. Likewise $dA$ must be $(n, H)$, so it is $dZ\,W\T$. You rarely need to re-derive matrix calculus in an interview: write the shapes and there is one way to multiply them.`,
        },
        {
          kind: 'check',
          q: md`In the network above, $X$ is $(32, 784)$ and $W_1$ is $(784, 128)$. Which expression gives $dW_1$?`,
          options: [md`\`X.T @ dZ1\`, shape (784, 128)`, md`\`dZ1 @ X.T\`, shape (32, 32)`, md`\`X @ dZ1.T\`, shape (32, 32)`, md`\`dZ1.T @ X\`, shape (128, 784)`],
          answer: 0,
          explain: md`$dZ_1$ is $(32, 128)$. To get $W_1$'s shape $(784, 128)$ from $X$ $(32, 784)$ and $dZ_1$ $(32, 128)$, contract over the batch axis: $X\T dZ_1$. The last option has the right numbers but is the transpose.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'code01-ex-mlp',
            title: 'Two-layer MLP: forward and backward',
            prompt:
              md`Implement the forward pass, the mean softmax cross-entropy loss, and all four gradients, with no Python loops.` +
              py(`def mlp_loss_grads(X, y, W1, b1, W2, b2):
    """X: (n, D), y: (n,) ints, W1: (D, H), b1: (H,), W2: (H, C), b2: (C,).
    Hidden layer: ReLU. Output: softmax with mean cross-entropy.
    Returns (loss as float, {'W1': dW1, 'b1': db1, 'W2': dW2, 'b2': db2})."""`) +
              md`The starter defines \`X\`, \`y\`, \`W1\`, \`b1\`, \`W2\`, \`b2\` for the tests. In the next exercise you will check these gradients numerically.`,
            starter: MLP_STARTER,
            solution: MLP_SOLUTION,
            tests: [
              { expr: `round(float(mlp_loss_grads(X, y, W1, b1, W2, b2)[0]), 6)`, label: 'loss' },
              { expr: `np.round(mlp_loss_grads(X, y, W1, b1, W2, b2)[1]['W2'], 6).tolist()`, label: 'dW2' },
              { expr: `np.round(mlp_loss_grads(X, y, W1, b1, W2, b2)[1]['b2'], 6).tolist()`, label: 'db2' },
              { expr: `np.round(mlp_loss_grads(X, y, W1, b1, W2, b2)[1]['W1'], 6).tolist()`, label: 'dW1' },
              { expr: `np.round(mlp_loss_grads(X, y, W1, b1, W2, b2)[1]['b1'], 6).tolist()`, label: 'db1' },
            ],
            hints: [
              md`Start with \`dZ2 = P.copy(); dZ2[np.arange(n), y] -= 1; dZ2 /= n\`. This is $\frac1n(P - Y)$ without building $Y$.`,
              md`Use the shape rule for each product: \`dW2 = A1.T @ dZ2\`, \`dA1 = dZ2 @ W2.T\`, \`dW1 = X.T @ dZ1\`.`,
              md`The ReLU backward is a mask: \`dZ1 = dA1 * (Z1 > 0)\`. Bias gradients are sums over axis 0.`,
            ],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'text',
          md: md`### Checking a gradient numerically

The **central difference** $$\frac{f(x + h) - f(x - h)}{2h} = f'(x) + \tfrac{h^2}{6}f'''(x) + O(h^4)$$ has truncation error of order $h^2$, against order $h$ for the one-sided difference. A smaller $h$ is not always better: $f(x \pm h)$ are each rounded to about $\varepsilon\,|f|$ with $\varepsilon \approx 2.2 \times 10^{-16}$ in float64, and dividing by $2h$ amplifies that to about $\varepsilon |f| / h$. The total error is smallest near $h \approx 10^{-5}$ for central differences.

Compare analytic and numerical gradients with the **relative error** $\max_i |a_i - b_i| / (|a_i| + |b_i|)$. In float64, values around $10^{-7}$ or below indicate a correct gradient; values around $10^{-2}$ or above indicate a bug. Use float64, check a few random entries of each parameter for large models, and expect occasional mismatches exactly at a ReLU kink, where the function is not differentiable.`,
        },
        {
          kind: 'viz',
          viz: { type: 'sd.gradcheck' },
          task: md`Sweep $h$ from large to small for both formulas. Find the $h$ with the lowest error for each, and read off how low each one gets.`,
          caption: md`Right of the minimum, truncation error dominates (slope 1 for the forward difference, slope 2 for the central one on log axes). Left of it, round-off dominates and the error grows like $1/h$. The figure computes in float64, like NumPy.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'code01-ex-gradcheck',
            title: 'Numerical gradient check',
            prompt:
              md`Write a gradient checker. A loop over the entries of the parameter is expected here.` +
              py(`def numerical_grad(f, P, h=1e-5):
    """f: function taking an array shaped like P and returning a float.
    Returns G with G.shape == P.shape and G[i] = (f(P + h e_i) - f(P - h e_i)) / (2 * h).
    Do not modify P."""

def rel_error(A, B):
    """max over entries of |A - B| / max(|A| + |B|, 1e-12), as a float."""`) +
              md`The starter defines a softmax-regression loss \`loss_and_grad(W)\` with a correct analytic gradient, a \`buggy_grad(W)\` that forgets to divide by $n$, and a starting point \`W0\`.`,
            starter: GC_STARTER,
            solution: GC_SOLUTION,
            tests: [
              { expr: `np.round(numerical_grad(lambda p: float((p ** 2).sum()), np.array([1., 2., 3.])), 6).tolist()`, label: 'gradient of sum of squares at (1, 2, 3)' },
              { expr: `numerical_grad(lambda p: float((p ** 3).sum()), np.ones((2, 3))).shape`, label: 'keeps the shape of a matrix parameter' },
              { expr: `float(rel_error(np.array([1., -2.]), np.array([1., -2.])))`, label: 'relative error of identical arrays is 0' },
              { expr: `np.round(numerical_grad(lambda W: loss_and_grad(W)[0], W0), 6).tolist()`, label: 'numerical gradient of the softmax-regression loss' },
              { expr: `bool(rel_error(numerical_grad(lambda W: loss_and_grad(W)[0], W0), loss_and_grad(W0)[1]) < 1e-7)`, label: 'the correct gradient passes the check' },
              { expr: `bool(rel_error(numerical_grad(lambda W: loss_and_grad(W)[0], W0), buggy_grad(W0)) > 0.5)`, label: 'the buggy gradient fails it' },
            ],
            hints: [
              md`Build the nudge as a flat vector and reshape it: \`E = np.zeros(P.size); E[i] = h; E = E.reshape(P.shape)\`. Then \`f(P + E)\` leaves \`P\` unchanged.`,
              md`Collect the results in a flat \`G = np.zeros(P.size)\` and return \`G.reshape(P.shape)\`.`,
              md`For \`rel_error\`, \`np.maximum(np.abs(A) + np.abs(B), 1e-12)\` avoids dividing by zero where both entries are 0. Wrap the result in \`float(...)\`.`,
            ],
            mustInclude: ['2 * h'],
          },
        },
        {
          kind: 'text',
          md: md`### LayerNorm

LayerNorm normalizes each example's feature vector, the last axis, to zero mean and unit variance, then applies a learned per-feature scale $\boldsymbol\gamma$ and shift $\boldsymbol\beta$: $$\operatorname{LN}(\bx) = \boldsymbol\gamma \odot \frac{\bx - \mu}{\sqrt{\sigma^2 + \epsilon}} + \boldsymbol\beta, \qquad \mu = \tfrac1D\textstyle\sum_k x_k,\ \ \sigma^2 = \tfrac1D\sum_k (x_k - \mu)^2.$$ The statistics are per token, so the same code works for an input of shape $(B, T, D)$ by reducing over \`axis=-1\` with \`keepdims=True\`. The variance is the biased one (divide by $D$), which is NumPy's default. Many current LLMs use RMSNorm instead, which drops the mean subtraction and $\boldsymbol\beta$ and divides by $\sqrt{\frac1D\sum_k x_k^2 + \epsilon}$.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'code01-ex-layernorm',
            title: 'LayerNorm forward',
            prompt:
              md`Implement LayerNorm over the last axis for inputs of any number of leading dimensions, with no Python loops.` +
              py(`def layernorm(X, gamma, beta, eps=1e-5):
    """X: (..., D), gamma: (D,), beta: (D,) -> array with the shape of X.
    Use the biased variance (divide by D) and put eps inside the square root."""`),
            starter: LN_STARTER,
            solution: LN_SOLUTION,
            tests: [
              { expr: `np.round(layernorm(np.array([[1., 2., 3., 4.]]), np.ones(4), np.zeros(4)), 6).tolist()`, label: 'one row, no scale or shift' },
              { expr: `np.round(layernorm(np.array([[1., 2., 3., 4.], [2., 2., 2., 6.]]), np.array([1., 2., 1., 0.5]), np.array([0., 0., 1., -1.])), 6).tolist()`, label: 'gamma and beta act per feature' },
              { expr: `layernorm(np.ones((2, 3, 4)), np.ones(4), np.zeros(4)).shape`, label: 'a (2, 3, 4) input keeps its shape' },
              { expr: `np.round(layernorm(np.full((1, 3), 7.), np.ones(3), np.array([0.5, 0., -0.5])), 6).tolist()`, label: 'a constant row maps to beta (eps prevents 0/0)' },
              { expr: `np.round(layernorm((np.random.seed(0), np.random.randn(2, 3, 5) * 4 + 10)[1], np.ones(5), np.zeros(5)).std(axis=-1), 6).tolist()`, label: 'every row of a 3-D batch ends with standard deviation about 1' },
            ],
            hints: [
              md`\`X.mean(axis=-1, keepdims=True)\` has shape \`(..., 1)\` and broadcasts back against \`X\`.`,
              md`\`gamma\` has shape \`(D,)\`, which broadcasts against the last axis of any \`(..., D)\` array. No reshaping is needed.`,
            ],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'text',
          md: md`### Scaled dot-product attention

$$\operatorname{Attn}(Q, K, V) = \softmax\!\left(\frac{QK\T}{\sqrt{d}} + M\right)V, \qquad Q \in \R^{T\times d},\ K \in \R^{S\times d},\ V \in \R^{S\times d_v}.$$ Row $t$ of the softmax is a probability distribution over the $S$ keys, and output row $t$ is the corresponding weighted average of the rows of $V$. Dividing by $\sqrt d$ keeps the scores at unit scale when $Q$ and $K$ have unit-variance entries. In a decoder, the **causal mask** $M$ sets $M_{ts} = -\infty$ for $s > t$, so position $t$ cannot see the future; $e^{-\infty} = 0$ removes those keys from the softmax.

With batch and heads the inputs are $(B, H, T, d)$. The \`@\` operator multiplies the last two axes and broadcasts the rest, and \`np.swapaxes(K, -1, -2)\` transposes only the last two axes. Time is $O(T S d)$ and the score matrix needs $O(TS)$ memory per head, which is why long contexts use fused kernels such as FlashAttention that never store the full matrix.`,
        },
        {
          kind: 'viz',
          viz: { type: 'sd.attention' },
          task: md`Turn the causal mask on and click each query row: how many keys can row 1 attend to, and what is its output? Then raise the score scale and watch each row of weights approach a one-hot vector.`,
          caption: md`Masked entries (above the diagonal) get weight exactly $0$. Row 1 can only attend to itself, so its output is $\bv_1$. Larger scores make the softmax sharper, which is what the $1/\sqrt d$ factor prevents as $d$ grows.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'code01-ex-attention',
            title: 'Attention with a causal mask',
            prompt:
              md`Implement scaled dot-product attention for any number of leading (batch, head) dimensions, with no Python loops.` +
              py(`def attention(Q, K, V, causal=False):
    """Q: (..., T, d), K: (..., S, d), V: (..., S, dv) -> (..., T, dv).
    Scores Q K^T / sqrt(d); softmax over the key axis.
    causal=True (T == S): position t may only attend to keys s <= t."""`) +
              md`Use a numerically stable softmax. The starter defines \`Qr\`, \`Kr\`, \`Vr\` of shapes \`(2, 4, 3)\`, \`(2, 4, 3)\`, \`(2, 4, 2)\`.`,
            starter: ATT_STARTER,
            solution: ATT_SOLUTION,
            tests: [
              { expr: `np.round(attention(np.array([[1., 0.], [0., 1.]]), np.array([[1., 0.], [0., 1.]]), np.array([[1., 2.], [3., 4.]])), 6).tolist()`, label: '2 queries, 2 keys, no mask' },
              { expr: `np.round(attention(np.array([[1., 0.], [0., 1.]]), np.array([[1., 0.], [0., 1.]]), np.array([[1., 2.], [3., 4.]]), causal=True), 6).tolist()`, label: 'causal: the first query sees only the first key' },
              { expr: `attention(np.ones((2, 4, 5, 8)), np.ones((2, 4, 5, 8)), np.ones((2, 4, 5, 3)), causal=True).shape`, label: 'batch 2, 4 heads: shape (2, 4, 5, 3)' },
              { expr: `np.round(attention(Qr * 300, Kr, Vr), 6).tolist()`, label: 'very large scores stay finite' },
              { expr: `np.round(attention(Qr, Kr, Vr, causal=True), 6).tolist()`, label: 'batched causal attention on random inputs' },
            ],
            hints: [
              md`\`Q @ np.swapaxes(K, -1, -2)\` has shape \`(..., T, S)\`. Divide by \`np.sqrt(d)\` with \`d = Q.shape[-1]\`.`,
              md`\`np.triu(np.ones((T, S), dtype=bool), k=1)\` is True strictly above the diagonal. \`np.where(mask, -np.inf, scores)\` applies it, broadcasting over the batch axes.`,
              md`Subtract the row maximum before \`np.exp\`. Each causal row keeps at least its diagonal entry, so the maximum is finite and \`exp(-inf)\` becomes exactly 0.`,
            ],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'code01-2-paper',
            title: 'Attention on paper, and its memory',
            type: 'code-on-paper',
            difficulty: 2,
            minutes: 12,
            statement: md`(a) Write causal multi-head attention for $X \in \R^{B\times T\times D}$ on paper: project with $W_Q, W_K, W_V, W_O \in \R^{D\times D}$, split into $H$ heads of size $d = D/H$, attend, merge heads, project. Annotate every shape.

(b) For $B = 1$, $H = 32$ heads and $T = 4096$, how much memory does the float32 score tensor $(B, H, T, T)$ take, in GiB ($2^{30}$ bytes)? Enter the number.`,
            hints: [md`Splitting heads is a reshape \`(B, T, H, d)\` followed by swapping the $T$ and $H$ axes.`, md`$4096 = 2^{12}$.`],
            solution: [
              md`(a)` + py(`def mha(X, Wq, Wk, Wv, Wo, H):
    B, T, D = X.shape
    d = D // H
    def split(M):                                   # (B, T, D) -> (B, H, T, d)
        return M.reshape(B, T, H, d).swapaxes(1, 2)
    Q, K, V = split(X @ Wq), split(X @ Wk), split(X @ Wv)
    S = Q @ K.swapaxes(-1, -2) / np.sqrt(d)         # (B, H, T, T)
    S = np.where(np.triu(np.ones((T, T), dtype=bool), k=1), -np.inf, S)
    S = S - S.max(axis=-1, keepdims=True)
    A = np.exp(S); A = A / A.sum(axis=-1, keepdims=True)
    O = A @ V                                       # (B, H, T, d)
    O = O.swapaxes(1, 2).reshape(B, T, D)           # merge heads
    return O @ Wo                                   # (B, T, D)`),
              md`Time: the four projections cost $O(BTD^2)$ and the two attention products $O(BT^2D)$ in total over heads. Memory for scores: $O(BHT^2)$.`,
              md`(b) $1 \cdot 32 \cdot 4096^2 \cdot 4 = 2^5 \cdot 2^{24} \cdot 2^2 = 2^{31}$ bytes $= 2$ GiB, for a single layer and a single sequence.`,
              md`This quadratic memory is what FlashAttention avoids: it computes the softmax block by block with a running maximum and sum, so the $T \times T$ matrix is never stored.`,
            ],
            answer: { kind: 'number', value: 2 },
            rubric: [md`Head split and merge written as reshape plus axis swap, with shapes`, md`Scaling by $\sqrt{d}$ with $d$ the head dimension, not $D$`, md`Causal mask and stable softmax over the last axis`, md`Memory computed as $BHT^2 \times 4$ bytes $= 2$ GiB`],
            areas: ['ml-coding', 'llm'],
          },
        },
        {
          kind: 'recall',
          prompt: md`Without looking back: the gradient of mean softmax cross-entropy with respect to the logits, the backward rule for $Z = AW$, and the typical relative error of a correct gradient check in float64.`,
          answer: md`$\frac1n(P - Y)$. $dW = A\T dZ$ and $dA = dZ\,W\T$ (a broadcast bias gets the sum of $dZ$ over the batch). A correct gradient gives about $10^{-7}$ or less with central differences and $h \approx 10^{-5}$.`,
        },
        {
          kind: 'explain',
          prompt: md`Your gradient check on a new layer reports a relative error of $3 \times 10^{-2}$ for one parameter and $10^{-9}$ for the others. Talk through how you would find the bug.`,
          model: md`The other parameters pass, so the forward pass and the loss are probably right and the bug is local to that parameter's backward expression. I would first confirm the check itself: float64, central differences, $h = 10^{-5}$, and no ReLU input sitting exactly at 0. Then I would compare shapes and look for the usual suspects: a missing sum over the batch for a broadcast parameter, a missing $1/n$ from the mean, or a transpose that happens to have the right shape because the matrix is square. A ratio of analytic to numerical gradient that is constant across entries points to a scale factor such as $n$; a ratio that varies points to a wrong product. Finally I would shrink the problem, one example and tiny dimensions, until I can compute the expected gradient by hand.`,
        },
      ],
      cards: [
        { id: 'code01-2-c1', kind: 'concept', front: md`Why subtract the row maximum before \`np.exp\` in softmax, and why is it allowed?`, back: md`$\softmax(\bz - m) = \softmax(\bz)$ for any constant $m$, and with $m = \max\bz$ every exponent is $\le 0$, so \`exp\` cannot overflow.` },
        { id: 'code01-2-c2', kind: 'cloze', text: md`The gradient of mean softmax cross-entropy with respect to the logits is $\frac1n(P - $ {{}} $)$, where that matrix is the one-hot labels.`, answers: ['Y'] },
        { id: 'code01-2-c3', kind: 'compute', front: md`$X$ is $(64, 300)$ and $W$ is $(300, 50)$ in $Z = XW$. How many entries does $dW$ have?`, answer: { kind: 'number', value: 15000 }, back: md`$dW$ has $W$'s shape $(300, 50)$: $15{,}000$ entries, computed as $X\T dZ$.` },
        { id: 'code01-2-c4', kind: 'concept', front: md`Why is $h$ around $10^{-5}$ used for central-difference gradient checks in float64?`, back: md`Truncation error is $O(h^2)$ and round-off error is $O(\varepsilon/h)$ with $\varepsilon \approx 2\times10^{-16}$. Their sum is smallest near $h \approx \varepsilon^{1/3} \approx 10^{-5}$.` },
        { id: 'code01-2-c5', kind: 'concept', front: md`How do you implement a causal mask in NumPy attention?`, back: md`\`np.where(np.triu(np.ones((T, T), dtype=bool), k=1), -np.inf, scores)\`, then a max-subtracted softmax over the last axis; masked weights become exactly 0.` },
      ],
    },
    // ------------------------------------------------------------------ 3
    {
      id: 'code01-3',
      title: 'Evaluation and data utilities',
      minutes: 35,
      objectives: [
        'Split data and standardize features using training statistics only.',
        'Compute a confusion matrix, precision, recall and F1, including the zero-division cases.',
        'Compute ROC-AUC from ranks with ties and explain why it equals the probability that a random positive outscores a random negative.',
        'Retrieve the top-k documents by cosine similarity and build stratified k-fold assignments.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Metrics and data utilities appear as warm-up questions and inside larger ones ("train this model, then evaluate it"). They look easy, and the bugs they hide are expensive: a scaler fitted on the full dataset inflates every reported number, an AUC that mishandles ties shifts a model comparison, a fold without positives makes recall undefined. The goal is code that is right on the edge cases.`,
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'Leakage through preprocessing',
          md: md`Any statistic computed from data (a mean, a standard deviation, a vocabulary, a target encoding, a PCA basis) must be **fitted on the training split only** and then applied unchanged to validation and test data. Inside cross-validation, it must be refitted inside each fold. Otherwise information from the evaluation data reaches the model and the evaluation is optimistic.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'code01-ex-split',
            title: 'Train/test split and leakage-free standardization',
            prompt:
              md`Implement both functions with no Python loops.` +
              py(`def train_test_split(n, n_test, seed):
    """Call np.random.seed(seed), then perm = np.random.permutation(n).
    The first n_test entries of perm are the test indices, the rest the training indices.
    Returns (train_idx, test_idx)."""

def standardize(X_train, X_test):
    """Scale both with the per-column mean and standard deviation (ddof=0) of X_train only.
    A column with zero training std is divided by 1 instead.
    Returns (X_train_scaled, X_test_scaled)."""`),
            starter: SPLIT_STARTER,
            solution: SPLIT_SOLUTION,
            tests: [
              { expr: `[a.tolist() for a in train_test_split(10, 3, 0)]`, label: 'indices for n = 10, n_test = 3, seed 0' },
              { expr: `sorted(np.concatenate(train_test_split(12, 4, 7)).tolist()) == list(range(12))`, label: 'train and test are disjoint and cover every index' },
              { expr: `np.round(standardize(np.array([[0., 10.], [2., 10.], [4., 10.]]), np.array([[6., 10.], [2., 12.]]))[1], 6).tolist()`, label: 'test rows use the training mean and std' },
              { expr: `np.round(standardize(np.array([[0., 10.], [2., 10.], [4., 10.]]), np.array([[6., 10.], [2., 12.]]))[0], 6).tolist()`, label: 'a constant training column becomes 0, not nan' },
              { expr: `np.round(standardize(*((np.random.seed(1), (np.random.randn(8, 3) * 5 + 2, np.random.randn(4, 3) * 5 + 20))[1]))[1], 6).tolist()`, label: 'shifted test data stays shifted after scaling' },
            ],
            hints: [
              md`\`X_train.mean(axis=0)\` and \`X_train.std(axis=0)\` both have shape \`(d,)\` and broadcast over the rows of either matrix.`,
              md`\`np.where(sd == 0, 1.0, sd)\` replaces zero standard deviations.`,
            ],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'text',
          md: md`### Confusion matrix, precision, recall, F1

For a binary classifier, $\text{precision} = \frac{TP}{TP + FP}$ (of the predicted positives, how many are right), $\text{recall} = \frac{TP}{TP + FN}$ (of the actual positives, how many were found) and $F_1 = \frac{2PR}{P + R} = \frac{2\,TP}{2\,TP + FP + FN}$. When a denominator is $0$, for example a model that predicts no positives, the convention in most libraries is to report $0$ (scikit-learn also warns). A multiclass confusion matrix with rows for the true class and columns for the predicted class can be built in one call: encode each pair as the integer \`true * C + pred\` and count with \`np.bincount\`.`,
        },
        {
          kind: 'numeric',
          q: md`A fraud model on 1000 transactions has $TP = 40$, $FP = 10$, $FN = 20$, $TN = 930$. Enter precision, recall and $F_1$.`,
          answer: { kind: 'vector', value: [0.8, 2 / 3, 8 / 11] },
          inputHint: 'three numbers, fractions allowed',
          explain: md`$P = 40/50 = 0.8$, $R = 40/60 = 2/3$, $F_1 = 80/(80 + 10 + 20) = 8/11 \approx 0.727$. Accuracy would be $970/1000 = 0.97$, which says little when only 6% of transactions are fraud.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'code01-ex-prf',
            title: 'Confusion matrix and precision / recall / F1',
            prompt:
              md`Implement both without Python loops.` +
              py(`def confusion_matrix(y_true, y_pred, n_classes):
    """int arrays of shape (n,) with values in 0..n_classes-1 ->
    (n_classes, n_classes) int array; entry [i, j] counts true class i predicted as j."""

def precision_recall_f1(y_true, y_pred):
    """binary 0/1 arrays -> (precision, recall, f1) as floats; any 0/0 counts as 0.0."""`),
            starter: PRF_STARTER,
            solution: PRF_SOLUTION,
            tests: [
              { expr: `confusion_matrix(np.array([1, 0, 1, 1, 0, 0, 1]), np.array([1, 0, 0, 1, 1, 0, 1]), 2).tolist()`, label: 'binary confusion matrix' },
              { expr: `confusion_matrix(np.array([0, 1, 2, 2, 1, 0]), np.array([0, 2, 2, 2, 0, 0]), 3).tolist()`, label: '3 classes, class 1 never predicted' },
              { expr: `[round(float(v), 6) for v in precision_recall_f1(np.array([1, 0, 1, 1, 0, 0, 1]), np.array([1, 0, 0, 1, 1, 1, 1]))]`, label: 'precision 0.6, recall 0.75' },
              { expr: `[round(float(v), 6) for v in precision_recall_f1(np.array([1, 0, 1, 0]), np.array([0, 0, 0, 0]))]`, label: 'no predicted positives: all three are 0' },
              { expr: `[round(float(v), 6) for v in precision_recall_f1(np.array([1, 0, 1, 0]), np.array([1, 0, 1, 0]))]`, label: 'perfect predictions' },
            ],
            hints: [
              md`Boolean masks combine with \`&\`: \`((y_pred == 1) & (y_true == 1)).sum()\` is $TP$.`,
              md`\`np.bincount(y_true * C + y_pred, minlength=C * C).reshape(C, C)\` builds the whole matrix. \`minlength\` keeps trailing zero counts.`,
            ],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'AUC as a ranking probability',
          md: md`For scores from $n_+$ positives and $n_-$ negatives, the area under the ROC curve equals $$\text{AUC} = \P(s_+ > s_-) + \tfrac12\P(s_+ = s_-),$$ for a random positive and a random negative. With $R_+$ the sum of the positives' ranks among all $n$ scores (rank 1 = smallest, ties given their average rank), $$\text{AUC} = \frac{R_+ - n_+(n_+ + 1)/2}{n_+\,n_-}.$$ This is the Mann–Whitney $U$ statistic divided by the number of pairs. Sorting costs $O(n\log n)$, against $O(n_+ n_-)$ for comparing all pairs.`,
        },
        {
          kind: 'viz',
          viz: { type: 'sd.roc' },
          task: md`Drag the threshold and watch the point move along the ROC curve. Then drag one positive score below a negative one: the AUC drops by exactly $1/(n_+ n_-)$ for each pair whose order flips, while the threshold does not change the AUC at all.`,
          caption: md`The ROC curve traces (FPR, TPR) over all thresholds. Its area depends only on the order of the scores: the fraction of positive–negative pairs that are ordered correctly.`,
        },
        {
          kind: 'derive',
          title: 'from ranks to pair counts',
          goal: md`Show that $R_+ - n_+(n_+ + 1)/2$ counts the pairs (positive, negative) in which the positive has the higher score, assuming no ties.`,
          steps: [
            { md: md`Sort all scores in increasing order. The rank of a positive $p$ is $1$ plus the number of scores below it: $$r_p = 1 + \#\{\text{negatives below } p\} + \#\{\text{positives below } p\}.$$` },
            {
              md: md`Sum over all positives. The positives-below-$p$ counts add up to $0 + 1 + \dots + (n_+ - 1) = \frac{n_+(n_+ - 1)}{2}$, because the lowest positive has none below it, the next has one, and so on.`,
              choose: {
                prompt: md`What is $\sum_p \#\{\text{positives below } p\}$?`,
                options: [md`$0 + 1 + \dots + (n_+ - 1) = n_+(n_+ - 1)/2$`, md`$n_+^2$`, md`$n_+ n_-$`],
                answer: 0,
                explain: md`List the positives from lowest to highest: the $k$-th one has exactly $k - 1$ positives below it.`,
              },
            },
            { md: md`So $R_+ = n_+ + \frac{n_+(n_+ - 1)}{2} + U$, where $U$ is the number of correctly ordered pairs. Since $n_+ + \frac{n_+(n_+-1)}{2} = \frac{n_+(n_+ + 1)}{2}$, we get $U = R_+ - \frac{n_+(n_+ + 1)}{2}$, and $\text{AUC} = U/(n_+ n_-)$.` },
            { md: md`With ties, average ranks give each tied positive–negative pair exactly half a count, matching the $\frac12\P(s_+ = s_-)$ term.` },
          ],
          takeaway: md`AUC is threshold-free and invariant to any strictly increasing transformation of the scores. It measures ranking quality, not calibration.`,
        },
        {
          kind: 'numeric',
          q: md`Positives score $0.9, 0.6, 0.4$ and negatives score $0.8, 0.5, 0.3$. Compute the AUC.`,
          answer: { kind: 'number', value: 2 / 3 },
          explain: md`Pairs won: $0.9$ beats all three negatives (3), $0.6$ beats $0.5$ and $0.3$ (2), $0.4$ beats $0.3$ (1). That is $6$ of $9$ pairs, $\text{AUC} = 2/3$. By ranks: the positives have ranks $2, 4, 6$, so $R_+ = 12$ and $(12 - 6)/9 = 2/3$.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(0)
y = (np.random.rand(400) < 0.3).astype(int)          # about 30% positives
s = np.random.randn(400) + 1.0 * y                   # positives score higher on average

# rank formulation: O(n log n)
u, inv, counts = np.unique(s, return_inverse=True, return_counts=True)
ranks = (np.cumsum(counts) - (counts - 1) / 2)[inv]
n_pos = int(y.sum()); n_neg = len(y) - n_pos
auc_rank = (ranks[y == 1].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg)

# pair formulation: O(n_pos * n_neg) memory and time
diff = s[y == 1][:, None] - s[y == 0][None, :]
auc_pairs = ((diff > 0).sum() + 0.5 * (diff == 0).sum()) / diff.size

print(n_pos, n_neg)
print(round(float(auc_rank), 6), round(float(auc_pairs), 6))`,
          note: md`\`np.unique\` returns the sorted distinct scores, each score's position in that list (\`inv\`), and how many times each occurs. A group of $c$ tied scores ending at position $\text{cumsum}$ occupies ranks $\text{cumsum} - c + 1, \dots, \text{cumsum}$, whose average is $\text{cumsum} - (c - 1)/2$.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'code01-ex-auc',
            title: 'ROC-AUC from ranks',
            prompt:
              md`Implement AUC with the rank formula, handling ties with average ranks, and no Python loops.` +
              py(`def roc_auc(y_true, scores):
    """y_true: (n,) 0/1 with at least one of each, scores: (n,) floats -> AUC as a float.
    A tied positive-negative pair counts one half."""`),
            starter: AUC_STARTER,
            solution: AUC_SOLUTION,
            tests: [
              { expr: `float(roc_auc(np.array([0, 0, 1, 1]), np.array([0.1, 0.2, 0.8, 0.9])))`, label: 'perfect ranking' },
              { expr: `float(roc_auc(np.array([1, 1, 0, 0]), np.array([0.1, 0.2, 0.8, 0.9])))`, label: 'reversed ranking' },
              { expr: `float(roc_auc(np.array([1, 0, 1, 0]), np.array([0.5, 0.5, 0.5, 0.5])))`, label: 'all scores tied' },
              { expr: `round(float(roc_auc(np.array([1, 0, 1, 0, 1]), np.array([0.9, 0.8, 0.4, 0.3, 0.6]))), 6)`, label: '4 of 6 pairs correct' },
              { expr: `round(float(roc_auc(np.array([1, 0, 1, 0]), np.array([0.5, 0.5, 0.7, 0.2]))), 6)`, label: 'one tied pair counts one half' },
              { expr: `round(float(roc_auc(*((np.random.seed(3), (lambda y: (y, np.round(np.random.rand(200) + 0.3 * y, 1)))((np.random.rand(200) < 0.4).astype(int)))[1]))), 6)`, label: '200 scores rounded to one decimal (many ties)' },
            ],
            hints: [
              md`\`u, inv, counts = np.unique(scores, return_inverse=True, return_counts=True)\` gives the distinct values, each score's group index and each group's size.`,
              md`The average 1-based rank of group $g$ is \`np.cumsum(counts)[g] - (counts[g] - 1) / 2\`. Index that array with \`inv\` to get every score's rank.`,
              md`Then apply $\text{AUC} = (R_+ - n_+(n_+ + 1)/2)/(n_+ n_-)$ and return a \`float\`.`,
            ],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'text',
          md: md`### Top-k retrieval and stratified folds

**Top-k by cosine similarity** is the core of embedding search: normalize the query rows and the document rows to unit length, take one matrix product to get all similarities, and sort each row. Guard against zero vectors by dividing by $\max(\lVert\bx\rVert, 10^{-12})$, which gives them similarity $0$. For large $n$, \`np.argpartition\` finds the top $k$ in $O(n)$ per query before sorting only those $k$.

**Stratified k-fold** makes each fold's class proportions match the full dataset. With 5% positives and plain contiguous folds, one fold can easily receive almost none, and its recall is then noise or undefined. The simplest stratified scheme deals each class's indices round-robin to folds $0, 1, \dots, k-1, 0, 1, \dots$, optionally after shuffling within the class.`,
        },
        {
          kind: 'viz',
          viz: { type: 'sd.kfold' },
          task: md`Switch between plain and stratified folds and compare the positive share per fold. With plain folds, find a $k$ for which one fold gets no positives at all.`,
          caption: md`Each row is one fold used as the test set; each square is a sample, coloured by class. Stratified folds keep the positive share within one sample of the overall rate.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'code01-ex-topk',
            title: 'Top-k retrieval by cosine similarity',
            prompt:
              md`Implement top-k retrieval with no Python loops.` +
              py(`def topk_cosine(Q, D, k):
    """Q: (q, d) queries, D: (n, d) documents, 1 <= k <= n -> (q, k) int indices,
    most similar first. Ties go to the smaller document index.
    A zero vector has similarity 0 with everything (divide by max(norm, 1e-12))."""`) +
              md`The starter defines \`Q_demo\` (3 × 5) and \`D_demo\` (12 × 5).`,
            starter: TOPK_STARTER,
            solution: TOPK_SOLUTION,
            tests: [
              { expr: `topk_cosine(np.array([[1., 0.], [0., 1.]]), np.array([[1., 1.], [0., 3.], [-1., 0.], [2., 0.1]]), 2).tolist()`, label: 'two queries in 2-D' },
              { expr: `topk_cosine(np.array([[1., 0.]]), np.array([[2., 0.], [1., 0.], [0., 1.]]), 2).tolist()`, label: 'same direction, different length: a tie, smaller index first' },
              { expr: `topk_cosine(np.array([[1., 1.]]), np.array([[0., 0.], [-1., -1.], [1., 2.]]), 3).tolist()`, label: 'a zero document scores 0, between the match and the opposite' },
              { expr: `topk_cosine(Q_demo, D_demo, 4).tolist()`, label: '3 random queries, 12 documents, k = 4' },
              { expr: `topk_cosine(Q_demo * 1000, D_demo, 4).tolist()`, label: 'scaling the queries does not change the result' },
            ],
            hints: [
              md`\`np.linalg.norm(D, axis=1, keepdims=True)\` has shape \`(n, 1)\`, ready to divide \`D\`.`,
              md`\`np.argsort(-S, axis=1, kind='stable')[:, :k]\` sorts by descending similarity and keeps ties in index order.`,
            ],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'code01-ex-kfold',
            title: 'Stratified k-fold assignment',
            prompt:
              md`Assign every sample to a fold so that each class is spread evenly. A loop over the **classes** is fine; do not loop over samples.` +
              py(`def stratified_kfold(y, k, seed=None):
    """y: (n,) labels -> (n,) int fold ids in 0..k-1.
    If seed is not None, call np.random.seed(seed) once at the start.
    For each class c in increasing order (np.unique(y)): take its indices in increasing order,
    and if seed is not None replace them by np.random.permutation(idx).
    Give those indices fold ids 0, 1, ..., k-1, 0, 1, ... in that order."""

def fold_split(fold, f):
    """-> (train_idx, test_idx): indices with fold != f and fold == f, both increasing."""`),
            starter: KF_STARTER,
            solution: KF_SOLUTION,
            tests: [
              { expr: `stratified_kfold(np.array([0, 0, 0, 0, 1, 1, 0, 0, 1, 0]), 2).tolist()`, label: '10 samples, 3 positives, k = 2' },
              { expr: `np.bincount(stratified_kfold(np.array([0] * 13 + [1] * 7), 3)[np.array([0] * 13 + [1] * 7) == 1], minlength=3).tolist()`, label: 'positives per fold for 7 positives, k = 3' },
              { expr: `stratified_kfold(np.array([2, 0, 1, 0, 2, 0, 1, 2, 0, 0]), 3, seed=0).tolist()`, label: 'three classes, shuffled with seed 0' },
              { expr: `[a.tolist() for a in fold_split(stratified_kfold(np.array([0, 0, 0, 0, 1, 1, 0, 0, 1, 0]), 2), 1)]`, label: 'train and test indices for fold 1' },
              { expr: `stratified_kfold(np.array([0, 0, 0, 0, 0, 1, 1]), 4).tolist()`, label: 'k larger than the minority class: some folds have none' },
            ],
            hints: [
              md`\`np.flatnonzero(y == c)\` gives the indices of class \`c\` in increasing order.`,
              md`\`fold[idx] = np.arange(len(idx)) % k\` deals one class out round-robin in a single assignment.`,
            ],
            mustInclude: ['%'],
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'code01-3-paper',
            title: 'AUC with ties, by hand and in code',
            type: 'code-on-paper',
            difficulty: 2,
            minutes: 10,
            statement: md`Labels $\by = (1, 1, 0, 1, 0, 0)$ and scores $\bs = (0.8, 0.4, 0.7, 0.4, 0.2, 0.4)$.

(a) Compute the AUC by counting pairs, with ties counting $\frac12$.

(b) Compute it again with average ranks and the formula $(R_+ - n_+(n_+ + 1)/2)/(n_+ n_-)$.

(c) Write \`roc_auc\` on paper and state its time complexity. Enter the AUC.`,
            solution: [
              md`(a) Positives: $0.8, 0.4, 0.4$. Negatives: $0.7, 0.2, 0.4$. The $0.8$ beats all three (3). Each $0.4$ loses to $0.7$, beats $0.2$ and ties with $0.4$: $0 + 1 + \frac12 = 1.5$. Total $3 + 1.5 + 1.5 = 6$ of $9$ pairs, AUC $= 2/3$.`,
              md`(b) Sorted: $0.2$ (rank 1), then three $0.4$s at ranks $2, 3, 4$, each given the average $3$, then $0.7$ (5) and $0.8$ (6). Positive ranks: $6, 3, 3$, so $R_+ = 12$. $(12 - 3\cdot4/2)/(3\cdot3) = 6/9 = 2/3$.`,
              md`(c)` + py(`def roc_auc(y, s):
    u, inv, c = np.unique(s, return_inverse=True, return_counts=True)   # O(n log n)
    r = (np.cumsum(c) - (c - 1) / 2)[inv]                                # average ranks
    p = int((y == 1).sum()); q = len(y) - p
    return (r[y == 1].sum() - p * (p + 1) / 2) / (p * q)`) + md`The sort inside \`np.unique\` dominates: $O(n\log n)$ time, $O(n)$ memory.`,
            ],
            answer: { kind: 'number', value: 2 / 3 },
            rubric: [md`Tied pair counted as one half in (a)`, md`Average rank 3 for the three tied scores in (b)`, md`Code uses ranks, not an $O(n_+n_-)$ double loop, and states $O(n\log n)$`],
            areas: ['ml-coding', 'ml-breadth'],
          },
        },
        {
          kind: 'recall',
          prompt: md`Without looking back: the rank formula for AUC, and the rule for fitting preprocessing inside cross-validation.`,
          answer: md`$\text{AUC} = (R_+ - n_+(n_+ + 1)/2)/(n_+ n_-)$ with average ranks for ties. Fit every data-dependent transform (scaler, encoder, feature selection) on the training folds only, inside each fold, and apply it to the held-out fold.`,
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *your model has AUC 0.92 but the product team says its probabilities are useless. How can both be true, and what would you compute?*`,
          model: md`AUC depends only on the order of the scores: it is the probability that a random positive scores above a random negative. Any strictly increasing transformation of the scores leaves it unchanged, so a model can rank very well while its outputs are far from true probabilities, for example after training on downsampled negatives or with a strong regularizer. If the product uses the number itself, such as an expected-value computation or a threshold set in probability terms, calibration matters. I would draw a reliability diagram (mean predicted probability against observed frequency in bins), report log loss or the Brier score alongside AUC, and fix it with Platt scaling or isotonic regression fitted on a held-out set, or by correcting for the sampling rate. The ranking, and therefore the AUC, would not change.`,
        },
      ],
      cards: [
        { id: 'code01-3-c1', kind: 'concept', front: md`AUC as a probability, and its rank formula.`, back: md`$\P(s_+ > s_-) + \frac12\P(s_+ = s_-)$. $(R_+ - n_+(n_+ + 1)/2)/(n_+ n_-)$ with average ranks.` },
        { id: 'code01-3-c2', kind: 'cloze', text: md`Fit a scaler on the {{}} split only, then apply it unchanged to the test split.`, answers: ['training'] },
        { id: 'code01-3-c3', kind: 'compute', front: md`$TP = 30$, $FP = 10$, $FN = 30$. Compute $F_1$.`, answer: { kind: 'number', value: 0.6 }, back: md`$2TP/(2TP + FP + FN) = 60/100 = 0.6$. (Precision 0.75, recall 0.5.)` },
        { id: 'code01-3-c4', kind: 'concept', front: md`How do you build a $C \times C$ confusion matrix in one NumPy call?`, back: md`\`np.bincount(y_true * C + y_pred, minlength=C * C).reshape(C, C)\`: each (true, pred) pair becomes one integer.` },
        { id: 'code01-3-c5', kind: 'concept', front: md`Why stratify k-fold splits for an imbalanced classification problem?`, back: md`So that every fold has the same class proportions as the data. Otherwise some folds get few or no positives and per-fold precision, recall and AUC become noisy or undefined.` },
      ],
    },
  ],
  problems: [
    {
      id: 'code01-p1',
      title: 'Chunking a similarity search',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 10,
      statement: md`You must find the top 10 documents for each of $50{,}000$ queries among $200{,}000$ documents, all 256-dimensional float32 embeddings.

(a) How much memory would the full float32 similarity matrix take?

(b) You may use 1 GB ($10^9$ bytes) for one chunk of the similarity matrix. How many queries fit in one chunk? Enter that number.

(c) Write the chunked loop on paper.`,
      solution: [
        md`(a) $50{,}000 \times 200{,}000 \times 4$ bytes $= 4 \times 10^{10}$ bytes $= 40$ GB.`,
        md`(b) One query row takes $200{,}000 \times 4 = 8 \times 10^5$ bytes. $10^9 / (8\times10^5) = 1250$ queries per chunk.`,
        md`(c)` + py(`def topk_chunked(Q, D, k, chunk=1250):
    Dn = D / np.maximum(np.linalg.norm(D, axis=1, keepdims=True), 1e-12)
    out = []
    for start in range(0, len(Q), chunk):                  # loop over chunks, not queries
        q = Q[start:start + chunk]
        qn = q / np.maximum(np.linalg.norm(q, axis=1, keepdims=True), 1e-12)
        S = qn @ Dn.T                                      # (chunk, n): at most 1 GB
        out.append(np.argsort(-S, axis=1, kind='stable')[:, :k])
    return np.concatenate(out)                             # (q, k)`),
        md`Time is unchanged at $O(q\,n\,d)$; only peak memory drops, to $O(\text{chunk}\cdot n)$. Normalizing the documents once outside the loop avoids repeating $O(nd)$ work per chunk.`,
      ],
      answer: { kind: 'number', value: 1250 },
      rubric: [md`Full matrix size computed as 40 GB`, md`Chunk size from bytes per row`, md`Loop over chunks with the documents normalized once`],
      areas: ['ml-coding'],
    },
    {
      id: 'code01-p2',
      title: 'Gradient of softmax cross-entropy',
      type: 'derive',
      difficulty: 2,
      minutes: 10,
      statement: md`Let $\bp = \softmax(\bz)$ and $\ell = -\sum_c y_c \log p_c$ for a one-hot $\by$. Derive $\pd{p_i}{z_j}$, and use it to show $\nabla_{\bz}\ell = \bp - \by$.`,
      hints: [md`Treat $i = j$ and $i \ne j$ separately, or write the answer with the Kronecker delta $\delta_{ij}$.`],
      solution: [
        md`$p_i = e^{z_i}/Z$ with $Z = \sum_k e^{z_k}$, and $\partial Z/\partial z_j = e^{z_j}$.`,
        md`Quotient rule: $\pd{p_i}{z_j} = \dfrac{\delta_{ij}e^{z_i}Z - e^{z_i}e^{z_j}}{Z^2} = p_i(\delta_{ij} - p_j)$.`,
        md`Chain rule: $\pd{\ell}{z_j} = -\sum_i \dfrac{y_i}{p_i}\,p_i(\delta_{ij} - p_j) = -\sum_i y_i\delta_{ij} + p_j\sum_i y_i = -y_j + p_j$, using $\sum_i y_i = 1$.`,
        md`So $\nabla_{\bz}\ell = \bp - \by$. In matrix form the softmax Jacobian is $\diag(\bp) - \bp\bp\T$, and the result holds for any $\by$ whose entries sum to 1, such as label-smoothed targets.`,
      ],
      rubric: [md`Correct Jacobian $p_i(\delta_{ij} - p_j)$`, md`Chain rule applied with the $1/p_i$ from the log`, md`Uses $\sum_i y_i = 1$ to simplify`],
      areas: ['ml-depth', 'ml-coding'],
    },
    {
      id: 'code01-p3',
      title: "Lloyd's algorithm never increases the inertia",
      type: 'proof',
      difficulty: 2,
      minutes: 12,
      statement: md`Let $J(z, \bc) = \sum_i \lVert\bx_i - \bc_{z_i}\rVert^2$ for assignments $z$ and centroids $\bc_1, \dots, \bc_K$. Prove that the assignment step and the update step of k-means each satisfy $J_{\text{new}} \le J_{\text{old}}$, and conclude that the algorithm terminates.`,
      hints: [md`For the update step, show that the mean minimizes $\sum_{i\in S}\lVert\bx_i - \bc\rVert^2$ over $\bc$ by setting the gradient to zero.`, md`For termination: how many different assignments are there?`],
      solution: [
        md`Assignment step, centroids fixed: each point's new label minimizes $\lVert\bx_i - \bc_k\rVert^2$ over $k$, so each term is at most its old value, and so is the sum.`,
        md`Update step, labels fixed: $J$ splits into independent sums $\sum_{i\in S_k}\lVert\bx_i - \bc_k\rVert^2$. Each is a convex quadratic in $\bc_k$ with gradient $-2\sum_{i\in S_k}(\bx_i - \bc_k)$, which is zero at $\bc_k = \frac{1}{|S_k|}\sum_{i\in S_k}\bx_i$, the mean. So the mean is the minimizer and the sum cannot increase. An empty cluster contributes nothing and its centroid can stay put.`,
        md`Termination: $J$ never increases and there are finitely many assignments ($K^n$). If ties are broken consistently, the algorithm cannot return to an earlier assignment without $J$ staying constant, at which point the assignment no longer changes and the algorithm has converged.`,
        md`The limit is a local minimum, or more precisely a fixed point of the two steps, not necessarily the global minimum. Finding the global minimum is NP-hard in general.`,
      ],
      rubric: [md`Assignment step argued pointwise`, md`Mean shown to minimize the within-cluster sum (gradient or the bias–variance identity)`, md`Termination from monotonicity plus finitely many assignments`, md`States convergence is to a local, not global, minimum`],
      areas: ['ml-depth'],
    },
    {
      id: 'code01-p4',
      title: 'A logistic regression step, on paper and by hand',
      type: 'code-on-paper',
      difficulty: 1,
      minutes: 10,
      statement: md`(a) Write \`logreg_step(X, y, w, b, lr)\` on paper: one full-batch gradient step on the mean binary cross-entropy, returning the new \`(w, b)\`, with a shape comment on every line. State its time and memory cost for $n$ examples and $d$ features.

(b) Run it by hand on one feature, $x = (1, 2)$, labels $y = (0, 1)$, from $w = 0$, $b = 0$ with learning rate $1$. Enter $[w, b]$.`,
      solution: [
        md`(a)` + py(`def logreg_step(X, y, w, b, lr):
    z = X @ w + b                       # (n,)
    p = 1 / (1 + np.exp(-z))            # (n,)
    g = p - y                           # (n,): dL/dz_i times n
    w = w - lr * (X.T @ g) / len(y)     # (d,)
    b = b - lr * g.mean()               # scalar
    return w, b`) + md`Time $O(nd)$ for the two matrix–vector products; extra memory $O(n)$ for \`z\`, \`p\`, \`g\`.`,
        md`(b) At $w = b = 0$ both predicted probabilities are $\sigma(0) = 0.5$, so $\bg = \bp - \by = (0.5, -0.5)$.`,
        md`$\pd{L}{w} = \frac12(1 \cdot 0.5 + 2\cdot(-0.5)) = -0.25$ and $\pd{L}{b} = \frac12(0.5 - 0.5) = 0$.`,
        md`$w \leftarrow 0 - 1\cdot(-0.25) = 0.25$, $b \leftarrow 0$. The weight moves toward predicting 1 for larger $x$, as the data suggests.`,
      ],
      answer: { kind: 'vector', value: [0.25, 0] },
      rubric: [md`Gradient written as \`X.T @ (p - y) / n\` with correct shapes`, md`Bias gradient is the mean of \`p - y\``, md`Complexity $O(nd)$ stated`, md`Hand computation gives $w = 0.25$, $b = 0$`],
      areas: ['ml-coding', 'ml-breadth'],
    },
    {
      id: 'code01-p5',
      title: 'Counting attention FLOPs',
      type: 'compute',
      difficulty: 2,
      minutes: 8,
      statement: md`One attention layer has $H = 16$ heads of size $d = 64$ and processes a sequence of $T = 2048$ tokens. Counting a multiply-add as 2 FLOPs, how many GFLOPs ($10^9$) do the two products $QK\T$ and $AV$ take together, summed over heads? Ignore the projections and the softmax.`,
      solution: [
        md`Per head, $QK\T$ is $(T, d)\,@\,(d, T)$: $T^2$ outputs, each a length-$d$ dot product, so $2T^2d$ FLOPs. $AV$ is $(T, T)\,@\,(T, d)$: $Td$ outputs of length $T$, again $2T^2d$.`,
        md`Total: $4T^2dH = 4 \cdot 2048^2 \cdot 64 \cdot 16 = 4 \cdot 4{,}194{,}304 \cdot 1024 \approx 1.718 \times 10^{10}$ FLOPs, about $17.18$ GFLOPs.`,
        md`For comparison, the four $D\times D$ projections with $D = Hd = 1024$ cost $4 \cdot 2TD^2 \approx 1.72\times 10^{10}$ FLOPs, the same order. Doubling $T$ doubles the projection cost but quadruples the attention cost.`,
      ],
      answer: { kind: 'number', value: (4 * 2048 * 2048 * 64 * 16) / 1e9, tol: 1e-3 },
      areas: ['ml-coding', 'llm'],
    },
    {
      id: 'code01-p6',
      title: 'Fold sizes under stratification',
      type: 'code-on-paper',
      difficulty: 1,
      minutes: 6,
      statement: md`A dataset has 13 negatives and 7 positives, in that order (indices 0–12 negative, 13–19 positive). Using the round-robin \`stratified_kfold\` from lesson 3 with $k = 3$ and no shuffling, how many samples does each fold contain? Enter the three fold sizes in fold order. Which fold indices hold the positives?`,
      solution: [
        md`Negatives, in index order, get folds $0,1,2,0,1,2,\dots$: 13 items give fold sizes $5, 4, 4$.`,
        md`Positives (indices 13–19) get folds $0,1,2,0,1,2,0$: sizes $3, 2, 2$. Fold 0 holds positives 13, 16, 19; fold 1 holds 14, 17; fold 2 holds 15, 18.`,
        md`Fold sizes: $5 + 3 = 8$, $4 + 2 = 6$, $4 + 2 = 6$. The positive share per fold is $3/8$, $2/6$, $2/6$, against $7/20 = 0.35$ overall. Contiguous unstratified folds of sizes 7, 7, 6 would have put all 7 positives in the last two folds (1 and 6).`,
      ],
      answer: { kind: 'vector', value: [8, 6, 6] },
      areas: ['ml-coding', 'ml-breadth'],
    },
    {
      id: 'code01-p7',
      title: 'AUC by counting pairs, and its cost',
      type: 'code-on-paper',
      difficulty: 1,
      minutes: 8,
      statement: md`Scores of positives: $0.95, 0.7, 0.55, 0.3$. Scores of negatives: $0.8, 0.5, 0.45, 0.2, 0.1$.

(a) Compute the AUC by counting pairs. Enter it.

(b) Write the pair-counting version in vectorized NumPy and give its time and memory. When would you switch to the rank formula?`,
      solution: [
        md`(a) There are $4 \times 5 = 20$ pairs. Negatives below each positive: $0.95$: 5; $0.7$: 4 (all but $0.8$); $0.55$: 4; $0.3$: 2 ($0.2, 0.1$). $U = 15$, so $\text{AUC} = 15/20 = 0.75$.`,
        md`(b)` + py(`def auc_pairs(s_pos, s_neg):
    diff = s_pos[:, None] - s_neg[None, :]                 # (n_pos, n_neg)
    return ((diff > 0).sum() + 0.5 * (diff == 0).sum()) / diff.size`),
        md`Time and memory are both $O(n_+n_-)$. With $10^5$ positives and $10^6$ negatives that is $10^{11}$ comparisons and far too much memory, so switch to the rank formula, $O(n\log n)$ time and $O(n)$ memory, whenever $n_+n_-$ is large.`,
      ],
      answer: { kind: 'number', value: 0.75 },
      rubric: [md`Pairs counted correctly, $15$ of $20$`, md`Broadcast difference with ties counted one half`, md`$O(n_+n_-)$ stated and the rank formula named as the scalable alternative`],
      areas: ['ml-coding', 'ml-breadth'],
    },
    {
      id: 'code01-p8',
      title: 'A failing gradient check',
      type: 'concept',
      difficulty: 2,
      minutes: 8,
      statement: md`A colleague's gradient check reports these relative errors for a two-layer network: \`W2\`: $2\times10^{-10}$, \`b2\`: $3\times10^{-10}$, \`W1\`: $0.31$, \`b1\`: $0.48$. They used float32, $h = 10^{-3}$ and the forward difference. List the problems with the check, then say where the bug most likely is and how you would localize it.`,
      solution: [
        md`The check itself is weak: float32 has $\varepsilon \approx 10^{-7}$, and the forward difference has $O(h)$ error, so even a correct gradient would show errors around $10^{-3}$. Redo it in float64 with central differences and $h \approx 10^{-5}$.`,
        md`Even so, $0.3$ to $0.5$ is far beyond what a weak check produces, while the second layer is essentially exact. The loss and the output-layer gradient \`dZ2\` are therefore correct, and the bug is in the backward pass from \`dA1\` downward.`,
        md`Likely causes: \`dA1 = dZ2 @ W2\` instead of \`dZ2 @ W2.T\` (shapes only agree if $W_2$ is square), the ReLU mask taken from \`A1\` of the wrong layer or applied before the product, or \`db1\` summed over the wrong axis.`,
        md`To localize, check \`dA1\` itself numerically by treating $A_1$ as an input, then \`dZ1\`, on a batch of 1 or 2 with tiny dimensions, and avoid inputs where $Z_1$ is near 0.`,
      ],
      rubric: [md`Identifies float32 and the forward difference as making the check unreliable`, md`Deduces from the per-parameter pattern that the bug is below the output layer`, md`Names at least two concrete candidate bugs`, md`Proposes checking intermediate gradients on a tiny problem`],
      areas: ['ml-coding', 'ml-depth'],
    },
    {
      id: 'code01-p9',
      title: 'The best step size for central differences',
      type: 'derive',
      difficulty: 3,
      minutes: 12,
      statement: md`Model the error of the central difference as $E(h) = \frac{M}{6}h^2 + \frac{\varepsilon F}{h}$, where $M$ bounds $|f'''|$, $F$ bounds $|f|$ near $x$, and $\varepsilon$ is the machine epsilon. Find the $h$ that minimizes $E$, and its order of magnitude for float64 ($\varepsilon \approx 2.2\times10^{-16}$) when $M \approx F \approx 1$.`,
      hints: [md`Set $E'(h) = 0$.`, md`Where does each term come from? Taylor expansion for the first, rounding of $f(x\pm h)$ for the second.`],
      solution: [
        md`The first term is truncation: Taylor-expanding $f(x \pm h)$ to third order, the even terms cancel and $\frac{f(x+h) - f(x-h)}{2h} - f'(x) = \frac{h^2}{6}f'''(\xi)$.`,
        md`The second term is round-off: each of $f(x\pm h)$ carries an absolute error up to about $\varepsilon F$, the difference up to $2\varepsilon F$, and dividing by $2h$ gives $\varepsilon F/h$.`,
        md`$E'(h) = \frac{M}{3}h - \frac{\varepsilon F}{h^2} = 0 \Rightarrow h^3 = \frac{3\varepsilon F}{M} \Rightarrow h^* = \left(\frac{3\varepsilon F}{M}\right)^{1/3}$.`,
        md`With $M = F = 1$: $h^* = (6.6\times10^{-16})^{1/3} \approx 8.7\times10^{-6}$, of order $10^{-5}$. The minimal error is then of order $\varepsilon^{2/3} \approx 10^{-11}$, which is why relative errors of $10^{-7}$ or less mean "correct" in practice. For the forward difference the same argument gives $h^* \sim \sqrt\varepsilon \approx 10^{-8}$ and error $\sim\sqrt\varepsilon$.`,
      ],
      rubric: [md`Truncation term derived from the Taylor expansion with cancelling even terms`, md`Round-off term justified`, md`Optimal $h \propto \varepsilon^{1/3}$, about $10^{-5}$`, md`Comparison with the forward difference or the resulting minimal error`],
      areas: ['ml-depth', 'math'],
    },
    {
      id: 'code01-p10',
      title: 'Spot the leakage',
      type: 'concept',
      difficulty: 1,
      minutes: 6,
      statement: md`Find every leak in this pipeline and rewrite it correctly in words or code:` + py(`X = (X - X.mean(axis=0)) / X.std(axis=0)
keep = np.argsort(-np.abs(np.corrcoef(X.T, y)[-1, :-1]))[:20]   # top 20 features by correlation with y
X = X[:, keep]
tr, te = train_test_split(len(X), len(X) // 5, seed=0)
w = fit(X[tr], y[tr]); print(score(X[te], y[te], w))`),
      solution: [
        md`Leak 1: the mean and standard deviation are computed on all rows, including the test rows.`,
        md`Leak 2, the larger one: features are selected by their correlation with $y$ on all rows. The test labels influenced which features the model sees, which can produce good test scores even on pure noise when there are many features.`,
        md`Fix: split first. Fit the scaler and the feature selection on \`X[tr]\`, \`y[tr]\` only, then apply the same mean, std and \`keep\` indices to \`X[te]\`. With cross-validation, do both inside every fold, for example by wrapping them in a pipeline object that is refitted per fold.`,
      ],
      rubric: [md`Scaling leak identified`, md`Feature-selection leak identified and recognised as the more serious`, md`Correct order: split, then fit transforms on training data only (per fold in CV)`],
      areas: ['ml-coding', 'ml-breadth'],
    },
  ],
};
