# Tracing & Observability

> **What you'll learn:** what to capture from every LLM interaction (and why "we log errors" isn't close to enough), how traces and spans structure multi-step systems like RAG and agents, the tooling landscape, and how sampled trace review feeds the eval loop from Lessons 1–2.

## You can't improve what you can't replay

Traditional observability asks "is the service up, is it fast, is it erroring?" LLM observability has to answer a harder question: **"why did the system say *that*?"** An LLM app can be up, fast, and error-free while confidently telling a customer the wrong refund policy. The unit of debugging isn't a stack trace — it's the *full interaction*: what went into the model, what came out, and every step in between.

So the foundational rule: **capture everything needed to replay any production interaction.** Per LLM call, that means:

- the exact rendered prompt (system + messages — not the template, the *rendered* text) and the prompt/model versions that produced it (Module 2's versioning discipline cashing out)
- all parameters: model id, temperature, max_tokens, tool definitions
- the complete response, including tool calls and stop_reason
- token usage (input, output, cached — Module 8's cost work depends on this), latency (TTFT and total), and any error/retry chain
- identifiers: request id, conversation id, user/tenant, timestamp

Privacy isn't optional here: prompts and outputs contain user data, so traces inherit your data-retention rules — redact PII where you can, restrict access, and set retention windows (Module 8).

## Traces and spans: structuring multi-step systems

A single completion is one record. But a RAG query (Module 4) is *five* steps — rewrite, embed, retrieve, rerank, generate — and an agent run (Module 5) is a tree of iterations, tool calls, and maybe subagents. The structure that fits is the **trace/span** model from distributed tracing: one **trace** per user request; nested, timed **spans** per operation.

```
trace: support-question #8842 (4.1s, $0.0049)
├── span: query-rewrite        (llm, 180ms, 210 tok)
├── span: retrieve             (vector-db, 45ms, 12 chunks)
├── span: rerank               (cross-encoder, 110ms, 12→5)
└── span: generate             (llm, 3.7s, 4,820 in / 310 out)
```

This structure is what makes the localization questions from this course answerable in production: *did retrieval fetch the wrong chunks, or did generation botch good ones?* (Lesson 6, Module 4) — one glance at the trace. *Which tool call sent the agent down the rabbit hole?* — walk the tree. Capture span attributes liberally: retrieved chunk ids and scores, reranker decisions, tool inputs/outputs, iteration counts.

Instrumentation is converging on **OpenTelemetry GenAI semantic conventions** — standard attribute names for model, tokens, etc. — which the LLM-native tools speak: **Langfuse** (open-source, self-hostable), **LangSmith**, and **Arize Phoenix** (open-source) all give you trace trees, cost rollups, and eval hooks; if your org already runs OTel infrastructure, LLM spans can flow into it alongside everything else.

```python
from langfuse import observe, get_client

@observe()  # creates a span; nests automatically under the active trace
def retrieve(query: str) -> list[Chunk]:
    chunks = vector_store.search(embed(query), top_k=12)
    get_client().update_current_span(metadata={
        "chunk_ids": [c.id for c in chunks],
        "top_score": chunks[0].score,
    })
    return chunks
```

```typescript
import { startActiveObservation } from "@langfuse/tracing";

async function retrieve(query: string): Promise<Chunk[]> {
  return startActiveObservation("retrieve", async (span) => {
    const chunks = await vectorStore.search(await embed(query), { topK: 12 });
    span.update({ metadata: { chunkIds: chunks.map((c) => c.id), topScore: chunks[0].score } });
    return chunks;
  });
}
```

## From logging to observability: metrics and review

Raw traces become observability when aggregated and *looked at*:

**Dashboards** — cost per request/feature/tenant, p50/p95 TTFT and total latency, token usage trends, error and retry rates, cache hit rates (Module 8), and quality proxies: user thumbs-down rate, "couldn't find" rate (Module 4), agent iteration counts creeping up.

**Online evals** — the checks from Lessons 3–4 don't only run offline. Cheap programmatic checks can run on *every* production response (schema valid? citation present?), and an LLM judge on a sampled percentage — surfacing quality regressions in hours instead of waiting for user complaints. Alert on rates, not single failures.

**Sampled human review** — the highest-leverage habit in this lesson: a recurring session (weekly, or daily early on) where someone reads a sample of traces — random ones, plus every thumbs-down, plus outliers (slowest, most expensive, most iterations). This is Lesson 1's "look at your data" institutionalized, and it closes the flywheel: reviewed failures become golden-set cases (Lesson 2), new programmatic checks (Lesson 3), or judge criteria (Lesson 4). Without review, traces are just expensive storage.

## Key takeaways

- LLM observability must answer "why did it say that?" — capture enough to replay any interaction: rendered prompts, versions, params, full responses, tokens, latency, identifiers.
- Use traces and spans: one trace per request, one span per step (rewrite, retrieve, rerank, generate, each tool call), with rich attributes — that's what localizes failures in RAG pipelines and agent trees.
- Adopt an LLM-native tool (Langfuse, LangSmith, Phoenix) and the OpenTelemetry GenAI conventions rather than reinventing trace storage.
- Run cheap checks online on everything, judges on a sample, and alert on rates — catch regressions before users report them.
- Institutionalize sampled trace review: it's how production reality flows back into golden sets, checks, and rubrics. Traces nobody reads are storage costs, not observability.
