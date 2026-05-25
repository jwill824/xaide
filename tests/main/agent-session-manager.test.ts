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
    create: vi.fn().mockReturnValue({ id: 'pty-abc', process: { onData: vi.fn(), onExit: vi.fn() } }),
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
    const returning = [{ id: 'sess-1', agentId: 'claude', branch: 'feat/x', worktreePath: '/tmp/x', ptySessionId: 'pty-abc', taskId: null, containerId: null, status: 'pending', createdAt: '', updatedAt: '' }]
    db.insert = vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue(returning) }) })
    const result = await manager.create({ agentId: 'claude', worktreeId: 'wt-1', worktreePath: '/tmp/x', branch: 'feat/x', repoPath: '/repo' })
    expect(db.insert).toHaveBeenCalledOnce()
    expect(result.agentId).toBe('claude')
    // PTY is not spawned in create() — only in spawn() after terminal sizing
    expect(pty.create).not.toHaveBeenCalled()
  })

  it('spawn launches PTY with the worktree path as cwd', async () => {
    // The manager will generate a ptySessionId internally; we need to mock the create properly
    let capturedPtySessionId: string | null = null
    db.insert = vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((values: any) => ({
        returning: vi.fn().mockImplementation(() => {
          capturedPtySessionId = values.ptySessionId
          return Promise.resolve([{
            id: 'sess-1',
            agentId: values.agentId,
            branch: values.branch,
            worktreePath: values.worktreePath,
            ptySessionId: values.ptySessionId,
            taskId: values.taskId,
            containerId: values.containerId,
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }])
        }),
      })),
    }))
    
    pty.create = vi.fn().mockReturnValue({ process: { onData: vi.fn(), onExit: vi.fn() } })
    db.update = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) })
    
    await manager.create({ agentId: 'claude', worktreeId: 'wt-1', worktreePath: '/tmp/wt', branch: 'feat/x', repoPath: '/repo' })
    
    // Now spawn with the actual generated ptySessionId
    if (capturedPtySessionId) {
      await manager.spawn(capturedPtySessionId, 80, 24)
      
      expect(pty.create).toHaveBeenCalledOnce()
      expect(pty.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd: '/tmp/wt',
          command: 'claude',
          cols: 80,
          rows: 24,
        })
      )
    }
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

  it('create prepares sbx runArgs for spawn', async () => {
    const sandboxMock = makeMockSandbox()
    const mgr = new AgentSessionManager(db as unknown as DrizzleDb, pty as unknown as PtyManager, hookRunner as unknown as HookRunner, sandboxMock as any)

    let capturedPtySessionId: string | null = null
    db.insert = vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((values: any) => ({
        returning: vi.fn().mockImplementation(() => {
          capturedPtySessionId = values.ptySessionId
          return Promise.resolve([{
            id: 'sess-1',
            agentId: values.agentId,
            branch: values.branch,
            worktreePath: values.worktreePath,
            ptySessionId: values.ptySessionId,
            taskId: values.taskId,
            containerId: values.containerId,
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }])
        }),
      })),
    }))

    const result = await mgr.create({
      agentId: 'claude',
      worktreeId: 'wt-1',
      worktreePath: '/tmp/wt',
      branch: 'main',
      sandboxName: 'xaide-abc',
    })

    expect(sandboxMock.create).toHaveBeenCalledWith({ name: 'xaide-abc', worktreePath: '/tmp/wt' })
    expect(result.containerId).toBe('xaide-abc')

    // Now spawn and verify PTY is created with sbx args
    pty.create = vi.fn().mockReturnValue({ process: { onData: vi.fn(), onExit: vi.fn() } })
    db.update = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    } as any)

    if (capturedPtySessionId) {
      await mgr.spawn(capturedPtySessionId, 80, 24)

      expect(sandboxMock.runArgs).toHaveBeenCalledWith('xaide-abc', 'claude')
      expect(pty.create).toHaveBeenCalledWith(expect.objectContaining({
        command: 'sbx',
        args: ['run', 'claude', '--name', 'xaide-abc'],
      }))
    }
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
