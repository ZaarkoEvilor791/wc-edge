import { useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSquadFromScreenshot } from '../../hooks/useWC'
import { useSquadStore } from '../../store/squadStore'
import { getXI, normalizeSquad } from '../../utils/squad'
import { useAppStore } from '../../store/appStore'
import { wcApi } from '../../services/wcApi'
import type { SquadPlayer } from '../../types/wc'

type Step = 'idle' | 'wizard_style' | 'wizard_budget' | 'wizard_risk' | 'building' | 'upload' | 'processing' | 'success' | 'error'

type WizardVariant = 'max_xp' | 'value' | 'differential'

export function pickVariant(budget: string, risk: string): WizardVariant {
  if (risk === 'differential') return 'differential'
  if (budget === 'value') return 'value'
  return 'max_xp'
}

const VARIANT_LABELS: Record<WizardVariant, string> = {
  max_xp: 'top xP',
  value: 'value',
  differential: 'differential',
}

interface Props {
  open: boolean
  onClose: () => void
  startAtUpload?: boolean
}

function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // result is: "data:image/png;base64,AAAA..."
      const [header, base64] = result.split(',')
      const mimeType = header.replace('data:', '').replace(';base64', '')
      resolve({ base64, mimeType })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function ModalContent({ onClose, startAtUpload }: { onClose: () => void; startAtUpload?: boolean }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { setSquad, setCaptain, captain } = useSquadStore()
  const setUnmatchedNames = useAppStore((s) => s.setUnmatchedNames)
  const { mutateAsync: processScreenshot } = useSquadFromScreenshot()

  const [step, setStep] = useState<Step>(startAtUpload ? 'upload' : 'idle')
  const [matched, setMatched] = useState<SquadPlayer[]>([])
  const [unmatched, setUnmatched] = useState<string[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Wizard state
  const [wizardBudget, setWizardBudget] = useState('')
  const [wizardRisk, setWizardRisk] = useState('')

  const handleNewTeam = () => {
    setStep('wizard_style')
  }

  const handleBuildWithVariant = useCallback(async (budget: string, risk: string) => {
    setWizardRisk(risk)
    const variant = pickVariant(budget, risk)
    setStep('building')
    try {
      const result = await wcApi.suggestedSquadVariant(variant)
      const players = normalizeSquad(result.squad_json ?? [])
      setSquad(players)
      const { xi } = getXI(players, { GK: 1, DEF: 4, MID: 4, FWD: 2 })
      const xiElements = new Set(xi.map((p) => p.element))
      if (captain === null || !xiElements.has(captain)) {
        const top = [...xi].sort((a, b) => b.xp - a.xp)[0]
        if (top) setCaptain(top.element)
      }
      localStorage.setItem('wc-onboarded', '1')
      onClose()
      navigate('/squad')
    } catch {
      setErrorMsg('Could not load squad. Please try again.')
      setStep('error')
    }
  }, [captain, navigate, onClose, setCaptain, setSquad])

  const processFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please upload an image file (PNG, JPG, WebP).')
      setStep('error')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('Image too large. Please use a screenshot under 10MB.')
      setStep('error')
      return
    }
    setStep('processing')
    try {
      const { base64, mimeType } = await readFileAsBase64(file)
      const result = await processScreenshot({ imageBase64: base64, mimeType })
      if (result.matched.length === 0) {
        setErrorMsg("Couldn't find any players in this screenshot. Make sure your squad is visible.")
        setStep('error')
        return
      }
      setMatched(result.matched)
      setUnmatched(result.unmatched)
      setStep('success')
    } catch {
      setErrorMsg('Something went wrong processing your screenshot. Please try again.')
      setStep('error')
    }
  }, [processScreenshot])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const handleConfirmSquad = () => {
    const sorted = normalizeSquad(matched)
    setSquad(sorted)
    const { xi } = getXI(sorted, { GK: 1, DEF: 4, MID: 4, FWD: 2 })
    const xiElements = new Set(xi.map((p) => p.element))
    if (captain === null || !xiElements.has(captain)) {
      const top = [...xi].sort((a, b) => b.xp - a.xp)[0]
      if (top) setCaptain(top.element)
    }
    setUnmatchedNames(unmatched)
    localStorage.setItem('wc-onboarded', '1')
    onClose()
    if (location.pathname !== '/squad') navigate('/squad')
  }

  const previewNames = matched.slice(0, 5).map((p) => p.name).join(' · ')
  const remaining = matched.length - 5

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Welcome to wc-edge</h2>
            <p className="text-xs text-slate-500">FIFA World Cup 2026™ Fantasy Companion</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-400 hover:text-slate-100"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 2l12 12M14 2L2 14" />
            </svg>
          </button>
        </div>

        <div className="p-5">
          {/* ── IDLE ── */}
          {step === 'idle' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">How do you want to start?</p>
              <button
                onClick={handleNewTeam}
                className="flex w-full items-center gap-3 rounded-xl bg-accent px-4 py-3 text-left transition hover:opacity-90"
              >
                <span className="text-xl">🏆</span>
                <div>
                  <p className="text-sm font-semibold text-accent-fg">Build a new team</p>
                  <p className="text-xs text-accent-fg/70">Personalise your squad in 3 steps</p>
                </div>
              </button>
              <button
                onClick={() => setStep('upload')}
                className="flex w-full items-center gap-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-left transition hover:bg-slate-700"
              >
                <span className="text-xl">📸</span>
                <div>
                  <p className="text-sm font-semibold text-slate-100">I already have a team</p>
                  <p className="text-xs text-slate-500">Upload a screenshot to sync it</p>
                </div>
              </button>
            </div>
          )}

          {/* ── WIZARD: STYLE ── */}
          {step === 'wizard_style' && (
            <div className="space-y-4">
              <button
                onClick={() => setStep('idle')}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8 2L4 6l4 4" />
                </svg>
                Back
              </button>
              <div>
                <p className="text-xs text-slate-500 mb-1">Step 1 of 3</p>
                <p className="text-sm font-semibold text-slate-100">What's your playing style?</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'attacking', label: 'Attacking', icon: '⚡', desc: 'Goal-scorers & attackers from top teams' },
                  { id: 'balanced', label: 'Balanced', icon: '⚖️', desc: 'Mix of attackers and solid defenders' },
                  { id: 'defensive', label: 'Defensive', icon: '🛡️', desc: 'Clean sheets — keepers & defenders' },
                ].map(({ id, label, icon, desc }) => (
                  <button
                    key={id}
                    onClick={() => setStep('wizard_budget')}
                    className="flex flex-col items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-2 py-3 text-center transition hover:border-accent hover:bg-slate-700"
                  >
                    <span className="text-lg">{icon}</span>
                    <span className="text-xs font-medium text-slate-200">{label}</span>
                    <span className="text-[10px] leading-tight text-slate-500">{desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── WIZARD: BUDGET ── */}
          {step === 'wizard_budget' && (
            <div className="space-y-4">
              <button
                onClick={() => setStep('wizard_style')}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8 2L4 6l4 4" />
                </svg>
                Back
              </button>
              <div>
                <p className="text-xs text-slate-500 mb-1">Step 2 of 3</p>
                <p className="text-sm font-semibold text-slate-100">How do you want to spend?</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'premium', label: 'Premium', icon: '💎', desc: 'Spend big on Haaland, Mbappé & Co.' },
                  { id: 'balanced', label: 'Balanced', icon: '⚖️', desc: 'Stars mixed with smart budget picks' },
                  { id: 'value', label: 'Value', icon: '💡', desc: 'Maximise squad depth on a budget' },
                ].map(({ id, label, icon, desc }) => (
                  <button
                    key={id}
                    onClick={() => { setWizardBudget(id); setStep('wizard_risk') }}
                    className="flex flex-col items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-2 py-3 text-center transition hover:border-accent hover:bg-slate-700"
                  >
                    <span className="text-lg">{icon}</span>
                    <span className="text-xs font-medium text-slate-200">{label}</span>
                    <span className="text-[10px] leading-tight text-slate-500">{desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── WIZARD: RISK ── */}
          {step === 'wizard_risk' && (
            <div className="space-y-4">
              <button
                onClick={() => setStep('wizard_budget')}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8 2L4 6l4 4" />
                </svg>
                Back
              </button>
              <div>
                <p className="text-xs text-slate-500 mb-1">Step 3 of 3</p>
                <p className="text-sm font-semibold text-slate-100">Risk appetite?</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'safe', label: 'Safe', icon: '🔒', desc: 'Reliable starters, consistent points' },
                  { id: 'balanced', label: 'Balanced', icon: '⚖️', desc: 'Mix of safe and high-upside picks' },
                  { id: 'differential', label: 'Differential', icon: '🎲', desc: 'Unique picks most managers miss' },
                ].map(({ id, label, icon, desc }) => (
                  <button
                    key={id}
                    onClick={() => handleBuildWithVariant(wizardBudget, id)}
                    className="flex flex-col items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-2 py-3 text-center transition hover:border-accent hover:bg-slate-700"
                  >
                    <span className="text-lg">{icon}</span>
                    <span className="text-xs font-medium text-slate-200">{label}</span>
                    <span className="text-[10px] leading-tight text-slate-500">{desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── BUILDING ── */}
          {step === 'building' && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-accent" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-100">Building your squad…</p>
                <p className="mt-1 text-xs text-slate-500">
                  Finding {VARIANT_LABELS[pickVariant(wizardBudget, wizardRisk)]} picks…
                </p>
              </div>
            </div>
          )}

          {/* ── UPLOAD ── */}
          {step === 'upload' && (
            <div className="space-y-4">
              <button
                onClick={() => startAtUpload ? onClose() : setStep('idle')}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8 2L4 6l4 4" />
                </svg>
                {startAtUpload ? 'Cancel' : 'Back'}
              </button>
              <p className="text-sm text-slate-300">
                Take a screenshot of your squad on{' '}
                <a
                  href="https://play.fifa.com/fantasy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline"
                >
                  play.fifa.com/fantasy
                </a>{' '}
                and upload it here.
              </p>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-8 transition ${
                  dragOver ? 'border-accent bg-accent/5' : 'border-slate-700 hover:border-slate-500'
                }`}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-500">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p className="text-sm text-slate-400">Drop screenshot here or click to upload</p>
                <p className="text-xs text-slate-600">PNG, JPG, WebP · max 10MB</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileInput}
              />
            </div>
          )}

          {/* ── PROCESSING ── */}
          {step === 'processing' && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-accent" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-100">Reading your squad…</p>
                <p className="mt-1 text-xs text-slate-500">Edge is analysing your screenshot</p>
              </div>
            </div>
          )}

          {/* ── SUCCESS ── */}
          {step === 'success' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                    <polyline points="2 8 6 12 14 4" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-100">
                    Found {matched.length} player{matched.length !== 1 ? 's' : ''}
                  </p>
                  {unmatched.length > 0 && (
                    <p className="text-xs text-slate-500">
                      {unmatched.length} not recognised — filled with top xP pick{unmatched.length > 1 ? 's' : ''} for {unmatched.length > 1 ? 'those positions' : 'that position'}
                    </p>
                  )}
                </div>
              </div>
              <p className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300 leading-relaxed">
                {previewNames}{remaining > 0 ? ` · +${remaining} more` : ''}
              </p>
              <button
                onClick={handleConfirmSquad}
                className="w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-accent-fg transition hover:opacity-90"
              >
                View my squad →
              </button>
            </div>
          )}

          {/* ── ERROR ── */}
          {step === 'error' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-wc-red/30 bg-wc-red/10 px-4 py-3">
                <p className="text-sm text-slate-200">{errorMsg}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep('upload')}
                  className="flex-1 rounded-xl border border-slate-700 py-2 text-sm text-slate-300 hover:bg-slate-800"
                >
                  Try again
                </button>
                <button
                  onClick={handleNewTeam}
                  className="flex-1 rounded-xl bg-accent py-2 text-sm font-semibold text-accent-fg hover:opacity-90"
                >
                  Use optimal squad
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function OnboardingModal({ open, onClose, startAtUpload }: Props) {
  if (!open) return null
  return createPortal(<ModalContent onClose={onClose} startAtUpload={startAtUpload} />, document.body)
}
