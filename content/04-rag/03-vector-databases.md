# Embeddings & Vector Databases

> **What you'll learn:** how similarity search actually works — cosine similarity, ANN indexes like HNSW — what a vector database adds over a bare index, when pgvector beats a dedicated vector DB, and why metadata filtering is a first-class requirement.

## From embeddings to search

Module 1, Lesson 3 introduced embeddings: vectors where semantic similarity becomes geometric closeness. RAG operationalizes that. At ingest, you embed every chunk and store the vectors. At query time, you embed the question with the **same model** and find the nearest stored vectors.

The standard similarity measure is **cosine similarity** — the angle between vectors, ignoring length:

```python
import numpy as np

def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

def top_k(query_vec, chunk_vecs, k=5):
    scores = [(i, cosine_similarity(query_vec, v)) for i, v in enumerate(chunk_vecs)]
    return sorted(scores, key=lambda s: s[1], reverse=True)[:k]
```

```typescript
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function topK(queryVec: number[], chunkVecs: number[][], k = 5) {
  return chunkVecs
    .map((v, i) => ({ index: i, score: cosineSimilarity(queryVec, v) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
```

Most embedding models output **normalized** (unit-length) vectors, so cosine similarity reduces to a plain dot product — one multiply-accumulate pass. Remember the operational rule from Module 1: vectors from different embedding models (or versions) are incompatible. Store the model name alongside your vectors; switching models means re-embedding everything.

## Why brute force stops working — and ANN indexes

The loop above is **exact** search: compare the query to every vector. At 10k chunks that's instant; at 50 million it's not. The fix is **approximate nearest neighbor (ANN)** indexes, which trade a sliver of recall for orders-of-magnitude speed.

The dominant ANN structure is **HNSW** (Hierarchical Navigable Small World) — a layered graph. Each vector is a node connected to its near neighbors; upper layers are sparse "highways," lower layers dense "local streets." A search enters at the top, greedily hops toward the query, and descends layer by layer, examining perhaps a few thousand of 50 million vectors. Typical recall: 95–99% of what exact search would return, in single-digit milliseconds.

Tuning knobs you'll actually encounter:

| Parameter | Controls | Trade-off |
|---|---|---|
| `M` | Edges per node | Recall & memory vs index size |
| `ef_construction` | Build-time search width | Index quality vs build time |
| `ef_search` | Query-time search width | Recall vs query latency |

The practical takeaway: **ANN search can simply miss the right chunk.** When you debug "RAG didn't find an obviously relevant document," candidate causes are chunking, the embedding model, *and* ANN recall — raise `ef_search` before blaming the model.

## What a vector database adds

An ANN index is a data structure; a **vector database** wraps it with what production needs: persistence, CRUD (deleting a document must delete its vectors), metadata storage and filtering, horizontal scaling, and access control.

The 2026 landscape, roughly:

| Option | Examples | Sweet spot |
|---|---|---|
| **Postgres extension** | pgvector (+ pgvectorscale) | You already run Postgres; up to tens of millions of vectors |
| **Dedicated vector DB** | Qdrant, Weaviate, Milvus, Pinecone | Hundreds of millions+ vectors, vector-search-heavy workloads |
| **Embedded / library** | FAISS, LanceDB, sqlite-vec, Chroma | Prototypes, single-node apps, labs (including Lab 04) |
| **Search engine with vectors** | Elasticsearch/OpenSearch | You already run it for keyword search; want hybrid in one system |

**Default advice: start with pgvector.** Most teams already operate Postgres, and keeping vectors next to your relational data means joins, transactions, and one less system to run — vectors and the rows they describe can't drift apart. pgvector supports HNSW and handles the small-to-mid scale where most products live. Reach for a dedicated vector DB when you have genuine scale (100M+ vectors), need advanced quantization/multi-tenancy features, or vector search *is* the product.

## Metadata filtering: not optional

Real queries are almost never "nearest vectors, period." They're "nearest vectors **where** `tenant_id = 'acme'` **and** `doc_type = 'policy'` **and** `updated_at > 2025-01-01`." Per-tenant filtering in particular is a security boundary: retrieving another customer's documents into a prompt is a data leak.

```python
results = collection.query(
    query_embeddings=[query_vec],
    n_results=10,
    where={"tenant_id": "acme", "doc_type": "policy"},  # filter + ANN together
)
```

```typescript
const results = await collection.query({
  queryEmbeddings: [queryVec],
  nResults: 10,
  where: { tenant_id: "acme", doc_type: "policy" }, // filter + ANN together
});
```

How the filter executes matters. **Post-filtering** (search first, filter after) can return fewer than k results — or zero — when the filter is selective, because all the nearest neighbors get filtered out. Good engines do **filtered ANN** (apply the predicate during graph traversal) or pre-filter when the predicate is highly selective. When you evaluate a vector store, "how does it handle filtered search?" is one of the first questions to ask — it's also where pgvector's ability to lean on ordinary B-tree indexes and SQL `WHERE` clauses shines.

Finally, store enough metadata per chunk to be useful downstream: source document ID, title, heading path, URL, and timestamps. Lesson 5's pipeline uses these for citations; Lesson 6's evals use them to score retrieval.

## Key takeaways

- Vector search = embed the query with the same model as the corpus, rank stored chunk vectors by cosine similarity (a dot product for normalized vectors).
- Exact search dies at scale; ANN indexes like HNSW return ~95–99% of true neighbors in milliseconds — which means retrieval can *miss*, and `ef_search` is a real tuning knob.
- A vector database adds persistence, CRUD, filtering, and scaling around the index; pgvector is the right default when you already run Postgres, with dedicated vector DBs earning their keep at large scale.
- Metadata filtering (tenant, doc type, recency) is a first-class requirement — and a security boundary for multi-tenant systems; understand whether your store filters during or after ANN traversal.
- Store the embedding model name and rich chunk metadata; you'll need them for re-embedding, citations, and evaluation.
