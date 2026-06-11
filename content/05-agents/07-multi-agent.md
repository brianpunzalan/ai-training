# Multi-Agent Patterns

> **What you'll learn:** the architectures for systems of cooperating agents, why orchestrator–workers dominates in practice, when multiple agents genuinely beat one — and the failure modes (compounding errors, coordination cost, write conflicts) that make multi-agent the wrong default.

## Why more than one agent?

A single agent (Lessons 4–5) hits two walls. **Context**: one window must hold the task, every tool result, and every intermediate finding — long tasks drown in their own history (Lesson 3). **Focus**: a system prompt that covers researching, coding, reviewing, and summarizing does none of them sharply, and a forty-tool toolbox degrades tool selection (Lesson 5).

Multi-agent systems split work across model instances, each with its own context window, focused system prompt, and scoped tool set. The subagent mechanism from Lesson 5 is the building block; this lesson is about the architectures you assemble from it.

## The patterns

**Orchestrator–workers** is the dominant production pattern. A lead agent owns the goal: it decomposes the task, spawns workers with narrow briefs, integrates their results, and decides what's next. Workers are often *not* agents in the full sense — many are single bounded calls with a restricted toolbox. Anthropic's multi-agent research system is the canonical example: a lead researcher spawns parallel search subagents, each burning its own context on dead ends and returning only distilled findings; the lead synthesizes. The headline result was a ~90% improvement over single-agent on research evals — bought with roughly 15× the tokens of a single chat turn.

**Pipeline (sequential handoff)** chains specialists: researcher → writer → reviewer, each receiving the previous stage's *output*, not its transcript. This is really Module 5 Lesson 1's prompt-chaining workflow with agentic stages — predictable, debuggable stage by stage, and the right shape when the task naturally has phases.

**Evaluator–optimizer (generator–critic)** pairs a producer with a judge that scores against a rubric and returns actionable feedback, looping until pass or budget. It works precisely when verification is easier than generation (Lesson 2's reflection insight) — and the critic's independence is the point: a fresh context isn't anchored on the generator's reasoning, the same reason human code review works. Module 7's LLM-as-judge is this pattern aimed at evaluation.

**Debate/committee** — independent agents answer, then defend or vote — buys modest accuracy on hard reasoning at multiplied cost; in practice, self-consistency (Module 2) captures most of the benefit cheaper.

## When multi-agent wins — and when it hurts

The economics are stark: a worker's value is *context isolation* (the orchestrator pays a summary, not a transcript) and *parallelism* (three independent searches in the time of one). So the pattern wins when the task is **read-heavy, parallelizable, and exceeds one context window** — broad research, large-codebase exploration, gathering from many sources.

It hurts when subtasks are **tightly coupled, especially through writes**:

- **Write conflicts.** Two agents editing the same codebase produce merge conflicts and contradictory changes; agents don't coordinate unless you build the coordination.
- **Compounding errors.** Agents already compound errors across steps (Lesson 1); multi-agent compounds across *agents* — a worker's subtly wrong finding becomes the orchestrator's confident premise. Errors propagate through summaries that strip the caveats.
- **Information loss at boundaries.** A worker knows only its brief. Under-specified briefs are the #1 practical failure: the orchestrator must pass *everything* relevant — goal, constraints, format, what other workers are covering — because the worker can't ask follow-ups mid-task.
- **Cost and latency.** Every agent re-reads its own growing context. If one agent with a clean context could do the task, it's also the cheapest option.

A useful default ladder: single model call → workflow (Lesson 1) → single agent → single agent with subagents for research → full multi-agent. Earn each step with a measured failure of the previous one (the Module 7 discipline), not with an architecture diagram.

## Engineering the seams

Multi-agent quality lives at the boundaries, and the orchestrator's brief-writing is the highest-leverage prompt in the system:

```text
WORKER BRIEF
Goal: Find how rate limiting is implemented in this codebase.
Scope: read-only; search and read files under src/ and docs/.
Out of scope: authentication (another worker is covering it).
Return: file paths + line ranges, the mechanism used, gaps you
        couldn't resolve, and your confidence in each finding.
```

Three more seams worth engineering: **structured handoffs** (workers return Module 3-style schemas — findings, sources, confidence — not prose blobs the orchestrator must re-parse); **scoped permissions** (research workers get read-only toolsets; only the orchestrator, behind Lesson 4's approval gates, touches the world — which also shrinks the injection blast radius, Module 8); and **per-agent tracing** (a transcript per agent plus the orchestration tree, because "which agent went wrong, and what did it actually see?" is the first question in every multi-agent debugging session — Module 7).

## Key takeaways

- Multi-agent = multiple model instances with separate contexts, focused prompts, and scoped tools; subagents (Lesson 5) are the building block.
- Orchestrator–workers dominates: parallel, context-isolated workers for read-heavy research; pipelines for phased work; generator–critic where verification is easier than generation.
- It wins on parallelizable, read-heavy tasks that overflow one context — at a real token premium (Anthropic's research system: ~15× tokens for ~90% quality gain).
- It loses on tightly coupled, write-heavy work: write conflicts, errors compounding across agents, and information loss at handoffs.
- Engineer the seams: complete briefs, structured returns with confidence, least-privilege workers, per-agent traces — and climb the single-call → workflow → agent → multi-agent ladder only on measured evidence.
