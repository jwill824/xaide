import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Workspace, CreateWorkspaceInput } from '../../../preload/ipc-types'

export function useWorkspaces() {
  return useQuery<Workspace[]>({
    queryKey: ['workspaces'],
    queryFn: () => window.xaide.workspace.list(),
  })
}

export function useCreateWorkspace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) => window.xaide.workspace.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workspaces'] })
    },
  })
}
