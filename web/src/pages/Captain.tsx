import { useSquadStore } from '../store/squadStore'
import clsx from 'clsx'

export default function Captain() {
  const { squad, captain, setCaptain } = useSquadStore()

  const sorted = [...squad].sort((a, b) => b.xp - a.xp)

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold text-slate-100">Captain Picker</h1>
      <div className="space-y-1.5">
        {sorted.map((p, i) => (
          <button
            key={p.element}
            onClick={() => setCaptain(p.element)}
            className={clsx(
              'flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors',
              captain === p.element
                ? 'border-accent bg-accent/10'
                : 'border-slate-700 bg-slate-800 hover:border-slate-600',
            )}
          >
            <div className="flex items-center gap-3">
              <span className="w-5 text-xs text-slate-500">#{i + 1}</span>
              <div>
                <div className="text-sm font-medium text-slate-100">{p.name}</div>
                <div className="text-xs text-slate-500">{p.position} · {p.team_abbr}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-accent">{p.xp.toFixed(1)} xP</div>
              {captain === p.element && (
                <div className="text-xs text-accent">Captain ✓</div>
              )}
            </div>
          </button>
        ))}
      </div>
      {sorted.length === 0 && (
        <p className="text-slate-400">No squad loaded yet.</p>
      )}
    </div>
  )
}
