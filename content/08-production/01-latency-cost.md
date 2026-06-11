# Latency & Cost Optimization

> **What you'll learn:** the two latency metrics that actually matter, how to right-size models with routing and cascades, the levers that cut token spend — shorter prompts, tighter `max_tokens`, batch APIs — and when self-hosting starts to make sense.

## Two numbers, not one

"Latency" for an LLM call is two distinct quantities, and they come straight from the prefill/decode split you learned in Module 1:

| Metric | What it measures | Dominated by | User experience impact |
|---|---|---|---|
| **Time to first token (TTFT)** | Request sent → first output token | Prefill: input length, queueing | "Is anything happening?" |
| **Throughput (tokens/sec)** | Speed of generation after the first token | Decode: model size, server load | "How fast does it read out?" |

A 50k-token prompt has a long prefill, so TTFT suffers even on a fast model. A huge response on a large model has fine TTFT but slow decode. Diagnose them separately: long TTFT → shrink the prompt or use prompt caching (next lesson); slow decode → smaller model or fewer output tokens.

And remember Module 3: **streaming** doesn't make generation faster, but it transforms *perceived* latency. A response that streams its first words in 400ms feels responsive even if the full answer takes eight seconds. For any user-facing surface, streaming is table stakes.

## Right-sizing: the biggest lever

The single largest cost/latency win is not clever engineering — it's *not using a flagship model for work a small model can do*. Fast-tier models in 2026 are typically 10–50× cheaper and several times faster than flagships, and they handle classification, extraction, routing, formatting, and simple Q&A perfectly well.

Two patterns operationalize this:

- **Routing** — a cheap classifier (often itself a small model) inspects the request and dispatches it to the right tier. "Reset my password" goes to the small model; "analyze this contract" goes to the flagship.
- **Cascades** — try the cheap model first; escalate only when a confidence check or validator fails. You pay the flagship price only on the hard residual.

```python
def cascade(prompt: str) -> str:
    draft = call_llm("small-fast-model", prompt, max_tokens=400)
    if passes_validation(draft):          # schema check, judge score, heuristic
        return draft                      # ~80–90% of traffic ends here
    return call_llm("flagship-model", prompt, max_tokens=400)
```

```typescript
async function cascade(prompt: string): Promise<string> {
  const draft = await callLLM("small-fast-model", prompt, { maxTokens: 400 });
  if (passesValidation(draft)) {        // schema check, judge score, heuristic
    return draft;                       // ~80–90% of traffic ends here
  }
  return callLLM("flagship-model", prompt, { maxTokens: 400 });
}
```

The catch: routing and cascades are only safe if you can *measure* quality at each tier. This is exactly why you built evals in Module 7 — "step down tiers until your eval scores break" is the disciplined version of right-sizing.

## Token diet: input and output

You pay per token, every call, so the boring optimizations compound:

- **Shorten the system prompt.** Production prompts accrete instructions like sediment. Audit quarterly; a 3,000-token prompt sent a million times a day is real money and real TTFT.
- **Trim conversation history.** Summarize or window old turns instead of re-sending everything (the stateless-API loop from Module 1 is a cost loop too).
- **Cap `max_tokens` deliberately.** Output tokens are the most expensive and the slowest. If a classification needs one word, don't leave headroom for an essay. Instructing the model to be concise ("answer in ≤2 sentences") cuts both cost and decode time.
- **Don't ask for what you'll throw away.** If you only need a JSON field, request only that field.

## Batch APIs: half price for patience

Both Anthropic and OpenAI offer **batch APIs**: submit a file of requests, get results back within a 24-hour window (usually much sooner), at roughly **50% of the synchronous price**. Anything offline belongs there — nightly enrichment jobs, dataset labeling, embedding-adjacent preprocessing, bulk eval runs from Module 7. The mental shift is to classify every workload as *interactive* (user waiting) or *offline* (nobody waiting) and route the offline half to batch by default.

## Self-hosting: when the math flips

Open-weight models served on your own GPUs via **vLLM** or similar engines can beat API pricing — *at sufficient, steady volume*. The serving stack matters: vLLM's **continuous batching** keeps GPUs saturated by interleaving many requests' decode steps, and PagedAttention manages KV-cache memory efficiently, which is what makes self-hosted throughput competitive at all.

| Factor | Provider API | Self-hosted (vLLM etc.) |
|---|---|---|
| Cost shape | Pure per-token, scales to zero | Fixed GPU cost; cheap only when utilized |
| Ops burden | None | Serving, scaling, upgrades, on-call |
| Model quality | Frontier access | Open-weight ceiling |
| Data control | Provider terms | Fully in-house |

The honest rule of thumb: if your GPUs would sit under ~50% utilization, or you don't have infra engineers who want this job, the API is cheaper than it looks and self-hosting is more expensive than it looks.

## Measure before optimizing

None of this works blind. Log per-request token usage, model, TTFT, and total latency with request IDs (you started this habit in Module 1; Module 7's tracing formalized it). Cost dashboards segmented by feature and model tier turn "the bill doubled" from a mystery into a query.

## Key takeaways

- Latency is two metrics: TTFT (prefill-driven) and throughput (decode-driven) — diagnose and fix them separately, and stream for perceived speed.
- Model right-sizing via routing and cascades is the biggest single lever; your eval suite is what makes stepping down tiers safe.
- Cut tokens everywhere: shorter prompts, trimmed history, deliberate `max_tokens`, concise-output instructions.
- Route all non-interactive work to batch APIs for ~50% savings.
- Self-hosting with vLLM and continuous batching wins only at high, steady utilization — otherwise pay the API.
- Optimize from data: per-request usage and latency logging is a prerequisite, not a nice-to-have.
