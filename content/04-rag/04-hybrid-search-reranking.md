# Hybrid Search & Reranking

> **What you'll learn:** why pure vector search misses things keyword search catches (and vice versa), how to fuse the two with reciprocal rank fusion, what cross-encoder rerankers add, and how to assemble retrieve-wide-then-rerank into the standard high-quality retrieval stack.

## Dense retrieval has blind spots

Embeddings (Lesson 3) capture meaning, which is exactly what you want — until the query is `error code 0x80070057` or `SKU-99841-B` or a person's surname. Embedding models compress text into a fixed-size vector; rare identifiers, exact part numbers, version strings, and out-of-vocabulary jargon get blurred in that compression. The chunk containing the exact string may rank *below* chunks that are merely "about errors."

Classic keyword search has the opposite profile. **BM25** — the decades-old ranking function behind traditional search engines — scores chunks by exact term overlap, weighted so that rare terms count more and term-stuffed long documents don't win unfairly. BM25 will nail `0x80070057` every time, but it has no idea that "how do I get my money back" should match a chunk about *refund policy*.

| Query type | Dense (embeddings) | Sparse (BM25) |
|---|---|---|
| Paraphrased natural language | ✅ strong | ❌ weak |
| Exact identifiers, codes, SKUs | ❌ blurry | ✅ exact |
| Synonyms / "money back" → "refund" | ✅ strong | ❌ misses |
| Rare domain jargon, names | ⚠️ depends on training data | ✅ exact |

Production corpora contain both query types, so production retrieval uses both engines. That's **hybrid search**.

## Fusing result lists: reciprocal rank fusion

Dense search returns chunks ranked by cosine similarity; BM25 returns chunks ranked by term score. The scores live on incomparable scales, so you can't just add them. **Reciprocal rank fusion (RRF)** sidesteps the problem by combining *ranks* instead of scores: a document's fused score is the sum over each list of `1 / (k + rank)`, with `k ≈ 60` damping the dominance of top ranks.

```python
def rrf(result_lists: list[list[str]], k: int = 60) -> list[str]:
    """Each result list is doc ids in rank order. Returns fused ranking."""
    scores: dict[str, float] = {}
    for results in result_lists:
        for rank, doc_id in enumerate(results):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
    return sorted(scores, key=scores.get, reverse=True)

fused = rrf([dense_results, bm25_results])
```

```typescript
function rrf(resultLists: string[][], k = 60): string[] {
  const scores = new Map<string, number>();
  for (const results of resultLists) {
    results.forEach((docId, rank) => {
      scores.set(docId, (scores.get(docId) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return [...scores.keys()].sort((a, b) => scores.get(b)! - scores.get(a)!);
}

const fused = rrf([denseResults, bm25Results]);
```

A document that ranks decently in *both* lists beats one that tops a single list — which is usually the behavior you want. RRF needs no tuning, no score normalization, and no training, which is why it's the default fusion method in most vector databases' built-in hybrid search (Weaviate, Qdrant, OpenSearch, pgvector + `tsvector` setups).

## Reranking: spend a model where it counts

Both retrieval stages so far are **bi-encoders**: query and document are embedded *separately*, and similarity is a cheap vector comparison. That independence is what makes searching millions of chunks fast — and it's also the quality ceiling, because the model never sees query and document *together*.

A **cross-encoder reranker** removes that limitation: it takes the (query, chunk) pair as a single input and outputs a relevance score, letting attention compare the actual words of both. It's far too slow to run against the whole corpus — so you don't. The standard architecture is a funnel:

1. **Retrieve wide** — take the top 50–150 candidates from hybrid search (cheap, fast, high recall).
2. **Rerank** — score each candidate with the cross-encoder (Cohere Rerank, Voyage rerank, or open models like BGE-reranker).
3. **Keep the top 5–10** for the prompt.

Reranking typically delivers the single biggest precision jump in the whole pipeline — it routinely rescues the right chunk from position 40 to position 2 — at the cost of one extra network hop (tens to low hundreds of milliseconds). Since fewer, better chunks also mean fewer prompt tokens, the reranker often pays for itself.

A related trick when documents are long: retrieve at the chunk level, but rerank with more surrounding context (the parent section), so the scorer sees enough text to judge relevance properly — the small-to-big idea from Lesson 2 applied at ranking time.

## When to add each stage

Don't build the full stack on day one. Add stages when your retrieval evals (Lesson 6) tell you to:

- **Start**: dense-only retrieval. Simplest, often adequate.
- **Add BM25 + RRF** when failure analysis shows missed exact-match queries — identifiers, codes, names.
- **Add a reranker** when the right chunk is usually *retrieved* but ranks too low to make the prompt — that is, recall@50 is high but precision@5 is poor.

Each addition is motivated by a measured failure mode, not by architecture-diagram envy. The eval set you'll build in Lesson 6 is what makes these decisions data-driven rather than vibes-driven.

## Key takeaways

- Dense retrieval blurs exact identifiers; BM25 misses paraphrase — production corpora contain both query types, so use hybrid search.
- Reciprocal rank fusion combines ranked lists with `1/(k + rank)`, needs no score normalization or tuning, and is the default fusion method in most vector DBs.
- Bi-encoders embed query and document separately (fast, scalable); cross-encoders read them together (accurate, slow) — so retrieve wide with the former and rerank a small candidate set with the latter.
- Retrieve top ~100 → rerank → keep top 5–10 is the standard high-quality stack; reranking is usually the biggest single precision win.
- Add stages in response to measured failures from your retrieval evals (Lesson 6), not preemptively.
