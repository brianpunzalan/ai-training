# Dataset Curation

> **What you'll learn:** why the dataset is half the work of any fine-tune, what "quality over quantity" means in concrete numbers, the hygiene steps (deduplication, decontamination, format consistency) that separate working fine-tunes from confusing ones, and how to generate synthetic data with a teacher model without poisoning your well.

## The model becomes the dataset

Fine-tuning is compression of your dataset into weights. Every quirk in the data — inconsistent formats, lazy answers, mislabeled examples, one annotator's weird tic — gets learned with the same enthusiasm as the behavior you wanted. Teams routinely spend 50%+ of a fine-tuning project on data, and the projects that skip this step produce models that are *worse* than the prompted baseline. Budget accordingly.

## Quality over quantity, with numbers

The strongest practical finding of the last few years (popularized by the LIMA paper and confirmed endlessly in industry): for teaching **behavior** — style, format, taxonomy — **hundreds to a few thousand excellent examples beat tens of thousands of mediocre ones**. A useful mental model: the model already knows how to write; you're showing it *which* of the things it can do you want. That signal saturates quickly, and noisy examples actively dilute it.

Rules of thumb:

- **Style/format/voice:** 200–1,000 examples is often enough.
- **Classification on your taxonomy:** ~50–200 per class, balanced — class imbalance becomes prediction bias.
- **Harder behavioral shifts (domain dialect, complex tool use):** thousands, rarely more than low tens of thousands.
- A single bad pattern repeated across 5% of examples *will* show up in the model. One careful reviewer beats one more thousand scraped examples.

Every example should be one your best practitioner would sign off on — the model regresses to the mean of your dataset, so the mean must be high.

## Hygiene: the four chores

**1. Deduplication.** Near-duplicate examples over-weight whatever they contain — the model effectively trains on them for extra epochs, memorizing phrasing instead of generalizing. Dedupe exactly (hashing) and approximately (MinHash or embedding similarity, Module 1, against a threshold). Pay special attention to templated data, where 500 "different" examples may be one example with the date changed.

**2. Decontamination against your eval set.** If any training example overlaps your held-out eval set, your eval is measuring memorization and reporting fiction. Split **first**, then dedupe *across* the split with the same fuzzy matching you used within it. This is the dataset-side twin of the golden-test-set discipline in Module 7: the eval set is sacred, and nothing that resembles it may enter training.

**3. Format consistency.** Pick one chat template, one system prompt convention, one output schema, and apply it to every example. If half your examples wrap JSON in code fences and half don't, the model will flip a coin at inference. Critically, **train in the exact format you'll use in production** — same system prompt, same input structure. A model fine-tuned with a system prompt it never sees at inference (or vice versa) underperforms for no visible reason.

**4. Review the data, not just the pipeline.** Read a random 50–100 examples end to end before training. Every experienced practitioner has a story about the bug this caught: truncated answers, leaked PII, swapped fields, an entire category of mislabels.

## Synthetic data: the teacher–student pattern

Most teams can't hand-write 1,000 examples — but they can generate them. The standard 2026 recipe is **distillation**: use a stronger *teacher* model (a frontier API model) to produce training data for a smaller *student*:

1. **Seed with reality.** Collect real inputs — actual support tickets, real queries from logs — or have the teacher generate diverse inputs from a taxonomy of cases. Diversity of *inputs* is what's usually missing; force coverage of edge cases, lengths, and tones rather than letting the generator converge on its favorite phrasing.
2. **Generate outputs with the teacher**, using your best mega-prompt — the long, few-shot, carefully engineered prompt from Module 2 that's too expensive to run per-request. The fine-tune's whole purpose is to bake that prompt into a small model.
3. **Filter ruthlessly.** Generation is cheap; curation is the value. Apply programmatic checks (does the JSON parse? does it pass the schema? Module 7's rule-based checks reused verbatim), an LLM-as-judge pass scoring correctness against a rubric, and human spot-review of a sample. Discarding 30–60% of generated examples is normal and healthy.
4. **Mind the loop.** Training only on a model's outputs caps you at (a noisy copy of) the teacher's quality and narrows distribution over iterations. Keep real examples in the mix, and never let your student's own outputs become training data without human or programmatic verification.

Also check the teacher's **terms of service** — providers differ on whether outputs may train models that compete with them — and scrub PII before anything enters the training set.

## A pragmatic checklist

| Step | Pass criteria |
|---|---|
| Size & balance | Hundreds+ per behavior; classes balanced |
| Dedup | No exact or near dupes (hash + fuzzy) |
| Decontamination | Zero overlap with eval set (fuzzy-matched) |
| Format | One template; matches production inference exactly |
| Quality gate | Programmatic checks + judge + human sample review |
| Splits | Train/eval split done before any of the above touched eval |

## Key takeaways

- The model becomes the dataset: every inconsistency and error in training data is faithfully learned, so data work is half the project.
- Quality beats quantity — hundreds to low thousands of expert-grade examples typically outperform large noisy sets for behavioral fine-tunes.
- Non-negotiable hygiene: deduplicate (exact + fuzzy), decontaminate against the eval set, enforce one consistent format that matches production inference, and read your data.
- Synthetic data via a stronger teacher model is the standard way to reach scale — but filtering (programmatic checks, LLM-as-judge, human sampling) is where the value lives.
- Distillation bakes an expensive mega-prompt + frontier model into a small cheap one; keep real data in the mix to avoid distribution collapse.
- Build the eval set first and guard it: a contaminated eval makes every later measurement (lesson 5, Module 7) meaningless.
