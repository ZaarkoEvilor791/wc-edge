import { createPortal } from 'react-dom'
import type { SquadPlayer } from '../../types/wc'
import { usePlayerProjectionsAllRounds } from '../../hooks/useWC'
import RoundXpChart from './RoundXpChart'

const POS_LABEL: Record<string, string> = {
  GK: 'Goalkeeper',
  DEF: 'Defender',
  MID: 'Midfielder',
  FWD: 'Forward',
}

interface Props {
  player: SquadPlayer | null
  onClose: () => void
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-slate-800 bg-slate-950 p-2">
      <span className="text-sm font-semibold text-slate-100">{value}</span>
      <span className="text-[10px] text-slate-500">{label}</span>
    </div>
  )
}

function ModalContent({ player, onClose }: { player: SquadPlayer; onClose: () => void }) {
  const allRounds = usePlayerProjectionsAllRounds(player.element)
  const r1 = allRounds[0]
  const xmins = r1 ? Math.ceil(r1.p_play * r1.mf * 90) : null
  const chartData = allRounds.map((r) => ({ round: r.round, xp: r.xp }))

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close player profile"
          className="absolute right-3 top-3 rounded-lg p-1 text-slate-400 hover:text-slate-100"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 2l12 12M14 2L2 14" />
          </svg>
        </button>

        {/* Header */}
        <div className="mb-4 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="truncate text-lg font-bold text-slate-100">{player.name}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                {player.team_abbr}
              </span>
              <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                {POS_LABEL[player.position] ?? player.position}
              </span>
              <span className="text-xs text-slate-400">£{player.price.toFixed(1)}m</span>
            </div>
          </div>
        </div>

        {/* Hero xP */}
        <div className="mb-4 rounded-xl border border-slate-800 bg-slate-950 py-3 text-center">
          <p className="text-3xl font-bold text-accent">
            {allRounds[0]?.loading ? '…' : (r1?.xp ?? player.xp).toFixed(1)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">xP · Round 1</p>
        </div>

        {/* Round xP chart */}
        <div className="mb-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            xP by Round
          </p>
          {allRounds.some((r) => r.loading) ? (
            <div className="flex h-16 items-center justify-center text-xs text-slate-500">Loading…</div>
          ) : (
            <RoundXpChart data={chartData} />
          )}
        </div>

        {/* Stats grid */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Round 1 Projections
          </p>
          <div className="grid grid-cols-4 gap-2">
            <StatCell label="P(Goal)" value={r1 ? `${(r1.p_goal * 100).toFixed(0)}%` : '—'} />
            <StatCell label="P(CS)" value={r1 ? `${(r1.p_cs * 100).toFixed(0)}%` : '—'} />
            <StatCell label="Variance" value={r1 ? r1.variance.toFixed(1) : '—'} />
            <StatCell label="xMins" value={xmins != null ? `${xmins}'` : '—'} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PlayerProfileModal({ player, onClose }: Props) {
  if (!player) return null
  return createPortal(<ModalContent player={player} onClose={onClose} />, document.body)
}
