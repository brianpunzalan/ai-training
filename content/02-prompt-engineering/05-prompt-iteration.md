# The Prompt Iteration Workflow

> **What you'll learn:** why prompt engineering is an empirical discipline rather than wordsmithing, the iterate–measure–commit loop that professionals use, how to debug a failing prompt systematically, and how this workflow becomes the foundation for the evaluation discipline in Module 7.

## Prompting is empirical, not literary

The defining mistake of amateur prompt engineering is editing the prompt, eyeballing one or two outputs, declaring victory, and moving on. The fix that improved your one test case may have silently broken five others — and you'll discover that in production.

Professionals treat a prompt the way they treat code: a change isn't "done" until it's been run against a fixed set of test inputs and the results compared to the previous version. The workflow looks like this:

1. **Collect test cases** — 10–30 representative inputs to start, including the edge cases that worried you enough to write rules about them. Real user inputs beat invented ones.
2. **Define what "good" means** — per test case, an expected output, a checklist, or at minimum a pass/fail judgment you can make consistently.
3. **Run the whole set** against the current prompt and record results.
4. **Change one thing** — a rule, an example, the structure — and re-run *everything*.
5. **Compare, then commit** — keep the change only if aggregate quality improved; version the prompt like source code (because it is, per Lesson 3).

This is a miniature evaluation harness, and it's exactly what you'll build in this module's lab. Module 7 scales the same idea into golden test sets, LLM-as-judge scoring, and CI regression gates.

## A minimal harness

You don't need a framework — a loop, a scoring function, and a results table will carry you a long way:

```python
import anthropic

client = anthropic.Anthropic()

CASES = [
    {"input": "Refund for order #1234, it arrived broken", "must_contain": ["refund"]},
    {"input": "u guys are a scam!!", "must_contain": ["apolog"]},
    {"input": "What's your CEO's home address?", "must_contain": ["can't", "cannot"]},
]

def run_prompt(system_prompt: str) -> float:
    passed = 0
    for case in CASES:
        msg = client.messages.create(
            model="claude-sonnet-4-6", max_tokens=512,
            system=system_prompt,
            messages=[{"role": "user", "content": case["input"]}],
        )
        text = msg.content[0].text.lower()
        if any(s in text for s in case["must_contain"]):
            passed += 1
    return passed / len(CASES)

print(f"pass rate: {run_prompt(open('prompts/support_v2.txt').read()):.0%}")
```

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";

const client = new Anthropic();

const CASES = [
  { input: "Refund for order #1234, it arrived broken", mustContain: ["refund"] },
  { input: "u guys are a scam!!", mustContain: ["apolog"] },
  { input: "What's your CEO's home address?", mustContain: ["can't", "cannot"] },
];

async function runPrompt(systemPrompt: string): Promise<number> {
  let passed = 0;
  for (const c of CASES) {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6", max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: c.input }],
    });
    const text = msg.content[0].type === "text" ? msg.content[0].text.toLowerCase() : "";
    if (c.mustContain.some((s) => text.includes(s))) passed++;
  }
  return passed / CASES.length;
}

console.log(`pass rate: ${await runPrompt(readFileSync("prompts/support_v2.txt", "utf8"))}`);
```

Crude string checks won't catch everything — Module 7 covers richer scoring — but even this catches the regressions that eyeballing misses, and it makes improvement *visible*.

## Debugging a failing prompt

When a case fails, resist the urge to immediately add a rule. Diagnose first:

| Symptom | Likely cause | First fix to try |
|---|---|---|
| Output format drifts | Format described but not demonstrated | Add a few-shot example (Lesson 1) |
| Ignores a rule | Rule buried mid-prompt, or contradicted elsewhere | Move it near the end; hunt for the contradiction (Lesson 4) |
| Wrong on hard inputs only | Task needs reasoning room | Let the model think before answering (Lesson 2) |
| Confidently wrong facts | Knowledge isn't in the model | Stop prompting — you need retrieval (Module 4) |
| Refuses valid requests | Over-broad safety rule | Replace "never X" with a positive instruction plus the escape hatch (Lesson 3) |

Two habits separate fast debuggers from slow ones. First, **read the full transcript**, not just the final answer — the failure is usually visible earlier, in how the model restated the task. Second, **change one variable at a time**; if you rewrite three sections and the score moves, you've learned nothing about which edit mattered.

Also know when prompting is the wrong tool: if accuracy plateaus after several disciplined iterations, the fix usually lives elsewhere — retrieval for missing knowledge (Module 4), tool calling for computation (Module 3), or fine-tuning for stubborn style and format issues (Module 6).

## Versioning and team workflow

- Keep prompts in **files in the repo**, not inline strings or a dashboard textbox — you want diffs, reviews, and blame.
- Name versions explicitly (`support_v3.txt` or a git tag) and **log the version with every request** so production issues map back to the prompt that caused them.
- Record *why* each change was made (a one-line changelog beats archaeology).
- Treat a **model upgrade as a prompt change**: re-run the full case set, because behavior shifts between model versions even when your prompt doesn't.

## Key takeaways

- Never judge a prompt change on one output — run a fixed set of test cases before and after, every time.
- The loop is: collect cases → define "good" → run all → change one thing → compare → commit.
- Debug by diagnosis: format drift wants examples, ignored rules want repositioning, reasoning failures want thinking room, missing knowledge wants retrieval — not more prose.
- Prompts live in version control with logged versions per request; a model upgrade is a change that needs the same regression run.
- This workflow is Module 7's evaluation discipline in miniature — build the habit now while the stakes are small.

## Lab

Put this into practice in **Lab 03 — Mini Prompt-Eval Harness** (find it in the Labs section of the site): you'll build the run-score-compare loop in Python or TypeScript, run two prompt versions against a shared case set, and produce a comparison table that tells you which one to ship.
