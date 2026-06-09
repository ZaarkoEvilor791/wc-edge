import Anthropic from '@anthropic-ai/sdk'
import { matchPlayersByName, type PlayerMatchResult } from '../db'

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
type AllowedMime = typeof ALLOWED_MIME[number]
const VALID_POS = new Set(['GK', 'DEF', 'MID', 'FWD'])

export type ScreenshotResult = {
  matched: PlayerMatchResult[]
  unmatched: string[]
  total: number
}

export class ScreenshotParseError extends Error {
  constructor(msg = 'Could not parse player names from screenshot') { super(msg) }
}
export class ScreenshotEmptyError extends Error {
  constructor(msg = 'No player names found in screenshot') { super(msg) }
}

export function isAllowedMime(m: string): m is AllowedMime {
  return (ALLOWED_MIME as readonly string[]).includes(m)
}

export async function processSquadScreenshot(
  anthropic: Anthropic,
  imageBase64: string,
  mimeType: AllowedMime,
  round?: number,
): Promise<ScreenshotResult> {
  const PREFILL = '{"players":['
  const visionRes = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
          { type: 'text', text: 'List every player name and position (GK, DEF, MID, or FWD) visible in this FIFA Fantasy squad screenshot as JSON. Use the pitch rows and bench badges to determine position.' },
        ],
      },
      { role: 'assistant', content: PREFILL },
    ],
  })

  const completion = visionRes.content.find((b) => b.type === 'text')?.text ?? ''
  let players: { name: string; position?: string }[]
  try {
    const parsed = JSON.parse(PREFILL + completion) as { players: unknown[] }
    players = parsed.players.map((p) => {
      if (typeof p === 'string') return { name: p }
      const obj = p as Record<string, unknown>
      return {
        name: String(obj.name ?? ''),
        position: typeof obj.position === 'string' ? obj.position.toUpperCase() : undefined,
      }
    }).filter((p) => p.name.trim().length > 0)
  } catch {
    throw new ScreenshotParseError()
  }

  if (players.length === 0) throw new ScreenshotEmptyError()

  const results = await Promise.all(
    players.map(async ({ name, position }) => ({
      name,
      match: await matchPlayersByName(
        name,
        position && VALID_POS.has(position) ? position : undefined,
        round,
      ),
    }))
  )

  return {
    matched: results.filter((r) => r.match).map((r) => r.match!),
    unmatched: results.filter((r) => !r.match).map((r) => r.name),
    total: players.length,
  }
}
