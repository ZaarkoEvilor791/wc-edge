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
      <div className="shrink-0 border-b border-accent/20 bg-slate-900 px-4 py-1.5 text-center text-xs font-medium tracking-wide text-accent/80">
        ⚽&nbsp; FIFA World Cup 2026 · Fantasy Companion
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
