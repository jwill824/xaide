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

export interface XaideAPI {
  workspace: WorkspaceAPI
  pty: PtyAPI
}

declare global {
  interface Window {
    xaide: XaideAPI
  }
}
