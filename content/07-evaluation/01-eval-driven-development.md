# Why Evals Are the Moat

> **What you'll learn:** why systematic evaluation — not prompts, not model choice — is the durable asset of an AI product, the eval-driven development loop, and why error analysis on real data comes before any metric.

## The asymmetry nobody escapes

Every other part of your AI stack churns. Models are deprecated on a schedule measured in months; a new release makes your carefully tuned prompt obsolete; prices drop and suddenly the "too expensive" model is the obvious choice. The one artifact that *appreciates* over time is your eval suite: a growing, versioned record of what "good" means for *your* task, executable on demand.

This is the framing popularized by Hamel Husain's widely-cited "Your AI Product Needs Evals": teams that win don't have secret prompts — they have an evaluation flywheel that lets them iterate faster and adopt new models safely while competitors argue about vibes. Prompts are tactics. Evals are the moat.

Concretely, evals are what convert these scary events into routine ones:

| Event | Without evals | With evals |
|---|---|---|
| New model release | "Seems better? Ship it and pray" | Run suite, compare scores, decide in an hour |
| Prompt change | Eyeball three examples | Catch the regression on case #47 you forgot existed |
| Provider migration | Leap of faith | Quantified quality delta vs cost delta |
| "Is it ready to launch?" | Opinions | A number with a threshold |

## Vibe checks and why they fail

Every project starts with vibe checks — paste in an input, read the output, nod. That's fine for the first afternoon. It fails as a methodology because:

- **You test what you remember**, which is the happy path. The failures live in the inputs you didn't think of.
- **LLM improvements are non-uniform.** A prompt tweak that fixes case A silently breaks case B. Without a fixed test set, you're playing whack-a-mole blindfolded — this is exactly the failure mode the prompt iteration workflow in Module 2, Lesson 5 warned about.
- **Memory of quality is unreliable.** "It feels worse this week" is not actionable; a score that dropped from 0.91 to 0.78 is.

## Look at your data (yes, actually)

The single highest-leverage activity in AI engineering is also the least glamorous: **reading your system's real inputs and outputs, one at a time**. Before you choose metrics, before you build dashboards, before you write a judge prompt — sit down and read 50–100 real traces. Practitioners call this *error analysis*, and it always precedes metrics, because you cannot measure what you haven't characterized.

The workflow:

1. **Collect** real interactions (or realistic synthetic ones pre-launch).
2. **Read and annotate** each one: pass/fail, plus a short free-text note on *what* went wrong.
3. **Cluster the notes** into failure modes: "ignores the date filter", "hallucinates a refund policy", "valid JSON but wrong enum value".
4. **Count.** The distribution tells you what to fix and what to measure. If 40% of failures are formatting, you need a schema check (Lesson 3), not a better model.

Only now do you design metrics — one per failure mode that matters — instead of importing a generic "helpfulness 1–10" score that correlates with nothing.

## The eval-driven development loop

Eval-driven development is test-driven development adapted to a stochastic component:

```python
# The loop, in pseudo-runnable form
from dataclasses import dataclass

@dataclass
class Case:
    input: str
    expected: dict          # reference answer / label / required properties

def run_eval(cases: list[Case], system) -> float:
    results = [score(system(c.input), c.expected) for c in cases]
    failures = [c for c, r in zip(cases, results) if r < 1.0]
    report(failures)        # ALWAYS look at the failures, not just the number
    return sum(results) / len(results)

# iterate: change prompt/model/retrieval -> run_eval -> read failures -> repeat
```

```typescript
interface Case {
  input: string;
  expected: Record<string, unknown>; // reference answer / label / required properties
}

async function runEval(cases: Case[], system: (input: string) => Promise<string>): Promise<number> {
  const results = await Promise.all(
    cases.map(async (c) => score(await system(c.input), c.expected)),
  );
  const failures = cases.filter((_, i) => results[i] < 1.0);
  report(failures); // ALWAYS look at the failures, not just the number
  return results.reduce((a, b) => a + b, 0) / results.length;
}
```

The crucial cultural point: **the aggregate score is a compass, not the destination.** Each eval run's real output is the list of failing cases, which you read, diagnose, and either fix or consciously accept. New failure modes discovered in production become new cases — the suite grows with the product.

## Three layers of evaluation

This module covers each layer in depth; here is the map:

1. **Programmatic checks** (Lesson 3) — deterministic assertions: exact match, regex, schema validation, code execution. Cheap, fast, zero ambiguity. Use them for everything they can express.
2. **LLM-as-judge** (Lesson 4) — a model grading open-ended quality against a rubric. Scales human judgment, but is itself a system you must validate.
3. **Human review** — the ground truth that calibrates the other two, applied to samples because it doesn't scale.

These run against a **golden test set** (Lesson 2), are wired into **tracing** so production becomes a source of new cases (Lesson 5), and gate changes in **CI** (Lesson 6). Domain-specific suites exist too — retrieval quality has its own metrics covered in Module 4, Lesson 6 — but they all follow this same architecture.

## Key takeaways

- Models, prompts, and prices churn; your eval suite is the asset that compounds — it's what makes every future change cheap and safe.
- Vibe checks test the happy path you remembered; fixed test sets catch the regression on the case you forgot.
- Error analysis precedes metrics: read 50–100 real traces, cluster failure modes, count them, *then* decide what to measure.
- An eval run's most valuable output is the list of failures you read, not the aggregate score.
- Evaluation is layered: programmatic checks for everything deterministic, LLM judges for open-ended quality, sampled human review to calibrate both.
