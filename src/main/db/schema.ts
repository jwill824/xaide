import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
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

export const tasks = sqliteTable(
  'tasks',
  {
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
  },
  (t) => [index('idx_tasks_workspace_id').on(t.workspaceId)],
)

export const agentSessions = sqliteTable(
  'agent_sessions',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    agentId: text('agent_id').notNull(),
    branch: text('branch').notNull(),
    worktreePath: text('worktree_path').notNull(),
    ptySessionId: text('pty_session_id'),
    containerId: text('container_id'),
    status: text('status', {
      enum: ['pending', 'running', 'idle', 'finished', 'failed'],
    })
      .notNull()
      .default('pending'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [index('idx_agent_sessions_task_id').on(t.taskId)],
)

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').references(() => agentSessions.id, {
      onDelete: 'set null',
    }),
    type: text('type').notNull(),
    payload: text('payload').notNull().default('{}'),
    timestamp: text('timestamp').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('idx_events_session_id').on(t.sessionId)],
)

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

export const worktrees = sqliteTable(
  'worktrees',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoPath: text('repo_path').notNull(),
    branch: text('branch').notNull(),
    baseBranch: text('base_branch').notNull().default('HEAD'),
    worktreePath: text('worktree_path').notNull(),
    status: text('status', { enum: ['active', 'merged', 'discarded'] })
      .notNull()
      .default('active'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('idx_worktrees_workspace_id').on(t.workspaceId)],
)

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

export const agentConfigs = sqliteTable(
  'agent_configs',
  {
    id: text('id').primaryKey(),
    scope: text('scope', { enum: ['global', 'workspace'] }).notNull().default('global'),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    agentType: text('agent_type', { enum: ['claude', 'copilot', 'all'] }).notNull().default('all'),
    systemPromptAdditions: text('system_prompt_additions').notNull().default(''),
    configJson: text('config_json').notNull().default('{}'),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
    updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('idx_agent_configs_workspace_id').on(t.workspaceId)],
)

export const hooks = sqliteTable(
  'hooks',
  {
    id: text('id').primaryKey(),
    scope: text('scope', { enum: ['global', 'workspace'] }).notNull().default('global'),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    event: text('event', {
      enum: ['agent.start', 'agent.stop', 'agent.commit', 'agent.error'],
    }).notNull(),
    command: text('command').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  },
  (t) => [index('idx_hooks_workspace_id').on(t.workspaceId)],
)

export const dbSchema = {
  workspaces,
  tasks,
  agentSessions,
  events,
  mcpServers,
  plugins,
  worktrees,
  agentConfigs,
  hooks,
}
export type DrizzleDb = BetterSQLite3Database<typeof dbSchema>
