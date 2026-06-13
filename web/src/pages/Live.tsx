import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { wcApi } from '../services/wcApi'
import { useCurrentRound } from '../hooks/useWC'
import Spinner from '../components/shared/Spinner'

interface LiveMatch {
  id: number
  home_team: string
  away_team: string
  home_score: number | null
  away_score: number | null
  status: string
  minute?: number | null
  kickoff?: string | null
}

function formatKickoff(dateStr: string | null | undefined) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function MatchCard({ m }: { m: LiveMatch }) {
  const isLive = m.status === 'live'
  const isFinished = m.status === 'finished'
  const isScheduled = m.status === 'scheduled'
  const hasScore = m.home_score != null && m.away_score != null

  return (
    <div className={`rounded-xl border px-4 py-3 transition-all duration-150 ${
      isLive
        ? 'border-green-400/40 bg-slate-900/60 backdrop-blur-sm shadow-glow-green-md animate-pulse-slow'
        : isFinished
          ? 'border-white/[0.08] bg-slate-900/50 backdrop-blur-sm'
          : 'border-white/[0.04] bg-slate-950/60'
    }`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex-1 min-w-0 truncate text-right text-sm font-semibold text-slate-100">{m.home_team}</span>

        <div className="flex min-w-[72px] flex-col items-center">
          {isScheduled ? (
            <span className="text-center text-xs font-medium text-slate-500">
              {formatKickoff(m.kickoff)}
            </span>
          ) : (
            <>
              <span className={`text-xl font-bold tabular-nums leading-tight ${
                isLive ? 'text-accent' : isFinished ? 'text-slate-100' : 'text-slate-600'
              }`}>
                {hasScore ? `${m.home_score} – ${m.away_score}` : '– –'}
              </span>
              <div className="mt-0.5 flex items-center gap-1">
                {isLive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />}
                <span className={`text-[10px] font-bold ${
                  isLive ? 'text-green-400' : isFinished ? 'text-slate-500' : 'text-slate-600'
                }`}>
                  {isLive ? (m.minute != null ? `${m.minute}'` : 'LIVE') : 'FT'}
                </span>
              </div>
            </>
          )}
        </div>

        <span className="flex-1 min-w-0 truncate text-sm font-semibold text-slate-100">{m.away_team}</span>
      </div>
    </div>
  )
}

export default function Live() {
  const currentRound = useCurrentRound()
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['live', currentRound?.id],
    queryFn: () => wcApi.live(currentRound!.id),
    enabled: !!currentRound,
    refetchInterval: 60_000,
  })

  useEffect(() => {
    if (data) setLastUpdated(new Date())
  }, [data])

  const raw = data as Record<string, unknown> | LiveMatch[] | null
  const matches: LiveMatch[] = Array.isArray(raw)
    ? (raw as LiveMatch[])
    : Array.isArray((raw as Record<string, unknown>)?.matches)
      ? ((raw as Record<string, unknown>).matches as LiveMatch[])
      : []
  const isStale = !Array.isArray(raw) && !!(raw as Record<string, unknown>)?.stale
  const source = !Array.isArray(raw) ? ((raw as Record<string, unknown>)?.source as string) : null

  const updatedStr = lastUpdated
    ? lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-1 flex items-baseline gap-3">
        <h1 className="text-xl font-semibold text-slate-100">Live</h1>
        {currentRound && (
          <span className="text-sm text-slate-500">Round {currentRound.id} · {currentRound.stage}</span>
        )}
      </div>
      <p className="mb-4 text-xs text-slate-600">
        {isStale
          ? source === 'unavailable'
            ? 'Live API unavailable — showing last known data'
            : 'Live scores unavailable — showing fixture schedule'
          : `Updates every 60s${updatedStr ? ` · last updated ${updatedStr}` : ''}`}
      </p>

      {!currentRound ? (
        <p className="text-sm text-slate-400">No active round — tournament hasn't started yet.</p>
      ) : isLoading ? (
        <Spinner label="Loading live data…" />
      ) : matches.length === 0 ? (
        <>
          <p className="text-sm text-slate-400">No matches found for this round yet.</p>
          {process.env.NODE_ENV === 'development' && (
            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-slate-600">Raw API response</summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-800 p-3 text-xs text-slate-400">
                {JSON.stringify(data, null, 2)}
              </pre>
            </details>
          )}
        </>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {matches.map((m) => <MatchCard key={m.id} m={m} />)}
        </div>
      )}
    </div>
  )
}
