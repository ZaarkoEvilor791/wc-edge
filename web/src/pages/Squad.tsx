import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { useSuggestedSquad, useProjections, useCurrentRound } from '../hooks/useWC'
import { useSquadStore } from '../store/squadStore'
import { useAppStore } from '../store/appStore'
import type { SquadPlayer } from '../types/wc'
import { getXI } from '../utils/squad'
import Spinner from '../components/shared/Spinner'
import StatCard from '../components/shared/StatCard'
import Pitch from '../components/shared/Pitch'
import PlayerProfileModal from '../components/shared/PlayerProfileModal'

const POS_ORDER = ['GK', 'DEF', 'MID', 'FWD']

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
  bench,
  onSwap,
  onCancel,
}: {
  target: SquadPlayer
  bench: SquadPlayer[]
  onSwap: (replacement: SquadPlayer) => void
  onCancel: () => void
}) {
  const eligible = bench.filter((p) => p.position === target.position)

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-sm rounded-t-2xl border-t border-slate-700 bg-slate-900 px-4 pb-6 pt-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-700" />

        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-100">
              Swap out <span className="text-accent">{target.name}</span>
            </p>
            <p className="text-xs text-slate-500">Select a bench player to bring in</p>
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
            No eligible {target.position} on the bench
          </p>
        ) : (
          <div className="space-y-2">
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

  const [viewMode, setViewMode] = useState<'pitch' | 'list'>('pitch')
  const [selectedPlayer, setSelectedPlayer] = useState<SquadPlayer | null>(null)
  const [swapTarget, setSwapTarget] = useState<SquadPlayer | null>(null)

  useEffect(() => {
    if (!data?.squad_json) return
    const isCorrupt = squad.length > 0 && (
      // Duplicate elements
      new Set(squad.map(p => p.element)).size !== squad.length ||
      // Wrong squad size
      squad.length !== 15 ||
      // Wrong position composition
      squad.filter(p => p.position === 'GK').length !== 2 ||
      squad.filter(p => p.position === 'DEF').length !== 5 ||
      squad.filter(p => p.position === 'MID').length !== 5 ||
      squad.filter(p => p.position === 'FWD').length !== 3
    )
    if (squad.length === 0 || isCorrupt) {
      setSquad(data.squad_json)
      const topPlayer = [...data.squad_json].sort((a, b) => b.xp - a.xp)[0]
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
  const { bench } = getXI(displaySquad, projections ?? [], round)

  const totalCost = displaySquad.reduce((s, p) => s + p.price, 0)
  const budgetPct = Math.min(100, (totalCost / 100) * 100)

  const countByTeam: Record<string, number> = {}
  displaySquad.forEach((p) => { countByTeam[p.team_abbr] = (countByTeam[p.team_abbr] ?? 0) + 1 })
  const overLimit = Object.entries(countByTeam).filter(([, n]) => n >= 3)

  function handleSwap(replacement: SquadPlayer) {
    if (!swapTarget) return
    setSquad(displaySquad.map((p) => p.element === swapTarget.element ? replacement : p))
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
      />

      {swapTarget && (
        <SwapDrawer
          target={swapTarget}
          bench={bench}
          onSwap={handleSwap}
          onCancel={() => setSwapTarget(null)}
        />
      )}
    </div>
  )
}
