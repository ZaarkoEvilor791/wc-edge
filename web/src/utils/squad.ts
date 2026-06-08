import type { SquadPlayer } from '../types/wc'
import { POS_COUNT, POS_REQUIRED, POS_ORDER } from '../config/gameRules'

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
]

// Tries 7 formations and returns the squad reordered so the best XI (highest total xP) is first.
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
