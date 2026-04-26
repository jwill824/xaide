import { describe, it, expect, beforeEach, vi } from 'vitest'
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
    const { id } = manager.create({ workspaceId: 'ws1', cols: 80, rows: 24, cwd: '/tmp' })
    manager.kill(id)
    expect(manager.has(id)).toBe(false)
  })

  it('throws when killing an unknown session', () => {
    expect(() => manager.kill('bad-id')).toThrow('PTY session not found: bad-id')
  })

  it('killAll removes all sessions', () => {
    const { id: a } = manager.create({ workspaceId: 'ws1', cols: 80, rows: 24, cwd: '/tmp' })
    const { id: b } = manager.create({ workspaceId: 'ws2', cols: 80, rows: 24, cwd: '/tmp' })
    manager.killAll()
    expect(manager.has(a)).toBe(false)
    expect(manager.has(b)).toBe(false)
  })
})