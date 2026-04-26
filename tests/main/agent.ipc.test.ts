import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

import { ipcMain } from 'electron'
import { registerAgentHandlers } from '../../src/main/ipc/agent.ipc'
import type { AgentRegistry } from '../../src/main/agent/AgentRegistry'
import type { AgentSessionManager } from '../../src/main/agent/AgentSessionManager'

function makeRegistry() {
  return {
    detect: vi.fn().mockReturnValue([
      { id: 'claude', name: 'Claude Code', command: 'claude', args: [], installed: true, configPath: null },
    ]),
  } as unknown as AgentRegistry
}

function makeSessionManager() {
  return {
    create: vi.fn().mockResolvedValue({ id: 'sess-1', agentId: 'claude', ptySessionId: 'pty-1', branch: 'feat/x', worktreePath: '/tmp/x', taskId: null, containerId: null, status: 'running', createdAt: '', updatedAt: '' }),
    list: vi.fn().mockResolvedValue([]),
    kill: vi.fn().mockResolvedValue(undefined),
  } as unknown as AgentSessionManager
}

describe('registerAgentHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers agent:list-detected, agent:session:create, agent:session:list, agent:session:kill handlers', () => {
    registerAgentHandlers(makeRegistry(), makeSessionManager())
    const registeredChannels = vi.mocked(ipcMain.handle).mock.calls.map((c) => c[0])
    expect(registeredChannels).toContain('agent:list-detected')
    expect(registeredChannels).toContain('agent:session:create')
    expect(registeredChannels).toContain('agent:session:list')
    expect(registeredChannels).toContain('agent:session:kill')
  })

  it('agent:list-detected calls registry.detect()', async () => {
    const registry = makeRegistry()
    registerAgentHandlers(registry, makeSessionManager())
    const handler = vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === 'agent:list-detected')?.[1]
    await (handler as Function)({})
    expect(registry.detect).toHaveBeenCalledOnce()
  })

  it('agent:session:create calls sessionManager.create with input', async () => {
    const sessionManager = makeSessionManager()
    registerAgentHandlers(makeRegistry(), sessionManager)
    const handler = vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === 'agent:session:create')?.[1]
    const input = { agentId: 'claude', worktreeId: 'wt-1', worktreePath: '/tmp/x', branch: 'feat/x' }
    await (handler as Function)({}, input)
    expect(sessionManager.create).toHaveBeenCalledWith(input)
  })

  it('agent:session:list calls sessionManager.list with worktreeId', async () => {
    const sessionManager = makeSessionManager()
    registerAgentHandlers(makeRegistry(), sessionManager)
    const handler = vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === 'agent:session:list')?.[1]
    await (handler as Function)({}, 'wt-1')
    expect(sessionManager.list).toHaveBeenCalledWith('wt-1')
  })

  it('agent:session:kill calls sessionManager.kill with sessionId and ptySessionId', async () => {
    const sessionManager = makeSessionManager()
    registerAgentHandlers(makeRegistry(), sessionManager)
    const handler = vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === 'agent:session:kill')?.[1]
    await (handler as Function)({}, 'sess-1', 'pty-1')
    expect(sessionManager.kill).toHaveBeenCalledWith('sess-1', 'pty-1')
  })
})
