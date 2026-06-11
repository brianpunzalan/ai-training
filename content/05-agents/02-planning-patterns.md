# Planning & Reasoning Patterns

> **What you'll learn:** the patterns that structure how an agent thinks — ReAct, plan-then-execute, reflection/Reflexion, and extended thinking — what each one buys you, what it costs, and how to choose for a given task.

## Why planning is a pattern, not a feature

An LLM in a loop will happily take the locally-plausible next action forever. Planning patterns exist to impose **global structure** on that local greediness: think before acting, check work after acting, decompose before diving in. Each pattern is ultimately just a way of arranging prompts, tool calls, and the loop — which means you can implement all of them with what you learned in Module 3, Lesson 4.

## ReAct: interleaved reasoning and acting

**ReAct** (Reason + Act, Yao et al. 2022) is the foundational pattern: the model alternates between a *thought* (why it's doing what it's doing), an *action* (a tool call), and an *observation* (the tool result), and each observation informs the next thought.

```
Thought: The error mentions a missing column. I should check the schema first.
Action: run_sql("DESCRIBE orders")
Observation: columns: id, customer_id, total, created_at
Thought: There's no 'status' column — the query in the report is stale...
Action: grep("status", "reports/")
```

The original paper used this as a literal text format parsed from completions. In 2026 you rarely implement it that way — **native tool calling is ReAct**: the model emits reasoning text alongside structured tool calls, your loop returns results, repeat. The insight that survives is the *interleaving*: the agent adapts after every observation, which makes ReAct the right default for exploratory tasks where each step's result determines the next step (debugging, research, navigating unknown codebases).

Its weakness is myopia. A purely reactive agent can rabbit-hole — ten steps deep into a dead end because each individual step looked locally reasonable.

## Plan-then-execute: think first, act second

The opposite pole: have the model produce an explicit plan **up front**, then execute steps, optionally re-planning when reality diverges.

```python
plan = llm(f"""Break this task into 3-7 concrete steps.
Task: {task}
Return a numbered list. Each step must be independently verifiable.""")

results = []
for step in parse_steps(plan):
    results.append(execute_step(step, context=results))  # bounded sub-agent or tool calls
    if needs_replan(results[-1]):
        plan = llm(f"Plan so far failed at: {results[-1]}. Revise the remaining steps.")
```

```typescript
let plan = await llm(`Break this task into 3-7 concrete steps.
Task: ${task}
Return a numbered list. Each step must be independently verifiable.`);

const results: StepResult[] = [];
for (const step of parseSteps(plan)) {
  results.push(await executeStep(step, results)); // bounded sub-agent or tool calls
  if (needsReplan(results.at(-1)!)) {
    plan = await llm(`Plan so far failed at: ${JSON.stringify(results.at(-1))}. Revise the remaining steps.`);
  }
}
```

Benefits: the plan is **inspectable before any side effects happen** (show it to a human for approval — a natural guardrail hook, Module 8), steps can be parallelized when independent, and the global structure resists rabbit-holing. Cost: plans made with zero observations are made with the least information the agent will ever have; without a re-planning escape hatch, the agent marches confidently through a stale plan. Agentic coding tools surface this pattern as visible todo/plan lists — partly for the model's benefit, mostly for the human's.

## Reflection and Reflexion: the agent as its own critic

**Reflection** adds a self-critique step: generate, critique, revise. The evaluator-optimizer workflow from Lesson 1 is exactly this with the roles split across calls. **Reflexion** (Shinn et al. 2023) extends it across *episodes*: when an attempt fails, the agent writes a verbal lesson ("I assumed the API returned JSON; it returns CSV") into memory, and the next attempt starts with those lessons in context — learning across trials without touching weights.

The critical caveat: reflection only helps when the critic has **signal**. A model grading its own free-form prose tends to congratulate itself. Reflection shines when verification is easier than generation — failing tests, compiler errors, schema validators, a judge with a concrete rubric (Module 7). Wire the critique to ground truth and the loop converges; wire it to vibes and you pay double tokens for sycophancy.

## Extended thinking: planning inside the model

Modern reasoning models (Claude's extended thinking, OpenAI's o-series and successors) move much of this machinery **inside the model**: given a thinking budget, the model deliberates — decomposing, backtracking, self-checking — before its visible answer or tool call. Practical consequences:

- A single hard decision (which approach? is this safe?) often does better with a thinking budget than with an elaborate external plan-step scaffold.
- Thinking tokens are billed as output tokens; budgets are a cost/quality dial worth evaluating per task, not maximizing by default.
- Interleaved thinking between tool calls gives you ReAct's "Thought" step with far more depth — the model genuinely deliberates over the observation before acting.

Extended thinking shrinks how much pattern-scaffolding you need, but doesn't eliminate it: explicit plans still matter when humans must approve before execution, and reflection against external verifiers still beats self-assessment.

## Choosing a pattern

| Pattern | Best for | Main failure mode | Cost profile |
|---|---|---|---|
| **ReAct (interleaved)** | Exploration; each result drives the next step | Rabbit-holing, local myopia | Pay-as-you-go per step |
| **Plan-then-execute** | Decomposable tasks; approval gates; parallelism | Stale plans without re-planning | Plan overhead + steps |
| **Reflection / Reflexion** | Tasks with cheap verification (tests, schemas) | Self-congratulation without ground truth | ~2×+ tokens per attempt |
| **Extended thinking** | Single hard decisions; deep tool-use trajectories | Paying for thinking the task doesn't need | Thinking budget as output tokens |

These compose: a production coding agent typically plans up front, executes ReAct-style with interleaved thinking, and reflects against the test suite before declaring victory.

## Key takeaways

- Planning patterns impose global structure on a loop that is otherwise locally greedy.
- **ReAct** interleaves thought → action → observation; native tool calling is its modern implementation. Default for exploratory work; prone to rabbit-holes.
- **Plan-then-execute** front-loads structure, enables approval gates and parallelism, but needs re-planning to survive contact with reality.
- **Reflection/Reflexion** works when verification is easier than generation — anchor the critic to tests, schemas, or rubrics, not self-assessment.
- **Extended thinking** moves deliberation inside the model; budget it per task and combine it with external patterns rather than replacing them.
