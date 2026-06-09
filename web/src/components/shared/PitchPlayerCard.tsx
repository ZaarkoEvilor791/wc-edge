import clsx from 'clsx'
import type { SquadPlayer } from '../../types/wc'
import JerseyIcon from './JerseyIcon'
import { getKit } from '../../data/teamColors'

interface Props {
  player: SquadPlayer
  xp: number
  isBench?: boolean
  isCaptain?: boolean
  isViceCaptain?: boolean
  eliminated?: boolean
  isSelected?: boolean
  isEligible?: boolean
  isDimmed?: boolean
  onClick: () => void
}

function surname(name: string): string {
  const parts = name.trim().split(' ')
  return parts[parts.length - 1].slice(0, 10)
}

export default function PitchPlayerCard({ player, xp, isBench, isCaptain, isViceCaptain, eliminated, isSelected, isEligible, isDimmed, onClick }: Props) {
  const kit = getKit(player.team_abbr)

  return (
    <button
      onClick={onClick}
      className={clsx(
        'relative flex flex-col items-center rounded-lg border px-1 pt-1 pb-1 text-center transition-all hover:bg-slate-800/60',
        'w-[72px] sm:w-[72px]',
        isBench
          ? 'border-slate-700 bg-slate-900/60'
          : 'border-slate-700/40 bg-slate-950',
        isSelected && 'ring-2 ring-[#E8B84B] ring-offset-1 ring-offset-transparent border-[#E8B84B]/60',
        isEligible && !isSelected && 'ring-2 ring-green-400 ring-offset-1 ring-offset-transparent border-green-400/60',
        isDimmed && 'opacity-40',
      )}
    >
      {/* Captain / VC badge */}
      {isCaptain && (
        <span className="absolute -top-1.5 -right-1.5 z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#E8B84B] text-[9px] font-black text-slate-900 leading-none">
          C
        </span>
      )}
      {isViceCaptain && !isCaptain && (
        <span className="absolute -top-1.5 -right-1.5 z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-slate-300 text-[8px] font-black text-slate-700 leading-none">
          VC
        </span>
      )}

      {/* Jersey icon */}
      <JerseyIcon
        primary={kit.primary}
        secondary={kit.secondary}
        pattern={kit.pattern}
        size={34}
        eliminated={eliminated}
      />

      {/* Name */}
      <span className="mt-0.5 w-full truncate text-[10px] font-semibold text-slate-100 leading-tight">
        {surname(player.name)}
      </span>

      {/* xP */}
      <span className={clsx(
        'text-[10px] font-medium leading-tight',
        isBench ? 'text-slate-400' : 'text-accent',
      )}>
        {xp.toFixed(1)}
      </span>
    </button>
  )
}
