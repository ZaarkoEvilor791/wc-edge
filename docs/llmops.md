> **Context consolidated** — LLMOps decisions (eval sampling, prompt versioning) are referenced in [`.knowledge/sessions/000-existing-context.md`](../.knowledge/sessions/000-existing-context.md). This file remains the authoritative LLMOps design.

# LLMOps Design — MLflow + LangSmith + OpenTelemetry

**Status:** Proposed  
**Date:** 2026-06-19

Observability, evaluation, and model governance for the wc-edge AI systems.

---

## Overview

Two distinct observability stacks cover complementary concerns:

| Stack | Scope | What It Tracks |
|---|---|---|
| **MLflow** | ML models (Bayesian + XGBoost) | Experiment runs, CV RMSE, feature importances, model registry |
| **LangSmith** | LLM calls (LangGraph pipeline) | Agent traces, RAG retrievals, token usage, eval scores |
| **OpenTelemetry** | All services | Request latency, error rates, agent node durations, cache hit rates |

---

## MLflow

### Experiment: `wc_projections`

One MLflow run per engine execution. Tracked automatically by `wc_run.py`.

**Params logged:**
```python
mlflow.log_params({
    "round_id": round_id,
    "n_training_samples": len(df),
    "bayesian_prior_virt": 3,
    "xgb_max_depth": 4,
    "xgb_n_estimators": 100,
    "cv_folds": n_splits,
    "obs_weight": 0.23,
})
```

**Metrics logged:**
```python
mlflow.log_metrics({
    "bayesian_rmse": bayesian_rmse,
    "xgb_cv_rmse_mean": np.mean(rmse_scores),
    "xgb_cv_rmse_std": np.std(rmse_scores),
    "ensemble_rmse": ensemble_rmse,
    "mae": mae,
    "n_players_projected": n_projected,
    "index_staleness_hours": staleness,
})
```

**Artifacts:**
- `feature_importances.json` — XGBoost SHAP values per feature
- `confusion_matrix.png` — top-10 vs actual top-10 ranked by xP

---

### Model Registry: `wc_xgb_projector`

Each XGBoost model version goes through a governance gate before serving projections.

```
Registered → Staging → Production
              ↑
        Auto-promoted only if:
        cv_rmse_mean < current Production cv_rmse_mean
```

```python
def _maybe_promote_to_production(run_id: str):
    client = mlflow.MlflowClient()
    current_prod = client.get_latest_versions("wc_xgb_projector", stages=["Production"])
    prod_rmse = float(current_prod[0].tags.get("cv_rmse_mean", "999")) if current_prod else 999
    new_rmse = mlflow.get_run(run_id).data.metrics["cv_rmse_mean"]

    if new_rmse < prod_rmse:
        client.set_registered_model_tag("wc_xgb_projector", "promoted_at", datetime.utcnow().isoformat())
        client.transition_model_version_stage("wc_xgb_projector", version, "Production")
        logger.info("XGBoost v%s promoted to Production (RMSE %.3f < %.3f)", version, new_rmse, prod_rmse)
    else:
        logger.info("XGBoost v%s kept in Staging (RMSE %.3f >= %.3f)", version, new_rmse, prod_rmse)
```

**Why this matters for portfolio:** Demonstrates that ML models don't auto-deploy without a quality gate — a production LLMOps requirement missing from most portfolio projects.

---

### Cost Tracking (LLM calls)

```python
# models/cost_tracker.py
COST_PER_1K = {
    "claude-sonnet-4-6":     {"input": 0.003, "output": 0.015},
    "azure/gpt-4o":          {"input": 0.005, "output": 0.015},
    "gemini/gemini-1.5-pro": {"input": 0.00125, "output": 0.005},
}

def log_cost(usage: dict, model: str) -> float:
    cost = (usage["input_tokens"] / 1000 * COST_PER_1K[model]["input"]
          + usage["output_tokens"] / 1000 * COST_PER_1K[model]["output"])
    mlflow.log_metric("cost_usd", cost)
    return cost
```

Logged per conversation turn. Aggregate `total_cost_per_day` metric in MLflow dashboard exposes LLM spend without requiring a separate billing dashboard.

---

### Running MLflow

```bash
# Local
mlflow server --host 0.0.0.0 --port 5000 --backend-store-uri ./mlruns

# Via docker compose
docker compose up mlflow   # http://localhost:5000
```

Production option: Databricks Managed MLflow or Azure ML MLflow (same client interface, different `MLFLOW_TRACKING_URI`).

---

## LangSmith

### Auto-tracing LangGraph

All LangGraph runs auto-trace when these env vars are set:

```bash
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=<langsmith_key>
LANGCHAIN_PROJECT=wc-edge-ai-advisor
```

No code changes required. LangSmith captures:
- Full agent DAG (Router → Advisor → Knowledge → Synthesizer → Guardrails)
- Per-node input/output state
- LLM call details: model, tokens, latency, cost
- RAG retrieval results (query, documents, scores)
- Tool calls within each agent node

---

### Eval Dataset

Queries are collected to a LangSmith dataset (`wc-edge-eval`) and scored with an LLM-as-judge. **Eval runs on a 10% random sample** — running Claude-as-judge on every response would double the per-query LLM cost for no additional signal quality.

```python
# eval/llm_judge.py
import random

EVAL_RUBRIC = """
Score this AI fantasy football response on 4 dimensions (each 0.0–1.0):

1. factual_accuracy: Are all xP/FDR values cited present in the provided rag_context?
2. actionability: Does the response include at least one valid action (set_captain / suggest_transfers)?
3. grounding: Are all player names mentioned present in the verified player list?
4. conciseness: Is the response under 200 tokens?

Return JSON only: {"factual_accuracy": f, "actionability": f, "grounding": f, "conciseness": f, "overall": f}
"""

async def maybe_evaluate(query: str, response: str, rag_context: str,
                         valid_players: set[str], sample_rate: float = 0.10) -> dict | None:
    if random.random() > sample_rate:
        return None   # skip — 90% of calls; dimensons 2 (actionability) and 3 (grounding)
                      # are verified deterministically by the guardrails node anyway
    scores = await llm_call(EVAL_RUBRIC + f"\nQuery: {query}\nResponse: {response}\nRAG context: {rag_context}")
    mlflow.log_metrics(scores)
    return scores
```

**Note:** `actionability` and `grounding` are already enforced deterministically by the Guardrails node (Pydantic schema + DB name lookup). The LLM judge's value is in `factual_accuracy` and `conciseness` — dimensions that require reading the response in context.

---

### Prompt Versioning

Prompts live in `services/ai-advisor/prompts/` as versioned files:

```
prompts/
├── system_v1.md              production prompt (original)
├── system_v2.md              challenger prompt (A/B test candidate)
├── few_shot_transfers.json   5 transfer Q&A examples (grounded in real outcomes)
├── few_shot_captain.json     5 captaincy Q&A examples
└── prompt_config.yaml        active version per intent type
```

`prompt_config.yaml`:
```yaml
active_versions:
  transfer: system_v2
  captain: system_v1
  chip: system_v1
  general: system_v1

ab_test:
  enabled: false
  traffic_split: 0.5   # 50% v1, 50% v2
  metric: factual_accuracy
```

LangSmith tracks which prompt version produced which response. The version with higher `overall` eval score after 100 samples is promoted in `prompt_config.yaml`.

---

### DSPy Optimizer

```python
# finetuning/dspy_optimizer.py
import dspy

def xp_improvement_metric(example, pred, trace=None) -> bool:
    """True if the suggested transfer player outscored the player transferred out."""
    suggested_in = pred.actions[0].get("name") if pred.actions else None
    if not suggested_in:
        return False
    actual_next = example.next_round_actuals.get(suggested_in, 0)
    actual_current = example.next_round_actuals.get(example.current_player, 0)
    return actual_next > actual_current

optimizer = dspy.BootstrapFewShot(metric=xp_improvement_metric, max_bootstrapped_demos=5)
optimized_module = optimizer.compile(TransferAdvisorModule(), trainset=train_examples)
```

This requires completed rounds for ground truth. Activated after Round 2 data is available (June 2026).

---

## OpenTelemetry

### Instrumentation (ai-advisor/telemetry.py)

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

provider = TracerProvider()
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=OTLP_ENDPOINT)))
trace.set_tracer_provider(provider)
tracer = trace.get_tracer("wc-edge.ai-advisor")
```

### Spans Per Request

```
POST /chat (root span, ~2-4s)
├── router_agent (50-150ms)          ← Haiku: 73% cheaper than Sonnet
│   └── llm_call.haiku (50-150ms)
├── transfer_advisor (100-500ms)
│   ├── db_query.get_projections (10-50ms)
│   └── llm_call.sonnet (500-3000ms)
├── knowledge_agent (30-150ms)       ← no LLM call; pure retrieval
│   ├── rag.retrieve (20-100ms)  ← FAISS cosine + BM25, top-3
│   └── graphrag.traverse (10-50ms)  ← NetworkX BFS
├── synthesizer (200-1000ms)
│   └── llm_call.sonnet (200-800ms)  ← CoT stripped before SSE stream
└── guardrails (2-5ms)               ← no LLM call; DB lookup + regex
```

### Key Metrics (Prometheus via OTel)

```
wce_chat_latency_seconds{p50, p95, p99}
wce_rag_retrieval_latency_ms
wce_graphrag_traversal_latency_ms
wce_llm_call_latency_ms{model}
wce_llm_tokens_total{type=input|output, model}
wce_hallucinations_blocked_total
wce_fallback_activations_total   # litellm primary → fallback switches
wce_faiss_index_staleness_hours
wce_circuit_breaker_trips_total  # BFF fallback to legacy handler
```

### Grafana Dashboard

Three panels cover the LLMOps concerns most visible to a hiring manager:

1. **Chat latency** (p50/p95 over time) — shows streaming responsiveness
2. **LLM cost per day** (sum of `cost_usd` from MLflow) — production cost discipline
3. **Hallucination block rate** (guardrails hits / total requests) — responsible AI signal

---

## LoRA Fine-tuning Scaffold

Not active during tournament (insufficient completed-round training data). Scaffold in place for post-tournament fine-tuning:

```python
# finetuning/lora_train.py
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig, get_peft_model, TaskType

config = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=8,                   # low-rank dimension
    lora_alpha=32,
    target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05,
)

model = AutoModelForCausalLM.from_pretrained("meta-llama/Meta-Llama-3.1-8B-Instruct")
model = get_peft_model(model, config)
```

Training data generated by `finetuning/generate_dataset.py`: collects query→response pairs where `xp_improvement_metric` returns True (i.e., the advice was correct in retrospect). Target: 500–1,000 pairs post-tournament.

Upload to HuggingFace Hub as `{username}/wc-fantasy-llama3.1-lora`.

---

*See [rag-design.md](rag-design.md) for RAG pipeline · [security.md](security.md) for AI safety controls · [ADR 009](adr/009-xgboost-mlflow-governance.md) and [ADR 011](adr/011-prompt-versioning-langsmith.md)*
