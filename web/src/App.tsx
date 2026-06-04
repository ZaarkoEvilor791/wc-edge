import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/layout/Layout'
import Assistant from './pages/Assistant'
import Squad from './pages/Squad'
import Transfers from './pages/Transfers'
import Captain from './pages/Captain'
import Live from './pages/Live'
import { useSquadStore } from './store/squadStore'

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
  return (
    <Layout>
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
