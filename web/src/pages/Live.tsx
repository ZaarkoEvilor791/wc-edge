import { useQuery } from '@tanstack/react-query'
import { wcApi } from '../services/wcApi'
import { useCurrentRound } from '../hooks/useWC'

export default function Live() {
  const currentRound = useCurrentRound()
  const { data, isLoading } = useQuery({
    queryKey: ['live', currentRound?.id],
    queryFn: () => wcApi.live(currentRound!.id),
    enabled: !!currentRound,
    refetchInterval: 60_000,
  })

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-xl font-semibold text-slate-100">Live</h1>
      {!currentRound ? (
        <p className="text-slate-400">No active round — tournament hasn&apos;t started yet.</p>
      ) : isLoading ? (
        <p className="text-slate-400">Loading live data...</p>
      ) : !data ? (
        <p className="text-slate-400">Live data unavailable — community API may be down.</p>
      ) : (
        <pre className="rounded-lg bg-slate-800 p-4 text-xs text-slate-300 overflow-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  )
}
