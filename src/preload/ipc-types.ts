export const IPC_CHANNELS = {
  WORKSPACE_LIST: 'workspace:list',
  WORKSPACE_CREATE: 'workspace:create',
  WORKSPACE_GET: 'workspace:get',
  WORKSPACE_UPDATE: 'workspace:update',
  WORKSPACE_DELETE: 'workspace:delete',
} as const

export interface Workspace {
  id: string
  name: string
  repoPath: string
  configJson: string
  sandboxDefaults: string
  layoutJson: string
  createdAt: string
  updatedAt: string
}

export interface CreateWorkspaceInput {
  name: string
  repoPath: string
}

export interface WorkspaceAPI {
  list: () => Promise<Workspace[]>
  create: (input: CreateWorkspaceInput) => Promise<Workspace>
  get: (id: string) => Promise<Workspace | null>
  update: (id: string, input: Partial<CreateWorkspaceInput>) => Promise<Workspace>
  delete: (id: string) => Promise<void>
  saveLayout: (id: string, layoutJson: string) => Promise<void>
}

// --- PTY ---

export const PTY_CHANNELS = {
  CREATE: 'pty:create',
  WRITE: 'pty:write',
  RESIZE: 'pty:resize',
  KILL: 'pty:kill',
  DATA: 'pty:data',
  EXIT: 'pty:exit',
  WORKSPACE_SAVE_LAYOUT: 'workspace:save-layout',
} as const

export interface PtyCreateOptions {
  workspaceId: string
  cols: number
  rows: number
  cwd: string
  env?: Record<string, string>
}

export interface PtyAPI {
  create: (options: PtyCreateOptions) => Promise<string>
  write: (sessionId: string, data: string) => Promise<void>
  resize: (sessionId: string, cols: number, rows: number) => Promise<void>
  kill: (sessionId: string) => Promise<void>
  /** Subscribe to PTY data events. Returns an unsubscribe function. */
  onData: (callback: (sessionId: string, data: string) => void) => () => void
  /** Subscribe to PTY exit events. Returns an unsubscribe function. */
  onExit: (callback: (sessionId: string) => void) => () => void
}

// --- Worktree ---

export const WORKTREE_CHANNELS = {
  LIST: 'worktree:list',
  CREATE: 'worktree:create',
  DELETE: 'worktree:delete',
} as const

export interface WorktreeRecord {
  id: string
  workspaceId: string
  repoPath: string
  branch: string
  baseBranch: string
  worktreePath: string
  status: 'active' | 'merged' | 'discarded'
  createdAt: string
  updatedAt: string
}

export interface CreateWorktreeOptions {
  workspaceId: string
  repoPath: string
  label: string
  /** Explicit branch name — passed at worktree creation time. */
  branch?: string
  baseBranch?: string
}

export interface WorktreeAPI {
  list: (workspaceId: string) => Promise<WorktreeRecord[]>
  create: (options: CreateWorktreeOptions) => Promise<WorktreeRecord>
  delete: (worktreeId: string, deleteBranch?: boolean) => Promise<void>
}

// --- Agent ---

export const AGENT_CHANNELS = {
  LIST_DETECTED: 'agent:list-detected',
  SESSION_CREATE: 'agent:session:create',
  SESSION_SPAWN: 'agent:session:spawn',
  SESSION_LIST: 'agent:session:list',
  SESSION_KILL: 'agent:session:kill',
} as const

// --- Sandbox ---

export const SANDBOX_CHANNELS = {
  AVAILABLE: 'sandbox:available',
  CREATE: 'sandbox:create',
  STOP: 'sandbox:stop',
  REMOVE: 'sandbox:remove',
} as const

export interface SandboxCreateOptions {
  name: string
  worktreePath: string
}

export interface SandboxInfo {
  sandboxName: string
  worktreePath: string
}

export interface SandboxAPI {
  available: () => Promise<boolean>
  create: (options: SandboxCreateOptions) => Promise<SandboxInfo>
  stop: (sandboxName: string) => Promise<void>
  remove: (sandboxName: string) => Promise<void>
}

export interface DetectedAgent {
  id: string
  name: string
  command: string
  args: string[]
  installed: boolean
  configPath: string | null
}

export interface AgentSessionRecord {
  id: string
  taskId: string | null
  agentId: string
  branch: string
  worktreePath: string
  ptySessionId: string | null
  containerId: string | null
  status: 'pending' | 'running' | 'idle' | 'finished' | 'failed'
  createdAt: string
  updatedAt: string
}

export interface CreateAgentSessionInput {
  agentId: string
  worktreeId: string
  worktreePath: string
  branch: string
  taskId?: string
  cols?: number
  rows?: number
  sandboxName?: string
}

export interface AgentAPI {
  listDetected: () => Promise<DetectedAgent[]>
  createSession: (input: CreateAgentSessionInput) => Promise<AgentSessionRecord>
  spawnSession: (ptySessionId: string, cols: number, rows: number) => Promise<void>
  listSessions: () => Promise<AgentSessionRecord[]>
  killSession: (sessionId: string, ptySessionId: string, sandboxName?: string) => Promise<void>
}

// --- Tasks ---

export const TASK_CHANNELS = {
  LIST: 'task:list',
  CREATE: 'task:create',
  UPDATE: 'task:update',
  DELETE: 'task:delete',
} as const

export interface Task {
  id: string
  workspaceId: string
  title: string
  sourceAdapter: string
  methodologyAdapter: string | null
  prompt: string
  status: 'pending' | 'in_progress' | 'done' | 'blocked'
  baseCommit: string | null
  parallelGroupId: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateTaskInput {
  workspaceId: string
  title: string
  prompt?: string
  sourceAdapter?: string
}

export interface UpdateTaskInput {
  title?: string
  prompt?: string
  status?: 'pending' | 'in_progress' | 'done' | 'blocked'
}

export interface TaskAPI {
  list: (workspaceId: string) => Promise<Task[]>
  create: (input: CreateTaskInput) => Promise<Task>
  update: (id: string, input: UpdateTaskInput) => Promise<Task>
  delete: (id: string) => Promise<void>
}

export const SETTINGS_CHANNELS = {
  AGENT_CONFIG_GET_GLOBAL: 'settings:agent-config:get-global',
  AGENT_CONFIG_GET_WORKSPACE: 'settings:agent-config:get-workspace',
  AGENT_CONFIG_UPSERT: 'settings:agent-config:upsert',
  AGENT_CONFIG_READ_CLAUDE: 'settings:agent-config:read-claude',
  AGENT_CONFIG_WRITE_CLAUDE: 'settings:agent-config:write-claude',
  AGENT_CONFIG_READ_COPILOT: 'settings:agent-config:read-copilot',
  AGENT_CONFIG_WRITE_COPILOT: 'settings:agent-config:write-copilot',
  HOOKS_LIST: 'settings:hooks:list',
  HOOKS_CREATE: 'settings:hooks:create',
  HOOKS_UPDATE: 'settings:hooks:update',
  HOOKS_DELETE: 'settings:hooks:delete',
  MCP_LIST: 'settings:mcp:list',
  MCP_CREATE: 'settings:mcp:create',
  MCP_UPDATE: 'settings:mcp:update',
  MCP_DELETE: 'settings:mcp:delete',
  MCP_WRITE_CLAUDE: 'settings:mcp:write-claude',
  MCP_WRITE_COPILOT: 'settings:mcp:write-copilot',
} as const

export interface AgentConfigRecord {
  id: string
  scope: 'global' | 'workspace'
  workspaceId: string | null
  agentType: 'claude' | 'copilot' | 'all'
  systemPromptAdditions: string
  configJson: string
  createdAt: string
  updatedAt: string
}

export interface UpsertAgentConfigInput {
  scope: 'global' | 'workspace'
  workspaceId?: string
  agentType?: 'claude' | 'copilot' | 'all'
  systemPromptAdditions?: string
  configJson?: string
}

export interface AgentFileContent {
  external: string
  xaideManaged: string
}

export interface HookRecord {
  id: string
  scope: 'global' | 'workspace'
  workspaceId: string | null
  event: 'agent.start' | 'agent.stop' | 'agent.commit' | 'agent.error'
  command: string
  enabled: boolean
  createdAt: string
}

export interface CreateHookInput {
  scope?: 'global' | 'workspace'
  workspaceId?: string | null
  event: 'agent.start' | 'agent.stop' | 'agent.commit' | 'agent.error'
  command: string
}

export interface UpdateHookInput {
  command?: string
  enabled?: boolean
}

export interface McpServerRecord {
  id: string
  name: string
  scope: 'global' | 'workspace'
  workspaceId: string | null
  configJson: string
  enabled: boolean
  createdAt: string
}

export interface McpServerConfigInput {
  command?: string
  url?: string
  args?: string[]
  env?: Record<string, string>
  workspaceId?: string
}

export interface CreateMcpServerInput {
  name: string
  scope: 'global' | 'workspace'
  config: McpServerConfigInput
}

export interface UpdateMcpServerInput {
  name?: string
  config?: McpServerConfigInput
  enabled?: boolean
}

export interface SettingsAPI {
  getAgentConfigs: (workspaceId: string | null) => Promise<AgentConfigRecord[]>
  upsertAgentConfig: (input: UpsertAgentConfigInput) => Promise<AgentConfigRecord>
  readClaudeConfig: (repoPath: string) => Promise<AgentFileContent>
  writeClaudeConfig: (repoPath: string, xaideContent: string) => Promise<void>
  readCopilotConfig: (repoPath: string) => Promise<AgentFileContent>
  writeCopilotConfig: (repoPath: string, xaideContent: string) => Promise<void>
  listHooks: (workspaceId?: string) => Promise<HookRecord[]>
  createHook: (input: CreateHookInput) => Promise<HookRecord>
  updateHook: (id: string, input: UpdateHookInput) => Promise<HookRecord>
  deleteHook: (id: string) => Promise<void>
  listMcpServers: (workspaceId?: string) => Promise<McpServerRecord[]>
  createMcpServer: (input: CreateMcpServerInput) => Promise<McpServerRecord>
  updateMcpServer: (id: string, input: UpdateMcpServerInput) => Promise<McpServerRecord>
  deleteMcpServer: (id: string) => Promise<void>
  writeMcpConfigClaude: (repoPath: string, workspaceId: string) => Promise<void>
  writeMcpConfigCopilot: (repoPath: string, workspaceId: string) => Promise<void>
}

export interface XaideAPI {
  workspace: WorkspaceAPI
  pty: PtyAPI
  worktree: WorktreeAPI
  agent: AgentAPI
  tasks: TaskAPI
  sandbox: SandboxAPI
  settings: SettingsAPI
}

declare global {
  interface Window {
    xaide: XaideAPI
  }
}
