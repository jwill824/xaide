import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorkspaceManager, Workspace } from '../../src/main/workspace/WorkspaceManager'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

describe('registerWorkspaceHandlers', () => {
  let handlers: Record<string, (...args: unknown[]) => unknown>
  let mockManager: WorkspaceManager

  beforeEach(async () => {
    vi.resetModules()
    handlers = {}

    const { ipcMain } = await import('electron')
    vi.mocked(ipcMain.handle).mockImplementation((channel, fn) => {
      handlers[channel as string] = fn as (...args: unknown[]) => unknown
    })

    const stubWs: Workspace = {
      id: 'ws1',
      name: 'Test',
      repoPath: '/tmp',
      configJson: '{}',
      sandboxDefaults: '{}',
      layoutJson: '{}',
      createdAt: '',
      updatedAt: '',
    }
    mockManager = {
      list: vi.fn(() => [stubWs]),
      create: vi.fn(() => stubWs),
      get: vi.fn(() => stubWs),
      update: vi.fn(() => stubWs),
      delete: vi.fn(),
    } as unknown as WorkspaceManager

    const { registerWorkspaceHandlers } = await import(
      '../../src/main/ipc/workspace.ipc'
    )
    registerWorkspaceHandlers(mockManager)
  })

  it('registers all five workspace IPC channels', () => {
    expect(handlers['workspace:list']).toBeDefined()
    expect(handlers['workspace:create']).toBeDefined()
    expect(handlers['workspace:get']).toBeDefined()
    expect(handlers['workspace:update']).toBeDefined()
    expect(handlers['workspace:delete']).toBeDefined()
  })

  it('workspace:list calls manager.list()', async () => {
    await handlers['workspace:list']({})
    expect(mockManager.list).toHaveBeenCalledOnce()
  })

  it('workspace:create passes input to manager.create()', async () => {
    const input = { name: 'New WS', repoPath: '/tmp' }
    await handlers['workspace:create']({}, input)
    expect(mockManager.create).toHaveBeenCalledWith(input)
  })

  it('workspace:get passes id to manager.get()', async () => {
    await handlers['workspace:get']({}, 'ws1')
    expect(mockManager.get).toHaveBeenCalledWith('ws1')
  })

  it('workspace:update passes id and input to manager.update()', async () => {
    const input = { name: 'Renamed' }
    await handlers['workspace:update']({}, 'ws1', input)
    expect(mockManager.update).toHaveBeenCalledWith('ws1', input)
  })

  it('workspace:delete passes id to manager.delete()', async () => {
    await handlers['workspace:delete']({}, 'ws1')
    expect(mockManager.delete).toHaveBeenCalledWith('ws1')
  })

  it('workspace:create propagates manager errors as rejections', async () => {
    vi.mocked(mockManager.create).mockRejectedValueOnce(new Error('path not found'))
    await expect(handlers['workspace:create']({}, { name: 'x', repoPath: '/bad' }))
      .rejects.toThrow('path not found')
  })
})
