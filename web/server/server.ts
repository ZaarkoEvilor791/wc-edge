import 'dotenv/config'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import {
  dbEnabled,
  getPlayers,
  getTeams,
  getRounds,
  getProjections,
  getSuggestedSquad,
  getCurrentRoundId,
  matchPlayersByName,
  getTeamFdr,
} from './db'
import { suggestTransfers } from './services/transferAdvisor'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()

function playerName(p: { known_name: string | null; first_name: string | null; last_name: string | null }): string {
  return p.known_name ?? [p.first_name, p.last_name].filter(Boolean).join(' ')
}
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001

app.use(express.json({ limit: '10mb' }))
app.set('trust proxy', 1)

// ---- FIFA Fantasy proxies (5-min TTL cached) ----
const FIFA_BASE = 'https://play.fifa.com/json/fantasy'
const proxyCache = new Map<string, { data: unknown; ts: number }>()

async function fifaFetch(url: string, ttlMs: number): Promise<unknown> {
  const cached = proxyCache.get(url)
  if (cached && Date.now() - cached.ts < ttlMs) return cached.data
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${r.status}`)
  const data = await r.json()
  proxyCache.set(url, { data, ts: Date.now() })
  return data
}

async function fifaProxy(url: string, ttlMs: number, res: express.Response) {
  try {
    res.json(await fifaFetch(url, ttlMs))
  } catch (err) {
    res.status(502).json({ error: 'FIFA proxy failed', detail: String(err) })
  }
}

app.get('/wc/players.json', (_, res) => fifaProxy(`${FIFA_BASE}/players.json`, 5 * 60_000, res))
app.get('/wc/rounds.json', (_, res) => fifaProxy(`${FIFA_BASE}/rounds.json`, 5 * 60_000, res))
app.get('/wc/squads_fifa.json', (_, res) => fifaProxy(`${FIFA_BASE}/squads_fifa.json`, 30 * 60_000, res))

app.get('/api/fixtures/:squadId', async (req, res) => {
  const squadId = Number(req.params.squadId)
  if (!squadId || Number.isNaN(squadId)) {
    return res.status(400).json({ error: 'squadId required' })
  }
  try {
    const rounds = await fifaFetch(`${FIFA_BASE}/rounds.json`, 5 * 60_000) as Record<string, unknown>[]
    const fixtures = []
    for (const rnd of rounds) {
      const tournaments = (rnd.tournaments as Record<string, unknown>[] | undefined) ?? []
      for (const fix of tournaments) {
        if (fix.homeSquadId === squadId || fix.awaySquadId === squadId) {
          fixtures.push({
            round: rnd.id,
            stage: rnd.stage ?? '',
            date: (fix.date as string) ?? (rnd.startDate as string) ?? null,
            homeTeamId: fix.homeSquadId,
            homeTeamName: fix.homeSquadName,
            awayTeamId: fix.awaySquadId,
            awayTeamName: fix.awaySquadName,
            kickoff: (fix.kickoffTime as string) ?? (fix.time as string) ?? null,
          })
        }
      }
    }
    res.json(fixtures)
  } catch {
    res.json([])
  }
})

// ---- DB API routes ----

app.get('/api/players', async (_, res) => {
  try {
    const players = await getPlayers()
    res.json(players.map((p) => ({
      ...p,
      name: playerName(p),
    })))
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.get('/api/teams', async (_, res) => {
  try {
    res.json(await getTeams())
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.get('/api/rounds', async (_, res) => {
  try {
    res.json(await getRounds())
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.get('/api/projections', async (req, res) => {
  const round = Number(req.query.round)
  if (!round || Number.isNaN(round)) {
    return res.status(400).json({ error: 'round query param required' })
  }
  try {
    res.json(await getProjections(round))
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.get('/api/squad/suggest', async (_, res) => {
  try {
    const squad = await getSuggestedSquad()
    if (!squad) return res.status(404).json({ error: 'No suggested squad yet' })
    res.json(squad)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.post('/api/squad/optimize', async (_, res) => {
  // Placeholder: trigger Python optimizer via shell or return current suggestion
  try {
    const squad = await getSuggestedSquad()
    if (!squad) return res.status(404).json({ error: 'No suggested squad yet' })
    res.json(squad)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.post('/api/transfers/suggest', async (req, res) => {
  const { squad, round, freeTransfers, budget = 100 } = req.body as {
    squad: number[]
    round: number
    freeTransfers: number
    budget?: number
  }

  if (!Array.isArray(squad) || !round || !freeTransfers) {
    return res.status(400).json({ error: 'squad[], round, freeTransfers required' })
  }

  try {
    const [players, projections, teams] = await Promise.all([
      getPlayers(), getProjections(round), getTeams(),
    ])

    const playerMap = new Map(players.map((p) => [p.element, p]))
    const teamMap = new Map(teams.map((t) => [t.squad_id, t]))
    const projMap = new Map(projections.map((p) => [p.element, p]))

    const toCard = (el: number) => {
      const p = playerMap.get(el)!
      const proj = projMap.get(el)
      return {
        element: el,
        name: playerName(p),
        position: p.position as 'GK' | 'DEF' | 'MID' | 'FWD',
        price: p.price ?? 0,
        xp: proj?.xp ?? 0,
        team_abbr: teamMap.get(p.squad_id)?.abbr ?? '?',
        squad_id: p.squad_id,
        low_sample: proj?.low_sample ?? false,
      }
    }

    const squadCards = squad.filter((el) => playerMap.has(el)).map(toCard)
    const pool = projections.filter((p) => playerMap.has(p.element)).map((p) => toCard(p.element))
    const transfers = suggestTransfers(squadCards, pool, budget)

    res.json({ transfers })
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.get('/api/fdr', async (req, res) => {
  const round = Number(req.query.round)
  if (!round || Number.isNaN(round)) {
    return res.status(400).json({ error: 'round query param required' })
  }
  try {
    const rows = await getTeamFdr(round)
    if (rows.length === 0) return res.json([])
    const sorted = [...rows].sort((a, b) => b.lambda_posterior - a.lambda_posterior)
    const n = sorted.length
    res.json(sorted.map((r, i) => ({
      squad_id: r.squad_id,
      fdr: Math.min(5, Math.floor((i / n) * 5) + 1),
    })))
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.get('/api/live', async (req, res) => {
  const round = Number(req.query.round) || await getCurrentRoundId()
  try {
    const r = await fetch(`https://worldcup2026-api.vercel.app/api/round/${round}`)
    if (!r.ok) throw new Error(`${r.status}`)
    res.json(await r.json())
  } catch {
    // Community API unavailable — fall back to FIFA Fantasy schedule for this round
    try {
      const rounds = await fifaFetch(`${FIFA_BASE}/rounds.json`, 5 * 60_000) as Record<string, unknown>[]
      const rnd = rounds.find((r) => r.id === round) ?? rounds[round - 1]
      const fixtures = ((rnd?.tournaments as Record<string, unknown>[]) ?? []).map((fix, i) => ({
        id: i,
        home_team: (fix.homeSquadName as string) ?? '?',
        away_team: (fix.awaySquadName as string) ?? '?',
        home_score: null,
        away_score: null,
        status: 'scheduled',
        minute: null,
        kickoff: (fix.date as string) ?? (rnd?.startDate as string) ?? null,
      }))
      res.json({ matches: fixtures, stale: true, source: 'schedule' })
    } catch {
      res.json({ matches: [], stale: true, source: 'unavailable' })
    }
  }
})

// ---- AI chat ----

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null

// ---- Rate limiter ----
const rateLimitMap = new Map<string, { minCount: number; minReset: number; dayCount: number; day: string }>()
export const _rateLimitMap = rateLimitMap

function checkRateLimit(ip: string, maxPerMin: number, maxPerDay: number): boolean {
  const now = Date.now()
  const today = new Date().toISOString().slice(0, 10)
  const entry = rateLimitMap.get(ip)
  if (!entry || entry.day !== today) {
    rateLimitMap.set(ip, { minCount: 1, minReset: now + 60_000, dayCount: 1, day: today })
    return true
  }
  if (entry.dayCount >= maxPerDay) return false
  if (now > entry.minReset) {
    entry.minCount = 1
    entry.minReset = now + 60_000
  } else if (entry.minCount >= maxPerMin) {
    return false
  } else {
    entry.minCount++
  }
  entry.dayCount++
  return true
}

app.post('/api/chat', async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY not set' })
  }
  if (process.env.AI_ENABLED === 'false') {
    return res.status(503).json({ error: 'AI features temporarily unavailable.' })
  }
  if (!checkRateLimit(req.ip ?? 'unknown', 5, 25)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' })
  }

  const { messages, squadNames } = req.body as {
    messages: { role: 'user' | 'assistant'; content: string }[]
    squadNames?: string[]
  }

  const system = `<role>You are Edge, a FIFA WC 2026 Fantasy advisor. Reply in ≤120 tokens. No preamble. No sign-off.</role>

<rules>
Scoring: Goals — GK 9pts, DEF 7pts, MID 6pts, FWD 5pts. Assist 3pts. Clean sheet — GK/DEF 5pts, MID 1pt, FWD 0pt. Appearance ≥60min 2pts, <60min 1pt. GK +1pt/3 saves. Yellow −1pt, red −2pt. Scouting bonus +2pts (≥4pts AND <5% owned).
Chips: Wildcard (free full reset), 12th Man (bench scores full), Max Captain (3× not 2×), Qualification Booster (nation qualifies → all their players boosted), Mystery Booster (random on activation).
Budget: £100m group stage, £105m from R32. Country limit: 3 group / 4 R32 / 5 R16 / 6 QF / 8 SF+Final. Extra transfers: −3pts each.
</rules>

<squad>${squadNames?.length ? squadNames.join(', ') : 'not set'}</squad>`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system,
      messages,
    })
    const text = response.content.find((b) => b.type === 'text')?.text ?? ''
    res.json({ content: text })
  } catch (err) {
    res.status(502).json({ error: 'AI request failed', detail: String(err) })
  }
})

// ---- Squad from screenshot ----

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const
type AllowedMime = typeof ALLOWED_MIME[number]

app.post('/api/squad/from-screenshot', async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY not set' })
  }
  if (process.env.AI_ENABLED === 'false') {
    return res.status(503).json({ error: 'AI features temporarily unavailable.' })
  }
  if (!checkRateLimit(req.ip ?? 'unknown', 2, 5)) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again in a minute.' })
  }
  const { imageBase64, mimeType } = req.body as { imageBase64?: string; mimeType?: string }
  if (!imageBase64 || !mimeType) {
    return res.status(400).json({ error: 'imageBase64 and mimeType required' })
  }
  if (!ALLOWED_MIME.includes(mimeType as AllowedMime)) {
    return res.status(400).json({ error: 'Unsupported image type' })
  }
  try {
    const SCREENSHOT_PREFILL = '{"players":['
    const visionRes = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 128,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType as AllowedMime, data: imageBase64 },
            },
            {
              type: 'text',
              text: 'List every player name visible in this FIFA Fantasy squad screenshot as JSON.',
            },
          ],
        },
        { role: 'assistant', content: SCREENSHOT_PREFILL },
      ],
    })
    const completion = visionRes.content.find((b) => b.type === 'text')?.text ?? ''
    let names: string[]
    try {
      const parsed = JSON.parse(SCREENSHOT_PREFILL + completion) as { players: string[] }
      names = parsed.players
    } catch {
      return res.status(422).json({ error: 'Could not parse player names from screenshot' })
    }
    if (!Array.isArray(names) || names.length === 0) {
      return res.status(422).json({ error: 'No player names found in screenshot' })
    }
    const results = await Promise.all(names.map(async (name) => ({ name, match: await matchPlayersByName(name) })))
    res.json({
      matched: results.filter((r) => r.match).map((r) => r.match),
      unmatched: results.filter((r) => !r.match).map((r) => r.name),
      total: names.length,
    })
  } catch (err) {
    res.status(502).json({ error: 'Screenshot processing failed', detail: String(err) })
  }
})

// ---- Static serving (prod) ----

const distDir = path.resolve(__dirname, '../dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (_, res) => res.sendFile(path.join(distDir, 'index.html')))
}

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`wc-edge server on :${PORT}  DB=${dbEnabled ? 'enabled' : 'disabled'}`)
  })
}

export { app }
