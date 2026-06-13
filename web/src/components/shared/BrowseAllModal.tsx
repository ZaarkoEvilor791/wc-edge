import { useState, useMemo } from 'react'
import { usePlayers, useProjections, useTeams } from '../../hooks/useWC'
import type { SquadPlayer } from '../../types/wc'
import { canAddPlayer } from '../../domain/squadValidator'
import type { RoundPhase } from '../../domain/squadValidator'
import { playerStarRating } from '../../utils/squad'

const STAR_COLOR: Record<number, string> = {
  5: 'text-yellow-400',
  4: 'text-cyan-400',
  3: 'text-slate-400',
}

const POS_COLOR: Record<string, string> = {
  GK: 'text-yellow-400',
  DEF: 'text-blue-400',
  MID: 'text-green-400',
  FWD: 'text-red-400',
}
const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'] as const
type Pos = (typeof POSITIONS)[number]

interface Props {
  squad: SquadPlayer[]
  round: number
  budget: number
  phase?: RoundPhase        // current tournament phase; used for country-limit check in add mode
  onSwap: (inPlayer: SquadPlayer, outPlayer: SquadPlayer) => void
  onClose: () => void
  initialOut?: SquadPlayer  // when set: OUT→IN mode (position locked, skip squad picker)
  addPosition?: string       // when set: add mode (no outgoing player, just adds to squad)
  onAdd?: (p: SquadPlayer) => void
}

export default function BrowseAllModal({ squad, round, budget, phase = 'group', onSwap, onClose, initialOut, addPosition, onAdd }: Props) {
  const { data: players } = usePlayers()
  const { data: projections } = useProjections(round)
  const { data: teams } = useTeams()

  const isAddMode = !!addPosition
  const isOutFirstMode = !isAddMode && !!initialOut

  const [posFilter, setPosFilter] = useState<Pos | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const [selectedIn, setSelectedIn] = useState<SquadPlayer | null>(null)
  const [showEliminated, setShowEliminated] = useState(false)

  const squadCost = squad.reduce((s, p) => s + p.price, 0)
  const squadElements = new Set(squad.map((p) => p.element))

  const projMap = useMemo(
    () => new Map((projections ?? []).map((p) => [p.element, p.xp])),
    [projections],
  )
  const teamMap = useMemo(
    () => new Map((teams ?? []).map((t) => [t.squad_id, t])),
    [teams],
  )

  const candidates = useMemo(() => {
    if (!players) return []
    return players
      .filter((p) => !squadElements.has(p.element) && p.price != null)
      .map((p) => {
        const team = teamMap.get(p.squad_id ?? 0)
        return {
          element: p.element,
          name: p.name,
          position: p.position as Pos,
          price: p.price ?? 0,
          xp: projMap.get(p.element) ?? 0,
          team_abbr: team?.abbr ?? '?',
          squad_id: p.squad_id ?? 0,
          low_sample: false,
          is_active: team?.is_active ?? true,
        }
      })
      .sort((a, b) => b.xp - a.xp)
  }, [players, squadElements, projMap, teamMap])

  const filtered = useMemo(() => {
    return candidates.filter((p) => {
      if (!showEliminated && !p.is_active) return false
      if (isAddMode && p.position !== addPosition) return false
      if (isOutFirstMode && p.position !== initialOut!.position) return false
      if (!isAddMode && !isOutFirstMode && posFilter !== 'ALL' && p.position !== posFilter) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [candidates, posFilter, search, showEliminated, isAddMode, addPosition, isOutFirstMode, initialOut])

  const eliminatedHiddenCount = useMemo(() => {
    if (showEliminated) return 0
    return candidates.filter((p) => {
      if (p.is_active) return false
      if (isAddMode && p.position !== addPosition) return false
      if (isOutFirstMode && p.position !== initialOut!.position) return false
      if (!isAddMode && !isOutFirstMode && posFilter !== 'ALL' && p.position !== posFilter) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    }).length
  }, [candidates, posFilter, search, showEliminated, isAddMode, addPosition, isOutFirstMode, initialOut])

  // IN→OUT mode: squad players eligible to sell (same position as selected incoming player)
  const outOptions = useMemo(() => {
    if (!selectedIn) return []
    return squad.filter((p) => p.position === selectedIn.position)
  }, [squad, selectedIn])

  function handleCandidateTap(candidate: (typeof candidates)[number]) {
    if (isAddMode) {
      // Add mode: single validation gate covers position cap, budget, and country limit
      if (!canAddPlayer(squad, candidate, phase, squadCost, budget).allowed) return
      onAdd?.({ element: candidate.element, name: candidate.name, position: candidate.position,
        price: candidate.price, xp: candidate.xp, team_abbr: candidate.team_abbr,
        squad_id: candidate.squad_id, low_sample: candidate.low_sample })
      onClose()
    } else if (isOutFirstMode) {
      // OUT→IN: confirm immediately
      const newCost = squadCost - initialOut!.price + candidate.price
      if (newCost > budget + 0.001) return
      onSwap(
        { element: candidate.element, name: candidate.name, position: candidate.position,
          price: candidate.price, xp: candidate.xp, team_abbr: candidate.team_abbr,
          squad_id: candidate.squad_id, low_sample: candidate.low_sample },
        initialOut!,
      )
      onClose()
    } else {
      // IN→OUT: proceed to squad picker step
      setSelectedIn({
        element: candidate.element, name: candidate.name, position: candidate.position,
        price: candidate.price, xp: candidate.xp, team_abbr: candidate.team_abbr,
        squad_id: candidate.squad_id, low_sample: candidate.low_sample,
      })
    }
  }

  function handleConfirmSwap(outPlayer: SquadPlayer) {
    if (!selectedIn) return
    if (squadCost - outPlayer.price + selectedIn.price > budget + 0.001) return
    onSwap(selectedIn, outPlayer)
    onClose()
  }

  function handleBackdropClick() {
    if (selectedIn) return  // don't close mid-selection
    onClose()
  }

  const outRef = initialOut ?? null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={handleBackdropClick} />

      <div className="relative z-10 w-full sm:max-w-lg bg-slate-900 rounded-t-2xl sm:rounded-2xl border border-slate-700 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              {isAddMode ? `Add ${addPosition} player` : isOutFirstMode ? 'Pick replacement' : selectedIn ? 'Who do you want to sell?' : 'Browse All Players'}
            </h2>
            {(isAddMode || isOutFirstMode) && (
              <p className="text-xs text-slate-500 mt-0.5">
                {isAddMode ? `${addPosition} only` : `${initialOut!.position} replacements only`}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 text-xl leading-none">
            ×
          </button>
        </div>

        {/* Add mode: position-locked browse, no outgoing player */}
        {isAddMode && (
          <>
            <div className="px-3 pb-2 pt-3 border-b border-slate-800">
              <input
                type="text"
                placeholder={`Search ${addPosition} players…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <p className="p-4 text-center text-sm text-slate-500">No {addPosition} players found</p>
              ) : (
                filtered.slice(0, 100).map((p) => {
                  const isEliminated = !p.is_active
                  const addCheck = isEliminated
                    ? { allowed: false, reason: 'Not eligible' }
                    : canAddPlayer(squad, p, phase, squadCost, budget)
                  return (
                    <button
                      key={p.element}
                      onClick={() => handleCandidateTap(p)}
                      disabled={!addCheck.allowed}
                      className="w-full flex items-center justify-between px-4 py-3 border-b border-slate-800/60 hover:bg-slate-800 text-left disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-100">{p.name}</p>
                        <p className="text-xs text-slate-400">{p.team_abbr}</p>
                      </div>
                      <div className="ml-3 text-right shrink-0 space-y-0.5">
                        {(() => { const sr = playerStarRating(p.xp, false); return sr > 0 ? <p className={`text-[10px] font-bold ${STAR_COLOR[sr]}`}>{'★'.repeat(sr)}</p> : null })()}
                        <p className="text-sm font-bold text-accent">{p.xp.toFixed(1)} xP</p>
                        <p className="text-xs text-slate-400">£{p.price.toFixed(1)}m</p>
                        {!addCheck.allowed && (
                          <p className="text-[10px] text-rose-400">{addCheck.reason}</p>
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </>
        )}

        {/* OUT→IN mode: show outgoing player card + candidate browse */}
        {isOutFirstMode && (
          <>
            {/* OUT player card */}
            <div className="px-4 pt-3 pb-2">
              <div className="rounded-xl border border-rose-700/60 bg-rose-950/30 p-3">
                <p className="text-xs font-bold text-rose-400 mb-1">TRANSFERRING OUT</p>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-100">{outRef!.name}</p>
                    <p className="text-xs text-slate-400">
                      {outRef!.team_abbr}{' '}
                      <span className={`ml-1 font-semibold ${POS_COLOR[outRef!.position]}`}>
                        {outRef!.position}
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-accent">{outRef!.xp.toFixed(1)} xP</p>
                    <p className="text-xs text-slate-400">£{outRef!.price.toFixed(1)}m</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Search */}
            <div className="px-3 pb-2 border-b border-slate-800">
              <input
                type="text"
                placeholder={`Search ${outRef!.position} replacements…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* Candidate list — position locked */}
            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 && eliminatedHiddenCount === 0 ? (
                <p className="p-4 text-center text-sm text-slate-500">No replacements found</p>
              ) : (
                <>
                  {filtered.slice(0, 100).map((p) => {
                    const newCost = squadCost - outRef!.price + p.price
                    const overBudget = newCost > budget + 0.001
                    const isEliminated = !p.is_active
                    const xpDelta = p.xp - outRef!.xp
                    return (
                      <button
                        key={p.element}
                        onClick={() => handleCandidateTap(p)}
                        disabled={overBudget || isEliminated}
                        className="w-full flex items-center justify-between px-4 py-3 border-b border-slate-800/60 hover:bg-slate-800 text-left disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-100">{p.name}</p>
                          <p className="text-xs text-slate-400 flex items-center gap-1.5">
                            {p.team_abbr}
                            {isEliminated && (
                              <span className="rounded px-1 py-0.5 text-[10px] font-semibold uppercase bg-slate-700 text-slate-400">
                                Eliminated
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="ml-3 text-right shrink-0 space-y-0.5">
                          {(() => { const sr = playerStarRating(p.xp, false); return sr > 0 ? <p className={`text-[10px] font-bold ${STAR_COLOR[sr]}`}>{'★'.repeat(sr)}</p> : null })()}
                          <p className="text-sm font-bold text-accent">{p.xp.toFixed(1)} xP</p>
                          <p className="text-xs text-slate-400">£{p.price.toFixed(1)}m</p>
                          <p className={`text-xs font-semibold ${isEliminated ? 'text-slate-500' : overBudget ? 'text-rose-400' : xpDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isEliminated ? 'Not eligible' : overBudget ? 'Over budget' : `${xpDelta >= 0 ? '+' : ''}${xpDelta.toFixed(1)} xP`}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                  {eliminatedHiddenCount > 0 && (
                    <button
                      onClick={() => setShowEliminated(true)}
                      className="w-full py-3 text-xs text-slate-500 hover:text-slate-300 border-t border-slate-800/60"
                    >
                      Show {eliminatedHiddenCount} eliminated player{eliminatedHiddenCount > 1 ? 's' : ''} (not eligible for transfer in)
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* IN→OUT mode: existing flow (pick IN from browse list, then pick OUT from squad) */}
        {!isAddMode && !isOutFirstMode && (
          <>
            {selectedIn ? (
              <div className="flex flex-col p-4 gap-3 overflow-y-auto">
                <div className="rounded-xl border border-emerald-600/60 bg-emerald-950/30 p-3">
                  <p className="text-xs font-bold text-emerald-400 mb-1">BRINGING IN</p>
                  <p className="font-semibold text-slate-100">{selectedIn.name}</p>
                  <p className="text-xs text-slate-400">
                    {selectedIn.team_abbr}{' '}
                    <span className={`ml-1 font-semibold ${POS_COLOR[selectedIn.position]}`}>
                      {selectedIn.position}
                    </span>
                    {' · '}£{selectedIn.price.toFixed(1)}m
                    {' · '}{selectedIn.xp.toFixed(1)} xP
                  </p>
                </div>

                <p className="text-sm text-slate-400">Who do you want to sell?</p>

                {outOptions.map((out) => {
                  const newCost = squadCost - out.price + selectedIn.price
                  const overBudget = newCost > budget + 0.001
                  return (
                    <button
                      key={out.element}
                      onClick={() => handleConfirmSwap(out)}
                      disabled={overBudget}
                      className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-left hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <div>
                        <p className="font-medium text-slate-100">{out.name}</p>
                        <p className="text-xs text-slate-400">{out.team_abbr} · £{out.price.toFixed(1)}m · {out.xp.toFixed(1)} xP</p>
                      </div>
                      <div className="text-right text-xs">
                        {overBudget ? (
                          <span className="text-rose-400">Over budget</span>
                        ) : (
                          <span className={selectedIn.xp - out.xp >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {selectedIn.xp - out.xp >= 0 ? '+' : ''}{(selectedIn.xp - out.xp).toFixed(1)} xP
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}

                <button
                  onClick={() => setSelectedIn(null)}
                  className="mt-1 text-sm text-slate-400 hover:text-slate-200 underline"
                >
                  ← Back to player list
                </button>
              </div>
            ) : (
              <>
                <div className="p-3 border-b border-slate-800 space-y-2">
                  <input
                    type="text"
                    placeholder="Search player name…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <div className="flex gap-1.5">
                    {(['ALL', ...POSITIONS] as const).map((pos) => (
                      <button
                        key={pos}
                        onClick={() => setPosFilter(pos)}
                        className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                          posFilter === pos
                            ? 'bg-accent text-accent-fg'
                            : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {pos}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-y-auto flex-1">
                  {filtered.length === 0 && eliminatedHiddenCount === 0 ? (
                    <p className="p-4 text-center text-sm text-slate-500">No players found</p>
                  ) : (
                    <>
                      {filtered.slice(0, 100).map((p) => {
                        const isEliminated = !p.is_active
                        return (
                          <button
                            key={p.element}
                            onClick={() => handleCandidateTap(p)}
                            disabled={isEliminated}
                            className="w-full flex items-center justify-between px-4 py-3 border-b border-slate-800/60 hover:bg-slate-800 text-left disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-100">{p.name}</p>
                              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                                {p.team_abbr}{' '}
                                <span className={`font-semibold ${POS_COLOR[p.position]}`}>{p.position}</span>
                                {isEliminated && (
                                  <span className="rounded px-1 py-0.5 text-[10px] font-semibold uppercase bg-slate-700 text-slate-400">
                                    Eliminated
                                  </span>
                                )}
                              </p>
                            </div>
                            <div className="ml-3 text-right shrink-0 space-y-0.5">
                              {(() => { const sr = playerStarRating(p.xp, false); return sr > 0 ? <p className={`text-[10px] font-bold ${STAR_COLOR[sr]}`}>{'★'.repeat(sr)}</p> : null })()}
                              <p className="text-sm font-bold text-accent">{p.xp.toFixed(1)} xP</p>
                              <p className="text-xs text-slate-400">£{p.price.toFixed(1)}m</p>
                              {isEliminated && (
                                <p className="text-[10px] text-slate-500">Not eligible</p>
                              )}
                            </div>
                          </button>
                        )
                      })}
                      {eliminatedHiddenCount > 0 && (
                        <button
                          onClick={() => setShowEliminated(true)}
                          className="w-full py-3 text-xs text-slate-500 hover:text-slate-300 border-t border-slate-800/60"
                        >
                          Show {eliminatedHiddenCount} eliminated player{eliminatedHiddenCount > 1 ? 's' : ''} (not eligible for transfer in)
                        </button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
