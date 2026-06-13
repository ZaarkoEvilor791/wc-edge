# ADR 001 — Squad Array Ordering Contract

**Status:** Accepted  
**Date:** 2026-06-13  
**Context:** Session 41 architecture review

---

## Decision

The squad array in `squadStore` is stored in a canonical sorted order: by position (GK → DEF → MID → FWD), then by xP descending within each position group. This order is enforced at write-time inside `setSquad()` — callers pass raw arrays; normalization happens inside the setter.

`getXI()` relies on this order to split the first N players per position into the XI. This is a stated precondition of `getXI()`, met by the store invariant.

## Rationale

`getXI()` must be stateless and fast — it is called on every render. The ordering approach makes it O(n) and pure. Alternatives considered:

- **Store xi and bench explicitly:** Requires keeping them in sync with every mutation. More state, more divergence bugs.
- **Compute XI on demand from a separate sort:** Adds O(n log n) on each render; duplicates the sort logic.
- **Enforce ordering at every call site:** Was the prior (implicit) approach — spread the invariant across 4+ callers, making it easy to violate silently.

Enforcing at `setSquad()` creates a single seam. Any future mutation point (new screenshot path, new optimiser) gets correct ordering for free.

## Consequences

- `setSquad()` is the only correct way to write the squad. Direct store mutations bypass normalization and break the XI split.
- `swapInSquad()` is allowed to exchange two elements by index without resorting, because a valid swap preserves relative xP order within each position group (swapping two players of the same position doesn't violate the within-group ordering invariant; cross-position swaps should trigger a re-sort via `setSquad()`).
- Tests for `getXI()` may assume a pre-sorted input. Tests for `setSquad()` cover normalization.

## What future reviewers should not re-suggest

Do not suggest storing XI and bench as separate arrays in the store. The ordering approach was chosen deliberately to keep `getXI()` pure and avoid sync bugs. If you're seeing divergence between displayed XI and actual squad, the root cause is a mutation that bypasses `setSquad()` — fix that, don't add state.
