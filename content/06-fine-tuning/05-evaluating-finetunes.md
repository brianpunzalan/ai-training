# Evaluating Fine-Tuned Models

> **What you'll learn:** how to answer the only question that matters — "is the fine-tune actually better, and at what cost?" — using held-out target-task evals, side-by-side comparisons against the base model, regression checks on general capability, and a clear-eyed accounting of when to ship, iterate, or abandon.

## Loss curves don't ship

Lesson 4 ended with a healthy eval loss curve. That tells you the model learned *something* from your data without memorizing it — it does **not** tell you the model got better at the job. Loss is averaged next-token accuracy on your examples; products are judged on behavior. A model can hit lower loss by nailing your boilerplate phrases while still botching the decisions that matter, and (more subtly) a fine-tune can improve your target task while quietly damaging everything else.

So evaluation runs on three axes, in order:

1. **Target task** — did the behavior you trained for improve?
2. **Regression** — did general capability survive?
3. **Economics** — is the improvement worth the operational cost?

This is Module 7's discipline pointed at a model change instead of a prompt change — same golden sets, same judges, same gates.

## Axis 1: target-task evaluation

Run the held-out eval set you built *before* training (Lesson 3 — built first, quarantined from training data, decontaminated). Score it with the cheapest method that measures what you tuned for:

- **Behavior/format tunes** (the most common case) are largely checkable programmatically: schema validity, length limits, required citation present, banned phrases absent — Module 7's rule-based checks.
- **Style and quality tunes** need LLM-as-judge — ideally **pairwise**: show the judge the base model's answer and the fine-tune's answer to the same input, ask which better satisfies the rubric, and randomize which side each appears on (position bias is real; Module 7 covers judge hygiene).

Always compare against the honest baseline: the **base model with your best prompt** — the few-shot, carefully engineered prompt you'd actually deploy otherwise (Lessons 1–2 of Module 2), not a lazy zero-shot strawman. The fine-tune must beat the thing it would replace, since "more prompt engineering" is the cheaper alternative on the escalation ladder (Lesson 1).

```python
import json, random

results = {"tuned": 0, "base": 0, "tie": 0}
for case in eval_set:
    answers = {"A": tuned(case["input"]), "B": base_with_best_prompt(case["input"])}
    if random.random() < 0.5:                       # randomize sides for position bias
        answers = {"A": answers["B"], "B": answers["A"]}
        flipped = True
    else:
        flipped = False
    verdict = judge(case["input"], answers["A"], answers["B"], RUBRIC)   # returns "A"|"B"|"tie"
    winner = {"A": "base" if flipped else "tuned",
              "B": "tuned" if flipped else "base"}.get(verdict, "tie")
    results[winner] += 1
print(json.dumps(results))   # e.g. {"tuned": 61, "base": 24, "tie": 15}
```

Read the failures, not just the win rate (Module 7's first commandment): the 24 losses above tell you whether you need more data for a specific case type, cleaner labels, or different hyperparameters.

## Axis 2: regression — the silent killer

Fine-tuning sculpts behavior by moving weights, and Lesson 2 warned what else that can move: **catastrophic forgetting**. A model tuned hard on three-sentence support answers may start answering *everything* in three sentences, lose instruction-following flexibility, or shed reasoning ability. Overfit tunes also drift toward parroting training phrases verbatim.

Guard with a **regression suite** that has nothing to do with your target task: a slice of general instruction-following cases, a few reasoning problems, format-compliance checks for *other* formats than the one you trained, and safety/refusal behavior. Run base vs tuned; meaningful drops are a red flag regardless of how well the target task went. The usual fixes: fewer epochs, lower learning rate, or mixing some general instruction data into training. If you used the same eval harness from Module 7 for everything, this axis costs you a config entry, not a new system.

## Axis 3: economics and the ship decision

The fine-tune exists to beat an alternative (Lesson 1) — close the loop on whether it did:

| Question | How to answer |
|---|---|
| Quality vs best-prompt baseline | pairwise win rate on the target eval set |
| Quality vs the big-model alternative | same harness, swap the comparator |
| Cost per request | tuned small model vs prompted large model, at your volume |
| Latency | measure; small models usually win big here |
| Operational drag | re-training cadence when data drifts, serving infra, adapter management |

The decision grid: **ship** if the tune beats the deployed alternative on target quality without regressions and the per-request economics work; **iterate** if target gains are real but regressions or specific failure clusters appear (usually a data fix — Lesson 3 — before a hyperparameter fix); **abandon** if several disciplined iterations can't beat the prompted baseline — that's the experiment telling you this task didn't need fine-tuning, which is a cheap thing to learn and a common, respectable outcome.

After shipping, the loop continues: production traffic surfaces failures → failures become eval cases and training examples → periodic re-trains. Version model artifacts like prompts (Module 2): every deployed response should be traceable to a model version, adapter version, and dataset version.

## Key takeaways

- A good eval-loss curve means learning happened, not that the product improved — behavioral evaluation is the verdict.
- Evaluate three axes in order: target task (held-out set, programmatic checks + pairwise LLM-as-judge), regression on general capability, then economics.
- The honest baseline is the base model with your best engineered prompt — the fine-tune must beat what it would actually replace.
- Catastrophic forgetting is checked, not assumed away: run a regression suite of non-target tasks on every tune.
- Ship / iterate / abandon on evidence; failing to beat the prompted baseline is a normal, useful result.
- Version everything — model, adapter, dataset — and keep harvesting production failures into both eval and training sets.
