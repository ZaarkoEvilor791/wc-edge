import { useState, useEffect, useMemo } from 'react'
import clsx from 'clsx'
import { useSuggestedSquad, useProjections, useCurrentRound, useTeams } from '../hooks/useWC'
import { useSquadStore } from '../store/squadStore'
import { useAppStore } from '../store/appStore'
import type { SquadPlayer } from '../types/wc'
import { getXI, swapInSquad, optimiseXI } from '../utils/squad'
import { roundPhase, COUNTRY_LIMIT } from '../domain/squadValidator'
import { POS_ORDER } from '../config/gameRules'
import Spinner from '../components/shared/Spinner'
import StatCard from '../components/shared/StatCard'
import Pitch from '../components/shared/Pitch'
import PlayerProfileModal from '../components/shared/PlayerProfileModal'
import UnmatchedBanner from '../components/shared/UnmatchedBanner'
import BrowseAllModal from '../components/shared/BrowseAllModal'

function PlayerCard({ player, isCaptain, eliminated, onClick }: { player: SquadPlayer; isCaptain: boolean; eliminated: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors hover:bg-slate-800',
        isCaptain ? 'border-accent/60 bg-accent/10' : 'border-slate-800 bg-slate-900',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="w-8 text-center text-xs font-bold text-slate-500">{player.position}</span>
        <div>
          <div className="flex items-center gap-1.5">
            <span className={clsx('text-sm font-medium', eliminated ? 'text-slate-400' : 'text-slate-100')}>{player.name}</span>
            {isCaptain && <span className="rounded bg-accent px-1 text-[10px] font-bold text-accent-fg">C</span>}
            {player.low_sample && <span className="rounded bg-slate-700 px-1 text-[10px] text-slate-400">?</span>}
            {eliminated && <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Eliminated</span>}
          </div>
          <span className="text-xs text-slate-500">{player.team_abbr}</span>
        </div>
      </div>
      <div className="text-right">
        <div className={clsx('text-sm font-semibold', eliminated ? 'text-slate-500' : 'text-accent')}>{player.xp.toFixed(1)} xP</div>
        <div className="text-xs text-slate-500">£{player.price.toFixed(1)}m</div>
      </div>
    </button>
  )
}

function PitchIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
      className={active ? 'text-accent' : 'text-slate-500'}>
      <rect x="1" y="1" width="14" height="14" rx="1" />
      <line x1="1" y1="8" x2="15" y2="8" />
      <ellipse cx="8" cy="8" rx="3" ry="3" />
    </svg>
  )
}

function ListIcon({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
      className={active ? 'text-accent' : 'text-slate-500'}>
      <line x1="3" y1="4" x2="13" y2="4" />
      <line x1="3" y1="8" x2="13" y2="8" />
      <line x1="3" y1="12" x2="13" y2="12" />
    </svg>
  )
}

export default function Squad() {
  const { data, isLoading, error } = useSuggestedSquad()
  const { squad, captain, viceCaptain, formationCounts, boosterStates, setSquad, setCaptain, setViceCaptain, setFormationCounts } = useSquadStore()
  const { squadViewMode: viewMode, setSquadViewMode: setViewMode, setWcOnboardingOpen } = useAppStore()
  const currentRound = useCurrentRound()
  const round = currentRound?.id ?? 1
  const { data: projections } = useProjections(round)
  const { data: teams } = useTeams()

  const [selectedPlayer, setSelectedPlayer] = useState<SquadPlayer | null>(null)
  const [swapSource, setSwapSource] = useState<SquadPlayer | null>(null)
  const [addPosition, setAddPosition] = useState<string | null>(null)

  useEffect(() => {
    if (!data?.squad_json) return
    const isCorrupt = squad.length > 0 &&
      new Set(squad.map(p => p.element)).size !== squad.length
    if (squad.length === 0 || isCorrupt) {
      // Pre-sort by xP within each position so array order = starter order for getXI
      const byPos: Record<string, SquadPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] }
      for (const p of data.squad_json) byPos[p.position]?.push(p)
      const sorted = ['GK', 'DEF', 'MID', 'FWD'].flatMap(
        (pos) => [...(byPos[pos] ?? [])].sort((a, b) => b.xp - a.xp)
      )
      setSquad(sorted)
      if (captain === null) {
        const { xi } = getXI(sorted, { GK: 1, DEF: 4, MID: 4, FWD: 2 })
        const top = [...xi].sort((a, b) => b.xp - a.xp)[0]
        if (top) setCaptain(top.element)
      }
    }
  }, [data, squad.length, squad, setSquad, setCaptain, captain])

  if (isLoading) return <Spinner label="Loading squad…" />

  if (error || !data) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center">
        <p className="text-slate-400">Squad is being computed. Check back soon.</p>
      </div>
    )
  }

  const displaySquad = squad.length > 0 ? squad : data.squad_json
  const activeCaptain = captain ?? [...displaySquad].sort((a, b) => b.xp - a.xp)[0]?.element
  const { xi, bench } = getXI(displaySquad, { GK: 1, ...formationCounts })
  const selectedIsBench = bench.some((p) => p.element === selectedPlayer?.element)

  const eligibleElements = useMemo(() => {
    if (!swapSource) return new Set<number>()
    if (swapSource.position === 'GK') {
      return new Set([...xi, ...bench].filter(p => p.position === 'GK' && p.element !== swapSource.element).map(p => p.element))
    }
    const currentDEF = xi.filter(p => p.position === 'DEF').length
    const currentMID = xi.filter(p => p.position === 'MID').length
    const currentFWD = xi.filter(p => p.position === 'FWD').length
    const sourceIsXI = xi.some(p => p.element === swapSource.element)
    const candidates = sourceIsXI ? bench : xi
    const result: number[] = []
    for (const p of candidates) {
      if (p.position === 'GK' || p.element === swapSource.element) continue
      const out = sourceIsXI ? swapSource : p
      const into = sourceIsXI ? p : swapSource
      const newDEF = currentDEF - (out.position === 'DEF' ? 1 : 0) + (into.position === 'DEF' ? 1 : 0)
      const newMID = currentMID - (out.position === 'MID' ? 1 : 0) + (into.position === 'MID' ? 1 : 0)
      const newFWD = currentFWD - (out.position === 'FWD' ? 1 : 0) + (into.position === 'FWD' ? 1 : 0)
      if (newDEF >= 3 && newMID >= 2 && newFWD >= 1) result.push(p.element)
    }
    return new Set(result)
  }, [swapSource, xi, bench])

  const totalCost = displaySquad.reduce((s, p) => s + p.price, 0)
  const budgetPct = Math.min(100, (totalCost / 100) * 100)

  const eliminatedSquadIds = new Set(
    (teams ?? []).filter(t => !t.is_active).map(t => t.squad_id)
  )
  const eliminatedInSquad = displaySquad.filter(p => eliminatedSquadIds.has(p.squad_id))

  const countByTeam: Record<string, number> = {}
  displaySquad.forEach((p) => { countByTeam[p.team_abbr] = (countByTeam[p.team_abbr] ?? 0) + 1 })
  const phase = roundPhase(currentRound?.stage ?? '')
  const overLimit = Object.entries(countByTeam).filter(([, n]) => n > COUNTRY_LIMIT[phase])

  function handleSwap(source: SquadPlayer, replacement: SquadPlayer) {
    setSquad(swapInSquad(displaySquad, source.element, replacement.element))
    if (source.position !== replacement.position && source.position !== 'GK' && replacement.position !== 'GK') {
      const sourceIsXI = xi.some(p => p.element === source.element)
      const movingOut = sourceIsXI ? source : replacement
      const movingIn = sourceIsXI ? replacement : source
      setFormationCounts({
        DEF: formationCounts.DEF - (movingOut.position === 'DEF' ? 1 : 0) + (movingIn.position === 'DEF' ? 1 : 0),
        MID: formationCounts.MID - (movingOut.position === 'MID' ? 1 : 0) + (movingIn.position === 'MID' ? 1 : 0),
        FWD: formationCounts.FWD - (movingOut.position === 'FWD' ? 1 : 0) + (movingIn.position === 'FWD' ? 1 : 0),
      })
    }
    setSwapSource(null)
  }

  function onPitchPlayerClick(p: SquadPlayer) {
    if (!swapSource) {
      setSwapSource(p)
      return
    }
    if (p.element === swapSource.element) {
      setSwapSource(null)
      return
    }
    if (eligibleElements.has(p.element)) {
      handleSwap(swapSource, p)
      return
    }
    // Ineligible — re-select as new source
    setSwapSource(p)
  }

  function handleOptimiseXI() {
    const { squad: optimised, formation } = optimiseXI(displaySquad)
    setSquad(optimised)
    setFormationCounts(formation)
    const { xi: newXI } = getXI(optimised, { GK: 1, ...formation })
    const sorted = [...newXI].sort((a, b) => b.xp - a.xp)
    if (sorted[0]) setCaptain(sorted[0].element)
    if (sorted[1]) setViceCaptain(sorted[1].element)
  }

  function handleAdd(inPlayer: SquadPlayer) {
    const updated = [...displaySquad, inPlayer]
    updated.sort((a, b) => {
      const diff = POS_ORDER.indexOf(a.position) - POS_ORDER.indexOf(b.position)
      return diff !== 0 ? diff : b.xp - a.xp
    })
    setSquad(updated)
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">My Squad</h1>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-700 p-0.5">
            <button
              onClick={() => setViewMode('pitch')}
              className={clsx('rounded p-1.5 transition-colors', viewMode === 'pitch' ? 'bg-slate-700' : 'hover:bg-slate-800')}
              title="Pitch view"
            >
              <PitchIcon active={viewMode === 'pitch'} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={clsx('rounded p-1.5 transition-colors', viewMode === 'list' ? 'bg-slate-700' : 'hover:bg-slate-800')}
              title="List view"
            >
              <ListIcon active={viewMode === 'list'} />
            </button>
          </div>
          <button
            onClick={handleOptimiseXI}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-accent/50 hover:text-accent"
            title="Optimise starting XI across 8 formations"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 1l1.5 3h3l-2.4 1.8.9 3L6 7.2 3 8.8l.9-3L1.5 4h3z" />
            </svg>
            <span className="hidden sm:inline">{formationCounts.DEF}-{formationCounts.MID}-{formationCounts.FWD}</span>
          </button>
        </div>
      </div>

      {/* Eliminated players notification */}
      {eliminatedInSquad.length > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-700/40 bg-amber-900/10 px-3 py-2.5">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 mt-0.5 text-amber-500">
            <path d="M7 1L13 12H1L7 1z" strokeLinejoin="round" />
            <path d="M7 5.5v3M7 10v.5" strokeLinecap="round" />
          </svg>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-amber-400">
              {eliminatedInSquad.length} eliminated player{eliminatedInSquad.length > 1 ? 's' : ''} in your squad
            </p>
            <p className="mt-0.5 text-xs text-amber-600/80 truncate">
              {eliminatedInSquad.map(p => p.name).join(', ')} — head to Transfers to replace {eliminatedInSquad.length > 1 ? 'them' : 'them'}.
            </p>
          </div>
        </div>
      )}

      {/* Unrecognised players notification */}
      <UnmatchedBanner showTransferLink />

      {/* Stat cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Total xP" value={data.total_xp.toFixed(1)} sub="round 1 projected" />
        <StatCard label="Squad Cost" value={`£${totalCost.toFixed(1)}m`} sub="of £100m" />
        <StatCard label="Players" value={String(displaySquad.length)} sub="selected" />
      </div>

      {/* Budget bar */}
      <div className="mb-3">
        <div className="mb-1 flex justify-between text-xs text-slate-500">
          <span>Budget used</span>
          <span className={budgetPct > 95 ? 'text-rose-400' : 'text-slate-400'}>
            £{totalCost.toFixed(1)}m <span className="text-slate-600">/ £100m</span>
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-800">
          <div
            className={clsx('h-full rounded-full transition-all', budgetPct > 95 ? 'bg-rose-500' : 'bg-accent')}
            style={{ width: `${budgetPct}%` }}
          />
        </div>
      </div>

      {/* Active booster indicator */}
      {(() => {
        const BOOSTER_NAMES: Record<string, string> = {
          wildcard: 'Wildcard', max_captain: 'Maximum Captain',
          '12th_man': '12th Man', qual_booster: 'Qualification Booster', cs_shield: 'Clean Sheet Shield',
        }
        const active = Object.entries(boosterStates ?? {}).find(([, s]) => s === 'active')
        if (!active) return null
        return (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-accent/20 bg-accent/5 px-3 py-2 text-xs text-accent">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0" aria-hidden>
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            Active booster: <span className="font-semibold">{BOOSTER_NAMES[active[0]] ?? active[0]}</span>
          </div>
        )
      })()}

      {/* Country limit warnings */}
      {overLimit.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-yellow-800/30 bg-yellow-900/10 px-3 py-2">
          <span className="text-xs text-yellow-600">Country limit:</span>
          {overLimit.map(([abbr, count]) => (
            <span key={abbr} className="rounded bg-yellow-900/30 px-1.5 py-0.5 text-xs font-semibold text-yellow-300">
              {abbr} ×{count}
            </span>
          ))}
          <span className="text-xs text-yellow-700">max 3 in group stage</span>
        </div>
      )}

      {/* Pitch view */}
      {viewMode === 'pitch' && (
        <>
          <Pitch
            players={displaySquad}
            projections={projections ?? []}
            round={round}
            captain={activeCaptain ?? null}
            viceCaptain={viceCaptain ?? null}
            posCount={{ GK: 1, ...formationCounts }}
            eliminatedSquadIds={eliminatedSquadIds}
            swapSourceElement={swapSource?.element}
            eligibleElements={eligibleElements}
            onPlayerClick={onPitchPlayerClick}
            onEmptySlotClick={(pos) => setAddPosition(pos)}
          />
          {swapSource && (
            <div className="mt-3 flex justify-center">
              <button
                onClick={() => setSwapSource(null)}
                className="flex items-center gap-1.5 rounded-full border border-slate-600 bg-slate-800 px-4 py-1.5 text-xs text-slate-300 hover:border-slate-500 hover:text-slate-100 transition-colors"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M1 1l8 8M9 1L1 9" />
                </svg>
                Cancel swap
              </button>
            </div>
          )}
        </>
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          {POS_ORDER.map((pos) => {
            const posPlayers = displaySquad.filter((p) => p.position === pos)
            if (!posPlayers.length) return null
            return (
              <div key={pos}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {pos} <span className="font-normal">· {posPlayers.length}</span>
                </h2>
                <div className="space-y-1.5">
                  {posPlayers.map((p) => (
                    <PlayerCard
                      key={p.element}
                      player={p}
                      isCaptain={p.element === activeCaptain}
                      eliminated={eliminatedSquadIds.has(p.squad_id)}
                      onClick={() => setSelectedPlayer(p)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-6 flex justify-center">
        <button
          onClick={() => setWcOnboardingOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-500 transition hover:border-slate-600 hover:text-slate-300"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M10 6A4 4 0 1 1 6 2" />
            <path d="M10 2v4H6" />
          </svg>
          Re-sync squad
        </button>
      </div>

      <PlayerProfileModal
        player={selectedPlayer}
        onClose={() => setSelectedPlayer(null)}
        onSubOut={() => setSelectedPlayer(null)}
        isBench={selectedIsBench}
      />

      {addPosition && (
        <BrowseAllModal
          squad={displaySquad}
          round={round}
          budget={100}
          onSwap={() => {}}
          onClose={() => setAddPosition(null)}
          addPosition={addPosition}
          onAdd={(p) => { handleAdd(p); setAddPosition(null) }}
        />
      )}
    </div>
  )
}
