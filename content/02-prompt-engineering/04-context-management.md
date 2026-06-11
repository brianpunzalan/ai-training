# Context Window Management

> **What you'll learn:** how to treat the context window as a budget with a layout, why position in the prompt changes recall ("lost in the middle"), how prompt caching rewards stable prefixes — and what that implies for how you structure everything from lesson 3's system prompts onward.

## Big windows didn't solve the problem

Frontier models in 2026 routinely offer 200k–1M+ token windows, and it's tempting to conclude context management is obsolete. Three facts say otherwise:

1. **You pay for every token, every call.** A 150k-token context on a chat loop that re-sends history each turn (Module 1) is a recurring bill, not a one-time cost.
2. **Attention degrades with scale and position.** A model that *accepts* 500k tokens does not *attend to* 500k tokens uniformly.
3. **Irrelevant context actively hurts.** Models get distracted by near-miss information; more haystack means more plausible wrong answers, not just slower right ones.

The discipline that's emerged — *context engineering* — treats the window as scarce attention budget: every token should earn its place.

## Lost in the middle: position is part of the prompt

Liu et al.'s *Lost in the Middle* (2023) measured what happens when the answer to a question sits at different positions in a long context. The result is the most cited curve in prompt engineering: performance is **U-shaped**. Models recall information at the *beginning* and *end* of the context far better than information buried in the middle — in the original experiments, mid-context placement could underperform even having no documents at all. Newer long-context models have flattened the U considerably, but the bias persists and you should design for it:

| Slot | What to put there |
|---|---|
| **Top** (beginning) | System prompt: role, rules, output format — plus large stable reference material |
| **Middle** | Bulk content: retrieved documents, conversation history, data |
| **Bottom** (end) | The current question/task, and a brief restatement of critical instructions on very long prompts |

Two corollaries. First, put the user's *question after the documents*, not before — the model reads the data already knowing what it's looking for is irrelevant (it has no foresight; the final tokens are simply best-recalled). Second, when a 100k-token prompt ignores an instruction from the top, that's not the model being "disobedient"; it's geometry. Repeat the load-bearing instruction near the end.

Structure helps attention too: delimit sections with XML tags or Markdown headers (`<documents>`, `<conversation_history>`, `<task>`) so the model can tell data from instructions — which is also your injection-hygiene boundary from lesson 3.

## Prompt caching: stability is money

Providers cache the processed prefill state (the KV cache from Module 1) of your prompt's **prefix**. On Anthropic's API you mark cache breakpoints explicitly; OpenAI caches automatically. Cached prefix tokens cost a fraction of fresh ones — on the order of 10% — with cache *writes* costing slightly more than normal.

```python
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1000,
    system=[
        {
            "type": "text",
            "text": BIG_STABLE_SYSTEM_PROMPT,   # rules + docs, identical every call
            "cache_control": {"type": "ephemeral"},
        }
    ],
    messages=conversation,  # the part that changes
)
```

```typescript
const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1000,
  system: [
    {
      type: "text",
      text: BIG_STABLE_SYSTEM_PROMPT, // rules + docs, identical every call
      cache_control: { type: "ephemeral" },
    },
  ],
  messages: conversation, // the part that changes
});
```

The catch that shapes prompt design: **caching is prefix-based and exact-match**. One changed byte invalidates everything after it. This has concrete implications:

- **Order by volatility.** Stable content first (system rules, schemas, reference docs), volatile content last (history, the current request). A timestamp interpolated into line 2 of your system prompt destroys the cache on every call.
- **Lesson 3's templates need a second look.** `Today's date: {date}` at the top of the system prompt is a cache bomb if it includes minutes; date-only granularity, or moving volatile context into the first user message, preserves the prefix.
- **Dynamic few-shot (lesson 1) trades cache hits for relevance.** Per-request example selection changes the prefix every call. Static examples cache; retrieved ones don't. Measure which wins for your traffic.
- **Caches expire** (typically ~5 minutes to an hour depending on tier), so the economics favor high-frequency, shared-prefix workloads — exactly what chatbots and agents are.

Module 8 works the cost math; here the lesson is architectural: *cache-friendliness is a reason to keep system prompts stable and versioned, not ad-hoc.*

## Managing the growing conversation

The chat loop appends forever; the window (and your budget) doesn't. Standard strategies, in ascending sophistication:

1. **Hard truncation** — keep system prompt + last N turns. Simple, drops the oldest context cold.
2. **Rolling summarization** — when history exceeds a threshold, summarize the oldest turns into a compact paragraph and keep recent turns verbatim. Loses detail gracefully; costs a summarization call. (Note: rewriting history invalidates the conversation's cache prefix — batch your compactions rather than summarizing every turn.)
3. **Externalized memory** — store facts/decisions outside the context and retrieve them on demand. This is RAG (Module 4) applied to the conversation itself, and the backbone of agent memory in Module 3.

```python
def fit_history(messages: list, max_tokens: int, count_tokens) -> list:
    """Keep system + most recent turns that fit the budget."""
    system, turns = messages[0], messages[1:]
    kept, total = [], count_tokens([system])
    for turn in reversed(turns):              # newest first
        t = count_tokens([turn])
        if total + t > max_tokens:
            break
        kept.append(turn)
        total += t
    return [system] + list(reversed(kept))
```

```typescript
function fitHistory(messages: Msg[], maxTokens: number, countTokens: (m: Msg[]) => number): Msg[] {
  // Keep system + most recent turns that fit the budget.
  const [system, ...turns] = messages;
  const kept: Msg[] = [];
  let total = countTokens([system]);
  for (const turn of [...turns].reverse()) {   // newest first
    const t = countTokens([turn]);
    if (total + t > maxTokens) break;
    kept.push(turn);
    total += t;
  }
  return [system, ...kept.reverse()];
}
```

Whatever strategy you pick, leave headroom: the window holds input *plus* output (Module 1), and a prompt filled to 99% truncates the response.

## Key takeaways

- Treat the context window as paid attention budget — irrelevant tokens cost money *and* accuracy, regardless of how big the window is.
- Recall is U-shaped ("lost in the middle"): instructions at the top, bulk data in the middle, the actual task at the end; restate critical rules late in very long prompts.
- Prompt caching makes stable prefixes ~90% cheaper — order content stable-first, keep volatile values out of the system prompt, and know that one changed byte invalidates everything after it.
- Conversations need an explicit policy — truncate, summarize, or externalize to memory/RAG (Modules 3–4) — because the chat loop grows without bound.
- Always budget headroom for the output; input and output share the window.
