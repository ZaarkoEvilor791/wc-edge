import type { SquadPlayer } from '../types/wc'
import { POS_COUNT, POS_REQUIRED, POS_ORDER } from '../config/gameRules'

// Sorts players into canonical squad order: position group (GK→DEF→MID→FWD), then xP DESC within each group.
// Required by getXI(). Call this when loading a new squad from DB, screenshot, or onboarding —
// NOT after manual swaps (swapInSquad preserves the user's XI/bench intent without resorting).
export function normalizeSquad(players: SquadPlayer[]): SquadPlayer[] {
  return [...players].sort((a, b) => {
    const posOrder = POS_ORDER.indexOf(a.position) - POS_ORDER.indexOf(b.position)
    return posOrder !== 0 ? posOrder : b.xp - a.xp
  })
}

// Fills a partial screenshot match up to 15 players using top-xP picks from the
// suggested squad, preserving position composition (2GK/5DEF/5MID/3FWD).
export function fillSquadFromSuggested(matched: SquadPlayer[], suggested: SquadPlayer[]): SquadPlayer[] {
  const matchedIds = new Set(matched.map((p) => p.element))
  const matchedCount: Record<string, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
  for (const p of matched) matchedCount[p.position] = (matchedCount[p.position] ?? 0) + 1

  const pool: Record<string, SquadPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] }
  for (const p of suggested) {
    if (!matchedIds.has(p.element) && pool[p.position]) pool[p.position].push(p)
  }
  for (const pos of POS_ORDER) pool[pos].sort((a, b) => b.xp - a.xp)

  const fillers: SquadPlayer[] = []
  for (const pos of POS_ORDER) {
    const needed = Math.max(0, (POS_REQUIRED[pos] ?? 0) - (matchedCount[pos] ?? 0))
    fillers.push(...pool[pos].slice(0, needed))
  }

  const combined = [...matched, ...fillers]
  combined.sort((a, b) => {
    const diff = POS_ORDER.indexOf(a.position) - POS_ORDER.indexOf(b.position)
    return diff !== 0 ? diff : b.xp - a.xp
  })
  return combined
}

// Uses array order to determine XI vs bench — first posCount[pos] (default POS_COUNT) starters.
// Callers must ensure the array is ordered correctly (pre-sort by xP on initial DB load;
// handleSwap exchanges positions so manual swaps persist across renders).
// For non-GK positions: clamps starters to (available - 1) so a bench slot is always
// reserved when 2+ players of that position exist. Handles corrupt/partial-squad posCount safely.
export function getXI(
  players: SquadPlayer[],
  posCount?: Record<string, number>,
): { xi: SquadPlayer[]; bench: SquadPlayer[] } {
  const xi: SquadPlayer[] = []
  const bench: SquadPlayer[] = []
  const seen: Record<string, number> = {}
  const base = posCount ?? POS_COUNT

  const available: Record<string, number> = {}
  for (const p of players) available[p.position] = (available[p.position] ?? 0) + 1

  const limits: Record<string, number> = {}
  for (const [pos, count] of Object.entries(base)) {
    const avail = available[pos] ?? 0
    // Clamp starters to available players so partial squads never request more
    // starters than exist. The store sanitizer guards against corrupt posCount sums.
    limits[pos] = pos === 'GK' ? count : Math.min(count, avail)
  }

  for (const p of players) {
    const n = seen[p.position] ?? 0
    if (n < (limits[p.position] ?? 1)) {
      xi.push(p)
    } else {
      bench.push(p)
    }
    seen[p.position] = n + 1
  }

  return { xi, bench }
}

const FORMATIONS: Array<{ DEF: number; MID: number; FWD: number }> = [
  { DEF: 4, MID: 4, FWD: 2 },
  { DEF: 4, MID: 3, FWD: 3 },
  { DEF: 3, MID: 5, FWD: 2 },
  { DEF: 3, MID: 4, FWD: 3 },
  { DEF: 5, MID: 3, FWD: 2 },
  { DEF: 5, MID: 4, FWD: 1 },
  { DEF: 4, MID: 5, FWD: 1 },
  { DEF: 5, MID: 2, FWD: 3 },
]

// Tries 8 formations and returns the squad reordered so the best XI (highest total xP) is first.
// Starters come before bench within each position group, both sorted xP DESC.
export function optimiseXI(players: SquadPlayer[]): {
  squad: SquadPlayer[]
  formation: { DEF: number; MID: number; FWD: number }
} {
  const byPos: Record<string, SquadPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] }
  for (const p of players) byPos[p.position]?.push(p)
  for (const pos of POS_ORDER) byPos[pos].sort((a, b) => b.xp - a.xp)

  let bestXP = -Infinity
  let bestFormation = FORMATIONS[0]

  for (const f of FORMATIONS) {
    if (f.DEF > byPos.DEF.length || f.MID > byPos.MID.length || f.FWD > byPos.FWD.length) continue
    const xp =
      byPos.GK.slice(0, 1).reduce((s, p) => s + p.xp, 0) +
      byPos.DEF.slice(0, f.DEF).reduce((s, p) => s + p.xp, 0) +
      byPos.MID.slice(0, f.MID).reduce((s, p) => s + p.xp, 0) +
      byPos.FWD.slice(0, f.FWD).reduce((s, p) => s + p.xp, 0)
    if (xp > bestXP) {
      bestXP = xp
      bestFormation = f
    }
  }

  const counts: Record<string, number> = { GK: 1, DEF: bestFormation.DEF, MID: bestFormation.MID, FWD: bestFormation.FWD }
  const reordered: SquadPlayer[] = []
  for (const pos of POS_ORDER) {
    const group = byPos[pos]
    const n = counts[pos] ?? 1
    reordered.push(...group.slice(0, n), ...group.slice(n))
  }

  return { squad: reordered, formation: bestFormation }
}

// Returns eligible swap targets for `source` given the current XI/bench split.
// GK can only swap with another GK. Outfield swaps must keep DEF≥3, MID≥2, FWD≥1.
// Callers keep this in an IIFE after early-return guards to avoid Rules of Hooks.
export function getEligibleSwapTargets(
  xi: SquadPlayer[],
  bench: SquadPlayer[],
  source: SquadPlayer,
): Set<number> {
  if (source.position === 'GK') {
    return new Set(
      [...xi, ...bench]
        .filter(p => p.position === 'GK' && p.element !== source.element)
        .map(p => p.element),
    )
  }
  const currentDEF = xi.filter(p => p.position === 'DEF').length
  const currentMID = xi.filter(p => p.position === 'MID').length
  const currentFWD = xi.filter(p => p.position === 'FWD').length
  const sourceIsXI = xi.some(p => p.element === source.element)
  const candidates = sourceIsXI ? bench : xi
  const result: number[] = []
  for (const p of candidates) {
    if (p.position === 'GK' || p.element === source.element) continue
    const out = sourceIsXI ? source : p
    const into = sourceIsXI ? p : source
    const newDEF = currentDEF - (out.position === 'DEF' ? 1 : 0) + (into.position === 'DEF' ? 1 : 0)
    const newMID = currentMID - (out.position === 'MID' ? 1 : 0) + (into.position === 'MID' ? 1 : 0)
    const newFWD = currentFWD - (out.position === 'FWD' ? 1 : 0) + (into.position === 'FWD' ? 1 : 0)
    if (newDEF >= 3 && newMID >= 2 && newFWD >= 1) result.push(p.element)
  }
  return new Set(result)
}

// Returns 0 (no badge), 3, 4, or 5 based on xP tier for a player.
// low_sample players are capped at 3★ — their xP is unreliable.
export function playerStarRating(xp: number, lowSample: boolean): 0 | 3 | 4 | 5 {
  if (lowSample) return xp >= 5.0 ? 3 : 0
  if (xp >= 6.0) return 5
  if (xp >= 4.5) return 4
  if (xp >= 3.0) return 3
  return 0
}

// Swap two players by element ID, preserving array order for all other players.
// This is the only safe way to mutate squad order — direct array manipulation
// would break getXI's array-order invariant for non-swapped positions.
export function swapInSquad(squad: SquadPlayer[], aEl: number, bEl: number): SquadPlayer[] {
  const a = squad.find((p) => p.element === aEl)
  const b = squad.find((p) => p.element === bEl)
  if (!a || !b) return squad
  return squad.map((p) => {
    if (p.element === aEl) return b
    if (p.element === bEl) return a
    return p
  })
}
