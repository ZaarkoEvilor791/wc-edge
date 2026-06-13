# ADR 002 — Validation Gate in squadValidator.ts

**Status:** Proposed  
**Date:** 2026-06-13  
**Context:** Session 41 architecture review — Candidate B

---

## Decision (proposed)

Extend `domain/squadValidator.ts` to be the single validation gate for all squad mutations. It should answer three questions:

1. `validateSquad(squad, phase)` — is the final squad valid? (already exists)
2. `canAddPlayer(squad, candidate, phase, budget)` — can this player be added?
3. `canSwapPlayers(squad, sourceEl, targetEl, phase)` — is this swap legal?

All mutation points (Squad.handleAdd, Squad.handleSwap, BrowseAllModal add mode, transferAdvisor.ts) must call through this gate before mutating. Country limits must be enforced here (not just as UI warnings).

## Rationale

The question "is this add/swap valid?" is currently computed in 7 places with subtly different logic. Deletion test: removing any one causes no test failure (others fill the gap inconsistently). This is the signal for a real seam.

Country limits are currently UI-only. A user can build a squad violating country caps (e.g., 4 players from Brazil in group stage) and the app accepts it. This is a rule violation that wc-edge should enforce, not just warn about.

## Status note

This ADR is **Proposed**, not Accepted. The refactor touches 7 files and requires a DB schema decision (does the server validate, or only the client?). Recommended trigger: implement this when FIFA changes rules mid-tournament or when a country-limit bug is reported. Don't do it speculatively during the tournament.

## Consequences

- `squadValidator.ts` becomes a pure functions module with no React dependencies — importable by both client and server.
- Server-side: the `/api/transfers/suggest` route should optionally run `validateSquad()` on the result before returning.
- All visual "Position full" / "Country limit" warnings derive from these functions rather than computing inline.
- Tests: one test file for `canAddPlayer()` covers all callers' edge cases.

## What future reviewers should not re-suggest

Do not suggest moving validation into individual page components or into the Zustand store actions. The store's job is state, not domain rules. Validation belongs in `domain/`.
