import { describe, it, expect } from 'vitest'
import { suggestTransfers } from '../../server/services/transferAdvisor'
import type { TransferCard } from '../types/wc'

function card(overrides: Partial<TransferCard> & Pick<TransferCard, 'element' | 'position' | 'xp' | 'price'>): TransferCard {
  return {
    name: `Player ${overrides.element}`,
    team_abbr: 'TST',
    squad_id: 1,
    low_sample: false,
    ...overrides,
  }
}

const gk1 = card({ element: 1, position: 'GK', xp: 5, price: 5 })
const def1 = card({ element: 2, position: 'DEF', xp: 6, price: 6 })
const def2 = card({ element: 3, position: 'DEF', xp: 5, price: 5 })
const mid1 = card({ element: 4, position: 'MID', xp: 8, price: 8 })
const mid2 = card({ element: 5, position: 'MID', xp: 7, price: 7 })
const fwd1 = card({ element: 6, position: 'FWD', xp: 9, price: 9 })

// 6-player mini-squad for testing
const baseSquad = [gk1, def1, def2, mid1, mid2, fwd1]

describe('suggestTransfers', () => {
  it('returns one suggestion when one upgrade exists', () => {
    const betterFwd = card({ element: 99, position: 'FWD', xp: 12, price: 9 })
    const pool = [...baseSquad, betterFwd]

    const result = suggestTransfers(baseSquad, pool, 100)

    expect(result).toHaveLength(1)
    expect(result[0].out.element).toBe(6)   // fwd1 out (lowest xp among its class)
    expect(result[0].in.element).toBe(99)
    expect(result[0].xp_gain).toBeCloseTo(3)
  })

  it('returns empty array when squad is already optimal', () => {
    const pool = [...baseSquad]
    const result = suggestTransfers(baseSquad, pool, 100)
    expect(result).toHaveLength(0)
  })

  it('skips transfers that exceed budget', () => {
    const expensive = card({ element: 99, position: 'FWD', xp: 15, price: 20 })
    // squad cost = 5+6+5+8+7+9 = 40. budget = 45, expensive costs 40-9+20 = 51 > 45
    const result = suggestTransfers(baseSquad, [expensive, ...baseSquad], 45)
    expect(result).toHaveLength(0)
  })

  it('only matches same position', () => {
    const betterMidPretendingToBeGK = card({ element: 99, position: 'GK', xp: 15, price: 5 })
    const pool = [betterMidPretendingToBeGK, ...baseSquad]
    const result = suggestTransfers(baseSquad, pool, 100)
    // The only GK is element 1 (xp=5). betterMidPretendingToBeGK has GK position and xp=15 → should swap
    expect(result).toHaveLength(1)
    expect(result[0].out.element).toBe(1)
    expect(result[0].in.element).toBe(99)
  })

  it('caps at 6 suggestions', () => {
    // Pool has 10 upgrades, one per position slot
    const upgrades = [
      card({ element: 101, position: 'GK', xp: 20, price: 5 }),
      card({ element: 102, position: 'DEF', xp: 20, price: 6 }),
      card({ element: 103, position: 'DEF', xp: 19, price: 5 }),
      card({ element: 104, position: 'MID', xp: 20, price: 8 }),
      card({ element: 105, position: 'MID', xp: 19, price: 7 }),
      card({ element: 106, position: 'FWD', xp: 20, price: 9 }),
      card({ element: 107, position: 'FWD', xp: 18, price: 9 }),
    ]
    const pool = [...baseSquad, ...upgrades]
    const result = suggestTransfers(baseSquad, pool, 200)
    expect(result.length).toBeLessThanOrEqual(6)
  })

  it('does not suggest swapping a player with themselves', () => {
    const pool = [...baseSquad]
    const result = suggestTransfers(baseSquad, pool, 100)
    for (const t of result) {
      expect(t.out.element).not.toBe(t.in.element)
    }
  })

  it('eliminated player (xp=0) surfaces as best sell candidate', () => {
    // A player with xp=0 represents an eliminated nation — any non-zero xP replacement wins
    const eliminated = card({ element: 99, position: 'FWD', xp: 0, price: 9 })
    const replacement = card({ element: 100, position: 'FWD', xp: 7, price: 9 })
    const squadWithEliminated = [gk1, def1, def2, mid1, mid2, eliminated]
    const pool = [...squadWithEliminated, replacement]

    const result = suggestTransfers(squadWithEliminated, pool, 100)

    expect(result.length).toBeGreaterThan(0)
    expect(result[0].out.element).toBe(99)
    expect(result[0].in.element).toBe(100)
    expect(result[0].xp_gain).toBeCloseTo(7)
  })

  it('returns 400-equivalent empty result when no valid in-budget replacements', () => {
    const tooExpensive = card({ element: 99, position: 'FWD', xp: 15, price: 50 })
    // squad cost = 40, budget = 40. 40 - 9 + 50 = 81 > 40
    const result = suggestTransfers(baseSquad, [tooExpensive, ...baseSquad], 40)
    expect(result).toHaveLength(0)
  })

  it('tracks cost correctly across sequential swaps', () => {
    const upgrade1 = card({ element: 201, position: 'MID', xp: 10, price: 10 })
    const upgrade2 = card({ element: 202, position: 'MID', xp: 9, price: 8 })
    // squad cost = 40, budget = 43. After swap mid1(8)→upgrade1(10): cost=42 ≤ 43.
    // upgrade2 for mid2(7→9): cost=42-7+8=43 ≤ 43. Both fit.
    const pool = [...baseSquad, upgrade1, upgrade2]
    const result = suggestTransfers(baseSquad, pool, 43)
    expect(result.length).toBeGreaterThanOrEqual(2)
  })
})
