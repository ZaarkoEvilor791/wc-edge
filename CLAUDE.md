# wc-edge Project Guide

**Project:** FIFA WC 2026 Fantasy Companion Tool — squad builder, transfer advisor, captain picker, live tracker, and Edge AI advisor.

**Deadline:** June 11, 2026 (Day 8). Tournament starts June 12, 2026.

**Production URL:** `https://wc-edge.onrender.com`

**Local dev:** frontend at `http://localhost:5173`, Express API at `http://localhost:3001`

**Database:** Render Postgres (free tier, 256MB)

**PRD:** https://github.com/ZaarkoEvilor791/fpl-edge/issues/12

**Full design doc:** `wc-edge.md` in this repo

**Parent project:** `fpl-edge` at `../fpl-edge` — copy patterns from there, not code

---

## Session Context (read this first)

**Session 1 (2026-06-04) — repo scaffolded, planning complete:**

- Design grilling complete — all pages, API routes, and deployment fully specified
- PRD published at https://github.com/ZaarkoEvilor791/fpl-edge/issues/12
- Repo scaffolded, wc-edge.md copied (API key scrubbed), CLAUDE.md written

**Session 2 (2026-06-04) — infra complete, engine scaffolded, ready for Phase 1 scrape:**

- `wc-edge-prd.md` written and committed (full PRD with user stories + test strategy)
- `render.yaml` created — DB stanza removed (Render free tier allows only 1 DB; reusing fpl-edge Postgres)
- Render web service live at `https://wc-edge.onrender.com`
- **Database:** reusing fpl-edge Postgres (`fpledge` DB). Internal URL set in Render env. External URL in `engine/.env`.

**Session 3 (2026-06-04) — Day 1 engine complete, Phase 1 scrape done:**

- All engine foundation files written: `config.py`, `db.py`, `__init__.py`, `requirements.txt`
- **Schema updated:** all tables now under `wc` Postgres schema (`CREATE SCHEMA IF NOT EXISTS wc`) to avoid collision with fpl-edge's `players`/`teams` tables on the shared DB. All queries use `wc.tablename`.
- `db.py` sets `search_path=wc,public` on connect — no schema prefix needed in SQL
- **`wc_ingest.py` written** — all 4 sources: statsbomb, sofascore, fifa, apif
- **Phase 1 scrape complete (Day 1):**
  - StatsBomb: 199 match files, 1,441 unique players cached → `engine/data/sb_cache.json`
  - Sofascore: **403 blocked** (Cloudflare). AFCON 2025 players fall back to AFCON 2023 StatsBomb data.
  - FIFA Fantasy: 1,481 players (48-team WC 2026), 8 rounds, 32 squads upserted to DB
  - API-Football: 107 players with club stats upserted. **Budget used: 80/100 today.**
- **DB state after Day 1:**
  - `wc.players`: 1,481 rows
  - `wc.teams`: 32 rows
  - `wc.rounds`: 8 rows
  - `wc.player_stats`: 571 rows (520 with tournament stats, 106 with club stats, 56 with both)
  - `engine/data/unmatched_players.json`: 961 players for Day 3 review
- **Known bugs fixed during this session:**
  1. API-Football `/players/topscorers` has no `page` parameter — `&page=1` returns error. Fixed to single request per league, no pagination.
  2. Abbreviated API-Football names ("A. Isak") added last-name-only fallback in `_resolve_element()`
  3. All `wc_schema.sql` tables prefixed with `wc.` namespace
**Session 4 (2026-06-05) — Day 2 complete: engine pipeline + full web scaffold:**

- `engine/engine/wc_model.py` — Bayesian xG/xA posteriors, seed-based FDR, full xP formula → writes wc.projections (11,848 rows)
- `engine/engine/wc_optimizer.py` — HiGHS MILP 15-player squad solver → writes wc.suggested_squad
- `engine/engine/wc_run.py` — orchestrator: `py -m engine.wc_run` runs model + optimizer
- **3 critical bugs fixed in wc_ingest.py:**
  1. FIFA Fantasy `position` is a STRING ("DEF") not int — was silently defaulting all 1481 players to MID
  2. `teams` table must be built from `rounds.json` fixtures (sequential IDs 1-48 matching player.squadId), NOT from `squads_fifa.json` (which uses FIFA entity IDs 43817+ with no overlap)
  3. Enrich seed/group by team name match between rounds.json and squads_fifa.json
- **Full web scaffold written:** Vite+React+TS, Express, 5 pages, sidebar, WC gold accent, all hooks, TypeScript clean
- **DB state after Day 2:** projections (11,848), suggested_squad (round 1: £98.9m, 77.6 xP)
- **Next session starts here (Day 3):**
  1. Review `engine/data/unmatched_players.json` top-30 — add overrides to `engine/data/name_overrides.json`
  2. Wire Express DB routes to real SQL queries (server/db.ts already has all query functions)
  3. Build out Assistant page (AI chat with FIFA player context)
  4. Day 4: `py -m engine.wc_ingest --source apif --day 2` (fresh 100 req) + re-run model

**Session 5 (2026-06-06) — Day 3 complete: name overrides + Assistant page shipped:**

- **Name overrides complete** — `engine/data/name_overrides.json` has 13 entries (Vinicius, Mbappé, Bellingham, Rodri, Raphinha, Pedri, Gavi, Dani Olmo, Lucas Paquetá, Rúben Dias, Son)
- **Fixed broken override:** `"rodri"` → `"rodrigo hernandez cascante"` (was `"rodrigo hernández"` which doesn't match sb_cache key)
- **SB coverage insight:** absent for (a) nations not at WC22/Euro24/Copa24/AFCON23 — Norway, Sweden; (b) players <45 min — Toney, Gordon, Cherki, Doué
- **Express routes:** all already wired. Placeholders: `/api/squad/optimize` (Day 5), `/api/transfers/suggest` (Day 6) — intentional.
- **Assistant page shipped** (`web/src/pages/Assistant.tsx`):
  - Full-page chat, immediate-send chips, pulsing "Edge is thinking…" gold dots
  - **Critical fix in `server.ts`:** accepts `squadNames: string[]` (not element IDs) — Haiku has no knowledge of FIFA element numbers
  - Top-5 projections injected as context prefix on first user message only (no extra server latency)
  - No streaming — pulsing loading state sufficient for Day 3
  - 3 squad chips (if squad loaded): "Who should I captain?", "Which player to transfer out?", "Rate my squad out of 10"
  - 3 generic chips (no squad): "Best value picks for WC 2026?", "Best GK fixtures round 1?", "Build me a £100m squad"
  - `Layout.tsx`: changed `overflow-auto` → `overflow-hidden` on main so chat's pinned input works
  - `index.css`: pulse keyframe for thinking dots
- **`web/.env` created** (gitignored) — `DATABASE_URL` + `ANTHROPIC_API_KEY` required locally
- **Test results (Day 3):**
  - `/api/rounds` ✅ 8 rows
  - `/api/players` ✅ 1,481 rows, name field derived
  - `/api/projections?round=1` ✅ 11,848 rows, sorted xP DESC
  - `/api/squad/suggest` ✅ 15 players, £98.9m, 77.6 xP
  - `/api/chat` ✅ routing correct — blocked by **Anthropic account needs credits** (not a code bug)
- **Known DB bug (pre-existing from Day 2):** `wc.teams` has 80 rows instead of 48 — duplicate entries with FIFA entity IDs (43817+) alongside correct sequential IDs (1-48). Fix: re-run `py -m engine.wc_ingest --source fifa` on Day 4 after adding a DELETE before upsert.
**Session 6 (2026-06-06) — UI quality pass: fpl-edge parity + WC theme:**

- **Accent changed:** gold (#E8B84B) → teal (#00D8CB) — `tailwind.config.ts`, cascades everywhere automatically
- **FIFA WC 2026 banner:** slim strip at top of Layout spanning full width (`bg-slate-900 border-accent/20 text-accent/80`)
- **Logo component:** `web/src/components/shared/Logo.tsx` — inline SVG trophy mark (collapsed) + "wc-edge" wordmark (expanded), mirrors fpl-edge pattern. Used in `Sidebar.tsx`.
- **Shared component library created** (`web/src/components/shared/`):
  - `Spinner.tsx` — spinning `border-t-accent` with label
  - `StatCard.tsx` — `rounded-xl border-slate-800 bg-slate-900 p-4 text-center` with label/value/sub
  - `Logo.tsx` — `LogoMark` (collapsed) + `Logo` (expanded) with trophy SVG
- **Layout.tsx:** overflow-hidden → overflow-auto (chat still works via negative margin + internal scroll); WC banner added above sidebar+main row
- **Assistant.tsx:** "Powered by Claude" badge in header; user bubbles → `bg-slate-700 text-slate-100` (not accent); ThinkingDots → `animate-bounce` staggered; border colors → slate-800
- **Squad.tsx:** 3 StatCards header (Total xP / Squad Cost / Players); PlayerCard → `rounded-xl border-slate-800 bg-slate-900`; position headers show count
- **Captain.tsx:** column headers row; TOP PICK label on #1; C badge; `border-accent/40` on top row; `rounded-xl border-slate-800 bg-slate-900` rows
- **Live.tsx:** match card grid replacing raw JSON; dual API shape guard (`Array.isArray(data) || data?.matches`); dev-mode raw dump under `<details>`
- **index.css:** `:root { color-scheme: dark }` added; orphan pulse keyframe removed
- **TypeScript:** clean (zero errors after all changes)
- **Next session starts here (Day 4):**
  1. Fix `wc.teams` duplicate rows — add `DELETE FROM wc.teams WHERE squad_id > 1000` before fifa upsert, or clean up manually
  2. `py -m engine.wc_ingest --source apif --day 2` (fresh 100 req quota)
  3. `py -m engine.wc_run` — re-run model + optimizer with name override improvements
  4. Top up Anthropic credits to enable AI chat end-to-end testing

**Session 7 (2026-06-06) — UI redesign: FIFA WC 2026 branding + pitch layout + player profiles:**

- **Accent reverted to gold:** teal (`#00D8CB`) → FIFA trophy gold (`#C8A84C`) in `tailwind.config.ts`
- **New Tailwind tokens added:** `wc-navy: '#0C1D3E'`, `wc-red: '#DC2430'`, `pitch-green: '#2D7A4F'`
- **FIFA WC 2026 banner reworked** (`Layout.tsx`): 48px navy gradient strip (`bg-gradient-to-r from-wc-navy`), gold "FIFA World Cup 2026™" left, "USA · Canada · Mexico" right — no trademarked images, text treatment only
- **Pitch component shipped** (`web/src/components/shared/Pitch.tsx`):
  - SVG pitch surface with white line markings (centre circle, penalty areas, spots), `bg-pitch-green`
  - 4 formation rows: FWD (top) → MID → DEF → GK (bottom), 4-4-2 default
  - Bench strip below pitch: 4 muted cards (1GK + 1DEF + 1MID + 1FWD)
- **`PitchPlayerCard.tsx`** — compact card: surname / price / xP; `isBench` prop for muted styling; captain © badge
- **`web/src/utils/squad.ts`** — `getXI(players, projections, round)` utility: sorts each position group by xP, returns `{xi: SquadPlayer[], bench: SquadPlayer[]}`
- **Player profile modal shipped** (`web/src/components/shared/PlayerProfileModal.tsx`):
  - React portal, click outside or ✕ to close
  - 5 sections: header (team/name/position/price) → hero xP → 8-round xP chart → stats grid (P(Goal)/P(CS)/Variance/xMins)
  - Zero new API endpoints — data from existing projections cache
- **`RoundXpChart.tsx`** — 8-bar inline SVG: GROUP rounds in gold, R32→Final in red with increasing opacity
- **`usePlayerProjectionsAllRounds(element)`** hook added to `useWC.ts` — uses React Query `useQueries` for 8 parallel round fetches, deduped by cache
- **`Squad.tsx` fully reworked:**
  - Pitch view is PRIMARY (default), list view preserved as toggle
  - Toggle button: inline SVG pitch/list icons, `viewMode` state (local, not Zustand)
  - Both views open `PlayerProfileModal` on player click
- **TypeScript:** clean (zero errors)
- **Next session starts here (Day 4 — continue):**
  1. Login page design (plan convened this session — see plan file)
  2. Fix `wc.teams` duplicate rows — `DELETE FROM wc.teams WHERE squad_id > 1000` before fifa upsert
  3. `py -m engine.wc_ingest --source apif --day 2` (fresh 100 req quota)
  4. `py -m engine.wc_run` — re-run model + optimizer
  5. Top up Anthropic credits for AI chat end-to-end testing

**Session 8 (2026-06-06) — Onboarding flow + screenshot squad sync:**

- **OnboardingModal shipped** (`web/src/components/shared/OnboardingModal.tsx`):
  - React portal, shows on first visit via `localStorage['wc-onboarded']` flag
  - Two paths: "Build a new team" and "I already have a team"
  - **New team path:** closes modal → `/squad` loads pre-computed optimal squad (no change to existing flow)
  - **Existing team path:** drag-drop / click to upload a screenshot of their FIFA Fantasy squad
  - States: `idle → upload → processing → success | error`
  - Success: shows first 5 matched player names + count, "View my squad →" CTA
  - Error: "Try again" or "Use optimal squad" fallback
  - Mobile: renders as bottom sheet (`items-end` on small screens)
- **Screenshot processing** (`POST /api/squad/from-screenshot`):
  - Accepts `{ imageBase64: string, mimeType: string }` (base64 read client-side via `FileReader`)
  - JSON body limit raised to `10mb` (`express.json({ limit: '10mb' })`)
  - Calls `claude-haiku-4-5-20251001` Vision with tight JSON-only system prompt
  - Parses `{ players: string[] }` from model response (regex-extracts JSON block)
  - Each name matched against `wc.players` via `matchPlayersByName()` (ILIKE on `known_name` / `last_name` / `first_name`, LEFT JOIN teams + projections round 1 for xP)
  - Returns `{ matched: SquadPlayer[], unmatched: string[], total: number }`
  - Unmatched players silently dropped — caller fills remaining spots from optimal squad
- **`matchPlayersByName(name)`** added to `web/server/db.ts` — single ILIKE query, returns full `SquadPlayer`-shaped row with `team_abbr` and `xp`
- **`useSquadFromScreenshot()` mutation** added to `web/src/hooks/useWC.ts`
- **`squadFromScreenshot(imageBase64, mimeType)`** added to `web/src/services/wcApi.ts`
- **`appStore.ts`**: `wcOnboardingOpen: boolean` + `setWcOnboardingOpen(v)` — Squad page uses this to re-trigger the modal
- **`App.tsx`**: mounts `<OnboardingModal>` at root; `showOnboarding = firstVisit || wcOnboardingOpen`
- **`Squad.tsx`**: "Re-sync squad" button (bottom of page) sets `wcOnboardingOpen(true)` to reopen upload flow
- **TypeScript:** clean (zero errors)

**Session 9 (2026-06-08) — Day 5: Transfers page + Player profile modal redesign:**

- **Transfers page shipped** (`web/src/pages/Transfers.tsx`):
  - Sequential greedy algorithm — for each of N free transfers, finds the highest-gain swap (same position, fits budget), applies it to virtual squad, then finds the next best
  - Backend: `POST /api/transfers/suggest` wired with full greedy implementation in `server.ts` (was a stub)
  - UI: round selector, free transfers +/− stepper (1–6), "Analyze" button, single swap card at a time
  - Swap card: OUT (rose tint) → IN (emerald tint), xP gain badge, price delta badge
  - Accept updates squad store immediately; Skip moves to next card
  - Done state: summary of accepted swaps + total xP gained
  - `TransferCard` + `TransferSuggestion` + `TransferSuggestResponse` types added to `wc.ts`
  - `useTransferSuggest()` mutation added to `useWC.ts`

- **Player profile modal redesigned** (`web/src/components/shared/PlayerProfileModal.tsx`) — FIFA-parity:
  - **Blue gradient header** (`from-blue-700 to-blue-900`): player name, team abbr, position | price, MD selection %, jersey SVG placeholder with team abbr
  - **Overview / Fixtures tabs** with gold underline (`border-b-2 border-accent`) on active tab
  - **Overview tab**: Captain + Vice-Captain buttons (wired to store, highlighted when active) → 2×2 stats grid (next fixture opponent, % selected, xP Rd1, total xP) → existing xP bar chart
  - **Fixtures tab**: per-team fixture list from `GET /api/fixtures/:squadId`, grouped by round with date; graceful "Fixtures unavailable" fallback
  - **Bottom strip**: Sub Out (closes modal) + Transfer Out (navigates to `/transfers`)
  - Mobile: slides up as bottom sheet (`items-end` on small screens, rounded-t-2xl)

- **`GET /api/fixtures/:squadId`** added to `server.ts`:
  - Fetches FIFA `rounds.json` (via refactored `fifaFetch()` helper, 5 min TTL)
  - Parses `tournaments[]` per round — finds fixtures where `homeSquadId` or `awaySquadId` matches
  - Returns `Fixture[]` sorted by round; returns `[]` on proxy error (graceful)
  - `fifaProxy()` refactored to use `fifaFetch()` internally (no behavior change)

- **Vice-captain** added to `squadStore.ts`: `viceCaptain: number | null` + `setViceCaptain` action, persisted

- **`Fixture` type** added to `wc.ts`; `fixtures()` added to `wcApi.ts`; `useFixtures()` hook added to `useWC.ts`

- **TypeScript:** clean (zero errors)

**Pending Day 9 (deferred engine work):**
  1. Fix `wc.teams` duplicate rows — `DELETE FROM wc.teams WHERE squad_id > 1000` before fifa upsert
  2. `py -m engine.wc_ingest --source apif --day 2` (fresh 100 req quota — **do not skip, budget resets daily**)
  3. `py -m engine.wc_run` — re-run model + optimizer with name override + better apif data
  4. Top up Anthropic credits — required for `/api/chat` AND `/api/squad/from-screenshot` (both call Claude)
  5. Test screenshot flow end-to-end once credits are live

**Session 11 (2026-06-10) — Day 7: PRD gap fill + Live fallback + bug fixes:**

### PRD gaps filled

- **Captain page fully upgraded:**
  - **Variance column** (`±X.X`) — cross-references `useProjections(round)` by element ID, hidden on mobile (`hidden sm:block`)
  - **FDR badge** (1–5 colored pill) — new `GET /api/fdr?round=N` endpoint; quintiles of `lambda_posterior` from `wc.team_fdr` table; 1=green (easiest/most likely to score), 5=red; hidden on mobile; degrades to nothing if table empty
  - **Round deadline + countdown** — `useCountdown(start_date)` hook with `setInterval(60s)`; shows "Deadline: DD Mon · Xh Ym remaining" card top-right; gracefully omitted when `start_date` null
  - **"Set on FIFA Fantasy" footer** — pinned below list with external link to `play.fifa.com/fantasy/`

- **Transfers page upgraded:**
  - **−3 pts badge** — red pill badge on SwapCard header when `index >= freeTransfers`
  - **Undo last swap** — `prevSquads: SquadPlayer[][]` stack pushed before each Accept; `handleUndo()` pops snapshot, reverses squad store + `accepted` array + decrements index; "↩ Undo" in-progress when `canUndo`; "↩ Undo last" in DoneState
  - **Button layout** — SwapCard action row uses `grid` with `auto 1fr 1fr` (canUndo) or `1fr 1fr` (no undo) so Skip/Accept stay equal-width when Undo button is present

- **Assistant system prompt enriched** (`server.ts`):
  - Full scoring rules: Goal pts by position (GK=9, DEF=7, MID=6, FWD=5), CS, assists, appearance, saves, cards, scouting bonus
  - WC chip names: Wildcard, 12th Man, Max Captain, Qualification Booster, Mystery Booster
  - Country limit rules by round, budget rules (£100m group / £105m R32+)

- **Squad page upgraded:**
  - **Budget bar** — live progress bar `£X.Xm / £100m`, turns rose-500 when >95% used; live-computed total cost (not static)
  - **Country-count warnings** — compact amber strip showing `ABBR ×N` for any team with ≥3 players; hidden when no violations

- **New backend** (`server.ts`): `GET /api/fdr?round=N` — returns `{squad_id, fdr}[]`
- **New DB query** (`db.ts`): `getTeamFdr(round)`
- **New type** (`wc.ts`): `TeamFdr { squad_id: number; fdr: number }`
- **New hook** (`useWC.ts`): `useTeamFdr(round)` — 30min stale time
- **New API method** (`wcApi.ts`): `teamFdr(round)`

### Bug fixes (same session)

- **Live page fallback** (`server.ts` + `Live.tsx`): Community API `worldcup2026-api.vercel.app` returns 404 pre-tournament. Server now catches the error and falls back to parsing FIFA Fantasy `rounds.json` fixture schedule, returning `{ matches, stale: true, source: 'schedule' }`. `MatchCard` renders scheduled fixtures with kickoff date/time. Subtitle updates to "showing fixture schedule" in stale mode.

- **Logo trophy colour** (`Logo.tsx`): SVG stroke was hardcoded to old teal `#00D8CB` — missed in Session 7 accent revert. Fixed to WC gold `#C8A84C`.

- **Squad store corruption guard** (`squadStore.ts` + `Squad.tsx`):
  - `setSquad` now deduplicates by element before storing (prevents corrupt data entering store)
  - `Squad.tsx` useEffect detects corrupt localStorage squad (duplicate elements, wrong size, wrong position counts: not 2GK/5DEF/5MID/3FWD) and resets from DB suggested_squad
  - **Root cause:** stale Zustand localStorage from earlier sessions could persist invalid data since `squad.length > 0` skipped DB reload

- **TypeScript:** clean (zero errors) across all changes

**Session 10 (2026-06-08) — Day 6: Live polish + captain banner + squad swap drawer:**

- **Live page polished** (`web/src/pages/Live.tsx`):
  - Match cards redesigned: larger bold score (gold when live, white when FT, muted pre-match); status badge (pulsing green dot + minute for LIVE, FT, kickoff time for upcoming)
  - Auto-refresh indicator: "Updates every 60s · last updated HH:MM" (tracked via `useEffect` on `data`)
  - Captain banner: gold strip above match grid when squad has a captain and ≥1 match has started — "⚡ [Name] is your captain — consider a mid-match swap…" + "FIFA Fantasy →" external link (`play.fifa.com/fantasy/`)
  - Banner condition: `hasActiveMatches && captainName != null` (advisory, no squad guard)

- **PlayerProfileModal updated** (`web/src/components/shared/PlayerProfileModal.tsx`):
  - Added optional `onSubOut?: (player: SquadPlayer) => void` prop
  - Sub Out button calls `onSubOut(player)` when provided; falls back to `onClose()` otherwise

- **Squad swap drawer shipped** (`web/src/pages/Squad.tsx`):
  - `swapTarget: SquadPlayer | null` local state
  - `PlayerProfileModal` passes `onSubOut={(p) => { setSelectedPlayer(null); setSwapTarget(p) }}`
  - `SwapDrawer` — React portal bottom sheet: handle, header ("Swap out [Name]"), list of bench players of same position, tap to swap, tap backdrop to cancel
  - Swap updates squad store via `setSquad` immediately; uses existing `getXI()` utility to derive bench list
  - "No eligible [POS] on the bench" empty state when position not available

- **TypeScript:** clean (zero errors)

**Bug fix — onboarding modal never closed (Session 10):**
- **Root cause:** `App.tsx` used `const [firstVisit] = useState(() => !localStorage.getItem('wc-onboarded'))` — no setter, so `firstVisit` was permanently `true`. `onClose()` only called `setWcOnboardingOpen(false)` (already `false`, a no-op), leaving `showOnboarding = true || false` stuck. Modal never unmounted.
- **Fix:** replaced with `const [dismissed, setDismissed] = useState(() => !!localStorage.getItem('wc-onboarded'))`. `onClose` now calls `setDismissed(true)`. Logic: `showOnboarding = !dismissed || wcOnboardingOpen`.

---

## PRD Gap Analysis (reviewed Session 10, 2026-06-08)

Full PRD at `wc-edge-prd.md`. Gaps vs what is built, priority-ordered:

### High value / low effort (DONE Day 7)

**Captain page (`web/src/pages/Captain.tsx`):**
1. ✅ **Variance column** — `±X.X`, cross-references `useProjections(round)`, hidden on mobile
2. ✅ **FDR badge** — new `GET /api/fdr?round=N` + `useTeamFdr(round)` hook; 1=green, 5=red; hidden on mobile; degrades gracefully
3. ✅ **"Set on FIFA Fantasy" footer** — pinned below list with external link
4. ✅ **Round deadline + countdown** — `useCountdown(start_date)` with `setInterval(60s)`

**Transfers page (`web/src/pages/Transfers.tsx`):**
5. ✅ **−3 pts badge** — red pill on SwapCard header when `index >= freeTransfers`
6. ✅ **Undo last swap** — `prevSquads[]` stack; "↩ Undo" in-progress + in DoneState

**Assistant system prompt (`web/server/server.ts`):**
7. ✅ **WC chip names** — Wildcard, 12th Man, Max Captain, Qualification Booster, Mystery Booster
8. ✅ **Scoring rules** — full scoring table (goals by position, CS, assists, appearance, saves, cards, scouting bonus)

**Squad page:**
11. ✅ **Budget bar** — live `£X.Xm / £100m` progress bar, turns red >95%
12. ✅ **Country-count bar** — amber strip warning any team with ≥3 players

### Medium effort (Day 8)

**Transfers page:**
9. **ELIMINATED badge** — need `teams.is_active BOOLEAN DEFAULT TRUE`. Add column, expose via `GET /api/teams`. Badge is UI-only on swap card OUT player. Day 8.

**Swap drawer:**
13. **Full player list** — show ALL players of same position sorted by xP delta, not just bench. Requires fetching `/api/projections` + filtering by position. Day 8 stretch.

### Complex / data-dependent (stretch)
14. **Live: squad player filtering** — community API (`worldcup2026-api.vercel.app`) likely doesn't return per-player live points. Skip unless API supports it.
15. **Live: auto-sub pairings** — static display of bench order from squadStore. e.g. "Bench GK auto-subs if starter doesn't play". Simple static text, just needs bench state.
16. ✅ **Live: stale mode** — server returns `{ matches, stale: true, source: 'schedule'|'unavailable' }` when community API fails; falls back to FIFA Fantasy `rounds.json` fixture schedule. Done Day 7.

---

## Day-by-Day Build Schedule

| Day | Date | Deliverable | Status |
|---|---|---|---|
| 1 | Jun 4 | Repo scaffold + Phase 1 scrape (StatsBomb + API-Football Day 1) | ✅ Done |
| 2 | Jun 5 | Engine pipeline (model+optimizer) + full web scaffold (5 pages, Express, hooks) | ✅ Done |
| 3 | Jun 6 | Name-override review + Assistant page + UI quality pass (fpl-edge parity) | ✅ Done |
| 4 | Jun 7 | UI redesign (pitch layout, player profiles, WC banner) + onboarding flow (screenshot squad sync) | ✅ Done |
| 5 | Jun 8 | Fix teams DB bug + apif Day 2 + model rerun + Transfers greedy cards + Player profile modal redesign | ✅ Done (engine deferred to Day 9) |
| 6 | Jun 9 | Live page polish + captain banner + squad swap drawer + onboarding fix | ✅ Done |
| 7 | Jun 10 | PRD gap fill (Captain: variance/FDR/deadline/footer · Transfers: -3pts/undo · Assistant: chips/rules · Squad: budget bar/country count) | ✅ Done |
| 8 | Jun 11 | GitHub Actions engine.yml + Render deploy + ELIMINATED badge + final engine run + production smoke test | ← Start here |

---

## How to Start (Day 8 — next session)

### What is done — do not redo
```
Day 1–7 complete. All 5 pages built and polished. All PRD gaps filled.
DB: 1481 players, 8 rounds, 11848 projections, 384 team_fdr rows, 1 suggested_squad.
Vite dev server runs on :5174 (5173 in use by another process).
Express runs on :3001.
Squad composition is correct: 2GK/5DEF/5MID/3FWD (Ramírez + Osako as GKs — both correct).
```

### Day 8 priorities (in order)
1. **GitHub Actions `engine.yml`** — crons 04:00 + 18:00 UTC; triggers `py -m engine.wc_run`; post-group bonus run June 27. Use GitHub secrets `DATABASE_URL` and `API_FOOTBALL_KEY`.
2. **Render deploy** — `git push origin main`, confirm `https://wc-edge.onrender.com` loads correctly.
3. **Production smoke test** — all 5 pages, `/api/fdr`, `/api/live` (should show schedule), chat (needs Anthropic credits), screenshot upload.
4. **ELIMINATED badge** (medium effort) — add `is_active BOOLEAN DEFAULT TRUE` to `wc.teams`; `ALTER TABLE wc.teams ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;`; update `GET /api/teams` to include it; show "ELIMINATED" badge on Transfers swap card OUT player if their team is inactive.
5. **Final engine run** (if apif budget available): `py -m engine.wc_ingest --source apif --day 2` then `py -m engine.wc_run` to refresh projections with better club stats.

### Known deferred items (still outstanding)
- `wc.teams` may have 80 rows (32 duplicates with FIFA entity IDs > 1000). Check: `SELECT COUNT(*) FROM wc.teams`. Fix if needed: `DELETE FROM wc.teams WHERE squad_id > 1000;` then re-run `py -m engine.wc_ingest --source fifa`.
- Anthropic credits needed for `/api/chat` and `/api/squad/from-screenshot` (both call Claude Haiku).
- `apif_budget.json`: `day1_used: 80, day2_used: 0` — Day 2 run still available.

### Full pipeline from scratch (if needed)
```bash
cd engine
$env:PYTHONUTF8=1
py -m pip install -r requirements.txt
py -m engine.wc_ingest --source statsbomb   # 199 match files, ~2 min, free
py -m engine.wc_ingest --source fifa        # players + rounds + teams
py -m engine.wc_ingest --source apif --day N # N=1 or N=2
py -m engine.wc_run                          # model + optimizer
```

---

## How to Run (local dev)

```bash
# Frontend + API server
cd web
npm install       # first time only — already done
npm run dev       # starts Express :3001 + Vite :5173 concurrently
# requires web/.env with DATABASE_URL + ANTHROPIC_API_KEY (gitignored)

# Engine (Windows PowerShell)
cd engine
$env:PYTHONUTF8=1          # required on Windows for unicode chars in output
py -m engine.wc_run        # Phase 2+3: model + optimizer (uses engine/.env)
py -m engine.wc_ingest ... # Phase 1: scrape data sources
```

**env files (gitignored, never commit):**
- `engine/.env`: `DATABASE_URL=` + `API_FOOTBALL_KEY=`
- `web/.env`: `DATABASE_URL=` + `ANTHROPIC_API_KEY=`

---

## Architecture

```
engine/              Python backend
├── engine/
│   ├── wc_schema.sql    7 tables: players, teams, rounds, player_stats,
│   │                              projections, team_fdr, suggested_squad
│   ├── wc_ingest.py     Phase 1: FIFA Fantasy + StatsBomb + Sofascore + API-Football
│   ├── wc_model.py      Phase 2: Bayesian xG/xA + seed FDR + xP → projections + team_fdr
│   ├── wc_optimizer.py  Phase 3: HiGHS MILP → suggested_squad (2GK/5DEF/5MID/3FWD)
│   ├── wc_run.py        Orchestrator: py -m engine.wc_run [--phase model|optimizer|all]
│   ├── db.py            psycopg3 pool, search_path=wc,public
│   └── config.py        Constants: scoring, priors, API keys, league IDs
├── data/
│   ├── sb_cache.json         1441 StatsBomb players (keyed by normalized name)
│   ├── name_overrides.json   hard-coded name mappings for fuzzy-match failures
│   ├── unmatched_players.json  961 unmatched players — review on Day 3
│   └── apif_budget.json      {day1_used: 80, day2_used: 0}
└── requirements.txt   httpx, psycopg[binary], python-dotenv, rapidfuzz, highspy

web/                 React + Express (ALL FILES WRITTEN — TypeScript clean)
├── server/
│   ├── server.ts        12 routes: 3 FIFA proxies + 9 DB/AI routes — all wired to DB
│   └── db.ts            pg.Pool, search_path=wc,public, all query functions
├── src/
│   ├── types/wc.ts           Player, Team, Round, Projection, SquadPlayer, SuggestedSquad
│   ├── store/appStore.ts     sidebar collapse + mobile menu (Zustand + persist)
│   ├── store/squadStore.ts   squad[], captain, bench, budget (Zustand + persist)
│   ├── hooks/useWC.ts        React Query hooks for all 8 API routes
│   ├── services/wcApi.ts     fetch wrappers for all routes
│   ├── components/layout/
│   │   ├── Layout.tsx        flex wrapper (sidebar + topbar + main)
│   │   ├── Sidebar.tsx       5 nav items, WC gold accent, collapse/expand, mobile drawer
│   │   └── TopBar.tsx        mobile hamburger only
│   └── pages/
│       ├── Assistant.tsx     shell (AI chat — Day 3 feature)
│       ├── Squad.tsx         working: loads suggested_squad, renders by position, populates store
│       ├── Transfers.tsx     shell (Day 4 feature)
│       ├── Captain.tsx       working: 15-row ranked list, setCaptain
│       └── Live.tsx          working: community API proxy, 60s refetch, graceful degradation
├── package.json       React 18, Vite, TailwindCSS 3, @tanstack/react-query, zustand, highs, pg
├── tailwind.config.ts accent=#E8B84B (WC gold), brand slate palette
└── tsconfig.json

.github/workflows/
└── engine.yml     TODO Day 7: crons 04:00 + 18:00 UTC, post-group update June 27
```

**DB state (after Day 2):**
- `wc.players`: 1,481 rows (48 teams, positions correctly parsed)
- `wc.teams`: 48 rows (built from rounds.json fixtures, seed/group from squads_fifa)
- `wc.rounds`: 8 rows (GROUP×3, R32, R16, QF, SF, F)
- `wc.player_stats`: 571 rows
- `wc.projections`: 11,848 rows (1481 players × 8 rounds)
- `wc.team_fdr`: 384 rows
- `wc.suggested_squad`: 1 row (round 1, £98.9m, 77.6 xP — Mbappé/Salah/Ronaldo/Raphinha)

---

## Pages Summary

| Page | Route | Guard | Key feature |
|---|---|---|---|
| Assistant | / | none | Edge AI, two starter prompt sets (no-squad / squad-context) |
| Squad | /squad | none | Pre-filled MILP optimal squad, swap drawer, Re-optimize |
| Transfers | /transfers | RequireSquad | One-at-a-time sequential greedy swap cards |
| Captain | /captain | RequireSquad | 15-row ranked list, setCaptain, FDR badge |
| Live | /live | none (degrades) | Match cards, captain swap banner → FIFA Fantasy link |

---

## API Routes

| Route | Method | Notes |
|---|---|---|
| /wc/players.json | GET | FIFA Fantasy proxy, 5min TTL |
| /wc/rounds.json | GET | FIFA Fantasy proxy, 5min TTL |
| /wc/squads_fifa.json | GET | FIFA Fantasy proxy, 30min TTL |
| /api/rounds | GET | DB rounds table |
| /api/players | GET | All ~800 players |
| /api/teams | GET | Teams + isActive flag |
| /api/projections?round=N | GET | All players sorted by xP DESC |
| /api/squad/suggest | GET | Pre-computed from suggested_squad table |
| /api/squad/optimize | POST | Live HiGHS-WASM solve |
| /api/transfers/suggest | POST | Sequential greedy, body: {squad, round, freeTransfers} |
| /api/fdr?round=N | GET | FDR 1-5 per team, quintiles of team_fdr.lambda_posterior |
| /api/live?round=N | GET | Community API proxy (60s TTL); falls back to FIFA schedule on failure |
| /api/chat | POST | Edge AI, body: {messages, squad?} |

---

## Database Schema

5 tables from `wc-edge.md` §4 plus one addition:

```sql
-- player_stats, projections, team_fdr, players, teams (see wc-edge.md §4)

-- ADDITION: pre-computed squad suggestion
CREATE TABLE suggested_squad (
    id           SERIAL PRIMARY KEY,
    round        INTEGER NOT NULL,
    squad_json   JSONB NOT NULL,
    total_xp     REAL,
    total_cost   REAL,
    computed_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX ON suggested_squad (round);
```

---

## Deployment

**Render Blueprint (`render.yaml`):**
```yaml
databases:
  - name: wc-db
    databaseName: wc_edge
    plan: free

services:
  - type: web
    name: wc-edge
    env: node
    plan: free
    buildCommand: cd web && npm install && npm run build
    startCommand: node web/dist/server/server.js
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: wc-db
          property: connectionString
      - key: ANTHROPIC_API_KEY
        sync: false
```

**GitHub Actions secrets:**
- `DATABASE_URL` — Render external Postgres connection string
- `API_FOOTBALL_KEY` — API-Football key

**Trigger engine manually:**
```bash
gh workflow run engine.yml --repo ZaarkoEvilor791/wc-edge
```

---

## Key Decisions (from grilling session)

- **`highs` npm package stays** — Squad Builder uses HiGHS-WASM for Re-optimize. The original wc-edge.md note to remove it is wrong.
- **`chatApi.ts` is NOT verbatim reuse** — must pass `squad: number[]` alongside messages (no teamId equivalent).
- **API Football key is gitignored** — live in `engine/.env` and GitHub secret only. Never commit.
- **Squad is never empty on load** — always pre-filled from `suggested_squad` DB table.
- **Transfers is one-at-a-time** — single swap card, Accept/Skip flow, sequential greedy.
- **Captain is squad-only** — 15 rows, no global player list.
- **Live is always accessible** — no RequireSquad guard. Degrades gracefully with stale banner.
- **Captain swap is advisory** — banner links to play.fifa.com/fantasy/ directly, no in-app execution.
- **WC gold accent** — `#E8B84B` in tailwind.config.ts, replaces fpl-edge teal `#00D8CB`.

---

## Brand & Design

| Token | Hex | Role |
|---|---|---|
| `accent` | `#E8B84B` | WC gold — buttons, active states |
| `accent-fg` | `#060D18` | Text on gold backgrounds |
| `slate-950` | `#060D18` | Body background |
| `slate-900` | `#0A1321` | Main surface / sidebar |
| `slate-800` | `#0F1E31` | Cards / panels |
| `slate-700` | `#162B3F` | Hover / raised |
| `slate-600` | `#1E3550` | Borders |
| `slate-400` | `#6B8EA8` | Body text |
| `slate-100` | `#E0EEF8` | Primary text |

**No purple/violet.** Sidebar pattern identical to fpl-edge (collapsible, Zustand, inline SVG icons).

---

## Scoring Constants

```python
GOAL_PTS = {1: 9, 2: 7, 3: 6, 4: 5}   # GK/DEF/MID/FWD
CS_PTS   = {1: 5, 2: 5, 3: 1, 4: 0}
ASSIST_PTS = 3
APPEARANCE_FULL = 2   # >= 60 min
APPEARANCE_PART = 1   # < 60 min
SAVES_PER_PT = 3      # GK: +1 per 3 saves
YELLOW_CARD = -1
RED_CARD = -2
SCOUTING_BONUS = 2    # >= 4 pts + < 5% ownership
```

---

## WC Fantasy Rules Reference

| Rule | Detail |
|---|---|
| Squad | 15 players: 2 GK / 5 DEF / 5 MID / 3 FWD |
| Budget | $100m group stage → $105m from R32+ |
| Country limit | Max 3 same country (R32→4, R16→5, QF→6, SF/F→8) |
| Transfers | Group: 2 free/MD → R32: unlimited → R16/QF: 4 → SF: 5 → Final: 6 |
| Extra transfer | −3 pts each |
| Chips | Wildcard, 12th Man, Max Captain, Qualification Booster, Mystery Booster |
| Captain | 2× points; mid-match swap to unplayed player allowed |

---

## Gotchas

- **StatsBomb 199 files** — download with 0.5s delay, ~2 min total. No rate limit but be polite.
- **API-Football 100 req/day hard cap** — track carefully. Budget in `engine/data/apif_budget.json`.
- **Sofascore unofficial** — 403 blocked (Cloudflare). AFCON 2025 falls back to AFCON 2023 StatsBomb.
- **Community live API (worldcup2026-api.vercel.app)** — no SLA. Degraded mode is a primary design constraint, not an edge case.
- **suggested_squad table must be populated** before Squad page works — `py -m engine.wc_run` after any schema changes.
- **Day 3 manual step** — review unmatched_players.json, add overrides to name_overrides.json before Day 4 apif re-run. Cannot be automated.
- **FIFA Fantasy squadId (1-48) ≠ squads_fifa.json id (43817+)** — player.squadId is a sequential index into alphabetical team list. teams table is built from rounds.json fixtures, not squads_fifa.json. Seed/group enriched by team name match.
- **highspy MILP integrality** — must use `highspy.HighsVarType.kInteger` (not integer `1`). Model status check uses `h.getModelStatus()` (not LP `primal_solution_status` which returns 0 for MIP).
- **Python on Windows** — use `py` launcher, not `python`. Set `$env:PYTHONUTF8=1` in PowerShell for unicode output.
- **wc schema search_path** — Python: `options="-c search_path=wc,public"` in psycopg3. Node: append `?options=-c%20search_path%3Dwc%2Cpublic` to connectionString.
- **Elite product team** — always convene for design/architecture/sequencing decisions before coding. User has set this as global behavior.

## Day 3 Start Checklist

```
[ ] 1. Run: py -m engine.wc_ingest --report  (see top-30 unmatched by price)
[ ] 2. Review engine/data/unmatched_players.json, add entries to name_overrides.json
[ ] 3. Wire Express API routes: server/db.ts is complete, server/server.ts has all routes
[ ] 4. Build Assistant page: AI chat with starter prompts, squad context
[ ] 5. Test end-to-end: npm run dev → http://localhost:5173 → Squad page renders with squad
```
