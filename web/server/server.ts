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
  getTeamFdr,
} from './db'
import { suggestTransfers } from './services/transferAdvisor'
import { processSquadScreenshot, isAllowedMime, ScreenshotParseError, ScreenshotEmptyError } from './services/screenshotService'
import { SCORING } from '../src/config/gameRules'
import { ROUTES } from '../src/config/routes'

function buildScoringContext(): string {
  const s = SCORING
  const goalLine = (Object.entries(s.GOAL_PTS) as [string, number][])
    .map(([pos, pts]) => `${pos} ${pts}pts`).join(', ')
  const csLine = (Object.entries(s.CLEAN_SHEET_PTS) as [string, number][])
    .filter(([, pts]) => pts > 0)
    .map(([pos, pts]) => `${pos} ${pts}pts`).join(', ')
  return [
    `Goals: ${goalLine}.`,
    `Assist ${s.ASSIST}pts.`,
    `Clean sheet: ${csLine}.`,
    `Appearance ≥60min ${s.APPEARANCE_FULL}pts, <60min ${s.APPEARANCE_PART}pt.`,
    `GK: +1pt per ${s.SAVES_PER_PT} saves. Penalty save +${s.PENALTY_SAVE}pts.`,
    `GK/DEF: goal conceded (after 1st) ${s.GOAL_CONCEDED_PER}pt.`,
    `MID: +1pt per ${s.TACKLES_PER_PT} tackles, +1pt per ${s.CHANCES_PER_PT} chances created.`,
    `FWD: +1pt per ${s.SHOTS_ON_TARGET_PER_PT} shots on target.`,
    `Direct FK goal +${s.FREE_KICK_GOAL_BONUS}pt bonus.`,
    `Cards: yellow ${s.YELLOW_CARD}pt, red ${s.RED_CARD}pts.`,
    `Own goal ${s.OWN_GOAL}pts. Penalty won +${s.PENALTY_WON}pts. Penalty conceded ${s.PENALTY_CONCEDED}pt.`,
    `Scouting bonus +${s.SCOUTING_BONUS}pts (>4pts AND <5% owned).`,
    `Qualification Booster chip: +${s.QUALIFICATION_BOOSTER}pts per XI player who advances (R32+ only).`,
  ].join(' ')
}
export const _buildScoringContext = buildScoringContext

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

app.get(ROUTES.fifaPlayers, (_, res) => fifaProxy(`${FIFA_BASE}/players.json`, 5 * 60_000, res))
app.get(ROUTES.fifaRounds, (_, res) => fifaProxy(`${FIFA_BASE}/rounds.json`, 5 * 60_000, res))
app.get(ROUTES.fifaSquads, (_, res) => fifaProxy(`${FIFA_BASE}/squads_fifa.json`, 30 * 60_000, res))

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

app.get(ROUTES.players, async (_, res) => {
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

app.get(ROUTES.teams, async (_, res) => {
  try {
    res.json(await getTeams())
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.get(ROUTES.rounds, async (_, res) => {
  try {
    res.json(await getRounds())
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.get(ROUTES.projections, async (req, res) => {
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

const VALID_VARIANTS = new Set(['max_xp', 'value', 'differential'])

app.get(ROUTES.suggestSquad, async (req, res) => {
  const raw = req.query.variant as string | undefined
  const variant = raw && VALID_VARIANTS.has(raw) ? raw : 'max_xp'
  try {
    const squad = await getSuggestedSquad(variant)
    if (!squad) return res.status(404).json({ error: 'No suggested squad yet' })
    res.json(squad)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.post(ROUTES.optimizeSquad, async (req, res) => {
  const raw = req.query.variant as string | undefined
  const variant = raw && VALID_VARIANTS.has(raw) ? raw : 'max_xp'
  try {
    const squad = await getSuggestedSquad(variant)
    if (!squad) return res.status(404).json({ error: 'No suggested squad yet' })
    res.json(squad)
  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
})

app.post(ROUTES.suggestTransfers, async (req, res) => {
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

app.get(ROUTES.fdr, async (req, res) => {
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
      const rnd = rounds[round - 1] ?? rounds.find((r) => r.id === round)
      const now = Date.now()
      const fixtures = ((rnd?.tournaments as Record<string, unknown>[]) ?? []).map((fix, i) => {
        const kickoff = (fix.date as string) ?? (rnd?.startDate as string) ?? null
        const isElapsed = kickoff ? new Date(kickoff).getTime() < now : false
        return {
          id: i,
          home_team: (fix.homeSquadName as string) ?? '?',
          away_team: (fix.awaySquadName as string) ?? '?',
          home_score: null,
          away_score: null,
          status: isElapsed ? 'finished' : 'scheduled',
          minute: null,
          kickoff,
        }
      })
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

app.post(ROUTES.chat, async (req, res) => {
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

  const system = `<role>You are Edge, a FIFA WC 2026 Fantasy advisor. Reply in ≤120 tokens (text only — actions block excluded). No preamble. No sign-off. Exception: if your reply includes a navigate, optimise_xi, or suggest_transfers action, you may use up to 200 tokens to add one "On [page]:" orientation sentence for the destination page.</role>

<rules>
${buildScoringContext()}
Chips: Wildcard (free full reset, not usable in R32), 12th Man (pick one bench player to score for your team), Max Captain (highest scorer in XI auto-captained), Qualification Booster (+2pts to XI players who progress, R32+ only), Mystery Booster (revealed at R32).
Budget: £100m group stage, £105m from R32. Country limit: 3 group+R32 / 4 R16 / 5 QF / 6 SF / 8 Final. Extra transfers: −3pts each.
Squad: 15 players — 2 GK, 5 DEF, 5 MID, 3 FWD.
</rules>

<squad>${squadNames?.length ? squadNames.join(', ') : 'not set'}</squad>

<actions_guide>
When the user asks you to take an action (navigate, set captain/VC, suggest transfers, optimise XI), append EXACTLY this JSON block at the very end of your reply. Omit it for purely informational replies.
\`\`\`actions
[{"type":"navigate","path":"/transfers"}]
\`\`\`
All action types with exact JSON format:
- Navigate: {"type":"navigate","path":"/squad"} (also /transfers /captain /boosters /live)
- Set captain: {"type":"set_captain","name":"Ronaldo"}
- Set vice captain: {"type":"set_vice_captain","name":"Mbappé"}
- Suggest transfers: {"type":"suggest_transfers"}
- Optimise XI lineup: {"type":"optimise_xi"}
- Show page guide card: {"type":"show_tip","page":"squad"} (also transfers/captain/boosters/live)
Multiple actions allowed: [{"type":"set_captain","name":"Ronaldo"},{"type":"navigate","path":"/squad"}]
For navigate/optimise_xi/suggest_transfers, prepend show_tip for the destination as the first action:
[{"type":"show_tip","page":"squad"},{"type":"optimise_xi"}]
For set_captain and set_vice_captain, use the player's name exactly as it appears in the <squad> list above.
Edge cannot load or change the squad from chat. Do NOT claim to "lock" or "set" a squad — only C/VC and navigation actions are available.
</actions_guide>

<page_guides>
After any navigate/optimise_xi/suggest_transfers action, end your reply with one "On [page]:" sentence using the relevant primer:
/squad — "Tap any player to view stats or swap positions. Green ring = eligible swap partner."
/transfers — "Tap a squad player to transfer out, then pick a replacement. Use Smart suggest for AI-ranked options."
/captain — "Players ranked by projected xP. Tap a row to set captain; tap VC for vice-captain."
/boosters — "Each card shows its best recommended round. Tap to activate."
/live — "Live scores for the current round — informational only."
</page_guides>`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages,
    })
    const raw = response.content.find((b) => b.type === 'text')?.text ?? ''
    const actionsMatch = raw.match(/```actions\n([\s\S]*?)\n```/)
    let actions: unknown[] = []
    let content = raw
    if (actionsMatch) {
      try { actions = JSON.parse(actionsMatch[1]) } catch { /* malformed — ignore */ }
      content = raw.replace(/```actions\n[\s\S]*?\n```/, '').trim()
    }
    res.json({ content, actions })
  } catch (err) {
    res.status(502).json({ error: 'AI request failed', detail: String(err) })
  }
})

// ---- Squad from screenshot ----

app.post(ROUTES.fromScreenshot, async (req, res) => {
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
  if (!isAllowedMime(mimeType)) {
    return res.status(400).json({ error: 'Unsupported image type' })
  }
  try {
    const currentRound = await getCurrentRoundId()
    res.json(await processSquadScreenshot(anthropic, imageBase64, mimeType, currentRound))
  } catch (err) {
    if (err instanceof ScreenshotParseError) return res.status(422).json({ error: err.message })
    if (err instanceof ScreenshotEmptyError) return res.status(422).json({ error: err.message })
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
