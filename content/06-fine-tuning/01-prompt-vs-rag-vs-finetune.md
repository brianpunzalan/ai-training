# Prompting vs RAG vs Fine-Tuning

> **What you'll learn:** a decision framework for the three ways to customize model behavior, the knowledge-vs-behavior distinction that makes the choice obvious in most cases, and the common failure mode of fine-tuning to "teach the model facts."

## Three levers, one question

When a model isn't doing what you want, you have three levers, in rough order of effort:

1. **Prompting** — change the instructions and examples you send.
2. **RAG (retrieval-augmented generation)** — fetch relevant data at request time and put it in context (Module 4).
3. **Fine-tuning** — update the model's weights (or attach adapter weights) by training on your own examples.

The question that resolves 90% of decisions: **are you missing knowledge, or missing behavior?**

- **Knowledge** is information the model needs at answer time: your product catalog, yesterday's support tickets, internal policy docs, anything past the training cutoff. Knowledge changes constantly and must be attributable.
- **Behavior** is *how* the model responds: tone, format, classification taxonomy, domain vocabulary, the way it structures an answer.

Knowledge problems are RAG problems. Behavior problems are prompting problems first, and fine-tuning problems when prompting runs out of road.

## Why fine-tuning is the wrong tool for facts

It's tempting to think "I'll fine-tune the model on our documentation and it will know our product." In practice this fails, for reasons that follow from how training works:

- A few thousand fine-tuning examples are a rounding error against trillions of pre-training tokens. Facts get *blurred in*, not reliably stored — the model learns your phrasing far faster than your content, and will confidently hallucinate plausible-sounding variants of your facts.
- The moment your docs change, your weights are stale. RAG updates by re-indexing a document; a fine-tune updates by retraining.
- RAG gives you **citations** — you can show which chunk supported an answer. A fine-tuned model gives you weights you can't inspect.

The reliable use of fine-tuning is teaching the model to *use* knowledge a certain way, not to *contain* it. The two compose well: a common production pattern is RAG for facts plus a small fine-tuned model that has learned your answer format, citation style, and refusal policy.

## What fine-tuning is genuinely good at

Fine-tuning earns its keep when you want to bake behavior into the weights so you stop paying for it in the prompt:

| Win | Example |
|---|---|
| **Style and voice** | Customer-support replies that consistently sound like your brand, without a 2,000-token style guide in every prompt |
| **Strict output format** | Always-valid domain-specific JSON/XML/DSL where prompted models drift |
| **Narrow-task quality at small-model prices** | A fine-tuned 8B classifier matching a frontier model on *your* taxonomy at a fraction of the cost and latency |
| **Domain dialect** | Medical coding, legal citation formats, your internal ticket schema |
| **Distillation** | Teaching a small model to imitate a large model's outputs on one task (Module 6, lesson 3) |

The economic shape is important: prompting cost is **per-request** (every token of instructions and few-shot examples, every call, forever), while fine-tuning cost is **up-front** (data curation + training) with cheaper requests afterward. At high volume on a narrow task, fine-tuning a small open-weight model is often the single biggest latency/cost win available — a theme that returns in Module 8.

## The escalation ladder

Treat the levers as an escalation ladder, not a menu:

1. **Prompt harder first.** A good system prompt with 3–5 few-shot examples solves more problems than most teams expect, ships in an hour, and is trivially reversible. If you haven't tried a frontier model with a carefully engineered prompt, you have no baseline.
2. **Add RAG if the failure is missing/stale/private information.** Check: would a human expert need to look something up to answer this? Then so does the model.
3. **Fine-tune when** the prompt is long, the few-shot examples never quite generalize, the task is narrow and high-volume, and you have (or can generate) hundreds-to-thousands of high-quality examples — plus an eval set to prove it worked (Module 7).

Two prerequisites before any fine-tune: an **eval set** built *before* training (otherwise you cannot tell whether you improved anything), and a realistic accounting of the hidden costs — dataset curation (most of the work, lesson 3), training infrastructure, hosting the resulting model, and re-doing all of it when the base model you forked from is superseded. Prompts migrate across model generations in an afternoon; fine-tunes do not.

## Quick decision table

| Symptom | Reach for |
|---|---|
| Wrong/missing facts, stale knowledge, "what's our refund policy?" | RAG |
| Needs citations / auditability | RAG |
| Tone, format, or taxonomy drift; prompt keeps growing | Prompting → fine-tune |
| Narrow task, huge volume, latency or cost pressure | Fine-tune a small model |
| New domain *vocabulary and conventions* (not facts) | Fine-tune |
| You have < 100 examples | Prompting (few-shot); you don't have enough data to fine-tune well |
| Task changes weekly | Prompting/RAG — weights are too slow to iterate |

## Key takeaways

- Separate **knowledge** (what the model needs to know now → RAG, Module 4) from **behavior** (how it should respond → prompting, then fine-tuning).
- Fine-tuning is unreliable for injecting facts: small datasets can't overwrite pre-training, weights go stale, and you lose attribution.
- Fine-tuning shines for style, strict formats, domain dialect, and getting frontier-quality results on a narrow task from a small, cheap, fast model.
- Escalate in order — prompt, then RAG, then fine-tune — and only fine-tune with hundreds+ of quality examples and a pre-built eval set.
- RAG and fine-tuning compose: retrieve the facts, fine-tune the behavior.
- Fine-tuning trades per-request prompt cost for up-front training cost — a win at high volume, a liability for fast-changing tasks.
