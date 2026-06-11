# Capstone: The Production Readiness Checklist

> **What you'll learn:** this closing lesson assembles the entire course into a single artifact — the checklist to run before (and after) shipping any LLM feature — and shows how the eight modules you've completed map onto the lifecycle of a production AI system.

## From demo to dependable

The distance between "works in a notebook" and "runs in production" is the distance this course has covered. A demo needs a model and a prompt. A production system needs everything else: measured quality, bounded costs, graceful failure, defended inputs, observable behavior, and a plan for the day the model misbehaves — because every module taught some version of the same lesson: *the model is the smallest part of the system.*

What follows is the checklist. Use it as a gate before launch, an audit for what's already live, and a map of where each course module earns its keep. Not every item applies to every system — a high-stakes decision tool needs all of it, an internal summarizer needs less — but for every item you skip, skip it *deliberately*, on the record (Lesson 5's documentation discipline), not by forgetting.

## The checklist

**Quality & evaluation (Modules 2, 7)**
- [ ] A golden test set exists, sourced from real traffic where possible, versioned in git
- [ ] Programmatic checks cover every deterministic requirement (format, schema, citations, banned content)
- [ ] An LLM judge — calibrated against human labels — covers the fuzzy criteria
- [ ] Eval runs gate prompt/model/config changes in CI, with noise-aware thresholds
- [ ] Prompts are versioned files; every request logs prompt + model versions

**Reliability & failure handling (Modules 1, 3, 5)**
- [ ] Every model call has timeouts, retries with backoff, and a rate-limit strategy
- [ ] Structured outputs are schema-validated on every response, with a retry-then-fallback path
- [ ] A degraded mode exists for provider outages (fallback model, cached response, or honest error)
- [ ] Agent loops have iteration caps, cost budgets, and no-progress detection
- [ ] Consequential actions sit behind approval gates scoped by blast radius

**Cost & latency (Modules 1, 8)**
- [ ] Per-request token usage and cost are logged and attributable (per feature, per tenant)
- [ ] Models are right-sized — small/cheap where evals say quality holds; routing or cascades where load is mixed
- [ ] Prompt caching is enabled with stable-first prompt ordering; cache hit rates are monitored
- [ ] Non-interactive work runs on batch APIs; `max_tokens` and history budgets are set deliberately
- [ ] Streaming covers user-facing latency; TTFT and total latency have p95 targets on a dashboard

**Knowledge & grounding (Module 4 — if RAG)**
- [ ] Ingestion is idempotent and incremental; stale chunks are deleted on source changes
- [ ] Retrieval quality is measured (recall@k, MRR) on a labeled set; generation faithfulness is judged
- [ ] Answers cite sources; "not found" beats guessing, by prompt and by policy
- [ ] Multi-tenant access control is enforced *in retrieval filters*, treated as a security boundary

**Security & safety (Modules 5, 8)**
- [ ] Input rails: intent scoping, moderation, PII redaction where the model doesn't need it
- [ ] Output rails: schema, content rules, outbound PII scan; block bright lines, flag the gray zone
- [ ] The lethal trifecta is broken or the residual risk is explicitly accepted in writing
- [ ] Tools run least-privilege, scoped to the requesting user; agents touching untrusted content are sandboxed
- [ ] A red-team injection suite runs as a regression gate; canary injections live in test corpora
- [ ] Model output is treated as untrusted input wherever it's rendered or executed

**Observability & operations (Module 7)**
- [ ] Every interaction is traced end-to-end (spans for retrieval, tools, generation) and replayable
- [ ] Online checks run on all traffic; judges on a sample; dashboards alert on rates, not single events
- [ ] Sampled human trace review happens on a schedule, and its findings feed the golden set
- [ ] An incident runbook exists: how to roll back a prompt, pin a model version, disable a tool, kill a feature flag
- [ ] Model versions are pinned (no silent upgrades); upgrades go through the full eval gate plus canary

**Responsibility & compliance (Module 8)**
- [ ] AI use and limitations are disclosed to users
- [ ] Counterfactual bias evals run for systems affecting people; high-stakes decisions keep a measured human in the loop
- [ ] Data retention is configured end-to-end (provider, traces, vector stores); deletion requests reach all of it
- [ ] The use case is classified against applicable regulation (EU AI Act tier, sector rules), with obligations documented

## The shape of the discipline

Step back from the items and the course's architecture is visible in three habits. **Measure, don't vibe** — from sampling parameters (Module 1) to prompt changes (Module 2) to retrieval configs (Module 4) to fine-tunes (Module 6), every decision improved the moment it ran against an eval set. **The harness is yours** — model capabilities arrive from providers, but context curation, tool design, guardrails, and orchestration (Modules 3, 5, 8) are where your engineering determines the outcome. **Close the loop** — production failures become eval cases, eval cases gate changes, gated changes ship safely (Module 7); systems improve on purpose, not by accident.

And the field will keep moving: models, context windows, protocols, and regulations have all changed while you took this course, and will keep changing after it. That's precisely why the durable assets are the ones this checklist encodes — your eval sets, your traces, your guardrails, your judgment about trade-offs. Those transfer to every model that hasn't been released yet.

## Where to go next

- **Build something real.** Pick a problem you actually have, and take it through this checklist. Nothing consolidates the course like meeting each item in the wild.
- **Revisit the labs** in the other language — the Python/TypeScript pairing exists so you can.
- **Keep your review queue alive.** The spaced-repetition quizzes you've been taking are Module 7 applied to your own memory: retrieval practice with regression testing.
- **Follow the primary sources** in each module's references — the engineering blogs and papers there are where the next techniques will appear first.

You came for "how do I call an LLM?" and leave with "how do I run an LLM system I can defend." That's the job title now: AI engineer. Ship something.

## Key takeaways

- Production readiness is a checklist, not a feeling: quality gates, failure handling, cost controls, grounding, security layers, observability, and compliance — each traceable to a module of this course.
- Skip items deliberately and on the record, never by omission; stakes determine how much of the list applies.
- The three durable habits: measure don't vibe, own the harness, close the production→eval→gate loop.
- Models churn; eval sets, traces, guardrails, and judgment compound. Invest accordingly.
- The course is over; the checklist isn't. Take it to a real problem.
