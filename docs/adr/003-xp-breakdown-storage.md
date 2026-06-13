# ADR 003 — xP Breakdown: Stored vs. Derived

**Status:** Deferred  
**Date:** 2026-06-13  
**Context:** Session 41 architecture review — Candidate C

---

## Decision (deferred)

The xP breakdown (goals / clean sheet / appearance / other) is currently reverse-engineered in `PlayerProfileModal.tsx` from raw projection probability fields using a simplified formula. This is a frontend shadow copy of the engine model.

The proposed decision is to store the breakdown as a JSONB column (`xp_breakdown`) in `wc.player_projections`, computed by `wc_model.py` at projection time, and returned by `/api/projections`.

## Why deferred

During the tournament, changing the DB schema and engine output format introduces migration risk with no clear user-visible benefit (the breakdown numbers are approximately correct). The model is not expected to change significantly mid-tournament.

Recommended trigger: implement at the start of Phase 2 (post-tournament model work) when the scoring model is being extended with tackles/key passes data.

## What the implementation looks like

```python
# engine/wc_model.py
breakdown = {
  "goals": goal_xp,
  "clean_sheet": cs_xp,
  "appearance": app_xp,
  "other": max(0, total_xp - goal_xp - cs_xp - app_xp)
}
# Write to wc.player_projections.xp_breakdown (JSONB)
```

```typescript
// PlayerProfileModal.tsx — replace formula with passthrough
const { goals, clean_sheet, appearance, other } = projection.xpBreakdown
```

## Consequences

- `PlayerProfileModal` loses its dependency on `SCORING` constants. The breakdown is always accurate to the engine.
- Adding a new scoring event (e.g., tackles) is a one-file change in the engine. Frontend picks it up automatically.
- Requires a DB migration: `ALTER TABLE wc.player_projections ADD COLUMN xp_breakdown JSONB`.
- Engine must be re-run after migration to populate the column.

## What future reviewers should not re-suggest

Do not suggest moving breakdown computation into a frontend utility function. The formula in the engine and in the frontend will drift. If you see the breakdown looking wrong, the fix is to store it in the DB, not to refine the frontend formula.
