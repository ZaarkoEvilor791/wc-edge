import { useAppStore } from '../../store/appStore'

export default function TopBar() {
  const setMobileMenuOpen = useAppStore((s) => s.setMobileMenuOpen)

  return (
    <header className="flex h-12 shrink-0 items-center border-b border-slate-800 bg-slate-900 px-4 md:hidden">
      <button
        onClick={() => setMobileMenuOpen(true)}
        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-slate-400 hover:text-slate-200"
        aria-label="Open menu"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <span className="ml-3 text-sm font-semibold text-accent">wc-edge</span>
    </header>
  )
}
