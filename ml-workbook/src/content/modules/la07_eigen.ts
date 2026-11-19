import { md, type Module } from '../types';

export const MODULE: Module = {
  id: 'la07',
  part: 'la',
  order: 7,
  title: 'Eigenvalues and eigenvectors',
  summary: 'Directions a matrix only stretches, the characteristic polynomial, diagonalization and dynamics, Markov chains and PageRank, power iteration, symmetric matrices and definiteness.',
  relevance: md`PCA takes the eigenvectors of a covariance matrix, PageRank is the eigenvector for eigenvalue 1 of a Markov matrix, and power iteration (the algorithm behind both) also estimates the largest singular value in spectral normalization. The eigenvalues of a Hessian describe the curvature of a loss: their signs separate minima from saddle points, and the largest one limits the stable learning rate of gradient descent. In a linear recurrence $\bh_t = W\bh_{t-1}$, the eigenvalues of $W$ decide whether signals and gradients explode or vanish. Computing eigenvalues of a $2\times2$ matrix by hand and explaining positive semidefiniteness are routine interview tasks.`,
  areas: ['math', 'ml-depth'],
  prereqs: ['la06'],
  lessons: [
    // ------------------------------------------------------------------ 7.1
    {
      id: 'la07-1',
      title: 'Eigenvectors: the directions a matrix only stretches',
      minutes: 35,
      objectives: [
        'State Av = λv and recognize an eigenvector as a direction that A maps onto its own line.',
        'Compute the eigenvalues of a 2×2 matrix from its characteristic polynomial, and an eigenvector for each.',
        'Check eigenvalues with trace = λ₁ + λ₂ and determinant = λ₁λ₂.',
        'Read complex eigenvalues of a real 2×2 matrix as a rotation combined with a scaling.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A matrix usually changes the direction of the vectors it acts on. For most matrices a few special directions are only stretched, shrunk or flipped. Along such a direction, applying the matrix $k$ times is just multiplying by a number $k$ times, which makes repeated application easy to analyse. Power iteration, PageRank, PCA, and the stability of recurrent networks and of gradient descent all come down to these directions.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Eigenvalue, eigenvector',
          md: md`A nonzero vector $\bv$ is an **eigenvector** of the square matrix $A$ with **eigenvalue** $\lambda$ if $$A\bv = \lambda\bv.$$ Every nonzero multiple of $\bv$ is also an eigenvector for $\lambda$. The eigenvectors for $\lambda$, together with $\bzero$, form the **eigenspace** $\Null(A - \lambda I)$.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          md: md`An eigenvector is a direction that $A$ maps onto its own line. The eigenvalue says what happens along that line: stretched ($\lambda > 1$), shrunk ($0 < \lambda < 1$), flipped ($\lambda < 0$), or collapsed to $\bzero$ ($\lambda = 0$).`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.eigen-drag', matrix: [[3, 1], [0, 2]], angle: 60 },
          task: md`Drag $\bv$ around the circle until $A\bv$ lies on the line of $\bv$. Find both eigen-directions (treat $\bv$ and $-\bv$ as one) and read $\lambda$ for each. Then try the **flip**, **shear** and **rotation** presets. How many eigen-directions does each have?`,
          caption: md`The dashed curve is the image of the whole unit circle. An eigen-direction is where the arrow $A\bv$ points along $\bv$ (or exactly against it, for a negative $\lambda$). The shear has a single eigen-direction, and the $90^\circ$ rotation has none: its eigenvalues are complex.`,
        },
        {
          kind: 'numeric',
          q: md`Let $A = \begin{bmatrix} 2 & 1 \\ 1 & 2 \end{bmatrix}$. Compute $A\begin{bmatrix} 1 \\ 1 \end{bmatrix}$ and give the eigenvalue for which $(1, 1)$ is an eigenvector.`,
          answer: { kind: 'number', value: 3 },
          explain: md`$A(1, 1) = (3, 3) = 3\,(1, 1)$, so $\lambda = 3$.`,
        },
        {
          kind: 'derive',
          title: 'the characteristic polynomial',
          goal: md`Find an equation for the eigenvalues of $A = \begin{bmatrix} a & b \\ c & d \end{bmatrix}$ that does not involve $\bv$.`,
          steps: [
            { md: md`$A\bv = \lambda\bv$ is the same as $(A - \lambda I)\bv = \bzero$.` },
            {
              md: md`We need a **nonzero** $\bv$ in $\Null(A - \lambda I)$. That happens exactly when $A - \lambda I$ is singular: $$\det(A - \lambda I) = 0.$$`,
              choose: {
                prompt: md`When does $(A - \lambda I)\bv = \bzero$ have a solution $\bv \neq \bzero$?`,
                options: [md`When $\det(A - \lambda I) = 0$`, md`When $A - \lambda I$ is invertible`, md`Always, because $\bv = \bzero$ works`],
                answer: 0,
                explain: md`An invertible matrix has only the trivial null space. A nonzero null vector exists iff the matrix is singular, iff its determinant is zero (the module on determinants).`,
              },
            },
            { md: md`For a $2\times 2$ matrix: $$\det\begin{bmatrix} a - \lambda & b \\ c & d - \lambda \end{bmatrix} = \lambda^2 - (a + d)\lambda + (ad - bc).$$` },
            { md: md`So the eigenvalues are the roots of $p(\lambda) = \lambda^2 - (\tr A)\,\lambda + \det A$: $$\lambda = \frac{\tr A \pm \sqrt{(\tr A)^2 - 4\det A}}{2}.$$` },
          ],
          takeaway: md`For each root $\lambda$, find the eigenvectors by solving $(A - \lambda I)\bv = \bzero$. For a $2\times2$ matrix, one row of $A - \lambda I$ is enough: if that row is $(p, q) \ne (0, 0)$, then $\bv = (q, -p)$.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Trace and determinant',
          md: md`Counting complex eigenvalues and multiplicities, an $n\times n$ matrix has $n$ eigenvalues $\lambda_1, \dots, \lambda_n$ and $$\lambda_1 + \dots + \lambda_n = \tr A, \qquad \lambda_1\lambda_2\cdots\lambda_n = \det A.$$ For $2\times2$ this can be read off $p(\lambda) = (\lambda - \lambda_1)(\lambda - \lambda_2) = \lambda^2 - (\lambda_1 + \lambda_2)\lambda + \lambda_1\lambda_2$. It is a fast check on hand computations.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.charpoly', matrix: [[4, 1], [2, 3]] },
          task: md`Edit the entries of $A$ and watch the parabola move. Use the presets to see a repeated root and a complex pair. Then make $\det A$ negative: why are the eigenvalues then always real, with opposite signs?`,
          caption: md`$p(0) = \det A$ and the vertex sits at $\lambda = \tfrac12\tr A$. If $\det A < 0$ the parabola is below the axis at $0$, so it crosses on both sides of $0$.`,
        },
        {
          kind: 'callout',
          tone: 'example',
          title: 'Worked example',
          md: md`$A = \begin{bmatrix} 4 & 1 \\ 2 & 3 \end{bmatrix}$: $\tr A = 7$, $\det A = 10$, so $p(\lambda) = \lambda^2 - 7\lambda + 10 = (\lambda - 5)(\lambda - 2)$.

- $\lambda = 5$: $A - 5I = \begin{bmatrix} -1 & 1 \\ 2 & -2 \end{bmatrix}$, so $\bv_1 = (1, 1)$.
- $\lambda = 2$: $A - 2I = \begin{bmatrix} 2 & 1 \\ 2 & 1 \end{bmatrix}$, so $\bv_2 = (1, -2)$.

Check: $A(1, -2) = (2, -4) = 2(1, -2)$, and $5 + 2 = 7$, $5\cdot 2 = 10$.`,
        },
        {
          kind: 'numeric',
          q: md`Find both eigenvalues of $\begin{bmatrix} 1 & 2 \\ 2 & 1 \end{bmatrix}$.`,
          answer: { kind: 'set', value: [3, -1] },
          inputHint: 'two numbers, e.g. 3, -1',
          explain: md`$\tr = 2$, $\det = 1 - 4 = -3$, so $\lambda^2 - 2\lambda - 3 = (\lambda - 3)(\lambda + 1)$. Check: $3 + (-1) = 2$ and $3\cdot(-1) = -3$.`,
        },
        {
          kind: 'numeric',
          q: md`Give an eigenvector of $\begin{bmatrix} 1 & 2 \\ 2 & 1 \end{bmatrix}$ for $\lambda = -1$.`,
          answer: { kind: 'vector', value: [1, -1], upToScale: true },
          explain: md`$A + I = \begin{bmatrix} 2 & 2 \\ 2 & 2 \end{bmatrix}$, so $2v_1 + 2v_2 = 0$ and $\bv = (1, -1)$, or any nonzero multiple.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'la07-1-paper',
            title: 'Eigenvalues of a triangular matrix',
            type: 'derive',
            difficulty: 1,
            minutes: 8,
            statement: md`Show that the eigenvalues of an upper triangular $2\times2$ matrix $\begin{bmatrix} a & b \\ 0 & d \end{bmatrix}$ are $a$ and $d$. Then find an eigenvector of $\begin{bmatrix} 3 & 1 \\ 0 & 2 \end{bmatrix}$ for each eigenvalue. Enter the eigenvector for $\lambda = 2$.`,
            solution: [
              md`$\det\begin{bmatrix} a - \lambda & b \\ 0 & d - \lambda \end{bmatrix} = (a - \lambda)(d - \lambda)$: the determinant of a triangular matrix is the product of its diagonal. The roots are $\lambda = a$ and $\lambda = d$.`,
              md`For $A = \begin{bmatrix} 3 & 1 \\ 0 & 2 \end{bmatrix}$ and $\lambda = 3$: $A - 3I = \begin{bmatrix} 0 & 1 \\ 0 & -1 \end{bmatrix}$ forces $v_2 = 0$, so $\bv = (1, 0)$.`,
              md`For $\lambda = 2$: $A - 2I = \begin{bmatrix} 1 & 1 \\ 0 & 0 \end{bmatrix}$ gives $v_1 + v_2 = 0$, so $\bv = (1, -1)$. Check: $A(1, -1) = (2, -2)$.`,
              md`These are the two directions you found in the eigen-drag figure. They are not perpendicular: only symmetric matrices are guaranteed perpendicular eigenvectors (lesson 7.3).`,
            ],
            answer: { kind: 'vector', value: [1, -1], upToScale: true },
            rubric: [md`Determinant of the triangular $A - \lambda I$ as the product of the diagonal`, md`Both eigenvectors found from the null space of $A - \lambda I$`, md`At least one eigenvector checked by multiplying`],
          },
        },
        {
          kind: 'text',
          md: md`### Complex eigenvalues are rotations

The rotation $R_\theta = \begin{bmatrix} \cos\theta & -\sin\theta \\ \sin\theta & \cos\theta \end{bmatrix}$ moves every nonzero vector off its line unless $\theta$ is $0$ or $180^\circ$, so it has no real eigenvectors. Its characteristic polynomial $\lambda^2 - 2\cos\theta\,\lambda + 1$ has discriminant $4\cos^2\theta - 4 < 0$, and the roots are the complex pair $$\lambda = \cos\theta \pm i\sin\theta = e^{\pm i\theta}.$$

The same holds for any real $2\times2$ matrix with eigenvalues $a \pm bi$ ($b \ne 0$). Write $r = |\lambda| = \sqrt{a^2 + b^2} = \sqrt{\det A}$ and $\theta = \arg\lambda$. In a suitable (generally skewed) coordinate system, $A$ acts as $r\,R_\theta$: each application turns by $\theta$ and scales by $r$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.eigen-orbit', matrix: [[0.9, -0.4], [0.4, 0.9]], x0: [3, 0.5], steps: 30 },
          task: md`The orbit is $\bx_0, A\bx_0, A^2\bx_0, \dots$. For **spiral out**, predict $|\lambda|$ from $\det A = 1.25$ before you read it. For **quarter turn**, how many steps bring the orbit back to $\bx_0$?`,
          caption: md`For **spiral in**, $\lambda = 0.9 \pm 0.4i$, so $|\lambda| = \sqrt{0.97} \approx 0.985$ and $\arg\lambda \approx 24^\circ$: each step turns by about $24^\circ$ and shrinks by about $1.5\%$. The quarter turn has $\lambda = \pm i$, $|\lambda| = 1$, and returns after 4 steps.`,
        },
        {
          kind: 'check',
          q: md`What are the eigenvalues of $\begin{bmatrix} 0 & -1 \\ 1 & 0 \end{bmatrix}$?`,
          options: [md`$i$ and $-i$`, md`$1$ and $-1$`, md`$0$ and $1$`, md`It has no eigenvalues`],
          answer: 0,
          explain: md`$\tr = 0$ and $\det = 1$, so $\lambda^2 + 1 = 0$ and $\lambda = \pm i$. Every square matrix has $n$ eigenvalues if complex ones are counted; this one has no real eigenvector because it rotates by $90^\circ$.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

A = np.array([[4.0, 1.0],
              [2.0, 3.0]])
vals = np.linalg.eigvals(A)        # complex dtype in NumPy 2.x, even when real
print(np.round(np.sort(vals.real), 6))`,
          predict: {
            q: md`This is the worked example. What is printed?`,
            options: ['`[2. 5.]`', '`[5. 2.]`', '`[2 5]`', '`[ 7. 10.]`'],
            answer: 0,
            explain: md`The eigenvalues are 2 and 5, sorted ascending. \`np.linalg.eigvals\` returns a complex array in recent NumPy, so the code takes \`.real\` before printing.`,
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

A = np.array([[4.0, 1.0],
              [2.0, 3.0]])
w, V = np.linalg.eig(A)
w, V = w.real, V.real               # both eigenvalues are real here
order = np.argsort(w)[::-1]         # largest first
for i in order:
    v = V[:, i] / V[:, i][np.argmax(np.abs(V[:, i]))]   # scale: largest entry = 1
    print("lambda =", round(float(w[i]), 6), " v =", np.round(v, 6),
          " Av = lambda v:", np.allclose(A @ V[:, i], w[i] * V[:, i]))
print("trace:", np.trace(A), " sum:", round(float(w.sum()), 6))
print("det:  ", round(float(np.linalg.det(A)), 6), " product:", round(float(w.prod()), 6))`,
          note: md`\`np.linalg.eig\` returns unit eigenvectors as the **columns** of \`V\`, with arbitrary signs that differ between libraries. Rescaling each so its largest entry is 1 makes the output reproducible: $(1, 1)$ and $(-0.5, 1)$, a multiple of $(1, -2)$.`,
        },
        {
          kind: 'recall',
          prompt: md`From memory: the definition of an eigenvector, the characteristic polynomial of a $2\times2$ matrix, and the two identities linking eigenvalues to the trace and determinant.`,
          answer: md`$A\bv = \lambda\bv$ with $\bv \ne \bzero$. $p(\lambda) = \det(A - \lambda I) = \lambda^2 - (\tr A)\lambda + \det A$. $\lambda_1 + \lambda_2 = \tr A$ and $\lambda_1\lambda_2 = \det A$.`,
        },
      ],
      cards: [
        { id: 'la07-1-c1', kind: 'concept', front: md`Geometric meaning of an eigenvector and its eigenvalue.`, back: md`A direction $A$ maps onto its own line. The eigenvalue is the factor along that line (negative means flipped, zero means collapsed).` },
        { id: 'la07-1-c2', kind: 'compute', front: md`Eigenvalues of $\begin{bmatrix} 6 & -2 \\ 2 & 1 \end{bmatrix}$.`, answer: { kind: 'set', value: [5, 2] }, back: md`$\tr = 7$, $\det = 6 + 4 = 10$: $\lambda^2 - 7\lambda + 10 = (\lambda - 5)(\lambda - 2)$.` },
        { id: 'la07-1-c3', kind: 'cloze', text: md`The eigenvalues of a $2\times2$ matrix are the roots of $\lambda^2 - (\tr A)\lambda + {{}}$.`, answers: ['det A'] },
        { id: 'la07-1-c4', kind: 'concept', front: md`What do complex eigenvalues $a \pm bi$ of a real $2\times2$ matrix mean geometrically?`, back: md`Rotation combined with scaling: each application turns by $\arg\lambda$ and scales by $|\lambda| = \sqrt{a^2 + b^2}$ (in suitable coordinates). No real direction is preserved.` },
        { id: 'la07-1-c5', kind: 'concept', front: md`How do you find an eigenvector once you know $\lambda$?`, back: md`Solve $(A - \lambda I)\bv = \bzero$. For $2\times2$: if a row of $A - \lambda I$ is $(p, q) \neq (0, 0)$, take $\bv = (q, -p)$.` },
      ],
    },
    // ------------------------------------------------------------------ 7.2
    {
      id: 'la07-2',
      title: 'Diagonalization, powers and dynamics',
      minutes: 40,
      objectives: [
        'Diagonalize a 2×2 matrix with distinct eigenvalues as A = PDP⁻¹ and compute Aᵏ from it.',
        'Predict the long-run behaviour of x_{k+1} = Ax_k from the eigenvalues.',
        'Find the stationary distribution of a Markov chain as the eigenvector for eigenvalue 1, and explain PageRank in these terms.',
        'Explain power iteration and why its error shrinks like |λ₂/λ₁|ᵏ.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Computing $A^{100}\bx$ by multiplying 100 times gives a number but no insight. Write $\bx$ in a basis of eigenvectors instead. Each application of $A$ multiplies each coordinate by its own eigenvalue, so $$\bx = c_1\bv_1 + c_2\bv_2 \quad\Longrightarrow\quad A^k\bx = c_1\lambda_1^k\bv_1 + c_2\lambda_2^k\bv_2.$$ The long-run behaviour is decided by the eigenvalue of largest absolute value.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Diagonalization',
          md: md`If the $n\times n$ matrix $A$ has $n$ linearly independent eigenvectors, put them as the columns of $P$ and the eigenvalues on the diagonal of $D$. Then $$A = PDP^{-1}, \qquad A^k = PD^kP^{-1}.$$ Eigenvectors for distinct eigenvalues are always independent, so $n$ distinct eigenvalues guarantee this. Some matrices are not diagonalizable: the shear $\begin{bmatrix} 1 & 1 \\ 0 & 1 \end{bmatrix}$ has the single eigenvalue 1 with only one eigen-direction.`,
        },
        {
          kind: 'derive',
          title: 'why A = PDP⁻¹',
          goal: md`Show $AP = PD$, and from it $A^k = PD^kP^{-1}$.`,
          steps: [
            { md: md`Column $j$ of $AP$ is $A\bv_j$. Column $j$ of $PD$ is $\bv_j$ scaled by $d_{jj} = \lambda_j$. These agree because $A\bv_j = \lambda_j\bv_j$, so $AP = PD$.` },
            { md: md`$P$ has independent columns, so it is invertible: multiply on the right by $P^{-1}$ to get $A = PDP^{-1}$.` },
            {
              md: md`Then $A^2 = PDP^{-1}PDP^{-1} = PD^2P^{-1}$, and in general the inner $P^{-1}P$ pairs cancel: $A^k = PD^kP^{-1}$. $D^k$ is diagonal with entries $\lambda_j^k$.`,
              choose: {
                prompt: md`What happens in the middle of $PDP^{-1}\,PDP^{-1}$?`,
                options: [md`$P^{-1}P = I$ cancels`, md`$DP^{-1}P D = D^2P^{-1}P$, which needs commuting`, md`Nothing simplifies`],
                answer: 0,
                explain: md`Matrix multiplication is associative, so the adjacent $P^{-1}P$ can be grouped and replaced by $I$.`,
              },
            },
          ],
          takeaway: md`$P^{-1}$ converts to eigen-coordinates, $D^k$ scales each coordinate, $P$ converts back.`,
        },
        {
          kind: 'callout',
          tone: 'example',
          title: 'Worked example',
          md: md`For $A = \begin{bmatrix} 4 & 1 \\ 2 & 3 \end{bmatrix}$ (lesson 7.1): $P = \begin{bmatrix} 1 & 1 \\ 1 & -2 \end{bmatrix}$, $D = \begin{bmatrix} 5 & 0 \\ 0 & 2 \end{bmatrix}$, $P^{-1} = \tfrac13\begin{bmatrix} 2 & 1 \\ 1 & -1 \end{bmatrix}$.

$A^2 = P\begin{bmatrix} 25 & 0 \\ 0 & 4 \end{bmatrix}P^{-1} = \tfrac13\begin{bmatrix} 25 & 4 \\ 25 & -8 \end{bmatrix}\begin{bmatrix} 2 & 1 \\ 1 & -1 \end{bmatrix} = \begin{bmatrix} 18 & 7 \\ 14 & 11 \end{bmatrix},$ which matches multiplying $A$ by itself.`,
        },
        {
          kind: 'numeric',
          q: md`For the same $A$, compute $A^3\begin{bmatrix} 2 \\ -1 \end{bmatrix}$ without multiplying matrices. First write $(2, -1)$ in terms of the eigenvectors $(1, 1)$ and $(1, -2)$.`,
          answer: { kind: 'vector', value: [133, 109] },
          hints: [md`$(2, -1) = 1\cdot(1, 1) + 1\cdot(1, -2)$.`],
          explain: md`$A^3\bx = 5^3(1, 1) + 2^3(1, -2) = (125, 125) + (8, -16) = (133, 109)$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.eigen-orbit', matrix: [[1.25, 0], [0, 0.6]], x0: [0.5, 4], steps: 16 },
          task: md`With **saddle** ($\lambda = 1.25$ and $0.6$), drag $\bx_0$ anywhere off the vertical axis: the orbit turns toward the horizontal eigen-line and then grows along it. Then choose **Markov**: every orbit stops on the dashed line of eigenvalue 1. Which point it stops at depends on $\bx_0$.`,
          caption: md`$A^k\bx_0 = c_1\lambda_1^k\bv_1 + c_2\lambda_2^k\bv_2$. Components with $|\lambda| < 1$ die out, $|\lambda| > 1$ grow, and $\lambda = 1$ stays fixed. The **Markov** matrix has $\lambda = 1$ and $0.7$.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          title: 'Exploding and vanishing signals',
          md: md`In a linear recurrence $\bh_t = W\bh_{t-1}$, $\bh_t = W^t\bh_0$, and the gradient of $\bh_t$ with respect to $\bh_0$ is also $W^t$. If some $|\lambda| > 1$ it grows exponentially in $t$; if all $|\lambda| < 1$ it decays exponentially. Recurrent networks add nonlinearities, so the relevant matrices are products of Jacobians, but the same effect explains exploding and vanishing gradients and motivates gated units, careful initialization and gradient clipping.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Markov chains and stationary distributions',
          md: md`A **Markov matrix** $M$ has non-negative entries and columns that sum to 1: $m_{ij}$ is the probability of moving from state $j$ to state $i$. A probability vector evolves as $\bx_{k+1} = M\bx_k$. A **stationary distribution** satisfies $M\boldsymbol\pi = \boldsymbol\pi$: it is an eigenvector for $\lambda = 1$, scaled so its entries sum to 1. $\lambda = 1$ is always an eigenvalue, because the columns summing to 1 means $\mathbf{1}\T M = \mathbf{1}\T$. If all entries of $M$ are positive, $\boldsymbol\pi$ is unique, every other eigenvalue has $|\lambda| < 1$, and $\bx_k \to \boldsymbol\pi$ from any start (the Perron–Frobenius theorem).`,
        },
        {
          kind: 'numeric',
          q: md`Find the stationary distribution of $M = \begin{bmatrix} 0.9 & 0.2 \\ 0.1 & 0.8 \end{bmatrix}$.`,
          answer: { kind: 'vector', value: [2 / 3, 1 / 3] },
          hints: [md`Solve $(M - I)\boldsymbol\pi = \bzero$, then scale so $\pi_1 + \pi_2 = 1$.`],
          explain: md`The first row of $M - I$ gives $-0.1\pi_1 + 0.2\pi_2 = 0$, so $\pi_1 = 2\pi_2$. Normalizing: $\boldsymbol\pi = (\tfrac23, \tfrac13)$. The other eigenvalue is $\tr M - 1 = 0.7$, which sets the speed of convergence.`,
        },
        {
          kind: 'callout',
          tone: 'example',
          title: 'PageRank',
          md: md`Model a web surfer who follows a uniformly random outgoing link. Column $j$ of the link matrix $M$ spreads probability $1/\text{outdeg}(j)$ over the pages $j$ links to. With probability $1 - d$ the surfer instead jumps to a uniformly random page: $$G = dM + \frac{1 - d}{n}\mathbf{1}\mathbf{1}\T.$$ The PageRank vector is the stationary distribution of $G$. All entries of $G$ are positive when $d < 1$, so it is unique. The original PageRank paper used $d = 0.85$. Every eigenvalue of $G$ other than 1 is $d$ times an eigenvalue of $M$, so $|\lambda_2(G)| \le d$ and power iteration converges at least as fast as $d^k$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.pagerank', damping: 0.85 },
          task: md`Press Play. Which page ends with the highest score? Page D has no incoming links: explain why it settles at exactly $(1 - d)/4$. Then set $d = 1$ and replay: what happens to D, and is convergence faster or slower?`,
          caption: md`At $d = 0.85$ the scores are about $(0.373, 0.196, 0.394, 0.038)$: C collects links from A, B and D. The link matrix has eigenvalues $1$, $-\tfrac12 \pm \tfrac12 i$ and $0$, so $|\lambda_2(G)| = 0.85/\sqrt2 \approx 0.60$. At $d = 1$ it is $0.71$, so convergence is slower, and D's score drops to $0$ after the first step because no page links to it.`,
        },
        {
          kind: 'text',
          md: md`### Power iteration

To find the dominant eigenvector (largest $|\lambda|$), start from almost any $\bx_0$ and repeat $$\bx_{k+1} = \frac{A\bx_k}{\lVert A\bx_k\rVert}.$$ The normalization only prevents overflow. The estimate of the eigenvalue is the Rayleigh quotient $\bx_k\T A\bx_k$ (for unit $\bx_k$). Each step costs one matrix–vector product, which is why it scales to web graphs and is used to estimate the largest singular value of a weight matrix in spectral normalization.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.power-iter', ratio: 0.6, angle: 150 },
          task: md`Press Play: on the log plot the error follows the dashed line, falling by a factor $|\lambda_2/\lambda_1|$ per step. Replay with the ratio at $0.95$, then at $-0.6$. Finally drag $\bx_0$ exactly onto the $\bq_2$ line.`,
          caption: md`With ratio $0.6$ the error drops by about one decimal digit every $\log(10)/\log(1/0.6) \approx 4.5$ steps. A negative ratio gives the same speed, with the $\bq_2$ component flipping sign each step. If $\bx_0$ has no $\bq_1$ component the iteration never finds $\bq_1$; in floating point, rounding errors usually introduce one eventually.`,
        },
        {
          kind: 'derive',
          title: 'the convergence rate',
          goal: md`Let $A$ have eigenvectors $\bv_1, \bv_2$ with $|\lambda_1| > |\lambda_2|$, and $\bx_0 = c_1\bv_1 + c_2\bv_2$ with $c_1 \ne 0$. Show that the direction of $A^k\bx_0$ approaches $\bv_1$ at rate $|\lambda_2/\lambda_1|^k$.`,
          steps: [
            { md: md`$A^k\bx_0 = c_1\lambda_1^k\bv_1 + c_2\lambda_2^k\bv_2$. Normalization only rescales, so it does not change the direction.` },
            {
              md: md`Factor out the dominant term: $$A^k\bx_0 = c_1\lambda_1^k\left(\bv_1 + \frac{c_2}{c_1}\left(\frac{\lambda_2}{\lambda_1}\right)^k\bv_2\right).$$`,
              choose: {
                prompt: md`What is the useful move to compare the two terms?`,
                options: [md`Factor out $c_1\lambda_1^k$`, md`Take logarithms of both terms`, md`Divide by $\lVert\bx_0\rVert$`],
                answer: 0,
                explain: md`Factoring out the dominant term leaves a fixed vector plus a correction whose size is a power of $\lambda_2/\lambda_1$.`,
              },
            },
            { md: md`The scalar in front does not affect the direction. The correction has size $\left|\frac{c_2}{c_1}\right|\left|\frac{\lambda_2}{\lambda_1}\right|^k\lVert\bv_2\rVert \to 0$, geometrically.` },
          ],
          takeaway: md`Convergence is fast when $\lambda_1$ is well separated from $\lambda_2$ and slow when $|\lambda_2| \approx |\lambda_1|$. Reducing the error by a factor $10^{-p}$ takes about $p\,\ln 10/\ln|\lambda_1/\lambda_2|$ steps.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'la07-2-paper',
            title: 'A three-page Markov chain',
            type: 'apply',
            difficulty: 2,
            minutes: 10,
            statement: md`A visitor moves between Home (1), Search (2) and Product (3) pages each click according to $$M = \begin{bmatrix} 0.5 & 0.5 & 0 \\ 0.25 & 0.5 & 0.5 \\ 0.25 & 0 & 0.5 \end{bmatrix}$$ (column $j$ lists where a visitor on page $j$ goes next). Find the stationary distribution. Enter $\boldsymbol\pi$.`,
            hints: [md`Write out $(M - I)\boldsymbol\pi = \bzero$ and express $\pi_2$ and $\pi_3$ in terms of $\pi_1$.`],
            solution: [
              md`Check the columns: $0.5 + 0.25 + 0.25 = 1$, $0.5 + 0.5 + 0 = 1$, $0 + 0.5 + 0.5 = 1$.`,
              md`Row 1 of $(M - I)\boldsymbol\pi = \bzero$: $-0.5\pi_1 + 0.5\pi_2 = 0$, so $\pi_2 = \pi_1$.`,
              md`Row 3: $0.25\pi_1 - 0.5\pi_3 = 0$, so $\pi_3 = \tfrac12\pi_1$. (Row 2 is then automatically satisfied: $0.25\pi_1 - 0.5\pi_2 + 0.5\pi_3 = 0.25\pi_1 - 0.5\pi_1 + 0.25\pi_1 = 0$.)`,
              md`Normalize: $\pi_1(1 + 1 + \tfrac12) = 1$, so $\pi_1 = 0.4$ and $\boldsymbol\pi = (0.4, 0.4, 0.2)$.`,
            ],
            answer: { kind: 'vector', value: [0.4, 0.4, 0.2] },
            areas: ['math', 'ml-breadth'],
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

# PageRank on the 4-page graph from the figure: A->B, A->C, B->C, C->A, D->C
M = np.array([[0.0, 0.0, 1.0, 0.0],
              [0.5, 0.0, 0.0, 0.0],
              [0.5, 1.0, 0.0, 1.0],
              [0.0, 0.0, 0.0, 0.0]])
d, n = 0.85, 4
G = d * M + (1 - d) / n * np.ones((n, n))

x = np.ones(n) / n
for k in range(100):
    x = G @ x                       # power iteration; x stays a probability vector
print("power iteration:", np.round(x, 4))

# the same vector from a linear system: (G - I) pi = 0 together with sum(pi) = 1
S = G - np.eye(n)
S[-1, :] = 1.0                      # replace one (redundant) equation by the normalization
rhs = np.zeros(n)
rhs[-1] = 1.0
pi = np.linalg.solve(S, rhs)
print("linear solve:   ", np.round(pi, 4))
print("G pi = pi:", np.allclose(G @ pi, pi))`,
          note: md`A Markov matrix keeps $\sum_i x_i = 1$, so this power iteration needs no normalization. The rows of $G - I$ are dependent (they sum to zero), which is why one of them can be replaced by the condition $\sum_i\pi_i = 1$.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'la07-2-ex',
            title: 'Power iteration',
            prompt: md`Write \`power_iteration(A, x0, iters)\` that runs \`iters\` steps of $\bx \leftarrow A\bx/\lVert A\bx\rVert$ starting from \`x0\`, and returns the final unit vector \`x\` and the Rayleigh quotient $\bx\T A\bx$ as a Python float.`,
            starter: `import numpy as np

def power_iteration(A, x0, iters):
    x = np.array(x0, dtype=float)
    # repeat: multiply by A, then normalize
    return x, 0.0
`,
            solution: `import numpy as np

def power_iteration(A, x0, iters):
    x = np.array(x0, dtype=float)
    for _ in range(iters):
        y = A @ x
        x = y / np.linalg.norm(y)
    return x, float(x @ A @ x)
`,
            tests: [
              { expr: 'np.round(power_iteration(np.array([[2.0, 1.0], [1.0, 2.0]]), [1.0, 0.0], 50)[0], 6).tolist()', label: 'eigenvector of [[2,1],[1,2]]' },
              { expr: 'round(power_iteration(np.array([[2.0, 1.0], [1.0, 2.0]]), [1.0, 0.0], 50)[1], 6)', label: 'its eigenvalue' },
              { expr: 'round(power_iteration(np.array([[4.0, 1.0], [2.0, 3.0]]), [1.0, 0.0], 60)[1], 6)', label: 'dominant eigenvalue of [[4,1],[2,3]]' },
            ],
            hints: [md`Inside a loop: \`y = A @ x\`, then \`x = y / np.linalg.norm(y)\`.`, md`The Rayleigh quotient is \`x @ A @ x\`; wrap it in \`float(...)\`.`],
          },
        },
        {
          kind: 'recall',
          prompt: md`State the diagonalization $A = PDP^{-1}$ (what are $P$ and $D$?), the formula for $A^k\bx$ in eigen-coordinates, and the convergence rate of power iteration.`,
          answer: md`$P$ has independent eigenvectors as columns, $D$ the eigenvalues on its diagonal; $A^k = PD^kP^{-1}$. If $\bx = \sum c_i\bv_i$ then $A^k\bx = \sum c_i\lambda_i^k\bv_i$. Power iteration converges to the dominant eigenvector with error shrinking like $|\lambda_2/\lambda_1|^k$, provided $c_1 \neq 0$.`,
        },
      ],
      cards: [
        { id: 'la07-2-c1', kind: 'concept', front: md`$A = PDP^{-1}$: what are $P$ and $D$, and when does it exist?`, back: md`$P$: $n$ independent eigenvectors as columns. $D$: the eigenvalues, in the same order, on the diagonal. It exists iff $A$ has $n$ independent eigenvectors (guaranteed by $n$ distinct eigenvalues).` },
        { id: 'la07-2-c2', kind: 'compute', front: md`Stationary distribution of $\begin{bmatrix} 0.7 & 0.6 \\ 0.3 & 0.4 \end{bmatrix}$.`, answer: { kind: 'vector', value: [2 / 3, 1 / 3] }, back: md`$-0.3\pi_1 + 0.6\pi_2 = 0$ gives $\pi_1 = 2\pi_2$, so $\boldsymbol\pi = (\tfrac23, \tfrac13)$.` },
        { id: 'la07-2-c3', kind: 'cloze', text: md`Power iteration's error shrinks by a factor of about $|\lambda_2 / \lambda_1|$ per {{}}.`, answers: ['step'] },
        { id: 'la07-2-c4', kind: 'concept', front: md`Why is $\lambda = 1$ always an eigenvalue of a Markov matrix $M$ (columns sum to 1)?`, back: md`$\mathbf{1}\T M = \mathbf{1}\T$, so 1 is an eigenvalue of $M\T$, and $M$ and $M\T$ have the same eigenvalues (same characteristic polynomial).` },
        { id: 'la07-2-c5', kind: 'concept', front: md`Long-run behaviour of $\bx_{k+1} = A\bx_k$ from the eigenvalues.`, back: md`$\bx_k = \sum c_i\lambda_i^k\bv_i$: components with $|\lambda_i| < 1$ vanish, $|\lambda_i| > 1$ blow up, $\lambda_i = 1$ persist; complex pairs rotate. The largest $|\lambda_i|$ with $c_i \neq 0$ dominates.` },
      ],
    },
    // ------------------------------------------------------------------ 7.3
    {
      id: 'la07-3',
      title: 'Symmetric matrices, quadratic forms and definiteness',
      minutes: 35,
      objectives: [
        'State the spectral theorem: a real symmetric matrix has real eigenvalues and an orthonormal basis of eigenvectors, A = QΛQᵀ.',
        'Convert between a symmetric 2×2 matrix and its quadratic form, and sketch its level sets from the eigen-decomposition.',
        'Classify a symmetric 2×2 matrix as positive definite, semidefinite or indefinite from its eigenvalues or from a > 0 and ac − b² > 0.',
        'Explain why AᵀA and covariance matrices are positive semidefinite, and why a PSD Hessian means a convex quadratic.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Covariance matrices, Hessians of smooth losses, kernel (Gram) matrices and $A\T A$ are all **symmetric**: $A\T = A$. Symmetric matrices have the cleanest possible eigen-structure. Their eigenvalues are real and their eigenvectors can be chosen perpendicular, so they act as pure stretches along perpendicular axes.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Spectral theorem',
          md: md`If $A$ is a real symmetric $n\times n$ matrix, then all its eigenvalues are real, and it has an orthonormal basis of eigenvectors $\bq_1, \dots, \bq_n$. Equivalently, $$A = Q\Lambda Q\T = \lambda_1\bq_1\bq_1\T + \dots + \lambda_n\bq_n\bq_n\T,$$ with $Q$ orthogonal and $\Lambda$ diagonal. Diagonalizing needs no matrix inverse, since $Q^{-1} = Q\T$.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          md: md`A symmetric matrix rotates into its eigen-axes ($Q\T$), stretches along each axis by $\lambda_i$ ($\Lambda$), and rotates back ($Q$). The unit circle becomes an ellipse whose axes are the eigenvectors.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.spectral-ellipse', theta: 30, l1: 2.5, l2: 1 },
          task: md`Change $\theta$, $\lambda_1$ and $\lambda_2$: the matrix in the readout is always symmetric, and the ellipse's axes stay perpendicular. Drag $\bx$ onto an axis to see $A\bx$ land on the same axis. Then make $\lambda_2$ negative.`,
          caption: md`Compare with the triangular matrix in lesson 7.1, whose eigen-directions $(1, 0)$ and $(1, -1)$ are not perpendicular. Non-symmetric matrices do not have this structure in general.`,
        },
        {
          kind: 'derive',
          title: 'eigenvectors of a symmetric matrix are orthogonal',
          goal: md`Let $A\T = A$, $A\bv_1 = \lambda_1\bv_1$, $A\bv_2 = \lambda_2\bv_2$ with $\lambda_1 \ne \lambda_2$. Show $\bv_1\cdot\bv_2 = 0$.`,
          steps: [
            {
              md: md`Compute $(A\bv_1)\cdot\bv_2$ in two ways. First, $(A\bv_1)\cdot\bv_2 = \lambda_1\,\bv_1\cdot\bv_2$.`,
            },
            {
              md: md`Second, move $A$ across the dot product: $(A\bv_1)\cdot\bv_2 = \bv_1\T A\T\bv_2 = \bv_1\T A\bv_2 = \lambda_2\,\bv_1\cdot\bv_2$.`,
              choose: {
                prompt: md`Which property lets $A$ move from one side of the dot product to the other?`,
                options: [md`$A\T = A$`, md`$A$ is invertible`, md`$A^2 = A$`],
                answer: 0,
                explain: md`In general $(A\bx)\cdot\by = \bx\cdot(A\T\by)$. Symmetry makes $A\T$ equal to $A$.`,
              },
            },
            { md: md`Subtract: $(\lambda_1 - \lambda_2)\,\bv_1\cdot\bv_2 = 0$. Since $\lambda_1 \neq \lambda_2$, $\bv_1\cdot\bv_2 = 0$.` },
          ],
          takeaway: md`A repeated eigenvalue gives an eigenspace of dimension above 1; inside it, Gram–Schmidt (lesson 6.3) picks orthonormal eigenvectors. Problem 10 proves that the eigenvalues are real.`,
        },
        {
          kind: 'numeric',
          q: md`Find the eigenvalues of the symmetric matrix $\begin{bmatrix} 5 & 2 \\ 2 & 2 \end{bmatrix}$.`,
          answer: { kind: 'set', value: [6, 1] },
          inputHint: 'two numbers',
          explain: md`$\tr = 7$, $\det = 6$, so $\lambda = 6, 1$. The eigenvectors $(2, 1)$ and $(1, -2)$ are perpendicular, as the spectral theorem promises.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Quadratic forms and definiteness',
          md: md`A symmetric $A$ defines the **quadratic form** $q(\bx) = \bx\T A\bx = \sum_{i,j} a_{ij}x_ix_j$. For $A = \begin{bmatrix} a & b \\ b & c \end{bmatrix}$, $q(x, y) = ax^2 + 2bxy + cy^2$. $A$ (and $q$) is

- **positive definite** (PD) if $\bx\T A\bx > 0$ for all $\bx \neq \bzero$
- **positive semidefinite** (PSD) if $\bx\T A\bx \ge 0$ for all $\bx$
- **indefinite** if $\bx\T A\bx$ takes both signs

and negative (semi)definite when $-A$ is positive (semi)definite. In eigen-coordinates $\by = Q\T\bx$, $q = \lambda_1y_1^2 + \dots + \lambda_ny_n^2$, so PD means all $\lambda_i > 0$, PSD means all $\lambda_i \geq 0$, and indefinite means eigenvalues of both signs.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.quadform', a: 2, b: 1, c: 2 },
          task: md`Start from the positive definite form. Lower $c$ until the ellipses open into parallel lines, then into hyperbolas. At what value of $c$ does the change happen (with $a = 2$, $b = 1$)? Switch to the **surface** view at each stage.`,
          caption: md`The level sets $\bx\T A\bx = \text{const}$ have their axes along the eigenvectors. Orange curves are positive values, blue negative. PD is a bowl, PSD a valley with a flat direction, indefinite a saddle. Here the change happens at $\det A = 2c - 1 = 0$, that is $c = \tfrac12$.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'The 2×2 test',
          md: md`For symmetric $A = \begin{bmatrix} a & b \\ b & c \end{bmatrix}$, with $\det A = \lambda_1\lambda_2$ and $\tr A = \lambda_1 + \lambda_2$:
- PD $\iff a > 0$ and $ac - b^2 > 0$
- indefinite $\iff ac - b^2 < 0$
- PSD $\iff a \ge 0$, $c \ge 0$ and $ac - b^2 \ge 0$

For $n\times n$, $A$ is PD iff all leading principal minors (the determinants of the top-left $k\times k$ blocks) are positive (Sylvester's criterion). In code, check the eigenvalues or try a Cholesky factorization, which succeeds exactly for PD matrices.`,
        },
        {
          kind: 'check',
          q: md`Classify $\begin{bmatrix} 1 & 2 \\ 2 & 1 \end{bmatrix}$.`,
          options: [md`Indefinite`, md`Positive definite`, md`Positive semidefinite, not definite`, md`Negative definite`],
          answer: 0,
          explain: md`$\det = 1 - 4 = -3 < 0$, so the eigenvalues ($3$ and $-1$) have opposite signs. Positive diagonal entries do not make a matrix PD: along $(1, -1)$ the form is $1 - 4 + 1 = -2$.`,
        },
        {
          kind: 'numeric',
          q: md`For which values of $c$ is $\begin{bmatrix} 2 & 1 \\ 1 & c \end{bmatrix}$ positive definite? Enter the threshold value: PD exactly when $c$ is greater than it.`,
          answer: { kind: 'number', value: 0.5 },
          explain: md`$a = 2 > 0$, and $\det = 2c - 1 > 0 \iff c > \tfrac12$. At $c = \tfrac12$ the matrix is PSD but singular, the valley you saw in the figure.`,
        },
        {
          kind: 'derive',
          title: 'Gram and covariance matrices are PSD',
          goal: md`Show that $A\T A$ is PSD for every $A$, and PD exactly when the columns of $A$ are independent. Deduce that a covariance matrix is PSD.`,
          steps: [
            {
              md: md`$\bx\T(A\T A)\bx = (A\bx)\T(A\bx) = \lVert A\bx\rVert^2 \ge 0$.`,
              choose: {
                prompt: md`How do you rewrite $\bx\T A\T A\bx$?`,
                options: [md`As $(A\bx)\T(A\bx) = \lVert A\bx\rVert^2$`, md`As $\bx\T\bx\cdot\lVert A\rVert^2$`, md`As $\det(A)^2\lVert\bx\rVert^2$`],
                answer: 0,
                explain: md`Group the product as $(\bx\T A\T)(A\bx)$ and use $(A\bx)\T = \bx\T A\T$.`,
              },
            },
            { md: md`It equals $0$ only when $A\bx = \bzero$. If the columns are independent, that forces $\bx = \bzero$, so $A\T A$ is PD.` },
            { md: md`For centered data $X_c$ ($n$ rows), the covariance matrix is $C = \frac{1}{n-1}X_c\T X_c$. Then $\bw\T C\bw = \frac{1}{n-1}\lVert X_c\bw\rVert^2$, which is the sample variance of the projections $X_c\bw$, so it is $\ge 0$.` },
          ],
          takeaway: md`A covariance matrix is singular exactly when some combination of features has zero variance in the sample, for example when one feature is a linear combination of others, or when there are fewer samples than features.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          title: 'Hessians and convexity',
          md: md`Near a point, $f(\bx + \bh) \approx f(\bx) + \nabla f(\bx)\T\bh + \tfrac12\bh\T H\bh$, where the Hessian $H$ is symmetric. A twice-differentiable $f$ is convex exactly when $H$ is PSD everywhere; the least-squares loss has $H = 2X\T X$, PSD everywhere. At a critical point, PD means a local minimum and indefinite means a saddle. Each eigenvalue of $H$ is the curvature along its eigenvector, and on a quadratic, gradient descent is stable only for step sizes $\eta < 2/\lambda_{\max}$ (Module 8 shows why the ratio $\lambda_{\max}/\lambda_{\min}$ sets the speed).`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'la07-3-paper',
            title: 'The Rayleigh quotient',
            type: 'proof',
            difficulty: 2,
            minutes: 10,
            statement: md`Let $A$ be symmetric with eigenvalues $\lambda_1 \ge \dots \ge \lambda_n$. Prove that for every unit vector $\bx$, $$\lambda_n \le \bx\T A\bx \le \lambda_1,$$ with equality on the right for $\bx = \bq_1$. Interpret the result for a covariance matrix.`,
            hints: [md`Write $\bx = \sum_i y_i\bq_i$ in the orthonormal eigenbasis. Then $\sum y_i^2 = 1$.`],
            solution: [
              md`By the spectral theorem, $\bx = \sum_i y_i\bq_i$ with $\by = Q\T\bx$, and $\sum_i y_i^2 = \lVert\bx\rVert^2 = 1$ because $Q$ is orthogonal.`,
              md`$\bx\T A\bx = \by\T\Lambda\by = \sum_i\lambda_iy_i^2$.`,
              md`This is a weighted average of the $\lambda_i$ with weights $y_i^2 \ge 0$ summing to 1, so it lies between $\lambda_n$ and $\lambda_1$.`,
              md`For $\bx = \bq_1$: $\by = (1, 0, \dots, 0)$ and the value is $\lambda_1$.`,
              md`For a covariance matrix, $\bx\T C\bx$ is the variance of the data projected onto the direction $\bx$. The direction of largest variance is the top eigenvector, and that variance is $\lambda_1$. This is the first principal component (Module 8).`,
            ],
            rubric: [md`Expands $\bx$ in the orthonormal eigenbasis with $\sum y_i^2 = 1$`, md`Obtains $\sum\lambda_iy_i^2$`, md`Weighted-average argument for both bounds`, md`Equality case and the covariance interpretation`],
            areas: ['math', 'ml-depth'],
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

A = np.array([[2.0, 1.0],
              [1.0, 2.0]])
print(np.linalg.eigvalsh(A))`,
          predict: {
            q: md`\`eigvalsh\` is for symmetric matrices and returns the eigenvalues in ascending order. What is printed?`,
            options: ['`[1. 3.]`', '`[3. 1.]`', '`[2. 2.]`', '`[1.+0.j 3.+0.j]`'],
            answer: 0,
            explain: md`$\tr = 4$ and $\det = 3$ give $\lambda = 1, 3$. For symmetric input the \`h\` routines return real eigenvalues, in ascending order.`,
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

S = np.array([[5.0, 2.0],
              [2.0, 2.0]])
lam, Q = np.linalg.eigh(S)          # ascending eigenvalues, orthonormal eigenvectors (columns)
for j in range(2):                  # signs are arbitrary: make each column's largest entry positive
    if Q[np.argmax(np.abs(Q[:, j])), j] < 0:
        Q[:, j] = -Q[:, j]
print("eigenvalues:", np.round(lam, 6))
print("Q =\\n", np.round(Q, 4))
print("Q^T Q = I:", np.allclose(Q.T @ Q, np.eye(2)))
print("Q diag(lam) Q^T = S:", np.allclose(Q @ np.diag(lam) @ Q.T, S))`,
          note: md`Prefer \`eigh\` over \`eig\` for symmetric matrices: it is faster, guarantees real eigenvalues and orthonormal eigenvectors, and sorts the eigenvalues.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'la07-3-ex',
            title: 'Classify a symmetric matrix',
            prompt: md`Write \`classify(A, tol=1e-10)\` for a symmetric matrix that returns one of \`'PD'\`, \`'PSD'\`, \`'ND'\`, \`'NSD'\`, \`'indefinite'\`, using the eigenvalues. Treat $|\lambda| \le$ \`tol\` as zero. Return \`'PSD'\` for a matrix whose eigenvalues are all zero.`,
            starter: `import numpy as np

def classify(A, tol=1e-10):
    lam = np.linalg.eigvalsh(A)   # ascending
    return 'PD'
`,
            solution: `import numpy as np

def classify(A, tol=1e-10):
    lam = np.linalg.eigvalsh(A)   # ascending
    if lam[0] > tol:
        return 'PD'
    if lam[0] >= -tol:
        return 'PSD'
    if lam[-1] < -tol:
        return 'ND'
    if lam[-1] <= tol:
        return 'NSD'
    return 'indefinite'
`,
            tests: [
              { expr: "classify(np.array([[2.0, 1.0], [1.0, 2.0]]))", label: '[[2,1],[1,2]]' },
              { expr: "classify(np.array([[1.0, 2.0], [2.0, 1.0]]))", label: '[[1,2],[2,1]]' },
              { expr: "classify(np.array([[1.0, 1.0], [1.0, 1.0]]))", label: '[[1,1],[1,1]]' },
              { expr: "classify(np.array([[-1.0, 0.0], [0.0, 0.0]]))", label: '[[-1,0],[0,0]]' },
              { expr: "classify(-np.eye(3))", label: '-I' },
            ],
            hints: [md`\`lam[0]\` is the smallest eigenvalue and \`lam[-1]\` the largest.`, md`Check the cases in order: smallest $> 0$, smallest $\ge 0$, largest $< 0$, largest $\le 0$, otherwise indefinite.`],
          },
        },
        {
          kind: 'explain',
          prompt: md`Explain to an interviewer why a covariance matrix is always positive semidefinite, and when it fails to be positive definite.`,
          model: md`For centered data $X_c$ with $n$ rows, $C = \frac{1}{n-1}X_c\T X_c$. For any direction $\bw$, $\bw\T C\bw = \frac{1}{n-1}\lVert X_c\bw\rVert^2$, which is the sample variance of the data projected onto $\bw$, and a variance cannot be negative. So all eigenvalues are $\ge 0$. It is singular exactly when some nonzero $\bw$ gives $X_c\bw = \bzero$: a linear combination of features is constant in the sample. That happens with redundant features (one is a sum of others, or a one-hot encoding with all categories plus an intercept) and always when $n - 1 < d$, since then $\rank C \le n - 1$. In practice one adds a small multiple of $I$ (shrinkage or ridge) to make it PD.`,
        },
      ],
      cards: [
        { id: 'la07-3-c1', kind: 'concept', front: md`State the spectral theorem.`, back: md`A real symmetric matrix has real eigenvalues and an orthonormal eigenbasis: $A = Q\Lambda Q\T$ with $Q$ orthogonal and $\Lambda$ diagonal.` },
        { id: 'la07-3-c2', kind: 'concept', front: md`PD, PSD, indefinite in terms of eigenvalues.`, back: md`PD: all $\lambda_i > 0$. PSD: all $\lambda_i \ge 0$. Indefinite: some positive and some negative.` },
        { id: 'la07-3-c3', kind: 'compute', front: md`Is $\begin{bmatrix} 3 & 2 \\ 2 & 1 \end{bmatrix}$ PD? Enter its determinant.`, answer: { kind: 'number', value: -1 }, back: md`$\det = 3 - 4 = -1 < 0$: indefinite, not PD.` },
        { id: 'la07-3-c4', kind: 'cloze', text: md`$\bx\T A\T A\bx$ equals the squared {{}} of $A\bx$, so $A\T A$ is PSD.`, answers: ['norm'] },
        { id: 'la07-3-c5', kind: 'concept', front: md`What does an indefinite Hessian at a critical point mean?`, back: md`A saddle point: the function curves up along some eigen-directions and down along others. A PD Hessian means a strict local minimum.` },
      ],
    },
  ],
  problems: [
    {
      id: 'la07-p1',
      title: 'Eigen-decomposition of a symmetric matrix',
      type: 'compute',
      difficulty: 1,
      minutes: 6,
      statement: md`Find the eigenvalues and orthonormal eigenvectors of $A = \begin{bmatrix} 2 & -1 \\ -1 & 2 \end{bmatrix}$ and write $A = Q\Lambda Q\T$. Enter the eigenvalues.`,
      solution: [
        md`$\tr = 4$, $\det = 3$: $\lambda^2 - 4\lambda + 3 = (\lambda - 1)(\lambda - 3)$.`,
        md`$\lambda = 1$: $A - I = \begin{bmatrix} 1 & -1 \\ -1 & 1 \end{bmatrix}$, so $\bq_1 = \tfrac{1}{\sqrt2}(1, 1)$. $\lambda = 3$: $A - 3I = \begin{bmatrix} -1 & -1 \\ -1 & -1 \end{bmatrix}$, so $\bq_2 = \tfrac{1}{\sqrt2}(1, -1)$.`,
        md`$Q = \tfrac{1}{\sqrt2}\begin{bmatrix} 1 & 1 \\ 1 & -1 \end{bmatrix}$, $\Lambda = \begin{bmatrix} 1 & 0 \\ 0 & 3 \end{bmatrix}$. Check one entry: $(Q\Lambda Q\T)_{12} = \tfrac12(1\cdot1\cdot1 + 3\cdot1\cdot(-1)) = -1$.`,
      ],
      answer: { kind: 'set', value: [1, 3] },
    },
    {
      id: 'la07-p2',
      title: 'Powers by diagonalization',
      type: 'compute',
      difficulty: 2,
      minutes: 12,
      statement: md`Diagonalize $A = \begin{bmatrix} 5 & -2 \\ 4 & -1 \end{bmatrix}$, find a formula for $A^k$, and use it to compute $A^3$. Enter $A^3$.`,
      hints: [md`$\tr A = 4$ and $\det A = 3$.`],
      solution: [
        md`$\lambda^2 - 4\lambda + 3 = 0$ gives $\lambda = 3, 1$.`,
        md`$\lambda = 3$: $A - 3I = \begin{bmatrix} 2 & -2 \\ 4 & -4 \end{bmatrix}$, $\bv_1 = (1, 1)$. $\lambda = 1$: $A - I = \begin{bmatrix} 4 & -2 \\ 4 & -2 \end{bmatrix}$, $\bv_2 = (1, 2)$.`,
        md`$P = \begin{bmatrix} 1 & 1 \\ 1 & 2 \end{bmatrix}$, $\det P = 1$, $P^{-1} = \begin{bmatrix} 2 & -1 \\ -1 & 1 \end{bmatrix}$.`,
        md`$A^k = P\begin{bmatrix} 3^k & 0 \\ 0 & 1 \end{bmatrix}P^{-1} = \begin{bmatrix} 2\cdot3^k - 1 & 1 - 3^k \\ 2\cdot3^k - 2 & 2 - 3^k \end{bmatrix}$. Check $k = 1$: $\begin{bmatrix} 5 & -2 \\ 4 & -1 \end{bmatrix}$.`,
        md`$k = 3$: $A^3 = \begin{bmatrix} 53 & -26 \\ 52 & -25 \end{bmatrix}$.`,
      ],
      answer: { kind: 'matrix', value: [[53, -26], [52, -25]] },
    },
    {
      id: 'la07-p3',
      title: 'Eigenvalues of powers and inverses',
      type: 'proof',
      difficulty: 1,
      minutes: 6,
      statement: md`Let $A\bv = \lambda\bv$ with $\bv \ne \bzero$. Prove that $A^k\bv = \lambda^k\bv$ for every $k \ge 1$, and that if $A$ is invertible then $\lambda \neq 0$ and $A^{-1}\bv = \lambda^{-1}\bv$.`,
      solution: [
        md`Induction: true for $k = 1$. If $A^k\bv = \lambda^k\bv$, then $A^{k+1}\bv = A(\lambda^k\bv) = \lambda^kA\bv = \lambda^{k+1}\bv$.`,
        md`If $\lambda = 0$ then $A\bv = \bzero$ with $\bv \ne \bzero$, so $A$ has a nontrivial null space and is not invertible. Hence invertible $A$ has $\lambda \ne 0$.`,
        md`Apply $A^{-1}$ to $A\bv = \lambda\bv$: $\bv = \lambda A^{-1}\bv$, so $A^{-1}\bv = \lambda^{-1}\bv$.`,
      ],
      rubric: [md`Induction step uses linearity to pull out $\lambda^k$`, md`Shows $\lambda \neq 0$ via the null space`, md`Applies $A^{-1}$ and divides by $\lambda$`],
    },
    {
      id: 'la07-p4',
      title: 'Trace and determinant from the characteristic polynomial',
      type: 'derive',
      difficulty: 2,
      minutes: 8,
      statement: md`For a $2\times2$ matrix $A$ with eigenvalues $\lambda_1, \lambda_2$, derive $\lambda_1 + \lambda_2 = \tr A$ and $\lambda_1\lambda_2 = \det A$. Use this to find the eigenvalues of a $2\times2$ matrix with trace $1$ and determinant $-6$.`,
      solution: [
        md`$\det(A - \lambda I) = \lambda^2 - (\tr A)\lambda + \det A$ (expand the $2\times2$ determinant).`,
        md`Its roots are $\lambda_1, \lambda_2$, so it also equals $(\lambda - \lambda_1)(\lambda - \lambda_2) = \lambda^2 - (\lambda_1 + \lambda_2)\lambda + \lambda_1\lambda_2$.`,
        md`Compare coefficients: $\lambda_1 + \lambda_2 = \tr A$ and $\lambda_1\lambda_2 = \det A$.`,
        md`Trace $1$, determinant $-6$: $\lambda^2 - \lambda - 6 = (\lambda - 3)(\lambda + 2)$, so the eigenvalues are $3$ and $-2$.`,
      ],
      answer: { kind: 'set', value: [3, -2] },
      rubric: [md`Characteristic polynomial expanded`, md`Factored form in terms of the roots`, md`Coefficients compared`, md`Applied correctly to find $3$ and $-2$`],
    },
    {
      id: 'la07-p5',
      title: 'A matrix that cannot be diagonalized',
      type: 'concept',
      difficulty: 2,
      minutes: 6,
      statement: md`Show that the shear $S = \begin{bmatrix} 1 & 1 \\ 0 & 1 \end{bmatrix}$ has the single eigenvalue $1$ and that its eigenspace is one-dimensional, so $S$ is not diagonalizable. Compute $S^k$ directly. Enter the dimension of the eigenspace.`,
      solution: [
        md`$S$ is triangular, so $p(\lambda) = (1 - \lambda)^2$ and $\lambda = 1$ is a double root.`,
        md`$S - I = \begin{bmatrix} 0 & 1 \\ 0 & 0 \end{bmatrix}$ has rank 1, so its null space, spanned by $(1, 0)$, has dimension $2 - 1 = 1$.`,
        md`Diagonalizing would need two independent eigenvectors, so $S$ is not diagonalizable. (If it were, $S = PIP^{-1} = I$, a contradiction.)`,
        md`$S^k = \begin{bmatrix} 1 & k \\ 0 & 1 \end{bmatrix}$, by induction. The entries grow linearly in $k$ although $|\lambda| = 1$, behaviour no diagonalizable matrix with $|\lambda| = 1$ shows.`,
      ],
      answer: { kind: 'number', value: 1 },
    },
    {
      id: 'la07-p6',
      title: 'When is a 2×2 form positive definite?',
      type: 'compute',
      difficulty: 1,
      minutes: 6,
      statement: md`For which real $k$ is $\begin{bmatrix} 1 & k \\ k & 4 \end{bmatrix}$ positive definite? Classify the matrix at the boundary values and outside them. Enter the two boundary values.`,
      solution: [
        md`$a = 1 > 0$ always. $\det = 4 - k^2 > 0 \iff |k| < 2$. So PD exactly for $-2 < k < 2$.`,
        md`At $k = \pm 2$: $\det = 0$ and $\tr = 5 > 0$, so the eigenvalues are $0$ and $5$: PSD, not PD.`,
        md`For $|k| > 2$: $\det < 0$, eigenvalues of opposite signs, indefinite.`,
      ],
      answer: { kind: 'set', value: [-2, 2] },
    },
    {
      id: 'la07-p7',
      title: 'The largest stable learning rate',
      type: 'derive',
      difficulty: 3,
      minutes: 12,
      statement: md`Gradient descent on $f(\bx) = \tfrac12\bx\T H\bx$ with $H$ symmetric PD is $\bx_{k+1} = \bx_k - \eta H\bx_k$. Show that it converges to $\bzero$ from every start iff $0 < \eta < 2/\lambda_{\max}$. For $H = \begin{bmatrix} 3 & 1 \\ 1 & 3 \end{bmatrix}$, give that bound, the step that minimizes $\max_i|1 - \eta\lambda_i|$, and the resulting factor per step. Enter the bound.`,
      hints: [md`$\bx_{k+1} = (I - \eta H)\bx_k$. What are the eigenvalues of $I - \eta H$?`],
      solution: [
        md`$\bx_k = (I - \eta H)^k\bx_0$. With $H = Q\Lambda Q\T$, $I - \eta H = Q(I - \eta\Lambda)Q\T$, so in eigen-coordinates each component is multiplied by $1 - \eta\lambda_i$ per step.`,
        md`Convergence from every start requires $|1 - \eta\lambda_i| < 1$ for all $i$, i.e. $0 < \eta\lambda_i < 2$. The binding constraint is the largest eigenvalue: $0 < \eta < 2/\lambda_{\max}$.`,
        md`$H$ has $\tr = 6$, $\det = 8$, so $\lambda = 4, 2$. Bound: $\eta < 2/4 = 0.5$.`,
        md`$\max(|1 - 4\eta|, |1 - 2\eta|)$ is smallest where $4\eta - 1 = 1 - 2\eta$, i.e. $\eta = \tfrac{2}{\lambda_{\max} + \lambda_{\min}} = \tfrac13$. The factor is then $\tfrac13 = \tfrac{\kappa - 1}{\kappa + 1}$ with $\kappa = 2$.`,
      ],
      answer: { kind: 'number', value: 0.5 },
      rubric: [md`Writes the iteration as $(I - \eta H)^k$ and diagonalizes it`, md`Derives $|1 - \eta\lambda_i| < 1$ for all $i$`, md`Identifies $\lambda_{\max}$ as binding`, md`Correct numbers: $0.5$, $\tfrac13$, factor $\tfrac13$`],
      areas: ['math', 'ml-depth'],
    },
    {
      id: 'la07-p8',
      title: 'How many power-iteration steps?',
      type: 'apply',
      difficulty: 2,
      minutes: 6,
      statement: md`A symmetric matrix has eigenvalues $10, 9, 1$. Starting with error 1 (in the sense of the convergence derivation), how many power-iteration steps are needed to reduce the error below $10^{-6}$? How would the answer change if the eigenvalues were $10, 1, 1$?`,
      solution: [
        md`The error shrinks like $(9/10)^k$. We need $0.9^k < 10^{-6}$, i.e. $k > \dfrac{\ln 10^{-6}}{\ln 0.9} = \dfrac{-13.816}{-0.10536} \approx 131.1$.`,
        md`So $k = 132$ steps.`,
        md`With eigenvalues $10, 1, 1$ the ratio is $0.1$, and $0.1^k < 10^{-6}$ needs $k = 7$ steps. The gap between the top two eigenvalues decides the cost.`,
      ],
      answer: { kind: 'number', value: 132 },
    },
    {
      id: 'la07-p9',
      title: 'A linear recurrence',
      type: 'apply',
      difficulty: 2,
      minutes: 8,
      statement: md`A linear recurrent layer computes $\bh_t = W\bh_{t-1}$ with $W = \begin{bmatrix} 0.5 & 0.4 \\ 0.4 & 0.5 \end{bmatrix}$. Find the eigenvalues of $W$ and describe $\bh_{t}$ for large $t$, starting from $\bh_0 = (1, 0)$. By what factor does the norm of $\partial\bh_{20}/\partial\bh_0 = W^{20}$ shrink compared with $W^0 = I$? Enter the spectral norm of $W^{20}$, rounded to 4 significant digits.`,
      solution: [
        md`$W$ is symmetric with $\tr = 1$ and $\det = 0.25 - 0.16 = 0.09$: $\lambda^2 - \lambda + 0.09 = 0$, so $\lambda = 0.9$ and $0.1$, with eigenvectors $\tfrac{1}{\sqrt2}(1, 1)$ and $\tfrac{1}{\sqrt2}(1, -1)$.`,
        md`$\bh_0 = (1, 0) = \tfrac12(1, 1) + \tfrac12(1, -1)$, so $\bh_t = \tfrac12\,0.9^t(1, 1) + \tfrac12\,0.1^t(1, -1)$. For large $t$ the second term is negligible: $\bh_t \approx \tfrac12\,0.9^t(1, 1)$, decaying along $(1, 1)$.`,
        md`$W^{20} = Q\,\diag(0.9^{20}, 0.1^{20})\,Q\T$; for a symmetric matrix the spectral norm is the largest $|\lambda|$, so $\lVert W^{20}\rVert = 0.9^{20} \approx 0.1216$. The gradient signal shrinks by about a factor 8 over 20 steps: a vanishing gradient.`,
      ],
      answer: { kind: 'number', value: 0.1216, tol: 1e-3 },
      areas: ['math', 'ml-depth'],
    },
    {
      id: 'la07-p10',
      title: 'Symmetric matrices have real eigenvalues',
      type: 'proof',
      difficulty: 3,
      minutes: 12,
      statement: md`Let $A$ be real and symmetric, and let $A\bv = \lambda\bv$ with $\bv \in \mathbb{C}^n$ nonzero and $\lambda \in \mathbb{C}$. Prove that $\lambda$ is real. Use $\bar\bv$ for the complex conjugate and the fact that $\bar\bv\T\bv = \sum_i|v_i|^2 > 0$.`,
      hints: [md`Consider the number $s = \bar\bv\T A\bv$. Compute it once using $A\bv = \lambda\bv$, and show separately that $\bar s = s$.`],
      solution: [
        md`$s = \bar\bv\T A\bv = \lambda\,\bar\bv\T\bv = \lambda\lVert\bv\rVert^2$, where $\lVert\bv\rVert^2 = \sum_i|v_i|^2 > 0$.`,
        md`Conjugate $s$: $A$ is real, so $\bar s = \bv\T A\bar\bv$.`,
        md`A $1\times1$ matrix equals its transpose: $\bv\T A\bar\bv = (\bv\T A\bar\bv)\T = \bar\bv\T A\T\bv = \bar\bv\T A\bv = s$, using $A\T = A$.`,
        md`So $\bar s = s$ and $s$ is real. Then $\lambda = s/\lVert\bv\rVert^2$ is a real number divided by a positive real number, so it is real.`,
      ],
      rubric: [md`Introduces $s = \bar\bv\T A\bv$ and computes it as $\lambda\lVert\bv\rVert^2$`, md`Uses that $A$ is real to conjugate`, md`Uses symmetry and the transpose of a scalar to show $s = \bar s$`, md`Concludes $\lambda$ is real`],
      areas: ['math'],
    },
  ],
};
