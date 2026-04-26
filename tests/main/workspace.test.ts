import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createDb } from '../../src/main/db/client'
import { ConfigLoader } from '../../src/main/config/ConfigLoader'
import { WorkspaceManager } from '../../src/main/workspace/WorkspaceManager'
import * as schema from '../../src/main/db/schema'

function makeManager() {
  const sqlite = createDb(':memory:')
  const db = drizzle(sqlite, { schema })
  const configLoader = new ConfigLoader('/nonexistent/config.yaml')
  return new WorkspaceManager(db, configLoader)
}

describe('WorkspaceManager', () => {
  let repoPath: string

  beforeEach(() => {
    repoPath = mkdtempSync(join(tmpdir(), 'xaide-ws-'))
  })

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true })
  })

  it('starts with an empty list', () => {
    expect(makeManager().list()).toEqual([])
  })

  it('creates a workspace and returns it with all fields', () => {
    const ws = makeManager().create({ name: 'My App', repoPath })
    expect(ws.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(ws.name).toBe('My App')
    expect(ws.repoPath).toBe(repoPath)
    expect(ws.createdAt).toBeTruthy()
  })

  it('lists created workspaces', () => {
    const mgr = makeManager()
    mgr.create({ name: 'First', repoPath })
    mgr.create({ name: 'Second', repoPath })
    expect(mgr.list()).toHaveLength(2)
  })

  it('gets a workspace by id', () => {
    const mgr = makeManager()
    const created = mgr.create({ name: 'Test', repoPath })
    expect(mgr.get(created.id)?.name).toBe('Test')
  })

  it('returns null for a nonexistent id', () => {
    expect(makeManager().get('no-such-id')).toBeNull()
  })

  it('updates a workspace name', () => {
    const mgr = makeManager()
    const ws = mgr.create({ name: 'Old', repoPath })
    expect(mgr.update(ws.id, { name: 'New' }).name).toBe('New')
  })

  it('throws when updating a nonexistent workspace', () => {
    expect(() => makeManager().update('bad-id', { name: 'x' })).toThrow(
      'Workspace not found',
    )
  })

  it('deletes a workspace', () => {
    const mgr = makeManager()
    const ws = mgr.create({ name: 'To Delete', repoPath })
    mgr.delete(ws.id)
    expect(mgr.list()).toHaveLength(0)
  })

  it('throws when repo path does not exist', () => {
    expect(() =>
      makeManager().create({ name: 'Bad', repoPath: '/nonexistent/path/xyz' }),
    ).toThrow('Repo path does not exist')
  })
})
