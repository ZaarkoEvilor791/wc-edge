import { useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Assistant from './pages/Assistant'
import Squad from './pages/Squad'
import Transfers from './pages/Transfers'
import Captain from './pages/Captain'
import Live from './pages/Live'
import OnboardingModal from './components/shared/OnboardingModal'
import { useSquadStore } from './store/squadStore'
import { useAppStore } from './store/appStore'

function RequireSquad({ children }: { children: React.ReactNode }) {
  const squad = useSquadStore((s) => s.squad)
  if (squad.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 pt-20 text-center">
        <p className="text-slate-400">You need a squad to use this page.</p>
        <a href="/squad" className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg">
          Go to Squad
        </a>
      </div>
    )
  }
  return <>{children}</>
}

export default function App() {
  const wcOnboardingOpen = useAppStore((s) => s.wcOnboardingOpen)
  const setWcOnboardingOpen = useAppStore((s) => s.setWcOnboardingOpen)
  const [firstVisit] = useState(() => !localStorage.getItem('wc-onboarded'))

  const showOnboarding = firstVisit || wcOnboardingOpen

  return (
    <Layout>
      <OnboardingModal
        open={showOnboarding}
        onClose={() => {
          localStorage.setItem('wc-onboarded', '1')
          setWcOnboardingOpen(false)
        }}
      />
      <Routes>
        <Route path="/" element={<Assistant />} />
        <Route path="/squad" element={<Squad />} />
        <Route path="/transfers" element={<RequireSquad><Transfers /></RequireSquad>} />
        <Route path="/captain" element={<RequireSquad><Captain /></RequireSquad>} />
        <Route path="/live" element={<Live />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
