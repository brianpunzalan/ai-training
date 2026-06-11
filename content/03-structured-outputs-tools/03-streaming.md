# Streaming Responses

> **What you'll learn:** how server-sent events deliver tokens as they're generated, why time-to-first-token is the latency metric users actually feel, and how to resolve the tension between streaming and structured JSON. This lesson pairs with **Lab 02**.

## Why streaming exists

Recall the prefill/decode split from Module 1: the model processes your prompt in one pass, then generates output one token at a time. A 500-token answer at ~50 tokens/second takes ten seconds to finish — but the *first* token is ready in well under a second. A non-streaming API holds the complete response until the last token; streaming hands you each chunk as it's decoded.

That changes the metric that matters. **Time-to-first-token (TTFT)** — dominated by network plus prefill, so long prompts raise it — is what users perceive as "is it responding?" **Tokens per second** governs how long the answer takes to finish, but research on perceived latency is unambiguous: an interface that starts answering in 300 ms *feels* fast even if the full answer takes ten seconds, while a five-second blank stare feels broken. Every serious chat UI streams; for pipelines with no human watching, streaming buys little and complicates parsing — often the right call is not to stream.

## The wire format: server-sent events

LLM streaming runs on **SSE (server-sent events)** — not WebSockets. SSE is just a long-lived HTTP response with `Content-Type: text/event-stream`, where the server writes blank-line-separated events:

```
event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hel"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"lo!"}}
```

One-directional server→client push is all token streaming needs, and SSE survives proxies and load balancers that WebSockets fight with. OpenAI-style streams send `data:` lines ending with `data: [DONE]`; Anthropic uses named events (`message_start`, `content_block_delta`, `message_delta`, `message_stop`). You'll rarely parse this by hand — SDKs expose streams as async iterators:

```python
import anthropic
client = anthropic.Anthropic()

with client.messages.stream(
    model="claude-sonnet-4-6", max_tokens=500,
    messages=[{"role": "user", "content": "Explain SSE in two sentences."}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
final = stream.get_final_message()      # full message, usage, stop_reason
```

```typescript
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();

const stream = client.messages.stream({
  model: "claude-sonnet-4-6", max_tokens: 500,
  messages: [{ role: "user", content: "Explain SSE in two sentences." }],
});
stream.on("text", (text) => process.stdout.write(text));
const final = await stream.finalMessage(); // full message, usage, stop_reason
```

Two production notes the demos skip. First, `usage` and `stop_reason` arrive in the *final* events — if you abandon the stream early you lose them, and your cost logging (Module 1 hygiene) silently breaks. Second, streams fail *mid-flight*: a connection drop after 200 tokens is not a clean error, and retrying re-generates (and re-bills) from scratch. Decide up front whether a partial answer is shown, discarded, or retried.

## The tension: streaming meets structured output

Here's the collision at the heart of this module. Lesson 2 said: validate complete JSON against a schema. Streaming says: you never have complete JSON until the end. While the model is mid-generation, you're holding this:

```
{"vendor": "Acme Corp", "line_items": ["wid
```

Truncated mid-string — `json.loads`/`JSON.parse` throw. Three strategies, in increasing order of sophistication:

| Strategy | How | When |
|---|---|---|
| **Buffer, then parse** | Accumulate the whole stream, parse once at the end | No UI consumes partial data; you only wanted TTFT for timeout health |
| **Partial JSON parsing** | A tolerant parser "closes" dangling strings/brackets to yield the best-effort object so far | Live UIs that render fields as they fill in |
| **Typed partial streams** | SDK validates each partial snapshot against your schema with all fields optional-until-complete | Generative UI; the polished version of strategy 2 |

Partial-JSON repair is mechanical enough to write yourself — and you will, in the lab:

```python
def parse_partial(buffer: str) -> dict | None:
    """Best-effort parse of an incomplete JSON object stream."""
    closers = {"{": "}", "[": "]"}
    stack, in_string, escaped = [], False, False
    for ch in buffer:
        if escaped: escaped = False; continue
        if ch == "\\" and in_string: escaped = True; continue
        if ch == '"': in_string = not in_string; continue
        if not in_string and ch in closers: stack.append(closers[ch])
        elif not in_string and stack and ch == stack[-1]: stack.pop()
    repaired = buffer + ('"' if in_string else "") + "".join(reversed(stack))
    try:
        return json.loads(repaired)
    except json.JSONDecodeError:
        return None  # not yet parseable; wait for more tokens
```

```typescript
function parsePartial(buffer: string): unknown | null {
  // Best-effort parse of an incomplete JSON object stream.
  const closers: Record<string, string> = { "{": "}", "[": "]" };
  const stack: string[] = [];
  let inString = false, escaped = false;
  for (const ch of buffer) {
    if (escaped) { escaped = false; continue; }
    if (ch === "\\" && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (!inString && closers[ch]) stack.push(closers[ch]);
    else if (!inString && stack.length && ch === stack[stack.length - 1]) stack.pop();
  }
  const repaired = buffer + (inString ? '"' : "") + stack.reverse().join("");
  try { return JSON.parse(repaired); } catch { return null; }
}
```

The cardinal rule: **partial objects are for display, never for action**. Render `vendor: "Acme Corp"` as it streams in, but don't write to the database or fire a side effect until the stream completes and the *final* buffer passes real schema validation (Pydantic/Zod, exactly as in lesson 2). A half-streamed `total` of `1` that was going to be `1204.5` is not a value, it's a moment in time. Tool-call arguments stream the same way — as `input_json_delta` / argument-delta chunks — which is why agent UIs (Module 5) can show a tool call forming before executing it only once it's complete.

## Key takeaways

- Streaming exploits token-by-token decoding to cut perceived latency: TTFT (network + prefill) is what users feel; tokens/second only sets total duration.
- The transport is SSE — a long-lived HTTP response of `data:` events — not WebSockets; SDKs wrap it as async iterators.
- Usage and stop_reason arrive at the *end* of the stream; abandoning early breaks cost logging, and mid-stream disconnects need an explicit partial-output policy.
- Streaming and JSON conflict because partial JSON doesn't parse; resolve it by buffering, tolerant partial parsing, or SDK typed partial streams.
- Partial parses are for rendering only — act (DB writes, side effects) solely on the complete, schema-validated final output.

## Lab

Put this into practice in **Lab 02 — Streaming + Structured JSON Output** (find it in the Labs section of the site): you'll consume an SSE stream, measure TTFT empirically, and build a partial-JSON renderer that validates the final object with Pydantic/Zod.
