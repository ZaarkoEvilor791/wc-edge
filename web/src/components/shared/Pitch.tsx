import type { SquadPlayer, Projection } from '../../types/wc'
import { getXI } from '../../utils/squad'
import PitchPlayerCard from './PitchPlayerCard'

interface Props {
  players: SquadPlayer[]
  projections: Projection[]
  round: number
  captain: number | null
  onPlayerClick: (player: SquadPlayer) => void
}

function xpFor(p: SquadPlayer, projections: Projection[], round: number): number {
  return projections.find((pr) => pr.element === p.element && pr.round === round)?.xp ?? p.xp
}

function FormationRow({
  players,
  projections,
  round,
  captain,
  onPlayerClick,
}: {
  players: SquadPlayer[]
  projections: Projection[]
  round: number
  captain: number | null
  onPlayerClick: (p: SquadPlayer) => void
}) {
  return (
    <div className="flex justify-center gap-2">
      {players.map((p) => (
        <PitchPlayerCard
          key={p.element}
          player={p}
          xp={xpFor(p, projections, round)}
          isCaptain={p.element === captain}
          onClick={() => onPlayerClick(p)}
        />
      ))}
    </div>
  )
}

export default function Pitch({ players, projections, round, captain, onPlayerClick }: Props) {
  const { xi, bench } = getXI(players, projections, round)

  const gk = xi.filter((p) => p.position === 'GK')
  const def = xi.filter((p) => p.position === 'DEF')
  const mid = xi.filter((p) => p.position === 'MID')
  const fwd = xi.filter((p) => p.position === 'FWD')

  return (
    <div className="w-full">
      {/* Pitch surface */}
      <div
        className="relative w-full overflow-hidden rounded-xl"
        style={{ background: '#2D7A4F' }}
      >
        {/* Pitch markings as SVG overlay */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 150"
          preserveAspectRatio="none"
          fill="none"
          stroke="white"
          strokeOpacity="0.15"
          strokeWidth="0.8"
        >
          {/* Outer border */}
          <rect x="3" y="3" width="94" height="144" />
          {/* Centre line */}
          <line x1="3" y1="75" x2="97" y2="75" />
          {/* Centre circle */}
          <circle cx="50" cy="75" r="10" />
          {/* Centre spot */}
          <circle cx="50" cy="75" r="0.8" fill="white" fillOpacity="0.3" stroke="none" />
          {/* Top penalty area */}
          <rect x="22" y="3" width="56" height="22" />
          {/* Top goal area */}
          <rect x="36" y="3" width="28" height="9" />
          {/* Bottom penalty area */}
          <rect x="22" y="125" width="56" height="22" />
          {/* Bottom goal area */}
          <rect x="36" y="138" width="28" height="9" />
          {/* Penalty spots */}
          <circle cx="50" cy="19" r="0.8" fill="white" fillOpacity="0.3" stroke="none" />
          <circle cx="50" cy="131" r="0.8" fill="white" fillOpacity="0.3" stroke="none" />
        </svg>

        {/* Player rows */}
        <div className="relative flex flex-col gap-3 px-3 py-4">
          <FormationRow players={fwd} projections={projections} round={round} captain={captain} onPlayerClick={onPlayerClick} />
          <FormationRow players={mid} projections={projections} round={round} captain={captain} onPlayerClick={onPlayerClick} />
          <FormationRow players={def} projections={projections} round={round} captain={captain} onPlayerClick={onPlayerClick} />
          <FormationRow players={gk} projections={projections} round={round} captain={captain} onPlayerClick={onPlayerClick} />
        </div>
      </div>

      {/* Bench strip */}
      <div className="mt-3">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Bench
        </p>
        <div className="flex gap-2">
          {bench.map((p) => (
            <PitchPlayerCard
              key={p.element}
              player={p}
              xp={xpFor(p, projections, round)}
              isBench
              onClick={() => onPlayerClick(p)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
