# Sampling Parameters

> **What you'll learn:** what temperature, top-p, and friends actually do to the token distribution, which settings to use for which task, and the determinism myths that bite people in production.

## Where sampling happens

Recall from Lesson 1: at each step the model outputs a score (logit) for every token in the vocabulary. **Sampling parameters control how a single token is chosen from that distribution.** They don't make the model smarter or dumber — they shape the randomness of the draw.

```
logits → [temperature scaling] → softmax → [top-p / top-k filtering] → sample
```

## Temperature

Temperature divides the logits before softmax:

- **T → 0**: the distribution sharpens toward the single highest-probability token — *greedy decoding*. Maximal consistency.
- **T = 1**: the model's learned distribution, unmodified.
- **T > 1**: the distribution flattens; unlikely tokens get real probability mass. More diverse, more error-prone.

Intuition with numbers — suppose the model's top candidates for the next token are:

| Token | T=0.2 | T=1.0 | T=1.5 |
|---|---|---|---|
| `Paris` | 0.98 | 0.75 | 0.55 |
| `Lyon` | 0.02 | 0.15 | 0.22 |
| `the` | ~0 | 0.07 | 0.14 |
| *(junk)* | ~0 | 0.03 | 0.09 |

Low temperature doesn't *add* knowledge — it just stops exploring. High temperature doesn't *create* creativity — it samples further into the tail, which includes both interesting and wrong tokens.

## Top-p (nucleus sampling) and top-k

These *truncate* the distribution before sampling:

- **Top-p = 0.9**: keep the smallest set of tokens whose cumulative probability ≥ 0.9; renormalize; sample from that set. The candidate pool adapts — narrow when the model is confident, wide when it's uncertain.
- **Top-k = 40**: keep only the 40 highest-probability tokens. A blunter version of the same idea.

Practical guidance: **adjust temperature *or* top-p, not both** (most provider docs say the same). Tuning both makes behavior hard to reason about. Temperature is the one to reach for first.

## The settings that actually matter per task

| Task | Temperature | Why |
|---|---|---|
| Code generation, SQL | 0–0.3 | One correct answer; exploration is risk |
| Extraction, classification, structured output | 0 | Consistency is the whole point |
| Factual Q&A, RAG answers | 0–0.3 | Reduce embellishment |
| General assistant / chat | 0.7–1.0 | Natural variation |
| Brainstorming, creative writing | 0.9–1.3 | Tail exploration is the feature |
| Synthetic data generation | 0.8–1.2 (+ vary prompts) | You *want* diversity across samples |

```python
response = client.chat.completions.create(
    model=MODEL,
    messages=[{"role": "user", "content": "Extract the invoice total as JSON."}],
    temperature=0,        # deterministic-ish: extraction wants consistency
    max_tokens=200,       # always set deliberately
    stop=["\n\n"],        # optional: cut generation at a boundary you define
)
```

```typescript
const response = await client.chat.completions.create({
  model: MODEL,
  messages: [{ role: "user", content: "Extract the invoice total as JSON." }],
  temperature: 0,        // deterministic-ish: extraction wants consistency
  max_tokens: 200,       // always set deliberately
  stop: ["\n\n"],        // optional: cut generation at a boundary you define
});
```

## The other parameters

- **`max_tokens`** — a hard cap on *output* length, not a target. Generation that hits the cap is truncated mid-thought: **always check `finish_reason` / `stop_reason`** (`"length"` vs `"stop"`) in production code. Too-low caps are a classic source of silently broken JSON.
- **Stop sequences** — strings that end generation immediately (the string itself is not returned). Useful for single-turn completions, delimited formats, or preventing the model from continuing past a section.
- **Frequency / presence penalties** (some providers) — discourage repetition by penalizing already-used tokens. Helpful against loops in long generations; usually leave at 0.
- **`seed`** (some providers) — best-effort reproducibility for debugging, *not* a guarantee.
- **Reasoning/thinking budgets** (reasoning models) — a newer knob: how many tokens the model may spend thinking before answering. Often constrains temperature (e.g. must be 1 while reasoning is on); treat it as a quality-vs-latency/cost dial.

## Determinism myths (production war stories)

1. **"Temperature 0 means identical outputs."** Mostly, but not guaranteed: floating-point non-associativity, batching effects, and infrastructure changes can produce different outputs for identical requests. If your system *requires* exact reproducibility, you need caching, not temperature.
2. **"Lower temperature reduces hallucination."** It reduces *variance*. A model confidently wrong at T=1 is just as confidently wrong at T=0 — greedy decoding picks the same wrong top token every time. Grounding (RAG) and verification reduce hallucination; temperature only stabilizes it.
3. **"Model upgrades keep behavior at T=0."** Every model version has a different distribution. Pin model versions, and re-run your evals (Module 7) on every upgrade.

## A workflow tip: sample multiple, then choose

For hard problems, generating *k* samples at T≈0.8 and selecting the best (by voting, a verifier, or an LLM judge — Module 7) often beats one sample at T=0. This "best-of-n" pattern trades tokens for quality and is one of the simplest reliable quality levers you have.

## Key takeaways

- Sampling parameters shape how one token is drawn from the model's distribution — randomness control, not intelligence control.
- Temperature ~0 for code/extraction/factual tasks; 0.7+ when variation is desirable. Tune temperature *or* top-p, not both.
- Always set `max_tokens` deliberately and check the finish/stop reason — truncation bugs are silent.
- Temperature 0 is not true determinism, and it does not fix hallucination.
- Best-of-n sampling with a selector is a cheap, powerful quality lever.
