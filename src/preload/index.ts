import { contextBridge, ipcRenderer } from 'electron'
import type { XaideAPI, CreateWorkspaceInput, PtyCreateOptions, CreateWorktreeOptions, CreateAgentSessionInput, AgentAPI, TaskAPI, SandboxAPI, SandboxCreateOptions, SettingsAPI, UpsertAgentConfigInput, CreateHookInput, UpdateHookInput, CreateMcpServerInput, UpdateMcpServerInput } from './ipc-types'
import { IPC_CHANNELS, PTY_CHANNELS, WORKTREE_CHANNELS, AGENT_CHANNELS, TASK_CHANNELS, SANDBOX_CHANNELS, SETTINGS_CHANNELS } from './ipc-types'

const api: XaideAPI = {
  workspace: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_LIST),
    create: (input: CreateWorkspaceInput) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_CREATE, input),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET, id),
    update: (id: string, input: Partial<CreateWorkspaceInput>) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_UPDATE, id, input),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_DELETE, id),
    saveLayout: (id: string, layoutJson: string) =>
      ipcRenderer.invoke(PTY_CHANNELS.WORKSPACE_SAVE_LAYOUT, id, layoutJson),
  },
  pty: {
    create: (options: PtyCreateOptions) => ipcRenderer.invoke(PTY_CHANNELS.CREATE, options),
    write: (sessionId: string, data: string) =>
      ipcRenderer.invoke(PTY_CHANNELS.WRITE, sessionId, data),
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke(PTY_CHANNELS.RESIZE, sessionId, cols, rows),
    kill: (sessionId: string) => ipcRenderer.invoke(PTY_CHANNELS.KILL, sessionId),
    onData: (callback: (sessionId: string, data: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, sessionId: string, data: string) =>
        callback(sessionId, data)
      ipcRenderer.on(PTY_CHANNELS.DATA, handler)
      return () => ipcRenderer.removeListener(PTY_CHANNELS.DATA, handler)
    },
    onExit: (cb: (sessionId: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, sessionId: string) => cb(sessionId)
      ipcRenderer.on(PTY_CHANNELS.EXIT, handler)
      return () => ipcRenderer.removeListener(PTY_CHANNELS.EXIT, handler)
    },
  },
  worktree: {
    list: (workspaceId: string) =>
      ipcRenderer.invoke(WORKTREE_CHANNELS.LIST, workspaceId),
    create: (options: CreateWorktreeOptions) =>
      ipcRenderer.invoke(WORKTREE_CHANNELS.CREATE, options),
    delete: (worktreeId: string, deleteBranch = false) =>
      ipcRenderer.invoke(WORKTREE_CHANNELS.DELETE, worktreeId, deleteBranch),
  },
  agent: {
    listDetected: () => ipcRenderer.invoke(AGENT_CHANNELS.LIST_DETECTED),
    createSession: (input: CreateAgentSessionInput) =>
      ipcRenderer.invoke(AGENT_CHANNELS.SESSION_CREATE, input),
    spawnSession: (ptySessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke(AGENT_CHANNELS.SESSION_SPAWN, ptySessionId, cols, rows),
    listSessions: (worktreeId: string) =>
      ipcRenderer.invoke(AGENT_CHANNELS.SESSION_LIST, worktreeId),
    killSession: (sessionId: string, ptySessionId: string, sandboxName?: string) =>
      ipcRenderer.invoke(AGENT_CHANNELS.SESSION_KILL, sessionId, ptySessionId, sandboxName),
  } satisfies AgentAPI,
  tasks: {
    list: (workspaceId) => ipcRenderer.invoke(TASK_CHANNELS.LIST, workspaceId),
    create: (input) => ipcRenderer.invoke(TASK_CHANNELS.CREATE, input),
    update: (id, input) => ipcRenderer.invoke(TASK_CHANNELS.UPDATE, id, input),
    delete: (id) => ipcRenderer.invoke(TASK_CHANNELS.DELETE, id),
  } satisfies TaskAPI,
  sandbox: {
    available: () => ipcRenderer.invoke(SANDBOX_CHANNELS.AVAILABLE),
    create: (options: SandboxCreateOptions) => ipcRenderer.invoke(SANDBOX_CHANNELS.CREATE, options),
    stop: (sandboxName: string) => ipcRenderer.invoke(SANDBOX_CHANNELS.STOP, sandboxName),
    remove: (sandboxName: string) => ipcRenderer.invoke(SANDBOX_CHANNELS.REMOVE, sandboxName),
  } satisfies SandboxAPI,
  settings: {
    getAgentConfigs: (workspaceId: string | null) =>
      workspaceId !== null
        ? ipcRenderer.invoke(SETTINGS_CHANNELS.AGENT_CONFIG_GET_WORKSPACE, workspaceId)
        : ipcRenderer.invoke(SETTINGS_CHANNELS.AGENT_CONFIG_GET_GLOBAL),
    upsertAgentConfig: (input: UpsertAgentConfigInput) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.AGENT_CONFIG_UPSERT, input),
    readClaudeConfig: (repoPath: string) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.AGENT_CONFIG_READ_CLAUDE, repoPath),
    writeClaudeConfig: (repoPath: string, xaideContent: string) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.AGENT_CONFIG_WRITE_CLAUDE, repoPath, xaideContent),
    readCopilotConfig: (repoPath: string) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.AGENT_CONFIG_READ_COPILOT, repoPath),
    writeCopilotConfig: (repoPath: string, xaideContent: string) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.AGENT_CONFIG_WRITE_COPILOT, repoPath, xaideContent),
    listHooks: (workspaceId?: string) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.HOOKS_LIST, workspaceId),
    createHook: (input: CreateHookInput) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.HOOKS_CREATE, input),
    updateHook: (id: string, input: UpdateHookInput) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.HOOKS_UPDATE, id, input),
    deleteHook: (id: string) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.HOOKS_DELETE, id),
    listMcpServers: (workspaceId?: string) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.MCP_LIST, workspaceId),
    createMcpServer: (input: CreateMcpServerInput) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.MCP_CREATE, input),
    updateMcpServer: (id: string, input: UpdateMcpServerInput) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.MCP_UPDATE, id, input),
    deleteMcpServer: (id: string) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.MCP_DELETE, id),
    writeMcpConfigClaude: (repoPath: string, workspaceId: string) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.MCP_WRITE_CLAUDE, repoPath, workspaceId),
    writeMcpConfigCopilot: (repoPath: string, workspaceId: string) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.MCP_WRITE_COPILOT, repoPath, workspaceId),
  } satisfies SettingsAPI,
}

contextBridge.exposeInMainWorld('xaide', api)
