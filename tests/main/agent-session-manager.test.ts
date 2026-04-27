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
    isSbxAvailable: vi.fn().mockReturnValue(true),
    create: vi.fn().mockReturnValue({ sandboxName: 'xaide-abc', worktreePath: '/tmp/wt' }),
    stop: vi.fn(),
    remove: vi.fn(),
    runArgs: vi.fn().mockReturnValue({ command: 'sbx', args: ['run', 'claude', '--name', 'xaide-abc'] }),
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

describe('sandbox integration', () => {
  let db: ReturnType<typeof makeMockDb>
  let pty: ReturnType<typeof makeMockPty>
  let hookRunner: ReturnType<typeof makeHookRunner>

  beforeEach(() => {
    db = makeMockDb()
    pty = makeMockPty()
    hookRunner = makeHookRunner()
  })

  it('create uses sbx runArgs PTY when sandboxName provided', async () => {
    const sandboxMock = makeMockSandbox()
    const mgr = new AgentSessionManager(db as unknown as DrizzleDb, pty as unknown as PtyManager, hookRunner as unknown as HookRunner, sandboxMock as any)

    vi.mocked(pty.create).mockReturnValue({ id: 'pty-1' } as any)
    db.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          id: 'sess-1', agentId: 'claude', branch: 'main',
          worktreePath: '/tmp/wt', ptySessionId: 'pty-1',
          containerId: 'xaide-abc', status: 'running',
        }]),
      }),
    } as any)

    const result = await mgr.create({
      agentId: 'claude',
      worktreeId: 'wt-1',
      worktreePath: '/tmp/wt',
      branch: 'main',
      sandboxName: 'xaide-abc',
    })

    expect(sandboxMock.create).toHaveBeenCalledWith({ name: 'xaide-abc', worktreePath: '/tmp/wt' })
    expect(sandboxMock.runArgs).toHaveBeenCalledWith('xaide-abc', 'claude')
    expect(pty.create).toHaveBeenCalledWith(expect.objectContaining({
      command: 'sbx',
      args: ['run', 'claude', '--name', 'xaide-abc'],
    }))
    expect(result.containerId).toBe('xaide-abc')
  })

  it('kill calls sandbox.stop when sandboxName provided', async () => {
    const sandboxMock = makeMockSandbox()
    const mgr = new AgentSessionManager(db as unknown as DrizzleDb, pty as unknown as PtyManager, hookRunner as unknown as HookRunner, sandboxMock as any)

    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    } as any)

    await mgr.kill('sess-1', 'pty-1', 'xaide-abc')

    expect(sandboxMock.stop).toHaveBeenCalledWith('xaide-abc')
  })

  it('kill does not call sandbox.stop when sandboxName is not provided', async () => {
    const sandboxMock = makeMockSandbox()
    const mgr = new AgentSessionManager(db as unknown as DrizzleDb, pty as unknown as PtyManager, hookRunner as unknown as HookRunner, sandboxMock as any)

    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    } as any)

    await mgr.kill('sess-1', 'pty-1')

    expect(sandboxMock.stop).not.toHaveBeenCalled()
  })
})
