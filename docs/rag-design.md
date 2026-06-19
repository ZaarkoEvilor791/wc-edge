# RAG + GraphRAG Design

**Status:** Proposed  
**Date:** 2026-06-19

Retrieval-Augmented Generation and Graph-RAG architecture for the wc-edge AI Advisor service. These components ground the LLM's responses in verified player/fixture data and eliminate hallucination of statistics.

---

## Problem Statement

Without retrieval, the LLM:
- Hallucinates xP values ("Haaland has 8.2 xP this round" — fabricated)
- Has no knowledge of post-training tournament events
- Cannot reason about fixture difficulty beyond general football knowledge

With retrieval, the LLM receives:
- Verified per-player xP, p_goal, p_cs, mf from the projection model
- Live FDR scores (lambda_posterior updated after each completed round)
- Multi-hop fixture reasoning: "Morocco has conceded 1.8 gpg in R1–R3 actuals"

---

## RAG Pipeline (LlamaIndex + FAISS)

### Player Document Structure

One document per player, built by `rag/documents.py`:

```
Player: Erling Haaland (FWD, £14.5m, Norway seed 2)
Round 3 xP: 6.4 | p_goal: 0.52 | p_cs: 0.28 | mf: 0.94 | low_sample: false
Club (StatsBomb): 1.18 xG90, 0.31 xA90, 94% start rate (2,847 club mins)
Tournament stats: 0.71 xG90, 0.28 xA90
FDR Round 3: 2 (easy) vs Mexico seed 7 | lambda_posterior: 0.82
Opponent goals conceded pg: 1.4 (R1–R2 actuals)
Ownership: 34.2% | Status: active | Penalty taker: true
```

Documents are rebuilt after each engine run (`embed_all_players()`) and stored in the FAISS index. The `opponent goals conceded pg` field uses dynamic FDR values — post-round actuals, not seed estimates.

---

### Embedding Model

`sentence-transformers/all-MiniLM-L6-v2`

- 384 dimensions, CPU-only, ~80MB download
- Zero per-call API cost (no OpenAI embeddings)
- Sufficient for factual retrieval from structured player documents
- Loaded once at service startup; inference ~2ms per document

---

### FAISS Index

```python
faiss_index = faiss.IndexFlatIP(384)   # inner product on L2-normalized vectors = cosine
```

1,484 documents → ~2MB index on disk. Full rebuild: ~8s on 2-core CPU.

Index persisted to `data/faiss_index/` (gitignored; rebuilt by engine pipeline).

---

### Hybrid Retrieval (BM25 + Semantic)

```
Query: "Who should I captain vs a weak defence?"
  │
  ├── BM25Retriever: keyword match on "captain", "defence", "FDR"
  │   → top-10 by BM25 score
  │
  └── VectorIndexRetriever: semantic similarity in 384-dim space
      → top-10 by cosine score
  │
  └── QueryFusionRetriever (RRF fusion)
      → re-ranked top-5 by Reciprocal Rank Fusion score
      → returned to KnowledgeAgent as rag_context string
```

Hybrid retrieval outperforms pure semantic search for queries with specific player names or position keywords (where BM25 exact-match dominates).

---

### VectorStore Abstraction

```python
# rag/vector_store_base.py
class VectorStoreBackend(ABC):
    @abstractmethod
    def build(self, documents: list[Document]) -> None: ...
    @abstractmethod
    def retrieve(self, query: str, k: int = 3) -> list[NodeWithScore]: ...
    @abstractmethod
    def persist(self, path: str) -> None: ...

class FAISSBackend(VectorStoreBackend):     # dev / CI / Render (no network dep)
    ...

class WeaviateBackend(VectorStoreBackend):  # prod cloud (stateless pods)
    ...
```

Swap from FAISS to Weaviate by changing one env var (`VECTOR_STORE_BACKEND=weaviate`). No code changes in indexer or retriever.

---

### Thread-Safe Index Refresh (Copy-on-Write)

```python
_INDEX_LOCK = asyncio.Lock()
_ACTIVE_INDEX: VectorStoreIndex | None = None

async def refresh_index(conn):
    new_index = await asyncio.to_thread(build_to_temp, conn, "/tmp/faiss_new")
    async with _INDEX_LOCK:
        shutil.move("/tmp/faiss_new", INDEX_PATH)   # atomic at OS level
        global _ACTIVE_INDEX
        _ACTIVE_INDEX = load_index(INDEX_PATH)
    logger.info("FAISS index refreshed: %d docs", len(new_index.docstore.docs))
```

In-flight queries continue using the old `_ACTIVE_INDEX` reference. Lock only held during the pointer swap (~1ms), not during the rebuild (~8s).

---

## GraphRAG Pipeline (LlamaIndex PropertyGraphIndex)

### Why GraphRAG

RAG retrieves documents about individual players. GraphRAG retrieves *relationships*:
- "Which players on teams facing weak defences this round?" (requires Team→FACES→Team + Player→PLAYS_FOR)
- "Do France have good cover if Mbappé is injured?" (requires Player→TEAMMATES_WITH)
- "Has this team been eliminated?" (requires Team→ELIMINATED_BY)

These multi-hop queries are not answerable by cosine similarity over player documents alone.

---

### Graph Schema

```
Nodes:
  Player(element_id, name, position, price, is_penalty_taker)
  Team(squad_id, name, abbr, seed, group, is_active)
  Round(round_id, stage, status)
  Stat(player_id, round_id, xp, xgb_xp, p_goal, p_cs, mf, lambda_posterior)

Edges:
  Player  -[PLAYS_FOR]→                Team
  Team    -[COMPETES_IN]→              Round
  Team    -[FACES {fdr, lambda, goals_conceded_pg, def_mult}]→  Team  (per round)
  Player  -[HAS_STAT]→                 Stat
  Player  -[TEAMMATES_WITH]→           Player
  Team    -[ELIMINATED_BY]→            Team  (post-knockout only)
```

The `FACES` edge is the most valuable for captaincy queries. It carries `lambda_posterior` from `wc.team_fdr` — updated after every completed round by `update_round_fdr()`.

---

### Graph Build

```python
# graphrag/graph_store.py
def build_graph(conn) -> PropertyGraphIndex:
    G = nx.DiGraph()
    # Load all players + teams + rounds + stats from DB
    # Add nodes with attributes
    # Add PLAYS_FOR edges (player → team)
    # Add FACES edges from wc.team_fdr (team vs team per round, carrying lambda)
    # Add HAS_STAT edges (player → stat node per round)
    # Add TEAMMATES_WITH edges (player-to-player within same team)
    # Wrap in LlamaIndex PropertyGraphIndex
    store = SimplePropertyGraphStore()
    store.upsert_nodes(nodes)
    store.upsert_relations(edges)
    return PropertyGraphIndex(property_graph_store=store)
```

Graph rebuild: ~3s for 1,484 players + 48 teams + 8 rounds + FDR edges. Rebuilt on service startup and hourly via background task.

---

### Retrieval: Multi-hop Traversal

```python
# graphrag/graph_retriever.py

def get_matchup_context(home_id, away_id, round_id, G) -> str:
    """
    Returns structured text for LLM context:
    - FACES edge attributes (FDR, lambda, goals_conceded_pg)
    - Home team top-5 players by xP
    - Away team defensive record
    """
    ...

def get_player_neighbourhood(element_id, depth=2, G) -> str:
    """
    BFS 2-hops:
    Player → Team → [FACES edges for current+next round, TEAMMATES_WITH top-3 by xP]
    Returns serialized context string
    """
    ...
```

---

### Entity Extraction

Before traversal, the user message is scanned for player/team mentions:

```python
# graphrag/entity_extractor.py

def extract_entities(message: str, conn) -> dict:
    """
    1. Regex: find capitalized words (likely player/team names)
    2. Fuzzy match against wc.players.name and wc.teams.name
    3. Return {players: [element_id,...], teams: [squad_id,...]}
    """
    ...
```

This uses rapidfuzz (Levenshtein distance) to handle "Erling" matching "Haaland", "Mbappe" matching "Mbappé".

---

## Integration with LangGraph

The `KnowledgeAgent` node runs both retrievers:

```python
async def knowledge_agent(state: AgentState) -> AgentState:
    query = state["messages"][-1].content
    entities = extract_entities(query, db)

    # RAG: semantic + BM25
    rag_docs = retrieve(query, k=3)
    state["rag_context"] = format_docs(rag_docs)

    # GraphRAG: multi-hop if entities found
    if entities["teams"] and len(entities["teams"]) >= 2:
        state["graph_context"] = get_matchup_context(*entities["teams"][:2], state["round_id"], G)
    elif entities["players"]:
        state["graph_context"] = get_player_neighbourhood(entities["players"][0], G=G)

    return state
```

Both contexts are injected into the dynamic (uncached) system prompt block before the LLM call.

---

## Prompt Architecture

```
System prompt — Block 1 (cached, 2048+ tokens):
  - WC 2026 scoring rules
  - Squad/transfer/captain rules  
  - Anti-hallucination instruction: "Only cite players whose stats appear in <rag_context>"
  - Citation format instruction: "Each factual claim must link to a provided document"

System prompt — Block 2 (dynamic, uncached):
  <tournament>Round 3 of 8. Status: playing.</tournament>
  <squad_analysis>Per-player xP/FDR/status for the user's 15</squad_analysis>
  <rag_context>Top-5 retrieved player documents</rag_context>
  <graph_context>PropertyGraph traversal output (if entities found)</graph_context>

User messages: conversation history
```

Block 1 uses Anthropic prompt caching (`cache_control: ephemeral`). With 2,048+ input tokens cached, the cache hit rate is high for repeated queries in the same session, reducing effective input cost by ~90%.

---

## Quality Metrics

| Metric | Target | How Measured |
|---|---|---|
| RAG precision@3 | > 0.8 (relevant players in top-3) | LLM-as-judge (10% sample): are retrieved docs about players the user asked about? |
| GraphRAG hit rate | > 70% of queries with named entities use graph context | Logged per request to LangSmith |
| Hallucination rate | 0% invalid player names in actions | Guardrails DB lookup; flagged in LangSmith eval dataset |
| Index staleness | < 25 hours | `/health` endpoint; readiness probe blocks traffic if exceeded |
| Retrieval latency | < 200ms (p95) | OpenTelemetry span on `retrieve()` call |

---

*See [hld.md](hld.md) for system context · [llmops.md](llmops.md) for eval pipeline · [ADR 006](adr/006-rag-llamaindex-faiss.md) and [ADR 007](adr/007-graphrag-property-graph.md)*
