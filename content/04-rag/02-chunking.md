# Chunking Strategies

> **What you'll learn:** why documents must be split before embedding, the four main chunking strategies and when each wins, how chunk size and overlap trade off against each other, and how contextual chunk headers fix the "orphaned chunk" problem.

## Why chunk at all?

You can't embed a 50-page document as one vector. Module 1's embeddings lesson showed why: a long, multi-topic text dilutes into a semantic average that matches nothing well. And you don't *want* to retrieve whole documents — you want the three paragraphs that answer the question, not 49 pages of noise around them.

Chunking decides the **unit of retrieval**, and it's the highest-leverage, least-glamorous decision in a RAG system. Bad chunking puts a ceiling on everything downstream: the best embedding model and reranker can't recover information that was split mid-sentence across two chunks.

The core tension:

- **Small chunks** embed precisely (one idea ≈ one vector) and match queries well — but may lack the surrounding context needed to actually *answer* once retrieved.
- **Large chunks** carry full context — but embed mushily, match queries worse, and drag irrelevant tokens into the prompt.

A useful framing: **retrieve by the small thing, but make sure the model can read enough of the big thing.**

## The four strategies

### 1. Fixed-size chunking

Split every N tokens (commonly 256–512) with M tokens of overlap. Trivial to implement, predictable cost, completely structure-blind: it will happily split a sentence, a table row, or a code function down the middle. Acceptable as a baseline; rarely what you ship.

### 2. Recursive character/token splitting

The pragmatic workhorse. Try to split on the largest separator first (`\n\n` paragraphs), and only fall back to smaller ones (`\n`, sentence ends, spaces) when a piece is still too big. Chunks respect natural boundaries *most* of the time while staying near the target size.

```python
def recursive_split(text: str, max_tokens: int, seps=("\n\n", "\n", ". ", " ")) -> list[str]:
    if count_tokens(text) <= max_tokens:
        return [text]
    for sep in seps:
        parts = text.split(sep)
        if len(parts) > 1:
            chunks, current = [], ""
            for part in parts:
                candidate = current + sep + part if current else part
                if count_tokens(candidate) > max_tokens and current:
                    chunks.extend(recursive_split(current, max_tokens, seps))
                    current = part
                else:
                    current = candidate
            if current:
                chunks.extend(recursive_split(current, max_tokens, seps))
            return chunks
    return hard_split(text, max_tokens)  # no separator worked; split by tokens
```

```typescript
function recursiveSplit(text: string, maxTokens: number, seps = ["\n\n", "\n", ". ", " "]): string[] {
  if (countTokens(text) <= maxTokens) return [text];
  for (const sep of seps) {
    const parts = text.split(sep);
    if (parts.length > 1) {
      const chunks: string[] = [];
      let current = "";
      for (const part of parts) {
        const candidate = current ? current + sep + part : part;
        if (countTokens(candidate) > maxTokens && current) {
          chunks.push(...recursiveSplit(current, maxTokens, seps));
          current = part;
        } else {
          current = candidate;
        }
      }
      if (current) chunks.push(...recursiveSplit(current, maxTokens, seps));
      return chunks;
    }
  }
  return hardSplit(text, maxTokens); // no separator worked; split by tokens
}
```

### 3. Document-structure-aware chunking

Use the document's own skeleton: Markdown headings, HTML sections, PDF layout, code functions/classes. A chunk becomes "everything under `## Refund policy`" rather than "tokens 4096–4608." For structured corpora (docs sites, wikis, codebases, contracts), this usually beats everything else, because authors already organized the text into retrievable ideas. Keep the heading path (`Billing > Refunds > Annual plans`) as metadata — you'll use it below.

### 4. Semantic chunking

Embed each sentence, walk through the document, and start a new chunk where embedding similarity between adjacent sentences drops — i.e., where the *topic* shifts. Produces clean topical chunks for unstructured prose (transcripts, long-form articles) at the cost of an embedding pass over every sentence at ingest time. Worth it when structure-aware splitting has no structure to work with.

| Strategy | Respects meaning? | Ingest cost | Best for |
|---|---|---|---|
| Fixed-size | No | Trivial | Baselines, uniform logs |
| Recursive | Mostly | Trivial | General default |
| Structure-aware | Yes (author-defined) | Low | Docs, wikis, code, contracts |
| Semantic | Yes (model-defined) | High | Unstructured prose, transcripts |

## Size and overlap

Reasonable 2026 defaults: **300–800 tokens per chunk, 10–20% overlap**, then tune against your eval set (Lesson 6 — never tune chunking by vibes). Overlap insures against ideas that straddle a boundary, at the price of index size and near-duplicate retrievals.

Two patterns decouple the retrieve-small/read-big tension entirely:

- **Parent-document (small-to-big) retrieval:** embed small chunks for precise matching, but store a pointer to the parent section; at query time, return the parent to the LLM.
- **Sentence-window retrieval:** embed single sentences, return each hit with ±k surrounding sentences.

## Contextual retrieval: fixing orphaned chunks

A chunk reading *"The fee is waived for accounts older than two years"* is nearly unsearchable — fee for *what*? This is the **orphaned chunk** problem: splitting strips the context that made the text meaningful.

The fix is to prepend context to every chunk before embedding. Two tiers:

1. **Contextual chunk headers (cheap):** prepend document title + heading path: `Document: Billing FAQ > Section: Wire transfer fees\n\nThe fee is waived...`. Nearly free, and often a large retrieval win on its own.
2. **Contextual retrieval (LLM-generated):** following Anthropic's contextual-retrieval approach, have a small, cheap model write a 1–2 sentence situating statement for each chunk given the full document ("This chunk discusses wire-transfer fee waivers in Acme's 2026 billing policy"), and prepend it before embedding and BM25-indexing. Anthropic reported retrieval failure reductions of ~35% (and ~49% combined with reranking, Lesson 4). With prompt caching keeping the per-document cost low, this is now standard practice for high-value corpora.

## Key takeaways

- Chunking sets the unit of retrieval and caps your whole pipeline's quality; it deserves more attention than it usually gets.
- Small chunks match queries precisely but lack answering context; large chunks embed mushily — patterns like parent-document retrieval let you retrieve small and read big.
- Default to recursive splitting at 300–800 tokens with 10–20% overlap; prefer structure-aware chunking when documents have headings/sections; reserve semantic chunking for unstructured prose.
- Orphaned chunks lose meaning when split — contextual chunk headers (title + heading path) are nearly free, and LLM-generated contextual retrieval cuts retrieval failures dramatically.
- Tune chunk size, overlap, and strategy against a retrieval eval set (Lesson 6), never by eyeballing a few queries.
