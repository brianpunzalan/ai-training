# Responsible AI in Practice

> **What you'll learn:** the engineering practices — not the philosophy seminar — of responsible AI: measuring bias in your actual system, disclosure and transparency obligations, human oversight for high-stakes decisions, data privacy and retention, and the regulatory frameworks (EU AI Act, NIST AI RMF) you should know at awareness level.

## Responsibility is a systems property

It's tempting to file "responsible AI" under corporate communications. Resist that. Every topic in this lesson eventually lands on an engineer's desk as a concrete requirement — a bias eval to build, a disclosure banner to ship, a retention setting to configure, an audit trail to produce. The teams that treat these as engineering requirements from day one ship calmly; the teams that bolt them on after an incident or a regulator's letter do not. And the throughline of this lesson will look familiar: most of responsible AI in practice is *evaluation* (Module 7) and *observability* (Module 7) pointed at societal rather than functional requirements.

## Bias: measure it in your system, not in the abstract

Models inherit skews from training data, and your application can amplify them — a resume screener scoring identical qualifications differently by name, a support router de-prioritizing certain dialects, a loan-explanation tool varying its tone by neighborhood. The abstract debate doesn't help you; **counterfactual evaluation** does. It's a golden-set technique (Module 7): take real cases, vary *only* a sensitive attribute (or its proxies — names, locations, dialect), and measure whether outcomes shift.

```python
PERSONA_PAIRS = [
    ("James Miller", "DeShawn Washington"),
    ("John Smith", "Maria Hernandez"),
]

def counterfactual_eval(case_template: str, score) -> list[dict]:
    gaps = []
    for name_a, name_b in PERSONA_PAIRS:
        score_a = score(case_template.format(name=name_a))
        score_b = score(case_template.format(name=name_b))
        gaps.append({"pair": (name_a, name_b), "gap": abs(score_a - score_b)})
    return gaps   # aggregate over many cases; alert when mean gap exceeds threshold
```

```typescript
const PERSONA_PAIRS: [string, string][] = [
  ["James Miller", "DeShawn Washington"],
  ["John Smith", "Maria Hernandez"],
];

async function counterfactualEval(caseTemplate: string,
                                  score: (input: string) => Promise<number>) {
  const gaps = [];
  for (const [nameA, nameB] of PERSONA_PAIRS) {
    const a = await score(caseTemplate.replace("{name}", nameA));
    const b = await score(caseTemplate.replace("{name}", nameB));
    gaps.push({ pair: [nameA, nameB], gap: Math.abs(a - b) });
  }
  return gaps;  // aggregate over many cases; alert when mean gap exceeds threshold
}
```

Run it like any eval: in CI when prompts or models change (Module 7's gates — a model upgrade can shift bias, not just quality), with results logged over time. Mitigations follow the usual escalation: prompt instructions help marginally; *removing irrelevant sensitive attributes from the input* helps more (does the model need the name at all?); structural changes — decomposed decisions, human review for affected classes — help most.

## Disclosure, oversight, and the high-stakes line

**People should know when they're talking to an AI.** Label chatbots and AI-generated content plainly — it's already law in several jurisdictions (and an EU AI Act transparency requirement), and it's also self-interest: undisclosed AI discovered later costs more trust than the label ever would. Disclose *limitations* too: a "may contain errors, verify important details" notice on AI summaries is the product-level version of Module 1's hallucination lesson.

**Human oversight scales with stakes.** Low-stakes (drafts, search, summaries with caveats) → full automation is fine. Medium (customer-visible responses) → automation plus the guardrails and sampled review you built in Lesson 3 / Module 7. High-stakes (hiring, credit, medical, legal — decisions that materially affect lives) → the model *informs*, a human *decides*. For oversight to be real rather than theatrical, the human needs the model's reasoning and sources (not just a verdict), authority and time to disagree, and measurement of their actual override rate — a reviewer who approves 100% of recommendations at 3 seconds each is a rubber stamp, and regulators increasingly say so explicitly.

**Privacy is mostly configuration you must actually do.** Know your providers' retention policies (default retention windows vary; zero-data-retention agreements exist for enterprise tiers — know whether *you're* on one), and whether API traffic is used for training (major providers: not by default for API customers — verify, don't assume). Then apply Lesson 3 and Module 7 hygiene: redact PII before calls where possible, set retention windows on traces, restrict access, and honor deletion rights — which includes prompts, logs, *and* what's embedded in your RAG indexes (Module 4): "delete my data" means the vector store too.

## The regulatory frameworks, at awareness level

The **EU AI Act** (in force, with obligations phasing in through 2025–2027) regulates by *risk tier*: unacceptable-risk uses are banned (social scoring, manipulative systems); **high-risk** uses — employment, credit, education, essential services — carry the heavy obligations (risk management, data governance, logging, human oversight, documentation); limited-risk systems mainly owe transparency (the disclosure duties above); minimal-risk is unregulated. General-purpose model *providers* have their own duties, but as an application builder your tier comes from your *use case* — the same API call is minimal-risk in a writing aid and high-risk in a hiring tool.

The **NIST AI RMF** (voluntary, US-origin, widely referenced in procurement) organizes the practice into Govern / Map / Measure / Manage — which you can read as: assign ownership, document what the system does and who it affects, eval the risks including bias, monitor and respond in production. If you've internalized Modules 7 and 8, you already recognize this shape: the responsible-AI frameworks are asking for the discipline you've built, documented.

The practical takeaway: classify your use case early, because "are we high-risk?" determines whether logging, oversight, and documentation are nice-to-haves or legal obligations — and retrofitting them is expensive.

## Key takeaways

- Responsible AI lands as engineering: bias evals, disclosure banners, oversight workflows, retention configs, audit trails — Module 7's machinery pointed at societal requirements.
- Measure bias with counterfactual evals on your actual system (vary only sensitive attributes/proxies), run them in CI, and prefer structural mitigations over prompt-level ones.
- Disclose AI use and limitations plainly; scale human oversight with stakes — for high-stakes decisions the model informs and a measured, empowered human decides.
- Privacy is configuration plus discipline: know retention and training-use policies, redact PII, set trace retention, and make deletion reach the vector store.
- EU AI Act regulates by use-case risk tier (high-risk = heavy obligations); NIST AI RMF describes the same govern/map/measure/manage discipline voluntarily. Classify your use case early.
