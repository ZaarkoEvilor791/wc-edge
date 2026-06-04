import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { wcApi } from '../services/wcApi'
import { useCurrentRound } from '../hooks/useWC'
import { useSquadStore } from '../store/squadStore'
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

function MatchCard({ m }: { m: LiveMatch }) {
  const isLive = m.status === 'live'
  const isFinished = m.status === 'finished'
  const hasScore = m.home_score != null && m.away_score != null

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="w-24 truncate text-right text-sm font-semibold text-slate-100">{m.home_team}</span>

        <div className="flex min-w-[64px] flex-col items-center">
          <span className={`text-xl font-bold tabular-nums leading-tight ${
            isLive ? 'text-accent' : isFinished ? 'text-slate-100' : 'text-slate-600'
          }`}>
            {hasScore ? `${m.home_score} – ${m.away_score}` : '– –'}
          </span>
          <div className="mt-0.5 flex items-center gap-1">
            {isLive && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
            )}
            <span className={`text-[10px] font-bold ${
              isLive ? 'text-green-400' : isFinished ? 'text-slate-500' : 'text-slate-600'
            }`}>
              {isLive
                ? m.minute != null ? `${m.minute}'` : 'LIVE'
                : isFinished
                  ? 'FT'
                  : m.kickoff ?? '—'}
            </span>
          </div>
        </div>

        <span className="w-24 truncate text-sm font-semibold text-slate-100">{m.away_team}</span>
      </div>
    </div>
  )
}

export default function Live() {
  const currentRound = useCurrentRound()
  const { squad, captain } = useSquadStore()
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

  const matches: LiveMatch[] = Array.isArray(data)
    ? (data as LiveMatch[])
    : Array.isArray((data as Record<string, unknown>)?.matches)
      ? ((data as Record<string, unknown>).matches as LiveMatch[])
      : []

  const hasActiveMatches = matches.some((m) => m.status === 'live' || m.status === 'finished')
  const captainName = captain != null ? squad.find((p) => p.element === captain)?.name : null
  const showCaptainBanner = hasActiveMatches && captainName != null

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
        Updates every 60s{updatedStr ? ` · last updated ${updatedStr}` : ''}
      </p>

      {/* Captain banner */}
      {showCaptainBanner && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-accent/30 bg-accent/10 px-4 py-3">
          <p className="text-sm text-accent">
            ⚡ <span className="font-semibold">{captainName}</span> is your captain — consider a mid-match swap if they've already played
          </p>
          <a
            href="https://play.fifa.com/fantasy/"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-3 shrink-0 text-sm font-semibold text-accent hover:underline"
          >
            FIFA Fantasy →
          </a>
        </div>
      )}

      {!currentRound ? (
        <p className="text-sm text-slate-400">No active round — tournament hasn't started yet.</p>
      ) : isLoading ? (
        <Spinner label="Loading live data…" />
      ) : !data ? (
        <p className="text-sm text-slate-400">Live data unavailable — community API may be down.</p>
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
