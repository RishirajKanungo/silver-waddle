import { md, type Module } from '../types';

export const MODULE: Module = {
  id: 'llm01',
  part: 'llm',
  order: 1,
  title: 'Attention and the transformer',
  summary: 'Scaled dot-product attention, multi-head attention, positional encodings and RoPE, the pre-norm decoder block, and how to count its parameters, FLOPs and memory.',
  relevance: md`Every current large language model is a stack of decoder blocks built from the attention and MLP layers in this module. Interviews for ML roles routinely ask you to write attention in NumPy, explain the $\sqrt{d_k}$ scaling, give the shapes in multi-head attention, and estimate parameters, training FLOPs and KV-cache memory for a given configuration. The same arithmetic decides which GPU a model fits on and how long a training run takes.`,
  areas: ['llm', 'ml-depth', 'ml-coding'],
  lessons: [
    // ------------------------------------------------------------------ 1.1
    {
      id: 'llm01-1',
      title: 'Scaled dot-product attention',
      minutes: 35,
      objectives: [
        'Write attention as softmax(QKᵀ/√d_k)V and give the shape of every matrix in it.',
        'Compute attention weights and outputs by hand for two tokens.',
        'Derive the √d_k scaling from the variance of a dot product of random vectors.',
        'Apply a causal mask and implement masked attention in vectorized NumPy.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`In the sentence *"The animal didn't cross the street because it was too tired"*, the representation of *it* should carry information about *animal*. A layer that builds each position's output as a **weighted average of the other positions**, with weights that depend on content, can do this in one step, whatever the distance between the two words. That layer is attention. The previous module on sequence models explained why it replaced recurrence: every position is processed in parallel and any two positions are one step apart.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Scaled dot-product attention',
          md: md`Stack the $n$ input vectors of a sequence as the rows of $X \in \R^{n\times d}$. Three learned matrices give queries, keys and values: $$Q = XW_Q,\quad K = XW_K,\quad V = XW_V,\qquad W_Q, W_K \in \R^{d\times d_k},\ W_V \in \R^{d\times d_v}.$$ Then $$\operatorname{Attention}(Q, K, V) = \softmax\!\left(\frac{QK\T}{\sqrt{d_k}}\right)V,$$ where the softmax acts on each **row** separately. Shapes: $QK\T$ and the weight matrix $A$ are $n\times n$; the output is $n\times d_v$.`,
        },
        {
          kind: 'text',
          md: md`Read the formula one row at a time. For query position $i$:

1. **Scores.** $s_{ij} = \bq_i\cdot\bk_j / \sqrt{d_k}$ for every key position $j$. A large score means key $j$ matches what query $i$ is looking for.
2. **Weights.** $a_{ij} = \dfrac{e^{s_{ij}}}{\sum_{j'} e^{s_{ij'}}}$. The weights are positive and sum to 1 over $j$.
3. **Output.** $\bo_i = \sum_j a_{ij}\bv_j$, a weighted average of the value vectors.

Because the weights are positive and sum to 1, $\bo_i$ always lies inside the convex hull of the values. The same input vector plays three roles through three different projections: what it asks for ($\bq$), what it advertises ($\bk$) and what it hands over when selected ($\bv$).`,
        },
        {
          kind: 'callout',
          tone: 'intuition',
          md: md`Attention is a soft dictionary lookup. The query is compared with every key, and the result is a blend of all the values, weighted by how well each key matches.`,
        },
        {
          kind: 'viz',
          viz: { type: 'llm.qk2d', q: [1, 0.5] },
          task: md`Drag $\bq$ toward $\bk_1$ and outward until $w_1 > 0.9$: the output $\bo$ moves close to $\bv_1$. Then drag $\bq$ back to the origin. What do the weights become, and where does $\bo$ land?`,
          caption: md`At $\bq = \bzero$ every score is 0, so every weight is $1/3$ and $\bo$ is the centroid of the values. Lengthening $\bq$ multiplies all scores by the same factor, which sharpens the softmax without changing which key wins.`,
        },
        {
          kind: 'check',
          q: md`Every key vector is identical: $\bk_1 = \bk_2 = \dots = \bk_n$. What are the attention weights of any query?`,
          options: [md`$1/n$ for every key`, md`1 for the first key, 0 for the rest`, md`They depend on the query's length`, md`They are undefined`],
          answer: 0,
          explain: md`All scores $\bq\cdot\bk_j/\sqrt{d_k}$ are equal, and the softmax of equal numbers is uniform, whatever the query. The output is then the plain average of the values.`,
        },
        {
          kind: 'callout',
          tone: 'example',
          title: 'Attention by hand, two tokens',
          md: md`Take $d_k = 4$ (so $\sqrt{d_k} = 2$), $$Q = \begin{bmatrix} 1 & 1 & 0 & 0 \\ 0 & 1 & 2 & 0 \end{bmatrix},\quad K = \begin{bmatrix} 1 & 1 & 0 & 0 \\ 0 & 0 & 1 & 0 \end{bmatrix},\quad V = \begin{bmatrix} 2 & 0 \\ 0 & 4 \end{bmatrix}.$$ Scores: $QK\T = \begin{bmatrix} 2 & 0 \\ 1 & 2 \end{bmatrix}$, divided by 2: $S = \begin{bmatrix} 1 & 0 \\ 0.5 & 1 \end{bmatrix}$.

Row 1: $\softmax(1, 0) = \left(\frac{e}{e + 1}, \frac{1}{e + 1}\right) = (0.731, 0.269)$, so $\bo_1 = 0.731\,(2, 0) + 0.269\,(0, 4) = (1.462, 1.076)$.`,
        },
        {
          kind: 'numeric',
          q: md`Finish the example: compute the weights of row 2, $\softmax(0.5, 1)$, and then the output $\bo_2$. Enter $\bo_2$.`,
          answer: { kind: 'vector', value: [0.755, 2.49], tol: 5e-3 },
          hints: [md`$\softmax(0.5, 1) = \left(\frac{1}{1 + e^{0.5}}, \frac{e^{0.5}}{1 + e^{0.5}}\right)$ and $e^{0.5} \approx 1.649$.`],
          explain: md`The weights are $(1/2.649,\ 1.649/2.649) = (0.378, 0.622)$, so $\bo_2 = 0.378\,(2, 0) + 0.622\,(0, 4) = (0.755, 2.490)$.`,
        },
        {
          kind: 'text',
          md: md`### Why divide by $\sqrt{d_k}$

Scores feed a softmax, and the softmax is sensitive to scale: $\softmax(10\,\bs)$ is far more peaked than $\softmax(\bs)$. If query and key entries have unit variance at initialization, the raw dot product $\bq\cdot\bk$ has a spread that grows with the dimension. With $d_k = 128$ its standard deviation is about $11.3$, so one score typically exceeds the others by tens of units and the softmax is close to one-hot. A one-hot softmax has almost zero gradient, which stalls learning in exactly the layer that has to learn where to look.`,
        },
        {
          kind: 'derive',
          title: 'the variance of a dot product',
          goal: md`Let $q_1, \dots, q_{d}, k_1, \dots, k_{d}$ be independent with mean 0 and variance 1. Show that $\Var(\bq\cdot\bk) = d$, and conclude that $\bq\cdot\bk/\sqrt d$ has variance 1.`,
          steps: [
            { md: md`Write $\bq\cdot\bk = \sum_{i=1}^{d} q_ik_i$. Each term has mean $\E[q_ik_i] = \E[q_i]\,\E[k_i] = 0$ by independence.` },
            {
              md: md`Its variance is $\Var(q_ik_i) = \E[q_i^2k_i^2] - (\E[q_ik_i])^2 = \E[q_i^2]\,\E[k_i^2] - 0 = 1\cdot 1 = 1$.`,
              choose: {
                prompt: md`How do you compute $\Var(q_ik_i)$?`,
                options: [md`$\E[(q_ik_i)^2] - (\E[q_ik_i])^2$, then split $\E[q_i^2k_i^2]$ using independence`, md`$\Var(q_i)\Var(k_i) + 1$`, md`$\Var(q_i) + \Var(k_i) = 2$`],
                answer: 0,
                explain: md`Start from the definition of variance. Independence lets $\E[q_i^2k_i^2]$ factor into $\E[q_i^2]\E[k_i^2]$, and $\E[q_i^2] = \Var(q_i) = 1$ because the mean is 0. Adding variances applies to sums, and this is a product.`,
              },
            },
            {
              md: md`The $d$ terms are independent of each other, so their variances add: $\Var(\bq\cdot\bk) = \sum_i \Var(q_ik_i) = d$. The standard deviation is $\sqrt d$.`,
              choose: {
                prompt: md`What lets you add the variances of the $d$ terms?`,
                options: [md`The terms are independent (uncorrelated is enough)`, md`Each term has mean 0`, md`Variance is always additive`],
                answer: 0,
                explain: md`$\Var(\sum X_i) = \sum\Var(X_i) + \sum_{i\ne j}\Cov(X_i, X_j)$, and the covariances vanish for independent terms. Variance is not additive for correlated terms.`,
              },
            },
            { md: md`Scaling a random variable by $c$ scales its variance by $c^2$: $\Var(\bq\cdot\bk/\sqrt d) = d/d = 1$, whatever $d$ is.` },
          ],
          takeaway: md`Dividing by $\sqrt{d_k}$ keeps the scores at unit scale, so the softmax starts in a regime with useful gradients regardless of the head dimension. Training can still make the scores larger where that helps.`,
        },
        {
          kind: 'viz',
          viz: { type: 'llm.sqrtd', logd: 9, scaled: false },
          task: md`At $d = 512$ with scaling off, read the mean largest weight over 16 keys. Switch scaling on. Then move $d$ from 2 to 1024 with scaling on and check that the histogram keeps its width.`,
          caption: md`Unscaled, the scores spread out like $\sqrt d$ and the softmax is nearly one-hot (largest weight close to 1). Scaled, the spread stays at 1 and the weights stay spread over several keys.`,
        },
        {
          kind: 'check',
          q: md`Softmax weights $\ba = \softmax(\bs)$ have Jacobian $\partial \ba/\partial \bs = \diag(\ba) - \ba\ba\T$. What happens to it as $\ba$ approaches a one-hot vector?`,
          options: [md`It approaches the zero matrix, so gradients through the softmax vanish`, md`It approaches the identity matrix`, md`It blows up`, md`It does not depend on $\ba$`],
          answer: 0,
          explain: md`For $\ba = \be_1$: $\diag(\be_1) - \be_1\be_1\T = 0$. Every entry has the form $a_i(\delta_{ij} - a_j)$, which is 0 when each $a_i$ is 0 or 1. Saturated attention passes almost no gradient back to the scores.`,
        },
        {
          kind: 'text',
          md: md`### Causal masking

A language model is trained to predict token $t+1$ from tokens $1, \dots, t$, at every position of a sequence at once. If position $i$ could attend to position $i + 1$, it would simply read the answer. A **causal mask** sets the scores of all future positions to $-\infty$ before the softmax, so they get weight $e^{-\infty} = 0$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Causal (masked) attention',
          md: md`$$A = \softmax\!\left(\frac{QK\T}{\sqrt{d_k}} + M\right),\qquad M_{ij} = \begin{cases} 0 & j \le i \\ -\infty & j > i. \end{cases}$$ Row $i$ of $A$ is nonzero only in columns $1, \dots, i$: the weight matrix is lower triangular.`,
        },
        {
          kind: 'viz',
          viz: { type: 'llm.attention', query: 2 },
          task: md`Select the query **sat**. With the mask off, its weight is split between *cat* and *mat*. Turn the causal mask on and see where the weight from *mat* goes. Then set $c = 0$ and $c = 4$ and compare the entropy readout.`,
          caption: md`A toy example with hand-chosen 4-dimensional queries and keys. With the mask on, a future key gets weight exactly 0 and the remaining weights are renormalized. $c = 0$ gives a uniform average over the visible keys; large $c$ approaches a hard argmax.`,
        },
        {
          kind: 'check',
          q: md`With a causal mask, what is the first row of $A$?`,
          options: [md`$(1, 0, \dots, 0)$ for every input`, md`Uniform, $1/n$ in every column`, md`It depends on $\bq_1$ and $\bk_1$`, md`All zeros`],
          answer: 0,
          explain: md`Position 1 can see only itself. A softmax over a single finite score gives weight 1, so $\bo_1 = \bv_1$ always.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'llm01-1-paper',
            title: 'Attention ignores order',
            type: 'proof',
            difficulty: 2,
            minutes: 10,
            statement: md`Let $P$ be an $n\times n$ permutation matrix, so $PX$ reorders the rows of $X$. Show that self-attention **without** a mask satisfies $$\operatorname{Attn}(PX) = P\,\operatorname{Attn}(X),\qquad \operatorname{Attn}(X) = \softmax\!\big(XW_Q(XW_K)\T/\sqrt{d_k}\big)XW_V.$$ What does this imply about the need for positional information?`,
            hints: [md`Permutation matrices satisfy $P\T P = I$. A row-wise softmax commutes with reordering rows and with reordering columns: $\softmax(PSP\T) = P\softmax(S)P\T$.`],
            solution: [
              md`With input $PX$: $Q' = PXW_Q = PQ$, $K' = PK$, $V' = PV$.`,
              md`Scores: $Q'K'^{\top}/\sqrt{d_k} = PQK\T P\T/\sqrt{d_k} = PSP\T$. Multiplying by $P$ on the left reorders rows; by $P\T$ on the right reorders columns.`,
              md`The row-wise softmax treats each row separately and is unchanged by reordering the entries within a row, so $\softmax(PSP\T) = P\,\softmax(S)\,P\T = PAP\T$.`,
              md`Output: $PAP\T \cdot PV = PA(P\T P)V = PAV = P\operatorname{Attn}(X)$.`,
              md`So reordering the input only reorders the output: the layer cannot tell *dog bites man* from *man bites dog* except by which row is which. Positional information must be injected separately (lesson 1.2).`,
            ],
            rubric: [md`Shows that $Q, K, V$ each pick up a left factor $P$`, md`Shows the scores become $PSP\T$ and justifies that the row-wise softmax commutes with it`, md`Uses $P\T P = I$ to finish`, md`States the consequence: positions must be encoded explicitly`],
            areas: ['llm', 'ml-depth'],
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

def softmax(S):
    S = S - S.max(axis=-1, keepdims=True)   # stability; the result is unchanged
    E = np.exp(S)
    return E / E.sum(axis=-1, keepdims=True)

x = np.array([1., 2., 3.])
print(np.round(softmax(10 * x), 3))`,
          predict: {
            q: md`\`softmax(x)\` is about \`[0.09 0.245 0.665]\`. What does \`softmax(10 * x)\` print, rounded to 3 decimals?`,
            options: ['`[0. 0. 1.]`', '`[0.09  0.245 0.665]`', '`[0.333 0.333 0.333]`', '`[0.9 2.45 6.65]`'],
            answer: 0,
            explain: md`Multiplying scores by 10 is a temperature of $0.1$. The gaps become 10 and 20, and $e^{-10} \approx 4.5\times 10^{-5}$, so after rounding the result is one-hot. This is what unscaled scores in high dimension do.`,
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

def softmax(S):
    S = S - S.max(axis=-1, keepdims=True)
    E = np.exp(S)
    return E / E.sum(axis=-1, keepdims=True)

Q = np.array([[1., 1, 0, 0], [0, 1, 2, 0]])
K = np.array([[1., 1, 0, 0], [0, 0, 1, 0]])
V = np.array([[2., 0], [0, 4]])
S = Q @ K.T / np.sqrt(K.shape[1])
A = softmax(S)
print(np.round(A, 4))
print(np.round(A @ V, 4))`,
          note: md`The worked example in code. All rows are handled by one matrix product: this is why attention maps well onto GPUs.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'llm01-1-ex',
            title: 'Causal attention, vectorized',
            prompt: md`Complete \`causal_attention(Q, K, V)\` for $Q, K \in \R^{n\times d_k}$ and $V \in \R^{n\times d_v}$. Mask every score with $j > i$ to $-\infty$, take a numerically stable row-wise softmax, and return $AV$. No Python loops.`,
            starter: `import numpy as np

np.random.seed(0)
Q = np.random.randn(5, 4)
K = np.random.randn(5, 4)
V = np.random.randn(5, 3)

def causal_attention(Q, K, V):
    n, d_k = Q.shape
    S = Q @ K.T / np.sqrt(d_k)
    # TODO: mask j > i with -inf, softmax each row, return A @ V
    return S @ V
`,
            solution: `import numpy as np

np.random.seed(0)
Q = np.random.randn(5, 4)
K = np.random.randn(5, 4)
V = np.random.randn(5, 3)

def causal_attention(Q, K, V):
    n, d_k = Q.shape
    S = Q @ K.T / np.sqrt(d_k)
    mask = np.triu(np.ones((n, n), dtype=bool), k=1)
    S = np.where(mask, -np.inf, S)
    S = S - S.max(axis=1, keepdims=True)
    A = np.exp(S)
    A = A / A.sum(axis=1, keepdims=True)
    return A @ V
`,
            tests: [
              { expr: 'causal_attention(Q, K, V).shape', label: 'output shape' },
              { expr: 'np.round(causal_attention(Q, K, V)[0] - V[0], 6).tolist()', label: 'position 0 sees only itself' },
              { expr: 'np.round(causal_attention(Q, K, V), 6).tolist()', label: 'values' },
            ],
            hints: [
              md`\`np.triu(np.ones((n, n), dtype=bool), k=1)\` is \`True\` exactly above the diagonal, where $j > i$.`,
              md`\`np.where(mask, -np.inf, S)\` applies the mask. Subtract the row maximum before \`np.exp\`; the diagonal entry is always finite, so every row has a finite maximum.`,
            ],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'recall',
          prompt: md`Write the attention formula with the causal mask, the shape of each of $Q, K, V, A$ and the output for a sequence of $n$ tokens, and the reason for the $\sqrt{d_k}$.`,
          answer: md`$\softmax(QK\T/\sqrt{d_k} + M)V$ with $M_{ij} = -\infty$ for $j > i$. $Q, K$: $n\times d_k$; $V$: $n\times d_v$; $A$: $n\times n$, rows summing to 1; output $n\times d_v$. With unit-variance entries $\Var(\bq\cdot\bk) = d_k$; dividing by $\sqrt{d_k}$ restores unit variance so the softmax does not saturate.`,
        },
        {
          kind: 'explain',
          prompt: md`An interviewer says: *walk me through self-attention.* Give the explanation you would give in about a minute.`,
          model: md`Each token's vector is projected three ways: a query (what it is looking for), a key (what it offers to be matched on) and a value (what it passes on). For a given token, I take the dot product of its query with every key, divide by $\sqrt{d_k}$ so the scores have unit variance and the softmax does not saturate, and softmax over positions to get weights that sum to 1. The output is the weighted average of the value vectors. In matrix form it is $\softmax(QK\T/\sqrt{d_k})V$, computed for all positions at once. In a decoder a causal mask sets future scores to $-\infty$ so position $i$ only uses positions up to $i$. The cost is $O(n^2 d)$ because every pair of positions is scored. In practice it runs as several heads in parallel, followed by an output projection.`,
        },
      ],
      cards: [
        { id: 'llm01-1-c1', kind: 'concept', front: md`Write scaled dot-product attention and the shapes for $n$ tokens.`, back: md`$\softmax(QK\T/\sqrt{d_k})V$, softmax over each row. $Q, K \in \R^{n\times d_k}$, $V \in \R^{n\times d_v}$, weights $n\times n$, output $n\times d_v$.` },
        { id: 'llm01-1-c2', kind: 'cloze', text: md`If $\bq, \bk \in \R^{64}$ have independent mean-zero, unit-variance entries, $\Var(\bq\cdot\bk)$ equals {{}}.`, answers: ['64'] },
        { id: 'llm01-1-c3', kind: 'compute', front: md`Attention weights for scores $(1, 0)$ (already scaled). Enter the first weight.`, answer: { kind: 'number', value: Math.E / (Math.E + 1), tol: 5e-3 }, back: md`$e/(e + 1) \approx 0.731$.` },
        { id: 'llm01-1-c4', kind: 'concept', front: md`What does a causal mask do and why is it needed in training?`, back: md`It sets scores for $j > i$ to $-\infty$ so their weights are 0. Training predicts every next token in parallel; without the mask position $i$ could read token $i + 1$, the answer.` },
        { id: 'llm01-1-c5', kind: 'concept', front: md`Why is saturated (near one-hot) attention bad for training?`, back: md`The softmax Jacobian $\diag(\ba) - \ba\ba\T$ goes to zero, so almost no gradient reaches the scores and the queries and keys stop learning.` },
      ],
    },
    // ------------------------------------------------------------------ 1.2
    {
      id: 'llm01-2',
      title: 'The transformer block',
      minutes: 35,
      objectives: [
        'Split d_model into h heads with reshape and transpose, and give every intermediate shape.',
        'Explain why attention needs positional information and how sinusoidal encodings and RoPE provide it.',
        'Show that RoPE makes the query–key score depend only on the relative position.',
        'Draw a pre-norm decoder block (RMSNorm, attention, SwiGLU MLP, residual adds) and say what each part does.',
        'Distinguish encoder-only, decoder-only and encoder–decoder transformers.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`One attention operation gives each query a single weighted average. A token may need several things at once: its verb's subject, the previous token, the matching open bracket. **Multi-head attention** runs $h$ attention operations side by side on lower-dimensional projections, then combines them. With $d_h = d/h$ per head, the total work and parameter count stay the same as one head of width $d$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Multi-head attention',
          md: md`For heads $i = 1, \dots, h$ with $W_Q^{(i)}, W_K^{(i)}, W_V^{(i)} \in \R^{d\times d_h}$: $$\operatorname{head}_i = \operatorname{Attention}(XW_Q^{(i)}, XW_K^{(i)}, XW_V^{(i)}),\qquad \operatorname{MHA}(X) = [\operatorname{head}_1, \dots, \operatorname{head}_h]\,W_O,$$ with $W_O \in \R^{d\times d}$. In code the $h$ projections are one $d\times d$ matrix $W_Q$; its output columns are split into $h$ groups of $d_h$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'llm.heads', d: 16, h: 4 },
          task: md`Click head 2 and find its columns in $Q$. Switch between $h = 1, 2, 4, 8$ and watch the shapes table: which shapes change and which stay fixed? Does the parameter count change?`,
          caption: md`The split is a free reshape: head $i$ owns columns $(i-1)d_h$ to $id_h - 1$. The transpose moves the head axis next to the batch axis so that one batched matrix product computes all heads.`,
        },
        {
          kind: 'text',
          md: md`The shapes, for batch $B$, sequence length $n$, width $d$, $h$ heads of width $d_h = d/h$:

| step | operation | shape |
|---|---|---|
| input | $X$ | $(B, n, d)$ |
| project | $XW_Q$ (same for $K, V$) | $(B, n, d)$ |
| split heads | \`reshape(B, n, h, d_h)\` | $(B, n, h, d_h)$ |
| heads first | \`transpose(0, 2, 1, 3)\` | $(B, h, n, d_h)$ |
| scores | $Q_hK_h\T/\sqrt{d_h}$ | $(B, h, n, n)$ |
| weighted sum | $A_hV_h$ | $(B, h, n, d_h)$ |
| merge heads | transpose back, \`reshape(B, n, d)\` | $(B, n, d)$ |
| output | $\cdot\, W_O$ | $(B, n, d)$ |`,
        },
        {
          kind: 'code',
          code: `import numpy as np

B, n, d, h = 2, 6, 64, 4
d_h = d // h
np.random.seed(0)
Q = np.random.randn(B, n, d)
Qh = Q.reshape(B, n, h, d_h).transpose(0, 2, 1, 3)
print(Qh.shape)`,
          predict: {
            q: md`What shape does this print?`,
            options: ['`(2, 4, 6, 16)`', '`(2, 6, 4, 16)`', '`(2, 4, 16, 6)`', '`(8, 6, 16)`'],
            answer: 0,
            explain: md`The reshape gives $(B, n, h, d_h) = (2, 6, 4, 16)$; the transpose swaps axes 1 and 2, giving $(B, h, n, d_h)$.`,
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

B, n, d, h = 2, 6, 64, 4
d_h = d // h
np.random.seed(0)
Q = np.random.randn(B, n, d)
K = np.random.randn(B, n, d)
split = lambda M: M.reshape(B, n, h, d_h).transpose(0, 2, 1, 3)
Qh, Kh = split(Q), split(K)
S = Qh @ Kh.transpose(0, 1, 3, 2) / np.sqrt(d_h)
print("scores:", S.shape)
merged = Qh.transpose(0, 2, 1, 3).reshape(B, n, d)
print("round trip exact:", np.array_equal(merged, Q))
print("head 0 = columns 0..15:", np.array_equal(Qh[:, 0], Q[:, :, :16]))`,
          note: md`\`@\` on 4-D arrays multiplies the last two axes and batches over the first two, so all $B\cdot h$ score matrices come from one call.`,
        },
        {
          kind: 'check',
          q: md`Going from 1 head of width $d$ to $h$ heads of width $d/h$ changes the number of attention parameters by a factor of`,
          options: [md`1 (no change)`, md`$h$`, md`$1/h$`, md`$h^2$`],
          answer: 0,
          explain: md`$W_Q, W_K, W_V, W_O$ are $d\times d$ in both cases: $4d^2$ parameters. The score computation costs $h\cdot n^2 d_h = n^2 d$ multiply-adds either way. What changes is that $h$ separate softmaxes can attend to $h$ different places.`,
        },
        {
          kind: 'text',
          md: md`### Positional information

The paper problem in lesson 1.1 showed that attention without a mask is **permutation-equivariant**: shuffle the tokens and the outputs are shuffled the same way. A causal mask breaks the symmetry only partly. To use word order, the model needs position injected explicitly. Three schemes matter:

- **Learned absolute embeddings**: a trainable vector per position, added to the token embedding (GPT-2 style). They cannot extend past the trained length.
- **Sinusoidal encodings** (original Transformer): a fixed vector per position, added to the token embedding.
- **Rotary position embeddings (RoPE)**: rotate queries and keys by an angle proportional to their position, in every layer. RoPE is the common choice in current open decoder-only LLMs.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Sinusoidal encoding',
          md: md`For position $p$ and pair index $i = 0, \dots, d/2 - 1$: $$PE_{p,\,2i} = \sin(p\,\omega_i),\qquad PE_{p,\,2i+1} = \cos(p\,\omega_i),\qquad \omega_i = 10000^{-2i/d}.$$ Each coordinate pair moves around a circle at its own frequency, from one turn every $2\pi$ positions down to very slow turns. Moving $k$ positions rotates every pair by $k\omega_i$, a fixed linear map that depends only on $k$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Rotary position embedding (RoPE)',
          md: md`Split a query or key vector of a head into $d_h/2$ coordinate pairs. At position $m$, rotate pair $i$ by the angle $m\theta_i$, with $\theta_i = 10000^{-2i/d_h}$ commonly: $$\begin{bmatrix} x'_{2i} \\ x'_{2i+1} \end{bmatrix} = \begin{bmatrix} \cos m\theta_i & -\sin m\theta_i \\ \sin m\theta_i & \cos m\theta_i \end{bmatrix}\begin{bmatrix} x_{2i} \\ x_{2i+1} \end{bmatrix}.$$ Apply it to $\bq$ and $\bk$ (not $\bv$) after the projections, in every attention layer.`,
        },
        {
          kind: 'viz',
          viz: { type: 'llm.rope', m: 3, n: 1, theta: 0.3 },
          task: md`Note the rotated dot product. Press **both +1** several times: the arrows turn but the dot product stays fixed. Now change only $m$. Finally drag $\bq$ and check that the last two readout rows always agree.`,
          caption: md`One coordinate pair of one head. Rotations preserve lengths, and the angle between the rotated vectors changes only when $m - n$ changes, so the score sees relative position.`,
        },
        {
          kind: 'derive',
          title: 'RoPE scores depend only on m − n',
          goal: md`Let $R_\alpha$ be rotation by angle $\alpha$. Show $(R_{m\theta}\bq)\cdot(R_{n\theta}\bk) = \bq\T R_{(n-m)\theta}\,\bk$.`,
          steps: [
            { md: md`Write the dot product as a matrix product: $(R_{m\theta}\bq)\T(R_{n\theta}\bk) = \bq\T R_{m\theta}\T R_{n\theta}\,\bk$.` },
            {
              md: md`A rotation matrix is orthogonal, and its inverse rotates backwards: $R_{m\theta}\T = R_{m\theta}^{-1} = R_{-m\theta}$.`,
              choose: {
                prompt: md`What is $R_{m\theta}\T$?`,
                options: [md`$R_{-m\theta}$, because rotations are orthogonal`, md`$R_{m\theta}$, because rotations are symmetric`, md`$-R_{m\theta}$`],
                answer: 0,
                explain: md`For any orthogonal matrix $R\T R = I$, so $R\T = R^{-1}$, and undoing a rotation by $m\theta$ is rotating by $-m\theta$. A rotation matrix is not symmetric unless the angle is a multiple of $\pi$.`,
              },
            },
            { md: md`Rotations in the plane compose by adding angles: $R_{-m\theta}R_{n\theta} = R_{(n-m)\theta}$. Hence the score is $\bq\T R_{(n-m)\theta}\bk$.` },
            { md: md`The full vector is a block-diagonal stack of such $2\times 2$ rotations, one per pair, and the dot product is a sum over pairs, so the same holds for the whole head.` },
          ],
          takeaway: md`Absolute positions enter, yet the attention score depends on $\bq$, $\bk$ and the offset $n - m$ only. Low-frequency pairs (small $\theta_i$) carry long-range offsets; high-frequency pairs carry fine local ones.`,
        },
        {
          kind: 'numeric',
          q: md`One pair with $\theta = \pi/3$, $\bq = (1, 0)$ at position $m = 3$ and $\bk = (2, 0)$ at position $n = 1$. Compute $(R_{m\theta}\bq)\cdot(R_{n\theta}\bk)$.`,
          answer: { kind: 'number', value: -1 },
          hints: [md`Use the result above: $\bq\T R_{(n-m)\theta}\bk$ with $(n - m)\theta = -2\pi/3$.`],
          explain: md`$R_{-2\pi/3}(2, 0) = (2\cos(-2\pi/3),\ 2\sin(-2\pi/3)) = (-1, -\sqrt3)$, and its dot product with $(1, 0)$ is $-1$. Directly: $\bq$ ends at angle $\pi$, $\bk$ at angle $\pi/3$, $2\pi/3$ apart, so the score is $1\cdot 2\cdot\cos(2\pi/3) = -1$.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

def rope(x, pos, base=10000.0):
    d = x.shape[-1]
    theta = base ** (-np.arange(0, d, 2) / d)    # one frequency per pair
    c, s = np.cos(pos * theta), np.sin(pos * theta)
    out = np.empty_like(x)
    out[0::2] = x[0::2] * c - x[1::2] * s
    out[1::2] = x[0::2] * s + x[1::2] * c
    return out

np.random.seed(1)
q, k = np.random.randn(8), np.random.randn(8)
print(round(float(rope(q, 5) @ rope(k, 2)), 6))
print(round(float(rope(q, 105) @ rope(k, 102)), 6))
print(round(float(rope(q, 5) @ rope(k, 9)), 6))
print(np.isclose(np.linalg.norm(rope(q, 7)), np.linalg.norm(q)))`,
          note: md`The first two scores have the same offset (3) and agree. The third has offset $-4$ and differs. The last line checks that rotation preserves length.`,
        },
        {
          kind: 'text',
          md: md`### The pre-norm decoder block

A decoder-only model is an embedding layer, $L$ identical blocks, a final normalization and an unembedding to vocabulary logits. Each block updates a **residual stream** $\bx$ (one $d$-vector per position) with two sublayers:

$$\bx \leftarrow \bx + \operatorname{MHA}(\operatorname{RMSNorm}(\bx)),\qquad \bx \leftarrow \bx + \operatorname{MLP}(\operatorname{RMSNorm}(\bx)).$$

- **RMSNorm** (from the normalization module) rescales each vector to unit root-mean-square and multiplies by a learned gain.
- **Attention** is the only part that moves information between positions.
- **The MLP** acts on each position separately. Current models commonly use **SwiGLU**: $W_2\big(\operatorname{SiLU}(W_1\bu)\odot W_3\bu\big)$ with $W_1, W_3 \in \R^{d_{ff}\times d}$, $W_2 \in \R^{d\times d_{ff}}$ and $d_{ff} \approx \tfrac83 d$, so its three matrices hold about $8d^2$ parameters, the same as a classic two-matrix MLP with $d_{ff} = 4d$.

The original Transformer was **post-norm**: $\bx \leftarrow \operatorname{Norm}(\bx + \operatorname{Sublayer}(\bx))$. Pre-norm leaves an unnormalized identity path from the embeddings to the output, which, as the residual-connections module showed, keeps gradients well scaled through deep stacks and makes training less sensitive to warmup.`,
        },
        {
          kind: 'viz',
          viz: { type: 'llm.block' },
          task: md`Step through the block. At which steps is the residual stream itself modified? At which step can information move from one position to another?`,
          caption: md`Only the two additions write to the stream. The norms produce copies that the sublayers read. Attention (step 3) is the only cross-position operation.`,
        },
        {
          kind: 'check',
          q: md`In a pre-norm transformer, which statement is true?`,
          options: [
            md`The residual stream is normalized only by the final norm before the unembedding; inside the stack, sublayers read normalized copies.`,
            md`Every addition is followed by a normalization of the stream.`,
            md`The MLP mixes information across positions.`,
            md`RMSNorm subtracts the mean of the vector before rescaling.`,
          ],
          answer: 0,
          explain: md`Pre-norm normalizes the sublayer input and leaves the stream as it is. Post-norm normalizes after the add. The MLP is position-wise. RMSNorm, unlike LayerNorm, does not subtract the mean.`,
        },
        {
          kind: 'text',
          md: md`### Three architectures

| | attention | trained to | typical use |
|---|---|---|---|
| encoder-only (BERT) | bidirectional, no mask | fill in masked tokens | classification, embeddings for retrieval |
| decoder-only (GPT-style LLMs) | causal | predict the next token | text generation; current LLMs |
| encoder–decoder (original Transformer, T5) | encoder bidirectional; decoder causal plus **cross-attention** | generate output given input | translation, summarization |

In cross-attention the queries come from the decoder's stream and the keys and values from the encoder's final outputs.`,
        },
        {
          kind: 'check',
          q: md`In the cross-attention layer of an encoder–decoder model, where do $Q$, $K$ and $V$ come from?`,
          options: [md`$Q$ from the decoder; $K$ and $V$ from the encoder output`, md`$Q$ from the encoder; $K$ and $V$ from the decoder`, md`All three from the encoder`, md`All three from the decoder, with a causal mask`],
          answer: 0,
          explain: md`Each decoder position asks a question (query) of the whole encoded input (keys and values). No causal mask is needed there: the whole input is available.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'llm01-2-paper',
            title: 'Sizing a SwiGLU MLP',
            type: 'compute',
            difficulty: 1,
            minutes: 6,
            statement: md`A model has $d = 4096$. Its SwiGLU MLP uses $d_{ff} = \tfrac83 d$ rounded **up** to a multiple of 256. (a) Find $d_{ff}$. (b) Count the MLP's parameters (no biases) and compare with a classic $4\times$ MLP ($d_{ff} = 4d$, two matrices). Enter the SwiGLU count.`,
            solution: [
              md`(a) $\tfrac83\cdot 4096 = 10922.67$. Multiples of 256 near it: $42\cdot 256 = 10752$ and $43\cdot 256 = 11008$. Rounding up gives $d_{ff} = 11008$.`,
              md`(b) SwiGLU has three matrices of size $d\times d_{ff}$: $3\cdot 4096\cdot 11008 = 135{,}266{,}304$.`,
              md`Classic MLP: $2\cdot d\cdot 4d = 8\cdot 4096^2 = 134{,}217{,}728$. The two differ by under 1%: the $\tfrac83$ factor was chosen so that adding the gate matrix $W_3$ keeps the parameter count roughly constant.`,
            ],
            answer: { kind: 'number', value: 135266304 },
            areas: ['llm'],
          },
        },
        {
          kind: 'recall',
          prompt: md`List the operations of one pre-norm decoder block in order, and say which one mixes positions and which ones write to the residual stream.`,
          answer: md`RMSNorm → multi-head causal attention (with RoPE on $\bq, \bk$) → add to stream → RMSNorm → SwiGLU MLP → add to stream. Attention mixes positions. The two additions write to the stream.`,
        },
        {
          kind: 'explain',
          prompt: md`Why does RoPE rotate queries and keys but not values?`,
          model: md`Position should influence *where* a token attends, which is decided by the scores $\bq\cdot\bk$. Rotating $\bq$ by its position and $\bk$ by its position makes each score depend on the relative offset, which is the property we want. The values are what gets averaged once the weights are fixed; rotating them would make the content passed along depend on absolute position, so the same word would deliver differently rotated information at different places in the sequence, with no benefit to the scores.`,
        },
      ],
      cards: [
        { id: 'llm01-2-c1', kind: 'concept', front: md`Shapes when splitting $Q$ of shape $(B, n, d)$ into $h$ heads.`, back: md`\`reshape(B, n, h, d_h)\` then \`transpose(0, 2, 1, 3)\` gives $(B, h, n, d_h)$; scores are $(B, h, n, n)$; merge back to $(B, n, d)$.` },
        { id: 'llm01-2-c2', kind: 'cloze', text: md`RoPE rotates the query and the key by their positions, but leaves the {{}} vector unrotated.`, answers: ['value'] },
        { id: 'llm01-2-c3', kind: 'concept', front: md`Pre-norm versus post-norm.`, back: md`Pre-norm: $\bx + F(\operatorname{Norm}(\bx))$, an identity path through the whole stack; current LLMs use it with RMSNorm. Post-norm: $\operatorname{Norm}(\bx + F(\bx))$, the original Transformer; harder to train deep.` },
        { id: 'llm01-2-c4', kind: 'compute', front: md`SwiGLU MLP with $d = 3072$ and $d_{ff} = 8192$: parameters in millions?`, answer: { kind: 'number', value: 75.497472, tol: 1e-3 }, back: md`$3\cdot 3072\cdot 8192 = 75{,}497{,}472 \approx 75.5$ M.` },
        { id: 'llm01-2-c5', kind: 'concept', front: md`Encoder-only, decoder-only, encoder–decoder: one use each.`, back: md`Encoder-only (bidirectional): classification and embeddings. Decoder-only (causal): generation, current LLMs. Encoder–decoder (cross-attention): translation and summarization.` },
      ],
    },
    // ------------------------------------------------------------------ 1.3
    {
      id: 'llm01-3',
      title: 'Counting parameters, FLOPs and memory',
      minutes: 35,
      objectives: [
        'Count the parameters of a transformer layer (about 12d²) and of a whole model including embeddings.',
        'Estimate FLOPs per token (about 2N forward, 6N for training) and total training compute 6ND.',
        'State the time and memory cost of attention in n and d, and say what FlashAttention changes and what it does not.',
        'Compute the KV-cache size of MHA, GQA and MQA configurations.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Before training or serving a model you need three estimates: how many parameters it has (memory for weights), how many floating-point operations it costs per token (time and money), and how much memory its activations and caches take. Each comes from a short formula in $d$, $L$, $n$ and the vocabulary size $V$, and interviewers expect you to derive them on a whiteboard.`,
        },
        {
          kind: 'derive',
          title: 'parameters per layer',
          goal: md`Count the weights of one standard transformer layer with width $d$, multi-head attention and a $4\times$ MLP, ignoring biases and norm gains.`,
          steps: [
            { md: md`Attention has four $d\times d$ matrices, $W_Q, W_K, W_V, W_O$: $4d^2$. The number of heads does not matter, as the previous lesson showed.` },
            {
              md: md`The MLP maps $d \to 4d \to d$ with two matrices: $d\cdot 4d + 4d\cdot d = 8d^2$.`,
              choose: {
                prompt: md`How many parameters does the $d \to 4d \to d$ MLP have?`,
                options: [md`$8d^2$`, md`$4d^2$`, md`$16d^2$`, md`$5d^2$`],
                answer: 0,
                explain: md`Two matrices, each with $4d^2$ entries. SwiGLU with $d_{ff} \approx \tfrac83 d$ has three matrices of $\tfrac83 d^2$ each, also about $8d^2$.`,
              },
            },
            { md: md`Two norm gain vectors add $2d$, negligible next to $d^2$ terms. Total per layer: $12d^2$.` },
            { md: md`For the whole model: $N \approx 12Ld^2 + Vd$ with tied input and output embeddings, or $12Ld^2 + 2Vd$ untied. Grouped-query attention shrinks $W_K, W_V$ (below), and the rule becomes an upper bound.` },
          ],
          takeaway: md`Two thirds of a layer's parameters are in the MLP. At small $d$ the embedding term $Vd$ can be a large share of the total; at large $d$ the $12Ld^2$ term dominates.`,
        },
        {
          kind: 'numeric',
          q: md`A model has $d = 768$, $L = 12$, $V = 50{,}257$ and tied embeddings. Estimate its parameter count with $12Ld^2 + Vd$. Enter it in millions.`,
          answer: { kind: 'number', value: 123.532032, tol: 5e-3 },
          explain: md`$12\cdot 12\cdot 768^2 = 84.93$ M and $50257\cdot 768 = 38.60$ M, total $123.5$ M. This is the GPT-2 small configuration, published as 124 M; the rest is position embeddings, biases and norms. Here a third of the parameters are the embedding table.`,
        },
        {
          kind: 'text',
          md: md`### FLOPs per token

Multiplying a $k$-vector by a $k\times m$ matrix takes $km$ multiplications and about $km$ additions: $2km$ FLOPs, two per weight. Every weight in a transformer is used once per token in such a product, so

$$\text{forward FLOPs per token} \approx 2N + 2LTd,$$

where $N$ counts the weights used in matrix products (the input embedding is a table lookup, so it is excluded) and the second term is attention itself: a token at position $t$ does $2td$ FLOPs for its scores and $2td$ for the weighted sum in each layer, and the average over a causal sequence of length $T$ is $2Td$ per layer.

The backward pass costs about twice the forward pass, so **training costs about $6N$ FLOPs per token**, and a run over $D$ tokens costs $$C \approx 6ND.$$`,
        },
        {
          kind: 'derive',
          title: 'why backward is twice forward',
          goal: md`For a linear layer $Y = XW$ with $X \in \R^{b\times k}$, $W \in \R^{k\times m}$, compare the FLOPs of the forward and backward passes.`,
          steps: [
            { md: md`Forward: $Y = XW$ costs $2bkm$ FLOPs.` },
            {
              md: md`Backward needs two products. The gradient for the layer below is $\partial\mathcal L/\partial X = (\partial\mathcal L/\partial Y)\,W\T$, which is $(b\times m)(m\times k)$: $2bkm$ FLOPs.`,
              choose: {
                prompt: md`Backpropagation through $Y = XW$ needs which gradients?`,
                options: [md`Both $\partial\mathcal L/\partial X$ (to continue backward) and $\partial\mathcal L/\partial W$ (to update the weights)`, md`Only $\partial\mathcal L/\partial W$`, md`Only $\partial\mathcal L/\partial X$`],
                answer: 0,
                explain: md`The weight gradient is what the optimizer uses; the input gradient is what the previous layer needs. Each is one matrix product of the same size as the forward one.`,
              },
            },
            { md: md`The weight gradient is $\partial\mathcal L/\partial W = X\T(\partial\mathcal L/\partial Y)$, $(k\times b)(b\times m)$: another $2bkm$.` },
            { md: md`Backward $= 4bkm = 2\times$ forward. Per token ($b = 1$) and per weight: $2 + 4 = 6$ FLOPs.` },
          ],
          takeaway: md`$C \approx 6ND$ is the standard estimate of training compute. Recomputing activations to save memory (activation checkpointing) adds roughly one more forward pass, about $8ND$.`,
        },
        {
          kind: 'numeric',
          q: md`Illustrative numbers: a 7-billion-parameter model trained on 2 trillion tokens. Estimate the training compute in FLOPs.`,
          answer: { kind: 'number', value: 8.4e22, tol: 1e-3 },
          inputHint: 'e.g. 1.5e21',
          explain: md`$C \approx 6ND = 6\cdot 7\times 10^9\cdot 2\times 10^{12} = 8.4\times 10^{22}$ FLOPs.`,
        },
        {
          kind: 'text',
          md: md`### The cost of attention

For a sequence of $n$ tokens, $QK\T$ is $n\times n$ per head: computing it and the weighted sum takes $O(n^2 d)$ time per layer, and a direct implementation stores the $n\times n$ scores, $O(n^2)$ memory per head. At $n = 32{,}768$ one head's scores in 16-bit floats take $32768^2\cdot 2$ bytes $= 2$ GiB.

GPUs have small, fast on-chip memory (SRAM) and large, slower high-bandwidth memory (HBM). A naive implementation writes $S$ to HBM, reads it for the softmax, writes $A$, reads it again for $AV$. For typical head sizes that traffic, not the arithmetic, limits the speed.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'FlashAttention',
          md: md`An exact attention algorithm that is **IO-aware**: it loads blocks of $Q$, $K$ and $V$ into on-chip memory, computes scores for one block at a time, and combines blocks with an **online softmax** that keeps, per query, a running maximum $m$, a running normalizer $\ell$ and an unnormalized output. The $n\times n$ matrix is never written to HBM.

- Same result as standard attention, up to floating-point rounding: it is exact.
- Same $O(n^2 d)$ FLOPs.
- Extra memory $O(n)$ instead of $O(n^2)$, and much less HBM traffic, so it runs faster.
- The backward pass recomputes the scores block by block from $Q$, $K$ and the saved $m, \ell$ instead of storing $A$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'llm.flash', tile: 2 },
          task: md`Step through the tiles. When the running maximum jumps (tile 3), what happens to the old $\ell$ and $o$? Check that $o/\ell$ at the end equals the exact value. Switch to tile size 4 and confirm the result is identical.`,
          caption: md`Rescaling by $e^{m_{\text{old}} - m_{\text{new}}}$ converts sums computed with the old maximum into sums with the new one, so nothing has to be recomputed. Any tile size gives the same answer.`,
        },
        {
          kind: 'check',
          q: md`Which statement about FlashAttention is correct?`,
          options: [
            md`It computes exact attention with $O(n^2d)$ FLOPs but without storing the $n\times n$ matrix in HBM.`,
            md`It reduces attention to $O(n\log n)$ FLOPs.`,
            md`It approximates the softmax with a low-rank kernel.`,
            md`It only speeds up inference, not training.`,
          ],
          answer: 0,
          explain: md`The speed-up comes from reduced memory traffic; the operation count is unchanged. Sparse or linear-attention methods change the math, while FlashAttention computes the same function. It is used in both training and inference.`,
        },
        {
          kind: 'text',
          md: md`### MHA, MQA and GQA

During generation the model stores every past token's keys and values (the **KV cache**, treated fully in the inference module of this part). Its size per token is

$$2\cdot L\cdot n_{kv}\cdot d_h\cdot \text{bytes per number},$$

with the 2 for keys and values and $n_{kv}$ the number of key/value heads.

- **Multi-head attention (MHA)**: $n_{kv} = h$, every query head has its own keys and values.
- **Multi-query attention (MQA)**: $n_{kv} = 1$, all query heads share one key/value head.
- **Grouped-query attention (GQA)**: $1 < n_{kv} < h$, each group of $h/n_{kv}$ query heads shares one key/value head.

GQA cuts the cache (and the $W_K, W_V$ parameters) by a factor $h/n_{kv}$ while keeping quality close to MHA. It is widely used in current models.`,
        },
        {
          kind: 'viz',
          viz: { type: 'llm.calc' },
          task: md`Start from the default configuration. Move **KV heads** to 32 (MHA), then 8, then 1, and read the KV-cache row. Then set the context to 32k and batch to 16. Finally switch the MLP to 4× and compare the per-layer count with the $12d^2$ rule.`,
          caption: md`An illustrative 7B-class configuration. The KV cache grows linearly in context and batch and can exceed the weights; the naive score matrix grows quadratically in context.`,
        },
        {
          kind: 'numeric',
          q: md`$L = 32$ layers, $n_{kv} = 8$ KV heads of size $d_h = 128$, 16-bit numbers, one sequence of $T = 8192$ tokens. How big is the KV cache, in GiB ($2^{30}$ bytes)?`,
          answer: { kind: 'number', value: 1 },
          explain: md`$2\cdot 32\cdot 8\cdot 128\cdot 2 = 131{,}072$ bytes per token $= 128$ KiB. Times $8192 = 2^{13}$ tokens: $2^{17}\cdot 2^{13} = 2^{30}$ bytes $= 1$ GiB. With MHA ($n_{kv} = 32$) it would be 4 GiB.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'llm01-3-paper',
            title: 'A 1B-class model on paper',
            type: 'compute',
            difficulty: 2,
            minutes: 10,
            statement: md`A decoder has $d = 2048$, $L = 24$, $4\times$ MLP, MHA, $V = 32{,}000$ and tied embeddings.

(a) Estimate the parameter count.
(b) Estimate forward FLOPs per token, ignoring the attention term.
(c) Estimate the compute to train it on 25 billion tokens.

Enter (a).`,
            solution: [
              md`(a) $12Ld^2 = 12\cdot 24\cdot 2048^2 = 1{,}207{,}959{,}552$. Embeddings $Vd = 32000\cdot 2048 = 65{,}536{,}000$. Total $N \approx 1.273\times 10^9$.`,
              md`(b) Forward $\approx 2N \approx 2.55\times 10^9$ FLOPs per token (the tied matrix is used once, as the unembedding).`,
              md`(c) $C \approx 6ND = 6\cdot 1.273\times 10^9\cdot 2.5\times 10^{10} \approx 1.9\times 10^{20}$ FLOPs.`,
            ],
            answer: { kind: 'number', value: 1273495552, tol: 1e-2 },
            areas: ['llm', 'system-design'],
          },
        },
        {
          kind: 'code',
          code: `def transformer_params(d, L, V, n_heads, n_kv, d_ff, swiglu=True, tied=False):
    d_h = d // n_heads
    attn = 2 * d * d + 2 * d * n_kv * d_h      # W_Q, W_O and the smaller W_K, W_V
    mlp = (3 if swiglu else 2) * d * d_ff
    emb = V * d * (1 if tied else 2)
    return L * (attn + mlp + 2 * d) + emb + d  # + two norm gains per layer, final norm

n = transformer_params(d=768, L=12, V=50257, n_heads=12, n_kv=12, d_ff=3072, swiglu=False, tied=True)
print(f"{n / 1e6:.1f}M")`,
          predict: {
            q: md`This is the GPT-2 small shape (without position embeddings and biases). What is printed?`,
            options: ['`123.6M`', '`84.9M`', '`162.2M`', '`124.0M`'],
            answer: 0,
            explain: md`$84{,}934{,}656$ in the layers, $18{,}432$ in norm gains, $38{,}597{,}376$ in the tied embedding and $768$ in the final norm: $123{,}551{,}232$, printed as 123.6M.`,
          },
        },
        {
          kind: 'code',
          code: `for name, n_kv in [("MHA", 32), ("GQA", 8), ("MQA", 1)]:
    b = 2 * 32 * n_kv * 128 * 8192 * 2      # 2 (K,V) * L * n_kv * d_h * T * bytes
    print(name, b / 2**30, "GiB")`,
          note: md`Change \`8192\` to \`131072\` (128k context) and multiply by a batch of 8: the MHA cache alone becomes 512 GiB.`,
        },
        {
          kind: 'recall',
          prompt: md`Give the formulas for: parameters per layer; forward and training FLOPs per token; training compute; KV-cache bytes per token.`,
          answer: md`$\approx 12d^2$ per layer ($4d^2$ attention, $8d^2$ MLP), plus $Vd$ or $2Vd$ for embeddings. Forward $\approx 2N$ (+ $2LTd$ for attention), training $\approx 6N$ per token, $C \approx 6ND$. KV cache $2\cdot L\cdot n_{kv}\cdot d_h\cdot$ bytes per token.`,
        },
        {
          kind: 'explain',
          prompt: md`You increase the context length from 4k to 32k tokens with the same model. What happens to the parameter count, the KV-cache size, the attention FLOPs and the MLP FLOPs per token?`,
          model: md`Parameters do not change: no weight depends on sequence length (RoPE has no learned parameters). The KV cache grows linearly, $8\times$, because it stores keys and values for every past token. MLP and projection FLOPs per token do not change: each token passes through the same matrices. Attention FLOPs per token grow linearly in context ($2LTd$), so for the whole sequence attention grows quadratically, $64\times$, and its share of total compute rises from $T/(12d + T)$ at 4k to much more at 32k. Naive attention memory would grow $64\times$; with FlashAttention it grows linearly.`,
        },
      ],
      cards: [
        { id: 'llm01-3-c1', kind: 'cloze', text: md`A standard transformer layer has about {{}} $d^2$ parameters.`, answers: ['12'] },
        { id: 'llm01-3-c2', kind: 'concept', front: md`Training compute estimate and where the 6 comes from.`, back: md`$C \approx 6ND$: 2 FLOPs per weight per token forward, 4 backward (input gradient and weight gradient).` },
        { id: 'llm01-3-c3', kind: 'compute', front: md`KV cache bytes per token for $L = 32$, $n_{kv} = 8$, $d_h = 128$, 16-bit. Answer in KiB.`, answer: { kind: 'number', value: 128 }, back: md`$2\cdot 32\cdot 8\cdot 128\cdot 2 = 131072$ bytes $= 128$ KiB.` },
        { id: 'llm01-3-c4', kind: 'concept', front: md`What does FlashAttention change, and what not?`, back: md`Changes: memory traffic and extra memory ($O(n)$, scores never written to HBM), so it is faster. Unchanged: the exact result and the $O(n^2d)$ FLOPs.` },
        { id: 'llm01-3-c5', kind: 'concept', front: md`MHA vs MQA vs GQA.`, back: md`Number of key/value heads: $h$ (MHA), 1 (MQA), $1 < n_{kv} < h$ (GQA). KV cache and $W_K, W_V$ shrink by $h/n_{kv}$; GQA keeps quality close to MHA.` },
      ],
    },
  ],
  problems: [
    {
      id: 'llm01-p1',
      title: 'Derive the √d_k scaling',
      type: 'derive',
      difficulty: 2,
      minutes: 10,
      statement: md`Queries and keys have independent entries with mean 0 and variance $\sigma^2$. (a) Compute $\E[\bq\cdot\bk]$ and $\Var(\bq\cdot\bk)$ for $\bq, \bk \in \R^{d_k}$. (b) What constant $c$ makes $\Var(c\,\bq\cdot\bk) = 1$? (c) Explain what goes wrong in the softmax if the scores are left unscaled and $d_k$ is large.`,
      hints: [md`$\Var(q_ik_i) = \E[q_i^2]\E[k_i^2]$ when the mean is zero and the factors are independent.`],
      solution: [
        md`(a) $\E[q_ik_i] = \E[q_i]\E[k_i] = 0$, so $\E[\bq\cdot\bk] = 0$. $\Var(q_ik_i) = \E[q_i^2]\E[k_i^2] = \sigma^4$.`,
        md`The $d_k$ terms are independent, so variances add: $\Var(\bq\cdot\bk) = d_k\sigma^4$.`,
        md`(b) $\Var(c\,\bq\cdot\bk) = c^2 d_k\sigma^4 = 1$ gives $c = 1/(\sigma^2\sqrt{d_k})$. With $\sigma = 1$ this is the $1/\sqrt{d_k}$ in the attention formula.`,
        md`(c) Unscaled scores have standard deviation $\sqrt{d_k}$, about 11 for $d_k = 128$. Gaps between scores of several units make the softmax nearly one-hot, its Jacobian $\diag(\ba) - \ba\ba\T$ nearly zero, and the gradient to $W_Q$, $W_K$ nearly vanishes.`,
      ],
      rubric: [md`Zero mean and per-term variance $\sigma^4$ with independence used explicitly`, md`Variance of the sum $d_k\sigma^4$ with the reason (independence)`, md`Correct constant`, md`Saturation argument via the softmax gradient`],
      areas: ['llm', 'ml-depth', 'math'],
    },
    {
      id: 'llm01-p2',
      title: 'Attention by hand with a mask',
      type: 'compute',
      difficulty: 1,
      minutes: 8,
      statement: md`Two tokens with $d_k = 1$: $\bq_1 = 1$, $\bq_2 = 2$, $\bk_1 = 1$, $\bk_2 = -1$, $\bv_1 = 4$, $\bv_2 = 0$ (all scalars). Compute the attention output for both positions (a) without a mask and (b) with a causal mask. Enter the outputs for (a) as $[o_1, o_2]$.`,
      solution: [
        md`Scores $s_{ij} = q_ik_j$ (here $\sqrt{d_k} = 1$): row 1 is $(1, -1)$, row 2 is $(2, -2)$.`,
        md`(a) Row 1: $\softmax(1, -1) = (e^2, 1)/(e^2 + 1) = (0.881, 0.119)$, so $o_1 = 0.881\cdot 4 = 3.523$. Row 2: $\softmax(2, -2) = (0.982, 0.018)$, so $o_2 = 0.982\cdot 4 = 3.928$.`,
        md`(b) With the mask, row 1 sees only key 1: weight 1, $o_1 = 4$. Row 2 is unchanged: $o_2 = 3.928$.`,
      ],
      answer: { kind: 'vector', value: [(4 * Math.E ** 2) / (Math.E ** 2 + 1), (4 * Math.E ** 4) / (Math.E ** 4 + 1)], tol: 5e-3 },
      areas: ['llm'],
    },
    {
      id: 'llm01-p3',
      title: 'Softmax is shift-invariant',
      type: 'proof',
      difficulty: 1,
      minutes: 6,
      statement: md`Prove that $\softmax(\bs + c\mathbf{1}) = \softmax(\bs)$ for any constant $c$. Use it to explain why implementations subtract $\max_j s_j$ before exponentiating, and why the online softmax in FlashAttention can change the subtracted constant halfway through.`,
      solution: [
        md`$\softmax(\bs + c\mathbf{1})_i = \dfrac{e^{s_i + c}}{\sum_j e^{s_j + c}} = \dfrac{e^c e^{s_i}}{e^c\sum_j e^{s_j}} = \softmax(\bs)_i$.`,
        md`Choosing $c = -\max_j s_j$ makes every exponent $\le 0$, so no $e^{s}$ overflows, and the largest term is $e^0 = 1$, so the denominator is at least 1 and never underflows to 0.`,
        md`In the online softmax, partial sums computed with one maximum $m_{\text{old}}$ are converted to a new maximum by multiplying by $e^{m_{\text{old}} - m_{\text{new}}}$. Shift invariance guarantees the final normalized result does not depend on which constants were used along the way.`,
      ],
      rubric: [md`Factor $e^c$ cancels, shown explicitly`, md`Overflow and underflow argument for subtracting the max`, md`Connects the rescaling factor in the online softmax to shift invariance`],
      areas: ['llm', 'ml-coding'],
    },
    {
      id: 'llm01-p4',
      title: 'Parameter count of a GQA model',
      type: 'compute',
      difficulty: 2,
      minutes: 10,
      statement: md`A model has $d = 4096$, $L = 32$, $h = 32$ query heads of $d_h = 128$, $n_{kv} = 8$ key/value heads, a SwiGLU MLP with $d_{ff} = 14336$, $V = 128{,}000$ and **untied** embeddings. Count the parameters, ignoring norm gains. Enter the total in billions.`,
      hints: [md`Attention: $W_Q$ and $W_O$ are $d\times d$; $W_K$ and $W_V$ are $d\times n_{kv}d_h$.`],
      solution: [
        md`Attention per layer: $2d^2 + 2d\,n_{kv}d_h = 2\cdot 4096^2 + 2\cdot 4096\cdot 1024 = 33{,}554{,}432 + 8{,}388{,}608 = 41{,}943{,}040$.`,
        md`MLP per layer: $3\,d\,d_{ff} = 3\cdot 4096\cdot 14336 = 176{,}160{,}768$.`,
        md`Per layer: $218{,}103{,}808$. Times 32 layers: $6{,}979{,}321{,}856$.`,
        md`Embeddings, untied: $2Vd = 2\cdot 128000\cdot 4096 = 1{,}048{,}576{,}000$.`,
        md`Total $\approx 8.028\times 10^9$, about 8.0 B. Note how much the large vocabulary contributes: about 13%.`,
      ],
      answer: { kind: 'number', value: 8.027897856, tol: 2e-3 },
      areas: ['llm', 'system-design'],
    },
    {
      id: 'llm01-p5',
      title: 'How long does training take?',
      type: 'apply',
      difficulty: 2,
      minutes: 8,
      statement: md`Illustrative numbers: you train a $10^9$-parameter model on $2\times 10^{10}$ tokens using 64 GPUs. Each GPU has a peak of $10^{15}$ FLOP/s in 16-bit, and your run achieves 40% of peak (model FLOPs utilization). Estimate the wall-clock time in hours.`,
      solution: [
        md`Compute: $C \approx 6ND = 6\cdot 10^9\cdot 2\times 10^{10} = 1.2\times 10^{20}$ FLOPs.`,
        md`Achieved throughput: $64\cdot 0.4\cdot 10^{15} = 2.56\times 10^{16}$ FLOP/s.`,
        md`Time: $1.2\times 10^{20}/2.56\times 10^{16} = 4687.5$ s $\approx 1.30$ hours.`,
      ],
      answer: { kind: 'number', value: 1.3020833, tol: 1e-2 },
      areas: ['llm', 'system-design'],
    },
    {
      id: 'llm01-p6',
      title: 'KV cache: MHA versus GQA',
      type: 'compute',
      difficulty: 1,
      minutes: 6,
      statement: md`$L = 40$, $h = 40$ heads of $d_h = 128$, 16-bit cache, batch of 8 sequences of 4096 tokens. (a) KV-cache size with MHA, in GiB. (b) With GQA using $n_{kv} = 8$. Enter (a).`,
      solution: [
        md`Per token, MHA: $2\cdot 40\cdot 40\cdot 128\cdot 2 = 819{,}200$ bytes $= 800$ KiB.`,
        md`Tokens: $8\cdot 4096 = 32{,}768$. Total: $819200\cdot 32768 = 26{,}843{,}545{,}600$ bytes $= 25$ GiB.`,
        md`(b) GQA divides by $h/n_{kv} = 5$: 5 GiB.`,
      ],
      answer: { kind: 'number', value: 25 },
      areas: ['llm', 'system-design'],
    },
    {
      id: 'llm01-p7',
      title: 'RoPE preserves relative position',
      type: 'proof',
      difficulty: 2,
      minutes: 10,
      statement: md`Let $R_\alpha = \begin{bmatrix}\cos\alpha & -\sin\alpha \\ \sin\alpha & \cos\alpha\end{bmatrix}$. (a) Show $R_\alpha\T R_\beta = R_{\beta - \alpha}$ using trigonometric identities. (b) Conclude that for RoPE with block-diagonal rotations $\mathcal R_m = \diag(R_{m\theta_0}, \dots, R_{m\theta_{d/2-1}})$, the score $(\mathcal R_m\bq)\cdot(\mathcal R_n\bk)$ is unchanged when both $m$ and $n$ are increased by the same integer.`,
      solution: [
        md`(a) $R_\alpha\T = \begin{bmatrix}\cos\alpha & \sin\alpha \\ -\sin\alpha & \cos\alpha\end{bmatrix}$. The $(1,1)$ entry of $R_\alpha\T R_\beta$ is $\cos\alpha\cos\beta + \sin\alpha\sin\beta = \cos(\beta - \alpha)$.`,
        md`The $(2,1)$ entry is $-\sin\alpha\cos\beta + \cos\alpha\sin\beta = \sin(\beta - \alpha)$; the other two entries follow the same way, giving $R_{\beta-\alpha}$.`,
        md`(b) $(\mathcal R_m\bq)\T(\mathcal R_n\bk) = \bq\T\mathcal R_m\T\mathcal R_n\bk$. Block-diagonal matrices multiply block by block, so $\mathcal R_m\T\mathcal R_n = \diag(R_{(n-m)\theta_i}) = \mathcal R_{n-m}$.`,
        md`Replacing $(m, n)$ by $(m + s, n + s)$ leaves $n - m$, and therefore the score, unchanged.`,
      ],
      rubric: [md`Correct transpose of a rotation`, md`Angle-difference identities applied entry by entry`, md`Block-diagonal argument for the full vector`, md`Explicit conclusion about shifting both positions`],
      areas: ['llm', 'math'],
    },
    {
      id: 'llm01-p8',
      title: 'Multi-head attention on paper',
      type: 'code-on-paper',
      difficulty: 2,
      minutes: 10,
      statement: md`Write NumPy code (on paper) that takes $X$ of shape $(B, n, d)$ and weight matrices \`Wq, Wk, Wv, Wo\` of shape $(d, d)$, and returns causal multi-head attention with $h$ heads. Give the shape after every line. For $B = 8$, $h = 16$, $n = 512$, $d = 1024$, what is the shape of the score tensor? Enter it as a list.`,
      solution: [
        md`\`q = (X @ Wq).reshape(B, n, h, d // h).transpose(0, 2, 1, 3)\`: $(B, h, n, d_h)$; the same for \`k\` and \`v\`.`,
        md`\`S = q @ k.transpose(0, 1, 3, 2) / np.sqrt(d // h)\`: $(B, h, n, n)$. Apply the mask: \`S = np.where(np.triu(np.ones((n, n), bool), 1), -np.inf, S)\` (broadcasts over $B, h$).`,
        md`Softmax over the last axis (subtract the max, exponentiate, normalize): \`A\` is $(B, h, n, n)$. \`O = A @ v\`: $(B, h, n, d_h)$.`,
        md`Merge: \`O.transpose(0, 2, 1, 3).reshape(B, n, d) @ Wo\`: $(B, n, d)$.`,
        md`For the given sizes the score tensor is $(8, 16, 512, 512)$, about 33.6 million numbers per layer.`,
      ],
      answer: { kind: 'vector', value: [8, 16, 512, 512] },
      areas: ['ml-coding', 'llm'],
    },
    {
      id: 'llm01-p9',
      title: 'When do the scores stop fitting?',
      type: 'apply',
      difficulty: 2,
      minutes: 6,
      statement: md`A naive attention kernel materializes the scores of all heads of one layer at once in 16-bit floats. With batch 1, $h = 32$ and context $n = 16{,}384$, how many GiB does that take? What would FlashAttention need instead, in order of magnitude?`,
      solution: [
        md`Entries: $h\cdot n^2 = 32\cdot 16384^2 = 2^5\cdot 2^{28} = 2^{33}$.`,
        md`Bytes: $2^{33}\cdot 2 = 2^{34}$ bytes $= 16$ GiB, for one layer, before the backward pass stores anything.`,
        md`FlashAttention keeps only per-query statistics ($m$, $\ell$) and the output: $O(hn)$ extra numbers, about $32\cdot 16384\cdot 2 \approx 10^6$, a few MiB.`,
      ],
      answer: { kind: 'number', value: 16 },
      areas: ['llm', 'system-design'],
    },
    {
      id: 'llm01-p10',
      title: 'What share of compute is attention?',
      type: 'derive',
      difficulty: 3,
      minutes: 10,
      statement: md`Use forward FLOPs per token $\approx 2N + 2LTd$ with $N \approx 12Ld^2$ (ignore embeddings). (a) Show that the fraction of forward FLOPs spent in the attention score and weighted-sum computations is $\dfrac{T}{12d + T}$. (b) Evaluate it for $d = 4096$, $T = 8192$. (c) At what context length does attention account for half the FLOPs? Enter (b).`,
      solution: [
        md`(a) Fraction $= \dfrac{2LTd}{2\cdot 12Ld^2 + 2LTd} = \dfrac{2Ld\cdot T}{2Ld\,(12d + T)} = \dfrac{T}{12d + T}$. The number of layers cancels.`,
        md`(b) $\dfrac{8192}{12\cdot 4096 + 8192} = \dfrac{8192}{57344} = \dfrac17 \approx 0.143$.`,
        md`(c) Half when $T = 12d$: $T = 49{,}152$ tokens for $d = 4096$. Below that, the matrix products with the weights dominate.`,
      ],
      answer: { kind: 'number', value: 1 / 7, tol: 1e-3 },
      rubric: [md`Correct ratio with $L$ and one factor $d$ cancelled`, md`Correct evaluation`, md`Break-even condition $T = 12d$`],
      areas: ['llm', 'ml-depth'],
    },
  ],
};
