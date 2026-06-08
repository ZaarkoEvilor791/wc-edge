# wc-edge Project Guide

**Project:** FIFA WC 2026 Fantasy Companion Tool — squad builder, transfer advisor, captain picker, live tracker, Edge AI advisor.

**Deadline:** June 11, 2026. Tournament starts June 12, 2026.

**Production URL:** `https://wc-edge.onrender.com`

**Local dev:** frontend `http://localhost:5173`, Express API `http://localhost:3001`

**Database:** Shared fpl-edge Postgres (`fpledge` DB), `wc` schema. External URL in `engine/.env`, internal URL in Render env.

**PRD:** `wc-edge-prd.md` · Full design doc: `wc-edge.md`

---

## Current State (Session 24 complete — Security fix + architecture cleanup)

All 5 pages built, polished, and live on production. TypeScript clean. GitHub Actions working.
Latest commit: `acfd494`

**Tests:** 57 vitest (4 files) + 31 pytest — all green.

**DB:** 1,481 players · 8 rounds · 11,848 projections · 384 team_fdr rows · 1 suggested_squad (round 1, £98.0m, 77.96 xP)

**Squad composition:** 2GK/5DEF/5MID/3FWD · Ramírez + Osako as GKs · Mbappé/Salah/Ronaldo/Raphinha in XI

**apif budget:** `day1_used: 80, day2_used: 16` — both runs complete.

**DB state:** `wc.teams` — exactly 48 rows (squad_id 1–48). `is_active BOOLEAN DEFAULT TRUE` column live.

**Render deploy:** `startCommand` = `cd web && node node_modules/.bin/tsx server/server.ts`

**GitHub Actions:** `.github/workflows/engine.yml` live.
- Crons: 04:00 UTC (apif + model + blend) · 18:00 UTC (model + blend only) · June 27 06:00 UTC (post-group Bayesian FDR update, passes `--post-group`)
- `workflow_dispatch` inputs: `skip_apif` (default false), `post_group` (default false)

---

## Session 24 — What was shipped (commit `acfd494`)

**Web — `server/db.ts` (`matchPlayersByName`):**
- Fixed SQL injection: `position` parameter was string-interpolated into SQL (`` `AND p.position = '${position}'` ``). Now uses `$3` parameterized placeholder with `params` array extended conditionally. Server.ts already had a `VALID_POS` whitelist guard; db.ts now has defense in depth.

**Web — `src/config/gameRules.ts` (new file):**
- Single source of truth for game rule constants: `POS_REQUIRED`, `POS_COUNT`, `POS_ORDER`, `TOTAL_ROUNDS`.
- Removed duplicate `POS_REQUIRED` and `POS_ORDER` declarations from `squadValidator.ts`, `squad.ts`, `Squad.tsx`, `Transfers.tsx` — all now import from here.

**Web — `src/hooks/useWC.ts`:**
- `usePlayerProjectionsAllRounds`: hardcoded `[1,2,3,4,5,6,7,8]` replaced with `Array.from({length: TOTAL_ROUNDS}, ...)`.
- Extracted `proj` variable to replace 6 repeated `.find((p) => p.element === element)` calls per round.

**Web — `src/utils/squad.ts`:**
- Removed unused `_projections: Projection[]` and `_round: number` params from `getXI` signature. All callers updated (Squad.tsx, Pitch.tsx, squad.test.ts).

**Web — `src/store/squadStore.ts` + `src/types/wc.ts`:**
- Removed dead `bench: number[]` field from `SquadStore` interface, initial state, and `SquadState` type. Bench is computed by `getXI` from array order — never stored separately.

---

## Session 23 — What was shipped (commits `61b47b8`–`23e7419`)

**Web — `server/server.ts` (`/api/squad/from-screenshot`):**
- LLM prompt updated to extract name + position (GK/DEF/MID/FWD) for each player using pitch row layout and bench badges — eliminates wrong-player disambiguation (e.g. "Martínez" now resolves to Emiliano/GK not Lautaro/FWD).
- `max_tokens` raised 128→256 to accommodate `{name, position}` objects for 15 players.
- Robust coercion: handles both `"string"` and `{name, position}` formats from LLM; filters empty entries.

**Web — `server/db.ts` (`matchPlayersByName`):**
- Now accepts optional `position?: string` hint.
- Two-pass query: position-filtered first (`AND p.position = $pos`), falls back to position-agnostic if no match. Prevents price-sort ambiguity from picking the wrong player when names are shared across positions.

**Web — `src/components/shared/OnboardingModal.tsx`:**
- Added `startAtUpload?: boolean` prop — when true, modal opens directly at the upload step (skips the idle "Build new team / I already have a team" screen).
- "Back" button becomes "Cancel" (closes modal) when `startAtUpload` is true.
- `handleConfirmSquad` no longer calls `navigate('/squad')` when already on that path — eliminates the render race that caused the just-confirmed squad to appear non-persistent.

**Web — `src/App.tsx`:**
- Passes `startAtUpload={wcOnboardingOpen && squad.length > 0}` to OnboardingModal — re-sync flow (squad already loaded) skips idle step; first-time onboarding still shows it.

---

## Session 22 — What was shipped (commits `499ed2b`–`93aa9fd`)

**Web — `src/utils/squad.ts`:**
- New `fillSquadFromSuggested(matched, suggested)` pure function: fills missing position slots from the suggested squad (top xP per position), excludes already-matched elements, returns sorted 15-player array. Used by OnboardingModal to guarantee a full squad is always stored.

**Web — `src/components/shared/OnboardingModal.tsx`:**
- `handleConfirmSquad` now calls `fillSquadFromSuggested` before `setSquad` — fixes the bug where uploading a screenshot that matched < 15 players would result in the Squad page silently overwriting the user's squad with the suggested squad (corrupt detection triggered on `squad.length !== 15`).
- Uses `useSuggestedSquad()` hook (data already in React Query cache by confirm time); falls back to raw matched array if data unavailable.
- Modal copy updated: "filled with top xP pick for that position" (was misleading "optimal picks used for those spots").

**Web — `src/pages/Transfers.tsx`:**
- Pitch/list view toggle added to "Your Squad" section header, same pattern as Squad page.
- Toggle hidden while smart suggest flow is active (`suggestions !== null`) to prevent flow conflicts.
- Pitch view uses existing `Pitch` component; `onPlayerClick` calls `setManualOut(p)` — same action as list tap, opens `BrowseAllModal` in OUT→IN mode.
- Added `useProjections(round)` hook and `captain` from squad store.

**Tests — `src/__tests__/squad.test.ts`:**
- 6 new tests for `fillSquadFromSuggested`: empty match, full match, partial fill, no duplicates, correct 2GK/5DEF/5MID/3FWD composition, top-xP selection.

---

## Session 21 — What was shipped (commits `9e942ac`–`fd6e417`)

**Web — `server/db.ts`:**
- `matchPlayersByName` overhauled for screenshot reliability: strips FIFA UI truncation (`...`), removes combining diacritics via NFD normalization, maps Cyrillic lookalikes → ASCII before querying.
- Uses `unaccent()` + ILIKE on both substring (`%name%`) and prefix (`name%`) patterns so truncated names like "Nuno Men..." and accented names like "Martínez" resolve correctly.
- Prefix hits ranked below substring hits in ORDER BY to prefer exact matches.
- Removed unused `wasTruncated` variable.

**Web — `src/pages/Squad.tsx`:**
- Moved `useTeams()` hook above `useState` and early returns — fixes React hooks violation that caused Squad page to crash on initial load (hook was previously called after `if (isLoading) return`).

**DB:**
- `CREATE EXTENSION IF NOT EXISTS unaccent` run against `fpledge` DB — required for `unaccent()` calls in `matchPlayersByName`.

**Misc:**
- Added `*.log` to `.gitignore`.

---

## Session 20 — What was shipped (commit `5f583e7`)

**Web — `Transfers.tsx`:**
- Squad list as primary UI — always visible, grouped by GK/DEF/MID/FWD. Each player row is tappable (name + eliminated badge + xP + price + chevron).
- Tap any squad player → opens `BrowseAllModal` in OUT→IN mode (`manualOut` state → `initialOut` prop set).
- "Analyze" renamed "Smart suggest" — small secondary button in squad list header. Still triggers same sequential greedy algorithm.
- "Browse All" demoted to tertiary text link below squad list.
- Running transfer log at bottom whenever `accepted.length > 0` — shows all applied transfers (manual + smart suggest), total xP gain, Undo last + View Squad buttons. Replaces the old DoneState design.
- Smart suggest done state now just shows a dismissible completion notice; log handles the summary.

**Web — `BrowseAllModal.tsx`:**
- `initialOut?: SquadPlayer` prop added to Props interface.
- `isOutFirstMode = !!initialOut` drives two rendering paths:
  - **OUT→IN mode**: OUT player card (red border) shown at top, candidate list filtered to same position (locked), no position tabs. Tap candidate → budget check inline → `onSwap(candidate, initialOut)` → close immediately.
  - **IN→OUT mode**: existing flow unchanged (browse all, position tabs, pick IN, then pick OUT from squad).
- In OUT→IN mode, each candidate row shows xP delta vs. the outgoing player. Disabled + "Over budget" label when exceeds budget.

**Tests:** 51/51 vitest still green (UI-only changes).

---

## Session 19 — What was shipped

**Web — `Transfers.tsx`:**
- Free transfers auto-populated from round stage on load using `roundPhase()` + `FREE_TRANSFERS_BY_PHASE` map: `{GROUP:2, R32:6, R16:4, QF:4, SF:5, FINAL:6}`. Resets correctly when round selector changes. User can still override manually.
- Budget displayed inline in controls bar: `Budget: £Xm`.
- `SuggestionsPreview` component — read-only panel above the active swap card showing all suggestions as a list: past ones struck through, current highlighted in white/gold, upcoming dimmed.
- "Skip" renamed to "Pass" with `title` tooltip: "Pass on this suggestion — not undoable".
- Done state: added **"View Squad"** button (`useNavigate('/squad')`); "skipped" → "passed" in copy.

**Web — `BrowseAllModal.tsx`:**
- Eliminated players (`is_active=false`) filtered out by default. "Show N eliminated players" toggle appears at bottom of list when any are hidden.
- Backdrop tap no longer closes modal when `selectedIn !== null` — prevents silent loss of in-progress player selection. User must tap × or "← Back".
- Header text changes to "Who do you want to sell?" in step 2.

---

## Session 18 — What was shipped

**Web — `server.ts`:**
- `app.set('trust proxy', 1)` — fixes `req.ip` on Render (was returning load balancer IP; now reads real client IP from `X-Forwarded-For`)
- `checkRateLimit(ip, maxPerMin, maxPerDay)` — dual-window in-memory rate limiter. Keyed by IP + UTC date string. `/api/chat`: 5/min + 25/day. `/api/squad/from-screenshot`: 2/min + 5/day. Exported as `_rateLimitMap` for test cleanup.
- `AI_ENABLED` env var kill switch — both LLM routes return 503 immediately when `AI_ENABLED=false`. Toggle in Render dashboard in <30s, no redeploy needed.
- `/api/squad/from-screenshot` — assistant prefill `{"players":[` forces valid JSON from token 1; max_tokens 512→128; regex extraction removed. Saves ~65% output tokens per call.
- `/api/chat` — system prompt restructured with XML tags (`<role>`, `<rules>`, `<squad>`); output instruction tightened to `≤120 tokens. No preamble. No sign-off.`

**Tests — `server.routes.test.ts`:**
- 9 → 17 tests. Added: screenshot route (5 tests — 400 validation, valid prefill completion, unparseable, empty array), rate limiter (3 tests — chat daily cap 429, screenshot daily cap 429, kill switch 503).
- `mockCreate` declared with `vi.hoisted()` to avoid Vitest hoisting error.
- `beforeEach(() => _rateLimitMap.clear())` prevents cross-test rate limit bleed.

**Tools — new skills:**
- `/atros` (`~/.claude/commands/atros.md`) — Anthropic Token & Resource Optimization Specialist. Audits prompts and LLM architecture for token spend, hallucination risk, and model fit. Use with any Anthropic API work.

---

## Session 17 — What was shipped (commit `ca43627`)

**Engine — `wc_model.py`:**
- `blend_live_observations(conn)` — PRD Option A2: after rounds complete, blends prior xP with FIFA Fantasy `avgPoints` per player. Formula: `(prior_xp * 300 + avg_pts_pg * rounds_played * 90) / (300 + rounds_played * 90)`. Prior fades to ~25% by round 5. Reads completed rounds from DB; fetches `players.json` for avgPoints. Zero-op pre-tournament. Called after every `run_model` in `wc_run.py`.
- `run_model(conn, post_group=False)` — `post_group=True` path: calls `_fetch_group_results()` to read actual group stage scores from FIFA Fantasy `rounds.json`, then applies Bayesian lambda update to knockout-round FDR entries: `concede_lambda = (3 * KO_AVG + m * actual_ga) / (3 + m)`, `def_multiplier = actual_gf_pg / tournament_avg_gpg`.
- `_fetch_group_results()` — parses completed GROUP stage match scores; returns `{}` on any HTTP error (graceful fallback to seed-based lambdas).

**Engine — `wc_run.py`:**
- `--post-group` flag: passes `post_group=True` to `run_model`.
- Auto-detects current round and budget from DB: earliest non-COMPLETE round → `GROUP=£100m`, R32+=`£105m`. No more hardcoded `--round 1`.
- `blend_live_observations(conn)` called after every model run.

**Engine — `engine.yml`:**
- June 27 cron now runs the `--post-group` step (separate step with `if` condition).
- `workflow_dispatch` gains `post_group` boolean input.
- Standard daily runs use a separate step path (not post-group).

**Web — Transfers page:**
- `BrowseAllModal.tsx` — new component. Two-step flow: (1) browse all players not in squad, filtered by position tab + name search, sorted xP DESC; (2) pick which squad player to sell, with live budget check and xP delta shown. Renders as bottom sheet on mobile.
- "Browse All" button appears next to Analyze on initial state, and below swap cards after suggestions are loaded.
- `handleManualSwap()` records accepted transfers the same way as model suggestions (appears in session summary, supports Undo).

**Web — `server.ts`:**
- `export { app }` + `NODE_ENV !== 'test'` guard around `app.listen()` — enables supertest integration tests without binding a port.

**Tests:**
- `transferAdvisor.test.ts` +2: eliminated player (xp=0) surfaces as sell; budget-exceeded → empty result.
- `test_model.py` +13: live blend math (5 tests), post-group FDR Bayesian math (5 tests), `_fetch_group_results` with monkeypatched HTTP (3 tests).
- `server.routes.test.ts` (new, 9 tests): `POST /api/transfers/suggest` 400 validation; `GET /api/live` stale fallback when upstream 503; `POST /api/chat` squad context injection — all using `vi.mock()` on DB layer + supertest.

---

## Outstanding (pre-tournament, by June 11)

- **Production smoke test** — verify all 5 pages on `https://wc-edge.onrender.com`. Check `/api/fdr?round=1` (expect 48 rows), `/api/live`, mobile Transfers (tap player → BrowseAllModal OUT→IN), SwapDrawer.
- **Anthropic credits** — top up at console.anthropic.com → test Assistant chat + screenshot upload end-to-end.
- **Render env var** — add `AI_ENABLED=true` in Render dashboard (Environment tab). Required for kill switch to work correctly.

---

## Next Session Priorities

1. **Prod smoke test** — all 5 pages, `/api/fdr?round=1`, `/api/live`, mobile Transfers (tap player → OUT→IN modal), SwapDrawer.
2. **Top up Anthropic credits** → test `/api/chat` and `/api/squad/from-screenshot`.
3. **Add `AI_ENABLED=true`** in Render dashboard (Environment tab).
4. **Tournament operations** — mark eliminated teams as the tournament progresses:
   ```sql
   UPDATE wc.teams SET is_active = FALSE WHERE abbr IN ('XXX', 'YYY');
   ```
   Engine cron auto-refreshes projections at 04:00 + 18:00 UTC.
6. **Manual engine trigger** if projections go stale:
   ```bash
   gh workflow run engine.yml --repo ZaarkoEvilor791/wc-edge
   # With post-group FDR update (run after group stage ends ~June 27):
   gh workflow run engine.yml --repo ZaarkoEvilor791/wc-edge -f post_group=true
   ```

---

## How to Run

```bash
# Frontend + API server
cd web
npm run dev       # Express :3001 + Vite :5173 concurrently
# requires web/.env: DATABASE_URL + ANTHROPIC_API_KEY

# Tests
cd web && npm test           # 43 vitest
cd engine && py -m pytest tests/ -v   # 31 pytest

# Engine (Windows PowerShell)
cd engine
$env:PYTHONUTF8=1
py -m engine.wc_run                          # model + optimizer (auto-detects round + budget)
py -m engine.wc_run --post-group             # post-group FDR Bayesian update
py -m engine.wc_ingest --source apif --day 2 # refresh club stats
```

**Full pipeline from scratch:**
```bash
py -m engine.wc_ingest --source statsbomb
py -m engine.wc_ingest --source fifa
py -m engine.wc_ingest --source apif --day N
py -m engine.wc_run
```

**env files (gitignored, never commit):**
- `engine/.env`: `DATABASE_URL=` + `API_FOOTBALL_KEY=`
- `web/.env`: `DATABASE_URL=` + `ANTHROPIC_API_KEY=`

---

## Architecture

```
engine/
├── engine/
│   ├── wc_schema.sql    7 tables under wc schema
│   ├── wc_ingest.py     Phase 1: FIFA Fantasy + StatsBomb + API-Football
│   ├── wc_model.py      Phase 2: Bayesian xG/xA + seed FDR → projections + team_fdr
│   │                    Pure fns: compute_player_rates(), compute_round_projection()
│   │                    Live: blend_live_observations(), _fetch_group_results()
│   │                    run_model(conn, post_group=False)
│   ├── wc_optimizer.py  Phase 3: HiGHS MILP → suggested_squad
│   ├── wc_run.py        Orchestrator: auto-detects round+budget, --post-group flag
│   ├── db.py            psycopg3 pool, search_path=wc,public
│   └── config.py        scoring constants, API keys, league IDs
├── tests/
│   └── test_model.py    31 pytest tests
└── data/
    ├── sb_cache.json         1441 StatsBomb players
    ├── name_overrides.json   13 hard-coded name mappings
    └── apif_budget.json      {day1_used: 80, day2_used: 16}

web/
├── server/
│   ├── server.ts              13 routes: 3 FIFA proxies + DB/AI routes
│   │                          exports `app` for testing; listen guarded by NODE_ENV
│   ├── db.ts                  pg.Pool, search_path=wc,public, all query functions
│   └── services/
│       └── transferAdvisor.ts pure suggestTransfers() — greedy algorithm, no I/O
└── src/
    ├── types/wc.ts
    ├── config/
    │   └── gameRules.ts       POS_REQUIRED, POS_COUNT, POS_ORDER, TOTAL_ROUNDS
    ├── domain/
    │   └── squadValidator.ts  validateSquad(), roundPhase(), COUNTRY_LIMIT
    ├── utils/squad.ts         getXI(players), swapInSquad() — array-order XI/bench invariant
    ├── store/appStore.ts      sidebar + onboarding state (Zustand + persist)
    ├── store/squadStore.ts    squad[], captain, viceCaptain (Zustand + persist)
    ├── hooks/useWC.ts         React Query hooks
    ├── services/wcApi.ts      fetch wrappers
    ├── __tests__/             transferAdvisor, squadValidator, squad utils,
    │                          server.routes (57 vitest total)
    ├── components/shared/     Pitch, PitchPlayerCard, PlayerProfileModal,
    │                          OnboardingModal, SwapDrawer, RoundXpChart,
    │                          StatCard, Spinner, Logo, BrowseAllModal
    └── pages/                 Assistant, Squad, Transfers, Captain, Live
```

---

## Pages Summary

| Page | Route | Guard | Key feature |
|---|---|---|---|
| Assistant | / | none | Edge AI, starter chips, squad context |
| Squad | /squad | none | Pitch + list view, swap drawer, modal, budget bar |
| Transfers | /transfers | RequireSquad | Sequential greedy, Accept/Skip/Undo, −3pts badge, Browse All |
| Captain | /captain | RequireSquad | Ranked list, FDR badge, variance, deadline countdown |
| Live | /live | none (degrades) | Match cards, captain banner, falls back to fixture schedule |

---

## API Routes

| Route | Method | Notes |
|---|---|---|
| /wc/players.json | GET | FIFA Fantasy proxy, 5min TTL |
| /wc/rounds.json | GET | FIFA Fantasy proxy, 5min TTL |
| /wc/squads_fifa.json | GET | FIFA Fantasy proxy, 30min TTL |
| /api/rounds | GET | DB rounds |
| /api/players | GET | All 1,481 players |
| /api/teams | GET | Teams + isActive flag |
| /api/projections?round=N | GET | All players sorted xP DESC |
| /api/squad/suggest | GET | Pre-computed suggested_squad |
| /api/squad/optimize | POST | Returns suggested_squad (placeholder — Python optimizer is source of truth) |
| /api/squad/from-screenshot | POST | Claude Haiku Vision → matched players |
| /api/transfers/suggest | POST | Sequential greedy, {squad, round, freeTransfers} |
| /api/fdr?round=N | GET | FDR 1–5 per team |
| /api/fixtures/:squadId | GET | Per-team fixture list from rounds.json |
| /api/live?round=N | GET | Community API proxy; falls back to FIFA schedule |
| /api/chat | POST | Edge AI, {messages, squadNames?} |

---

## Database Schema (key addition)

```sql
-- wc schema: players, teams, rounds, player_stats, projections, team_fdr (see wc-edge.md §4)

CREATE TABLE suggested_squad (
    id          SERIAL PRIMARY KEY,
    round       INTEGER NOT NULL,
    squad_json  JSONB NOT NULL,
    total_xp    REAL,
    total_cost  REAL,
    computed_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX ON suggested_squad (round);
```

---

## Deployment

```yaml
# render.yaml
services:
  - type: web
    name: wc-edge
    env: node
    plan: free
    buildCommand: cd web && npm install && npm run build
    startCommand: node web/dist/server/server.js
    envVars:
      - key: DATABASE_URL
        fromDatabase: { name: wc-db, property: connectionString }
      - key: ANTHROPIC_API_KEY
        sync: false
```

```bash
gh workflow run engine.yml --repo ZaarkoEvilor791/wc-edge              # standard run
gh workflow run engine.yml --repo ZaarkoEvilor791/wc-edge -f post_group=true  # post-group FDR
```

---

## Key Decisions

- **`highs` npm package stays** — Squad Builder uses HiGHS-WASM for Re-optimize.
- **API Football key is gitignored** — `engine/.env` and GitHub secret only. Never commit.
- **Squad never empty on load** — always pre-filled from `suggested_squad` DB table.
- **Transfers — squad list is primary UI** — tap any squad player to start OUT→IN transfer via `BrowseAllModal(initialOut)`. Smart suggest (sequential greedy) is secondary button. Browse All (IN→OUT) is tertiary text link.
- **BrowseAllModal has two modes** — OUT→IN (`initialOut` prop set): position locked, tap candidate = immediate confirm. IN→OUT (no `initialOut`): existing two-step flow (pick IN, then pick OUT from squad).
- **Captain is squad-only** — 15 rows, no global player list.
- **Live is always accessible** — no RequireSquad guard. Stale mode is primary design constraint.
- **Captain swap is advisory** — banner links to play.fifa.com/fantasy/, no in-app execution.
- **WC gold accent** — `#E8B84B` in `tailwind.config.ts`. Never use purple/violet.
- **Elite product team** — always convene `/elite-product-team` for design/architecture decisions before coding.
- **getXI is array-order based** — first N players of each position in the store array = XI. Pre-sort by xP on DB load; manual swaps exchange array positions.
- **Server returns up to 6 transfer suggestions** — `freeTransfers` is badge threshold only, not loop limit.
- **blend_live_observations is zero-op pre-tournament** — checks rounds WHERE status='COMPLETE'; safe to call on every engine run.
- **Post-group cron hardcoded June 27** — simpler than status-checking; acceptable for v1.
- **`/api/chat` system prompt uses XML tags** — `<role>`, `<rules>`, `<squad>` segregate static rules from dynamic user context; reduces hallucination on scoring rules. Output instruction: `≤120 tokens. No preamble.`
- **`/from-screenshot` prefills assistant turn** — passes `{"role":"assistant","content":"{"players":["}` to force valid JSON from token 1; removes regex extraction. max_tokens=128 (15 names × ~8 chars ≈ 60–80 tokens).
- **LLM routes are rate-limited** — 10 req/min/IP via in-memory token bucket on `/api/chat` + `/api/squad/from-screenshot`.

---

## Brand & Design

| Token | Hex | Role |
|---|---|---|
| `accent` | `#E8B84B` | WC gold — buttons, active states |
| `wc-navy` | `#0C1D3E` | Banner gradient |
| `wc-red` | `#DC2430` | Late-round xP chart |
| `pitch-green` | `#2D7A4F` | Pitch background |
| `slate-950` | `#060D18` | Body background |
| `slate-900` | `#0A1321` | Main surface / sidebar |
| `slate-800` | `#0F1E31` | Cards / panels |
| `slate-400` | `#6B8EA8` | Body text |
| `slate-100` | `#E0EEF8` | Primary text |

---

## Scoring Constants

```python
GOAL_PTS = {1: 9, 2: 7, 3: 6, 4: 5}   # GK/DEF/MID/FWD
CS_PTS   = {1: 5, 2: 5, 3: 1, 4: 0}
ASSIST_PTS = 3
APPEARANCE_FULL = 2   # >= 60 min
APPEARANCE_PART = 1   # < 60 min
SAVES_PER_PT = 3      # GK: +1 per 3 saves
YELLOW_CARD = -1
RED_CARD = -2
SCOUTING_BONUS = 2    # >= 4 pts + < 5% ownership
```

---

## WC Fantasy Rules

| Rule | Detail |
|---|---|
| Squad | 15 players: 2 GK / 5 DEF / 5 MID / 3 FWD |
| Budget | £100m group stage → £105m from R32+ |
| Country limit | Max 3 group (R32→4, R16→5, QF→6, SF/F→8) |
| Transfers | Group: 2 free/MD · R32: unlimited · R16/QF: 4 · SF: 5 · Final: 6 |
| Extra transfer | −3 pts each |
| Chips | Wildcard, 12th Man, Max Captain, Qualification Booster, Mystery Booster |
| Captain | 2× points; mid-match swap to unplayed player allowed |

---

## Gotchas

- **API-Football 100 req/day hard cap** — track in `engine/data/apif_budget.json`.
- **Sofascore 403** — Cloudflare blocked. AFCON 2025 falls back to AFCON 2023 StatsBomb.
- **Community live API** (`worldcup2026-api.vercel.app`) — no SLA. Stale fallback to FIFA schedule is primary, not edge case.
- **suggested_squad must be populated** before Squad page works — run `py -m engine.wc_run` after schema changes.
- **FIFA Fantasy squadId (1–48) ≠ squads_fifa.json id (43817+)** — teams table built from rounds.json, not squads_fifa. Seed/group enriched by name match.
- **highspy MILP** — use `highspy.HighsVarType.kInteger`, check status via `h.getModelStatus()`.
- **Python on Windows** — use `py` launcher, set `$env:PYTHONUTF8=1` for unicode output.
- **wc schema search_path** — psycopg3: `options="-c search_path=wc,public"`. Node pg: append `?options=-c%20search_path%3Dwc%2Cpublic` to connection string.
- **Country limit warning threshold** — round-aware via `COUNTRY_LIMIT[roundPhase(stage)]` in `Squad.tsx`. Source of truth: `src/domain/squadValidator.ts`. Group=3, R32=4, R16=5, QF=6, SF/F=8.
- **SwapDrawer sub-in vs sub-out** — bench player triggers sub-in (options = XI starters); starter triggers sub-out (options = bench). Target player excluded from its own option list.
- **FT stepper `−` button** — uses U+2212 minus sign, not U+002D hyphen. Use `.nth(0)` selector in tests.
- **blend_live_observations reads `status = 'COMPLETE'`** — rounds table must have status column updated by ingest/admin for the blend to activate. Pre-tournament all rounds are non-COMPLETE so it's a no-op.
- **`_fetch_group_results` field names** — reads `homeSquadId`/`awaySquadId` and `homeScore`/`awayScore` from rounds.json tournaments. Falls back to `homeId`/`awayId` if primary keys absent. Returns `{}` on any error.
- **server.ts `export { app }`** — app is exported for supertest. `app.listen()` only runs when `NODE_ENV !== 'test'`.
- **`FREE_TRANSFERS_BY_PHASE` in `Transfers.tsx`** — `{group:2, r32:6, r16:4, qf:4, sf:5, final:6}`. R32 uses 6 (unlimited in WC rules, capped at stepper max). Auto-set on mount from `currentRound.stage` via `roundPhase()`; resets on round selector change.
- **`unaccent` extension** — `matchPlayersByName` uses `unaccent()`. Extension is installed on `fpledge` DB (`CREATE EXTENSION IF NOT EXISTS unaccent` — already run). Required before any fresh schema deploy on a new DB.
- **`/from-screenshot` returns `{name, position}` objects** — LLM now extracts position (GK/DEF/MID/FWD) alongside name using pitch row layout and bench badges. `matchPlayersByName(name, position)` filters by position first, falls back to position-agnostic. `max_tokens=256` (up from 128) to fit object format for 15 players.
- **`matchPlayersByName` two-pass query** — position-filtered pass first; if no rows returned, retries without position filter. Prevents price-sort ambiguity (e.g. Lautaro Martínez FWD £8.8m beating Emiliano Martínez GK £5.5m).
- **Re-sync modal skips idle step** — `OnboardingModal` opens at upload step when `startAtUpload=true` (set by App.tsx when `wcOnboardingOpen && squad.length > 0`). First-time onboarding still shows idle step.
- **LLM rate limit is in-memory only** — resets on Render dyno restart. Acceptable for free-tier single-instance; not suitable for multi-instance deployments.
- **`matchPlayersByName` position param is `$3`** — parameterized, not interpolated. params array is `[subLike, prefLike]` for position-agnostic pass and `[subLike, prefLike, position]` for position-filtered pass. Never revert to template literal interpolation.
- **`getXI` takes only `players`** — removed `_projections` and `_round` params (were always unused). Signature is `getXI(players: SquadPlayer[])`.
- **`bench` field removed from store** — `SquadStore` and `SquadState` no longer have a `bench: number[]` field. Bench is computed on the fly by `getXI` from array order.
- **Game rule constants live in `src/config/gameRules.ts`** — `POS_REQUIRED`, `POS_COUNT`, `POS_ORDER`, `TOTAL_ROUNDS`. All other files import from there; do not redeclare locally.
