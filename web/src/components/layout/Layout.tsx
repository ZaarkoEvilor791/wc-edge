import type { ReactNode } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import BottomTabBar from './BottomTabBar'
import { useAppStore } from '../../store/appStore'

export default function Layout({ children }: { children: ReactNode }) {
  const mobileMenuOpen = useAppStore((s) => s.mobileMenuOpen)
  const setMobileMenuOpen = useAppStore((s) => s.setMobileMenuOpen)

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Top banner */}
      <div
        className="relative shrink-0 flex items-center justify-between overflow-hidden px-4 bg-gradient-to-r from-slate-950 via-[#080f1e] to-slate-950 border-b border-cyan/10"
        style={{ height: '48px' }}
      >
        {/* Ambient gradient wash */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-cyan/[0.04] via-transparent to-accent/[0.04]" />
        {/* Animated scan line */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan/30 to-transparent animate-scan opacity-60" />
        <span className="relative text-xs font-semibold uppercase tracking-widest text-accent">
          FIFA World Cup 2026™
        </span>
        <span className="relative hidden text-xs text-slate-500 sm:block">USA · Canada · Mexico</span>
      </div>

      {/* Sidebar + main content */}
      <div className="flex flex-1 overflow-hidden">
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-10 bg-black/70 backdrop-blur-sm md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 overflow-auto p-4 pb-20 md:p-6 md:pb-6">{children}</main>
        </div>
      </div>
      <BottomTabBar />
    </div>
  )
}
