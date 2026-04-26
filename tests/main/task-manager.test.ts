import { describe, it, expect, beforeEach } from 'vitest'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createDb } from '../../src/main/db/client'
import { dbSchema } from '../../src/main/db/schema'
import { TaskManager } from '../../src/main/task/TaskManager'

let manager: TaskManager
let workspaceId: string

beforeEach(async () => {
  const raw = createDb(':memory:')
  const db = drizzle(raw, { schema: dbSchema })
  manager = new TaskManager(db)

  const { workspaces } = dbSchema
  const ws = await db.insert(workspaces).values({
    id: 'ws-1',
    name: 'Test WS',
    repoPath: '/tmp/ws',
    configJson: '{}',
    sandboxDefaults: '{}',
    layoutJson: '{}',
  }).returning()
  workspaceId = ws[0].id
})

describe('TaskManager', () => {
  it('creates a task and returns it', async () => {
    const task = await manager.create({ workspaceId, title: 'Fix bug', prompt: 'do it' })
    expect(task.id).toBeDefined()
    expect(task.title).toBe('Fix bug')
    expect(task.prompt).toBe('do it')
    expect(task.status).toBe('pending')
    expect(task.sourceAdapter).toBe('manual')
  })

  it('lists tasks for a workspace', async () => {
    await manager.create({ workspaceId, title: 'Task A' })
    await manager.create({ workspaceId, title: 'Task B' })
    const list = await manager.list(workspaceId)
    expect(list).toHaveLength(2)
    expect(list.map((t) => t.title)).toEqual(expect.arrayContaining(['Task A', 'Task B']))
  })

  it('updates task status', async () => {
    const task = await manager.create({ workspaceId, title: 'Task' })
    const updated = await manager.update(task.id, { status: 'in_progress' })
    expect(updated.status).toBe('in_progress')
  })

  it('updates task title and prompt', async () => {
    const task = await manager.create({ workspaceId, title: 'Old' })
    const updated = await manager.update(task.id, { title: 'New', prompt: 'new prompt' })
    expect(updated.title).toBe('New')
    expect(updated.prompt).toBe('new prompt')
  })

  it('deletes a task', async () => {
    const task = await manager.create({ workspaceId, title: 'Delete me' })
    await manager.delete(task.id)
    const list = await manager.list(workspaceId)
    expect(list).toHaveLength(0)
  })
})
