# Embeddings & Vector Representations

> **What you'll learn:** what an embedding is, why "meaning as geometry" is the foundational idea behind semantic search and RAG, how to compute similarity, and the practical knobs that matter.

## Meaning as geometry

An **embedding** is a list of numbers — a vector, typically 256 to 3072 dimensions — that represents the *meaning* of a piece of text. An embedding model is trained so that semantically similar texts land close together in this vector space:

```
embed("How do I reset my password?")
embed("I forgot my login credentials")     ← these two are CLOSE

embed("Best pizza toppings for a party")   ← this one is FAR from both
```

This is the single idea behind semantic search, RAG retrieval, clustering, deduplication, recommendation, and classification-by-similarity. Text goes in, a point in space comes out, and *distance means dissimilarity*.

Note: these are produced by **dedicated embedding models** (e.g. `text-embedding-3-small`, `voyage-3`, open-source `bge` / `gte` families) — not by the chat model. They're fast and cheap compared to generation.

## Measuring similarity

The standard metric is **cosine similarity** — the cosine of the angle between two vectors. 1.0 means identical direction, 0 means unrelated, negative means opposed (rare in practice with modern embeddings):

```python
import numpy as np

def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

# With normalized vectors (most APIs return these), cosine similarity
# is just the dot product — and ranking by it equals ranking by
# Euclidean distance. The metric choice rarely matters; the model does.
```

```typescript
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
```

Semantic search is then embarrassingly simple at small scale:

1. Embed every document once; store the vectors.
2. Embed the query at request time.
3. Compute similarity against all stored vectors; return the top-k.

You'll build exactly this in **Lab 04 (RAG from scratch)** — no vector database required. Vector databases (Module 4) exist to make step 3 fast at millions of vectors, not to do anything conceptually different.

## Calling an embeddings API

```python
# Provider-agnostic shape; e.g. OpenAI's endpoint shown
from openai import OpenAI

client = OpenAI()
resp = client.embeddings.create(
    model="text-embedding-3-small",
    input=["How do I reset my password?", "I forgot my login credentials"],
)
vec_a, vec_b = resp.data[0].embedding, resp.data[1].embedding
print(len(vec_a))  # e.g. 1536 dimensions
```

```typescript
import OpenAI from "openai";

const client = new OpenAI();
const resp = await client.embeddings.create({
  model: "text-embedding-3-small",
  input: ["How do I reset my password?", "I forgot my login credentials"],
});
const [vecA, vecB] = resp.data.map((d) => d.embedding);
console.log(vecA.length); // e.g. 1536 dimensions
```

Batch your inputs — embedding 1,000 texts in batched calls is dramatically faster and often cheaper than 1,000 single calls.

## Practical knobs that matter

- **Model choice dominates everything.** Check the [MTEB leaderboard](https://huggingface.co/spaces/mteb/leaderboard) for retrieval quality, but always validate on *your* data — domain mismatch (legal, medical, code) is the most common cause of bad retrieval.
- **Dimensions trade quality for cost.** Some models (e.g. with Matryoshka training) let you truncate vectors to 256–512 dims for ~most of the quality at a fraction of storage/compute.
- **Embeddings are model-specific.** Vectors from different models — or even versions — live in incompatible spaces. Changing your embedding model means **re-embedding the entire corpus**. Store the model name alongside your vectors.
- **Symmetric vs asymmetric search.** Queries are short; documents are long. Good retrieval embedding models are trained for this asymmetry; some require prefixes like `"query: ..."` / `"passage: ..."` — read the model card.
- **What embeds well:** topical, self-contained chunks of prose. **What embeds poorly:** very long mixed-topic documents (dilution — fix with chunking, Module 4), bare keywords/IDs/part numbers (fix with hybrid search, Module 4), and negation ("not eligible" embeds close to "eligible").

## Beyond search: other uses you get for free

- **Clustering** — group support tickets or user feedback by theme (k-means over embeddings).
- **Deduplication / near-duplicate detection** — pairs above ~0.95 similarity are usually duplicates.
- **Classification** — embed labeled examples; classify new items by nearest neighbors. A surprisingly strong, trainable-in-minutes baseline.
- **Anomaly detection** — items far from every cluster centroid are outliers.

## Key takeaways

- An embedding maps text to a point in vector space where distance ≈ semantic dissimilarity. That one idea powers search, RAG, clustering, and dedup.
- Cosine similarity (a dot product, for normalized vectors) is the standard measure; at small scale, brute-force comparison is perfectly fine.
- Embedding model choice — validated on your own domain — matters far more than the distance metric or database.
- Vectors are not portable across models; plan for re-embedding when you upgrade.
- Embeddings struggle with exact identifiers and negation; hybrid search (Module 4) covers those gaps.
