import { useUiStore } from '../store/uiStore'
import { useWorkspaces } from './useWorkspaces'
import type { Workspace } from '../../../preload/ipc-types'

export function useActiveWorkspace(): Workspace | null {
  const activeId = useUiStore((s) => s.activeWorkspaceId)
  const { data: workspaces = [] } = useWorkspaces()
  return workspaces.find((w) => w.id === activeId) ?? null
}
