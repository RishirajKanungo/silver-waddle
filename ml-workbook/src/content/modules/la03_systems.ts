import { md, type Module } from '../types';

export const MODULE: Module = {
  id: 'la03',
  part: 'la',
  order: 3,
  title: 'Linear systems and elimination',
  summary: 'Ax = b as meeting lines and planes and as a combination of columns; Gaussian elimination to echelon and reduced echelon form; inverses by Gauss–Jordan; LU factorization, and why you solve instead of invert.',
  relevance: md`Fitting linear and ridge regression, taking a Newton step, Gaussian process regression and Kalman filtering all come down to solving a linear system. Numerical libraries do this with a factorization (LU, or Cholesky for symmetric positive definite matrices), never by forming $A^{-1}$; \`np.linalg.solve\` calls LAPACK's LU solver with partial pivoting. Interview questions ask when a system has zero, one or infinitely many solutions, why you should not invert a matrix, and what solving costs.`,
  areas: ['math', 'ml-breadth', 'ml-coding'],
  prereqs: ['la02'],
  lessons: [
    // ------------------------------------------------------------------ 3.1
    {
      id: 'la03-1',
      title: 'Three pictures of Ax = b',
      minutes: 30,
      objectives: [
        'Write a system of linear equations as Ax = b and as an augmented matrix [A | b].',
        'Draw the row picture (lines or planes) and the column picture (columns combined to reach b) of a small system.',
        'Decide from either picture whether a system has one, no, or infinitely many solutions.',
        'Prove that a linear system cannot have exactly two solutions.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Fit a line $y = c_0 + c_1t$ through the data points $(t, y) = (1, 3)$ and $(2, 5)$. Each point gives one equation in the unknowns $c_0, c_1$:

$$\begin{aligned} c_0 + c_1 &= 3 \\ c_0 + 2c_1 &= 5 \end{aligned} \qquad\Longleftrightarrow\qquad \begin{bmatrix} 1 & 1 \\ 1 & 2 \end{bmatrix}\begin{bmatrix} c_0 \\ c_1 \end{bmatrix} = \begin{bmatrix} 3 \\ 5 \end{bmatrix}.$$

Subtracting the first equation from the second gives $c_1 = 2$, then $c_0 = 1$. With a hundred data points and two unknowns there is usually no exact solution, and least squares (later in the course) picks the best one. Either way, the core task is solving $A\bx = \bb$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Linear system',
          md: md`A system of $m$ linear equations in $n$ unknowns is $A\bx = \bb$, with **coefficient matrix** $A$ ($m\times n$), unknown $\bx \in \R^n$ and right-hand side $\bb \in \R^m$. The **augmented matrix** $[A \mid \bb]$ stores all the numbers. A **solution** is any $\bx$ that satisfies every equation; the **solution set** is the set of all of them.`,
        },
        {
          kind: 'text',
          md: md`The same system can be read in three ways. Take $x + y = 3$, $x - y = 1$.

- **Row picture.** Each equation is a line in the plane (a plane in $\R^3$, a hyperplane in $\R^n$). Solutions are the points on every line at once: here the crossing point $(2, 1)$.
- **Column picture.** Find weights $x, y$ with $x\begin{bmatrix}1\\1\end{bmatrix} + y\begin{bmatrix}1\\-1\end{bmatrix} = \begin{bmatrix}3\\1\end{bmatrix}$. A solution exists exactly when $\bb$ is in the span of the columns. Here $2(1, 1) + 1(1, -1) = (3, 1)$.
- **Matrix picture.** $A$ is a map; find every input that $A$ sends to $\bb$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.lines2d', lines: [[[0, 3], [3, 0]], [[1, 0], [3, 2]]] },
          task: md`Drag one orange dot until the two lines are parallel. What happens to the two columns on the right, and where is $\bb$? Then make the two lines coincide.`,
          caption: md`Parallel lines in the row picture mean parallel columns in the column picture, since parallel lines have proportional coefficients. Then the columns only reach the points on one line, and the system is solvable only if $\bb$ happens to lie on it.`,
        },
        {
          kind: 'check',
          q: md`In the row picture of a $2\times 2$ system, the two lines are parallel and distinct. In the column picture,`,
          options: [md`the columns are parallel and $\bb$ is not on their line`, md`the columns are perpendicular`, md`$\bb = \bzero$`, md`the columns are parallel and $\bb$ is on their line`],
          answer: 0,
          explain: md`No solution means no combination of the columns equals $\bb$. With independent columns every $\bb$ is reachable, so the columns must be parallel, and $\bb$ must be off their line. If $\bb$ were on it, the lines would coincide.`,
        },
        {
          kind: 'numeric',
          q: md`Solve $2x + y = 7$, $x - y = -1$. Enter $[x, y]$.`,
          answer: { kind: 'vector', value: [2, 3] },
          explain: md`Adding the equations eliminates $y$: $3x = 6$, so $x = 2$ and $y = x + 1 = 3$. Check: $2\cdot 2 + 3 = 7$.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Zero, one or infinitely many',
          md: md`Every linear system has either no solution, exactly one solution, or infinitely many solutions.`,
        },
        {
          kind: 'derive',
          title: 'never exactly two solutions',
          goal: md`Show that if $A\bx = \bb$ has two different solutions $\bp$ and $\bq$, it has infinitely many.`,
          steps: [
            { md: md`Consider the points on the line through $\bp$ and $\bq$: $\bx_t = \bp + t(\bq - \bp)$ for real $t$. Different $t$ give different points, since $\bq - \bp \ne \bzero$.` },
            {
              md: md`By linearity, $A\bx_t = A\bp + t(A\bq - A\bp) = \bb + t(\bb - \bb) = \bb$.`,
              choose: {
                prompt: md`What is the key fact about $A(\bq - \bp)$?`,
                options: [md`$A(\bq - \bp) = A\bq - A\bp = \bb - \bb = \bzero$`, md`$A(\bq - \bp)$ is orthogonal to $\bb$`, md`$A(\bq - \bp) = \bq - \bp$`],
                answer: 0,
                explain: md`The difference of two solutions solves the homogeneous system $A\bx = \bzero$. Adding any multiple of it to a solution gives another solution.`,
              },
            },
            { md: md`So every $\bx_t$ is a solution: infinitely many. In the row picture, two lines that share two points are the same line.` },
          ],
          takeaway: md`Solution sets of linear systems are flat: a point, a line, a plane, and so on, or empty. Module 4 describes them exactly as one solution plus the null space.`,
        },
        {
          kind: 'text',
          md: md`**Three unknowns.** Each equation $a_1x + a_2y + a_3z = b$ is a plane in $\R^3$ with normal vector $(a_1, a_2, a_3)$. Three planes usually meet in a single point. They can also share a line, or have no common point at all: two parallel planes, or three planes that meet in pairs along three parallel lines (a triangular prism).`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.planes3d', preset: 'unique' },
          task: md`Rotate the view to see the single point. Switch to **a line**, then move **shift plane 3** to $0.5$. How many solutions are there now, and what do the dashed lines show?`,
          caption: md`In the **a line** preset, equation 3 is the sum of equations 1 and 2, so it adds no new information: $\rank A = 2$ and a whole line of solutions survives. Shifting plane 3 makes equation 3 contradict the other two: $\rank\,[A \mid \bb] = 3 > \rank A = 2$, and the solution set is empty.`,
        },
        {
          kind: 'check',
          q: md`Three planes in $\R^3$ meet in pairs along three different parallel lines. How many solutions does the system have?`,
          options: [md`None`, md`Exactly one`, md`Exactly three`, md`Infinitely many`],
          answer: 0,
          explain: md`A solution would be a point on all three planes, hence on all three intersection lines. Distinct parallel lines share no point.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'la03-1-paper',
            title: 'A parameter that breaks uniqueness',
            type: 'concept',
            difficulty: 2,
            minutes: 6,
            statement: md`Consider $x + 2y = 3$ and $2x + ky = c$. For which value of $k$ does the system fail to have exactly one solution? For that $k$, which value of $c$ gives infinitely many solutions, and which values give none? Enter the value of $k$.`,
            hints: [md`Subtract twice the first equation from the second.`],
            solution: [
              md`Subtract twice the first equation: $(k - 4)y = c - 6$.`,
              md`If $k \neq 4$, then $y = (c - 6)/(k - 4)$ and $x = 3 - 2y$: exactly one solution, for every $c$.`,
              md`If $k = 4$, the equation reads $0 = c - 6$. For $c = 6$ it holds for every $y$: the two lines coincide, infinitely many solutions. For $c \neq 6$ it is false: parallel lines, no solution.`,
            ],
            answer: { kind: 'number', value: 4 },
            rubric: [md`Eliminates $x$ correctly`, md`Separates the cases $k \ne 4$ and $k = 4$`, md`Gives both sub-cases for $c$ and interprets them as lines`],
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

A = np.array([[1.0, 1.0], [1.0, -1.0]])
b = np.array([3.0, 1.0])
print(np.linalg.solve(A, b))`,
          predict: {
            q: md`What does this print?`,
            options: ['`[2. 1.]`', '`[1. 2.]`', '`[2 1]`', '`[3. 1.]`'],
            answer: 0,
            explain: md`The solution is $x = 2$, $y = 1$. The inputs are floats, so the result prints with decimal points.`,
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

A = np.array([[1.0, 2.0], [2.0, 4.0]])   # second row = 2 * first row
b = np.array([3.0, 6.0])
print(np.linalg.solve(A, b))`,
          error: true,
          note: md`This system has infinitely many solutions, but \`solve\` only handles square systems with exactly one solution, so it raises \`LinAlgError: Singular matrix\`. Change \`b\` to \`[3.0, 7.0]\`: it still raises, although now there is no solution at all.`,
        },
        {
          kind: 'recall',
          prompt: md`From memory: describe the row and column pictures of $A\bx = \bb$, and say what each looks like when there is no solution.`,
          answer: md`Row picture: one line (plane, hyperplane) per equation; solutions are the common points. No solution: the lines or planes have no common point (parallel lines, a prism of planes). Column picture: find weights that combine the columns of $A$ into $\bb$. No solution: $\bb$ is outside the span of the columns.`,
        },
      ],
      cards: [
        { id: 'la03-1-c1', kind: 'concept', front: md`State the column picture of $A\bx = \bb$, and when it has a solution.`, back: md`Find weights $x_j$ with $\sum_j x_j\ba_j = \bb$. A solution exists exactly when $\bb$ is in the span of the columns of $A$.` },
        { id: 'la03-1-c2', kind: 'cloze', text: md`A linear system has no solution, exactly one, or {{}} many solutions.`, answers: ['infinitely'] },
        { id: 'la03-1-c3', kind: 'compute', front: md`Solve $x + y = 5$, $x - y = 1$. Enter $[x, y]$.`, answer: { kind: 'vector', value: [3, 2] }, back: md`Add: $2x = 6$, $x = 3$, $y = 2$.` },
        { id: 'la03-1-c4', kind: 'concept', front: md`If $\bp$ and $\bq$ both solve $A\bx = \bb$, what equation does $\bq - \bp$ solve?`, back: md`$A(\bq - \bp) = \bzero$, the homogeneous system. So $\bp + t(\bq - \bp)$ is a solution for every $t$.` },
        { id: 'la03-1-c5', kind: 'concept', front: md`Three possible ways three planes in $\R^3$ can fail to have a common point.`, back: md`Two (or three) of them are parallel and distinct; or they meet in pairs along three parallel lines (a prism).` },
      ],
    },
    // ------------------------------------------------------------------ 3.2
    {
      id: 'la03-2',
      title: 'Gaussian elimination',
      minutes: 40,
      objectives: [
        'Apply the three row operations and explain why they do not change the solution set.',
        'Reduce an augmented matrix to row echelon form, identify the pivots, and back-substitute.',
        'Reduce to reduced row echelon form and identify pivot and free variables.',
        'Write the solution set of a system with free variables in parametric vector form.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Elimination solves a system by removing one unknown at a time. Take

$$\begin{aligned} x + y + z &= 6 \\ 2x + 3y + z &= 11 \\ x + 2y + 3z &= 14 \end{aligned}$$

Subtract $2\times$ equation 1 from equation 2, and equation 1 from equation 3. Both new equations are free of $x$: $y - z = -1$ and $y + 2z = 8$. Subtract the first of these from the second: $3z = 9$. The system is now triangular, and you solve it from the bottom up: $z = 3$, then $y = -1 + z = 2$, then $x = 6 - y - z = 1$. The last stage is **back substitution**.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Elementary row operations',
          md: md`On the augmented matrix $[A \mid \bb]$:

1. **swap** two rows, $R_i \leftrightarrow R_j$
2. **scale** a row by a nonzero number, $R_i \leftarrow cR_i$ with $c \ne 0$
3. **add** a multiple of another row, $R_i \leftarrow R_i + kR_j$ with $j \ne i$

Each operation can be undone by another operation of the same kind, so the solution set never changes.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Echelon forms and pivots',
          md: md`A matrix is in **row echelon form** if all zero rows are at the bottom and each row's first nonzero entry (its **pivot**) is strictly to the right of the pivot in the row above. Below every pivot there are zeros, so the matrix looks like a staircase.

It is in **reduced row echelon form (RREF)** if, in addition, every pivot is 1 and is the only nonzero entry in its column. Every matrix has exactly one RREF.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.rowreduce', matrix: [[1, 1, 1, 6], [2, 3, 1, 11], [1, 2, 3, 14]], augment: 3, mode: 'echelon' },
          task: md`Press **Next step** until you reach echelon form, saying each operation before you press. Then **Reset** and do the elimination yourself with **Your move**, using the operation box.`,
          caption: md`The boxed entry is the pivot being used. Elimination works column by column: choose a pivot, then subtract multiples of its row to make every entry below it zero.`,
        },
        {
          kind: 'numeric',
          q: md`The echelon form above is $\left[\begin{array}{rrr|r} 1 & 1 & 1 & 6 \\ 0 & 1 & -1 & -1 \\ 0 & 0 & 3 & 9 \end{array}\right]$. Back-substitute and enter $[x, y, z]$.`,
          answer: { kind: 'vector', value: [1, 2, 3] },
          explain: md`Bottom row: $3z = 9$, $z = 3$. Middle: $y - z = -1$, $y = 2$. Top: $x + y + z = 6$, $x = 1$.`,
        },
        {
          kind: 'derive',
          title: 'row operations keep the solution set',
          goal: md`Show that $R_i \leftarrow R_i + kR_j$ does not change the set of solutions.`,
          steps: [
            { md: md`Let $\bx$ solve the old system. Equation $i$ of the new system is (old equation $i$) $+ k\,$(old equation $j$). Both hold for $\bx$, so their sum holds too: every old solution is a new solution.` },
            {
              md: md`The operation $R_i \leftarrow R_i - kR_j$ turns the new system back into the old one, and row $j$ is unchanged by either operation.`,
              choose: {
                prompt: md`How do you show the converse, that every new solution is an old one?`,
                options: [md`Find an operation of the same kind that undoes it, and apply the first argument again`, md`Show that the new matrix equals the old one`, md`Check it on one example`],
                answer: 0,
                explain: md`The first step proves "old solution implies new solution" for **any** add-a-multiple operation. Applying it to the inverse operation gives the reverse inclusion.`,
              },
            },
            { md: md`By the first step applied to that inverse operation, every new solution is an old solution. The two solution sets are equal. Swaps and nonzero scalings work the same way; scaling by $0$ is excluded because it cannot be undone.` },
          ],
          takeaway: md`Elimination replaces a system by a simpler one with exactly the same solutions. That is the whole justification of the method.`,
        },
        {
          kind: 'text',
          md: md`**Free variables.** Not every column gets a pivot. Reduce

$$\begin{aligned} x_1 + 2x_2 + 3x_3 &= 6 \\ 2x_1 + 4x_2 + 7x_3 &= 13 \\ x_1 + 2x_2 + 4x_3 &= 7 \end{aligned}$$

to RREF with the stepper below. Column 2 ends up without a pivot. Its variable $x_2$ is **free**: choose it to be any number $t$, and the pivot rows then determine the **pivot variables** $x_1$ and $x_3$ in terms of $t$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.rowreduce', matrix: [[1, 2, 3, 6], [2, 4, 7, 13], [1, 2, 4, 7]], augment: 3, mode: 'rref' },
          task: md`Step to the reduced row echelon form. Which column has no pivot? Write the solution in parametric form yourself, then compare with the box that appears at the end.`,
          caption: md`The RREF is $\left[\begin{array}{rrr|r} 1 & 2 & 0 & 3 \\ 0 & 0 & 1 & 1 \\ 0 & 0 & 0 & 0 \end{array}\right]$: $x_1 = 3 - 2x_2$ and $x_3 = 1$, with $x_2$ free. The zero row says $0 = 0$; it would say $0 = 1$ if the third right-hand side were 8, and then there would be no solution.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Reading the solution from the RREF',
          md: md`- A row $[\,0\ \cdots\ 0 \mid c\,]$ with $c \neq 0$ means **no solution**.
- Otherwise, if every column of $A$ has a pivot, the solution is **unique**.
- Otherwise each column without a pivot gives a **free variable**, and the solutions form $$\bx = \bp + t_1\bv_1 + \dots + t_k\bv_k,$$ where $\bp$ is the solution with all free variables $0$ and $\bv_i$ solves $A\bv = \bzero$ (set free variable $i$ to 1, the others to 0).`,
        },
        {
          kind: 'check',
          q: md`An augmented matrix reduces to $\left[\begin{array}{rrr|r} 1 & 0 & 2 & 3 \\ 0 & 1 & -1 & 1 \\ 0 & 0 & 0 & 5 \end{array}\right]$. The system has`,
          options: [md`no solution`, md`exactly one solution`, md`infinitely many solutions, one free variable`, md`infinitely many solutions, two free variables`],
          answer: 0,
          explain: md`The last row says $0x_1 + 0x_2 + 0x_3 = 5$, which no $\bx$ satisfies. With a $0$ in that position instead, $x_3$ would be free and there would be infinitely many solutions.`,
        },
        {
          kind: 'numeric',
          q: md`The solutions of $\begin{bmatrix} 1 & 2 & 3 \\ 2 & 4 & 7 \end{bmatrix}\bx = \bzero$ form a line through the origin. Give a direction vector of that line.`,
          answer: { kind: 'vector', value: [-2, 1, 0], upToScale: true },
          hints: [md`Reduce: $R_2 \leftarrow R_2 - 2R_1$ gives $(0, 0, 1)$. Which column has no pivot?`],
          explain: md`RREF: $\begin{bmatrix} 1 & 2 & 0 \\ 0 & 0 & 1 \end{bmatrix}$. So $x_3 = 0$, $x_1 = -2x_2$, with $x_2$ free. Setting $x_2 = 1$ gives $(-2, 1, 0)$. Any nonzero multiple is also correct.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'la03-2-paper',
            title: 'Elimination that needs a swap',
            type: 'compute',
            difficulty: 2,
            minutes: 10,
            statement: md`Solve by Gaussian elimination, writing each row operation: $$\begin{aligned} y + z &= 3 \\ x + y &= 3 \\ x + z &= 4. \end{aligned}$$ Enter $[x, y, z]$.`,
            hints: [md`The first equation has no $x$, so the $(1,1)$ entry is $0$ and cannot be a pivot. Swap rows first.`],
            solution: [
              md`Augmented matrix $\left[\begin{array}{rrr|r} 0 & 1 & 1 & 3 \\ 1 & 1 & 0 & 3 \\ 1 & 0 & 1 & 4 \end{array}\right]$. The first pivot position holds a 0, so swap: $R_1 \leftrightarrow R_2$.`,
              md`$\left[\begin{array}{rrr|r} 1 & 1 & 0 & 3 \\ 0 & 1 & 1 & 3 \\ 1 & 0 & 1 & 4 \end{array}\right]$, then $R_3 \leftarrow R_3 - R_1$: third row $(0, -1, 1 \mid 1)$.`,
              md`$R_3 \leftarrow R_3 + R_2$: third row $(0, 0, 2 \mid 4)$. Echelon form reached, with three pivots.`,
              md`Back substitution: $2z = 4$, $z = 2$; $y + z = 3$, $y = 1$; $x + y = 3$, $x = 2$. Check in the third equation: $2 + 2 = 4$.`,
            ],
            answer: { kind: 'vector', value: [2, 1, 2] },
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

A = np.array([[1., 1., 1.], [2., 3., 1.], [1., 2., 3.]])
b = np.array([6., 11., 14.])
print(np.round(np.linalg.solve(A, b), 6))`,
          predict: {
            q: md`This is the first system of the lesson. What is printed?`,
            options: ['`[1. 2. 3.]`', '`[6. 11. 14.]`', '`[3. 2. 1.]`', '`[1 2 3]`'],
            answer: 0,
            explain: md`The solution is $(1, 2, 3)$. Rounding to 6 decimals hides floating-point noise of order $10^{-16}$.`,
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'la03-2-ex',
            title: 'Back substitution',
            prompt: md`Write \`back_sub(U, c)\` that solves $U\bx = \bc$ for an upper-triangular \`U\` with nonzero diagonal, working from the last row up: $$x_i = \frac{c_i - \sum_{j > i} u_{ij}x_j}{u_{ii}}.$$ Do not use \`np.linalg\`.`,
            starter: `import numpy as np

def back_sub(U, c):
    n = len(c)
    x = np.zeros(n)
    # fill x[n-1], then x[n-2], ..., then x[0]
    return x
`,
            solution: `import numpy as np

def back_sub(U, c):
    n = len(c)
    x = np.zeros(n)
    for i in range(n - 1, -1, -1):
        x[i] = (c[i] - U[i, i + 1:] @ x[i + 1:]) / U[i, i]
    return x
`,
            tests: [
              { expr: 'np.round(back_sub(np.array([[1., 1., 1.], [0., 1., -1.], [0., 0., 3.]]), np.array([6., -1., 9.])), 6).tolist()', label: 'the lesson system' },
              { expr: 'np.round(back_sub(np.array([[2., -1., 0.], [0., 4., 1.], [0., 0., 5.]]), np.array([1., 2., 10.])), 6).tolist()', label: 'non-unit diagonal' },
              { expr: 'np.round(back_sub(np.array([[4.]]), np.array([2.])), 6).tolist()', label: '1×1' },
            ],
            hints: [md`Loop \`for i in range(n - 1, -1, -1)\`. The entries to the right of the diagonal in row $i$ are \`U[i, i+1:]\`, and the already-known unknowns are \`x[i+1:]\`.`],
            mustExclude: ['linalg'],
          },
        },
        {
          kind: 'recall',
          prompt: md`From memory: list the three row operations, define a pivot, and explain how to read "no solution", "unique solution" and "infinitely many" from the RREF of $[A \mid \bb]$.`,
          answer: md`Swap two rows, scale a row by a nonzero number, add a multiple of one row to another. A pivot is the first nonzero entry of a row in echelon form. A row $[0 \cdots 0 \mid c]$ with $c \ne 0$: no solution. Otherwise a pivot in every column of $A$: unique. Otherwise free variables: infinitely many.`,
        },
      ],
      cards: [
        { id: 'la03-2-c1', kind: 'concept', front: md`Name the three elementary row operations and why they keep the solution set.`, back: md`Swap, scale by a nonzero number, add a multiple of another row. Each can be undone by an operation of the same kind.` },
        { id: 'la03-2-c2', kind: 'concept', front: md`Echelon form versus reduced row echelon form.`, back: md`Echelon: staircase of pivots with zeros below them. RREF: additionally every pivot is 1 with zeros above and below it. The RREF is unique.` },
        { id: 'la03-2-c3', kind: 'cloze', text: md`A variable whose column has no pivot is called a {{}} variable.`, answers: ['free'] },
        { id: 'la03-2-c4', kind: 'compute', front: md`Back-substitute $\left[\begin{array}{rr|r} 2 & 1 & 5 \\ 0 & 3 & 3 \end{array}\right]$. Enter $[x, y]$.`, answer: { kind: 'vector', value: [2, 1] }, back: md`$3y = 3$, $y = 1$; $2x + 1 = 5$, $x = 2$.` },
        { id: 'la03-2-c5', kind: 'concept', front: md`What does a row $[\,0\ 0\ 0 \mid 5\,]$ in the reduced augmented matrix mean?`, back: md`$0 = 5$: the system is inconsistent and has no solution.` },
      ],
    },
    // ------------------------------------------------------------------ 3.3
    {
      id: 'la03-3',
      title: 'Inverses, LU, and solving in practice',
      minutes: 40,
      objectives: [
        'Compute A⁻¹ by Gauss–Jordan elimination on [A | I], and with the 2×2 formula.',
        'State equivalent conditions for a square matrix to be invertible, and use (AB)⁻¹ = B⁻¹A⁻¹.',
        'Factor A = LU by recording the multipliers of elimination, and solve Ax = b with one forward and one back substitution.',
        'Explain why numerical code solves systems instead of forming A⁻¹, with costs of order n³ once and n² per right-hand side.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`If $A$ is square and invertible, $A\bx = \bb$ has the single solution $\bx = A^{-1}\bb$. The formula is useful for reasoning and for small matrices. For computing, there is a cheaper and more accurate route that never forms $A^{-1}$; this lesson covers both.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'The 2×2 inverse',
          md: md`$$\begin{bmatrix} a & b \\ c & d \end{bmatrix}^{-1} = \frac{1}{ad - bc}\begin{bmatrix} d & -b \\ -c & a \end{bmatrix}, \qquad \text{provided } ad - bc \neq 0.$$

Swap the diagonal, negate the off-diagonal, divide by $ad - bc$. If $ad - bc = 0$, the columns are parallel and there is no inverse.`,
        },
        {
          kind: 'numeric',
          q: md`Compute the inverse of $\begin{bmatrix} 4 & 7 \\ 2 & 6 \end{bmatrix}$.`,
          answer: { kind: 'matrix', value: [[0.6, -0.7], [-0.2, 0.4]] },
          explain: md`$ad - bc = 24 - 14 = 10$, so the inverse is $\tfrac{1}{10}\begin{bmatrix} 6 & -7 \\ -2 & 4 \end{bmatrix}$. Check one entry of the product: row 1 of $A$ times column 1 of $A^{-1}$ is $4(0.6) + 7(-0.2) = 1$.`,
        },
        {
          kind: 'text',
          md: md`**Gauss–Jordan.** For larger matrices, put $A$ and $I$ side by side and row-reduce until the left block is $I$. The right block is then $A^{-1}$:
$$[\,A \mid I\,] \ \longrightarrow\ [\,I \mid A^{-1}\,].$$
If the left block cannot be reduced to $I$ because a column has no pivot, $A$ is not invertible.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.rowreduce', matrix: [[2, 1, 1, 0], [5, 3, 0, 1]], augment: 2, inverse: true },
          task: md`Before stepping, use the $2\times 2$ formula to predict $A^{-1}$. Then step to the end, or try your own sequence of operations.`,
          caption: md`$\det = 2\cdot 3 - 1\cdot 5 = 1$, so the formula gives $A^{-1} = \begin{bmatrix} 3 & -1 \\ -5 & 2 \end{bmatrix}$, the right block at the end.`,
        },
        {
          kind: 'derive',
          title: 'why Gauss–Jordan produces the inverse',
          goal: md`Show that the operations that reduce $A$ to $I$, applied to $I$, produce $A^{-1}$.`,
          steps: [
            { md: md`Each row operation equals multiplication on the left by an **elementary matrix**: the matrix obtained by applying that operation to $I$. For example, $R_2 \leftarrow R_2 - 3R_1$ on a $2\times 2$ matrix is multiplication by $E = \begin{bmatrix} 1 & 0 \\ -3 & 1 \end{bmatrix}$.` },
            {
              md: md`If operations $E_1, E_2, \dots, E_k$ (in that order) reduce $A$ to $I$, then $E_k\cdots E_2E_1A = I$. Hence $E_k\cdots E_1 = A^{-1}$.`,
              choose: {
                prompt: md`From $(E_k\cdots E_1)A = I$, what can you conclude?`,
                options: [md`$E_k\cdots E_1$ is the inverse of $A$`, md`$A = I$`, md`Each $E_i$ equals $A^{-1}$`],
                answer: 0,
                explain: md`A matrix $B$ with $BA = I$ for square $A$ is the inverse of $A$. Each elementary matrix is invertible, so their product is too.`,
              },
            },
            { md: md`The right block starts as $I$ and receives the same operations: it ends as $E_k\cdots E_1I = A^{-1}$.` },
          ],
          takeaway: md`Row operations are matrix multiplications from the left. Recording them, instead of applying them to $I$, gives the LU factorization below.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Invertible matrices',
          md: md`For a square $n\times n$ matrix $A$ the following are equivalent:

1. $A$ is invertible.
2. $A\bx = \bb$ has exactly one solution for every $\bb$.
3. $A\bx = \bzero$ only for $\bx = \bzero$.
4. $A$ has $n$ pivots; its RREF is $I$.
5. The columns of $A$ are linearly independent (Module 4).
6. $\det A \neq 0$ (Module 5).

For invertible $A$ and $B$ of the same size, $(AB)^{-1} = B^{-1}A^{-1}$ and $(A\T)^{-1} = (A^{-1})\T$.`,
        },
        {
          kind: 'check',
          q: md`$A$ and $B$ are invertible $n\times n$ matrices. Which is $(AB)^{-1}$?`,
          options: [md`$B^{-1}A^{-1}$`, md`$A^{-1}B^{-1}$`, md`$(BA)^{-1}$`, md`It need not exist`],
          answer: 0,
          explain: md`$(AB)(B^{-1}A^{-1}) = A(BB^{-1})A^{-1} = AA^{-1} = I$. To undo "apply $B$, then $A$", undo $A$ first, then $B$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'LU factorization',
          md: md`If elimination on a square $A$ needs no row swaps, then $A = LU$ where

- $U$ is the upper-triangular echelon form produced by elimination, and
- $L$ is unit lower-triangular (ones on the diagonal) and holds the multipliers: $\ell_{ij}$ is the number $m$ in the step $R_i \leftarrow R_i - mR_j$.

To solve $A\bx = \bb$: solve $L\bc = \bb$ by forward substitution, then $U\bx = \bc$ by back substitution. With row swaps the factorization is $PA = LU$, where $P$ is a permutation matrix. This is what LAPACK computes (partial pivoting), and \`np.linalg.solve\` uses it.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.lu', matrix: [[2, 1, 1], [4, 3, 3], [8, 7, 9]], b: [4, 10, 24] },
          task: md`Step through elimination and watch each multiplier land in $L$. After the check $LU = A$, continue through the forward and back substitutions for $\bb = (4, 10, 24)$.`,
          caption: md`Elimination costs about $\tfrac23 n^3$ operations and is done once. Each new right-hand side then costs two triangular solves, about $2n^2$ operations.`,
        },
        {
          kind: 'numeric',
          q: md`Use $L = \begin{bmatrix} 1 & 0 & 0 \\ 2 & 1 & 0 \\ 4 & 3 & 1 \end{bmatrix}$ and $U = \begin{bmatrix} 2 & 1 & 1 \\ 0 & 1 & 1 \\ 0 & 0 & 2 \end{bmatrix}$ from the figure to solve $A\bx = (2, 4, 10)$.`,
          answer: { kind: 'vector', value: [1, -1, 1] },
          hints: [md`Forward: $c_1 = 2$, $c_2 = 4 - 2c_1$, $c_3 = 10 - 4c_1 - 3c_2$.`],
          explain: md`Forward substitution: $\bc = (2, 0, 2)$. Back substitution: $x_3 = 2/2 = 1$, $x_2 = 0 - x_3 = -1$, $x_1 = (2 - x_2 - x_3)/2 = 1$. Check: $A(1, -1, 1) = (2, 4, 10)$.`,
        },
        {
          kind: 'text',
          md: md`**Why not invert?** Computing $A^{-1}$ costs about $2n^3$ operations, three times an LU factorization, and multiplying $A^{-1}\bb$ costs $2n^2$ per right-hand side, the same as the two triangular solves. So the inverse is never cheaper. It is also typically less accurate in floating point: the computed $A^{-1}\bb$ usually has a larger residual $\lVert A\bx - \bb\rVert$ than the solution from a factorization, and the gap grows when $A$ is ill-conditioned. In code, read $A^{-1}\bb$ as "solve $A\bx = \bb$", and reuse a factorization when the matrix stays fixed and right-hand sides change.`,
        },
        {
          kind: 'viz',
          viz: { type: 'la.solvecost', n: 1000 },
          task: md`With $n = 1000$, compare the three strategies at $k = 1$ and at $k = 1000$. By roughly what factor does inverting lose to LU at $k = 1$?`,
          caption: md`At $k = 1$: LU costs about $6.7\times 10^8$ operations and the inverse about $2.0\times 10^9$, three times more. As $k$ grows, both are dominated by the $2kn^2$ term, but the inverse never catches up. Re-eliminating for every right-hand side is the clear loser.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

A = np.array([[2., 1., 1.], [4., 3., 3.], [8., 7., 9.]])
B = np.array([[4., 2.], [10., 4.], [24., 10.]])   # two right-hand sides, as columns
X = np.linalg.solve(A, B)                         # one factorization, two solves
print(X)`,
          note: md`Pass several right-hand sides as the columns of a matrix. Column $j$ of \`X\` solves $A\bx = \bb_j$. SciPy's \`scipy.linalg.lu_factor\` and \`lu_solve\` keep the factorization between calls.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

print(np.linalg.solve(np.array([[2., 0.], [0., 4.]]), np.array([2., 2.])))`,
          predict: {
            q: md`A diagonal system. What is printed?`,
            options: ['`[1.  0.5]`', '`[1. 2.]`', '`[4. 8.]`', '`[0.5 1. ]`'],
            answer: 0,
            explain: md`$2x = 2$ and $4y = 2$, so $(1, 0.5)$. NumPy pads \`1.\` to the width of \`0.5\`, hence two spaces.`,
          },
        },
        {
          kind: 'paper',
          problem: {
            id: 'la03-3-paper',
            title: 'A 3×3 inverse by Gauss–Jordan',
            type: 'compute',
            difficulty: 2,
            minutes: 14,
            statement: md`Find $A^{-1}$ for $A = \begin{bmatrix} 1 & 2 & 3 \\ 0 & 1 & 4 \\ 5 & 6 & 0 \end{bmatrix}$ by row-reducing $[A \mid I]$. Check your answer by computing one row of $AA^{-1}$.`,
            hints: [md`Start with $R_3 \leftarrow R_3 - 5R_1$. You never need a swap.`],
            solution: [
              md`$R_3 \leftarrow R_3 - 5R_1$: row 3 becomes $(0, -4, -15 \mid -5, 0, 1)$.`,
              md`$R_3 \leftarrow R_3 + 4R_2$: row 3 becomes $(0, 0, 1 \mid -5, 4, 1)$. The left block is now upper triangular with ones on the diagonal.`,
              md`Clear column 3 above the pivot: $R_2 \leftarrow R_2 - 4R_3$ gives $(0, 1, 0 \mid 20, -15, -4)$; $R_1 \leftarrow R_1 - 3R_3$ gives $(1, 2, 0 \mid 16, -12, -3)$.`,
              md`Clear column 2: $R_1 \leftarrow R_1 - 2R_2$ gives $(1, 0, 0 \mid -24, 18, 5)$.`,
              md`So $A^{-1} = \begin{bmatrix} -24 & 18 & 5 \\ 20 & -15 & -4 \\ -5 & 4 & 1 \end{bmatrix}$. Check row 1 of $AA^{-1}$: $(-24 + 40 - 15,\ 18 - 30 + 12,\ 5 - 8 + 3) = (1, 0, 0)$.`,
            ],
            answer: { kind: 'matrix', value: [[-24, 18, 5], [20, -15, -4], [-5, 4, 1]] },
          },
        },
        {
          kind: 'explain',
          prompt: md`A colleague's code computes \`w = np.linalg.inv(X.T @ X + lam * np.eye(d)) @ X.T @ y\` to fit ridge regression. What would you change, and why?`,
          model: md`Replace the inverse with a solve: \`w = np.linalg.solve(X.T @ X + lam * np.eye(d), X.T @ y)\`. Mathematically it is the same $\bw$, but forming the inverse costs about $2d^3$ operations against $\tfrac23 d^3$ for the LU inside \`solve\` (or $\tfrac13 d^3$ for a Cholesky factorization, since the matrix is symmetric positive definite), and it is typically less accurate. Also compute \`X.T @ y\` once, a $d$-vector, rather than multiplying a $d\times d$ inverse by the $d\times N$ matrix \`X.T\`. If several right-hand sides or values of $\lambda$ are needed, factor once and reuse.`,
        },
        {
          kind: 'recall',
          prompt: md`From memory: the $2\times 2$ inverse formula, the Gauss–Jordan recipe, the cost of LU and of each solve with it, and the formula for $(AB)^{-1}$.`,
          answer: md`$\frac{1}{ad - bc}\begin{bmatrix} d & -b \\ -c & a \end{bmatrix}$. Reduce $[A \mid I]$ to $[I \mid A^{-1}]$. LU costs about $\tfrac23 n^3$ once; each forward-plus-back solve about $2n^2$. $(AB)^{-1} = B^{-1}A^{-1}$.`,
        },
      ],
      cards: [
        { id: 'la03-3-c1', kind: 'compute', front: md`Invert $\begin{bmatrix} 3 & 1 \\ 5 & 2 \end{bmatrix}$.`, answer: { kind: 'matrix', value: [[2, -1], [-5, 3]] }, back: md`$ad - bc = 6 - 5 = 1$, so the inverse is $\begin{bmatrix} 2 & -1 \\ -5 & 3 \end{bmatrix}$.` },
        { id: 'la03-3-c2', kind: 'concept', front: md`What do $L$ and $U$ contain in $A = LU$?`, back: md`$U$: the upper-triangular result of elimination. $L$: unit lower-triangular, holding the multipliers $\ell_{ij}$ of the steps $R_i \leftarrow R_i - \ell_{ij}R_j$.` },
        { id: 'la03-3-c3', kind: 'cloze', text: md`With a factorization $A = LU$ in hand, each new right-hand side costs on the order of $n$ to the power {{}}.`, answers: ['2'] },
        { id: 'la03-3-c4', kind: 'concept', front: md`Two reasons to call \`solve(A, b)\` rather than \`inv(A) @ b\`.`, back: md`Cost: computing the inverse is about $2n^3$ operations against $\tfrac23 n^3$ for LU. Accuracy: the inverse route typically gives a larger residual, especially for ill-conditioned $A$.` },
        { id: 'la03-3-c5', kind: 'cloze', text: md`$(AB)^{-1} = B^{-1}A^{-1}$: inverting a product reverses the {{}} of the factors.`, answers: ['order'] },
      ],
    },
  ],
  problems: [
    {
      id: 'la03-p1',
      title: 'A 2×2 system by elimination',
      type: 'compute',
      difficulty: 1,
      minutes: 4,
      statement: md`Solve $3x - y = 5$, $x + 2y = 4$ by elimination. Enter $[x, y]$.`,
      solution: [
        md`Augmented matrix $\left[\begin{array}{rr|r} 3 & -1 & 5 \\ 1 & 2 & 4 \end{array}\right]$. Swap rows to get a pivot of 1: $\left[\begin{array}{rr|r} 1 & 2 & 4 \\ 3 & -1 & 5 \end{array}\right]$.`,
        md`$R_2 \leftarrow R_2 - 3R_1$: $(0, -7 \mid -7)$, so $y = 1$.`,
        md`Back-substitute: $x + 2 = 4$, $x = 2$. Check: $3\cdot 2 - 1 = 5$.`,
      ],
      answer: { kind: 'vector', value: [2, 1] },
    },
    {
      id: 'la03-p2',
      title: 'A line of solutions',
      type: 'compute',
      difficulty: 2,
      minutes: 8,
      statement: md`Find all solutions of $$\begin{aligned} x_1 - x_2 + 2x_3 &= 1 \\ 2x_1 - 2x_2 + 5x_3 &= 4 \\ -x_1 + x_2 &= 3 \end{aligned}$$ in parametric vector form. Enter the particular solution with $x_2 = 0$.`,
      solution: [
        md`$R_2 \leftarrow R_2 - 2R_1$: $(0, 0, 1 \mid 2)$. $R_3 \leftarrow R_3 + R_1$: $(0, 0, 2 \mid 4)$.`,
        md`$R_3 \leftarrow R_3 - 2R_2$: a zero row, so the system is consistent. $R_1 \leftarrow R_1 - 2R_2$: $(1, -1, 0 \mid -3)$.`,
        md`RREF: $x_1 - x_2 = -3$, $x_3 = 2$. Column 2 has no pivot, so $x_2 = t$ is free and $x_1 = -3 + t$.`,
        md`$\bx = \begin{bmatrix} -3 \\ 0 \\ 2 \end{bmatrix} + t\begin{bmatrix} 1 \\ 1 \\ 0 \end{bmatrix}$. With $t = 0$: $(-3, 0, 2)$.`,
      ],
      answer: { kind: 'vector', value: [-3, 0, 2] },
    },
    {
      id: 'la03-p3',
      title: 'When is the system consistent?',
      type: 'concept',
      difficulty: 2,
      minutes: 7,
      statement: md`For which $k$ does $$\begin{aligned} x + y + z &= 1 \\ x + 2y + 3z &= 2 \\ 2x + 3y + 4z &= k \end{aligned}$$ have a solution? How many solutions are there then? Enter $k$.`,
      solution: [
        md`$R_2 \leftarrow R_2 - R_1$: $(0, 1, 2 \mid 1)$. $R_3 \leftarrow R_3 - 2R_1$: $(0, 1, 2 \mid k - 2)$.`,
        md`$R_3 \leftarrow R_3 - R_2$: $(0, 0, 0 \mid k - 3)$.`,
        md`If $k \neq 3$ this row reads $0 = k - 3 \neq 0$: no solution. If $k = 3$ it is $0 = 0$, $z$ is free, and there are infinitely many solutions (a line).`,
        md`Row picture: the third equation's left side is the sum of the first two, so its plane is parallel to the line where planes 1 and 2 meet, and contains it only when $k = 1 + 2 = 3$.`,
      ],
      answer: { kind: 'number', value: 3 },
    },
    {
      id: 'la03-p4',
      title: 'Invertible means a unique solution',
      type: 'proof',
      difficulty: 1,
      minutes: 6,
      statement: md`Let $A$ be an invertible $n\times n$ matrix. Prove that for every $\bb$ the system $A\bx = \bb$ has a solution, and that the solution is unique.`,
      solution: [
        md`Existence: let $\bx = A^{-1}\bb$. Then $A\bx = AA^{-1}\bb = I\bb = \bb$.`,
        md`Uniqueness: suppose $A\by = \bb$ as well. Multiply both sides on the left by $A^{-1}$: $A^{-1}A\by = A^{-1}\bb$, so $\by = A^{-1}\bb = \bx$.`,
        md`Both parts use only $AA^{-1} = A^{-1}A = I$ and associativity.`,
      ],
      rubric: [md`Existence shown by substituting $A^{-1}\bb$`, md`Uniqueness shown by multiplying an arbitrary solution by $A^{-1}$`, md`Uses both $AA^{-1} = I$ and $A^{-1}A = I$ in the right places`],
    },
    {
      id: 'la03-p5',
      title: 'Inverse of a product and of a transpose',
      type: 'proof',
      difficulty: 2,
      minutes: 8,
      statement: md`Let $A, B$ be invertible $n\times n$ matrices. Prove that $(AB)^{-1} = B^{-1}A^{-1}$ and $(A\T)^{-1} = (A^{-1})\T$.`,
      hints: [md`To show $M^{-1} = N$, it is enough to check $MN = I$ and $NM = I$.`, md`For the transpose, transpose the equation $AA^{-1} = I$.`],
      solution: [
        md`$(AB)(B^{-1}A^{-1}) = A(BB^{-1})A^{-1} = AIA^{-1} = AA^{-1} = I$.`,
        md`$(B^{-1}A^{-1})(AB) = B^{-1}(A^{-1}A)B = B^{-1}B = I$. So $B^{-1}A^{-1}$ is the inverse of $AB$.`,
        md`Transpose $AA^{-1} = I$ using $(MN)\T = N\T M\T$: $(A^{-1})\T A\T = I\T = I$. Transposing $A^{-1}A = I$ gives $A\T(A^{-1})\T = I$.`,
        md`So $(A^{-1})\T$ is the inverse of $A\T$.`,
      ],
      rubric: [md`Both products $MN$ and $NM$ checked for $(AB)^{-1}$`, md`Associativity used to regroup`, md`Transpose rule applied to $AA^{-1} = I$ and $A^{-1}A = I$`],
    },
    {
      id: 'la03-p6',
      title: 'An LU factorization',
      type: 'compute',
      difficulty: 2,
      minutes: 8,
      statement: md`Find the LU factorization of $A = \begin{bmatrix} 1 & 2 & 0 \\ 3 & 7 & 2 \\ 2 & 4 & 1 \end{bmatrix}$. Enter $L$.`,
      solution: [
        md`Column 1: $R_2 \leftarrow R_2 - 3R_1$ gives $(0, 1, 2)$, so $\ell_{21} = 3$. $R_3 \leftarrow R_3 - 2R_1$ gives $(0, 0, 1)$, so $\ell_{31} = 2$.`,
        md`Column 2: the entry below the pivot is already $0$, so $\ell_{32} = 0$.`,
        md`$L = \begin{bmatrix} 1 & 0 & 0 \\ 3 & 1 & 0 \\ 2 & 0 & 1 \end{bmatrix}$ and $U = \begin{bmatrix} 1 & 2 & 0 \\ 0 & 1 & 2 \\ 0 & 0 & 1 \end{bmatrix}$. Check the $(2, 3)$ entry of $LU$: $3\cdot 0 + 1\cdot 2 = 2$.`,
      ],
      answer: { kind: 'matrix', value: [[1, 0, 0], [3, 1, 0], [2, 0, 1]] },
    },
    {
      id: 'la03-p7',
      title: 'Counting the cost of inverting',
      type: 'apply',
      difficulty: 2,
      minutes: 6,
      statement: md`You must solve $A\bx = \bb_j$ for $k = 500$ right-hand sides with a fixed $2000\times 2000$ matrix $A$. Use the counts LU $\approx \tfrac23 n^3$, inverse $\approx 2n^3$, and $2n^2$ per right-hand side for either a pair of triangular solves or a product $A^{-1}\bb$. How many times more operations does the inverse route take? Enter the ratio to two decimals.`,
      solution: [
        md`LU route: $\tfrac23(2000)^3 + 500\cdot 2\cdot(2000)^2 = 5.33\times 10^9 + 4\times 10^9 = 9.33\times 10^9$.`,
        md`Inverse route: $2(2000)^3 + 500\cdot 2\cdot(2000)^2 = 1.6\times 10^{10} + 4\times 10^9 = 2.0\times 10^{10}$.`,
        md`Ratio $\approx 2.0\times 10^{10} / 9.33\times 10^9 \approx 2.14$. The gap shrinks as $k$ grows but never closes, and the factorization is also more accurate.`,
      ],
      answer: { kind: 'number', value: 2.142857, tol: 0.005 },
    },
    {
      id: 'la03-p8',
      title: 'The 2×2 inverse from elimination',
      type: 'derive',
      difficulty: 2,
      minutes: 10,
      statement: md`Assume $a \neq 0$ and $ad - bc \neq 0$. Row-reduce $\left[\begin{array}{cc|cc} a & b & 1 & 0 \\ c & d & 0 & 1 \end{array}\right]$ to derive the formula for $\begin{bmatrix} a & b \\ c & d \end{bmatrix}^{-1}$.`,
      solution: [
        md`$R_2 \leftarrow R_2 - \tfrac{c}{a}R_1$: row 2 becomes $\left(0,\ d - \tfrac{bc}{a} \mid -\tfrac{c}{a},\ 1\right) = \left(0,\ \tfrac{ad - bc}{a} \mid -\tfrac{c}{a},\ 1\right)$.`,
        md`Scale row 2 by $\tfrac{a}{ad - bc}$ (allowed since $ad - bc \ne 0$): $\left(0, 1 \mid \tfrac{-c}{ad - bc}, \tfrac{a}{ad - bc}\right)$.`,
        md`$R_1 \leftarrow R_1 - bR_2$: row 1 becomes $\left(a, 0 \mid 1 + \tfrac{bc}{ad - bc}, \tfrac{-ab}{ad - bc}\right) = \left(a, 0 \mid \tfrac{ad}{ad - bc}, \tfrac{-ab}{ad - bc}\right)$.`,
        md`Scale row 1 by $\tfrac1a$: $\left(1, 0 \mid \tfrac{d}{ad - bc}, \tfrac{-b}{ad - bc}\right)$. The right block is $\frac{1}{ad - bc}\begin{bmatrix} d & -b \\ -c & a \end{bmatrix}$.`,
      ],
      rubric: [md`Correct first elimination step with the combined fraction $\frac{ad - bc}{a}$`, md`Justifies dividing by $ad - bc$`, md`Clears the entry above the second pivot correctly`, md`Assembles the final formula`],
    },
    {
      id: 'la03-p9',
      title: 'A parameter that makes a matrix singular',
      type: 'concept',
      difficulty: 2,
      minutes: 6,
      statement: md`For which value of $c$ is $A = \begin{bmatrix} 1 & 2 & c \\ 0 & 1 & 1 \\ 1 & 3 & 2 \end{bmatrix}$ not invertible? Use elimination, not determinants.`,
      solution: [
        md`$R_3 \leftarrow R_3 - R_1$: row 3 becomes $(0, 1, 2 - c)$.`,
        md`$R_3 \leftarrow R_3 - R_2$: row 3 becomes $(0, 0, 1 - c)$.`,
        md`There are three pivots, so $A$ is invertible, unless $1 - c = 0$. For $c = 1$ the third column has no pivot and $A$ is singular.`,
      ],
      answer: { kind: 'number', value: 1 },
    },
    {
      id: 'la03-p10',
      title: 'Ridge regression without an inverse',
      type: 'code-on-paper',
      difficulty: 3,
      minutes: 12,
      statement: md`Ridge regression weights satisfy $(X\T X + \lambda I)\bw = X\T\by$, where $X$ is $N\times d$.

(a) Write two lines of NumPy that compute $\bw$ without forming an inverse. (b) Give the cost of each step in terms of $N$ and $d$. (c) For $X = \begin{bmatrix} 1 & 0 \\ 1 & 1 \\ 1 & 2 \end{bmatrix}$, $\by = (1, 2, 2)$, $\lambda = 1$, compute $\bw$ by hand and enter it.`,
      solution: [
        md`(a) \`A = X.T @ X + lam * np.eye(d)\` and \`w = np.linalg.solve(A, X.T @ y)\`.`,
        md`(b) $X\T X$ costs about $Nd^2$ multiply-adds, $X\T\by$ about $Nd$, and the solve about $\tfrac23 d^3$ (a Cholesky factorization would halve that, since the matrix is symmetric positive definite). For $N \gg d$ the first product dominates.`,
        md`(c) $X\T X = \begin{bmatrix} 3 & 3 \\ 3 & 5 \end{bmatrix}$, so $A = \begin{bmatrix} 4 & 3 \\ 3 & 6 \end{bmatrix}$, and $X\T\by = (5, 6)$.`,
        md`Eliminate: $R_2 \leftarrow R_2 - \tfrac34R_1$ gives $\left(0, \tfrac{15}{4} \mid \tfrac94\right)$, so $w_2 = 0.6$. Then $4w_1 + 1.8 = 5$, $w_1 = 0.8$.`,
      ],
      answer: { kind: 'vector', value: [0.8, 0.6] },
      rubric: [md`Uses \`solve\` (or a Cholesky solve), not \`inv\``, md`Correct costs with the dominant term identified`, md`Correct $X\T X + \lambda I$ and $X\T\by$`, md`Correct solution`],
      areas: ['math', 'ml-coding'],
    },
  ],
};
