# Zero-shot, Few-shot & In-context Learning

> **What you'll learn:** what in-context learning actually is (and isn't), when zero-shot is enough, how to construct few-shot examples that work, and why example selection and ordering change your results more than most people expect.

## In-context learning is pattern completion, not learning

The GPT-3 paper (*Language Models are Few-Shot Learners*, 2020) named the phenomenon that still underpins most prompt engineering: put a few input→output examples in the prompt, and the model performs the task on a new input — **with no weight updates whatsoever**.

Remember Module 1: the model predicts the next token given the context. Examples in the prompt don't teach it anything; they *condition* it. You're narrowing the space of plausible continuations until "do the task the way these examples do it" becomes the most probable completion. The model already learned thousands of task patterns in pre-training; your examples are coordinates pointing at one of them.

This framing makes the practical rules fall out naturally: examples steer *format and style* extremely well, *task selection* well, and *new knowledge* not at all. If the capability isn't in the weights, three examples won't put it there — that's what retrieval (Module 4) and fine-tuning are for.

## Zero-shot: the correct starting point

Zero-shot means instructions only, no examples. With 2026-era instruction-tuned models, zero-shot is far stronger than folk wisdom suggests, and it should always be your baseline — it's the cheapest prompt you'll ever ship, and you can't know whether examples help until you've measured the example-free version (the iteration workflow in lesson 5 makes this concrete).

Zero-shot tends to be enough when the task is common (summarize, translate, classify into obvious categories) and your output format is simple. It tends to fail when the task has *house rules*: your label taxonomy, your edge-case policy, your exact output schema. Instructions describe; examples *demonstrate* — and demonstration is a higher-bandwidth channel.

## Few-shot mechanics: demonstrate, don't describe

The strongest format for chat APIs is putting examples in as **alternating user/assistant turns**, so the model sees literal precedents of "what I should have said":

```python
import anthropic

client = anthropic.Anthropic()

EXAMPLES = [
    ("Order arrived crushed, box was soaked.", '{"category": "shipping_damage", "urgency": "high"}'),
    ("How do I change my billing email?",      '{"category": "account", "urgency": "low"}'),
    ("App charges me twice every month!!",     '{"category": "billing", "urgency": "high"}'),
]

def classify(ticket: str) -> str:
    messages = []
    for user_text, label in EXAMPLES:
        messages.append({"role": "user", "content": user_text})
        messages.append({"role": "assistant", "content": label})
    messages.append({"role": "user", "content": ticket})

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=100,
        system="Classify the support ticket. Reply with JSON only: {category, urgency}.",
        messages=messages,
    )
    return response.content[0].text
```

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const EXAMPLES: Array<[string, string]> = [
  ["Order arrived crushed, box was soaked.", '{"category": "shipping_damage", "urgency": "high"}'],
  ["How do I change my billing email?",      '{"category": "account", "urgency": "low"}'],
  ["App charges me twice every month!!",     '{"category": "billing", "urgency": "high"}'],
];

async function classify(ticket: string): Promise<string> {
  const messages = EXAMPLES.flatMap(([userText, label]) => [
    { role: "user" as const, content: userText },
    { role: "assistant" as const, content: label },
  ]);
  messages.push({ role: "user", content: ticket });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 100,
    system: "Classify the support ticket. Reply with JSON only: {category, urgency}.",
    messages,
  });
  return response.content[0].type === "text" ? response.content[0].text : "";
}
```

Inline examples inside the system prompt (wrapped in `<example>` tags) also work and are easier to cache as one stable block — lesson 4 covers that trade-off.

## Selection and ordering effects are real

Few-shot is not "grab any three examples." Research on calibration and ordering (Zhao et al., Lu et al.) found accuracy swings of tens of points from *the same examples in different orders*. The biases to engineer around:

| Bias | What happens | Mitigation |
|---|---|---|
| **Majority label bias** | Model over-predicts the label that appears most among examples | Balance labels across examples |
| **Recency bias** | The *last* example's label/style is disproportionately favored | Don't end on a rare class; shuffle and measure |
| **Format anchoring** | Model copies example formatting more faithfully than instructions | A feature — make examples format-perfect |
| **Surface mimicry** | Length, tone, even typos get imitated | Examples should look exactly like ideal outputs |

Practical selection rules: cover the **edge cases that define your policy**, not three easy wins (the model already gets easy cases zero-shot); keep labels balanced; and verify every example is correct — one mislabeled example is an instruction to be wrong. Diminishing returns arrive fast: 2–5 well-chosen examples usually capture most of the gain, and beyond that you're mostly paying input-token rent.

For high-variance tasks, the production-grade pattern is **dynamic few-shot**: embed a library of vetted examples, retrieve the *k* most similar to the incoming input, and splice them into the prompt. It's the same machinery you'll build for RAG in Module 4 applied to demonstrations instead of documents — with the caveat that varying examples per request defeats prompt caching (lesson 4).

## Choosing your operating point

| Approach | Cost | Best for | Watch out for |
|---|---|---|---|
| Zero-shot | Lowest | Common tasks, simple formats | Ambiguous house rules |
| Few-shot (static) | + ~100–500 tokens/example | Custom taxonomies, strict formats, tone | Bias from ordering/imbalance |
| Dynamic few-shot | + retrieval infra | High-variance inputs at scale | Cache misses; bad neighbors |
| Fine-tuning | Training + ops cost | Stable, high-volume, well-specified tasks | Frozen behavior; eval burden |

Treat this as a ladder: climb only when your evals (Module 7) say the rung below isn't good enough.

## Key takeaways

- In-context learning is conditioning, not training: examples select a pattern the model already has; they don't add knowledge.
- Always baseline zero-shot first — modern instruction-tuned models make examples unnecessary more often than you'd guess.
- Few-shot's superpower is demonstrating format, style, and edge-case policy; alternating user/assistant turns is the strongest encoding.
- Selection and ordering matter: balance labels, mind recency bias, choose boundary-defining examples, and never include a wrong one.
- 2–5 good examples capture most of the gain; past that you're buying tokens, not accuracy.
- Dynamic few-shot (retrieving similar examples per input) scales quality but trades away prompt-cache hits.
