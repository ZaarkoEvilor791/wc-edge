import { describe, it, expect } from 'vitest'
import { getXI, swapInSquad, fillSquadFromSuggested, optimiseXI } from '../utils/squad'
import type { SquadPlayer } from '../types/wc'

function p(element: number, position: SquadPlayer['position'], xp = 5): SquadPlayer {
  return { element, position, name: `P${element}`, price: 5, xp, team_abbr: 'TST', squad_id: 1, low_sample: false }
}

// A full valid suggested squad (2GK/5DEF/5MID/3FWD) with elements 101–115
const SUGGESTED: SquadPlayer[] = [
  p(101, 'GK', 8), p(102, 'GK', 6),
  p(103, 'DEF', 7), p(104, 'DEF', 6), p(105, 'DEF', 5), p(106, 'DEF', 4), p(107, 'DEF', 3),
  p(108, 'MID', 9), p(109, 'MID', 8), p(110, 'MID', 7), p(111, 'MID', 6), p(112, 'MID', 5),
  p(113, 'FWD', 10), p(114, 'FWD', 9), p(115, 'FWD', 8),
]

// Canonical ordered squad: 2 GK, 5 DEF, 5 MID, 3 FWD
// First GK = starter, second GK = bench
// First 4 DEF = starters, 5th DEF = bench
// First 4 MID = starters, 5th MID = bench
// All 3 FWD = starters
const SQUAD = [
  p(1, 'GK'), p(2, 'GK'),
  p(3, 'DEF'), p(4, 'DEF'), p(5, 'DEF'), p(6, 'DEF'), p(7, 'DEF'),
  p(8, 'MID'), p(9, 'MID'), p(10, 'MID'), p(11, 'MID'), p(12, 'MID'),
  p(13, 'FWD'), p(14, 'FWD'), p(15, 'FWD'),
]

describe('getXI', () => {
  it('puts first GK in XI, second on bench', () => {
    const { xi, bench } = getXI(SQUAD)
    expect(xi.filter((p) => p.position === 'GK').map((p) => p.element)).toEqual([1])
    expect(bench.filter((p) => p.position === 'GK').map((p) => p.element)).toEqual([2])
  })

  it('puts first 4 DEF in XI, 5th on bench', () => {
    const { xi, bench } = getXI(SQUAD)
    expect(xi.filter((p) => p.position === 'DEF').map((p) => p.element)).toEqual([3, 4, 5, 6])
    expect(bench.filter((p) => p.position === 'DEF').map((p) => p.element)).toEqual([7])
  })

  it('puts 2 FWD in XI, 1 on bench', () => {
    const { xi, bench } = getXI(SQUAD)
    expect(xi.filter((p) => p.position === 'FWD')).toHaveLength(2)
    expect(bench.filter((p) => p.position === 'FWD')).toHaveLength(1)
  })

  it('XI has 11 players, bench has 4', () => {
    const { xi, bench } = getXI(SQUAD)
    expect(xi).toHaveLength(11)
    expect(bench).toHaveLength(4)
  })
})

describe('swapInSquad', () => {
  it('swaps two players by element, preserving all others', () => {
    const result = swapInSquad(SQUAD, 1, 2)
    expect(result[0].element).toBe(2)
    expect(result[1].element).toBe(1)
    // All other elements unchanged
    for (let i = 2; i < SQUAD.length; i++) {
      expect(result[i].element).toBe(SQUAD[i].element)
    }
  })

  it('promotes bench GK to starter position when swapped', () => {
    const swapped = swapInSquad(SQUAD, 1, 2)  // GK starter ↔ bench GK
    const { xi: xiAfter } = getXI(swapped)
    expect(xiAfter.find((p) => p.position === 'GK')?.element).toBe(2)
  })

  it('returns original squad if element not found', () => {
    const result = swapInSquad(SQUAD, 1, 999)
    expect(result).toEqual(SQUAD)
  })

  it('does not mutate the original array', () => {
    const original = [...SQUAD]
    swapInSquad(SQUAD, 1, 2)
    expect(SQUAD[0].element).toBe(original[0].element)
  })

  it('swapping starter and bench DEF changes XI correctly', () => {
    // 7 is bench DEF, 3 is starter DEF
    const swapped = swapInSquad(SQUAD, 3, 7)
    const { xi, bench } = getXI(swapped)
    expect(bench.find((p) => p.element === 3)).toBeTruthy()
    expect(xi.find((p) => p.element === 7)).toBeTruthy()
  })
})

describe('optimiseXI', () => {
  it('returns all 15 players in reordered squad', () => {
    const { squad } = optimiseXI(SQUAD)
    expect(squad).toHaveLength(15)
    expect(squad.map(p => p.element).sort()).toEqual(SQUAD.map(p => p.element).sort())
  })

  it('picks the formation that maximises XI xP', () => {
    // Give FWDs very high xP so a 4-3-3 (3 FWDs) should beat 4-4-2 (2 FWDs)
    const highFwdSquad = [
      p(1, 'GK', 5), p(2, 'GK', 3),
      p(3, 'DEF', 4), p(4, 'DEF', 4), p(5, 'DEF', 4), p(6, 'DEF', 4), p(7, 'DEF', 4),
      p(8, 'MID', 3), p(9, 'MID', 3), p(10, 'MID', 3), p(11, 'MID', 3), p(12, 'MID', 3),
      p(13, 'FWD', 10), p(14, 'FWD', 10), p(15, 'FWD', 10),
    ]
    const { formation } = optimiseXI(highFwdSquad)
    // Should prefer 3 FWD formations (4-3-3 or 3-4-3)
    expect(formation.FWD).toBe(3)
  })

  it('starters appear before bench within each position in the returned squad', () => {
    const { squad, formation } = optimiseXI(SQUAD)
    const gks = squad.filter(p => p.position === 'GK')
    const defs = squad.filter(p => p.position === 'DEF')
    // First GK should be starter, second bench
    expect(gks[0].xp).toBeGreaterThanOrEqual(gks[1]?.xp ?? -Infinity)
    // First N DEFs should have xP >= rest
    const starterDEFs = defs.slice(0, formation.DEF)
    const benchDEFs = defs.slice(formation.DEF)
    if (benchDEFs.length > 0) {
      expect(Math.min(...starterDEFs.map(p => p.xp))).toBeGreaterThanOrEqual(Math.max(...benchDEFs.map(p => p.xp)))
    }
  })
})

const ALL_FORMATIONS = [
  { DEF: 4, MID: 4, FWD: 2 },
  { DEF: 4, MID: 3, FWD: 3 },
  { DEF: 3, MID: 5, FWD: 2 },
  { DEF: 3, MID: 4, FWD: 3 },
  { DEF: 5, MID: 3, FWD: 2 },
  { DEF: 5, MID: 4, FWD: 1 },
  { DEF: 4, MID: 5, FWD: 1 },
]

describe('getXI — formation-aware XI/bench split', () => {
  it.each(ALL_FORMATIONS)('formation $DEF-$MID-$FWD → XI=11, bench=4 with full squad', (f) => {
    const { xi, bench } = getXI(SQUAD, { GK: 1, ...f })
    expect(xi).toHaveLength(11)
    expect(bench).toHaveLength(4)
  })

  it('xi + bench always equals squad length (invariant)', () => {
    const { xi, bench } = getXI(SQUAD)
    expect(xi.length + bench.length).toBe(SQUAD.length)
  })

  it('xi + bench invariant holds for every formation', () => {
    for (const f of ALL_FORMATIONS) {
      const { xi, bench } = getXI(SQUAD, { GK: 1, ...f })
      expect(xi.length + bench.length).toBe(SQUAD.length)
    }
  })
})

// 13-player partial squad: 2GK/4DEF/4MID/3FWD (one DEF and one MID missing vs full)
const PARTIAL_13 = [
  p(1, 'GK'), p(2, 'GK'),
  p(3, 'DEF'), p(4, 'DEF'), p(5, 'DEF'), p(6, 'DEF'),
  p(8, 'MID'), p(9, 'MID'), p(10, 'MID'), p(11, 'MID'),
  p(13, 'FWD'), p(14, 'FWD'), p(15, 'FWD'),
]

describe('getXI — partial squad', () => {
  it('xi + bench = 13 for 13-player squad (no data loss)', () => {
    const { xi, bench } = getXI(PARTIAL_13, { GK: 1, DEF: 4, MID: 4, FWD: 2 })
    expect(xi.length + bench.length).toBe(13)
  })

  it('partial squad bench reflects available players beyond starters', () => {
    // PARTIAL_13: 2GK/4DEF/4MID/3FWD with 4-4-2 formation
    // GK: 1 starter, 1 bench. DEF: 4 starters, 0 bench (exactly used up). MID: same. FWD: 2 starters, 1 bench.
    const { bench } = getXI(PARTIAL_13, { GK: 1, DEF: 4, MID: 4, FWD: 2 })
    expect(bench.filter(p => p.position === 'GK')).toHaveLength(1)
    expect(bench.filter(p => p.position === 'DEF')).toHaveLength(0)
    expect(bench.filter(p => p.position === 'MID')).toHaveLength(0)
    expect(bench.filter(p => p.position === 'FWD')).toHaveLength(1)
    expect(bench).toHaveLength(2)
  })

  it('single player of a position goes to XI not bench', () => {
    // 14 players: 1 GK only
    const oneGkSquad = [
      p(1, 'GK'),
      p(3, 'DEF'), p(4, 'DEF'), p(5, 'DEF'), p(6, 'DEF'), p(7, 'DEF'),
      p(8, 'MID'), p(9, 'MID'), p(10, 'MID'), p(11, 'MID'), p(12, 'MID'),
      p(13, 'FWD'), p(14, 'FWD'), p(15, 'FWD'),
    ]
    const { xi } = getXI(oneGkSquad, { GK: 1, DEF: 4, MID: 4, FWD: 2 })
    expect(xi.filter(p => p.position === 'GK')).toHaveLength(1)
  })

  it('empty squad returns empty xi and bench', () => {
    const { xi, bench } = getXI([])
    expect(xi).toHaveLength(0)
    expect(bench).toHaveLength(0)
  })

  it('limits starters to available players when posCount exceeds squad size', () => {
    // Squad with only 4 DEF — posCount asks for 5 starters; clamp caps to 4
    const fourDefSquad = SQUAD.filter(p => !(p.position === 'DEF' && p.element === 7))
    const { xi } = getXI(fourDefSquad, { GK: 1, DEF: 5, MID: 4, FWD: 2 })
    expect(xi.filter(p => p.position === 'DEF')).toHaveLength(4)
  })
})

describe('optimiseXI — formation invariants', () => {
  it('returned formation always has DEF+MID+FWD === 10', () => {
    const { formation } = optimiseXI(SQUAD)
    expect(formation.DEF + formation.MID + formation.FWD).toBe(10)
  })

  it('DEF+MID+FWD=10 holds regardless of xP distribution', () => {
    const allMidSquad = [
      p(1, 'GK', 5), p(2, 'GK', 3),
      p(3, 'DEF', 1), p(4, 'DEF', 1), p(5, 'DEF', 1), p(6, 'DEF', 1), p(7, 'DEF', 1),
      p(8, 'MID', 10), p(9, 'MID', 10), p(10, 'MID', 10), p(11, 'MID', 10), p(12, 'MID', 10),
      p(13, 'FWD', 1), p(14, 'FWD', 1), p(15, 'FWD', 1),
    ]
    const { formation } = optimiseXI(allMidSquad)
    expect(formation.DEF + formation.MID + formation.FWD).toBe(10)
  })

  it('optimiseXI → getXI round-trip: always bench=4 for full squad', () => {
    const { squad: optimised, formation } = optimiseXI(SQUAD)
    const { xi, bench } = getXI(optimised, { GK: 1, ...formation })
    expect(xi).toHaveLength(11)
    expect(bench).toHaveLength(4)
  })

  it('skips formations requiring more DEF than available', () => {
    // 5 DEF available but squad has unusual xP distribution — still must pick valid formation
    const lowDefSquad = [
      p(1, 'GK', 5), p(2, 'GK', 3),
      p(3, 'DEF', 7), p(4, 'DEF', 6), p(5, 'DEF', 5), p(16, 'DEF', 4), p(17, 'DEF', 3),
      p(8, 'MID', 8), p(9, 'MID', 7), p(10, 'MID', 7), p(11, 'MID', 6), p(12, 'MID', 5),
      p(13, 'FWD', 1), p(14, 'FWD', 1), p(15, 'FWD', 1),
    ]
    const { formation } = optimiseXI(lowDefSquad)
    // FWD=1 preferred since FWD xP is low — any valid formation is acceptable
    expect(formation.DEF + formation.MID + formation.FWD).toBe(10)
    expect(formation.FWD).toBeGreaterThanOrEqual(1)
  })

  it('formation is always one of the 7 predefined formations', () => {
    const { formation } = optimiseXI(SQUAD)
    const match = ALL_FORMATIONS.some(
      f => f.DEF === formation.DEF && f.MID === formation.MID && f.FWD === formation.FWD
    )
    expect(match).toBe(true)
  })
})

describe('fillSquadFromSuggested', () => {
  it('returns 15 players when matched is empty', () => {
    const result = fillSquadFromSuggested([], SUGGESTED)
    expect(result).toHaveLength(15)
  })

  it('returns matched unchanged when all 15 are provided', () => {
    const result = fillSquadFromSuggested(SUGGESTED, [])
    expect(result).toHaveLength(15)
    expect(result.map((p) => p.element)).toEqual(expect.arrayContaining(SUGGESTED.map((p) => p.element)))
  })

  it('fills missing positions from suggested', () => {
    const partial = [p(1, 'GK'), p(2, 'GK'), p(3, 'DEF'), p(4, 'DEF'), p(5, 'DEF'), p(6, 'DEF'), p(7, 'DEF')]
    const result = fillSquadFromSuggested(partial, SUGGESTED)
    expect(result).toHaveLength(15)
    expect(result.filter((p) => p.position === 'MID')).toHaveLength(5)
    expect(result.filter((p) => p.position === 'FWD')).toHaveLength(3)
  })

  it('never introduces duplicate element IDs', () => {
    const partial = SUGGESTED.slice(0, 10)
    const result = fillSquadFromSuggested(partial, SUGGESTED)
    const ids = result.map((p) => p.element)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('correct position composition: 2GK 5DEF 5MID 3FWD', () => {
    const partial = [p(1, 'GK'), p(2, 'MID')]
    const result = fillSquadFromSuggested(partial, SUGGESTED)
    expect(result.filter((p) => p.position === 'GK')).toHaveLength(2)
    expect(result.filter((p) => p.position === 'DEF')).toHaveLength(5)
    expect(result.filter((p) => p.position === 'MID')).toHaveLength(5)
    expect(result.filter((p) => p.position === 'FWD')).toHaveLength(3)
  })

  it('fills from top-xP available in suggested', () => {
    const partial = [p(1, 'GK'), p(2, 'GK')]
    const result = fillSquadFromSuggested(partial, SUGGESTED)
    const mids = result.filter((p) => p.position === 'MID')
    // Should pick the 5 highest-xP mids from SUGGESTED (108–112)
    expect(mids.map((p) => p.element).sort()).toEqual([108, 109, 110, 111, 112])
  })
})
