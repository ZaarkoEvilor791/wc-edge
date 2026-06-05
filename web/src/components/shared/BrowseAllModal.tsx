import { useState, useMemo } from 'react'
import { usePlayers, useProjections, useTeams } from '../../hooks/useWC'
import type { SquadPlayer } from '../../types/wc'

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
  budget: number          // total budget (e.g. 100)
  onSwap: (inPlayer: SquadPlayer, outPlayer: SquadPlayer) => void
  onClose: () => void
}

export default function BrowseAllModal({ squad, round, budget, onSwap, onClose }: Props) {
  const { data: players } = usePlayers()
  const { data: projections } = useProjections(round)
  const { data: teams } = useTeams()

  const [posFilter, setPosFilter] = useState<Pos | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const [selectedIn, setSelectedIn] = useState<SquadPlayer | null>(null)

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

  // Build candidate pool: players not in squad, sorted xP DESC
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
      if (posFilter !== 'ALL' && p.position !== posFilter) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [candidates, posFilter, search])

  // Squad players of same position as selected IN player (available to sell)
  const outOptions = useMemo(() => {
    if (!selectedIn) return []
    return squad.filter((p) => p.position === selectedIn.position)
  }, [squad, selectedIn])

  function handleSelectIn(candidate: (typeof candidates)[number]) {
    setSelectedIn({
      element: candidate.element,
      name: candidate.name,
      position: candidate.position,
      price: candidate.price,
      xp: candidate.xp,
      team_abbr: candidate.team_abbr,
      squad_id: candidate.squad_id,
      low_sample: candidate.low_sample,
    })
  }

  function handleConfirmSwap(outPlayer: SquadPlayer) {
    if (!selectedIn) return
    // Budget check: squad_cost - outPlayer.price + selectedIn.price ≤ budget
    if (squadCost - outPlayer.price + selectedIn.price > budget + 0.001) return
    onSwap(selectedIn, outPlayer)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      <div className="relative z-10 w-full sm:max-w-lg bg-slate-900 rounded-t-2xl sm:rounded-2xl border border-slate-700 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-slate-100">Browse All Players</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* If IN player selected — show OUT picker */}
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
            {/* Search + position filter */}
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

            {/* Player list */}
            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <p className="p-4 text-center text-sm text-slate-500">No players found</p>
              ) : (
                filtered.slice(0, 100).map((p) => (
                  <button
                    key={p.element}
                    onClick={() => handleSelectIn(p)}
                    className="w-full flex items-center justify-between px-4 py-3 border-b border-slate-800/60 hover:bg-slate-800 text-left"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-100">
                        {p.name}
                        {!p.is_active && (
                          <span className="ml-2 rounded px-1.5 py-0.5 text-xs bg-slate-700 text-slate-400">
                            OUT
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400">
                        {p.team_abbr}{' '}
                        <span className={`font-semibold ${POS_COLOR[p.position]}`}>{p.position}</span>
                      </p>
                    </div>
                    <div className="ml-3 text-right shrink-0">
                      <p className="text-sm font-bold text-accent">{p.xp.toFixed(1)} xP</p>
                      <p className="text-xs text-slate-400">£{p.price.toFixed(1)}m</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
