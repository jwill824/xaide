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
  /** Explicit branch name — pass from SandboxManager during Docker phase. */
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
  SESSION_LIST: 'agent:session:list',
  SESSION_KILL: 'agent:session:kill',
} as const

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
}

export interface AgentAPI {
  listDetected: () => Promise<DetectedAgent[]>
  createSession: (input: CreateAgentSessionInput) => Promise<AgentSessionRecord>
  listSessions: (worktreeId: string) => Promise<AgentSessionRecord[]>
  killSession: (sessionId: string, ptySessionId: string) => Promise<void>
}

export interface XaideAPI {
  workspace: WorkspaceAPI
  pty: PtyAPI
  worktree: WorktreeAPI
  agent: AgentAPI
}

declare global {
  interface Window {
    xaide: XaideAPI
  }
}
