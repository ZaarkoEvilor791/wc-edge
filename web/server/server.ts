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
} from './db'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001

app.use(express.json())

// ---- FIFA Fantasy proxies (5-min TTL cached) ----
const FIFA_BASE = 'https://play.fifa.com/json/fantasy'
const proxyCache = new Map<string, { data: unknown; ts: number }>()

async function fifaProxy(url: string, ttlMs: number, res: express.Response) {
  const cached = proxyCache.get(url)
  if (cached && Date.now() - cached.ts < ttlMs) {
    return res.json(cached.data)
  }
  try {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`${r.status}`)
    const data = await r.json()
    proxyCache.set(url, { data, ts: Date.now() })
    res.json(data)
  } catch (err) {
    res.status(502).json({ error: 'FIFA proxy failed', detail: String(err) })
  }
}

app.get('/wc/players.json', (_, res) => fifaProxy(`${FIFA_BASE}/players.json`, 5 * 60_000, res))
app.get('/wc/rounds.json', (_, res) => fifaProxy(`${FIFA_BASE}/rounds.json`, 5 * 60_000, res))
app.get('/wc/squads_fifa.json', (_, res) => fifaProxy(`${FIFA_BASE}/squads_fifa.json`, 30 * 60_000, res))

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

app.post('/api/transfers/suggest', async (_req, res) => {
  res.json({ transfers: [] })
})

app.get('/api/live', async (req, res) => {
  const round = Number(req.query.round) || await getCurrentRoundId()
  try {
    const r = await fetch(`https://worldcup2026-api.vercel.app/api/round/${round}`)
    if (!r.ok) throw new Error(`${r.status}`)
    res.json(await r.json())
  } catch (err) {
    res.status(503).json({ error: 'Live API unavailable', detail: String(err) })
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

  const { messages, squad } = req.body as {
    messages: { role: 'user' | 'assistant'; content: string }[]
    squad?: number[]
  }

  const system = [
    'You are an expert FIFA WC 2026 Fantasy advisor called Edge.',
    'Give concise, actionable advice based on expected points projections, fixture difficulty, and player form.',
    squad?.length
      ? `The user's current squad elements: [${squad.join(', ')}].`
      : 'The user has not yet set their squad.',
  ].join(' ')

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

// ---- Static serving (prod) ----

const distDir = path.resolve(__dirname, '../dist')
if (existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (_, res) => res.sendFile(path.join(distDir, 'index.html')))
}

app.listen(PORT, () => {
  console.log(`wc-edge server on :${PORT}  DB=${dbEnabled ? 'enabled' : 'disabled'}`)
})
