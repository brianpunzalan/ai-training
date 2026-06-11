# The Provider Landscape

> **What you'll learn:** how to map the model ecosystem — frontier labs, open-weight models, hosting options — and a pragmatic framework for choosing models without chasing every leaderboard.

## The map, not the leaderboard

Model rankings change monthly; the *structure* of the ecosystem is stable. Learn the structure:

### Frontier labs (proprietary APIs)

- **Anthropic (Claude)** — strong reasoning, coding, agentic work, long context; tiers from fast/cheap (Haiku) to most capable (Opus).
- **OpenAI (GPT family, o-series reasoning models)** — broad ecosystem, multimodal, heavily adopted API conventions.
- **Google (Gemini)** — very long contexts, strong multimodal, deep GCP integration.

All offer the same fundamentals — chat, tool calling, structured output, vision, streaming — with different pricing tiers and personality. **Skills transfer across them almost completely**; that's why this course is provider-agnostic.

### Open-weight models

Weights you can download and run yourself: **Llama** (Meta), **Mistral**, **Qwen** (Alibaba), **DeepSeek**, **Gemma** (Google), and a long tail on Hugging Face. "Open-weight" ≠ fully open-source — read the license (some restrict commercial use).

Why they matter even if you never self-host:

- **Data control** — inference inside your VPC; nothing leaves.
- **Cost at scale** — high, steady volume can beat per-token pricing.
- **Customization** — full fine-tuning freedom (Module 6).
- **No vendor risk** — the model can't be deprecated out from under you.

### Ways to run models

| Option | Examples | When |
|---|---|---|
| Direct frontier API | Anthropic, OpenAI, Google | Default; fastest path to quality |
| Cloud ML platforms | AWS Bedrock, GCP Vertex, Azure AI Foundry | Enterprise procurement, data residency, one bill |
| Open-weight hosting APIs | Together, Fireworks, Groq, DeepInfra | Open models without ops; sometimes very fast |
| Self-hosted serving | vLLM, SGLang, TGI on your GPUs | Scale + control; real ops burden |
| Local / dev | **Ollama**, LM Studio, llama.cpp | Free experimentation — all labs here run on Ollama |

```bash
# Free local setup used throughout the labs:
ollama pull llama3.2          # small, runs on a laptop
export LLM_PROVIDER=openai-compatible
export LLM_BASE_URL=http://localhost:11434/v1
export LLM_MODEL=llama3.2
```

## The capability tiers within each provider

Every provider ships a ladder, and the ladder matters more than the brand:

- **Flagship / reasoning tier** — most capable, slowest, most expensive. Complex reasoning, hard coding, agentic planning.
- **Workhorse tier** — 80–90% of flagship quality at a fraction of the price. Where most production traffic should live.
- **Fast/cheap tier** — classification, extraction, routing, summarization at scale; often 10–50× cheaper than flagship.

A well-engineered system typically uses **several tiers**: a cheap model routes or pre-processes, a workhorse handles the main task, and the flagship is reserved for the hard cases (model routing — Module 8).

## How to actually choose a model

Resist leaderboard-driven development. Public benchmarks (MMLU, HumanEval, Arena Elo) are directional at best and contaminated at worst. The pragmatic loop:

1. **Define the task** precisely (input/output contract, quality bar, latency budget, cost ceiling).
2. **Prototype with a frontier flagship** — establish what's *possible* before optimizing.
3. **Build a small eval set** (even 30 examples — Module 7) from real expected inputs.
4. **Step down tiers until quality breaks**, measuring with your evals. The cheapest model that passes your bar wins.
5. **Re-evaluate on new releases** — the frontier moves every few months; your evals make switching a one-afternoon decision instead of a leap of faith.

Decision factors beyond raw quality:

- **Latency** — time-to-first-token for interactive UX; tokens/sec for long outputs.
- **Cost asymmetry** — input vs output pricing differs; long-input/short-output workloads (RAG, classification) price very differently than generation-heavy ones.
- **Context window & caching** — needed window size, and whether prompt caching discounts your repeated prefixes.
- **Features** — structured output guarantees, tool-calling quality, vision/audio, batch APIs (often ~50% off for async workloads).
- **Data & compliance** — training-on-your-data policies, retention, residency, SOC2/HIPAA.

## Avoiding lock-in without over-abstracting

- The message-list shape is a de-facto standard; OpenAI-compatible endpoints are everywhere (including Ollama). Light abstraction over the client (like the labs' shared wrapper) keeps you portable.
- **Don't** build a heavy abstraction layer that hides provider-specific strengths (caching controls, structured-output modes) — the lowest common denominator is expensive.
- Real lock-in lives in your **prompts and evals**: prompts tuned for one model regress on another. Your eval suite (Module 7) is what makes migration safe and cheap. Invest there.

## Key takeaways

- Learn the ecosystem's structure — frontier APIs, open-weight models, hosting spectrum — rather than chasing rankings.
- Capability tiers within a provider matter more than brand; production systems mix tiers deliberately.
- Choose models with *your own eval set* and a step-down procedure: the cheapest model that passes your bar.
- Open weights buy control, cost-at-scale, and customization at the price of ops.
- Your evals, not your client code, are what make you provider-portable.
