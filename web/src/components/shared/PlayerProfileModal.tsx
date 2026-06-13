import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import type { SquadPlayer, Fixture } from '../../types/wc'
import { usePlayerProjectionsAllRounds, usePlayers, useFixtures } from '../../hooks/useWC'
import { useSquadStore } from '../../store/squadStore'
import RoundXpChart from './RoundXpChart'
import { SCORING } from '../../config/gameRules'

const POS_LABEL: Record<string, string> = {
  GK: 'GK', DEF: 'DEF', MID: 'MID', FWD: 'FWD',
}

const ROUND_LABEL: Record<number, string> = {
  1: 'Round 1', 2: 'Round 2', 3: 'Round 3',
  4: 'Round of 32', 5: 'Round of 16', 6: 'Quarter-final', 7: 'Semi-final', 8: 'Final',
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  } catch {
    return dateStr
  }
}

function JerseyPlaceholder({ abbr }: { abbr: string }) {
  return (
    <div className="flex h-20 w-16 flex-col items-center justify-center rounded-lg bg-white/20">
      <svg viewBox="0 0 40 48" className="h-12 w-10 fill-white/40">
        <path d="M14 2L2 10l4 8 4-2v30h20V16l4 2 4-8L26 2h-12z" />
      </svg>
      <span className="mt-0.5 text-[9px] font-bold tracking-widest text-white/70">{abbr}</span>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-white/[0.08] bg-slate-800/50 backdrop-blur-sm px-2 py-3">
      <span className="text-base font-bold font-mono tabular-nums text-slate-100">{value}</span>
      <span className="mt-0.5 text-[10px] text-slate-500">{label}</span>
    </div>
  )
}

function FixtureRow({ fixture, squadId }: { fixture: Fixture; squadId: number }) {
  const isHome = fixture.homeTeamId === squadId
  const ourTeam = isHome ? fixture.homeTeamName : fixture.awayTeamName
  const opponent = isHome ? fixture.awayTeamName : fixture.homeTeamName

  return (
    <div className="flex items-center gap-2 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate font-medium text-slate-100">{ourTeam}</span>
      {fixture.kickoff ? (
        <span className="shrink-0 rounded border border-accent/40 px-2 py-0.5 text-xs font-medium text-accent">
          {fixture.kickoff}
        </span>
      ) : (
        <span className="shrink-0 text-slate-600">vs</span>
      )}
      <span className="min-w-0 flex-1 truncate text-right text-slate-400">{opponent}</span>
    </div>
  )
}

function ModalContent({ player, onClose, onSubOut, isBench }: { player: SquadPlayer; onClose: () => void; onSubOut?: (p: SquadPlayer) => void; isBench?: boolean }) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'overview' | 'fixtures'>('overview')
  const { captain, viceCaptain, setCaptain, setViceCaptain } = useSquadStore()

  const allRounds = usePlayerProjectionsAllRounds(player.element)
  const { data: players } = usePlayers()
  const { data: fixtures, isLoading: fixturesLoading } = useFixtures(player.squad_id)

  const fullPlayer = players?.find((p) => p.element === player.element)
  const pct = fullPlayer?.percent_selected

  const r1 = allRounds[0]
  const totalXp = allRounds.reduce((s, r) => s + r.xp, 0)
  const chartData = allRounds.map((r) => ({ round: r.round, xp: r.xp }))

  const isCaptain = captain === player.element
  const isViceCaptain = viceCaptain === player.element

  const nextFixture = fixtures?.[0]
  const nextOpponent = nextFixture
    ? (nextFixture.homeTeamId === player.squad_id ? nextFixture.awayTeamName : nextFixture.homeTeamName)
    : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="relative flex max-h-[90vh] w-full max-w-sm flex-col overflow-hidden rounded-t-2xl shadow-2xl sm:rounded-2xl"
        style={{ boxShadow: '0 8px 48px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.06)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative bg-gradient-to-br from-[#0d1f3c] via-[#0a1628] to-slate-950 px-4 pb-4 pt-4 border-b border-white/[0.06]">
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-white/40 text-white/80 hover:bg-white/20"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 1l10 10M11 1L1 11" />
            </svg>
          </button>
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-bold leading-tight text-white">{player.name}</h2>
              <p className="mt-0.5 text-sm text-white/80">{player.team_abbr}</p>
              <p className="text-sm text-white/70">
                {POS_LABEL[player.position]} | £{player.price.toFixed(1)}m
              </p>
              {pct != null && (
                <p className="text-xs text-white/60">MD selection: {pct.toFixed(1)}%</p>
              )}
            </div>
            <JerseyPlaceholder abbr={player.team_abbr} />
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex bg-slate-950/90 border-b border-white/[0.06]">
          {(['overview', 'fixtures'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? 'border-b-2 border-accent text-white'
                  : 'border-b-2 border-transparent text-slate-500 hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto bg-slate-950/95 px-4 pb-2 pt-3">
          {activeTab === 'overview' && (
            <div className="space-y-3">
              {/* Captain / Vice-captain */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setCaptain(player.element)}
                  className={`rounded-xl py-2.5 text-sm font-bold uppercase tracking-wide transition-colors ${
                    isCaptain
                      ? 'bg-accent text-accent-fg'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Captain
                </button>
                <button
                  onClick={() => setViceCaptain(player.element)}
                  className={`rounded-xl py-2.5 text-sm font-bold uppercase tracking-wide transition-colors ${
                    isViceCaptain
                      ? 'border-2 border-accent bg-slate-700 text-accent'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Vice-Captain
                </button>
              </div>

              {/* 2×2 stats grid */}
              <div className="grid grid-cols-2 gap-2">
                <StatBox
                  label="Next fixture"
                  value={nextOpponent ? `v ${nextOpponent.slice(0, 10)}` : '—'}
                />
                <StatBox
                  label="% Selected"
                  value={pct != null ? `${pct.toFixed(1)}%` : '—'}
                />
                <StatBox
                  label="xP Round 1"
                  value={r1?.loading ? '…' : (r1?.xp ?? player.xp).toFixed(1)}
                />
                <StatBox
                  label="Total xP"
                  value={allRounds.some((r) => r.loading) ? '…' : totalXp.toFixed(1)}
                />
              </div>

              {/* xP chart */}
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                  xP by Round
                </p>
                {allRounds.some((r) => r.loading) ? (
                  <div className="flex h-16 items-center justify-center text-xs text-slate-500">Loading…</div>
                ) : (
                  <RoundXpChart data={chartData} />
                )}
              </div>

              {/* xP breakdown — model-derived components for round 1 */}
              {r1 && !r1.loading && r1.xp > 0 && (() => {
                const pos = player.position as keyof typeof SCORING.GOAL_PTS
                const goalXp = r1.p_goal > 0 ? -Math.log(1 - Math.min(r1.p_goal, 0.9999)) * (SCORING.GOAL_PTS[pos] ?? 5) : 0
                const csXp = r1.p_cs * (SCORING.CLEAN_SHEET_PTS[pos] ?? 0)
                const appXp = SCORING.APPEARANCE_PART * Math.min(1, r1.mf + 0.15) + SCORING.APPEARANCE_PART * r1.mf
                const otherXp = r1.xp - goalXp - csXp - appXp
                const rows: { label: string; pts: number }[] = [
                  { label: 'Goals (exp.)', pts: goalXp },
                  { label: 'Clean sheet', pts: csXp },
                  { label: 'Appearance', pts: appXp },
                  ...(Math.abs(otherXp) > 0.05 ? [{ label: player.position === 'GK' ? 'Saves / deductions' : 'Assists / deductions', pts: otherXp }] : []),
                ].filter(r => Math.abs(r.pts) > 0.01)
                return rows.length > 0 ? (
                  <div>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                      xP Breakdown (R1)
                    </p>
                    <div className="divide-y divide-white/[0.04] rounded-lg border border-white/[0.07] bg-slate-900/60 text-xs backdrop-blur-sm">
                      {rows.map(({ label, pts }) => (
                        <div key={label} className="flex items-center justify-between px-3 py-1.5">
                          <span className="text-slate-400">{label}</span>
                          <span className={pts < 0 ? 'font-medium text-rose-400' : 'font-medium text-slate-200'}>
                            {pts > 0 ? '+' : ''}{pts.toFixed(2)}
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between px-3 py-1.5">
                        <span className="font-semibold text-slate-300">Total xP</span>
                        <span className="font-bold text-accent">{r1.xp.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                ) : null
              })()}
            </div>
          )}

          {activeTab === 'fixtures' && (
            <div>
              {fixturesLoading && (
                <div className="flex h-20 items-center justify-center text-xs text-slate-500">Loading fixtures…</div>
              )}
              {!fixturesLoading && (!fixtures || fixtures.length === 0) && (
                <p className="py-6 text-center text-sm text-slate-500">Fixtures unavailable</p>
              )}
              {!fixturesLoading && fixtures && fixtures.length > 0 && (
                <div className="space-y-3">
                  {fixtures.map((fix) => (
                    <div key={fix.round}>
                      <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                        {ROUND_LABEL[fix.round] ?? `Round ${fix.round}`}
                        {fix.date && (
                          <span className="ml-2 font-normal normal-case">| {formatDate(fix.date)}</span>
                        )}
                      </p>
                      <div className="rounded-lg border border-white/[0.07] bg-slate-900/60 backdrop-blur-sm px-3">
                        <FixtureRow fixture={fix} squadId={player.squad_id} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom actions */}
        <div className="space-y-2 bg-slate-950/95 border-t border-white/[0.06] px-4 pb-4 pt-2">
          {activeTab === 'overview' && (
            <>
              <button
                onClick={() => onSubOut ? onSubOut(player) : onClose()}
                className="w-full rounded-xl border border-white/[0.1] bg-slate-800/60 py-2.5 text-sm font-bold uppercase tracking-wide text-slate-200 transition hover:border-white/20 hover:bg-slate-700/60"
              >
                {isBench ? 'Sub In' : 'Sub Out'}
              </button>
              <button
                onClick={() => { navigate('/transfers'); onClose() }}
                className="w-full rounded-xl bg-accent py-2.5 text-sm font-bold uppercase tracking-wide text-accent-fg transition hover:opacity-90 hover:shadow-glow-gold"
              >
                Transfer Out
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

interface Props {
  player: SquadPlayer | null
  onClose: () => void
  onSubOut?: (player: SquadPlayer) => void
  isBench?: boolean
}

export default function PlayerProfileModal({ player, onClose, onSubOut, isBench }: Props) {
  if (!player) return null
  return createPortal(
    <ModalContent player={player} onClose={onClose} onSubOut={onSubOut} isBench={isBench} />,
    document.body,
  )
}
