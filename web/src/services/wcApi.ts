import type { Player, Round, Team, Projection, SuggestedSquad, TransferSuggestResponse, Fixture, TeamFdr, ChatAction } from '../types/wc'
import { ROUTES } from '../config/routes'

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
  players: () => get<Player[]>(ROUTES.players),
  teams: () => get<Team[]>(ROUTES.teams),
  rounds: () => get<Round[]>(ROUTES.rounds),
  projections: (round: number) => get<Projection[]>(`${ROUTES.projections}?round=${round}`),
  suggestedSquad: () => get<SuggestedSquad>(ROUTES.suggestSquad),
  suggestedSquadVariant: (variant: string) => get<SuggestedSquad>(`${ROUTES.suggestSquad}?variant=${encodeURIComponent(variant)}`),
  optimizeSquad: (body: { round?: number }) => post<SuggestedSquad>(ROUTES.optimizeSquad, body),
  transferSuggest: (body: { squad: number[]; round: number; freeTransfers: number; budget?: number }) =>
    post<TransferSuggestResponse>(ROUTES.suggestTransfers, body),
  live: (round: number) => get<unknown>(`${ROUTES.live}?round=${round}`),
  chat: (body: { messages: { role: string; content: string }[]; squad?: number[]; squadNames?: string[] }) =>
    post<{ content: string; actions: ChatAction[] }>(ROUTES.chat, body),
  squadFromScreenshot: (imageBase64: string, mimeType: string) =>
    post<{ matched: import('../types/wc').SquadPlayer[]; unmatched: string[]; total: number }>(
      ROUTES.fromScreenshot,
      { imageBase64, mimeType },
    ),
  fixtures: (squadId: number) => get<Fixture[]>(ROUTES.fixtures(squadId)),
  teamFdr: (round: number) => get<TeamFdr[]>(`${ROUTES.fdr}?round=${round}`),
  // FIFA Fantasy proxies
  fifaPlayers: () => get<unknown[]>(ROUTES.fifaPlayers),
  fifaRounds: () => get<unknown[]>(ROUTES.fifaRounds),
}
