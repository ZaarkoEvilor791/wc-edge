import { useSquadStore } from '../store/squadStore'
import clsx from 'clsx'

export default function Captain() {
  const { squad, captain, setCaptain } = useSquadStore()

  const sorted = [...squad].sort((a, b) => b.xp - a.xp)

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold text-slate-100">Captain Picker</h1>

      {sorted.length > 0 && (
        <div className="mb-1 flex items-center px-4 text-xs text-slate-500">
          <span className="w-6 shrink-0" />
          <span className="ml-3 flex-1">Player</span>
          <span className="w-16 text-right">xP</span>
        </div>
      )}

      <div className="space-y-1.5">
        {sorted.map((p, i) => (
          <button
            key={p.element}
            onClick={() => setCaptain(p.element)}
            className={clsx(
              'flex w-full items-center rounded-xl border px-4 py-2.5 text-left transition-colors',
              captain === p.element
                ? 'border-accent bg-accent/10'
                : i === 0
                  ? 'border-accent/40 hover:border-accent'
                  : 'border-slate-800 bg-slate-900 hover:border-slate-600',
            )}
          >
            <span className="w-6 shrink-0 text-sm tabular-nums text-slate-500">{i + 1}</span>
            <div className="ml-3 flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-100">
                {p.name}
                {i === 0 && captain !== p.element && (
                  <span className="ml-2 text-xs text-accent">TOP PICK</span>
                )}
              </div>
              <div className="text-xs text-slate-500">{p.position} · {p.team_abbr}</div>
            </div>
            <div className="flex items-center gap-2">
              {captain === p.element && (
                <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-bold text-accent">C</span>
              )}
              <span className="w-16 text-right text-sm font-semibold text-accent">{p.xp.toFixed(1)} xP</span>
            </div>
          </button>
        ))}
      </div>

      {sorted.length === 0 && (
        <p className="text-slate-400">No squad loaded yet. Visit Squad to load your players.</p>
      )}
    </div>
  )
}
