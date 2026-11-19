import { md, type Module } from '../types';

export const MODULE: Module = {
  id: 'llm02',
  part: 'llm',
  order: 2,
  title: 'Training large language models',
  summary: 'Tokenization with BPE, the next-token objective and perplexity, scaling laws and compute-optimal training, mixture-of-experts, parallelism and memory, and post-training with SFT, LoRA, RLHF and DPO.',
  relevance: md`Training decisions are made with the arithmetic in this module: how many tokens a model of a given size should see, whether it fits in GPU memory under a given sharding scheme, and how many parameters a LoRA adapter adds. Fine-tuning with LoRA or QLoRA and aligning with DPO are routine tasks for ML engineers working with open-weight models. Interviews ask you to explain BPE, perplexity, Chinchilla scaling, ZeRO, LoRA, and the difference between RLHF and DPO, and to evaluate a model without fooling yourself.`,
  prereqs: ['llm01'],
  areas: ['llm', 'ml-depth', 'system-design'],
  lessons: [
    // ------------------------------------------------------------------ 2.1
    {
      id: 'llm02-1',
      title: 'Tokenization and the next-token objective',
      minutes: 30,
      objectives: [
        'Run BPE merges by hand on a small corpus and tokenize a new word with the learned merges.',
        'State the tradeoffs in choosing a vocabulary size.',
        'Write the next-token cross-entropy loss and convert between loss and perplexity.',
        'Explain teacher forcing and why one forward pass gives a loss at every position.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A model reads integers. A **tokenizer** maps text to a sequence of ids from a fixed vocabulary, and back. The choice of unit matters:

- **Characters or bytes**: a tiny vocabulary and no unknown symbols, but long sequences, and attention cost grows with sequence length.
- **Words**: short sequences, but a huge vocabulary, and any word not seen in training is unknown.
- **Subwords**: frequent words stay whole, rare words split into frequent pieces (*token* + *ization*).

**Byte-pair encoding (BPE)** builds a subword vocabulary from data. It was adapted from compression to neural machine translation, and a byte-level variant, which starts from the 256 possible bytes so that every string can be encoded, is used by GPT-2 and many later models.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'BPE training and encoding',
          md: md`**Training.** Split each word of the corpus into symbols (characters or bytes, optionally with an end-of-word marker). Then repeat until the vocabulary has the target size:

1. Count every adjacent symbol pair, weighting each word by its frequency.
2. Merge the most frequent pair into one new symbol everywhere, and record the merge rule.

**Encoding new text.** Split it into the base symbols and apply the recorded merges **in the order they were learned**.`,
        },
        {
          kind: 'viz',
          viz: { type: 'llm.bpe' },
          task: md`Step through the first three merges. Why do *es*, *est* and *est_* come first, although no word in the corpus is *est*? Continue to the end: which whole words have become single tokens?`,
          caption: md`*newest* (6) and *widest* (3) share the ending, so $e+s$ already has count 9. At step 1 three pairs tie at 9 and the first one seen wins. After ten merges *newest_* and *low_* are single tokens and *widest* is split into frequent pieces.`,
        },
        {
          kind: 'numeric',
          q: md`Use the ten merges learned in the figure, in order. How many tokens does the new word *lowest* (with its end marker, \`l o w e s t _\`) become?`,
          answer: { kind: 'number', value: 2 },
          hints: [md`Apply $e+s$, then $es+t$, then $est+\_$, then $l+o$, then $lo+w$; the remaining merges do not match.`],
          explain: md`$e+s$ gives \`l o w es t _\`, then \`l o w est _\`, \`l o w est_\`, \`lo w est_\`, \`low est_\`. The merges $n+e$, $ne+w$, $new+est\_$, $low+\_$ and $w+i$ find no match, so *lowest* is \`low\` + \`est_\`: 2 tokens, although the word never appeared in the corpus.`,
        },
        {
          kind: 'text',
          md: md`### Choosing the vocabulary size

Current LLM vocabularies range from tens of thousands to a few hundred thousand tokens. The tradeoff:

- **Larger $V$**: each text becomes fewer tokens, so a fixed context window holds more text and each document costs fewer forward passes. The cost: the embedding and unembedding matrices have $Vd$ parameters each, the output softmax costs $2Vd$ FLOPs per token, and rare tokens appear too seldom to learn good embeddings.
- **Smaller $V$**: cheaper output layer, better-trained embeddings, but longer sequences.

Tokenization also shapes behaviour: digits split inconsistently make arithmetic harder, and languages underrepresented in the tokenizer's training data need more tokens per sentence, so they cost more and fit less into the context.`,
        },
        {
          kind: 'check',
          q: md`A model with $d = 2048$ switches from a 32k to a 128k vocabulary, with untied embeddings. Which statement is correct?`,
          options: [
            md`The embedding and unembedding parameters grow by about 393 M, and typical texts become somewhat fewer tokens.`,
            md`Nothing changes except the tokenizer file.`,
            md`Sequences become 4 times shorter.`,
            md`The attention layers get 4 times more parameters.`,
          ],
          answer: 0,
          explain: md`$2\cdot(128000 - 32000)\cdot 2048 = 393{,}216{,}000$ extra parameters. The compression gain from a bigger vocabulary is real but much smaller than the factor 4 in $V$. Attention weights do not depend on $V$.`,
        },
        {
          kind: 'text',
          md: md`### The objective

A language model factorizes the probability of a sequence with the chain rule, $$p_\theta(x_1, \dots, x_T) = \prod_{t=1}^{T} p_\theta(x_t \mid x_{<t}),$$ and is trained to maximize the log-likelihood of the training text, which is the same as minimizing the average **next-token cross-entropy** $$\mathcal L(\theta) = -\frac1T\sum_{t=1}^{T}\log p_\theta(x_t \mid x_{<t}).$$

**Teacher forcing.** During training the model's inputs are the true previous tokens, never its own predictions. With the causal mask from the attention module, one forward pass over \`tokens[:-1]\` produces a prediction for every next token \`tokens[1:]\` at once: a sequence of length $T + 1$ yields $T$ training signals in parallel.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Perplexity',
          md: md`$$\operatorname{PPL} = \exp(\mathcal L) = \exp\!\Big(-\frac1T\sum_t \log p_\theta(x_t\mid x_{<t})\Big),$$ with the loss in nats. A perplexity of $k$ means the model is, on average, as uncertain as a uniform choice among $k$ tokens. A uniform model over $V$ tokens has loss $\ln V$ and perplexity $V$; a perfect model has perplexity 1.`,
        },
        {
          kind: 'viz',
          viz: { type: 'llm.nexttoken' },
          task: md`Set every probability to 0.5 and read the loss and perplexity. Then set them all to 0.9 except one at 0.01. Which single token dominates the average?`,
          caption: md`All $p = 0.5$ gives loss $\ln 2 \approx 0.693$ and perplexity exactly 2. One confident mistake costs $-\ln 0.01 \approx 4.6$ nats, more than the other four tokens together: the log heavily punishes assigning low probability to what actually happened.`,
        },
        {
          kind: 'numeric',
          q: md`A model's validation loss is $2.3$ nats per token. What is its perplexity?`,
          answer: { kind: 'number', value: Math.exp(2.3), tol: 1e-3 },
          explain: md`$e^{2.3} \approx 9.97$: about as uncertain as choosing among 10 equally likely tokens.`,
        },
        {
          kind: 'derive',
          title: 'cross-entropy = entropy + KL',
          goal: md`Let $p$ be the true next-token distribution in some context and $q$ the model's. Show $H(p, q) = H(p) + \KL(p\,\|\,q)$ and conclude what minimizing the training loss does.`,
          steps: [
            { md: md`By definition $H(p, q) = -\sum_x p(x)\log q(x)$. The training loss is a sample estimate of it: the data supplies $x \sim p$ and the model supplies $\log q(x)$.` },
            {
              md: md`Add and subtract $\sum_x p(x)\log p(x)$: $$H(p, q) = -\sum_x p(x)\log p(x) + \sum_x p(x)\log\frac{p(x)}{q(x)} = H(p) + \KL(p\,\|\,q).$$`,
              choose: {
                prompt: md`Which term should you add and subtract to make $H(p)$ appear?`,
                options: [md`$\sum_x p(x)\log p(x)$`, md`$\sum_x q(x)\log q(x)$`, md`$\log\sum_x p(x)q(x)$`],
                answer: 0,
                explain: md`$H(p)$ is $-\sum_x p\log p$, so that is the term to introduce. The remainder combines into $\sum p\log(p/q)$, the KL divergence.`,
              },
            },
            { md: md`$H(p)$ does not depend on the model, and $\KL \ge 0$ with equality only when $q = p$. Minimizing cross-entropy is therefore minimizing $\KL(p\,\|\,q)$; the best possible loss is the entropy of the data, and the best perplexity is $e^{H(p)}$, generally above 1.` },
          ],
          takeaway: md`Loss curves flatten toward a floor set by the inherent unpredictability of text. The irreducible term $E$ in scaling laws (lesson 2.2) plays this role.`,
        },
        {
          kind: 'check',
          q: md`Model A has perplexity 8 on a test set with tokenizer A; model B has perplexity 10 on the same text with tokenizer B. What can you conclude?`,
          options: [
            md`Nothing directly: perplexity is per token, and the two tokenizers split the text into different numbers of tokens.`,
            md`A is the better language model.`,
            md`B is the better language model, because larger perplexity means more vocabulary.`,
            md`They are equally good.`,
          ],
          answer: 0,
          explain: md`If B's tokenizer uses fewer, longer tokens, each prediction is harder but there are fewer of them. Compare the total log-likelihood of the text, for example as bits per byte: total loss in bits divided by the number of bytes.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'llm02-1-paper',
            title: 'Three BPE merges by hand',
            type: 'compute',
            difficulty: 1,
            minutes: 8,
            statement: md`A corpus has the words *hug* ×10, *pug* ×5, *pun* ×12, *bun* ×4, *hugs* ×5. Use characters as base symbols and **no** end-of-word marker. Carry out three BPE merges, writing the pair counts at each step. Which token does the third merge create?`,
            solution: [
              md`Step 1 counts: $h{+}u$: $10 + 5 = 15$; $u{+}g$: $10 + 5 + 5 = 20$; $p{+}u$: $5 + 12 = 17$; $u{+}n$: $12 + 4 = 16$; $b{+}u$: 4; $g{+}s$: 5. Merge $u+g \to ug$.`,
              md`Words now: \`h ug\`, \`p ug\`, \`p u n\`, \`b u n\`, \`h ug s\`. Counts: $h{+}ug$: 15; $p{+}ug$: 5; $p{+}u$: 12; $u{+}n$: 16; $b{+}u$: 4; $ug{+}s$: 5. Merge $u+n \to un$.`,
              md`Words: \`h ug\`, \`p ug\`, \`p un\`, \`b un\`, \`h ug s\`. Counts: $h{+}ug$: 15; $p{+}ug$: 5; $p{+}un$: 12; $b{+}un$: 4; $ug{+}s$: 5. Merge $h+ug \to hug$.`,
              md`The vocabulary is now the base characters plus *ug*, *un*, *hug*.`,
            ],
            answer: { kind: 'text', value: ['hug'] },
            areas: ['llm'],
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

tokens = np.array([5, 9, 2, 7])
inputs, targets = tokens[:-1], tokens[1:]
print(targets)`,
          predict: {
            q: md`Teacher forcing pairs each input position with the next token. What is printed?`,
            options: ['`[9 2 7]`', '`[5 9 2]`', '`[5 9 2 7]`', '`[2 7]`'],
            answer: 0,
            explain: md`The input at position 0 is token 5 and its target is token 9, and so on. Four tokens give three (input, target) pairs.`,
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

logits = np.array([[2.0, 1.0, 0.1, -1.0],     # model outputs at 3 positions, vocabulary of 4
                   [0.5, 2.5, 0.0, 0.3],
                   [1.0, 0.0, 0.0, 3.0]])
targets = np.array([0, 1, 3])
z = logits - logits.max(axis=1, keepdims=True)
logp = z - np.log(np.exp(z).sum(axis=1, keepdims=True))   # log-softmax
nll = -logp[np.arange(3), targets]
print(np.round(nll, 3))
print(round(float(nll.mean()), 3), round(float(np.exp(nll.mean())), 3))`,
          note: md`The second line prints the mean loss and the perplexity. Change a target to a token with a low logit and watch both jump.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'llm02-1-ex',
            title: 'Next-token loss from logits',
            prompt: md`\`logits\` has shape $(T, V)$: row $t$ is the model's output after reading \`tokens[:t+1]\`, so it predicts \`tokens[t+1]\`. \`tokens\` has length $T + 1$. Complete \`next_token_loss\` to return the mean negative log-likelihood in nats, using a numerically stable log-softmax and no Python loops.`,
            starter: `import numpy as np

np.random.seed(0)
V = 6
tokens = np.random.randint(0, V, size=8)
logits = np.random.randn(7, V)

def next_token_loss(logits, tokens):
    targets = tokens[1:]
    # TODO: log-softmax over the vocabulary, pick the target entries, average
    return 0.0
`,
            solution: `import numpy as np

np.random.seed(0)
V = 6
tokens = np.random.randint(0, V, size=8)
logits = np.random.randn(7, V)

def next_token_loss(logits, tokens):
    targets = tokens[1:]
    z = logits - logits.max(axis=1, keepdims=True)
    logp = z - np.log(np.exp(z).sum(axis=1, keepdims=True))
    return -logp[np.arange(len(targets)), targets].mean()
`,
            tests: [
              { expr: 'round(float(next_token_loss(logits, tokens)), 6)', label: 'loss on random logits' },
              { expr: 'round(float(next_token_loss(np.zeros((4, 10)), np.arange(5))), 6)', label: 'uniform logits give ln V' },
              { expr: 'round(float(next_token_loss(np.array([[0.0, 3.0], [3.0, 0.0]]), np.array([0, 1, 0]))), 6)', label: 'confident and correct' },
            ],
            hints: [md`Subtract the row maximum, then \`logp = z - np.log(np.exp(z).sum(axis=1, keepdims=True))\`.`, md`Fancy indexing \`logp[np.arange(T), targets]\` picks one entry per row.`],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'recall',
          prompt: md`State the BPE training loop and how BPE encodes a new word. Then give the formula linking loss and perplexity.`,
          answer: md`Training: start from base symbols; repeatedly count adjacent pairs (weighted by word frequency), merge the most frequent into a new symbol, record the rule. Encoding: split into base symbols and apply the recorded merges in learned order. $\operatorname{PPL} = e^{\mathcal L}$ with $\mathcal L$ the mean next-token loss in nats.`,
        },
        {
          kind: 'explain',
          prompt: md`What is teacher forcing, why is it used to train language models, and what is its known downside?`,
          model: md`Teacher forcing feeds the ground-truth previous tokens as inputs during training, rather than the model's own sampled outputs. With a causal mask, a single forward pass over a sequence then gives the loss for every position in parallel, which is what makes transformer pretraining efficient, and the gradient signal is clean because each prediction is conditioned on correct context. The downside is a train–test mismatch, often called exposure bias: at generation time the model conditions on its own earlier outputs, which may contain errors it never saw during training, so mistakes can compound over long generations. Post-training on the model's own samples (for example with RLHF or preference optimization) partly addresses this.`,
        },
      ],
      cards: [
        { id: 'llm02-1-c1', kind: 'concept', front: md`One BPE training step.`, back: md`Count all adjacent symbol pairs weighted by word frequency, merge the most frequent pair into a new symbol everywhere, and record the merge rule.` },
        { id: 'llm02-1-c2', kind: 'compute', front: md`Mean next-token loss $\ln 16$ nats. Perplexity?`, answer: { kind: 'number', value: 16 }, back: md`$e^{\ln 16} = 16$.` },
        { id: 'llm02-1-c3', kind: 'cloze', text: md`A uniform model over a vocabulary of $V$ tokens has perplexity {{}}.`, answers: ['V'] },
        { id: 'llm02-1-c4', kind: 'concept', front: md`Why can't you compare perplexities of models with different tokenizers?`, back: md`Perplexity is per token, and different tokenizers cut the same text into different numbers of tokens. Compare total likelihood, for example bits per byte.` },
        { id: 'llm02-1-c5', kind: 'concept', front: md`Costs and benefits of a larger vocabulary.`, back: md`Benefit: fewer tokens per text (cheaper per document, more text per context). Cost: $Vd$ parameters per embedding matrix, $2Vd$ FLOPs per token in the output layer, and rare tokens with poorly trained embeddings.` },
      ],
    },
    // ------------------------------------------------------------------ 2.2
    {
      id: 'llm02-2',
      title: 'Pretraining at scale',
      minutes: 40,
      objectives: [
        'Describe what goes into a pretraining data mixture and why deduplication and quality filtering matter.',
        'Read a scaling-law plot on log–log axes and size a compute-optimal run with C ≈ 6ND and D ≈ 20N.',
        'Explain mixture-of-experts routing and distinguish total from active parameters.',
        'Compute per-GPU memory for mixed-precision Adam under data parallelism and ZeRO stages, and say what tensor and pipeline parallelism split.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`Pretraining runs the next-token objective over trillions of tokens. The data is assembled from sources such as filtered web crawls, code, books, scientific articles, mathematics and multilingual text, then processed:

- **Deduplication**, exact and near-duplicate (for example with MinHash). Repeated documents waste compute and increase memorization.
- **Quality filtering** with heuristics (length, symbol ratios, repetition) and learned classifiers.
- **Safety and privacy filtering**, for example removing personal information.
- **Decontamination**: removing documents that overlap with evaluation benchmarks (lesson 2.3).

The **mixture weights**, how much of each source to sample, are set by small-scale experiments and strongly affect what the model is good at.`,
        },
        {
          kind: 'callout',
          tone: 'theorem',
          title: 'Scaling laws (empirical)',
          md: md`Over many orders of magnitude, the pretraining loss of well-tuned transformers is predicted by smooth power laws in the parameter count $N$ and the number of training tokens $D$. A commonly fitted form is $$L(N, D) = E + \frac{A}{N^{\alpha}} + \frac{B}{D^{\beta}},$$ with $E$ the irreducible loss (the entropy of the data) and fitted exponents $\alpha, \beta$ around 0.3. Training compute is $C \approx 6ND$.`,
        },
        {
          kind: 'text',
          md: md`A power law $y = a x^{-k}$ satisfies $\log y = \log a - k\log x$: on log–log axes it is a straight line with slope $-k$. That is why scaling plots use log axes, and why the **reducible** loss $L - E$ is plotted: the constant $E$ would bend the line.

For a fixed budget $C$ there is a tradeoff: a bigger model sees fewer tokens. The Chinchilla study (Hoffmann et al., 2022) found that $N$ and $D$ should grow in equal proportion with compute, at roughly **20 training tokens per parameter**. Earlier large models had used far fewer tokens per parameter, so they were undertrained for their size.`,
        },
        {
          kind: 'viz',
          viz: { type: 'llm.scaling', logC: 21 },
          task: md`In **loss vs compute**, each coloured curve is one model size trained for longer and longer. Find where the 1B curve leaves the dashed frontier. Then switch to **fixed compute**, move $C$, and check that the minimum of the U-shaped curve sits at $N^*$.`,
          caption: md`Each fixed-size model eventually plateaus (its $A/N^{\alpha}$ term remains); the frontier is the lower envelope of all sizes. At fixed compute, a model that is too small is limited by its size, one that is too large has seen too few tokens. Constants are illustrative.`,
        },
        {
          kind: 'derive',
          title: 'compute-optimal N and D',
          goal: md`Given a budget $C$, use $C \approx 6ND$ and the rule $D = 20N$ to express $N^*$ and $D^*$ in terms of $C$.`,
          steps: [
            { md: md`Substitute $D = 20N$ into $C = 6ND$: $C = 6N\cdot 20N = 120N^2$.` },
            {
              md: md`Solve for $N$: $N^* = \sqrt{C/120}$.`,
              choose: {
                prompt: md`$C = 120N^2$. How does the optimal model size scale with compute?`,
                options: [md`As $\sqrt C$`, md`Linearly in $C$`, md`As $\log C$`],
                answer: 0,
                explain: md`$N^* \propto C^{1/2}$, and so is $D^* = 20N^*$: a $100\times$ bigger budget buys a $10\times$ bigger model trained on $10\times$ more tokens.`,
              },
            },
            { md: md`Then $D^* = 20N^* = 20\sqrt{C/120}$. Check: $6N^*D^* = 120\,(N^*)^2 = C$.` },
          ],
          takeaway: md`Equal exponents for $N$ and $D$ is the key empirical finding; the constant 20 is a rule of thumb that depends on the data and architecture.`,
        },
        {
          kind: 'numeric',
          q: md`You have a budget of $C = 1.2\times 10^{22}$ FLOPs. What is the compute-optimal parameter count by the 20-tokens-per-parameter rule?`,
          answer: { kind: 'number', value: 1e10, tol: 1e-3 },
          inputHint: 'e.g. 3e9',
          explain: md`$N^* = \sqrt{1.2\times 10^{22}/120} = \sqrt{10^{20}} = 10^{10}$ parameters, trained on $D^* = 2\times 10^{11}$ tokens.`,
        },
        {
          kind: 'text',
          md: md`**Compute-optimal is not the whole story.** The 20:1 rule minimizes *training* compute for a target loss. A model that will serve many requests costs compute at inference in proportion to $N$, so it can pay to train a smaller model on many more tokens than 20 per parameter; the loss keeps improving, just less efficiently per training FLOP. Many open-weight models released since 2023 are trained this way, well beyond the Chinchilla ratio.`,
        },
        {
          kind: 'check',
          q: md`Why would a team train an 8B-parameter model on 15 trillion tokens, far beyond 20 tokens per parameter?`,
          options: [
            md`To get the best model they can serve at the inference cost of 8B parameters, accepting extra training compute.`,
            md`Because scaling laws stop holding beyond 20 tokens per parameter.`,
            md`Because more tokens reduce the parameter count.`,
            md`To reduce training compute.`,
          ],
          answer: 0,
          explain: md`Training cost is paid once; inference cost scales with $N$ and with usage. Loss keeps decreasing with more data at fixed $N$, so overtraining a smaller model trades training compute for cheaper serving.`,
        },
        {
          kind: 'text',
          md: md`### Mixture-of-experts

A **mixture-of-experts (MoE)** layer replaces the single MLP of a block with $E$ expert MLPs and a small **router**. For each token the router computes a probability over experts, the token is processed by its top-$k$ experts, and their outputs are summed with the router's (renormalized) weights:

$$\bp = \softmax(W_r\bu),\qquad \operatorname{MoE}(\bu) = \sum_{e \in \text{top-}k(\bp)} g_e\,\operatorname{MLP}_e(\bu).$$

- **Total parameters** grow with $E$; **active parameters** per token grow only with $k$. FLOPs per token follow the active count; memory follows the total count.
- An auxiliary **load-balancing loss** keeps the router from sending most tokens to a few experts, which would waste the others and overload some devices.
- Experts are usually spread across GPUs (expert parallelism), so routing needs all-to-all communication.`,
        },
        {
          kind: 'viz',
          viz: { type: 'llm.moe', E: 8, k: 2 },
          task: md`Click a few tokens and compare their router probabilities with the experts they are sent to. Set $k = 1$ and read the active share; then raise $E$ to 16 and watch total and active parameters.`,
          caption: md`Raising $E$ adds capacity without adding per-token compute. The load bars show how unevenly a router can spread even 8 tokens, which is what the balancing loss counteracts. Sizes are illustrative.`,
        },
        {
          kind: 'numeric',
          q: md`An MoE layer has 40 M parameters in attention (shared by all tokens) and 8 experts of 160 M parameters each, with top-2 routing. How many parameters does one token use in this layer, in millions?`,
          answer: { kind: 'number', value: 360 },
          explain: md`Active: $40 + 2\cdot 160 = 360$ M. Total: $40 + 8\cdot 160 = 1320$ M. Per-token compute is that of a 360 M layer, but all 1320 M must be held in memory.`,
        },
        {
          kind: 'text',
          md: md`### Parallelism and memory

Training with Adam in mixed precision stores, per parameter: the 16-bit weight (2 bytes), the 16-bit gradient (2), and in 32-bit the master weight, the first moment and the second moment (4 + 4 + 4). That is **16 bytes per parameter** before any activations. A 7B model needs 112 GB, more than one 80 GB accelerator.

- **Data parallelism (DP)**: every GPU holds a full replica and processes a different slice of the batch; gradients are averaged with an all-reduce.
- **ZeRO** (and PyTorch FSDP, which follows ZeRO stage 3) removes the redundancy across data-parallel GPUs by sharding: stage 1 shards the optimizer states, stage 2 also the gradients, stage 3 also the parameters, which are gathered layer by layer when needed.
- **Tensor parallelism** splits individual weight matrices across GPUs (for example the columns of $W_1$ and the rows of $W_2$ in the MLP), with communication inside every layer, so it is kept within a node with fast interconnect.
- **Pipeline parallelism** splits the layers into stages on different GPUs and streams micro-batches through them; GPUs idle during the fill and drain (the pipeline bubble).

Large runs combine all of these.`,
        },
        {
          kind: 'viz',
          viz: { type: 'llm.trainmem', N: 7, logG: 3, stage: 0 },
          task: md`With 7B parameters on 8 GPUs, step through DDP, ZeRO-1, ZeRO-2 and ZeRO-3. Which stage first fits in 80 GB? Then find the largest model that fits with ZeRO-3 on 64 GPUs.`,
          caption: md`The Adam states (12 bytes per parameter) dominate, which is why sharding them (ZeRO-1) gives the biggest single saving. Activations, which depend on batch size and sequence length, come on top of these numbers.`,
        },
        {
          kind: 'numeric',
          q: md`A 13B-parameter model is trained with ZeRO-2 on 16 GPUs. How much memory per GPU do the weights, gradients and Adam states take, in GB?`,
          answer: { kind: 'number', value: 37.375 },
          hints: [md`ZeRO-2 keeps full 16-bit weights on each GPU and shards gradients and optimizer states: $2N + (2N + 12N)/G$ bytes.`],
          explain: md`$2\cdot 13 + 14\cdot 13/16 = 26 + 11.375 = 37.375$ GB. Without sharding it would be $16\cdot 13 = 208$ GB.`,
        },
        {
          kind: 'check',
          q: md`Which form of parallelism needs the fastest interconnect between the GPUs involved?`,
          options: [md`Tensor parallelism`, md`Data parallelism`, md`Pipeline parallelism`, md`They all need the same bandwidth`],
          answer: 0,
          explain: md`Tensor parallelism exchanges activations inside every layer's matrix products, several times per layer per micro-batch. Data parallelism communicates gradients once per step (overlapped with backward), and pipeline parallelism passes activations only between stages.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'llm02-2-paper',
            title: 'Sizing a run from a GPU budget',
            type: 'apply',
            difficulty: 2,
            minutes: 10,
            statement: md`Illustrative numbers: you have 1024 GPUs for 30 days. Each delivers $10^{15}$ FLOP/s peak and you expect 40% utilization. (a) What is the total compute $C$? (b) What model size and token count are compute-optimal by the 20:1 rule? Enter $N^*$.`,
            solution: [
              md`(a) Seconds: $30\cdot 86400 = 2.592\times 10^6$. Throughput: $1024\cdot 0.4\cdot 10^{15} = 4.096\times 10^{17}$ FLOP/s. $C = 4.096\times 10^{17}\cdot 2.592\times 10^6 \approx 1.06\times 10^{24}$ FLOPs.`,
              md`(b) $N^* = \sqrt{C/120} = \sqrt{8.85\times 10^{21}} \approx 9.4\times 10^{10}$, about 94 B parameters.`,
              md`$D^* = 20N^* \approx 1.9\times 10^{12}$ tokens. Check: $6\cdot 9.4\times 10^{10}\cdot 1.88\times 10^{12} \approx 1.06\times 10^{24}$.`,
            ],
            answer: { kind: 'number', value: 94060406122.874, tol: 1e-2 },
            areas: ['llm', 'system-design'],
          },
        },
        {
          kind: 'code',
          code: `for C in [1e21, 1e22, 1e23, 1e24]:
    N = (C / 120) ** 0.5
    D = 20 * N
    print(f"C={C:.0e}  N={N:.2e}  D={D:.2e}")`,
          note: md`Every factor of 100 in compute buys a factor of 10 in both $N$ and $D$.`,
        },
        {
          kind: 'recall',
          prompt: md`Give the training-memory formula per parameter for mixed-precision Adam, and what ZeRO stages 1, 2 and 3 shard.`,
          answer: md`16 bytes: 2 (bf16 weights) + 2 (bf16 grads) + 12 (fp32 master weights, Adam $m$, Adam $v$). ZeRO-1 shards the 12 bytes of optimizer state, ZeRO-2 also the gradients, ZeRO-3 (FSDP) also the parameters, across the data-parallel GPUs.`,
        },
        {
          kind: 'explain',
          prompt: md`Explain data, tensor and pipeline parallelism, and where ZeRO fits, as you would in an interview.`,
          model: md`Data parallelism replicates the model on every GPU, splits the batch, and all-reduces gradients each step; it scales throughput but not model size. ZeRO keeps the data-parallel scheme but shards what is redundant: optimizer states (stage 1), gradients (stage 2) and parameters (stage 3, as in FSDP), gathering parameters just in time for each layer; this cuts per-GPU memory roughly by the number of GPUs at the price of more communication. Tensor parallelism splits each large matrix across GPUs so that one layer's computation is shared; it communicates inside every layer and is used within a node. Pipeline parallelism assigns consecutive layers to different GPUs and streams micro-batches through, with idle time at the start and end. Large training runs combine them, for example tensor parallel within a node, pipeline across nodes, and sharded data parallel on top.`,
        },
      ],
      cards: [
        { id: 'llm02-2-c1', kind: 'concept', front: md`Chinchilla rule of thumb and the compute formula.`, back: md`About 20 training tokens per parameter, with $C \approx 6ND$; so $N^* = \sqrt{C/120}$, $D^* = 20N^*$, both $\propto \sqrt C$.` },
        { id: 'llm02-2-c2', kind: 'cloze', text: md`Mixed-precision Adam needs about {{}} bytes per parameter before activations.`, answers: ['16'] },
        { id: 'llm02-2-c3', kind: 'compute', front: md`Compute-optimal $N$ for $C = 1.2\times 10^{24}$ FLOPs?`, answer: { kind: 'number', value: 1e11, tol: 1e-3 }, back: md`$\sqrt{1.2\times 10^{24}/120} = \sqrt{10^{22}} = 10^{11}$ (100 B), with $2\times 10^{12}$ tokens.` },
        { id: 'llm02-2-c4', kind: 'concept', front: md`MoE: total versus active parameters.`, back: md`Total $\approx$ shared + $E\cdot$expert, set by memory. Active $\approx$ shared + $k\cdot$expert, set by per-token compute. A load-balancing loss keeps routing even.` },
        { id: 'llm02-2-c5', kind: 'concept', front: md`Why train smaller models far beyond 20 tokens per parameter?`, back: md`Inference cost scales with $N$. A smaller model trained longer reaches a given quality at a lower serving cost, at the price of extra training compute.` },
      ],
    },
    // ------------------------------------------------------------------ 2.3
    {
      id: 'llm02-3',
      title: 'Post-training and evaluation',
      minutes: 40,
      objectives: [
        'Explain supervised fine-tuning and compute LoRA’s parameter savings for a layer and for a model.',
        'Describe QLoRA and its memory arithmetic.',
        'Describe RLHF: a Bradley–Terry reward model and PPO with a KL penalty to a reference policy.',
        'Write the DPO loss, derive it from the KL-regularized objective, and say what it removes from the RLHF pipeline.',
        'Name the main ways LLM evaluation goes wrong: tokenizer-dependent perplexity, contamination and LLM-as-judge biases.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A pretrained model continues documents. **Post-training** turns it into an assistant that follows instructions and matches human preferences. It usually starts with **supervised fine-tuning (SFT)** on (prompt, response) pairs written or curated for the purpose, formatted with a chat template. The loss is the same next-token cross-entropy, commonly computed only on the response tokens: the prompt is conditioning, not something to imitate.`,
        },
        {
          kind: 'check',
          q: md`In a typical SFT setup, which tokens contribute to the loss?`,
          options: [md`The response tokens; prompt tokens are masked out of the loss`, md`Only the prompt tokens`, md`Only the last token of the response`, md`None: SFT uses a reward instead of a loss`],
          answer: 0,
          explain: md`The model reads the whole sequence, but the loss is averaged over the positions whose targets are response tokens. Training on the prompt tokens too is possible, but it spends capacity on imitating user text.`,
        },
        {
          kind: 'text',
          md: md`### LoRA

Full fine-tuning updates every weight and needs optimizer state for every weight (16 bytes per parameter, lesson 2.2). **Low-rank adaptation (LoRA)** freezes the pretrained $W \in \R^{d\times k}$ and learns a low-rank update: $$\bh = W\bx + \frac{\alpha}{r}BA\bx,\qquad B \in \R^{d\times r},\ A \in \R^{r\times k},\ r \ll \min(d, k).$$ $B$ is initialized to zero, so training starts exactly at the pretrained model. After training, $W + \frac{\alpha}{r}BA$ can be merged into one matrix, so inference costs nothing extra. The bet, supported empirically, is that the change needed for adaptation has low rank: the low-rank approximation idea from the SVD module.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'LoRA parameter count',
          md: md`A full update of a $d\times k$ matrix has $dk$ parameters. LoRA has $r(d + k)$. For a square $d\times d$ matrix the ratio is $$\frac{r(d + d)}{d^2} = \frac{2r}{d}.$$`,
        },
        {
          kind: 'viz',
          viz: { type: 'llm.lora', r: 2 },
          task: md`Raise $r$ until the relative error drops below 0.1, and note how many parameters that costs at $d = k = 4096$. Then drag the spectrum decay to 1 (a flat spectrum) and repeat. When is low rank a good bet?`,
          caption: md`When the singular values of the needed update decay quickly, a small $r$ captures most of it. With a flat spectrum every direction matters and no small rank suffices. Even $r = 64$ is under 4% of a $4096\times 4096$ matrix.`,
        },
        {
          kind: 'numeric',
          q: md`LoRA with rank $r = 16$ on a $4096\times 4096$ projection. How many trainable parameters does the adapter have?`,
          answer: { kind: 'number', value: 131072 },
          explain: md`$r(d + k) = 16\cdot 8192 = 131{,}072$, against $4096^2 = 16{,}777{,}216$ for the full matrix: $2r/d = 0.78\%$.`,
        },
        {
          kind: 'text',
          md: md`**QLoRA** goes further: the frozen base model is stored in 4-bit precision (the NF4 data type, with the quantization constants themselves quantized), the LoRA adapters are trained in 16-bit, and gradients flow through the dequantized base weights into the adapters. The QLoRA paper fine-tuned a 65B model on a single 48 GB GPU. Memory per base parameter drops from 2 bytes to about 0.5, and the 16-byte optimizer cost applies only to the small adapter.`,
        },
        {
          kind: 'check',
          q: md`In QLoRA, which part is stored in 4-bit?`,
          options: [md`The frozen pretrained weights`, md`The LoRA matrices $A$ and $B$`, md`The Adam states`, md`The activations`],
          answer: 0,
          explain: md`Only the frozen base is quantized. The adapters and their optimizer states stay in higher precision because they are what training changes.`,
        },
        {
          kind: 'text',
          md: md`### Learning from preferences: RLHF

It is easier for people to say which of two responses is better than to write the ideal one. **RLHF** (reinforcement learning from human feedback) uses such comparisons in two stages after SFT:

1. **Reward model.** Collect prompts $x$ with two responses, a preferred $y_w$ and a rejected $y_l$. Train a model $r_\phi(x, y)$ (usually the SFT model with a scalar head) with the Bradley–Terry likelihood $$P(y_w \succ y_l) = \sigma\big(r_\phi(x, y_w) - r_\phi(x, y_l)\big),\qquad \mathcal L_{RM} = -\log\sigma(r_w - r_l).$$
2. **Policy optimization.** Sample responses from the policy $\pi_\theta$, score them with $r_\phi$, and update $\pi_\theta$ with PPO to maximize reward while staying close to the SFT model $\pi_{\text{ref}}$.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'KL-regularized RLHF objective',
          md: md`$$\max_{\pi_\theta}\ \E_{x,\ y\sim\pi_\theta(\cdot\mid x)}\big[r_\phi(x, y)\big] - \beta\,\KL\big(\pi_\theta(\cdot\mid x)\,\|\,\pi_{\text{ref}}(\cdot\mid x)\big).$$ The KL term stops the policy from drifting into text that exploits flaws of the reward model (reward hacking) and keeps it fluent. PPO training holds four models: the policy, the reference, the reward model and a value model.`,
        },
        {
          kind: 'derive',
          title: 'from the RLHF objective to DPO',
          goal: md`Show that the optimum of the KL-regularized objective lets you write the reward in terms of policies, and that the Bradley–Terry loss then needs no reward model.`,
          steps: [
            { md: md`For a fixed $x$, the objective $\E_{y\sim\pi}[r(x,y)] - \beta\KL(\pi\,\|\,\pi_{\text{ref}})$ is maximized by $$\pi^*(y\mid x) = \frac{1}{Z(x)}\,\pi_{\text{ref}}(y\mid x)\,e^{r(x,y)/\beta},$$ with $Z(x)$ the normalizer. (Problem 2.3 proves this with Gibbs' inequality.)` },
            {
              md: md`Solve for the reward: take logs, $r(x, y) = \beta\log\dfrac{\pi^*(y\mid x)}{\pi_{\text{ref}}(y\mid x)} + \beta\log Z(x)$.`,
              choose: {
                prompt: md`What is the next move?`,
                options: [md`Take logs and solve for $r(x, y)$`, md`Differentiate $Z(x)$ with respect to $\theta$`, md`Sample from $\pi^*$`],
                answer: 0,
                explain: md`Inverting the relation expresses the reward through the optimal policy. $Z(x)$ is intractable, but it will cancel.`,
              },
            },
            {
              md: md`Plug into Bradley–Terry. The difference $r(x, y_w) - r(x, y_l)$ contains $\beta\log Z(x)$ twice with opposite signs, so it cancels: $$P(y_w \succ y_l) = \sigma\!\left(\beta\log\frac{\pi^*(y_w\mid x)}{\pi_{\text{ref}}(y_w\mid x)} - \beta\log\frac{\pi^*(y_l\mid x)}{\pi_{\text{ref}}(y_l\mid x)}\right).$$`,
              choose: {
                prompt: md`Why does $Z(x)$ disappear?`,
                options: [md`Bradley–Terry depends only on the reward difference for the same prompt, and $\beta\log Z(x)$ is the same for both responses`, md`$Z(x) = 1$ always`, md`It is absorbed into $\beta$`],
                answer: 0,
                explain: md`Both responses answer the same $x$, so the prompt-only term cancels in the difference.`,
              },
            },
            { md: md`Replace $\pi^*$ by the trainable $\pi_\theta$ and maximize the likelihood of the observed preferences: $$\mathcal L_{\text{DPO}} = -\E\left[\log\sigma\!\left(\beta\log\frac{\pi_\theta(y_w\mid x)}{\pi_{\text{ref}}(y_w\mid x)} - \beta\log\frac{\pi_\theta(y_l\mid x)}{\pi_{\text{ref}}(y_l\mid x)}\right)\right].$$` },
          ],
          takeaway: md`**Direct preference optimization (DPO)** trains the policy with a logistic loss on preference pairs: no reward model, no sampling during training, no value model. The policy's log-ratio against the reference acts as an implicit reward $\hat r = \beta\log(\pi_\theta/\pi_{\text{ref}})$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'llm.dpo', dw: 0, dl: 0, beta: 0.1 },
          task: md`Start at $\Delta_w = \Delta_l = 0$ (policy equals reference): the loss is $\ln 2$. Raise $\Delta_w$ and lower $\Delta_l$ until the gradient weight drops below 0.1. Then change $\beta$: how does it change the margin needed?`,
          caption: md`The gradient weight $\sigma(-\beta\cdot\text{margin})$ is large for pairs the policy still ranks wrongly and small for pairs it already ranks correctly by a wide margin. A larger $\beta$ reaches a small loss with a smaller deviation from the reference.`,
        },
        {
          kind: 'check',
          q: md`Compared with RLHF using PPO, which is true of DPO?`,
          options: [
            md`It optimizes a closed-form loss on fixed preference pairs, with no separate reward model and no sampling from the policy during training.`,
            md`It needs a larger reward model.`,
            md`It removes the reference model.`,
            md`It does not use preference data.`,
          ],
          answer: 0,
          explain: md`DPO still needs the frozen reference model, to compute $\log\pi_{\text{ref}}$ for both responses. It drops the reward model, the value model and the on-policy sampling loop, which makes it simpler and more stable to run. PPO-based RLHF can still help when on-policy exploration matters.`,
        },
        {
          kind: 'text',
          md: md`### Evaluation

- **Perplexity** on held-out text tracks pretraining progress, but only comparisons with the same tokenizer and data are meaningful (lesson 2.1).
- **Benchmarks**: multiple-choice knowledge tests, math word problems graded on the final answer, code graded by unit tests (pass@$k$: the probability that at least one of $k$ samples passes).
- **Contamination**: if test items appear in the pretraining data, scores measure memorization. Defences include n-gram overlap checks between test sets and training data, held-out or newly written test sets, and checking whether performance drops on paraphrased items.
- **LLM-as-judge**: a strong model grades or compares responses. Known biases: preferring the response shown first (position bias), longer responses (verbosity bias), and its own style (self-preference). Mitigations: evaluate both orders, control for length, validate the judge against human labels.
- **Human evaluation and online A/B tests** remain the reference for product quality.`,
        },
        {
          kind: 'check',
          q: md`A model scores far above expectations on a public benchmark, but drops sharply on a paraphrased version of the same questions. What is the most likely explanation?`,
          options: [md`Contamination: the original items, or close copies, were in its training data`, md`The paraphrases are harder`, md`The tokenizer changed`, md`The benchmark is too small`],
          answer: 0,
          explain: md`A large gap between original and paraphrased items is a standard sign of memorization. Paraphrasing can make items slightly harder, but not usually by a large margin.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'llm02-3-paper',
            title: 'Reward-model loss on one pair',
            type: 'compute',
            difficulty: 1,
            minutes: 6,
            statement: md`A reward model scores a preferred response $r_w = 2.0$ and a rejected one $r_l = 0.5$. (a) What probability does Bradley–Terry assign to the observed preference? (b) What is the loss $-\log\sigma(r_w - r_l)$? (c) What happens to both if a constant is added to every reward? Enter (b).`,
            solution: [
              md`(a) $\sigma(2.0 - 0.5) = \sigma(1.5) = \dfrac{1}{1 + e^{-1.5}} = \dfrac{1}{1.2231} \approx 0.818$.`,
              md`(b) $-\ln 0.818 \approx 0.201$.`,
              md`(c) Nothing: only differences enter. Rewards are identified only up to a constant per prompt, the same fact that makes $Z(x)$ cancel in DPO.`,
            ],
            answer: { kind: 'number', value: 0.2014133, tol: 2e-3 },
            areas: ['llm'],
          },
        },
        {
          kind: 'code',
          code: `d, k, r = 4096, 4096, 16
print(r * (d + k), d * k)`,
          predict: {
            q: md`What does this print?`,
            options: ['`131072 16777216`', '`65536 16777216`', '`131072 8192`', '`262144 16777216`'],
            answer: 0,
            explain: md`$16\cdot 8192 = 131{,}072$ adapter parameters against $4096^2 = 16{,}777{,}216$ for the full matrix.`,
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'llm02-3-ex',
            title: 'The DPO loss',
            prompt: md`Each array holds, for a batch of preference pairs, the summed token log-probabilities of a response: \`pi_w\`, \`pi_l\` under the policy and \`ref_w\`, \`ref_l\` under the reference model. Return the mean DPO loss $-\log\sigma(\beta\cdot\text{margin})$ with $\text{margin} = (\texttt{pi\_w} - \texttt{ref\_w}) - (\texttt{pi\_l} - \texttt{ref\_l})$. Use the stable identity $-\log\sigma(z) = \log(1 + e^{-z})$, computed with \`np.logaddexp(0, -z)\`.`,
            starter: `import numpy as np

pi_w = np.array([-12.0, -30.5, -8.2, -20.0])
pi_l = np.array([-14.0, -29.0, -15.0, -20.0])
ref_w = np.array([-13.0, -31.0, -9.0, -21.0])
ref_l = np.array([-13.5, -29.5, -12.0, -19.0])

def dpo_loss(pi_w, pi_l, ref_w, ref_l, beta=0.1):
    margin = (pi_w - ref_w) - (pi_l - ref_l)
    # TODO: mean of -log(sigmoid(beta * margin))
    return margin.mean()
`,
            solution: `import numpy as np

pi_w = np.array([-12.0, -30.5, -8.2, -20.0])
pi_l = np.array([-14.0, -29.0, -15.0, -20.0])
ref_w = np.array([-13.0, -31.0, -9.0, -21.0])
ref_l = np.array([-13.5, -29.5, -12.0, -19.0])

def dpo_loss(pi_w, pi_l, ref_w, ref_l, beta=0.1):
    margin = (pi_w - ref_w) - (pi_l - ref_l)
    return np.logaddexp(0.0, -beta * margin).mean()
`,
            tests: [
              { expr: 'round(float(dpo_loss(pi_w, pi_l, ref_w, ref_l)), 6)', label: 'beta = 0.1' },
              { expr: 'round(float(dpo_loss(pi_w, pi_l, ref_w, ref_l, beta=0.5)), 6)', label: 'beta = 0.5' },
              { expr: 'round(float(dpo_loss(ref_w, ref_l, ref_w, ref_l)), 6)', label: 'policy = reference gives ln 2' },
            ],
            hints: [md`$-\log\sigma(z) = \log(1 + e^{-z})$, and \`np.logaddexp(0, -z)\` computes $\log(e^0 + e^{-z})$ without overflow.`],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'recall',
          prompt: md`Write the reward-model loss, the RLHF objective and the DPO loss.`,
          answer: md`$\mathcal L_{RM} = -\log\sigma(r_\phi(x, y_w) - r_\phi(x, y_l))$. RLHF: $\max_\pi \E[r_\phi(x, y)] - \beta\KL(\pi\,\|\,\pi_{\text{ref}})$, optimized with PPO. DPO: $-\log\sigma\big(\beta\log\frac{\pi_\theta(y_w)}{\pi_{\text{ref}}(y_w)} - \beta\log\frac{\pi_\theta(y_l)}{\pi_{\text{ref}}(y_l)}\big)$.`,
        },
        {
          kind: 'explain',
          prompt: md`You fine-tuned a model for a customer-support task. How would you evaluate it before shipping?`,
          model: md`I would start from a held-out test set drawn from real support conversations, kept out of training and checked for overlap with the fine-tuning data. I would measure task metrics that can be checked automatically, such as correct resolution category, required fields extracted and policy compliance, and compare against the base model and the current production system. For open-ended answer quality I would use an LLM judge with pairwise comparisons in both orders and a length control, after checking its agreement with a sample of human ratings. I would also run regression checks on general capability and safety, since fine-tuning can degrade them, inspect failure cases by category, and finally run a limited online A/B test on business metrics such as resolution rate and escalations.`,
        },
      ],
      cards: [
        { id: 'llm02-3-c1', kind: 'concept', front: md`LoRA: the update, initialization and inference cost.`, back: md`$W + \frac{\alpha}{r}BA$ with $B \in \R^{d\times r}$, $A \in \R^{r\times k}$; $B = 0$ at init so training starts at the pretrained model; after training $BA$ is merged into $W$, so inference costs nothing extra.` },
        { id: 'llm02-3-c2', kind: 'compute', front: md`LoRA rank 8 on a $1024\times 4096$ matrix: trainable parameters?`, answer: { kind: 'number', value: 40960 }, back: md`$r(d + k) = 8\cdot 5120 = 40{,}960$.` },
        { id: 'llm02-3-c3', kind: 'concept', front: md`Why does RLHF include a KL penalty to the reference model?`, back: md`To keep the policy close to the SFT model, which limits reward hacking (exploiting reward-model errors) and keeps outputs fluent.` },
        { id: 'llm02-3-c4', kind: 'cloze', text: md`DPO removes the reward model and the RL loop, but still needs the frozen {{}} model.`, answers: ['reference'] },
        { id: 'llm02-3-c5', kind: 'concept', front: md`Three LLM-as-judge biases and a mitigation for each.`, back: md`Position bias (evaluate both orders), verbosity bias (control for length), self-preference (use a different judge or validate against humans).` },
      ],
    },
  ],
  problems: [
    {
      id: 'llm02-p1',
      title: 'Encoding with learned merges',
      type: 'compute',
      difficulty: 1,
      minutes: 6,
      statement: md`A BPE tokenizer learned these merges, in order: $e+s$, $es+t$, $est+\_$, $l+o$, $lo+w$, $n+e$, $ne+w$. Tokenize *slowest* (base symbols \`s l o w e s t _\`). How many tokens result?`,
      hints: [md`Apply the merges one at a time, in the learned order, everywhere they match.`],
      solution: [
        md`$e+s$: \`s l o w es t _\` (the first $s$ is followed by $l$, so it does not merge).`,
        md`$es+t$: \`s l o w est _\`. $est+\_$: \`s l o w est_\`.`,
        md`$l+o$: \`s lo w est_\`. $lo+w$: \`s low est_\`. $n+e$ and $ne+w$ do not match.`,
        md`Result: \`s\` \`low\` \`est_\`, 3 tokens.`,
      ],
      answer: { kind: 'number', value: 3 },
      areas: ['llm'],
    },
    {
      id: 'llm02-p2',
      title: 'Loss, perplexity and bits per byte',
      type: 'derive',
      difficulty: 2,
      minutes: 10,
      statement: md`(a) Show that the expected next-token loss is $H(p) + \KL(p\,\|\,q)$, so perplexity is at least $e^{H(p)}$. (b) A model's loss is 1.8 nats per token. Compute the perplexity and the loss in bits per token. (c) If its tokenizer averages 4 bytes per token, what is the loss in bits per byte? Enter the perplexity.`,
      solution: [
        md`(a) $-\E_p[\log q] = -\sum p\log p + \sum p\log(p/q) = H(p) + \KL(p\,\|\,q) \ge H(p)$ since $\KL \ge 0$; exponentiating, $\operatorname{PPL} \ge e^{H(p)}$, with equality iff $q = p$.`,
        md`(b) $\operatorname{PPL} = e^{1.8} \approx 6.05$. In bits: $1.8/\ln 2 \approx 2.597$ bits per token.`,
        md`(c) $2.597/4 \approx 0.649$ bits per byte. This number can be compared across tokenizers; perplexity cannot.`,
      ],
      answer: { kind: 'number', value: Math.exp(1.8), tol: 1e-3 },
      rubric: [md`Correct decomposition with $\KL \ge 0$ invoked`, md`Natural-log to bits conversion`, md`Per-token to per-byte normalization and why it matters`],
      areas: ['llm', 'math'],
    },
    {
      id: 'llm02-p3',
      title: 'The optimal KL-regularized policy',
      type: 'proof',
      difficulty: 3,
      minutes: 15,
      statement: md`For a fixed prompt, show that over distributions $\pi$ on responses, $$J(\pi) = \E_{y\sim\pi}[r(y)] - \beta\KL(\pi\,\|\,\pi_{\text{ref}})$$ is maximized by $\pi^*(y) = \pi_{\text{ref}}(y)e^{r(y)/\beta}/Z$ with $Z = \sum_y \pi_{\text{ref}}(y)e^{r(y)/\beta}$. Then explain how this result leads to the DPO loss.`,
      hints: [md`Write $J(\pi) = -\beta\sum_y\pi(y)\log\dfrac{\pi(y)}{\pi_{\text{ref}}(y)e^{r(y)/\beta}}$ and bring in $Z$.`],
      solution: [
        md`$J(\pi) = \sum_y\pi(y)r(y) - \beta\sum_y\pi(y)\log\frac{\pi(y)}{\pi_{\text{ref}}(y)} = -\beta\sum_y\pi(y)\log\frac{\pi(y)}{\pi_{\text{ref}}(y)e^{r(y)/\beta}}$.`,
        md`Multiply and divide inside the log by $Z$: $J(\pi) = -\beta\sum_y\pi(y)\log\frac{\pi(y)}{\pi^*(y)} + \beta\log Z = -\beta\KL(\pi\,\|\,\pi^*) + \beta\log Z$.`,
        md`$\beta\log Z$ does not depend on $\pi$, and $\KL(\pi\,\|\,\pi^*) \ge 0$ with equality iff $\pi = \pi^*$ (Gibbs' inequality). So $\pi^*$ is the unique maximizer.`,
        md`Inverting, $r(y) = \beta\log\frac{\pi^*(y)}{\pi_{\text{ref}}(y)} + \beta\log Z$. In the Bradley–Terry likelihood only reward differences for the same prompt appear, so $\beta\log Z$ cancels; substituting the trainable policy for $\pi^*$ gives the DPO loss.`,
      ],
      rubric: [md`Combines both terms into one log-ratio`, md`Introduces $Z$ and recognizes $\KL(\pi\,\|\,\pi^*)$`, md`Uses non-negativity of KL with the equality condition`, md`Explains the cancellation of $Z$ in the pairwise loss`],
      areas: ['llm', 'ml-depth'],
    },
    {
      id: 'llm02-p4',
      title: 'A compute-optimal 70B model',
      type: 'compute',
      difficulty: 1,
      minutes: 5,
      statement: md`By the 20-tokens-per-parameter rule, how many tokens should a $7\times 10^{10}$-parameter model be trained on, and what is the training compute? Enter $C$ in FLOPs.`,
      solution: [md`$D = 20N = 1.4\times 10^{12}$ tokens.`, md`$C \approx 6ND = 6\cdot 7\times 10^{10}\cdot 1.4\times 10^{12} = 5.88\times 10^{23}$ FLOPs.`],
      answer: { kind: 'number', value: 5.88e23, tol: 1e-3 },
      areas: ['llm', 'system-design'],
    },
    {
      id: 'llm02-p5',
      title: 'Total and active parameters of an MoE model',
      type: 'compute',
      difficulty: 2,
      minutes: 8,
      statement: md`Illustrative configuration: 32 layers, each with 42 M attention parameters and 8 SwiGLU experts with $d = 4096$, $d_{ff} = 14336$; top-2 routing; untied embeddings with $V = 32{,}000$. Ignore router and norm parameters. (a) Total parameters. (b) Active parameters per token. Enter (b) in billions.`,
      solution: [
        md`One expert: $3\cdot 4096\cdot 14336 = 176{,}160{,}768 \approx 176.2$ M.`,
        md`Embeddings: $2\cdot 32000\cdot 4096 = 262{,}144{,}000$.`,
        md`(a) Total: $32\cdot(42\text{ M} + 8\cdot 176.16\text{ M}) + 262.1\text{ M} = 32\cdot 1451.3\text{ M} + 262.1\text{ M} \approx 46.7$ B.`,
        md`(b) Active: $32\cdot(42\text{ M} + 2\cdot 176.16\text{ M}) + 262.1\text{ M} = 32\cdot 394.3\text{ M} + 262.1\text{ M} \approx 12.88$ B.`,
        md`The model needs memory for 46.7 B parameters but per-token compute of a 12.9 B dense model.`,
      ],
      answer: { kind: 'number', value: 12.880433152, tol: 5e-3 },
      areas: ['llm', 'system-design'],
    },
    {
      id: 'llm02-p6',
      title: 'Does it fit? ZeRO stages',
      type: 'apply',
      difficulty: 2,
      minutes: 8,
      statement: md`A 30B-parameter model is trained with mixed-precision Adam on 8 GPUs of 80 GB each. Compute the per-GPU memory for weights, gradients and optimizer states under (a) ZeRO-1 and (b) ZeRO-3. Which fits, before activations? Enter (a) in GB.`,
      solution: [
        md`(a) ZeRO-1 shards only the 12 bytes of optimizer state: $2N + 2N + 12N/8 = 60 + 60 + 45 = 165$ GB. Does not fit.`,
        md`(b) ZeRO-3 shards all 16 bytes: $16\cdot 30/8 = 60$ GB. Fits, with 20 GB left for activations, which may still require activation checkpointing.`,
      ],
      answer: { kind: 'number', value: 165 },
      areas: ['system-design', 'llm'],
    },
    {
      id: 'llm02-p7',
      title: 'LoRA on a whole model',
      type: 'compute',
      difficulty: 2,
      minutes: 8,
      statement: md`A 32-layer model with $d = 4096$ and multi-head attention has about 6.74 B parameters. You apply LoRA with $r = 8$ to all four attention projections ($W_Q, W_K, W_V, W_O$, each $4096\times 4096$) in every layer. (a) How many trainable parameters? (b) What fraction of the model is that? (c) Roughly how much optimizer and gradient memory does full fine-tuning need compared with LoRA? Enter (a).`,
      solution: [
        md`(a) Per matrix: $r(d + k) = 8\cdot 8192 = 65{,}536$. Four per layer, 32 layers: $65536\cdot 128 = 8{,}388{,}608$.`,
        md`(b) $8.39\times 10^6/6.74\times 10^9 \approx 0.12\%$.`,
        md`(c) Full fine-tuning needs gradients and Adam states for all 6.74 B parameters: about $14\cdot 6.74 \approx 94$ GB on top of the 13.5 GB of 16-bit weights. LoRA needs them for 8.4 M parameters, about 0.1 GB.`,
      ],
      answer: { kind: 'number', value: 8388608 },
      areas: ['llm'],
    },
    {
      id: 'llm02-p8',
      title: 'QLoRA memory',
      type: 'apply',
      difficulty: 2,
      minutes: 8,
      statement: md`Fine-tune a 33B-parameter model with QLoRA: base weights in 4-bit (ignore quantization constants), LoRA adapters totalling 0.5% of the base parameter count trained with mixed-precision Adam (16 bytes per adapter parameter). Estimate the memory for weights and optimizer, in GB, and compare with full fine-tuning at 16 bytes per parameter. Enter the QLoRA estimate.`,
      solution: [
        md`Base: $33\times 10^9\cdot 0.5$ bytes $= 16.5$ GB.`,
        md`Adapters: $0.005\cdot 33\times 10^9 = 1.65\times 10^8$ parameters, times 16 bytes $= 2.64$ GB.`,
        md`Total $\approx 19.1$ GB plus activations, against $16\cdot 33 = 528$ GB for full fine-tuning.`,
      ],
      answer: { kind: 'number', value: 19.14, tol: 1e-2 },
      areas: ['llm', 'system-design'],
    },
    {
      id: 'llm02-p9',
      title: 'The gradient of the DPO loss',
      type: 'derive',
      difficulty: 3,
      minutes: 12,
      statement: md`Let $u = \beta\big(\log\frac{\pi_\theta(y_w)}{\pi_{\text{ref}}(y_w)} - \log\frac{\pi_\theta(y_l)}{\pi_{\text{ref}}(y_l)}\big)$ and $\mathcal L = -\log\sigma(u)$. (a) Show $\nabla_\theta\mathcal L = -\beta\,\sigma(-u)\big(\nabla_\theta\log\pi_\theta(y_w) - \nabla_\theta\log\pi_\theta(y_l)\big)$. (b) Interpret the factor $\sigma(-u)$. (c) Evaluate it for $\beta = 0.1$ and a log-ratio margin of 20 nats.`,
      solution: [
        md`(a) $\frac{d}{du}\left(-\log\sigma(u)\right) = -\frac{\sigma(u)(1 - \sigma(u))}{\sigma(u)} = -(1 - \sigma(u)) = -\sigma(-u)$.`,
        md`By the chain rule, $\nabla_\theta u = \beta(\nabla_\theta\log\pi_\theta(y_w) - \nabla_\theta\log\pi_\theta(y_l))$, since the reference terms do not depend on $\theta$. Multiplying gives the result.`,
        md`(b) Gradient descent raises $\log\pi_\theta(y_w)$ and lowers $\log\pi_\theta(y_l)$, weighted by $\sigma(-u)$: the probability the implicit reward model assigns to the *wrong* ordering. Pairs already ranked correctly by a wide margin contribute little.`,
        md`(c) $u = 0.1\cdot 20 = 2$, so $\sigma(-2) = 1/(1 + e^2) \approx 0.119$.`,
      ],
      answer: { kind: 'number', value: 1 / (1 + Math.exp(2)), tol: 2e-3 },
      rubric: [md`Derivative of $-\log\sigma$ computed correctly`, md`Chain rule with the reference terms constant`, md`Interpretation of $\sigma(-u)$ as an error weight`],
      areas: ['llm', 'ml-depth'],
    },
    {
      id: 'llm02-p10',
      title: 'Designing an LLM-as-judge evaluation',
      type: 'concept',
      difficulty: 2,
      minutes: 10,
      statement: md`You must compare two chat models on 500 prompts using a third model as judge in pairwise mode. List the main ways this comparison could be biased or misleading, and a concrete mitigation for each.`,
      solution: [
        md`Position bias: the judge favours the first (or second) response. Mitigation: judge every pair in both orders and count inconsistent verdicts as ties.`,
        md`Verbosity bias: longer answers win regardless of quality. Mitigation: report response lengths, use a length-controlled comparison, or instruct and test the judge on length-matched pairs.`,
        md`Self-preference: a judge from the same family as one model favours its style. Mitigation: use a judge from a different family or several judges.`,
        md`Judge validity: agreement with humans is unknown. Mitigation: have people label a random subset and measure agreement before trusting the rest.`,
        md`Prompt set and noise: 500 prompts may not represent real traffic, and small win-rate differences may be noise. Mitigation: sample prompts from real usage by category and report confidence intervals, for example by bootstrap over prompts.`,
      ],
      rubric: [md`Names position and verbosity bias with mitigations`, md`Addresses judge validity with human agreement`, md`Addresses statistical uncertainty and prompt representativeness`],
      areas: ['llm', 'ml-breadth'],
    },
  ],
};
