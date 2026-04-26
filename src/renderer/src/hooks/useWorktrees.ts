import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { WorktreeRecord, CreateWorktreeOptions } from '../../../preload/ipc-types'

export function useWorktrees(workspaceId: string | null) {
  return useQuery<WorktreeRecord[]>({
    queryKey: ['worktrees', workspaceId],
    queryFn: () => window.xaide.worktree.list(workspaceId!),
    enabled: !!workspaceId,
  })
}

export function useCreateWorktree() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (options: CreateWorktreeOptions) => window.xaide.worktree.create(options),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['worktrees', variables.workspaceId] })
    },
  })
}

export function useDeleteWorktree(workspaceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ worktreeId, deleteBranch }: { worktreeId: string; deleteBranch?: boolean }) =>
      window.xaide.worktree.delete(worktreeId, deleteBranch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['worktrees', workspaceId] })
    },
  })
}