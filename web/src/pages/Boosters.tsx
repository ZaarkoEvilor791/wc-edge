import clsx from 'clsx'
import { useSquadStore } from '../store/squadStore'
import type { BoosterState } from '../store/squadStore'
import { useCurrentRound } from '../hooks/useWC'

type BoosterDef = {
  id: string
  name: string
  effect: string
  availability: string
  availableFrom: 'any' | 'r32'
  tip: string
}

const BOOSTERS: BoosterDef[] = [
  {
    id: 'wildcard',
    name: 'Wildcard',
    effect: 'Unlimited free transfers this round — no hit.',
    availability: 'Group stage (not Round 1 or R32)',
    availableFrom: 'any',
    tip: 'Best used after a wave of group-stage eliminations to rebuild around advancing squads.',
  },
  {
    id: 'max_captain',
    name: 'Maximum Captain',
    effect: 'Whichever player in your XI scores the most points automatically earns 2× that round.',
    availability: 'Any round',
    availableFrom: 'any',
    tip: 'Play when you have a strong XI but no clear captain pick, or when multiple star players face easy fixtures.',
  },
  {
    id: '12th_man',
    name: '12th Man',
    effect: 'Add one player outside your squad who scores points this round. They cannot be captained, subbed, or transferred.',
    availability: 'Any round',
    availableFrom: 'any',
    tip: 'Target a premium striker or attacker for a key knockout fixture — treat it as a free differential.',
  },
  {
    id: 'qual_booster',
    name: 'Qualification Booster',
    effect: '+2 points to any one starting player whose team advances to the next round (or wins the final).',
    availability: 'Round of 32 onwards',
    availableFrom: 'r32',
    tip: 'Activate in the Round of 32 when most of your starting players are from teams heavily favoured to advance.',
  },
  {
    id: 'cs_shield',
    name: 'Clean Sheet Shield',
    effect: 'Your GK, DEF, and MID only lose clean sheet points after conceding 2 goals instead of 1.',
    availability: 'Round of 32 onwards (to be confirmed)',
    availableFrom: 'r32',
    tip: 'Save for a week when your defence faces tough fixtures but you expect them to limit chances.',
  },
]

const STATE_LABEL: Record<BoosterState, string> = {
  available: 'Available',
  active: 'Active this round',
  used: 'Used',
}

const STATE_STYLE: Record<BoosterState, string> = {
  available: 'bg-slate-800 text-slate-400',
  active: 'bg-accent/15 text-accent',
  used: 'bg-emerald-500/15 text-emerald-400',
}

export default function Boosters() {
  const { boosterStates, setBoosterState } = useSquadStore()
  const currentRound = useCurrentRound()
  const isR32Plus = (currentRound?.id ?? 1) > 8

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100">Boosters</h1>
        <p className="mt-0.5 text-sm text-slate-500">Plan when to play your chips for maximum impact</p>
      </div>

      <div className="flex flex-col gap-3">
        {BOOSTERS.map((b) => {
          const state = boosterStates[b.id] ?? 'available'
          const locked = b.availableFrom === 'r32' && !isR32Plus

          return (
            <div
              key={b.id}
              className={clsx(
                'rounded-xl border bg-surface p-4',
                state === 'active' ? 'border-accent/40' : 'border-slate-800',
                locked && 'opacity-60',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-100">{b.name}</span>
                    <span className={clsx('rounded-full px-2 py-0.5 text-xs font-medium', STATE_STYLE[state])}>
                      {STATE_LABEL[state]}
                    </span>
                    {b.availableFrom === 'r32' && (
                      <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                        R32+ only
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-300">{b.effect}</p>
                  <p className="mt-2 text-xs text-slate-500 italic">{b.availability}</p>
                </div>
              </div>

              {/* Strategy tip */}
              <div className="mt-3 rounded-lg bg-slate-800/60 px-3 py-2">
                <p className="text-xs text-slate-400">
                  <span className="font-medium text-slate-300">Strategy: </span>
                  {b.tip}
                </p>
              </div>

              {/* Actions */}
              {!locked && (
                <div className="mt-3 flex items-center gap-2">
                  {state === 'available' && (
                    <button
                      onClick={() => setBoosterState(b.id, 'active')}
                      className="rounded-lg bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20 transition-colors"
                    >
                      Activate for this round
                    </button>
                  )}
                  {state === 'active' && (
                    <>
                      <button
                        onClick={() => setBoosterState(b.id, 'used')}
                        className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                      >
                        Mark as used
                      </button>
                      <button
                        onClick={() => setBoosterState(b.id, 'available')}
                        className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                      >
                        Deactivate
                      </button>
                    </>
                  )}
                  {state === 'used' && (
                    <button
                      onClick={() => setBoosterState(b.id, 'available')}
                      className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      Undo
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
