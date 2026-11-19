import { md, type Module } from '../types';

export const MODULE: Module = {
  id: 'llm03',
  part: 'llm',
  order: 3,
  title: 'Inference, retrieval and serving',
  summary: 'Decoding strategies, the KV cache, prefill versus decode, batching, quantization, speculative decoding, and retrieval-augmented generation with vector search.',
  relevance: md`Most ML engineering work on LLMs is about serving them: choosing decoding settings, fitting the KV cache in memory, keeping GPUs busy with batching, quantizing weights, and grounding answers in retrieved documents. The arithmetic of this module tells you whether a deployment fits on a GPU and how many tokens per second it can produce. Interviews ask about temperature and top-p, the size of the KV cache, how to reduce latency, how speculative decoding works, when to use RAG instead of fine-tuning, and how to evaluate a RAG system.`,
  prereqs: ['llm01', 'llm02'],
  areas: ['llm', 'system-design', 'ml-coding'],
  lessons: [
    // ------------------------------------------------------------------ 3.1
    {
      id: 'llm03-1',
      title: 'Decoding',
      minutes: 30,
      objectives: [
        'Describe greedy, beam, temperature, top-k and top-p decoding and when each is used.',
        'Apply temperature, top-k and top-p to a small distribution by hand and give the renormalized probabilities.',
        'Show with an example why greedy decoding can miss the most likely sequence.',
        'Implement top-p filtering in vectorized NumPy.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`At each step a language model outputs a vector of **logits** $\bz \in \R^V$, one score per vocabulary token. Generation is a loop: turn the logits into a choice of next token, append it, run the model again. The rule that makes the choice is the **decoding strategy**. It changes the output a great deal without changing the model: the same weights can produce deterministic, repetitive text or varied, occasionally incoherent text.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Decoding strategies',
          md: md`- **Greedy**: pick $\argmax_i z_i$.
- **Beam search** with width $B$: keep the $B$ partial sequences with the highest total log-probability; extend each by every token, keep the best $B$ again.
- **Temperature sampling**: sample from $p_i = \dfrac{e^{z_i/T}}{\sum_j e^{z_j/T}}$. $T < 1$ sharpens, $T > 1$ flattens.
- **Top-$k$**: keep the $k$ most likely tokens, renormalize, sample.
- **Top-$p$ (nucleus)**: keep the smallest set of most likely tokens whose total probability is at least $p$, renormalize, sample.

Implementations commonly apply them in this order: temperature, then top-$k$, then top-$p$.`,
        },
        {
          kind: 'viz',
          viz: { type: 'llm.sampling' },
          task: md`Set $T = 0.3$ and resample a few times; then $T = 1.5$. Reset $T = 1$ and set top-$p = 0.8$: how many tokens are kept? Now lower $T$ to $0.5$ with top-$p$ still at 0.8. Why does the kept set shrink?`,
          caption: md`Lowering $T$ concentrates probability on the top tokens, so fewer of them are needed to reach the mass $p$. Top-$p$ adapts the size of the candidate set to the shape of the distribution; top-$k$ always keeps $k$.`,
        },
        {
          kind: 'numeric',
          q: md`Logits $(2, 1, 0)$ at temperature $T = 0.5$. What is the probability of the first token?`,
          answer: { kind: 'number', value: 0.8668133, tol: 2e-3 },
          hints: [md`Divide the logits by $T$ first: $(4, 2, 0)$.`],
          explain: md`$\dfrac{e^4}{e^4 + e^2 + e^0} = \dfrac{54.60}{54.60 + 7.39 + 1} = 0.867$. At $T = 1$ it would be $0.665$.`,
        },
        {
          kind: 'derive',
          title: 'the two limits of temperature',
          goal: md`Let $z_1 > z_j$ for all $j \ne 1$. Show that $\softmax(\bz/T) \to \be_1$ as $T \to 0^+$ and $\to$ uniform as $T \to \infty$.`,
          steps: [
            { md: md`Divide numerator and denominator by $e^{z_1/T}$: $$p_j = \frac{e^{(z_j - z_1)/T}}{\sum_i e^{(z_i - z_1)/T}}.$$` },
            {
              md: md`As $T \to 0^+$, $(z_j - z_1)/T \to -\infty$ for $j \ne 1$, so those terms vanish; the denominator tends to $e^0 = 1$. Hence $p_1 \to 1$ and $p_j \to 0$: greedy decoding.`,
              choose: {
                prompt: md`What happens to $e^{(z_j - z_1)/T}$ for $j \ne 1$ as $T \to 0^+$?`,
                options: [md`It goes to 0, because $z_j - z_1 < 0$`, md`It goes to 1`, md`It goes to $\infty$`],
                answer: 0,
                explain: md`A fixed negative number divided by a vanishing positive $T$ goes to $-\infty$, and $e^{-\infty} = 0$.`,
              },
            },
            { md: md`As $T \to \infty$, every exponent $(z_i - z_1)/T \to 0$, so every term tends to 1 and $p_j \to 1/V$: uniform.` },
            { md: md`For any $T > 0$ the map $z \mapsto z/T$ preserves order, so temperature never changes which token is most likely; it changes only how much the others get.` },
          ],
          takeaway: md`Temperature interpolates between greedy decoding and uniform noise. $T = 0$ is implemented as argmax, since dividing by zero is undefined.`,
        },
        {
          kind: 'numeric',
          q: md`Probabilities sorted: $(0.5, 0.2, 0.15, 0.1, 0.05)$. Apply top-$p$ with $p = 0.8$. Enter the renormalized probabilities of the kept tokens.`,
          answer: { kind: 'vector', value: [0.5 / 0.85, 0.2 / 0.85, 0.15 / 0.85], tol: 3e-3 },
          explain: md`Cumulative sums $0.5, 0.7, 0.85$: the third token is the first to reach $0.8$, so three are kept. Dividing by $0.85$: $(0.588, 0.235, 0.176)$.`,
        },
        {
          kind: 'check',
          q: md`Why is top-$p$ often preferred to top-$k$ for open-ended generation?`,
          options: [
            md`It keeps few candidates when the model is confident and many when it is uncertain; a fixed $k$ is too many in the first case and too few in the second.`,
            md`It is faster to compute.`,
            md`It never changes the most likely token's probability.`,
            md`It guarantees the output contains no repetition.`,
          ],
          answer: 0,
          explain: md`After *The capital of France is*, almost all mass is on one token and $k = 50$ would admit nonsense; after *My favourite food is*, many tokens are plausible. The nucleus adapts. Both renormalize, so both change the kept tokens' probabilities.`,
        },
        {
          kind: 'text',
          md: md`### Greedy and beam search

Greedy decoding maximizes each step's probability, which does not maximize the probability of the whole sequence, $\prod_t p(x_t\mid x_{<t})$. A high-probability first token can lead only to low-probability continuations. **Beam search** keeps $B$ hypotheses to reduce this. Because every token multiplies in a factor below 1, raw scores favour short outputs, so beam search usually divides the log-probability by a power of the length.

Beam search suits tasks with one right answer, such as translation or structured extraction. For open-ended text and chat, sampling with temperature and top-$p$ is common: the highest-probability sequences tend to be bland and repetitive.`,
        },
        {
          kind: 'viz',
          viz: { type: 'llm.beam', width: 1 },
          task: md`With beam width 1 (greedy), step to the end and note the result and its probability. Switch to width 2 and step again. Which continuation does each find, and which is the most likely overall?`,
          caption: md`Greedy takes *cat* (0.5) and ends with *The cat sat*, probability $0.5\cdot 0.4 = 0.20$. Width 2 also keeps *dog* (0.4), whose continuation *barked* (0.9) gives $0.36$, the best of all nine sequences.`,
        },
        {
          kind: 'text',
          md: md`**Repetition penalties.** Sampled text can still loop. Common remedies adjust the logits of tokens already generated: a multiplicative *repetition penalty* (divide a positive logit, multiply a negative one, by $\theta > 1$), additive *frequency* and *presence* penalties ($z_i \leftarrow z_i - \alpha\cdot\text{count}_i - \beta\cdot[\text{count}_i > 0]$), or forbidding any n-gram from repeating. They are heuristics: too strong a penalty blocks words that must legitimately repeat, such as names or code identifiers.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'llm03-1-paper',
            title: 'Temperature changes the nucleus',
            type: 'compute',
            difficulty: 2,
            minutes: 8,
            statement: md`A model's next-token probabilities at $T = 1$ are $(0.4, 0.3, 0.15, 0.1, 0.05)$. (a) Apply top-$p$ with $p = 0.8$ at $T = 1$. (b) Recompute the distribution at $T = 0.5$ and apply the same top-$p$. Enter the renormalized kept probabilities for (b).`,
            hints: [md`If $p_i \propto e^{z_i}$, then at temperature $T$ the probabilities are $\propto e^{z_i/T} = (e^{z_i})^{1/T} \propto p_i^{1/T}$. At $T = 0.5$, square and renormalize.`],
            solution: [
              md`(a) Cumulative: $0.4, 0.7, 0.85$; three tokens kept; renormalized $(0.4, 0.3, 0.15)/0.85 = (0.471, 0.353, 0.176)$.`,
              md`(b) Squares: $(0.16, 0.09, 0.0225, 0.01, 0.0025)$, sum $0.285$. Probabilities $(0.561, 0.316, 0.079, 0.035, 0.009)$.`,
              md`Cumulative: $0.561, 0.877$: two tokens reach $0.8$. Renormalized: $(0.16, 0.09)/0.25 = (0.64, 0.36)$.`,
              md`Lowering the temperature shrank the nucleus from three tokens to two.`,
            ],
            answer: { kind: 'vector', value: [0.64, 0.36], tol: 2e-3 },
            areas: ['llm'],
          },
        },
        {
          kind: 'code',
          code: `import numpy as np

z = np.array([2.0, 1.0, 0.0]) / 0.5
e = np.exp(z - z.max())
print(np.round(e / e.sum(), 3))`,
          predict: {
            q: md`Temperature 0.5 on logits $(2, 1, 0)$. What is printed?`,
            options: ['`[0.867 0.117 0.016]`', '`[0.665 0.245 0.09 ]`', '`[0.5 0.25 0. ]`', '`[0.333 0.333 0.333]`'],
            answer: 0,
            explain: md`This is the numeric checkpoint above: $\softmax(4, 2, 0)$. At $T = 1$ the result would be $(0.665, 0.245, 0.090)$.`,
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'llm03-1-ex',
            title: 'Top-p filtering',
            prompt: md`Complete \`top_p_filter(probs, p)\`: keep the smallest set of most likely tokens whose total probability is at least \`p\`, set the others to 0, and renormalize. \`probs\` is not sorted, and the output must keep the original token order. No Python loops.`,
            starter: `import numpy as np

probs = np.array([0.1, 0.4, 0.05, 0.3, 0.15])

def top_p_filter(probs, p):
    order = np.argsort(-probs)          # most likely first
    # TODO: decide which tokens to keep, zero the rest, renormalize
    return probs
`,
            solution: `import numpy as np

probs = np.array([0.1, 0.4, 0.05, 0.3, 0.15])

def top_p_filter(probs, p):
    order = np.argsort(-probs)
    sorted_p = probs[order]
    before = np.cumsum(sorted_p) - sorted_p     # mass of the more likely tokens
    keep = np.zeros(len(probs), dtype=bool)
    keep[order] = before < p
    out = np.where(keep, probs, 0.0)
    return out / out.sum()
`,
            tests: [
              { expr: 'np.round(top_p_filter(probs, 0.8), 4).tolist()', label: 'p = 0.8 keeps three tokens' },
              { expr: 'np.round(top_p_filter(probs, 0.35), 4).tolist()', label: 'p = 0.35 keeps only the top token' },
              { expr: 'np.round(top_p_filter(probs, 1.0), 4).tolist()', label: 'p = 1 keeps everything' },
            ],
            hints: [
              md`Sort descending with \`np.argsort(-probs)\` and take \`np.cumsum\` of the sorted probabilities.`,
              md`A token is kept if the mass of the tokens ranked above it is still below \`p\`: \`cumsum - sorted_p < p\`. That includes the token that crosses the threshold.`,
              md`Scatter the decision back with \`keep[order] = ...\`.`,
            ],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'recall',
          prompt: md`Define temperature, top-$k$ and top-$p$, and say in which order they are typically applied.`,
          answer: md`Temperature divides the logits by $T$ before the softmax ($T < 1$ sharpens, $T > 1$ flattens). Top-$k$ keeps the $k$ most likely tokens and renormalizes. Top-$p$ keeps the smallest most-likely set with total probability $\ge p$ and renormalizes. Order: temperature, top-$k$, top-$p$, then sample.`,
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *what do temperature and top-p do, and how would you set them for a code assistant versus a brainstorming tool?*`,
          model: md`Temperature rescales the logits before the softmax: low values concentrate probability on the most likely tokens, high values spread it out, and $T \to 0$ is greedy decoding. Top-$p$ then truncates the tail: it keeps the smallest set of tokens covering probability $p$ and renormalizes, so unlikely tokens can never be sampled, and the candidate set shrinks automatically when the model is confident. For a code assistant I want precise, reproducible output, so a low temperature (or greedy) and a moderate top-$p$; for evaluation of code I might sample several candidates and test them. For brainstorming I want diversity, so a temperature around 1 with top-$p$ around 0.9 to 0.95, which keeps variety while cutting off the incoherent tail. I would tune both on a small evaluation set, because the right values depend on the model.`,
        },
      ],
      cards: [
        { id: 'llm03-1-c1', kind: 'concept', front: md`Top-$k$ versus top-$p$.`, back: md`Top-$k$ keeps a fixed number of tokens. Top-$p$ keeps the smallest set with total probability $\ge p$, so its size adapts to how confident the model is. Both renormalize.` },
        { id: 'llm03-1-c2', kind: 'compute', front: md`Probabilities $(0.6, 0.25, 0.1, 0.05)$, top-$p = 0.8$. How many tokens are kept?`, answer: { kind: 'number', value: 2 }, back: md`Cumulative $0.6, 0.85$: two tokens.` },
        { id: 'llm03-1-c3', kind: 'cloze', text: md`As the temperature goes to 0, sampling becomes {{}} decoding.`, answers: ['greedy'] },
        { id: 'llm03-1-c4', kind: 'concept', front: md`Why can greedy decoding miss the most likely sequence?`, back: md`It maximizes each step's probability, not the product over steps. A likely first token can have only unlikely continuations. Beam search keeps several hypotheses to reduce this.` },
        { id: 'llm03-1-c5', kind: 'concept', front: md`Frequency and presence penalties.`, back: md`Subtract $\alpha\cdot\text{count}_i$ (frequency) and $\beta$ if $\text{count}_i > 0$ (presence) from the logit of each token already generated, to discourage repetition.` },
      ],
    },
    // ------------------------------------------------------------------ 3.2
    {
      id: 'llm03-2',
      title: 'Efficient inference',
      minutes: 40,
      objectives: [
        'Explain why the KV cache exists and compute its size from a model configuration.',
        'Explain why prefill is compute-bound and decode is memory-bandwidth-bound, and bound decode speed from memory bandwidth.',
        'Compare static and continuous batching.',
        'Quantize weights to int8 with a scale and zero-point and bound the rounding error.',
        'Explain speculative decoding and prove that it leaves the output distribution unchanged.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`To generate token $t + 1$, every layer's attention needs the keys and values of all tokens $1, \dots, t$. Those do not change once computed: causal masking means earlier positions never see later ones. Recomputing them at every step would redo the whole prefix each time. Instead the server stores them, the **KV cache**, and each step computes $\bq, \bk, \bv$ only for the new token, appends $\bk, \bv$ to the cache, and attends over it.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'KV-cache size',
          md: md`$$\text{bytes} = 2\cdot L\cdot n_{kv}\cdot d_h\cdot T\cdot B\cdot\text{bytes per number},$$ for $L$ layers, $n_{kv}$ key/value heads of size $d_h$, $T$ cached tokens per sequence and $B$ sequences; the 2 counts keys and values. The cache grows linearly with context and with batch size, and for long contexts or large batches it can exceed the weights.`,
        },
        {
          kind: 'viz',
          viz: { type: 'llm.kvcache' },
          task: md`With the defaults, find the context length at which one sequence's MHA cache equals the weights (dashed line). Then set batch to 16: at what context does the GQA cache pass the weights? Switch to 8-bit cache and compare.`,
          caption: md`An illustrative 8B-class configuration. GQA divides the cache by $h/n_{kv}$; quantizing the cache to 8 bits halves it again. At long context and large batch, the cache, not the weights, decides how many requests fit on a GPU.`,
        },
        {
          kind: 'numeric',
          q: md`$L = 80$ layers, $n_{kv} = 8$, $d_h = 128$, 16-bit cache, one sequence of 32,768 tokens. KV-cache size in GiB?`,
          answer: { kind: 'number', value: 10 },
          explain: md`Per token: $2\cdot 80\cdot 8\cdot 128\cdot 2 = 327{,}680$ bytes $= 320$ KiB. Times $32768 = 2^{15}$: $320\cdot 2^{10}\cdot 2^{15}$ bytes $= 320\cdot 2^{25} = 10\cdot 2^{30}$ bytes $= 10$ GiB.`,
        },
        {
          kind: 'text',
          md: md`### Prefill and decode

Serving a request has two phases.

- **Prefill** runs the whole prompt of $n$ tokens through the model in one pass, filling the cache. The weight matrices multiply $n$ vectors at once: matrix–matrix products with many FLOPs per byte of weights read. Prefill is **compute-bound**. It determines the *time to first token*.
- **Decode** generates one token per sequence per step. Each step reads every weight from GPU memory (HBM) to do 2 FLOPs per weight per sequence, plus reads the KV cache. Decode is **memory-bandwidth-bound**. It determines the *time per output token*.

A GPU can do on the order of hundreds of FLOPs in the time it reads one byte from HBM (the exact ratio depends on the hardware). Decode at batch size 1 does about 1 FLOP per byte, far below that, so the arithmetic units mostly wait.`,
        },
        {
          kind: 'derive',
          title: 'arithmetic intensity of decode',
          goal: md`A decode step processes $B$ sequences with a model of $N$ parameters stored in 16-bit. Ignoring the KV cache, find the FLOPs per byte of weights read.`,
          steps: [
            { md: md`FLOPs: each sequence costs $2N$, so the step costs $2NB$.` },
            {
              md: md`Bytes: the weights are read once per step and reused for all $B$ sequences: $2N$ bytes.`,
              choose: {
                prompt: md`How many times must the weights be read from HBM in one decode step for a batch of $B$?`,
                options: [md`Once, shared by the whole batch`, md`$B$ times, once per sequence`, md`Not at all, they stay in on-chip memory`],
                answer: 0,
                explain: md`Batched matrix products load each weight tile once and apply it to all $B$ vectors. Model weights are far larger than on-chip SRAM, so they are streamed from HBM every step.`,
              },
            },
            { md: md`Intensity: $2NB/2N = B$ FLOPs per byte. Decode stays bandwidth-bound until $B$ approaches the hardware's FLOPs-per-byte ratio; batching more sequences raises throughput almost for free until then.` },
          ],
          takeaway: md`Latency per decode step $\gtrsim (\text{weight bytes} + \text{KV bytes read})/\text{bandwidth}$. This is why quantizing weights speeds up decode, why GQA helps at long context, and why batching raises throughput.`,
        },
        {
          kind: 'numeric',
          q: md`Illustrative numbers: a 7B-parameter model in 16-bit (14 GB of weights) on a GPU with 2 TB/s memory bandwidth, batch size 1. Ignoring the KV cache, what is the minimum time per decode step, in milliseconds?`,
          answer: { kind: 'number', value: 7 },
          explain: md`$14\times 10^9$ bytes $/\ 2\times 10^{12}$ bytes/s $= 7\times 10^{-3}$ s $= 7$ ms, so at most about 140 tokens per second for one sequence. In 4-bit the weights take 3.5 GB and the bound drops to 1.75 ms.`,
        },
        {
          kind: 'text',
          md: md`### Batching

Requests produce different numbers of tokens. **Static batching** groups requests and runs the group until its longest member finishes; finished slots sit idle and new requests wait. **Continuous batching** (iteration-level scheduling) decides the batch at every decode step: a finished sequence leaves and a waiting request takes its slot immediately. Serving engines combine it with a paged KV cache that allocates cache memory in fixed-size blocks, as in vLLM's PagedAttention, so sequences of unknown length do not fragment memory.`,
        },
        {
          kind: 'viz',
          viz: { type: 'llm.batching', mode: 'static' },
          task: md`Play the static schedule and note the steps to finish and the utilization. Switch to continuous and compare. Which requests finish earlier, and why?`,
          caption: md`Static batching wastes the grey gaps behind short requests. Continuous batching fills them, so the same work finishes sooner and the mean completion time drops. Real servers also interleave the prefill of new requests, which this figure ignores.`,
        },
        {
          kind: 'check',
          q: md`Continuous batching mainly improves which quantity?`,
          options: [md`Throughput and queueing delay, by keeping batch slots busy`, md`The time of a single forward pass`, md`Model accuracy`, md`The size of each sequence's KV cache`],
          answer: 0,
          explain: md`Each step costs about the same; continuous batching means fewer of the slots in each step are wasted, and new requests start without waiting for a whole batch to drain.`,
        },
        {
          kind: 'text',
          md: md`### Quantization

Storing weights in fewer bits shrinks memory and, because decode is bandwidth-bound, speeds it up. Weight-only quantization to int8 or 4-bit formats is standard for serving; methods such as GPTQ and AWQ choose the rounding to minimize the error of each layer's output rather than of each weight.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'Uniform quantization',
          md: md`**Symmetric (absmax), $b$ bits**: $s = \max|w|/(2^{b-1} - 1)$, $q = \operatorname{round}(w/s)$, $\hat w = s\,q$. For int8 the codes are $-127, \dots, 127$.

**Asymmetric (min–max), unsigned $b$ bits**: $s = (\max w - \min w)/(2^b - 1)$, zero-point $z = \operatorname{round}(-\min w/s)$, $q = \operatorname{clip}(\operatorname{round}(w/s) + z,\ 0,\ 2^b - 1)$, $\hat w = s\,(q - z)$.

For values inside the range the rounding error is at most $s/2$. One scale can cover a whole tensor, each output channel (row), or each group of, for example, 32 to 128 weights.`,
        },
        {
          kind: 'viz',
          viz: { type: 'llm.quant', bits: 8 },
          task: md`Compare int8 and int4 and read the RMSE. Turn on the outlier: what happens to the scale and the error of all the other weights? Then switch the scale to **group of 32**.`,
          caption: md`One large weight stretches the range, so the step $s$ grows and every other weight is rounded more coarsely. Per-group scales confine the damage to one group, at a cost of a few extra bits per group (here one 16-bit scale per 32 weights, 0.5 bits per weight).`,
        },
        {
          kind: 'numeric',
          q: md`Quantize $\bw = (0.52, -1.27, 0.034, 0.9)$ to int8 with symmetric absmax scaling. Enter the codes $q$.`,
          answer: { kind: 'vector', value: [52, -127, 3, 90] },
          explain: md`$s = 1.27/127 = 0.01$. $q = \operatorname{round}(w/s) = (52, -127, 3.4 \to 3, 90)$. Dequantized: $(0.52, -1.27, 0.03, 0.9)$; the only error is $0.004$ on the third weight, below $s/2 = 0.005$.`,
        },
        {
          kind: 'text',
          md: md`### Speculative decoding

A decode step of a large model costs about the same whether it scores one new token or a handful, because it is bandwidth-bound. **Speculative decoding** exploits this. A small **draft** model proposes $\gamma$ tokens autoregressively (cheap). The large **target** model then scores all $\gamma$ positions in one forward pass, like a short prefill. Going left to right, draft token $x$ is accepted with probability $\min\!\big(1, p(x)/q(x)\big)$, where $p$ and $q$ are the target's and draft's distributions at that position. At the first rejection, a replacement is sampled from the **residual** distribution $\operatorname{norm}(\max(0, p - q))$ and the rest of the draft is discarded. If all $\gamma$ are accepted, one more token is sampled from the target's next distribution. Each target pass therefore yields between 1 and $\gamma + 1$ tokens.`,
        },
        {
          kind: 'derive',
          title: 'speculative sampling is exact',
          goal: md`Show that the token emitted at one position has distribution exactly $p$.`,
          steps: [
            { md: md`The token can be $x$ in two ways: the draft proposes $x$ and it is accepted, or a proposal is rejected and the residual sample is $x$.` },
            { md: md`Accepted: $\P = q(x)\min\!\big(1, \tfrac{p(x)}{q(x)}\big) = \min(p(x), q(x))$.` },
            {
              md: md`Rejected overall: $\P(\text{reject}) = 1 - \sum_y \min(p(y), q(y)) = \sum_y \big(p(y) - \min(p(y), q(y))\big) = \sum_y \max(0, p(y) - q(y))$.`,
              choose: {
                prompt: md`How can $1 - \sum_y\min(p, q)$ be rewritten?`,
                options: [md`As $\sum_y \max(0, p(y) - q(y))$, using $\sum_y p(y) = 1$`, md`As $\sum_y \max(0, q(y) - p(y))$ only if $p = q$`, md`As $\max_y |p(y) - q(y)|$`],
                answer: 0,
                explain: md`Write $1 = \sum_y p(y)$ and use $p - \min(p, q) = \max(0, p - q)$. (By symmetry it also equals $\sum_y\max(0, q - p)$, the total variation distance.)`,
              },
            },
            { md: md`Residual sample is $x$: $\P = \P(\text{reject})\cdot\dfrac{\max(0, p(x) - q(x))}{\sum_y\max(0, p(y) - q(y))} = \max(0, p(x) - q(x))$.` },
            { md: md`Total: $\min(p(x), q(x)) + \max(0, p(x) - q(x)) = p(x)$. Every case of $p(x) \gtrless q(x)$ gives $p(x)$.` },
          ],
          takeaway: md`Speculative decoding changes the speed, never the distribution: its output is a sample from the target model. The acceptance rate is $\alpha = \sum_x\min(p(x), q(x))$, so a draft that agrees with the target more often gives a larger speed-up.`,
        },
        {
          kind: 'viz',
          viz: { type: 'llm.specdec', lambda: 0.4, gamma: 4 },
          task: md`Move the draft error from 0 to 1. Watch the acceptance rate and the simulated output frequencies (dashed). Does the output distribution ever move away from $p$? How many tokens per target pass do you get at $\lambda = 0$ and at $\lambda = 1$?`,
          caption: md`The dashed output frequencies track the blue target bars for every draft, up to Monte Carlo noise; only the acceptance rate, and therefore the speed-up, changes.`,
        },
        {
          kind: 'callout',
          tone: 'interview',
          title: 'Levers for latency and throughput',
          md: md`- **Fewer bytes per step**: weight quantization (int8, 4-bit), GQA/MQA and KV-cache quantization, a smaller or distilled model.
- **Fewer target passes per token**: speculative decoding.
- **Better use of each pass**: continuous batching, paged KV cache, prefix caching for shared system prompts.
- **Faster kernels**: FlashAttention, fused operations.
- **Less work**: shorter prompts, limits on output length, streaming the first tokens early.
- **More hardware**: tensor parallelism across GPUs splits each step's weight reads.

Name the metric first: time to first token (prefill), time per output token (decode), or throughput per GPU (batching). They trade off: larger batches raise throughput but also each request's per-token latency.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'llm03-2-paper',
            title: 'Asymmetric quantization by hand',
            type: 'compute',
            difficulty: 2,
            minutes: 8,
            statement: md`Quantize $\bw = (-0.55, 0, 0.123, 2.0)$ to unsigned 8-bit with min–max scaling and a zero-point. Give $s$, $z$, the codes $q$, the dequantized values and the largest error. Enter $q$.`,
            solution: [
              md`$s = (2.0 - (-0.55))/255 = 2.55/255 = 0.01$. $z = \operatorname{round}(0.55/0.01) = 55$.`,
              md`$q = \operatorname{round}(w/s) + z$: $-55 + 55 = 0$; $0 + 55 = 55$; $\operatorname{round}(12.3) + 55 = 67$; $200 + 55 = 255$.`,
              md`Dequantized $s(q - z)$: $(-0.55, 0, 0.12, 2.0)$. Largest error $0.003$, below $s/2 = 0.005$.`,
              md`Note that $0$ maps exactly to the code $z = 55$. Exact zeros matter, for example for padding.`,
            ],
            answer: { kind: 'vector', value: [0, 55, 67, 255] },
            areas: ['llm', 'ml-coding'],
          },
        },
        {
          kind: 'code',
          code: `def kv_cache_bytes(L, n_kv, d_head, T, batch=1, bytes_per=2):
    return 2 * L * n_kv * d_head * T * batch * bytes_per

print(kv_cache_bytes(L=80, n_kv=8, d_head=128, T=32768) / 2**30)`,
          predict: {
            q: md`What does this print (GiB)?`,
            options: ['`10.0`', '`5.0`', '`80.0`', '`40.0`'],
            answer: 0,
            explain: md`The numeric checkpoint above: 320 KiB per token times 32,768 tokens is 10 GiB. Try \`batch=8\` or \`n_kv=64\`.`,
          },
        },
        {
          kind: 'exercise',
          ex: {
            id: 'llm03-2-ex',
            title: 'Per-row int8 quantization',
            prompt: md`Complete \`quantize_rows(W)\`: symmetric int8 quantization with **one scale per row**, $s_i = \max_j|W_{ij}|/127$, codes $q = \operatorname{round}(W/s)$ clipped to $[-127, 127]$ (kept as floats). Return \`(q, s)\` with \`s\` of shape \`(rows,)\`. Row 2 contains an outlier: compare its scale with the others.`,
            starter: `import numpy as np

np.random.seed(0)
W = np.random.randn(4, 6) * 0.1
W[2, 3] = 0.9          # one outlier in row 2

def quantize_rows(W):
    s = np.abs(W).max() / 127          # one scale for the whole tensor
    q = np.clip(np.round(W / s), -127, 127)
    return q, s
`,
            solution: `import numpy as np

np.random.seed(0)
W = np.random.randn(4, 6) * 0.1
W[2, 3] = 0.9          # one outlier in row 2

def quantize_rows(W):
    s = np.abs(W).max(axis=1) / 127
    q = np.clip(np.round(W / s[:, None]), -127, 127)
    return q, s
`,
            tests: [
              { expr: 'quantize_rows(W)[0].tolist()', label: 'codes' },
              { expr: 'np.round(quantize_rows(W)[1], 6).tolist()', label: 'per-row scales' },
              { expr: 'bool((np.abs(W - quantize_rows(W)[0] * quantize_rows(W)[1][:, None]) <= quantize_rows(W)[1][:, None] / 2 + 1e-12).all())', label: 'error at most s/2' },
            ],
            hints: [md`\`np.abs(W).max(axis=1)\` gives one maximum per row.`, md`Divide with broadcasting: \`W / s[:, None]\`.`],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'recall',
          prompt: md`Why is decode memory-bandwidth-bound, and name three techniques that reduce decode latency or raise throughput.`,
          answer: md`Each decode step reads all weights (and the KV cache) from HBM to do only about $2B$ FLOPs per weight for batch $B$, so the arithmetic units wait on memory. Techniques: weight quantization, GQA or KV-cache quantization, speculative decoding, continuous batching, a smaller or distilled model, tensor parallelism.`,
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *how would you reduce the inference latency of an LLM service?* Structure your answer.`,
          model: md`I would first ask which latency: time to first token, which is dominated by prefill and queueing, or time per output token, which is dominated by decode. Then profile. For decode, which is memory-bandwidth-bound, I would cut the bytes read per step: quantize weights to int8 or 4-bit, use a model with GQA, quantize the KV cache, or use a smaller distilled model if quality allows; and add speculative decoding with a small draft model, which keeps the output distribution unchanged. For time to first token I would cache shared prompt prefixes, shorten prompts, use FlashAttention kernels, and split long prefills into chunks so they do not stall other requests. Serving-side, continuous batching with a paged KV cache improves throughput and queueing delay, but I would cap the batch size to meet the per-token latency target. Tensor parallelism across GPUs reduces per-step latency for large models at the cost of communication. Each change is validated against a quality evaluation, especially quantization.`,
        },
      ],
      cards: [
        { id: 'llm03-2-c1', kind: 'concept', front: md`KV-cache memory formula.`, back: md`$2\cdot L\cdot n_{kv}\cdot d_h\cdot T\cdot B\cdot$ bytes: keys and values, per layer, per KV head, per cached token, per sequence.` },
        { id: 'llm03-2-c2', kind: 'concept', front: md`Prefill versus decode.`, back: md`Prefill processes the prompt in parallel (matrix–matrix, compute-bound, sets time to first token). Decode emits one token per step (matrix–vector, memory-bandwidth-bound, sets time per output token).` },
        { id: 'llm03-2-c3', kind: 'compute', front: md`Symmetric int8: $\max|w| = 2.54$. What is the scale $s$?`, answer: { kind: 'number', value: 0.02 }, back: md`$s = 2.54/127 = 0.02$; the rounding error is at most $0.01$.` },
        { id: 'llm03-2-c4', kind: 'cloze', text: md`In speculative decoding a draft token $x$ is accepted with probability $\min(1, p(x)/q(x))$, and on rejection the replacement is sampled from the normalized {{}} distribution $\max(0, p - q)$.`, answers: ['residual'] },
        { id: 'llm03-2-c5', kind: 'concept', front: md`Static versus continuous batching.`, back: md`Static: a batch runs until its longest request finishes; slots of finished requests idle. Continuous: the batch is re-formed every decode step, so freed slots are refilled immediately.` },
      ],
    },
    // ------------------------------------------------------------------ 3.3
    {
      id: 'llm03-3',
      title: 'Retrieval-augmented generation',
      minutes: 35,
      objectives: [
        'Describe the RAG pipeline: chunking, embedding, indexing, retrieval, reranking and prompt assembly.',
        'Retrieve the top-k documents by cosine similarity in vectorized NumPy.',
        'Explain how IVF and graph indexes such as HNSW trade recall for speed, and compute their search cost.',
        'Evaluate retrieval with recall@k and MRR, and generation with faithfulness.',
        'Choose between RAG and fine-tuning, and describe tool use and agents at a concept level.',
      ],
      cells: [
        {
          kind: 'text',
          md: md`A model's knowledge is frozen at its training cutoff, it has never seen your private documents, and when it does not know an answer it may produce a fluent wrong one. **Retrieval-augmented generation (RAG)** addresses all three at query time: find passages relevant to the question in a document collection, put them in the prompt, and instruct the model to answer from them, citing sources.`,
        },
        {
          kind: 'callout',
          tone: 'definition',
          title: 'The RAG pipeline',
          md: md`**Offline (indexing)**

1. Split documents into **chunks**.
2. Compute an **embedding** vector for each chunk with an encoder model.
3. Store the vectors in an **index** for fast nearest-neighbour search, with the text and metadata.

**Online (per query)**

1. Embed the query with the same encoder.
2. **Retrieve** the top-$k$ chunks by similarity, often combined with keyword search.
3. Optionally **rerank** them with a more accurate model.
4. **Assemble the prompt**: instructions, the selected chunks with source ids, the question.
5. **Generate** the answer.`,
        },
        {
          kind: 'text',
          md: md`**Chunking** decides what can be retrieved. Chunks that are too large dilute the embedding with unrelated content and consume the context budget; chunks that are too small lose the context needed to interpret them. Typical choices are a few hundred tokens with some overlap, split along document structure (sections, paragraphs) where possible, with metadata such as title and date attached for filtering.`,
        },
        {
          kind: 'viz',
          viz: { type: 'llm.chunk', size: 30, overlap: 0 },
          task: md`With chunks of 30 words and no overlap, is the answer sentence in one chunk? Add overlap until it is. How much extra storage did that cost? Then try chunks of 12 words: what can no overlap setting fix?`,
          caption: md`A fixed split can cut a sentence in two, and neither half then matches the question well. Overlap makes it likely that some chunk contains the whole span, at the price of storing and embedding some text twice. A chunk smaller than the answer can never hold it, whatever the overlap.`,
        },
        {
          kind: 'check',
          q: md`What is the main cost of increasing chunk overlap?`,
          options: [md`More chunks to embed and store, and near-duplicate results in the top-$k$`, md`Lower recall`, md`The embedding model needs retraining`, md`The LLM's context window shrinks`],
          answer: 0,
          explain: md`Overlap raises the chance that a passage appears intact (higher recall for spans near boundaries) but duplicates text, which costs indexing work and storage and can fill the top-$k$ with near-copies of the same passage.`,
        },
        {
          kind: 'text',
          md: md`### Dense retrieval

An embedding model (a **bi-encoder**) maps the query and each chunk separately to vectors, trained contrastively so that a question and a passage that answers it end up close. Similarity is usually cosine similarity; with L2-normalized embeddings, cosine, dot product and Euclidean distance give the same ranking (the vectors module, problem 1.8). Dense retrieval matches meaning and paraphrases. It can miss exact identifiers such as product codes or error numbers, so production systems often combine it with lexical search (BM25) in a **hybrid** retriever.`,
        },
        {
          kind: 'exercise',
          ex: {
            id: 'llm03-3-ex',
            title: 'Cosine top-k retrieval',
            prompt: md`\`Q\` holds $m$ query embeddings (rows) and \`D\` holds $n$ document embeddings. Complete \`top_k_cosine(Q, D, k)\` to return an $(m, k)$ array of document indices, most similar first, by **cosine** similarity. No Python loops.`,
            starter: `import numpy as np

np.random.seed(1)
D = np.random.randn(8, 5)      # 8 document embeddings
Qm = np.random.randn(3, 5)     # 3 query embeddings

def top_k_cosine(Q, D, k):
    S = Q @ D.T                # TODO: this is the raw dot product
    return np.argsort(-S, axis=1)[:, :k]
`,
            solution: `import numpy as np

np.random.seed(1)
D = np.random.randn(8, 5)      # 8 document embeddings
Qm = np.random.randn(3, 5)     # 3 query embeddings

def top_k_cosine(Q, D, k):
    Qn = Q / np.linalg.norm(Q, axis=1, keepdims=True)
    Dn = D / np.linalg.norm(D, axis=1, keepdims=True)
    S = Qn @ Dn.T
    return np.argsort(-S, axis=1)[:, :k]
`,
            tests: [
              { expr: 'top_k_cosine(Qm, D, 3).tolist()', label: 'top 3 per query' },
              { expr: 'top_k_cosine(Qm, D * np.arange(1, 9)[:, None], 3).tolist()', label: 'rescaling documents must not change the ranking' },
              { expr: 'top_k_cosine(D[:2], D, 1).tolist()', label: 'a document is its own nearest neighbour' },
            ],
            hints: [md`Normalize each row: \`Q / np.linalg.norm(Q, axis=1, keepdims=True)\`, and the same for \`D\`.`, md`Then \`Qn @ Dn.T\` is the $(m, n)$ matrix of cosines; sort each row with \`np.argsort(-S, axis=1)\`.`],
            mustExclude: ['for '],
          },
        },
        {
          kind: 'text',
          md: md`### Approximate nearest-neighbour search

Exact search compares the query with every vector: $O(nd)$ per query, about $7.7\times 10^{10}$ multiply-adds for $10^8$ vectors of dimension 768. **Approximate nearest-neighbour (ANN)** indexes return most of the true top-$k$ while computing far fewer distances.

- **IVF (inverted file)**: cluster the vectors with k-means into $n_{\text{list}}$ cells. A query is compared with the centroids, then only with the vectors in the $n_{\text{probe}}$ nearest cells. Often combined with product quantization (IVF-PQ) to compress the vectors.
- **HNSW (hierarchical navigable small world)**: a graph whose nodes are vectors and whose edges link near neighbours, with sparse upper layers for long jumps. Search walks greedily toward the query, keeping a candidate list of size $ef$.

Both expose a knob (\`nprobe\`, \`ef\`) that trades recall for latency, and are measured by **recall@k**: the fraction of the true top-$k$ returned.`,
        },
        {
          kind: 'viz',
          viz: { type: 'llm.ann', mode: 'ivf', nprobe: 1 },
          task: md`Drag the query near a cell boundary with nprobe = 1 until recall drops below 1. Raise nprobe until it recovers and note the distance computations. Then switch to **graph** and find the smallest $ef$ that gives recall 1 for $k = 5$.`,
          caption: md`IVF misses neighbours that sit just across a cell boundary; probing more cells fixes it at higher cost. Graph search computes distances only along the way from the entry point. In both cases a few dozen distance computations replace 150.`,
        },
        {
          kind: 'numeric',
          q: md`An IVF index holds $10^6$ vectors in $n_{\text{list}} = 1000$ cells of equal size. With $n_{\text{probe}} = 10$, how many distance computations does one query need (centroids plus vectors)?`,
          answer: { kind: 'number', value: 11000 },
          explain: md`$1000$ centroid distances, plus $10$ cells of $1000$ vectors each: $11{,}000$, about 91 times fewer than brute force.`,
        },
        {
          kind: 'text',
          md: md`### Reranking and the prompt

A bi-encoder never sees query and passage together. A **cross-encoder reranker** reads the pair jointly and scores relevance more accurately, but costs one forward pass per candidate, so it is applied only to the top 20 to 100 retrieved chunks to choose the final handful.

Prompt assembly then fits the selected chunks, with source identifiers, into a token budget, with instructions to answer only from the provided context, to cite sources, and to say so when the context does not contain the answer. Models use information in the middle of a long context less reliably than at the beginning or end, so fewer, better chunks often work better than many.`,
        },
        {
          kind: 'text',
          md: md`### Evaluating RAG

Evaluate the two halves separately, then end to end, on a labelled set of questions with their relevant chunks and reference answers.

- **Retrieval**: **recall@k**, the fraction of relevant chunks that appear in the top $k$ (or the fraction of questions with at least one relevant chunk there); **MRR**, the mean over questions of $1/\text{rank}$ of the first relevant chunk.
- **Generation**: **faithfulness** (groundedness): is every claim supported by the retrieved context? **Answer relevance** and **correctness** against the reference answer. These are commonly scored by an LLM judge that has been checked against human labels.

If an answer is wrong, the split tells you where to work: the relevant chunk was not retrieved (fix chunking, embeddings, hybrid search, $k$), or it was retrieved and the model ignored or contradicted it (fix the prompt, the reranking, or the model).`,
        },
        {
          kind: 'numeric',
          q: md`A question has 4 relevant chunks in the collection. The retriever's top 5 contain 3 of them. What is recall@5 for this question?`,
          answer: { kind: 'number', value: 0.75 },
          explain: md`$3/4 = 0.75$. Precision@5 would be $3/5 = 0.6$.`,
        },
        {
          kind: 'code',
          code: `import numpy as np

ranked = [[3, 7, 1, 0, 9], [2, 5, 8, 4, 6], [0, 1, 2, 3, 4]]   # retrieved chunk ids per query
relevant = [{7, 9}, {4}, {8}]
for k in [1, 3, 5]:
    hits = [len(set(r[:k]) & rel) / len(rel) for r, rel in zip(ranked, relevant)]
    print(k, round(float(np.mean(hits)), 3))`,
          note: md`Mean recall@k for $k = 1, 3, 5$. The third query never retrieves its relevant chunk: no setting of $k$ up to 5 helps, so that failure is in retrieval itself.`,
        },
        {
          kind: 'text',
          md: md`### Choosing between RAG and fine-tuning

| need | prefer |
|---|---|
| knowledge that changes often, or must be cited | RAG |
| access control per user or document | RAG (filter at retrieval) |
| a format, style, tone or task behaviour | fine-tuning |
| domain vocabulary and reasoning patterns | fine-tuning, often with RAG |
| shorter prompts and lower latency | fine-tuning |

They combine well: fine-tune the model to use retrieved context faithfully and in the right format, and retrieve the facts at query time. Long-context models can sometimes take a whole small corpus in the prompt, but the cost of every request grows with the context.`,
        },
        {
          kind: 'check',
          q: md`A company wants its assistant to answer questions about internal policies that change monthly, with links to the source document. What is the better primary approach?`,
          options: [md`RAG over the policy documents`, md`Fine-tune the model on the policies each month`, md`Pretrain a new model`, md`Increase the sampling temperature`],
          answer: 0,
          explain: md`RAG reflects document updates as soon as they are re-indexed, can cite the source chunk, and can enforce access rights at retrieval time. Fine-tuning bakes facts into weights, cannot cite, and must be repeated at each change.`,
        },
        {
          kind: 'text',
          md: md`### Tool use and agents

Retrieval is one example of a **tool**. In tool use the model is given descriptions of functions (name, purpose, a JSON schema for the arguments). It can emit a structured call instead of text; the application runs the function (a search, a database query, a calculator, code execution) and appends the result to the context, and the model continues. An **agent** runs this in a loop: decide on an action, call a tool, observe the result, repeat until the task is done.

Agents are evaluated by end-to-end task success, cost and number of steps. Their main risks are compounding errors over many steps and **prompt injection**: text inside a retrieved document or tool result that tries to give the model instructions. Tool output must be treated as untrusted data, with permissions on what tools can do.`,
        },
        {
          kind: 'paper',
          problem: {
            id: 'llm03-3-paper',
            title: 'Cosine versus dot product by hand',
            type: 'compute',
            difficulty: 1,
            minutes: 8,
            statement: md`Query $\bq = (1, 2)$. Documents $\bd_1 = (6, 3)$, $\bd_2 = (1, 3)$, $\bd_3 = (-1, 2)$, $\bd_4 = (4, 8)$. (a) Rank them by dot product. (b) Rank them by cosine similarity. Enter the top 2 by cosine, as document numbers.`,
            solution: [
              md`(a) Dot products: $12, 7, 3, 20$. Order: $\bd_4, \bd_1, \bd_2, \bd_3$.`,
              md`(b) $\lVert\bq\rVert = \sqrt5$. Cosines: $\bd_1$: $12/(\sqrt5\cdot\sqrt{45}) = 12/15 = 0.8$; $\bd_2$: $7/(\sqrt5\cdot\sqrt{10}) = 7/\sqrt{50} \approx 0.990$; $\bd_3$: $3/(\sqrt5\cdot\sqrt5) = 0.6$; $\bd_4$: $20/(\sqrt5\cdot\sqrt{80}) = 20/20 = 1$.`,
              md`Order: $\bd_4, \bd_2, \bd_1, \bd_3$. $\bd_1$ ranked second by dot product only because it is long; $\bd_4$ points exactly along $\bq$.`,
            ],
            answer: { kind: 'vector', value: [4, 2] },
            areas: ['llm', 'math'],
          },
        },
        {
          kind: 'recall',
          prompt: md`List the stages of a RAG pipeline and one metric for retrieval and one for generation.`,
          answer: md`Offline: chunk, embed, index. Online: embed query, retrieve top-$k$ (often hybrid with BM25), rerank, assemble prompt with sources, generate. Retrieval: recall@k (or MRR). Generation: faithfulness/groundedness (or correctness against a reference).`,
        },
        {
          kind: 'explain',
          prompt: md`An interviewer asks: *how would you evaluate a RAG system?*`,
          model: md`I would build a labelled evaluation set from real or realistic questions, each with the chunks that contain the answer and a reference answer, and evaluate the components separately and together. For retrieval I measure recall@k and MRR at the $k$ actually passed to the model, before and after reranking. For generation, given the retrieved context, I measure faithfulness (every claim supported by the context), answer correctness against the reference, and whether the system correctly declines when the context lacks the answer; these are scored with an LLM judge whose agreement with human labels I check on a sample. End to end I track answer correctness, citation accuracy, latency and cost. I slice results by question type to see whether failures come from retrieval misses or from the generator ignoring the context, and I rerun the set on every change to chunking, embeddings, prompts or models. Online, I add user feedback and A/B tests.`,
        },
      ],
      cards: [
        { id: 'llm03-3-c1', kind: 'concept', front: md`Stages of a RAG pipeline.`, back: md`Offline: chunk, embed, index. Online: embed query, retrieve top-$k$ (dense, often hybrid with BM25), rerank with a cross-encoder, assemble the prompt with sources, generate.` },
        { id: 'llm03-3-c2', kind: 'compute', front: md`IVF with $n = 10^6$ vectors, 1000 equal cells, nprobe = 5: distance computations per query?`, answer: { kind: 'number', value: 6000 }, back: md`$1000$ centroids $+ 5\cdot 1000 = 6000$.` },
        { id: 'llm03-3-c3', kind: 'cloze', text: md`A reranker that reads the query and passage together is called a {{}}-encoder.`, answers: ['cross'] },
        { id: 'llm03-3-c4', kind: 'concept', front: md`Faithfulness (groundedness) of a RAG answer.`, back: md`Whether every claim in the answer is supported by the retrieved context, regardless of whether it is true in the world.` },
        { id: 'llm03-3-c5', kind: 'concept', front: md`RAG versus fine-tuning in one line each.`, back: md`RAG: changing or citable knowledge, access control. Fine-tuning: behaviour, format, style, domain patterns, shorter prompts. They are often combined.` },
      ],
    },
  ],
  problems: [
    {
      id: 'llm03-p1',
      title: 'Top-k, then top-p',
      type: 'compute',
      difficulty: 2,
      minutes: 8,
      statement: md`Next-token probabilities, sorted: $(0.35, 0.25, 0.2, 0.1, 0.06, 0.04)$. Apply top-$k$ with $k = 4$, renormalize, then top-$p$ with $p = 0.7$ on the renormalized distribution, and renormalize again. Enter the final probabilities of the kept tokens.`,
      solution: [
        md`Top-4 mass: $0.9$. Renormalized: $(0.389, 0.278, 0.222, 0.111)$.`,
        md`Cumulative: $0.389, 0.667, 0.889$. The third token is the first to reach $0.7$, so three are kept.`,
        md`Renormalize $(0.35, 0.25, 0.2)$ by $0.8$: $(0.4375, 0.3125, 0.25)$.`,
        md`Applying top-$p$ to the original distribution instead would give cumulative $0.35, 0.6, 0.8$, also three tokens here, but in general the order of the filters matters.`,
      ],
      answer: { kind: 'vector', value: [0.4375, 0.3125, 0.25], tol: 2e-3 },
      areas: ['llm'],
    },
    {
      id: 'llm03-p2',
      title: 'Temperature preserves the ranking',
      type: 'proof',
      difficulty: 2,
      minutes: 10,
      statement: md`Let $p_i(T) = e^{z_i/T}/\sum_j e^{z_j/T}$. (a) Show that for any $T > 0$, $p_i(T) > p_j(T)$ exactly when $z_i > z_j$. (b) Show that $p_i(T)/p_j(T) = (p_i(1)/p_j(1))^{1/T}$. (c) Use (b) to explain why lowering $T$ shrinks a top-$p$ nucleus.`,
      solution: [
        md`(a) $p_i(T)/p_j(T) = e^{(z_i - z_j)/T}$, which exceeds 1 exactly when $z_i - z_j > 0$, since $T > 0$.`,
        md`(b) $p_i(T)/p_j(T) = e^{(z_i - z_j)/T} = \big(e^{z_i - z_j}\big)^{1/T} = (p_i(1)/p_j(1))^{1/T}$.`,
        md`(c) For $T < 1$ every ratio between a more likely and a less likely token is raised to a power above 1, so the top tokens gain probability relative to all others. The cumulative mass of the top $m$ tokens increases for every $m$, so fewer tokens are needed to reach $p$.`,
      ],
      rubric: [md`Ratio form with the sign argument`, md`Power relation derived`, md`Monotone increase of top-$m$ mass connected to the nucleus size`],
      areas: ['llm', 'math'],
    },
    {
      id: 'llm03-p3',
      title: 'How many sequences fit?',
      type: 'apply',
      difficulty: 2,
      minutes: 8,
      statement: md`An 80 GiB GPU serves an 8B-parameter model in 16-bit (about 16 GiB, rounding for simplicity) with $L = 32$, $n_{kv} = 8$, $d_h = 128$ and a 16-bit KV cache. Reserve 16 GiB for activations and runtime overhead. How many concurrent sequences of 8192 tokens fit in the remaining memory? How many with MHA ($n_{kv} = 32$)?`,
      solution: [
        md`KV memory available: $80 - 16 - 16 = 48$ GiB.`,
        md`Per token: $2\cdot 32\cdot 8\cdot 128\cdot 2 = 131{,}072$ bytes $= 128$ KiB. Per sequence: $128\text{ KiB}\cdot 8192 = 1$ GiB.`,
        md`$48$ sequences with GQA. With MHA the cache is 4 times larger: 12 sequences.`,
      ],
      answer: { kind: 'number', value: 48 },
      areas: ['system-design', 'llm'],
    },
    {
      id: 'llm03-p4',
      title: 'A bandwidth bound on decode speed',
      type: 'apply',
      difficulty: 2,
      minutes: 8,
      statement: md`Illustrative numbers: a 70B-parameter model is quantized to 4 bits (ignore scale overhead) and served at batch size 1 on hardware with $2\times 10^{12}$ bytes/s of memory bandwidth. (a) Lower-bound the time per decode step in ms, ignoring the KV cache. (b) What is the bound on tokens per second? (c) With 8-way tensor parallelism on 8 such devices, ignoring communication? Enter (a).`,
      solution: [
        md`(a) Weights: $70\times 10^9\cdot 0.5$ bytes $= 35$ GB. Time $\ge 35\times 10^9/2\times 10^{12} = 17.5$ ms.`,
        md`(b) At most $1/0.0175 \approx 57$ tokens per second.`,
        md`(c) Each device reads one eighth of the weights: $\ge 2.19$ ms per step, about 457 tokens per second, before communication overhead.`,
      ],
      answer: { kind: 'number', value: 17.5 },
      areas: ['system-design', 'llm'],
    },
    {
      id: 'llm03-p5',
      title: 'Speculative decoding: correctness and speed-up',
      type: 'proof',
      difficulty: 3,
      minutes: 15,
      statement: md`(a) Prove that the speculative-sampling rule (accept $x \sim q$ with probability $\min(1, p(x)/q(x))$, otherwise sample from $\operatorname{norm}(\max(0, p - q))$) outputs a token distributed exactly as $p$. (b) Assume each of $\gamma$ draft tokens is accepted independently with probability $\alpha$, and that a target pass yields the accepted prefix plus one more token. Show that the expected number of tokens per target pass is $\dfrac{1 - \alpha^{\gamma+1}}{1 - \alpha}$, and evaluate it for $\alpha = 0.8$, $\gamma = 4$.`,
      solution: [
        md`(a) $\P(\text{accept and } x) = q(x)\min(1, p(x)/q(x)) = \min(p(x), q(x))$.`,
        md`$\P(\text{reject}) = 1 - \sum_y\min(p(y), q(y)) = \sum_y\max(0, p(y) - q(y))$, so $\P(\text{reject and } x) = \max(0, p(x) - q(x))$.`,
        md`Sum: $\min(p, q) + \max(0, p - q) = p(x)$.`,
        md`(b) The pass yields $j + 1$ tokens if the first $j$ drafts are accepted and draft $j + 1$ is rejected ($j < \gamma$), and $\gamma + 1$ if all are accepted. $\E = \sum_{j=0}^{\gamma}\P(\text{at least } j \text{ accepted}) = \sum_{j=0}^{\gamma}\alpha^j = \dfrac{1 - \alpha^{\gamma+1}}{1 - \alpha}$.`,
        md`For $\alpha = 0.8$, $\gamma = 4$: $(1 - 0.8^5)/0.2 = (1 - 0.32768)/0.2 = 3.36$ tokens per target pass. The wall-clock speed-up is lower, because the draft model's $\gamma$ steps also cost time.`,
      ],
      answer: { kind: 'number', value: 3.3616, tol: 1e-3 },
      rubric: [md`Acceptance term equals $\min(p, q)$`, md`Rejection probability rewritten as $\sum\max(0, p - q)$`, md`Correct expectation via the tail-sum or direct sum`, md`Correct numerical value with the caveat about draft cost`],
      areas: ['llm', 'ml-depth'],
    },
    {
      id: 'llm03-p6',
      title: 'Quantization error and group overhead',
      type: 'derive',
      difficulty: 2,
      minutes: 10,
      statement: md`(a) For symmetric quantization with scale $s$ and no clipping, show that $|w - \hat w| \le s/2$. (b) A row of weights has $\max|w| = 0.7$; quantize to symmetric int4 (codes $-7$ to $7$). What is the maximum error? (c) A 70B model is quantized to 4 bits with one 16-bit scale per group of 128 weights. How many GB do the weights take? Enter (c).`,
      solution: [
        md`(a) $q = \operatorname{round}(w/s)$ satisfies $|w/s - q| \le 1/2$. Multiply by $s > 0$: $|w - sq| \le s/2$.`,
        md`(b) $s = 0.7/7 = 0.1$, so the maximum error is $0.05$.`,
        md`(c) Bits per weight: $4 + 16/128 = 4.125$. Bytes: $70\times 10^9\cdot 4.125/8 \approx 36.1$ GB, against 140 GB in 16-bit.`,
      ],
      answer: { kind: 'number', value: 36.09375, tol: 1e-3 },
      rubric: [md`Rounding bound $1/2$ scaled by $s$`, md`Correct int4 scale`, md`Scale overhead per weight included`],
      areas: ['llm', 'system-design'],
    },
    {
      id: 'llm03-p7',
      title: 'Static versus continuous batching',
      type: 'compute',
      difficulty: 1,
      minutes: 8,
      statement: md`Four requests need 2, 8, 3 and 7 decode steps and arrive together. The server has 2 batch slots and takes requests in order. (a) With static batching (groups of 2), how many steps until all finish, and what is the slot utilization? (b) With continuous batching (a freed slot takes the next request immediately)? Enter the number of steps for (b).`,
      solution: [
        md`(a) Group 1 (2, 8) runs 8 steps; group 2 (3, 7) runs 7 steps: 15 steps. Busy slot-steps: $2 + 8 + 3 + 7 = 20$ of $2\cdot 15 = 30$: 67%.`,
        md`(b) Slot 1: request 1 (steps 0–2), then request 3 (2–5), then request 4 (5–12). Slot 2: request 2 (0–8). All done after 12 steps; utilization $20/24 = 83\%$.`,
      ],
      answer: { kind: 'number', value: 12 },
      areas: ['system-design'],
    },
    {
      id: 'llm03-p8',
      title: 'Cost of an IVF search',
      type: 'compute',
      difficulty: 2,
      minutes: 6,
      statement: md`An IVF index holds $10^7$ vectors in 4096 equal cells. A query probes 16 cells. (a) How many distance computations does it need? (b) How many times fewer than brute force? (c) Why can recall@10 be below 1? Enter (a).`,
      solution: [
        md`(a) $4096$ centroids $+ 16\cdot 10^7/4096 = 4096 + 39{,}062.5 = 43{,}158.5$ on average.`,
        md`(b) $10^7/43{,}158.5 \approx 232$ times fewer.`,
        md`(c) Some true nearest neighbours sit in cells whose centroids are not among the 16 closest to the query, typically near cell boundaries. Raising nprobe trades speed for recall.`,
      ],
      answer: { kind: 'number', value: 43158.5, tol: 1e-3 },
      areas: ['system-design', 'llm'],
    },
    {
      id: 'llm03-p9',
      title: 'Recall and MRR',
      type: 'compute',
      difficulty: 1,
      minutes: 6,
      statement: md`For four questions, the rank of the first relevant chunk in the retrieved list of 5 is: 1, 3, not retrieved, 2. (a) Compute the hit rate at 5 (fraction of questions with a relevant chunk in the top 5). (b) Compute MRR (a miss contributes 0). Enter (b).`,
      solution: [
        md`(a) 3 of 4 questions: $0.75$.`,
        md`(b) $(1 + 1/3 + 0 + 1/2)/4 = (11/6)/4 = 11/24 \approx 0.458$.`,
      ],
      answer: { kind: 'number', value: 11 / 24, tol: 1e-3 },
      areas: ['llm', 'ml-breadth'],
    },
    {
      id: 'llm03-p10',
      title: 'Design: an assistant over product documentation',
      type: 'concept',
      difficulty: 3,
      minutes: 15,
      statement: md`You are asked to build an assistant that answers customer questions from 50,000 pages of product documentation, updated weekly, in a consistent support tone with citations. Decide between RAG, fine-tuning or both, and describe the system and how you would evaluate it.`,
      solution: [
        md`Use RAG for the facts: weekly updates and citations rule out baking the documentation into weights. Optionally fine-tune (for example with LoRA) for tone, format and faithful use of context.`,
        md`Indexing: structure-aware chunking (sections, a few hundred tokens, some overlap) with metadata (product, version, URL); embed with a bi-encoder; HNSW or IVF index; add BM25 for exact terms such as error codes; re-index changed pages weekly.`,
        md`Serving: hybrid retrieval of about 50 candidates, cross-encoder reranking to about 5, a prompt that requires answering only from the context with citations and declining otherwise; cache frequent questions; stream the answer.`,
        md`Evaluation: a labelled set of real questions with relevant pages and reference answers; recall@k and MRR for retrieval; faithfulness, correctness and citation accuracy for generation (LLM judge validated against humans); latency and cost; online, resolution rate and escalations via A/B test.`,
      ],
      rubric: [md`Justifies RAG for changing, citable facts; fine-tuning only for behaviour`, md`Concrete chunking, hybrid retrieval and reranking choices`, md`Separate retrieval and generation metrics with a labelled set`, md`Mentions freshness (re-indexing) and online evaluation`],
      areas: ['system-design', 'llm'],
    },
  ],
};
