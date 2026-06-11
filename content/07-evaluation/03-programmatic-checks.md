# Rule-Based & Programmatic Checks

> **What you'll learn:** the deterministic checks that should carry as much of your evaluation load as possible — exact match, regex, schema validation, assertion checks, and execution-based testing — plus the decomposition trick that converts fuzzy quality questions into checkable rules.

## Deterministic first, model second

The evaluation layers from Lesson 1 have a strict economic ordering. Programmatic checks are **free, instant, perfectly consistent, and runnable on every commit** — LLM judges (Lesson 4) are none of those things. So the working rule: *push every criterion that can possibly be checked deterministically into code, and spend the judge only on what remains.* Teams routinely discover that 60–80% of what they cared about was checkable all along — they just hadn't written it down as rules.

## The check toolbox

**Exact match** — for tasks with one right answer: classification labels, extracted values, multiple-choice. Normalize before comparing (case, whitespace, number formats) or you'll fail correct answers on formatting trivia.

**Contains / excludes** — the workhorse. Must mention the refund policy; must include a citation marker; must NOT contain "as an AI", competitor names, raw PII, apology boilerplate. Cheap, readable, and surprisingly load-bearing — Module 2's lab harness was built on these.

**Regex / structural rules** — formats with shape: dates, order IDs, citation patterns like `\[\d+\]`, "starts with a heading", "≤ 3 sentences" (count terminators), "no markdown fences in JSON output".

**Schema validation** — for structured outputs (Module 3), reuse the *same* Pydantic/Zod schema from production as an eval check: parses → conforms → plus field-level rules (enums, ranges, cross-field consistency like `total == sum(line_items)`).

**Execution-based checks** — the gold standard wherever output is runnable. Generated code: does it parse, type-check, pass the test suite? Generated SQL: does it execute, and return the expected rows on a fixture DB? This is exactly how coding benchmarks (HumanEval and descendants) score — correctness by behavior, not appearance.

```python
import re
from pydantic import BaseModel, ValidationError

class Verdict(BaseModel):
    passed: bool
    reason: str

def check_support_reply(output: str) -> list[Verdict]:
    checks = [
        Verdict(passed=len(re.findall(r"[.!?]", output)) <= 3,
                reason="at most 3 sentences"),
        Verdict(passed=bool(re.search(r"\[docs:[a-z-]+\]", output)),
                reason="cites a doc slug"),
        Verdict(passed="as an AI" not in output.lower(),
                reason="no AI boilerplate"),
    ]
    return checks

def check_extraction(output: str, schema: type[BaseModel]) -> Verdict:
    try:
        schema.model_validate_json(output)
        return Verdict(passed=True, reason="parses and matches schema")
    except ValidationError as e:
        return Verdict(passed=False, reason=str(e.errors()[0]))
```

```typescript
import { z } from "zod";

type Verdict = { passed: boolean; reason: string };

function checkSupportReply(output: string): Verdict[] {
  return [
    { passed: (output.match(/[.!?]/g) ?? []).length <= 3, reason: "at most 3 sentences" },
    { passed: /\[docs:[a-z-]+\]/.test(output), reason: "cites a doc slug" },
    { passed: !output.toLowerCase().includes("as an ai"), reason: "no AI boilerplate" },
  ];
}

function checkExtraction(output: string, schema: z.ZodTypeAny): Verdict {
  const result = schema.safeParse(JSON.parse(output));
  return result.success
    ? { passed: true, reason: "parses and matches schema" }
    : { passed: false, reason: result.error.issues[0].message };
}
```

## Decomposition: making fuzzy criteria checkable

"Is this a good support reply?" isn't checkable. But Lesson 2's decomposed-binary-labels insight applies to checks too — most of "good" decomposes into rules:

| Fuzzy criterion | Checkable decomposition |
|---|---|
| "Professional tone" | no slang list hits, no ALL-CAPS runs, no exclamation clusters |
| "Grounded answer" | every sentence carries a citation id; cited ids exist in the retrieved set (Module 4) |
| "Followed the workflow" | tool-call sequence matches expected pattern (Module 5 agents) |
| "Concise" | token/sentence count under threshold |
| "Safe refusal" | matches refusal pattern AND contains redirect to support |

What's left after decomposition — "is the *reasoning* sound?", "is this the *most helpful* of the valid answers?" — is the genuine residue for LLM-as-judge. The decomposition isn't just cheaper; each rule failure tells you *what* broke, while a judge's 6/10 tells you almost nothing (Lesson 1: the failure list is the product).

## Where deterministic checks beat judges — and where they lie

Prefer rules when the criterion is **objective** (format, presence, schema, executable behavior), when you need **per-commit speed** (regression gates, Lesson 6, run thousands of checks in seconds), and when **consistency is the point** — a regex never has a position bias or a generous day (Lesson 4's judge pathologies).

But respect the two classic traps. **Brittleness**: an exact-match check fails "The total is $42.00" against expected "$42" — over-strict rules produce false alarms that train the team to ignore red. Normalize aggressively, and when a check keeps crying wolf on acceptable outputs, loosen it or promote that criterion to the judge. **Goodharting**: outputs that satisfy every rule can still be wrong — a reply with perfect citations to *irrelevant* docs passes the citation regex. Rules verify necessary conditions, rarely sufficient ones. That's why the eval stack is layered: rules catch the cheap 80%, judges assess the fuzzy residue, and sampled human review (Lesson 1) audits both.

## Key takeaways

- Push every objectively checkable criterion into deterministic code; spend LLM judges only on the residue. Most teams find 60–80% of their criteria were rule-checkable.
- The toolbox: normalized exact match, contains/excludes, regex for shaped formats, production schemas reused as eval checks, and execution-based testing wherever output runs.
- Decompose fuzzy criteria ("good reply") into binary rules — each failure then localizes the problem, which a holistic score never does.
- Rules are fast, free, and bias-free, which makes them the backbone of CI regression gates (Lesson 6).
- Beware over-strict checks (normalize; loosen chronic false-alarmers) and Goodharting (rules are necessary conditions, not sufficient ones) — keep judges and sampled human review in the stack.
