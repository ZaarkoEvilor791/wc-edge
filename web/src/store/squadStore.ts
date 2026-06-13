import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SquadPlayer } from '../types/wc'

const DEFAULT_FORMATION = { DEF: 4, MID: 4, FWD: 2 }

export type BoosterState = 'available' | 'active' | 'used'
export const BOOSTER_IDS = ['wildcard', 'max_captain', '12th_man', 'qual_booster', 'cs_shield'] as const
const DEFAULT_BOOSTER_STATES: Record<string, BoosterState> = Object.fromEntries(
  BOOSTER_IDS.map((id) => [id, 'available'])
)

function isValidFormation(f: { DEF: number; MID: number; FWD: number } | undefined): boolean {
  if (!f) return false
  return f.DEF + f.MID + f.FWD === 10 && f.DEF >= 3 && f.MID >= 2 && f.FWD >= 1
}

interface SquadStore {
  squad: SquadPlayer[]
  captain: number | null
  viceCaptain: number | null
  budget: number
  formationCounts: { DEF: number; MID: number; FWD: number }
  boosterStates: Record<string, BoosterState>
  setSquad: (squad: SquadPlayer[]) => void
  setCaptain: (element: number) => void
  setViceCaptain: (element: number) => void
  setBudget: (budget: number) => void
  setFormationCounts: (f: { DEF: number; MID: number; FWD: number }) => void
  setBoosterState: (id: string, state: BoosterState) => void
}

export const useSquadStore = create<SquadStore>()(
  persist(
    (set) => ({
      squad: [],
      captain: null,
      viceCaptain: null,
      budget: 100,
      formationCounts: DEFAULT_FORMATION,
      boosterStates: DEFAULT_BOOSTER_STATES,
      setFormationCounts: (f) => set({ formationCounts: isValidFormation(f) ? f : DEFAULT_FORMATION }),
      setSquad: (squad) => {
        const seen = new Set<number>()
        const deduped = squad.filter((p) => {
          if (p?.element == null) return false
          if (seen.has(p.element)) return false
          seen.add(p.element)
          return true
        })
        set({ squad: deduped })
      },
      setCaptain: (element) => set({ captain: element }),
      setViceCaptain: (element) => set({ viceCaptain: element }),
      setBudget: (budget) => set({ budget }),
      setBoosterState: (id, state) =>
        set((s) => ({ boosterStates: { ...s.boosterStates, [id]: state } })),
    }),
    {
      name: 'wc-edge-squad',
      version: 1,
      migrate: (persistedState: any) => {
        if (!isValidFormation(persistedState?.formationCounts)) {
          return { ...persistedState, formationCounts: DEFAULT_FORMATION }
        }
        return persistedState
      },
    },
  ),
)
