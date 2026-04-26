import { ipcMain } from 'electron'
import type { AgentRegistry } from '../agent/AgentRegistry'
import type { AgentSessionManager } from '../agent/AgentSessionManager'
import type { CreateAgentSessionInput } from '../agent/types'

export function registerAgentHandlers(
  registry: AgentRegistry,
  sessionManager: AgentSessionManager,
): void {
  ipcMain.handle('agent:list-detected', () => registry.detect())

  ipcMain.handle('agent:session:create', (_event, input: CreateAgentSessionInput) =>
    sessionManager.create(input),
  )

  ipcMain.handle('agent:session:list', (_event, worktreeId: string) =>
    sessionManager.list(worktreeId),
  )

  ipcMain.handle('agent:session:kill', (_event, sessionId: string, ptySessionId: string) =>
    sessionManager.kill(sessionId, ptySessionId),
  )
}
