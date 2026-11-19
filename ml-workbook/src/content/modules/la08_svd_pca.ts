import { md, type Module } from '../types';

export const MODULE: Module = {
  id: 'la08',
  part: 'la',
  order: 8,
  title: 'SVD, PCA and low-rank structure',
  summary: 'The singular value decomposition as rotate–stretch–rotate, best low-rank approximation, the pseudo-inverse and condition number, LoRA, and principal component analysis.',
  relevance: md`The SVD is behind PCA, truncated-SVD compression of embeddings and weight matrices, matrix-factorization recommenders, the pseudo-inverse used by least-squares solvers such as \`np.linalg.lstsq\`, and the condition numbers that govern numerical accuracy and optimization speed. LoRA fine-tunes large language models by learning a low-rank update $\Delta W = BA$ to frozen weights, and QLoRA does the same on top of 4-bit quantized weights. "Explain the SVD", "how are PCA and the SVD related", and "what does rank have to do with LoRA" are standard interview questions.`,
  areas: ['math', 'ml-depth', 'llm'],
  prereqs: ['la07'],
  lessons: [
    // ------------------------------------------------------------------ 8.1
    {
      id: 'la08-1',
      title: 'The singular value decomposition',
      minutes: 40,
      objectives: [
        'Describe the SVD as rotate, stretch, rotate, and give the shapes of U, Σ and V for an m×n matrix.',
        'Compute the singular values of a 2×2 matrix from the eigenvalues of AᵀA, and the vectors uᵢ = Avᵢ/σᵢ.',
        'Read the rank and orthonormal bases of the four fundamental subspaces off the SVD.',
        'Write a matrix as the sum of rank-1 layers σᵢuᵢvᵢᵀ.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Eigen-decomposition needs a square matrix and can fail: the shear has too few eigenvectors and a rotation has complex eigenvalues. Data matrices are rarely square: users by items, documents by terms, samples by features, a weight matrix mapping 4096 inputs to 11008 outputs. The **singular value decomposition** exists for every real matrix of every shape, uses only real numbers, and always has orthonormal bases on both sides.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Singular value decomposition',
          md: md`Every real $m\times n$ matrix $A$ can be written $$A = U\Sigma V\T,$$ where $U$ ($m\times m$) and $V$ ($n\times n$) are orthogonal and $\Sigma$ ($m\times n$) is zero except for the **singular values** $\sigma_1 \ge \sigma_2 \ge \dots \ge 0$ on its diagonal. Column by column, $$A\bv_i = \sigma_i\bu_i, \qquad A\T\bu_i = \sigma_i\bv_i.$$ The $\bv_i$ are the right singular vectors and the $\bu_i$ the left singular vectors.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          md: md`Every linear map is a rotation (or reflection), then a stretch along perpendicular axes, then another rotation. It sends the unit sphere to an ellipsoid whose semi-axes are $\sigma_1\bu_1, \sigma_2\bu_2, \dots$, and the $\bv_i$ are the directions that land on those axes.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.svd-steps', matrix: [[1.5, 1], [-0.5, 1.5]] },
          task: md`Press Play. Watch the two perpendicular arrows $\bv_1, \bv_2$: $V\T$ turns them onto the axes, $\Sigma$ stretches the axes, $U$ turns them onto the axes of the ellipse. Replay with **det < 0**, where $U$ includes a reflection, and with **rank 1**, where the ellipse collapses to a segment.`,
          caption: md`The dashed ellipse is $A$ applied to the unit circle; the animation reaches it in three steps. The readout confirms $\sigma_i^2$ are the eigenvalues of $A\T A$ and $|\det A| = \sigma_1\sigma_2$.`,
        },
        {
          kind: 'derive',
          title: 'singular values from AᵀA',
          goal: md`Given $A = U\Sigma V\T$, relate $V$ and $\Sigma$ to the eigen-decomposition of $A\T A$, and find $U$ from them.`,
          steps: [
            {
              md: md`$A\T A = (U\Sigma V\T)\T(U\Sigma V\T) = V\Sigma\T U\T U\Sigma V\T = V(\Sigma\T\Sigma)V\T$.`,
              choose: {
                prompt: md`What simplifies $V\Sigma\T U\T U\Sigma V\T$?`,
                options: [md`$U\T U = I$`, md`$V\T V = I$`, md`$\Sigma\T = \Sigma^{-1}$`],
                answer: 0,
                explain: md`$U$ is orthogonal, so the two $U$ factors in the middle cancel. $\Sigma$ is not invertible in general.`,
              },
            },
            { md: md`$\Sigma\T\Sigma$ is diagonal with entries $\sigma_i^2$. So this is the spectral decomposition of the symmetric PSD matrix $A\T A$: the $\bv_i$ are its orthonormal eigenvectors and $\sigma_i^2$ its eigenvalues.` },
            { md: md`Hence $\sigma_i = \sqrt{\lambda_i(A\T A)}$. For $\sigma_i > 0$, $\bu_i = A\bv_i/\sigma_i$. These are unit vectors and mutually orthogonal: $\bu_i\cdot\bu_j = \bv_i\T A\T A\bv_j/(\sigma_i\sigma_j) = \sigma_j^2\,\bv_i\cdot\bv_j/(\sigma_i\sigma_j)$, which is $1$ for $i = j$ and $0$ otherwise.` },
            { md: md`Similarly $AA\T = U(\Sigma\Sigma\T)U\T$: the $\bu_i$ are eigenvectors of $AA\T$, with the same nonzero eigenvalues $\sigma_i^2$.` },
          ],
          takeaway: md`This proves the SVD exists: start from the spectral theorem for $A\T A$. Numerically, libraries do not form $A\T A$, for the conditioning reasons of lesson 6.3.`,
        },
        {
          kind: 'callout',
          tone: 'example',
          title: 'Worked example',
          md: md`$A = \begin{bmatrix} 3 & 0 \\ 4 & 5 \end{bmatrix}$.

1. $A\T A = \begin{bmatrix} 25 & 20 \\ 20 & 25 \end{bmatrix}$ has eigenvalues $45$ and $5$, with eigenvectors $\bv_1 = \tfrac{1}{\sqrt2}(1, 1)$, $\bv_2 = \tfrac{1}{\sqrt2}(1, -1)$.
2. $\sigma_1 = \sqrt{45} = 3\sqrt5 \approx 6.708$, $\sigma_2 = \sqrt5 \approx 2.236$.
3. $\bu_1 = A\bv_1/\sigma_1 = \tfrac{1}{\sqrt2}(3, 9)/(3\sqrt5) = \tfrac{1}{\sqrt{10}}(1, 3)$ and $\bu_2 = A\bv_2/\sigma_2 = \tfrac{1}{\sqrt2}(3, -1)/\sqrt5 = \tfrac{1}{\sqrt{10}}(3, -1)$.
4. Check: $\bu_1\cdot\bu_2 = 0$ and $\sigma_1\sigma_2 = 15 = |\det A|$.`,
        },
        {
          kind: 'numeric',
          q: md`Find the singular values of $\begin{bmatrix} 2 & 0 \\ 0 & -3 \end{bmatrix}$.`,
          answer: { kind: 'set', value: [3, 2] },
          explain: md`$A\T A = \diag(4, 9)$, so $\sigma = 3, 2$. Singular values are never negative: the sign goes into $U$ (here $\bu = -\be_2$ for $\bv = \be_2$), and they are listed in decreasing order.`,
        },
        {
          kind: 'numeric',
          q: md`Find the singular values of $\begin{bmatrix} 1 & 1 \\ 1 & 1 \end{bmatrix}$.`,
          answer: { kind: 'set', value: [2, 0] },
          explain: md`$A\T A = \begin{bmatrix} 2 & 2 \\ 2 & 2 \end{bmatrix}$ has trace $4$ and determinant $0$, so eigenvalues $4, 0$ and $\sigma = 2, 0$. One nonzero singular value: rank 1.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Singular values versus eigenvalues',
          md: md`- Always: $\sigma_i(A) = \sqrt{\lambda_i(A\T A)}$ and $|\det A| = \sigma_1\cdots\sigma_n$ for square $A$.
- For symmetric $A$: $\sigma_i = |\lambda_i|$. For symmetric PSD $A$, the SVD and the eigen-decomposition coincide.
- In general they differ. The shear $\begin{bmatrix} 1 & 1 \\ 0 & 1 \end{bmatrix}$ has eigenvalues $1, 1$ but singular values $\tfrac{1 + \sqrt5}{2} \approx 1.618$ and $\tfrac{\sqrt5 - 1}{2} \approx 0.618$: it stretches some vectors although it has no eigenvalue above 1.`,
        },
        {
          kind: 'check',
          q: md`$A = \begin{bmatrix} 0 & 2 \\ 0 & 0 \end{bmatrix}$. Which statement is true?`,
          options: [
            md`Its eigenvalues are $0, 0$ and its singular values are $2, 0$.`,
            md`Its eigenvalues and singular values are both $0, 0$.`,
            md`Its eigenvalues and singular values are both $2, 0$.`,
            md`It has no SVD because it is not diagonalizable.`,
          ],
          answer: 0,
          explain: md`$A$ is triangular with zero diagonal, so both eigenvalues are 0. But $A\be_2 = 2\be_1$: it stretches $\be_2$ by 2. $A\T A = \diag(0, 4)$ gives $\sigma = 2, 0$. Every matrix has an SVD.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Rank and the four subspaces',
          md: md`If exactly $r$ singular values are nonzero, then $\rank A = r$, and
- $\bu_1, \dots, \bu_r$ is an orthonormal basis of $\Col A$, and $\bu_{r+1}, \dots, \bu_m$ of $\Null A\T$;
- $\bv_1, \dots, \bv_r$ is an orthonormal basis of $\Row A$, and $\bv_{r+1}, \dots, \bv_n$ of $\Null A$.

In floating point, "nonzero" means above a tolerance; \`np.linalg.matrix_rank\` counts singular values above roughly $\sigma_1 \cdot \max(m, n) \cdot 2.2\times10^{-16}$.`,
        },
        {
          kind: 'text',
          md: md`### The outer-product expansion

Multiplying out $U\Sigma V\T$ column by row gives $$A = \sigma_1\bu_1\bv_1\T + \sigma_2\bu_2\bv_2\T + \dots + \sigma_r\bu_r\bv_r\T.$$ Each term $\bu_i\bv_i\T$ is a rank-1 matrix: every row is a multiple of $\bv_i\T$ and every column a multiple of $\bu_i$. The terms come in decreasing order of importance, measured by $\sigma_i$. Keeping only the first few gives a low-rank approximation, the subject of lesson 8.2.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.rank1-sum', k: 1 },
          task: md`The matrix is a small ratings table: 6 users (rows) by 6 movies (columns). Move $k$ from 1 to 6. At $k = 2$ every entry is within about $0.7$ of the original. Look at the second layer $\sigma_2\bu_2\bv_2\T$: which users and which movies does its sign separate?`,
          caption: md`The first layer is roughly "how much does this user rate anything", the second separates the users who like movies 1–3 from those who like movies 4–6. Two layers carry $98.1\%$ of $\sum\sigma_i^2$. Matrix-factorization recommenders rest on this kind of low-rank structure.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'la08-1-paper',
            title: 'The SVD of a rank-1 matrix',
            type: 'compute',
            difficulty: 1,
            minutes: 8,
            statement: md`Write $A = \begin{bmatrix} 2 & 2 \\ 1 & 1 \end{bmatrix}$ as $\sigma_1\bu_1\bv_1\T$ with unit vectors $\bu_1, \bv_1$. What are the singular values, the column space and the null space? Enter $\sigma_1$.`,
            hints: [md`Every row is a multiple of $(1, 1)$ and every column a multiple of $(2, 1)$.`],
            solution: [
              md`$A = \begin{bmatrix} 2 \\ 1 \end{bmatrix}\begin{bmatrix} 1 & 1 \end{bmatrix}$. Normalize both factors: $(2, 1) = \sqrt5\,\bu_1$ and $(1, 1) = \sqrt2\,\bv_1$.`,
              md`So $A = \sqrt{10}\,\bu_1\bv_1\T$ with $\bu_1 = \tfrac{1}{\sqrt5}(2, 1)$, $\bv_1 = \tfrac{1}{\sqrt2}(1, 1)$. The singular values are $\sqrt{10} \approx 3.162$ and $0$.`,
              md`Check with $A\T A = \begin{bmatrix} 5 & 5 \\ 5 & 5 \end{bmatrix}$: trace $10$, determinant $0$, so eigenvalues $10, 0$.`,
              md`$\Col A = \Span\{(2, 1)\}$ and $\Null A = \Span\{\bv_2\} = \Span\{(1, -1)\}$.`,
            ],
            answer: { kind: 'number', value: Math.sqrt(10) },
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

A = np.array([[3.0, 0.0],
              [4.0, 5.0]])
s = np.linalg.svd(A, compute_uv=False)
print(np.round(s**2, 6))`,
          predict: {
            q: md`This is the worked example. What is printed?`,
            options: ['`[45.  5.]`', '`[ 5. 45.]`', '`[6.708204 2.236068]`', '`[9. 25.]`'],
            answer: 0,
            explain: md`The singular values are $\sqrt{45}$ and $\sqrt5$, in decreasing order, so their squares are the eigenvalues of $A\T A$: $45$ and $5$.`,
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

A = np.array([[3.0, 0.0],
              [4.0, 5.0]])
U, s, Vt = np.linalg.svd(A)
# singular vectors are unique only up to sign: flip pairs (u_i, v_i) so each v_i has a positive largest entry
for i in range(len(s)):
    j = np.argmax(np.abs(Vt[i]))
    if Vt[i, j] < 0:
        U[:, i], Vt[i] = -U[:, i], -Vt[i]
print("sigma:", np.round(s, 4))
print("V^T =\\n", np.round(Vt, 4))
print("U =\\n", np.round(U, 4))
print("U S V^T = A:", np.allclose(U @ np.diag(s) @ Vt, A))
layers = [s[i] * np.outer(U[:, i], Vt[i]) for i in range(2)]
print("rank-1 layer 1 =\\n", np.round(layers[0], 4))
print("sum of layers = A:", np.allclose(layers[0] + layers[1], A))`,
          note: md`\`np.linalg.svd\` returns $V\T$, not $V$: the right singular vectors are the **rows** of \`Vt\`. Flipping the signs of $\bu_i$ and $\bv_i$ together leaves $A$ unchanged, so implementations may differ by such flips; normalizing the signs makes the output reproducible.`,
        },
        {
          kind: 'recall',
          prompt: md`State the SVD with the shapes of $U$, $\Sigma$, $V$; how the singular values relate to $A\T A$; and how to read the rank off the SVD.`,
          answer: md`$A = U\Sigma V\T$ with $U$ $m\times m$ orthogonal, $\Sigma$ $m\times n$ diagonal with $\sigma_1 \ge \dots \ge 0$, $V$ $n\times n$ orthogonal. $\sigma_i^2$ are the eigenvalues of $A\T A$ (with eigenvectors $\bv_i$), and $\bu_i = A\bv_i/\sigma_i$. The rank is the number of nonzero singular values.`,
        },
      ],
      cards: [
        { id: 'la08-1-c1', kind: 'concept', front: md`Geometric meaning of $A = U\Sigma V\T$.`, back: md`Rotate or reflect ($V\T$), stretch along the axes by $\sigma_i$ ($\Sigma$), rotate or reflect ($U$). The unit sphere becomes an ellipsoid with semi-axes $\sigma_i\bu_i$.` },
        { id: 'la08-1-c2', kind: 'compute', front: md`Singular values of $\begin{bmatrix} 0 & -4 \\ 3 & 0 \end{bmatrix}$.`, answer: { kind: 'set', value: [4, 3] }, back: md`$A\T A = \diag(9, 16)$, so $\sigma = 4, 3$.` },
        { id: 'la08-1-c3', kind: 'cloze', text: md`The squared singular values of $A$ are the eigenvalues of $A$ transpose times {{}}.`, answers: ['A'] },
        { id: 'la08-1-c4', kind: 'concept', front: md`How do you get the rank and a basis of $\Col A$ from the SVD?`, back: md`Rank $r$ = number of nonzero singular values. $\bu_1, \dots, \bu_r$ is an orthonormal basis of $\Col A$ (and $\bv_{r+1}, \dots, \bv_n$ of $\Null A$).` },
        { id: 'la08-1-c5', kind: 'concept', front: md`When do singular values equal the absolute eigenvalues?`, back: md`When $A$ is symmetric (more generally, normal). For symmetric PSD $A$ the SVD is the eigen-decomposition.` },
      ],
    },
    // ------------------------------------------------------------------ 8.2
    {
      id: 'la08-2',
      title: 'Low-rank approximation, the pseudo-inverse and conditioning',
      minutes: 40,
      objectives: [
        'State the Eckart–Young theorem and compute the error of the best rank-k approximation from the singular values.',
        'Choose k from the energy captured and count the numbers stored by a rank-k factorization.',
        'Compute the pseudo-inverse from the SVD and use it for minimum-norm least squares.',
        'Compute κ = σ_max/σ_min and explain its effect on least squares and on gradient descent.',
        'Explain LoRA as a rank-r weight update and count its trainable parameters.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Many matrices in practice are close to low rank: ratings depend on a few tastes, images on a few patterns, and the change in a pretrained network's weights during fine-tuning is often well approximated by a low-rank matrix. Truncating the outer-product expansion after $k$ terms keeps the strongest structure and discards the rest. The SVD says exactly how good this is: no other rank-$k$ matrix does better.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Eckart–Young',
          md: md`Let $A_k = \sum_{i=1}^k \sigma_i\bu_i\bv_i\T$. Among all matrices $B$ of rank at most $k$, $A_k$ minimizes both $\lVert A - B\rVert_2$ and $\lVert A - B\rVert_F$, and $$\lVert A - A_k\rVert_2 = \sigma_{k+1}, \qquad \lVert A - A_k\rVert_F = \sqrt{\sigma_{k+1}^2 + \dots + \sigma_r^2}.$$ Here $\lVert M\rVert_2 = \max_{\lVert\bx\rVert = 1}\lVert M\bx\rVert = \sigma_1(M)$ is the spectral norm and $\lVert M\rVert_F = \sqrt{\sum_{ij} m_{ij}^2} = \sqrt{\sum_i\sigma_i^2}$ the Frobenius norm.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          md: md`Keep the $k$ strongest stretch directions and drop the rest. The error is made of exactly the singular values you dropped.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.lowrank-image', k: 3 },
          task: md`Slide $k$ up from 1. Which shapes are reproduced first, and which need many terms? Find the smallest $k$ that captures $99\%$ of the energy. Switch to **error** to see what is still missing, and compare the numbers stored with 4096.`,
          caption: md`The image is generated in code: a vertical gradient, an axis-aligned rectangle, a disk, a diamond and diagonal stripes. A rectangle aligned with the rows and columns is a rank-1 pattern ($\mathbf{1}_{\text{rows}}\mathbf{1}_{\text{cols}}\T$); curved and diagonal edges are not, so they need many terms. Rank 1 already captures $79\%$ of the energy because of the overall brightness; rank 10 captures $99.35\%$. The matrix has rank 39.`,
        },
        {
          kind: 'numeric',
          q: md`A matrix has singular values $10, 4, 2, 1$. What is $\lVert A - A_2\rVert_F$ for its best rank-2 approximation?`,
          answer: { kind: 'number', value: Math.sqrt(5) },
          explain: md`$\sqrt{2^2 + 1^2} = \sqrt5 \approx 2.236$. The spectral-norm error is $\sigma_3 = 2$, and the energy captured is $\frac{100 + 16}{121} \approx 95.9\%$.`,
        },
        {
          kind: 'numeric',
          q: md`A $1000\times500$ matrix is stored as a rank-20 factorization $(U_k\Sigma_k)V_k\T$: one $1000\times20$ and one $500\times20$ matrix. How many numbers is that? (The full matrix has 500000.)`,
          answer: { kind: 'number', value: 30000 },
          explain: md`$1000\cdot20 + 500\cdot20 = 30000$, which is $6\%$ of the full matrix. In general a rank-$k$ factorization stores $k(m + n)$ numbers instead of $mn$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Pseudo-inverse',
          md: md`With the reduced SVD $A = U_r\Sigma_rV_r\T$ (keeping the $r$ nonzero singular values), the **Moore–Penrose pseudo-inverse** is $$A^+ = V_r\Sigma_r^{-1}U_r\T = \sum_{i=1}^r \frac{1}{\sigma_i}\bv_i\bu_i\T.$$ $\bx^+ = A^+\bb$ is the least-squares solution of $A\bx \approx \bb$ with the smallest norm. If $A$ has independent columns, $A^+ = (A\T A)^{-1}A\T$, the matrix of lesson 6.2; if $A$ is invertible, $A^+ = A^{-1}$.`,
        },
        {
          kind: 'text',
          md: md`The pseudo-inverse inverts $A$ on its column space and sends the rest to zero: $\bb$ is first projected onto $\Col A$ (the $\bu_i\T\bb$), each coordinate is divided by its $\sigma_i$, and the result is assembled from the $\bv_i$, which lie in $\Row A$. Directions in $\Null A$ are left out, which is why the solution has minimum norm.

Small singular values make $1/\sigma_i$ huge, so noise in $\bb$ along $\bu_i$ is amplified. **Truncated SVD** drops terms with $\sigma_i$ below a threshold. Ridge regression shrinks them smoothly, replacing $1/\sigma_i$ by $\sigma_i/(\sigma_i^2 + \lambda)$.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'la08-2-paper',
            title: 'A pseudo-inverse by hand',
            type: 'compute',
            difficulty: 2,
            minutes: 10,
            statement: md`Let $A = \begin{bmatrix} 1 & 1 \\ 1 & 1 \end{bmatrix}$. Compute $A^+$ from the SVD, then the minimum-norm least-squares solution of $A\bx \approx (2, 0)$. Check that $A\bx^+$ is the projection of $\bb$ onto $\Col A$. Enter $A^+$.`,
            hints: [md`$A = 2\,\bu_1\bv_1\T$ with $\bu_1 = \bv_1 = \tfrac{1}{\sqrt2}(1, 1)$.`],
            solution: [
              md`$A$ has rank 1: $\sigma_1 = 2$, $\bu_1 = \bv_1 = \tfrac{1}{\sqrt2}(1, 1)$.`,
              md`$A^+ = \frac{1}{\sigma_1}\bv_1\bu_1\T = \frac12\cdot\frac12\begin{bmatrix} 1 & 1 \\ 1 & 1 \end{bmatrix} = \begin{bmatrix} 0.25 & 0.25 \\ 0.25 & 0.25 \end{bmatrix}$.`,
              md`$\bx^+ = A^+(2, 0) = (0.5, 0.5)$, and $A\bx^+ = (1, 1)$.`,
              md`The projection of $(2, 0)$ onto $\Span\{(1, 1)\}$ is $\tfrac{2}{2}(1, 1) = (1, 1)$, as expected. Every $\bx$ with $x_1 + x_2 = 1$ fits equally well; $(0.5, 0.5)$ is the shortest one, since it lies in $\Row A$ and has no component in $\Null A = \Span\{(1, -1)\}$.`,
            ],
            answer: { kind: 'matrix', value: [[0.25, 0.25], [0.25, 0.25]] },
          },
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Condition number',
          md: md`For a matrix with full column rank, $$\kappa(A) = \frac{\sigma_{\max}}{\sigma_{\min}}.$$ It bounds how much relative errors in $\bb$ can be amplified in the solution of $A\bx = \bb$ or of the least-squares problem. Orthogonal matrices have $\kappa = 1$, the best possible. As lesson 6.3 showed, $\kappa(A\T A) = \kappa(A)^2$.`,
        },
        {
          kind: 'numeric',
          q: md`What is $\kappa(A)$ for $A = \begin{bmatrix} 3 & 0 \\ 4 & 5 \end{bmatrix}$ (the worked example of lesson 8.1)?`,
          answer: { kind: 'number', value: 3 },
          explain: md`$\sigma_1/\sigma_2 = 3\sqrt5/\sqrt5 = 3$.`,
        },
        {
          kind: 'text',
          md: md`### Conditioning and optimization

For the quadratic $f(\bx) = \tfrac12\bx\T H\bx$, gradient descent multiplies the component along each eigenvector of $H$ by $1 - \eta\lambda_i$ per step (problem 7 of Module 7). Stability needs $\eta < 2/\lambda_{\max}$, and with such a step the flattest direction shrinks by only $1 - \eta\lambda_{\min} > 1 - 2/\kappa$ per step. Even the best fixed step, $\eta = 2/(\lambda_{\max} + \lambda_{\min})$, contracts by $\tfrac{\kappa - 1}{\kappa + 1}$ per step, so the number of steps grows in proportion to $\kappa(H)$. Standardizing features, normalization layers and preconditioning (adaptive optimizers such as Adam rescale each coordinate, a diagonal form of preconditioning) all aim to make the problem better conditioned.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.cond-gd', kappa: 10, etaL: 1 },
          task: md`With $\eta L = 1$, raise $\kappa$ from 1 to 100 and read the number of steps. Then set $\eta L$ close to 2: the steep direction starts to zigzag. Push $\eta L$ just above 2 and watch the iterates diverge.`,
          caption: md`With $\eta = 1/L$ the steep coordinate is solved in one step, while the flat one shrinks by $1 - 1/\kappa$ per step, so the steps needed grow linearly in $\kappa$. No step size fixes both directions at once.`,
        },
        {
          kind: 'callout',
          tone: 'example',
          title: 'LoRA: a low-rank weight update',
          md: md`Fine-tuning changes a pretrained weight matrix $W_0 \in \R^{d\times k}$ to $W_0 + \Delta W$. LoRA (low-rank adaptation) freezes $W_0$ and learns $$\Delta W = BA, \qquad B \in \R^{d\times r},\ A \in \R^{r\times k},\ r \ll \min(d, k).$$
- $\rank\Delta W \le r$, since every column of $BA$ is a combination of the $r$ columns of $B$.
- Trainable parameters: $r(d + k)$ instead of $dk$. Optimizer state shrinks by the same factor.
- $B$ is initialized to zero (and $A$ randomly), so training starts exactly at $W_0$. The update is usually scaled by $\alpha/r$.
- After training, $W_0 + BA$ can be merged into one matrix, so inference costs nothing extra.

QLoRA applies the same idea on top of a 4-bit quantized $W_0$. Typical ranks are small, for example 8 to 64.`,
        },
        {
          kind: 'numeric',
          q: md`A LoRA adapter with $r = 8$ is attached to a $4096\times4096$ attention projection. How many trainable parameters does it add?`,
          answer: { kind: 'number', value: 65536 },
          explain: md`$r(d + k) = 8\cdot(4096 + 4096) = 65536$, about $0.39\%$ of the $16{,}777{,}216$ entries of the full matrix.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(0)
A = np.random.randn(6, 4) @ np.random.randn(4, 5)    # a 6x5 matrix of rank at most 4
U, s, Vt = np.linalg.svd(A, full_matrices=False)
print("singular values:", np.round(s, 4))
print("rank:", np.linalg.matrix_rank(A))

k = 2
Ak = U[:, :k] @ np.diag(s[:k]) @ Vt[:k]               # sign choices cancel in this product
print("||A - A_k||_F        =", round(float(np.linalg.norm(A - Ak)), 6))
print("sqrt(sum s_i^2, i>k) =", round(float(np.sqrt(np.sum(s[k:] ** 2))), 6))
print("||A - A_k||_2 =", round(float(np.linalg.norm(A - Ak, 2)), 6), " sigma_3 =", round(float(s[k]), 6))`,
          note: md`The product of two random factors with inner dimension 4 has rank 4, so the fifth singular value is zero up to rounding. Both error formulas of Eckart–Young check out numerically.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

A = np.array([[1.0, 2.0],
              [2.0, 4.0]])                 # rank 1: no ordinary inverse
b = np.array([1.0, 0.0])
x = np.linalg.pinv(A) @ b
print(np.round(x, 6))
print(np.round(np.linalg.lstsq(A, b, rcond=None)[0], 6))
print(np.round(A @ x, 6))                  # the projection of b onto Col A`,
          note: md`\`np.linalg.lstsq\` is SVD-based and returns the same minimum-norm solution as \`pinv\`. Problem 5 derives $(0.04, 0.08)$ by hand.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

d, k, r = 64, 48, 4
np.random.seed(1)
B = np.random.randn(d, r)          # LoRA factors: Delta W = B @ A
A = np.random.randn(r, k)
dW = B @ A
print("shape:", dW.shape, " rank:", np.linalg.matrix_rank(dW))
print("full update params:", d * k, " LoRA params:", r * (d + k))`,
          note: md`Change \`r\` and the sizes. The rank of $BA$ never exceeds $r$, however large $d$ and $k$ are.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'la08-2-ex',
            title: 'Best rank-k approximation',
            prompt: md`Write \`low_rank(A, k)\` that returns $A_k = \sum_{i\le k}\sigma_i\bu_i\bv_i\T$ using \`np.linalg.svd\`. Avoid Python loops over the terms: slice $U$, $\bs$ and $V\T$ and multiply.`,
            starter: `import numpy as np

def low_rank(A, k):
    U, s, Vt = np.linalg.svd(A, full_matrices=False)
    return A
`,
            solution: `import numpy as np

def low_rank(A, k):
    U, s, Vt = np.linalg.svd(A, full_matrices=False)
    return U[:, :k] @ np.diag(s[:k]) @ Vt[:k]
`,
            tests: [
              { expr: 'np.round(low_rank(np.array([[3.0, 0.0], [4.0, 5.0]]), 1), 6).tolist()', label: 'rank 1 of [[3,0],[4,5]]' },
              { expr: 'np.round(low_rank(np.array([[5.0, 5.0, 4.0, 1.0], [4.0, 5.0, 5.0, 1.0], [1.0, 0.0, 1.0, 5.0]]), 2), 4).tolist()', label: 'rank 2 of a 3×4 matrix' },
              { expr: 'np.round(low_rank(np.eye(3), 3), 6).tolist()', label: 'full rank returns the matrix' },
            ],
            hints: [md`\`U[:, :k]\` keeps the first $k$ columns, \`Vt[:k]\` the first $k$ rows.`, md`\`np.diag(s[:k])\` builds $\Sigma_k$; alternatively scale the columns with \`U[:, :k] * s[:k]\`.`],
            mustInclude: ['svd'],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *what does rank have to do with LoRA, and why does it work?* Answer in a few sentences.`,
          model: md`LoRA freezes a pretrained weight $W_0$ ($d\times k$) and learns the update as a product $BA$ with $B$ of shape $d\times r$ and $A$ of shape $r\times k$. The update therefore has rank at most $r$, and only $r(d + k)$ parameters are trained instead of $dk$; for $d = k = 4096$ and $r = 8$ that is about $0.4\%$. It works because the change needed to adapt a large pretrained model to a task appears to have low effective rank, the hypothesis the LoRA paper tested empirically, so a rank-$r$ update captures most of it, in the Eckart–Young sense. $B$ starts at zero so training begins at the pretrained model, and after training $W_0 + BA$ can be merged so inference has no extra cost. The trade-off: if the task needs a high-rank change, a small $r$ underfits.`,
        },
      ],
      cards: [
        { id: 'la08-2-c1', kind: 'concept', front: md`Eckart–Young: best rank-$k$ approximation and its errors.`, back: md`$A_k = \sum_{i\le k}\sigma_i\bu_i\bv_i\T$. $\lVert A - A_k\rVert_2 = \sigma_{k+1}$ and $\lVert A - A_k\rVert_F = \sqrt{\sum_{i>k}\sigma_i^2}$.` },
        { id: 'la08-2-c2', kind: 'compute', front: md`Singular values $6, 3, 2$. Energy captured by the best rank-1 approximation?`, answer: { kind: 'number', value: 36 / 49 }, back: md`$\frac{36}{36 + 9 + 4} = \frac{36}{49} \approx 0.735$.` },
        { id: 'la08-2-c3', kind: 'concept', front: md`Pseudo-inverse from the SVD, and what $A^+\bb$ is.`, back: md`$A^+ = \sum_{\sigma_i > 0}\frac{1}{\sigma_i}\bv_i\bu_i\T$. $A^+\bb$ is the minimum-norm least-squares solution.` },
        { id: 'la08-2-c4', kind: 'cloze', text: md`A LoRA update of rank $r$ on a $d\times k$ matrix has $r$ times $(d + {{}})$ trainable parameters.`, answers: ['k'] },
        { id: 'la08-2-c5', kind: 'concept', front: md`Why does a large condition number of the Hessian slow gradient descent?`, back: md`The step must satisfy $\eta < 2/\lambda_{\max}$, so the flattest direction shrinks by only about $1 - \lambda_{\min}/\lambda_{\max}$ per step; the step count grows like $\kappa$.` },
      ],
    },
    // ------------------------------------------------------------------ 8.3
    {
      id: 'la08-3',
      title: 'Principal component analysis',
      minutes: 40,
      objectives: [
        'Center a data matrix, form the covariance matrix and find the principal directions as its eigenvectors.',
        'Show that the principal directions are the right singular vectors of the centered data, with variances σᵢ²/(n − 1).',
        'Compute explained-variance ratios, project onto k components and reconstruct.',
        'Explain why PCA depends on feature scaling and why it fails on curved data.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Real features are correlated: height and weight, neighbouring pixels, the coordinates of an embedding. Most of the variation in such data lies along a few directions. **Principal component analysis** finds those directions, so the data can be described with fewer numbers. It is used to compress features before a downstream model, to visualize high-dimensional data in 2-D, to denoise, and to decorrelate inputs.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'PCA',
          md: md`Let $X$ be $n\times d$ (one sample per row), with column means $\bar\bx$.
1. Center: $X_c = X - \mathbf{1}\bar\bx\T$.
2. Covariance: $C = \frac{1}{n-1}X_c\T X_c$, a symmetric PSD $d\times d$ matrix.
3. Eigen-decompose $C = W\Lambda W\T$ with $\lambda_1 \ge \dots \ge \lambda_d \ge 0$. The columns $\bw_i$ are the **principal directions**, $\lambda_i$ the variance along each.
4. **Scores** (the data in the new coordinates): $Z_k = X_cW_k$, using the first $k$ columns.
5. **Reconstruction**: $\hat X = \mathbf{1}\bar\bx\T + Z_kW_k\T$.

The **explained-variance ratio** of component $i$ is $\lambda_i / \sum_j\lambda_j$.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          md: md`PC1 is the direction in which the cloud is most spread out. PC2 is the most spread-out direction perpendicular to PC1, and so on. Projecting onto the first $k$ keeps as much variance as any $k$-dimensional projection can.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.pca-cloud', theta: 30, ratio: 0.35 },
          task: md`Drag $\mathbf{w}$ around the centre. The variance of the orange projections is the third bar: when is it largest, and when smallest? Then raise the spread ratio toward 1. What happens to the explained-variance bars, and how stable is the direction of PC1?`,
          caption: md`The black dot is the mean $\bar\bx$; PCA works with the centered data. The arrows have length twice the standard deviation along each principal direction. When both variances are nearly equal, PC1 is poorly determined: a small change in the data can swing it.`,
        },
        {
          kind: 'derive',
          title: 'PC1 maximizes the projected variance',
          goal: md`Show that the unit vector $\bw$ maximizing the sample variance of the projections $X_c\bw$ is the top eigenvector of $C$.`,
          steps: [
            { md: md`The projections $z_i = \bw\cdot(\bx_i - \bar\bx)$ have mean 0 and sample variance $\frac{1}{n-1}\lVert X_c\bw\rVert^2 = \bw\T C\bw$.` },
            {
              md: md`So we maximize $\bw\T C\bw$ subject to $\lVert\bw\rVert = 1$. This is the Rayleigh quotient of lesson 7.3: write $\bw = \sum_i y_i\bq_i$ in the orthonormal eigenbasis of $C$, so $\bw\T C\bw = \sum_i\lambda_iy_i^2$ with $\sum_i y_i^2 = 1$.`,
              choose: {
                prompt: md`What is the best way to analyse $\max_{\lVert\bw\rVert=1}\bw\T C\bw$?`,
                options: [md`Expand $\bw$ in the eigenbasis of $C$`, md`Set the gradient of $\bw\T C\bw$ to zero without the constraint`, md`Choose $\bw$ along the coordinate axis with the largest variance`],
                answer: 0,
                explain: md`Without the constraint the objective is unbounded. The largest-variance coordinate axis is generally not the answer when features are correlated. In the eigenbasis the objective becomes a weighted average of the eigenvalues.`,
              },
            },
            { md: md`A weighted average of the $\lambda_i$ with weights $y_i^2$ is largest when all the weight is on $\lambda_1$: $\bw = \pm\bq_1$, with variance $\lambda_1$.` },
            { md: md`Restricting to $\bw \perp \bq_1$ removes $y_1$, and the same argument gives $\bq_2$ with variance $\lambda_2$, and so on.` },
          ],
          takeaway: md`The principal directions are the eigenvectors of the covariance matrix, and the eigenvalues are the variances along them. The sum of all $\lambda_i$ is $\tr C$, the total variance.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'PCA through the SVD',
          md: md`If $X_c = U\Sigma V\T$, then $$C = \frac{1}{n-1}X_c\T X_c = V\,\frac{\Sigma\T\Sigma}{n-1}\,V\T.$$ So the principal directions are the right singular vectors of the centered data ($W = V$), the variances are $\lambda_i = \sigma_i^2/(n-1)$, and the scores are $Z = X_cV = U\Sigma$. Library implementations typically compute PCA this way: it avoids forming $X_c\T X_c$, which would square the condition number.`,
        },
        {
          kind: 'callout',
          tone: 'example',
          title: 'Worked example',
          md: md`Four points: $(3, 1)$, $(1, 3)$, $(-1, -3)$, $(-3, -1)$. Their mean is $\bzero$.

1. $X_c\T X_c = \begin{bmatrix} 20 & 12 \\ 12 & 20 \end{bmatrix}$, so $C = \tfrac13\begin{bmatrix} 20 & 12 \\ 12 & 20 \end{bmatrix}$.
2. Eigenvalues $\tfrac{20 \pm 12}{3}$: $\lambda_1 = \tfrac{32}{3}$, $\lambda_2 = \tfrac83$, with $\bw_1 = \tfrac{1}{\sqrt2}(1, 1)$ and $\bw_2 = \tfrac{1}{\sqrt2}(1, -1)$.
3. Explained-variance ratio of PC1: $\frac{32/3}{40/3} = 0.8$.
4. Scores on PC1: $\bw_1\cdot(3, 1) = \tfrac{4}{\sqrt2} = 2\sqrt2$, and $2\sqrt2, -2\sqrt2, -2\sqrt2$ for the others.
5. Reconstruction of $(3, 1)$ from PC1 alone: $2\sqrt2\cdot\tfrac{1}{\sqrt2}(1, 1) = (2, 2)$. The error $(1, -1)$ points along PC2.`,
        },
        {
          kind: 'numeric',
          q: md`In the worked example, reconstruct the point $(1, 3)$ from PC1 alone.`,
          answer: { kind: 'vector', value: [2, 2] },
          explain: md`Its score is $\bw_1\cdot(1, 3) = \tfrac{4}{\sqrt2} = 2\sqrt2$, so the reconstruction is $2\sqrt2\cdot\tfrac{1}{\sqrt2}(1, 1) = (2, 2)$, the same as for $(3, 1)$. PC1 cannot tell these two points apart: their difference lies entirely along PC2.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'la08-3-paper',
            title: 'Reading a covariance matrix',
            type: 'apply',
            difficulty: 2,
            minutes: 10,
            statement: md`Two standardized-scale features have covariance $C = \begin{bmatrix} 5 & 2 \\ 2 & 2 \end{bmatrix}$. (a) Find the principal directions and variances. (b) What fraction of the variance does PC1 explain? (c) What is the variance of the data along the first coordinate axis, and why is it smaller than $\lambda_1$? Enter the fraction in (b).`,
            solution: [
              md`(a) $\tr C = 7$, $\det C = 6$: $\lambda_1 = 6$, $\lambda_2 = 1$. For $\lambda_1 = 6$: $C - 6I = \begin{bmatrix} -1 & 2 \\ 2 & -4 \end{bmatrix}$, so $\bw_1 = \tfrac{1}{\sqrt5}(2, 1)$. Then $\bw_2 = \tfrac{1}{\sqrt5}(1, -2)$.`,
              md`(b) $\frac{6}{6 + 1} = \frac67 \approx 0.857$.`,
              md`(c) Along $\be_1 = (1, 0)$ the variance is $\be_1\T C\be_1 = c_{11} = 5$. It is a Rayleigh quotient, so it lies between $\lambda_2 = 1$ and $\lambda_1 = 6$, and it equals $6$ only along $\bw_1$.`,
            ],
            answer: { kind: 'number', value: 6 / 7 },
          },
        },
        {
          kind: 'text',
          md: md`### Choosing k

Common choices are the smallest $k$ whose cumulative explained-variance ratio exceeds a threshold such as 90% or 95%, or the "elbow" of the plot of $\lambda_i$ against $i$ (a scree plot). When PCA is a preprocessing step, $k$ is a hyperparameter like any other: choose it by validation on the downstream task. Fit the mean and the components on the training data only, and apply the same transform to validation and test data.`,
        },
        {
          kind: 'callout',
          tone: 'warning',
          title: 'When PCA misleads',
          md: md`- **Units.** Variance depends on units. A feature measured in grams instead of kilograms has $10^6$ times the variance and will dominate PC1. Standardize features with different units first (this is PCA on the correlation matrix).
- **Curved structure.** PCA finds linear subspaces. Data on a curve or a curved surface may need many components, and the 1-D projection can merge points that are far apart along the curve. Kernel PCA, autoencoders, or for visualization t-SNE and UMAP, handle nonlinear structure.
- **Variance is not relevance.** The direction of largest variance need not separate classes (LDA targets that), and outliers can rotate the components.
- **Signs.** Each component is defined only up to sign; normalize signs before comparing results across runs or libraries.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.pca-pitfalls', mode: 'scale' },
          task: md`Slide the unit of $x_2$ from 0.1 to 10 and watch PC1 swing from the $x_1$ axis toward the $x_2$ axis, although the data are the same. Then switch on **standardize** and slide again.`,
          caption: md`The two features have correlation about $0.6$. Changing units multiplies one coordinate, and with it its variance, so it changes which direction has the largest variance. After standardizing, PC1 is the diagonal direction for every unit.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.pca-pitfalls', mode: 'curve' },
          task: md`The points lie on three quarters of a circle. Read the explained-variance ratio of PC1 and look at the red reconstructions. Find two points that are far apart along the arc but are reconstructed at the same place.`,
          caption: md`One number, the position along the arc, describes every point, but a single straight component explains only about two thirds of the variance. Projection onto the horizontal PC1 keeps only $x = 2.5\cos t$, so the points at $t = -45^\circ$ and $t = +45^\circ$, a quarter of the circle apart, land on the same spot.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(3)
n = 200
z = np.random.randn(n, 2) @ np.array([[3.0, 0.0], [0.0, 0.5]])
t = np.pi / 6
R = np.array([[np.cos(t), -np.sin(t)], [np.sin(t), np.cos(t)]])
X = z @ R.T + np.array([5.0, -2.0])         # a rotated, shifted cloud

Xc = X - X.mean(axis=0)
C = Xc.T @ Xc / (n - 1)

lam, W = np.linalg.eigh(C)                  # route 1: eigenvectors of the covariance
lam, W = lam[::-1], W[:, ::-1]              # descending
U, s, Vt = np.linalg.svd(Xc, full_matrices=False)   # route 2: SVD of the centered data

print("eigenvalues of C:  ", np.round(lam, 4))
print("s^2 / (n - 1):     ", np.round(s ** 2 / (n - 1), 4))
print("same directions:   ", np.allclose(np.abs(W.T), np.abs(Vt)))
print("explained variance:", np.round(lam / lam.sum(), 4))
print("PC1 angle (deg):   ", round(float(np.degrees(np.arctan(Vt[0, 1] / Vt[0, 0]))), 2))`,
          note: md`The cloud was built with standard deviations 3 and 0.5 along directions rotated by $30^\circ$, so the true variances are 9 and 0.25. The sample estimates are close, and PC1 comes out at about $31^\circ$. Comparing absolute values sidesteps the sign ambiguity; the angle formula uses a ratio, which is sign-free.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'la08-3-ex',
            title: 'PCA via the SVD, with sign normalization',
            prompt: md`Write \`pca(X, k)\` returning a tuple \`(components, evr, scores)\`:
- \`components\`: the first $k$ principal directions as rows, shape \`(k, d)\`, each with its largest-magnitude entry made positive;
- \`evr\`: the explained-variance ratios of those $k$ components, shape \`(k,)\`;
- \`scores\`: the centered data projected onto the components, shape \`(n, k)\`.

Use \`np.linalg.svd\` on the centered data. No loops are needed.`,
            starter: `import numpy as np

def pca(X, k):
    Xc = X - X.mean(axis=0)
    U, s, Vt = np.linalg.svd(Xc, full_matrices=False)
    # 1. flip the sign of each row of Vt so its largest-|.| entry is positive
    # 2. explained-variance ratios from s
    # 3. scores = Xc projected onto the first k rows
    comps = Vt[:k]
    evr = s[:k]
    scores = Xc @ comps.T
    return comps, evr, scores
`,
            solution: `import numpy as np

def pca(X, k):
    Xc = X - X.mean(axis=0)
    U, s, Vt = np.linalg.svd(Xc, full_matrices=False)
    idx = np.argmax(np.abs(Vt), axis=1)
    signs = np.sign(Vt[np.arange(Vt.shape[0]), idx])
    Vt = Vt * signs[:, None]
    comps = Vt[:k]
    evr = (s ** 2 / np.sum(s ** 2))[:k]
    scores = Xc @ comps.T
    return comps, evr, scores
`,
            tests: [
              { expr: 'np.round(pca(np.array([[3.0, 1.0], [1.0, 3.0], [-1.0, -3.0], [-3.0, -1.0]]), 1)[0], 6).tolist()', label: 'components, worked example' },
              { expr: 'np.round(pca(np.array([[3.0, 1.0], [1.0, 3.0], [-1.0, -3.0], [-3.0, -1.0]]), 1)[1], 6).tolist()', label: 'EVR, worked example' },
              { expr: 'np.round(pca(np.array([[3.0, 1.0], [1.0, 3.0], [-1.0, -3.0], [-3.0, -1.0]]), 1)[2], 6).tolist()', label: 'scores, worked example' },
              { expr: 'np.round(pca(np.array([[2.0, 0.0, 1.0], [0.0, 1.0, 3.0], [4.0, 1.0, 0.0], [1.0, 3.0, 2.0], [3.0, 2.0, 4.0]]), 2)[0], 6).tolist()', label: 'components, 5×3 data' },
              { expr: 'np.round(pca(np.array([[2.0, 0.0, 1.0], [0.0, 1.0, 3.0], [4.0, 1.0, 0.0], [1.0, 3.0, 2.0], [3.0, 2.0, 4.0]]), 2)[1], 6).tolist()', label: 'EVR, 5×3 data' },
            ],
            hints: [md`\`np.argmax(np.abs(Vt), axis=1)\` gives, for each row, the column of its largest-magnitude entry. Index with \`Vt[np.arange(Vt.shape[0]), idx]\` to get those entries.`, md`The variances are proportional to \`s ** 2\`; divide by their sum.`],
            mustInclude: ['svd'],
          },
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *what is the relationship between PCA and the SVD, and which would you use to compute PCA?*`,
          model: md`PCA is the eigen-decomposition of the covariance matrix $C = \frac{1}{n-1}X_c\T X_c$ of the centered data. If $X_c = U\Sigma V\T$, then $C = V\frac{\Sigma^2}{n-1}V\T$: the principal directions are the right singular vectors of $X_c$, the component variances are $\sigma_i^2/(n-1)$, and the scores are $U\Sigma$. So the SVD is a way to compute PCA, and PCA is the SVD applied to centered (often standardized) data. I would compute it with the SVD of $X_c$: it avoids forming $X_c\T X_c$, which squares the condition number, and for large data a truncated or randomized SVD gives just the top $k$ components. Centering matters: an SVD of uncentered data finds directions dominated by the mean.`,
        },
      ],
      cards: [
        { id: 'la08-3-c1', kind: 'concept', front: md`PCA in four steps.`, back: md`Center $X$; covariance $C = X_c\T X_c/(n-1)$; eigenvectors of $C$ (or right singular vectors of $X_c$) sorted by eigenvalue; project $Z = X_cW_k$.` },
        { id: 'la08-3-c2', kind: 'compute', front: md`Covariance eigenvalues $9, 3, 0.5, 0.5$. Explained-variance ratio of the first two components together?`, answer: { kind: 'number', value: 12 / 13 }, back: md`$\frac{9 + 3}{13} = \frac{12}{13} \approx 0.923$.` },
        { id: 'la08-3-c3', kind: 'cloze', text: md`If $X_c = U\Sigma V\T$, the variance along the $i$-th principal direction is $\sigma_i^2$ divided by {{}}.`, answers: ['n-1'] },
        { id: 'la08-3-c4', kind: 'concept', front: md`Why standardize before PCA when features have different units?`, back: md`Variance scales with the square of the unit, so a feature in small units dominates PC1 for no real reason. Standardizing (PCA on the correlation matrix) removes the units.` },
        { id: 'la08-3-c5', kind: 'concept', front: md`Name two situations where PCA gives a misleading low-dimensional picture.`, back: md`Curved (nonlinear) structure, where no linear subspace fits; and when the high-variance directions are not the relevant ones (e.g. for class separation), or are driven by outliers or by unit choices.` },
      ],
    },
  ],
  problems: [
    {
      id: 'la08-p1',
      title: 'Singular values of a shear',
      type: 'compute',
      difficulty: 2,
      minutes: 8,
      statement: md`Find the singular values of $S = \begin{bmatrix} 1 & 1 \\ 0 & 1 \end{bmatrix}$ and compare with its eigenvalues. Verify $\sigma_1\sigma_2 = |\det S|$. Enter the singular values.`,
      solution: [
        md`$S\T S = \begin{bmatrix} 1 & 1 \\ 1 & 2 \end{bmatrix}$, with trace $3$ and determinant $1$.`,
        md`$\lambda^2 - 3\lambda + 1 = 0$ gives $\lambda = \frac{3 \pm \sqrt5}{2}$, so $\sigma = \sqrt{\tfrac{3 \pm \sqrt5}{2}} = \frac{\sqrt5 \pm 1}{2}$ (check: $\left(\tfrac{\sqrt5 + 1}{2}\right)^2 = \tfrac{6 + 2\sqrt5}{4} = \tfrac{3 + \sqrt5}{2}$).`,
        md`$\sigma_1 \approx 1.618$, $\sigma_2 \approx 0.618$, while both eigenvalues are 1. Product: $\tfrac{(\sqrt5+1)(\sqrt5-1)}{4} = 1 = |\det S|$.`,
      ],
      answer: { kind: 'set', value: [(1 + Math.sqrt(5)) / 2, (Math.sqrt(5) - 1) / 2] },
    },
    {
      id: 'la08-p2',
      title: 'Full SVD of a 3×2 matrix',
      type: 'compute',
      difficulty: 2,
      minutes: 12,
      statement: md`Compute the SVD of $A = \begin{bmatrix} 1 & 0 \\ 0 & 1 \\ 1 & 1 \end{bmatrix}$: singular values, $\bv_1, \bv_2$, $\bu_1, \bu_2$, and a unit vector $\bu_3$ completing $U$. Enter the singular values.`,
      solution: [
        md`$A\T A = \begin{bmatrix} 2 & 1 \\ 1 & 2 \end{bmatrix}$, eigenvalues $3, 1$, eigenvectors $\bv_1 = \tfrac{1}{\sqrt2}(1, 1)$, $\bv_2 = \tfrac{1}{\sqrt2}(1, -1)$. So $\sigma_1 = \sqrt3$, $\sigma_2 = 1$.`,
        md`$\bu_1 = A\bv_1/\sqrt3 = \tfrac{1}{\sqrt2}(1, 1, 2)/\sqrt3 = \tfrac{1}{\sqrt6}(1, 1, 2)$.`,
        md`$\bu_2 = A\bv_2/1 = \tfrac{1}{\sqrt2}(1, -1, 0)$.`,
        md`$\bu_3$ spans $\Null A\T$: solve $x_1 + x_3 = 0$, $x_2 + x_3 = 0$, giving $\bu_3 = \tfrac{1}{\sqrt3}(1, 1, -1)$. Check orthogonality with $\bu_1$: $1 + 1 - 2 = 0$.`,
      ],
      answer: { kind: 'set', value: [Math.sqrt(3), 1] },
    },
    {
      id: 'la08-p3',
      title: 'The spectral norm is the largest singular value',
      type: 'proof',
      difficulty: 2,
      minutes: 10,
      statement: md`Prove that $\max_{\lVert\bx\rVert = 1}\lVert A\bx\rVert = \sigma_1$, attained at $\bx = \bv_1$. Deduce that $\lVert A\bx\rVert \le \sigma_1\lVert\bx\rVert$ for all $\bx$.`,
      hints: [md`$\lVert A\bx\rVert^2 = \bx\T A\T A\bx$, a Rayleigh quotient of $A\T A$.`],
      solution: [
        md`$\lVert A\bx\rVert^2 = \bx\T(A\T A)\bx$. $A\T A$ is symmetric with largest eigenvalue $\sigma_1^2$ and eigenvector $\bv_1$.`,
        md`By the Rayleigh-quotient bound (Module 7, lesson 3 problem), $\bx\T A\T A\bx \le \sigma_1^2$ for unit $\bx$, with equality at $\bx = \bv_1$.`,
        md`Taking square roots: $\max_{\lVert\bx\rVert=1}\lVert A\bx\rVert = \sigma_1$.`,
        md`For general $\bx \ne \bzero$, apply this to $\bx/\lVert\bx\rVert$ and multiply by $\lVert\bx\rVert$: $\lVert A\bx\rVert \le \sigma_1\lVert\bx\rVert$.`,
      ],
      rubric: [md`Rewrites $\lVert A\bx\rVert^2$ as a quadratic form in $A\T A$`, md`Uses the Rayleigh-quotient bound with $\lambda_{\max}(A\T A) = \sigma_1^2$`, md`Equality case and the scaling argument`],
      areas: ['math', 'ml-depth'],
    },
    {
      id: 'la08-p4',
      title: 'A best rank-1 approximation',
      type: 'compute',
      difficulty: 2,
      minutes: 8,
      statement: md`Using the SVD of $A = \begin{bmatrix} 3 & 0 \\ 4 & 5 \end{bmatrix}$ from lesson 8.1, compute $A_1 = \sigma_1\bu_1\bv_1\T$ and the errors $\lVert A - A_1\rVert_2$ and $\lVert A - A_1\rVert_F$. Enter $A_1$.`,
      solution: [
        md`$\sigma_1 = 3\sqrt5$, $\bu_1 = \tfrac{1}{\sqrt{10}}(1, 3)$, $\bv_1 = \tfrac{1}{\sqrt2}(1, 1)$.`,
        md`$A_1 = \frac{3\sqrt5}{\sqrt{20}}\begin{bmatrix} 1 \\ 3 \end{bmatrix}\begin{bmatrix} 1 & 1 \end{bmatrix} = \frac32\begin{bmatrix} 1 & 1 \\ 3 & 3 \end{bmatrix} = \begin{bmatrix} 1.5 & 1.5 \\ 4.5 & 4.5 \end{bmatrix}$.`,
        md`$A - A_1 = \begin{bmatrix} 1.5 & -1.5 \\ -0.5 & 0.5 \end{bmatrix}$. Its Frobenius norm is $\sqrt{2.25 + 2.25 + 0.25 + 0.25} = \sqrt5$, and it is rank 1, so its spectral norm is also $\sqrt5 = \sigma_2$, as Eckart–Young predicts.`,
      ],
      answer: { kind: 'matrix', value: [[1.5, 1.5], [4.5, 4.5]] },
    },
    {
      id: 'la08-p5',
      title: 'Minimum-norm least squares',
      type: 'compute',
      difficulty: 2,
      minutes: 8,
      statement: md`Let $A = \begin{bmatrix} 1 & 2 \\ 2 & 4 \end{bmatrix}$ and $\bb = (1, 0)$. $A$ is singular, so the normal equations have infinitely many solutions. Find $A^+$ and the minimum-norm least-squares solution $\bx^+ = A^+\bb$. Enter $\bx^+$.`,
      solution: [
        md`$A = \begin{bmatrix} 1 \\ 2 \end{bmatrix}\begin{bmatrix} 1 & 2 \end{bmatrix} = 5\,\bu\bv\T$ with $\bu = \bv = \tfrac{1}{\sqrt5}(1, 2)$, so $\sigma_1 = 5$.`,
        md`$A^+ = \tfrac15\bv\bu\T = \tfrac{1}{25}\begin{bmatrix} 1 & 2 \\ 2 & 4 \end{bmatrix}$.`,
        md`$\bx^+ = \tfrac{1}{25}(1, 2) = (0.04, 0.08)$.`,
        md`Check: $A\bx^+ = (0.2, 0.4)$, the projection of $(1, 0)$ onto $\Span\{(1, 2)\}$, which is $\tfrac15(1, 2)$. Any solution $\bx^+ + t(2, -1)$ fits equally well; $\bx^+$ has no component along $\Null A = \Span\{(2, -1)\}$, so it is the shortest.`,
      ],
      answer: { kind: 'vector', value: [0.04, 0.08] },
    },
    {
      id: 'la08-p6',
      title: 'PCA by hand',
      type: 'compute',
      difficulty: 1,
      minutes: 8,
      statement: md`Run PCA on the four points $(1, 2)$, $(-1, -2)$, $(2, 1)$, $(-2, -1)$: covariance, principal directions, and the explained-variance ratio of PC1. Enter the ratio.`,
      solution: [
        md`The mean is $\bzero$. $X\T X = \begin{bmatrix} 1 + 1 + 4 + 4 & 2 + 2 + 2 + 2 \\ 8 & 4 + 4 + 1 + 1 \end{bmatrix} = \begin{bmatrix} 10 & 8 \\ 8 & 10 \end{bmatrix}$, so $C = \tfrac13\begin{bmatrix} 10 & 8 \\ 8 & 10 \end{bmatrix}$.`,
        md`Eigenvalues $\tfrac{10 \pm 8}{3}$: $6$ and $\tfrac23$, with directions $\tfrac{1}{\sqrt2}(1, 1)$ and $\tfrac{1}{\sqrt2}(1, -1)$.`,
        md`Explained-variance ratio of PC1: $\frac{6}{6 + 2/3} = \frac{18}{20} = 0.9$.`,
      ],
      answer: { kind: 'number', value: 0.9 },
    },
    {
      id: 'la08-p7',
      title: 'Counting LoRA parameters',
      type: 'apply',
      difficulty: 1,
      minutes: 5,
      statement: md`A transformer's MLP up-projection has shape $4096\times11008$. (a) How many parameters does a rank-16 LoRA adapter on it train? (b) What fraction of the full matrix is that? (c) What is the largest possible rank of the learned update? Enter (a).`,
      solution: [
        md`(a) $r(d + k) = 16\cdot(4096 + 11008) = 16\cdot15104 = 241664$.`,
        md`(b) The full matrix has $4096\cdot11008 = 45{,}088{,}768$ entries, so the fraction is about $0.54\%$.`,
        md`(c) $\rank(BA) \le r = 16$.`,
      ],
      answer: { kind: 'number', value: 241664 },
      areas: ['llm', 'math'],
    },
    {
      id: 'la08-p8',
      title: 'PCA from the SVD of the data',
      type: 'derive',
      difficulty: 2,
      minutes: 10,
      statement: md`Let $X_c$ ($n\times d$) be centered with SVD $X_c = U\Sigma V\T$. Show that the covariance matrix is $C = V\frac{\Sigma\T\Sigma}{n-1}V\T$, that the scores are $X_cV = U\Sigma$, and that the scores of different components are uncorrelated.`,
      solution: [
        md`$C = \frac{1}{n-1}X_c\T X_c = \frac{1}{n-1}V\Sigma\T U\T U\Sigma V\T = V\frac{\Sigma\T\Sigma}{n-1}V\T$, since $U\T U = I$. This is an orthogonal diagonalization, so $V$ holds the principal directions and $\sigma_i^2/(n-1)$ the variances.`,
        md`Scores: $Z = X_cV = U\Sigma V\T V = U\Sigma$.`,
        md`The scores are centered (they are linear combinations of centered columns), so their covariance is $\frac{1}{n-1}Z\T Z = \frac{1}{n-1}\Sigma\T U\T U\Sigma = \frac{\Sigma\T\Sigma}{n-1}$, which is diagonal: different components are uncorrelated.`,
      ],
      rubric: [md`Covariance derived using $U\T U = I$`, md`Scores equal $U\Sigma$ using $V\T V = I$`, md`Covariance of the scores is diagonal`],
      areas: ['math', 'ml-depth'],
    },
    {
      id: 'la08-p9',
      title: 'Condition numbers and lost digits',
      type: 'concept',
      difficulty: 2,
      minutes: 6,
      statement: md`A design matrix $X$ has singular values from $100$ down to $0.01$. What are $\kappa(X)$ and $\kappa(X\T X)$? Using the rule of thumb that about $\log_{10}\kappa$ of the 16 significant digits of double precision can be lost, compare solving least squares by QR and by the normal equations. Name two remedies. Enter $\kappa(X\T X)$.`,
      solution: [
        md`$\kappa(X) = 100/0.01 = 10^4$, and $\kappa(X\T X) = \kappa(X)^2 = 10^8$.`,
        md`QR or SVD works with $\kappa = 10^4$ and may lose about 4 digits, keeping about 12. The normal equations work with $10^8$ and may lose about 8, keeping about 8.`,
        md`Remedies: standardize or rescale the features; remove or combine nearly collinear features; add ridge regularization, which replaces the small $\sigma_i^2$ by $\sigma_i^2 + \lambda$; use a QR- or SVD-based solver.`,
      ],
      answer: { kind: 'number', value: 1e8 },
    },
    {
      id: 'la08-p10',
      title: 'PCA in NumPy, on paper',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 10,
      statement: md`Write NumPy code that fits PCA on a training matrix \`X_train\` of shape $(n, d)$ and returns a function that transforms new data \`X_new\` to $k$ components. State the shape of every intermediate array and explain how you make the output independent of the SVD's sign choices.`,
      solution: [
        md`\`mu = X_train.mean(axis=0)\`, shape $(d,)$. \`Xc = X_train - mu\`, shape $(n, d)$.`,
        md`\`U, s, Vt = np.linalg.svd(Xc, full_matrices=False)\`: \`U\` $(n, m)$, \`s\` $(m,)$, \`Vt\` $(m, d)$ with $m = \min(n, d)$.`,
        md`Sign normalization: for each row of \`Vt\`, find the entry of largest magnitude and multiply the row by its sign, so that entry is positive. \`W = Vt[:k].T\`, shape $(d, k)$.`,
        md`Transform: \`lambda X_new: (X_new - mu) @ W\`, shape $(n_{\text{new}}, k)$. The mean and $W$ come from the training data only, so no information leaks from the test set.`,
        md`Optionally return \`evr = s**2 / np.sum(s**2)\` to report the explained variance.`,
      ],
      rubric: [md`Centers with the training mean and reuses it for new data`, md`Correct SVD call and shapes`, md`Explicit sign normalization`, md`Projection with the right transpose and shape $(n, k)$`],
      areas: ['ml-coding'],
    },
  ],
};
