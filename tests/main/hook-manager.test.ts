import { describe, it, expect, beforeEach } from 'vitest'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createDb } from '../../src/main/db/client'
import { dbSchema } from '../../src/main/db/schema'
import { HookManager } from '../../src/main/settings/HookManager'

let manager: HookManager
let workspaceId: string

beforeEach(async () => {
  const raw = createDb(':memory:')
  const db = drizzle(raw, { schema: dbSchema })
  manager = new HookManager(db)
  const ws = await db
    .insert(dbSchema.workspaces)
    .values({ id: 'ws-1', name: 'WS', repoPath: '/tmp', configJson: '{}', sandboxDefaults: '{}', layoutJson: '{}' })
    .returning()
  workspaceId = ws[0].id
})

describe('HookManager', () => {
  it('lists empty when no hooks exist', async () => {
    expect(await manager.list()).toHaveLength(0)
  })

  it('creates a global hook', async () => {
    const hook = await manager.create({ scope: 'global', event: 'agent.start', command: 'echo start' })
    expect(hook.scope).toBe('global')
    expect(hook.event).toBe('agent.start')
    expect(hook.command).toBe('echo start')
    expect(hook.enabled).toBe(true)
  })

  it('list() with workspaceId returns global + workspace hooks', async () => {
    await manager.create({ scope: 'global', event: 'agent.start', command: 'echo global' })
    await manager.create({ scope: 'workspace', workspaceId, event: 'agent.stop', command: 'echo ws' })
    const hooks = await manager.list(workspaceId)
    expect(hooks).toHaveLength(2)
  })

  it('list() without workspaceId returns only global hooks', async () => {
    await manager.create({ scope: 'global', event: 'agent.start', command: 'echo global' })
    await manager.create({ scope: 'workspace', workspaceId, event: 'agent.stop', command: 'echo ws' })
    const hooks = await manager.list()
    expect(hooks).toHaveLength(1)
    expect(hooks[0].scope).toBe('global')
  })

  it('update changes command and enabled', async () => {
    const hook = await manager.create({ scope: 'global', event: 'agent.start', command: 'echo old' })
    const updated = await manager.update(hook.id, { command: 'echo new', enabled: false })
    expect(updated.command).toBe('echo new')
    expect(updated.enabled).toBe(false)
  })

  it('delete removes hook', async () => {
    const hook = await manager.create({ scope: 'global', event: 'agent.start', command: 'echo x' })
    await manager.delete(hook.id)
    expect(await manager.list()).toHaveLength(0)
  })

  it('throws when deleting nonexistent hook', async () => {
    await expect(manager.delete('no-such-id')).rejects.toThrow('Hook not found: no-such-id')
  })
})
