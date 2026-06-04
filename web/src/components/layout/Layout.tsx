import type { ReactNode } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { useAppStore } from '../../store/appStore'

export default function Layout({ children }: { children: ReactNode }) {
  const mobileMenuOpen = useAppStore((s) => s.mobileMenuOpen)
  const setMobileMenuOpen = useAppStore((s) => s.setMobileMenuOpen)

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* FIFA WC 2026 banner */}
      <div className="shrink-0 flex items-center justify-between bg-gradient-to-r from-wc-navy via-slate-900 to-wc-navy px-4" style={{ height: '48px' }}>
        <span className="text-xs font-semibold uppercase tracking-widest text-accent">
          FIFA World Cup 2026™
        </span>
        <span className="hidden text-xs text-slate-400 sm:block">USA · Canada · Mexico</span>
      </div>

      {/* Sidebar + main content */}
      <div className="flex flex-1 overflow-hidden">
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-10 bg-black/60 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  )
}
