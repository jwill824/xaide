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
    return this.db
      .insert(workspaces)
      .values({
        id: randomUUID(),
        name: input.name,
        repoPath: input.repoPath,
        configJson: JSON.stringify(wsConfig),
        sandboxDefaults: '{}',
        layoutJson: '{}',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get()
  }

  update(id: string, input: Partial<CreateWorkspaceInput>): Workspace {
    if (!this.get(id)) throw new Error(`Workspace not found: ${id}`)
    return this.db
      .update(workspaces)
      .set({ ...input, updatedAt: new Date().toISOString() })
      .where(eq(workspaces.id, id))
      .returning()
      .get()
  }

  delete(id: string): void {
    this.db.delete(workspaces).where(eq(workspaces.id, id)).run()
  }
}
