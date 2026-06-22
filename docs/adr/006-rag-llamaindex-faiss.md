> **Context consolidated** — This ADR is summarised in [`.knowledge/sessions/000-existing-context.md`](../../.knowledge/sessions/000-existing-context.md).

# ADR 006 â€” RAG with LlamaIndex + FAISS

**Status:** Proposed  
**Date:** 2026-06-19  
**Context:** Phase 1 AI Advisor service â€” retrieval grounding for LLM responses

---

## Decision

Use LlamaIndex `VectorStoreIndex` over FAISS for player profile retrieval. Hybrid retrieval: BM25 (keyword) + semantic (cosine). Embedding model: `sentence-transformers/all-MiniLM-L6-v2` (384-dim, CPU-only, ~80MB). FAISS for local dev/CI; Weaviate Cloud for production (swap via abstract `VectorStoreBackend` ABC).

---

## Rationale

**Why LlamaIndex over raw FAISS:**  
LlamaIndex provides document chunking, node metadata, hybrid retrieval fusion, and async index management out of the box. The `QueryFusionRetriever` gives BM25 + semantic in ~10 lines vs building it from scratch.

**Why BM25 + semantic hybrid:**  
Player names and position keywords ("FWD", "captain", "FDR") are exact-match signals where BM25 outperforms semantic search. General intent queries ("who has the best fixtures?") benefit from semantic. RRF fusion picks the best of both.

**Why all-MiniLM-L6-v2:**  
Zero per-call cost (vs OpenAI `text-embedding-ada-002`). Runs on CPU in ~2ms per document. 384 dimensions are sufficient for retrieval from 1,484 structured player documents (not open-domain unstructured text). Model loads once at service startup.

**Why top-k=3 not 5:**
Each player document is ~80â€“100 tokens. Top-5 adds ~450 tokens of dynamic context to every Advisor and Synthesizer call. For structured player profiles (short, factual), the top result is usually definitive and the 4th/5th results add marginal signal. Reducing to top-3 saves ~160 tokens (~40%) per call with no measurable retrieval quality loss. `DEFAULT_TOP_K = 3` in `rag/hybrid_retriever.py`.

**Why FAISS local / Weaviate prod:**  
FAISS is a local file (2MB for 1,484 docs). No network dependency for dev/CI. Weaviate Cloud enables stateless pods in Kubernetes (no PersistentVolumeClaim for the index). The `VectorStoreBackend` ABC makes the swap transparent to all callers.

---

## Rejected Alternatives

| Option | Reason Rejected |
|---|---|
| Pinecone | Paid beyond free tier; adds external dependency not needed at this scale |
| Chroma | Less production-proven; LlamaIndex integration is newer and less stable |
| Pure pgvector | No BM25 fusion; requires additional extension setup; slower for k-NN at 1,484 docs |
| OpenAI embeddings | Per-call cost; rate limits; adds latency vs local model |

---

## Consequences

- FAISS index is gitignored; rebuilt on every engine run by `embed_all_players()` and persisted to `data/faiss_index/`
- `refresh_index()` uses copy-on-write (build to `/tmp/faiss_new`, atomic swap) â€” in-flight queries never see a partial index
- Index staleness exposed via `/health.index_staleness_hours`; Kubernetes readiness probe fails if > 25 hours (triggers rebuild)
- `VectorStoreBackend` ABC must be kept in sync if LlamaIndex API changes affect either FAISS or Weaviate backends

## What future reviewers should not re-suggest

Do not suggest replacing LlamaIndex with a custom retrieval loop to "reduce dependencies." The BM25+semantic hybrid and async index management in LlamaIndex are non-trivial to replicate correctly, and the abstraction layer (`VectorStoreBackend`) already keeps the core logic decoupled from any specific backend.
