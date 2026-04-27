import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AgentSessionManager } from '../../src/main/agent/AgentSessionManager'
import type { DrizzleDb } from '../../src/main/db/schema'
import type { PtyManager } from '../../src/main/pty/PtyManager'
import type { HookRunner } from '../../src/main/worktree/HookRunner'
import type { SandboxManager } from '../../src/main/sandbox/SandboxManager'

function makeMockDb() {
  return {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockResolvedValue([]),
    }),
  } as unknown as DrizzleDb
}

function makeMockPty() {
  return {
    create: vi.fn().mockReturnValue({ id: 'pty-abc', process: { onData: vi.fn(), on: vi.fn() } }),
    kill: vi.fn(),
  } as unknown as PtyManager
}

function makeHookRunner() {
  return { run: vi.fn().mockResolvedValue(undefined) } as unknown as HookRunner
}

function makeMockSandbox() {
  return {
    isDockerAvailable: vi.fn().mockReturnValue(true),
    create: vi.fn().mockReturnValue({ containerId: 'ctr-1', image: 'node:22', worktreePath: '/tmp/wt' }),
    start: vi.fn(),
    stop: vi.fn(),
    remove: vi.fn(),
    execArgs: vi.fn().mockReturnValue({ command: 'docker', prefixArgs: ['exec', '-i', 'ctr-1'] }),
  } as unknown as SandboxManager
}

describe('AgentSessionManager', () => {
  let db: ReturnType<typeof makeMockDb>
  let pty: ReturnType<typeof makeMockPty>
  let hookRunner: ReturnType<typeof makeHookRunner>
  let manager: AgentSessionManager

  beforeEach(() => {
    db = makeMockDb()
    pty = makeMockPty()
    hookRunner = makeHookRunner()
    manager = new AgentSessionManager(
      db as unknown as DrizzleDb,
      pty as unknown as PtyManager,
      hookRunner as unknown as HookRunner,
    )
  })

  it('create inserts a record into agent_sessions', async () => {
    const returning = [{ id: 'sess-1', agentId: 'claude', branch: 'feat/x', worktreePath: '/tmp/x', ptySessionId: 'pty-abc', taskId: null, containerId: null, status: 'running', createdAt: '', updatedAt: '' }]
    db.insert = vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(returning) }) })
    const result = await manager.create({ agentId: 'claude', worktreeId: 'wt-1', worktreePath: '/tmp/x', branch: 'feat/x', repoPath: '/repo' })
    expect(db.insert).toHaveBeenCalledOnce()
    expect(result.agentId).toBe('claude')
    expect(pty.create).toHaveBeenCalledOnce()
  })

  it('create spawns PTY with the worktree path as cwd', async () => {
    const returning = [{ id: 'sess-1', agentId: 'claude', branch: 'feat/x', worktreePath: '/tmp/wt', ptySessionId: 'pty-abc', taskId: null, containerId: null, status: 'running', createdAt: '', updatedAt: '' }]
    db.insert = vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(returning) }) })
    await manager.create({ agentId: 'claude', worktreeId: 'wt-1', worktreePath: '/tmp/wt', branch: 'feat/x', repoPath: '/repo' })
    expect((pty.create as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ cwd: '/tmp/wt', command: 'claude' })
  })

  it('list queries all agent_sessions', async () => {
    await manager.list()
    expect(db.select).toHaveBeenCalledOnce()
  })

  it('kill calls pty.kill and updates session status to finished', async () => {
    db.update = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) })
    await manager.kill('sess-1', 'pty-abc')
    expect(pty.kill).toHaveBeenCalledWith('pty-abc')
    expect(db.update).toHaveBeenCalledOnce()
  })
})

describe('AgentSessionManager sandbox integration', () => {
  let db: ReturnType<typeof makeMockDb>
  let pty: ReturnType<typeof makeMockPty>
  let hookRunner: ReturnType<typeof makeHookRunner>
  let sandbox: ReturnType<typeof makeMockSandbox>

  beforeEach(() => {
    db = makeMockDb()
    pty = makeMockPty()
    hookRunner = makeHookRunner()
    sandbox = makeMockSandbox()
  })

  it('create calls sandbox.create and sandbox.start when sandboxImage provided', async () => {
    const returning = [{ id: 'sess-2', agentId: 'claude', branch: 'feat/y', worktreePath: '/tmp/wt', ptySessionId: 'pty-abc', taskId: null, containerId: 'ctr-1', status: 'running', createdAt: '', updatedAt: '' }]
    db.insert = vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(returning) }) })
    const manager = new AgentSessionManager(
      db as unknown as DrizzleDb,
      pty as unknown as PtyManager,
      hookRunner as unknown as HookRunner,
      sandbox as unknown as SandboxManager,
    )
    await manager.create({ agentId: 'claude', worktreeId: 'wt-2', worktreePath: '/tmp/wt', branch: 'feat/y', sandboxImage: 'node:22' })
    expect((sandbox.create as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({ image: 'node:22', worktreePath: '/tmp/wt', branch: 'feat/y' })
    expect((sandbox.start as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('ctr-1')
    expect((pty.create as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ command: 'docker', args: ['exec', '-i', 'ctr-1', 'claude'] })
  })

  it('kill calls sandbox.stop when containerId provided', async () => {
    db.update = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) })
    const manager = new AgentSessionManager(
      db as unknown as DrizzleDb,
      pty as unknown as PtyManager,
      hookRunner as unknown as HookRunner,
      sandbox as unknown as SandboxManager,
    )
    await manager.kill('sess-2', 'pty-abc', 'ctr-1')
    expect((sandbox.stop as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('ctr-1')
  })

  it('kill does not call sandbox.stop when containerId is not provided', async () => {
    db.update = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) })
    const manager = new AgentSessionManager(
      db as unknown as DrizzleDb,
      pty as unknown as PtyManager,
      hookRunner as unknown as HookRunner,
      sandbox as unknown as SandboxManager,
    )
    await manager.kill('sess-2', 'pty-abc')
    expect((sandbox.stop as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled()
  })
})
