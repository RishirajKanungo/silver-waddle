import { md, type Module } from '../types';

export const MODULE: Module = {
  id: 'la05',
  part: 'la',
  order: 5,
  title: 'Determinants',
  summary: 'The determinant as the signed factor by which a matrix scales area and volume; computing it by cofactors and by elimination; its algebraic rules; and the log-determinants and Jacobians that appear in ML.',
  relevance: md`$\det A \neq 0$ is the quick test for invertibility. In ML the determinant appears mostly through its logarithm: $\log\det\Sigma$ is a term of every multivariate Gaussian log-likelihood (Gaussian mixtures, Gaussian processes, full-covariance VAEs), and normalizing flows add up $\log\lvert\det J\rvert$ over their layers, which is why they are built from layers with triangular Jacobians. Interviewers ask for the geometric meaning, $\det(AB) = \det A\det B$, and why you compute \`slogdet\` or a Cholesky factor instead of \`det\` for large matrices.`,
  areas: ['math', 'ml-depth'],
  prereqs: ['la03'],
  lessons: [
    // ------------------------------------------------------------------ 5.1
    {
      id: 'la05-1',
      title: 'Determinants as signed area and volume',
      minutes: 30,
      objectives: [
        'Compute a 2×2 determinant and interpret it as the signed area of the parallelogram spanned by the columns.',
        'Tell from the sign of the determinant whether a map keeps or reverses orientation.',
        'Interpret a 3×3 determinant as the signed volume of a parallelepiped.',
        'Explain why det A = 0 exactly when A is singular.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A linear map sends the grid of unit squares to a grid of identical parallelograms. So it multiplies **every** area by the same factor: the area of the image of the unit square. The map $\begin{bmatrix} 2 & 0 \\ 0 & 3 \end{bmatrix}$ stretches by 2 in one direction and 3 in the other, so every area grows by a factor of 6. That factor, with a sign that records whether the plane was flipped, is the **determinant**.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'The 2×2 determinant',
          md: md`$$\det\begin{bmatrix} a & b \\ c & d \end{bmatrix} = ad - bc.$$

Its absolute value is the area of the parallelogram with sides $\ba_1 = (a, c)$ and $\ba_2 = (b, d)$, the image of the unit square. It is positive when $\ba_2$ is counterclockwise from $\ba_1$ (as $\jhat$ is from $\ihat$), and negative when the map reverses orientation.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.det2d', matrix: [[2, 0.5], [0.5, 1.5]] },
          task: md`Drag $A\jhat$ slowly across the line of $A\ihat$. Watch the sign and the colour change. Where exactly is $\det A = 0$? Then switch on the unit disc and compare its area with $\pi\lvert\det A\rvert$.`,
          caption: md`The signed area changes continuously and passes through 0 when the columns become parallel. A negative determinant means the parallelogram is a mirror image: the turn from $A\ihat$ to $A\jhat$ is clockwise.`,
        },
        {
          kind: 'derive',
          title: 'why the area is ad − bc',
          goal: md`For $a, b, c, d > 0$ with $\ba_2 = (b, d)$ counterclockwise from $\ba_1 = (a, c)$, show that the parallelogram with vertices $\bzero, \ba_1, \ba_1 + \ba_2, \ba_2$ has area $ad - bc$.`,
          steps: [
            { md: md`The parallelogram fits in the rectangle $[0, a + b]\times[0, c + d]$, of area $(a + b)(c + d)$.` },
            {
              md: md`The rectangle minus the parallelogram consists of two triangles with legs $a, c$ (total area $ac$), two triangles with legs $b, d$ (total $bd$), and two small rectangles of size $b\times c$ (total $2bc$).`,
              choose: {
                prompt: md`What is the most direct way to get the parallelogram's area from the rectangle?`,
                options: [md`Subtract the corner pieces outside the parallelogram`, md`Multiply the side lengths $\lVert\ba_1\rVert\lVert\ba_2\rVert$`, md`Average the areas of the two diagonal triangles`],
                answer: 0,
                explain: md`The product of side lengths ignores the angle between them; it equals the area only for a rectangle.`,
              },
            },
            { md: md`Area $= (a + b)(c + d) - ac - bd - 2bc = ad + ac + bc + bd - ac - bd - 2bc = ad - bc$.` },
          ],
          takeaway: md`The formula keeps working when the vectors move to other quadrants, as long as you keep the sign: that is what makes the determinant easier to work with than the unsigned area.`,
        },
        {
          kind: 'numeric',
          q: md`Compute $\det\begin{bmatrix} 3 & 1 \\ 2 & 4 \end{bmatrix}$.`,
          answer: { kind: 'number', value: 10 },
          explain: md`$3\cdot 4 - 1\cdot 2 = 10$. The unit square becomes a parallelogram of area 10, with orientation kept.`,
        },
        {
          kind: 'check',
          q: md`What does $\begin{bmatrix} 1 & 0 \\ 0 & -1 \end{bmatrix}$ do to areas?`,
          options: [md`Keeps every area, but reverses orientation: $\det = -1$`, md`Shrinks every area to 0`, md`Keeps both area and orientation: $\det = 1$`, md`Negative areas make the region disappear`],
          answer: 0,
          explain: md`A reflection is a mirror image: shapes keep their size, but clockwise and counterclockwise swap. $1\cdot(-1) - 0\cdot 0 = -1$.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Area and volume scaling',
          md: md`For any region $S$ in the plane, the image $A(S)$ has area $\lvert\det A\rvert\cdot\operatorname{area}(S)$. For a $3\times 3$ matrix, $\det A$ is the signed **volume** of the parallelepiped spanned by its columns, and every volume is multiplied by $\lvert\det A\rvert$. The sign is positive when the columns form a right-handed system, like $\ihat, \jhat, \hat{k}$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.det3d', c1: [2, 0, 0], c2: [0.5, 2, 0], c3: [0.5, 0.5, 1.5] },
          task: md`Rotate the box. Then set $a_{33} = 0$: where does $\ba_3$ go, and what happens to the volume? Continue to a negative $a_{33}$.`,
          caption: md`Here $A$ is upper triangular with diagonal $2, 2, 1.5$, so the volume is $2\cdot 2\cdot 1.5 = 6$. With $a_{33} = 0$ all three columns lie in the floor plane $z = 0$ and the box is flat; below 0 the box is a mirror image and $\det A < 0$.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Determinant zero means singular',
          md: md`For a square matrix $A$: $\det A = 0$ $\iff$ the columns are linearly dependent $\iff$ $A$ squashes space into a lower-dimensional subspace $\iff$ $A$ is not invertible.`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          md: md`If the unit cube is flattened, whole lines of points land on the same image point, and nothing can undo that. If the volume stays positive, no direction is lost and the map can be reversed.`,
        },
        {
          kind: 'check',
          q: md`A $3\times 3$ matrix has $\det A = 0$. Which statement must be true?`,
          options: [md`Some nonzero $\bx$ has $A\bx = \bzero$`, md`Some entry of $A$ is zero`, md`Two rows of $A$ are equal`, md`$A$ is the zero matrix`],
          answer: 0,
          explain: md`Zero volume means dependent columns, so a nontrivial combination of them is $\bzero$. The other options are sufficient for some matrices but not necessary: $\begin{bmatrix} 1 & 2 \\ 2 & 4 \end{bmatrix}$ has no zero entry and no equal rows.`,
        },
        {
          kind: 'numeric',
          q: md`Find the area of the triangle with vertices $(0, 0)$, $(3, 1)$ and $(1, 2)$.`,
          answer: { kind: 'number', value: 2.5 },
          hints: [md`The triangle is half of the parallelogram spanned by $(3, 1)$ and $(1, 2)$.`],
          explain: md`$\det\begin{bmatrix} 3 & 1 \\ 1 & 2 \end{bmatrix} = 6 - 1 = 5$, so the parallelogram has area 5 and the triangle $2.5$.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'la05-1-paper',
            title: 'When does the square collapse?',
            type: 'compute',
            difficulty: 1,
            minutes: 6,
            statement: md`Let $A_k = \begin{bmatrix} k & 2 \\ 2 & k \end{bmatrix}$. (a) For which $k$ is $A_k$ singular? (b) For $k = 3$, what is the area of the image of the unit disc? (c) For $k = 1$, does $A_k$ keep or reverse orientation? Enter the values from (a).`,
            solution: [
              md`(a) $\det A_k = k^2 - 4 = 0$ exactly when $k = 2$ or $k = -2$. For $k = 2$ both columns are $(2, 2)$; for $k = -2$ they are $(-2, 2)$ and $(2, -2)$. Parallel either way.`,
              md`(b) $\det A_3 = 9 - 4 = 5$. Areas scale by 5, so the disc of area $\pi$ maps to an ellipse of area $5\pi \approx 15.7$.`,
              md`(c) $\det A_1 = 1 - 4 = -3 < 0$: orientation is reversed, and areas grow by 3.`,
            ],
            answer: { kind: 'set', value: [-2, 2] },
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

A = np.array([[2.0, 0.5], [0.5, 1.5]])
print(round(float(np.linalg.det(A)), 6))`,
          predict: {
            q: md`This is the starting matrix of the first figure. What is printed?`,
            options: ['`2.75`', '`3.0`', '`2.5`', '`3.25`'],
            answer: 0,
            explain: md`$2\cdot 1.5 - 0.5\cdot 0.5 = 3 - 0.25 = 2.75$. NumPy computes the determinant from an LU factorization, so the raw value can be off in the last digits; rounding hides that.`,
          },
        },
        {
          kind: 'recall',
          prompt: md`From memory: give the $2\times 2$ formula, the geometric meaning of $\lvert\det A\rvert$ and of its sign, and three conditions equivalent to $\det A = 0$.`,
          answer: md`$ad - bc$. $\lvert\det A\rvert$ is the factor by which areas (volumes in 3-D) scale; the sign says whether orientation is kept ($+$) or reversed ($-$). $\det A = 0$ iff the columns are dependent iff space is squashed flat iff $A$ is not invertible.`,
        },
      ],
      cards: [
        { id: 'la05-1-c1', kind: 'concept', front: md`Geometric meaning of $\det A$ for a $2\times 2$ matrix.`, back: md`The signed area of the image of the unit square (the parallelogram on the columns). All areas scale by $\lvert\det A\rvert$; a negative sign means orientation is reversed.` },
        { id: 'la05-1-c2', kind: 'compute', front: md`$\det\begin{bmatrix} 5 & 2 \\ 3 & 1 \end{bmatrix}$?`, answer: { kind: 'number', value: -1 }, back: md`$5 - 6 = -1$: area preserved, orientation reversed.` },
        { id: 'la05-1-c3', kind: 'cloze', text: md`$\det A = 0$ exactly when the columns of $A$ are linearly {{}}.`, answers: ['dependent'] },
        { id: 'la05-1-c4', kind: 'concept', front: md`A map has $\det A = -3$. What happens to a region of area 2?`, back: md`Its image has area $6$, and it is a mirror image (orientation reversed).` },
        { id: 'la05-1-c5', kind: 'concept', front: md`What does a $3\times 3$ determinant measure?`, back: md`The signed volume of the parallelepiped spanned by the columns: the factor by which the map scales volumes, positive for a right-handed image.` },
      ],
    },
    // ------------------------------------------------------------------ 5.2
    {
      id: 'la05-2',
      title: 'Computing determinants',
      minutes: 40,
      objectives: [
        'Expand a 3×3 determinant along any row or column with cofactors, choosing a line with zeros.',
        'Compute a determinant by elimination, tracking how each row operation changes it.',
        'Use det(AB) = det A det B, det Aᵀ = det A and det A⁻¹ = 1/det A.',
        "Solve a 2×2 system with Cramer's rule, and explain why it is not used for large systems.",
      ],
      cells: [
        {
          kind: 'text',
          md: md`The geometric definition does not tell you how to compute a $10\times 10$ determinant. Two methods do: **cofactor expansion**, which reduces an $n\times n$ determinant to $n$ determinants of size $n - 1$, and **elimination**, which tracks how each row operation changes the determinant until the matrix is triangular. The first is good for small matrices with zeros; the second is what software uses.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Cofactor expansion',
          md: md`The **minor** $M_{ij}$ is the matrix left after deleting row $i$ and column $j$. The **cofactor** is $C_{ij} = (-1)^{i+j}\det M_{ij}$; the signs follow the checkerboard $\begin{smallmatrix} + & - & + \\ - & + & - \\ + & - & + \end{smallmatrix}$. For any fixed row $i$, $$\det A = a_{i1}C_{i1} + a_{i2}C_{i2} + \dots + a_{in}C_{in},$$ and the same holds along any column. For a $3\times 3$ matrix, along row 1: $$\det A = a_{11}(a_{22}a_{33} - a_{23}a_{32}) - a_{12}(a_{21}a_{33} - a_{23}a_{31}) + a_{13}(a_{21}a_{32} - a_{22}a_{31}).$$`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.cofactor', matrix: [[2, 1, 3], [0, 4, 1], [1, 0, 2]], line: 'r0' },
          task: md`Step through the expansion along row 1. Then choose **col 1**, which contains a zero, and step again. Do you get the same value with less work?`,
          caption: md`Along row 1: $2\cdot 8 - 1\cdot(-1) + 3\cdot(-4) = 16 + 1 - 12 = 5$. Along column 1: $2\cdot 8 - 0 + 1\cdot(1 - 12) = 5$, and the zero entry makes one minor unnecessary.`,
        },
        {
          kind: 'numeric',
          q: md`Compute $\det\begin{bmatrix} 1 & 2 & 3 \\ 0 & 1 & 4 \\ 5 & 6 & 0 \end{bmatrix}$ by cofactor expansion.`,
          answer: { kind: 'number', value: 1 },
          hints: [md`Expand along column 1: only two entries are nonzero.`],
          explain: md`Along column 1: $1\cdot\det\begin{bmatrix} 1 & 4 \\ 6 & 0 \end{bmatrix} + 5\cdot\det\begin{bmatrix} 2 & 3 \\ 1 & 4 \end{bmatrix} = 1(0 - 24) + 5(8 - 3) = -24 + 25 = 1$. (This is the matrix whose inverse had integer entries in Module 3.)`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Row operations and the determinant',
          md: md`- **swap** two rows: $\det$ changes sign
- **scale** a row by $c$: $\det$ is multiplied by $c$
- **add** a multiple of one row to another: $\det$ is unchanged
- **triangular** matrix: $\det$ is the product of the diagonal entries

So if elimination uses only swaps and row additions, $$\det A = (-1)^{\#\text{swaps}}\times(\text{product of the pivots}).$$`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          md: md`Adding a multiple of one row to another is a shear: it slides the parallelepiped without changing its base or height, so the volume stays the same. Scaling one row stretches the box in one direction. Swapping two rows is a reflection, which flips orientation.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.rowreduce', matrix: [[0, 2, 1], [1, 3, 2], [2, 1, 4]], mode: 'echelon', trackDet: true },
          task: md`Predict the first move: the $(1, 1)$ entry is 0. Step to a triangular matrix while watching the determinant bookkeeping. Then **Reset** and try your own operations, including a scaling.`,
          caption: md`One swap and two row additions give the pivots $1, 2, \tfrac52$, so $\det A = (-1)\cdot 1\cdot 2\cdot\tfrac52 = -5$. If you scale a row by $c$, the factor in front changes by $1/c$ to compensate.`,
        },
        {
          kind: 'numeric',
          q: md`Compute $\det\begin{bmatrix} 2 & 4 & 2 \\ 1 & 3 & 4 \\ 3 & 7 & 8 \end{bmatrix}$ by elimination.`,
          answer: { kind: 'number', value: 4 },
          explain: md`$R_2 \leftarrow R_2 - \tfrac12R_1$ gives $(0, 1, 3)$; $R_3 \leftarrow R_3 - \tfrac32R_1$ gives $(0, 1, 5)$; $R_3 \leftarrow R_3 - R_2$ gives $(0, 0, 2)$. No swaps, pivots $2, 1, 2$: $\det = 4$.`,
        },
        {
          kind: 'derive',
          title: 'the determinant of a product',
          goal: md`Show $\det(AB) = \det A\,\det B$ for $n\times n$ matrices, and deduce $\det(A^{-1}) = 1/\det A$.`,
          steps: [
            { md: md`$AB$ is the map "apply $B$, then $A$". $B$ multiplies every volume by $\lvert\det B\rvert$, then $A$ multiplies the result by $\lvert\det A\rvert$.` },
            {
              md: md`So $AB$ scales volumes by $\lvert\det A\rvert\lvert\det B\rvert$. For the sign: orientation is reversed by $AB$ exactly when it is reversed by one of $A, B$ but not both, which is how the signs of a product behave.`,
              choose: {
                prompt: md`How do the signs combine?`,
                options: [md`Two reversals cancel, like $(-1)(-1) = 1$`, md`Any reversal makes the product reversed`, md`The sign of $AB$ is always positive`],
                answer: 0,
                explain: md`Reflect twice and you are back to the original orientation.`,
              },
            },
            { md: md`Hence $\det(AB) = \det A\det B$. Applying it to $AA^{-1} = I$: $\det A\det(A^{-1}) = \det I = 1$, so $\det(A^{-1}) = 1/\det A$.` },
          ],
          takeaway: md`A product of matrices is invertible exactly when every factor is. The geometric argument can be made rigorous; the algebraic proof uses elementary matrices.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Rules for determinants',
          md: md`For $n\times n$ matrices:

- $\det(AB) = \det A\det B$
- $\det(A\T) = \det A$, so every rule about rows also holds for columns
- $\det(A^{-1}) = 1/\det A$
- $\det(cA) = c^n\det A$: each of the $n$ rows is scaled by $c$
- an orthogonal $Q$ has $\det Q = \pm 1$
- in general $\det(A + B) \neq \det A + \det B$`,
        },
        {
          kind: 'check',
          q: md`$A$ is $3\times 3$ with $\det A = 3$. What is $\det(2A)$?`,
          options: [md`24`, md`6`, md`12`, md`9`],
          answer: 0,
          explain: md`Each of the 3 rows is doubled, and each doubling doubles the determinant: $2^3\cdot 3 = 24$. Geometrically, doubling every edge of a box multiplies its volume by 8.`,
        },
        {
          kind: 'numeric',
          q: md`$A$ and $B$ are $2\times 2$ with $\det A = 2$ and $\det B = -3$. Compute $\det(AB^{-1}A\T)$.`,
          answer: { kind: 'number', value: -4 / 3 },
          explain: md`$\det A\cdot\frac{1}{\det B}\cdot\det A\T = 2\cdot\left(-\tfrac13\right)\cdot 2 = -\tfrac43$.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: "Cramer's rule",
          md: md`If $\det A \neq 0$, the solution of $A\bx = \bb$ is $$x_i = \frac{\det A_i}{\det A},$$ where $A_i$ is $A$ with column $i$ replaced by $\bb$. It is handy for $2\times 2$ systems and for proofs (it shows each $x_i$ is a ratio of polynomials in the entries). It is never used numerically: it needs $n + 1$ determinants, and a cofactor expansion of one $n\times n$ determinant has $n!$ terms.`,
        },
        {
          kind: 'numeric',
          q: md`Solve $2x + y = 5$, $x - y = 1$ with Cramer's rule. Enter $[x, y]$.`,
          answer: { kind: 'vector', value: [2, 1] },
          explain: md`$\det A = 2(-1) - 1\cdot 1 = -3$. $\det A_1 = \det\begin{bmatrix} 5 & 1 \\ 1 & -1 \end{bmatrix} = -6$, so $x = 2$. $\det A_2 = \det\begin{bmatrix} 2 & 5 \\ 1 & 1 \end{bmatrix} = -3$, so $y = 1$.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'la05-2-paper',
            title: 'Inverses and orthogonal matrices',
            type: 'proof',
            difficulty: 2,
            minutes: 8,
            statement: md`Using only $\det(AB) = \det A\det B$, $\det A\T = \det A$ and $\det I = 1$, prove: (a) if $A$ is invertible then $\det A \ne 0$ and $\det(A^{-1}) = 1/\det A$; (b) if $Q$ is orthogonal then $\det Q = \pm 1$; (c) $\det(A\T A) \ge 0$ for every square $A$.`,
            solution: [
              md`(a) $1 = \det I = \det(AA^{-1}) = \det A\det(A^{-1})$. A product equal to 1 has no zero factor, so $\det A \ne 0$, and dividing gives $\det(A^{-1}) = 1/\det A$.`,
              md`(b) $Q\T Q = I$, so $1 = \det(Q\T)\det Q = (\det Q)^2$, hence $\det Q = \pm 1$.`,
              md`(c) $\det(A\T A) = \det A\T\det A = (\det A)^2 \ge 0$.`,
            ],
            rubric: [md`(a) uses $AA^{-1} = I$ and the product rule`, md`(b) uses $Q\T Q = I$ and $\det Q\T = \det Q$`, md`(c) writes the determinant as a square`],
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

A = np.array([[2., 1., 3.], [0., 4., 1.], [1., 0., 2.]])
print(round(float(np.linalg.det(A)), 6))`,
          predict: {
            q: md`The matrix of the cofactor figure. What is printed?`,
            options: ['`5.0`', '`5`', '`-5.0`', '`16.0`'],
            answer: 0,
            explain: md`$\det A = 5$. \`np.linalg.det\` returns a float, so it prints as \`5.0\`.`,
          },
        },
        {
          kind: 'code',
          code: `import math

for n in [5, 10, 20]:
    # terms in a full cofactor expansion vs. operations for elimination
    print(n, math.factorial(n), round(2 * n**3 / 3))`,
          note: md`A full cofactor expansion of an $n\times n$ determinant has $n!$ terms; elimination needs about $\tfrac23 n^3$ operations. At $n = 20$ that is $2.4\times 10^{18}$ against about 5000.`,
        },
        {
          kind: 'recall',
          prompt: md`From memory: the effect of each row operation on the determinant, the formula for $\det$ from elimination, and five rules ($AB$, $A\T$, $A^{-1}$, $cA$, orthogonal).`,
          answer: md`Swap: sign flips. Scale a row by $c$: times $c$. Add a multiple of a row: unchanged. $\det A = (-1)^{\#\text{swaps}}\times$ product of pivots. $\det(AB) = \det A\det B$; $\det A\T = \det A$; $\det A^{-1} = 1/\det A$; $\det(cA) = c^n\det A$; $\det Q = \pm 1$.`,
        },
      ],
      cards: [
        { id: 'la05-2-c1', kind: 'concept', front: md`How does each row operation change $\det A$?`, back: md`Swap: multiplies by $-1$. Scale a row by $c$: multiplies by $c$. Add a multiple of another row: no change.` },
        { id: 'la05-2-c2', kind: 'compute', front: md`$\det\begin{bmatrix} 3 & 0 & 0 \\ 7 & -2 & 0 \\ 1 & 5 & 4 \end{bmatrix}$?`, answer: { kind: 'number', value: -24 }, back: md`Triangular: product of the diagonal, $3\cdot(-2)\cdot 4 = -24$.` },
        { id: 'la05-2-c3', kind: 'cloze', text: md`For an $n\times n$ matrix, $\det(cA) = c$ to the power {{}} times $\det A$.`, answers: ['n'] },
        { id: 'la05-2-c4', kind: 'concept', front: md`State the cofactor $C_{ij}$ and the expansion of $\det A$ along row $i$.`, back: md`$C_{ij} = (-1)^{i+j}\det M_{ij}$, where $M_{ij}$ deletes row $i$ and column $j$. $\det A = \sum_j a_{ij}C_{ij}$.` },
        { id: 'la05-2-c5', kind: 'compute', front: md`$\det A = 4$, $\det B = 1/2$ ($n\times n$). $\det(A^{-1}B)$?`, answer: { kind: 'number', value: 0.125 }, back: md`$\tfrac14\cdot\tfrac12 = \tfrac18$.` },
      ],
    },
    // ------------------------------------------------------------------ 5.3
    {
      id: 'la05-3',
      title: 'Determinants in ML: log-determinants and Jacobians',
      minutes: 30,
      objectives: [
        'Write the log-density of a multivariate Gaussian and explain the role of the log det Σ term.',
        'Compute log det Σ stably with slogdet or a Cholesky factor, and explain why det itself underflows or overflows.',
        'State the change-of-variables formula for densities and the role of |det J|.',
        'Explain why normalizing flows use coupling layers with triangular Jacobians.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A probability density must integrate to 1. When a linear map stretches space, it also stretches the region where probability mass sits, so the density has to drop by the same factor to keep the total at 1. Determinants enter ML exactly here: in the normalizing constant of the Gaussian, and in the change-of-variables formula behind normalizing flows.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Multivariate Gaussian',
          md: md`For $\bx \in \R^d$ with mean $\bmu$ and covariance $\bSigma$ (symmetric, positive definite), $$p(\bx) = \frac{1}{(2\pi)^{d/2}(\det\bSigma)^{1/2}}\exp\!\left(-\tfrac12(\bx - \bmu)\T\bSigma^{-1}(\bx - \bmu)\right),$$ $$\log p(\bx) = -\tfrac12\left[d\log 2\pi + \log\det\bSigma + (\bx - \bmu)\T\bSigma^{-1}(\bx - \bmu)\right].$$ The last term is the squared **Mahalanobis distance**. $\log\det\bSigma$ penalizes spread: a wider distribution assigns lower density everywhere.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.gauss2d', s1: 1.5, s2: 0.8, rho: 0.6, x: [1, 1] },
          task: md`Keep $\bx$ where it is and increase $\sigma_1$. Which terms of $\log p$ change, and in which direction? Then push $\rho$ toward $0.95$ and watch $\det\bSigma$.`,
          caption: md`The filled ellipse is $\{\bx : \bx\T\bSigma^{-1}\bx \le 1\}$; its area is $\pi\sqrt{\det\bSigma}$. The dashed circle is the same set for $\bSigma = I$. As $\lvert\rho\rvert \to 1$ the ellipse flattens, $\det\bSigma \to 0$ and $\log\det\bSigma \to -\infty$.`,
        },
        {
          kind: 'derive',
          title: 'where the square root of det Σ comes from',
          goal: md`Let $\bz \sim \mathcal{N}(\bzero, I)$ and $\bx = \bmu + L\bz$ with $LL\T = \bSigma$ and $L$ invertible. Show the density of $\bx$ has the factor $(\det\bSigma)^{-1/2}$.`,
          steps: [
            { md: md`The map $\bz \mapsto \bmu + L\bz$ multiplies volumes by $\lvert\det L\rvert$. Probability is conserved, so the density of $\bx$ is the density of $\bz$ divided by that factor: $p_x(\bx) = p_z(\bz)/\lvert\det L\rvert$ with $\bz = L^{-1}(\bx - \bmu)$.` },
            {
              md: md`$\det\bSigma = \det(LL\T) = \det L\det L\T = (\det L)^2$, so $\lvert\det L\rvert = (\det\bSigma)^{1/2}$.`,
              choose: {
                prompt: md`How do you relate $\det L$ to $\det\bSigma$?`,
                options: [md`Product rule and transpose rule: $\det(LL\T) = (\det L)^2$`, md`$\det\bSigma = 2\det L$`, md`$\det L = \det\bSigma$`],
                answer: 0,
                explain: md`$\det(AB) = \det A\det B$ and $\det L\T = \det L$.`,
              },
            },
            { md: md`Finally $\bz\T\bz = (\bx - \bmu)\T L^{-\top}L^{-1}(\bx - \bmu) = (\bx - \bmu)\T\bSigma^{-1}(\bx - \bmu)$, and $p_z(\bz) = (2\pi)^{-d/2}e^{-\bz\T\bz/2}$, which gives the formula above.` },
          ],
          takeaway: md`The normalizing constant of a Gaussian is a volume correction: $\sqrt{\det\bSigma}$ is how much the map $L$ inflates volume.`,
        },
        {
          kind: 'numeric',
          q: md`For $\bSigma = \begin{bmatrix} 4 & 0 \\ 0 & 9 \end{bmatrix}$, compute $\log\det\bSigma$ (natural log).`,
          answer: { kind: 'number', value: Math.log(36), tol: 1e-3 },
          explain: md`$\det\bSigma = 36$, so $\log 36 \approx 3.584$. The 1-σ ellipse has semi-axes 2 and 3 and area $6\pi = \pi\sqrt{36}$.`,
        },
        {
          kind: 'text',
          md: md`**Computing it stably.** Never compute \`log(det(S))\` for a large matrix. A $1000\times 1000$ covariance with eigenvalues around $0.1$ has determinant about $10^{-1000}$, far below the smallest float64 (about $10^{-308}$), so \`det\` returns \`0.0\` and the log is $-\infty$. With eigenvalues around 10 it overflows to \`inf\` instead. Two stable routes:

- \`np.linalg.slogdet(S)\` returns the sign and $\log\lvert\det S\rvert$, accumulated from the LU factorization as a sum of logs.
- For a symmetric positive definite $\bSigma = LL\T$ (Cholesky), $\log\det\bSigma = 2\sum_i\log L_{ii}$. Libraries for Gaussian processes and mixtures do this, since they need the Cholesky factor anyway to apply $\bSigma^{-1}$.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

S = 0.1 * np.eye(1000)
print(np.linalg.det(S))`,
          predict: {
            q: md`The true determinant is $10^{-1000}$. What does NumPy print?`,
            options: ['`0.0`', '`1e-1000`', '`nan`', '`-inf`'],
            answer: 0,
            explain: md`$10^{-1000}$ underflows: it is far smaller than any float64, so the product of pivots becomes exactly 0.`,
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

sign, logdet = np.linalg.slogdet(0.1 * np.eye(1000))
print(sign, round(float(logdet), 4))

S = np.array([[4., 2.], [2., 3.]])
L = np.linalg.cholesky(S)                      # S = L L^T, L lower triangular
print(round(float(2 * np.sum(np.log(np.diag(L)))), 6), round(float(np.log(np.linalg.det(S))), 6))`,
          note: md`\`slogdet\` gives $1000\log 0.1 \approx -2302.585$ with no underflow. For the $2\times 2$ example both routes give $\log 8 \approx 2.079$; only the Cholesky route stays safe as the size grows.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Change of variables',
          md: md`Let $\by = f(\bz)$ with $f$ invertible and differentiable, and let $J_f(\bz)$ be its Jacobian matrix of partial derivatives $\partial y_i/\partial z_j$. Then $$p_y(\by) = p_z(\bz)\,\lvert\det J_f(\bz)\rvert^{-1}, \qquad \log p_y(\by) = \log p_z(\bz) - \log\lvert\det J_f(\bz)\rvert.$$ Locally $f$ acts like the linear map $J_f(\bz)$, so it scales small volumes by $\lvert\det J_f\rvert$. For a composition $f = f_K\circ\dots\circ f_1$ the log-determinants add.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.jacobian', map: 'polar' },
          task: md`With polar coordinates, shrink $h$ and compare the area ratio with $\det J$; move the point to larger $r$. Then switch to **additive coupling** and **affine coupling** and read $\det J$ at several points.`,
          caption: md`For polar coordinates $\det J = r$: a small square at radius $r$ is stretched along the circle. The additive coupling $(z_1, z_2 + \sin 1.5z_1)$ has $\det J = 1$ everywhere: it bends the grid but preserves area. The affine coupling $(z_1, z_2e^{0.35z_1})$ has $\det J = e^{0.35z_1}$, which depends only on $z_1$.`,
        },
        {
          kind: 'text',
          md: md`**Normalizing flows** model a complicated density by transforming a simple one: $\bz \sim \mathcal{N}(\bzero, I)$ and $\bx = f(\bz)$. Training maximizes $\log p_x(\bx) = \log p_z(f^{-1}(\bx)) + \log\lvert\det J_{f^{-1}}(\bx)\rvert$. For this to be practical, $f$ must be easy to invert and $\log\lvert\det J\rvert$ cheap. The determinant of a general $d\times d$ Jacobian costs $O(d^3)$, too much at every step for large $d$.

**Coupling layers** (as in RealNVP) solve this. Split $\bz = (\bz_a, \bz_b)$ and set $$\by_a = \bz_a, \qquad \by_b = \bz_b\odot\exp(\bs(\bz_a)) + \bt(\bz_a),$$ where $\bs$ and $\bt$ are arbitrary neural networks. The Jacobian is block triangular with identity and $\diag(\exp(\bs(\bz_a)))$ on the diagonal, so $\log\lvert\det J\rvert = \sum_i s_i(\bz_a)$, a cost of $O(d)$. Inverting is just as easy: $\bz_b = (\by_b - \bt(\by_a))\odot\exp(-\bs(\by_a))$, without ever inverting $\bs$ or $\bt$. Successive layers alternate which half is transformed.`,
        },
        {
          kind: 'check',
          q: md`Why is $\log\lvert\det J\rvert$ of an affine coupling layer cheap to compute?`,
          options: [md`The Jacobian is triangular, so its determinant is the product of its diagonal entries`, md`The networks $\bs$ and $\bt$ are linear`, md`The Jacobian is orthogonal, so its determinant is $\pm 1$`, md`Flows ignore the determinant during training`],
          answer: 0,
          explain: md`$\by_a$ does not depend on $\bz_b$, so the upper-right block of $J$ is zero. The diagonal is $1$s and $\exp(s_i)$, and the log-determinant is $\sum_i s_i$. $\bs$ and $\bt$ can be as nonlinear as you like.`,
        },
        {
          kind: 'numeric',
          q: md`A 2-D affine coupling layer maps $(z_1, z_2) \mapsto (z_1,\ z_2e^{s(z_1)} + t(z_1))$ with $s(z_1) = 0.5z_1$. What is $\log\lvert\det J\rvert$ at $\bz = (2, 1)$?`,
          answer: { kind: 'number', value: 1 },
          explain: md`$J = \begin{bmatrix} 1 & 0 \\ \ast & e^{s(z_1)} \end{bmatrix}$, so $\det J = e^{s(z_1)} = e^{1}$ and $\log\lvert\det J\rvert = s(2) = 1$. The entry $\ast$ does not matter.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'la05-3-paper',
            title: 'Log-likelihood under a linear flow',
            type: 'derive',
            difficulty: 2,
            minutes: 10,
            statement: md`Let $\bz \sim \mathcal{N}(\bzero, I_2)$ and $\bx = A\bz + \bb$ with $A = \begin{bmatrix} 2 & 0 \\ 1 & 1 \end{bmatrix}$. (a) Use the change-of-variables formula to write $\log p_x(\bx)$. (b) Evaluate it at $\bx = \bb$. (c) Check (b) against the Gaussian formula with $\bSigma = AA\T$.`,
            solution: [
              md`(a) $\bz = A^{-1}(\bx - \bb)$ and $J = A$, so $\log p_x(\bx) = \log p_z(A^{-1}(\bx - \bb)) - \log\lvert\det A\rvert$ with $\log p_z(\bz) = -\log 2\pi - \tfrac12\bz\T\bz$.`,
              md`(b) At $\bx = \bb$, $\bz = \bzero$, and $\det A = 2$: $\log p_x(\bb) = -\log 2\pi - \log 2 = -\log 4\pi \approx -2.531$.`,
              md`(c) $\bSigma = AA\T = \begin{bmatrix} 4 & 2 \\ 2 & 2 \end{bmatrix}$ with $\det\bSigma = 4 = (\det A)^2$. The Gaussian formula at the mean gives $-\tfrac12(2\log 2\pi + \log 4) = -\log 2\pi - \log 2$, the same.`,
            ],
            answer: { kind: 'number', value: -Math.log(4 * Math.PI), tol: 1e-3 },
            rubric: [md`Correct change-of-variables formula with $-\log\lvert\det A\rvert$`, md`Correct value at $\bx = \bb$`, md`Consistency check via $\det(AA\T) = (\det A)^2$`],
            areas: ['math', 'ml-depth'],
          },
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *your Gaussian mixture model's log-likelihood becomes \`-inf\` or \`nan\` in high dimensions. What could be wrong in how you compute the Gaussian log-density, and how would you fix it?*`,
          model: md`The usual culprit is computing \`det(Sigma)\` and then its log, or forming \`inv(Sigma)\`. In high dimensions the determinant underflows to 0 (or overflows to infinity), so the log is $-\infty$ and the density is meaningless; a near-singular covariance makes the inverse inaccurate too. Fix: work in log space throughout. Factor $\bSigma = LL\T$ with Cholesky, get $\log\det\bSigma = 2\sum_i\log L_{ii}$, and compute the Mahalanobis term by solving $L\bv = \bx - \bmu$ and taking $\lVert\bv\rVert^2$. Add a small multiple of $I$ to each covariance (regularization) so it stays positive definite when a component collapses onto few points, and combine component densities with log-sum-exp.`,
        },
        {
          kind: 'recall',
          prompt: md`From memory: write the Gaussian log-density, the change-of-variables formula, and the log-determinant of an affine coupling layer.`,
          answer: md`$\log p(\bx) = -\tfrac12[d\log 2\pi + \log\det\bSigma + (\bx - \bmu)\T\bSigma^{-1}(\bx - \bmu)]$. $\log p_y(\by) = \log p_z(\bz) - \log\lvert\det J_f(\bz)\rvert$. Affine coupling: $\log\lvert\det J\rvert = \sum_i s_i(\bz_a)$.`,
        },
      ],
      cards: [
        { id: 'la05-3-c1', kind: 'concept', front: md`Write the log-density of $\mathcal{N}(\bmu, \bSigma)$ in $d$ dimensions.`, back: md`$-\tfrac12\left[d\log 2\pi + \log\det\bSigma + (\bx - \bmu)\T\bSigma^{-1}(\bx - \bmu)\right]$.` },
        { id: 'la05-3-c2', kind: 'concept', front: md`How do you compute $\log\det\bSigma$ stably for a large covariance?`, back: md`Cholesky $\bSigma = LL\T$, then $2\sum_i\log L_{ii}$; or \`np.linalg.slogdet\`. Never \`log(det(...))\`, which underflows or overflows.` },
        { id: 'la05-3-c3', kind: 'cloze', text: md`Change of variables: $\log p_y(\by) = \log p_z(\bz)$ minus the log of the absolute value of the {{}} of the Jacobian.`, answers: ['determinant'] },
        { id: 'la05-3-c4', kind: 'compute', front: md`$\bSigma = \diag(1, 4, 9)$. $\log\det\bSigma$?`, answer: { kind: 'number', value: Math.log(36), tol: 1e-3 }, back: md`$\det = 36$, $\log 36 \approx 3.584$.` },
        { id: 'la05-3-c5', kind: 'concept', front: md`Why do normalizing flows use coupling layers?`, back: md`They are invertible in closed form and have a triangular Jacobian, so $\log\lvert\det J\rvert = \sum_i s_i$ costs $O(d)$ instead of $O(d^3)$.` },
      ],
    },
  ],
  problems: [
    {
      id: 'la05-p1',
      title: 'Area of a parallelogram',
      type: 'compute',
      difficulty: 1,
      minutes: 3,
      statement: md`Find the area of the parallelogram with sides $(3, 1)$ and $(-1, 2)$. Is $(-1, 2)$ counterclockwise from $(3, 1)$?`,
      solution: [md`$\det\begin{bmatrix} 3 & -1 \\ 1 & 2 \end{bmatrix} = 6 + 1 = 7$.`, md`The determinant is positive, so yes: the second vector is counterclockwise from the first. The area is 7.`],
      answer: { kind: 'number', value: 7 },
    },
    {
      id: 'la05-p2',
      title: 'Expand along the best row',
      type: 'compute',
      difficulty: 1,
      minutes: 5,
      statement: md`Compute $\det\begin{bmatrix} 3 & 0 & 2 \\ 1 & 4 & 0 \\ 0 & 2 & 1 \end{bmatrix}$ by cofactor expansion along a row or column with a zero.`,
      solution: [
        md`Along row 1 (it has a zero): $3\cdot\det\begin{bmatrix} 4 & 0 \\ 2 & 1 \end{bmatrix} - 0 + 2\cdot\det\begin{bmatrix} 1 & 4 \\ 0 & 2 \end{bmatrix}$.`,
        md`$= 3\cdot 4 + 2\cdot 2 = 16$.`,
      ],
      answer: { kind: 'number', value: 16 },
    },
    {
      id: 'la05-p3',
      title: 'A 4×4 determinant by elimination',
      type: 'compute',
      difficulty: 2,
      minutes: 8,
      statement: md`Compute $\det\begin{bmatrix} 1 & 2 & 0 & 1 \\ 2 & 5 & 1 & 2 \\ 0 & 1 & 3 & 1 \\ 1 & 2 & 0 & 3 \end{bmatrix}$ by elimination.`,
      solution: [
        md`$R_2 \leftarrow R_2 - 2R_1$: $(0, 1, 1, 0)$. $R_4 \leftarrow R_4 - R_1$: $(0, 0, 0, 2)$. Row additions do not change the determinant.`,
        md`$R_3 \leftarrow R_3 - R_2$: $(0, 0, 2, 1)$.`,
        md`The matrix is now upper triangular with diagonal $1, 1, 2, 2$ and no swaps were used, so $\det = 4$.`,
      ],
      answer: { kind: 'number', value: 4 },
    },
    {
      id: 'la05-p4',
      title: 'Equal rows and zero rows',
      type: 'proof',
      difficulty: 2,
      minutes: 6,
      statement: md`Using only the effect of row operations on the determinant, prove: (a) if two rows of $A$ are equal, $\det A = 0$; (b) if a row of $A$ is zero, $\det A = 0$; (c) if one row is a multiple of another, $\det A = 0$.`,
      solution: [
        md`(a) Swapping the two equal rows leaves $A$ unchanged but flips the sign of the determinant: $\det A = -\det A$, so $\det A = 0$.`,
        md`(b) Scaling the zero row by $2$ leaves $A$ unchanged but doubles the determinant: $\det A = 2\det A$, so $\det A = 0$.`,
        md`(c) If $R_i = cR_j$, the operation $R_i \leftarrow R_i - cR_j$ keeps the determinant and produces a zero row, so by (b) $\det A = 0$.`,
      ],
      rubric: [md`Uses the swap rule on the equal rows`, md`Uses the scaling rule on the zero row`, md`Reduces (c) to (b) with a determinant-preserving operation`],
    },
    {
      id: 'la05-p5',
      title: 'Triangular matrices',
      type: 'proof',
      difficulty: 2,
      minutes: 8,
      statement: md`Prove by induction on $n$, using cofactor expansion, that the determinant of an $n\times n$ upper-triangular matrix is the product of its diagonal entries.`,
      solution: [
        md`Base case $n = 1$: $\det[a_{11}] = a_{11}$.`,
        md`Inductive step: for upper-triangular $U$ of size $n$, expand along column 1. Its only possibly nonzero entry is $u_{11}$, so $\det U = u_{11}\det M_{11}$.`,
        md`$M_{11}$ (delete row 1 and column 1) is upper triangular of size $n - 1$ with diagonal $u_{22}, \dots, u_{nn}$. By the induction hypothesis $\det M_{11} = u_{22}\cdots u_{nn}$.`,
        md`So $\det U = u_{11}u_{22}\cdots u_{nn}$. For lower-triangular matrices use $\det L = \det L\T$.`,
      ],
      rubric: [md`Base case`, md`Expansion along the first column with only one nonzero term`, md`Identifies the minor as triangular and applies the hypothesis`],
    },
    {
      id: 'la05-p6',
      title: 'A singular family',
      type: 'compute',
      difficulty: 2,
      minutes: 6,
      statement: md`For which real $t$ is $\begin{bmatrix} 1 & t & 0 \\ t & 1 & t \\ 0 & t & 1 \end{bmatrix}$ singular? Enter both values.`,
      solution: [
        md`Expand along row 1: $1\cdot\det\begin{bmatrix} 1 & t \\ t & 1 \end{bmatrix} - t\cdot\det\begin{bmatrix} t & t \\ 0 & 1 \end{bmatrix} + 0 = (1 - t^2) - t\cdot t = 1 - 2t^2$.`,
        md`$1 - 2t^2 = 0$ gives $t = \pm\tfrac{1}{\sqrt2} \approx \pm 0.7071$.`,
      ],
      answer: { kind: 'set', value: [-Math.SQRT1_2, Math.SQRT1_2] },
    },
    {
      id: 'la05-p7',
      title: 'Area of a triangle from its vertices',
      type: 'apply',
      difficulty: 1,
      minutes: 4,
      statement: md`Find the area of the triangle with vertices $(1, 1)$, $(4, 2)$ and $(2, 5)$.`,
      solution: [
        md`Translate so that $(1, 1)$ is at the origin: the other vertices become $(3, 1)$ and $(1, 4)$.`,
        md`$\det\begin{bmatrix} 3 & 1 \\ 1 & 4 \end{bmatrix} = 12 - 1 = 11$ is the parallelogram's area; the triangle is half: $5.5$.`,
      ],
      answer: { kind: 'number', value: 5.5 },
    },
    {
      id: 'la05-p8',
      title: 'A Gaussian log-likelihood by hand',
      type: 'apply',
      difficulty: 2,
      minutes: 10,
      statement: md`Evaluate $\log p(\bx)$ for $\bx = (1, -1)$ under $\mathcal{N}(\bzero, \bSigma)$ with $\bSigma = \begin{bmatrix} 2 & 1 \\ 1 & 2 \end{bmatrix}$. Give the answer to three decimals.`,
      solution: [
        md`$\det\bSigma = 4 - 1 = 3$ and $\bSigma^{-1} = \tfrac13\begin{bmatrix} 2 & -1 \\ -1 & 2 \end{bmatrix}$.`,
        md`$\bx\T\bSigma^{-1}\bx = \tfrac13\left(2\cdot 1 - 2\cdot(1)(-1) + 2\cdot 1\right) = \tfrac13\cdot 6 = 2$.`,
        md`$\log p = -\tfrac12(2\log 2\pi + \log 3 + 2) = -\log 2\pi - \tfrac12\log 3 - 1 \approx -1.838 - 0.549 - 1 = -3.387$.`,
      ],
      answer: { kind: 'number', value: -3.3871832, tol: 1e-3 },
      areas: ['math', 'ml-depth'],
    },
    {
      id: 'la05-p9',
      title: 'Rules for products, inverses and scaling',
      type: 'compute',
      difficulty: 1,
      minutes: 5,
      statement: md`$A$ is $3\times 3$ with $\det A = 4$. Compute $\det(2A)$, $\det(A^{-1})$, $\det(A\T A)$ and $\det(-A)$, in that order.`,
      solution: [
        md`$\det(2A) = 2^3\cdot 4 = 32$; $\det(A^{-1}) = 1/4$.`,
        md`$\det(A\T A) = \det A\T\det A = 16$; $\det(-A) = (-1)^3\cdot 4 = -4$.`,
      ],
      answer: { kind: 'vector', value: [32, 0.25, 16, -4] },
    },
    {
      id: 'la05-p10',
      title: 'The Jacobian of polar coordinates and the Gaussian integral',
      type: 'derive',
      difficulty: 3,
      minutes: 15,
      statement: md`(a) For $x = r\cos\theta$, $y = r\sin\theta$, compute the Jacobian matrix $\partial(x, y)/\partial(r, \theta)$ and its determinant. (b) Use it to evaluate $I^2 = \iint_{\R^2} e^{-(x^2 + y^2)}\,dx\,dy$. (c) Conclude the value of $\int_{-\infty}^{\infty} e^{-x^2}dx$, which normalizes the Gaussian. Enter $I^2$.`,
      solution: [
        md`(a) $J = \begin{bmatrix} \cos\theta & -r\sin\theta \\ \sin\theta & r\cos\theta \end{bmatrix}$, $\det J = r\cos^2\theta + r\sin^2\theta = r$.`,
        md`(b) Change of variables: $dx\,dy = \lvert\det J\rvert\,dr\,d\theta = r\,dr\,d\theta$. So $I^2 = \int_0^{2\pi}\!\int_0^\infty e^{-r^2}r\,dr\,d\theta$.`,
        md`The inner integral is $\left[-\tfrac12e^{-r^2}\right]_0^\infty = \tfrac12$, so $I^2 = 2\pi\cdot\tfrac12 = \pi$.`,
        md`(c) $I^2 = \left(\int e^{-x^2}dx\right)\left(\int e^{-y^2}dy\right)$, so $\int_{-\infty}^\infty e^{-x^2}dx = \sqrt\pi$. This is where the $\sqrt{2\pi}$ in the normal density comes from.`,
      ],
      answer: { kind: 'number', value: Math.PI, tol: 1e-3 },
      rubric: [md`Correct Jacobian and $\det J = r$`, md`Uses $\lvert\det J\rvert$ in the change of variables`, md`Evaluates the radial integral`, md`Separates $I^2$ into a product of two 1-D integrals`],
      areas: ['math', 'ml-depth'],
    },
  ],
};
