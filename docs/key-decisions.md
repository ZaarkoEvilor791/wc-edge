# Key Decisions

Authoritative design decisions. Before changing anything in this list, check if an ADR exists in `docs/adr/`.

---

## Squad / XI

- **`getXI` is array-order based** — first N of each position = XI. Pre-sort xP on DB load; swaps exchange array positions. `getXI(players, posCount?)` second arg overrides default POS_COUNT. See ADR 001.
- **`normalizeSquad(players)`** — named utility in `utils/squad.ts`. Sort by (position, xP DESC). Call on fresh loads (DB, screenshot, onboarding). Do NOT call after manual swaps — that resets the user's XI/bench intent.
- **`formationCounts` in squadStore** — persisted `{DEF,MID,FWD}`, default `{4,4,2}`. Always pass `{ GK:1, ...formationCounts }` to `getXI` in Squad.tsx.
- **`optimiseXI` tries 8 formations** — 4-4-2, 4-3-3, 3-5-2, 3-4-3, 5-3-2, 5-4-1, 4-5-1, 5-2-3. Skips if position count unavailable.
- **Squad corrupt check is duplicates-only** — `new Set(elements).size !== squad.length`. Partial squads render with EmptySlotCard gaps.

## Validation

- **`canAddPlayer(squad, candidate, phase, squadCost, budget)`** in `squadValidator.ts` — single gate for position-cap + budget + country-limit. Squad.tsx `handleAdd` and BrowseAllModal add-mode both call it. See ADR 002.
- **`getEligibleSwapTargets`** in `utils/squad.ts` handles swap validation. GK position-locked. Outfield: `newDEF≥3 && newMID≥2 && newFWD≥1`.
- **Country limit is UI-enforced** — ADR 002 (Proposed) tracks full server enforcement. Current: visual warning in Squad.tsx.
- **`eligibleElements` is an IIFE, not `useMemo`** — computed after early returns in Squad.tsx; using `useMemo` violates Rules of Hooks.

## Config / Game Rules

- **`FREE_TRANSFERS_BY_PHASE`** lives in `config/gameRules.ts` (moved from Transfers.tsx in S41). See ADR 004.
- **`SCORING` is the single source of truth** — used in chat system prompt (server) and xP breakdown (PlayerProfileModal). Mirrors `engine/config.py`. See ADR 004.
- **`FREE_TRANSFERS_BY_PHASE`**: `{group:2, r32:6, r16:4, qf:4, sf:5, final:6}`. Auto-set on mount from round stage. Not server-enforced.

## Transfers

- **BrowseAllModal two modes** — OUT→IN (`initialOut` set): position-locked immediate confirm. IN→OUT: two-step browse.
- **Transfers squad list is primary UI** — tap player → OUT→IN via `BrowseAllModal(initialOut)`. Smart suggest is secondary.
- **Server up to 6 transfer suggestions** — `freeTransfers` is badge/hit threshold only, not loop limit.
- **Hit verdict on SwapCard** — `net = xp_gain - 3`. Green if `net > 0`.

## Edge AI / Chat

- **LLM rate limits in-memory** — resets on dyno restart. See ADR 005 (accepted gap). `/api/chat`: 5/min + 25/day. `/api/screenshot`: 2/min + 5/day.
- **Edge agentic actions** — `/api/chat` system prompt instructs Claude to append `\`\`\`actions\n[...]\n\`\`\`` at end. Server regex-parses + strips, returns `{content, actions}`. `executeActions()` in `Assistant.tsx`: `set_captain`, `set_vice_captain`, `suggest_transfers`, `optimise_xi`. `navigate` was removed in S40.
- **`set_captain`/`set_vice_captain` use fuzzy containment matching** (`matchPlayer`) — "Haaland" matches "E. Haaland".
- **`max_tokens` is 400** — "≤120 tokens" reply limit must say "text only — actions block excluded" or model drops the block.
- **Chat persisted in `appStore`** — `chatMessages` + `chatChipsUsed`. Survives page reload.
- **Screenshot upload in chat** — camera icon → base64 → `wcApi.squadFromScreenshot()`. Same rate limit as `/api/from-screenshot`.
- **Token efficiency** — system prompt cached with `cache_control: { type: 'ephemeral' }`. `max_tokens 1024→200` (ATROS, S32).

## Server / DB

- **`matchPlayersByName` two-pass** — position-filtered first, falls back to position-agnostic. Normalizes: FIFA truncation (`...`), diacritics (unaccent), Cyrillic `і→i`. All parameterized.
- **`/from-screenshot` returns `{name, position}` objects** — LLM extracts position from pitch layout. `max_tokens=256`.
- **`migrate.py` must run on new DB instances** — adds `player_stats` table + bonus columns + `is_penalty_taker`. Engine crashes with `UndefinedColumn` if skipped.
- **unaccent extension** — already installed on `fpledge` DB. Required for `matchPlayersByName`.

## Live Scores

- **Live tier order** — Tier 1 (community API, dead for WC2026) → Tier 1.5 (ESPN, primary) → Tier 2 (FIFA schedule fallback).
- **ESPN public scoreboard** — `site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=YYYYMMDD`. No key, no rate limit. Past days cached 1hr; today 60s.
- **Round status is `'playing'` not `'active'`** — `useCurrentRound()` and `getCurrentRoundId()` accept both.
- **`useLive(round)` is a shared hook in `useWC.ts`** — exported alongside other hooks. 60s `refetchInterval`. Pass `round` as `undefined` to disable (used in Captain when round is not `'playing'`).
- **`useRounds()` polls every 2 min** — `refetchInterval: 2 * 60_000`. Everything that depends on `currentRound` (projections, FDR, captain mid-round mode) updates automatically when round status changes in DB.

## Persistence

- **Squad Store** — persists squad, captain, viceCaptain, budget, formationCounts, boosterStates.
- **App Store** — persists squadViewMode. Does NOT persist unmatchedNames, wcOnboardingOpen.
- **`chatMessages` + `chatChipsUsed` ARE persisted** (added S36). Survive reloads.
- **`unmatchedNames` in appStore is non-persisted** — clears on reload. `setUnmatchedNames([])` coerces to null.

## UI / Components

- **`show_tip` action** — Edge injects `__TIP__:<page>` sentinel into chat array. Rendered as `PageGuideCard`. Content in `pageGuides.ts`.
- **Bottom tab bar** — `BottomTabBar.tsx` is `md:hidden`. Layout adds `pb-20 md:pb-0`. More button opens sheet with Boosters + Live.
- **Boosters state in squadStore** — `boosterStates: Record<string, 'available'|'active'|'used'>`. IDs: `wildcard|max_captain|12th_man|qual_booster|cs_shield`. R32+ chips locked when `currentRoundId <= 3`.
- **C/VC auto-assign picks from XI only** — `getXI(sorted, {GK:1,DEF:4,MID:4,FWD:2})`. Only set captain when `captain === null`.
- **`backdrop-blur` stacking context** — only works outside `overflow:hidden`. Pitch is unsafe. Safe: sidebar, topbar, bottom tab bar, chat bubbles, modals.
- **Glassmorphism glow tokens** — CSS vars in `index.css` (`--glow-gold`, `--glow-cyan`, `--glow-card`). Tailwind `boxShadow` tokens in `tailwind.config.ts`. Tune globally, not per-component.
- **EmptySlotCard only shown when `onEmptySlotClick` passed** — Squad page passes it; Transfers doesn't.
- **`lockedElements?: Set<number>` on `Pitch`** — optional prop for mid-round lock state. Passed to `FormationRow` and bench strip → `PitchPlayerCard` `isLocked`. Does not interact with swap mode. Captain page uses it; Squad page does not.
- **`isLocked` on `PitchPlayerCard`** — `disabled` button, `opacity-40`, `cursor-not-allowed`, shows FT label instead of xP. Takes precedence over `isDimmed`.
- **Captain page pitch view** — `onPlayerClick` sets captain (not swap). No `swapSourceElement` / `eligibleElements` passed. Mid-round locked players fire no-op in handler + are `disabled` at button level.
- **`fillSquadFromSuggested` called in `OnboardingModal`** — `handleConfirmSquad` calls it with `suggestedData?.squad_json ?? []` to guarantee 15 players before `normalizeSquad`. `useSuggestedSquad()` added to `ModalContent` for this purpose.

## Engine

- **`blend_live_observations` is zero-op pre-tournament** — activates when rounds have `status='COMPLETE'`.
- **00:00 UTC cron closes post-match lag** — WC matches end ~23:00 UTC.
- **Post-group cron hardcoded June 27** — simpler than status-checking.
- **StatsBomb field names** — `pass.shot_assist` (NOT `key_pass`). Tackles: `type.name === 'Duel'` + `duel.type.name === 'Tackle'`.
- **API Football 100 req/day hard cap** — track in `engine/data/apif_budget.json`.
