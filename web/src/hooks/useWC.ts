import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { wcApi } from '../services/wcApi'
import { TOTAL_ROUNDS } from '../config/gameRules'

export function usePlayers() {
  return useQuery({ queryKey: ['players'], queryFn: wcApi.players, staleTime: 5 * 60_000 })
}

export function useTeams() {
  return useQuery({ queryKey: ['teams'], queryFn: wcApi.teams, staleTime: 30 * 60_000 })
}

export function useRounds() {
  return useQuery({ queryKey: ['rounds'], queryFn: wcApi.rounds, staleTime: 5 * 60_000 })
}

export function useProjections(round: number) {
  return useQuery({
    queryKey: ['projections', round],
    queryFn: () => wcApi.projections(round),
    staleTime: 5 * 60_000,
    enabled: round > 0,
  })
}

export function useSuggestedSquad() {
  return useQuery({
    queryKey: ['suggestedSquad'],
    queryFn: wcApi.suggestedSquad,
    staleTime: 5 * 60_000,
  })
}

export function useOptimizeSquad() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { round?: number }) => wcApi.optimizeSquad(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suggestedSquad'] }),
  })
}

export function useSquadFromScreenshot() {
  return useMutation({
    mutationFn: ({ imageBase64, mimeType }: { imageBase64: string; mimeType: string }) =>
      wcApi.squadFromScreenshot(imageBase64, mimeType),
  })
}

export function usePlayerProjectionsAllRounds(element: number) {
  const queries = useQueries({
    queries: Array.from({ length: TOTAL_ROUNDS }, (_, i) => i + 1).map((round) => ({
      queryKey: ['projections', round],
      queryFn: () => wcApi.projections(round),
      staleTime: 5 * 60_000,
    })),
  })
  return queries.map((q, i) => {
    const proj = q.data?.find((p) => p.element === element)
    return {
      round: i + 1,
      xp: proj?.xp ?? 0,
      p_goal: proj?.p_goal ?? 0,
      p_cs: proj?.p_cs ?? 0,
      variance: proj?.variance ?? 0,
      p_play: proj?.p_play ?? 0,
      mf: proj?.mf ?? 0,
      loading: q.isLoading,
    }
  })
}

export function useFixtures(squadId: number) {
  return useQuery({
    queryKey: ['fixtures', squadId],
    queryFn: () => wcApi.fixtures(squadId),
    staleTime: 5 * 60_000,
    enabled: squadId > 0,
  })
}

export function useTeamFdr(round: number) {
  return useQuery({
    queryKey: ['teamFdr', round],
    queryFn: () => wcApi.teamFdr(round),
    staleTime: 30 * 60_000,
    enabled: round > 0,
  })
}

export function useTransferSuggest() {
  return useMutation({
    mutationFn: (body: { squad: number[]; round: number; freeTransfers: number; budget?: number }) =>
      wcApi.transferSuggest(body),
  })
}

export function useCurrentRound() {
  const { data: rounds } = useRounds()
  if (!rounds) return null
  return rounds.find((r) => r.status === 'active' || r.status === 'playing') ?? rounds[0] ?? null
}
