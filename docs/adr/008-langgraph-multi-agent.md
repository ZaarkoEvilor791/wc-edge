# ADR 008 — LangGraph Multi-Agent Orchestration

**Status:** Proposed  
**Date:** 2026-06-19  
**Context:** Phase 1 AI Advisor — replacing the thin Claude call in server.ts with a production-grade agentic pipeline

---

## Decision

Replace the single Claude call in `server.ts`'s `/api/chat` handler with a LangGraph `StateGraph` — a 6-node directed acyclic pipeline: Router → [TransferAdvisor | CaptaincyAdvisor | ChipStrategist] → KnowledgeAgent → Synthesizer → Guardrails. Each node is a Python async function that receives and returns an `AgentState` TypedDict. LangSmith auto-traces all runs.

---

## Architecture

```
Router Agent             intent classification
    │
    ├── TransferAdvisor  tools: get_projections, validate_transfer, compare_players
    ├── CaptaincyAdvisor tools: get_fdr, get_captain_history, get_live_scores
    └── ChipStrategist   tools: get_all_round_projections, analyze_remaining_rounds
                │
          KnowledgeAgent  RAG + GraphRAG retrieval (LlamaIndex)
                │
           Synthesizer    merge outputs, format response, generate actions JSON
                │
            Guardrails    hallucination check, citation grounding, injection detection
```

**State schema:** `AgentState` TypedDict — all nodes read/write a single shared state object. No inter-agent messaging; state passes sequentially through the DAG.

**Production safety:**
```python
app = graph.compile(
    recursion_limit=10,       # prevents infinite loops if a node re-routes to itself
    checkpointer=MemorySaver(), # per-thread conversation state for multi-turn
)
```

---

## Rationale

**Why LangGraph over a single LLM call:**  
The current `/api/chat` handler passes the user message and squad context directly to Claude. This works for simple questions but fails for:
- Queries requiring tool calls (DB lookups for xP, FDR)
- Multi-step reasoning (classify intent → retrieve relevant data → synthesize → validate)
- Structured output (actions JSON must be validated against Pydantic schema)
- Observability (no tracing on a direct API call)

LangGraph provides a typed state machine with LangSmith tracing, tool call support, streaming events, and conversation checkpointing — all required for a production AI advisor.

**Why a DAG (not a loop):**  
WC Fantasy queries have a clear sequential structure: classify intent → fetch data → retrieve context → synthesize → validate. There is no use case for an agent to "decide to loop back" — that complexity would require a supervisor agent and adds latency and unpredictability. The `recursion_limit=10` guard prevents accidental loops.

**Why specialist nodes instead of one general agent:**  
Each specialist (Transfer/Captaincy/Chip) has different tools and different few-shot examples in the system prompt. A general agent would either need all tools always (wasted context) or dynamic tool selection (fragile). Specialist nodes are simpler, more testable, and produce higher-quality outputs per intent type.

---

## Streaming

SSE events emitted per node via `graph_app.astream_events(state, version="v2")`:

```python
async for event in graph_app.astream_events(state, version="v2"):
    if event["event"] == "on_chain_start":
        node = event["metadata"].get("langgraph_node")
        yield f"data: {json.dumps({'type':'status','node':node})}\n\n"
```

Frontend shows: "Analyzing transfers... → Checking fixtures... → Validating..." before the final response appears. This is the key UX difference from a blocking API call.

---

## Rejected Alternatives

| Option | Reason Rejected |
|---|---|
| CrewAI | Less granular state control; agent communication via messages (not shared state) makes Pydantic validation harder to wire in; YAML config is less flexible for this data-heavy use case |
| AutoGen (Microsoft) | Microsoft ecosystem focus; less clean LangSmith integration; state management less transparent |
| Custom orchestration | Reinvents tool call dispatch, streaming, checkpointing, tracing — all available in LangGraph |
| Single Claude call (current) | No tools, no RAG, no tracing, no structured output validation — insufficient for production |

**Note:** CrewAI YAML agent definitions are scaffolded in `services/ai-advisor/crewai/crew.py` as an alternative implementation to demonstrate framework breadth.

---

## Consequences

- All LangGraph runs are auto-traced in LangSmith with full per-node input/output (requires `LANGCHAIN_TRACING_V2=true`)
- `MemorySaver` checkpointer stores conversation state in-process. For multi-replica Kubernetes deployments, replace with `RedisSaver` (async Redis checkpointer from `langgraph-checkpoint-redis`)
- `recursion_limit=10` means a pathological routing loop aborts after 10 steps and returns an error. This is the correct behaviour — the caller (BFF) catches it and falls back to the legacy handler
- Integration tests mock the litellm router (`patch("models.router.router.acompletion")`) — not the individual Claude API — to test the full graph wiring at the correct abstraction level
- The BFF circuit breaker (`chatWithAIAdvisor` in server.ts) falls back to the legacy direct-Claude handler if ai-advisor is unreachable. This maintains production availability during the Phase 1 rollout.

## What future reviewers should not re-suggest

Do not suggest CrewAI as a replacement for LangGraph. The data-centric `AgentState` pattern (shared typed dict, sequential DAG) is the right abstraction for this use case where each node needs to read/write specific fields (rag_context, graph_context, citations) without message-passing overhead. If you see a need for autonomous agent collaboration, that's a signal the problem has changed — revisit the architecture then.
