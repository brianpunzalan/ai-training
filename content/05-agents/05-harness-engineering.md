# Harness Engineering

> **What you'll learn:** what a harness is and why it — not the model — is where most agent quality comes from; the levers you own (system prompt, tools, context curation, permissions, sandboxing, subagents); and how to think like a harness engineer when the same model performs brilliantly in one product and poorly in another.

## The model is the engine; the harness is the car

Put the same frontier model behind two different products and you'll get wildly different results. The difference is the **harness**: everything wrapped around the model — the system prompt, the tool set, what gets put into and kept out of context, the permission rules, the environment the tools run in, and the orchestration logic. The loop from Lesson 4 is the harness's chassis; this lesson is about everything bolted onto it.

This reframing matters because it relocates your leverage. You can't change the model's weights, but you own every part of the harness — and in practice, harness changes move agent benchmarks as much as model upgrades do. Claude Code is a useful reference example: much of what makes it effective is harness — a carefully engineered system prompt, a small set of sharp tools (read, edit, search, bash), permission modes that gate risky actions, context-management machinery, and subagents — all wrapped around the same model you can call through the raw API.

## Lever 1: the system prompt is the operating manual

An agent's system prompt is Module 2's "prompt as contract" at maximum stakes, because the model consults it on *every* iteration. The sections that earn their tokens:

- **Identity and goal framing** — what the agent is for, and just as important, what's out of scope.
- **Tool guidance** — when to use which tool, beyond what schemas convey ("search before answering questions about the codebase"; "prefer the dedicated file tools over shell commands").
- **Procedural norms** — how to plan, when to ask vs proceed, how to report failure honestly, when to stop.
- **Environment facts** — working directory, platform, dates: things the model can't know and shouldn't guess.

Agent prompts grow by accretion (every incident adds a rule), so refactor periodically and regression-test prompt changes against an eval suite (Module 7) — a rule added for one failure routinely causes another.

## Lever 2: tool design is API design for a model

Lesson 4 of Module 3 covered schemas; harness engineering adds the portfolio view:

- **Few, sharp tools beat many vague ones.** Every tool competes for the model's attention and selection accuracy. Ten well-named tools with crisp when-to-use descriptions outperform forty overlapping ones.
- **Right altitude.** Too low-level (raw SQL executor) forces long error-prone call chains; too high-level (`do_the_task`) hides the steps you wanted visible. Good tools map one model intention to one call.
- **Design the error messages.** The model reads them. `"Error: file not found: src/app.ts — did you mean src/App.tsx?"` converts a dead end into a recovery; a stack trace converts tokens into confusion.
- **Make outputs context-frugal** — return what the model needs, paginate the rest. Every output byte is re-read each iteration (Lesson 4).

## Lever 3: context curation, permissions, sandboxing

**Context curation.** The harness decides what enters the window each iteration: which memory (Lesson 3) is loaded, how tool outputs are truncated, when compaction kicks in, what project documentation gets injected. Curating *out* is as valuable as curating in — Module 2's attention-budget principle, automated.

**Permissions.** Lesson 4's approval gates generalize into permission *systems*: allowlists and denylists per tool, per-action classification (read / reversible write / destructive), and user-selectable modes (ask-every-time → auto-approve-reads → full auto in a sandbox). The principle is least privilege: grant the minimum capability the task needs, expand on demand.

**Sandboxing.** Permissions control what the agent *may* do; sandboxes bound what it *can* do. Containers, ephemeral VMs, network policies, and read-only mounts mean that even a confused or prompt-injected agent (Module 8) has a limited blast radius. Defense in depth: prompt rules are suggestions, permissions are policy, sandboxes are physics.

## Lever 4: subagents — context isolation as a feature

A harness can spawn **subagents**: fresh model instances with their own context window, a narrow task, and often a restricted tool set. The parent gets back only the result — a paragraph, not the forty file reads that produced it. That's the point: subagents turn context pollution into a non-problem ("search the codebase for X" consumes one summary in the parent, not thousands of lines), enable parallelism, and let you scope permissions tightly (a read-only research subagent). The cost is coordination overhead and information loss at the boundary — the subagent knows nothing the parent doesn't pass in. Lesson 7 builds this into full multi-agent architectures.

## Thinking like a harness engineer

When an agent fails, the instinct is "the model isn't smart enough." The harness engineer's checklist runs first: Did the context contain what it needed — and not 50KB of noise? Did a tool description mislead? Did an error message dead-end it? Did the system prompt contradict itself? Is there a missing tool it had to improvise around? In mature agent products, most failures trace to the harness — which is good news, because the harness is the part you can fix this afternoon, and your evals (Module 7) will tell you whether you did.

## Key takeaways

- The harness — system prompt, tools, context curation, permissions, sandboxing, orchestration — is where most agent quality lives, and it's entirely yours to engineer.
- Agent system prompts are per-iteration operating manuals: identity, tool guidance, procedural norms, environment facts; refactor and regression-test them like code.
- Prefer few, sharp, right-altitude tools with designed error messages and context-frugal outputs — the model reads everything you return.
- Layer defenses: prompt rules (suggestions) → permissions (policy) → sandboxes (physics), with least privilege as the default.
- Subagents buy context isolation, parallelism, and scoped permissions at the cost of coordination overhead.
- Debug the harness before blaming the model — that's where most failures, and the fastest fixes, live.
