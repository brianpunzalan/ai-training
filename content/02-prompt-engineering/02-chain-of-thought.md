# Chain-of-Thought & Reasoning Techniques

> **What you'll learn:** why making a model "show its work" improves accuracy, how reasoning models with extended thinking change (and don't change) the picture in 2026, and the supporting techniques — self-consistency, decomposition, and answer-last ordering — that you'll actually use in production.

## Why thinking out loud works

Chain-of-thought (CoT) prompting — eliciting intermediate reasoning steps before the final answer — was formalized by Wei et al. (2022), and the mechanism follows directly from Module 1: a transformer spends a **fixed amount of computation per token**. If you force the answer in the first few tokens, the entire problem must be solved in one forward pass's worth of compute. Let the model generate reasoning tokens first and each step conditions on the previous ones — the generated text becomes **working memory**, and total compute scales with output length.

Two classic elicitations:

- **Zero-shot CoT:** append "Think step by step before answering" (Kojima et al.'s famous finding).
- **Few-shot CoT:** include worked examples whose answers contain reasoning — the model imitates the *shape* of the reasoning, not just the answer format.

One ordering rule matters more than any magic phrase: **reasoning must come before the answer**. Tokens are generated left to right; an answer followed by a "justification" got no benefit from it — the justification is a post-hoc rationalization. This bites hardest in structured output: if your JSON schema puts `"answer"` before `"reasoning"`, you've silently disabled CoT. Put the reasoning field first, or have the model think in prose and emit JSON at the end.

```python
import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1000,
    system=(
        "Analyze the contract clause. First reason inside <analysis> tags: "
        "obligations, ambiguities, risks. Then output your verdict inside "
        '<verdict> tags as JSON: {"risk": "low|medium|high", "issues": [...]}'
    ),
    messages=[{"role": "user", "content": clause}],
)
```

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1000,
  system:
    "Analyze the contract clause. First reason inside <analysis> tags: " +
    "obligations, ambiguities, risks. Then output your verdict inside " +
    '<verdict> tags as JSON: {"risk": "low|medium|high", "issues": [...]}',
  messages: [{ role: "user", content: clause }],
});
```

The tag structure gives you a bonus: parse out `<verdict>` for your pipeline and log `<analysis>` for debugging.

## Reasoning models: CoT moved into the product

Since late 2024, the frontier has shifted to **reasoning models** — OpenAI's o-series and GPT-5-class thinking modes, Claude's extended thinking, Gemini's thinking variants. These are trained with reinforcement learning on verifiable rewards (the RLVR row from Module 1's training table) to generate long internal chains of thought *before* responding, exploring, backtracking, and self-correcting. You typically control the budget rather than the technique:

```python
response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=16000,
    thinking={"type": "enabled", "budget_tokens": 8000},
    messages=[{"role": "user", "content": hard_problem}],
)
# response.content holds thinking blocks followed by text blocks
```

```typescript
const response = await client.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 16000,
  thinking: { type: "enabled", budget_tokens: 8000 },
  messages: [{ role: "user", content: hardProblem }],
});
// response.content holds thinking blocks followed by text blocks
```

The 2026 state of play, and the nuance worth internalizing:

- **For reasoning models, explicit CoT prompting matters much less.** The model already deliberates; "think step by step" is redundant, and prescribing rigid step-by-step procedures can actually constrain a model that's been trained to explore. Spend your prompt budget on *what a good answer looks like*, success criteria, and context — then set the thinking budget.
- **For standard models, CoT prompting still matters a lot.** Fast non-reasoning tiers (Haiku-class, mini/flash-class) remain the workhorses for high-volume production because reasoning tokens cost real money and latency. On those models, the classic techniques are very much alive.
- **Thinking is a dial, not a binary.** Reasoning effort/budget is now a cost-quality knob: low for routine work, high for hard math, debugging, or planning. Module 8 treats this as a first-class cost lever.

Decision rule: use a reasoning model with an appropriate budget for genuinely hard problems (multi-step math, code debugging, planning, hard extraction); use a standard model plus explicit CoT for moderate difficulty at volume; use neither for trivial lookups, where forced "reasoning" just pads latency.

## Beyond a single chain

| Technique | Mechanism | Cost | Use when |
|---|---|---|---|
| **Self-consistency** | Sample N chains at temperature >0, majority-vote the final answer | N× | Verifiable short answers where errors are random, not systematic |
| **Decomposition** | Split into subtasks; separate calls per subtask | ~Σ subtasks | Pipelines needing per-step inspection, caching, or different models per step |
| **Plan-then-execute** | One call drafts a plan, the next executes it | 2× | Long generations that drift without an outline |
| **Verification pass** | Second call critiques/checks the first answer | 2× | Cheap to check, expensive to be wrong |

Self-consistency is the easiest win to understand: independent reasoning paths make uncorrelated mistakes, so voting filters noise. Reasoning models internalized much of this benefit, but it still pays on standard models for math-like tasks. Decomposition, meanwhile, is the gateway to agents (Module 3) — once steps can call tools, you've left prompting and entered orchestration.

## A warning about faithfulness

Do not treat a CoT transcript as a window into the model's actual computation. Interpretability research consistently shows stated reasoning can be **unfaithful** — the model sometimes reaches an answer for one reason and narrates another, or rationalizes a hint it was given. CoT is a *performance* technique and a useful debugging artifact, not an audit log. If you need trustworthy justification — citations, calculations, compliance trails — verify it mechanically: check the citation exists (Module 4), rerun the arithmetic with a tool (Module 3), or grade it with evals (Module 7).

## Key takeaways

- CoT works because reasoning tokens buy serial compute and act as working memory; the answer must come *after* the reasoning, including in JSON field ordering.
- Reasoning models (extended thinking) bake CoT in via RL — prompt them with goals and criteria, and tune the thinking budget instead of writing step-by-step scripts.
- Explicit CoT prompting still earns its keep on standard, non-reasoning models — which is most high-volume production traffic.
- Self-consistency, decomposition, and verification passes trade extra calls for reliability; pick based on how verifiable the answer is.
- Never trust a chain of thought as a faithful explanation; verify claims mechanically when it matters.
