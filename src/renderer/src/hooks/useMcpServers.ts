import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateMcpServerInput, UpdateMcpServerInput } from '../../../preload/ipc-types'

export function useMcpServers(workspaceId: string | null) {
  const qc = useQueryClient()

  const { data: servers = [] } = useQuery({
    queryKey: ['mcpServers', workspaceId],
    queryFn: () => window.xaide.settings.listMcpServers(workspaceId ?? undefined),
  })

  const { mutate: createServer, isPending: isCreating } = useMutation({
    mutationFn: (input: CreateMcpServerInput) => window.xaide.settings.createMcpServer(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcpServers', workspaceId] }),
  })

  const { mutate: updateServer, isPending: isUpdating } = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateMcpServerInput) =>
      window.xaide.settings.updateMcpServer(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcpServers', workspaceId] }),
  })

  const { mutate: deleteServer, isPending: isDeleting } = useMutation({
    mutationFn: (id: string) => window.xaide.settings.deleteMcpServer(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mcpServers', workspaceId] }),
  })

  const isPending = isCreating || isUpdating || isDeleting

  return { servers, createServer, updateServer, deleteServer, isPending }
}
