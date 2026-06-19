# ADR 009 — XGBoost Ensemble + MLflow Governance

**Status:** Proposed  
**Date:** 2026-06-19  
**Context:** Phase 4 — enhancing the projection model with a supervised ML layer and production MLOps

---

## Decision

Add `train_xgb_model()` to `wc_model.py`. Train an `XGBRegressor` on completed-round actuals after each round completes. Use `TimeSeriesSplit` (not random split) for cross-validation to prevent data leakage. Ensemble with the existing Bayesian model: `ensemble_xp = 0.6 × bayesian_xp + 0.4 × xgb_xp` (weights recalibrated by holdout RMSE). All runs logged to MLflow. Model versions enter a registry and require a governance gate (lower CV RMSE than current Production) before serving.

---

## Feature Set

```python
FEATURE_COLS = [
    'price',           # proxy for quality tier
    'position_int',    # 0=GK, 1=DEF, 2=MID, 3=FWD
    'club_goals90',    # StatsBomb xG90 from club season
    'club_assists90',  # StatsBomb xA90
    'club_start_rate', # minutes / (90 * games)
    'tourn_xg90',      # tournament-to-date xG90
    'tourn_xa90',
    'mf',              # minutes factor (P(plays≥45min) from prior rounds)
    'lambda_posterior',# team offensive lambda (FDR model)
    'seed',            # team FIFA ranking seed (1–8)
    'is_penalty_taker' # boolean: awarded penalties in club season
]
```

`squad_id` (team/nationality) is deliberately excluded to prevent the model from learning a nationality proxy. See security.md bias audit section.

---

## TimeSeriesSplit — Why Not Random Split

```python
tscv = TimeSeriesSplit(n_splits=min(3, completed_rounds - 1))
for train_idx, val_idx in tscv.split(X):
    # Train on earlier rounds, validate on later rounds
    model.fit(X[train_idx], y[train_idx], eval_set=[(X[val_idx], y[val_idx])])
```

A random split would allow the model to train on Round 3 data and validate on Round 1 data — leaking future information into training. Fantasy projections must be evaluated on data the model never saw at training time. `TimeSeriesSplit` enforces temporal ordering.

With fewer than 2 completed rounds, XGBoost training is skipped (insufficient training data for meaningful CV). The Bayesian model remains sole projector until Round 2.

---

## Ensemble Blend

```python
def ensemble_blend(bayesian_xp: float, xgb_xp: float, round_id: int) -> float:
    # Trust Bayesian prior early (weak tournament signal), trust XGB more once data accumulates
    w_bay = 0.8 if round_id <= 2 else 0.6
    return w_bay * bayesian_xp + (1 - w_bay) * xgb_xp
```

Early rounds: 80% Bayesian + 20% XGB. Rationale: the Bayesian prior (club stats + seed) is informative before tournament data accumulates. XGB trained on 1 completed round has high variance.

Later rounds: 60% Bayesian + 40% XGB. The XGB model has seen 3+ rounds of tournament actuals, its features are more informative, and tournament form has partially overridden pre-tournament expectations.

---

## MLflow Governance Gate

```python
def _maybe_promote_to_production(run_id: str):
    client = mlflow.MlflowClient()
    prod_versions = client.get_latest_versions("wc_xgb_projector", stages=["Production"])
    prod_rmse = float(prod_versions[0].tags["cv_rmse_mean"]) if prod_versions else 999.0
    new_rmse = mlflow.get_run(run_id).data.metrics["cv_rmse_mean"]

    if new_rmse < prod_rmse:
        client.transition_model_version_stage("wc_xgb_projector", new_version, "Production")
```

**Why a governance gate:** Without it, a model trained on a noisy round could replace a better-calibrated previous model. The RMSE comparison is the minimum viable gate — a full production system would also compare MAE, top-10 precision, and feature importance stability.

**New DB columns:**
```sql
ALTER TABLE wc.projections ADD COLUMN IF NOT EXISTS xgb_xp REAL;
ALTER TABLE wc.projections ADD COLUMN IF NOT EXISTS ensemble_xp REAL;
```

`/api/projections` returns these additional fields. Frontend displays `ensemble_xp` as the primary recommendation metric once XGB is active.

---

## Rejected Alternatives

| Option | Reason Rejected |
|---|---|
| Random train/test split | Data leakage: future round data would contaminate training |
| LightGBM | XGBoost is more widely known in ML interviews; identical performance at this data size |
| Neural network (MLP) | Overkill for 11 tabular features + <10,000 training samples; XGBoost dominates tabular data at this scale |
| Pure Bayesian model | Already in production, but cannot learn from tournament actuals as they accumulate |
| W&B instead of MLflow | Paid at team scale; MLflow is open-source and self-hostable; both have equivalent Python API for this use case |

---

## Consequences

- `train_xgb_model()` is called from `wc_run.py` after `blend_live_observations()` and only when `completed_rounds >= 2`
- Each engine run produces a new MLflow run with full artifact trail: params, metrics, model binary, feature importances
- The `wc_xgb_projector` registry retains all versions — historical model lineage is preserved
- If XGBoost training fails (e.g. insufficient data, import error), `wc_run.py` logs the error and continues without XGBoost. The Bayesian model is always the fallback.
- `xgb_xp` and `ensemble_xp` columns are NULL for the first run (before training). API consumers must handle NULL gracefully.

## What future reviewers should not re-suggest

Do not suggest replacing `TimeSeriesSplit` with `KFold`. The temporal nature of round data makes random splits invalid for fantasy projections — a model that peeks at future rounds is overfitting to the evaluation set, not generalising. This is not a theoretical concern; it materially inflates the apparent RMSE improvement.
