import { useState } from 'react'
import clsx from 'clsx'
import { useQueries } from '@tanstack/react-query'
import { wcApi } from '../services/wcApi'
import { useSquadStore } from '../store/squadStore'
import type { BoosterState } from '../store/squadStore'
import { useCurrentRound, useTeams, usePlayers } from '../hooks/useWC'
import { getXI } from '../utils/squad'
import { TOTAL_ROUNDS } from '../config/gameRules'
import type { Projection, Player, SquadPlayer } from '../types/wc'

// ─── Recommendation types ────────────────────────────────────────────────────

type ChipRec = { bestRound: number | null; reason: string }

// ─── Per-chip recommendation logic (pure, client-side) ───────────────────────

function recMaxCaptain(
  xi: SquadPlayer[],
  allProj: Map<number, Projection[]>,
  currentRoundId: number,
): ChipRec {
  let best: { round: number; xp: number; name: string } | null = null
  for (const [round, projs] of allProj) {
    if (round < currentRoundId) continue
    for (const p of xi) {
      const proj = projs.find((pr) => pr.element === p.element)
      const xp = proj?.xp ?? p.xp
      if (!best || xp > best.xp) best = { round, xp, name: p.name }
    }
  }
  if (!best) return { bestRound: null, reason: 'No projection data available yet.' }
  return {
    bestRound: best.round,
    reason: `${best.name} projects ${best.xp.toFixed(1)} xP (est.) — your highest captain pick this tournament.`,
  }
}

function rec12thMan(
  squad: SquadPlayer[],
  allPlayers: Player[],
  allProj: Map<number, Projection[]>,
  eliminatedSquadIds: Set<number>,
  currentRoundId: number,
  budget: number,
): ChipRec {
  const squadElements = new Set(squad.map((p) => p.element))
  let best: { round: number; xp: number; player: Player } | null = null
  for (const [round, projs] of allProj) {
    if (round < currentRoundId) continue
    for (const proj of projs) {
      if (squadElements.has(proj.element)) continue
      const player = allPlayers.find((p) => p.element === proj.element)
      if (!player) continue
      if (player.squad_id === null) continue
      if (eliminatedSquadIds.has(player.squad_id)) continue
      if ((player.price ?? 0) > budget + 0.001) continue
      if (!best || proj.xp > best.xp) best = { round, xp: proj.xp, player }
    }
  }
  if (!best) return { bestRound: null, reason: 'No non-squad player data available yet.' }
  const price = best.player.price?.toFixed(1) ?? '?'
  return {
    bestRound: best.round,
    reason: `${best.player.name} (£${price}m) projects ${best.xp.toFixed(1)} xP (est.) and isn't in your squad.`,
  }
}

function recQualBooster(
  xi: SquadPlayer[],
  eliminatedSquadIds: Set<number>,
  currentRoundId: number,
): ChipRec {
  // R32+ = round id > 3 (group stage is rounds 1-3)
  const r32StartId = 4
  let best: { round: number; count: number } | null = null
  for (let round = Math.max(currentRoundId, r32StartId); round <= TOTAL_ROUNDS; round++) {
    const activeCount = xi.filter((p) => !eliminatedSquadIds.has(p.squad_id)).length
    if (!best || activeCount > best.count) best = { round, count: activeCount }
  }
  if (!best) return { bestRound: null, reason: 'Available from Round of 32 onwards.' }
  return {
    bestRound: best.round,
    reason: `${best.count} of your ${xi.length} starters' teams are still active this round.`,
  }
}

function recCSShield(
  xi: SquadPlayer[],
  allFdr: Map<number, { squad_id: number; fdr: number }[]>,
  currentRoundId: number,
): ChipRec {
  const r32StartId = 4
  let best: { round: number; count: number; maxFdr: number } | null = null
  for (let round = Math.max(currentRoundId, r32StartId); round <= TOTAL_ROUNDS; round++) {
    const fdr = allFdr.get(round) ?? []
    const fdrMap = new Map(fdr.map((f) => [f.squad_id, f.fdr]))
    const defenders = xi.filter((p) => p.position === 'GK' || p.position === 'DEF')
    const toughCount = defenders.filter((p) => (fdrMap.get(p.squad_id) ?? 3) >= 4).length
    const maxFdr = defenders.reduce((m, p) => Math.max(m, fdrMap.get(p.squad_id) ?? 3), 0)
    if (!best || toughCount > best.count) best = { round, count: toughCount, maxFdr }
  }
  if (!best) return { bestRound: null, reason: 'Available from Round of 32 onwards.' }
  if (best.count === 0) return {
    bestRound: best.round,
    reason: 'Your defence faces manageable fixtures throughout — less urgent.',
  }
  return {
    bestRound: best.round,
    reason: `${best.count} of your GK/DEF face tough fixtures (FDR ${best.maxFdr}) — CS points most at risk.`,
  }
}

function recWildcard(
  squad: SquadPlayer[],
  eliminatedSquadIds: Set<number>,
  currentRoundId: number,
): ChipRec {
  const eliminatedCount = squad.filter((p) => eliminatedSquadIds.has(p.squad_id)).length
  if (eliminatedCount >= 2) {
    return {
      bestRound: currentRoundId,
      reason: `You have ${eliminatedCount} eliminated players — consider rebuilding now.`,
    }
  }
  if (eliminatedCount === 1) {
    return {
      bestRound: null,
      reason: '1 eliminated player. Monitor before committing — group stage ends soon.',
    }
  }
  return {
    bestRound: null,
    reason: 'Your squad looks healthy. Hold for the post-group elimination wave.',
  }
}

// ─── Booster definitions ──────────────────────────────────────────────────────

type BoosterDef = {
  id: string
  name: string
  effect: string
  availability: string
  availableFrom: 'any' | 'r32'
  tip: string
}

const BOOSTERS: BoosterDef[] = [
  {
    id: 'wildcard',
    name: 'Wildcard',
    effect: 'Unlimited free transfers this round — no hit.',
    availability: 'Group stage (not Round 1 or R32)',
    availableFrom: 'any',
    tip: 'Best used after a wave of group-stage eliminations to rebuild around advancing squads.',
  },
  {
    id: 'max_captain',
    name: 'Maximum Captain',
    effect: 'Whichever player in your XI scores the most points automatically earns 2× that round.',
    availability: 'Any round',
    availableFrom: 'any',
    tip: 'Play when you have a strong XI but no clear captain pick, or when multiple star players face easy fixtures.',
  },
  {
    id: '12th_man',
    name: '12th Man',
    effect: 'Add one player outside your squad who scores points this round. They cannot be captained, subbed, or transferred.',
    availability: 'Any round',
    availableFrom: 'any',
    tip: 'Target a premium striker or attacker for a key knockout fixture — treat it as a free differential.',
  },
  {
    id: 'qual_booster',
    name: 'Qualification Booster',
    effect: '+2 points to any one starting player whose team advances to the next round (or wins the final).',
    availability: 'Round of 32 onwards',
    availableFrom: 'r32',
    tip: 'Activate in the Round of 32 when most of your starting players are from teams heavily favoured to advance.',
  },
  {
    id: 'cs_shield',
    name: 'Clean Sheet Shield',
    effect: 'Your GK, DEF, and MID only lose clean sheet points after conceding 2 goals instead of 1.',
    availability: 'Round of 32 onwards (to be confirmed)',
    availableFrom: 'r32',
    tip: 'Save for a week when your defence faces tough fixtures but you expect them to limit chances.',
  },
]

const ROUND_LABEL: Record<number, string> = {
  1: 'Round 1', 2: 'Round 2', 3: 'Round 3',
  4: 'Round of 32', 5: 'Round of 16', 6: 'Quarter-final', 7: 'Semi-final', 8: 'Final',
}

const STATE_LABEL: Record<BoosterState, string> = {
  available: 'Available',
  active: 'Active this round',
  used: 'Used',
}

const STATE_STYLE: Record<BoosterState, string> = {
  available: 'bg-slate-800 text-slate-400',
  active: 'bg-accent/15 text-accent',
  used: 'bg-emerald-500/15 text-emerald-400',
}

// ─── Recommendation block component ──────────────────────────────────────────

function RecBlock({ rec, loading }: { rec: ChipRec | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="mt-3 h-12 animate-pulse rounded-lg bg-slate-800/60" />
    )
  }
  if (!rec) return null
  return (
    <div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
      <div className="flex items-center gap-1.5 mb-0.5">
        <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3 text-accent shrink-0" aria-hidden>
          <path d="M8 1l1.5 4.5H14l-3.7 2.7 1.4 4.3L8 9.7l-3.7 2.8 1.4-4.3L2 5.5h4.5z" />
        </svg>
        <span className="text-xs font-semibold text-accent">
          {rec.bestRound ? `Best round: ${ROUND_LABEL[rec.bestRound] ?? `Round ${rec.bestRound}`}` : 'Timing advice'}
        </span>
      </div>
      <p className="text-xs text-slate-300 leading-snug">{rec.reason}</p>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Boosters() {
  const { squad, formationCounts, boosterStates, setBoosterState, budget } = useSquadStore()
  const currentRound = useCurrentRound()
  const currentRoundId = currentRound?.id ?? 1
  const isR32Plus = currentRoundId > 3

  const { data: teams } = useTeams()
  const { data: allPlayers } = usePlayers()

  // Fetch all 8 rounds of projections via useQueries (React Query deduplicates)
  const projQueries = useQueries({
    queries: Array.from({ length: TOTAL_ROUNDS }, (_, i) => i + 1).map((round) => ({
      queryKey: ['projections', round],
      queryFn: () => wcApi.projections(round),
      staleTime: 5 * 60_000,
    })),
  })
  const projLoading = projQueries.some((q) => q.isLoading)

  // Also fetch FDR for all rounds (needed for CS Shield)
  const fdrQueries = useQueries({
    queries: Array.from({ length: TOTAL_ROUNDS }, (_, i) => i + 1).map((round) => ({
      queryKey: ['teamFdr', round],
      queryFn: () => wcApi.teamFdr(round),
      staleTime: 30 * 60_000,
    })),
  })

  // Build lookup maps
  const allProj = new Map<number, Projection[]>(
    projQueries.map((q, i) => [i + 1, q.data ?? []])
  )
  const allFdr = new Map<number, { squad_id: number; fdr: number }[]>(
    fdrQueries.map((q, i) => [i + 1, q.data ?? []])
  )

  const eliminatedSquadIds = new Set(
    (teams ?? []).filter((t) => !t.is_active).map((t) => t.squad_id)
  )

  const { xi } = getXI(squad, { GK: 1, ...formationCounts })

  // Compute recommendations (all pure functions)
  const hasSquad = squad.length > 0
  const recs: Record<string, ChipRec | null> = hasSquad && !projLoading ? {
    wildcard: recWildcard(squad, eliminatedSquadIds, currentRoundId),
    max_captain: recMaxCaptain(xi, allProj, currentRoundId),
    '12th_man': allPlayers ? rec12thMan(squad, allPlayers, allProj, eliminatedSquadIds, currentRoundId, budget) : null,
    qual_booster: isR32Plus ? recQualBooster(xi, eliminatedSquadIds, currentRoundId) : null,
    cs_shield: isR32Plus ? recCSShield(xi, allFdr, currentRoundId) : null,
  } : {}

  const [expandedTips, setExpandedTips] = useState<Set<string>>(new Set())
  const toggleTip = (id: string) => setExpandedTips((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100">Boosters</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {hasSquad ? 'Personalised timing advice based on your squad' : 'Plan when to play your chips for maximum impact'}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {BOOSTERS.map((b) => {
          const state = boosterStates[b.id] ?? 'available'
          const locked = b.availableFrom === 'r32' && !isR32Plus
          const rec = recs[b.id] ?? null
          const tipExpanded = expandedTips.has(b.id)

          return (
            <div
              key={b.id}
              className={clsx(
                'rounded-xl border bg-surface p-4',
                state === 'active' ? 'border-accent/40' : 'border-slate-800',
                locked && 'opacity-60',
              )}
            >
              {/* Header: name + badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-100">{b.name}</span>
                <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium', STATE_STYLE[state])}>
                  {STATE_LABEL[state]}
                </span>
                {b.availableFrom === 'r32' && (
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                    R32+ only
                  </span>
                )}
              </div>

              {/* Personalised recommendation — leads if available */}
              {hasSquad && !locked && (
                <RecBlock rec={rec} loading={projLoading} />
              )}

              {/* Effect */}
              <p className="mt-3 text-sm text-slate-300">{b.effect}</p>

              {/* Strategy tip — collapsible */}
              <div className="mt-2">
                <button
                  onClick={() => toggleTip(b.id)}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <svg
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className={clsx('h-2.5 w-2.5 transition-transform', tipExpanded ? 'rotate-180' : 'rotate-0')}
                  >
                    <path d="M2 3.5l3 3 3-3" />
                  </svg>
                  Strategy tip
                </button>
                {tipExpanded && (
                  <p className="mt-1.5 text-xs text-slate-400 leading-relaxed pl-4">{b.tip}</p>
                )}
              </div>

              {/* Actions */}
              {!locked && (
                <div className="mt-3 flex items-center gap-2">
                  {state === 'available' && (
                    <button
                      onClick={() => setBoosterState(b.id, 'active')}
                      className="rounded-lg bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20 transition-colors"
                    >
                      Activate for this round
                    </button>
                  )}
                  {state === 'active' && (
                    <>
                      <button
                        onClick={() => setBoosterState(b.id, 'used')}
                        className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                      >
                        Mark as used
                      </button>
                      <button
                        onClick={() => setBoosterState(b.id, 'available')}
                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        Deactivate
                      </button>
                    </>
                  )}
                  {state === 'used' && (
                    <button
                      onClick={() => setBoosterState(b.id, 'available')}
                      className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      Undo
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
