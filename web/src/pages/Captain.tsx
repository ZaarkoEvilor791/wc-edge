import { useState, useEffect, useMemo } from 'react'
import clsx from 'clsx'
import { useSquadStore } from '../store/squadStore'
import { useProjections, useTeamFdr, useCurrentRound, useRounds, useTeams } from '../hooks/useWC'

const FDR_STYLE: Record<number, string> = {
  1: 'bg-emerald-500/20 text-emerald-400',
  2: 'bg-green-500/20 text-green-400',
  3: 'bg-yellow-500/20 text-yellow-400',
  4: 'bg-orange-500/20 text-orange-400',
  5: 'bg-rose-500/20 text-rose-400',
}

function useCountdown(targetDate: string | null | undefined) {
  const [text, setText] = useState('')
  useEffect(() => {
    if (!targetDate) { setText(''); return }
    const update = () => {
      const diff = new Date(targetDate).getTime() - Date.now()
      if (diff <= 0) { setText('Deadline passed'); return }
      const h = Math.floor(diff / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)
      setText(`${h}h ${m}m remaining`)
    }
    update()
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [targetDate])
  return text
}

function formatDeadlineDate(dateStr: string | null | undefined) {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function Captain() {
  const { squad, captain, viceCaptain, setCaptain, setViceCaptain } = useSquadStore()
  const currentRound = useCurrentRound()
  const { data: rounds } = useRounds()
  const round = currentRound?.id ?? 1
  const { data: projections } = useProjections(round)
  const { data: fdrData } = useTeamFdr(round)
  const { data: teams } = useTeams()
  const eliminatedSquadIds = useMemo(
    () => new Set((teams ?? []).filter(t => !t.is_active).map(t => t.squad_id)),
    [teams],
  )

  const sorted = [...squad].sort((a, b) => b.xp - a.xp)

  const projMap = new Map(projections?.map((p) => [p.element, p]) ?? [])
  const fdrMap = new Map(fdrData?.map((f) => [f.squad_id, f.fdr]) ?? [])

  // Find the next round's start_date as the deadline
  const currentRoundData = rounds?.find((r) => r.id === round)
  const deadlineDate = currentRoundData?.start_date
  const countdown = useCountdown(deadlineDate)
  const deadlineFormatted = formatDeadlineDate(deadlineDate)

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Captain Picker</h1>
          <p className="mt-0.5 text-sm text-slate-500">Tap a player to set as captain</p>
        </div>
        {deadlineFormatted && countdown && (
          <div className="shrink-0 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-right">
            <p className="text-xs text-slate-500">
              Deadline: <span className="text-slate-300">{deadlineFormatted}</span>
            </p>
            <p className="text-xs font-semibold text-accent">{countdown}</p>
          </div>
        )}
      </div>

      {sorted.length > 0 && (
        <div className="mb-1 flex items-center px-4 text-xs text-slate-500">
          <span className="w-6 shrink-0" />
          <span className="ml-3 flex-1">Player</span>
          <span className="hidden w-8 text-center sm:block">FDR</span>
          <span className="hidden w-12 text-right sm:block">±Var</span>
          <span className="w-16 text-right">xP</span>
        </div>
      )}

      <div className="space-y-1.5">
        {sorted.map((p, i) => {
          const proj = projMap.get(p.element)
          const fdr = fdrMap.get(p.squad_id)
          const variance = proj?.variance
          const isEliminated = eliminatedSquadIds.has(p.squad_id)

          return (
            <button
              key={p.element}
              onClick={() => setCaptain(p.element)}
              className={clsx(
                'flex w-full items-center rounded-xl border px-4 py-2.5 text-left transition-all duration-150',
                captain === p.element
                  ? 'border-accent/50 bg-accent/10 shadow-glow-gold'
                  : i === 0
                    ? 'border-accent/30 bg-slate-900/50 backdrop-blur-sm hover:border-accent/60 hover:shadow-glow-gold'
                    : 'border-white/[0.06] bg-slate-900/40 backdrop-blur-sm hover:border-white/20 hover:bg-slate-800/50',
              )}
            >
              <span className="w-6 shrink-0 text-sm tabular-nums text-slate-500">{i + 1}</span>
              <div className="ml-3 min-w-0 flex-1">
                <div className={clsx('flex flex-wrap items-center gap-1.5 text-sm font-medium', isEliminated ? 'text-slate-400' : 'text-slate-100')}>
                  {p.name}
                  {fdr !== undefined && (
                    <span className={clsx('sm:hidden rounded px-1.5 py-0.5 text-[10px] font-bold', FDR_STYLE[fdr] ?? FDR_STYLE[3])}>
                      FDR {fdr}
                    </span>
                  )}
                  {i === 0 && captain !== p.element && !isEliminated && (
                    <span className="text-xs text-accent">TOP PICK</span>
                  )}
                  {isEliminated && (
                    <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Eliminated
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500">{p.position} · {p.team_abbr}</div>
              </div>
              <div className="flex items-center gap-2">
                {fdr !== undefined && (
                  <span className={clsx('hidden w-8 rounded px-1.5 py-0.5 text-center text-[10px] font-bold sm:block', FDR_STYLE[fdr] ?? FDR_STYLE[3])}>
                    {fdr}
                  </span>
                )}
                {variance !== undefined && (
                  <span className="hidden w-12 text-right text-xs text-slate-500 sm:block">
                    ±{variance.toFixed(1)}
                  </span>
                )}
                {captain === p.element && (
                  <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-bold text-accent">C</span>
                )}
                <span className={clsx('w-16 text-right text-sm font-semibold', isEliminated ? 'text-slate-500' : 'text-accent')}>{p.xp.toFixed(1)} xP</span>
                {p.element !== captain && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setViceCaptain(p.element) }}
                    className={clsx(
                      'ml-1 flex h-8 w-10 shrink-0 items-center justify-center rounded text-xs font-bold',
                      p.element === viceCaptain
                        ? 'bg-slate-300 text-slate-800'
                        : 'border border-slate-700 text-slate-500 hover:border-slate-500',
                    )}
                    title="Set as vice captain"
                  >
                    VC
                  </button>
                )}
              </div>
            </button>
          )
        })}
      </div>

      {sorted.length === 0 && (
        <p className="text-slate-400">No squad loaded yet. Visit Squad to load your players.</p>
      )}

      {sorted.length > 0 && (
        <div className="mt-4 flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.06] bg-slate-900/40 backdrop-blur-sm px-4 py-3">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-slate-500">
            <circle cx="6" cy="6" r="5" />
            <path d="M6 4v4M6 3.5v.01" strokeLinecap="round" />
          </svg>
          <p className="text-xs text-slate-500">
            Remember to also set your captain at{' '}
            <a
              href="https://play.fifa.com/fantasy/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline-offset-2 hover:underline"
            >
              play.fifa.com/fantasy/
            </a>
          </p>
        </div>
      )}
    </div>
  )
}
