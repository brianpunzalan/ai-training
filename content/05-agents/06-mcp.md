# MCP: The Model Context Protocol

> **What you'll learn:** the integration problem MCP solves, the client–server architecture and its three primitives (tools, resources, prompts), how transports work (stdio vs HTTP), and when to build or adopt an MCP server instead of wiring custom tools.

## The N×M problem

Before MCP, every AI application integrated every data source bespoke: your agent needed custom code for GitHub, again for Slack, again for Postgres — and the team building another agent rewrote all of it against their own tool interface. N applications × M integrations, every cell hand-built.

The **Model Context Protocol** (open-sourced by Anthropic in late 2024, since adopted across the industry) collapses the grid the way LSP did for editors and language tooling: a standard protocol between **MCP clients** (AI applications: Claude Code, Claude Desktop, IDEs, your agent) and **MCP servers** (integrations: GitHub, filesystem, Postgres, your internal APIs). Implement a server once, and every MCP-capable client can use it; build a client once, and it can attach to thousands of existing servers. N + M instead of N × M.

## Architecture and primitives

An MCP server is a small program that advertises capabilities over a JSON-RPC protocol. Three primitives matter:

| Primitive | What it is | Controlled by | Example |
|---|---|---|---|
| **Tools** | Functions the model can call (schema + handler) | the model | `create_issue`, `query_database` |
| **Resources** | Data the application can load into context | the application | a file's contents, a DB schema |
| **Prompts** | Reusable prompt templates the user can invoke | the user | "summarize this week's PRs" |

Tools are the workhorse — they're exactly Module 3's tool calling, standardized. The flow: at startup the client connects and calls `tools/list`; the server returns names, descriptions, and JSON Schemas; the client merges them into the model's tool list. When the model emits a tool call, the client routes it via `tools/call` to the server, which executes and returns the result — landing back in the agent loop (Lesson 4) as a `tool_result`. The model neither knows nor cares that a tool lives in an MCP server: from its side, MCP is invisible plumbing.

**Transports:** a local server runs as a child process speaking JSON-RPC over **stdio** — zero network setup, credentials stay on your machine; a remote server speaks **HTTP** (streamable HTTP, with OAuth for auth) — one shared deployment serving many users.

## Building a server

The SDKs reduce a server to decorated functions:

```python
# server.py — run with: uv run server.py
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("notes")

NOTES: dict[str, str] = {}

@mcp.tool()
def save_note(title: str, content: str) -> str:
    """Save a note under a title, overwriting any existing note."""
    NOTES[title] = content
    return f"Saved '{title}'."

@mcp.tool()
def search_notes(query: str) -> str:
    """Search saved notes; returns matching titles and excerpts."""
    hits = [f"{t}: {c[:80]}" for t, c in NOTES.items() if query.lower() in (t + c).lower()]
    return "\n".join(hits) or "No matches."

if __name__ == "__main__":
    mcp.run(transport="stdio")
```

```typescript
// server.ts — run with: npx tsx server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "notes", version: "1.0.0" });
const notes = new Map<string, string>();

server.tool("save_note", "Save a note under a title, overwriting any existing note.",
  { title: z.string(), content: z.string() },
  async ({ title, content }) => {
    notes.set(title, content);
    return { content: [{ type: "text", text: `Saved '${title}'.` }] };
  });

server.tool("search_notes", "Search saved notes; returns matching titles and excerpts.",
  { query: z.string() },
  async ({ query }) => {
    const hits = [...notes].filter(([t, c]) => (t + c).toLowerCase().includes(query.toLowerCase()))
      .map(([t, c]) => `${t}: ${c.slice(0, 80)}`);
    return { content: [{ type: "text", text: hits.join("\n") || "No matches." }] };
  });

await server.connect(new StdioServerTransport());
```

Note what carries over unchanged from this module: descriptions are prompts (Module 3), outputs should be context-frugal, and error messages should help the model recover (Lesson 5). MCP standardizes the *plumbing*; tool design quality is still on you.

## Adopting MCP wisely

**When MCP earns its keep:** an integration shared across multiple AI applications; using the large ecosystem of existing servers instead of rebuilding GitHub/Slack/DB integrations; exposing your product's capabilities so customers' agents can use them. **When plain tools are fine:** a handful of functions used by one application you control end-to-end — a protocol layer adds moving parts without payoff.

Two cautions. First, **context cost**: every connected server's tool schemas enter the model's context, and attaching five servers with twenty tools each bloats prompts and degrades tool selection (Lesson 5's "few, sharp tools" principle — connect what the task needs, not everything you have). Second, **trust**: an MCP server is code running with real credentials, and its tool results are untrusted input entering your context — a malicious or compromised server is a prompt-injection vector (Module 8). Vet servers like any dependency, scope their tokens to least privilege, and keep approval gates (Lesson 4) on consequential actions regardless of which server requests them.

## Key takeaways

- MCP turns N×M bespoke integrations into N+M: servers expose capabilities once, any MCP client can use them.
- Three primitives: tools (model-controlled), resources (application-controlled), prompts (user-controlled) — tools are Module 3's tool calling, standardized.
- stdio transport for local child-process servers; streamable HTTP (+ OAuth) for shared remote ones. The model itself never sees MCP — it's harness plumbing.
- SDKs make a server a few decorated functions, but tool-design discipline (descriptions, frugal outputs, helpful errors) still determines quality.
- Connect servers selectively (schemas cost context) and treat them as trusted code with untrusted outputs: least-privilege credentials, vetting, and approval gates.

## Lab

Put this into practice in **Lab 06 — Build a Tiny MCP Server** (find it in the Labs section of the site): you'll implement a small stdio server in Python or TypeScript, wire it into an MCP client, and watch your tools appear in a real agent's toolbox.
