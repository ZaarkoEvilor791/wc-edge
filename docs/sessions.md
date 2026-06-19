# Session History

## Session 49 — ATROS cost audit applied to architecture docs

- **ATROS token optimisation audit** conducted on the AI Advisor architecture. Four concrete changes identified and applied across all docs:
- **Router → Haiku** (`claude-haiku-4-5-20251001` replacing Sonnet for the Router node). 4-class intent classification (~50 tokens) doesn't need Sonnet reasoning. 73% cheaper per call; ~150ms faster. Updated `lld.md` Model Tiering table, `hld.md` container diagram, `adr/008`.
- **Guardrails → pure Python** (no LLM call). All three guardrails checks are deterministic: player name validation = DB `SELECT`; citation grounding = substring match against rag_context; injection detection = regex. Guardrails node now runs in ~2–5ms at $0. Updated `hld.md`, `lld.md`, `llmops.md` OTel span tree, `security.md`, `adr/008`.
- **RAG top-k 5→3** (~40% fewer context tokens per retrieval). Structured player documents (80–100 tokens each) don't need 5 results — top result is usually definitive. Saves ~160 tokens per Advisor+Synthesizer call pair. Updated `rag-design.md`, `hld.md` NFR table, `adr/006`.
- **Eval sampling 10%** (was: every response). LLM-as-judge on 100% of responses doubles per-query cost. `actionability` and `grounding` are already enforced deterministically by Guardrails; the judge's value is in `factual_accuracy` and `conciseness`. `maybe_evaluate(sample_rate=0.10)` wrapper added to `llmops.md`. Updated `llmops.md`, `adr/011`.
- **Synthesizer CoT isolation** documented: prefill `<thinking>` block, strip before SSE stream — users and output token billing only see the final answer. Added to `lld.md` Model Tiering section.

## Session 48 — Phase 0: portfolio architecture docs

- **`README.md` created** — portfolio-grade root README with mermaid architecture diagram, tech stack badges (Python/FastAPI/LangGraph/LlamaIndex/litellm/XGBoost/MLflow/FAISS/Docker/k8s), AI/ML skills coverage table mapping each skill to a concrete implementation, full repo map, quick-start commands, WC rules summary, and ADR index.
- **`docs/hld.md` created** — C4-style system context + mermaid container diagram covering all 4 microservices + BFF + Data/MLOps/Engine layers. Includes AI advisor request data flow (8-step end-to-end trace), async engine pipeline (04:00/18:00/00:00 UTC cron triggers), NFR table (latency/cost/availability targets), and technology choice rationale table.
- **`docs/lld.md` created** — OpenAPI-style contracts for all 4 services (ai-advisor :8001, player-intelligence :8002, squad-optimizer :8003, live-data :8004). Full request/response schemas including SSE event format. `AgentState` TypedDict, BFF circuit-breaker code snippet, DB migration SQL for `xgb_xp`/`ensemble_xp`/pgvector.
- **`docs/rag-design.md` created** — Player document format (one doc per player including dynamic `goals_conceded_pg`), FAISS index config (384-dim IndexFlatIP), hybrid BM25+semantic retrieval via `QueryFusionRetriever`, `VectorStoreBackend` ABC (FAISS/Weaviate swap), thread-safe copy-on-write index rebuild, GraphRAG schema (6 node types + 7 edge types), multi-hop traversal examples, prompt two-block architecture, quality metrics table.
- **`docs/llmops.md` created** — MLflow experiment params/metrics/artifacts, XGBoost `Staging→Production` governance gate, cost tracking per conversation (`log_cost()` to MLflow), LangSmith auto-tracing setup, 4-dimension LLM-as-judge eval rubric (factual_accuracy/actionability/grounding/conciseness with weights), prompt versioning + A/B config in `prompt_config.yaml`, DSPy `xp_improvement_metric`, OpenTelemetry span tree, Grafana dashboard panels, LoRA fine-tuning scaffold.
- **`docs/security.md` created** — Threat model (6 threats × impact × likelihood), prompt injection detection (7 regex patterns), input sanitization (bleach), input length limits, 4-layer hallucination mitigation (RAG grounding + player name validation + citation grounding + bias audit), secret management (dev `.env` → Render env vars → Kubernetes Secrets), key rotation procedure, Redis sliding-window rate limiter, Kubernetes NetworkPolicy (ai-advisor accessible only from web-bff), responsible AI commitments (human-in-loop, transparency, content scope, audit trail).
- **ADR 006–012 created** in `docs/adr/`: RAG+FAISS (006), GraphRAG+PropertyGraph (007), LangGraph multi-agent (008), XGBoost+MLflow governance (009), litellm router (010), prompt versioning+LangSmith (011), dynamic FDR Bayesian update (012). Each includes decision, rationale, rejected alternatives, consequences, and "what not to re-suggest."

## Session 47 — microservices + AI portfolio architecture design

- **Full portfolio architecture designed** — wc-edge enhanced into a production AI data science portfolio demonstrating GenAI, RAG, GraphRAG, multi-agent AI, LLMOps, and ML modelling. All changes planned as additive; existing production paths unchanged during tournament.
- **4-service decomposition planned** — `services/ai-advisor/` (LangGraph + LlamaIndex + GraphRAG + litellm), `services/player-intelligence/` (Bayesian + XGBoost + MLflow), `services/squad-optimizer/` (MILP FastAPI), `services/live-data/` (ESPN proxy + Redis).
- **AI Advisor service designed** — LangGraph 6-node StateGraph (Router → [TransferAdvisor | CaptaincyAdvisor | ChipStrategist] → KnowledgeAgent → Synthesizer → Guardrails) with `recursion_limit=10` and `MemorySaver` checkpointer. Streaming SSE via `astream_events()` emits per-node status before final response.
- **RAG pipeline designed** — LlamaIndex VectorStoreIndex + FAISS (local/dev) with abstract `VectorStoreBackend` ABC (Weaviate as prod drop-in). Hybrid retrieval: BM25 + semantic via `QueryFusionRetriever`. Thread-safe FAISS rebuild: copy-on-write with `asyncio.Lock` + atomic swap.
- **GraphRAG designed** — LlamaIndex PropertyGraphIndex (Player→Team→Fixture→Round→Stat). Multi-hop traversal: "captain vs [team]?" → FACES edge → lambda_posterior + goals_conceded_pg → ranked players. Entity extractor resolves player/team names from user messages.
- **litellm multi-model router designed** — Claude Sonnet 4.6 primary → Azure OpenAI GPT-4o fallback → Vertex AI Gemini 1.5 Pro tertiary → Ollama Llama 3.1 local. `routing_strategy="least-busy"`, auto-retry on 429/503.
- **Guardrails designed** — Pydantic `AdvisorResponse` schema + player name hallucination check + prompt injection detection + citation grounding. NeMo Guardrails + Llama Guard 3 documented for content safety.
- **Dynamic FDR designed** — `update_round_fdr()` generalises the existing post-group Bayesian update (`wc_model.py:392-423`) to run after EVERY completed round, not just group→KO. Populates currently-NULL `goals_pg`/`goals_conceded_pg` columns. Feeds into GraphRAG FACES edges and RAG player profile documents via Redis `round.complete` event chain.
- **XGBoost ensemble designed** — `train_xgb_model()` using `TimeSeriesSplit` (temporal, not random split, prevents data leakage). Ensemble blend: `0.8×Bayesian + 0.2×XGBoost` early rounds → `0.6/0.4` from Round 3+. MLflow governance gate: auto-promotes to Production only if CV RMSE improves.
- **LLMOps designed** — LangSmith auto-traces all LangGraph runs. 4-dimension eval rubric: factual accuracy, actionability, grounding, conciseness. DSPy `xp_improvement_metric` verifiable against next-round actuals. Cost tracking (`cost_usd`) per conversation logged to MLflow.
- **Docker + k8s designed** — `docker-compose.yml` (5 services + Redis + MLflow). Helm charts for AKS/EKS/GKE with HPA, NetworkPolicy, PodDisruptionBudget, PVC for FAISS index.
- **6 new ADRs written** (ADR 006–011) + ADR 012 (dynamic FDR). Plan at `C:\Users\shriy\.claude\plans\i-want-to-enhance-shiny-parnas.md`.

## Session 46 — blend bug fix + Edge AI context plan

- **`blend_live_observations` case-sensitivity bug fixed** — `engine/engine/wc_model.py:509` checked `status = 'COMPLETE'` but DB stores `'complete'`. Blend returned `rounds_played=0` and silently skipped on every run since tournament start. Fixed to lowercase. Manually triggered engine workflow post-fix: 11,872 projections blended (1,484 players × 8 rounds) with Round 1 actual FIFA Fantasy avgPoints at 23% obs weight.
- **Edge AI context enrichment — planned** — Elite product team review surfaced two root causes: (1) static system prompt with no live data, (2) `squad: number[]` dropped at `server.ts:399`. Plan: two-block system prompt (static 2048+ token cached prefix + dynamic `<tournament>`+`<squad_analysis>` block); `getCurrentRound()` server-side cached hourly; `getSquadContext()` per-request DB join; `buildSquadAnalysis()` formatter; anti-hallucination constraints blocking Edge from requesting points screenshots. Plan file: `C:\Users\shriy\.claude\plans\why-does-llm-not-tidy-teapot.md`.

## Session 44 — Star ratings + Captain kickoff timing

- **`playerStarRating(xp, lowSample)`** added to `utils/squad.ts` — tiers: ≥6.0=★5 (gold), ≥4.5=★4 (cyan), ≥3.0=★3 (slate), `low_sample` players capped at ★3. Returns 0 for 1★/2★ (no badge rendered).
- **Star badges on all player surfaces** — compact `★N` pill top-left on `PitchPlayerCard` (C/VC stay top-right); star glyph rows above xP in `BrowseAllModal` (all 3 modes), `Transfers` SquadList, `Squad` list, and `Captain` list.
- **Captain kickoff timing** — `Captain.tsx` previously locked players only after `status='finished'`. Now builds `matchKickoffs` map (squad_id → `{ kickoff: Date, status }`) from ESPN live data and computes `lockedElements` using kickoff timestamp (locks when `kickoff <= now` OR `status='live'/'finished'`). Fallback to `playedElements` when ESPN has no match data for a team.
- **Kickoff chips in Captain list** — unplayed players show `kicks off HH:MM` (slate, >6h), `kicks off in Xh Ym` (amber, <6h), or `Live` badge (green) inline in the position·abbr line. A 30s `now` state ticker keeps chips fresh between 60s live data polls.
- **Tournament monitoring** — engine crons all green. After day 2 apif ingest: 1,484 players, 578 with club stats. Top xP: Salah 8.66, Ronaldo 7.89, Gyökeres 7.56. `blend_live_observations` waiting for first round to complete.

## Session 42 — Live round awareness + Captain page redesign

- **Screenshot fill fix** — `OnboardingModal.handleConfirmSquad` previously stored only the matched players (e.g. 10 of 15), leaving squad short and cost inconsistent. Now calls `fillSquadFromSuggested(matched, suggestedData?.squad_json ?? [])` to pad to 15 with top-xP picks before normalizing. `useSuggestedSquad()` added to `ModalContent`.
- **Live round awareness** — `useRounds()` gains `refetchInterval: 2 * 60_000`. Round status changes (e.g. cron writes `status='playing'`) now detected within 2 min without user navigation. `useProjections(round)` + `useTeamFdr(round)` cascade automatically via React Query key change.
- **`useLive(round)` extracted** — previously inlined in `Live.tsx`. Now exported from `useWC.ts`. `Live.tsx` switches to the shared hook; `Captain.tsx` uses it for mid-round swap detection.
- **Captain page redesign** — full rewrite. Pitch view (reuses `Pitch` + `PitchPlayerCard`) is now the primary UI. Tap any unplayed player on pitch to set captain (C badge). Ranked list remains below pitch for xP/FDR/variance context and VC assignment. Deadline countdown badge replaced by "Mid-round swap" badge when `currentRound.status === 'playing'`.
- **Mid-round swap mode** — when round is `'playing'`, cross-references ESPN live data with squad players' team name. Players whose team has a `finished` match today: dimmed (opacity-50), FT badge replaces xP, button disabled. All others are captainable. Graceful fallback: if `useLive()` returns no data, all players are swappable.
- **`lockedElements` prop on `Pitch`/`PitchPlayerCard`** — new optional `Set<number>`. `isLocked` on card: `disabled`, `opacity-40`, `cursor-not-allowed`, FT label replaces xP. Backward-compatible; Squad page unaffected.
- **Live page** — captain banner removed (superseded by Captain page mid-round mode). `useSquadStore` import removed from `Live.tsx`.

## Session 41 — Architecture deepening

- **`normalizeSquad()`** extracted to `utils/squad.ts` — named utility for sorting squad by (position, xP DESC). Used in Squad.tsx init + `handleAdd`, and OnboardingModal `handleBuildWithVariant` + `handleConfirmSquad`. Callers use it on fresh loads; swaps bypass it to preserve user intent. See ADR 001.
- **`canAddPlayer()`** added to `squadValidator.ts` — single gate for position-cap + budget + country-limit. Replaces inline checks in Squad.tsx `handleAdd` and BrowseAllModal add-mode. BrowseAllModal now also enforces country limits (was missing before). `squadPosCounts` useMemo removed from BrowseAllModal (no longer needed). See ADR 002.
- **`FREE_TRANSFERS_BY_PHASE`** moved from `Transfers.tsx` to `config/gameRules.ts`. See ADR 004.
- **`CONTEXT.md`** + **`docs/adr/`** created — domain glossary and 5 ADRs.
- **`CLAUDE.md`** split into CLAUDE.md + `docs/ops.md` + `docs/sessions.md` + `docs/key-decisions.md`.
- **Tests:** 129 vitest (up from 118) — 5 new `normalizeSquad` tests, 6 new `canAddPlayer` tests.

## Session 40

- **Squad integrity hardened** — ghost players (null `element`) can no longer corrupt squad. `setSquad` strips nulls. `BrowseAllModal` add mode and `Squad.handleAdd` block over-limit adds. `Transfers.tsx` derives `safeSquad` at top of component.
- **Edge `navigate` action removed** — Edge gives text directions only. `suggest_transfers`/`optimise_xi` still navigate programmatically.
- **JARVIS system prompt** — tactical analyst persona. ~80 tokens shorter. `navigate` removed from `actions_guide`.
- **3 UX fixes** — Boosters tips expanded by default; SwapCard stacks vertically on mobile; PlayerProfileModal scroll area.

## Session 39

- **Live page fixed** — 3 compounding bugs: `'playing'` vs `'active'` round status; `wc_run.py` status normalization; ESPN fallback as Tier 1.5.
- **Live page shows all past scores** — ESPN tier fetches every day from round's `start_date`. Past days cached 1hr; today 60s.
- **Sci-fi visual overhaul** — glassmorphism/glow aesthetic. Cyan `#00D4FF`, brighter gold `#E8B84B`, CSS glow variables, Tailwind boxShadow tokens, `scan`/`shimmer` keyframes, 40px cyan grid on body bg.

## Session 38

- **Mobile UX overhaul** — BottomTabBar (`md:hidden`), FDR inline badge, onboarding descriptions, touch targets ≥44px, squad empty state CTAs.
- **Edge `show_tip` action** — gold guide cards in chat after page navigation. `__TIP__:<page>` sentinel → `PageGuideCard`. Content in `pageGuides.ts`.
- **`is_penalty_taker` migrated to Neon** — `engine/migrate.py` run; 32 penalty takers seeded.

## Session 37

- **Model accuracy fixes** — 3 bugs fixed; squad xP jumped 53.52 → 74.50. Missing scoring events (MID chances/tackles, FWD SOT). GK xG leak zeroed. Start rate fix with price-scaled default.
- **25 penalty takers seeded** — `is_penalty_taker=TRUE` on top PKers. Adds `PENALTY_XG_PER90=0.003` to xg90.
- **`wc.player_stats` bonus columns** — `tourn_chances90`, `tourn_tackles90`, `tourn_sot90`.
- **Result:** Haaland 6.16 / Mbappé 5.95 / Kane 5.78 / Yamal 5.71 xP R1.

## Session 36

- **Edge actions fixed** — model was dropping action JSON due to token budget. Fixed by excluding actions block from "≤120 tokens" limit. All 5 action types given concrete JSON examples.
- **Chat messages persisted** — `chatMessages` + `chatChipsUsed` added to `appStore` `partialize`.
- **`set_captain` name matching fixed** — fuzzy containment helper (`matchPlayer`).
- **Ghost squad-lock removed** — Edge can't claim to "lock" a squad.

## Session 35

- **Agentic Edge** — actions block in chat: `navigate`, `set_captain`, `set_vice_captain`, `suggest_transfers`, `optimise_xi`. Server parses + strips it.
- **Screenshot upload in chat** — camera icon → base64 → `/api/squad/from-screenshot`.
- **Chat persistence** — `chatMessages` in `appStore` (non-persisted at this point; made persistent in S36).

## Session 34

- **Squad variant presets** — optimizer produces 3 variants: `max_xp`, `value`, `differential`. DB PK changed to `(round, variant)`.
- **3-step onboarding wizard** — Style → Budget → Risk → fetches pre-computed variant.
- **DB migration** — Render Postgres (expired) → Neon free tier.

## Session 33

- **`_sync_round_statuses()`** — every engine run fetches FIFA `rounds.json` and UPSERTs status to DB. Non-fatal.
- **00:00 UTC cron** — closes post-match blending gap.
- **Captain resync fix** — captain reassigns to highest-xP XI player when not in new squad's XI.

## Session 32

- **Architecture deepening** — 5 refactors: `getEligibleSwapTargets` extracted; `buildScoringContext` data-driven; `ROUTES` const shared; `matchPlayersByName` returns typed result; `screenshotService.ts` extracted.
- **ATROS optimization** — `max_tokens 1024→200`; system array with ephemeral cache_control.

## Session 31

- **Data-driven booster recommendations** — 5 pure `rec*` functions. `useQueries` for all 8 rounds. Loading skeleton.
- **Multi-round projection fetch** — React Query caches warm from Captain/Squad pages.

## Session 30

- **C/VC auto-assign fix** — captain picks from `getXI()` result (XI only).
- **Pitch card-to-card swap** — SwapDrawer deleted. Tap card → profile modal → Sub In/Out → swap mode.
- **Boosters page** — 5 chip cards with state tracking in `squadStore`.
