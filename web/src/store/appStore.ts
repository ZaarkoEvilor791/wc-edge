import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ChatMessage } from '../types/wc'

interface AppStore {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  mobileMenuOpen: boolean
  setMobileMenuOpen: (v: boolean) => void
  wcOnboardingOpen: boolean
  setWcOnboardingOpen: (v: boolean) => void
  squadViewMode: 'pitch' | 'list'
  setSquadViewMode: (v: 'pitch' | 'list') => void
  // Non-persisted: names the OCR failed to match after screenshot upload
  unmatchedNames: string[] | null
  setUnmatchedNames: (names: string[]) => void
  clearUnmatchedNames: () => void
  // Non-persisted: chat session state (clears on page reload)
  chatMessages: ChatMessage[]
  setChatMessages: (msgs: ChatMessage[]) => void
  chatChipsUsed: boolean
  setChatChipsUsed: (v: boolean) => void
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      mobileMenuOpen: false,
      setMobileMenuOpen: (v) => set({ mobileMenuOpen: v }),
      wcOnboardingOpen: false,
      setWcOnboardingOpen: (v) => set({ wcOnboardingOpen: v }),
      squadViewMode: 'pitch' as const,
      setSquadViewMode: (v) => set({ squadViewMode: v }),
      unmatchedNames: null,
      setUnmatchedNames: (names) => set({ unmatchedNames: names.length > 0 ? names : null }),
      clearUnmatchedNames: () => set({ unmatchedNames: null }),
      chatMessages: [],
      setChatMessages: (msgs) => set({ chatMessages: msgs }),
      chatChipsUsed: false,
      setChatChipsUsed: (v) => set({ chatChipsUsed: v }),
    }),
    {
      name: 'wc-edge-storage',
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed, squadViewMode: state.squadViewMode }),
    },
  ),
)
