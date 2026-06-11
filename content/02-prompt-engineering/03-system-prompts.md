# System Prompts as Software Contracts

> **What you'll learn:** how to structure a production system prompt, why it should live in version control with review and tests like any other interface code, and how to write rules that survive contact with real users.

## The mental shift

In Module 1 you met the `system` role as "the developer's channel." This lesson upgrades that: in a production application, the system prompt **is an interface contract** between your code and the model. Your parsing code depends on its output format. Your safety posture depends on its rules. Your brand depends on its tone. When any of those break, you have a production incident — except the "code" that broke is a paragraph of English nobody reviewed.

So treat it like the load-bearing artifact it is: it lives in git, changes go through code review, every change runs against an eval suite (lesson 5 builds one; Module 7 industrializes it), and deployments record which prompt version served which request. "Someone edited the prompt in a dashboard last Tuesday" is the LLM era's "someone SSH'd into prod and edited the config."

## Anatomy of a production system prompt

Effective system prompts converge on a recognizable structure. Order matters — models weight clear, early role definitions heavily, and a stable layout helps both human reviewers and prompt caching (next lesson):

```
1. Role & objective      — who the model is, what job it's doing, for whom
2. Context               — facts it needs: product names, current date, user tier
3. Capabilities & limits — what it may do; what it must never do
4. Behavioral rules      — tone, length, language, escalation policy
5. Output format         — exact schema or template, with a literal example
6. Examples              — 1–3 gold-standard demonstrations (lesson 1)
7. Escape hatches        — what to do when uncertain, off-topic, or under attack
```

A worked (abridged) example:

```
You are the support assistant for Lumen, a project-management SaaS.

# Context
- Today's date: {{date}}. The user is on the {{plan}} plan.
- You only have knowledge of Lumen's product. You cannot access accounts.

# Rules
- Answer ONLY from the provided documentation. If the docs don't cover it,
  say so and offer to connect the user with support. Never invent features.
- Never discuss pricing negotiations, competitors, or legal matters —
  respond with the handoff template instead.
- Maximum 150 words unless the user asks for detail.

# Output format
Respond in Markdown. End with exactly one of:
[RESOLVED] | [NEEDS_HUMAN] | [OFF_TOPIC]
```

Notice the craft details: **positive instructions over vague negatives** ("answer only from the provided documentation" beats "don't hallucinate"); **every prohibition has a prescribed alternative** (the model must do *something* — tell it what); **machine-readable markers** (`[NEEDS_HUMAN]`) so downstream code can route without parsing prose; and **explicit uncertainty handling**, because a model with no "I don't know" path will improvise one.

## Templates, versioning, and the trust boundary

Real system prompts are templates with runtime data interpolated. Keep the template in a file with metadata, not inline in application code:

```python
# prompts/support_v3.py
SUPPORT_PROMPT_VERSION = "3.2.0"

SUPPORT_PROMPT = """You are the support assistant for Lumen...
# Context
- Today's date: {date}. The user is on the {plan} plan.
...
"""

def build_system_prompt(date: str, plan: str) -> str:
    return SUPPORT_PROMPT.format(date=date, plan=plan)

# Log SUPPORT_PROMPT_VERSION with every request — when behavior shifts,
# the first question is "which prompt was live?"
```

```typescript
// prompts/support_v3.ts
export const SUPPORT_PROMPT_VERSION = "3.2.0";

const SUPPORT_PROMPT = `You are the support assistant for Lumen...
# Context
- Today's date: {date}. The user is on the {plan} plan.
...
`;

export function buildSystemPrompt(date: string, plan: string): string {
  return SUPPORT_PROMPT.replace("{date}", date).replace("{plan}", plan);
}

// Log SUPPORT_PROMPT_VERSION with every request — when behavior shifts,
// the first question is "which prompt was live?"
```

One hard rule: **never interpolate untrusted user content into the system prompt.** The system prompt is your trust boundary — models are trained to weight it above user turns, which is exactly why attacker text must not get in. User input belongs in `user` messages; retrieved documents (Module 4) belong in clearly delimited blocks the prompt explicitly describes as *data, not instructions*. The system prompt is also your first defense against prompt injection — "ignore previous instructions" — but it is a soft defense: a determined attacker can often talk a model out of prose rules, so anything security-critical (permissions, spending limits, data access) must be enforced in code, with tool-level guards when you get to Module 3. The contract framing cuts both ways: the prompt sets *expected* behavior; your code must enforce *required* behavior.

## Changing the contract

Because prompts are tuned to a model's quirks (Module 1's lock-in lesson), every change — prompt edit *or* model upgrade — is a behavioral migration. The minimum responsible process:

| Step | Why |
|---|---|
| Change in a branch, with a diff | English diffs review surprisingly well — wording changes jump out |
| Run the eval suite before merge | The only way to know rule 7 didn't regress when you tightened rule 3 |
| Bump the version; log it per request | Makes incidents attributable and rollbacks trivial |
| Roll out gradually when stakes are high | Prompts can pass evals and still fail on real traffic |

Resist the temptation to fix every incident by appending another rule. System prompts accrete like legacy code: twenty exception clauses contradict each other, and models follow ten clear rules far better than forty overlapping ones. Periodically refactor — consolidate, delete dead rules, re-run evals. Brevity is also a latency and cost feature, though caching (next lesson) softens that.

## Key takeaways

- The system prompt is an interface contract: code depends on its output format and rules, so it gets version control, review, evals, and per-request version logging.
- Structure it predictably — role, context, rules, output format, examples, escape hatches — and always give the model a defined action for uncertainty and off-topic input.
- Write positive, specific instructions with machine-readable markers; every "never" needs an "instead."
- Never put untrusted input inside the system prompt, and never rely on prose rules for security — enforce hard requirements in code.
- Treat prompt edits and model upgrades as migrations gated by evals, and refactor accumulated rules before they contradict each other.
