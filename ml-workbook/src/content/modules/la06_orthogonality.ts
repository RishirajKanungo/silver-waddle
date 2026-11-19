import { md, type Module } from '../types';

export const MODULE: Module = {
  id: 'la06',
  part: 'la',
  order: 6,
  title: 'Orthogonality, projections and least squares',
  summary: 'Orthonormal bases and orthogonal matrices, projection onto a subspace, least squares through the normal equations, Gram–Schmidt and QR.',
  relevance: md`Linear regression's closed-form solution is a projection: the fitted values are the orthogonal projection of the targets onto the column space of the design matrix, and the residuals are orthogonal to every feature. Library least-squares solvers use QR or the SVD instead of inverting $X\T X$, for the conditioning reasons in lesson 6.3. Orthogonal matrices appear as rotations in rotary position embeddings (RoPE), as orthogonal weight initialization, and inside every QR and SVD routine. Deriving the normal equations and explaining their geometry is a standard interview question.`,
  areas: ['math', 'ml-depth'],
  prereqs: ['la01'],
  lessons: [
    // ------------------------------------------------------------------ 6.1
    {
      id: 'la06-1',
      title: 'Orthonormal bases and orthogonal matrices',
      minutes: 35,
      objectives: [
        'Check whether a set of vectors is orthogonal or orthonormal, and find coordinates in an orthonormal basis with dot products.',
        'State QᵀQ = I, test a matrix for it, and invert an orthogonal matrix by transposing.',
        'Prove that orthogonal matrices preserve dot products, lengths and angles, and tell a rotation from a reflection by the determinant.',
        'Compute the orthogonal complement of a subspace and use the fact that the null space of A is the orthogonal complement of its row space.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`In the standard basis, the coordinates of $\bx$ are just its entries. In a general basis $\bb_1, \dots, \bb_n$, finding the coefficients $c_i$ with $\bx = c_1\bb_1 + \dots + c_n\bb_n$ means solving a linear system, as in the module on elimination. When the basis vectors are perpendicular unit vectors, each coefficient is a single dot product instead.

This is one reason PCA, the SVD and the discrete Fourier transform all produce orthonormal bases: changing coordinates becomes cheap, exactly invertible, and numerically safe.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Orthogonal and orthonormal sets',
          md: md`Vectors $\bq_1, \dots, \bq_k$ are **orthogonal** if $\bq_i\cdot\bq_j = 0$ for all $i \neq j$. They are **orthonormal** if, in addition, each has length 1:
$$\bq_i\cdot\bq_j = \begin{cases} 1 & i = j \\ 0 & i \neq j. \end{cases}$$
Nonzero orthogonal vectors are always linearly independent, so $n$ orthonormal vectors in $\R^n$ form a basis, an **orthonormal basis**.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          md: md`In an orthonormal basis, the coordinate $c_i$ of $\bx$ is the length of the shadow of $\bx$ on the axis $\bq_i$, and the shadows on perpendicular axes add back up to $\bx$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.onb-coords', x: [2.5, 1], theta: 30 },
          task: md`Rotate the basis with $\theta$ and drag $\bx$. Check that $c_1^2 + c_2^2$ always equals $\lVert\bx\rVert^2$. Then switch to **not orthogonal**: do the two shadows still add up to $\bx$?`,
          caption: md`With an orthonormal basis, $\bx = (\bq_1\cdot\bx)\,\bq_1 + (\bq_2\cdot\bx)\,\bq_2$ for every $\bx$. With a skewed basis the dot products are no longer the coordinates; you would have to solve a $2\times 2$ system.`,
        },
        {
          kind: 'derive',
          title: 'coordinates are dot products',
          goal: md`Let $\bq_1, \dots, \bq_n$ be an orthonormal basis of $\R^n$ and $\bx = c_1\bq_1 + \dots + c_n\bq_n$. Show that $c_i = \bq_i\cdot\bx$.`,
          steps: [
            {
              md: md`Take the dot product of both sides with $\bq_i$: $$\bq_i\cdot\bx = c_1\,\bq_i\cdot\bq_1 + \dots + c_n\,\bq_i\cdot\bq_n.$$`,
              choose: {
                prompt: md`Which operation isolates one coefficient $c_i$?`,
                options: [md`Dot both sides with $\bq_i$`, md`Take the norm of both sides`, md`Add all the $\bq_j$ together`],
                answer: 0,
                explain: md`Dotting with $\bq_i$ turns every term with $j \neq i$ into zero, by orthogonality.`,
              },
            },
            { md: md`Every $\bq_i\cdot\bq_j$ with $j \ne i$ is $0$, and $\bq_i\cdot\bq_i = 1$. Only one term survives: $\bq_i\cdot\bx = c_i$.` },
            { md: md`Taking the squared length of $\bx = \sum_i c_i\bq_i$ and expanding the same way gives $\lVert\bx\rVert^2 = \sum_i c_i^2$, the Pythagorean theorem in $n$ dimensions.` },
          ],
          takeaway: md`If $Q$ has the $\bq_i$ as columns, the coordinate vector is $\bc = Q\T\bx$ and $\bx = Q\bc$. Changing to and from an orthonormal basis costs a matrix product, with no system to solve.`,
        },
        {
          kind: 'numeric',
          q: md`$\bq_1 = (0.6, 0.8)$ and $\bq_2 = (-0.8, 0.6)$ form an orthonormal basis of $\R^2$. Find the coordinates $(c_1, c_2)$ of $\bx = (2, 1)$ in this basis.`,
          answer: { kind: 'vector', value: [2, -1] },
          explain: md`$c_1 = \bq_1\cdot\bx = 1.2 + 0.8 = 2$ and $c_2 = \bq_2\cdot\bx = -1.6 + 0.6 = -1$. Check: $2(0.6, 0.8) - (-0.8, 0.6) = (2, 1)$, and $c_1^2 + c_2^2 = 5 = \lVert\bx\rVert^2$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Orthogonal matrix',
          md: md`A square matrix $Q$ is **orthogonal** if its columns are orthonormal, that is $$Q\T Q = I.$$ Then $Q^{-1} = Q\T$, so also $QQ\T = I$ and the rows are orthonormal too. A non-square $m \times n$ matrix with orthonormal columns ($m > n$) still has $Q\T Q = I_n$, but $QQ\T \neq I_m$; lesson 6.2 shows that $QQ\T$ is a projection.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.ortho-q', mode: 'rotation', theta: 40 },
          task: md`In **rotation** mode, drag $\bu$ and $\bv$ and change $\theta$: the lengths and the angle in the readout never change. Switch to **reflection**. What happens to the letter F, and what is $\det Q$? Finally switch to **shear** and find a $k$ for which the angle changes by more than $30^\circ$.`,
          caption: md`Every $2\times2$ orthogonal matrix is a rotation ($\det = 1$) or a reflection ($\det = -1$). Both keep $Q\T Q = I$. The shear has $A\T A \neq I$, and it distorts lengths and angles.`,
        },
        {
          kind: 'derive',
          title: 'orthogonal matrices preserve geometry',
          goal: md`Show that for orthogonal $Q$ and all $\bx, \by$: $(Q\bx)\cdot(Q\by) = \bx\cdot\by$. Conclude that $Q$ preserves lengths and angles, and that $\det Q = \pm 1$.`,
          steps: [
            {
              md: md`Write the dot product as a matrix product and use $(Q\bx)\T = \bx\T Q\T$: $$(Q\bx)\cdot(Q\by) = \bx\T Q\T Q\,\by.$$`,
              choose: {
                prompt: md`What is the useful way to write $(Q\bx)\cdot(Q\by)$?`,
                options: [md`$(Q\bx)\T(Q\by) = \bx\T Q\T Q\by$`, md`$Q(\bx\cdot\by)$`, md`$\det Q\,(\bx\cdot\by)$`],
                answer: 0,
                explain: md`A dot product is $\ba\T\bb$, and transposing a product reverses the order. The second option is not even a number.`,
              },
            },
            { md: md`Since $Q\T Q = I$, this is $\bx\T\by = \bx\cdot\by$.` },
            { md: md`With $\by = \bx$: $\lVert Q\bx\rVert^2 = \lVert\bx\rVert^2$. Lengths and dot products are preserved, so $\cos\theta = \dfrac{\bx\cdot\by}{\lVert\bx\rVert\lVert\by\rVert}$ is preserved too.` },
            { md: md`For the determinant: $1 = \det I = \det(Q\T Q) = \det(Q\T)\det Q = (\det Q)^2$, so $\det Q = \pm 1$.` },
          ],
          takeaway: md`Orthogonal matrices are the rigid motions that fix the origin. Applying one never amplifies errors: $\lVert Q(\bx + \boldsymbol\delta) - Q\bx\rVert = \lVert\boldsymbol\delta\rVert$. This is why numerical algorithms build on them.`,
        },
        {
          kind: 'check',
          q: md`Which matrix is orthogonal?`,
          options: [
            md`$\dfrac{1}{\sqrt2}\begin{bmatrix} 1 & 1 \\ -1 & 1 \end{bmatrix}$`,
            md`$\begin{bmatrix} 1 & 1 \\ -1 & 1 \end{bmatrix}$`,
            md`$\begin{bmatrix} 0.6 & 0.8 \\ 0.8 & 0.6 \end{bmatrix}$`,
            md`$\begin{bmatrix} 1 & 0 \\ 1 & 1 \end{bmatrix}$`,
          ],
          answer: 0,
          explain: md`The second has orthogonal columns of length $\sqrt2$, so $A\T A = 2I$. The third has unit columns, but their dot product is $0.48 + 0.48 = 0.96 \neq 0$. The fourth is a shear. Only the first has orthonormal columns; it is a rotation by $-45^\circ$.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          title: 'Where this appears in ML',
          md: md`Rotary position embeddings (RoPE) rotate each pair of coordinates of a query or key vector by an angle proportional to the token's position. Rotations are orthogonal, so norms are unchanged, and $(R_m\bq)\cdot(R_n\bk) = \bq\T R_m\T R_n\bk = \bq\T R_{n-m}\bk$: the attention score depends only on the relative position $n - m$. Orthogonal matrices are also used to initialize weights in some networks, because they preserve the norm of signals passing through a linear layer.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'la06-1-paper',
            title: 'Products and inverses of orthogonal matrices',
            type: 'proof',
            difficulty: 1,
            minutes: 6,
            statement: md`Let $Q_1$ and $Q_2$ be orthogonal $n\times n$ matrices. Prove that $Q_1Q_2$ and $Q_1^{-1}$ are orthogonal. Interpret the first fact for rotations of the plane.`,
            hints: [md`Check the defining identity $M\T M = I$ for $M = Q_1Q_2$, using $(Q_1Q_2)\T = Q_2\T Q_1\T$.`],
            solution: [
              md`$(Q_1Q_2)\T(Q_1Q_2) = Q_2\T Q_1\T Q_1 Q_2 = Q_2\T I Q_2 = Q_2\T Q_2 = I$, so $Q_1Q_2$ is orthogonal.`,
              md`$Q_1^{-1} = Q_1\T$, and $(Q_1\T)\T Q_1\T = Q_1 Q_1\T = I$ because a square matrix's left inverse is also its right inverse. So $Q_1^{-1}$ is orthogonal.`,
              md`For rotations of the plane: rotating by $\alpha$ and then by $\beta$ is a rotation by $\alpha + \beta$, again a rigid motion. Undoing a rotation is rotating backwards.`,
            ],
            rubric: [md`Uses the transpose of a product in the right order`, md`Uses $Q\T Q = I$ to collapse the middle`, md`Handles the inverse, noting $QQ\T = I$ for square $Q$`],
          },
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Orthogonal complement',
          md: md`The **orthogonal complement** of a subspace $V \subseteq \R^n$ is $$V^\perp = \{\bw \in \R^n : \bw\cdot\bv = 0 \text{ for every } \bv \in V\}.$$ It is a subspace, $\dim V + \dim V^\perp = n$, and $(V^\perp)^\perp = V$. For any matrix $A$: $$(\Row A)^\perp = \Null A, \qquad (\Col A)^\perp = \Null A\T.$$`,
        },
        {
          kind: 'text',
          md: md`The identity $(\Row A)^\perp = \Null A$ is the definition of matrix–vector multiplication read differently. $A\bx = \bzero$ says that every row of $A$ has dot product zero with $\bx$, and then so does every combination of rows. The four fundamental subspaces from the module on subspaces therefore come in two perpendicular pairs: $\Row A \perp \Null A$ in $\R^n$, and $\Col A \perp \Null A\T$ in $\R^m$.`,
        },
        {
          kind: 'numeric',
          q: md`Find a nonzero vector spanning the orthogonal complement of the plane $V = \Span\{(1, 1, 0), (0, 1, 1)\}$ in $\R^3$.`,
          answer: { kind: 'vector', value: [1, -1, 1], upToScale: true },
          hints: [md`$V^\perp$ is the null space of the matrix with rows $(1, 1, 0)$ and $(0, 1, 1)$. Solve $w_1 + w_2 = 0$ and $w_2 + w_3 = 0$.`],
          explain: md`From $w_1 + w_2 = 0$ and $w_2 + w_3 = 0$: $w_1 = -w_2$ and $w_3 = -w_2$. With $w_2 = -1$: $\bw = (1, -1, 1)$. Any nonzero multiple is correct. The complement has dimension $3 - 2 = 1$, a line.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

t = np.pi / 6
Q = np.array([[np.cos(t), -np.sin(t)],
              [np.sin(t),  np.cos(t)]])
x = np.array([3.0, 4.0])
print(round(float(np.linalg.norm(Q @ x)), 6))`,
          predict: {
            q: md`$Q$ rotates by $30^\circ$. What is printed?`,
            options: ['`5.0`', '`7.0`', '`4.330127`', '`2.5`'],
            answer: 0,
            explain: md`A rotation preserves length, and $\lVert(3, 4)\rVert = 5$. The angle does not matter.`,
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

np.random.seed(0)
M = np.random.randn(4, 4)
Q, _ = np.linalg.qr(M)                     # Q has orthonormal columns (lesson 6.3)

print(np.allclose(Q.T @ Q, np.eye(4)))     # Q^T Q = I
print(np.allclose(np.linalg.inv(Q), Q.T))  # the inverse is the transpose
x = np.random.randn(4)
print(round(abs(float(np.linalg.norm(Q @ x) - np.linalg.norm(x))), 10))
print(round(abs(float(np.linalg.det(Q))), 10))`,
          note: md`\`np.allclose\` compares up to rounding error. Comparing floats with \`==\` would fail here, because the products are computed in floating point.`,
        },
        {
          kind: 'recall',
          prompt: md`Without looking back: define an orthogonal matrix, give its inverse, and list three things it preserves. What are the possible values of its determinant?`,
          answer: md`$Q$ is square with orthonormal columns: $Q\T Q = I$, so $Q^{-1} = Q\T$. It preserves dot products, hence lengths and angles (and distances). $\det Q = \pm1$: $+1$ for rotations, $-1$ when a reflection is involved.`,
        },
      ],
      cards: [
        { id: 'la06-1-c1', kind: 'concept', front: md`How do you find the coordinates of $\bx$ in an orthonormal basis $\bq_1, \dots, \bq_n$?`, back: md`$c_i = \bq_i\cdot\bx$. In matrix form $\bc = Q\T\bx$, and $\bx = Q\bc$.` },
        { id: 'la06-1-c2', kind: 'cloze', text: md`A square matrix $Q$ is orthogonal when $Q\T Q = I$; its inverse is its {{}}.`, answers: ['transpose'] },
        { id: 'la06-1-c3', kind: 'compute', front: md`Coordinates of $\bx = (5, 0)$ in the orthonormal basis $\bq_1 = (0.6, 0.8)$, $\bq_2 = (-0.8, 0.6)$.`, answer: { kind: 'vector', value: [3, -4] }, back: md`$c_1 = 3$, $c_2 = -4$. Check: $9 + 16 = 25 = \lVert\bx\rVert^2$.` },
        { id: 'la06-1-c4', kind: 'concept', front: md`Why does an orthogonal matrix preserve lengths? One line.`, back: md`$\lVert Q\bx\rVert^2 = \bx\T Q\T Q\bx = \bx\T\bx = \lVert\bx\rVert^2$.` },
        { id: 'la06-1-c5', kind: 'cloze', text: md`$(\Row A)^\perp$ is the {{}} space of $A$.`, answers: ['null'] },
      ],
    },
    // ------------------------------------------------------------------ 6.2
    {
      id: 'la06-2',
      title: 'Projections and least squares',
      minutes: 40,
      objectives: [
        'Derive the normal equations AᵀA x̂ = Aᵀb from the condition that the residual is orthogonal to the column space of A.',
        'Compute x̂, the projection p = Ax̂ and the residual by hand for a 3×2 matrix.',
        'Verify that P = A(AᵀA)⁻¹Aᵀ satisfies P² = P and Pᵀ = P.',
        'Fit a least-squares line to a few points and read Aᵀe = 0 as two conditions on the residuals.',
        'Explain why the closed form of linear regression is this projection.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Fitting a line $y = c + mx$ to five measured points gives five equations in two unknowns:
$$c + m x_i = y_i, \qquad i = 1, \dots, 5.$$
In matrix form this is $A\bx = \bb$ with $A$ of shape $5\times 2$. Unless the points happen to lie on a line, $\bb$ is not in $\Col A$ and there is no exact solution. The best one can do is choose $\bx$ so that $A\bx$ is as close to $\bb$ as possible: minimize $\lVert A\bx - \bb\rVert^2$, the sum of squared errors. This is **least squares**.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          md: md`The set of all $A\bx$ is a subspace, $\Col A$. The point of a plane closest to $\bb$ is found by dropping a perpendicular, so the best $A\hat\bx$ is the orthogonal projection of $\bb$ onto $\Col A$, and the leftover error is perpendicular to the plane.`,
        },
        {
          kind: 'derive',
          title: 'the normal equations',
          goal: md`Let $A$ be $m\times n$ with independent columns. Find the $\hat\bx$ that makes $\bp = A\hat\bx$ the point of $\Col A$ closest to $\bb$.`,
          steps: [
            {
              md: md`The residual $\be = \bb - A\hat\bx$ must be orthogonal to $\Col A$, that is, to every column $\ba_j$ of $A$: $\ba_j\T(\bb - A\hat\bx) = 0$ for all $j$.`,
              choose: {
                prompt: md`What condition characterizes the closest point $\bp$ in a subspace?`,
                options: [md`The residual $\bb - \bp$ is orthogonal to the subspace`, md`$\bp$ has the same length as $\bb$`, md`$\bp$ is parallel to $\bb$`],
                answer: 0,
                explain: md`As for a single vector in Module 1, the shortest connection from $\bb$ to the subspace is perpendicular to it. Problem 10 proves this with Pythagoras.`,
              },
            },
            { md: md`Stack the $n$ conditions as rows: they are the rows of $A\T$, so $$A\T(\bb - A\hat\bx) = \bzero.$$` },
            {
              md: md`Rearrange: $$A\T A\,\hat\bx = A\T\bb.$$ These are the **normal equations**: $n$ equations in $n$ unknowns.`,
            },
            {
              md: md`If the columns of $A$ are independent, $A\T A$ is invertible (lesson 7.3 shows it is positive definite), so $$\hat\bx = (A\T A)^{-1}A\T\bb, \qquad \bp = A\hat\bx = \underbrace{A(A\T A)^{-1}A\T}_{P}\,\bb.$$`,
            },
          ],
          takeaway: md`Minimizing $\lVert A\bx - \bb\rVert^2$ and projecting $\bb$ onto $\Col A$ are the same problem. The normal equations say exactly that the residual is orthogonal to every column.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Projection onto a subspace',
          md: md`If $A$ has independent columns, the projection onto $\Col A$ is $$P = A(A\T A)^{-1}A\T, \qquad P^2 = P, \qquad P\T = P.$$ Special cases: for one column $\ba$, $P = \dfrac{\ba\ba\T}{\ba\T\ba}$, the projection onto a line from Module 1. For orthonormal columns $Q$, $Q\T Q = I$ and $P = QQ\T$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.proj-plane3d', a1: [1, 0, 1], a2: [0, 1, 1], b: [1, 3, 0] },
          task: md`Drag the view until the red residual looks perpendicular to the green plane. Then move $\bb$ with the sliders. Find a $\bb$ with zero residual: where does it have to be? Watch $A\T\be$ stay at $(0, 0)$ throughout.`,
          caption: md`$\bp = A\hat\bx$ is the shadow of $\bb$ on the plane $\Col A$. The residual $\be = \bb - \bp$ is perpendicular to both columns, which is the statement $A\T\be = \bzero$.`,
        },
        {
          kind: 'callout',
          tone: 'example',
          title: 'Worked example',
          md: md`Columns $\ba_1 = (1, 0, 1)$, $\ba_2 = (0, 1, 1)$, and $\bb = (2, 1, 0)$.

1. $A\T A = \begin{bmatrix} 2 & 1 \\ 1 & 2 \end{bmatrix}$ and $A\T\bb = \begin{bmatrix} 2 \\ 1 \end{bmatrix}$.
2. Solve: $2\hat x_1 + \hat x_2 = 2$ and $\hat x_1 + 2\hat x_2 = 1$ give $\hat\bx = (1, 0)$.
3. $\bp = 1\cdot\ba_1 + 0\cdot\ba_2 = (1, 0, 1)$ and $\be = \bb - \bp = (1, 1, -1)$.
4. Check: $\ba_1\cdot\be = 1 + 0 - 1 = 0$ and $\ba_2\cdot\be = 0 + 1 - 1 = 0$.`,
        },
        {
          kind: 'numeric',
          q: md`Same columns $\ba_1 = (1, 0, 1)$, $\ba_2 = (0, 1, 1)$, now with $\bb = (1, 1, 1)$. Solve the normal equations for $\hat\bx$.`,
          answer: { kind: 'vector', value: [2 / 3, 2 / 3] },
          hints: [md`$A\T\bb = (2, 2)$. Use $(A\T A)^{-1} = \frac13\begin{bmatrix} 2 & -1 \\ -1 & 2 \end{bmatrix}$.`],
          explain: md`$\hat\bx = \frac13(4 - 2,\ -2 + 4) = (\tfrac23, \tfrac23)$. Then $\bp = (\tfrac23, \tfrac23, \tfrac43)$ and $\be = (\tfrac13, \tfrac13, -\tfrac13)$, which is orthogonal to both columns.`,
        },
        {
          kind: 'check',
          q: md`$P$ is the projection matrix onto a plane in $\R^3$. What is $P^2$?`,
          options: [md`$P$`, md`$I$`, md`$0$`, md`$2P$`],
          answer: 0,
          explain: md`After one projection the vector already lies in the plane, and projecting it again leaves it where it is. Algebraically, $P^2 = A(A\T A)^{-1}(A\T A)(A\T A)^{-1}A\T = A(A\T A)^{-1}A\T = P$.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'la06-2-paper',
            title: 'Properties of the projection matrix',
            type: 'derive',
            difficulty: 2,
            minutes: 10,
            statement: md`Let $A$ have independent columns and $P = A(A\T A)^{-1}A\T$. Show that (a) $P^2 = P$, (b) $P\T = P$, (c) $I - P$ is also a projection, and $(I - P)\bb$ is orthogonal to $\Col A$ for every $\bb$.`,
            hints: [md`For (b) use $(M^{-1})\T = (M\T)^{-1}$ and that $A\T A$ is symmetric.`, md`For (c), compute $(I-P)^2$ and $A\T(I - P)$.`],
            solution: [
              md`(a) $P^2 = A(A\T A)^{-1}\,A\T A\,(A\T A)^{-1}A\T$. The middle $A\T A$ cancels one inverse, leaving $A(A\T A)^{-1}A\T = P$.`,
              md`(b) $P\T = (A\T)\T\big((A\T A)^{-1}\big)\T A\T = A\big((A\T A)\T\big)^{-1}A\T = A(A\T A)^{-1}A\T = P$, since $A\T A$ is symmetric.`,
              md`(c) $(I - P)^2 = I - 2P + P^2 = I - 2P + P = I - P$, so $I - P$ is a projection.`,
              md`$A\T(I - P) = A\T - A\T A(A\T A)^{-1}A\T = A\T - A\T = 0$. So $A\T(I-P)\bb = \bzero$: the vector $(I-P)\bb = \bb - P\bb$, the residual, is orthogonal to every column of $A$.`,
            ],
            rubric: [md`(a) with the cancellation shown`, md`(b) using the transpose of an inverse and the symmetry of $A\T A$`, md`(c) idempotence of $I - P$`, md`(c) $A\T(I - P) = 0$ and its meaning: $I - P$ projects onto $(\Col A)^\perp = \Null A\T$`],
          },
        },
        {
          kind: 'text',
          md: md`### Fitting a line

For data $(x_i, y_i)$ and the model $y \approx c + mx$, the matrix and the normal equations are
$$A = \begin{bmatrix} 1 & x_1 \\ \vdots & \vdots \\ 1 & x_n \end{bmatrix}, \qquad \begin{bmatrix} n & \sum x_i \\ \sum x_i & \sum x_i^2 \end{bmatrix} \begin{bmatrix} c \\ m \end{bmatrix} = \begin{bmatrix} \sum y_i \\ \sum x_iy_i \end{bmatrix}.$$
The condition $A\T\be = \bzero$ reads, row by row:
- $\sum_i e_i = 0$: with an intercept column of ones, the residuals sum to zero;
- $\sum_i x_ie_i = 0$: the residuals are uncorrelated with the feature.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.lsq-line', points: [[0, 1], [1, 1.5], [2, 3.5], [4, 4], [5, 6]] },
          task: md`Turn on **try your own line** and try to beat the green line's SSE with the sliders. Then drag one point far upward. Notice how far the line moves: squaring makes one large residual count heavily.`,
          caption: md`Red segments are the residuals $e_i = y_i - (\hat c + \hat m x_i)$. The readout shows $\sum e_i = 0$ and $\sum x_ie_i = 0$ for every configuration, the two rows of $A\T\be = \bzero$.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'la06-2-paper-line',
            title: 'A line through three points',
            type: 'compute',
            difficulty: 1,
            minutes: 8,
            statement: md`Find the least-squares line $y = c + mx$ through $(0, 6)$, $(1, 0)$, $(2, 0)$. Give the residuals and the sum of squared errors. Enter $[c, m]$.`,
            hints: [md`$n = 3$, $\sum x_i = 3$, $\sum x_i^2 = 5$, $\sum y_i = 6$, $\sum x_iy_i = 0$.`],
            solution: [
              md`$A\T A = \begin{bmatrix} 3 & 3 \\ 3 & 5 \end{bmatrix}$ and $A\T\by = \begin{bmatrix} 6 \\ 0 \end{bmatrix}$.`,
              md`$\det A\T A = 15 - 9 = 6$. By the $2\times2$ inverse: $c = \frac{5\cdot 6 - 3\cdot 0}{6} = 5$ and $m = \frac{-3\cdot 6 + 3\cdot 0}{6} = -3$.`,
              md`Fitted values $(5, 2, -1)$, residuals $\be = (1, -2, 1)$. Check: $\sum e_i = 0$ and $\sum x_ie_i = 0 - 2 + 2 = 0$.`,
              md`SSE $= 1 + 4 + 1 = 6$.`,
            ],
            answer: { kind: 'vector', value: [5, -3] },
          },
        },
        {
          kind: 'callout',
          tone: 'intuition',
          title: 'Linear regression is least squares',
          md: md`Ordinary least-squares regression with design matrix $X$ ($n$ samples by $d$ features, with a column of ones for the intercept) minimizes $\lVert X\bw - \by\rVert^2$. Its closed form $\hat\bw = (X\T X)^{-1}X\T\by$ is the normal equations, and the fitted values $\hat\by = X\hat\bw = P\by$ are the projection of $\by$ onto $\Col X$. In statistics $P$ is called the hat matrix. Ridge regression replaces $X\T X$ by $X\T X + \lambda I$, which is invertible for every $\lambda > 0$ even when features are collinear.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

x = np.array([0.0, 1.0, 2.0])
y = np.array([6.0, 0.0, 0.0])
A = np.column_stack([np.ones_like(x), x])   # columns: 1, x
w = np.linalg.solve(A.T @ A, A.T @ y)       # normal equations
print(np.round(w, 6))`,
          predict: {
            q: md`This is the three-point problem above. What is printed?`,
            options: ['`[ 5. -3.]`', '`[-3.  5.]`', '`[ 2. -1.]`', '`[5 -3]`'],
            answer: 0,
            explain: md`$(c, m) = (5, -3)$, in the order of the columns of $A$. The values are floats, so NumPy prints \`5.\` and pads the positive entry with a space to align with the minus sign.`,
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'la06-2-ex',
            title: 'Least squares through the normal equations',
            prompt: md`Write \`lstsq_normal(A, b)\` that returns $\hat\bx$ solving $A\T A\hat\bx = A\T\bb$. Use \`np.linalg.solve\`, not an explicit inverse.`,
            starter: `import numpy as np

def lstsq_normal(A, b):
    # form A^T A and A^T b, then solve
    return np.zeros(A.shape[1])
`,
            solution: `import numpy as np

def lstsq_normal(A, b):
    return np.linalg.solve(A.T @ A, A.T @ b)
`,
            tests: [
              { expr: 'np.round(lstsq_normal(np.array([[1.0, 0.0], [0.0, 1.0], [1.0, 1.0]]), np.array([2.0, 1.0, 0.0])), 6).tolist()', label: 'worked example' },
              { expr: 'np.round(lstsq_normal(np.array([[1.0, 0.0], [1.0, 1.0], [1.0, 2.0], [1.0, 3.0]]), np.array([1.0, 2.0, 2.0, 4.0])), 6).tolist()', label: 'line through four points' },
            ],
            hints: [md`\`A.T @ A\` is $A\T A$ and \`A.T @ b\` is $A\T\bb$.`, md`\`np.linalg.solve(M, v)\` solves $M\bx = \bv$.`],
            mustInclude: ['solve'],
          },
        },
        {
          kind: 'explain',
          prompt: md`Explain to an interviewer why the residuals of an ordinary least-squares fit with an intercept sum to zero, and what "the residual is orthogonal to the features" means.`,
          model: md`Least squares chooses $\hat\bw$ so that $X\hat\bw$ is the orthogonal projection of $\by$ onto the column space of $X$. The residual $\be = \by - X\hat\bw$ is then perpendicular to every column: $X\T\be = \bzero$, which is just the normal equations rewritten. One column of $X$ is all ones for the intercept, and its dot product with $\be$ is $\sum e_i$, so the residuals sum to zero. For each feature column, $\sum_i x_{ij}e_i = 0$: there is no linear trend in that feature left in the residuals. If there were, adjusting its weight would reduce the error.`,
        },
      ],
      cards: [
        { id: 'la06-2-c1', kind: 'concept', front: md`State the normal equations and the geometric condition they express.`, back: md`$A\T A\hat\bx = A\T\bb$. Equivalently $A\T(\bb - A\hat\bx) = \bzero$: the residual is orthogonal to every column of $A$.` },
        { id: 'la06-2-c2', kind: 'concept', front: md`Projection matrix onto $\Col A$ (independent columns), and its two defining properties.`, back: md`$P = A(A\T A)^{-1}A\T$. $P^2 = P$ and $P\T = P$.` },
        { id: 'la06-2-c3', kind: 'compute', front: md`Least-squares $[c, m]$ for the line through $(0, 0)$, $(1, 1)$, $(2, 1)$.`, answer: { kind: 'vector', value: [1 / 6, 0.5] }, back: md`$A\T A = \begin{bmatrix}3&3\\3&5\end{bmatrix}$, $A\T\by = (2, 3)$. $c = (10 - 9)/6 = \tfrac16$, $m = (9 - 6)/6 = \tfrac12$.` },
        { id: 'la06-2-c4', kind: 'cloze', text: md`With an intercept column, the least-squares residuals always sum to the number {{}}.`, answers: ['0'] },
        { id: 'la06-2-c5', kind: 'concept', front: md`Projection onto $\Col Q$ when $Q$ has orthonormal columns.`, back: md`$P = QQ\T$, because $Q\T Q = I$. The coefficients are $Q\T\bb$.` },
      ],
    },
    // ------------------------------------------------------------------ 6.3
    {
      id: 'la06-3',
      title: 'Gram–Schmidt, QR and stable least squares',
      minutes: 35,
      objectives: [
        'Run Gram–Schmidt by hand on two or three vectors.',
        'Write A = QR, read the entries of R as dot products, and explain why R is upper triangular.',
        'Solve a least-squares problem from the triangular system Rx̂ = Qᵀb.',
        'Explain why forming AᵀA squares the condition number and can destroy all accuracy.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Lesson 6.2 showed that projections are trivial when the columns are orthonormal: the coefficients are $Q\T\bb$ and the projection is $QQ\T\bb$. Gram–Schmidt converts any independent columns $\ba_1, \dots, \ba_n$ into orthonormal ones $\bq_1, \dots, \bq_n$ with the same span, one column at a time. Recording what it did gives the factorization $A = QR$, which is how least-squares problems are solved in practice.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Gram–Schmidt',
          md: md`$\bq_1 = \ba_1/\lVert\ba_1\rVert$. For $j = 2, \dots, n$: subtract from $\ba_j$ its projections onto the $\bq$'s found so far, then normalize:
$$\be_j = \ba_j - \sum_{i<j} (\bq_i\cdot\ba_j)\,\bq_i, \qquad \bq_j = \frac{\be_j}{\lVert\be_j\rVert}.$$
At every stage $\Span\{\bq_1, \dots, \bq_j\} = \Span\{\ba_1, \dots, \ba_j\}$.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          md: md`Each new vector keeps only the part that sticks out of the space already built: its residual from lesson 6.2.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.gram-schmidt', preset: 'standard' },
          task: md`Step through with ›. Before each click, predict which entry of $R$ fills in next. At step 4, drag the view to see that $\be_2$ is perpendicular to $\bq_1$. Then switch to **nearly dependent** and watch how short $\be_3$ becomes.`,
          caption: md`$r_{ij} = \bq_i\cdot\ba_j$ is the length of a shadow, and $r_{jj} = \lVert\be_j\rVert$ is the length of what is left. When $\ba_3$ is almost in the plane of $\ba_1, \ba_2$, $r_{33}$ is tiny and dividing by it amplifies rounding errors.`,
        },
        {
          kind: 'callout',
          tone: 'example',
          title: 'Worked example',
          md: md`$\ba_1 = (1, 1, 0)$, $\ba_2 = (2, 0, 1)$.

1. $\lVert\ba_1\rVert = \sqrt2$, so $\bq_1 = \tfrac{1}{\sqrt2}(1, 1, 0)$ and $r_{11} = \sqrt2$.
2. $r_{12} = \bq_1\cdot\ba_2 = \tfrac{2}{\sqrt2} = \sqrt2$.
3. $\be_2 = \ba_2 - \sqrt2\,\bq_1 = (2, 0, 1) - (1, 1, 0) = (1, -1, 1)$. Check: $\be_2\cdot\bq_1 = 0$.
4. $r_{22} = \lVert\be_2\rVert = \sqrt3$ and $\bq_2 = \tfrac{1}{\sqrt3}(1, -1, 1)$.

So $A = QR$ with $R = \begin{bmatrix} \sqrt2 & \sqrt2 \\ 0 & \sqrt3 \end{bmatrix}$.`,
        },
        {
          kind: 'numeric',
          q: md`Apply Gram–Schmidt to $\ba_1 = (3, 4)$, $\ba_2 = (1, 2)$. Enter $\bq_2$.`,
          answer: { kind: 'vector', value: [-0.8, 0.6] },
          hints: [md`$\bq_1 = (0.6, 0.8)$ and $\bq_1\cdot\ba_2 = 2.2$.`],
          explain: md`$\be_2 = (1, 2) - 2.2\,(0.6, 0.8) = (-0.32, 0.24)$, with length $0.4$. So $\bq_2 = (-0.8, 0.6)$. It is perpendicular to $\bq_1$, as it must be.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'QR factorization',
          md: md`Every $m\times n$ matrix $A$ with independent columns factors as $$A = QR,$$ where $Q$ is $m\times n$ with orthonormal columns and $R$ is $n\times n$ upper triangular with positive diagonal. The entries are $r_{ij} = \bq_i\cdot\ba_j$ for $i \le j$. $R$ is upper triangular because $\ba_j$ lies in $\Span\{\bq_1, \dots, \bq_j\}$, so it has no component along later $\bq$'s.`,
        },
        {
          kind: 'derive',
          title: 'least squares with QR',
          goal: md`Use $A = QR$ to simplify the normal equations $A\T A\hat\bx = A\T\bb$.`,
          steps: [
            { md: md`Substitute $A = QR$: $\;R\T Q\T Q R\,\hat\bx = R\T Q\T\bb$.` },
            {
              md: md`$Q\T Q = I$, so $R\T R\,\hat\bx = R\T Q\T\bb$.`,
              choose: {
                prompt: md`Which identity simplifies $R\T Q\T Q R$?`,
                options: [md`$Q\T Q = I$`, md`$QQ\T = I$`, md`$R\T R = I$`],
                answer: 0,
                explain: md`$Q$ has orthonormal columns, so $Q\T Q = I_n$. $QQ\T$ is only the projection onto $\Col A$ when $Q$ is not square, and $R$ is not orthogonal.`,
              },
            },
            { md: md`$R$ has a positive diagonal, so $R\T$ is invertible. Cancel it: $$R\hat\bx = Q\T\bb.$$` },
            { md: md`$R$ is upper triangular, so solve by back-substitution: the last equation gives $\hat x_n$, then work upward.` },
          ],
          takeaway: md`QR never forms $A\T A$. That matters for accuracy, as the rest of this lesson shows.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'la06-3-paper',
            title: 'Least squares by QR',
            type: 'compute',
            difficulty: 2,
            minutes: 10,
            statement: md`Let $A$ have columns $\ba_1 = (1, 1, 0)$ and $\ba_2 = (2, 0, 1)$ (the worked example) and let $\bb = (1, 2, 3)$. Solve the least-squares problem with $R\hat\bx = Q\T\bb$, then check your answer against the normal equations. Enter $\hat\bx$.`,
            hints: [md`$\bq_1 = \tfrac{1}{\sqrt2}(1, 1, 0)$, $\bq_2 = \tfrac{1}{\sqrt3}(1, -1, 1)$, $R = \begin{bmatrix}\sqrt2 & \sqrt2 \\ 0 & \sqrt3\end{bmatrix}$.`],
            solution: [
              md`$Q\T\bb = \big(\bq_1\cdot\bb,\ \bq_2\cdot\bb\big) = \big(\tfrac{3}{\sqrt2},\ \tfrac{2}{\sqrt3}\big)$.`,
              md`Back-substitution, last row first: $\sqrt3\,\hat x_2 = \tfrac{2}{\sqrt3}$, so $\hat x_2 = \tfrac23$.`,
              md`First row: $\sqrt2\,\hat x_1 + \sqrt2\,\hat x_2 = \tfrac{3}{\sqrt2}$, so $\hat x_1 + \hat x_2 = \tfrac32$ and $\hat x_1 = \tfrac32 - \tfrac23 = \tfrac56$.`,
              md`Check: $A\T A = \begin{bmatrix} 2 & 2 \\ 2 & 5 \end{bmatrix}$, $A\T\bb = (3, 5)$. Then $2\cdot\tfrac56 + 2\cdot\tfrac23 = 3$ and $2\cdot\tfrac56 + 5\cdot\tfrac23 = 5$.`,
            ],
            answer: { kind: 'vector', value: [5 / 6, 2 / 3] },
          },
        },
        {
          kind: 'text',
          md: md`### Conditioning

How much the solution of $A\bx = \bb$ can change when $\bb$ (or $A$) changes slightly is measured by the **condition number** $\kappa(A) = \sigma_{\max}/\sigma_{\min}$, the ratio of the largest to the smallest singular value (Module 8 defines these). As a rule of thumb, a computation with condition number $\kappa$ can lose about $\log_{10}\kappa$ of the roughly 16 significant digits of double precision.

Forming $A\T A$ squares the condition number: $\kappa(A\T A) = \kappa(A)^2$. If $\kappa(A) = 10^6$, QR works with $10^6$ and keeps about 10 digits, while the normal equations work with $10^{12}$ and keep about 4.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.cond-preview', phi: 60 },
          task: md`Set $\varphi$ to about $5^\circ$, then drag $\bb$ about $0.05$ away from $\bb_0$. How far does $\bx$ move? Compare $\kappa(A)$ and $\kappa(A\T A)$ in the readout.`,
          caption: md`When the columns are nearly parallel, the cells of the coordinate grid are long and thin, and a small change in $\bb$ changes the coordinates $\bx$ by a lot. That amplification factor is the condition number.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

eps = 1e-8
A = np.array([[1.0, 1.0],
              [eps, 0.0],
              [0.0, eps]])
b = np.array([2.0, eps, eps])          # b = A @ [1, 1]: the exact answer is x = (1, 1)

print(A.T @ A)                         # 1 + eps**2 rounds to exactly 1.0
try:
    print(np.linalg.solve(A.T @ A, A.T @ b))
except np.linalg.LinAlgError as err:
    print("normal equations:", err)

Q, R = np.linalg.qr(A)
print("QR:", np.round(np.linalg.solve(R, Q.T @ b), 6))
print("cond(A) =", f"{np.linalg.cond(A):.2e}")`,
          note: md`The columns of $A$ are independent and $\kappa(A) \approx 1.4\times10^8$, which double precision can handle. But $A\T A$ has entries $1 + 10^{-16}$, which round to exactly $1$, so the computed $A\T A$ is singular. QR never forms that product and recovers $\bx = (1, 1)$.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'la06-3-ex',
            title: 'Gram–Schmidt',
            prompt: md`Write \`gram_schmidt(A)\` that returns $Q$ (same shape as $A$) whose columns are the Gram–Schmidt orthonormalization of the columns of $A$. A loop over columns is fine. Assume the columns are independent.`,
            starter: `import numpy as np

def gram_schmidt(A):
    A = np.array(A, dtype=float)
    Q = np.zeros_like(A)
    for j in range(A.shape[1]):
        e = A[:, j].copy()
        # subtract the projections onto Q[:, 0], ..., Q[:, j-1], then normalize
        Q[:, j] = e
    return Q
`,
            solution: `import numpy as np

def gram_schmidt(A):
    A = np.array(A, dtype=float)
    Q = np.zeros_like(A)
    for j in range(A.shape[1]):
        e = A[:, j].copy()
        for i in range(j):
            e = e - (Q[:, i] @ A[:, j]) * Q[:, i]
        Q[:, j] = e / np.linalg.norm(e)
    return Q
`,
            tests: [
              { expr: 'np.round(gram_schmidt(np.array([[1.0, 2.0], [1.0, 0.0], [0.0, 1.0]])), 6).tolist()', label: 'worked example' },
              { expr: 'bool(np.allclose(gram_schmidt(np.array([[2.0, 1.0, 0.0], [1.0, 2.0, 1.0], [0.0, 1.0, 2.0], [1.0, 1.0, 1.0]])).T @ gram_schmidt(np.array([[2.0, 1.0, 0.0], [1.0, 2.0, 1.0], [0.0, 1.0, 2.0], [1.0, 1.0, 1.0]])), np.eye(3)))', label: 'columns orthonormal' },
            ],
            hints: [md`The coefficient of the projection onto $\bq_i$ is \`Q[:, i] @ A[:, j]\`.`, md`Normalize with \`np.linalg.norm(e)\`.`],
          },
        },
        {
          kind: 'recall',
          prompt: md`Write the Gram–Schmidt step for $\bq_j$, the formula for $r_{ij}$, and the triangular system that solves least squares with QR.`,
          answer: md`$\be_j = \ba_j - \sum_{i<j}(\bq_i\cdot\ba_j)\bq_i$ and $\bq_j = \be_j/\lVert\be_j\rVert$. $r_{ij} = \bq_i\cdot\ba_j$ for $i < j$, $r_{jj} = \lVert\be_j\rVert$, zero below the diagonal. Least squares: $R\hat\bx = Q\T\bb$, solved by back-substitution.`,
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *you have a regression with a million rows and a hundred features. Would you compute $(X\T X)^{-1}X\T\by$?* Answer in a few sentences.`,
          model: md`Not with an explicit inverse. Forming $X\T X$ is cheap here ($100\times100$, about $nd^2 = 10^{10}$ flops), but it squares the condition number, so with collinear or badly scaled features the normal equations can lose most of their accuracy. A least-squares solver based on QR or the SVD, such as \`np.linalg.lstsq\`, works on $X$ directly at a similar cost and is far more stable; the SVD also handles rank deficiency. If $X\T X$ is used anyway, solve the system with a Cholesky factorization instead of inverting, standardize the features, and add a ridge term $\lambda I$ if it is near-singular. If the data do not fit in memory, use stochastic gradient descent or accumulate $X\T X$ in chunks.`,
        },
      ],
      cards: [
        { id: 'la06-3-c1', kind: 'concept', front: md`One step of Gram–Schmidt for $\ba_j$.`, back: md`$\be_j = \ba_j - \sum_{i<j}(\bq_i\cdot\ba_j)\,\bq_i$, then $\bq_j = \be_j/\lVert\be_j\rVert$.` },
        { id: 'la06-3-c2', kind: 'cloze', text: md`In $A = QR$ from Gram–Schmidt, $R$ is upper {{}} with $r_{ij} = \bq_i\cdot\ba_j$.`, answers: ['triangular'] },
        { id: 'la06-3-c3', kind: 'concept', front: md`Least squares with $A = QR$: which system do you solve?`, back: md`$R\hat\bx = Q\T\bb$, by back-substitution.` },
        { id: 'la06-3-c4', kind: 'cloze', text: md`$\kappa(A\T A) = \kappa(A)$ to the power {{}}.`, answers: ['2'] },
        { id: 'la06-3-c5', kind: 'compute', front: md`Gram–Schmidt on $\ba_1 = (1, 0)$, $\ba_2 = (2, 3)$: what is $r_{12}$?`, answer: { kind: 'number', value: 2 }, back: md`$\bq_1 = (1, 0)$, so $r_{12} = \bq_1\cdot\ba_2 = 2$. Then $\be_2 = (0, 3)$ and $r_{22} = 3$.` },
      ],
    },
  ],
  problems: [
    {
      id: 'la06-p1',
      title: 'Coordinates in an orthonormal basis of R³',
      type: 'compute',
      difficulty: 1,
      minutes: 6,
      statement: md`Check that $\bq_1 = \tfrac13(1, 2, 2)$, $\bq_2 = \tfrac13(2, 1, -2)$, $\bq_3 = \tfrac13(2, -2, 1)$ are orthonormal, then find the coordinates of $\bx = (0, 3, 6)$ in this basis. Enter $(c_1, c_2, c_3)$.`,
      solution: [
        md`Lengths: $\tfrac19(1 + 4 + 4) = 1$ for each. Dot products: $\tfrac19(2 + 2 - 4) = 0$, $\tfrac19(2 - 4 + 2) = 0$, $\tfrac19(4 - 2 - 2) = 0$.`,
        md`$c_1 = \tfrac13(0 + 6 + 12) = 6$, $c_2 = \tfrac13(0 + 3 - 12) = -3$, $c_3 = \tfrac13(0 - 6 + 6) = 0$.`,
        md`Check: $6\bq_1 - 3\bq_2 = \tfrac13\big((6, 12, 12) - (6, 3, -6)\big) = (0, 3, 6)$, and $36 + 9 = 45 = \lVert\bx\rVert^2$.`,
      ],
      answer: { kind: 'vector', value: [6, -3, 0] },
    },
    {
      id: 'la06-p2',
      title: 'Projection onto a line in R³',
      type: 'compute',
      difficulty: 1,
      minutes: 6,
      statement: md`Let $\ba = (1, 2, 2)$. Write the projection matrix $P$ onto the line through $\ba$ and compute $P\bb$ for $\bb = (1, 1, 1)$. What is the trace of $P$? Enter $P\bb$.`,
      solution: [
        md`$P = \dfrac{\ba\ba\T}{\ba\T\ba} = \dfrac19\begin{bmatrix} 1 & 2 & 2 \\ 2 & 4 & 4 \\ 2 & 4 & 4 \end{bmatrix}$.`,
        md`$P\bb = \dfrac{\ba\cdot\bb}{9}\,\ba = \dfrac59(1, 2, 2) = (\tfrac59, \tfrac{10}9, \tfrac{10}9)$.`,
        md`$\tr P = \tfrac19(1 + 4 + 4) = 1$, the dimension of the line. In general the trace of a projection matrix equals the dimension of the subspace it projects onto.`,
      ],
      answer: { kind: 'vector', value: [5 / 9, 10 / 9, 10 / 9] },
    },
    {
      id: 'la06-p3',
      title: 'A regression line',
      type: 'compute',
      difficulty: 2,
      minutes: 10,
      statement: md`Fit $y = c + mx$ by least squares to $(0, 1)$, $(1, 2)$, $(2, 2)$, $(3, 4)$. Verify that the residuals sum to zero. Enter $[c, m]$.`,
      solution: [
        md`$n = 4$, $\sum x = 6$, $\sum x^2 = 14$, $\sum y = 9$, $\sum xy = 0 + 2 + 4 + 12 = 18$.`,
        md`Normal equations: $4c + 6m = 9$ and $6c + 14m = 18$. Determinant $56 - 36 = 20$.`,
        md`$c = \frac{14\cdot9 - 6\cdot18}{20} = \frac{18}{20} = 0.9$ and $m = \frac{4\cdot 18 - 6\cdot 9}{20} = \frac{18}{20} = 0.9$.`,
        md`Fitted values $0.9, 1.8, 2.7, 3.6$; residuals $0.1, 0.2, -0.7, 0.4$, which sum to $0$.`,
      ],
      answer: { kind: 'vector', value: [0.9, 0.9] },
    },
    {
      id: 'la06-p4',
      title: 'Normal equations from calculus',
      type: 'derive',
      difficulty: 2,
      minutes: 10,
      statement: md`Let $f(\bx) = \lVert A\bx - \bb\rVert^2$. Expand $f$, compute its gradient, and show that setting it to zero gives the normal equations. Explain why the critical point is a minimum.`,
      hints: [md`$f(\bx) = \bx\T A\T A\bx - 2\bb\T A\bx + \bb\T\bb$. Use $\nabla(\bx\T M\bx) = 2M\bx$ for symmetric $M$ and $\nabla(\bc\T\bx) = \bc$.`],
      solution: [
        md`$f(\bx) = (A\bx - \bb)\T(A\bx - \bb) = \bx\T A\T A\bx - 2\bb\T A\bx + \bb\T\bb$, using $\bx\T A\T\bb = \bb\T A\bx$ (a scalar equals its transpose).`,
        md`$A\T A$ is symmetric, so $\nabla f(\bx) = 2A\T A\bx - 2A\T\bb$.`,
        md`$\nabla f = \bzero \iff A\T A\bx = A\T\bb$, the normal equations.`,
        md`The Hessian is $2A\T A$, and $\bv\T A\T A\bv = \lVert A\bv\rVert^2 \ge 0$, so $f$ is a convex quadratic. Any critical point is a global minimum; it is unique when the columns are independent, because then $\lVert A\bv\rVert^2 > 0$ for $\bv \ne \bzero$.`,
      ],
      rubric: [md`Correct expansion, including the cross term $-2\bb\T A\bx$`, md`Correct gradient`, md`Normal equations obtained`, md`Convexity argument via $\bv\T A\T A\bv = \lVert A\bv\rVert^2$`],
      areas: ['math', 'ml-depth'],
    },
    {
      id: 'la06-p5',
      title: 'Gram–Schmidt in R⁴',
      type: 'compute',
      difficulty: 2,
      minutes: 10,
      statement: md`Apply Gram–Schmidt to $\ba_1 = (1, 1, 1, 1)$, $\ba_2 = (1, 1, 0, 0)$, $\ba_3 = (1, 0, 0, 0)$. Give $R$ and enter $\bq_3$.`,
      solution: [
        md`$r_{11} = 2$, $\bq_1 = \tfrac12(1, 1, 1, 1)$.`,
        md`$r_{12} = \bq_1\cdot\ba_2 = 1$. $\be_2 = (1, 1, 0, 0) - \tfrac12(1, 1, 1, 1) = \tfrac12(1, 1, -1, -1)$, $r_{22} = 1$, $\bq_2 = \tfrac12(1, 1, -1, -1)$.`,
        md`$r_{13} = \bq_1\cdot\ba_3 = \tfrac12$, $r_{23} = \bq_2\cdot\ba_3 = \tfrac12$. $\be_3 = (1, 0, 0, 0) - \tfrac14(1, 1, 1, 1) - \tfrac14(1, 1, -1, -1) = (\tfrac12, -\tfrac12, 0, 0)$.`,
        md`$r_{33} = \tfrac{1}{\sqrt2}$, $\bq_3 = \tfrac{1}{\sqrt2}(1, -1, 0, 0)$. So $R = \begin{bmatrix} 2 & 1 & \tfrac12 \\ 0 & 1 & \tfrac12 \\ 0 & 0 & \tfrac{1}{\sqrt2} \end{bmatrix}$.`,
      ],
      answer: { kind: 'vector', value: [Math.SQRT1_2, -Math.SQRT1_2, 0, 0] },
    },
    {
      id: 'la06-p6',
      title: 'Dimensions of the four subspaces',
      type: 'concept',
      difficulty: 1,
      minutes: 5,
      statement: md`$A$ is a $3\times 5$ matrix of rank 2. Give the dimensions of $\Row A$, $\Null A$, $\Col A$ and $\Null A\T$, say in which space each lives, and which pairs are orthogonal complements. Enter the four dimensions in that order.`,
      solution: [
        md`$\Row A \subseteq \R^5$ has dimension $r = 2$, and its complement $\Null A \subseteq \R^5$ has dimension $5 - 2 = 3$.`,
        md`$\Col A \subseteq \R^3$ has dimension $2$, and its complement $\Null A\T \subseteq \R^3$ has dimension $3 - 2 = 1$.`,
        md`$\Row A \perp \Null A$ (in $\R^5$) and $\Col A \perp \Null A\T$ (in $\R^3$). In each pair the dimensions add up to the dimension of the ambient space.`,
      ],
      answer: { kind: 'vector', value: [2, 3, 2, 1] },
    },
    {
      id: 'la06-p7',
      title: 'Regression without an intercept',
      type: 'apply',
      difficulty: 2,
      minutes: 8,
      statement: md`Fit $y \approx w_1x_1 + w_2x_2$ (no intercept) to three samples: $(x_1, x_2, y) = (1, 0, 1)$, $(0, 1, 2)$, $(1, 1, 4)$. Compute $\hat\bw$, the residuals, and check that they are orthogonal to both feature columns. Do the residuals sum to zero? Enter $\hat\bw$.`,
      solution: [
        md`$X = \begin{bmatrix} 1 & 0 \\ 0 & 1 \\ 1 & 1 \end{bmatrix}$, $X\T X = \begin{bmatrix} 2 & 1 \\ 1 & 2 \end{bmatrix}$, $X\T\by = (5, 6)$.`,
        md`$\hat\bw = \tfrac13\begin{bmatrix} 2 & -1 \\ -1 & 2 \end{bmatrix}\begin{bmatrix} 5 \\ 6 \end{bmatrix} = (\tfrac43, \tfrac73)$.`,
        md`Predictions $(\tfrac43, \tfrac73, \tfrac{11}3)$, residuals $(-\tfrac13, -\tfrac13, \tfrac13)$. Column 1: $-\tfrac13 + \tfrac13 = 0$; column 2: $-\tfrac13 + \tfrac13 = 0$.`,
        md`The residuals sum to $-\tfrac13 \ne 0$. Without a column of ones there is no reason for them to: orthogonality holds only to the columns that are in $X$.`,
      ],
      answer: { kind: 'vector', value: [4 / 3, 7 / 3] },
      areas: ['math', 'ml-breadth'],
    },
    {
      id: 'la06-p8',
      title: 'The closest point, by Pythagoras',
      type: 'proof',
      difficulty: 3,
      minutes: 12,
      statement: md`Let $\hat\bx$ satisfy $A\T(\bb - A\hat\bx) = \bzero$. Prove that for every $\bx$, $$\lVert\bb - A\bx\rVert^2 = \lVert\bb - A\hat\bx\rVert^2 + \lVert A(\hat\bx - \bx)\rVert^2.$$ Conclude that $\hat\bx$ minimizes $\lVert\bb - A\bx\rVert$, and that the minimizer is unique when $A$ has independent columns.`,
      hints: [md`Write $\bb - A\bx = (\bb - A\hat\bx) + A(\hat\bx - \bx)$ and expand the squared norm.`],
      solution: [
        md`Let $\be = \bb - A\hat\bx$ and $\bd = A(\hat\bx - \bx)$. Then $\bb - A\bx = \be + \bd$.`,
        md`$\lVert\be + \bd\rVert^2 = \lVert\be\rVert^2 + 2\,\bd\cdot\be + \lVert\bd\rVert^2$.`,
        md`$\bd\cdot\be = (\hat\bx - \bx)\T A\T\be = 0$ because $A\T\be = \bzero$. The identity follows.`,
        md`The second term is $\ge 0$, so $\lVert\bb - A\bx\rVert \ge \lVert\bb - A\hat\bx\rVert$ for all $\bx$: $\hat\bx$ is a minimizer.`,
        md`Equality requires $A(\hat\bx - \bx) = \bzero$. With independent columns, $\Null A = \{\bzero\}$, so $\bx = \hat\bx$: the minimizer is unique.`,
      ],
      rubric: [md`Splits the residual into $\be + \bd$`, md`Shows the cross term vanishes using $A\T\be = \bzero$`, md`Concludes minimality from non-negativity`, md`Uniqueness from $\Null A = \{\bzero\}$`],
      areas: ['math', 'ml-depth'],
    },
    {
      id: 'la06-p9',
      title: 'Shapes and costs of a least-squares solve',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 8,
      statement: md`$X$ has shape $(n, d)$ with $n \gg d$, and \`y\` has shape $(n,)$. For each expression give the shape and the leading-order flop count: \`X.T @ X\`, \`X.T @ y\`, \`np.linalg.solve(X.T @ X, X.T @ y)\`, and \`Q, R = np.linalg.qr(X)\` (reduced). Which method would you use when the features are nearly collinear, and why?`,
      solution: [
        md`\`X.T @ X\`: shape $(d, d)$, about $nd^2$ multiply–adds (half that if symmetry is used).`,
        md`\`X.T @ y\`: shape $(d,)$, about $nd$.`,
        md`\`np.linalg.solve(...)\`: shape $(d,)$; an LU factorization costs about $\tfrac23 d^3$, small when $d \ll n$.`,
        md`Reduced QR: $Q$ of shape $(n, d)$ and $R$ of shape $(d, d)$, about $2nd^2$ flops, roughly twice the normal equations. Then \`Q.T @ y\` and a triangular solve cost $nd + d^2$.`,
        md`With nearly collinear features $\kappa(X)$ is large, and the normal equations work with $\kappa(X)^2$. QR (or the SVD) costs a constant factor more but loses about half as many digits, so it is the safer choice.`,
      ],
      rubric: [md`All shapes correct`, md`Flop counts of the right order ($nd^2$ for the products and QR, $d^3$ for the small solve)`, md`Conditioning argument for preferring QR or SVD`],
      areas: ['math', 'ml-coding'],
    },
  ],
};
