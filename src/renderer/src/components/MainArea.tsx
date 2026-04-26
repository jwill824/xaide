import { useCallback, useMemo } from 'react'
import type { FC } from 'react'
import { useUiStore } from '../store/uiStore'
import { useActiveWorkspace } from '../hooks/useActiveWorkspace'
import { SessionTabBar } from './SessionTabBar'
import { PaneSplit } from './PaneSplit'
import type { PaneNode } from '../types/layout'

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

  if (!activeWorkspaceId) {
    return (
      <main className="flex-1 min-w-0 bg-neutral-950 flex items-center justify-center">
        <p className="text-neutral-600 text-sm select-none">Open a workspace to get started</p>
      </main>
    )
  }

  return (
    <main className="flex-1 min-w-0 bg-neutral-950 flex flex-col overflow-hidden">
      <SessionTabBar
        workspaceId={activeWorkspaceId}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={(id) => setActiveSession(activeWorkspaceId, id)}
        onNewSession={openNewSession}
        onCloseSession={closeSession}
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
