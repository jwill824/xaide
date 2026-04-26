import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { execSync } from 'child_process'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createDb } from '../../src/main/db/client'
import { WorktreeManager } from '../../src/main/worktree/WorktreeManager'
import * as schema from '../../src/main/db/schema'

function makeGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'xaide-repo-'))
  execSync('git init', { cwd: dir })
  execSync('git config user.email "test@test.com"', { cwd: dir })
  execSync('git config user.name "Test"', { cwd: dir })
  writeFileSync(join(dir, 'README.md'), '# test')
  execSync('git add .', { cwd: dir })
  execSync('git commit -m "init"', { cwd: dir })
  return dir
}

function makeManager(workspaceId: string) {
  const sqlite = createDb(':memory:')
  const db = drizzle(sqlite, { schema })
  
  // Create a workspace for our tests (foreign key requirement)
  db.insert(schema.workspaces).values({
    id: workspaceId,
    name: 'Test Workspace',
    repoPath: '/tmp/test-repo',
  }).run()
  
  return new WorktreeManager(db)
}

describe('WorktreeManager', () => {
  let repoPath: string
  let workspaceId: string

  beforeEach(() => {
    repoPath = makeGitRepo()
    workspaceId = `ws-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  })

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true })
    // Clean up any test worktrees that may have been created
    try {
      rmSync(`/Users/jeff.williams/.xaide/worktrees/${workspaceId}`, { recursive: true, force: true })
    } catch {
      // Directory may not exist, ignore
    }
  })

  it('starts with an empty list for a workspace', () => {
    expect(makeManager(workspaceId).list(workspaceId)).toEqual([])
  })

  it('creates a worktree and returns the record', async () => {
    const mgr = makeManager(workspaceId)
    const wt = await mgr.create({ workspaceId, repoPath, label: 'auth-flow' })
    expect(wt.workspaceId).toBe(workspaceId)
    expect(wt.branch).toMatch(/^xaide\/auth-flow-/)
    expect(wt.status).toBe('active')
    expect(wt.repoPath).toBe(repoPath)
    rmSync(wt.worktreePath, { recursive: true, force: true })
  })

  it('accepts an explicit branch name (Docker integration path)', async () => {
    const mgr = makeManager(workspaceId)
    const wt = await mgr.create({
      workspaceId,
      repoPath,
      label: 'task-1',
      branch: 'feat/task-1-claude',
    })
    expect(wt.branch).toBe('feat/task-1-claude')
    rmSync(wt.worktreePath, { recursive: true, force: true })
  })

  it('lists created worktrees for a workspace', async () => {
    const mgr = makeManager(workspaceId)
    const wt = await mgr.create({ workspaceId, repoPath, label: 'feature-x' })
    const list = mgr.list(workspaceId)
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(wt.id)
    rmSync(wt.worktreePath, { recursive: true, force: true })
  })

  it('deletes a worktree and removes its DB record', async () => {
    const mgr = makeManager(workspaceId)
    const wt = await mgr.create({ workspaceId, repoPath, label: 'delete-me' })
    await mgr.delete({ worktreeId: wt.id })
    expect(mgr.list(workspaceId)).toHaveLength(0)
  })

  it('throws when deleting a nonexistent worktree', async () => {
    await expect(
      makeManager(workspaceId).delete({ worktreeId: 'no-such-id' }),
    ).rejects.toThrow('Worktree not found')
  })

  it('get returns null for unknown id', () => {
    expect(makeManager(workspaceId).get('missing')).toBeNull()
  })
})