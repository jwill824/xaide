export interface DetectedAgent {
  id: string          // 'claude' | 'copilot'
  name: string        // display name
  command: string     // executable to spawn
  args: string[]      // default args prepended at session creation
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
  worktreeId: string       // used to look up worktreePath + branch
  worktreePath: string
  branch: string
  taskId?: string
  cols?: number
  rows?: number
}
