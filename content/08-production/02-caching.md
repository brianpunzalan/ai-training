# Caching Strategies

> **What you'll learn:** the three layers of caching for LLM systems — provider prompt caching, exact-match response caching, and semantic caching — how each works mechanically, and the failure modes that bite in production.

## Why caching is different here

Classic web caching asks "have I seen this exact request?" LLM systems get three distinct opportunities, at different layers of the stack:

| Layer | What's cached | Saves | Typical hit rate |
|---|---|---|---|
| **Prompt caching** (provider-side) | The KV cache for a prompt *prefix* | Prefill compute → cheaper input tokens, faster TTFT | High for stable prefixes |
| **Exact-match response cache** (your side) | Full responses keyed on the request | The entire call | Low unless inputs repeat |
| **Semantic cache** (your side) | Responses keyed on embedding similarity | The entire call | Higher — with real risk |

## Prompt caching: reusing prefill

Recall from Module 1 that prefill builds a **KV cache** over your input before decode begins. Provider prompt caching persists that KV cache server-side, so the next request starting with the *same prefix* skips recomputing it. The result is dramatically cheaper input tokens (cached reads are typically ~90% off) and much better TTFT on long prompts.

The mechanical rule that follows: **caching works on prefixes, so order stable content first.**

```
[system prompt]  [tool definitions]  [long shared documents]  ← stable, cacheable
[conversation history]                                        ← semi-stable
[current user message]                                        ← always new
```

If you interpolate a timestamp or user name into the top of your system prompt, you've broken the prefix for every user. Move anything volatile to the *end*.

Providers differ in ergonomics:

- **Anthropic** is explicit: you mark breakpoints with `cache_control` on content blocks. Cache writes cost a small premium; reads are ~10% of base input price; entries expire after a few minutes of disuse (extendable).
- **OpenAI** is automatic: prompts over ~1,024 tokens are cached on matching prefixes with no code changes, with cached input discounted ~50%.

```python
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=500,
    system=[{
        "type": "text",
        "text": LONG_SYSTEM_PROMPT_AND_DOCS,        # stable content
        "cache_control": {"type": "ephemeral"},     # cache up to here
    }],
    messages=[{"role": "user", "content": user_input}],
)
print(response.usage)  # cache_creation_input_tokens / cache_read_input_tokens
```

```typescript
const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 500,
  system: [{
    type: "text",
    text: LONG_SYSTEM_PROMPT_AND_DOCS,            // stable content
    cache_control: { type: "ephemeral" },         // cache up to here
  }],
  messages: [{ role: "user", content: userInput }],
});
console.log(response.usage); // cache_creation_input_tokens / cache_read_input_tokens
```

Prompt caching is the highest-value cache for agents (Module 5) and RAG systems (Module 4), where a large system prompt plus tool definitions is re-sent on every loop iteration. Verify it's working by watching the cache-read fields in `usage` — a misordered prompt fails silently, you just pay full price.

Note what prompt caching does *not* do: the model still generates a fresh response. It saves prefill, not decode.

## Exact-match response caching

The simplest full-response cache: hash the request (model + prompt + parameters), store the response, return it on identical future requests.

```python
import hashlib, json

def cache_key(model: str, messages: list, params: dict) -> str:
    blob = json.dumps({"m": model, "msgs": messages, "p": params}, sort_keys=True)
    return hashlib.sha256(blob.encode()).hexdigest()
```

```typescript
import { createHash } from "crypto";

function cacheKey(model: string, messages: unknown[], params: object): string {
  const blob = JSON.stringify({ m: model, msgs: messages, p: params });
  return createHash("sha256").update(blob).digest("hex");
}
```

This is a perfect fit for deterministic, repeated work: classification of recurring inputs, template-driven generation, eval runs. It also buys you the reproducibility that temperature 0 alone can't guarantee (Module 1). For open-ended chat it rarely hits — users never phrase things identically twice. Set TTLs, and include the model version in the key so a model upgrade (which you pin and control, per Module 1) invalidates stale entries.

## Semantic caching: higher hit rates, real risk

Semantic caching embeds the incoming query (Module 1's embeddings, Module 4's machinery) and returns a cached response when a previous query is *similar enough* — cosine similarity above a threshold. "How do I reset my password?" and "password reset steps?" now share one cached answer.

The trade is **false hits**. "Cancel my subscription" and "How do I cancel my subscription?" embed very close together but deserve different responses — one is an action request, one is a question. A false hit serves a confidently wrong answer, which is worse than paying for a fresh call. Mitigations:

- Set the similarity threshold conservatively (start ~0.95, tune on logged traffic).
- Scope the cache per-intent or per-user-segment, never across personalized or stateful content.
- Log every cache hit with both queries so you can audit false hits — fold this into your Module 7 tracing.
- Restrict it to genuinely FAQ-shaped traffic.

## Layering them

The three caches compose. A typical production stack checks the exact-match cache, then the semantic cache (if the traffic suits it), and only then calls the API — with the prompt structured so the provider's prompt cache absorbs the prefill. Each layer has a different risk profile: prompt caching is essentially free and safe; exact-match is safe but narrow; semantic is broad but needs supervision.

## Key takeaways

- Prompt caching reuses the prefill KV cache for repeated prompt *prefixes* — order stable content first, volatile content last.
- Anthropic uses explicit `cache_control` breakpoints; OpenAI caches long prompts automatically — verify hits via `usage` fields either way.
- Prompt caching saves input cost and TTFT but not generation; it's most valuable for agents and RAG with large stable prompts.
- Exact-match response caching skips the whole call but only hits on identical requests; key on model + prompt + params with TTLs.
- Semantic caching raises hit rates via embedding similarity but risks confidently wrong false hits — threshold conservatively and audit hits.
- Layer all three: each saves a different cost at a different risk level.
