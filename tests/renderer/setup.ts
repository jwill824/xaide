import '@testing-library/jest-dom'
import { vi } from 'vitest'
import type { Workspace, WorktreeRecord, XaideAPI, AgentAPI } from '../../src/preload/ipc-types'

const stubWs: Workspace = {
  id: 'mock-id',
  name: 'Mock Workspace',
  repoPath: '/tmp/mock',
  configJson: '{}',
  sandboxDefaults: '{}',
  layoutJson: '{}',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const mockXaideApi: XaideAPI = {
  workspace: {
    list: async () => [stubWs],
    create: async (input) => ({ ...stubWs, name: input.name, repoPath: input.repoPath }),
    get: async () => stubWs,
    update: async (id, input) => ({ ...stubWs, id, ...input }),
    delete: async () => undefined,
    saveLayout: async () => undefined,
  },
  pty: {
    create: vi.fn(async () => 'test-session-id'),
    write: vi.fn(async () => undefined),
    resize: vi.fn(async () => undefined),
    kill: vi.fn(async () => undefined),
    onData: vi.fn(() => () => undefined),
    onExit: vi.fn(() => () => undefined),
  },
  worktree: {
    list: vi.fn(async () => []),
    create: vi.fn(async () => ({
      id: 'wt-mock-1',
      workspaceId: 'ws-mock-1',
      repoPath: '/mock/repo',
      branch: 'xaide/mock-abc12345',
      baseBranch: 'HEAD',
      worktreePath: '/home/.xaide/worktrees/ws-mock-1/xaide-mock-abc12345',
      status: 'active' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })),
    delete: vi.fn(async () => undefined),
  },
  agent: {
    listDetected: vi.fn().mockResolvedValue([]),
    createSession: vi.fn().mockResolvedValue({
      id: 'sess-1', agentId: 'claude', branch: 'feat/x', worktreePath: '/tmp/x',
      ptySessionId: 'pty-1', taskId: null, containerId: null, status: 'running',
      createdAt: '', updatedAt: '',
    }),
    listSessions: vi.fn().mockResolvedValue([]),
    killSession: vi.fn().mockResolvedValue(undefined),
  },
  tasks: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({
      id: 'task-1', workspaceId: 'ws-1', title: 'T', sourceAdapter: 'manual',
      methodologyAdapter: null, prompt: '', status: 'pending',
      baseCommit: null, parallelGroupId: null, createdAt: '', updatedAt: '',
    }),
    update: vi.fn().mockResolvedValue({
      id: 'task-1', workspaceId: 'ws-1', title: 'T', sourceAdapter: 'manual',
      methodologyAdapter: null, prompt: '', status: 'in_progress',
      baseCommit: null, parallelGroupId: null, createdAt: '', updatedAt: '',
    }),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  sandbox: {
    available: vi.fn().mockResolvedValue(true),
    create: vi.fn().mockResolvedValue({ sandboxName: 'xaide-abc', worktreePath: '/tmp/wt' }),
    stop: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
  settings: {
    getGlobalAgentConfig: vi.fn().mockResolvedValue(null),
    getWorkspaceAgentConfig: vi.fn().mockResolvedValue(null),
    upsertAgentConfig: vi.fn().mockResolvedValue({
      id: 'cfg-1', scope: 'global', workspaceId: null, agentType: 'all',
      systemPromptAdditions: '', configJson: '{}', createdAt: '', updatedAt: '',
    }),
    readClaudeConfig: vi.fn().mockResolvedValue({ external: '', xaideManaged: '' }),
    writeClaudeConfig: vi.fn().mockResolvedValue(undefined),
    readCopilotConfig: vi.fn().mockResolvedValue({ external: '', xaideManaged: '' }),
    writeCopilotConfig: vi.fn().mockResolvedValue(undefined),
    listHooks: vi.fn().mockResolvedValue([]),
    createHook: vi.fn().mockResolvedValue({
      id: 'hook-1', scope: 'global', workspaceId: null,
      event: 'agent.start', command: 'echo start', enabled: true, createdAt: '',
    }),
    updateHook: vi.fn().mockResolvedValue({
      id: 'hook-1', scope: 'global', workspaceId: null,
      event: 'agent.start', command: 'echo start', enabled: true, createdAt: '',
    }),
    deleteHook: vi.fn().mockResolvedValue(undefined),
    listMcpServers: vi.fn().mockResolvedValue([]),
    createMcpServer: vi.fn().mockResolvedValue({
      id: 'mcp-1', name: 'my-mcp', scope: 'global', workspaceId: null, configJson: '{}', enabled: true, createdAt: '',
    }),
    updateMcpServer: vi.fn().mockResolvedValue({
      id: 'mcp-1', name: 'my-mcp', scope: 'global', workspaceId: null, configJson: '{}', enabled: true, createdAt: '',
    }),
    deleteMcpServer: vi.fn().mockResolvedValue(undefined),
    writeMcpConfigClaude: vi.fn().mockResolvedValue(undefined),
    writeMcpConfigCopilot: vi.fn().mockResolvedValue(undefined),
  },
}

Object.defineProperty(window, 'xaide', {
  value: mockXaideApi,
  writable: true,
})
