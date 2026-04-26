import { eq } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import type { DrizzleDb } from '../db/schema'
import { tasks } from '../db/schema'

export interface Task {
  id: string
  workspaceId: string
  title: string
  sourceAdapter: string
  methodologyAdapter: string | null
  prompt: string
  status: 'pending' | 'in_progress' | 'done' | 'blocked'
  baseCommit: string | null
  parallelGroupId: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateTaskInput {
  workspaceId: string
  title: string
  prompt?: string
  sourceAdapter?: string
}

export interface UpdateTaskInput {
  title?: string
  prompt?: string
  status?: 'pending' | 'in_progress' | 'done' | 'blocked'
}

export class TaskManager {
  constructor(private db: DrizzleDb) {}

  async list(workspaceId: string): Promise<Task[]> {
    return this.db
      .select()
      .from(tasks)
      .where(eq(tasks.workspaceId, workspaceId))
      .orderBy(tasks.createdAt) as Promise<Task[]>
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
    return rows[0] as Task
  }

  async update(id: string, input: UpdateTaskInput): Promise<Task> {
    const now = new Date().toISOString()
    const rows = await this.db
      .update(tasks)
      .set({ ...input, updatedAt: now })
      .where(eq(tasks.id, id))
      .returning()
    if (rows.length === 0) throw new Error(`Task not found: ${id}`)
    return rows[0] as Task
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(tasks).where(eq(tasks.id, id))
  }
}
