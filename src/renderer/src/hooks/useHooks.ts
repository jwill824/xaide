import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateHookInput, UpdateHookInput } from '../../../preload/ipc-types'

export function useHooks(workspaceId: string | null) {
  const qc = useQueryClient()

  const { data: hooks = [] } = useQuery({
    queryKey: ['hooks', workspaceId],
    queryFn: () => window.xaide.settings.listHooks(workspaceId ?? undefined),
  })

  const { mutate: createHook, isPending: isCreating } = useMutation({
    mutationFn: (input: CreateHookInput) => window.xaide.settings.createHook(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hooks', workspaceId] }),
  })

  const { mutate: updateHook, isPending: isUpdating } = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateHookInput) =>
      window.xaide.settings.updateHook(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hooks', workspaceId] }),
  })

  const { mutate: deleteHook, isPending: isDeleting } = useMutation({
    mutationFn: (id: string) => window.xaide.settings.deleteHook(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hooks', workspaceId] }),
  })

  const isPending = isCreating || isUpdating || isDeleting

  return { hooks, createHook, updateHook, deleteHook, isPending }
}
