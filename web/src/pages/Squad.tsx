import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { useSuggestedSquad, useProjections, useCurrentRound, useTeams } from '../hooks/useWC'
import { useSquadStore } from '../store/squadStore'
import { useAppStore } from '../store/appStore'
import type { SquadPlayer } from '../types/wc'
import { getXI, swapInSquad } from '../utils/squad'
import { roundPhase, COUNTRY_LIMIT } from '../domain/squadValidator'
import { POS_ORDER } from '../config/gameRules'
import Spinner from '../components/shared/Spinner'
import StatCard from '../components/shared/StatCard'
import Pitch from '../components/shared/Pitch'
import PlayerProfileModal from '../components/shared/PlayerProfileModal'

function PlayerCard({ player, isCaptain, onClick }: { player: SquadPlayer; isCaptain: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors hover:bg-slate-800',
        isCaptain ? 'border-accent/60 bg-accent/10' : 'border-slate-800 bg-slate-900',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="w-8 text-center text-xs font-bold text-slate-500">{player.position}</span>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-slate-100">{player.name}</span>
            {isCaptain && <span className="rounded bg-accent px-1 text-[10px] font-bold text-accent-fg">C</span>}
            {player.low_sample && <span className="rounded bg-slate-700 px-1 text-[10px] text-slate-400">?</span>}
          </div>
          <span className="text-xs text-slate-500">{player.team_abbr}</span>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold text-accent">{player.xp.toFixed(1)} xP</div>
        <div className="text-xs text-slate-500">£{player.price.toFixed(1)}m</div>
      </div>
    </button>
  )
}

function PitchIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
      className={active ? 'text-accent' : 'text-slate-500'}>
      <rect x="1" y="1" width="14" height="14" rx="1" />
      <line x1="1" y1="8" x2="15" y2="8" />
      <ellipse cx="8" cy="8" rx="3" ry="3" />
    </svg>
  )
}

function ListIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
      className={active ? 'text-accent' : 'text-slate-500'}>
      <line x1="3" y1="4" x2="13" y2="4" />
      <line x1="3" y1="8" x2="13" y2="8" />
      <line x1="3" y1="12" x2="13" y2="12" />
    </svg>
  )
}

function SwapDrawer({
  target,
  options,
  subIn,
  onSwap,
  onCancel,
}: {
  target: SquadPlayer
  options: SquadPlayer[]
  subIn: boolean
  onSwap: (replacement: SquadPlayer) => void
  onCancel: () => void
}) {
  const eligible = options.filter((p) => p.position === target.position && p.element !== target.element)

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative flex max-h-[70vh] w-full max-w-sm flex-col rounded-t-2xl border-t border-slate-700 bg-slate-900 px-4 pb-6 pt-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-700" />

        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-100">
              {subIn ? 'Sub in' : 'Swap out'} <span className="text-accent">{target.name}</span>
            </p>
            <p className="text-xs text-slate-500">
              {subIn ? 'Select a starter to move to bench' : 'Select a bench player to bring in'}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-slate-100"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 1l10 10M11 1L1 11" />
            </svg>
          </button>
        </div>

        {eligible.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">
            No eligible {target.position} {subIn ? 'starters' : 'on the bench'}
          </p>
        ) : (
          <div className="flex-1 space-y-2 overflow-y-auto">
            {eligible.map((p) => (
              <button
                key={p.element}
                onClick={() => onSwap(p)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-left transition-colors hover:border-accent/50 hover:bg-slate-700"
              >
                <div>
                  <p className="text-sm font-medium text-slate-100">{p.name}</p>
                  <p className="text-xs text-slate-500">{p.team_abbr} · {p.position}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-accent">{p.xp.toFixed(1)} xP</p>
                  <p className="text-xs text-slate-500">£{p.price.toFixed(1)}m</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default function Squad() {
  const { data, isLoading, error } = useSuggestedSquad()
  const { squad, captain, setSquad, setCaptain } = useSquadStore()
  const setWcOnboardingOpen = useAppStore((s) => s.setWcOnboardingOpen)
  const currentRound = useCurrentRound()
  const round = currentRound?.id ?? 1
  const { data: projections } = useProjections(round)
  const { data: teams } = useTeams()

  const [viewMode, setViewMode] = useState<'pitch' | 'list'>('pitch')
  const [selectedPlayer, setSelectedPlayer] = useState<SquadPlayer | null>(null)
  const [swapTarget, setSwapTarget] = useState<SquadPlayer | null>(null)

  useEffect(() => {
    if (!data?.squad_json) return
    const isCorrupt = squad.length > 0 && (
      new Set(squad.map(p => p.element)).size !== squad.length ||
      squad.length !== 15 ||
      squad.filter(p => p.position === 'GK').length !== 2 ||
      squad.filter(p => p.position === 'DEF').length !== 5 ||
      squad.filter(p => p.position === 'MID').length !== 5 ||
      squad.filter(p => p.position === 'FWD').length !== 3
    )
    if (squad.length === 0 || isCorrupt) {
      // Pre-sort by xP within each position so array order = starter order for getXI
      const byPos: Record<string, SquadPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] }
      for (const p of data.squad_json) byPos[p.position]?.push(p)
      const sorted = ['GK', 'DEF', 'MID', 'FWD'].flatMap(
        (pos) => [...(byPos[pos] ?? [])].sort((a, b) => b.xp - a.xp)
      )
      setSquad(sorted)
      const topPlayer = sorted[0] ? [...sorted].sort((a, b) => b.xp - a.xp)[0] : null
      if (topPlayer) setCaptain(topPlayer.element)
    }
  }, [data, squad.length, squad, setSquad, setCaptain])

  if (isLoading) return <Spinner label="Loading squad…" />

  if (error || !data) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center">
        <p className="text-slate-400">Squad is being computed. Check back soon.</p>
      </div>
    )
  }

  const displaySquad = squad.length > 0 ? squad : data.squad_json
  const activeCaptain = captain ?? [...displaySquad].sort((a, b) => b.xp - a.xp)[0]?.element
  const { xi, bench } = getXI(displaySquad)
  const selectedIsBench = bench.some((p) => p.element === selectedPlayer?.element)
  const swapTargetIsBench = bench.some((p) => p.element === swapTarget?.element)

  const totalCost = displaySquad.reduce((s, p) => s + p.price, 0)
  const budgetPct = Math.min(100, (totalCost / 100) * 100)

  const eliminatedSquadIds = new Set(
    (teams ?? []).filter(t => !t.is_active).map(t => t.squad_id)
  )

  const countByTeam: Record<string, number> = {}
  displaySquad.forEach((p) => { countByTeam[p.team_abbr] = (countByTeam[p.team_abbr] ?? 0) + 1 })
  const phase = roundPhase(currentRound?.stage ?? '')
  const overLimit = Object.entries(countByTeam).filter(([, n]) => n > COUNTRY_LIMIT[phase])

  function handleSwap(replacement: SquadPlayer) {
    if (!swapTarget) return
    setSquad(swapInSquad(displaySquad, swapTarget.element, replacement.element))
    setSwapTarget(null)
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">My Squad</h1>
        <div className="flex items-center gap-1 rounded-lg border border-slate-700 p-0.5">
          <button
            onClick={() => setViewMode('pitch')}
            className={clsx('rounded p-1.5 transition-colors', viewMode === 'pitch' ? 'bg-slate-700' : 'hover:bg-slate-800')}
            title="Pitch view"
          >
            <PitchIcon active={viewMode === 'pitch'} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={clsx('rounded p-1.5 transition-colors', viewMode === 'list' ? 'bg-slate-700' : 'hover:bg-slate-800')}
            title="List view"
          >
            <ListIcon active={viewMode === 'list'} />
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Total xP" value={data.total_xp.toFixed(1)} sub="round 1 projected" />
        <StatCard label="Squad Cost" value={`£${totalCost.toFixed(1)}m`} sub="of £100m" />
        <StatCard label="Players" value={String(displaySquad.length)} sub="selected" />
      </div>

      {/* Budget bar */}
      <div className="mb-3">
        <div className="mb-1 flex justify-between text-xs text-slate-500">
          <span>Budget used</span>
          <span className={budgetPct > 95 ? 'text-rose-400' : 'text-slate-400'}>
            £{totalCost.toFixed(1)}m <span className="text-slate-600">/ £100m</span>
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-800">
          <div
            className={clsx('h-full rounded-full transition-all', budgetPct > 95 ? 'bg-rose-500' : 'bg-accent')}
            style={{ width: `${budgetPct}%` }}
          />
        </div>
      </div>

      {/* Country limit warnings */}
      {overLimit.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-yellow-800/30 bg-yellow-900/10 px-3 py-2">
          <span className="text-xs text-yellow-600">Country limit:</span>
          {overLimit.map(([abbr, count]) => (
            <span key={abbr} className="rounded bg-yellow-900/30 px-1.5 py-0.5 text-xs font-semibold text-yellow-300">
              {abbr} ×{count}
            </span>
          ))}
          <span className="text-xs text-yellow-700">max 3 in group stage</span>
        </div>
      )}

      {/* Pitch view */}
      {viewMode === 'pitch' && (
        <Pitch
          players={displaySquad}
          projections={projections ?? []}
          round={round}
          captain={activeCaptain ?? null}
          eliminatedSquadIds={eliminatedSquadIds}
          onPlayerClick={setSelectedPlayer}
        />
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          {POS_ORDER.map((pos) => {
            const posPlayers = displaySquad.filter((p) => p.position === pos)
            if (!posPlayers.length) return null
            return (
              <div key={pos}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {pos} <span className="font-normal">· {posPlayers.length}</span>
                </h2>
                <div className="space-y-1.5">
                  {posPlayers.map((p) => (
                    <PlayerCard
                      key={p.element}
                      player={p}
                      isCaptain={p.element === activeCaptain}
                      onClick={() => setSelectedPlayer(p)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-6 flex justify-center">
        <button
          onClick={() => setWcOnboardingOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-500 transition hover:border-slate-600 hover:text-slate-300"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 6A4 4 0 1 1 6 2" />
            <path d="M10 2v4H6" />
          </svg>
          Re-sync squad
        </button>
      </div>

      <PlayerProfileModal
        player={selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        onSubOut={(p) => { setSelectedPlayer(null); setSwapTarget(p) }}
        isBench={selectedIsBench}
      />

      {swapTarget && (
        <SwapDrawer
          target={swapTarget}
          options={swapTargetIsBench ? xi : bench}
          subIn={swapTargetIsBench}
          onSwap={handleSwap}
          onCancel={() => setSwapTarget(null)}
        />
      )}
    </div>
  )
}
