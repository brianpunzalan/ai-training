# Evaluating RAG

> **What you'll learn:** how to evaluate retrieval and generation as separate components, the metrics that matter for each (recall@k, MRR, faithfulness, answer relevance), how to build the golden dataset that powers them, and how this discipline plugs into Module 7's broader evaluation practice.

## "It seems to work" is not a metric

A RAG system has two places to fail: retrieval can fetch the wrong chunks, or generation can answer badly from the right ones. An end-to-end "was the answer good?" score can't tell you which happened — and the fixes are completely different (re-chunk vs re-prompt). So RAG evaluation is **component-wise**: measure retrieval against labeled chunks, measure generation against the retrieved context, and only then look at end-to-end quality.

This lesson is Module 7's evaluation discipline applied to one architecture; the habits transfer directly.

## Evaluating retrieval

You need a **golden retrieval set**: questions paired with the chunk(s) or document(s) that actually contain the answer. 50–100 questions is a strong start. Source them from real user queries where possible, and label by finding the answering passages yourself (or generate Q→chunk pairs synthetically with an LLM and human-verify a sample — see Lesson 6 caveats below).

The two metrics that earn their keep:

- **Recall@k** — of the relevant chunks, what fraction appear in the top k results? This is the *ceiling* metric: if the right chunk isn't in the top k, nothing downstream can save the answer. Track recall@5 (what fits in the prompt) and recall@50 (what reaches the reranker).
- **MRR (mean reciprocal rank)** — average of 1/rank of the first relevant chunk. Measures whether the right chunk ranks *high*, which matters because models attend most to what you put first.

```python
def recall_at_k(retrieved: list[str], relevant: set[str], k: int) -> float:
    hits = sum(1 for doc_id in retrieved[:k] if doc_id in relevant)
    return hits / len(relevant)

def reciprocal_rank(retrieved: list[str], relevant: set[str]) -> float:
    for i, doc_id in enumerate(retrieved):
        if doc_id in relevant:
            return 1.0 / (i + 1)
    return 0.0
```

```typescript
function recallAtK(retrieved: string[], relevant: Set<string>, k: number): number {
  const hits = retrieved.slice(0, k).filter((id) => relevant.has(id)).length;
  return hits / relevant.size;
}

function reciprocalRank(retrieved: string[], relevant: Set<string>): number {
  const i = retrieved.findIndex((id) => relevant.has(id));
  return i === -1 ? 0 : 1 / (i + 1);
}
```

These run in milliseconds with no LLM, so you can sweep parameters — chunk size, overlap, hybrid weights, `ef_search`, reranker on/off — and read off the best configuration from a table. This is how Lesson 2's "tune against an eval set, never by eyeballing" cashes out, and it's the diagnostic that tells you *which* stage from Lesson 4 to add: low recall@50 means retrieval itself is missing (fix chunking/hybrid); high recall@50 but low recall@5 means ranking is the problem (add the reranker).

## Evaluating generation

Given good chunks, did the model answer well? The RAGAS-style triad covers the question from three angles:

| Metric | Question it answers | Catches |
|---|---|---|
| **Faithfulness / groundedness** | Is every claim in the answer supported by the retrieved context? | Hallucination on top of good retrieval |
| **Answer relevance** | Does the answer actually address the question asked? | Evasive or off-target answers |
| **Context relevance** | Was the retrieved context actually needed/used? | Bloated, noisy retrieval |

Faithfulness is the one RAG exists for, and it's measured by decomposition: split the answer into atomic claims, then check each claim against the retrieved chunks — a job for LLM-as-judge (Module 7 covers judge design, biases, and validation). A faithfulness score below ~0.9 on a grounded-answer product is a fire alarm.

Two cheaper signals complement the judge: **citation coverage** (what fraction of answer sentences carry a source id — mechanical to compute given Lesson 5's prompt format) and the **"I couldn't find this" rate**, which should be near 100% on questions you *know* the corpus can't answer. That last one deserves its own eval slice: unanswerable questions are where ungrounded models bluff.

## Building and maintaining the golden set

- **Synthetic generation works, with care**: feed chunks to an LLM and ask for questions each chunk answers. Caveats: synthetic questions tend to echo the chunk's vocabulary (inflating retrieval scores vs real paraphrased queries), so rewrite a sample into natural phrasing and human-verify labels.
- **Harvest production failures.** Every bad answer found in the wild becomes a permanent test case — the eval set grows where the system is weakest (Module 7's golden-set practice).
- **Version it in git** alongside the pipeline config. When chunking changes, chunk-level labels need re-mapping — labeling at the *document + passage text* level (not chunk id) survives re-chunking.
- **Re-run on every change**: chunking, embedding model, hybrid weights, prompt, generation model. RAG has many coupled knobs; the eval suite is what makes turning them safe.

## Key takeaways

- Evaluate retrieval and generation separately — they fail differently and are fixed differently; end-to-end scores can't localize the failure.
- Retrieval: recall@k is the ceiling (if it's not retrieved, nothing can save you), MRR measures ranking quality; both are fast, LLM-free, and perfect for parameter sweeps.
- Generation: the faithfulness / answer-relevance / context-relevance triad, with faithfulness — every claim supported by context — as the metric RAG exists for.
- Cheap mechanical signals matter: citation coverage and the not-found rate on known-unanswerable questions.
- Build the golden set from real queries plus verified synthetic ones, harvest every production failure into it, version it in git, and re-run on every pipeline change.
