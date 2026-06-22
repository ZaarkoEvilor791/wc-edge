> **Context consolidated** — Key decisions from this pre-build design plan have been extracted into [`.knowledge/sessions/000-existing-context.md`](.knowledge/sessions/000-existing-context.md). This file is the original design spec; CLAUDE.md and the knowledge file are current truth.

# wc-edge — FIFA WC 2026 Fantasy Tool: Full Design Plan

**Status:** Grilling complete (data layer + model + engine architecture). Remaining: Express API routes, pages/UX, deployment details.  
**Deadline:** June 12, 2026 (WC Day 1). 8-day build.  
**Repo:** `wc-edge` (new, separate from fpl-edge). Fork fpl-edge infra.

---

## Context

Lite fantasy prediction + optimization tool for `play.fifa.com/fantasy/`. Separate GitHub repo, new Render service. No paid API keys beyond API-Football free tier.

---

## 1. Data Sources (Finalized)

### 1.1 FIFA Fantasy API (Primary — Free, No Auth)

Base: `https://play.fifa.com/json/fantasy/`

| Endpoint | Fields | Use |
|---|---|---|
| `players.json` | id, firstName, lastName, squadId, position, price, status, percentSelected, stats{totalPoints, avgPoints, form, lastRoundPoints, roundPoints[]} | Player list, live stats |
| `rounds.json` | id, stage, startDate, endDate, status, tournaments[] | Round info, fixtures |
| `squads_fifa.json` | id, name, abbr, seed, group, isActive | National team metadata |

**Key gaps:** No club info, no xG/xA, no minutes. Player `fifaId` field currently null.

### 1.2 StatsBomb Open Data (Tournament Stats — Free, True xG/xA)

GitHub raw: `https://raw.githubusercontent.com/statsbomb/open-data/master/data/`

| Tournament | Competition ID | Season ID | Matches | Stats |
|---|---|---|---|---|
| WC 2022 | 43 | 106 | 64 | xG, xA, minutes, goals, assists, saves |
| Euro 2024 | 55 | 282 | 51 | xG, xA, minutes |
| Copa America 2024 | 223 | 282 | 32 | xG, xA, minutes |
| AFCON 2023 | 1267 | 107 | 52 | xG, xA, minutes |

**Total:** 199 match event files. No rate limit (CDN-served). ~2 min to download at 0.5s delay.

**xG extraction:** `shot.statsbomb_xg` per Shot event.  
**xA extraction:** `pass.shot_assist=True` → `pass.assisted_shot_id` → that shot's `statsbomb_xg`.  
**Minutes:** Starting XI events → 90 mins default; Substitution events adjust in/out times.  
**GK saves:** `Goal Keeper` events with outcome = `Saved`.

### 1.3 API-Football (Club Stats + Tournament Gaps — Free, 100 req/day)

Base: `https://v3.football.api-sports.io/`  
Key: `$API_FOOTBALL_KEY` (set in `engine/.env` and GitHub Actions secret)  
Rate: 100 req/day, 10 req/min. Plan active until 2027-06-04.

**Stats available:** `games.minutes`, `goals.total`, `goals.assists`, `shots.total`, `shots.on`, `passes.key`, `games.rating`, `cards.*`, `penalty.*` — **NO xG/xA anywhere.**

**Confirmed working leagues (league_id / season):**

| League | ID | Season |
|---|---|---|
| EPL | 39 | 2024 |
| La Liga | 140 | 2024 |
| Bundesliga | 78 | 2024 |
| Serie A | 135 | 2024 |
| Ligue 1 | 61 | 2024 |
| Eredivisie | 88 | 2024 |
| Primeira Liga | 94 | 2024 |
| Scottish Prem | 179 | 2024 |
| Jupiler Pro | 144 | 2024 |
| Saudi Pro League | 307 | 2023 |
| Brasileirão | 71 | 2024 |
| Liga Profesional (ARG) | 128 | 2024 |
| Liga MX | 262 | 2024 |
| J1 League | 98 | 2024 |
| Copa America 2024 | 9 | 2024 |
| CONCACAF Gold Cup 2023 | 22 | 2023 |

**Not working on free tier:** AFCON 2025 (0 results), K-League 2025 (0 results), J1 League 2025 (0 results — use 2024).

### 1.4 Sofascore (AFCON 2025 Patch — Unofficial, No Auth)

Base: `https://api.sofascore.com/api/v1/`

- AFCON 2025: tournament ID `270`, season ID `71636`
- Player stats endpoint: `/player/{id}/unique-tournament/270/season/71636/statistics/overall`
- Returns: `goals`, `assists`, `minutesPlayed` (confirmed: Brahim Díaz 5 goals, 591 mins)
- **No xG/xA**

---

## 2. Scrape Architecture (Finalized)

### Two-Phase Engine

```
Phase 1: wc_ingest.py   → APIs → player_stats table   (expensive, ~2 days API budget)
Phase 2: wc_model.py    → player_stats → projections   (free recompute, pure math)
```

Phase 2 can re-run without Phase 1. Model formula changes = free recompute.

### Scrape Pipeline Order

```
Step 1: FIFA Fantasy players.json      → 800 players, names, squadIds, prices   (free)
Step 2: StatsBomb (199 match files)    → xG/xA per player across 4 tournaments  (free)
Step 3: Sofascore AFCON 2025          → goals/assists/minutes for ~80 players   (free)
Step 4: Fuzzy match Steps 1-3         → tag which players are already covered
Step 5: API-Football                  → club stats for uncovered players + all leagues
```

StatsBomb covers ~500 unique players with true xG/xA. After Steps 2-3, ~300 players remain uncovered (MLS depth, Saudi domestic, Asian league players).

### API-Football Budget (100 req/day × 2 days = 200 total)

**Day 1 (100 req):**
- `topscorers` + `topassists` for 15 leagues (30 req) — 20 players per request
- Pagination depth Big 5: 3 extra pages each (15 req)
- Copa America 2024, Gold Cup 2023, J-League, K-League top scorers (8 req)
- Buffer/retry (47 req)

**Day 2 (100 req):**
- Fill gaps: leagues flagged as uncovered in Step 4 (90 req)
- WC 2022 calibration: `topscorers` 2021-22 Big 5 for mf regression (10 req)

### Name Matching Pipeline

Three datasets with different name formats:
```
FIFA Fantasy:  "Vinícius Júnior"    "Son Heung-min"    "Rúben Dias"
StatsBomb:     "Vinícius Júnior"    "Heung-Min Son"    "Rúben Dias"
API-Football:  "Vinicius Junior"    "H. Son"           "R. Dias"
```

**Pipeline (in order):**
1. Normalize both sides: strip diacritics, lowercase, strip punctuation
2. Pass 1: exact normalized match → catches ~80%
3. Pass 2: `rapidfuzz.token_set_ratio ≥ 85` → handles name ordering (Son/Heung-Min), partials
4. Pass 3: `data/name_overrides.json` lookup → pre-seeded known hard cases
5. Below threshold → `data/unmatched_players.json` sorted by price descending
6. **Day 3 of build:** manual review, fix top-30 unmatched by price
7. **Day 4:** re-run Phase 1 with overrides, write final `player_stats`

**Key decision:** `token_set_ratio` (not `ratio` or `token_sort_ratio`) — handles Korean/Japanese name ordering automatically. No special-case Asian name logic needed.

**False positive prevention:** wrong match is worse than no match (price prior fallback is harmless; wrong match poisons projection). High precision over recall.

**Pre-seed `data/name_overrides.json`** with known hard cases before build starts:
```json
{
  "vinicius junior": "vinícius júnior",
  "h. son": "son heung-min",
  "r. dias": "rúben dias"
}
```

**API-Football ID resolution:** resolved as a byproduct of the league scrape — when fetching `topscorers?league=39`, store `{normalized_name: api_football_id}` map. Zero extra requests.

---

## 3. Projection Model (Finalized)

### 3.1 Data Quality Tiers

| Tier | Source | Stats | Weight modifier |
|---|---|---|---|
| 1 | API-Football current season | goals90, assists90, minutes | recency=1.0, context=1.0 |
| 2 | StatsBomb Euro24 / Copa A24 | xG90, xA90, minutes | recency=0.85^1, context=0.75 |
| 3 | StatsBomb AFCON23 / WC22 | xG90, xA90, minutes | recency=0.85^2-4, context=0.75 |
| 4 | Price/position prior | positional mean × price_scale | virtual 300 mins |

StatsBomb takes priority over API-Football for any tournament it covers (true xG/xA vs goals/assists proxy).

### 3.2 Bayesian Posterior (xG90 and xA90)

```python
def xg90_posterior(pos, price, club_source, tournament_sources):
    prior = PRIOR_XG90[pos] * (price / MEDIAN_PRICE[pos])
    prior_weight = 300  # virtual minutes

    num = prior * prior_weight
    den = prior_weight

    for source in [club_source] + tournament_sources:
        recency  = 0.85 ** source.years_old
        context  = 1.0 if not source.is_tournament else 0.75
        # xg90 blend: 0.7 * true_xG + 0.3 * actual_goals if both available
        rate = 0.7 * source.xg90 + 0.3 * source.goals90 if source.has_xg else source.goals90
        w = source.minutes * recency * context
        num += rate * w
        den += w

    return num / den  # same structure for xa90
```

**Constants:**
- `prior_weight = 300` (virtual minutes — real data from 3+ games dominates)
- `decay = 0.85` per year
- `tournament_discount = 0.75`
- `xg_blend = 0.7 xG + 0.3 goals` (xG more predictive at small samples)

### 3.3 Minutes Factor (mf)

Replace position prior with actual club start rate from API-Football, corrected for WC context.

**Initial hardcoded constants** (calibrate from WC 2022 data post-launch):
```python
INTERCEPT = {'GK': 0.85, 'DEF': 0.20, 'MID': 0.18, 'FWD': 0.15}
SLOPE     = {'GK': 0.12, 'DEF': 0.72, 'MID': 0.68, 'FWD': 0.64}

def wc_minutes_factor(club_start_rate, pos):
    return min(1.0, INTERCEPT[pos] + SLOPE[pos] * club_start_rate)
```

GK intercept 0.85 = almost never rotated. Outfield intercept ~0.18 = bench players still get WC minutes.

### 3.4 Fixture Difficulty (Dynamic FDR)

**Two separate FDR values per team per round:**
- `attacking_fdr`: opponent's attacking threat → affects YOUR clean sheet probability
- `defensive_fdr`: opponent's defensive weakness → affects YOUR xG opportunity

**Group stage (seed-based prior):**
```python
SEED_LAMBDA = {1: 0.75, 2: 1.00, 3: 1.30, 4: 1.65}  # expected goals conceded vs seed N
lambda_prior = SEED_LAMBDA[opponent_seed]
pcs = exp(-lambda_prior)
```

**Post-group (Bayesian update, fired by GitHub Actions cron after last group match):**
```python
# xg_blend: 0.7 * xG_created_pg (StatsBomb if available) + 0.3 * goals_pg
attacking_strength = 0.7 * opponent_xG_created_pg + 0.3 * opponent_goals_pg
prior_weight = 3  # equivalent to 3 virtual matches
actual_weight = 3  # group games played
lambda_posterior = (prior_weight * lambda_prior + actual_weight * attacking_strength) \
                 / (prior_weight + actual_weight)
pcs = exp(-lambda_posterior)

# defensive multiplier for attacker xG
TOURNAMENT_AVG_XGC = <computed from WC 2022 StatsBomb at scrape time>
defensive_multiplier = opponent_xGC_pg / TOURNAMENT_AVG_XGC
# neutral opponent → 1.0x, leaky → >1.0x, tight → <1.0x
```

**FDR 1-5 in UI only** — computed post-hoc by bucketing `lambda_posterior` into quintiles. Model never uses discrete FDR.

### 3.5 GK Saves Model

```python
# Where StatsBomb data exists: per-GK saves90 from Goal Keeper events
saves_ev = player.saves90 * mf * SAVE_PTS_PER_3  # +1 per 3 saves

# Fallback (GKs not in StatsBomb):
saves_ev = (team_sot_against_per90 * 0.70 / 3) * mf * SAVE_PTS
# team_sot_against from API-Football team stats; 0.70 = average WC GK save rate
```

### 3.6 Full xP Formula

```python
xP = p_play * mf * (
    xg90_posterior * GOAL_PTS[pos]
  + xa90_posterior * 3
  + exp(-lambda_posterior) * CS_PTS[pos]      # Poisson CS model
  + appearance_pts                              # +1 <60min, +2 ≥60min
  + saves_ev                                   # GK only
  + xgc_deduct                                 # GK/DEF only (-1 per goal after 1st)
)

# With fixture adjustment:
xg90_adj = xg90_posterior * defensive_multiplier  # opponent's defensive weakness
```

**Scoring constants:**
```python
GOAL_PTS = {1: 9, 2: 7, 3: 6, 4: 5}   # GK/DEF/MID/FWD
CS_PTS   = {1: 5, 2: 5, 3: 1, 4: 0}
ASSIST_PTS = 3
SAVE_PTS_PER_3 = 1
SCOUTING_BONUS = 2  # ≥4 pts + <5% owned
```

### 3.7 Live Tournament Updates (Post-Round 1)

**Option A2 — Bayesian blend, observed weight grows with rounds played:**

```python
rounds_played = current_round - 1
obs_weight = rounds_played * 90   # each round = 90 virtual minutes of evidence
prior_weight = 300

xp_blended = (prior_xp * prior_weight + fifa_fantasy_avgPoints_pg * obs_weight) \
           / (prior_weight + obs_weight)
# After round 3: obs_weight=270 vs prior_weight=300 — nearly equal
# After round 5: observed dominates, prior fades to ~25%
```

FIFA Fantasy `avgPoints` sourced from `players.json` stats object — zero extra API calls.

---

## 4. Database Schema (Finalized)

```sql
-- Phase 1 output: raw scraped data
CREATE TABLE player_stats (
    element          INTEGER PRIMARY KEY,  -- FIFA Fantasy player ID
    api_football_id  INTEGER,

    -- Club (API-Football, current season)
    club_goals90     REAL,
    club_assists90   REAL,
    club_minutes     INTEGER,
    club_start_rate  REAL,
    club_saves90     REAL,          -- GK only

    -- Best tournament (StatsBomb preferred → API-Football → Sofascore)
    tourn_source     TEXT,          -- 'sb_wc22'|'sb_euro24'|'sb_copa24'|'sb_afcon23'|'apif'|'sofa'
    tourn_xg90       REAL,          -- true xG if StatsBomb, goals90 if API-Football/Sofascore
    tourn_xa90       REAL,
    tourn_minutes    INTEGER,
    tourn_age_years  REAL,          -- years since tournament end (for decay)
    tourn_saves90    REAL,          -- GK only

    scraped_at       TIMESTAMP DEFAULT NOW()
);

-- Phase 2 output: computed projections per player per round
CREATE TABLE projections (
    element              INTEGER,
    round                INTEGER,

    -- Intermediate values (stored for debuggability + UI transparency)
    mf                   REAL,
    p_play               REAL,
    xg90_posterior       REAL,
    xa90_posterior       REAL,
    lambda_posterior     REAL,
    pcs                  REAL,
    defensive_multiplier REAL,

    -- Outputs
    xp                   REAL,
    variance             REAL,
    p_goal               REAL,
    p_cs                 REAL,

    updated_at           TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (element, round)
);

-- Dynamic FDR per team per round (recomputed post-group)
CREATE TABLE team_fdr (
    squad_id          INTEGER,
    round             INTEGER,
    lambda_posterior  REAL,
    def_multiplier    REAL,
    xg_created_pg     REAL,
    xgc_pg            REAL,
    goals_pg          REAL,
    goals_conceded_pg REAL,
    updated_at        TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (squad_id, round)
);

-- Players reference table (from FIFA Fantasy API)
CREATE TABLE players (
    element          INTEGER PRIMARY KEY,
    first_name       TEXT,
    last_name        TEXT,
    known_name       TEXT,
    squad_id         INTEGER,
    position         TEXT,    -- GK/DEF/MID/FWD
    price            REAL,
    status           TEXT,
    percent_selected REAL,
    updated_at       TIMESTAMP DEFAULT NOW()
);

-- National teams (from squads_fifa.json)
CREATE TABLE teams (
    squad_id    INTEGER PRIMARY KEY,
    name        TEXT,
    abbr        TEXT,
    seed        INTEGER,   -- 1-4, group stage seeding
    group_name  TEXT       -- A-H
);
```

---

## 5. Squad Optimizer (Finalized)

**MILP using HiGHS** — adapted from `fpl-edge/engine/engine/optimizer.py`.

Key changes from fpl-edge:
- Team limit 3 → country limit 3 (max 3 players per `squad_id`)
- Formation: 2 GK / 5 DEF / 5 MID / 3 FWD (15 players total)
- Budget: $100m (increases to $105m from R32+)
- Country limit increases in later rounds: R32→4, R16→5, QF→6, SF/F→8

**No MILP on Transfers page** — squad builder only. Keeps footprint minimal.

---

## 6. GitHub Actions Triggers (Finalized)

```yaml
# engine.yml
on:
  schedule:
    - cron: '0 4 * * *'    # Daily projection recompute (Phase 2 only)
    - cron: '0 18 * * *'   # Second daily run (evening matches)
    - cron: '0 6 27 6 *'   # Post-group FDR update (morning after last group match)
  workflow_dispatch:         # Manual trigger
```

**Post-group cron** fires once, triggers Phase 2 recompute with dynamic Poisson lambdas replacing seed-based priors. Hardcoded date — simpler than checking match status.

**Pre-tournament scrape** (Phase 1): manual dispatch only. Run Days 1-2 of build, then again Day 4 after manual name-override review.

---

## 7. Engine File Structure

```
engine/
├── engine/
│   ├── wc_schema.sql       -- 5 tables (players, teams, rounds, projections, player_stats, team_fdr)
│   ├── wc_ingest.py        -- Phase 1: fetch all data sources → player_stats
│   │   ├── fetch_statsbomb()     -- download 199 match files, aggregate xG/xA/mins per player
│   │   ├── fetch_api_football()  -- topscorers/players by league, budget-aware
│   │   ├── fetch_sofascore()     -- AFCON 2025 patch
│   │   ├── fetch_fifa_fantasy()  -- players.json + squads_fifa.json + rounds.json
│   │   └── fuzzy_match()        -- 3-pass name matching with overrides
│   ├── wc_model.py         -- Phase 2: player_stats → projections
│   │   ├── xg90_posterior()      -- Bayesian blend
│   │   ├── wc_minutes_factor()   -- WC-corrected mf
│   │   ├── compute_fdr()        -- Poisson lambda, Bayesian update post-group
│   │   └── build_projection()   -- full xP formula
│   ├── wc_run.py           -- entrypoint: orchestrates Phase 1 + Phase 2
│   ├── db.py               -- COPY from fpl-edge (unchanged)
│   └── config.py           -- constants: API keys, league IDs, prior tables
├── data/
│   ├── name_overrides.json -- pre-seeded known hard cases
│   └── unmatched_players.json -- generated by ingest, reviewed Day 3
└── requirements.txt        -- httpx, psycopg[binary], python-dotenv, rapidfuzz, highspy
```

**Reused from fpl-edge verbatim:**
- `engine/engine/db.py` — connection management
- `engine/engine/optimizer.py` — MILP solver (adapt constraints)
- `web/server/cache.ts` — TTL cache
- `web/src/services/chatApi.ts` — Edge AI chat

---

## 8. WC Fantasy Rules Reference

| Rule | Detail |
|---|---|
| Squad | 15 players: 2 GK / 5 DEF / 5 MID / 3 FWD |
| Budget | $100m (→ $105m from R32+) |
| Country limit | Max 3 same country (R32→4, R16→5, QF→6, SF/F→8) |
| Transfers | Group stage: 2 free/MD → R32: unlimited → R16/QF: 4 free → SF: 5 → Final: 6 |
| Extra transfer cost | −3 pts each |
| Chips | Wildcard, 12th Man (bench full pts), Max Captain, Qualification Booster, Mystery Booster |
| Live | Mid-match captain change (to unplayed player), mid-match auto-sub |
| Captain | 2× points |

**Scoring:**
| Event | Pts |
|---|---|
| GK goal | +9 |
| DEF goal | +7 |
| MID goal | +6 |
| FWD goal | +5 |
| GK/DEF clean sheet | +5 |
| MID clean sheet | +1 |
| Assist | +3 |
| Penalty won | +2 |
| Appearance <60 min | +1 |
| Appearance ≥60 min | +2 |
| Per 3 GK saves | +1 |
| Goals conceded ≥2 (GK/DEF) | −1 per goal after 1st |
| Yellow card | −1 |
| Red card | −2 |
| Scouting bonus (≥4pts, <5% owned) | +2 |

---

## 9. Remaining Branches (Not Yet Grilled)

- **Express API routes** — what endpoints serve what to the frontend
- **Pages/UX** — what each of the 5 pages (Squad, Transfers, Captain, Live, Assistant) shows
- **Deployment** — render.yaml, env vars, GitHub secrets

---

## 10. Build Schedule

| Day | Date | Goal |
|---|---|---|
| 1 | Jun 4 | Repo scaffold + Phase 1 scrape run (StatsBomb + API-Football Day 1) |
| 2 | Jun 5 | Phase 1 complete (API-Football Day 2) + TypeScript types + React Query hooks |
| 3 | Jun 6 | Manual name-override review + Python projection engine (Phase 2) |
| 4 | Jun 7 | Re-run Phase 1 with overrides + Express server + all API routes |
| 5 | Jun 8 | Squad Builder + MILP optimizer |
| 6 | Jun 9 | Captain + Transfers + Assistant pages |
| 7 | Jun 10 | Live page + GitHub Actions + Render deploy |
| 8 | Jun 11 | Polish + final engine run — production-ready |

---

## 11. Key Technical Decisions Log

| Decision | Choice | Rationale |
|---|---|---|
| xG source | StatsBomb (true xG) + goals90 proxy elsewhere | No free real-time xG/xA API exists |
| AFCON 2025 | Sofascore unofficial API (no auth) | Not in StatsBomb; not in API-Football free tier |
| Live model | Bayesian blend (Option A2) | Prevents overcorrection on 1 lucky game; prior fades after 5 rounds |
| Squad optimizer | MILP / HiGHS | Country constraint breaks greedy reliably; optimizer.py already in fpl-edge |
| FDR model | Poisson continuous, not discrete buckets | Preserves information; FDR 1-5 is UI-only display |
| xG/goals blend | 0.7 × xG + 0.3 × goals | xG more predictive at small samples (3 group games) |
| DB design | Store intermediate values alongside xP | Debuggability + free recompute when model formula changes |
| WC mf calibration | Hardcoded initial constants | No API budget for 2021-22 calibration; calibrate empirically post-launch |
| Name matching | token_set_ratio ≥ 85, pre-seeded overrides | Handles name ordering (Asian names) automatically |
| Post-group trigger | Hardcoded cron | Simpler than status-checking; acceptable for v1 |
