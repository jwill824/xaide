import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  repoPath: text('repo_path').notNull(),
  configJson: text('config_json').notNull().default('{}'),
  sandboxDefaults: text('sandbox_defaults').notNull().default('{}'),
  layoutJson: text('layout_json').notNull().default('{}'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  sourceAdapter: text('source_adapter').notNull(),
  methodologyAdapter: text('methodology_adapter'),
  prompt: text('prompt').notNull().default(''),
  status: text('status', { enum: ['pending', 'in_progress', 'done', 'blocked'] })
    .notNull()
    .default('pending'),
  baseCommit: text('base_commit'),
  parallelGroupId: text('parallel_group_id'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

export const agentSessions = sqliteTable('agent_sessions', {
  id: text('id').primaryKey(),
  taskId: text('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  agentId: text('agent_id').notNull(),
  branch: text('branch').notNull(),
  worktreePath: text('worktree_path').notNull(),
  containerId: text('container_id'),
  status: text('status', {
    enum: ['pending', 'running', 'idle', 'finished', 'failed'],
  })
    .notNull()
    .default('pending'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
})

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => agentSessions.id, {
    onDelete: 'set null',
  }),
  type: text('type').notNull(),
  payload: text('payload').notNull().default('{}'),
  timestamp: text('timestamp').notNull().default(sql`(datetime('now'))`),
})

export const mcpServers = sqliteTable('mcp_servers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  scope: text('scope', { enum: ['global', 'workspace'] })
    .notNull()
    .default('global'),
  configJson: text('config_json').notNull().default('{}'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
})

export const plugins = sqliteTable('plugins', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  version: text('version').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  configJson: text('config_json').notNull().default('{}'),
  installedAt: text('installed_at').notNull().default(sql`(datetime('now'))`),
})
