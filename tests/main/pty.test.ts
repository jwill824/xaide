import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as nodePty from 'node-pty'
import { PtyManager } from '../../src/main/pty/PtyManager'

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn(),
    onExit: vi.fn(),
    pid: 1234,
  })),
}))

describe('PtyManager', () => {
  let manager: PtyManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new PtyManager()
  })

  it('creates a PTY session and returns a UUID', () => {
    const { id } = manager.create({ workspaceId: 'ws1', cols: 80, rows: 24, cwd: '/tmp' })
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(manager.has(id)).toBe(true)
  })

  it('throws when writing to an unknown session', () => {
    expect(() => manager.write('bad-id', 'hello')).toThrow('PTY session not found: bad-id')
  })

  it('throws when resizing an unknown session', () => {
    expect(() => manager.resize('bad-id', 80, 24)).toThrow('PTY session not found: bad-id')
  })

  it('kills a session and removes it from the map', () => {
    const { id, process: mockProcess } = manager.create({ workspaceId: 'ws1', cols: 80, rows: 24, cwd: '/tmp' })
    manager.kill(id)
    expect(manager.has(id)).toBe(false)
    expect(mockProcess.kill).toHaveBeenCalledOnce()
  })

  it('throws when killing an unknown session', () => {
    expect(() => manager.kill('bad-id')).toThrow('PTY session not found: bad-id')
  })

  it('killAll removes all sessions', () => {
    const { id: a, process: mockA } = manager.create({ workspaceId: 'ws1', cols: 80, rows: 24, cwd: '/tmp' })
    const { id: b, process: mockB } = manager.create({ workspaceId: 'ws2', cols: 80, rows: 24, cwd: '/tmp' })
    manager.killAll()
    expect(manager.has(a)).toBe(false)
    expect(manager.has(b)).toBe(false)
    expect(mockA.kill).toHaveBeenCalled()
    expect(mockB.kill).toHaveBeenCalled()
  })

  it('resize delegates to process.resize with correct arguments', () => {
    const { id, process: mockProcess } = manager.create({ workspaceId: 'ws1', cols: 80, rows: 24, cwd: '/tmp' })
    manager.resize(id, 120, 40)
    expect(mockProcess.resize).toHaveBeenCalledWith(120, 40)
  })

  it('removes session from map when process exits naturally', () => {
    const { id } = manager.create({ workspaceId: 'ws1', cols: 80, rows: 24, cwd: '/tmp' })
    expect(manager.has(id)).toBe(true)
    const mockProcess = (nodePty.spawn as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value
    const [[onExitCb]] = (mockProcess.onExit as ReturnType<typeof vi.fn>).mock.calls
    onExitCb()
    expect(manager.has(id)).toBe(false)
  })
})