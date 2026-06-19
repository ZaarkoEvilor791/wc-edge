# Low-Level Design — Service API Contracts

**Status:** Proposed  
**Date:** 2026-06-19

Service boundaries, request/response schemas, and internal data contracts for the wc-edge microservices architecture.

---

## Service 1: AI Advisor (`services/ai-advisor` — FastAPI :8001)

### POST /chat

Streaming SSE endpoint. Runs LangGraph pipeline; emits status events then final result.

**Request:**
```json
{
  "messages": [
    {"role": "user", "content": "Who should I captain this round?"}
  ],
  "squad_ids": [101, 245, 389],
  "round_id": 3
}
```

**Response:** `text/event-stream`

```
data: {"type": "status", "node": "router", "intent": "captain"}

data: {"type": "status", "node": "captaincy_advisor", "players_checked": 3}

data: {"type": "status", "node": "knowledge_agent", "rag_docs": 5, "graph_nodes": 12}

data: {"type": "status", "node": "synthesizer"}

data: {"type": "status", "node": "guardrails", "hallucinations_found": 0}

data: {"type": "done", "content": "Haaland (6.4 xP) is your standout captain...", "actions": [{"type": "set_captain", "name": "Erling Haaland"}], "citations": ["Haaland xP=6.4 (Round 3 projection)", "Norway FDR=2 vs Mexico"], "token_usage": {"input_tokens": 1842, "output_tokens": 284, "cost_usd": 0.0098}}
```

**Error:** HTTP 500 with `{"error": "...", "fallback_used": true}` — BFF catches and routes to legacy handler.

---

### POST /chat/sync

Non-streaming version (for integration tests and health checks).

**Request:** Same as `/chat`

**Response:**
```json
{
  "content": "...",
  "actions": [],
  "citations": [],
  "token_usage": {"input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0}
}
```

---

### POST /screenshot

Vision extraction: decode squad from screenshot image.

**Request:**
```json
{
  "image_base64": "<base64>",
  "mime_type": "image/png",
  "round_id": 3
}
```

**Response:**
```json
{
  "matched_players": [
    {"name": "Haaland", "element_id": 101, "confidence": 0.97}
  ],
  "unmatched": ["some name"]
}
```

---

### GET /graph/player/{element_id}

Returns player subgraph (2-hop neighbourhood).

**Response:**
```json
{
  "player": {"element_id": 101, "name": "Haaland", "position": "FWD", "price": 145},
  "team": {"squad_id": 22, "name": "Norway", "seed": 2, "group": "C"},
  "fixtures": [
    {"round": 3, "opponent": "Mexico", "fdr": 2, "lambda_posterior": 0.82}
  ],
  "teammates": [{"element_id": 204, "name": "Odegaard", "position": "MID"}],
  "stats": {"xp": 6.4, "p_goal": 0.52, "p_cs": 0.28, "mf": 0.94}
}
```

---

### GET /graph/matchup

Fixture context for two teams.

**Query params:** `?home_team_id=22&away_team_id=31&round_id=3`

**Response:**
```json
{
  "home_team": {"squad_id": 22, "name": "Norway", "goals_pg": 2.1, "goals_conceded_pg": 0.8},
  "away_team": {"squad_id": 31, "name": "Morocco", "goals_pg": 1.2, "goals_conceded_pg": 1.4},
  "fdr_home": {"rating": 3, "lambda_posterior": 1.12, "def_multiplier": 1.08},
  "fdr_away": {"rating": 2, "lambda_posterior": 0.91, "def_multiplier": 0.88},
  "top_home_players": [
    {"name": "Haaland", "xp": 6.4, "p_goal": 0.52}
  ]
}
```

---

### POST /embeddings/refresh

Trigger async FAISS index rebuild. Returns immediately; rebuild happens in background.

**Response:**
```json
{"status": "rebuilding", "estimated_seconds": 45}
```

---

### GET /health

```json
{
  "status": "ok",
  "models": {
    "router": "claude-haiku-4-5-20251001",
    "primary": "claude-sonnet-4-6",
    "fallback1": "azure/gpt-4o",
    "fallback2": "gemini/gemini-1.5-pro"
  },
  "index_built_at": "2026-06-19T04:12:00Z",
  "index_staleness_hours": 8.3,
  "graph_nodes": 1592,
  "graph_edges": 4218
}
```

---

## Service 2: Player Intelligence (`services/player-intelligence` — FastAPI :8002)

### GET /projections

**Query:** `?round=3`

**Response:**
```json
[
  {
    "element": 101,
    "name": "Haaland",
    "position": "FWD",
    "price": 145,
    "xp": 6.4,
    "xgb_xp": 6.1,
    "ensemble_xp": 6.28,
    "p_goal": 0.52,
    "p_cs": 0.28,
    "mf": 0.94,
    "variance": 1.2,
    "is_penalty_taker": true
  }
]
```

---

### GET /players

All 1,484 players with current round projection.

**Response:** Array of player objects (same schema as `/projections` plus `squad_id`, `is_active`).

---

### GET /model-meta

Model performance for current round.

**Response:**
```json
{
  "round": 3,
  "bayesian_rmse": 2.41,
  "xgb_cv_rmse_mean": 2.18,
  "xgb_cv_rmse_std": 0.31,
  "ensemble_weights": {"bayesian": 0.6, "xgb": 0.4},
  "training_samples": 2968,
  "mlflow_run_id": "a1b2c3d4e5f6",
  "model_version": "3"
}
```

---

### POST /optimize-squad

**Request:**
```json
{"round": 3, "budget": 100, "variant": "balanced"}
```

**Response:** 15-player array sorted by position + xP.

---

## Service 3: Squad Optimizer (`services/squad-optimizer` — FastAPI :8003)

### POST /transfers/suggest

**Request:**
```json
{
  "squad": [{"element": 101, "position": "FWD", "price": 145, "squad_id": 22}],
  "round": 3,
  "free_transfers": 2,
  "budget": 100
}
```

**Response:**
```json
{
  "suggestions": [
    {
      "out": {"element": 55, "name": "Kane", "xp": 3.1},
      "in": {"element": 101, "name": "Haaland", "xp": 6.4, "price": 145},
      "xp_delta": 3.3,
      "cost_pts": 0
    }
  ],
  "hit_cost": 0,
  "verdict": "Take the transfer — +3.3 xP net"
}
```

---

### POST /squad/validate

**Request:** `{"squad": [...]}`

**Response:**
```json
{
  "valid": true,
  "errors": []
}
```

Or:
```json
{
  "valid": false,
  "errors": ["Country limit exceeded: 4 Norway players (max 3 in group stage)"]
}
```

---

## Service 4: Live Data (`services/live-data` — Node.js :8004)

### GET /live

**Query:** `?round=3`

**Response:**
```json
{
  "matches": [
    {
      "home_team": "Norway",
      "away_team": "Mexico",
      "home_score": 2,
      "away_score": 0,
      "status": "FT",
      "kickoff": "2026-06-19T15:00:00Z",
      "source": "espn"
    }
  ],
  "round": 3,
  "cached_at": "2026-06-19T15:58:42Z"
}
```

---

## Web BFF Routes (existing, unchanged)

| Route | Handler | Notes |
|---|---|---|
| `GET /wc/players.json` | FIFA Fantasy proxy | 5min TTL |
| `GET /wc/rounds.json` | FIFA Fantasy proxy | 5min TTL |
| `GET /wc/squads_fifa.json` | FIFA Fantasy proxy | 30min TTL |
| `GET /api/rounds` | DB query | `wc.rounds` |
| `GET /api/players` | DB query | 1,484 players |
| `GET /api/teams` | DB query | 48 teams + `is_active` |
| `GET /api/projections?round=N` | DB query | sorted xP DESC |
| `GET /api/squad/suggest?variant=` | DB query | `wc.suggested_squad` |
| `POST /api/squad/from-screenshot` | Claude Haiku Vision | player name matching |
| `POST /api/transfers/suggest` | greedy advisor | `suggestTransfers()` |
| `GET /api/fdr?round=N` | DB query | FDR 1–5 per team |
| `GET /api/live?round=N` | ESPN + FIFA | live match data |
| `POST /api/chat` | **Proxies to ai-advisor** (new) | circuit-breaker fallback |

---

## BFF Circuit Breaker (server.ts addition)

```typescript
async function chatWithAIAdvisor(body: ChatRequest): Promise<Response> {
  try {
    const res = await fetch(`${AI_SERVICE_URL}/chat`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`ai-advisor ${res.status}`)
    return res  // pass SSE stream through
  } catch (err) {
    console.warn('[BFF] ai-advisor unreachable, using legacy handler:', err)
    return legacyChatHandler(body)
  }
}
```

`AI_SERVICE_URL` defaults to `http://localhost:8001` in dev, set via Render env var in prod.

---

## Model Tiering

| Node | Model | Reason |
|---|---|---|
| Router | `claude-haiku-4-5-20251001` | 4-class classification; ~50 input tokens; 73% cheaper than Sonnet |
| TransferAdvisor / CaptaincyAdvisor / ChipStrategist | `claude-sonnet-4-6` | Tool calls + structured reasoning required |
| KnowledgeAgent | No LLM call — pure retrieval (FAISS + NetworkX) | |
| Synthesizer | `claude-sonnet-4-6` | Complex output with CoT + JSON actions |
| Guardrails | No LLM call — pure Python (DB lookup + regex + substring check) | |

**Synthesizer prefill pattern** (forces JSON output, strips CoT before streaming):
```python
messages = [
    {"role": "system", "content": [cached_block, dynamic_block]},
    *state["messages"],
    {"role": "assistant", "content": "<thinking>"},  # prefill: model continues from here
]
raw = response.choices[0].message.content
_, _, answer = raw.partition("</thinking>")   # strip CoT — user never sees it
state["final_response"] = answer.strip()
```

---

## AgentState TypedDict (graph_state.py)

```python
class AgentState(TypedDict):
    messages: list[BaseMessage]        # conversation history
    squad_ids: list[int]               # user's current squad element IDs
    round_id: int                      # current fantasy round
    intent: str                        # 'transfer' | 'captain' | 'chip' | 'general'
    rag_context: str                   # top-5 player docs from FAISS
    graph_context: str                 # PropertyGraph traversal output
    squad_analysis: str                # per-player xP/FDR/stats summary
    agent_outputs: dict[str, str]      # keyed by node name
    final_response: str
    actions: list[dict]                # structured UI actions
    citations: list[str]               # grounding citations for response
    token_usage: dict                  # {input_tokens, output_tokens, cost_usd}
    index_staleness_hours: float       # from /health, logged to MLflow
```

---

## DB Schema Additions (migrate.py)

```sql
-- XGBoost projection columns
ALTER TABLE wc.projections ADD COLUMN IF NOT EXISTS xgb_xp REAL;
ALTER TABLE wc.projections ADD COLUMN IF NOT EXISTS ensemble_xp REAL;

-- pgvector extension (for future pgvector backend option)
CREATE EXTENSION IF NOT EXISTS vector;

-- Player embeddings table (optional: store alongside FAISS for pgvector queries)
CREATE TABLE IF NOT EXISTS wc.player_embeddings (
    element INTEGER PRIMARY KEY REFERENCES wc.players(element),
    embedding vector(384),
    document_text TEXT,
    built_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

*See [hld.md](hld.md) for architecture overview · [rag-design.md](rag-design.md) for retrieval design*
