> **Context consolidated** — This ADR is summarised in [`.knowledge/sessions/000-existing-context.md`](../../.knowledge/sessions/000-existing-context.md).

# ADR 012 â€” Dynamic Per-Round FDR Bayesian Update

**Status:** Proposed  
**Date:** 2026-06-19  
**Context:** Dynamic FDR â€” generalising the post-group Bayesian update to run after every completed round

---

## Decision

Generalise the existing post-group Bayesian update (`_fetch_group_results` â†’ `run_model --post-group`) into `update_round_fdr(conn, completed_round_id)` â€” a function that re-computes FDR for all future rounds using cumulative completed rounds as observations. It runs after every completed round (not just the groupâ†’KO transition), populates the currently-NULL `goals_pg` and `goals_conceded_pg` columns in `wc.team_fdr`, and triggers a FAISS index rebuild via Redis pub/sub.

---

## Current State (Problem)

`wc.team_fdr` has four columns that are always NULL:
```
goals_pg, goals_conceded_pg, xg_created_pg, xgc_pg
```

FDR is updated only at the groupâ†’KO boundary via `wc_run.py --post-group`. All subsequent knockout round FDRs are frozen at `KO_AVG_LAMBDA â‰ˆ 1.175` â€” the prior, not tournament actuals.

This means:
- A team that concedes 3 goals in the group stage has the same FDR in Round 2 as a team that kept 3 clean sheets
- The AI advisor's `get_fdr()` tool returns seed-derived estimates, not tournament-observed form
- GraphRAG `FACES` edges carry stale lambdas

---

## New Function

```python
# engine/engine/wc_model.py

def update_round_fdr(conn, completed_round_id: int):
    """
    Re-compute FDR for all future rounds using all completed round actuals.
    Populates goals_pg, goals_conceded_pg in wc.team_fdr for every team.
    """
    results = _fetch_all_completed_results(conn)  # {squad_id: {goals_for: [], goals_against: []}}
    tourn_avg_gpg = _fetch_tournament_avg_gpg(conn)

    with conn.transaction():
        for team in get_active_teams(conn):
            sid = team["squad_id"]
            m = len(results[sid]["goals_against"])
            if m == 0:
                continue  # no completed rounds for this team yet (eliminated before playing)

            actual_ga = mean(results[sid]["goals_against"])
            actual_gf = mean(results[sid]["goals_for"])

            # Bayesian update: prior (3 virtual obs at KO_AVG_LAMBDA) + m actual obs
            concede_post = (3 * KO_AVG_LAMBDA + m * actual_ga) / (3 + m)
            def_mult = actual_gf / tourn_avg_gpg if tourn_avg_gpg > 0 else 1.0

            # Upsert ALL future rounds for this team
            for future_round in get_future_rounds(conn, completed_round_id):
                upsert_team_fdr(
                    conn, sid, future_round,
                    lambda_posterior=concede_post,
                    def_multiplier=def_mult,
                    goals_pg=actual_gf,
                    goals_conceded_pg=actual_ga,
                )
```

---

## Trigger Chain

```
GitHub Actions 00:00 UTC cron (post-match blend)
â””â”€â”€ blend_live_observations()
â””â”€â”€ update_round_fdr(completed_round_id)        â† new call
    â””â”€â”€ upserts lambda_posterior + goals_pg columns in wc.team_fdr
â””â”€â”€ embed_all_players()                         â† player docs now include updated goals_conceded_pg
    â””â”€â”€ FAISS index rebuilt to /tmp/faiss_new
â””â”€â”€ redis.publish "wc:events" "round.complete:{id}"
    â””â”€â”€ ai-advisor:
        â”œâ”€â”€ refresh_index()  â† FAISS atomic swap
        â””â”€â”€ graphrag rebuild on next hourly tick (FACES edges now carry updated lambda)
```

`wc_run.py` also calls `update_round_fdr()` in the 04:00 and 18:00 UTC runs (after `blend_live_observations()`) so FDR stays fresh between the dedicated 00:00 post-match run.

---

## Effect on Downstream Systems

| System | Effect |
|---|---|
| `wc.projections` xP | On next `run_model()` call, updated `lambda_posterior` flows into `xp_calc()`. Players vs weaker defences see higher xP. |
| RAG player documents | `goals_conceded_pg` included in player doc text. Rebuilt on FAISS refresh. LLM sees "Opponent conceded 1.8 gpg R1â€“R3 actuals." |
| GraphRAG FACES edges | `lambda_posterior` + `goals_conceded_pg` on FACES edge. Rebuilt hourly. Multi-hop captaincy queries use real defensive record. |
| AI Advisor `get_fdr()` tool | Reads `lambda_posterior` from `wc.team_fdr`. Returns live values post-update. |
| `/api/fdr?round=N` (BFF) | Reads from `wc.team_fdr`. Returns updated FDR ratings immediately after upsert. |

---

## Why Not Real-Time (Match-by-Match)

FDR is a round-level signal. The Bayesian model's precision on 3 matches is already limited by small-sample noise (a single lucky 3-0 win vs a weak opponent should not halve a team's `lambda_posterior` mid-round). Updating FDR after each 90-minute match would add noise, not signal, and would require the engine to run on ESPN live score events rather than on round completion.

The 00:00 UTC cron fires after each match day â€” typically within 3 hours of the final whistle. For fantasy purposes (transfer deadline is the next match kickoff), this timing is sufficient.

**Rejected:** Real-time ESPN score â†’ live FDR update. The complexity (webhook or 60s ESPN polling â†’ engine trigger â†’ model rerun â†’ DB upsert â†’ FAISS rebuild) is not justified by a signal that only meaningfully changes at round completion.

---

## DB Migration

No new columns required â€” `goals_pg` and `goals_conceded_pg` already exist in `wc.team_fdr` as nullable REAL columns (added in an earlier migration). `update_round_fdr()` populates them.

The `xg_created_pg` and `xgc_pg` columns (also NULL) are not populated by this update â€” they require StatsBomb xG data per match, which API-Football does not provide. These remain NULL and are reserved for post-tournament analysis.

---

## Consequences

- First run of `update_round_fdr()` after Round 1 completes will upsert FDR for all remaining rounds for all 48 teams (or those still active). Approximately 48 Ã— 7 = 336 upserts per call.
- If a team is eliminated (`is_active = false`), future rounds for that team are not upserted. The `wc.team_fdr` rows for eliminated teams retain their last-updated values for historical queries.
- `update_round_fdr()` is idempotent. Calling it twice for the same `completed_round_id` produces the same `wc.team_fdr` state.
- Tests for `update_round_fdr()` should verify: (a) goals_pg/goals_conceded_pg are non-NULL after the call, (b) future rounds are updated, (c) already-completed rounds are not modified.

## What future reviewers should not re-suggest

Do not suggest running `update_round_fdr()` on live match scores during a game. The Bayesian update is designed for completed-match observations. Partial-game scores (e.g. 45-minute score) would introduce noise that violates the independence assumptions of the Poisson model. The correct trigger is match completion â€” which the 00:00 UTC cron already covers.
