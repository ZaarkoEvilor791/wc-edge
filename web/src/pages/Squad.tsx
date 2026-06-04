import { useSuggestedSquad } from '../hooks/useWC'
import { useSquadStore } from '../store/squadStore'
import { useEffect } from 'react'
import clsx from 'clsx'
import type { SquadPlayer } from '../types/wc'
import Spinner from '../components/shared/Spinner'
import StatCard from '../components/shared/StatCard'

const POS_ORDER = ['GK', 'DEF', 'MID', 'FWD']

function PlayerCard({ player, isCaptain }: { player: SquadPlayer; isCaptain: boolean }) {
  return (
    <div className={clsx(
      'flex items-center justify-between rounded-xl border px-3 py-2',
      isCaptain ? 'border-accent/60 bg-accent/10' : 'border-slate-800 bg-slate-900',
    )}>
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
    </div>
  )
}

export default function Squad() {
  const { data, isLoading, error } = useSuggestedSquad()
  const { squad, captain, setSquad, setCaptain } = useSquadStore()

  // Populate store from suggested squad on first load
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
  const activeCaptain = captain ?? displaySquad.sort((a, b) => b.xp - a.xp)[0]?.element

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5">
        <h1 className="mb-3 text-xl font-semibold text-slate-100">My Squad</h1>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Total xP" value={data.total_xp.toFixed(1)} sub="round 1 projected" />
          <StatCard label="Squad Cost" value={`£${data.total_cost.toFixed(1)}m`} sub="of £100m" />
          <StatCard label="Players" value={String(displaySquad.length)} sub="selected" />
        </div>
      </div>

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
                  <PlayerCard key={p.element} player={p} isCaptain={p.element === activeCaptain} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
