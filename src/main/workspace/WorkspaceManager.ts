import { randomUUID } from 'crypto'
import { existsSync } from 'fs'
import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { workspaces } from '../db/schema'
import * as schema from '../db/schema'
import type { ConfigLoader } from '../config/ConfigLoader'

type DrizzleDb = BetterSQLite3Database<typeof schema>

export type Workspace = typeof workspaces.$inferSelect

export type CreateWorkspaceInput = {
  name: string
  repoPath: string
}

export class WorkspaceManager {
  constructor(
    private db: DrizzleDb,
    private configLoader: ConfigLoader,
  ) {}

  list(): Workspace[] {
    return this.db.select().from(workspaces).all()
  }

  get(id: string): Workspace | null {
    return this.db.select().from(workspaces).where(eq(workspaces.id, id)).get() ?? null
  }

  create(input: CreateWorkspaceInput): Workspace {
    if (!existsSync(input.repoPath)) {
      throw new Error(`Repo path does not exist: ${input.repoPath}`)
    }
    const wsConfig = this.configLoader.loadWorkspace(input.repoPath)
    const now = new Date().toISOString()
    const row = this.db
      .insert(workspaces)
      .values({
        id: randomUUID(),
        name: input.name,
        repoPath: input.repoPath,
        configJson: JSON.stringify(wsConfig),
        sandboxDefaults: JSON.stringify(wsConfig.sandbox ?? {}),
        layoutJson: '{}',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
    if (!row) throw new Error('Failed to create workspace')
    return row
  }

  update(id: string, input: Partial<CreateWorkspaceInput>): Workspace {
    if (!this.get(id)) throw new Error(`Workspace not found: ${id}`)
    if (input.repoPath !== undefined && !existsSync(input.repoPath)) {
      throw new Error(`Repo path does not exist: ${input.repoPath}`)
    }
    const extra: Record<string, unknown> = {}
    if (input.repoPath !== undefined) {
      const wsConfig = this.configLoader.loadWorkspace(input.repoPath)
      extra.configJson = JSON.stringify(wsConfig)
    }
    const row = this.db
      .update(workspaces)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.repoPath !== undefined && { repoPath: input.repoPath }),
        ...extra,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(workspaces.id, id))
      .returning()
      .get()
    if (!row) throw new Error(`Update failed for workspace: ${id}`)
    return row
  }

  delete(id: string): void {
    if (!this.get(id)) throw new Error(`Workspace not found: ${id}`)
    this.db.delete(workspaces).where(eq(workspaces.id, id)).run()
  }

  saveLayout(id: string, layoutJson: string): void {
    if (!this.get(id)) throw new Error(`Workspace not found: ${id}`)
    this.db
      .update(workspaces)
      .set({ layoutJson, updatedAt: new Date().toISOString() })
      .where(eq(workspaces.id, id))
      .run()
  }
}
