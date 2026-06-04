import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { SquadPlayer } from '../types/wc'

interface SquadStore {
  squad: SquadPlayer[]
  captain: number | null
  bench: number[]
  budget: number
  setSquad: (squad: SquadPlayer[]) => void
  setCaptain: (element: number) => void
  setBudget: (budget: number) => void
}

export const useSquadStore = create<SquadStore>()(
  persist(
    (set) => ({
      squad: [],
      captain: null,
      bench: [],
      budget: 100,
      setSquad: (squad) => set({ squad }),
      setCaptain: (element) => set({ captain: element }),
      setBudget: (budget) => set({ budget }),
    }),
    {
      name: 'wc-edge-squad',
    },
  ),
)
