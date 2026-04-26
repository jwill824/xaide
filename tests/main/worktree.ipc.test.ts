import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { WorktreeManager, Worktree } from '../../src/main/worktree/WorktreeManager'
import type { HookRunner } from '../../src/main/worktree/HookRunner'

const mockIpcMain = { handle: vi.fn() }
vi.mock('electron', () => ({ ipcMain: mockIpcMain }))

const { registerWorktreeHandlers } = await import('../../src/main/ipc/worktree.ipc')

const SAMPLE: Worktree = {
  id: 'wt-1',
  workspaceId: 'ws-1',
  repoPath: '/repo',
  branch: 'xaide/test-abc12345',
  baseBranch: 'HEAD',
  worktreePath: '/home/.xaide/worktrees/ws-1/xaide-test-abc12345',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function makeManager(): WorktreeManager {
  return {
    list: vi.fn(() => [SAMPLE]),
    get: vi.fn(() => SAMPLE),
    create: vi.fn(async () => SAMPLE),
    delete: vi.fn(async () => undefined),
  } as unknown as WorktreeManager
}

function makeHookRunner(): HookRunner {
  return { run: vi.fn(async () => undefined) } as unknown as HookRunner
}

describe('worktree IPC handlers', () => {
  let handlers: Record<string, (...args: unknown[]) => unknown>

  beforeEach(() => {
    handlers = {}
    mockIpcMain.handle.mockImplementation((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers[channel] = fn
    })
    registerWorktreeHandlers(makeManager(), makeHookRunner())
  })

  it('registers worktree:list handler', () => {
    expect(handlers['worktree:list']).toBeDefined()
  })

  it('worktree:list returns worktrees', async () => {
    const result = await handlers['worktree:list']({}, 'ws-1')
    expect(result).toEqual([SAMPLE])
  })

  it('worktree:create returns new worktree and fires worktree.created hook', async () => {
    const mgr = makeManager()
    const hook = makeHookRunner()
    handlers = {}
    mockIpcMain.handle.mockImplementation((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers[channel] = fn
    })
    registerWorktreeHandlers(mgr, hook)

    const result = await handlers['worktree:create']({}, {
      workspaceId: 'ws-1',
      repoPath: '/repo',
      label: 'my-task',
    })
    expect(result).toEqual(SAMPLE)
    expect(mgr.create).toHaveBeenCalledWith(expect.objectContaining({ label: 'my-task' }))
    expect(hook.run).toHaveBeenCalledWith('worktree.created', expect.objectContaining({ branch: SAMPLE.branch }))
  })

  it('worktree:delete calls manager.delete', async () => {
    const mgr = makeManager()
    handlers = {}
    mockIpcMain.handle.mockImplementation((channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers[channel] = fn
    })
    registerWorktreeHandlers(mgr, makeHookRunner())
    await handlers['worktree:delete']({}, 'wt-1', false)
    expect(mgr.delete).toHaveBeenCalledWith({ worktreeId: 'wt-1', deleteBranch: false })
  })
})