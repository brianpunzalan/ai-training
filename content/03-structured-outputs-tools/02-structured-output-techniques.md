# Structured Output Techniques

> **What you'll learn:** the three mechanisms for getting schema-conformant output — prompt-and-validate-and-retry, JSON mode, and constrained decoding with strict schemas — how OpenAI Structured Outputs and Anthropic's tool-use pattern implement them, and how to choose.

## Three mechanisms, three guarantee levels

Last lesson established the contract: define a schema, validate everything. This lesson covers how to get the model to *meet* that contract. Every technique in the ecosystem is one of three mechanisms:

| Mechanism | Guarantee | How it works |
|---|---|---|
| **Prompt + validate + retry** | None up front; convergence via loop | Schema in the prompt; validate the output; on failure, re-prompt with the validation error |
| **JSON mode** | Syntactically valid JSON | Provider constrains sampling to JSON grammar — but *any* JSON, not *your* JSON |
| **Constrained decoding (strict schemas)** | Schema-conformant JSON | At each decode step, tokens that would violate your JSON Schema are masked out before sampling |

Constrained decoding is the interesting one mechanically: the provider compiles your JSON Schema into a grammar, and during generation, logits for any token that would break the grammar are set to −∞. The model *cannot* emit a wrong key or an unclosed brace — invalid continuations have zero probability. This is why it guarantees levels 1 and 2 from last lesson while leaving level 3 (are the values *true*?) untouched.

## The schema, once, in both languages

Everything below uses this schema. Define it with validation libraries, not hand-written JSON Schema — you get the parser and the schema from one definition:

```python
from pydantic import BaseModel, Field
from typing import Literal

class Invoice(BaseModel):
    vendor: str
    total: float = Field(description="Grand total in USD")
    currency: Literal["USD", "EUR", "GBP"]
    line_items: list[str]
```

```typescript
import { z } from "zod";

const Invoice = z.object({
  vendor: z.string(),
  total: z.number().describe("Grand total in USD"),
  currency: z.enum(["USD", "EUR", "GBP"]),
  lineItems: z.array(z.string()),
});
type Invoice = z.infer<typeof Invoice>;
```

## Mechanism 1: prompt + validate + retry

Works with *every* model, including local and older ones. Put the schema in the prompt, parse, and on failure feed the validation error back:

```python
def extract(text: str, retries: int = 2) -> Invoice:
    messages = [{"role": "user", "content": f"Extract the invoice as JSON matching this schema:\n{Invoice.model_json_schema()}\n\n{text}\nReply with JSON only."}]
    for _ in range(retries + 1):
        raw = chat(messages)  # provider-agnostic wrapper from Lab 01
        try:
            return Invoice.model_validate_json(raw)
        except Exception as e:
            messages += [{"role": "assistant", "content": raw},
                         {"role": "user", "content": f"Invalid: {e}. Reply with corrected JSON only."}]
    raise ValueError("extraction failed after retries")
```

```typescript
async function extract(text: string, retries = 2): Promise<Invoice> {
  const schema = JSON.stringify(z.toJSONSchema(Invoice));
  const messages = [{ role: "user" as const, content: `Extract the invoice as JSON matching this schema:\n${schema}\n\n${text}\nReply with JSON only.` }];
  for (let i = 0; i <= retries; i++) {
    const raw = await chat(messages); // provider-agnostic wrapper from Lab 01
    const parsed = Invoice.safeParse(tryJson(raw));
    if (parsed.success) return parsed.data;
    messages.push({ role: "assistant", content: raw } as any,
                  { role: "user", content: `Invalid: ${parsed.error.message}. Reply with corrected JSON only.` } as any);
  }
  throw new Error("extraction failed after retries");
}
```

The retry-with-error-message step matters: models are good at fixing a *named* mistake. Cost is the catch — each retry is a full round trip, and tail latency doubles or triples. Libraries like Instructor (Python) and the Vercel AI SDK package this loop for you.

## Mechanism 2: JSON mode

`response_format: {"type": "json_object"}` (OpenAI and compatible APIs). Generation is constrained to valid JSON syntax — no preamble, no fences, no unclosed braces. But the keys, types, and structure are whatever the model feels like, so **you still need the schema in the prompt and validation after**. JSON mode kills an entire class of parse failures cheaply; treat it as a floor, not a solution.

## Mechanism 3: strict schemas / constrained decoding

**OpenAI Structured Outputs** takes the schema as part of the request and guarantees conformance:

```python
from openai import OpenAI
client = OpenAI()

resp = client.responses.parse(          # SDK converts the Pydantic model to a strict JSON Schema
    model="gpt-4o-2024-08-06",
    input=[{"role": "user", "content": f"Extract the invoice: {text}"}],
    text_format=Invoice,
)
invoice = resp.output_parsed            # already an Invoice instance
```

```typescript
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
const client = new OpenAI();

const resp = await client.responses.parse({
  model: "gpt-4o-2024-08-06",
  input: [{ role: "user", content: `Extract the invoice: ${text}` }],
  text_format: zodTextFormat(Invoice, "invoice"),
});
const invoice = resp.output_parsed; // typed as Invoice
```

Strict mode imposes schema restrictions (all fields required, `additionalProperties: false`, a subset of JSON Schema) — optionality is expressed as nullable fields. There's a one-time latency cost when a new schema is compiled; it's cached afterward.

**Anthropic** offers structured outputs via an `output_format` parameter on newer models, but the long-standing portable pattern is **tool use as an output channel**: define a single tool whose `input_schema` is your schema, force it with `tool_choice`, and read the arguments — you never execute anything:

```python
import anthropic
client = anthropic.Anthropic()

resp = client.messages.create(
    model="claude-sonnet-4-6", max_tokens=1024,
    tools=[{"name": "record_invoice", "description": "Record the extracted invoice",
            "input_schema": Invoice.model_json_schema()}],
    tool_choice={"type": "tool", "name": "record_invoice"},
    messages=[{"role": "user", "content": f"Extract the invoice: {text}"}],
)
invoice = Invoice.model_validate(resp.content[0].input)  # still validate
```

```typescript
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();

const resp = await client.messages.create({
  model: "claude-sonnet-4-6", max_tokens: 1024,
  tools: [{ name: "record_invoice", description: "Record the extracted invoice",
            input_schema: z.toJSONSchema(Invoice) as any }],
  tool_choice: { type: "tool", name: "record_invoice" },
  messages: [{ role: "user", content: `Extract the invoice: ${text}` }],
});
const block = resp.content.find((b) => b.type === "tool_use");
const invoice = Invoice.parse((block as any).input); // still validate
```

This trick — tools as typed output, not actions — previews lesson 4, where the same machinery drives real function calls.

## Choosing

- **Strict schemas / constrained decoding** when your provider supports them: strongest guarantee, no retry cost. Default choice in 2026.
- **Prompt + validate + retry** for local/open models, providers without strict mode, or schemas too rich for strict-mode restrictions.
- **JSON mode alone** almost never — it's what you settle for, not what you choose.
- **Always validate anyway.** Even "guaranteed" paths can refuse, truncate at `max_tokens`, or return a refusal block. And no mechanism guarantees the *values* are right — that's your eval suite (Module 7).

## Key takeaways

- Three mechanisms: prompt-validate-retry (universal, costs retries), JSON mode (valid syntax only), constrained decoding (schema conformance enforced by masking invalid tokens at decode time).
- JSON mode guarantees *some* JSON; strict schemas guarantee *your* JSON. Neither guarantees correct values.
- OpenAI Structured Outputs takes a strict JSON Schema in the request; with Anthropic, forced tool use is the portable equivalent — a tool schema used as an output channel.
- Define schemas once in Pydantic/Zod and derive the JSON Schema; never maintain schema and validator separately.
- Validate every response regardless of mechanism — refusals, truncation, and semantic errors all survive "guaranteed" structure.
