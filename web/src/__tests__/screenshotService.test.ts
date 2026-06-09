import { describe, it, expect, vi, beforeEach } from 'vitest'
import { processSquadScreenshot, isAllowedMime, ScreenshotParseError, ScreenshotEmptyError } from '../../server/services/screenshotService'
import type { PlayerMatchResult } from '../../server/db'

vi.mock('../../server/db', () => ({
  matchPlayersByName: vi.fn(),
}))

import * as db from '../../server/db'

const POSITIONED_PLAYER: PlayerMatchResult = {
  method: 'positioned',
  element: 1, position: 'FWD', price: 10, squad_id: 3,
  name: 'Messi', team_abbr: 'ARG', xp: 8.5, low_sample: false,
}

function makeAnthropicMock(responseText: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: responseText }],
      }),
    },
  } as unknown as import('@anthropic-ai/sdk').default
}

describe('isAllowedMime', () => {
  it('accepts valid image MIME types', () => {
    expect(isAllowedMime('image/jpeg')).toBe(true)
    expect(isAllowedMime('image/png')).toBe(true)
    expect(isAllowedMime('image/webp')).toBe(true)
    expect(isAllowedMime('image/gif')).toBe(true)
  })

  it('rejects invalid MIME types', () => {
    expect(isAllowedMime('application/pdf')).toBe(false)
    expect(isAllowedMime('text/plain')).toBe(false)
    expect(isAllowedMime('')).toBe(false)
  })
})

describe('processSquadScreenshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns matched player when vision API returns valid JSON and DB matches', async () => {
    const anthropic = makeAnthropicMock('{"name":"Messi","position":"FWD"}]}')
    vi.mocked(db.matchPlayersByName).mockResolvedValueOnce(POSITIONED_PLAYER)
    const result = await processSquadScreenshot(anthropic, 'base64data', 'image/jpeg', 1)
    expect(result.matched).toHaveLength(1)
    expect(result.matched[0].name).toBe('Messi')
    expect(result.unmatched).toHaveLength(0)
    expect(result.total).toBe(1)
  })

  it('puts unmatched player in unmatched array when DB returns null', async () => {
    const anthropic = makeAnthropicMock('{"name":"Unknown","position":"MID"}]}')
    vi.mocked(db.matchPlayersByName).mockResolvedValueOnce(null)
    const result = await processSquadScreenshot(anthropic, 'base64data', 'image/jpeg', 1)
    expect(result.matched).toHaveLength(0)
    expect(result.unmatched).toEqual(['Unknown'])
    expect(result.total).toBe(1)
  })

  it('throws ScreenshotParseError when vision API returns malformed JSON', async () => {
    const anthropic = makeAnthropicMock('broken json here]}')
    await expect(processSquadScreenshot(anthropic, 'base64data', 'image/jpeg', 1))
      .rejects.toThrow(ScreenshotParseError)
  })

  it('throws ScreenshotEmptyError when vision API returns empty players array', async () => {
    const anthropic = makeAnthropicMock(']}')  // results in {"players":[]}
    await expect(processSquadScreenshot(anthropic, 'base64data', 'image/jpeg', 1))
      .rejects.toThrow(ScreenshotEmptyError)
  })

  it('passes the round param to matchPlayersByName', async () => {
    const anthropic = makeAnthropicMock('{"name":"Salah","position":"MID"}]}')
    vi.mocked(db.matchPlayersByName).mockResolvedValueOnce(POSITIONED_PLAYER)
    await processSquadScreenshot(anthropic, 'base64data', 'image/jpeg', 5)
    expect(db.matchPlayersByName).toHaveBeenCalledWith('Salah', 'MID', 5)
  })

  it('handles fallback method in matched result', async () => {
    const fallbackPlayer: PlayerMatchResult = { ...POSITIONED_PLAYER, method: 'fallback' }
    const anthropic = makeAnthropicMock('{"name":"Messi","position":"FWD"}]}')
    vi.mocked(db.matchPlayersByName).mockResolvedValueOnce(fallbackPlayer)
    const result = await processSquadScreenshot(anthropic, 'base64data', 'image/jpeg', 1)
    expect(result.matched[0].method).toBe('fallback')
  })

  it('handles mixed matched and unmatched players concurrently', async () => {
    const anthropic = makeAnthropicMock(
      '{"name":"Messi","position":"FWD"},{"name":"Ghost","position":"MID"}]}'
    )
    vi.mocked(db.matchPlayersByName)
      .mockResolvedValueOnce(POSITIONED_PLAYER)
      .mockResolvedValueOnce(null)
    const result = await processSquadScreenshot(anthropic, 'base64data', 'image/jpeg', 1)
    expect(result.matched).toHaveLength(1)
    expect(result.unmatched).toEqual(['Ghost'])
    expect(result.total).toBe(2)
  })

  it('accepts plain string player format from vision API', async () => {
    const anthropic = makeAnthropicMock('"Ronaldo"]}')
    vi.mocked(db.matchPlayersByName).mockResolvedValueOnce(POSITIONED_PLAYER)
    const result = await processSquadScreenshot(anthropic, 'base64data', 'image/png', 1)
    expect(db.matchPlayersByName).toHaveBeenCalledWith('Ronaldo', undefined, 1)
    expect(result.total).toBe(1)
  })
})
