import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'

function EdgeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="10" cy="10" r="8" />
      <path d="M7 10h6M10 7l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function SquadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <circle cx="10" cy="8" r="2" />
      <path d="M6 16c0-2.2 1.8-4 4-4s4 1.8 4 4" strokeLinecap="round" />
    </svg>
  )
}
function TransferIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 8h12M13 5l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 12H4M7 9l-3 3 3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function CaptainIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M10 2l2 5h5l-4 3 1.5 5L10 12l-4.5 3L7 10 3 7h5z" strokeLinejoin="round" />
    </svg>
  )
}
function MoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="5" cy="10" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

const TABS = [
  { path: '/', label: 'Edge', icon: <EdgeIcon />, exact: true },
  { path: '/squad', label: 'Squad', icon: <SquadIcon />, exact: false },
  { path: '/transfers', label: 'Transfers', icon: <TransferIcon />, exact: false },
  { path: '/captain', label: 'Captain', icon: <CaptainIcon />, exact: false },
]

const activeClass = 'text-accent'
const inactiveClass = 'text-slate-500'

export default function BottomTabBar() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const navigate = useNavigate()

  const goTo = (path: string) => {
    setSheetOpen(false)
    navigate(path)
  }

  return (
    <>
      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 inset-x-0 z-40 flex h-16 items-stretch border-t border-slate-800 bg-slate-900 md:hidden">
        {TABS.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            end={tab.exact}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${isActive ? activeClass : inactiveClass}`
            }
          >
            {tab.icon}
            <span className="text-[10px] font-medium">{tab.label}</span>
          </NavLink>
        ))}

        {/* More button */}
        <button
          onClick={() => setSheetOpen(true)}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors ${sheetOpen ? activeClass : inactiveClass}`}
        >
          <MoreIcon />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>

      {/* More sheet */}
      {sheetOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setSheetOpen(false)}
          />
          <div className="fixed inset-x-0 bottom-16 z-50 rounded-t-2xl border-t border-slate-700 bg-slate-900 pb-2 md:hidden">
            <div className="mx-auto mt-2 mb-3 h-1 w-10 rounded-full bg-slate-700" />
            <button
              onClick={() => goTo('/boosters')}
              className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-slate-800"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-slate-400">
                <path d="M10 2l1.5 4.5H16l-3.5 2.5 1.3 4.5L10 11l-3.8 2.5 1.3-4.5L4 6.5h4.5z" strokeLinejoin="round" />
              </svg>
              <div>
                <p className="text-sm font-medium text-slate-100">Boosters</p>
                <p className="text-xs text-slate-500">Chips and power-ups for your squad</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="ml-auto shrink-0 text-slate-600">
                <path d="M5 3l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={() => goTo('/live')}
              className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-slate-800"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0 text-slate-400">
                <circle cx="10" cy="10" r="3" />
                <circle cx="10" cy="10" r="7" strokeDasharray="2 3" />
              </svg>
              <div>
                <p className="text-sm font-medium text-slate-100">Live</p>
                <p className="text-xs text-slate-500">Live scores and match tracker</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="ml-auto shrink-0 text-slate-600">
                <path d="M5 3l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </>
      )}
    </>
  )
}
