# Guardrails & Safety Layers

> **What you'll learn:** how to wrap an LLM application in layered input and output controls — classification, validation, PII redaction, moderation, topic restriction — and how to make the engineering trade-offs: latency budgets, blocking vs flagging, and false-positive cost.

## Prompt rules are not a safety system

Module 2 was blunt about it: prose instructions are suggestions. A system prompt that says "only discuss billing topics" will hold for most traffic and fold under pressure — adversarial pressure (next lesson) or just the long tail of weird inputs. Production systems therefore wrap the model in **guardrails**: independent checks that run *outside* the model, before the input reaches it and after the output leaves it.

```
user input → [INPUT RAILS] → model (+ tools) → [OUTPUT RAILS] → user
                  ↓ block/flag/redact            ↓ block/fix/flag
```

The layering matters because each layer fails differently: the system prompt shapes behavior, input rails stop what shouldn't enter, output rails stop what shouldn't leave, and (for agents) permission gates bound what actions can happen in between — Module 5's defense-in-depth, applied to content.

## Input rails

**Topic/intent classification.** A small, fast classifier decides whether the request is in scope before the expensive model sees it. This can be a cheap LLM call with a constrained output (Module 3), a fine-tuned small model (Module 6's right-sizing logic — a classifier is a narrow task), or even embedding similarity against labeled examples. Off-topic requests get a polite canned redirect — which is also a *cost* control: tokens not spent on out-of-scope chat.

**Moderation.** Purpose-built safety classifiers — the OpenAI Moderation endpoint (free), Llama Guard (open-weight, self-hostable), or equivalents — score inputs across harm categories (violence, self-harm, sexual content, harassment). They're cheap, fast, and better calibrated than a prompted "is this harmful?" call.

**PII handling.** Detect and redact emails, phone numbers, account IDs, names *before* the model call when the model doesn't need them: regex + NER libraries (e.g., Presidio) handle the bulk. This protects users, shrinks what reaches third-party APIs and your traces (Module 7's privacy note), and matters doubly under data-protection rules (Lesson 5).

**Injection screening.** Heuristics and classifiers for known attack shapes — covered properly next lesson, since it deserves its own treatment.

## Output rails

Outputs get the mirror treatment, and you've already built most of it in this course:

- **Schema validation** (Module 3) — malformed structure never reaches a consumer.
- **Grounding/citation checks** (Module 4) — answers without citations, or with citations to chunks that weren't retrieved, get blocked or regenerated.
- **Content rules** (Module 7's programmatic checks, run online) — banned phrases, competitor mentions, legal/medical advice patterns, leaked system-prompt fragments.
- **Output moderation** — the same safety classifiers, pointed at what the model produced; essential because an innocuous input can still yield a problematic output.
- **PII scan outbound** — the model must not emit *other* users' data; an outbound detector is the last line against retrieval mistakes (a multi-tenant filter bug, Module 4) becoming a breach.

```python
async def guarded_reply(user_input: str) -> str:
    intent = await classify_intent(user_input)            # input rails
    if intent.label != "billing":
        return CANNED_REDIRECT
    if (await moderate(user_input)).flagged:
        return CANNED_DECLINE

    reply = await generate(redact_pii(user_input))        # the actual model call

    checks = run_output_checks(reply)                     # output rails
    if checks.hard_fail:                                  # policy violation, PII leak
        log_incident(user_input, reply, checks)
        return SAFE_FALLBACK
    if checks.soft_fail:                                  # quality concerns
        flag_for_review(user_input, reply, checks)        # ship it, but a human looks
    return reply
```

```typescript
async function guardedReply(userInput: string): Promise<string> {
  const intent = await classifyIntent(userInput);          // input rails
  if (intent.label !== "billing") return CANNED_REDIRECT;
  if ((await moderate(userInput)).flagged) return CANNED_DECLINE;

  const reply = await generate(redactPii(userInput));      // the actual model call

  const checks = runOutputChecks(reply);                   // output rails
  if (checks.hardFail) {                                   // policy violation, PII leak
    logIncident(userInput, reply, checks);
    return SAFE_FALLBACK;
  }
  if (checks.softFail) flagForReview(userInput, reply, checks);
  return reply;
}
```

## The engineering trade-offs

**Latency budget.** Rails add time on the user's critical path. Keep input rails fast (a small classifier is ~50–150ms; run independent rails concurrently), and exploit streaming asymmetry: input rails must finish before generation starts, but output checks on a *streamed* response (Module 3) either buffer (losing streaming's perceived-latency win) or scan incrementally with the ability to cut the stream — a real design fork to choose deliberately. Frameworks like NeMo Guardrails and the guardrails-ai library package these flows, but the architecture above is what they implement.

**Blocking vs flagging.** Blocking is for bright lines (PII leak, policy violation); flagging — ship it, log it, queue for human review (Module 7's sampled review, with a priority lane) — is for everything in between. Wire flag rates into your observability dashboards: a spike is an early-warning signal of drift or an attack campaign.

**False positives are a product cost, not just an error rate.** A guardrail that wrongly declines 2% of legitimate requests frustrates 2% of your users *at every interaction*. Every blocking rail needs an eval set of its own — including benign-but-edgy cases — and its precision/recall tracked like any model (Module 7). Tune blocking rails toward precision; let flagging absorb the recall.

## Key takeaways

- Prompt rules shape behavior but don't enforce it — production systems add independent input rails (intent, moderation, PII redaction) and output rails (schema, grounding, content rules, outbound PII).
- Reuse what you've built: Module 3's validation, Module 4's citation checks, and Module 7's programmatic checks become output rails when run online.
- Budget rail latency: run input rails concurrently, and choose deliberately between buffering and incremental scanning for streamed outputs.
- Block on bright lines, flag and human-review the gray zone, and alert on flag-rate spikes.
- Every blocking guardrail is itself a classifier with false positives that cost real users — give each one an eval set and tune toward precision.

## Lab

Put this into practice in **Lab 08 — Prompt-Injection Guardrail** (find it in the Labs section of the site): you'll build an input rail that screens for injection attempts, measure its precision and recall against a labeled attack/benign set, and feel the false-positive trade-off firsthand.
