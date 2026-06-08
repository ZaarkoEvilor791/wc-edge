import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSquadStore } from '../store/squadStore'
import { useAppStore } from '../store/appStore'
import { useTransferSuggest, useCurrentRound, useRounds, useTeams, useProjections } from '../hooks/useWC'
import { roundPhase } from '../domain/squadValidator'
import type { RoundPhase } from '../domain/squadValidator'
import type { TransferSuggestion, SquadPlayer, TransferCard } from '../types/wc'
import { POS_ORDER } from '../config/gameRules'
import BrowseAllModal from '../components/shared/BrowseAllModal'
import JerseyIcon from '../components/shared/JerseyIcon'
import { getKit } from '../data/teamColors'
import Pitch from '../components/shared/Pitch'
import UnmatchedBanner from '../components/shared/UnmatchedBanner'

const POS_COLOR: Record<string, string> = {
  GK: 'text-yellow-400',
  DEF: 'text-blue-400',
  MID: 'text-green-400',
  FWD: 'text-red-400',
}

const FREE_TRANSFERS_BY_PHASE: Record<RoundPhase, number> = {
  group: 2, r32: 6, r16: 4, qf: 4, sf: 5, final: 6,
}

// ---- Squad list ----

function SquadList({
  squad,
  eliminatedSquadIds,
  onSelectOut,
}: {
  squad: SquadPlayer[]
  eliminatedSquadIds: Set<number>
  onSelectOut: (p: SquadPlayer) => void
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
      {POS_ORDER.map((pos) => {
        const players = squad.filter((p) => p.position === pos)
        if (players.length === 0) return null
        return (
          <div key={pos}>
            <p className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-950/40">
              {pos}
            </p>
            {players.map((p) => (
              <button
                key={p.element}
                onClick={() => onSelectOut(p)}
                className="w-full flex items-center gap-3 px-4 py-3 border-b border-slate-800/60 hover:bg-slate-800 text-left group last:border-0"
              >
                <div className="shrink-0">
                  <JerseyIcon {...getKit(p.team_abbr)} size={22} eliminated={eliminatedSquadIds.has(p.squad_id)} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100 flex items-center gap-2">
                    {p.name}
                    {eliminatedSquadIds.has(p.squad_id) && (
                      <span className="rounded px-1.5 py-0.5 text-xs bg-slate-700 text-slate-400">
                        Eliminated
                      </span>
                    )}
                  </p>
                  <p className={`text-xs font-semibold ${POS_COLOR[p.position]}`}>{p.team_abbr}</p>
                </div>
                <div className="ml-3 flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-bold text-accent">{p.xp.toFixed(1)} xP</p>
                    <p className="text-xs text-slate-400">£{p.price.toFixed(1)}m</p>
                  </div>
                  <svg
                    className="h-4 w-4 text-slate-600 group-hover:text-slate-400 transition-colors"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ---- Suggestion preview ----

function SuggestionsPreview({
  suggestions,
  currentIndex,
}: {
  suggestions: TransferSuggestion[]
  currentIndex: number
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {suggestions.length} suggestion{suggestions.length > 1 ? 's' : ''}
      </p>
      <div className="space-y-1">
        {suggestions.map((s, i) => {
          const isPast = i < currentIndex
          const isCurrent = i === currentIndex
          return (
            <div
              key={i}
              className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors ${
                isCurrent ? 'bg-slate-800 text-slate-100' : 'text-slate-500'
              }`}
            >
              <span className={isPast ? 'line-through opacity-40' : ''}>
                {s.out.name}
                <span className="mx-1.5 text-slate-600">→</span>
                {s.in.name}
              </span>
              <span className={`ml-2 shrink-0 font-semibold ${isCurrent ? 'text-accent' : ''}`}>
                +{s.xp_gain.toFixed(1)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---- Swap player card (used in smart suggest flow) ----

function SwapPlayerCard({
  player,
  variant,
  eliminated = false,
}: {
  player: TransferCard
  variant: 'out' | 'in'
  eliminated?: boolean
}) {
  const border = variant === 'out' ? 'border-rose-700/60' : 'border-emerald-600/60'
  const bg = variant === 'out' ? 'bg-rose-950/30' : 'bg-emerald-950/30'
  const label = variant === 'out' ? 'OUT' : 'IN'
  const labelColor = variant === 'out' ? 'text-rose-400' : 'text-emerald-400'

  return (
    <div className={`flex-1 rounded-xl border ${border} ${bg} p-4 min-w-0`}>
      <div className="mb-2 flex items-center gap-2">
        <p className={`text-xs font-bold tracking-widest ${labelColor}`}>{label}</p>
        {eliminated && (
          <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-400">
            Eliminated
          </span>
        )}
      </div>
      <p className="truncate text-base font-semibold text-slate-100">{player.name}</p>
      <p className="mt-0.5 text-xs text-slate-400">
        {player.team_abbr}
        <span className={`ml-1.5 font-semibold ${POS_COLOR[player.position]}`}>{player.position}</span>
      </p>
      <div className="mt-3 flex items-end justify-between">
        <span className="text-lg font-bold text-accent">
          {player.xp.toFixed(1)} <span className="text-xs font-normal text-slate-400">xP</span>
        </span>
        <span className="text-sm text-slate-300">£{player.price.toFixed(1)}m</span>
      </div>
    </div>
  )
}

// ---- Smart suggest swap card ----

function SwapCard({
  suggestion,
  index,
  total,
  freeTransfers,
  canUndo,
  eliminatedSquadIds,
  onAccept,
  onPass,
  onUndo,
}: {
  suggestion: TransferSuggestion
  index: number
  total: number
  freeTransfers: number
  canUndo: boolean
  eliminatedSquadIds: Set<number>
  onAccept: () => void
  onPass: () => void
  onUndo: () => void
}) {
  const priceDeltaSign = suggestion.price_delta >= 0 ? '+' : ''
  const priceDeltaColor = suggestion.price_delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
  const isCostly = index >= freeTransfers
  const outEliminated = eliminatedSquadIds.has(suggestion.out.squad_id)

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Suggestion {index + 1} of {total}</span>
          {isCostly && (
            <span className="rounded-full bg-rose-900/50 px-2.5 py-1 text-xs font-bold text-rose-400">
              −3 pts
            </span>
          )}
        </div>
        <div className="flex gap-3">
          <span className="rounded-full bg-accent/15 px-3 py-1 text-sm font-bold text-accent">
            +{suggestion.xp_gain.toFixed(1)} xP
          </span>
          <span className={`rounded-full bg-slate-800 px-3 py-1 text-sm font-medium ${priceDeltaColor}`}>
            {priceDeltaSign}£{Math.abs(suggestion.price_delta).toFixed(1)}m
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <SwapPlayerCard player={suggestion.out} variant="out" eliminated={outEliminated} />
        <svg className="h-6 w-6 flex-shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
        </svg>
        <SwapPlayerCard player={suggestion.in} variant="in" />
      </div>

      <div className="mt-5 grid gap-3" style={{ gridTemplateColumns: canUndo ? 'auto 1fr 1fr' : '1fr 1fr' }}>
        {canUndo && (
          <button
            onClick={onUndo}
            className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200"
            title="Undo last accepted transfer"
          >
            ↩ Undo
          </button>
        )}
        <button
          onClick={onPass}
          title="Pass on this suggestion — not undoable"
          className="rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
        >
          Pass
        </button>
        <button
          onClick={onAccept}
          className="rounded-xl bg-accent py-2.5 text-sm font-bold text-accent-fg transition-opacity hover:opacity-90"
        >
          Accept
        </button>
      </div>
    </div>
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

// ---- Main page ----

export default function Transfers() {
  const navigate = useNavigate()
  const { squad, setSquad, budget, captain } = useSquadStore()
  const currentRound = useCurrentRound()
  const { data: rounds } = useRounds()
  const [selectedRound, setSelectedRound] = useState<number | null>(null)
  const [freeTransfers, setFreeTransfers] = useState(2)
  const [ftAutoSet, setFtAutoSet] = useState(false)
  const [suggestions, setSuggestions] = useState<TransferSuggestion[] | null>(null)
  const [index, setIndex] = useState(0)
  const [accepted, setAccepted] = useState<TransferSuggestion[]>([])
  const [skipped, setSkipped] = useState<TransferSuggestion[]>([])
  const [prevSquads, setPrevSquads] = useState<SquadPlayer[][]>([])
  const [manualOut, setManualOut] = useState<SquadPlayer | null>(null)
  const [showBrowseAll, setShowBrowseAll] = useState(false)
  const { squadViewMode: viewMode, setSquadViewMode: setViewMode } = useAppStore()

  const { mutate: suggest, isPending } = useTransferSuggest()
  const { data: teams } = useTeams()

  const round = selectedRound ?? currentRound?.id ?? 1
  const { data: projections } = useProjections(round)
  const hasSquad = squad.length > 0

  const eliminatedSquadIds = new Set(
    (teams ?? []).filter(t => !t.is_active).map(t => t.squad_id)
  )

  // Auto-populate free transfers from round stage
  useEffect(() => {
    if (currentRound && !ftAutoSet) {
      setFreeTransfers(FREE_TRANSFERS_BY_PHASE[roundPhase(currentRound.stage)])
      setFtAutoSet(true)
    }
  }, [currentRound, ftAutoSet])

  function handleRoundChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newRound = Number(e.target.value)
    setSelectedRound(newRound)
    const r = rounds?.find(r => r.id === newRound)
    if (r) setFreeTransfers(FREE_TRANSFERS_BY_PHASE[roundPhase(r.stage)])
  }

  function analyze() {
    if (!hasSquad) return
    suggest(
      { squad: squad.map((p) => p.element), round, freeTransfers, budget },
      {
        onSuccess: (data) => {
          setSuggestions(data.transfers)
          setIndex(0)
          setSkipped([])
          setPrevSquads([])
        },
      },
    )
  }

  function handleAccept() {
    const s = suggestions![index]
    setPrevSquads((prev) => [...prev, squad])
    setAccepted((prev) => [...prev, s])
    const newSquad: SquadPlayer[] = squad.map((p) =>
      p.element === s.out.element
        ? { element: s.in.element, name: s.in.name, position: s.in.position,
            price: s.in.price, xp: s.in.xp, team_abbr: s.in.team_abbr,
            squad_id: s.in.squad_id, low_sample: s.in.low_sample }
        : p,
    )
    setSquad(newSquad)
    setIndex((i) => i + 1)
  }

  function handlePass() {
    setSkipped((prev) => [...prev, suggestions![index]])
    setIndex((i) => i + 1)
  }

  function handleUndo() {
    if (prevSquads.length === 0) return
    const prev = prevSquads[prevSquads.length - 1]
    setPrevSquads((s) => s.slice(0, -1))
    setSquad(prev)
    setAccepted((a) => a.slice(0, -1))
    setIndex((i) => Math.max(0, i - 1))
  }

  function handleManualSwap(inPlayer: SquadPlayer, outPlayer: SquadPlayer) {
    setPrevSquads((prev) => [...prev, squad])
    setSquad(squad.map((p) => (p.element === outPlayer.element ? inPlayer : p)))
    setAccepted((prev) => [...prev, {
      out: { element: outPlayer.element, name: outPlayer.name, position: outPlayer.position,
             price: outPlayer.price, xp: outPlayer.xp, team_abbr: outPlayer.team_abbr,
             squad_id: outPlayer.squad_id, low_sample: outPlayer.low_sample },
      in:  { element: inPlayer.element,  name: inPlayer.name,  position: inPlayer.position,
             price: inPlayer.price,  xp: inPlayer.xp,  team_abbr: inPlayer.team_abbr,
             squad_id: inPlayer.squad_id,  low_sample: inPlayer.low_sample },
      xp_gain: inPlayer.xp - outPlayer.xp,
      price_delta: outPlayer.price - inPlayer.price,
    }])
  }

  const isDone = suggestions !== null && index >= suggestions.length
  const canUndo = prevSquads.length > 0
  const totalXpGain = accepted.reduce((s, t) => s + t.xp_gain, 0)

  return (
    <div className="mx-auto max-w-lg space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Transfers</h1>
        <p className="mt-0.5 text-sm text-slate-400">Tap a player to transfer out, or use Smart suggest</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {rounds && rounds.length > 0 && (
          <select
            value={round}
            onChange={handleRoundChange}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>Round {r.id} — {r.stage}</option>
            ))}
          </select>
        )}

        <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
          <span className="text-sm text-slate-400">Free transfers</span>
          <button
            onClick={() => setFreeTransfers((n) => Math.max(1, n - 1))}
            className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:text-slate-100"
          >
            −
          </button>
          <span className="w-4 text-center text-sm font-semibold text-slate-100">{freeTransfers}</span>
          <button
            onClick={() => setFreeTransfers((n) => Math.min(6, n + 1))}
            className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:text-slate-100"
          >
            +
          </button>
        </div>

        <span className="text-sm text-slate-400">
          Budget: <span className="font-semibold text-slate-200">£{budget.toFixed(1)}m</span>
        </span>
      </div>

      {/* No squad */}
      {!hasSquad && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center">
          <p className="text-slate-400">No squad loaded. Go to Squad page first.</p>
        </div>
      )}

      {/* Unrecognised players notification */}
      <UnmatchedBanner />

      {/* Squad list — primary UI */}
      {hasSquad && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-300">Your Squad</p>
              {suggestions === null && (
                <div className="flex items-center gap-0.5 rounded-lg border border-slate-700 p-0.5">
                  <button
                    onClick={() => setViewMode('list')}
                    className={`rounded p-1.5 transition-colors ${viewMode === 'list' ? 'bg-slate-700' : 'hover:bg-slate-800'}`}
                    title="List view"
                  >
                    <ListIcon active={viewMode === 'list'} />
                  </button>
                  <button
                    onClick={() => setViewMode('pitch')}
                    className={`rounded p-1.5 transition-colors ${viewMode === 'pitch' ? 'bg-slate-700' : 'hover:bg-slate-800'}`}
                    title="Pitch view"
                  >
                    <PitchIcon active={viewMode === 'pitch'} />
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={analyze}
              disabled={isPending}
              className="rounded-lg bg-accent/15 px-3 py-1.5 text-xs font-bold text-accent hover:bg-accent/25 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Analyzing…' : '✦ Smart suggest'}
            </button>
          </div>

          {viewMode === 'list' ? (
            <SquadList
              squad={squad}
              eliminatedSquadIds={eliminatedSquadIds}
              onSelectOut={(p) => setManualOut(p)}
            />
          ) : (
            <Pitch
              players={squad}
              projections={projections ?? []}
              round={round}
              captain={captain ?? null}
              eliminatedSquadIds={eliminatedSquadIds}
              onPlayerClick={(p) => setManualOut(p)}
            />
          )}

          <button
            onClick={() => setShowBrowseAll(true)}
            className="w-full text-center text-xs text-slate-500 hover:text-slate-300 py-1 transition-colors"
          >
            Browse all available players →
          </button>
        </>
      )}

      {/* Smart suggest flow — suggestions preview + active swap card */}
      {suggestions !== null && suggestions.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-center">
          <p className="font-medium text-slate-100">Squad is already optimal</p>
          <p className="mt-1 text-sm text-slate-400">No profitable swaps found within budget</p>
          <button
            onClick={() => setSuggestions(null)}
            className="mt-4 rounded-xl border border-slate-700 bg-slate-800 px-5 py-2 text-sm text-slate-300 hover:bg-slate-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {suggestions !== null && suggestions.length > 0 && !isDone && (
        <>
          <SuggestionsPreview suggestions={suggestions} currentIndex={index} />
          <SwapCard
            suggestion={suggestions[index]}
            index={index}
            total={suggestions.length}
            freeTransfers={freeTransfers}
            canUndo={canUndo}
            eliminatedSquadIds={eliminatedSquadIds}
            onAccept={handleAccept}
            onPass={handlePass}
            onUndo={handleUndo}
          />
        </>
      )}

      {suggestions !== null && suggestions.length > 0 && isDone && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-center">
          <p className="text-sm text-slate-400">
            Smart suggest complete · {skipped.length} passed
          </p>
          <button
            onClick={() => setSuggestions(null)}
            className="mt-3 rounded-xl border border-slate-700 bg-slate-800 px-5 py-2 text-sm text-slate-300 hover:bg-slate-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Running transfer log */}
      {accepted.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Applied this session · <span className="text-accent">+{totalXpGain.toFixed(1)} xP</span>
          </p>
          <div className="space-y-0">
            {accepted.map((t, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 text-sm border-b border-slate-800/40 last:border-0">
                <span className="text-slate-400 line-through">{t.out.name}</span>
                <span className="mx-2 text-slate-600">→</span>
                <span className="text-slate-100">{t.in.name}</span>
                <span className="ml-auto pl-3 text-accent text-xs font-semibold">
                  {t.xp_gain >= 0 ? '+' : ''}{t.xp_gain.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            {canUndo && (
              <button
                onClick={handleUndo}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-800 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700"
              >
                ↩ Undo last
              </button>
            )}
            <button
              onClick={() => navigate('/squad')}
              className="flex-1 rounded-lg bg-accent py-2 text-xs font-bold text-accent-fg hover:opacity-90"
            >
              View Squad
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      {manualOut && (
        <BrowseAllModal
          squad={squad}
          round={round}
          budget={budget}
          initialOut={manualOut}
          onSwap={handleManualSwap}
          onClose={() => setManualOut(null)}
        />
      )}

      {showBrowseAll && (
        <BrowseAllModal
          squad={squad}
          round={round}
          budget={budget}
          onSwap={handleManualSwap}
          onClose={() => setShowBrowseAll(false)}
        />
      )}
    </div>
  )
}
