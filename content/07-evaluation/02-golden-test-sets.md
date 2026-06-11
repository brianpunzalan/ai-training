# Golden Test Sets

> **What you'll learn:** how to build the dataset your whole evaluation practice stands on — sourcing cases from real traffic and synthetic edge cases, sizing it honestly, labeling it well, versioning it like code, and keeping it uncontaminated.

## What a golden set is

A **golden test set** (also: golden dataset, reference set) is a curated collection of inputs with known-good expectations, frozen so that every prompt, model, or pipeline change is measured against the *same* yardstick. It is to an AI system what a regression test suite is to conventional software — except you have to manufacture the "expected" half yourself, and "expected" is often a rubric rather than an exact string.

Each case typically carries:

```json
{
  "id": "refund-policy-017",
  "input": "I bought this 45 days ago, can I still return it?",
  "context": {"user_tier": "premium", "policy_version": "2026-03"},
  "expected": {
    "must_mention": ["30-day window", "premium exception"],
    "must_not_mention": ["store credit only"],
    "label": "eligible_with_exception"
  },
  "source": "production",
  "added": "2026-04-12",
  "tags": ["refunds", "edge:date-boundary"]
}
```

The `expected` field flexes by task: an exact label for classification, a reference answer for QA, structural requirements for extraction, or a rubric pointer for open-ended generation (Lesson 4).

## Sourcing: real traffic first, synthetic for the gaps

**Real traffic is the gold standard.** Production inputs have the messiness — typos, mixed languages, ambiguous phrasing, weird formatting — that you will never invent at a whiteboard. Pull cases from your traces (Lesson 5), with special attention to:

- Interactions that triggered a thumbs-down, a retry, or an escalation to support.
- Inputs where the model's confidence and the outcome diverged.
- Anything that made you wince during error analysis (Lesson 1).

**Synthetic cases fill the gaps** real traffic hasn't covered yet: rare-but-critical paths (the date exactly on the policy boundary), adversarial inputs (prompt injection attempts, off-topic requests), and pre-launch scenarios where you have no traffic at all. Use an LLM to *draft* synthetic cases — "generate 20 refund questions a frustrated customer might ask, including two in Spanish and three with wrong assumptions" — but **a human reviews every case before it enters the set.** Unreviewed synthetic data encodes the generating model's blind spots as your ground truth.

| Source | Strengths | Watch out for |
|---|---|---|
| Production traces | Realistic distribution, real edge cases | Privacy — scrub PII before committing |
| Failure reports | Highest value per case | Over-weighting yesterday's bug |
| Synthetic (LLM-drafted, human-reviewed) | Coverage of rare/adversarial paths | Distribution drift from real usage |
| Hand-written by experts | Precise targeting of known risks | Expensive; happy-path bias |

## Sizing: start small, grow forever

Teams stall by imagining they need thousands of cases. You don't. **Start with 20–100 cases** — enough to cover your main intents plus the failure modes from your first error analysis. A 30-case suite you actually run on every change beats a 3,000-case suite that exists in a planning document.

Then grow continuously with one iron rule: **every production failure becomes a test case.** This is the AI analogue of "every bug gets a regression test." A mature product's golden set — often several hundred to a few thousand cases after a year — is a fossil record of every way it has ever failed. As the set grows, use `tags` to slice scores by category; an aggregate 0.92 hiding a 0.40 on `edge:date-boundary` is exactly what slicing reveals. (Retrieval-specific golden sets — query → relevant-chunks pairs — follow the same lifecycle; see Module 4, Lesson 6.)

## Labeling: the quality ceiling

Your eval can never be better than its labels. Practical rules:

- **Write a labeling guideline first** — even one page. "Eligible means X; ambiguous dates resolve to Y." Without it, two labelers (or you, two weeks apart) disagree silently.
- **Measure agreement** on a sample by double-labeling. If humans agree only 70% of the time, no metric can hit 95% — your task definition is fuzzy, fix that first.
- **Prefer decomposed labels** ("mentions the exception: yes/no") over holistic scores ("quality: 7/10"); they're more reproducible and they localize failures.

## Versioning and contamination

Treat the golden set as code: **store it in git** (JSONL works well), review changes via PRs, and tag versions so a score of "0.89 on golden-v12" is reproducible. When you change a case or its label, that's a semantic change to your yardstick — call it out, because scores before and after aren't comparable.

```python
import json, hashlib

def load_golden(path: str) -> tuple[list[dict], str]:
    lines = open(path).read().strip().splitlines()
    cases = [json.loads(l) for l in lines]
    version = hashlib.sha256("\n".join(lines).encode()).hexdigest()[:12]
    return cases, version   # log the version with every eval run
```

```typescript
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

function loadGolden(path: string): { cases: Case[]; version: string } {
  const raw = readFileSync(path, "utf8").trim();
  const cases = raw.split("\n").map((l) => JSON.parse(l));
  const version = createHash("sha256").update(raw).digest("hex").slice(0, 12);
  return { cases, version }; // log the version with every eval run
}
```

**Contamination** is the failure mode where your test set stops measuring generalization:

- **Don't tune on the test set.** If you iterate your prompt against the golden set hundreds of times (Module 2, Lesson 5 workflow), you'll overfit to it. Keep a **held-out slice** you only run before releases, or rotate fresh production cases in.
- **Don't put golden cases in the prompt.** Few-shot examples must come from a separate pool — scoring the model on examples it was shown is a 100% it didn't earn.
- **Be wary of public benchmarks** as your eval: they're in every frontier model's training data. Your private, task-specific set is meaningful precisely because no model has seen it.

## Key takeaways

- A golden set is a frozen, versioned yardstick: inputs plus expectations, measured identically across every change.
- Source from real traffic first (failures especially), use human-reviewed synthetic cases for edge and adversarial coverage.
- Start at 20–100 cases and run them constantly; grow by converting every production failure into a permanent case.
- Labels cap your eval quality: write guidelines, measure inter-labeler agreement, prefer decomposed binary labels over holistic scores.
- Version the set in git and guard against contamination: held-out slices, few-shot examples from a separate pool, and skepticism of public benchmarks.
