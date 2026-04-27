import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateTaskInput, UpdateTaskInput } from '../../../preload/ipc-types'

export function useTasks(workspaceId: string | null) {
  return useQuery({
    queryKey: ['tasks', workspaceId],
    queryFn: () => window.xaide.tasks.list(workspaceId!),
    enabled: !!workspaceId,
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTaskInput) => window.xaide.tasks.create(input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['tasks', data.workspaceId] })
    },
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) =>
      window.xaide.tasks.update(id, input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['tasks', data.workspaceId] })
    },
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, workspaceId }: { id: string; workspaceId: string }) =>
      window.xaide.tasks.delete(id).then(() => ({ workspaceId })),
    onSuccess: ({ workspaceId }) => {
      qc.invalidateQueries({ queryKey: ['tasks', workspaceId] })
    },
  })
}
