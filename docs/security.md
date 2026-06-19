# AI Security + Responsible AI

**Status:** Proposed  
**Date:** 2026-06-19

Security controls, responsible AI practices, and operational security for the wc-edge AI Advisor service.

---

## Threat Model

The primary threats for a fantasy football AI advisor:

| Threat | Impact | Likelihood |
|---|---|---|
| Prompt injection via user chat | LLM ignores instructions, leaks system prompt | Medium |
| Hallucinated player names in squad actions | User transfers wrong player | High (without guardrails) |
| API key exfiltration via LLM | Anthropic/Azure keys exposed | Low (keys not in context) |
| Rate abuse (free tier users flood /api/chat) | LLM cost spike | Medium |
| Dependency supply chain attack | Malicious package in requirements.txt | Low |
| Jailbreak to off-topic content | LLM advises on non-football topics | Low impact |

---

## Input Security

### Prompt Injection Detection

```python
# models/guardrails.py

INJECTION_PATTERNS = [
    r"ignore\s+(previous|prior|all)\s+instructions?",
    r"forget\s+your\s+instructions?",
    r"you\s+are\s+now\s+(?!a\s+fantasy)",   # "you are now DAN" but not "you are now a fantasy advisor"
    r"\bDAN\b",
    r"system\s*prompt",
    r"repeat\s+your\s+instructions?",
    r"what\s+are\s+your\s+instructions?",
]

def detect_injection(user_input: str) -> bool:
    return any(re.search(p, user_input, re.IGNORECASE) for p in INJECTION_PATTERNS)
```

If injection detected: return `{"content": "I can only help with WC 2026 Fantasy advice.", "actions": []}` without calling the LLM.

### Input Sanitization

Strip HTML/JS before any LLM call:

```python
import bleach

def sanitize_input(text: str) -> str:
    return bleach.clean(text, tags=[], strip=True)
```

Applied to all `message.content` fields in the chat request before the LangGraph pipeline runs.

### Input Length Limit

```python
MAX_USER_MESSAGE_TOKENS = 500
MAX_CONVERSATION_TURNS = 20
```

Enforced at the FastAPI route level before any LLM call. Prevents context stuffing attacks and controls cost.

---

## Hallucination Mitigation

### Layer 1: RAG Grounding

All factual claims (xP values, FDR scores, player prices) are injected from retrieved documents, not generated from LLM weights. The system prompt instructs the LLM:

> "Only cite xP values, FDR scores, and player statistics that appear verbatim in the <rag_context> block. If a value is not present in the context, say 'I don't have that data' rather than estimating."

### Layer 2: Player Name Validation

The Guardrails node validates all player names mentioned in `actions[]` against the live DB:

```python
def validate_player_names(actions: list[dict], conn) -> tuple[list[dict], list[str]]:
    """Remove actions referencing non-existent players; return (clean_actions, flagged_names)."""
    valid_names = {row["name"].lower() for row in fetch_all_player_names(conn)}
    clean_actions = []
    flagged = []
    for action in actions:
        name = action.get("name", "")
        if name and name.lower() not in valid_names:
            flagged.append(name)
        else:
            clean_actions.append(action)
    return clean_actions, flagged
```

Hallucinated player names are stripped from the action list and logged to LangSmith for dataset collection.

### Layer 3: Citation Grounding

Every response includes `citations[]` — a list of source strings (`"Haaland xP=6.4 (Round 3 projection)"`). The Guardrails node verifies that each citation links to a node in the retrieved RAG documents. Uncited claims are flagged.

### Layer 4: Bias Audit

XGBoost feature importances are logged to MLflow per training run. If `squad_id` (team nationality) appears as a top-3 feature, a warning is logged:

```python
importances = dict(zip(FEATURE_COLS, model.feature_importances_))
if importances.get("squad_id", 0) > 0.1:
    mlflow.set_tag("bias_warning", "squad_id in top features — possible nationality proxy")
    logger.warning("BIAS: squad_id feature importance %.2f", importances["squad_id"])
```

`squad_id` is intentionally excluded from `FEATURE_COLS` in the canonical implementation; this check catches accidental re-inclusion.

---

## Secret Management

### Development

Secrets in `.env` files (gitignored). Never committed.

```
engine/.env:     DATABASE_URL, API_FOOTBALL_KEY
web/.env:        DATABASE_URL, ANTHROPIC_API_KEY
services/ai-advisor/.env:
    ANTHROPIC_API_KEY
    AZURE_OPENAI_KEY
    AZURE_OPENAI_ENDPOINT
    LANGCHAIN_API_KEY
    DATABASE_URL
    REDIS_URL
```

### Production (Render / Kubernetes)

**Render:** Env vars set in the Render dashboard. Never in `render.yaml` or committed config.

**Kubernetes:** Secrets stored as Kubernetes Secrets (base64-encoded, etcd-encrypted at rest):

```yaml
# k8s/helm/wc-edge/templates/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: ai-advisor-secrets
type: Opaque
stringData:
  ANTHROPIC_API_KEY: {{ .Values.secrets.anthropicApiKey }}
  AZURE_OPENAI_KEY:  {{ .Values.secrets.azureOpenaiKey }}
```

Values injected at deploy time via `helm upgrade --set secrets.anthropicApiKey=$ANTHROPIC_API_KEY`. Never stored in `values.yaml` (which is committed).

### Key Rotation Procedure

1. Generate new key at provider (Anthropic console / Azure Portal)
2. Update Render env var (instant, no redeploy needed)
3. For k8s: `kubectl create secret generic ai-advisor-secrets --from-env-file=.env --dry-run=client -o yaml | kubectl apply -f -`
4. Rolling restart: `kubectl rollout restart deployment/ai-advisor`
5. Revoke old key at provider
6. Document rotation in ops log with timestamp

Rotation should occur: on team member departure, on any suspected key exposure, quarterly as hygiene.

---

## Rate Limiting

### Current (In-Memory — ADR 005)

```typescript
// web/server/server.ts
const rateLimiter = new Map<string, {count: number, reset: number}>()
// 10 req/min per IP for /api/chat
```

Gap: resets on server restart, doesn't work across multiple Render instances.

### Target (Redis Sliding Window)

```python
# services/ai-advisor/rate_limiter.py
async def check_rate_limit(client_ip: str, redis: Redis, limit=10, window_s=60) -> bool:
    key = f"ratelimit:{client_ip}"
    now = time.time()
    async with redis.pipeline() as pipe:
        pipe.zremrangebyscore(key, 0, now - window_s)
        pipe.zadd(key, {str(now): now})
        pipe.zcard(key)
        pipe.expire(key, window_s)
        results = await pipe.execute()
    count = results[2]
    return count <= limit
```

Redis sliding window survives restarts and works across replicas.

---

## Network Security (Kubernetes)

```yaml
# k8s/helm/wc-edge/templates/network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: ai-advisor-policy
spec:
  podSelector:
    matchLabels:
      app: ai-advisor
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: web-bff   # only BFF can reach ai-advisor
  egress:
    - to: []   # unrestricted egress for LLM API calls
```

`ai-advisor` is not exposed to the public internet. Only `web-bff` can reach it. External LLM API calls go via egress.

---

## Responsible AI Commitments

### Human-in-Loop

AI responses are **suggestions only**. All squad actions (transfer, set captain, use chip) require explicit user confirmation in the UI. The AI never writes to the user's squad directly.

### Transparency

Every response includes:
- `citations[]`: list of source data backing factual claims
- `token_usage`: cost logged so users and operators can see spend
- Agent status stream: users see which node is running ("Checking fixtures..." etc.)

### Content Scope Limitation

The system prompt constrains the LLM to WC 2026 Fantasy Football topics only:

```
You are an AI advisor for WC 2026 Fantasy Football. You only discuss:
- Transfer recommendations for WC 2026 Fantasy
- Captain and vice-captain selection
- Chip strategy (Wildcard, Bench Boost, etc.)
- Match and player statistics relevant to fantasy scoring

If asked about anything outside this scope, respond: "I can only help with WC 2026 Fantasy advice."
```

NeMo Guardrails YAML (future enhancement) will enforce this as a hard filter at the infrastructure level, independent of the system prompt.

### Audit Trail

All LangGraph runs are traced in LangSmith with:
- Full input/output per node
- Model used and version
- Token counts and cost
- Timestamp and session ID

Traces are retained for 30 days for incident investigation.

---

## Dependency Security

```bash
# Scan for known vulnerabilities
pip audit   # Python deps
npm audit   # Node deps

# Pin exact versions in production
pip freeze > requirements.lock
```

The `requirements.txt` pins major.minor versions. GitHub Dependabot alerts on new CVEs. Critical CVEs trigger same-day update.

---

*See [llmops.md](llmops.md) for eval pipeline · [hld.md](hld.md) for architecture context*
