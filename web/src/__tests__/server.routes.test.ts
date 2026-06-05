/**
 * Server integration tests — PRD testing decisions §
 *
 * Mocks the DB layer (./server/db) so tests run without a real Postgres connection.
 * Mocks global fetch for the live endpoint upstream.
 *
 * Run with: cd web && npm test
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import request from 'supertest'

// ---- Mock DB module before importing the server ----
vi.mock('../../server/db', () => ({
  dbEnabled: true,
  getPlayers: vi.fn(),
  getTeams: vi.fn(),
  getRounds: vi.fn(),
  getProjections: vi.fn(),
  getSuggestedSquad: vi.fn(),
  getCurrentRoundId: vi.fn(),
  matchPlayersByName: vi.fn(),
  getTeamFdr: vi.fn(),
}))

// ---- Mock Anthropic SDK ----
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Mock AI response' }],
      }),
    },
  })),
}))

import * as db from '../../server/db'
import { app } from '../../server/server'

// ----- shared fixture data -----
const PLAYERS = [
  { element: 1, known_name: 'Mbappé', first_name: null, last_name: null, position: 'FWD', price: 14.0, squad_id: 3, status: 'active', percent_selected: 45 },
  { element: 2, known_name: 'Salah', first_name: null, last_name: null, position: 'MID', price: 12.0, squad_id: 5, status: 'active', percent_selected: 38 },
  { element: 3, known_name: null, first_name: 'Trent', last_name: 'Alexander-Arnold', position: 'DEF', price: 8.0, squad_id: 5, status: 'active', percent_selected: 12 },
]

const TEAMS = [
  { squad_id: 3, name: 'France', abbr: 'FRA', seed: 1, group_name: 'D', is_active: true },
  { squad_id: 5, name: 'Egypt', abbr: 'EGY', seed: 3, group_name: 'A', is_active: true },
  { squad_id: 7, name: 'Eliminated FC', abbr: 'ELM', seed: 4, group_name: 'B', is_active: false },
]

const PROJECTIONS = [
  { element: 1, round: 1, xp: 9.5, variance: 7.6, p_goal: 0.4, p_cs: 0.0, low_sample: false },
  { element: 2, round: 1, xp: 7.2, variance: 5.8, p_goal: 0.3, p_cs: 0.1, low_sample: false },
  { element: 3, round: 1, xp: 5.1, variance: 4.1, p_goal: 0.1, p_cs: 0.35, low_sample: false },
]

beforeAll(() => {
  process.env.NODE_ENV = 'test'
  process.env.ANTHROPIC_API_KEY = 'test-key'
  vi.mocked(db.getPlayers).mockResolvedValue(PLAYERS as any)
  vi.mocked(db.getTeams).mockResolvedValue(TEAMS as any)
  vi.mocked(db.getRounds).mockResolvedValue([{ id: 1, stage: 'GROUP', start_date: '', end_date: '', status: 'active' }] as any)
  vi.mocked(db.getProjections).mockResolvedValue(PROJECTIONS as any)
  vi.mocked(db.getCurrentRoundId).mockResolvedValue(1)
  vi.mocked(db.getSuggestedSquad).mockResolvedValue(undefined as any)
  vi.mocked(db.getTeamFdr).mockResolvedValue([])
})

afterAll(() => {
  vi.restoreAllMocks()
})


// ---------------------------------------------------------------------------
// POST /api/transfers/suggest
// ---------------------------------------------------------------------------

describe('POST /api/transfers/suggest', () => {
  it('returns 400 when squad array is missing', async () => {
    const res = await request(app)
      .post('/api/transfers/suggest')
      .send({ round: 1, freeTransfers: 2 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/squad/)
  })

  it('returns 400 when round is missing', async () => {
    const res = await request(app)
      .post('/api/transfers/suggest')
      .send({ squad: [1, 2], freeTransfers: 2 })
    expect(res.status).toBe(400)
  })

  it('returns 400 when freeTransfers is missing', async () => {
    const res = await request(app)
      .post('/api/transfers/suggest')
      .send({ squad: [1, 2], round: 1 })
    expect(res.status).toBe(400)
  })

  it('returns transfers array for valid request', async () => {
    const res = await request(app)
      .post('/api/transfers/suggest')
      .send({ squad: [1, 2, 3], round: 1, freeTransfers: 2, budget: 100 })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('transfers')
    expect(Array.isArray(res.body.transfers)).toBe(true)
  })
})


// ---------------------------------------------------------------------------
// GET /api/live — stale fallback behavior
// ---------------------------------------------------------------------------

describe('GET /api/live', () => {
  it('returns stale:true when community API is unavailable', async () => {
    // Mock global fetch to simulate upstream 503
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const res = await request(app).get('/api/live?round=1')

    expect(res.status).toBe(200)
    expect(res.body.stale).toBe(true)
    expect(res.body).toHaveProperty('matches')

    global.fetch = originalFetch
  })

  it('returns data when community API succeeds', async () => {
    const mockData = { matches: [{ id: 1, home_team: 'FRA', away_team: 'EGY' }] }
    const originalFetch = global.fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    } as Response)

    const res = await request(app).get('/api/live?round=1')

    expect(res.status).toBe(200)

    global.fetch = originalFetch
  })
})


// ---------------------------------------------------------------------------
// POST /api/chat — squad context injection
// ---------------------------------------------------------------------------

describe('POST /api/chat', () => {
  it('accepts message array and returns content', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({
        messages: [{ role: 'user', content: 'Who should I captain?' }],
        squadNames: ['Mbappé', 'Salah'],
      })
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('content')
    expect(typeof res.body.content).toBe('string')
  })

  it('responds without error when squadNames is empty', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({
        messages: [{ role: 'user', content: 'Give me transfer advice' }],
        squadNames: [],
      })
    expect(res.status).toBe(200)
  })

  it('responds without error when squadNames is omitted', async () => {
    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', content: 'Best GK picks?' }] })
    expect(res.status).toBe(200)
  })
})
