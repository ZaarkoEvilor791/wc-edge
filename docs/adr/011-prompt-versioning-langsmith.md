> **Context consolidated** — This ADR is summarised in [`.knowledge/sessions/000-existing-context.md`](../../.knowledge/sessions/000-existing-context.md).

# ADR 011 â€” Prompt Versioning + LangSmith LLMOps

**Status:** Proposed  
**Date:** 2026-06-19  
**Context:** Phase 3 (Guardrails/Prompt Engineering) and Phase 6 (LLMOps)

---

## Decision

Store all system prompts as versioned Markdown files in `services/ai-advisor/prompts/`. The active version per intent type is controlled by `prompt_config.yaml` (not code). All LangGraph runs are auto-traced to LangSmith via `LANGCHAIN_TRACING_V2=true`. Evaluations use an LLM-as-judge with a 4-dimension rubric. Prompt version promotion is manual: the version with higher `overall` eval score across 100 samples is promoted in `prompt_config.yaml`.

---

## Prompt Architecture

### Two-Block System Prompt (Cache Efficiency)

```python
messages = [
    {
        "role": "system",
        "content": [
            {
                "type": "text",
                "text": load_prompt(active_version),  # e.g., system_v2.md
                "cache_control": {"type": "ephemeral"},  # Block 1: cached
            },
            {
                "type": "text",
                "text": build_dynamic_context(state),    # Block 2: dynamic
            },
        ],
    },
    *state["messages"],
]
```

**Block 1 (cached):** WC 2026 scoring constants, squad rules, anti-hallucination instructions, citation format rules. 2,048+ tokens. Anthropic caches this block for 5 minutes â€” repeated calls in the same session pay only output tokens for block 1. At ~3 req/session Ã— 1,500 cached tokens Ã— $0.003/1K input, caching saves ~$0.013 per session.

**Block 2 (dynamic):** `<tournament>`, `<squad_analysis>`, `<rag_context>`, `<graph_context>`. Changes per request; never cached.

### Prompt Files

```
prompts/
â”œâ”€â”€ system_v1.md              production prompt
â”œâ”€â”€ system_v2.md              challenger (A/B test candidate)
â”œâ”€â”€ few_shot_transfers.json   5 transfer examples (grounded in actual outcomes)
â”œâ”€â”€ few_shot_captain.json     5 captaincy examples
â””â”€â”€ prompt_config.yaml        active versions + A/B config
```

`prompt_config.yaml`:
```yaml
active_versions:
  transfer: system_v1
  captain: system_v1
  chip: system_v1
  general: system_v1
ab_test:
  enabled: false
  traffic_split: 0.5
  metric: factual_accuracy
```

The prompt loader reads this file at request time (not at import time), so version changes take effect without redeployment.

---

## LangSmith Tracing

All LangGraph runs auto-trace when:
```bash
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=<key>
LANGCHAIN_PROJECT=wc-edge-ai-advisor
```

LangSmith captures per run:
- Full DAG: which nodes ran, in what order
- Per-node: input AgentState fields, output fields, wall-clock duration
- LLM calls: model, messages, response, token counts, latency
- Tool calls: which DB queries ran, what they returned
- RAG: query, retrieved documents, scores
- Prompt version used (tagged on the run)

---

## 4-Dimension Eval Rubric

```python
EVAL_RUBRIC = """
Score this AI fantasy football response on 4 dimensions (each 0.0â€“1.0):

1. factual_accuracy: Are all xP/FDR values cited present in the provided rag_context?
   1.0 = all values verified | 0.5 = some values missing | 0.0 = values not in context

2. actionability: Does the response include at least one valid action JSON (set_captain / suggest_transfers / etc.)?
   1.0 = valid action present | 0.0 = no action or invalid action type

3. grounding: Are all player names mentioned present in the verified player list?
   1.0 = all names valid | 0.5 = 1 name invalid | 0.0 = 2+ names invalid

4. conciseness: Is the response under 200 tokens?
   1.0 = under 150 tokens | 0.5 = 150â€“250 tokens | 0.0 = over 250 tokens

Return JSON only: {"factual_accuracy": f, "actionability": f, "grounding": f, "conciseness": f, "overall": f}
Where overall = 0.4Ã—factual_accuracy + 0.3Ã—actionability + 0.2Ã—grounding + 0.1Ã—conciseness
"""
```

**Why these weights:** `factual_accuracy` and `actionability` are the highest-value dimensions â€” a hallucinating or non-actionable advisor is useless. `grounding` is strongly correlated with `factual_accuracy` but is a separate check (player names vs stat values). `conciseness` is a UX signal, lower weight.

**Eval runs on 10% sample, not every response.** Running Claude-as-judge on 100% of responses would double the per-query LLM cost. `actionability` (valid action JSON) and `grounding` (player names) are already enforced deterministically by the Guardrails node â€” the LLM judge's marginal value is in `factual_accuracy` and `conciseness`, which require reading the response in context. 10% sampling gives statistically meaningful quality signals at 1/10th the cost.

---

## A/B Testing

When `ab_test.enabled: true`, the prompt loader routes 50% of requests to `system_v1`, 50% to `system_v2`. Both versions are tagged in LangSmith traces. After 100 samples per variant, the variant with higher mean `factual_accuracy` (or the configured metric) is declared the winner and promoted in `prompt_config.yaml` by setting the active version.

Manual promotion is required â€” no auto-promotion. This ensures a human reviews the LangSmith dashboard and confirms the difference is statistically meaningful before switching traffic.

---

## Rejected Alternatives

| Option | Reason Rejected |
|---|---|
| Prompts in code (f-strings) | No version history, no A/B testing, no rollback, harder to review by non-engineers |
| Weights & Biases Prompts | Paid feature at this scale; LangSmith is included in the LangGraph/LangChain ecosystem |
| Helicone / other LLM observability | Additional vendor; LangSmith integrates natively with LangGraph at zero configuration cost |
| Automatic prompt promotion via DSPy | DSPy optimizer is scaffolded (finetuning/dspy_optimizer.py) but requires completed-round ground truth. Manual promotion is the right default until enough tournament data exists. |

---

## Consequences

- `prompt_config.yaml` is committed to git. Changes to the active version create a git commit trail.
- Hot-reload: the prompt loader reads `prompt_config.yaml` on each request (cached with a 60s TTL via `functools.lru_cache`). Version changes take effect within 60 seconds without redeployment.
- LangSmith traces contain full user messages. Ensure no PII is included in user messages before enabling tracing. WC Fantasy queries contain no PII.
- Eval rubric is itself an LLM call (Claude-as-judge). At $0.003/1K tokens Ã— ~500 tokens input Ã— 100 evals = ~$0.15 for a full A/B evaluation batch.

## What future reviewers should not re-suggest

Do not suggest storing prompts in a database or external prompt management SaaS (PromptLayer, PromptHero, etc.). The file-based approach is already version-controlled (git), reviewable in PRs, and LangSmith provides the observability layer. Adding a database or SaaS for prompt storage would add complexity without improving the core workflow.
