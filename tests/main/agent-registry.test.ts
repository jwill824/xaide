import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AgentRegistry } from '../../src/main/agent/AgentRegistry'

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}))

import { execSync } from 'node:child_process'
const mockExecSync = vi.mocked(execSync)

describe('AgentRegistry', () => {
  let registry: AgentRegistry

  beforeEach(() => {
    registry = new AgentRegistry()
    vi.clearAllMocks()
  })

  it('detects claude when `which claude` succeeds', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'which claude') return '/usr/local/bin/claude\n'
      throw new Error('not found')
    })
    const agents = registry.detect()
    const claude = agents.find((a) => a.id === 'claude')
    expect(claude?.installed).toBe(true)
    expect(claude?.command).toBe('claude')
  })

  it('marks claude as not installed when `which claude` throws', () => {
    mockExecSync.mockImplementation(() => { throw new Error('not found') })
    const agents = registry.detect()
    const claude = agents.find((a) => a.id === 'claude')
    expect(claude?.installed).toBe(false)
  })

  it('detects copilot when `gh extension list` includes copilot', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'which gh') return Buffer.from('/usr/local/bin/gh\n')
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
    mockExecSync.mockImplementation(() => { throw new Error('not found') })
    const agents = registry.detect()
    const copilot = agents.find((a) => a.id === 'copilot')
    expect(copilot?.installed).toBe(false)
  })

  it('marks copilot as not installed when gh exists but copilot extension missing', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'which gh') return Buffer.from('/usr/local/bin/gh\n')
      if ((cmd as string).includes('gh extension list')) return ''
      throw new Error('not found')
    })
    const agents = registry.detect()
    const copilot = agents.find((a) => a.id === 'copilot')
    expect(copilot?.installed).toBe(false)
  })

  it('always returns both claude and copilot entries', () => {
    mockExecSync.mockImplementation(() => { throw new Error() })
    const agents = registry.detect()
    expect(agents.map((a) => a.id)).toEqual(expect.arrayContaining(['claude', 'copilot']))
  })
})
