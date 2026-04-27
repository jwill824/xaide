import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ipcMain } from 'electron'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

const mockManager = {
  list: vi.fn().mockResolvedValue([]),
  create: vi.fn().mockResolvedValue({ id: 'task-1', title: 'T', status: 'pending' }),
  update: vi.fn().mockResolvedValue({ id: 'task-1', title: 'T', status: 'in_progress' }),
  delete: vi.fn().mockResolvedValue(undefined),
}

describe('registerTaskHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers 4 ipcMain handlers', async () => {
    const { registerTaskHandlers } = await import('../../src/main/ipc/tasks.ipc')
    registerTaskHandlers(mockManager as any)
    expect(ipcMain.handle).toHaveBeenCalledTimes(4)
  })

  it('task:list invokes manager.list with workspaceId', async () => {
    const { registerTaskHandlers } = await import('../../src/main/ipc/tasks.ipc')
    registerTaskHandlers(mockManager as any)
    const handler = vi.mocked(ipcMain.handle).mock.calls.find(([ch]) => ch === 'task:list')?.[1]
    await handler?.({} as any, 'ws-1')
    expect(mockManager.list).toHaveBeenCalledWith('ws-1')
  })

  it('task:create invokes manager.create with input', async () => {
    const { registerTaskHandlers } = await import('../../src/main/ipc/tasks.ipc')
    registerTaskHandlers(mockManager as any)
    const handler = vi.mocked(ipcMain.handle).mock.calls.find(([ch]) => ch === 'task:create')?.[1]
    const input = { workspaceId: 'ws-1', title: 'New task' }
    await handler?.({} as any, input)
    expect(mockManager.create).toHaveBeenCalledWith(input)
  })

  it('task:update invokes manager.update with id and input', async () => {
    const { registerTaskHandlers } = await import('../../src/main/ipc/tasks.ipc')
    registerTaskHandlers(mockManager as any)
    const handler = vi.mocked(ipcMain.handle).mock.calls.find(([ch]) => ch === 'task:update')?.[1]
    await handler?.({} as any, 'task-1', { status: 'done' })
    expect(mockManager.update).toHaveBeenCalledWith('task-1', { status: 'done' })
  })

  it('task:delete invokes manager.delete with id', async () => {
    const { registerTaskHandlers } = await import('../../src/main/ipc/tasks.ipc')
    registerTaskHandlers(mockManager as any)
    const handler = vi.mocked(ipcMain.handle).mock.calls.find(([ch]) => ch === 'task:delete')?.[1]
    await handler?.({} as any, 'task-1')
    expect(mockManager.delete).toHaveBeenCalledWith('task-1')
  })
})
