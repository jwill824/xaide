import '@testing-library/jest-dom'
import { vi } from 'vitest'
import type { Workspace, XaideAPI } from '../../src/preload/ipc-types'

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
}

Object.defineProperty(window, 'xaide', {
  value: mockXaideApi,
  writable: true,
})
