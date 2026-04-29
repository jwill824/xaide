import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { UpsertAgentConfigInput } from '../../../preload/ipc-types'

export function useAgentConfig(workspaceId: string | null) {
  const qc = useQueryClient()

  // Fetch both global and workspace configs in one query to avoid partial data.
  const { data: configs = [] } = useQuery({
    queryKey: ['agentConfigs', workspaceId],
    queryFn: async () => {
      const results = []
      const global = await window.xaide.settings.getAgentConfigs(null)
      if (global) results.push(global)
      if (workspaceId) {
        const workspace = await window.xaide.settings.getAgentConfigs(workspaceId)
        if (workspace) results.push(workspace)
      }
      return results
    },
  })

  const globalConfig = configs.find((c) => c?.scope === 'global') ?? null
  const workspaceConfig = configs.find((c) => c?.scope === 'workspace') ?? null

  const { mutate: upsert, isPending } = useMutation({
    mutationFn: (input: UpsertAgentConfigInput) =>
      window.xaide.settings.upsertAgentConfig(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agentConfigs', workspaceId] })
    },
  })

  return { configs, globalConfig, workspaceConfig, upsert, isPending }
}
