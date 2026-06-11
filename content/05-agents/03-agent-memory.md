# Agent Memory

> **What you'll learn:** the four layers of agent memory — the context window, compaction, external scratchpads, and retrieval-backed long-term memory — and how to engineer each so a long-running agent stays coherent without drowning in its own history.

## The problem: agents generate their own context bloat

Module 1 established that models are stateless; Module 2 taught you to manage context for chat. Agents make the problem an order of magnitude worse, because **an agent's history grows with every loop iteration**: each tool call and each result lands in the message list and gets re-sent on every subsequent call. A coding agent that reads five large files has burned tens of thousands of tokens of context on material it may need for exactly one decision. Left unmanaged, a long task hits one of two walls: the context limit (hard failure) or degraded attention over a bloated middle (soft failure — the "lost in the middle" effect, plus cost scaling linearly with every iteration).

Memory engineering is deciding, layer by layer, **what the model sees on each iteration**.

## Layer 1: short-term memory — the context window itself

The context window is the agent's working memory: system prompt, task, conversation, tool results. It is the only memory the model *actually attends to* — every other layer works by deciding what gets loaded into it.

Two cheap wins before anything fancier:

- **Trim tool results at the source.** Return the 20 matching lines, not the whole file; the first 50 rows, not the table. Tool output design is memory design (more in Lesson 5).
- **Prune dead weight.** Old tool results from completed subtasks can often be replaced in-place with a stub like `[output elided — file was read and summarized above]`. Several 2025-era APIs automate exactly this (e.g. clearing stale tool results server-side).

## Layer 2: compaction — summarize and continue

When the window approaches its limit mid-task, **compaction** replaces the older history with a model-written summary and continues with the summary plus recent turns:

```python
def maybe_compact(messages, client, threshold=150_000):
    if count_tokens(messages) < threshold:
        return messages
    summary = client.messages.create(
        model="claude-sonnet-4-6", max_tokens=2000,
        system="Summarize this agent transcript: state the original task, "
               "decisions made, files/resources touched, current plan, and "
               "unresolved issues. Be specific — this replaces the history.",
        messages=messages[:-6],
    ).content[0].text
    return [{"role": "user", "content": f"[Compacted history]\n{summary}"}] + messages[-6:]
```

```typescript
async function maybeCompact(messages: Message[], client: Anthropic, threshold = 150_000) {
  if (countTokens(messages) < threshold) return messages;
  const res = await client.messages.create({
    model: "claude-sonnet-4-6", max_tokens: 2000,
    system: "Summarize this agent transcript: state the original task, " +
            "decisions made, files/resources touched, current plan, and " +
            "unresolved issues. Be specific — this replaces the history.",
    messages: messages.slice(0, -6),
  });
  const summary = res.content[0].type === "text" ? res.content[0].text : "";
  return [{ role: "user" as const, content: `[Compacted history]\n${summary}` }, ...messages.slice(-6)];
}
```

Compaction is lossy by design — the engineering is in the summary prompt. Generic summaries lose the details that matter (exact file paths, error messages, the user's stated constraints); a good compaction prompt enumerates the categories that must survive. This is what Claude Code's auto-compact does when a session nears the limit. One caution: compaction interacts badly with prompt caching (Module 8) — rewriting the prefix invalidates the cache, so compact in scheduled chunks rather than continuously.

## Layer 3: external memory — files and scratchpads

A more robust pattern: give the agent a place to write notes **outside the context window** and tools to read them back. A `NOTES.md` or task plan file becomes a scratchpad the agent maintains deliberately:

- The agent records decisions, progress, and discovered constraints as it works.
- After compaction — or in a fresh session entirely — it re-reads the file and resumes.
- Humans can read (and edit) the file, which doubles as a transparency and steering mechanism.

This is **memory as tool use**: instead of you deciding what to preserve, the model decides, with durable storage as backstop. Persistent instruction files like `CLAUDE.md` are the same idea at project scope — curated, durable context loaded at session start. The failure mode is neglect: agents don't reliably maintain notes unless the system prompt explicitly instructs *when* to write (after each completed step, before risky operations) and the loop occasionally reminds them.

## Layer 4: long-term memory — retrieval-backed

For memory across sessions, users, and months, store memories externally and **retrieve** relevant ones into context at the right moment — the RAG machinery from Module 4 pointed at the agent's own history: embed memory entries (preferences, resolved issues, learned facts), retrieve top-k by similarity to the current task, inject into the prompt. Reflexion-style lesson banks (Lesson 2) are a special case: failure lessons retrieved at the start of retry attempts.

Long-term memory adds real product risk: **stale or wrong memories are self-reinforcing** (the agent trusts its own notes), and cross-user contamination is a security bug (Module 8). Production systems version memories, decay or expire them, and let users inspect and delete what's stored.

## Choosing layers

| Layer | Persistence | Cost | Use when |
|---|---|---|---|
| Context window | One task | Re-sent every call | Always — it's the only memory the model sees |
| Compaction | One long task | One summary call per compaction | Task outgrows the window |
| Memory files | Sessions on one project | Cheap (file I/O + tokens read back) | Multi-hour/multi-session work; human steering |
| Retrieval-backed | Indefinite | Embedding + vector store + retrieval | Cross-session personalization, learned lessons |

Start at the top; add layers only when the task duration demands them.

## Key takeaways

- Agent memory is deciding **what the model sees each iteration** — the context window is the only memory it actually attends to.
- Trim tool outputs at the source and prune stale results before reaching for heavier machinery.
- **Compaction** trades fidelity for headroom; the summary prompt determines what survives, and rewrites invalidate prompt caches.
- **External memory files** let the agent (and humans) persist state across compactions and sessions — but require explicit instructions about when to write.
- **Retrieval-backed memory** extends across sessions using Module 4's RAG machinery; treat stored memories as data needing versioning, expiry, and user control.
