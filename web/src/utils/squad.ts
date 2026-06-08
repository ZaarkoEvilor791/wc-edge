import type { SquadPlayer, Projection } from '../types/wc'

const POS_COUNT: Record<string, number> = { GK: 1, DEF: 4, MID: 4, FWD: 2 }
const POS_REQUIRED: Record<string, number> = { GK: 2, DEF: 5, MID: 5, FWD: 3 }
const POS_ORDER = ['GK', 'DEF', 'MID', 'FWD']

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

// Uses array order to determine XI vs bench — first POS_COUNT[pos] of each position = starters.
// Callers must ensure the array is ordered correctly (pre-sort by xP on initial DB load;
// handleSwap exchanges positions so manual swaps persist across renders).
export function getXI(
  players: SquadPlayer[],
  _projections: Projection[],
  _round: number,
): { xi: SquadPlayer[]; bench: SquadPlayer[] } {
  const xi: SquadPlayer[] = []
  const bench: SquadPlayer[] = []
  const posCount: Record<string, number> = {}

  for (const p of players) {
    const seen = posCount[p.position] ?? 0
    if (seen < (POS_COUNT[p.position] ?? 1)) {
      xi.push(p)
    } else {
      bench.push(p)
    }
    posCount[p.position] = seen + 1
  }

  return { xi, bench }
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
