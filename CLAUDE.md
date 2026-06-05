# wc-edge Project Guide

**Project:** FIFA WC 2026 Fantasy Companion Tool — squad builder, transfer advisor, captain picker, live tracker, Edge AI advisor.

**Deadline:** June 11, 2026. Tournament starts June 12, 2026.

**Production URL:** `https://wc-edge.onrender.com`

**Local dev:** frontend `http://localhost:5173`, Express API `http://localhost:3001`

**Database:** Shared fpl-edge Postgres (`fpledge` DB), `wc` schema. External URL in `engine/.env`, internal URL in Render env.

**PRD:** https://github.com/ZaarkoEvilor791/fpl-edge/issues/12 · Full design doc: `wc-edge.md`

---

## Current State (Days 1–9 complete)

All 5 pages built, polished, and bug-free. DB populated. TypeScript clean.

**DB:** 1,481 players · 8 rounds · 11,848 projections · 384 team_fdr rows · 1 suggested_squad (round 1, £98.9m, 77.6 xP)

**Squad composition:** 2GK/5DEF/5MID/3FWD · Ramírez + Osako as GKs · Mbappé/Salah/Ronaldo/Raphinha in XI

**apif budget:** `day1_used: 80, day2_used: 0` — Day 2 run still available

**Known deferred:**
- `wc.teams` may have 80 rows (32 duplicates with squad_id > 1000). Fix: `DELETE FROM wc.teams WHERE squad_id > 1000;` then re-run `py -m engine.wc_ingest --source fifa`
- Anthropic credits needed for `/api/chat` and `/api/squad/from-screenshot`

---

## Day 10 Priorities

1. **GitHub Actions `engine.yml`** — crons 04:00 + 18:00 UTC; `py -m engine.wc_run`; post-group bonus run June 27. Secrets: `DATABASE_URL`, `API_FOOTBALL_KEY`. File: `.github/workflows/engine.yml`.
2. **Render deploy** — confirm `https://wc-edge.onrender.com` loads all 5 pages.
3. **Production smoke test** — Squad, Captain, Transfers, Live, Assistant. Check `/api/fdr?round=1`, `/api/live`, sub-in/sub-out on prod.
4. **ELIMINATED badge**:
   - `ALTER TABLE wc.teams ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;`
   - Update `GET /api/teams` to include `is_active`; add `isActive` to `Team` type in `wc.ts`
   - Show "ELIMINATED" badge on Transfers SwapCard OUT player when `team.is_active = false`
5. **Final engine run** (if apif budget): `py -m engine.wc_ingest --source apif --day 2` → `py -m engine.wc_run`
6. **AI chat credits** — top up Anthropic; test `/api/chat` and `/api/squad/from-screenshot` end-to-end.

---

## How to Run

```bash
# Frontend + API server
cd web
npm run dev       # Express :3001 + Vite :5173 concurrently
# requires web/.env: DATABASE_URL + ANTHROPIC_API_KEY

# Engine (Windows PowerShell)
cd engine
$env:PYTHONUTF8=1
py -m engine.wc_run                          # model + optimizer
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
│   ├── wc_optimizer.py  Phase 3: HiGHS MILP → suggested_squad
│   ├── wc_run.py        Orchestrator: py -m engine.wc_run
│   ├── db.py            psycopg3 pool, search_path=wc,public
│   └── config.py        scoring constants, API keys, league IDs
└── data/
    ├── sb_cache.json         1441 StatsBomb players
    ├── name_overrides.json   13 hard-coded name mappings
    └── apif_budget.json      {day1_used: 80, day2_used: 0}

web/
├── server/
│   ├── server.ts   13 routes: 3 FIFA proxies + DB/AI routes
│   └── db.ts       pg.Pool, search_path=wc,public, all query functions
└── src/
    ├── types/wc.ts
    ├── store/appStore.ts      sidebar + onboarding state (Zustand + persist)
    ├── store/squadStore.ts    squad[], captain, viceCaptain (Zustand + persist)
    ├── hooks/useWC.ts         React Query hooks
    ├── services/wcApi.ts      fetch wrappers
    ├── components/shared/     Pitch, PitchPlayerCard, PlayerProfileModal,
    │                          OnboardingModal, SwapDrawer, RoundXpChart,
    │                          StatCard, Spinner, Logo
    └── pages/                 Assistant, Squad, Transfers, Captain, Live
```

---

## Pages Summary

| Page | Route | Guard | Key feature |
|---|---|---|---|
| Assistant | / | none | Edge AI, starter chips, squad context |
| Squad | /squad | none | Pitch + list view, swap drawer, modal, budget bar |
| Transfers | /transfers | RequireSquad | Sequential greedy, Accept/Skip/Undo, −3pts badge |
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
| /api/squad/optimize | POST | Live HiGHS-WASM solve |
| /api/squad/from-screenshot | POST | Claude Haiku Vision → matched players |
| /api/transfers/suggest | POST | Sequential greedy, {squad, round, freeTransfers} |
| /api/fdr?round=N | GET | FDR 1–5 per team |
| /api/fixtures/:squadId | GET | Per-team fixture list from rounds.json |
| /api/live?round=N | GET | Community API proxy; falls back to FIFA schedule |
| /api/chat | POST | Edge AI, {messages, squad?} |

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
gh workflow run engine.yml --repo ZaarkoEvilor791/wc-edge  # manual trigger
```

---

## Key Decisions

- **`highs` npm package stays** — Squad Builder uses HiGHS-WASM for Re-optimize.
- **API Football key is gitignored** — `engine/.env` and GitHub secret only. Never commit.
- **Squad never empty on load** — always pre-filled from `suggested_squad` DB table.
- **Transfers is one-at-a-time** — single swap card, Accept/Skip/Undo flow.
- **Captain is squad-only** — 15 rows, no global player list.
- **Live is always accessible** — no RequireSquad guard. Stale mode is primary design constraint.
- **Captain swap is advisory** — banner links to play.fifa.com/fantasy/, no in-app execution.
- **WC gold accent** — `#E8B84B` in `tailwind.config.ts`. Never use purple/violet.
- **Elite product team** — always convene `/elite-product-team` for design/architecture decisions before coding.
- **getXI is array-order based** — first N players of each position in the store array = XI. Pre-sort by xP on DB load; manual swaps exchange array positions.
- **Server returns up to 6 transfer suggestions** — `freeTransfers` is badge threshold only, not loop limit.

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
- **Country limit warning threshold** — `n > 3` for group stage (3 is the allowed max). Round-aware thresholds TODO: R32=4, R16=5, QF=6, SF/F=8.
- **SwapDrawer sub-in vs sub-out** — bench player triggers sub-in (options = XI starters); starter triggers sub-out (options = bench). Target player excluded from its own option list.
- **FT stepper `−` button** — uses U+2212 minus sign, not U+002D hyphen. Use `.nth(0)` selector in tests.
