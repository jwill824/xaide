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
    write: async () => undefined,
    resize: async () => undefined,
    kill: vi.fn(async () => undefined),
    onData: vi.fn(() => () => undefined),
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
    create: vi.fn().mockResolvedValue({ containerId: 'ctr1', image: 'node:22', worktreePath: '/tmp/wt' }),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  },
}

Object.defineProperty(window, 'xaide', {
  value: mockXaideApi,
  writable: true,
})
