import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { wcApi } from '../services/wcApi'

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

export function usePlayerProjectionsAllRounds(element: number) {
  const queries = useQueries({
    queries: [1, 2, 3, 4, 5, 6, 7, 8].map((round) => ({
      queryKey: ['projections', round],
      queryFn: () => wcApi.projections(round),
      staleTime: 5 * 60_000,
    })),
  })
  return queries.map((q, i) => ({
    round: i + 1,
    xp: q.data?.find((p) => p.element === element)?.xp ?? 0,
    p_goal: q.data?.find((p) => p.element === element)?.p_goal ?? 0,
    p_cs: q.data?.find((p) => p.element === element)?.p_cs ?? 0,
    variance: q.data?.find((p) => p.element === element)?.variance ?? 0,
    p_play: q.data?.find((p) => p.element === element)?.p_play ?? 0,
    mf: q.data?.find((p) => p.element === element)?.mf ?? 0,
    loading: q.isLoading,
  }))
}

export function useCurrentRound() {
  const { data: rounds } = useRounds()
  if (!rounds) return null
  return rounds.find((r) => r.status === 'active') ?? rounds[0] ?? null
}
