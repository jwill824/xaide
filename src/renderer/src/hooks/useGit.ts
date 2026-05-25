import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { StatusResult, DiffResult, LogResult } from '../../../src/main/git/types'

export function useGitStatus(worktreeId: string | null) {
  return useQuery<StatusResult | null>({
    queryKey: ['git', 'status', worktreeId],
    queryFn: async () => {
      if (!worktreeId) return null
      return window.xaide.git.status(worktreeId)
    },
    enabled: !!worktreeId,
  })
}

export function useGitDiff(worktreeId: string | null, filePath: string, staged: boolean) {
  return useQuery<DiffResult | null>({
    queryKey: ['git', 'diff', worktreeId, filePath, staged],
    queryFn: async () => {
      if (!worktreeId) return null
      return window.xaide.git.diff(worktreeId, filePath, staged)
    },
    enabled: !!worktreeId && !!filePath,
  })
}

export function useGitLog(worktreeId: string | null, limit?: number) {
  return useQuery<LogResult | null>({
    queryKey: ['git', 'log', worktreeId, limit],
    queryFn: async () => {
      if (!worktreeId) return null
      return window.xaide.git.log(worktreeId, limit)
    },
    enabled: !!worktreeId,
  })
}

export function useGitStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ worktreeId, files }: { worktreeId: string; files: string[] }) =>
      window.xaide.git.stage(worktreeId, files),
    onSuccess: (_, { worktreeId }) => {
      qc.invalidateQueries({ queryKey: ['git', 'status', worktreeId] })
    },
  })
}

export function useGitUnstage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ worktreeId, files }: { worktreeId: string; files: string[] }) =>
      window.xaide.git.unstage(worktreeId, files),
    onSuccess: (_, { worktreeId }) => {
      qc.invalidateQueries({ queryKey: ['git', 'status', worktreeId] })
    },
  })
}

export function useGitDiscard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ worktreeId, files }: { worktreeId: string; files: string[] }) =>
      window.xaide.git.discard(worktreeId, files),
    onSuccess: (_, { worktreeId }) => {
      qc.invalidateQueries({ queryKey: ['git', 'status', worktreeId] })
      qc.invalidateQueries({ queryKey: ['git', 'diff', worktreeId] })
    },
  })
}

export function useGitCommit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ worktreeId, message, amend }: { worktreeId: string; message: string; amend?: boolean }) =>
      window.xaide.git.commit(worktreeId, message, amend),
    onSuccess: (_, { worktreeId }) => {
      qc.invalidateQueries({ queryKey: ['git', 'status', worktreeId] })
      qc.invalidateQueries({ queryKey: ['git', 'log', worktreeId] })
    },
  })
}

export function useGitPush() {
  return useMutation({
    mutationFn: ({ worktreeId, setUpstream }: { worktreeId: string; setUpstream?: boolean }) =>
      window.xaide.git.push(worktreeId, setUpstream),
  })
}
