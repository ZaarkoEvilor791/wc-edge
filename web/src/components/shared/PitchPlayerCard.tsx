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
  isLocked?: boolean
  onClick: () => void
}

function surname(name: string): string {
  const parts = name.trim().split(' ')
  return parts[parts.length - 1].slice(0, 10)
}

export default function PitchPlayerCard({ player, xp, isBench, isCaptain, isViceCaptain, eliminated, isSelected, isEligible, isDimmed, isLocked, onClick }: Props) {
  const kit = getKit(player.team_abbr)

  return (
    <button
      onClick={onClick}
      disabled={isLocked}
      className={clsx(
        'relative flex flex-col items-center rounded-lg border px-1 pt-1 pb-1 text-center transition-all duration-150',
        'w-[72px] sm:w-[72px]',
        isBench
          ? 'border-white/[0.05] bg-slate-950/50 shadow-card'
          : 'border-white/[0.07] bg-slate-900/60 backdrop-blur-sm shadow-card hover:border-white/20 hover:bg-slate-800/60',
        isSelected && 'ring-2 ring-accent border-accent/50 shadow-glow-gold-md',
        isEligible && !isSelected && 'ring-2 ring-cyan border-cyan/50 shadow-glow-cyan-md',
        (isDimmed || isLocked) && 'opacity-40',
        isLocked && 'cursor-not-allowed',
      )}
    >
      {/* Captain / VC badge */}
      {isCaptain && (
        <span className="absolute -top-1.5 -right-1.5 z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-accent text-[9px] font-black text-slate-900 leading-none shadow-[0_0_8px_rgba(232,184,75,0.6)]">
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

      {/* xP or FT badge */}
      {isLocked ? (
        <span className="text-[10px] font-bold leading-tight text-slate-500">FT</span>
      ) : (
        <span className={clsx(
          'text-[10px] font-mono font-medium leading-tight tabular-nums',
          isBench ? 'text-slate-400' : 'text-accent',
        )}>
          {xp.toFixed(1)}
        </span>
      )}
    </button>
  )
}
