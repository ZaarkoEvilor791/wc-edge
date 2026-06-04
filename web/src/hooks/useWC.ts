import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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

export function useCurrentRound() {
  const { data: rounds } = useRounds()
  if (!rounds) return null
  return rounds.find((r) => r.status === 'active') ?? rounds[0] ?? null
}
