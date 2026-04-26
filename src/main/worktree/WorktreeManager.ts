import { randomUUID } from 'crypto'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import simpleGit from 'simple-git'
import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { worktrees } from '../db/schema'
import * as schema from '../db/schema'

type DrizzleDb = BetterSQLite3Database<typeof schema>

export type Worktree = typeof worktrees.$inferSelect

export type CreateWorktreeInput = {
  workspaceId: string
  repoPath: string
  label: string
  /** Explicit branch name. If omitted, auto-generated as `xaide/{slug}-{8charId}`.
   *  Pass this when coordinating with SandboxManager (Docker phase) so the
   *  container bind-mount and the worktree share the same branch identity. */
  branch?: string
  /** Base branch/commit to fork from. Defaults to 'HEAD'. */
  baseBranch?: string
}

export type DeleteWorktreeInput = {
  worktreeId: string
  /** Also delete the git branch after removing the worktree. Default: false. */
  deleteBranch?: boolean
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function worktreePath(workspaceId: string, branchSlug: string): string {
  return join(homedir(), '.xaide', 'worktrees', workspaceId, branchSlug)
}

export class WorktreeManager {
  constructor(private db: DrizzleDb) {}

  async create(input: CreateWorktreeInput): Promise<Worktree> {
    const { workspaceId, repoPath, label, baseBranch = 'HEAD' } = input
    const shortId = randomUUID().slice(0, 8)
    const branch = input.branch ?? `xaide/${slugify(label)}-${shortId}`
    const branchSlug = branch.replace(/\//g, '-')
    const wtPath = worktreePath(workspaceId, branchSlug)

    mkdirSync(wtPath, { recursive: true })
    const git = simpleGit(repoPath)
    await git.raw(['worktree', 'add', '-b', branch, wtPath, baseBranch])

    const now = new Date().toISOString()
    const row = this.db
      .insert(worktrees)
      .values({
        id: randomUUID(),
        workspaceId,
        repoPath,
        branch,
        baseBranch,
        worktreePath: wtPath,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    if (!row) throw new Error('Failed to persist worktree record')
    return row
  }

  list(workspaceId: string): Worktree[] {
    return this.db
      .select()
      .from(worktrees)
      .where(eq(worktrees.workspaceId, workspaceId))
      .all()
  }

  get(id: string): Worktree | null {
    return (
      this.db.select().from(worktrees).where(eq(worktrees.id, id)).get() ?? null
    )
  }

  async delete(input: DeleteWorktreeInput): Promise<void> {
    const { worktreeId, deleteBranch = false } = input
    const record = this.get(worktreeId)
    if (!record) throw new Error(`Worktree not found: ${worktreeId}`)

    const git = simpleGit(record.repoPath)

    try {
      await git.raw(['worktree', 'remove', '--force', record.worktreePath])
    } catch {
      // Worktree path may already be gone — still clean up DB record
      rmSync(record.worktreePath, { recursive: true, force: true })
    }

    if (deleteBranch) {
      try {
        await git.deleteLocalBranch(record.branch, true)
      } catch {
        // Branch may not exist; ignore
      }
    }

    this.db.delete(worktrees).where(eq(worktrees.id, worktreeId)).run()
  }
}