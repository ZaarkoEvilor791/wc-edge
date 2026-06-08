import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppStore {
  sidebarCollapsed: boolean
  toggleSidebar: () => void
  mobileMenuOpen: boolean
  setMobileMenuOpen: (v: boolean) => void
  wcOnboardingOpen: boolean
  setWcOnboardingOpen: (v: boolean) => void
  // Non-persisted: names the OCR failed to match after screenshot upload
  unmatchedNames: string[] | null
  setUnmatchedNames: (names: string[]) => void
  clearUnmatchedNames: () => void
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
      unmatchedNames: null,
      setUnmatchedNames: (names) => set({ unmatchedNames: names.length > 0 ? names : null }),
      clearUnmatchedNames: () => set({ unmatchedNames: null }),
    }),
    {
      name: 'wc-edge-storage',
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
)
