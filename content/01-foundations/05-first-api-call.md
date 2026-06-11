# Your First API Call

> **What you'll learn:** the anatomy of a chat completion request — roles, messages, and the response object — plus the error handling and hygiene habits that separate scripts from production code. This lesson pairs with **Lab 01**.

## The universal shape

Every major provider's chat API has converged on the same conceptual shape: you send a **list of messages**, each with a **role**, and receive an assistant message back.

```python
from openai import OpenAI   # the same shape works for any OpenAI-compatible API

client = OpenAI()  # reads OPENAI_API_KEY from the environment

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[
        {"role": "system", "content": "You are a concise technical assistant."},
        {"role": "user", "content": "Explain idempotency in one paragraph."},
    ],
    max_tokens=300,
    temperature=0.3,
)

print(response.choices[0].message.content)
print(response.usage)   # prompt_tokens, completion_tokens — watch these
```

```typescript
import OpenAI from "openai";

const client = new OpenAI(); // reads OPENAI_API_KEY from the environment

const response = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [
    { role: "system", content: "You are a concise technical assistant." },
    { role: "user", content: "Explain idempotency in one paragraph." },
  ],
  max_tokens: 300,
  temperature: 0.3,
});

console.log(response.choices[0].message.content);
console.log(response.usage); // prompt_tokens, completion_tokens — watch these
```

Anthropic's API is the same idea with two differences worth knowing: the system prompt is a top-level `system` parameter (not a message), and `max_tokens` is required:

```python
import anthropic

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=300,
    system="You are a concise technical assistant.",
    messages=[{"role": "user", "content": "Explain idempotency in one paragraph."}],
)
print(response.content[0].text)
```

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY

const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 300,
  system: "You are a concise technical assistant.",
  messages: [{ role: "user", content: "Explain idempotency in one paragraph." }],
});
console.log(response.content[0].type === "text" ? response.content[0].text : "");
```

Because nearly everyone supports the OpenAI-compatible shape (including local model servers like Ollama), this course's labs use a tiny provider-agnostic wrapper (`labs/_shared/`) — set `LLM_PROVIDER` and go.

## Roles: the contract of the message list

- **`system`** — instructions from *you, the developer*: persona, rules, output format. Highest authority; users never see or write it. (Module 2 treats this as a versioned software contract.)
- **`user`** — input from the human (or from your application on their behalf).
- **`assistant`** — the model's prior turns. You send these back to give the model "memory."
- **`tool` / tool results** — results of function calls (Module 3).

The critical mental model, again: **the API is stateless.** A "conversation" is your application re-sending the full message list every turn:

```python
messages = [{"role": "system", "content": SYSTEM_PROMPT}]

while True:
    messages.append({"role": "user", "content": input("> ")})
    reply = chat(messages)                                   # full history every time
    messages.append({"role": "assistant", "content": reply}) # and it grows...
    print(reply)
```

That growing list is also your growing token bill — context management (Module 2) exists because of this loop.

## Reading the response like a professional

Three fields deserve attention on *every* call:

1. **The content** — obviously.
2. **`usage`** — input and output token counts. Log them from day one; cost surprises are the #1 rookie production incident.
3. **`finish_reason` / `stop_reason`** — *why* generation ended:
   - `stop` / `end_turn` — natural completion ✅
   - `length` / `max_tokens` — **truncated**; your output (and any JSON in it) may be cut mid-token
   - `tool_use` / `tool_calls` — the model wants to call a function (Module 3)
   - `content_filter` / `refusal` — safety systems intervened

Code that ignores `finish_reason` works in the demo and fails quietly in production.

## Error handling: the part everyone skips

LLM APIs fail routinely — rate limits (429), overload (529/503), timeouts. The standard remedy is **retry with exponential backoff and jitter**:

```python
import time, random

def with_retries(fn, max_attempts=5):
    for attempt in range(max_attempts):
        try:
            return fn()
        except RateLimitError:
            if attempt == max_attempts - 1:
                raise
            delay = min(2 ** attempt + random.random(), 30)
            time.sleep(delay)
```

```typescript
async function withRetries<T>(fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const retriable = err?.status === 429 || err?.status >= 500;
      if (!retriable || attempt === maxAttempts - 1) throw err;
      const delay = Math.min(2 ** attempt * 1000 + Math.random() * 1000, 30_000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
```

(Official SDKs retry some errors automatically — but know what your stack does rather than assuming.)

## Hygiene checklist

- **API keys live in environment variables** (or a secrets manager) — never in code, never in git. `export ANTHROPIC_API_KEY=...` / `.env` with `.gitignore`.
- **Pin model versions** (`claude-sonnet-4-6`, `gpt-4o-2024-08-06`) in production rather than floating aliases — upgrades change behavior; you want to choose when.
- **Set timeouts** — a hung request should fail fast, not hold a worker thread for minutes.
- **Log request/response/usage** with a request ID — you cannot debug what you didn't record (Module 7 formalizes this as tracing).

## 🧪 Lab 01

Time to write code: **Lab 01 — Your First API Call & Sampling Params** has you build a CLI that calls a model through the shared wrapper, prints usage and finish reason, and demonstrates temperature effects empirically by sampling the same prompt at different settings. Python and TypeScript starters provided.

## Key takeaways

- One shape everywhere: a list of role-tagged messages in, an assistant message out. The API is stateless — you re-send history every turn.
- `system` instructions are the developer's channel; treat them as code.
- Always read `usage` and `finish_reason`; truncation and cost issues are silent otherwise.
- Retry with backoff on 429/5xx; set timeouts; keep keys in the environment; pin model versions.
