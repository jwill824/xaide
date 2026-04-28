import { useUiStore } from '../store/uiStore'
import type { ShellSession } from '../store/uiStore'
import { shallow } from 'zustand/shallow'

export function useSessions(workspaceId: string): ShellSession[] {
  return useUiStore((state) => state.sessions.filter((s) => s.workspaceId === workspaceId), shallow)
}
