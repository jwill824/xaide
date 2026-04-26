import '@testing-library/jest-dom'
import { vi } from 'vitest'
import type { Workspace, WorktreeRecord, XaideAPI } from '../../src/preload/ipc-types'

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
}

Object.defineProperty(window, 'xaide', {
  value: mockXaideApi,
  writable: true,
})
