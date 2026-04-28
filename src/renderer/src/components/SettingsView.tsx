import { useState } from 'react'
import type { FC } from 'react'
import { SettingsNav } from './SettingsNav'
import type { SettingsSection } from './SettingsNav'
import { AgentConfigSection } from './AgentConfigSection'
import { HooksSection } from './HooksSection'
import { McpServersSection } from './McpServersSection'
import { useUiStore } from '../store/uiStore'

export const SettingsView: FC = () => {
  const [activeSection, setActiveSection] = useState<SettingsSection>('agent-config')
  const activeWorkspaceId = useUiStore((s) => s.activeWorkspaceId)

  return (
    <main className="flex-1 min-w-0 bg-neutral-950 flex overflow-hidden">
      <SettingsNav activeSection={activeSection} onSelect={setActiveSection} />
      <div className="flex-1 overflow-y-auto p-6">
        {activeSection === 'agent-config' && (
          <AgentConfigSection workspaceId={activeWorkspaceId} />
        )}
        {activeSection === 'hooks' && <HooksSection workspaceId={activeWorkspaceId} />}
        {activeSection === 'mcp-servers' && (
          <McpServersSection workspaceId={activeWorkspaceId} />
        )}
      </div>
    </main>
  )
}
