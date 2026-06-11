# What Is an Agent?

> **What you'll learn:** a precise working definition of an AI agent — model + tools + loop + state — how agents differ from workflows, the five workflow patterns worth knowing by name, and how to decide which architecture a problem actually needs.

## A definition you can build from

The word "agent" gets attached to everything from a chatbot with one function to a fleet of autonomous coding systems. Here is the definition this course uses, because it maps directly to code you will write in Lesson 4:

> An **agent** is an LLM that runs in a **loop**, choosing which **tools** to call and reading their results, accumulating **state** in its context, until it decides the task is done.

Four components, all load-bearing:

| Component | What it is | Where it lives |
|---|---|---|
| **Model** | The LLM making decisions each iteration | The API call |
| **Tools** | Actions the model can take: search, run code, edit files, query APIs | Tool definitions (Module 3, Lesson 4) |
| **Loop** | Code that executes tool calls and feeds results back until a stop condition | Your `while` loop |
| **State** | Everything accumulated so far: conversation history, tool results, scratch notes | The context window + external files |

The defining property is that **the model directs its own control flow**. You don't tell it "search, then read, then summarize" — you give it a goal and tools, and *it* decides the sequence, including reacting to surprises: a failed command, an empty search result, a file that doesn't exist.

## Workflows vs agents

Anthropic's influential *Building Effective Agents* essay draws the line that matters in practice: most production "agentic" systems are actually **workflows** — LLM calls orchestrated through **code paths you predefined**. Agents are the special case where the model dynamically chooses its own path.

The five workflow patterns to know by name:

| Pattern | Shape | Example |
|---|---|---|
| **Prompt chaining** | Output of call A feeds call B, fixed sequence | Draft → critique → revise pipeline |
| **Routing** | A classifier call picks which downstream prompt/model handles the input | Support tickets → billing / technical / refund handlers |
| **Parallelization** | Run independent calls concurrently; aggregate (sectioning) or vote (sampling) | Score a document on five rubric axes at once |
| **Orchestrator-workers** | One LLM decomposes the task and dispatches dynamic subtasks to worker calls | Lead model assigns research questions to workers (Lesson 7) |
| **Evaluator-optimizer** | A generator call loops with an evaluator call until quality passes | Translation refined until a judge approves |

A workflow's control flow is auditable, testable, and cheap to reason about. An agent's control flow is decided at runtime by a probabilistic model. That trade is the whole decision:

```python
# Workflow: YOU own the control flow
outline = llm("Outline a post about " + topic)
draft = llm("Write the post following this outline:\n" + outline)
final = llm("Tighten this draft:\n" + draft)

# Agent: the MODEL owns the control flow
agent = Agent(tools=[search, read_file, write_file])
result = agent.run("Research " + topic + " and write a post in posts/")
```

```typescript
// Workflow: YOU own the control flow
const outline = await llm(`Outline a post about ${topic}`);
const draft = await llm(`Write the post following this outline:\n${outline}`);
const final = await llm(`Tighten this draft:\n${draft}`);

// Agent: the MODEL owns the control flow
const agent = new Agent({ tools: [search, readFile, writeFile] });
const result = await agent.run(`Research ${topic} and write a post in posts/`);
```

## When do you actually need an agent?

Use the simplest thing that works — this is the most repeated and most ignored advice in the field.

**Workflows win when** the task decomposes into known steps. Ticket triage, document pipelines, structured extraction: if you can draw the flowchart, write the flowchart. You get predictable latency, predictable cost, and unit-testable stages.

**Agents win when** the path is unknowable in advance: the number of steps depends on what the agent discovers along the way. Debugging a failing test suite, multi-hop research, "make this deprecation warning go away" — you can't enumerate the branches, so you delegate the branching to the model.

**The costs of agency** are real and compound:

- **Error compounding** — a 95%-reliable step run 10 dependent times succeeds ~60% of the time. Agents take many steps.
- **Cost and latency** — every loop iteration re-sends the growing context (the stateless-API fact from Module 1 never stops mattering).
- **Auditability** — a flowchart you wrote is easier to debug than a trajectory the model improvised. Tracing and evals (Module 7) become mandatory, not optional.
- **Blast radius** — an agent with write-access tools can do damage; guardrails and sandboxing (Module 8, and Lesson 5 here) are part of the design, not an afterthought.

By 2026 the capability frontier has shifted this calculus: models reliably sustain much longer tool-use trajectories than they could in 2023–24, which is why agentic coding tools (Claude Code, Cursor, and their peers) work at all. But the engineering discipline is unchanged — agency is a budget you spend only where the task demands it.

## The spectrum, not the binary

In practice you'll build hybrids: a workflow whose middle stage is a bounded agent; an agent that calls a fixed prompt-chain as one of its tools; a router that escalates hard cases to an agentic path. The rest of this module gives you the pieces: planning patterns (Lesson 2), memory (Lesson 3), the loop itself (Lesson 4), the harness around it (Lesson 5), MCP for standardized tool access (Lesson 6), and multi-agent architectures (Lesson 7).

## Key takeaways

- An agent = **model + tools + loop + state**, with the model directing its own control flow toward a goal.
- Most production systems are **workflows** — predefined code paths over LLM calls: prompt chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer.
- Choose agents only when the step sequence is unknowable in advance; otherwise the flowchart you can draw is the flowchart you should code.
- Agency costs you: compounding errors over many steps, growing per-iteration context cost, harder debugging, larger blast radius.
- Hybrids are normal — bounded agents inside workflows, workflows as tools inside agents.
