import type { Player, Round, Team, Projection, SuggestedSquad, TransferSuggestResponse, Fixture } from '../types/wc'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`)
  return res.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`)
  return res.json() as Promise<T>
}

export const wcApi = {
  players: () => get<Player[]>('/api/players'),
  teams: () => get<Team[]>('/api/teams'),
  rounds: () => get<Round[]>('/api/rounds'),
  projections: (round: number) => get<Projection[]>(`/api/projections?round=${round}`),
  suggestedSquad: () => get<SuggestedSquad>('/api/squad/suggest'),
  optimizeSquad: (body: { round?: number }) => post<SuggestedSquad>('/api/squad/optimize', body),
  transferSuggest: (body: { squad: number[]; round: number; freeTransfers: number; budget?: number }) =>
    post<TransferSuggestResponse>('/api/transfers/suggest', body),
  live: (round: number) => get<unknown>(`/api/live?round=${round}`),
  chat: (body: { messages: { role: string; content: string }[]; squad?: number[]; squadNames?: string[] }) =>
    post<{ content: string }>('/api/chat', body),
  squadFromScreenshot: (imageBase64: string, mimeType: string) =>
    post<{ matched: import('../types/wc').SquadPlayer[]; unmatched: string[]; total: number }>(
      '/api/squad/from-screenshot',
      { imageBase64, mimeType },
    ),
  fixtures: (squadId: number) => get<Fixture[]>(`/api/fixtures/${squadId}`),
  // FIFA Fantasy proxies
  fifaPlayers: () => get<unknown[]>('/wc/players.json'),
  fifaRounds: () => get<unknown[]>('/wc/rounds.json'),
}
