import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import type { DrizzleDb } from '../db/schema'
import { tasks } from '../db/schema'
import type { CreateTaskInput, UpdateTaskInput } from '../../preload/ipc-types'

export type Task = typeof tasks.$inferSelect

export class TaskManager {
  constructor(private db: DrizzleDb) {}

  async list(workspaceId: string): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(eq(tasks.workspaceId, workspaceId))
      .orderBy(tasks.createdAt)
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const now = new Date().toISOString()
    const id = randomUUID()
    const rows = await this.db
      .insert(tasks)
      .values({
        id,
        workspaceId: input.workspaceId,
        title: input.title,
        prompt: input.prompt ?? '',
        sourceAdapter: input.sourceAdapter ?? 'manual',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    return rows[0]
  }

  async update(id: string, input: UpdateTaskInput): Promise<Task> {
    const now = new Date().toISOString()
    const rows = await this.db
      .update(tasks)
      .set({ ...input, updatedAt: now })
      .where(eq(tasks.id, id))
      .returning()
    if (rows.length === 0) throw new Error(`Task not found: ${id}`)
    return rows[0]
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.delete(tasks).where(eq(tasks.id, id)).returning()
    if (result.length === 0) throw new Error(`Task not found: ${id}`)
  }
}
