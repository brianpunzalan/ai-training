# Why Free Text Fails in Production

> **What you'll learn:** why "just ask the model for JSON" breaks at scale, the specific failure modes of free-text output, and the mental shift from *reading* model output to *parsing* it — the foundation for everything else in this module.

## The demo–production gap

In a demo, you read the model's answer with human eyes, which are spectacularly forgiving. In production, the consumer of model output is usually **another program**: a database insert, a UI component, a billing system, a downstream API. Programs are not forgiving. `JSON.parse` either succeeds or throws; there is no "close enough."

This is the central tension of the module: an LLM is a probabilistic text generator (Module 1), and your application needs deterministic, machine-consumable data. Bridging that gap is an engineering discipline, not a prompt trick.

## The failure catalog

Ask a model to "extract the invoice fields as JSON" with no further machinery, run it 10,000 times, and you will observe every one of these:

| Failure mode | Example | Downstream effect |
|---|---|---|
| **Preamble / postamble** | `Sure! Here's the JSON you asked for: {...}` | `JSON.parse` throws on the first character |
| **Markdown fencing** | ` ```json {...} ``` ` | Parse fails unless you strip fences |
| **Schema drift** | `"total_amount"` one call, `"totalAmount"` the next | Silent `undefined`s, null pointer bugs |
| **Wrong types** | `"amount": "1,204.50"` (string with comma) instead of `1204.5` | Type errors or — worse — bad math that *runs* |
| **Invented fields / missing fields** | Adds `"confidence": "high"`; omits a required key | Validation gaps, broken contracts |
| **Truncation** | Hit `max_tokens` mid-object: `{"items": [{"sku": "A-` | Unparseable; recall `finish_reason` from Module 1 |
| **Hallucinated enum values** | `"status": "kinda_paid"` when you allowed `paid\|unpaid` | Constraint violations deep in your system |

None of these are rare. At 99% per-field reliability and 20 fields per extraction, only ~82% of responses are fully correct (0.99²⁰). Free text turns every field into an independent coin flip.

## Why models do this

The failure modes follow directly from the training pipeline in Module 1. Chat models are tuned to be *helpful conversationalists*, so they narrate ("Here's your JSON!"), hedge, and decorate output with Markdown — behaviors that are rewarded in chat and catastrophic in pipelines. And because generation is token-by-token sampling, nothing in the base mechanism enforces that an opened brace gets closed or that a key matches your schema. The model has no parser; *you* are the parser.

Temperature 0 does not save you. It reduces variance, but the model will deterministically produce the same wrong shape if that shape is its most probable continuation — the same lesson as hallucination in Module 1.

## A taxonomy of "structured enough"

Before reaching for tooling, be precise about what you actually need. There are three escalating guarantees:

1. **Syntactically valid JSON** — it parses. Necessary, nowhere near sufficient.
2. **Schema-conformant JSON** — the right keys, types, enums, and required fields. This is the real contract.
3. **Semantically correct values** — the `total` is the *actual* invoice total. No output format can guarantee this; only evals (Module 7) measure it.

A surprising number of production incidents come from teams who solved level 1 (the JSON parses!) and assumed levels 2 and 3 came along for free. Constrained decoding (next lesson) can guarantee levels 1 and 2. Level 3 is forever an empirical question.

## The naive fix, and why it isn't enough

Everyone's first instinct is regex surgery:

```python
import json, re

def extract_json(text: str) -> dict:
    # strip fences, find the first {...} blob, hope
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("no JSON found")
    return json.loads(match.group(0))
```

```typescript
function extractJson(text: string): unknown {
  // strip fences, find the first {...} blob, hope
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no JSON found");
  return JSON.parse(match[0]);
}
```

This is a useful *last-resort salvage layer*, and you'll see it in real codebases. But it only addresses preamble and fencing — it does nothing about schema drift, wrong types, or truncation, and it can happily extract a JSON blob the model wrote *inside its explanation* rather than the answer. Treat it as a band-aid, never as the strategy.

## The mental shift: define the contract first

The professional pattern inverts the workflow. Instead of prompting and then coping with whatever comes back, you:

1. **Define a schema** — Pydantic in Python, Zod in TypeScript — as the single source of truth for what "valid output" means.
2. **Communicate it to the model** — via prompt, JSON mode, strict schema enforcement, or a tool definition (next lesson covers each mechanism and when to use it).
3. **Validate every response against the schema** — never trust, always parse.
4. **Decide what happens on failure** — retry with the error message, fall back, or surface an error. Failure is an expected path, not an exception.

This schema-first contract is the through-line of the module: structured output techniques (next lesson) generate against it, streaming (lesson 3) complicates parsing it, tool calling (lesson 4) is built entirely on it, and agents (Module 5) live or die by it.

## Key takeaways

- In production, model output is consumed by programs, not people — and programs don't forgive preambles, fences, drifting keys, or wrong types.
- Free-text failure modes compound: per-field reliability multiplied across many fields makes "usually fine" outputs frequently broken.
- These failures are structural — chat tuning rewards narration, and token sampling enforces no syntax — so temperature 0 and better prompts only shrink the problem.
- Distinguish three guarantees: parses → matches schema → values are correct. Tooling can deliver the first two; only evals (Module 7) measure the third.
- Regex JSON extraction is a salvage layer, not a strategy. Define a schema (Pydantic/Zod) first and validate every single response against it.
