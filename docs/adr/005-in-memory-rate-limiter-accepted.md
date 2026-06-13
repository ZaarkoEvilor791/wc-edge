# ADR 005 — In-Memory Rate Limiter: Accepted for Tournament Duration

**Status:** Accepted  
**Date:** 2026-06-13  
**Context:** Session 41 architecture review — Candidate E

---

## Decision

The rate limiter for `/api/chat` and `/api/from-screenshot` is stored in-memory (JS Map) on the Express server. This state is lost on dyno restart. This is accepted as-is for the tournament duration (until July 19, 2026).

## Rationale

- The Anthropic budget is $5 total. The blast radius of a reset is at most a few extra chat calls.
- Neon free tier has low write IOPS; adding a DB write per chat request adds latency with minimal security gain.
- Render free tier restarts the dyno at most once per day (cold start on first request). The window for abuse is narrow.
- Engineering effort for a DB-backed rate limiter is disproportionate to the risk during a 5-week tournament.

## Consequences

- A user who triggers a dyno restart (or waits for the daily recycling) gets a fresh daily quota.
- This is a known, documented gap — not a missed requirement.
- If LLM costs spike unexpectedly, the first remediation is to check Anthropic usage logs, then reduce `max_tokens` or add model caching, not to harden the rate limiter.

## What future reviewers should not re-suggest

Do not suggest a Redis-backed rate limiter or DB-backed rate limiter during the tournament. The gap is accepted and the tradeoff is deliberate. Revisit post-tournament if the app continues as a product.
