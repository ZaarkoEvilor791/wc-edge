import { useState, useRef, useEffect, useCallback } from 'react'
import { useSquadStore } from '../store/squadStore'
import { useProjections, useCurrentRound } from '../hooks/useWC'
import { wcApi } from '../services/wcApi'
import type { ChatMessage } from '../types/wc'

const SQUAD_CHIPS = [
  'Who should I captain this week?',
  'Which player in my squad should I transfer out?',
  'Rate my squad out of 10 and suggest one improvement',
]

const GENERIC_CHIPS = [
  'Who are the best value picks for WC 2026?',
  'Which goalkeeper has the best fixtures in round 1?',
  'Build me a strong £100m squad for the group stage',
]

function renderContent(text: string) {
  // Render **bold** and line breaks only — no dangerouslySetInnerHTML
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
  const currentRound = useCurrentRound()
  const { data: projections } = useProjections(currentRound?.id ?? 1)

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chipsUsed, setChipsUsed] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

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
      const { content: reply } = await wcApi.chat({
        messages: [...messages, apiMsg],
        squad: squad.map((p) => p.element),
        squadNames,
      })

      setMessages([...nextMessages, { role: 'assistant', content: reply }])
    } catch (err) {
      setError('Edge is unavailable right now. Please try again.')
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [messages, loading, buildContextPrefix, squad, squadNames])

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
      <div className="shrink-0 border-b border-slate-600 px-6 py-4">
        <h1 className="text-xl font-semibold text-slate-100">Edge Assistant</h1>
        <p className="mt-0.5 text-sm text-slate-400">
          AI-powered WC 2026 fantasy advice
          {hasSquad && (
            <span className="ml-2 rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accent">
              Squad loaded
            </span>
          )}
        </p>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isEmpty && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-2 text-4xl">⚽</div>
            <p className="text-slate-400 text-sm">
              {hasSquad
                ? 'Ask Edge about your squad, captaincy, or transfers.'
                : 'Ask Edge anything about WC 2026 Fantasy.'}
            </p>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg">
                  E
                </div>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'rounded-tr-sm bg-accent text-accent-fg'
                    : 'rounded-tl-sm bg-slate-800 text-slate-100'
                }`}
              >
                {renderContent(msg.content)}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-fg">
                E
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-slate-800 px-4 py-3">
                <ThinkingDots />
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
              className="rounded-full border border-slate-600 px-3 py-1.5 text-xs text-slate-300 transition hover:border-accent hover:text-accent disabled:opacity-40"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="shrink-0 border-t border-slate-600 px-6 py-3">
        <div className="flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            rows={1}
            placeholder="Ask Edge anything about WC 2026…"
            className="flex-1 resize-none rounded-xl bg-slate-800 px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
            style={{ maxHeight: '120px', overflowY: 'auto' }}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`
            }}
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            className="mb-0.5 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-40"
          >
            Send
          </button>
        </div>
        <p className="mt-1.5 text-xs text-slate-600">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  )
}

function ThinkingDots() {
  return (
    <span className="flex items-center gap-1">
      <span className="text-xs text-slate-400">Edge is thinking</span>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
          style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </span>
  )
}
