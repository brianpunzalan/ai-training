# Hands-On Labs

Every lab ships in **two languages** — pick whichever you prefer (or do both):

```
labs/lab-XX-name/
├── INSTRUCTIONS.md      # goal, setup, step-by-step tasks, stretch goals
├── python/
│   ├── starter.py       # scaffolding with TODOs — work here
│   └── solution.py      # reference solution — peek only when stuck
└── typescript/
    ├── starter.ts
    └── solution.ts
```

All labs call models through the shared provider-agnostic client
(`_shared/llm_client.py` / `_shared/llmClient.ts`), so the same code runs against
Anthropic, OpenAI, or any OpenAI-compatible server — including **free local models
via Ollama**.

## 1. Choose a provider

Set environment variables (e.g. in your shell profile or a `.env` you source):

### Option A — Ollama (free, local, no API key)

```bash
# install from https://ollama.com, then:
ollama pull llama3.2            # chat model (small, laptop-friendly)
ollama pull nomic-embed-text    # embedding model (needed for Lab 04)

export LLM_PROVIDER=openai-compatible
export LLM_BASE_URL=http://localhost:11434/v1
export LLM_MODEL=llama3.2
```

### Option B — Anthropic

```bash
export LLM_PROVIDER=anthropic
export LLM_API_KEY=sk-ant-...
export LLM_MODEL=claude-sonnet-4-6
```

### Option C — OpenAI (or any OpenAI-compatible API)

```bash
export LLM_PROVIDER=openai          # or openai-compatible with LLM_BASE_URL
export LLM_API_KEY=sk-...
export LLM_MODEL=gpt-4o-mini
```

> Lab 04 also needs embeddings. With Anthropic as your chat provider, embeddings
> still go through an OpenAI-compatible endpoint — easiest is Ollama's
> `nomic-embed-text` (the default), or set `LLM_EMBED_BASE_URL` + `LLM_EMBED_MODEL`.

## 2. Python setup

Requires Python 3.10+. The only dependency is `requests`:

```bash
cd labs
python3 -m venv .venv && source .venv/bin/activate
pip install requests

# smoke-test your provider config:
python _shared/llm_client.py
```

(Or with [uv](https://docs.astral.sh/uv/): `uv run --with requests python _shared/llm_client.py`)

Run a lab:

```bash
python lab-01-first-api-call/python/starter.py
```

## 3. TypeScript setup

Requires Node 18+ (for global `fetch`). No runtime dependencies — run directly with `tsx`:

```bash
cd labs
npx tsx lab-01-first-api-call/typescript/starter.ts
```

## Lab index

| Lab | Pairs with | You build |
|---|---|---|
| 01 — First API Call & Sampling | Module 1 | A CLI that calls the model, inspects usage/finish reason, and demonstrates temperature empirically |
| 02 — Streaming + Structured Output | Module 3 | Streamed responses and schema-validated JSON extraction with a retry loop |
| 03 — Mini Prompt-Eval Harness | Module 2 | A tiny harness that scores prompt variants against test cases |
| 04 — RAG From Scratch | Module 4 | Chunking → embeddings → cosine retrieval → cited answers, no vector DB |
| 05 — Agent Loop | Module 5 | A tool-calling agent loop with dispatch, termination, and error recovery |
| 06 — Tiny MCP Server | Module 5 | A working Model Context Protocol server exposing tools over stdio |
| 07 — LLM-as-Judge | Module 7 | A rubric-based judge pipeline over a golden set, with agreement checks |
| 08 — Prompt-Injection Guardrail | Module 8 | Layered input/output guards against injection attacks, tested with real payloads |

Work through a lab **after** its paired lesson — the instructions assume the
lesson's concepts. Type the code yourself rather than pasting; the friction is
the learning.
