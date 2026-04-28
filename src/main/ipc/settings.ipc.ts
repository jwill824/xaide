import { ipcMain } from 'electron'
import { SETTINGS_CHANNELS } from '../../preload/ipc-types'
import type { AgentConfigManager } from '../settings/AgentConfigManager'
import type { HookManager } from '../settings/HookManager'
import type { McpManager } from '../settings/McpManager'

export function registerSettingsHandlers(
  agentConfigManager: AgentConfigManager,
  hookManager: HookManager,
  mcpManager: McpManager,
): void {
  ipcMain.handle(SETTINGS_CHANNELS.AGENT_CONFIG_GET_GLOBAL, () =>
    agentConfigManager.getGlobal(),
  )
  ipcMain.handle(SETTINGS_CHANNELS.AGENT_CONFIG_GET_WORKSPACE, (_e, workspaceId: string) =>
    agentConfigManager.getForWorkspace(workspaceId),
  )
  ipcMain.handle(SETTINGS_CHANNELS.AGENT_CONFIG_UPSERT, (_e, input) =>
    agentConfigManager.upsert(input),
  )
  ipcMain.handle(SETTINGS_CHANNELS.AGENT_CONFIG_READ_CLAUDE, (_e, repoPath: string) =>
    agentConfigManager.readClaudeConfig(repoPath),
  )
  ipcMain.handle(
    SETTINGS_CHANNELS.AGENT_CONFIG_WRITE_CLAUDE,
    (_e, repoPath: string, content: string) => agentConfigManager.writeClaudeConfig(repoPath, content),
  )
  ipcMain.handle(SETTINGS_CHANNELS.AGENT_CONFIG_READ_COPILOT, (_e, repoPath: string) =>
    agentConfigManager.readCopilotConfig(repoPath),
  )
  ipcMain.handle(
    SETTINGS_CHANNELS.AGENT_CONFIG_WRITE_COPILOT,
    (_e, repoPath: string, content: string) => agentConfigManager.writeCopilotConfig(repoPath, content),
  )
  ipcMain.handle(SETTINGS_CHANNELS.HOOKS_LIST, (_e, workspaceId?: string) =>
    hookManager.list(workspaceId),
  )
  ipcMain.handle(SETTINGS_CHANNELS.HOOKS_CREATE, (_e, input) => hookManager.create(input))
  ipcMain.handle(SETTINGS_CHANNELS.HOOKS_UPDATE, (_e, id: string, input) =>
    hookManager.update(id, input),
  )
  ipcMain.handle(SETTINGS_CHANNELS.HOOKS_DELETE, (_e, id: string) => hookManager.delete(id))
  ipcMain.handle(SETTINGS_CHANNELS.MCP_LIST, (_e, workspaceId?: string) =>
    mcpManager.list(workspaceId),
  )
  ipcMain.handle(SETTINGS_CHANNELS.MCP_CREATE, (_e, input) => mcpManager.create(input))
  ipcMain.handle(SETTINGS_CHANNELS.MCP_UPDATE, (_e, id: string, input) =>
    mcpManager.update(id, input),
  )
  ipcMain.handle(SETTINGS_CHANNELS.MCP_DELETE, (_e, id: string) => mcpManager.delete(id))
  ipcMain.handle(
    SETTINGS_CHANNELS.MCP_WRITE_CLAUDE,
    (_e, repoPath: string, workspaceId: string) =>
      mcpManager.writeClaudeMcpConfig(repoPath, workspaceId),
  )
  ipcMain.handle(
    SETTINGS_CHANNELS.MCP_WRITE_COPILOT,
    (_e, repoPath: string, workspaceId: string) =>
      mcpManager.writeCopilotMcpConfig(repoPath, workspaceId),
  )
}
