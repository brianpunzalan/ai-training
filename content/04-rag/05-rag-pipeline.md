# Building a RAG Pipeline End-to-End

> **What you'll learn:** how the pieces from this module assemble into a working system — ingestion, retrieval, and generation — plus the prompt patterns that make answers grounded and cited, and the operational details that separate a demo from a dependable pipeline.

## Two pipelines, not one

Every RAG system is really two pipelines with a shared index between them:

```
INGESTION (offline):   documents → clean → chunk → embed → index (+ metadata)
QUERY (online):        question → embed → retrieve → rerank → assemble prompt → generate → cite
```

They run on different schedules (ingestion on document change, query per request), fail in different ways, and are tuned with different evals. Keeping them mentally separate prevents the classic mistake of debugging generation when the real failure happened at ingestion time.

## Ingestion: where quality is determined

1. **Load & clean.** Parse PDFs/HTML/Markdown into text, preserving structure (headings, tables). Strip boilerplate — navigation bars and page footers embedded into chunks become noise retrieved forever.
2. **Chunk** with the strategy you chose in Lesson 2 — structure-aware where documents have headings, recursive splitting otherwise, with contextual headers (document title + heading path) prepended to every chunk.
3. **Embed** every chunk with one model, and record that model's name in the index — re-embedding day will come (Lesson 3).
4. **Index** vectors plus metadata: source document id, URL, heading path, timestamps, access-control tags. Metadata powers filtering, citations, and re-ingestion.

Make ingestion **idempotent and incremental**: hash each source document, re-process only changed ones, and delete stale chunks when a document is removed. Stale chunks are a uniquely embarrassing failure mode — the model will confidently cite a policy you retired last quarter.

## Query: retrieve, then write a grounded prompt

The retrieval side applies Lessons 3–4: embed the query, run hybrid search, rerank, keep the top 5–10. What remains is prompt assembly — and this is where RAG quality is won or lost *after* retrieval. The pattern:

```python
def build_prompt(question: str, chunks: list[dict]) -> tuple[str, str]:
    context = "\n\n".join(
        f'<source id="{i + 1}" title="{c["title"]}">\n{c["text"]}\n</source>'
        for i, c in enumerate(chunks)
    )
    system = (
        "Answer using ONLY the provided sources. Cite the source id for every "
        "claim, like [1]. If the sources do not contain the answer, say "
        "\"I couldn't find this in the documentation\" — do not guess."
    )
    user = f"<sources>\n{context}\n</sources>\n\nQuestion: {question}"
    return system, user
```

```typescript
function buildPrompt(question: string, chunks: Chunk[]): { system: string; user: string } {
  const context = chunks
    .map((c, i) => `<source id="${i + 1}" title="${c.title}">\n${c.text}\n</source>`)
    .join("\n\n");
  const system =
    'Answer using ONLY the provided sources. Cite the source id for every ' +
    'claim, like [1]. If the sources do not contain the answer, say ' +
    '"I couldn\'t find this in the documentation" — do not guess.';
  const user = `<sources>\n${context}\n</sources>\n\nQuestion: ${question}`;
  return { system, user };
}
```

The three load-bearing elements:

- **Delimited, labeled sources.** Tagged blocks with ids make citation mechanical and make it unambiguous where data ends and the question begins (this separation also matters for injection defense — Module 8).
- **A grounding instruction with an escape hatch.** "Answer only from sources; if absent, say so" is the single highest-leverage line in the prompt. Without the escape hatch (Module 2), the model fills retrieval gaps from its weights — the exact hallucination RAG exists to prevent.
- **Citations by source id.** Cheap to request, easy to render as links, and they make faithfulness auditable: a claim with no citation is a claim to investigate.

Don't be stingy at this stage: retrieval should be precise, but once you *have* good chunks, including 5–10 of them costs little and protects against the right answer being in chunk #4 (the long-context budget thinking from Lesson 1 applies).

## Failure handling and operational details

A production pipeline needs answers for the unhappy paths:

| Failure | Policy |
|---|---|
| Retrieval returns nothing relevant (all scores low) | Say "not found" — *skip generation entirely* rather than prompting with junk |
| Question is conversational follow-up ("what about for teams?") | Rewrite the query with chat history before embedding (query rewriting) |
| Sources conflict | Instruct the model to surface the conflict and prefer the most recent source (metadata!) |
| Index temporarily down | Fail explicitly; never silently fall back to ungrounded generation |

Also log everything per request — query, rewritten query, retrieved chunk ids and scores, final prompt, answer. This trace is what makes Lesson 6's evaluation and Module 7's observability possible; without it, "why did it answer that?" is unanswerable.

Latency budget: embedding the query (~50ms) + vector search (~10–50ms) + rerank (~100ms) typically lands well under half a second before generation. If your pipeline is slow, the culprit is almost always generation, which streaming (Module 3) makes feel fast.

## Key takeaways

- RAG is two pipelines — offline ingestion and online query — sharing an index; debug them separately.
- Ingestion determines quality: clean text, structure-aware chunks with contextual headers, recorded embedding model, rich metadata, idempotent incremental updates.
- Prompt assembly is the second half of RAG quality: delimited labeled sources, a grounding instruction with an explicit "not found" escape hatch, and per-claim citations.
- Handle unhappy paths deliberately: low-score retrievals skip generation, follow-up questions get query rewriting, conflicts surface to the user.
- Log the full trace (query → chunks → prompt → answer) on every request — evaluation and debugging depend on it.

## Lab

Put this into practice in **Lab 04 — RAG From Scratch** (find it in the Labs section of the site): you'll build the full pipeline — chunking, embedding, cosine-similarity retrieval, and grounded, cited generation — in plain Python or TypeScript with no framework, so every moving part is yours.
