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
}

export default function Live() {
  const currentRound = useCurrentRound()
  const { data, isLoading } = useQuery({
    queryKey: ['live', currentRound?.id],
    queryFn: () => wcApi.live(currentRound!.id),
    enabled: !!currentRound,
    refetchInterval: 60_000,
  })

  const matches: LiveMatch[] = Array.isArray(data)
    ? (data as LiveMatch[])
    : Array.isArray((data as any)?.matches)
      ? ((data as any).matches as LiveMatch[])
      : []

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-baseline gap-3">
        <h1 className="text-xl font-semibold text-slate-100">Live</h1>
        {currentRound && (
          <span className="text-sm text-slate-500">Round {currentRound.id} · {currentRound.stage}</span>
        )}
      </div>

      {!currentRound ? (
        <p className="text-sm text-slate-400">No active round — tournament hasn&apos;t started yet.</p>
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
          {matches.map((m) => {
            const isLive = m.status === 'live'
            const isFinished = m.status === 'finished'
            const score = m.home_score != null && m.away_score != null
              ? `${m.home_score} – ${m.away_score}`
              : '– –'

            return (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-3"
              >
                <span className="w-20 truncate text-right text-sm text-slate-300">{m.home_team}</span>
                <div className="flex flex-col items-center px-3">
                  <div className={`mb-1 h-1.5 w-1.5 rounded-full ${
                    isLive ? 'animate-pulse bg-green-500' : isFinished ? 'bg-slate-600' : 'bg-slate-700'
                  }`} />
                  <span className={`text-sm font-bold tabular-nums ${
                    isLive ? 'text-green-300' : isFinished ? 'text-slate-400' : 'text-slate-600'
                  }`}>
                    {score}
                  </span>
                  {isLive && m.minute != null && (
                    <span className="text-[10px] text-green-400">{m.minute}&apos;</span>
                  )}
                </div>
                <span className="w-20 truncate text-sm text-slate-300">{m.away_team}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
