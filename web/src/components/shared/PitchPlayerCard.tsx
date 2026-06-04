import clsx from 'clsx'
import type { SquadPlayer } from '../../types/wc'

interface Props {
  player: SquadPlayer
  xp: number
  isBench?: boolean
  isCaptain?: boolean
  onClick: () => void
}

function surname(name: string): string {
  const parts = name.trim().split(' ')
  return parts[parts.length - 1].slice(0, 10)
}

export default function PitchPlayerCard({ player, xp, isBench, isCaptain, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex flex-col items-center rounded-lg border px-1 py-1 text-center transition-colors hover:bg-slate-800',
        'w-[72px] sm:w-[72px]',
        isBench
          ? 'border-slate-700 bg-slate-900/60'
          : 'border-accent/30 bg-slate-900',
      )}
    >
      <span className="w-full truncate text-[10px] font-semibold text-slate-100 leading-tight">
        {surname(player.name)}
        {isCaptain && (
          <span className="ml-0.5 text-[9px] font-bold text-accent">©</span>
        )}
      </span>
      <span className="text-[9px] text-slate-400 leading-tight hidden sm:block">
        £{player.price.toFixed(1)}m
      </span>
      <span className={clsx(
        'text-[10px] font-medium leading-tight',
        isBench ? 'text-slate-400' : 'text-accent',
      )}>
        {xp.toFixed(1)}
      </span>
    </button>
  )
}
