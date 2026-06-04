import type { SquadPlayer, Projection } from '../types/wc'

const POS_COUNT: Record<string, number> = { GK: 1, DEF: 4, MID: 4, FWD: 2 }

export function getXI(
  players: SquadPlayer[],
  projections: Projection[],
  round: number,
): { xi: SquadPlayer[]; bench: SquadPlayer[] } {
  const xpMap = new Map<number, number>()
  for (const p of projections) {
    if (p.round === round) xpMap.set(p.element, p.xp)
  }

  const byPos: Record<string, SquadPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] }
  for (const p of players) {
    byPos[p.position]?.push(p)
  }

  const xi: SquadPlayer[] = []
  const bench: SquadPlayer[] = []

  for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as const) {
    const sorted = [...(byPos[pos] ?? [])].sort(
      (a, b) => (xpMap.get(b.element) ?? b.xp) - (xpMap.get(a.element) ?? a.xp),
    )
    const n = POS_COUNT[pos] ?? 1
    xi.push(...sorted.slice(0, n))
    bench.push(...sorted.slice(n))
  }

  return { xi, bench }
}
