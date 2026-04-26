import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentRegistry } from '../../src/main/agent/AgentRegistry'

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}))

import { execSync, execFileSync } from 'node:child_process'
const mockExecSync = vi.mocked(execSync)
const mockExecFileSync = vi.mocked(execFileSync)

describe('AgentRegistry', () => {
  let registry: AgentRegistry

  beforeEach(() => {
    registry = new AgentRegistry()
    vi.clearAllMocks()
  })

  it('detects claude when `which claude` succeeds', () => {
    mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      if (cmd === 'which' && args?.[0] === 'claude') return '/usr/local/bin/claude\n'
      throw new Error('not found')
    })
    const agents = registry.detect()
    const claude = agents.find((a) => a.id === 'claude')
    expect(claude?.installed).toBe(true)
    expect(claude?.command).toBe('claude')
  })

  it('marks claude as not installed when `which claude` throws', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('not found') })
    mockExecSync.mockImplementation(() => { throw new Error('not found') })
    const agents = registry.detect()
    const claude = agents.find((a) => a.id === 'claude')
    expect(claude?.installed).toBe(false)
  })

  it('detects copilot when `gh extension list` includes copilot', () => {
    mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      if (cmd === 'which' && args?.[0] === 'gh') return Buffer.from('/usr/local/bin/gh\n')
      throw new Error('not found')
    })
    mockExecSync.mockImplementation((cmd: string) => {
      if ((cmd as string).includes('gh extension list'))
        return 'github/gh-copilot\n'
      throw new Error('not found')
    })
    const agents = registry.detect()
    const copilot = agents.find((a) => a.id === 'copilot')
    expect(copilot?.installed).toBe(true)
    expect(copilot?.command).toBe('gh')
  })

  it('marks copilot as not installed when gh is missing', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error('not found') })
    mockExecSync.mockImplementation(() => { throw new Error('not found') })
    const agents = registry.detect()
    const copilot = agents.find((a) => a.id === 'copilot')
    expect(copilot?.installed).toBe(false)
  })

  it('marks copilot as not installed when gh exists but copilot extension missing', () => {
    mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      if (cmd === 'which' && args?.[0] === 'gh') return Buffer.from('/usr/local/bin/gh\n')
      throw new Error('not found')
    })
    mockExecSync.mockImplementation((cmd: string) => {
      if ((cmd as string).includes('gh extension list')) return ''
      throw new Error('not found')
    })
    const agents = registry.detect()
    const copilot = agents.find((a) => a.id === 'copilot')
    expect(copilot?.installed).toBe(false)
  })

  it('always returns both claude and copilot entries', () => {
    mockExecFileSync.mockImplementation(() => { throw new Error() })
    mockExecSync.mockImplementation(() => { throw new Error() })
    const agents = registry.detect()
    expect(agents.map((a) => a.id)).toEqual(expect.arrayContaining(['claude', 'copilot']))
  })
})
