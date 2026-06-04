import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SquadPlayer } from '../types/wc'

interface SquadStore {
  squad: SquadPlayer[]
  captain: number | null
  viceCaptain: number | null
  bench: number[]
  budget: number
  setSquad: (squad: SquadPlayer[]) => void
  setCaptain: (element: number) => void
  setViceCaptain: (element: number) => void
  setBudget: (budget: number) => void
}

export const useSquadStore = create<SquadStore>()(
  persist(
    (set) => ({
      squad: [],
      captain: null,
      viceCaptain: null,
      bench: [],
      budget: 100,
      setSquad: (squad) => {
        // Deduplicate by element before storing
        const seen = new Set<number>()
        const deduped = squad.filter((p) => {
          if (seen.has(p.element)) return false
          seen.add(p.element)
          return true
        })
        set({ squad: deduped })
      },
      setCaptain: (element) => set({ captain: element }),
      setViceCaptain: (element) => set({ viceCaptain: element }),
      setBudget: (budget) => set({ budget }),
    }),
    {
      name: 'wc-edge-squad',
    },
  ),
)
