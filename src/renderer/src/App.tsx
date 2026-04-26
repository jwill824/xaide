import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { IconRail, type IconRailItem } from './components/IconRail'
import { LeftPanel } from './components/LeftPanel'
import { MainArea } from './components/MainArea'
import { TitleBar } from './components/TitleBar'

const RAIL_DEFS = [
  { id: 'agents', icon: '⬡', label: 'Agents' },
  { id: 'tasks', icon: '☰', label: 'Tasks' },
  { id: 'extensions', icon: '⊞', label: 'Extensions' },
  { id: 'settings', icon: '⚙', label: 'Settings' },
] as const

type PanelId = typeof RAIL_DEFS[number]['id']

function AppInner() {
  const [activePanel, setActivePanel] = useState<PanelId>('agents')

  const railItems: IconRailItem[] = RAIL_DEFS.map((def) => ({
    ...def,
    active: activePanel === def.id,
    onClick: () => setActivePanel(def.id),
  }))

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-100">
      <TitleBar />
      <div className="flex flex-1 min-h-0">
        <IconRail items={railItems} />
        {activePanel === 'agents' && <LeftPanel />}
        <MainArea />
      </div>
    </div>
  )
}

export function App() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  }))
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  )
}
