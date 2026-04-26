import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateAgentSessionInput } from '../../../preload/ipc-types'

export function useDetectedAgents() {
  return useQuery({
    queryKey: ['agents', 'detected'],
    queryFn: () => window.xaide.agent.listDetected(),
  })
}

export function useAgentSessions() {
  return useQuery({
    queryKey: ['agent-sessions'],
    queryFn: () => window.xaide.agent.listSessions(),
  })
}

export function useLaunchAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAgentSessionInput) => window.xaide.agent.createSession(input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['agent-sessions', variables.worktreeId] })
    },
  })
}

export function useKillAgentSession(worktreeId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, ptySessionId }: { sessionId: string; ptySessionId: string }) =>
      window.xaide.agent.killSession(sessionId, ptySessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-sessions', worktreeId] })
    },
  })
}
