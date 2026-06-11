# How LLMs Work

> **What you'll learn:** what a large language model actually does, the transformer at intuition level, why "next-token prediction" produces intelligent-seeming behavior, and the vocabulary you need for every later lesson.

## The one-sentence version

A large language model is a function that takes a sequence of tokens and outputs a **probability distribution over what token comes next** — and everything you'll build in this course is engineering around that single capability.

When you "chat" with a model, the system is repeatedly asking: *given everything so far, what's the most plausible next token?* It samples one, appends it, and asks again — hundreds of times per response. There is no database lookup, no reasoning engine bolted on the side (reasoning models change the *shape* of generation, not this core mechanic). It's prediction all the way down.

## From prediction to apparent intelligence

Why does predicting the next token produce useful behavior? Because predicting text *well* requires modeling the process that generated the text. To accurately continue:

```
The capital of Australia is
```

the model must encode geography facts. To continue:

```python
def fibonacci(n):
    if n <= 1:
        return n
    return
```

it must model how code works. Training on trillions of tokens of text forces the model to compress an enormous amount of world knowledge, linguistic structure, and procedural patterns into its weights. That compression is what we experience as capability.

## The transformer, at intuition level

Modern LLMs are **transformers** (from the 2017 paper *Attention Is All You Need*). You don't need the math to be an effective AI engineer, but you need this mental model:

1. **Tokenization** — input text is split into tokens (subword chunks, covered next lesson) and each is mapped to a vector (an embedding).
2. **Attention layers** — the core innovation. At each layer, every token's representation is updated by *attending* to other tokens: "which earlier words matter for understanding me?" In `The cat sat on the mat because it was tired`, attention lets `it` strongly weight `cat`. Dozens of attention heads run in parallel, each learning different relationships (syntax, coreference, long-range dependencies).
3. **Feed-forward layers** — interleaved with attention; loosely, where much of the "knowledge" is stored.
4. **Output head** — after many stacked layers (often 30–100+), the final representation is projected onto the vocabulary, producing a score for every possible next token. A softmax turns scores into probabilities.

Two properties of this architecture explain a lot of practical behavior:

- **Attention is quadratic-ish in sequence length** — every token can look at every other token. This is why long contexts cost more and why context windows have limits.
- **The model sees the whole context every time** — it has no memory between API calls. "Memory" in chat apps is an illusion created by re-sending the conversation history each turn. This single fact will matter in nearly every later module.

## Training: three phases that shape behavior

| Phase | What happens | What it produces |
|---|---|---|
| **Pre-training** | Predict next token across trillions of tokens of web text, code, books | A *base model*: knowledgeable but feral — it completes text, it doesn't follow instructions |
| **Supervised fine-tuning (SFT)** | Train on curated (instruction → good response) pairs | A model that behaves like an assistant |
| **Reinforcement learning (RLHF / RLAIF / RLVR)** | Optimize against human preferences or verifiable rewards | Helpfulness, harmlessness, and increasingly, reliable reasoning |

Understanding this pipeline explains common phenomena:

- **Hallucination** — the model is rewarded for plausible continuations, and a confident wrong answer is often more "plausible text" than "I don't know."
- **Sycophancy** — preference tuning can over-reward agreeing with the user.
- **Knowledge cutoff** — pre-training data ends at some date; the model knows nothing after it (RAG, Module 4, is the standard fix).

## Inference: how your API call becomes text

When you send a request:

1. Your messages are formatted into a single token sequence (system prompt, then turns, using special delimiter tokens).
2. **Prefill:** the model processes the whole input in one parallel pass, building internal state (the *KV cache*).
3. **Decode:** tokens are generated one at a time, each step reusing the cached state. This is why output tokens are slower and usually priced higher than input tokens.
4. Generation stops at a special end token, a stop sequence, or your `max_tokens` limit.

The prefill/decode split has real engineering consequences you'll meet in Module 8: time-to-first-token vs tokens-per-second, and why prompt caching makes repeated large prompts cheap.

## What LLMs are bad at (by construction)

- **Exact arithmetic and counting** — they pattern-match digits rather than compute (tool calling, Module 3, is the fix).
- **Knowing what they don't know** — calibration is imperfect; confidence ≠ correctness.
- **Anything after the training cutoff** — retrieval is the fix.
- **Determinism** — even at temperature 0, floating-point nondeterminism and batching can vary outputs slightly.

Engineering around these limitations — rather than being surprised by them — is most of what "AI engineering" means.

## Key takeaways

- An LLM maps a token sequence to a probability distribution over the next token; chat is repeated sampling from that distribution.
- Transformers use attention to relate tokens to each other; stacked layers + massive pre-training produce capability.
- The model is **stateless between calls** — all "memory" is you re-sending context.
- Pre-training gives knowledge; SFT and RL give behavior. Hallucination and cutoffs are direct consequences of the training objective.
- Output generation is sequential and more expensive than input processing.
