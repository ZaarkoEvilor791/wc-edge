import { useState, useEffect } from 'react'
import clsx from 'clsx'
import { useSuggestedSquad, useProjections, useCurrentRound } from '../hooks/useWC'
import { useSquadStore } from '../store/squadStore'
import type { SquadPlayer } from '../types/wc'
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

// Inline SVG icons for view toggle
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

export default function Squad() {
  const { data, isLoading, error } = useSuggestedSquad()
  const { squad, captain, setSquad, setCaptain } = useSquadStore()
  const currentRound = useCurrentRound()
  const round = currentRound?.id ?? 1
  const { data: projections } = useProjections(round)

  const [viewMode, setViewMode] = useState<'pitch' | 'list'>('pitch')
  const [selectedPlayer, setSelectedPlayer] = useState<SquadPlayer | null>(null)

  useEffect(() => {
    if (data?.squad_json && squad.length === 0) {
      setSquad(data.squad_json)
      const topPlayer = [...data.squad_json].sort((a, b) => b.xp - a.xp)[0]
      if (topPlayer) setCaptain(topPlayer.element)
    }
  }, [data, squad.length, setSquad, setCaptain])

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

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">My Squad</h1>
        <div className="flex items-center gap-1 rounded-lg border border-slate-700 p-0.5">
          <button
            onClick={() => setViewMode('pitch')}
            className={clsx(
              'rounded p-1.5 transition-colors',
              viewMode === 'pitch' ? 'bg-slate-700' : 'hover:bg-slate-800',
            )}
            title="Pitch view"
          >
            <PitchIcon active={viewMode === 'pitch'} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={clsx(
              'rounded p-1.5 transition-colors',
              viewMode === 'list' ? 'bg-slate-700' : 'hover:bg-slate-800',
            )}
            title="List view"
          >
            <ListIcon active={viewMode === 'list'} />
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Total xP" value={data.total_xp.toFixed(1)} sub="round 1 projected" />
        <StatCard label="Squad Cost" value={`£${data.total_cost.toFixed(1)}m`} sub="of £100m" />
        <StatCard label="Players" value={String(displaySquad.length)} sub="selected" />
      </div>

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

      <PlayerProfileModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
    </div>
  )
}
