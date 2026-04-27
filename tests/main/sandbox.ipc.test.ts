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
  isDockerAvailable: vi.fn(),
  create: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  remove: vi.fn(),
  execArgs: vi.fn(),
} as unknown as SandboxManager

describe('sandbox IPC handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    registerSandboxHandlers(mockSandbox)
  })

  it('registers all 5 sandbox channels', () => {
    const channels = mockHandle.mock.calls.map((c) => c[0])
    expect(channels).toContain(SANDBOX_CHANNELS.AVAILABLE)
    expect(channels).toContain(SANDBOX_CHANNELS.CREATE)
    expect(channels).toContain(SANDBOX_CHANNELS.START)
    expect(channels).toContain(SANDBOX_CHANNELS.STOP)
    expect(channels).toContain(SANDBOX_CHANNELS.REMOVE)
  })

  it('available handler delegates to sandbox.isDockerAvailable', async () => {
    vi.mocked(mockSandbox.isDockerAvailable).mockReturnValue(true)
    const handler = mockHandle.mock.calls.find((c) => c[0] === SANDBOX_CHANNELS.AVAILABLE)![1]
    const result = await handler({} as any, undefined as any)
    expect(result).toBe(true)
    expect(mockSandbox.isDockerAvailable).toHaveBeenCalled()
  })

  it('create handler delegates to sandbox.create', async () => {
    const options = { image: 'node:22', worktreePath: '/tmp/wt', branch: 'main' }
    const info = { containerId: 'abc', image: 'node:22', worktreePath: '/tmp/wt' }
    vi.mocked(mockSandbox.create).mockReturnValue(info)
    const handler = mockHandle.mock.calls.find((c) => c[0] === SANDBOX_CHANNELS.CREATE)![1]
    const result = await handler({} as any, options)
    expect(result).toEqual(info)
    expect(mockSandbox.create).toHaveBeenCalledWith(options)
  })

  it('stop handler delegates to sandbox.stop', async () => {
    const handler = mockHandle.mock.calls.find((c) => c[0] === SANDBOX_CHANNELS.STOP)![1]
    const result = await handler({} as any, 'ctr123')
    expect(mockSandbox.stop).toHaveBeenCalledWith('ctr123')
    expect(result).toBeUndefined()
  })

  it('start handler delegates to sandbox.start', async () => {
    const handler = mockHandle.mock.calls.find((c) => c[0] === SANDBOX_CHANNELS.START)![1]
    const result = await handler({} as any, 'ctr123')
    expect(mockSandbox.start).toHaveBeenCalledWith('ctr123')
    expect(result).toBeUndefined()
  })

  it('remove handler delegates to sandbox.remove', async () => {
    const handler = mockHandle.mock.calls.find((c) => c[0] === SANDBOX_CHANNELS.REMOVE)![1]
    const result = await handler({} as any, 'ctr123')
    expect(mockSandbox.remove).toHaveBeenCalledWith('ctr123')
    expect(result).toBeUndefined()
  })
})
