import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AgentSessionManager } from '../../src/main/agent/AgentSessionManager'
import type { DrizzleDb } from '../../src/main/db/schema'
import type { PtyManager } from '../../src/main/pty/PtyManager'
import type { HookRunner } from '../../src/main/worktree/HookRunner'

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
