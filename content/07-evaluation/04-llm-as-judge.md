# LLM-as-Judge

> **What you'll learn:** how to use a model to grade model outputs at scale — rubric design, pointwise vs pairwise scoring, the judge biases that will silently corrupt your metrics (position, verbosity, self-preference), and how to validate a judge against human labels before trusting a single number it produces.

## Scaling judgment

Lesson 3 ended at the residue deterministic checks can't reach: is the answer *helpful*? Is the reasoning *sound*? Is the tone *right*? Humans judge these well but don't scale to thousands of outputs per change; that's the gap **LLM-as-judge** fills — a model, given the input, the output, and a rubric, produces a verdict. Used well (the MT-Bench line of work showed judges agreeing with humans about as often as humans agree with each other), it's the workhorse of modern eval stacks. Used carelessly, it launders a model's biases into authoritative-looking numbers.

## Designing the judge prompt

A judge prompt is a system prompt contract (Module 2) whose job is *narrowing discretion*. The load-bearing elements:

- **A rubric with concrete criteria** — not "rate quality 1–10" but named criteria with descriptions of what failing and passing look like. Better still, decompose into **binary criteria** (Lesson 2's labeling insight): "addresses the actual question: yes/no", "every claim supported by the provided context: yes/no". Binary verdicts are more consistent and more actionable than scales.
- **Reasoning before verdict** — the judge explains, *then* scores (Module 2's CoT ordering; in JSON output the `reasoning` field precedes the `verdict` field).
- **Few-shot anchors** — one borderline-pass and one borderline-fail example calibrate the boundary better than paragraphs of rubric prose.
- **An escape hatch** — "if the output is empty or off-format, verdict: fail, reason: malformed" so degenerate inputs don't produce creative judging.

```python
JUDGE_PROMPT = """You are evaluating a customer-support reply.

<question>{question}</question>
<context>{context}</context>
<reply>{reply}</reply>

Evaluate each criterion. Think first, then verdict.
1. grounded: every factual claim is supported by <context>
2. addresses_question: the reply answers what was actually asked
3. actionable: the user knows what to do next

Respond with JSON: {{"reasoning": "...", "grounded": true/false,
"addresses_question": true/false, "actionable": true/false}}"""
```

```typescript
const JUDGE_PROMPT = `You are evaluating a customer-support reply.

<question>{question}</question>
<context>{context}</context>
<reply>{reply}</reply>

Evaluate each criterion. Think first, then verdict.
1. grounded: every factual claim is supported by <context>
2. addresses_question: the reply answers what was actually asked
3. actionable: the user knows what to do next

Respond with JSON: {"reasoning": "...", "grounded": true/false,
"addresses_question": true/false, "actionable": true/false}`;
```

Run the judge at temperature 0, with structured output (Module 3) so verdicts parse mechanically.

## Pointwise vs pairwise

**Pointwise** judges one output against the rubric — an absolute verdict per case. Use it for monitoring a single system over time and for criteria with crisp definitions (groundedness, policy compliance).

**Pairwise** shows the judge two outputs for the same input and asks which better satisfies the rubric. Models are markedly more reliable at *comparing* than at absolute scoring — "is this 6/10 or 7/10?" is noise, "is A or B more helpful?" is signal. Pairwise is the right shape for the decisions that are actually comparisons: prompt A vs prompt B (Module 2's iteration workflow), base vs fine-tuned (Module 6), old model vs new model. Always allow a tie verdict, and always mitigate position bias — which brings us to the pathologies.

## The judge's biases — and the mitigations

Judges inherit model biases, and unmitigated they corrupt results *systematically*, not randomly:

| Bias | Symptom | Mitigation |
|---|---|---|
| **Position bias** | pairwise judge favors whichever answer appears first (or last) | run both orderings; count a win only if consistent — disagreement = tie |
| **Verbosity bias** | longer answers score higher at equal quality | rubric line: "longer is not better"; check score-vs-length correlation in results |
| **Self-preference** | a model rates its own outputs above peers' | judge with a different model family than the one being judged |
| **Sycophancy toward style** | confident, polished tone outscores hedged-but-correct | binary factual criteria separated from style criteria |
| **Rubric drift** | judge invents criteria not in the rubric | reasoning-first output makes this visible; tighten the rubric |

None of these are exotic — position bias alone can swing a pairwise eval by double digits, which is more than most prompt changes you'll be measuring.

## Validate the judge before trusting it

A judge is a measurement instrument, and uncalibrated instruments are worse than none — they produce *confident* wrong conclusions. Calibration is straightforward: take 50–100 cases, label them yourself (or with your domain expert — Lesson 2's labeling discipline), run the judge, and measure agreement. Judge-human agreement should be in the neighborhood of human-human agreement; report it per-criterion, because judges are typically strong on groundedness and weaker on "helpfulness".

Where agreement is poor, iterate on the judge prompt like any prompt (Module 2): inspect disagreements, sharpen the rubric or add anchor examples, re-measure. Keep the labeled calibration set versioned (it's a golden set *for the judge*), re-validate when you change judge model or rubric, and keep sampled human review (Lesson 1) running in production as the ongoing check that the instrument hasn't drifted. The judge you'll build in this module's lab goes through exactly this loop.

## Key takeaways

- LLM-as-judge covers the criteria code can't check — at scale judges agree with humans roughly as often as humans agree with each other, but only when engineered deliberately.
- Rubrics beat scales: named binary criteria, reasoning before verdict, borderline few-shot anchors, an escape hatch for malformed output, temperature 0, structured output.
- Use pointwise for absolute monitoring, pairwise (with ties) for comparisons — models compare far more reliably than they score.
- Mitigate the systematic biases: swap orderings for position bias, control verbosity, use a different model family as judge, separate factual from style criteria.
- Calibrate against 50–100 human-labeled cases before trusting the judge, report per-criterion agreement, and re-validate on every judge change.

## Lab

Put this into practice in **Lab 07 — LLM-as-Judge Eval Pipeline** (find it in the Labs section of the site): you'll write a rubric-based judge with structured verdicts, run it pairwise with order-swapping, and calibrate it against your own labels to see exactly how much to trust it.
