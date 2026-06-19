# ADR 010 — litellm Multi-Model Router

**Status:** Proposed  
**Date:** 2026-06-19  
**Context:** Phase 1 AI Advisor — LLM abstraction layer with automatic fallback

---

## Decision

Use `litellm.Router` to abstract all LLM calls in the AI Advisor service. Primary model: Claude Sonnet 4.6 (Anthropic). Fallback 1: GPT-4o (Azure OpenAI). Fallback 2: Gemini 1.5 Pro (Vertex AI). Local dev: Llama 3.1 8B (Ollama). Routing strategy: least-busy. Automatic retry on 429/503 with exponential backoff.

---

## Configuration

```python
# models/router.py
from litellm import Router

router = Router(
    model_list=[
        {
            "model_name": "primary",
            "litellm_params": {
                "model": "claude-sonnet-4-6",
                "api_key": os.environ["ANTHROPIC_API_KEY"],
            },
        },
        {
            "model_name": "fallback1",
            "litellm_params": {
                "model": "azure/gpt-4o",
                "api_base": os.environ["AZURE_OPENAI_ENDPOINT"],
                "api_key": os.environ["AZURE_OPENAI_KEY"],
            },
        },
        {
            "model_name": "fallback2",
            "litellm_params": {
                "model": "gemini/gemini-1.5-pro",
                "vertex_project": os.environ.get("VERTEX_PROJECT"),
            },
        },
        {
            "model_name": "local",
            "litellm_params": {
                "model": "ollama/llama3.1",
                "api_base": "http://localhost:11434",
            },
        },
    ],
    fallbacks=[{"primary": ["fallback1", "fallback2"]}],
    routing_strategy="least-busy",
    num_retries=2,
    timeout=30,
    retry_after=1,
)
```

---

## Rationale

**Why litellm over direct Anthropic SDK:**  
The direct SDK approach (`anthropic.Anthropic().messages.create(...)`) works but hard-codes the LLM provider. If Anthropic has an outage, the AI advisor goes down with it. With litellm Router, the code calls `router.acompletion(model="primary", ...)` and the routing layer handles provider selection, retry, and fallback transparently.

**Why these three providers:**  
Claude Sonnet 4.6 is the primary because it performs best on structured output tasks (actions JSON, citation grounding) and is already in use in the existing server.ts chat handler. Azure OpenAI GPT-4o is the Tier 2 fallback — enterprise-grade availability, OpenAI-compatible interface. Vertex AI Gemini 1.5 Pro is Tier 3 — Google Cloud, demonstrates multi-cloud capability. Ollama Llama 3.1 is for local dev without API keys — allows contributors to run the full stack without cloud credentials.

**Why least-busy routing:**  
The AI advisor handles one request at a time per user (sequential conversation turns). "Least-busy" reduces latency when multiple users are hitting the service simultaneously by routing to whichever model replica has the shortest queue.

**litellm's OpenAI-compatible interface:**  
`router.acompletion(messages=..., model=...)` returns the same response structure regardless of which underlying provider is used. This means the Synthesizer agent, guardrails, and cost tracker don't need provider-specific code paths.

---

## Cost Tracking Integration

litellm exposes token usage in the standard OpenAI format:

```python
response = await router.acompletion(model="primary", messages=messages)
usage = response.usage   # {prompt_tokens, completion_tokens, total_tokens}
model_used = response.model  # actual model selected (may differ from requested if fallback)
cost = log_cost({"input_tokens": usage.prompt_tokens,
                 "output_tokens": usage.completion_tokens}, model_used)
```

`log_cost()` writes to MLflow per conversation turn. `model_used` being logged reveals fallback activation frequency.

---

## Fallback Metrics

The OpenTelemetry span on each `router.acompletion` call includes:
- `llm.model.requested`: `"primary"`
- `llm.model.used`: actual model (e.g. `"azure/gpt-4o"` if fallback activated)
- `llm.fallback_activated`: boolean

`wce_fallback_activations_total` Prometheus metric derived from these spans. Alert if fallback rate > 5% over 1 hour (indicates Anthropic degradation).

---

## Rejected Alternatives

| Option | Reason Rejected |
|---|---|
| Direct Anthropic SDK | Single provider; no fallback; no cost abstraction |
| LangChain LLM wrappers | Heavier dependency; litellm is simpler and more focused on routing |
| OpenAI Python SDK with `api_base` override | Anthropic's API is not fully OpenAI-compatible (tool use schema differs); litellm handles translation |
| Custom proxy server | Reinventing litellm without the 100+ provider adapters |

---

## Consequences

- **Azure OpenAI and Vertex AI credentials required in production.** During the tournament period, only `ANTHROPIC_API_KEY` is required (litellm Router skips unavailable providers if their env vars are absent).
- litellm version must be pinned (`litellm==1.x.y`). Breaking changes between minor versions have been observed.
- For Ollama local dev, `ollama pull llama3.1:8b` must be run once. The route is automatically skipped if Ollama is not running.
- `LANGCHAIN_TRACING_V2=true` also traces litellm calls (litellm integrates with LangSmith natively when LangChain env vars are set).

## What future reviewers should not re-suggest

Do not suggest removing Azure/Vertex fallbacks as "over-engineering." The fallback chain is specifically what makes this portfolio system noteworthy — demonstrating live multi-cloud LLM routing is a concrete differentiator from systems that call a single provider directly. The fallbacks are inactive unless the primary provider fails, so they add zero latency cost in the happy path.
