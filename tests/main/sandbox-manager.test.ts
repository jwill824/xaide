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

  it('isDockerAvailable returns true when docker info succeeds', () => {
    mockExec.mockReturnValue('' as any)
    expect(manager.isDockerAvailable()).toBe(true)
    expect(mockExec).toHaveBeenCalledWith('docker', ['info'], { stdio: 'pipe' })
  })

  it('isDockerAvailable returns false when docker info throws', () => {
    mockExec.mockImplementation(() => { throw new Error('docker not found') })
    expect(manager.isDockerAvailable()).toBe(false)
  })

  it('create returns SandboxInfo with trimmed containerId from docker output', () => {
    mockExec.mockReturnValue('abc123def456\n' as any)
    const info = manager.create({ image: 'node:22', worktreePath: '/tmp/wt', branch: 'feat/x' })
    expect(info.containerId).toBe('abc123def456')
    expect(info.image).toBe('node:22')
    expect(info.worktreePath).toBe('/tmp/wt')
    expect(mockExec).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['create', '--rm', '-v', '/tmp/wt:/workspace', 'node:22']),
      expect.objectContaining({ encoding: 'utf8' }),
    )
  })

  it('start calls docker start with the containerId', () => {
    mockExec.mockReturnValue('' as any)
    manager.start('abc123')
    expect(mockExec).toHaveBeenCalledWith('docker', ['start', 'abc123'], { stdio: 'pipe' })
  })

  it('stop does not throw when docker stop fails (container already stopped)', () => {
    mockExec.mockImplementation(() => { throw new Error('no such container') })
    expect(() => manager.stop('abc123')).not.toThrow()
  })

  it('execArgs returns docker exec -i prefix for the given containerId', () => {
    const result = manager.execArgs('abc123')
    expect(result.command).toBe('docker')
    expect(result.prefixArgs).toEqual(['exec', '-i', 'abc123'])
  })
})
