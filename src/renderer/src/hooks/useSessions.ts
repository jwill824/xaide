import { useUiStore } from '../store/uiStore'
import type { ShellSession } from '../store/uiStore'

export function useSessions(workspaceId: string): ShellSession[] {
  return useUiStore((s) => s.sessions.filter((s) => s.workspaceId === workspaceId))
}
