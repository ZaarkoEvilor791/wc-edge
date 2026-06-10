import type { SquadPlayer, Projection } from '../../types/wc'
import { getXI } from '../../utils/squad'
import { POS_COUNT, POS_REQUIRED } from '../../config/gameRules'
import PitchPlayerCard from './PitchPlayerCard'
import EmptySlotCard from './EmptySlotCard'

interface Props {
  players: SquadPlayer[]
  projections: Projection[]
  round: number
  captain: number | null
  viceCaptain?: number | null
  posCount?: Record<string, number>
  eliminatedSquadIds?: Set<number>
  swapSourceElement?: number
  eligibleElements?: Set<number>
  onPlayerClick: (player: SquadPlayer) => void
  onEmptySlotClick?: (position: string) => void
  allOnPitch?: boolean
}

function xpFor(p: SquadPlayer, projections: Projection[], round: number): number {
  return projections.find((pr) => pr.element === p.element && pr.round === round)?.xp ?? p.xp
}

function FormationRow({
  players,
  emptySlots,
  position,
  projections,
  round,
  captain,
  viceCaptain,
  eliminatedSquadIds,
  swapSourceElement,
  eligibleElements,
  onPlayerClick,
  onEmptySlotClick,
}: {
  players: SquadPlayer[]
  emptySlots: number
  position: string
  projections: Projection[]
  round: number
  captain: number | null
  viceCaptain?: number | null
  eliminatedSquadIds?: Set<number>
  swapSourceElement?: number
  eligibleElements?: Set<number>
  onPlayerClick: (p: SquadPlayer) => void
  onEmptySlotClick?: (position: string) => void
}) {
  const inSwapMode = swapSourceElement !== undefined
  return (
    <div className="flex justify-center gap-2">
      {players.map((p) => (
        <PitchPlayerCard
          key={p.element}
          player={p}
          xp={xpFor(p, projections, round)}
          isCaptain={p.element === captain}
          isViceCaptain={p.element === viceCaptain}
          eliminated={eliminatedSquadIds?.has(p.squad_id)}
          isSelected={p.element === swapSourceElement}
          isEligible={inSwapMode && eligibleElements?.has(p.element)}
          isDimmed={inSwapMode && p.element !== swapSourceElement && !eligibleElements?.has(p.element)}
          onClick={() => onPlayerClick(p)}
        />
      ))}
      {onEmptySlotClick && Array.from({ length: emptySlots }).map((_, i) => (
        <EmptySlotCard key={`empty-${position}-${i}`} position={position} onClick={() => onEmptySlotClick(position)} />
      ))}
    </div>
  )
}

export default function Pitch({
  players,
  projections,
  round,
  captain,
  viceCaptain,
  posCount,
  eliminatedSquadIds,
  swapSourceElement,
  eligibleElements,
  onPlayerClick,
  onEmptySlotClick,
  allOnPitch = false,
}: Props) {
  const counts = posCount ?? POS_COUNT
  const { xi, bench } = getXI(players, counts)

  // When allOnPitch, show every player by position (no bench section)
  const pitchGK = allOnPitch ? players.filter((p) => p.position === 'GK') : xi.filter((p) => p.position === 'GK')
  const pitchDEF = allOnPitch ? players.filter((p) => p.position === 'DEF') : xi.filter((p) => p.position === 'DEF')
  const pitchMID = allOnPitch ? players.filter((p) => p.position === 'MID') : xi.filter((p) => p.position === 'MID')
  const pitchFWD = allOnPitch ? players.filter((p) => p.position === 'FWD') : xi.filter((p) => p.position === 'FWD')

  // Empty slot counts: for allOnPitch use POS_REQUIRED totals, otherwise formation counts
  const slotCounts = allOnPitch ? POS_REQUIRED : counts
  const emptyGK = Math.max(0, (slotCounts.GK ?? 1) - pitchGK.length)
  const emptyDEF = Math.max(0, (slotCounts.DEF ?? 4) - pitchDEF.length)
  const emptyMID = Math.max(0, (slotCounts.MID ?? 4) - pitchMID.length)
  const emptyFWD = Math.max(0, (slotCounts.FWD ?? 2) - pitchFWD.length)

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
          <FormationRow players={pitchFWD} emptySlots={emptyFWD} position="FWD" projections={projections} round={round} captain={captain} viceCaptain={viceCaptain} eliminatedSquadIds={eliminatedSquadIds} swapSourceElement={swapSourceElement} eligibleElements={eligibleElements} onPlayerClick={onPlayerClick} onEmptySlotClick={onEmptySlotClick} />
          <FormationRow players={pitchMID} emptySlots={emptyMID} position="MID" projections={projections} round={round} captain={captain} viceCaptain={viceCaptain} eliminatedSquadIds={eliminatedSquadIds} swapSourceElement={swapSourceElement} eligibleElements={eligibleElements} onPlayerClick={onPlayerClick} onEmptySlotClick={onEmptySlotClick} />
          <FormationRow players={pitchDEF} emptySlots={emptyDEF} position="DEF" projections={projections} round={round} captain={captain} viceCaptain={viceCaptain} eliminatedSquadIds={eliminatedSquadIds} swapSourceElement={swapSourceElement} eligibleElements={eligibleElements} onPlayerClick={onPlayerClick} onEmptySlotClick={onEmptySlotClick} />
          <FormationRow players={pitchGK} emptySlots={emptyGK} position="GK" projections={projections} round={round} captain={captain} viceCaptain={viceCaptain} eliminatedSquadIds={eliminatedSquadIds} swapSourceElement={swapSourceElement} eligibleElements={eligibleElements} onPlayerClick={onPlayerClick} onEmptySlotClick={onEmptySlotClick} />
        </div>
      </div>

      {/* Bench strip — hidden when allOnPitch */}
      {!allOnPitch && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Bench
          </p>
          <div className="flex gap-2">
            {(['GK', 'DEF', 'MID', 'FWD'] as const).flatMap((pos) => {
              const benchForPos = bench.filter((p) => p.position === pos)
              const expected = Math.max(0, (POS_REQUIRED[pos] ?? 0) - (counts[pos] ?? 1))
              const missing = Math.max(0, expected - benchForPos.length)
              return [
                ...benchForPos.map((p) => {
                  const inSwapMode = swapSourceElement !== undefined
                  return (
                    <PitchPlayerCard
                      key={p.element}
                      player={p}
                      xp={xpFor(p, projections, round)}
                      isBench
                      isCaptain={p.element === captain}
                      isViceCaptain={p.element === viceCaptain}
                      eliminated={eliminatedSquadIds?.has(p.squad_id)}
                      isSelected={p.element === swapSourceElement}
                      isEligible={inSwapMode && eligibleElements?.has(p.element)}
                      isDimmed={inSwapMode && p.element !== swapSourceElement && !eligibleElements?.has(p.element)}
                      onClick={() => onPlayerClick(p)}
                    />
                  )
                }),
                ...(onEmptySlotClick
                  ? Array.from({ length: missing }).map((_, i) => (
                      <EmptySlotCard
                        key={`bench-empty-${pos}-${i}`}
                        position={pos}
                        onClick={() => onEmptySlotClick(pos)}
                      />
                    ))
                  : []),
              ]
            })}
          </div>
        </div>
      )}
    </div>
  )
}
