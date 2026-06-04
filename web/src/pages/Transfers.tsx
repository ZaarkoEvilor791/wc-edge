import { useState } from 'react'
import { useSquadStore } from '../store/squadStore'
import { useTransferSuggest, useCurrentRound, useRounds } from '../hooks/useWC'
import type { TransferSuggestion, SquadPlayer, TransferCard } from '../types/wc'

const POS_COLOR: Record<string, string> = {
  GK: 'text-yellow-400',
  DEF: 'text-blue-400',
  MID: 'text-green-400',
  FWD: 'text-red-400',
}

function SwapPlayerCard({
  player,
  variant,
}: {
  player: TransferCard
  variant: 'out' | 'in'
}) {
  const border = variant === 'out' ? 'border-rose-700/60' : 'border-emerald-600/60'
  const bg = variant === 'out' ? 'bg-rose-950/30' : 'bg-emerald-950/30'
  const label = variant === 'out' ? 'OUT' : 'IN'
  const labelColor = variant === 'out' ? 'text-rose-400' : 'text-emerald-400'

  return (
    <div className={`flex-1 rounded-xl border ${border} ${bg} p-4 min-w-0`}>
      <p className={`mb-2 text-xs font-bold tracking-widest ${labelColor}`}>{label}</p>
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

function SwapCard({
  suggestion,
  index,
  total,
  onAccept,
  onSkip,
}: {
  suggestion: TransferSuggestion
  index: number
  total: number
  onAccept: () => void
  onSkip: () => void
}) {
  const priceDeltaSign = suggestion.price_delta >= 0 ? '+' : ''
  const priceDeltaColor = suggestion.price_delta >= 0 ? 'text-emerald-400' : 'text-rose-400'

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          Suggestion {index + 1} of {total}
        </span>
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
        <SwapPlayerCard player={suggestion.out} variant="out" />
        <svg
          className="h-6 w-6 flex-shrink-0 text-slate-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
        </svg>
        <SwapPlayerCard player={suggestion.in} variant="in" />
      </div>

      <div className="mt-5 flex gap-3">
        <button
          onClick={onSkip}
          className="flex-1 rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
        >
          Skip
        </button>
        <button
          onClick={onAccept}
          className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-bold text-accent-fg transition-opacity hover:opacity-90"
        >
          Accept
        </button>
      </div>
    </div>
  )
}

function DoneState({
  accepted,
  skipped,
  onReset,
}: {
  accepted: TransferSuggestion[]
  skipped: TransferSuggestion[]
  onReset: () => void
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
      <div className="mb-1 text-3xl">
        {accepted.length > 0 ? '✓' : '—'}
      </div>
      <h2 className="mb-1 text-lg font-semibold text-slate-100">
        {accepted.length > 0 ? `${accepted.length} transfer${accepted.length > 1 ? 's' : ''} applied` : 'No transfers applied'}
      </h2>
      <p className="mb-5 text-sm text-slate-400">
        {accepted.length > 0
          ? `+${accepted.reduce((s, t) => s + t.xp_gain, 0).toFixed(1)} xP gained · ${skipped.length} skipped`
          : 'All suggestions skipped'}
      </p>

      {accepted.length > 0 && (
        <div className="mb-5 space-y-2 text-left">
          {accepted.map((t, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-slate-800 px-3 py-2 text-sm">
              <span className="text-slate-400 line-through">{t.out.name}</span>
              <span className="mx-2 text-slate-600">→</span>
              <span className="text-slate-100">{t.in.name}</span>
              <span className="ml-auto pl-3 text-accent">+{t.xp_gain.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onReset}
        className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700"
      >
        Analyze again
      </button>
    </div>
  )
}

export default function Transfers() {
  const { squad, setSquad, budget } = useSquadStore()
  const currentRound = useCurrentRound()
  const { data: rounds } = useRounds()
  const [selectedRound, setSelectedRound] = useState<number | null>(null)
  const [freeTransfers, setFreeTransfers] = useState(2)
  const [suggestions, setSuggestions] = useState<TransferSuggestion[] | null>(null)
  const [index, setIndex] = useState(0)
  const [accepted, setAccepted] = useState<TransferSuggestion[]>([])
  const [skipped, setSkipped] = useState<TransferSuggestion[]>([])

  const { mutate: suggest, isPending } = useTransferSuggest()

  const round = selectedRound ?? currentRound?.id ?? 1

  const hasSquad = squad.length > 0

  function analyze() {
    if (!hasSquad) return
    const elements = squad.map((p) => p.element)
    suggest(
      { squad: elements, round, freeTransfers, budget },
      {
        onSuccess: (data) => {
          setSuggestions(data.transfers)
          setIndex(0)
          setAccepted([])
          setSkipped([])
        },
      },
    )
  }

  function handleAccept() {
    const s = suggestions![index]
    setAccepted((prev) => [...prev, s])
    // update squad store: replace out with in
    const newSquad: SquadPlayer[] = squad.map((p) =>
      p.element === s.out.element
        ? {
            element: s.in.element,
            name: s.in.name,
            position: s.in.position,
            price: s.in.price,
            xp: s.in.xp,
            team_abbr: s.in.team_abbr,
            squad_id: s.in.squad_id,
            low_sample: s.in.low_sample,
          }
        : p,
    )
    setSquad(newSquad)
    advance()
  }

  function handleSkip() {
    setSkipped((prev) => [...prev, suggestions![index]])
    advance()
  }

  function advance() {
    setIndex((i) => i + 1)
  }

  function reset() {
    setSuggestions(null)
    setIndex(0)
    setAccepted([])
    setSkipped([])
  }

  const isDone = suggestions !== null && index >= suggestions.length

  return (
    <div className="mx-auto max-w-lg space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Transfers</h1>
        <p className="mt-0.5 text-sm text-slate-400">Sequential greedy advisor — best swap first</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {rounds && rounds.length > 0 && (
          <select
            value={round}
            onChange={(e) => setSelectedRound(Number(e.target.value))}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                Round {r.id} — {r.stage}
              </option>
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
      </div>

      {/* No squad state */}
      {!hasSquad && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center">
          <p className="text-slate-400">No squad loaded. Go to Squad page first.</p>
        </div>
      )}

      {/* Initial analyze button */}
      {hasSquad && suggestions === null && (
        <button
          onClick={analyze}
          disabled={isPending}
          className="w-full rounded-xl bg-accent py-3 text-sm font-bold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Analyzing…' : `Analyze ${freeTransfers} transfer${freeTransfers > 1 ? 's' : ''}`}
        </button>
      )}

      {/* Swap cards */}
      {suggestions !== null && !isDone && suggestions.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center">
          <p className="text-slate-100 font-medium">Your squad is already optimal</p>
          <p className="mt-1 text-sm text-slate-400">No profitable swaps found within budget</p>
          <button onClick={reset} className="mt-4 rounded-xl border border-slate-700 bg-slate-800 px-5 py-2 text-sm text-slate-300 hover:bg-slate-700">
            Try again
          </button>
        </div>
      )}

      {suggestions !== null && !isDone && suggestions.length > 0 && (
        <SwapCard
          suggestion={suggestions[index]}
          index={index}
          total={suggestions.length}
          onAccept={handleAccept}
          onSkip={handleSkip}
        />
      )}

      {isDone && (
        <DoneState accepted={accepted} skipped={skipped} onReset={reset} />
      )}
    </div>
  )
}
