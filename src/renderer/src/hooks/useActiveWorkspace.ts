import { useMemo } from 'react'
import { useUiStore } from '../store/uiStore'
import { useWorkspaces } from './useWorkspaces'
import type { Workspace } from '../../../preload/ipc-types'

export function useActiveWorkspace(): Workspace | null {
  const activeId = useUiStore((s) => s.activeWorkspaceId)
  const { data: workspaces = [] } = useWorkspaces()
  return useMemo(
    () => workspaces.find((w) => w.id === activeId) ?? null,
    [workspaces, activeId],
  )
}
