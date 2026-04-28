import { randomUUID } from 'node:crypto'
import { eq, isNull, or } from 'drizzle-orm'
import { execSync } from 'node:child_process'
import type { DrizzleDb } from '../db/schema'
import { hooks } from '../db/schema'

export type Hook = typeof hooks.$inferSelect
export type HookEvent = 'agent.start' | 'agent.stop' | 'agent.commit' | 'agent.error'

export class HookManager {
  constructor(private db: DrizzleDb) {}

  async list(workspaceId?: string): Promise<Hook[]> {
    if (workspaceId) {
      return this.db
        .select()
        .from(hooks)
        .where(or(isNull(hooks.workspaceId), eq(hooks.workspaceId, workspaceId)))
    }
    return this.db.select().from(hooks).where(isNull(hooks.workspaceId))
  }

  async create(input: {
    scope: 'global' | 'workspace'
    workspaceId?: string
    event: HookEvent
    command: string
  }): Promise<Hook> {
    const rows = await this.db
      .insert(hooks)
      .values({
        id: randomUUID(),
        scope: input.scope,
        workspaceId: input.workspaceId ?? null,
        event: input.event,
        command: input.command,
        enabled: true,
        createdAt: new Date().toISOString(),
      })
      .returning()
    return rows[0]
  }

  async update(id: string, input: { command?: string; enabled?: boolean }): Promise<Hook> {
    const rows = await this.db
      .update(hooks)
      .set(input)
      .where(eq(hooks.id, id))
      .returning()
    if (rows.length === 0) throw new Error(`Hook not found: ${id}`)
    return rows[0]
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.delete(hooks).where(eq(hooks.id, id)).returning()
    if (result.length === 0) throw new Error(`Hook not found: ${id}`)
  }

  async fire(event: HookEvent, workspaceId?: string): Promise<void> {
    const applicable = (await this.list(workspaceId)).filter(
      (h) => h.event === event && h.enabled,
    )
    for (const hook of applicable) {
      try {
        execSync(hook.command, { stdio: 'ignore', timeout: 10_000 })
      } catch {
        // hook failure is non-fatal
      }
    }
  }
}
