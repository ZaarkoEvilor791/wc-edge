# wc-edge Project Guide

**Project:** FIFA WC 2026 Fantasy Companion Tool — squad builder, transfer advisor, captain picker, live tracker, Edge AI advisor.

**Deadline:** June 11, 2026. Tournament starts June 12, 2026.

**Production URL:** `https://wc-edge.onrender.com`

**Local dev:** frontend `http://localhost:5173`, Express API `http://localhost:3001`

**Database:** Neon Postgres (`neondb`), `wc` schema. Free tier, no expiry. External URL in `engine/.env` and `web/.env`. Render web service env var `DATABASE_URL` must also point to Neon.

---

## Current State (Session 35 complete)

All 6 pages built, polished, and live on production. TypeScript clean. GitHub Actions working.

**Tests:** 118 vitest (6 files) + 42 pytest — all green.

**DB:** 1,481 players · 8 rounds · 11,848 projections · 384 team_fdr rows · 3 suggested_squad rows (round 1: max_xp £98.0m 79.91xP · value £98.0m 79.91xP · differential £95.6m 79.70xP)

**apif budget:** `day1_used: 80, day2_used: 16` — both runs complete.

**DB state:** `wc.teams` — exactly 48 rows (squad_id 1–48). `is_active BOOLEAN DEFAULT TRUE` column live. `wc.suggested_squad` PK is now `(round, variant)`.

**DB migrated to Neon:** Free Render Postgres expired July 3. Migrated to Neon free tier (no expiry) in Session 34. All 6 tables + 3 suggested_squad variants confirmed. Update `DATABASE_URL` in Render web service env vars to the Neon URL.

**Render deploy:** `startCommand` = `cd web && node node_modules/.bin/tsx server/server.ts`

**Render env vars:** `AI_ENABLED=true` confirmed set.

**GitHub Actions:** `.github/workflows/engine.yml` live.
- Crons: 04:00 UTC (apif + model + blend) · 18:00 UTC (model + blend only) · **00:00 UTC (model + blend, post-match)** · June 27 06:00 UTC (post-group Bayesian FDR update)
- `workflow_dispatch` inputs: `skip_apif` (default false), `post_group` (default false)

---

## Session 35 — What was shipped

- **Agentic Edge assistant** — Edge can now take app actions from chat. System prompt teaches Claude to append a ````actions` JSON block. Server parses + strips it, returns `{content, actions}`. Client executes actions via `executeActions()` in `Assistant.tsx`.
  - Actions: `navigate` (any page), `set_captain`, `set_vice_captain`, `suggest_transfers`, `optimise_xi`.
  - `optimise_xi` calls `optimiseXI(squad)` from `utils/squad.ts`, updates `squadStore`, navigates to `/squad`.
  - `max_tokens` bumped 200 → 400 to accommodate action JSON alongside reply text.
- **Screenshot upload in chat** — Camera icon button in chat input bar. File picker → base64 → `/api/squad/from-screenshot` → `setSquad(matched)`. Success/failure injected as assistant message. Unmatched names wired to `setUnmatchedNames`. Respects existing 2/min + 5/day rate limit.
- **Chat persistence** — `chatMessages` + `chatChipsUsed` moved to `appStore` (non-persisted slice); survive navigation, clear on reload.
- **Token efficiency** — Action prompt addition (~80 tokens) is part of cached system message; marginal cost after first call ~8 tokens. Estimated $0.0003/day at 25 calls/day.

## Session 34 — What was shipped

- **Squad variant presets** — optimizer now produces 3 variants per round: `max_xp` (raw xP, current default), `value` (price-penalised objective: `xp - 0.08 * price`), `differential` (nation cap=2, forces squad spread). `wc_run.py` calls optimizer 3×. DB `wc.suggested_squad` PK changed to `(round, variant)`.
- **`/api/squad/suggest?variant=`** — server + db.ts wired to accept `max_xp | value | differential`; unknown values fall back to `max_xp`.
- **3-step onboarding wizard** — "Build a new team" in `OnboardingModal.tsx` now opens a chip wizard: Style (Attacking/Balanced/Defensive) → Budget (Premium/Balanced/Value) → Risk (Safe/Balanced/Differential). Maps answers to a variant via `pickVariant(budget, risk)`, fetches pre-computed squad, zero LLM calls.
- **DB migration** — migrated from expiring free Render Postgres to new free instance. Updated `DATABASE_URL` in `engine/.env`, `web/.env`, and Render env vars.
- **Tests** — `engine/tests/test_optimizer.py` (9 pytest) + `web/src/__tests__/onboardingWizard.test.ts` (6 vitest).

## Session 33 — What was shipped

- **`_sync_round_statuses()` in `wc_run.py`** — every engine run now fetches FIFA Fantasy `rounds.json` and UPSERTs round status changes to DB before running the model. Non-fatal: warns and proceeds if FIFA API unreachable. Fixes: `blend_live_observations` now activates correctly on manual `--skip_apif` triggers and when 04:00 apif run fails.
- **00:00 UTC cron** added to `engine.yml` — closes the post-match blending gap. WC matches end ~23:00 UTC; previously the next blend was at 04:00 UTC (+5h lag). Now blending happens within ~1h of match completion.
- **Captain resync fix** — `OnboardingModal.tsx` + `Squad.tsx`: captain reassigns to highest-xP XI player when existing captain is not in the new squad's XI (not just when `captain === null`). Fixes captain showing on bench after a squad resync.

## Session 32 — What was shipped

- **Architecture deepening** — 5 candidates implemented, 32 new vitest added.
  - `getEligibleSwapTargets(xi, bench, source)` extracted from Squad.tsx IIFE into `utils/squad.ts` (pure, tested). IIFE wrapper preserved to avoid Rules of Hooks violation.
  - `buildScoringContext()` rewritten as data-driven — reads all values from `SCORING` object programmatically. Exported as `_buildScoringContext` for tests.
  - `web/src/config/routes.ts` — single `ROUTES` const shared by `wcApi.ts` and `server.ts`. No more string literals for API paths.
  - `matchPlayersByName` now returns `PlayerMatchResult | null` with `method: 'positioned' | 'fallback'` discriminant. `low_sample` now reads from DB via COALESCE instead of hardcoded `false`. Round param dynamic (was hardcoded `round = 1`).
  - `web/server/services/screenshotService.ts` extracted — `processSquadScreenshot()`, `isAllowedMime()`, `ScreenshotParseError`, `ScreenshotEmptyError`. Route handler reduced from 70 lines to ~10.
  - ATROS token optimization: `/api/chat` `max_tokens: 1024 → 200`; `system` changed to array with `cache_control: { type: 'ephemeral' }` for Anthropic prompt caching.
- **New test file:** `web/src/__tests__/screenshotService.test.ts` (9 tests).

## Session 31 — What was shipped

- **Data-driven booster recommendations** — `Boosters.tsx` rewritten. 5 pure `rec*` functions compute "Best round to play" client-side from squad xP projections + FDR. No new API endpoints, zero AI credits on page load.
  - `recMaxCaptain`: round where max XI player xP is highest
  - `rec12thMan`: round where best non-squad player (budget-filtered, active team) has highest xP
  - `recQualBooster`: R32+ round where most XI starters' teams are active
  - `recCSShield`: R32+ round where most GK/DEF face FDR ≥ 4
  - `recWildcard`: immediate flag if ≥2 eliminated players in squad
- **Multi-round projection fetch** — `useQueries` for all 8 rounds (React Query caches; warm hits from Captain/Squad pages).
- **Card layout** — recommendation block leads (gold accent border), effect 1 line, strategy tip collapsed by default.
- **Loading skeleton** while projections fetch.
- **R32-only chips** (Qual Booster, CS Shield) locked + no rec block until `currentRoundId > 3`.

## Session 30 — What was shipped

- **C/VC auto-assign fix** — `Squad.tsx` useEffect + `OnboardingModal.tsx`: captain now picked from `getXI()` result (XI only), with `captain === null` guard to preserve existing picks on re-sync.
- **`activeCaptain` fallback** — now sorts `xi` not `displaySquad`, so bench GK can't steal the badge on reload.
- **Pitch card-to-card swap** — `SwapDrawer` component deleted. Tap pitch card → profile modal. Tap Sub In/Out in modal → swap mode activates (`swapSource` state). Gold ring = selected, green glow = eligible, 40% dim = ineligible. Cancel chip below pitch. `handleSwap(source, replacement)` takes explicit args. `eligibleElements` is an IIFE (not `useMemo`) — must stay below early returns or Rules of Hooks fires.
- **Boosters page** (`/boosters`, RequireSquad) — 5 chip cards: Wildcard, Maximum Captain, 12th Man, Qualification Booster, Clean Sheet Shield. Each has effect, availability, strategy tip, Available → Active → Used state. R32+ chips locked until `currentRoundId > 3`.
- **`squadStore.ts`** — added `boosterStates: Record<string, BoosterState>` + `setBoosterState`. Auto-persisted.
- **Sidebar** — Boosters nav item (lightning bolt icon) between Captain and Live.
- **Squad page** — active booster gold banner below budget bar.
- **Nav order:** Assistant → Squad → Transfers → Captain → Boosters → Live.

---

## Tournament Operations Playbook

This is the most important section during the tournament (June 12 – July 19, 2026). What's automated vs. manual, and what to watch.

### Fully Automated (GitHub Actions cron)

| Cron | UTC time | What runs | Notes |
|---|---|---|---|
| Daily engine | 04:00 UTC | `wc_ingest` (apif) + `wc_model` + `blend_live_observations` | Fetches overnight match stats, rebuilds projections |
| Evening refresh | 18:00 UTC | `wc_model` + `blend_live_observations` only | No apif call (saves budget) |
| Post-match blend | 00:00 UTC | `wc_model` + `blend_live_observations` only | Catches rounds completing ~23:00 UTC; reduces lag to <1h |
| Post-group FDR | June 27 06:00 UTC | `wc_run --post-group` | Bayesian FDR recalibration after group stage ends |

**Round status is now auto-synced on every engine run** — `_sync_round_statuses()` in `wc_run.py` fetches FIFA's `rounds.json` and updates `wc.rounds.status` before running the model. `blend_live_observations` activates automatically once FIFA marks a round `COMPLETE`. No manual DB update needed.

### Manual Tasks — You Must Do These

**1. Mark eliminated teams after each knockout round**

After teams are eliminated, run this SQL directly against the DB (use Render dashboard → fpledge DB → query editor, or connect via `engine/.env` `DATABASE_URL`):

```sql
-- After each knockout round — replace abbrs with actual eliminated teams
UPDATE wc.teams SET is_active = FALSE WHERE abbr IN ('XXX', 'YYY');
-- Verify:
SELECT abbr, is_active FROM wc.teams ORDER BY is_active DESC, abbr;
```

Teams must be marked `is_active = FALSE` before the next engine cron runs, otherwise projections include them. Timeline:
- R32 (round of 32): 24 teams eliminated
- R16: 8 more eliminated  
- QF: 4 more eliminated
- SF: 2 more eliminated

**2. Trigger engine manually if projections go stale**

Projections can go stale if: match data arrives late, apif budget exhausted, cron fails silently.

```bash
# Standard refresh (model + blend, no apif call)
gh workflow run engine.yml --repo ZaarkoEvilor791/wc-edge -f skip_apif=true

# Full refresh including apif scrape
gh workflow run engine.yml --repo ZaarkoEvilor791/wc-edge

# Post-group FDR recalibration (after group stage ends)
gh workflow run engine.yml --repo ZaarkoEvilor791/wc-edge -f post_group=true
```

Check GitHub Actions status: `gh run list --repo ZaarkoEvilor791/wc-edge --workflow engine.yml`

**3. Monitor API Football budget**

Hard cap: 100 requests/day. Check `engine/data/apif_budget.json` before triggering manual runs with apif enabled. The 04:00 UTC cron uses apif; 18:00 UTC does not.

```bash
cat engine/data/apif_budget.json
# {"day1_used": 80, "day2_used": 16, ...}
```

If budget is near 100, always pass `-f skip_apif=true` on manual triggers.

### What to Watch

| Signal | How to check | Action |
|---|---|---|
| Projections look stale (xP not updating after games) | `/api/projections?round=N` — check `computed_at` on suggested_squad | Trigger manual engine run |
| Eliminated team still showing in Transfers pool | `/api/teams` — check `is_active` | Run `UPDATE wc.teams SET is_active = FALSE WHERE abbr = '...'` |
| `low_sample` badges on screenshot players | `/api/squad/from-screenshot` response — check `low_sample` field | Fixed in Session 32; reads from DB via COALESCE. If broken, check round param in `matchPlayersByName` |
| blend not activating after round completes | `SELECT id, status FROM wc.rounds ORDER BY id` — check status | Now auto-synced by `_sync_round_statuses()` on every run. If still wrong, check FIFA API reachability from GH Actions |
| Boosters rec blocks wrong round | Boosters page "Best round" card | Check `recMaxCaptain` etc. — pulls from `useProjections` React Query cache |
| Engine cron failed | GitHub Actions tab or `gh run list` | Check logs, re-trigger |
| Render dyno sleeping (cold start) | First load slow | Normal on free tier; no action unless >30s |

### Budget / Phase changes

When a new knockout phase starts, the budget increases to £105m. This is auto-detected by `wc_run.py` via the round stage. Country limits also loosen per phase — handled in `squadValidator.ts` via `roundPhase()`. No manual action needed.

---

## Next Session Priorities

1. **Tournament ops (ongoing)** — mark eliminated teams after each round, monitor engine crons. Round status now auto-syncs; no manual DB update needed.

2. **Screenshot upload e2e** — test `/api/squad/from-screenshot` with a real FIFA screenshot. The `low_sample` field now reads from DB correctly (Session 32 fix).

3. **Phase 2 (post-tournament)** — StatsBomb tackles + key passes → xP model.

---

## How to Run

```bash
# Frontend + API server
cd web && npm run dev    # Express :3001 + Vite :5173

# Tests
cd web && npm test                        # 80 vitest
cd engine && py -m pytest tests/ -v       # 33 pytest

# Engine (Windows PowerShell)
cd engine && $env:PYTHONUTF8=1
py -m engine.wc_run                       # model + optimizer
py -m engine.wc_run --post-group          # post-group FDR update
py -m engine.wc_ingest --source apif --day 2
```

**env files (gitignored):** `engine/.env`: `DATABASE_URL` + `API_FOOTBALL_KEY` · `web/.env`: `DATABASE_URL` + `ANTHROPIC_API_KEY`

---

## Architecture

```
engine/
├── engine/
│   ├── wc_ingest.py     FIFA Fantasy + StatsBomb + API-Football
│   ├── wc_model.py      Bayesian xG/xA + FDR → projections; blend_live_observations()
│   ├── wc_optimizer.py  HiGHS MILP → suggested_squad
│   ├── wc_run.py        Orchestrator: auto-detects round+budget, --post-group flag
│   ├── db.py            psycopg3 pool, search_path=wc,public
│   └── config.py        scoring constants
├── tests/test_model.py  33 pytest
└── data/                sb_cache.json, name_overrides.json, apif_budget.json

web/
├── server/
│   ├── server.ts        13 routes; exports `app`; listen guarded by NODE_ENV
│   ├── db.ts            pg.Pool, all query functions
│   └── services/transferAdvisor.ts  greedy suggestTransfers()
└── src/
    ├── config/gameRules.ts     POS_REQUIRED, POS_COUNT, POS_ORDER, TOTAL_ROUNDS, SCORING
    ├── domain/squadValidator.ts validateSquad(), roundPhase(), COUNTRY_LIMIT
    ├── utils/squad.ts          getXI(), swapInSquad(), optimiseXI(), fillSquadFromSuggested()
    ├── store/appStore.ts       sidebar + onboarding + squadViewMode (Zustand + persist)
    ├── store/squadStore.ts     squad[], captain, viceCaptain, formationCounts, boosterStates (Zustand + persist)
    ├── hooks/useWC.ts          React Query hooks
    ├── components/shared/      Pitch, PitchPlayerCard, PlayerProfileModal,
    │                           OnboardingModal, BrowseAllModal, EmptySlotCard,
    │                           UnmatchedBanner, RoundXpChart, StatCard, Spinner, Logo
    └── pages/                  Assistant, Squad, Transfers, Captain, Boosters, Live
```

---

## Pages Summary

| Page | Route | Guard | Key feature |
|---|---|---|---|
| Assistant | / | none | Edge AI, starter chips, squad context |
| Squad | /squad | none | Pitch + list view, card-to-card swap, Optimise XI, budget bar |
| Transfers | /transfers | RequireSquad | Greedy suggest, Accept/Pass/Undo, hit verdict, Browse All |
| Captain | /captain | RequireSquad | Ranked list, VC button, FDR badge, deadline countdown |
| Boosters | /boosters | RequireSquad | 5 chip cards, strategy tips, Available/Active/Used state |
| Live | /live | none | Match cards, captain banner, stale fallback |

---

## API Routes

| Route | Notes |
|---|---|
| GET /wc/players.json | FIFA Fantasy proxy, 5min TTL |
| GET /wc/rounds.json | FIFA Fantasy proxy, 5min TTL |
| GET /wc/squads_fifa.json | FIFA Fantasy proxy, 30min TTL |
| GET /api/rounds | DB rounds |
| GET /api/players | All 1,481 players |
| GET /api/teams | Teams + isActive flag |
| GET /api/projections?round=N | Sorted xP DESC |
| GET /api/squad/suggest | Pre-computed suggested_squad |
| POST /api/squad/from-screenshot | Claude Haiku Vision → matched players |
| POST /api/transfers/suggest | Greedy, {squad, round, freeTransfers} |
| GET /api/fdr?round=N | FDR 1–5 per team |
| GET /api/live?round=N | Community API; falls back to FIFA schedule |
| POST /api/chat | Edge AI, {messages, squadNames?} |

---

## Deployment

```bash
gh workflow run engine.yml --repo ZaarkoEvilor791/wc-edge
gh workflow run engine.yml --repo ZaarkoEvilor791/wc-edge -f post_group=true
```

Render auto-deploys on `main` push. `startCommand` = `cd web && node node_modules/.bin/tsx server/server.ts`.

---

## WC Fantasy Rules

| Rule | Detail |
|---|---|
| Squad | 15 players: 2 GK / 5 DEF / 5 MID / 3 FWD |
| Budget | £100m group stage → £105m from R32+ |
| Country limit | Max 3 group · R32→4 · R16→5 · QF→6 · SF/F→8 |
| Transfers | Group: 2 free/MD · R32: unlimited · R16/QF: 4 · SF: 5 · Final: 6 |
| Extra transfer | −3 pts each |
| Captain | 2× points; VC auto-gets 2× if captain plays 0 min (advisory only — set on FIFA website) |

---

## Scoring Constants

```python
GOAL_PTS = {1: 9, 2: 7, 3: 6, 4: 5}   # GK/DEF/MID/FWD
CS_PTS   = {1: 5, 2: 5, 3: 1, 4: 0}
ASSIST_PTS = 3
APPEARANCE_FULL = 2   # >= 60 min
APPEARANCE_PART = 1   # < 60 min
SAVES_PER_PT = 3
YELLOW_CARD = -1; RED_CARD = -2; SCOUTING_BONUS = 2
```

Single source of truth: `src/config/gameRules.ts` → mirrored in `engine/config.py`. `buildScoringContext()` in `server.ts` reads from `SCORING` — never hardcode.

---

## Brand & Design

WC gold accent `#E8B84B` · navy `#0C1D3E` · pitch-green `#2D7A4F` · body bg `#060D18` · surface `#0A1321` · cards `#0F1E31`. Never use purple/violet.

---

## Key Decisions

- **getXI is array-order based** — first N of each position = XI. Pre-sort xP on DB load; swaps exchange array positions. `getXI(players, posCount?)` second arg overrides default POS_COUNT.
- **formationCounts in squadStore** — persisted `{DEF,MID,FWD}`, default `{4,4,2}`. Always pass `{ GK:1, ...formationCounts }` to `getXI` in Squad.tsx.
- **optimiseXI tries 8 formations** — 4-4-2, 4-3-3, 3-5-2, 3-4-3, 5-3-2, 5-4-1, 4-5-1, 5-2-3. Skips if position count unavailable.
- **Squad corrupt check is duplicates-only** — `new Set(elements).size !== squad.length`. Partial squads render with EmptySlotCard gaps.
- **BrowseAllModal two modes** — OUT→IN (`initialOut` set): position-locked immediate confirm. IN→OUT: two-step browse.
- **Transfers squad list is primary UI** — tap player → OUT→IN via `BrowseAllModal(initialOut)`. Smart suggest is secondary. Browse All is tertiary link.
- **Server up to 6 transfer suggestions** — `freeTransfers` is badge/hit threshold only, not loop limit.
- **LLM rate limits in-memory** — resets on dyno restart. `/api/chat`: 5/min + 25/day. `/api/screenshot`: 2/min + 5/day.
- **Edge agentic actions** — `/api/chat` system prompt instructs Claude to append ````actions\n[...]\n``` ` at end of reply when user requests an action. Server regex-parses + strips it, returns `{content, actions}`. `executeActions()` in `Assistant.tsx` handles: `navigate`, `set_captain`, `set_vice_captain`, `suggest_transfers`, `optimise_xi`. Pure-text replies return `actions: []`. `max_tokens` is 400 (was 200) to fit action JSON.
- **Screenshot upload in chat** — camera icon in Assistant input bar. FileReader → base64 → `wcApi.squadFromScreenshot()`. Uses same `/api/squad/from-screenshot` endpoint with existing rate limit. Result injected as assistant bubble.
- **blend_live_observations is zero-op pre-tournament** — only activates when rounds have `status='COMPLETE'`. Round status is now auto-synced from FIFA's `rounds.json` at the start of every `wc_run.py` invocation (`_sync_round_statuses()`).
- **00:00 UTC cron closes post-match lag** — WC matches end ~23:00 UTC; the midnight cron blends within ~1h. 04:00 and 18:00 UTC crons also sync status now.
- **Post-group cron hardcoded June 27** — simpler than status-checking.
- **squadViewMode persisted in appStore** — both Squad and Transfers share it; no local useState.
- **unmatchedNames in appStore is non-persisted** — excluded from `partialize`; clears on reload.
- **API Football 100 req/day hard cap** — track in `engine/data/apif_budget.json`.
- **unaccent extension** — already installed on `fpledge` DB. Required for `matchPlayersByName`.
- **matchPlayersByName two-pass** — position-filtered first, falls back to position-agnostic. Position param is `$3` (parameterized — never interpolate).
- **`/from-screenshot` returns `{name, position}` objects** — LLM extracts position from pitch layout. `max_tokens=256`.
- **EmptySlotCard only shown when `onEmptySlotClick` passed to Pitch** — Squad page passes it; Transfers doesn't.
- **FREE_TRANSFERS_BY_PHASE** — `{group:2, r32:6, r16:4, qf:4, sf:5, final:6}`. Auto-set on mount from round stage.
- **Hit verdict on SwapCard** — `net = xp_gain - 3`. Green if `net > 0`, rose if not. No backend change.
- **C/VC auto-assign picks from XI only** — `Squad.tsx` useEffect + `OnboardingModal.tsx` both call `getXI(sorted, {GK:1,DEF:4,MID:4,FWD:2})` and only set captain when `captain === null`. `activeCaptain` fallback also uses `xi`, not `displaySquad`.
- **Pitch swap flow** — tap card → profile modal. Sub In/Sub Out in modal → `setSwapSource(p)`. During swap: tap eligible → execute, tap source → deselect, tap ineligible → re-select source. Cancel chip below pitch.
- **`eligibleElements` is an IIFE, not `useMemo`** — it's computed after early returns in Squad.tsx; using `useMemo` there violates Rules of Hooks.
- **Boosters state in squadStore** — `boosterStates: Record<string, 'available'|'active'|'used'>`, setter `setBoosterState(id, state)`. Auto-persisted. IDs: `wildcard | max_captain | 12th_man | qual_booster | cs_shield`. R32+ chips locked when `currentRoundId <= 3` (rounds 1–3 = group stage).

---

## Gotchas

- **`_fetch_group_results` field names** — reads `homeSquadId`/`awaySquadId`, `homeScore`/`awayScore`. Falls back to `homeId`/`awayId`. Returns `{}` on any error.
- **FIFA Fantasy squadId (1–48) ≠ squads_fifa.json id (43817+)** — teams table built from rounds.json.
- **highspy MILP** — use `highspy.HighsVarType.kInteger`, check `h.getModelStatus()`.
- **Python on Windows** — use `py` launcher, `$env:PYTHONUTF8=1` for unicode.
- **wc schema search_path** — psycopg3: `options="-c search_path=wc,public"`. Node pg: append to connection string.
- **Pitch swap eligible logic** — GK position-locked (can only swap with other GK). Outfield: `newDEF>=3 && newMID>=2 && newFWD>=1` against current XI counts. `sourceIsXI` determines `movingOut`/`movingIn` for formation delta.
- **FT stepper `−` button** — uses U+2212 minus sign. Use `.nth(0)` in tests.
- **Re-sync modal skips idle step** — `startAtUpload=true` when `wcOnboardingOpen && squad.length > 0`.
- **`setViceCaptain` must be destructured separately** — `const { ..., viceCaptain, setViceCaptain } = useSquadStore()`.
- **Bench C/VC badges** — bench `PitchPlayerCard` gets `isCaptain`/`isViceCaptain` same as XI rows.
- **Smart suggest pitch view** — `viewMode` always respected; `|| suggestions !== null` removed. SuggestionsPreview renders above squad regardless.
- **BrowseAllModal add mode budget check** — `squadCost + price > budget + 0.001`. Pass `budget={100}` (total).
- **isValidFormation MID threshold** — `MID >= 2` (changed from 3 in Session 29 to support 5-2-3).
- **Appearance formula** — `APPEARANCE_PART * min(1, mf+0.15) + APPEARANCE_PART * mf`. Starters ≈1.9 pts, rotation ≈1.15 pts.
- **Booster chip rules (FIFA WC 2026)** — Wildcard: unlimited transfers, group stage only (not R1/R32). Maximum Captain: auto-picks highest XI scorer as 2×. 12th Man: extra player outside squad scores (can't captain/sub/transfer). Qualification Booster: +2 pts to a starting player who advances (R32+). Clean Sheet Shield: GK/DEF/MID lose CS only after 2 goals conceded (R32+).
