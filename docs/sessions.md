# Session History

## Session 44 — Star ratings + Captain kickoff timing

- **`playerStarRating(xp, lowSample)`** added to `utils/squad.ts` — tiers: ≥6.0=★5 (gold), ≥4.5=★4 (cyan), ≥3.0=★3 (slate), `low_sample` players capped at ★3. Returns 0 for 1★/2★ (no badge rendered).
- **Star badges on all player surfaces** — compact `★N` pill top-left on `PitchPlayerCard` (C/VC stay top-right); star glyph rows above xP in `BrowseAllModal` (all 3 modes), `Transfers` SquadList, `Squad` list, and `Captain` list.
- **Captain kickoff timing** — `Captain.tsx` previously locked players only after `status='finished'`. Now builds `matchKickoffs` map (squad_id → `{ kickoff: Date, status }`) from ESPN live data and computes `lockedElements` using kickoff timestamp (locks when `kickoff <= now` OR `status='live'/'finished'`). Fallback to `playedElements` when ESPN has no match data for a team.
- **Kickoff chips in Captain list** — unplayed players show `kicks off HH:MM` (slate, >6h), `kicks off in Xh Ym` (amber, <6h), or `Live` badge (green) inline in the position·abbr line. A 30s `now` state ticker keeps chips fresh between 60s live data polls.
- **Tournament monitoring** — engine crons all green. After day 2 apif ingest: 1,484 players, 578 with club stats. Top xP: Salah 8.66, Ronaldo 7.89, Gyökeres 7.56. `blend_live_observations` waiting for first round to complete.

## Session 42 — Live round awareness + Captain page redesign

- **Screenshot fill fix** — `OnboardingModal.handleConfirmSquad` previously stored only the matched players (e.g. 10 of 15), leaving squad short and cost inconsistent. Now calls `fillSquadFromSuggested(matched, suggestedData?.squad_json ?? [])` to pad to 15 with top-xP picks before normalizing. `useSuggestedSquad()` added to `ModalContent`.
- **Live round awareness** — `useRounds()` gains `refetchInterval: 2 * 60_000`. Round status changes (e.g. cron writes `status='playing'`) now detected within 2 min without user navigation. `useProjections(round)` + `useTeamFdr(round)` cascade automatically via React Query key change.
- **`useLive(round)` extracted** — previously inlined in `Live.tsx`. Now exported from `useWC.ts`. `Live.tsx` switches to the shared hook; `Captain.tsx` uses it for mid-round swap detection.
- **Captain page redesign** — full rewrite. Pitch view (reuses `Pitch` + `PitchPlayerCard`) is now the primary UI. Tap any unplayed player on pitch to set captain (C badge). Ranked list remains below pitch for xP/FDR/variance context and VC assignment. Deadline countdown badge replaced by "Mid-round swap" badge when `currentRound.status === 'playing'`.
- **Mid-round swap mode** — when round is `'playing'`, cross-references ESPN live data with squad players' team name. Players whose team has a `finished` match today: dimmed (opacity-50), FT badge replaces xP, button disabled. All others are captainable. Graceful fallback: if `useLive()` returns no data, all players are swappable.
- **`lockedElements` prop on `Pitch`/`PitchPlayerCard`** — new optional `Set<number>`. `isLocked` on card: `disabled`, `opacity-40`, `cursor-not-allowed`, FT label replaces xP. Backward-compatible; Squad page unaffected.
- **Live page** — captain banner removed (superseded by Captain page mid-round mode). `useSquadStore` import removed from `Live.tsx`.

## Session 41 — Architecture deepening

- **`normalizeSquad()`** extracted to `utils/squad.ts` — named utility for sorting squad by (position, xP DESC). Used in Squad.tsx init + `handleAdd`, and OnboardingModal `handleBuildWithVariant` + `handleConfirmSquad`. Callers use it on fresh loads; swaps bypass it to preserve user intent. See ADR 001.
- **`canAddPlayer()`** added to `squadValidator.ts` — single gate for position-cap + budget + country-limit. Replaces inline checks in Squad.tsx `handleAdd` and BrowseAllModal add-mode. BrowseAllModal now also enforces country limits (was missing before). `squadPosCounts` useMemo removed from BrowseAllModal (no longer needed). See ADR 002.
- **`FREE_TRANSFERS_BY_PHASE`** moved from `Transfers.tsx` to `config/gameRules.ts`. See ADR 004.
- **`CONTEXT.md`** + **`docs/adr/`** created — domain glossary and 5 ADRs.
- **`CLAUDE.md`** split into CLAUDE.md + `docs/ops.md` + `docs/sessions.md` + `docs/key-decisions.md`.
- **Tests:** 129 vitest (up from 118) — 5 new `normalizeSquad` tests, 6 new `canAddPlayer` tests.

## Session 40

- **Squad integrity hardened** — ghost players (null `element`) can no longer corrupt squad. `setSquad` strips nulls. `BrowseAllModal` add mode and `Squad.handleAdd` block over-limit adds. `Transfers.tsx` derives `safeSquad` at top of component.
- **Edge `navigate` action removed** — Edge gives text directions only. `suggest_transfers`/`optimise_xi` still navigate programmatically.
- **JARVIS system prompt** — tactical analyst persona. ~80 tokens shorter. `navigate` removed from `actions_guide`.
- **3 UX fixes** — Boosters tips expanded by default; SwapCard stacks vertically on mobile; PlayerProfileModal scroll area.

## Session 39

- **Live page fixed** — 3 compounding bugs: `'playing'` vs `'active'` round status; `wc_run.py` status normalization; ESPN fallback as Tier 1.5.
- **Live page shows all past scores** — ESPN tier fetches every day from round's `start_date`. Past days cached 1hr; today 60s.
- **Sci-fi visual overhaul** — glassmorphism/glow aesthetic. Cyan `#00D4FF`, brighter gold `#E8B84B`, CSS glow variables, Tailwind boxShadow tokens, `scan`/`shimmer` keyframes, 40px cyan grid on body bg.

## Session 38

- **Mobile UX overhaul** — BottomTabBar (`md:hidden`), FDR inline badge, onboarding descriptions, touch targets ≥44px, squad empty state CTAs.
- **Edge `show_tip` action** — gold guide cards in chat after page navigation. `__TIP__:<page>` sentinel → `PageGuideCard`. Content in `pageGuides.ts`.
- **`is_penalty_taker` migrated to Neon** — `engine/migrate.py` run; 32 penalty takers seeded.

## Session 37

- **Model accuracy fixes** — 3 bugs fixed; squad xP jumped 53.52 → 74.50. Missing scoring events (MID chances/tackles, FWD SOT). GK xG leak zeroed. Start rate fix with price-scaled default.
- **25 penalty takers seeded** — `is_penalty_taker=TRUE` on top PKers. Adds `PENALTY_XG_PER90=0.003` to xg90.
- **`wc.player_stats` bonus columns** — `tourn_chances90`, `tourn_tackles90`, `tourn_sot90`.
- **Result:** Haaland 6.16 / Mbappé 5.95 / Kane 5.78 / Yamal 5.71 xP R1.

## Session 36

- **Edge actions fixed** — model was dropping action JSON due to token budget. Fixed by excluding actions block from "≤120 tokens" limit. All 5 action types given concrete JSON examples.
- **Chat messages persisted** — `chatMessages` + `chatChipsUsed` added to `appStore` `partialize`.
- **`set_captain` name matching fixed** — fuzzy containment helper (`matchPlayer`).
- **Ghost squad-lock removed** — Edge can't claim to "lock" a squad.

## Session 35

- **Agentic Edge** — actions block in chat: `navigate`, `set_captain`, `set_vice_captain`, `suggest_transfers`, `optimise_xi`. Server parses + strips it.
- **Screenshot upload in chat** — camera icon → base64 → `/api/squad/from-screenshot`.
- **Chat persistence** — `chatMessages` in `appStore` (non-persisted at this point; made persistent in S36).

## Session 34

- **Squad variant presets** — optimizer produces 3 variants: `max_xp`, `value`, `differential`. DB PK changed to `(round, variant)`.
- **3-step onboarding wizard** — Style → Budget → Risk → fetches pre-computed variant.
- **DB migration** — Render Postgres (expired) → Neon free tier.

## Session 33

- **`_sync_round_statuses()`** — every engine run fetches FIFA `rounds.json` and UPSERTs status to DB. Non-fatal.
- **00:00 UTC cron** — closes post-match blending gap.
- **Captain resync fix** — captain reassigns to highest-xP XI player when not in new squad's XI.

## Session 32

- **Architecture deepening** — 5 refactors: `getEligibleSwapTargets` extracted; `buildScoringContext` data-driven; `ROUTES` const shared; `matchPlayersByName` returns typed result; `screenshotService.ts` extracted.
- **ATROS optimization** — `max_tokens 1024→200`; system array with ephemeral cache_control.

## Session 31

- **Data-driven booster recommendations** — 5 pure `rec*` functions. `useQueries` for all 8 rounds. Loading skeleton.
- **Multi-round projection fetch** — React Query caches warm from Captain/Squad pages.

## Session 30

- **C/VC auto-assign fix** — captain picks from `getXI()` result (XI only).
- **Pitch card-to-card swap** — SwapDrawer deleted. Tap card → profile modal → Sub In/Out → swap mode.
- **Boosters page** — 5 chip cards with state tracking in `squadStore`.
