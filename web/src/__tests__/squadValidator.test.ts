import { describe, it, expect } from 'vitest'
import { validateSquad, roundPhase, COUNTRY_LIMIT } from '../domain/squadValidator'
import type { SquadPlayer } from '../types/wc'

function player(overrides: Partial<SquadPlayer> & Pick<SquadPlayer, 'element' | 'position' | 'team_abbr'>): SquadPlayer {
  return {
    name: `Player ${overrides.element}`,
    price: 5,
    xp: 5,
    squad_id: 1,
    low_sample: false,
    ...overrides,
  }
}

function makeSquad(overrides: Array<Partial<SquadPlayer> & Pick<SquadPlayer, 'element' | 'position' | 'team_abbr'>>): SquadPlayer[] {
  return overrides.map(player)
}

// Valid 15-player squad: 2 GK, 5 DEF, 5 MID, 3 FWD, all different teams
const VALID_SQUAD = makeSquad([
  { element: 1, position: 'GK', team_abbr: 'ENG' },
  { element: 2, position: 'GK', team_abbr: 'FRA' },
  { element: 3, position: 'DEF', team_abbr: 'GER' },
  { element: 4, position: 'DEF', team_abbr: 'ESP' },
  { element: 5, position: 'DEF', team_abbr: 'BRA' },
  { element: 6, position: 'DEF', team_abbr: 'ARG' },
  { element: 7, position: 'DEF', team_abbr: 'POR' },
  { element: 8, position: 'MID', team_abbr: 'NED' },
  { element: 9, position: 'MID', team_abbr: 'BEL' },
  { element: 10, position: 'MID', team_abbr: 'ENG' },
  { element: 11, position: 'MID', team_abbr: 'FRA' },
  { element: 12, position: 'MID', team_abbr: 'GER' },
  { element: 13, position: 'FWD', team_abbr: 'ESP' },
  { element: 14, position: 'FWD', team_abbr: 'BRA' },
  { element: 15, position: 'FWD', team_abbr: 'ARG' },
])

describe('validateSquad', () => {
  it('accepts a valid squad', () => {
    const result = validateSquad(VALID_SQUAD, 'group')
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.countryViolations).toHaveLength(0)
  })

  it('rejects squads with wrong size', () => {
    const result = validateSquad(VALID_SQUAD.slice(0, 14), 'group')
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('15'))).toBe(true)
  })

  it('rejects squads with wrong position counts', () => {
    const wrong = [...VALID_SQUAD]
    wrong[0] = player({ element: 99, position: 'FWD', team_abbr: 'TST' })  // replace a GK with FWD
    const result = validateSquad(wrong, 'group')
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('GK'))).toBe(true)
  })

  it('rejects squads with duplicate elements', () => {
    const duped = [...VALID_SQUAD]
    duped[14] = player({ element: 1, position: 'FWD', team_abbr: 'TST' })  // element 1 appears twice
    const result = validateSquad(duped, 'group')
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('Duplicate'))).toBe(true)
  })

  describe('country limits per round phase', () => {
    // Builds a valid 15-player squad with exactly n players from 'ENG'.
    // Positions: 2 GK, 5 DEF, 5 MID, 3 FWD. All elements unique.
    function squadWithNFromTeam(n: number): SquadPlayer[] {
      const positions: SquadPlayer['position'][] = [
        'GK', 'GK',
        'DEF', 'DEF', 'DEF', 'DEF', 'DEF',
        'MID', 'MID', 'MID', 'MID', 'MID',
        'FWD', 'FWD', 'FWD',
      ]
      return positions.map((pos, i) => player({
        element: i + 1,
        position: pos,
        team_abbr: i < n ? 'ENG' : `T${i}`,
      }))
    }

    it('group: 3 allowed, 4 is violation', () => {
      expect(validateSquad(squadWithNFromTeam(3), 'group').countryViolations).toHaveLength(0)
      expect(validateSquad(squadWithNFromTeam(4), 'group').countryViolations).toContain('ENG')
    })

    it('r32: 3 allowed, 4 is violation (same as group)', () => {
      expect(validateSquad(squadWithNFromTeam(3), 'r32').countryViolations).toHaveLength(0)
      expect(validateSquad(squadWithNFromTeam(4), 'r32').countryViolations).toContain('ENG')
    })

    it('r16: 4 allowed, 5 is violation', () => {
      expect(validateSquad(squadWithNFromTeam(4), 'r16').countryViolations).toHaveLength(0)
      expect(validateSquad(squadWithNFromTeam(5), 'r16').countryViolations).toContain('ENG')
    })

    it('qf: 5 allowed, 6 is violation', () => {
      expect(validateSquad(squadWithNFromTeam(5), 'qf').countryViolations).toHaveLength(0)
      expect(validateSquad(squadWithNFromTeam(6), 'qf').countryViolations).toContain('ENG')
    })

    it('sf: 6 allowed, 7 is violation; final: 8 allowed', () => {
      expect(validateSquad(squadWithNFromTeam(6), 'sf').countryViolations).toHaveLength(0)
      expect(validateSquad(squadWithNFromTeam(7), 'sf').countryViolations).toContain('ENG')
      expect(validateSquad(squadWithNFromTeam(8), 'final').countryViolations).toHaveLength(0)
    })
  })
})

describe('roundPhase', () => {
  it('maps group stage strings', () => {
    expect(roundPhase('Group Stage')).toBe('group')
    expect(roundPhase('Matchday 1')).toBe('group')
    expect(roundPhase('')).toBe('group')
  })

  it('maps round of 32', () => {
    expect(roundPhase('Round of 32')).toBe('r32')
    expect(roundPhase('R32')).toBe('r32')
  })

  it('maps round of 16', () => {
    expect(roundPhase('Round of 16')).toBe('r16')
    expect(roundPhase('R16')).toBe('r16')
  })

  it('maps quarter-final', () => {
    expect(roundPhase('Quarter-final')).toBe('qf')
    expect(roundPhase('Quarter Final')).toBe('qf')
  })

  it('maps semi-final before final to avoid false positive', () => {
    expect(roundPhase('Semi-final')).toBe('sf')
    expect(roundPhase('Semi Final')).toBe('sf')
  })

  it('maps final (not semi)', () => {
    expect(roundPhase('Final')).toBe('final')
    expect(roundPhase('3rd Place Final')).toBe('final')
  })
})

describe('COUNTRY_LIMIT', () => {
  it('has correct limits for all phases', () => {
    expect(COUNTRY_LIMIT.group).toBe(3)
    expect(COUNTRY_LIMIT.r32).toBe(3)   // R32 same as group (confirmed via official rules)
    expect(COUNTRY_LIMIT.r16).toBe(4)
    expect(COUNTRY_LIMIT.qf).toBe(5)
    expect(COUNTRY_LIMIT.sf).toBe(6)
    expect(COUNTRY_LIMIT.final).toBe(8)
  })
})
