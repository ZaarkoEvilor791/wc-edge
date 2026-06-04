# wc-edge Project Guide

**Project:** FIFA WC 2026 Fantasy Companion Tool — squad builder, transfer advisor, captain picker, live tracker, and Edge AI advisor.

**Deadline:** June 11, 2026 (Day 8). Tournament starts June 12, 2026.

**Production URL:** `https://wc-edge.onrender.com`

**Local dev:** frontend at `http://localhost:5173`, Express API at `http://localhost:3001`

**Database:** Render Postgres (free tier, 256MB)

**PRD:** https://github.com/ZaarkoEvilor791/fpl-edge/issues/12

**Full design doc:** `wc-edge.md` in this repo

**Parent project:** `fpl-edge` at `../fpl-edge` — copy patterns from there, not code

---

## Session Context (read this first)

**Session 1 (2026-06-04) — repo scaffolded, planning complete:**

- Design grilling complete — all pages, API routes, and deployment fully specified
- PRD published at https://github.com/ZaarkoEvilor791/fpl-edge/issues/12
- Repo scaffolded, wc-edge.md copied (API key scrubbed), CLAUDE.md written

**Session 2 (2026-06-04) — infra complete, engine scaffolded, ready for Phase 1 scrape:**

- `wc-edge-prd.md` written and committed (full PRD with user stories + test strategy)
- `render.yaml` created — DB stanza removed (Render free tier allows only 1 DB; reusing fpl-edge Postgres)
- Render web service live at `https://wc-edge.onrender.com`
- **Database:** reusing fpl-edge Postgres (`fpledge` DB). Internal URL set in Render env. External URL in `engine/.env`.

**Session 3 (2026-06-04) — Day 1 engine complete, Phase 1 scrape done:**

- All engine foundation files written: `config.py`, `db.py`, `__init__.py`, `requirements.txt`
- **Schema updated:** all tables now under `wc` Postgres schema (`CREATE SCHEMA IF NOT EXISTS wc`) to avoid collision with fpl-edge's `players`/`teams` tables on the shared DB. All queries use `wc.tablename`.
- `db.py` sets `search_path=wc,public` on connect — no schema prefix needed in SQL
- **`wc_ingest.py` written** — all 4 sources: statsbomb, sofascore, fifa, apif
- **Phase 1 scrape complete (Day 1):**
  - StatsBomb: 199 match files, 1,441 unique players cached → `engine/data/sb_cache.json`
  - Sofascore: **403 blocked** (Cloudflare). AFCON 2025 players fall back to AFCON 2023 StatsBomb data.
  - FIFA Fantasy: 1,481 players (48-team WC 2026), 8 rounds, 32 squads upserted to DB
  - API-Football: 107 players with club stats upserted. **Budget used: 80/100 today.**
- **DB state after Day 1:**
  - `wc.players`: 1,481 rows
  - `wc.teams`: 32 rows
  - `wc.rounds`: 8 rows
  - `wc.player_stats`: 571 rows (520 with tournament stats, 106 with club stats, 56 with both)
  - `engine/data/unmatched_players.json`: 961 players for Day 3 review
- **Known bugs fixed during this session:**
  1. API-Football `/players/topscorers` has no `page` parameter — `&page=1` returns error. Fixed to single request per league, no pagination.
  2. Abbreviated API-Football names ("A. Isak") added last-name-only fallback in `_resolve_element()`
  3. All `wc_schema.sql` tables prefixed with `wc.` namespace
**Session 4 (2026-06-05) — Day 2 complete: engine pipeline + full web scaffold:**

- `engine/engine/wc_model.py` — Bayesian xG/xA posteriors, seed-based FDR, full xP formula → writes wc.projections (11,848 rows)
- `engine/engine/wc_optimizer.py` — HiGHS MILP 15-player squad solver → writes wc.suggested_squad
- `engine/engine/wc_run.py` — orchestrator: `py -m engine.wc_run` runs model + optimizer
- **3 critical bugs fixed in wc_ingest.py:**
  1. FIFA Fantasy `position` is a STRING ("DEF") not int — was silently defaulting all 1481 players to MID
  2. `teams` table must be built from `rounds.json` fixtures (sequential IDs 1-48 matching player.squadId), NOT from `squads_fifa.json` (which uses FIFA entity IDs 43817+ with no overlap)
  3. Enrich seed/group by team name match between rounds.json and squads_fifa.json
- **Full web scaffold written:** Vite+React+TS, Express, 5 pages, sidebar, WC gold accent, all hooks, TypeScript clean
- **DB state after Day 2:** projections (11,848), suggested_squad (round 1: £98.9m, 77.6 xP)
- **Next session starts here (Day 3):**
  1. Review `engine/data/unmatched_players.json` top-30 — add overrides to `engine/data/name_overrides.json`
  2. Wire Express DB routes to real SQL queries (server/db.ts already has all query functions)
  3. Build out Assistant page (AI chat with FIFA player context)
  4. Day 4: `py -m engine.wc_ingest --source apif --day 2` (fresh 100 req) + re-run model

---

## Day-by-Day Build Schedule

| Day | Date | Deliverable | Status |
|---|---|---|---|
| 1 | Jun 4 | Repo scaffold + Phase 1 scrape (StatsBomb + API-Football Day 1) | ✅ Done |
| 2 | Jun 5 | Engine pipeline (model+optimizer) + full web scaffold (5 pages, Express, hooks) | ✅ Done |
| 3 | Jun 6 | Name-override review + wire Express routes + Assistant page (AI chat) | ← Start here |
| 4 | Jun 7 | API-Football Day 2 + re-run model + Captain/Transfers page polish | |
| 5 | Jun 8 | Squad page swap drawer + squadOptimizer.ts (Re-optimize endpoint) | |
| 6 | Jun 9 | Transfers page (greedy cards) + Live page (match cards + captain banner) | |
| 7 | Jun 10 | GitHub Actions engine.yml + Render deploy + smoke test | |
| 8 | Jun 11 | Polish + final engine run + production smoke test | |

---

## How to Start (Day 3 — current session)

### What's already done (do not re-run)
```bash
# Day 1 (DONE): statsbomb + apif day 1
# Day 2 (DONE): fifa source (re-run with position fix), model + optimizer
# DB state: 1481 players, 48 teams, 8 rounds, 571 player_stats, 11848 projections, 1 suggested_squad
```

### Day 3 manual task — name overrides (~30 min)
```bash
cd engine
py -m engine.wc_ingest --report    # prints top-30 unmatched players by price
# Review engine/data/unmatched_players.json
# Add hard cases to engine/data/name_overrides.json
```

### Day 4 — API-Football Day 2 + re-run model
```bash
cd engine
$env:PYTHONUTF8=1   # PowerShell — needed for Windows console
py -m engine.wc_ingest --source apif --day 2   # fresh 100 req quota
py -m engine.wc_run                             # re-run model + optimizer with better data
```

**IMPORTANT — API-Football notes:**
- `/players/topscorers` has NO `page` parameter — already handled in code
- Budget file: `engine/data/apif_budget.json` — day1_used=80, day2_used=0
- Day 2 run uses `--day 2` flag to use day2_used counter
- **Run AFTER Day 3 name overrides** to get maximum match benefit

### Full pipeline from scratch (if needed)
```bash
cd engine
$env:PYTHONUTF8=1
py -m pip install -r requirements.txt
py -m engine.wc_ingest --source statsbomb   # 199 match files, ~2 min, free
py -m engine.wc_ingest --source fifa        # players + rounds + teams
py -m engine.wc_ingest --source apif --day N # N=1 or N=2
py -m engine.wc_run                          # model + optimizer
```

---

## How to Run (local dev)

```bash
# Frontend + API server
cd web
npm install       # first time only — already done
npm run dev       # starts Express :3001 + Vite :5173 concurrently
# requires web/.env with DATABASE_URL + ANTHROPIC_API_KEY (gitignored)

# Engine (Windows PowerShell)
cd engine
$env:PYTHONUTF8=1          # required on Windows for unicode chars in output
py -m engine.wc_run        # Phase 2+3: model + optimizer (uses engine/.env)
py -m engine.wc_ingest ... # Phase 1: scrape data sources
```

**env files (gitignored, never commit):**
- `engine/.env`: `DATABASE_URL=` + `API_FOOTBALL_KEY=`
- `web/.env`: `DATABASE_URL=` + `ANTHROPIC_API_KEY=`

---

## Architecture

```
engine/              Python backend
├── engine/
│   ├── wc_schema.sql    7 tables: players, teams, rounds, player_stats,
│   │                              projections, team_fdr, suggested_squad
│   ├── wc_ingest.py     Phase 1: FIFA Fantasy + StatsBomb + Sofascore + API-Football
│   ├── wc_model.py      Phase 2: Bayesian xG/xA + seed FDR + xP → projections + team_fdr
│   ├── wc_optimizer.py  Phase 3: HiGHS MILP → suggested_squad (2GK/5DEF/5MID/3FWD)
│   ├── wc_run.py        Orchestrator: py -m engine.wc_run [--phase model|optimizer|all]
│   ├── db.py            psycopg3 pool, search_path=wc,public
│   └── config.py        Constants: scoring, priors, API keys, league IDs
├── data/
│   ├── sb_cache.json         1441 StatsBomb players (keyed by normalized name)
│   ├── name_overrides.json   hard-coded name mappings for fuzzy-match failures
│   ├── unmatched_players.json  961 unmatched players — review on Day 3
│   └── apif_budget.json      {day1_used: 80, day2_used: 0}
└── requirements.txt   httpx, psycopg[binary], python-dotenv, rapidfuzz, highspy

web/                 React + Express (ALL FILES WRITTEN — TypeScript clean)
├── server/
│   ├── server.ts        11 routes: 3 FIFA proxies + 8 DB/AI routes — all wired to DB
│   └── db.ts            pg.Pool, search_path=wc,public, all query functions
├── src/
│   ├── types/wc.ts           Player, Team, Round, Projection, SquadPlayer, SuggestedSquad
│   ├── store/appStore.ts     sidebar collapse + mobile menu (Zustand + persist)
│   ├── store/squadStore.ts   squad[], captain, bench, budget (Zustand + persist)
│   ├── hooks/useWC.ts        React Query hooks for all 8 API routes
│   ├── services/wcApi.ts     fetch wrappers for all routes
│   ├── components/layout/
│   │   ├── Layout.tsx        flex wrapper (sidebar + topbar + main)
│   │   ├── Sidebar.tsx       5 nav items, WC gold accent, collapse/expand, mobile drawer
│   │   └── TopBar.tsx        mobile hamburger only
│   └── pages/
│       ├── Assistant.tsx     shell (AI chat — Day 3 feature)
│       ├── Squad.tsx         working: loads suggested_squad, renders by position, populates store
│       ├── Transfers.tsx     shell (Day 4 feature)
│       ├── Captain.tsx       working: 15-row ranked list, setCaptain
│       └── Live.tsx          working: community API proxy, 60s refetch, graceful degradation
├── package.json       React 18, Vite, TailwindCSS 3, @tanstack/react-query, zustand, highs, pg
├── tailwind.config.ts accent=#E8B84B (WC gold), brand slate palette
└── tsconfig.json

.github/workflows/
└── engine.yml     TODO Day 7: crons 04:00 + 18:00 UTC, post-group update June 27
```

**DB state (after Day 2):**
- `wc.players`: 1,481 rows (48 teams, positions correctly parsed)
- `wc.teams`: 48 rows (built from rounds.json fixtures, seed/group from squads_fifa)
- `wc.rounds`: 8 rows (GROUP×3, R32, R16, QF, SF, F)
- `wc.player_stats`: 571 rows
- `wc.projections`: 11,848 rows (1481 players × 8 rounds)
- `wc.team_fdr`: 384 rows
- `wc.suggested_squad`: 1 row (round 1, £98.9m, 77.6 xP — Mbappé/Salah/Ronaldo/Raphinha)

---

## Pages Summary

| Page | Route | Guard | Key feature |
|---|---|---|---|
| Assistant | / | none | Edge AI, two starter prompt sets (no-squad / squad-context) |
| Squad | /squad | none | Pre-filled MILP optimal squad, swap drawer, Re-optimize |
| Transfers | /transfers | RequireSquad | One-at-a-time sequential greedy swap cards |
| Captain | /captain | RequireSquad | 15-row ranked list, setCaptain, FDR badge |
| Live | /live | none (degrades) | Match cards, captain swap banner → FIFA Fantasy link |

---

## API Routes

| Route | Method | Notes |
|---|---|---|
| /wc/players.json | GET | FIFA Fantasy proxy, 5min TTL |
| /wc/rounds.json | GET | FIFA Fantasy proxy, 5min TTL |
| /wc/squads_fifa.json | GET | FIFA Fantasy proxy, 30min TTL |
| /api/rounds | GET | DB rounds table |
| /api/players | GET | All ~800 players |
| /api/teams | GET | Teams + isActive flag |
| /api/projections?round=N | GET | All players sorted by xP DESC |
| /api/squad/suggest | GET | Pre-computed from suggested_squad table |
| /api/squad/optimize | POST | Live HiGHS-WASM solve |
| /api/transfers/suggest | POST | Sequential greedy, body: {squad, round, freeTransfers} |
| /api/live?round=N | GET | Community API proxy, 60s TTL |
| /api/chat | POST | Edge AI, body: {messages, squad?} |

---

## Database Schema

5 tables from `wc-edge.md` §4 plus one addition:

```sql
-- player_stats, projections, team_fdr, players, teams (see wc-edge.md §4)

-- ADDITION: pre-computed squad suggestion
CREATE TABLE suggested_squad (
    id           SERIAL PRIMARY KEY,
    round        INTEGER NOT NULL,
    squad_json   JSONB NOT NULL,
    total_xp     REAL,
    total_cost   REAL,
    computed_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX ON suggested_squad (round);
```

---

## Deployment

**Render Blueprint (`render.yaml`):**
```yaml
databases:
  - name: wc-db
    databaseName: wc_edge
    plan: free

services:
  - type: web
    name: wc-edge
    env: node
    plan: free
    buildCommand: cd web && npm install && npm run build
    startCommand: node web/dist/server/server.js
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: wc-db
          property: connectionString
      - key: ANTHROPIC_API_KEY
        sync: false
```

**GitHub Actions secrets:**
- `DATABASE_URL` — Render external Postgres connection string
- `API_FOOTBALL_KEY` — API-Football key

**Trigger engine manually:**
```bash
gh workflow run engine.yml --repo ZaarkoEvilor791/wc-edge
```

---

## Key Decisions (from grilling session)

- **`highs` npm package stays** — Squad Builder uses HiGHS-WASM for Re-optimize. The original wc-edge.md note to remove it is wrong.
- **`chatApi.ts` is NOT verbatim reuse** — must pass `squad: number[]` alongside messages (no teamId equivalent).
- **API Football key is gitignored** — live in `engine/.env` and GitHub secret only. Never commit.
- **Squad is never empty on load** — always pre-filled from `suggested_squad` DB table.
- **Transfers is one-at-a-time** — single swap card, Accept/Skip flow, sequential greedy.
- **Captain is squad-only** — 15 rows, no global player list.
- **Live is always accessible** — no RequireSquad guard. Degrades gracefully with stale banner.
- **Captain swap is advisory** — banner links to play.fifa.com/fantasy/ directly, no in-app execution.
- **WC gold accent** — `#E8B84B` in tailwind.config.ts, replaces fpl-edge teal `#00D8CB`.

---

## Brand & Design

| Token | Hex | Role |
|---|---|---|
| `accent` | `#E8B84B` | WC gold — buttons, active states |
| `accent-fg` | `#060D18` | Text on gold backgrounds |
| `slate-950` | `#060D18` | Body background |
| `slate-900` | `#0A1321` | Main surface / sidebar |
| `slate-800` | `#0F1E31` | Cards / panels |
| `slate-700` | `#162B3F` | Hover / raised |
| `slate-600` | `#1E3550` | Borders |
| `slate-400` | `#6B8EA8` | Body text |
| `slate-100` | `#E0EEF8` | Primary text |

**No purple/violet.** Sidebar pattern identical to fpl-edge (collapsible, Zustand, inline SVG icons).

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

## WC Fantasy Rules Reference

| Rule | Detail |
|---|---|
| Squad | 15 players: 2 GK / 5 DEF / 5 MID / 3 FWD |
| Budget | $100m group stage → $105m from R32+ |
| Country limit | Max 3 same country (R32→4, R16→5, QF→6, SF/F→8) |
| Transfers | Group: 2 free/MD → R32: unlimited → R16/QF: 4 → SF: 5 → Final: 6 |
| Extra transfer | −3 pts each |
| Chips | Wildcard, 12th Man, Max Captain, Qualification Booster, Mystery Booster |
| Captain | 2× points; mid-match swap to unplayed player allowed |

---

## Gotchas

- **StatsBomb 199 files** — download with 0.5s delay, ~2 min total. No rate limit but be polite.
- **API-Football 100 req/day hard cap** — track carefully. Budget in `engine/data/apif_budget.json`.
- **Sofascore unofficial** — 403 blocked (Cloudflare). AFCON 2025 falls back to AFCON 2023 StatsBomb.
- **Community live API (worldcup2026-api.vercel.app)** — no SLA. Degraded mode is a primary design constraint, not an edge case.
- **suggested_squad table must be populated** before Squad page works — `py -m engine.wc_run` after any schema changes.
- **Day 3 manual step** — review unmatched_players.json, add overrides to name_overrides.json before Day 4 apif re-run. Cannot be automated.
- **FIFA Fantasy squadId (1-48) ≠ squads_fifa.json id (43817+)** — player.squadId is a sequential index into alphabetical team list. teams table is built from rounds.json fixtures, not squads_fifa.json. Seed/group enriched by team name match.
- **highspy MILP integrality** — must use `highspy.HighsVarType.kInteger` (not integer `1`). Model status check uses `h.getModelStatus()` (not LP `primal_solution_status` which returns 0 for MIP).
- **Python on Windows** — use `py` launcher, not `python`. Set `$env:PYTHONUTF8=1` in PowerShell for unicode output.
- **wc schema search_path** — Python: `options="-c search_path=wc,public"` in psycopg3. Node: append `?options=-c%20search_path%3Dwc%2Cpublic` to connectionString.
- **Elite product team** — always convene for design/architecture/sequencing decisions before coding. User has set this as global behavior.

## Day 3 Start Checklist

```
[ ] 1. Run: py -m engine.wc_ingest --report  (see top-30 unmatched by price)
[ ] 2. Review engine/data/unmatched_players.json, add entries to name_overrides.json
[ ] 3. Wire Express API routes: server/db.ts is complete, server/server.ts has all routes
[ ] 4. Build Assistant page: AI chat with starter prompts, squad context
[ ] 5. Test end-to-end: npm run dev → http://localhost:5173 → Squad page renders with squad
```
