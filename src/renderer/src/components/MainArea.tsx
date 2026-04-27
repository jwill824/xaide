import { useCallback, useMemo, useState } from 'react'
import type { FC } from 'react'
import { useUiStore } from '../store/uiStore'
import { useActiveWorkspace } from '../hooks/useActiveWorkspace'
import { SessionTabBar } from './SessionTabBar'
import { PaneSplit } from './PaneSplit'
import { AgentLauncher } from './AgentLauncher'
import { useLaunchAgent } from '../hooks/useAgents'
import { useWorktrees } from '../hooks/useWorktrees'
import type { PaneNode } from '../types/layout'
import type { AgentSessionUiRecord } from '../store/uiStore'

export const MainArea: FC = () => {
  const activeWorkspaceId = useUiStore((s) => s.activeWorkspaceId)
  const activeSessionId = useUiStore((s) =>
    activeWorkspaceId ? s.activeSessionIdByWorkspace[activeWorkspaceId] ?? null : null,
  )
  const layout = useUiStore((s) =>
    activeWorkspaceId ? s.layoutByWorkspace[activeWorkspaceId] ?? null : null,
  )
  const allSessions = useUiStore((s) => s.sessions)
  const addSession = useUiStore((s) => s.addSession)
  const removeSession = useUiStore((s) => s.removeSession)
  const setActiveSession = useUiStore((s) => s.setActiveSession)
  const setLayout = useUiStore((s) => s.setLayout)
  const workspace = useActiveWorkspace()

  const [showLauncher, setShowLauncher] = useState(false)
  const launchAgent = useLaunchAgent()
  const { data: worktrees = [] } = useWorktrees(activeWorkspaceId)
  const allAgentSessions = useUiStore((s) => s.agentSessions)
  const addAgentSession = useUiStore((s) => s.addAgentSession)
  const removeAgentSession = useUiStore((s) => s.removeAgentSession)

  const agentNames: Record<string, string> = { claude: 'Claude Code', copilot: 'Copilot' }

  const agentSessions = useMemo(
    () => allAgentSessions.filter((a) => a.workspaceId === activeWorkspaceId),
    [allAgentSessions, activeWorkspaceId],
  )

  const sessions = useMemo(
    () => allSessions.filter((s) => s.workspaceId === activeWorkspaceId),
    [allSessions, activeWorkspaceId],
  )

  const openNewSession = useCallback(async () => {
    if (!activeWorkspaceId || !workspace) return
    const sessionId = await window.xaide.pty.create({
      workspaceId: activeWorkspaceId,
      cols: 80,
      rows: 24,
      cwd: workspace.repoPath,
    })
    addSession({
      id: sessionId,
      workspaceId: activeWorkspaceId,
      title: 'shell',
      cwd: workspace.repoPath,
    })
  }, [activeWorkspaceId, workspace, addSession])

  const closeSession = useCallback(
    async (id: string) => {
      await window.xaide.pty.kill(id)
      removeSession(id)
    },
    [removeSession],
  )

  const handleLayoutChange = useCallback(
    (node: PaneNode) => {
      if (!activeWorkspaceId) return
      setLayout(activeWorkspaceId, node)
      window.xaide.workspace.saveLayout(activeWorkspaceId, JSON.stringify(node))
    },
    [activeWorkspaceId, setLayout],
  )

  const handleLaunchAgent = async (agentId: string, worktreeId: string, sandboxName?: string) => {
    const wt = worktrees.find((w) => w.id === worktreeId)
    if (!wt || !activeWorkspaceId) return
    try {
      const record = await launchAgent.mutateAsync({
        agentId,
        worktreeId,
        worktreePath: wt.worktreePath,
        branch: wt.branch,
        sandboxName,
      })
      setShowLauncher(false)
      const uiRecord: AgentSessionUiRecord = {
        id: record.id,
        ptySessionId: record.ptySessionId ?? record.id,
        agentId: record.agentId,
        agentName: agentNames[agentId] ?? agentId,
        branch: record.branch,
        worktreeId,
        workspaceId: activeWorkspaceId,
        sandboxName: record.containerId ?? undefined,  // DB column stores sbx name
      }
      addAgentSession(uiRecord)
      addSession({
        id: record.ptySessionId ?? record.id,
        workspaceId: activeWorkspaceId,
        title: `${agentNames[agentId] ?? agentId} (${wt.branch})`,
        cwd: wt.worktreePath,
      })
    } catch (err) {
      console.error('[AgentLauncher] failed to launch agent:', err)
    }
  }

  const handleKillAgentSession = useCallback(
    async (id: string) => {
      const session = agentSessions.find((s) => s.id === id)
      if (!session) return
      await window.xaide.agent.killSession(id, session.ptySessionId ?? '', session.sandboxName ?? undefined)
      removeAgentSession(id)
      await closeSession(id)
    },
    [agentSessions, removeAgentSession, closeSession],
  )

  const handleCloseSession = useCallback(
    async (tabId: string) => {
      const agentSession = agentSessions.find(
        (s) => s.ptySessionId === tabId || s.id === tabId,
      )
      if (agentSession) {
        await handleKillAgentSession(agentSession.id)
      } else {
        await closeSession(tabId)
      }
    },
    [agentSessions, handleKillAgentSession, closeSession],
  )

  if (!activeWorkspaceId) {
    return (
      <main className="flex-1 min-w-0 bg-neutral-950 flex items-center justify-center">
        <p className="text-neutral-600 text-sm select-none">Open a workspace to get started</p>
      </main>
    )
  }

  return (
    <main className="flex-1 min-w-0 bg-neutral-950 flex flex-col overflow-hidden">
      <div className="relative">
        {showLauncher && (
          <AgentLauncher
            worktrees={worktrees}
            onLaunch={handleLaunchAgent}
            onClose={() => setShowLauncher(false)}
          />
        )}
      </div>
      <SessionTabBar
        workspaceId={activeWorkspaceId}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={(id) => setActiveSession(activeWorkspaceId, id)}
        onNewSession={openNewSession}
        onCloseSession={handleCloseSession}
        onOpenAgentLauncher={() => setShowLauncher(true)}
      />
      <div className="flex-1 overflow-hidden min-h-0">
        {layout ? (
          <PaneSplit node={layout} onLayoutChange={handleLayoutChange} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-neutral-600 text-sm select-none">No sessions open</p>
          </div>
        )}
      </div>
    </main>
  )
}
