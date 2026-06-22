> **Context consolidated** — Product requirements and decisions from this PRD have been extracted into [`.knowledge/sessions/000-existing-context.md`](.knowledge/sessions/000-existing-context.md). This file is the original PRD; CLAUDE.md is current truth.

# wc-edge PRD — FIFA WC 2026 Fantasy Companion Tool

## Problem Statement

WC 2026 fantasy players on play.fifa.com/fantasy/ have no data-driven companion tool. They must rely on gut feel when building a 15-player squad from ~800 options, managing transfers across elimination rounds, picking a captain each matchday, and reacting to live match events mid-game. The consequence: suboptimal squads, missed captain swap windows, and wasted free transfers on low-upside moves.

---

## Solution

wc-edge is a standalone fantasy companion tool (separate repo and Render service from fpl-edge) that gives WC 2026 fantasy players a model-backed squad builder, transfer advisor, captain picker, and live tracker — all without requiring login or account linkage to FIFA Fantasy. It uses free public data sources (FIFA Fantasy API, StatsBomb open data, API-Football free tier) and a Bayesian projection model adapted for the tournament context. An AI advisor (Edge) provides personalised guidance when the user's squad is known.

---

## User Stories

### Squad Building

- As a new wc-edge user, I want to see a pre-filled optimal 15-player squad when I open the Squad page, so that I have a competitive starting point without needing to research 800 players myself.
- As a user reviewing the suggested squad, I want to see the total projected xP and budget used in the header, so that I can assess the suggestion quality at a glance.
- As a user who wants to customise the suggestion, I want to tap any player card to open a swap drawer, so that I can replace players I disagree with.
- As a user browsing the swap drawer, I want players filtered by position and sorted by xP delta (best upgrade first), so that I immediately see the highest-value replacements.
- As a user swapping players, I want the budget bar and country-count bar to update live after every change, so that I never accidentally build an illegal squad.
- As a user who has violated a constraint, I want the Confirm button to be disabled and the violation highlighted inline, so that I know exactly what to fix before confirming.
- As a user who wants the model's best answer, I want to tap Re-optimize and get a fresh MILP-optimal squad in under 3 seconds, so that I can reset to the global optimum after manual tinkering.
- As a user who has finalised my squad, I want to tap Confirm and be redirected to the Transfers page, so that the next action is obvious.
- As a returning user before a later round, I want my confirmed squad to still be present in the app, so that I do not have to rebuild from scratch.

### Transfers

- As a user visiting Transfers, I want to see how many free transfers I have this round prominently, so that I know the cost of additional moves before deciding.
- As a user with an eliminated player, I want that player flagged with an ELIMINATED badge on the sell side of the recommendation, so that I understand why the model is recommending I sell them.
- As a user reviewing a suggested swap, I want to see both the sell and buy sides simultaneously (player name, nation, position, xP, price) with the net xP gain and cost delta, so that I can make an informed decision in one view.
- As a user who agrees with the suggestion, I want to tap Accept and immediately see the next-best swap recommendation, so that multi-transfer sessions flow without friction.
- As a user who disagrees with the suggestion, I want to tap Skip and see an alternative recommendation, so that I am not forced into a move I do not want.
- As a user who wants to shop manually, I want a Browse All button that opens a full player list filtered by position and budget, so that I can find a specific player without accepting any model suggestion.
- As a user making more transfers than my free allowance, I want the cost badge to show "-3 pts" on each additional swap card, so that I consciously accept the hit rather than being surprised post-deadline.
- As a user who accepted a swap by mistake, I want to undo it within the same session before the page is refreshed, so that I can correct errors without losing my squad state.

### Captain

- As a user selecting a captain, I want to see only my 15 confirmed squad players ranked by xP, so that I am not distracted by players I do not own.
- As a user comparing options, I want to see xP and variance side-by-side per player, so that I can consciously choose between a safe floor and a ceiling swing.
- As a user who trusts the model, I want the top-ranked player highlighted as "Edge pick" with a distinct visual indicator, so that the recommended choice is immediately clear.
- As a user who wants fixture context, I want a difficulty badge per player row (FDR 1-5 based on opponent lambda), so that I can factor in upcoming fixture strength without leaving the page.
- As a user tapping a captain choice, I want the selection confirmed instantly with a filled (C) badge and the previous selection cleared, so that there is no ambiguity about who my captain is.
- As a user who has set a captain in wc-edge, I want a persistent reminder to also set it on play.fifa.com, so that I do not lose the 2x multiplier because I forgot to mirror my choice.
- As a user approaching a deadline, I want the round deadline and a countdown shown on the Captain page, so that I know how much time I have before I must decide.

### Live

- As a user watching live matches, I want to see match cards grouped by fixture showing only my squad players within each match, so that I can track my relevant players without scrolling through all 22.
- As a user checking live points, I want each of my players to show their current live points coloured by performance (teal 6+, amber 2-5, red less than 2), so that I can assess my round at a glance.
- As a user whose live data source is unavailable, I want to see the last successfully fetched values with a "Live data last updated Xm ago" banner, so that I always have some data rather than an empty page.
- As a user with a captain swap opportunity, I want a prominent banner telling me which of my players has not kicked off yet and their projected xP, so that I know whether to act before the window closes.
- As a user who wants to act on a captain swap, I want the banner to link directly to play.fifa.com/fantasy/ in one tap, so that I reach the action destination without navigating through intermediate screens.
- As a user without a squad, I want the Live page to still show all match scores, so that I can use it for discovery even before building a squad.
- As a user with bench players, I want to see static auto-sub pairings ("Bench DEF auto-subs if starter misses 60 mins"), so that I understand my safety net for each position.

### Assistant (Edge AI)

- As a user who has not built a squad yet, I want Edge to offer globally-relevant starter prompts, so that I can get useful advice immediately.
- As a user who has confirmed a squad, I want Edge starter prompts to become squad-specific, so that questions are personalised to my team.
- As a user asking Edge about captaincy, I want the response to reference my actual squad players by name and xP, so that the advice is actionable rather than generic.
- As a user asking Edge about transfers, I want the response to account for which of my players are from eliminated nations, so that the advice is round-aware.
- As a user asking about chips, I want Edge to know the WC chip names and rules (Wildcard, 12th Man, Max Captain, Qualification Booster, Mystery Booster), so that advice uses correct terminology.
- As a user unfamiliar with WC Fantasy scoring, I want Edge to be able to explain scoring rules and chip mechanics accurately, so that I can learn while getting advice.

### General / Navigation

- As a first-time user, I want to land on the Assistant page by default, so that I get an overview of Edge capabilities before committing to building a squad.
- As a user who navigates to Transfers without a squad, I want to be redirected to the Squad page with a contextual banner, so that the dependency is explained rather than showing a broken empty state.
- As a user who navigates to Captain without a squad, I want the same redirect behaviour as Transfers, so that the UX is consistent.
- As a user on any page, I want the sidebar to remain collapsible and persist its state across page navigations, so that screen real estate is managed to my preference.
- As a user, I want the app accent colour to be WC gold rather than FPL teal, so that the visual identity reflects the tournament context.

---

## Implementation Decisions

### Architecture

- wc-edge is a standalone repo and Render service, separate from fpl-edge. It shares structural patterns but no runtime code or database.
- Engine (Python) and web server (Node/Express + React) co-located in a single repo, following fpl-edge layout.
- Engine runs via GitHub Actions: two daily crons (04:00 + 18:00 UTC) and a one-time post-group cron (June 27, 06:00 UTC). Phase 1 scrape is manual dispatch only.
- Render free tier: wc-db (Postgres 256MB) + wc-edge (Node web service). Blueprint deploy via render.yaml.

### Data Pipeline (Two-Phase Engine)

- **Phase 1** (`wc_ingest.py`): FIFA Fantasy API, StatsBomb open data (199 match files, WC 2022 / Euro 2024 / Copa 2024 / AFCON 2023), Sofascore for AFCON 2025, API-Football for club stats. Three-pass fuzzy name matching with rapidfuzz `token_set_ratio >= 85` and pre-seeded `name_overrides.json`. False positives (wrong match) are worse than no match — precision over recall.
- **Phase 2** (`wc_model.py`): Bayesian xG90/xA90 posteriors, WC-adjusted minutes factor, Poisson clean sheet probability (seed-based pre-tournament, Bayesian update post-group), full xP formula, MILP for suggested squad.

### Projection Model

```
xP = p_play × mf × (
    xg90_posterior × GOAL_PTS[pos]
  + xa90_posterior × 3
  + exp(-lambda_posterior) × CS_PTS[pos]
  + appearance_pts
  + saves_ev
  + xgc_deduct
)
```

- Bayesian posterior blends club current season + tournament history with recency decay (0.85/yr) and tournament discount (0.75).
- Live blending post-round 1: `xp_blended = (prior_xp × 300 + fifa_fantasy_avgPoints_pg × rounds_played × 90) / (300 + rounds_played × 90)`. Prior fades after round 5.
- FDR 1-5 in UI only — computed by bucketing `lambda_posterior` quintiles. Model always uses continuous lambda.

### Squad Optimizer (MILP)

- Two implementations of the same LP: `wc_optimizer.py` (Python, writes `suggested_squad` to DB during engine cron) and `squadOptimizer.ts` (TypeScript, HiGHS-WASM via `highs` npm package, called on demand for Re-optimize). `highs` stays in `package.json`.
- LP constraints: exactly 2 GK / 5 DEF / 5 MID / 3 FWD, total cost <= $100m, max 3 players per `squad_id`, maximise sum of xP.
- Country limit increases by round are passed as a parameter (`countryLimit`); LP re-solved with updated constraints at round boundaries.
- Both implementations must produce results within 0.5 xP of each other for the same input — verified by integration test.

### squadStore (localStorage)

- Persists: `squad` (15 player IDs), `captain` (number or null), `bench` (4 IDs in bench order), `budget`.
- Storage key: `wc-edge-storage`.
- `RequireSquad` HOC: if `squad.length === 0`, redirect to `/squad` with `state.from`. Applied to `/transfers` and `/captain`. Not applied to `/assistant` or `/live`.

### Transfer Suggest

- `POST /api/transfers/suggest` accepts `{ squad: number[], round: number, freeTransfers: number }`.
- Sequential greedy: compute best xP-delta swap for current squad, return top-1. After Accept, client sends updated squad for next computation. After Skip, client sends same squad for an alternative.
- Eliminated players (`teams.isActive = false`) naturally surface as top sells because future xP = 0. UI shows ELIMINATED badge.
- Server validates formation + budget + country limits on receive. Returns 400 if invalid.

### Captain Page

- Data: `GET /api/projections?round=N` filtered client-side to `squadStore` squad IDs. Zero dedicated API calls.
- FDR badge: `lambda_posterior` from `team_fdr` table bucketed into 1-5 quintiles.
- `squadStore.setCaptain(playerId)` is a localStorage write only. Footer reminder text always shown.

### Live Page

- Server-side proxy to `worldcup2026-api.vercel.app` with 60s TTL cache. Clients never hit the live API directly.
- Degraded mode: proxy failure returns last cached values + `{ stale: true, lastUpdated: ISO timestamp }`. Client shows stale banner — does not fall back to last-round points.
- `captainSwapWindowOpen` computed server-side from kick-off times in `rounds.json`. Banner links to `play.fifa.com/fantasy/` directly, not to the Captain page.
- Auto-sub display is static bench order from `squadStore.bench` — no live substitution inference.

### Assistant (Edge)

- Client sends `{ messages: ChatMessage[], squad?: number[] }` to `POST /api/chat`.
- Server queries `players` + `projections` tables for provided IDs and builds WC-specific system prompt (round, deadline, squad context with `tourn_source`, global top-10, WC chip names).
- Two starter prompt sets swap automatically based on `squadStore.squad.length > 0`.
- `chatApi.ts` is adapted from fpl-edge (adds `squad` param) — not verbatim reuse.

### Database Schema

```sql
-- Phase 1 output: raw scraped data
CREATE TABLE player_stats (
    element          INTEGER PRIMARY KEY,
    api_football_id  INTEGER,
    club_goals90     REAL,
    club_assists90   REAL,
    club_minutes     INTEGER,
    club_start_rate  REAL,
    club_saves90     REAL,
    tourn_source     TEXT,
    tourn_xg90       REAL,
    tourn_xa90       REAL,
    tourn_minutes    INTEGER,
    tourn_age_years  REAL,
    tourn_saves90    REAL,
    scraped_at       TIMESTAMP DEFAULT NOW()
);

-- Phase 2 output: computed projections per player per round
CREATE TABLE projections (
    element              INTEGER,
    round                INTEGER,
    mf                   REAL,
    p_play               REAL,
    xg90_posterior       REAL,
    xa90_posterior       REAL,
    lambda_posterior     REAL,
    pcs                  REAL,
    defensive_multiplier REAL,
    xp                   REAL,
    variance             REAL,
    p_goal               REAL,
    p_cs                 REAL,
    updated_at           TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (element, round)
);

-- Dynamic FDR per team per round
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
    position         TEXT,
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
    seed        INTEGER,
    group_name  TEXT
);

-- Pre-computed squad suggestion (written by wc_optimizer.py, read by /api/squad/suggest)
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

## API Routes

| Route | Method | Notes |
|---|---|---|
| `/wc/players.json` | GET | FIFA Fantasy proxy, 5min TTL |
| `/wc/rounds.json` | GET | FIFA Fantasy proxy, 5min TTL |
| `/wc/squads_fifa.json` | GET | FIFA Fantasy proxy, 30min TTL |
| `/api/rounds` | GET | DB rounds table |
| `/api/players` | GET | All ~800 players from DB |
| `/api/teams` | GET | Teams + isActive flag |
| `/api/projections?round=N` | GET | All players sorted by xP DESC |
| `/api/squad/suggest` | GET | Pre-computed from suggested_squad table |
| `/api/squad/optimize` | POST | Live HiGHS-WASM solve |
| `/api/transfers/suggest` | POST | Sequential greedy, body: `{squad, round, freeTransfers}` |
| `/api/live?round=N` | GET | Community API proxy, 60s TTL |
| `/api/chat` | POST | Edge AI, body: `{messages, squad?}` |

---

## Navigation

- Sidebar order: Assistant, Squad, Transfers, Captain, Live.
- Default route `/` maps to `/assistant`.
- Accent colour: `#E8B84B` (WC gold) in `tailwind.config.ts`. `accent-fg` stays `#060D18` (contrast ratio ~7:1).
- All 5 sidebar icons are inline SVGs in `Sidebar.tsx` — no external icon library.

---

## Security

- `API_FOOTBALL_KEY` stored in `engine/.env` (gitignored) and GitHub Actions secret. Scrubbed from `wc-edge.md` before first commit.
- `ANTHROPIC_API_KEY` set manually in Render dashboard.

---

## Testing Decisions

### What Makes a Good Test

Tests should assert external behaviour observable at API or component boundaries — not internal implementation details. A test that checks "the LP solver was called with these arguments" is worse than one that checks "the returned squad has no more than 3 players from each nation and costs no more than $100m." Tests must be deterministic regardless of external API availability.

### Key Seams and What to Test at Each

**`POST /api/squad/optimize` (highest seam for MILP correctness)**
- Formation: returned squad always has exactly 2 GK / 5 DEF / 5 MID / 3 FWD.
- Budget: total cost <= $100m.
- Country limit: no more than 3 players share the same `squad_id`. After round boundary with updated `countryLimit`, verify re-solve respects increased limit.
- Cross-implementation check: result is within 0.5 xP of `GET /api/squad/suggest` for the same projection snapshot.

**`POST /api/transfers/suggest` (sequential greedy logic)**
- Eliminated player in squad surfaces as sell candidate in top-1 result with reason `ELIMINATED`.
- Sequential correctness: Accept top-1, POST updated squad, verify top-2 is computed against post-swap squad.
- Budget constraint: best available buy that exceeds remaining budget is excluded from suggestions.
- Invalid squad body returns 400.

**`GET /api/live?round=N` (degradation behaviour)**
- Community API returns 503: server returns last cached values + `{ stale: true }`.
- `captainSwapWindowOpen` is true when at least one squad player has a future kick-off; false when all have started.
- Second request within 60s returns cached response without hitting community API.

**`POST /api/chat` (squad context injection)**
- Squad IDs provided: system prompt contains those players' names.
- Empty squad array: system prompt omits squad block, includes global top-10 only.
- Unknown player ID in squad: response returned without crashing.

**`RequireSquad` routing guard (UI)**
- Navigate to `/transfers` with empty store: assert redirect to `/squad`.
- Navigate to `/transfers` with 15-player store: assert Transfers page renders.
- Navigate to `/live` with empty store: assert "Build a squad" CTA visible and match cards still render.

### Prior Art and Patterns

- API integration tests: follow fpl-edge pattern of smoke-testing real endpoints against the deployed service, not mocks.
- MILP correctness: use fixed mock projection data for deterministic constraint validation tests.
- Client routing: React Testing Library with MemoryRouter for guard tests.

---

## Out of Scope

- FPL-style transfer execution — no login, no session store, no submit-to-FIFA functionality. wc-edge is advisory only.
- Chrome extension — no browser extension for WC.
- Transformer ML model — projection uses Bayesian formula only. No neural net.
- Multi-round MILP lookahead — optimizer maximises xP for current round only.
- Locked/excluded players in Re-optimize — forced inclusions/exclusions deferred to post-launch.
- Captain swap execution — Live page banner links externally; no in-app execution.
- Browser push notifications — captain swap alert is a banner only.
- Leagues / standings page.
- Review / performance history page.
- Prices / price prediction page.

---

## Further Notes

- **Tournament deadline:** wc-edge must be production-ready by June 11, 2026 (Day 8). Tournament starts June 12.
- **Day 3 manual step:** after Phase 1 scrape, `data/unmatched_players.json` must be reviewed manually. Top-30 unmatched players by price need overrides in `name_overrides.json` before re-running Phase 1 on Day 4. This human-in-the-loop step cannot be automated.
- **API-Football daily budget:** 100 requests/day × 2 days = 200 total. Do not exceed — the daily cap is hard even though the key is valid until 2027-06-04.
- **Community live API reliability:** `worldcup2026-api.vercel.app` has no SLA. Degraded mode is a primary design constraint, not a fallback.
- **Post-group Bayesian update:** the June 27 cron replaces seed-based Poisson priors with observed xG/xGC from group stage matches. Projections improve substantially after this update.
- **WC gold accent** (`#E8B84B`) on dark navy (`#060D18`) — contrast ratio ~7:1, passes WCAG AA. No purple/violet anywhere.
