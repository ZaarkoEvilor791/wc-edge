import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { useAppStore } from '../../store/appStore'
import { Logo, LogoMark } from '../shared/Logo'

function Icon({ path, viewBox = '0 0 24 24' }: { path: React.ReactNode; viewBox?: string }) {
  return (
    <svg
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
      aria-hidden
    >
      {path}
    </svg>
  )
}

const Icons = {
  assistant: (
    <Icon path={<>
      <polyline points="2,18 7,10 11,14 20,3" />
      <polyline points="15,3 20,3 20,8" />
    </>} />
  ),
  squad: (
    <Icon path={<>
      <circle cx="9" cy="7" r="3" />
      <circle cx="17" cy="7" r="3" />
      <path d="M2 21v-1a7 7 0 0 1 14 0v1" />
      <path d="M22 21v-1a4 4 0 0 0-4-4" />
    </>} />
  ),
  transfers: (
    <Icon path={<>
      <path d="M7 16V4m0 0L3 8m4-4 4 4" />
      <path d="M17 8v12m0 0 4-4m-4 4-4-4" />
    </>} />
  ),
  captain: (
    <Icon path={<>
      <path d="M12 2l2.09 6.26L20 9.27l-4.91 4.73L16.18 20 12 17.27 7.82 20l1.09-6-4.91-4.73 5.91-.01z" />
    </>} />
  ),
  boosters: (
    <Icon path={<>
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </>} />
  ),
  live: (
    <Icon path={<>
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13" />
    </>} />
  ),
}

type IconKey = keyof typeof Icons

const NAV: Array<{ to: string; label: string; icon: IconKey }> = [
  { to: '/',          label: 'Assistant', icon: 'assistant' },
  { to: '/squad',     label: 'Squad',     icon: 'squad'     },
  { to: '/transfers', label: 'Transfers', icon: 'transfers' },
  { to: '/captain',   label: 'Captain',   icon: 'captain'   },
  { to: '/boosters',  label: 'Boosters',  icon: 'boosters'  },
  { to: '/live',      label: 'Live',      icon: 'live'      },
]

export default function Sidebar() {
  const collapsed        = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar    = useAppStore((s) => s.toggleSidebar)
  const mobileMenuOpen   = useAppStore((s) => s.mobileMenuOpen)
  const setMobileMenuOpen = useAppStore((s) => s.setMobileMenuOpen)

  const isCollapsed = collapsed && !mobileMenuOpen

  return (
    <aside
      className={clsx(
        'fixed inset-y-0 left-0 z-20 flex shrink-0 flex-col border-r border-white/[0.06] bg-slate-950/90 backdrop-blur-xl transition-all duration-200',
        'md:relative md:inset-auto md:z-auto md:translate-x-0',
        mobileMenuOpen ? 'translate-x-0 w-52' : '-translate-x-full w-52',
        collapsed ? 'md:w-[58px]' : 'md:w-52',
      )}
    >
      {/* Logo / wordmark */}
      <div className={clsx(
        'flex h-14 items-center border-b border-white/[0.05]',
        isCollapsed ? 'justify-center' : 'px-5',
      )}>
        {isCollapsed ? <LogoMark /> : <Logo />}
        {mobileMenuOpen && (
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="ml-auto rounded p-1 text-slate-400 hover:text-slate-200 md:hidden"
            aria-label="Close menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className={clsx('mt-3 flex flex-col gap-0.5', isCollapsed ? 'px-2' : 'px-3')}>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            title={isCollapsed ? item.label : undefined}
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              clsx(
                'flex items-center rounded-lg py-2 text-sm font-medium transition-all duration-150',
                isCollapsed ? 'justify-center px-0' : 'gap-2.5 px-3',
                isActive
                  ? 'border-l-2 border-accent bg-accent/10 text-accent shadow-[inset_0_0_12px_rgba(232,184,75,0.07)]'
                  : 'border-l-2 border-transparent text-slate-400 hover:bg-white/[0.04] hover:text-slate-100',
              )
            }
          >
            {Icons[item.icon]}
            {!isCollapsed && item.label}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle — desktop only */}
      <button
        onClick={toggleSidebar}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className={clsx(
          'absolute -right-3 top-[52px] z-10 hidden h-6 w-6 items-center justify-center',
          'rounded-full border border-white/[0.08] bg-slate-950 text-slate-400',
          'hover:border-accent/60 hover:text-accent hover:shadow-[0_0_8px_rgba(232,184,75,0.3)] transition-all duration-150 shadow-sm',
          'md:flex',
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={clsx('h-3 w-3 transition-transform duration-200', collapsed ? 'rotate-180' : 'rotate-0')}
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
    </aside>
  )
}
