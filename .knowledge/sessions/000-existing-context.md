# 000 — Existing Context Consolidation

_Consolidated from: CLAUDE.md · CONTEXT.md · docs/key-decisions.md · docs/ops.md · docs/sessions.md · docs/hld.md · docs/lld.md · docs/rag-design.md · docs/llmops.md · docs/security.md · wc-edge.md · wc-edge-prd.md · docs/adr/001–012_

_Date: 2026-06-19 (Session 49)_

---

## Decisions

### Squad / XI

**ADR 001 — Squad array ordering contract (Accepted)**
- Squad array is canonical sorted: GK → DEF → MID → FWD, then xP DESC within position.
- `setSquad()` is the only correct write path — it enforces normalization. Direct store mutations break the XI split.
- `getXI()` is O(n) pure; relies on this order. Never suggest storing XI/bench as separate arrays.
- `swapInSquad()` may exchange by index without resorting (valid swap preserves within-position order). Cross-position swaps must go through `setSquad()`.
- `normalizeSquad()` — call only on fresh loads (DB, screenshot, onboarding). Do NOT call after manual swaps (resets user intent).

**ADR 002 — Validation gate in squadValidator.ts (Proposed — not yet fully implemented)**
- `canAddPlayer(squad, candidate, phase, squadCost, budget)` is the single gate: position-cap + budget + country-limit.
- Country limit currently UI-enforced only (visual warning). Full server enforcement is deferred.
- Trigger to implement: country-limit bug report or FIFA rule change mid-tournament.
- Do not move validation into page components or Zustand store actions.

**ADR 003 — xP breakdown storage (Deferred)**
- xP breakdown is currently reverse-engineered in `PlayerProfileModal.tsx` from raw probability fields.
- Correct fix: store as JSONB `xp_breakdown` column in `wc.player_projections`, computed by engine at projection time.
- Deferred until Phase 2 post-tournament model work.
- Do not refine the frontend formula — fix is to store in DB.

**ADR 004 — Game rules as single source of truth (Accepted)**
- All WC 2026 Fantasy constants live in `web/src/config/gameRules.ts`.
- `engine/engine/config.py` mirrors them. Keep in sync manually.
- No page component or hook may define game rules inline.
- `FREE_TRANSFERS_BY_PHASE`: `{group:2, r32:6, r16:4, qf:4, sf:5, final:6}`.

**ADR 005 — In-memory rate limiter (Accepted for tournament duration)**
- `/api/chat`: 5/min + 25/day. `/api/from-screenshot`: 2/min + 5/day.
- State lost on dyno restart — known, accepted gap. Anthropic budget is $5 total; blast radius is small.
- Do not suggest Redis-backed or DB-backed rate limiter during tournament. Revisit post-July 19.

### Engine

**Blend activation** — `blend_live_observations()` checks `status='complete'` (lowercase). Bug where uppercase check caused zero-op was fixed in Session 46.

**Post-group FDR** — Hardcoded June 27 cron. `update_round_fdr()` generalises this to every completed round (ADR 012, Proposed).

**Two-phase engine** — `wc_ingest.py` (expensive: API calls, 100 req/day API-Football cap) + `wc_model.py` (free: pure math recompute). Skip ingest with `skip_apif=true` to save budget.

**StatsBomb field names** — `pass.shot_assist` (NOT `key_pass`). Tackles: `type.name === 'Duel'` + `duel.type.name === 'Tackle'`.

**`migrate.py` required on new DB instances** — adds `player_stats` table, bonus columns, `is_penalty_taker`. Engine crashes with `UndefinedColumn` if skipped.

### Live Scores

**Tier order** — Community API (dead for WC2026) → ESPN public scoreboard (primary, no key, no rate limit) → FIFA schedule fallback.

**ESPN URL** — `site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=YYYYMMDD`. Past days cached 1hr; today 60s.

**Round status** — `'playing'` not `'active'`. `useCurrentRound()` and `getCurrentRoundId()` accept both.

### Edge AI / Chat

**Actions block** — Claude appends ` ```actions\n[...]\n``` ` at end. Server regex-parses + strips, returns `{content, actions}`. Current actions: `set_captain`, `set_vice_captain`, `suggest_transfers`, `optimise_xi`.

**`max_tokens` is 400** — "≤120 tokens" reply limit must say "text only — actions block excluded".

**System prompt caching** — `cache_control: { type: 'ephemeral' }`. `max_tokens` reduced to 200 (ATROS, Session 32; later revised to 400 for actions).

**Fuzzy name matching** — `matchPlayer` does containment matching ("Haaland" matches "E. Haaland").

### Server / DB

**`matchPlayersByName` two-pass** — position-filtered first, falls back position-agnostic. Normalizes: FIFA truncation (`...`), diacritics (unaccent extension), Cyrillic `і→i`.

**Schema:** `wc` schema, `search_path=wc,public`. psycopg3: `options="-c search_path=wc,public"`. Node pg: append to connection string.

**FIFA squadId (1–48) ≠ squads_fifa.json id (43817+)** — teams table built from rounds.json.

### UI / Components

**Glassmorphism tokens** — CSS vars in `index.css` (`--glow-gold`, `--glow-cyan`, `--glow-card`). Tailwind `boxShadow` tokens in `tailwind.config.ts`. Tune globally, not per-component.

**`backdrop-blur` stacking context** — only works outside `overflow:hidden`. Pitch is unsafe. Safe: sidebar, topbar, bottom tab bar, chat bubbles, modals.

**`lockedElements` on `Pitch`/`PitchPlayerCard`** — optional `Set<number>`. `isLocked`: disabled, opacity-40, cursor-not-allowed, FT label replaces xP. Captain page uses it; Squad page does not.

**Swap eligibility** — GK position-locked. Outfield: `newDEF≥3 && newMID≥2 && newFWD≥1`.

**`eligibleElements` is an IIFE** — not `useMemo` (violates Rules of Hooks when after early returns).

**Brand colors** — WC gold `#E8B84B` · cyan `#00D4FF` · navy `#0C1D3E` · pitch-green `#2D7A4F` · body bg `#060D18` · surface `#0A1321` · cards `#0F1E31`. Never purple/violet.

### AI Advisor Architecture (Phase 1, Proposed)

**ADR 008 — LangGraph multi-agent (Proposed)**
- 6-node DAG: Router → [TransferAdvisor | CaptaincyAdvisor | ChipStrategist] → KnowledgeAgent → Synthesizer → Guardrails.
- Model tiering: Router → Haiku (73% cheaper, 4-class classification). Advisors + Synthesizer → Sonnet 4.6. KnowledgeAgent + Guardrails → no LLM (pure Python).
- `recursion_limit=10`, `MemorySaver` checkpointer. Replace with `RedisSaver` for multi-replica k8s.
- BFF circuit-breaker falls back to legacy direct-Claude handler if ai-advisor unreachable.
- Do not suggest CrewAI as replacement. Do not suggest a single general agent.

**ADR 006 — RAG with LlamaIndex + FAISS (Proposed)**
- Hybrid BM25 + semantic retrieval via `QueryFusionRetriever`. `DEFAULT_TOP_K = 3` (reduced from 5 in ATROS audit).
- Embedding: `all-MiniLM-L6-v2` (384-dim, CPU, zero per-call cost).
- FAISS local dev/CI; Weaviate Cloud prod. Abstract `VectorStoreBackend` ABC for swap transparency.
- Thread-safe rebuild: copy-on-write to `/tmp/faiss_new`, atomic swap. In-flight queries never see partial index.

**ADR 007 — GraphRAG with PropertyGraphIndex (Proposed)**
- 6 node types, 7 edge types. FACES edge carries `lambda_posterior` + `goals_conceded_pg`.
- Multi-hop traversal for captaincy/fixture queries.

**ADR 009 — XGBoost + MLflow governance (Proposed)**
- `TimeSeriesSplit` CV (not random split — prevents data leakage).
- Auto-promote to Production only if CV RMSE improves.
- Ensemble blend: `0.8×Bayesian + 0.2×XGBoost` early rounds → `0.6/0.4` from Round 3+.

**ADR 010 — litellm multi-model router (Proposed)**
- Claude Sonnet 4.6 → Azure GPT-4o → Vertex Gemini 1.5 Pro → Ollama Llama 3.1.
- `routing_strategy="least-busy"`, auto-retry on 429/503.

**ADR 011 — Prompt versioning + LangSmith (Proposed)**
- 4-dimension eval rubric: factual_accuracy, actionability, grounding, conciseness.
- 10% eval sample rate (ATROS: 100% doubles per-query cost; deterministic guardrails cover grounding already).
- Synthesizer CoT: prefill `<thinking>` block, strip before SSE stream.

**ADR 012 — Dynamic FDR Bayesian update (Proposed)**
- `update_round_fdr(conn, completed_round_id)` generalises post-group update to every completed round.
- Populates currently-NULL `goals_pg` / `goals_conceded_pg` in `wc.team_fdr`.
- Trigger chain: 00:00 UTC cron → blend → update_round_fdr → embed_all_players → Redis pub/sub → FAISS rebuild + GraphRAG refresh.
- No new DB columns needed (columns already exist as nullable REAL).
- Do not suggest real-time per-match updates — Bayesian model needs completed-match observations.

---

## Current Plan

### Tournament Status (as of 2026-06-19)
- Live since June 12. Round 2 active.
- 48 teams, 1,484 players, 8 rounds.
- Tests: 129 vitest + 49 pytest — all green.
- Engine crons: 04:00 / 18:00 / 00:00 UTC — all green.
- Post-group Bayesian FDR cron hardcoded June 27 06:00 UTC.

### Planned Phases (portfolio build — not yet started)

**Phase 1 — AI Advisor service + RAG** _(next priority)_
- `services/ai-advisor/`: LangGraph 6-node StateGraph, LlamaIndex FAISS hybrid retrieval, litellm multi-model router, streaming SSE `/chat` endpoint.
- BFF proxies `/api/chat` to new service with circuit-breaker fallback to legacy handler.
- Plan at: `C:\Users\shriy\.claude\plans\i-want-to-enhance-shiny-parnas.md`

**Phase 2 — GraphRAG**
- LlamaIndex PropertyGraphIndex (Player→Team→Fixture→Round→Stat).
- Prerequisite: Dynamic FDR must be live (FACES edges need `goals_conceded_pg`).

**Phase 3 — Guardrails + Prompt Engineering**
- Pydantic `AdvisorResponse` schema, player name hallucination check, prompt injection detection (7 regex patterns), versioned prompt files, DSPy few-shot optimizer.

**Phase 4 — XGBoost + MLflow**
- `train_xgb_model()` with `TimeSeriesSplit` CV in `wc_model.py`.
- MLflow model registry with auto-promote governance gate (RMSE).
- New columns: `xgb_xp`, `ensemble_xp` in `wc.projections`.

**Phase 5 — Docker + k8s**
- `docker-compose.yml` (5 services + Redis + MLflow).
- Helm charts for AKS/EKS/GKE.

**Phase 6 — LLMOps + fine-tuning scaffold**
- LangSmith tracing, OpenTelemetry, DSPy/LoRA scaffolds, CrewAI alternative.

### Immediate / Tournament Ops

- Mark eliminated teams `is_active = FALSE` after each knockout round (must run BEFORE next engine cron).
- Monitor API-Football budget (`engine/data/apif_budget.json`; current: day1=80, day2=16 of 100/day hard cap).
- Implement `update_round_fdr()` — prerequisite for Phase 2 GraphRAG; also improves live projection quality now.

---

## Known Constraints

### Infrastructure
- **Render free tier** — cold start on first request (~30s). Dyno restarts daily (resets in-memory rate limiter).
- **Neon free tier** — no expiry, low write IOPS. Avoid per-request DB writes.
- **API-Football** — 100 req/day hard cap. Track in `apif_budget.json`. Always use `skip_apif=true` for manual engine triggers unless explicitly needed.
- **Anthropic budget** — $5 total for tournament. One call per route when smoke-testing. Never iterate LLM calls to diagnose.

### Data
- `goals_pg` / `goals_conceded_pg` / `xg_created_pg` / `xgc_pg` in `wc.team_fdr` are currently NULL. `update_round_fdr()` will populate the first two; latter two remain NULL (need StatsBomb xG per match, not available from API-Football).
- FAISS index does not exist yet (Phase 1 prerequisite).
- `wc.projections` has no `xgb_xp` or `ensemble_xp` columns yet (Phase 4).
- `wc.player_projections` has no `xp_breakdown` JSONB column (Phase 2 / ADR 003 deferred).

### Rules / Game Logic
- Country limit is UI-enforced only — server does not reject invalid squads (ADR 002 Proposed).
- FT stepper `−` button uses U+2212 minus sign (not ASCII hyphen). Use `.nth(0)` in tests.
- `optimiseXI` tries 8 formations — skips if position count unavailable.
- `eligibleElements` must be an IIFE (not `useMemo`) — placed after early returns in Squad.tsx.

### Known Dead Ends
- Community WC 2026 API (`worldcup2026-api.vercel.app`) returns 404. Tier 1 always fails; ESPN is effective Tier 1.
- `navigate` Edge action was removed in Session 40 — do not re-add.
- `unaccent` extension must be installed on any new DB instance (already on Neon/fpledge).

### Deployment
- Render `startCommand`: `cd web && node node_modules/.bin/tsx server/server.ts`
- `server.ts` exports `app`; `listen()` is guarded by `NODE_ENV !== 'test'`.
- GitHub Actions repo: `ZaarkoEvilor791/wc-edge`.
- `AI_ENABLED=true` must be set as a Render env var.

---

## Open Questions

1. **Captain mid-round team-name matching** — ESPN `home_team`/`away_team` strings may not exactly match `teams.name` in DB. Not confirmed as a bug yet. Monitor; add fuzzy/abbr fallback if FT detection misfires.

2. **ADR 002 server-side enforcement** — When (if ever) should `/api/transfers/suggest` validate country limits server-side? Trigger: first country-limit bug report.

3. **`update_round_fdr()` timing** — Should it call after every blend run (04:00/18:00/00:00) or only at 00:00? Currently proposed to run after every blend, but there's a question of whether FDR should update based on partial-round data (not all group-stage teams play on the same day).

4. **FAISS local storage for Phase 1** — Path for index persistence: `data/faiss_index/` (gitignored). Need to confirm this path survives Render deploys (ephemeral filesystem) — may need to rebuild on startup from DB rather than loading from disk.

5. **`RedisSaver` vs `MemorySaver`** — For Phase 1 single-instance deploy on Render, `MemorySaver` is fine. If Phase 5 (k8s) deploys multiple ai-advisor replicas, must switch to `RedisSaver` for conversation state continuity.

6. **xP breakdown (ADR 003)** — Currently `PlayerProfileModal` reverse-engineers breakdown from projection fields. Post-tournament: store as JSONB in DB and remove the frontend formula. When does this become urgent enough to do mid-tournament?

7. **Dynamic FDR prerequisite for Phase 2** — GraphRAG FACES edges need `goals_conceded_pg`. This means Dynamic FDR must be implemented and run at least once before Phase 2 GraphRAG build begins.
