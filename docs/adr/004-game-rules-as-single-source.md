# ADR 004 — Game Rules as Single Source of Truth

**Status:** Accepted  
**Date:** 2026-06-13  
**Context:** Session 41 architecture review — Candidate D

---

## Decision

All WC 2026 Fantasy game constants live in `web/src/config/gameRules.ts`. No page component, hook, or service may define game rules inline. This includes:

- `POS_REQUIRED` — squad position requirements
- `POS_COUNT` — XI starter counts per position
- `SCORING` — all scoring constants (goals, clean sheet, appearances, cards)
- `FREE_TRANSFERS_BY_PHASE` — free transfer allowance per tournament phase
- `TOTAL_ROUNDS` — 8

`engine/config.py` mirrors the same constants for the Python engine. Both files must be kept in sync manually (no auto-generation during the tournament; verify on each rule change).

## Rationale

`FREE_TRANSFERS_BY_PHASE` was found in `Transfers.tsx` at Session 41 review — a page component. If FIFA updated transfer counts mid-tournament, the fix would require editing a page. All other game rules live in `gameRules.ts`. This is a locality miss with no benefit.

## Consequences

- Any PR that adds a game rule constant to a page component or hook will be rejected.
- `FREE_TRANSFERS_BY_PHASE` is exported from `gameRules.ts` and imported in `Transfers.tsx`.
- The type `RoundPhase` lives in `squadValidator.ts` (as a domain type, not a config constant). `FREE_TRANSFERS_BY_PHASE` is keyed by `RoundPhase`.

## What future reviewers should not re-suggest

Do not suggest co-locating game constants with the component that uses them. Even if only one component uses a constant today, constants migrate and the config file is the correct home.
