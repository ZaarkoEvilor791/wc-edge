# wc-edge Project Guide

**Project:** FIFA WC 2026 Fantasy Companion Tool — squad builder, transfer advisor, captain picker, live tracker, Edge AI advisor.

**Production URL:** `https://wc-edge.onrender.com`

**Local dev:** frontend `http://localhost:5173`, Express API `http://localhost:3001`

**Database:** Neon Postgres (`neondb`), `wc` schema. Free tier, no expiry. External URL in `engine/.env` and `web/.env`. Render env var `DATABASE_URL` must also point to Neon.

**Further reading:**
- `docs/ops.md` — tournament operations playbook (crons, manual tasks, runbooks)
- `docs/sessions.md` — session history
- `docs/key-decisions.md` — authoritative design decisions (read before changing core logic)
- `CONTEXT.md` — domain glossary
- `docs/adr/` — architecture decision records

---

## Current State (Session 45 starting)

All 6 pages built, polished, and live on production. TypeScript clean. GitHub Actions working. **Tournament live since June 12.**

**Tests:** 129 vitest (6 files) + 49 pytest — all green.

**DB:** 1,484 players · 8 rounds · 578 players with club stats (API-Football day 2 run complete) · 384 team_fdr rows · 3 suggested_squad rows (round 1: max_xp £99.6m 97.97xP post-stats). `wc.players` has `is_penalty_taker BOOLEAN` (32 takers seeded). `wc.player_stats` has `tourn_chances90`, `tourn_tackles90`, `tourn_sot90`.

**apif budget:** `day1_used: 80, day2_used: 16` — both runs complete. Daily 04:00 UTC cron uses 32 req/run.

**DB state:** `wc.teams` — exactly 48 rows (squad_id 1–48). `is_active BOOLEAN DEFAULT TRUE` live. `wc.suggested_squad` PK is `(round, variant)`. **IMPORTANT: `migrate.py` must be run against any new DB instance.**

**Render deploy:** `startCommand` = `cd web && node node_modules/.bin/tsx server/server.ts`

**Render env vars:** `AI_ENABLED=true` confirmed set.

**GitHub Actions:** `.github/workflows/engine.yml` live.
- Crons: 04:00 UTC (apif + model + blend) · 18:00 UTC (model + blend only) · 00:00 UTC (post-match blend) · June 27 06:00 UTC (post-group Bayesian FDR)
- `workflow_dispatch` inputs: `skip_apif` (default false), `post_group` (default false)
- All runs green as of June 13. `blend_live_observations` fires once a round is `COMPLETE` (0 rounds complete so far).

**Session 44 shipped:**
- **Star ratings on player cards** — `playerStarRating(xp, lowSample)` in `utils/squad.ts`. Tiers: ≥6.0=★5 gold, ≥4.5=★4 cyan, ≥3.0=★3 slate; `low_sample` capped at ★3. Compact `★N` badge top-left on `PitchPlayerCard`; star glyphs in `BrowseAllModal`, `Transfers` SquadList, `Squad` list, `Captain` list.
- **Captain kickoff timing** — `Captain.tsx` now locks players when their match **kicks off** (not just full-time). `matchKickoffs` map (squad_id → kickoff+status from ESPN live data); `lockedElements` replaces `playedElements` for lock logic; kickoff chips show `kicks off HH:MM` / `in Xh Ym` / `Live` badge in the list. 30s `now` ticker keeps chips fresh.

**Planned (not yet built):**
- **Edge AI squad context enrichment** — `/api/chat` currently drops the `squad: number[]` sent by frontend. Plan: add `getSquadContext(elementIds, round)` to `db.ts` (JOIN across players/projections/team_fdr/player_stats), add `buildSquadAnalysis()` formatter to `server.ts`, inject `<squad_analysis>` block into system prompt replacing bare name list. Edge will be honest that per-match history isn't in DB — advises from xP + FDR signals. Plan file: `C:\Users\shriy\.claude\plans\velvet-weaving-rabin.md`.

---

## How to Run

```bash
# Frontend + API server
cd web && npm run dev    # Express :3001 + Vite :5173

# Tests
cd web && npm test                        # 129 vitest
cd engine && py -m pytest tests/ -v       # 49 pytest

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
    ├── config/gameRules.ts     POS_REQUIRED, POS_COUNT, POS_ORDER, TOTAL_ROUNDS,
    │                           SCORING, FREE_TRANSFERS_BY_PHASE
    ├── domain/squadValidator.ts validateSquad(), canAddPlayer(), roundPhase(), COUNTRY_LIMIT
    ├── utils/squad.ts          normalizeSquad(), getXI(), swapInSquad(), optimiseXI(),
    │                           getEligibleSwapTargets(), fillSquadFromSuggested()
    ├── store/appStore.ts       sidebar + onboarding + squadViewMode (Zustand + persist)
    ├── store/squadStore.ts     squad[], captain, viceCaptain, formationCounts, boosterStates
    ├── hooks/useWC.ts          React Query hooks (useRounds polls 2min; useLive exported)
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
| Captain | /captain | RequireSquad | Pitch view + ranked list, tap to set C, mid-round swap mode, FDR badge |
| Boosters | /boosters | RequireSquad | 5 chip cards, strategy tips, Available/Active/Used state |
| Live | /live | none | Match cards, ESPN scores (60s poll) |

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
| GET /api/squad/suggest?variant= | Pre-computed suggested_squad |
| POST /api/squad/from-screenshot | Claude Haiku Vision → matched players |
| POST /api/transfers/suggest | Greedy, {squad, round, freeTransfers} |
| GET /api/fdr?round=N | FDR 1–5 per team |
| GET /api/live?round=N | ESPN scoreboard; falls back to FIFA schedule |
| POST /api/chat | Edge AI, {messages, squadNames?} |

---

## WC Fantasy Rules

| Rule | Detail |
|---|---|
| Squad | 15 players: 2 GK / 5 DEF / 5 MID / 3 FWD |
| Budget | £100m group stage → £105m from R32+ |
| Country limit | Max 3 group/R32 · 4 R16 · 5 QF · 6 SF · 8 Final |
| Transfers | Group: 2 free/MD · R32: unlimited · R16/QF: 4 · SF: 5 · Final: 6 |
| Extra transfer | −3 pts each |
| Captain | 2× points; VC auto-gets 2× if captain plays 0 min |

---

## Scoring Constants

```python
GOAL_PTS = {GK:9, DEF:7, MID:6, FWD:5}
CS_PTS   = {GK:5, DEF:5, MID:1, FWD:0}
ASSIST_PTS = 3; APPEARANCE_FULL = 2; APPEARANCE_PART = 1
SAVES_PER_PT = 3; YELLOW_CARD = -1; RED_CARD = -2; SCOUTING_BONUS = 2
TACKLES_PER_PT = 3; CHANCES_PER_PT = 2; SHOTS_ON_TARGET_PER_PT = 2
```

Single source of truth: `src/config/gameRules.ts` → mirrored in `engine/engine/config.py`. Never hardcode.

---

## Brand & Design

WC gold `#E8B84B` · cyan `#00D4FF` · navy `#0C1D3E` · pitch-green `#2D7A4F` · body bg `#060D18` · surface `#0A1321` · cards `#0F1E31`. Never use purple/violet. Glow tokens in `index.css` + `tailwind.config.ts`.

---

## Deployment

```bash
gh workflow run engine.yml --repo ZaarkoEvilor791/wc-edge
gh workflow run engine.yml --repo ZaarkoEvilor791/wc-edge -f post_group=true
```

Render auto-deploys on `main` push.

---

## Gotchas

- **Squad ordering contract** — `getXI()` relies on array order. Call `normalizeSquad()` before `setSquad()` on fresh loads; bypass for manual swaps. See ADR 001.
- **`canAddPlayer()` is the validation gate** — position cap + budget + country limit in one call. Don't inline these checks. See ADR 002.
- **`FREE_TRANSFERS_BY_PHASE`** — lives in `gameRules.ts`. Import from there. See ADR 004.
- **`_fetch_group_results` field names** — reads `homeSquadId`/`awaySquadId`, `homeScore`/`awayScore`. Falls back to `homeId`/`awayId`.
- **FIFA Fantasy squadId (1–48) ≠ squads_fifa.json id (43817+)** — teams table built from rounds.json.
- **highspy MILP** — use `highspy.HighsVarType.kInteger`, check `h.getModelStatus()`.
- **Python on Windows** — use `py` launcher, `$env:PYTHONUTF8=1` for unicode.
- **wc schema search_path** — psycopg3: `options="-c search_path=wc,public"`. Node pg: append to connection string.
- **Pitch swap eligible logic** — GK position-locked. Outfield: `newDEF≥3 && newMID≥2 && newFWD≥1` against current XI counts.
- **FT stepper `−` button** — uses U+2212 minus sign. Use `.nth(0)` in tests.
- **Re-sync modal skips idle step** — `startAtUpload=true` when `wcOnboardingOpen && squad.length > 0`.
- **Round status is `'playing'` not `'active'`** — `useCurrentRound()` and `getCurrentRoundId()` accept both.
- **ESPN scoreboard** — `site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=YYYYMMDD`. No key, no rate limit.
- **Community API dead** — `worldcup2026-api.vercel.app` returns 404 for WC 2026. Tier 1 always fails.
- **`migrate.py` must run on new DB instances** — adds `player_stats` + bonus columns + `is_penalty_taker`.
- **StatsBomb field names** — `pass.shot_assist` (NOT `key_pass`). Tackles: `Duel` event + `duel.type.name === 'Tackle'`.

---

## Next Session Priorities

1. **Tournament ops (ongoing)** — mark eliminated teams after each round, monitor engine crons. See `docs/ops.md`.
2. **Edge AI squad context** — implement plan at `C:\Users\shriy\.claude\plans\velvet-weaving-rabin.md`. Adds `getSquadContext()` to `db.ts` + `buildSquadAnalysis()` to `server.ts`; injects per-player xP/FDR/stats into `/api/chat` system prompt so Edge can give real squad advice.
3. **ADR 002 server-side** — extend `canAddPlayer` enforcement to the server (`/api/transfers/suggest` response validation). Trigger: if a country-limit or position bug is reported.
4. **ADR 003 (post-tournament)** — store xP breakdown as JSONB in `wc.player_projections`; remove reverse-engineering from PlayerProfileModal.
5. **Captain mid-round: team-name matching** — ESPN `home_team`/`away_team` strings may not exactly match `teams.name` in DB. Monitor in prod; add fallback matching (abbr or fuzzy) if FT detection misfires.
