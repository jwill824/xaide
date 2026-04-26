import { useQuery } from '@tanstack/react-query'
import type { Workspace } from '../../../preload/ipc-types'

export function useWorkspaces() {
  return useQuery<Workspace[]>({
    queryKey: ['workspaces'],
    queryFn: () => window.xaide.workspace.list(),
  })
}
