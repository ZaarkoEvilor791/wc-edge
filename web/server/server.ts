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

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001

app.use(express.json({ limit: '10mb' }))

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
      name: p.known_name ?? [p.first_name, p.last_name].filter(Boolean).join(' '),
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
    const projMap = new Map(projections.map((p) => [p.element, p]))
    const teamMap = new Map(teams.map((t) => [t.squad_id, t]))

    const toCard = (el: number) => {
      const p = playerMap.get(el)!
      return {
        element: el,
        name: p.known_name ?? [p.first_name, p.last_name].filter(Boolean).join(' '),
        position: p.position as 'GK' | 'DEF' | 'MID' | 'FWD',
        price: p.price ?? 0,
        xp: projMap.get(el)?.xp ?? 0,
        team_abbr: teamMap.get(p.squad_id)?.abbr ?? '?',
        squad_id: p.squad_id,
        low_sample: projMap.get(el)?.low_sample ?? false,
      }
    }

    const currentSquad = [...squad]
    const squadSet = new Set(squad)
    let currentCost = squad.reduce((s, el) => s + (playerMap.get(el)?.price ?? 0), 0)

    const transfers: { out: ReturnType<typeof toCard>; in: ReturnType<typeof toCard>; xp_gain: number; price_delta: number }[] = []

    for (let i = 0; i < Math.min(freeTransfers, 6); i++) {
      let best: { outEl: number; inEl: number; gain: number; newCost: number } | null = null

      for (const outEl of currentSquad) {
        const outP = playerMap.get(outEl)
        if (!outP) continue
        const outXp = projMap.get(outEl)?.xp ?? 0

        for (const inProj of projections) {
          const inEl = inProj.element
          if (squadSet.has(inEl)) continue
          const inP = playerMap.get(inEl)
          if (!inP || inP.position !== outP.position) continue
          const newCost = currentCost - (outP.price ?? 0) + (inP.price ?? 0)
          if (newCost > budget) continue
          const gain = inProj.xp - outXp
          if (gain <= 0) continue
          if (!best || gain > best.gain) best = { outEl, inEl, gain, newCost }
        }
      }

      if (!best) break

      transfers.push({
        out: toCard(best.outEl),
        in: toCard(best.inEl),
        xp_gain: best.gain,
        price_delta: (playerMap.get(best.outEl)?.price ?? 0) - (playerMap.get(best.inEl)?.price ?? 0),
      })

      const idx = currentSquad.indexOf(best.outEl)
      currentSquad[idx] = best.inEl
      squadSet.delete(best.outEl)
      squadSet.add(best.inEl)
      currentCost = best.newCost
    }

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

app.post('/api/chat', async (req, res) => {
  if (!anthropic) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY not set' })
  }

  const { messages, squadNames } = req.body as {
    messages: { role: 'user' | 'assistant'; content: string }[]
    squadNames?: string[]
  }

  const system = [
    'You are an expert FIFA WC 2026 Fantasy advisor called Edge.',
    'Give concise, actionable advice based on expected points projections, fixture difficulty, and player form.',
    'Keep responses focused and under 150 words unless the user asks for detail.',
    'Scoring: Goal pts — GK 9, DEF 7, MID 6, FWD 5. Assist 3pts. Clean sheet — GK/DEF 5pts, MID 1pt, FWD 0pt. Appearance ≥60min 2pts, <60min 1pt. GK: +1pt per 3 saves. Yellow card −1pt, red card −2pt. Scouting bonus +2pts (≥4pts AND <5% ownership).',
    'Available chips: Wildcard (reset full squad free), 12th Man (bench scores full points that round), Max Captain (3× captain multiplier instead of 2×), Qualification Booster (activates when your nation qualifies, boosts all their players), Mystery Booster (random effect revealed on activation).',
    'Budget: £100m in group stage, £105m from Round of 32 onward. Country limit: max 3 players per nation in group stage (increases in knockouts: 4 in R32, 5 in R16, 6 in QF, 8 in SF/Final). Extra transfers beyond free allowance cost −3 pts each.',
    squadNames?.length
      ? `The user's current 15-player squad: ${squadNames.join(', ')}.`
      : 'The user has not yet set their squad.',
  ].join('\n')

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
  const { imageBase64, mimeType } = req.body as { imageBase64?: string; mimeType?: string }
  if (!imageBase64 || !mimeType) {
    return res.status(400).json({ error: 'imageBase64 and mimeType required' })
  }
  if (!ALLOWED_MIME.includes(mimeType as AllowedMime)) {
    return res.status(400).json({ error: 'Unsupported image type' })
  }
  try {
    const visionRes = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType as AllowedMime, data: imageBase64 },
          },
          {
            type: 'text',
            text: 'List every player name visible in this FIFA Fantasy squad screenshot. Return ONLY valid JSON: {"players":["name1","name2",...]}. No markdown, no explanation.',
          },
        ],
      }],
    })
    const raw = visionRes.content.find((b) => b.type === 'text')?.text ?? ''
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return res.status(422).json({ error: 'Could not parse player names from screenshot' })
    const { players: names } = JSON.parse(jsonMatch[0]) as { players: string[] }
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

app.listen(PORT, () => {
  console.log(`wc-edge server on :${PORT}  DB=${dbEnabled ? 'enabled' : 'disabled'}`)
})
