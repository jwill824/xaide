import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { UpsertAgentConfigInput } from '../../../preload/ipc-types'

export function useAgentConfig(workspaceId: string | null) {
  const qc = useQueryClient()

  const { data: configs = [] } = useQuery({
    queryKey: ['agentConfigs', workspaceId],
    queryFn: async () => {
      const global = await window.xaide.settings.getGlobalAgentConfig()
      const workspace = workspaceId
        ? await window.xaide.settings.getWorkspaceAgentConfig(workspaceId)
        : null
      return [global, workspace].filter(Boolean)
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
