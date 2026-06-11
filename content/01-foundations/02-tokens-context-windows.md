# Tokens, Tokenization & Context Windows

> **What you'll learn:** what tokens actually are, why they drive cost and latency, how context windows constrain your designs, and the classic failure modes tokenization causes.

## Tokens are the model's atoms

Models don't see characters or words — they see **tokens**: subword chunks produced by a tokenizer (typically Byte-Pair Encoding or similar). The tokenizer has a fixed vocabulary (~50k–250k entries) learned from data so that common strings get short encodings:

```
"The quick brown fox"     → ["The", " quick", " brown", " fox"]        (4 tokens)
"internationalization"    → ["international", "ization"]               (2 tokens)
"asdkjh3#!x"              → ["as", "dk", "jh", "3", "#!", "x"]          (6 tokens)
```

Useful rules of thumb for English:

- **1 token ≈ 4 characters ≈ 0.75 words** — so 1,000 words ≈ 1,300 tokens.
- Code is denser in tokens than prose (symbols, whitespace).
- Non-English languages often cost **2–4× more tokens** for the same content — a real cost and latency issue for multilingual products.
- JSON is token-expensive: every quote, brace, and repeated key costs tokens.

Try it yourself: paste text into the [OpenAI tokenizer](https://platform.openai.com/tokenizer) and watch how it splits.

## Why tokens are the unit of everything

Tokens are how you pay, wait, and fit:

1. **Cost** — APIs price per million tokens, with output tokens typically 3–5× the input price. A verbose system prompt re-sent on every request is a recurring tax.
2. **Latency** — output is generated token by token; long responses are slow responses. Asking for concise output is a *performance* optimization, not just style.
3. **Capacity** — the context window is a hard token budget for *input + output combined*.

Counting tokens programmatically:

```python
# Most providers expose a count endpoint or library; tiktoken works for OpenAI models
import tiktoken

enc = tiktoken.get_encoding("o200k_base")
n = len(enc.encode("How many tokens is this sentence?"))
print(n)
```

```typescript
// npm install js-tiktoken
import { getEncoding } from "js-tiktoken";

const enc = getEncoding("o200k_base");
const n = enc.encode("How many tokens is this sentence?").length;
console.log(n);
```

Exact counts differ per model family — for billing-critical work, use the provider's own counting endpoint (e.g. Anthropic's `count_tokens`).

## The context window

The **context window** is the maximum number of tokens the model can process in one call — system prompt + conversation history + retrieved documents + tool definitions + the response it generates. Modern windows range from ~128k to 1M+ tokens, but three caveats matter more than the headline number:

1. **You pay for everything in the window, every call.** A 100-turn conversation re-sends all 100 turns each time. Cost grows quadratically with conversation length unless you summarize or truncate.
2. **Attention quality degrades over long contexts.** The "lost in the middle" effect is well documented: models recall information at the start and end of the context better than the middle. 1M tokens of capacity is not 1M tokens of *reliable attention*.
3. **The output needs room too.** If you fill the window with input, generation gets cut off mid-sentence (`max_tokens` exhaustion — check the `stop_reason`/`finish_reason` on every response).

### Practical context budgeting

A production prompt is a budget allocation. A typical pattern:

| Slot | Budget | Notes |
|---|---|---|
| System prompt | 0.5–2k | Versioned, cached (Module 8) |
| Tool definitions | 0.5–3k | Only the tools relevant to this task |
| Retrieved context (RAG) | 2–20k | Top-k chunks, reranked |
| Conversation history | bounded | Truncate or summarize old turns |
| Output reserve | 1–8k | Set `max_tokens` deliberately |

We return to this in *Context Window Management* (Module 2) — managing this budget deliberately is the heart of context engineering.

## Tokenization failure modes worth memorizing

These confuse every newcomer, and all of them are tokenization artifacts:

- **"How many r's in strawberry?"** — the model sees `straw` + `berry` as tokens, not letters. Character-level tasks are unreliable without tool use.
- **Arithmetic on long numbers** — `123456789` may tokenize as `123`, `456`, `789`; digit manipulation across token boundaries is error-prone.
- **Leading whitespace matters** — `"hello"` and `" hello"` are different tokens; malformed prompt templates can subtly change behavior.
- **Reversing strings, acrostics, rhyme schemes** — all character-level, all unreliable.
- **Cost surprises in other languages** — a Thai or Hindi product can cost several times your English-based estimate.

When you see a model fail bizarrely at something "easy," ask first: *is this a token-level task?* If yes, give it a tool (Module 3).

## Key takeaways

- Tokens are subword chunks; ~4 chars / ~0.75 English words each. Everything — cost, latency, capacity — is denominated in tokens.
- Output tokens cost more and take longer than input tokens; brevity is an optimization.
- The context window bounds input + output together; budget it like memory in an embedded system.
- Long contexts degrade in the middle — more window ≠ uniformly reliable recall.
- Character-level failures (counting letters, reversing strings) are tokenizer artifacts; route those tasks to tools.
