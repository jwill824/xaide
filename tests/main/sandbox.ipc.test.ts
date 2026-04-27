import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ipcMain } from 'electron'
import { SANDBOX_CHANNELS } from '../../src/preload/ipc-types'
import { registerSandboxHandlers } from '../../src/main/ipc/sandbox.ipc'
import type { SandboxManager } from '../../src/main/sandbox/SandboxManager'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

const mockHandle = vi.mocked(ipcMain.handle)

const mockSandbox: SandboxManager = {
  isSbxAvailable: vi.fn(),
  create: vi.fn(),
  stop: vi.fn(),
  remove: vi.fn(),
  runArgs: vi.fn(),
} as unknown as SandboxManager

describe('sandbox IPC handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registerSandboxHandlers(mockSandbox)
  })

  it('registers all 4 sandbox channels', () => {
    const channels = mockHandle.mock.calls.map((c) => c[0])
    expect(channels).toContain(SANDBOX_CHANNELS.AVAILABLE)
    expect(channels).toContain(SANDBOX_CHANNELS.CREATE)
    expect(channels).toContain(SANDBOX_CHANNELS.STOP)
    expect(channels).toContain(SANDBOX_CHANNELS.REMOVE)
  })

  it('available handler delegates to sandbox.isSbxAvailable', async () => {
    vi.mocked(mockSandbox.isSbxAvailable).mockReturnValue(true)
    const handler = mockHandle.mock.calls.find((c) => c[0] === SANDBOX_CHANNELS.AVAILABLE)![1]
    const result = await handler({} as any, undefined as any)
    expect(result).toBe(true)
    expect(mockSandbox.isSbxAvailable).toHaveBeenCalled()
  })

  it('create handler delegates to sandbox.create and returns SandboxInfo', async () => {
    const options = { name: 'xaide-abc', worktreePath: '/tmp/wt' }
    const info = { sandboxName: 'xaide-abc', worktreePath: '/tmp/wt' }
    vi.mocked(mockSandbox.create).mockReturnValue(info)
    const handler = mockHandle.mock.calls.find((c) => c[0] === SANDBOX_CHANNELS.CREATE)![1]
    const result = await handler({} as any, options)
    expect(result).toEqual(info)
    expect(mockSandbox.create).toHaveBeenCalledWith(options)
  })

  it('stop handler delegates to sandbox.stop', async () => {
    const handler = mockHandle.mock.calls.find((c) => c[0] === SANDBOX_CHANNELS.STOP)![1]
    const result = await handler({} as any, 'xaide-abc')
    expect(mockSandbox.stop).toHaveBeenCalledWith('xaide-abc')
    expect(result).toBeUndefined()
  })

  it('remove handler delegates to sandbox.remove', async () => {
    const handler = mockHandle.mock.calls.find((c) => c[0] === SANDBOX_CHANNELS.REMOVE)![1]
    const result = await handler({} as any, 'xaide-abc')
    expect(mockSandbox.remove).toHaveBeenCalledWith('xaide-abc')
    expect(result).toBeUndefined()
  })
})

