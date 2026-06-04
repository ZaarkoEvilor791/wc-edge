import type { SquadPlayer, Projection } from '../types/wc'

const POS_COUNT: Record<string, number> = { GK: 1, DEF: 4, MID: 4, FWD: 2 }

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
