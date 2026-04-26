import { describe, it, expect } from 'vitest'
import { createDb } from '../../src/main/db/client'

describe('createDb', () => {
  it('creates all six required tables', () => {
    const db = createDb(':memory:')
    const rows = db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type='table' AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all() as Array<{ name: string }>
    const names = rows.map((r) => r.name)
    expect(names).toContain('workspaces')
    expect(names).toContain('tasks')
    expect(names).toContain('agent_sessions')
    expect(names).toContain('events')
    expect(names).toContain('mcp_servers')
    expect(names).toContain('plugins')
  })

  it('enforces the foreign key constraint from tasks to workspaces', () => {
    const db = createDb(':memory:')
    expect(() => {
      db.prepare(
        `INSERT INTO tasks (id, workspace_id, title, source_adapter)
         VALUES ('t1', 'nonexistent-ws', 'Task', 'markdown')`,
      ).run()
    }).toThrow()
  })

  it('cascades deletes from workspaces to tasks', () => {
    const db = createDb(':memory:')
    db.prepare(
      `INSERT INTO workspaces (id, name, repo_path) VALUES ('ws1', 'My WS', '/tmp')`,
    ).run()
    db.prepare(
      `INSERT INTO tasks (id, workspace_id, title, source_adapter)
       VALUES ('t1', 'ws1', 'Task 1', 'markdown')`,
    ).run()
    db.prepare(`DELETE FROM workspaces WHERE id = 'ws1'`).run()
    const tasks = db.prepare(`SELECT * FROM tasks WHERE id = 't1'`).all()
    expect(tasks).toHaveLength(0)
  })

  it('returns separate databases for separate calls', () => {
    const db1 = createDb(':memory:')
    const db2 = createDb(':memory:')
    db1.prepare(
      `INSERT INTO workspaces (id, name, repo_path) VALUES ('ws1', 'WS1', '/tmp')`,
    ).run()
    const rows = db2.prepare(`SELECT * FROM workspaces`).all()
    expect(rows).toHaveLength(0)
  })
})
