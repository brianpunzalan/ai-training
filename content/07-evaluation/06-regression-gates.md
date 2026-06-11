# Regression Gates & CI for Prompts

> **What you'll learn:** how to wire the evals from this module into CI so prompt and model changes are gated like code changes, how to handle the statistical noise that makes LLM tests flaky, what a promptfoo-style config looks like, and how canary deploys close the loop in production.

## The change that broke production was one line

Here's the scenario this lesson prevents. Someone tightens a sentence in the system prompt to fix a complaint. It works for that case, review looks fine, it ships — and three days later support tickets reveal that refund-policy answers lost their citations. Nothing crashed; no test failed, because there were no tests. **Prompts, model versions, retrieval configs, and tool schemas are behavior-defining source code** (Module 2's contract framing), and they deserve what source code gets: automated tests that run on every change, with a gate that blocks the merge when quality drops.

You already have all the parts. The golden set (Lesson 2) is the test data; programmatic checks (Lesson 3) and the calibrated judge (Lesson 4) are the assertions; tracing (Lesson 5) catches what slips through. This lesson assembles them into a pipeline.

## The gate, concretely

On every PR that touches a prompt, model id, or pipeline config: run the eval suite against the changed system, score it, compare to the baseline (main branch's last run), and **fail the build** if quality dropped beyond tolerance. A declarative config — here in the style of [promptfoo](https://www.promptfoo.dev/), the open-source tool built for exactly this — keeps the suite readable:

```yaml
# promptfooconfig.yaml
prompts:
  - file://prompts/support_v3.txt
providers:
  - anthropic:claude-sonnet-4-6
tests:
  - vars: { question: "How do I rotate my API key?" }
    assert:
      - type: contains
        value: "[docs:"
      - type: llm-rubric
        value: "Answer is grounded in the provided context and tells the user what to do next"
  - vars: { question: "Can I get a refund after 30 days?" }
    assert:
      - type: regex
        value: "\\[docs:refunds\\]"
      - type: not-contains
        value: "as an AI"
```

`promptfoo eval` runs the matrix, and the same config drives side-by-side comparisons of two prompts or two models. Whether you use promptfoo, your own harness from Lab 03 grown up, or an observability platform's eval runner (Lesson 5), the CI shape is identical:

```yaml
# .github/workflows/prompt-ci.yml (sketch)
on:
  pull_request:
    paths: ["prompts/**", "pipeline/config.*"]
jobs:
  eval:
    steps:
      - run: promptfoo eval --output results.json
      - run: python scripts/compare_to_baseline.py results.json  # exits 1 on regression
```

Two practical notes: gate the *expensive* suite on the paths that affect behavior (running 400 judge calls because someone edited a README is how teams turn gates off), and post the score diff plus the **list of newly failing cases** as a PR comment — Lesson 1 again: the failure list, not the aggregate, is what the reviewer needs.

## The statistics of flaky judges

LLM eval scores are noisy: generation varies between runs (even at temperature 0 — Module 1), and judge verdicts wobble on borderline cases. Treat a single run's 84% vs 86% as what it is — *indistinguishable* — or your gate will block innocent PRs until everyone hates it. The toolkit:

- **Thresholds with tolerance** — gate on "drop > 3 points", not "any drop"; pick tolerance by measuring run-to-run variance on an unchanged system (run the suite 5× against main; the spread you see is your noise floor).
- **Multiple runs for borderline verdicts** — if the score lands within tolerance of the gate, re-run; for high-variance tasks, score as pass@k or mean-of-k rather than single-shot.
- **Per-case stability beats aggregate stability** — a flat aggregate can hide five new failures canceling five new passes. Diff *which cases* changed status; new failures on previously-passing cases are the strongest regression signal.
- **Hard floors for non-negotiables** — deterministic checks on critical behavior (schema validity, no-PII, refusal policy) gate at 100%, no tolerance. Statistical thinking is for the fuzzy criteria.

Tier the suite by cost, like any test pyramid: programmatic checks on everything per-commit (seconds, free); the judged golden set per-PR on behavior-affecting paths (minutes, dollars); the full matrix — judge suite × multiple seeds, plus regression slices (Module 6) — nightly and before model upgrades.

## Canaries: the gate after the gate

CI gates catch what your golden set anticipates; production catches the rest. Close the loop the way infra teams do: **canary deploys** — route a few percent of traffic to the new prompt/model, watch the online metrics from Lesson 5 (thumbs-down rate, schema-failure rate, "couldn't find" rate, cost, latency) against the control group, and promote or roll back on evidence. This requires the unglamorous prerequisite from Module 2: per-request prompt/model version logging, so the comparison is even possible. Failures the canary surfaces flow back — as always — into the golden set, so the gate that missed them never misses them again.

## Key takeaways

- Prompts, model ids, and pipeline configs are behavior-defining source code: changes get an automated eval run and a merge-blocking gate, assembled from this module's parts (golden set + checks + judge).
- Declarative eval configs (promptfoo-style) keep suites reviewable; trigger the expensive suite only on paths that affect behavior, and post failing cases — not just scores — on the PR.
- Respect the noise: measure your run-to-run variance, gate on tolerances not any-drop, diff per-case status, and keep zero-tolerance floors only for deterministic non-negotiables.
- Tier by cost: rules per-commit, judged golden set per-PR, full multi-seed matrix nightly and before model upgrades.
- Canary new prompts/models on a traffic slice with online metrics, promote on evidence, and feed every canary-caught failure back into the golden set.
