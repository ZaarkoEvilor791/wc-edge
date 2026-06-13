# Tournament Operations Playbook

**Tournament:** June 12 – July 19, 2026

---

## Fully Automated (GitHub Actions cron)

| Cron | UTC | What runs | Notes |
|---|---|---|---|
| Daily engine | 04:00 | `wc_ingest` (apif) + `wc_model` + `blend_live_observations` | Overnight match stats → rebuild projections |
| Evening refresh | 18:00 | `wc_model` + `blend_live_observations` | No apif (saves budget) |
| Post-match blend | 00:00 | `wc_model` + `blend_live_observations` | Matches end ~23:00 UTC; <1h lag |
| Post-group FDR | Jun 27 06:00 UTC | `wc_run --post-group` | Bayesian FDR recalibration |

Round status auto-synced on every engine run via `_sync_round_statuses()`. `blend_live_observations` activates once FIFA marks round `COMPLETE`. No manual DB update needed.

---

## Manual Tasks

### 1. Mark eliminated teams after each knockout round

```sql
-- Replace XXX/YYY with actual eliminated team abbrs
UPDATE wc.teams SET is_active = FALSE WHERE abbr IN ('XXX', 'YYY');
-- Verify:
SELECT abbr, is_active FROM wc.teams ORDER BY is_active DESC, abbr;
```

Timeline:
- R32: 24 teams eliminated
- R16: 8 more  
- QF: 4 more
- SF: 2 more

Must run BEFORE the next engine cron, otherwise projections include eliminated teams.

### 2. Trigger engine manually if projections go stale

```bash
# Standard refresh (model + blend, no apif call)
gh workflow run engine.yml --repo ZaarkoEvilor791/wc-edge -f skip_apif=true

# Full refresh including apif
gh workflow run engine.yml --repo ZaarkoEvilor791/wc-edge

# Post-group FDR recalibration
gh workflow run engine.yml --repo ZaarkoEvilor791/wc-edge -f post_group=true

# Check status
gh run list --repo ZaarkoEvilor791/wc-edge --workflow engine.yml
```

### 3. Monitor API Football budget

Hard cap: 100 req/day. Check before triggering manual runs with apif enabled.

```bash
cat engine/data/apif_budget.json
# {"day1_used": 80, "day2_used": 16, ...}
```

If near 100, always pass `-f skip_apif=true`.

---

## What to Watch

| Signal | How to check | Action |
|---|---|---|
| Projections stale | `/api/projections?round=N` — check `computed_at` on suggested_squad | Trigger manual engine run |
| Eliminated team in Transfers pool | `/api/teams` — check `is_active` | `UPDATE wc.teams SET is_active = FALSE WHERE abbr = '...'` |
| blend not activating | `SELECT id, status FROM wc.rounds ORDER BY id` | Now auto-synced. If wrong, check FIFA API reachability from GH Actions |
| Engine cron failed | GitHub Actions tab or `gh run list` | Check logs, re-trigger |
| Render cold start | First load slow | Normal on free tier; no action unless >30s |

---

## Budget / Phase changes

Budget increases to £105m at R32. Country limits loosen per phase. Both auto-detected by engine + `squadValidator.ts`. No manual action needed.

---

## New DB instance checklist

Run these in order on any fresh DB:

```bash
# 1. Run migrations (adds player_stats table, bonus columns, is_penalty_taker)
cd engine && py -m engine.migrate

# 2. Run full ingest + model
py -m engine.wc_run

# 3. Verify
# wc.players: 1,481 rows, is_penalty_taker column exists
# wc.suggested_squad: 3 rows (round 1, max_xp/value/differential)
# wc.teams: 48 rows, is_active column exists
```
