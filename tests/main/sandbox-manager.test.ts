import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}))

import { execFileSync } from 'node:child_process'
import { SandboxManager } from '../../src/main/sandbox/SandboxManager'

const mockExec = vi.mocked(execFileSync)

describe('SandboxManager', () => {
  let manager: SandboxManager

  beforeEach(() => {
    manager = new SandboxManager()
    vi.clearAllMocks()
  })

  it('isSbxAvailable returns true when sbx --version succeeds', () => {
    mockExec.mockReturnValue('sbx 1.0.0\n' as any)
    expect(manager.isSbxAvailable()).toBe(true)
    expect(mockExec).toHaveBeenCalledWith('sbx', ['--version'], { stdio: 'pipe' })
  })

  it('isSbxAvailable returns false when sbx is not installed', () => {
    mockExec.mockImplementation(() => { throw new Error('command not found: sbx') })
    expect(manager.isSbxAvailable()).toBe(false)
  })

  it('create calls sbx create with name and workspace and returns SandboxInfo', () => {
    mockExec.mockReturnValue('' as any)
    const info = manager.create({ name: 'xaide-abc', worktreePath: '/tmp/wt' })
    expect(info.sandboxName).toBe('xaide-abc')
    expect(info.worktreePath).toBe('/tmp/wt')
    expect(mockExec).toHaveBeenCalledWith(
      'sbx',
      ['create', '--name', 'xaide-abc', '--workspace', '/tmp/wt'],
      { stdio: 'pipe' },
    )
  })

  it('create throws when sbx create fails', () => {
    mockExec.mockImplementation(() => { throw new Error('sbx: not logged in') })
    expect(() => manager.create({ name: 'xaide-abc', worktreePath: '/tmp/wt' }))
      .toThrow('sbx: not logged in')
  })

  it('stop calls sbx stop with the sandbox name', () => {
    mockExec.mockReturnValue('' as any)
    manager.stop('xaide-abc')
    expect(mockExec).toHaveBeenCalledWith('sbx', ['stop', 'xaide-abc'], { stdio: 'pipe' })
  })

  it('stop does not throw when sbx stop fails (sandbox already stopped)', () => {
    mockExec.mockImplementation(() => { throw new Error('no such sandbox') })
    expect(() => manager.stop('xaide-abc')).not.toThrow()
  })

  it('remove calls sbx rm with the sandbox name', () => {
    mockExec.mockReturnValue('' as any)
    manager.remove('xaide-abc')
    expect(mockExec).toHaveBeenCalledWith('sbx', ['rm', 'xaide-abc'], { stdio: 'pipe' })
  })

  it('remove does not throw when sbx rm fails', () => {
    mockExec.mockImplementation(() => { throw new Error('no such sandbox') })
    expect(() => manager.remove('xaide-abc')).not.toThrow()
  })

  it('runArgs returns sbx run command for claude agent', () => {
    const result = manager.runArgs('xaide-abc', 'claude')
    expect(result.command).toBe('sbx')
    expect(result.args).toEqual(['run', 'claude', '--name', 'xaide-abc'])
  })

  it('runArgs returns sbx run command for copilot agent', () => {
    const result = manager.runArgs('xaide-abc', 'copilot')
    expect(result.command).toBe('sbx')
    expect(result.args).toEqual(['run', 'copilot', '--name', 'xaide-abc'])
  })

  it('runArgs passes through unknown agentId unchanged', () => {
    const result = manager.runArgs('xaide-abc', 'gpt')
    expect(result.command).toBe('sbx')
    expect(result.args).toEqual(['run', 'gpt', '--name', 'xaide-abc'])
  })
})
