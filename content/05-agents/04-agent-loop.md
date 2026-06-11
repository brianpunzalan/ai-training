# Building an Agent Loop

> **What you'll learn:** the canonical while-loop at the heart of every agent, how tool results flow back into the conversation, the stop conditions and safety rails a production loop needs, and the error-handling patterns that keep an autonomous loop from going off the rails.

## The loop is smaller than you think

Strip away the frameworks and every agent is the same dozen lines: call the model with tools, execute whatever tools it requests, append the results, repeat until it stops requesting tools. Module 3's tool-calling round trip, wrapped in a `while`:

```python
import anthropic

client = anthropic.Anthropic()

def run_agent(task: str, tools: list, execute, max_iterations: int = 15) -> str:
    messages = [{"role": "user", "content": task}]
    for _ in range(max_iterations):
        response = client.messages.create(
            model="claude-sonnet-4-6", max_tokens=4096,
            system=SYSTEM_PROMPT, tools=tools, messages=messages,
        )
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason != "tool_use":
            return next(b.text for b in response.content if b.type == "text")

        results = []
        for block in response.content:
            if block.type == "tool_use":
                try:
                    output = execute(block.name, block.input)
                    results.append({"type": "tool_result", "tool_use_id": block.id,
                                    "content": str(output)})
                except Exception as e:
                    results.append({"type": "tool_result", "tool_use_id": block.id,
                                    "content": f"Error: {e}", "is_error": True})
        messages.append({"role": "user", "content": results})
    return "Stopped: hit max iterations."
```

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

async function runAgent(task: string, tools: Anthropic.Tool[],
                        execute: (name: string, input: unknown) => Promise<string>,
                        maxIterations = 15): Promise<string> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: task }];
  for (let i = 0; i < maxIterations; i++) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6", max_tokens: 4096,
      system: SYSTEM_PROMPT, tools, messages,
    });
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const text = response.content.find((b) => b.type === "text");
      return text?.type === "text" ? text.text : "";
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type === "tool_use") {
        try {
          results.push({ type: "tool_result", tool_use_id: block.id,
                         content: await execute(block.name, block.input) });
        } catch (e) {
          results.push({ type: "tool_result", tool_use_id: block.id,
                         content: `Error: ${e}`, is_error: true });
        }
      }
    }
    messages.push({ role: "user", content: results });
  }
  return "Stopped: hit max iterations.";
}
```

Everything else — planning (Lesson 2), memory (Lesson 3), the harness (Lesson 5) — is refinement *around* this loop. Notice the load-bearing details:

- **`stop_reason` drives control flow.** `tool_use` means keep going; `end_turn` means the model considers the task done — that's your natural exit.
- **Tool results go back as a `user` message** containing `tool_result` blocks matched by `tool_use_id`. The transcript alternates assistant (calls) / user (results), and the model re-reads the whole thing every iteration — agents are the reason context management (Lesson 3, Module 2) matters so much.
- **Errors are returned, not raised.** An exception in a tool becomes an `is_error` tool result, and the model gets a chance to recover — retry differently, try another tool, or report the blocker. This single pattern accounts for a surprising share of agent robustness.

## Stop conditions: never trust the loop to end itself

A loop whose only exit is "the model decides it's done" will eventually spin — re-reading the same file, retrying the same failing call, burning tokens. Production loops layer **multiple independent stops**:

| Stop | Protects against |
|---|---|
| `stop_reason == "end_turn"` | the normal, happy exit |
| `max_iterations` | infinite loops, rabbit holes |
| Token/cost budget for the whole run | expensive runaways |
| Wall-clock timeout | hung tools, slow spirals |
| No-progress detection (same tool + same args repeated) | tight retry loops |

Hitting a guard shouldn't vaporize the work: return the transcript and a partial-result summary, so a human (or supervising workflow) can decide what's next.

## Human-in-the-loop: gates for consequential actions

Inside the loop, tool calls are where the agent touches the world — so the loop is where approval gates live. Classify tools by blast radius: reads (search, fetch, list) auto-execute; writes that are reversible (create file, draft email) execute with logging; destructive or outward-facing actions (delete, send, deploy, pay) **pause the loop and ask**. Because the loop is just code, a gate is just an `if` before `execute()` — the model proposes, your harness disposes. This maps directly to the permission modes you've seen in tools like Claude Code, and Lesson 5 develops it further.

## Practical refinements

Two refinements show up in almost every real loop. **Parallel tool calls** (Module 3): when one assistant turn contains several independent `tool_use` blocks, execute them concurrently and return all results in one message — agents that research (multiple searches, multiple file reads) get dramatically faster. **Tool-output hygiene** (Lesson 3): truncate or summarize huge tool outputs *before* appending them, because everything you append is re-read — and re-paid for — on every subsequent iteration. A 50KB JSON blob from one careless API call taxes every remaining step of the run; prompt caching (Module 8) softens but doesn't remove this.

## Key takeaways

- An agent loop is: call with tools → if `tool_use`, execute and append `tool_result` blocks → repeat until `end_turn`. Everything else is refinement around this.
- Return tool errors as `is_error` results instead of raising — letting the model recover is the cheapest robustness win in agent engineering.
- Layer independent stop conditions: max iterations, cost budget, timeout, and no-progress detection — never rely on the model alone to terminate.
- Gate consequential tool calls on human approval by blast radius: reads auto-run, reversible writes log, destructive actions pause and ask.
- Execute parallel tool calls concurrently, and trim tool outputs before appending — every appended token is re-read on every later iteration.

## Lab

Put this into practice in **Lab 05 — Agent Loop with Tool Calling** (find it in the Labs section of the site): you'll build this exact loop in Python or TypeScript, give it a small toolbox, watch the transcript grow turn by turn, and add max-iteration and approval guards yourself.
