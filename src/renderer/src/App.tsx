import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { IconRail, type IconRailItem } from './components/IconRail'
import { LeftPanel } from './components/LeftPanel'
import { MainArea } from './components/MainArea'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

type PanelId = 'agents' | 'tasks' | 'extensions' | 'settings'

const RAIL_DEFS: Array<{ id: PanelId; icon: string; label: string }> = [
  { id: 'agents', icon: '⬡', label: 'Agents' },
  { id: 'tasks', icon: '☰', label: 'Tasks' },
  { id: 'extensions', icon: '⊞', label: 'Extensions' },
  { id: 'settings', icon: '⚙', label: 'Settings' },
]

function AppInner() {
  const [activePanel, setActivePanel] = useState<PanelId>('agents')

  const railItems: IconRailItem[] = RAIL_DEFS.map((def) => ({
    ...def,
    active: activePanel === def.id,
    onClick: () => setActivePanel(def.id),
  }))

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-100">
      <IconRail items={railItems} />
      {activePanel === 'agents' && <LeftPanel />}
      <MainArea />
    </div>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  )
}
