import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSquadStore } from '../store/squadStore'
import { useAppStore } from '../store/appStore'
import { useProjections, useCurrentRound } from '../hooks/useWC'
import { wcApi } from '../services/wcApi'
import { optimiseXI } from '../utils/squad'
import type { ChatMessage, ChatAction } from '../types/wc'
import { PAGE_GUIDES, type GuidePage } from '../data/pageGuides'

const SQUAD_CHIPS = [
  'Who should I captain this week?',
  'Which player in my squad should I transfer out?',
  'Rate my squad out of 10 and suggest one improvement',
]

const GENERIC_CHIPS = [
  'Who are the best value picks for WC 2026?',
  'Which goalkeeper has the best fixtures in round 1?',
  'Build me a strong £100m squad for the group stage',
  'How are points scored in WC 2026 Fantasy?',
]

function renderContent(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return part.split('\n').map((line, j, arr) => (
      <span key={`${i}-${j}`}>
        {line}
        {j < arr.length - 1 && <br />}
      </span>
    ))
  })
}

export default function Assistant() {
  const squad = useSquadStore((s) => s.squad)
  const setCaptain = useSquadStore((s) => s.setCaptain)
  const setViceCaptain = useSquadStore((s) => s.setViceCaptain)
  const setSquad = useSquadStore((s) => s.setSquad)
  const setFormationCounts = useSquadStore((s) => s.setFormationCounts)
  const currentRound = useCurrentRound()
  const { data: projections } = useProjections(currentRound?.id ?? 1)

  const messages = useAppStore((s) => s.chatMessages)
  const setMessages = useAppStore((s) => s.setChatMessages)
  const chipsUsed = useAppStore((s) => s.chatChipsUsed)
  const setChipsUsed = useAppStore((s) => s.setChatChipsUsed)
  const setUnmatchedNames = useAppStore((s) => s.setUnmatchedNames)

  const navigate = useNavigate()

  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [screenshotLoading, setScreenshotLoading] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const squadNames = squad.map((p) => p.name).filter(Boolean)
  const hasSquad = squadNames.length > 0
  const chips = hasSquad ? SQUAD_CHIPS : GENERIC_CHIPS

  const buildContextPrefix = useCallback(() => {
    if (!projections?.length) return ''
    const top5 = projections.slice(0, 5)
    const squadMap = new Map(squad.map((p) => [p.element, p.name]))
    const names = top5.map((p) => {
      const name = squadMap.get(p.element) ?? `element ${p.element}`
      return `${name} (${p.xp.toFixed(1)} xP)`
    })
    return `[Context: top projected players this round: ${names.join(', ')}]\n\n`
  }, [projections, squad])

  const executeActions = useCallback((actions: ChatAction[]) => {
    const matchPlayer = (stored: string, action: string) => {
      const s = stored.toLowerCase(); const a = action.toLowerCase()
      return s === a || s.includes(a) || a.includes(s)
    }
    for (const action of actions) {
      if (action.type === 'navigate') {
        navigate(action.path)
      } else if (action.type === 'set_captain') {
        const p = squad.find((pl) => matchPlayer(pl.name, action.name))
        if (p) setCaptain(p.element)
      } else if (action.type === 'set_vice_captain') {
        const p = squad.find((pl) => matchPlayer(pl.name, action.name))
        if (p) setViceCaptain(p.element)
      } else if (action.type === 'suggest_transfers') {
        navigate('/transfers')
      } else if (action.type === 'optimise_xi') {
        const { squad: reordered, formation } = optimiseXI(squad)
        setSquad(reordered)
        setFormationCounts(formation)
        navigate('/squad')
      }
    }
  }, [squad, navigate, setCaptain, setViceCaptain, setSquad, setFormationCounts])

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    setError(null)
    setChipsUsed(true)

    const isFirst = messages.length === 0
    const content = isFirst ? buildContextPrefix() + trimmed : trimmed

    const userMsg: ChatMessage = { role: 'user', content: trimmed }
    const apiMsg: ChatMessage = { role: 'user', content }

    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)

    try {
      const { content: reply, actions } = await wcApi.chat({
        messages: [...messages, apiMsg],
        squad: squad.map((p) => p.element),
        squadNames,
      })

      const tipAction = actions?.find(
        (a): a is Extract<ChatAction, { type: 'show_tip' }> => a.type === 'show_tip'
      )
      const withTip = tipAction
        ? [...nextMessages, { role: 'assistant' as const, content: `__TIP__:${tipAction.page}` }]
        : nextMessages
      const withReply = [...withTip, { role: 'assistant' as const, content: reply }]
      setMessages(withReply)
      if (actions?.length) executeActions(actions)
    } catch (err) {
      setError('Edge is unavailable right now. Please try again.')
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [messages, loading, buildContextPrefix, squad, squadNames, setChipsUsed, setMessages, executeActions])

  const handleScreenshot = useCallback(async (file: File) => {
    if (!file) return
    setScreenshotLoading(true)
    setChipsUsed(true)

    const userMsg: ChatMessage = { role: 'user', content: '📷 Squad screenshot uploaded' }
    const withUser = [...messages, userMsg]
    setMessages(withUser)

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          resolve(result.split(',')[1])
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const { matched, unmatched, total } = await wcApi.squadFromScreenshot(base64, file.type)
      setSquad(matched)
      if (unmatched.length) setUnmatchedNames(unmatched)

      const summary =
        unmatched.length
          ? `Loaded ${matched.length}/${total} players. Could not match: ${unmatched.join(', ')}.`
          : `Loaded all ${matched.length} players from your screenshot.`
      setMessages([...withUser, { role: 'assistant', content: summary }])
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.message.includes('429')
          ? 'Screenshot limit reached. Try again in a minute.'
          : 'Could not process screenshot. Please try again.'
      setMessages([...withUser, { role: 'assistant', content: msg }])
    } finally {
      setScreenshotLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }, [messages, setMessages, setSquad, setUnmatchedNames, setChipsUsed])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const isEmpty = messages.length === 0 && !loading

  return (
    <div className="flex h-full flex-col -m-4 md:-m-6">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between border-b border-white/[0.06] bg-slate-950/60 backdrop-blur-sm px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Edge</h1>
          <p className="text-xs text-slate-500">
            Your WC 2026 AI advisor
            {hasSquad && (
              <span className="ml-2 rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accent">
                Squad loaded
              </span>
            )}
          </p>
        </div>
        <span className="rounded-full border border-white/[0.08] bg-slate-900/60 px-2.5 py-1 text-xs text-slate-500">
          Powered by Claude
        </span>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isEmpty && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-2 text-4xl">⚽</div>
            <p className="text-slate-400 text-sm">
              {hasSquad
                ? 'Ask Edge about your squad, captaincy, or transfers. Edge can also take actions — try "optimise my XI" or "set Salah as captain".'
                : 'Ask Edge anything about WC 2026 Fantasy, or upload a squad screenshot to get started.'}
            </p>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((msg, i) => {
            if (msg.role === 'assistant' && msg.content.startsWith('__TIP__:')) {
              return (
                <div key={i} className="flex justify-start">
                  <div className="flex-1">
                    <PageGuideCard page={msg.content.slice(8) as GuidePage} />
                  </div>
                </div>
              )
            }
            return (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg shadow-[0_0_10px_rgba(232,184,75,0.45)]">
                    E
                  </div>
                )}
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed backdrop-blur-sm ${
                    msg.role === 'user'
                      ? 'rounded-tr-sm border border-accent/25 bg-accent/15 text-slate-100'
                      : 'rounded-tl-sm border border-cyan/15 bg-cyan/[0.06] text-slate-100'
                  }`}
                >
                  {renderContent(msg.content)}
                </div>
              </div>
            )
          })}

          {(loading || screenshotLoading) && (
            <div className="flex justify-start">
              <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg shadow-[0_0_10px_rgba(232,184,75,0.45)]">
                E
              </div>
              <div className="rounded-2xl rounded-tl-sm border border-cyan/15 bg-cyan/[0.06] backdrop-blur-sm px-4 py-3">
                <ThinkingDots label={screenshotLoading ? 'Processing screenshot' : 'Edge is thinking'} />
              </div>
            </div>
          )}

          {error && (
            <p className="text-center text-sm text-red-400">{error}</p>
          )}
        </div>

        <div ref={bottomRef} />
      </div>

      {/* Starter chips */}
      {!chipsUsed && (
        <div className="shrink-0 flex flex-wrap gap-2 px-6 pb-3">
          {chips.map((chip) => (
            <button
              key={chip}
              onClick={() => send(chip)}
              disabled={loading}
              className="rounded-full border border-white/[0.1] bg-slate-900/60 px-3 py-1.5 text-xs text-slate-300 backdrop-blur-sm transition hover:border-accent/50 hover:text-accent hover:shadow-[0_0_8px_rgba(232,184,75,0.2)] disabled:opacity-40"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="shrink-0 border-t border-white/[0.06] bg-slate-950/60 px-6 py-3">
        <div className="flex items-end gap-2 rounded-xl border border-white/[0.08] bg-slate-900/60 px-3 py-2 backdrop-blur-sm focus-within:border-accent/50 focus-within:shadow-[0_0_0_1px_rgba(232,184,75,0.12)] transition-all">
          {/* Screenshot upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleScreenshot(file)
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading || screenshotLoading}
            title="Upload squad screenshot"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:text-slate-300 disabled:opacity-40"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
          </button>

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading || screenshotLoading}
            rows={1}
            placeholder="Ask Edge anything, or give a command…"
            className="flex-1 resize-none bg-transparent px-1 py-1.5 text-sm text-slate-100 placeholder-slate-600 outline-none disabled:opacity-50"
            style={{ maxHeight: '120px', overflowY: 'auto' }}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`
            }}
          />
          <button
            onClick={() => send(input)}
            disabled={loading || screenshotLoading || !input.trim()}
            className="shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg transition hover:opacity-90 hover:shadow-glow-gold disabled:opacity-40"
          >
            Send
          </button>
        </div>
        <p className="mt-1.5 text-xs text-slate-700">Enter to send · Shift+Enter for new line · camera to upload screenshot</p>
      </div>
    </div>
  )
}

function PageGuideCard({ page }: { page: GuidePage }) {
  const guide = PAGE_GUIDES[page]
  const nav = useNavigate()
  if (!guide) return null
  return (
    <div className="rounded-2xl border border-accent/25 bg-accent/[0.07] backdrop-blur-sm px-4 py-3 text-sm shadow-glow-gold">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent/80">
        Page guide · {guide.title}
      </p>
      <ul className="space-y-1">
        {guide.actions.map((action, i) => (
          <li key={i} className="flex items-start gap-2 text-slate-300">
            <span className="mt-0.5 shrink-0 text-accent/50">·</span>
            {action}
          </li>
        ))}
      </ul>
      <button
        onClick={() => nav(guide.path)}
        className="mt-3 rounded-lg border border-accent/20 px-3 py-1.5 text-xs text-accent transition-all hover:border-accent/40 hover:shadow-[0_0_8px_rgba(232,184,75,0.2)]"
      >
        Go to {guide.title} →
      </button>
    </div>
  )
}

function ThinkingDots({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-xs text-slate-400">{label}</span>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-slate-500"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  )
}
