import { describe, it, expect } from 'vitest'
import { getXI, swapInSquad } from '../utils/squad'
import type { SquadPlayer } from '../types/wc'

function p(element: number, position: SquadPlayer['position']): SquadPlayer {
  return { element, position, name: `P${element}`, price: 5, xp: 5, team_abbr: 'TST', squad_id: 1, low_sample: false }
}

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
    const { xi, bench } = getXI(SQUAD, [], 1)
    expect(xi.filter((p) => p.position === 'GK').map((p) => p.element)).toEqual([1])
    expect(bench.filter((p) => p.position === 'GK').map((p) => p.element)).toEqual([2])
  })

  it('puts first 4 DEF in XI, 5th on bench', () => {
    const { xi, bench } = getXI(SQUAD, [], 1)
    expect(xi.filter((p) => p.position === 'DEF').map((p) => p.element)).toEqual([3, 4, 5, 6])
    expect(bench.filter((p) => p.position === 'DEF').map((p) => p.element)).toEqual([7])
  })

  it('puts 2 FWD in XI, 1 on bench', () => {
    const { xi, bench } = getXI(SQUAD, [], 1)
    expect(xi.filter((p) => p.position === 'FWD')).toHaveLength(2)
    expect(bench.filter((p) => p.position === 'FWD')).toHaveLength(1)
  })

  it('XI has 11 players, bench has 4', () => {
    const { xi, bench } = getXI(SQUAD, [], 1)
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
    const { xi: xiAfter } = getXI(swapped, [], 1)
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
    const { xi, bench } = getXI(swapped, [], 1)
    expect(bench.find((p) => p.element === 3)).toBeTruthy()
    expect(xi.find((p) => p.element === 7)).toBeTruthy()
  })
})
