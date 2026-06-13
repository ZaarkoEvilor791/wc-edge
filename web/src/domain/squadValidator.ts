import type { SquadPlayer } from '../types/wc'
import { POS_REQUIRED } from '../config/gameRules'

export interface AddCheck {
  allowed: boolean
  reason?: string
}

export type RoundPhase = 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'final'

export const COUNTRY_LIMIT: Record<RoundPhase, number> = {
  group: 3, r32: 3, r16: 4, qf: 5, sf: 6, final: 8,
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  countryViolations: string[]  // team abbrs over the phase limit
}

// Maps a round's stage string (from DB rounds.stage) to a RoundPhase.
export function roundPhase(stage: string): RoundPhase {
  const s = stage.toLowerCase()
  if (s.includes('semi')) return 'sf'
  if (s.includes('quarter')) return 'qf'
  if (s.includes('16') || s.includes('r16')) return 'r16'
  if (s.includes('32') || s.includes('r32')) return 'r32'
  if (s.includes('final')) return 'final'
  return 'group'
}

export function validateSquad(squad: SquadPlayer[], phase: RoundPhase): ValidationResult {
  const errors: string[] = []
  const countryViolations: string[] = []

  if (squad.length !== 15) {
    errors.push(`Squad must have 15 players (has ${squad.length})`)
  }

  const posCounts: Record<string, number> = {}
  for (const p of squad) posCounts[p.position] = (posCounts[p.position] ?? 0) + 1
  for (const [pos, required] of Object.entries(POS_REQUIRED)) {
    const actual = posCounts[pos] ?? 0
    if (actual !== required) errors.push(`${pos}: need ${required}, have ${actual}`)
  }

  const seen = new Set<number>()
  for (const p of squad) {
    if (seen.has(p.element)) errors.push(`Duplicate player: ${p.name}`)
    seen.add(p.element)
  }

  const limit = COUNTRY_LIMIT[phase]
  const countryCounts: Record<string, number> = {}
  for (const p of squad) countryCounts[p.team_abbr] = (countryCounts[p.team_abbr] ?? 0) + 1
  for (const [abbr, count] of Object.entries(countryCounts)) {
    if (count > limit) countryViolations.push(abbr)
  }

  return {
    valid: errors.length === 0 && countryViolations.length === 0,
    errors,
    countryViolations,
  }
}

// Single validation gate for adding a player to the squad.
// Checks position cap, budget, and country limit in one place.
// squadCost = sum of current squad prices (caller computes once).
export function canAddPlayer(
  squad: SquadPlayer[],
  candidate: { position: string; price: number; team_abbr: string },
  phase: RoundPhase,
  squadCost: number,
  budget: number,
): AddCheck {
  const posCounts: Record<string, number> = {}
  for (const p of squad) posCounts[p.position] = (posCounts[p.position] ?? 0) + 1
  if ((posCounts[candidate.position] ?? 0) >= (POS_REQUIRED[candidate.position] ?? 99)) {
    return { allowed: false, reason: 'Position full' }
  }
  if (squadCost + candidate.price > budget + 0.001) {
    return { allowed: false, reason: 'Over budget' }
  }
  const limit = COUNTRY_LIMIT[phase]
  const countryCounts: Record<string, number> = {}
  for (const p of squad) countryCounts[p.team_abbr] = (countryCounts[p.team_abbr] ?? 0) + 1
  if ((countryCounts[candidate.team_abbr] ?? 0) >= limit) {
    return { allowed: false, reason: `Country limit (${limit})` }
  }
  return { allowed: true }
}
