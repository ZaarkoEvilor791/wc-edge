# wc-edge Domain Glossary

This file is the authoritative vocabulary for the wc-edge codebase. Architecture reviews, PR descriptions, and code comments should use these terms exactly. When a new concept is named during a review or grilling session, add it here.

---

## Core Concepts

**Squad** — A player's 15-player selection: 2 GK / 5 DEF / 5 MID / 3 FWD. Stored as an ordered array in `squadStore`. Array order determines the XI/bench split.

**XI** — The 11 starting players selected from the Squad. Derived by `getXI()` using the first N players per position in array order (1 GK, 4 DEF, 4 MID, 2 FWD by default). The XI is never stored — it is always computed.

**Bench** — The 4 non-starting players (remaining after XI split). Computed alongside XI by `getXI()`.

**Squad Ordering Contract** — The implicit invariant that the squad array must be sorted by (position order, xP descending) for `getXI()` to produce a correct XI/bench split. Enforced at write-time in `squadStore.setSquad()`.

**Formation** — The DEF/MID/FWD distribution among the 11 XI players (e.g., 4-4-2). Stored in `squadStore.formationCounts`. Must stay consistent with the squad array ordering.

**xP (Expected Points)** — A player's projected fantasy points for a given round, computed by the Bayesian model in `engine/wc_model.py`. Stored in `wc.player_projections`.

**xP Breakdown** — The decomposition of a player's xP into scoring components: goals, clean sheet, appearance, other. Currently reverse-engineered in the frontend from projection probabilities; ideally stored alongside xP in the DB.

**Projection** — A round-specific xP estimate for one player, including probability fields (p_goal, p_cs, mf — minutes fraction) used to compute the estimate.

**FDR (Fixture Difficulty Rating)** — A 1–5 scale rating how hard a team's upcoming fixture is (1 = easiest, 5 = hardest). Derived from Bayesian lambda_posterior in the engine; stored in `wc.team_fdr`.

**Round** — One matchday period in the WC 2026 tournament. 8 total. Status flows: `'scheduled'` → `'playing'` → `'complete'`. Note: FIFA Fantasy uses `'playing'` (not `'active'`) for the current round.

**Phase** — A group of rounds sharing the same transfer rules: `group | r32 | r16 | qf | sf | final`. Derived from `wc.rounds.stage` by `roundPhase()` in `squadValidator.ts`.

**Free Transfers** — The number of transfers a user can make per round without penalty. Defined per phase in `FREE_TRANSFERS_BY_PHASE` (config). Extra transfers cost −3 pts each.

**Variant** — A pre-computed squad optimization style: `max_xp` (raw xP), `value` (price-penalized), `differential` (nation cap=2). Computed offline by the engine; stored in `wc.suggested_squad`.

**Suggested Squad** — A pre-computed 15-player squad from the engine optimizer, stored by (round, variant). Served via `/api/squad/suggest`.

**Captain / Vice-Captain** — Players designated for 2× score multiplier. Set locally; user must also set on FIFA website. Captain is always from the XI (enforced at assignment time).

**Booster / Chip** — A one-time power-up (Wildcard, Maximum Captain, 12th Man, Qualification Booster, Clean Sheet Shield). State tracked in `squadStore.boosterStates`.

---

## Architecture Terms

**Module** — Anything with an interface and an implementation: a function, a store slice, a service, a page component.

**Interface** — Everything a caller must know: types, invariants, error modes, ordering constraints, config. Not just the type signature.

**Depth** — Leverage at the interface: a lot of behaviour behind a small interface. Deep = high leverage. Shallow = interface nearly as complex as implementation.

**Seam** — Where an interface lives; a place behaviour can be altered without editing in place.

**Adapter** — A concrete thing satisfying an interface at a seam.

**Validation Gate** — A module that enforces game rules at mutation points. The intended seam for `squadValidator.ts` — all squad mutations pass through it before being accepted.

**Mutation Point** — A place in the code where the squad array is written: `setSquad()`, `swapInSquad()`, `handleAdd()`, `optimiseXI()`. All mutation points must honour the Squad Ordering Contract.

**Normalization** — The step that converts a raw input squad array into a correctly ordered squad (deduped, null-filtered, sorted by position then xP). Happens inside `setSquad()`.

---

## Data Sources

**FIFA Fantasy API** — Official WC 2026 fantasy game API. Provides players, rounds, squads. Proxied via `/wc/*.json` endpoints with 5–30min TTL.

**API-Football (apif)** — Third-party stats API. 100 req/day hard cap. Used in daily engine ingest for match stats not in FIFA Fantasy.

**StatsBomb Open Data** — Free match event data. Used in engine for chances, tackles, SOT. Key field: `pass.shot_assist` (not `key_pass` — doesn't exist).

**ESPN Public Scoreboard** — `site.api.espn.com/.../soccer/fifa.world/scoreboard` — no key, no rate limit. Primary live score source (Tier 1.5). Past days cached 1hr; today cached 60s.

---

## Engine Concepts

**blend_live_observations** — Engine step that incorporates match result data into projections after a round completes. Activates only when a round has `status='complete'`.

**Bayesian FDR** — FDR recalibrated using match results (goals scored vs. expected). Run post-group stage via `--post-group` flag.

**penalty taker** — A player flagged `is_penalty_taker=TRUE` in `wc.players`. Adds `PENALTY_XG_PER90=0.003` to their xg90 in the model.
