# ADR 007 — GraphRAG with LlamaIndex PropertyGraphIndex

**Status:** Proposed  
**Date:** 2026-06-19  
**Context:** Phase 2 — multi-hop reasoning for fixture and captaincy queries

---

## Decision

Build a player/team/fixture knowledge graph using LlamaIndex `PropertyGraphIndex` backed by NetworkX. At query time, extract named entities from the user message → traverse the graph → serialize the subgraph as structured text injected into the LLM context. This is distinct from (and complementary to) RAG: graph traversal enables multi-hop reasoning that vector similarity cannot provide.

---

## Rationale

### Why GraphRAG at All

Pure RAG retrieves documents about individual players but cannot answer relational queries:
- "Which of my players have easy fixtures this round?" (requires Player→Team→FACES)
- "Is Norway defensive strength going to hurt Mbappé's cs_probability?" (requires two FACES edges + team stats)
- "Who are the best penalty-taking alternatives to Haaland?" (requires TEAMMATES_WITH + is_penalty_taker filter)

These require graph traversal — following typed relationships across multiple entities — which vector similarity cannot model.

### Why LlamaIndex PropertyGraphIndex + NetworkX

- PropertyGraphIndex is LlamaIndex's production-ready graph abstraction. It handles node/edge serialization and query interface consistently with the rest of the RAG stack.
- NetworkX is the canonical Python graph library. BFS/DFS traversal is trivial. No graph database to operate.
- For 1,484 players + 48 teams + 8 rounds + ~400 FDR edges, an in-memory NetworkX graph is ~5MB and rebuilds in ~3s. No need for a persistent graph DB.

### Graph Schema Decision

The `FACES {fdr_rating, lambda_posterior, def_multiplier, goals_conceded_pg}` edge is the core design decision. It carries live FDR data — updated after every completed round by `update_round_fdr()` — so the graph automatically reflects actual defensive/offensive form, not just pre-tournament seed estimates. This is what makes captaincy advice grounded.

---

## Rejected Alternatives

| Option | Reason Rejected |
|---|---|
| Neo4j | Requires a running graph DB; adds operational complexity not justified at this data scale |
| RDF/SPARQL | Steep learning curve; no natural fit with the Python ML stack; verbose query language |
| Amazon Neptune | Cloud-hosted graph DB; cost and vendor lock-in not justified; NetworkX sufficient |
| Custom adjacency dict | Reinvents graph traversal; loses PropertyGraphIndex query abstractions |
| Microsoft GraphRAG | Designed for unstructured text corpora; our data is already structured (DB rows) — no need for LLM-based entity extraction on the graph build path |

---

## Consequences

- Graph is rebuilt in memory on ai-advisor service startup and hourly via a background task
- `FACES` edges are stale by at most 1 hour between `update_round_fdr()` runs
- `entity_extractor.py` uses rapidfuzz for fuzzy name matching (handles "Mbappe" → "Mbappé", "Erling" → "Haaland")
- GraphRAG context is only injected into the LLM prompt when the entity extractor finds ≥1 player or team mention in the query — avoids inflating prompt length on general queries
- `get_matchup_context()` and `get_player_neighbourhood()` serialize graph output as human-readable text (not JSON). LLM comprehension of natural language is better than structured JSON for multi-hop context.

## What future reviewers should not re-suggest

Do not suggest Neo4j or Neptune for "production grade." The NetworkX in-memory graph is the right choice at this scale (~1,500 nodes, ~5,000 edges). A hosted graph DB would add a network call and operational burden without measurable query quality improvement. If the data grows beyond ~100k nodes, revisit.
